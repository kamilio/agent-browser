import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { PageBindingContext } from "./page-bindings.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

export const pageDomMethodsBootstrapGlobal = "__agentBrowserDomMethods";
const methodNames = new Set([
	"Document.getElementsByTagName",
	"Element.getElementsByTagName",
	"Document.createNodeIterator",
	"Node.cloneNode",
]);
const nodeGetterNames = ["parentNode", "childNodes", "nextSibling"] as const;
const operationNames = new Set([
	...methodNames,
	...nodeGetterNames.map((name) => `Node.${name}`),
]);
const ownedFunctions = new WeakSet<object>();
const claimedNodes = new WeakSet<object>();
const claimedPorts = new WeakSet<object>();

export class PageDomMethods {
	readonly factory: ScriptHostObjectFactory;
	readonly bootstrap: () => object;
	private readonly functions = new Map<string, object>();
	private nodes = new WeakMap<
		object,
		Record<string, (...args: readonly unknown[]) => unknown>
	>();
	private closed = false;
	private bootstrapped = false;
	private readonly unregisterClose: () => void;

	constructor(
		private readonly tree: DocumentTree,
		private readonly context: PageBindingContext,
	) {
		this.unregisterClose = tree.onClose(() => this.close());
		try {
			const publish = context.retainGuestArguments(
				(...args: readonly unknown[]) => {
					const [name, value] = args;
					try {
						this.ensureOpen();
						if (
							args.length !== 2 ||
							!this.bootstrapped ||
							typeof name !== "string" ||
							!operationNames.has(name) ||
							this.functions.has(name) ||
							!value ||
							(typeof value !== "object" && typeof value !== "function") ||
							ownedFunctions.has(value)
						)
							throw new TypeError("Invalid DOM method publication");
						ownedFunctions.add(value);
						this.functions.set(name, value);
					} catch (error) {
						for (const rejected of new Set(args.slice(1))) {
							if (
								rejected &&
								(typeof rejected === "object" ||
									typeof rejected === "function") &&
								!ownedFunctions.has(rejected)
							)
								context.releaseGuestReference(rejected);
						}
						throw error;
					}
				},
				1,
			);
			if (typeof publish !== "function")
				throw new TypeError("Invalid retained DOM method operation");
			this.bootstrap = () => {
				this.ensureOpen();
				if (this.bootstrapped)
					throw new TypeError("DOM method bootstrap is available once");
				this.bootstrapped = true;
				const port = context.createHostObject({
					methods: {
						publish,
						invoke: (receiver, name, ...args) => {
							this.ensureOpen();
							const methods =
								receiver && typeof receiver === "object"
									? this.nodes.get(receiver)
									: undefined;
							const method =
								typeof name === "string" && operationNames.has(name)
									? methods?.[name]
									: undefined;
							if (!method)
								throw new TypeError(
									"DOM method requires a registered receiver",
								);
							const result = method(...args);
							this.ensureOpen();
							return result;
						},
					},
				});
				this.ensureOpen();
				if (
					!port ||
					typeof port !== "object" ||
					claimedPorts.has(port) ||
					claimedNodes.has(port)
				)
					throw new TypeError("Invalid DOM method bootstrap capability");
				claimedPorts.add(port);
				return port;
			};
			this.factory = {
				...(context.domExpandos ? { domExpandos: context.domExpandos } : {}),
				...(context.eventTargetValue
					? {
							eventTargetValue: (target: object) =>
								context.eventTargetValue?.(target),
						}
					: {}),
				createHostObject: (definition) => {
					this.ensureOpen();
					if (!definition.properties?.nodeType)
						return context.createHostObject(definition);
					const methods = { ...definition.methods };
					const properties = { ...definition.properties };
					const registered: Record<
						string,
						(...args: readonly unknown[]) => unknown
					> = {};
					const kind = methods.createNodeIterator ? "Document" : "Element";
					for (const key of methodNames) {
						const [iface, name] = key.split(".") as [string, string];
						if ((iface !== "Node" && iface !== kind) || !methods[name])
							continue;
						registered[key] = methods[name];
						delete methods[name];
						properties[name] = {
							get: () => {
								definition.properties?.nodeType?.get(); // Publication readiness and document lifecycle guard.
								this.ensureOpen();
								const value = this.functions.get(key);
								if (!value)
									throw new TypeError("DOM methods are not initialized");
								return value;
							},
						};
					}
					for (const name of nodeGetterNames) {
						const property = definition.properties[name];
						if (property) registered[`Node.${name}`] = property.get;
					}

					const node = context.createHostObject({
						...definition,
						methods,
						properties,
					});
					this.ensureOpen();
					if (
						!node ||
						typeof node !== "object" ||
						claimedNodes.has(node) ||
						claimedPorts.has(node)
					)
						throw new TypeError("Invalid DOM method receiver publication");
					claimedNodes.add(node);
					this.nodes.set(node, registered);
					return node;
				},
			};
		} catch (error) {
			this.close();
			throw error;
		}
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
		this.nodes = new WeakMap();
		const values = [...this.functions.values()];
		this.functions.clear();
		for (const value of values) {
			try {
				this.context.releaseGuestReference(value);
			} catch {
				/* Continue releasing the remaining functions. */
			}
		}
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "DOM methods are closed");
		this.tree.get(this.tree.root);
	}
}
