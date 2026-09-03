import { afterEach, expect, it } from "vitest";
import { bitmapGlyph } from "./bitmap-font.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
function fixture(markup: string) {
	const tree = parseHtmlDocument(markup, "https://example.com/");
	documents.push(tree);
	documentStyles(tree).setViewport(40, 40);
	return tree;
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function pixel(image: Readonly<RasterImage>, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.subarray(offset, offset + 4)];
}
const white = [255, 255, 255, 255];
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];

it.each(["red", "rgb(255 0 0)", "hsl(0 100% 50%)", "#f00"])(
	"paints actual glyph ink using inherited %s foreground",
	(color) => {
		const result = rasterizeDocument(
			fixture(
				`<main style="font-size:8px;color:${color}"><span>A</span></main>`,
			),
		);
		for (let row = 0; row < 8; row++)
			for (let column = 0; column < 5; column++)
				expect(pixel(result.image, column, row + 1)).toEqual(
					bitmapGlyph("A").rows[row] & (16 >> column) ? red : white,
				);
		expect(result.metrics.paintedGlyphs).toBe(1);
	},
);

it("composites alpha foreground over a solid block and skips transparent ink", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="font-size:8px;background-color:blue;color:#ff000080">A<span style="color:transparent">B</span></main>',
		),
	);
	expect(pixel(result.image, 1, 1)).toEqual([128, 0, 127, 255]);
	expect(pixel(result.image, 7, 1)).toEqual(blue);
	expect(result.metrics.transparentGlyphs).toBe(1);
});

it("fills block content and padding but not margins", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="margin:3px;padding:2px;width:10px;height:5px;background-color:red"></main>',
		),
	);
	expect(pixel(result.image, 2, 3)).toEqual(white);
	expect(pixel(result.image, 3, 3)).toEqual(red);
	expect(pixel(result.image, 16, 11)).toEqual(red);
	expect(pixel(result.image, 17, 11)).toEqual(white);
	expect(pixel(result.image, 3, 12)).toEqual(white);
});

it("paints nested block backgrounds once in tree order", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="background-color:red;padding:2px"><div style="height:5px;background-color:#0000ff80"></div></main>',
		),
	);
	expect(pixel(result.image, 0, 0)).toEqual(red);
	expect(pixel(result.image, 2, 2)).toEqual([127, 0, 128, 255]);
	expect(result.metrics.paintedBackgrounds).toBe(2);
});

it("paints all normal-flow block backgrounds behind earlier text when blocks overlap", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="font-size:8px;color:red"><div>A</div><div style="margin-top:-10px;height:10px;background-color:blue"></div></main>',
		),
	);
	expect(pixel(result.image, 1, 1)).toEqual(red);
	expect(pixel(result.image, 0, 1)).toEqual(blue);
});

it("propagates a body background to the canvas, including outside its box, without double alpha", () => {
	const result = rasterizeDocument(
		fixture(
			'<body style="margin:10px;background-color:#ff000080"><main style="height:5px"></main></body>',
		),
	);
	expect(pixel(result.image, 0, 0)).toEqual([255, 127, 127, 255]);
	expect(pixel(result.image, 10, 10)).toEqual([255, 127, 127, 255]);
	expect(pixel(result.image, 39, 39)).toEqual([255, 127, 127, 255]);
	expect(result.metrics.paintedBackgrounds).toBe(1);
});

it("uses a nontransparent root background for the canvas and paints body only within its box", () => {
	const result = rasterizeDocument(
		fixture(
			'<html style="background-color:red"><body style="margin:5px;height:10px;background-color:blue"></body></html>',
		),
	);
	expect(pixel(result.image, 0, 0)).toEqual(red);
	expect(pixel(result.image, 5, 5)).toEqual(blue);
	expect(pixel(result.image, 5, 15)).toEqual(red);
	expect(result.metrics.paintedBackgrounds).toBe(2);
});

it("treats propagated currentcolor as specified on the root", () => {
	const result = rasterizeDocument(
		fixture(
			'<html style="color:red"><body style="color:blue;background-color:currentcolor">Text</body></html>',
		),
	);
	expect(result.canvasBackground.color).toEqual(red);
	expect(pixel(result.image, 39, 39)).toEqual(red);
});

it.each(["html", "body"])(
	"does not propagate a display:none %s background",
	(tag) => {
		const result = rasterizeDocument(
			fixture(
				`<style>body{background-color:red}${tag}{display:none}</style>Text`,
			),
		);
		expect(pixel(result.image, 39, 39)).toEqual(white);
		expect(result.metrics.paintedBackgrounds).toBe(0);
	},
);

it("propagates a hidden body canvas while suppressing hidden local backgrounds and text", () => {
	const result = rasterizeDocument(
		fixture(
			'<body style="visibility:hidden;background-color:red"><main style="height:10px;background-color:blue">A</main></body>',
		),
	);
	expect(pixel(result.image, 0, 0)).toEqual(red);
	expect(result.metrics.paintedBackgrounds).toBe(1);
	expect(result.metrics.hiddenGlyphs).toBe(1);
});

it("does not create a local background for display:contents", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="display:contents;background-color:red;color:blue;font-size:8px">A</main>',
		),
	);
	expect(pixel(result.image, 0, 0)).toEqual(white);
	const glyph = result.layout.contexts.flatMap((context) => context.glyphs)[0];
	expect(pixel(result.image, glyph.x + 1, glyph.y)).toEqual(blue);
	expect(result.metrics.paintedBackgrounds).toBe(0);
});

it("paints one alpha fragment across adjacent text nodes and nested inline spans", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="font-size:8px;color:transparent"><span style="background-color:#ff000080">A<span>B</span>C</span></main>',
		),
	);
	expect(result.metrics.inlineFragments).toBe(1);
	for (let column = 0; column < 18; column++)
		expect(pixel(result.image, column, 1)).toEqual([255, 127, 127, 255]);
	expect(pixel(result.image, 18, 1)).toEqual(white);
});

it("layers outer inline backgrounds before inner backgrounds and foreground", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="font-size:8px;color:transparent"><span style="background-color:red">A<span style="background-color:#0000ff80">B</span>C</span></main>',
		),
	);
	expect(pixel(result.image, 0, 1)).toEqual(red);
	expect(pixel(result.image, 6, 1)).toEqual([127, 0, 128, 255]);
	expect(pixel(result.image, 12, 1)).toEqual(red);
	expect(result.metrics.inlineFragments).toBe(2);
});

it("breaks inline backgrounds into wrapped line fragments and excludes half-leading", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="font-size:8px;width:6px;color:transparent"><span style="background-color:red">A B</span></main>',
		),
	);
	expect(result.metrics.inlineFragments).toBe(2);
	expect(pixel(result.image, 0, 0)).toEqual(white);
	expect(pixel(result.image, 0, 1)).toEqual(red);
	expect(pixel(result.image, 0, 9)).toEqual(white);
	expect(pixel(result.image, 0, 11)).toEqual(red);
	expect(pixel(result.image, 6, 11)).toEqual(white);
});

it("uses each inline font box and vertical padding rather than the entire line box", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="font-size:8px;line-height:4;color:transparent"><span style="background-color:red;padding-top:2px;padding-bottom:3px">A</span></main>',
		),
	);
	expect(pixel(result.image, 0, 9)).toEqual(white);
	expect(pixel(result.image, 0, 10)).toEqual(red);
	expect(pixel(result.image, 0, 22)).toEqual(red);
	expect(pixel(result.image, 0, 23)).toEqual(white);
});

it("keeps inherited currentcolor backgrounds tied to the child foreground", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="font-size:8px"><span style="color:red;background-color:currentcolor">A<span style="color:blue;background-color:inherit">B</span></span></main>',
		),
	);
	expect(pixel(result.image, 0, 1)).toEqual(red);
	expect(pixel(result.image, 6, 1)).toEqual(blue);
});

it("paints only visible inline backgrounds even with visible descendants", () => {
	const result = rasterizeDocument(
		fixture(
			'<main style="font-size:8px"><span style="visibility:hidden;background-color:red">A<span style="visibility:visible;color:transparent;background-color:blue">B</span></span></main>',
		),
	);
	expect(pixel(result.image, 0, 1)).toEqual(white);
	expect(pixel(result.image, 6, 1)).toEqual(blue);
});

it("renders an integer clip identically to its corresponding full-image rectangle", () => {
	const tree = fixture(
		'<body style="background-color:aliceblue"><main style="padding:2px;font-size:8px;background-color:#ff000040"><span style="background-color:#0000ff80;color:lime">Alpha beta</span></main></body>',
	);
	const full = rasterizeDocument(tree);
	const cropped = rasterizeDocument(tree, {
		clip: { x: 3, y: 2, width: 13, height: 17 },
	});
	for (let row = 0; row < 17; row++)
		for (let column = 0; column < 13; column++)
			expect(pixel(cropped.image, column, row)).toEqual(
				pixel(full.image, column + 3, row + 2),
			);
});

it("invalidates cached paint after a mutation while keeping prior captures unchanged", () => {
	const tree = fixture(
		'<main style="height:10px;background-color:red"></main>',
	);
	const before = rasterizeDocument(tree);
	const revision = tree.revision;
	rasterizeDocument(tree);
	expect(tree.revision).toBe(revision);
	const id = new DocumentQueries(tree).querySelector("main");
	if (id === null) throw new Error("Missing main");
	tree.setAttribute(id, "style", "height:10px;background-color:blue");
	expect(pixel(rasterizeDocument(tree).image, 0, 0)).toEqual(blue);
	expect(pixel(before.image, 0, 0)).toEqual(red);
	tree.close();
	expect(() => rasterizeDocument(tree)).toThrow();
	expect(pixel(before.image, 0, 0)).toEqual(red);
});

it("charges intersecting background fills before painting and leaves the source intact on exhaustion", () => {
	const tree = fixture('<body style="background-color:red">A</body>');
	const revision = tree.revision;
	expect(() => rasterizeDocument(tree, { maxWork: 1700 })).toThrow(
		"work limit",
	);
	expect(tree.revision).toBe(revision);
	expect(pixel(rasterizeDocument(tree).image, 39, 39)).toEqual(red);
});
