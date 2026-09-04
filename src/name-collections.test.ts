import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	type ScriptCollectionLimits,
	ScriptCollections,
} from "./script-collections.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface List {
	readonly length: number;
	readonly [index: number]: TestNode | undefined;
	item(index: unknown): TestNode | null;
}
interface TestNode {
	getElementsByName(...args: unknown[]): List;
	getElementById(id: string): TestNode;
	createElement(tag: string): TestNode;
	createDocumentFragment(): TestNode;
	appendChild(node: TestNode): TestNode;
	removeChild(node: TestNode): TestNode;
	insertBefore(node: TestNode, before: TestNode | null): TestNode;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	getAttribute(name: string): string | null;
	body: TestNode;
	innerHTML: string;
}
function createHostObject(definition: ScriptHostObjectDefinition): object {
	const target = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(target, name, { value: method });
	const indexed = definition.indexed;
	if (indexed) Object.defineProperty(target, "length", { get: indexed.length });
	Object.preventExtensions(target);
	return indexed
		? new Proxy(target, {
				get(object, key) {
					if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key)) {
						const index = Number(key);
						return index < indexed.length() ? indexed.get(index) : undefined;
					}
					return Reflect.get(object, key);
				},
			})
		: target;
}
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});
function fixture(
	source = '<main><input id="first" name="group"><span id="second"></span></main>',
) {
	const tree = parseHtmlDocument(
		source,
		"https://fixture.invalid/name-collections",
	);
	const dom = new ScriptDom(tree, { createHostObject });
	cleanup.push(() => tree.close());
	return { tree, dom, document: dom.document as TestNode };
}
function ids(list: List) {
	return Array.from({ length: list.length }, (_, index) =>
		list.item(index)?.getAttribute("id"),
	);
}
function bounded(limits: Partial<ScriptCollectionLimits> = {}) {
	const context = fixture();
	const store = new ScriptCollections(
		context.tree,
		{ createHostObject },
		(id) => context.dom.node(id),
		limits,
	);
	cleanup.push(() => store.close());
	return { ...context, store };
}

it("finds every named HTML element in tree order, not IDs or just controls", () => {
	const { document } = fixture(
		'<html name="group" id="root"><head><meta name="group" id="meta"></head><body><div id="group"></div><input id="control" name="group"><span id="span" name="group"></span><a id="anchor" name="group"></a><input id="different" name="Group"></body></html>',
	);
	expect(ids(document.getElementsByName("group"))).toEqual([
		"root",
		"meta",
		"control",
		"span",
		"anchor",
	]);
	expect(ids(document.getElementsByName("Group"))).toEqual(["different"]);
});

it.each([
	"",
	" ",
	"a b",
	"A",
	"a",
	"[name=x]",
	"a,b",
	"*",
	"a\\b",
	"表🦊",
	"__proto__",
	"constructor",
	"0",
	"length",
	"item",
])(
	"matches the literal name %j without normalization or selector parsing",
	(name) => {
		const { document } = fixture();
		const first = document.getElementById("first");
		first.setAttribute("name", name);
		expect(ids(document.getElementsByName(name))).toEqual(["first"]);
		expect(document.getElementsByName(name).item(0)).toBe(first);
		first.removeAttribute("name");
		expect(document.getElementsByName(name).length).toBe(0);
	},
);

it.each([
	undefined,
	null,
	true,
	false,
	0,
	-0,
	1n,
	Number.NaN,
	Number.POSITIVE_INFINITY,
])("converts primitive name %s", (value) => {
	const { document } = fixture();
	document.getElementById("first").setAttribute("name", String(value));
	expect(ids(document.getElementsByName(value))).toEqual(["first"]);
});

it("requires an argument and does not invoke guest conversion hooks", () => {
	const { document } = fixture();
	let called = false;
	const hostile = {
		toString() {
			called = true;
			throw new Error("guest conversion");
		},
	};
	expect(() => document.getElementsByName()).toThrow(TypeError);
	for (const value of [hostile, () => "group", Symbol("group")])
		expect(() => document.getElementsByName(value)).toThrow();
	expect(called).toBe(false);
	expect(ids(document.getElementsByName("group", hostile))).toEqual(["first"]);
});

it("exposes only the indexed NodeList subset on documents", () => {
	const { document } = fixture();
	const list = document.getElementsByName("group");
	expect(document.getElementsByName("group")).toBe(list);
	expect(Reflect.get(list, "namedItem")).toBeUndefined();
	expect(Reflect.get(list, "value")).toBeUndefined();
	expect(Reflect.get(list, "first")).toBeUndefined();
	expect(Reflect.get(document.body, "getElementsByName")).toBeUndefined();
	expect(
		Reflect.get(document.createDocumentFragment(), "getElementsByName"),
	).toBeUndefined();
	expect(Reflect.set(list, "length", 0)).toBe(false);
	expect(list[1]).toBeUndefined();
	expect(list.item(1)).toBeNull();
	expect(list.item(-1)).toBeNull();
	expect(list.item(4_294_967_296)).toBe(list[0]);
	expect(list.item(Number.NaN)).toBe(list[0]);
});

it("updates a retained list for attributes, insertion, removal, moves and body replacement", () => {
	const { document } = fixture();
	const list = document.getElementsByName("group");
	const first = document.getElementById("first");
	const second = document.getElementById("second");
	expect(ids(list)).toEqual(["first"]);
	second.setAttribute("name", "group");
	expect(ids(list)).toEqual(["first", "second"]);
	document.body.insertBefore(second, null);
	document.body.appendChild(first);
	expect(ids(list)).toEqual(["second", "first"]);
	document.body.removeChild(second);
	expect(ids(list)).toEqual(["first"]);
	first.setAttribute("name", "other");
	expect(list.length).toBe(0);
	document.body.innerHTML = '<p id="replacement" name="group"></p>';
	expect(ids(list)).toEqual(["replacement"]);
});

it("does not include detached fragments or inert template content before insertion", () => {
	const { document } = fixture('<template><input name="group"></template>');
	const list = document.getElementsByName("group");
	const fragment = document.createDocumentFragment();
	const element = document.createElement("input");
	element.setAttribute("name", "group");
	element.setAttribute("id", "inserted");
	fragment.appendChild(element);
	expect(list.length).toBe(0);
	document.body.appendChild(fragment);
	expect(ids(list)).toEqual(["inserted"]);
});

it("returns the shared mutable node capability used by selectors and layout", () => {
	const { tree, document } = fixture();
	const first = document.getElementsByName("group").item(0);
	expect(first).toBe(document.getElementById("first"));
	first?.setAttribute("style", "display:block;width:73px;height:10px");
	const target = new DocumentQueries(tree).querySelector('[name="group"]');
	if (target === null) throw new Error("Missing shared node");
	documentStyles(tree).setViewport(100, 50);
	expect(documentGeometry(tree).getBoundingClientRect(target).width).toBe(73);
});

it.each(["binding", "document"])(
	"isolates lists and revokes them on %s close",
	(mode) => {
		const first = fixture();
		const second = fixture();
		const list = first.document.getElementsByName("group");
		const other = second.document.getElementsByName("group");
		expect(list).not.toBe(other);
		expect(list[0]).not.toBe(other[0]);
		if (mode === "binding") first.dom.close();
		else first.tree.close();
		expect(() => list.length).toThrow(/closed/i);
		expect(() => list.item(0)).toThrow(/closed/i);
		expect(() => first.document.getElementsByName("group")).toThrow(/closed/i);
		expect(other.length).toBe(1);
	},
);

it("reuses revision caches and refreshes name-only changes", () => {
	const { tree, document, store } = bounded();
	const list = store.get(tree.root, "name", "group") as List;
	for (let read = 0; read < 100; read++) expect(list.length).toBe(1);
	expect(store.stats).toEqual({
		collections: 1,
		cachedEntries: 1,
		refreshes: 1,
	});
	document.getElementById("second").setAttribute("name", "group");
	expect(list.length).toBe(2);
	expect(store.stats).toEqual({
		collections: 1,
		cachedEntries: 2,
		refreshes: 2,
	});
});

it("keeps failed refreshes atomic and recovers within item and cache budgets", () => {
	const { tree, document, store } = bounded({
		maxItems: 1,
		maxCachedEntries: 1,
	});
	const list = store.get(tree.root, "name", "group") as List;
	expect(list.length).toBe(1);
	document.getElementById("second").setAttribute("name", "group");
	for (const read of [() => list.length, () => list[0], () => list.item(0)])
		expect(read).toThrow(/item limit/i);
	expect(store.stats.cachedEntries).toBe(1);
	document.getElementById("first").removeAttribute("name");
	expect(ids(list)).toEqual(["second"]);
	const overlapping = store.get(tree.root, "tag", "span") as List;
	expect(() => overlapping.length).toThrow(/cache limit/i);
	document.getElementById("second").removeAttribute("name");
	expect(list.length).toBe(0);
	expect(overlapping.length).toBe(1);
});

it("bounds query length and distinct collections without consuming failed slots", () => {
	const { tree, store } = bounded({ maxCollections: 1, maxQueryCodeUnits: 5 });
	expect(() => store.get(tree.root, "name", "longer")).toThrow(/query limit/i);
	const list = store.get(tree.root, "name", "group") as List;
	expect(store.get(tree.root, "name", "group")).toBe(list);
	expect(() => store.get(tree.root, "name", "other")).toThrow(/count limit/i);
	expect(list.length).toBe(1);
});

it("charges nonmatching name comparisons before publishing cache entries", () => {
	const { tree, document, store } = bounded({ maxWork: 60 });
	document.getElementById("first").setAttribute("name", "x".repeat(100));
	const list = store.get(tree.root, "name", "group") as List;
	expect(() => list.length).toThrow(/work limit/i);
	expect(store.stats.cachedEntries).toBe(0);
	document.getElementById("first").setAttribute("name", "group");
	expect(list.length).toBe(1);
});

it.each(["throw", "invalid", "close", "tree-close"])(
	"rolls back entries and revokes leaked access on factory %s",
	(mode) => {
		const { tree, dom } = fixture();
		let captured: ScriptHostObjectDefinition | undefined;
		let fail = true;
		const store: ScriptCollections = new ScriptCollections(
			tree,
			{
				createHostObject(definition) {
					captured = definition;
					expect(definition.indexed?.length()).toBe(1);
					if (fail) {
						if (mode === "throw") throw new Error("factory failure");
						if (mode === "invalid") return null as unknown as object;
						if (mode === "close") store.close();
						if (mode === "tree-close") tree.close();
					}
					return createHostObject(definition);
				},
			},
			(id) => dom.node(id),
		);
		cleanup.push(() => store.close());
		expect(() => store.get(tree.root, "name", "group")).toThrow();
		expect(store.stats.collections).toBe(0);
		expect(store.stats.cachedEntries).toBe(0);
		expect(() => captured?.indexed?.length()).toThrow(/closed/i);
		if (mode === "throw" || mode === "invalid") {
			fail = false;
			expect((store.get(tree.root, "name", "group") as List).length).toBe(1);
		}
	},
);

it("reserves count and identity before entering the host factory", () => {
	const { tree, dom } = fixture();
	let calls = 0;
	const store: ScriptCollections = new ScriptCollections(
		tree,
		{
			createHostObject(definition) {
				if (++calls > 1) throw new Error("Unexpected recursive publication");
				expect(() => store.get(tree.root, "name", "group")).toThrow(
					/publication/i,
				);
				expect(() => store.get(tree.root, "name", "other")).toThrow(
					/count limit/i,
				);
				return createHostObject(definition);
			},
		},
		(id) => dom.node(id),
		{ maxCollections: 1 },
	);
	cleanup.push(() => store.close());
	expect((store.get(tree.root, "name", "group") as List).length).toBe(1);
	expect(calls).toBe(1);
	expect(store.stats.collections).toBe(1);
});

it("preserves a separately published collection when its enclosing factory fails", () => {
	const { tree, dom } = fixture();
	let calls = 0;
	let nested: List | undefined;
	const store: ScriptCollections = new ScriptCollections(
		tree,
		{
			createHostObject(definition) {
				expect(definition.indexed?.length()).toBe(1);
				if (++calls === 1) {
					nested = store.get(tree.root, "tag", "input") as List;
					throw new Error("enclosing factory failure");
				}
				return createHostObject(definition);
			},
		},
		(id) => dom.node(id),
		{ maxCollections: 2, maxCachedEntries: 2 },
	);
	cleanup.push(() => store.close());
	expect(() => store.get(tree.root, "name", "group")).toThrow(
		"enclosing factory failure",
	);
	expect(nested?.length).toBe(1);
	expect(store.stats).toEqual({
		collections: 1,
		cachedEntries: 1,
		refreshes: 2,
	});
	expect((store.get(tree.root, "name", "group") as List).length).toBe(1);
	expect(store.stats.cachedEntries).toBe(2);
	store.close();
	expect(store.stats.cachedEntries).toBe(0);
	expect(() => nested?.length).toThrow(/closed/i);
});
