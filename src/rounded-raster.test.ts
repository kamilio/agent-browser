import { expect, it } from "vitest";
import {
	createRaster,
	paintRasterImage,
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
import { paintRoundedImage, paintRoundedRect } from "./rounded-raster.js";

const red = [255, 0, 0, 255] as const;
const clear = [0, 0, 0, 0] as const;
const noCharge = () => {};

function radii(horizontal: number, vertical = horizontal): CornerRadii {
	return [
		{ horizontal, vertical },
		{ horizontal, vertical },
		{ horizontal, vertical },
		{ horizontal, vertical },
	];
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

function mask(image: RasterImage) {
	return Array.from({ length: image.height }, (_, row) =>
		Array.from({ length: image.width }, (_, column) =>
			image.pixels[(row * image.width + column) * 4 + 3] ? "#" : ".",
		).join(""),
	);
}

function expectMasked(
	image: RasterImage,
	unclipped: RasterImage,
	before: RasterImage,
	box: RoundedBox,
): number {
	let covered = 0;
	for (let row = 0; row < image.height; row++)
		for (let column = 0; column < image.width; column++) {
			const contains = roundedBoxContains(box, column + 0.5, row + 0.5);
			if (contains) covered++;
			expect(pixel(image, column, row)).toEqual(
				pixel(contains ? unclipped : before, column, row),
			);
		}
	return covered;
}

function patternedSource() {
	const source = createRaster(3, 2);
	source.pixels.set([
		255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 0, 64, 0, 255, 255,
		255, 255, 0, 255, 192,
	]);
	return source;
}

it("preserves square rectangle and image rendering with an optional clip", () => {
	const box = createRoundedBox(-0.5, 0.5, 6, 4, radii(0));
	const color = [255, 0, 0, 128] as const;
	const background = [0, 0, 255, 128] as const;
	const expectedRect = createRaster(5, 5, background);
	paintRasterRect(expectedRect, box.x, box.y, box.width, box.height, color);
	const actualRect = createRaster(5, 5, background);
	expect(paintRoundedRect(actualRect, box, color, noCharge)).toBe(20);
	expect(actualRect.pixels).toEqual(expectedRect.pixels);
	const expectedImage = createRaster(5, 5, background);
	const source = patternedSource();
	paintRasterImage(expectedImage, source, box.x, box.y, box.width, box.height);
	const actualImage = createRaster(5, 5, background);
	expect(paintRoundedImage(actualImage, source, box, noCharge)).toBe(20);
	expect(actualImage.pixels).toEqual(expectedImage.pixels);
});

it.each([
	{
		name: "circle",
		width: 4,
		height: 4,
		corners: radii(2),
		expected: [".##.", "####", "####", ".##."],
	},
	{
		name: "ellipse",
		width: 8,
		height: 4,
		corners: radii(4, 2),
		expected: [".######.", "########", "########", ".######."],
	},
	{
		name: "four independent corners",
		width: 8,
		height: 8,
		corners: [
			{ horizontal: 4, vertical: 4 },
			{ horizontal: 1, vertical: 1 },
			{ horizontal: 3, vertical: 2 },
			{ horizontal: 2, vertical: 4 },
		] as CornerRadii,
		expected: [
			"..######",
			".#######",
			"########",
			"########",
			"########",
			"########",
			"########",
			".######.",
		],
	},
])(
	"uses deterministic native pixel-center coverage for $name",
	({ width, height, corners, expected }) => {
		const box = createRoundedBox(0, 0, width, height, corners);
		const actual = createRaster(width, height);
		const count = paintRoundedRect(actual, box, red, noCharge);
		expect(mask(actual)).toEqual(expected);
		expect(count).toBe(expected.join("").replaceAll(".", "").length);
		expect(count).toBe(
			expectMasked(
				actual,
				createRaster(width, height, red),
				createRaster(width, height),
				box,
			),
		);
		const image = createRaster(width, height);
		expect(
			paintRoundedImage(image, createRaster(1, 1, red), box, noCharge),
		).toBe(count);
		expect(image.pixels).toEqual(actual.pixels);
	},
);

it("treats a zero horizontal or vertical corner radius as square", () => {
	const box = createRoundedBox(0, 0, 6, 6, [
		{ horizontal: 0, vertical: 3 },
		{ horizontal: 3, vertical: 0 },
		{ horizontal: 0, vertical: 3 },
		{ horizontal: 3, vertical: 0 },
	]);
	const image = createRaster(6, 6);
	expect(paintRoundedRect(image, box, red, noCharge)).toBe(36);
	expect(image.pixels).toEqual(createRaster(6, 6, red).pixels);
});

it("paints inset inner curves using their independently reduced radii", () => {
	const outer = createRoundedBox(0, 0, 12, 10, radii(4));
	const inner = insetRoundedBox(outer, {
		top: 1,
		right: 3,
		bottom: 2,
		left: 2,
	});
	expect(inner.radii).toEqual([
		{ horizontal: 2, vertical: 3 },
		{ horizontal: 1, vertical: 3 },
		{ horizontal: 1, vertical: 2 },
		{ horizontal: 2, vertical: 2 },
	]);
	const image = createRaster(12, 10);
	const count = paintRoundedRect(image, inner, red, noCharge);
	expect(pixel(image, 2, 1)).toEqual(clear);
	expect(pixel(image, 3, 1)).toEqual(red);
	expect(pixel(image, 8, 1)).toEqual(red);
	expect(count).toBe(
		expectMasked(image, createRaster(12, 10, red), createRaster(12, 10), inner),
	);
});

it("does not renormalize oversized inset radii while painting inner curves", () => {
	const outer = createRoundedBox(0, 0, 20, 20, [
		{ horizontal: 10, vertical: 10 },
		{ horizontal: 0, vertical: 0 },
		{ horizontal: 0, vertical: 0 },
		{ horizontal: 0, vertical: 0 },
	]);
	const inner = insetRoundedBox(outer, {
		top: 0,
		right: 15,
		bottom: 0,
		left: 0,
	});
	const image = createRaster(5, 20);
	const count = paintRoundedRect(image, inner, red, noCharge);
	expect(mask(image).slice(0, 3)).toEqual([".....", ".....", "...##"]);
	expect(count).toBe(
		expectMasked(image, createRaster(5, 20, red), createRaster(5, 20), inner),
	);
});

it.each([
	{ originX: -2.25, originY: -1.5, width: 8, height: 7 },
	{ originX: 2.5, originY: 1.25, width: 8.5, height: 7.5 },
	{ originX: 0.25, originY: 0.75, width: 5.5, height: 4.25 },
])(
	"clips fractional and offscreen origins without rescaling source samples: %j",
	({ originX, originY, width, height }) => {
		const box = createRoundedBox(originX, originY, width, height, radii(3, 2));
		const background = [20, 40, 60, 128] as const;
		const source = patternedSource();
		const expected = createRaster(8, 7, background);
		paintRasterImage(expected, source, originX, originY, width, height);
		const actual = createRaster(8, 7, background);
		const count = paintRoundedImage(actual, source, box, noCharge);
		expect(count).toBe(
			expectMasked(actual, expected, createRaster(8, 7, background), box),
		);
		const rectangle = createRaster(8, 7);
		expect(paintRoundedRect(rectangle, box, red, noCharge)).toBe(count);
		expect(
			expectMasked(rectangle, createRaster(8, 7, red), createRaster(8, 7), box),
		).toBe(count);
	},
);

it("intersects a rounded clip with the original rectangle and image bounds", () => {
	const box = createRoundedBox(0.25, 0.5, 6.5, 4, radii(3, 2));
	const source = patternedSource();
	const before = createRaster(8, 6);
	const expectedRect = createRaster(8, 6);
	const expectedImage = createRaster(8, 6);
	paintRasterRect(expectedRect, 2, 1, 2.5, 4, red);
	paintRasterImage(expectedImage, source, 2, 1, 2.5, 4);
	const actualRect = createRaster(8, 6);
	const actualImage = createRaster(8, 6);
	paintRasterRect(actualRect, 2, 1, 2.5, 4, red, box);
	paintRasterImage(actualImage, source, 2, 1, 2.5, 4, box);
	expectMasked(actualRect, expectedRect, before, box);
	expectMasked(actualImage, expectedImage, before, box);
});

it("retains half-open pixel-center boundaries without antialiasing", () => {
	const square = createRoundedBox(0.5, 0.5, 2, 2, radii(0));
	const image = createRaster(4, 4);
	expect(paintRoundedRect(image, square, red, noCharge)).toBe(4);
	expect(mask(image)).toEqual(["##..", "##..", "....", "...."]);
	const ellipse = createRoundedBox(0.5, 0, 4, 1, radii(2, 0.5));
	const strip = createRaster(5, 1);
	expect(paintRoundedRect(strip, ellipse, red, noCharge)).toBe(4);
	expect(mask(strip)).toEqual(["####."]);
});

it("reuses straight-alpha compositing and skips transparent rectangle coverage", () => {
	const box = createRoundedBox(0, 0, 4, 4, radii(2));
	const image = createRaster(4, 4, [0, 0, 255, 128]);
	expect(paintRoundedRect(image, box, [255, 0, 0, 128], noCharge)).toBe(12);
	expect(pixel(image, 1, 0)).toEqual([170, 0, 85, 192]);
	expect(pixel(image, 0, 0)).toEqual([0, 0, 255, 128]);
	const before = image.pixels.slice();
	const charges: number[] = [];
	expect(
		paintRoundedRect(image, box, [255, 0, 0, 0], (amount) =>
			charges.push(amount),
		),
	).toBe(0);
	expect(charges).toEqual([1]);
	expect(image.pixels).toEqual(before);
	expect(paintRoundedImage(image, createRaster(1, 1), box, noCharge)).toBe(12);
	expect(image.pixels).toEqual(before);
	expect(() =>
		paintRoundedRect(image, box, [256, 0, 0, 0], noCharge),
	).toThrow();
	expect(image.pixels).toEqual(before);
});

it.each(["same image", "overlapping views"])(
	"copies aliased %s before clipped writes",
	(kind) => {
		const storage = new ArrayBuffer(64);
		const image: RasterImage = {
			width: 4,
			height: 4,
			pixels: new Uint8Array(storage),
		};
		for (let offset = 0; offset < image.pixels.length; offset += 4)
			image.pixels.set([offset * 3, offset * 2, offset, 128], offset);
		const source: RasterImage =
			kind === "same image"
				? image
				: { width: 3, height: 2, pixels: new Uint8Array(storage, 4, 24) };
		const independent = { ...source, pixels: source.pixels.slice() };
		const before = { ...image, pixels: image.pixels.slice() };
		const expected = { ...image, pixels: image.pixels.slice() };
		const box = createRoundedBox(1, 0, 4, 4, radii(2));
		paintRasterImage(
			expected,
			independent,
			box.x,
			box.y,
			box.width,
			box.height,
			box,
		);
		const charges: number[] = [];
		const count = paintRoundedImage(image, source, box, (amount) =>
			charges.push(amount),
		);
		expect(image.pixels).toEqual(expected.pixels);
		expect(charges).toEqual([1, 8, count * 4, source.pixels.length]);
		image.pixels.set(before.pixels);
		paintRasterImage(image, source, box.x, box.y, box.width, box.height, box);
		expect(image.pixels).toEqual(expected.pixels);
	},
);

it("rejects malformed clips before opaque, transparent, empty, or image writes", () => {
	const box = createRoundedBox(0, 0, 4, 4, radii(2));
	const invalid = [
		null,
		{},
		{ ...box, x: Number.NaN },
		{ ...box, y: Number.POSITIVE_INFINITY },
		{ ...box, width: -1 },
		{ ...box, height: Number.NaN },
		{ ...box, x: 16_777_217 },
		{ ...box, width: 16_777_217 },
		{ ...box, radii: [] },
		{ ...box, radii: new Array(4) },
		{ ...box, radii: radii(-1) },
		{ ...box, radii: radii(1, Number.NaN) },
	];
	const image = createRaster(4, 4, [0, 0, 255, 128]);
	const before = image.pixels.slice();
	const source = patternedSource();
	for (const candidate of invalid) {
		const clip = candidate as RoundedBox;
		const operations = [
			() => paintRasterRect(image, 0, 0, 4, 4, red, clip),
			() => paintRasterRect(image, 0, 0, 4, 4, clear, clip),
			() => paintRasterRect(image, 0, 0, 0, 0, red, clip),
			() => paintRasterImage(image, source, 0, 0, 4, 4, clip),
			() => paintRasterImage(image, source, 0, 0, 0, 0, clip),
			() => paintRoundedRect(image, clip, red, noCharge),
			() => paintRoundedImage(image, source, clip, noCharge),
		];
		for (const operation of operations) {
			expect(operation).toThrow();
			expect(image.pixels).toEqual(before);
		}
	}
});

it("retains raster, source, color and work-owner validation for empty paint", () => {
	const image = createRaster(2, 2, red);
	const before = image.pixels.slice();
	const box = createRoundedBox(0, 0, 0, 0, radii(0));
	const invalidRaster = { width: 2, height: 2, pixels: new Uint8Array(1) };
	expect(() => paintRoundedRect(invalidRaster, box, red, noCharge)).toThrow();
	expect(() =>
		paintRoundedImage(image, invalidRaster, box, noCharge),
	).toThrow();
	expect(() =>
		paintRoundedRect(image, box, [0, 0, 0] as unknown as Rgba, noCharge),
	).toThrow();
	expect(() =>
		paintRoundedImage(image, { ...image, width: 4097 }, box, noCharge),
	).toThrow();
	const invalidCharge = undefined as unknown as (amount: number) => void;
	expect(() => paintRoundedRect(image, box, red, invalidCharge)).toThrow();
	expect(() => paintRoundedImage(image, image, box, invalidCharge)).toThrow();
	expect(image.pixels).toEqual(before);
});

it.each(["rectangle", "image"])(
	"charges both row passes, coverage and aliases before %s mutation",
	(kind) => {
		const box = createRoundedBox(0, 0, 4, 4, radii(2));
		const expectedCharges = kind === "rectangle" ? [1, 8, 48] : [1, 8, 48, 64];
		for (
			let failingCall = 0;
			failingCall < expectedCharges.length;
			failingCall++
		) {
			const image = createRaster(4, 4, [0, 0, 255, 128]);
			const before = image.pixels.slice();
			const charges: number[] = [];
			const charge = (amount: number) => {
				expect(image.pixels).toEqual(before);
				charges.push(amount);
				if (charges.length === failingCall + 1)
					throw new Error("work exhausted");
			};
			expect(() =>
				kind === "rectangle"
					? paintRoundedRect(image, box, red, charge)
					: paintRoundedImage(image, image, box, charge),
			).toThrow("work exhausted");
			expect(charges).toEqual(expectedCharges.slice(0, failingCall + 1));
			expect(image.pixels).toEqual(before);
		}
		const image = createRaster(4, 4, [0, 0, 255, 128]);
		let remaining = expectedCharges.reduce(
			(total, amount) => total + amount,
			0,
		);
		const charge = (amount: number) => {
			expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
			remaining -= amount;
			if (remaining < 0) throw new Error("work exhausted");
		};
		const count =
			kind === "rectangle"
				? paintRoundedRect(image, box, red, charge)
				: paintRoundedImage(image, image, box, charge);
		expect(count).toBe(12);
		expect(remaining).toBe(0);
	},
);

it("bounds charged row work to the raster rather than the layout extent", () => {
	const image = createRaster(4, 3);
	const box = createRoundedBox(
		-1_000_000,
		-1_000_000,
		2_000_000,
		2_000_000,
		radii(0),
	);
	const charges: number[] = [];
	expect(
		paintRoundedRect(image, box, red, (amount) => charges.push(amount)),
	).toBe(12);
	expect(charges).toEqual([1, 6, 48]);
});

it.each([
	{ originX: 0, originY: 0, width: 0, height: 4, radius: 0, charges: [1] },
	{ originX: 0, originY: 0, width: 4, height: 0, radius: 0, charges: [1] },
	{ originX: 9, originY: 0, width: 4, height: 4, radius: 2, charges: [1] },
	{ originX: 0, originY: -9, width: 4, height: 4, radius: 2, charges: [1] },
	{
		originX: 0.51,
		originY: 0,
		width: 0.98,
		height: 1,
		radius: 0,
		charges: [1],
	},
	{
		originX: 0.5,
		originY: 0.5,
		width: 0.25,
		height: 0.25,
		radius: 0.125,
		charges: [1, 2],
	},
])(
	"skips uncovered pixels and unnecessary alias copies: %j",
	({ originX, originY, width, height, radius, charges }) => {
		const image = createRaster(4, 4, red);
		const before = image.pixels.slice();
		const box = createRoundedBox(
			originX,
			originY,
			width,
			height,
			radii(radius),
		);
		const rectCharges: number[] = [];
		const imageCharges: number[] = [];
		expect(
			paintRoundedRect(image, box, red, (amount) => rectCharges.push(amount)),
		).toBe(0);
		expect(
			paintRoundedImage(image, image, box, (amount) =>
				imageCharges.push(amount),
			),
		).toBe(0);
		expect(rectCharges).toEqual(charges);
		expect(imageCharges).toEqual(charges);
		expect(image.pixels).toEqual(before);
	},
);
