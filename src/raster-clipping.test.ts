import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	createRaster,
	paintBitmapGlyph,
	paintRasterImage,
	paintRasterRect,
	rasterClipLimits,
	rasterLimits,
	type RasterImage,
	type Rgba,
	withRasterClips,
} from "./raster.js";
import {
	createRoundedBox,
	type RoundedBox,
	roundedBoxContains,
} from "./rounded-box.js";

const red = [255, 0, 0, 255] as const;
const blue = [0, 0, 255, 255] as const;
const clear = [0, 0, 0, 0] as const;

function box(
	originX: number,
	originY: number,
	width: number,
	height: number,
	radius = 0,
): Readonly<RoundedBox> {
	return createRoundedBox(originX, originY, width, height, [
		{ horizontal: radius, vertical: radius },
		{ horizontal: radius, vertical: radius },
		{ horizontal: radius, vertical: radius },
		{ horizontal: radius, vertical: radius },
	]);
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function mask(image: RasterImage) {
	return Array.from({ length: image.height }, (_value, row) =>
		Array.from({ length: image.width }, (_entry, column) =>
			image.pixels[(row * image.width + column) * 4 + 3] ? "#" : ".",
		).join(""),
	);
}

function expectMasked(
	actual: RasterImage,
	unclipped: RasterImage,
	before: RasterImage,
	clips: readonly RoundedBox[],
) {
	for (let row = 0; row < actual.height; row++)
		for (let column = 0; column < actual.width; column++) {
			const inside = clips.every((clip) =>
				roundedBoxContains(clip, column + 0.5, row + 0.5),
			);
			expect(pixel(actual, column, row)).toEqual(
				pixel(inside ? unclipped : before, column, row),
			);
		}
}

it("returns a frozen same-size wrapper sharing storage without exposing clip state", () => {
	const image = createRaster(4, 4);
	const view = withRasterClips(image, []);
	expect(view).not.toBe(image);
	expect(Object.isFrozen(view)).toBe(true);
	expect(Object.keys(view).sort()).toEqual(["height", "pixels", "width"]);
	expect(view.width).toBe(4);
	expect(view.height).toBe(4);
	expect(view.pixels).toBe(image.pixels);
	expect(() => Object.assign(view, { width: 8 })).toThrow();
	paintRasterRect(view, 0, 0, 4, 4, red);
	expect(pixel(image, 3, 3)).toEqual(red);
	image.pixels[0] = 17;
	expect(view.pixels[0]).toBe(17);
});

it("captures immutable clip coordinates, radii and array entries without freezing caller objects", () => {
	const image = createRaster(4, 4);
	const corner = { horizontal: 2, vertical: 2 };
	const clip = {
		x: 0,
		y: 0,
		width: 4,
		height: 4,
		radii: [corner, corner, corner, corner] as const,
	};
	const clips = [clip];
	const view = withRasterClips(image, clips);
	expect(Object.isFrozen(clip)).toBe(false);
	expect(Object.isFrozen(corner)).toBe(false);
	expect(Object.isFrozen(clips)).toBe(false);
	clip.x = 20;
	clip.width = 0;
	corner.horizontal = 0;
	corner.vertical = 0;
	clips.length = 0;
	paintRasterRect(view, 0, 0, 4, 4, red);
	expect(mask(image)).toEqual([".##.", "####", "####", ".##."]);
});

it("intersects inherited clips while leaving parents, siblings and raw destinations independent", () => {
	const image = createRaster(6, 4);
	const parent = withRasterClips(image, [box(1, 0, 4, 4)]);
	const child = withRasterClips(parent, [box(0, 1, 6, 2)]);
	const sibling = withRasterClips(parent, [box(4, 0, 2, 4)]);
	paintRasterRect(child, 0, 0, 6, 4, red);
	expect(mask(image)).toEqual(["......", ".####.", ".####.", "......"]);
	paintRasterRect(sibling, 0, 0, 6, 4, blue);
	expect(pixel(image, 4, 0)).toEqual(blue);
	expect(pixel(image, 5, 0)).toEqual(clear);
	paintRasterRect(parent, 0, 0, 6, 1, red);
	expect(pixel(image, 1, 0)).toEqual(red);
	paintRasterRect(image, 0, 0, 1, 1, blue);
	expect(pixel(child, 0, 0)).toEqual(blue);
});

it.each([
	{ clip: box(0.5, 0.5, 2, 2), rows: ["##..", "##..", "....", "...."] },
	{ clip: box(1.5, 0.5, 1, 2), rows: [".#..", ".#..", "....", "...."] },
	{ clip: box(-2, -1, 4, 3), rows: ["##..", "##..", "....", "...."] },
	{ clip: box(0, 0, 4, 4, 2), rows: [".##.", "####", "####", ".##."] },
])(
	"samples half-open clip edges at destination pixel centers: $clip",
	({ clip, rows }) => {
		const image = createRaster(4, 4);
		paintRasterRect(withRasterClips(image, [clip]), -10, -10, 30, 30, red);
		expect(mask(image)).toEqual(rows);
	},
);

it("matches existing optional clipping with four unequal elliptical corner radii", () => {
	const clip = createRoundedBox(-0.25, 0.75, 8.5, 7.25, [
		{ horizontal: 4, vertical: 2 },
		{ horizontal: 1, vertical: 3 },
		{ horizontal: 3, vertical: 1 },
		{ horizontal: 2, vertical: 4 },
	]);
	const expected = createRaster(8, 8, blue);
	const actual = createRaster(8, 8, blue);
	const color = [255, 0, 0, 128] as const;
	paintRasterRect(expected, 0, 0, 8, 8, color, clip);
	paintRasterRect(withRasterClips(actual, [clip]), 0, 0, 8, 8, color);
	expect(actual.pixels).toEqual(expected.pixels);
});

it.each(
	[
		[box(0, 0, 0, 4)],
		[box(0, 0, 4, 0)],
		[box(10, 10, 4, 4)],
		[box(-10, -10, 4, 4)],
		[box(0, 0, 1, 4), box(2, 0, 2, 4)],
		[box(0, 0, 4, 1), box(0, 2, 4, 2)],
	].map((clips) => ({ clips })),
)("leaves empty or disjoint intersections untouched: $clips", ({ clips }) => {
	const image = createRaster(4, 4, blue);
	const before = image.pixels.slice();
	const view = withRasterClips(image, clips);
	paintRasterRect(view, 0, 0, 4, 4, red);
	paintRasterImage(view, createRaster(1, 1, red), 0, 0, 4, 4);
	paintBitmapGlyph(view, "A", 0, 0, 8, red);
	expect(image.pixels).toEqual(before);
});

it.each(["rectangle", "image"])(
	"intersects inherited and own rounded clips while alpha blending a %s",
	(kind) => {
		const background = [0, 0, 255, 128] as const;
		const color = [255, 0, 0, 128] as const;
		const before = createRaster(8, 8, background);
		const expected = createRaster(8, 8, background);
		const actual = createRaster(8, 8, background);
		const ancestor = box(0, 0, 8, 8, 4);
		const child = box(2, 1, 6, 6, 1);
		const own = box(1, 2, 6, 6, 2);
		const view = withRasterClips(withRasterClips(actual, [ancestor]), [child]);
		if (kind === "rectangle") {
			paintRasterRect(expected, -0.5, -0.5, 10, 10, color);
			paintRasterRect(view, -0.5, -0.5, 10, 10, color, own);
		} else {
			const source = createRaster(1, 1, color);
			paintRasterImage(expected, source, -0.5, -0.5, 10, 10);
			paintRasterImage(view, source, -0.5, -0.5, 10, 10, own);
		}
		expectMasked(actual, expected, before, [ancestor, child, own]);
		expect(pixel(actual, 4, 3)).toEqual([170, 0, 85, 192]);
	},
);

it("preserves nearest-neighbor source coordinates when destination clips cut a scaled image", () => {
	const source = createRaster(2, 2);
	source.pixels.set([
		255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 0, 64,
	]);
	const before = createRaster(6, 6, blue);
	const expected = createRaster(6, 6, blue);
	const actual = createRaster(6, 6, blue);
	const clips = [box(1.5, 0.5, 4, 5, 1), box(0, 2, 5, 4)];
	paintRasterImage(expected, source, -1, -0.5, 8, 7);
	paintRasterImage(withRasterClips(actual, clips), source, -1, -0.5, 8, 7);
	expectMasked(actual, expected, before, clips);
});

it("treats source clips as destination state rather than masking stored source pixels", () => {
	const source = createRaster(2, 2, red);
	const hiddenSource = withRasterClips(source, [box(0, 0, 0, 0)]);
	const target = createRaster(2, 2);
	paintRasterImage(target, hiddenSource, 0, 0, 2, 2);
	expect(target.pixels).toEqual(source.pixels);
});

it.each([128, 255])(
	"snapshots aliased source storage before clipped overlapping writes with alpha %s",
	(alpha) => {
		const image = createRaster(4, 1);
		image.pixels.set([
			255,
			0,
			0,
			alpha,
			0,
			255,
			0,
			alpha,
			0,
			0,
			255,
			alpha,
			255,
			255,
			255,
			alpha,
		]);
		const snapshot = createRaster(4, 1);
		snapshot.pixels.set(image.pixels);
		const expected = createRaster(4, 1);
		expected.pixels.set(image.pixels);
		const clip = box(1, 0, 2, 1);
		paintRasterImage(expected, snapshot, 1, 0, 4, 1, clip);
		const destination = withRasterClips(image, [clip]);
		const source = withRasterClips(image, [box(0, 0, 0, 0)]);
		paintRasterImage(destination, source, 1, 0, 4, 1);
		expect(image.pixels).toEqual(expected.pixels);
		expect(pixel(image, 0, 0)).toEqual(pixel(snapshot, 0, 0));
		expect(pixel(image, 3, 0)).toEqual(pixel(snapshot, 3, 0));
	},
);

it.each([
	["normal", 400],
	["normal", 700],
	["italic", 400],
	["italic", 700],
	["oblique", 400],
	["oblique", 700],
] as const)(
	"clips every bitmap glyph fill path for %s weight %s",
	(style, weight) => {
		const background = [0, 0, 255, 128] as const;
		const color = [255, 0, 0, 128] as const;
		const before = createRaster(16, 16, background);
		const expected = createRaster(16, 16, background);
		const actual = createRaster(16, 16, background);
		const clips = [box(0, 1, 10, 12, 3), box(2, 0, 10, 16)];
		expect(
			paintBitmapGlyph(expected, "A", -0.5, 0.5, 16, color, weight, style),
		).toBe(true);
		expect(
			paintBitmapGlyph(
				withRasterClips(actual, clips),
				"A",
				-0.5,
				0.5,
				16,
				color,
				weight,
				style,
			),
		).toBe(true);
		expectMasked(actual, expected, before, clips);
		expect(actual.pixels).not.toEqual(before.pixels);
		expect(actual.pixels).not.toEqual(expected.pixels);
	},
);

it("ignores forged public clip properties instead of trusting caller-provided state", () => {
	const image = createRaster(2, 2);
	const forged = { ...image, clips: [box(0, 0, 0, 0)] };
	paintRasterRect(withRasterClips(forged, []), 0, 0, 2, 2, red);
	expect(mask(image)).toEqual(["##", "##"]);
});

it.each([null, {}, 3, "clips", new Set()])(
	"rejects a non-array clip list %j",
	(clips) => {
		expect(() =>
			withRasterClips(createRaster(1, 1), clips as unknown as RoundedBox[]),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each([
	null,
	{},
	{ ...box(0, 0, 1, 1), x: Number.NaN },
	{ ...box(0, 0, 1, 1), y: Number.POSITIVE_INFINITY },
	{ ...box(0, 0, 1, 1), width: -1 },
	{ ...box(0, 0, 1, 1), height: "1" },
	{ ...box(0, 0, 1, 1), radii: [] },
	{ ...box(0, 0, 1, 1), radii: new Array(4) },
	{
		...box(0, 0, 1, 1),
		radii: Array(4).fill({ horizontal: -1, vertical: 0 }),
	},
	{
		...box(0, 0, 1, 1),
		radii: Array(4).fill({ horizontal: 0, vertical: Number.NaN }),
	},
])("rejects malformed clip geometry %j before exposing a view", (clip) => {
	const image = createRaster(2, 2, blue);
	const before = image.pixels.slice();
	expect(() => withRasterClips(image, [clip as RoundedBox])).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(image.pixels).toEqual(before);
});

it("rejects excessive geometry, dimensions, sparse clips and invalid charge callbacks", () => {
	const image = createRaster(1, 1);
	expect(() =>
		withRasterClips(image, [{ ...box(0, 0, 1, 1), x: 16_777_216 }]),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		withRasterClips({ width: 1, height: 4097, pixels: new Uint8Array() }, []),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		withRasterClips({ width: 2, height: 2, pixels: new Uint8Array(1) }, []),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(() => withRasterClips(image, new Array(1))).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() =>
		withRasterClips(image, [], 1 as unknown as (work: number) => void),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it("enforces the total inherited clip limit rather than only the newly appended list", () => {
	const image = createRaster(1, 1);
	const clip = box(0, 0, 1, 1);
	const parent = withRasterClips(
		image,
		Array.from({ length: rasterClipLimits.maxClips - 1 }, () => clip),
	);
	const limit = withRasterClips(parent, [clip]);
	paintRasterRect(withRasterClips(limit, []), 0, 0, 1, 1, red);
	expect(pixel(image, 0, 0)).toEqual(red);
	expect(() => withRasterClips(limit, [clip])).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() =>
		withRasterClips(image, new Array(rasterClipLimits.maxClips + 1)),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("supports the last integer row at the raster height limit", () => {
	const image = createRaster(1, rasterLimits.maxDimension);
	const last = rasterLimits.maxDimension - 1;
	const view = withRasterClips(image, [box(0, last, 1, 1)]);
	paintRasterRect(view, 0, last - 1, 1, 2, red);
	expect(pixel(image, 0, last - 1)).toEqual(clear);
	expect(pixel(image, 0, last)).toEqual(red);
});

it("charges construction and caches row intersections across rectangle and image writes", () => {
	let work = 0;
	const image = createRaster(3, 3);
	const view = withRasterClips(image, [box(0, 0, 3, 3)], (amount) => {
		expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
		work += amount;
	});
	expect(work).toBeGreaterThan(0);
	const construction = work;
	paintRasterRect(view, 0, 0, 3, 3, red);
	const firstPass = work - construction;
	const beforeSecond = work;
	paintRasterImage(view, createRaster(1, 1, blue), 0, 0, 3, 3);
	const secondPass = work - beforeSecond;
	expect(secondPass).toBeGreaterThan(0);
	expect(secondPass).toBeLessThan(firstPass);
	expect(pixel(image, 2, 2)).toEqual(blue);
});

it("inherits the work callback unless the new view supplies its own", () => {
	let parentWork = 0;
	let childWork = 0;
	const image = createRaster(1, 1);
	const clip = box(0, 0, 1, 1);
	const parent = withRasterClips(image, [clip], (amount) => {
		parentWork += amount;
	});
	const beforeInherited = parentWork;
	const inherited = withRasterClips(parent, [clip]);
	paintRasterRect(inherited, 0, 0, 1, 1, red);
	expect(parentWork).toBeGreaterThan(beforeInherited);
	const beforeOverride = parentWork;
	const child = withRasterClips(parent, [clip], (amount) => {
		childWork += amount;
	});
	paintRasterRect(child, 0, 0, 1, 1, blue);
	expect(childWork).toBeGreaterThan(0);
	expect(parentWork).toBe(beforeOverride);
});

it("charges cached empty spans and per-draw own clips without caching the latter", () => {
	let work = 0;
	const image = createRaster(3, 1);
	const view = withRasterClips(image, [box(0, 0, 3, 1)], (amount) => {
		work += amount;
	});
	paintRasterRect(view, 0, 0, 3, 1, red, box(0, 0, 1, 1));
	const first = work;
	paintRasterRect(view, 0, 0, 3, 1, blue, box(2, 0, 1, 1));
	expect(work).toBeGreaterThan(first);
	expect(pixel(image, 0, 0)).toEqual(red);
	expect(pixel(image, 1, 0)).toEqual(clear);
	expect(pixel(image, 2, 0)).toEqual(blue);
	const empty = withRasterClips(view, [box(0, 0, 0, 0)]);
	paintRasterRect(empty, 0, 0, 3, 1, red);
	const emptyFirst = work;
	paintRasterRect(empty, 0, 0, 3, 1, red);
	expect(work).toBeGreaterThan(emptyFirst);
	expect(pixel(image, 2, 0)).toEqual(blue);
});

it("propagates construction and uncached-span budget rejection before any pixel write", () => {
	const image = createRaster(2, 2, blue);
	const before = image.pixels.slice();
	const failure = new AgentBrowserError("resource-limit", "Clip work limit");
	expect(() =>
		withRasterClips(image, [], () => {
			throw failure;
		}),
	).toThrow(failure);
	let remaining = Number.POSITIVE_INFINITY;
	const charges: number[] = [];
	const view = withRasterClips(image, [box(0, 0, 2, 2)], (amount) => {
		charges.push(amount);
		if (amount > remaining) throw failure;
		remaining -= amount;
	});
	charges.length = 0;
	remaining = 2;
	expect(() => paintRasterRect(view, 0, 0, 2, 1, red)).toThrow(failure);
	expect(image.pixels).toEqual(before);
	const failedCharges = charges.slice();
	charges.length = 0;
	remaining = Number.POSITIVE_INFINITY;
	paintRasterRect(view, 0, 0, 2, 1, red);
	expect(charges).toEqual(failedCharges);
	expect(pixel(image, 0, 0)).toEqual(red);
	expect(pixel(image, 0, 1)).toEqual(blue);
	remaining = 0;
	const painted = image.pixels.slice();
	expect(() =>
		paintRasterImage(view, createRaster(1, 1, blue), 0, 0, 2, 1),
	).toThrow(failure);
	expect(image.pixels).toEqual(painted);
});

it("stops before the next row when a work budget expires after an earlier row was painted", () => {
	let remaining = Number.POSITIVE_INFINITY;
	const image = createRaster(1, 3);
	const view = withRasterClips(image, [box(0, 0, 1, 3)], (amount) => {
		if (amount > remaining)
			throw new AgentBrowserError("resource-limit", "Clip work limit");
		remaining -= amount;
	});
	remaining = 3;
	expect(() => paintRasterRect(view, 0, 0, 1, 3, red)).toThrow(
		"Clip work limit",
	);
	expect(mask(image)).toEqual(["#", ".", "."]);
});

it("keeps primitive input validation active even when destination clips exclude all pixels", () => {
	const image = createRaster(2, 2);
	const view = withRasterClips(image, [box(0, 0, 0, 0)]);
	expect(() => paintRasterRect(view, Number.NaN, 0, 1, 1, red)).toThrow();
	expect(() => paintRasterRect(view, 0, 0, -1, 1, red)).toThrow();
	expect(() =>
		paintRasterRect(view, 0, 0, 1, 1, [256, 0, 0, 255] as Rgba),
	).toThrow();
	expect(() =>
		paintRasterImage(
			view,
			{ width: 1, height: 1, pixels: new Uint8Array() },
			0,
			0,
			1,
			1,
		),
	).toThrow();
	expect(() => paintBitmapGlyph(view, "A", 0, 0, -1)).toThrow();
	expect(image.pixels.every((channel) => channel === 0)).toBe(true);
});
