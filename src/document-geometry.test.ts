import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";

const documents: DocumentTree[] = [];
function fixture(content: string, css = "") {
	const tree = parseHtmlDocument(
		`<style>main{display:flow-root;width:30px;font-size:8px}${css}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const value = queries.querySelector(selector);
		if (value === null) throw new Error(`Missing ${selector}`);
		return value;
	};
	const geometry = documentGeometry(tree);
	return {
		tree,
		id,
		geometry,
		rects: (selector: string) => geometry.getClientRects(id(selector)),
		box: (selector: string) => geometry.getBoundingClientRect(id(selector)),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("returns padded border boxes rather than text or margin bounds", () => {
	const { box } = fixture(
		"hello",
		"main{padding:2px;margin:5px 7px;height:12px}",
	);
	expect(box("#main")).toEqual({
		x: 7,
		y: 5,
		width: 34,
		height: 16,
		left: 7,
		top: 5,
		right: 41,
		bottom: 21,
	});
});

it("keeps separate wrapped inline fragments and unions their bounds", () => {
	const { rects, box } = fixture(
		'<span id="target">ab cd</span>',
		"main{width:18px}",
	);
	expect(
		rects("#target").map(({ x, y, width, height }) => [x, y, width, height]),
	).toEqual([
		[0, 1, 12, 8],
		[0, 11, 12, 8],
	]);
	expect(box("#target")).toMatchObject({ x: 0, y: 1, width: 12, height: 18 });
});

it("uses each inline's own font box at a shared mixed-size baseline", () => {
	const { box } = fixture(
		'<span id="outer">a<span id="inner" style="font-size:16px">b</span></span>',
	);
	expect(box("#outer")).toMatchObject({ x: 0, y: 9, width: 18, height: 8 });
	expect(box("#inner")).toMatchObject({ x: 6, y: 2, width: 12, height: 16 });
});

it("resolves vertical inline padding against the containing width", () => {
	const { box } = fixture(
		'<span id="target" style="padding-top:10%;padding-bottom:2px">a</span>',
	);
	expect(box("#target")).toMatchObject({ x: 0, y: -2, width: 6, height: 13 });
});

it.each([
	['a<span id="target"></span>', 6, 1],
	['a <span id="target"></span>', 6, 1],
	['<span id="target"></span>a', 0, 1],
	['<span id="target"></span>', 0, 1],
	['<span id="target"> </span>', 0, 1],
])("preserves zero-width empty inline geometry: %s", (markup, x, y) => {
	const { rects, box } = fixture(markup);
	expect(rects("#target")).toHaveLength(1);
	expect(box("#target")).toMatchObject({ x, y, width: 0, height: 8 });
});

it("does not turn an empty inline anchor into a phantom line", () => {
	const { tree, box } = fixture('<span id="target"></span>');
	const layout = layoutDocument(tree);
	expect(box("#main").height).toBe(0);
	expect(layout.contexts.flatMap((context) => context.lines)).toHaveLength(0);
	expect(layout.contexts.flatMap((context) => context.fragments)).toMatchObject(
		[{ line: null, width: 0, height: 8 }],
	);
});

it("retains BR geometry and inline ancestry on otherwise empty forced lines", () => {
	const { rects, box } = fixture(
		'<span id="target"><br id="first"><br id="second">a</span>',
	);
	expect(rects("#target").map(({ y, width }) => [y, width])).toEqual([
		[1, 0],
		[11, 0],
		[21, 6],
	]);
	expect(box("#first")).toMatchObject({ x: 0, y: 1, width: 0, height: 8 });
	expect(box("#second")).toMatchObject({ x: 0, y: 11, width: 0, height: 8 });
	expect(box("#target")).toMatchObject({ x: 0, y: 1, width: 6, height: 28 });
});

it("returns the first rectangle when every fragment has an empty dimension", () => {
	const { box } = fixture('<span id="target"><br><br></span>');
	expect(box("#target")).toMatchObject({ y: 1, width: 0, height: 8 });
});

it("retains inline fragments around preserved newlines without glyphs", () => {
	const { rects } = fixture(
		'<span id="target" style="white-space:pre">\n\na</span>',
	);
	expect(rects("#target").map(({ y, width }) => [y, width])).toEqual([
		[1, 0],
		[11, 0],
		[21, 6],
	]);
});

it.each(["display:none", "display:contents"])(
	"returns no own rectangles for %s",
	(style) => {
		const { rects, box } = fixture(
			`<span id="target" style="${style}">a</span>`,
		);
		expect(rects("#target")).toEqual([]);
		expect(box("#target")).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
	},
);

it("keeps layout geometry for visibility:hidden", () => {
	const { box } = fixture(
		'<span id="target" style="visibility:hidden">a</span>',
	);
	expect(box("#target")).toMatchObject({ width: 6, height: 8 });
});

it("aligns inline fragments and positions them in document coordinates", () => {
	const { box } = fixture(
		'<span id="target">a</span>',
		"main{padding:2px;margin:5px;text-align:right}",
	);
	expect(box("#target")).toMatchObject({ x: 31, y: 8, width: 6, height: 8 });
});

it("caches one immutable snapshot per revision and rebuilds after mutations", () => {
	const { tree, id, geometry, rects, box } = fixture(
		'<span id="target">a</span>',
	);
	const before = rects("#target");
	expect(documentGeometry(tree)).toBe(geometry);
	expect(rects("#target")).toBe(before);
	for (let index = 0; index < 100; index++) box("#main");
	expect(geometry.metrics().builds).toBe(1);
	tree.setAttribute(id("#target"), "style", "font-size:16px");
	expect(box("#target").width).toBe(12);
	expect(before[0].width).toBe(6);
	expect(Object.isFrozen(before) && Object.isFrozen(before[0])).toBe(true);
	expect(geometry.metrics().builds).toBe(2);
});

it("rebuilds for viewport-dependent percentage widths", () => {
	const { tree, geometry, box } = fixture("a", "main{width:50%}");
	documentStyles(tree).setViewport(100, 100);
	expect(box("#main").width).toBe(50);
	documentStyles(tree).setViewport(200, 100);
	expect(box("#main").width).toBe(100);
	expect(geometry.metrics().builds).toBe(2);
});

it("rebuilds for external stylesheet replacement", () => {
	const { tree, id, box } = fixture(
		'<link id="sheet" rel="stylesheet" href="x.css">a',
	);
	documentStyles(tree).setExternalSheet(
		id("#sheet"),
		"https://fixture.invalid/x.css",
		"main{width:30px}",
	);
	expect(box("#main").width).toBe(30);
	documentStyles(tree).setExternalSheet(
		id("#sheet"),
		"https://fixture.invalid/x.css",
		"main{width:44px}",
	);
	expect(box("#main").width).toBe(44);
});

it("returns empty geometry for detached elements without laying out unrelated unsupported content", () => {
	const { tree, geometry } = fixture(
		'<div style="display:flex">unsupported</div>',
	);
	const detached = tree.createElement("span");
	expect(geometry.getClientRects(detached)).toEqual([]);
	expect(geometry.metrics().builds).toBe(0);
});

it("rejects non-elements and unsupported layouts rather than inventing rectangles", () => {
	const { tree, geometry, box } = fixture(
		'<div id="target" style="display:flex;flex-direction:column;flex-wrap:wrap;position:sticky;overflow:hidden">x</div>',
	);
	expect(() => geometry.getClientRects(tree.root)).toThrow(
		"requires an element",
	);
	expect(() => box("#target")).toThrow();
	expect(geometry.metrics().rectangles).toBe(0);
});

it("explicitly rejects block-in-inline geometry until anonymous-fragment ownership is implemented", () => {
	const { box } = fixture('<span id="target">a<div>b</div>c</span>');
	expect(() => box("#target")).toThrow("block-in-inline");
	expect(box("#main").height).toBe(30);
});

it("bounds inline fragment proliferation independently of glyph count", () => {
	const { tree } = fixture("<span><span>a</span></span>");
	expect(() => layoutDocumentText(tree, { maxFragments: 1 })).toThrow(
		"fragment limit",
	);
	expect(layoutDocumentText(tree, { maxFragments: 2 }).metrics.fragments).toBe(
		2,
	);
	expect(() => layoutDocumentText(tree, { maxFragments: 0 })).toThrow(
		"Invalid text layout limit",
	);
});

it("clears retained geometry on close while old native snapshots remain values", () => {
	const { tree, geometry, rects } = fixture('<span id="target">a</span>');
	const old = rects("#target");
	tree.close();
	expect(old[0].width).toBe(6);
	expect(geometry.metrics()).toMatchObject({ rectangles: 0, closed: true });
	expect(() => geometry.getClientRects(1)).toThrow("closed");
});
