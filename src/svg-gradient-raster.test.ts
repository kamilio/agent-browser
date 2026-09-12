import { expect, it } from "vitest";
import type { RasterImage, Rgba } from "./raster.js";
import { rasterizeSvgFills } from "./svg-fill-raster.js";
import { SvgLinearGradient } from "./svg-linear-gradient.js";
import { parseSvgPath } from "./svg-path.js";
import { projectSvgScene, rasterizeSvgScene } from "./svg-projection.js";
import type { SvgMatrix, SvgScene } from "./svg-scene-types.js";

const noCharge = () => {};
const red: Rgba = [255, 0, 0, 255];
const blue: Rgba = [0, 0, 255, 255];
const rectangle = [
	{
		closed: true,
		points: [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: 2 },
			{ x: 0, y: 2 },
		],
	},
];

function gradient(opacity = 1) {
	return new SvgLinearGradient(
		{
			x1: 0,
			y1: 0,
			x2: 4,
			y2: 0,
			stops: [
				{ offset: 0, color: red },
				{ offset: 1, color: blue },
			],
			colorInterpolation: "sRGB",
			opacity,
		},
		noCharge,
	);
}

function pixel(image: RasterImage, column: number, row = 0) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function scene(transform: SvgMatrix = [1, 0, 0, 1, 0, 0]): SvgScene {
	return Object.freeze({
		rootRef: "svg",
		viewBox: { x: 0, y: 0, width: 4, height: 2 },
		preserveAspectRatio: { alignX: 0.5, alignY: 0.5, mode: "none" as const },
		shapes: [
			{
				id: 1,
				ref: "shape",
				ancestors: [],
				path: parseSvgPath("M0 0H4V2H0Z", noCharge),
				transform,
				fill: gradient(),
				fillRule: "nonzero" as const,
				visible: true,
				pointerEvents: true,
			},
		],
		disabled: false,
		sourceCodeUnits: 0,
	});
}

it("samples a gradient at pixel centers inside the original scanline coverage", () => {
	const image = rasterizeSvgFills(
		[{ contours: rectangle, color: gradient(), fillRule: "nonzero" }],
		5,
		3,
		noCharge,
	);
	expect(pixel(image, 0)).toEqual([223, 0, 32, 255]);
	expect(pixel(image, 3, 1)).toEqual([32, 0, 223, 255]);
	expect(pixel(image, 4)).toEqual([0, 0, 0, 0]);
	expect(pixel(image, 0, 2)).toEqual([0, 0, 0, 0]);
});

it("composites gradient opacity over an earlier solid fill", () => {
	const image = rasterizeSvgFills(
		[
			{ contours: rectangle, color: [255, 255, 255, 255], fillRule: "nonzero" },
			{ contours: rectangle, color: gradient(0.5), fillRule: "nonzero" },
		],
		4,
		2,
		noCharge,
	);
	expect(pixel(image, 0)).toEqual([239, 127, 143, 255]);
});

it("retains even-odd holes for gradient fills", () => {
	const hole = {
		closed: true,
		points: [
			{ x: 1, y: 0 },
			{ x: 3, y: 0 },
			{ x: 3, y: 2 },
			{ x: 1, y: 2 },
		],
	};
	const image = rasterizeSvgFills(
		[
			{
				contours: [...rectangle, hole],
				color: gradient(),
				fillRule: "evenodd",
			},
		],
		4,
		2,
		noCharge,
	);
	expect(pixel(image, 0)).toEqual([223, 0, 32, 255]);
	expect(pixel(image, 1)).toEqual([0, 0, 0, 0]);
	expect(pixel(image, 2)).toEqual([0, 0, 0, 0]);
	expect(pixel(image, 3)).toEqual([32, 0, 223, 255]);
});

it("charges sample work and propagates exhaustion during rendering", () => {
	const fills = [
		{ contours: rectangle, color: gradient(), fillRule: "nonzero" as const },
	];
	let work = 0;
	rasterizeSvgFills(fills, 4, 2, (amount) => {
		work += amount;
	});
	let remaining = work - 1;
	const marker = new Error("gradient raster exhausted");
	expect(() =>
		rasterizeSvgFills(fills, 4, 2, (amount) => {
			remaining -= amount;
			if (remaining < 0) throw marker;
		}),
	).toThrow(marker);
});

it("rejects a spoofed gradient instead of calling arbitrary sampling code", () => {
	let sampled = false;
	const color = {
		kind: "linear-gradient",
		sample() {
			sampled = true;
			return red;
		},
	} as unknown as SvgLinearGradient;
	expect(() =>
		rasterizeSvgFills(
			[{ contours: rectangle, color, fillRule: "nonzero" }],
			4,
			2,
			noCharge,
		),
	).toThrow("Invalid SVG fill color");
	expect(sampled).toBe(false);
});

it("projects the gradient with the same nonuniform viewport transform as geometry", () => {
	const image = rasterizeSvgScene(scene(), 8, 2, noCharge);
	expect(pixel(image, 0)).toEqual([239, 0, 16, 255]);
	expect(pixel(image, 7)).toEqual([16, 0, 239, 255]);
});

it("preserves affine gradient normals under a painted shape shear", () => {
	const projection = projectSvgScene(scene([1, 0, 1, 1, 0, 0]), 4, 2, noCharge);
	const paint = projection.shapes[0].fill;
	expect(paint).toBeInstanceOf(SvgLinearGradient);
	if (!(paint instanceof SvgLinearGradient))
		throw new Error("Missing projected gradient");
	expect(paint.sample(2, 1, noCharge)).toEqual([191, 0, 64, 255]);
	expect(paint.sample(3, 2, noCharge)).toEqual([191, 0, 64, 255]);
});

it("scales the gradient into rounded raster dimensions for fractional viewports", () => {
	const image = rasterizeSvgScene(scene(), 3.5, 1.5, noCharge);
	expect([image.width, image.height]).toEqual([4, 2]);
	expect(pixel(image, 0)).toEqual([223, 0, 32, 255]);
	expect(pixel(image, 3, 1)).toEqual([32, 0, 223, 255]);
});

it("does not mutate a gradient when projecting a cached scene at another size", () => {
	const input = scene();
	const original = input.shapes[0].fill;
	const first = projectSvgScene(input, 4, 2, noCharge);
	expect(projectSvgScene(input, 4, 2, noCharge)).toBe(first);
	projectSvgScene(input, 8, 4, noCharge);
	expect(input.shapes[0].fill).toBe(original);
	expect(rasterizeSvgScene(input, 4, 2, noCharge).pixels).toEqual(
		rasterizeSvgFills(
			[{ contours: rectangle, color: gradient(), fillRule: "nonzero" }],
			4,
			2,
			noCharge,
		).pixels,
	);
});
