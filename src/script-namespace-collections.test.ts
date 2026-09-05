import { afterEach, describe, expect, it } from "vitest";
import { htmlNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	type ScriptCollectionLimits,
	ScriptCollections,
} from "./script-collections.js";
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
			if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key)) {
				const index = Number(key);
				return index < indexed.length() ? indexed.get(index) : undefined;
			}
			return Reflect.get(object, key);
		},
	});
}

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture(
	limits: Partial<ScriptCollectionLimits> = {},
	createHostObject = factory,
) {
	const tree = parseHtmlDocument(
		'<!doctype html><html><head></head><body><main id="root"><p id="first">one</p><div id="nested"><p id="middle" name="named">two</p></div><!-- gap --><p id="last">three</p></main></body></html>',
		"https://fixture.invalid/namespace-collections",
	);
	const store = new ScriptCollections(
		tree,
		{ createHostObject },
		(id) => id,
		limits,
	);
	cleanup.push(
		() => tree.close(),
		() => store.close(),
	);
	const find = (id: string) => {
		const match = [...tree.walk()].find(
			({ node }) => node.attributes.id === id,
		);
		if (!match) throw new Error(`Missing fixture node ${id}`);
		return match.node.id;
	};
	return {
		tree,
		store,
		root: find("root"),
		first: find("first"),
		middle: find("middle"),
		last: find("last"),
		nested: find("nested"),
	};
}

function ids(list: Collection) {
	return Array.from({ length: list.length }, (_, index) => list.item(index));
}

describe("native namespace collections", () => {
	it.each([htmlNamespace, "*"])(
		"matches HTML descendants for namespace %s with case-sensitive local names",
		(namespace) => {
			const { tree, store, root, first, middle, last, nested } = fixture();
			expect(
				ids(store.getByNamespace(root, namespace, "p") as Collection),
			).toEqual([first, middle, last]);
			for (const localName of ["P", "Main", "", "p ", "p,div", "[id]"])
				expect(
					(store.getByNamespace(root, namespace, localName) as Collection)
						.length,
				).toBe(0);
			expect(
				ids(store.getByNamespace(root, namespace, "*") as Collection),
			).toEqual([first, nested, middle, last]);
			expect(
				(store.getByNamespace(root, namespace, "main") as Collection).length,
			).toBe(0);
			expect(
				ids(store.getByNamespace(tree.root, namespace, "main") as Collection),
			).toEqual([root]);
			const all = ids(
				store.getByNamespace(tree.root, namespace, "*") as Collection,
			);
			expect(all).toEqual(
				[...tree.walk()]
					.filter(({ node }) => node.kind === "element")
					.map(({ node }) => node.id),
			);
			expect(tree.get(all[0] as number).tagName).toBe("html");
			expect((store.get(root, "tag", "P") as Collection).length).toBe(3);
		},
	);

	it.each([
		null,
		"",
		"null",
		"undefined",
		"urn:other",
		htmlNamespace.toUpperCase(),
		`${htmlNamespace}/`,
	])("returns empty collections for namespace %j", (namespace) => {
		const { store, root } = fixture();
		for (const localName of ["p", "*"]) {
			const list = store.getByNamespace(
				root,
				namespace,
				localName,
			) as Collection;
			expect(list.length).toBe(0);
			expect(list[0]).toBeUndefined();
			expect(list.item(0)).toBeNull();
			expect(list.namedItem("first")).toBeNull();
		}
	});

	it("keeps saved collections live and lazy through insertion, movement and detachment", () => {
		const { tree, store, root, first, middle, last, nested } = fixture();
		const list = store.getByNamespace(root, htmlNamespace, "p") as Collection;
		expect(store.stats.refreshes).toBe(0);
		expect(ids(list)).toEqual([first, middle, last]);
		expect(store.stats.refreshes).toBe(1);
		const added = tree.createElement("P");
		tree.append(root, added);
		expect(store.stats.refreshes).toBe(1);
		expect(ids(list)).toEqual([first, middle, last, added]);
		tree.remove(first);
		expect(ids(list)).toEqual([middle, last, added]);
		tree.insert(root, last, nested);
		expect(ids(list)).toEqual([last, middle, added]);
		tree.append(nested, first);
		expect(ids(list)).toEqual([last, middle, first, added]);
		tree.remove(root);
		expect(ids(list)).toEqual([last, middle, first, added]);
		expect(
			(store.getByNamespace(tree.root, htmlNamespace, "p") as Collection)
				.length,
		).toBe(0);
		expect(store.getByNamespace(root, htmlNamespace, "p")).toBe(list);
	});

	it("preserves template traversal boundaries and separate content-document collections", () => {
		const { tree, store, root, first, middle, last } = fixture();
		const template = tree.createElement("template");
		tree.append(root, template);
		const content = tree.templateContent(template);
		const hidden = content.tree.createElement("p");
		content.tree.append(content.id, hidden);
		expect(ids(store.getByNamespace(root, "*", "p") as Collection)).toEqual([
			first,
			middle,
			last,
		]);
		expect(
			ids(store.getByNamespace(root, "*", "template") as Collection),
		).toEqual([template]);
		expect(
			(store.getByNamespace(template, "*", "*") as Collection).length,
		).toBe(0);
		const contentStore = new ScriptCollections(
			content.tree,
			{ createHostObject: factory },
			(id) => id,
		);
		cleanup.push(() => contentStore.close());
		expect(
			ids(
				contentStore.getByNamespace(
					content.id,
					htmlNamespace,
					"p",
				) as Collection,
			),
		).toEqual([hidden]);
	});

	it("reuses canonical identities without aliasing owners, namespaces, kinds or documents", () => {
		const { tree, store, root } = fixture();
		const list = store.getByNamespace(root, htmlNamespace, "p");
		expect(store.getByNamespace(root, htmlNamespace, "p")).toBe(list);
		expect(store.getByNamespace(root, "", "p")).toBe(
			store.getByNamespace(root, null, "p"),
		);
		expect(store.getByNamespace(root, "null", "p")).not.toBe(
			store.getByNamespace(root, null, "p"),
		);
		expect(store.getByNamespace(root, "*", "p")).not.toBe(list);
		expect(store.getByNamespace(root, htmlNamespace, "P")).not.toBe(list);
		expect(store.getByNamespace(tree.root, htmlNamespace, "p")).not.toBe(list);
		for (const kind of ["tag", "class", "name"] as const)
			expect(store.get(root, kind, "p")).not.toBe(list);
		const other = fixture();
		expect(other.store.getByNamespace(other.root, htmlNamespace, "p")).not.toBe(
			list,
		);
	});

	it("keeps unusual strings literal and separates delimiter and JSON-shaped query keys", () => {
		const { tree, store, root } = fixture();
		const qualified = tree.createElement("x:p");
		tree.append(root, qualified);
		expect(
			ids(store.getByNamespace(root, htmlNamespace, "x:p") as Collection),
		).toEqual([qualified]);
		const queries: [string, string][] = [
			["a:b", "c"],
			["a", "b:c"],
			['a","b', "c"],
			["a", 'b","c'],
			["a\u0000b", "c"],
			["a", "b\u0000c"],
		];
		for (const unusual of [
			"__proto__",
			"constructor",
			"length",
			"item",
			"a\\b",
			"表🦊",
			"\ud800",
			'[],:"',
		]) {
			queries.push([unusual, "p"], [htmlNamespace, unusual]);
		}
		const capabilities = queries.map(([namespace, localName]) => {
			const list = store.getByNamespace(
				root,
				namespace,
				localName,
			) as Collection;
			expect(list.length).toBe(0);
			expect(store.getByNamespace(root, namespace, localName)).toBe(list);
			return list;
		});
		expect(new Set(capabilities).size).toBe(queries.length);
	});

	it("shares indexed, item and live namedItem behavior", () => {
		const { tree, store, root, first, middle, last } = fixture();
		const list = store.getByNamespace(root, htmlNamespace, "p") as Collection;
		expect(list[0]).toBe(first);
		expect(list[99]).toBeUndefined();
		for (const index of [99, -1]) expect(list.item(index)).toBeNull();
		for (const index of [0.9, 4_294_967_296, Number.NaN, null])
			expect(list.item(index)).toBe(first);
		expect(list.namedItem("named")).toBe(middle);
		expect(list.namedItem("last")).toBe(last);
		expect(list.namedItem("")).toBeNull();
		expect(list.namedItem("missing")).toBeNull();
		const refreshes = store.stats.refreshes;
		expect(list.length).toBe(3);
		expect(store.stats.refreshes).toBe(refreshes);
		tree.setAttribute(first, "name", "last");
		expect(list.namedItem("last")).toBe(first);
		tree.removeAttribute(first, "name");
		expect(list.namedItem("last")).toBe(last);
		for (const value of [{}, () => "first", Symbol("first")]) {
			expect(() => list.item(value)).toThrow(/conversion/i);
			expect(() => list.namedItem(value)).toThrow(/conversion/i);
		}
		expect(() => list.item(1n)).toThrow(/BigInt/i);
		expect(() => (list.item as () => unknown)()).toThrow();
		expect(() => (list.namedItem as () => unknown)()).toThrow();
	});

	it("rejects missing and invalid low-level arguments without property access or coercion", () => {
		const { store, root } = fixture();
		const get = (...args: unknown[]) =>
			(store.getByNamespace as (...values: unknown[]) => object)(...args);
		let accesses = 0;
		const hostile = new Proxy(
			{},
			{
				get() {
					accesses++;
					throw new Error("Unexpected property access");
				},
			},
		);
		for (const args of [[], [root], [root, null]])
			expect(() => get(...args)).toThrow(/arguments/i);
		for (const invalid of [
			undefined,
			true,
			0,
			1n,
			Symbol("p"),
			{},
			[],
			new String("p"),
			() => "p",
			hostile,
		]) {
			expect(() => get(root, invalid, "p")).toThrow(/arguments/i);
			expect(() => get(root, "*", invalid)).toThrow(/arguments/i);
		}
		expect(() => get(root, "*", null)).toThrow(/arguments/i);
		for (const owner of [
			undefined,
			null,
			String(root),
			1n,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			hostile,
		])
			expect(() => get(owner, "*", "p")).toThrow(/arguments/i);
		expect(() => get(-1, "*", "p")).toThrow();
		expect(accesses).toBe(0);
		expect(store.stats.collections).toBe(0);
		expect((get(root, "*", "p") as Collection).length).toBe(3);
	});

	it("bounds combined query code units before reserving collection slots", () => {
		const { store, root } = fixture({
			maxQueryCodeUnits: 4,
			maxCollections: 1,
		});
		for (const [namespace, localName] of [
			["abc", "de"],
			["🦊", "🦊x"],
			["abcde", ""],
			["", "abcde"],
		])
			expect(() => store.getByNamespace(root, namespace, localName)).toThrow(
				/query limit/i,
			);
		expect(store.stats.collections).toBe(0);
		const list = store.getByNamespace(root, "🦊", "🦊") as Collection;
		expect(list.length).toBe(0);
		expect(store.getByNamespace(root, "🦊", "🦊")).toBe(list);
		expect(() => store.getByNamespace(root, "*", "p")).toThrow(/count limit/i);
		const empty = fixture({ maxQueryCodeUnits: 1, maxCollections: 1 });
		expect(empty.store.getByNamespace(empty.root, "", "p")).toBe(
			empty.store.getByNamespace(empty.root, null, "p"),
		);
		const exact = fixture({ maxQueryCodeUnits: htmlNamespace.length + 1 });
		const html = exact.store.getByNamespace(
			exact.root,
			htmlNamespace,
			"p",
		) as Collection;
		expect(html.length).toBe(3);
		expect(() =>
			exact.store.getByNamespace(exact.root, htmlNamespace, "pp"),
		).toThrow(/query limit/i);
		expect(() =>
			html.namedItem("x".repeat(exact.store.limits.maxQueryCodeUnits + 1)),
		).toThrow(/query limit/i);
	});

	it.each(["namespace-first", "tag-first"])(
		"shares collection count budgets: %s",
		(order) => {
			const { store, root } = fixture({ maxCollections: 1 });
			const namespace = () => store.getByNamespace(root, "*", "p");
			const tag = () => store.get(root, "tag", "p");
			const [first, second] =
				order === "namespace-first" ? [namespace, tag] : [tag, namespace];
			const list = first() as Collection;
			expect(first()).toBe(list);
			expect(() => second()).toThrow(/count limit/i);
			expect(list.length).toBe(3);
		},
	);

	it.each([
		[{ maxItems: 2 }, /item limit/i],
		[{ maxCachedEntries: 2 }, /cache limit/i],
		[{ maxWork: 1 }, /work limit/i],
	] as const)("bounds namespace refreshes with %j", (limits, error) => {
		const { store, root } = fixture(limits);
		const list = store.getByNamespace(root, "*", "p") as Collection;
		for (const read of [
			() => list.length,
			() => list[0],
			() => list.item(0),
			() => list.namedItem("first"),
		])
			expect(read).toThrow(error);
		expect(store.stats.cachedEntries).toBe(0);
		expect(store.stats.refreshes).toBe(0);
	});

	it.each([null, "urn:other", "*"])(
		"charges traversal work even without matches in %j",
		(namespace) => {
			const { store, root } = fixture({ maxWork: 1 });
			const list = store.getByNamespace(
				root,
				namespace,
				"absent",
			) as Collection;
			expect(() => list.length).toThrow(/work limit/i);
			expect(store.stats.cachedEntries).toBe(0);
		},
	);

	it("preserves cached results on failed refresh and shares retention with other kinds", () => {
		const { tree, store, root, first, middle, last } = fixture({
			maxItems: 3,
			maxCachedEntries: 3,
		});
		const list = store.getByNamespace(root, "*", "p") as Collection;
		expect(list.length).toBe(3);
		const added = tree.createElement("p");
		tree.append(root, added);
		expect(() => list.length).toThrow(/item limit/i);
		expect(store.stats.cachedEntries).toBe(3);
		tree.remove(added);
		expect(ids(list)).toEqual([first, middle, last]);
		const overlap = store.get(root, "tag", "p") as Collection;
		expect(() => overlap.length).toThrow(/cache limit/i);
		expect(store.stats.cachedEntries).toBe(3);
		tree.remove(first);
		tree.remove(middle);
		expect(ids(list)).toEqual([last]);
		expect(ids(overlap)).toEqual([last]);
		expect(store.stats.cachedEntries).toBe(2);
	});

	it.each(["throw", "invalid", "close", "tree-close"])(
		"rolls back publication on factory %s",
		(mode) => {
			let captured: ScriptHostObjectDefinition | undefined;
			let fail = true;
			const { tree, store, root } = fixture({}, (definition) => {
				captured = definition;
				expect(definition.indexed?.length()).toBe(3);
				if (fail) {
					if (mode === "throw") throw new Error("factory failure");
					if (mode === "invalid") return null as unknown as object;
					if (mode === "close") store.close();
					if (mode === "tree-close") tree.close();
				}
				return factory(definition);
			});
			expect(() => store.getByNamespace(root, "*", "p")).toThrow();
			expect(store.stats.collections).toBe(0);
			expect(store.stats.cachedEntries).toBe(0);
			const leaked = captured;
			expect(leaked).toBeDefined();
			expect(() => leaked?.indexed?.length()).toThrow(/closed/i);
			if (mode === "throw" || mode === "invalid") {
				fail = false;
				expect(
					(store.getByNamespace(root, "*", "p") as Collection).length,
				).toBe(3);
				expect(() => leaked?.indexed?.length()).toThrow(/closed/i);
			}
		},
	);

	it("reserves canonical namespace identity and shared count before factory entry", () => {
		let calls = 0;
		const { store, root } = fixture({ maxCollections: 1 }, (definition) => {
			if (++calls > 1) throw new Error("Unexpected recursive publication");
			expect(() => store.getByNamespace(root, null, "p")).toThrow(
				/publication/i,
			);
			expect(() => store.getByNamespace(root, "", "p")).toThrow(/publication/i);
			expect(() => store.getByNamespace(root, "*", "p")).toThrow(
				/count limit/i,
			);
			expect(() => store.get(root, "tag", "p")).toThrow(/count limit/i);
			return factory(definition);
		});
		expect((store.getByNamespace(root, "", "p") as Collection).length).toBe(0);
		expect(calls).toBe(1);
		expect(store.stats.collections).toBe(1);
	});

	it("preserves a nested collection when namespace publication fails", () => {
		let calls = 0;
		let nested: Collection | undefined;
		const { store, root } = fixture(
			{ maxCollections: 2, maxCachedEntries: 6 },
			(definition) => {
				expect(definition.indexed?.length()).toBe(3);
				if (++calls === 1) {
					nested = store.get(root, "tag", "p") as Collection;
					throw new Error("enclosing factory failure");
				}
				return factory(definition);
			},
		);
		expect(() => store.getByNamespace(root, "*", "p")).toThrow(
			"enclosing factory failure",
		);
		expect(nested?.length).toBe(3);
		expect(store.stats).toEqual({
			collections: 1,
			cachedEntries: 3,
			refreshes: 2,
		});
		expect((store.getByNamespace(root, "*", "p") as Collection).length).toBe(3);
		expect(store.stats.cachedEntries).toBe(6);
	});

	it.each(["store", "tree"])(
		"revokes saved namespace access on %s closure",
		(mode) => {
			const { tree, store, root } = fixture();
			const list = store.getByNamespace(root, htmlNamespace, "p") as Collection;
			expect(list.length).toBe(3);
			if (mode === "store") store.close();
			else tree.close();
			for (const read of [
				() => list.length,
				() => list[0],
				() => list.item(0),
				() => list.namedItem("first"),
				() => store.getByNamespace(root, htmlNamespace, "p"),
			])
				expect(read).toThrow(/closed/i);
			store.close();
			store.close();
			expect(store.stats.collections).toBe(0);
			expect(store.stats.cachedEntries).toBe(0);
		},
	);
});
