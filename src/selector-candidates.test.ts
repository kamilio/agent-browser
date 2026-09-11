import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles } from "./styles.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(source: string) {
	const tree = parseHtmlDocument(source, "https://fixture.invalid/candidates");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	return { tree, queries, id };
}

function expectSelection(
	queries: DocumentQueries,
	selector: string,
	expected: readonly number[],
	specificity?: readonly [number, number, number],
) {
	const result = queries.matchingSpecificities(selector);
	expect([...result.keys()]).toEqual(expected);
	expect(queries.querySelectorAll(selector)).toEqual(expected);
	for (const target of expected) {
		expect(queries.matches(target, selector)).toBe(true);
		if (specificity) expect(result.get(target)).toEqual(specificity);
	}
	return result;
}

it("keeps duplicate IDs and class tokens without duplicating results", () => {
	const { queries, id } = fixture(
		'<main><div id=shared class="item item"><span id=shared class=item></span></div><p id=other class=Item></p></main>',
	);
	const first = id("div");
	const second = id("span");
	for (let repeat = 0; repeat < 2; repeat++) {
		expectSelection(queries, "#shared", [first, second], [1, 0, 0]);
		expectSelection(queries, ".item.item", [first, second], [0, 2, 0]);
		expectSelection(queries, "#SHARED, .ITEM", []);
		expectSelection(queries, ".Item", [id("p")], [0, 1, 0]);
	}
});

it("tokenizes only ASCII class whitespace and preserves escaped identifiers", () => {
	const { tree, queries, id } = fixture("<div id=target></div><p></p>");
	const target = id("#target");
	const other = id("p");
	tree.setAttribute(target, "id", "123:part");
	tree.setAttribute(
		target,
		"class",
		" alpha\tbeta\ngamma\fdelta\repsilon  a:b 123 café ",
	);
	tree.setAttribute(other, "class", "alpha\u00a0beta gamma\vdelta");
	for (const selector of [
		".alpha",
		".beta",
		".gamma",
		".delta",
		".epsilon",
		String.raw`.a\:b`,
		String.raw`.\31 23`,
		String.raw`.caf\e9`,
	])
		expectSelection(queries, selector, [target], [0, 1, 0]);
	expectSelection(queries, String.raw`#\31 23\:part`, [target], [1, 0, 0]);
	expectSelection(queries, ".alpha\u00a0beta", [other], [0, 1, 0]);
	expectSelection(queries, String.raw`.gamma\b delta`, [other], [0, 1, 0]);
});

it("merges grouped candidates in document order with maximum matching specificity", () => {
	const { queries, id } = fixture(
		"<main><p id=first class=item></p><div id=second class=item></div><p id=third class=item></p></main>",
	);
	const first = id("#first");
	const second = id("#second");
	const third = id("#third");
	const result = expectSelection(
		queries,
		"#third, .item, #first.item, #missing, p, #third",
		[first, second, third],
	);
	expect([...result]).toEqual([
		[first, [1, 1, 0]],
		[second, [0, 1, 0]],
		[third, [1, 0, 0]],
	]);
	expectSelection(queries, "#third.missing, p.item", [first, third], [0, 1, 1]);
});

it.each([
	[".ancestor > .leaf", ["first", "second", "third"], [0, 2, 0]],
	["#ancestor .leaf", ["first", "nested", "second", "third"], [1, 1, 0]],
	["#first + .leaf", ["second"], [1, 1, 0]],
	["#first ~ .leaf", ["second", "third"], [1, 1, 0]],
	[".leaf > .leaf", ["nested"], [0, 2, 0]],
	[".ancestor > span.leaf[data-ready]", ["second"], [0, 3, 1]],
	[".ancestor .missing", [], [0, 2, 0]],
] as const)(
	"fully matches rightmost candidates for %s",
	(selector, names, specificity) => {
		const { queries, id } = fixture(
			"<main id=ancestor class=ancestor><div id=first class=leaf><span id=nested class=leaf></span></div>text<!--gap--><span id=second class=leaf data-ready></span><div id=third class=leaf></div></main><span id=outside class=leaf data-ready></span>",
		);
		expectSelection(
			queries,
			selector,
			names.map((name) => id(`#${name}`)),
			specificity,
		);
	},
);

it.each([
	[":is(#absent, .leaf)", ["first", "second", "third"], [1, 0, 0]],
	[":where(#first, .leaf)", ["first", "second", "third"], [0, 0, 0]],
	[":not(:not(.leaf))", ["first", "second", "third"], [0, 1, 0]],
	[":nth-child(2 of .leaf)", ["second"], [0, 2, 0]],
	[":nth-last-child(1 of .leaf)", ["third"], [0, 2, 0]],
	[":has(> .leaf)", ["parent"], [0, 1, 0]],
	[":has(+ .leaf)", ["first", "second"], [0, 1, 0]],
	["[data-pick]", ["second"], [0, 1, 0]],
	[".ancestor > *", ["first", "second", "third"], [0, 1, 0]],
] as const)(
	"retains unseeded logical, relational and attribute fallback for %s",
	(selector, names, specificity) => {
		const { queries, id } = fixture(
			"<main id=parent class=ancestor><p id=first class=leaf></p><p id=second class=leaf data-pick></p><p id=third class=leaf></p></main>",
		);
		expectSelection(
			queries,
			selector,
			names.map((name) => id(`#${name}`)),
			specificity,
		);
	},
);

it("does not lose unseeded branches when a selector group also has indexed branches", () => {
	const { queries, id } = fixture(
		"<p id=first data-pick></p><div id=second class=leaf></div>",
	);
	expectSelection(
		queries,
		".leaf, [data-pick]",
		[id("#first"), id("#second")],
		[0, 1, 0],
	);
	const all = queries.querySelectorAll("*");
	const result = expectSelection(queries, "#second, *", all);
	for (const target of all)
		expect(result.get(target)).toEqual(
			target === id("#second") ? [1, 0, 0] : [0, 0, 0],
		);
});

it("folds HTML type names without folding SVG or MathML names", () => {
	const { tree, queries, id } = fixture(
		"<lineargradient id=html></lineargradient><svg><lineargradient id=svg /></svg><math><mi id=math></mi></math>",
	);
	const html = id("#html");
	const svg = id("#svg");
	const math = id("#math");
	const lowerSvg = tree.createParserElement("lineargradient", {}, svgNamespace);
	const upperMath = tree.createParserElement("Mi", {}, mathmlNamespace);
	tree.append(id("svg"), lowerSvg);
	tree.append(id("math"), upperMath);
	for (let repeat = 0; repeat < 2; repeat++) {
		expectSelection(queries, "linearGradient", [html, svg], [0, 0, 1]);
		expectSelection(queries, "lineargradient", [html, lowerSvg], [0, 0, 1]);
		expectSelection(queries, "LINEARGRADIENT", [html], [0, 0, 1]);
		expectSelection(
			queries,
			String.raw`linear\47 radient`,
			[html, svg],
			[0, 0, 1],
		);
		expectSelection(queries, "mi", [math], [0, 0, 1]);
		expectSelection(queries, "Mi", [upperMath], [0, 0, 1]);
		expectSelection(queries, "MI", []);
	}
});

it("invalidates candidates after attribute changes, removal and reparenting", () => {
	const { tree, queries, id } = fixture(
		"<main id=left><p id=first class=leaf></p><p id=second class=leaf></p></main><aside id=right></aside>",
	);
	const left = id("#left");
	const right = id("#right");
	const first = id("#first");
	const second = id("#second");
	expectSelection(queries, ".leaf", [first, second]);
	tree.append(right, first);
	expectSelection(queries, ".leaf", [second, first]);
	expectSelection(queries, "#left > .leaf", [second]);
	tree.setAttribute(second, "class", "changed");
	tree.setAttribute(first, "id", "renamed");
	expectSelection(queries, ".leaf", [first]);
	expectSelection(queries, "#first", []);
	expectSelection(queries, "#renamed, .changed", [second, first]);
	tree.removeAttribute(first, "class");
	expectSelection(queries, ".leaf", []);
	tree.setAttribute(first, "class", "leaf");
	tree.remove(first);
	expectSelection(queries, ".leaf", []);
	expect(queries.matches(first, ".leaf")).toBe(true);
	expectSelection(queries, ".leaf", []);
	tree.append(left, first);
	expectSelection(queries, ".changed, .leaf", [second, first]);
});

it("keeps detached fragment indexes separate from document candidates", () => {
	const { tree, queries, id } = fixture(
		"<main><p id=connected class=leaf></p></main>",
	);
	const connected = id("#connected");
	const main = id("main");
	const fragment = tree.createFragment();
	const detached = tree.createElement("p", { class: "leaf" });
	tree.append(fragment, detached);
	expectSelection(queries, ".leaf", [connected]);
	expect(queries.querySelectorAll(".leaf", fragment)).toEqual([detached]);
	expect(queries.matches(detached, ".leaf")).toBe(true);
	expectSelection(queries, ".leaf", [connected]);
	tree.append(main, detached);
	expectSelection(queries, ".leaf", [connected, detached]);
	tree.append(fragment, connected);
	expect(queries.querySelectorAll(".leaf", fragment)).toEqual([connected]);
	expectSelection(queries, ".leaf", [detached]);
});

it("refreshes focus, pointer and control state without stale positive or negative matches", () => {
	const { tree, queries, id } = fixture(
		"<main class=panel><input id=first class=field type=checkbox><input id=second class=field type=checkbox></main>",
	);
	const first = id("#first");
	const second = id("#second");
	const panel = id("main");
	expectSelection(queries, ".field:focus", []);
	expectSelection(queries, ".field:checked", []);
	tree.setActiveElement(first, null, true);
	expectSelection(queries, ".field:focus", [first], [0, 2, 0]);
	expectSelection(queries, ".panel:focus-within", [panel], [0, 2, 0]);
	expectSelection(queries, ".field:focus-visible", [first]);
	tree.setFocusVisible(false);
	expectSelection(queries, ".field:focus-visible", []);
	tree.setActiveElement(second);
	expectSelection(queries, ".field:focus", [second]);
	tree.setControl(second, { checked: true });
	expectSelection(queries, ".field:checked", [second]);
	tree.setPointerState(first, first);
	expectSelection(queries, ".field:hover:active", [first], [0, 3, 0]);
	tree.setPointerState(second, null);
	expectSelection(queries, ".field:hover", [second]);
	expectSelection(queries, ".field:active", []);
	tree.setControl(second, { checked: false });
	tree.setActiveElement(null);
	expectSelection(
		queries,
		".field:checked, .field:focus, .panel:focus-within",
		[],
	);
});

it("recovers complete candidate results after a restrictive work budget fails", () => {
	const { queries, id } = fixture(
		`<main>${Array.from({ length: 24 }, (_, index) => `<p class="shared token-${index} filler another">${index}</p>`).join("")}<span id=last class="shared late"></span></main>`,
	);
	const last = id("#last");
	for (let repeat = 0; repeat < 2; repeat++) {
		expect(() => queries.matchingSpecificities(".shared, .late", 10)).toThrow(
			"work limit",
		);
		expectSelection(queries, ".late", [last], [0, 1, 0]);
		expectSelection(
			queries,
			".shared",
			queries.querySelectorAll(".shared"),
			[0, 1, 0],
		);
	}
	expect(() => queries.matchingSpecificities(".late", 1)).toThrow("work limit");
	expectSelection(queries, ".late", [last]);
});

it("falls back completely when aggregate candidate postings exceed the node cap", () => {
	const classes = Array.from(
		{ length: 12 },
		(_, index) => `token-${index}`,
	).join(" ");
	const { tree, id } = fixture(
		`<main>${Array.from({ length: 8 }, (_, index) => `<p id=item-${index} class="${classes} shared"></p>`).join("")}<span id=last class="late shared"></span></main>`,
	);
	const queries = new DocumentQueries(tree, { maxIndexedNodes: 32 });
	const all = Array.from({ length: 8 }, (_, index) => id(`#item-${index}`));
	const last = id("#last");
	for (let repeat = 0; repeat < 2; repeat++) {
		expectSelection(queries, ".shared", [...all, last], [0, 1, 0]);
		expectSelection(queries, ".token-11", all, [0, 1, 0]);
		expectSelection(queries, ".late, #item-0", [all[0], last]);
		expectSelection(queries, ".absent", []);
	}
	for (const target of all) tree.removeAttribute(target, "class");
	expectSelection(queries, ".shared", [last]);
	tree.setAttribute(all[0], "class", classes);
	expectSelection(queries, ".token-11, .late", [all[0], last]);
});

it("does not reuse an incomplete structural index after exceeding its node limit", () => {
	const { tree, id } = fixture("<main><p id=first class=leaf></p></main>");
	const first = id("#first");
	const main = id("main");
	const maxIndexedNodes = [...tree.walk()].length;
	const queries = new DocumentQueries(tree, { maxIndexedNodes });
	expectSelection(queries, ".leaf", [first]);
	const extra = tree.createElement("p", { class: "leaf" });
	tree.append(main, extra);
	expect(() => queries.matchingSpecificities(".leaf")).toThrow(
		"node index limit",
	);
	tree.remove(extra);
	expectSelection(queries, ".leaf", [first]);
});

it("enforces result limits without counting duplicate candidate postings or retaining partial results", () => {
	const { tree, id } = fixture(
		'<p id=first class="leaf leaf"></p><p id=second class=leaf></p><p id=third class=leaf></p>',
	);
	const first = id("#first");
	const second = id("#second");
	const third = id("#third");
	const queries = new DocumentQueries(tree, { maxResults: 2 });
	expect(() => queries.matchingSpecificities(".leaf, p, #first")).toThrow(
		"result limit",
	);
	expectSelection(
		queries,
		"#first, #first, #second",
		[first, second],
		[1, 0, 0],
	);
	tree.remove(third);
	expectSelection(queries, ".leaf, .leaf", [first, second], [0, 1, 0]);
});

it("handles a bounded class-heavy stylesheet within standard cascade budgets and reduces warm sparse-query work", () => {
	const rules = Array.from(
		{ length: 180 },
		(_, index) => `.utility-${index}{display:none}`,
	).join("");
	const nodes = Array.from(
		{ length: 1200 },
		(_, index) => `<div class="card card-body spacing-${index % 8}"></div>`,
	).join("");
	const { tree, queries, id } = fixture(
		`<style>${rules}.sparse{display:none}#target{display:block}</style><main>${nodes}<p id=target class=sparse></p><p id=hidden class=utility-179></p></main>`,
	);
	const target = id("#target");
	const hidden = id("#hidden");
	const styles = new DocumentStyles(tree);
	expect(styles.get(target)).toMatchObject({ display: "block", visible: true });
	expect(styles.get(hidden)).toMatchObject({ display: "none", visible: false });
	expect(styles.get(id(".card"))).toMatchObject({
		display: "block",
		visible: true,
	});
	expectSelection(queries, ".sparse", [target], [0, 1, 0]);
	const reference = queries.querySelectorAll(".sparse");
	const scanWork = queries.metrics().lastWork;
	for (let repeat = 0; repeat < 2; repeat++) {
		const result = queries.matchingSpecificities(".sparse");
		expect([...result]).toEqual([[target, [0, 1, 0]]]);
		expect([...result.keys()]).toEqual(reference);
		expect(queries.metrics().lastWork).toBeLessThan(scanWork);
	}
});

it.each(["queries", "tree"] as const)(
	"releases warmed indexes and rejects matching after %s closure",
	(owner) => {
		const { tree, queries, id } = fixture("<p id=target class=leaf></p>");
		expectSelection(queries, ".leaf", [id("#target")]);
		if (owner === "tree") tree.close();
		else queries.close();
		expect(queries.metrics()).toMatchObject({
			closed: true,
			cachedSelectors: 0,
			indexedNodes: 0,
		});
		expect(() => queries.matchingSpecificities(".leaf")).toThrow("closed");
		expect(() => queries.querySelectorAll(".leaf")).toThrow("closed");
		queries.close();
	},
);
