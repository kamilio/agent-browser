import { afterEach, expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import {
	htmlListStyleType,
	parseListInteger,
	resolveListOrdinals,
} from "./list-ordinals.js";
import { DocumentQueries } from "./selectors.js";

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string) {
	const tree = parseHtmlDocument(
		`<!doctype html>${markup}`,
		"https://fixture.invalid/lists",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing list fixture element");
		return found;
	};
	const items = new Set(queries.querySelectorAll("li,.item"));
	const boxes = new Set([...tree.walk()].map(({ node }) => node.id));
	const values = () => [
		...resolveListOrdinals(tree, items, boxes, () => {}).values(),
	];
	return { tree, id, items, boxes, values };
}

it.each([
	[undefined, undefined],
	["", undefined],
	["  \n", undefined],
	["x12", undefined],
	["+", undefined],
	["- 1", undefined],
	["\v1", undefined],
	["１２", undefined],
	["  +12tail", 12],
	["-0", 0],
	["-12.5", -12],
	["1e3", 1],
	["0x10", 0],
	["000004", 4],
	["9007199254740991", Number.MAX_SAFE_INTEGER],
] as const)("parses bounded HTML list integer %s", (input, expected) => {
	expect(parseListInteger(input, () => {})).toBe(expected);
});

it.each([
	"9007199254740992",
	"-9007199254740992",
	"9".repeat(16384),
	" ".repeat(16385),
])("rejects unrepresentable or oversized list integer input", (input) => {
	expect(() => parseListInteger(input, () => {})).toThrow(/limit exceeded/);
});

it.each([
	["", "", [1, 2, 3]],
	["start=-2", "", [-2, -1, 0]],
	["start=+5junk", "", [5, 6, 7]],
	["reversed", "", [3, 2, 1]],
	["reversed start=10", "", [10, 9, 8]],
	["", "value=7", [1, 7, 8]],
	["reversed", "value=0", [3, 0, -1]],
	["start=bad", "value=bad", [1, 2, 3]],
])("numbers owned rendered items (%s / %s)", (attributes, middle, expected) => {
	const test = fixture(
		`<ol ${attributes}><li>A</li><li ${middle}>B</li><li>C</li></ol>`,
	);
	expect(test.values()).toEqual(expected);
});

it("keeps nested list owners independent and uses tree order", () => {
	const test = fixture(
		"<ol start=5><li id=outer>A<ul><li id=inner>B</li></ul></li><li id=last>C</li></ol>",
	);
	const values = resolveListOrdinals(
		test.tree,
		new Set([...test.items].reverse()),
		test.boxes,
		() => {},
	);
	expect(values.get(test.id("#outer"))).toBe(5);
	expect(values.get(test.id("#inner"))).toBe(1);
	expect(values.get(test.id("#last"))).toBe(6);
});

it("counts rendered list-items, including markerless items, but not non-rendered items", () => {
	const test = fixture(
		"<ol reversed><li id=one>A</li><li id=hidden>B</li><li id=none>C</li><li id=last>D</li></ol>",
	);
	test.items.delete(test.id("#hidden"));
	expect(test.values()).toEqual([3, 2, 1]);
	const targets = new Set([test.id("#one"), test.id("#last")]);
	expect([
		...resolveListOrdinals(
			test.tree,
			test.items,
			test.boxes,
			() => {},
			targets,
		).values(),
	]).toEqual([3, 1]);
});

it("lets non-li list-items advance a reversed list without setting its default start", () => {
	const test = fixture(
		"<ol reversed><li>A</li><div class=item>B</div><li>C</li></ol>",
	);
	expect(test.values()).toEqual([2, 1, 0]);
});

it("uses the closest box-producing ancestor when the list has no box", () => {
	const test = fixture(
		"<div id=box><ol id=list start=20 reversed><li>A</li><li>B</li></ol></div>",
	);
	test.boxes.delete(test.id("#list"));
	expect(test.values()).toEqual([1, 2]);
});

it("supports rendered list items without an ol ancestor", () => {
	const test = fixture(
		"<div><span class=item>A</span><span class=item>B</span></div>",
	);
	expect(test.values()).toEqual([1, 2]);
});

it("avoids unrelated nonnumeric owners and stops after the last requested marker", () => {
	const test = fixture(
		"<ol start=9007199254740992><li>Other</li></ol><ol><li id=one>A</li><li value=9007199254740992>B</li></ol>",
	);
	expect([
		...resolveListOrdinals(
			test.tree,
			test.items,
			test.boxes,
			() => {},
			new Set([test.id("#one")]),
		).values(),
	]).toEqual([1]);
});

it("allows the last safe ordinal but rejects displaying an imprecise successor", () => {
	const test = fixture(
		"<ol start=9007199254740991><li id=one>A</li><li id=two>B</li></ol>",
	);
	expect(() => test.values()).toThrow("precision limit exceeded");
	test.tree.setAttribute(test.id("#two"), "value", "0");
	expect(test.values()).toEqual([Number.MAX_SAFE_INTEGER, 0]);
});

it("recomputes values after DOM mutations without retained ordinal state", () => {
	const test = fixture("<ol id=list><li>A</li><li id=two>B</li></ol>");
	expect(test.values()).toEqual([1, 2]);
	test.tree.setAttribute(test.id("#list"), "reversed", "");
	expect(test.values()).toEqual([2, 1]);
	test.tree.setAttribute(test.id("#two"), "value", "8");
	expect(test.values()).toEqual([2, 8]);
});

it.each([
	["ol", undefined, "decimal"],
	["ol", "1", "decimal"],
	["ol", "a", "lower-alpha"],
	["ol", "A", "upper-alpha"],
	["ol", "i", "lower-roman"],
	["ol", "I", "upper-roman"],
	["ol", "constructor", "decimal"],
	["ul", undefined, "disc"],
	["menu", undefined, "disc"],
	["li", undefined, undefined],
	["li", "1", "decimal"],
])("exposes HTML list defaults for %s type=%s", (tag, type, expected) => {
	const test = fixture(
		`<${tag} id=target${type === undefined ? "" : ` type=${type}`}></${tag}>`,
	);
	expect(htmlListStyleType(test.tree.get(test.id("#target")))).toBe(expected);
});

it("propagates work, stale-target and lifecycle failures", () => {
	const test = fixture("<ol><li>A</li></ol>");
	expect(() =>
		resolveListOrdinals(test.tree, test.items, test.boxes, () => {
			throw new Error("work limit");
		}),
	).toThrow("work limit");
	expect(() =>
		resolveListOrdinals(
			test.tree,
			test.items,
			test.boxes,
			() => {},
			new Set([9999]),
		),
	).toThrow("not rendered");
	test.tree.close();
	expect(() => test.values()).toThrow();
});
