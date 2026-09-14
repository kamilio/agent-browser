import { afterEach, expect, it } from "vitest";
import { documentImages } from "./document-images.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
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
async function fixture(
	css: string,
	html = '<main id="target"></main>',
	alpha = 255,
) {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head><style>html,body{margin:0;padding:0}main{width:8px;height:8px} ${css}</style></head><body>${html}</body></html>`,
		"https://images.example/page",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(12, 12);
	const source = createRaster(2, 1);
	source.pixels.set([255, 0, 0, alpha, 0, 0, 255, alpha]);
	const body = encodePng(source);
	const requests: string[] = [];
	const images = documentImages(tree, {
		fetch: async (url) => {
			requests.push(url);
			return {
				url,
				status: 200,
				headers: { "content-type": ["image/png"] },
				body,
				encodedBytes: body.length,
				redirects: [],
				elapsedMs: 0,
			};
		},
	});
	await images.settle();
	return {
		tree,
		images,
		requests,
		raster: () => rasterizeDocument(tree).image,
	};
}
function pixel(
	image: Readonly<RasterImage>,
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it("paints a centered contain image above its background color", async () => {
	const { raster, requests } = await fixture(
		"main{background-image:url(Tile.PNG);background-size:contain;background-position:50%;background-repeat:no-repeat;background-color:white}",
	);
	const image = raster();
	expect(requests).toEqual(["https://images.example/Tile.PNG"]);
	expect(pixel(image, 0, 1)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 0, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 7, 5)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 7, 6)).toEqual([255, 255, 255, 255]);
});

it("uses the padding origin and paints the image behind borders", async () => {
	const { raster } = await fixture(
		"main{box-sizing:border-box;border:1px solid green;padding:1px;background-image:url(tile.png);background-repeat:no-repeat;background-color:white}",
	);
	const image = raster();
	expect(pixel(image, 0, 1)).toEqual([0, 128, 0, 255]);
	expect(pixel(image, 1, 1)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 2, 1)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 3, 1)).toEqual([255, 255, 255, 255]);
});

it("clips both the image and color to the content box", async () => {
	const { raster } = await fixture(
		"main{box-sizing:border-box;padding:2px;background-image:url(tile.png);background-color:white;background-origin:content-box;background-clip:content-box;background-repeat:no-repeat}",
	);
	const image = raster();
	expect(pixel(image, 1, 2)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 2, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 4, 2)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 6, 2)).toEqual([255, 255, 255, 255]);
});

it("paints repeat-x without vertical copies", async () => {
	const { raster } = await fixture(
		"main{background-image:url(tile.png);background-repeat:repeat-x;background-position:0 2px}",
	);
	const image = raster();
	expect(pixel(image, 6, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 7, 2)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 6, 3)).toEqual([255, 255, 255, 255]);
});

it("paints an atomic generated pseudo-element's independent resource", async () => {
	const { tree, requests } = await fixture(
		'main::before{content:"";display:inline-block;width:8px;height:8px;background-image:url(pseudo.png);background-size:cover;background-position:center;background-repeat:no-repeat}',
	);
	const rendered = rasterizeDocument(tree);
	const pseudo = rendered.layout.text.horizontal.formatting.nodes.find(
		(node) => node.generatedContent?.name === "before" && node.kind === "block",
	);
	const box = rendered.layout.boxes.find((entry) => entry.id === pseudo?.id);
	if (!box) throw new Error("Missing atomic pseudo box");
	expect(requests).toEqual(["https://images.example/pseudo.png"]);
	expect(pixel(rendered.image, box.borderX + 1, box.borderY + 1)).toEqual([
		255, 0, 0, 255,
	]);
	expect(pixel(rendered.image, box.borderX + 6, box.borderY + 1)).toEqual([
		0, 0, 255, 255,
	]);
});

it("propagates the body image to the entire canvas exactly once", async () => {
	const { raster } = await fixture(
		"body{background-image:url(tile.png)}",
		"<main></main>",
		128,
	);
	const image = raster();
	expect(pixel(image, 0, 0)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 0, 10)).toEqual([255, 127, 127, 255]);
});

it("does not propagate body color when the root has an image", async () => {
	const { raster } = await fixture(
		"html{background-image:url(tile.png);background-repeat:no-repeat}body{background-color:green}",
	);
	const image = raster();
	expect(pixel(image, 0, 10)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 4, 4)).toEqual([0, 128, 0, 255]);
});

it("renders zero-sized background images without painting pixels", async () => {
	const { raster } = await fixture(
		"main{background-image:url(tile.png);background-size:0 0}",
	);
	expect(raster().pixels.every((value) => value === 255)).toBe(true);
});

it("updates pixels after style changes without refetching an unchanged image", async () => {
	const { tree, images, requests, raster } = await fixture(
		"main{background-image:url(tile.png);background-repeat:no-repeat}",
	);
	expect(pixel(raster(), 0, 0)).toEqual([255, 0, 0, 255]);
	const target = new DocumentQueries(tree).querySelector("main");
	if (target === null) throw new Error("Missing fixture main");
	tree.setAttribute(target, "style", "background-position:4px 4px");
	await images.settle();
	expect(pixel(raster(), 0, 0)).toEqual([255, 255, 255, 255]);
	expect(pixel(raster(), 4, 4)).toEqual([255, 0, 0, 255]);
	expect(requests).toHaveLength(1);
});

it("does not silently ignore unsupported non-atomic inline image backgrounds", async () => {
	const { raster } = await fixture(
		"span{background-image:url(tile.png)}",
		"<main><span>Text</span></main>",
	);
	expect(raster).toThrow("Background layers on non-atomic inline fragments");
});

it("rejects pending background paint and invalidates a prepared raster on completion", async () => {
	const tree = parseHtmlDocument(
		"<!doctype html><style>html,body{margin:0}main{width:8px;height:8px;background-image:url(/pending.png)}</style><main></main>",
		"https://images.example/page",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(12, 12);
	let finish!: (value: import("./network.js").NetworkResponse) => void;
	const pending = new Promise<import("./network.js").NetworkResponse>(
		(resolve) => {
			finish = resolve;
		},
	);
	const images = documentImages(tree, { fetch: async () => pending });
	const prepared = prepareDocumentRaster(tree);
	expect(() => prepared.rasterize()).toThrow(
		"Background image is still loading",
	);
	const body = encodePng(createRaster(1, 1, [0, 0, 255, 255]));
	finish({
		url: "https://images.example/pending.png",
		status: 200,
		headers: { "content-type": ["image/png"] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	});
	await images.settle();
	expect(() => prepared.rasterize()).toThrow("Prepared raster layout is stale");
	expect(pixel(rasterizeDocument(tree).image, 0, 0)).toEqual([0, 0, 255, 255]);
});
