import { afterEach, expect, it } from "vitest";
import { DocumentTree, type DocumentLimits } from "./document.js";
import {
	documentOrigin,
	htmlDocumentContext,
	HtmlDocumentFamily,
} from "./html-document-family.js";
import { NodeRelations } from "./node-relations.js";
import { DocumentEvents } from "./events.js";
import type { ScriptLocation } from "./script-location.js";
import type { ScriptStorage } from "./script-storage.js";
import {
	ScriptDom,
	type ScriptHostObjectDefinition,
	type ScriptHostObjectFactory,
} from "./script-dom.js";

interface NodeView {
	nodeType: number;
	nodeName: string;
	name: string;
	publicId: string;
	systemId: string;
	ownerDocument: NodeView | null;
	parentNode: NodeView | null;
	firstChild: NodeView | null;
	lastChild: NodeView | null;
	childNodes: ArrayLike<NodeView>;
	textContent: string | null;
	title: string;
	head: NodeView;
	body: NodeView;
	documentElement: NodeView;
	doctype: NodeView;
	URL: string;
	documentURI: string;
	baseURI: string;
	contentType: string;
	characterSet: string;
	charset: string;
	inputEncoding: string;
	compatMode: string;
	defaultView: null;
	location: null;
	cookie: string;
	referrer: string;
	readyState: string;
	currentScript: null;
	activeElement: NodeView;
	innerHTML: string;
	href: string;
	scrollTop: number;
	scrollLeft: number;
	clientWidth: number;
	clientHeight: number;
	offsetWidth: number;
	offsetHeight: number;
	offsetTop: number;
	offsetLeft: number;
	offsetParent: null;
	scrollWidth: number;
	scrollHeight: number;
	remove(): void;
	addEventListener(type: string, callback: unknown): void;
	elementFromPoint(x: number, y: number): NodeView | null;
	elementsFromPoint(x: number, y: number): NodeView[];
	getBoundingClientRect(): {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	getClientRects(): ArrayLike<object>;
	hasFocus(): boolean;
	focus(): void;
	blur(): void;
	appendChild(node: NodeView): NodeView;
	createElement(name: string): NodeView;
	createTextNode(value: string): NodeView;
	importNode(node: NodeView, deep?: boolean): NodeView;
	querySelector(selector: string): NodeView | null;
	setAttribute(name: string, value: string): void;
	implementation: {
		createHTMLDocument(...args: unknown[]): NodeView;
		hasFeature(): boolean;
	};
}
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const factory: ScriptHostObjectFactory = {
	createHostObject(definition: ScriptHostObjectDefinition) {
		const result = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(result, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(result, name, { value: method });
		if (definition.indexed) {
			Object.defineProperty(result, "length", {
				get: definition.indexed.length,
			});
			return new Proxy(result, {
				get: (target, key) =>
					typeof key === "string" && /^\d+$/.test(key)
						? definition.indexed?.get(Number(key))
						: target[key],
			});
		}
		return result;
	},
};
function fixture(
	limits: Partial<DocumentLimits> = {},
	provider = factory,
	url = "https://example.com/page",
) {
	const tree = new DocumentTree(url, limits);
	trees.push(tree);
	const dom = new ScriptDom(tree, provider);
	return { tree, dom, document: dom.document as NodeView };
}

it("creates an owned HTML skeleton without a title when omitted", () => {
	const { document } = fixture();
	const child = document.implementation.createHTMLDocument();
	expect(child).not.toBe(document);
	expect(child.nodeType).toBe(9);
	expect(child.ownerDocument).toBeNull();
	expect(child.childNodes.length).toBe(2);
	expect(child.firstChild).toBe(child.doctype);
	expect(child.lastChild).toBe(child.documentElement);
	expect(child.doctype.name).toBe("html");
	expect(child.doctype.publicId).toBe("");
	expect(child.doctype.systemId).toBe("");
	expect(child.doctype.ownerDocument).toBe(child);
	expect(child.documentElement.childNodes.length).toBe(2);
	expect(child.documentElement.firstChild).toBe(child.head);
	expect(child.documentElement.lastChild).toBe(child.body);
	expect(child.head.childNodes.length).toBe(0);
	expect(child.body.childNodes.length).toBe(0);
	expect(child.body.ownerDocument).toBe(child);
	expect(child.body.parentNode).toBe(child.documentElement);
});

it("creates an actual empty title text node when the title is empty", () => {
	const { document } = fixture();
	const child = document.implementation.createHTMLDocument("");
	expect(child.head.firstChild?.nodeName).toBe("TITLE");
	expect(child.head.firstChild?.childNodes.length).toBe(1);
	expect(child.head.firstChild?.firstChild?.nodeType).toBe(3);
	expect(child.title).toBe("");
});

it("does not expose document-only defaults on element capabilities", () => {
	const child = fixture().document.implementation.createHTMLDocument();
	for (const name of [
		"cookie",
		"location",
		"defaultView",
		"contentType",
		"activeElement",
		"hasFocus",
	])
		expect(name in child.body).toBe(false);
});

it("returns inert UTF-8 HTML defaults without inherited page bindings", () => {
	const child = fixture().document.implementation.createHTMLDocument();
	for (const key of ["URL", "documentURI", "baseURI"] as const)
		expect(child[key]).toBe("about:blank");
	for (const key of ["characterSet", "charset", "inputEncoding"] as const)
		expect(child[key]).toBe("UTF-8");
	expect(child.contentType).toBe("text/html");
	expect(child.compatMode).toBe("CSS1Compat");
	expect(child.defaultView).toBeNull();
	expect(child.location).toBeNull();
	expect(child.referrer).toBe("");
	expect(child.cookie).toBe("");
	child.cookie = "secret=not-stored";
	expect(child.cookie).toBe("");
	expect(child.readyState).toBe("complete");
	expect(child.currentScript).toBeNull();
	expect(child.hasFocus()).toBe(false);
});

function treeOf(root: DocumentTree, node: NodeView): DocumentTree {
	const relations = new NodeRelations(root);
	try {
		return relations.source(node).tree;
	} finally {
		relations.close();
	}
}

for (const [value, expected] of [
	[undefined, undefined],
	[null, "null"],
	[false, "false"],
	[0, "0"],
	["\t one \n two\r ", "\t one \n two\r "],
	["🙂", "🙂"],
] as const)
	it(`handles optional title conversion: ${String(value)}`, () => {
		const { document } = fixture();
		const child = document.implementation.createHTMLDocument(value);
		expect(child.head.firstChild?.textContent).toBe(expected);
		expect(child.title).toBe(
			expected === undefined
				? ""
				: expected.replace(/[\t\n\f\r ]+/g, " ").trim(),
		);
	});

it("rejects unsupported title coercion without running user conversion", () => {
	const { document, dom } = fixture();
	let converted = false;
	expect(() =>
		document.implementation.createHTMLDocument({
			toString() {
				converted = true;
				return "title";
			},
		}),
	).toThrow("Object-to-DOM-string");
	expect(() =>
		document.implementation.createHTMLDocument(Symbol("title")),
	).toThrow("Object-to-DOM-string");
	expect(converted).toBe(false);
	expect(dom.metrics().documents).toBeNull();
});

it("keeps the creator tree untouched and each implementation stable", () => {
	const { document, tree } = fixture();
	const before = tree.resourceUsage();
	const first = document.implementation.createHTMLDocument();
	const second = document.implementation.createHTMLDocument();
	expect(first.implementation).toBe(first.implementation);
	expect(first.implementation).not.toBe(second.implementation);
	expect(first.implementation).not.toBe(document.implementation);
	expect(first.body).not.toBe(second.body);
	expect(tree.resourceUsage()).toEqual(before);
	expect(tree.revision).toBe(0);
});

it("inherits origin identity independently of about:blank and base URLs", () => {
	const { document, tree } = fixture();
	const child = document.implementation.createHTMLDocument();
	const nested = child.implementation.createHTMLDocument();
	const childTree = treeOf(tree, child);
	const nestedTree = treeOf(tree, nested);
	expect(documentOrigin(childTree)).toBe(documentOrigin(tree));
	expect(documentOrigin(nestedTree)).toBe(documentOrigin(tree));
	expect(documentOrigin(childTree)).toEqual({
		serialized: "https://example.com",
		opaque: false,
	});
	expect(Object.isFrozen(documentOrigin(childTree))).toBe(true);
	expect(htmlDocumentContext(childTree)?.family).toBe(
		htmlDocumentContext(nestedTree)?.family,
	);
	const base = child.createElement("base");
	base.setAttribute("href", "https://elsewhere.test/base/");
	child.head.appendChild(base);
	expect(child.baseURI).toBe("https://elsewhere.test/base/");
	expect(documentOrigin(childTree)).toBe(documentOrigin(tree));
});

it("does not merge distinct opaque origins", () => {
	const first = fixture({}, factory, "about:blank");
	const second = fixture({}, factory, "about:blank");
	const child = first.document.implementation.createHTMLDocument();
	expect(documentOrigin(treeOf(first.tree, child))).toBe(
		documentOrigin(first.tree),
	);
	expect(documentOrigin(first.tree)).not.toBe(documentOrigin(second.tree));
	expect(documentOrigin(first.tree).opaque).toBe(true);
});

it("supports inert markup manipulation and copying into another document", () => {
	const { document, tree } = fixture();
	const child = document.implementation.createHTMLDocument("source");
	child.body.innerHTML =
		'<form></form><form></form><a href="relative">link</a><script>globalThis.marker = 1</script>';
	expect(child.body.childNodes.length).toBe(4);
	const link = child.querySelector("a") as NodeView;
	expect(link.href).toBe("relative");
	const copied = document.importNode(link, true);
	expect(copied.ownerDocument).toBe(document);
	expect(copied.href).toBe("https://example.com/relative");
	expect(copied.textContent).toBe("link");
	treeOf(tree, child).close();
	expect(copied.textContent).toBe("link");
});

it("keeps cross-document movement rejected rather than silently adopting", () => {
	const { document } = fixture();
	const first = document.implementation.createHTMLDocument();
	const second = document.implementation.createHTMLDocument();
	expect(() => second.body.appendChild(first.body)).toThrow(
		"Expected a node from this script document",
	);
	expect(first.body.parentNode).toBe(first.documentElement);
	expect(second.body.childNodes.length).toBe(0);
});

it("supports document title updates without altering creator or sibling titles", () => {
	const { document } = fixture();
	const child = document.implementation.createHTMLDocument();
	const sibling = document.implementation.createHTMLDocument("sibling");
	child.title = " new title ";
	expect(child.title).toBe("new title");
	expect(child.head.firstChild?.nodeName).toBe("TITLE");
	expect(document.title).toBe("");
	expect(sibling.title).toBe("sibling");
});

it("exposes unrendered geometry, no hit targets and no focus side effects", () => {
	const { document, tree } = fixture();
	const child = document.implementation.createHTMLDocument();
	child.body.innerHTML =
		'<div style="width:300px;height:200px;overflow:scroll">content</div>';
	const element = child.body.firstChild as NodeView;
	for (const key of [
		"clientWidth",
		"clientHeight",
		"offsetWidth",
		"offsetHeight",
		"offsetTop",
		"offsetLeft",
		"scrollWidth",
		"scrollHeight",
	] as const)
		expect(element[key]).toBe(0);
	expect(element.offsetParent).toBeNull();
	expect(element.getClientRects().length).toBe(0);
	const rect = element.getBoundingClientRect();
	for (const key of ["x", "y", "width", "height"] as const)
		expect(rect[key]).toBe(0);
	element.scrollTop = 50;
	element.scrollLeft = 50;
	expect(element.scrollTop).toBe(0);
	expect(element.scrollLeft).toBe(0);
	element.focus();
	element.blur();
	expect(child.activeElement).toBe(child.body);
	expect(treeOf(tree, child).activeElement).toBeNull();
	expect(child.hasFocus()).toBe(false);
	expect(child.elementFromPoint(1, 1)).toBeNull();
	expect(child.elementsFromPoint(1, 1)).toEqual([]);
});

it("bounds nested creations using one lifetime admission counter", () => {
	const { document, dom } = fixture();
	let current = document;
	for (let count = 0; count < 16; count++)
		current = current.implementation.createHTMLDocument();
	expect(() => current.implementation.createHTMLDocument()).toThrow(
		"HTML document creation limit",
	);
	expect(() => document.implementation.createHTMLDocument()).toThrow(
		"HTML document creation limit",
	);
	expect(dom.metrics().documents).toMatchObject({
		attempts: 16,
		documents: 16,
		nodes: 80,
		textCodeUnits: 256,
	});
});

it("preflights skeleton nodes without retaining partial failed documents", () => {
	const { document, dom } = fixture({ maxNodes: 9 });
	document.implementation.createHTMLDocument();
	expect(() => document.implementation.createHTMLDocument()).toThrow(
		"Shared document node limit",
	);
	expect(dom.metrics().documents).toMatchObject({
		attempts: 2,
		documents: 1,
		nodes: 5,
	});
});

it("preflights title text including retained element and doctype names", () => {
	const { document, dom } = fixture({ maxTextCodeUnits: 23 });
	expect(() => document.implementation.createHTMLDocument("abc")).toThrow(
		"Shared document text limit",
	);
	expect(dom.metrics().documents).toMatchObject({
		attempts: 1,
		documents: 0,
		nodes: 0,
	});
	const child = document.implementation.createHTMLDocument("ab");
	expect(child.title).toBe("ab");
	expect(dom.metrics().documents?.textCodeUnits).toBe(23);
});

it("preflights depth and distinguishes omitted from empty titles", () => {
	const { document, dom } = fixture({ maxDepth: 2 });
	expect(() => document.implementation.createHTMLDocument("")).toThrow(
		"HTML document depth limit",
	);
	expect(dom.metrics().documents?.documents).toBe(0);
	document.implementation.createHTMLDocument();
	expect(dom.metrics().documents?.nodes).toBe(5);
});

it("charges child mutations and imports to the family budget", () => {
	const { document, dom } = fixture({ maxNodes: 11 });
	const first = document.implementation.createHTMLDocument();
	const second = document.implementation.createHTMLDocument();
	const text = first.createTextNode("x");
	expect(() => second.createElement("p")).toThrow("Shared document node limit");
	expect(() => second.importNode(text)).toThrow("Shared document node limit");
	expect(dom.metrics().documents?.nodes).toBe(11);
});

it("releases closed document capacity without resetting lifetime admission", () => {
	const { document, tree, dom } = fixture({ maxNodes: 5 });
	for (let count = 0; count < 16; count++) {
		const child = document.implementation.createHTMLDocument();
		treeOf(tree, child).close();
	}
	expect(dom.metrics().documents).toMatchObject({
		attempts: 16,
		documents: 0,
		nodes: 0,
	});
	expect(() => document.implementation.createHTMLDocument()).toThrow(
		"HTML document creation limit",
	);
});

it("reuses the family even when native code wraps a child in another ScriptDom", () => {
	const { document, tree, dom } = fixture();
	const child = document.implementation.createHTMLDocument();
	const childTree = treeOf(tree, child);
	const wrapper = new ScriptDom(childTree, factory);
	(wrapper.document as NodeView).implementation.createHTMLDocument();
	expect(dom.metrics().documents?.documents).toBe(2);
	expect(() => new HtmlDocumentFamily(childTree)).toThrow("existing family");
	wrapper.close();
	expect(child.body.nodeName).toBe("BODY");
});

it("closes nested documents when the initiating ScriptDom closes", () => {
	const { document, dom, tree } = fixture();
	const child = document.implementation.createHTMLDocument();
	const nested = child.implementation.createHTMLDocument();
	const retained = nested.body;
	const implementation = nested.implementation;
	const rect = retained.getBoundingClientRect();
	dom.close();
	expect(() => retained.nodeName).toThrow("closed");
	expect(() => implementation.createHTMLDocument()).toThrow("closed");
	expect(() => rect.width).toThrow("closed");
	expect(tree.get(tree.root).kind).toBe("document");
	expect(dom.metrics().documents).toMatchObject({ documents: 0, closed: true });
});

it("does not close siblings or descendants when just one document closes", () => {
	const { document, tree } = fixture();
	const first = document.implementation.createHTMLDocument();
	const nested = first.implementation.createHTMLDocument();
	const sibling = document.implementation.createHTMLDocument();
	const childTree = treeOf(tree, first);
	childTree.close();
	expect(htmlDocumentContext(childTree)).toBeUndefined();
	expect(sibling.body.nodeName).toBe("BODY");
	expect(nested.body.nodeName).toBe("BODY");
	nested.implementation.createHTMLDocument();
});

it("closes every family member despite native cleanup failures", () => {
	const { document, tree, dom } = fixture();
	const child = document.implementation.createHTMLDocument();
	const sibling = document.implementation.createHTMLDocument();
	treeOf(tree, child).onClose(() => {
		throw new Error("cleanup failure");
	});
	expect(() => dom.close()).toThrow("Shared document cleanup failed");
	expect(() => child.body).toThrow("closed");
	expect(() => sibling.body).toThrow("closed");
	expect(dom.metrics().documents?.documents).toBe(0);
});

it("cleans up rejected host publication while preserving successful siblings", () => {
	let reject = false;
	let captured: ScriptHostObjectDefinition | undefined;
	const provider = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			if (reject) {
				captured = definition;
				throw new Error("provider failure");
			}
			return factory.createHostObject(definition);
		},
	};
	const { document, dom } = fixture({}, provider);
	const sibling = document.implementation.createHTMLDocument();
	reject = true;
	expect(() => document.implementation.createHTMLDocument()).toThrow(
		"provider failure",
	);
	expect(() => captured?.properties?.nodeType.get()).toThrow();
	reject = false;
	expect(sibling.body.nodeName).toBe("BODY");
	expect(dom.metrics().documents).toMatchObject({
		attempts: 2,
		documents: 1,
		nodes: 5,
	});
});

it("cannot return a document after the factory closes its initiating owner", () => {
	let interrupt: (() => void) | undefined;
	let captured: ScriptHostObjectDefinition | undefined;
	const provider = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			if (interrupt) {
				const close = interrupt;
				interrupt = undefined;
				captured = definition;
				close();
			}
			return factory.createHostObject(definition);
		},
	};
	const { document, dom } = fixture({}, provider);
	const implementation = document.implementation;
	interrupt = () => dom.close();
	expect(() => implementation.createHTMLDocument()).toThrow("closed");
	expect(() => captured?.methods?.createElement("p")).toThrow();
	expect(dom.metrics().documents).toMatchObject({
		documents: 0,
		nodes: 0,
		closed: true,
	});
});

it("reserves lifetime attempts before reentrant host factories run", () => {
	let enter: (() => void) | undefined;
	const provider = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			enter?.();
			return factory.createHostObject(definition);
		},
	};
	const { document, dom } = fixture({}, provider);
	const implementation = document.implementation;
	enter = () => {
		implementation.createHTMLDocument();
	};
	expect(() => implementation.createHTMLDocument()).toThrow(
		"HTML document creation limit",
	);
	enter = undefined;
	expect(dom.metrics().documents).toMatchObject({
		attempts: 16,
		documents: 0,
		nodes: 0,
	});
});

it("never hands the creator cookie and navigation bindings to a child", () => {
	const tree = new DocumentTree("https://example.com/page");
	trees.push(tree);
	let reads = 0;
	let writes = 0;
	let navigations = 0;
	const storage = {
		readCookie: () => {
			reads++;
			return "parent=value";
		},
		writeCookie: () => {
			writes++;
		},
	} as unknown as ScriptStorage;
	const location = {
		object: {},
		navigate: () => {
			navigations++;
		},
	} as unknown as ScriptLocation;
	const dom = new ScriptDom(tree, factory, undefined, location, storage);
	const parent = dom.document as NodeView;
	expect(parent.cookie).toBe("parent=value");
	const child = parent.implementation.createHTMLDocument();
	child.cookie = "child=ignored";
	expect(child.cookie).toBe("");
	expect(child.location).toBeNull();
	expect(child.defaultView).toBeNull();
	expect([reads, writes, navigations]).toEqual([1, 0, 0]);
});

it("does not infer quirks mode from later doctype removal", () => {
	const child = fixture().document.implementation.createHTMLDocument();
	child.doctype.remove();
	expect(child.doctype).toBeNull();
	expect(child.compatMode).toBe("CSS1Compat");
});

it("charges rejected skeleton attempts to the lifetime bound", () => {
	const { document, dom } = fixture({ maxNodes: 4 });
	for (let count = 0; count < 16; count++)
		expect(() => document.implementation.createHTMLDocument()).toThrow(
			"Shared document node limit",
		);
	expect(dom.metrics().documents).toMatchObject({
		attempts: 16,
		documents: 0,
		nodes: 0,
	});
	expect(() => document.implementation.createHTMLDocument()).toThrow(
		"HTML document creation limit",
	);
});

it("rejects recycled provider identities and releases the candidate", () => {
	let reused: object | undefined;
	const provider = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			return reused ?? factory.createHostObject(definition);
		},
	};
	const { document, dom } = fixture({}, provider);
	const implementation = document.implementation;
	reused = document;
	expect(() => implementation.createHTMLDocument()).toThrow("identity");
	expect(dom.metrics().documents).toMatchObject({ attempts: 1, documents: 0 });
	reused = undefined;
	expect(implementation.createHTMLDocument().body.nodeName).toBe("BODY");
});

it("does not publish a native candidate closed by its publisher", () => {
	const { tree } = fixture();
	const family = new HtmlDocumentFamily(tree);
	expect(() =>
		family.create(undefined, (candidate) => {
			candidate.close();
			return {};
		}),
	).toThrow("closed");
	expect(family.metrics()).toMatchObject({
		attempts: 1,
		documents: 0,
		nodes: 0,
	});
});

it("aggregates publication and cleanup errors without retaining the document", () => {
	const { tree } = fixture();
	const family = new HtmlDocumentFamily(tree);
	let failure: unknown;
	try {
		family.create(undefined, (candidate) => {
			candidate.onClose(() => {
				throw new Error("cleanup");
			});
			throw new Error("publish");
		});
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AggregateError);
	expect((failure as AggregateError).errors).toHaveLength(2);
	expect(family.metrics().documents).toBe(0);
});

it("rejects invalid native publications and arguments", () => {
	const { tree } = fixture();
	const family = new HtmlDocumentFamily(tree);
	expect(() => family.create(null as unknown as string, () => ({}))).toThrow(
		"Invalid HTML document",
	);
	expect(() =>
		family.create(undefined, null as unknown as () => object),
	).toThrow("Invalid HTML document");
	expect(family.metrics().attempts).toBe(0);
	expect(() =>
		family.create(undefined, () => null as unknown as object),
	).toThrow("requires an object");
	expect(family.metrics()).toMatchObject({ attempts: 1, documents: 0 });
});

it("keeps separately owned root families isolated on teardown", () => {
	const first = fixture();
	const second = fixture();
	const child = first.document.implementation.createHTMLDocument();
	const independent = second.document.implementation.createHTMLDocument();
	first.tree.close();
	expect(() => child.body).toThrow("closed");
	expect(independent.body.nodeName).toBe("BODY");
	expect(second.dom.metrics().documents?.documents).toBe(1);
});

it("preserves event listener capability without borrowing the creator dispatcher", () => {
	const tree = new DocumentTree("https://example.com");
	trees.push(tree);
	const events = new DocumentEvents(tree);
	const callbacks = {
		isClosed: () => false,
		startCallback: () => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(),
		}),
	};
	const dom = new ScriptDom(tree, factory, { events, callbacks });
	const child = (dom.document as NodeView).implementation.createHTMLDocument();
	child.body.addEventListener("click", () => undefined);
	expect(events.metrics().listeners).toBe(0);
	const body = child.body;
	dom.close();
	expect(() => body.addEventListener("click", () => undefined)).toThrow(
		"closed",
	);
});
