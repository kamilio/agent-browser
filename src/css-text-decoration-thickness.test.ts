import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import {
	inlineDeclarationComponents,
	inlineProperties,
	parseInlineDeclarations,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import { cssMathLimits } from "./css-math.js";
import { cssSupportsDeclaration, parseCssDeclarations } from "./css-parser.js";
import { cssTextProperties } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	cssText: string;
	textDecoration: string;
	textDecorationThickness: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

const thickness = "text-decoration-thickness";
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
const documents: DocumentTree[] = [];
const querySets: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of querySets.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:32px}#target{font-size:20px}${css}</style><main id="parent"><span id="target">Decorated text</span></main>`,
		"https://fixture.invalid/text-decoration-thickness",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	querySets.push(queries);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(800, 600);
	const inlineStyles = new InlineStyles(tree, factory);
	const computedStyles = new ComputedStyles(tree, factory);
	return {
		tree,
		id,
		styles,
		inline: inlineStyles.get(id()) as Style,
		computed: computedStyles.get(id()) as Style,
		read: (selector = "#target") =>
			resolvedStyleValue(tree, id(selector), thickness),
		decoration: (selector = "#target") =>
			styles.textDecoration(id(selector)) as Readonly<Record<string, string>>,
	};
}

function declarations(source: string) {
	return parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 32, maxDeclarations: 256 },
		() => {},
	);
}

it.each([
	["auto", "auto", "auto"],
	["FROM-FONT", "from-font", "from-font"],
	["thin", "thin", "thin"],
	["medium", "medium", "medium"],
	["thick", "thick", "thick"],
	["0", "0px", "0px"],
	["-0", "0px", "0px"],
	["-2px", "-2px", "-2px"],
	[".25px", "0.25px", "0.25px"],
	["12.5%", "12.5%", "12.5%"],
	["-10%", "-10%", "-10%"],
	["2em", "2em", "40px"],
	["2rem", "2rem", "64px"],
	["2ex", "2ex", "25px"],
	["1in", "1in", "96px"],
	["6pt", "6pt", "8px"],
	["1pc", "1pc", "16px"],
	["2vw", "2vw", "16px"],
	["2vh", "2vh", "12px"],
	["1vmin", "1vmin", "6px"],
	["1vmax", "1vmax", "8px"],
	["calc(1em - 24px)", "calc(1em - 24px)", "-4px"],
	["min(1em, 4px)", "min(1em, 4px)", "4px"],
	["max(-1em, -4px)", "max(-1em, -4px)", "-4px"],
	["clamp(1px, 1em, 8px)", "clamp(1px, 1em, 8px)", "8px"],
	["calc(1em - 10%)", "calc(1em - 10%)", "calc(20px - 10%)"],
])(
	"parses and computes thickness %s without paint rounding",
	(value, specified, expected) => {
		expect(cssSupportsDeclaration(thickness, value)).toBe(true);
		expect(declarations(`${thickness}:${value}`)).toEqual([
			{ property: thickness, value: specified, important: false },
		]);
		const { inline, computed, read, decoration } = fixture(
			`#target{${thickness}:${value}}`,
		);
		expect(decoration()[thickness]).toBe(expected);
		expect(read()).toBe(expected);
		expect(computed.getPropertyValue(thickness)).toBe(expected);
		expect(computed.textDecorationThickness).toBe(expected);
		inline.setProperty(thickness, value);
		expect(inline.getPropertyValue(thickness)).toBe(specified);
		expect(inline.textDecorationThickness).toBe(specified);
		expect(read()).toBe(expected);
	},
);

it.each([
	"1",
	"normal",
	"none",
	"2px 3px",
	"1e309px",
	"1deg",
	"calc(1px / 0)",
	"calc(1px * 1px)",
])(
	"rejects invalid thickness %s without discarding a valid declaration",
	(value) => {
		expect(cssSupportsDeclaration(thickness, value)).toBe(false);
		expect(declarations(`${thickness}:${value}`)).toEqual([]);
		expect(declarations(`${thickness}:2px;${thickness}:${value}`)).toEqual([
			{ property: thickness, value: "2px", important: false },
		]);
		const { inline, computed } = fixture();
		inline.textDecorationThickness = "2px";
		inline.setProperty(thickness, value);
		expect(inline.textDecorationThickness).toBe("2px");
		expect(computed.textDecorationThickness).toBe("2px");
	},
);

it("accepts six-component shorthand with thickness in every position", () => {
	const components = [
		"line-through",
		"overline",
		"underline",
		"solid",
		"rgb(10 20 30 / 50%)",
	];
	for (let position = 0; position <= components.length; position++) {
		const ordered = [...components];
		ordered.splice(position, 0, "2px");
		const value = ordered.join(" ");
		expect(cssSupportsDeclaration("text-decoration", value)).toBe(true);
		const parsed = declarations(`text-decoration:${value}!important`);
		expect(parsed).toHaveLength(4);
		for (const [property, expected] of [
			["text-decoration-line", "underline overline line-through"],
			[thickness, "2px"],
			["text-decoration-style", "solid"],
			["text-decoration-color", "rgba(10, 20, 30, 0.502)"],
		])
			expect(parsed).toContainEqual({
				property,
				value: expected,
				important: true,
			});
		expect(
			propertyValue(
				parseInlineDeclarations(`text-decoration:${value}`, 10),
				"text-decoration",
			),
		).toBe("underline overline line-through 2px solid rgba(10, 20, 30, 0.502)");
	}
});

it("rejects duplicate thickness and unsupported shorthand components atomically", () => {
	const { inline, computed } = fixture();
	inline.textDecoration = "overline 3px red";
	for (const value of [
		"underline 2px 3px red",
		"underline auto from-font",
		"underline thin thick",
		"underline 2px solid solid red",
		"underline underline 2px",
		"none underline 2px",
		"underline 2px red blue",
		"underline 2px wavy",
		"underline 2px dotted",
		"underline 2px dashed",
		"underline 2px double",
		"inherit 2px",
	]) {
		expect(cssSupportsDeclaration("text-decoration", value)).toBe(false);
		expect(declarations(`text-decoration:${value}`)).toEqual([]);
		inline.textDecoration = value;
		expect(inline.textDecoration).toBe("overline 3px solid red");
		expect(computed.textDecorationThickness).toBe("3px");
	}
});

it.each(["initial", "inherit", "unset", "revert"])(
	"expands and computes CSS-wide %s through longhand, shorthand and all",
	(keyword) => {
		const { inline, read } = fixture(
			`#parent{font-size:10px;${thickness}:2em}`,
		);
		for (const property of [thickness, "text-decoration", "all"]) {
			expect(cssSupportsDeclaration(property, keyword)).toBe(true);
			expect(declarations(`${property}:${keyword}`)).toContainEqual({
				property: thickness,
				value: keyword,
				important: false,
			});
			inline.cssText = `${thickness}:9px;${property}:${keyword}`;
			expect(inline.getPropertyValue(thickness)).toBe(keyword);
			expect(read()).toBe(keyword === "inherit" ? "20px" : "auto");
			if (property === "text-decoration")
				expect(inline.textDecoration).toBe(keyword);
		}
	},
);

it("advertises thickness through public property registries and host aliases", () => {
	expect(inlineProperties).toContain(thickness);
	expect(computedStyleProperties).toContain(thickness);
	expect(inlineDeclarationComponents("text-decoration")).toContain(thickness);
	expect(cssTextProperties).not.toContain(thickness);
	const { inline, computed, styles, decoration } = fixture();
	expect(styles.metrics().textDecorationProperties).toContain(thickness);
	expect(Object.hasOwn(inline, "textDecorationThickness")).toBe(true);
	expect(Object.hasOwn(computed, "textDecorationThickness")).toBe(true);
	expect(inline.textDecorationThickness).toBe("");
	expect(computed.textDecorationThickness).toBe("auto");
	expect(decoration()[thickness]).toBe("auto");
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 0)");
});

it("does not inherit thickness implicitly even when the parent decorates text", () => {
	const { read, computed } = fixture(
		"#parent{text-decoration:underline 5px red}",
	);
	expect(read("#parent")).toBe("5px");
	expect(read()).toBe("auto");
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 0)");
});

it("inherits computed parent math without rebasing font units and refreshes after mutation", () => {
	const { tree, id, read, inline } = fixture(
		`#parent{font-size:10px;${thickness}:calc(2em + 1rem - 10%)}#target{${thickness}:inherit}`,
	);
	expect(read()).toBe("calc(20px + 32px - 10%)");
	expect(read()).toBe(read("#parent"));
	inline.setProperty("font-size", "40px");
	expect(read()).toBe("calc(20px + 32px - 10%)");
	tree.setAttribute(id("#parent"), "style", "font-size:15px");
	expect(read()).toBe("calc(30px + 32px - 10%)");
});

it("computes root inherit against the initial auto thickness", () => {
	const { read } = fixture(`html{${thickness}:inherit}`);
	expect(read("html")).toBe("auto");
});

it("resets omitted shorthand thickness to auto without changing legacy serialization", () => {
	const { inline, computed } = fixture();
	for (const value of ["underline", "none", "solid", "red"]) {
		inline.cssText = `${thickness}:7px;text-decoration:${value}`;
		expect(inline.textDecorationThickness).toBe("auto");
		expect(computed.textDecorationThickness).toBe("auto");
		expect(inline.textDecoration).not.toContain("auto");
		expect(computed.textDecoration).not.toContain("auto");
	}
	inline.textDecoration = "underline auto red";
	expect(inline.textDecoration).toBe("underline solid red");
	expect(computed.textDecoration).toBe("underline solid rgb(255, 0, 0)");
});

it("serializes non-auto thickness after the line and round-trips all four components", () => {
	const { inline, computed } = fixture();
	for (const value of ["from-font", "thin", "medium", "thick", "25%", "-2px"]) {
		inline.textDecoration = `red ${value} overline solid`;
		expect(inline.textDecoration).toBe(`overline ${value} solid red`);
		expect(computed.textDecoration).toBe(
			`overline ${value} solid rgb(255, 0, 0)`,
		);
		const entries = parseInlineDeclarations(inline.cssText, 10);
		const roundTrip = parseInlineDeclarations(
			serializeDeclarations(entries),
			10,
		);
		expect(propertyValue(roundTrip, "text-decoration")).toBe(
			`overline ${value} solid red`,
		);
		expect(propertyValue(roundTrip, thickness)).toBe(value);
	}
});

it("accepts thickness-only and balanced math shorthands while resetting other components", () => {
	const { inline, computed } = fixture();
	inline.textDecoration = "2px";
	expect(inline.textDecoration).toBe("none 2px solid currentcolor");
	expect(computed.textDecoration).toBe("none 2px solid rgb(0, 0, 0)");
	inline.textDecoration = "underline calc(1em - 10%) rgb(10 20 30)";
	expect(inline.textDecoration).toBe(
		"underline calc(1em - 10%) solid rgb(10, 20, 30)",
	);
	expect(computed.textDecoration).toBe(
		"underline calc(20px - 10%) solid rgb(10, 20, 30)",
	);
});

it("retains relative percentages in min, max and clamp computations", () => {
	const { inline, computed, decoration } = fixture();
	for (const [value, expected] of [
		["min(1em, 20%)", "min(20px, 20%)"],
		["max(-1em, -20%)", "max(-20px, -20%)"],
		["clamp(-1em, 10%, 1rem)", "clamp(-20px, 10%, 32px)"],
	]) {
		expect(cssSupportsDeclaration(thickness, value)).toBe(true);
		inline.textDecorationThickness = value;
		expect(inline.textDecorationThickness).toBe(value);
		expect(decoration()[thickness]).toBe(expected);
		expect(computed.textDecorationThickness).toBe(expected);
	}
});

it("updates shorthand serialization through named and generic longhand setters", () => {
	const { inline, computed } = fixture();
	inline.textDecoration = "underline red";
	inline.textDecorationThickness = "2em";
	expect(inline.textDecoration).toBe("underline 2em solid red");
	expect(computed.textDecoration).toBe("underline 40px solid rgb(255, 0, 0)");
	inline.setProperty(thickness, "0.25px");
	expect(inline.textDecoration).toBe("underline 0.25px solid red");
	expect(computed.textDecorationThickness).toBe("0.25px");
	inline.textDecorationThickness = "auto";
	expect(inline.textDecoration).toBe("underline solid red");
});

it("removes a longhand without removing the remaining decoration components", () => {
	const { inline, computed } = fixture(`#target{${thickness}:4px}`);
	inline.textDecoration = "underline 2px red";
	expect(inline.removeProperty(thickness)).toBe("2px");
	expect(inline.textDecorationThickness).toBe("");
	expect(inline.textDecoration).toBe("");
	expect(inline.getPropertyValue("text-decoration-line")).toBe("underline");
	expect(inline.getPropertyValue("text-decoration-color")).toBe("red");
	expect(computed.textDecoration).toBe("underline 4px solid rgb(255, 0, 0)");
	inline.textDecorationThickness = "3px";
	inline.textDecorationThickness = "";
	expect(inline.textDecorationThickness).toBe("");
	expect(computed.textDecorationThickness).toBe("4px");
});

it("removes thickness with the shorthand and restores stylesheet values", () => {
	const { inline, computed } = fixture(
		"#target{text-decoration:overline 4px blue}",
	);
	inline.setProperty("text-decoration", "underline 2px red", "important");
	expect(inline.removeProperty("text-decoration")).toBe(
		"underline 2px solid red",
	);
	for (const property of inlineDeclarationComponents("text-decoration")) {
		expect(inline.getPropertyValue(property)).toBe("");
		expect(inline.getPropertyPriority(property)).toBe("");
	}
	expect(computed.textDecoration).toBe("overline 4px solid rgb(0, 0, 255)");
});

it("preserves important thickness across an ordinary shorthand reset", () => {
	const { inline, computed } = fixture();
	inline.cssText = `${thickness}:5px!important;text-decoration:underline red`;
	expect(inline.getPropertyPriority(thickness)).toBe("important");
	expect(inline.textDecoration).toBe("");
	expect(computed.textDecoration).toBe("underline 5px solid rgb(255, 0, 0)");
	inline.setProperty("text-decoration", "overline 2px blue", "important");
	expect(inline.textDecoration).toBe("overline 2px solid blue");
	expect(inline.getPropertyPriority("text-decoration")).toBe("important");
	expect(inline.getPropertyPriority(thickness)).toBe("important");
	expect(computed.textDecorationThickness).toBe("2px");
});

it("keeps important stylesheet thickness ahead of ordinary inline declarations", () => {
	const { inline, computed } = fixture(`#target{${thickness}:6px!important}`);
	inline.textDecorationThickness = "2px";
	expect(computed.textDecorationThickness).toBe("6px");
	inline.textDecoration = "underline 3px red";
	expect(computed.textDecorationThickness).toBe("6px");
	inline.setProperty(thickness, "4px", "important");
	expect(computed.textDecorationThickness).toBe("4px");
});

it("resolves case-sensitive custom thickness at the use-site font size", () => {
	const { inline, computed } = fixture(
		`#parent{font-size:10px;--Thickness:2em}#target{${thickness}:var(--Thickness)}`,
	);
	expect(computed.textDecorationThickness).toBe("40px");
	inline.textDecorationThickness = "var(--Thickness)";
	expect(inline.textDecorationThickness).toBe("var(--Thickness)");
	inline.setProperty("--Thickness", "3em");
	expect(computed.textDecorationThickness).toBe("60px");
	inline.textDecorationThickness = "var(--thickness, 25%)";
	expect(computed.textDecorationThickness).toBe("25%");
});

it("substitutes complete shorthands and resets thickness when a variable omits it", () => {
	const { inline, computed } = fixture();
	inline.setProperty("--Decoration", "underline 2em red");
	inline.textDecoration = "var(--Decoration)";
	expect(inline.textDecoration).toBe("var(--Decoration)");
	expect(computed.textDecoration).toBe("underline 40px solid rgb(255, 0, 0)");
	inline.setProperty("--Decoration", "overline blue");
	expect(computed.textDecoration).toBe("overline solid rgb(0, 0, 255)");
	expect(computed.textDecorationThickness).toBe("auto");
	inline.textDecoration = "underline var(--Missing, 3px) red";
	expect(computed.textDecorationThickness).toBe("3px");
});

it("does not revive earlier thickness after invalid variable substitution", () => {
	const { inline, computed } = fixture(`#parent{${thickness}:8px}`);
	for (const value of ["var(--Missing)", "var(--Bad)"]) {
		inline.cssText = `--Bad:wavy;${thickness}:3px;${thickness}:${value}`;
		expect(computed.textDecorationThickness).toBe("auto");
		inline.cssText = `--Bad:underline 2px 3px;text-decoration:overline 4px red;text-decoration:${value}`;
		expect(computed.textDecorationThickness).toBe("auto");
		expect(computed.textDecoration).toBe("none solid rgb(0, 0, 0)");
	}
});

it("includes thickness in important all resets without overriding an important longhand", () => {
	const { inline, computed } = fixture();
	inline.cssText = `${thickness}:5px!important;all:initial`;
	expect(computed.textDecorationThickness).toBe("5px");
	inline.cssText = `${thickness}:5px;all:initial!important`;
	expect(computed.textDecorationThickness).toBe("auto");
	expect(inline.getPropertyPriority(thickness)).toBe("important");
});

it("rejects overlong and over-budget math without replacing valid inline thickness", () => {
	const { inline } = fixture();
	inline.textDecorationThickness = "2px";
	const depth = cssMathLimits.maxDepth + 1;
	for (const value of [
		`calc(1px${" ".repeat(cssMathLimits.maxSourceCodeUnits)} + 1px)`,
		`calc(${Array(cssMathLimits.maxNodes).fill("1px").join(" + ")})`,
		`min(${Array(cssMathLimits.maxArguments + 1)
			.fill("1px")
			.join(", ")})`,
	]) {
		expect(cssSupportsDeclaration(thickness, value)).toBe(false);
		expect(declarations(`${thickness}:${value}`)).toEqual([]);
		inline.textDecorationThickness = value;
		expect(inline.textDecorationThickness).toBe("2px");
	}
	const nested = `${"calc(".repeat(depth)}1px${")".repeat(depth)}`;
	const limit = expect.objectContaining({ code: "resource-limit" });
	expect(() => cssSupportsDeclaration(thickness, nested)).toThrow(limit);
	expect(() => declarations(`${thickness}:${nested}`)).toThrow(limit);
	expect(() => {
		inline.textDecorationThickness = nested;
	}).toThrow(limit);
	expect(inline.textDecorationThickness).toBe("2px");
});

it("rejects non-finite computed math instead of exposing Infinity", () => {
	const value = "calc(1e308px * 2)";
	expect(cssSupportsDeclaration(thickness, value)).toBe(true);
	const { read, decoration, computed } = fixture(
		`#target{${thickness}:${value}}`,
	);
	expect(() => decoration()).toThrow(/overflow|limit/i);
	expect(() => read()).toThrow(/overflow|limit/i);
	expect(() => computed.getPropertyValue(thickness)).toThrow(/overflow|limit/i);
});

it("refreshes immutable cached thickness when viewport and inline values change", () => {
	const { styles, decoration, inline, computed } = fixture(
		`#target{${thickness}:1vw}`,
	);
	const before = decoration();
	expect(Object.isFrozen(before)).toBe(true);
	expect(decoration()).toBe(before);
	expect(before[thickness]).toBe("8px");
	styles.setViewport(400, 300);
	expect(decoration()[thickness]).toBe("4px");
	expect(decoration()).not.toBe(before);
	expect(before[thickness]).toBe("8px");
	inline.textDecorationThickness = "25%";
	expect(computed.textDecorationThickness).toBe("25%");
	styles.setViewport(1000, 700);
	expect(computed.textDecorationThickness).toBe("25%");
});
