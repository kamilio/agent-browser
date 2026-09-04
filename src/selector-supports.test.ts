import { afterEach, expect, it } from "vitest";
import { cssSupportsCondition } from "./css-parser.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { PageBindings } from "./page-bindings.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Css {
	supports(...args: unknown[]): boolean;
}
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(sheet = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}#target{display:block;width:20px;height:10px;background:blue}${sheet}</style><div id=target><span class=item></span></div>`,
		"https://fixture.invalid/selector-supports",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 40);
	const bindings = new PageBindings(
		{ document: tree, interactions: documentInteractions(tree) },
		{
			createHostObject(definition) {
				const object = Object.create(null);
				for (const [name, property] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(object, name, property);
				for (const [name, value] of Object.entries(definition.methods ?? {}))
					Object.defineProperty(object, name, { value });
				return object;
			},
			retainGuestArguments: (operation) => operation,
			releaseGuestReference: () => {},
		},
		{
			isClosed: () => false,
			startCallback: () => {
				throw new Error("No callback expected");
			},
			fail: () => {
				throw new Error("No lifecycle failure expected");
			},
			onConsoleCall: () => {},
		},
	);
	const queries = new DocumentQueries(tree);
	const target = queries.querySelector("#target");
	if (target === null) throw new Error("Missing target");
	return { tree, bindings, queries, target, css: bindings.globals.CSS as Css };
}

it.each([
	["div", true],
	["main > div.item + aside", true],
	["#does-not-exist", true],
	[".one.two", true],
	["#\\38 tile", true],
	["[data-mode='A b' i]", true],
	[":is(.one, #two)", true],
	[":where(div, span)", true],
	[":not(.skip)", true],
	[":has(> span)", true],
	["div:has(+ aside)", true],
	[":nth-child(2n + 1 of .item, #target)", true],
	[":nth-last-child(2 of :is(.a, .b))", true],
	[":scope", true],
	[":root", true],
	[":checked", true],
	[":hover", true],
	[":visited", true],
	[".表🦊", true],
	[".a/**/.b", true],
	["div /**/ span", true],
	["/*before*/div/*after*/", true],
	["[data-note='/* ) */']", true],
	["", false],
	["div, span", false],
	["> div", false],
	["div >", false],
	["::before", false],
	["::-webkit-unknown-feature", false],
	[":is(div, :unknown-feature)", false],
	[":where(.known, :unknown-feature)", false],
	[":is(div,)", false],
	[":has(:has(.nested))", false],
	[":has(:scope)", false],
	[":nth-of-type(2 of .item)", false],
	[":focus-visible", false],
	["ns|div", false],
	["[x|name]", false],
	["*|div", false],
	["col || td", false],
	["div/**/span", false],
	[".a/**/b", false],
	[":nth-child(2/**/n)", false],
	["(.item)", false],
	['"div"', false],
])(
	"reports native support for the single selector %s",
	(selector, expected) => {
		expect(cssSupportsCondition(`selector(${selector})`, true)).toBe(expected);
	},
);

it.each([
	["SELECTOR(div)", true],
	["sel\\65 ctor(div)", true],
	["selector/**/(div)", false],
	["selector(div) trailing", false],
	["not selector(:is(div, :unknown-feature))", true],
	["selector(:has(> span)) and (display:flex)", true],
	["(selector(.item) or (display:grid)) and (width:1px)", true],
	["not selector(:unsupported) and (width:1px)", false],
	["future(selector(div))", false],
])("composes selector features in %s", (source, expected) => {
	expect(cssSupportsCondition(source, true)).toBe(expected);
});

it("tests support without querying elements, populating indexes or mutating state", () => {
	const { tree, css } = fixture();
	const queries = new DocumentQueries(tree, {
		maxIndexedNodes: 1,
		maxResults: 1,
	});
	const before = queries.metrics();
	const revision = tree.revision;
	for (const source of [":has(> .absent)", ":hover", ":checked", "#absent"]) {
		expect(css.supports(`selector(${source})`)).toBe(true);
		expect(queries.metrics()).toEqual(before);
	}
	expect(css.supports("selector", "div")).toBe(false);
	expect(tree.revision).toBe(revision);
});

it("uses the same selector grammar for support, DOM matching, layout and pixels", () => {
	const { tree, css, queries, target } = fixture(
		"@supports selector(:has(> span)){#target:has(>span){width:70px;background:red}}@supports selector(:unknown-feature){#target{width:99px}}",
	);
	expect(css.supports("selector(:has(>span))")).toBe(true);
	expect(queries.querySelector("#target:has(>span)")).toBe(target);
	expect(documentGeometry(tree).getBoundingClientRect(target).width).toBe(70);
	const expected = fixture("#target{width:70px;background:red}");
	expect(rasterizeDocument(tree).image.pixels).toEqual(
		rasterizeDocument(expected.tree).image.pixels,
	);
});

it("does not turn selector comments into new combinators in stylesheet tests", () => {
	const { tree, target } = fixture(
		"@supports selector(div/**/span){#target{width:99px}}@supports not selector(div/**/span){#target{width:65px}}",
	);
	expect(documentStyles(tree).box(target).width).toBe("65px");
});

it("rejects unsupported nested branches even when a supported branch could match", () => {
	const { tree, target } = fixture(
		"@supports selector(:is(div,:unknown-feature)){#target{width:99px}}@supports selector(:where(div,span)){#target{width:35px}}",
	);
	expect(documentStyles(tree).box(target).width).toBe("35px");
});

it.each([
	"a".repeat(8193),
	`/*${"x".repeat(8190)}*/div`,
	".a".repeat(257),
	`${":not(".repeat(17)}div${")".repeat(17)}`,
	":nth-child(1000000001)",
])(
	"propagates native selector resource limits instead of reporting unsupported",
	(selector) => {
		for (const source of [
			`selector(${selector})`,
			`not selector(${selector})`,
			`(width:1px) or selector(${selector})`,
			`(width:invalid) and selector(${selector})`,
		])
			expect(() => cssSupportsCondition(source, true)).toThrow("limit");
	},
);

it("retains support-query depth and condition budgets around selector tests", () => {
	expect(() =>
		cssSupportsCondition(Array(1025).fill("selector(div)").join(" or "), true),
	).toThrow("limit");
	expect(() =>
		cssSupportsCondition(
			`${"(".repeat(33)}selector(div)${")".repeat(33)}`,
			true,
		),
	).toThrow("limit");
});

it("retains declaration comments and rejects unbalanced selector contents", () => {
	const { css } = fixture();
	expect(css.supports("/**/not/**/(display:grid)/**/")).toBe(true);
	expect(css.supports("(width:/**/1px) and selector(div/**/.item)")).toBe(true);
	expect(css.supports("selector([data-note=')'])")).toBe(true);
	expect(css.supports("selector([data-note=')'])/*trailing")).toBe(true);
	expect(css.supports("selector(div/*unterminated)")).toBe(false);
	expect(css.supports("selector([data-note=')']) or (")).toBe(false);
});
