import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	createHtmlAttributes,
	htmlAttributeNames,
	removeHtmlAttribute,
	setHtmlAttribute,
	snapshotHtmlAttributes,
} from "./html-attributes.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface Attribute {
	name: string;
	value: string;
	compareDocumentPosition(other: Attribute): number;
}
interface Element {
	getAttributeNames(...args: unknown[]): string[];
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	setAttributeNode(attribute: Attribute): Attribute | null;
	cloneNode(deep?: boolean): Element;
	innerHTML: string;
	attributes: {
		length: number;
		[index: number]: Attribute | undefined;
		item(index: number): Attribute | null;
		getNamedItem(name: string): Attribute | null;
	};
}

function createHostObject(definition: ScriptHostObjectDefinition): object {
	const result = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(result, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(result, name, { value: method });
	const indexed = definition.indexed;
	if (indexed) Object.defineProperty(result, "length", { get: indexed.length });
	Object.preventExtensions(result);
	return indexed
		? new Proxy(result, {
				get(target, key) {
					if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key))
						return Number(key) < indexed.length()
							? indexed.get(Number(key))
							: undefined;
					return Reflect.get(target, key);
				},
			})
		: result;
}

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture(
	source:
		| string
		| DocumentTree = '<div z="last-letter" 9="nine" 1="one" a="first-letter"></div>',
) {
	const tree =
		typeof source === "string"
			? parseHtmlDocument(source, "https://fixture.invalid/")
			: source;
	cleanup.push(() => tree.close());
	const dom = new ScriptDom(tree, { createHostObject });
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("div");
	if (id === null) throw new Error("Missing attribute-order fixture element");
	return {
		tree,
		dom,
		id,
		element: dom.node(id) as Element,
		document: dom.document as { createAttribute(name: string): Attribute },
	};
}

it("returns a fresh attribute-list-order snapshot rather than JavaScript integer-key order", () => {
	const { element } = fixture();
	const names = element.getAttributeNames();
	expect(names).toEqual(["z", "9", "1", "a"]);
	expect(element.getAttributeNames()).not.toBe(names);
	names.reverse();
	expect(element.getAttributeNames()).toEqual(["z", "9", "1", "a"]);
});

it("uses attribute-list order for indexed NamedNodeMap access", () => {
	const { element } = fixture();
	expect(
		Array.from(
			{ length: element.attributes.length },
			(_, index) => element.attributes.item(index)?.name,
		),
	).toEqual(["z", "9", "1", "a"]);
	expect(element.attributes[1]).toBe(element.attributes.getNamedItem("9"));
});

it("serializes attributes in the same stable order used by DOM enumeration", () => {
	const { tree, id } = fixture();
	expect(serializeHtml(tree, id, { includeSelf: true })).toBe(
		'<div z="last-letter" 9="nine" 1="one" a="first-letter"></div>',
	);
});

it("keeps an existing slot on updates and appends a removed/re-added name", () => {
	const { element } = fixture();
	element.setAttribute("9", "changed");
	expect(element.getAttributeNames()).toEqual(["z", "9", "1", "a"]);
	element.removeAttribute("9");
	element.setAttribute("9", "re-added");
	expect(element.getAttributeNames()).toEqual(["z", "1", "a", "9"]);
});

it("records native setAttribute insertion order independently of numeric key sorting", () => {
	const tree = new DocumentTree("about:blank");
	const id = tree.createElement("div");
	tree.append(tree.root, id);
	const { element } = fixture(tree);
	for (const name of ["z", "20", "2", "01", "0"])
		element.setAttribute(name, name);
	expect(element.getAttributeNames()).toEqual(["z", "20", "2", "01", "0"]);
	expect(tree.getAttributeNames(id)).toEqual(["z", "20", "2", "01", "0"]);
});

it("does not move duplicate parser attributes or collapse non-ASCII names", () => {
	const { element } = fixture(
		'<div Z="first" 9="nine" z="ignored" 1="one" DATA-Ü="upper" data-ü="lower"></div>',
	);
	expect(element.getAttributeNames()).toEqual([
		"z",
		"9",
		"1",
		"data-Ü",
		"data-ü",
	]);
	expect(element.attributes.getNamedItem("z")?.value).toBe("first");
});

it("preserves order through native cloning and independent mutation", () => {
	const { element } = fixture();
	const copy = element.cloneNode(true);
	expect(copy.getAttributeNames()).toEqual(["z", "9", "1", "a"]);
	copy.removeAttribute("1");
	copy.setAttribute("1", "new");
	expect(copy.getAttributeNames()).toEqual(["z", "9", "a", "1"]);
	expect(element.getAttributeNames()).toEqual(["z", "9", "1", "a"]);
});

it("keeps replacement Attr slots and appends newly attached Attr names", () => {
	const { element, document } = fixture();
	const replacement = document.createAttribute("9");
	replacement.value = "replacement";
	element.setAttributeNode(replacement);
	expect(element.getAttributeNames()).toEqual(["z", "9", "1", "a"]);
	element.setAttributeNode(document.createAttribute("0"));
	expect(element.getAttributeNames()).toEqual(["z", "9", "1", "a", "0"]);
});

it("preserves order through fragment parsing, import and innerHTML replacement", () => {
	const { tree, id, element } = fixture("<div></div>");
	element.innerHTML = '<span z="z" 9="nine" 1="one"></span>';
	const child = tree.get(id).children[0];
	expect(tree.getAttributeNames(child)).toEqual(["z", "9", "1"]);
	expect(element.innerHTML).toBe('<span z="z" 9="nine" 1="one"></span>');
	element.innerHTML = '<span b="b" 4="four" 2="two"></span>';
	expect(tree.getAttributeNames(tree.get(id).children[0])).toEqual([
		"b",
		"4",
		"2",
	]);
});

it("appends new attributes in token order when merging repeated document tags", () => {
	const tree = parseHtmlDocument(
		'<html z="z" 9="nine"><html 1="one" 0="zero"><head></head><body b="b" 8="eight"><body 2="two" 1="one"><div></div>',
		"https://fixture.invalid/",
	);
	const { tree: document } = fixture(tree);
	const queries = new DocumentQueries(document);
	const html = queries.querySelector("html");
	const body = queries.querySelector("body");
	if (html === null || body === null)
		throw new Error("Missing document fixture nodes");
	expect(document.getAttributeNames(html)).toEqual(["z", "9", "1", "0"]);
	expect(document.getAttributeNames(body)).toEqual(["b", "8", "2", "1"]);
});

it("preserves order through every tokenizer input split", () => {
	const source = '<div z="z" 9="nine" 1="one" 9="ignored" __proto__="safe">';
	for (let split = 1; split < source.length; split++) {
		const issues: string[] = [];
		const tokenizer = new HtmlTokenizer(source, (issue) => issues.push(issue));
		tokenizer.setBoundary(split);
		expect(tokenizer.next()).toBeUndefined();
		tokenizer.setBoundary(undefined);
		const token = tokenizer.next();
		if (token?.kind !== "start") throw new Error("Missing fixture start token");
		expect(htmlAttributeNames(token.attributes)).toEqual([
			"z",
			"9",
			"1",
			"__proto__",
		]);
		expect(token.attributes["9"]).toBe("nine");
		expect(issues).toEqual(["duplicate-attribute"]);
	}
});

it("copies ordered attributes across independent trees", () => {
	const { tree, id } = fixture();
	const destination = new DocumentTree("about:blank");
	cleanup.push(() => destination.close());
	const copy = destination.copyFrom(tree, id);
	expect(destination.getAttributeNames(copy)).toEqual(["z", "9", "1", "a"]);
	destination.removeAttribute(copy, "9");
	destination.setAttribute(copy, "9", "new");
	expect(destination.getAttributeNames(copy)).toEqual(["z", "1", "a", "9"]);
	expect(tree.getAttributeNames(id)).toEqual(["z", "9", "1", "a"]);
});

it("uses the same chosen order for comparisons between attached Attr nodes", () => {
	const { element } = fixture();
	const first = element.attributes.getNamedItem("z");
	const second = element.attributes.getNamedItem("9");
	if (!first || !second) throw new Error("Missing fixture attributes");
	expect(first.compareDocumentPosition(second)).toBe(36);
	expect(second.compareDocumentPosition(first)).toBe(34);
	element.removeAttribute("z");
	element.setAttributeNode(first);
	expect(first.compareDocumentPosition(second)).toBe(34);
});

it("preserves old frozen snapshot values and order after native mutation", () => {
	const { tree, id, element } = fixture();
	const previous = tree.get(id).attributes;
	element.removeAttribute("9");
	element.setAttribute("9", "new");
	expect(Object.isFrozen(previous)).toBe(true);
	expect(htmlAttributeNames(previous)).toEqual(["z", "9", "1", "a"]);
	expect(previous["9"]).toBe("nine");
	expect(htmlAttributeNames(tree.get(id).attributes)).toEqual([
		"z",
		"1",
		"a",
		"9",
	]);
	expect(Object.getPrototypeOf(previous)).toBe(Object.prototype);
});

it("handles canonical integer indices without reordering other numeric-looking names", () => {
	const { element } = fixture("<div></div>");
	const names = [
		"z",
		"4294967295",
		"01",
		"-0",
		"1e3",
		"4294967294",
		"0",
		"2",
		"a",
	];
	for (const name of names) element.setAttribute(name, name);
	expect(element.getAttributeNames()).toEqual(names);
	expect(
		Array.from(
			{ length: names.length },
			(_, index) => element.attributes.item(index)?.name,
		),
	).toEqual(names);
});

it("does not leak prototype-like names or metadata into values", () => {
	const { tree, id, element } = fixture(
		'<div z="z" __proto__="safe" constructor="own" 1="one"></div>',
	);
	expect(element.getAttributeNames()).toEqual([
		"z",
		"__proto__",
		"constructor",
		"1",
	]);
	expect(Object.keys(tree.get(id).attributes)).toEqual([
		"1",
		"z",
		"__proto__",
		"constructor",
	]);
	expect(tree.get(id).attributes.__proto__).toBe("safe");
	expect(Object.getOwnPropertySymbols(tree.get(id).attributes)).toEqual([]);
});

it("keeps ordinary Record inputs in their JavaScript enumeration order", () => {
	const tree = new DocumentTree("about:blank");
	cleanup.push(() => tree.close());
	const attributes = { z: "z", "9": "nine", "1": "one" };
	const id = tree.createElement("div", attributes);
	expect(tree.getAttributeNames(id)).toEqual(Object.keys(attributes));
});

it("ignores extra getter arguments without coercion and allocates no Attr nodes", () => {
	const { tree, element } = fixture();
	const count = tree.nodeCount;
	const revision = tree.revision;
	const unused = {
		toString() {
			throw new Error("unexpected coercion");
		},
	};
	expect(element.getAttributeNames(unused)).toEqual(["z", "9", "1", "a"]);
	expect(tree.nodeCount).toBe(count);
	expect(tree.revision).toBe(revision);
});

it("leaves order and captured Attr identity unchanged after a text-budget failure", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 15 });
	const id = tree.createElement("div");
	tree.append(tree.root, id);
	const { element } = fixture(tree);
	element.setAttribute("z", "z");
	element.setAttribute("9", "nine");
	const captured = tree.getAttributeNode(id, "9");
	const revision = tree.revision;
	expect(() => element.setAttribute("1", "one")).toThrow(/text limit/i);
	expect(element.getAttributeNames()).toEqual(["z", "9"]);
	expect(tree.getAttributeNode(id, "9")).toBe(captured);
	expect(tree.revision).toBe(revision);
});

it("bounds getter and NamedNodeMap enumeration by their shared item limit", () => {
	const { tree, id, element } = fixture("<div></div>");
	for (let index = 0; index < 4097; index++)
		tree.setAttribute(id, String(index), "");
	expect(() => element.getAttributeNames()).toThrow(/key limit/i);
	expect(() => element.attributes.length).toThrow(/key limit/i);
	tree.removeAttribute(id, "0");
	expect(element.getAttributeNames()).toHaveLength(4096);
	expect(element.getAttributeNames()[0]).toBe("1");
});

it("bounds aggregate key units without mutating attribute order", () => {
	const { tree, id, element } = fixture("<div></div>");
	const name = "a".repeat(65_536);
	tree.setAttribute(id, name, "");
	tree.setAttribute(id, "1", "");
	const revision = tree.revision;
	expect(() => element.getAttributeNames()).toThrow(/key limit/i);
	expect(tree.revision).toBe(revision);
	tree.removeAttribute(id, "1");
	expect(element.getAttributeNames()).toEqual([name]);
});

it.each(["binding", "tree"])(
	"revokes retained getAttributeNames on %s close",
	(owner) => {
		const { tree, dom, element } = fixture();
		const names = element.getAttributeNames();
		if (owner === "binding") dom.close();
		else tree.close();
		expect(() => element.getAttributeNames()).toThrow(/closed/i);
		expect(names).toEqual(["z", "9", "1", "a"]);
	},
);

it("does not expose the method on non-elements and rejects invalid native targets", () => {
	const { tree, dom } = fixture();
	for (const id of [
		tree.root,
		tree.createText("text"),
		tree.createComment("comment"),
		tree.createFragment(),
	]) {
		expect("getAttributeNames" in dom.node(id)).toBe(false);
		expect(() => tree.getAttributeNames(id)).toThrow(/element/i);
	}
});

it("keeps helper snapshots independent and rejects writes without corrupting order metadata", () => {
	const attributes = createHtmlAttributes();
	setHtmlAttribute(attributes, "z", "z");
	setHtmlAttribute(attributes, "9", "nine");
	const snapshot = snapshotHtmlAttributes(attributes);
	expect(() => setHtmlAttribute(snapshot, "1", "bad")).toThrow();
	removeHtmlAttribute(snapshot, "9");
	expect(htmlAttributeNames(snapshot)).toEqual(["z", "9"]);
	removeHtmlAttribute(attributes, "9");
	setHtmlAttribute(attributes, "1", "one");
	expect(htmlAttributeNames(attributes)).toEqual(["z", "1"]);
	expect(htmlAttributeNames(snapshot)).toEqual(["z", "9"]);
});
