import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	DocumentQueries,
	supportsCssSelector,
	validateSelectorSyntax,
} from "./selectors.js";
import type { QueryLimits } from "./selectors.js";

interface NestingContext {
	readonly selector: string;
	readonly parent?: NestingContext;
}

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function nesting(selector: string, parent?: NestingContext): NestingContext {
	return Object.freeze({ selector, parent });
}

function growingNesting(selector: string, additions = ""): NestingContext {
	const branch = `${"&".repeat(16)}${additions}`;
	let context = nesting(selector);
	for (let depth = 0; depth < 13; depth++) context = nesting(branch, context);
	return context;
}

function validate(selector: string, context: NestingContext) {
	const options = { pseudoElements: true, nesting: context };
	validateSelectorSyntax(selector, options);
}

function styles(
	queries: DocumentQueries,
	selector: string,
	context: NestingContext,
	maxWork?: number,
) {
	const matching = queries.matchingStyleSpecificities as (
		selector: string,
		maxWork?: number,
		context?: NestingContext,
	) => ReturnType<DocumentQueries["matchingStyleSpecificities"]>;
	return matching.call(queries, selector, maxWork, context);
}

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/selector-nesting");
	documents.push(tree);
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
	const parent = add("section", "parent", body, { class: "parent" });
	const first = add("span", "first", parent, {
		class: "item leaf &",
		"data-mark": "&",
	});
	add("b", "deep", first, { class: "leaf" });
	add("span", "second", parent, { class: "item leaf" });
	const other = add("section", "other", body, { class: "other" });
	add("span", "outside", other, {
		class: "item leaf &",
		"data-mark": "&",
	});
	add("p", "tail", body, { class: "tail" });
	return { tree, ids, add, queries: new DocumentQueries(tree) };
}

it.each([
	["&", ".parent", ["parent"], [0, 1, 0]],
	[".leaf", ".parent", ["first", "deep", "second"], [0, 2, 0]],
	["& .leaf", ".parent", ["first", "deep", "second"], [0, 2, 0]],
	["> .leaf", ".parent", ["first", "second"], [0, 2, 0]],
	["+ .other", ".parent", ["other"], [0, 2, 0]],
	["~ .tail", ".parent", ["tail"], [0, 2, 0]],
	["> &", ".parent, .item", ["first", "second"], [0, 2, 0]],
	[".other &", ".item", ["outside"], [0, 2, 0]],
	["section&", ".parent", ["parent"], [0, 1, 1]],
	["&&", ".parent", ["parent"], [0, 2, 0]],
	[":is(&)", ".parent", ["parent"], [0, 1, 0]],
	[":where(&)", ".parent", ["parent"], [0, 0, 0]],
	[".item:not(&)", "#first", ["second", "outside"], [1, 1, 0]],
	[":has(> &)", ".item", ["parent", "other"], [0, 1, 0]],
	[":nth-child(2 of &)", ".item", ["second"], [0, 2, 0]],
	["[data-mark='&']", ".parent", ["first"], [0, 2, 0]],
	[".\\&", ".parent", ["first"], [0, 2, 0]],
	[".\\26 ", ".parent", ["first"], [0, 2, 0]],
	["/* & */ .leaf", ".parent", ["first", "deep", "second"], [0, 2, 0]],
	[":is([data-mark='&'])", ".parent", ["first"], [0, 2, 0]],
] as const)(
	"matches nested %s under %s with native specificity",
	(selector, parent, expected, specificity) => {
		const { queries, ids } = fixture();
		const context = nesting(parent);
		validate(selector, context);
		const result = styles(queries, selector, context);
		expect([...result.elements]).toEqual(
			expected.map((name) => [ids[name], specificity]),
		);
		expect(result.before.size).toBe(0);
		expect(result.after.size).toBe(0);
	},
);

it("keeps parent :scope independent of a containing :has anchor", () => {
	const { queries, ids } = fixture();
	const context = nesting(":scope > body > .parent");
	expect([...styles(queries, ":has(> &)", context).elements]).toEqual([
		[ids.body, [0, 2, 1]],
	]);
});

it("uses the entire parent list maximum rather than the matching branch", () => {
	const { queries, ids } = fixture();
	const context = nesting("#absent, .parent");
	expect([...styles(queries, "> .leaf", context).elements]).toEqual([
		[ids.first, [1, 1, 0]],
		[ids.second, [1, 1, 0]],
	]);
	expect([...styles(queries, "&", context).elements]).toEqual([
		[ids.parent, [1, 0, 0]],
	]);
	expect([
		...queries.matchingSpecificities("#absent .leaf, .parent .leaf"),
	]).toEqual([
		[ids.first, [0, 2, 0]],
		[ids.deep, [0, 2, 0]],
		[ids.second, [0, 2, 0]],
	]);
});

it("decides implicit ancestry independently for each child list branch", () => {
	const { queries, ids } = fixture();
	expect([...styles(queries, ".leaf, &", nesting(".parent")).elements]).toEqual(
		[
			[ids.parent, [0, 1, 0]],
			[ids.first, [0, 2, 0]],
			[ids.deep, [0, 2, 0]],
			[ids.second, [0, 2, 0]],
		],
	);
	expect([...styles(queries, "&, &&", nesting(".parent")).elements]).toEqual([
		[ids.parent, [0, 2, 0]],
	]);
});

it("includes generated parent branches when computing maximum specificity", () => {
	const { queries, ids } = fixture();
	const context = nesting(".parent, #absent::before");
	expect([...styles(queries, "&", context).elements]).toEqual([
		[ids.parent, [1, 0, 1]],
	]);
	expect([...styles(queries, "#first", context).elements]).toEqual([
		[ids.first, [2, 0, 1]],
	]);
});

it("never turns a pseudo-only parent into its originating element", () => {
	const { queries } = fixture();
	for (const parent of [".parent::before", ".parent::after"])
		for (const selector of ["&", ".leaf", "&::before", "&::after"]) {
			const result = styles(queries, selector, nesting(parent));
			expect(result.elements.size).toBe(0);
			expect(result.before.size).toBe(0);
			expect(result.after.size).toBe(0);
		}
});

it("matches generated child targets without leaking them into plain results", () => {
	const { queries, ids } = fixture();
	const context = nesting(".parent");
	const result = styles(queries, "&::before, &::after", context);
	expect(result.elements.size).toBe(0);
	expect([...result.before]).toEqual([[ids.parent, [0, 1, 1]]]);
	expect([...result.after]).toEqual([[ids.parent, [0, 1, 1]]]);
	const options = { pseudoElements: false, nesting: context };
	expect(() => validateSelectorSyntax("&::before", options)).toThrow(
		"pseudo-element targets",
	);
	expect(() => validateSelectorSyntax("&", options)).not.toThrow();
});

it("restores generated matching context across mixed branches and memo hits", () => {
	const { queries, ids } = fixture();
	const context = nesting(".parent::before, .other");
	for (const selector of ["&::before, &", "&, &::before"]) {
		const result = styles(queries, selector, context);
		expect([...result.elements]).toEqual([[ids.other, [0, 1, 1]]]);
		expect([...result.before]).toEqual([[ids.other, [0, 1, 2]]]);
		expect(result.after.size).toBe(0);
	}
});

it("links multiple nesting levels without selector-list distribution", () => {
	const { queries, ids } = fixture();
	const context = nesting(".leaf", nesting("#absent, .parent"));
	expect([...styles(queries, "&", context).elements]).toEqual([
		[ids.first, [1, 1, 0]],
		[ids.deep, [1, 1, 0]],
		[ids.second, [1, 1, 0]],
	]);
	expect([...styles(queries, "b&", context).elements]).toEqual([
		[ids.deep, [1, 1, 1]],
	]);
});

it("bounds repeated parent matching in a sixteen-level doubled chain", () => {
	const { queries, ids } = fixture();
	let context = nesting(".parent");
	for (let depth = 1; depth < 16; depth++) context = nesting("&&", context);
	validate("&&", context);
	expect([...styles(queries, "&&", context, 10_000).elements]).toEqual([
		[ids.parent, [0, 65_536, 0]],
	]);
	expect(queries.metrics().lastWork).toBeLessThan(10_000);
});

it("rejects invalid type order and preserves strict native unsupported errors", () => {
	const { queries } = fixture();
	const context = nesting(".parent");
	for (const selector of ["&section", "&*", "& >", ":has(:has(&))"])
		for (const operation of [
			() => validate(selector, context),
			() => styles(queries, selector, context),
		])
			expect(operation).toThrow("Invalid selector");
	for (const selector of [
		"&::before.foo",
		":is(&::before)",
		":unknown(&)",
		":is(&, :unknown)",
	])
		for (const operation of [
			() => validate(selector, context),
			() => styles(queries, selector, context),
		])
			expect(operation).toThrow("Unsupported selector");
	expect(queries.metrics().indexedNodes).toBe(0);
	expect(queries.metrics().cachedSelectors).toBe(0);
});

it("does not enable nesting in flat queries, matches or selector supports", () => {
	const { queries, ids } = fixture();
	styles(queries, "&", nesting(".parent"));
	for (const selector of ["&", "& .leaf", ":is(&)", "> .leaf"])
		for (const operation of [
			() => validateSelectorSyntax(selector),
			() => queries.querySelector(selector),
			() => queries.querySelectorAll(selector),
			() => queries.matches(ids.parent, selector),
			() => queries.closest(ids.first, selector),
			() => queries.matchingSpecificities(selector),
			() => queries.matchingPseudoSpecificities(selector, "before"),
			() => queries.matchingStyleSpecificities(selector),
		])
			expect(operation).toThrow("Invalid selector");
	expect(supportsCssSelector("&")).toBe(false);
	expect(supportsCssSelector(":is(&)")).toBe(false);
	expect(supportsCssSelector(".parent")).toBe(true);
	expect(queries.matches(ids.parent, ".parent")).toBe(true);
});

it("rechecks inherited native control state after cached parent mutations", () => {
	const { queries, tree, ids, add } = fixture();
	const toggle = add("input", "toggle", ids.body, { type: "checkbox" });
	const context = nesting("&", nesting("input:checked"));
	expect(styles(queries, "&", context).elements.size).toBe(0);
	tree.setControl(toggle, { checked: true });
	expect([...styles(queries, "&", context).elements]).toEqual([
		[toggle, [0, 1, 1]],
	]);
	tree.setControl(toggle, { checked: false });
	expect(styles(queries, "&", context).elements.size).toBe(0);
	expect(queries.metrics().cachedSelectors).toBe(1);
});

it.each(["placeholder-shown", "invalid"])(
	"inherits %s value dependence through the parent AST",
	(pseudo) => {
		const { queries, tree, ids, add } = fixture();
		const field = add("input", "field", ids.body, {
			placeholder: "Type here",
			required: "",
		});
		const context = nesting("&", nesting(`input:${pseudo}`));
		expect([...styles(queries, "&", context).elements]).toEqual([
			[field, [0, 1, 1]],
		]);
		expect(queries.metrics().controlValueDependent).toBe(true);
		tree.setControl(field, { value: "filled" });
		expect(styles(queries, "&", context).elements.size).toBe(0);
		tree.setControl(field, { value: "" });
		expect([...styles(queries, "&", context).elements.keys()]).toEqual([field]);
	},
);

it("rechecks inherited hover and focus without replacing structural indexes", () => {
	const { queries, tree, ids } = fixture();
	tree.setAttribute(ids.other, "tabindex", "0");
	const context = nesting("&", nesting(".parent:hover, .other:focus"));
	expect(styles(queries, "&", context).elements.size).toBe(0);
	const builds = queries.metrics().structuralBuilds;
	tree.setPointerState(ids.first, null);
	expect([...styles(queries, "&", context).elements.keys()]).toEqual([
		ids.parent,
	]);
	tree.setPointerState(null, null);
	tree.setActiveElement(ids.other);
	expect([...styles(queries, "&", context).elements.keys()]).toEqual([
		ids.other,
	]);
	tree.setActiveElement(null);
	expect(styles(queries, "&", context).elements.size).toBe(0);
	expect(queries.metrics().structuralBuilds).toBe(builds);
});

it("invalidates parent matching after attribute changes and subtree moves", () => {
	const { queries, tree, ids } = fixture();
	const context = nesting(".parent");
	expect([...styles(queries, ".item", context).elements.keys()]).toEqual([
		ids.first,
		ids.second,
	]);
	tree.append(ids.other, ids.second);
	expect([...styles(queries, ".item", context).elements.keys()]).toEqual([
		ids.first,
	]);
	tree.setAttribute(ids.parent, "class", "retired");
	tree.setAttribute(ids.other, "class", "parent");
	expect([...styles(queries, ".item", context).elements.keys()]).toEqual([
		ids.outside,
		ids.second,
	]);
	tree.remove(ids.other);
	expect(styles(queries, ".item", context).elements.size).toBe(0);
});

it("isolates flat queries and distinct, equivalent or mutated context chains", () => {
	const { queries, ids } = fixture();
	const mutable = { selector: ".parent" };
	expect([...styles(queries, ".item", mutable).elements.keys()]).toEqual([
		ids.first,
		ids.second,
	]);
	expect([
		...styles(queries, ".item", nesting(".parent")).elements.keys(),
	]).toEqual([ids.first, ids.second]);
	expect(queries.metrics().cachedSelectors).toBe(1);
	mutable.selector = ".other";
	expect([...styles(queries, ".item", mutable).elements.keys()]).toEqual([
		ids.outside,
	]);
	expect([
		...queries.matchingStyleSpecificities(".item").elements.keys(),
	]).toEqual([ids.first, ids.second, ids.outside]);
	for (const [parent, expected] of [
		[".parent", [ids.first, ids.second]],
		[".other", [ids.outside]],
	] as const)
		expect([
			...styles(
				queries,
				"&",
				nesting(".item", nesting(parent)),
			).elements.keys(),
		]).toEqual(expected);
});

it("preflights cycles and malformed contexts before indexing or caching", () => {
	const { queries } = fixture();
	const cycle: { selector: string; parent?: NestingContext } = {
		selector: ".parent",
	};
	cycle.parent = cycle;
	const first: { selector: string; parent?: NestingContext } = {
		selector: ".parent",
	};
	first.parent = nesting("&", first);
	for (const invalid of [
		cycle,
		first,
		null,
		[],
		".parent",
		{},
		{ selector: 1 },
		{ selector: ".parent", parent: null },
		{ selector: "" },
		{ selector: "&" },
	]) {
		const context = invalid as NestingContext;
		expect(() => validate("&", context)).toThrow("Invalid selector");
		expect(() => styles(queries, "&", context)).toThrow("Invalid selector");
		expect(queries.metrics().indexedNodes).toBe(0);
		expect(queries.metrics().cachedSelectors).toBe(0);
	}
});

it("bounds parent chain depth before native tree indexing", () => {
	const { queries, tree } = fixture();
	let context = nesting(".parent");
	for (let depth = 1; depth < 17; depth++) context = nesting("&", context);
	expect(() => validate("&", context)).toThrow("nesting context limit");
	expect(() => styles(queries, "&", context)).toThrow("nesting context limit");
	expect(queries.metrics().indexedNodes).toBe(0);
	expect(queries.metrics().cachedSelectors).toBe(0);
	const bounded = new DocumentQueries(tree, { maxNesting: 1 });
	expect(() => styles(bounded, "&", nesting("&", nesting(".parent")))).toThrow(
		"nesting context limit",
	);
	expect(bounded.metrics().indexedNodes).toBe(0);
});

it("bounds the combined context source length including the child selector", () => {
	const { queries } = fixture();
	const padding = "x".repeat(8192 - ".parent/**/".length - 1);
	const accepted = nesting(`.parent/*${padding}*/`);
	expect(() => validate("&", accepted)).not.toThrow();
	const rejected = nesting(`${accepted.selector} `);
	expect(() => validate("&", rejected)).toThrow("text limit");
	expect(() => styles(queries, "&", rejected)).toThrow("text limit");
	expect(queries.metrics().indexedNodes).toBe(0);
	expect(queries.metrics().cachedSelectors).toBe(0);
	const combined = nesting("&".repeat(200), nesting(`.parent/*${padding}*/`));
	expect(() => styles(queries, "&", combined)).toThrow("text limit");
});

it("retains component and functional nesting bounds in both parent and child", () => {
	const { tree, ids } = fixture();
	const bounded = new DocumentQueries(tree, {
		maxComponents: 2,
		maxNesting: 1,
	});
	expect([
		...styles(bounded, ".leaf", nesting(".parent")).elements.keys(),
	]).toEqual([ids.first, ids.deep, ids.second]);
	for (const [selector, context] of [
		["&&&", nesting(".parent")],
		["&", nesting(".parent.parent.parent")],
		[".leaf.item", nesting(".parent")],
	] as const)
		expect(() => styles(bounded, selector, context)).toThrow("component limit");
	const functional = new DocumentQueries(tree, { maxNesting: 1 });
	expect(() => styles(functional, ":is(:is(&))", nesting(".parent"))).toThrow(
		"nesting limit",
	);
	expect(() => styles(functional, "&", nesting(":is(:is(.parent))"))).toThrow(
		"nesting limit",
	);
	expect(() => validate("&".repeat(257), nesting(".parent"))).toThrow(
		"component limit",
	);
});

it("charges native work and enforces node, result and memo limits", () => {
	const { tree, queries } = fixture();
	const context = nesting(".parent");
	const limits: [Partial<QueryLimits>, string][] = [
		[{ maxWork: 1 }, "work limit"],
		[{ maxIndexedNodes: 2 }, "node index limit"],
		[{ maxResults: 1 }, "result limit"],
		[{ maxMemoEntries: 1 }, "memo limit"],
	];
	for (const [limit, message] of limits) {
		const bounded = new DocumentQueries(tree, limit);
		expect(() => styles(bounded, ".leaf", context)).toThrow(message);
	}
	expect(() => styles(queries, "&", context, 1)).toThrow("work limit");
	for (const budget of [0, -1, 1.5, queries.limits.maxWork + 1])
		expect(() => styles(queries, "&", context, budget)).toThrow(
			"Invalid selector work budget",
		);
});

it.each(["queries", "document"])(
	"bounds context cache entries and releases all owners on %s close",
	(owner) => {
		const { tree, ids } = fixture();
		const queries = new DocumentQueries(tree, { maxCachedSelectors: 2 });
		for (const parent of [".parent", ".other", ".item", ".parent"]) {
			styles(queries, "&", nesting(parent));
			expect(queries.metrics().cachedSelectors).toBeLessThanOrEqual(2);
		}
		expect([...styles(queries, "&", nesting(".parent")).elements]).toEqual([
			[ids.parent, [0, 1, 0]],
		]);
		expect(queries.metrics().cachedSelectors).toBe(2);
		expect(queries.metrics().indexedNodes).toBeGreaterThan(0);
		if (owner === "queries") queries.close();
		else tree.close();
		expect(queries.metrics()).toMatchObject({
			cachedSelectors: 0,
			indexedNodes: 0,
			controlValueDependent: false,
			closed: true,
		});
		expect(() => styles(queries, "&", nesting(".parent"))).toThrow("closed");
		queries.close();
	},
);

it.each([
	"[*|href]",
	"[|href]",
	"[xlink|href]",
	'[*|href="/first"]',
	'[|href="/first" i]',
	"[xlink/**/|href]",
	"[*/* namespace */|href]",
	"[\\78 link|href]",
])(
	"classifies unsupported attribute namespaces in %s consistently",
	(selector) => {
		const { queries, ids } = fixture();
		const error = expect.objectContaining({
			code: "unsupported",
			message: "Unsupported selector: attribute namespaces",
		});
		for (const operation of [
			() => validateSelectorSyntax(selector),
			() => queries.querySelector(selector),
			() => queries.querySelectorAll(selector),
			() => queries.matches(ids.first, selector),
			() => queries.matchingStyleSpecificities(selector),
			() => validate("&", nesting(selector)),
			() => styles(queries, "&", nesting(selector)),
		])
			expect(operation).toThrowError(error);
		for (const child of [selector, `&${selector}`, `:is(${selector}, &)`]) {
			expect(() => validate(child, nesting(".parent"))).toThrowError(error);
			expect(() => styles(queries, child, nesting(".parent"))).toThrowError(
				error,
			);
		}
		expect(supportsCssSelector(selector)).toBe(false);
		expect(queries.metrics()).toMatchObject({
			indexedNodes: 0,
			structuralBuilds: 0,
			cachedSelectors: 0,
		});
	},
);

it.each(["[lang|=en]", '[lang|="en"]', "[lang/**/|=en]"])(
	"preserves flat and nested dash matching in %s",
	(selector) => {
		const { queries, tree, ids } = fixture();
		tree.setAttribute(ids.first, "lang", "en-US");
		tree.setAttribute(ids.second, "lang", "en");
		tree.setAttribute(ids.outside, "lang", "en-GB");
		tree.setAttribute(ids.deep, "lang", "english");
		expect(() => validateSelectorSyntax(selector)).not.toThrow();
		expect(() => validate(selector, nesting(".parent"))).not.toThrow();
		expect(supportsCssSelector(selector)).toBe(true);
		expect(queries.querySelectorAll(selector)).toEqual([
			ids.first,
			ids.second,
			ids.outside,
		]);
		expect([...queries.matchingStyleSpecificities(selector).elements]).toEqual([
			[ids.first, [0, 1, 0]],
			[ids.second, [0, 1, 0]],
			[ids.outside, [0, 1, 0]],
		]);
		expect([...styles(queries, selector, nesting(".parent")).elements]).toEqual(
			[
				[ids.first, [0, 2, 0]],
				[ids.second, [0, 2, 0]],
			],
		);
	},
);

it("keeps malformed wildcard attribute names classified as invalid input", () => {
	const { queries } = fixture();
	for (const selector of ["[*href]", "[*]", "[* href]"]) {
		const error = expect.objectContaining({ code: "invalid-input" });
		expect(() => validateSelectorSyntax(selector)).toThrowError(error);
		expect(() => queries.querySelectorAll(selector)).toThrowError(error);
		expect(() => validate(selector, nesting(".parent"))).toThrowError(error);
		expect(() => styles(queries, selector, nesting(".parent"))).toThrowError(
			error,
		);
	}
	expect(queries.metrics().indexedNodes).toBe(0);
});

it.each(["#parent", ".parent", "section"])(
	"rejects unsafe specificity growth from %s before indexing",
	(parent) => {
		const { queries } = fixture();
		const context = growingNesting(parent);
		const error = expect.objectContaining({
			code: "resource-limit",
			message: "Selector specificity limit exceeded",
		});
		for (const selector of ["&&", ":is(&&)", ":has(&&)"]) {
			expect(() => validate(selector, context)).toThrowError(error);
			expect(() => styles(queries, selector, context)).toThrowError(error);
		}
		expect(() => validate("&", nesting("&&", context))).toThrowError(error);
		expect(() => styles(queries, "&", nesting("&&", context))).toThrowError(
			error,
		);
		expect(queries.metrics()).toMatchObject({
			indexedNodes: 0,
			structuralBuilds: 0,
			cachedSelectors: 0,
		});
	},
);

it.each(["#parent#parent&", "&#parent#parent"])(
	"rejects unsafe specificity regardless of selector order in %s",
	(selector) => {
		const { queries } = fixture();
		const error = expect.objectContaining({
			code: "resource-limit",
			message: "Selector specificity limit exceeded",
		});
		for (const context of [
			nesting("&&", growingNesting("#parent")),
			growingNesting("#parent", "#parent".repeat(15)),
		]) {
			expect(() => validate(selector, context)).toThrowError(error);
			expect(() => styles(queries, selector, context)).toThrowError(error);
		}
		expect(queries.metrics()).toMatchObject({
			indexedNodes: 0,
			structuralBuilds: 0,
			cachedSelectors: 0,
		});
	},
);

it("matches nearby safe specificity growth identically in either selector order", () => {
	const { queries, ids } = fixture();
	const context = growingNesting("#parent");
	for (const selector of ["#parent#parent&", "&#parent#parent"]) {
		validate(selector, context);
		expect([...styles(queries, selector, context).elements]).toEqual([
			[ids.parent, [2 ** 52 + 2, 0, 0]],
		]);
	}
});

it("matches the maximum safe integer and preserves zero :where specificity", () => {
	const { queries, ids } = fixture();
	const context = growingNesting("#parent", "#parent".repeat(15));
	for (const [selector, specificity] of [
		["&", Number.MAX_SAFE_INTEGER],
		[":is(&)", Number.MAX_SAFE_INTEGER],
		[":where(&&)", 0],
	] as const) {
		validate(selector, context);
		expect([...styles(queries, selector, context).elements]).toEqual([
			[ids.parent, [specificity, 0, 0]],
		]);
	}
});

it("guards nth-of specificity increments and accumulated class weights", () => {
	const { queries, ids } = fixture();
	const context = growingNesting(".parent", ".parent".repeat(15));
	const error = expect.objectContaining({
		code: "resource-limit",
		message: "Selector specificity limit exceeded",
	});
	for (const selector of [
		":nth-child(1 of &)",
		":nth-last-child(1 of &)",
		".parent&",
		"&.parent",
	]) {
		expect(() => validate(selector, context)).toThrowError(error);
		expect(() => styles(queries, selector, context)).toThrowError(error);
	}
	expect(queries.metrics()).toMatchObject({
		indexedNodes: 0,
		structuralBuilds: 0,
		cachedSelectors: 0,
	});
	expect([...styles(queries, "&", context).elements]).toEqual([
		[ids.parent, [0, Number.MAX_SAFE_INTEGER, 0]],
	]);
	const nearby = growingNesting(".parent");
	expect([...styles(queries, ":nth-child(1 of &)", nearby).elements]).toEqual([
		[ids.parent, [0, 2 ** 52 + 1, 0]],
	]);
});
