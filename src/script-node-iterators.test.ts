import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	pageDomConstructorBootstrapGlobal,
	pageDomConstructorBootstrapSource,
} from "./page-dom-constructor-bootstrap.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import {
	ScriptNodeIterators,
	nodeIteratorLimits,
} from "./script-node-iterators.js";
import { ScriptNodePublications } from "./script-node-publications.js";
interface Node {
	nodeName: string;
	textContent: string;
	innerHTML: string;
	ownerDocument: Node;
	previousSibling: Node;
	createDocumentFragment(): Node;
	querySelector(s: string): Node;
	appendChild(n: Node): Node;
	remove(): void;
	createElement(s: string): Node;
	createTextNode(s: string): Node;
	body: Node;
	createNodeIterator(root: Node, mask?: unknown, filter?: unknown): Iterator;
}
interface Iterator {
	root: Node;
	whatToShow: number;
	filter: null;
	referenceNode: Node;
	pointerBeforeReferenceNode: boolean;
	nextNode(): Node | null;
	previousNode(): Node | null;
	detach(): void;
}
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const factory = {
	createHostObject(def: ScriptHostObjectDefinition): object {
		const obj = Object.create(null);
		for (const [name, d] of Object.entries(def.properties ?? {}))
			Object.defineProperty(obj, name, d);
		for (const [name, method] of Object.entries(def.methods ?? {}))
			Object.defineProperty(obj, name, { value: method });
		return obj;
	},
};
function fixture(html = "<b>a</b><!--c--><i>d</i>") {
	const tree = parseHtmlDocument(html, "https://example.com/");
	trees.push(tree);
	const dom = new ScriptDom(tree, factory);
	const document = dom.document as Node;
	return {
		tree,
		dom,
		document,
		iterator: document.createNodeIterator(document.body),
	};
}
function required(node: Node | null): Node {
	if (node === null) throw new Error("Missing expected iterator node");
	return node;
}
function collect(iterator: Iterator, forward = true): string[] {
	const result: string[] = [];
	while (true) {
		const node = forward ? iterator.nextNode() : iterator.previousNode();
		if (node === null) break;
		result.push(node.nodeName);
	}
	return result;
}

it("walks preorder including the root and reverses from both boundaries", () => {
	const { document, iterator } = fixture();
	expect(iterator.root).toBe(document.body);
	expect(iterator.referenceNode).toBe(document.body);
	expect(iterator.pointerBeforeReferenceNode).toBe(true);
	expect(iterator.previousNode()).toBeNull();
	expect(collect(iterator)).toEqual([
		"BODY",
		"B",
		"#text",
		"#comment",
		"I",
		"#text",
	]);
	expect(iterator.pointerBeforeReferenceNode).toBe(false);
	expect(collect(iterator, false)).toEqual([
		"#text",
		"I",
		"#comment",
		"#text",
		"B",
		"BODY",
	]);
	expect(iterator.pointerBeforeReferenceNode).toBe(true);
	expect(collect(iterator)).toEqual([
		"BODY",
		"B",
		"#text",
		"#comment",
		"I",
		"#text",
	]);
});
it("returns the current node when direction changes", () => {
	const { iterator } = fixture();
	const root = iterator.nextNode();
	expect(iterator.previousNode()).toBe(root);
	expect(iterator.nextNode()).toBe(root);
	const b = iterator.nextNode();
	expect(iterator.previousNode()).toBe(b);
	expect(iterator.previousNode()).toBe(root);
});
it("filters by unsigned node-type mask without pruning descendants", () => {
	const { document } = fixture();
	expect(collect(document.createNodeIterator(document.body, 4))).toEqual([
		"#text",
		"#text",
	]);
	expect(collect(document.createNodeIterator(document.body, 129))).toEqual([
		"BODY",
		"B",
		"#comment",
		"I",
	]);
	const empty = document.createNodeIterator(document.body, 0);
	expect(empty.nextNode()).toBeNull();
	expect(empty.referenceNode).toBe(document.body);
	expect(empty.pointerBeforeReferenceNode).toBe(true);
	expect(document.createNodeIterator(document.body, -1).whatToShow).toBe(
		0xffffffff,
	);
	expect(
		document.createNodeIterator(document.body, 4294967297).whatToShow,
	).toBe(1);
});
it("updates an after-reference cursor when its node is removed", () => {
	const { document, iterator } = fixture();
	iterator.nextNode();
	const b = required(iterator.nextNode());
	b.remove();
	expect(iterator.referenceNode).toBe(document.body);
	expect(iterator.pointerBeforeReferenceNode).toBe(false);
	expect(collect(iterator)).toEqual(["#comment", "I", "#text"]);
});
it("updates a before-reference cursor to the following subtree after removal", () => {
	const { document, iterator } = fixture();
	iterator.nextNode();
	const b = required(iterator.nextNode());
	iterator.previousNode();
	b.remove();
	expect(iterator.referenceNode).toBe(
		document.querySelector("i").previousSibling,
	);
	expect(iterator.pointerBeforeReferenceNode).toBe(true);
	expect(collect(iterator)).toEqual(["#comment", "I", "#text"]);
});
it("recovers from removal of the ancestor containing the reference node", () => {
	const { document, iterator } = fixture("<b><u>a</u></b><i>d</i>");
	iterator.nextNode();
	iterator.nextNode();
	iterator.nextNode();
	iterator.nextNode();
	document.querySelector("b").remove();
	expect(iterator.referenceNode).toBe(document.body);
	expect(collect(iterator)).toEqual(["I", "#text"]);
});
it("falls back to the deepest previous surviving subtree at the end", () => {
	const { document, iterator } = fixture("<b><u>a</u></b><i>d</i>");
	collect(iterator);
	const last = required(iterator.previousNode());
	expect(last.nodeName).toBe("#text");
	document.querySelector("i").remove();
	expect(iterator.referenceNode.nodeName).toBe("#text");
	expect(iterator.referenceNode.textContent).toBe("a");
	expect(iterator.pointerBeforeReferenceNode).toBe(false);
	expect(iterator.nextNode()).toBeNull();
	expect(iterator.previousNode()?.textContent).toBe("a");
});
it("keeps a detached iterator root and its subtree as the traversal boundary", () => {
	const { document } = fixture("<section><b>a</b></section><i>d</i>");
	const root = document.querySelector("section");
	const iterator = document.createNodeIterator(root);
	root.remove();
	expect(collect(iterator)).toEqual(["SECTION", "B", "#text"]);
	expect(collect(iterator, false)).toEqual(["#text", "B", "SECTION"]);
});
it("sees insertions after the reference and recovers from replacing all children", () => {
	const { document, iterator } = fixture();
	collect(iterator);
	const appended = document.createElement("u");
	appended.appendChild(document.createTextNode("e"));
	document.body.appendChild(appended);
	expect(collect(iterator)).toEqual(["U", "#text"]);
	document.body.innerHTML = "<em>new</em>";
	expect(iterator.referenceNode).toBe(document.body);
	expect(collect(iterator)).toEqual(["EM", "#text"]);
});
it("supports document and fragment roots without crossing into template contents", () => {
	const { document } = fixture("<template><i>held</i></template>");
	expect(collect(document.createNodeIterator(document))).toEqual([
		"#document",
		"HTML",
		"HEAD",
		"TEMPLATE",
		"BODY",
	]);
	const fragment = document.createDocumentFragment();
	fragment.appendChild(document.createTextNode("a"));
	expect(collect(document.createNodeIterator(fragment))).toEqual([
		"#document-fragment",
		"#text",
	]);
});
it("keeps detach as a no-op and revokes all reads and methods on document close", () => {
	const { tree, iterator } = fixture();
	iterator.detach();
	expect(iterator.nextNode()?.nodeName).toBe("BODY");
	tree.close();
	for (const read of [
		() => iterator.root,
		() => iterator.referenceNode,
		() => iterator.nextNode(),
		() => iterator.previousNode(),
		() => iterator.detach(),
	])
		expect(read).toThrow("closed");
});
it("bounds lifetime creations and rejects unsupported filters and mask coercion", () => {
	const { document, dom } = fixture();
	for (let i = 1; i < nodeIteratorLimits.maxCreated; i++)
		document.createNodeIterator(document.body).detach();
	expect(() => document.createNodeIterator(document.body)).toThrow(
		"creation limit",
	);
	expect(() => document.createNodeIterator(document.body, 1, {})).toThrow(
		"callback filters",
	);
	expect(() => document.createNodeIterator(document.body, {})).toThrow(
		"mask object conversion",
	);
	expect(() => document.createNodeIterator(document.body, 1n)).toThrow(
		TypeError,
	);
	expect(dom.metrics().nodeIterators?.created).toBe(256);
});
it("exposes NodeFilter constants and owned NodeIterator branding", () => {
	const { document, dom } = fixture();
	const context = createContext({
		document,
		[pageDomConstructorBootstrapGlobal]: (value: unknown, name: unknown) =>
			dom.hasInstance(value, name),
	});
	runInContext(pageDomConstructorBootstrapSource, context);
	expect(
		runInContext(
			'NodeFilter.SHOW_ALL+":"+NodeFilter.SHOW_TEXT+":"+NodeFilter.prototype.FILTER_SKIP',
			context,
		),
	).toBe("4294967295:4:3");
	expect(
		runInContext(
			"document.createNodeIterator(document.body) instanceof NodeIterator",
			context,
		),
	).toBe(true);
	expect(() => runInContext("new NodeIterator()", context)).toThrow(
		"Illegal constructor",
	);
	expect(() => runInContext("new NodeFilter()", context)).toThrow(
		"Illegal constructor",
	);
});
it("releases a failed publication and rejects recycled capability identities", () => {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	const reused = {};
	let recycle = false;
	const provider = {
		createHostObject: (def: ScriptHostObjectDefinition) =>
			recycle ? reused : factory.createHostObject(def),
	};
	const publications = new ScriptNodePublications(provider, () =>
		tree.get(tree.root),
	);
	const owner = new ScriptNodeIterators(
		tree,
		provider,
		publications,
		() => reused,
	);
	const first = owner.create(tree.root);
	expect(first).not.toBe(reused);
	recycle = true;
	owner.create(tree.root);
	expect(() => owner.create(tree.root)).toThrow("identity");
	expect(owner.metrics().cursors).toBe(2);
	owner.close();
	expect(owner.metrics()).toMatchObject({
		cursors: 0,
		cachedParents: 0,
		cachedChildren: 0,
		closed: true,
	});
});

it("brands HTML forms and live attribute maps with their owner", () => {
	const { dom, document, tree } = fixture(
		'<form id="f"><input name="field"></form><div id="d"></div>',
	);
	const context = createContext({
		document,
		[pageDomConstructorBootstrapGlobal]: (value: unknown, name: unknown) =>
			dom.hasInstance(value, name),
	});
	runInContext(pageDomConstructorBootstrapSource, context);
	expect(
		runInContext(
			'document.querySelector("form") instanceof HTMLFormElement',
			context,
		),
	).toBe(true);
	expect(
		runInContext(
			'document.querySelector("div") instanceof HTMLFormElement',
			context,
		),
	).toBe(false);
	expect(
		runInContext(
			'document.querySelector("form").attributes instanceof NamedNodeMap',
			context,
		),
	).toBe(true);
	expect(
		runInContext(
			'document.querySelector("form").attributes instanceof Node',
			context,
		),
	).toBe(false);
	const attributes = Reflect.get(document.querySelector("form"), "attributes");
	const foreignTree = new DocumentTree("https://other.example/");
	trees.push(foreignTree);
	const foreign = new ScriptDom(foreignTree, { ...factory });
	expect(foreign.hasInstance(attributes, "NamedNodeMap")).toBe(false);
	tree.close();
	expect(() => dom.hasInstance(attributes, "NamedNodeMap")).toThrow("closed");
});
it("bounds traversal work and preserves the last accepted position on exhaustion", () => {
	const { document, dom } = fixture("<i></i>".repeat(20000));
	const iterator = document.createNodeIterator(document.body, 0);
	expect(() => iterator.nextNode()).toThrow("work limit");
	expect(iterator.referenceNode).toBe(document.body);
	expect(iterator.pointerBeforeReferenceNode).toBe(true);
	expect(dom.metrics().nodeIterators?.cachedChildren).toBeLessThanOrEqual(
		nodeIteratorLimits.maxCachedChildren,
	);
});
