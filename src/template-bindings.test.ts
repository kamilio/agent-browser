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
	content: NodeView;
	ownerDocument: NodeView;
	nodeName: string;
	nodeType: number;
	parentNode: NodeView | null;
	firstChild: NodeView | null;
	childNodes: ArrayLike<NodeView>;
	textContent: string;
	innerHTML: string;
	outerHTML: string;
	URL: string;
	contentType: string;
	characterSet: string;
	compatMode: string;
	defaultView: null;
	location: null;
	cookie: string;
	readyState: string;
	currentScript: null;
	activeElement: null;
	body: NodeView | null;
	head: NodeView | null;
	documentElement: NodeView | null;
	doctype: NodeView | null;
	scrollTop: number;
	clientWidth: number;
	createElement(name: string): NodeView;
	createTextNode(value: string): NodeView;
	appendChild(node: NodeView): NodeView;
	cloneNode(deep?: boolean): NodeView;
	importNode(node: NodeView, deep?: boolean): NodeView;
	querySelector(selector: string): NodeView | null;
	contains(node: NodeView): boolean;
	isSameNode(node: NodeView): boolean;
	focus(): void;
	hasFocus(): boolean;
	addEventListener(type: string, callback: unknown): void;
	getBoundingClientRect(): { width: number; height: number };
	implementation: { createHTMLDocument(title?: unknown): NodeView };
}

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
const factory: ScriptHostObjectFactory = {
	createHostObject(definition) {
		const result = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(result, name, property);
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
function fixture(limits: Partial<DocumentLimits> = {}, provider = factory) {
	const tree = new DocumentTree("https://example.com/", limits);
	trees.push(tree);
	const dom = new ScriptDom(tree, provider);
	return { tree, dom, document: dom.document as NodeView };
}
function treeOf(root: DocumentTree, node: NodeView) {
	const relations = new NodeRelations(root);
	try {
		return relations.source(node).tree;
	} finally {
		relations.close();
	}
}

it("publishes stable template contents in a distinct empty document", () => {
	const { document } = fixture();
	const template = document.createElement("template");
	expect(template.content).toBeDefined();
	expect(template.content).toBe(template.content);
	expect(template.content.nodeType).toBe(11);
	expect(template.content.ownerDocument).not.toBe(document);
	expect(template.content.ownerDocument.childNodes.length).toBe(0);
});

it("makes directly wrapped native template owners inert", () => {
	const { tree } = fixture();
	const template = tree.createElement("template");
	const owner = tree.templateContent(template).tree;
	const wrapper = new ScriptDom(owner, factory);
	const document = wrapper.document as NodeView;
	expect(document.defaultView).toBeNull();
	expect(document.location).toBeNull();
	expect(document.contentType).toBe("application/xml");
	wrapper.close();
});

it("creates HTML documents with the contents caller's opaque origin", () => {
	const { tree, document } = fixture();
	const owner = document.createElement("template").content.ownerDocument;
	const child = owner.implementation.createHTMLDocument();
	expect(documentOrigin(treeOf(tree, child))).toBe(
		documentOrigin(treeOf(tree, owner)),
	);
	expect(documentOrigin(treeOf(tree, child))).not.toBe(documentOrigin(tree));
	expect(documentOrigin(treeOf(tree, child)).opaque).toBe(true);
});

it("reuses a contents document for siblings and nested template elements", () => {
	const { document } = fixture();
	const first = document.createElement("template").content;
	const second = document.createElement("template").content;
	expect(first).not.toBe(second);
	expect(first.ownerDocument).toBe(second.ownerDocument);
	const nested = first.ownerDocument.createElement("template");
	first.appendChild(nested);
	expect(nested.content.ownerDocument).toBe(first.ownerDocument);
	expect(nested.content).toBe(nested.content);
});

it("exposes content only on template elements and keeps it read-only", () => {
	const { document } = fixture();
	const template = document.createElement("template");
	expect("content" in document).toBe(false);
	expect("content" in document.createElement("div")).toBe(false);
	expect("content" in template.content).toBe(false);
	expect(() => {
		template.content = document;
	}).toThrow();
});

it("keeps contents outside normal DOM child, query and text traversal", () => {
	const { document } = fixture();
	const template = document.createElement("template");
	const content = template.content;
	const paragraph = content.ownerDocument.createElement("p");
	content.appendChild(paragraph);
	paragraph.textContent = "contents";
	template.appendChild(document.createTextNode("ordinary"));
	expect(template.textContent).toBe("ordinary");
	expect(template.querySelector("p")).toBeNull();
	expect(content.querySelector("p")).toBe(content.firstChild);
	expect(template.contains(content)).toBe(false);
	expect(content.parentNode).toBeNull();
	expect(template.innerHTML).toBe("<p>contents</p>");
	expect(template.outerHTML).toBe("<template><p>contents</p></template>");
});

it("exposes empty inert owner defaults without a document skeleton", () => {
	const owner =
		fixture().document.createElement("template").content.ownerDocument;
	expect(owner.URL).toBe("about:blank");
	expect(owner.contentType).toBe("application/xml");
	expect(owner.characterSet).toBe("UTF-8");
	expect(owner.compatMode).toBe("CSS1Compat");
	expect(owner.readyState).toBe("complete");
	expect(owner.currentScript).toBeNull();
	expect(owner.ownerDocument).toBeNull();
	for (const name of [
		"head",
		"body",
		"doctype",
		"documentElement",
		"activeElement",
	] as const)
		expect(owner[name]).toBeNull();
	expect(owner.hasFocus()).toBe(false);
});

it("keeps child geometry and focus inert even when nodes enter the owner root", () => {
	const { tree, document } = fixture();
	const owner = document.createElement("template").content.ownerDocument;
	const element = owner.createElement("div");
	element.innerHTML = "<p>content</p>";
	owner.appendChild(element);
	element.focus();
	expect(treeOf(tree, element).activeElement).toBeNull();
	expect(element.getBoundingClientRect()).toMatchObject({
		width: 0,
		height: 0,
	});
	expect(element.clientWidth).toBe(0);
	element.scrollTop = 24;
	expect(element.scrollTop).toBe(0);
	expect(owner.hasFocus()).toBe(false);
});

it("does not pass page cookie, location, window or event dispatcher into contents", () => {
	const tree = new DocumentTree("https://example.com/");
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
	const events = new DocumentEvents(tree, {}, { window: true });
	const callbacks = {
		isClosed: () => false,
		startCallback: () => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(),
		}),
	};
	const dom = new ScriptDom(
		tree,
		factory,
		{ events, callbacks, window: {} },
		location,
		storage,
	);
	const document = dom.document as NodeView;
	expect(document.cookie).toBe("parent=value");
	const content = document.createElement("template").content;
	const owner = content.ownerDocument;
	owner.cookie = "ignored=value";
	expect(owner.cookie).toBe("");
	expect(owner.location).toBeNull();
	expect(owner.defaultView).toBeNull();
	content.addEventListener("click", () => {});
	owner.addEventListener("click", () => {});
	expect(events.metrics().listeners).toBe(0);
	expect([reads, writes, navigations]).toEqual([1, 0, 0]);
	dom.close();
	expect(() => content.addEventListener("click", {})).toThrow("closed");
});

it("deep clones contents into independent fragments using the same target owner", () => {
	const { document } = fixture();
	const template = document.createElement("template");
	const content = template.content;
	content.appendChild(content.ownerDocument.createTextNode("source"));
	const clone = template.cloneNode(true);
	expect(clone.content).not.toBe(content);
	expect(clone.content.ownerDocument).toBe(content.ownerDocument);
	expect(clone.content.textContent).toBe("source");
	clone.content.textContent = "copy";
	expect(content.textContent).toBe("source");
	expect(template.cloneNode().content.childNodes.length).toBe(0);
});

it("imports content into the live document rather than pretending adoption", () => {
	const { document } = fixture();
	const content = document.createElement("template").content;
	const paragraph = content.ownerDocument.createElement("p");
	content.appendChild(paragraph);
	paragraph.textContent = "copied";
	const host = document.createElement("main");
	expect(() => host.appendChild(content)).toThrow();
	const imported = document.importNode(content, true);
	expect(imported.ownerDocument).toBe(document);
	host.appendChild(imported);
	expect(host.innerHTML).toBe("<p>copied</p>");
	expect(content.childNodes.length).toBe(1);
	expect(imported.childNodes.length).toBe(0);
});

it("imports complete template graphs into the destination document's owner", () => {
	const first = fixture().document;
	const second = fixture().document;
	const source = first.createElement("template");
	source.content.appendChild(
		source.content.ownerDocument.createTextNode("value"),
	);
	const target = second.importNode(source, true);
	expect(target.ownerDocument).toBe(second);
	expect(target.content.ownerDocument).not.toBe(source.content.ownerDocument);
	expect(target.content.ownerDocument).toBe(
		second.createElement("template").content.ownerDocument,
	);
	expect(target.content.textContent).toBe("value");
});

it("rejects host cycles through script mutations without changing contents", () => {
	const { document } = fixture();
	const content = document.createElement("template").content;
	const nested = content.ownerDocument.createElement("template");
	content.appendChild(nested);
	expect(() => nested.content.appendChild(nested)).toThrow("cycles");
	expect(content.firstChild).toBe(nested);
});

it("shares one creation admission counter across main and template callers", () => {
	const { dom, document } = fixture();
	const owner = document.createElement("template").content.ownerDocument;
	for (let count = 0; count < 16; count++)
		(count % 2 ? owner : document).implementation.createHTMLDocument();
	expect(() => owner.implementation.createHTMLDocument()).toThrow(
		"creation limit",
	);
	expect(() => document.implementation.createHTMLDocument()).toThrow(
		"creation limit",
	);
	expect(dom.metrics().documents?.attempts).toBe(16);
});

it("preserves main origins after a template caller initializes the shared family", () => {
	const { tree, document } = fixture();
	const owner = document.createElement("template").content.ownerDocument;
	const opaque = owner.implementation.createHTMLDocument();
	const ordinary = document.implementation.createHTMLDocument();
	expect(htmlDocumentContext(treeOf(tree, opaque))?.family).toBe(
		htmlDocumentContext(treeOf(tree, ordinary))?.family,
	);
	expect(documentOrigin(treeOf(tree, ordinary))).toBe(documentOrigin(tree));
	expect(documentOrigin(treeOf(tree, opaque))).not.toBe(documentOrigin(tree));
	const descendant = opaque.implementation.createHTMLDocument();
	expect(documentOrigin(treeOf(tree, descendant))).toBe(
		documentOrigin(treeOf(tree, opaque)),
	);
});

it("keeps distinct contents owners' opaque origins distinct within one family", () => {
	const { tree, document } = fixture();
	const first = document.createElement("template").content.ownerDocument;
	const created = document.implementation.createHTMLDocument();
	const second = created.createElement("template").content.ownerDocument;
	expect(documentOrigin(treeOf(tree, first))).not.toBe(
		documentOrigin(treeOf(tree, second)),
	);
	const child = second.implementation.createHTMLDocument();
	expect(documentOrigin(treeOf(tree, child))).toBe(
		documentOrigin(treeOf(tree, second)),
	);
	expect(htmlDocumentContext(treeOf(tree, child))?.family).toBe(
		htmlDocumentContext(treeOf(tree, created))?.family,
	);
});

it("charges auxiliary template owners to the existing shared resource pool", () => {
	const { dom, document } = fixture({ maxNodes: 10 });
	const child = document.implementation.createHTMLDocument();
	const content = child.createElement("template").content;
	expect(dom.metrics().documents).toMatchObject({ documents: 2, nodes: 8 });
	expect(() =>
		content.ownerDocument.implementation.createHTMLDocument(),
	).toThrow("node limit");
	expect(dom.metrics().documents).toMatchObject({ documents: 2, nodes: 8 });
});

it("keeps the native aggregate contents quota when bindings are created", () => {
	const { document, tree } = fixture({ maxNodes: 5 });
	const content = document.createElement("template").content;
	content.appendChild(content.ownerDocument.createTextNode("one"));
	expect(() => content.ownerDocument.createTextNode("two")).toThrow(
		"node limit",
	);
	expect(tree.nodeCount + treeOf(tree, content).nodeCount).toBe(5);
});

it("native wrappers of an already bound owner reuse its family", () => {
	const { document, tree, dom } = fixture();
	const owner = document.createElement("template").content.ownerDocument;
	const native = treeOf(tree, owner);
	const wrapper = new ScriptDom(native, factory);
	const child = (
		wrapper.document as NodeView
	).implementation.createHTMLDocument();
	expect(dom.metrics().documents?.attempts).toBe(1);
	expect(() => new HtmlDocumentFamily(native)).toThrow("existing family");
	wrapper.close();
	expect(child.nodeType).toBe(9);
});

it("revokes contents and nested-created documents when the initiating binding closes", () => {
	const { document, dom, tree } = fixture();
	const content = document.createElement("template").content;
	const owner = content.ownerDocument;
	const element = owner.createElement("div");
	const rect = element.getBoundingClientRect();
	const child = owner.implementation.createHTMLDocument();
	dom.close();
	expect(() => content.nodeType).toThrow("closed");
	expect(() => owner.createElement("p")).toThrow("closed");
	expect(() => child.nodeType).toThrow("closed");
	expect(() => rect.width).toThrow("closed");
	expect(tree.get(tree.root).kind).toBe("document");
});

it("revokes retained content references when the native root closes", () => {
	const { document, tree } = fixture();
	const content = document.createElement("template").content;
	const owner = content.ownerDocument;
	tree.close();
	expect(() => content.nodeName).toThrow("closed");
	expect(() => owner.nodeName).toThrow("closed");
});

it("does not recreate an explicitly closed contents owner", () => {
	const { tree, document } = fixture();
	const template = document.createElement("template");
	const content = template.content;
	treeOf(tree, content).close();
	expect(() => template.content).toThrow("closed");
	expect(() => content.ownerDocument).toThrow("closed");
	expect(document.nodeType).toBe(9);
});

it("rejects unrelated native family callers before charging admission", () => {
	const first = fixture();
	const second = fixture();
	const family = new HtmlDocumentFamily(first.tree);
	expect(() => family.create(undefined, () => ({}), second.tree)).toThrow(
		"outside this family",
	);
	expect(() =>
		family.attachTemplate(second.tree, second.tree.createElement("template")),
	).toThrow("outside this family");
	expect(family.metrics().attempts).toBe(0);
	family.close();
});

it("rechecks an auxiliary native caller after publication closes it", () => {
	const { tree } = fixture();
	const family = new HtmlDocumentFamily(tree);
	let caller: DocumentTree | undefined;
	family.create(undefined, (created) => {
		caller = created;
		return {};
	});
	expect(() =>
		family.create(
			undefined,
			() => {
				caller?.close();
				return {};
			},
			caller,
		),
	).toThrow("closed");
	expect(family.metrics()).toMatchObject({ attempts: 2, documents: 0 });
	family.close();
});

it("parses template innerHTML using template modes and actual contents owners", () => {
	const { document } = fixture();
	const template = document.createElement("template");
	template.innerHTML = "<tr><td>cell</td></tr>";
	expect(template.childNodes.length).toBe(0);
	expect(template.content.childNodes.length).toBe(1);
	expect(template.content.firstChild?.nodeName).toBe("TR");
	expect(template.innerHTML).toBe("<tr><td>cell</td></tr>");
	const element = document.createElement("div");
	element.innerHTML = "<template>text</template>";
	expect(element.firstChild?.content.textContent).toBe("text");
});

function intercepted() {
	let intercept:
		| ((definition: ScriptHostObjectDefinition) => object | undefined)
		| undefined;
	const provider = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			return intercept?.(definition) ?? factory.createHostObject(definition);
		},
	};
	return {
		...fixture({}, provider),
		provider,
		setIntercept: (callback: typeof intercept) => {
			intercept = callback;
		},
	};
}

it("rejects reentrant contents creation across sibling templates", () => {
	const { document, setIntercept } = intercepted();
	const first = document.createElement("template");
	const second = document.createElement("template");
	let calls = 0;
	setIntercept(() => {
		calls++;
		expect(() => second.content).toThrow(
			"Reentrant template contents publication",
		);
		return undefined;
	});
	const content = first.content;
	setIntercept(undefined);
	expect(calls).toBe(2);
	expect(second.content.ownerDocument).toBe(content.ownerDocument);
});

it("revokes a failed owner publication and retries without replacing the native owner", () => {
	const { document, tree, setIntercept } = intercepted();
	const template = document.createElement("template");
	let failed: ScriptHostObjectDefinition | undefined;
	setIntercept((definition) => {
		failed = definition;
		throw new Error("factory failure");
	});
	expect(() => template.content).toThrow("factory failure");
	expect(() => failed?.methods?.createElement("p")).toThrow("closed");
	const usage = tree.resourceUsage();
	setIntercept(undefined);
	const content = template.content;
	expect(content.nodeType).toBe(11);
	expect(tree.resourceUsage()).toEqual(usage);
	expect(() => failed?.properties?.nodeName.get()).toThrow("closed");
});

it("revokes the already published owner document if its first fragment publication fails", () => {
	const { document, setIntercept } = intercepted();
	const template = document.createElement("template");
	let calls = 0;
	let owner: ScriptHostObjectDefinition | undefined;
	let fragment: ScriptHostObjectDefinition | undefined;
	setIntercept((definition) => {
		calls++;
		if (calls === 1) owner = definition;
		else {
			fragment = definition;
			throw new Error("fragment failure");
		}
		return undefined;
	});
	expect(() => template.content).toThrow("fragment failure");
	expect(() => owner?.methods?.createElement("p")).toThrow("closed");
	expect(() => fragment?.properties?.ownerDocument.get()).toThrow("closed");
	setIntercept(undefined);
	expect(template.content.ownerDocument.nodeType).toBe(9);
});

it("does not allow factory-captured fragment callbacks before publication commits", () => {
	const { document, setIntercept } = intercepted();
	const template = document.createElement("template");
	setIntercept((definition) => {
		expect(() => definition.properties?.nodeName.get()).toThrow(
			"not published",
		);
		return undefined;
	});
	expect(template.content.nodeName).toBe("#document-fragment");
	setIntercept(undefined);
});

it("rejects reused capability identities without corrupting the original document", () => {
	const { document, setIntercept } = intercepted();
	const template = document.createElement("template");
	setIntercept(() => document);
	expect(() => template.content).toThrow("identity was already published");
	setIntercept(undefined);
	expect(document.nodeType).toBe(9);
	expect(template.content.nodeType).toBe(11);
});

it("cleans up when the parent binding closes during owner publication", () => {
	const { document, dom, setIntercept } = intercepted();
	const template = document.createElement("template");
	const captured: ScriptHostObjectDefinition[] = [];
	setIntercept((definition) => {
		captured.push(definition);
		dom.close();
		return undefined;
	});
	expect(() => template.content).toThrow("closed");
	for (const definition of captured)
		expect(() => definition.properties?.nodeName.get()).toThrow("closed");
	expect(dom.metrics().documents).toMatchObject({ documents: 0, closed: true });
});

it("cleans up when the native parent closes during fragment publication", () => {
	const { document, tree, setIntercept } = intercepted();
	const template = document.createElement("template");
	let calls = 0;
	const captured: ScriptHostObjectDefinition[] = [];
	setIntercept((definition) => {
		captured.push(definition);
		if (++calls === 2) tree.close();
		return undefined;
	});
	expect(() => template.content).toThrow("closed");
	for (const definition of captured)
		expect(() => definition.properties?.nodeName.get()).toThrow("closed");
});

it("does not close the successful owner when a later sibling fragment publication fails", () => {
	const { document, setIntercept } = intercepted();
	const first = document.createElement("template").content;
	const second = document.createElement("template");
	setIntercept(() => {
		throw new Error("sibling failure");
	});
	expect(() => second.content).toThrow("sibling failure");
	setIntercept(undefined);
	expect(first.nodeType).toBe(11);
	expect(second.content.ownerDocument).toBe(first.ownerDocument);
});

it("rechecks a closing caller wrapper even when its native tree and family survive", () => {
	const { document, tree, dom, provider, setIntercept } = intercepted();
	const owner = document.createElement("template").content.ownerDocument;
	const wrapper = new ScriptDom(treeOf(tree, owner), provider);
	const implementation = (wrapper.document as NodeView).implementation;
	setIntercept(() => {
		wrapper.close();
		return undefined;
	});
	expect(() => implementation.createHTMLDocument()).toThrow("closed");
	setIntercept(undefined);
	expect(owner.nodeType).toBe(9);
	expect(dom.metrics().documents).toMatchObject({
		attempts: 1,
		documents: 0,
		nodes: 0,
	});
	expect(owner.implementation.createHTMLDocument().nodeType).toBe(9);
});

it("rejects unsupported object title coercion without calling guest conversion", () => {
	const { document, tree, dom } = fixture();
	const owner = document.createElement("template").content.ownerDocument;
	const native = treeOf(tree, owner);
	expect(() =>
		owner.implementation.createHTMLDocument({
			toString() {
				native.close();
				return "title";
			},
		}),
	).toThrow("Object-to-DOM-string conversion is not implemented");
	expect(dom.metrics().documents?.attempts).toBe(0);
	expect(owner.nodeType).toBe(9);
});

it("does not close siblings when an auxiliary document and its contents close", () => {
	const { tree, document } = fixture();
	const child = document.implementation.createHTMLDocument();
	const owner = child.createElement("template").content.ownerDocument;
	const descendant = owner.implementation.createHTMLDocument();
	const sibling = document.implementation.createHTMLDocument();
	treeOf(tree, child).close();
	expect(() => owner.nodeType).toThrow("closed");
	expect(descendant.nodeType).toBe(9);
	expect(sibling.nodeType).toBe(9);
});
