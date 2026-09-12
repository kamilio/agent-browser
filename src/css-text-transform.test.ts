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
import {
	cssSupportsCondition,
	cssSupportsDeclaration,
	parseCssDeclarations,
} from "./css-parser.js";
import {
	cssTextProperties,
	initialTextStyle,
	parseTextValue,
} from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { parseTextTransform } from "./text-transform-style.js";

interface Style {
	readonly length: number;
	cssText: string;
	textTransform: string;
	"text-transform": string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
	item(index: number): string;
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
		if (definition.indexed)
			Object.defineProperty(target, "length", {
				get: definition.indexed.length,
			});
		return target;
	},
};
const documents: DocumentTree[] = [];
const queriesToClose: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of queriesToClose.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><main id="parent"><span id="target">MiXeD Text</span></main>`,
		"https://fixture.invalid/text-transform-css",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queriesToClose.push(queries);
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
		inline: inlineStyles.get(id()) as Style,
		computed: computedStyles.get(id()) as Style,
		text: (selector = "#target") => styles.text(id(selector)),
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

function permutations(parts: string[]): string[][] {
	return parts.length === 0
		? [[]]
		: parts.flatMap((part, index) =>
				permutations(parts.filter((_value, offset) => offset !== index)).map(
					(rest) => [part, ...rest],
				),
			);
}

const validValues: [string, string][] = [["none", "none"]];
for (const casing of ["", "capitalize", "uppercase", "lowercase"])
	for (const width of ["", "full-width"])
		for (const kana of ["", "full-size-kana"]) {
			const parts = [casing, width, kana].filter(Boolean);
			if (parts.length === 0) continue;
			for (const order of permutations(parts))
				validValues.push([order.join(" "), parts.join(" ")]);
		}

it.each(validValues)(
	"canonicalizes %s to %s without dropping modifiers",
	(value, expected) => {
		expect(parseTextTransform(value)).toBe(expected);
		expect(
			parseTextTransform(
				`\t ${value.toUpperCase().replaceAll(" ", "\n\f\r\t")} `,
			),
		).toBe(expected);
		expect(parseTextValue("text-transform", value)).toBe(expected);
		expect(declarations(`text-transform:${value}`)).toEqual({
			parsed: [
				{ property: "text-transform", value: expected, important: false },
			],
			issues: [],
		});
		expect(
			parseInlineDeclarations(`text-transform:${value}`, 10).map(
				({ name, value: specified }) => [name, specified],
			),
		).toEqual([["text-transform", expected]]);
		expect(cssSupportsDeclaration("text-transform", value)).toBe(true);
		expect(cssSupportsCondition(`(text-transform:${value})`, false)).toBe(true);
	},
);

it.each([
	"",
	" ",
	"none none",
	"none uppercase",
	"full-width none",
	"none full-size-kana",
	"uppercase lowercase",
	"capitalize uppercase",
	"lowercase capitalize",
	"uppercase uppercase",
	"capitalize capitalize",
	"lowercase lowercase",
	"full-width full-width",
	"full-size-kana full-size-kana",
	"uppercase full-width full-size-kana full-width",
	"unknown",
	"math-auto",
	"uppercase,full-width",
	"uppercase-full-width",
	"uppercase initial",
	"inherit full-width",
	"unset lowercase",
	"revert capitalize",
	"revert-layer uppercase",
	"0",
	'"uppercase"',
	"url(uppercase)",
	"uppercase\u00a0full-width",
	"\u00a0uppercase",
	"uppercase\u000bfull-width",
	"full-size-Kana",
])("rejects invalid text-transform grammar %j", (value) => {
	expect(parseTextTransform(value)).toBeUndefined();
	expect(parseTextValue("text-transform", value)).toBeUndefined();
	expect(cssSupportsDeclaration("text-transform", value)).toBe(false);
});

it("bounds the source before normalization and rejects non-string input", () => {
	expect(parseTextTransform(`${" ".repeat(4096 - 4)}none`)).toBe("none");
	expect(parseTextTransform(`${" ".repeat(4096 - 3)}none`)).toBeUndefined();
	expect(parseTextTransform("uppercase ".repeat(4096))).toBeUndefined();
	for (const value of [undefined, null, 1, {}, []])
		expect(parseTextTransform(value as unknown as string)).toBeUndefined();
});

it("inherits specified keywords with immutable defaults and text-node styles", () => {
	const { tree, id, styles, text, computed } = fixture();
	expect(initialTextStyle["text-transform"]).toBe("none");
	expect(text()).toBe(initialTextStyle);
	expect(computed.textTransform).toBe("none");
	tree.setAttribute(
		id("#parent"),
		"style",
		"text-transform:full-size-kana uppercase full-width",
	);
	expect(text()["text-transform"]).toBe("uppercase full-width full-size-kana");
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(computed.textTransform).toBe("uppercase full-width full-size-kana");
	expect(Object.isFrozen(text())).toBe(true);
	expect(styles.metrics().issues).toEqual({});
});

it.each(["initial", "inherit", "unset", "revert"])(
	"reuses inherited CSS-wide and all:%s handling",
	(keyword) => {
		expect(parseTextTransform(keyword)).toBeUndefined();
		expect(parseTextValue("text-transform", keyword)).toBe(keyword);
		expect(cssSupportsDeclaration("text-transform", keyword)).toBe(true);
		const { inline, computed } = fixture(
			`#parent{text-transform:lowercase full-width}#target{text-transform:${keyword}}`,
		);
		const expected = keyword === "initial" ? "none" : "lowercase full-width";
		expect(computed.textTransform).toBe(expected);
		inline.textTransform = "uppercase";
		inline.setProperty("all", keyword);
		expect(computed.textTransform).toBe(expected);
		expect(declarations(`all:${keyword}`).parsed).toContainEqual({
			property: "text-transform",
			value: keyword,
			important: false,
		});
	},
);

it("honors priorities, live inline mutations and read-only computed aliases", () => {
	const { inline, computed, tree, id } = fixture(
		"#target{text-transform:lowercase!important}",
	);
	inline.textTransform = "capitalize";
	expect(computed.textTransform).toBe("lowercase");
	inline.setProperty("TEXT-TRANSFORM", "full-width UPPERCASE", "important");
	expect(inline["text-transform"]).toBe("uppercase full-width");
	expect(inline.getPropertyPriority("text-transform")).toBe("important");
	expect(computed.textTransform).toBe("uppercase full-width");
	expect(computed["text-transform"]).toBe(computed.textTransform);
	expect(computed.getPropertyValue("TEXT-TRANSFORM")).toBe(
		computed.textTransform,
	);
	expect(computed.getPropertyPriority("text-transform")).toBe("");
	expect(resolvedStyleValue(tree, id(), "text-transform")).toBe(
		computed.textTransform,
	);
	const revision = tree.revision;
	inline.textTransform = "uppercase lowercase";
	expect(tree.revision).toBe(revision);
	expect(inline.textTransform).toBe("uppercase full-width");
	expect(() => {
		computed.textTransform = "none";
	}).toThrow();
	expect(inline.removeProperty("text-transform")).toBe("uppercase full-width");
	expect(computed.textTransform).toBe("lowercase");
	inline.cssText = "text-transform:capitalize!important;text-transform:none";
	expect(computed.textTransform).toBe("capitalize");
});

it("registers text-transform once in inline and computed property metadata", () => {
	const { inline, computed } = fixture();
	for (const names of [
		cssTextProperties,
		inlineProperties,
		computedStyleProperties,
	])
		expect(names.filter((name) => name === "text-transform")).toHaveLength(1);
	const names = Array.from({ length: computed.length }, (_value, index) =>
		computed.item(index),
	);
	expect(names).toEqual(computedStyleProperties);
	expect(names).toEqual([...names].sort());
	inline.textTransform = "uppercase";
	expect(inline.item(0)).toBe("text-transform");
	expect(inline.length).toBe(1);
});

it("resolves variables and falls back to inherited values when substitutions fail", () => {
	const { inline, computed, tree, id } = fixture(
		"#parent{--case:uppercase;text-transform:lowercase}#target{text-transform:var(--case)}",
	);
	expect(computed.textTransform).toBe("uppercase");
	inline.setProperty("--case", "full-size-kana capitalize full-width");
	expect(computed.textTransform).toBe("capitalize full-width full-size-kana");
	inline.textTransform = "var(--missing, full-width lowercase)";
	expect(computed.textTransform).toBe("lowercase full-width");
	inline.textTransform = "var(--missing)";
	expect(computed.textTransform).toBe("lowercase");
	inline.textTransform = "var(--case)";
	inline.setProperty("--case", "uppercase lowercase");
	expect(computed.textTransform).toBe("lowercase");
	tree.setAttribute(id("#parent"), "style", "text-transform:capitalize");
	expect(computed.textTransform).toBe("capitalize");
});

it("dispatches supports by grammar without claiming glyph rendering", () => {
	const { computed, styles } = fixture(
		"#target{text-transform:uppercase;text-transform:none lowercase}" +
			"@supports(text-transform:full-size-kana lowercase full-width){#target{text-transform:lowercase full-size-kana}}" +
			"@supports(text-transform:capitalize uppercase){#target{text-transform:capitalize}}",
	);
	expect(computed.textTransform).toBe("lowercase full-size-kana");
	expect(styles.metrics().issues["unimplemented-css-property"]).toBeUndefined();
	expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(1);
});

it.each([
	"\u00a0uppercase",
	"uppercase\u00a0",
	"\u000buppercase",
	"uppercase\ufeff",
	"full-size-Kana",
	"/* edge */\u00a0uppercase",
	"uppercase\u00a0/* edge */",
	"\u00a0var(--case)",
	"var(--case)\u00a0",
])(
	"preserves invalid keyword source through stylesheet dispatch: %j",
	(value) => {
		for (const priority of ["", " !IMPORTANT"]) {
			const { computed, styles } = fixture(
				`#parent{text-transform:lowercase}#target{--case:uppercase;text-transform:${value}${priority}}`,
			);
			expect(computed.textTransform).toBe("lowercase");
			if (!value.includes("var(")) {
				expect(
					declarations(`text-transform:${value}${priority}`).parsed,
				).toEqual([]);
				expect(
					cssSupportsDeclaration("text-transform", `${value}${priority}`),
				).toBe(false);
				expect(
					styles.metrics().issues["unimplemented-or-invalid-css-value"],
				).toBe(1);
			}
		}
	},
);

it.each(["", " !IMPORTANT", " ! /* priority */ ImPoRtAnT \t\r\n"])(
	"retains ASCII whitespace, comments and priority %j",
	(priority) => {
		const source = `\t\n /* edge */ FULL-WIDTH\r\fUPPERCASE /* edge */ ${priority}`;
		expect(declarations(`text-transform:${source}`)).toEqual({
			parsed: [
				{
					property: "text-transform",
					value: "uppercase full-width",
					important: priority !== "",
				},
			],
			issues: [],
		});
		expect(cssSupportsDeclaration("text-transform", source)).toBe(true);
	},
);

it("does not Unicode-fold adjacent declaration keywords", () => {
	expect(declarations("display:BLOCK").parsed).toEqual([]);
	expect(declarations("text-align:Kenter").parsed).toEqual([]);
	expect(declarations("display:BlOcK\t").parsed).toEqual([
		{ property: "display", value: "block", important: false },
	]);
});

it("retains custom values, quoted priority text and grid identifier casing", () => {
	expect(
		declarations('--Case:"K !important /* literal */" !IMPORTANT'),
	).toEqual({
		parsed: [
			{
				property: "--Case",
				value: '"K !important /* literal */"',
				important: true,
			},
		],
		issues: [],
	});
	expect(declarations("grid-row-start:CaseK !IMPORTANT")).toEqual({
		parsed: [{ property: "grid-row-start", value: "CaseK", important: true }],
		issues: [],
	});
});
