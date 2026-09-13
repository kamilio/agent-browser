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
import { cssTextDecorationProperties } from "./css-text-decoration.js";
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
	textUnderlineOffset: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

const offset = "text-underline-offset";
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
		`<!doctype html><style>html{font-size:32px}#parent{font-size:10px}#target{font-size:20px}${css}</style><main id="parent"><span id="target">Decorated text</span></main>`,
		"https://fixture.invalid/text-underline-offset",
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
			resolvedStyleValue(tree, id(selector), offset),
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
	[" AUTO ", "auto", "auto"],
	["0", "0px", "0px"],
	["-0", "0px", "0px"],
	["+0", "0px", "0px"],
	["-2px", "-2px", "-2px"],
	[".25px", "0.25px", "0.25px"],
	["+2px", "2px", "2px"],
	["12.5%", "12.5%", "12.5%"],
	["-10%", "-10%", "-10%"],
	["2em", "2em", "40px"],
	["-2em", "-2em", "-40px"],
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
	["clamp(-8px, -1em, -1px)", "clamp(-8px, -1em, -1px)", "-8px"],
	["calc(1em - 10%)", "calc(1em - 10%)", "calc(20px - 10%)"],
	["min(1em, 20%)", "min(1em, 20%)", "min(20px, 20%)"],
	["max(-1em, -20%)", "max(-1em, -20%)", "max(-20px, -20%)"],
	[
		"clamp(-1em, 10%, 1rem)",
		"clamp(-1em, 10%, 1rem)",
		"clamp(-20px, 10%, 32px)",
	],
])(
	"parses and computes underline offset %s through public style APIs",
	(value, specified, expected) => {
		expect(cssSupportsDeclaration(offset, value)).toBe(true);
		expect(declarations(`${offset}:${value}`)).toEqual([
			{ property: offset, value: specified, important: false },
		]);
		const { inline, computed, read, decoration } = fixture(
			`#target{${offset}:${value}}`,
		);
		expect(decoration()[offset]).toBe(expected);
		expect(read()).toBe(expected);
		expect(computed.getPropertyValue(offset)).toBe(expected);
		expect(computed.textUnderlineOffset).toBe(expected);
		inline.setProperty(offset, value);
		expect(inline.getPropertyValue(offset)).toBe(specified);
		expect(inline.textUnderlineOffset).toBe(specified);
		expect(read()).toBe(expected);
		inline.textUnderlineOffset = value;
		expect(inline.textUnderlineOffset).toBe(specified);
		expect(computed.textUnderlineOffset).toBe(expected);
	},
);

it.each([
	"from-font",
	"thin",
	"medium",
	"thick",
	"normal",
	"none",
	"1",
	"-1",
	"2px 3px",
	"auto 2px",
	"1px, 2px",
	"1e309px",
	"-1e309%",
	"1deg",
	"calc(1px / 0)",
	"calc(1px * 1px)",
	"min()",
	"clamp(1px, 2px)",
])("rejects invalid offset %s without replacing valid values", (value) => {
	expect(cssSupportsDeclaration(offset, value)).toBe(false);
	expect(declarations(`${offset}:${value}`)).toEqual([]);
	expect(declarations(`${offset}:2px;${offset}:${value}`)).toEqual([
		{ property: offset, value: "2px", important: false },
	]);
	const { inline, computed } = fixture();
	inline.setProperty(offset, "2px", "important");
	inline.setProperty(offset, value);
	expect(inline.textUnderlineOffset).toBe("2px");
	expect(inline.getPropertyPriority(offset)).toBe("important");
	inline.textUnderlineOffset = value;
	expect(inline.textUnderlineOffset).toBe("2px");
	expect(inline.getPropertyPriority(offset)).toBe("important");
	expect(computed.textUnderlineOffset).toBe("2px");
});

it("advertises offset without extending the four-component decoration shorthand", () => {
	expect(inlineProperties).toContain(offset);
	expect(computedStyleProperties).toContain(offset);
	expect(inlineDeclarationComponents("all")).toContain(offset);
	expect(cssTextDecorationProperties).toEqual([
		"text-decoration-line",
		"text-decoration-thickness",
		"text-decoration-style",
		"text-decoration-color",
	]);
	expect(inlineDeclarationComponents("text-decoration")).toEqual(
		cssTextDecorationProperties,
	);
	expect(inlineDeclarationComponents("text-decoration")).not.toContain(offset);
	const { inline, computed, decoration } = fixture();
	expect(Object.hasOwn(inline, "textUnderlineOffset")).toBe(true);
	expect(Object.hasOwn(computed, "textUnderlineOffset")).toBe(true);
	expect(inline.textUnderlineOffset).toBe("");
	expect(computed.textUnderlineOffset).toBe("auto");
	expect(decoration()[offset]).toBe("auto");
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 0)");
});

it.each(["initial", "inherit", "unset", "revert"])(
	"resolves inherited CSS-wide %s through the longhand and all",
	(keyword) => {
		const { inline, computed, read } = fixture(`#parent{${offset}:2em}`);
		for (const property of [offset, "all"]) {
			expect(cssSupportsDeclaration(property, keyword)).toBe(true);
			expect(declarations(`${property}:${keyword}`)).toContainEqual({
				property: offset,
				value: keyword,
				important: false,
			});
			inline.cssText = `${offset}:9px;${property}:${keyword}`;
			expect(inline.getPropertyValue(offset)).toBe(keyword);
			expect(inline.textUnderlineOffset).toBe(keyword);
			expect(read()).toBe(keyword === "initial" ? "auto" : "20px");
			expect(computed.textUnderlineOffset).toBe(read());
		}
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"computes root CSS-wide %s against initial auto",
	(keyword) => {
		const { read } = fixture(`html{${offset}:${keyword}}`);
		expect(read("html")).toBe("auto");
		expect(read("#parent")).toBe("auto");
		expect(read()).toBe("auto");
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"keeps offset independent of text-decoration:%s",
	(keyword) => {
		const parsed = declarations(`text-decoration:${keyword}`);
		expect(parsed).toHaveLength(4);
		expect(parsed.map((entry) => entry.property)).not.toContain(offset);
		const { inline, computed } = fixture(`#parent{${offset}:2em}`);
		inline.textDecoration = keyword;
		expect(inline.textUnderlineOffset).toBe("");
		expect(computed.textUnderlineOffset).toBe("20px");
		for (const priority of ["", "important"]) {
			inline.cssText = `${offset}:7px;text-decoration:${keyword}${priority ? "!important" : ""}`;
			expect(inline.textDecoration).toBe(keyword);
			expect(inline.textUnderlineOffset).toBe("7px");
			expect(inline.getPropertyPriority(offset)).toBe("");
			expect(computed.textUnderlineOffset).toBe("7px");
		}
	},
);

it.each([
	["2em", "20px"],
	["2ex", "12.5px"],
	["2rem", "64px"],
	["25%", "25%"],
	["-10%", "-10%"],
	["calc(2em + 1rem - 10%)", "calc(20px + 32px - 10%)"],
])(
	"inherits parent offset %s without rebasing computed lengths",
	(value, expected) => {
		const { inline, computed, read } = fixture(`#parent{${offset}:${value}}`);
		expect(read("#parent")).toBe(expected);
		expect(read()).toBe(expected);
		expect(inline.textUnderlineOffset).toBe("");
		expect(computed.textDecoration).toBe("none solid rgb(0, 0, 0)");
		inline.setProperty("font-size", "40px");
		expect(computed.textUnderlineOffset).toBe(expected);
		inline.textUnderlineOffset = "inherit";
		expect(computed.textUnderlineOffset).toBe(expected);
	},
);

it("inherits offset without inheriting a parent's decoration components", () => {
	const { computed, read } = fixture(
		`#parent{text-decoration:underline 5px red;${offset}:7px}`,
	);
	expect(read()).toBe("7px");
	expect(computed.textDecorationThickness).toBe("auto");
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 0)");
});

it("refreshes inherited font-relative math when the originating font changes", () => {
	const { tree, id, inline, computed, read } = fixture(
		`#parent{${offset}:calc(2em + 1rem - 10%)}`,
	);
	expect(computed.textUnderlineOffset).toBe("calc(20px + 32px - 10%)");
	inline.setProperty("font-size", "40px");
	expect(read()).toBe("calc(20px + 32px - 10%)");
	tree.setAttribute(id("#parent"), "style", "font-size:15px");
	expect(read()).toBe("calc(30px + 32px - 10%)");
	tree.setAttribute(id("html"), "style", "font-size:40px");
	expect(computed.textUnderlineOffset).toBe("calc(30px + 40px - 10%)");
	expect(read()).toBe(read("#parent"));
});

it("resolves case-sensitive variables at the use-site rather than their declaration", () => {
	const { inline, computed, read } = fixture(
		`#parent{--Offset:2em;${offset}:var(--Offset)}#target{${offset}:var(--Offset)}`,
	);
	expect(read("#parent")).toBe("20px");
	expect(computed.textUnderlineOffset).toBe("40px");
	inline.textUnderlineOffset = "var(--Offset)";
	expect(inline.textUnderlineOffset).toBe("var(--Offset)");
	inline.setProperty("--Offset", "3em");
	expect(computed.textUnderlineOffset).toBe("60px");
	inline.textUnderlineOffset = "var(--offset, -25%)";
	expect(computed.textUnderlineOffset).toBe("-25%");
});

it("uses inherited fallback rather than reviving declarations after invalid substitution", () => {
	const { inline, computed } = fixture(`#parent{${offset}:8px}`);
	for (const value of ["var(--Missing)", "var(--Bad)", "var(--Cycle)"]) {
		inline.cssText = `--Bad:from-font;--Cycle:var(--Cycle);${offset}:3px;${offset}:${value}`;
		expect(inline.textUnderlineOffset).toBe(value);
		expect(computed.textUnderlineOffset).toBe("8px");
	}
	inline.textUnderlineOffset = "var(--Missing, calc(1em - 4px))";
	expect(computed.textUnderlineOffset).toBe("16px");
});

it("applies CSS-wide values produced by custom property fallback", () => {
	const { inline, computed } = fixture(`#parent{${offset}:8px}`);
	for (const keyword of ["initial", "inherit", "unset", "revert"]) {
		inline.textUnderlineOffset = `var(--Missing, ${keyword})`;
		expect(computed.textUnderlineOffset).toBe(
			keyword === "initial" ? "auto" : "8px",
		);
	}
});

it("does not reset offset when shorthand variables change or become invalid", () => {
	const { inline, computed } = fixture();
	inline.textUnderlineOffset = "7px";
	inline.textDecoration = "var(--Decoration)";
	for (const [value, expected] of [
		["underline 2em red", "underline 40px solid rgb(255, 0, 0)"],
		["overline blue", "overline solid rgb(0, 0, 255)"],
		["underline 2px 3px", "none solid rgb(0, 0, 0)"],
	]) {
		inline.setProperty("--Decoration", value);
		expect(computed.textDecoration).toBe(expected);
		expect(inline.textUnderlineOffset).toBe("7px");
		expect(computed.textUnderlineOffset).toBe("7px");
	}
});

it("keeps offset independent when ordinary shorthand values reset their components", () => {
	const { inline, computed } = fixture();
	for (const value of ["underline", "none", "solid", "red", "2px", "auto"]) {
		inline.cssText = `${offset}:7px;text-decoration:${value}`;
		expect(inline.textUnderlineOffset).toBe("7px");
		expect(computed.textUnderlineOffset).toBe("7px");
		expect(inline.textDecoration).not.toContain("7px");
		expect(computed.textDecoration).not.toContain("7px");
	}
});

it("serializes offset separately and round-trips without changing shorthand values", () => {
	const { inline, computed } = fixture();
	inline.textDecoration = "underline 2px red";
	inline.setProperty(offset, "3em", "important");
	expect(inline.textDecoration).toBe("underline 2px solid red");
	expect(inline.getPropertyPriority("text-decoration")).toBe("");
	expect(computed.textDecoration).toBe("underline 2px solid rgb(255, 0, 0)");
	const entries = parseInlineDeclarations(inline.cssText, 10);
	const serialized = serializeDeclarations(entries);
	expect(serialized).toContain(`${offset}: 3em !important;`);
	const roundTrip = parseInlineDeclarations(serialized, 10);
	expect(propertyValue(roundTrip, offset)).toBe("3em");
	expect(propertyValue(roundTrip, "text-decoration")).toBe(
		"underline 2px solid red",
	);
	inline.cssText = serialized;
	expect(inline.getPropertyPriority(offset)).toBe("important");
	expect(computed.textUnderlineOffset).toBe("60px");
});

it("removes shorthand components while retaining offset and its priority", () => {
	const { inline, computed } = fixture(
		"#target{text-decoration:overline 4px blue}",
	);
	inline.setProperty(offset, "7px", "important");
	inline.setProperty("text-decoration", "underline 2px red", "important");
	expect(inline.removeProperty("text-decoration")).toBe(
		"underline 2px solid red",
	);
	for (const property of cssTextDecorationProperties) {
		expect(inline.getPropertyValue(property)).toBe("");
		expect(inline.getPropertyPriority(property)).toBe("");
	}
	expect(inline.textUnderlineOffset).toBe("7px");
	expect(inline.getPropertyPriority(offset)).toBe("important");
	expect(computed.textUnderlineOffset).toBe("7px");
	expect(computed.textDecoration).toBe("overline 4px solid rgb(0, 0, 255)");
});

it("removes offset independently and restores inherited values", () => {
	const { inline, computed } = fixture(`#parent{${offset}:8px}`);
	inline.textDecoration = "underline 2px red";
	inline.setProperty(offset, "3px", "important");
	expect(inline.removeProperty(offset)).toBe("3px");
	expect(inline.getPropertyPriority(offset)).toBe("");
	expect(inline.textUnderlineOffset).toBe("");
	expect(computed.textUnderlineOffset).toBe("8px");
	expect(inline.textDecoration).toBe("underline 2px solid red");
	expect(inline.removeProperty(offset)).toBe("");
	inline.textUnderlineOffset = "4px";
	inline.textUnderlineOffset = "";
	expect(computed.textUnderlineOffset).toBe("8px");
	inline.textUnderlineOffset = "5px";
	inline.setProperty(offset, "");
	expect(computed.textUnderlineOffset).toBe("8px");
	expect(computed.textDecoration).toBe("underline 2px solid rgb(255, 0, 0)");
});

it("clears a named shorthand without clearing a separately specified offset", () => {
	const { inline, computed } = fixture();
	inline.textUnderlineOffset = "-3px";
	inline.textDecoration = "underline 2px red";
	inline.textDecoration = "";
	expect(inline.textDecoration).toBe("");
	expect(inline.textUnderlineOffset).toBe("-3px");
	expect(computed.textUnderlineOffset).toBe("-3px");
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 0)");
});

it("honors stylesheet and inline priority without interference from shorthand", () => {
	const { inline, computed } = fixture(`#target{${offset}:6px!important}`);
	inline.textUnderlineOffset = "2px";
	expect(computed.textUnderlineOffset).toBe("6px");
	inline.setProperty("text-decoration", "underline 3px red", "important");
	expect(computed.textUnderlineOffset).toBe("6px");
	inline.setProperty(offset, "4px", "important");
	expect(computed.textUnderlineOffset).toBe("4px");
	inline.setProperty(offset, "9px", "invalid");
	expect(inline.textUnderlineOffset).toBe("4px");
	expect(inline.getPropertyPriority(offset)).toBe("important");
	inline.textUnderlineOffset = "5px";
	expect(inline.getPropertyPriority(offset)).toBe("");
	expect(computed.textUnderlineOffset).toBe("6px");
});

it("includes offset in important all resets and preserves important overrides", () => {
	const { inline, computed } = fixture(`#parent{${offset}:8px}`);
	inline.cssText = `${offset}:5px!important;all:initial`;
	expect(computed.textUnderlineOffset).toBe("5px");
	inline.cssText = `${offset}:5px;all:initial!important`;
	expect(computed.textUnderlineOffset).toBe("auto");
	expect(inline.getPropertyPriority(offset)).toBe("important");
	inline.cssText = `${offset}:5px;all:unset!important`;
	expect(computed.textUnderlineOffset).toBe("8px");
	inline.cssText = `all:initial;${offset}:-2px`;
	expect(computed.textUnderlineOffset).toBe("-2px");
});

it("refreshes immutable cached offsets after viewport and inline mutations", () => {
	const { styles, decoration, inline, computed } = fixture(
		`#target{${offset}:1vw}`,
	);
	const before = decoration();
	expect(Object.isFrozen(before)).toBe(true);
	expect(decoration()).toBe(before);
	expect(before[offset]).toBe("8px");
	styles.setViewport(400, 300);
	expect(decoration()[offset]).toBe("4px");
	expect(decoration()).not.toBe(before);
	expect(before[offset]).toBe("8px");
	inline.textUnderlineOffset = "25%";
	expect(computed.textUnderlineOffset).toBe("25%");
	styles.setViewport(1000, 700);
	expect(computed.textUnderlineOffset).toBe("25%");
});

it("refreshes inherited cached offsets after ancestor and selector mutations", () => {
	const { tree, id, computed, decoration } = fixture(
		`#parent{${offset}:3px}#target.selected{${offset}:-2px}`,
	);
	const before = decoration();
	expect(computed.textUnderlineOffset).toBe("3px");
	tree.setAttribute(id("#parent"), "style", `${offset}:7px`);
	expect(computed.textUnderlineOffset).toBe("7px");
	expect(before[offset]).toBe("3px");
	tree.setAttribute(id(), "class", "selected");
	expect(computed.textUnderlineOffset).toBe("-2px");
	tree.setAttribute(id(), "class", "");
	expect(computed.textUnderlineOffset).toBe("7px");
});

it("rejects overlong and over-budget math without replacing valid offset", () => {
	const { inline } = fixture();
	inline.textUnderlineOffset = "2px";
	for (const value of [
		`calc(1px${" ".repeat(cssMathLimits.maxSourceCodeUnits)} + 1px)`,
		`calc(${Array(cssMathLimits.maxNodes).fill("1px").join(" + ")})`,
		`min(${Array(cssMathLimits.maxArguments + 1)
			.fill("1px")
			.join(", ")})`,
	]) {
		expect(cssSupportsDeclaration(offset, value)).toBe(false);
		expect(declarations(`${offset}:${value}`)).toEqual([]);
		inline.textUnderlineOffset = value;
		expect(inline.textUnderlineOffset).toBe("2px");
	}
});

it("preserves resource-limit errors for excessive math nesting", () => {
	const { inline } = fixture();
	inline.setProperty(offset, "2px", "important");
	const depth = cssMathLimits.maxDepth + 1;
	const nested = `${"calc(".repeat(depth)}1px${")".repeat(depth)}`;
	const limit = expect.objectContaining({ code: "resource-limit" });
	expect(() => cssSupportsDeclaration(offset, nested)).toThrow(limit);
	expect(() => declarations(`${offset}:${nested}`)).toThrow(limit);
	expect(() => inline.setProperty(offset, nested)).toThrow(limit);
	expect(() => {
		inline.textUnderlineOffset = nested;
	}).toThrow(limit);
	expect(inline.textUnderlineOffset).toBe("2px");
	expect(inline.getPropertyPriority(offset)).toBe("important");
});

it("throws resource-limit for finite-input computed overflow instead of exposing Infinity", () => {
	const value = "calc(1e308px * 2)";
	expect(cssSupportsDeclaration(offset, value)).toBe(true);
	const { read, decoration, computed } = fixture(`#target{${offset}:${value}}`);
	const limit = expect.objectContaining({ code: "resource-limit" });
	expect(() => decoration()).toThrow(limit);
	expect(() => read()).toThrow(limit);
	expect(() => computed.getPropertyValue(offset)).toThrow(limit);
	expect(() => computed.textUnderlineOffset).toThrow(limit);
});
