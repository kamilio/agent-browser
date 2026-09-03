import { expect, it } from "vitest";
import { createRaster, paintRasterImage } from "./raster.js";

function source() {
	const image = createRaster(2, 2);
	image.pixels.set([
		255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 128,
	]);
	return image;
}
function pixel(
	image: ReturnType<typeof createRaster>,
	column: number,
	row: number,
) {
	return [
		...image.pixels.slice(
			(row * image.width + column) * 4,
			(row * image.width + column) * 4 + 4,
		),
	];
}

it("scales nearest neighbor from destination pixel centers with straight-alpha compositing", () => {
	const target = createRaster(6, 6, [255, 255, 255, 255]);
	paintRasterImage(target, source(), 1, 1, 4, 4);
	expect(pixel(target, 0, 0)).toEqual([255, 255, 255, 255]);
	expect(pixel(target, 1, 1)).toEqual([255, 0, 0, 255]);
	expect(pixel(target, 2, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(target, 3, 1)).toEqual([0, 255, 0, 255]);
	expect(pixel(target, 1, 3)).toEqual([0, 0, 255, 255]);
	expect(pixel(target, 4, 4)).toEqual([255, 255, 127, 255]);
	expect(pixel(target, 5, 5)).toEqual([255, 255, 255, 255]);
});

it("clips the destination without rescaling the remaining source", () => {
	const target = createRaster(2, 2);
	paintRasterImage(target, source(), -2, -2, 4, 4);
	expect([...target.pixels]).toEqual(
		Array.from({ length: 4 }, () => [255, 255, 0, 128]).flat(),
	);
});

it("uses the lower-right source pixel when reducing two pixels to one", () => {
	const target = createRaster(1, 1);
	paintRasterImage(target, source(), 0, 0, 1, 1);
	expect([...target.pixels]).toEqual([255, 255, 0, 128]);
});

it("preserves transparent source pixels and unpremultiplied destination channels", () => {
	const target = createRaster(2, 1, [0, 0, 255, 128]);
	const input = createRaster(2, 1);
	input.pixels.set([255, 0, 0, 0, 255, 0, 0, 128]);
	paintRasterImage(target, input, 0, 0, 2, 1);
	expect([...target.pixels]).toEqual([0, 0, 255, 128, 170, 0, 85, 192]);
});

it("uses half-open pixel-center boundaries for fractional origins", () => {
	const target = createRaster(3, 1);
	paintRasterImage(target, createRaster(1, 1, [1, 2, 3, 255]), 0.5, 0, 1, 1);
	expect([...target.pixels]).toEqual([1, 2, 3, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
});

it("copies aliased source storage before overlapping writes", () => {
	const target = createRaster(3, 1);
	target.pixels.set([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255]);
	paintRasterImage(target, target, 1, 0, 3, 1);
	expect([...target.pixels]).toEqual([
		1, 0, 0, 255, 1, 0, 0, 255, 2, 0, 0, 255,
	]);
});

it.each([
	[0, 3],
	[3, 0],
])("does not paint empty %s/%s destinations", (width, height) => {
	const target = createRaster(3, 3);
	paintRasterImage(target, source(), 0, 0, width, height);
	expect(target.pixels.every((value) => value === 0)).toBe(true);
});

it("rejects malformed buffers and unbounded coordinates before writing", () => {
	const target = createRaster(2, 2);
	expect(() =>
		paintRasterImage(
			target,
			{ width: 2, height: 2, pixels: new Uint8Array(1) },
			0,
			0,
			2,
			2,
		),
	).toThrow();
	expect(() => paintRasterImage(target, source(), 0, 0, -1, 2)).toThrow();
	expect(() =>
		paintRasterImage(target, source(), Number.POSITIVE_INFINITY, 0, 2, 2),
	).toThrow();
	expect(() => paintRasterImage(target, source(), 16777216, 0, 2, 2)).toThrow();
	expect(target.pixels.every((value) => value === 0)).toBe(true);
});
