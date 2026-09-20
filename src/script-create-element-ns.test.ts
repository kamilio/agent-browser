import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface Node {
	namespaceURI: string;
	localName: string;
	tagName: string;
	prefix: null;
	parentNode: Node | null;
	ownerDocument: Node;
	createElementNS(...args: unknown[]): Node;
	createElement(name: string): Node;
	appendChild(node: Node): Node;
	cloneNode(deep?: boolean): Node;
	getElementsByTagNameNS(
		namespace: string,
		name: string,
	): { length: number; [index: number]: Node };
}
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function fixture(tree = new DocumentTree("https://example.com/")) {
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			if (definition.indexed) {
				Object.defineProperty(object, "length", {
					get: definition.indexed.length,
				});
				for (let index = 0; index < definition.indexed.length(); index++)
					Object.defineProperty(object, index, {
						get: () => definition.indexed!.get(index),
					});
			}
			return object;
		},
	});
	cleanup.push(() => {
		dom.close();
		tree.close();
	});
	return { tree, dom, document: dom.document as Node };
}

it("creates authentic detached SVG and MathML nodes with case-sensitive names", () => {
	const { document, dom } = fixture();
	for (const [namespace, name] of [
		[svgNamespace, "linearGradient"],
		[mathmlNamespace, "mi"],
	]) {
		const node = document.createElementNS(namespace, name);
		expect([
			node.namespaceURI,
			node.localName,
			node.tagName,
			node.prefix,
		]).toEqual([namespace, name, name, null]);
		expect(node.parentNode).toBeNull();
		expect(node.ownerDocument).toBe(document);
		expect(dom.hasInstance(node, "SVGElement")).toBe(
			namespace === svgNamespace,
		);
		expect(dom.hasInstance(node, "HTMLElement")).toBe(false);
		expect(dom.hasInstance(node, "Element")).toBe(true);
	}
});

it("preserves names in createElementNS while ordinary HTML creation lowercases them", () => {
	const { document } = fixture();
	const node = document.createElementNS(htmlNamespace, "MiXeD");
	const ordinary = document.createElement("MiXeD");
	const clone = node.cloneNode();
	for (const element of [node, clone]) {
		expect(element.localName).toBe("MiXeD");
		expect(element.tagName).toBe("MIXED");
		expect(element.namespaceURI).toBe(htmlNamespace);
	}
	// Existing createElement behavior remains distinct from namespaced creation.
	// Both methods produce native capabilities with the same document ownership.
	const html = document.createElement("html");
	document.appendChild(html);
	html.appendChild(node);
	html.appendChild(ordinary);
	expect(ordinary.localName).toBe("mixed");
	expect(document.getElementsByTagNameNS(htmlNamespace, "MiXeD").length).toBe(
		1,
	);
});

it("preserves namespace and identity through insertion, queries and deep cloning", () => {
	const { document } = fixture();
	const html = document.createElement("html");
	document.appendChild(html);
	const svg = document.createElementNS(svgNamespace, "svg");
	const gradient = document.createElementNS(svgNamespace, "linearGradient");
	svg.appendChild(gradient);
	html.appendChild(svg);
	const clone = svg.cloneNode(true);
	html.appendChild(clone);
	const collection = document.getElementsByTagNameNS(
		svgNamespace,
		"linearGradient",
	);
	expect(collection.length).toBe(2);
	expect(collection[0]).toBe(gradient);
	expect(collection[1]).not.toBe(gradient);
	expect(collection[1].namespaceURI).toBe(svgNamespace);
	expect(collection[1].ownerDocument).toBe(document);
});

it("rejects unsupported namespaces, prefixes and malformed names without allocating", () => {
	const { document, tree } = fixture();
	const before = tree.resourceUsage();
	for (const args of [
		[],
		[svgNamespace],
		[null, "node"],
		["", "node"],
		["urn:custom", "node"],
		[svgNamespace, "svg:rect"],
		[svgNamespace, "bad name"],
		[svgNamespace, "1rect"],
	])
		expect(() => document.createElementNS(...args)).toThrow();
	expect(tree.resourceUsage()).toEqual(before);
});

it("keeps dynamic namespaced creation inside the native node quota", () => {
	const { document } = fixture(
		new DocumentTree("https://example.com/", { maxNodes: 2 }),
	);
	document.createElementNS(svgNamespace, "svg");
	expect(() => document.createElementNS(svgNamespace, "rect")).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("revokes saved createElementNS after its ScriptDom closes", () => {
	const { document, dom } = fixture();
	const create = document.createElementNS;
	dom.close();
	expect(() => create(svgNamespace, "svg")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});
