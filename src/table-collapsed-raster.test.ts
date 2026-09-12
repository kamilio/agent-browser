import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { layoutValueLimits } from "./layout-values.js";
import {
	createRaster,
	paintRasterRect,
	type RasterImage,
	type Rgba,
} from "./raster.js";
import {
	paintCollapsedTableBorders,
	type CollapsedTableBorderPaint,
} from "./table-collapsed-raster.js";

const red: Rgba = [255, 0, 0, 255];
const blue: Rgba = [0, 0, 255, 255];
const transparent: Rgba = [0, 0, 0, 0];
const noCharge = () => {};

function segment(
	values: Partial<CollapsedTableBorderPaint> = {},
): CollapsedTableBorderPaint {
	return { x: 0, y: 0, width: 1, height: 1, color: red, ownerId: 0, ...values };
}

function pixel(image: RasterImage, column: number, row: number): number[] {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

function budget(limit: number) {
	let work = 0;
	return (amount: number) => {
		expect(Number.isSafeInteger(amount) && amount >= 0).toBe(true);
		work += amount;
		if (work > limit)
			throw new AgentBrowserError(
				"resource-limit",
				"Collapsed paint work limit",
			);
	};
}

it.each([
	{ originX: 0, originY: 0, x: 0.5, y: 0.5, width: 2, height: 1 },
	{ originX: 0, originY: 0, x: 0.51, y: 0.51, width: 1.99, height: 1.99 },
	{ originX: -2, originY: -1, x: 1, y: 0, width: 3, height: 3 },
	{ originX: -0.75, originY: -0.25, x: 1, y: 0, width: 1.25, height: 2.75 },
	{ originX: 2, originY: 1, x: -3, y: -2, width: 3, height: 3 },
])("matches half-open pixel-center clipping for %j", (geometry) => {
	const image = createRaster(4, 3);
	const expected = createRaster(4, 3);
	const border = segment(geometry);
	const painted = paintCollapsedTableBorders(
		image,
		geometry.originX,
		geometry.originY,
		[border],
		noCharge,
	);
	paintRasterRect(
		expected,
		geometry.originX + border.x,
		geometry.originY + border.y,
		border.width,
		border.height,
		red,
	);
	expect(image.pixels).toEqual(expected.pixels);
	expect(painted).toBe(
		expected.pixels.filter((value, index) => index % 4 === 3 && value !== 0)
			.length,
	);
});

it("paints overlapping shared rectangles once rather than doubling alpha", () => {
	const image = createRaster(3, 1);
	const color: Rgba = [200, 40, 60, 128];
	expect(
		paintCollapsedTableBorders(
			image,
			0,
			0,
			[segment({ width: 2, color }), segment({ x: 1, width: 2, color })],
			noCharge,
		),
	).toBe(3);
	for (let column = 0; column < 3; column++)
		expect(pixel(image, column, 0)).toEqual(color);
});

it("blends only the final semitransparent winner over the existing background", () => {
	const image = createRaster(1, 1, [20, 40, 60, 255]);
	expect(
		paintCollapsedTableBorders(
			image,
			0,
			0,
			[segment(), segment({ color: [220, 100, 20, 128] })],
			noCharge,
		),
	).toBe(1);
	expect(pixel(image, 0, 0)).toEqual([120, 70, 40, 255]);
});

it("retains transparent winner coverage without exposing a weaker border", () => {
	const background: Rgba = [10, 20, 30, 100];
	const image = createRaster(3, 1, background);
	expect(
		paintCollapsedTableBorders(
			image,
			0,
			0,
			[
				segment({ width: 3 }),
				segment({ x: 1, width: 2, color: [90, 80, 70, 0], ownerId: 1 }),
			],
			noCharge,
		),
	).toBe(1);
	expect(pixel(image, 0, 0)).toEqual(red);
	expect(pixel(image, 1, 0)).toEqual(background);
	expect(pixel(image, 2, 0)).toEqual(background);
});

it("uses input priority order at junctions rather than owner IDs", () => {
	const horizontal = segment({ y: 1, width: 3, ownerId: 9 });
	const vertical = segment({ x: 1, height: 3, color: blue, ownerId: 1 });
	for (const borders of [
		[horizontal, vertical],
		[vertical, horizontal],
	]) {
		const image = createRaster(3, 3);
		expect(paintCollapsedTableBorders(image, 0, 0, borders, noCharge)).toBe(5);
		expect(pixel(image, 1, 1)).toEqual(borders[1].color);
		expect(pixel(image, 0, 1)).toEqual(red);
		expect(pixel(image, 1, 0)).toEqual(blue);
		expect(pixel(image, 0, 0)).toEqual(transparent);
	}
});

it.each(
	[
		[],
		[segment({ width: 0 })],
		[segment({ height: 0 })],
		[segment({ width: 0, height: 0 })],
		[segment({ color: transparent })],
		[segment({ x: 0.6, width: 0.1 })],
	].map((borders) => ({ borders })),
)("does not paint empty or zero-coverage inputs $borders", ({ borders }) => {
	const image = createRaster(2, 2, blue);
	const before = image.pixels.slice();
	expect(paintCollapsedTableBorders(image, 0, 0, borders, noCharge)).toBe(0);
	expect(image.pixels).toEqual(before);
});

it("charges clipped pixels rather than enormous off-canvas areas", () => {
	const image = createRaster(3, 2);
	const borders = [
		segment({ x: 1_000_000, width: 1_000_000, height: 1_000_000 }),
		segment({ x: -3_000_000, width: 1_000_000, height: 1_000_000 }),
		segment({
			x: -1_000_000,
			y: -1_000_000,
			width: 1_000_004,
			height: 1_000_003,
		}),
	];
	expect(paintCollapsedTableBorders(image, 0, 0, borders, budget(32))).toBe(6);
	expect(pixel(image, 2, 1)).toEqual(red);
});

it.each([
	{ width: -1 },
	{ height: -1 },
	{ x: Number.NaN },
	{ y: Number.POSITIVE_INFINITY },
	{ width: Number.POSITIVE_INFINITY },
	{ height: Number.NaN },
	{ x: "0" },
	{ width: "1" },
	{ ownerId: -1 },
	{ ownerId: 0.5 },
	{ ownerId: Number.MAX_SAFE_INTEGER + 1 },
	{ color: null },
	{ color: [255, 0, 0] },
	{ color: [255, 0, 0, 255, 0] },
	{ color: [256, 0, 0, 255] },
	{ color: [0, -1, 0, 255] },
	{ color: [0, 0.5, 0, 255] },
	{ color: [0, 0, Number.NaN, 0] },
	{ color: [0, 0, 0, Number.POSITIVE_INFINITY] },
	{ color: new Array(4) },
	{ color: new Uint8Array(4) },
])("rejects malformed segments before any raster writes: %j", (values) => {
	const image = createRaster(2, 2, blue);
	const before = image.pixels.slice();
	expect(() =>
		paintCollapsedTableBorders(
			image,
			0,
			0,
			[segment(), segment(values as Partial<CollapsedTableBorderPaint>)],
			noCharge,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(image.pixels).toEqual(before);
});

it("rejects invalid containers, missing segments, images and origins", () => {
	const image = createRaster(1, 1);
	for (const borders of [null, {}, [null], new Array(1)])
		expect(() =>
			paintCollapsedTableBorders(
				image,
				0,
				0,
				borders as unknown as readonly CollapsedTableBorderPaint[],
				noCharge,
			),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
		expect(() =>
			paintCollapsedTableBorders(image, value, 0, [], noCharge),
		).toThrow();
		expect(() =>
			paintCollapsedTableBorders(image, 0, value, [], noCharge),
		).toThrow();
	}
	expect(() =>
		paintCollapsedTableBorders(
			{ width: 1, height: 1, pixels: new Uint8Array(3) },
			0,
			0,
			[],
			noCharge,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it("bounds dimensions, coordinates and translated endpoint arithmetic", () => {
	const limit = layoutValueLimits.maxAbsoluteLength;
	const image = createRaster(1, 1);
	for (const [originX, originY, border] of [
		[0, 0, segment({ width: limit + 1 })],
		[0, 0, segment({ height: limit + 1 })],
		[0, 0, segment({ x: limit })],
		[0, 0, segment({ y: limit })],
		[limit, 0, segment()],
		[0, limit, segment()],
		[-limit, 0, segment({ x: -1 })],
		[0, -limit, segment({ y: -1 })],
		[Number.MAX_VALUE, 0, segment()],
	] as const)
		expect(() =>
			paintCollapsedTableBorders(image, originX, originY, [border], noCharge),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("fails every insufficient accumulation budget before writing any pixels", () => {
	const borders = [segment({ width: 2 }), segment({ width: 2, color: blue })];
	let required = 0;
	paintCollapsedTableBorders(createRaster(2, 1), 0, 0, borders, (amount) => {
		required += amount;
	});
	expect(required).toBeGreaterThanOrEqual(13);
	for (let limit = 0; limit < required; limit++) {
		const image = createRaster(2, 1, red);
		const before = image.pixels.slice();
		expect(() =>
			paintCollapsedTableBorders(image, 0, 0, borders, budget(limit)),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(image.pixels).toEqual(before);
	}
	expect(
		paintCollapsedTableBorders(
			createRaster(2, 1),
			0,
			0,
			borders,
			budget(required),
		),
	).toBe(2);
});

it("charges before inspecting a rectangle or allocating its retained coverage", () => {
	const image = createRaster(1, 1, blue);
	const failure = new AgentBrowserError("resource-limit", "Stop accumulation");
	const uninspected = {
		get ownerId(): number {
			throw new Error("Inspected uncharged rectangle");
		},
	} as CollapsedTableBorderPaint;
	let calls = 0;
	expect(() =>
		paintCollapsedTableBorders(image, 0, 0, [uninspected], () => {
			if (++calls === 2) throw failure;
		}),
	).toThrow(failure);
	expect(pixel(image, 0, 0)).toEqual(blue);
});

it("preserves frozen input order, coordinates and colors deterministically", () => {
	const borders = Object.freeze([
		Object.freeze(
			segment({ width: 3, color: Object.freeze([255, 0, 0, 128] as const) }),
		),
		Object.freeze(
			segment({ x: 1, color: Object.freeze([0, 0, 255, 128] as const) }),
		),
		Object.freeze(
			segment({ x: 2, color: Object.freeze([0, 0, 0, 0] as const) }),
		),
	]);
	const before = JSON.stringify(borders);
	const first = createRaster(3, 1, blue);
	const second = createRaster(3, 1, blue);
	const firstCharges: number[] = [];
	const secondCharges: number[] = [];
	expect(
		paintCollapsedTableBorders(first, 0, 0, borders, (amount) =>
			firstCharges.push(amount),
		),
	).toBe(2);
	expect(
		paintCollapsedTableBorders(second, 0, 0, borders, (amount) =>
			secondCharges.push(amount),
		),
	).toBe(2);
	expect(second.pixels).toEqual(first.pixels);
	expect(secondCharges).toEqual(firstCharges);
	expect(JSON.stringify(borders)).toBe(before);
});
