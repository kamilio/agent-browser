import { expect, it } from "vitest";
import { parseInlineDeclarations } from "./css-declarations.js";
import { cssSupportsCondition, parseCssDeclarations } from "./css-parser.js";
import {
	type TextStyle,
	computeTextStyle,
	cssTextProperties,
	initialTextStyle,
	parseTextValue,
} from "./css-text.js";
import { textFontExtent } from "./text-font.js";

const absoluteSizes = [
	["xx-small", 9.6],
	["x-small", 12],
	["small", 128 / 9],
	["medium", 16],
	["large", 19.2],
	["x-large", 24],
	["xx-large", 32],
	["xxx-large", 48],
] as const;
const viewport = { width: 200, height: 100 };

function parent(size: number): TextStyle {
	return Object.freeze({ ...initialTextStyle, "font-size": `${size}px` });
}

function compute(value: string, inherited = initialTextStyle) {
	const parsed = parseTextValue("font-size", value);
	if (parsed === undefined)
		throw new Error(`Unsupported fixture size ${value}`);
	return computeTextStyle({ "font-size": parsed }, inherited, viewport, 24);
}

function declarations(source: string) {
	const issues: string[] = [];
	const values = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 100 },
		(code) => issues.push(code),
	);
	return { values, issues };
}

it.each(absoluteSizes)(
	"maps %s to its declared native size of %s CSS pixels",
	(keyword, pixels) => {
		expect(parseTextValue("font-size", keyword)).toBe(`${pixels}px`);
		const inherited = parent(40);
		const computed = compute(keyword, inherited);
		expect(computed["font-size"]).toBe(`${pixels}px`);
		expect(inherited["font-size"]).toBe("40px");
		expect(Object.isFrozen(computed)).toBe(true);
		expect(cssSupportsCondition(`(font-size: ${keyword})`)).toBe(true);
	},
);

it.each([
	["larger", 0, 0],
	["smaller", 0, 0],
	["larger", 0.5, 0.6],
	["smaller", 0.5, 0.5 / 1.2],
	["larger", 16, 19.2],
	["smaller", 16, 16 / 1.2],
	["larger", 21.25, 25.5],
	["smaller", 21.25, 21.25 / 1.2],
] as const)(
	"resolves %s against a computed parent of %s px without table stepping or clamping",
	(keyword, size, expected) => {
		expect(parseTextValue("font-size", keyword)).toBe(keyword);
		const inherited = parent(size);
		const computed = compute(keyword, inherited);
		expect(Number.parseFloat(computed["font-size"])).toBeCloseTo(expected, 12);
		expect(computed["font-size"].endsWith("px")).toBe(true);
		expect(Object.isFrozen(computed)).toBe(true);
		expect(inherited["font-size"]).toBe(`${size}px`);
		if (size === 0) expect(computed).toBe(inherited);
	},
);

it("applies relative sizing once per declaration rather than again during inheritance", () => {
	const first = compute("larger");
	const second = compute("larger", first);
	expect(first["font-size"]).toBe("19.2px");
	expect(Number.parseFloat(second["font-size"])).toBeCloseTo(23.04, 12);
	expect(computeTextStyle({}, second, viewport, 16)).toBe(second);
	expect(compute("inherit", second)).toBe(second);
	expect(compute("unset", second)).toBe(second);
	expect(
		Number.parseFloat(compute("smaller", second)["font-size"]),
	).toBeCloseTo(19.2, 12);
	expect(first["font-size"]).toBe("19.2px");
});

it.each(["initial", "inherit", "unset", "revert"])(
	"preserves the CSS-wide %s keyword contract",
	(keyword) => {
		expect(parseTextValue("font-size", keyword)).toBe(keyword);
		const inherited = parent(24);
		const computed = compute(keyword, inherited);
		expect(computed["font-size"]).toBe(keyword === "initial" ? "16px" : "24px");
		expect(Object.isFrozen(computed)).toBe(true);
		if (keyword !== "initial") expect(computed).toBe(inherited);
	},
);

it("preserves identity for an unchanged canonical size and freezes new results", () => {
	const inherited = parent(24);
	expect(compute("x-large", inherited)).toBe(inherited);
	expect(computeTextStyle({}, inherited, viewport, 24)).toBe(inherited);
	expect(compute("medium")).toBe(initialTextStyle);
	const changed = compute("xx-large", inherited);
	expect(changed).not.toBe(inherited);
	expect(Object.isFrozen(changed)).toBe(true);
	expect(changed["font-size"]).toBe("32px");
	expect(inherited["font-size"]).toBe("24px");
});

it("canonicalizes keyword case through stylesheet and inline CSS input", () => {
	for (const [keyword, pixels] of absoluteSizes) {
		const source = `FoNt-SiZe: ${keyword.toUpperCase()}`;
		expect(declarations(source)).toEqual({
			values: [
				{ property: "font-size", value: `${pixels}px`, important: false },
			],
			issues: [],
		});
		expect(parseInlineDeclarations(source, 10)).toMatchObject([
			{ name: "font-size", value: `${pixels}px`, important: false },
		]);
	}
	for (const keyword of ["larger", "smaller"]) {
		const source = `FONT-SIZE: ${keyword.toUpperCase()} !IMPORTANT`;
		expect(declarations(source)).toEqual({
			values: [{ property: "font-size", value: keyword, important: true }],
			issues: [],
		});
		expect(parseInlineDeclarations(source, 10)).toMatchObject([
			{ name: "font-size", value: keyword, important: true },
		]);
	}
});

it("preserves every existing canonical size unit alongside the keyword table", () => {
	const values = [
		["12px", 12],
		["1.5em", 30],
		["2rem", 48],
		["150%", 30],
		["2.54cm", 96],
		["25.4mm", 96],
		["101.6q", 96],
		["1in", 96],
		["12pt", 16],
		["1pc", 16],
		["2vw", 4],
		["2vh", 2],
		["2vmin", 2],
		["2vmax", 4],
		["0", 0],
		["1e1px", 10],
	] as const;
	for (const [value, expected] of values) {
		expect(parseTextValue("font-size", value)).toBeDefined();
		expect(
			Number.parseFloat(compute(value, parent(20))["font-size"]),
		).toBeCloseTo(expected, 12);
	}
	expect(parseTextValue("font-size", "0")).toBe("0px");
	expect(parseTextValue("font-size", "1e1px")).toBe("10px");
});

it("does not mistake prototype property names for absolute-size table entries", () => {
	for (const value of [
		"constructor",
		"__proto__",
		"prototype",
		"toString",
		"hasOwnProperty",
		"valueOf",
	]) {
		expect(parseTextValue("font-size", value)).toBeUndefined();
		expect(declarations(`font-size:${value}`).issues).toEqual([
			"unimplemented-or-invalid-css-value",
		]);
	}
});

it("rejects malformed, quoted, unsupported and combined font-size keywords", () => {
	for (const value of [
		"",
		"normal",
		"xxx-small",
		"xxxx-large",
		"medium large",
		"large!important",
		'"large"',
		"math",
	]) {
		expect(parseTextValue("font-size", value)).toBeUndefined();
	}
});

it("retains invalid length and malformed math guards", () => {
	for (const value of [
		"-1px",
		"12",
		"1e999px",
		"NaNpx",
		"Infinitypx",
		"10ch",
		"calc(1px + 1)",
	]) {
		expect(parseTextValue("font-size", value)).toBeUndefined();
		expect(cssSupportsCondition(`(font-size:${value})`)).toBe(false);
	}
});

it("treats size keywords as ordinary family names but not other text values", () => {
	const keywords = [
		...absoluteSizes.map(([keyword]) => keyword),
		"larger",
		"smaller",
	];
	for (const property of cssTextProperties) {
		if (property === "font-size") continue;
		for (const keyword of keywords) {
			if (property === "font-family")
				expect(parseTextValue(property, keyword)).toBe(`"${keyword}"`);
			else expect(parseTextValue(property, keyword)).toBeUndefined();
		}
	}
});

it("keeps the native length bound when relative keywords expand a large computed size", () => {
	const inherited = parent(16_777_216);
	expect(() => compute("larger", inherited)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(
		Number.parseFloat(compute("smaller", inherited)["font-size"]),
	).toBeCloseTo(16_777_216 / 1.2, 6);
	expect(inherited["font-size"]).toBe("16777216px");
});

it("does not raise the bitmap font cap or clamp fractional relative sizes", () => {
	expect(textFontExtent(parent(512)).fontSize).toBe(512);
	const enlarged = compute("larger", parent(512));
	expect(enlarged["font-size"]).toBe("614.4px");
	expect(() => textFontExtent(enlarged)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(textFontExtent(compute("smaller", parent(512))).fontSize).toBeCloseTo(
		512 / 1.2,
		12,
	);
	expect(textFontExtent(compute("larger", parent(0.5))).fontSize).toBe(0.6);
	expect(textFontExtent(compute("smaller", parent(0)))).toMatchObject({
		fontSize: 0,
		advance: 0,
		ascent: 0,
	});
});
