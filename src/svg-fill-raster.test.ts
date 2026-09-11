import { expect, it } from "vitest";
import {
	rasterizeSvgFills,
	svgFillLimits,
	type SvgFill,
} from "./svg-fill-raster.js";
import { flattenSvgPath, type SvgContour } from "./svg-path-flatten.js";
import {
	createRaster,
	paintRasterRect,
	type RasterImage,
	type Rgba,
} from "./raster.js";

const red: Rgba = [255, 0, 0, 255];
const noCharge = () => {};

function rectangle(
	left: number,
	top: number,
	right: number,
	bottom: number,
): SvgContour {
	return {
		closed: false,
		points: [
			{ x: left, y: top },
			{ x: right, y: top },
			{ x: right, y: bottom },
			{ x: left, y: bottom },
		],
	};
}

function fill(
	contours: readonly SvgContour[],
	fillRule: SvgFill["fillRule"] = "nonzero",
	color = red,
): SvgFill {
	return { contours, fillRule, color };
}

function pixel(image: RasterImage, across: number, down: number) {
	const offset = (down * image.width + across) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("returns a bounded transparent raster for an empty scene", () => {
	const image = rasterizeSvgFills([], 3, 2, noCharge);
	expect(image.width).toBe(3);
	expect(image.height).toBe(2);
	expect(image.pixels).toEqual(new Uint8Array(24));
	expect(Object.isFrozen(image)).toBe(true);
});

it.each([false, true])(
	"fills an implicitly or explicitly closed rectangle: %s",
	(closed) => {
		const contour = rectangle(1, 2, 4, 5);
		const image = rasterizeSvgFills(
			[fill([{ ...contour, closed }])],
			6,
			6,
			noCharge,
		);
		const expected = createRaster(6, 6);
		paintRasterRect(expected, 1, 2, 3, 3, red);
		expect(image.pixels).toEqual(expected.pixels);
	},
);

it.each(["nonzero", "evenodd"] as const)(
	"resolves same-orientation nested contours using %s",
	(rule) => {
		const image = rasterizeSvgFills(
			[fill([rectangle(0, 0, 8, 8), rectangle(2, 2, 6, 6)], rule)],
			8,
			8,
			noCharge,
		);
		expect(pixel(image, 1, 1)).toEqual(red);
		expect(pixel(image, 3, 3)).toEqual(rule === "nonzero" ? red : [0, 0, 0, 0]);
	},
);

it.each(["nonzero", "evenodd"] as const)(
	"cuts opposite-orientation holes using %s",
	(rule) => {
		const inner = rectangle(2, 2, 6, 6);
		const image = rasterizeSvgFills(
			[
				fill(
					[
						rectangle(0, 0, 8, 8),
						{ ...inner, points: [...inner.points].reverse() },
					],
					rule,
				),
			],
			8,
			8,
			noCharge,
		);
		expect(pixel(image, 1, 1)).toEqual(red);
		expect(pixel(image, 3, 3)).toEqual([0, 0, 0, 0]);
	},
);

it("handles coincident cancelling edges without seams", () => {
	const contour = rectangle(1, 1, 7, 7);
	for (const rule of ["nonzero", "evenodd"] as const) {
		const image = rasterizeSvgFills(
			[
				fill(
					[contour, { ...contour, points: [...contour.points].reverse() }],
					rule,
				),
			],
			8,
			8,
			noCharge,
		);
		expect(image.pixels.every((channel) => channel === 0)).toBe(true);
	}
});

it.each(["nonzero", "evenodd"] as const)(
	"cancels reversed sloped edges at a pixel center using %s",
	(fillRule) => {
		const points = [
			{ x: 0.2, y: 0 },
			{ x: 6.2, y: 10 },
			{ x: 0, y: 10 },
		];
		const image = rasterizeSvgFills(
			[
				fill(
					[
						{ closed: true, points },
						{ closed: true, points: [...points].reverse() },
					],
					fillRule,
				),
			],
			1,
			1,
			noCharge,
		);
		expect(Array.from(image.pixels)).toEqual([0, 0, 0, 0]);
	},
);

it("uses half-open pixel-center edges for fractional bounds", () => {
	const image = rasterizeSvgFills(
		[fill([rectangle(0.5, 0.5, 2.5, 2.5)])],
		4,
		4,
		noCharge,
	);
	const expected = createRaster(4, 4);
	paintRasterRect(expected, 0.5, 0.5, 2, 2, red);
	expect(image.pixels).toEqual(expected.pixels);
});

it("clips fills to the raster without discarding enclosing offscreen paths", () => {
	const image = rasterizeSvgFills(
		[fill([rectangle(-1e9, -1e9, 1e9, 1e9)])],
		4,
		4,
		noCharge,
	);
	expect(image.pixels).toEqual(createRaster(4, 4, red).pixels);
	const outside = rasterizeSvgFills(
		[fill([rectangle(100, 100, 200, 200)])],
		4,
		4,
		noCharge,
	);
	expect(outside.pixels.every((channel) => channel === 0)).toBe(true);
});

it("composites independent translucent shapes once in source order", () => {
	const contours = [rectangle(0, 0, 4, 4)];
	const image = rasterizeSvgFills(
		[
			fill(contours, "nonzero", [255, 0, 0, 128]),
			fill(contours, "nonzero", [0, 0, 255, 128]),
		],
		4,
		4,
		noCharge,
	);
	expect(pixel(image, 2, 2)).toEqual([85, 0, 170, 192]);
	const repeated = rasterizeSvgFills(
		[fill([...contours, ...contours], "nonzero", [255, 0, 0, 128])],
		4,
		4,
		noCharge,
	);
	expect(pixel(repeated, 2, 2)).toEqual([255, 0, 0, 128]);
});

it("ignores zero-area contours and transparent ink", () => {
	const image = rasterizeSvgFills(
		[
			fill([
				{ closed: false, points: [] },
				{ closed: false, points: [{ x: 0, y: 0 }] },
				{
					closed: false,
					points: [
						{ x: 0, y: 0 },
						{ x: 3, y: 3 },
					],
				},
				{
					closed: true,
					points: [
						{ x: 0, y: 2 },
						{ x: 2, y: 2 },
						{ x: 3, y: 2 },
					],
				},
			]),
			fill([rectangle(0, 0, 4, 4)], "nonzero", [255, 0, 0, 0]),
		],
		4,
		4,
		noCharge,
	);
	expect(image.pixels.every((channel) => channel === 0)).toBe(true);
});

it("paints actual bounded cubic geometry rather than its bounding box", () => {
	const start = { x: 0, y: 10 };
	const end = { x: 20, y: 10 };
	const contours = flattenSvgPath(
		[
			{ kind: "move", end: start },
			{
				kind: "cubic",
				start,
				control1: { x: 0, y: 0 },
				control2: { x: 20, y: 0 },
				end,
			},
			{ kind: "close", start: end, end: start },
		],
		noCharge,
		0.05,
	);
	const image = rasterizeSvgFills([fill(contours)], 20, 12, noCharge);
	expect(pixel(image, 10, 5)).toEqual(red);
	expect(pixel(image, 0, 0)).toEqual([0, 0, 0, 0]);
	expect(pixel(image, 10, 11)).toEqual([0, 0, 0, 0]);
});

it("matches independent point-winding classification away from polygon edges", () => {
	const points = [
		{ x: 1.13, y: 1.27 },
		{ x: 13.21, y: 3.31 },
		{ x: 3.17, y: 14.19 },
		{ x: 10.23, y: 0.37 },
		{ x: 14.29, y: 12.41 },
	];
	for (const fillRule of ["nonzero", "evenodd"] as const) {
		const image = rasterizeSvgFills(
			[fill([{ points, closed: false }], fillRule)],
			16,
			16,
			noCharge,
		);
		for (let row = 0; row < 16; row++) {
			for (let column = 0; column < 16; column++) {
				const across = column + 0.5;
				const down = row + 0.5;
				let winding = 0;
				for (let index = 0; index < points.length; index++) {
					const start = points[index];
					const end = points[(index + 1) % points.length];
					const side =
						(end.x - start.x) * (down - start.y) -
						(across - start.x) * (end.y - start.y);
					if (start.y <= down && end.y > down && side > 0) winding++;
					if (start.y > down && end.y <= down && side < 0) winding--;
				}
				const inside =
					fillRule === "nonzero" ? winding !== 0 : Math.abs(winding) % 2 === 1;
				expect(pixel(image, column, row)).toEqual(inside ? red : [0, 0, 0, 0]);
			}
		}
	}
});

it.each(Object.keys(svgFillLimits) as (keyof typeof svgFillLimits)[])(
	"rejects invalid %s overrides",
	(name) => {
		for (const value of [
			0,
			-1,
			1.1,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			svgFillLimits[name] + 1,
		])
			expect(() =>
				rasterizeSvgFills([], 1, 1, noCharge, { [name]: value }),
			).toThrow("Invalid SVG fill limit");
	},
);

it("enforces aggregate shapes, contours, points and edges", () => {
	const contour = rectangle(0, 0, 4, 4);
	const shape = fill([contour]);
	expect(() =>
		rasterizeSvgFills([shape, shape], 4, 4, noCharge, { maxShapes: 1 }),
	).toThrow("shape limit");
	expect(() =>
		rasterizeSvgFills([fill([contour, contour])], 4, 4, noCharge, {
			maxContours: 1,
		}),
	).toThrow("contour limit");
	expect(() =>
		rasterizeSvgFills([shape, shape], 4, 4, noCharge, { maxPoints: 7 }),
	).toThrow("point limit");
	expect(() =>
		rasterizeSvgFills([shape], 4, 4, noCharge, { maxEdges: 1 }),
	).toThrow("edge limit");
});

it("enforces dimensions and coordinate bounds without increasing native raster caps", () => {
	for (const [width, height] of [
		[0, 1],
		[1, 0],
		[-1, 1],
		[1.5, 1],
		[Number.NaN, 1],
	])
		expect(() => rasterizeSvgFills([], width, height, noCharge)).toThrow(
			"Invalid SVG raster dimensions",
		);
	expect(() => rasterizeSvgFills([], 4097, 1, noCharge)).toThrow("pixel limit");
	expect(() => rasterizeSvgFills([], 4096, 4096, noCharge)).toThrow(
		"pixel limit",
	);
	expect(() =>
		rasterizeSvgFills([fill([rectangle(0, 0, 1e9 + 1, 2)])], 4, 4, noCharge),
	).toThrow("coordinate limit");
});

it("charges allocation and scan conversion while preserving caller objects", () => {
	const shape = fill([rectangle(0, 0, 4, 4)]);
	const before = JSON.stringify(shape);
	const charges: number[] = [];
	rasterizeSvgFills([shape], 4, 4, (amount) => charges.push(amount));
	expect(charges).toContain(64);
	expect(
		charges.every((amount) => Number.isSafeInteger(amount) && amount > 0),
	).toBe(true);
	expect(JSON.stringify(shape)).toBe(before);
	expect(Object.isFrozen(shape)).toBe(false);
	const failure = new Error("owner allocation exhausted");
	expect(() =>
		rasterizeSvgFills([shape], 4, 4, (amount) => {
			if (amount === 64) throw failure;
		}),
	).toThrow(failure);
	let work = 0;
	expect(() =>
		rasterizeSvgFills([shape], 4, 4, (amount) => {
			work += amount;
			if (work > 100) throw failure;
		}),
	).toThrow(failure);
});

it("rejects malformed fill inputs even if their ink is transparent", () => {
	expect(() => rasterizeSvgFills(null as never, 1, 1, noCharge)).toThrow(
		"Invalid SVG fills",
	);
	expect(() => rasterizeSvgFills([], 1, 1, noCharge, null as never)).toThrow(
		"Invalid SVG fill limits",
	);
	expect(() => rasterizeSvgFills([], 1, 1, null as never)).toThrow(
		"Invalid SVG work owner",
	);
	expect(() =>
		rasterizeSvgFills(
			[{ ...fill([]), fillRule: "bad" as never }],
			1,
			1,
			noCharge,
		),
	).toThrow("Invalid SVG fill rule");
	expect(() =>
		rasterizeSvgFills([fill([], "nonzero", [1, 2, 3, 256])], 1, 1, noCharge),
	).toThrow("Invalid SVG fill color");
	expect(() =>
		rasterizeSvgFills(
			[
				fill(
					[{ closed: false, points: [{ x: Number.NaN, y: 0 }] }],
					"nonzero",
					[0, 0, 0, 0],
				),
			],
			1,
			1,
			noCharge,
		),
	).toThrow("Invalid SVG fill coordinate");
});
