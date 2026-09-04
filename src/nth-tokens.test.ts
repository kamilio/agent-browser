import { afterEach, expect, it } from "vitest";
import { cssSupportsCondition } from "./css-parser.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(sheet = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}span{display:block;width:10px;height:2px;background:blue}${sheet}</style><main>${Array.from({ length: 7 }, (_, index) => `<span id=item${index + 1} class="${index % 2 === 0 ? "chosen" : "other"}"></span>`).join("\n<!-- sibling -->")}</main>`,
		"https://fixture.invalid/nth-tokens",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(100, 40);
	const queries = new DocumentQueries(tree);
	const items = queries.querySelectorAll("span");
	return { tree, queries, items };
}

it.each<[string, number[]]>([
	["odd", [1, 3, 5, 7]],
	["even", [2, 4, 6]],
	["2n+1", [1, 3, 5, 7]],
	["/**/2n/**/+/**/1/**/", [1, 3, 5, 7]],
	["2n/**/+1", [1, 3, 5, 7]],
	["2n/**/-1", [1, 3, 5, 7]],
	["2n-/**/1", [1, 3, 5, 7]],
	["2n/**/-/**/1", [1, 3, 5, 7]],
	["2n/* ) of :bad( */+1", [1, 3, 5, 7]],
	["n/**/+/**/3", [3, 4, 5, 6, 7]],
	["n-/**/3", [1, 2, 3, 4, 5, 6, 7]],
	["-n/**/+3", [1, 2, 3]],
	["-n/**/+/**/3", [1, 2, 3]],
	["+/**/n", [1, 2, 3, 4, 5, 6, 7]],
	["+/**/n-/**/1", [1, 2, 3, 4, 5, 6, 7]],
	["+/**/n-1", [1, 2, 3, 4, 5, 6, 7]],
	["\\6f dd", [1, 3, 5, 7]],
	["\\65 ven", [2, 4, 6]],
	["2\\6e +1", [1, 3, 5, 7]],
	["2\\6e-1", [1, 3, 5, 7]],
	["2n\\2d 1", [1, 3, 5, 7]],
	["2\\6e-\\31", [1, 3, 5, 7]],
	["\\6e +3", [3, 4, 5, 6, 7]],
	["-\\6e +3", [1, 2, 3]],
	["+\\6e +3", [3, 4, 5, 6, 7]],
	["+/**/\\6e +3", [3, 4, 5, 6, 7]],
	["-\\6e-1", []],
	["/**/+3/**/", [3]],
	["-0n/**/+3", [3]],
	["0n/**/+0", []],
	["2N/**/+1", [1, 3, 5, 7]],
	["\r\n2n\f+1\r", [1, 3, 5, 7]],
])(
	"matches tokenized An+B %s across all four nth variants",
	(formula, expected) => {
		const { queries, items } = fixture();
		for (const name of [
			"nth-child",
			"nth-of-type",
			"nth-last-child",
			"nth-last-of-type",
		]) {
			const selector = `span:${name}(${formula})`;
			const positions = name.includes("last")
				? expected
						.map((position) => 8 - position)
						.sort((left, right) => left - right)
				: expected;
			expect(queries.querySelectorAll(selector)).toEqual(
				positions.map((position) => items[position - 1]),
			);
			expect(cssSupportsCondition(`selector(${selector})`)).toBe(true);
		}
	},
);

it.each([
	"2/**/n",
	"1/**/2",
	"+/**/2n",
	"-/**/n",
	"+ /**/n",
	"+/**/ n",
	"n/**/1",
	"n-/**/+1",
	"n-/**/-1",
	"n/**/+/**/+1",
	"n/**/-/**/-1",
	"2n-/**/-1",
	"2n/**/+",
	"o/**/dd",
	"e/**/ven",
	"\\32 n",
	"\\2b n",
	"2.0n",
	"2e0n",
	"1e0",
	"1.0",
	"2n+1.0",
	"n+1e0",
	".5n",
	"2n+1%",
	"n\u00a0+1",
	"n+\u00a01",
	"\u00a0odd",
	"odd\u00a0",
	"+odd",
	"+-n",
	"2n-1/**/+2",
	"odd/**/+1",
	"n/**/of/**/",
	"n/**/of/**/.chosen,",
])(
	"rejects invalid token boundaries in %s without a false support claim",
	(formula) => {
		const { queries, tree } = fixture();
		const empty = tree.createElement("aside");
		const selector = `span:nth-child(${formula})`;
		expect(() => queries.querySelectorAll(selector, empty)).toThrow(
			"Invalid selector",
		);
		expect(cssSupportsCondition(`selector(${selector})`)).toBe(false);
	},
);

it.each([
	"2n/**/+1/**/of/**/.chosen",
	"2n+1 of.chosen",
	"2n+1/**/o\\66/**/.chosen",
	"2n+1 \\6f f .chosen",
	"2n+1/**/OF/**/:is(.chosen, #absent)",
])("filters siblings using the of token in %s", (formula) => {
	const { queries, items } = fixture();
	expect(queries.querySelectorAll(`span:nth-child(${formula})`)).toEqual([
		items[0],
		items[4],
	]);
	expect(queries.querySelectorAll(`span:nth-last-child(${formula})`)).toEqual([
		items[2],
		items[6],
	]);
	expect(
		queries.matchingSpecificities(`span:nth-child(${formula})`).get(items[0]),
	).toEqual(formula.includes("#absent") ? [1, 1, 1] : [0, 2, 1]);
	expect(() => queries.querySelector(`span:nth-of-type(${formula})`)).toThrow(
		"Invalid selector",
	);
});

it("keeps sibling filtering live across mutations and supports relational nesting", () => {
	const { queries, tree, items } = fixture();
	const selector = "span:nth-child(2/**/of/**/.chosen)";
	expect(queries.querySelector(selector)).toBe(items[2]);
	expect(queries.matches(items[2], selector)).toBe(true);
	expect(queries.closest(items[2], selector)).toBe(items[2]);
	expect(
		queries.querySelector("main:has(> span:nth-child(2/**/of/**/.chosen))"),
	).not.toBeNull();
	tree.setAttribute(items[0], "class", "other");
	expect(queries.querySelector(selector)).toBe(items[4]);
	tree.remove(items[4]);
	expect(queries.querySelector(selector)).toBe(items[6]);
});

it("shares tokenized formulas between feature queries, cascade, geometry and pixels", () => {
	const selector = "span:nth-child(2\\6e/**/+1/**/of/**/.chosen)";
	const { tree, queries, items } = fixture(
		`@supports selector(${selector}){${selector}{width:70px;background:red}}`,
	);
	const expected = fixture("#item1,#item5{width:70px;background:red}");
	expect(queries.querySelectorAll(selector)).toEqual([items[0], items[4]]);
	expect(documentGeometry(tree).getBoundingClientRect(items[0]).width).toBe(70);
	expect(documentGeometry(tree).getBoundingClientRect(items[1]).width).toBe(10);
	expect(rasterizeDocument(tree).image.pixels).toEqual(
		rasterizeDocument(expected.tree).image.pixels,
	);
});

it.each([
	"1000000001\\6e",
	"n-\\31 000000001",
	"2n/**/+1000000001",
	"-1000000001n/**/+2",
])("preserves numeric resource limits for %s", (formula) => {
	const { queries } = fixture();
	const selector = `span:nth-child(${formula})`;
	expect(() => queries.querySelectorAll(selector)).toThrow("numeric limit");
	expect(() => cssSupportsCondition(`not selector(${selector})`)).toThrow(
		"numeric limit",
	);
	expect(() =>
		cssSupportsCondition(`selector(div) or selector(${selector})`),
	).toThrow("numeric limit");
});

it("keeps syntax and execution budgets around tokenized formulas", () => {
	const { tree, queries } = fixture();
	expect(() =>
		queries.querySelector(`span:nth-child(n/*${"x".repeat(8192)}*/)`),
	).toThrow("text limit");
	expect(() =>
		new DocumentQueries(tree, { maxComponents: 2 }).querySelector(
			"span:nth-child(2/**/of/**/.chosen)",
		),
	).toThrow("component limit");
	expect(() =>
		new DocumentQueries(tree, { maxWork: 1 }).querySelectorAll(
			"span:nth-child(2/**/of/**/.chosen)",
		),
	).toThrow("limit");
	expect(
		queries.querySelectorAll("span:nth-child(1000000000n/**/+1)"),
	).toHaveLength(1);
});
