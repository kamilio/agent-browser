import {
	type DomBoundaryPoint,
	type DomRange,
	type DomRangeOwner,
	rangeError,
} from "./dom-range.js";

export class DomSelection {
	private selected: DomRange | null = null;
	private backwards = false;
	private directional = false;

	constructor(readonly owner: DomRangeOwner) {}

	get rangeCount() {
		this.owner.ensureOpen();
		return this.visible() ? 1 : 0;
	}
	get anchor(): DomBoundaryPoint | null {
		this.owner.ensureOpen();
		return this.selected === null
			? null
			: this.backwards
				? this.selected.end
				: this.selected.start;
	}
	get focus(): DomBoundaryPoint | null {
		this.owner.ensureOpen();
		return this.selected === null
			? null
			: this.backwards
				? this.selected.start
				: this.selected.end;
	}
	get anchorNode() {
		return this.visible() ? (this.anchor?.node ?? null) : null;
	}
	get anchorOffset() {
		return this.visible() ? (this.anchor?.offset ?? 0) : 0;
	}
	get focusNode() {
		return this.visible() ? (this.focus?.node ?? null) : null;
	}
	get focusOffset() {
		return this.visible() ? (this.focus?.offset ?? 0) : 0;
	}
	get isCollapsed() {
		this.owner.ensureOpen();
		return this.selected?.collapsed ?? true;
	}
	get type() {
		return this.rangeCount === 0
			? "None"
			: this.isCollapsed
				? "Caret"
				: "Range";
	}
	get direction() {
		this.owner.ensureOpen();
		return !this.selected || !this.directional
			? "none"
			: this.backwards
				? "backward"
				: "forward";
	}

	getRangeAt(index: number): DomRange {
		this.owner.ensureOpen();
		if (index !== 0 || !this.selected || !this.visible())
			rangeError("IndexSizeError", "Selection has no range at this index");
		return this.selected;
	}

	addRange(range: DomRange) {
		this.owner.ensureOpen();
		if (range.owner !== this.owner)
			rangeError("WrongDocumentError", "Range belongs to another owner");
		if (this.rangeCount || !this.owner.tree.isConnected(range.start.node))
			return;
		this.selected = range;
		this.backwards = false;
		this.directional = !range.collapsed;
	}

	removeRange(range: DomRange) {
		this.owner.ensureOpen();
		if (this.selected !== range)
			rangeError("NotFoundError", "Range is not selected");
		this.release();
	}

	removeAllRanges() {
		this.owner.ensureOpen();
		this.release();
	}
	empty() {
		this.removeAllRanges();
	}
	release() {
		this.selected = null;
		this.backwards = false;
		this.directional = false;
	}

	collapse(node: number | null, offset = 0) {
		this.owner.ensureOpen();
		if (node === null) {
			this.release();
			return;
		}
		const point = this.owner.validate(node, offset);
		if (!this.owner.tree.isConnected(node)) return;
		const range = this.owner.createRange();
		range.update(point, point);
		this.selected = range;
		this.backwards = false;
		this.directional = false;
	}

	setPosition(node: number | null, offset = 0) {
		this.collapse(node, offset);
	}
	collapseToStart() {
		this.collapseRange(this.requireRange().start);
	}
	collapseToEnd() {
		this.collapseRange(this.requireRange().end);
	}

	extend(node: number, offset = 0) {
		this.owner.ensureOpen();
		this.owner.tree.get(node);
		if (!this.owner.tree.isConnected(node)) return;
		this.requireRange();
		const anchor = this.anchor as DomBoundaryPoint;
		if (this.owner.tree.rootOf(anchor.node) !== this.owner.tree.rootOf(node)) {
			this.collapse(node, offset);
			this.directional = true;
			return;
		}
		this.setBaseAndExtent(anchor.node, anchor.offset, node, offset);
	}

	setBaseAndExtent(
		anchorNode: number,
		anchorOffset: number,
		focusNode: number,
		focusOffset: number,
	) {
		const anchor = this.owner.validate(anchorNode, anchorOffset);
		const focus = this.owner.validate(focusNode, focusOffset);
		if (
			!this.owner.tree.isConnected(anchorNode) ||
			!this.owner.tree.isConnected(focusNode)
		)
			return;
		const backwards = this.owner.compare(anchor, focus) > 0;
		const range = this.owner.createRange();
		range.update(backwards ? focus : anchor, backwards ? anchor : focus);
		this.selected = range;
		this.backwards = backwards;
		this.directional = true;
	}

	selectAllChildren(node: number) {
		this.owner.validate(node, 0);
		if (!this.owner.tree.isConnected(node)) return;
		const range = this.owner.createRange();
		range.setStart(node, 0);
		range.setEnd(node, this.owner.tree.get(node).children.length);
		this.selected = range;
		this.backwards = false;
		this.directional = true;
	}

	deleteFromDocument() {
		this.owner.ensureOpen();
		if (this.visible()) this.selected?.deleteContents();
	}

	containsNode(node: number, allowPartialContainment = false): boolean {
		this.owner.ensureOpen();
		const value = this.owner.tree.get(node);
		if (!this.selected || !this.visible() || !this.owner.tree.isConnected(node))
			return false;
		if (allowPartialContainment) return this.selected.intersectsNode(node);
		return (
			this.owner.compare(this.selected.start, { node, offset: 0 }) <= 0 &&
			this.owner.compare(this.selected.end, {
				node,
				offset:
					value.kind === "text" || value.kind === "comment"
						? value.data.length
						: value.children.length,
			}) >= 0
		);
	}

	toString() {
		this.owner.ensureOpen();
		return this.selected?.toString() ?? "";
	}

	private visible(): boolean {
		this.owner.ensureOpen();
		return (
			this.selected !== null &&
			this.owner.tree.isConnected(this.selected.start.node) &&
			this.owner.tree.isConnected(this.selected.end.node)
		);
	}

	private collapseRange(point: DomBoundaryPoint) {
		const range = this.owner.createRange();
		range.update(point, point);
		this.selected = range;
	}

	private requireRange(): DomRange {
		this.owner.ensureOpen();
		if (!this.selected) rangeError("InvalidStateError", "Selection is empty");
		return this.selected;
	}
}
