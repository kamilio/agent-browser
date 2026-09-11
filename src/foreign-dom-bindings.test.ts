import { afterEach, describe, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { ScriptCollections } from "./script-collections.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface Collection {
	readonly length: number;
	readonly [index: number]: Element | undefined;
	item(index: number): Element | null;
	namedItem(name: string): Element | null;
}

interface Attribute {
	readonly name: string;
	readonly nodeName: string;
	readonly localName: string;
	readonly namespaceURI: string | null;
	readonly prefix: string | null;
	readonly ownerElement: Element | null;
	value: string;
	cloneNode(): Attribute;
}

interface Attributes {
	readonly length: number;
	readonly [index: number]: Attribute | undefined;
	getNamedItem(name: string): Attribute | null;
	getNamedItemNS(namespace: string | null, name: string): Attribute | null;
	setNamedItemNS(attribute: Attribute): Attribute | null;
	removeNamedItemNS(namespace: string | null, name: string): Attribute;
}

interface Element {
	readonly namespaceURI: string;
	readonly localName: string;
	readonly tagName: string;
	readonly nodeName: string;
	readonly prefix: null;
	readonly attributes: Attributes;
	readonly children: Collection;
	readonly elements: Collection;
	readonly options: Collection;
	id: string;
	textContent: string;
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
	getAttributeNames(): string[];
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	toggleAttribute(name: string, force?: boolean): boolean;
	getAttributeNode(name: string): Attribute | null;
	setAttributeNode(attribute: Attribute): Attribute | null;
	cloneNode(deep?: boolean): Element;
	getElementsByTagName(name: string): Collection;
	getElementsByTagNameNS(namespace: string | null, name: string): Collection;
}

interface Document {
	readonly forms: Collection;
	readonly images: Collection;
	readonly scripts: Collection;
	readonly embeds: Collection;
	readonly plugins: Collection;
	readonly links: Collection;
	readonly anchors: Collection;
	createElement(name: string): Element;
	getElementsByTagName(name: string): Collection;
	getElementsByTagNameNS(namespace: string | null, name: string): Collection;
	getElementsByName(name: string): Collection;
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

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture() {
	const tree = new DocumentTree("https://foreign.fixture.invalid/");
	const root = tree.createElement("main");
	tree.append(tree.root, root);
	const dom = new ScriptDom(tree, factory);
	cleanup.push(
		() => tree.close(),
		() => dom.close(),
	);
	const add = (
		name: string,
		namespace = htmlNamespace,
		attributes: Record<string, string> = {},
		parent = root,
	) => {
		const id = tree.createParserElement(name, attributes, namespace);
		tree.append(parent, id);
		return { id, element: dom.node(id) as Element };
	};
	return { tree, root, dom, document: dom.document as Document, add };
}

describe("foreign namespace script bindings", () => {
	it("reflects actual namespaces and preserves foreign case through cloning", () => {
		const { add, document } = fixture();
		for (const [name, namespace] of [
			["linearGradient", svgNamespace],
			["annotation-xml", mathmlNamespace],
			["mixedCase", mathmlNamespace],
		] as const) {
			const { element } = add(name, namespace);
			for (const reflected of [element, element.cloneNode(true)]) {
				expect(reflected.namespaceURI).toBe(namespace);
				expect(reflected.localName).toBe(name);
				expect(reflected.tagName).toBe(name);
				expect(reflected.nodeName).toBe(name);
				expect(reflected.prefix).toBeNull();
			}
		}
		for (const name of ["svg", "math", "INPUT"]) {
			const element = document.createElement(name);
			expect(element.namespaceURI).toBe(htmlNamespace);
			expect(element.localName).toBe(name.toLowerCase());
			expect(element.tagName).toBe(name.toUpperCase());
		}
		expect("createElementNS" in document).toBe(false);
		expect("setAttributeNS" in add("svg", svgNamespace).element).toBe(false);
	});

	it("keeps namespace and tag collections live, case-correct and identity-stable", () => {
		const { add, document, tree, root } = fixture();
		const html = add("linearGradient").element;
		const foreign = add("linearGradient", svgNamespace);
		const math = add("linearGradient", mathmlNamespace).element;
		const exact = document.getElementsByTagName("linearGradient");
		const folded = document.getElementsByTagName("lineargradient");
		expect(exact).toBe(document.getElementsByTagName("linearGradient"));
		expect(exact).not.toBe(folded);
		expect([exact.length, exact[0], exact[1], exact[2]]).toEqual([
			3,
			html,
			foreign.element,
			math,
		]);
		expect([folded.length, folded[0]]).toEqual([1, html]);
		expect(document.getElementsByTagName("LINEARGRADIENT").length).toBe(1);
		const svg = document.getElementsByTagNameNS(svgNamespace, "linearGradient");
		expect(svg).toBe(
			document.getElementsByTagNameNS(svgNamespace, "linearGradient"),
		);
		expect([svg.length, svg[0]]).toEqual([1, foreign.element]);
		expect(document.getElementsByTagNameNS("*", "linearGradient").length).toBe(
			2,
		);
		expect(
			document.getElementsByTagNameNS(htmlNamespace, "linearGradient").length,
		).toBe(0);
		expect(
			document.getElementsByTagNameNS(svgNamespace, "lineargradient").length,
		).toBe(0);
		expect(document.getElementsByTagNameNS(null, "*").length).toBe(0);
		expect(document.getElementsByTagNameNS("", "*")).toBe(
			document.getElementsByTagNameNS(null, "*"),
		);
		expect(
			foreign.element.getElementsByTagNameNS(svgNamespace, "*").length,
		).toBe(0);
		tree.remove(foreign.id);
		expect(svg.length).toBe(0);
		tree.append(root, foreign.id);
		expect(svg[0]).toBe(foreign.element);
	});

	it("preserves attribute case, namespace metadata, clone and reattachment identity", () => {
		const { add } = fixture();
		const { element } = add("svg", svgNamespace, {
			viewBox: "0 0 10 10",
			"xlink:href": "#before",
			"xml:lang": "en",
			xmlns: svgNamespace,
			"xmlns:xlink": "http://www.w3.org/1999/xlink",
		});
		expect(element.getAttribute("viewBox")).toBe("0 0 10 10");
		expect(element.getAttribute("viewbox")).toBeNull();
		expect(element.hasAttribute("VIEWBOX")).toBe(false);
		element.setAttribute("viewbox", "independent");
		element.removeAttribute("VIEWBOX");
		expect(element.getAttribute("viewBox")).toBe("0 0 10 10");
		expect(element.toggleAttribute("viewbox")).toBe(false);
		expect(element.getAttributeNames()).toContain("viewBox");
		expect(element.attributes).toBe(element.attributes);
		expect(element.attributes.getNamedItem("VIEWBOX")).toBeNull();
		expect(element.attributes.getNamedItemNS(null, "viewBox")).toBe(
			element.attributes[0],
		);
		for (const [name, namespace, prefix, localName] of [
			["xlink:href", "http://www.w3.org/1999/xlink", "xlink", "href"],
			["xml:lang", "http://www.w3.org/XML/1998/namespace", "xml", "lang"],
			["xmlns", "http://www.w3.org/2000/xmlns/", null, "xmlns"],
			["xmlns:xlink", "http://www.w3.org/2000/xmlns/", "xmlns", "xlink"],
		] as const) {
			const attribute = element.getAttributeNode(name);
			if (!attribute) throw new Error("Missing foreign attribute");
			expect(element.attributes.getNamedItemNS(namespace, localName)).toBe(
				attribute,
			);
			expect(element.attributes.getNamedItemNS(null, name)).toBeNull();
			expect(
				element.attributes.getNamedItemNS(namespace, localName.toUpperCase()),
			).toBeNull();
			const cloned = attribute.cloneNode();
			for (const reflected of [attribute, cloned]) {
				expect(reflected.name).toBe(name);
				expect(reflected.nodeName).toBe(name);
				expect(reflected.localName).toBe(localName);
				expect(reflected.namespaceURI).toBe(namespace);
				expect(reflected.prefix).toBe(prefix);
			}
			expect(cloned.ownerElement).toBeNull();
			expect(element.attributes.removeNamedItemNS(namespace, localName)).toBe(
				attribute,
			);
			expect(attribute.ownerElement).toBeNull();
			const other = add("g", svgNamespace).element;
			expect(other.attributes.setNamedItemNS(attribute)).toBeNull();
			expect(attribute.ownerElement).toBe(other);
			attribute.value = "changed";
			expect(other.getAttribute(name)).toBe("changed");
			expect(element.setAttributeNode(cloned)).toBeNull();
			expect(element.attributes.getNamedItemNS(namespace, localName)).toBe(
				cloned,
			);
			expect(cloned.value).not.toBe(attribute.value);
		}
		const clone = element.cloneNode(true);
		expect(clone.getAttributeNode("viewBox")?.localName).toBe("viewBox");
		expect(clone.getAttributeNode("xlink:href")?.namespaceURI).toBe(
			"http://www.w3.org/1999/xlink",
		);
	});

	it.each([svgNamespace, mathmlNamespace])(
		"does not publish HTML capabilities on colliding names in %s",
		(namespace) => {
			const { add } = fixture();
			for (const [name, capabilities] of [
				[
					"input",
					[
						"value",
						"checked",
						"type",
						"form",
						"validity",
						"stepUp",
						"setCustomValidity",
					],
				],
				["textarea", ["value", "defaultValue", "form", "required"]],
				["form", ["elements", "length", "action", "method"]],
				["select", ["options", "selectedOptions", "value", "add"]],
				["option", ["selected", "defaultSelected", "value", "index", "form"]],
				["optgroup", ["disabled", "label"]],
				["button", ["type", "value", "form"]],
				["details", ["open", "name"]],
				["template", ["content"]],
				["img", ["complete", "currentSrc", "naturalWidth", "decode", "src"]],
				["title", ["text"]],
				["a", ["href", "origin", "protocol"]],
				["script", ["src"]],
			] as const) {
				const { element } = add(name, namespace);
				for (const capability of capabilities)
					expect(
						Object.hasOwn(element, capability),
						`${name}.${capability}`,
					).toBe(false);
				element.id = `foreign-${name}`;
				element.setAttribute("data-test", "available");
				element.textContent = "generic DOM";
				expect(element.getAttribute("id")).toBe(`foreign-${name}`);
				expect(element.getAttribute("data-test")).toBe("available");
				expect(element.textContent).toBe("generic DOM");
				expect(element.children.length).toBe(0);
			}
			const htmlInput = add("input").element;
			expect(Object.hasOwn(htmlInput, "checked")).toBe(true);
			expect(Object.hasOwn(htmlInput, "stepUp")).toBe(true);
		},
	);

	it("restricts document collections and named lookup to HTML names, not foreign collisions", () => {
		const { add, document } = fixture();
		for (const [tag, collection] of [
			["form", "forms"],
			["img", "images"],
			["script", "scripts"],
			["embed", "embeds"],
			["embed", "plugins"],
			["a", "links"],
			["a", "anchors"],
		] as const) {
			const previous = document[collection].length;
			const attributes = { name: `named-${collection}`, href: "#target" };
			add(tag, svgNamespace, attributes);
			add(tag, mathmlNamespace, attributes);
			expect(document[collection].length).toBe(previous);
			const html = add(tag, htmlNamespace, attributes).element;
			expect(document[collection].length).toBe(previous + 1);
			expect(document[collection].namedItem(attributes.name)).toBe(html);
			expect(document.getElementsByName(attributes.name).length).toBe(1);
		}
		expect(document.plugins).toBe(document.embeds);
		const foreign = add("g", svgNamespace, {
			id: "foreign-id",
			name: "foreign-name",
		}).element;
		const all = document.getElementsByTagName("*");
		expect(all.namedItem("foreign-id")).toBe(foreign);
		expect(all.namedItem("foreign-name")).toBeNull();
	});

	it("excludes foreign controls and options from HTML owner collections", () => {
		const { add } = fixture();
		const form = add("form");
		const input = add(
			"input",
			htmlNamespace,
			{ name: "field" },
			form.id,
		).element;
		add("input", svgNamespace, { name: "field" }, form.id);
		add("input", mathmlNamespace, { name: "field" }, form.id);
		expect(form.element.elements.length).toBe(1);
		expect(form.element.elements.namedItem("field")).toBe(input);
		const select = add("select");
		const option = add("option", htmlNamespace, {}, select.id).element;
		add("option", svgNamespace, {}, select.id);
		add("option", mathmlNamespace, {}, select.id);
		expect(select.element.options.length).toBe(1);
		expect(select.element.options[0]).toBe(option);
	});

	it("retains collection limits and invalidates saved foreign bindings on close", () => {
		const { add, tree, root, dom, document } = fixture();
		const foreign = add("svg", svgNamespace, { viewBox: "0 0 1 1" }).element;
		const attribute = foreign.getAttributeNode("viewBox");
		const attributes = foreign.attributes;
		const collection = document.getElementsByTagNameNS(svgNamespace, "*");
		const store = new ScriptCollections(tree, factory, (id) => dom.node(id), {
			maxCollections: 1,
		});
		cleanup.push(() => store.close());
		expect(
			(store.getByNamespace(root, svgNamespace, "*") as Collection).length,
		).toBe(1);
		expect(() => store.getByNamespace(root, mathmlNamespace, "*")).toThrow(
			/limit/i,
		);
		store.close();
		expect(store.stats.cachedEntries).toBe(0);
		dom.close();
		expect(() => foreign.namespaceURI).toThrow(/closed/i);
		expect(() => attribute?.localName).toThrow(/closed/i);
		expect(() => attributes.length).toThrow(/closed/i);
		expect(() => collection.length).toThrow(/closed/i);
	});
});
