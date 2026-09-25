import type { DocumentTree } from "./document.js";
import { htmlNamespace } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import type { PageBindingContext } from "./page-bindings.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

export const pageDomMethodsBootstrapGlobal = "__agentBrowserDomMethods";
const documentLookupNames = new Set([
	"Document.getElementById",
	"Document.querySelector",
]);
const methodNames = new Set([
	...documentLookupNames,
	"Document.getElementsByTagName",
	"Element.getElementsByTagName",
	"Document.createNodeIterator",
	"Document.createDocumentFragment",
	"Document.importNode",
	"Node.cloneNode",
]);
const nodeGetterNames = ["parentNode", "childNodes", "nextSibling"] as const;
const focusNames = new Set(["HTMLElement.focus", "HTMLElement.blur"]);
const operationNames = new Set([
	...methodNames,
	...nodeGetterNames.map((name) => `Node.${name}`),
	...focusNames,
]);
const ownedFunctions = new WeakSet<object>();
const claimedNodes = new WeakSet<object>();
const claimedPorts = new WeakSet<object>();
const prototypeNames = new Set([
	"Node",
	"Element",
	"HTMLElement",
	"HTMLFormElement",
	"SVGElement",
	"Document",
	"DocumentFragment",
	"DocumentType",
	"CharacterData",
	"Text",
	"Comment",
]);

export class PageDomMethods {
	readonly factory: ScriptHostObjectFactory;
	readonly bootstrap: () => object;
	private readonly functions = new Map<string, object>();
	private readonly prototypes = new Map<string, object>();
	private readonly pendingPrototypes = new Map<string, WeakRef<object>[]>();
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
			const focus = async (
				receiver: unknown,
				name: unknown,
				...args: readonly unknown[]
			) => {
				this.ensureOpen();
				const method =
					receiver &&
					typeof receiver === "object" &&
					typeof name === "string" &&
					focusNames.has(name)
						? this.nodes.get(receiver)?.[name]
						: undefined;
				if (!method)
					throw new TypeError(
						"DOM focus requires a registered HTMLElement receiver",
					);
				await method(...args);
				this.ensureOpen();
			};
			const invokeFocus = context.nestedOperation
				? context.nestedOperation(focus)
				: undefined;
			if (context.nestedOperation && invokeFocus !== focus)
				throw new TypeError(
					"DOM focus registration must preserve operation identity",
				);
			const publishPrototype = context.setHostObjectPrototype
				? context.retainGuestArguments((...args: readonly unknown[]) => {
						const [name, prototype] = args;
						try {
							this.ensureOpen();
							if (
								args.length !== 2 ||
								!this.bootstrapped ||
								typeof name !== "string" ||
								!prototypeNames.has(name) ||
								this.prototypes.has(name) ||
								!prototype ||
								typeof prototype !== "object" ||
								ownedFunctions.has(prototype)
							)
								throw new TypeError("Invalid DOM prototype publication");
							ownedFunctions.add(prototype);
							this.prototypes.set(name, prototype);
							for (const reference of this.pendingPrototypes.get(name) ?? []) {
								const node = reference.deref();
								if (node) this.linkPrototype(node, prototype);
							}
							this.pendingPrototypes.delete(name);
						} catch (error) {
							for (const value of new Set(args.slice(1))) {
								if (
									value &&
									typeof value === "object" &&
									!ownedFunctions.has(value)
								)
									context.releaseGuestReference(value);
							}
							throw error;
						}
					}, 1)
				: undefined;
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
						...(publishPrototype ? { publishPrototype } : {}),
						...(invokeFocus ? { invokeFocus } : {}),
						invoke: (receiver, name, ...args) => {
							this.ensureOpen();
							const methods =
								receiver && typeof receiver === "object"
									? this.nodes.get(receiver)
									: undefined;
							const method =
								typeof name === "string" &&
								operationNames.has(name) &&
								!focusNames.has(name)
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
				...(context.setHostObjectPrototype
					? {
							nodePublished: (node: object, name: string) => {
								this.ensureOpen();
								if (!this.nodes.has(node) || !prototypeNames.has(name))
									throw new TypeError("Invalid DOM prototype receiver");
								const prototype = this.prototypes.get(name);
								if (prototype) this.linkPrototype(node, prototype);
								else {
									const pending = this.pendingPrototypes.get(name) ?? [];
									pending.push(new WeakRef(node));
									this.pendingPrototypes.set(name, pending);
								}
							},
						}
					: {}),
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
					const { nodeInterface, ...hostDefinition } = definition;
					const methods = { ...definition.methods };
					const properties = { ...definition.properties };
					const registered: Record<
						string,
						(...args: readonly unknown[]) => unknown
					> = {};
					const kind = methods.createNodeIterator ? "Document" : "Element";
					registered.readNode = definition.properties.nodeType.get;
					if (invokeFocus && definition.properties.namespaceURI) {
						for (const name of ["focus", "blur"]) {
							const method = methods[name];
							if (method)
								registered[`HTMLElement.${name}`] = (...args) => {
									if (
										definition.properties?.namespaceURI?.get() !== htmlNamespace
									)
										throw new TypeError(
											"DOM focus requires an HTMLElement receiver",
										);
									return method(...args);
								};
							if (
								context.setHostObjectPrototype &&
								(nodeInterface === "HTMLElement" ||
									nodeInterface === "HTMLFormElement")
							)
								delete methods[name];
						}
					}
					for (const key of methodNames) {
						const [iface, name] = key.split(".") as [string, string];
						if ((iface !== "Node" && iface !== kind) || !methods[name])
							continue;
						registered[key] = methods[name];
						delete methods[name];
						// Zoom replaces these prototype methods while retaining the
						// originals. An own getter would hide those replacements.
						if (context.setHostObjectPrototype && documentLookupNames.has(key))
							continue;
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
						...hostDefinition,
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
		const values = [...this.functions.values(), ...this.prototypes.values()];
		this.functions.clear();
		this.prototypes.clear();
		this.pendingPrototypes.clear();
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

	private linkPrototype(node: object, prototype: object) {
		this.context.setHostObjectPrototype?.(node, prototype, () => {
			this.ensureOpen();
			const read = this.nodes.get(node)?.readNode;
			if (!read) throw new TypeError("Invalid DOM prototype receiver");
			read();
		});
	}
}
