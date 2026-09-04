import { contentEditableState } from "./content-editability.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import {
	type DomBoundaryPoint,
	type DomRange,
	domRangeOwner,
} from "./dom-range.js";
import {
	type EditableBlockMergePlan,
	planEditableBlockMerge,
} from "./editable-block-merge.js";
import { editableFillHost } from "./editable-fill.js";
import { planEditableParagraph } from "./editable-paragraph.js";
import { AgentBrowserError } from "./errors.js";
import type { EventAction } from "./event-actions.js";
import { type DocumentFocus, focusTabIndex } from "./focus.js";
import { htmlDocumentFamily } from "./html-document-family.js";
import { isInertSubtree } from "./inertness.js";
import { BrowserInputEvent } from "./input-events.js";
import type { KeyboardKey } from "./keyboard-state.js";
import { nextOffset, previousOffset } from "./keyboard-text.js";
import { documentStyles } from "./styles.js";

const protectedTags = new Set([
	"input",
	"textarea",
	"select",
	"button",
	"option",
	"optgroup",
	"img",
	"hr",
	"iframe",
	"frame",
	"object",
	"embed",
	"audio",
	"video",
	"canvas",
	"svg",
	"math",
	"template",
	"script",
	"style",
	"link",
	"meta",
]);
const blockTags = new Set([
	"address",
	"article",
	"aside",
	"blockquote",
	"div",
	"dl",
	"dt",
	"dd",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"li",
	"main",
	"nav",
	"ol",
	"p",
	"pre",
	"section",
	"table",
	"td",
	"th",
	"tr",
	"ul",
]);

export const editableKeyboardCapabilities = Object.freeze({
	partial: true,
	selection: "shared-dom-range-owner",
	maxNodes: 4096,
	maxDepth: 256,
	maxTextCodeUnits: 65_536,
	stepping: "unicode-code-point",
	homeEnd: "hard-newlines-and-html-block-boundaries",
	paragraphInsertion: "bounded-simple-structures",
	paragraphMerging: "bounded-adjacent-p-div",
	composition: false,
	geometry: false,
});

interface Span {
	node: number;
	start: number;
	end: number;
	kind: "text" | "break" | "protected";
	before: DomBoundaryPoint;
	after: DomBoundaryPoint;
}

interface PositionMap {
	start: number;
	end: number;
	offsets?: number[];
}

function fail(message: string): never {
	throw new AgentBrowserError("not-actionable", message);
}

function samePoint(
	first: DomBoundaryPoint | null,
	second: DomBoundaryPoint | null,
) {
	return first?.node === second?.node && first?.offset === second?.offset;
}

class EditableText {
	readonly nodes: Readonly<DocumentNode>[] = [];
	readonly ancestors: Readonly<DocumentNode>[] = [];
	readonly spans: Span[] = [];
	readonly positions = new Map<number, PositionMap>();
	text = "";

	constructor(
		readonly tree: DocumentTree,
		readonly host: number,
	) {
		for (const { node, depth } of tree.walk(host)) {
			if (this.nodes.length >= editableKeyboardCapabilities.maxNodes)
				throw new AgentBrowserError(
					"resource-limit",
					"Editable subtree node limit exceeded",
				);
			if (depth > editableKeyboardCapabilities.maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Editable subtree depth limit exceeded",
				);
			this.nodes.push(node);
		}
		let ancestor = tree.get(host).parent;
		while (ancestor !== null) {
			if (this.ancestors.length >= editableKeyboardCapabilities.maxDepth)
				throw new AgentBrowserError(
					"resource-limit",
					"Editable ancestor depth limit exceeded",
				);
			const node = tree.get(ancestor);
			this.ancestors.push(node);
			ancestor = node.parent;
		}
		this.visit(host);
	}

	unchanged(): boolean {
		return [...this.nodes, ...this.ancestors].every(
			(node) => this.tree.get(node.id) === node,
		);
	}

	index(point: DomBoundaryPoint): number {
		const mapped = this.positions.get(point.node);
		if (!mapped)
			fail(
				"Selection boundary is outside editable text or inside protected content",
			);
		const node = this.tree.get(point.node);
		if (node.kind === "text") {
			if (
				point.offset < 0 ||
				point.offset > node.data.length ||
				(point.offset > 0 &&
					point.offset < node.data.length &&
					/[\uD800-\uDBFF]/.test(node.data[point.offset - 1]) &&
					/[\uDC00-\uDFFF]/.test(node.data[point.offset]))
			)
				fail(
					"Selection boundary splits a Unicode scalar or exceeds text length",
				);
			return mapped.start + point.offset;
		}
		const offset = mapped.offsets?.[point.offset];
		if (offset === undefined) fail("Invalid editable container boundary");
		return offset;
	}

	point(offset: number, forward: boolean): DomBoundaryPoint {
		const candidates = this.spans.filter(
			(span) => span.start <= offset && offset <= span.end,
		);
		const span = forward ? candidates.at(-1) : candidates[0];
		if (!span) return { node: this.host, offset: 0 };
		if (span.kind === "text")
			return { node: span.node, offset: offset - span.start };
		return offset === span.start ? span.before : span.after;
	}

	block(point: DomBoundaryPoint): number {
		let node = this.tree.get(point.node);
		while (node.id !== this.host && !blockTags.has(node.tagName)) {
			if (node.parent === null) fail("Selection left its editing host");
			node = this.tree.get(node.parent);
		}
		return node.id;
	}

	check(start: DomBoundaryPoint, end: DomBoundaryPoint) {
		this.index(start);
		this.index(end);
		const owner = domRangeOwner(this.tree);
		for (const span of this.spans) {
			if (span.kind !== "protected") continue;
			if (
				owner.compare(start, span.after) < 0 &&
				owner.compare(end, span.before) > 0
			)
				fail(
					"Editing across protected or noneditable content is not supported",
				);
		}
	}

	private visit(id: number) {
		const node = this.tree.get(id);
		const start = this.text.length;
		if (node.kind === "text") {
			this.append(node.data);
			this.positions.set(id, { start, end: this.text.length });
			this.spans.push({
				node: id,
				start,
				end: this.text.length,
				kind: "text",
				before: { node: id, offset: 0 },
				after: { node: id, offset: node.data.length },
			});
			return;
		}
		const blocked =
			id !== this.host &&
			(node.kind !== "element" ||
				contentEditableState(node) === "false" ||
				protectedTags.has(node.tagName) ||
				isInertSubtree(this.tree, id) ||
				Object.hasOwn(node.attributes, "hidden") ||
				!documentStyles(this.tree).get(id).visible);
		if (blocked || node.tagName === "br") {
			const parent = node.parent as number;
			const index = this.tree.get(parent).children.indexOf(id);
			this.append(blocked ? "\uFFFC" : "\n");
			this.spans.push({
				node: id,
				start,
				end: this.text.length,
				kind: blocked ? "protected" : "break",
				before: { node: parent, offset: index },
				after: { node: parent, offset: index + 1 },
			});
			return;
		}
		const offsets = [start];
		for (const child of node.children) {
			this.visit(child);
			offsets.push(this.text.length);
		}
		this.positions.set(id, { start, end: this.text.length, offsets });
	}

	private append(text: string) {
		if (
			this.text.length + text.length >
			editableKeyboardCapabilities.maxTextCodeUnits
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Editable text navigation limit exceeded",
			);
		this.text += text;
	}
}

export class EditableKeyboard {
	constructor(
		private readonly tree: DocumentTree,
		private readonly focus: DocumentFocus,
		private readonly focusGeneration: () => number,
	) {}

	host(id: number): number | null {
		const node = this.tree.get(id);
		if (protectedTags.has(node.tagName)) return null;
		return editableFillHost(this.tree, id);
	}

	validate(id: number): number {
		const host = this.host(id);
		if (
			host === null ||
			this.tree.isTemplateContentsDocument ||
			htmlDocumentFamily(this.tree) !== undefined ||
			this.tree.generatedFocusReference !== null ||
			this.focus.active() !== id ||
			focusTabIndex(this.tree, id) === null ||
			!this.tree.isConnected(host) ||
			isInertSubtree(this.tree, host)
		)
			fail("Contenteditable focus or editing host is no longer actionable");
		return host;
	}

	collapseEnd(id: number, target: number) {
		const host = editableFillHost(this.tree, id);
		if (
			host === null ||
			this.focus.active() !== id ||
			editableFillHost(this.tree, target) !== host
		)
			fail("Editable fill target changed before caret placement");
		const owner = domRangeOwner(this.tree);
		const node = this.tree.get(target);
		const last = node.children.at(-1);
		const text = last === undefined ? undefined : this.tree.get(last);
		owner.selection.collapse(
			text?.kind === "text" ? text.id : target,
			text?.kind === "text" ? text.data.length : node.children.length,
		);
	}

	*key(id: number, key: KeyboardKey, shortcut: boolean): EventAction<boolean> {
		if (shortcut) {
			if (
				!key.alt &&
				!key.shift &&
				key.control !== key.meta &&
				key.key.toLowerCase() === "a"
			)
				this.selectAll(id);
		} else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(key.key))
			this.move(id, key);
		else if (key.key === "Enter")
			return yield* this.edit(
				id,
				"",
				key.shift ? "insertLineBreak" : "insertParagraph",
				null,
				true,
			);
		else if (key.key === "Backspace" || key.key === "Delete")
			return yield* this.edit(
				id,
				"",
				key.key === "Backspace"
					? "deleteContentBackward"
					: "deleteContentForward",
				null,
			);
		else if (Array.from(key.key).length === 1)
			return yield* this.edit(id, key.key, "insertText", key.key);
		return true;
	}

	private selectAll(id: number) {
		const host = this.validate(id);
		new EditableText(this.tree, host);
		domRangeOwner(this.tree).selection.selectAllChildren(host);
	}

	private move(id: number, key: KeyboardKey) {
		const { model, range } = this.current(id);
		const selection = domRangeOwner(this.tree).selection;
		let point: DomBoundaryPoint;
		if (
			!key.shift &&
			!range.collapsed &&
			(key.key === "ArrowLeft" || key.key === "ArrowRight")
		)
			point = key.key === "ArrowLeft" ? range.start : range.end;
		else {
			const focus = selection.focus as DomBoundaryPoint;
			const offset = model.index(focus);
			let next = offset;
			if (key.key === "ArrowLeft") next = previousOffset(model.text, offset);
			else if (key.key === "ArrowRight") next = nextOffset(model.text, offset);
			else {
				const bounds = model.positions.get(model.block(focus)) as PositionMap;
				if (key.key === "Home")
					next = Math.max(
						bounds.start,
						offset > 0 ? model.text.lastIndexOf("\n", offset - 1) + 1 : 0,
					);
				else if (key.key === "End") {
					const newline = model.text.indexOf("\n", offset);
					next = newline < 0 ? bounds.end : Math.min(bounds.end, newline);
				}
			}
			point =
				next === offset
					? focus
					: model.point(next, key.key === "ArrowRight" || key.key === "Home");
			model.index(point);
		}
		if (key.shift) selection.extend(point.node, point.offset);
		else this.collapse(range, point);
	}

	*edit(
		id: number,
		text: string,
		inputType: string,
		data: string | null,
		paragraph = false,
	): EventAction<boolean> {
		const { host, model, range } = this.current(id);
		const owner = domRangeOwner(this.tree);
		const selection = owner.selection;
		let start = range.start;
		let end = range.end;
		let merge: EditableBlockMergePlan | undefined;
		if (
			range.collapsed &&
			(inputType === "deleteContentBackward" ||
				inputType === "deleteContentForward")
		) {
			merge = planEditableBlockMerge(
				this.tree,
				host,
				range,
				inputType === "deleteContentBackward",
				id,
			);
			if (merge?.kind === "edge") return true;
		}
		if (
			!merge &&
			range.collapsed &&
			(inputType === "deleteContentBackward" ||
				inputType === "deleteContentForward")
		) {
			const offset = model.index(start);
			const backward = inputType === "deleteContentBackward";
			const next = backward
				? previousOffset(model.text, offset)
				: nextOffset(model.text, offset);
			if (next === offset) return true;
			let point = model.point(next, !backward);
			if (model.block(point) !== model.block(start)) {
				const alternative = model.point(next, backward);
				if (model.block(alternative) === model.block(start))
					point = alternative;
			}
			if (model.block(point) !== model.block(start))
				throw new AgentBrowserError(
					"unsupported",
					"Automatic paragraph merging is unsupported at this boundary",
				);
			if (backward) start = point;
			else end = point;
		}
		model.check(start, end);
		const insertion = paragraph
			? planEditableParagraph(
					this.tree,
					host,
					range,
					inputType === "insertLineBreak",
				)
			: undefined;
		const eventType = insertion?.inputType ?? inputType;
		const insertedText = insertion?.plaintext ? "\n" : text;
		if (samePoint(start, end) && !text && !insertion && !merge) return true;
		const anchor = selection.anchor;
		const focus = selection.focus;
		const generation = this.focusGeneration();
		if (
			!(yield {
				target: host,
				event: new BrowserInputEvent("beforeinput", data, eventType, true),
			})
		)
			return false;
		if (
			this.validate(id) !== host ||
			generation !== this.focusGeneration() ||
			!model.unchanged() ||
			selection.rangeCount !== 1 ||
			selection.getRangeAt(0) !== range ||
			!samePoint(anchor, selection.anchor) ||
			!samePoint(focus, selection.focus)
		)
			fail("Editable subtree or selection changed during beforeinput");
		new EditableText(this.tree, host).check(start, end);
		if (merge?.kind === "merge") merge.apply(range);
		else if (insertion && !insertion.plaintext) insertion.apply(range);
		else this.apply(range, start, end, insertedText);
		yield {
			target: host,
			event: new BrowserInputEvent("input", data, eventType),
		};
		return true;
	}

	private current(id: number) {
		const host = this.validate(id);
		const model = new EditableText(this.tree, host);
		const owner = domRangeOwner(this.tree);
		const selection = owner.selection;
		if (!selection.rangeCount) {
			if (selection.anchor !== null)
				fail("Selected range is detached from the active document");
			selection.collapse(host, this.tree.get(host).children.length);
		}
		const range = selection.getRangeAt(0);
		model.index(range.start);
		model.index(range.end);
		return { host, model, range };
	}

	private collapse(range: DomRange, point: DomBoundaryPoint) {
		range.setStart(point.node, point.offset);
		range.collapse(true);
	}

	private apply(
		range: DomRange,
		start: DomBoundaryPoint,
		end: DomBoundaryPoint,
		text: string,
	) {
		const owner = domRangeOwner(this.tree);
		const startNode = this.tree.get(start.node);
		if (start.node === end.node && startNode.kind === "text") {
			owner.replaceText(
				start.node,
				start.offset,
				end.offset - start.offset,
				text,
			);
			this.collapse(range, {
				node: start.node,
				offset: start.offset + text.length,
			});
			return;
		}
		const endNode = this.tree.get(end.node);
		const released =
			(startNode.kind === "text" ? startNode.data.length - start.offset : 0) +
			(endNode.kind === "text" && end.node !== start.node ? end.offset : 0);
		if (
			text.length + this.tree.resourceUsage().textCodeUnits - released >
			this.tree.limits.maxTextCodeUnits
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Editable insertion text limit exceeded",
			);
		const apply = (insertion: DomRange, deletion?: DomRange) => {
			let allocated: number | undefined;
			if (text && startNode.kind !== "text") {
				let depth = 1;
				let ancestor = startNode.parent;
				while (ancestor !== null) {
					depth++;
					ancestor = this.tree.get(ancestor).parent;
				}
				if (depth > this.tree.limits.maxDepth)
					throw new AgentBrowserError(
						"resource-limit",
						"Editable insertion depth limit exceeded",
					);
				allocated = this.tree.createText("");
			}
			deletion?.deleteContents();
			const point = insertion.start;
			if (!text) {
				this.collapse(range, point);
				return;
			}
			if (this.tree.get(point.node).kind === "text") {
				owner.replaceText(point.node, point.offset, 0, text);
				this.collapse(range, {
					node: point.node,
					offset: point.offset + text.length,
				});
			} else {
				const node = allocated as number;
				this.tree.setData(node, text);
				this.tree.insert(
					point.node,
					node,
					this.tree.get(point.node).children[point.offset],
				);
				this.collapse(range, { node, offset: text.length });
			}
		};
		if (!samePoint(start, end)) {
			owner.withTemporaryRange(range, (insertion) => {
				this.collapse(insertion, start);
				owner.withTemporaryRange(range, (deletion) => {
					deletion.setStart(start.node, start.offset);
					deletion.setEnd(end.node, end.offset);
					apply(insertion, deletion);
				});
			});
		} else {
			apply(range);
		}
	}
}
