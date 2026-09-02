import { describe, expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptCollections } from "./script-collections.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

interface Collection {
	readonly length: number;
	readonly [index: number]: number | undefined;
	item(index: unknown): number | null;
	namedItem(name: unknown): number | null;
}

function factory(definition: ScriptHostObjectDefinition): object {
	const indexed = definition.indexed;
	if (!indexed) throw new Error("Expected indexed capability");
	const target = Object.create(null);
	Object.defineProperty(target, "length", { get: indexed.length });
	Object.assign(target, definition.methods);
	return new Proxy(target, {
		get(object, key) {
			if (
				typeof key === "string" &&
				String(Number(key)) === key &&
				Number(key) >= 0
			)
				return Number(key) < indexed.length()
					? indexed.get(Number(key))
					: undefined;
			return Reflect.get(object, key);
		},
	});
}

function fixture(limits = {}) {
	const tree = parseHtmlDocument(
		'<main id="root"><p id="first" class="a b">one</p><div id="nested"><p name="named" class="a">two</p></div><!-- gap --><p id="last" class="b">three</p></main>',
		"https://example.com/",
	);
	const store = new ScriptCollections(
		tree,
		{ createHostObject: factory },
		(id) => id,
		limits,
	);
	const root = [...tree.walk()].find(
		(entry) => entry.node.attributes.id === "root",
	)?.node.id;
	const first = [...tree.walk()].find(
		(entry) => entry.node.attributes.id === "first",
	)?.node.id;
	const last = [...tree.walk()].find(
		(entry) => entry.node.attributes.id === "last",
	)?.node.id;
	if (root === undefined || first === undefined || last === undefined)
		throw new Error("Missing collection fixture nodes");
	return { tree, store, root, first, last };
}

describe("live HTML collections", () => {
	it("queries descendant tags in tree order and excludes the owner", () => {
		const { tree, store, root, first, last } = fixture();
		const list = store.get(root, "tag", "P") as Collection;
		expect(list.length).toBe(3);
		expect(list[0]).toBe(first);
		expect(list[2]).toBe(last);
		expect((store.get(root, "tag", "main") as Collection).length).toBe(0);
		expect((store.get(tree.root, "tag", "main") as Collection)[0]).toBe(root);
		expect((store.get(root, "tag", "*") as Collection).length).toBe(4);
	});
	it("reflects insertion, removal, reparenting and reordering through a saved collection", () => {
		const { tree, store, root, first, last } = fixture();
		const list = store.get(root, "tag", "p") as Collection;
		tree.remove(first);
		expect(list.length).toBe(2);
		tree.append(root, first);
		expect(list[2]).toBe(first);
		const before = tree.get(root).children[0];
		if (before === undefined) throw new Error("Missing insertion target");
		tree.insert(root, last, before);
		expect(list[0]).toBe(last);
	});
	it("matches all ASCII-space-separated classes without parsing CSS", () => {
		const { tree, store, root, first } = fixture();
		const list = store.get(root, "class", "\ta  b a\n") as Collection;
		expect(list.length).toBe(1);
		expect(list[0]).toBe(first);
		tree.setAttribute(first, "class", "a");
		expect(list.length).toBe(0);
		tree.setAttribute(first, "class", "a b");
		expect(list.length).toBe(1);
		tree.setAttribute(first, "class", "a#b");
		expect((store.get(root, "class", "a#b") as Collection)[0]).toBe(first);
		expect((store.get(root, "class", " \n") as Collection).length).toBe(0);
		expect((store.get(root, "class", "a\u00a0b") as Collection).length).toBe(0);
	});
	it("keeps children direct and element-only, with stable collection identity", () => {
		const { tree, store, root, first } = fixture();
		const list = store.get(root, "children") as Collection;
		expect(list.length).toBe(3);
		expect(store.get(root, "children")).toBe(list);
		tree.append(root, tree.createText("text"));
		expect(list.length).toBe(3);
		tree.remove(first);
		expect(list.length).toBe(2);
	});
	it("looks up id or name in tree order and sees attribute changes", () => {
		const { tree, store, root, first, last } = fixture();
		const list = store.get(root, "tag", "p") as Collection;
		expect(list.namedItem("first")).toBe(first);
		expect(list.namedItem("named")).toBe(list[1]);
		expect(list.namedItem("")).toBeNull();
		tree.setAttribute(first, "name", "last");
		expect(list.namedItem("last")).toBe(first);
		tree.removeAttribute(first, "name");
		expect(list.namedItem("last")).toBe(last);
	});
	it("distinguishes undefined index reads from null item results and converts unsigned indices", () => {
		const { store, root, first } = fixture();
		const list = store.get(root, "tag", "p") as Collection;
		expect(list[99]).toBeUndefined();
		expect(list.item(99)).toBeNull();
		expect(list.item(-1)).toBeNull();
		expect(list.item(0.9)).toBe(first);
		expect(list.item(4_294_967_296)).toBe(first);
		expect(list.item(Number.NaN)).toBe(first);
		expect(() => list.item({})).toThrow(/conversion/i);
		expect(() => (list.item as () => unknown)()).toThrow();
	});
	it("preserves detached subtree queries until the document is closed", () => {
		const { tree, store, root } = fixture();
		const list = store.get(root, "tag", "p") as Collection;
		tree.remove(root);
		expect(list.length).toBe(3);
		tree.close();
		expect(() => list.length).toThrow();
	});
	it("invalidates collections on close and drops cached entries", () => {
		const { store, root } = fixture();
		const list = store.get(root, "tag", "p") as Collection;
		expect(list.length).toBe(3);
		store.close();
		expect(store.stats.cachedEntries).toBe(0);
		expect(() => list.length).toThrow(/closed/i);
		expect(() => list.item(0)).toThrow(/closed/i);
	});
	it("reuses revision caches and refreshes after changes", () => {
		const { tree, store, root, first } = fixture();
		const list = store.get(root, "tag", "p") as Collection;
		expect(list.length).toBe(3);
		const refreshed = store.stats.refreshes;
		expect(list[0]).toBe(first);
		expect(list.item(0)).toBe(first);
		expect(store.stats.refreshes).toBe(refreshed);
		tree.setAttribute(first, "title", "changed");
		expect(list[0]).toBe(first);
		expect(store.stats.refreshes).toBe(refreshed + 1);
	});
	it("bounds collection count without evicting still-live capabilities", () => {
		const { store, root } = fixture({ maxCollections: 1 });
		const list = store.get(root, "tag", "p") as Collection;
		expect(() => store.get(root, "tag", "div")).toThrow(/limit/i);
		expect(list.length).toBe(3);
	});
	it("bounds per-refresh work, results and aggregate cache retention", () => {
		for (const limits of [
			{ maxWork: 1 },
			{ maxItems: 2 },
			{ maxCachedEntries: 2 },
		]) {
			const { store, root } = fixture(limits);
			const list = store.get(root, "tag", "p") as Collection;
			expect(() => list.length).toThrow(/limit/i);
			expect(store.stats.cachedEntries).toBe(0);
		}
	});
	it("bounds query size and validates limit configuration", () => {
		const { store, root } = fixture({ maxQueryCodeUnits: 2 });
		expect(() => store.get(root, "tag", "long")).toThrow(/limit/i);
		expect(() => fixture({ maxCollections: 0 })).toThrow();
	});
});
