import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { rasterLimits, type RasterImage, type Rgba } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { transformSvgPoint } from "./svg-affine.js";
import { svgFillLimits } from "./svg-fill-raster.js";
import { SvgLinearGradient } from "./svg-linear-gradient.js";
import { svgFlattenLimits } from "./svg-path-flatten.js";
import { parseSvgPath } from "./svg-path.js";
import {
	projectSvgScene,
	rasterizeSvgScene,
	svgShapeContains,
} from "./svg-projection.js";
import type {
	SvgMatrix,
	SvgScene,
	SvgSceneShape,
	SvgSceneStroke,
} from "./svg-scene-types.js";

const noCharge = () => {};
const red: Rgba = [255, 0, 0, 255];
const blue: Rgba = [0, 0, 255, 255];
const clear: Rgba = [0, 0, 0, 0];

function stroke(options: Partial<SvgSceneStroke> = {}): SvgSceneStroke {
	return {
		paint: red,
		width: 2,
		lineCap: "butt",
		lineJoin: "miter",
		miterLimit: 4,
		...options,
	};
}

function shape(
	path = "M2 4H6",
	options: Partial<SvgSceneShape> = {},
): SvgSceneShape {
	return {
		id: 1,
		ref: "shape",
		ancestors: [],
		path: parseSvgPath(path, noCharge),
		transform: [1, 0, 0, 1, 0, 0],
		fill: null,
		stroke: stroke(),
		fillRule: "nonzero",
		visible: true,
		pointerEvents: true,
		...options,
	};
}

function scene(shapes: readonly SvgSceneShape[]): SvgScene {
	return {
		rootRef: "svg",
		viewBox: null,
		preserveAspectRatio: { alignX: 0.5, alignY: 0.5, mode: "none" },
		shapes,
		disabled: false,
		sourceCodeUnits: 0,
	};
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each([
	["M2 4H6", { x: 2, y: 4, width: 4, height: 0 }, 3, 3],
	["M4 2V6", { x: 4, y: 2, width: 0, height: 4 }, 3, 3],
] as const)(
	"paints and hits zero-area path bounds for %s",
	(path, bounds, across, down) => {
		const source = scene([shape(path)]);
		const projected = projectSvgScene(source, 24, 24, noCharge).shapes[0];
		expect(projected.bounds).toEqual(bounds);
		expect(projected.paintBounds?.width).toBeGreaterThan(0);
		expect(projected.paintBounds?.height).toBeGreaterThan(0);
		expect(
			svgShapeContains(projected, across + 0.5, down + 0.5, noCharge),
		).toBe(true);
		expect(
			pixel(rasterizeSvgScene(source, 24, 24, noCharge), across, down),
		).toEqual(red);
	},
);

it.each([
	{
		name: "nonuniform scale",
		transform: [2, 0, 0, 3, 2, 1] as SvgMatrix,
		bounds: { x: 6, y: 10, width: 8, height: 6 },
		inside: [7, 15],
		outside: [7, 16],
	},
	{
		name: "skew",
		transform: [1, 0, 2, 1, 0, 0] as SvgMatrix,
		bounds: { x: 8, y: 3, width: 8, height: 2 },
		inside: [13, 4],
		outside: [8, 4],
	},
	{
		name: "rotated nonuniform scale",
		transform: [0, 2, -3, 0, 20, 1] as SvgMatrix,
		bounds: { x: 5, y: 5, width: 6, height: 8 },
		inside: [5, 6],
		outside: [11, 6],
	},
	{
		name: "mirrored nonuniform scale",
		transform: [-2, 0, 0, 3, 20, 1] as SvgMatrix,
		bounds: { x: 8, y: 10, width: 8, height: 6 },
		inside: [8, 15],
		outside: [16, 15],
	},
])("transforms local stroke outlines through $name", (fixture) => {
	const source = scene([shape(undefined, { transform: fixture.transform })]);
	const projected = projectSvgScene(source, 24, 24, noCharge).shapes[0];
	expect(projected.paintBounds).toEqual(fixture.bounds);
	const inside = transformSvgPoint(fixture.transform, { x: 4, y: 4.75 });
	const outside = transformSvgPoint(fixture.transform, { x: 4, y: 5.25 });
	expect(svgShapeContains(projected, inside.x, inside.y, noCharge)).toBe(true);
	expect(svgShapeContains(projected, outside.x, outside.y, noCharge)).toBe(
		false,
	);
	const image = rasterizeSvgScene(source, 24, 24, noCharge);
	expect(pixel(image, fixture.inside[0], fixture.inside[1])).toEqual(red);
	expect(pixel(image, fixture.outside[0], fixture.outside[1])).toEqual(clear);
});

it("includes viewBox scaling in local stroke width", () => {
	const source: SvgScene = {
		...scene([shape()]),
		viewBox: { x: 0, y: 0, width: 8, height: 8 },
	};
	const projected = projectSvgScene(source, 16, 24, noCharge).shapes[0];
	expect(projected.paintBounds).toEqual({ x: 4, y: 9, width: 8, height: 6 });
	expect(pixel(rasterizeSvgScene(source, 16, 24, noCharge), 4, 14)).toEqual(
		red,
	);
});

it("resolves percentage strokes against each supplied used viewport", () => {
	const source = scene([
		shape("M4 10H16", {
			stroke: stroke({ width: 10, widthPercentage: true }),
		}),
	]);
	const small = projectSvgScene(source, 20, 20, noCharge);
	const large = projectSvgScene(source, 40, 40, noCharge);
	expect(small.shapes[0].stroke?.width).toBeCloseTo(2);
	expect(large.shapes[0].stroke?.width).toBeCloseTo(4);
	expect(small.shapes[0].paintBounds?.height).toBeCloseTo(2);
	expect(large.shapes[0].paintBounds?.height).toBeCloseTo(4);
	expect(large.shapes[0].bounds).toEqual(small.shapes[0].bounds);
	expect(large.shapes[0].stroke?.widthPercentage).toBeUndefined();
	expect(source.shapes[0].stroke).toMatchObject({
		width: 10,
		widthPercentage: true,
	});
	expect(projectSvgScene(source, 40, 40, noCharge)).toBe(large);
	expect(projectSvgScene(source, 20, 20, noCharge)).toEqual(small);
	const smallImage = rasterizeSvgScene(source, 20, 20, noCharge);
	const largeImage = rasterizeSvgScene(source, 40, 40, noCharge);
	expect(pixel(smallImage, 8, 8)).toEqual(clear);
	expect(pixel(smallImage, 8, 9)).toEqual(red);
	expect(pixel(largeImage, 8, 8)).toEqual(red);
	expect(pixel(largeImage, 8, 7)).toEqual(clear);
	expect(svgShapeContains(small.shapes[0], 8.5, 8.5, noCharge)).toBe(false);
	expect(svgShapeContains(large.shapes[0], 8.5, 8.5, noCharge)).toBe(true);
});

it("uses the normalized viewport diagonal before the shape transform", () => {
	const source = scene([
		shape("M4 4H8", {
			stroke: stroke({ width: 10, widthPercentage: true }),
			transform: [2, 0, 0, 3, 0, 0],
		}),
	]);
	const projected = projectSvgScene(source, 30, 40, noCharge).shapes[0];
	const localWidth = 5 / Math.SQRT2;
	expect(projected.stroke?.width).toBeCloseTo(localWidth);
	expect(projected.paintBounds?.height).toBeCloseTo(localWidth * 3);
	expect(projected.paintBounds?.width).toBeCloseTo(8);
});

it("retains a fixed viewBox basis for percentage strokes when resized", () => {
	const source: SvgScene = {
		...scene([
			shape("M4 10H16", {
				stroke: stroke({ width: 10, widthPercentage: true }),
			}),
		]),
		viewBox: { x: 0, y: 0, width: 20, height: 20 },
	};
	const small = projectSvgScene(source, 20, 20, noCharge).shapes[0];
	const large = projectSvgScene(source, 40, 60, noCharge).shapes[0];
	expect(small.stroke?.width).toBeCloseTo(2);
	expect(large.stroke?.width).toBeCloseTo(2);
	expect(small.paintBounds?.height).toBeCloseTo(2);
	expect(large.paintBounds?.height).toBeCloseTo(6);
	expect(large.paintBounds?.y).toBeCloseTo(27);
	expect(source.shapes[0].stroke?.widthPercentage).toBe(true);
	const image = rasterizeSvgScene(source, 40, 60, noCharge);
	expect(pixel(image, 12, 27)).toEqual(red);
	expect(pixel(image, 12, 26)).toEqual(clear);
});

it("keeps absolute local stroke widths independent of used viewport size", () => {
	const source = scene([shape("M4 10H16", { stroke: stroke({ width: 2 }) })]);
	const small = projectSvgScene(source, 20, 20, noCharge).shapes[0];
	const large = projectSvgScene(source, 40, 60, noCharge).shapes[0];
	expect(small.stroke?.width).toBe(2);
	expect(large.stroke?.width).toBe(2);
	expect(large.paintBounds).toEqual(small.paintBounds);
});

it.each([1e9, Number.MAX_VALUE, Infinity, NaN])(
	"rejects nonfinite or over-cap resolved percentage width %s",
	(width) => {
		const source = scene([
			shape(undefined, {
				stroke: stroke({ width, widthPercentage: true }),
				transform: [0.01, 0, 0, 0.01, 0, 0],
			}),
		]);
		expect(() => projectSvgScene(source, 1000, 1000, noCharge)).toThrow(
			"SVG stroke width magnitude limit exceeded",
		);
		expect(svgFlattenLimits.maxCoordinate).toBe(1e9);
	},
);

it("increases local round tessellation accuracy with the transform norm", () => {
	const source = shape(undefined, { stroke: stroke({ lineCap: "round" }) });
	const small = projectSvgScene(scene([source]), 24, 24, noCharge).shapes[0];
	const large = projectSvgScene(
		scene([{ ...source, transform: [100, 0, 0, 100, 0, 0] }]),
		24,
		24,
		noCharge,
	).shapes[0];
	const count = (contours: typeof small.strokeContours) =>
		contours.reduce((total, contour) => total + contour.points.length, 0);
	expect(count(large.strokeContours)).toBeGreaterThan(
		count(small.strokeContours),
	);
});

it.each(["butt", "round", "square"] as const)(
	"distinguishes the painted hit region of a %s cap",
	(lineCap) => {
		const source = scene([
			shape("M6 8H14", { stroke: stroke({ width: 4, lineCap }) }),
		]);
		const projected = projectSvgScene(source, 24, 24, noCharge).shapes[0];
		expect(svgShapeContains(projected, 4.5, 8, noCharge)).toBe(
			lineCap !== "butt",
		);
		expect(svgShapeContains(projected, 4.1, 6.1, noCharge)).toBe(
			lineCap === "square",
		);
		expect(svgShapeContains(projected, 3.5, 8, noCharge)).toBe(false);
	},
);

it.each(["miter", "round", "bevel"] as const)(
	"paints translucent %s joins and round caps as one union",
	(lineJoin) => {
		const image = rasterizeSvgScene(
			scene([
				shape("M4 12H12V4", {
					stroke: stroke({
						width: 6,
						lineJoin,
						lineCap: "round",
						paint: [255, 0, 0, 128],
					}),
				}),
			]),
			24,
			24,
			noCharge,
		);
		expect(pixel(image, 10, 10)).toEqual([255, 0, 0, 128]);
		expect(pixel(image, 4, 12)).toEqual([255, 0, 0, 128]);
		const alphas = new Set(
			Array.from(image.pixels).filter((_channel, index) => index % 4 === 3),
		);
		expect(alphas).toEqual(new Set([0, 128]));
	},
);

it.each([1, 4])(
	"projects the miter limit %s into paint and hit regions",
	(miterLimit) => {
		const source = scene([
			shape("M4 12H12V4", {
				stroke: stroke({ width: 6, miterLimit }),
			}),
		]);
		const projected = projectSvgScene(source, 24, 24, noCharge).shapes[0];
		expect(svgShapeContains(projected, 14.5, 14.5, noCharge)).toBe(
			miterLimit === 4,
		);
		expect(pixel(rasterizeSvgScene(source, 24, 24, noCharge), 14, 14)).toEqual(
			miterLimit === 4 ? red : clear,
		);
	},
);

it("fills before stroking without filling a stroke-only interior", () => {
	const outline = shape("M4 4H12V12H4Z", {
		stroke: stroke({ width: 4, paint: blue }),
	});
	const source = scene([{ ...outline, fill: red }]);
	const image = rasterizeSvgScene(source, 24, 24, noCharge);
	expect(pixel(image, 4, 8)).toEqual(blue);
	expect(pixel(image, 2, 8)).toEqual(blue);
	expect(pixel(image, 8, 8)).toEqual(red);
	const empty = scene([outline]);
	const projected = projectSvgScene(empty, 24, 24, noCharge).shapes[0];
	expect(svgShapeContains(projected, 8, 8, noCharge)).toBe(false);
	expect(svgShapeContains(projected, 3, 8, noCharge)).toBe(true);
	expect(pixel(rasterizeSvgScene(empty, 24, 24, noCharge), 8, 8)).toEqual(
		clear,
	);
});

it("applies shape opacity once to overlapping fill and stroke", () => {
	const image = rasterizeSvgScene(
		scene([
			shape("M4 4H12V12H4Z", {
				fill: red,
				stroke: stroke({ width: 4, paint: blue }),
				opacity: 0.5,
			}),
		]),
		24,
		24,
		noCharge,
	);
	expect(pixel(image, 4, 8)).toEqual([0, 0, 255, 128]);
	expect(pixel(image, 2, 8)).toEqual([0, 0, 255, 128]);
	expect(pixel(image, 8, 8)).toEqual([255, 0, 0, 128]);
});

it("preserves independent paint opacity inside an isolated shape", () => {
	const image = rasterizeSvgScene(
		scene([
			shape("M4 4H12V12H4Z", {
				fill: [255, 0, 0, 128],
				stroke: stroke({ width: 4, paint: [0, 0, 255, 128] }),
				opacity: 0.5,
			}),
		]),
		24,
		24,
		noCharge,
	);
	expect(pixel(image, 4, 8)).toEqual([85, 0, 170, 96]);
	expect(pixel(image, 8, 8)).toEqual([255, 0, 0, 64]);
});

it("keeps ordinary batches in order around isolated opacity layers", () => {
	const source = scene([
		shape("M0 0H20V20H0Z", { stroke: undefined, fill: red }),
		shape("M4 4H12V12H4Z", {
			fill: blue,
			stroke: stroke({ width: 4, paint: blue }),
			opacity: 0.5,
		}),
		shape("M8 0H10V20H8Z", { stroke: undefined, fill: [0, 255, 0, 255] }),
	]);
	const image = rasterizeSvgScene(source, 24, 24, noCharge);
	expect(pixel(image, 4, 8)).toEqual([127, 0, 128, 255]);
	expect(pixel(image, 8, 8)).toEqual([0, 255, 0, 255]);
	expect(pixel(image, 0, 0)).toEqual(red);
});

it.each([0, 1])("handles explicit shape opacity %s", (opacity) => {
	const source = scene([shape(undefined, { opacity })]);
	const image = rasterizeSvgScene(source, 24, 24, noCharge);
	expect(pixel(image, 3, 3)).toEqual(opacity === 0 ? clear : red);
	const projected = projectSvgScene(source, 24, 24, noCharge).shapes[0];
	expect(svgShapeContains(projected, 3.5, 3.5, noCharge)).toBe(true);
});

it("keeps transparent strokes hittable and zero-width strokes unpainted", () => {
	const transparent = scene([
		shape(undefined, { stroke: stroke({ paint: clear }) }),
	]);
	const painted = projectSvgScene(transparent, 24, 24, noCharge).shapes[0];
	expect(svgShapeContains(painted, 3.5, 3.5, noCharge)).toBe(true);
	expect(pixel(rasterizeSvgScene(transparent, 24, 24, noCharge), 3, 3)).toEqual(
		clear,
	);
	const zero = scene([shape(undefined, { stroke: stroke({ width: 0 }) })]);
	const empty = projectSvgScene(zero, 24, 24, noCharge).shapes[0];
	expect(empty.strokeContours).toEqual([]);
	expect(empty.paintBounds).toBeNull();
	expect(empty.bounds).toEqual({ x: 2, y: 4, width: 4, height: 0 });
	expect(svgShapeContains(empty, 3.5, 4, noCharge)).toBe(false);
	expect(rasterizeSvgScene(zero, 24, 24, noCharge).pixels).toEqual(
		new Uint8Array(24 * 24 * 4),
	);
});

it.each([
	["identity", [1, 0, 0, 1, 0, 0], 2, 3, [223, 0, 32, 255]],
	["skew", [1, 0, 2, 1, 0, 0], 10, 3, [159, 0, 96, 255]],
	["mirror", [-1, 0, 0, 1, 8, 0], 2, 3, [32, 0, 223, 255]],
] as const)(
	"projects gradient stroke paint through %s",
	(_name, transform, column, row, expected) => {
		const paint = new SvgLinearGradient(
			{
				x1: 2,
				y1: 4,
				x2: 6,
				y2: 4,
				stops: [
					{ offset: 0, color: red },
					{ offset: 1, color: blue },
				],
			},
			noCharge,
		);
		const source = scene([
			shape(undefined, { transform, stroke: stroke({ paint }) }),
		]);
		const projected = projectSvgScene(source, 24, 24, noCharge).shapes[0];
		const point = transformSvgPoint(transform, { x: 3, y: 4 });
		expect(projected.stroke?.paint).toBeInstanceOf(SvgLinearGradient);
		expect(
			(projected.stroke?.paint as SvgLinearGradient).sample(
				point.x,
				point.y,
				noCharge,
			),
		).toEqual(paint.sample(3, 4, noCharge));
		expect(
			pixel(rasterizeSvgScene(source, 24, 24, noCharge), column, row),
		).toEqual(expected);
	},
);

it("rescales stroke geometry and gradient samples for fractional raster sizes", () => {
	const paint = new SvgLinearGradient(
		{
			x1: 0,
			y1: 0,
			x2: 3,
			y2: 0,
			stops: [
				{ offset: 0, color: red },
				{ offset: 1, color: blue },
			],
		},
		noCharge,
	);
	const source = scene([
		shape("M0 0.5H2.5", { stroke: stroke({ width: 1, paint }) }),
	]);
	const image = rasterizeSvgScene(source, 2.5, 1, noCharge);
	expect(image.width).toBe(3);
	expect(pixel(image, 0, 0)).toEqual([220, 0, 35, 255]);
	expect(pixel(image, 2, 0)).toEqual([78, 0, 177, 255]);
});

it("clips strokes to the viewport without clipping geometric bounds", () => {
	const source = scene([shape("M-4 0H12", { stroke: stroke({ width: 4 }) })]);
	expect(projectSvgScene(source, 8, 8, noCharge).shapes[0].bounds).toEqual({
		x: -4,
		y: 0,
		width: 16,
		height: 0,
	});
	const image = rasterizeSvgScene(source, 8, 8, noCharge);
	expect(image.pixels).toHaveLength(8 * 8 * 4);
	expect(pixel(image, 0, 0)).toEqual(red);
	expect(pixel(image, 7, 1)).toEqual(red);
	expect(pixel(image, 7, 2)).toEqual(clear);
});

it("enforces the aggregate projection cap across path and stroke points", () => {
	const repeated = shape("M2 4H6 ".repeat(6000));
	expect(() =>
		projectSvgScene(scene([repeated, repeated]), 8, 8, noCharge),
	).toThrow("SVG projection point limit exceeded");
	expect(svgFlattenLimits.maxPoints).toBe(65_536);
});

it("does not reset fill caps when splitting opacity layers", () => {
	const repeated = shape(undefined, { fill: red, opacity: 0.5 });
	const source = scene(
		Array.from({ length: svgFillLimits.maxShapes / 2 + 1 }, () => repeated),
	);
	expect(() => rasterizeSvgScene(source, 8, 8, noCharge)).toThrow(
		"SVG shape limit exceeded",
	);
});

it("keeps the contour cap global across opacity layers", () => {
	const repeated = shape("M2 4 ".repeat(6000), {
		fill: red,
		stroke: undefined,
		opacity: 0.5,
	});
	expect(() =>
		rasterizeSvgScene(scene([repeated, repeated, repeated]), 8, 8, noCharge),
	).toThrow("SVG contour limit exceeded");
});

it("checks the unchanged pixel cap before projecting strokes", () => {
	const charges: number[] = [];
	expect(() =>
		rasterizeSvgScene(
			scene([shape()]),
			rasterLimits.maxDimension + 1,
			1,
			(amount) => charges.push(amount),
		),
	).toThrow("SVG viewport raster limit exceeded");
	expect(charges).toEqual([]);
});

it("charges opacity and composition passes while batching ordinary shapes", () => {
	const pass = 11 * 13 * 4;
	const calls = (opacity: number) => {
		const amounts: number[] = [];
		rasterizeSvgScene(
			scene([shape(undefined, { opacity }), shape(undefined, { opacity })]),
			11,
			13,
			(amount) => amounts.push(amount),
		);
		return amounts.filter((amount) => amount === pass).length;
	};
	expect(calls(1)).toBe(1);
	expect(calls(0.5)).toBe(5);
});

it("propagates bounded work failures during projection and opacity passes", () => {
	const source = scene([shape(undefined, { opacity: 0.5 })]);
	const stop = new Error("fixture work limit");
	let work = 0;
	expect(() =>
		projectSvgScene(source, 11, 13, (amount) => {
			work += amount;
			if (work > 40) throw stop;
		}),
	).toThrow(stop);
	projectSvgScene(source, 11, 13, noCharge);
	let passes = 0;
	expect(() =>
		rasterizeSvgScene(source, 11, 13, (amount) => {
			if (amount === 11 * 13 * 4 && ++passes === 2) throw stop;
		}),
	).toThrow(stop);
	expect(passes).toBe(2);
});

it.each(["", "visibility:hidden", "pointer-events:none"])(
	"retains document hit restrictions for stroked lines with %s",
	(style) => {
		const tree = parseHtmlDocument(
			`<!doctype html><style>html,body{margin:0}svg{display:block}</style><svg width="20" height="20"><path id="line" d="M2 4H30" fill="none" stroke="red" stroke-width="4" style="${style}"/></svg>`,
			"https://fixture.invalid/svg-stroke-hit",
		);
		const queries = new DocumentQueries(tree);
		try {
			documentStyles(tree).setViewport(40, 40);
			const target = queries.querySelector("#line");
			if (target === null) throw new Error("Missing stroke fixture");
			const hits = documentHitTesting(tree);
			expect(hits.elementFromPoint(5, 3) === target).toBe(style === "");
			expect(hits.elementsFromPoint(22, 3)).not.toContain(target);
			expect(
				documentGeometry(tree).getBoundingClientRect(target),
			).toMatchObject({ x: 2, y: 4, width: 28, height: 0 });
			tree.setAttribute(target, "inert", "");
			expect(hits.elementsFromPoint(5, 3)).not.toContain(target);
		} finally {
			queries.close();
			tree.close();
		}
	},
);
