import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { ScriptNodePublications } from "./script-node-publications.js";
import type { NodeRelations } from "./node-relations.js";
import {
	type ScriptHostObjectDefinition,
	type ScriptHostObjectFactory,
	domString,
} from "./script-dom.js";

const reserved = new Set(["constructor", "prototype", "__proto__"]);

export class ScriptAttributes {
	private readonly maps = new Map<number, object>();
	private readonly attributes = new Map<number, object>();
	private identities = new WeakMap<object, number>();
	private closed = false;
	private readonly publications: ScriptNodePublications;
	private readonly ownsPublications: boolean;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly node: (id: number) => object,
		private readonly relations: NodeRelations,
		publications?: ScriptNodePublications,
	) {
		this.ownsPublications = publications === undefined;
		this.publications =
			publications ??
			new ScriptNodePublications(factory, () => this.ensureOpen());
	}

	elementMethods(
		id: number,
	): NonNullable<ScriptHostObjectDefinition["methods"]> {
		const read = () => {
			this.ensureOpen();
			const node = this.tree.get(id);
			if (node.kind !== "element")
				throw new AgentBrowserError(
					"invalid-input",
					"Attribute methods require an element",
				);
			return node;
		};
		read();
		return {
			getAttribute: (...args) => {
				const attributes = read().attributes;
				const name = this.tree.attributeName(id, this.argument(args, 1));
				return Object.hasOwn(attributes, name) ? attributes[name] : null;
			},
			hasAttribute: (...args) =>
				Object.hasOwn(
					read().attributes,
					this.tree.attributeName(id, this.argument(args, 1)),
				),
			hasAttributes: () => Object.keys(read().attributes).length > 0,
			getAttributeNames: () => this.names(id),
			setAttribute: (...args) => {
				read();
				const name = this.argument(args, 2);
				this.tree.setAttribute(id, name, domString(args[1]));
			},
			removeAttribute: (...args) => {
				const attributes = read().attributes;
				const name = this.tree.attributeName(id, this.argument(args, 1));
				if (Object.hasOwn(attributes, name))
					this.tree.removeAttribute(id, name);
			},
			toggleAttribute: (...args) => {
				read();
				return this.tree.toggleAttribute(
					id,
					this.argument(args, 1),
					args[1] === undefined ? undefined : Boolean(args[1]),
				);
			},
		};
	}

	map(id: number): object {
		this.ensureOpen();
		if (this.tree.get(id).kind !== "element")
			throw new AgentBrowserError(
				"invalid-input",
				"Attribute maps require an element",
			);
		const previous = this.maps.get(id);
		if (previous) return previous;
		if (this.maps.size + this.publications.pending("attribute-map") >= 256)
			throw new AgentBrowserError(
				"resource-limit",
				"Script attribute map limit exceeded",
			);
		const names = () => this.names(id);
		const methods: NonNullable<ScriptHostObjectDefinition["methods"]> = {
			item: (...args) => {
				this.argument(args, 1);
				const numeric = Number(args[0]);
				const index = Number.isFinite(numeric)
					? ((Math.trunc(numeric) % 4_294_967_296) + 4_294_967_296) %
						4_294_967_296
					: 0;
				const name = names()[index];
				return name === undefined ? null : this.getExact(id, name);
			},
			getNamedItem: (...args) => this.get(id, this.argument(args, 1)),
			getNamedItemNS: (...args) => this.getNamespaced(id, args),
			setNamedItem: (...args) => {
				this.require(args, 1);
				return this.set(id, args[0]);
			},
			setNamedItemNS: (...args) => {
				this.require(args, 1);
				return this.set(id, args[0]);
			},
			removeNamedItem: (...args) => this.removeName(id, this.argument(args, 1)),
			removeNamedItemNS: (...args) => {
				const attribute = this.getNamespaced(id, args);
				if (!attribute)
					throw new AgentBrowserError("not-found", "Attribute was not found");
				return this.remove(id, attribute);
			},
		};
		return this.publications.publish(
			"attribute-map",
			id,
			{
				indexed: {
					maxLength: 4096,
					length: () => names().length,
					get: (index) => {
						const name = names()[index];
						return name === undefined ? undefined : this.getExact(id, name);
					},
				},
				named: {
					maxKeys: 4096,
					maxKeyCodeUnits: 65_536,
					enumerable: false,
					keys: () => names().filter((name) => !reserved.has(name)),
					get: (name) => this.get(id, name) ?? undefined,
				},
				methods,
			},
			(capability) => {
				this.ensureOpen();
				this.maps.set(id, capability);
			},
		);
	}

	get(id: number, name: string): object | null {
		this.ensureOpen();
		const attributeId = this.tree.getAttributeNode(id, name);
		return attributeId === null ? null : this.attribute(attributeId);
	}

	private getExact(id: number, name: string): object | null {
		this.ensureOpen();
		const attributeId = this.tree.getAttributeNodeExact(id, name);
		return attributeId === null ? null : this.attribute(attributeId);
	}

	create(name: string, value = ""): object {
		this.ensureCapacity();
		return this.attribute(this.tree.createAttribute(name, value));
	}

	copyFrom(source: DocumentTree, id: number): object {
		this.ensureCapacity();
		return this.attribute(this.tree.copyAttributeFrom(source, id));
	}

	set(id: number, value: unknown): object | null {
		this.ensureOpen();
		const attributeId = this.identity(value);
		const attribute = this.tree.getAttributeRecord(attributeId);
		if (attribute.ownerElement === id) return this.attribute(attributeId);
		if (attribute.ownerElement !== null)
			throw new AgentBrowserError(
				"invalid-input",
				"Attribute is already in use by another element",
			);
		const previous = this.getExact(id, attribute.name);
		this.tree.setAttributeNode(id, attributeId);
		return previous;
	}

	remove(id: number, value: unknown): object {
		this.ensureOpen();
		return this.attribute(
			this.tree.removeAttributeNode(id, this.identity(value)),
		);
	}

	close() {
		this.closed = true;
		if (this.ownsPublications) this.publications.close();
		this.maps.clear();
		this.attributes.clear();
		this.identities = new WeakMap();
	}

	private attribute(id: number): object {
		this.ensureOpen();
		const previous = this.attributes.get(id);
		if (previous) return previous;
		this.ensureCapacity();
		const read = () => {
			this.ensureOpen();
			return this.tree.getAttributeRecord(id);
		};
		const text = (nullEmpty: boolean) => ({
			get: () => read().value,
			set: (value: unknown) => {
				read();
				this.tree.setAttributeValue(
					id,
					nullEmpty && value === null ? "" : domString(value),
				);
			},
		});
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> = {
			name: { get: () => read().name },
			localName: { get: () => read().localName ?? read().name },
			namespaceURI: { get: () => read().namespaceURI ?? null },
			prefix: { get: () => read().prefix ?? null },
			nodeName: { get: () => read().name },
			nodeType: {
				get: () => {
					read();
					return 2;
				},
			},
			value: text(false),
			nodeValue: text(true),
			textContent: text(true),
			ownerElement: {
				get: () => {
					const owner = read().ownerElement;
					return owner === null ? null : this.node(owner);
				},
			},
			ownerDocument: {
				get: () => {
					read();
					return this.node(this.tree.root);
				},
			},
			specified: {
				get: () => {
					read();
					return true;
				},
			},
			isConnected: {
				get: () => {
					read();
					return false;
				},
			},
			childNodes: {
				get: () => {
					read();
					return [];
				},
			},
		};
		for (const name of [
			"parentNode",
			"parentElement",
			"firstChild",
			"lastChild",
			"nextSibling",
			"previousSibling",
		])
			properties[name] = {
				get: () => {
					read();
					return null;
				},
			};
		const relations = this.relations.definition(id, true);
		return this.publications.publish(
			"attribute",
			id,
			{
				properties: { ...properties, ...relations.properties },
				methods: {
					...relations.methods,
					cloneNode: () => {
						read();
						this.ensureCapacity();
						return this.attribute(this.tree.cloneAttribute(id));
					},
					getRootNode: () => {
						read();
						return this.attribute(id);
					},
					hasChildNodes: () => {
						read();
						return false;
					},
				},
			},
			(capability) => {
				this.ensureOpen();
				this.relations.register(capability, id, true);
				this.attributes.set(id, capability);
				this.identities.set(capability, id);
			},
		);
	}

	private identity(value: unknown): number {
		const id =
			value !== null && typeof value === "object"
				? this.identities.get(value)
				: undefined;
		if (id === undefined)
			throw new AgentBrowserError(
				"invalid-input",
				"Expected this document's attribute capability",
			);
		return id;
	}

	private getNamespaced(id: number, args: readonly unknown[]): object | null {
		this.require(args, 2);
		const namespace = args[0] == null ? null : domString(args[0]) || null;
		const name = domString(args[1]);
		if (name.length + (namespace?.length ?? 0) > 65_536)
			throw new AgentBrowserError(
				"resource-limit",
				"Script attribute name limit exceeded",
			);
		this.names(id);
		const attributeId = this.tree.getAttributeNodeNS(id, namespace, name);
		return attributeId === null ? null : this.attribute(attributeId);
	}

	private removeName(id: number, name: string): object {
		const attribute = this.get(id, name);
		if (!attribute)
			throw new AgentBrowserError("not-found", "Attribute was not found");
		return this.remove(id, attribute);
	}

	private names(id: number): string[] {
		this.ensureOpen();
		const names = this.tree.getAttributeNames(id);
		if (
			names.length > 4096 ||
			names.reduce((total, name) => total + name.length, 0) > 65_536
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Script attribute key limit exceeded",
			);
		return names;
	}

	private argument(args: readonly unknown[], minimum: number): string {
		this.require(args, minimum);
		const value = domString(args[0]);
		if (value.length > 65_536)
			throw new AgentBrowserError(
				"resource-limit",
				"Script attribute name limit exceeded",
			);
		return value;
	}

	private require(args: readonly unknown[], minimum: number) {
		this.ensureOpen();
		if (args.length < minimum)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing attribute argument",
			);
	}

	private ensureCapacity() {
		this.ensureOpen();
		if (this.attributes.size + this.publications.pending("attribute") >= 4096)
			throw new AgentBrowserError(
				"resource-limit",
				"Script attribute object limit exceeded",
			);
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Script attributes are closed");
	}
}
