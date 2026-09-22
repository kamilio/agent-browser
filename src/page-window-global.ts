import { pageBlobBootstrapSource } from "./page-blob-bootstrap.js";
import { PageBlobs } from "./page-blobs.js";
import { AgentBrowserError } from "./errors.js";
import { pageIdleCallbackBootstrapSource } from "./page-idle-callback-bootstrap.js";
import { pageUrlBootstrapSource } from "./page-url-bootstrap.js";
import { PageUrls } from "./page-urls.js";
import type {
	ReleasedContext,
	ReleasedHostDefinition,
} from "./safejs-extension-types.js";

const bridgeName = "__agentBrowserWindowGlobal";
const aliases = ["window", "self", "top", "parent"];
// Guest implementations resolve through global properties, rather than an
// immutable injected binding shadowing the implementation installed below.
const guestGlobals = [...aliases, "requestIdleCallback"];

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
		if (bridge.hasNativeDocument) {
			const createImage = bridge.createImage;
			class Image {
				constructor(width = undefined, height = undefined) {
					if (width !== undefined) width = +width >>> 0;
					if (height !== undefined) height = +height >>> 0;
					const image = createImage();
					if (width !== undefined) image.width = width;
					if (height !== undefined) image.height = height;
					return image;
				}
			}
			Object.defineProperty(globalThis, "Image", {
				value: Image, writable: true, configurable: true, enumerable: false
			});
		}
		${pageIdleCallbackBootstrapSource}
		${pageUrlBootstrapSource}
		${pageBlobBootstrapSource}
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
			...names.filter((name) => !guestGlobals.includes(name)),
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
		const document = globals.document;
		const createElement =
			document && typeof document === "object"
				? this.definitions.get(document)?.methods?.createElement
				: undefined;
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
		const urls = new PageUrls(owner);
		const location = globals.location;
		const origin =
			location && typeof location === "object"
				? this.definitions.get(location)?.properties?.origin?.get
				: undefined;
		const blobs = new PageBlobs(owner, () => {
			const value = origin?.();
			return typeof value === "string" ? value : "null";
		});
		owner.onCleanup(() => {
			urls.close();
			blobs.close();
			this.bound = false;
			this.reference = undefined;
			this.window = undefined;
		});
		return {
			...Object.fromEntries(
				Object.entries(globals).filter(
					([name]) => !guestGlobals.includes(name),
				),
			),
			[bridgeName]: owner.createHostObject({
				properties: {
					urls: { get: () => urls.port },
					blobs: { get: () => blobs.port },
					hasNativeDocument: { get: () => createElement !== undefined },
					window: { get: () => window },
					names: { get: () => names },
					aliases: { get: () => aliases },
					writable: { get: () => writable },
					methods: { get: () => Object.keys(definition.methods ?? {}) },
				},
				methods: {
					createImage: () => {
						if (!this.bound || owner.signal.aborted)
							throw new AgentBrowserError(
								"closed",
								"Image constructor is closed",
							);
						if (!createElement)
							throw new AgentBrowserError(
								"unsupported",
								"Native document required",
							);
						return createElement("img");
					},
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
