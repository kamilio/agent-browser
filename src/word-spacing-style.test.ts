import { afterEach, expect, it } from "vitest";
import { ComputedStyles, computedStyleProperties } from "./computed-styles.js";
import {
	inlineProperties,
	parseInlineDeclarations,
} from "./css-declarations.js";
import { cssSupportsDeclaration, parseCssDeclarations } from "./css-parser.js";
import {
	computeTextStyle,
	cssTextProperties,
	initialTextStyle,
	isCssTextProperty,
	parseTextValue,
} from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	cssText: string;
	font: string;
	fontSize: string;
	letterSpacing: string;
	wordSpacing: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value });
		return target;
	},
};
const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const viewport = { width: 160, height: 96 };

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><main id="parent"><span id="target">A B</span></main>`,
		"https://fixture.invalid/word-spacing-style",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	return {
		tree,
		id,
		styles,
		text: (selector = "#target") => styles.text(id(selector)),
		inline: new InlineStyles(tree, factory).get(id()) as Style,
		computed: new ComputedStyles(tree, factory).get(id()) as Style,
	};
}

function declarations(source: string) {
	const issues: string[] = [];
	const parsed = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 32, maxDeclarations: 256 },
		(issue) => issues.push(issue),
	);
	return { parsed, issues };
}

it.each([
	["normal", "normal"],
	["0", "0px"],
	["-0", "0px"],
	["+0", "0px"],
	["-0px", "0px"],
	["+2.50px", "2.5px"],
	["-2.50px", "-2.5px"],
	[".5em", "0.5em"],
	["-.5em", "-0.5em"],
	["1e-1rem", "0.1rem"],
	["-1e-1rem", "-0.1rem"],
	["initial", "initial"],
	["inherit", "inherit"],
	["unset", "unset"],
	["revert", "revert"],
])("parses bounded word spacing %s", (value, expected) => {
	expect(parseTextValue("word-spacing", value)).toBe(expected);
	expect(cssSupportsDeclaration("word-spacing", value)).toBe(true);
	expect(declarations(`word-spacing:${value}`)).toEqual({
		parsed: [{ property: "word-spacing", value: expected, important: false }],
		issues: [],
	});
	expect(parseInlineDeclarations(`word-spacing:${value}`, 10)).toEqual([
		{ name: "word-spacing", value: expected, important: false },
	]);
});

it.each([
	"1",
	"-1",
	"2%",
	"0%",
	"1ex",
	"1ch",
	"1vw",
	"1vh",
	"1vmin",
	"1vmax",
	"1cm",
	"1mm",
	"1q",
	"1in",
	"1pt",
	"1pc",
	"calc(1px + 2px)",
	"min(1px, 2px)",
	"max(1px, 2px)",
	"clamp(0px, 1px, 2px)",
	"1e999px",
	"-1e999em",
	"1e999rem",
	"NaNpx",
	"Infinitypx",
	"-Infinity",
	"normal 1px",
	"1px 2px",
	"revert-layer",
])("rejects invalid or unsupported word spacing %s", (value) => {
	expect(parseTextValue("word-spacing", value)).toBeUndefined();
	expect(cssSupportsDeclaration("word-spacing", value)).toBe(false);
	const result = declarations(`word-spacing:-2px;word-spacing:${value}`);
	expect(result.parsed).toEqual([
		{ property: "word-spacing", value: "-2px", important: false },
	]);
	expect(result.issues.length).toBeGreaterThan(0);
});

it("registers immutable inherited word spacing with a zero initial value", () => {
	const { tree, id, styles, text, computed } = fixture();
	for (const properties of [
		cssTextProperties,
		inlineProperties,
		computedStyleProperties,
	])
		expect(
			properties.filter((property) => property === "word-spacing"),
		).toHaveLength(1);
	expect(isCssTextProperty("word-spacing")).toBe(true);
	expect(initialTextStyle["word-spacing"]).toBe("0px");
	expect(text()).toBe(initialTextStyle);
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(Object.isFrozen(text())).toBe(true);
	expect(computed.wordSpacing).toBe("0px");
});

it.each([
	["-.5em", "-16px"],
	["-.5rem", "-16px"],
	[".5em", "16px"],
	[".5rem", "16px"],
])("resolves root %s against its computed font size", (value, expected) => {
	const root = computeTextStyle(
		{ "font-size": "2rem", "word-spacing": value },
		initialTextStyle,
		viewport,
		16,
		false,
		true,
	);
	expect(root["font-size"]).toBe("32px");
	expect(root["word-spacing"]).toBe(expected);
	const child = computeTextStyle({ "font-size": "8px" }, root, viewport, 32);
	expect(child["word-spacing"]).toBe(expected);
	expect(computeTextStyle({}, child, viewport, 32)).toBe(child);
	expect(
		computeTextStyle({ "word-spacing": "-.5em" }, child, viewport, 32)[
			"word-spacing"
		],
	).toBe("-4px");
	expect(
		computeTextStyle({ "word-spacing": "-.5rem" }, child, viewport, 32)[
			"word-spacing"
		],
	).toBe("-16px");
});

it.each([
	["inherit", "-8px"],
	["unset", "-8px"],
	["revert", "-8px"],
	["initial", "0px"],
	["normal", "0px"],
])("computes inherited word spacing %s", (value, expected) => {
	const { tree, id, styles, text, computed } = fixture(
		`#parent{font-size:16px;word-spacing:-.5em}#target{font-size:40px;word-spacing:3px;word-spacing:${value}}`,
	);
	expect(text()["word-spacing"]).toBe(expected);
	expect(computed.wordSpacing).toBe(expected);
	expect(styles.text(tree.get(id()).children[0])["word-spacing"]).toBe(
		expected,
	);
});

it.each(["initial", "inherit", "unset", "revert"])(
	"includes word spacing in all:%s",
	(keyword) => {
		const { inline, computed } = fixture("#parent{word-spacing:-3px}");
		inline.cssText = `word-spacing:4px;all:${keyword}`;
		expect(computed.wordSpacing).toBe(keyword === "initial" ? "0px" : "-3px");
	},
);

it.each(["normal", "0", "-0", "0px", "-0em", "0rem", "initial"])(
	"keeps computed zero word spacing %s as pixels, unlike letter spacing",
	(value) => {
		const { inline, computed, text } = fixture("#parent{word-spacing:4px}");
		inline.cssText = `word-spacing:${value};letter-spacing:0`;
		expect(text()["word-spacing"]).toBe("0px");
		expect(computed.wordSpacing).toBe("0px");
		expect(computed.getPropertyValue("word-spacing")).toBe("0px");
		expect(computed.letterSpacing).toBe("normal");
	},
);

it("updates signed inline CSSOM and preserves declarations on invalid writes", () => {
	const { inline, computed } = fixture(
		"#parent{word-spacing:3px}#target{font-size:20px}",
	);
	inline.wordSpacing = "-0.5em";
	expect(inline.wordSpacing).toBe("-0.5em");
	expect(inline.getPropertyValue("word-spacing")).toBe("-0.5em");
	expect(computed.wordSpacing).toBe("-10px");
	inline.fontSize = "12px";
	expect(computed.wordSpacing).toBe("-6px");
	for (const value of ["-1", "5%", "calc(1px + 2px)", "1e999px"])
		inline.wordSpacing = value;
	expect(inline.wordSpacing).toBe("-0.5em");
	expect(computed.wordSpacing).toBe("-6px");
	inline.setProperty("word-spacing", "-2px", "important");
	expect(inline.getPropertyPriority("word-spacing")).toBe("important");
	expect(computed.wordSpacing).toBe("-2px");
	expect(inline.cssText).toContain("word-spacing: -2px !important;");
	expect(inline.removeProperty("word-spacing")).toBe("-2px");
	expect(inline.wordSpacing).toBe("");
	expect(computed.wordSpacing).toBe("3px");
});

it("resolves inherited custom properties and invalidates root-relative pixels", () => {
	const { tree, id, inline, computed, text } = fixture(
		"html{font-size:20px}#parent{--Spacing:-.5rem;word-spacing:var(--Spacing)}#target{font-size:8px}",
	);
	expect(text("#parent")["word-spacing"]).toBe("-10px");
	expect(computed.wordSpacing).toBe("-10px");
	tree.setAttribute(id("html"), "style", "font-size:32px");
	expect(computed.wordSpacing).toBe("-16px");
	inline.wordSpacing = "var(--Spacing)";
	expect(inline.wordSpacing).toBe("var(--Spacing)");
	expect(computed.wordSpacing).toBe("-16px");
	inline.setProperty("--Spacing", "-.5em");
	expect(computed.wordSpacing).toBe("-4px");
	inline.wordSpacing = "var(--spacing, -2px)";
	expect(computed.wordSpacing).toBe("-2px");
	inline.wordSpacing = "var(--missing, normal)";
	expect(computed.wordSpacing).toBe("0px");
});

it.each(["var(--missing)", "var(--bad)", "var(--cycle)"])(
	"inherits rather than reviving an earlier value after invalid substitution %s",
	(value) => {
		const { inline, computed } = fixture("#parent{word-spacing:-3px}");
		inline.cssText = `--bad:10%;--cycle:var(--cycle);word-spacing:7px;word-spacing:${value}`;
		expect(inline.wordSpacing).toBe(value);
		expect(computed.wordSpacing).toBe("-3px");
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"resolves variable CSS-wide fallback %s without resetting spacing via font",
	(keyword) => {
		const { inline, computed } = fixture("#parent{word-spacing:-3px}");
		inline.wordSpacing = `var(--missing, ${keyword})`;
		expect(computed.wordSpacing).toBe(keyword === "initial" ? "0px" : "-3px");
		inline.setProperty("word-spacing", "-2px", "important");
		inline.font = keyword;
		expect(inline.wordSpacing).toBe("-2px");
		expect(inline.getPropertyPriority("word-spacing")).toBe("important");
		expect(computed.wordSpacing).toBe("-2px");
		inline.cssText = `word-spacing:-4px;font:${keyword}`;
		expect(computed.wordSpacing).toBe("-4px");
	},
);

it("preserves nonnegative letter spacing, font size and line height validation", () => {
	for (const property of [
		"letter-spacing",
		"font-size",
		"line-height",
	] as const) {
		expect(parseTextValue(property, "-1px")).toBeUndefined();
		expect(() =>
			computeTextStyle({ [property]: "-1px" }, initialTextStyle, viewport, 16),
		).toThrow();
	}
	expect(
		computeTextStyle(
			{ "word-spacing": "-1px" },
			initialTextStyle,
			viewport,
			16,
		)["word-spacing"],
	).toBe("-1px");
	for (const value of ["1e309px", "-1e309px", "16777217px", "-16777217px"])
		expect(() =>
			computeTextStyle(
				{ "word-spacing": value },
				initialTextStyle,
				viewport,
				16,
			),
		).toThrow();
});
