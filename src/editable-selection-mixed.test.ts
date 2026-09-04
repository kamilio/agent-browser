import { afterEach, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner, existingDomRangeOwner } from "./dom-range.js";
import {
	editableSelectionBackground,
	editableSelectionCapabilities,
	editableSelectionLimits,
	prepareEditableSelection,
} from "./editable-selection.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import * as rangeGeometry from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	content = '<span id="first">ABC</span><span id="last">DEF</span>',
	css = "",
	extra = "",
	maxDepth = 256,
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{white-space:pre-wrap;width:140px;min-height:20px;color:navy}${css}</style><div id="editor" contenteditable>${content}</div>${extra}`,
		"https://fixture.invalid/editable-selection-mixed",
		{ limits: { maxDepth } },
	);
	trees.push(tree);
	documentStyles(tree).setViewport(180, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#editor") => {
		const found = queries.querySelector(selector);
		if (found === null) throw Error(`Missing ${selector}`);
		return found;
	};
	const text = (selector: string) => tree.get(id(selector)).children[0];
	const actions = documentInteractions(tree);
	const select = (
		start = 1,
		end = 2,
		first = text("#first"),
		last = text("#last"),
	) => {
		actions.focus.focusElement(id(), { preventScroll: true });
		const selection = domRangeOwner(tree).selection;
		selection.setBaseAndExtent(first, start, last, end);
		return selection;
	};
	return { tree, id, text, actions, select };
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
function pixel(
	image: { width: number; pixels: Uint8Array },
	x: number,
	y: number,
) {
	const offset = (y * image.width + x) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("maps exact source intersections across two partially selected text nodes", () => {
	const { tree, select, text } = fixture();
	select();
	const prepared = prepareEditableSelection(tree, layoutDocument(tree));
	expect(prepared.status).toBe("ready");
	expect(
		Array.from(prepared.glyphs.values()).map((glyph) => [
			glyph.ref,
			glyph.x,
			glyph.width,
		]),
	).toEqual([
		[tree.reference(text("#first")), 6, 6],
		[tree.reference(text("#first")), 12, 6],
		[tree.reference(text("#last")), 18, 6],
		[tree.reference(text("#last")), 24, 6],
	]);
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 4,
		selectionPixels: 192,
		paintedCarets: 0,
	});
	expect(backgroundCount(result.image)).toBeGreaterThan(0);
	expect(editableSelectionCapabilities).toMatchObject({
		mixedNodes: true,
		elementEndpoints: false,
	});
});

it("includes fully selected intermediate descendants without highlighting their element boxes", () => {
	const { tree, select, text } = fixture(
		'<span id="first">ABC</span><span id="middle" style="padding:8px"><b id="nested"> XY </b></span><span id="last">DEF</span>',
	);
	select(2, 1);
	const prepared = prepareEditableSelection(tree, layoutDocument(tree));
	expect(prepared.status).toBe("ready");
	expect(prepared.glyphs.size).toBe(6);
	expect(
		Array.from(prepared.glyphs.values()).filter(
			(glyph) => glyph.ref === tree.reference(text("#nested")),
		),
	).toHaveLength(4);
	const result = rasterizeDocument(tree);
	expect(result.metrics.selectionPixels).toBe(6 * 6 * 8);
});

it("keeps source-specific typography and paint colors across inline siblings", () => {
	const { tree, select, text } = fixture(
		undefined,
		"#first{color:red}#last{font-size:16px;line-height:20px;color:green}",
	);
	select(2, 1);
	const prepared = prepareEditableSelection(tree, layoutDocument(tree));
	expect(
		Array.from(prepared.glyphs.values()).map((glyph) => [
			glyph.ref,
			glyph.width,
			glyph.height,
		]),
	).toEqual([
		[tree.reference(text("#first")), 6, 8],
		[tree.reference(text("#last")), 12, 16],
	]);
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 2,
		selectionPixels: 240,
	});
	const colors = new Set<string>();
	for (let offset = 0; offset < result.image.pixels.length; offset += 4)
		colors.add(
			Array.from(result.image.pixels.slice(offset, offset + 4)).join(","),
		);
	expect(colors.has("255,0,0,255")).toBe(true);
	expect(colors.has("0,128,0,255")).toBe(true);
});

it("uses normalized backward boundaries while retaining live direction and owner identity", () => {
	const { tree, select, text } = fixture();
	const selection = select();
	const forward = rasterizeDocument(tree);
	selection.setBaseAndExtent(text("#last"), 2, text("#first"), 1);
	const range = selection.getRangeAt(0);
	const before = [selection.anchor, selection.focus, range.start, range.end];
	const backward = rasterizeDocument(tree);
	expect(backward.image.pixels).toEqual(forward.image.pixels);
	expect(selection.direction).toBe("backward");
	expect(selection.getRangeAt(0)).toBe(range);
	expect([selection.anchor, selection.focus, range.start, range.end]).toEqual(
		before,
	);
	expect(existingDomRangeOwner(tree)?.selection).toBe(selection);
});

it("paints actual native Shift+Arrow selection across inline nodes and native replacement", () => {
	const { tree, actions, text, id } = fixture(
		'<b id="first">hello</b><i id="last">world</i>',
	);
	actions.focus.focusElement(id(), { preventScroll: true });
	const selection = domRangeOwner(tree).selection;
	selection.collapse(text("#first"), 4);
	actions.keyboard.press("Shift+ArrowRight");
	actions.keyboard.press("Shift+ArrowRight");
	expect(selection.toString()).toBe("ow");
	expect(selection.getRangeAt(0).start.node).not.toBe(
		selection.getRangeAt(0).end.node,
	);
	const selected = rasterizeDocument(tree);
	expect(selected.metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 2,
		paintedCarets: 0,
	});
	actions.keyboard.type("Q");
	expect(tree.textContent(id())).toBe("hellQorld");
	expect(selection.isCollapsed).toBe(true);
	const replaced = rasterizeDocument(tree);
	expect(replaced.metrics.selectionStatus).toBe("collapsed");
	expect(backgroundCount(replaced.image)).toBe(0);
});

it("updates mixed selections on a prepared raster without mutating the layout or creating a Range", () => {
	const { tree, select, text } = fixture();
	const selection = select();
	const prepared = prepareDocumentRaster(tree);
	const first = prepared.rasterize();
	const revision = tree.revision;
	const layout = JSON.stringify(prepared.layout);
	const owner = domRangeOwner(tree);
	const range = selection.getRangeAt(0);
	range.setStart(text("#first"), 2);
	range.setEnd(text("#last"), 1);
	const create = vi.spyOn(owner, "createRange");
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	const second = prepared.rasterize();
	expect(second.metrics.paintedSelectionGlyphs).toBe(2);
	expect(second.image.pixels).not.toEqual(first.image.pixels);
	expect(tree.revision).toBe(revision);
	expect(JSON.stringify(prepared.layout)).toBe(layout);
	expect(selection.getRangeAt(0)).toBe(range);
	expect(create).not.toHaveBeenCalled();
	expect(geometry).toHaveBeenCalledTimes(1);
	expect(geometry.mock.calls[0][0]).toBe(range);
});

it("retains stale-layout rejection after source mutation and uses updated live spans in a fresh raster", () => {
	const { tree, select, text } = fixture();
	select();
	const prepared = prepareDocumentRaster(tree);
	domRangeOwner(tree).replaceText(text("#first"), 2, 0, "X");
	expect(() => prepared.rasterize()).toThrow("stale");
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(5);
});

it.each(["first", "last"])(
	"rejects an endpoint outside the focused root: %s",
	(endpoint) => {
		const { tree, select, text } = fixture(
			undefined,
			"",
			'<div id="other" contenteditable>OUTSIDE</div>',
		);
		select(
			1,
			2,
			text(endpoint === "first" ? "#other" : "#first"),
			text(endpoint === "last" ? "#other" : "#last"),
		);
		const result = rasterizeDocument(tree);
		expect(result.metrics).toMatchObject({
			selectionStatus: "outside-editable",
			paintedSelectionGlyphs: 0,
			selectionGeometryWork: 0,
		});
	},
);

it.each(["first", "last"])(
	"rejects a protected endpoint even when its selected slice is empty: %s",
	(endpoint) => {
		const { tree, select } = fixture(undefined, "");
		const target = new DocumentQueries(tree).querySelector(
			`#${endpoint}`,
		) as number;
		tree.setAttribute(target, "contenteditable", "false");
		select(3, 0);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			selectionStatus: "outside-editable",
			paintedSelectionGlyphs: 0,
		});
	},
);

it.each([
	'<span contenteditable="false">LOCKED</span>',
	'<span contenteditable="false"></span>',
	'<span contenteditable="false"><span contenteditable>nested</span></span>',
	"<span inert>INERT</span>",
	"<span hidden>HIDDEN</span>",
	'<span style="display:none"></span>',
	'<span style="visibility:hidden"><span style="visibility:visible">visible child</span></span>',
	'<input value="CONTROL">',
	"<textarea>CONTROL</textarea>",
	"<button>CONTROL</button>",
])(
	"skips the entire highlight across protected or hidden intermediate content: %s",
	(middle) => {
		const { tree, select } = fixture(
			`<span id="first">ABC</span>${middle}<span id="last">DEF</span>`,
		);
		select();
		const result = rasterizeDocument(tree);
		expect(["outside-editable", "hidden"]).toContain(
			result.metrics.selectionStatus,
		);
		expect(result.metrics.paintedSelectionGlyphs).toBe(0);
		expect(result.metrics.selectionGeometryWork).toBe(0);
		expect(result.metrics.paintedGlyphs).toBeGreaterThan(0);
	},
);

it("ignores protected and hidden siblings outside the selected DOM interval", () => {
	const { tree, select } = fixture(
		'<span contenteditable="false">BEFORE</span><span hidden>hidden</span><span id="first">ABC</span><span id="last">DEF</span><span inert>AFTER</span>',
	);
	select();
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 4,
	});
});

it("honestly retains element-gap endpoint rejection", () => {
	const { tree, select, id, text } = fixture();
	const selection = select();
	for (const [start, end] of [
		[id(), text("#last")],
		[text("#first"), id()],
	]) {
		selection.setBaseAndExtent(start, 0, end, 1);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			selectionStatus: "unsupported",
			paintedSelectionGlyphs: 0,
		});
	}
});

it("includes preserved spaces and multiline text but gives breaks no invented background", () => {
	const { tree, select } = fixture(
		'<span id="first">A \n</span><span id="middle">\n B</span><span id="last">C\n</span>',
	);
	select(1, 2);
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 4,
		selectionPixels: 192,
	});
	expect(pixel(result.image, 0, 11)).toEqual([255, 255, 255, 255]);
});

it("maps split CRLF source spans without synthesizing painted glyphs", () => {
	const { tree, select, text } = fixture();
	tree.setTextContent(text("#first"), "A\r");
	tree.setTextContent(text("#last"), "\nB");
	select(1, 1);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "zero-advance",
		paintedSelectionGlyphs: 0,
	});
	select(0, 2);
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(2);
});

it("uses whole surrogate glyphs at both partially selected text endpoints", () => {
	const { tree, select } = fixture(
		'<span id="first">A😀</span><span id="last">😀B</span>',
	);
	select(2, 1);
	const partial = rasterizeDocument(tree);
	select(1, 2);
	expect(rasterizeDocument(tree).image.pixels).toEqual(partial.image.pixels);
	expect(partial.metrics.paintedSelectionGlyphs).toBe(2);
});

it("maps independent block contexts without including intervening box area", () => {
	const { tree, select } = fixture(
		'<p id="first">ABC</p><p id="last">DEF</p>',
		"p{margin:0}",
	);
	select(2, 1);
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 2,
		selectionPixels: 96,
	});
});

it.each(["relative", "absolute", "fixed"])(
	"preserves mixed-node %s geometry and root-scroll projection",
	(position) => {
		const { tree, select } = fixture(
			undefined,
			`#editor{position:${position};left:20px;top:50px}`,
			'<div style="width:500px;height:500px"></div>',
		);
		select(2, 1);
		const before = rasterizeDocument(tree);
		expect(pixel(before.image, 37, 51)).toEqual(editableSelectionBackground);
		documentScroll(tree).to(10, 30);
		const after = rasterizeDocument(tree);
		expect(after.metrics.paintedSelectionGlyphs).toBe(2);
		expect(
			pixel(
				after.image,
				position === "fixed" ? 37 : 27,
				position === "fixed" ? 51 : 21,
			),
		).toEqual(editableSelectionBackground);
	},
);

it("handles fixed and flow glyphs within one focused root without collapsing their coordinate spaces", () => {
	const { tree, select } = fixture(
		undefined,
		"#last{position:fixed;left:60px;top:50px}",
		'<div style="width:500px;height:500px"></div>',
	);
	select(2, 1);
	documentScroll(tree).to(10, 30);
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		paintedSelectionGlyphs: 1,
		clippedSelectionGlyphs: 1,
		selectionStatus: "painted",
	});
	expect(pixel(result.image, 65, 51)).toEqual(editableSelectionBackground);
});

it("keeps ordered paint occlusion and clipping instead of drawing a final overlay", () => {
	const { tree, select } = fixture(
		undefined,
		"#cover{position:absolute;left:0;top:0;width:140px;height:20px;background:lime;z-index:2}",
		'<div id="cover"></div>',
	);
	select();
	const result = rasterizeDocument(tree);
	expect(result.metrics.paintedSelectionGlyphs).toBe(4);
	expect(backgroundCount(result.image)).toBe(0);
	expect(pixel(result.image, 7, 1)).toEqual([0, 255, 0, 255]);
	const clipped = rasterizeDocument(tree, {
		clip: { x: 20, y: 3, width: 4, height: 4 },
	});
	expect(clipped.metrics).toMatchObject({
		paintedSelectionGlyphs: 1,
		clippedSelectionGlyphs: 3,
		selectionPixels: 16,
	});
});

it.each(["א", "a\u0301"])(
	"does not hide unsupported intermediate shaping behind a selected element rectangle: %s",
	(middle) => {
		const { tree, select } = fixture(
			`<span id="first">ABC</span><span style="padding:10px">${middle}</span><span id="last">DEF</span>`,
		);
		select();
		const result = rasterizeDocument(tree);
		expect(result.metrics).toMatchObject({
			selectionStatus: "unsupported",
			paintedSelectionGlyphs: 0,
		});
		expect(result.metrics.paintedGlyphs).toBeGreaterThan(0);
	},
);

it("never allocates an owner or geometry for an absent/collapsed selection", () => {
	const { tree, select, text } = fixture();
	const layout = layoutDocument(tree);
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	expect(prepareEditableSelection(tree, layout).status).toBe("absent");
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	select(1, 1, text("#first"), text("#first"));
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	expect(prepareEditableSelection(tree, layout)).toMatchObject({
		status: "collapsed",
		geometryWork: 0,
		work: 0,
	});
	expect(geometry).not.toHaveBeenCalled();
});

it("retains closed ownership and drops a detached mixed endpoint without cached highlights", () => {
	const { tree, select, id } = fixture();
	select();
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(4);
	tree.remove(id("#last"));
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(0);
	const owner = domRangeOwner(tree);
	owner.close();
	expect(rasterizeDocument(tree).metrics.selectionStatus).toBe("closed");
	expect(existingDomRangeOwner(tree)).toBe(owner);
});

it("charges intermediate traversal and clears all anchors when the mapping cap is exhausted", () => {
	const { tree, select } = fixture(
		`<span id="first">ABC</span>${"<span></span>".repeat(200)}<span id="last">DEF</span>`,
	);
	select();
	const layout = layoutDocument(tree);
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	const limited = prepareEditableSelection(tree, layout, 100);
	expect(limited).toMatchObject({
		status: "limited",
		work: 100,
		geometryWork: 0,
	});
	expect(limited.glyphs.size).toBe(0);
	expect(geometry).not.toHaveBeenCalled();
	expect(editableSelectionLimits.maxGlyphs).toBe(4_096);
	expect(editableSelectionLimits.maxPixels).toBe(1_000_000);
});

it("bounds endpoint ancestry and skips deeply nested intermediate content", () => {
	const { tree, select } = fixture(
		`<span id="first">ABC</span>${"<span>".repeat(258)}deep${"</span>".repeat(258)}<span id="last">DEF</span>`,
		"",
		"",
		512,
	);
	select();
	const result = prepareEditableSelection(tree, {
		contexts: [],
	} as unknown as ReturnType<typeof layoutDocument>);
	expect(result).toMatchObject({ status: "limited", geometryWork: 0 });
	expect(result.glyphs.size).toBe(0);
});

it("retains geometry resource-limit skip without suppressing source text", () => {
	const { tree, select } = fixture();
	select();
	vi.spyOn(rangeGeometry, "rangeClientRects").mockImplementation(() => {
		throw new AgentBrowserError("resource-limit", "geometry fixture limit");
	});
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		selectionStatus: "limited",
		paintedSelectionGlyphs: 0,
	});
	expect(result.metrics.paintedGlyphs).toBeGreaterThan(0);
});
