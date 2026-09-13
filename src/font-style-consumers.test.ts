import { afterEach, expect, it, vi } from "vitest";
import { bitmapFont, type BitmapFontWeight } from "./bitmap-font.js";
import { rasterizeControl, type SoftwareControl } from "./control-rendering.js";
import { initialPaintStyle } from "./css-paint.js";
import {
	disclosureMarkerText,
	rasterizeDisclosureMarker,
} from "./disclosure-marker.js";
import { AgentBrowserError } from "./errors.js";
import type { NativeFontStyle } from "./font-style.js";
import {
	describeImageAlternative,
	paintImageAlternative,
	rasterizeImageAlternative,
} from "./image-alternative.js";
import * as raster from "./raster.js";
import type { RasterImage, Rgba } from "./raster.js";

const unlimited = (_amount: number) => {};
const color: Rgba = [31, 113, 197, 193];
const weights = [400, 700] as const;
const slants = ["italic", "oblique"] as const;

afterEach(() => vi.restoreAllMocks());

function control(kind: SoftwareControl["kind"], text = "Ag"): SoftwareControl {
	return {
		kind,
		text,
		fontSize: 16,
		width: 200,
		height: 32,
		disabled: false,
		focused: false,
		checked: true,
		indeterminate: false,
		placeholder: false,
	};
}

function paintAlternative(
	style?: NativeFontStyle,
	weight: BitmapFontWeight = 400,
	charge = unlimited,
) {
	const image = raster.createRaster(40, 24);
	paintImageAlternative(
		image,
		describeImageAlternative("Ag", 16, unlimited),
		0,
		0,
		40,
		24,
		color,
		charge,
		weight,
		style,
	);
	return image;
}

const consumers = [
	{
		name: "control",
		render: (
			style?: NativeFontStyle,
			weight: BitmapFontWeight = 400,
			charge = unlimited,
		) =>
			rasterizeControl(
				control("button"),
				200,
				32,
				initialPaintStyle,
				charge,
				weight,
				style,
			),
	},
	{
		name: "marker",
		render: (
			style?: NativeFontStyle,
			weight: BitmapFontWeight = 400,
			charge = unlimited,
		) =>
			rasterizeDisclosureMarker(
				{ type: "decimal", ordinal: 12 },
				48,
				14,
				color,
				charge,
				weight,
				style,
			),
	},
	{
		name: "alternative raster",
		render: (
			style?: NativeFontStyle,
			weight: BitmapFontWeight = 400,
			charge = unlimited,
		) =>
			rasterizeImageAlternative(
				describeImageAlternative("Ag", 16, unlimited),
				40,
				24,
				color,
				charge,
				weight,
				style,
			),
	},
	{ name: "direct alternative", render: paintAlternative },
];

it.each(consumers)(
	"keeps default normal $name pixels and charges unchanged",
	({ render }) => {
		for (const weight of weights) {
			const implicitCharge = vi.fn();
			const explicitCharge = vi.fn();
			expect(render("normal", weight, explicitCharge)).toEqual(
				render(undefined, weight, implicitCharge),
			);
			expect(explicitCharge.mock.calls).toEqual(implicitCharge.mock.calls);
		}
	},
);

it.each(consumers)(
	"paints regular and bold slanted $name without changing dimensions",
	({ render }) => {
		for (const weight of weights) {
			const normal = render("normal", weight);
			const italic = render("italic", weight);
			expect(italic.width).toBe(normal.width);
			expect(italic.height).toBe(normal.height);
			expect(italic.pixels).not.toEqual(normal.pixels);
			expect(render("oblique", weight)).toEqual(italic);
		}
		expect(render("italic", 400).pixels).not.toEqual(
			render("italic", 700).pixels,
		);
	},
);

it.each(consumers)(
	"reserves extra slanted $name work before painting",
	({ render, name }) => {
		const normalCharge = vi.fn();
		const slantedCharge = vi.fn();
		render("normal", 400, normalCharge);
		render("italic", 400, slantedCharge);
		const sum = (calls: unknown[][]) =>
			calls.reduce((total, [amount]) => total + Number(amount), 0);
		expect(sum(slantedCharge.mock.calls)).toBeGreaterThan(
			sum(normalCharge.mock.calls),
		);
		const glyphPaint = vi.spyOn(raster, "paintBitmapGlyph");
		const rectanglePaint = vi.spyOn(raster, "paintRasterRect");
		const failure = new AgentBrowserError(
			"resource-limit",
			"Slanted ink work exhausted",
		);
		let calls = 0;
		expect(() =>
			render("italic", 400, () => {
				calls++;
				if (calls === (name === "direct alternative" ? 3 : 2)) throw failure;
			}),
		).toThrow(failure);
		expect(glyphPaint).not.toHaveBeenCalled();
		expect(rectanglePaint).not.toHaveBeenCalled();
	},
);

it.each(["button", "text", "textarea", "select", "file"] as const)(
	"forwards font styles to every %s label glyph",
	(kind) => {
		for (const weight of weights)
			for (const style of slants) {
				const paint = vi.spyOn(raster, "paintBitmapGlyph");
				rasterizeControl(
					control(kind),
					200,
					32,
					initialPaintStyle,
					unlimited,
					weight,
					style,
				);
				expect(paint).toHaveBeenCalled();
				for (const call of paint.mock.calls) {
					expect(call[6]).toBe(weight);
					expect(call[7]).toBe(style);
				}
				paint.mockRestore();
			}
	},
);

it.each(["checkbox", "radio"] as const)(
	"does not slant geometric %s controls",
	(kind) => {
		for (const weight of weights) {
			const normalCharge = vi.fn();
			const slantedCharge = vi.fn();
			const normal = rasterizeControl(
				control(kind, ""),
				20,
				20,
				initialPaintStyle,
				normalCharge,
				weight,
			);
			for (const style of slants) {
				slantedCharge.mockClear();
				expect(
					rasterizeControl(
						control(kind, ""),
						20,
						20,
						initialPaintStyle,
						slantedCharge,
						weight,
						style,
					),
				).toEqual(normal);
				expect(slantedCharge.mock.calls).toEqual(normalCharge.mock.calls);
			}
		}
	},
);

it.each(["disclosure-open", "disclosure-closed", "circle", "square", "disc"])(
	"does not slant geometric %s markers",
	(type) => {
		const normal = rasterizeDisclosureMarker(
			{ type },
			16,
			16,
			color,
			unlimited,
		);
		for (const style of slants)
			expect(
				rasterizeDisclosureMarker(
					{ type },
					16,
					16,
					color,
					unlimited,
					400,
					style,
				),
			).toEqual(normal);
	},
);

it.each(weights)(
	"matches core glyph painting for numeric marker weight %s",
	(weight) => {
		const marker = { type: "decimal-leading-zero", ordinal: -2 };
		const text = disclosureMarkerText(marker) as string;
		for (const style of slants) {
			const expected = raster.createRaster(text.length * 12, 14);
			for (let index = 0; index < text.length; index++)
				raster.paintBitmapGlyph(
					expected,
					text[index],
					index * 12,
					0,
					16,
					color,
					weight,
					style,
				);
			expect(
				rasterizeDisclosureMarker(
					marker,
					expected.width,
					expected.height,
					color,
					unlimited,
					weight,
					style,
				),
			).toEqual(expected);
		}
	},
);

function croppedGlyphs(
	width: number,
	height: number,
	text: string,
	fontSize: number,
	originX: number,
	originY: number,
	clipWidth: number,
	clipHeight: number,
	weight: BitmapFontWeight,
	style: NativeFontStyle,
): RasterImage {
	const image = raster.createRaster(width, height);
	const advance = (bitmapFont.advance * fontSize) / bitmapFont.unitsPerEm;
	let index = 0;
	for (const character of text) {
		raster.paintBitmapGlyph(
			image,
			character,
			originX + index * advance,
			originY,
			fontSize,
			color,
			weight,
			style,
		);
		index++;
	}
	for (let vertical = 0; vertical < height; vertical++)
		for (let horizontal = 0; horizontal < width; horizontal++)
			if (
				horizontal + 0.5 < originX ||
				horizontal + 0.5 >= originX + clipWidth ||
				vertical + 0.5 < originY ||
				vertical + 0.5 >= originY + clipHeight
			) {
				const offset = (vertical * width + horizontal) * 4;
				image.pixels.fill(0, offset, offset + 4);
			}
	return image;
}

it.each([0.75, 1.5, 8, 13.25, 32, 512])(
	"clips slanted alternative rasters at font size %s",
	(fontSize) => {
		for (const weight of weights)
			for (const style of slants) {
				const alternative = describeImageAlternative(
					"Mjg",
					fontSize,
					unlimited,
				);
				const actual = rasterizeImageAlternative(
					alternative,
					19.6,
					12.4,
					color,
					unlimited,
					weight,
					style,
				);
				expect(actual).toEqual(
					croppedGlyphs(
						20,
						13,
						alternative.text,
						fontSize,
						0,
						0,
						19.6,
						12.4,
						weight,
						style,
					),
				);
			}
	},
);

it.each([
	[0, 0, 12.4, 9.6, 8],
	[2.2, 1.6, 12.3, 10.1, 13.25],
	[-4.2, -3.6, 16.5, 13.1, 16],
	[-20, 0, 30, 32, 32],
	[-1000, 0, 1020, 16, 16],
] as const)(
	"matches core slanted ink under crop %s/%s/%s/%s/%s",
	(originX, originY, width, height, fontSize) => {
		const text = originX < -100 ? `${"M".repeat(90)}jg` : "Mjg";
		for (const weight of weights)
			for (const style of slants) {
				const image = raster.createRaster(28, 36);
				paintImageAlternative(
					image,
					describeImageAlternative(text, fontSize, unlimited),
					originX,
					originY,
					width,
					height,
					color,
					unlimited,
					weight,
					style,
				);
				expect(image).toEqual(
					croppedGlyphs(
						28,
						36,
						text,
						fontSize,
						originX,
						originY,
						width,
						height,
						weight,
						style,
					),
				);
			}
	},
);

it("retains slanted overhang when the upright glyph is entirely scrolled offscreen", () => {
	const alternative = describeImageAlternative("M", 32, unlimited);
	const normal = raster.createRaster(12, 32);
	const slanted = raster.createRaster(12, 32);
	paintImageAlternative(normal, alternative, -20, 0, 32, 32, color, unlimited);
	paintImageAlternative(
		slanted,
		alternative,
		-20,
		0,
		32,
		32,
		color,
		unlimited,
		400,
		"italic",
	);
	expect(normal.pixels.some((channel) => channel !== 0)).toBe(false);
	expect(slanted.pixels.some((channel) => channel !== 0)).toBe(true);
	expect(slanted).toEqual(
		croppedGlyphs(12, 32, "M", 32, -20, 0, 32, 32, 400, "italic"),
	);
});

it.each([null, "", 0, "ITALIC", "oblique 12deg", {}])(
	"rejects invalid style %j even for blank or geometric content",
	(invalid) => {
		const style = invalid as NativeFontStyle;
		const alternative = describeImageAlternative("", 0, unlimited);
		const charge = vi.fn();
		const image = raster.createRaster(1, 1);
		const operations = [
			() =>
				rasterizeControl(
					control("button", ""),
					20,
					20,
					initialPaintStyle,
					charge,
					400,
					style,
				),
			() =>
				rasterizeControl(
					control("checkbox", ""),
					20,
					20,
					initialPaintStyle,
					charge,
					400,
					style,
				),
			() =>
				rasterizeDisclosureMarker(
					{ type: "disc" },
					1,
					1,
					color,
					charge,
					400,
					style,
				),
			() =>
				rasterizeDisclosureMarker(
					{ type: "decimal", ordinal: 0 },
					0,
					0,
					color,
					charge,
					400,
					style,
				),
			() =>
				rasterizeImageAlternative(alternative, 0, 0, color, charge, 400, style),
			() =>
				paintImageAlternative(
					image,
					alternative,
					0,
					0,
					0,
					0,
					color,
					charge,
					400,
					style,
				),
		];
		for (const operation of operations)
			expect(operation).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		expect(charge).not.toHaveBeenCalled();
		expect([...image.pixels]).toEqual([0, 0, 0, 0]);
	},
);
