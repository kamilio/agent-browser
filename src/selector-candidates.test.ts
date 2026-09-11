import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	DocumentQueries,
	supportsCssSelector,
	validateSelectorSyntax,
} from "./selectors.js";
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

it("rejects absent direct ancestor and sibling keys without losing anchor semantics", () => {
	const { queries } = fixture(
		`<main class=present>${Array.from({ length: 96 }, (_, index) => `<a id=link-${index} href=#target></a>`).join("")}</main>`,
	);
	const anchors = queries.querySelectorAll("a");
	for (const selector of [
		".missing .present a",
		"#missing > .present a",
		"missing-element .present a",
		".present.missing a",
		"#missing + a",
		".missing ~ a",
		"missing-element + a",
	]) {
		expectSelection(queries, selector, []);
		expect(queries.matches(anchors[0], selector)).toBe(false);
		expect(queries.matches(anchors[anchors.length - 1], selector)).toBe(false);
	}
});

it("retains document order and actual branch specificity when impossible branches are skipped", () => {
	const { queries, id } = fixture(
		"<main class=present><a id=first class=link></a><a id=second class=link></a></main><a id=third class=link></a>",
	);
	const first = id("#first");
	const second = id("#second");
	const third = id("#third");
	const result = expectSelection(
		queries,
		"#absent #first, #third, missing-element #second, .present > a, .link, #absent + #second",
		[first, second, third],
	);
	expect([...result]).toEqual([
		[first, [0, 1, 1]],
		[second, [0, 1, 1]],
		[third, [1, 0, 0]],
	]);
});

it("does not treat keys nested in ancestor logical or nth operands as required", () => {
	const { queries, id } = fixture(
		"<main id=parent class=present><a id=first class=link></a><a id=second class=link></a></main>",
	);
	const targets = [id("#first"), id("#second")];
	for (const [selector, specificity] of [
		[":is(#absent, .present) > a", [1, 0, 1]],
		[":where(#absent, .present) > a", [0, 0, 1]],
		[".present:not(#absent) > a", [1, 1, 1]],
		[".present:not(:is(#absent, .missing)) > a", [1, 1, 1]],
		[".present:has(> .link, #absent) > a", [1, 1, 1]],
		[".present:nth-child(1 of #absent, .present) > a", [1, 2, 1]],
		[".present:nth-last-child(1 of #absent, .present) > a", [1, 2, 1]],
	] as const)
		expectSelection(queries, selector, targets, specificity);
	expectSelection(queries, ".present:has(#absent) > a", []);
	expectSelection(
		queries,
		".present:not(:has(#absent)) > a",
		targets,
		[1, 1, 1],
	);
});

it("checks required ancestor type keys with HTML folding and foreign case sensitivity", () => {
	const { tree, queries, id } = fixture(
		"<section id=html><a id=html-child></a></section><svg id=svg></svg><math id=math></math>",
	);
	const svgAncestor = tree.createParserElement(
		"linearGradient",
		{},
		svgNamespace,
	);
	const svgChild = tree.createParserElement("a", {}, svgNamespace);
	const mathAncestor = tree.createParserElement("Mi", {}, mathmlNamespace);
	const mathChild = tree.createParserElement("a", {}, mathmlNamespace);
	tree.append(id("svg"), svgAncestor);
	tree.append(svgAncestor, svgChild);
	tree.append(id("math"), mathAncestor);
	tree.append(mathAncestor, mathChild);
	for (let repeat = 0; repeat < 2; repeat++) {
		expectSelection(queries, "SECTION > a", [id("#html-child")], [0, 0, 2]);
		expectSelection(queries, "linearGradient > a", [svgChild], [0, 0, 2]);
		expectSelection(
			queries,
			String.raw`linear\47 radient > a`,
			[svgChild],
			[0, 0, 2],
		);
		expectSelection(queries, "lineargradient > a, LINEARGRADIENT > a", []);
		expectSelection(queries, "Mi > a", [mathChild], [0, 0, 2]);
		expectSelection(queries, "mi > a, MI > a", []);
	}
});

it("invalidates absent ancestor keys after introduction, removal and reparenting", () => {
	const { tree, queries, id } = fixture(
		"<main><a id=target></a></main><aside></aside>",
	);
	const parent = id("main");
	const other = id("aside");
	const target = id("#target");
	const selector = "#enabled.required > a";
	expectSelection(queries, selector, []);
	tree.setAttribute(parent, "id", "enabled");
	expectSelection(queries, selector, []);
	tree.setAttribute(parent, "class", "required");
	expectSelection(queries, selector, [target], [1, 1, 1]);
	tree.removeAttribute(parent, "class");
	expectSelection(queries, selector, []);
	tree.setAttribute(other, "class", "required");
	expectSelection(queries, selector, []);
	tree.setAttribute(other, "id", "enabled");
	tree.append(other, target);
	expectSelection(queries, selector, [target], [1, 1, 1]);
	tree.removeAttribute(other, "id");
	expectSelection(queries, selector, []);
	tree.setAttribute(other, "id", "enabled");
	expectSelection(queries, selector, [target], [1, 1, 1]);
});

it("does not use globally present duplicate IDs as proof of ancestry or sibling relationships", () => {
	const { queries, id } = fixture(
		"<aside id=shared></aside><main><a id=unrelated></a><section id=shared><a id=descendant></a></section><a id=sibling></a></main>",
	);
	const unrelated = id("#unrelated");
	const descendant = id("#descendant");
	const sibling = id("#sibling");
	expectSelection(queries, "#shared a", [descendant], [1, 0, 1]);
	expectSelection(queries, "#shared + a", [sibling], [1, 0, 1]);
	expectSelection(queries, "#shared ~ a", [sibling], [1, 0, 1]);
	expect(
		queries.matches(unrelated, "#shared a, #shared + a, #shared ~ a"),
	).toBe(false);
});

it("treats capped required-key indexes as unknown instead of trusting partial absence", () => {
	const tokens = Array.from(
		{ length: 48 },
		(_, index) => `token-${index}`,
	).join(" ");
	const { tree, id } = fixture(
		`<div class="${tokens}"></div><main class=late><a id=target></a></main>`,
	);
	const target = id("#target");
	const queries = new DocumentQueries(tree, { maxIndexedNodes: 16 });
	for (let repeat = 0; repeat < 2; repeat++) {
		expectSelection(queries, ".late a", [target], [0, 1, 1]);
		expectSelection(queries, ".absent a, .late > a", [target], [0, 1, 1]);
		expectSelection(queries, ".absent a", []);
	}
	expect(() => queries.matchingSpecificities(".late a", 1)).toThrow(
		"work limit",
	);
	expectSelection(queries, ".late a", [target], [0, 1, 1]);
});

it("recovers required-key lookups after low-work index construction fails", () => {
	const { queries, id } = fixture(
		`<main class=present>${Array.from({ length: 48 }, (_, index) => `<a id=link-${index} class="link token-${index}"></a>`).join("")}</main>`,
	);
	const targets = queries.querySelectorAll("a");
	expect(() =>
		queries.matchingSpecificities(".absent a, .present a", 10),
	).toThrow("work limit");
	expectSelection(queries, ".present a", targets, [0, 1, 1]);
	expectSelection(queries, ".absent a", []);
	expect(() => queries.matchingSpecificities(".present a", 1)).toThrow(
		"work limit",
	);
	expectSelection(queries, ".present > #link-47", [id("#link-47")], [1, 1, 0]);
});

it("prunes an absent outer ancestor and impossible grouped branches within a bounded warm workload", () => {
	const anchors = Array.from(
		{ length: 320 },
		(_, index) => `<a id=link-${index}></a>`,
	).join("");
	const { queries } = fixture(
		`<body class=skin-minerva><main class=mw-parser-output><section class=ambox>${"<div class=article-section>".repeat(12)}${anchors}${"</div>".repeat(12)}</section></main></body>`,
	);
	const impossible = ".client-js body.skin-minerva .mw-parser-output .ambox a";
	const expected = queries.querySelectorAll("a");
	expectSelection(queries, impossible, []);
	expectSelection(queries, "a", expected, [0, 0, 1]);
	const reference = queries.querySelectorAll(`${impossible}, a`);
	const scanWork = queries.metrics().lastWork;
	const workAllowance = 20_000;
	expect(scanWork).toBeGreaterThan(workAllowance);
	for (let repeat = 0; repeat < 2; repeat++) {
		expect([
			...queries.matchingSpecificities(impossible, workAllowance),
		]).toEqual([]);
		const result = queries.matchingSpecificities(
			`${impossible}, a`,
			workAllowance,
		);
		expect([...result.keys()]).toEqual(reference);
		for (const target of expected)
			expect(result.get(target)).toEqual([0, 0, 1]);
		expect(queries.metrics().lastWork).toBeLessThan(scanWork);
	}
});

it("merges reset-style tag branches in document order with matching specificity", () => {
	const { queries, id } = fixture(
		"<main><h2 id=heading></h2><p id=paragraph class=reset></p><ul id=list><li id=item><a id=link></a></li></ul></main>",
	);
	const result = expectSelection(
		queries,
		"a, li, ul, p, h2, .reset, #heading, p.reset",
		["heading", "paragraph", "list", "item", "link"].map((name) =>
			id(`#${name}`),
		),
	);
	expect([...result.values()]).toEqual([
		[1, 0, 0],
		[0, 1, 1],
		[0, 0, 1],
		[0, 0, 1],
		[0, 0, 1],
	]);
});

it("combines indexed and unseeded branches without leaking specificity across candidates", () => {
	const { queries, id } = fixture(
		"<main><p id=first data-reset></p><span id=second class=reset></span><a id=third></a><div id=outside></div></main>",
	);
	const first = id("#first");
	const second = id("#second");
	const third = id("#third");
	const result = expectSelection(
		queries,
		"#third, [data-reset], :where(.reset), :is(p, .reset), a",
		[first, second, third],
	);
	expect([...result]).toEqual([
		[first, [0, 1, 0]],
		[second, [0, 1, 0]],
		[third, [1, 0, 0]],
	]);
	const all = queries.querySelectorAll("*");
	const universal = expectSelection(queries, "#third, *, [data-reset]", all);
	expect(universal.get(id("#outside"))).toEqual([0, 0, 0]);
	expect(universal.get(first)).toEqual([0, 1, 0]);
	expect(universal.get(third)).toEqual([1, 0, 0]);
});

it("counts unique results while later branches upgrade specificity at the result limit", () => {
	const { tree, id } = fixture(
		"<main class=scope><a id=first></a><a id=second></a></main>",
	);
	const first = id("#first");
	const second = id("#second");
	const queries = new DocumentQueries(tree, { maxResults: 2 });
	const selector = ".scope a, a, #second, #first, .scope > a";
	for (let repeat = 0; repeat < 2; repeat++) {
		const result = expectSelection(queries, selector, [first, second]);
		expect([...result.values()]).toEqual([
			[1, 0, 0],
			[1, 0, 0],
		]);
	}
	const extra = tree.createElement("a");
	tree.append(id("main"), extra);
	expect(() => queries.matchingSpecificities(selector)).toThrow("result limit");
	tree.remove(extra);
	expectSelection(queries, selector, [first, second], [1, 0, 0]);
});

it("merges repeated and nested ancestor ranges without including the ancestor itself", () => {
	const { queries, id } = fixture(
		"<main id=shared class=scope><a id=first></a><section id=shared class=scope><a id=nested></a></section><a id=after></a></main><aside class=scope><a id=last></a></aside><a id=outside></a>",
	);
	const all = ["first", "nested", "after", "last"].map((name) =>
		id(`#${name}`),
	);
	expectSelection(queries, ".scope a, .scope > a, .scope a", all, [0, 1, 1]);
	expectSelection(queries, "#shared a", all.slice(0, 3), [1, 0, 1]);
	expectSelection(queries, ".scope .scope a", [id("#nested")], [0, 2, 1]);
	expectSelection(queries, ".scope .scope", [id("section")], [0, 2, 0]);
	expect(queries.matches(id("main"), ".scope .scope")).toBe(false);
	expect(queries.matches(id("#outside"), ".scope a")).toBe(false);
});

it("allows sibling escapes only from seeds that do not provide ancestor ranges", () => {
	const { queries, id } = fixture(
		"<main><section class=a><div class=b></div><div id=inside class=c><span id=leaf class=leaf></span></div></section><section class=b><span id=adjacent class=c></span></section><section class=b><span id=later class=c></span></section></main>",
	);
	for (const [selector, names, specificity] of [
		[".a + .b .c", ["adjacent"], [0, 3, 0]],
		[".a ~ .b > .c", ["adjacent", "later"], [0, 3, 0]],
		[".a > .b + .c", ["inside"], [0, 3, 0]],
		[".a .b + .c", ["inside"], [0, 3, 0]],
		[".a > .b ~ .c .leaf", ["leaf"], [0, 4, 0]],
	] as const)
		expectSelection(
			queries,
			selector,
			names.map((name) => id(`#${name}`)),
			specificity,
		);
});

it("does not confuse globally colliding ancestor keys with valid ancestor chains", () => {
	const { queries, id } = fixture(
		"<main class=a><section class=b><a id=valid></a></section></main><section class=a><a id=left></a></section><aside class=b><a id=right></a></aside>",
	);
	expectSelection(queries, ".a .b a", [id("#valid")], [0, 2, 1]);
	expectSelection(queries, ".a.b a", []);
	expectSelection(queries, ".b .a a", []);
	expectSelection(
		queries,
		":is(.a, .b) > a",
		[id("#valid"), id("#left"), id("#right")],
		[0, 1, 1],
	);
	expectSelection(queries, ".a:not(.b) > a", [id("#left")], [0, 2, 1]);
	expect(queries.matches(id("#right"), ".a .b a")).toBe(false);
});

it("unions HTML-folded and exact foreign ancestor type ranges without case leakage", () => {
	const { tree, queries, id } = fixture(
		"<lineargradient><a id=html></a></lineargradient><svg id=svg></svg><math id=math></math><a id=outside></a>",
	);
	const add = (parent: number, tag: string, namespace: string) => {
		const ancestor = tree.createParserElement(tag, {}, namespace);
		const target = tree.createParserElement("a", {}, namespace);
		tree.append(parent, ancestor);
		tree.append(ancestor, target);
		return target;
	};
	const svgUpper = add(id("svg"), "linearGradient", svgNamespace);
	const svgLower = add(id("svg"), "lineargradient", svgNamespace);
	const mathUpper = add(id("math"), "Mi", mathmlNamespace);
	const mathLower = add(id("math"), "mi", mathmlNamespace);
	const html = id("#html");
	for (let repeat = 0; repeat < 2; repeat++) {
		expectSelection(queries, "linearGradient a", [html, svgUpper], [0, 0, 2]);
		expectSelection(queries, "lineargradient a", [html, svgLower], [0, 0, 2]);
		expectSelection(queries, "LINEARGRADIENT a", [html], [0, 0, 2]);
		expectSelection(queries, "Mi a", [mathUpper], [0, 0, 2]);
		expectSelection(queries, "mi a", [mathLower], [0, 0, 2]);
		expectSelection(
			queries,
			"mi a, linearGradient a, Mi a",
			[html, svgUpper, mathUpper, mathLower],
			[0, 0, 2],
		);
	}
});

it("rebuilds ancestor ranges and result ordering after reparenting and attribute changes", () => {
	const { tree, queries, id } = fixture(
		"<main class=scope><a id=first></a></main><aside><a id=second></a></aside>",
	);
	const main = id("main");
	const aside = id("aside");
	const first = id("#first");
	const second = id("#second");
	expectSelection(queries, ".scope a", [first]);
	tree.setAttribute(aside, "class", "scope");
	expectSelection(queries, ".scope a", [first, second]);
	tree.append(aside, first);
	expectSelection(queries, ".scope a", [second, first]);
	tree.removeAttribute(aside, "class");
	expectSelection(queries, ".scope a", []);
	tree.append(main, aside);
	expectSelection(queries, ".scope a", [second, first]);
	tree.remove(aside);
	expectSelection(queries, ".scope a", []);
	expect(queries.querySelectorAll("a", aside)).toEqual([second, first]);
	tree.append(main, aside);
	expectSelection(queries, ".scope a", [second, first]);
});

it("falls back safely when capped indexes cannot provide complete ancestor ranges", () => {
	const tokens = Array.from(
		{ length: 48 },
		(_, index) => `token-${index}`,
	).join(" ");
	const { tree, id } = fixture(
		`<div class="${tokens}"></div><main class=scope><a id=inside></a></main><aside><a id=outside></a></aside>`,
	);
	const queries = new DocumentQueries(tree, { maxIndexedNodes: 24 });
	const inside = id("#inside");
	const outside = id("#outside");
	for (let repeat = 0; repeat < 2; repeat++) {
		expectSelection(queries, ".scope a", [inside], [0, 1, 1]);
		const result = expectSelection(queries, "#outside, .scope a", [
			inside,
			outside,
		]);
		expect([...result.values()]).toEqual([
			[0, 1, 1],
			[1, 0, 0],
		]);
	}
	tree.append(id("main"), outside);
	expectSelection(queries, ".scope a", [inside, outside], [0, 1, 1]);
});

it("recovers complete ordered results after bounded range or branch work fails", () => {
	const { queries } = fixture(
		`<main>${Array.from({ length: 64 }, (_, index) => `<section class=scope><a id=link-${index}></a></section>`).join("")}</main>`,
	);
	const expected = queries.querySelectorAll("a");
	const selector = ".scope a, .scope > a, a";
	expectSelection(queries, selector, expected, [0, 1, 1]);
	expect(() => queries.matchingSpecificities(selector, 10)).toThrow(
		"work limit",
	);
	expectSelection(queries, selector, expected, [0, 1, 1]);
});

it("bounds warm matching for rare existing ancestor containers among unrelated anchors and list items", () => {
	const unrelated = Array.from({ length: 600 }, () => "<li><a></a></li>").join(
		"",
	);
	const { queries, id } = fixture(
		`<main>${"<div class=article-section>".repeat(12)}<ul>${unrelated}</ul>${"</div>".repeat(12)}<nav class=rare><ul><li id=item><a id=link></a></li></ul></nav></main>`,
	);
	const item = id("#item");
	const link = id("#link");
	const workAllowance = 30_000;
	for (const [selector, expected, specificity] of [
		[".rare a", [link], [0, 1, 1]],
		[".rare li", [item], [0, 1, 1]],
		[".rare a, .rare li, nav.rare a", [item, link], undefined],
	] as const) {
		expectSelection(queries, selector, expected, specificity);
		const reference = queries.querySelectorAll(selector);
		const scanWork = queries.metrics().lastWork;
		expect(scanWork).toBeGreaterThan(workAllowance);
		for (let repeat = 0; repeat < 2; repeat++) {
			const result = queries.matchingSpecificities(selector, workAllowance);
			expect([...result.keys()]).toEqual(reference);
			expect(queries.metrics().lastWork).toBeLessThan(scanWork);
			if (specificity) expect(result.get(expected[0])).toEqual(specificity);
			else
				expect([...result.values()]).toEqual([
					[0, 1, 1],
					[0, 1, 2],
				]);
		}
	}
});

it("bounds branch-local work for a multi-tag reset without cross-matching every tag", () => {
	const tags = [
		"div",
		"p",
		"section",
		"article",
		"aside",
		"nav",
		"header",
		"footer",
		"span",
		"strong",
		"em",
		"b",
		"i",
		"small",
		"code",
		"pre",
	];
	const { queries } = fixture(
		`<main>${Array.from({ length: 80 }, () => tags.map((tag) => `<${tag}></${tag}>`).join("")).join("")}</main>`,
	);
	const selector = [...tags].reverse().join(", ");
	const expected = queries.querySelectorAll(selector);
	expect(expected).toHaveLength(tags.length * 80);
	expectSelection(queries, selector, expected, [0, 0, 1]);
	queries.querySelectorAll(selector);
	const scanWork = queries.metrics().lastWork;
	for (let repeat = 0; repeat < 2; repeat++) {
		const result = queries.matchingSpecificities(selector, 80_000);
		expect([...result.keys()]).toEqual(expected);
		for (const specificity of result.values())
			expect(specificity).toEqual([0, 0, 1]);
		expect(queries.metrics().lastWork).toBeLessThan(scanWork);
	}
});

it.each([
	[
		"one compound",
		`${".a".repeat(200)} #hit`,
		"<div class=a><i id=hit></i></div>",
		29_999,
	],
	[
		"multiple compounds",
		`${".a".repeat(100)} ${".a".repeat(100)} #hit`,
		"<div class=a><div class=a><i id=hit></i></div></div>",
		29_998,
	],
])(
	"bounds repeated ancestor keys in %s without reducing specificity",
	(_description, selector, target, siblings) => {
		const { queries, id } = fixture(
			`${'<div class="a"></div>'.repeat(siblings)}${target}`,
		);
		const hit = id("#hit");
		for (let repeat = 0; repeat < 2; repeat++) {
			const result = queries.matchingSpecificities(selector);
			expect([...result]).toEqual([[hit, [1, 200, 0]]]);
			expect(queries.metrics().lastWork).toBeLessThan(1_000_000);
		}
	},
);

function stylesheetBranches() {
	return Array.from(
		{ length: 120 },
		(_value, index) => `.group-${index} > p.leaf`,
	);
}

it("rejects non-string selectors before constructing mode-specific cache keys", () => {
	const { queries } = fixture("<p></p>");
	let coercions = 0;
	const selector = {
		toString() {
			coercions++;
			return "p";
		},
	} as unknown as string;
	expect(() => queries.querySelectorAll(selector)).toThrow("expected a string");
	expect(() => queries.matchingSpecificities(selector)).toThrow(
		"expected a string",
	);
	expect(coercions).toBe(0);
	expect(queries.metrics().cachedSelectors).toBe(0);
});

it("matches 120 stylesheet branches in document order with full matching and maximum specificity", () => {
	const { queries, id } = fixture(
		"<main class=group-119><p id=first class=leaf data-ready></p><p id=second class=leaf></p><section><p id=nested class=leaf></p></section><span id=wrong-tag class=leaf></span></main><main class=group-0><p id=third class=leaf></p></main><p id=outside class=leaf></p>",
	);
	const first = id("#first");
	const second = id("#second");
	const third = id("#third");
	const branches = stylesheetBranches();
	branches[118] = "#first.leaf[data-ready]";
	const selector = branches.join(", ");
	for (let repeat = 0; repeat < 2; repeat++) {
		expect([...queries.matchingSpecificities(selector)]).toEqual([
			[first, [1, 2, 0]],
			[second, [0, 2, 1]],
			[third, [0, 2, 1]],
		]);
	}
});

it.each([1, 2, 3])(
	"applies a custom component allowance of %s separately to stylesheet branches",
	(maxComponents) => {
		const { tree, id } = fixture("<p id=target class=leaf></p>");
		const target = id("#target");
		const queries = new DocumentQueries(tree, { maxComponents });
		const branch = ".leaf".repeat(maxComponents);
		const selector = Array.from({ length: 4 }, () => branch).join(", ");
		expect([...queries.matchingSpecificities(selector)]).toEqual([
			[target, [0, maxComponents, 0]],
		]);
		expect(() => queries.querySelectorAll(selector)).toThrow("component limit");
		expect(() =>
			queries.matchingSpecificities(`${selector}, ${branch}.leaf`),
		).toThrow("component limit");
	},
);

it("rejects a single over-complex stylesheet branch even after valid branches", () => {
	const { queries, id } = fixture("<p id=target class=leaf></p>");
	const target = id("#target");
	const selector = `${stylesheetBranches().join(", ")}, ${".leaf".repeat(256)}`;
	for (let repeat = 0; repeat < 2; repeat++) {
		expect([...queries.matchingSpecificities(selector)]).toEqual([
			[target, [0, 256, 0]],
		]);
		const cached = queries.metrics().cachedSelectors;
		expect(() => queries.matchingSpecificities(`${selector}.leaf`)).toThrow(
			"component limit",
		);
		expect(queries.metrics().cachedSelectors).toBe(cached);
	}
});

it.each([
	"is(.leaf, .missing)",
	"where(.leaf, .missing)",
	"not(.missing, .absent)",
	"has(.leaf, .missing)",
	"nth-child(1 of .leaf, .missing)",
	"nth-last-child(1 of .leaf, .missing)",
	"is(.leaf):where(.leaf)",
])(
	"keeps nested %s components within their enclosing branch allowance",
	(pseudo) => {
		const { tree, id } = fixture(
			'<main><p id=target class="host leaf tail"><span class=leaf></span></p></main>',
		);
		const target = id("#target");
		const branch = `.host:${pseudo}.tail`;
		const selector = `.absent, ${branch}`;
		const acceptedComponents = pseudo === "is(.leaf):where(.leaf)" ? 6 : 5;
		const accepted = new DocumentQueries(tree, {
			maxComponents: acceptedComponents,
		});
		expect([...accepted.matchingSpecificities(selector).keys()]).toEqual([
			target,
		]);
		const rejected = new DocumentQueries(tree, {
			maxComponents: acceptedComponents - 1,
		});
		for (let repeat = 0; repeat < 2; repeat++) {
			expect(() => rejected.matchingSpecificities(selector)).toThrow(
				"component limit",
			);
			expect(rejected.metrics().cachedSelectors).toBe(0);
		}
	},
);

it.each([
	[",", "Invalid selector"],
	[", [", "Invalid selector"],
	[", :unsupported-native-pseudo", "Unsupported selector"],
	[", ::before", "Unsupported selector"],
	[", :is(.leaf, :unsupported-native-pseudo)", "Unsupported selector"],
])(
	"rejects and does not cache a stylesheet list with suffix %s",
	(suffix, message) => {
		const { tree, id } = fixture(
			"<main class=group-0><p id=target class=leaf></p></main>",
		);
		const target = id("#target");
		const queries = new DocumentQueries(tree);
		const selector = stylesheetBranches().join(", ");
		for (let repeat = 0; repeat < 2; repeat++) {
			expect(() =>
				queries.matchingSpecificities(`${selector}${suffix}`),
			).toThrow(message);
			expect(queries.metrics().cachedSelectors).toBe(repeat);
			expect([...queries.matchingSpecificities(selector)]).toEqual([
				[target, [0, 2, 1]],
			]);
		}
	},
);

it("does not let cached stylesheet selectors weaken any ordinary query syntax limits", () => {
	const { queries, id } = fixture(
		"<main class=group-119><p id=target class=leaf></p></main>",
	);
	const target = id("#target");
	const selector = stylesheetBranches().join(", ");
	for (let repeat = 0; repeat < 2; repeat++) {
		expect([...queries.matchingSpecificities(selector)]).toEqual([
			[target, [0, 2, 1]],
		]);
		const cached = queries.metrics().cachedSelectors;
		for (const operation of [
			() => queries.querySelector(selector),
			() => queries.querySelectorAll(selector),
			() => queries.matches(target, selector),
			() => queries.closest(target, selector),
			() => validateSelectorSyntax(selector),
			() => supportsCssSelector(selector),
		]) {
			expect(operation).toThrow("component limit");
			expect(queries.metrics().cachedSelectors).toBe(cached);
		}
	}
});

it.each(["queries", "tree"] as const)(
	"shares a bounded cache across selector modes and clears both on %s close",
	(owner) => {
		const { tree, id } = fixture("<p id=target class=leaf></p>");
		const target = id("#target");
		const queries = new DocumentQueries(tree, { maxCachedSelectors: 3 });
		expect(queries.querySelectorAll("p.leaf")).toEqual([target]);
		expect(queries.metrics().cachedSelectors).toBe(1);
		expect([...queries.matchingSpecificities("p.leaf")]).toEqual([
			[target, [0, 1, 1]],
		]);
		expect(queries.metrics().cachedSelectors).toBe(2);
		for (const selector of [".leaf", "#target", "p", "p.leaf"]) {
			expect(queries.querySelectorAll(selector)).toEqual([target]);
			expect(queries.metrics().cachedSelectors).toBe(3);
			expect([...queries.matchingSpecificities(selector).keys()]).toEqual([
				target,
			]);
			expect(queries.metrics().cachedSelectors).toBe(3);
		}
		if (owner === "tree") tree.close();
		else queries.close();
		expect(queries.metrics()).toMatchObject({
			closed: true,
			cachedSelectors: 0,
			indexedNodes: 0,
		});
		expect(() => queries.querySelectorAll("p.leaf")).toThrow("closed");
		expect(() => queries.matchingSpecificities("p.leaf")).toThrow("closed");
	},
);

it("charges repeated stylesheet branches to one shared work budget and recovers after failure", () => {
	const { tree, id } = fixture(
		"<main class=group-119><p id=target class=leaf></p></main>",
	);
	const target = id("#target");
	const queries = new DocumentQueries(tree);
	const branch = ".group-119 > p.leaf";
	queries.matchingSpecificities(branch);
	queries.matchingSpecificities(branch);
	const branchWork = queries.metrics().lastWork;
	const selector = Array.from({ length: 120 }, () => branch).join(", ");
	const expected = [[target, [0, 2, 1]]];
	expect([...queries.matchingSpecificities(selector)]).toEqual(expected);
	expect(queries.metrics().lastWork).toBeGreaterThan(branchWork);
	for (let repeat = 0; repeat < 2; repeat++) {
		expect(() => queries.matchingSpecificities(selector, branchWork)).toThrow(
			"work limit",
		);
		expect([...queries.matchingSpecificities(selector)]).toEqual(expected);
	}
	const limited = new DocumentQueries(tree, { maxWork: branchWork });
	expect(() => limited.matchingSpecificities(selector)).toThrow("work limit");
	expect(() => limited.matchingSpecificities(selector, branchWork + 1)).toThrow(
		"Invalid selector work budget",
	);
});

it("shares result limits across stylesheet branches without counting duplicate matches", () => {
	const { tree, id } = fixture(
		"<main class=group-119><p id=first class=leaf data-ready></p><p id=second class=leaf></p></main><main class=group-0><p id=third class=leaf></p></main>",
	);
	const first = id("#first");
	const second = id("#second");
	const third = id("#third");
	const queries = new DocumentQueries(tree, { maxResults: 2 });
	const branches = stylesheetBranches();
	branches.push("#first.leaf[data-ready]", ".group-119 > p.leaf");
	const selector = branches.join(", ");
	for (let repeat = 0; repeat < 2; repeat++)
		expect(() => queries.matchingSpecificities(selector)).toThrow(
			"result limit",
		);
	tree.remove(third);
	for (let repeat = 0; repeat < 2; repeat++)
		expect([...queries.matchingSpecificities(selector)]).toEqual([
			[first, [1, 2, 0]],
			[second, [0, 2, 1]],
		]);
});

it("retains whole-list default and custom selector text limits for stylesheet matching", () => {
	const { tree, id } = fixture(
		"<main class=group-119><p id=target class=leaf></p></main>",
	);
	const target = id("#target");
	const selector = stylesheetBranches().join(", ");
	for (const maxSelectorCodeUnits of [selector.length, 8192]) {
		const queries = new DocumentQueries(
			tree,
			maxSelectorCodeUnits === 8192 ? {} : { maxSelectorCodeUnits },
		);
		const padded = selector.padEnd(maxSelectorCodeUnits, " ");
		expect([...queries.matchingSpecificities(padded)]).toEqual([
			[target, [0, 2, 1]],
		]);
		expect(() => queries.matchingSpecificities(`${padded} `)).toThrow(
			"text limit",
		);
		expect(queries.metrics().cachedSelectors).toBe(1);
	}
});

it.each([2, 16])(
	"retains a nesting limit of %s after many stylesheet branches",
	(maxNesting) => {
		const { tree, id } = fixture("<p id=target class=leaf></p>");
		const target = id("#target");
		const queries = new DocumentQueries(
			tree,
			maxNesting === 16 ? {} : { maxNesting },
		);
		const nested = `${":is(".repeat(maxNesting)}.leaf${")".repeat(maxNesting)}`;
		const prefix = stylesheetBranches().join(", ");
		expect([...queries.matchingSpecificities(`${prefix}, ${nested}`)]).toEqual([
			[target, [0, 1, 0]],
		]);
		expect(() =>
			queries.matchingSpecificities(`${prefix}, :is(${nested})`),
		).toThrow("nesting limit");
		expect(queries.metrics().cachedSelectors).toBe(1);
	},
);
