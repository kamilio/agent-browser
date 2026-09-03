import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePdf, pdfLimits, type PdfGlyph } from "./pdf.js";
import { createRaster } from "./raster.js";

function binary(bytes: Uint8Array) {
	return Buffer.from(bytes).toString("latin1");
}
function pdfStreams(bytes: Uint8Array) {
	const source = binary(bytes);
	const streams: { dictionary: string; bytes: Uint8Array }[] = [];
	const expression = /<< (.*?) >>\nstream\n/gs;
	for (
		let match = expression.exec(source);
		match;
		match = expression.exec(source)
	) {
		const length = Number(/\/Length (\d+)/.exec(match[1])?.[1]);
		expect(Number.isSafeInteger(length)).toBe(true);
		const start = expression.lastIndex;
		streams.push({
			dictionary: match[1],
			bytes: bytes.slice(start, start + length),
		});
		expect(source.slice(start + length, start + length + 10)).toBe(
			"\nendstream",
		);
		expression.lastIndex = start + length + 10;
	}
	return streams;
}
function page() {
	return {
		image: createRaster(2, 2, [10, 20, 30, 255]),
		height: 2,
		glyphs: [] as PdfGlyph[],
	};
}

describe("native PDF encoder", () => {
	it("emits byte-exact cross references, stream lengths, page tree and physical dimensions", () => {
		const result = encodePdf([page(), { ...page(), height: 3 }]);
		const source = binary(result.bytes);
		expect(source.startsWith("%PDF-1.4\n%")).toBe(true);
		expect(source.endsWith("%%EOF\n")).toBe(true);
		const xref = Number(/startxref\n(\d+)\n/.exec(source)?.[1]);
		expect(source.slice(xref, xref + 5)).toBe("xref\n");
		const entries = source.slice(xref).split("\n");
		const count = Number(entries[1].split(" ")[1]);
		for (let index = 1; index < count; index++) {
			const offset = Number(entries[index + 2].slice(0, 10));
			expect(source.slice(offset).startsWith(`${index} 0 obj\n`)).toBe(true);
		}
		expect(source).toContain("/Count 2 /Kids");
		expect(source).toContain("/MediaBox [0 0 1.5 2.25]");
		expect(pdfStreams(result.bytes)).toHaveLength(5);
		expect(result.metrics).toMatchObject({
			pages: 2,
			pixels: 8,
			glyphs: 0,
			bytes: result.bytes.length,
		});
	});
	it("embeds independently inflatable RGB with white alpha compositing", () => {
		const image = createRaster(2, 1);
		image.pixels.set([255, 0, 0, 128, 0, 0, 255, 255]);
		const result = encodePdf([{ image, height: 1, glyphs: [] }]);
		const stream = pdfStreams(result.bytes).find((value) =>
			value.dictionary.includes("/Subtype /Image"),
		);
		if (!stream) throw new Error("Missing PDF image stream");
		expect([...inflateSync(stream.bytes)]).toEqual([255, 127, 127, 0, 0, 255]);
	});
	it("uses hex text operands so PDF syntax in page text cannot become operators", () => {
		const glyphs = [..."()\\<>"].map((character, index) => ({
			character,
			x: index * 6,
			y: 0,
			fontSize: 8,
		}));
		const result = encodePdf([
			{ image: createRaster(48, 16), height: 16, glyphs },
		]);
		const source = binary(result.bytes);
		expect(source).toContain("/BaseFont /Courier /Encoding /WinAnsiEncoding");
		expect(source).toContain("125 Tz 3 Tr");
		expect(source).toContain("<28295c3c3e> Tj");
		expect(source).not.toContain("/JavaScript");
		expect(source).not.toContain("/OpenAction");
	});
	it("compacts only exactly adjacent glyphs at the same baseline and size", () => {
		const glyphs = [
			{ character: "A", x: 0, y: 0, fontSize: 8 },
			{ character: "B", x: 6, y: 0, fontSize: 8 },
			{ character: "C", x: 20, y: 0, fontSize: 8 },
			{ character: "D", x: 26, y: 0, fontSize: 8 },
			{ character: "E", x: 32, y: 0, fontSize: 16 },
			{ character: "F", x: 44, y: 0, fontSize: 16 },
			{ character: "G", x: 0, y: 20, fontSize: 8 },
		];
		const result = encodePdf([
			{ image: createRaster(64, 32), height: 32, glyphs },
		]);
		const source = binary(result.bytes);
		for (const sequence of ["4142", "4344", "4546", "47"])
			expect(source).toContain(`<${sequence}> Tj`);
		expect(result.metrics.glyphs).toBe(7);
	});
	it("is deterministic and leaves input pixels untouched", () => {
		const source = page();
		const before = source.image.pixels.slice();
		expect(encodePdf([source]).bytes).toEqual(encodePdf([source]).bytes);
		expect(source.image.pixels).toEqual(before);
	});
	it("rejects empty and over-quota page sequences", () => {
		expect(() => encodePdf([])).toThrow(/at least one/);
		expect(() =>
			encodePdf(Array.from({ length: pdfLimits.maxPages + 1 }, page)),
		).toThrow(/page limit/);
	});
	it.each([0, -1, 1.5, 4097, Number.NaN])(
		"rejects invalid page height %s",
		(height) => {
			expect(() => encodePdf([{ ...page(), height }])).toThrow(/dimensions/);
		},
	);
	it("bounds text before serializing it", () => {
		const glyph = { character: "x", x: 0, y: 0, fontSize: 8 };
		expect(() =>
			encodePdf([
				{ ...page(), glyphs: Array(pdfLimits.maxGlyphs + 1).fill(glyph) },
			]),
		).toThrow(/text limit/);
	});
	it("bounds the complete paper area, including white padding", () => {
		expect(() =>
			encodePdf([{ image: createRaster(4096, 1), height: 4096, glyphs: [] }]),
		).toThrow(/dimensions/);
	});
	it.each([
		{ character: "é", x: 0, y: 0, fontSize: 8 },
		{ character: "x", x: Number.NaN, y: 0, fontSize: 8 },
		{ character: "ab", x: 0, y: 0, fontSize: 8 },
		{ character: "x", x: 0, y: 0, fontSize: 0 },
		{ character: "x", x: 0, y: 0, fontSize: 513 },
	])("rejects unsupported or invalid glyph %j", (glyph) => {
		expect(() => encodePdf([{ ...page(), glyphs: [glyph] }])).toThrow();
	});
});
