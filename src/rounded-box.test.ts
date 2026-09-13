import { expect, test } from "vitest";
import { layoutValueLimits } from "./layout-values.js";
import {
	createRoundedBox,
	insetRoundedBox,
	roundedBoxContains,
	roundedBoxSpan,
	validateRoundedBox,
	type CornerRadii,
	type RoundedBox,
} from "./rounded-box.js";

const square: CornerRadii = [
	{ horizontal: 0, vertical: 0 },
	{ horizontal: 0, vertical: 0 },
	{ horizontal: 0, vertical: 0 },
	{ horizontal: 0, vertical: 0 },
];

function uniform(horizontal: number, vertical = horizontal): CornerRadii {
	return [
		{ horizontal, vertical },
		{ horizontal, vertical },
		{ horizontal, vertical },
		{ horizontal, vertical },
	];
}

test("copies and freezes rounded geometry without retaining mutable inputs", () => {
	const radii = uniform(4, 2);
	const box = createRoundedBox(-2, 3, 20, 10, radii);
	expect(box).toEqual({ x: -2, y: 3, width: 20, height: 10, radii });
	expect(box.radii).not.toBe(radii);
	expect(Object.isFrozen(box)).toBe(true);
	expect(Object.isFrozen(box.radii)).toBe(true);
	for (let index = 0; index < 4; index++) {
		expect(box.radii[index]).not.toBe(radii[index]);
		expect(Object.isFrozen(box.radii[index])).toBe(true);
	}
});

test("normalizes negative zero without changing ordinary square geometry", () => {
	const box = createRoundedBox(-0, -0, 10, 20, uniform(-0));
	expect(Object.is(box.x, -0)).toBe(false);
	expect(Object.is(box.y, -0)).toBe(false);
	expect(Object.is(box.radii[0].horizontal, -0)).toBe(false);
	expect(roundedBoxSpan(box, 0)).toEqual({ left: 0, right: 10 });
	expect(roundedBoxContains(box, 0, 0)).toBe(true);
	expect(roundedBoxContains(box, 10, 0)).toBe(false);
	expect(roundedBoxContains(box, 0, 20)).toBe(false);
});

test("scales all eight components by one minimum overlap factor", () => {
	const radii: CornerRadii = [
		{ horizontal: 10, vertical: 10 },
		{ horizontal: 10, vertical: 20 },
		{ horizontal: 30, vertical: 20 },
		{ horizontal: 10, vertical: 10 },
	];
	const box = createRoundedBox(0, 0, 20, 10, radii);
	expect(box.radii).toEqual([
		{ horizontal: 2.5, vertical: 2.5 },
		{ horizontal: 2.5, vertical: 5 },
		{ horizontal: 7.5, vertical: 5 },
		{ horizontal: 2.5, vertical: 2.5 },
	]);
	expect(radii[2].horizontal).toBe(30);
});

test("does not enlarge radii when adjacent sums fit", () => {
	const radii = uniform(3, 2);
	expect(createRoundedBox(0, 0, 40, 20, radii).radii).toEqual(radii);
});

test("normalization retains specified zero-axis contributions before shape clipping", () => {
	const box = createRoundedBox(0, 0, 10, 10, [
		{ horizontal: 8, vertical: 0 },
		{ horizontal: 8, vertical: 4 },
		...square.slice(2),
	] as unknown as CornerRadii);
	expect(box.radii[0]).toEqual({ horizontal: 5, vertical: 0 });
	expect(box.radii[1]).toEqual({ horizontal: 5, vertical: 2.5 });
	expect(roundedBoxSpan(box, 0.5)?.left).toBe(0);
});

test.each([
	[0, 10],
	[10, 0],
	[0, 0],
])("empty %s by %s boxes produce no coverage", (width, height) => {
	const box = createRoundedBox(2, 3, width, height, uniform(10));
	expect(roundedBoxSpan(box, 3)).toBeUndefined();
	expect(roundedBoxContains(box, 2, 3)).toBe(false);
	expect(box.radii).toEqual(square);
});

test("circle spans use elliptical intersections and half-open coverage", () => {
	const box = createRoundedBox(0, 0, 10, 10, uniform(5));
	expect(roundedBoxSpan(box, 5)).toEqual({ left: 0, right: 10 });
	const upper = roundedBoxSpan(box, 1);
	expect(upper?.left).toBeCloseTo(2);
	expect(upper?.right).toBeCloseTo(8);
	expect(roundedBoxContains(box, 5, 1)).toBe(true);
	expect(roundedBoxContains(box, 1.9, 1)).toBe(false);
	expect(roundedBoxContains(box, 8.1, 1)).toBe(false);
	expect(roundedBoxSpan(box, 0)).toBeUndefined();
	expect(roundedBoxSpan(box, 10)).toBeUndefined();
});

test("elliptical horizontal and vertical radii remain independent", () => {
	const box = createRoundedBox(2, -3, 20, 10, uniform(10, 5));
	const span = roundedBoxSpan(box, -2);
	expect(span?.left).toBeCloseTo(6);
	expect(span?.right).toBeCloseTo(18);
	expect(roundedBoxContains(box, 12, 2)).toBe(true);
	expect(roundedBoxContains(box, 3, -2)).toBe(false);
});

test.each([0, 1, 2, 3])(
	"only corner %s cuts out its own quadrant",
	(corner) => {
		const radii = square.map((radius, index) =>
			index === corner ? { horizontal: 4, vertical: 4 } : radius,
		) as unknown as CornerRadii;
		const box = createRoundedBox(0, 0, 12, 12, radii);
		const points = [
			[0.5, 0.5],
			[11.5, 0.5],
			[11.5, 11.5],
			[0.5, 11.5],
		];
		for (const [index, point] of points.entries())
			expect(roundedBoxContains(box, point[0], point[1])).toBe(
				index !== corner,
			);
	},
);

test.each([
	[0, 5],
	[5, 0],
])(
	"either zero ellipse axis gives a square corner (%s,%s)",
	(horizontal, vertical) => {
		const box = createRoundedBox(0, 0, 10, 10, uniform(horizontal, vertical));
		expect(roundedBoxSpan(box, 0.5)).toEqual({ left: 0, right: 10 });
		expect(roundedBoxSpan(box, 9.5)).toEqual({ left: 0, right: 10 });
	},
);

test("insets subtract the corresponding axes without changing the outer box", () => {
	const outer = createRoundedBox(10, 20, 100, 80, uniform(40, 30));
	const inner = insetRoundedBox(outer, {
		top: 5,
		right: 10,
		bottom: 15,
		left: 20,
	});
	expect(inner).toEqual({
		x: 30,
		y: 25,
		width: 70,
		height: 60,
		radii: [
			{ horizontal: 20, vertical: 25 },
			{ horizontal: 30, vertical: 25 },
			{ horizontal: 30, vertical: 15 },
			{ horizontal: 20, vertical: 15 },
		],
	});
	expect(outer.radii).toEqual(uniform(40, 30));
	expect(Object.isFrozen(inner)).toBe(true);
	expect(Object.isFrozen(inner.radii[0])).toBe(true);
});

test("insets clamp exhausted axes to square corners", () => {
	const outer = createRoundedBox(0, 0, 20, 20, uniform(4, 3));
	const inner = insetRoundedBox(outer, {
		top: 4,
		right: 5,
		bottom: 4,
		left: 5,
	});
	expect(inner.radii).toEqual(square);
	expect(roundedBoxSpan(inner, 5)).toEqual({ left: 5, right: 15 });
});

test("thick opposite insets retain partial inner arcs without renormalizing", () => {
	const outer = createRoundedBox(0, 0, 100, 50, [
		square[0],
		{ horizontal: 40, vertical: 20 },
		square[2],
		square[3],
	]);
	const inner = insetRoundedBox(outer, {
		top: 0,
		right: 0,
		bottom: 0,
		left: 70,
	});
	expect(inner.width).toBe(30);
	expect(inner.radii[1]).toEqual({ horizontal: 40, vertical: 20 });
	expect(roundedBoxSpan(inner, 5)?.right).toBeCloseTo(
		60 + 40 * Math.sqrt(7 / 16),
	);
	expect(roundedBoxContains(inner, 90, 5)).toBe(false);
	expect(roundedBoxContains(inner, 80, 5)).toBe(true);
	expect(roundedBoxSpan(inner, 0)).toBeUndefined();
});

test("padding then content insets preserve the same surviving ellipse centers", () => {
	const outer = createRoundedBox(0, 0, 100, 80, uniform(40, 30));
	const padding = insetRoundedBox(outer, {
		top: 3,
		right: 4,
		bottom: 5,
		left: 6,
	});
	const content = insetRoundedBox(padding, {
		top: 7,
		right: 8,
		bottom: 9,
		left: 10,
	});
	expect(content).toEqual(
		insetRoundedBox(outer, { top: 10, right: 12, bottom: 14, left: 16 }),
	);
});

test("exhausted inset rectangles stay empty within original bounds", () => {
	const outer = createRoundedBox(-2, -3, 10, 8, uniform(2));
	const inner = insetRoundedBox(outer, {
		top: 100,
		right: 30,
		bottom: 40,
		left: 50,
	});
	expect(inner).toMatchObject({ x: 8, y: 5, width: 0, height: 0 });
	expect(roundedBoxSpan(inner, 5)).toBeUndefined();
	expect(roundedBoxContains(inner, 8, 5)).toBe(false);
});

test("fractional containment and spans agree at every sampled pixel center", () => {
	const box = createRoundedBox(-1.25, 0.25, 12.5, 8.25, [
		{ horizontal: 2.5, vertical: 3.25 },
		{ horizontal: 4.75, vertical: 1.5 },
		{ horizontal: 0.75, vertical: 4.5 },
		{ horizontal: 3.5, vertical: 2.25 },
	]);
	for (let row = -2; row < 12; row++) {
		const span = roundedBoxSpan(box, row + 0.5);
		for (let column = -4; column < 16; column++)
			expect(roundedBoxContains(box, column + 0.5, row + 0.5)).toBe(
				span !== undefined &&
					column + 0.5 >= span.left &&
					column + 0.5 < span.right,
			);
	}
});

test.each([
	{ x: Number.NaN },
	{ y: Number.POSITIVE_INFINITY },
	{ width: -1 },
	{ height: -1 },
	{ width: Number.POSITIVE_INFINITY },
	{ height: Number.NaN },
	{ radii: [] },
	{ radii: [...square, square[0]] },
	{ radii: [null, ...square.slice(1)] },
	{ radii: [{ horizontal: -1, vertical: 1 }, ...square.slice(1)] },
	{ radii: [{ horizontal: 1, vertical: Number.NaN }, ...square.slice(1)] },
	{
		radii: [
			{ horizontal: Number.POSITIVE_INFINITY, vertical: 1 },
			...square.slice(1),
		],
	},
])("rejects invalid rounded box fields %j", (fields) => {
	const box = {
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		radii: square,
		...fields,
	} as unknown as RoundedBox;
	expect(() => validateRoundedBox(box)).toThrowError();
	expect(() => roundedBoxSpan(box, 1)).toThrowError();
});

test.each([null, undefined, 0, "box"])(
	"rejects malformed rounded box %j",
	(box) => {
		expect(() =>
			validateRoundedBox(box as unknown as RoundedBox),
		).toThrowError();
	},
);

test.each(["top", "right", "bottom", "left"] as const)(
	"validates the %s inset",
	(side) => {
		const box = createRoundedBox(0, 0, 10, 10, square);
		expect(() =>
			insetRoundedBox(box, {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0,
				[side]: -1,
			}),
		).toThrowError();
	},
);

test("validates factory input before overlap arithmetic", () => {
	expect(() => createRoundedBox(0, 0, -1, 10, square)).toThrowError();
	expect(() =>
		createRoundedBox(0, 0, 10, 10, [] as unknown as CornerRadii),
	).toThrowError();
});

test("enforces layout bounds on coordinates, endpoints and radii", () => {
	const maximum = layoutValueLimits.maxAbsoluteLength;
	expect(() => createRoundedBox(maximum, 0, 1, 1, square)).toThrowError();
	expect(() => createRoundedBox(0, maximum, 1, 1, square)).toThrowError();
	expect(() =>
		createRoundedBox(0, 0, 1, 1, uniform(maximum + 1)),
	).toThrowError();
	expect(
		createRoundedBox(0, 0, maximum, maximum, uniform(maximum)).radii,
	).toEqual(uniform(maximum / 2));
});

test("rejects invalid containment coordinates before answering", () => {
	const box = createRoundedBox(0, 0, 10, 10, square);
	expect(() => roundedBoxContains(box, Number.NaN, 1)).toThrowError();
	expect(() =>
		roundedBoxContains(box, 1, Number.POSITIVE_INFINITY),
	).toThrowError();
	expect(() => roundedBoxSpan(box, Number.NaN)).toThrowError();
});
