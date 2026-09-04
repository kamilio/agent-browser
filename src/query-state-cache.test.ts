import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries, type QueryLimits } from "./selectors.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(maxChanges = 1024) {
	const tree = parseHtmlDocument(
		'<main id="main"><div id="target" class="item" tabindex="0"><span id="text">before</span></div><label id="label" for="check" class="item">Check</label><input id="check" type="checkbox" class="item"><div id="other" class="item" tabindex="0"></div><section id="second"></section></main>',
		"https://fixture.invalid/start",
		{ limits: { maxChanges } },
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const value = queries.querySelector(selector);
		if (value === null) throw new Error(`Missing ${selector}`);
		return value;
	};
	const ids = {
		main: id("#main"),
		target: id("#target"),
		label: id("#label"),
		check: id("#check"),
		other: id("#other"),
		second: id("#second"),
		text: tree.get(id("#text")).children[0],
	};
	return { tree, queries, ids };
}
function outcome(run: () => unknown) {
	try {
		return { value: run() };
	} catch (error) {
		if (!(error instanceof AgentBrowserError)) throw error;
		return { code: error.code, message: error.message };
	}
}
function compare(
	tree: DocumentTree,
	queries: DocumentQueries,
	selectors: readonly string[],
	root = tree.root,
) {
	const fresh = new DocumentQueries(tree, queries.limits);
	try {
		for (const selector of selectors)
			expect(outcome(() => queries.querySelectorAll(selector, root))).toEqual(
				outcome(() => fresh.querySelectorAll(selector, root)),
			);
	} finally {
		fresh.close();
	}
}

it.each(["pointer", "activation", "focus", "target"] as const)(
	"reuses topology for %s while rebuilding the relevant state",
	(kind) => {
		const { tree, queries, ids } = fixture();
		const before = queries.metrics();
		if (kind === "pointer") tree.setPointerState(ids.target, ids.other);
		if (kind === "activation") tree.setKeyboardActivation(ids.target);
		if (kind === "focus") tree.setActiveElement(ids.target);
		if (kind === "target") tree.setTargetElement(ids.target);
		compare(tree, queries, [
			":hover",
			":active",
			":focus",
			":focus-within",
			":target",
			".item:nth-child(2n)",
		]);
		expect(queries.metrics()).toMatchObject({
			structuralBuilds: before.structuralBuilds,
			structuralNodesBuilt: before.structuralNodesBuilt,
			stateRefreshes: before.stateRefreshes + 1,
		});
	},
);

it("refreshes all interacting state fields together, including focus clearing keyboard activation", () => {
	const { tree, queries, ids } = fixture();
	tree.setPointerState(ids.label, ids.other);
	tree.setKeyboardActivation(ids.check);
	tree.setTargetElement(ids.target);
	compare(tree, queries, [":hover", ":active", ":target"]);
	expect(queries.matches(ids.check, ":hover:active")).toBe(true);
	tree.setActiveElement(ids.target);
	compare(tree, queries, [":hover", ":active", ":target", ":focus-within"]);
	expect(queries.matches(ids.check, ":active")).toBe(false);
	expect(queries.metrics().structuralBuilds).toBe(1);
});

it("preserves old result snapshots and does not cache matched results across state changes", () => {
	const { tree, queries, ids } = fixture();
	tree.setPointerState(ids.target, null);
	const snapshot = queries.querySelectorAll(".item:hover");
	tree.setPointerState(ids.other, null);
	expect(queries.querySelectorAll(".item:hover")).toEqual([ids.other]);
	expect(snapshot).toEqual([ids.target]);
	expect(Object.isFrozen(snapshot)).toBe(true);
	expect(queries.metrics().structuralBuilds).toBe(1);
});

it("does not refresh any index for unchanged document revision", () => {
	const { tree, queries, ids } = fixture();
	tree.setPointerState(ids.target, null);
	queries.matches(ids.target, ":hover");
	const before = queries.metrics();
	tree.setPointerState(ids.target, null);
	queries.matches(ids.target, ":hover");
	expect(queries.metrics()).toEqual(before);
});

it.each([
	"attribute",
	"text",
	"control",
	"insert",
	"remove",
	"style",
	"location",
] as const)(
	"falls back to full rebuilding for %s even when followed by pointer state",
	(kind) => {
		const { tree, queries, ids } = fixture();
		const before = queries.metrics();
		if (kind === "attribute") tree.setAttribute(ids.target, "class", "changed");
		if (kind === "text") tree.setData(ids.text, "");
		if (kind === "control") tree.setControl(ids.check, { checked: true });
		if (kind === "insert")
			tree.append(ids.main, tree.createElement("aside", { class: "added" }));
		if (kind === "remove") tree.remove(ids.other);
		if (kind === "style") tree.invalidatePresentation();
		if (kind === "location") tree.setUrl("https://fixture.invalid/next");
		tree.setPointerState(ids.label, null);
		compare(tree, queries, [
			".changed",
			":empty",
			":checked",
			".added",
			":hover",
			":last-child",
			":nth-child(2n)",
		]);
		expect(queries.metrics().structuralBuilds).toBe(
			before.structuralBuilds + 1,
		);
		expect(queries.metrics().stateRefreshes).toBe(before.stateRefreshes);
	},
);

it("rebuilds after a truncated journal even if the surviving changes are state-only", () => {
	const { tree, queries, ids } = fixture(2);
	const before = queries.metrics();
	tree.setAttribute(ids.target, "class", "changed");
	tree.setPointerState(ids.label, null);
	tree.setKeyboardActivation(ids.check);
	tree.setTargetElement(ids.other);
	compare(tree, queries, [".changed", ":active", ":hover", ":target"]);
	expect(queries.metrics().structuralBuilds).toBe(before.structuralBuilds + 1);
	expect(queries.metrics().stateRefreshes).toBe(before.stateRefreshes);
});

it("switches roots conservatively and keeps detached state/control behavior", () => {
	const { tree, queries, ids } = fixture();
	const detached = tree.createElement("section");
	const child = tree.createElement("input", { type: "checkbox" });
	tree.append(detached, child);
	compare(tree, queries, ["*", ":hover", ":checked"], detached);
	const before = queries.metrics();
	tree.setPointerState(ids.target, null);
	compare(tree, queries, ["*", ":hover", ":active", ":checked"], detached);
	expect(queries.metrics().structuralBuilds).toBe(before.structuralBuilds);
	compare(tree, queries, ["*", ":hover"]);
	expect(queries.metrics().structuralBuilds).toBe(before.structuralBuilds + 1);
});

it("retains label, sibling, ancestry and focus correctness through mixed mutations", () => {
	const { tree, queries, ids } = fixture();
	const selectors = [
		":hover",
		":active",
		":focus-within",
		":target",
		":checked",
		".item:nth-child(2n)",
		"main:has(> :hover)",
		"#target:has(span:empty)",
		"label + input",
		":is(.changed, :active):not(:target)",
		"main > :nth-child(2 of .item, :hover)",
	];
	for (let turn = 0; turn < 12; turn++) {
		const operations = [
			() => tree.setPointerState(turn % 2 ? ids.label : ids.other, ids.target),
			() => tree.setActiveElement(turn % 2 ? ids.check : ids.target),
			() => tree.setKeyboardActivation(turn % 2 ? ids.target : null),
			() => tree.setTargetElement(turn % 2 ? ids.other : null),
			() => tree.setControl(ids.check, { checked: turn % 2 === 0 }),
			() => tree.setAttribute(ids.label, "for", turn % 2 ? "check" : "missing"),
			() => tree.setData(ids.text, turn % 2 ? "" : "changed"),
			() =>
				tree.setAttribute(
					ids.target,
					"class",
					turn % 2 ? "item changed" : "item",
				),
			() => tree.append(ids.second, ids.other),
			() => tree.remove(ids.other),
			() => tree.append(ids.main, ids.other),
		];
		for (const operation of operations) {
			operation();
			compare(tree, queries, selectors);
		}
	}
	expect(queries.metrics().stateRefreshes).toBeGreaterThan(0);
	expect(queries.metrics().structuralBuilds).toBeGreaterThan(1);
});

it("does not reuse label-control associations after an attribute change", () => {
	const { tree, queries, ids } = fixture();
	tree.setPointerState(ids.label, null);
	expect(queries.matches(ids.check, ":hover")).toBe(true);
	tree.setAttribute(ids.label, "for", "other");
	tree.setPointerState(ids.label, ids.target);
	compare(tree, queries, [":hover", ":active"]);
	expect(queries.matches(ids.check, ":hover")).toBe(false);
});

it.each([
	{ maxWork: 1 },
	{ maxResults: 1 },
	{ maxMemoEntries: 1 },
] satisfies Partial<QueryLimits>[])(
	"preserves work/output/memo failures with limits %j",
	(limits) => {
		const { tree, queries, ids } = fixture();
		queries.close();
		const bounded = new DocumentQueries(tree, limits);
		try {
			outcome(() => bounded.matches(ids.target, "*"));
			tree.setPointerState(ids.target, ids.other);
			compare(tree, bounded, [
				":hover",
				"main > :nth-child(2n of .item)",
				"main:has(> :hover)",
			]);
			expect(bounded.metrics().structuralBuilds).toBe(1);
			expect(bounded.metrics().stateRefreshes).toBe(1);
		} finally {
			bounded.close();
		}
	},
);

it("does not bypass a failed structural node budget", () => {
	const { tree, ids } = fixture();
	const bounded = new DocumentQueries(tree, { maxIndexedNodes: 2 });
	try {
		expect(() => bounded.matches(ids.target, "*")).toThrow("node index limit");
		tree.setPointerState(ids.target, null);
		expect(() => bounded.matches(ids.target, ":hover")).toThrow(
			"node index limit",
		);
		expect(bounded.metrics()).toMatchObject({
			indexedNodes: 0,
			structuralBuilds: 0,
			stateRefreshes: 0,
		});
	} finally {
		bounded.close();
	}
});

it("releases both structural data and state membership at closure", () => {
	const { tree, queries, ids } = fixture();
	tree.setPointerState(ids.target, null);
	queries.querySelector(":hover");
	queries.close();
	expect(queries.metrics()).toMatchObject({
		indexedNodes: 0,
		cachedSelectors: 0,
		closed: true,
	});
	expect(() => queries.querySelector(":hover")).toThrow("closed");
});
