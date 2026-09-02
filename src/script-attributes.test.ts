import { describe, expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface Attribute {
	name: string;
	value: string;
	nodeValue: string | null;
	textContent: string | null;
	nodeType: number;
	specified: boolean;
	ownerElement: Element | null;
	ownerDocument: object;
	parentNode: null;
	isConnected: boolean;
	cloneNode(): Attribute;
	getRootNode(): Attribute;
}
interface Attributes {
	length: number;
	[index: number]: Attribute | undefined;
	[name: string]: unknown;
	item(index: unknown): Attribute | null;
	getNamedItem(name: string): Attribute | null;
	getNamedItemNS(namespace: string | null, name: string): Attribute | null;
	setNamedItem(attribute: Attribute): Attribute | null;
	removeNamedItem(name: string): Attribute;
}
interface Element {
	attributes: Attributes;
	getAttributeNode(name: string): Attribute | null;
	setAttributeNode(attribute: Attribute): Attribute | null;
	removeAttributeNode(attribute: Attribute): Attribute;
	setAttribute(name: string, value: string): void;
	getAttribute(name: string): string | null;
	removeAttribute(name: string): void;
	cloneNode(): Element;
}
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
function fixture() {
	const tree = parseHtmlDocument(
		'<div id="target" title="before"></div><p id="other"></p>',
		"https://example.com/",
	);
	const dom = new ScriptDom(tree, factory);
	const document = dom.document as {
		getElementById(name: string): Element;
		createAttribute(name: string): Attribute;
	};
	return {
		tree,
		dom,
		document,
		element: document.getElementById("target"),
		other: document.getElementById("other"),
	};
}

describe("live script attribute nodes and maps", () => {
	it("shares node identity across names, indices and direct element lookup", () => {
		const { document, element } = fixture();
		const map = element.attributes;
		const title = element.getAttributeNode("TITLE");
		expect(title).not.toBeNull();
		expect(map).toBe(element.attributes);
		expect(map.title).toBe(title);
		expect(map[1]).toBe(title);
		expect(map.item(1)).toBe(title);
		expect(map.getNamedItem("TITLE")).toBe(title);
		expect(map.TITLE).toBeUndefined();
		expect(title?.ownerElement).toBe(element);
		expect(title?.ownerDocument).toBe(document);
		expect(title?.nodeType).toBe(2);
		expect(title?.specified).toBe(true);
		expect(title?.parentNode).toBeNull();
		expect(title?.isConnected).toBe(false);
		expect(title?.getRootNode()).toBe(title);
		expect(map.item(99)).toBeNull();
		expect(map[99]).toBeUndefined();
	});

	it("reflects value writes and creates new identity after remove/re-add without intermediate reads", () => {
		const { element } = fixture();
		const original = element.getAttributeNode("title");
		if (!original) throw new Error("Missing attribute");
		original.value = "changed";
		expect(element.getAttribute("title")).toBe("changed");
		original.nodeValue = null;
		expect(element.getAttribute("title")).toBe("");
		element.setAttribute("title", "last");
		element.removeAttribute("title");
		element.setAttribute("title", "replacement");
		expect(original.ownerElement).toBeNull();
		expect(original.value).toBe("last");
		expect(element.attributes.title).not.toBe(original);
		original.textContent = "detached";
		expect(element.getAttribute("title")).toBe("replacement");
	});

	it("attaches replacement attributes and moves removed identities between elements", () => {
		const { document, element, other } = fixture();
		const original = element.getAttributeNode("title");
		const replacement = document.createAttribute("title");
		replacement.value = "new";
		expect(element.attributes.setNamedItem(replacement)).toBe(original);
		expect(original?.ownerElement).toBeNull();
		expect(() => other.setAttributeNode(replacement)).toThrow(/in use/i);
		expect(element.attributes.removeNamedItem("title")).toBe(replacement);
		expect(other.setAttributeNode(replacement)).toBeNull();
		expect(replacement.ownerElement).toBe(other);
		expect(other.removeAttributeNode(replacement)).toBe(replacement);
		expect(() => other.removeAttributeNode(replacement)).toThrow(
			/not attached/i,
		);
	});

	it("keeps named maps live and reserves interface and prototype capability names", () => {
		const { element } = fixture();
		const map = element.attributes;
		element.setAttribute("data-extra", "new");
		expect((map["data-extra"] as Attribute).value).toBe("new");
		expect(map.length).toBe(3);
		element.setAttribute("length", "attribute-value");
		element.setAttribute("__proto__", "plain-data");
		expect(map.length).toBe(5);
		expect(map.getNamedItem("length")?.value).toBe("attribute-value");
		expect(map.getNamedItem("__proto__")?.value).toBe("plain-data");
		expect(map.__proto__).toBeUndefined();
		element.removeAttribute("data-extra");
		expect(map["data-extra"]).toBeUndefined();
	});

	it("clones attribute values independently and retains saved attributes through element cloning", () => {
		const { element } = fixture();
		const original = element.getAttributeNode("title");
		if (!original) throw new Error("Missing attribute");
		const clone = original.cloneNode();
		expect(clone).not.toBe(original);
		expect(clone.ownerElement).toBeNull();
		clone.value = "clone";
		expect(original.value).toBe("before");
		const elementClone = element.cloneNode();
		expect(elementClone.getAttributeNode("title")).not.toBe(original);
		expect(elementClone.getAttributeNode("title")?.value).toBe("before");
	});

	it("uses exact null-namespace lookup and rejects unsupported namespace mutation", () => {
		const { element } = fixture();
		expect(element.attributes.getNamedItemNS(null, "title")).toBe(
			element.getAttributeNode("title"),
		);
		expect(element.attributes.getNamedItemNS(null, "TITLE")).toBeNull();
		expect(element.attributes.getNamedItemNS("urn:test", "title")).toBeNull();
	});

	it("rejects foreign capabilities and all post-close access", () => {
		const { element, dom } = fixture();
		const foreign = fixture();
		expect(() =>
			element.setAttributeNode(foreign.document.createAttribute("title")),
		).toThrow(/attribute/i);
		const map = element.attributes;
		const attribute = element.getAttributeNode("title");
		dom.close();
		expect(() => map.length).toThrow(/closed/i);
		expect(() => attribute?.value).toThrow(/closed/i);
		foreign.dom.close();
	});
});
