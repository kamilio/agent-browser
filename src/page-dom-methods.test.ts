import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import type { PageBindingContext } from "./page-bindings.js";
import { pageDomConstructorBootstrapSource } from "./page-dom-constructor-bootstrap.js";
import {
	PageDomMethods,
	pageDomMethodsBootstrapGlobal,
} from "./page-dom-methods.js";
import { PageFocus } from "./page-focus.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
function hostObject(definition: ScriptHostObjectDefinition): object {
	const value = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(value, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(value, name, { value: method });
	if (!definition.indexed) return value;
	const indexed = definition.indexed;
	Object.defineProperty(value, "length", { get: indexed.length });
	return new Proxy(value, {
		get(target, key) {
			if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key))
				return indexed.get(Number(key));
			return Reflect.get(target, key);
		},
	});
}
function fixture(createHostObject = hostObject, enableFocus = false) {
	const tree = parseHtmlDocument(
		"<main><b>original</b></main>",
		"https://example.com/",
	);
	cleanups.push(() => tree.close());
	const release = vi.fn();
	const nested = new Set<(...args: readonly unknown[]) => unknown>();
	const context: PageBindingContext = {
		createHostObject,
		...(enableFocus
			? {
					nestedOperation<
						Operation extends (...args: readonly unknown[]) => unknown,
					>(operation: Operation): Operation {
						nested.add(operation);
						return operation;
					},
				}
			: {}),
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: release,
	};
	const bridge = new PageDomMethods(tree, context);
	const interactions = documentInteractions(tree);
	const focus = context.nestedOperation
		? new PageFocus(interactions.focus, undefined, {
				document: tree,
				register: context.nestedOperation,
				maxBindings: 32,
			})
		: undefined;
	if (focus) cleanups.push(() => focus.close());
	const dom = new ScriptDom(
		tree,
		bridge.factory,
		undefined,
		undefined,
		undefined,
		undefined,
		focus,
	);
	let port!: {
		publish(...args: unknown[]): void;
		invoke(...args: unknown[]): unknown;
		invokeFocus(...args: unknown[]): Promise<void>;
	};
	const realm = createContext({
		document: dom.document,
		[pageDomMethodsBootstrapGlobal]: () => {
			const value = bridge.bootstrap();
			port = value as typeof port;
			return value;
		},
		__agentBrowserDomHasInstance: (value: unknown, name: unknown) =>
			dom.hasInstance(value, name),
		__agentBrowserParseHtmlDocument: (source: unknown, type: unknown) =>
			dom.parseFromString(source, type),
	});
	runInContext(pageDomConstructorBootstrapSource, realm);
	return {
		tree,
		dom,
		bridge,
		release,
		nested,
		interactions,
		port,
		evaluate: (source: string) => runInContext(source, realm),
	};
}

it("forwards captured HTMLElement focus and blur to the borrowed receiver", async () => {
	const { evaluate, tree, release, nested, port } = fixture(hostObject, true);
	expect(nested.has(port.invokeFocus)).toBe(true);
	expect(
		evaluate(
			'var a=document.createElement("input");var b=document.createElement("input");document.body.appendChild(a);document.body.appendChild(b);typeof HTMLElement.prototype.focus',
		),
	).toBe("function");
	await evaluate(
		"var captured=HTMLElement.prototype.focus;captured.call(a,Object.assign(Object.create(null),{preventScroll:true,focusVisible:true}))",
	);
	expect(evaluate("document.activeElement===a")).toBe(true);
	expect(tree.focusIndicated).toBe(true);
	await evaluate(
		"captured.call(b,Object.assign(Object.create(null),{preventScroll:true}))",
	);
	expect(evaluate("document.activeElement===b")).toBe(true);
	await evaluate("HTMLElement.prototype.blur.call(b)");
	expect(evaluate("document.activeElement===document.body")).toBe(true);
	tree.close();
	expect(release).toHaveBeenCalledTimes(11);
});

it("rejects forged, foreign and non-HTML captured focus receivers and revokes saved methods", async () => {
	const a = fixture(hostObject, true);
	const b = fixture(hostObject, true);
	const focus = a.evaluate("HTMLElement.prototype.focus") as (
		...args: unknown[]
	) => Promise<void>;
	for (const receiver of [
		{},
		null,
		a.dom.document,
		b.evaluate("document.body"),
		a.evaluate("Object.create(HTMLElement.prototype)"),
		a.evaluate('document.createElementNS("http://www.w3.org/2000/svg","svg")'),
	])
		await expect(focus.call(receiver)).rejects.toThrow(/receiver/);
	const receiver = a.evaluate('document.createElement("input")');
	a.tree.close();
	await expect(focus.call(receiver)).rejects.toThrow("closed");
});

it("retains focus publication readiness and rejects use through the synchronous dispatcher", async () => {
	let attempt: Promise<void> | undefined;
	const publication: { port?: ReturnType<typeof fixture>["port"] } = {};
	const test = fixture((definition) => {
		if (publication.port && definition.methods?.focus) {
			const receiver = hostObject(definition);
			attempt = publication.port.invokeFocus(receiver, "HTMLElement.focus");
			void attempt.catch(() => undefined);
			return receiver;
		}
		return hostObject(definition);
	}, true);
	publication.port = test.port;
	const input = test.evaluate('document.createElement("input")');
	await expect(attempt).rejects.toThrow("registered HTMLElement receiver");
	expect(() => test.port.invoke(input, "HTMLElement.focus")).toThrow(
		"registered receiver",
	);
});

it("waits for controlled focus listeners and rejects a suspended captured call after close", async () => {
	const test = fixture(hostObject, true);
	test.evaluate(
		'var one=document.createElement("input");one.id="one";document.body.appendChild(one)',
	);
	const id = new DocumentQueries(test.tree).querySelector("#one");
	if (id === null) throw new Error("Missing focus target");
	let enter!: () => void;
	let resume!: () => void;
	const entered = new Promise<void>((resolve) => {
		enter = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		resume = resolve;
	});
	test.interactions.events.addEventListener(
		id,
		"focus",
		controlledEventListener(async () => {
			enter();
			await gate;
		}),
	);
	let settled = false;
	const pending = test.evaluate(
		"HTMLElement.prototype.focus.call(one)",
	) as Promise<void>;
	void pending.then(
		() => {
			settled = true;
		},
		() => {
			settled = true;
		},
	);
	await entered;
	expect(settled).toBe(false);
	test.tree.close();
	resume();
	await expect(pending).rejects.toThrow(/closed|abort/i);
	expect(test.release).toHaveBeenCalledTimes(11);
});

it("rejects focus registration that replaces the operation identity", async () => {
	const tree = parseHtmlDocument("<input>", "https://example.test/");
	cleanups.push(() => tree.close());
	let captured: ((...args: readonly unknown[]) => unknown) | undefined;
	expect(
		() =>
			new PageDomMethods(tree, {
				createHostObject: hostObject,
				retainGuestArguments: (operation) => operation,
				releaseGuestReference() {},
				nestedOperation(operation) {
					captured = operation;
					return ((...args: readonly unknown[]) =>
						operation(...args)) as typeof operation;
				},
			}),
	).toThrow("identity");
	if (!captured) throw new Error("Missing captured focus operation");
	await expect(captured({}, "HTMLElement.focus")).rejects.toThrow("closed");
});

it("uses the borrowed receiver for parsed-document tag queries", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			'var other=new DOMParser().parseFromString("<b>hello</b>","text/html");document.getElementsByTagName.call(other,"body")[0].innerHTML',
		),
	).toBe("<b>hello</b>");
	expect(evaluate('document.getElementsByTagName("body")[0].innerHTML')).toBe(
		"<main><b>original</b></main>",
	);
	expect(
		evaluate(
			'Document.prototype.getElementsByTagName.call(other,"b")[0].textContent',
		),
	).toBe("hello");
	expect(
		evaluate(
			'Element.prototype.getElementsByTagName.call(other.body,"b")[0].textContent',
		),
	).toBe("hello");
});

it("creates the borrowed iterator in the receiver's document", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			'var other=new DOMParser().parseFromString("<b>hello</b>","text/html");var iterator=document.createNodeIterator.call(other,other.body,NodeFilter.SHOW_ELEMENT,null);[iterator.nextNode().nodeName,iterator.nextNode().nodeName,iterator.nextNode()].join(":")',
		),
	).toBe("BODY:B:");
	expect(evaluate("iterator instanceof NodeIterator")).toBe(true);
	expect(() =>
		evaluate("document.createNodeIterator.call(other,document.body,1,null)"),
	).toThrow("Expected a node from this script document");
});

it("creates captured fragments in parsed, auxiliary and template documents", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			'var parsed=new DOMParser().parseFromString("<b>hello</b>","text/html");var auxiliary=document.implementation.createHTMLDocument();var template=document.createElement("template").content.ownerDocument;var create=document.createDocumentFragment;[parsed,auxiliary,template].every(owner=>{var fragment=create.call(owner);return fragment.ownerDocument===owner && fragment instanceof DocumentFragment && fragment.childNodes.length===0;})',
		),
	).toBe(true);
	expect(
		evaluate(
			"create===Document.prototype.createDocumentFragment && create===parsed.createDocumentFragment",
		),
	).toBe(true);
});

it("imports captured nodes into the explicit receiver without changing the source", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			'var parsed=new DOMParser().parseFromString("<b>hello<i>world</i></b>","text/html");var auxiliary=document.implementation.createHTMLDocument();var source=parsed.body.firstChild;var copy=document.importNode.call(auxiliary,source,true);copy.outerHTML',
		),
	).toBe("<b>hello<i>world</i></b>");
	expect(
		evaluate(
			"copy.ownerDocument===auxiliary && copy.parentNode===null && source.ownerDocument===parsed && source.parentNode===parsed.body && document.importNode===Document.prototype.importNode",
		),
	).toBe(true);
	expect(
		evaluate("Document.prototype.importNode.call(parsed,copy,false).outerHTML"),
	).toBe("<b></b>");
	expect(
		evaluate(
			'var attr=document.createAttribute("title");attr.value="hello";var imported=document.importNode.call(auxiliary,attr);imported.ownerDocument===auxiliary && imported.value==="hello" && imported!==attr',
		),
	).toBe(true);
});

it("guards captured document creation and import receivers and revokes them on close", () => {
	const a = fixture();
	const b = fixture();
	for (const name of ["createDocumentFragment", "importNode"]) {
		const method = a.evaluate(`document.${name}`) as (
			...args: unknown[]
		) => unknown;
		const source = a.evaluate("document.body");
		for (const receiver of [
			{},
			null,
			a.evaluate("document.body"),
			b.dom.document,
		])
			expect(() => method.call(receiver, source)).toThrow(
				"registered receiver",
			);
		expect(() =>
			a.evaluate(
				`Document.prototype.${name}.call(Object.create(Document.prototype),document.body)`,
			),
		).toThrow("registered receiver");
	}
	const create = a.evaluate("document.createDocumentFragment") as () => unknown;
	const importNode = a.evaluate("document.importNode") as (
		node: unknown,
	) => unknown;
	const source = a.evaluate("document.body");
	a.tree.close();
	expect(() => create.call(a.dom.document)).toThrow("closed");
	expect(() => importNode.call(a.dom.document, source)).toThrow("closed");
});

it("shares method identity with interface prototypes and auxiliary documents", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			"var other=document.implementation.createHTMLDocument();document.getElementsByTagName===other.getElementsByTagName && document.getElementsByTagName===Document.prototype.getElementsByTagName && document.body.getElementsByTagName===Element.prototype.getElementsByTagName",
		),
	).toBe(true);
	expect(
		evaluate(
			"document.createNodeIterator===Document.prototype.createNodeIterator",
		),
	).toBe(true);
});

it("rejects unregistered, absent and wrong-interface receivers", () => {
	const { evaluate } = fixture();
	for (const receiver of [
		"{}",
		"null",
		"undefined",
		"document.body",
		"Object.create(Document.prototype)",
	])
		expect(() =>
			evaluate(
				`Document.prototype.createNodeIterator.call(${receiver},document.body,1,null)`,
			),
		).toThrow("registered receiver");
	expect(() =>
		evaluate('var method=document.getElementsByTagName;method("body")'),
	).toThrow("registered receiver");
});

it("rejects a receiver from another binding owner", () => {
	const a = fixture();
	const b = fixture();
	const method = a.evaluate("document.getElementsByTagName") as (
		tag: string,
	) => unknown;
	expect(() => method.call(b.dom.document, "body")).toThrow(
		"registered receiver",
	);
});

it("revokes saved methods and releases each retained function once", () => {
	const { tree, release, bridge, evaluate } = fixture();
	const method = evaluate("document.getElementsByTagName") as () => unknown;
	const receiver = evaluate("document");
	tree.close();
	bridge.close();
	expect(() => method.call(receiver)).toThrow("closed");
	expect(release).toHaveBeenCalledTimes(9);
});

it("retains publication readiness through reentrant host-object creation", () => {
	let attempted = false;
	fixture((definition) => {
		if (definition.properties?.nodeType && !attempted) {
			attempted = true;
			expect(() => definition.properties?.getElementsByTagName?.get()).toThrow(
				"not published",
			);
		}
		return hostObject(definition);
	});
	expect(attempted).toBe(true);
});

it("rejects recycled node identities without replacing the original receiver", () => {
	let first: object | undefined;
	const { evaluate } = fixture((definition) => {
		if (definition.properties?.nodeType) {
			if (first) return first;
			first = hostObject(definition);
			return first;
		}
		return hostObject(definition);
	});
	expect(() => evaluate('document.getElementsByTagName("body")[0]')).toThrow(
		"receiver publication",
	);
});

it("keeps receiver forwarding after guest prototype methods are replaced", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			'var other=new DOMParser().parseFromString("<b>hello</b>","text/html");Document.prototype.getElementsByTagName=function(){throw new Error("replacement");};document.getElementsByTagName.call(other,"b")[0].textContent',
		),
	).toBe("hello");
});

it("guards one-time bootstrap and finite method publication", () => {
	const { bridge, release } = fixture();
	expect(() => bridge.bootstrap()).toThrow("once");
	expect(release).not.toHaveBeenCalled();
});

it("rejects extra retained publication arguments and releases them", () => {
	const { port, release } = fixture();
	const one = () => {};
	const two = () => {};
	expect(() => port.publish("Document.getElementsByTagName", one, two)).toThrow(
		"publication",
	);
	expect(release.mock.calls.map((call) => call[0])).toEqual([one, two]);
});

it("rejects unknown operations and re-publication without releasing owned methods", () => {
	const { port, release, dom, evaluate } = fixture();
	expect(() => port.invoke(dom.document, "constructor")).toThrow(
		"registered receiver",
	);
	const method = evaluate("document.getElementsByTagName");
	expect(() => port.publish("Document.createNodeIterator", method)).toThrow(
		"publication",
	);
	expect(release).not.toHaveBeenCalled();
});

it("rejects document tag methods on elements and element tag methods on documents", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			"Document.prototype.getElementsByTagName !== Element.prototype.getElementsByTagName",
		),
	).toBe(true);
	expect(() =>
		evaluate('Document.prototype.getElementsByTagName.call(document.body,"b")'),
	).toThrow("registered receiver");
	expect(() =>
		evaluate('Element.prototype.getElementsByTagName.call(document,"b")'),
	).toThrow("registered receiver");
});

it("clones a borrowed node into its own parsed document", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			'var other=new DOMParser().parseFromString("<b>hello<i>world</i></b>","text/html");var b=other.body.firstChild;var clone=document.body.cloneNode.call(b,true);clone.outerHTML',
		),
	).toBe("<b>hello<i>world</i></b>");
	expect(
		evaluate("clone.ownerDocument===other && clone.parentNode===null"),
	).toBe(true);
	expect(evaluate("Node.prototype.cloneNode===b.cloneNode")).toBe(true);
	expect(evaluate("Node.prototype.cloneNode.call(b,false).outerHTML")).toBe(
		"<b></b>",
	);
});

it("exposes captured prototype getters with live receiver relations", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			'var other=new DOMParser().parseFromString("<b>hello</b><i>world</i>","text/html");var b=other.body.firstChild;var getParent=Object.getOwnPropertyDescriptor(Node.prototype,"parentNode").get;getParent.call(b)===other.body',
		),
	).toBe(true);
	expect(
		evaluate(
			'var getNext=Object.getOwnPropertyDescriptor(Node.prototype,"nextSibling").get;getNext.call(b).nodeName',
		),
	).toBe("I");
	expect(
		evaluate(
			'var getChildren=Object.getOwnPropertyDescriptor(Node.prototype,"childNodes").get;getChildren.call(b)[0].nodeValue',
		),
	).toBe("hello");
	expect(
		evaluate("b.remove();getParent.call(b)===null && getNext.call(b)===null"),
	).toBe(true);
});

it("supports prototype traversal of text, comments, fragments and attribute nodes", () => {
	const { evaluate } = fixture();
	expect(
		evaluate(
			'var fragment=document.createDocumentFragment();var text=document.createTextNode("hello");var comment=document.createComment("world");fragment.appendChild(text);fragment.appendChild(comment);var parent=Object.getOwnPropertyDescriptor(Node.prototype,"parentNode").get;parent.call(text)===fragment && parent.call(comment)===fragment',
		),
	).toBe(true);
	expect(
		evaluate("Node.prototype.cloneNode.call(fragment,true).textContent"),
	).toBe("hello");
	expect(
		evaluate(
			'var attr=document.createAttribute("title");attr.value="hello";parent.call(attr)===null && Node.prototype.cloneNode.call(attr).value==="hello"',
		),
	).toBe(true);
});

it("rejects forged and foreign owners for prototype node operations", () => {
	const a = fixture();
	const b = fixture();
	const getter = a.evaluate(
		'Object.getOwnPropertyDescriptor(Node.prototype,"childNodes").get',
	) as () => unknown;
	expect(() => getter.call({})).toThrow("registered receiver");
	expect(() => getter.call(b.dom.document)).toThrow("registered receiver");
	expect(() =>
		a.evaluate(
			"Node.prototype.cloneNode.call(Object.create(Node.prototype),true)",
		),
	).toThrow("registered receiver");
});

it("revokes captured prototype getters after close", () => {
	const { tree, evaluate } = fixture();
	const getParent = evaluate(
		'Object.getOwnPropertyDescriptor(Node.prototype,"parentNode").get',
	) as () => unknown;
	const root = evaluate("document.body.firstChild");
	tree.close();
	expect(() => getParent.call(root)).toThrow("closed");
});
