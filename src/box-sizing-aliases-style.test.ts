import { afterEach, expect, it } from "vitest";
import { cssBoxProperties } from "./css-box.js";
import { declarationName } from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import { canonicalCssProperty } from "./css-property-aliases.js";
import type { DocumentTree } from "./document.js";
import { layoutDocument, type DocumentLayout } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { parseHtmlDocument } from "./html-parser.js";
import { pageCssSupports } from "./page-css.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const aliases = ["-moz-box-sizing", "-webkit-box-sizing"] as const;
const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
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

function fixture(css = "", inline = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">html,body{margin:0;padding:0;font-family:"Agent Mono";font-size:8px;line-height:10px}#outer{width:100px}${css}</style><main id="outer"><div id="target" style="${inline}"></div></main>`,
		"https://fixture.invalid/box-sizing-aliases",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(128, 96);
	return { tree, styles, id, value: () => styles.box(id())["box-sizing"] };
}

function elementBox(layout: DocumentLayout, tree: DocumentTree, owner: number) {
	const found = layout.boxes.find((box) => box.ref === tree.reference(owner));
	if (!found) throw new Error("Missing element box");
	return found;
}

function pseudoBox(layout: DocumentLayout, owner: number) {
	const node = layout.text.horizontal.formatting.nodes.find(
		(entry) =>
			entry.generatedContent?.owner === owner &&
			entry.generatedContent.name === "before" &&
			entry.kind !== "text",
	);
	const found = node && layout.boxes.find((box) => box.id === node.id);
	if (!found) throw new Error("Missing generated ::before box");
	return found;
}

function dimensions(box: DocumentLayout["boxes"][number]) {
	return {
		borderX: box.borderX,
		borderY: box.borderY,
		borderBoxWidth: box.borderBoxWidth,
		borderBoxHeight: box.borderBoxHeight,
		contentX: box.contentX,
		contentY: box.contentY,
		contentWidth: box.contentWidth,
		contentHeight: box.contentHeight,
	};
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("maps only exact legacy CSS names without adding box longhands", () => {
	for (const alias of aliases) {
		expect(canonicalCssProperty(alias)).toBe("box-sizing");
		expect(cssBoxProperties).not.toContain(alias);
	}
	for (const name of [
		"box-sizing",
		"-MOZ-BOX-SIZING",
		"-WEBKIT-BOX-SIZING",
		"MozBoxSizing",
		"WebkitBoxSizing",
		"webkitBoxSizing",
		"--moz-box-sizing",
		"__proto__",
		"constructor",
	])
		expect(canonicalCssProperty(name)).toBe(name);
	expect(canonicalCssProperty("word-wrap")).toBe("overflow-wrap");
	expect(cssBoxProperties.filter((name) => name === "box-sizing")).toHaveLength(
		1,
	);
});

it.each(
	aliases.flatMap((alias) =>
		["content-box", "border-box", "initial", "inherit", "unset", "revert"].map(
			(value) => ({ alias, value }),
		),
	),
)("parses $alias:$value into the canonical declaration", ({ alias, value }) => {
	expect(declarations(`${alias.toUpperCase()}:${value.toUpperCase()}`)).toEqual(
		{
			values: [{ property: "box-sizing", value, important: false }],
			issues: [],
		},
	);
});

it.each(aliases)("preserves custom property spelling beside %s", (alias) => {
	expect(declarationName(alias.toUpperCase())).toBe("box-sizing");
	expect(declarationName(`-${alias}`)).toBe(`-${alias}`);
	expect(declarations(`-${alias}:border-box;${alias}:var(-${alias})`)).toEqual({
		values: [
			{ property: `-${alias}`, value: "border-box", important: false },
			{
				property: "box-sizing",
				value: `var(-${alias})`,
				important: false,
				substitution: "box-sizing",
			},
		],
		issues: [],
	});
});

it.each(
	aliases.flatMap((alias) => [
		{
			alias,
			css: `#target{${alias}:border-box;box-sizing:content-box}`,
			inline: "",
			expected: "content-box",
		},
		{
			alias,
			css: `#target{box-sizing:content-box;${alias}:border-box}`,
			inline: "",
			expected: "border-box",
		},
		{
			alias,
			css: `#target{${alias}:border-box}div{box-sizing:content-box}`,
			inline: "",
			expected: "border-box",
		},
		{
			alias,
			css: `#target{${alias}:border-box}#target{box-sizing:content-box}`,
			inline: "",
			expected: "content-box",
		},
		{
			alias,
			css: `#target{${alias}:border-box!important}`,
			inline: "box-sizing:content-box",
			expected: "border-box",
		},
		{
			alias,
			css: "#target{box-sizing:content-box!important}",
			inline: `${alias}:border-box!important`,
			expected: "border-box",
		},
	]),
)(
	"cascades $alias with canonical specificity/order/priority: $css $inline",
	({ css, inline, expected }) => {
		expect(fixture(css, inline).value()).toBe(expected);
	},
);

it.each(
	aliases.flatMap((alias) =>
		["", "initial", "inherit", "unset", "revert"].map((keyword) => ({
			alias,
			keyword,
		})),
	),
)(
	"computes non-inherited $alias with keyword '$keyword'",
	({ alias, keyword }) => {
		const test = fixture(
			`#outer{${alias}:border-box}#target{${keyword ? `${alias}:${keyword}` : ""}}`,
		);
		expect(test.styles.box(test.id("#outer"))["box-sizing"]).toBe("border-box");
		expect(test.value()).toBe(
			keyword === "inherit" ? "border-box" : "content-box",
		);
	},
);

it.each(
	aliases.flatMap((alias) => [
		{
			alias,
			custom: "--mode:border-box",
			value: "var(--mode)",
			expected: "border-box",
		},
		{
			alias,
			custom: "",
			value: "var(--missing, border-box)",
			expected: "border-box",
		},
		{
			alias,
			custom: "",
			value: "var(--missing, var(--other, border-box))",
			expected: "border-box",
		},
		{
			alias,
			custom: "",
			value: "var(--missing)",
			expected: "content-box",
		},
		{
			alias,
			custom: "--mode:padding-box",
			value: "var(--mode, border-box)",
			expected: "content-box",
		},
	]),
)(
	"resolves $alias:$value with '$custom'",
	({ alias, custom, value, expected }) => {
		const previous = expected === "content-box" ? "border-box" : "content-box";
		const test = fixture(
			`#outer{${custom}}#target{box-sizing:${previous};${alias}:${value}}`,
		);
		expect(test.value()).toBe(expected);
	},
);

it.each(aliases)(
	"invalidates stylesheet and inline layout for %s mutations",
	(alias) => {
		const test = fixture(
			`#target{width:60px;padding:4px 6px;${alias}:border-box}`,
		);
		const width = () =>
			elementBox(layoutDocument(test.tree), test.tree, test.id())
				.borderBoxWidth;
		expect(width()).toBe(60);
		test.tree.setTextContent(
			test.id("#sheet"),
			`#target{width:60px;padding:4px 6px;${alias}:content-box}`,
		);
		expect(test.value()).toBe("content-box");
		expect(width()).toBe(72);
		test.tree.setAttribute(
			test.id(),
			"style",
			`${alias}:border-box;box-sizing:content-box`,
		);
		expect(width()).toBe(72);
		test.tree.setAttribute(
			test.id(),
			"style",
			`box-sizing:content-box;${alias}:border-box`,
		);
		expect(test.value()).toBe("border-box");
		expect(width()).toBe(60);
		test.tree.removeAttribute(test.id(), "style");
		expect(width()).toBe(72);
	},
);

it.each(aliases)(
	"supports %s through native queries and applied conditions",
	(alias) => {
		for (const value of [
			"content-box",
			"border-box",
			"initial",
			"inherit",
			"unset",
			"revert",
		]) {
			expect(pageCssSupports(alias.toUpperCase(), value)).toBe(true);
			expect(pageCssSupports(`(${alias}: ${value})`)).toBe(true);
		}
		const test = fixture(
			`#target{width:60px;padding:6px}@supports(${alias}:border-box){#target{${alias}:border-box}}`,
		);
		expect(test.value()).toBe("border-box");
		expect(
			elementBox(layoutDocument(test.tree), test.tree, test.id())
				.borderBoxWidth,
		).toBe(60);
	},
);

it.each(
	aliases.flatMap((alias) =>
		["padding-box", "fill", "12px", "border-box content-box"].map((value) => ({
			alias,
			value,
		})),
	),
)(
	"rejects $alias:$value without displacing valid sizing",
	({ alias, value }) => {
		expect(declarations(`${alias}:${value}`)).toEqual({
			values: [],
			issues: ["unimplemented-or-invalid-css-value"],
		});
		expect(pageCssSupports(alias, value)).toBe(false);
		expect(pageCssSupports(`(${alias}:${value})`)).toBe(false);
		expect(
			fixture(`#target{box-sizing:border-box;${alias}:${value}}`).value(),
		).toBe("border-box");
	},
);

it.each([
	"-ms-box-sizing",
	"-o-box-sizing",
	"-webkit-box-sizing-extra",
	"-moz-padding",
])("keeps the unknown vendor property %s unsupported", (property) => {
	expect(canonicalCssProperty(property)).toBe(property);
	expect(declarations(`${property}:border-box`)).toEqual({
		values: [],
		issues: ["unimplemented-css-property"],
	});
	expect(pageCssSupports(property, "border-box")).toBe(false);
	expect(pageCssSupports(`(${property}:border-box)`)).toBe(false);
});

it.each(aliases)(
	"retains real unsupported diagnostics beside valid %s",
	(alias) => {
		const test = fixture(
			`#target{${alias}:border-box;-ms-box-sizing:border-box;animation-name:spin}`,
		);
		expect(test.value()).toBe("border-box");
		expect(test.styles.metrics().issues["unimplemented-css-property"]).toBe(2);
	},
);

it("charges every alias statement to the existing parser declaration limit", () => {
	const budget = { rules: 0, declarations: 0, maxRules: 2, maxDeclarations: 2 };
	expect(
		parseCssDeclarations(
			"-moz-box-sizing:border-box;-webkit-box-sizing:content-box",
			budget,
			() => {},
		),
	).toHaveLength(2);
	expect(budget.declarations).toBe(2);
	expect(() =>
		parseCssDeclarations("box-sizing:border-box", budget, () => {}),
	).toThrow("declaration limit");
});

const sizingCases = aliases.flatMap((alias) =>
	["content-box", "border-box"].map((sizing) => ({ alias, sizing })),
);

it.each(sizingCases)(
	"measures and paints $alias:$sizing like canonical sizing without read mutations",
	({ alias, sizing }) => {
		const css =
			"#target{width:60px;height:40px;padding:4px 6px;border:2px solid blue;background:red}";
		const source = ` ${alias}: ${sizing} !important; `;
		const test = fixture(css, source);
		const control = fixture(css, `box-sizing:${sizing}!important`);
		const revision = test.tree.revision;
		const count = test.tree.nodeCount;
		const stylesheet = test.tree.textContent(test.id("#sheet"));
		const raster = rasterizeDocument(test.tree);
		const canonical = rasterizeDocument(control.tree);
		const box = elementBox(raster.layout, test.tree, test.id());
		expect(test.value()).toBe(sizing);
		expect(box).toMatchObject({
			borderX: 0,
			borderY: 0,
			contentX: 8,
			contentY: 6,
			paddingLeft: 6,
			paddingRight: 6,
			paddingTop: 4,
			paddingBottom: 4,
			borderLeft: 2,
			borderRight: 2,
			borderTop: 2,
			borderBottom: 2,
			contentWidth: sizing === "border-box" ? 44 : 60,
			contentHeight: sizing === "border-box" ? 28 : 40,
			borderBoxWidth: sizing === "border-box" ? 60 : 76,
			borderBoxHeight: sizing === "border-box" ? 40 : 52,
		});
		expect(dimensions(box)).toEqual(
			dimensions(elementBox(canonical.layout, control.tree, control.id())),
		);
		expect(raster.image.width).toBe(128);
		expect(raster.image.height).toBe(96);
		expect(raster.image.pixels).toEqual(canonical.image.pixels);
		expect(pixel(raster.image, 0, 0)).toEqual([0, 0, 255, 255]);
		expect(pixel(raster.image, 3, 3)).toEqual([255, 0, 0, 255]);
		expect(test.tree.get(test.id()).attributes.style).toBe(source);
		expect(test.tree.textContent(test.id("#sheet"))).toBe(stylesheet);
		expect(test.tree.revision).toBe(revision);
		expect(test.tree.nodeCount).toBe(count);
	},
);

it.each(sizingCases)(
	"measures and paints generated $alias:$sizing boxes",
	({ alias, sizing }) => {
		const css =
			'#target{width:80px}#target::before{content:"X";display:block;width:30px;height:20px;padding:2px 4px;border:1px solid blue;background:yellow}';
		const test = fixture(`${css}*,*::before,*::after{${alias}:${sizing}}`);
		const control = fixture(`${css}*,*::before,*::after{box-sizing:${sizing}}`);
		const revision = test.tree.revision;
		const count = test.tree.nodeCount;
		const stylesheet = test.tree.textContent(test.id("#sheet"));
		const raster = rasterizeDocument(test.tree);
		const canonical = rasterizeDocument(control.tree);
		const box = pseudoBox(raster.layout, test.id());
		expect(
			test.styles.generatedContent(test.id(), "before")?.box["box-sizing"],
		).toBe(sizing);
		expect(box).toMatchObject({
			borderX: 0,
			borderY: 0,
			contentX: 5,
			contentY: 3,
			paddingLeft: 4,
			paddingRight: 4,
			paddingTop: 2,
			paddingBottom: 2,
			borderLeft: 1,
			borderRight: 1,
			borderTop: 1,
			borderBottom: 1,
			contentWidth: sizing === "border-box" ? 20 : 30,
			contentHeight: sizing === "border-box" ? 14 : 20,
			borderBoxWidth: sizing === "border-box" ? 30 : 40,
			borderBoxHeight: sizing === "border-box" ? 20 : 26,
		});
		expect(dimensions(box)).toEqual(
			dimensions(pseudoBox(canonical.layout, control.id())),
		);
		expect(
			raster.layout.contexts.flatMap((context) => context.glyphs),
		).toMatchObject([{ character: "X", advance: 6 }]);
		expect(raster.image.pixels).toEqual(canonical.image.pixels);
		expect(pixel(raster.image, 0, 0)).toEqual([0, 0, 255, 255]);
		expect(pixel(raster.image, 2, 2)).toEqual([255, 255, 0, 255]);
		expect(test.tree.textContent(test.id("#sheet"))).toBe(stylesheet);
		expect(test.tree.get(test.id()).children).toEqual([]);
		expect(test.tree.revision).toBe(revision);
		expect(test.tree.nodeCount).toBe(count);
	},
);
