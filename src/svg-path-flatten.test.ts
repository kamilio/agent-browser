import { expect, it } from "vitest";
import { flattenSvgPath, svgFlattenLimits } from "./svg-path-flatten.js";
import type { SvgPathSegment, SvgPoint } from "./svg-path-types.js";

const origin = { x: 0, y: 0 };
const move: SvgPathSegment = { kind: "move", end: origin };
const noCharge = () => {};

function curvePath(segment: Exclude<SvgPathSegment, { kind: "move" }>) {
	return [{ kind: "move", end: segment.start }, segment] as SvgPathSegment[];
}

function distance(point: SvgPoint, vertices: readonly SvgPoint[]) {
	let best = Number.POSITIVE_INFINITY;
	for (let index = 1; index < vertices.length; index++) {
		const start = vertices[index - 1];
		const end = vertices[index];
		const across = end.x - start.x;
		const down = end.y - start.y;
		const squared = across ** 2 + down ** 2;
		const fraction =
			squared === 0
				? 0
				: Math.max(
						0,
						Math.min(
							1,
							((point.x - start.x) * across + (point.y - start.y) * down) /
								squared,
						),
					);
		best = Math.min(
			best,
			Math.hypot(
				point.x - start.x - fraction * across,
				point.y - start.y - fraction * down,
			),
		);
	}
	return best;
}

it("returns frozen empty output and snapshots line endpoints", () => {
	expect(flattenSvgPath([], noCharge)).toEqual([]);
	expect(Object.isFrozen(flattenSvgPath([], noCharge))).toBe(true);
	const end = { x: 10, y: 20 };
	const path: SvgPathSegment[] = [move, { kind: "line", start: origin, end }];
	const result = flattenSvgPath(path, noCharge);
	expect(result).toEqual([{ points: [origin, end], closed: false }]);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result[0])).toBe(true);
	expect(Object.isFrozen(result[0].points)).toBe(true);
	expect(result[0].points.every(Object.isFrozen)).toBe(true);
	expect(Object.isFrozen(path)).toBe(false);
	expect(Object.isFrozen(end)).toBe(false);
	end.x = 99;
	expect(result[0].points[1].x).toBe(10);
});

it("keeps subpaths separate and restores the initial point on close", () => {
	const corner = { x: 10, y: 5 };
	const result = flattenSvgPath(
		[
			move,
			{ kind: "line", start: origin, end: corner },
			{ kind: "close", start: corner, end: origin },
			{ kind: "line", start: origin, end: { x: 3, y: 4 } },
			{ kind: "move", end: { x: 20, y: 30 } },
		],
		noCharge,
	);
	expect(result).toEqual([
		{ points: [origin, corner, origin], closed: true },
		{ points: [origin, { x: 3, y: 4 }], closed: false },
		{ points: [{ x: 20, y: 30 }], closed: false },
	]);
});

it("avoids duplicating a closure endpoint already reached by a line", () => {
	expect(
		flattenSvgPath(
			[move, { kind: "close", start: origin, end: origin }],
			noCharge,
		),
	).toEqual([{ points: [origin], closed: true }]);
});

it.each([0.5, 0.1, 0.01])(
	"bounds quadratic approximation at tolerance %s",
	(tolerance) => {
		const result = flattenSvgPath(
			curvePath({
				kind: "quadratic",
				start: origin,
				control: { x: 50, y: 100 },
				end: { x: 100, y: 0 },
			}),
			noCharge,
			tolerance,
		);
		expect(result[0].points.length).toBeGreaterThan(2);
		for (let index = 0; index <= 500; index++) {
			const fraction = index / 500;
			expect(
				distance(
					{ x: 100 * fraction, y: 200 * fraction * (1 - fraction) },
					result[0].points,
				),
			).toBeLessThanOrEqual(tolerance + 1e-10);
		}
	},
);

it.each([0.5, 0.1, 0.01])(
	"bounds inflected cubic approximation at tolerance %s",
	(tolerance) => {
		const result = flattenSvgPath(
			curvePath({
				kind: "cubic",
				start: origin,
				control1: { x: 25, y: 100 },
				control2: { x: 75, y: -100 },
				end: { x: 100, y: 0 },
			}),
			noCharge,
			tolerance,
		);
		for (let index = 0; index <= 500; index++) {
			const fraction = index / 500;
			const inverse = 1 - fraction;
			expect(
				distance(
					{
						x:
							75 * inverse ** 2 * fraction +
							225 * inverse * fraction ** 2 +
							100 * fraction ** 3,
						y: 300 * inverse ** 2 * fraction - 300 * inverse * fraction ** 2,
					},
					result[0].points,
				),
			).toBeLessThanOrEqual(tolerance + 1e-10);
		}
	},
);

it("does not flatten collinear overshoot or a closed cubic loop to a chord", () => {
	const quadratic = flattenSvgPath(
		curvePath({
			kind: "quadratic",
			start: origin,
			control: { x: 20, y: 0 },
			end: { x: 10, y: 0 },
		}),
		noCharge,
		0.01,
	);
	expect(
		Math.max(...quadratic[0].points.map((point) => point.x)),
	).toBeGreaterThan(13);
	const cubic = flattenSvgPath(
		curvePath({
			kind: "cubic",
			start: origin,
			control1: { x: 30, y: 100 },
			control2: { x: -30, y: 100 },
			end: origin,
		}),
		noCharge,
	);
	expect(Math.max(...cubic[0].points.map((point) => point.y))).toBe(75);
	expect(cubic[0].points.length).toBeGreaterThan(8);
});

function arc(
	overrides: Partial<Extract<SvgPathSegment, { kind: "arc" }>> = {},
) {
	return {
		kind: "arc",
		start: { x: 10, y: 0 },
		end: { x: 0, y: 10 },
		radiusX: 10,
		radiusY: 10,
		rotation: 0,
		largeArc: false,
		sweep: true,
		...overrides,
	} as Extract<SvgPathSegment, { kind: "arc" }>;
}

it.each([0.5, 0.1, 0.01])(
	"bounds circular arc approximation at tolerance %s",
	(tolerance) => {
		const points = flattenSvgPath(curvePath(arc()), noCharge, tolerance)[0]
			.points;
		for (const point of points)
			expect(Math.hypot(point.x, point.y)).toBeCloseTo(10, 10);
		for (let index = 0; index <= 500; index++) {
			const angle = (index * Math.PI) / 1000;
			expect(
				distance({ x: 10 * Math.cos(angle), y: 10 * Math.sin(angle) }, points),
			).toBeLessThanOrEqual(tolerance + 1e-10);
		}
	},
);

it("respects large-arc and sweep flags instead of replacing arcs with lines", () => {
	const small = flattenSvgPath(curvePath(arc()), noCharge)[0].points;
	const large = flattenSvgPath(curvePath(arc({ largeArc: true })), noCharge)[0]
		.points;
	expect(large.length).toBeGreaterThan(small.length * 2);
	expect(Math.max(...large.map((point) => point.x))).toBeGreaterThan(19);
	const backward = flattenSvgPath(curvePath(arc({ sweep: false })), noCharge)[0]
		.points;
	for (const point of backward)
		expect(Math.hypot(point.x - 10, point.y - 10)).toBeCloseTo(10, 10);
});

it("flattens a rotated ellipse with bounded error and exact endpoints", () => {
	const cosine = Math.cos(Math.PI / 6);
	const sine = Math.sin(Math.PI / 6);
	const segment = arc({
		start: { x: 20 * cosine, y: 20 * sine },
		end: { x: -10 * sine, y: 10 * cosine },
		radiusX: 20,
		rotation: 30,
	});
	const points = flattenSvgPath(curvePath(segment), noCharge, 0.01)[0].points;
	expect(points[0]).toEqual(segment.start);
	expect(points.at(-1)).toEqual(segment.end);
	for (let index = 0; index <= 500; index++) {
		const angle = (index * Math.PI) / 1000;
		const across = 20 * Math.cos(angle);
		const down = 10 * Math.sin(angle);
		expect(
			distance(
				{ x: across * cosine - down * sine, y: across * sine + down * cosine },
				points,
			),
		).toBeLessThanOrEqual(0.01 + 1e-10);
	}
});

it.each([2, -2, 1e-300])(
	"corrects insufficient arc radii %s without overflow",
	(radius) => {
		const points = flattenSvgPath(
			curvePath(
				arc({
					start: origin,
					end: { x: 10, y: 0 },
					radiusX: radius,
					radiusY: radius,
				}),
			),
			noCharge,
		)[0].points;
		for (const point of points)
			expect(Math.hypot(point.x - 5, point.y)).toBeCloseTo(5, 10);
		expect(points.length).toBeGreaterThan(2);
	},
);

it("normalizes full rotations and negative radii consistently", () => {
	expect(
		flattenSvgPath(
			curvePath(arc({ radiusX: -10, radiusY: -10, rotation: 720 })),
			noCharge,
		),
	).toEqual(flattenSvgPath(curvePath(arc()), noCharge));
});

it.each([true, false])(
	"retains a near-complete arc with nearly coincident endpoints: sweep=%s",
	(sweep) => {
		const points = flattenSvgPath(
			curvePath(
				arc({
					start: origin,
					end: { x: 1e-20, y: 0 },
					radiusX: 1,
					radiusY: 1,
					largeArc: true,
					sweep,
				}),
			),
			noCharge,
		)[0].points;
		expect(points.length).toBeGreaterThan(4);
		expect(
			Math.max(...points.map((point) => Math.abs(point.y))),
		).toBeGreaterThan(1.5);
	},
);

it("rejects a tolerance below representable subdivision precision", () => {
	const base = 2 ** 26;
	const start = { x: base, y: 0 };
	const end = { x: base, y: 2 };
	expect(() =>
		flattenSvgPath(
			curvePath({
				kind: "quadratic",
				start,
				control: { x: base + 2 ** -26, y: 1 },
				end,
			}),
			noCharge,
			2 ** -30,
		),
	).toThrow("precision limit");
});

it("handles zero-radius and identical-endpoint arc degeneracies", () => {
	expect(
		flattenSvgPath(curvePath(arc({ radiusX: 0 })), noCharge)[0].points,
	).toEqual([
		{ x: 10, y: 0 },
		{ x: 0, y: 10 },
	]);
	expect(
		flattenSvgPath(curvePath(arc({ end: { x: 10, y: 0 } })), noCharge)[0]
			.points,
	).toEqual([{ x: 10, y: 0 }]);
});

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects tolerance %s",
	(tolerance) => {
		expect(() => flattenSvgPath([], noCharge, tolerance)).toThrow(
			"Invalid SVG flattening tolerance",
		);
	},
);

it.each(Object.keys(svgFlattenLimits) as (keyof typeof svgFlattenLimits)[])(
	"rejects invalid %s limits",
	(name) => {
		for (const value of [
			0,
			-1,
			1.1,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			svgFlattenLimits[name] + 1,
		])
			expect(() =>
				flattenSvgPath([], noCharge, 0.25, { [name]: value }),
			).toThrow("Invalid SVG flattening limit");
	},
);

it("enforces segment, point, coordinate and subdivision bounds", () => {
	const path = curvePath(arc());
	expect(() =>
		flattenSvgPath(path, noCharge, 0.25, { maxSegments: 1 }),
	).toThrow("segment limit");
	expect(() => flattenSvgPath(path, noCharge, 0.25, { maxPoints: 2 })).toThrow(
		"point limit",
	);
	expect(() =>
		flattenSvgPath(path, noCharge, 0.25, { maxCoordinate: 5 }),
	).toThrow("coordinate limit");
	expect(() =>
		flattenSvgPath(
			curvePath({
				kind: "quadratic",
				start: origin,
				control: { x: 5, y: 100 },
				end: { x: 10, y: 0 },
			}),
			noCharge,
			0.001,
			{ maxDepth: 1 },
		),
	).toThrow("subdivision limit");
	expect(() => flattenSvgPath(path, noCharge, Number.MIN_VALUE)).toThrow(
		"precision limit",
	);
});

it("propagates owner exhaustion without mutating or freezing input", () => {
	const failure = new Error("owner exhausted");
	const path = curvePath(arc());
	const before = JSON.stringify(path);
	let work = 0;
	expect(() =>
		flattenSvgPath(path, (amount) => {
			work += amount;
			if (work > 10) throw failure;
		}),
	).toThrow(failure);
	expect(JSON.stringify(path)).toBe(before);
	expect(Object.isFrozen(path[0])).toBe(false);
	const charges: number[] = [];
	flattenSvgPath(path, (amount) => charges.push(amount));
	expect(
		charges.every((amount) => Number.isSafeInteger(amount) && amount > 0),
	).toBe(true);
});

it("rejects disconnected segments and invalid subpath closures", () => {
	expect(() => flattenSvgPath([arc()], noCharge)).toThrow(
		"Disconnected SVG path segment",
	);
	expect(() =>
		flattenSvgPath(
			[move, { kind: "line", start: { x: 1, y: 0 }, end: origin }],
			noCharge,
		),
	).toThrow("Disconnected SVG path segment");
	expect(() =>
		flattenSvgPath(
			[move, { kind: "close", start: origin, end: { x: 1, y: 0 } }],
			noCharge,
		),
	).toThrow("Invalid SVG subpath closure");
});

it("rejects nonfinite values and malformed runtime inputs", () => {
	expect(() =>
		flattenSvgPath(null as unknown as SvgPathSegment[], noCharge),
	).toThrow("Invalid SVG path segments");
	expect(() => flattenSvgPath([], noCharge, 0.25, null as never)).toThrow(
		"Invalid SVG flattening limits",
	);
	expect(() => flattenSvgPath([], null as never)).toThrow(
		"Invalid SVG work owner",
	);
	expect(() =>
		flattenSvgPath([{ kind: "move", end: { x: Number.NaN, y: 0 } }], noCharge),
	).toThrow("Invalid SVG coordinate");
	expect(() =>
		flattenSvgPath(curvePath(arc({ sweep: 1 as never })), noCharge),
	).toThrow("Invalid SVG arc flags");
});
