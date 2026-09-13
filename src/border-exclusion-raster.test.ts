import { expect, it } from "vitest";
import {
	paintBorders as paintNativeBorders,
	paintSolidBorders,
} from "./border-raster.js";
import { initialPaintStyle, type PaintStyle } from "./css-paint.js";
import { AgentBrowserError } from "./errors.js";
import { createRaster, type RasterImage, type Rgba } from "./raster.js";

type BorderWidths = Parameters<typeof paintNativeBorders>[5];
type BorderStyles = Parameters<typeof paintNativeBorders>[7];
type BorderPaintExclusion = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;
const paintBorders: (
	image: RasterImage,
	originX: number,
	originY: number,
	width: number,
	height: number,
	borders: BorderWidths,
	paint: PaintStyle,
	styles: BorderStyles,
	charge: (work: number) => void,
	horizontalOffset?: number,
	exclusion?: BorderPaintExclusion,
) => number = paintNativeBorders;

const red: Rgba = [255, 0, 0, 255];
const transparent: Rgba = [0, 0, 0, 0];
const color: Rgba = [100, 50, 200, 128];
const dark: Rgba = [50, 25, 100, 128];
const light: Rgba = [177, 152, 227, 128];
const stylesByName: Record<string, BorderStyles> = {
	solid: {},
	dashed: {
		"border-top-style": "dashed",
		"border-right-style": "dashed",
		"border-bottom-style": "dashed",
		"border-left-style": "dashed",
	},
	groove: {
		"border-top-style": "groove",
		"border-right-style": "groove",
		"border-bottom-style": "groove",
		"border-left-style": "groove",
	},
	mixed: {
		"border-top-style": "dashed",
		"border-right-style": "groove",
	},
};

function uniformWidths(width: number): BorderWidths {
	return {
		borderTop: width,
		borderRight: width,
		borderBottom: width,
		borderLeft: width,
	};
}

function render(
	options: {
		image?: RasterImage;
		originX?: number;
		originY?: number;
		width?: number;
		height?: number;
		borders?: BorderWidths;
		paint?: PaintStyle;
		styles?: BorderStyles;
		horizontalOffset?: number;
		exclusion?: BorderPaintExclusion;
		charge?: (work: number) => void;
	} = {},
) {
	const image = options.image ?? createRaster(4, 4);
	const work: number[] = [];
	const pixels = paintBorders(
		image,
		options.originX ?? 0,
		options.originY ?? 0,
		options.width ?? image.width,
		options.height ?? image.height,
		options.borders ?? uniformWidths(1),
		options.paint ?? { ...initialPaintStyle, color: red },
		options.styles ?? {},
		(amount) => {
			work.push(amount);
			options.charge?.(amount);
		},
		options.horizontalOffset,
		options.exclusion,
	);
	return { image, pixels, work };
}

function pixel(image: RasterImage, column: number, row: number): number[] {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

function expectGrid(
	image: RasterImage,
	rows: readonly string[],
	palette: Readonly<Record<string, Rgba>> = { R: red, ".": transparent },
) {
	expect(rows).toHaveLength(image.height);
	for (const [row, symbols] of rows.entries()) {
		expect(symbols).toHaveLength(image.width);
		for (const [column, symbol] of [...symbols].entries())
			expect(pixel(image, column, row)).toEqual(palette[symbol]);
	}
}

it("excludes a solid top segment without changing corner ownership or alpha", () => {
	const result = render({
		paint: {
			...initialPaintStyle,
			color,
			"border-right-color": [0, 0, 255, 128],
			"border-bottom-color": [0, 128, 0, 128],
			"border-left-color": [255, 255, 0, 128],
		},
		exclusion: { x: 1, y: 0, width: 2, height: 1 },
	});
	expectGrid(result.image, ["T..T", "L..R", "L..R", "BBBR"], {
		T: color,
		R: [0, 0, 255, 128],
		B: [0, 128, 0, 128],
		L: [255, 255, 0, 128],
		".": transparent,
	});
	expect(result.pixels).toBe(10);
	expect(result.work).toEqual([224]);
});

it.each([
	{
		name: "top left",
		x: 0,
		y: 0,
		rows: [".RRR", "R..R", "R..R", "RRRR"],
	},
	{
		name: "top right",
		x: 3,
		y: 0,
		rows: ["RRR.", "R..R", "R..R", "RRRR"],
	},
	{
		name: "bottom left",
		x: 0,
		y: 3,
		rows: ["RRRR", "R..R", "R..R", ".RRR"],
	},
	{
		name: "bottom right",
		x: 3,
		y: 3,
		rows: ["RRRR", "R..R", "R..R", "RRR."],
	},
])("excludes the $name corner without neighboring-side fallback", (entry) => {
	const result = render({
		exclusion: { x: entry.x, y: entry.y, width: 1, height: 1 },
	});
	expectGrid(result.image, entry.rows);
	expect(result.pixels).toBe(11);
	expect(result.work).toEqual([224]);
});

it.each([
	{
		name: "solid",
		base: 10,
		pixels: 12,
		rows: ["RRRR", "R..R", "R..R", "RRRR"],
	},
	{
		name: "dashed",
		base: 16,
		pixels: 10,
		rows: ["RRR.", "R..R", "R..R", "RRR."],
	},
	{
		name: "groove",
		base: 14,
		pixels: 12,
		rows: ["DDDD", "D..L", "D..L", "LLLL"],
	},
])(
	"keeps $name empty/disjoint exclusions on the original work path",
	(entry) => {
		const exclusions: (BorderPaintExclusion | undefined)[] = [
			undefined,
			{ x: 0, y: 0, width: 0, height: 4 },
			{ x: 0, y: 0, width: 4, height: 0 },
			{ x: 4, y: 0, width: 2, height: 4 },
			{ x: 0, y: 4, width: 4, height: 2 },
			{ x: -2, y: 0, width: 2, height: 4 },
			{ x: 0, y: -2, width: 4, height: 2 },
			{ x: 0.6, y: 0, width: 0.3, height: 4 },
			{ x: 0, y: 0.6, width: 4, height: 0.3 },
		];
		for (const exclusion of exclusions) {
			const result = render({
				styles: stylesByName[entry.name],
				exclusion,
			});
			expectGrid(result.image, entry.rows, {
				R: red,
				D: [127, 0, 0, 255],
				L: [255, 127, 127, 255],
				".": transparent,
			});
			expect(result.pixels).toBe(entry.pixels);
			expect(result.work).toEqual([16 * entry.base]);
		}
	},
);

it.each([
	{ name: "solid", work: 224 },
	{ name: "dashed", work: 320 },
	{ name: "groove", work: 288 },
	{ name: "mixed", work: 384 },
])(
	"charges one clipped pass for full $name exclusion without writes",
	(entry) => {
		const image = createRaster(4, 4);
		image.pixels.set([17, 31, 73, 0, 90, 80, 70, 64]);
		image.pixels.set([11, 22, 33, 255], 60);
		const before = image.pixels.slice();
		const result = render({
			image,
			styles: stylesByName[entry.name],
			exclusion: { x: -1e12, y: -1e12, width: 2e12, height: 2e12 },
			charge: () => expect(image.pixels).toEqual(before),
		});
		expect(image.pixels).toEqual(before);
		expect(result.pixels).toBe(0);
		expect(result.work).toEqual([entry.work]);
	},
);

it("preserves nonuniform background bytes and composites only surviving pixels", () => {
	const image = createRaster(4, 1);
	image.pixels.set([
		0, 0, 200, 255, 13, 27, 39, 0, 90, 80, 70, 64, 0, 0, 200, 128,
	]);
	const result = render({
		image,
		borders: { ...uniformWidths(0), borderTop: 1 },
		paint: { ...initialPaintStyle, color: [200, 0, 0, 128] },
		exclusion: { x: 1, y: 0, width: 2, height: 1 },
	});
	expect([...image.pixels]).toEqual([
		100, 0, 100, 255, 13, 27, 39, 0, 90, 80, 70, 64, 134, 0, 66, 192,
	]);
	expect(result.pixels).toBe(2);
	expect(result.work).toEqual([56]);
});

it("keeps transparent side owners unpainted outside the exclusion", () => {
	const result = render({
		paint: {
			...initialPaintStyle,
			color: red,
			"border-top-color": transparent,
		},
		exclusion: { x: 0, y: 1, width: 1, height: 1 },
	});
	expectGrid(result.image, ["....", "...R", "R..R", "RRRR"]);
	expect(result.pixels).toBe(7);
	expect(result.work).toEqual([224]);
});

it.each([
	{
		exclusion: { x: 0.5, y: 0.5, width: 1, height: 1 },
		rows: [".RRR", "R..R", "R..R", "RRRR"],
		pixels: 11,
	},
	{
		exclusion: { x: -0.75, y: -0.75, width: 2.25, height: 2.25 },
		rows: [".RRR", "R..R", "R..R", "RRRR"],
		pixels: 11,
	},
	{
		exclusion: { x: 2.5, y: 2.5, width: 1, height: 1 },
		rows: ["RRRR", "R..R", "R..R", "RRRR"],
		pixels: 12,
	},
	{
		exclusion: { x: 1.5, y: 0.5, width: 2, height: 3 },
		rows: ["R..R", "R..R", "R..R", "RRRR"],
		pixels: 10,
	},
])("uses half-open pixel-center bounds for $exclusion", (entry) => {
	const result = render({ exclusion: entry.exclusion });
	expectGrid(result.image, entry.rows);
	expect(result.pixels).toBe(entry.pixels);
	expect(result.work).toEqual([224]);
});

it("clips negative fractional border and exclusion origins to the raster", () => {
	const result = render({
		originX: -0.75,
		originY: -0.75,
		width: 4,
		height: 4,
		borders: uniformWidths(1.5),
		exclusion: { x: -0.5, y: -0.5, width: 2, height: 2 },
	});
	expectGrid(result.image, [".RR.", "R.R.", "RRR.", "...."]);
	expect(result.pixels).toBe(7);
	expect(result.work).toEqual([126]);
});

it("keeps exclusion coordinates in raster space for a positive fractional origin", () => {
	const result = render({
		originX: 0.75,
		originY: 0.75,
		width: 3,
		height: 3,
		exclusion: { x: 1.5, y: 1.5, width: 1, height: 1 },
	});
	expectGrid(result.image, ["....", "..RR", ".R.R", ".RRR"]);
	expect(result.pixels).toBe(7);
	expect(result.work).toEqual([126]);
});

it.each([
	{ offset: 0, rows: ["R.....RRR...", "R.....RRR..."], pixels: 8 },
	{ offset: 2, rows: ["R....RR...RR", "R....RR...RR"], pixels: 10 },
	{ offset: -2, rows: ["........RRR.", "........RRR."], pixels: 6 },
])(
	"does not restart horizontal dash phase after a gap at offset $offset",
	(entry) => {
		const result = render({
			image: createRaster(12, 2),
			borders: { ...uniformWidths(0), borderTop: 1, borderBottom: 1 },
			styles: stylesByName.dashed,
			horizontalOffset: entry.offset,
			exclusion: { x: 1, y: 0, width: 4, height: 2 },
		});
		expectGrid(result.image, entry.rows);
		expect(result.pixels).toBe(entry.pixels);
		expect(result.work).toEqual([480]);
	},
);

it("preserves clipped vertical dash phase and ignores horizontal offsets", () => {
	const result = render({
		image: createRaster(2, 8),
		originY: -2.25,
		height: 12,
		borders: { ...uniformWidths(0), borderLeft: 1, borderRight: 1 },
		styles: stylesByName.dashed,
		horizontalOffset: 37,
		exclusion: { x: 0, y: 4, width: 1, height: 1 },
	});
	expectGrid(result.image, ["RR", "..", "..", "..", ".R", "RR", "RR", ".."]);
	expect(result.pixels).toBe(7);
	expect(result.work).toEqual([320]);
});

it("retains both groove shades and single alpha ownership around an exclusion", () => {
	const result = render({
		image: createRaster(6, 6),
		borders: uniformWidths(2),
		paint: { ...initialPaintStyle, color },
		styles: stylesByName.groove,
		exclusion: { x: 2, y: 0, width: 2, height: 2 },
	});
	expectGrid(
		result.image,
		["DD..DD", "DL..LL", "DL..DL", "DL..DL", "DDDDDL", "LLLLLL"],
		{ D: dark, L: light, ".": transparent },
	);
	expect(result.pixels).toBe(28);
	expect(result.work).toEqual([648]);
});

it("charges clipped area rather than huge offscreen border or exclusion extents", () => {
	const result = render({
		originX: -1e12,
		originY: -1e12,
		width: 2e12,
		height: 2e12,
		borders: uniformWidths(2e12),
		exclusion: { x: 1, y: 0, width: 2, height: 4 },
	});
	expectGrid(result.image, ["R..R", "R..R", "R..R", "R..R"]);
	expect(result.pixels).toBe(8);
	expect(result.work).toEqual([224]);
});

it("charges no extra exclusion work outside the clipped border bounds", () => {
	const result = render({
		width: 2,
		height: 2,
		exclusion: { x: 2, y: 0, width: 2, height: 4 },
	});
	expectGrid(result.image, ["RR..", "RR..", "....", "...."]);
	expect(result.pixels).toBe(4);
	expect(result.work).toEqual([40]);
	const offscreen = render({
		originX: -1e12,
		originY: -1e12,
		exclusion: { x: 0, y: 0, width: 4, height: 4 },
	});
	expectGrid(offscreen.image, ["....", "....", "....", "...."]);
	expect(offscreen.pixels).toBe(0);
	expect(offscreen.work).toEqual([0]);
});

it.each(["x", "y", "width", "height"] as const)(
	"rejects nonfinite exclusion %s before charging or mutation",
	(property) => {
		for (const value of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			const image = createRaster(4, 4, color);
			const before = image.pixels.slice();
			const work: number[] = [];
			expect(() =>
				render({
					image,
					exclusion: { x: 0, y: 0, width: 1, height: 1, [property]: value },
					charge: (amount) => work.push(amount),
				}),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
			expect(work).toEqual([]);
			expect(image.pixels).toEqual(before);
		}
	},
);

it.each([
	{ x: 0, y: 0, width: -1, height: 1 },
	{ x: 0, y: 0, width: 1, height: -1 },
	{ x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 1 },
	{ x: 0, y: Number.MAX_VALUE, width: 1, height: Number.MAX_VALUE },
])("rejects negative extents and overflowing endpoints for %j", (exclusion) => {
	for (const options of [
		{},
		{ borders: uniformWidths(0) },
		{ paint: { ...initialPaintStyle, color: transparent } },
		{ originX: 20, originY: 20 },
	]) {
		const image = createRaster(4, 4, color);
		const before = image.pixels.slice();
		const work: number[] = [];
		expect(() =>
			render({
				...options,
				image,
				exclusion,
				charge: (amount) => work.push(amount),
			}),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(work).toEqual([]);
		expect(image.pixels).toEqual(before);
	}
});

it.each([
	{ borders: uniformWidths(0) },
	{ paint: { ...initialPaintStyle, color: transparent } },
	{
		styles: {
			"border-top-style": "none",
			"border-right-style": "none",
			"border-bottom-style": "hidden",
			"border-left-style": "hidden",
		},
	},
])(
	"retains no-charge early returns with a valid exclusion for %j",
	(options) => {
		const result = render({
			...options,
			exclusion: { x: 0, y: 0, width: 4, height: 4 },
		});
		expectGrid(result.image, ["....", "....", "....", "...."]);
		expect(result.pixels).toBe(0);
		expect(result.work).toEqual([]);
	},
);

it.each([
	{ name: "solid", base: 10 },
	{ name: "dashed", base: 16 },
	{ name: "groove", base: 14 },
	{ name: "mixed", base: 20 },
])("admits all $name exclusion work before the first write", (entry) => {
	for (const exclusion of [
		{ x: 1, y: 0, width: 2, height: 1 },
		{ x: 0, y: 0, width: 4, height: 4 },
	]) {
		const image = createRaster(4, 4, color);
		const before = image.pixels.slice();
		const work: number[] = [];
		const failure = new AgentBrowserError(
			"resource-limit",
			"Border work limit exceeded",
		);
		expect(() =>
			render({
				image,
				styles: stylesByName[entry.name],
				exclusion,
				charge: (amount) => {
					work.push(amount);
					expect(image.pixels).toEqual(before);
					if (amount > 16 * entry.base) throw failure;
				},
			}),
		).toThrow(failure);
		expect(work).toEqual([16 * (entry.base + 4)]);
		expect(image.pixels).toEqual(before);
	}
});

it("keeps paintSolidBorders signature, pixels, count and work unchanged", () => {
	const image = createRaster(4, 4);
	const work: number[] = [];
	const pixels = paintSolidBorders(
		image,
		0,
		0,
		4,
		4,
		uniformWidths(1),
		{ ...initialPaintStyle, color: red },
		(amount) => work.push(amount),
	);
	expectGrid(image, ["RRRR", "R..R", "R..R", "RRRR"]);
	expect(pixels).toBe(12);
	expect(work).toEqual([160]);
});
