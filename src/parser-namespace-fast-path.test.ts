import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import {
	HtmlFormatting,
	type HtmlParserNode,
	isHtmlParserNode,
	isHtmlScopeBoundary,
	isHtmlSpecial,
} from "./html-formatting.js";
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
	const result = parseHtmlFragment(source, url, context);
	trees.push(result.tree);
	return result;
}

function select(tree: DocumentTree, selector: string, root = tree.root) {
	const queries = new DocumentQueries(tree);
	try {
		const id = queries.querySelector(selector, root);
		if (id === null) throw new Error(`Missing fixture ${selector}`);
		return id;
	} finally {
		queries.close();
	}
}

function state(limits = { maxWork: 10000, maxText: 10000 }) {
	const tree = document();
	const stack: HtmlParserNode[] = [
		{ tree, id: tree.createFragment(), tag: "body" },
	];
	const formatter = new HtmlFormatting({
		stack: () => stack,
		insert(tag, attributes) {
			const id = tree.createParserElement(tag, attributes);
			tree.append(stack[stack.length - 1].id, id);
			return { tree, id, tag };
		},
		place(node, parent) {
			tree.append(parent.id, node.id);
		},
		issue() {},
		check() {},
		...limits,
	});
	return { tree, stack, formatter };
}

it.each([
	["div", htmlNamespace, true, false],
	["p", htmlNamespace, true, false],
	["table", htmlNamespace, true, true],
	["template", htmlNamespace, true, true],
	["b", htmlNamespace, false, false],
	["foreignObject", svgNamespace, true, true],
	["desc", svgNamespace, true, true],
	["title", svgNamespace, true, true],
	["g", svgNamespace, false, false],
	["p", svgNamespace, false, false],
	["foreignobject", svgNamespace, false, false],
	["mi", mathmlNamespace, true, true],
	["mo", mathmlNamespace, true, true],
	["mn", mathmlNamespace, true, true],
	["ms", mathmlNamespace, true, true],
	["mtext", mathmlNamespace, true, true],
	["annotation-xml", mathmlNamespace, true, true],
	["mrow", mathmlNamespace, false, false],
	["p", mathmlNamespace, false, false],
] as const)(
	"classifies %s in %s without element or attribute snapshots",
	(tag, namespaceURI, special, boundary) => {
		const tree = document();
		const id = tree.createParserElement(
			tag,
			{ title: "retained", encoding: "text/html" },
			namespaceURI,
		);
		const node = { tree, id, tag };
		const revision = tree.revision;
		const usage = tree.resourceUsage();
		const get = vi.spyOn(tree, "get");
		const info = vi.spyOn(tree, "elementInfo");
		expect(isHtmlParserNode(node)).toBe(namespaceURI === htmlNamespace);
		expect(isHtmlParserNode(node, tag)).toBe(namespaceURI === htmlNamespace);
		expect(isHtmlParserNode(node, "unmatched")).toBe(false);
		expect(isHtmlSpecial(node)).toBe(special);
		expect(isHtmlScopeBoundary(node)).toBe(boundary);
		expect(get).not.toHaveBeenCalled();
		expect(info).not.toHaveBeenCalled();
		expect(tree.revision).toBe(revision);
		expect(tree.resourceUsage()).toEqual(usage);
	},
);

it("retains HTML string categories and virtual non-element namespace fallback", () => {
	const tree = document();
	const ids = [tree.root, tree.createFragment(), tree.createText("text")];
	const get = vi.spyOn(tree, "get");
	const info = vi.spyOn(tree, "elementInfo");
	for (const id of ids) {
		const node = { tree, id, tag: "template" };
		expect(isHtmlParserNode(node, "template")).toBe(true);
		expect(isHtmlSpecial(node)).toBe(true);
		expect(isHtmlScopeBoundary(node)).toBe(true);
	}
	expect(isHtmlSpecial("p")).toBe(true);
	expect(isHtmlScopeBoundary("p")).toBe(false);
	expect(isHtmlScopeBoundary("template")).toBe(true);
	expect(isHtmlSpecial("foreignObject")).toBe(false);
	expect(isHtmlScopeBoundary("annotation-xml")).toBe(false);
	expect(get).not.toHaveBeenCalled();
	expect(info).not.toHaveBeenCalled();
});

it.each([isHtmlParserNode, isHtmlSpecial, isHtmlScopeBoundary])(
	"preserves identity and closed-tree validation in %s",
	(classify) => {
		const tree = document();
		const other = document();
		const id = tree.createElement("div");
		const invalid = [
			0,
			-1,
			id + 0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER,
			tree.createAttribute("title", "attribute"),
			other.root,
			other.createElement("div"),
		];
		const get = vi.spyOn(tree, "get");
		const info = vi.spyOn(tree, "elementInfo");
		for (const target of invalid)
			expect(() => classify({ tree, id: target, tag: "div" })).toThrow(
				expect.objectContaining({ code: "not-found" }),
			);
		classify({ tree, id, tag: "div" });
		tree.close();
		for (const target of [id, tree.root, ...invalid])
			expect(() => classify({ tree, id: target, tag: "div" })).toThrow(
				expect.objectContaining({ code: "closed" }),
			);
		expect(get).not.toHaveBeenCalled();
		expect(info).not.toHaveBeenCalled();
	},
);

it.each([
	["identical", htmlNamespace, { id: "kept", class: "same" }, false],
	["reordered", htmlNamespace, { class: "same", id: "kept" }, false],
	["different value", htmlNamespace, { id: "other", class: "same" }, true],
	["different name", htmlNamespace, { id: "kept", title: "same" }, true],
	["SVG namespace", svgNamespace, { id: "kept", class: "same" }, true],
	["MathML namespace", mathmlNamespace, { id: "kept", class: "same" }, true],
] as const)(
	"matches formatting entries by original attributes and namespace: %s",
	(_label, namespaceURI, attributes, retained) => {
		const { tree, formatter } = state();
		const original = { id: "kept", class: "same" };
		const first = {
			tree,
			id: tree.createParserElement("b", original),
			tag: "b",
		};
		const later = Array.from({ length: 3 }, () => ({
			tree,
			id: tree.createParserElement("b", { ...attributes }, namespaceURI),
			tag: "b",
		}));
		const get = vi.spyOn(tree, "get");
		const info = vi.spyOn(tree, "elementInfo");
		formatter.add(first, original);
		original.id = "external edit";
		for (const node of later) formatter.add(node, { ...attributes });
		for (const node of later) formatter.remove(node);
		expect(formatter.find("b")).toBe(retained ? first : undefined);
		expect(get).not.toHaveBeenCalled();
		expect(info).not.toHaveBeenCalled();
	},
);

it("validates node identity while comparing formatting namespaces", () => {
	const { tree, formatter } = state();
	const first = { tree, id: tree.createElement("b"), tag: "b" };
	formatter.add(first, {});
	const get = vi.spyOn(tree, "get");
	const info = vi.spyOn(tree, "elementInfo");
	expect(() => formatter.add({ tree, id: -1, tag: "b" }, {})).toThrow(
		expect.objectContaining({ code: "not-found" }),
	);
	tree.close();
	expect(() => formatter.add(first, {})).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(get).not.toHaveBeenCalled();
	expect(info).not.toHaveBeenCalled();
});

it("still charges namespace-only formatting searches to the work budget", () => {
	const { tree, formatter } = state({ maxWork: 5, maxText: 1000 });
	formatter.add({ tree, id: tree.createElement("b"), tag: "b" }, {});
	expect(() => {
		for (let index = 0; index < 10; index++) formatter.find("i");
	}).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "HTML formatting work limit exceeded",
		}),
	);
});

it("still charges original-attribute comparisons to the text budget", () => {
	const { tree, formatter } = state({ maxWork: 1000, maxText: 5 });
	const attributes = { title: "long" };
	const nodes = Array.from({ length: 2 }, () => ({
		tree,
		id: tree.createParserElement("b", attributes),
		tag: "b",
	}));
	formatter.add(nodes[0], attributes);
	expect(() => formatter.add(nodes[1], attributes)).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "HTML formatting text work limit exceeded",
		}),
	);
});

it("repairs adoption formatting inside SVG integration without moving foreign siblings", () => {
	const tree = parse(
		"<body><svg><foreignObject id=point><b><p>one</b>two</p></foreignObject><g id=after /></svg><p id=outside>end</p>",
	);
	const point = select(tree, "#point");
	expect(elementNamespace(tree.get(point))).toBe(svgNamespace);
	expect(serializeHtml(tree, point)).toBe("<b></b><p><b>one</b>two</p>");
	const paragraph = select(tree, "#point > p");
	const bold = select(tree, "#point > p > b");
	expect(elementNamespace(tree.get(paragraph))).toBe(htmlNamespace);
	expect(elementNamespace(tree.get(bold))).toBe(htmlNamespace);
	expect(tree.textContent(bold)).toBe("one");
	expect(tree.textContent(paragraph)).toBe("onetwo");
	expect(tree.parentOf(point)).toBe(tree.parentOf(select(tree, "#after")));
	expect(elementNamespace(tree.get(select(tree, "#after")))).toBe(svgNamespace);
	expect(tree.textContent(select(tree, "#outside"))).toBe("end");
});

it("reconstructs HTML formatting at MathML text integration points", () => {
	const tree = parse(
		"<body><math><mtext id=point><b><i>one</b>two</i></mtext><mi id=after>x</mi></math><p>end</p>",
	);
	const point = select(tree, "#point");
	expect(elementNamespace(tree.get(point))).toBe(mathmlNamespace);
	expect(serializeHtml(tree, point)).toBe("<b><i>one</i></b><i>two</i>");
	const italic = select(tree, "#point > i");
	expect(elementNamespace(tree.get(italic))).toBe(htmlNamespace);
	expect(tree.textContent(italic)).toBe("two");
	expect(elementNamespace(tree.get(select(tree, "#after")))).toBe(
		mathmlNamespace,
	);
	expect(tree.textContent(tree.root)).toBe("onetwoxend");
});

it("keeps mixed foreign adoption repair in template ownership and closes that owner", () => {
	const tree = parse(
		"<body><b>before<template id=inert><svg><foreignObject id=point><b><p>one</b>two</p></foreignObject></svg><math><mi>x</mi></math></template>after</b>",
	);
	const template = select(tree, "#inert");
	const content = tree.templateContent(template);
	const point = select(content.tree, "#point", content.id);
	expect(content.tree).not.toBe(tree);
	expect(tree.get(template).children).toEqual([]);
	expect(tree.textContent(tree.root)).toBe("beforeafter");
	expect(content.tree.textContent(content.id)).toBe("onetwox");
	expect(elementNamespace(content.tree.get(point))).toBe(svgNamespace);
	expect(serializeHtml(content.tree, point)).toBe(
		"<b></b><p><b>one</b>two</p>",
	);
	expect(
		elementNamespace(content.tree.get(select(content.tree, "p", content.id))),
	).toBe(htmlNamespace);
	expect(
		elementNamespace(content.tree.get(select(content.tree, "mi", content.id))),
	).toBe(mathmlNamespace);
	tree.close();
	expect(() => content.tree.namespaceOf(point)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

const encodings = [
	["TEXT/HTML", htmlNamespace],
	["application/xhtml+xml", htmlNamespace],
	[" text/html ", mathmlNamespace],
	["application/xml", mathmlNamespace],
] as const;

it.each(encodings)(
	"retains attribute-dependent annotation-xml integration for %s",
	(encoding, namespaceURI) => {
		const tree = parse(
			`<body><math><annotation-xml id=point encoding="${encoding}"><input id=child></input><svg id=nested><g /></svg></annotation-xml><mi id=after>x</mi></math><p>end</p>`,
		);
		const point = select(tree, "#point");
		const child = select(tree, "#child");
		expect(tree.get(point).attributes.encoding).toBe(encoding);
		expect(elementNamespace(tree.get(point))).toBe(mathmlNamespace);
		expect(elementNamespace(tree.get(child))).toBe(namespaceURI);
		expect(tree.parentOf(child)).toBe(point);
		expect(tree.parentOf(select(tree, "#nested"))).toBe(point);
		expect(elementNamespace(tree.get(select(tree, "#nested")))).toBe(
			svgNamespace,
		);
		expect(elementNamespace(tree.get(select(tree, "#after")))).toBe(
			mathmlNamespace,
		);
		expect(tree.textContent(tree.root)).toBe("xend");
	},
);

it.each(encodings)(
	"retains virtual annotation-xml context attributes for %s",
	(encoding, namespaceURI) => {
		const { tree, fragment: root } = fragment(
			"<input id=child></input><svg id=nested><g /></svg>",
			{
				tagName: "annotation-xml",
				namespaceURI: mathmlNamespace,
				attributes: { encoding },
			},
		);
		const child = select(tree, "#child", root);
		const nested = select(tree, "#nested", root);
		expect(elementNamespace(tree.get(child))).toBe(namespaceURI);
		expect(elementNamespace(tree.get(nested))).toBe(svgNamespace);
		expect(tree.parentOf(child)).toBe(root);
		expect(tree.parentOf(nested)).toBe(root);
		expect(tree.parentOf(root)).toBeNull();
		expect(tree.isConnected(child)).toBe(false);
		expect(tree.textContent(root)).toBe("");
	},
);

it("preserves reconstruction node quotas and closes the failed parse", () => {
	let failedTree: DocumentTree | undefined;
	let failure: unknown;
	try {
		parseHtmlDocument("<p><b>one</p>two", url, {
			limits: { maxNodes: 8 },
			initializeDocument(tree) {
				failedTree = tree;
				trees.push(tree);
			},
		});
	} catch (error) {
		failure = error;
	}
	expect(failure).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(failure)).toEqual({
		kind: "document.nodes",
		unit: "nodes",
		limit: 8,
		observed: 9,
	});
	if (!failedTree) throw new Error("Expected initialized tree");
	const tree = failedTree;
	expect(() => tree.namespaceOf(tree.root)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("retains cancellation during formatting repair and closes the partial tree", () => {
	const controller = new AbortController();
	let failedTree: DocumentTree | undefined;
	let boldInsertions = 0;
	expect(() =>
		parseHtmlDocument("<b><p>one</b>two</p>", url, {
			signal: controller.signal,
			initializeDocument(tree) {
				failedTree = tree;
				trees.push(tree);
				tree.onChange((change) => {
					if (
						change.kind === "insert" &&
						tree.elementInfo(change.target).tagName === "b" &&
						++boldInsertions === 2
					)
						controller.abort();
				});
			},
		}),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	expect(controller.signal.aborted).toBe(true);
	if (!failedTree) throw new Error("Expected initialized tree");
	const tree = failedTree;
	expect(() => tree.namespaceOf(tree.root)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("keeps pre-abort precedence over parsing quotas", () => {
	const controller = new AbortController();
	controller.abort();
	const initializeDocument = vi.fn();
	let failure: unknown;
	try {
		parseHtmlDocument("<b><p>one</b>two</p>", url, {
			signal: controller.signal,
			limits: { maxTextCodeUnits: 1 },
			initializeDocument,
		});
	} catch (error) {
		failure = error;
	}
	expect(failure).toMatchObject({
		code: "aborted",
		message: "HTML parsing aborted",
	});
	expect(resourceLimitDiagnostic(failure)).toBeUndefined();
	expect(initializeDocument).not.toHaveBeenCalled();
});
