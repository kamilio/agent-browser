import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import {
	type HtmlFragmentContext,
	parseHtmlDocument,
	parseHtmlFragment,
} from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const url = "https://example.test/";

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function document() {
	const tree = new DocumentTree(url);
	trees.push(tree);
	return tree;
}

function parse(source: string) {
	return parseHtmlDocument(source, url, {
		initializeDocument(tree) {
			trees.push(tree);
		},
	});
}

function fragment(source: string, context: HtmlFragmentContext) {
	const parsed = parseHtmlFragment(source, url, context);
	trees.push(parsed.tree);
	return parsed;
}

function select(tree: DocumentTree, selector: string, root = tree.root) {
	const id = new DocumentQueries(tree).querySelector(selector, root);
	if (id === null) throw new Error(`Missing fixture ${selector}`);
	return id;
}

it.each([
	["DIV", "div", htmlNamespace],
	["linearGradient", "linearGradient", svgNamespace],
	["annotation-xml", "annotation-xml", mathmlNamespace],
])(
	"returns only immutable element information for %s",
	(name, tagName, namespaceURI) => {
		const tree = document();
		const attributes = {
			"data-state": "before",
			["__proto__"]: "safe",
			constructor: "ordinary",
		};
		const id = tree.createParserElement(name, attributes, namespaceURI);
		tree.append(tree.root, id);
		tree.append(id, tree.createText("not part of the information view"));
		const full = tree.get(id);
		const info = tree.elementInfo(id);
		const expected = {
			kind: "element",
			tagName,
			...(namespaceURI === htmlNamespace ? {} : { namespaceURI }),
			attributes: { ...attributes },
		};
		expect(info).toStrictEqual(expected);
		expect(Reflect.ownKeys(info).sort()).toEqual(Object.keys(expected).sort());
		expect(elementNamespace(info)).toBe(namespaceURI);
		expect(info.attributes).toStrictEqual(full.attributes);
		expect(info.attributes).not.toBe(full.attributes);
		expect(Object.getPrototypeOf(info.attributes)).toBe(Object.prototype);
		expect(Object.hasOwn(info.attributes, "__proto__")).toBe(true);
		expect(Object.isFrozen(info)).toBe(true);
		expect(Object.isFrozen(info.attributes)).toBe(true);
		expect(Reflect.set(info, "tagName", "changed")).toBe(false);
		expect(Reflect.set(info.attributes, "data-state", "changed")).toBe(false);
		expect(Reflect.deleteProperty(info.attributes, "constructor")).toBe(false);
		expect(
			Reflect.defineProperty(info.attributes, "added", { value: "bad" }),
		).toBe(false);
		attributes["data-state"] = "external edit";
		expect(info).toStrictEqual(expected);
		expect(tree.elementInfo(id)).toStrictEqual(expected);
		expect(tree.get(id)).toBe(full);
	},
);

it("reads element and non-element information without get calls or resource changes", () => {
	const tree = document();
	const ids = [
		tree.root,
		tree.createElement("input", { value: "initial" }),
		tree.createParserElement("g", {}, svgNamespace),
		tree.createParserElement("mi", {}, mathmlNamespace),
		tree.createText("text"),
		tree.createComment("comment"),
		tree.createFragment(),
		tree.createDocumentType("html"),
	];
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	const get = vi.spyOn(tree, "get");
	for (let count = 0; count < 3; count++)
		for (const id of ids)
			expect(Object.isFrozen(tree.elementInfo(id))).toBe(true);
	expect(get).not.toHaveBeenCalled();
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(usage);
});

it("uses the get fallback shape for document, text, comment, fragment and doctype nodes", () => {
	const tree = document();
	const ids = [
		tree.root,
		tree.createText("retained text"),
		tree.createComment("retained comment"),
		tree.createFragment(),
		tree.createDocumentType("html", "public", "system"),
	];
	for (const id of ids) {
		const full = tree.get(id);
		const info = tree.elementInfo(id);
		expect(info).toStrictEqual({
			kind: full.kind,
			tagName: full.tagName,
			attributes: full.attributes,
		});
		expect(Reflect.ownKeys(info).sort()).toEqual([
			"attributes",
			"kind",
			"tagName",
		]);
		expect(info.tagName).toBe("");
		expect(info.attributes).toStrictEqual({});
		expect(elementNamespace(info)).toBe(htmlNamespace);
		expect(Object.isFrozen(info)).toBe(true);
		expect(Object.isFrozen(info.attributes)).toBe(true);
	}
});

it("retains independent information and full snapshots across edits, removal and closure", () => {
	const tree = document();
	const parent = tree.createElement("section");
	const id = tree.createElement("div", {
		title: "before",
		"data-remove": "old",
	});
	const child = tree.createText("before text");
	tree.append(tree.root, parent);
	tree.append(id, child);
	const detached = tree.elementInfo(id);
	const fullDetached = tree.get(id);
	tree.append(parent, id);
	const attached = tree.elementInfo(id);
	const fullAttached = tree.get(id);
	expect(tree.parentOf(id)).toBe(parent);
	tree.setAttribute(id, "title", "after");
	tree.removeAttribute(id, "data-remove");
	tree.setAttribute(id, "data-added", "new");
	tree.setData(child, "after text");
	tree.append(parent, child);
	const changed = tree.elementInfo(id);
	const fullChanged = tree.get(id);
	tree.remove(id);
	expect(tree.parentOf(id)).toBeNull();
	expect(tree.parentOf(child)).toBe(parent);
	expect(tree.elementInfo(id)).toStrictEqual(changed);
	tree.setAttribute(id, "title", "removed edit");
	const removed = tree.elementInfo(id);
	tree.close();
	for (const info of [detached, attached]) {
		expect(info.attributes).toStrictEqual({
			title: "before",
			"data-remove": "old",
		});
		expect(info.attributes).not.toBe(changed.attributes);
	}
	expect(changed.attributes).toStrictEqual({
		title: "after",
		"data-added": "new",
	});
	expect(removed.attributes).toStrictEqual({
		title: "removed edit",
		"data-added": "new",
	});
	expect(removed.attributes).not.toBe(changed.attributes);
	expect(fullDetached).toMatchObject({
		parent: null,
		children: [child],
		attributes: detached.attributes,
	});
	expect(fullAttached).toMatchObject({
		parent,
		children: [child],
		attributes: attached.attributes,
	});
	expect(fullChanged).toMatchObject({
		parent,
		children: [],
		attributes: changed.attributes,
	});
	for (const info of [detached, attached, changed, removed]) {
		expect(Object.isFrozen(info)).toBe(true);
		expect(Object.isFrozen(info.attributes)).toBe(true);
	}
});

it("matches get validation for invalid, attribute and foreign-document IDs", () => {
	const tree = document();
	const foreign = document();
	const id = tree.createElement("div");
	for (const invalid of [
		0,
		-1,
		id + 0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER,
		tree.createAttribute("title", "not a document node"),
		foreign.root,
		foreign.createElement("div"),
	]) {
		for (const read of [
			() => tree.get(invalid),
			() => tree.elementInfo(invalid),
		])
			expect(read).toThrow(
				expect.objectContaining({
					code: "not-found",
					message: "Unknown document node",
				}),
			);
	}
	expect(tree.elementInfo(id).tagName).toBe("div");
	expect(foreign.elementInfo(foreign.root).kind).toBe("document");
});

it("rejects all information lookups after closure, including cached and invalid IDs", () => {
	const tree = document();
	const id = tree.createElement("div");
	const retained = tree.elementInfo(id);
	tree.get(id);
	tree.close();
	for (const target of [tree.root, id, -1, Number.NaN]) {
		for (const read of [() => tree.get(target), () => tree.elementInfo(target)])
			expect(read).toThrow(expect.objectContaining({ code: "closed" }));
	}
	expect(retained).toStrictEqual({
		kind: "element",
		tagName: "div",
		attributes: {},
	});
});

it.each([32, 256])(
	"parses %i siblings without growing body snapshots during insertion",
	(width) => {
		const bodySnapshots: number[] = [];
		let restore = () => {};
		const tree = parseHtmlDocument(
			`<html><head></head><body>${"<div></div>".repeat(width)}</body></html>`,
			url,
			{
				limits: { maxNodes: width + 4 },
				initializeDocument(document) {
					trees.push(document);
					const get = document.get.bind(document);
					const spy = vi.spyOn(document, "get").mockImplementation((id) => {
						const node = get(id);
						if (node.kind === "element" && node.tagName === "body")
							bodySnapshots.push(node.children.length);
						return node;
					});
					restore = () => spy.mockRestore();
				},
			},
		);
		restore();
		expect(bodySnapshots).toEqual([0]);
		expect(tree.nodeCount).toBe(width + 4);
		const body = select(tree, "body");
		const children = tree.get(body).children;
		expect(children).toHaveLength(width);
		for (const child of children) {
			expect(tree.elementInfo(child)).toStrictEqual({
				kind: "element",
				tagName: "div",
				attributes: {},
			});
			expect(tree.parentOf(child)).toBe(body);
		}
	},
);

it("preserves node limits and closes an initialized tree on sibling overflow", () => {
	let failedTree: DocumentTree | undefined;
	let failure: unknown;
	try {
		parseHtmlDocument(`<body>${"<div></div>".repeat(33)}`, url, {
			limits: { maxNodes: 36 },
			initializeDocument(tree) {
				trees.push(tree);
				failedTree = tree;
				expect(tree.elementInfo(tree.root).kind).toBe("document");
			},
		});
	} catch (error) {
		failure = error;
	}
	expect(failure).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(failure)).toEqual({
		kind: "document.nodes",
		unit: "nodes",
		limit: 36,
		observed: 37,
	});
	if (!failedTree) throw new Error("Expected initialized tree");
	const tree = failedTree;
	expect(() => tree.elementInfo(tree.root)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => tree.get(tree.root)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("retains SVG integration, adjusted names and foreign children around HTML content", () => {
	const tree = parse(
		'<svg><foreignobject id=point><input id=html><svg id=nested viewbox="0 0 10 10"><lineargradient id=gradient /></svg></foreignobject><g id=after /></svg>',
	);
	const point = select(tree, "#point");
	const input = select(tree, "#html");
	const nested = select(tree, "#nested");
	expect(tree.elementInfo(point)).toMatchObject({
		tagName: "foreignObject",
		namespaceURI: svgNamespace,
	});
	expect(elementNamespace(tree.elementInfo(input))).toBe(htmlNamespace);
	expect(tree.parentOf(input)).toBe(point);
	expect(tree.elementInfo(nested)).toMatchObject({
		namespaceURI: svgNamespace,
		attributes: { viewBox: "0 0 10 10" },
	});
	expect(tree.elementInfo(select(tree, "#gradient"))).toMatchObject({
		tagName: "linearGradient",
		namespaceURI: svgNamespace,
	});
	expect(tree.parentOf(nested)).toBe(point);
	expect(tree.elementInfo(select(tree, "#after")).namespaceURI).toBe(
		svgNamespace,
	);
});

it.each([
	["TEXT/HTML", htmlNamespace],
	["application/xhtml+xml", htmlNamespace],
	[" text/html ", mathmlNamespace],
	["application/xml", mathmlNamespace],
])(
	"uses annotation-xml encoding %s without losing namespace context",
	(encoding, expectedNamespace) => {
		const tree = parse(
			`<math><annotation-xml id=point encoding="${encoding}"><input id=child></input><svg id=nested /></annotation-xml></math>`,
		);
		const point = select(tree, "#point");
		const child = select(tree, "#child");
		expect(tree.elementInfo(point)).toMatchObject({
			namespaceURI: mathmlNamespace,
			attributes: { encoding },
		});
		expect(elementNamespace(tree.elementInfo(child))).toBe(expectedNamespace);
		expect(tree.parentOf(child)).toBe(point);
		expect(tree.elementInfo(select(tree, "#nested")).namespaceURI).toBe(
			svgNamespace,
		);
	},
);

it("reconstructs formatting with independent attribute snapshots", () => {
	const { tree, fragment: root } = fragment(
		"<p><b class=kept>one<p>two</b><b><i>three</b>four</i>",
		{ tagName: "body" },
	);
	expect(serializeHtml(tree, root)).toBe(
		'<p><b class="kept">one</b></p><p><b class="kept">two</b><b><i>three</i></b><i>four</i></p>',
	);
	const bold = new DocumentQueries(tree).querySelectorAll("b.kept", root);
	expect(bold).toHaveLength(2);
	expect(bold[0]).not.toBe(bold[1]);
	expect(tree.elementInfo(bold[0])).toStrictEqual(tree.elementInfo(bold[1]));
	tree.setAttribute(bold[1], "class", "changed");
	expect(tree.elementInfo(bold[0]).attributes.class).toBe("kept");
});

it("retains adoption-agency child movement when formatting straddles a block", () => {
	const { tree, fragment: root } = fragment("<b><p>one</b>two</p>", {
		tagName: "body",
	});
	expect(serializeHtml(tree, root)).toBe("<b></b><p><b>one</b>two</p>");
	const paragraph = select(tree, "p", root);
	const reconstructed = select(tree, "p > b", root);
	expect(tree.parentOf(reconstructed)).toBe(paragraph);
	expect(tree.textContent(reconstructed)).toBe("one");
	expect(tree.textContent(paragraph)).toBe("onetwo");
});

it("fosters visible inputs while keeping hidden inputs and implicit table structure", () => {
	const tree = parse(
		"<table><input id=visible><input id=hidden type=hidden><tr><td>cell</table>",
	);
	const body = select(tree, "body");
	const table = select(tree, "table");
	expect(tree.parentOf(select(tree, "#visible"))).toBe(body);
	expect(tree.parentOf(select(tree, "#hidden"))).toBe(table);
	expect(serializeHtml(tree, body)).toBe(
		'<input id="visible"><table><input id="hidden" type="hidden"><tbody><tr><td>cell</td></tr></tbody></table>',
	);
});

it("keeps virtual foreign fragment attributes and detached root ownership", () => {
	const { tree, fragment: root } = fragment(
		"<input id=html><svg id=svg><g /></svg>",
		{
			tagName: "annotation-xml",
			namespaceURI: mathmlNamespace,
			attributes: { encoding: "TEXT/HTML" },
		},
	);
	const input = select(tree, "#html", root);
	const svg = select(tree, "#svg", root);
	expect(elementNamespace(tree.elementInfo(input))).toBe(htmlNamespace);
	expect(tree.elementInfo(svg).namespaceURI).toBe(svgNamespace);
	expect(tree.parentOf(input)).toBe(root);
	expect(tree.parentOf(svg)).toBe(root);
	expect(tree.parentOf(root)).toBeNull();
	expect(tree.isConnected(input)).toBe(false);
	expect(
		new DocumentQueries(tree).querySelector(
			"html, head, body, annotation-xml",
			root,
		),
	).toBeNull();
	expect(tree.elementInfo(root)).toStrictEqual({
		kind: "fragment",
		tagName: "",
		attributes: {},
	});
});
