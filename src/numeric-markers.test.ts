import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { bitmapFont } from "./bitmap-font.js";
import {
	computeListStyle,
	initialListStyle,
	markerTypes,
	parseListValue,
} from "./css-list.js";
import {
	type DisclosureMarker,
	disclosureMarkerExtent,
	disclosureMarkerText,
	rasterizeDisclosureMarker,
} from "./disclosure-marker.js";
import * as raster from "./raster.js";
import type { Rgba } from "./raster.js";

afterEach(() => vi.restoreAllMocks());

const symbolic = [
	[
		"disc",
		"0572f412e28618176ec2e7ce628825bcd471a57f80c9d87a645d148f5b257805",
		"f3d88632184c625931c67656e0879a706e4f23890d8f17ed0f0e419e5d9b66fb",
	],
	[
		"circle",
		"c63b415571cf7ad8fa27d1aed81df1125afd9d007961e8ef40ad80007fcef5eb",
		"a8755ade02434f5b62e32b4739a3bf9c53a2e610c850adf7bbefde103924ba92",
	],
	[
		"square",
		"bfea20b9d9440a4d517e26ded1228a9a43b40ca8ae241be2c3f515af33110694",
		"c468c8a1c4c98b6efaf311f77c420d95e68cb029388033e9c08da677811420e4",
	],
	[
		"disclosure-open",
		"8fd21d59aa7ec4ec7e89eadba3350e17e17d6f930f55a205d5bb637136fc5216",
		"b6749cc8b2d2f313e1e83c00540952bfecbb2c905ac3fc4e7a4b86299dd66657",
	],
	[
		"disclosure-closed",
		"9f8b2f640fa9594fe4b5a0ab9b70218903f3061e2ba6a75ba64a4133f2caac40",
		"25e03586b86bb701222054ad15a36850c4b1480891b19f5bcb47794afdc4cbf3",
	],
];
const color: Rgba = [17, 91, 203, 128];

function imageFor(marker: DisclosureMarker, fontSize = 8, ink: Rgba = color) {
	const extent = disclosureMarkerExtent(marker, fontSize);
	return rasterizeDisclosureMarker(
		marker,
		extent.width,
		extent.height,
		ink,
		() => {},
	);
}

it.each(symbolic)(
	"preserves the exact baseline %s pixels and work",
	(type, fullHash, fractionalHash) => {
		for (const [width, height, expected] of [
			[16, 14, fullHash],
			[13.25, 7.875, fractionalHash],
		] as const) {
			let work = 0;
			const image = rasterizeDisclosureMarker(
				{ type },
				width,
				height,
				color,
				(amount) => {
					work += amount;
				},
			);
			expect(createHash("sha256").update(image.pixels).digest("hex")).toBe(
				expected,
			);
			expect(work).toBe(Math.ceil(width) * Math.ceil(height) * 8);
		}
		expect(disclosureMarkerText({ type })).toBeUndefined();
		for (const fontSize of [0, 8, 10.5, 16, 512])
			expect(disclosureMarkerExtent({ type }, fontSize)).toEqual({
				width: fontSize,
				height: (fontSize * 7) / 8,
			});
	},
);

it.each(["decimal", "decimal-leading-zero"])(
	"accepts CSS marker type %s",
	(type) => {
		expect(parseListValue("list-style-type", type)).toBe(type);
		expect(markerTypes).toContain(type);
		expect(parseListValue("list-style-position", type)).toBeUndefined();
		const inherited = computeListStyle(
			{ "list-style-type": type },
			initialListStyle,
		);
		expect(inherited["list-style-type"]).toBe(type);
		expect(computeListStyle({ "list-style-type": "inherit" }, inherited)).toBe(
			inherited,
		);
		expect(
			computeListStyle({ "list-style-type": "initial" }, inherited)[
				"list-style-type"
			],
		).toBe("disc");
		expect(
			computeListStyle({ "list-style-type": "revert" }, inherited, {
				"list-style-type": "circle",
			})["list-style-type"],
		).toBe("circle");
	},
);

it.each(["decimal", "decimal-leading-zero"])(
	"paints the numeric marker type %s",
	(type) => {
		const marker = { type, ordinal: 1 };
		expect(() =>
			rasterizeDisclosureMarker(marker, 32, 7, [0, 0, 0, 255], () => {}),
		).not.toThrow();
	},
);

it.each([
	[0, "0. ", "00. "],
	[-0, "0. ", "00. "],
	[1, "1. ", "01. "],
	[9, "9. ", "09. "],
	[10, "10. ", "10. "],
	[99, "99. ", "99. "],
	[100, "100. ", "100. "],
	[-1, "-1. ", "-01. "],
	[-9, "-9. ", "-09. "],
	[-10, "-10. ", "-10. "],
	[Number.MAX_SAFE_INTEGER, "9007199254740991. ", "9007199254740991. "],
	[Number.MIN_SAFE_INTEGER, "-9007199254740991. ", "-9007199254740991. "],
] as const)(
	"formats ordinal %s with the exact suffix and numeric padding",
	(ordinal, decimal, padded) => {
		expect(disclosureMarkerText({ type: "decimal", ordinal })).toBe(decimal);
		expect(
			disclosureMarkerText({ type: "decimal-leading-zero", ordinal }),
		).toBe(padded);
		expect(Math.max(decimal.length, padded.length)).toBeLessThanOrEqual(19);
	},
);

it.each(["decimal", "decimal-leading-zero"])(
	"uses exact %s multi-digit advances and ascent height",
	(type) => {
		for (const ordinal of [
			-42,
			0,
			1,
			10,
			125,
			Number.MAX_SAFE_INTEGER,
			Number.MIN_SAFE_INTEGER,
		]) {
			const marker = Object.freeze({ type, ordinal });
			const text = disclosureMarkerText(marker);
			if (text === undefined) throw new Error("Missing numeric label");
			for (const fontSize of [8, 10.5, 16]) {
				const extent = disclosureMarkerExtent(marker, fontSize);
				expect(extent).toEqual({
					width: (text.length * fontSize * 6) / 8,
					height: (fontSize * 7) / 8,
				});
				expect(Object.isFrozen(extent)).toBe(true);
				const reference = raster.createRaster(
					Math.ceil(extent.width),
					Math.ceil(extent.height),
				);
				for (let index = 0; index < text.length; index++)
					raster.paintBitmapGlyph(
						reference,
						text[index],
						(index * fontSize * 6) / 8,
						0,
						fontSize,
						color,
					);
				expect(imageFor(marker, fontSize).pixels).toEqual(reference.pixels);
			}
			expect(marker).toEqual({ type, ordinal });
		}
	},
);

it("paints the actual one, minus and period bitmaps with transparent advance spacing", () => {
	const image = imageFor({ type: "decimal", ordinal: 1 });
	expect(image).toMatchObject({ width: 18, height: 7 });
	const pixel = (horizontal: number, vertical: number) => [
		...image.pixels.slice(
			(vertical * image.width + horizontal) * 4,
			(vertical * image.width + horizontal) * 4 + 4,
		),
	];
	const digit = [4, 12, 4, 4, 4, 4, 14];
	for (let row = 0; row < 7; row++)
		for (let column = 0; column < 18; column++) {
			const painted =
				(column < 5 && (digit[row] & (1 << (4 - column))) !== 0) ||
				(row === 6 && column === 8);
			expect(pixel(column, row)).toEqual(painted ? color : [0, 0, 0, 0]);
		}
	const negative = imageFor({ type: "decimal", ordinal: -1 });
	for (let column = 0; column < 5; column++)
		expect([
			...negative.pixels.slice(
				(3 * negative.width + column) * 4,
				(3 * negative.width + column) * 4 + 4,
			),
		]).toEqual(color);
	expect(imageFor({ type: "decimal-leading-zero", ordinal: 1 }).width).toBe(24);
});

it.each([0, 1, 128, 255])(
	"retains numeric ink alpha %i without painting the background",
	(alpha) => {
		const ink: Rgba = [231, 37, 91, alpha];
		const image = imageFor({ type: "decimal", ordinal: 1 }, 8, ink);
		const painted = [...image.pixels.slice(8, 12)];
		expect(painted).toEqual(alpha === 0 ? [0, 0, 0, 0] : ink);
		expect([...image.pixels.slice(-4)]).toEqual([0, 0, 0, 0]);
		if (alpha === 0)
			expect(image.pixels.every((value) => value === 0)).toBe(true);
	},
);

it("supports zero font size without drawing or allocating an unbounded label", () => {
	const marker = { type: "decimal-leading-zero", ordinal: -1 };
	expect(disclosureMarkerExtent(marker, 0)).toEqual({ width: 0, height: 0 });
	const image = imageFor(marker, 0);
	expect(image).toMatchObject({ width: 1, height: 1 });
	expect([...image.pixels]).toEqual([0, 0, 0, 0]);
});

it("allows numeric widths above the old symbol cap without raising global raster limits", () => {
	expect(raster.rasterLimits).toEqual({
		maxDimension: 4096,
		maxPixels: 4194304,
	});
	expect(bitmapFont.maxFontSize).toBe(512);
	const marker = { type: "decimal", ordinal: 1 };
	expect(disclosureMarkerExtent(marker, 512)).toEqual({
		width: 1152,
		height: 448,
	});
	expect(imageFor(marker, 512)).toMatchObject({ width: 1152, height: 448 });
	const wide = disclosureMarkerExtent(
		{ type: "decimal", ordinal: Number.MIN_SAFE_INTEGER },
		256,
	);
	expect(wide).toEqual({ width: 3648, height: 224 });
	expect(() =>
		disclosureMarkerExtent(
			{ type: "decimal", ordinal: Number.MIN_SAFE_INTEGER },
			288,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() => disclosureMarkerExtent(marker, 513)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const charge = vi.fn();
	expect(() =>
		rasterizeDisclosureMarker(marker, 4096.01, 7, color, charge),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		rasterizeDisclosureMarker(marker, 4096, 449, color, charge),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(charge).not.toHaveBeenCalled();
	expect(
		rasterizeDisclosureMarker(marker, 4096, 7, color, () => {}).width,
	).toBe(4096);
});

it("fails closed instead of truncating numeric labels or their suffix advances", () => {
	const marker = { type: "decimal", ordinal: -123 };
	const extent = disclosureMarkerExtent(marker, 8);
	const charge = vi.fn();
	expect(() =>
		rasterizeDisclosureMarker(
			marker,
			extent.width - 1,
			extent.height,
			color,
			charge,
		),
	).toThrow(/truncate/);
	expect(charge).not.toHaveBeenCalled();
	expect(
		rasterizeDisclosureMarker(
			marker,
			extent.width + 10,
			extent.height,
			color,
			() => {},
		).width,
	).toBe(extent.width + 10);
});

it("sizes and paints the same label without reading a changing ordinal twice", () => {
	let reads = 0;
	const marker = {
		type: "decimal",
		get ordinal() {
			return ++reads === 1 ? 123456 : 1;
		},
	};
	const charge = vi.fn();
	expect(() => rasterizeDisclosureMarker(marker, 18, 7, color, charge)).toThrow(
		/truncate/,
	);
	expect(reads).toBe(1);
	expect(charge).not.toHaveBeenCalled();
});

it("charges both rounded pixel work and glyph traversal before allocating or painting", () => {
	const marker = { type: "decimal", ordinal: -12 };
	const extent = disclosureMarkerExtent(marker, 10.5);
	const label = disclosureMarkerText(marker);
	if (label === undefined) throw new Error("Missing label");
	const required =
		Math.ceil(extent.width) * Math.ceil(extent.height) * 8 +
		label.length * 5 * 8;
	const charge = vi.fn();
	rasterizeDisclosureMarker(marker, extent.width, extent.height, color, charge);
	expect(charge.mock.calls).toEqual([[required]]);
	const allocate = vi.spyOn(raster, "createRaster");
	const paint = vi.spyOn(raster, "paintBitmapGlyph");
	const failure = new Error("Owner work budget exhausted");
	expect(() =>
		rasterizeDisclosureMarker(
			marker,
			extent.width,
			extent.height,
			color,
			(amount) => {
				if (amount > required - 1) throw failure;
			},
		),
	).toThrow(failure);
	expect(allocate).not.toHaveBeenCalled();
	expect(paint).not.toHaveBeenCalled();
	expect(() =>
		rasterizeDisclosureMarker(
			marker,
			extent.width,
			extent.height,
			color,
			(amount) => {
				if (amount > required) throw failure;
			},
		),
	).not.toThrow();
	expect(allocate).toHaveBeenCalledTimes(1);
	expect(paint).toHaveBeenCalledTimes(label.length);
});

it.each(symbolic)(
	"retains the existing %s raster ceiling and owner-budget failure",
	(type) => {
		const charge = vi.fn();
		expect(() =>
			rasterizeDisclosureMarker({ type }, 513, 14, color, charge),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(charge).not.toHaveBeenCalled();
		const failure = new Error("Symbolic owner work exhausted");
		expect(() =>
			rasterizeDisclosureMarker({ type }, 16, 14, color, () => {
				throw failure;
			}),
		).toThrow(failure);
	},
);

it.each([
	undefined,
	null,
	NaN,
	Infinity,
	-Infinity,
	0.5,
	-0.5,
	Number.MAX_SAFE_INTEGER + 1,
	Number.MIN_SAFE_INTEGER - 1,
	"1",
	{},
	1n,
])("rejects invalid ordinal %# without coercing it", (ordinal) => {
	for (const type of ["decimal", "decimal-leading-zero"]) {
		const marker = { type, ordinal } as DisclosureMarker;
		const charge = vi.fn();
		expect(() => disclosureMarkerText(marker)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(() => disclosureMarkerExtent(marker, 8)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(() =>
			rasterizeDisclosureMarker(marker, 32, 7, color, charge),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(charge).not.toHaveBeenCalled();
	}
});

it.each([null, undefined, "decimal", {}, { type: 1 }])(
	"rejects malformed marker %# clearly",
	(marker) => {
		expect(() =>
			disclosureMarkerText(marker as unknown as DisclosureMarker),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each([
	"none",
	"upper-roman",
	"lower-alpha",
	"symbols('*')",
	"DECIMAL",
	"url(image.png)",
])("does not synthesize the unsupported marker %s", (type) => {
	if (type !== "none")
		expect(parseListValue("list-style-type", type)).toBeUndefined();
	expect(() => disclosureMarkerText({ type, ordinal: 1 })).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() => disclosureMarkerExtent({ type, ordinal: 1 }, 8)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() =>
		rasterizeDisclosureMarker({ type, ordinal: 1 }, 32, 7, color, () => {}),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each([-1, NaN, Infinity, "8", null, undefined])(
	"rejects invalid font or numeric raster dimensions %#",
	(value) => {
		const marker = { type: "decimal", ordinal: 1 };
		expect(() => disclosureMarkerExtent(marker, value as number)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(() =>
			rasterizeDisclosureMarker(marker, value as number, 7, color, () => {}),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(() =>
			rasterizeDisclosureMarker(marker, 18, value as number, color, () => {}),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it("does not accept invalid RGBA as numeric glyph ink", () => {
	expect(() =>
		imageFor({ type: "decimal", ordinal: 1 }, 8, [0, 0, 0, 256]),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});
