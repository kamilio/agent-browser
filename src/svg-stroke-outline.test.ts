import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import type { RasterImage, Rgba } from "./raster.js";
import { rasterizeSvgFills } from "./svg-fill-raster.js";
import {
	flattenSvgPath,
	type SvgContour,
	svgFlattenLimits,
} from "./svg-path-flatten.js";
import { parseSvgPath } from "./svg-path.js";
import type { SvgPoint } from "./svg-path-types.js";
import {
	strokeSvgContours,
	type SvgStrokeGeometry,
} from "./svg-stroke-outline.js";

const noCharge = () => {};
const red: Rgba = [255, 0, 0, 255];
const transparent = [0, 0, 0, 0];
const geometry: SvgStrokeGeometry = {
	width: 2,
	lineCap: "butt",
	lineJoin: "miter",
	miterLimit: 4,
};

function contour(points: readonly SvgPoint[], closed = false): SvgContour {
	return { points, closed };
}

function outline(
	points: readonly SvgPoint[],
	options: Partial<SvgStrokeGeometry> = {},
	closed = false,
) {
	return strokeSvgContours(
		[contour(points, closed)],
		{ ...geometry, ...options },
		noCharge,
	);
}

function bounds(contours: readonly SvgContour[]) {
	const points = contours.flatMap((entry) => [...entry.points]);
	return {
		left: Math.min(...points.map((point) => point.x)),
		right: Math.max(...points.map((point) => point.x)),
		top: Math.min(...points.map((point) => point.y)),
		bottom: Math.max(...points.map((point) => point.y)),
	};
}

function signedArea(points: readonly SvgPoint[]) {
	let area = 0;
	for (let index = 0; index < points.length; index++) {
		const start = points[index];
		const end = points[(index + 1) % points.length];
		area += start.x * end.y - start.y * end.x;
	}
	return area / 2;
}

function raster(contours: readonly SvgContour[], color = red) {
	return rasterizeSvgFills(
		[{ contours, color, fillRule: "nonzero" }],
		12,
		12,
		noCharge,
	);
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("constructs the exact horizontal butt rectangle in local user coordinates", () => {
	const result = outline([
		{ x: 2, y: 3 },
		{ x: 6, y: 3 },
	]);
	expect(result).toHaveLength(1);
	expect(bounds(result)).toEqual({ left: 2, right: 6, top: 2, bottom: 4 });
	expect(signedArea(result[0].points)).toBe(8);
	expect(pixel(raster(result), 2, 2)).toEqual(red);
	expect(pixel(raster(result), 1, 2)).toEqual(transparent);
});

it("constructs the exact vertical butt rectangle", () => {
	const result = outline([
		{ x: 4, y: 2 },
		{ x: 4, y: 8 },
	]);
	expect(bounds(result)).toEqual({ left: 3, right: 5, top: 2, bottom: 8 });
	expect(signedArea(result[0].points)).toBe(12);
});

it("offsets diagonal segments perpendicular to the actual tangent", () => {
	const result = outline([
		{ x: 2, y: 2 },
		{ x: 6, y: 6 },
	]);
	const extent = bounds(result);
	expect(extent.left).toBeCloseTo(2 - Math.SQRT1_2, 12);
	expect(extent.top).toBeCloseTo(2 - Math.SQRT1_2, 12);
	expect(extent.right).toBeCloseTo(6 + Math.SQRT1_2, 12);
	expect(extent.bottom).toBeCloseTo(6 + Math.SQRT1_2, 12);
	expect(signedArea(result[0].points)).toBeCloseTo(8 * Math.SQRT2, 12);
});

it.each(["butt", "round", "square"] as const)(
	"produces the actual %s open-cap region",
	(lineCap) => {
		const result = outline(
			[
				{ x: 4, y: 4 },
				{ x: 8, y: 4 },
			],
			{ width: 4, lineCap },
		);
		const extent = bounds(result);
		expect(extent.left).toBeCloseTo(lineCap === "butt" ? 4 : 2, 10);
		expect(extent.right).toBeCloseTo(lineCap === "butt" ? 8 : 10, 10);
		expect(extent.top).toBeCloseTo(2, 10);
		expect(extent.bottom).toBeCloseTo(6, 10);
		const image = raster(result);
		expect(pixel(image, 2, 3)).toEqual(lineCap === "butt" ? transparent : red);
		expect(pixel(image, 2, 2)).toEqual(
			lineCap === "square" ? red : transparent,
		);
		expect(pixel(image, 9, 3)).toEqual(lineCap === "butt" ? transparent : red);
	},
);

it("keeps square caps tangent-aligned for a diagonal segment", () => {
	const result = outline(
		[
			{ x: 4, y: 4 },
			{ x: 6, y: 6 },
		],
		{ lineCap: "square" },
	);
	const extent = bounds(result);
	expect(extent.left).toBeCloseTo(4 - Math.SQRT2, 12);
	expect(extent.right).toBeCloseTo(6 + Math.SQRT2, 12);
	expect(result.every((entry) => signedArea(entry.points) > 0)).toBe(true);
});

it.each(["miter", "round", "bevel"] as const)(
	"constructs the %s outside patch at a right-angle join",
	(lineJoin) => {
		const result = outline(
			[
				{ x: 2, y: 6 },
				{ x: 6, y: 6 },
				{ x: 6, y: 2 },
			],
			{ width: 6, lineJoin },
		);
		const image = raster(result);
		expect(pixel(image, 8, 8)).toEqual(
			lineJoin === "miter" ? red : transparent,
		);
		expect(pixel(image, 8, 7)).toEqual(
			lineJoin === "bevel" ? transparent : red,
		);
		expect(result.every((entry) => signedArea(entry.points) > 0)).toBe(true);
	},
);

it.each([
	[0, false],
	[0.5, false],
	[1.4, false],
	[Math.SQRT2, true],
	[1.5, true],
] as const)(
	"compares the miter tip to half-width at limit %s",
	(miterLimit, mitered) => {
		const result = outline(
			[
				{ x: 2, y: 6 },
				{ x: 6, y: 6 },
				{ x: 6, y: 2 },
			],
			{ width: 4, miterLimit },
		);
		expect(pixel(raster(result), 7, 7)).toEqual(mitered ? red : transparent);
	},
);

it("bevels an acute outer miter only when its actual ratio exceeds the limit", () => {
	const points = [
		{ x: 2, y: 6 },
		{ x: 6, y: 6 },
		{ x: 2, y: 2 },
	];
	const miter = outline(points, { miterLimit: 3 });
	const bevel = outline(points, { miterLimit: 2 });
	expect(bounds(miter).right).toBeCloseTo(7 + Math.SQRT2, 12);
	expect(bounds(bevel).right).toBeCloseTo(6 + Math.SQRT1_2, 12);
});

it.each(["miter", "round", "bevel"] as const)(
	"preserves the %s union when path directions and reflex turns reverse",
	(lineJoin) => {
		const points = [
			{ x: 2, y: 8 },
			{ x: 7, y: 8 },
			{ x: 4, y: 3 },
			{ x: 9, y: 4 },
		];
		const options = { lineJoin, lineCap: "round" as const };
		expect(raster(outline(points, options)).pixels).toEqual(
			raster(outline([...points].reverse(), options)).pixels,
		);
	},
);

it.each(["miter", "round", "bevel"] as const)(
	"handles a fully reversed tangent with a %s join",
	(lineJoin) => {
		const result = outline(
			[
				{ x: 3, y: 4 },
				{ x: 7, y: 4 },
				{ x: 3, y: 4 },
			],
			{ width: 4, lineJoin },
		);
		const image = raster(result);
		expect(pixel(image, 7, 3)).toEqual(
			lineJoin === "round" ? red : transparent,
		);
		expect(pixel(image, 2, 3)).toEqual(transparent);
	},
);

it("does not add a join patch for collinear continuation", () => {
	const result = outline([
		{ x: 2, y: 4 },
		{ x: 5, y: 4 },
		{ x: 8, y: 4 },
	]);
	expect(result).toHaveLength(2);
	expect(raster(result).pixels).toEqual(
		raster(
			outline([
				{ x: 2, y: 4 },
				{ x: 8, y: 4 },
			]),
		).pixels,
	);
});

it("uses only the outer round sector when neighboring segments are shorter than the radius", () => {
	const result = outline(
		[
			{ x: 5.8, y: 6 },
			{ x: 6, y: 6 },
			{ x: 6, y: 5.8 },
		],
		{ width: 4, lineJoin: "round" },
	);
	const image = raster(result);
	expect(pixel(image, 6, 6)).toEqual(red);
	expect(pixel(image, 5, 4)).toEqual(transparent);
});

it.each(["butt", "round", "square"] as const)(
	"joins closed seams without %s end caps or an interior fill",
	(lineCap) => {
		const points = [
			{ x: 3, y: 3 },
			{ x: 9, y: 3 },
			{ x: 9, y: 9 },
			{ x: 3, y: 9 },
		];
		const result = outline(points, { lineCap }, true);
		const image = raster(result);
		expect(result).toHaveLength(8);
		expect(pixel(image, 2, 2)).toEqual(red);
		expect(pixel(image, 5, 5)).toEqual(transparent);
		expect(image.pixels).toEqual(
			raster(outline([...points, points[0]], { lineCap }, true)).pixels,
		);
	},
);

it("preserves the closure seam for a two-point retraced closed contour", () => {
	const points = [
		{ x: 3, y: 4 },
		{ x: 8, y: 4 },
	];
	const result = outline(points, { lineCap: "square" }, true);
	expect(result).toHaveLength(2);
	expect(bounds(result)).toEqual({ left: 3, right: 8, top: 3, bottom: 5 });
});

it.each(["butt", "round", "square"] as const)(
	"does not invent %s paint for a move-only contour",
	(lineCap) => {
		expect(outline([{ x: 4, y: 4 }], { lineCap })).toEqual([]);
	},
);

it.each(["butt", "round", "square"] as const)(
	"preserves %s cap semantics for an explicitly drawn zero-length segment",
	(lineCap) => {
		const source = flattenSvgPath(parseSvgPath("M4 4L4 4", noCharge), noCharge);
		expect(source[0].points).toHaveLength(2);
		const result = strokeSvgContours(
			source,
			{ ...geometry, width: 4, lineCap },
			noCharge,
		);
		const image = raster(result);
		expect(pixel(image, 3, 3)).toEqual(lineCap === "butt" ? transparent : red);
		expect(pixel(image, 2, 2)).toEqual(
			lineCap === "square" ? red : transparent,
		);
	},
);

it("keeps duplicate interior and endpoint vertices without inventing interior caps", () => {
	const points = [
		{ x: 2, y: 6 },
		{ x: 6, y: 6 },
		{ x: 6, y: 2 },
	];
	const duplicates = [
		points[0],
		points[0],
		points[1],
		points[1],
		points[2],
		points[2],
	];
	expect(raster(outline(duplicates, { lineCap: "square" })).pixels).toEqual(
		raster(outline(points, { lineCap: "square" })).pixels,
	);
});

it.each(["butt", "round", "square"] as const)(
	"preserves %s caps on a drawn zero-length closepath rather than treating it as moveto",
	(lineCap) => {
		const source = flattenSvgPath(parseSvgPath("M4 4Z", noCharge), noCharge);
		expect(source).toEqual([{ closed: true, points: [{ x: 4, y: 4 }] }]);
		const result = strokeSvgContours(
			source,
			{ ...geometry, width: 4, lineCap },
			noCharge,
		);
		const image = raster(result);
		expect(pixel(image, 3, 3)).toEqual(lineCap === "butt" ? transparent : red);
		expect(pixel(image, 2, 2)).toEqual(
			lineCap === "square" ? red : transparent,
		);
		expect(image.pixels).toEqual(
			raster(
				outline(
					[
						{ x: 4, y: 4 },
						{ x: 4, y: 4 },
					],
					{ width: 4, lineCap },
					true,
				),
			).pixels,
		);
	},
);

it("uses the bounded horizontal tangent fallback for an all-zero square subpath", () => {
	const result = outline(
		[{ x: 4, y: 4 }],
		{ width: 4, lineCap: "square" },
		true,
	);
	expect(bounds(result)).toEqual({ left: 2, right: 6, top: 2, bottom: 6 });
});

it("keeps separate subpaths disconnected", () => {
	const result = strokeSvgContours(
		[
			contour([
				{ x: 2, y: 2 },
				{ x: 4, y: 2 },
			]),
			contour([
				{ x: 8, y: 6 },
				{ x: 10, y: 6 },
			]),
		],
		geometry,
		noCharge,
	);
	const image = raster(result);
	expect(pixel(image, 2, 1)).toEqual(red);
	expect(pixel(image, 8, 5)).toEqual(red);
	expect(pixel(image, 5, 3)).toEqual(transparent);
});

it("rasterizes overlapping stroke polygons as one alpha coverage union", () => {
	const result = outline(
		[
			{ x: 2, y: 6 },
			{ x: 6, y: 6 },
			{ x: 6, y: 2 },
		],
		{ width: 4, lineJoin: "round", lineCap: "round" },
	);
	const image = raster(result, [255, 0, 0, 128]);
	expect(pixel(image, 5, 5)).toEqual([255, 0, 0, 128]);
	expect(pixel(image, 2, 5)).toEqual([255, 0, 0, 128]);
	for (let offset = 3; offset < image.pixels.length; offset += 4)
		expect([0, 128]).toContain(image.pixels[offset]);
});

it("bounds circular chord sagitta by the requested tolerance", () => {
	const tolerance = 0.001;
	const result = strokeSvgContours(
		[
			contour([
				{ x: 4, y: 4 },
				{ x: 4, y: 4 },
			]),
		],
		{ ...geometry, width: 4, lineCap: "round" },
		noCharge,
		tolerance,
	);
	expect(result).toHaveLength(1);
	const points = result[0].points;
	for (let index = 0; index < points.length; index++) {
		const first = points[index];
		const second = points[(index + 1) % points.length];
		const midpoint = {
			x: (first.x + second.x) / 2,
			y: (first.y + second.y) / 2,
		};
		expect(2 - Math.hypot(midpoint.x - 4, midpoint.y - 4)).toBeLessThanOrEqual(
			tolerance,
		);
	}
});

it("returns frozen positive-winding snapshots without mutating caller input", () => {
	const points = [
		{ x: 3, y: 3 },
		{ x: 7, y: 5 },
		{ x: 5, y: 8 },
	];
	const source = [contour(points)];
	const original = JSON.stringify(source);
	const result = strokeSvgContours(
		source,
		{ ...geometry, lineJoin: "round", lineCap: "square" },
		noCharge,
	);
	expect(JSON.stringify(source)).toBe(original);
	expect(Object.isFrozen(source)).toBe(false);
	expect(Object.isFrozen(points[0])).toBe(false);
	expect(Object.isFrozen(result)).toBe(true);
	for (const entry of result) {
		expect(entry.closed).toBe(true);
		expect(Object.isFrozen(entry)).toBe(true);
		expect(Object.isFrozen(entry.points)).toBe(true);
		expect(entry.points.every(Object.isFrozen)).toBe(true);
		expect(signedArea(entry.points)).toBeGreaterThan(0);
	}
	const snapshot = JSON.stringify(result);
	points[0].x = 99;
	expect(JSON.stringify(result)).toBe(snapshot);
});

it("validates and charges zero-width input before returning immutable empty output", () => {
	let work = 0;
	const result = strokeSvgContours(
		[
			contour([
				{ x: 1, y: 1 },
				{ x: 2, y: 2 },
			]),
		],
		{ ...geometry, width: 0 },
		(amount) => {
			work += amount;
		},
	);
	expect(result).toEqual([]);
	expect(Object.isFrozen(result)).toBe(true);
	expect(work).toBeGreaterThanOrEqual(3);
	expect(() =>
		strokeSvgContours(
			[contour([{ x: NaN, y: 0 }])],
			{ ...geometry, width: 0 },
			noCharge,
		),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	{ width: -1 },
	{ width: Number.NaN },
	{ width: Number.POSITIVE_INFINITY },
	{ miterLimit: -0.01 },
	{ miterLimit: Number.NaN },
	{ miterLimit: Number.POSITIVE_INFINITY },
	{ lineCap: "triangle" },
	{ lineJoin: "miter-clip" },
])("rejects invalid geometry options %j", (options) => {
	expect(() =>
		strokeSvgContours(
			[],
			{ ...geometry, ...options } as SvgStrokeGeometry,
			noCharge,
		),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it.each([0, -1, NaN, Infinity])(
	"rejects invalid round tolerance %s",
	(tolerance) => {
		expect(() =>
			strokeSvgContours([], geometry, noCharge, tolerance),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);

it("does not silently accept dashes, markers or non-scaling stroke options", () => {
	for (const name of ["dashArray", "marker", "vectorEffect"]) {
		expect(() =>
			strokeSvgContours([], { ...geometry, [name]: "unsupported" }, noCharge),
		).toThrowError(expect.objectContaining({ code: "unsupported" }));
	}
});

it("enforces source point and contour ceilings even for zero width", () => {
	const point = { x: 0, y: 0 };
	for (const source of [
		Array.from({ length: svgFlattenLimits.maxSegments + 1 }, () =>
			contour([point]),
		),
		[
			contour(
				Array.from({ length: svgFlattenLimits.maxPoints + 1 }, () => point),
			),
		],
	]) {
		expect(() =>
			strokeSvgContours(source, { ...geometry, width: 0 }, noCharge),
		).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	}
});

it("bounds generated output rather than trusting a bounded input alone", () => {
	const source = Array.from({ length: 8193 }, () =>
		contour([
			{ x: 2, y: 2 },
			{ x: 3, y: 2 },
		]),
	);
	expect(() =>
		strokeSvgContours(source, { ...geometry, lineCap: "square" }, noCharge),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("rejects excessive round subdivision before allocating an unbounded polygon", () => {
	expect(() =>
		strokeSvgContours(
			[
				contour([
					{ x: 0, y: 0 },
					{ x: 0, y: 0 },
				]),
			],
			{ ...geometry, lineCap: "round" },
			noCharge,
			1e-12,
		),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("rejects output coordinates beyond the original coordinate ceiling", () => {
	expect(() =>
		outline([
			{ x: 1e9, y: 2 },
			{ x: 1e9, y: 4 },
		]),
	).toThrow(/coordinate limit/);
	expect(() => outline([{ x: 1e9 + 1, y: 0 }])).toThrow(/coordinate limit/);
});

it("rejects unrepresentable half-width and collapsed offsets explicitly", () => {
	expect(() =>
		outline(
			[
				{ x: 1, y: 1 },
				{ x: 2, y: 1 },
			],
			{ width: Number.MIN_VALUE },
		),
	).toThrow(/precision limit/);
	expect(() =>
		outline(
			[
				{ x: 1e8, y: 1e8 },
				{ x: 1e8 + 1, y: 1e8 },
			],
			{ width: 1e-20 },
		),
	).toThrow(/precision limit/);
});

it("rejects a round tolerance below coordinate precision", () => {
	expect(() =>
		strokeSvgContours(
			[
				contour([
					{ x: 1e8, y: 1e8 },
					{ x: 1e8, y: 1e8 },
				]),
			],
			{ ...geometry, lineCap: "round" },
			noCharge,
			1e-12,
		),
	).toThrow(/precision limit/);
});

it("charges expansion work and preserves the work owner's exhaustion error", () => {
	let work = 0;
	const source = [
		contour([
			{ x: 2, y: 2 },
			{ x: 8, y: 2 },
		]),
	];
	strokeSvgContours(source, { ...geometry, lineCap: "round" }, (amount) => {
		expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
		work += amount;
	});
	expect(work).toBeGreaterThan(20);
	const error = new AgentBrowserError(
		"resource-limit",
		"owned stroke budget exhausted",
	);
	let remaining = 20;
	expect(() =>
		strokeSvgContours(source, geometry, (amount) => {
			remaining -= amount;
			if (remaining < 0) throw error;
		}),
	).toThrow(error);
});
