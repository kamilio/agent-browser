import { afterEach, expect, it } from "vitest";
import {
	FloatLayoutContext,
	type FloatLayoutLimits,
	type FloatPlacementRequest,
} from "./float-layout.js";

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
		width: 20,
		height: 12,
		...overrides,
	};
}

it.each(["left", "right", "both"] as const)(
	"returns null for clear:%s before any float is placed",
	(clear) => {
		const context = fixture();
		expect(context.clearanceBottom(clear)).toBeNull();
		expect(context.metrics().floats).toBe(0);
		expect(context.placements()).toEqual([]);
	},
);

it.each([
	["left", 12],
	["right", 28],
	["both", 28],
] as const)("selects the earlier %s margin-box bottom", (clear, bottom) => {
	const context = fixture();
	const left = context.place(request(1));
	const right = context.place(request(2, { side: "right", height: 28 }));
	const placements = context.placements();
	const metrics = context.metrics();
	expect(context.clearanceBottom(clear)).toBe(bottom);
	expect(context.metrics().work).toBeGreaterThan(metrics.work);
	expect(context.metrics().floats).toBe(metrics.floats);
	expect(context.placements()).toEqual([left, right]);
	expect(context.placements()[0]).toBe(left);
	expect(context.placements()[1]).toBe(right);
	expect(Object.isFrozen(left)).toBe(true);
	expect(Object.isFrozen(placements)).toBe(true);
	expect(Object.isFrozen(metrics)).toBe(true);
});

it.each([
	["left", "right"],
	["right", "left"],
] as const)("ignores a lone %s float for clear:%s", (side, clear) => {
	const context = fixture();
	context.place(request(1, { side, height: 40 }));
	expect(context.clearanceBottom(clear)).toBeNull();
	expect(context.clearanceBottom("both")).toBe(40);
});

it.each([
	{ side: "left", top: 0, height: 0, clear: "left", bottom: 0 },
	{ side: "right", top: -12, height: 4, clear: "right", bottom: -8 },
	{ side: "right", top: -12, height: 0, clear: "both", bottom: -12 },
] as const)(
	"preserves $side top $top height $height as clear:$clear bottom $bottom",
	({ side, top, height, clear, bottom }) => {
		const context = fixture();
		const placement = context.place(
			request(1, {
				side,
				containingBlock: { left: 0, right: 100, top },
				minimumTop: top,
				height,
			}),
		);
		expect(placement.bottom).toBe(bottom);
		expect(context.clearanceBottom(clear)).toBe(bottom);
		expect(context.metrics().floats).toBe(1);
	},
);

it("observes new placements without forgetting the highest earlier bottom", () => {
	const context = fixture();
	expect(context.clearanceBottom("both")).toBeNull();
	context.place(request(1, { height: 10 }));
	expect(context.clearanceBottom("left")).toBe(10);
	context.place(request(2, { height: 30 }));
	expect(context.clearanceBottom("left")).toBe(30);
	context.place(request(3, { side: "right", height: 5 }));
	expect(context.clearanceBottom("right")).toBe(5);
	expect(context.clearanceBottom("both")).toBe(30);
	expect(context.placements().map((placement) => placement.id)).toEqual([
		1, 2, 3,
	]);
});

it("does not advance the source-order top floor or change line exclusions", () => {
	const context = fixture();
	context.place(request(1, { height: 80 }));
	const line = { left: 0, right: 100, top: 0, bottom: 8 };
	const before = context.lineInterval(line);
	expect(context.clearanceBottom("both")).toBe(80);
	expect(context.lineInterval(line)).toEqual(before);
	expect(context.place(request(2, { height: 4 }))).toMatchObject({
		left: 20,
		top: 0,
		bottom: 4,
	});
});

it("preserves duplicate-id rejection after clearance queries", () => {
	const context = fixture();
	const first = context.place(request(1));
	expect(context.clearanceBottom("both")).toBe(12);
	expect(() =>
		context.place(request(1, { minimumTop: 80, height: 40 })),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(context.clearanceBottom("both")).toBe(12);
	expect(context.placements()).toEqual([first]);
	expect(context.place(request(2))).toMatchObject({ top: 0, left: 20 });
});

it("does not allocate phantom floats or consume retained-float capacity", () => {
	const context = fixture({ maxFloats: 1 });
	expect(context.clearanceBottom("both")).toBeNull();
	const first = context.place(request(1));
	expect(context.clearanceBottom("left")).toBe(12);
	expect(context.clearanceBottom("right")).toBeNull();
	expect(() => context.place(request(2))).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(context.placements()).toEqual([first]);
	expect(context.metrics().floats).toBe(1);
});

it("keeps clearance state local to each context even for the same float id", () => {
	const first = fixture();
	const second = fixture();
	first.place(request(1, { height: 40 }));
	expect(second.clearanceBottom("both")).toBeNull();
	second.place(request(1, { side: "right", height: 8 }));
	expect(first.clearanceBottom("both")).toBe(40);
	expect(second.clearanceBottom("both")).toBe(8);
	expect(first.clearanceBottom("right")).toBeNull();
	expect(second.clearanceBottom("left")).toBeNull();
});

it.each([
	["none", "none"],
	["logical start", "inline-start"],
	["missing", undefined],
	[
		"object",
		{
			toString() {
				throw new Error("Clearance must not coerce a caller object");
			},
		},
	],
	["array", ["left"]],
])(
	"rejects %s clearance without changing retained placements",
	(_name, value) => {
		const context = fixture();
		const first = context.place(request(1));
		expect(() => context.clearanceBottom(value as never)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(context.clearanceBottom("left")).toBe(12);
		expect(context.placements()).toEqual([first]);
		expect(context.place(request(2))).toMatchObject({ id: 2, top: 0 });
	},
);

it("rejects clearance after close without reviving released ownership", () => {
	const context = fixture();
	const first = context.place(request(1));
	const before = context.placements();
	context.close();
	expect(() => context.clearanceBottom("both")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(context.metrics()).toMatchObject({ closed: true, floats: 0 });
	expect(before).toEqual([first]);
	expect(() => context.close()).not.toThrow();
});

it("enforces the aggregate work cap for repeated clearance queries", () => {
	const context = fixture({ maxWork: 2 });
	expect(() => {
		for (let index = 0; index < 3; index++) context.clearanceBottom("both");
	}).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(context.metrics()).toMatchObject({ floats: 0, work: 2 });
	context.close();
	expect(context.metrics().closed).toBe(true);
});
