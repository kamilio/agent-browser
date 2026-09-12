import { expect, it } from "vitest";
import {
	blockContentAlignmentOffset,
	resolveBlockContentAlignment,
	type BlockContentAlignment,
} from "./block-content-alignment.js";
import { layoutValueLimits } from "./layout-values.js";

it("leaves normal block alignment unchanged", () => {
	expect(resolveBlockContentAlignment("normal")).toBeUndefined();
});

it.each(
	["start", "flex-start", "center", "end", "flex-end"].flatMap((value) =>
		["", "safe ", "unsafe "].map((prefix) => ({
			value: prefix + value,
			position: value.replace("flex-", ""),
			overflow: prefix === "unsafe " ? "unsafe" : "safe",
		})),
	),
)(
	"resolves non-scroll block position $value",
	({ value, position, overflow }) => {
		const result = resolveBlockContentAlignment(value);
		expect(result).toEqual({ position, overflow });
		expect(Object.isFrozen(result)).toBe(true);
	},
);

it.each([
	{ value: "stretch", position: "start" },
	{ value: "space-between", position: "start" },
	{ value: "space-around", position: "center" },
	{ value: "space-evenly", position: "center" },
])("uses block distribution fallback for $value", ({ value, position }) => {
	expect(resolveBlockContentAlignment(value)).toEqual({
		position,
		overflow: "safe",
	});
});

it.each([
	"baseline",
	"first baseline",
	"last baseline",
	"left",
	"right",
	"self-start",
	"self-end",
	"safe stretch",
	"unsafe space-around",
	"unknown",
])("does not invent block support for %s", (value) => {
	expect(resolveBlockContentAlignment(value)).toBeNull();
});

it.each(
	(["start", "center", "end"] as const).flatMap((position) =>
		(["safe", "unsafe"] as const).flatMap((overflow) =>
			[0, 8, 20].map((natural) => ({ position, overflow, natural })),
		),
	),
)(
	"places $position/$overflow content with natural height $natural",
	({ position, overflow, natural }) => {
		const free = 16 - natural;
		const expected =
			overflow === "safe" && free < 0
				? 0
				: position === "center"
					? free / 2
					: position === "end"
						? free
						: 0;
		expect(
			blockContentAlignmentOffset({ position, overflow }, 16, natural),
		).toBe(expected);
	},
);

it.each(["safe", "unsafe"] as const)(
	"keeps fractional offsets for %s alignment",
	(overflow) => {
		expect(
			blockContentAlignmentOffset({ position: "center", overflow }, 16, 9),
		).toBe(3.5);
	},
);

it.each(
	[
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		null,
		undefined,
		"8",
		{},
	].flatMap((value) => ["used", "natural"].map((axis) => ({ value, axis }))),
)("rejects invalid $axis height $value", ({ value, axis }) => {
	expect(() =>
		blockContentAlignmentOffset(
			{ position: "center", overflow: "safe" },
			(axis === "used" ? value : 16) as number,
			(axis === "natural" ? value : 8) as number,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each(["used", "natural"])(
	"retains the coordinate limit for %s height",
	(axis) => {
		const value = layoutValueLimits.maxAbsoluteLength + 1;
		expect(() =>
			blockContentAlignmentOffset(
				{ position: "center", overflow: "unsafe" },
				axis === "used" ? value : 16,
				axis === "natural" ? value : 8,
			),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it.each([
	null,
	{},
	{ position: "baseline", overflow: "safe" },
	{ position: "center", overflow: "invalid" },
])("rejects invalid retained alignment %j", (alignment) => {
	expect(() =>
		blockContentAlignmentOffset(alignment as BlockContentAlignment, 16, 8),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});
