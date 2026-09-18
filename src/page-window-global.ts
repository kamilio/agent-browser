import { AgentBrowserError } from "./errors.js";
import type {
	ReleasedContext,
	ReleasedHostDefinition,
} from "./safejs-extension-types.js";

const bridgeName = "__agentBrowserWindowGlobal";
const aliases = ["window", "self", "top", "parent"];

export class PageWindowGlobal {
	readonly names: readonly string[];
	readonly source = `(() => {
		if (this !== globalThis) throw new Error("Classic Script global required");
		const bridge = ${bridgeName};
		const nativeWindow = bridge.window;
		bridge.bind(globalThis);
		for (const name of bridge.names) {
			if (bridge.aliases.includes(name)) continue;
			const descriptor = bridge.methods.includes(name)
				? { configurable: true, enumerable: true, writable: true, value: nativeWindow[name] }
				: { configurable: true, enumerable: true, get: bridge.read.bind(undefined, name) };
			if (bridge.writable.includes(name)) descriptor.set = bridge.write.bind(undefined, name);
			Object.defineProperty(globalThis, name, descriptor);
		}
		for (const name of bridge.aliases) {
			Object.defineProperty(globalThis, name, {
				value: globalThis, writable: true, configurable: true, enumerable: true
			});
		}
	})();`;
	private readonly definitions = new WeakMap<object, ReleasedHostDefinition>();
	private window?: object;
	private reference?: unknown;
	private bound = false;
	private installed = false;

	get initialized() {
		return this.bound;
	}

	constructor(names: readonly string[]) {
		if (names.includes(bridgeName))
			throw new AgentBrowserError("invalid-input", "Reserved window global");
		this.names = [
			...names.filter((name) => !aliases.includes(name)),
			bridgeName,
		];
	}

	map(value: unknown): unknown {
		return this.bound && value === this.window ? this.reference : value;
	}

	createHostObject(owner: ReleasedContext, definition: ReleasedHostDefinition) {
		const properties = definition.properties;
		const object = owner.createHostObject({
			...definition,
			...(properties
				? {
						properties: Object.fromEntries(
							Object.entries(properties).map(([name, property]) => [
								name,
								{
									...property,
									...(property.get
										? { get: () => this.map(property.get?.()) }
										: {}),
								},
							]),
						),
					}
				: {}),
		});
		this.definitions.set(object, definition);
		return object;
	}

	install(owner: ReleasedContext, globals: Record<string, unknown>) {
		if (this.installed)
			throw new AgentBrowserError(
				"invalid-input",
				"Window bindings already installed",
			);
		const window = globals.window;
		if (!window || typeof window !== "object" || globals.self !== window)
			throw new AgentBrowserError(
				"unsupported",
				"Native window bindings required",
			);
		const definition = this.definitions.get(window);
		if (!definition)
			throw new AgentBrowserError(
				"unsupported",
				"Native window definition missing",
			);
		this.window = window;
		this.installed = true;
		const names = [
			...Object.keys(definition.properties ?? {}),
			...Object.keys(definition.methods ?? {}),
		];
		const writable = Object.entries(definition.properties ?? {})
			.filter(([, property]) => property.set !== undefined)
			.map(([name]) => name);
		const bind = owner.retainGuestArguments((reference) => {
			if (this.bound) {
				owner.releaseGuestReference(reference);
				throw new AgentBrowserError(
					"invalid-input",
					"Window already initialized",
				);
			}
			this.reference = reference;
			this.bound = true;
		}, 0);
		owner.onCleanup(() => {
			this.bound = false;
			this.reference = undefined;
			this.window = undefined;
		});
		return {
			...Object.fromEntries(
				Object.entries(globals).filter(([name]) => !aliases.includes(name)),
			),
			[bridgeName]: owner.createHostObject({
				properties: {
					window: { get: () => window },
					names: { get: () => names },
					aliases: { get: () => aliases },
					writable: { get: () => writable },
					methods: { get: () => Object.keys(definition.methods ?? {}) },
				},
				methods: {
					bind,
					read: (name) => {
						if (
							typeof name !== "string" ||
							!Object.hasOwn(definition.properties ?? {}, name)
						)
							throw new AgentBrowserError(
								"invalid-input",
								"Unknown window property",
							);
						return this.map(definition.properties?.[name].get?.());
					},
					write: (name, value) => {
						if (typeof name !== "string" || !writable.includes(name))
							throw new AgentBrowserError(
								"invalid-input",
								"Read-only window property",
							);
						definition.properties?.[name].set?.(value);
					},
				},
			}),
		};
	}
}
