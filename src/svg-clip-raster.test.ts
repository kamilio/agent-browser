import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { createRaster, type RasterImage, rasterLimits } from "./raster.js";
import {
	clipSvgRaster,
	type SvgClipFill,
	type SvgClipRegion,
} from "./svg-clip-raster.js";
import { svgFillLimits } from "./svg-fill-raster.js";
import {
	flattenSvgPath,
	type SvgContour,
	svgFlattenLimits,
} from "./svg-path-flatten.js";
import { parseSvgPath } from "./svg-path.js";

const noCharge = () => {};
const sourceColor = [17, 63, 129, 128] as const;
const transparent = [0, 0, 0, 0];

function rectangle(
	left: number,
	top: number,
	right: number,
	bottom: number,
): SvgContour {
	return {
		closed: true,
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
	fillRule: SvgClipFill["fillRule"] = "nonzero",
): SvgClipFill {
	return { contours, fillRule };
}

function box(
	left: number,
	top: number,
	right: number,
	bottom: number,
): SvgClipFill {
	return fill([rectangle(left, top, right, bottom)]);
}

function pixel(image: RasterImage, column: number, row = 0) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("keeps no-clip input byte-identical, including unassociated RGB at zero alpha", () => {
	const image = createRaster(2, 1, sourceColor);
	image.pixels.set([9, 8, 7, 0], 4);
	const original = image.pixels.slice();
	expect(clipSvgRaster(image, [], noCharge)).toBeUndefined();
	expect(image.pixels).toEqual(original);
});

it("intersects an image with rectangle coverage in place without replacing its pixel buffer", () => {
	const image = createRaster(6, 5, sourceColor);
	const pixels = image.pixels;
	clipSvgRaster(image, [[box(1, 1, 4, 3)]], noCharge);
	expect(image.pixels).toBe(pixels);
	expect([image.width, image.height]).toEqual([6, 5]);
	for (let row = 0; row < 5; row++)
		for (let column = 0; column < 6; column++)
			expect(pixel(image, column, row)).toEqual(
				column >= 1 && column < 4 && row >= 1 && row < 3
					? sourceColor
					: transparent,
			);
});

it("unions overlapping fills within one region without multiplying source alpha", () => {
	const image = createRaster(7, 4, sourceColor);
	clipSvgRaster(image, [[box(1, 1, 4, 3), box(3, 1, 6, 3)]], noCharge);
	expect(pixel(image, 1, 1)).toEqual(sourceColor);
	expect(pixel(image, 3, 1)).toEqual(sourceColor);
	expect(pixel(image, 5, 1)).toEqual(sourceColor);
	expect(pixel(image, 6, 1)).toEqual(transparent);
});

it("keeps disjoint fills in one region rather than intersecting them", () => {
	const image = createRaster(7, 3, sourceColor);
	clipSvgRaster(image, [[box(0, 0, 2, 3), box(5, 0, 7, 3)]], noCharge);
	expect(pixel(image, 1, 1)).toEqual(sourceColor);
	expect(pixel(image, 3, 1)).toEqual(transparent);
	expect(pixel(image, 5, 1)).toEqual(sourceColor);
});

it("intersects region unions without replacing them by bounding rectangles", () => {
	const image = createRaster(7, 5, sourceColor);
	clipSvgRaster(
		image,
		[[box(0, 0, 2, 5), box(5, 0, 7, 5)], [box(0, 2, 7, 4)]],
		noCharge,
	);
	expect(pixel(image, 1, 2)).toEqual(sourceColor);
	expect(pixel(image, 5, 3)).toEqual(sourceColor);
	expect(pixel(image, 1, 1)).toEqual(transparent);
	expect(pixel(image, 3, 2)).toEqual(transparent);
});

it("clears disjoint intersections completely", () => {
	const image = createRaster(6, 4, sourceColor);
	clipSvgRaster(image, [[box(0, 0, 2, 4)], [box(4, 0, 6, 4)]], noCharge);
	expect(image.pixels).toEqual(new Uint8Array(image.pixels.length));
});

it.each([0, 1, 2])(
	"treats an empty region at position %s as an empty intersection",
	(position) => {
		const regions: SvgClipRegion[] = [[box(0, 0, 4, 4)], [box(1, 1, 3, 3)]];
		regions.splice(position, 0, []);
		const image = createRaster(4, 4, sourceColor);
		clipSvgRaster(image, regions, noCharge);
		expect(image.pixels).toEqual(new Uint8Array(64));
	},
);

it("treats a fill with no contours as no geometry", () => {
	const image = createRaster(2, 2, sourceColor);
	clipSvgRaster(image, [[fill([])]], noCharge);
	expect(image.pixels).toEqual(new Uint8Array(16));
});

it.each(["nonzero", "evenodd"] as const)(
	"preserves %s holes within individual fills",
	(fillRule) => {
		const image = createRaster(8, 8, sourceColor);
		clipSvgRaster(
			image,
			[[fill([rectangle(0, 0, 8, 8), rectangle(2, 2, 6, 6)], fillRule)]],
			noCharge,
		);
		expect(pixel(image, 1, 1)).toEqual(sourceColor);
		expect(pixel(image, 3, 3)).toEqual(
			fillRule === "evenodd" ? transparent : sourceColor,
		);
	},
);

it("honors opposite-winding holes for nonzero geometry", () => {
	const inner = rectangle(2, 2, 6, 6);
	const image = createRaster(8, 8, sourceColor);
	clipSvgRaster(
		image,
		[
			[
				fill([
					rectangle(0, 0, 8, 8),
					{ closed: true, points: [...inner.points].reverse() },
				]),
			],
		],
		noCharge,
	);
	expect(pixel(image, 1, 1)).toEqual(sourceColor);
	expect(pixel(image, 3, 3)).toEqual(transparent);
});

it("does not cancel oppositely wound shapes belonging to separate union fills", () => {
	const shape = rectangle(1, 1, 5, 5);
	const image = createRaster(6, 6, sourceColor);
	clipSvgRaster(
		image,
		[
			[
				fill([shape]),
				fill([{ closed: true, points: [...shape.points].reverse() }]),
			],
		],
		noCharge,
	);
	expect(pixel(image, 2, 2)).toEqual(sourceColor);
});

it("allows a second union fill to paint an island inside another fill's hole", () => {
	const image = createRaster(8, 8, sourceColor);
	clipSvgRaster(
		image,
		[
			[
				fill([rectangle(0, 0, 8, 8), rectangle(2, 2, 6, 6)], "evenodd"),
				box(3, 3, 5, 5),
			],
		],
		noCharge,
	);
	expect(pixel(image, 1, 1)).toEqual(sourceColor);
	expect(pixel(image, 2, 2)).toEqual(transparent);
	expect(pixel(image, 3, 3)).toEqual(sourceColor);
});

it("clips against flattened curved geometry rather than its bounding box", () => {
	const contours = flattenSvgPath(
		parseSvgPath("M6 4A2 2 0 1 0 2 4A2 2 0 1 0 6 4Z", noCharge),
		noCharge,
		0.01,
	);
	const image = createRaster(8, 8, sourceColor);
	clipSvgRaster(image, [[fill(contours)]], noCharge);
	expect(pixel(image, 4, 4)).toEqual(sourceColor);
	expect(pixel(image, 5, 3)).toEqual(sourceColor);
	expect(pixel(image, 2, 2)).toEqual(transparent);
});

it("retains the native half-open pixel-center boundary rule", () => {
	const image = createRaster(3, 2, sourceColor);
	clipSvgRaster(image, [[box(0.5, 0.5, 1.5, 1.5)]], noCharge);
	expect(pixel(image, 0, 0)).toEqual(sourceColor);
	expect(pixel(image, 1, 0)).toEqual(transparent);
	expect(pixel(image, 0, 1)).toEqual(transparent);
});

it("implicitly closes open fill contours while ignoring move-only and line-only geometry", () => {
	const image = createRaster(5, 5, sourceColor);
	const shape = rectangle(1, 1, 4, 4);
	clipSvgRaster(
		image,
		[
			[
				fill([
					{ ...shape, closed: false },
					{ closed: false, points: [] },
					{ closed: false, points: [{ x: 0, y: 0 }] },
					{
						closed: false,
						points: [
							{ x: 0, y: 0 },
							{ x: 5, y: 5 },
						],
					},
				]),
			],
		],
		noCharge,
	);
	expect(pixel(image, 1, 1)).toEqual(sourceColor);
	expect(pixel(image, 0, 0)).toEqual(transparent);
});

it("preserves each nonzero source alpha exactly across repeated opaque mask intersections", () => {
	const image = createRaster(4, 1);
	image.pixels.set([
		9, 17, 25, 1, 80, 90, 100, 127, 150, 160, 170, 254, 200, 210, 220, 255,
	]);
	const original = image.pixels.slice();
	clipSvgRaster(
		image,
		Array.from({ length: 32 }, () => [box(0, 0, 4, 1)]),
		noCharge,
	);
	expect(image.pixels).toEqual(original);
});

it("clears unassociated RGB for zero-alpha pixels when a mask is applied", () => {
	const image = createRaster(3, 1, sourceColor);
	image.pixels.set([255, 100, 50, 0], 4);
	clipSvgRaster(image, [[box(0, 0, 2, 1)]], noCharge);
	expect(pixel(image, 0)).toEqual(sourceColor);
	expect(pixel(image, 1)).toEqual(transparent);
	expect(pixel(image, 2)).toEqual(transparent);
});

it("accepts frozen input geometry without mutating any contour or point", () => {
	const contour = rectangle(1, 1, 4, 4);
	const points = Object.freeze(
		contour.points.map((point) => Object.freeze({ ...point })),
	);
	const regions = Object.freeze([
		Object.freeze([
			Object.freeze(
				fill(Object.freeze([Object.freeze({ points, closed: true })])),
			),
		]),
	]);
	const original = JSON.stringify(regions);
	clipSvgRaster(createRaster(5, 5, sourceColor), regions, noCharge);
	expect(JSON.stringify(regions)).toBe(original);
});

it("snapshots checked geometry before any per-pixel work can mutate caller inputs", () => {
	const points = [
		{ x: 1, y: 1 },
		{ x: 3, y: 1 },
		{ x: 3, y: 3 },
		{ x: 1, y: 3 },
	];
	const image = createRaster(4, 4, sourceColor);
	let changed = false;
	clipSvgRaster(image, [[fill([{ closed: true, points }])]], (amount) => {
		if (amount === image.pixels.length && !changed) {
			changed = true;
			for (const point of points) point.x += 100;
		}
	});
	expect(changed).toBe(true);
	expect(pixel(image, 1, 1)).toEqual(sourceColor);
	expect(pixel(image, 0, 0)).toEqual(transparent);
});

it("accepts 64 regions but rejects a depth beyond that fixed limit", () => {
	const image = createRaster(1, 1, sourceColor);
	clipSvgRaster(
		image,
		Array.from({ length: 64 }, () => []),
		noCharge,
	);
	expect(pixel(image, 0)).toEqual(transparent);
	expect(() =>
		clipSvgRaster(
			image,
			Array.from({ length: 65 }, () => []),
			noCharge,
		),
	).toThrow(/region limit/);
});

it("preflights shape counts across regions rather than resetting the budget for each mask", () => {
	const empty = fill([]);
	const half = svgFillLimits.maxShapes / 2;
	const image = createRaster(1, 1, sourceColor);
	const original = image.pixels.slice();
	expect(() =>
		clipSvgRaster(
			image,
			[
				Array.from({ length: half }, () => empty),
				Array.from({ length: half + 1 }, () => empty),
			],
			noCharge,
		),
	).toThrow(/aggregate shape limit/);
	expect(image.pixels).toEqual(original);
});

it("preflights contour counts across distinct regions", () => {
	const empty: SvgContour = { closed: true, points: [] };
	const half = svgFillLimits.maxContours / 2;
	const image = createRaster(1, 1, sourceColor);
	expect(() =>
		clipSvgRaster(
			image,
			[
				[fill(Array.from({ length: half }, () => empty))],
				[fill(Array.from({ length: half + 1 }, () => empty))],
			],
			noCharge,
		),
	).toThrow(/aggregate contour limit/);
	expect(pixel(image, 0)).toEqual(sourceColor);
});

it("preflights the aggregate vertex budget for edge-heavy offscreen geometry", () => {
	const half = svgFillLimits.maxPoints / 2;
	const points = Array.from({ length: half }, (_unused, index) => ({
		x: 100,
		y: 100 + (index % 2),
	}));
	const image = createRaster(1, 1, sourceColor);
	expect(() =>
		clipSvgRaster(
			image,
			[
				[fill([{ closed: true, points }])],
				[fill([{ closed: true, points: [...points, { x: 100, y: 101 }] }])],
			],
			noCharge,
		),
	).toThrow(/aggregate (point|edge) limit/);
	expect(pixel(image, 0)).toEqual(sourceColor);
});

it("validates later geometry even if an earlier empty region makes the intersection empty", () => {
	const image = createRaster(1, 1, sourceColor);
	expect(() =>
		clipSvgRaster(
			image,
			[[], [fill([{ closed: true, points: [{ x: NaN, y: 0 }] }])]],
			noCharge,
		),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(pixel(image, 0)).toEqual(sourceColor);
});

it("preserves the existing input coordinate ceiling without imposing viewport clipping early", () => {
	const limit = svgFlattenLimits.maxCoordinate;
	const image = createRaster(2, 2, sourceColor);
	clipSvgRaster(image, [[box(-limit, -limit, limit, limit)]], noCharge);
	expect(pixel(image, 0)).toEqual(sourceColor);
	expect(() =>
		clipSvgRaster(image, [[box(0, 0, limit + 1, 1)]], noCharge),
	).toThrow(/coordinate limit/);
});

it.each(
	[
		null,
		{},
		[null],
		[[null]],
		[[{ contours: null, fillRule: "nonzero" }]],
		[[{ contours: [], fillRule: "positive" }]],
		[[{ contours: [{ points: [], closed: "yes" }], fillRule: "nonzero" }]],
		[[{ contours: [{ points: [null], closed: true }], fillRule: "nonzero" }]],
		[
			[
				{
					contours: [{ points: [{ x: "1", y: 0 }], closed: true }],
					fillRule: "nonzero",
				},
			],
		],
		[
			[
				{
					contours: [{ points: [{ x: Infinity, y: 0 }], closed: true }],
					fillRule: "nonzero",
				},
			],
		],
	].map((regions) => ({ regions })),
)("rejects malformed clip geometry %j", ({ regions }) => {
	expect(() =>
		clipSvgRaster(
			createRaster(1, 1),
			regions as unknown as readonly SvgClipRegion[],
			noCharge,
		),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it.each(["color", "stroke", "opacity"])(
	"does not accept paint input %s on a geometry-only fill",
	(name) => {
		const region = [{ ...box(0, 0, 1, 1), [name]: 0.5 }];
		expect(() => clipSvgRaster(createRaster(1, 1), [region], noCharge)).toThrow(
			/geometry only/,
		);
	},
);

it.each([
	null,
	{ width: 0, height: 1, pixels: new Uint8Array(0) },
	{ width: 1.5, height: 1, pixels: new Uint8Array(6) },
	{ width: 1, height: 1, pixels: new Uint8Array(3) },
	{ width: 1, height: 1, pixels: [0, 0, 0, 0] },
])("validates the source raster even when clipping is absent: %j", (image) => {
	expect(() =>
		clipSvgRaster(image as unknown as RasterImage, [], noCharge),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it("retains the existing raster dimension and pixel ceilings", () => {
	for (const [width, height] of [
		[rasterLimits.maxDimension + 1, 1],
		[rasterLimits.maxDimension, rasterLimits.maxDimension],
	])
		expect(() =>
			clipSvgRaster({ width, height, pixels: new Uint8Array(0) }, [], noCharge),
		).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("rejects a missing work owner before invoking geometry or raster operations", () => {
	expect(() =>
		clipSvgRaster(
			createRaster(1, 1),
			[],
			undefined as unknown as (amount: number) => void,
		),
	).toThrow(/work owner/);
});

it("charges the per-pixel application pass before allocating its mask", () => {
	const image = createRaster(4, 4, sourceColor);
	const error = new AgentBrowserError("resource-limit", "owned clip budget");
	const charges: number[] = [];
	expect(() =>
		clipSvgRaster(image, [[box(1, 1, 3, 3)]], (amount) => {
			expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
			charges.push(amount);
			if (amount === image.pixels.length) throw error;
		}),
	).toThrow(error);
	expect(charges.at(-1)).toBe(64);
	expect(charges.length).toBeGreaterThan(1);
	expect(pixel(image, 0)).toEqual(sourceColor);
});

it("propagates native raster work errors unchanged", () => {
	const image = createRaster(4, 4, sourceColor);
	const error = new AgentBrowserError(
		"resource-limit",
		"native mask allocation budget",
	);
	let pixelPasses = 0;
	expect(() =>
		clipSvgRaster(image, [[box(1, 1, 3, 3)]], (amount) => {
			if (amount === image.pixels.length && ++pixelPasses === 2) throw error;
		}),
	).toThrow(error);
	expect(pixelPasses).toBe(2);
	expect(pixel(image, 0)).toEqual(sourceColor);
});

it("does not promise rollback when work is exhausted after an earlier region was applied", () => {
	const image = createRaster(4, 4, sourceColor);
	const error = new AgentBrowserError("resource-limit", "later clip budget");
	let pixelPasses = 0;
	expect(() =>
		clipSvgRaster(image, [[box(1, 1, 3, 3)], [box(0, 0, 4, 4)]], (amount) => {
			if (amount === image.pixels.length && ++pixelPasses === 3) throw error;
		}),
	).toThrow(error);
	expect(pixel(image, 0)).toEqual(transparent);
	expect(pixel(image, 1, 1)).toEqual(sourceColor);
});
