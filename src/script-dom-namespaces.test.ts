import { afterEach, expect, it } from "vitest";
import { htmlNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface Collection {
	readonly length: number;
	readonly [index: number]: ElementCapability | undefined;
	item(index: number): ElementCapability | null;
	namedItem(name: string): ElementCapability | null;
}

interface ElementCapability {
	readonly namespaceURI: string;
	readonly localName: string;
	readonly prefix: null;
	readonly tagName: string;
	readonly nodeName: string;
	readonly ownerDocument: DocumentCapability;
	getElementsByTagNameNS(...args: unknown[]): Collection;
	getElementsByTagName(name: string): Collection;
	setAttribute(name: string, value: string): void;
	getAttributeNode(name: string): {
		readonly namespaceURI: null;
		readonly prefix: null;
		readonly localName: string;
	} | null;
	appendChild(child: ElementCapability): ElementCapability;
	removeChild(child: ElementCapability): ElementCapability;
	cloneNode(deep?: boolean): ElementCapability;
}

interface DocumentCapability {
	readonly documentElement: ElementCapability;
	readonly body: ElementCapability;
	createElement(name: string): ElementCapability;
	getElementsByTagNameNS(...args: unknown[]): Collection;
	getElementsByTagName(name: string): Collection;
	getElementById(name: string): ElementCapability;
	createDocumentFragment(): object;
	createTextNode(value: string): object;
	createComment(value: string): object;
}

const cleanup: (() => void)[] = [];

afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(target, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		const indexed = definition.indexed;
		const named = definition.named;
		if (indexed)
			Object.defineProperty(target, "length", { get: indexed.length });
		return new Proxy(target, {
			get(object, key) {
				if (indexed && typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key))
					return Number(key) < indexed.length()
						? indexed.get(Number(key))
						: undefined;
				if (Reflect.has(object, key)) return Reflect.get(object, key);
				return typeof key === "string" && named?.keys().includes(key)
					? named.get(key)
					: undefined;
			},
		});
	},
};

function fixture(
	source = '<main id="outer"><div id="one"><div id="two"></div></div></main>',
) {
	const tree = parseHtmlDocument(source, "https://namespace.fixture.invalid/");
	const dom = new ScriptDom(tree, factory);
	cleanup.push(
		() => tree.close(),
		() => dom.close(),
	);
	return { tree, dom, document: dom.document as DocumentCapability };
}

it.each(["DIV", "x-widget", "x:part", "svg", "math"])(
	"reflects HTML namespace for createElement(%s), without constructing foreign content",
	(name) => {
		const { document } = fixture();
		const element = document.createElement(name);
		expect(element.namespaceURI).toBe(htmlNamespace);
		expect(element.prefix).toBeNull();
		expect(element.localName).toBe(name.toLowerCase());
		expect(element.tagName).toBe(name.toUpperCase());
		expect(element.nodeName).toBe(name.toUpperCase());
		expect(element.ownerDocument).toBe(document);
	},
);

it("reflects scaffold and parsed element metadata without modifying the tree", () => {
	const { tree, dom } = fixture();
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	for (const { node } of tree.walk()) {
		if (node.kind !== "element") continue;
		const element = dom.node(node.id) as ElementCapability;
		expect(element.namespaceURI).toBe(htmlNamespace);
		expect(element.localName).toBe(node.tagName);
		expect(element.prefix).toBeNull();
	}
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(usage);
});

it("does not reinterpret ordinary xmlns or prefixed-looking HTML attributes", () => {
	const { document } = fixture(
		'<div id="target" xmlns="urn:other" xml:lang="en"></div>',
	);
	const element = document.getElementById("target");
	expect(element.namespaceURI).toBe(htmlNamespace);
	for (const name of ["xmlns", "xml:lang"]) {
		const attribute = element.getAttributeNode(name);
		expect(attribute?.namespaceURI).toBeNull();
		expect(attribute?.prefix).toBeNull();
		expect(attribute?.localName).toBe(name);
	}
	element.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	expect(element.namespaceURI).toBe(htmlNamespace);
	expect(document.getElementsByTagNameNS("urn:other", "*").length).toBe(0);
});

it.each(["namespaceURI", "prefix", "localName"] as const)(
	"keeps %s readonly and restricted to element capabilities",
	(name) => {
		const { document } = fixture();
		const element = document.documentElement;
		const value = element[name];
		expect(Reflect.set(element, name, "changed")).toBe(false);
		expect(element[name]).toBe(value);
		for (const node of [
			document,
			document.createDocumentFragment(),
			document.createTextNode("x"),
			document.createComment("x"),
		])
			expect(Reflect.get(node, name)).toBeUndefined();
	},
);

it("queries document descendants but excludes the element owner", () => {
	const { document } = fixture();
	const html = document.documentElement;
	expect(document.getElementsByTagNameNS(htmlNamespace, "html").item(0)).toBe(
		html,
	);
	expect(html.getElementsByTagNameNS(htmlNamespace, "html").length).toBe(0);
	expect(document.getElementsByTagNameNS("*", "*").item(0)).toBe(html);
	expect(
		Reflect.get(document.createDocumentFragment(), "getElementsByTagNameNS"),
	).toBeUndefined();
});

it("distinguishes case-sensitive local names from the existing HTML tag query", () => {
	const { document } = fixture();
	expect(document.getElementsByTagName("DIV").length).toBe(2);
	expect(document.getElementsByTagNameNS(htmlNamespace, "DIV").length).toBe(0);
	expect(document.getElementsByTagNameNS(htmlNamespace, "div").length).toBe(2);
	expect(document.getElementsByTagNameNS("*", "div").length).toBe(2);
});

it.each([
	null,
	undefined,
	"",
	"http://www.w3.org/2000/svg",
	"http://www.w3.org/1998/Math/MathML",
	"HTTP://www.w3.org/1999/xhtml",
	false,
	1,
	1n,
])("does not match HTML nodes in namespace %s", (namespace) => {
	const { document } = fixture();
	expect(document.getElementsByTagNameNS(namespace, "*").length).toBe(0);
});

it("normalizes nullable namespaces and caches equivalent queries", () => {
	const { document } = fixture();
	expect(document.getElementsByTagNameNS(null, "div")).toBe(
		document.getElementsByTagNameNS("", "div"),
	);
	expect(document.getElementsByTagNameNS(undefined, "div")).toBe(
		document.getElementsByTagNameNS(null, "div"),
	);
	expect(document.getElementsByTagNameNS(htmlNamespace, "div")).toBe(
		document.getElementsByTagNameNS(htmlNamespace, "div"),
	);
	expect(document.getElementsByTagNameNS("*", "div")).not.toBe(
		document.getElementsByTagNameNS(htmlNamespace, "div"),
	);
});

it("keeps collections live and node identity stable through insertion and removal", () => {
	const { document } = fixture();
	const outer = document.getElementById("outer");
	const list = outer.getElementsByTagNameNS(htmlNamespace, "div");
	expect(list.length).toBe(2);
	expect(list.namedItem("one")).toBe(document.getElementById("one"));
	const added = document.createElement("DIV");
	outer.appendChild(added);
	expect(list.length).toBe(3);
	expect(list[2]).toBe(added);
	outer.removeChild(added);
	expect(list.length).toBe(2);
	expect(list.item(2)).toBeNull();
	expect(added.namespaceURI).toBe(htmlNamespace);
	expect(added.cloneNode().localName).toBe("div");
});

it.each([{ args: [] }, { args: [htmlNamespace] }])(
	"requires two arguments: $args",
	({ args }) => {
		const { document } = fixture();
		expect(() => document.getElementsByTagNameNS(...args)).toThrow(
			"requires two arguments",
		);
	},
);

it("converts provided primitive local names and ignores extra arguments", () => {
	const { document } = fixture();
	for (const [value, name] of [
		[undefined, "undefined"],
		[null, "null"],
		[true, "true"],
	] as const) {
		const element = document.createElement(name);
		document.body.appendChild(element);
		expect(
			document
				.getElementsByTagNameNS(htmlNamespace, value, Symbol("ignored"))
				.item(0),
		).toBe(element);
	}
});

it.each(["namespace", "local-name"])(
	"rejects unsupported %s conversion without invoking user hooks",
	(argument) => {
		const { document } = fixture();
		let conversions = 0;
		const value = {
			toString() {
				conversions++;
				return "div";
			},
		};
		expect(() =>
			document.getElementsByTagNameNS(
				argument === "namespace" ? value : htmlNamespace,
				argument === "local-name" ? value : "div",
			),
		).toThrow("Object-to-DOM-string conversion");
		expect(conversions).toBe(0);
		expect(() =>
			document.getElementsByTagNameNS(
				argument === "namespace" ? Symbol("namespace") : htmlNamespace,
				argument === "local-name" ? Symbol("name") : "div",
			),
		).toThrow("Object-to-DOM-string conversion");
	},
);

it.each(["dom", "tree"] as const)(
	"revokes namespace getters and collections after %s close",
	(owner) => {
		const { tree, dom, document } = fixture();
		const element = document.documentElement;
		const collection = document.getElementsByTagNameNS(htmlNamespace, "*");
		(owner === "dom" ? dom : tree).close();
		for (const name of ["namespaceURI", "localName", "prefix"] as const)
			expect(() => element[name]).toThrow(/closed/);
		expect(() => document.getElementsByTagNameNS(htmlNamespace, "div")).toThrow(
			/closed/,
		);
		expect(() => collection.length).toThrow(/closed/);
	},
);
