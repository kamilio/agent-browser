import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import * as htmlAttributes from "./html-attributes.js";

const trees: DocumentTree[] = [];
const namespaces = [htmlNamespace, svgNamespace, mathmlNamespace];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function document() {
	const tree = new DocumentTree("https://example.test/");
	trees.push(tree);
	return tree;
}

function expectReadOnlyNamespaces(tree: DocumentTree, read: () => void) {
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	const spies = [
		vi.spyOn(tree, "get"),
		vi.spyOn(tree, "elementInfo"),
		vi.spyOn(tree, "getAttributeNames"),
		vi.spyOn(tree, "getAttributeNode"),
		vi.spyOn(tree, "getAttributeRecord"),
		vi.spyOn(htmlAttributes, "snapshotHtmlAttributes"),
		vi.spyOn(htmlAttributes, "htmlAttributeNames"),
		vi.spyOn(htmlAttributes, "htmlAttributeEntries"),
	];
	try {
		read();
		for (const spy of spies) expect(spy).not.toHaveBeenCalled();
		expect(tree.revision).toBe(revision);
		expect(tree.resourceUsage()).toEqual(usage);
	} finally {
		for (const spy of spies) spy.mockRestore();
	}
}

it.each([
	["implicit HTML", undefined, htmlNamespace],
	["explicit HTML", htmlNamespace, htmlNamespace],
	["SVG", svgNamespace, svgNamespace],
	["MathML", mathmlNamespace, mathmlNamespace],
])(
	"matches the get namespace for %s elements",
	(_label, namespace, expected) => {
		const tree = document();
		const id =
			namespace === undefined
				? tree.createElement("DIV", { title: "retained" })
				: tree.createParserElement("Example", { title: "retained" }, namespace);
		const full = tree.get(id);
		const info = tree.elementInfo(id);
		expect(elementNamespace(full)).toBe(expected);
		expect(elementNamespace(info)).toBe(expected);
		expectReadOnlyNamespaces(tree, () => {
			expect(tree.namespaceOf(id)).toBe(expected);
		});
		expect(tree.get(id)).toBe(full);
		expect(tree.elementInfo(id)).toStrictEqual(info);
	},
);

it.each(["urn:example:custom", ""])(
	"retains constructor rejection of unsupported namespace %j",
	(namespace) => {
		const tree = document();
		expectReadOnlyNamespaces(tree, () => {
			expect(() => tree.createParserElement("example", {}, namespace)).toThrow(
				expect.objectContaining({
					code: "invalid-input",
					message: "Unsupported element namespace",
				}),
			);
			expect(tree.namespaceOf(tree.root)).toBe(htmlNamespace);
		});
	},
);

it.each([
	{ kind: "document", create: (tree: DocumentTree) => tree.root },
	{ kind: "text", create: (tree: DocumentTree) => tree.createText("text") },
	{
		kind: "comment",
		create: (tree: DocumentTree) => tree.createComment("comment"),
	},
	{ kind: "fragment", create: (tree: DocumentTree) => tree.createFragment() },
	{
		kind: "doctype",
		create: (tree: DocumentTree) =>
			tree.createDocumentType("html", "public", "system"),
	},
])("preserves the HTML fallback for $kind nodes", ({ kind, create }) => {
	const tree = document();
	const id = create(tree);
	const full = tree.get(id);
	const info = tree.elementInfo(id);
	expect(full.kind).toBe(kind);
	expect(Object.hasOwn(full, "namespaceURI")).toBe(false);
	expect(Object.hasOwn(info, "namespaceURI")).toBe(false);
	expect(elementNamespace(full)).toBe(htmlNamespace);
	expectReadOnlyNamespaces(tree, () => {
		expect(tree.namespaceOf(id)).toBe(htmlNamespace);
	});
	expect(tree.get(id)).toBe(full);
	expect(tree.elementInfo(id)).toStrictEqual(info);
});

it("reads cold and repeated mixed namespaces without full or attribute views", () => {
	const tree = document();
	const ids: [number, string][] = [
		[tree.root, htmlNamespace],
		[tree.createElement("input", { value: "initial" }), htmlNamespace],
		[tree.createParserElement("g", {}, svgNamespace), svgNamespace],
		[tree.createParserElement("mi", {}, mathmlNamespace), mathmlNamespace],
		[tree.createText("text"), htmlNamespace],
		[tree.createComment("comment"), htmlNamespace],
		[tree.createFragment(), htmlNamespace],
		[tree.createDocumentType("html"), htmlNamespace],
	];
	expectReadOnlyNamespaces(tree, () => {
		for (let count = 0; count < 5; count++)
			for (const [id, namespace] of ids)
				expect(tree.namespaceOf(id)).toBe(namespace);
	});
	for (const [id, namespace] of ids)
		expect(elementNamespace(tree.get(id))).toBe(namespace);
});

it("matches get validation for invalid, attribute and foreign-document IDs", () => {
	const tree = document();
	const foreign = document();
	const id = tree.createElement("div");
	const invalidIds = [
		0,
		-1,
		id + 0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER,
		tree.createAttribute("title", "not a document node"),
		foreign.root,
		foreign.createParserElement("g", {}, svgNamespace),
	];
	const failure = expect.objectContaining({
		code: "not-found",
		message: "Unknown document node",
	});
	for (const invalid of invalidIds) {
		expect(() => tree.get(invalid)).toThrow(failure);
		expect(() => tree.elementInfo(invalid)).toThrow(failure);
	}
	expectReadOnlyNamespaces(tree, () => {
		for (const invalid of invalidIds)
			expect(() => tree.namespaceOf(invalid)).toThrow(failure);
		expect(tree.namespaceOf(id)).toBe(htmlNamespace);
	});
	expect(foreign.namespaceOf(invalidIds[invalidIds.length - 1])).toBe(
		svgNamespace,
	);
});

it("rejects cached, uncached and invalid namespace reads after closure", () => {
	const tree = document();
	const cached = tree.createParserElement("g", {}, svgNamespace);
	const uncached = tree.createElement("div");
	const full = tree.get(cached);
	const info = tree.elementInfo(cached);
	expect(tree.namespaceOf(cached)).toBe(svgNamespace);
	tree.close();
	const ids = [tree.root, cached, uncached, -1, Number.NaN];
	const failure = expect.objectContaining({ code: "closed" });
	for (const id of ids) {
		expect(() => tree.get(id)).toThrow(failure);
		expect(() => tree.elementInfo(id)).toThrow(failure);
	}
	expectReadOnlyNamespaces(tree, () => {
		for (const id of ids) expect(() => tree.namespaceOf(id)).toThrow(failure);
	});
	expect(elementNamespace(full)).toBe(svgNamespace);
	expect(elementNamespace(info)).toBe(svgNamespace);
});

it("preserves node identity and namespaces through attachment and removal", () => {
	const tree = document();
	const parent = tree.createElement("main");
	const svg = tree.createParserElement("svg", {}, svgNamespace);
	const math = tree.createParserElement("math", {}, mathmlNamespace);
	const text = tree.createText("retained");
	const fragment = tree.createFragment();
	tree.append(math, text);
	tree.append(svg, math);
	const check = () => {
		expectReadOnlyNamespaces(tree, () => {
			expect(tree.namespaceOf(parent)).toBe(htmlNamespace);
			expect(tree.namespaceOf(svg)).toBe(svgNamespace);
			expect(tree.namespaceOf(math)).toBe(mathmlNamespace);
			expect(tree.namespaceOf(text)).toBe(htmlNamespace);
			expect(tree.namespaceOf(fragment)).toBe(htmlNamespace);
		});
		for (const id of [parent, svg, math, text, fragment])
			expect(tree.namespaceOf(id)).toBe(elementNamespace(tree.get(id)));
	};
	check();
	tree.append(tree.root, parent);
	tree.append(parent, svg);
	expect(tree.isConnected(math)).toBe(true);
	check();
	tree.remove(svg);
	expect(tree.parentOf(svg)).toBeNull();
	expect(tree.parentOf(math)).toBe(svg);
	expect(tree.isConnected(math)).toBe(false);
	check();
	tree.append(fragment, svg);
	check();
	tree.replaceChildren(fragment);
	expect(tree.parentOf(svg)).toBeNull();
	check();
});

it.each(namespaces)(
	"preserves %s namespaces in shallow clones and deep cross-document copies",
	(namespace) => {
		const source = document();
		const target = document();
		const original = source.createParserElement("example", {}, namespace);
		const childNamespace =
			namespace === svgNamespace ? mathmlNamespace : svgNamespace;
		const child = source.createParserElement("child", {}, childNamespace);
		source.append(original, child);
		source.append(child, source.createText("retained"));
		const shallow = source.clone(original);
		const copied = target.copyFrom(source, original);
		const copiedChild = target.get(copied).children[0];
		const copiedText = target.get(copiedChild).children[0];
		expect(shallow).not.toBe(original);
		expect(copied).not.toBe(original);
		expect(copiedChild).not.toBe(child);
		expect(source.get(shallow).children).toEqual([]);
		expectReadOnlyNamespaces(source, () => {
			expect(source.namespaceOf(original)).toBe(namespace);
			expect(source.namespaceOf(shallow)).toBe(namespace);
			expect(source.namespaceOf(child)).toBe(childNamespace);
			expect(() => source.namespaceOf(copied)).toThrow(
				expect.objectContaining({ code: "not-found" }),
			);
		});
		source.close();
		expectReadOnlyNamespaces(target, () => {
			expect(target.namespaceOf(copied)).toBe(namespace);
			expect(target.namespaceOf(copiedChild)).toBe(childNamespace);
			expect(target.namespaceOf(copiedText)).toBe(htmlNamespace);
			expect(() => target.namespaceOf(original)).toThrow(
				expect.objectContaining({ code: "not-found" }),
			);
		});
		for (const id of [copied, copiedChild, copiedText])
			expect(target.namespaceOf(id)).toBe(elementNamespace(target.get(id)));
	},
);

it.each(namespaces)(
	"leaves rich ordered attribute snapshots unchanged for %s",
	(namespace) => {
		const tree = document();
		const attributes = htmlAttributes.createHtmlAttributes();
		const entries: [string, string][] = [
			["z", "first"],
			["9", "nine"],
			["1", "one"],
			["__proto__", "ordinary prototype attribute"],
			["constructor", "ordinary constructor attribute"],
			["tostring", "ordinary method attribute"],
			["xmlns", "urn:attribute-only"],
			["encoding", "text/html"],
			["data-state", "before"],
		];
		for (let index = 0; index < 32; index++)
			entries.push([`data-rich-${index}`, `value-${index}`]);
		for (const [name, value] of entries)
			htmlAttributes.setHtmlAttribute(attributes, name, value);
		const id = tree.createParserElement("example", attributes, namespace);
		const peer = tree.createElement("aside");
		const full = tree.get(id);
		const info = tree.elementInfo(id);
		const peerView = tree.get(peer);
		const names = entries.map(([name]) => name);
		const expected = Object.fromEntries(entries);
		expect(full.attributes).toStrictEqual(expected);
		expect(info.attributes).toStrictEqual(expected);
		expect(info.attributes).not.toBe(full.attributes);
		for (const snapshot of [full, info]) {
			expect(Object.isFrozen(snapshot)).toBe(true);
			expect(Object.isFrozen(snapshot.attributes)).toBe(true);
			expect(Object.getPrototypeOf(snapshot.attributes)).toBe(Object.prototype);
			expect(Object.hasOwn(snapshot.attributes, "__proto__")).toBe(true);
			expect(htmlAttributes.htmlAttributeNames(snapshot.attributes)).toEqual(
				names,
			);
			expect(Reflect.set(snapshot.attributes, "data-state", "bad")).toBe(false);
		}
		expectReadOnlyNamespaces(tree, () => {
			for (let count = 0; count < 5; count++)
				expect(tree.namespaceOf(id)).toBe(namespace);
		});
		expect(tree.get(id)).toBe(full);
		expect(tree.elementInfo(id)).toStrictEqual(info);
		htmlAttributes.setHtmlAttribute(attributes, "data-state", "external");
		expect(tree.get(id)).toBe(full);
		tree.setAttribute(id, "data-state", "after");
		tree.setAttribute(id, "xmlns", "urn:still-attribute-only");
		tree.setAttribute(id, "encoding", "application/xml");
		tree.removeAttribute(id, "9");
		tree.setAttribute(id, "9", "reinserted");
		tree.setAttribute(id, "__proto__", "changed prototype attribute");
		expectReadOnlyNamespaces(tree, () => {
			expect(tree.namespaceOf(id)).toBe(namespace);
		});
		const changed = tree.get(id);
		const changedInfo = tree.elementInfo(id);
		expect(changed).not.toBe(full);
		expect(changed.attributes).toStrictEqual({
			...expected,
			"data-state": "after",
			xmlns: "urn:still-attribute-only",
			encoding: "application/xml",
			"9": "reinserted",
			["__proto__"]: "changed prototype attribute",
		});
		expect(changedInfo.attributes).toStrictEqual(changed.attributes);
		expect(changedInfo.attributes).not.toBe(changed.attributes);
		for (const snapshot of [changed, changedInfo])
			expect(htmlAttributes.htmlAttributeNames(snapshot.attributes)).toEqual([
				...names.filter((name) => name !== "9"),
				"9",
			]);
		for (const snapshot of [full, info]) {
			expect(snapshot.attributes).toStrictEqual(expected);
			expect(htmlAttributes.htmlAttributeNames(snapshot.attributes)).toEqual(
				names,
			);
		}
		expectReadOnlyNamespaces(tree, () => {
			expect(tree.namespaceOf(id)).toBe(namespace);
		});
		expect(tree.get(id)).toBe(changed);
		expect(tree.get(peer)).toBe(peerView);
	},
);

it("keeps namespace reads independent of owned attribute mutation and removal", () => {
	const tree = document();
	const id = tree.createParserElement("g", {}, svgNamespace);
	const attribute = tree.createAttribute("xmlns", "urn:initial");
	tree.setAttributeNode(id, attribute);
	const attached = tree.get(id);
	expectReadOnlyNamespaces(tree, () => {
		expect(tree.namespaceOf(id)).toBe(svgNamespace);
	});
	tree.setAttributeValue(attribute, "urn:changed");
	expectReadOnlyNamespaces(tree, () => {
		expect(tree.namespaceOf(id)).toBe(svgNamespace);
	});
	const changed = tree.elementInfo(id);
	tree.removeAttributeNode(id, attribute);
	expectReadOnlyNamespaces(tree, () => {
		expect(tree.namespaceOf(id)).toBe(svgNamespace);
	});
	expect(attached.attributes.xmlns).toBe("urn:initial");
	expect(changed.attributes.xmlns).toBe("urn:changed");
	expect(tree.get(id).attributes).toStrictEqual({});
});
