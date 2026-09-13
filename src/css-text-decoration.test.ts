import { afterEach, expect, it, vi } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import {
	inlineDeclarationComponents,
	inlineProperties,
	parseInlineDeclarations,
	propertyPriority,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import { cssSupportsDeclaration, parseCssDeclarations } from "./css-parser.js";
import {
	computeTextDecorationStyle,
	cssTextDecorationProperties,
	initialTextDecorationStyle,
	isCssTextDecorationProperty,
	parseTextDecorationDeclarations,
	parseTextDecorationValue,
	type CssTextDecorationProperty,
} from "./css-text-decoration.js";
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
	textDecorationLine: string;
	textDecorationStyle: string;
	textDecorationColor: string;
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
const documents: DocumentTree[] = [];
const querySets: DocumentQueries[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const queries of querySets.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><main id="parent"><span id="target">Decorated text</span><a href="#target">link</a><u>u</u><s>s</s><del>del</del></main>`,
		"https://fixture.invalid/text-decoration",
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
		inline: inlineStyles.get(id()) as Style,
		computed: computedStyles.get(id()) as Style,
		read: (name: string) => resolvedStyleValue(tree, id(), name),
	};
}

function declarations(source: string) {
	return parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 32, maxDeclarations: 256 },
		() => {},
	);
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

it.each([
	["none", "none"],
	["underline", "underline"],
	["overline", "overline"],
	["line-through", "line-through"],
	["overline underline", "underline overline"],
	["line-through underline", "underline line-through"],
	["line-through overline", "overline line-through"],
	["line-through overline underline", "underline overline line-through"],
	["\t UNDERLINE\nOVERLINE\fLINE-THROUGH ", "underline overline line-through"],
])("canonicalizes decoration lines %s", (value, expected) => {
	expect(parseTextDecorationValue("text-decoration-line", value)).toBe(
		expected,
	);
	expect(declarations(`text-decoration-line:${value}`)).toEqual([
		{ property: "text-decoration-line", value: expected, important: false },
	]);
	expect(
		propertyValue(
			parseInlineDeclarations(`text-decoration-line:${value}`, 10),
			"text-decoration-line",
		),
	).toBe(expected);
	expect(cssSupportsDeclaration("text-decoration-line", value)).toBe(true);
});

it("accepts all five-component shorthand orders with a balanced color function", () => {
	for (const parts of permutations([
		"underline",
		"overline",
		"line-through",
		"solid",
		"rgb(10 20 30 / 50%)",
	])) {
		const value = parts.join(" ");
		const expected = [
			{
				property: "text-decoration-line",
				value: "underline overline line-through",
			},
			{ property: "text-decoration-thickness", value: "auto" },
			{ property: "text-decoration-style", value: "solid" },
			{ property: "text-decoration-color", value: "rgba(10, 20, 30, 0.502)" },
		];
		expect(parseTextDecorationDeclarations("text-decoration", value)).toEqual(
			expected,
		);
		expect(declarations(`text-decoration:${value}!important`)).toEqual(
			expected.map((entry) => ({ ...entry, important: true })),
		);
		expect(
			propertyValue(
				parseInlineDeclarations(`text-decoration:${value}`, 10),
				"text-decoration",
			),
		).toBe("underline overline line-through solid rgba(10, 20, 30, 0.502)");
	}
});

it.each([
	["none", "none solid currentcolor"],
	["solid", "none solid currentcolor"],
	["red", "none solid red"],
	["currentcolor", "none solid currentcolor"],
	["overline", "overline solid currentcolor"],
	["red none", "none solid red"],
])("resets omitted shorthand components in %s", (value, expected) => {
	const entries = parseInlineDeclarations(
		`text-decoration:underline blue;text-decoration:${value}`,
		10,
	);
	expect(propertyValue(entries, "text-decoration")).toBe(expected);
	expect(
		propertyValue(
			parseInlineDeclarations(serializeDeclarations(entries), 10),
			"text-decoration",
		),
	).toBe(expected);
});

it.each(["initial", "inherit", "unset", "revert"])(
	"expands and serializes CSS-wide %s and all",
	(value) => {
		const expected = cssTextDecorationProperties.map((property) => ({
			property,
			value,
			important: false,
		}));
		expect(declarations(`text-decoration:${value}`)).toEqual(expected);
		expect(
			declarations(`all:${value}`).filter((entry) =>
				isCssTextDecorationProperty(entry.property),
			),
		).toEqual(expected);
		expect(
			propertyValue(
				parseInlineDeclarations(`text-decoration:${value}`, 10),
				"text-decoration",
			),
		).toBe(value);
	},
);

it.each([
	"",
	"none none",
	"none underline",
	"overline none",
	"underline underline",
	"underline solid underline",
	"blink",
	"underline blink",
	"dashed",
	"dotted",
	"double",
	"wavy",
	"solid solid",
	"red blue",
	"revert-layer",
	"inherit red",
	"initial underline",
	"unset solid",
	"revert overline",
	"2px 3px underline",
	"underline / red",
	"underline,overline",
	"url(red)",
	"calc(1px / 0)",
	"rgb(0 0 0) solid solid",
	"rgb(0 0 0 underline)",
	"rgb(0 0 0))",
	"rgb((0) 0 0)",
	"color(display-p3 1 0 0)",
	"none\u00a0solid",
])("rejects unsupported shorthand %s atomically", (value) => {
	expect(
		parseTextDecorationDeclarations("text-decoration", value),
	).toBeUndefined();
	expect(cssSupportsDeclaration("text-decoration", value)).toBe(false);
	expect(
		declarations(`text-decoration:overline red;text-decoration:${value}`),
	).toHaveLength(cssTextDecorationProperties.length);
	expect(
		propertyValue(
			parseInlineDeclarations(
				`text-decoration:overline red;text-decoration:${value}`,
				10,
			),
			"text-decoration",
		),
	).toBe("overline solid red");
});

it.each<[CssTextDecorationProperty, string]>([
	["text-decoration-line", "none underline"],
	["text-decoration-line", "underline underline"],
	["text-decoration-line", "solid"],
	["text-decoration-line", "blink"],
	["text-decoration-style", "none"],
	["text-decoration-style", "dashed"],
	["text-decoration-style", "dotted"],
	["text-decoration-style", "double"],
	["text-decoration-style", "wavy"],
	["text-decoration-color", "auto"],
	["text-decoration-color", "red blue"],
	["text-decoration-color", "url(red)"],
	["text-decoration-color", "revert-layer"],
])("rejects invalid %s: %s", (property, value) => {
	expect(parseTextDecorationValue(property, value)).toBeUndefined();
	expect(declarations(`${property}:${value}`)).toEqual([]);
	expect(parseInlineDeclarations(`${property}:${value}`, 10)).toEqual([]);
});

it("rejects oversized values before whitespace normalization", () => {
	const value = `underline${" ".repeat(4096)}overline`;
	for (const property of ["text-decoration", "text-decoration-line"]) {
		expect(parseTextDecorationDeclarations(property, value)).toBeUndefined();
		expect(declarations(`${property}:${value}`)).toEqual([]);
		expect(parseInlineDeclarations(`${property}:${value}`, 10)).toEqual([]);
	}
	for (const property of cssTextDecorationProperties)
		expect(
			parseTextDecorationValue(property, "x".repeat(4097)),
		).toBeUndefined();
});

it("advertises a separate group without extending inherited text styles", () => {
	const { styles, computed } = fixture();
	expect(Object.isFrozen(cssTextDecorationProperties)).toBe(true);
	expect(Object.isFrozen(initialTextDecorationStyle)).toBe(true);
	expect(inlineDeclarationComponents("text-decoration")).toEqual(
		cssTextDecorationProperties,
	);
	for (const property of cssTextDecorationProperties) {
		expect(inlineProperties).toContain(property);
		expect(computedStyleProperties).toContain(property);
		expect(cssTextProperties).not.toContain(property);
	}
	expect(styles.metrics().textDecorationProperties).toEqual(
		cssTextDecorationProperties,
	);
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 0)");
	expect(computed.textDecorationLine).toBe("none");
	expect(computed.textDecorationStyle).toBe("solid");
	expect(computed.textDecorationColor).toBe("rgb(0, 0, 0)");
});

it("does not inherit decoration and resolves currentcolor against each element", () => {
	const { styles, id, inline, computed } = fixture(
		"#parent{color:red;text-decoration:underline currentcolor}#target{color:blue}",
	);
	expect(styles.textDecoration(id("#parent"))["text-decoration-color"]).toBe(
		"rgb(255, 0, 0)",
	);
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 255)");
	inline.textDecoration = "inherit";
	expect(computed.textDecoration).toBe("underline solid rgb(255, 0, 0)");
	inline.textDecorationColor = "currentcolor";
	expect(computed.textDecoration).toBe("underline solid rgb(0, 0, 255)");
});

it.each(["initial", "unset", "revert"])(
	"resets non-inherited components for %s",
	(value) => {
		const { computed } = fixture(
			`#parent{color:red;text-decoration:underline red}#target{color:blue;text-decoration:${value}}`,
		);
		expect(computed.textDecoration).toBe("none solid rgb(0, 0, 255)");
	},
);

it("computes root inherit against initial values with its own color", () => {
	const { styles, id } = fixture("html{color:blue;text-decoration:inherit}");
	expect(styles.textDecoration(id("html"))).toEqual({
		"text-decoration-line": "none",
		"text-decoration-thickness": "auto",
		"text-decoration-style": "solid",
		"text-decoration-color": "rgb(0, 0, 255)",
	});
});

it.each([
	["transparent", "rgba(0, 0, 0, 0)"],
	["#1234", "rgba(17, 34, 51, 0.267)"],
	["hsl(120 100% 50%)", "rgb(0, 255, 0)"],
	["currentcolor", "rgba(12, 34, 56, 0.502)"],
])("preserves normal supported color computation for %s", (value, expected) => {
	expect(
		computeTextDecorationStyle(
			{ "text-decoration-color": value },
			initialTextDecorationStyle,
			[12, 34, 56, 128],
		)["text-decoration-color"],
	).toBe(expected);
});

it("resets shorthand components while preserving cascade and CSSOM priority", () => {
	const { inline, computed } = fixture(
		"#target{color:blue;text-decoration:underline red}",
	);
	inline.cssText = "text-decoration-color:red;text-decoration:overline";
	expect(computed.textDecoration).toBe("overline solid rgb(0, 0, 255)");
	inline.cssText =
		"text-decoration-color:red!important;text-decoration:line-through";
	expect(computed.textDecoration).toBe("line-through solid rgb(255, 0, 0)");
	expect(inline.textDecoration).toBe("");
	expect(inline.getPropertyPriority("text-decoration-color")).toBe("important");
	inline.setProperty("text-decoration", "underline blue", "important");
	expect(inline.textDecoration).toBe("underline solid blue");
	expect(inline.getPropertyPriority("text-decoration")).toBe("important");
	expect(inline.removeProperty("text-decoration")).toBe("underline solid blue");
	expect(computed.textDecoration).toBe("underline solid rgb(255, 0, 0)");
	const entries = parseInlineDeclarations(
		"text-decoration:inherit!important",
		10,
	);
	expect(propertyPriority(entries, "text-decoration")).toBe("important");
});

it("keeps important stylesheet declarations ahead of ordinary inline ones", () => {
	const { inline, computed } = fixture(
		"#target{text-decoration:overline red!important}",
	);
	inline.textDecoration = "underline blue";
	expect(computed.textDecoration).toBe("overline solid rgb(255, 0, 0)");
	inline.setProperty("text-decoration", "line-through blue", "important");
	expect(computed.textDecoration).toBe("line-through solid rgb(0, 0, 255)");
});

it("resolves case-sensitive custom properties at the decoration use site", () => {
	const { inline, computed } = fixture(
		"#parent{color:red;--Decoration:overline currentcolor}#target{color:blue;text-decoration:var(--Decoration)}",
	);
	expect(computed.textDecoration).toBe("overline solid rgb(0, 0, 255)");
	inline.textDecoration = "var(--Decoration)";
	expect(inline.textDecoration).toBe("var(--Decoration)");
	inline.setProperty("--Decoration", "line-through");
	expect(computed.textDecoration).toBe("line-through solid rgb(0, 0, 255)");
	inline.setProperty("--Tone", "red");
	inline.textDecorationColor = "var(--Tone)";
	expect(computed.textDecorationColor).toBe("rgb(255, 0, 0)");
	inline.cssText =
		"text-decoration:underline red;text-decoration:var(--decoration)";
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 255)");
});

it("does not revive earlier declarations after invalid variable substitution", () => {
	const { computed, styles, inline } = fixture(
		"#target{color:blue;--Decoration:wavy;text-decoration:underline red;text-decoration:var(--Decoration)}",
	);
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 255)");
	expect(styles.hasTextDecorations()).toBe(false);
	inline.textDecoration = "var(--Missing, underline currentcolor)";
	expect(computed.textDecoration).toBe("underline solid rgb(0, 0, 255)");
	expect(styles.hasTextDecorations()).toBe(true);
	inline.cssText = "all:initial;color:blue";
	expect(computed.textDecoration).toBe("none solid rgb(0, 0, 255)");
	expect(styles.hasTextDecorations()).toBe(false);
});

it("gates final specified lines without computing per-node decorations or UA defaults", () => {
	const { styles, inline, id } = fixture();
	const compute = vi.spyOn(styles, "textDecoration");
	const paint = vi.spyOn(styles, "paint");
	expect(styles.hasTextDecorations()).toBe(false);
	for (const value of [
		"none",
		"initial",
		"unset",
		"inherit",
		"revert",
		"solid red",
	]) {
		inline.textDecoration = value;
		expect(styles.hasTextDecorations()).toBe(false);
	}
	for (const value of [
		"underline",
		"overline",
		"line-through",
		"underline overline",
	]) {
		inline.textDecoration = value;
		expect(styles.hasTextDecorations()).toBe(true);
	}
	inline.cssText =
		"text-decoration:underline;text-decoration-line:none!important";
	expect(styles.hasTextDecorations()).toBe(false);
	expect(compute).not.toHaveBeenCalled();
	expect(paint).not.toHaveBeenCalled();
	for (const selector of ["a", "u", "s", "del"])
		expect(styles.textDecoration(id(selector))["text-decoration-line"]).toBe(
			"none",
		);
});

it("refreshes immutable cached styles and the gate on ancestor mutation and closure", () => {
	const { tree, styles, id, inline } = fixture(
		"#parent{color:red;text-decoration:underline}#target{color:blue;text-decoration:inherit}",
	);
	const before = styles.textDecoration(id());
	expect(Object.isFrozen(before)).toBe(true);
	expect(styles.textDecoration(id())).toBe(before);
	expect(styles.hasTextDecorations()).toBe(true);
	tree.setAttribute(id("#parent"), "style", "color:green;text-decoration:none");
	expect(styles.hasTextDecorations()).toBe(false);
	expect(styles.textDecoration(id())).toEqual({
		"text-decoration-line": "none",
		"text-decoration-thickness": "auto",
		"text-decoration-style": "solid",
		"text-decoration-color": "rgb(0, 128, 0)",
	});
	expect(before["text-decoration-line"]).toBe("underline");
	inline.textDecoration = "line-through";
	expect(styles.hasTextDecorations()).toBe(true);
	styles.close();
	expect(() => styles.textDecoration(id())).toThrow(/closed/);
	expect(() => styles.hasTextDecorations()).toThrow(/closed/);
});
