import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { rangeBoundingClientRect, rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(html = '<main id="target">ABCDE</main>', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}body{font-size:8px;line-height:10px}${css}</style>${html}`,
		"https://fixture.invalid/range-geometry",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 100);
	const query = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw Error(`Missing ${selector}`);
		return found;
	};
	const text = (selector = "#target") => tree.get(id(selector)).children[0];
	const range = domRangeOwner(tree).createRange();
	return { tree, id, text, range };
}

it("uses font ascent/descent rather than the element line-height", () => {
	const { range, text } = fixture(undefined, "main{line-height:20px}");
	range.setStart(text(), 1);
	range.setEnd(text(), 4);
	expect(rangeClientRects(range)).toEqual([
		{
			x: 6,
			y: 6,
			width: 18,
			height: 8,
			top: 6,
			right: 24,
			bottom: 14,
			left: 6,
		},
	]);
	expect(Object.isFrozen(rangeClientRects(range)[0])).toBe(true);
});

it("matches a deterministic source-index oracle for all simple text intervals", () => {
	const { range, text } = fixture();
	for (let start = 0; start <= 5; start++)
		for (let end = start; end <= 5; end++) {
			range.setStart(text(), start);
			range.setEnd(text(), end);
			expect(rangeClientRects(range)).toHaveLength(1);
			expect(rangeBoundingClientRect(range)).toMatchObject({
				x: start * 6,
				y: 1,
				width: (end - start) * 6,
				height: 8,
			});
		}
});

it("returns per-line partial text rectangles and their union", () => {
	const { range, text } = fixture(
		'<main id="target">AB CD EF</main>',
		"main{width:18px}",
	);
	range.setStart(text(), 1);
	range.setEnd(text(), 7);
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 6, y: 1, width: 6, height: 8 },
		{ x: 0, y: 11, width: 12, height: 8 },
		{ x: 0, y: 21, width: 6, height: 8 },
	]);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 0,
		y: 1,
		width: 12,
		height: 28,
	});
});

it("uses actual preserved spaces and tab advances in pre-wrap", () => {
	const { range, text } = fixture(
		'<main id="target">A\tB  C</main>',
		"main{white-space:pre-wrap;width:200px}",
	);
	range.setStart(text(), 1);
	range.setEnd(text(), 4);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 6,
		y: 1,
		width: 54,
		height: 8,
	});
});

it("retains hanging preserved whitespace and wrapped line ownership", () => {
	const { range, text } = fixture(
		'<main id="target">AB CD</main>',
		"main{white-space:pre-wrap;width:18px}",
	);
	range.selectNodeContents(text());
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 0, y: 1, width: 18, height: 8 },
		{ x: 0, y: 11, width: 12, height: 8 },
	]);
	range.setStart(text(), 3);
	range.collapse(true);
	expect(() => rangeClientRects(range)).toThrow("unambiguous glyph boundary");
});

it("uses retained collapsed whitespace without measuring the source string", () => {
	const { range, text } = fixture('<main id="target">A   B</main>');
	range.selectNodeContents(text());
	expect(rangeBoundingClientRect(range)).toMatchObject({ width: 18 });
	range.setStart(text(), 2);
	range.setEnd(text(), 4);
	expect(() => rangeClientRects(range)).toThrow(
		"unmapped collapsed whitespace",
	);
	range.setStart(text(), 3);
	range.collapse(true);
	expect(() => rangeClientRects(range)).toThrow("unambiguous glyph boundary");
});

it("returns empty only for truly boxless all-collapsed whitespace", () => {
	const { range, text } = fixture('<main id="target">   </main>');
	range.selectNodeContents(text());
	expect(rangeClientRects(range)).toEqual([]);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});
});

it("uses indexed glyphs and preserved breaks across lines", () => {
	const { range, text } = fixture(
		'<main id="target">A\nB</main>',
		"main{white-space:pre-wrap}",
	);
	range.setStart(text(), 2);
	range.setEnd(text(), 3);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 0,
		y: 11,
		width: 6,
		height: 8,
	});
	range.selectNodeContents(text());
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 0, y: 1, width: 6, height: 8 },
		{ x: 0, y: 11, width: 6, height: 8 },
	]);
});

it("includes a whole surrogate glyph when a boundary splits its code units", () => {
	const { range, text } = fixture('<main id="target">A😀B</main>');
	range.setStart(text(), 2);
	range.setEnd(text(), 3);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 6,
		width: 6,
		height: 8,
	});
	range.collapse(true);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 6,
		width: 6,
		height: 8,
	});
});

it.each(["a\u0301", "אב", "A\u200dB"])(
	"explicitly rejects unsupported shaping/bidi mapping for %s",
	(content) => {
		const { range, text } = fixture(`<main id="target">${content}</main>`);
		range.selectNodeContents(text());
		expect(() => rangeClientRects(range)).toThrow("bidi or shaped");
	},
);

it("includes selected top-level element borders and all selected text in DOM order", () => {
	const { tree, range, id } = fixture(
		'<main id="target"><span id="outer">A<b id="inner">B</b></span><i id="after">C</i></main>',
	);
	range.selectNode(id("#outer"));
	const rects = rangeClientRects(range);
	expect(rects).toHaveLength(3);
	expect(rects[0]).toEqual(
		documentGeometry(tree).getClientRects(id("#outer"))[0],
	);
	expect(rects.slice(1)).toMatchObject([
		{ x: 0, width: 6, height: 8 },
		{ x: 6, width: 6, height: 8 },
	]);
});

it("orders ranges by DOM boundaries rather than node allocation IDs", () => {
	const { tree, range, id } = fixture(
		'<main id="target"><span id="old">OLD</span></main>',
	);
	const newer = tree.createElement("b");
	const content = tree.createText("NEW");
	tree.append(newer, content);
	tree.insert(id("#target"), newer, id("#old"));
	range.setStart(content, 1);
	range.setEnd(tree.get(id("#old")).children[0], 2);
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 6, width: 12, height: 8 },
		{ x: 18, width: 12, height: 8 },
	]);
});

it("handles display:contents without inventing an element box", () => {
	const { range, id } = fixture(
		'<main id="target"><span id="contents">AB</span></main>',
		"span{display:contents}",
	);
	range.selectNode(id("#contents"));
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 0, width: 12, height: 8 },
	]);
});

it.each(["display:none", "visibility:hidden"])(
	"keeps the shared geometry distinction for %s",
	(style) => {
		const { range, text } = fixture(undefined, `main{${style}}`);
		range.selectNodeContents(text());
		expect(rangeClientRects(range)).toHaveLength(
			style === "display:none" ? 0 : 1,
		);
	},
);

it("returns empty for detached ranges and rejects closed owners", () => {
	const { tree, range } = fixture();
	const detached = tree.createText("detached");
	range.selectNodeContents(detached);
	expect(rangeClientRects(range)).toEqual([]);
	tree.close();
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("keeps live mutation adjustment and recomputes layout", () => {
	const { tree, range, text, id } = fixture();
	range.setStart(text(), 1);
	range.setEnd(text(), 3);
	const before = rangeClientRects(range);
	domRangeOwner(tree).replaceText(text(), 0, 0, "XX");
	expect(range.startOffset).toBe(3);
	expect(rangeBoundingClientRect(range)).toMatchObject({ x: 18, width: 12 });
	tree.setAttribute(id("#target"), "style", "font-size:16px");
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 36,
		width: 24,
		height: 16,
	});
	expect(before[0]).toMatchObject({ x: 6, width: 12, height: 8 });
});

it("projects normal, absolute and fixed text through the existing root-scroll model", () => {
	const { tree, range, text } = fixture(
		'<main style="height:400px"><div id="normal">ABC</div><div id="absolute">ABC</div><div id="fixed"><span id="target">ABC</span></div></main>',
		"#absolute{position:absolute;left:20px;top:80px}#fixed{position:fixed;left:50px;top:30px}",
	);
	for (const selector of ["#normal", "#absolute", "#target"]) {
		documentScroll(tree).to(0, 0);
		range.setStart(text(selector), 1);
		range.setEnd(text(selector), 2);
		const before = rangeBoundingClientRect(range);
		documentScroll(tree).to(0, 40);
		const after = rangeBoundingClientRect(range);
		expect(after.y).toBe(before.y - (selector === "#target" ? 0 : 40));
		expect(after.x).toBe(before.x);
	}
});

it("shares glyph coordinates after viewport-dependent wrapping", () => {
	const { tree, range, text } = fixture('<main id="target">AA BB CC</main>');
	range.setStart(text(), 6);
	range.setEnd(text(), 8);
	expect(rangeBoundingClientRect(range).y).toBe(1);
	documentStyles(tree).setViewport(18, 100);
	const glyph = layoutDocument(tree)
		.contexts.flatMap((context) => context.glyphs)
		.find(
			(glyph) => glyph.ref === tree.reference(text()) && glyph.offset === 6,
		);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: glyph?.x,
		y: glyph?.y,
		width: 12,
	});
});

it("retains unsupported layout errors rather than returning empty geometry", () => {
	const { range, text } = fixture(undefined, "main{position:sticky}");
	range.selectNodeContents(text());
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("validates bounds and charges source, layout and rectangle work", () => {
	const { range, text } = fixture(
		'<main id="target">AA BB CC</main>',
		"main{width:18px}",
	);
	range.selectNodeContents(text());
	for (const options of [
		{ maxWork: 10 },
		{ maxNodes: 1 },
		{ maxDepth: 1 },
		{ maxRectangles: 1 },
	])
		expect(() => rangeClientRects(range, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	for (const options of [
		{ maxWork: 0 },
		{ maxRectangles: 5000 },
		{ unknown: 1 },
	])
		expect(() => rangeClientRects(range, options)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
});
