import { documentBaseUrl, urlFragment } from "./document-url.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { PageHistoryPort } from "./page-history.js";
import {
	type ScriptHostObjectDefinition,
	type ScriptHostObjectFactory,
	domString,
} from "./script-dom.js";

export class ScriptLocation {
	readonly object: object;
	private closed = false;
	private readonly unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		factory: ScriptHostObjectFactory,
		private readonly port?: Pick<PageHistoryPort, "navigate" | "traverse">,
	) {
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> =
			{};
		for (const name of [
			"href",
			"origin",
			"protocol",
			"host",
			"hostname",
			"port",
			"pathname",
			"search",
			"hash",
		] as const)
			properties[name] = {
				get: () => this.url()[name],
				...(name === "origin"
					? {}
					: {
							set: (value: unknown) => {
								if (name === "href") return this.navigate(value);
								this.requirePort();
								const target = this.url();
								const text = domString(value);
								if (name === "hash") {
									target.hash = text.startsWith("#") ? text : `#${text}`;
									if (urlFragment(this.url()) === urlFragment(target)) return;
								} else target[name] = text;
								this.navigate(target.href);
							},
						}),
			};
		this.object = factory.createHostObject({
			properties,
			methods: {
				toString: () => this.url().href,
				assign: (...args) => this.assign(args, false),
				replace: (...args) => this.assign(args, true),
				reload: () => this.requirePort().traverse(0),
			},
		});
		this.unregisterClose = tree.onClose(() => this.close());
	}

	navigate(value: unknown, replace = false) {
		const port = this.requirePort();
		const text = domString(value);
		if (text.length > 16_384)
			throw new AgentBrowserError(
				"resource-limit",
				"Location URL limit exceeded",
			);
		let target: URL;
		try {
			target = new URL(text, documentBaseUrl(this.tree));
		} catch {
			throw new AgentBrowserError("invalid-input", "Invalid Location URL");
		}
		port.navigate(target.href, replace);
	}

	private assign(args: readonly unknown[], replace: boolean) {
		this.requirePort();
		if (!args.length)
			throw new AgentBrowserError(
				"invalid-input",
				"Location navigation requires a URL",
			);
		this.navigate(args[0], replace);
	}

	private requirePort() {
		this.ensureOpen();
		if (!this.port)
			throw new AgentBrowserError(
				"unsupported",
				"Page Location navigation is not implemented",
			);
		return this.port;
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
	}

	private url() {
		this.ensureOpen();
		return new URL(this.tree.url);
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page Location is closed");
		this.tree.get(this.tree.root);
	}
}
