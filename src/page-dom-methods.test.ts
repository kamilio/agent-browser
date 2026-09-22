import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import type { PageBindingContext } from "./page-bindings.js";
import { pageDomConstructorBootstrapSource } from "./page-dom-constructor-bootstrap.js";
import {
	PageDomMethods,
	pageDomMethodsBootstrapGlobal,
} from "./page-dom-methods.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

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
function fixture(createHostObject = hostObject) {
	const tree = parseHtmlDocument(
		"<main><b>original</b></main>",
		"https://example.com/",
	);
	cleanups.push(() => tree.close());
	const release = vi.fn();
	const context: PageBindingContext = {
		createHostObject,
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: release,
	};
	const bridge = new PageDomMethods(tree, context);
	const dom = new ScriptDom(tree, bridge.factory);
	let port!: {
		publish(...args: unknown[]): void;
		invoke(...args: unknown[]): unknown;
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
		port,
		evaluate: (source: string) => runInContext(source, realm),
	};
}

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
	expect(release).toHaveBeenCalledTimes(3);
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
