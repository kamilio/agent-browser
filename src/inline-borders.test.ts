import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentGeometry } from "./document-geometry.js";
import { documentElementSizes } from "./element-sizes.js";
import { documentHitTesting } from "./hit-testing.js";
import { rasterizeDocument } from "./document-raster.js";
import { layoutDocumentText } from "./text-layout.js";
import { DocumentQueries } from "./selectors.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(
	content = '<span id="target">ab cd ef</span>',
	css = "span{border:1px solid red;color:transparent}",
	width = 20,
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0}main{font-size:8px;line-height:12px;width:${width}px}${css}</style><main>${content}</main>`,
		"https://fixture.invalid/inline-borders",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") =>
		queries.querySelector(selector) as number;
	const contexts = () => layoutDocumentText(tree).contexts;
	const context = () => {
		const found = contexts().find(
			(context) => context.ref === tree.reference(id("main")),
		);
		if (!found) throw new Error("Missing main text context");
		return found;
	};
	const rects = () => documentGeometry(tree).getClientRects(id());
	return { tree, id, contexts, context, rects };
}
function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	return Array.from(
		image.pixels.slice(
			(row * image.width + column) * 4,
			(row * image.width + column) * 4 + 4,
		),
	);
}

it("slices side borders onto only the first and last wrapped fragments", () => {
	const { context, rects } = fixture();
	expect(context().glyphs.map((glyph) => [glyph.x, glyph.line])).toEqual([
		[1, 0],
		[7, 0],
		[0, 1],
		[6, 1],
		[0, 2],
		[6, 2],
	]);
	expect(
		rects().map((rect) => [rect.x, rect.y, rect.width, rect.height]),
	).toEqual([
		[0, 1, 13, 10],
		[0, 13, 12, 10],
		[0, 25, 13, 10],
	]);
	expect(context().fragments.map((fragment) => fragment.borders)).toEqual([
		{ borderLeft: 1, borderRight: 0, borderTop: 1, borderBottom: 1 },
		{ borderLeft: 0, borderRight: 0, borderTop: 1, borderBottom: 1 },
		{ borderLeft: 0, borderRight: 1, borderTop: 1, borderBottom: 1 },
	]);
});

it("paints open continuation edges rather than closed rectangles per line", () => {
	const { tree } = fixture();
	const { image } = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 20, height: 40 },
	});
	for (const [column, row] of [
		[0, 5],
		[5, 1],
		[5, 13],
		[5, 25],
		[12, 29],
	])
		expect(pixel(image, column, row)).toEqual([255, 0, 0, 255]);
	for (const [column, row] of [
		[12, 5],
		[0, 17],
		[11, 17],
		[0, 29],
	])
		expect(pixel(image, column, row)).toEqual([255, 255, 255, 255]);
});

it("accounts for border, padding and margins separately in horizontal flow", () => {
	const { context, rects } = fixture(
		'<span id="target">ab</span>',
		"span{border-left:1px solid;border-right:2px solid;padding-left:2px;padding-right:3px;margin-left:3px;margin-right:4px}",
		100,
	);
	expect(context().glyphs.map((glyph) => glyph.x)).toEqual([6, 12]);
	expect(context().lines[0].width).toBe(27);
	expect(rects()[0]).toMatchObject({ x: 3, width: 20 });
});

it("vertical borders enlarge rectangles without increasing the inline line-height", () => {
	const { context, rects } = fixture(
		'<span id="target">a</span><br>b',
		"span{border-top:3px solid;border-bottom:4px solid;padding:2px}",
		100,
	);
	expect(context().lines.map((line) => line.height)).toEqual([12, 12]);
	expect(rects()[0]).toMatchObject({ y: -3, height: 19 });
});

it("reports zero inline client dimensions but actual border offsets and union sizes", () => {
	const { tree, id } = fixture();
	expect(documentElementSizes(tree).get(id())).toEqual({
		clientWidth: 0,
		clientHeight: 0,
		clientTop: 1,
		clientLeft: 1,
		offsetWidth: 13,
		offsetHeight: 34,
	});
});

it("hit testing uses painted fragment boxes and excludes inter-line gaps", () => {
	const { tree, id } = fixture();
	const hit = documentHitTesting(tree);
	expect(hit.elementFromPoint(0.5, 5)).toBe(id());
	expect(hit.elementFromPoint(12.5, 29)).toBe(id());
	expect(hit.elementFromPoint(5, 12)).not.toBe(id());
	expect(hit.elementFromPoint(15, 17)).not.toBe(id());
});

it("border width mutation invalidates geometry and changes fragment widths", () => {
	const { tree, id, context, rects } = fixture();
	expect(rects()).toHaveLength(3);
	tree.setAttribute(id(), "style", "border-width:5px");
	expect(rects().map((rect) => rect.width)).toEqual([17, 12, 17]);
	expect(context().glyphs[0].x).toBe(5);
	expect(documentElementSizes(tree).get(id()).clientLeft).toBe(5);
	expect(documentGeometry(tree).metrics().builds).toBe(2);
});

it("nested inline borders preserve each owner's own edges and source order", () => {
	const { tree, id, context } = fixture(
		'<span id="target"><span id="inner">a</span></span>b',
		"#target{border:2px solid red}#inner{border:1px solid blue}main{color:transparent}",
		100,
	);
	expect(context().glyphs.map((glyph) => glyph.x)).toEqual([3, 12]);
	expect(documentGeometry(tree).getClientRects(id())[0]).toMatchObject({
		x: 0,
		width: 12,
	});
	expect(documentGeometry(tree).getClientRects(id("#inner"))[0]).toMatchObject({
		x: 2,
		width: 8,
	});
	const { image } = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 20, height: 14 },
	});
	expect(pixel(image, 0, 4)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 2, 4)).toEqual([0, 0, 255, 255]);
});

it.each(["", "   "])(
	"empty or collapsed content %j retains border geometry without glyphs",
	(text) => {
		const { context, rects } = fixture(
			`<span id="target">${text}</span>`,
			"span{border:2px solid}",
			100,
		);
		expect(context().glyphs).toHaveLength(0);
		expect(context().lines[0]).toMatchObject({ width: 4, height: 12 });
		expect(rects()[0]).toMatchObject({ width: 4, height: 12 });
	},
);

it.each([
	'<span id="target">ab<br>cd</span>',
	'<span id="target" style="white-space:pre">ab\ncd</span>',
])("forced breaks slice edges for %s", (content) => {
	const { context } = fixture(content);
	const bordered = context().fragments.filter((fragment) => fragment.borders);
	expect(
		bordered.map((fragment) => [
			fragment.borders?.borderLeft,
			fragment.borders?.borderRight,
		]),
	).toEqual([
		[1, 0],
		[0, 1],
	]);
});

it("single-sided borders are absent from continuation fragments when appropriate", () => {
	const { context } = fixture(undefined, "span{border-left:2px solid}");
	expect(
		context().fragments.map((fragment) => fragment.borders?.borderLeft ?? 0),
	).toEqual([2, 0, 0]);
});

it("right aligned fragments use the same alignment for borders and glyphs", () => {
	const { rects } = fixture(
		undefined,
		"span{border:1px solid}main{text-align:right}",
	);
	expect(rects().map((rect) => rect.x)).toEqual([7, 8, 7]);
});

it("transparent borders occupy flow space without painting pixels", () => {
	const { tree, rects } = fixture(
		undefined,
		"span{border:1px solid transparent}",
	);
	expect(rects()[0].width).toBe(13);
	expect(rasterizeDocument(tree).metrics.borderPixels).toBe(0);
});

it("hidden borders are neither geometry nor paint", () => {
	const { tree, rects } = fixture(undefined, "span{border:5px hidden red}");
	expect(rects()[0].width).toBe(12);
	expect(rasterizeDocument(tree).metrics.borderPixels).toBe(0);
});

it("slices formatting splits around blocks while retaining the CSSOM split-box gate", () => {
	const { tree, contexts, rects } = fixture(
		'<span id="target">a<div>x</div>b</span>',
		"span{border:2px solid}",
		100,
	);
	const bordered = contexts()
		.flatMap((context) => context.fragments)
		.filter((fragment) => fragment.borders);
	expect(
		bordered.map((fragment) => [
			fragment.borders?.borderLeft,
			fragment.borders?.borderRight,
		]),
	).toEqual([
		[2, 0],
		[0, 2],
	]);
	expect(rasterizeDocument(tree).metrics.borderPixels).toBeGreaterThan(0);
	expect(() => rects()).toThrow("block-in-inline");
});

it("element captures include the full negative-y border bounds", () => {
	const { tree, id, rects } = fixture(
		'<span id="target">a</span>',
		"span{border:4px solid red}",
		100,
	);
	expect(rects()[0]).toMatchObject({ x: 0, y: -2, width: 14, height: 16 });
	const capture = rasterizeDocument(tree, { element: tree.reference(id()) });
	expect(capture.clip).toEqual({ x: 0, y: -2, width: 14, height: 16 });
	expect(pixel(capture.image, 0, 0)).toEqual([255, 0, 0, 255]);
});

it("still applies shared fragment and work budgets", () => {
	const { tree } = fixture();
	expect(() => layoutDocumentText(tree, { maxFragments: 1 })).toThrow(
		"fragment limit",
	);
	expect(() =>
		rasterizeDocument(tree, {
			clip: { x: 0, y: 0, width: 20, height: 40 },
			maxWork: 801,
		}),
	).toThrow("work limit");
});
