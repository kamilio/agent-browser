import { afterEach, expect, it } from "vitest";
import {
	documentCanvases,
	existingDocumentCanvases,
} from "./document-canvases.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	markup = '<canvas id="canvas" width="2" height="1"></canvas>',
	css = "canvas{display:block}",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>body{margin:0}${css}</style>${markup}`,
		"https://example.com/",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(32, 32);
	const id = new DocumentQueries(tree).querySelector("#canvas");
	if (id === null) throw new Error("Missing test canvas");
	return { tree, id };
}
function pixel(image: RasterImage, x: number, y: number): number[] {
	return Array.from(
		image.pixels.subarray(
			(y * image.width + x) * 4,
			(y * image.width + x) * 4 + 4,
		),
	);
}

it("lays out default canvas intrinsics without showing fallback children or allocating a bitmap", () => {
	const { tree, id } = fixture('<canvas id="canvas">Fallback text</canvas>');
	const formatting = buildFormattingTree(tree);
	const node = formatting.nodes.find((node) => node.ref === tree.reference(id));
	expect(node).toMatchObject({
		kind: "replaced",
		canvas: true,
		intrinsic: { width: 300, height: 150 },
		children: [],
	});
	expect(
		layoutDocument(tree).contexts.flatMap((context) => context.glyphs),
	).toEqual([]);
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
		width: 300,
		height: 150,
	});
	rasterizeDocument(tree);
	expect(existingDocumentCanvases(tree)).toBeUndefined();
});

it.each(["inline", "inline-block", "block"])(
	"uses %s replaced layout and CSS scaling for native canvas pixels",
	(display) => {
		const { tree, id } = fixture(
			undefined,
			`canvas{display:${display};width:4px;height:2px}`,
		);
		const context = documentCanvases(tree).get(id);
		context.fillStyle = "red";
		context.fillRect(0, 0, 1, 1);
		context.fillStyle = "blue";
		context.fillRect(1, 0, 1, 1);
		const rect = documentGeometry(tree).getBoundingClientRect(id);
		expect(rect).toMatchObject({ width: 4, height: 2 });
		const result = rasterizeDocument(tree);
		expect(pixel(result.image, rect.x, rect.y)).toEqual([255, 0, 0, 255]);
		expect(pixel(result.image, rect.x + 1, rect.y + 1)).toEqual([
			255, 0, 0, 255,
		]);
		expect(pixel(result.image, rect.x + 2, rect.y)).toEqual([0, 0, 255, 255]);
		expect(pixel(result.image, rect.x + 3, rect.y + 1)).toEqual([
			0, 0, 255, 255,
		]);
	},
);

it("paints canvas content inside padding and border over the element background", () => {
	const { tree, id } = fixture(
		undefined,
		"canvas{display:block;width:4px;height:2px;padding:1px;border:1px solid black;background:lime}",
	);
	const context = documentCanvases(tree).get(id);
	context.fillStyle = "red";
	context.fillRect(0, 0, 1, 1);
	const result = rasterizeDocument(tree);
	expect(pixel(result.image, 0, 0)).toEqual([0, 0, 0, 255]);
	expect(pixel(result.image, 1, 1)).toEqual([0, 255, 0, 255]);
	expect(pixel(result.image, 2, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(result.image, 4, 2)).toEqual([0, 255, 0, 255]);
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
		width: 8,
		height: 6,
	});
});

it("reads the latest drawing through prepared layout and clears pixels after resize", () => {
	const { tree, id } = fixture();
	const prepared = prepareDocumentRaster(tree);
	expect(pixel(prepared.rasterize().image, 0, 0)).toEqual([255, 255, 255, 255]);
	const context = documentCanvases(tree).get(id);
	context.fillStyle = "red";
	context.fillRect(0, 0, 2, 1);
	expect(pixel(prepared.rasterize().image, 0, 0)).toEqual([255, 0, 0, 255]);
	context.clearRect(0, 0, 1, 1);
	expect(pixel(prepared.rasterize().image, 0, 0)).toEqual([255, 255, 255, 255]);
	tree.setAttribute(id, "width", "3");
	expect(() => prepared.rasterize()).toThrow(/stale/);
	expect(pixel(rasterizeDocument(tree).image, 1, 0)).toEqual([
		255, 255, 255, 255,
	]);
});

it("clips canvas pixels through overflow and supports document-coordinate screenshot crops", () => {
	const { tree, id } = fixture(
		'<div style="width:1px;height:1px;overflow:hidden"><canvas id="canvas" width="2" height="2"></canvas></div>',
	);
	const context = documentCanvases(tree).get(id);
	context.fillStyle = "red";
	context.fillRect(0, 0, 2, 2);
	const result = rasterizeDocument(tree);
	expect(pixel(result.image, 0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(result.image, 1, 0)).toEqual([255, 255, 255, 255]);
	expect(pixel(result.image, 0, 1)).toEqual([255, 255, 255, 255]);
	const cropped = rasterizeDocument(tree, {
		clip: { x: 1, y: 0, width: 2, height: 2 },
	});
	expect(Array.from(cropped.image.pixels)).toEqual(Array(16).fill(255));
});

it("applies CSS opacity once when compositing an opaque native canvas", () => {
	const { tree, id } = fixture(undefined, "canvas{display:block;opacity:0.5}");
	const context = documentCanvases(tree).get(id);
	context.fillStyle = "red";
	context.fillRect(0, 0, 2, 1);
	const rgba = pixel(rasterizeDocument(tree).image, 0, 0);
	expect(rgba[0]).toBe(255);
	expect(rgba[3]).toBe(255);
	expect(rgba[1]).toBeGreaterThanOrEqual(127);
	expect(rgba[1]).toBeLessThanOrEqual(128);
	expect(rgba[2]).toBe(rgba[1]);
});

it("renders transparent zero-sized backing stores without allocating contexts", () => {
	const { tree, id } = fixture(
		'<canvas id="canvas" width="0" height="1"></canvas>',
		"canvas{display:block;width:2px;height:2px;background:blue}",
	);
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject({
		width: 2,
		height: 2,
	});
	expect(pixel(rasterizeDocument(tree).image, 0, 0)).toEqual([0, 0, 255, 255]);
	expect(existingDocumentCanvases(tree)).toBeUndefined();
});
