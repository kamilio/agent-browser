import { afterEach, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner, existingDomRangeOwner } from "./dom-range.js";
import {
	editableSelectionBackground,
	editableSelectionLimits,
	prepareEditableSelection,
} from "./editable-selection.js";
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
	content = '<span id="first">AB</span><span id="last"> CD</span>',
	css = "",
	extra = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{white-space:pre-wrap;width:140px;min-height:20px;color:navy}${css}</style><div id="editor" contenteditable>${content}</div>${extra}`,
		"https://fixture.invalid/editable-selection-elements",
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
	const focus = () => actions.focus.focusElement(id(), { preventScroll: true });
	const contents = (target = id()) => {
		focus();
		const owner = domRangeOwner(tree);
		const range = owner.createRange();
		range.selectNodeContents(target);
		owner.selection.removeAllRanges();
		owner.selection.addRange(range);
		return range;
	};
	return { tree, id, text, actions, focus, contents };
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

it("paints selectNodeContents on the actually focused editable root", () => {
	const { tree, contents, id } = fixture();
	const range = contents();
	expect(range.start).toEqual({ node: id(), offset: 0 });
	expect(range.end).toEqual({ node: id(), offset: 2 });
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 5,
		selectionPixels: 240,
		paintedCarets: 0,
	});
});

it("paints an element start slot through a partial text endpoint", () => {
	const { tree, contents, id, text } = fixture();
	const range = contents();
	range.setStart(id(), 1);
	range.setEnd(text("#last"), 2);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 2,
		selectionPixels: 96,
	});
});

it("shows the existing native Ctrl+A select-all Range", () => {
	const { tree, id, focus, actions } = fixture();
	focus();
	actions.keyboard.press("Control+a");
	const range = domRangeOwner(tree).selection.getRangeAt(0);
	expect(range.start).toEqual({ node: id(), offset: 0 });
	expect(range.end).toEqual({ node: id(), offset: 2 });
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 5,
		paintedCarets: 0,
	});
});

it.each([
	[0, 1, 2],
	[1, 2, 3],
])("uses child slots %i..%i, not character offsets", (start, end, glyphs) => {
	const { tree, contents, id } = fixture();
	const range = contents();
	range.setStart(id(), start);
	range.setEnd(id(), end);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: glyphs,
		selectionPixels: glyphs * 48,
	});
});

it("paints a partial text start through an ancestor end slot", () => {
	const { tree, contents, text, id } = fixture();
	const range = contents();
	range.setStart(text("#first"), 1);
	range.setEnd(id(), 1);
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(1);
});

it("starts after a nested container's last child and stops before another's first", () => {
	const { tree, contents, id } = fixture(
		'<span id="first"><b>BEFORE</b></span><i>MID</i><span id="last"><b>AFTER</b></span>',
	);
	const range = contents();
	range.setStart(id("#first"), 1);
	range.setEnd(id("#last"), 0);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 3,
	});
});

it("counts comment child slots without painting comment data", () => {
	const { tree, contents, id } = fixture(
		"<span>AB</span><!--gap--><span>CD</span>",
	);
	const range = contents();
	range.setStart(id(), 1);
	range.setEnd(id(), 3);
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(2);
});

it("paints nested selectNodeContents identically to exact text endpoints", () => {
	const { tree, contents, id, text } = fixture(
		'<span id="group"><b id="first">AB</b><i id="last"> CD</i></span>',
	);
	const range = contents(id("#group"));
	const elements = rasterizeDocument(tree);
	range.setStart(text("#first"), 0);
	range.setEnd(text("#last"), 3);
	expect(rasterizeDocument(tree).image.pixels).toEqual(elements.image.pixels);
});

it("normalizes backward element endpoints without rewriting live selection direction", () => {
	const { tree, contents, id } = fixture();
	contents();
	const forward = rasterizeDocument(tree);
	const selection = domRangeOwner(tree).selection;
	selection.setBaseAndExtent(id(), 2, id(), 0);
	const range = selection.getRangeAt(0);
	expect(rasterizeDocument(tree).image.pixels).toEqual(forward.image.pixels);
	expect(selection.direction).toBe("backward");
	expect(selection.getRangeAt(0)).toBe(range);
	expect(range.start).toEqual({ node: id(), offset: 0 });
});

it.each([
	'<span contenteditable="false"></span>',
	'<span contenteditable="false"><span contenteditable>nested</span></span>',
	"<span inert></span>",
	"<span hidden></span>",
	'<span style="display:none"></span>',
	'<span style="visibility:hidden"><span style="visibility:visible">visible</span></span>',
	'<input value="CONTROL">',
	"<textarea>CONTROL</textarea>",
	"<button>CONTROL</button>",
])(
	"skips the whole container selection across protected content: %s",
	(middle) => {
		const { tree, contents } = fixture(
			`<span>AB</span>${middle}<span>CD</span>`,
		);
		contents();
		const result = rasterizeDocument(tree);
		expect(["outside-editable", "hidden"]).toContain(
			result.metrics.selectionStatus,
		);
		expect(result.metrics.paintedSelectionGlyphs).toBe(0);
		expect(result.metrics.selectionGeometryWork).toBe(0);
	},
);

it.each(["first", "last"])(
	"checks the boundary element itself even for an empty slice: %s",
	(endpoint) => {
		const { tree, contents, id } = fixture();
		const range = contents();
		tree.setAttribute(id(`#${endpoint}`), "contenteditable", "false");
		if (endpoint === "first") range.setStart(id("#first"), 1);
		else range.setEnd(id("#last"), 0);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			selectionStatus: "outside-editable",
			paintedSelectionGlyphs: 0,
			selectionGeometryWork: 0,
		});
	},
);

it("ignores protected siblings outside the selected child interval", () => {
	const { tree, contents, id } = fixture(
		'<span contenteditable="false">BEFORE</span><span>AB</span><span hidden>AFTER</span>',
	);
	const range = contents();
	range.setStart(id(), 1);
	range.setEnd(id(), 2);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 2,
	});
});

it.each(["start", "end"])(
	"rejects a container endpoint outside the focused editable: %s",
	(endpoint) => {
		const { tree, contents, id } = fixture(
			undefined,
			"",
			'<div id="other" contenteditable>OUTSIDE</div>',
		);
		const range = contents();
		if (endpoint === "start") {
			range.setEnd(id("#other"), 1);
			range.setStart(id("#other"), 0);
		} else range.setEnd(id("#other"), 0);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			selectionStatus: "outside-editable",
			paintedSelectionGlyphs: 0,
		});
	},
);

it("does not replace selected empty element boxes with background rectangles", () => {
	const { tree, contents, id } = fixture(
		'<span style="display:inline-block;width:40px;height:20px"></span><span>AB</span>',
	);
	const range = contents();
	range.setEnd(id(), 1);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "zero-advance",
		paintedSelectionGlyphs: 0,
		selectionPixels: 0,
	});
});

it("paints preserved source spaces but not hard-break backgrounds", () => {
	const { tree, contents } = fixture("<span>A \n</span><span>\n B</span>");
	contents();
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 4,
		selectionPixels: 192,
	});
});

it.each(["א", "a\u0301"])(
	"does not bypass source geometry rejection with a container rectangle: %s",
	(text) => {
		const { tree, contents } = fixture(
			`<span style="padding:10px">${text}</span>`,
		);
		contents();
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			selectionStatus: "unsupported",
			paintedSelectionGlyphs: 0,
		});
	},
);

it("keeps absent and collapsed element selections allocation-free during preparation", () => {
	const { tree, contents, id } = fixture();
	const layout = layoutDocument(tree);
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	expect(prepareEditableSelection(tree, layout).status).toBe("absent");
	expect(existingDomRangeOwner(tree)).toBeUndefined();
	contents();
	domRangeOwner(tree).selection.collapse(id(), 1);
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	expect(prepareEditableSelection(tree, layout)).toMatchObject({
		status: "collapsed",
		work: 0,
		geometryWork: 0,
	});
	expect(geometry).not.toHaveBeenCalled();
});

it("reads current container slots from the same live Range on prepared-layout reuse", () => {
	const { tree, contents, id } = fixture();
	const range = contents();
	const prepared = prepareDocumentRaster(tree);
	expect(prepared.rasterize().metrics.paintedSelectionGlyphs).toBe(5);
	const revision = tree.revision;
	const layout = JSON.stringify(prepared.layout);
	range.setStart(id(), 1);
	const owner = domRangeOwner(tree);
	const create = vi.spyOn(owner, "createRange");
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	expect(prepared.rasterize().metrics.paintedSelectionGlyphs).toBe(3);
	expect(tree.revision).toBe(revision);
	expect(JSON.stringify(prepared.layout)).toBe(layout);
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(create).not.toHaveBeenCalled();
	expect(geometry).toHaveBeenCalledExactlyOnceWith(range, expect.any(Object));
});

it("rejects stale prepared layouts and remaps live container contents after mutation", () => {
	const { tree, contents, text } = fixture();
	contents();
	const prepared = prepareDocumentRaster(tree);
	domRangeOwner(tree).replaceText(text("#first"), 1, 0, "X");
	expect(() => prepared.rasterize()).toThrow("stale");
	expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(6);
});

it("charges child-slot traversal and clears anchors at the existing work cap", () => {
	const { tree, contents } = fixture(
		`${"<span></span>".repeat(200)}<span>AB</span>`,
	);
	contents();
	const layout = layoutDocument(tree);
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	const result = prepareEditableSelection(tree, layout, 100);
	expect(result).toMatchObject({
		status: "limited",
		work: 100,
		geometryWork: 0,
	});
	expect(result.glyphs.size).toBe(0);
	expect(geometry).not.toHaveBeenCalled();
	expect(editableSelectionLimits).toMatchObject({
		maxGlyphs: 4096,
		maxPixels: 1000000,
		maxDepth: 256,
	});
});

it("keeps fixed container-selection crops invariant under root scrolling", () => {
	const { tree, contents } = fixture(
		undefined,
		"#editor{position:fixed;left:20px;top:30px}",
		'<div style="height:500px"></div>',
	);
	contents();
	const clip = { x: 20, y: 30, width: 40, height: 20 };
	const before = rasterizeDocument(tree, { clip });
	documentScroll(tree).to(0, 80);
	const after = rasterizeDocument(tree, { clip: { ...clip, y: 110 } });
	expect(after.metrics.paintedSelectionGlyphs).toBe(5);
	expect(after.image.pixels).toEqual(before.image.pixels);
});

it("retains later opaque occlusion instead of overlaying container highlights", () => {
	const { tree, contents } = fixture(
		undefined,
		"#cover{position:absolute;left:0;top:0;width:140px;height:20px;background:lime;z-index:2}",
		'<div id="cover"></div>',
	);
	contents();
	const result = rasterizeDocument(tree);
	expect(result.metrics.paintedSelectionGlyphs).toBe(5);
	expect(backgroundCount(result.image)).toBe(0);
});

it.each(["Control+a", "Meta+a"])(
	"preserves native select-all then replacement and collapsed caret: %s",
	(key) => {
		const { tree, focus, actions, id } = fixture();
		focus();
		actions.keyboard.press(key);
		const selection = domRangeOwner(tree).selection;
		const range = selection.getRangeAt(0);
		expect(rasterizeDocument(tree).metrics.paintedSelectionGlyphs).toBe(5);
		actions.keyboard.type("Q");
		expect(tree.textContent(id())).toBe("Q");
		expect(selection.getRangeAt(0)).toBe(range);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			selectionStatus: "collapsed",
			paintedSelectionGlyphs: 0,
			paintedCarets: 1,
		});
	},
);
