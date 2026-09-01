import { AgentBrowserError } from "./errors.js";

export type NodeKind = "document" | "element" | "text" | "comment";

export interface ControlState {
	value?: string;
	checked?: boolean;
	selected?: boolean;
}

export interface DocumentNode {
	id: number;
	kind: NodeKind;
	tagName: string;
	attributes: Readonly<Record<string, string>>;
	data: string;
	parent: number | null;
	children: readonly number[];
	control: Readonly<ControlState>;
}

interface MutableNode
	extends Omit<DocumentNode, "attributes" | "children" | "control"> {
	attributes: Record<string, string>;
	children: number[];
	control: ControlState;
}

export interface DocumentLimits {
	maxNodes: number;
	maxDepth: number;
	maxTextCodeUnits: number;
	maxChanges: number;
}

export interface DocumentChange {
	revision: number;
	kind: "insert" | "remove" | "attribute" | "text" | "control";
	target: number;
}

let nextNodeId = 1;

export class DocumentTree {
	readonly url: string;
	readonly root: number;
	readonly limits: Readonly<DocumentLimits>;
	private nodes = new Map<number, MutableNode>();
	private changes: DocumentChange[] = [];
	private currentRevision = 0;
	private textCodeUnits = 0;
	private closed = false;
	private closeHandlers = new Set<() => void>();

	constructor(url: string, limits: Partial<DocumentLimits> = {}) {
		this.url = new URL(url).href;
		this.limits = Object.freeze({
			maxNodes: limits.maxNodes ?? 50_000,
			maxDepth: limits.maxDepth ?? 256,
			maxTextCodeUnits: limits.maxTextCodeUnits ?? 2_000_000,
			maxChanges: limits.maxChanges ?? 1024,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError("invalid-input", "Invalid document limit");
		this.root = this.allocate("document", "", "");
	}

	get revision() {
		return this.currentRevision;
	}

	get nodeCount() {
		return this.nodes.size;
	}

	createElement(tagName: string, attributes: Record<string, string> = {}) {
		if (typeof tagName !== "string" || !/^[a-z][a-z0-9:_-]*$/i.test(tagName))
			throw new AgentBrowserError("invalid-input", "Invalid element name");
		if (
			!attributes ||
			typeof attributes !== "object" ||
			Array.isArray(attributes)
		)
			throw new AgentBrowserError("invalid-input", "Invalid attributes");
		for (const [name, value] of Object.entries(attributes)) {
			this.validateAttribute(name);
			if (typeof value !== "string")
				throw new AgentBrowserError(
					"invalid-input",
					"Attribute values must be strings",
				);
		}
		const length = Object.entries(attributes).reduce(
			(total, [name, value]) => total + name.length + value.length,
			tagName.length,
		);
		this.checkTextBudget(length);
		const id = this.allocate("element", tagName.toLowerCase(), "");
		const node = this.node(id);
		for (const [name, value] of Object.entries(attributes)) {
			const key = name.toLowerCase();
			if (Object.hasOwn(node.attributes, key)) continue;
			node.attributes[key] = value;
			this.textCodeUnits += key.length + value.length;
		}
		return id;
	}

	createText(data: string) {
		return this.allocate("text", "", data);
	}

	createComment(data: string) {
		return this.allocate("comment", "", data);
	}

	get(id: number): Readonly<DocumentNode> {
		const node = this.node(id);
		return Object.freeze({
			...node,
			attributes: Object.freeze({ ...node.attributes }),
			children: Object.freeze([...node.children]),
			control: Object.freeze({ ...node.control }),
		});
	}

	append(parent: number, child: number) {
		this.insert(parent, child);
	}

	insert(parentId: number, childId: number, before?: number) {
		const parent = this.node(parentId);
		const child = this.node(childId);
		if (
			!["document", "element"].includes(parent.kind) ||
			child.kind === "document"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid tree parent or child",
			);
		if (before !== undefined && !parent.children.includes(before))
			throw new AgentBrowserError(
				"not-found",
				"Insertion reference is not a child",
			);
		let ancestor: MutableNode | undefined = parent;
		let parentDepth = 0;
		while (ancestor) {
			if (ancestor.id === childId)
				throw new AgentBrowserError(
					"invalid-input",
					"Document tree cannot contain cycles",
				);
			parentDepth++;
			ancestor =
				ancestor.parent === null ? undefined : this.node(ancestor.parent);
		}
		for (const entry of this.walk(childId))
			if (parentDepth + entry.depth > this.limits.maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Document depth limit exceeded",
				);
		if (before === childId) return;
		if (child.parent !== null) {
			const previousParent = this.node(child.parent);
			previousParent.children.splice(
				previousParent.children.indexOf(childId),
				1,
			);
		}
		const index =
			before === undefined
				? parent.children.length
				: parent.children.indexOf(before);
		parent.children.splice(index, 0, childId);
		child.parent = parentId;
		this.changed("insert", childId);
	}

	remove(id: number) {
		const node = this.node(id);
		if (node.parent === null) return;
		const parent = this.node(node.parent);
		parent.children.splice(parent.children.indexOf(id), 1);
		node.parent = null;
		this.changed("remove", id);
	}

	setAttribute(id: number, name: string, value: string) {
		this.validateAttribute(name);
		this.validateString(value);
		const node = this.element(id);
		const key = name.toLowerCase();
		const previous = node.attributes[key];
		if (previous === value) return;
		const change =
			value.length -
			(previous?.length ?? 0) +
			(previous === undefined ? key.length : 0);
		this.checkTextBudget(change);
		node.attributes[key] = value;
		this.textCodeUnits += change;
		this.changed("attribute", id);
	}

	removeAttribute(id: number, name: string) {
		this.validateAttribute(name);
		const node = this.element(id);
		const key = name.toLowerCase();
		if (!Object.hasOwn(node.attributes, key)) return;
		this.textCodeUnits -= key.length + node.attributes[key].length;
		delete node.attributes[key];
		this.changed("attribute", id);
	}

	setData(id: number, data: string) {
		this.validateString(data);
		const node = this.node(id);
		if (node.kind !== "text" && node.kind !== "comment")
			throw new AgentBrowserError(
				"invalid-input",
				"Only text/comment nodes have data",
			);
		if (node.data === data) return;
		const change = data.length - node.data.length;
		this.checkTextBudget(change);
		node.data = data;
		this.textCodeUnits += change;
		this.changed("text", id);
	}

	setControl(id: number, state: ControlState) {
		const node = this.element(id);
		if (!state || typeof state !== "object" || Array.isArray(state))
			throw new AgentBrowserError("invalid-input", "Invalid control state");
		for (const [key, value] of Object.entries(state)) {
			if (key === "value") this.validateString(value);
			else if (
				!["checked", "selected"].includes(key) ||
				typeof value !== "boolean"
			)
				throw new AgentBrowserError("invalid-input", "Invalid control state");
		}
		const change =
			(state.value?.length ?? node.control.value?.length ?? 0) -
			(node.control.value?.length ?? 0);
		this.checkTextBudget(change);
		this.textCodeUnits += change;
		node.control = { ...node.control, ...state };
		this.changed("control", id);
	}

	textContent(id: number) {
		const parts: string[] = [];
		for (const { node } of this.walk(id))
			if (node.kind === "text") parts.push(node.data);
		return parts.join("");
	}

	*walk(
		start = this.root,
	): Generator<{ node: Readonly<DocumentNode>; depth: number }> {
		const pending = [{ id: start, depth: 0 }];
		while (pending.length) {
			const entry = pending.pop();
			if (!entry) break;
			const node = this.get(entry.id);
			yield { node, depth: entry.depth };
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push({ id: node.children[index], depth: entry.depth + 1 });
		}
	}

	isConnected(id: number) {
		let node = this.node(id);
		while (node.parent !== null) node = this.node(node.parent);
		return node.id === this.root;
	}

	reference(id: number) {
		this.node(id);
		return `e${id}`;
	}

	resolve(reference: string) {
		if (!/^e[1-9][0-9]*$/.test(reference))
			throw new AgentBrowserError("invalid-input", "Invalid element reference");
		this.ensureOpen();
		const id = Number(reference.slice(1));
		if (!this.nodes.has(id) || !this.isConnected(id))
			throw new AgentBrowserError(
				"stale-reference",
				"Reference is no longer in this document",
			);
		return this.get(id);
	}

	changesSince(revision: number) {
		this.ensureOpen();
		if (
			!Number.isSafeInteger(revision) ||
			revision < 0 ||
			revision > this.revision
		)
			throw new AgentBrowserError("invalid-input", "Invalid document revision");
		const oldest = this.changes[0]?.revision ?? this.revision + 1;
		return {
			revision: this.revision,
			reset: revision < oldest - 1,
			changes: this.changes
				.filter((change) => change.revision > revision)
				.map((change) => ({ ...change })),
		};
	}

	onClose(handler: () => void) {
		this.ensureOpen();
		if (typeof handler !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document cleanup handler",
			);
		if (!this.closeHandlers.has(handler) && this.closeHandlers.size >= 64)
			throw new AgentBrowserError(
				"resource-limit",
				"Document cleanup handler limit exceeded",
			);
		this.closeHandlers.add(handler);
		return () => this.closeHandlers.delete(handler);
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.nodes.clear();
		this.changes = [];
		this.textCodeUnits = 0;
		const failures: unknown[] = [];
		const handlers = [...this.closeHandlers];
		this.closeHandlers.clear();
		for (const handler of handlers) {
			try {
				handler();
			} catch (error) {
				failures.push(error);
			}
		}
		if (failures.length)
			throw new AggregateError(failures, "Document cleanup failed");
	}

	private allocate(kind: NodeKind, tagName: string, data: string) {
		this.ensureOpen();
		this.validateString(data);
		if (
			this.nodes.size >= this.limits.maxNodes ||
			!Number.isSafeInteger(nextNodeId)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Document node limit exceeded",
			);
		this.checkTextBudget(tagName.length + data.length);
		const id = nextNodeId++;
		this.nodes.set(id, {
			id,
			kind,
			tagName,
			attributes: Object.create(null),
			data,
			parent: null,
			children: [],
			control: {},
		});
		this.textCodeUnits += tagName.length + data.length;
		return id;
	}

	private node(id: number) {
		this.ensureOpen();
		const node = this.nodes.get(id);
		if (!node)
			throw new AgentBrowserError("not-found", "Unknown document node");
		return node;
	}

	private element(id: number) {
		const node = this.node(id);
		if (node.kind !== "element")
			throw new AgentBrowserError("invalid-input", "Expected an element node");
		return node;
	}

	private validateAttribute(name: string) {
		if (
			typeof name !== "string" ||
			!name ||
			name.includes("\0") ||
			/[\t\n\f\r "'/>=]/.test(name)
		)
			throw new AgentBrowserError("invalid-input", "Invalid attribute name");
	}

	private validateString(value: unknown): asserts value is string {
		if (typeof value !== "string")
			throw new AgentBrowserError("invalid-input", "Expected a string");
	}

	private checkTextBudget(change: number) {
		if (this.textCodeUnits + change > this.limits.maxTextCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Document text limit exceeded",
			);
	}

	private changed(kind: DocumentChange["kind"], target: number) {
		this.currentRevision++;
		this.changes.push({ revision: this.currentRevision, kind, target });
		if (this.changes.length > this.limits.maxChanges) this.changes.shift();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document is closed");
	}
}
