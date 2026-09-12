import { expect, it } from "vitest";
import { resolveBlockWidth, type BlockWidthStyle } from "./block-width.js";
import { initialBoxStyle } from "./css-box.js";
import { layoutValueLimits } from "./layout-values.js";
import {
	resolveShrinkToFitWidth,
	type ShrinkToFitIntrinsicWidths,
	type ShrinkToFitWidthOptions,
} from "./shrink-to-fit.js";

const style = (values: Partial<BlockWidthStyle> = {}): BlockWidthStyle => ({
	...initialBoxStyle,
	...values,
});
const intrinsic = { minContent: 10, maxContent: 80 };

it.each([
	[0, 10],
	[5, 10],
	[10, 10],
	[40, 40],
	[80, 80],
	[100, 80],
])(
	"clamps available width %s between intrinsic measurements to %s",
	(containingWidth, contentWidth) => {
		expect(
			resolveShrinkToFitWidth(style(), containingWidth, intrinsic),
		).toMatchObject({
			contentWidth,
			tentativeContentWidth: contentWidth,
			availableWidth: containingWidth,
			marginLeft: 0,
			marginRight: 0,
		});
	},
);

it("keeps explicit margins and zero auto margins instead of solving the block equation", () => {
	const input = style({
		width: "20px",
		"margin-left": "auto",
		"margin-right": "auto",
	});
	expect(resolveBlockWidth(input, 100)).toMatchObject({
		marginLeft: 40,
		marginRight: 40,
	});
	expect(resolveShrinkToFitWidth(input, 100)).toMatchObject({
		contentWidth: 20,
		marginLeft: 0,
		marginRight: 0,
	});
	expect(
		resolveShrinkToFitWidth(
			style({ width: "20px", "margin-left": "7px", "margin-right": "3px" }),
			100,
		),
	).toMatchObject({
		contentWidth: 20,
		marginLeft: 7,
		marginRight: 3,
		contentOffset: 7,
	});
});

it("uses the containing block, edges, margins and scrollbar allowance for available width", () => {
	const result = resolveShrinkToFitWidth(
		style({
			"padding-left": "4px",
			"padding-right": "6px",
			"margin-left": "3px",
			"margin-right": "7px",
		}),
		100,
		{ minContent: 10, maxContent: 200 },
		{ borderLeft: 2, borderRight: 3, scrollbarWidth: 15 },
	);
	expect(result).toMatchObject({
		availableWidth: 60,
		contentWidth: 60,
		borderBoxWidth: 75,
		contentOffset: 9,
	});
});

it("does not fit-clamp a preferred minimum larger than the available width", () => {
	const result = resolveShrinkToFitWidth(
		style({ "margin-left": "20px" }),
		5,
		intrinsic,
	);
	expect(result.availableWidth).toBe(-15);
	expect(result.contentWidth).toBe(10);
	expect(result.marginLeft).toBe(20);
});

it("preserves negative margins and their contribution to available width", () => {
	expect(
		resolveShrinkToFitWidth(
			style({ "margin-left": "-10px", "margin-right": "-5px" }),
			40,
			intrinsic,
		),
	).toMatchObject({
		availableWidth: 55,
		contentWidth: 55,
		marginLeft: -10,
		marginRight: -5,
		contentOffset: -10,
	});
});

it.each(["content-box", "border-box"])(
	"uses content intrinsic sizes for auto width under %s",
	(boxSizing) => {
		const result = resolveShrinkToFitWidth(
			style({
				"box-sizing": boxSizing,
				"padding-left": "3px",
				"padding-right": "5px",
			}),
			50,
			intrinsic,
			{ borderLeft: 1, borderRight: 1 },
		);
		expect(result).toMatchObject({ contentWidth: 40, borderBoxWidth: 50 });
	},
);

it.each([
	["content-box", 100],
	["border-box", 70],
] as const)(
	"resolves explicit %s width without replacing it by shrink-to-fit",
	(boxSizing, contentWidth) => {
		const result = resolveShrinkToFitWidth(
			style({
				width: "100px",
				"box-sizing": boxSizing,
				"padding-left": "10px",
				"padding-right": "10px",
			}),
			40,
			{ minContent: 1, maxContent: 2 },
			{ borderLeft: 5, borderRight: 5, scrollbarWidth: 10 },
		);
		expect(result.contentWidth).toBe(contentWidth);
		expect(result.marginRight).toBe(0);
	},
);

it("resolves percentage width and padding against containing width", () => {
	expect(
		resolveShrinkToFitWidth(
			style({
				width: "30%",
				"padding-left": "10%",
				"padding-right": "5%",
				"margin-left": "2%",
			}),
			200,
		),
	).toMatchObject({
		contentWidth: 60,
		paddingLeft: 20,
		paddingRight: 10,
		marginLeft: 4,
		borderBoxWidth: 90,
		contentOffset: 24,
	});
});

it.each([
	["0px", "20px", 20, "max-width"],
	["60px", "none", 60, "min-width"],
	["80px", "20px", 80, "min-width"],
	["50px", "20px", 50, "min-width"],
	["auto", "none", 50, "none"],
] as const)(
	"applies minimum %s after maximum %s",
	(minimum, maximum, contentWidth, clampedBy) => {
		expect(
			resolveShrinkToFitWidth(
				style({ "min-width": minimum, "max-width": maximum }),
				50,
				intrinsic,
			),
		).toMatchObject({ contentWidth, tentativeContentWidth: 50, clampedBy });
	},
);

it("subtracts edges from border-box constraints and floors content size at zero", () => {
	const input = style({
		width: "auto",
		"box-sizing": "border-box",
		"min-width": "20px",
		"max-width": "30px",
		"padding-left": "5px",
		"padding-right": "5px",
	});
	expect(
		resolveShrinkToFitWidth(input, 100, intrinsic, {
			borderLeft: 2,
			borderRight: 2,
		}),
	).toMatchObject({
		contentWidth: 16,
		borderBoxWidth: 30,
		clampedBy: "max-width",
	});
	expect(
		resolveShrinkToFitWidth(
			{ ...input, width: "2px", "min-width": "0px" },
			100,
			undefined,
			{ borderLeft: 2, borderRight: 2 },
		),
	).toMatchObject({ contentWidth: 0, borderBoxWidth: 14 });
});

it("requires actual intrinsic measurements only for auto width", () => {
	expect(() => resolveShrinkToFitWidth(style(), 100)).toThrow(
		"intrinsic measurements",
	);
	expect(
		resolveShrinkToFitWidth(style({ width: "12px" }), 100).contentWidth,
	).toBe(12);
});

it.each([
	null,
	[],
	"bad",
	{ minContent: 1 },
	{ minContent: 2, maxContent: 1 },
	{ minContent: -1, maxContent: 2 },
	{ minContent: NaN, maxContent: 2 },
	{ minContent: 1, maxContent: Infinity },
	{ minContent: "1", maxContent: 2 },
])("rejects invalid intrinsic measurements %j", (value) => {
	expect(() =>
		resolveShrinkToFitWidth(
			style(),
			100,
			value as unknown as ShrinkToFitIntrinsicWidths,
		),
	).toThrow();
});

it.each([NaN, Infinity, -1, "100", null])(
	"rejects invalid containing width %s",
	(value) => {
		expect(() =>
			resolveShrinkToFitWidth(style(), value as number, intrinsic),
		).toThrow();
	},
);

it.each([null, [], "bad"])("rejects malformed style or options %j", (value) => {
	expect(() =>
		resolveShrinkToFitWidth(
			value as unknown as BlockWidthStyle,
			100,
			intrinsic,
		),
	).toThrow();
	expect(() =>
		resolveShrinkToFitWidth(
			style(),
			100,
			intrinsic,
			value as unknown as ShrinkToFitWidthOptions,
		),
	).toThrow();
});

it.each(["borderLeft", "borderRight", "scrollbarWidth"] as const)(
	"checks nonnegative finite %s",
	(name) => {
		for (const value of [-1, NaN, Infinity, "3"])
			expect(() =>
				resolveShrinkToFitWidth(style(), 100, intrinsic, {
					[name]: value,
				} as ShrinkToFitWidthOptions),
			).toThrow();
	},
);

it("does not invoke numeric coercion and bounds actual used dimensions", () => {
	let coercions = 0;
	const value = {
		valueOf() {
			coercions++;
			return 5;
		},
	} as unknown as number;
	expect(() => resolveShrinkToFitWidth(style(), value, intrinsic)).toThrow();
	expect(coercions).toBe(0);
	expect(() =>
		resolveShrinkToFitWidth(style({ width: "1px" }), 100, undefined, {
			borderLeft: layoutValueLimits.maxAbsoluteLength,
		}),
	).toThrow("limit");
	expect(() =>
		resolveShrinkToFitWidth(style(), 100, {
			minContent: 0,
			maxContent: layoutValueLimits.maxAbsoluteLength + 1,
		}),
	).toThrow("limit");
});

it("does not impose a used-coordinate cap on a larger intermediate available width", () => {
	const maximum = layoutValueLimits.maxAbsoluteLength;
	const result = resolveShrinkToFitWidth(
		style({ "margin-left": `-${maximum}px` }),
		maximum,
		{ minContent: 1, maxContent: 4 },
	);
	expect(result.availableWidth).toBe(maximum * 2);
	expect(result.contentWidth).toBe(4);
	expect(result.contentOffset).toBe(-maximum);
});

it("returns an immutable snapshot without retaining mutable input state", () => {
	const input = { ...style() };
	const measurements = { ...intrinsic };
	const result = resolveShrinkToFitWidth(input, 40, measurements);
	expect(Object.isFrozen(result)).toBe(true);
	input.width = "70px";
	measurements.maxContent = 20;
	expect(result.contentWidth).toBe(40);
	expect(resolveShrinkToFitWidth(input, 40, measurements).contentWidth).toBe(
		70,
	);
});
