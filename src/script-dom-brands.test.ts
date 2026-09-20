import { afterEach, expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

function factory() {
	return {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	};
}
function fixture(owner = factory()) {
	const tree = parseHtmlDocument(
		'<!doctype html><div id="html"></div><svg id="svg"><foreignObject><div id="nested"></div></foreignObject></svg><math id="math"></math>',
		"https://example.com/",
	);
	const dom = new ScriptDom(tree, owner);
	cleanup.push(() => {
		dom.close();
		tree.close();
	});
	const document = dom.document as {
		querySelector(selector: string): object;
		createTextNode(text: string): object;
		createComment(text: string): object;
		createDocumentFragment(): object;
		doctype: object;
	};
	return { tree, dom, document, owner };
}

it("brands HTML, SVG and MathML elements by their native namespace", () => {
	const { dom, document } = fixture();
	for (const [selector, html, svg] of [
		["#html", true, false],
		["#svg", false, true],
		["#nested", true, false],
		["#math", false, false],
	] as const) {
		const node = document.querySelector(selector);
		expect(dom.hasInstance(node, "Node")).toBe(true);
		expect(dom.hasInstance(node, "Element")).toBe(true);
		expect(dom.hasInstance(node, "HTMLElement")).toBe(html);
		expect(dom.hasInstance(node, "SVGElement")).toBe(svg);
	}
});

it("brands documents and detached character data and fragments", () => {
	const { dom, document } = fixture();
	for (const [node, name, characterData] of [
		[document, "Document", false],
		[document.doctype, "DocumentType", false],
		[document.createTextNode("text"), "Text", true],
		[document.createComment("comment"), "Comment", true],
		[document.createDocumentFragment(), "DocumentFragment", false],
	] as const) {
		expect(dom.hasInstance(node, "Node")).toBe(true);
		expect(dom.hasInstance(node, name)).toBe(true);
		expect(dom.hasInstance(node, "CharacterData")).toBe(characterData);
		expect(dom.hasInstance(node, "Element")).toBe(false);
	}
});

it("shares brands across documents with the same runtime owner and isolates other owners", () => {
	const first = fixture();
	const sameRealm = fixture(first.owner);
	const otherRealm = fixture();
	const node = sameRealm.document.querySelector("#svg");
	expect(first.dom.hasInstance(node, "SVGElement")).toBe(true);
	expect(otherRealm.dom.hasInstance(node, "SVGElement")).toBe(false);
});

it("rejects forged nodes without reading structural properties", () => {
	const { dom } = fixture();
	const fake = {
		get nodeType() {
			throw new Error("read forged node");
		},
		get namespaceURI() {
			throw new Error("read forged namespace");
		},
	};
	for (const value of [
		fake,
		Object.create(fake),
		null,
		undefined,
		"svg",
		1,
		() => {},
	])
		expect(dom.hasInstance(value, "SVGElement")).toBe(false);
});

it("revokes branding when the publishing document closes", () => {
	const first = fixture();
	const sibling = fixture(first.owner);
	const node = first.document.querySelector("#svg");
	first.dom.close();
	expect(() => sibling.dom.hasInstance(node, "SVGElement")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});
