import { expect, it, vi } from "vitest";
import { bitmapFont, type BitmapFontWeight } from "./bitmap-font.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	describeImageAlternative,
	paintImageAlternative,
	rasterizeImageAlternative,
	type ImageAlternative,
} from "./image-alternative.js";
import { layoutValueLimits } from "./layout-values.js";
import * as raster from "./raster.js";
import type { RasterImage, Rgba } from "./raster.js";

const red: Rgba = [231, 17, 39, 255];
const transparent = [0, 0, 0, 0];
const unlimited = (_amount: number) => {};

function describe(text = "A", fontSize = 8) {
	return describeImageAlternative(text, fontSize, unlimited);
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

function expectError(operation: () => unknown, code: ErrorCode) {
	expect(operation).toThrow(AgentBrowserError);
	expect(operation).toThrow(expect.objectContaining({ code }));
}

it.each([
	[" \t\r\n\f A\t\tB \n C \r\f", "A B C", 30],
	["\t\n\f\r ", "", 1],
	["", "", 1],
	["\u00a0A\u00a0", "\u00a0A\u00a0", 18],
	["\vA\u2003\u2028\u2029\ufeff", "\vA\u2003\u2028\u2029\ufeff", 36],
	["A🙂中é", "A🙂中é", 24],
	["e\u0301", "e\u0301", 12],
	["\ud800X\udfff", "\ud800X\udfff", 18],
	["A\0B", "A\0B", 18],
] as const)(
	"normalizes only HTML ASCII whitespace in %j",
	(source, text, width) => {
		const alternative = describe(source);
		expect(alternative).toEqual({ text, fontSize: 8, width, height: 8 });
		expect(Object.isFrozen(alternative)).toBe(true);
	},
);

it.each([
	[0, 1, 1],
	[0.25, 1, 1],
	[1.5, 2.25, 1.5],
	[8, 12, 8],
	[bitmapFont.maxFontSize, 768, 512],
	[Number.MIN_VALUE, 1, 1],
] as const)(
	"measures code points at font size %s",
	(fontSize, width, height) => {
		expect(describe("A🙂", fontSize)).toEqual({
			text: "A🙂",
			fontSize,
			width,
			height,
		});
	},
);

it("charges the original UTF-16 source before normalization and iteration", () => {
	const source = " \t🙂 \r\n";
	const charge = vi.fn();
	describeImageAlternative(source, 8, charge);
	expect(charge).toHaveBeenCalledTimes(1);
	expect(charge.mock.calls[0][0]).toBeGreaterThanOrEqual(source.length * 2 + 1);
	const failure = new AgentBrowserError(
		"resource-limit",
		"Source budget exhausted",
	);
	const normalize = vi.spyOn(String.prototype, "replace");
	const iterate = vi.spyOn(String.prototype, Symbol.iterator);
	let caught: unknown;
	let normalizationCalls = -1;
	let iterationCalls = -1;
	try {
		try {
			describeImageAlternative(source, 8, () => {
				throw failure;
			});
		} catch (error) {
			caught = error;
		}
		normalizationCalls = normalize.mock.calls.length;
		iterationCalls = iterate.mock.calls.length;
	} finally {
		normalize.mockRestore();
		iterate.mockRestore();
	}
	expect(caught).toBe(failure);
	expect(normalizationCalls).toBe(0);
	expect(iterationCalls).toBe(0);
});

it.each(
	[null, undefined, 8, {}, ["A"], new String("A")].map((text) => ({ text })),
)("rejects non-string alternative $text", ({ text }) =>
	expectError(
		() => describeImageAlternative(text as string, 8, unlimited),
		"invalid-input",
	),
);

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, "8", null, undefined])(
	"rejects invalid font size %j",
	(fontSize) =>
		expectError(
			() => describeImageAlternative("A", fontSize as number, unlimited),
			"invalid-input",
		),
);

it("rejects oversized fonts and intrinsic measurements using existing ceilings", () => {
	expectError(
		() => describe("A", bitmapFont.maxFontSize + 1),
		"resource-limit",
	);
	expectError(
		() => describe("A", layoutValueLimits.maxAbsoluteLength + 1),
		"resource-limit",
	);
	const count = Math.floor(layoutValueLimits.maxAbsoluteLength / 384);
	expect(describe("A".repeat(count), 512).width).toBe(count * 384);
	expectError(() => describe("A".repeat(count + 1), 512), "resource-limit");
});

it("does not impose a new source-length cap", () => {
	const text = "🙂".repeat(70_000);
	expect(describe(text, 1)).toEqual({
		text,
		fontSize: 1,
		width: 52_500,
		height: 1,
	});
	expect(describe(" ".repeat(140_000))).toEqual({
		text: "",
		fontSize: 8,
		width: 1,
		height: 8,
	});
});

it("paints a top-left glyph with advance spacing and transparent background", () => {
	const image = rasterizeImageAlternative(describe(), 12, 10, red, unlimited);
	const rows = [
		".###........",
		"#...#.......",
		"#...#.......",
		"#####.......",
		"#...#.......",
		"#...#.......",
		"#...#.......",
		"............",
		"............",
		"............",
	];
	for (let row = 0; row < rows.length; row++)
		for (let column = 0; column < image.width; column++)
			expect(pixel(image, column, row)).toEqual(
				rows[row][column] === "#" ? red : transparent,
			);
	expect(Object.isFrozen(image)).toBe(true);
});

it.each([400, 700] as const)(
	"uses the registered %s face and Unicode glyph iteration",
	(weight) => {
		const alternative = describe("I🙂中e\u0301\ud800");
		const expected = raster.createRaster(36, 8);
		let origin = 0;
		for (const character of alternative.text) {
			raster.paintBitmapGlyph(expected, character, origin, 0, 8, red, weight);
			origin += 6;
		}
		expect(
			rasterizeImageAlternative(alternative, 36, 8, red, unlimited, weight),
		).toEqual(expected);
		const regular = rasterizeImageAlternative(
			describe("I"),
			6,
			8,
			red,
			unlimited,
		);
		const bold = rasterizeImageAlternative(
			describe("I"),
			6,
			8,
			red,
			unlimited,
			700,
		);
		expect(pixel(regular, 4, 0)).toEqual(transparent);
		expect(pixel(bold, 4, 0)).toEqual(red);
	},
);

it.each([0, 1, 128, 255])("preserves current color with alpha %s", (alpha) => {
	const color: Rgba = [19, 73, 151, alpha];
	const image = rasterizeImageAlternative(describe(), 6, 8, color, unlimited);
	expect(pixel(image, 1, 0)).toEqual(alpha ? color : transparent);
	expect(pixel(image, 0, 0)).toEqual(transparent);
});

it.each([0.25, 1.5, 7.5, bitmapFont.maxFontSize])(
	"paints at native fractional or maximum font size %s",
	(fontSize) => {
		const expected = raster.createRaster(11, 9);
		raster.paintBitmapGlyph(expected, "M", 0, 0, fontSize, red);
		expect(
			rasterizeImageAlternative(describe("M", fontSize), 11, 9, red, unlimited),
		).toEqual(expected);
	},
);

it("clips rather than stretches, wraps, or centers text in different target boxes", () => {
	const alternative = describe("AAA");
	const full = rasterizeImageAlternative(alternative, 30, 16, red, unlimited);
	const clipped = rasterizeImageAlternative(alternative, 8, 5, red, unlimited);
	for (let row = 0; row < clipped.height; row++)
		for (let column = 0; column < clipped.width; column++)
			expect(pixel(clipped, column, row)).toEqual(pixel(full, column, row));
	expect(pixel(full, 19, 0)).toEqual(transparent);
	expect(pixel(full, 1, 8)).toEqual(transparent);
	const widenedDescriptor = { ...alternative, width: 9000, height: 4000 };
	expect(
		rasterizeImageAlternative(widenedDescriptor, 30, 16, red, unlimited),
	).toEqual(full);
});

it.each([1.2, 1.5, 1.6, 2.01, 2.5])(
	"clips fractional target edges %s with native pixel-center coverage",
	(extent) => {
		const image = rasterizeImageAlternative(
			describe("M"),
			extent,
			extent,
			red,
			unlimited,
		);
		const reference = raster.createRaster(Math.ceil(extent), Math.ceil(extent));
		raster.paintBitmapGlyph(reference, "M", 0, 0, 8, red);
		expect([image.width, image.height]).toEqual([
			Math.ceil(extent),
			Math.ceil(extent),
		]);
		for (let row = 0; row < image.height; row++)
			for (let column = 0; column < image.width; column++)
				expect(pixel(image, column, row)).toEqual(
					column + 0.5 < extent && row + 0.5 < extent
						? pixel(reference, column, row)
						: transparent,
				);
	},
);

it.each([
	[0, 0, 8],
	[0, 8, 8],
	[8, 0, 8],
	[8, 8, 0],
	[0.4, 8, 8],
	[8, 0.4, 8],
	[8, 8, Number.MIN_VALUE],
] as const)(
	"has no ink for target %s x %s and font %s",
	(width, height, fontSize) => {
		const image = rasterizeImageAlternative(
			describe("A", fontSize),
			width,
			height,
			red,
			unlimited,
		);
		expect([image.width, image.height]).toEqual([
			Math.max(1, Math.ceil(width)),
			Math.max(1, Math.ceil(height)),
		]);
		expect(image.pixels.every((channel) => channel === 0)).toBe(true);
	},
);

it.each(["", " \t\n"])("keeps empty alternative %j transparent", (text) => {
	expect(
		rasterizeImageAlternative(
			describe(text),
			8,
			8,
			red,
			unlimited,
		).pixels.every((channel) => channel === 0),
	).toBe(true);
});

it.each([
	null,
	undefined,
	"A",
	[],
	{},
	{ text: 3, fontSize: 8, width: 1, height: 1 },
])("rejects malformed descriptor %j", (alternative) =>
	expectError(
		() =>
			rasterizeImageAlternative(
				alternative as unknown as ImageAlternative,
				1,
				1,
				red,
				unlimited,
			),
		"invalid-input",
	),
);

it.each(["fontSize", "width", "height"] as const)(
	"validates forged %s even for a zero-sized target",
	(field) => {
		for (const value of [
			-1,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"1",
			null,
			undefined,
		])
			expectError(
				() =>
					rasterizeImageAlternative(
						{ ...describe(), [field]: value } as ImageAlternative,
						0,
						0,
						red,
						unlimited,
					),
				"invalid-input",
			);
		for (const value of [
			layoutValueLimits.maxAbsoluteLength + 1,
			Number.MAX_VALUE,
		])
			expectError(
				() =>
					rasterizeImageAlternative(
						{ ...describe(), [field]: value },
						0,
						0,
						red,
						unlimited,
					),
				"resource-limit",
			);
	},
);

it("rejects forged subminimum intrinsic dimensions and fonts above the bitmap ceiling", () => {
	for (const field of ["width", "height"] as const)
		for (const value of [0, 0.5])
			expectError(
				() =>
					rasterizeImageAlternative(
						{ ...describe(), [field]: value },
						1,
						1,
						red,
						unlimited,
					),
				"invalid-input",
			);
	expectError(
		() =>
			rasterizeImageAlternative(
				{ ...describe(), fontSize: 513 },
				1,
				1,
				red,
				unlimited,
			),
		"resource-limit",
	);
});

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, "1", null, undefined])(
	"rejects invalid target dimension %j",
	(value) => {
		expectError(
			() =>
				rasterizeImageAlternative(
					describe(),
					value as number,
					1,
					red,
					unlimited,
				),
			"invalid-input",
		);
		expectError(
			() =>
				rasterizeImageAlternative(
					describe(),
					1,
					value as number,
					red,
					unlimited,
				),
			"invalid-input",
		);
	},
);

it.each([
	[4096.01, 1],
	[1, 4096.01],
	[2048.01, 2048],
	[4096, 4096],
	[layoutValueLimits.maxAbsoluteLength + 1, 1],
] as const)(
	"rejects oversized target %s x %s before charging or allocating",
	(width, height) => {
		const charge = vi.fn();
		expectError(
			() => rasterizeImageAlternative(describe(), width, height, red, charge),
			"resource-limit",
		);
		expect(charge).not.toHaveBeenCalled();
	},
);

it.each(
	[
		null,
		[],
		[0, 0, 0],
		[0, 0, 0, 0, 0],
		[0, 0, -1, 255],
		[256, 0, 0, 255],
		[0.5, 0, 0, 255],
		[0, Number.NaN, 0, 255],
		[0, 0, 0, Number.POSITIVE_INFINITY],
		["0", 0, 0, 255],
		new Array(4),
	].map((color) => ({ color })),
)("rejects invalid color $color even without ink", ({ color }) =>
	expectError(
		() =>
			rasterizeImageAlternative(
				describe("", 0),
				0,
				0,
				color as unknown as Rgba,
				unlimited,
			),
		"invalid-input",
	),
);

it.each([0, 100, 500, 900, "400", null, Number.NaN])(
	"rejects unregistered font weight %j even without ink",
	(weight) => {
		expectError(
			() =>
				rasterizeImageAlternative(
					describe("", 0),
					0,
					0,
					red,
					unlimited,
					weight as BitmapFontWeight,
				),
			"invalid-input",
		);
	},
);

it.each([null, undefined, 0, {}])(
	"rejects invalid charge owner %j",
	(charge) => {
		expectError(
			() => describeImageAlternative("A", 8, charge as typeof unlimited),
			"invalid-input",
		);
		expectError(
			() =>
				rasterizeImageAlternative(
					describe(),
					0,
					0,
					red,
					charge as typeof unlimited,
				),
			"invalid-input",
		);
	},
);

it.each([0, 6 * 8 * 4])(
	"fails budget %s before allocation, glyph iteration, or drawing",
	(budget) => {
		const alternative = describe();
		const allocation = vi.spyOn(raster, "createRaster");
		const paint = vi.spyOn(raster, "paintBitmapGlyph");
		const iterate = vi.spyOn(String.prototype, Symbol.iterator);
		const failure = new AgentBrowserError(
			"resource-limit",
			"Raster budget exhausted",
		);
		let spent = 0;
		let caught: unknown;
		let iterationCalls = -1;
		try {
			try {
				rasterizeImageAlternative(alternative, 6, 8, red, (amount) => {
					spent += amount;
					if (spent > budget) throw failure;
				});
			} catch (error) {
				caught = error;
			}
			iterationCalls = iterate.mock.calls.length;
			iterate.mockRestore();
			expect(caught).toBe(failure);
			expect(allocation).not.toHaveBeenCalled();
			expect(paint).not.toHaveBeenCalled();
			expect(iterationCalls).toBe(0);
		} finally {
			iterate.mockRestore();
			allocation.mockRestore();
			paint.mockRestore();
		}
	},
);

it("precharges accepted raster boundary allocations without making large buffers", () => {
	const failure = new AgentBrowserError(
		"resource-limit",
		"Allocation budget exhausted",
	);
	for (const [width, height] of [
		[4096, 1],
		[1, 4096],
		[2048, 2048],
	]) {
		const charge = vi.fn(() => {
			throw failure;
		});
		expect(() =>
			rasterizeImageAlternative(describe("", 0), width, height, red, charge),
		).toThrow(failure);
		expect(charge).toHaveBeenCalledWith(width * height * 4);
	}
});

it("bounds long alternatives by the visible prefix rather than silently truncating a budget", () => {
	const long = describe("A".repeat(140_000));
	const shortCharge = vi.fn();
	const expected = rasterizeImageAlternative(
		describe("AAA"),
		8,
		8,
		red,
		shortCharge,
	);
	const longCharge = vi.fn();
	const paint = vi.spyOn(raster, "paintBitmapGlyph");
	try {
		const actual = rasterizeImageAlternative(long, 8, 8, red, longCharge);
		expect(actual).toEqual(expected);
		expect(longCharge.mock.calls).toEqual(shortCharge.mock.calls);
		expect(paint).toHaveBeenCalledTimes(2);
	} finally {
		paint.mockRestore();
	}
});

it("budgets tiny-font work even when a forged descriptor understates intrinsic text size", () => {
	const alternative = {
		text: "A".repeat(10_000),
		fontSize: 0.0001,
		width: 1,
		height: 1,
	};
	const failure = new AgentBrowserError(
		"resource-limit",
		"Glyph budget exhausted",
	);
	const charge = vi.fn((amount: number) => {
		if (amount > 1000) throw failure;
	});
	expect(() =>
		rasterizeImageAlternative(alternative, 1, 1, red, charge),
	).toThrow(failure);
	expect(charge.mock.calls[1][0]).toBeGreaterThanOrEqual(
		alternative.text.length,
	);
});

it("snapshots caller-owned descriptors and colors before charging", () => {
	const alternative = { ...describe() };
	const color: [number, number, number, number] = [...red];
	const expected = rasterizeImageAlternative(describe(), 6, 8, red, unlimited);
	const image = rasterizeImageAlternative(alternative, 6, 8, color, () => {
		alternative.text = "M";
		alternative.fontSize = 512;
		alternative.width = Number.NaN;
		color.fill(0);
	});
	expect(image).toEqual(expected);
});

function directReference(
	alternative: ImageAlternative,
	originX: number,
	originY: number,
	width: number,
	height: number,
	color: Rgba,
	weight: BitmapFontWeight,
	background: Rgba,
) {
	const image = raster.createRaster(16, 12, background);
	let glyphIndex = 0;
	const advance =
		bitmapFont.advance * (alternative.fontSize / bitmapFont.unitsPerEm);
	for (const character of alternative.text) {
		raster.paintBitmapGlyph(
			image,
			character,
			originX + glyphIndex * advance,
			originY,
			alternative.fontSize,
			color,
			weight,
		);
		glyphIndex++;
	}
	for (let row = 0; row < image.height; row++)
		for (let column = 0; column < image.width; column++)
			if (
				column + 0.5 < originX ||
				column + 0.5 >= originX + width ||
				row + 0.5 < originY ||
				row + 0.5 >= originY + height
			)
				image.pixels.set(background, (row * image.width + column) * 4);
	return image;
}

it.each([
	[0, 0, 5.7, 6.7],
	[0.2, 0.35, 6.6, 7.2],
	[0.75, 0.75, 5.7, 6.7],
	[-0.8, -0.65, 8.1, 7.4],
	[-6.3, -1.25, 14.8, 12.1],
	[14.3, 9.4, 5.7, 6.7],
	[0.5, 0.5, 1, 1],
	[-0.25, 0.4, 0.6, 2],
	[0.25, 0.25, 5.25, 6.25],
] as const)(
	"directly paints native-size text at (%s,%s) clipped to %s x %s",
	(originX, originY, width, height) => {
		const color: Rgba = [173, 59, 227, 128];
		const background: Rgba = [3, 9, 21, 96];
		for (const fontSize of [7.5, 8])
			for (const weight of [400, 700] as const) {
				const alternative = describe("M🙂I", fontSize);
				const expected = directReference(
					alternative,
					originX,
					originY,
					width,
					height,
					color,
					weight,
					background,
				);
				const image = raster.createRaster(16, 12, background);
				paintImageAlternative(
					image,
					alternative,
					originX,
					originY,
					width,
					height,
					color,
					unlimited,
					weight,
				);
				expect(image).toEqual(expected);
			}
	},
);

it.each([0.25, 1.5, bitmapFont.maxFontSize])(
	"directly preserves font size %s at fractional origins",
	(fontSize) => {
		const alternative = describe("M", fontSize);
		const expected = directReference(
			alternative,
			0.2,
			-0.15,
			9.7,
			8.9,
			red,
			400,
			[0, 0, 0, 0],
		);
		const image = raster.createRaster(16, 12);
		paintImageAlternative(
			image,
			alternative,
			0.2,
			-0.15,
			9.7,
			8.9,
			red,
			unlimited,
		);
		expect(image).toEqual(expected);
	},
);

it("directly preserves foreground alpha, background pixels, and bold masks", () => {
	const background: Rgba = [20, 40, 60, 255];
	const image = raster.createRaster(8, 8, background);
	paintImageAlternative(
		image,
		describe("M"),
		0.25,
		0.25,
		1.3,
		1.3,
		[100, 150, 200, 128],
		unlimited,
	);
	expect(pixel(image, 0, 0)).toEqual([60, 95, 130, 255]);
	expect(pixel(image, 1, 0)).toEqual(background);
	expect(pixel(image, 0, 2)).toEqual(background);
	const regular = raster.createRaster(8, 8);
	const bold = raster.createRaster(8, 8);
	paintImageAlternative(
		regular,
		describe("I"),
		0.25,
		0.25,
		6.5,
		7.5,
		red,
		unlimited,
	);
	paintImageAlternative(
		bold,
		describe("I"),
		0.25,
		0.25,
		6.5,
		7.5,
		red,
		unlimited,
		700,
	);
	expect(pixel(regular, 4, 0)).toEqual(transparent);
	expect(pixel(bold, 4, 0)).toEqual(red);
});

it("direct paint agrees with standalone fractional-edge rasterization at the origin", () => {
	for (const extent of [0, 0.4, 1.2, 1.5, 1.6, 2.5, 5.7, 8.25]) {
		const alternative = describe("M🙂");
		const expected = rasterizeImageAlternative(
			alternative,
			extent,
			extent,
			red,
			unlimited,
			700,
		);
		const image = raster.createRaster(expected.width, expected.height);
		paintImageAlternative(
			image,
			alternative,
			0,
			0,
			extent,
			extent,
			red,
			unlimited,
			700,
		);
		expect(image).toEqual(expected);
	}
});

it.each([
	{
		text: "M",
		fontSize: 8,
		width: 0,
		height: 8,
		originX: 0,
		originY: 0,
		alpha: 255,
	},
	{
		text: "M",
		fontSize: 8,
		width: 8,
		height: 0,
		originX: 0,
		originY: 0,
		alpha: 255,
	},
	{
		text: "M",
		fontSize: 0,
		width: 8,
		height: 8,
		originX: 0,
		originY: 0,
		alpha: 255,
	},
	{
		text: "M",
		fontSize: Number.MIN_VALUE,
		width: 8,
		height: 8,
		originX: 0,
		originY: 0,
		alpha: 255,
	},
	{
		text: "",
		fontSize: 8,
		width: 8,
		height: 8,
		originX: 0,
		originY: 0,
		alpha: 255,
	},
	{
		text: "M",
		fontSize: 8,
		width: 8,
		height: 8,
		originX: 0,
		originY: 0,
		alpha: 0,
	},
	{
		text: "M",
		fontSize: 8,
		width: 8,
		height: 8,
		originX: 9,
		originY: 0,
		alpha: 255,
	},
	{
		text: "M",
		fontSize: 8,
		width: 8,
		height: 8,
		originX: -9,
		originY: 0,
		alpha: 255,
	},
	{
		text: "M",
		fontSize: 8,
		width: 8,
		height: 8,
		originX: 0,
		originY: 9,
		alpha: 255,
	},
	{
		text: "M",
		fontSize: 8,
		width: 8,
		height: 8,
		originX: 0,
		originY: -9,
		alpha: 255,
	},
])(
	"does not modify caller pixels for nonpainting direct input %j",
	({ text, fontSize, width, height, originX, originY, alpha }) => {
		const image = raster.createRaster(8, 8, [21, 43, 65, 87]);
		const before = image.pixels.slice();
		paintImageAlternative(
			image,
			describe(text, fontSize),
			originX,
			originY,
			width,
			height,
			[1, 2, 3, alpha],
			unlimited,
		);
		expect(image.pixels).toEqual(before);
	},
);

it("paints huge clipped content extents without creating or blitting a scratch raster", () => {
	const image = raster.createRaster(8, 8);
	const alternative = describe("M");
	const expected = raster.createRaster(8, 8);
	raster.paintBitmapGlyph(expected, "M", 0.25, 0.25, 8, red);
	const allocate = vi.spyOn(raster, "createRaster");
	const blit = vi.spyOn(raster, "paintRasterImage");
	const charge = vi.fn();
	try {
		paintImageAlternative(
			image,
			alternative,
			0.25,
			0.25,
			layoutValueLimits.maxAbsoluteLength - 0.25,
			layoutValueLimits.maxAbsoluteLength - 0.25,
			red,
			charge,
		);
		expect(image).toEqual(expected);
		expect(allocate).not.toHaveBeenCalled();
		expect(blit).not.toHaveBeenCalled();
		expect(
			charge.mock.calls.reduce((total, [amount]) => total + amount, 0),
		).toBeLessThan(10_000);
	} finally {
		allocate.mockRestore();
		blit.mockRestore();
	}
});

it("charges offscreen Unicode prefixes but draws only their visible suffix", () => {
	const prefixLength = 10_000;
	const alternative = describe(`${"🙂".repeat(prefixLength)}M`);
	const image = raster.createRaster(6, 8);
	const expected = raster.createRaster(6, 8);
	raster.paintBitmapGlyph(expected, "M", 0, 0, 8, red);
	const charge = vi.fn();
	const paint = vi.spyOn(raster, "paintRasterRect");
	try {
		paintImageAlternative(
			image,
			alternative,
			-prefixLength * 6,
			0,
			prefixLength * 6 + 6,
			8,
			red,
			charge,
		);
		expect(image).toEqual(expected);
		expect(charge.mock.calls[0][0]).toBeGreaterThanOrEqual(
			prefixLength * 2 + 1,
		);
		expect(paint.mock.calls.length).toBeGreaterThan(0);
		expect(paint.mock.calls.length).toBeLessThanOrEqual(
			bitmapFont.glyphWidth * bitmapFont.glyphHeight,
		);
	} finally {
		paint.mockRestore();
	}
});

it("precharges both traversal and cell work before iterating or modifying target pixels", () => {
	const alternative = describe(`${"🙂".repeat(1000)}M`);
	for (const failOn of [1, 2]) {
		const image = raster.createRaster(8, 8, [23, 45, 67, 89]);
		const before = image.pixels.slice();
		const failure = new AgentBrowserError(
			"resource-limit",
			"Direct paint budget exhausted",
		);
		const paint = vi.spyOn(raster, "paintRasterRect");
		const iterate = vi.spyOn(String.prototype, Symbol.iterator);
		let calls = 0;
		let caught: unknown;
		let iterationCalls = -1;
		try {
			try {
				paintImageAlternative(
					image,
					alternative,
					-6000.25,
					0.25,
					6010.5,
					7.5,
					red,
					() => {
						calls++;
						if (calls === failOn) throw failure;
					},
				);
			} catch (error) {
				caught = error;
			}
			iterationCalls = iterate.mock.calls.length;
			iterate.mockRestore();
			expect(caught).toBe(failure);
			expect(calls).toBe(failOn);
			expect(iterationCalls).toBe(0);
			expect(paint).not.toHaveBeenCalled();
			expect(image.pixels).toEqual(before);
		} finally {
			iterate.mockRestore();
			paint.mockRestore();
		}
	}
});

it("honors an exact direct work budget and fails one unit short without partial paint", () => {
	const alternative = describe("M🙂");
	const expected = raster.createRaster(8, 8);
	let required = 0;
	paintImageAlternative(
		expected,
		alternative,
		-0.25,
		0.25,
		8.1,
		7.1,
		red,
		(amount) => {
			required += amount;
		},
	);
	expect(required).toBeGreaterThan(0);
	for (const budget of [required, required - 1]) {
		const image = raster.createRaster(8, 8);
		const before = image.pixels.slice();
		let remaining = budget;
		const operation = () =>
			paintImageAlternative(
				image,
				alternative,
				-0.25,
				0.25,
				8.1,
				7.1,
				red,
				(amount) => {
					remaining -= amount;
					if (remaining < 0)
						throw new AgentBrowserError(
							"resource-limit",
							"Direct work exhausted",
						);
				},
			);
		if (budget === required) {
			operation();
			expect(image).toEqual(expected);
			expect(remaining).toBe(0);
		} else {
			expect(operation).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
			expect(image.pixels).toEqual(before);
		}
	}
});

it("rejects tiny-font prefix work before painting even for forged small intrinsic sizes", () => {
	const alternative = {
		text: "M".repeat(20_000),
		fontSize: 0.0001,
		width: 1,
		height: 1,
	};
	const image = raster.createRaster(1, 1, red);
	const before = image.pixels.slice();
	const failure = new AgentBrowserError(
		"resource-limit",
		"Prefix budget exhausted",
	);
	const charge = vi.fn((amount: number) => {
		if (amount > 1000) throw failure;
	});
	expect(() =>
		paintImageAlternative(image, alternative, -0.25, 0, 1.25, 1, red, charge),
	).toThrow(failure);
	expect(image.pixels).toEqual(before);
	expect(charge.mock.calls[0][0]).toBeGreaterThan(1000);
});

it.each(
	[
		null,
		undefined,
		{},
		[],
		{ width: 0, height: 1, pixels: new Uint8Array(4) },
		{ width: 1.5, height: 1, pixels: new Uint8Array(4) },
		{ width: 1, height: Number.NaN, pixels: new Uint8Array(4) },
		{ width: 1, height: 1, pixels: new Uint8Array(3) },
		{ width: 1, height: 1, pixels: [0, 0, 0, 0] },
		{ width: 1, height: 1, pixels: new Uint8ClampedArray(4) },
	].map((image) => ({ image })),
)("validates direct target $image even with no ink", ({ image }) => {
	expectError(
		() =>
			paintImageAlternative(
				image as RasterImage,
				describe("", 0),
				0,
				0,
				0,
				0,
				red,
				unlimited,
			),
		"invalid-input",
	);
});

it.each([
	[4097, 1],
	[2049, 2048],
] as const)(
	"rejects oversized direct raster %s x %s without allocating it",
	(width, height) => {
		const image = { width, height, pixels: new Uint8Array(0) };
		expectError(
			() =>
				paintImageAlternative(
					image,
					describe("", 0),
					0,
					0,
					0,
					0,
					red,
					unlimited,
				),
			"resource-limit",
		);
	},
);

it.each(["originX", "originY", "width", "height"] as const)(
	"validates direct %s and combined endpoints even without ink",
	(field) => {
		const image = raster.createRaster(1, 1, red);
		const before = image.pixels.slice();
		for (const value of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			"1",
			null,
			undefined,
		]) {
			const geometry = {
				originX: 0,
				originY: 0,
				width: 0,
				height: 0,
				[field]: value,
			};
			expectError(
				() =>
					paintImageAlternative(
						image,
						describe("", 0),
						geometry.originX as number,
						geometry.originY as number,
						geometry.width as number,
						geometry.height as number,
						red,
						unlimited,
					),
				"invalid-input",
			);
		}
		const geometry = {
			originX: 0,
			originY: 0,
			width: 0,
			height: 0,
			[field]: layoutValueLimits.maxAbsoluteLength + 1,
		};
		expectError(
			() =>
				paintImageAlternative(
					image,
					describe("", 0),
					geometry.originX,
					geometry.originY,
					geometry.width,
					geometry.height,
					red,
					unlimited,
				),
			"resource-limit",
		);
		for (const [originX, originY, width, height] of [
			[layoutValueLimits.maxAbsoluteLength, 0, 1, 0],
			[0, layoutValueLimits.maxAbsoluteLength, 0, 1],
		])
			expectError(
				() =>
					paintImageAlternative(
						image,
						describe("", 0),
						originX,
						originY,
						width,
						height,
						red,
						unlimited,
					),
				"resource-limit",
			);
		expect(image.pixels).toEqual(before);
	},
);

it("rejects negative direct content dimensions but allows signed offscreen origins", () => {
	const image = raster.createRaster(1, 1, red);
	for (const [width, height] of [
		[-1, 0],
		[0, -1],
	])
		expectError(
			() =>
				paintImageAlternative(
					image,
					describe(),
					0,
					0,
					width,
					height,
					red,
					unlimited,
				),
			"invalid-input",
		);
	paintImageAlternative(
		image,
		describe(),
		-layoutValueLimits.maxAbsoluteLength,
		-layoutValueLimits.maxAbsoluteLength,
		layoutValueLimits.maxAbsoluteLength,
		layoutValueLimits.maxAbsoluteLength,
		red,
		unlimited,
	);
	expect(pixel(image, 0, 0)).toEqual(red);
});

it("validates forged direct descriptors even with zero content extent", () => {
	const image = raster.createRaster(1, 1);
	for (const alternative of [
		null,
		undefined,
		[],
		{},
		{ ...describe(), text: 5 },
	])
		expectError(
			() =>
				paintImageAlternative(
					image,
					alternative as ImageAlternative,
					0,
					0,
					0,
					0,
					red,
					unlimited,
				),
			"invalid-input",
		);
	for (const field of ["fontSize", "width", "height"] as const) {
		for (const value of [
			-1,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"1",
			null,
			undefined,
		])
			expectError(
				() =>
					paintImageAlternative(
						image,
						{ ...describe(), [field]: value } as ImageAlternative,
						0,
						0,
						0,
						0,
						red,
						unlimited,
					),
				"invalid-input",
			);
		expectError(
			() =>
				paintImageAlternative(
					image,
					{ ...describe(), [field]: layoutValueLimits.maxAbsoluteLength + 1 },
					0,
					0,
					0,
					0,
					red,
					unlimited,
				),
			"resource-limit",
		);
	}
	for (const field of ["width", "height"] as const)
		for (const value of [0, 0.5])
			expectError(
				() =>
					paintImageAlternative(
						image,
						{ ...describe(), [field]: value },
						0,
						0,
						0,
						0,
						red,
						unlimited,
					),
				"invalid-input",
			);
	expectError(
		() =>
			paintImageAlternative(
				image,
				{ ...describe(), fontSize: 513 },
				0,
				0,
				0,
				0,
				red,
				unlimited,
			),
		"resource-limit",
	);
});

it("validates direct color, weight, and charge owner even with no ink", () => {
	const image = raster.createRaster(1, 1);
	for (const color of [
		null,
		[],
		new Array(4),
		[0, 0, 0],
		[0, 0, 0, 0, 0],
		[0, -1, 0, 255],
		[0, 0, 0, 256],
		[0.5, 0, 0, 255],
		[Number.NaN, 0, 0, 255],
		[0, 0, 0, Number.POSITIVE_INFINITY],
		["0", 0, 0, 255],
	])
		expectError(
			() =>
				paintImageAlternative(
					image,
					describe("", 0),
					0,
					0,
					0,
					0,
					color as unknown as Rgba,
					unlimited,
				),
			"invalid-input",
		);
	for (const weight of [0, 500, 900, null, "400", Number.NaN])
		expectError(
			() =>
				paintImageAlternative(
					image,
					describe("", 0),
					0,
					0,
					0,
					0,
					red,
					unlimited,
					weight as BitmapFontWeight,
				),
			"invalid-input",
		);
	for (const charge of [null, undefined, {}, 1])
		expectError(
			() =>
				paintImageAlternative(
					image,
					describe("", 0),
					0,
					0,
					0,
					0,
					red,
					charge as typeof unlimited,
				),
			"invalid-input",
		);
});

it("snapshots direct target geometry, descriptor, and color before invoking the budget owner", () => {
	const image = { ...raster.createRaster(8, 8) };
	const pixels = image.pixels;
	const alternative = { ...describe("M") };
	const color: [number, number, number, number] = [...red];
	const expected = raster.createRaster(8, 8);
	paintImageAlternative(
		expected,
		alternative,
		0.25,
		0.25,
		7.5,
		7.5,
		color,
		unlimited,
	);
	paintImageAlternative(image, alternative, 0.25, 0.25, 7.5, 7.5, color, () => {
		image.width = Number.NaN;
		image.height = 0;
		alternative.text = "I";
		alternative.fontSize = 0;
		alternative.width = Number.POSITIVE_INFINITY;
		color.fill(0);
	});
	expect(pixels).toEqual(expected.pixels);
});
