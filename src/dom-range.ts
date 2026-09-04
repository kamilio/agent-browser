import type { DocumentMutation, DocumentTree } from "./document.js";
import { DomSelection } from "./dom-selection.js";
import { AgentBrowserError } from "./errors.js";

export interface DomBoundaryPoint {
	readonly node: number;
	readonly offset: number;
}

const owners = new WeakMap<DocumentTree, DomRangeOwner>();

export function existingDomRangeOwner(
	tree: DocumentTree,
): DomRangeOwner | undefined {
	return owners.get(tree);
}

export function domRangeOwner(tree: DocumentTree): DomRangeOwner {
	tree.get(tree.root);
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DomRangeOwner(tree);
		owners.set(tree, owner);
	}
	return owner;
}

export function rangeError(name: string, message: string): never {
	throw new DOMException(message, name);
}

export class DomRangeOwner {
	readonly selection: DomSelection;
	private readonly ranges = new Set<WeakRef<DomRange>>();
	private readonly parents = new Map<number, number | null>();
	private readonly children = new Map<number, number[]>();
	private readonly unregisterMutation: () => void;
	private readonly unregisterClose: () => unknown;
	private edit?: {
		node: number;
		offset: number;
		count: number;
		length: number;
	};
	private closed = false;

	constructor(readonly tree: DocumentTree) {
		this.selection = new DomSelection(this);
		this.unregisterMutation = tree.onMutation((record) =>
			this.mutation(record),
		);
		try {
			this.unregisterClose = tree.onClose(() => this.close());
		} catch (error) {
			this.unregisterMutation();
			throw error;
		}
	}

	ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "DOM range owner is closed");
		this.tree.get(this.tree.root);
	}

	createRange(): DomRange {
		this.ensureOpen();
		return new DomRange(this);
	}

	register(range: DomRange) {
		this.ensureOpen();
		if (this.ranges.size >= 4096) {
			this.liveRanges();
			if (this.ranges.size >= 4096)
				throw new AgentBrowserError(
					"resource-limit",
					"DOM live range limit exceeded",
				);
		}
		this.ranges.add(new WeakRef(range));
		this.track(this.tree.root);
	}

	validate(node: number, offset: number): DomBoundaryPoint {
		this.ensureOpen();
		const value = this.tree.get(node);
		if (value.kind === "doctype")
			rangeError(
				"InvalidNodeTypeError",
				"A doctype cannot be a boundary container",
			);
		if (
			!Number.isSafeInteger(offset) ||
			offset < 0 ||
			offset > this.length(node)
		)
			rangeError("IndexSizeError", "Range offset exceeds node length");
		this.track(node);
		return Object.freeze({ node, offset });
	}

	length(node: number) {
		const value = this.tree.get(node);
		return value.kind === "text" || value.kind === "comment"
			? value.data.length
			: value.children.length;
	}

	contains(ancestor: number, node: number): boolean {
		let current: number | null = node;
		while (current !== null) {
			if (current === ancestor) return true;
			current = this.tree.get(current).parent;
		}
		return false;
	}

	compare(left: DomBoundaryPoint, right: DomBoundaryPoint): number {
		this.ensureOpen();
		if (this.tree.rootOf(left.node) !== this.tree.rootOf(right.node))
			rangeError("WrongDocumentError", "Boundary points have different roots");
		if (left.node === right.node) return Math.sign(left.offset - right.offset);
		if (this.contains(left.node, right.node)) {
			let child = right.node;
			while (this.tree.get(child).parent !== left.node)
				child = this.tree.get(child).parent as number;
			return left.offset <= this.tree.get(left.node).children.indexOf(child)
				? -1
				: 1;
		}
		if (this.contains(right.node, left.node)) return -this.compare(right, left);
		let ancestor = left.node;
		while (!this.contains(ancestor, right.node))
			ancestor = this.tree.get(ancestor).parent as number;
		let leftChild = left.node;
		let rightChild = right.node;
		while (this.tree.get(leftChild).parent !== ancestor)
			leftChild = this.tree.get(leftChild).parent as number;
		while (this.tree.get(rightChild).parent !== ancestor)
			rightChild = this.tree.get(rightChild).parent as number;
		const siblings = this.tree.get(ancestor).children;
		return Math.sign(
			siblings.indexOf(leftChild) - siblings.indexOf(rightChild),
		);
	}

	replaceText(node: number, offset: number, count: number, text: string) {
		this.validate(node, offset);
		if (this.edit)
			throw new AgentBrowserError("invalid-input", "Reentrant range text edit");
		if (!Number.isSafeInteger(count) || count < 0)
			rangeError("IndexSizeError", "Invalid replacement count");
		this.edit = {
			node,
			offset,
			count: Math.min(count, this.length(node) - offset),
			length: text.length,
		};
		try {
			this.tree.replaceData(node, offset, count, text);
		} finally {
			this.edit = undefined;
		}
	}

	splitText(node: number, offset: number): number {
		this.validate(node, offset);
		if (this.edit)
			throw new AgentBrowserError("invalid-input", "Reentrant range text edit");
		const before = this.liveRanges().map((range) => ({
			range,
			start: range.start,
			end: range.end,
		}));
		const parent = this.tree.get(node).parent;
		const index =
			parent === null ? -1 : this.tree.get(parent).children.indexOf(node);
		this.edit = { node, offset: this.length(node), count: 0, length: 0 };
		let following: number;
		try {
			following = this.tree.splitText(node, offset);
		} finally {
			this.edit = undefined;
		}
		const adjust = (old: DomBoundaryPoint, current: DomBoundaryPoint) => {
			if (old.node === node && old.offset > offset)
				return parent === null
					? { node, offset }
					: { node: following, offset: old.offset - offset };
			if (parent !== null && old.node === parent && old.offset === index + 1)
				return { node: parent, offset: old.offset + 1 };
			return current;
		};
		for (const { range, start, end } of before)
			range.update(adjust(start, range.start), adjust(end, range.end));
		return following;
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterMutation();
		this.unregisterClose();
		this.selection.release();
		this.ranges.clear();
		this.parents.clear();
		this.children.clear();
	}

	private liveRanges(): DomRange[] {
		const result: DomRange[] = [];
		for (const reference of this.ranges) {
			const range = reference.deref();
			if (range) result.push(range);
			else this.ranges.delete(reference);
		}
		return result;
	}

	private track(node: number) {
		let current: number | null = node;
		while (current !== null) {
			const value = this.tree.get(current);
			this.parents.set(current, value.parent);
			this.children.set(current, [...value.children]);
			current = value.parent;
		}
	}

	private mutation(record: DocumentMutation) {
		if (record.type === "attributes") return;
		const ranges = this.liveRanges();
		if (record.type === "characterData") {
			const edit =
				this.edit?.node === record.target
					? this.edit
					: {
							node: record.target,
							offset: 0,
							count: record.oldValue?.length ?? 0,
							length: 0,
						};
			const adjust = (point: DomBoundaryPoint) => {
				if (point.node !== edit.node || point.offset <= edit.offset)
					return point;
				return {
					node: point.node,
					offset:
						point.offset <= edit.offset + edit.count
							? edit.offset
							: point.offset + edit.length - edit.count,
				};
			};
			for (const range of ranges)
				range.update(adjust(range.start), adjust(range.end), false);
			return;
		}
		const siblings = this.children.get(record.target);
		if (!siblings) return;
		let index = record.removedNodes.length
			? siblings.indexOf(record.removedNodes[0])
			: -1;
		if (index < 0)
			index =
				record.previousSibling === null
					? 0
					: siblings.indexOf(record.previousSibling) + 1;
		const removed = new Set(record.removedNodes);
		const adjust = (point: DomBoundaryPoint): DomBoundaryPoint => {
			let ancestor: number | null | undefined = point.node;
			while (ancestor !== null && ancestor !== undefined) {
				if (removed.has(ancestor))
					return { node: record.target, offset: index };
				ancestor = this.parents.get(ancestor);
			}
			if (point.node !== record.target) return point;
			let offset = point.offset;
			if (offset > index)
				offset -= Math.min(record.removedNodes.length, offset - index);
			if (offset > index) offset += record.addedNodes.length;
			return { node: point.node, offset };
		};
		for (const range of ranges)
			range.update(adjust(range.start), adjust(range.end), false);
		siblings.splice(index, record.removedNodes.length, ...record.addedNodes);
		for (const node of record.removedNodes)
			if (this.parents.has(node)) this.parents.set(node, null);
		for (const node of record.addedNodes)
			if (this.parents.has(node)) this.parents.set(node, record.target);
	}
}

interface ContentPlan {
	node: number;
	whole: boolean;
	start?: number;
	end?: number;
	children?: ContentPlan[];
}

export class DomRange {
	private startPoint: DomBoundaryPoint;
	private endPoint: DomBoundaryPoint;

	constructor(readonly owner: DomRangeOwner) {
		this.startPoint = this.endPoint = Object.freeze({
			node: owner.tree.root,
			offset: 0,
		});
		owner.register(this);
	}

	get start() {
		this.owner.ensureOpen();
		return this.startPoint;
	}
	get end() {
		this.owner.ensureOpen();
		return this.endPoint;
	}
	get startContainer() {
		return this.start.node;
	}
	get startOffset() {
		return this.start.offset;
	}
	get endContainer() {
		return this.end.node;
	}
	get endOffset() {
		return this.end.offset;
	}
	get collapsed() {
		return (
			this.start.node === this.end.node && this.start.offset === this.end.offset
		);
	}
	get commonAncestorContainer(): number {
		let container = this.start.node;
		while (!this.owner.contains(container, this.end.node))
			container = this.owner.tree.get(container).parent as number;
		return container;
	}

	update(start: DomBoundaryPoint, end: DomBoundaryPoint, track = true) {
		this.startPoint = track
			? this.owner.validate(start.node, start.offset)
			: Object.freeze({ ...start });
		this.endPoint = track
			? this.owner.validate(end.node, end.offset)
			: Object.freeze({ ...end });
	}

	setStart(node: number, offset: number) {
		const point = this.owner.validate(node, offset);
		if (
			this.owner.tree.rootOf(node) !== this.owner.tree.rootOf(this.end.node) ||
			this.owner.compare(point, this.end) > 0
		)
			this.endPoint = point;
		this.startPoint = point;
	}

	setEnd(node: number, offset: number) {
		const point = this.owner.validate(node, offset);
		if (
			this.owner.tree.rootOf(node) !==
				this.owner.tree.rootOf(this.start.node) ||
			this.owner.compare(point, this.start) < 0
		)
			this.startPoint = point;
		this.endPoint = point;
	}

	setStartBefore(node: number) {
		const point = this.adjacent(node, false);
		this.setStart(point.node, point.offset);
	}
	setStartAfter(node: number) {
		const point = this.adjacent(node, true);
		this.setStart(point.node, point.offset);
	}
	setEndBefore(node: number) {
		const point = this.adjacent(node, false);
		this.setEnd(point.node, point.offset);
	}
	setEndAfter(node: number) {
		const point = this.adjacent(node, true);
		this.setEnd(point.node, point.offset);
	}
	collapse(toStart = false) {
		const point = toStart ? this.start : this.end;
		this.update(point, point);
	}
	selectNode(node: number) {
		this.update(this.adjacent(node, false), this.adjacent(node, true));
	}
	selectNodeContents(node: number) {
		this.update(
			this.owner.validate(node, 0),
			this.owner.validate(node, this.owner.length(node)),
		);
	}
	cloneRange() {
		const range = this.owner.createRange();
		range.update(this.start, this.end);
		return range;
	}
	detach() {
		this.owner.ensureOpen();
	}

	compareBoundaryPoints(how: number, source: DomRange): number {
		this.owner.ensureOpen();
		if (![0, 1, 2, 3].includes(how))
			rangeError("NotSupportedError", "Unknown range comparison mode");
		if (!(source instanceof DomRange) || source.owner !== this.owner)
			rangeError("WrongDocumentError", "Range belongs to another owner");
		return this.owner.compare(
			how === 0 || how === 3 ? this.start : this.end,
			how === 0 || how === 1 ? source.start : source.end,
		);
	}

	comparePoint(node: number, offset: number): number {
		const point = this.owner.validate(node, offset);
		if (this.owner.compare(point, this.start) < 0) return -1;
		return this.owner.compare(point, this.end) > 0 ? 1 : 0;
	}

	isPointInRange(node: number, offset: number): boolean {
		this.owner.ensureOpen();
		if (
			this.owner.tree.rootOf(node) !== this.owner.tree.rootOf(this.start.node)
		)
			return false;
		return this.comparePoint(node, offset) === 0;
	}

	intersectsNode(node: number): boolean {
		this.owner.ensureOpen();
		if (
			this.owner.tree.rootOf(node) !== this.owner.tree.rootOf(this.start.node)
		)
			return false;
		if (this.owner.tree.get(node).parent === null) return true;
		return (
			this.owner.compare(this.adjacent(node, false), this.end) < 0 &&
			this.owner.compare(this.adjacent(node, true), this.start) > 0
		);
	}

	toString(): string {
		const parts: string[] = [];
		if (this.collapsed) return "";
		for (const { node } of this.owner.tree.walk(this.commonAncestorContainer)) {
			if (node.kind !== "text") continue;
			if (
				this.owner.compare(
					{ node: node.id, offset: node.data.length },
					this.start,
				) <= 0 ||
				this.owner.compare({ node: node.id, offset: 0 }, this.end) >= 0
			)
				continue;
			parts.push(
				node.data.slice(
					node.id === this.start.node ? this.start.offset : 0,
					node.id === this.end.node ? this.end.offset : node.data.length,
				),
			);
		}
		return parts.join("");
	}

	cloneContents(): number {
		return this.contents("clone") as number;
	}
	extractContents(): number {
		return this.contents("extract") as number;
	}
	deleteContents(): void {
		this.contents("delete");
	}

	private adjacent(node: number, after: boolean): DomBoundaryPoint {
		this.owner.ensureOpen();
		const parent = this.owner.tree.get(node).parent;
		if (parent === null)
			rangeError("InvalidNodeTypeError", "Node has no parent");
		return {
			node: parent,
			offset:
				this.owner.tree.get(parent).children.indexOf(node) + Number(after),
		};
	}

	private plan(node: number): ContentPlan | null {
		const tree = this.owner.tree;
		const value = tree.get(node);
		if (
			value.parent !== null &&
			this.owner.compare(this.adjacent(node, false), this.start) >= 0 &&
			this.owner.compare(this.adjacent(node, true), this.end) <= 0
		)
			return { node, whole: true };
		if (value.kind === "text" || value.kind === "comment") {
			const start = node === this.start.node ? this.start.offset : 0;
			const end = node === this.end.node ? this.end.offset : value.data.length;
			if (
				this.owner.compare({ node, offset: end }, this.start) < 0 ||
				this.owner.compare({ node, offset: start }, this.end) > 0
			)
				return null;
			return { node, whole: false, start, end };
		}
		if (value.parent !== null && !this.intersectsNode(node)) return null;
		return {
			node,
			whole: false,
			children: value.children
				.map((child) => this.plan(child))
				.filter((entry): entry is ContentPlan => entry !== null),
		};
	}

	private contents(mode: "clone" | "extract" | "delete"): number | undefined {
		this.owner.ensureOpen();
		const tree = this.owner.tree;
		const plans: ContentPlan[] = [];
		if (!this.collapsed) {
			const common = tree.get(this.commonAncestorContainer);
			if (common.kind === "text" || common.kind === "comment") {
				plans.push({
					node: common.id,
					whole: false,
					start: this.start.offset,
					end: this.end.offset,
				});
			} else {
				for (const child of common.children) {
					const plan = this.plan(child);
					if (plan) plans.push(plan);
				}
			}
		}
		if (
			mode !== "delete" &&
			plans.some((plan) => tree.get(plan.node).kind === "doctype")
		)
			rangeError(
				"HierarchyRequestError",
				"Document types cannot be copied into a fragment",
			);
		const fragment = mode === "delete" ? undefined : tree.createFragment();
		if (this.collapsed) return fragment;
		let caret: DomRange | undefined;
		if (mode !== "clone") {
			let point = this.start;
			if (!this.owner.contains(this.start.node, this.end.node)) {
				let reference = this.start.node;
				while (
					!this.owner.contains(
						tree.get(reference).parent as number,
						this.end.node,
					)
				)
					reference = tree.get(reference).parent as number;
				point = this.adjacent(reference, true);
			}
			caret = this.owner.createRange();
			caret.update(point, point);
		}
		const apply = (plan: ContentPlan, parent?: number) => {
			if (plan.whole) {
				if (mode === "delete") tree.remove(plan.node);
				else
					tree.append(
						parent as number,
						mode === "clone" ? tree.clone(plan.node, true) : plan.node,
					);
				return;
			}
			if (plan.start !== undefined && plan.end !== undefined) {
				if (parent !== undefined) {
					const value = tree.get(plan.node);
					const data = value.data.slice(plan.start, plan.end);
					tree.append(
						parent,
						value.kind === "text"
							? tree.createText(data)
							: tree.createComment(data),
					);
				}
				if (mode !== "clone")
					this.owner.replaceText(
						plan.node,
						plan.start,
						plan.end - plan.start,
						"",
					);
				return;
			}
			let container: number | undefined;
			if (parent !== undefined) {
				container = tree.clone(plan.node);
				tree.append(parent, container);
			}
			for (const child of plan.children ?? []) apply(child, container);
		};
		for (const plan of plans) apply(plan, fragment);
		if (caret) this.update(caret.start, caret.start);
		return fragment;
	}
}
