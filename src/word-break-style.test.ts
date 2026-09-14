import { afterEach, expect, it } from "vitest";
import {
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import {
	inlineProperties,
	parseInlineDeclarations,
} from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import {
	type CssTextProperty,
	cssTextProperties,
	initialTextStyle,
	isCssTextProperty,
	parseTextValue,
} from "./css-text.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { pageCssSupports } from "./page-css.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	[index: number]: string | undefined;
	cssText: string;
	readonly length: number;
	wordBreak: string;
	"word-break": string;
	wordWrap: string;
	overflowWrap: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
	item(index: number): string;
}

const property = "word-break";
const trees: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value });
		const indexed = definition.indexed;
		if (!indexed) return target;
		Object.defineProperty(target, "length", { get: indexed.length });
		return new Proxy(target, {
			get(object, key) {
				if (typeof key === "string" && /^(0|[1-9]\d*)$/.test(key))
					return Number(key) < indexed.length()
						? indexed.get(Number(key))
						: undefined;
				return Reflect.get(object, key);
			},
		});
	},
};

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(source = "", css = "") {
	const tree = parseHtmlDocument(
		`<style>${css}</style><main id="outer"><span id="target">Text</span></main>`,
		"https://fixture.invalid/word-break",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	if (source) tree.setAttribute(id(), "style", source);
	const styles = documentStyles(tree);
	const dom = new ScriptDom(tree, factory);
	const element = dom.node(id()) as { style: Style };
	const style = element.style;
	const computed = dom.getComputedStyle(element) as Style;
	return {
		tree,
		id,
		styles,
		element,
		style,
		computed,
		text: (selector = "#target") => styles.text(id(selector)),
	};
}

function names(style: Style) {
	return Array.from({ length: style.length }, (_value, index) =>
		style.item(index),
	);
}

it("registers an inherited frozen normal default without changing wrap defaults", () => {
	const { tree, id, styles, text, computed } = fixture();
	expect(cssTextProperties).toContain(property);
	expect(isCssTextProperty(property)).toBe(true);
	expect(Reflect.get(initialTextStyle, property)).toBe("normal");
	expect(initialTextStyle["overflow-wrap"]).toBe("normal");
	expect(text()).toBe(initialTextStyle);
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(Object.isFrozen(text())).toBe(true);
	expect(styles.metrics().textProperties).toContain(property);
	expect(computed.wordBreak).toBe("normal");
	expect(computed.wordWrap).toBe("normal");
});

it("shares inherited nondefault styles across elements and text nodes", () => {
	const { tree, id, styles, text } = fixture(
		"",
		"#outer{word-break:break-word;overflow-wrap:normal}",
	);
	expect(Reflect.get(text(), property)).toBe("break-word");
	expect(text()["overflow-wrap"]).toBe("normal");
	expect(text()).toBe(text("#outer"));
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(Object.isFrozen(text())).toBe(true);
	expect(Reflect.get(initialTextStyle, property)).toBe("normal");
});

it.each(["normal", "break-word", "initial", "inherit", "unset", "revert"])(
	"accepts word-break %s through parsing and native supports",
	(value) => {
		expect(parseTextValue(property as CssTextProperty, value)).toBe(value);
		expect(parseInlineDeclarations(`${property}:${value}`, 10)).toEqual([
			{ name: property, value, important: false },
		]);
		expect(pageCssSupports(property, value)).toBe(true);
		expect(pageCssSupports(`(${property}:${value})`)).toBe(true);
	},
);

it.each([
	"",
	"anywhere",
	"break-all",
	"keep-all",
	"auto-phrase",
	"manual",
	"auto",
	"0",
	"1px",
	"normal break-word",
	'"break-word"',
	"revert-layer",
])("rejects unsupported word-break %s", (value) => {
	expect(parseTextValue(property as CssTextProperty, value)).toBeUndefined();
	expect(parseInlineDeclarations(`${property}:${value}`, 10)).toEqual([]);
	expect(pageCssSupports(property, value)).toBe(false);
	expect(pageCssSupports(`(${property}:${value})`)).toBe(false);
});

it("normalizes case and retains importance and invalid-value diagnostics", () => {
	expect(
		parseInlineDeclarations("WORD-BREAK:BREAK-WORD !IMPORTANT", 10),
	).toEqual([{ name: property, value: "break-word", important: true }]);
	const issues: string[] = [];
	expect(
		parseCssDeclarations(
			"word-break:normal;word-break:break-word!important;word-break:break-all",
			{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
			(code) => issues.push(code),
		),
	).toEqual([
		{ property, value: "normal", important: false },
		{ property, value: "break-word", important: true },
	]);
	expect(issues).toEqual(["unimplemented-or-invalid-css-value"]);
});

it.each([
	["word-break:break-word;overflow-wrap:normal", "normal"],
	["overflow-wrap:normal;word-break:break-word", "normal"],
	["word-break:break-word;word-wrap:anywhere", "anywhere"],
	["word-wrap:anywhere;word-break:break-word", "anywhere"],
])("keeps both longhand slots independent for %s", (source, wrap) => {
	const { style, computed, text } = fixture(source, `#target{${source}}`);
	for (const current of [style, computed]) {
		expect(current.wordBreak).toBe("break-word");
		expect(current.overflowWrap).toBe(wrap);
		expect(current.wordWrap).toBe(wrap);
	}
	expect(names(style).sort()).toEqual(["overflow-wrap", "word-break"]);
	expect(Reflect.get(text(), property)).toBe("break-word");
	expect(text()["overflow-wrap"]).toBe(wrap);
	style.cssText = "";
	expect(computed.wordBreak).toBe("break-word");
	expect(computed.overflowWrap).toBe(wrap);
});

it.each([
	["initial", "normal"],
	["inherit", "break-word"],
	["unset", "break-word"],
	["revert", "break-word"],
])(
	"resolves word-break:%s independently of inherited wrap",
	(value, expected) => {
		const { style, computed } = fixture(
			`word-break:${value}`,
			"#outer{word-break:break-word;word-wrap:anywhere}",
		);
		expect(style.wordBreak).toBe(value);
		expect(computed.wordBreak).toBe(expected);
		expect(computed.overflowWrap).toBe("anywhere");
	},
);

it.each([
	["initial", "normal", "normal"],
	["inherit", "break-word", "anywhere"],
	["unset", "break-word", "anywhere"],
	["revert", "break-word", "anywhere"],
])(
	"includes word-break in all:%s expansion and resolution",
	(value, word, wrap) => {
		const declarations = parseCssDeclarations(
			`all:${value}`,
			{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 200 },
			() => {},
		);
		expect(declarations).toContainEqual({ property, value, important: false });
		expect(declarations).toContainEqual({
			property: "overflow-wrap",
			value,
			important: false,
		});
		const { computed } = fixture(
			`all:${value}`,
			"#outer{word-break:break-word;overflow-wrap:anywhere}",
		);
		expect(computed.wordBreak).toBe(word);
		expect(computed.overflowWrap).toBe(wrap);
	},
);

it("cascades importance independently of the word-wrap alias slot", () => {
	const { style, computed } = fixture(
		"word-break:normal;word-wrap:anywhere",
		"#target{word-break:break-word!important;overflow-wrap:normal}",
	);
	expect(computed.wordBreak).toBe("break-word");
	expect(computed.wordWrap).toBe("anywhere");
	style.setProperty(property, "normal", "important");
	expect(computed.wordBreak).toBe("normal");
	expect(computed.overflowWrap).toBe("anywhere");
	style.removeProperty(property);
	expect(computed.wordBreak).toBe("break-word");
});

it("does not let rejected modes override valid or inherited declarations", () => {
	const { style, computed } = fixture(
		"word-break:break-all",
		"#outer{word-break:break-word}#target{word-break:normal;word-break:keep-all}",
	);
	expect(style.wordBreak).toBe("");
	expect(computed.wordBreak).toBe("normal");
	style.cssText = "word-break:break-word;word-break:anywhere";
	expect(style.wordBreak).toBe("break-word");
	expect(computed.wordBreak).toBe("break-word");
});

it("retains variable source and recomputes substitution, fallback and invalid values", () => {
	const { style, computed } = fixture(
		"--mode:normal;word-break:var(--mode);word-wrap:anywhere",
		"#outer{word-break:break-word}",
	);
	expect(style.wordBreak).toBe("var(--mode)");
	expect(computed.wordBreak).toBe("normal");
	style.setProperty("--mode", "break-word");
	expect(computed.wordBreak).toBe("break-word");
	style.wordBreak = "var(--missing,normal)";
	expect(computed.wordBreak).toBe("normal");
	style.wordBreak = "var(--mode)";
	style.setProperty("--mode", "anywhere");
	expect(style.wordBreak).toBe("var(--mode)");
	expect(computed.wordBreak).toBe("break-word");
	style.removeProperty("--mode");
	expect(computed.wordBreak).toBe("break-word");
	expect(computed.wordWrap).toBe("anywhere");
});

it("resets either longhand without resetting the other", () => {
	const { style, computed } = fixture(
		"word-break:break-word;overflow-wrap:anywhere",
	);
	style.wordBreak = "initial";
	expect(computed.wordBreak).toBe("normal");
	expect(computed.wordWrap).toBe("anywhere");
	style.wordBreak = "break-word";
	style.wordWrap = "initial";
	expect(computed.wordBreak).toBe("break-word");
	expect(computed.overflowWrap).toBe("normal");
	style.overflowWrap = "anywhere";
	expect(style.removeProperty("word-wrap")).toBe("anywhere");
	expect(style.wordBreak).toBe("break-word");
	expect(computed.wordBreak).toBe("break-word");
	expect(computed.wordWrap).toBe("normal");
});

it("enumerates and reads a distinct computed property without building layout", () => {
	const { tree, id, computed } = fixture(
		"word-break:break-word;word-wrap:normal",
	);
	expect(inlineProperties).toContain(property);
	expect(computedStyleProperties).toContain(property);
	expect(names(computed)).toEqual(computedStyleProperties);
	expect(names(computed).filter((name) => name === property)).toHaveLength(1);
	expect(names(computed)).not.toContain("word-wrap");
	expect(
		Array.from({ length: computed.length }, (_value, index) => computed[index]),
	).toEqual(computedStyleProperties);
	expect(computed.getPropertyValue(property)).toBe("break-word");
	expect(computed.getPropertyValue("WORD-BREAK")).toBe("break-word");
	expect(computed.wordBreak).toBe("break-word");
	expect(computed["word-break"]).toBe("break-word");
	expect(computed.overflowWrap).toBe("normal");
	expect(resolvedStyleValue(tree, id(), property)).toBe("break-word");
	expect(documentGeometry(tree).metrics().builds).toBe(0);
});

it.each(["wordBreak", "word-break"] as const)(
	"mutates and serializes the native inline %s accessor independently",
	(accessor) => {
		const { element, style, computed } = fixture("word-wrap:anywhere");
		style[accessor] = "break-word";
		expect(element.style).toBe(style);
		expect(style.wordBreak).toBe("break-word");
		expect(style["word-break"]).toBe("break-word");
		expect(computed[accessor]).toBe("break-word");
		expect(style.cssText).toBe(
			"overflow-wrap: anywhere; word-break: break-word;",
		);
		expect(names(style)).toEqual(["overflow-wrap", "word-break"]);
		expect(style[1]).toBe("word-break");
		expect(style[2]).toBeUndefined();
		expect(style.removeProperty(property)).toBe("break-word");
		expect(style[accessor]).toBe("");
		expect(computed[accessor]).toBe("normal");
		expect(style.cssText).toBe("overflow-wrap: anywhere;");
	},
);

it("normalizes native method names and serializes independent priorities", () => {
	const { style, computed } = fixture("word-wrap:anywhere!important");
	style.setProperty("WORD-BREAK", "BREAK-WORD", "IMPORTANT");
	expect(style.getPropertyValue("WORD-BREAK")).toBe("break-word");
	expect(style.getPropertyPriority(property)).toBe("important");
	expect(style.getPropertyPriority("word-wrap")).toBe("important");
	expect(computed.getPropertyPriority(property)).toBe("");
	expect(style.cssText).toBe(
		"overflow-wrap: anywhere !important; word-break: break-word !important;",
	);
	style.wordBreak = "normal";
	expect(style.getPropertyPriority(property)).toBe("");
	expect(style.getPropertyPriority("overflow-wrap")).toBe("important");
	expect(style.removeProperty("WORD-BREAK")).toBe("normal");
	expect(names(style)).toEqual(["overflow-wrap"]);
	expect(computed.wordWrap).toBe("anywhere");
});

it("ignores invalid setters and no-op writes and supports empty removal", () => {
	const { tree, style, computed } = fixture(
		"word-break:break-word;overflow-wrap:anywhere",
	);
	const revision = tree.revision;
	for (const value of [
		"anywhere",
		"break-all",
		"keep-all",
		"0",
		"normal!important",
	])
		style.wordBreak = value;
	style.setProperty(property, "normal", "invalid");
	style.wordBreak = "break-word";
	expect(tree.revision).toBe(revision);
	expect(style.wordBreak).toBe("break-word");
	style.setProperty(property, "", "invalid");
	expect(style.wordBreak).toBe("");
	expect(computed.wordBreak).toBe("normal");
	expect(computed.overflowWrap).toBe("anywhere");
});

it("refreshes existing inline and computed objects after external attribute changes", () => {
	const { tree, id, style, computed } = fixture("word-break:normal");
	expect(computed.wordBreak).toBe("normal");
	tree.setAttribute(
		id(),
		"style",
		"word-break:break-word!important;word-wrap:anywhere",
	);
	expect(style.wordBreak).toBe("break-word");
	expect(style.getPropertyPriority(property)).toBe("important");
	expect(computed.wordBreak).toBe("break-word");
	expect(computed.wordWrap).toBe("anywhere");
	tree.removeAttribute(id(), "style");
	expect(style.wordBreak).toBe("");
	expect(computed.wordBreak).toBe("normal");
	expect(computed.wordWrap).toBe("normal");
});

it("invalidates inherited text styles after ancestor and stylesheet mutations", () => {
	const { tree, id, styles, text, computed } = fixture(
		"",
		"#outer{word-break:break-word;word-wrap:anywhere}",
	);
	const before = text();
	expect(computed.wordBreak).toBe("break-word");
	tree.setAttribute(id("#outer"), "style", "word-break:normal");
	expect(computed.wordBreak).toBe("normal");
	expect(text()).not.toBe(before);
	expect(Reflect.get(before, property)).toBe("break-word");
	expect(computed.wordWrap).toBe("anywhere");
	tree.removeAttribute(id("#outer"), "style");
	expect(computed.wordBreak).toBe("break-word");
	tree.setData(
		tree.get(id("style")).children[0],
		"#outer{word-break:normal;word-wrap:break-word}",
	);
	expect(computed.wordBreak).toBe("normal");
	expect(computed.wordWrap).toBe("break-word");
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(documentGeometry(tree).metrics().builds).toBe(0);
});

it("keeps computed accessors and methods read-only without altering inline state", () => {
	const { style, computed } = fixture(
		"word-break:break-word;word-wrap:anywhere",
	);
	const source = style.cssText;
	for (const accessor of ["wordBreak", "word-break"] as const)
		expect(() => {
			computed[accessor] = "normal";
		}).toThrow("read-only");
	expect(() => computed.setProperty(property, "normal")).toThrow("read-only");
	expect(() => computed.removeProperty(property)).toThrow("read-only");
	expect(style.cssText).toBe(source);
	expect(computed.wordBreak).toBe("break-word");
});

it("uses the bounded supported modes in conditional stylesheet rules", () => {
	const { computed } = fixture(
		"",
		"#target{word-break:normal}@supports(word-break:break-word){#target{word-break:break-word}}@supports(word-break:break-all){#target{word-break:normal}}@supports(word-break:keep-all){#target{word-break:normal}}",
	);
	expect(computed.wordBreak).toBe("break-word");
	expect(computed.overflowWrap).toBe("normal");
});
