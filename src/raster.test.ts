import { expect, it } from "vitest";
import { bitmapGlyph } from "./bitmap-font.js";
import {
	type RasterImage,
	type Rgba,
	createRaster,
	paintBitmapGlyph,
	paintRasterRect,
} from "./raster.js";

const red: Rgba = [255, 0, 0, 255];
function pixel(image: RasterImage, pixelX: number, pixelY: number) {
	return [
		...image.pixels.slice(
			(pixelY * image.width + pixelX) * 4,
			(pixelY * image.width + pixelX + 1) * 4,
		),
	];
}

it("creates caller-owned, initialized pixels in a frozen image container", () => {
	const image = createRaster(2, 3, [20, 40, 60, 80]);
	expect(Object.isFrozen(image)).toBe(true);
	expect(image.pixels).toHaveLength(24);
	expect(pixel(image, 1, 2)).toEqual([20, 40, 60, 80]);
	image.pixels[0] = 99;
	expect(createRaster(1, 1).pixels).toEqual(new Uint8Array(4));
});

it.each([
	[0, 1],
	[-1, 1],
	[1.5, 1],
	[Number.POSITIVE_INFINITY, 1],
	[1, Number.NaN],
	[4097, 1],
	[4096, 4096],
])("rejects dimensions %j x %j before allocation", (width, height) => {
	expect(() => createRaster(width, height)).toThrow();
});

it.each(
	[
		[256, 0, 0, 255],
		[0, -1, 0, 255],
		[0, 0.5, 0, 255],
		[0, 0, 0, Number.NaN],
		[0, 0, 0],
		new Array(4),
	].map((color) => ({ color })),
)("rejects invalid colors $color", ({ color }) => {
	expect(() => createRaster(1, 1, color as unknown as Rgba)).toThrow();
});

it("clips rectangles and uses half-open pixel-center coverage", () => {
	const image = createRaster(4, 3);
	paintRasterRect(image, -1, -1, 3, 3, red);
	expect(pixel(image, 0, 0)).toEqual(red);
	expect(pixel(image, 1, 1)).toEqual(red);
	expect(pixel(image, 2, 1)).toEqual([0, 0, 0, 0]);
	const fractional = createRaster(4, 1);
	paintRasterRect(fractional, 0.5, 0, 2, 1, red);
	expect([0, 1, 2, 3].map((pixelX) => pixel(fractional, pixelX, 0)[3])).toEqual(
		[255, 255, 0, 0],
	);
	paintRasterRect(fractional, 2.51, 0, 0.98, 1, red);
	expect(pixel(fractional, 3, 0)[3]).toBe(0);
});

it("composites straight alpha and treats zero/transparent/offscreen paint as no-ops", () => {
	const image = createRaster(1, 1, [0, 0, 255, 255]);
	paintRasterRect(image, 0, 0, 1, 1, [255, 0, 0, 128]);
	expect(pixel(image, 0, 0)).toEqual([128, 0, 127, 255]);
	const transparent = createRaster(1, 1);
	paintRasterRect(transparent, 0, 0, 1, 1, [255, 0, 0, 128]);
	expect(pixel(transparent, 0, 0)).toEqual([255, 0, 0, 128]);
	const before = image.pixels.slice();
	paintRasterRect(image, 0, 0, 0, 1, red);
	paintRasterRect(image, 0, 0, 1, 0, red);
	paintRasterRect(image, 0, 0, 1, 1, [1, 2, 3, 0]);
	paintRasterRect(image, 100, 100, 2, 2, red);
	expect(image.pixels).toEqual(before);
});

it.each([8, 16, 24])(
	"paints every supported mask at size %s with advance spacing unpainted",
	(size) => {
		const scale = size / 8;
		for (let code = 32; code <= 126; code++) {
			const character = String.fromCharCode(code);
			const image = createRaster(6 * scale, 8 * scale);
			expect(paintBitmapGlyph(image, character, 0, 0, size, red)).toBe(true);
			for (let pixelY = 0; pixelY < image.height; pixelY++)
				for (let pixelX = 0; pixelX < image.width; pixelX++) {
					const column = Math.floor(pixelX / scale);
					const painted =
						column < 5 &&
						bitmapGlyph(character).rows[Math.floor(pixelY / scale)] &
							(16 >> column);
					expect(pixel(image, pixelX, pixelY)).toEqual(
						painted ? red : [0, 0, 0, 0],
					);
				}
		}
	},
);

it("clips glyphs, samples fractional sizes, and reports fallback without hiding it", () => {
	const actual = createRaster(7, 7);
	expect(paintBitmapGlyph(actual, "中", -1.25, -0.25, 10.5, red)).toBe(false);
	const scale = 10.5 / 8;
	for (let pixelY = 0; pixelY < 7; pixelY++)
		for (let pixelX = 0; pixelX < 7; pixelX++) {
			const column = Math.floor((pixelX + 0.5 + 1.25) / scale);
			const row = Math.floor((pixelY + 0.5 + 0.25) / scale);
			const painted =
				column < 5 &&
				row < 8 &&
				bitmapGlyph("\ufffd").rows[row] & (16 >> column);
			expect(pixel(actual, pixelX, pixelY)).toEqual(
				painted ? red : [0, 0, 0, 0],
			);
		}
});

it("validates all parameters before painting", () => {
	const image = createRaster(2, 2);
	for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 16_777_217])
		expect(() => paintRasterRect(image, 0, 0, bad, 1, red)).toThrow();
	expect(() => paintRasterRect(image, 16_777_217, 0, 1, 1, red)).toThrow();
	expect(() => paintBitmapGlyph(image, "AA", 0, 0)).toThrow();
	expect(() => paintBitmapGlyph(image, "A", 0, 0, 513)).toThrow();
	expect(() => paintBitmapGlyph(image, "A", Number.NaN, 0)).toThrow();
	expect(() =>
		paintBitmapGlyph(image, "A", 0, 0, 16, [0, 0, 0, 999]),
	).toThrow();
	expect(image.pixels).toEqual(new Uint8Array(16));
	expect(() =>
		paintRasterRect(
			{ width: 1, height: 1, pixels: new Uint8Array(3) },
			0,
			0,
			1,
			1,
			red,
		),
	).toThrow("pixel buffer");
});
