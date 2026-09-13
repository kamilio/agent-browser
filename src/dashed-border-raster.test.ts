import { expect, it } from "vitest";
import { paintBorders, paintSolidBorders } from "./border-raster.js";
import { initialBoxStyle } from "./css-box.js";
import { initialPaintStyle, type PaintStyle } from "./css-paint.js";
import { AgentBrowserError } from "./errors.js";
import { createRaster, type RasterImage, type Rgba } from "./raster.js";

type BorderWidths = Parameters<typeof paintBorders>[5];
type BorderStyles = Parameters<typeof paintBorders>[7];

const red: Rgba = [255, 0, 0, 255];
const blue: Rgba = [0, 0, 255, 255];
const green: Rgba = [0, 128, 0, 255];
const transparent: Rgba = [0, 0, 0, 0];
const dashed: BorderStyles = {
	"border-top-style": "dashed",
	"border-right-style": "dashed",
	"border-bottom-style": "dashed",
	"border-left-style": "dashed",
};
const solid: BorderStyles = {
	"border-top-style": "solid",
	"border-right-style": "solid",
	"border-bottom-style": "solid",
	"border-left-style": "solid",
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
	const image = options.image ?? createRaster(24, 24);
	const work: number[] = [];
	const pixels = paintBorders(
		image,
		options.originX ?? 0,
		options.originY ?? 0,
		options.width ?? image.width,
		options.height ?? image.height,
		options.borders ?? uniformWidths(1),
		options.paint ?? { ...initialPaintStyle, color: red },
		options.styles ?? dashed,
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

it("paints rectangular three-width dashes and gaps on all four sides", () => {
	const { image, pixels, work } = render();
	for (let position = 1; position < 23; position++) {
		const expected = position % 6 < 3 ? red : transparent;
		expect(pixel(image, position, 0)).toEqual(expected);
		expect(pixel(image, position, 23)).toEqual(expected);
		expect(pixel(image, 0, position)).toEqual(expected);
		expect(pixel(image, 23, position)).toEqual(expected);
	}
	expect(pixel(image, 12, 12)).toEqual(transparent);
	expect(pixels).toBe(46);
	expect(work).toEqual([24 * 24 * 16]);
});

it.each(["top", "right", "bottom", "left"] as const)(
	"uses actual fractional and integer widths for the %s pattern",
	(side) => {
		for (const sideWidth of [0.75, 1, 1.25, 2, 3]) {
			const borders = uniformWidths(0);
			if (side === "top") borders.borderTop = sideWidth;
			if (side === "right") borders.borderRight = sideWidth;
			if (side === "bottom") borders.borderBottom = sideWidth;
			if (side === "left") borders.borderLeft = sideWidth;
			const { image } = render({ borders });
			for (let position = 0; position < 24; position++) {
				const column = side === "left" ? 0 : side === "right" ? 23 : position;
				const row = side === "top" ? 0 : side === "bottom" ? 23 : position;
				const expected =
					(position + 0.5) % (6 * sideWidth) < 3 * sideWidth
						? red
						: transparent;
				expect(pixel(image, column, row)).toEqual(expected);
			}
		}
	},
);

it("mixes side widths, styles and colors without filling dash gaps", () => {
	const { image } = render({
		borders: { borderTop: 1, borderRight: 2, borderBottom: 2, borderLeft: 1 },
		styles: {
			"border-top-style": "dashed",
			"border-right-style": "solid",
			"border-bottom-style": "dashed",
			"border-left-style": "none",
		},
		paint: {
			...initialPaintStyle,
			color: red,
			"border-right-color": blue,
			"border-bottom-color": green,
		},
	});
	expect(pixel(image, 1, 0)).toEqual(red);
	expect(pixel(image, 4, 0)).toEqual(transparent);
	expect(pixel(image, 23, 10)).toEqual(blue);
	expect(pixel(image, 22, 10)).toEqual(blue);
	expect(pixel(image, 13, 23)).toEqual(green);
	expect(pixel(image, 8, 23)).toEqual(transparent);
	expect(pixel(image, 0, 10)).toEqual(transparent);
});

it.each([{}, solid, { "border-top-style": "solid" }])(
	"matches the solid wrapper pixels, count and exact charge for %j",
	(styles) => {
		for (const origin of [0, -2, -0.75, 0.5, 30]) {
			const image = createRaster(12, 10, blue);
			const expected = createRaster(12, 10, blue);
			const borders = {
				borderTop: 1.25,
				borderRight: 2,
				borderBottom: 3,
				borderLeft: 0.75,
			};
			const paint: PaintStyle = {
				...initialPaintStyle,
				color: red,
				"border-top-color": [30, 60, 90, 128],
				"border-right-color": transparent,
				"border-bottom-color": green,
			};
			const expectedWork: number[] = [];
			const expectedPixels = paintSolidBorders(
				expected,
				origin,
				origin,
				9.5,
				8.25,
				borders,
				paint,
				(amount) => expectedWork.push(amount),
			);
			const result = render({
				image,
				originX: origin,
				originY: origin,
				width: 9.5,
				height: 8.25,
				borders,
				paint,
				styles,
			});
			expect(result.image.pixels).toEqual(expected.pixels);
			expect(result.pixels).toBe(expectedPixels);
			expect(result.work).toEqual(expectedWork);
		}
	},
);

it("retains the solid corner ownership and ten-unit pixel charge", () => {
	const image = createRaster(4, 4);
	const work: number[] = [];
	const pixels = paintSolidBorders(
		image,
		0,
		0,
		4,
		4,
		uniformWidths(1),
		{
			...initialPaintStyle,
			color: red,
			"border-right-color": blue,
			"border-bottom-color": green,
		},
		(amount) => work.push(amount),
	);
	expect(pixels).toBe(12);
	expect(work).toEqual([160]);
	expect(pixel(image, 0, 0)).toEqual(red);
	expect(pixel(image, 3, 0)).toEqual(red);
	expect(pixel(image, 3, 3)).toEqual(blue);
	expect(pixel(image, 0, 3)).toEqual(green);
	expect(pixel(image, 1, 1)).toEqual(transparent);
});

it("partitions alpha corners once and does not borrow a neighboring dash", () => {
	const color: Rgba = [200, 40, 60, 128];
	const { image } = render({
		image: createRaster(8, 8),
		borders: uniformWidths(2),
		paint: { ...initialPaintStyle, color },
	});
	expect(pixel(image, 0, 0)).toEqual(color);
	expect(pixel(image, 7, 0)).toEqual(transparent);
	expect(pixel(image, 0, 7)).toEqual(color);
	expect(pixel(image, 7, 7)).toEqual(transparent);
	for (let offset = 3; offset < image.pixels.length; offset += 4)
		expect([0, 128]).toContain(image.pixels[offset]);
});

it("leaves transparent corner owners unpainted without falling through", () => {
	const { image } = render({
		image: createRaster(8, 8),
		borders: uniformWidths(2),
		paint: {
			...initialPaintStyle,
			color: red,
			"border-top-color": transparent,
		},
	});
	expect(pixel(image, 0, 0)).toEqual(transparent);
	expect(pixel(image, 0, 2)).toEqual(red);
	const empty = render({ paint: { ...initialPaintStyle, color: transparent } });
	expect(empty.pixels).toBe(0);
	expect(empty.work).toEqual([]);
});

it.each([
	{ originX: -3, originY: -2 },
	{ originX: -3.25, originY: -2.75 },
	{ originX: -0.5, originY: -0.5 },
	{ originX: 0.5, originY: 0.25 },
	{ originX: 0.75, originY: 0.75 },
])(
	"preserves unclipped phase under integer crop translation for %j",
	(origin) => {
		const borders = {
			borderTop: 2.25,
			borderRight: 1.25,
			borderBottom: 2.5,
			borderLeft: 3.25,
		};
		const reference = render({
			image: createRaster(32, 32),
			originX: origin.originX + 8,
			originY: origin.originY + 8,
			width: 14.5,
			height: 13.25,
			borders,
		});
		const cropped = render({
			image: createRaster(12, 12),
			...origin,
			width: 14.5,
			height: 13.25,
			borders,
		});
		for (let row = 0; row < 12; row++)
			for (let column = 0; column < 12; column++)
				expect(pixel(cropped.image, column, row)).toEqual(
					pixel(reference.image, column + 8, row + 8),
				);
	},
);

it.each([1, 1.25, 2])(
	"continues horizontal inline slices for width %s",
	(sideWidth) => {
		const borders = {
			...uniformWidths(0),
			borderTop: sideWidth,
			borderBottom: sideWidth,
		};
		const reference = render({ image: createRaster(24, 8), borders });
		for (const start of [0, 5, 11, 17]) {
			const slice = render({
				image: createRaster(7, 8),
				borders,
				horizontalOffset: start,
			});
			for (let row = 0; row < 8; row++)
				for (let column = 0; column < 7; column++)
					expect(pixel(slice.image, column, row)).toEqual(
						pixel(reference.image, column + start, row),
					);
		}
	},
);

it("applies offsets only horizontally and normalizes negative phase", () => {
	const borders = { ...uniformWidths(0), borderLeft: 1, borderRight: 1 };
	expect(render({ borders, horizontalOffset: 4 }).image.pixels).toEqual(
		render({ borders }).image.pixels,
	);
	const shifted = render({
		borders: { ...uniformWidths(0), borderTop: 1 },
		horizontalOffset: -2,
	});
	expect(pixel(shifted.image, 0, 0)).toEqual(transparent);
	expect(pixel(shifted.image, 2, 0)).toEqual(red);
});

it.each(["none", "hidden"])(
	"suppresses nonzero %s sides and ignores zero-width styles",
	(style) => {
		const result = render({
			styles: {
				"border-top-style": style,
				"border-right-style": style,
				"border-bottom-style": style,
				"border-left-style": style,
			},
		});
		expect(result.pixels).toBe(0);
		expect(result.work).toEqual([]);
		expect(result.image.pixels.every((value) => value === 0)).toBe(true);
		const zero = render({
			borders: uniformWidths(0),
			styles: { "border-top-style": "unknown" },
		});
		expect(zero.pixels).toBe(0);
		expect(zero.work).toEqual([]);
		expect(render({ styles: initialBoxStyle }).pixels).toBe(0);
	},
);

it.each(["dotted", "double", "unknown", ""])(
	"rejects unsupported style %j before charging or painting",
	(style) => {
		const image = createRaster(8, 8, blue);
		const before = image.pixels.slice();
		const work: number[] = [];
		expect(() =>
			render({
				image,
				styles: { ...dashed, "border-left-style": style },
				charge: (amount) => work.push(amount),
			}),
		).toThrowError(expect.objectContaining({ code: "unsupported" }));
		expect(work).toEqual([]);
		expect(image.pixels).toEqual(before);
		expect(() =>
			render({
				styles: { "border-top-style": style },
				paint: { ...initialPaintStyle, color: transparent },
			}),
		).toThrowError(expect.objectContaining({ code: "unsupported" }));
	},
);

it("charges all clipped pattern work before resource failure can paint", () => {
	const image = createRaster(8, 8, blue);
	const before = image.pixels.slice();
	const failure = new AgentBrowserError("resource-limit", "Border work budget");
	const work: number[] = [];
	expect(() =>
		render({
			image,
			originX: -2,
			originY: -3,
			width: 8,
			height: 8,
			charge: (amount) => {
				expect(image.pixels).toEqual(before);
				work.push(amount);
				throw failure;
			},
		}),
	).toThrow(failure);
	expect(work).toEqual([6 * 5 * 16]);
	expect(image.pixels).toEqual(before);
});

it("bounds work by the image for huge offscreen coordinates and tiny widths", () => {
	const huge = render({
		image: createRaster(4, 4),
		originX: -1e12,
		width: 1e12 + 4,
		height: 4,
		borders: { ...uniformWidths(0), borderTop: 1 },
	});
	expect(huge.work).toEqual([4 * 4 * 16]);
	expect(pixel(huge.image, 0, 0)).toEqual(transparent);
	expect(pixel(huge.image, 2, 0)).toEqual(red);
	const tiny = render({
		image: createRaster(4, 4),
		borders: uniformWidths(Number.MIN_VALUE),
	});
	expect(tiny.work).toEqual([4 * 4 * 16]);
	expect(tiny.pixels).toBe(0);
	const offscreen = render({
		originX: -1e12,
		originY: -1e12,
		width: 4,
		height: 4,
	});
	expect(offscreen.work).toEqual([0]);
	expect(offscreen.pixels).toBe(0);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
	"rejects nonfinite dash offsets %s without painting",
	(horizontalOffset) => {
		const image = createRaster(4, 4);
		expect(() => render({ image, horizontalOffset })).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(image.pixels.every((value) => value === 0)).toBe(true);
	},
);
