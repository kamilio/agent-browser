import { inflateSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { rasterizeDocument, prepareDocumentRaster } from "./document-raster.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
function fixture(
	source = '<main style="font-size:8px;line-height:10px">ONE<br>TWO<br>THREE</main>',
	height = 16,
) {
	const tree = parseHtmlDocument(source, "https://fixture.invalid/pdf");
	trees.push(tree);
	documentStyles(tree).setViewport(64, height);
	return tree;
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("paginates native text without cutting through glyphs", () => {
	const result = renderDocumentPdf(fixture());
	expect(result.metrics.pages).toBe(3);
	expect(result.clips.map((clip) => clip.y)).toEqual([0, 11, 21]);
	expect(result.clips.map((clip) => clip.height)).toEqual([11, 10, 9]);
	expect(result.metrics.glyphs).toBe(11);
	expect(result.metrics.layoutPasses).toBe(1);
	expect(result.width).toBe(64);
	expect(result.height).toBe(16);
});

it("reuses one prepared layout while rejecting stale revisions and closed documents", () => {
	const tree = fixture();
	const painter = prepareDocumentRaster(tree);
	const first = painter.rasterize({
		clip: { x: 0, y: 0, width: 64, height: 10 },
	});
	const second = painter.rasterize({
		clip: { x: 0, y: 10, width: 64, height: 10 },
	});
	expect(first.layout).toBe(painter.layout);
	expect(second.layout).toBe(first.layout);
	documentStyles(tree).setViewport(80, 16);
	expect(() => painter.rasterize()).toThrow(/stale/);
	tree.close();
	expect(() => painter.rasterize()).toThrow(/closed/);
});

it("each embedded page image contains the actual native raster bytes", () => {
	const tree = fixture(
		'<main style="font-size:8px;line-height:10px;background-color:#123456;color:white">ONE<br>TWO<br>THREE</main>',
	);
	const result = renderDocumentPdf(tree);
	const source = Buffer.from(result.bytes).toString("latin1");
	const pattern =
		/<< \/Type \/XObject \/Subtype \/Image.*?\/Length (\d+) >>\nstream\n/gs;
	let index = 0;
	for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
		const length = Number(match[1]);
		const pixels = inflateSync(
			result.bytes.subarray(pattern.lastIndex, pattern.lastIndex + length),
		);
		const raster = rasterizeDocument(tree, { clip: result.clips[index++] });
		const expected = new Uint8Array(
			raster.image.width * raster.image.height * 3,
		);
		for (let pixel = 0; pixel < expected.length / 3; pixel++)
			expected.set(
				raster.image.pixels.subarray(pixel * 4, pixel * 4 + 3),
				pixel * 3,
			);
		expect(pixels).toEqual(Buffer.from(expected));
		pattern.lastIndex += length;
	}
	expect(index).toBe(result.metrics.pages);
});

it("does not expose display-none, hidden or transparent text in the search layer", () => {
	const tree = fixture(
		'<main style="font-size:8px">YES<span style="display:none">NO</span><span style="visibility:hidden">HIDE</span><span style="color:transparent">ALSO</span></main>',
	);
	expect(renderDocumentPdf(tree).metrics.glyphs).toBe(3);
});

it("rejects unsupported CSS instead of printing a fallback", () => {
	expect(() =>
		renderDocumentPdf(fixture('<main style="display:flex">unsupported</main>')),
	).toThrow(/supported formatting/);
});

it("rejects an unbroken line taller than the page", () => {
	expect(() =>
		renderDocumentPdf(fixture('<main style="font-size:40px">A</main>', 16)),
	).toThrow(/unbroken text/);
});

it("bounds pagination before allocating page images", () => {
	expect(() =>
		renderDocumentPdf(fixture('<main style="height:10000px"></main>', 16)),
	).toThrow(/pagination limit/);
});

it("rejects a viewport exceeding the per-page raster area", () => {
	const tree = fixture();
	documentStyles(tree).setViewport(4096, 4096);
	expect(() => renderDocumentPdf(tree)).toThrow(/raster limits/);
});

it("does not mutate the source tree and refuses a closed owner", () => {
	const tree = fixture();
	const revision = tree.revision;
	renderDocumentPdf(tree);
	expect(tree.revision).toBe(revision);
	tree.close();
	expect(() => renderDocumentPdf(tree)).toThrow(/closed/);
});
