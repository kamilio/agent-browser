import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster, type RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(css: string, content: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}${css}</style>${content}`,
		"https://fixture.invalid/layout-core",
	);
	trees.push(tree);
	const query = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw Error(`Missing ${selector}`);
		return found;
	};
	documentStyles(tree).setViewport(120, 100);
	const geometry = documentGeometry(tree);
	return {
		tree,
		id,
		rect: (selector: string) => geometry.getBoundingClientRect(id(selector)),
	};
}
function pixel(image: RasterImage, column: number, row: number) {
	const start = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(start, start + 4));
}
const rowContent =
	'<main><div id="first">A</div><div id="second">B</div><div id="third">C</div></main><footer id="after"></footer>';

it.each([
	["row", "wrap", 0, 0, 30, 0, 0, 20],
	["row-reverse", "wrap", 30, 0, 0, 0, 30, 20],
	["row", "wrap-reverse", 0, 20, 30, 20, 0, 0],
	["row-reverse", "wrap-reverse", 30, 20, 0, 20, 30, 0],
] as const)(
	"places row items and following flow for %s/%s",
	(direction, wrap, firstX, firstY, secondX, secondY, thirdX, thirdY) => {
		const { tree, rect } = fixture(
			`main{display:flex;width:50px;gap:10px;flex-direction:${direction};flex-wrap:${wrap}}main>div{flex:0 0 20px;height:10px;min-width:0}`,
			rowContent,
		);
		expect(rect("#first")).toMatchObject({
			x: firstX,
			y: firstY,
			width: 20,
			height: 10,
		});
		expect(rect("#second")).toMatchObject({ x: secondX, y: secondY });
		expect(rect("#third")).toMatchObject({ x: thirdX, y: thirdY });
		expect(rect("#after").y).toBe(30);
		expect(renderDocumentPdf(tree).metrics.glyphs).toBe(3);
	},
);

it.each([
	["column", "wrap", 0, 0, 25, 20, 0],
	["column-reverse", "wrap", 0, 25, 0, 20, 25],
	["column", "wrap-reverse", 85, 0, 25, 65, 0],
	["column-reverse", "wrap-reverse", 85, 25, 0, 65, 25],
] as const)(
	"places wrapped columns for %s/%s",
	(direction, wrap, firstX, firstY, secondY, thirdX, thirdY) => {
		const { rect } = fixture(
			`main{display:flex;width:100px;height:45px;gap:5px;align-content:flex-start;flex-direction:${direction};flex-wrap:${wrap}}main>div{flex:none;width:15px;height:20px}`,
			rowContent,
		);
		expect(rect("#first")).toMatchObject({
			x: firstX,
			y: firstY,
			width: 15,
			height: 20,
		});
		expect(rect("#second").y).toBe(secondY);
		expect(rect("#third")).toMatchObject({ x: thirdX, y: thirdY });
		expect(rect("#after").y).toBe(45);
	},
);

it("reflows nested flex items before translating relative subtrees", () => {
	const { tree, rect, id } = fixture(
		"main{display:flex;width:100px}#inner{display:flex;flex:1;min-width:0;position:relative;left:5px;top:7px}#inner>div{flex:1;min-width:0;height:10px}#peer{flex:0 0 20px;height:10px}",
		'<main><section id="inner"><div id="first">A</div><div id="second">B</div></section><div id="peer">C</div></main><footer id="after"></footer>',
	);
	expect(rect("#inner")).toMatchObject({ x: 5, y: 7, width: 80, height: 10 });
	expect(rect("#first")).toMatchObject({ x: 5, y: 7, width: 40 });
	expect(rect("#second")).toMatchObject({ x: 45, y: 7, width: 40 });
	expect(rect("#peer")).toMatchObject({ x: 80, y: 0 });
	expect(rect("#after").y).toBe(10);
	expect(resolvedStyleValue(tree, id("#inner"), "right")).toBe("-5px");
	expect(renderDocumentPdf(tree).metrics.glyphs).toBe(3);
});

it("uses intrinsic text widths for auto flex bases and redistributes growth", () => {
	const { rect } = fixture(
		"main{display:flex;width:60px}main>div{flex:1 1 auto;min-width:0}",
		'<main><div id="first">AA</div><div id="second">BBBB</div></main>',
	);
	expect(rect("#first").width).toBe(24);
	expect(rect("#second")).toMatchObject({ x: 24, width: 36 });
});

it("uses the last inline-block line as its outer baseline without duplicate glyphs", () => {
	const { tree, rect, id } = fixture(
		"#atom{display:inline-block;width:12px}",
		'<main id="host">A<span id="atom">B<br>C</span>Z</main><footer id="after"></footer>',
	);
	expect(rect("#atom")).toMatchObject({ x: 6, y: 0, width: 12, height: 20 });
	expect(rect("#after").y).toBe(20);
	const layout = layoutDocument(tree);
	const host = layout.contexts.find(
		(context) => context.ref === tree.reference(id("#host")),
	);
	expect(host?.lines[0]).toMatchObject({ baseline: 18, height: 20, width: 24 });
	expect(host?.glyphs.map((glyph) => [glyph.character, glyph.x])).toEqual([
		["A", 0],
		["Z", 18],
	]);
	expect(renderDocumentPdf(tree).metrics.glyphs).toBe(4);
});

it("shrink-wraps inline flex and keeps surrounding text in the outer context", () => {
	const { tree, rect, id } = fixture(
		"#atom{display:inline-flex;gap:2px}#atom>span{flex:none;width:10px;height:10px}",
		'<main id="host">A<span id="atom"><span>B</span><span>C</span></span>Z</main>',
	);
	expect(rect("#atom")).toMatchObject({ x: 6, width: 22, height: 10 });
	const host = layoutDocument(tree).contexts.find(
		(context) => context.ref === tree.reference(id("#host")),
	);
	expect(host?.glyphs.map((glyph) => [glyph.character, glyph.x])).toEqual([
		["A", 0],
		["Z", 28],
	]);
	expect(renderDocumentPdf(tree).metrics.glyphs).toBe(4);
});

it.each([
	["auto", 0],
	["40px", 10],
] as const)(
	"resolves vertical relative percentages against %s parent height",
	(height, top) => {
		const { tree, rect, id } = fixture(
			`main{height:${height}}#target{position:relative;top:25%;height:10px;width:10px}`,
			'<main><div id="target"></div></main>',
		);
		expect(rect("#target").y).toBe(top);
		expect(resolvedStyleValue(tree, id("#target"), "top")).toBe(`${top}px`);
	},
);

it.each([
	[-1, [0, 0, 255, 255]],
	[0, [255, 0, 0, 255]],
	[1, [255, 0, 0, 255]],
] as const)("shares relative z-index %s paint ordering", (zIndex, expected) => {
	const { tree } = fixture(
		`#first{position:relative;z-index:${zIndex};width:20px;height:10px;background:red}#second{margin-top:-10px;width:20px;height:10px;background:blue}`,
		'<div id="first"></div><div id="second"></div>',
	);
	expect(pixel(rasterizeDocument(tree).image, 5, 5)).toEqual(expected);
});

it("orders overlapping static flex item stacking contexts", () => {
	const { tree, rect } = fixture(
		"main{display:flex;width:40px}main>div{flex:0 0 20px;height:10px}#first{background:red;z-index:2}#second{background:blue;z-index:1;margin-left:-20px}",
		'<main><div id="first"></div><div id="second"></div></main>',
	);
	expect(rect("#second").x).toBe(0);
	expect(pixel(rasterizeDocument(tree).image, 5, 5)).toEqual([255, 0, 0, 255]);
});

it.each([
	'<button id="target">OK</button>',
	'<input id="target" value="OK">',
	'<textarea id="target">OK</textarea>',
	'<select id="target"><option>OK</option></select>',
])("lays out software controls with independent dimensions: %s", (content) => {
	const { tree, rect } = fixture("#target{width:30px;height:15px}", content);
	expect(rect("#target")).toMatchObject({ width: 30, height: 15 });
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});

it("positions decoded image content inside flex item borders without network access", async () => {
	const { tree, rect } = fixture(
		"main{display:flex;width:40px}img{flex:none;width:10px;height:10px;padding:2px;border:1px solid red}#peer{flex:1;height:16px}",
		'<main><img id="image" src="/image.png"><div id="peer"></div></main>',
	);
	const bytes = encodePng(createRaster(1, 1, [0, 255, 255, 255]));
	await documentImages(tree, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body: bytes,
			encodedBytes: bytes.length,
			redirects: [],
			elapsedMs: 0,
		}),
	}).settle();
	expect(rect("#image")).toMatchObject({ width: 16, height: 16 });
	expect(rect("#peer")).toMatchObject({ x: 16, width: 24 });
	const raster = rasterizeDocument(tree);
	expect(pixel(raster.image, 0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(raster.image, 3, 3)).toEqual([0, 255, 255, 255]);
	expect(raster.metrics.paintedImages).toBe(1);
});

it.each(["checkbox", "radio"])(
	"repaints software %s state without simulating pointer input",
	(type) => {
		const { tree, id } = fixture("", `<input id="target" type="${type}">`);
		const before = rasterizeDocument(tree).image.pixels;
		tree.setControl(id("#target"), { checked: true });
		expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
	},
);

it("updates software placeholder presentation from native value state", () => {
	const { tree, id } = fixture("", '<input id="target" placeholder="hint">');
	const before = layoutDocument(tree);
	expect(JSON.stringify(before)).toContain('"placeholder":true');
	tree.setControl(id("#target"), { value: "typed" });
	const after = layoutDocument(tree);
	expect(JSON.stringify(after)).toContain('"placeholder":false');
	expect(JSON.stringify(after)).toContain('"text":"typed"');
});

it("keeps password values out of software formatting records", () => {
	const { tree } = fixture("", '<input type="password" value="private-text">');
	expect(JSON.stringify(layoutDocument(tree))).not.toContain("private-text");
	expect(JSON.stringify(rasterizeDocument(tree).layout)).not.toContain(
		"private-text",
	);
});

it("invalidates prepared flex captures after mutations and revokes them on close", () => {
	const { tree, rect, id } = fixture(
		"main{display:flex;width:60px}main>div{flex:1;min-width:0;height:10px}",
		'<main><div id="first"></div><div id="second"></div></main>',
	);
	const painter = prepareDocumentRaster(tree);
	expect(rect("#first").width).toBe(30);
	tree.setAttribute(id("#first"), "style", "flex:2");
	expect(rect("#first").width).toBe(40);
	expect(() => painter.rasterize({})).toThrow();
	const fresh = prepareDocumentRaster(tree);
	tree.close();
	expect(() => fresh.rasterize({})).toThrow();
});

it("bounds page flex and relative layout work", () => {
	const { tree } = fixture(
		"main{display:flex;width:60px;position:relative;left:2px}main>div{flex:1}",
		rowContent,
	);
	expect(() => layoutDocument(tree, { maxWork: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => layoutDocument(tree)).not.toThrow();
});

it("projects sticky geometry without moving sibling flow and resets after mutation", () => {
	const { tree, id, rect } = fixture(
		"main{height:100px}#before{height:20px}#target{position:sticky;top:5px;width:10px;height:10px}#after{height:10px}#tail{height:100px}",
		'<main><div id="before"></div><div id="target"></div><footer id="after"></footer></main><div id="tail"></div>',
	);
	expect(rect("#target")).toMatchObject({
		x: 0,
		y: 20,
		width: 10,
		height: 10,
	});
	expect(rect("#after").y).toBe(30);
	const scroll = documentScroll(tree);
	scroll.to(0, 30);
	expect(scroll.get()).toEqual({ x: 0, y: 30 });
	expect(rect("#target")).toMatchObject({ x: 0, y: 5, width: 10, height: 10 });
	expect(rect("#after").y).toBe(0);
	tree.setAttribute(id("#target"), "style", "top:8px");
	expect(rect("#target").y).toBe(8);
	tree.setAttribute(id("#target"), "style", "position:static");
	expect(rect("#target")).toMatchObject({
		x: 0,
		y: -10,
		width: 10,
		height: 10,
	});
	expect(rect("#after").y).toBe(0);
});

it("clips overflow paint but not child rectangles and restores visible overflow", () => {
	const { tree, id, rect } = fixture(
		"body{background:white}#target{width:10px;height:10px;overflow:hidden}#child{width:20px;height:20px;background:red}",
		'<div id="target"><div id="child"></div></div>',
	);
	expect(rect("#target")).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
	expect(rect("#child")).toMatchObject({ x: 0, y: 0, width: 20, height: 20 });
	const clipped = rasterizeDocument(tree).image;
	expect(pixel(clipped, 5, 5)).toEqual([255, 0, 0, 255]);
	expect(pixel(clipped, 15, 5)).toEqual([255, 255, 255, 255]);
	expect(pixel(clipped, 5, 15)).toEqual([255, 255, 255, 255]);
	tree.setAttribute(id("#target"), "style", "overflow:visible");
	expect(rect("#target")).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
	expect(rect("#child")).toMatchObject({ x: 0, y: 0, width: 20, height: 20 });
	const visible = rasterizeDocument(tree).image;
	expect(pixel(visible, 15, 5)).toEqual([255, 0, 0, 255]);
	expect(pixel(visible, 5, 15)).toEqual([255, 0, 0, 255]);
});

it("places opposing floats inside a flow root and repositions them after mutation", () => {
	const { tree, id, rect } = fixture(
		"main{display:flow-root;width:60px}#target{display:inline-block;float:left;width:10px;height:10px}#peer{float:right;width:20px;height:15px}#after{height:5px}",
		'<main><div id="target"></div><div id="peer"></div></main><footer id="after"></footer>',
	);
	expect(rect("#target")).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
	expect(rect("#peer")).toMatchObject({ x: 40, y: 0, width: 20, height: 15 });
	expect(rect("main")).toMatchObject({ x: 0, y: 0, width: 60, height: 15 });
	expect(rect("#after").y).toBe(15);
	tree.setAttribute(id("#target"), "style", "float:right");
	expect(rect("#target")).toMatchObject({ x: 50, y: 0, width: 10, height: 10 });
	expect(rect("#peer")).toMatchObject({ x: 30, y: 0, width: 20, height: 15 });
	expect(rect("main").height).toBe(15);
	expect(rect("#after").y).toBe(15);
});

it("places grid tracks and gaps and rebuilds geometry after track mutation", () => {
	const { tree, id, rect } = fixture(
		"main{display:grid;width:60px;grid-template-columns:20px 30px;grid-template-rows:10px 15px;gap:5px 10px}",
		rowContent,
	);
	expect(rect("#first")).toMatchObject({ x: 0, y: 0, width: 20, height: 10 });
	expect(rect("#second")).toMatchObject({ x: 30, y: 0, width: 30, height: 10 });
	expect(rect("#third")).toMatchObject({ x: 0, y: 15, width: 20, height: 15 });
	expect(rect("main")).toMatchObject({ x: 0, y: 0, width: 60, height: 30 });
	expect(rect("#after").y).toBe(30);
	tree.setAttribute(id("main"), "style", "grid-template-columns:30px 20px");
	expect(rect("#first")).toMatchObject({ x: 0, y: 0, width: 30, height: 10 });
	expect(rect("#second")).toMatchObject({ x: 40, y: 0, width: 20, height: 10 });
	expect(rect("#third")).toMatchObject({ x: 0, y: 15, width: 30, height: 15 });
	expect(rect("#after").y).toBe(30);
});
