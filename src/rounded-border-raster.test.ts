import { expect, it } from "vitest";
import { type BorderPaintExclusion, paintBorders } from "./border-raster.js";
import { initialPaintStyle, type PaintStyle } from "./css-paint.js";
import { AgentBrowserError } from "./errors.js";
import {
	createRaster,
	paintRasterRect,
	type RasterImage,
	type Rgba,
} from "./raster.js";
import {
	type CornerRadii,
	createRoundedBox,
	insetRoundedBox,
	type RoundedBox,
	roundedBoxContains,
} from "./rounded-box.js";

type BorderWidths = Parameters<typeof paintBorders>[5];
type BorderStyles = Parameters<typeof paintBorders>[7];

const red: Rgba = [255, 0, 0, 255];
const clear: Rgba = [0, 0, 0, 0];
const translucent: Rgba = [100, 50, 200, 128];
const background: Rgba = [20, 40, 60, 128];
const dashed: BorderStyles = {
	"border-top-style": "dashed",
	"border-right-style": "dashed",
	"border-bottom-style": "dashed",
	"border-left-style": "dashed",
};
const groove: BorderStyles = {
	"border-top-style": "groove",
	"border-right-style": "groove",
	"border-bottom-style": "groove",
	"border-left-style": "groove",
};
const variants: [string, BorderStyles][] = [
	["solid", {}],
	["dashed", dashed],
	["groove", groove],
	[
		"mixed",
		{
			"border-top-style": "dashed",
			"border-right-style": "groove",
			"border-bottom-style": "none",
		},
	],
];

function radii(horizontal: number, vertical = horizontal): CornerRadii {
	return [
		{ horizontal, vertical },
		{ horizontal, vertical },
		{ horizontal, vertical },
		{ horizontal, vertical },
	];
}

function widths(width: number): BorderWidths {
	return {
		borderTop: width,
		borderRight: width,
		borderBottom: width,
		borderLeft: width,
	};
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

function contains(bounds: BorderPaintExclusion, column: number, row: number) {
	return (
		column + 0.5 >= bounds.x &&
		column + 0.5 < bounds.x + bounds.width &&
		row + 0.5 >= bounds.y &&
		row + 0.5 < bounds.y + bounds.height
	);
}

function render(
	options: {
		image?: RasterImage;
		box?: RoundedBox;
		borders?: BorderWidths;
		paint?: PaintStyle;
		styles?: BorderStyles;
		offset?: number;
		exclusion?: BorderPaintExclusion;
		bounds?: BorderPaintExclusion;
		charge?: (amount: number) => void;
		square?: boolean;
	} = {},
) {
	const image = options.image ?? createRaster(20, 20);
	const box = options.box ?? createRoundedBox(0, 0, 20, 20, radii(10));
	const work: number[] = [];
	const painted = paintBorders(
		image,
		box.x,
		box.y,
		box.width,
		box.height,
		options.borders ?? widths(2),
		options.paint ?? { ...initialPaintStyle, color: red },
		options.styles ?? {},
		(amount) => {
			work.push(amount);
			options.charge?.(amount);
		},
		options.offset ?? 0,
		options.exclusion,
		options.square ? undefined : box,
		options.bounds,
	);
	return { image, work, painted };
}

function expectRing(
	image: RasterImage,
	outer: RoundedBox,
	borders: BorderWidths,
	color: Rgba = red,
) {
	const inner = insetRoundedBox(outer, {
		top: borders.borderTop,
		right: borders.borderRight,
		bottom: borders.borderBottom,
		left: borders.borderLeft,
	});
	let covered = 0;
	for (let row = 0; row < image.height; row++)
		for (let column = 0; column < image.width; column++) {
			const included =
				roundedBoxContains(outer, column + 0.5, row + 0.5) &&
				!roundedBoxContains(inner, column + 0.5, row + 0.5);
			expect(pixel(image, column, row)).toEqual(included ? color : clear);
			if (included) covered++;
		}
	return covered;
}

it("paints the true circular ring rather than outer-masked straight strips", () => {
	const result = render();
	expect(pixel(result.image, 3, 3)).toEqual(red);
	expect(pixel(result.image, 4, 4)).toEqual(clear);
	expect(pixel(result.image, 0, 0)).toEqual(clear);
	expect(result.painted).toBe(
		expectRing(
			result.image,
			createRoundedBox(0, 0, 20, 20, radii(10)),
			widths(2),
		),
	);
});

it("normalizes all outer components together and never renormalizes the inner radii", () => {
	const box: RoundedBox = {
		x: 0,
		y: 0,
		width: 20,
		height: 20,
		radii: radii(40, 20),
	};
	const borders = {
		borderTop: 1,
		borderRight: 0,
		borderBottom: 1,
		borderLeft: 15,
	};
	const result = render({ box, borders });
	const normalized = createRoundedBox(
		box.x,
		box.y,
		box.width,
		box.height,
		box.radii,
	);
	expect(result.painted).toBe(expectRing(result.image, normalized, borders));
	const inner = insetRoundedBox(normalized, {
		top: 1,
		right: 0,
		bottom: 1,
		left: 15,
	});
	expect(inner.radii[1]).toEqual({ horizontal: 10, vertical: 4 });
	expect(inner.width).toBe(5);
});

it.each([
	{ borderTop: 0, borderRight: 0, borderBottom: 0, borderLeft: 12 },
	{ borderTop: 3, borderRight: 1, borderBottom: 6, borderLeft: 8 },
	widths(15),
])(
	"covers unequal widths and an empty inner box without holes: %j",
	(borders) => {
		const box = createRoundedBox(0, 0, 20, 20, radii(7, 5));
		const result = render({ box, borders });
		expect(result.painted).toBe(expectRing(result.image, box, borders));
	},
);

it("preserves alpha and blends each covered pixel exactly once", () => {
	const box = createRoundedBox(0, 0, 20, 20, radii(10));
	const image = createRaster(20, 20, background);
	const reference = createRaster(1, 1, background);
	paintRasterRect(reference, 0, 0, 1, 1, translucent);
	const result = render({
		image,
		box,
		paint: { ...initialPaintStyle, color: translucent },
	});
	const inner = insetRoundedBox(box, { top: 2, right: 2, bottom: 2, left: 2 });
	let covered = 0;
	for (let row = 0; row < image.height; row++)
		for (let column = 0; column < image.width; column++) {
			const included =
				roundedBoxContains(box, column + 0.5, row + 0.5) &&
				!roundedBoxContains(inner, column + 0.5, row + 0.5);
			expect(pixel(image, column, row)).toEqual(
				included ? pixel(reference, 0, 0) : background,
			);
			if (included) covered++;
		}
	expect(result.painted).toBe(covered);
});

it("assigns distinct side colors and expands a wider side's corner transition monotonically", () => {
	const paint: PaintStyle = {
		...initialPaintStyle,
		color: red,
		"border-right-color": [0, 255, 0, 255],
		"border-bottom-color": [0, 0, 255, 255],
		"border-left-color": [255, 255, 0, 255],
	};
	const thin = render({ paint });
	const thick = render({ paint, borders: { ...widths(2), borderTop: 6 } });
	expect(pixel(thin.image, 9, 0)).toEqual(red);
	expect(pixel(thin.image, 19, 9)).toEqual(paint["border-right-color"]);
	expect(pixel(thin.image, 9, 19)).toEqual(paint["border-bottom-color"]);
	expect(pixel(thin.image, 0, 9)).toEqual(paint["border-left-color"]);
	let expanded = 0;
	for (let row = 0; row < 10; row++)
		for (let column = 10; column < 20; column++) {
			if (pixel(thin.image, column, row)[0] === 255)
				expect(pixel(thick.image, column, row)).toEqual(red);
			if (
				pixel(thin.image, column, row)[1] === 255 &&
				pixel(thick.image, column, row)[0] === 255
			)
				expanded++;
		}
	expect(expanded).toBeGreaterThan(0);
});

it("uses the middle inset curve for groove bands while retaining source alpha", () => {
	const box = createRoundedBox(0, 0, 20, 20, radii(10));
	const inner = insetRoundedBox(box, { top: 4, right: 4, bottom: 4, left: 4 });
	const middle = insetRoundedBox(box, { top: 2, right: 2, bottom: 2, left: 2 });
	const result = render({
		styles: groove,
		borders: widths(4),
		paint: { ...initialPaintStyle, color: translucent },
	});
	const dark = [50, 25, 100, 128];
	const light = [177, 152, 227, 128];
	for (let row = 0; row < 20; row++)
		for (let column = 0; column < 20; column++) {
			if (row < 10 !== column < 10) continue;
			const included =
				roundedBoxContains(box, column + 0.5, row + 0.5) &&
				!roundedBoxContains(inner, column + 0.5, row + 0.5);
			const outerHalf = !roundedBoxContains(middle, column + 0.5, row + 0.5);
			expect(pixel(result.image, column, row)).toEqual(
				included ? (outerHalf === row < 10 ? dark : light) : clear,
			);
		}
	expect(pixel(result.image, 3, 3)).toEqual(dark);
	expect(pixel(result.image, 4, 4)).toEqual(light);
});

it("samples dashed outer arcs with 32 deterministic segments per corner, not horizontal bands", () => {
	const box = createRoundedBox(0, 0, 80, 80, radii(40));
	const inner = insetRoundedBox(box, { top: 2, right: 2, bottom: 2, left: 2 });
	const result = render({ image: createRaster(80, 80), box, styles: dashed });
	let checked = 0;
	let curvedDifferences = 0;
	for (let row = 0; row < 80; row++)
		for (let column = 0; column < 80; column++) {
			const included =
				roundedBoxContains(box, column + 0.5, row + 0.5) &&
				!roundedBoxContains(inner, column + 0.5, row + 0.5);
			if (!included) {
				expect(pixel(result.image, column, row)).toEqual(clear);
				continue;
			}
			const angle =
				(Math.atan2(row + 0.5 - 40, column + 0.5 - 40) + Math.PI * 2.5) %
				(Math.PI * 2);
			const phase =
				(angle * 40 * (Math.sin(Math.PI / 128) / (Math.PI / 128))) % 12;
			if (Math.min(phase, Math.abs(phase - 6), 12 - phase) < 0.2) continue;
			expect(pixel(result.image, column, row)).toEqual(phase < 6 ? red : clear);
			checked++;
			if (row < 20 && column < 40 && phase < 6 !== (column + 0.5) % 12 < 6)
				curvedDifferences++;
		}
	expect(checked).toBeGreaterThan(300);
	expect(curvedDifferences).toBeGreaterThan(0);
});

it.each(variants)(
	"clips %s decoration fragments from one hypothetical full rounded box",
	(_name, styles) => {
		const paint = { ...initialPaintStyle, color: translucent };
		const box = createRoundedBox(-2.25, -1.25, 28, 24, radii(10, 8));
		const exclusion = { x: 6.25, y: 0, width: 2.5, height: 20 };
		const options = { box, styles, paint, offset: -7.25, exclusion };
		const full = render(options);
		const image = createRaster(20, 20);
		const first = render({
			...options,
			image,
			bounds: { x: 0, y: 0, width: 12.5, height: 20 },
		});
		const second = render({
			...options,
			image,
			bounds: { x: 12.5, y: 0, width: 7.5, height: 20 },
		});
		expect(image.pixels).toEqual(full.image.pixels);
		expect(first.painted + second.painted).toBe(full.painted);
		const bounds = { x: 3.25, y: 1.5, width: 11.5, height: 13 };
		const clipped = render({ ...options, bounds });
		for (let row = 0; row < 20; row++)
			for (let column = 0; column < 20; column++)
				expect(pixel(clipped.image, column, row)).toEqual(
					contains(bounds, column, row)
						? pixel(full.image, column, row)
						: clear,
				);
	},
);

it.each(variants)(
	"retains %s curve and dash phase when cropped at a negative origin",
	(_name, styles) => {
		const full = render({
			image: createRaster(40, 32),
			box: createRoundedBox(4.75, 4.75, 28, 24, radii(10, 8)),
			styles,
			offset: -3.5,
		});
		const cropped = render({
			box: createRoundedBox(-5.25, -3.25, 28, 24, radii(10, 8)),
			styles,
			offset: -3.5,
		});
		for (let row = 0; row < 20; row++)
			for (let column = 0; column < 20; column++)
				expect(pixel(cropped.image, column, row)).toEqual(
					pixel(full.image, column + 10, row + 8),
				);
	},
);

it.each(variants)(
	"preserves square %s pixels and work for every zero corner pair",
	(_name, styles) => {
		const box = createRoundedBox(0, 0, 20, 20, [
			{ horizontal: 0, vertical: 8 },
			{ horizontal: 5, vertical: 0 },
			{ horizontal: 0, vertical: 0 },
			{ horizontal: 0, vertical: 6 },
		]);
		const legacy = render({ box, styles, square: true });
		const explicit = render({ box, styles });
		expect(explicit.image.pixels).toEqual(legacy.image.pixels);
		expect(explicit.work).toEqual(legacy.work);
		expect(explicit.painted).toBe(legacy.painted);
		const bounds = { x: 3, y: 0, width: 7, height: 20 };
		const clipped = render({ box, styles, square: true, bounds });
		for (let row = 0; row < 20; row++)
			for (let column = 0; column < 20; column++)
				expect(pixel(clipped.image, column, row)).toEqual(
					contains(bounds, column, row)
						? pixel(legacy.image, column, row)
						: clear,
				);
	},
);

it("suppresses none and hidden before computing the ring and handles transparent sides", () => {
	const borders = {
		borderTop: 0,
		borderRight: 2,
		borderBottom: 0,
		borderLeft: 2,
	};
	const result = render({
		styles: { "border-top-style": "none", "border-bottom-style": "hidden" },
	});
	expect(result.painted).toBe(
		expectRing(
			result.image,
			createRoundedBox(0, 0, 20, 20, radii(10)),
			borders,
		),
	);
	const transparent = render({
		paint: { ...initialPaintStyle, color: clear, "border-top-color": red },
	});
	expect(pixel(transparent.image, 9, 0)).toEqual(red);
	expect(pixel(transparent.image, 19, 9)).toEqual(clear);
	expect(
		render({ paint: { ...initialPaintStyle, color: clear } }).painted,
	).toBe(0);
	expect(render({ borders: widths(0) }).painted).toBe(0);
});

it("returns no pixels for empty clips, empty boxes, and total exclusions", () => {
	expect(render({ bounds: { x: 4, y: 0, width: 0, height: 20 } }).painted).toBe(
		0,
	);
	expect(
		render({ box: createRoundedBox(0, 0, 0, 20, radii(10)) }).painted,
	).toBe(0);
	expect(
		render({ exclusion: { x: -100, y: -100, width: 200, height: 200 } })
			.painted,
	).toBe(0);
	expect(
		render({ box: createRoundedBox(-100, -100, 20, 20, radii(10)) }).painted,
	).toBe(0);
	expect(
		render({ exclusion: { x: 8, y: 0, width: 0, height: 20 } }).image.pixels,
	).toEqual(render().image.pixels);
});

it("charges geometry and all covered work before the first destination mutation", () => {
	const options = {
		styles: dashed,
		paint: { ...initialPaintStyle, color: translucent },
	};
	const baseline = render(options);
	expect(baseline.work.length).toBe(4);
	expect(
		baseline.work.every((amount) => Number.isSafeInteger(amount) && amount > 0),
	).toBe(true);
	for (let rejected = 0; rejected < baseline.work.length; rejected++) {
		const image = createRaster(20, 20, background);
		const before = image.pixels.slice();
		let calls = 0;
		expect(() =>
			render({
				...options,
				image,
				charge: () => {
					expect(image.pixels).toEqual(before);
					if (calls++ === rejected)
						throw new AgentBrowserError(
							"resource-limit",
							"Border work exhausted",
						);
				},
			}),
		).toThrow("Border work exhausted");
		expect(image.pixels).toEqual(before);
	}
});

it("keeps solid and groove accounting independent of dashed perimeter sampling", () => {
	const solid = render();
	const grooved = render({ styles: groove });
	const patterned = render({ styles: dashed });
	expect(grooved.work).toEqual(solid.work);
	expect(solid.work[2]).toBe(solid.painted * 128);
	expect(solid.work[3]).toBe(solid.painted * 4);
	expect(patterned.work[2]).toBeGreaterThan(solid.work[2] * 10);
});

it.each(["dotted", "double", "ridge", "inset", "outset"])(
	"rejects unsupported rounded %s before painting",
	(style) => {
		const image = createRaster(20, 20, background);
		const before = image.pixels.slice();
		expect(() =>
			render({ image, styles: { "border-left-style": style } as BorderStyles }),
		).toThrow("Unsupported border-left-style");
		expect(image.pixels).toEqual(before);
	},
);

it("rejects invalid geometry, colors, dash offsets, and clipping before painting", () => {
	const invalid: Parameters<typeof render>[0][] = [
		{ borders: { ...widths(2), borderLeft: -1 } },
		{ borders: { ...widths(2), borderRight: Number.NaN } },
		{ box: { x: 0, y: 0, width: 20, height: 20, radii: radii(Number.NaN) } },
		{
			paint: {
				...initialPaintStyle,
				color: red,
				"border-left-color": [0, 0, 0, 300],
			},
		},
		{ styles: dashed, offset: Number.POSITIVE_INFINITY },
		{ bounds: { x: 0, y: 0, width: -1, height: 20 } },
		{ exclusion: { x: Number.NaN, y: 0, width: 1, height: 20 } },
	];
	for (const options of invalid) {
		const image = createRaster(20, 20, background);
		const before = image.pixels.slice();
		expect(() => render({ ...options, image })).toThrow(AgentBrowserError);
		expect(image.pixels).toEqual(before);
	}
	const image = createRaster(20, 20, background);
	const before = image.pixels.slice();
	expect(() =>
		paintBorders(
			image,
			1,
			0,
			20,
			20,
			widths(2),
			initialPaintStyle,
			{},
			() => {},
			0,
			undefined,
			createRoundedBox(0, 0, 20, 20, radii(10)),
		),
	).toThrow("Border rounded box mismatch");
	expect(image.pixels).toEqual(before);
});
