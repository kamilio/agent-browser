import {
	contentEditableState,
	isRootEditableElement,
} from "./content-editability.js";
import type { DocumentLayout } from "./document-layout.js";
import { documentScrollPosition } from "./document-scroll.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { existingDomRangeOwner } from "./dom-range.js";
import { AgentBrowserError } from "./errors.js";
import { activeFocus } from "./focus.js";
import { isInertRoot } from "./inertness.js";
import { rangeClientRects } from "./range-geometry.js";
import { type RasterImage, type Rgba, paintRasterRect } from "./raster.js";
import { documentStyles } from "./styles.js";
import type { TextGlyph } from "./text-layout.js";

export const editableSelectionLimits = Object.freeze({
	maxWork: 250_000,
	maxGeometryWork: 200_000,
	maxDepth: 256,
	maxGlyphs: 4_096,
	maxRectangles: 1_024,
	maxPixels: 1_000_000,
});
export const editableSelectionBackground: Rgba = Object.freeze([
	179, 215, 255, 255,
]);
export const editableSelectionCapabilities = Object.freeze({
	partial: true,
	profile: "focused-editable-text-endpoint-range",
	background: "native-pale-blue-rgb-179-215-255",
	textColor: "unchanged-source-color",
	paintOrder: "immediately-before-each-source-glyph",
	paintedMetrics: "operations-not-final-visibility",
	work: "reserved-geometry-cap-plus-local-mapping-and-lookup",
	cssSelection: false,
	mixedNodes: true,
	elementEndpoints: false,
	protectedIntermediateNodes: "skip-entire-highlight",
	controls: false,
	...editableSelectionLimits,
});
export type EditableSelectionStatus =
	| "absent"
	| "collapsed"
	| "unfocused"
	| "outside-editable"
	| "hidden"
	| "unsupported"
	| "limited"
	| "closed"
	| "ready"
	| "painted"
	| "clipped"
	| "zero-advance";
interface SelectedGlyph {
	readonly ref: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}
const protectedSelectionTags = new Set([
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
export interface EditableSelection {
	status: EditableSelectionStatus;
	work: number;
	geometryWork: number;
	paintedGlyphs: number;
	clippedGlyphs: number;
	pixels: number;
	readonly maxWork: number;
	readonly glyphs: ReadonlyMap<string, Readonly<SelectedGlyph>>;
}

export function prepareEditableSelection(
	tree: DocumentTree,
	layout: DocumentLayout,
	maxWork: number = editableSelectionLimits.maxWork,
): EditableSelection {
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > editableSelectionLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid editable selection work limit",
		);
	const glyphs = new Map<string, Readonly<SelectedGlyph>>();
	const result: EditableSelection = {
		status: "absent",
		work: 0,
		geometryWork: 0,
		paintedGlyphs: 0,
		clippedGlyphs: 0,
		pixels: 0,
		maxWork,
		glyphs,
	};
	const finish = (status: EditableSelectionStatus) => {
		result.status = status;
		if (status !== "ready") glyphs.clear();
		return result;
	};
	const charge = (amount = 1) => {
		if (amount > maxWork - result.work) {
			result.work = maxWork;
			throw new AgentBrowserError(
				"resource-limit",
				"Editable selection mapping limit exceeded",
			);
		}
		result.work += amount;
	};
	try {
		const owner = existingDomRangeOwner(tree);
		if (!owner) return finish("absent");
		owner.ensureOpen();
		if (!owner.selection.rangeCount) return finish("absent");
		if (owner.selection.isCollapsed) return finish("collapsed");
		charge();
		const range = owner.selection.getRangeAt(0);
		const start = range.start;
		const end = range.end;
		const source = tree.get(start.node);
		if (source.kind !== "text" || tree.get(end.node).kind !== "text")
			return finish("unsupported");
		const focused = tree.activeElement;
		if (focused === null) return finish("unfocused");
		const styles = documentStyles(tree);
		const eligibility = (
			node: Readonly<DocumentNode>,
			checkEditable: boolean,
		): EditableSelectionStatus | undefined => {
			if (isInertRoot(tree, node, charge)) return "outside-editable";
			if (
				checkEditable &&
				(contentEditableState(node) === "false" ||
					protectedSelectionTags.has(node.tagName))
			)
				return "outside-editable";
			if (!styles.get(node.id).visible) return "hidden";
		};
		const startAncestors = new Set<number>([start.node]);
		for (const endpoint of start.node === end.node
			? [start.node]
			: [start.node, end.node]) {
			let current = tree.get(endpoint).parent;
			let depth = 0;
			let inside = false;
			let connected = false;
			while (current !== null) {
				charge();
				if (++depth > editableSelectionLimits.maxDepth)
					return finish("limited");
				const node = tree.get(current);
				const status = eligibility(node, !inside);
				if (status) return finish(status);
				if (endpoint === start.node) startAncestors.add(current);
				inside ||= current === focused;
				connected ||= current === tree.root;
				current = node.parent;
			}
			if (!inside || !connected) return finish("outside-editable");
		}
		if (activeFocus(tree) !== focused || !isRootEditableElement(tree, focused))
			return finish("unfocused");
		const spans = new Map<string, Readonly<{ lower: number; upper: number }>>();
		if (start.node === end.node) {
			spans.set(tree.reference(start.node), {
				lower: start.offset,
				upper: end.offset,
			});
		} else {
			let collecting = false;
			let complete = false;
			const visit = (
				id: number,
				depth: number,
			): EditableSelectionStatus | undefined => {
				charge();
				if (!collecting && !startAncestors.has(id)) return;
				if (depth > editableSelectionLimits.maxDepth) return "limited";
				const node = tree.get(id);
				collecting ||= id === start.node;
				if (collecting && node.kind === "text") {
					spans.set(tree.reference(id), {
						lower: id === start.node ? start.offset : 0,
						upper: id === end.node ? end.offset : node.data.length,
					});
					complete = id === end.node;
					return;
				}
				if (collecting && node.kind === "element") {
					const status = eligibility(node, true);
					if (status) return status;
				}
				for (const child of node.children) {
					const status = visit(child, depth + 1);
					if (status || complete) return status;
				}
			};
			const status = visit(focused, 0);
			if (status) return finish(status);
			if (!complete) return finish("unsupported");
		}
		const geometryWork = Math.min(
			editableSelectionLimits.maxGeometryWork,
			Math.floor((maxWork - result.work) * 0.8),
		);
		if (geometryWork < 1) return finish("limited");
		charge(geometryWork);
		result.geometryWork = geometryWork;
		const rects = rangeClientRects(range, {
			maxWork: geometryWork,
			maxRectangles: editableSelectionLimits.maxRectangles,
		});
		if (!rects.length) return finish("unsupported");
		const scroll = documentScrollPosition(tree);
		for (const context of layout.contexts) {
			charge();
			for (const glyph of context.glyphs) {
				charge();
				const span = spans.get(glyph.ref);
				if (
					!span ||
					glyph.offset >= span.upper ||
					glyph.offset + glyph.codeUnits <= span.lower
				)
					continue;
				if (!glyph.visible) return finish("hidden");
				if (glyph.advance <= 0 || glyph.fontSize <= 0) continue;
				const supported = rects.some((rect) => {
					charge();
					return (
						glyph.x >= rect.left + scroll.x &&
						glyph.x + glyph.advance <= rect.right + scroll.x &&
						glyph.y >= rect.top + scroll.y &&
						glyph.y + glyph.fontSize <= rect.bottom + scroll.y
					);
				});
				if (!supported) return finish("unsupported");
				if (glyphs.size >= editableSelectionLimits.maxGlyphs)
					return finish("limited");
				const key = `${glyph.formattingId}:${glyph.offset}`;
				if (glyphs.has(key)) return finish("unsupported");
				glyphs.set(
					key,
					Object.freeze({
						ref: glyph.ref,
						x: glyph.x,
						y: glyph.y,
						width: glyph.advance,
						height: glyph.fontSize,
					}),
				);
			}
		}
		return finish(glyphs.size ? "ready" : "zero-advance");
	} catch (error) {
		if (!(error instanceof AgentBrowserError)) throw error;
		if (error.code === "resource-limit") return finish("limited");
		if (error.code === "closed") return finish("closed");
		if (["unsupported", "not-found", "stale-reference"].includes(error.code))
			return finish("unsupported");
		throw error;
	}
}

export function paintEditableSelection(
	selection: EditableSelection,
	glyph: Readonly<TextGlyph>,
	image: RasterImage,
	clip: Readonly<{ x: number; y: number }>,
	chargeRaster: (amount: number) => void,
): void {
	if (!["ready", "painted", "clipped"].includes(selection.status)) return;
	if (selection.work >= selection.maxWork) {
		selection.status = "limited";
		return;
	}
	selection.work++;
	const selected = selection.glyphs.get(
		`${glyph.formattingId}:${glyph.offset}`,
	);
	if (!selected || selected.ref !== glyph.ref) return;
	const x = selected.x - clip.x;
	const y = selected.y - clip.y;
	const left = Math.max(0, Math.min(image.width, Math.ceil(x - 0.5)));
	const right = Math.max(
		0,
		Math.min(image.width, Math.ceil(x + selected.width - 0.5)),
	);
	const top = Math.max(0, Math.min(image.height, Math.ceil(y - 0.5)));
	const bottom = Math.max(
		0,
		Math.min(image.height, Math.ceil(y + selected.height - 0.5)),
	);
	if (right <= left || bottom <= top) {
		selection.clippedGlyphs++;
		if (!selection.paintedGlyphs) selection.status = "clipped";
		return;
	}
	const pixels = (right - left) * (bottom - top);
	if (pixels > editableSelectionLimits.maxPixels - selection.pixels) {
		selection.status = "limited";
		return;
	}
	chargeRaster(pixels);
	paintRasterRect(
		image,
		x,
		y,
		selected.width,
		selected.height,
		editableSelectionBackground,
	);
	selection.pixels += pixels;
	selection.paintedGlyphs++;
	selection.status = "painted";
}
