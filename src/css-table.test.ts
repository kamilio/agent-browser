import { expect, it } from "vitest";
import type { BoxFontMetrics } from "./css-box.js";
import { cssMathLimits } from "./css-math.js";
import {
	computeTableStyle,
	cssTableProperties,
	initialTableStyle,
	isCssTableProperty,
	parseTableDeclarations,
	parseTableValue,
	type TableSpecifiedStyle,
	type TableStyle,
} from "./css-table.js";

const viewport = Object.freeze({ width: 800, height: 600 });
const fonts = Object.freeze({ fontSize: 12, rootFontSize: 20 });
const parent: TableStyle = Object.freeze({
	"table-layout": "fixed",
	"border-collapse": "collapse",
	"border-spacing": "24px 40px",
	"caption-side": "bottom",
	"empty-cells": "hide",
	"vertical-align": "middle",
});

function computeSpacing(source: string, metrics?: Readonly<BoxFontMetrics>) {
	const value = parseTableValue("border-spacing", source);
	expect(value).toBeDefined();
	return computeTableStyle(
		{ "border-spacing": value },
		initialTableStyle,
		viewport,
		metrics,
	)["border-spacing"];
}

it("exposes only the six table longhands and frozen initial values", () => {
	expect(cssTableProperties).toEqual([
		"table-layout",
		"border-collapse",
		"border-spacing",
		"caption-side",
		"empty-cells",
		"vertical-align",
	]);
	expect(initialTableStyle).toEqual({
		"table-layout": "auto",
		"border-collapse": "separate",
		"border-spacing": "0px 0px",
		"caption-side": "top",
		"empty-cells": "show",
		"vertical-align": "baseline",
	});
	expect(Object.isFrozen(cssTableProperties)).toBe(true);
	expect(Object.isFrozen(initialTableStyle)).toBe(true);
	expect(computeTableStyle({}, initialTableStyle, viewport)).toBe(
		initialTableStyle,
	);
	for (const name of cssTableProperties)
		expect(isCssTableProperty(name)).toBe(true);
	for (const name of [
		"table",
		"border",
		"TABLE-LAYOUT",
		"constructor",
		"__proto__",
	])
		expect(isCssTableProperty(name)).toBe(false);
});

it("parses every supported keyword with ASCII case and whitespace normalization", () => {
	const values: Record<keyof TableStyle, readonly string[]> = {
		"table-layout": ["auto", "fixed"],
		"border-collapse": ["separate", "collapse"],
		"border-spacing": ["0px", "1px 2px"],
		"caption-side": ["top", "bottom"],
		"empty-cells": ["show", "hide"],
		"vertical-align": ["baseline", "top", "middle", "bottom"],
	};
	for (const name of cssTableProperties)
		for (const value of values[name]) {
			expect(parseTableValue(name, `\t${value.toUpperCase()}\n`)).toBe(value);
			expect(parseTableDeclarations(name, value)).toEqual([
				{ property: name, value },
			]);
		}
	expect(parseTableDeclarations("border", "0px")).toBeUndefined();
	expect(parseTableDeclarations("table-layout", "fixed auto")).toBeUndefined();
});

it("accepts the existing CSS-wide set for every property", () => {
	for (const name of cssTableProperties)
		for (const value of ["initial", "inherit", "unset", "revert"])
			expect(parseTableValue(name, ` ${value.toUpperCase()} `)).toBe(value);
});

it.each([
	["0", "0px"],
	["-0", "0px"],
	["+0 0.0", "0px 0px"],
	["+01.50PX\t2e1pX", "1.5px 20px"],
	[".5em\n1rem", "0.5em 1rem"],
	["calc(1px + 2px) 3px", "calc(1px + 2px) 3px"],
])("normalizes spacing %s", (source, expected) => {
	expect(parseTableValue("border-spacing", source)).toBe(expected);
});

it.each([
	"",
	" ",
	"auto",
	"none",
	"normal",
	"1",
	"-1",
	"1px -2px",
	"-1px",
	"-1em",
	"1px 2px 3px",
	"1px,2px",
	"1px/2px",
	"1px!important",
	"inherit 1px",
	"1px unset",
	"revert initial",
	"revert-layer",
	"10%",
	"0%",
	"calc(1px + 0%)",
	"min(1px, 2%)",
	"max(0%, 2px)",
	"clamp(0px, 1px, 0%)",
	"calc(0 * 10%)",
	"calc(1px + min(2px, 0%))",
	"1ex",
	"1ch",
	"1dvw",
	"NaNpx",
	"Infinitypx",
	"1e309px",
	"1.px",
	"1e+px",
	"--1px",
	"1..2px",
	"0x10px",
	"calc(1px+2px)",
	"calc(1px +)",
	"calc(1px",
	"1px)",
	"calc(2)",
	"calc(1px * 2px)",
	"calc(1px / 0)",
	"var(--spacing)",
	"fit-content(2px)",
])("rejects unsupported or malformed spacing %s", (source) => {
	expect(parseTableValue("border-spacing", source)).toBeUndefined();
	expect(parseTableDeclarations("border-spacing", source)).toBeUndefined();
});

it("rejects unsupported keyword and vertical alignment extensions", () => {
	for (const name of cssTableProperties)
		for (const value of ["revert-layer", "unknown", "", "auto fixed"])
			expect(parseTableValue(name, value)).toBeUndefined();
	for (const value of [
		"sub",
		"super",
		"text-top",
		"text-bottom",
		"1px",
		"0",
		"10%",
	])
		expect(parseTableValue("vertical-align", value)).toBeUndefined();
	expect(parseTableValue("caption-side", "left")).toBeUndefined();
	expect(parseTableValue("empty-cells", "collapse")).toBeUndefined();
});

it.each([
	["0", "0px 0px"],
	["1px 2px", "1px 2px"],
	["1in", "96px 96px"],
	["72pt 6pc", "96px 96px"],
	["1e2px .5px", "100px 0.5px"],
	["2em 3rem", "24px 60px"],
	["2vw 3vh", "16px 18px"],
	["2vmin 3vmax", "12px 24px"],
	["calc(2em + 1rem) min(4vw, 30px)", "44px 30px"],
	["max(2px, 1rem) clamp(1px, 2vw, 10px)", "20px 10px"],
	["calc((2px + 3px) * 4 / 2)", "10px 10px"],
	["calc(1px - 3px) max(-2px, -1px)", "0px 0px"],
])("computes spacing %s to two absolute pixel lengths", (source, expected) => {
	expect(computeSpacing(source, fonts)).toBe(expected);
});

it.each(["2.54cm", "25.4mm", "101.6q"])(
	"resolves physical spacing %s through box conversion",
	(source) => {
		const values = computeSpacing(source).split(" ");
		expect(values).toHaveLength(2);
		for (const value of values) {
			expect(value.endsWith("px")).toBe(true);
			expect(Number.parseFloat(value)).toBeCloseTo(96, 10);
		}
	},
);

it("inherits only collapse, spacing, caption side and empty cells by default", () => {
	expect(computeTableStyle({}, parent, viewport)).toEqual({
		...parent,
		"table-layout": "auto",
		"vertical-align": "baseline",
	});
	for (const value of ["initial", "inherit", "unset", "revert"]) {
		const specified = Object.fromEntries(
			cssTableProperties.map((name) => [name, value]),
		);
		const result = computeTableStyle(specified, parent, viewport);
		expect(result).toEqual(
			value === "initial"
				? initialTableStyle
				: value === "inherit"
					? parent
					: { ...parent, "table-layout": "auto", "vertical-align": "baseline" },
		);
		if (value === "inherit") expect(result).toBe(parent);
	}
});

it("uses UA defaults only for absent and revert values", () => {
	const defaults = Object.freeze({
		"table-layout": "fixed",
		"border-spacing": "1em 2rem",
		"vertical-align": "top",
	});
	for (const value of [undefined, "revert"]) {
		const specified = Object.fromEntries(
			cssTableProperties.map((name) => [name, value]),
		);
		expect(
			computeTableStyle(specified, parent, viewport, fonts, defaults),
		).toEqual({
			...parent,
			...defaults,
			"border-spacing": "12px 40px",
		});
	}
	for (const value of ["initial", "unset", "inherit"]) {
		const specified = Object.fromEntries(
			cssTableProperties.map((name) => [name, value]),
		);
		expect(
			computeTableStyle(specified, parent, viewport, fonts, defaults),
		).toEqual(computeTableStyle(specified, parent, viewport, fonts));
	}
	expect(
		computeTableStyle(
			{ "border-spacing": "3px", "vertical-align": "bottom" },
			parent,
			viewport,
			fonts,
			defaults,
		),
	).toMatchObject({ "border-spacing": "3px 3px", "vertical-align": "bottom" });
});

it("inherits computed spacing without requiring or reapplying child font metrics", () => {
	const computedParent = computeTableStyle(
		{ "border-spacing": "2em 3rem" },
		initialTableStyle,
		viewport,
		fonts,
	);
	for (const value of [undefined, "inherit", "unset", "revert"]) {
		const specified = { "border-spacing": value };
		expect(computeTableStyle(specified, computedParent, viewport)).toBe(
			computedParent,
		);
		expect(
			computeTableStyle(
				specified,
				computedParent,
				{ width: 1, height: 1 },
				{
					fontSize: 99,
					rootFontSize: 99,
				},
			),
		).toBe(computedParent);
	}
});

it("returns frozen styles without freezing or modifying caller-owned objects", () => {
	const mutableParent = { ...initialTableStyle };
	const specified: TableSpecifiedStyle = Object.freeze({
		"table-layout": "fixed",
	});
	const defaults = Object.freeze({ "border-spacing": "2px" });
	const result = computeTableStyle(
		specified,
		mutableParent,
		viewport,
		fonts,
		defaults,
	);
	expect(result).toMatchObject({
		"table-layout": "fixed",
		"border-spacing": "2px 2px",
	});
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(mutableParent)).toBe(false);
	expect(mutableParent).toEqual(initialTableStyle);
	expect(specified).toEqual({ "table-layout": "fixed" });
	expect(defaults).toEqual({ "border-spacing": "2px" });
	const copy = computeTableStyle({}, mutableParent, viewport);
	expect(copy).not.toBe(mutableParent);
	expect(copy).toEqual(mutableParent);
	expect(Object.isFrozen(copy)).toBe(true);
});

it.each(["1em", "1rem", "calc(1em + 2px)", "min(1rem, 2px)"])(
	"requires the actual font metrics for %s",
	(source) => {
		expect(() => computeSpacing(source)).toThrow("font metrics");
	},
);

it("does not fabricate missing font bases and accepts explicit zero bases", () => {
	expect(() => computeSpacing("1em", { rootFontSize: 20 })).toThrow(
		"font metrics",
	);
	expect(() => computeSpacing("1rem", { fontSize: 12 })).toThrow(
		"font metrics",
	);
	expect(computeSpacing("2em", { fontSize: 0 })).toBe("0px 0px");
	expect(computeSpacing("2rem", { rootFontSize: 0 })).toBe("0px 0px");
	expect(computeSpacing("2px")).toBe("2px 2px");
});

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
	"validates supplied font metrics %s even when spacing is inherited",
	(value) => {
		for (const metrics of [{ fontSize: value }, { rootFontSize: value }])
			expect(() => computeTableStyle({}, parent, viewport, metrics)).toThrow(
				"font metrics",
			);
	},
);

it.each(["1e308in", "calc(1e308px * 10)"])(
	"reports nonfinite computed spacing %s rather than returning it",
	(source) => {
		expect(() => computeSpacing(source)).toThrow("overflow");
	},
);

it("reports font and viewport multiplication overflow through the box helper", () => {
	expect(() => computeSpacing("1e308em", { fontSize: 100 })).toThrow(
		"overflow",
	);
	expect(() =>
		computeTableStyle({ "border-spacing": "1e308vw" }, initialTableStyle, {
			width: Number.MAX_VALUE,
			height: 600,
		}),
	).toThrow("overflow");
});

it("bounds source size before normalization and reuses math structural limits", () => {
	const maximum = cssMathLimits.maxSourceCodeUnits;
	expect(
		parseTableValue("border-spacing", `${" ".repeat(maximum - 3)}1px`),
	).toBe("1px");
	for (const name of cssTableProperties)
		expect(
			parseTableValue(name, `${" ".repeat(maximum)}initial`),
		).toBeUndefined();
	for (const source of [
		`${"9".repeat(maximum - 1)}x`,
		`${"calc(".repeat(cssMathLimits.maxDepth + 1)}1px${")".repeat(cssMathLimits.maxDepth + 1)}`,
		`min(${Array(cssMathLimits.maxArguments + 1)
			.fill("1px")
			.join(", ")})`,
		`calc(${Array(cssMathLimits.maxNodes + 1)
			.fill("1px")
			.join(" + ")})`,
		Array(100).fill("0").join(" "),
	])
		expect(parseTableValue("border-spacing", source)).toBeUndefined();
});
