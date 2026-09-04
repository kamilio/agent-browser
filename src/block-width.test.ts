import { expect, it } from "vitest";
import { type BlockWidthStyle, resolveBlockWidth } from "./block-width.js";
import { initialBoxStyle } from "./css-box.js";
import { layoutValueLimits, resolveLayoutLength } from "./layout-values.js";

function style(values: Partial<BlockWidthStyle> = {}): BlockWidthStyle {
	return { ...initialBoxStyle, ...values };
}

const widthCases: [string, string, string, number, number, number][] = [
	["auto", "10px", "20px", 70, 10, 20],
	["auto", "auto", "10px", 90, 0, 10],
	["auto", "10px", "auto", 90, 10, 0],
	["auto", "auto", "auto", 100, 0, 0],
	["auto", "80px", "50px", 0, 80, 20],
	["auto", "120px", "50px", 0, 120, -20],
	["auto", "-10px", "-20px", 130, -10, -20],
	["50px", "auto", "auto", 50, 25, 25],
	["50px", "auto", "10px", 50, 40, 10],
	["50px", "10px", "auto", 50, 10, 40],
	["50px", "10px", "20px", 50, 10, 40],
	["120px", "auto", "auto", 120, 0, -20],
	["120px", "auto", "10px", 120, 0, -20],
	["120px", "10px", "auto", 120, 10, -30],
	["120px", "auto", "-50px", 120, 30, -50],
	["120px", "-50px", "auto", 120, -50, 30],
];

it.each(widthCases)(
	"solves LTR width %s with margins %s / %s",
	(width, left, right, contentWidth, marginLeft, marginRight) => {
		expect(
			resolveBlockWidth(
				style({ width, "margin-left": left, "margin-right": right }),
				100,
			),
		).toMatchObject({ contentWidth, marginLeft, marginRight });
	},
);

it.each(widthCases)(
	"solves mirrored RTL width %s with reversed margins %s / %s",
	(width, left, right, contentWidth, marginLeft, marginRight) => {
		expect(
			resolveBlockWidth(
				style({ width, "margin-left": right, "margin-right": left }),
				100,
				{ containingDirection: "rtl" },
			),
		).toMatchObject({
			contentWidth,
			marginLeft: marginRight,
			marginRight: marginLeft,
		});
	},
);

it("resolves percentage widths, padding and margins against the definite containing width", () => {
	const result = resolveBlockWidth(
		style({
			width: "50%",
			"padding-left": "10%",
			"padding-right": "5%",
			"margin-left": "5%",
			"margin-right": "auto",
		}),
		400,
		{ borderLeft: 3, borderRight: 7 },
	);
	expect(result).toEqual({
		containingWidth: 400,
		contentWidth: 200,
		paddingLeft: 40,
		paddingRight: 20,
		borderLeft: 3,
		borderRight: 7,
		marginLeft: 20,
		marginRight: 110,
		borderBoxWidth: 270,
		contentOffset: 63,
		clampedBy: "none",
	});
	expect(Object.isFrozen(result)).toBe(true);
});

it("subtracts padding and caller-supplied borders for border-box sizing", () => {
	const result = resolveBlockWidth(
		style({
			width: "50%",
			"box-sizing": "border-box",
			"padding-left": "10%",
			"padding-right": "5%",
			"margin-left": "5%",
			"margin-right": "auto",
		}),
		400,
		{ borderLeft: 3, borderRight: 7 },
	);
	expect(result).toMatchObject({
		contentWidth: 130,
		borderBoxWidth: 200,
		marginLeft: 20,
		marginRight: 180,
		contentOffset: 63,
	});
});

it("floors border-box content at zero rather than shrinking padding or borders", () => {
	const result = resolveBlockWidth(
		style({
			width: "4px",
			"max-width": "2px",
			"box-sizing": "border-box",
			"padding-left": "10px",
			"padding-right": "10px",
			"margin-left": "auto",
			"margin-right": "auto",
		}),
		100,
		{ borderLeft: 3, borderRight: 2 },
	);
	expect(result).toMatchObject({
		contentWidth: 0,
		borderBoxWidth: 25,
		marginLeft: 37.5,
		marginRight: 37.5,
	});
});

it.each([
	["auto", "auto", "300px", 300, 100, "max-width"],
	["100px", "200px", "300px", 200, 150, "min-width"],
	["400px", "450px", "300px", 450, 25, "min-width"],
	["100px", "50%", "75%", 250, 125, "min-width"],
] as const)(
	"re-solves auto margins after width %s constraints %s / %s",
	(width, minimum, maximum, contentWidth, margin, clampedBy) => {
		expect(
			resolveBlockWidth(
				style({
					width,
					"min-width": minimum,
					"max-width": maximum,
					"margin-left": "auto",
					"margin-right": "auto",
				}),
				500,
			),
		).toMatchObject({
			contentWidth,
			marginLeft: margin,
			marginRight: margin,
			clampedBy,
		});
	},
);

it("applies border-box min/max to the same sizing edge as width", () => {
	const result = resolveBlockWidth(
		style({
			width: "auto",
			"max-width": "60%",
			"min-width": "70%",
			"box-sizing": "border-box",
			"padding-left": "10px",
			"padding-right": "10px",
			"margin-left": "auto",
			"margin-right": "auto",
		}),
		200,
		{ borderLeft: 5, borderRight: 5 },
	);
	expect(result).toMatchObject({
		contentWidth: 110,
		borderBoxWidth: 140,
		marginLeft: 30,
		marginRight: 30,
		clampedBy: "min-width",
	});
});

it("treats auto minimum as zero only in this normal-flow block solver", () => {
	expect(resolveBlockWidth(style({ width: "0px" }), 100).contentWidth).toBe(0);
	expect(
		resolveBlockWidth(style({ width: "50%", "padding-left": "5%" }), 0),
	).toMatchObject({
		contentWidth: 0,
		paddingLeft: 0,
		marginLeft: 0,
		marginRight: 0,
	});
});

it("uses exact computed inputs without mutating styles or options", () => {
	const input = Object.freeze(
		style({ width: "12.5px", "margin-left": "-0px", "margin-right": "auto" }),
	);
	const options = Object.freeze({
		borderLeft: 0.25,
		borderRight: 0.75,
		containingDirection: "rtl" as const,
	});
	expect(resolveBlockWidth(input, 30, options)).toMatchObject({
		contentWidth: 12.5,
		borderBoxWidth: 13.5,
		marginLeft: 0,
		marginRight: 16.5,
	});
	expect(input["margin-left"]).toBe("-0px");
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])(
	"rejects invalid containing width %s",
	(width) => {
		expect(() => resolveBlockWidth(style(), width)).toThrow("layout length");
	},
);

it.each([
	"auto",
	"none",
	"inherit",
	"1em",
	"env(safe-area-inset-left)",
	"3",
	"1.px",
	"0x20px",
])("rejects unresolved/non-length padding %s", (value) => {
	expect(() =>
		resolveBlockWidth(style({ "padding-left": value }), 100),
	).toThrow("computed pixel or percentage");
});

it("resolves computed percentage calculations before the auto-width equation", () => {
	expect(
		resolveBlockWidth(style({ "padding-left": "calc(100% - 2px)" }), 100),
	).toMatchObject({ paddingLeft: 98, contentWidth: 2, borderBoxWidth: 100 });
});

it("rejects negative sizes but permits signed margins", () => {
	for (const property of [
		"width",
		"min-width",
		"max-width",
		"padding-left",
		"padding-right",
	] as const)
		expect(() => resolveBlockWidth(style({ [property]: "-1px" }), 100)).toThrow(
			"Negative layout size",
		);
	expect(
		resolveBlockWidth(style({ "margin-left": "-10%" }), 100).marginLeft,
	).toBe(-10);
});

it("validates direction, box sizing, border inputs and runtime shapes", () => {
	expect(() =>
		resolveBlockWidth(style(), 100, {
			containingDirection: "vertical" as never,
		}),
	).toThrow("direction");
	expect(() =>
		resolveBlockWidth(style({ "box-sizing": "padding-box" }), 100),
	).toThrow("box sizing");
	expect(() => resolveBlockWidth(style(), 100, { borderLeft: -1 })).toThrow(
		"layout length",
	);
	expect(() =>
		resolveBlockWidth(style(), 100, { borderRight: Number.NaN }),
	).toThrow("layout length");
	expect(() => resolveBlockWidth(null as never, 100)).toThrow("inputs");
	expect(() => resolveBlockWidth(style(), 100, [] as never)).toThrow("inputs");
	expect(() =>
		resolveBlockWidth(style({ width: undefined as never }), 100),
	).toThrow("computed layout length");
});

it("enforces source, finite-number, extent and computed-output bounds without clipping", () => {
	expect(() =>
		resolveBlockWidth(style(), layoutValueLimits.maxAbsoluteLength + 1),
	).toThrow("length limit");
	expect(() =>
		resolveBlockWidth(style({ width: `${"1".repeat(129)}px` }), 100),
	).toThrow("source limit");
	expect(() => resolveBlockWidth(style({ width: "1e999px" }), 100)).toThrow(
		"overflow",
	);
	expect(() => resolveBlockWidth(style({ width: "1e308%" }), 10000)).toThrow(
		"overflow",
	);
	expect(() =>
		resolveBlockWidth(
			style({ "margin-left": "-16777216px", "margin-right": "-16777216px" }),
			100,
		),
	).toThrow("length limit");
	expect(() =>
		resolveBlockWidth(
			style({ width: "16777216px", "padding-left": "1px" }),
			100,
		),
	).toThrow("length limit");
});

it("resolves computed exponent and percentage values without a host evaluator", () => {
	expect(resolveLayoutLength("1e2px", 10)).toBe(100);
	expect(resolveLayoutLength(".5%", 200)).toBe(1);
	expect(resolveLayoutLength("1e308%", 0)).toBe(0);
	expect(() => resolveLayoutLength('0px); process.exit(); ("', 100)).toThrow();
});

it("satisfies width conservation, min/max and mirror invariants for 2000 deterministic configurations", () => {
	let seed = 20260902;
	const next = (maximum: number) => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed % maximum;
	};
	for (let index = 0; index < 2000; index++) {
		const containing = next(1000);
		const minimum = next(700);
		const maximum = next(700);
		const paddingLeft = next(80);
		const paddingRight = next(80);
		const borderLeft = next(10);
		const borderRight = next(10);
		const left = next(3) ? `${next(400) - 200}px` : "auto";
		const right = next(3) ? `${next(400) - 200}px` : "auto";
		const borderBox = Boolean(next(2));
		const input = style({
			width: next(3) ? `${next(1000)}px` : "auto",
			"min-width": `${minimum}px`,
			"max-width": `${maximum}px`,
			"box-sizing": borderBox ? "border-box" : "content-box",
			"margin-left": left,
			"margin-right": right,
			"padding-left": `${paddingLeft}px`,
			"padding-right": `${paddingRight}px`,
		});
		const resolved = resolveBlockWidth(input, containing, {
			borderLeft,
			borderRight,
		});
		const edges = paddingLeft + paddingRight + borderLeft + borderRight;
		const minContent = Math.max(0, minimum - (borderBox ? edges : 0));
		const maxContent = Math.max(minContent, maximum - (borderBox ? edges : 0));
		expect(resolved.contentWidth).toBeGreaterThanOrEqual(minContent);
		expect(resolved.contentWidth).toBeLessThanOrEqual(maxContent);
		expect(
			resolved.marginLeft + resolved.borderBoxWidth + resolved.marginRight,
		).toBeCloseTo(containing, 8);
		const mirrored = resolveBlockWidth(
			{
				...input,
				"margin-left": right,
				"margin-right": left,
				"padding-left": `${paddingRight}px`,
				"padding-right": `${paddingLeft}px`,
			},
			containing,
			{
				borderLeft: borderRight,
				borderRight: borderLeft,
				containingDirection: "rtl",
			},
		);
		expect(mirrored.contentWidth).toBe(resolved.contentWidth);
		expect(mirrored.marginLeft).toBe(resolved.marginRight);
		expect(mirrored.marginRight).toBe(resolved.marginLeft);
		expect(
			mirrored.contentOffset + resolved.contentOffset + resolved.contentWidth,
		).toBeCloseTo(containing, 8);
	}
});
