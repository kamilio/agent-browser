import { afterEach, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { RasterImage, Rgba } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import * as clipRaster from "./svg-clip-raster.js";
import { svgFillLimits } from "./svg-fill-raster.js";
import { SvgLinearGradient } from "./svg-linear-gradient.js";
import { parseSvgPath } from "./svg-path.js";
import {
	projectSvgScene,
	rasterizeSvgScene,
	svgShapeContains,
} from "./svg-projection.js";
import * as svgScene from "./svg-scene.js";
import type {
	SvgMatrix,
	SvgScene,
	SvgSceneClip,
	SvgSceneClipShape,
	SvgSceneShape,
} from "./svg-scene-types.js";

const noCharge = () => {};
const red: Rgba = [255, 0, 0, 255];
const blue: Rgba = [0, 0, 255, 255];
const green: Rgba = [0, 255, 0, 255];
const clear: Rgba = [0, 0, 0, 0];
const square = "M0 0H20V20H0Z";
const circle = "M16 10A6 6 0 1 1 4 10A6 6 0 1 1 16 10Z";

afterEach(() => vi.restoreAllMocks());

function clipShape(
	path = circle,
	options: Partial<SvgSceneClipShape> = {},
): SvgSceneClipShape {
	return {
		path: parseSvgPath(path, noCharge),
		transform: [1, 0, 0, 1, 0, 0],
		fillRule: "nonzero",
		...options,
	};
}

function clip(...shapes: SvgSceneClipShape[]): SvgSceneClip {
	return Object.freeze({ shapes: Object.freeze(shapes) });
}

function shape(
	path = square,
	options: Partial<SvgSceneShape> = {},
): SvgSceneShape {
	return {
		id: 1,
		ref: "shape",
		ancestors: [],
		path: parseSvgPath(path, noCharge),
		transform: [1, 0, 0, 1, 0, 0],
		fill: red,
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

it("clips to curved geometry rather than its bounding rectangle", () => {
	const source = scene([shape(square, { clips: [clip(clipShape())] })]);
	const projected = projectSvgScene(source, 20, 20, noCharge).shapes[0];
	expect(projected.bounds).toEqual({ x: 0, y: 0, width: 20, height: 20 });
	expect(projected.paintBounds?.x).toBeCloseTo(4, 1);
	expect(projected.paintBounds?.y).toBeCloseTo(4, 1);
	expect(projected.paintBounds?.width).toBeCloseTo(12, 1);
	expect(projected.paintBounds?.height).toBeCloseTo(12, 1);
	expect(svgShapeContains(projected, 4.5, 4.5, noCharge)).toBe(false);
	expect(svgShapeContains(projected, 10.5, 4.5, noCharge)).toBe(true);
	const image = rasterizeSvgScene(source, 20, 20, noCharge);
	expect(pixel(image, 4, 4)).toEqual(clear);
	expect(pixel(image, 10, 4)).toEqual(red);
	expect(pixel(image, 10, 10)).toEqual(red);
});

it("unions opposite-winding clip shapes without canceling or accumulating alpha", () => {
	const source = scene([
		shape(square, {
			fill: [255, 0, 0, 128],
			clips: [clip(clipShape("M2 2H10V10H2Z"), clipShape("M8 2V10H16V2Z"))],
		}),
	]);
	const projected = projectSvgScene(source, 20, 20, noCharge).shapes[0];
	expect(projected.paintBounds).toEqual({ x: 2, y: 2, width: 14, height: 8 });
	const image = rasterizeSvgScene(source, 20, 20, noCharge);
	for (const column of [3, 9, 14]) {
		expect(pixel(image, column, 5)).toEqual([255, 0, 0, 128]);
		expect(svgShapeContains(projected, column + 0.5, 5.5, noCharge)).toBe(true);
	}
	expect(pixel(image, 17, 5)).toEqual(clear);
});

it("intersects distinct clip regions instead of unioning them", () => {
	const source = scene([
		shape(square, {
			clips: [
				clip(clipShape("M2 2H10V10H2Z")),
				clip(clipShape("M8 2H16V10H8Z")),
			],
		}),
	]);
	const projected = projectSvgScene(source, 20, 20, noCharge).shapes[0];
	expect(projected.paintBounds).toEqual({ x: 8, y: 2, width: 2, height: 8 });
	const image = rasterizeSvgScene(source, 20, 20, noCharge);
	expect(pixel(image, 3, 5)).toEqual(clear);
	expect(pixel(image, 9, 5)).toEqual(red);
	expect(pixel(image, 14, 5)).toEqual(clear);
	expect(svgShapeContains(projected, 3.5, 5.5, noCharge)).toBe(false);
	expect(svgShapeContains(projected, 9.5, 5.5, noCharge)).toBe(true);
});

it.each(["evenodd", "nonzero"] as const)(
	"uses the clip's %s rule independently of the painted fill rule",
	(fillRule) => {
		const source = scene([
			shape(square, {
				fillRule: fillRule === "evenodd" ? "nonzero" : "evenodd",
				clips: [clip(clipShape("M2 2H18V18H2Z M6 6H14V14H6Z", { fillRule }))],
			}),
		]);
		const projected = projectSvgScene(source, 20, 20, noCharge).shapes[0];
		const image = rasterizeSvgScene(source, 20, 20, noCharge);
		expect(pixel(image, 3, 3)).toEqual(red);
		expect(pixel(image, 10, 10)).toEqual(fillRule === "evenodd" ? clear : red);
		expect(svgShapeContains(projected, 10.5, 10.5, noCharge)).toBe(
			fillRule === "nonzero",
		);
	},
);

it("retains even-odd painted holes inside a nonzero clip", () => {
	const source = scene([
		shape("M0 0H20V20H0Z M6 6H14V14H6Z", {
			fillRule: "evenodd",
			clips: [clip(clipShape(square))],
		}),
	]);
	const projected = projectSvgScene(source, 20, 20, noCharge).shapes[0];
	expect(svgShapeContains(projected, 10, 10, noCharge)).toBe(false);
	expect(pixel(rasterizeSvgScene(source, 20, 20, noCharge), 10, 10)).toEqual(
		clear,
	);
});

it.each([
	{ name: "absent clips", clips: undefined, painted: true },
	{ name: "empty clips array", clips: [], painted: true },
	{ name: "empty clip region", clips: [clip()], painted: false },
	{ name: "empty clip path", clips: [clip(clipShape(""))], painted: false },
	{
		name: "disjoint intersection",
		clips: [clip(clipShape("M0 0H4V4H0Z")), clip(clipShape("M6 6H10V10H6Z"))],
		painted: false,
	},
])("distinguishes $name", ({ clips, painted }) => {
	const source = scene([shape(square, { clips })]);
	const projected = projectSvgScene(source, 20, 20, noCharge).shapes[0];
	expect(projected.bounds).toEqual({ x: 0, y: 0, width: 20, height: 20 });
	expect(projected.paintBounds !== null).toBe(painted);
	expect(svgShapeContains(projected, 2.5, 2.5, noCharge)).toBe(painted);
	expect(pixel(rasterizeSvgScene(source, 20, 20, noCharge), 2, 2)).toEqual(
		painted ? red : clear,
	);
});

it.each([
	{ transform: [1, 0, 0, 1, 8, 0] as SvgMatrix, clipPath: "M2 2H6V6H2Z" },
	{ transform: [-1, 0, 0, 1, 16, 0] as SvgMatrix, clipPath: "M2 2H6V6H2Z" },
])(
	"does not reapply the painted transform to root-space clip geometry $transform",
	({ transform, clipPath }) => {
		const source = scene([
			shape("M0 0H10V10H0Z", {
				transform: [1, 0, 0, 1, 8, 0],
				clips: [clip(clipShape(clipPath, { transform }))],
			}),
		]);
		const projected = projectSvgScene(source, 20, 20, noCharge).shapes[0];
		expect(projected.bounds).toEqual({ x: 8, y: 0, width: 10, height: 10 });
		expect(projected.paintBounds).toEqual({ x: 10, y: 2, width: 4, height: 4 });
		expect(svgShapeContains(projected, 11, 3, noCharge)).toBe(true);
		expect(svgShapeContains(projected, 17, 3, noCharge)).toBe(false);
		expect(pixel(rasterizeSvgScene(source, 20, 20, noCharge), 11, 3)).toEqual(
			red,
		);
	},
);

it("composes viewBox scaling and clip skew for raster and hit geometry", () => {
	const source: SvgScene = {
		...scene([
			shape(square, {
				clips: [
					clip(clipShape("M2 2H8V8H2Z", { transform: [1, 0, 1, 1, 0, 0] })),
				],
			}),
		]),
		viewBox: { x: 0, y: 0, width: 20, height: 20 },
	};
	const projected = projectSvgScene(source, 40, 20, noCharge).shapes[0];
	expect(projected.paintBounds).toEqual({ x: 8, y: 2, width: 24, height: 6 });
	expect(svgShapeContains(projected, 15.5, 4.5, noCharge)).toBe(true);
	expect(svgShapeContains(projected, 10.5, 6.5, noCharge)).toBe(false);
	const image = rasterizeSvgScene(source, 40, 20, noCharge);
	expect(pixel(image, 15, 4)).toEqual(red);
	expect(pixel(image, 10, 6)).toEqual(clear);
});

it("converts clip coordinates to the fractional viewport's raster space", () => {
	const source = scene([
		shape("M0 0H2.5V1.5H0Z", {
			clips: [clip(clipShape("M0.5 0.5H2V1.5H0.5Z"))],
		}),
	]);
	const image = rasterizeSvgScene(source, 2.5, 1.5, noCharge);
	expect([image.width, image.height]).toEqual([3, 2]);
	expect(pixel(image, 1, 1)).toEqual(red);
	expect(pixel(image, 0, 1)).toEqual(clear);
	expect(pixel(image, 2, 1)).toEqual(clear);
	expect(pixel(image, 1, 0)).toEqual(clear);
});

it("clips strokes without changing zero-height geometric bounds", () => {
	const source = scene([
		shape("M2 10H18", {
			fill: null,
			stroke: {
				paint: blue,
				width: 6,
				lineCap: "round",
				lineJoin: "round",
				miterLimit: 4,
			},
			clips: [clip(clipShape("M8 0H12V20H8Z"))],
		}),
	]);
	const projected = projectSvgScene(source, 20, 20, noCharge).shapes[0];
	expect(projected.bounds).toEqual({ x: 2, y: 10, width: 16, height: 0 });
	expect(projected.paintBounds).toEqual({ x: 8, y: 7, width: 4, height: 6 });
	expect(svgShapeContains(projected, 9, 8, noCharge)).toBe(true);
	expect(svgShapeContains(projected, 6, 8, noCharge)).toBe(false);
	const image = rasterizeSvgScene(source, 20, 20, noCharge);
	expect(pixel(image, 9, 8)).toEqual(blue);
	expect(pixel(image, 6, 8)).toEqual(clear);
});

it("clips gradient paint without changing gradient coordinates", () => {
	const paint = new SvgLinearGradient(
		{
			x1: 0,
			y1: 0,
			x2: 20,
			y2: 0,
			stops: [
				{ offset: 0, color: red },
				{ offset: 1, color: blue },
			],
		},
		noCharge,
	);
	const source = scene([
		shape(square, { fill: paint, clips: [clip(clipShape())] }),
	]);
	const image = rasterizeSvgScene(source, 20, 20, noCharge);
	expect(pixel(image, 4, 4)).toEqual(clear);
	expect(pixel(image, 10, 10)).toEqual(paint.sample(10.5, 10.5, noCharge));
});

it("clips fill and stroke together after isolated shape opacity", () => {
	const source = scene([
		shape("M4 4H16V16H4Z", {
			stroke: {
				paint: blue,
				width: 4,
				lineCap: "butt",
				lineJoin: "miter",
				miterLimit: 4,
			},
			opacity: 0.5,
			clips: [clip(clipShape("M0 0H10V20H0Z"))],
		}),
	]);
	const image = rasterizeSvgScene(source, 20, 20, noCharge);
	expect(pixel(image, 4, 8)).toEqual([0, 0, 255, 128]);
	expect(pixel(image, 8, 8)).toEqual([255, 0, 0, 128]);
	expect(pixel(image, 15, 8)).toEqual(clear);
});

it("preserves shape order across unclipped, clipped opaque, and opacity batches", () => {
	const source = scene([
		shape(),
		shape(square, {
			fill: blue,
			opacity: 0.5,
			clips: [clip(clipShape("M0 0H12V20H0Z"))],
		}),
		shape(square, { fill: green, clips: [clip(clipShape("M10 0H14V20H10Z"))] }),
		shape("M2 0H4V20H2Z", { fill: blue }),
	]);
	const image = rasterizeSvgScene(source, 20, 20, noCharge);
	expect(pixel(image, 8, 8)).toEqual([127, 0, 128, 255]);
	expect(pixel(image, 11, 8)).toEqual(green);
	expect(pixel(image, 13, 8)).toEqual(green);
	expect(pixel(image, 16, 8)).toEqual(red);
	expect(pixel(image, 2, 8)).toEqual(blue);
});

it("shares projected regions and equivalent clip arrays without mutating the source", () => {
	const region = clip(clipShape());
	const clips = Object.freeze([region]);
	const source = scene([
		shape(square, { clips }),
		shape(square, { clips: Object.freeze([region, region]) }),
		shape(square, { clips: Object.freeze([region]) }),
	]);
	const projected = projectSvgScene(source, 20, 20, noCharge);
	expect(projected.shapes[0].clips).toBe(clips);
	expect(projected.shapes[0].clipRegions).toBe(projected.shapes[1].clipRegions);
	expect(projected.shapes[0].clipRegions).toBe(projected.shapes[2].clipRegions);
	expect(projected.shapes[0].clipRegions).toHaveLength(1);
	expect(Object.isFrozen(projected.shapes[0].clipRegions[0].fills)).toBe(true);
	expect(projectSvgScene(source, 20, 20, noCharge)).toBe(projected);
	const resized = projectSvgScene(source, 40, 40, noCharge);
	expect(resized.shapes[0].clipRegions[0]).not.toBe(
		projected.shapes[0].clipRegions[0],
	);
});

it("batches only adjacent opaque shapes with identical clip regions", () => {
	const region = clip(clipShape());
	const applyClip = vi.spyOn(clipRaster, "clipSvgRaster");
	rasterizeSvgScene(
		scene([
			shape(square, { clips: [region] }),
			shape(square, { fill: blue, clips: [region] }),
		]),
		20,
		20,
		noCharge,
	);
	expect(applyClip).toHaveBeenCalledTimes(1);
	expect(Object.keys(applyClip.mock.calls[0][1][0][0]).sort()).toEqual([
		"contours",
		"fillRule",
	]);
	applyClip.mockClear();
	rasterizeSvgScene(
		scene([
			shape(square, { clips: [region] }),
			shape(square, { fill: blue, clips: [clip(clipShape("M0 0H10V20H0Z"))] }),
		]),
		20,
		20,
		noCharge,
	);
	expect(applyClip).toHaveBeenCalledTimes(2);
	applyClip.mockClear();
	rasterizeSvgScene(
		scene([shape(), shape(square, { fill: blue })]),
		20,
		20,
		noCharge,
	);
	expect(applyClip).not.toHaveBeenCalled();
});

it("counts shared clip geometry once across many painted descendants", () => {
	const empty = clipShape("");
	const region = clip(
		...Array.from({ length: 1500 }, () => empty),
		clipShape("M0 0H1V1H0Z"),
	);
	const source = scene(
		Array.from({ length: 2000 }, () =>
			shape("M0 0H1V1H0Z", { clips: [region] }),
		),
	);
	const projected = projectSvgScene(source, 1, 1, noCharge);
	expect(projected.shapes[0].clipRegions).toBe(
		projected.shapes[1999].clipRegions,
	);
	expect(pixel(rasterizeSvgScene(source, 1, 1, noCharge), 0, 0)).toEqual(red);
});

it("counts clip geometry together with filled and stroked path points", () => {
	const long = clipShape(`M0 0${"L1 1L2 0".repeat(5000)}`);
	const region = clip(long, long, long);
	const source = scene([
		shape("M2 4H6 ".repeat(6000), {
			fill: null,
			stroke: {
				paint: red,
				width: 2,
				lineCap: "butt",
				lineJoin: "miter",
				miterLimit: 4,
			},
			clips: [region],
		}),
	]);
	expect(() => projectSvgScene(source, 20, 20, noCharge)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("limits each source clip array before deduplicating empty regions", () => {
	const region = clip();
	const source = scene([
		shape("", { clips: Array.from({ length: 65 }, () => region) }),
	]);
	expect(() => projectSvgScene(source, 20, 20, noCharge)).toThrow(
		"SVG clip region limit exceeded",
	);
});

it("bounds unique empty clip regions across the whole projection", () => {
	const source = scene(
		Array.from({ length: 65 }, () =>
			shape("", {
				fill: null,
				clips: Array.from({ length: 64 }, () => clip()),
			}),
		),
	);
	expect(() => projectSvgScene(source, 20, 20, noCharge)).toThrow(
		"SVG clip region limit exceeded",
	);
});

it("does not let empty clip shapes bypass global fill limits", () => {
	const empty = clipShape("");
	const first = clip(
		...Array.from({ length: svgFillLimits.maxShapes / 2 }, () => empty),
	);
	const second = clip(
		...Array.from({ length: svgFillLimits.maxShapes / 2 }, () => empty),
	);
	const source = scene([
		shape("", { opacity: 0.5, clips: [first] }),
		shape("", { opacity: 0.5, clips: [second] }),
	]);
	expect(() => rasterizeSvgScene(source, 1, 1, noCharge)).toThrow(
		"SVG shape limit exceeded",
	);
});

it("bounds clip-shape and painted-shape arrays with empty geometry", () => {
	const empty = clipShape("");
	const source = scene([
		shape("", {
			clips: [
				clip(
					...Array.from({ length: svgFillLimits.maxShapes + 1 }, () => empty),
				),
			],
		}),
	]);
	expect(() => projectSvgScene(source, 1, 1, noCharge)).toThrow(
		"SVG shape limit exceeded",
	);
	expect(() =>
		projectSvgScene(
			scene(
				Array.from({ length: svgFillLimits.maxShapes + 1 }, () => shape("")),
			),
			1,
			1,
			noCharge,
		),
	).toThrow("SVG shape limit exceeded");
});

it("combines unique clip and painted contours under the global contour cap", () => {
	const source = scene([
		shape("M0 0 ".repeat(9000), {
			clips: [clip(clipShape("M0 0 ".repeat(9000)))],
		}),
	]);
	expect(() => projectSvgScene(source, 1, 1, noCharge)).toThrow(
		"SVG contour limit exceeded",
	);
});

it("propagates bounded work failures from clip projection and mask application", () => {
	const source = scene([shape(square, { clips: [clip(clipShape())] })]);
	const stop = new Error("fixture clip work limit");
	let work = 0;
	expect(() =>
		projectSvgScene(source, 20, 20, (amount) => {
			work += amount;
			if (work > 100) throw stop;
		}),
	).toThrow(stop);
	projectSvgScene(source, 20, 20, noCharge);
	const original = clipRaster.clipSvgRaster;
	vi.spyOn(clipRaster, "clipSvgRaster").mockImplementation(
		(image, regions, charge) => {
			let clipWork = 0;
			original(image, regions, (amount) => {
				clipWork += amount;
				if (clipWork > 100) throw stop;
				charge(amount);
			});
		},
	);
	expect(() => rasterizeSvgScene(source, 20, 20, noCharge)).toThrow(stop);
});

it.each([
	{
		name: "curved clip",
		clips: [clip(clipShape())],
		visible: true,
		pointerEvents: true,
		hit: true,
	},
	{
		name: "empty clip",
		clips: [clip()],
		visible: true,
		pointerEvents: true,
		hit: false,
	},
	{
		name: "hidden clipped shape",
		clips: [clip(clipShape())],
		visible: false,
		pointerEvents: true,
		hit: false,
	},
	{
		name: "pointer-disabled clipped shape",
		clips: [clip(clipShape())],
		visible: true,
		pointerEvents: false,
		hit: false,
	},
])("preserves document hit guards and unclipped BCR for $name", (fixture) => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0}svg{display:block}</style><svg id="root" width="20" height="20"><path id="paint" d="M0 0H20V20H0Z"/></svg>',
		"https://fixture.invalid/svg-clip-projection",
	);
	const queries = new DocumentQueries(tree);
	try {
		const root = queries.querySelector("#root");
		const target = queries.querySelector("#paint");
		if (root === null || target === null)
			throw new Error("Missing clip fixture");
		const source: SvgScene = {
			...scene([
				shape(square, {
					id: target,
					ref: tree.reference(target),
					clips: fixture.clips,
					visible: fixture.visible,
					pointerEvents: fixture.pointerEvents,
				}),
			]),
			rootRef: tree.reference(root),
		};
		vi.spyOn(svgScene, "documentSvgScene").mockReturnValue(source);
		documentStyles(tree).setViewport(40, 40);
		const hits = documentHitTesting(tree);
		expect(hits.elementFromPoint(10, 10) === target).toBe(fixture.hit);
		expect(hits.elementsFromPoint(4.5, 4.5)).not.toContain(target);
		expect(hits.elementsFromPoint(22, 10)).not.toContain(target);
		expect(documentGeometry(tree).getBoundingClientRect(target)).toMatchObject({
			x: 0,
			y: 0,
			width: 20,
			height: 20,
		});
		tree.setAttribute(target, "inert", "");
		expect(hits.elementsFromPoint(10, 10)).not.toContain(target);
	} finally {
		queries.close();
		tree.close();
	}
});
