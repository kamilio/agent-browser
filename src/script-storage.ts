import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { PageStoragePort } from "./page-storage.js";
import { type ScriptHostObjectFactory, domString } from "./script-dom.js";

export class ScriptStorage {
	readonly localStorage: object;
	readonly sessionStorage: object;
	private closed = false;
	private readonly unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		factory: ScriptHostObjectFactory,
		private readonly port: PageStoragePort,
	) {
		const create = (kind: "local" | "session") =>
			factory.createHostObject({
				properties: { length: { get: () => this.area(kind).length } },
				methods: {
					key: (...args) => {
						this.arguments(args, 1);
						const value = args[0];
						if (
							value !== null &&
							["object", "function", "symbol", "bigint"].includes(typeof value)
						)
							throw new AgentBrowserError(
								"unsupported",
								"Storage key index requires a primitive number conversion",
							);
						const number = Number(value);
						const index = Number.isFinite(number)
							? ((Math.trunc(number) % 4294967296) + 4294967296) % 4294967296
							: 0;
						return this.area(kind).key(index);
					},
					getItem: (...args) => {
						this.arguments(args, 1);
						return this.area(kind).getItem(domString(args[0]));
					},
					setItem: (...args) => {
						this.arguments(args, 2);
						this.area(kind).setItem(domString(args[0]), domString(args[1]));
					},
					removeItem: (...args) => {
						this.arguments(args, 1);
						this.area(kind).removeItem(domString(args[0]));
					},
					clear: () => this.area(kind).clear(),
				},
			});
		this.localStorage = create("local");
		this.sessionStorage = create("session");
		this.unregisterClose = tree.onClose(() => this.close());
	}

	readCookie() {
		this.ensureOpen();
		return this.port.readCookie();
	}

	writeCookie(value: unknown) {
		this.ensureOpen();
		this.port.writeCookie(domString(value));
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
	}

	private arguments(args: readonly unknown[], count: number) {
		this.ensureOpen();
		if (args.length < count)
			throw new AgentBrowserError(
				"invalid-input",
				"Storage method requires more arguments",
			);
	}

	private area(kind: "local" | "session") {
		this.ensureOpen();
		return this.port.area(kind);
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page storage is closed");
		this.tree.get(this.tree.root);
	}
}
