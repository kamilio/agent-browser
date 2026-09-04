import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface NodeView {
	nodeType: number;
	nodeName: string;
	name: string;
	publicId: string;
	systemId: string;
	textContent: string | null;
	nodeValue: string | null;
	parentNode: NodeView | null;
	ownerDocument: NodeView | null;
	doctype: NodeView | null;
	firstChild: NodeView | null;
	nextSibling: NodeView | null;
	childNodes: NodeView[];
	implementation: {
		createDocumentType(...args: unknown[]): NodeView;
		hasFeature(...args: unknown[]): boolean;
	};
	createElement(name: string): NodeView;
	createComment(data: string): NodeView;
	createTextNode(data: string): NodeView;
	createDocumentFragment(): NodeView;
	appendChild(child: NodeView): NodeView;
	insertBefore(child: NodeView, before: NodeView | null): NodeView;
	replaceChild(child: NodeView, before: NodeView): NodeView;
	removeChild(child: NodeView): NodeView;
	cloneNode(deep?: boolean): NodeView;
	importNode(node: NodeView, deep?: boolean): NodeView;
	isEqualNode(node: NodeView): boolean;
	remove(): void;
}

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition) {
		const object = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(object, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};
function fixture(limits: ConstructorParameters<typeof DocumentTree>[1] = {}) {
	const tree = new DocumentTree("https://example.com/page", limits);
	trees.push(tree);
	const dom = new ScriptDom(tree, factory);
	return { tree, dom, document: dom.document as NodeView };
}

it("creates detached doctypes with destination identity and immutable data", () => {
	const { document } = fixture();
	const doctype = document.implementation.createDocumentType(
		"html",
		"public",
		"system",
	);
	expect(doctype.nodeType).toBe(10);
	expect(doctype.nodeName).toBe("html");
	expect(doctype.name).toBe("html");
	expect(doctype.publicId).toBe("public");
	expect(doctype.systemId).toBe("system");
	expect(doctype.parentNode).toBeNull();
	expect(doctype.ownerDocument).toBe(document);
	expect(doctype.textContent).toBeNull();
	expect(doctype.nodeValue).toBeNull();
	doctype.textContent = "ignored";
	doctype.nodeValue = "ignored";
	expect(doctype.childNodes).toEqual([]);
	expect(document.doctype).toBeNull();
});

it("exposes stable document implementation and live doctype identity", () => {
	const { document } = fixture();
	expect(document.implementation).toBe(document.implementation);
	const doctype = document.implementation.createDocumentType("html", "", "");
	document.appendChild(doctype);
	document.appendChild(document.createElement("html"));
	expect(document.doctype).toBe(doctype);
	expect(document.firstChild).toBe(doctype);
	doctype.remove();
	expect(document.doctype).toBeNull();
});

it("rejects a doctype after the document element without moving it", () => {
	const { document } = fixture();
	const html = document.createElement("html");
	document.appendChild(html);
	const doctype = document.implementation.createDocumentType("html", "", "");
	expect(() => document.appendChild(doctype)).toThrow();
	expect(doctype.parentNode).toBeNull();
	document.insertBefore(doctype, html);
	expect(document.doctype).toBe(doctype);
});

it("clones and imports doctype metadata without sharing identity", () => {
	const first = fixture();
	const second = fixture();
	const original = first.document.implementation.createDocumentType(
		"Mixed",
		"public",
		"system",
	);
	const clone = original.cloneNode(true);
	const imported = second.document.importNode(original);
	expect(clone).not.toBe(original);
	expect(imported.ownerDocument).toBe(second.document);
	expect(imported.name).toBe("Mixed");
	expect(imported.publicId).toBe("public");
	expect(imported.systemId).toBe("system");
	expect(imported.isEqualNode(original)).toBe(true);
});

it.each(["", "html", "HtMl", "a:b", "a/b", "1", 'a"b', "é", "\v", "\ud800"])(
	"uses the current doctype-name grammar for %j",
	(name) => {
		const { document } = fixture();
		const doctype = document.implementation.createDocumentType(name, "", "");
		expect(doctype.name).toBe(name);
		expect(doctype.nodeName).toBe(name);
	},
);

it.each(["a b", "a\tb", "a\nb", "a\rb", "a\fb", "a>b", "a\0b"])(
	"rejects invalid doctype name %j before allocation",
	(name) => {
		const { tree, document } = fixture();
		expect(() =>
			document.implementation.createDocumentType(name, "", ""),
		).toThrow(expect.objectContaining({ name: "InvalidCharacterError" }));
		expect(tree.nodeCount).toBe(1);
	},
);

it("requires three arguments and converts primitive DOM strings", () => {
	const { tree, document } = fixture();
	for (const args of [[], ["html"], ["html", ""]])
		expect(() => document.implementation.createDocumentType(...args)).toThrow(
			TypeError,
		);
	expect(tree.nodeCount).toBe(1);
	const doctype = document.implementation.createDocumentType(
		undefined,
		null,
		42,
	);
	expect(doctype.name).toBe("undefined");
	expect(doctype.publicId).toBe("null");
	expect(doctype.systemId).toBe("42");
});

it("keeps hasFeature historical, argument-insensitive and owner-bound", () => {
	const { dom, document } = fixture();
	const implementation = document.implementation;
	expect(
		implementation.hasFeature({
			toString() {
				throw new Error("not a capability query");
			},
		}),
	).toBe(true);
	dom.close();
	expect(() => implementation.hasFeature()).toThrow("closed");
	expect(() => implementation.createDocumentType("html", "", "")).toThrow(
		"closed",
	);
});

it("keeps doctype name and identifiers readonly", () => {
	const { tree, document } = fixture();
	const doctype = document.implementation.createDocumentType(
		"html",
		"public",
		"system",
	);
	for (const name of ["name", "publicId", "systemId"] as const)
		expect(() => {
			doctype[name] = "changed";
		}).toThrow(TypeError);
	const revision = tree.revision;
	doctype.textContent = "ignored";
	doctype.nodeValue = "ignored";
	expect(tree.revision).toBe(revision);
	expect(doctype.textContent).toBeNull();
	expect(doctype.nodeValue).toBeNull();
});

it("does not treat doctype names as element tag names", () => {
	const { tree } = fixture();
	const doctype = tree.createDocumentType(
		"script",
		"private",
		"https://example.com/external.dtd",
	);
	tree.append(tree.root, doctype);
	expect(tree.get(doctype).tagName).toBe("");
	expect(tree.get(doctype).doctype).toEqual({
		name: "script",
		publicId: "private",
		systemId: "https://example.com/external.dtd",
	});
	const queries = new DocumentQueries(tree);
	expect(queries.querySelectorAll("script")).toEqual([]);
	queries.close();
});

it("rejects native doctype insertion into elements, fragments and doctypes", () => {
	const { tree } = fixture();
	const doctype = tree.createDocumentType("html");
	for (const parent of [
		tree.createElement("div"),
		tree.createFragment(),
		tree.createDocumentType("other"),
	])
		expect(() => tree.append(parent, doctype)).toThrow(
			"Invalid tree parent or child",
		);
	expect(tree.get(doctype).parent).toBeNull();
	expect(() => tree.append(doctype, tree.createText("child"))).toThrow(
		"Invalid tree parent or child",
	);
});

it("preflights duplicate doctypes at both native and script boundaries", () => {
	const { tree, document } = fixture();
	const first = tree.createDocumentType("html");
	const second = tree.createDocumentType("other");
	tree.append(tree.root, first);
	const revision = tree.revision;
	expect(() => tree.append(tree.root, second)).toThrow("hierarchy");
	expect(tree.revision).toBe(revision);
	expect(tree.get(second).parent).toBeNull();
	const third = document.implementation.createDocumentType("third", "", "");
	expect(() => document.insertBefore(third, document.doctype)).toThrow(
		"hierarchy",
	);
	expect(third.parentNode).toBeNull();
});

it("rejects moving the element before its doctype without changing order", () => {
	const { document } = fixture();
	const doctype = document.implementation.createDocumentType("html", "", "");
	const html = document.createElement("html");
	document.appendChild(doctype);
	document.appendChild(html);
	expect(() => document.insertBefore(html, doctype)).toThrow("hierarchy");
	expect(document.childNodes).toEqual([doctype, html]);
	expect(document.insertBefore(doctype, doctype)).toBe(doctype);
	expect(document.childNodes).toEqual([doctype, html]);
});

it("permits comments around doctypes and the document element", () => {
	const { document } = fixture();
	const before = document.createComment("before");
	const between = document.createComment("between");
	const after = document.createComment("after");
	const doctype = document.implementation.createDocumentType("html", "", "");
	const html = document.createElement("html");
	for (const child of [before, doctype, between, html, after])
		document.appendChild(child);
	expect(document.doctype).toBe(doctype);
	expect(document.childNodes).toEqual([before, doctype, between, html, after]);
});

it("replaces doctypes using the final child order", () => {
	const { document } = fixture();
	const original = document.implementation.createDocumentType("html", "", "");
	const replacement = document.implementation.createDocumentType(
		"replacement",
		"",
		"",
	);
	const html = document.createElement("html");
	document.appendChild(original);
	document.appendChild(html);
	expect(document.replaceChild(replacement, original)).toBe(original);
	expect(original.parentNode).toBeNull();
	expect(document.childNodes).toEqual([replacement, html]);
	expect(() =>
		document.replaceChild(document.createElement("other"), replacement),
	).toThrow("hierarchy");
	expect(document.doctype).toBe(replacement);
});

it("keeps native doctype tracking correct after replaceChildren and removal", () => {
	const { tree } = fixture();
	const first = tree.createDocumentType("first");
	const second = tree.createDocumentType("second");
	const html = tree.createElement("html");
	tree.append(tree.root, first);
	tree.append(tree.root, html);
	tree.replaceChildren(tree.root, second);
	expect(tree.get(tree.root).children).toEqual([second]);
	tree.append(tree.root, html);
	expect(() => tree.insert(tree.root, first, html)).toThrow("hierarchy");
	tree.remove(second);
	tree.insert(tree.root, first, html);
	expect(tree.get(tree.root).children).toEqual([first, html]);
});

it("rejects text and multi-element fragments in a document with a doctype", () => {
	const { tree } = fixture();
	tree.append(tree.root, tree.createDocumentType("html"));
	const fragment = tree.createFragment();
	tree.append(fragment, tree.createElement("first"));
	tree.append(fragment, tree.createElement("second"));
	expect(() => tree.append(tree.root, fragment)).toThrow("hierarchy");
	expect(tree.get(fragment).children).toHaveLength(2);
	expect(() => tree.append(tree.root, tree.createText("text"))).toThrow(
		"hierarchy",
	);
});

it.each(["name", "publicId", "systemId"] as const)(
	"compares doctype %s independently",
	(field) => {
		const { document } = fixture();
		const first = document.implementation.createDocumentType(
			"html",
			"public",
			"system",
		);
		const values = {
			name: "html",
			publicId: "public",
			systemId: "system",
			[field]: "different",
		};
		const second = document.implementation.createDocumentType(
			values.name,
			values.publicId,
			values.systemId,
		);
		expect(first.isEqualNode(second)).toBe(false);
	},
);

it("charges name and both identifiers before allocating", () => {
	const { tree, document } = fixture({ maxTextCodeUnits: 6 });
	expect(() =>
		document.implementation.createDocumentType("html", "PP", "S"),
	).toThrow("text limit");
	expect(tree.nodeCount).toBe(1);
	const doctype = document.implementation.createDocumentType("html", "P", "S");
	expect(tree.nodeCount).toBe(2);
	expect(() => doctype.cloneNode()).toThrow("text limit");
	expect(tree.nodeCount).toBe(2);
});

it("preflights destination quota for doctype import", () => {
	const source = fixture();
	const destination = fixture({ maxTextCodeUnits: 5 });
	const doctype = source.document.implementation.createDocumentType(
		"html",
		"P",
		"S",
	);
	expect(() => destination.document.importNode(doctype)).toThrow("text limit");
	expect(destination.tree.nodeCount).toBe(1);
	expect(doctype.publicId).toBe("P");
});

it("charges the native node quota without allocating partially", () => {
	const { tree, document } = fixture({ maxNodes: 1 });
	expect(() =>
		document.implementation.createDocumentType("html", "", ""),
	).toThrow("node limit");
	expect(tree.nodeCount).toBe(1);
});

it("serializes HTML doctypes without XML external identifiers", () => {
	const { tree } = fixture();
	const doctype = tree.createDocumentType("html", "public", "system");
	tree.append(tree.root, doctype);
	tree.append(tree.root, tree.createElement("html"));
	expect(serializeHtml(tree, tree.root)).toBe("<!DOCTYPE html><html></html>");
	expect(serializeHtml(tree, doctype, { includeSelf: true })).toBe(
		"<!DOCTYPE html>",
	);
	expect(serializeHtml(tree, doctype)).toBe("");
	expect(() => serializeHtml(tree, tree.root, { maxCodeUnits: 5 })).toThrow(
		"limit",
	);
});

it("keeps implementation objects document-scoped and revoked with their owner", () => {
	const first = fixture();
	const second = fixture();
	expect(first.document.implementation).not.toBe(
		second.document.implementation,
	);
	const implementation = first.document.implementation;
	const doctype = implementation.createDocumentType("html", "", "");
	first.tree.close();
	expect(() => doctype.name).toThrow("closed");
	expect(() => implementation.createDocumentType("html", "", "")).toThrow(
		"closed",
	);
	expect(second.document.implementation.hasFeature()).toBe(true);
});
