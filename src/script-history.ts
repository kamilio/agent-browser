import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { HistoryValue } from "./history.js";
import type { PageHistoryPort } from "./page-history.js";
import { type ScriptHostObjectFactory, domString } from "./script-dom.js";

export class ScriptHistory {
	readonly object: object;
	private closed = false;
	private readonly unregisterClose: () => unknown;
	constructor(
		private readonly tree: DocumentTree,
		factory: ScriptHostObjectFactory,
		private readonly port: PageHistoryPort,
	) {
		this.object = factory.createHostObject({
			properties: {
				length: { get: () => this.snapshot().length },
				state: { get: () => this.snapshot().state },
			},
			methods: {
				pushState: (...args) => this.update(args, false),
				replaceState: (...args) => this.update(args, true),
				go: (delta) => this.traverse(delta),
				back: () => this.traverse(-1),
				forward: () => this.traverse(1),
			},
		});
		this.unregisterClose = tree.onClose(() => this.close());
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
	}
	private snapshot() {
		this.ensureOpen();
		return this.port.snapshot();
	}
	private update(args: readonly unknown[], replace: boolean) {
		this.ensureOpen();
		if (args.length < 2)
			throw new AgentBrowserError(
				"invalid-input",
				"History state methods require data and unused arguments",
			);
		domString(args[1]);
		const url =
			args[2] == null ? (args[2] as undefined | null) : domString(args[2]);
		if (replace) this.port.replaceState(args[0] as HistoryValue, url);
		else this.port.pushState(args[0] as HistoryValue, url);
	}
	private traverse(value: unknown) {
		this.ensureOpen();
		if (
			value !== null &&
			["object", "function", "symbol", "bigint"].includes(typeof value)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Object-to-history-delta conversion is not implemented",
			);
		const number = Number(value);
		const modulo = Number.isFinite(number)
			? ((Math.trunc(number) % 4294967296) + 4294967296) % 4294967296
			: 0;
		this.port.traverse(modulo >= 2147483648 ? modulo - 4294967296 : modulo);
	}
	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page History is closed");
		this.tree.get(this.tree.root);
	}
}
