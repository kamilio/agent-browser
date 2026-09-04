import { expect, it } from "vitest";
import { selectDocumentFragmentTarget } from "./document-url.js";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";

function fixture() {
	const tree = new DocumentTree("https://example.com/start");
	const ids: Record<string, number> = {};
	const add = (
		tag: string,
		id: string,
		parent: number,
		attributes: Record<string, string> = {},
	) => {
		const node = tree.createElement(tag, { id, ...attributes });
		tree.append(parent, node);
		ids[id] = node;
		return node;
	};
	const html = add("html", "html", tree.root);
	const body = add("body", "body", html);
	const main = add("main", "main", body, { class: "container" });
	add("h1", "title", main);
	const list = add("ul", "list", main);
	const first = add("li", "first", list, {
		class: "item active",
		"data-state": "Ready",
		"data-label": "Alice Smith",
	});
	const link = add("a", "link", first, { href: "/first" });
	add("span", "inner", link);
	tree.append(list, tree.createText("\n"));
	add("li", "second", list, {
		class: "item",
		lang: "en-US",
		"data-index": "2",
	});
	tree.append(list, tree.createComment("between siblings"));
	add("li", "third", list, { class: "item last", "data-state": "ready" });
	add("aside", "aside", main);
	return { tree, ids, add, queries: new DocumentQueries(tree) };
}

it.each([
	["#a+b&c=%E6%97%A5", "compound"],
	["#%E9", "replacement"],
	["#named", "named"],
	["#", null],
	["#missing", null],
] as [string, string | null][])(
	"updates :target after explicit fragment selection for %s",
	(fragment, name) => {
		const { tree, ids, queries, add } = fixture();
		const compound = add("div", "a+b&c=日", ids.body);
		const replacement = add("div", "�", ids.body);
		const named = add("a", "legacy", ids.body, { name: "named" });
		const expected: Record<string, number> = { compound, replacement, named };
		expect(queries.querySelector(":target")).toBeNull();
		tree.setUrl(`https://example.com/start${fragment}`);
		expect(queries.querySelector(":target")).toBeNull();
		tree.setTargetElement(selectDocumentFragmentTarget(tree));
		expect(queries.querySelector(":target")).toBe(
			name === null ? null : expected[name],
		);
		tree.setUrl("https://example.com/start");
		tree.setTargetElement(selectDocumentFragmentTarget(tree));
		expect(queries.querySelector(":target")).toBeNull();
	},
);

it("selects the first ID before a named anchor without silently retargeting on removal", () => {
	const { tree, ids, queries, add } = fixture();
	const named = add("a", "named-anchor", ids.body, { name: "destination" });
	const first = add("div", "destination", ids.body);
	const second = add("div", "destination", ids.body);
	tree.setUrl("https://example.com/start#destination");
	tree.setTargetElement(selectDocumentFragmentTarget(tree));
	expect(queries.querySelectorAll(":target")).toEqual([first]);
	tree.remove(first);
	expect(queries.querySelectorAll(":target")).toEqual([]);
	tree.setTargetElement(selectDocumentFragmentTarget(tree));
	expect(queries.querySelectorAll(":target")).toEqual([second]);
	tree.remove(second);
	tree.setTargetElement(selectDocumentFragmentTarget(tree));
	expect(queries.querySelectorAll(":target")).toEqual([named]);
	tree.remove(named);
	tree.setTargetElement(selectDocumentFragmentTarget(tree));
	expect(queries.matches(named, ":target")).toBe(false);
});

it.each([
	["li", ["first", "second", "third"]],
	["LI", ["first", "second", "third"]],
	["#second", ["second"]],
	[".item.active", ["first"]],
	["main > ul > li", ["first", "second", "third"]],
	["body .item a > span", ["inner"]],
	["#first + li", ["second"]],
	["#first ~ li", ["second", "third"]],
	["#third, .active, #third", ["first", "third"]],
	["[data-state]", ["first", "third"]],
	['[data-state="Ready"]', ["first"]],
	['[data-state="ready" i]', ["first", "third"]],
	['[data-state="ready" s]', ["third"]],
	['[class~="active"]', ["first"]],
	['[class~="item active"]', []],
	['[lang|="en"]', ["second"]],
	['[data-label^="Alice"]', ["first"]],
	['[data-label$="Smith"]', ["first"]],
	['[data-label*="ce Sm"]', ["first"]],
	['[data-label*=""]', []],
	['[data-label^=""]', []],
	['[data-label$=""]', []],
	["li:first-child", ["first"]],
	["li:last-child", ["third"]],
	["li:only-child", []],
	["a:only-child", ["link"]],
	["h1:first-of-type", ["title"]],
	["li:last-of-type", ["third"]],
	["ul:only-of-type", ["list"]],
	["li:nth-child(2n + 1)", ["first", "third"]],
	["li:nth-child(even)", ["second"]],
	["li:nth-child(-n+2)", ["first", "second"]],
	["li:nth-child(0)", []],
	["li:nth-last-child(2)", ["second"]],
	["li:nth-of-type(3)", ["third"]],
	["li:nth-last-of-type(1)", ["third"]],
	["li:nth-child(2 of .active, .last)", ["third"]],
	["li:nth-last-child(2 of .active, .last)", ["first"]],
	["li:not(.active, .last)", ["second"]],
	[":is(li.active, aside)", ["first", "aside"]],
	["li:where(.active, .last)", ["first", "third"]],
	["ul:has(> li.active)", ["list"]],
	["li:has(a span)", ["first"]],
	["li:has(+ .last)", ["second"]],
	["li:has(~ .last)", ["first", "second"]],
	["main:has(> aside, > footer)", ["main"]],
	["li:not(:has(a))", ["second", "third"]],
	[":root", ["html"]],
	[":scope > body", ["body"]],
	[":link", ["link"]],
	[":any-link", ["link"]],
	[":visited", []],
	["ul/**/>/**/li.active", ["first"]],
] as [string, string[]][])("matches %s", (selector, names) => {
	const { ids, queries } = fixture();
	expect(queries.querySelectorAll(selector)).toEqual(
		names.map((name) => ids[name]),
	);
	expect(queries.querySelector(selector)).toBe(
		names.length ? ids[names[0]] : null,
	);
});

it("scopes candidates without excluding matching ancestors outside the query root", () => {
	const { queries, ids } = fixture();
	expect(queries.querySelectorAll("body #inner", ids.list)).toEqual([
		ids.inner,
	]);
	expect(queries.querySelectorAll(":scope > li", ids.list)).toEqual([
		ids.first,
		ids.second,
		ids.third,
	]);
	expect(queries.querySelectorAll(":scope", ids.list)).toEqual([]);
	expect(queries.matches(ids.list, ":scope")).toBe(true);
	expect(queries.matches(ids.first, "main > ul > li.active")).toBe(true);
	expect(queries.closest(ids.inner, "li")).toBe(ids.first);
	expect(queries.closest(ids.inner, ":scope")).toBe(ids.inner);
	expect(queries.closest(ids.inner, "ul:scope")).toBeNull();
	expect(queries.querySelectorAll("#body, #aside", ids.list)).toEqual([]);
});

it("handles escaped names, strings and ASCII-only case folding", () => {
	const { tree, add, ids, queries } = fixture();
	const escaped = add("input", "123:a♥😀", ids.body, {
		class: "one\u00a0two",
		type: "TEXT",
		"data-label": 'a"b',
		"data-unicode": "Å",
		"data-joined": "ab",
	});
	expect(queries.querySelector("#\\31 23\\:a\\2665\\1f600")).toBe(escaped);
	expect(queries.querySelector('[data-label="a\\"b"]')).toBe(escaped);
	expect(queries.querySelector('[data-joined="a\\\nb"]')).toBe(escaped);
	expect(queries.querySelector("[type=text]")).toBe(escaped);
	expect(queries.querySelector("[type=text s]")).toBeNull();
	expect(queries.querySelector('[data-unicode="å" i]')).toBeNull();
	expect(queries.querySelector(".one")).toBeNull();
	expect(queries.querySelector(".one\\a0 two")).toBe(escaped);
	const replacement = add("div", "�", ids.body);
	expect(queries.querySelector("#\\0")).toBe(replacement);
	expect(queries.querySelector("#\0")).toBe(replacement);
	const endEscape = add("div", "name�", ids.body);
	expect(queries.querySelector("#name\\")).toBe(endEscape);
	const checkedAttribute = add("input", "checked-attribute", ids.body, {
		checked: "CHECKED",
	});
	expect(queries.querySelector("[checked=checked]")).toBe(checkedAttribute);
	tree.close();
});

it("ignores comments and empty text for :empty but retains whitespace-only text", () => {
	const { tree, ids, add, queries } = fixture();
	const empty = add("div", "empty", ids.body);
	const spaced = add("div", "spaced", ids.body);
	tree.append(empty, tree.createComment("ignored"));
	tree.append(empty, tree.createText(""));
	tree.append(spaced, tree.createText(" "));
	expect(queries.matches(empty, ":empty")).toBe(true);
	expect(queries.matches(spaced, ":empty")).toBe(false);
	add("span", "child", empty);
	expect(queries.matches(empty, ":empty")).toBe(false);
});

it("supports structural queries on detached trees without inventing control state", () => {
	const { tree, queries } = fixture();
	const detached = tree.createElement("div", { class: "orphan" });
	const child = tree.createElement("span");
	tree.append(detached, child);
	expect(queries.querySelector(".orphan > span", detached)).toBe(child);
	expect(queries.matches(detached, ":first-child:only-child")).toBe(true);
	expect(queries.matches(detached, ":root")).toBe(false);
	expect(queries.closest(child, ".orphan")).toBe(detached);
	expect(() => queries.querySelectorAll(":checked", detached)).toThrow(
		"detached",
	);
});

it("uses live control state and fieldset/legend rules, including changes made through interactions", () => {
	const { tree, ids, add, queries } = fixture();
	const fieldset = add("fieldset", "fieldset", ids.body, { disabled: "" });
	const legend = add("legend", "legend", fieldset);
	const allowed = add("input", "allowed", legend, { required: "" });
	const disabled = add("input", "disabled", fieldset);
	const checkbox = add("input", "checkbox", ids.body, { type: "checkbox" });
	const radio = add("input", "radio", ids.body, {
		type: "radio",
		name: "choice",
	});
	const progress = add("progress", "progress", ids.body);
	const select = add("select", "select", ids.body);
	const first = add("option", "first-option", select, { value: "one" });
	const second = add("option", "second-option", select, { value: "two" });
	expect(queries.querySelectorAll(":disabled")).toEqual([fieldset, disabled]);
	expect(queries.matches(allowed, ":enabled:required")).toBe(true);
	expect(queries.matches(ids.main, ":enabled, :optional")).toBe(false);
	expect(queries.matches(checkbox, ":optional")).toBe(true);
	expect(queries.querySelectorAll(":checked")).toEqual([first]);
	tree.setControl(checkbox, { indeterminate: true });
	expect(queries.querySelectorAll(":indeterminate")).toEqual([
		checkbox,
		radio,
		progress,
	]);
	const actions = new DocumentInteractions(tree);
	actions.setChecked(tree.reference(checkbox), true);
	actions.select(tree.reference(select), ["two"]);
	expect(queries.querySelectorAll(":checked")).toEqual([checkbox, second]);
	expect(queries.querySelectorAll(":indeterminate")).toEqual([radio, progress]);
});

it("invalidates cached node/sibling/attribute/text indexes after each kind of mutation", () => {
	const { tree, queries, ids } = fixture();
	const firstResult = queries.querySelectorAll("li");
	tree.remove(ids.first);
	expect(queries.querySelector("li:first-child")).toBe(ids.second);
	expect(firstResult).toEqual([ids.first, ids.second, ids.third]);
	expect(Object.isFrozen(firstResult)).toBe(true);
	tree.append(ids.list, ids.first);
	expect(queries.querySelector("li:last-child")).toBe(ids.first);
	tree.setAttribute(ids.second, "class", "changed");
	expect(queries.querySelector(".changed")).toBe(ids.second);
	const text = tree.createText("text");
	tree.append(ids.aside, text);
	expect(queries.matches(ids.aside, ":empty")).toBe(false);
	tree.setData(text, "");
	expect(queries.matches(ids.aside, ":empty")).toBe(true);
});

it("supports selector-driven delegated event handlers without a separate browser engine", () => {
	const { tree, ids, add, queries } = fixture();
	const input = add("input", "query", ids.body, { name: "search" });
	const output = tree.createText("empty");
	tree.append(ids.aside, output);
	const actions = new DocumentInteractions(tree);
	actions.events.addEventListener(tree.root, "input", (event) => {
		if (
			event.target !== null &&
			queries.matches(event.target, 'input[name="search"]')
		)
			tree.setData(output, "input handled");
	});
	const selected = queries.querySelector('input[name="search"]');
	expect(selected).toBe(input);
	if (selected !== null) actions.fill(tree.reference(selected), "query");
	expect(tree.textContent(ids.aside)).toBe("input handled");
	expect(actions.events.drainErrors()).toEqual([]);
});

it.each([
	"",
	",",
	"li,",
	"li,,a",
	"> li",
	"li >",
	"li + ~ a",
	"li..active",
	"#123",
	"#",
	"[name=]",
	"[name=123]",
	'[name="x" q]',
	'[name="unterminated]',
	"[name",
	"li)",
	":not()",
	":is(,li)",
	":nth-child(n +)",
	":nth-child(2 n)",
	":nth-child(n 1)",
	":nth-child(2.5n)",
	":nth-child(1/**/2)",
	":nth-child(2 of)",
	":nth-of-type(2 of li)",
	":has(:has(a))",
	"ma/**/in",
	"li/*",
	"#name\\\n",
	'[name="a\nb"]',
])(
	"rejects malformed selector %j even with an empty candidate subtree",
	(selector) => {
		const { queries, ids } = fixture();
		expect(() => queries.querySelector(selector, ids.aside)).toThrow(
			"Invalid selector",
		);
	},
);

it.each([
	"input:valid",
	"li::before",
	"svg|rect",
	"*|rect",
	"[svg|href]",
	":is(:unknown, li)",
	":has(:scope > a)",
])(
	"reports unsupported features rather than silently ignoring %s",
	(selector) => {
		const { queries } = fixture();
		expect(() => queries.querySelector(selector)).toThrow(
			"Unsupported selector",
		);
	},
);

it("bounds source length, parser components, nesting, numeric values and cache entries", () => {
	const { tree, ids } = fixture();
	expect(() =>
		new DocumentQueries(tree, { maxSelectorCodeUnits: 3 }).querySelector(
			"main",
		),
	).toThrow("text limit");
	expect(() =>
		new DocumentQueries(tree, { maxComponents: 1 }).querySelector(
			".item.active",
		),
	).toThrow("component limit");
	expect(() =>
		new DocumentQueries(tree, { maxNesting: 2 }).querySelector(
			":is(:is(:is(li)))",
		),
	).toThrow("nesting limit");
	expect(() =>
		new DocumentQueries(tree).querySelector("li:nth-child(1000000001)"),
	).toThrow("numeric limit");
	const queries = new DocumentQueries(tree, { maxCachedSelectors: 2 });
	for (const selector of ["li", "a", "main", "li"])
		queries.querySelector(selector);
	expect(queries.metrics().cachedSelectors).toBe(2);
	expect(() => queries.querySelector("[")).toThrow();
	expect(queries.metrics().cachedSelectors).toBe(2);
	queries.querySelector("main");
	expect(queries.matches(ids.main, ".container")).toBe(true);
});

it("bounds node indexing, match work, result counts and filtered-sibling memo entries", () => {
	const { tree } = fixture();
	expect(() =>
		new DocumentQueries(tree, { maxIndexedNodes: 2 }).querySelector("li"),
	).toThrow("node index limit");
	expect(() =>
		new DocumentQueries(tree, { maxWork: 1 }).querySelector("li"),
	).toThrow("work limit");
	const bounded = new DocumentQueries(tree, { maxResults: 1 });
	expect(() => bounded.querySelectorAll("li")).toThrow("result limit");
	expect(bounded.querySelector("li")).not.toBeNull();
	expect(() =>
		new DocumentQueries(tree, { maxMemoEntries: 1 }).querySelector(
			"li:nth-child(1 of .item)",
		),
	).toThrow("memo limit");
});

it("bounds expensive relational selectors and long attribute scans without host regex evaluation", () => {
	const { tree, add, ids } = fixture();
	for (let index = 0; index < 100; index++)
		add("div", `many-${index}`, ids.body);
	const queries = new DocumentQueries(tree, { maxWork: 500 });
	expect(() => queries.querySelectorAll("div:has(.absent)")).toThrow(
		"work limit",
	);
	const large = add("div", "large", ids.body, {
		"data-large": "x".repeat(2000),
	});
	expect(() => queries.matches(large, '[data-large*="q"]')).toThrow(
		"work limit",
	);
});

it("keeps ordinary large sibling queries linear using shared position metadata", () => {
	const tree = new DocumentTree("https://example.com");
	const parent = tree.createElement("div");
	tree.append(tree.root, parent);
	const expected: number[] = [];
	for (let index = 0; index < 2000; index++) {
		const child = tree.createElement("span", { class: "item" });
		tree.append(parent, child);
		if (index % 2 === 0) expected.push(child);
	}
	const queries = new DocumentQueries(tree, { maxWork: 100_000 });
	expect(queries.querySelectorAll("span:nth-child(odd of .item)")).toEqual(
		expected,
	);
	expect(queries.metrics().lastWork).toBeLessThan(100_000);
});

it("releases caches on close and rejects malformed host inputs and foreign roots", () => {
	const { queries, tree } = fixture();
	queries.querySelector("li");
	expect(queries.metrics().indexedNodes).toBeGreaterThan(0);
	expect(() => queries.querySelector("li", 999_999_999)).toThrow("Unknown");
	expect(() => queries.matches(tree.root, "*")).toThrow("element query target");
	expect(() => queries.closest(tree.root, "*")).toThrow("element query target");
	expect(() => queries.querySelector("li", tree.createText("invalid"))).toThrow(
		"root",
	);
	expect(() => queries.querySelector(null as unknown as string)).toThrow(
		"string",
	);
	expect(() => new DocumentQueries(tree, { maxWork: 0 })).toThrow("limit");
	tree.close();
	expect(queries.metrics()).toMatchObject({
		indexedNodes: 0,
		cachedSelectors: 0,
		closed: true,
	});
	expect(() => queries.querySelector("li")).toThrow("closed");
	queries.close();
});
