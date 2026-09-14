import { expect, it } from "vitest";
import {
	type BackgroundGeometry,
	backgroundAreas,
	paintBackgroundImage,
} from "./background-raster.js";
import {
	type BackgroundLayer,
	initialBackgroundValues,
} from "./css-background.js";
import { AgentBrowserError } from "./errors.js";
import type { DecodedImage } from "./image-decoder.js";
import { layoutValueLimits } from "./layout-values.js";
import {
	type RasterImage,
	type Rgba,
	createRaster,
	withRasterClips,
} from "./raster.js";
import { createRoundedBox } from "./rounded-box.js";

const red: Rgba = [255, 0, 0, 255];
const green: Rgba = [0, 255, 0, 255];
const clear: Rgba = [0, 0, 0, 0];

function geometry(width = 4, height = 4): BackgroundGeometry {
	return {
		x: 0,
		y: 0,
		width,
		height,
		borderTop: 0,
		borderRight: 0,
		borderBottom: 0,
		borderLeft: 0,
		paddingTop: 0,
		paddingRight: 0,
		paddingBottom: 0,
		paddingLeft: 0,
	};
}

function layer(overrides: Partial<BackgroundLayer> = {}): BackgroundLayer {
	return {
		...initialBackgroundValues,
		"background-image": 'url("memory.png")',
		"background-repeat": "no-repeat",
		...overrides,
	};
}

function stripes(): RasterImage {
	const image = createRaster(2, 1);
	image.pixels.set([...red, ...green]);
	return image;
}

function decoded(image = stripes()): Readonly<DecodedImage> {
	return {
		mediaType: "image/png",
		image,
		bitDepth: 8,
		colorType: 6,
		interlaced: false,
		ignoredAncillaryChunks: [],
		compressedBytes: 0,
		inflatedBytes: 0,
		work: 0,
	};
}

function budget(limit = 1_000_000) {
	let work = 0;
	return {
		charge(amount = 1) {
			expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
			work += amount;
			if (work > limit)
				throw new AgentBrowserError(
					"resource-limit",
					"Background work exhausted",
				);
		},
		used: () => work,
	};
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

function expectRows(image: RasterImage, rows: readonly string[]) {
	const colors: Record<string, Rgba> = { r: red, g: green, ".": clear };
	expect(rows.length).toBe(image.height);
	for (const row of rows) expect(row.length).toBe(image.width);
	expect([...image.pixels]).toEqual(
		rows.flatMap((row) => [...row].flatMap((value) => [...colors[value]])),
	);
}

function render(values: Partial<BackgroundLayer> = {}, width = 4, height = 4) {
	const image = createRaster(width, height);
	const work = budget();
	const count = paintBackgroundImage(
		image,
		decoded(),
		layer(values),
		geometry(width, height),
		work.charge,
	);
	return { image, count, work: work.used() };
}

it.each([
	["auto", ["rg..", "....", "....", "...."]],
	["auto auto", ["rg..", "....", "....", "...."]],
	["contain", ["rrgg", "rrgg", "....", "...."]],
	["cover", ["rrrr", "rrrr", "rrrr", "rrrr"]],
	["2px", ["rg..", "....", "....", "...."]],
	["50%", ["rg..", "....", "....", "...."]],
	["50% 75%", ["rg..", "rg..", "rg..", "...."]],
	["100% 100%", ["rrgg", "rrgg", "rrgg", "rrgg"]],
	["auto 50%", ["rrgg", "rrgg", "....", "...."]],
	["auto 4px", ["rrrr", "rrrr", "rrrr", "rrrr"]],
	["4px auto", ["rrgg", "rrgg", "....", "...."]],
] as const)(
	"paints %s sizing from the decoded intrinsic ratio",
	(size, rows) => {
		const result = render({ "background-size": size });
		expect(result.count).toBe(1);
		expectRows(result.image, rows);
	},
);

it.each(["0px", "0%", "0px 4px", "4px 0px", "auto 0%"])(
	"does not paint zero size %s",
	(size) => {
		const result = render({ "background-size": size });
		expect(result.count).toBe(0);
		expectRows(result.image, ["....", "....", "....", "...."]);
	},
);

it.each(["0% 0%", "50% 50%", "100% 100%"])(
	"does not paint empty border clipping areas at %s",
	(position) => {
		for (const dimensions of [geometry(0, 4), geometry(4, 0)]) {
			const image = createRaster(4, 4);
			expect(
				paintBackgroundImage(
					image,
					decoded(),
					layer({ "background-position": position }),
					dimensions,
					budget().charge,
				),
			).toBe(0);
			expectRows(image, ["....", "....", "....", "...."]);
		}
	},
);

it.each(["auto", "2px 1px"])(
	"paints %s from a zero-sized content origin into the border clip",
	(size) => {
		const image = createRaster(4, 4);
		const dimensions = {
			...geometry(),
			borderTop: 1,
			borderRight: 1,
			borderBottom: 1,
			borderLeft: 1,
			paddingTop: 1,
			paddingRight: 1,
			paddingBottom: 1,
			paddingLeft: 1,
		};
		const style = layer({
			"background-size": size,
			"background-origin": "content-box",
			"background-clip": "border-box",
		});
		expect(backgroundAreas(dimensions, style).positioning).toMatchObject({
			width: 0,
			height: 0,
		});
		expect(
			paintBackgroundImage(
				image,
				decoded(),
				style,
				dimensions,
				budget().charge,
			),
		).toBe(1);
		expectRows(image, ["....", "....", "..rg", "...."]);
		for (const fitted of ["contain", "cover"]) {
			image.pixels.fill(0);
			expect(
				paintBackgroundImage(
					image,
					decoded(),
					{ ...style, "background-size": fitted },
					dimensions,
					budget().charge,
				),
			).toBe(0);
			expectRows(image, ["....", "....", "....", "...."]);
		}
	},
);

it("uses remaining space for percentage positions, including negative cover space", () => {
	expectRows(
		render({ "background-size": "contain", "background-position": "50% 50%" })
			.image,
		["....", "rrgg", "rrgg", "...."],
	);
	expectRows(
		render({ "background-size": "cover", "background-position": "50% 50%" })
			.image,
		["rrgg", "rrgg", "rrgg", "rrgg"],
	);
	expectRows(render({ "background-position": "25% 100%" }, 6, 2).image, [
		"......",
		".rg...",
	]);
});

it.each(["right bottom", "bottom right", "100% 100%"])(
	"accepts normalized or keyword position %s",
	(position) => {
		expectRows(render({ "background-position": position }).image, [
			"....",
			"....",
			"....",
			"..rg",
		]);
	},
);

it("retains negative and fractional positions without rescaling clipped tiles", () => {
	expectRows(render({ "background-position": "-1px 0px" }, 4, 1).image, [
		"g...",
	]);
	expectRows(render({ "background-position": "0.5px 0px" }, 4, 1).image, [
		"rg..",
	]);
});

it.each([
	["repeat", ["rgrg", "rgrg", "rgrg"], 6],
	["repeat-x", ["rgrg", "....", "...."], 2],
	["repeat-y", ["rg..", "rg..", "rg.."], 3],
	["no-repeat", ["rg..", "....", "...."], 1],
	["repeat no-repeat", ["rgrg", "....", "...."], 2],
	["no-repeat repeat", ["rg..", "rg..", "rg.."], 3],
	["repeat repeat", ["rgrg", "rgrg", "rgrg"], 6],
	["no-repeat no-repeat", ["rg..", "....", "...."], 1],
] as const)("paints only visible %s tiles", (repeat, rows, count) => {
	const result = render({ "background-repeat": repeat }, 4, 3);
	expect(result.count).toBe(count);
	expectRows(result.image, rows);
});

it.each([
	"1px 1px",
	"-1px -1px",
	"-1000001px -1000001px",
	"1000001px 1000001px",
])("finds visible repeat indices directly from %s", (position) => {
	const result = render(
		{ "background-position": position, "background-repeat": "repeat" },
		4,
		3,
	);
	expect(result.count).toBe(9);
	expect(result.work).toBeLessThan(1000);
	expectRows(result.image, ["grgr", "grgr", "grgr"]);
});

it("skips fractional tiles without pixel centers", () => {
	const image = createRaster(2, 2);
	expect(
		paintBackgroundImage(
			image,
			decoded(createRaster(1, 1, red)),
			layer({
				"background-size": "0.25px 0.25px",
				"background-repeat": "repeat",
			}),
			geometry(2, 2),
			budget().charge,
		),
	).toBe(4);
	expectRows(image, ["rr", "rr"]);
});

it("derives border, padding and content areas with inset corner radii", () => {
	const dimensions = {
		...geometry(10, 12),
		x: -2,
		y: 3,
		borderTop: 1,
		borderRight: 2,
		borderBottom: 3,
		borderLeft: 1,
		paddingTop: 2,
		paddingRight: 1,
		paddingBottom: 1,
		paddingLeft: 2,
	};
	const outer = box(-2, 3, 10, 12, 4);
	const areas = backgroundAreas(
		dimensions,
		layer({
			"background-origin": "content-box",
			"background-clip": "padding-box",
		}),
		outer,
	);
	expect(areas.positioning).toMatchObject({ x: 1, y: 6, width: 4, height: 5 });
	expect(areas.clip).toMatchObject({ x: -1, y: 4, width: 7, height: 8 });
	expect(areas.positioning.radii[0]).toEqual({ horizontal: 1, vertical: 1 });
	expect(areas.clip.radii[0]).toEqual({ horizontal: 3, vertical: 3 });
	expect(
		backgroundAreas(
			dimensions,
			layer({ "background-origin": "border-box" }),
			outer,
		).positioning,
	).toBe(outer);
	expect(backgroundAreas(dimensions, layer()).positioning).toMatchObject({
		x: -1,
		y: 4,
		width: 7,
		height: 8,
	});
});

it.each([
	["border-box", ["rrrrrr", "rrrrrr", "rrrrrr", "rrrrrr", "rrrrrr", "rrrrrr"]],
	["padding-box", ["......", ".rrrr.", ".rrrr.", ".rrrr.", ".rrrr.", "......"]],
	["content-box", ["......", "......", "..rr..", "..rr..", "......", "......"]],
] as const)("clips repeated content-origin tiles to %s", (clip, rows) => {
	const image = createRaster(6, 6);
	const dimensions = {
		...geometry(6, 6),
		borderTop: 1,
		borderRight: 1,
		borderBottom: 1,
		borderLeft: 1,
		paddingTop: 1,
		paddingRight: 1,
		paddingBottom: 1,
		paddingLeft: 1,
	};
	paintBackgroundImage(
		image,
		decoded(createRaster(1, 1, red)),
		layer({
			"background-repeat": "repeat",
			"background-origin": "content-box",
			"background-clip": clip,
		}),
		dimensions,
		budget().charge,
	);
	expectRows(image, rows);
});

it("clips rounded borders and intersects an additional painting clip", () => {
	const image = createRaster(4, 4);
	const style = layer({ "background-size": "100% 100%" });
	const source = decoded(createRaster(1, 1, red));
	paintBackgroundImage(
		image,
		source,
		style,
		geometry(),
		budget().charge,
		box(0, 0, 4, 4, 2),
	);
	expectRows(image, [".rr.", "rrrr", "rrrr", ".rr."]);
	const clipped = createRaster(4, 4);
	paintBackgroundImage(
		clipped,
		source,
		style,
		geometry(),
		budget().charge,
		box(0, 0, 4, 4, 2),
		box(2, 0, 2, 4),
	);
	expectRows(clipped, ["..r.", "..rr", "..rr", "..r."]);
});

it("retains inherited overflow clips without mutating the parent's clip state", () => {
	const image = createRaster(4, 4);
	const work = budget();
	const parent = withRasterClips(
		image,
		[box(0, 0, 4, 4, 2), box(0, 0, 3, 4)],
		work.charge,
	);
	const style = layer({ "background-size": "100% 100%" });
	paintBackgroundImage(
		parent,
		decoded(createRaster(1, 1, red)),
		style,
		geometry(),
		work.charge,
		undefined,
		box(2, 0, 2, 4),
	);
	expectRows(image, ["..r.", "..r.", "..r.", "..r."]);
	paintBackgroundImage(
		parent,
		decoded(createRaster(1, 1, green)),
		style,
		geometry(),
		work.charge,
		undefined,
		box(0, 0, 1, 4),
	);
	expectRows(image, ["..r.", "g.r.", "g.r.", "..r."]);
});

it("replaces only the canvas clip while retaining root size, position and inherited clips", () => {
	const dimensions = { ...geometry(2, 2), x: 1, y: 1 };
	const style = layer({
		"background-size": "100% 100%",
		"background-repeat": "repeat",
	});
	const ordinary = createRaster(6, 4);
	paintBackgroundImage(
		ordinary,
		decoded(),
		style,
		dimensions,
		budget().charge,
		box(1, 1, 2, 2, 1),
		box(0, 0, 6, 4),
	);
	expectRows(ordinary, ["......", ".rg...", ".rg...", "......"]);
	const canvas = createRaster(6, 4);
	paintBackgroundImage(
		canvas,
		decoded(),
		style,
		dimensions,
		budget().charge,
		box(1, 1, 2, 2, 1),
		box(0, 0, 6, 4),
		true,
	);
	expectRows(canvas, ["grgrgr", "grgrgr", "grgrgr", "grgrgr"]);
	const inherited = createRaster(6, 4);
	const work = budget();
	paintBackgroundImage(
		withRasterClips(inherited, [box(0, 0, 1, 4)], work.charge),
		decoded(),
		style,
		dimensions,
		work.charge,
		undefined,
		box(0, 0, 6, 4),
		true,
	);
	expectRows(inherited, ["g.....", "g.....", "g.....", "g....."]);
});

it("uses the existing SVG raster but its separate intrinsic dimensions", () => {
	const source: DecodedImage = {
		mediaType: "image/svg+xml",
		image: stripes(),
		intrinsic: { width: 4, height: 2 },
		work: 0,
		sourceCodeUnits: 0,
		xmlNodes: 0,
		shapes: 0,
		presentation: "static-native-subset",
		ignoredMetadata: [],
	};
	const image = createRaster(4, 4);
	paintBackgroundImage(image, source, layer(), geometry(), budget().charge);
	expectRows(image, ["rrgg", "rrgg", "....", "...."]);
	image.pixels.fill(0);
	expect(
		paintBackgroundImage(
			image,
			{ ...source, intrinsic: { width: 0, height: 2 } },
			layer(),
			geometry(),
			budget().charge,
		),
	).toBe(0);
	expectRows(image, ["....", "....", "....", "...."]);
});

it("bounds giant image scan work by the raster without allocating a scaled source", () => {
	const image = createRaster(4, 3);
	const work = budget(500);
	expect(
		paintBackgroundImage(
			image,
			decoded(createRaster(1, 1, red)),
			layer({
				"background-size": "2000000px 2000000px",
				"background-position": "-1000000px -1000000px",
			}),
			geometry(4, 3),
			work.charge,
		),
	).toBe(1);
	expectRows(image, ["rrrr", "rrrr", "rrrr"]);
	expect(work.used()).toBeLessThan(500);
});

it.each([
	{ "background-size": "1e300px" },
	{ "background-size": "1e999%" },
	{ "background-size": "16777217px" },
	{ "background-position": "1e300% 0%" },
	{ "background-position": "16777216px 0px" },
	{ "background-size": "0.0001px 0.0001px", "background-repeat": "repeat" },
	{ "background-size": "1e-100px 1px", "background-repeat": "repeat" },
	{
		"background-position": `${"0".repeat(layoutValueLimits.maxLengthCodeUnits * 3)}px 0px`,
	},
])("fails huge sizes, ranges or values before painting: %j", (values) => {
	const image = createRaster(4, 4);
	expect(() =>
		paintBackgroundImage(
			image,
			decoded(),
			layer(values),
			geometry(),
			budget().charge,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expectRows(image, ["....", "....", "....", "...."]);
});

it.each([
	{ "background-size": "round" },
	{ "background-size": "calc(2px + 2px)" },
	{ "background-size": "contain auto" },
	{ "background-size": "1px 2px 3px" },
	{ "background-repeat": "space" },
	{ "background-repeat": "repeat-x repeat-y" },
	{ "background-position": "left right" },
	{ "background-position": "1em 0px" },
	{ "background-position": "top 1px left 1px" },
	{ "background-origin": "text" },
	{ "background-clip": "text" },
	{ "background-attachment": "fixed" },
	{ "background-attachment": "local" },
])("rejects unsupported placement values atomically: %j", (values) => {
	const image = createRaster(4, 4);
	expect(() =>
		paintBackgroundImage(
			image,
			decoded(),
			layer(values),
			geometry(),
			budget().charge,
		),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
	expectRows(image, ["....", "....", "....", "...."]);
});

it("rejects negative sizes and malformed geometry, rasters, clips and work owners", () => {
	const image = createRaster(4, 4);
	const source = decoded();
	expect(() =>
		paintBackgroundImage(
			image,
			source,
			layer({ "background-size": "-1px" }),
			geometry(),
			budget().charge,
		),
	).toThrow();
	expect(() =>
		paintBackgroundImage(
			image,
			source,
			layer(),
			{ ...geometry(), paddingLeft: -1 },
			budget().charge,
		),
	).toThrow();
	expect(() =>
		paintBackgroundImage(
			image,
			source,
			layer(),
			{ ...geometry(), x: Number.NaN },
			budget().charge,
		),
	).toThrow();
	expect(() =>
		paintBackgroundImage(
			image,
			decoded({ width: 2, height: 1, pixels: new Uint8Array(1) }),
			layer(),
			geometry(),
			budget().charge,
		),
	).toThrow();
	expect(() =>
		paintBackgroundImage(
			image,
			source,
			layer(),
			geometry(),
			budget().charge,
			undefined,
			{ ...box(0, 0, 4, 4), width: -1 },
		),
	).toThrow();
	expect(() =>
		paintBackgroundImage(
			image,
			source,
			layer(),
			geometry(),
			undefined as unknown as (amount?: number) => void,
		),
	).toThrow();
	expectRows(image, ["....", "....", "....", "...."]);
});

it("charges full scan and pixel work before a clipped tile can write", () => {
	const image = createRaster(4, 4);
	const charges: number[] = [];
	expect(() =>
		paintBackgroundImage(
			image,
			decoded(),
			layer({ "background-size": "100% 100%" }),
			geometry(),
			(amount = 1) => {
				charges.push(amount);
				expectRows(image, ["....", "....", "....", "...."]);
				if (amount === 4 * (2 + 4 * 4))
					throw new AgentBrowserError("resource-limit", "Scan work exhausted");
			},
			undefined,
			box(1, 1, 1, 1),
		),
	).toThrow("Scan work exhausted");
	expect(charges).toContain(72);
	expectRows(image, ["....", "....", "....", "...."]);
});

it("charges alias copies before calling the existing raster painter", () => {
	const image = createRaster(2, 1, red);
	expect(() =>
		paintBackgroundImage(
			image,
			decoded(image),
			layer(),
			geometry(2, 1),
			(amount = 1) => {
				expectRows(image, ["rr"]);
				if (amount === image.pixels.length)
					throw new AgentBrowserError("resource-limit", "Alias work exhausted");
			},
		),
	).toThrow("Alias work exhausted");
	expectRows(image, ["rr"]);
});

it("charges the complete tile range before entering paint loops", () => {
	const image = createRaster(100, 100);
	const work = budget(200);
	expect(() =>
		paintBackgroundImage(
			image,
			decoded(createRaster(1, 1, red)),
			layer({ "background-repeat": "repeat" }),
			geometry(100, 100),
			work.charge,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(work.used()).toBeGreaterThanOrEqual(10_000);
	expect(image.pixels.every((value) => value === 0)).toBe(true);
});

it("does not scan wholly offscreen no-repeat tiles or empty clips", () => {
	for (const position of ["1000000px 0px", "-1000000px 0px", "0px 1000000px"])
		expect(render({ "background-position": position }).count).toBe(0);
	expect(
		paintBackgroundImage(
			createRaster(4, 4),
			decoded(),
			layer({ "background-repeat": "repeat" }),
			geometry(),
			budget(200).charge,
			undefined,
			box(0, 0, 0, 4),
		),
	).toBe(0);
});
