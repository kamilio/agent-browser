import { afterEach, expect, it } from "vitest";
import {
	FloatLayoutContext,
	type FloatLayoutLimits,
	type FloatLineRequest,
	type FloatPlacementRequest,
	floatLayoutLimits,
} from "./float-layout.js";
import { layoutValueLimits } from "./layout-values.js";

const contexts: FloatLayoutContext[] = [];

afterEach(() => {
	for (const context of contexts.splice(0)) context.close();
});

function fixture(limits: Partial<FloatLayoutLimits> = {}) {
	const context = new FloatLayoutContext(limits);
	contexts.push(context);
	return context;
}

function request(
	id: number,
	overrides: Partial<FloatPlacementRequest> = {},
): FloatPlacementRequest {
	return {
		id,
		side: "left",
		containingBlock: { left: 0, right: 100, top: 0 },
		minimumTop: 0,
		width: 30,
		height: 20,
		...overrides,
	};
}

function line(overrides: Partial<FloatLineRequest> = {}): FloatLineRequest {
	return { left: 0, right: 100, top: 0, bottom: 10, ...overrides };
}

it.each([
	["left", 0, 30, 30],
	["right", 70, 20, 40],
] as const)(
	"packs %s floats at the highest feasible top before preferring an outer edge",
	(side, firstLeft, secondLeft, thirdLeft) => {
		const context = fixture();
		const first = context.place(request(1, { side, width: 30, height: 40 }));
		const second = context.place(request(2, { side, width: 50, height: 10 }));
		const third = context.place(request(3, { side, width: 30, height: 5 }));
		expect(first).toMatchObject({ left: firstLeft, top: 0, bottom: 40 });
		expect(second).toMatchObject({ left: secondLeft, top: 0, bottom: 10 });
		expect(third).toMatchObject({ left: thirdLeft, top: 10, bottom: 15 });
		expect(context.placements().map((placement) => placement.id)).toEqual([
			1, 2, 3,
		]);
	},
);

it("packs opposing floats at touching edges and advances only past the relevant bottom", () => {
	const context = fixture();
	expect(context.place(request(1, { width: 60, height: 10 }))).toMatchObject({
		left: 0,
		right: 60,
		top: 0,
	});
	expect(
		context.place(request(2, { side: "right", width: 40, height: 30 })),
	).toMatchObject({ left: 60, right: 100, top: 0 });
	expect(context.place(request(3, { width: 20, height: 5 }))).toMatchObject({
		left: 0,
		right: 20,
		top: 10,
	});
});

it.each([
	["none", 0, 20],
	["left", 10, 0],
	["right", 30, 0],
	["both", 30, 0],
] as const)(
	"applies floating clear:%s only to the selected earlier sides",
	(clear, top, left) => {
		const context = fixture();
		context.place(request(1, { width: 20, height: 10 }));
		context.place(request(2, { side: "right", width: 20, height: 30 }));
		expect(
			context.place(request(3, { clear, width: 20, height: 5 })),
		).toMatchObject({ clear, top, left });
	},
);

it("combines containing, supplied source-order and earlier-float top floors without a zero floor", () => {
	const context = fixture();
	const negative = { left: 0, right: 100, top: -10 };
	expect(
		context.place(
			request(1, { containingBlock: negative, minimumTop: -8, height: 1 }),
		),
	).toMatchObject({ top: -8, bottom: -7 });
	expect(
		context.place(
			request(2, {
				containingBlock: { ...negative, top: -20 },
				minimumTop: -30,
				height: 1,
			}),
		),
	).toMatchObject({ top: -8, left: 30 });
	expect(
		context.place(
			request(3, {
				containingBlock: { ...negative, top: 12 },
				minimumTop: 11,
				height: 0,
			}),
		).top,
	).toBe(12);
	expect(context.place(request(4, { minimumTop: 5 })).top).toBe(12);
	expect(context.place(request(5, { minimumTop: 50 })).top).toBe(50);
});

it("keeps BFC instances independent even for identical ids and coordinates", () => {
	const first = fixture();
	const second = fixture();
	first.place(request(1, { width: 100, height: 100 }));
	expect(second.place(request(1, { clear: "both" }))).toMatchObject({
		top: 0,
		left: 0,
	});
	expect(first.lineInterval(line()).width).toBe(0);
	expect(second.lineInterval(line()).width).toBe(70);
});

it("uses actual earlier edges across different containing blocks in the same BFC", () => {
	const context = fixture();
	context.place(request(1, { width: 60 }));
	expect(
		context.place(
			request(2, {
				containingBlock: { left: 20, right: 120, top: 0 },
				width: 40,
			}),
		),
	).toMatchObject({ left: 60, right: 100, top: 0 });
});

it.each([
	["left", -100, -20, 0, 120],
	["right", 120, 200, -20, 100],
] as const)(
	"does not ignore an earlier %s float outside a narrower containing block",
	(side, previousLeft, previousRight, left, right) => {
		const context = fixture();
		context.place(
			request(1, {
				side,
				containingBlock: { left: previousLeft, right: previousRight, top: 0 },
				width: 20,
			}),
		);
		expect(context.place(request(2, { side, width: 120 }))).toMatchObject({
			left,
			right,
			top: 20,
		});
	},
);

it.each(["left", "right"] as const)(
	"keeps same-BFC cross-block edge constraints for a later %s float",
	(side) => {
		const context = fixture();
		context.place(
			request(1, {
				containingBlock: { left: 120, right: 200, top: 0 },
				width: 20,
			}),
		);
		expect(context.place(request(2, { side, width: 10 }))).toMatchObject({
			left: side === "left" ? 0 : 90,
			top: 20,
		});
	},
);

it.each([
	["left", 10, 70],
	["right", -10, 50],
] as const)(
	"allows a sole oversized %s float to protrude on its opposite side",
	(side, left, right) => {
		const context = fixture();
		expect(
			context.place(
				request(1, {
					side,
					containingBlock: { left: 10, right: 50, top: 0 },
					width: 60,
				}),
			),
		).toMatchObject({ left, right, width: 60, top: 0 });
	},
);

it("does not apply the same-side protrusion restriction to a distant opposite-side float", () => {
	const context = fixture();
	context.place(
		request(1, {
			side: "right",
			containingBlock: { left: 0, right: 200, top: 0 },
			width: 20,
		}),
	);
	expect(context.place(request(2, { width: 120 }))).toMatchObject({
		left: 0,
		right: 120,
		top: 0,
	});
	const mirrored = fixture();
	mirrored.place(
		request(1, {
			containingBlock: { left: -100, right: 0, top: 0 },
			width: 20,
		}),
	);
	expect(
		mirrored.place(request(2, { side: "right", width: 120 })),
	).toMatchObject({ left: -20, right: 100, top: 0 });
});

it("preserves fractional signed coordinates and physical exclusion edges", () => {
	const context = fixture();
	const containingBlock = { left: -10.5, right: 20.25, top: -5.5 };
	expect(
		context.place(
			request(1, {
				containingBlock,
				minimumTop: -5.25,
				width: 4.5,
				height: 1.25,
			}),
		),
	).toMatchObject({ left: -10.5, right: -6, top: -5.25, bottom: -4 });
	context.place(
		request(2, {
			side: "right",
			containingBlock,
			minimumTop: -5.25,
			width: 5.25,
			height: 2.5,
		}),
	);
	expect(
		context.lineInterval({
			left: -10.5,
			right: 20.25,
			top: -5.25,
			bottom: -4.5,
		}),
	).toEqual({
		left: -6,
		right: 15,
		top: -5.25,
		bottom: -4.5,
		width: 21,
		nextBottom: -4,
	});
	expect(
		context.lineInterval({ left: -10.5, right: 20.25, top: -4, bottom: -3 }),
	).toMatchObject({ left: -10.5, right: 15, width: 25.5, nextBottom: -2.75 });
});

it.each([
	[0, 10, 100, null],
	[10, 10, 100, null],
	[10, 11, 70, 30],
	[20, 20, 70, 30],
	[29, 30, 70, 30],
	[30, 30, 100, null],
	[30, 40, 100, null],
	[0, 40, 70, 30],
] as const)(
	"intersects inclusive line [%s,%s] with an open float vertical interval",
	(top, bottom, width, nextBottom) => {
		const context = fixture();
		context.place(request(1, { minimumTop: 10, height: 20 }));
		expect(context.lineInterval(line({ top, bottom }))).toMatchObject({
			width,
			nextBottom,
		});
	},
);

it("keeps zero-height floats as source-order anchors without excluding lines or later floats", () => {
	const context = fixture();
	context.place(request(1, { minimumTop: 30, width: 90, height: 0 }));
	expect(context.lineInterval(line({ top: 0, bottom: 40 }))).toMatchObject({
		left: 0,
		right: 100,
		width: 100,
		nextBottom: null,
	});
	expect(context.place(request(2, { width: 20 }))).toMatchObject({
		left: 0,
		top: 30,
	});
	const zero = context.place(request(3, { width: 30, height: 0 }));
	expect(zero).toMatchObject({ left: 20, top: 30, bottom: 30 });
	expect(context.place(request(4, { width: 30 }))).toMatchObject({
		left: 20,
		top: 30,
	});
});

it("supports zero-width boxes and containing blocks without inventing available room", () => {
	const context = fixture();
	expect(
		context.place(
			request(0, {
				containingBlock: { left: 5, right: 5, top: 0 },
				width: 0,
			}),
		),
	).toMatchObject({ left: 5, right: 5, width: 0 });
	expect(context.lineInterval(line({ left: 5, right: 5 }))).toMatchObject({
		left: 5,
		right: 5,
		width: 0,
		nextBottom: null,
	});
});

it("reports zero width when a line spans crossing exclusions at different heights", () => {
	const context = fixture();
	context.place(request(1, { width: 80, height: 10 }));
	expect(
		context.place(request(2, { side: "right", width: 80, height: 10 })).top,
	).toBe(10);
	expect(context.lineInterval(line({ top: 0, bottom: 20 }))).toEqual({
		left: 80,
		right: 20,
		top: 0,
		bottom: 20,
		width: 0,
		nextBottom: 10,
	});
	expect(context.lineInterval(line({ top: 10, bottom: 30 }))).toMatchObject({
		left: 0,
		right: 20,
		width: 20,
		nextBottom: 20,
	});
});

it("uses only placements already committed and clips reported line edges to the query bounds", () => {
	const context = fixture();
	const before = context.lineInterval(line());
	context.place(request(1, { width: 120 }));
	expect(before).toMatchObject({
		left: 0,
		right: 100,
		width: 100,
		nextBottom: null,
	});
	expect(context.lineInterval(line())).toMatchObject({
		left: 100,
		right: 100,
		width: 0,
		nextBottom: 20,
	});
	expect(context.lineInterval(line({ left: 130, right: 200 }))).toMatchObject({
		left: 130,
		right: 200,
		width: 70,
		nextBottom: null,
	});
});

it("returns immutable placements, copied snapshots and metrics without retaining caller objects", () => {
	const options = { maxFloats: 3, maxWork: 1000 };
	const context = fixture(options);
	const containingBlock = { left: 0, right: 100, top: 0 };
	const input = { ...request(1), containingBlock };
	const first = context.place(input);
	const before = context.placements();
	const metrics = context.metrics();
	containingBlock.left = 50;
	input.width = 90;
	options.maxFloats = 1;
	context.place(request(2));
	expect(first).toMatchObject({ left: 0, right: 30, width: 30, clear: "none" });
	expect(before).toEqual([first]);
	expect(context.placements()).toHaveLength(2);
	expect(context.limits.maxFloats).toBe(3);
	expect(metrics.floats).toBe(1);
	for (const value of [
		first,
		before,
		metrics,
		metrics.limits,
		context.lineInterval(line()),
	])
		expect(Object.isFrozen(value)).toBe(true);
});

it("rejects duplicate ids without changing placement order or source-order floors", () => {
	const context = fixture();
	const first = context.place(request(1));
	expect(() =>
		context.place(request(1, { minimumTop: 100, clear: "both" })),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(context.placements()).toEqual([first]);
	expect(context.place(request(2))).toMatchObject({ left: 30, top: 0 });
	expect(
		context.place(request(Number.MAX_SAFE_INTEGER, { width: 10 })).id,
	).toBe(Number.MAX_SAFE_INTEGER);
});

it.each([
	["negative id", { id: -1 }],
	["fractional id", { id: 1.5 }],
	["unsafe id", { id: Number.MAX_SAFE_INTEGER + 1 }],
	["coerced id", { id: "1" }],
	["logical side", { side: "inline-start" }],
	["missing side", { side: undefined }],
	["invalid clear", { clear: "inherit" }],
	["null clear", { clear: null }],
	["negative width", { width: -1 }],
	["negative height", { height: -1 }],
	["NaN width", { width: Number.NaN }],
	["infinite height", { height: Number.POSITIVE_INFINITY }],
	["coerced width", { width: "30" }],
	["null height", { height: null }],
	["missing minimum", { minimumTop: undefined }],
	["nonfinite minimum", { minimumTop: Number.NEGATIVE_INFINITY }],
	["missing containing block", { containingBlock: undefined }],
	["array containing block", { containingBlock: [] }],
	[
		"reversed containing block",
		{ containingBlock: { left: 10, right: 0, top: 0 } },
	],
	[
		"coerced coordinate",
		{ containingBlock: { left: "0", right: 100, top: 0 } },
	],
	[
		"NaN coordinate",
		{ containingBlock: { left: 0, right: 100, top: Number.NaN } },
	],
])("rejects %s without reserving the id", (_name, overrides) => {
	const context = fixture();
	const invalid = {
		...request(1),
		...overrides,
	} as unknown as FloatPlacementRequest;
	expect(() => context.place(invalid)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(context.metrics().floats).toBe(0);
	expect(context.place(request(1))).toMatchObject({ id: 1, top: 0, left: 0 });
});

it.each([
	["null", null],
	["undefined", undefined],
	["array", []],
	["string", "float"],
])("rejects a %s request record", (_name, value) => {
	const context = fixture();
	expect(() => context.place(value as never)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() => context.lineInterval(value as never)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(context.metrics().floats).toBe(0);
});

it.each([
	["reversed horizontal bounds", { left: 100, right: 0 }],
	["reversed vertical bounds", { top: 10, bottom: 0 }],
	["NaN top", { top: Number.NaN }],
	["infinite bottom", { bottom: Number.POSITIVE_INFINITY }],
	["coerced right", { right: "100" }],
])(
	"rejects a line with %s without corrupting exclusions",
	(_name, overrides) => {
		const context = fixture();
		context.place(request(1));
		expect(() =>
			context.lineInterval({ ...line(), ...overrides } as FloatLineRequest),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(context.lineInterval(line())).toMatchObject({
			left: 30,
			right: 100,
			width: 70,
		});
	},
);

it("does not coerce numeric objects in placement, line or limit inputs", () => {
	const context = fixture();
	let coerced = false;
	const value = {
		valueOf() {
			coerced = true;
			return 1;
		},
	};
	expect(() => context.place(request(1, { width: value as never }))).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() => context.lineInterval(line({ top: value as never }))).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(() => fixture({ maxFloats: value as never })).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(coerced).toBe(false);
});

it("checks derived coordinates and leaves rejected placements and ids uncommitted", () => {
	const context = fixture();
	const first = context.place(request(1));
	const maximum = layoutValueLimits.maxAbsoluteLength;
	expect(() =>
		context.place(request(2, { minimumTop: maximum, height: 1 })),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		context.place(
			request(2, {
				containingBlock: { left: maximum - 1, right: maximum, top: 0 },
				width: 2,
			}),
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(context.placements()).toEqual([first]);
	expect(context.place(request(2))).toMatchObject({ top: 0, left: 30 });
	expect(() =>
		context.lineInterval(line({ left: -maximum, right: maximum })),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() => context.place(request(3, { width: maximum + 1 }))).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	["null", null],
	["array", []],
	["zero float cap", { maxFloats: 0 }],
	["fractional float cap", { maxFloats: 1.5 }],
	["raised float cap", { maxFloats: floatLayoutLimits.maxFloats + 1 }],
	["zero work cap", { maxWork: 0 }],
	["raised work cap", { maxWork: floatLayoutLimits.maxWork + 1 }],
	["null work cap", { maxWork: null }],
	["NaN work cap", { maxWork: Number.NaN }],
	["infinite work cap", { maxWork: Number.POSITIVE_INFINITY }],
	["coerced float cap", { maxFloats: "1" }],
])("rejects invalid lower-only limits: %s", (_name, limits) => {
	expect(() => fixture(limits as never)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("enforces a lower retained-float cap while keeping existing line queries usable", () => {
	const context = fixture({ maxFloats: 1 });
	const first = context.place(request(1));
	expect(() => context.place(request(2))).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(context.placements()).toEqual([first]);
	expect(context.lineInterval(line()).width).toBe(70);
});

it("charges every line traversal and placement snapshot against one aggregate work budget", () => {
	const context = fixture();
	context.place(request(1));
	context.place(request(2));
	const beforeLine = context.metrics().work;
	context.lineInterval(line({ top: 100, bottom: 110 }));
	expect(context.metrics().work - beforeLine).toBe(3);
	const beforeSnapshot = context.metrics().work;
	context.placements();
	expect(context.metrics().work - beforeSnapshot).toBe(3);
});

it("fails a bounded placement atomically and remains safely closable after work exhaustion", () => {
	const context = fixture({ maxWork: 1 });
	expect(() => context.place(request(1))).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(context.metrics()).toMatchObject({
		floats: 0,
		work: 1,
		closed: false,
	});
	expect(() => context.lineInterval(line())).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => context.placements()).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(context.metrics().work).toBe(1);
	context.close();
	context.close();
	expect(context.metrics()).toMatchObject({ floats: 0, work: 1, closed: true });
});

it("accepts an exact search work budget and rejects one less without committing the last float", () => {
	const seed = (context: FloatLayoutContext) => {
		context.place(request(1, { width: 60, height: 10 }));
		context.place(request(2, { side: "right", width: 40, height: 30 }));
	};
	const reference = fixture();
	seed(reference);
	const expected = reference.place(request(3, { width: 20 }));
	const required = reference.metrics().work;
	const exact = fixture({ maxWork: required });
	seed(exact);
	expect(exact.place(request(3, { width: 20 }))).toEqual(expected);
	expect(exact.metrics().work).toBe(required);
	const short = fixture({ maxWork: required - 1 });
	seed(short);
	expect(() => short.place(request(3, { width: 20 }))).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(short.metrics()).toMatchObject({ floats: 2, work: required - 1 });
});

it("bounds a many-obstruction search by sorted bottom events rather than rescanning every suffix", () => {
	const context = fixture();
	const count = 64;
	for (let index = 0; index < count; index++)
		context.place(request(index, { width: 1, height: index + 1 }));
	const before = context.metrics().work;
	expect(
		context.place(request(count, { width: 101, height: 1 })),
	).toMatchObject({ left: 0, top: count, right: 101 });
	expect(context.metrics().work - before).toBeLessThan(count * 16);
});

it("clears retained state, keeps old snapshots immutable and rejects every operation after close", () => {
	const context = fixture();
	const first = context.place(request(1));
	const before = context.placements();
	const metrics = context.metrics();
	context.close();
	context.close();
	expect(context.metrics()).toMatchObject({
		floats: 0,
		closed: true,
		work: metrics.work,
	});
	expect(metrics.closed).toBe(false);
	expect(before).toEqual([first]);
	expect(Object.isFrozen(before)).toBe(true);
	expect(() => context.place(request(2))).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => context.lineInterval(line())).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => context.placements()).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("does not revive an owner closed while reading request properties", () => {
	const context = fixture();
	const input = {
		...request(1),
		get width() {
			context.close();
			return 30;
		},
	};
	expect(() => context.place(input)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(context.metrics()).toMatchObject({ closed: true, floats: 0 });
	const lines = fixture();
	lines.place(request(1));
	const query = {
		...line(),
		get bottom() {
			lines.close();
			return 10;
		},
	};
	expect(() => lines.lineInterval(query)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(lines.metrics()).toMatchObject({ closed: true, floats: 0 });
});
