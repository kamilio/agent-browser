import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
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
	fontStyle: string;
	length: number;
	item(index: number): string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		if (definition.indexed)
			Object.defineProperty(target, "length", {
				get: definition.indexed.length,
			});
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

function fixture(
	css = "",
	markup = '<main id="parent"><span id="target">Ax</span></main>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style>${markup}`,
		"https://fixture.invalid/font-style",
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
	const inlineStyles = new InlineStyles(tree, factory);
	const computedStyles = new ComputedStyles(tree, factory);
	return {
		tree,
		id,
		styles,
		text: (selector = "#target") => styles.text(id(selector)),
		inline: inlineStyles.get(id()) as Style,
		computed: computedStyles.get(id()) as Style,
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
	["italic", "italic"],
	["oblique", "oblique"],
	["ITALIC", "italic"],
	["  ObLiQuE\t", "oblique"],
])(
	"normalizes bounded font-style keywords through both routes: %s",
	(value, expected) => {
		expect(parseTextValue("font-style", value)).toBe(expected);
		expect(declarations(`font-style:${value}`)).toEqual({
			parsed: [{ property: "font-style", value: expected, important: false }],
			issues: [],
		});
		expect(parseInlineDeclarations(`font-style:${value}`, 10)).toEqual([
			{ name: "font-style", value: expected, important: false },
		]);
		expect(cssSupportsDeclaration("font-style", value)).toBe(true);
	},
);

it("bounds direct font-style parsing before trimming whitespace", () => {
	expect(parseTextValue("font-style", `${" ".repeat(4090)}italic`)).toBe(
		"italic",
	);
	expect(
		parseTextValue("font-style", `${" ".repeat(4091)}italic`),
	).toBeUndefined();
	expect(parseTextValue("font-style", "")).toBeUndefined();
	expect(parseTextValue("font-style", " \t\n")).toBeUndefined();
});

it("shares immutable initial style without introducing UA italic defaults", () => {
	const { tree, id, text, styles } = fixture(
		"",
		'<main id="parent"><i>i</i><em>em</em><cite>cite</cite><dfn>dfn</dfn><var>var</var><address>address</address><span id="target">Ax</span></main>',
	);
	expect(initialTextStyle["font-style"]).toBe("normal");
	expect(text()).toBe(initialTextStyle);
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(Object.isFrozen(text())).toBe(true);
	for (const selector of ["i", "em", "cite", "dfn", "var", "address"])
		expect(text(selector)["font-style"]).toBe("normal");
	expect(styles.metrics().issues).toEqual({});
});

it.each(["italic", "oblique"])(
	"inherits %s through elements and text nodes",
	(value) => {
		const { tree, id, text, styles } = fixture(`#parent{font-style:${value}}`);
		expect(text()["font-style"]).toBe(value);
		expect(text()).toBe(text("#parent"));
		expect(styles.text(tree.get(id()).children[0])).toBe(text());
		expect(resolvedStyleValue(tree, id(), "font-style")).toBe(value);
	},
);

it.each([
	["initial", "normal"],
	["inherit", "oblique"],
	["unset", "oblique"],
	["revert", "oblique"],
])("computes CSS-wide %s with inherited font style", (keyword, expected) => {
	const { text, computed, styles } = fixture(
		`#parent{font-style:oblique}#target{font-style:italic;font-style:${keyword}}`,
	);
	expect(parseTextValue("font-style", keyword)).toBe(keyword);
	expect(text()["font-style"]).toBe(expected);
	expect(computed.fontStyle).toBe(expected);
	expect(styles.metrics().issues).toEqual({});
});

it.each(["initial", "inherit", "unset", "revert"])(
	"includes font-style in all:%s expansion",
	(keyword) => {
		const { inline, computed, text } = fixture("#parent{font-style:oblique}");
		inline.cssText = `font-style:italic;all:${keyword}`;
		expect(computed.fontStyle).toBe(
			keyword === "initial" ? "normal" : "oblique",
		);
		expect(text()["font-style"]).toBe(computed.fontStyle);
		expect(declarations(`all:${keyword}`).parsed).toContainEqual({
			property: "font-style",
			value: keyword,
			important: false,
		});
	},
);

it("keeps normal as an explicit override without altering other typography", () => {
	const parent = Object.freeze({
		...initialTextStyle,
		"font-style": "italic",
		"font-weight": "700",
		"font-size": "24px",
	});
	const computed = computeTextStyle(
		{ "font-style": "normal" },
		parent,
		{ width: 640, height: 480 },
		16,
	);
	expect(computed).toEqual({ ...parent, "font-style": "normal" });
	expect(parent["font-style"]).toBe("italic");
	expect(Object.isFrozen(computed)).toBe(true);
});

it("cascades source order, specificity and stylesheet versus inline priority", () => {
	const { inline, computed } = fixture(
		"#target{font-style:normal;font-style:oblique}span{font-style:italic}",
	);
	expect(computed.fontStyle).toBe("oblique");
	inline.fontStyle = "italic";
	expect(computed.fontStyle).toBe("italic");
	const important = fixture("#target{font-style:oblique!important}");
	important.inline.fontStyle = "normal";
	expect(important.computed.fontStyle).toBe("oblique");
	important.inline.setProperty("font-style", "italic", "important");
	expect(important.computed.fontStyle).toBe("italic");
	expect(important.inline.getPropertyPriority("font-style")).toBe("important");
	important.inline.cssText = "font-style:italic!important;font-style:normal";
	expect(important.computed.fontStyle).toBe("italic");
});

it("exposes live camelCase and dashed CSSOM values with removal", () => {
	const { inline, computed } = fixture("#target{font-style:oblique}");
	expect(inline.fontStyle).toBe("");
	inline.fontStyle = "ITALIC";
	expect(inline.getPropertyValue("font-style")).toBe("italic");
	expect(inline.cssText).toBe("font-style: italic;");
	expect(computed.getPropertyValue("font-style")).toBe("italic");
	inline.setProperty("font-style", "normal", "important");
	expect(computed.fontStyle).toBe("normal");
	expect(inline.removeProperty("font-style")).toBe("normal");
	expect(inline.fontStyle).toBe("");
	expect(computed.fontStyle).toBe("oblique");
	expect(() => computed.setProperty("font-style", "italic")).toThrow();
	expect(() => computed.removeProperty("font-style")).toThrow();
});

it("enumerates font-style once in native text, inline and computed properties", () => {
	const { computed, inline } = fixture();
	expect(isCssTextProperty("font-style")).toBe(true);
	for (const properties of [
		cssTextProperties,
		inlineProperties,
		computedStyleProperties,
	])
		expect(properties.filter((property) => property === "font-style")).toEqual([
			"font-style",
		]);
	const names = Array.from({ length: computed.length }, (_value, index) =>
		computed.item(index),
	);
	expect(names.filter((name) => name === "font-style")).toEqual(["font-style"]);
	expect(computed.getPropertyValue("font-style")).toBe("normal");
	inline.fontStyle = "italic";
	expect(inline.length).toBe(1);
	expect(inline.item(0)).toBe("font-style");
});

it("resolves inherited custom values and fallbacks while keeping names case-sensitive", () => {
	const { tree, id, text, inline, computed } = fixture(
		"#parent{--Slant:oblique;font-style:var(--Slant)}",
	);
	const before = text();
	expect(computed.fontStyle).toBe("oblique");
	tree.setAttribute(id("#parent"), "style", "--Slant:italic");
	expect(computed.fontStyle).toBe("italic");
	expect(text()).not.toBe(before);
	inline.fontStyle = "var(--Slant)";
	expect(inline.fontStyle).toBe("var(--Slant)");
	expect(computed.fontStyle).toBe("italic");
	inline.fontStyle = "var(--slant, normal)";
	expect(computed.fontStyle).toBe("normal");
	inline.setProperty("--slant", "oblique");
	expect(computed.fontStyle).toBe("oblique");
});

it.each(["var(--Missing)", "var(--Bad)", "var(--Cycle)"])(
	"uses inherited fallback rather than reviving a declaration after %s",
	(value) => {
		const { computed } = fixture(
			`#parent{font-style:oblique}#target{--Bad:oblique 10deg;--Cycle:var(--Cycle);font-style:normal;font-style:${value}}`,
		);
		expect(computed.fontStyle).toBe("oblique");
	},
);

it.each([
	"oblique 0deg",
	"oblique 14deg",
	"oblique -10deg",
	"oblique 10deg 20deg",
	"italic 10deg",
	"auto",
	"none",
	"0",
	"12px",
	"normal italic",
	"italic, oblique",
	"calc(1)",
	"revert-layer",
])("retains unsupported font-style syntax as a diagnostic: %s", (value) => {
	expect(parseTextValue("font-style", value)).toBeUndefined();
	expect(cssSupportsDeclaration("font-style", value)).toBe(false);
	expect(declarations(`font-style:${value}`)).toEqual({
		parsed: [],
		issues: ["unimplemented-or-invalid-css-value"],
	});
	expect(parseInlineDeclarations(`font-style:${value}`, 10)).toEqual([]);
	const { text, styles, inline } = fixture(
		`#parent{font-style:oblique}#target{font-style:italic;font-style:${value}}`,
	);
	expect(text()["font-style"]).toBe("italic");
	expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(1);
	inline.fontStyle = "normal";
	inline.fontStyle = value;
	expect(inline.fontStyle).toBe("normal");
	expect(text()["font-style"]).toBe("normal");
});

it.each(["font", "font-synthesis", "font-synthesis-style"])(
	"does not admit the unimplemented property %s",
	(property) => {
		const value = property === "font" ? "italic 16px monospace" : "none";
		expect(cssSupportsDeclaration(property, value)).toBe(false);
		expect(declarations(`${property}:${value}`)).toEqual({
			parsed: [],
			issues: ["unimplemented-css-property"],
		});
	},
);

it("invalidates inherited font-style caches across inline mutation and removal", () => {
	const { tree, id, text, inline, computed } = fixture();
	const before = text();
	tree.setAttribute(id("#parent"), "style", "font-style:italic");
	expect(text()).not.toBe(before);
	expect(computed.fontStyle).toBe("italic");
	inline.fontStyle = "normal";
	expect(computed.fontStyle).toBe("normal");
	tree.setAttribute(id("#parent"), "style", "font-style:oblique");
	expect(computed.fontStyle).toBe("normal");
	inline.removeProperty("font-style");
	expect(computed.fontStyle).toBe("oblique");
	tree.removeAttribute(id("#parent"), "style");
	expect(computed.fontStyle).toBe("normal");
});
