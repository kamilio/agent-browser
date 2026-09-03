import { afterEach, expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import {
	type ScriptCollectionLimits,
	ScriptCollections,
} from "./script-collections.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface Collection {
	readonly length: number;
	readonly [index: number]: TestNode | undefined;
	item(index: unknown): TestNode | null;
	namedItem(name: unknown): TestNode | null;
}

interface TestNode {
	readonly links: Collection;
	readonly scripts: Collection;
	readonly embeds: Collection;
	readonly plugins: Collection;
	readonly anchors: Collection;
	body: TestNode;
	innerHTML: string;
	getElementById(id: string): TestNode;
	createElement(tag: string): TestNode;
	createDocumentFragment(): TestNode;
	appendChild(node: TestNode): TestNode;
	removeChild(node: TestNode): TestNode;
	insertBefore(node: TestNode, before: TestNode | null): TestNode;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	getAttribute(name: string): string | null;
}

function createHostObject(definition: ScriptHostObjectDefinition): object {
	const target = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, {
			get: property.get,
			set: property.set,
		});
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

function fixture(source = "<body></body>") {
	const tree = parseHtmlDocument(source, "https://example.test/page");
	const dom = new ScriptDom(tree, { createHostObject });
	cleanup.push(() => tree.close());
	return { tree, dom, document: dom.document as TestNode };
}

function ids(collection: Collection): (string | null)[] {
	return Array.from({ length: collection.length }, (_, index) =>
		required(collection.item(index)).getAttribute("id"),
	);
}

function required(node: TestNode | null | undefined): TestNode {
	if (!node) throw new Error("Missing collection fixture node");
	return node;
}

const collectionNames = [
	"links",
	"scripts",
	"embeds",
	"plugins",
	"anchors",
] as const;

it.each(collectionNames)(
	"exposes a readonly, stable document.%s collection",
	(name) => {
		const { document } = fixture();
		const collection = document[name];
		expect(collection).toBeDefined();
		expect(collection.length).toBe(0);
		expect(document[name]).toBe(collection);
		expect(collection.item(0)).toBeNull();
		expect(collection[0]).toBeUndefined();
		expect(collection.namedItem("missing")).toBeNull();
		expect(() => Reflect.set(document, name, {})).not.toThrow();
		expect(Reflect.set(document, name, {})).toBe(false);
		expect(document[name]).toBe(collection);
		expect(name in document.body).toBe(false);
	},
);

it("filters links by a/area tag and href presence, not URL validity or visibility", () => {
	const { document } =
		fixture(`<head><link id="stylesheet" href="style.css"></head><body>
		<a id="absent" name="target"></a><a id="empty" href=""></a>
		<map><area id="area" href="#target"><area id="no-area"></map>
		<div href="fake" id="other"></div><a id="hidden" hidden href="not a url"></a>
		<a id="mixed" HREF="javascript:void(0)"></a></body>`);
	expect(ids(document.links)).toEqual(["empty", "area", "hidden", "mixed"]);
});

it("filters anchors by a tag and name presence including empty names", () => {
	const { document } = fixture(`<a id="only-id"></a><a id="link" href="#"></a>
		<a id="empty" name=""></a><a id="named" name="section" href="#"></a>
		<area id="area" name="section"><div id="div" name="section"></div>`);
	expect(ids(document.anchors)).toEqual(["empty", "named"]);
	expect(document.anchors.namedItem("")).toBeNull();
	expect(document.anchors.namedItem("section")).toBe(
		document.getElementById("named"),
	);
});

it("includes all script types in document order without executing them", () => {
	const { document } =
		fixture(`<head><script id="head">throw Error('not executed')</script></head>
		<body><script id="module" type="module" src="missing.js"></script>
		<div><script id="data" type="application/json">{}</script></div>
		<script id="nomodule" nomodule></script><div id="fake" type="script"></div></body>`);
	expect(ids(document.scripts)).toEqual(["head", "module", "data", "nomodule"]);
});

it("aliases plugins to embeds without including objects or applets", () => {
	const { document } = fixture(
		'<embed id="first"><object id="object"></object><applet></applet><div><embed id="second"></div>',
	);
	expect(document.plugins).toBe(document.embeds);
	expect(ids(document.plugins)).toEqual(["first", "second"]);
});

it.each(["links", "anchors"] as const)(
	"updates saved %s membership after attribute changes",
	(name) => {
		const { document } = fixture('<a id="first"></a><a id="second"></a>');
		const collection = document[name];
		const first = document.getElementById("first");
		const second = document.getElementById("second");
		const attribute = name === "links" ? "href" : "name";
		expect(collection.length).toBe(0);
		second.setAttribute(attribute, "");
		expect(ids(collection)).toEqual(["second"]);
		first.setAttribute(attribute.toUpperCase(), "#target");
		expect(ids(collection)).toEqual(["first", "second"]);
		first.removeAttribute(attribute);
		expect(ids(collection)).toEqual(["second"]);
		second.removeAttribute(attribute);
		expect(collection.length).toBe(0);
	},
);

it("keeps links and anchors distinct when membership overlaps", () => {
	const { document } = fixture('<a id="both" href="" name=""></a>');
	expect(document.links).not.toBe(document.anchors);
	expect(document.links[0]).toBe(document.anchors[0]);
	document.getElementById("both").removeAttribute("name");
	expect(document.links.length).toBe(1);
	expect(document.anchors.length).toBe(0);
});

it.each(collectionNames)("revokes saved %s on DOM close", (name) => {
	const { document, dom } = fixture();
	const collection = document[name];
	expect(collection.length).toBe(0);
	dom.close();
	expect(() => document[name]).toThrow(/closed/i);
	expect(() => collection.length).toThrow(/closed/i);
	expect(() => collection.item(0)).toThrow(/closed/i);
	expect(() => collection.namedItem("id")).toThrow(/closed/i);
});

it.each(collectionNames)(
	"keeps saved %s live across insertion, movement and body replacement",
	(name) => {
		const { document } = fixture();
		const collection = document[name];
		const tag =
			name === "scripts"
				? "script"
				: name === "embeds" || name === "plugins"
					? "embed"
					: "a";
		const first = document.createElement(tag);
		const second = document.createElement(tag);
		for (const [node, id] of [
			[first, "first"],
			[second, "second"],
		] as const) {
			node.setAttribute("id", id);
			node.setAttribute("href", "");
			node.setAttribute("name", id);
		}
		const fragment = document.createDocumentFragment();
		fragment.appendChild(first);
		fragment.appendChild(second);
		expect(collection.length).toBe(0);
		document.body.appendChild(fragment);
		expect(ids(collection)).toEqual(["first", "second"]);
		expect(collection[0]).toBe(first);
		document.body.insertBefore(second, first);
		expect(ids(collection)).toEqual(["second", "first"]);
		fragment.appendChild(second);
		expect(ids(collection)).toEqual(["first"]);
		const previous = document.body;
		document.body = document.createElement("body");
		expect(collection.length).toBe(0);
		previous.appendChild(second);
		expect(collection.length).toBe(0);
		document.body.appendChild(first);
		expect(collection.item(0)).toBe(first);
		expect(document[name]).toBe(collection);
	},
);

it("refreshes collections after parsed innerHTML insertion and replacement", () => {
	const { document } = fixture();
	const links = document.links;
	const anchors = document.anchors;
	const scripts = document.scripts;
	const embeds = document.embeds;
	expect([links.length, anchors.length, scripts.length, embeds.length]).toEqual(
		[0, 0, 0, 0],
	);
	document.body.innerHTML =
		'<a id="link" href="" name="link"></a><script id="data" type="application/json">{}</script><embed id="embed">';
	expect(ids(links)).toEqual(["link"]);
	expect(ids(anchors)).toEqual(["link"]);
	expect(ids(scripts)).toEqual(["data"]);
	expect(ids(embeds)).toEqual(["embed"]);
	document.body.innerHTML = '<area id="area" href="">';
	expect(ids(links)).toEqual(["area"]);
	expect([anchors.length, scripts.length, embeds.length]).toEqual([0, 0, 0]);
});

it("looks up duplicate IDs and names in current tree order within the filtered set", () => {
	const { document } = fixture(
		'<div id="target"></div><a id="first" name="target" href=""></a><a id="target" href=""></a>',
	);
	const collection = document.links;
	const first = required(collection[0]);
	const second = required(collection[1]);
	expect(collection.namedItem("target")).toBe(first);
	document.body.insertBefore(second, first);
	expect(collection.namedItem("target")).toBe(second);
	second.removeAttribute("href");
	expect(collection.namedItem("target")).toBe(first);
	first.setAttribute("name", "changed");
	expect(collection.namedItem("target")).toBeNull();
	expect(collection.namedItem("changed")).toBe(first);
	expect(collection.namedItem("CHANGED")).toBeNull();
});

it("retains HTMLCollection indexed and item conversion behavior", () => {
	const { document } = fixture(
		'<a id="first" href=""></a><area id="second" href="">',
	);
	const collection = document.links;
	expect(collection.item("1")).toBe(collection[1]);
	expect(collection.item(4_294_967_296)).toBe(collection[0]);
	expect(collection.item(Number.NaN)).toBe(collection[0]);
	expect(collection.item(-1)).toBeNull();
	expect(collection[9]).toBeUndefined();
	expect(collection.item(9)).toBeNull();
	expect(() => collection.item({})).toThrow(/conversion/i);
	expect(() => collection.namedItem({})).toThrow(/conversion/i);
	expect(Reflect.set(collection, "length", 0)).toBe(false);
	expect(collection.length).toBe(2);
});

it.each(collectionNames)(
	"isolates %s ownership and revokes it on tree close",
	(name) => {
		const source =
			'<a id="link" href="" name="link"></a><script></script><embed>';
		const first = fixture(source);
		const second = fixture(source);
		const collection = first.document[name];
		const other = second.document[name];
		expect(collection).not.toBe(other);
		expect(collection[0]).not.toBe(other[0]);
		first.document.body.innerHTML = "";
		expect(collection.length).toBe(0);
		expect(other.length).toBe(1);
		first.tree.close();
		expect(() => collection.length).toThrow(/closed/i);
		expect(() => first.document[name]).toThrow(/closed/i);
		expect(other.length).toBe(1);
	},
);

function boundedFixture(limits: Partial<ScriptCollectionLimits> = {}) {
	const { tree, dom, document } = fixture(
		'<a id="first" href="" name="first"></a><a id="second"></a>',
	);
	const store = new ScriptCollections(
		tree,
		{ createHostObject },
		(id) => dom.node(id),
		limits,
	);
	cleanup.push(() => store.close());
	return { tree, document, store };
}

it.each(["links", "anchors"] as const)(
	"caches %s reads by revision and refreshes attribute-only membership",
	(kind) => {
		const { tree, document, store } = boundedFixture();
		const collection = store.get(tree.root, kind) as Collection;
		expect(ids(collection)).toEqual(["first"]);
		expect(store.stats).toEqual({
			collections: 1,
			cachedEntries: 1,
			refreshes: 1,
		});
		for (let read = 0; read < 1_000; read++) {
			expect(collection.length).toBe(1);
			expect(collection.item(0)).toBe(document.getElementById("first"));
		}
		expect(store.stats.refreshes).toBe(1);
		document
			.getElementById("second")
			.setAttribute(kind === "links" ? "href" : "name", "");
		expect(collection.length).toBe(2);
		expect(store.stats).toEqual({
			collections: 1,
			cachedEntries: 2,
			refreshes: 2,
		});
		store.close();
		expect(store.stats.cachedEntries).toBe(0);
		expect(() => collection.length).toThrow(/closed/i);
	},
);

it.each(["links", "anchors"] as const)(
	"keeps %s cache atomic on item-limit failure and recovers after removal",
	(kind) => {
		const { tree, document, store } = boundedFixture({ maxItems: 1 });
		const collection = store.get(tree.root, kind) as Collection;
		expect(ids(collection)).toEqual(["first"]);
		const second = document.getElementById("second");
		const attribute = kind === "links" ? "href" : "name";
		second.setAttribute(attribute, "");
		for (const read of [
			() => collection.length,
			() => collection[0],
			() => collection.item(0),
			() => collection.namedItem("first"),
		])
			expect(read).toThrow(/item limit/i);
		expect(store.stats).toEqual({
			collections: 1,
			cachedEntries: 1,
			refreshes: 1,
		});
		second.removeAttribute(attribute);
		expect(ids(collection)).toEqual(["first"]);
		expect(store.stats).toEqual({
			collections: 1,
			cachedEntries: 1,
			refreshes: 2,
		});
	},
);

it("bounds cache retention across overlapping document collections", () => {
	const { tree, document, store } = boundedFixture({ maxCachedEntries: 1 });
	const links = store.get(tree.root, "links") as Collection;
	const anchors = store.get(tree.root, "anchors") as Collection;
	expect(links.length).toBe(1);
	expect(() => anchors.length).toThrow(/cache limit/i);
	expect(store.stats.cachedEntries).toBe(1);
	document.getElementById("first").removeAttribute("href");
	expect(links.length).toBe(0);
	expect(anchors.length).toBe(1);
	expect(store.stats.cachedEntries).toBe(1);
});

it("bounds collection count while allowing repeated capability reuse", () => {
	const { tree, store } = boundedFixture({ maxCollections: 1 });
	const links = store.get(tree.root, "links") as Collection;
	expect(store.get(tree.root, "links")).toBe(links);
	expect(() => store.get(tree.root, "anchors")).toThrow(/count limit/i);
	expect(links.length).toBe(1);
});

it.each(["links", "anchors"] as const)(
	"charges nonmatching nodes against the %s traversal budget",
	(kind) => {
		const { tree, document, store } = boundedFixture({ maxWork: 4 });
		document.body.innerHTML = "<div></div><div></div><div></div>";
		const collection = store.get(tree.root, kind) as Collection;
		expect(() => collection.length).toThrow(/work limit/i);
		expect(store.stats.cachedEntries).toBe(0);
		document.body.innerHTML = "";
		expect(collection.length).toBe(0);
	},
);
