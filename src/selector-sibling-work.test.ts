import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles } from "./styles.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(source: string) {
	const tree = parseHtmlDocument(
		source,
		"https://fixture.invalid/sibling-work",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	return { tree, queries, id };
}

function wideFixture(count: number, markerAt = count) {
	return fixture(
		`<style>.start ~ .item { display: none; }</style><main>${'<span class="item"></span>'.repeat(
			markerAt,
		)}<span class="start"></span>${'<span class="item"></span>'.repeat(
			count - markerAt,
		)}</main>`,
	);
}

it.each([0, 1024, 2048])(
	"bounds 2,048 siblings with the marker at %i without raising limits",
	(markerAt) => {
		const count = 2048;
		const { tree, queries } = wideFixture(count, markerAt);
		const items = queries.querySelectorAll(".item");
		const expected = items.slice(markerAt);
		expect(queries.limits.maxWork).toBe(5_000_000);
		expect([...queries.matchingSpecificities(".start ~ .item").keys()]).toEqual(
			expected,
		);
		expect(queries.metrics().lastWork).toBeLessThan(count * 256);
		expect(queries.querySelectorAll(".start ~ .item")).toEqual(expected);
		expect(queries.metrics().lastWork).toBeLessThan(count * 256);
		expect(queries.matches(items[count - 1], ".start ~ .item")).toBe(
			markerAt < count,
		);
		expect(queries.metrics().lastWork).toBeLessThan(count * 256);
		const styles = new DocumentStyles(tree);
		expect(styles.metrics().work).toBeLessThan(1_000_000);
		expect(styles.get(items[0]).visible).toBe(markerAt !== 0);
		expect(styles.get(items[count - 1]).visible).toBe(markerAt === count);
	},
);

it("keeps failing-sibling work proportional as the list doubles", () => {
	const measure = (count: number) => {
		const { queries } = wideFixture(count);
		expect(queries.matchingSpecificities(".start ~ .item").size).toBe(0);
		return queries.metrics().lastWork;
	};
	const smaller = measure(1024);
	const larger = measure(2048);
	expect(larger).toBeGreaterThan(smaller);
	expect(larger).toBeLessThan(smaller * 3);
	expect(larger).toBeLessThan(2048 * 256);
});

it("keeps cheap positive selector lists within the unchanged default memo budget", () => {
	const { queries } = fixture(
		`<main>${'<i class="item"></i>'.repeat(2048)}</main>`,
	);
	const selector = Array.from({ length: 50 }, () => ".item ~ .item").join(",");
	const items = queries.querySelectorAll(".item");
	expect(queries.limits.maxWork).toBe(5_000_000);
	expect(queries.limits.maxMemoEntries).toBe(100_000);
	expect([...queries.matchingSpecificities(selector)]).toEqual(
		items.slice(1).map((target) => [target, [0, 2, 0]]),
	);
	expect(queries.metrics().lastWork).toBeLessThan(5_000_000);
});

it("separates prefix positions in chained sibling selectors", () => {
	const { queries, id } = fixture(
		"<main><b class=start></b><i id=first class=item></i><i id=second class=item></i><i id=third class=item></i></main>",
	);
	const expected = [id("#second"), id("#third")];
	const selector = ".start ~ .item ~ .item";
	expect([...queries.matchingSpecificities(selector)]).toEqual(
		expected.map((target) => [target, [0, 3, 0]]),
	);
	expect(queries.querySelectorAll(selector)).toEqual(expected);
	expect(queries.matches(id("#first"), selector)).toBe(false);
	expect(queries.matches(id("#third"), selector)).toBe(true);
});

it("ignores non-element siblings and never crosses parent chains", () => {
	const { queries, id } = fixture(
		"<main id=host><b class=start></b>text<!--gap--><i id=first class=item></i>more<!--gap--><i id=second class=item></i><section><i id=nested class=item></i></section></main><aside><i id=outside class=item></i></aside>",
	);
	const expected = [id("#first"), id("#second")];
	expect(queries.querySelectorAll(".start ~ .item")).toEqual(expected);
	expect(
		queries.querySelectorAll(":scope > .start ~ .item", id("#host")),
	).toEqual(expected);
	expect(queries.querySelectorAll(".start + .item")).toEqual([expected[0]]);
	expect(queries.querySelectorAll(".start ~ .item + .item")).toEqual([
		expected[1],
	]);
	expect(queries.matches(id("#nested"), ".start ~ .item")).toBe(false);
	expect(queries.matches(id("#outside"), ".start ~ .item")).toBe(false);
});

it("preserves lower-prefix tables initialized by a recursive predecessor probe", () => {
	const { tree } = fixture(
		`<main>${'<i class="item"></i>'.repeat(4)}<b id="target"></b><i class="start"></i></main>`,
	);
	const queries = new DocumentQueries(tree, { maxMemoEntries: 10 });
	expect(queries.matchingSpecificities(".start ~ .item ~ #target").size).toBe(
		0,
	);
});

it("keeps relational sibling caches scoped to each has anchor", () => {
	const { queries, id } = fixture(
		"<main><i id=first class=anchor></i><b class=item></b><i id=second class=anchor></i><b class=item></b><i id=last class=anchor></i></main><aside><i id=outside class=anchor></i></aside>",
	);
	const expected = [id("#first"), id("#second")];
	for (const selector of [".anchor:has(~ .item)", ".anchor:has(+ .item)"]) {
		expect([...queries.matchingSpecificities(selector).keys()]).toEqual(
			expected,
		);
		expect(queries.querySelectorAll(selector)).toEqual(expected);
	}
	expect(queries.querySelectorAll(".anchor:not(:has(~ .item))")).toEqual([
		id("#last"),
		id("#outside"),
	]);
});

it("preserves child-relative has and nth sibling prefix matching", () => {
	const { queries, id } = fixture(
		"<section id=before><b class=start></b><i id=first class=item></i><i class=item></i></section><section id=after><i class=item></i><b class=start></b></section>",
	);
	expect(queries.querySelectorAll("section:has(> .start ~ .item)")).toEqual([
		id("#before"),
	]);
	expect(
		queries.querySelectorAll(".item:nth-child(1 of .start ~ .item)"),
	).toEqual([id("#first")]);
});

it("preserves branch specificity and all three pseudo targets", () => {
	const { queries, id } = fixture(
		"<main><b class=start></b><i id=first class=item></i><i id=second class=item></i></main>",
	);
	const expected = [id("#first"), id("#second")];
	expect([
		...queries.matchingSpecificities(
			".start ~ .item, :is(#missing, .start) ~ .item, .start ~ .item",
		),
	]).toEqual(expected.map((target) => [target, [1, 1, 0]]));
	const result = queries.matchingStyleSpecificities(
		".start ~ .item::before, .start ~ .item, .start ~ .item::after",
	);
	expect([...result.elements]).toEqual(
		expected.map((target) => [target, [0, 2, 0]]),
	);
	for (const pseudo of ["before", "after"] as const)
		expect([...result[pseudo]]).toEqual(
			expected.map((target) => [target, [0, 2, 1]]),
		);
});

it("keeps nesting contexts separate from relational anchor scopes", () => {
	const { queries, id } = fixture(
		"<main><b class=start></b><i id=first class=item></i><b class=later></b><i id=second class=item></i></main>",
	);
	const first = id("#first");
	const second = id("#second");
	for (const [parent, expected] of [
		[".start", [first, second]],
		[".later", [second]],
	] as const) {
		const result = queries.matchingStyleSpecificities("& ~ .item", undefined, {
			selector: parent,
		});
		expect([...result.elements]).toEqual(
			expected.map((target) => [target, [0, 2, 0]]),
		);
	}
	const anchored = queries.matchingStyleSpecificities(
		"&:has(~ .item)",
		undefined,
		{ selector: ".item" },
	);
	expect([...anchored.elements]).toEqual([[first, [0, 2, 0]]]);
});

it("invalidates sibling results after attributes, moves and removal", () => {
	const { tree, queries, id } = fixture(
		"<main id=left><b id=marker class=start></b><i id=first class=item></i></main><aside id=right><i id=second class=item></i></aside>",
	);
	const left = id("#left");
	const right = id("#right");
	const marker = id("#marker");
	const first = id("#first");
	const second = id("#second");
	const check = (expected: number[]) => {
		expect([...queries.matchingSpecificities(".start ~ .item").keys()]).toEqual(
			expected,
		);
		expect(queries.querySelectorAll(".start ~ .item")).toEqual(expected);
	};
	check([first]);
	tree.append(right, marker);
	check([]);
	tree.append(right, second);
	check([second]);
	tree.removeAttribute(marker, "class");
	check([]);
	tree.setAttribute(marker, "class", "start");
	check([second]);
	tree.remove(marker);
	check([]);
	tree.append(left, marker);
	check([]);
	tree.append(left, first);
	check([first]);
});

it("does not reuse sibling answers across target and pointer states", () => {
	const { tree, queries, id } = fixture(
		"<main><b id=marker class=start></b><i id=first class=item></i><i id=second class=item></i></main>",
	);
	const marker = id("#marker");
	const first = id("#first");
	const second = id("#second");
	for (const [target, expected] of [
		[marker, [first, second]],
		[first, [second]],
		[null, []],
	] as const) {
		tree.setTargetElement(target);
		expect(queries.querySelectorAll(":target ~ .item")).toEqual(expected);
	}
	for (const hovered of [marker, first, null]) {
		tree.setPointerState(hovered, null);
		expect([
			...queries.matchingSpecificities(".start:hover ~ .item").keys(),
		]).toEqual(hovered === marker ? [first, second] : []);
	}
});

it("charges exact operation budgets and discards failed-operation caches", () => {
	const { queries } = wideFixture(64);
	const selector = ".start ~ .item";
	queries.matchingSpecificities(selector);
	queries.matchingSpecificities(selector);
	const work = queries.metrics().lastWork;
	expect(work).toBeGreaterThan(1);
	for (let repeat = 0; repeat < 2; repeat++) {
		expect(() => queries.matchingSpecificities(selector, work - 1)).toThrow(
			"Query work limit exceeded",
		);
		expect(queries.matchingSpecificities(selector, work).size).toBe(0);
		expect(queries.metrics().lastWork).toBe(work);
	}
});

it("bounds sibling memo storage and releases owners after failure", () => {
	const { tree } = wideFixture(8);
	const queries = new DocumentQueries(tree, { maxMemoEntries: 2 });
	for (let repeat = 0; repeat < 2; repeat++) {
		expect(() => queries.matchingSpecificities(".start ~ .item")).toThrow(
			"Query memo limit exceeded",
		);
		expect(queries.matchingSpecificities(".item").size).toBe(8);
	}
	queries.close();
	expect(queries.metrics().indexedNodes).toBe(0);
	expect(queries.metrics().closed).toBe(true);
	expect(() => queries.matchingSpecificities(".start ~ .item")).toThrow(
		"Document queries are closed",
	);
});
