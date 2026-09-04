import { afterEach, expect, it } from "vitest";
import {
	declarationName,
	directDeclaration,
	inlineDeclarationComponents,
	parseInlineDeclarations,
	propertyPriority,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import {
	canonicalCssProperty,
	cssPropertyAliases,
} from "./css-property-aliases.js";
import { cssTextProperties } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { pageCssSupports } from "./page-css.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function declarations(source: string) {
	const issues: string[] = [];
	const values = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 20 },
		(issue) => issues.push(issue),
	);
	return { values, issues };
}

function fixture(css: string, inline = "") {
	const tree = parseHtmlDocument(
		`<style>main{font-size:8px;width:30px}${css}</style><main id="target" style="${inline}">ABCDEFGHI</main>`,
		"https://fixture.invalid/word-wrap",
	);
	trees.push(tree);
	const id = new DocumentQueries(tree).querySelector("#target");
	if (id === null) throw Error("Missing text fixture");
	return {
		tree,
		id,
		value: () => documentStyles(tree).text(id)["overflow-wrap"],
		lines: () => {
			const context = layoutDocumentText(tree).contexts.find(
				(entry) => entry.ref === tree.reference(id),
			);
			if (!context) throw Error("Missing text context");
			return context.lines.map((line) =>
				context.glyphs
					.slice(line.glyphStart, line.glyphEnd)
					.map((glyph) => glyph.character)
					.join(""),
			);
		},
		intrinsic: () =>
			measureIntrinsicWidths(tree).widths.find(
				(entry) => entry.ref === tree.reference(id),
			),
	};
}

it("maps only the exact legacy name without a second canonical longhand", () => {
	expect(canonicalCssProperty("word-wrap")).toBe("overflow-wrap");
	for (const name of [
		"overflow-wrap",
		"word-break",
		"WORD-WRAP",
		"wordWrap",
		"--word-wrap",
		"__proto__",
		"constructor",
	])
		expect(canonicalCssProperty(name)).toBe(name);
	expect(Object.isFrozen(cssPropertyAliases)).toBe(true);
	expect(cssTextProperties).not.toContain("word-wrap");
});

it.each([
	"normal",
	"anywhere",
	"break-word",
	"initial",
	"inherit",
	"unset",
	"revert",
])("parses word-wrap:%s directly into the canonical declaration", (value) => {
	expect(declarations(`WoRd-WrAp:${value}`)).toEqual({
		values: [{ property: "overflow-wrap", value, important: false }],
		issues: [],
	});
});

it("preserves custom names while canonicalizing ordinary declaration casing", () => {
	expect(declarationName("WORD-WRAP")).toBe("overflow-wrap");
	expect(declarationName("--Word-Wrap")).toBe("--Word-Wrap");
	expect(
		declarations("--word-wrap:anywhere;word-wrap:var(--word-wrap)").values,
	).toMatchObject([
		{ property: "--word-wrap", value: "anywhere" },
		{ property: "overflow-wrap", substitution: "overflow-wrap" },
	]);
});

it.each([
	["word-wrap:anywhere;overflow-wrap:normal", "normal", false],
	["overflow-wrap:normal;word-wrap:anywhere", "anywhere", false],
	["word-wrap:anywhere!important;overflow-wrap:normal", "anywhere", true],
	[
		"overflow-wrap:anywhere!important;word-wrap:normal!important",
		"normal",
		true,
	],
] as const)(
	"uses one inline cascade slot for %s",
	(source, value, important) => {
		const entries = parseInlineDeclarations(source, 10);
		expect(entries).toEqual([{ name: "overflow-wrap", value, important }]);
		expect(serializeDeclarations(entries)).toBe(
			`overflow-wrap: ${value}${important ? " !important" : ""};`,
		);
	},
);

it("canonicalizes direct variable-bearing declaration helper requests", () => {
	const entries = directDeclaration("word-wrap", "var(--mode)", true);
	expect(entries).toEqual([
		{ name: "overflow-wrap", value: "var(--mode)", important: true },
	]);
	expect(entries).toEqual(
		directDeclaration("overflow-wrap", "var(--mode)", true),
	);
	expect(inlineDeclarationComponents("word-wrap")).toEqual(["overflow-wrap"]);
	expect(propertyValue(entries, "word-wrap")).toBe("var(--mode)");
	expect(propertyPriority(entries, "word-wrap")).toBe("important");
});

it.each(["break-all", "10px", "anywhere normal", ""])(
	"rejects invalid alias value %j without a second slot",
	(value) => {
		expect(
			parseInlineDeclarations(`overflow-wrap:anywhere;word-wrap:${value}`, 10),
		).toEqual([{ name: "overflow-wrap", value: "anywhere", important: false }]);
		expect(pageCssSupports("word-wrap", value)).toBe(false);
	},
);

it.each(["normal", "anywhere", "break-word"])(
	"reports support for alias %s in both query forms",
	(value) => {
		expect(pageCssSupports("word-wrap", value)).toBe(true);
		expect(pageCssSupports(`(word-wrap: ${value})`)).toBe(true);
	},
);

it("uses alias declarations and supports conditions for actual emergency layout", () => {
	const test = fixture(
		"main{overflow-wrap:normal}@supports(word-wrap:anywhere){main{word-wrap:anywhere}}",
	);
	expect(test.value()).toBe("anywhere");
	expect(test.lines()).toEqual(["ABCDE", "FGHI"]);
	expect(test.intrinsic()).toMatchObject({ minContent: 6, maxContent: 54 });
});

it("preserves break-word sizing and canonical/alias mutation precedence", () => {
	const test = fixture("main{word-wrap:anywhere}", "word-wrap:break-word");
	expect(test.value()).toBe("break-word");
	expect(test.lines()).toEqual(["ABCDE", "FGHI"]);
	expect(test.intrinsic()).toMatchObject({ minContent: 54, maxContent: 54 });
	test.tree.setAttribute(
		test.id,
		"style",
		"word-wrap:anywhere;overflow-wrap:normal",
	);
	expect(test.lines()).toEqual(["ABCDEFGHI"]);
});
