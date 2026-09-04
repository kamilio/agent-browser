import { DocumentCheckedness } from "./document-checkedness.js";
import { validateDocumentInsertion } from "./document-hierarchy.js";
import {
	DocumentInputValues,
	type InputValueChange,
} from "./document-input-values.js";
import { DocumentSelection } from "./document-selection.js";
import type { DocumentResources } from "./document-resources.js";
import { canRewriteDocumentUrl } from "./document-url.js";
import { AgentBrowserError } from "./errors.js";
import { htmlAttributeName } from "./html-attribute-name.js";
import {
	createHtmlAttributes,
	htmlAttributeEntries,
	htmlAttributeNames,
	removeHtmlAttribute,
	setHtmlAttribute,
	snapshotHtmlAttributes,
} from "./html-attributes.js";

export type NodeKind =
	| "document"
	| "fragment"
	| "element"
	| "text"
	| "comment"
	| "doctype";

export interface ControlState {
	value?: string;
	checked?: boolean;
	indeterminate?: boolean;
	selected?: boolean;
}

export interface DocumentAttribute {
	id: number;
	name: string;
	value: string;
	ownerElement: number | null;
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
	doctype?: Readonly<{ name: string; publicId: string; systemId: string }>;
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
	kind:
		| "insert"
		| "remove"
		| "attribute"
		| "text"
		| "control"
		| "location"
		| "focus"
		| "style"
		| "target";
	target: number;
}

export interface DocumentMutation {
	readonly type: "attributes" | "characterData" | "childList";
	readonly target: number;
	readonly ancestors: readonly number[];
	readonly addedNodes: readonly number[];
	readonly removedNodes: readonly number[];
	readonly previousSibling: number | null;
	readonly nextSibling: number | null;
	readonly attributeName: string | null;
	readonly attributeNamespace: null;
	readonly oldValue: string | null;
}

let nextNodeId = 1;

export class DocumentTree {
	private currentUrl: string;
	private currentTarget: number | null = null;
	private currentFocus: number | null = null;
	readonly root: number;
	readonly limits: Readonly<DocumentLimits>;
	private nodes = new Map<number, MutableNode>();
	private nodeViews = new Map<number, Readonly<DocumentNode>>();
	private attributeRecords = new Map<number, DocumentAttribute>();
	private attachedAttributes = new Map<number, Map<string, number>>();
	private changes: DocumentChange[] = [];
	private currentRevision = 0;
	private textCodeUnits = 0;
	private unregisterResources?: () => void;
	private readonly customValidity = new Map<number, string>();
	private readonly userEditedValues = new Set<number>();
	private closed = false;
	private attachedDoctype: number | undefined;
	private closeHandlers = new Set<() => void>();
	private changeHandlers = new Set<
		(change: Readonly<DocumentChange>) => void
	>();
	private mutationHandlers = new Set<(record: DocumentMutation) => void>();
	private mutationNotifications = 0;
	private mutationCollectorFailures = 0;
	private readonly selections = new DocumentSelection(
		(id) => this.node(id),
		(id) => this.changed("control", id),
	);
	private readonly checkedness = new DocumentCheckedness(
		(id) => this.node(id),
		(id) => this.changed("control", id),
	);
	private readonly inputValues = new DocumentInputValues((id) => this.node(id));

	constructor(
		url: string,
		limits: Partial<DocumentLimits> = {},
		private readonly resources?: DocumentResources,
	) {
		this.currentUrl = new URL(url).href;
		this.limits = Object.freeze({
			maxNodes: limits.maxNodes ?? 50_000,
			maxDepth: limits.maxDepth ?? 256,
			maxTextCodeUnits: limits.maxTextCodeUnits ?? 2_000_000,
			maxChanges: limits.maxChanges ?? 1024,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError("invalid-input", "Invalid document limit");
		this.unregisterResources = resources?.register(this);
		try {
			this.root = this.allocate("document", "", "");
		} catch (error) {
			this.unregisterResources?.();
			throw error;
		}
	}

	get revision() {
		return this.currentRevision;
	}

	invalidatePresentation() {
		this.ensureOpen();
		this.changed("style", this.root);
	}

	get url() {
		return this.currentUrl;
	}

	get targetElement() {
		return this.currentTarget;
	}

	get activeElement() {
		return this.currentFocus !== null &&
			this.nodes.has(this.currentFocus) &&
			this.isConnected(this.currentFocus)
			? this.currentFocus
			: null;
	}

	setActiveElement(id: number | null) {
		this.ensureOpen();
		if (id !== null) {
			this.element(id);
			if (!this.isConnected(id))
				throw new AgentBrowserError(
					"not-actionable",
					"Cannot focus a detached element",
				);
		}
		if (id === this.currentFocus) return;
		this.currentFocus = id;
		this.changed("focus", this.root);
	}

	setTargetElement(id: number | null) {
		this.ensureOpen();
		if (id !== null) this.element(id);
		if (id === this.currentTarget) return;
		this.currentTarget = id;
		this.changed("target", this.root);
	}

	setUrl(value: string) {
		this.ensureOpen();
		if (typeof value !== "string" || value.length > 16_384)
			throw new AgentBrowserError("invalid-input", "Invalid document URL");
		let target: URL;
		try {
			target = new URL(value);
		} catch {
			throw new AgentBrowserError("invalid-input", "Invalid document URL");
		}
		if (target.href.length > 16_384)
			throw new AgentBrowserError(
				"resource-limit",
				"Document URL limit exceeded",
			);
		if (!canRewriteDocumentUrl(new URL(this.currentUrl), target))
			throw new AgentBrowserError(
				"policy-denied",
				"Document URL rewrite is not permitted",
			);
		if (target.href === this.currentUrl) return;
		this.currentUrl = target.href;
		this.changed("location", this.root);
	}

	get nodeCount() {
		return this.nodes.size + this.attributeRecords.size;
	}

	resourceUsage() {
		return Object.freeze({
			nodes: this.nodeCount,
			textCodeUnits: this.textCodeUnits,
		});
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
		const entries = htmlAttributeEntries(attributes);
		for (const [name, value] of entries) {
			this.validateAttribute(name);
			if (typeof value !== "string")
				throw new AgentBrowserError(
					"invalid-input",
					"Attribute values must be strings",
				);
		}
		const length = entries.reduce(
			(total, [name, value]) => total + name.length + value.length,
			tagName.length,
		);
		this.checkTextBudget(length);
		const id = this.allocate("element", tagName.toLowerCase(), "");
		const node = this.node(id);
		for (const [name, value] of entries) {
			const key = htmlAttributeName(name);
			if (Object.hasOwn(node.attributes, key)) continue;
			setHtmlAttribute(node.attributes, key, value);
			this.textCodeUnits += key.length + value.length;
		}
		this.selections.initialize(id);
		this.checkedness.initialize(id);
		return id;
	}

	createText(data: string) {
		return this.allocate("text", "", data);
	}

	createComment(data: string) {
		return this.allocate("comment", "", data);
	}

	createFragment() {
		return this.allocate("fragment", "", "");
	}

	createDocumentType(name: string, publicId = "", systemId = "") {
		this.ensureOpen();
		for (const value of [name, publicId, systemId]) this.validateString(value);
		if (/[\0\t\n\f\r >]/.test(name))
			throw new DOMException(
				"Invalid document type name",
				"InvalidCharacterError",
			);
		this.checkTextBudget(name.length + publicId.length + systemId.length);
		const id = this.allocate("doctype", "", "");
		this.node(id).doctype = Object.freeze({ name, publicId, systemId });
		this.textCodeUnits += name.length + publicId.length + systemId.length;
		return id;
	}

	clone(id: number, deep = false): number {
		return this.copyFrom(this, id, deep);
	}

	copyFrom(sourceTree: DocumentTree, id: number, deep = true): number {
		this.ensureOpen();
		const original = sourceTree.get(id);
		if (original.kind === "document")
			throw new AgentBrowserError(
				"unsupported",
				"Document cloning is not supported",
			);
		const entries = deep
			? [...sourceTree.walk(id)]
			: [{ node: original, depth: 0 }];
		if (entries.some(({ depth }) => depth > this.limits.maxDepth))
			throw new AgentBrowserError(
				"resource-limit",
				"Document depth limit exceeded",
			);
		const sources = entries.map(({ node }) => node);
		this.resources?.check(sources.length);
		if (
			this.nodeCount + sources.length > this.limits.maxNodes ||
			!Number.isSafeInteger(nextNodeId + sources.length - 1)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Document node limit exceeded",
			);
		const extraText = (node: Readonly<DocumentNode>) =>
			Object.entries(node.attributes).reduce(
				(total, [name, value]) => total + name.length + value.length,
				(node.control.value?.length ?? 0) +
					(node.doctype?.name.length ?? 0) +
					(node.doctype?.publicId.length ?? 0) +
					(node.doctype?.systemId.length ?? 0),
			);
		this.checkTextBudget(
			sources.reduce(
				(total, node) =>
					total + node.tagName.length + node.data.length + extraText(node),
				0,
			),
		);
		const copies = new Map<number, number>();
		for (const source of sources) {
			this.resources?.check(
				0,
				source.tagName.length + source.data.length + extraText(source),
			);
			const copyId = this.allocate(source.kind, source.tagName, source.data);
			const copy = this.node(copyId);
			copy.attributes = createHtmlAttributes(source.attributes);
			copy.control = { ...source.control };
			if (source.doctype) copy.doctype = source.doctype;
			if (sourceTree.userEditedValues.has(source.id))
				this.userEditedValues.add(copyId);
			this.selections.initialize(copyId, {
				state: sourceTree.selections,
				id: source.id,
			});
			this.checkedness.initialize(copyId, {
				state: sourceTree.checkedness,
				id: source.id,
			});
			this.inputValues.initialize(copyId, {
				state: sourceTree.inputValues,
				id: source.id,
			});
			this.textCodeUnits += extraText(source);
			copies.set(source.id, copyId);
			const parent =
				source.parent === null ? undefined : copies.get(source.parent);
			if (parent !== undefined) {
				copy.parent = parent;
				this.node(parent).children.push(copyId);
				this.changed("insert", copyId);
			}
		}
		const copy = copies.get(id);
		if (copy === undefined)
			throw new AgentBrowserError("not-found", "Clone root was not allocated");
		this.selections.moved(copy);
		this.checkedness.moved(copy);
		return copy;
	}

	replaceChildrenFrom(
		parentId: number,
		sourceTree: DocumentTree,
		fragmentId: number,
	) {
		const imported = this.importFragment(parentId, sourceTree, fragmentId);
		this.replaceChildren(parentId, imported);
	}

	insertChildrenFrom(
		parentId: number,
		sourceTree: DocumentTree,
		fragmentId: number,
		before?: number,
	) {
		if (before !== undefined && this.node(before).parent !== parentId)
			throw new AgentBrowserError(
				"not-found",
				"Insertion reference is not a child",
			);
		const imported = this.importFragment(parentId, sourceTree, fragmentId);
		if (imported !== undefined) this.insert(parentId, imported, before);
	}

	replaceChildFrom(
		parentId: number,
		sourceTree: DocumentTree,
		fragmentId: number,
		previousId: number,
	) {
		if (this.node(previousId).parent !== parentId)
			throw new AgentBrowserError(
				"not-found",
				"Replacement target is not a child",
			);
		const imported = this.importFragment(parentId, sourceTree, fragmentId);
		if (imported === undefined) this.remove(previousId);
		else this.replace(parentId, imported, previousId);
	}

	private importFragment(
		parentId: number,
		sourceTree: DocumentTree,
		fragmentId: number,
	) {
		const parent = this.node(parentId);
		if (parent.kind !== "element" && parent.kind !== "fragment")
			throw new AgentBrowserError(
				"invalid-input",
				"Replacement target must be an element or fragment",
			);
		const fragment = sourceTree.get(fragmentId);
		if (fragment.kind !== "fragment")
			throw new AgentBrowserError(
				"invalid-input",
				"Replacement source must be a fragment",
			);
		let depth = 0;
		let ancestor: MutableNode | undefined = parent;
		while (ancestor) {
			depth++;
			ancestor =
				ancestor.parent === null ? undefined : this.node(ancestor.parent);
		}
		for (const entry of sourceTree.walk(fragmentId))
			if (entry.depth > 0 && depth + entry.depth - 1 > this.limits.maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Document depth limit exceeded",
				);
		return fragment.children.length
			? this.copyFrom(sourceTree, fragmentId)
			: undefined;
	}

	get(id: number): Readonly<DocumentNode> {
		const node = this.node(id);
		const cached = this.nodeViews.get(id);
		if (cached) return cached;
		const view = Object.freeze({
			...node,
			attributes: snapshotHtmlAttributes(node.attributes),
			children: Object.freeze([...node.children]),
			control: Object.freeze({ ...node.control }),
		});
		this.nodeViews.set(id, view);
		return view;
	}

	append(parent: number, child: number) {
		this.insert(parent, child);
	}

	private checkInsertion(
		parentId: number,
		childId: number,
		before?: number,
		excluded: readonly number[] = [],
	) {
		const parent = this.node(parentId);
		const child = this.node(childId);
		if (
			!["document", "fragment", "element"].includes(parent.kind) ||
			child.kind === "document" ||
			(child.kind === "doctype" && parent.kind !== "document")
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
		const children =
			child.kind === "fragment" ? [...child.children] : [childId];
		if (
			parent.kind === "document" &&
			(this.attachedDoctype !== undefined || child.kind === "doctype")
		)
			validateDocumentInsertion(this, parentId, childId, excluded, before);
		for (const moving of children)
			for (const entry of this.walk(moving))
				if (parentDepth + entry.depth > this.limits.maxDepth)
					throw new AgentBrowserError(
						"resource-limit",
						"Document depth limit exceeded",
					);
		return children;
	}

	insert(parentId: number, childId: number, before?: number) {
		this.insertInternal(parentId, childId, before);
	}

	private insertInternal(
		parentId: number,
		childId: number,
		reference?: number,
		suppress = false,
	) {
		const children = this.checkInsertion(parentId, childId, reference);
		const parent = this.node(parentId);
		const child = this.node(childId);
		if (reference === childId) {
			const index = parent.children.indexOf(childId);
			const siblings = {
				previousSibling: parent.children[index - 1] ?? null,
				nextSibling: parent.children[index + 1] ?? null,
			};
			this.mutation(
				"childList",
				parentId,
				{ ...siblings, removedNodes: [childId] },
				false,
			);
			if (!suppress)
				this.mutation(
					"childList",
					parentId,
					{ ...siblings, addedNodes: [childId] },
					false,
				);
			return;
		}
		const before = reference;
		if (child.kind === "fragment") {
			if (children.length) this.nodeViews.delete(childId);
			const index =
				before === undefined
					? parent.children.length
					: parent.children.indexOf(before);
			const previousSibling = parent.children[index - 1] ?? null;
			const nextSibling = parent.children[index] ?? null;
			parent.children = parent.children
				.slice(0, index)
				.concat(children, parent.children.slice(index));
			child.children = [];
			for (const moving of children) this.node(moving).parent = parentId;
			this.childMutation(childId, [], children);
			if (!suppress)
				this.childMutation(
					parentId,
					children,
					[],
					previousSibling,
					nextSibling,
				);
			for (const moving of children) {
				this.node(moving).parent = parentId;
				this.selections.moved(moving);
				this.checkedness.moved(moving);
				this.changed("insert", moving);
			}
			return;
		}
		for (const moving of children) {
			const node = this.node(moving);
			if (node.parent !== null) {
				const previousParent = this.node(node.parent);
				const previousIndex = previousParent.children.indexOf(moving);
				const previousSibling =
					previousParent.children[previousIndex - 1] ?? null;
				const nextSibling = previousParent.children[previousIndex + 1] ?? null;
				this.nodeViews.delete(previousParent.id);
				previousParent.children.splice(
					previousParent.children.indexOf(moving),
					1,
				);
				node.parent = null;
				this.childMutation(
					previousParent.id,
					[],
					[moving],
					previousSibling,
					nextSibling,
				);
			}
			const index =
				before === undefined
					? parent.children.length
					: parent.children.indexOf(before);
			const previousSibling = parent.children[index - 1] ?? null;
			const nextSibling = parent.children[index] ?? null;
			parent.children.splice(index, 0, moving);
			node.parent = parentId;
			if (!suppress)
				this.childMutation(
					parentId,
					[moving],
					[],
					previousSibling,
					nextSibling,
				);
			this.selections.moved(moving);
			this.checkedness.moved(moving);
			this.changed("insert", moving);
		}
		if (this.currentFocus !== null && !this.isConnected(this.currentFocus))
			this.currentFocus = null;
	}

	replace(parentId: number, childId: number, previousId: number) {
		const added = this.checkInsertion(parentId, childId, previousId, [
			previousId,
		]);
		const siblings = this.node(parentId).children;
		let before = siblings[siblings.indexOf(previousId) + 1];
		const previousSibling = siblings[siblings.indexOf(previousId) - 1] ?? null;
		if (before === childId) before = siblings[siblings.indexOf(childId) + 1];
		if (this.node(childId).kind !== "fragment") this.remove(childId);
		const removed =
			this.node(previousId).parent === parentId ? [previousId] : [];
		if (removed.length) this.removeInternal(previousId, true);
		this.insertInternal(parentId, childId, before, true);
		this.childMutation(
			parentId,
			added,
			removed,
			previousSibling,
			before ?? null,
		);
	}

	replaceChildren(parentId: number, childId?: number) {
		const parent = this.node(parentId);
		if (!["document", "fragment", "element"].includes(parent.kind))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid replacement parent",
			);
		const added =
			childId === undefined
				? []
				: this.checkInsertion(parentId, childId, undefined, parent.children);
		const previous = parent.children;
		if (previous.length) this.nodeViews.delete(parentId);
		parent.children = [];
		for (const child of previous) {
			this.node(child).parent = null;
			this.selections.moved(child);
			this.checkedness.moved(child);
			this.changed("remove", child);
		}
		if (this.currentFocus !== null && !this.isConnected(this.currentFocus))
			this.currentFocus = null;
		if (childId !== undefined)
			this.insertInternal(parentId, childId, undefined, true);
		this.childMutation(parentId, added, previous);
	}

	remove(id: number) {
		this.removeInternal(id);
	}

	private removeInternal(id: number, suppress = false) {
		const node = this.node(id);
		if (node.parent === null) return;
		const parent = this.node(node.parent);
		const index = parent.children.indexOf(id);
		const previousSibling = parent.children[index - 1] ?? null;
		const nextSibling = parent.children[index + 1] ?? null;
		this.nodeViews.delete(parent.id);
		parent.children.splice(parent.children.indexOf(id), 1);
		node.parent = null;
		if (!suppress)
			this.childMutation(parent.id, [], [id], previousSibling, nextSibling);
		this.selections.moved(id);
		this.checkedness.moved(id);
		if (this.currentFocus !== null && !this.isConnected(this.currentFocus))
			this.currentFocus = null;
		this.changed("remove", id);
	}

	getAttributeNames(id: number): string[] {
		return htmlAttributeNames(this.element(id).attributes);
	}

	setAttribute(id: number, name: string, value: string) {
		this.validateAttribute(name);
		this.validateString(value);
		const node = this.element(id);
		const key = htmlAttributeName(name);
		const previous = node.attributes[key];
		const inputChange = this.inputValues.prepare(id, key, value);
		if (previous === value) {
			if (inputChange && inputChange.value !== node.control.value) {
				this.checkTextBudget(this.inputValueDelta(id, inputChange));
				this.applyInputValueChange(id, inputChange);
				this.changed("control", id);
			}
			this.mutation("attributes", id, {
				attributeName: key,
				oldValue: previous,
			});
			return;
		}
		const attributeId = this.attachedAttributes.get(id)?.get(key);
		const attribute =
			attributeId === undefined
				? undefined
				: this.attributeRecords.get(attributeId);
		const change =
			value.length -
			(previous?.length ?? 0) +
			(previous === undefined ? key.length : 0) +
			(attribute === undefined ? 0 : value.length - attribute.value.length);
		this.checkTextBudget(change + this.inputValueDelta(id, inputChange));
		setHtmlAttribute(node.attributes, key, value);
		if (attribute) attribute.value = value;
		this.textCodeUnits += change;
		this.applyInputValueChange(id, inputChange);
		this.mutation("attributes", id, {
			attributeName: key,
			oldValue: previous ?? null,
		});
		this.changed("attribute", id);
		this.selections.attribute(id, key);
		this.checkedness.attribute(id, key, previous);
	}

	toggleAttribute(id: number, name: string, force?: boolean): boolean {
		this.validateAttribute(name);
		if (force !== undefined && typeof force !== "boolean")
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a boolean attribute force",
			);
		const key = htmlAttributeName(name);
		const present = Object.hasOwn(this.element(id).attributes, key);
		const wanted = force ?? !present;
		if (wanted && !present) this.setAttribute(id, key, "");
		else if (!wanted && present) this.removeAttribute(id, key);
		return wanted;
	}

	removeAttribute(id: number, name: string) {
		this.validateAttribute(name);
		const node = this.element(id);
		const key = htmlAttributeName(name);
		if (!Object.hasOwn(node.attributes, key)) return;
		const previous = node.attributes[key];
		const inputChange = this.inputValues.prepare(id, key, undefined);
		this.checkTextBudget(
			-key.length - previous.length + this.inputValueDelta(id, inputChange),
		);
		this.textCodeUnits -= key.length + node.attributes[key].length;
		removeHtmlAttribute(node.attributes, key);
		const attributeId = this.attachedAttributes.get(id)?.get(key);
		if (attributeId !== undefined) {
			const attribute = this.attributeRecord(attributeId);
			attribute.ownerElement = null;
			this.attachedAttributes.get(id)?.delete(key);
		}
		this.applyInputValueChange(id, inputChange);
		this.mutation("attributes", id, { attributeName: key, oldValue: previous });
		this.changed("attribute", id);
		this.selections.attribute(id, key);
		this.checkedness.attribute(id, key, previous);
	}

	createAttribute(name: string, value = ""): number {
		this.ensureOpen();
		this.validateAttribute(name);
		this.validateString(value);
		this.resources?.check(1);
		if (
			this.nodeCount >= this.limits.maxNodes ||
			!Number.isSafeInteger(nextNodeId)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Document node limit exceeded",
			);
		const key = htmlAttributeName(name);
		this.checkTextBudget(key.length + value.length);
		const id = nextNodeId++;
		this.attributeRecords.set(id, { id, name: key, value, ownerElement: null });
		this.textCodeUnits += key.length + value.length;
		return id;
	}

	getAttributeNode(id: number, name: string): number | null {
		this.validateString(name);
		const key = htmlAttributeName(name);
		const value = this.element(id).attributes[key];
		if (value === undefined) return null;
		const existing = this.attachedAttributes.get(id)?.get(key);
		if (existing !== undefined) return existing;
		const attributeId = this.createAttribute(key, value);
		this.attributeRecord(attributeId).ownerElement = id;
		this.attributeMap(id).set(key, attributeId);
		return attributeId;
	}

	getAttributeRecord(id: number): Readonly<DocumentAttribute> {
		return Object.freeze({ ...this.attributeRecord(id) });
	}

	setAttributeValue(id: number, value: string) {
		this.validateString(value);
		const attribute = this.attributeRecord(id);
		if (attribute.ownerElement !== null) {
			this.setAttribute(attribute.ownerElement, attribute.name, value);
			return;
		}
		const change = value.length - attribute.value.length;
		this.checkTextBudget(change);
		attribute.value = value;
		this.textCodeUnits += change;
	}

	setAttributeNode(id: number, attributeId: number): number | null {
		const node = this.element(id);
		const attribute = this.attributeRecord(attributeId);
		if (attribute.ownerElement === id) return attributeId;
		if (attribute.ownerElement !== null)
			throw new AgentBrowserError(
				"invalid-input",
				"Attribute is already in use by another element",
			);
		const previous = node.attributes[attribute.name];
		const inputChange = this.inputValues.prepare(
			id,
			attribute.name,
			attribute.value,
		);
		const change =
			attribute.value.length -
			(previous?.length ?? 0) +
			(previous === undefined ? attribute.name.length : 0);
		const captured = this.attachedAttributes.get(id)?.get(attribute.name);
		const captureCost =
			previous === undefined || captured !== undefined
				? 0
				: attribute.name.length + previous.length;
		this.checkTextBudget(
			change + captureCost + this.inputValueDelta(id, inputChange),
		);
		const original = this.getAttributeNode(id, attribute.name);
		if (original !== null) this.attributeRecord(original).ownerElement = null;
		setHtmlAttribute(node.attributes, attribute.name, attribute.value);
		attribute.ownerElement = id;
		this.attributeMap(id).set(attribute.name, attributeId);
		this.textCodeUnits += change;
		this.applyInputValueChange(id, inputChange);
		this.mutation("attributes", id, {
			attributeName: attribute.name,
			oldValue: previous ?? null,
		});
		this.changed("attribute", id);
		this.selections.attribute(id, attribute.name);
		this.checkedness.attribute(id, attribute.name, previous);
		return original;
	}

	removeAttributeNode(id: number, attributeId: number): number {
		this.element(id);
		const attribute = this.attributeRecord(attributeId);
		if (attribute.ownerElement !== id)
			throw new AgentBrowserError(
				"not-found",
				"Attribute is not attached to this element",
			);
		this.removeAttribute(id, attribute.name);
		return attributeId;
	}

	private attributeRecord(id: number): DocumentAttribute {
		this.ensureOpen();
		const attribute = this.attributeRecords.get(id);
		if (!attribute)
			throw new AgentBrowserError("not-found", "Unknown document attribute");
		return attribute;
	}

	private attributeMap(id: number): Map<string, number> {
		let attributes = this.attachedAttributes.get(id);
		if (!attributes) {
			attributes = new Map();
			this.attachedAttributes.set(id, attributes);
		}
		return attributes;
	}

	setData(id: number, data: string) {
		this.setDataInternal(id, data);
	}

	private setDataInternal(id: number, data: string, notify = true) {
		this.validateString(data);
		const node = this.node(id);
		if (node.kind !== "text" && node.kind !== "comment")
			throw new AgentBrowserError(
				"invalid-input",
				"Only text/comment nodes have data",
			);
		if (node.data === data) {
			if (notify) this.mutation("characterData", id, { oldValue: data });
			return;
		}
		const previous = node.data;
		const change = data.length - node.data.length;
		this.checkTextBudget(change);
		node.data = data;
		this.textCodeUnits += change;
		if (notify) this.mutation("characterData", id, { oldValue: previous });
		this.changed("text", id);
	}

	substringData(id: number, offset: number, count: number) {
		const node = this.characterData(id);
		this.checkDataOffset(node, offset, count);
		return node.data.slice(offset, offset + count);
	}

	replaceData(id: number, offset: number, count: number, data: string) {
		this.validateString(data);
		const node = this.characterData(id);
		this.checkDataOffset(node, offset, count);
		const end = Math.min(node.data.length, offset + count);
		this.checkTextBudget(data.length - (end - offset));
		this.setData(id, node.data.slice(0, offset) + data + node.data.slice(end));
	}

	splitText(id: number, offset: number) {
		const node = this.characterData(id);
		if (node.kind !== "text")
			throw new AgentBrowserError("invalid-input", "Only text nodes can split");
		this.checkDataOffset(node, offset, 0);
		const suffix = node.data.slice(offset);
		const previous = node.data;
		const following = this.allocate("text", "", "");
		this.setDataInternal(id, node.data.slice(0, offset), false);
		this.setDataInternal(following, suffix, false);
		if (node.parent !== null) {
			const parent = this.node(node.parent);
			const nextSibling =
				parent.children[parent.children.indexOf(id) + 1] ?? null;
			parent.children.splice(parent.children.indexOf(id) + 1, 0, following);
			this.node(following).parent = parent.id;
			this.childMutation(parent.id, [following], [], id, nextSibling);
			this.changed("insert", following);
		}
		this.mutation("characterData", id, { oldValue: previous });
		return following;
	}

	wholeText(id: number) {
		const node = this.characterData(id);
		if (node.kind !== "text")
			throw new AgentBrowserError(
				"invalid-input",
				"Only text nodes have wholeText",
			);
		if (node.parent === null) return node.data;
		const siblings = this.node(node.parent).children;
		let start = siblings.indexOf(id);
		while (start > 0 && this.node(siblings[start - 1]).kind === "text") start--;
		const parts: string[] = [];
		for (let index = start; index < siblings.length; index++) {
			const sibling = this.node(siblings[index]);
			if (sibling.kind !== "text") break;
			parts.push(sibling.data);
		}
		return parts.join("");
	}

	normalize(id: number) {
		const plans: {
			parent: MutableNode;
			survivor?: MutableNode;
			members: MutableNode[];
			previousSibling: number | null;
			nextSibling: number | null;
		}[] = [];
		const pending = [
			{ parent: this.node(id), index: 0, children: [] as number[] },
		];
		const parents = [...pending];
		let additional = 0;
		while (pending.length) {
			const frame = pending[pending.length - 1];
			const { parent } = frame;
			if (frame.index >= parent.children.length) {
				pending.pop();
				continue;
			}
			const node = this.node(parent.children[frame.index]);
			if (node.kind !== "text") {
				frame.children.push(node.id);
				frame.index++;
				if (node.children.length) {
					const child = { parent: node, index: 0, children: [] as number[] };
					pending.push(child);
					parents.push(child);
				}
				continue;
			}
			const members: MutableNode[] = [];
			const previousSibling = frame.children.at(-1) ?? null;
			let length = 0;
			while (frame.index < parent.children.length) {
				const member = this.node(parent.children[frame.index]);
				if (member.kind !== "text") break;
				frame.index++;
				members.push(member);
				length += member.data.length;
			}
			const survivor = members.find((member) => member.data.length > 0);
			if (survivor) {
				additional += length - survivor.data.length;
				frame.children.push(survivor.id);
			}
			plans.push({
				parent,
				survivor,
				members,
				previousSibling,
				nextSibling: parent.children[frame.index] ?? null,
			});
		}
		this.checkTextBudget(additional);
		for (const { parent, children } of parents) {
			if (children.length === parent.children.length) continue;
			parent.children = children;
			this.nodeViews.delete(parent.id);
		}
		for (const plan of plans) {
			for (const member of plan.members)
				if (member !== plan.survivor) {
					member.parent = null;
					this.nodeViews.delete(member.id);
				}
		}
		for (const plan of plans) {
			let previousSibling = plan.previousSibling;
			for (let index = 0; index < plan.members.length; index++) {
				const member = plan.members[index];
				if (member === plan.survivor) {
					this.setData(
						member.id,
						plan.members.map((entry) => entry.data).join(""),
					);
					previousSibling = member.id;
				} else {
					this.childMutation(
						plan.parent.id,
						[],
						[member.id],
						previousSibling,
						plan.members[index + 1]?.id ?? plan.nextSibling,
					);
					this.changed("remove", member.id);
				}
			}
		}
	}

	private characterData(id: number) {
		const node = this.node(id);
		if (node.kind !== "text" && node.kind !== "comment")
			throw new AgentBrowserError(
				"invalid-input",
				"Only text/comment nodes have data",
			);
		return node;
	}

	private checkDataOffset(node: MutableNode, offset: number, count: number) {
		for (const value of [offset, count])
			if (!Number.isSafeInteger(value) || value < 0 || value > 4_294_967_295)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid character data offset or count",
				);
		if (offset > node.data.length)
			throw new DOMException(
				"Offset exceeds character data length",
				"IndexSizeError",
			);
	}

	getCustomValidity(id: number): string {
		this.element(id);
		return this.customValidity.get(id) ?? "";
	}

	setCustomValidity(id: number, message: string) {
		this.element(id);
		this.validateString(message);
		const value = message.replace(/\r\n?/g, "\n");
		const previous = this.customValidity.get(id) ?? "";
		if (previous === value) return;
		const change = value.length - previous.length;
		this.checkTextBudget(change);
		if (value) this.customValidity.set(id, value);
		else this.customValidity.delete(id);
		this.textCodeUnits += change;
		this.changed("control", id);
	}

	wasUserEditedValue(id: number): boolean {
		this.element(id);
		return this.userEditedValues.has(id);
	}

	setControl(
		id: number,
		state: ControlState,
		origin: "script" | "user" = "script",
	) {
		const node = this.element(id);
		if (!state || typeof state !== "object" || Array.isArray(state))
			throw new AgentBrowserError("invalid-input", "Invalid control state");
		if (
			!["script", "user"].includes(origin) ||
			(origin === "user" &&
				(!["input", "textarea"].includes(node.tagName) ||
					state.value === undefined))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid control value origin",
			);
		for (const [key, value] of Object.entries(state)) {
			if (key === "value") this.validateString(value);
			else if (
				!["checked", "selected", "indeterminate"].includes(key) ||
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
		if (state.value !== undefined) {
			if (origin === "user") this.userEditedValues.add(id);
			else this.userEditedValues.delete(id);
		}
		if (node.tagName === "input" && state.value !== undefined)
			this.inputValues.markDirty(id);
		if (node.tagName === "option" && state.selected !== undefined)
			this.selections.setOption(id, state.selected);
		if (node.tagName === "input" && state.checked !== undefined)
			this.checkedness.set(id, state.checked);
		this.changed("control", id);
	}

	setInputChecked(id: number, checked: boolean, dirty = true) {
		const node = this.element(id);
		if (
			node.tagName !== "input" ||
			typeof checked !== "boolean" ||
			typeof dirty !== "boolean"
		)
			throw new AgentBrowserError("invalid-input", "Invalid input checkedness");
		this.checkedness.set(id, checked, dirty);
	}

	setSelectSelection(
		id: number,
		selected: readonly number[],
		dirtyAll = false,
	) {
		this.ensureOpen();
		if (typeof dirtyAll !== "boolean")
			throw new AgentBrowserError(
				"invalid-input",
				"Expected boolean selection dirtiness",
			);
		this.selections.setSelect(id, selected, dirtyAll);
	}

	setOptionSelected(id: number, selected: boolean) {
		this.ensureOpen();
		if (typeof selected !== "boolean")
			throw new AgentBrowserError(
				"invalid-input",
				"Expected boolean selected state",
			);
		this.selections.setOption(id, selected);
	}

	clearControl(id: number, fields: readonly (keyof ControlState)[]) {
		const node = this.element(id);
		if (
			!Array.isArray(fields) ||
			fields.length > 4 ||
			fields.some(
				(field) =>
					!["value", "checked", "selected", "indeterminate"].includes(field),
			)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid control reset fields",
			);
		let changed = false;
		for (const field of new Set<keyof ControlState>(fields)) {
			if (field === "value" && this.userEditedValues.delete(id)) changed = true;
			if (field === "value" && node.tagName === "input")
				this.inputValues.reset(id);
			if (field === "checked" && node.tagName === "input") {
				this.checkedness.clear(id);
				continue;
			}
			if (field === "selected" && node.tagName === "option") {
				this.selections.clearOption(id);
				continue;
			}
			if (!Object.hasOwn(node.control, field)) continue;
			if (field === "value")
				this.textCodeUnits -= node.control.value?.length ?? 0;
			delete node.control[field];
			changed = true;
		}
		if (changed) this.changed("control", id);
	}

	textContent(id: number) {
		const parts: string[] = [];
		for (const { node } of this.walk(id))
			if (node.kind === "text") parts.push(node.data);
		return parts.join("");
	}

	setTextContent(id: number, data: string) {
		this.validateString(data);
		const node = this.node(id);
		if (node.kind === "document" || node.kind === "doctype") return;
		if (node.kind === "text" || node.kind === "comment") {
			this.setData(id, data);
			return;
		}
		let replacement: number | undefined;
		if (data !== "") {
			let depth = 0;
			let ancestor: MutableNode | undefined = node;
			while (ancestor) {
				depth++;
				ancestor =
					ancestor.parent === null ? undefined : this.node(ancestor.parent);
			}
			if (depth > this.limits.maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Document depth limit exceeded",
				);
			replacement = this.createText(data);
		}
		const removed = [...node.children];
		for (const child of removed) this.removeInternal(child, true);
		if (replacement !== undefined)
			this.insertInternal(id, replacement, undefined, true);
		this.childMutation(
			id,
			replacement === undefined ? [] : [replacement],
			removed,
		);
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
		return this.rootOf(id) === this.root;
	}

	rootOf(id: number) {
		let node = this.node(id);
		while (node.parent !== null) node = this.node(node.parent);
		return node.id;
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

	onChange(handler: (change: Readonly<DocumentChange>) => void) {
		this.ensureOpen();
		if (typeof handler !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document change handler",
			);
		if (!this.changeHandlers.has(handler) && this.changeHandlers.size >= 32)
			throw new AgentBrowserError(
				"resource-limit",
				"Document change handler limit exceeded",
			);
		this.changeHandlers.add(handler);
		return () => {
			this.changeHandlers.delete(handler);
		};
	}

	onMutation(handler: (record: DocumentMutation) => void) {
		this.ensureOpen();
		if (typeof handler !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document mutation collector",
			);
		if (!this.mutationHandlers.has(handler) && this.mutationHandlers.size >= 32)
			throw new AgentBrowserError(
				"resource-limit",
				"Document mutation collector limit exceeded",
			);
		this.mutationHandlers.add(handler);
		return () => {
			this.mutationHandlers.delete(handler);
		};
	}

	mutationMetrics() {
		return Object.freeze({
			collectors: this.mutationHandlers.size,
			notifications: this.mutationNotifications,
			collectorFailures: this.mutationCollectorFailures,
			closed: this.closed,
		});
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
		this.unregisterResources?.();
		this.unregisterResources = undefined;
		this.selections.close();
		this.checkedness.close();
		this.inputValues.close();
		this.customValidity.clear();
		this.userEditedValues.clear();
		this.nodes.clear();
		this.attachedDoctype = undefined;
		this.nodeViews.clear();
		this.attributeRecords.clear();
		this.attachedAttributes.clear();
		this.currentTarget = null;
		this.currentFocus = null;
		this.changes = [];
		this.changeHandlers.clear();
		this.mutationHandlers.clear();
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
		this.resources?.check(1);
		if (
			this.nodeCount >= this.limits.maxNodes ||
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
			attributes: createHtmlAttributes(),
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

	private inputValueDelta(id: number, change: InputValueChange | undefined) {
		if (!change) return 0;
		const node = this.node(id);
		let delta = (change.value?.length ?? 0) - (node.control.value?.length ?? 0);
		if (change.defaultValue !== undefined) {
			const previous = node.attributes.value;
			delta +=
				change.defaultValue.length -
				(previous?.length ?? 0) +
				(previous === undefined ? "value".length : 0);
			const attributeId = this.attachedAttributes.get(id)?.get("value");
			if (attributeId !== undefined)
				delta +=
					change.defaultValue.length -
					this.attributeRecord(attributeId).value.length;
		}
		return delta;
	}

	private applyInputValueChange(
		id: number,
		change: InputValueChange | undefined,
	) {
		if (!change) return;
		if (!change.dirty || this.node(id).control.value !== change.value)
			this.userEditedValues.delete(id);
		this.textCodeUnits += this.inputValueDelta(id, change);
		if (change.defaultValue !== undefined) {
			setHtmlAttribute(this.node(id).attributes, "value", change.defaultValue);
			const attributeId = this.attachedAttributes.get(id)?.get("value");
			if (attributeId !== undefined)
				this.attributeRecord(attributeId).value = change.defaultValue;
		}
		this.inputValues.apply(id, change);
	}

	private checkTextBudget(change: number) {
		this.resources?.check(0, change);
		if (this.textCodeUnits + change > this.limits.maxTextCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Document text limit exceeded",
			);
	}

	private childMutation(
		target: number,
		addedNodes: readonly number[],
		removedNodes: readonly number[],
		previousSibling: number | null = null,
		nextSibling: number | null = null,
	) {
		if (!addedNodes.length && !removedNodes.length) return;
		this.mutation("childList", target, {
			addedNodes,
			removedNodes,
			previousSibling,
			nextSibling,
		});
	}

	private mutation(
		type: DocumentMutation["type"],
		target: number,
		values: Partial<DocumentMutation>,
		invalidate = true,
	) {
		if (!this.mutationHandlers.size) return;
		if (invalidate) {
			this.nodeViews.delete(target);
			for (const id of [
				...(values.addedNodes ?? []),
				...(values.removedNodes ?? []),
			])
				this.nodeViews.delete(id);
		}
		const ancestors: number[] = [];
		let ancestor: number | null = target;
		while (ancestor !== null) {
			ancestors.push(ancestor);
			ancestor = this.node(ancestor).parent;
		}
		const record: DocumentMutation = Object.freeze({
			type,
			target,
			ancestors: Object.freeze(ancestors),
			addedNodes: Object.freeze([...(values.addedNodes ?? [])]),
			removedNodes: Object.freeze([...(values.removedNodes ?? [])]),
			previousSibling: values.previousSibling ?? null,
			nextSibling: values.nextSibling ?? null,
			attributeName: values.attributeName ?? null,
			attributeNamespace: null,
			oldValue: values.oldValue ?? null,
		});
		this.mutationNotifications++;
		for (const handler of [...this.mutationHandlers]) {
			if (!this.mutationHandlers.has(handler)) continue;
			try {
				handler(record);
			} catch {
				this.mutationCollectorFailures++;
			}
		}
	}

	private changed(kind: DocumentChange["kind"], target: number) {
		if (kind === "insert" && this.nodes.get(target)?.kind === "doctype")
			this.attachedDoctype = target;
		else if (kind === "remove" && this.attachedDoctype === target)
			this.attachedDoctype = undefined;
		if (["insert", "remove", "attribute", "text", "control"].includes(kind))
			this.nodeViews.delete(target);
		if (kind === "insert") {
			const parent = this.nodes.get(target)?.parent;
			if (parent !== null && parent !== undefined)
				this.nodeViews.delete(parent);
		}
		this.currentRevision++;
		this.changes.push({ revision: this.currentRevision, kind, target });
		if (this.changes.length > this.limits.maxChanges) this.changes.shift();
		if (this.changeHandlers.size) {
			const change = Object.freeze({
				revision: this.currentRevision,
				kind,
				target,
			});
			for (const handler of [...this.changeHandlers]) handler(change);
		}
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document is closed");
	}
}
