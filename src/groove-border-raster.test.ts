import { expect, it } from "vitest";
import { paintBorders } from "./border-raster.js";
import { initialPaintStyle, type PaintStyle } from "./css-paint.js";
import { AgentBrowserError } from "./errors.js";
import { createRaster, type RasterImage, type Rgba } from "./raster.js";

type BorderWidths = Parameters<typeof paintBorders>[5];
type BorderStyles = Parameters<typeof paintBorders>[7];

const color: Rgba = [101, 52, 203, 255];
const dark: Rgba = [50, 26, 101, 255];
const light: Rgba = [178, 153, 229, 255];
const transparent: Rgba = [0, 0, 0, 0];
const background: Rgba = [20, 40, 60, 255];
const groove: BorderStyles = {
	"border-top-style": "groove",
	"border-right-style": "groove",
	"border-bottom-style": "groove",
	"border-left-style": "groove",
};
const dashed: BorderStyles = {
	"border-top-style": "dashed",
	"border-right-style": "dashed",
	"border-bottom-style": "dashed",
	"border-left-style": "dashed",
};
const sidePaint: PaintStyle = {
	...initialPaintStyle,
	color,
	"border-right-color": [255, 0, 0, 255],
	"border-bottom-color": [0, 0, 255, 255],
	"border-left-color": [0, 128, 0, 255],
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
		charge?: (work: number) => void;
	} = {},
) {
	const image = options.image ?? createRaster(12, 12);
	const work: number[] = [];
	const pixels = paintBorders(
		image,
		options.originX ?? 0,
		options.originY ?? 0,
		options.width ?? image.width,
		options.height ?? image.height,
		options.borders ?? uniformWidths(2),
		options.paint ?? { ...initialPaintStyle, color },
		options.styles ?? groove,
		(amount) => {
			options.charge?.(amount);
			work.push(amount);
		},
		options.horizontalOffset,
	);
	return { image, pixels, work };
}

function pixel(image: RasterImage, column: number, row: number): number[] {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it("shades each native groove side using its own color or currentcolor fallback", () => {
	const { image, pixels, work } = render({
		borders: uniformWidths(4),
		paint: sidePaint,
	});
	expect(pixel(image, 5, 0)).toEqual(dark);
	expect(pixel(image, 5, 1)).toEqual(dark);
	expect(pixel(image, 5, 2)).toEqual(light);
	expect(pixel(image, 5, 3)).toEqual(light);
	expect(pixel(image, 11, 5)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 10, 5)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 9, 5)).toEqual([127, 0, 0, 255]);
	expect(pixel(image, 8, 5)).toEqual([127, 0, 0, 255]);
	expect(pixel(image, 5, 11)).toEqual([127, 127, 255, 255]);
	expect(pixel(image, 5, 10)).toEqual([127, 127, 255, 255]);
	expect(pixel(image, 5, 9)).toEqual([0, 0, 127, 255]);
	expect(pixel(image, 5, 8)).toEqual([0, 0, 127, 255]);
	expect(pixel(image, 0, 5)).toEqual([0, 64, 0, 255]);
	expect(pixel(image, 1, 5)).toEqual([0, 64, 0, 255]);
	expect(pixel(image, 2, 5)).toEqual([127, 191, 127, 255]);
	expect(pixel(image, 3, 5)).toEqual([127, 191, 127, 255]);
	expect(pixel(image, 5, 5)).toEqual(transparent);
	expect(pixels).toBe(128);
	expect(work).toEqual([12 * 12 * 14]);
});

it.each([
	{ width: 0.5, recessed: [], raised: [], pixels: 0 },
	{ width: 0.75, recessed: [light], raised: [dark], pixels: 44 },
	{ width: 1, recessed: [dark], raised: [light], pixels: 44 },
	{ width: 1.25, recessed: [dark], raised: [light], pixels: 44 },
	{ width: 2.5, recessed: [dark, light], raised: [light, dark], pixels: 80 },
	{
		width: 3,
		recessed: [dark, dark, light],
		raised: [light, light, dark],
		pixels: 108,
	},
])(
	"uses actual $width-wide bands with exact half-distance in the outer half",
	({ width, recessed, raised, pixels }) => {
		const result = render({ borders: uniformWidths(width) });
		for (let depth = 0; depth < 4; depth++) {
			expect(pixel(result.image, 5, depth)).toEqual(
				recessed[depth] ?? transparent,
			);
			expect(pixel(result.image, depth, 5)).toEqual(
				recessed[depth] ?? transparent,
			);
			expect(pixel(result.image, 11 - depth, 5)).toEqual(
				raised[depth] ?? transparent,
			);
			expect(pixel(result.image, 5, 11 - depth)).toEqual(
				raised[depth] ?? transparent,
			);
		}
		expect(result.pixels).toBe(pixels);
		expect(result.work).toEqual([12 * 12 * 14]);
	},
);

it("preserves fractional origins, widths and unsnapped half-distance boundaries", () => {
	const { image, pixels, work } = render({
		originX: 0.75,
		originY: 0.75,
		width: 8.5,
		height: 8.5,
		borders: {
			borderTop: 1.5,
			borderRight: 2.5,
			borderBottom: 0.75,
			borderLeft: 1.25,
		},
	});
	expect(pixel(image, 4, 1)).toEqual(dark);
	expect(pixel(image, 4, 2)).toEqual(transparent);
	expect(pixel(image, 8, 4)).toEqual(light);
	expect(pixel(image, 7, 4)).toEqual(dark);
	expect(pixel(image, 6, 4)).toEqual(transparent);
	expect(pixel(image, 1, 4)).toEqual(light);
	expect(pixel(image, 2, 4)).toEqual(transparent);
	expect(pixel(image, 4, 8)).toEqual(transparent);
	expect(pixel(image, 1, 1)).toEqual(dark);
	expect(pixel(image, 8, 1)).toEqual(light);
	expect(pixel(image, 0, 1)).toEqual(transparent);
	expect(pixel(image, 9, 4)).toEqual(transparent);
	expect(pixels).toBe(29);
	expect(work).toEqual([8 * 8 * 14]);
});

it("assigns asymmetric corners by normalized distance rather than raw distance", () => {
	const { image } = render({
		borders: { borderTop: 1, borderRight: 4, borderBottom: 2, borderLeft: 3 },
		paint: sidePaint,
	});
	expect(pixel(image, 0, 0)).toEqual([0, 64, 0, 255]);
	expect(pixel(image, 1, 0)).toEqual(dark);
	expect(pixel(image, 11, 0)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 9, 1)).toEqual([127, 0, 0, 255]);
	expect(pixel(image, 1, 10)).toEqual([0, 64, 0, 255]);
	expect(pixel(image, 2, 10)).toEqual([0, 0, 127, 255]);
	expect(pixel(image, 10, 10)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 9, 10)).toEqual([127, 0, 0, 255]);
});

it("resolves outer and inner corner ties top, right, bottom, left with one alpha write", () => {
	const { image, pixels } = render({
		image: createRaster(8, 8),
		borders: uniformWidths(3),
		paint: {
			...initialPaintStyle,
			color: [101, 52, 203, 128],
			"border-right-color": [255, 0, 0, 128],
			"border-bottom-color": [0, 0, 255, 128],
			"border-left-color": [0, 128, 0, 128],
		},
	});
	expect(pixel(image, 0, 0)).toEqual([50, 26, 101, 128]);
	expect(pixel(image, 7, 0)).toEqual([50, 26, 101, 128]);
	expect(pixel(image, 7, 7)).toEqual([255, 127, 127, 128]);
	expect(pixel(image, 0, 7)).toEqual([127, 127, 255, 128]);
	expect(pixel(image, 2, 2)).toEqual([178, 153, 229, 128]);
	expect(pixel(image, 5, 2)).toEqual([178, 153, 229, 128]);
	expect(pixel(image, 5, 5)).toEqual([127, 0, 0, 128]);
	expect(pixel(image, 2, 5)).toEqual([0, 0, 127, 128]);
	expect(pixel(image, 3, 3)).toEqual(transparent);
	expect(pixels).toBe(60);
	for (let offset = 3; offset < image.pixels.length; offset += 4)
		expect([0, 128]).toContain(image.pixels[offset]);
});

it("partitions fully overlapping borders once including a four-way half-distance tie", () => {
	const { image, pixels, work } = render({
		image: createRaster(3, 3),
		borders: uniformWidths(3),
		paint: {
			...initialPaintStyle,
			color: [101, 52, 203, 128],
			"border-right-color": [255, 0, 0, 128],
			"border-bottom-color": [0, 0, 255, 128],
			"border-left-color": [0, 128, 0, 128],
		},
	});
	const top: Rgba = [50, 26, 101, 128];
	const right: Rgba = [255, 127, 127, 128];
	const bottom: Rgba = [127, 127, 255, 128];
	const left: Rgba = [0, 64, 0, 128];
	expect([...image.pixels]).toEqual(
		[top, top, top, left, top, right, bottom, bottom, right].flat(),
	);
	expect(pixels).toBe(9);
	expect(work).toEqual([3 * 3 * 14]);
});

it.each([
	{
		alpha: 255,
		darkBlend: [35, 33, 81, 255],
		lightBlend: [99, 97, 145, 255],
	},
	{
		alpha: 128,
		darkBlend: [40, 31, 87, 192],
		lightBlend: [125, 115, 173, 192],
	},
])(
	"composites pre-shaded RGB once over destination alpha $alpha",
	({ alpha, darkBlend, lightBlend }) => {
		const backdrop: Rgba = [20, 40, 60, alpha];
		const { image, pixels } = render({
			image: createRaster(8, 8, backdrop),
			paint: { ...initialPaintStyle, color: [101, 52, 203, 128] },
		});
		expect(pixel(image, 0, 0)).toEqual(darkBlend);
		expect(pixel(image, 3, 0)).toEqual(darkBlend);
		expect(pixel(image, 3, 1)).toEqual(lightBlend);
		expect(pixel(image, 7, 7)).toEqual(lightBlend);
		expect(pixel(image, 6, 6)).toEqual(darkBlend);
		expect(pixel(image, 3, 3)).toEqual(backdrop);
		expect(pixels).toBe(48);
	},
);

it("keeps transparent groove owners transparent without borrowing neighboring colors", () => {
	const { image, pixels, work } = render({
		image: createRaster(8, 8, background),
		paint: {
			...initialPaintStyle,
			color,
			"border-top-color": [99, 121, 201, 0],
		},
	});
	expect(pixel(image, 0, 0)).toEqual(background);
	expect(pixel(image, 1, 1)).toEqual(background);
	expect(pixel(image, 7, 0)).toEqual(background);
	expect(pixel(image, 0, 2)).toEqual(dark);
	expect(pixel(image, 7, 1)).toEqual(light);
	expect(pixels).toBe(34);
	expect(work).toEqual([8 * 8 * 14]);
});

it("mixes groove, solid and dashed sides without changing solid pixels or dash gaps", () => {
	const borders = {
		borderTop: 2,
		borderRight: 2,
		borderBottom: 1,
		borderLeft: 2,
	};
	const styles: BorderStyles = {
		...groove,
		"border-right-style": "solid",
		"border-bottom-style": "dashed",
	};
	const paint: PaintStyle = {
		...initialPaintStyle,
		color,
		"border-right-color": [0, 0, 255, 255],
		"border-bottom-color": [255, 0, 0, 255],
	};
	const result = render({ borders, styles, paint });
	const baseline = render({
		borders,
		paint,
		styles: {
			...styles,
			"border-top-style": "solid",
			"border-left-style": "solid",
		},
	});
	expect(pixel(result.image, 5, 0)).toEqual(dark);
	expect(pixel(result.image, 5, 1)).toEqual(light);
	expect(pixel(result.image, 11, 5)).toEqual([0, 0, 255, 255]);
	expect(pixel(result.image, 10, 5)).toEqual([0, 0, 255, 255]);
	expect(pixel(result.image, 1, 11)).toEqual([255, 0, 0, 255]);
	expect(pixel(result.image, 4, 11)).toEqual(transparent);
	expect(pixel(result.image, 7, 11)).toEqual([255, 0, 0, 255]);
	expect(pixel(result.image, 10, 11)).toEqual(transparent);
	expect(pixel(result.image, 0, 11)).toEqual(dark);
	expect(pixel(result.image, 11, 11)).toEqual([0, 0, 255, 255]);
	for (let row = 2; row < 10; row++)
		for (const column of [10, 11])
			expect(pixel(result.image, column, row)).toEqual(
				pixel(baseline.image, column, row),
			);
	for (let column = 1; column < 11; column++)
		expect(pixel(result.image, column, 11)).toEqual(
			pixel(baseline.image, column, 11),
		);
	expect(result.work).toEqual([12 * 12 * 20]);
	expect(baseline.work).toEqual([12 * 12 * 16]);
});

it("does not let a groove neighbor fill a dashed corner owner's gap", () => {
	const { image } = render({
		image: createRaster(8, 8),
		styles: { ...groove, "border-top-style": "dashed" },
	});
	expect(pixel(image, 7, 0)).toEqual(transparent);
	expect(pixel(image, 6, 1)).toEqual(transparent);
	expect(pixel(image, 7, 1)).toEqual(light);
	expect(pixel(image, 6, 2)).toEqual(dark);
});

it("offsets only mixed horizontal dashes, not groove shades or vertical dash phase", () => {
	const styles: BorderStyles = {
		...groove,
		"border-right-style": "dashed",
		"border-bottom-style": "dashed",
	};
	const borders = {
		borderTop: 2,
		borderRight: 1,
		borderBottom: 1,
		borderLeft: 2,
	};
	for (const horizontalOffset of [-3, 3]) {
		const { image, work } = render({ styles, borders, horizontalOffset });
		expect(pixel(image, 5, 0)).toEqual(dark);
		expect(pixel(image, 5, 1)).toEqual(light);
		expect(pixel(image, 0, 5)).toEqual(dark);
		expect(pixel(image, 1, 5)).toEqual(light);
		expect(pixel(image, 1, 11)).toEqual(transparent);
		expect(pixel(image, 4, 11)).toEqual(color);
		expect(pixel(image, 11, 4)).toEqual(transparent);
		expect(pixel(image, 11, 7)).toEqual(color);
		expect(work).toEqual([12 * 12 * 20]);
	}
});

it("removes none and hidden sides from groove corner ownership", () => {
	const { image, work } = render({
		image: createRaster(8, 8),
		styles: {
			"border-top-style": "groove",
			"border-right-style": "solid",
			"border-bottom-style": "none",
			"border-left-style": "hidden",
		},
	});
	expect(pixel(image, 0, 0)).toEqual(dark);
	expect(pixel(image, 0, 1)).toEqual(light);
	expect(pixel(image, 0, 2)).toEqual(transparent);
	expect(pixel(image, 0, 7)).toEqual(transparent);
	expect(pixel(image, 7, 7)).toEqual(color);
	expect(work).toEqual([8 * 8 * 14]);
});

it.each([
	{ style: "solid", cost: 10, gap: color, pixels: 12 },
	{ style: "dashed", cost: 16, gap: transparent, pixels: 6 },
])(
	"does not activate groove charges for zero-width groove beside $style",
	({ style, cost, gap, pixels }) => {
		const result = render({
			borders: { ...uniformWidths(0), borderTop: 1 },
			styles: { ...groove, "border-top-style": style },
		});
		expect(pixel(result.image, 1, 0)).toEqual(color);
		expect(pixel(result.image, 4, 0)).toEqual(gap);
		expect(result.pixels).toBe(pixels);
		expect(result.work).toEqual([12 * 12 * cost]);
	},
);

it("does no work for all-transparent, all-zero-width or entirely disabled borders", () => {
	const cases = [
		{ paint: { ...initialPaintStyle, color: [99, 121, 201, 0] as Rgba } },
		{ borders: uniformWidths(0), styles: groove },
		{ borders: uniformWidths(0), styles: { "border-top-style": "unknown" } },
		{
			styles: {
				"border-top-style": "none",
				"border-right-style": "hidden",
				"border-bottom-style": "none",
				"border-left-style": "hidden",
			},
		},
	];
	for (const options of cases) {
		const image = createRaster(8, 8, background);
		const before = image.pixels.slice();
		const result = render({ ...options, image });
		expect(result.pixels).toBe(0);
		expect(result.work).toEqual([]);
		expect(image.pixels).toEqual(before);
	}
});

it.each(["dotted", "double", "unknown", ""])(
	"rejects positive-width unsupported %j alongside groove before charging or painting",
	(style) => {
		for (const borderColor of [color, transparent]) {
			const image = createRaster(8, 8, background);
			const before = image.pixels.slice();
			const work: number[] = [];
			expect(() =>
				render({
					image,
					paint: { ...initialPaintStyle, color: borderColor },
					styles: { ...groove, "border-left-style": style },
					charge: (amount) => work.push(amount),
				}),
			).toThrowError(expect.objectContaining({ code: "unsupported" }));
			expect(work).toEqual([]);
			expect(image.pixels).toEqual(before);
		}
	},
);

it.each([
	{ name: "solid", styles: {}, cost: 10 },
	{ name: "dashed", styles: dashed, cost: 16 },
	{ name: "groove", styles: groove, cost: 14 },
	{
		name: "groove and dashed",
		styles: { ...groove, "border-bottom-style": "dashed" },
		cost: 20,
	},
])(
	"charges the clipped rectangle for $name before a denied budget can write",
	({ styles, cost }) => {
		const image = createRaster(8, 8, background);
		const before = image.pixels.slice();
		const work: number[] = [];
		const failure = new AgentBrowserError(
			"resource-limit",
			"Border work budget",
		);
		expect(() =>
			render({
				image,
				originX: -2,
				originY: -3,
				width: 8,
				height: 8,
				styles,
				charge: (amount) => {
					expect(image.pixels).toEqual(before);
					work.push(amount);
					throw failure;
				},
			}),
		).toThrow(failure);
		expect(work).toEqual([6 * 5 * cost]);
		expect(image.pixels).toEqual(before);
	},
);

it("bounds groove work for huge coordinates, subpixel widths and offscreen boxes", () => {
	const huge = render({
		image: createRaster(4, 4),
		originX: -1e12,
		width: 1e12 + 4,
		height: 4,
		borders: { ...uniformWidths(0), borderTop: 1 },
	});
	expect(huge.work).toEqual([4 * 4 * 14]);
	expect(huge.pixels).toBe(4);
	for (let column = 0; column < 4; column++)
		expect(pixel(huge.image, column, 0)).toEqual(dark);
	const tiny = render({
		image: createRaster(4, 4),
		borders: uniformWidths(Number.MIN_VALUE),
	});
	expect(tiny.work).toEqual([4 * 4 * 14]);
	expect(tiny.pixels).toBe(0);
	expect(tiny.image.pixels.every((value) => value === 0)).toBe(true);
	for (const origin of [-1e12, 1e12]) {
		const image = createRaster(4, 4, background);
		const before = image.pixels.slice();
		const result = render({ image, originX: origin, originY: origin });
		expect(result.work).toEqual([0]);
		expect(result.pixels).toBe(0);
		expect(image.pixels).toEqual(before);
	}
});

it("keeps original groove bands and owners when fractional edges are clipped", () => {
	const { image, pixels, work } = render({
		image: createRaster(5, 5),
		originX: -1.25,
		originY: -0.75,
		width: 6.5,
		height: 5.5,
		borders: uniformWidths(1.5),
		paint: sidePaint,
	});
	expect(pixel(image, 0, 0)).toEqual(light);
	expect(pixel(image, 0, 1)).toEqual(transparent);
	expect(pixel(image, 4, 0)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 4, 3)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 3, 3)).toEqual([0, 0, 127, 255]);
	expect(pixel(image, 4, 4)).toEqual([127, 127, 255, 255]);
	expect(pixel(image, 3, 4)).toEqual([127, 127, 255, 255]);
	expect(pixels).toBe(17);
	expect(work).toEqual([5 * 5 * 14]);
});

it.each([
	{ originX: -3.25, originY: -2.75 },
	{ originX: -0.5, originY: -0.5 },
	{ originX: 0.75, originY: 0.25 },
])(
	"matches an integer-translated full raster crop for mixed fractional borders at %j",
	(origin) => {
		const options = {
			width: 14.5,
			height: 13.25,
			borders: {
				borderTop: 2.25,
				borderRight: 1.25,
				borderBottom: 2.5,
				borderLeft: 3.25,
			},
			styles: {
				...groove,
				"border-right-style": "solid",
				"border-bottom-style": "dashed",
			},
			paint: {
				...sidePaint,
				color: [101, 52, 203, 128] as Rgba,
				"border-left-color": [0, 128, 0, 128] as Rgba,
			},
			horizontalOffset: -2.25,
		};
		const full = render({
			...options,
			image: createRaster(32, 32, background),
			originX: origin.originX + 8,
			originY: origin.originY + 8,
		});
		const cropped = render({
			...options,
			...origin,
			image: createRaster(12, 12, background),
		});
		for (let row = 0; row < 12; row++)
			for (let column = 0; column < 12; column++)
				expect(pixel(cropped.image, column, row)).toEqual(
					pixel(full.image, column + 8, row + 8),
				);
	},
);
