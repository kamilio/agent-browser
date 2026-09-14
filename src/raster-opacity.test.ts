import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	createRaster,
	paintRasterImage,
	paintRasterRect,
	type RasterImage,
	withRasterClips,
} from "./raster.js";
import { createRoundedBox, roundedBoxContains } from "./rounded-box.js";

function pixel(image: RasterImage, column: number, row = 0) {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

function box(
	originX: number,
	originY: number,
	width: number,
	height: number,
	radius = 0,
) {
	return createRoundedBox(originX, originY, width, height, [
		{ horizontal: radius, vertical: radius },
		{ horizontal: radius, vertical: radius },
		{ horizontal: radius, vertical: radius },
		{ horizontal: radius, vertical: radius },
	]);
}

it("applies opacity once to a prepainted group rather than to overlapping children", () => {
	const source = createRaster(4, 1);
	paintRasterRect(source, 0, 0, 2, 1, [255, 0, 0, 255]);
	paintRasterRect(source, 1, 0, 2, 1, [0, 255, 0, 255]);
	const before = source.pixels.slice();
	const target = createRaster(4, 1, [0, 0, 255, 255]);
	paintRasterImage(target, source, 0, 0, 4, 1, undefined, 0.5);
	expect(pixel(target, 0)).toEqual([128, 0, 128, 255]);
	expect(pixel(target, 1)).toEqual([0, 128, 128, 255]);
	expect(pixel(target, 2)).toEqual(pixel(target, 1));
	expect(pixel(target, 3)).toEqual([0, 0, 255, 255]);
	expect(source.pixels).toEqual(before);

	const separate = createRaster(4, 1, [0, 0, 255, 255]);
	paintRasterImage(
		separate,
		createRaster(1, 1, [255, 0, 0, 255]),
		0,
		0,
		2,
		1,
		undefined,
		0.5,
	);
	paintRasterImage(
		separate,
		createRaster(1, 1, [0, 255, 0, 255]),
		1,
		0,
		2,
		1,
		undefined,
		0.5,
	);
	expect(pixel(separate, 1)).toEqual([64, 128, 64, 255]);
});

it.each([
	{ destinationAlpha: 0, expected: [255, 0, 0, 64] },
	{ destinationAlpha: 128, expected: [102, 0, 153, 160] },
	{ destinationAlpha: 255, expected: [64, 0, 191, 255] },
])(
	"multiplies source alpha, not destination alpha: $destinationAlpha",
	({ destinationAlpha, expected }) => {
		const source = createRaster(1, 1, [255, 0, 0, 128]);
		const before = source.pixels.slice();
		const target = createRaster(1, 1, [0, 0, 255, destinationAlpha]);
		paintRasterImage(target, source, 0, 0, 1, 1, undefined, 0.5);
		expect(pixel(target, 0)).toEqual(expected);
		expect(source.pixels).toEqual(before);
	},
);

it("keeps fractional source alpha until final channel rounding", () => {
	const source = createRaster(1, 1, [255, 0, 0, 1]);
	const target = createRaster(1, 1, [0, 0, 255, 1]);
	paintRasterImage(target, source, 0, 0, 1, 1, undefined, 0.5);
	expect(pixel(target, 0)).toEqual([85, 0, 170, 1]);
	expect(pixel(source, 0)).toEqual([255, 0, 0, 1]);
});

it.each([0, -0, 0.5, 1])(
	"leaves transparent source pixels and zero-opacity draws untouched: %s",
	(opacity) => {
		const source = createRaster(2, 1, [255, 20, 30, opacity === 0 ? 255 : 0]);
		const sourceBefore = source.pixels.slice();
		const target = createRaster(2, 1);
		target.pixels.set([12, 34, 56, 0, 78, 90, 12, 128]);
		const before = target.pixels.slice();
		paintRasterImage(target, source, 0, 0, 2, 1, undefined, opacity);
		expect(target.pixels).toEqual(before);
		expect(source.pixels).toEqual(sourceBefore);
	},
);

it.each(["omitted clip", "undefined clip", "rounded clip"])(
	"preserves default call patterns with %s byte-for-byte",
	(pattern) => {
		const source = createRaster(4, 1);
		source.pixels.set([
			255, 0, 0, 0, 255, 0, 0, 128, 255, 0, 0, 255, 255, 0, 0, 1,
		]);
		const clip = pattern === "rounded clip" ? box(1, 0, 2, 1) : undefined;
		const legacy = createRaster(4, 1, [0, 0, 255, 128]);
		if (pattern === "omitted clip")
			paintRasterImage(legacy, source, 0, 0, 4, 1);
		else paintRasterImage(legacy, source, 0, 0, 4, 1, clip);
		expect([...legacy.pixels]).toEqual([
			0,
			0,
			255,
			128,
			170,
			0,
			85,
			192,
			255,
			0,
			0,
			255,
			...(clip ? [0, 0, 255, 128] : [2, 0, 253, 128]),
		]);
		for (const opacity of [undefined, 1]) {
			const target = createRaster(4, 1, [0, 0, 255, 128]);
			paintRasterImage(target, source, 0, 0, 4, 1, clip, opacity);
			expect(target.pixels).toEqual(legacy.pixels);
		}
	},
);

it.each(
	[
		NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		-Number.MIN_VALUE,
		1 + Number.EPSILON,
		null,
		"0.5",
		true,
		{},
		[],
		Symbol("opacity"),
		1n,
	].map((opacity) => ({ opacity })),
)(
	"rejects invalid opacity $opacity before empty or offscreen returns",
	({ opacity }) => {
		const source = createRaster(1, 1, [255, 0, 0, 255]);
		const target = createRaster(1, 1, [0, 0, 255, 128]);
		const before = target.pixels.slice();
		for (const [originX, originY, width, height] of [
			[0, 0, 1, 1],
			[0, 0, 0, 1],
			[0, 0, 1, 0],
			[2, 0, 1, 1],
			[0, -2, 1, 1],
		]) {
			expect(() =>
				paintRasterImage(
					target,
					source,
					originX,
					originY,
					width,
					height,
					undefined,
					opacity as number,
				),
			).toThrow(
				new AgentBrowserError("invalid-input", "Invalid raster opacity"),
			);
			expect(target.pixels).toEqual(before);
		}
	},
);

it.each([0, 0.5, 1])(
	"keeps empty and offscreen draws unchanged at opacity %s",
	(opacity) => {
		const source = createRaster(1, 1, [255, 0, 0, 255]);
		const target = createRaster(1, 1, [0, 0, 255, 128]);
		const before = target.pixels.slice();
		paintRasterImage(target, source, 0, 0, 0, 1, undefined, opacity);
		paintRasterImage(target, source, 0, 0, 1, 0, undefined, opacity);
		paintRasterImage(target, source, -2, 0, 1, 1, undefined, opacity);
		paintRasterImage(target, source, 0, 2, 1, 1, undefined, opacity);
		expect(target.pixels).toEqual(before);
	},
);

it("preserves translated and scaled sampling through explicit and inherited rounded clips", () => {
	const source = createRaster(2, 2);
	source.pixels.set([
		255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 0, 0,
	]);
	const before = source.pixels.slice();
	const ancestor = box(0, 0, 6, 6, 3);
	const child = box(0.5, 0.5, 5, 5, 1);
	const own = box(1.5, 0.5, 4, 5, 2);
	const target = createRaster(6, 6, [0, 0, 0, 255]);
	const view = withRasterClips(withRasterClips(target, [ancestor]), [child]);
	paintRasterImage(view, source, -0.5, 0.5, 6, 4, own, 0.5);
	for (let row = 0; row < 6; row++) {
		for (let column = 0; column < 6; column++) {
			const inside =
				row < 4 &&
				column < 5 &&
				[ancestor, child, own].every((clip) =>
					roundedBoxContains(clip, column + 0.5, row + 0.5),
				);
			const expected = !inside
				? [0, 0, 0, 255]
				: row < 2
					? column < 2
						? [128, 0, 0, 255]
						: [0, 64, 0, 255]
					: column < 2
						? [0, 0, 128, 255]
						: [0, 0, 0, 255];
			expect(pixel(target, column, row)).toEqual(expected);
		}
	}
	expect(source.pixels).toEqual(before);
});

it("samples the lower-right source pixel when reducing at half opacity", () => {
	const source = createRaster(2, 2, [255, 0, 0, 255]);
	source.pixels.set([0, 255, 0, 128], 12);
	const target = createRaster(1, 1);
	paintRasterImage(target, source, 0, 0, 1, 1, undefined, 0.5);
	expect(pixel(target, 0)).toEqual([0, 255, 0, 64]);
});

it.each(["same raster", "overlapping views"])(
	"snapshots aliased source pixels before compositing: %s",
	(kind) => {
		const pixels = new Uint8Array([
			255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 0, 128,
		]);
		const target = { width: 3, height: 1, pixels: pixels.subarray(4) };
		const source =
			kind === "same raster"
				? target
				: { width: 3, height: 1, pixels: pixels.subarray(0, 12) };
		const expected = { ...target, pixels: target.pixels.slice() };
		const snapshot = { ...source, pixels: source.pixels.slice() };
		const originX = kind === "same raster" ? 1 : 0;
		paintRasterImage(expected, snapshot, originX, 0, 3, 1, undefined, 0.5);
		paintRasterImage(target, source, originX, 0, 3, 1, undefined, 0.5);
		expect(target.pixels).toEqual(expected.pixels);
		expect([...pixels.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
	},
);
