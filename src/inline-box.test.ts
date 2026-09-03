import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { layoutDocumentText } from "./text-layout.js";

const documents: DocumentTree[] = [];
function fixture(content: string, css = "", width = 100) {
	const tree = parseHtmlDocument(
		`<style>main{font-size:8px;width:${width}px}${css}</style><main>${content}</main>`,
		"https://fixture.invalid/inline-box",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const main = tree.reference(id("main"));
	const layout = () => layoutDocumentText(tree);
	const context = () => {
		const found = layout().contexts.find((entry) => entry.ref === main);
		if (!found) throw new Error("Missing main text context");
		return found;
	};
	const rects = (selector: string) =>
		documentGeometry(tree).getClientRects(id(selector));
	const resolved = (selector: string, property: string) =>
		resolvedStyleValue(tree, id(selector), property);
	return { tree, id, layout, context, rects, resolved };
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("advances across horizontal padding and margins while client rectangles exclude margins", () => {
	const { context, rects } = fixture(
		'<span id="target">a</span>b',
		"span{margin-left:3px;margin-right:4px;padding-left:5px;padding-right:6px}",
	);
	expect(context().glyphs.map((glyph) => glyph.x)).toEqual([8, 24]);
	expect(context().lines[0].width).toBe(30);
	expect(rects("#target")[0]).toMatchObject({ x: 3, width: 17 });
});

it("slices horizontal edges onto only the first and last wrapped fragments", () => {
	const { context, rects } = fixture(
		'<span id="target">ab cd</span>',
		"span{margin-left:1px;margin-right:4px;padding-left:2px;padding-right:3px}",
		22,
	);
	expect(context().glyphs.map((glyph) => [glyph.x, glyph.line])).toEqual([
		[3, 0],
		[9, 0],
		[0, 1],
		[6, 1],
	]);
	expect(rects("#target").map((rect) => [rect.x, rect.width])).toEqual([
		[1, 14],
		[0, 15],
	]);
	expect(context().lines.map((line) => line.width)).toEqual([15, 19]);
});

it("includes trailing padding before choosing a word's line even with trailing whitespace", () => {
	const { context } = fixture(
		"x <span>a </span>",
		"span{padding-right:6px}",
		22,
	);
	expect(
		context().glyphs.map((glyph) => [glyph.character, glyph.line]),
	).toEqual([
		["x", 0],
		["a", 1],
	]);
	expect(context().lines.map((line) => line.width)).toEqual([6, 12]);
});

it("keeps a non-wrapped space inside its closing inline edge", () => {
	const { context, rects } = fixture(
		'x<span id="target">a </span>b',
		"span{padding-right:3px}",
	);
	expect(context().glyphs.map((glyph) => [glyph.character, glyph.x])).toEqual([
		["x", 0],
		["a", 6],
		[" ", 12],
		["b", 21],
	]);
	expect(rects("#target")[0]).toMatchObject({ x: 6, width: 15 });
});

it("resolves signed margins without inflating parent bounds to descendant overflow", () => {
	const { context, rects } = fixture(
		'<span id="outer"><span id="inner">a</span></span>b',
		"#inner{margin-left:-4px;margin-right:-2px;padding:0 2px}",
	);
	expect(context().glyphs.map((glyph) => glyph.x)).toEqual([-2, 4]);
	expect(rects("#inner")[0]).toMatchObject({ x: -4, width: 10 });
	expect(rects("#outer")[0]).toMatchObject({ x: 0, width: 4 });
	expect(context().lines[0].width).toBe(10);
});

it("resolves percentages against the containing block and automatic inline margins to zero", () => {
	const { context, resolved } = fixture(
		'<span id="target">a</span>',
		"span{padding-left:10%;padding-right:5%;margin:0 auto}",
	);
	expect(context().glyphs[0].x).toBe(10);
	expect(context().lines[0].width).toBe(21);
	expect(resolved("#target", "padding")).toBe("0px 5px 0px 10px");
	expect(resolved("#target", "margin-left")).toBe("0px");
});

it("gives empty padded inline boxes real geometry without inventing glyphs", () => {
	const { context, rects } = fixture(
		'<span id="target"></span>',
		"span{padding:2px}",
	);
	expect(context().glyphs).toHaveLength(0);
	expect(context().lines).toHaveLength(1);
	expect(context().lines[0]).toMatchObject({ width: 4, height: 10 });
	expect(rects("#target")[0]).toMatchObject({
		x: 0,
		y: -1,
		width: 4,
		height: 12,
	});
});

it("trims whitespace-only padded content without discarding its edges", () => {
	const { context, rects } = fixture(
		'<span id="target">   </span>',
		"span{padding:3px}",
	);
	expect(context().glyphs).toHaveLength(0);
	expect(context().lines[0].width).toBe(6);
	expect(rects("#target")[0].width).toBe(6);
});

it("trims nowrap trailing spaces before positioning the closing padding", () => {
	const { context, rects } = fixture(
		'<span id="target">a </span>',
		"span{white-space:nowrap;padding-right:3px}",
	);
	expect(context().glyphs.map((glyph) => glyph.character)).toEqual(["a"]);
	expect(context().lines[0].width).toBe(9);
	expect(rects("#target")[0].width).toBe(9);
});

it("preserves preformatted spaces and tabs rather than treating them as edge tokens", () => {
	const { context, rects } = fixture(
		'<span id="target"> a </span>',
		"span{white-space:pre;padding:0 2px}",
	);
	expect(
		context()
			.glyphs.map((glyph) => glyph.character)
			.join(""),
	).toBe(" a ");
	expect(context().lines[0].width).toBe(22);
	expect(rects("#target")[0].width).toBe(22);
});

it("does not collapse adjacent inline margins", () => {
	const { context } = fixture(
		'<span id="first">a</span><span id="second">b</span>',
		"#first{margin-right:3px}#second{margin-left:4px}",
	);
	expect(context().glyphs.map((glyph) => glyph.x)).toEqual([0, 13]);
});

it("includes descendant margin advances in the parent's content but excludes its own margins", () => {
	const { context, rects } = fixture(
		'<span id="outer"><span id="inner">a</span>b</span>',
		"#outer{padding:0 2px}#inner{padding:0 1px;margin:0 3px}",
	);
	expect(context().glyphs.map((glyph) => glyph.x)).toEqual([6, 16]);
	expect(rects("#outer")[0]).toMatchObject({ x: 0, width: 24 });
	expect(rects("#inner")[0]).toMatchObject({ x: 5, width: 8 });
});

it("slices edges across block-in-inline formatting splits without claiming client geometry support", () => {
	const { layout, rects } = fixture(
		'<span id="target">a<div>x</div>b</span>',
		"span{padding:0 3px}",
	);
	const glyphs = layout().contexts.flatMap((context) => context.glyphs);
	expect(glyphs.find((glyph) => glyph.character === "a")?.x).toBe(3);
	expect(glyphs.find((glyph) => glyph.character === "b")?.x).toBe(0);
	expect(() => rects("#target")).toThrow(/block-in-inline/);
});

it("bounds token, fragment, work and numeric costs for edges too", () => {
	const { tree } = fixture("<span><span></span></span>", "span{padding:1px}");
	expect(() => layoutDocumentText(tree, { maxTokens: 3 })).toThrow(
		/token limit/,
	);
	expect(() => layoutDocumentText(tree, { maxFragments: 1 })).toThrow(
		/fragment limit/,
	);
	expect(() => layoutDocumentText(tree, { maxWork: 1 })).toThrow(/work limit/);
	const huge = fixture("<span>a</span>", "span{padding-left:20000000px}");
	expect(() => huge.layout()).toThrow(/length limit/);
});

it("keeps revision-cached geometry and resolved edges live after mutation", () => {
	const { tree, id, rects, resolved } = fixture(
		'<span id="target">a</span>',
		"span{padding:0 2px}",
	);
	expect(rects("#target")[0].width).toBe(10);
	expect(resolved("#target", "padding-left")).toBe("2px");
	tree.setAttribute(
		id("#target"),
		"style",
		"padding-left:10%;margin-left:-3px",
	);
	expect(rects("#target")[0]).toMatchObject({ x: -3, width: 18 });
	expect(resolved("#target", "margin-left")).toBe("-3px");
	expect(documentGeometry(tree).metrics().builds).toBe(2);
});

it("paints padding but leaves margins transparent and uses the same rectangle for capture", () => {
	const { tree, id, rects } = fixture(
		'<span id="target">a</span>',
		"span{margin-left:3px;padding-left:2px;padding-right:4px;background-color:red;color:transparent}",
	);
	const result = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 30, height: 12 },
	});
	const pixel = (column: number) => [
		...result.image.pixels.slice(
			(2 * 30 + column) * 4,
			(2 * 30 + column + 1) * 4,
		),
	];
	expect(pixel(2)).toEqual([255, 255, 255, 255]);
	expect(pixel(3)).toEqual([255, 0, 0, 255]);
	expect(pixel(14)).toEqual([255, 0, 0, 255]);
	expect(pixel(15)).toEqual([255, 255, 255, 255]);
	const capture = rasterizeDocument(tree, {
		element: tree.reference(id("#target")),
	});
	expect(capture.clip.width).toBe(rects("#target")[0].width);
	expect(capture.image.width).toBe(12);
});

it("paints empty inline padding from layout fragments, not guessed glyph ancestry", () => {
	const { tree } = fixture(
		"<span></span>",
		"span{padding:2px;background-color:red}",
	);
	const result = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 10, height: 10 },
	});
	expect([...result.image.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
	expect(result.metrics.paintedGlyphs).toBe(0);
	expect(result.metrics.inlineFragments).toBe(1);
});

it("paints nested backgrounds in tree order when signed margins overlap a later sibling", () => {
	const { tree } = fixture(
		'<span id="outer"><span id="inner">a</span></span><span id="later">b</span>',
		"main{color:transparent}#outer{background-color:red}#inner{background-color:blue}#later{margin-left:-3px;background-color:lime}",
	);
	const result = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 12, height: 10 },
	});
	const pixel = (column: number) => [
		...result.image.pixels.slice(
			(2 * 12 + column) * 4,
			(2 * 12 + column + 1) * 4,
		),
	];
	expect(pixel(2)).toEqual([0, 0, 255, 255]);
	expect(pixel(3)).toEqual([0, 255, 0, 255]);
});

it("paints only the real first/last padding fragments without filling margins or line gaps", () => {
	const { tree } = fixture(
		"<span>ab cd</span>",
		"span{margin-left:1px;margin-right:4px;padding-left:2px;padding-right:3px;background-color:red;color:transparent}",
		22,
	);
	const result = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 22, height: 20 },
	});
	const pixel = (column: number, row: number) => [
		...result.image.pixels.slice(
			(row * 22 + column) * 4,
			(row * 22 + column + 1) * 4,
		),
	];
	expect(pixel(0, 2)).toEqual([255, 255, 255, 255]);
	expect(pixel(1, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(0, 12)).toEqual([255, 0, 0, 255]);
	expect(pixel(14, 12)).toEqual([255, 0, 0, 255]);
	expect(pixel(15, 12)).toEqual([255, 255, 255, 255]);
	expect(pixel(5, 9)).toEqual([255, 255, 255, 255]);
});
