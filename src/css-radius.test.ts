import { expect, it } from "vitest";
import { parseBorderShorthand } from "./css-border.js";
import type { BoxFontMetrics } from "./css-box.js";
import { cssMathLimits } from "./css-math.js";
import {
	computeRadiusStyle,
	cssRadiusProperties,
	hasRadiusStyle,
	initialRadiusStyle,
	isCssRadiusProperty,
	parseRadiusDeclarations,
	radiusValueUsesFont,
	resolveRadiusStyle,
	serializeRadiusStyle,
	type RadiusSpecifiedStyle,
	type RadiusStyle,
} from "./css-radius.js";
import { createRoundedBox, roundedBoxContains } from "./rounded-box.js";

const viewport = { width: 800, height: 600 };
const fonts = { fontSize: 12, rootFontSize: 20, xHeight: 5 };

function specified(value: string): RadiusSpecifiedStyle {
	const declarations = parseRadiusDeclarations("border-radius", value);
	expect(declarations).toBeDefined();
	return Object.fromEntries(
		(declarations ?? []).map(({ property, value }) => [property, value]),
	);
}

function computed(value: string, metrics?: BoxFontMetrics): RadiusStyle {
	return computeRadiusStyle(
		specified(value),
		initialRadiusStyle,
		viewport,
		metrics,
	);
}

function cornerValues(style: RadiusStyle): string[] {
	return cssRadiusProperties.map((property) => style[property]);
}

it("defines only the four physical corner longhands in clockwise order", () => {
	expect(cssRadiusProperties).toEqual([
		"border-top-left-radius",
		"border-top-right-radius",
		"border-bottom-right-radius",
		"border-bottom-left-radius",
	]);
	for (const property of cssRadiusProperties)
		expect(isCssRadiusProperty(property)).toBe(true);
	for (const property of [
		"border-radius",
		"border-start-start-radius",
		"border",
	])
		expect(isCssRadiusProperty(property)).toBe(false);
	expect(cornerValues(initialRadiusStyle)).toEqual(Array(4).fill("0px"));
	expect(Object.isFrozen(cssRadiusProperties)).toBe(true);
	expect(Object.isFrozen(initialRadiusStyle)).toBe(true);
});

it.each([
	["0", "0px"],
	["-0 +0px", "0px"],
	[".5px 20%", "0.5px 20%"],
	["1e2px 100px", "100px"],
	[" 2PX\t3EM ", "2px 3em"],
	["calc(10px / 2) min(20%, 8px)", "calc(10px / 2) min(20%, 8px)"],
])("normalizes each longhand pair %s", (value, expected) => {
	for (const property of cssRadiusProperties)
		expect(parseRadiusDeclarations(property, value)).toEqual([
			{ property, value: expected },
		]);
});

const expansions = [
	{ source: "1px", values: ["1px", "1px", "1px", "1px"] },
	{ source: "1px 2%", values: ["1px", "2%", "1px", "2%"] },
	{ source: "1px 2% 3em", values: ["1px", "2%", "3em", "2%"] },
	{
		source: "1px 2% 3em 4rem",
		values: ["1px", "2%", "3em", "4rem"],
	},
];

it("expands all one-to-four-value combinations independently across both axes", () => {
	for (const horizontal of expansions) {
		expect(parseRadiusDeclarations("border-radius", horizontal.source)).toEqual(
			cssRadiusProperties.map((property, index) => ({
				property,
				value: horizontal.values[index],
			})),
		);
		for (const vertical of expansions)
			expect(
				parseRadiusDeclarations(
					"border-radius",
					`${horizontal.source}/${vertical.source}`,
				),
			).toEqual(
				cssRadiusProperties.map((property, index) => ({
					property,
					value:
						horizontal.values[index] === vertical.values[index]
							? horizontal.values[index]
							: `${horizontal.values[index]} ${vertical.values[index]}`,
				})),
			);
	}
});

it("matches the retained source example and keeps nested division inside math", () => {
	expect(Object.values(specified("2em 1em 4em / 0.5em 3em"))).toEqual([
		"2em 0.5em",
		"1em 3em",
		"4em 0.5em",
		"1em 3em",
	]);
	expect(
		cornerValues(
			computed(
				"calc(48px / (2 * 3)) min(12px, 20px) / max(4px, 8px) clamp(2px, 50%, 20px)",
			),
		),
	).toEqual([
		"8px",
		"12px clamp(2px, 50%, 20px)",
		"8px",
		"12px clamp(2px, 50%, 20px)",
	]);
});

it.each([
	"",
	" ",
	"/",
	"1px /",
	"/ 1px",
	"1px / 2px / 3px",
	"1px // 2px",
	"1px 2px 3px 4px 5px",
	"1px / 1px 2px 3px 4px 5px",
	"1px -2px",
	"1px / -2%",
	"auto",
	"none",
	"2",
	"1.px",
	"1e999px",
	"NaNpx",
	"1deg",
	"1px, 2px",
	"inherit 1px",
	"1px / initial",
	"unset / unset",
	"revert-layer",
	"calc(2px + 1)",
	"calc(2px / 0)",
	"calc(2px + 3px",
	"1px) / (2px",
	"var(--radius)",
])("rejects invalid shorthand atomically: %s", (value) => {
	expect(parseRadiusDeclarations("border-radius", value)).toBeUndefined();
});

it.each(["-1px", "-2%", "1px -2em", "1px 2px 3px", "1px / 2px", "inherit 0"])(
	"rejects invalid corner longhands: %s",
	(value) => {
		for (const property of cssRadiusProperties)
			expect(parseRadiusDeclarations(property, value)).toBeUndefined();
	},
);

it.each(["", " ", "\t\n", "1px 2px 3px"])(
	"rejects empty or oversized pairs at style boundaries: %s",
	(value) => {
		const style = { ...initialRadiusStyle, "border-top-left-radius": value };
		expect(
			parseRadiusDeclarations("border-top-left-radius", value),
		).toBeUndefined();
		expect(() =>
			computeRadiusStyle(style, initialRadiusStyle, viewport),
		).toThrow("Unsupported CSS radius pair");
		expect(() => resolveRadiusStyle(style, 100, 100)).toThrow(
			"Unsupported CSS radius pair",
		);
		expect(() => serializeRadiusStyle(style)).toThrow(
			"Unsupported CSS radius pair",
		);
		expect(() => hasRadiusStyle(style)).toThrow("Unsupported CSS radius pair");
	},
);

it("does not treat border shorthands as radius resets", () => {
	for (const property of ["border", "border-top", "border-width"])
		expect(parseRadiusDeclarations(property, "initial")).toBeUndefined();
	for (const value of ["1px solid red", "initial", "inherit"])
		expect(
			parseBorderShorthand("border", value)?.some(({ property }) =>
				isCssRadiusProperty(property),
			),
		).toBe(false);
});

it("honors native source and nesting limits before expanding declarations", () => {
	expect(
		parseRadiusDeclarations(
			"border-radius",
			`${" ".repeat(cssMathLimits.maxSourceCodeUnits)}1px`,
		),
	).toBeUndefined();
	expect(
		parseRadiusDeclarations(
			"border-radius",
			`${"calc(".repeat(cssMathLimits.maxDepth + 1)}1px${")".repeat(cssMathLimits.maxDepth + 1)}`,
		),
	).toBeUndefined();
});

it.each(["initial", "inherit", "unset", "revert"])(
	"expands standalone CSS-wide keyword %s",
	(keyword) => {
		expect(parseRadiusDeclarations("border-radius", keyword)).toEqual(
			cssRadiusProperties.map((property) => ({ property, value: keyword })),
		);
		for (const property of cssRadiusProperties)
			expect(parseRadiusDeclarations(property, keyword)).toEqual([
				{ property, value: keyword },
			]);
	},
);

it("defaults and resets to zero without inheriting, but copies explicit inheritance", () => {
	const parent = computed("2em 10% / 4ex 3rem", fonts);
	const original = { ...parent };
	expect(computeRadiusStyle({}, parent, viewport)).toEqual(initialRadiusStyle);
	for (const keyword of ["initial", "unset", "revert"])
		expect(computeRadiusStyle(specified(keyword), parent, viewport)).toEqual(
			initialRadiusStyle,
		);
	const inherited = computeRadiusStyle(
		specified("inherit"),
		parent,
		{ width: 100, height: 100 },
		{ fontSize: 99, rootFontSize: 99, xHeight: 99 },
	);
	expect(inherited).toEqual(parent);
	expect(parent).toEqual(original);
	expect(Object.isFrozen(inherited)).toBe(true);
	expect(
		computeRadiusStyle(
			{
				"border-top-right-radius": "inherit",
				"border-bottom-left-radius": "5px",
			},
			parent,
			viewport,
		),
	).toEqual({
		...initialRadiusStyle,
		"border-top-right-radius": parent["border-top-right-radius"],
		"border-bottom-left-radius": "5px",
	});
});

it.each([
	["1in", 96],
	["2.54cm", 96],
	["25.4mm", 96],
	["101.6q", 96],
	["72pt", 96],
	["6pc", 96],
	["0.25px", 0.25],
	["2vw", 16],
	["2vh", 12],
	["2vmin", 12],
	["2vmax", 16],
])(
	"computes %s using native padding lengths, without border-width rounding",
	(value, expected) => {
		const radii = resolveRadiusStyle(computed(String(value)), 500, 500);
		for (const radius of radii) {
			expect(radius.horizontal).toBeCloseTo(Number(expected), 10);
			expect(radius.vertical).toBeCloseTo(Number(expected), 10);
		}
	},
);

it("computes font units on both axes and inside math using supplied metrics", () => {
	expect(
		cornerValues(computed("2em 3rem / 4ex calc(1em + 1rem)", fonts)),
	).toEqual(["24px 20px", "60px 32px", "24px 20px", "60px 32px"]);
	expect(computed("1em", { fontSize: 0 })).toEqual(initialRadiusStyle);
	for (const value of ["1em", "1rem", "1ex", "1px / calc(1em + 2%)"])
		expect(() => computed(value)).toThrow("computed font metrics");
	for (const metrics of [
		{ fontSize: -1 },
		{ rootFontSize: Infinity },
		{ xHeight: NaN },
	])
		expect(() => computed("1px", metrics)).toThrow(
			"Invalid computed box font metrics",
		);
});

it("detects font dependencies without confusing em and rem", () => {
	expect(radiusValueUsesFont("2px 3rem", "em")).toBe(false);
	expect(radiusValueUsesFont("2px 3rem", "rem")).toBe(true);
	expect(radiusValueUsesFont("max(1em, 2%) 4px", "em")).toBe(true);
	expect(radiusValueUsesFont("1px clamp(2px, 3EX, 8px)", "ex")).toBe(true);
	expect(radiusValueUsesFont("1ex", "rem")).toBe(false);
	expect(radiusValueUsesFont("1example", "ex")).toBe(false);
	for (const unit of ["em", "rem", "ex"] as const) {
		expect(radiusValueUsesFont("", unit)).toBe(false);
		for (const value of [
			`2${unit} 4px`,
			`4px 2${unit}`,
			`calc(-2${unit} + 10%) 4px`,
			`4px calc(-2${unit} + 10%)`,
		]) {
			expect(radiusValueUsesFont(value, unit)).toBe(true);
			for (const other of ["em", "rem", "ex"] as const)
				if (other !== unit)
					expect(radiusValueUsesFont(value, other)).toBe(false);
		}
	}
});

it("preserves computed percentages and resolves each axis against its own border-box", () => {
	const style = computed("50% / 25%");
	expect(cornerValues(style)).toEqual(Array(4).fill("50% 25%"));
	expect(resolveRadiusStyle(style, 200, 80)).toEqual(
		Array(4).fill({ horizontal: 100, vertical: 20 }),
	);
	expect(resolveRadiusStyle(style, 80, 200)).toEqual(
		Array(4).fill({ horizontal: 40, vertical: 50 }),
	);
	expect(resolveRadiusStyle(computed("50%"), 200, 80)).toEqual(
		Array(4).fill({ horizontal: 100, vertical: 40 }),
	);
	expect(cornerValues(style)).toEqual(Array(4).fill("50% 25%"));
});

it("clamps negative math at computed or used time just like padding", () => {
	expect(computed("calc(1px - 3px)")).toEqual(initialRadiusStyle);
	const style = computed("calc(10% - 20px) / max(-2px, calc(50% - 30px))");
	expect(cornerValues(style)).toEqual(
		Array(4).fill("calc(10% - 20px) max(-2px, 50% - 30px)"),
	);
	expect(resolveRadiusStyle(style, 100, 40)).toEqual(
		Array(4).fill({ horizontal: 0, vertical: 0 }),
	);
	expect(resolveRadiusStyle(style, 300, 100)).toEqual(
		Array(4).fill({ horizontal: 10, vertical: 20 }),
	);
});

it.each(["-1px", "-2%", "-3em", "-4rem", "-5ex"])(
	"rejects literal %s but accepts and clamps its calc equivalent",
	(value) => {
		for (const source of [value, `4px / ${value}`])
			expect(parseRadiusDeclarations("border-radius", source)).toBeUndefined();
		for (const property of cssRadiusProperties) {
			expect(parseRadiusDeclarations(property, value)).toBeUndefined();
			expect(
				parseRadiusDeclarations(property, `4px calc(${value})`),
			).toBeDefined();
		}
		expect(
			resolveRadiusStyle(computed(`calc(${value})`, fonts), 100, 100),
		).toEqual(Array(4).fill({ horizontal: 0, vertical: 0 }));
		expect(
			resolveRadiusStyle(computed(`4px / calc(${value})`, fonts), 100, 100),
		).toEqual(Array(4).fill({ horizontal: 4, vertical: 0 }));
	},
);

it("leaves overlap normalization and either-axis-square geometry to rounded-box", () => {
	const radii = resolveRadiusStyle(computed("80px / 40px"), 100, 50);
	expect(radii).toEqual(Array(4).fill({ horizontal: 80, vertical: 40 }));
	expect(Object.isFrozen(radii)).toBe(true);
	expect(radii.every(Object.isFrozen)).toBe(true);
	expect(createRoundedBox(0, 0, 100, 50, radii).radii).toEqual(
		Array(4).fill({ horizontal: 50, vertical: 25 }),
	);
	for (const value of ["0px / 20px", "20px / 0px"])
		expect(
			roundedBoxContains(
				createRoundedBox(
					0,
					0,
					100,
					50,
					resolveRadiusStyle(computed(value), 100, 50),
				),
				0,
				0,
			),
		).toBe(true);
});

it("retains native validation for invalid geometry, uncomputed units and overflow", () => {
	for (const dimension of [-1, NaN, Infinity]) {
		expect(() =>
			resolveRadiusStyle(initialRadiusStyle, dimension, 10),
		).toThrow();
		expect(() =>
			resolveRadiusStyle(initialRadiusStyle, 10, dimension),
		).toThrow();
	}
	expect(() => computed("1e308in")).toThrow("overflow");
	expect(() => resolveRadiusStyle(computed("1e20px"), 100, 100)).toThrow(
		"limit",
	);
	expect(() =>
		resolveRadiusStyle(
			{ ...initialRadiusStyle, "border-top-left-radius": "1em" },
			100,
			100,
		),
	).toThrow("computed pixel or percentage");
	expect(resolveRadiusStyle(computed("50%"), 0, 0)).toEqual(
		Array(4).fill({ horizontal: 0, vertical: 0 }),
	);
});

it.each([
	["0", "0px"],
	["1px 1px 1px 1px", "1px"],
	["1px 2px 1px 2px", "1px 2px"],
	["1px 2px 3px 2px", "1px 2px 3px"],
	["1px 2px 3px 4px", "1px 2px 3px 4px"],
	["1px 2px / 1px 2px", "1px 2px"],
	["1px 2px 3px 4px / 5px", "1px 2px 3px 4px / 5px"],
	["50% / 25% 10%", "50% / 25% 10%"],
	["calc(10% + 2px) / min(20%, 30px)", "calc(10% + 2px) / min(20%, 30px)"],
])(
	"serializes the shortest axis-preserving shorthand for %s",
	(value, expected) => {
		const style = computed(value);
		expect(serializeRadiusStyle(style)).toBe(expected);
		expect(computed(serializeRadiusStyle(style))).toEqual(style);
	},
);

it("serializes only uniform CSS-wide keywords and conservatively detects radius styles", () => {
	for (const keyword of ["initial", "inherit", "unset", "revert"])
		expect(serializeRadiusStyle(specified(keyword) as RadiusStyle)).toBe(
			keyword,
		);
	expect(
		serializeRadiusStyle({
			...initialRadiusStyle,
			"border-top-left-radius": "inherit",
		}),
	).toBe("");
	expect(hasRadiusStyle(initialRadiusStyle)).toBe(false);
	expect(hasRadiusStyle(computed("0% / 0px"))).toBe(false);
	expect(hasRadiusStyle(computed("calc(-2px)"))).toBe(false);
	expect(hasRadiusStyle(computed("1px"))).toBe(true);
	expect(hasRadiusStyle(computed("0px / 1px"))).toBe(true);
	expect(hasRadiusStyle(computed("calc(20% - 10px)"))).toBe(true);
});
