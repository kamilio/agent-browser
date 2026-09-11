import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { svgIdentity } from "./svg-affine.js";
import { svgPathBounds } from "./svg-path-bounds.js";
import { svgFlattenLimits } from "./svg-path-flatten.js";
import type { SvgPathSegment, SvgPoint } from "./svg-path-types.js";
import type { SvgBounds, SvgMatrix } from "./svg-scene-types.js";

const origin = { x: 0, y: 0 };
const noCharge = () => {};
type Drawing = Exclude<SvgPathSegment, { kind: "move" }>;
type Arc = Extract<SvgPathSegment, { kind: "arc" }>;

function pathFor(segment: Drawing): SvgPathSegment[] {
	return [{ kind: "move", end: segment.start }, segment];
}

function bounds(segment: Drawing, matrix: SvgMatrix = svgIdentity) {
	return svgPathBounds(pathFor(segment), matrix, noCharge);
}

function expectBounds(
	actual: SvgBounds | null,
	expected: SvgBounds,
	tolerance = 1e-12,
) {
	expect(actual).not.toBeNull();
	for (const name of ["x", "y", "width", "height"] as const)
		expect(Math.abs(actual![name] - expected[name])).toBeLessThanOrEqual(
			tolerance,
		);
}

function expectCode(operation: () => unknown, code: string) {
	try {
		operation();
		throw new Error("Expected rejection");
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe(code);
	}
}

function arc(overrides: Partial<Arc> = {}): Arc {
	return {
		kind: "arc",
		start: { x: 1, y: 0 },
		end: { x: 0, y: 1 },
		radiusX: 1,
		radiusY: 1,
		rotation: 0,
		largeArc: false,
		sweep: true,
		...overrides,
	};
}

it("distinguishes empty/move-only paths from every zero-length drawing kind", () => {
	expect(svgPathBounds([], svgIdentity, noCharge)).toBeNull();
	expect(
		svgPathBounds(
			[
				{ kind: "move", end: origin },
				{ kind: "move", end: { x: 9, y: 10 } },
			],
			svgIdentity,
			noCharge,
		),
	).toBeNull();
	const segments: Drawing[] = [
		{ kind: "line", start: origin, end: origin },
		{ kind: "close", start: origin, end: origin },
		{ kind: "quadratic", start: origin, control: origin, end: origin },
		{
			kind: "cubic",
			start: origin,
			control1: origin,
			control2: origin,
			end: origin,
		},
		arc({ start: origin, end: origin }),
	];
	for (const segment of segments)
		expect(bounds(segment)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
});

it("bounds lines, closing edges and multiple subpaths without including isolated moves", () => {
	const corner = { x: 4, y: -3 };
	const second = { x: -7, y: 8 };
	const result = svgPathBounds(
		[
			{ kind: "move", end: origin },
			{ kind: "line", start: origin, end: corner },
			{ kind: "close", start: corner, end: origin },
			{ kind: "line", start: origin, end: second },
			{ kind: "move", end: { x: 500, y: 600 } },
			...pathFor({
				kind: "line",
				start: { x: -8, y: 5 },
				end: { x: -9, y: 6 },
			}),
		],
		svgIdentity,
		noCharge,
	);
	expect(result).toEqual({ x: -9, y: -3, width: 13, height: 11 });
});

it("applies translation, reflection, shear and singular matrices to actual geometry", () => {
	const segment: Drawing = {
		kind: "line",
		start: { x: -1, y: 2 },
		end: { x: 3, y: -4 },
	};
	expect(bounds(segment, [-2, 0, 3, 1, 7, -5])).toEqual({
		x: -11,
		y: -9,
		width: 26,
		height: 6,
	});
	expect(bounds(segment, [0, 0, 0, 0, 9, 8])).toEqual({
		x: 9,
		y: 8,
		width: 0,
		height: 0,
	});
});

it("uses quadratic derivative extrema rather than the control hull", () => {
	const segment: Drawing = {
		kind: "quadratic",
		start: origin,
		control: { x: 1, y: 2 },
		end: { x: 2, y: 0 },
	};
	expect(bounds(segment)).toEqual({ x: 0, y: 0, width: 2, height: 1 });
	expectBounds(bounds(segment, [1, 0, 1, -2, 4, 7]), {
		x: 4,
		y: 5,
		width: 2.25,
		height: 2,
	});
	expect(
		bounds({ ...segment, control: { x: -1, y: -2 }, end: { x: -2, y: -4 } }),
	).toEqual({ x: -2, y: -4, width: 2, height: 4 });
});

it("finds both cubic extrema, repeated derivative roots and linear degeneracy", () => {
	expectBounds(
		bounds({
			kind: "cubic",
			start: origin,
			control1: { x: 1, y: 3 },
			control2: { x: 2, y: -3 },
			end: { x: 3, y: 0 },
		}),
		{ x: 0, y: -Math.sqrt(3) / 2, width: 3, height: Math.sqrt(3) },
	);
	expect(
		bounds({
			kind: "cubic",
			start: origin,
			control1: { x: 1, y: 2 },
			control2: { x: 2, y: 2 },
			end: { x: 3, y: 0 },
		}),
	).toEqual({ x: 0, y: 0, width: 3, height: 1.5 });
	expect(
		bounds({
			kind: "cubic",
			start: { x: -1, y: 0 },
			control1: { x: 1, y: 0 },
			control2: { x: -1, y: 0 },
			end: { x: 1, y: 0 },
		}),
	).toEqual({ x: -1, y: 0, width: 2, height: 0 });
	expect(
		bounds({
			kind: "cubic",
			start: origin,
			control1: { x: 1, y: 1 },
			control2: { x: 2, y: 2 },
			end: { x: 3, y: 3 },
		}),
	).toEqual({ x: 0, y: 0, width: 3, height: 3 });
});

it("solves sheared cubic axes instead of transforming an axis-aligned bounds box", () => {
	const result = bounds(
		{
			kind: "cubic",
			start: origin,
			control1: { x: 1, y: 2 },
			control2: { x: 2, y: 2 },
			end: { x: 3, y: 0 },
		},
		[1, 0, 1, -1, 4, 7],
	);
	expectBounds(result, { x: 4, y: 5.5, width: 3.375, height: 1.5 });
});

it("normalizes tiny derivative magnitudes without squaring them into zero", () => {
	const scale = 1e-200;
	const result = bounds({
		kind: "cubic",
		start: origin,
		control1: { x: scale, y: 3 * scale },
		control2: { x: 2 * scale, y: -3 * scale },
		end: { x: 3 * scale, y: 0 },
	})!;
	expect(result.y / scale).toBeCloseTo(-Math.sqrt(3) / 2, 13);
	expect(result.height / scale).toBeCloseTo(Math.sqrt(3), 13);
});

it.each([
	[false, true, { x: 0, y: 0, width: 1, height: 1 }],
	[false, false, { x: 0, y: 0, width: 1, height: 1 }],
	[true, true, { x: 0, y: 0, width: 2, height: 2 }],
	[true, false, { x: -1, y: -1, width: 2, height: 2 }],
] as const)(
	"preserves arc flags large=%s sweep=%s",
	(largeArc, sweep, expected) => {
		expectBounds(bounds(arc({ largeArc, sweep })), expected);
	},
);

it("bounds rotated ellipses and affine cosine/sine bases analytically", () => {
	const diagonal = Math.SQRT1_2;
	const segment = arc({
		start: { x: 2 * diagonal, y: 2 * diagonal },
		end: { x: -2 * diagonal, y: -2 * diagonal },
		radiusX: 2,
		radiusY: 1,
		rotation: 45,
	});
	const radius = Math.sqrt(2.5);
	expectBounds(bounds(segment), {
		x: -radius,
		y: -2 * diagonal,
		width: radius + 2 * diagonal,
		height: radius + 2 * diagonal,
	});
	const semicircle = arc({
		start: { x: 2, y: 0 },
		end: { x: -2, y: 0 },
		radiusX: 2,
		radiusY: 1,
	});
	expectBounds(bounds(semicircle, [1, 1, 1, 0, 3, 4]), {
		x: 1,
		y: 2,
		width: 2 + Math.sqrt(5),
		height: 4,
	});
	expectBounds(bounds(semicircle, [-1, 0, 0, -1, 0, 0]), {
		x: -2,
		y: -1,
		width: 4,
		height: 1,
	});
	expectBounds(bounds(semicircle, [0, 0, 2, 0, 3, 4]), {
		x: 3,
		y: 4,
		width: 2,
		height: 0,
	});
	expect(bounds(semicircle, [0, 0, 0, 0, 3, 4])).toEqual({
		x: 3,
		y: 4,
		width: 0,
		height: 0,
	});
});

it("corrects undersized/negative radii and handles zero/coincident arcs", () => {
	const segment = arc({
		start: origin,
		end: { x: 10, y: 0 },
		radiusX: -1,
		radiusY: -1,
	});
	expectBounds(bounds(segment), { x: 0, y: -5, width: 10, height: 5 });
	for (const radiusX of [0, 1])
		expect(bounds({ ...segment, radiusX, radiusY: 0 })).toEqual({
			x: 0,
			y: 0,
			width: 10,
			height: 0,
		});
	expect(bounds(arc({ start: origin, end: origin, largeArc: true }))).toEqual({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});
	expectBounds(bounds({ ...segment, radiusX: 1e-300, radiusY: 1e-300 }), {
		x: 0,
		y: -5,
		width: 10,
		height: 5,
	});
});

it.each([1e-8, 1e-16, 1e-100])(
	"retains short-arc sagitta and long-arc extent for chord %s",
	(chord) => {
		for (const sweep of [false, true]) {
			const segment = arc({ start: origin, end: { x: chord, y: 0 }, sweep });
			const minor = bounds(segment)!;
			const sagitta =
				(chord / 2) * (chord / 2 / (1 + Math.sqrt(1 - (chord / 2) ** 2)));
			expect(minor.x).toBe(0);
			expect(minor.width).toBe(chord);
			expect(minor.height / sagitta).toBeCloseTo(1, 13);
			expect(minor.y).toBe(sweep ? -sagitta : 0);
			const major = bounds({ ...segment, largeArc: true })!;
			expectBounds(major, {
				x: chord / 2 - 1,
				y: sweep ? -2 : 0,
				width: 2,
				height: 2,
			});
		}
	},
);

it("keeps near-coincident choices after ellipse rotation and shear", () => {
	const chord = 1e-16;
	for (const sweep of [false, true]) {
		const segment = arc({
			start: origin,
			end: { x: 0, y: chord },
			radiusX: 2,
			radiusY: 1,
			rotation: 90,
			sweep,
		});
		const minor = bounds(segment, [1, 0, 1, 1, 0, 0])!;
		expect(minor.width / chord).toBeCloseTo(1, 12);
		expect(minor.height / chord).toBeCloseTo(1, 12);
		const major = bounds({ ...segment, largeArc: true }, [1, 0, 1, 1, 0, 0])!;
		expect(major.width).toBeCloseTo(2 * Math.sqrt(5), 12);
		expect(major.height).toBeCloseTo(4, 12);
	}
});

it("does not admit out-of-sweep ellipse extrema", () => {
	const diagonal = Math.SQRT1_2;
	expectBounds(
		bounds(arc({ start: { x: 1, y: 0 }, end: { x: diagonal, y: diagonal } })),
		{ x: diagonal, y: 0, width: 1 - diagonal, height: diagonal },
	);
});

it("returns detached frozen bounds without freezing caller inputs", () => {
	const endpoint = { x: 2, y: 4 };
	const path = pathFor({ kind: "line", start: origin, end: endpoint });
	const transform: [number, number, number, number, number, number] = [
		1, 0, 0, 1, 0, 0,
	];
	const result = svgPathBounds(path, transform, noCharge)!;
	expect(Object.isFrozen(result)).toBe(true);
	endpoint.x = 9;
	transform[4] = 10;
	path.length = 0;
	expect(result).toEqual({ x: 0, y: 0, width: 2, height: 4 });
	expect(Object.isFrozen(endpoint)).toBe(false);
	expect(Object.isFrozen(transform)).toBe(false);
});

it("validates matrices, scalars, flags, points and segment connectivity", () => {
	for (const transform of [
		null,
		[],
		[1, 0, 0, 1, 0],
		Array(6),
		[1, 0, 0, 1, 0, NaN],
		[1, 0, 0, 1, 0, "0"],
	])
		expectCode(
			() => svgPathBounds([], transform as unknown as SvgMatrix, noCharge),
			"invalid-input",
		);
	for (const end of [
		null,
		{},
		[],
		{ x: NaN, y: 0 },
		{ x: Infinity, y: 0 },
		{ x: "0", y: 0 },
	])
		expectCode(
			() =>
				svgPathBounds(
					[{ kind: "move", end: end as SvgPoint }],
					svgIdentity,
					noCharge,
				),
			"invalid-input",
		);
	for (const overrides of [
		{ radiusX: NaN },
		{ rotation: Infinity },
		{ sweep: 1 },
		{ largeArc: "false" },
	])
		expectCode(() => bounds(arc(overrides as Partial<Arc>)), "invalid-input");
	for (const path of [
		null,
		{},
		[null],
		Array(1),
		[{ kind: "line", start: origin, end: origin }],
		[
			{ kind: "move", end: origin },
			{ kind: "line", start: { x: 1, y: 0 }, end: origin },
		],
		pathFor({ kind: "close", start: origin, end: { x: 1, y: 0 } }),
		[
			{ kind: "move", end: origin },
			{ kind: "unknown", start: origin, end: origin },
		],
	])
		expectCode(
			() => svgPathBounds(path as SvgPathSegment[], svgIdentity, noCharge),
			"invalid-input",
		);
	expectCode(
		() => svgPathBounds([], svgIdentity, null as unknown as () => void),
		"invalid-input",
	);
});

it("enforces unchanged count and input/transformed coordinate ceilings", () => {
	const limit = svgFlattenLimits.maxCoordinate;
	expect(
		bounds({
			kind: "line",
			start: { x: -limit, y: 0 },
			end: { x: limit, y: 0 },
		}),
	).toEqual({ x: -limit, y: 0, width: 2 * limit, height: 0 });
	expectCode(
		() => bounds({ kind: "line", start: origin, end: { x: limit + 1, y: 0 } }),
		"resource-limit",
	);
	expectCode(
		() =>
			bounds(
				{ kind: "line", start: origin, end: { x: limit, y: 0 } },
				[2, 0, 0, 1, 0, 0],
			),
		"resource-limit",
	);
	expectCode(
		() => svgPathBounds([], [limit + 1, 0, 0, 1, 0, 0], noCharge),
		"resource-limit",
	);
	expectCode(() => bounds(arc({ radiusX: limit + 1 })), "resource-limit");
	expectCode(
		() =>
			bounds(
				arc({
					start: { x: -limit, y: -limit },
					end: { x: limit, y: limit },
					radiusX: 1,
					radiusY: 1,
				}),
			),
		"resource-limit",
	);
	const moves: SvgPathSegment[] = Array.from(
		{ length: svgFlattenLimits.maxSegments },
		() => ({ kind: "move", end: origin }),
	);
	expect(svgPathBounds(moves, svgIdentity, noCharge)).toBeNull();
	moves.push({ kind: "move", end: origin });
	let work = 0;
	expectCode(
		() =>
			svgPathBounds(moves, svgIdentity, (amount) => {
				work += amount;
			}),
		"resource-limit",
	);
	expect(work).toBe(0);
});

it("fails explicitly on unresolvable arc normalization, sagitta and corrected-radii overflow", () => {
	for (const segment of [
		arc({ start: origin, end: { x: Number.MIN_VALUE, y: 0 } }),
		arc({ start: origin, end: { x: 1e-200, y: 0 } }),
		arc({ radiusX: Number.MIN_VALUE, radiusY: 1 }),
		arc({
			start: origin,
			end: { x: 1e-300, y: 1 },
			radiusX: 1e9,
			radiusY: 1e-300,
		}),
	])
		expectCode(() => bounds(segment), "resource-limit");
});

it("charges bounded work before reads and propagates every owner failure unchanged", () => {
	const path = pathFor(arc());
	const charges: number[] = [];
	svgPathBounds(path, svgIdentity, (amount) => charges.push(amount));
	expect(charges).toEqual([8, 1, 256, 1, 256, 4]);
	for (let failureIndex = 0; failureIndex < charges.length; failureIndex++) {
		const failure = new Error(`Owner failure ${failureIndex}`);
		let count = 0;
		expect(() =>
			svgPathBounds(path, svgIdentity, () => {
				if (count++ === failureIndex) throw failure;
			}),
		).toThrow(failure);
	}
	const failure = new Error("Stopped before coordinates");
	let read = false;
	const guarded = {
		kind: "move",
		get end() {
			read = true;
			return origin;
		},
	} as SvgPathSegment;
	expect(() =>
		svgPathBounds([guarded], svgIdentity, (amount) => {
			if (amount === 256) throw failure;
		}),
	).toThrow(failure);
	expect(read).toBe(false);
});

it("has a fixed iteration bound even if a work owner appends segments", () => {
	const path: SvgPathSegment[] = [{ kind: "move", end: origin }];
	let charges = 0;
	expect(
		svgPathBounds(path, svgIdentity, () => {
			charges++;
			path.push({ kind: "move", end: origin });
		}),
	).toBeNull();
	expect(charges).toBe(3);
});

it("rejects derivative and affine underflow instead of returning collapsed geometry", () => {
	expectCode(
		() =>
			bounds(
				{ kind: "line", start: origin, end: { x: 1e-200, y: 0 } },
				[1e-200, 0, 0, 1, 0, 0],
			),
		"resource-limit",
	);
	expectCode(
		() =>
			bounds({
				kind: "cubic",
				start: origin,
				control1: origin,
				control2: { x: -1e-200, y: 0 },
				end: { x: 1, y: 0 },
			}),
		"resource-limit",
	);
	expectCode(
		() =>
			bounds({
				kind: "cubic",
				start: origin,
				control1: { x: 1, y: 0 },
				control2: origin,
				end: { x: 1 + 1e-15, y: 0 },
			}),
		"resource-limit",
	);
});

it("accepts a complete work budget and preserves the exact exhausted-owner value", () => {
	const path = pathFor(arc());
	const cost = 8 + 257 * path.length + 4;
	let remaining = cost;
	expect(
		svgPathBounds(path, svgIdentity, (amount) => {
			remaining -= amount;
			expect(remaining).toBeGreaterThanOrEqual(0);
		}),
	).not.toBeNull();
	expect(remaining).toBe(0);
	const failure = Object.freeze({ reason: "owner exhausted" });
	remaining = cost - 1;
	try {
		svgPathBounds(path, svgIdentity, (amount) => {
			remaining -= amount;
			if (remaining < 0) throw failure;
		});
		throw new Error("Expected owner failure");
	} catch (error) {
		expect(error).toBe(failure);
	}
});

it("matches independent center-parameterized arc extrema across rotations and flags", () => {
	const center = { x: 7, y: -4 };
	const radiusX = 3;
	const radiusY = 1.25;
	const initialAngle = 0.37;
	const matrix: SvgMatrix = [-1, 0.5, 0.75, 2, 4, -2];
	for (const rotation of [-73, 0, 29, 160]) {
		const cosine = Math.cos((rotation * Math.PI) / 180);
		const sine = Math.sin((rotation * Math.PI) / 180);
		const sourcePoint = (angle: number) => ({
			x:
				center.x +
				radiusX * cosine * Math.cos(angle) -
				radiusY * sine * Math.sin(angle),
			y:
				center.y +
				radiusX * sine * Math.cos(angle) +
				radiusY * cosine * Math.sin(angle),
		});
		const project = (value: SvgPoint) => ({
			x: matrix[0] * value.x + matrix[2] * value.y + matrix[4],
			y: matrix[1] * value.x + matrix[3] * value.y + matrix[5],
		});
		for (const largeArc of [false, true]) {
			for (const sweep of [false, true]) {
				const extent = (largeArc ? 4.9 : 1.2) * (sweep ? 1 : -1);
				const finalAngle = initialAngle + extent;
				const lower = Math.min(initialAngle, finalAngle);
				const upper = Math.max(initialAngle, finalAngle);
				const candidates = [
					project(sourcePoint(initialAngle)),
					project(sourcePoint(finalAngle)),
				];
				for (const [across, down] of [
					[matrix[0], matrix[2]],
					[matrix[1], matrix[3]],
				]) {
					const stationary = Math.atan2(
						radiusY * (-across * sine + down * cosine),
						radiusX * (across * cosine + down * sine),
					);
					for (let halfTurn = -4; halfTurn <= 4; halfTurn++) {
						const position = stationary + halfTurn * Math.PI;
						if (position >= lower && position <= upper)
							candidates.push(project(sourcePoint(position)));
					}
				}
				const minimumX = Math.min(...candidates.map((value) => value.x));
				const maximumX = Math.max(...candidates.map((value) => value.x));
				const minimumY = Math.min(...candidates.map((value) => value.y));
				const maximumY = Math.max(...candidates.map((value) => value.y));
				expectBounds(
					bounds(
						arc({
							start: sourcePoint(initialAngle),
							end: sourcePoint(finalAngle),
							radiusX,
							radiusY,
							rotation,
							largeArc,
							sweep,
						}),
						matrix,
					),
					{
						x: minimumX,
						y: minimumY,
						width: maximumX - minimumX,
						height: maximumY - minimumY,
					},
					1e-11,
				);
			}
		}
	}
});
