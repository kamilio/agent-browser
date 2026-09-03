import { afterEach, expect, it } from "vitest";
import { bitmapGlyph } from "./bitmap-font.js";
import {
	type DocumentRasterOptions,
	rasterizeDocument,
} from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
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
function darkPixels(image: { width: number; pixels: Uint8Array }) {
	const result: string[] = [];
	for (let offset = 0; offset < image.pixels.length; offset += 4)
		if (image.pixels[offset] === 0)
			result.push(
				`${(offset / 4) % image.width},${Math.floor(offset / 4 / image.width)}`,
			);
	return result;
}

it("paints actual document positions into an opaque viewport without manual text offsets", () => {
	const tree = fixture(
		'<main style="font-size:8px;padding:2px;margin-left:3px"><div>A</div><div>B</div></main>',
	);
	const result = rasterizeDocument(tree);
	const expected: string[] = [];
	for (const [index, character] of [..."AB"].entries())
		for (let row = 0; row < 8; row++)
			for (let column = 0; column < 5; column++)
				if (bitmapGlyph(character).rows[row] & (16 >> column))
					expected.push(`${column + 5},${row + 3 + index * 10}`);
	expect(darkPixels(result.image).sort()).toEqual(expected.sort());
	expect(
		result.image.pixels.every(
			(value, index) => index % 4 !== 3 || value === 255,
		),
	).toBe(true);
	expect(result.metrics.paintedGlyphs).toBe(2);
	expect(result.stage).toBe("normal-flow-text-raster");
	expect(result.partial).toBe(true);
	expect(Object.isFrozen(result.clip) && Object.isFrozen(result.metrics)).toBe(
		true,
	);
});

it("clips in document coordinates without changing the layout viewport or reflowing text", () => {
	const tree = fixture('<main style="font-size:8px">A<br>B</main>');
	const full = rasterizeDocument(tree);
	const clipped = rasterizeDocument(tree, {
		clip: { x: 2, y: 11, width: 8, height: 10 },
	});
	for (let row = 0; row < 10; row++)
		for (let column = 0; column < 8; column++) {
			const source = ((row + 11) * 40 + column + 2) * 4;
			const target = (row * 8 + column) * 4;
			expect(clipped.image.pixels.slice(target, target + 4)).toEqual(
				full.image.pixels.slice(source, source + 4),
			);
		}
	expect(clipped.layout.text.horizontal.formatting.viewport).toEqual({
		width: 40,
		height: 40,
	});
	expect(clipped.metrics.clippedGlyphs).toBe(1);
});

it("culls using ink, including negative-leading glyphs overflowing a zero-height line", () => {
	const tree = fixture(
		'<main style="font-size:16px;line-height:0;padding-top:12px">A</main>',
	);
	const result = rasterizeDocument(tree, {
		clip: { x: 0, y: 4, width: 20, height: 2 },
	});
	expect(result.metrics.paintedGlyphs).toBe(1);
	expect(darkPixels(result.image).length).toBeGreaterThan(0);
	expect(
		result.layout.contexts.find(({ glyphs }) => glyphs.length)?.lines[0].height,
	).toBe(0);
});

it("preserves visible text overflow outside fixed-height containers", () => {
	const tree = fixture('<main style="font-size:8px;height:0">A<br>B</main>');
	const result = rasterizeDocument(tree, {
		clip: { x: 0, y: 10, width: 10, height: 10 },
	});
	expect(result.metrics.paintedGlyphs).toBe(1);
	expect(darkPixels(result.image).length).toBeGreaterThan(0);
});

it("skips hidden, zero-sized and blank glyphs while painting visible descendants", () => {
	const tree = fixture(
		'<main style="font-size:8px;visibility:hidden">A<span style="visibility:visible">B <span style="font-size:0">C</span></span></main>',
	);
	const result = rasterizeDocument(tree);
	expect(result.metrics).toMatchObject({
		hiddenGlyphs: 1,
		paintedGlyphs: 1,
		blankGlyphs: 2,
	});
});

it("paints explicit replacement masks while preserving unsupported source characters", () => {
	const tree = fixture('<main style="font-size:8px">🙂</main>');
	const result = rasterizeDocument(tree);
	expect(result.layout.text.metrics.unsupportedGlyphs).toBe(1);
	expect(
		result.layout.contexts.find(({ glyphs }) => glyphs.length)?.glyphs[0],
	).toMatchObject({ character: "🙂", supported: false, codeUnits: 2 });
	expect(result.metrics.paintedGlyphs).toBe(1);
	expect(darkPixels(result.image).length).toBeGreaterThan(0);
});

it("samples fractional clips consistently with the glyph cell raster rule", () => {
	const tree = fixture('<main style="font-size:8px">A</main>');
	const result = rasterizeDocument(tree, {
		clip: { x: 0.5, y: 0.5, width: 10, height: 10 },
	});
	const expected: string[] = [];
	for (let row = 0; row < 10; row++)
		for (let column = 0; column < 10; column++) {
			const glyphColumn = Math.floor(column + 1);
			const glyphRow = Math.floor(row);
			if (
				glyphColumn < 5 &&
				glyphRow < 8 &&
				bitmapGlyph("A").rows[glyphRow] & (16 >> glyphColumn)
			)
				expected.push(`${column},${row}`);
		}
	expect(darkPixels(result.image)).toEqual(expected);
});

it("returns a white crop when the document is empty or completely outside the region", () => {
	for (const markup of [
		"",
		'<main style="display:none">Text</main>',
		'<main style="margin-top:1000px">Text</main>',
	]) {
		const result = rasterizeDocument(fixture(markup));
		expect(darkPixels(result.image)).toHaveLength(0);
		expect(result.image.pixels.every((value) => value === 255)).toBe(true);
	}
});

it.each([
	{ maxWork: 1 },
	{ maxWork: 32_000_001 },
	{ clip: { x: 0, y: 0, width: 4097, height: 1 } },
	{ clip: { x: 0, y: 0, width: 4096, height: 4096 } },
	{ clip: { x: 0, y: 0, width: 0, height: 1 } },
	{ clip: { x: 0, y: 0, width: 1.5, height: 1 } },
	{ clip: { x: 16_777_216, y: 0, width: 1, height: 1 } },
	{ layout: { maxWork: 1 } },
])("enforces resource/input budgets for %j", (options) => {
	expect(() =>
		rasterizeDocument(fixture('<main style="font-size:8px">A</main>'), options),
	).toThrow();
});

it("rejects unknown options and unsupported styling rather than fabricating a screenshot", () => {
	expect(() =>
		rasterizeDocument(fixture("Text"), {
			clip: null,
		} as unknown as DocumentRasterOptions),
	).toThrow("Invalid document raster clip");
	expect(() =>
		rasterizeDocument(fixture("Text"), {
			maxWork: null,
		} as unknown as DocumentRasterOptions),
	).toThrow("Invalid document raster work limit");
	expect(() =>
		rasterizeDocument(fixture("Text"), {
			unknown: true,
		} as DocumentRasterOptions),
	).toThrow("Invalid document raster options");
	expect(() =>
		rasterizeDocument(fixture('<main style="filter:blur(1px)">Text</main>')),
	).toThrow();
	expect(() =>
		rasterizeDocument(fixture('<img src="data:image/png;base64,x">')),
	).toThrow();
	expect(() =>
		rasterizeDocument(fixture('<main style="display:grid">Text</main>')),
	).toThrow();
});

it("charges scaled glyph row traversal even when almost all columns are clipped", () => {
	const tree = fixture('<main style="font-size:512px">A</main>');
	expect(() =>
		rasterizeDocument(tree, {
			clip: { x: 0, y: 0, width: 1, height: 480 },
			maxWork: 1500,
		}),
	).toThrow("work limit");
	expect(
		rasterizeDocument(tree, { clip: { x: 0, y: 0, width: 1, height: 480 } })
			.metrics.paintedGlyphs,
	).toBe(1);
});

it("retains independent caller-owned images and encodes them without mutating the document", () => {
	const tree = fixture('<main style="font-size:8px">A</main>');
	const revision = tree.revision;
	const first = rasterizeDocument(tree);
	const png = encodePng(first.image);
	const second = rasterizeDocument(tree);
	expect(png).toEqual(encodePng(second.image));
	first.image.pixels.fill(0);
	expect(second.image.pixels[0]).toBe(255);
	expect(tree.revision).toBe(revision);
	tree.close();
	expect(() => rasterizeDocument(tree)).toThrow();
	expect(encodePng(second.image)).toEqual(png);
});
