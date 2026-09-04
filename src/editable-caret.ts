import {
	contentEditableState,
	isRootEditableElement,
} from "./content-editability.js";
import { initialPaintStyle } from "./css-paint.js";
import type { DocumentLayout } from "./document-layout.js";
import { documentScrollPosition } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { type DomBoundaryPoint, existingDomRangeOwner } from "./dom-range.js";
import { AgentBrowserError } from "./errors.js";
import { activeFocus } from "./focus.js";
import { isInertSubtree } from "./inertness.js";
import { rangeClientRects } from "./range-geometry.js";
import { type RasterImage, type Rgba, paintRasterRect } from "./raster.js";
import { documentStyles } from "./styles.js";
import type { TextGlyph } from "./text-layout.js";

export const editableCaretLimits = Object.freeze({
	maxWork: 250_000,
	maxGeometryWork: 200_000,
	maxDepth: 256,
	maxPixels: 512,
});
export const editableCaretCapabilities = Object.freeze({
	partial: true,
	profile: "focused-editable-collapsed-glyph-edge",
	blinking: false,
	selectionHighlight: false,
	emptyEditors: false,
	elementBoundaries:
		"focused-block-host-or-direct-paragraph-outer-plain-inline-text-chain",
	softWrapAffinity: false,
	terminalPreservedBreaks: "same-source-exact-chain-after-glyph",
	controlCarets: false,
	ime: false,
	cssCaretColor: false,
	color: "source-text-color",
	workBudget: "bounded-mapping-and-existing-raster-pixel-budget",
	...editableCaretLimits,
});

export type EditableCaretStatus =
	| "absent"
	| "unfocused"
	| "noncollapsed"
	| "outside-editable"
	| "hidden"
	| "unsupported"
	| "limited"
	| "closed"
	| "ready"
	| "painted"
	| "clipped"
	| "transparent";
interface CaretAnchor {
	readonly ref: string;
	readonly formattingId: number;
	readonly offset: number;
	readonly x: number;
	readonly y: number;
	readonly height: number;
	readonly color: Rgba;
}
export interface EditableCaret {
	status: EditableCaretStatus;
	work: number;
	readonly maxWork: number;
	readonly anchor?: Readonly<CaretAnchor>;
}

function elementCaretPoint(
	tree: DocumentTree,
	point: DomBoundaryPoint,
	focused: number,
	charge: (amount?: number) => void,
): DomBoundaryPoint | undefined {
	const container = tree.get(point.node);
	if (
		container.kind !== "element" ||
		!container.children.length ||
		(point.offset !== 0 && point.offset !== container.children.length)
	)
		return;
	const styles = documentStyles(tree);
	if (styles.get(focused).display !== "block") return;
	const paragraph = (id: number) => {
		charge();
		const node = tree.get(id);
		return (
			node.kind === "element" &&
			node.parent === focused &&
			["p", "div"].includes(node.tagName) &&
			contentEditableState(node) === "inherit" &&
			styles.get(id).display === "block" &&
			styles.flow(id).position === "static" &&
			styles.flow(id).float === "none"
		);
	};
	if (container.id !== focused && !paragraph(container.id)) return;
	const end = point.offset !== 0;
	let id = container.children[end ? container.children.length - 1 : 0];
	let depth = 0;
	while (true) {
		charge();
		if (++depth > editableCaretLimits.maxDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Editable caret depth limit exceeded",
			);
		const node = tree.get(id);
		if (node.kind === "text")
			return node.data.length
				? { node: id, offset: end ? node.data.length : 0 }
				: undefined;
		if (
			container.id === focused &&
			depth === 1 &&
			node.children.length &&
			paragraph(id)
		) {
			id = node.children[end ? node.children.length - 1 : 0];
			continue;
		}
		if (
			node.kind !== "element" ||
			!node.children.length ||
			styles.get(id).display !== "inline" ||
			styles.flow(id).position !== "static" ||
			styles.flow(id).float !== "none"
		)
			return;
		const box = styles.box(id);
		for (const side of ["top", "right", "bottom", "left"] as const) {
			charge();
			if (
				box[`margin-${side}`] !== "0px" ||
				box[`padding-${side}`] !== "0px" ||
				box[`border-${side}-style`] !== "none"
			)
				return;
		}
		id = node.children[end ? node.children.length - 1 : 0];
	}
}

function terminalBreakAnchor(
	layout: DocumentLayout,
	ref: string,
	data: string,
	offset: number,
	x: number,
	y: number,
	height: number,
	charge: (amount?: number) => void,
): CaretAnchor | undefined {
	if (offset !== data.length) return;
	let firstBreak = offset;
	while (firstBreak > 0) {
		charge();
		if (!/[\r\n\f]/.test(data[firstBreak - 1])) break;
		firstBreak--;
	}
	if (firstBreak === 0 || firstBreak === offset) return;
	let anchor: CaretAnchor | undefined;
	for (const context of layout.contexts) {
		charge();
		const glyph = context.glyphs.at(-1);
		if (
			!glyph ||
			glyph.ref !== ref ||
			!glyph.visible ||
			glyph.fontSize !== height ||
			glyph.offset + glyph.codeUnits !== firstBreak
		)
			continue;
		let cursor = firstBreak;
		let previousLine = glyph.line - 1;
		for (const line of context.lines) {
			charge();
			if (line.index < glyph.line) continue;
			const boundary = line.sourceBreak;
			if (!boundary) {
				if (cursor !== offset) return;
				continue;
			}
			const source = boundary.sources[0];
			if (
				boundary.sources.length !== 1 ||
				!source ||
				source.ref !== ref ||
				source.formattingId !== glyph.formattingId ||
				source.offset !== cursor ||
				source.codeUnits < 1 ||
				source.codeUnits > 2 ||
				source.offset + source.codeUnits > offset ||
				line.index !== previousLine + 1 ||
				!line.forcedBreak ||
				!boundary.followingLine ||
				boundary.fontSize !== height
			)
				return;
			charge(source.codeUnits);
			if (
				!/^(?:\r\n|[\r\n\f])$/.test(
					data.slice(cursor, cursor + source.codeUnits),
				)
			)
				return;
			cursor += source.codeUnits;
			previousLine = line.index;
		}
		if (cursor !== offset || anchor) return;
		anchor = {
			ref,
			formattingId: glyph.formattingId,
			offset: glyph.offset,
			x,
			y,
			height,
			color: (
				layout.text.horizontal.formatting.nodes[glyph.formattingId].paint ??
				initialPaintStyle
			).color,
		};
	}
	return anchor;
}

export function prepareEditableCaret(
	tree: DocumentTree,
	layout: DocumentLayout,
	maxWork: number = editableCaretLimits.maxWork,
): EditableCaret {
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > editableCaretLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid editable caret work limit",
		);
	let work = 0;
	const charge = (amount = 1) => {
		if (amount > maxWork - work) {
			work = maxWork;
			throw new AgentBrowserError(
				"resource-limit",
				"Editable caret work limit exceeded",
			);
		}
		work += amount;
	};
	const result = (
		status: EditableCaretStatus,
		anchor?: CaretAnchor,
	): EditableCaret => ({
		status,
		work,
		maxWork,
		...(anchor ? { anchor: Object.freeze(anchor) } : {}),
	});
	try {
		const owner = existingDomRangeOwner(tree);
		if (!owner) return result("absent");
		owner.ensureOpen();
		charge();
		const focused = activeFocus(tree);
		if (focused === null || !isRootEditableElement(tree, focused))
			return result("unfocused");
		const selection = owner.selection;
		if (!selection.rangeCount) return result("absent");
		if (!selection.isCollapsed) return result("noncollapsed");
		const range = selection.getRangeAt(0);
		let point = range.start;
		const elementBoundary = tree.get(point.node).kind === "element";
		if (elementBoundary) {
			const mapped = elementCaretPoint(tree, point, focused, charge);
			if (!mapped) return result("unsupported");
			point = mapped;
		}
		const source = tree.get(point.node);
		if (source.kind !== "text") return result("unsupported");
		if (isInertSubtree(tree, source.id, charge))
			return result("outside-editable");
		let current = source.parent;
		let depth = 0;
		const styles = documentStyles(tree);
		while (current !== null) {
			charge();
			if (++depth > editableCaretLimits.maxDepth) return result("limited");
			const node = tree.get(current);
			if (
				contentEditableState(node) === "false" ||
				["input", "textarea", "select", "button"].includes(node.tagName)
			)
				return result("outside-editable");
			if (!styles.get(current).visible) return result("hidden");
			if (current === focused) break;
			current = node.parent;
		}
		if (current !== focused) return result("outside-editable");
		const geometryWork = Math.min(
			editableCaretLimits.maxGeometryWork,
			Math.floor((maxWork - work) * 0.8),
		);
		if (geometryWork < 1) return result("limited");
		charge(geometryWork);
		const geometryOptions = {
			maxWork: geometryWork,
			maxRectangles: 2,
		};
		const rects = elementBoundary
			? owner.withTemporaryRange(range, (temporary) => {
					temporary.update(point, point);
					return rangeClientRects(temporary, geometryOptions);
				})
			: rangeClientRects(range, geometryOptions);
		if (rects.length !== 1 || rects[0].width !== 0 || rects[0].height <= 0)
			return result("unsupported");
		const rect = rects[0];
		const scroll = documentScrollPosition(tree);
		const x = rect.x + scroll.x;
		const y = rect.y + scroll.y;
		const ref = tree.reference(source.id);
		let anchor: CaretAnchor | undefined;
		let startsAtPoint = false;
		for (const context of layout.contexts) {
			charge();
			for (const glyph of context.glyphs) {
				charge();
				if (
					glyph.ref !== ref ||
					!glyph.visible ||
					glyph.fontSize !== rect.height ||
					glyph.y !== y
				)
					continue;
				const start = point.offset === glyph.offset;
				const end = point.offset === glyph.offset + glyph.codeUnits;
				if ((!start && !end) || glyph.x + (start ? 0 : glyph.advance) !== x)
					continue;
				if (!anchor || (start && !startsAtPoint)) {
					startsAtPoint = start;
					anchor = {
						ref,
						formattingId: glyph.formattingId,
						offset: glyph.offset,
						x,
						y,
						height: rect.height,
						color: (
							layout.text.horizontal.formatting.nodes[glyph.formattingId]
								.paint ?? initialPaintStyle
						).color,
					};
				}
			}
		}
		anchor ??= terminalBreakAnchor(
			layout,
			ref,
			source.data,
			point.offset,
			x,
			y,
			rect.height,
			charge,
		);
		return anchor ? result("ready", anchor) : result("unsupported");
	} catch (error) {
		if (!(error instanceof AgentBrowserError)) throw error;
		if (error.code === "resource-limit") return result("limited");
		if (error.code === "closed") return result("closed");
		if (
			error.code === "unsupported" ||
			error.code === "not-found" ||
			error.code === "stale-reference"
		)
			return result("unsupported");
		throw error;
	}
}

export function paintEditableCaret(
	caret: EditableCaret,
	glyph: Readonly<TextGlyph>,
	image: RasterImage,
	clip: Readonly<{ x: number; y: number }>,
	chargeRaster: (amount: number) => void,
): void {
	const anchor = caret.anchor;
	if (
		caret.status !== "ready" ||
		!anchor ||
		glyph.ref !== anchor.ref ||
		glyph.formattingId !== anchor.formattingId ||
		glyph.offset !== anchor.offset
	)
		return;
	if (!anchor.color[3]) {
		caret.status = "transparent";
		return;
	}
	const x = anchor.x - clip.x;
	const y = anchor.y - clip.y;
	const left = Math.max(0, Math.floor(x));
	const right = Math.min(image.width, Math.ceil(x + 1));
	const top = Math.max(0, Math.floor(y));
	const bottom = Math.min(image.height, Math.ceil(y + anchor.height));
	if (right <= left || bottom <= top) {
		caret.status = "clipped";
		return;
	}
	const pixels = (right - left) * (bottom - top);
	if (
		pixels > editableCaretLimits.maxPixels ||
		pixels > caret.maxWork - caret.work
	) {
		caret.status = "limited";
		return;
	}
	caret.work += pixels;
	chargeRaster(pixels);
	paintRasterRect(image, x, y, 1, anchor.height, anchor.color);
	caret.status = "painted";
}
