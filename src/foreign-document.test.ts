import { afterEach, expect, it } from "vitest";
import { documentBody, documentHead } from "./document-elements.js";
import { documentTitle, setDocumentTitle } from "./document-title.js";
import { documentBaseTarget, documentBaseUrl } from "./document-url.js";
import { type DocumentMutation, DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	isHtmlElement,
	mathmlNamespace,
	svgNamespace,
	xlinkNamespace,
	xmlNamespace,
	xmlnsNamespace,
} from "./dom-namespaces.js";
import { NodeRelations } from "./node-relations.js";
import { ScriptAttributes } from "./script-attributes.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function document(limits: ConstructorParameters<typeof DocumentTree>[1] = {}) {
	const tree = new DocumentTree("https://foreign.fixture.invalid/", limits);
	trees.push(tree);
	return tree;
}

function attribute(tree: DocumentTree, id: number, name: string) {
	const record = tree.getAttributeNode(id, name);
	if (record === null) throw new Error("Expected native attribute record");
	return record;
}

it.each([false, true])(
	"rejects namespace-distinct qualified-name collisions atomically, reversed=%s",
	(reversed) => {
		const tree = document();
		const source = tree.createParserElement(
			"svg",
			{ "xlink:href": "#original" },
			svgNamespace,
		);
		const namespaced = attribute(tree, source, "xlink:href");
		tree.removeAttributeNode(source, namespaced);
		const plain = tree.createAttribute("xlink:href", "#plain");
		const target = tree.createParserElement("svg", {}, svgNamespace);
		const attached = reversed ? plain : namespaced;
		const incoming = reversed ? namespaced : plain;
		tree.setAttributeNode(target, attached);
		const revision = tree.revision;
		const usage = tree.resourceUsage();
		expect(() => tree.setAttributeNode(target, incoming)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(tree.revision).toBe(revision);
		expect(tree.resourceUsage()).toEqual(usage);
		expect(tree.getAttributeRecord(attached).ownerElement).toBe(target);
		expect(tree.getAttributeRecord(incoming).ownerElement).toBeNull();
		expect(tree.getAttributeNodeNS(target, xlinkNamespace, "href")).toBe(
			reversed ? null : namespaced,
		);
		expect(tree.getAttributeNodeNS(target, null, "xlink:href")).toBe(
			reversed ? plain : null,
		);
	},
);

it("preserves exact indexed Attr access and replacement after transfer to HTML", () => {
	const tree = document();
	const svg = tree.createParserElement(
		"svg",
		{ viewBox: "first" },
		svgNamespace,
	);
	const html = tree.createElement("div");
	const relations = new NodeRelations(tree);
	const attributes = new ScriptAttributes(
		tree,
		{ createHostObject: (definition) => definition },
		() => ({}),
		relations,
	);
	try {
		const record = attribute(tree, svg, "viewBox");
		const original = attributes.get(svg, "viewBox");
		tree.removeAttributeNode(svg, record);
		attributes.set(html, original);
		const map = attributes.map(html) as ScriptHostObjectDefinition;
		expect(map.methods!.item(0)).toBe(original);
		expect(map.indexed!.get(0)).toBe(original);
		const replacement = attributes.copyFrom(tree, record);
		expect(attributes.set(html, replacement)).toBe(original);
		expect(tree.getAttributeRecord(record).ownerElement).toBeNull();
		expect(map.methods!.item(0)).toBe(replacement);
	} finally {
		attributes.close();
		relations.close();
	}
});

it("keeps foreign title/base/head/body names from overriding HTML document metadata", () => {
	const tree = document();
	const html = tree.createElement("html");
	const head = tree.createElement("head");
	const body = tree.createElement("body");
	tree.append(tree.root, html);
	for (const name of ["head", "body"])
		tree.append(html, tree.createParserElement(name, {}, svgNamespace));
	tree.append(html, head);
	tree.append(html, body);
	const svg = tree.createParserElement("svg", {}, svgNamespace);
	tree.append(body, svg);
	tree.append(
		svg,
		tree.createParserElement(
			"base",
			{ href: "https://wrong.fixture.invalid/", target: "wrong" },
			svgNamespace,
		),
	);
	const title = tree.createParserElement("title", {}, svgNamespace);
	tree.append(svg, title);
	tree.setTextContent(title, "SVG-only title");
	expect(documentHead(tree)).toBe(head);
	expect(documentBody(tree)).toBe(body);
	expect(documentBaseUrl(tree)).toBe(tree.url);
	expect(documentBaseTarget(tree)).toBe("_self");
	expect(documentTitle(tree)).toBe("");
	setDocumentTitle(tree, "HTML title");
	expect(documentTitle(tree)).toBe("HTML title");
	expect(tree.textContent(title)).toBe("SVG-only title");
});

it("copies detached attribute namespaces across document owners", () => {
	const source = document();
	const svg = source.createParserElement(
		"svg",
		{ "xml:lang": "en" },
		svgNamespace,
	);
	const record = attribute(source, svg, "xml:lang");
	const target = document();
	const imported = target.copyAttributeFrom(source, record);
	expect(target.getAttributeRecord(imported)).toMatchObject({
		name: "xml:lang",
		namespaceURI: xmlNamespace,
		prefix: "xml",
		localName: "lang",
		value: "en",
		ownerElement: null,
	});
	source.close();
	target.setAttributeValue(imported, "fr");
	expect(target.getAttributeRecord(imported).value).toBe("fr");
});

it.each([svgNamespace, mathmlNamespace])(
	"preserves actual namespace and case for %s parser elements",
	(namespace) => {
		const tree = document();
		const id = tree.createParserElement(
			"foreignObject",
			{ viewBox: "0 0 1 1", viewbox: "other" },
			namespace,
		);
		const node = tree.get(id);
		expect(elementNamespace(node)).toBe(namespace);
		expect(node.tagName).toBe("foreignObject");
		expect(node.attributes).toEqual({ viewBox: "0 0 1 1", viewbox: "other" });
		expect(isHtmlElement(node)).toBe(false);
		expect(Object.isFrozen(node)).toBe(true);
		expect(tree.attributeName(id, "VIEWBOX")).toBe("VIEWBOX");
		const html = tree.createElement("SVG", { viewBox: "html" });
		expect(elementNamespace(tree.get(html))).toBe(htmlNamespace);
		expect(tree.get(html).tagName).toBe("svg");
		expect(tree.get(html).attributes).toEqual({ viewbox: "html" });
	},
);

it.each(["urn:unimplemented", "", null, 12, {}])(
	"rejects unsupported parser namespace %j without allocation",
	(namespace) => {
		const tree = document();
		const before = tree.resourceUsage();
		expect(() =>
			tree.createParserElement("svg", {}, namespace as string),
		).toThrow(/namespace/i);
		expect(tree.resourceUsage()).toEqual(before);
	},
);

it.each([
	["xlink:href", xlinkNamespace, "xlink", "href"],
	["xml:lang", xmlNamespace, "xml", "lang"],
	["xml:space", xmlNamespace, "xml", "space"],
	["xmlns", xmlnsNamespace, null, "xmlns"],
	["xmlns:xlink", xmlnsNamespace, "xmlns", "xlink"],
] as const)(
	"retains adjusted namespace metadata for %s",
	(name, namespaceURI, prefix, localName) => {
		const tree = document();
		const id = tree.createParserElement(
			"svg",
			{ [name]: "before" },
			svgNamespace,
		);
		const record = attribute(tree, id, name);
		expect(tree.getAttributeRecord(record)).toMatchObject({
			name,
			namespaceURI,
			prefix,
			localName,
			ownerElement: id,
		});
		const changes: Readonly<DocumentMutation>[] = [];
		tree.onMutation((change) => changes.push(change));
		tree.setAttribute(id, name, "after");
		expect(tree.getAttributeRecord(record).value).toBe("after");
		expect(changes.at(-1)).toMatchObject({
			attributeName: localName,
			attributeNamespace: namespaceURI,
			oldValue: "before",
		});
		const cloned = tree.cloneAttribute(record);
		expect(tree.getAttributeRecord(cloned)).toMatchObject({
			name,
			namespaceURI,
			prefix,
			localName,
			ownerElement: null,
		});
		tree.removeAttributeNode(id, record);
		expect(changes.at(-1)).toMatchObject({
			attributeName: localName,
			attributeNamespace: namespaceURI,
		});
		tree.setAttribute(id, name, "plain");
		expect(
			tree.getAttributeRecord(attribute(tree, id, name)).namespaceURI,
		).toBeUndefined();
		expect(() => tree.setAttributeNode(id, cloned)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		tree.removeAttribute(id, name);
		tree.setAttributeNode(id, cloned);
		expect(tree.getAttributeRecord(attribute(tree, id, name))).toMatchObject({
			namespaceURI,
			prefix,
			localName,
			value: "after",
		});
	},
);

it("does not infer namespaces for ordinary HTML prefixed-looking attributes", () => {
	const tree = document();
	const id = tree.createElement("div", {
		"xml:lang": "en",
		xmlns: svgNamespace,
	});
	for (const name of tree.getAttributeNames(id))
		expect(
			tree.getAttributeRecord(attribute(tree, id, name)).namespaceURI,
		).toBeUndefined();
	expect(elementNamespace(tree.get(id))).toBe(htmlNamespace);
});

it("does not allocate Attr records for missing namespace lookups", () => {
	const tree = document({ maxNodes: 3 });
	const id = tree.createParserElement(
		"svg",
		{ viewBox: "a", "xml:lang": "en", "xlink:href": "#target" },
		svgNamespace,
	);
	const usage = tree.resourceUsage();
	for (const namespace of [null, "urn:missing", xlinkNamespace]) {
		expect(tree.getAttributeNodeNS(id, namespace, "absent")).toBeNull();
		expect(tree.resourceUsage()).toEqual(usage);
	}
	const record = tree.getAttributeNodeNS(id, xlinkNamespace, "href");
	expect(record).not.toBeNull();
	expect(tree.resourceUsage().nodes).toBe(3);
});

it("compares element and attribute namespaces without allocating Attr records", () => {
	const tree = document();
	const html = tree.createElement("title");
	const svg = tree.createParserElement("title", {}, svgNamespace);
	const namespaced = tree.createParserElement(
		"svg",
		{ "xml:lang": "en" },
		svgNamespace,
	);
	const plain = tree.createParserElement("svg", {}, svgNamespace);
	tree.setAttribute(plain, "xml:lang", "en");
	const relations = new NodeRelations(tree);
	try {
		const svgCapability = {};
		const plainCapability = {};
		relations.register(svgCapability, svg);
		relations.register(plainCapability, plain);
		const before = tree.resourceUsage();
		expect(relations.definition(html).methods?.isEqualNode(svgCapability)).toBe(
			false,
		);
		expect(
			relations.definition(namespaced).methods?.isEqualNode(plainCapability),
		).toBe(false);
		expect(tree.resourceUsage()).toEqual(before);
	} finally {
		relations.close();
	}
});

it("keeps attached mixed-case Attr updates/removals exact after transfer to HTML", () => {
	const tree = document();
	const foreign = tree.createParserElement(
		"svg",
		{ viewBox: "first" },
		svgNamespace,
	);
	const html = tree.createElement("div");
	const record = attribute(tree, foreign, "viewBox");
	tree.removeAttributeNode(foreign, record);
	tree.setAttributeNode(html, record);
	tree.setAttributeValue(record, "second");
	expect(tree.get(html).attributes).toEqual({ viewBox: "second" });
	tree.removeAttributeNode(html, record);
	expect(tree.get(html).attributes).toEqual({});
	expect(tree.getAttributeRecord(record).ownerElement).toBeNull();
});

it("copies namespace/case and attribute metadata through clones and template owners", () => {
	const source = document();
	const template = source.createElement("template");
	const content = source.templateContent(template);
	const svg = content.tree.createParserElement(
		"svg",
		{ "xlink:href": "#source" },
		svgNamespace,
	);
	const foreignTemplate = content.tree.createParserElement(
		"template",
		{},
		svgNamespace,
	);
	content.tree.append(content.id, svg);
	content.tree.append(svg, foreignTemplate);
	content.tree.append(foreignTemplate, content.tree.createText("literal"));
	const target = document();
	const copied = target.copyFrom(source, template, true);
	const copiedContent = target.templateContent(copied);
	const copiedSvg = copiedContent.tree.get(copiedContent.id).children[0];
	expect(elementNamespace(copiedContent.tree.get(copiedSvg))).toBe(
		svgNamespace,
	);
	expect(
		copiedContent.tree.getAttributeRecord(
			attribute(copiedContent.tree, copiedSvg, "xlink:href"),
		),
	).toMatchObject({ namespaceURI: xlinkNamespace, localName: "href" });
	const copiedForeignTemplate = copiedContent.tree.get(copiedSvg).children[0];
	expect(copiedContent.tree.textContent(copiedForeignTemplate)).toBe("literal");
	expect(() =>
		copiedContent.tree.templateContent(copiedForeignTemplate),
	).toThrow();
	const clone = copiedContent.tree.clone(copiedSvg, true);
	expect(elementNamespace(copiedContent.tree.get(clone))).toBe(svgNamespace);
	expect(
		copiedContent.tree.getAttributeRecord(
			attribute(copiedContent.tree, clone, "xlink:href"),
		).namespaceURI,
	).toBe(xlinkNamespace);
});

it.each([svgNamespace, mathmlNamespace])(
	"rejects HTML control state writes for %s",
	(namespace) => {
		const tree = document();
		const id = tree.createParserElement("input", { value: "inert" }, namespace);
		const usage = tree.resourceUsage();
		const revision = tree.revision;
		for (const action of [
			() => tree.setControl(id, { value: "changed" }),
			() => tree.clearControl(id, ["value"]),
			() => tree.setCustomValidity(id, "invalid"),
		])
			expect(action).toThrow(/foreign|HTML/i);
		expect(tree.get(id).control).toEqual({});
		expect(tree.resourceUsage()).toEqual(usage);
		expect(tree.revision).toBe(revision);
	},
);

it("keeps namespace-aware creation and attribute updates atomic at text limits", () => {
	const tree = document({ maxTextCodeUnits: 32 });
	const id = tree.createParserElement(
		"svg",
		{ viewBox: "first" },
		svgNamespace,
	);
	const before = tree.resourceUsage();
	const revision = tree.revision;
	expect(() =>
		tree.createParserElement(
			"svg",
			{ "xml:lang": "x".repeat(32) },
			svgNamespace,
		),
	).toThrow(/limit/i);
	expect(() => tree.setAttribute(id, "viewBox", "x".repeat(32))).toThrow(
		/limit/i,
	);
	expect(tree.resourceUsage()).toEqual(before);
	expect(tree.revision).toBe(revision);
	expect(tree.get(id).attributes).toEqual({ viewBox: "first" });
});
