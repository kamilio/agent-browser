import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import * as htmlAttributes from "./html-attributes.js";
import { HtmlForeign, type HtmlForeignContext } from "./html-foreign.js";
import type { HtmlParserNode } from "./html-formatting.js";
import { htmlParseInfo } from "./html-info.js";
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
	const queries = new DocumentQueries(tree);
	try {
		const id = queries.querySelector(selector, root);
		if (id === null) throw new Error(`Missing fixture ${selector}`);
		return id;
	} finally {
		queries.close();
	}
}

function foreignState(context?: HtmlForeignContext, maxWork = 100) {
	const tree = document();
	const stack: HtmlParserNode[] = [
		{ tree, id: tree.createFragment(), tag: context?.tagName ?? "body" },
	];
	const check = vi.fn();
	const text = vi.fn();
	const foreign = new HtmlForeign({
		stack: () => stack,
		context,
		insert() {
			throw new Error("Unexpected foreign insertion");
		},
		text,
		issue: vi.fn(),
		check,
		maxWork,
	});
	return { tree, stack, foreign, check, text };
}

function expectNamespaceOnly(tree: DocumentTree, read: () => void) {
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	const spies = [
		vi.spyOn(tree, "get"),
		vi.spyOn(tree, "elementInfo"),
		vi.spyOn(htmlAttributes, "snapshotHtmlAttributes"),
		vi.spyOn(htmlAttributes, "htmlAttributeEntries"),
		vi.spyOn(htmlAttributes, "htmlAttributeNames"),
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
	["div", htmlNamespace],
	["linearGradient", svgNamespace],
	["annotation-xml", mathmlNamespace],
])(
	"reads the active %s namespace without attribute snapshots",
	(tag, namespace) => {
		const { tree, stack, foreign } = foreignState();
		const id = tree.createParserElement(
			tag,
			{ encoding: "TEXT/HTML", ["__proto__"]: "safe", constructor: "ordinary" },
			namespace,
		);
		stack.push({ tree, id, tag });
		const current = foreign.current();
		expect(elementNamespace(current)).toBe(namespace);
		expectNamespaceOnly(tree, () => {
			for (let count = 0; count < 3; count++)
				expect(foreign.currentNamespace()).toBe(elementNamespace(current));
		});
		expect(foreign.current()).toStrictEqual(current);
	},
);

it.each<HtmlForeignContext>([
	{ tagName: "body" },
	{ tagName: "template", namespaceURI: htmlNamespace },
	{ tagName: "svg", namespaceURI: svgNamespace },
	{ tagName: "mi", namespaceURI: mathmlNamespace },
	{
		tagName: "annotation-xml",
		namespaceURI: mathmlNamespace,
		attributes: { encoding: "APPLICATION/XHTML+XML", ["__proto__"]: "safe" },
	},
])(
	"uses the virtual fragment context $tagName without reading its root",
	(context) => {
		const { tree, foreign } = foreignState(context);
		const namespaceOf = vi.spyOn(tree, "namespaceOf");
		expect(foreign.current()).toBe(context);
		expectNamespaceOnly(tree, () => {
			expect(foreign.currentNamespace()).toBe(elementNamespace(context));
		});
		expect(namespaceOf).not.toHaveBeenCalled();
	},
);

it("does not access annotation-xml context attributes for namespace-only reads", () => {
	const attributes = vi.fn(() => ({ encoding: "text/html" }));
	const context = {
		tagName: "annotation-xml",
		namespaceURI: mathmlNamespace,
		get attributes() {
			return attributes();
		},
	};
	const { tree, foreign } = foreignState(context);
	expectNamespaceOnly(tree, () => {
		expect(foreign.currentNamespace()).toBe(mathmlNamespace);
	});
	expect(attributes).not.toHaveBeenCalled();
	expect(foreign.process({ kind: "text", data: "integrated" })).toBe(false);
	expect(attributes).toHaveBeenCalled();
});

it("tracks live stack owners, replacement entries and restored context without caching", () => {
	const context = { tagName: "svg", namespaceURI: svgNamespace };
	const { tree, stack, foreign } = foreignState(context);
	const other = document();
	const html = tree.createElement("span");
	const math = other.createParserElement("mi", {}, mathmlNamespace);
	const expectCurrent = (namespace: string) => {
		expect(foreign.currentNamespace()).toBe(namespace);
		expect(foreign.currentNamespace()).toBe(
			elementNamespace(foreign.current()),
		);
	};
	expectCurrent(svgNamespace);
	stack.push({ tree, id: html, tag: "span" });
	expectCurrent(htmlNamespace);
	stack[1] = { tree: other, id: math, tag: "mi" };
	expectCurrent(mathmlNamespace);
	stack.pop();
	expectCurrent(svgNamespace);
	context.namespaceURI = mathmlNamespace;
	expectCurrent(mathmlNamespace);
});

it("preserves non-element fallback, invalid-ID errors and close precedence", () => {
	const { tree, stack, foreign } = foreignState();
	expect(foreign.currentNamespace()).toBe(htmlNamespace);
	expect(foreign.currentNamespace()).toBe(elementNamespace(foreign.current()));
	stack[0].id = -1;
	for (const read of [
		() => foreign.current(),
		() => foreign.currentNamespace(),
	])
		expect(read).toThrow(expect.objectContaining({ code: "not-found" }));
	tree.close();
	for (const read of [
		() => foreign.current(),
		() => foreign.currentNamespace(),
	])
		expect(read).toThrow(expect.objectContaining({ code: "closed" }));
});

it("keeps virtual context reads independent of closed or invalid root IDs", () => {
	const context = { tagName: "svg", namespaceURI: svgNamespace };
	const { tree, stack, foreign } = foreignState(context);
	stack[0].id = -1;
	tree.close();
	expect(foreign.current()).toBe(context);
	expect(foreign.currentNamespace()).toBe(svgNamespace);
	stack.push({ tree, id: -1, tag: "g" });
	expect(() => foreign.currentNamespace()).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("skips current and foreign work for HTML but retains the foreign work limit", () => {
	const { tree, stack, foreign, check, text } = foreignState(undefined, 0);
	const svg = tree.createParserElement("svg", {}, svgNamespace);
	const current = vi.spyOn(foreign, "current");
	expectNamespaceOnly(tree, () => {
		expect(foreign.process({ kind: "text", data: "html" })).toBe(false);
		expect(
			foreign.process({
				kind: "start",
				name: "div",
				attributes: {},
				selfClosing: false,
			}),
		).toBe(false);
	});
	expect(current).not.toHaveBeenCalled();
	expect(check).not.toHaveBeenCalled();
	stack.push({ tree, id: svg, tag: "svg" });
	expect(() => foreign.process({ kind: "text", data: "foreign" })).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "HTML foreign content work limit exceeded",
		}),
	);
	expect(current).toHaveBeenCalledTimes(1);
	expect(check).toHaveBeenCalledTimes(1);
	expect(text).not.toHaveBeenCalled();
});

it.each(["document", "fragment"])(
	"parses pure HTML %s content without current or elementInfo reads",
	(mode) => {
		const current = vi.spyOn(HtmlForeign.prototype, "current");
		const info = vi.spyOn(DocumentTree.prototype, "elementInfo");
		const source =
			"<main z=last 10=ten 2=two __proto__=safe constructor=ordinary tostring=literal a=first><section><!--kept--><p>A &amp; B<br><input value=ok></p></section></main>";
		const parsed =
			mode === "fragment"
				? fragment(source, { tagName: "body" })
				: { tree: parse(source), fragment: undefined };
		expect(current).not.toHaveBeenCalled();
		expect(info).not.toHaveBeenCalled();
		current.mockRestore();
		info.mockRestore();
		const root = parsed.fragment ?? select(parsed.tree, "body");
		expect(serializeHtml(parsed.tree, root)).toBe(
			'<main z="last" 10="ten" 2="two" __proto__="safe" constructor="ordinary" tostring="literal" a="first"><section><!--kept--><p>A &amp; B<br><input value="ok"></p></section></main>',
		);
		const main = parsed.tree.get(select(parsed.tree, "main", root));
		expect(Object.hasOwn(main.attributes, "__proto__")).toBe(true);
		expect(main.attributes.__proto__).toBe("safe");
		expect(main.attributes.constructor).toBe("ordinary");
		expect(Object.getPrototypeOf(main.attributes)).toBe(Object.prototype);
	},
);

it("checks HTML template fragment roots without requesting their template content", () => {
	const current = vi.spyOn(HtmlForeign.prototype, "current");
	const info = vi.spyOn(DocumentTree.prototype, "elementInfo");
	const content = vi.spyOn(DocumentTree.prototype, "templateContent");
	const { tree, fragment: root } = fragment("<tr><td>one<td>two", {
		tagName: "template",
	});
	expect(current).not.toHaveBeenCalled();
	expect(info).toHaveBeenCalledWith(root);
	expect(content).not.toHaveBeenCalled();
	expect(serializeHtml(tree, root)).toBe("<tr><td>one</td><td>two</td></tr>");
	expect(tree.get(root).kind).toBe("fragment");
});

it("retains nested template owners and restricts HTML information reads to templates", () => {
	const original = DocumentTree.prototype.elementInfo;
	const info = vi
		.spyOn(DocumentTree.prototype, "elementInfo")
		.mockImplementation(function (this: DocumentTree, id: number) {
			const result = original.call(this, id);
			expect(result).toMatchObject({ kind: "element", tagName: "template" });
			return result;
		});
	const current = vi.spyOn(HtmlForeign.prototype, "current");
	const tree = parse(
		"<body><template id=outer>before<template id=inner><p>inert</p></template>after</template><p>visible</p>",
	);
	expect(info).toHaveBeenCalled();
	expect(current).not.toHaveBeenCalled();
	info.mockRestore();
	current.mockRestore();
	expect(serializeHtml(tree, select(tree, "body"))).toBe(
		'<template id="outer">before<template id="inner"><p>inert</p></template>after</template><p>visible</p>',
	);
	const outer = tree.templateContent(select(tree, "#outer"));
	const innerId = select(outer.tree, "#inner", outer.id);
	const inner = outer.tree.templateContent(innerId);
	expect(outer.tree.isTemplateContentsDocument).toBe(true);
	expect(inner.tree.isTemplateContentsDocument).toBe(true);
	expect(serializeHtml(inner.tree, inner.id)).toBe("<p>inert</p>");
	expect(tree.textContent(tree.root)).toBe("visible");
});

it("keeps SVG template lookalikes and template fragment contexts in the foreign tree", () => {
	const content = vi.spyOn(DocumentTree.prototype, "templateContent");
	const tree = parse("<svg><template>before<g />after</template></svg>");
	const parsed = fragment("before<g />after", {
		tagName: "template",
		namespaceURI: svgNamespace,
	});
	expect(content).not.toHaveBeenCalled();
	content.mockRestore();
	expect(serializeHtml(tree, select(tree, "body"))).toBe(
		"<svg><template>before<g></g>after</template></svg>",
	);
	expect(serializeHtml(parsed.tree, parsed.fragment)).toBe(
		"before<g></g>after",
	);
	const template = select(tree, "template");
	expect(tree.namespaceOf(template)).toBe(svgNamespace);
	expect(tree.parentOf(select(tree, "g"))).toBe(template);
	expect(
		parsed.tree.namespaceOf(select(parsed.tree, "g", parsed.fragment)),
	).toBe(svgNamespace);
});

it.each([
	["TEXT/HTML", htmlNamespace, '<input id="child">'],
	["APPLICATION/XHTML+XML", htmlNamespace, '<input id="child">'],
	[" text/html ", mathmlNamespace, '<input id="child"></input>'],
])(
	"retains annotation-xml encoding %j in document and fragment parsing",
	(encoding, namespace, input) => {
		const source = '<input id=child /><svg viewbox="0 0 1 1" />';
		const tree = parse(
			`<math><annotation-xml encoding="${encoding}">${source}</annotation-xml></math>`,
		);
		const parsed = fragment(source, {
			tagName: "annotation-xml",
			namespaceURI: mathmlNamespace,
			attributes: { encoding },
		});
		const expected = `${input}<svg viewBox="0 0 1 1"></svg>`;
		expect(serializeHtml(tree, select(tree, "body"))).toBe(
			`<math><annotation-xml encoding="${encoding}">${expected}</annotation-xml></math>`,
		);
		expect(serializeHtml(parsed.tree, parsed.fragment)).toBe(expected);
		expect(tree.namespaceOf(select(tree, "#child"))).toBe(namespace);
		expect(
			parsed.tree.namespaceOf(select(parsed.tree, "#child", parsed.fragment)),
		).toBe(namespace);
		expect(tree.namespaceOf(select(tree, "svg"))).toBe(svgNamespace);
	},
);

it.each(["foreignObject", "desc", "title"])(
	"restores SVG namespace after the %s HTML integration point",
	(tag) => {
		const tree = parse(
			`<svg><${tag}><input id=html><svg><g /></svg></${tag}><path /></svg>`,
		);
		expect(serializeHtml(tree, select(tree, "body"))).toBe(
			`<svg><${tag}><input id="html"><svg><g></g></svg></${tag}><path></path></svg>`,
		);
		expect(tree.namespaceOf(select(tree, "#html"))).toBe(htmlNamespace);
		for (const selector of [tag, "g", "path"])
			expect(tree.namespaceOf(select(tree, selector))).toBe(svgNamespace);
	},
);

it("preserves MathML text integration and mglyph/malignmark exceptions", () => {
	const tree = parse(
		"<math><mtext>text<mglyph /><malignmark /><input id=html><math><mrow /></math></mtext><mi>x</mi></math>",
	);
	expect(serializeHtml(tree, select(tree, "body"))).toBe(
		'<math><mtext>text<mglyph></mglyph><malignmark></malignmark><input id="html"><math><mrow></mrow></math></mtext><mi>x</mi></math>',
	);
	expect(tree.namespaceOf(select(tree, "#html"))).toBe(htmlNamespace);
	for (const selector of ["mtext", "mglyph", "malignmark", "mrow", "mi"])
		expect(tree.namespaceOf(select(tree, selector))).toBe(mathmlNamespace);
});

it("switches CDATA handling with the live namespace, including fragment context", () => {
	const tree = parse(
		"<svg><![CDATA[<g>&amp;]]><title><![CDATA[<b>]]><span><![CDATA[html]]></span></title><![CDATA[tail]]></svg><p><![CDATA[end]]></p>",
	);
	expect(serializeHtml(tree, select(tree, "body"))).toBe(
		"<svg>&lt;g&gt;&amp;amp;<title>&lt;b&gt;<span><!--[CDATA[html]]--></span></title>tail</svg><p><!--[CDATA[end]]--></p>",
	);
	expect(htmlParseInfo(tree)?.issues["cdata-in-html-content"]).toBe(2);
	const parsed = fragment("<![CDATA[<g>&amp;]]>", {
		tagName: "svg",
		namespaceURI: svgNamespace,
	});
	expect(serializeHtml(parsed.tree, parsed.fragment)).toBe(
		"&lt;g&gt;&amp;amp;",
	);
	expect(parsed.tree.textContent(parsed.fragment)).toBe("<g>&amp;");
});

it("retains foreign breakout, case-adjusted end tags and misnested ancestor popping", () => {
	const tree = parse(
		"<svg><lineargradient><stop></LINEARGRADIENT><g><div>out</div><svg><g></br><p>end</p>",
	);
	expect(serializeHtml(tree, select(tree, "body"))).toBe(
		"<svg><linearGradient><stop></stop></linearGradient><g></g></svg><div>out</div><svg><g></g></svg><br><p>end</p>",
	);
	expect(htmlParseInfo(tree)?.issues["mismatched-foreign-end-tag"]).toBe(1);
	expect(
		htmlParseInfo(tree)?.issues["html-breakout-from-foreign-content"],
	).toBe(2);
	expect(tree.namespaceOf(select(tree, "linearGradient"))).toBe(svgNamespace);
	for (const selector of ["div", "br", "p"])
		expect(tree.namespaceOf(select(tree, selector))).toBe(htmlNamespace);
});

it("retains the ignored HTML token budget and closes the tree on overflow", () => {
	const source = `<body>${"</missing>".repeat(31)}`;
	const accepted = parseHtmlDocument(source, url, { limits: { maxNodes: 4 } });
	trees.push(accepted);
	expect(serializeHtml(accepted)).toBe(
		"<html><head></head><body></body></html>",
	);
	let failedTree: DocumentTree | undefined;
	let failure: unknown;
	try {
		parseHtmlDocument(`${source}</missing>`, url, {
			limits: { maxNodes: 4 },
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
		kind: "html.tokens",
		unit: "tokens",
		limit: 32,
		observed: 33,
	});
	if (!failedTree) throw new Error("Expected initialized tree");
	const tree = failedTree;
	expect(() => tree.namespaceOf(tree.root)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("retains cancellation after entering foreign content and closes the partial tree", () => {
	const controller = new AbortController();
	let failedTree: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument("<svg><g />after</svg><p>unreached</p>", url, {
			signal: controller.signal,
			initializeDocument(tree) {
				failedTree = tree;
				trees.push(tree);
				tree.onChange((change) => {
					if (
						change.kind === "insert" &&
						tree.namespaceOf(change.target) === svgNamespace
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

it("retains pre-abort precedence over the source budget", () => {
	const controller = new AbortController();
	controller.abort();
	const initializeDocument = vi.fn();
	expect(() =>
		parseHtmlDocument("<svg><g /></svg>", url, {
			signal: controller.signal,
			limits: { maxTextCodeUnits: 1 },
			initializeDocument,
		}),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	expect(initializeDocument).not.toHaveBeenCalled();
});
