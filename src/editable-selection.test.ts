import { afterEach, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner, existingDomRangeOwner } from "./dom-range.js";
import {
	editableSelectionBackground,
	editableSelectionLimits,
	paintEditableSelection,
	prepareEditableSelection,
} from "./editable-selection.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import * as rangeGeometry from "./range-geometry.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	content = '<div id="editor" contenteditable>ABC DEF</div>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:120px;min-height:16px;color:red;white-space:pre-wrap}${css}</style>${content}`,
		"https://fixture.invalid/editable-selection",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 100);
	const id = (selector = "#editor") =>
		new DocumentQueries(tree).querySelector(selector) as number;
	const text = () => tree.get(id()).children[0];
	const actions = documentInteractions(tree);
	const select = (start = 1, end = 3, node = text()) => {
		actions.focus.focusElement(id(), { preventScroll: true });
		const selection = domRangeOwner(tree).selection;
		selection.setBaseAndExtent(node, start, node, end);
		return selection;
	};
	return { tree, id, text, actions, select };
}
function pixel(
	image: { width: number; pixels: Uint8Array },
	x: number,
	y: number,
) {
	const offset = (y * image.width + x) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}
function backgroundCount(image: { pixels: Uint8Array }) {
	let count = 0;
	for (let offset = 0; offset < image.pixels.length; offset += 4)
		if (
			editableSelectionBackground.every(
				(value, channel) => image.pixels[offset + channel] === value,
			)
		)
			count++;
	return count;
}

it("renders actual native Shift+Arrow selection and replacement without an expanded caret", () => {
	const { tree, text, actions, select, id } = fixture();
	select(1, 1);
	actions.keyboard.press("Shift+ArrowRight");
	actions.keyboard.press("Shift+ArrowRight");
	const selection = domRangeOwner(tree).selection;
	expect(selection.getRangeAt(0).start).toEqual({ node: text(), offset: 1 });
	expect(selection.getRangeAt(0).end).toEqual({ node: text(), offset: 3 });
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		paintedSelectionGlyphs: 2,
		selectionPixels: 96,
		selectionStatus: "painted",
		paintedCarets: 0,
		caretStatus: "noncollapsed",
	});
	expect(backgroundCount(result.image)).toBeGreaterThan(0);
	actions.keyboard.type("Q");
	expect(tree.textContent(id())).toBe("AQ DEF");
	const replaced = rasterizeDocument(tree);
	expect(replaced.metrics.selectionStatus).toBe("collapsed");
	expect(replaced.metrics.paintedCarets).toBe(1);
	expect(backgroundCount(replaced.image)).toBe(0);
});

it("does not allocate an absent owner or register selection observers", () => {
	const { tree } = fixture();
	const layout = layoutDocument(tree);
	const mutation = vi.spyOn(tree, "onMutation");
	const close = vi.spyOn(tree, "onClose");
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	expect(prepareEditableSelection(tree, layout)).toMatchObject({
		status: "absent",
		work: 0,
		geometryWork: 0,
	});
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	expect(mutation).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
});

it("does no extra geometry work for a collapsed selection and preserves the existing caret", () => {
	const { tree, select } = fixture();
	select(1, 1);
	const layout = layoutDocument(tree);
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	expect(prepareEditableSelection(tree, layout)).toMatchObject({
		status: "collapsed",
		geometryWork: 0,
		work: 0,
	});
	expect(geometry).not.toHaveBeenCalled();
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		paintedCarets: 1,
		selectionGeometryWork: 0,
		paintedSelectionGlyphs: 0,
	});
});

it("repaints a prepared layout for selection-only changes without mutating layout or Range", () => {
	const { tree, select } = fixture();
	const selection = select(1, 2);
	const prepared = prepareDocumentRaster(tree);
	const revision = tree.revision;
	const layout = JSON.stringify(prepared.layout);
	const first = prepared.rasterize();
	select(3, 5);
	const before = [selection.anchor, selection.focus];
	const second = prepared.rasterize();
	expect(tree.revision).toBe(revision);
	expect(JSON.stringify(prepared.layout)).toBe(layout);
	expect([selection.anchor, selection.focus]).toEqual(before);
	expect(second.metrics.paintedSelectionGlyphs).toBe(2);
	expect(second.image.pixels).not.toEqual(first.image.pixels);
	expect(existingDomRangeOwner(tree)?.selection).toBe(selection);
});

it("highlights preserved spaces and tabs even though they have no ink", () => {
	const { tree, select } = fixture(
		'<div id="editor" contenteditable>A \tB</div>',
	);
	select(1, 3);
	const result = rasterizeDocument(tree);
	expect(result.metrics.paintedSelectionGlyphs).toBe(2);
	expect(backgroundCount(result.image)).toBe(result.metrics.selectionPixels);
	expect(result.metrics.blankGlyphs).toBeGreaterThanOrEqual(2);
});

it("maps multiline selection but never invents a full-line region for source breaks", () => {
	const { tree, select } = fixture(
		'<div id="editor" contenteditable>A\n\nB\n</div>',
	);
	select(0, 5);
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		paintedSelectionGlyphs: 2,
		selectionPixels: 96,
	});
	expect(pixel(result.image, 0, 11)).toEqual([255, 255, 255, 255]);
	select(1, 3);
	const breaks = rasterizeDocument(tree);
	expect(breaks.metrics).toMatchObject({
		selectionStatus: "zero-advance",
		paintedSelectionGlyphs: 0,
		selectionPixels: 0,
	});
	expect(backgroundCount(breaks.image)).toBe(0);
});

it("selects the entire typographic glyph for a partial surrogate code-unit range", () => {
	const { tree, select } = fixture(
		'<div id="editor" contenteditable>A😀B</div>',
	);
	select(1, 2);
	const partial = rasterizeDocument(tree);
	select(1, 3);
	const whole = rasterizeDocument(tree);
	expect(partial.metrics.paintedSelectionGlyphs).toBe(1);
	expect(partial.image.pixels).toEqual(whole.image.pixels);
});

it("keeps source text colors rather than painting a selection foreground", () => {
	const { tree, select } = fixture();
	select(0, 7);
	const result = rasterizeDocument(tree);
	let red = 0;
	for (let offset = 0; offset < result.image.pixels.length; offset += 4) {
		const value = result.image.pixels.slice(offset, offset + 4);
		if (
			value[0] === 255 &&
			value[1] === 0 &&
			value[2] === 0 &&
			value[3] === 255
		)
			red++;
	}
	expect(red).toBeGreaterThan(0);
	expect(backgroundCount(result.image)).toBeGreaterThan(0);
});

it("can highlight transparent source text without changing its ink visibility", () => {
	const { tree, select } = fixture(undefined, "#editor{color:transparent}");
	select(1, 3);
	const result = rasterizeDocument(tree);
	expect(result.metrics.paintedGlyphs).toBe(0);
	expect(backgroundCount(result.image)).toBe(96);
});

it.each(["relative", "absolute", "fixed"])(
	"uses existing %s geometry and root scrolling",
	(position) => {
		const { tree, select } = fixture(
			'<div id="editor" contenteditable>ABC</div><div style="height:500px;width:500px"></div>',
			`#editor{position:${position};left:20px;top:50px}`,
		);
		select(1, 2);
		const before = rasterizeDocument(tree);
		expect(pixel(before.image, 31, 51)).toEqual(editableSelectionBackground);
		documentScroll(tree).to(10, 30);
		const after = rasterizeDocument(tree);
		expect(after.metrics.paintedSelectionGlyphs).toBe(1);
		expect(
			pixel(
				after.image,
				position === "fixed" ? 31 : 21,
				position === "fixed" ? 51 : 21,
			),
		).toEqual(editableSelectionBackground);
	},
);

it("uses pixel-center clipping and charges only painted selection pixels", () => {
	const { tree, select } = fixture();
	select(1, 2);
	const result = rasterizeDocument(tree, {
		clip: { x: 8, y: 3, width: 3, height: 4 },
	});
	expect(result.metrics).toMatchObject({
		paintedSelectionGlyphs: 1,
		selectionPixels: 12,
	});
	const clipped = rasterizeDocument(tree, {
		clip: { x: 50, y: 50, width: 10, height: 10 },
	});
	expect(clipped.metrics).toMatchObject({
		selectionStatus: "clipped",
		clippedSelectionGlyphs: 1,
		selectionPixels: 0,
	});
});

it("allows later opaque positioned content to cover the selection completely", () => {
	const { tree, select } = fixture(
		'<div id="editor" contenteditable>ABC</div><div id="cover"></div>',
		"#cover{position:absolute;left:0;top:0;width:120px;height:20px;background:lime;z-index:1}",
	);
	select(0, 3);
	const result = rasterizeDocument(tree);
	expect(result.metrics.paintedSelectionGlyphs).toBe(3);
	expect(backgroundCount(result.image)).toBe(0);
	expect(pixel(result.image, 6, 1)).toEqual([0, 255, 0, 255]);
});

it("keeps a closed owner closed and does not create a replacement", () => {
	const { tree, select } = fixture();
	select();
	const owner = domRangeOwner(tree);
	owner.close();
	expect(rasterizeDocument(tree).metrics.selectionStatus).toBe("closed");
	expect(existingDomRangeOwner(tree)).toBe(owner);
});

it("skips detached text, mixed-node ranges and element-gap ranges", () => {
	const { tree, select, text, id } = fixture(
		'<div id="editor" contenteditable>ABC<span id="second">DEF</span></div>',
	);
	const selection = select();
	selection.setBaseAndExtent(text(), 1, tree.get(id("#second")).children[0], 2);
	expect(rasterizeDocument(tree).metrics.selectionStatus).toBe("unsupported");
	selection.setBaseAndExtent(id(), 0, id(), 1);
	expect(rasterizeDocument(tree).metrics.selectionStatus).toBe("unsupported");
	const detached = tree.createText("ABC");
	selection.setBaseAndExtent(detached, 0, detached, 2);
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(0);
});

it.each([
	'contenteditable="false"',
	"inert",
	"hidden",
	'style="visibility:hidden"',
])("skips protected/inert/hidden selected descendants: %s", (attribute) => {
	const { tree, select, id } = fixture(
		`<div id="editor" contenteditable><span id="inner" ${attribute}>ABC</span></div>`,
	);
	select(0, 2, tree.get(id("#inner")).children[0]);
	const result = rasterizeDocument(tree);
	expect(result.metrics.paintedSelectionGlyphs).toBe(0);
	expect(["outside-editable", "hidden", "unfocused"]).toContain(
		result.metrics.selectionStatus,
	);
});

it("only highlights the actually focused editable root, not an input or another editor", () => {
	const { tree, select, actions, id } = fixture(
		'<div id="editor" contenteditable>ABC</div><div id="other" contenteditable>DEF</div><input id="input">',
	);
	select();
	for (const selector of ["#other", "#input"]) {
		actions.focus.focus(tree.reference(id(selector)));
		expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(0);
	}
});

it.each(["אB", "a\u0301B"])(
	"retains unsupported bidi/shaping rejection without suppressing native text: %s",
	(content) => {
		const { tree, select } = fixture(
			`<div id="editor" contenteditable>${content}</div>`,
		);
		select(0, content.length);
		const result = rasterizeDocument(tree);
		expect(result.metrics).toMatchObject({
			selectionStatus: "unsupported",
			paintedSelectionGlyphs: 0,
		});
		expect(result.metrics.paintedGlyphs).toBeGreaterThan(0);
	},
);

it("retains unmapped collapsed-space rejection", () => {
	const { tree, select } = fixture(
		'<div id="editor" contenteditable>A   B</div>',
		"#editor{white-space:normal}",
	);
	select(2, 4);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "unsupported",
		paintedSelectionGlyphs: 0,
	});
});

it("highlights determinate glyphs across a soft wrap without choosing a caret affinity", () => {
	const { tree, select } = fixture(
		'<div id="editor" contenteditable>AB CD</div>',
		"#editor{width:18px}",
	);
	select(0, 5);
	const result = rasterizeDocument(tree);
	expect(result.metrics.selectionStatus).toBe("painted");
	expect(result.metrics.paintedSelectionGlyphs).toBe(5);
	expect(result.metrics.paintedCarets).toBe(0);
});

it("treats a backwards shared selection like the same normalized forward range", () => {
	const { tree, select } = fixture();
	select(4, 1);
	const backwards = rasterizeDocument(tree);
	select(1, 4);
	expect(rasterizeDocument(tree).image.pixels).toEqual(backwards.image.pixels);
});

it("clips fractional geometry using the raster's pixel-center rule", () => {
	const { tree, select } = fixture(
		'<div id="editor" contenteditable>A B</div>',
		"#editor{position:relative;left:0.25px;top:0.25px}",
	);
	select(1, 2);
	const result = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 20, height: 20 },
	});
	expect(result.metrics).toMatchObject({
		selectionStatus: "painted",
		selectionPixels: 48,
	});
	expect(backgroundCount(result.image)).toBe(48);
});

it("bounds large source mappings and clears partial anchors on preparation failure", () => {
	const { tree, select } = fixture(
		`<div id="editor" contenteditable>${"A".repeat(4_097)}</div>`,
		"#editor{white-space:pre}",
	);
	select(0, 4_097);
	const selection = prepareEditableSelection(tree, layoutDocument(tree));
	expect(selection.status).toBe("limited");
	expect(selection.glyphs.size).toBe(0);
	expect(selection.work).toBeLessThanOrEqual(editableSelectionLimits.maxWork);
});

it("does not cache a highlight after the editable root is removed", () => {
	const { tree, select, id } = fixture();
	select();
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(2);
	tree.remove(id());
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(0);
});

it("bounds mapping and skips exhausted geometry without hiding native text", () => {
	const { tree, select } = fixture();
	select();
	const layout = layoutDocument(tree);
	expect(prepareEditableSelection(tree, layout, 1)).toMatchObject({
		status: "limited",
		work: 1,
	});
	expect(() => prepareEditableSelection(tree, layout, 0)).toThrow(/limit/);
	expect(() =>
		prepareEditableSelection(tree, layout, editableSelectionLimits.maxWork + 1),
	).toThrow(/limit/);
	vi.spyOn(rangeGeometry, "rangeClientRects").mockImplementation(() => {
		throw new AgentBrowserError("resource-limit", "fixture mapping exhausted");
	});
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		selectionStatus: "limited",
		paintedSelectionGlyphs: 0,
	});
	expect(result.metrics.paintedGlyphs).toBeGreaterThan(0);
});

it("charges actual raster pixels and respects independent selection pixel exhaustion", () => {
	const { tree, select } = fixture();
	select(1, 2);
	const layout = layoutDocument(tree);
	const selection = prepareEditableSelection(tree, layout);
	const glyph = layout.contexts
		.flatMap((context) => context.glyphs)
		.find((glyph) => glyph.offset === 1);
	if (!glyph) throw Error("Missing glyph");
	const charge = vi.fn();
	const image = createRaster(20, 20);
	paintEditableSelection(selection, glyph, image, { x: 8, y: 3 }, charge);
	expect(charge).toHaveBeenCalledWith(24);
	expect(selection.pixels).toBe(24);
	const limited = prepareEditableSelection(tree, layout);
	limited.pixels = editableSelectionLimits.maxPixels;
	paintEditableSelection(limited, glyph, image, { x: 0, y: 0 }, charge);
	expect(limited.status).toBe("limited");
	expect(limited.paintedGlyphs).toBe(0);
	const exhausted = prepareEditableSelection(tree, layout);
	expect(() =>
		paintEditableSelection(exhausted, glyph, image, { x: 0, y: 0 }, () => {
			throw new AgentBrowserError("resource-limit", "raster budget");
		}),
	).toThrow("raster budget");
});
