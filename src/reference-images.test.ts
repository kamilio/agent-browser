import { describe, expect, it } from "vitest";
import {
	compareReferenceImages,
	referenceVerdict,
} from "../scripts/reference-images.js";
import { createRaster, type RasterImage } from "./raster.js";

describe("exact reference-image comparison", () => {
	it("reports all pixels, not only differing channels", () => {
		const first = createRaster(4, 3, [0, 0, 0, 255]);
		const second = createRaster(4, 3, [0, 0, 0, 255]);
		expect(compareReferenceImages(first, second)).toEqual({
			match: true,
			dimensionsMatch: true,
			comparedPixels: 12,
			differentPixels: 0,
			maximumChannelDifference: 0,
			meanAbsoluteChannelDifference: 0,
			bounds: null,
		});
		second.pixels.set([255, 128, 0, 255], (1 * 4 + 1) * 4);
		second.pixels[(2 * 4 + 3) * 4 + 3] = 254;
		expect(compareReferenceImages(first, second)).toEqual({
			match: false,
			dimensionsMatch: true,
			comparedPixels: 12,
			differentPixels: 2,
			maximumChannelDifference: 255,
			meanAbsoluteChannelDifference: 384 / 48,
			bounds: { x: 1, y: 1, width: 3, height: 2 },
		});
	});
	it("does not ignore alpha or accept changed RGB behind transparent pixels", () => {
		const first = createRaster(1, 1);
		const second = createRaster(1, 1, [1, 0, 0, 0]);
		expect(compareReferenceImages(first, second).match).toBe(false);
		second.pixels.set([0, 0, 0, 1]);
		expect(compareReferenceImages(first, second).match).toBe(false);
	});
	it("detects first and last pixel differences with no off-by-one bounds", () => {
		const first = createRaster(2, 2);
		const second = createRaster(2, 2);
		second.pixels[0] = 1;
		second.pixels[15] = 1;
		expect(compareReferenceImages(first, second)).toMatchObject({
			differentPixels: 2,
			bounds: { x: 0, y: 0, width: 2, height: 2 },
		});
	});
	it("is symmetric and leaves both buffers unchanged", () => {
		const first = createRaster(3, 2, [3, 4, 5, 6]);
		const second = createRaster(3, 2, [6, 5, 4, 3]);
		const before = first.pixels.slice();
		const other = second.pixels.slice();
		expect(compareReferenceImages(first, second)).toEqual(
			compareReferenceImages(second, first),
		);
		expect(first.pixels).toEqual(before);
		expect(second.pixels).toEqual(other);
	});
	it("never treats incompatible dimensions as a successful mismatch test", () => {
		const result = compareReferenceImages(
			createRaster(2, 1),
			createRaster(1, 2),
		);
		expect(result.dimensionsMatch).toBe(false);
		expect(result.comparedPixels).toBe(0);
		expect(referenceVerdict(result, "match")).toBe("fail");
		expect(referenceVerdict(result, "mismatch")).toBe("fail");
	});
	it.each(["match", "mismatch"] as const)(
		"supports the explicit %s relationship",
		(relation) => {
			const equal = compareReferenceImages(
				createRaster(1, 1),
				createRaster(1, 1),
			);
			const different = compareReferenceImages(
				createRaster(1, 1),
				createRaster(1, 1, [255, 255, 255, 255]),
			);
			expect(referenceVerdict(equal, relation)).toBe(
				relation === "match" ? "pass" : "fail",
			);
			expect(referenceVerdict(different, relation)).toBe(
				relation === "match" ? "fail" : "pass",
			);
		},
	);
	it.each([
		null,
		{},
		{ width: 0, height: 1, pixels: new Uint8Array() },
		{ width: 1, height: 1, pixels: new Uint8Array(3) },
		{ width: 1, height: 1, pixels: [0, 0, 0, 0] },
		{ width: 4097, height: 1, pixels: new Uint8Array(4097 * 4) },
	])("rejects invalid/unbounded rasters %j", (value) => {
		expect(() =>
			compareReferenceImages(value as RasterImage, createRaster(1, 1)),
		).toThrow();
		expect(() =>
			compareReferenceImages(createRaster(1, 1), value as RasterImage),
		).toThrow();
	});
});
