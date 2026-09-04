import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import { parseInlineDeclarations } from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import {
	cssTextProperties,
	initialTextStyle,
	isCssTextProperty,
	parseTextValue,
} from "./css-text.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { pageCssSupports } from "./page-css.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const property = "overflow-wrap";

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "") {
	const tree = parseHtmlDocument(
		`<style>${css}</style><main id="outer"><span id="target">Text</span></main>`,
		"https://fixture.invalid/overflow-wrap",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const styles = documentStyles(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		text: (selector = "#target") => styles.text(id(selector)),
	};
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		if (definition.indexed)
			Object.defineProperty(object, "length", {
				get: definition.indexed.length,
			});
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(object, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value });
		return object;
	},
};

interface ComputedTextStyle {
	readonly overflowWrap: string;
	readonly length: number;
	getPropertyValue(name: string): string;
	item(index: number): string;
	setProperty(name: string, value: string): void;
}

it("registers inherited normal defaults and shares frozen text styles", () => {
	const { tree, styles, id, text } = fixture();
	expect(cssTextProperties).toContain(property);
	expect(isCssTextProperty(property)).toBe(true);
	expect(initialTextStyle[property]).toBe("normal");
	expect(text()).toBe(initialTextStyle);
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(Object.isFrozen(text())).toBe(true);
	expect(styles.metrics().textProperties).toContain(property);
});

it.each([
	"normal",
	"break-word",
	"anywhere",
	"initial",
	"inherit",
	"unset",
	"revert",
])(
	"accepts overflow-wrap %s through direct and declaration parsing",
	(value) => {
		expect(parseTextValue(property, value)).toBe(value);
		expect(parseInlineDeclarations(`overflow-wrap:${value}`, 10)).toEqual([
			{ name: property, value, important: false },
		]);
	},
);

it.each([
	"",
	"break-all",
	"word-break",
	"auto",
	"0",
	"1px",
	"-1",
	"anywhere normal",
	'"anywhere"',
	"revert-layer",
	"calc(1px + 1px)",
])(
	"rejects invalid overflow-wrap %s without treating it as a text length",
	(value) => {
		expect(parseTextValue(property, value)).toBeUndefined();
		expect(parseInlineDeclarations(`overflow-wrap:${value}`, 10)).toEqual([]);
		expect(pageCssSupports(property, value)).toBe(false);
	},
);

it("normalizes declaration case and preserves important metadata", () => {
	expect(
		parseInlineDeclarations("OVERFLOW-WRAP:ANYWHERE !IMPORTANT", 10),
	).toEqual([{ name: property, value: "anywhere", important: true }]);
	const issues: string[] = [];
	expect(
		parseCssDeclarations(
			"overflow-wrap:normal; overflow-wrap:break-word!important; overflow-wrap:invalid",
			{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
			(code) => issues.push(code),
		),
	).toEqual([
		{ property, value: "normal", important: false },
		{ property, value: "break-word", important: true },
	]);
	expect(issues).toEqual(["unimplemented-or-invalid-css-value"]);
});

it("shares an inherited immutable nondefault record through elements and text nodes", () => {
	const { tree, styles, id, text } = fixture("#outer{overflow-wrap:anywhere}");
	expect(text()[property]).toBe("anywhere");
	expect(text()).toBe(text("#outer"));
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(Object.isFrozen(text())).toBe(true);
	expect(initialTextStyle[property]).toBe("normal");
});

it.each([
	["initial", "normal"],
	["inherit", "anywhere"],
	["unset", "anywhere"],
	["revert", "anywhere"],
])("resolves CSS-wide %s as %s", (keyword, expected) => {
	const { text } = fixture(
		`#outer{overflow-wrap:anywhere} #target{overflow-wrap:${keyword}}`,
	);
	expect(text()[property]).toBe(expected);
});

it("includes overflow-wrap in all expansion and existing all inheritance", () => {
	const values = parseCssDeclarations(
		"all:initial",
		{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 200 },
		() => {},
	);
	expect(values.filter((entry) => entry.property === property)).toEqual([
		{ property, value: "initial", important: false },
	]);
	const { tree, id, text } = fixture("#outer{overflow-wrap:anywhere}");
	tree.setAttribute(id(), "style", "all:initial");
	expect(text()[property]).toBe("normal");
	tree.setAttribute(id(), "style", "all:inherit");
	expect(text()[property]).toBe("anywhere");
});

it.each([
	[
		"span{overflow-wrap:anywhere} #target{overflow-wrap:break-word}",
		"",
		"break-word",
	],
	[
		"#target{overflow-wrap:anywhere} #target{overflow-wrap:break-word}",
		"",
		"break-word",
	],
	["#target{overflow-wrap:anywhere}", "overflow-wrap:break-word", "break-word"],
	[
		"#target{overflow-wrap:anywhere!important}",
		"overflow-wrap:break-word",
		"anywhere",
	],
	[
		"#target{overflow-wrap:anywhere!important}",
		"overflow-wrap:break-word!important",
		"break-word",
	],
	[
		"#outer{overflow-wrap:anywhere} #target{overflow-wrap:invalid}",
		"",
		"anywhere",
	],
	[
		"#target{overflow-wrap:break-word;overflow-wrap:invalid}",
		"overflow-wrap:invalid",
		"break-word",
	],
])(
	"cascades stylesheet/inline/source order without invalid overrides: %s / %s",
	(css, inline, expected) => {
		const { tree, id, text } = fixture(css);
		if (inline) tree.setAttribute(id(), "style", inline);
		expect(text()[property]).toBe(expected);
	},
);

it("refreshes inherited style after inline and embedded stylesheet mutations", () => {
	const { tree, styles, id, text } = fixture("#outer{overflow-wrap:anywhere}");
	const before = text();
	tree.setAttribute(id("#outer"), "style", "overflow-wrap:break-word");
	expect(text()[property]).toBe("break-word");
	expect(text()).not.toBe(before);
	expect(before[property]).toBe("anywhere");
	tree.removeAttribute(id("#outer"), "style");
	tree.setData(
		tree.get(id("style")).children[0],
		"#outer{overflow-wrap:normal}",
	);
	expect(text()[property]).toBe("normal");
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	const target = id();
	tree.remove(target);
	expect(() => styles.text(target)).toThrow();
	tree.close();
	expect(() => styles.text(target)).toThrow("closed");
});

it("reevaluates supported hover pseudo-class styling without creating pseudo-elements", () => {
	const { tree, id, text } = fixture(
		"#target{overflow-wrap:break-word} #target:hover{overflow-wrap:anywhere}",
	);
	expect(text()[property]).toBe("break-word");
	tree.setPointerState(id(), null);
	expect(text()[property]).toBe("anywhere");
	tree.setPointerState(null, null);
	expect(text()[property]).toBe("break-word");
});

it.each(["normal", "break-word", "anywhere"])(
	"exposes supports for %s through both native query forms",
	(value) => {
		expect(pageCssSupports(property, value)).toBe(true);
		expect(pageCssSupports(`(overflow-wrap:${value})`)).toBe(true);
	},
);

it("uses overflow-wrap declaration support in native conditional stylesheet rules", () => {
	const { text } = fixture(
		"#target{overflow-wrap:normal}@supports(overflow-wrap:anywhere){#target{overflow-wrap:break-word}}@supports(overflow-wrap:break-all){#target{overflow-wrap:anywhere}}",
	);
	expect(text()[property]).toBe("break-word");
});

it("exposes a live readonly computed longhand and camel-case alias without layout", () => {
	const { tree, id } = fixture("#target{overflow-wrap:anywhere}");
	const computed = new ComputedStyles(tree, factory);
	const style = computed.get(id()) as ComputedTextStyle;
	expect(computedStyleProperties).toContain(property);
	expect(style.getPropertyValue(property)).toBe("anywhere");
	expect(style.overflowWrap).toBe("anywhere");
	expect(
		Array.from({ length: style.length }, (_value, index) => style.item(index)),
	).toContain(property);
	expect(resolvedStyleValue(tree, id(), property)).toBe("anywhere");
	expect(documentGeometry(tree).metrics().builds).toBe(0);
	expect(() => style.setProperty(property, "normal")).toThrow("read-only");
	tree.setAttribute(id(), "style", "overflow-wrap:break-word");
	expect(style.overflowWrap).toBe("break-word");
	expect(documentGeometry(tree).metrics().builds).toBe(0);
	tree.close();
	expect(() => style.overflowWrap).toThrow("closed");
});

it("preserves the explicit unsupported pseudo-element computed-style boundary", () => {
	const { tree, id } = fixture("#target{overflow-wrap:anywhere}");
	const computed = new ComputedStyles(tree, factory);
	expect(() => computed.get(id(), "::before")).toThrow(
		"Pseudo-element computed styles are not implemented",
	);
	expect(() => computed.get(id(), "::after")).toThrow(
		"Pseudo-element computed styles are not implemented",
	);
});

it("supports the legacy alias without advertising neighboring text features", () => {
	expect(pageCssSupports("word-wrap", "anywhere")).toBe(true);
	for (const [name, value] of [
		["word-break", "break-all"],
		["line-break", "anywhere"],
		["hyphens", "auto"],
	])
		expect(pageCssSupports(name, value)).toBe(false);
});
