import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentQueries, type QueryLimits } from "./selectors.js";

function fixture(limits: Partial<QueryLimits> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/pseudo-selectors");
	const add = (
		tag: string,
		parent: number,
		attributes: Record<string, string> = {},
	) => {
		const node = tree.createElement(tag, attributes);
		tree.append(parent, node);
		return node;
	};
	const html = add("html", tree.root);
	const body = add("body", html);
	const host = add("main", body, { id: "host", class: "scope" });
	const first = add("button", host, {
		id: "first",
		class: "item ready",
		"data-label": "Ready",
	});
	const child = add("span", first, { id: "child" });
	tree.append(child, tree.createText("Original text"));
	const second = add("button", host, { id: "second", class: "item" });
	const aside = add("aside", body);
	const outside = add("button", aside, { id: "outside", class: "item" });
	return {
		tree,
		add,
		host,
		first,
		second,
		child,
		outside,
		queries: new DocumentQueries(tree, limits),
	};
}

it.each([
	["::before", "before"],
	[":before", "before"],
	["::BEFORE", "before"],
	[String.raw`::b\65 fore`, "before"],
	[String.raw`:\62 eFoRe`, "before"],
	["::after", "after"],
	[":after", "after"],
	["::AfTeR", "after"],
	[String.raw`::\61 fter`, "after"],
] as const)("matches terminal %s only in its pseudo map", (suffix, name) => {
	const { tree, queries, first } = fixture();
	const selector = `#first${suffix}`;
	expect([...queries.matchingPseudoSpecificities(selector, name)]).toEqual([
		[first, [1, 0, 1]],
	]);
	expect(
		queries.matchingPseudoSpecificities(
			selector,
			name === "before" ? "after" : "before",
		).size,
	).toBe(0);
	expect(queries.matchingSpecificities(selector).size).toBe(0);
	tree.close();
});

it.each(["::before", ":before", "::after", ":after"])(
	"keeps %s out of DOM queries while preserving ordinary list branches",
	(suffix) => {
		const { tree, queries, first, second, child } = fixture();
		const selector = `#first${suffix}`;
		expect(queries.querySelector(selector)).toBeNull();
		expect(queries.querySelectorAll(selector)).toEqual([]);
		expect(queries.matches(first, selector)).toBe(false);
		expect(queries.closest(child, selector)).toBeNull();
		expect(queries.querySelectorAll(`${selector}, #second`)).toEqual([second]);
		expect(queries.querySelector(`${selector}, #second`)).toBe(second);
		expect(queries.matches(first, `${selector}, #second`)).toBe(false);
		expect(queries.matches(second, `${selector}, #second`)).toBe(true);
		expect(queries.closest(child, `${selector}, #first`)).toBe(first);
		expect([...queries.matchingSpecificities(`${selector}, #second`)]).toEqual([
			[second, [1, 0, 0]],
		]);
		tree.close();
	},
);

it("applies origin and ancestor filters before the terminal pseudo", () => {
	const { tree, queries, first, second } = fixture();
	expect([
		...queries.matchingPseudoSpecificities(
			'main.scope > button[data-label="Ready"]::before',
			"before",
		),
	]).toEqual([[first, [0, 2, 3]]]);
	expect([
		...queries.matchingPseudoSpecificities(
			"#host > .item + button::after",
			"after",
		),
	]).toEqual([[second, [1, 1, 2]]]);
	expect(
		queries.matchingPseudoSpecificities("aside > #first::before", "before")
			.size,
	).toBe(0);
	tree.close();
});

it("counts an unqualified pseudo as one type component and keeps both maps independent", () => {
	const { tree, queries, first } = fixture();
	const result = queries.matchingStyleSpecificities("::before, :after");
	expect(result.elements.size).toBe(0);
	expect(result.before.get(first)).toEqual([0, 0, 1]);
	expect(result.after.get(first)).toEqual([0, 0, 1]);
	expect([...result.before.keys()]).toEqual([...result.after.keys()]);
	tree.close();
});

it("separates branch specificity by target and returns each map in document order", () => {
	const { tree, queries, first, second, outside } = fixture();
	const result = queries.matchingStyleSpecificities(
		"#second::before, .item::before, #first#first::before, #first::after, #first",
	);
	expect([...result.before]).toEqual([
		[first, [2, 0, 1]],
		[second, [1, 0, 1]],
		[outside, [0, 1, 1]],
	]);
	expect([...result.after]).toEqual([[first, [1, 0, 1]]]);
	expect([...result.elements]).toEqual([[first, [1, 0, 0]]]);
	expect(Object.isFrozen(result)).toBe(true);
	for (const map of [result.before, result.after, result.elements])
		for (const specificity of map.values())
			expect(Object.isFrozen(specificity)).toBe(true);
	tree.close();
});

it("uses lexicographic specificity and retains duplicate-ID origins", () => {
	const { tree, queries, first, second } = fixture();
	tree.setAttribute(second, "id", "first");
	tree.setAttribute(first, "class", "token");
	const classes = ".token".repeat(100);
	expect([
		...queries.matchingPseudoSpecificities(
			`#first::before, ${classes}::before`,
			"before",
		),
	]).toEqual([
		[first, [1, 0, 1]],
		[second, [1, 0, 1]],
	]);
	tree.close();
});

it.each([
	"#first::marker",
	"#first::first-letter",
	"#first::before()",
	"#first:after(text)",
	"#first::before::after",
	"#first::before:hover",
	"#first::before.ready",
	"#first::before > span",
	"#first::before span",
	":is(#first::before)",
	":where(#first::before)",
	":not(#first::before)",
	"main:has(> button::before)",
	"button:nth-child(1 of ::before)",
])("rejects unsupported pseudo selector forms: %s", (selector) => {
	const { tree, queries } = fixture();
	for (const read of [
		() => queries.querySelectorAll(selector),
		() => queries.matchingPseudoSpecificities(selector, "before"),
		() => queries.matchingStyleSpecificities(selector),
	])
		expect(read).toThrowError(expect.objectContaining({ code: "unsupported" }));
	tree.close();
});

it("charges results across all three targets without counting duplicate branches", () => {
	const { tree, queries, first } = fixture({ maxResults: 2 });
	const selector = "#first, #first::before, #first::after";
	expect(queries.matchingSpecificities(selector).size).toBe(1);
	expect(queries.matchingPseudoSpecificities(selector, "before").size).toBe(1);
	expect(queries.matchingPseudoSpecificities(selector, "after").size).toBe(1);
	expect(() => queries.matchingStyleSpecificities(selector)).toThrow(
		"Query result limit exceeded",
	);
	const result = queries.matchingStyleSpecificities(
		"#first::before, #first::before, #first#first::before, #first::after",
	);
	expect([...result.before]).toEqual([[first, [2, 0, 1]]]);
	expect([...result.after]).toEqual([[first, [1, 0, 1]]]);
	tree.close();
});

it("shares one work budget across element, before and after branches", () => {
	const { tree, queries } = fixture();
	const selector = ".item, .item::before, .item::after";
	queries.matchingSpecificities(selector);
	const elementWork = queries.metrics().lastWork;
	queries.matchingPseudoSpecificities(selector, "before");
	const beforeWork = queries.metrics().lastWork;
	queries.matchingPseudoSpecificities(selector, "after");
	const afterWork = queries.metrics().lastWork;
	const expected = queries.matchingStyleSpecificities(selector);
	const aggregateWork = queries.metrics().lastWork;
	const individualWork = Math.max(elementWork, beforeWork, afterWork);
	expect(aggregateWork).toBeGreaterThan(individualWork);
	expect(() =>
		queries.matchingStyleSpecificities(selector, individualWork),
	).toThrow("Query work limit exceeded");
	expect(() =>
		queries.matchingStyleSpecificities(selector, aggregateWork - 1),
	).toThrow("Query work limit exceeded");
	expect(queries.matchingStyleSpecificities(selector, aggregateWork)).toEqual(
		expected,
	);
	for (const budget of [0, -1, 1.5, Number.NaN, queries.limits.maxWork + 1])
		expect(() =>
			queries.matchingPseudoSpecificities(selector, "before", budget),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	tree.close();
});

it("bounds style components per branch without relaxing DOM list limits", () => {
	const { tree, queries, first } = fixture({ maxComponents: 2 });
	const selector = "#first::before, #first::after, #first";
	expect(queries.matchingStyleSpecificities(selector).before.has(first)).toBe(
		true,
	);
	expect(() => queries.querySelectorAll(selector)).toThrow("component limit");
	expect(() =>
		queries.matchingStyleSpecificities("button#first::before"),
	).toThrow("component limit");
	expect(
		queries.matchingPseudoSpecificities(selector, "after").has(first),
	).toBe(true);
	tree.close();
});

it("refreshes state and structural matches while bounding compiled selector retention", () => {
	const { tree, queries, first, second } = fixture({ maxCachedSelectors: 2 });
	const selector = "button:focus::before, button:hover::after";
	expect(queries.matchingStyleSpecificities(selector).before.size).toBe(0);
	const initial = queries.metrics();
	tree.setActiveElement(first);
	tree.setPointerState(second, null);
	let result = queries.matchingStyleSpecificities(selector);
	expect([...result.before.keys()]).toEqual([first]);
	expect([...result.after.keys()]).toEqual([second]);
	expect(queries.metrics().structuralBuilds).toBe(initial.structuralBuilds);
	expect(queries.metrics().stateRefreshes).toBeGreaterThan(
		initial.stateRefreshes,
	);
	tree.setActiveElement(second);
	tree.setPointerState(null, null);
	result = queries.matchingStyleSpecificities(selector);
	expect([...result.before.keys()]).toEqual([second]);
	expect(result.after.size).toBe(0);
	queries.matchingPseudoSpecificities(".ready::before", "before");
	tree.setAttribute(first, "class", "item");
	tree.setAttribute(second, "class", "item ready");
	expect([
		...queries.matchingPseudoSpecificities(".ready::before", "before").keys(),
	]).toEqual([second]);
	for (const source of ["#first::after", "#second::before", selector])
		queries.matchingStyleSpecificities(source);
	expect(queries.metrics().cachedSelectors).toBe(2);
	tree.remove(second);
	expect(queries.matchingStyleSpecificities(selector).before.size).toBe(0);
	tree.close();
	expect(queries.metrics()).toMatchObject({
		cachedSelectors: 0,
		indexedNodes: 0,
		closed: true,
	});
	expect(() => queries.matchingStyleSpecificities(selector)).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
});

it("never materializes generated nodes or changes the document during matching", () => {
	const { tree, queries, first } = fixture();
	const revision = tree.revision;
	const nodes = [...tree.walk()].map(({ node }) => node.id);
	const children = [...tree.get(first).children];
	const text = tree.textContent(first);
	for (let index = 0; index < 3; index++) {
		queries.matchingStyleSpecificities("*, *::before, *::after");
		queries.querySelectorAll("*::before, *::after");
	}
	expect(tree.revision).toBe(revision);
	expect([...tree.walk()].map(({ node }) => node.id)).toEqual(nodes);
	expect(tree.get(first).children).toEqual(children);
	expect(tree.textContent(first)).toBe(text);
	tree.close();
});
