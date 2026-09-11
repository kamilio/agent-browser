import { afterEach, expect, it, vi } from "vitest";
import { type DocumentNode, DocumentTree } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	isHtmlElement,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import {
	insertAdjacentHtml,
	setInnerHtml,
	setOuterHtml,
} from "./html-content.js";
import { foreignAttributes, foreignName } from "./html-foreign.js";
import {
	HtmlFormatting,
	type HtmlParserNode,
	isHtmlParserNode,
	isHtmlScopeBoundary,
	isHtmlSpecial,
} from "./html-formatting.js";
import { htmlParseInfo } from "./html-info.js";
import {
	type HtmlFragmentContext,
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { HtmlScope } from "./html-scope.js";
import { HtmlTables } from "./html-tables.js";
import { HtmlTokenizer } from "./html-tokenizer.js";

const trees: DocumentTree[] = [];
const url = "https://example.test/";

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function document(source: string) {
	const tree = parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function fragment(source: string, context: HtmlFragmentContext) {
	const parsed = parseHtmlFragment(source, url, context);
	trees.push(parsed.tree);
	return parsed;
}

function elements(tree: DocumentTree, root = tree.root): DocumentNode[] {
	return tree.get(root).children.flatMap((id) => {
		const node = tree.get(id);
		return [...(node.kind === "element" ? [node] : []), ...elements(tree, id)];
	});
}

function byId(tree: DocumentTree, id: string): DocumentNode {
	const node = elements(tree).find((entry) => entry.attributes.id === id);
	if (!node) throw new Error(`Missing fixture ${id}`);
	return node;
}

it("creates real foreign namespaces and adjusted names without relabeling HTML", () => {
	const tree = document(
		'<svg id=svg viewbox="0 0 10 10" preserveaspectratio="none"><lineargradient id=gradient><stop /></lineargradient><textpath id=text  /></svg><math id=math definitionurl="x"><mi>x</mi></math><input id=input>',
	);
	expect(byId(tree, "svg")).toMatchObject({
		namespaceURI: svgNamespace,
		tagName: "svg",
		attributes: { viewBox: "0 0 10 10", preserveAspectRatio: "none" },
	});
	expect(byId(tree, "gradient")).toMatchObject({
		namespaceURI: svgNamespace,
		tagName: "linearGradient",
	});
	expect(byId(tree, "text")).toMatchObject({
		namespaceURI: svgNamespace,
		tagName: "textPath",
	});
	expect(byId(tree, "math")).toMatchObject({
		namespaceURI: mathmlNamespace,
		attributes: { definitionURL: "x" },
	});
	expect(isHtmlElement(byId(tree, "input"), "input")).toBe(true);
});

it("covers every recorded SVG tag adjustment and preserves unknown lowercase names", () => {
	const names =
		"altGlyph altGlyphDef altGlyphItem animateColor animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject glyphRef linearGradient radialGradient textPath".split(
			" ",
		);
	expect(names).toHaveLength(37);
	const tree = document(
		`<svg>${names.map((name) => `<${name.toLowerCase()} />`).join("")}<CUSTOM /></svg>`,
	);
	expect(
		elements(tree)
			.filter((node) => elementNamespace(node) === svgNamespace)
			.map((node) => node.tagName),
	).toEqual(["svg", ...names, "custom"]);
	expect(foreignName("lineargradient", mathmlNamespace)).toBe("lineargradient");
});

it("adjusts only namespace-specific attributes and retains the first duplicate", () => {
	const tree = document(
		"<svg viewbox=first VIEWBOX=second definitionurl=svg data-CUSTOM=x><input id=foreign value=one><g id=child /></input></svg><math viewbox=math definitionurl=math><input id=mathinput  /></math>",
	);
	const svg = elements(tree).find((node) => node.tagName === "svg");
	expect(svg?.attributes).toMatchObject({
		viewBox: "first",
		definitionurl: "svg",
		"data-custom": "x",
	});
	expect(byId(tree, "foreign").namespaceURI).toBe(svgNamespace);
	expect(isHtmlElement(byId(tree, "foreign"), "input")).toBe(false);
	expect(byId(tree, "child").parent).toBe(byId(tree, "foreign").id);
	expect(byId(tree, "mathinput").namespaceURI).toBe(mathmlNamespace);
	expect(
		foreignAttributes(
			{ viewbox: "x", definitionurl: "y", "xlink:href": "#ref" },
			mathmlNamespace,
		),
	).toEqual({ viewbox: "x", definitionURL: "y", "xlink:href": "#ref" });
});

it("applies all recorded SVG attribute adjustments", () => {
	const names =
		"attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits diffuseConstant edgeMode filterUnits glyphRef gradientTransform gradientUnits kernelMatrix kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur requiredExtensions requiredFeatures specularConstant specularExponent spreadMethod startOffset stdDeviation stitchTiles surfaceScale systemLanguage tableValues targetX targetY textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan".split(
			" ",
		);
	expect(names).toHaveLength(58);
	const tree = document(
		`<svg id=root ${names.map((name) => `${name.toLowerCase()}=value`).join(" ")}></svg>`,
	);
	expect(Object.keys(byId(tree, "root").attributes)).toEqual(["id", ...names]);
});

it("reports namespace declaration mismatches without changing parser namespaces", () => {
	const tree = document(
		'<svg id=svg xmlns="wrong" xmlns:xlink="wrong"><g id=child xmlns="" /></svg><math id=math xmlns="http://www.w3.org/2000/svg" />',
	);
	expect(byId(tree, "svg").namespaceURI).toBe(svgNamespace);
	expect(byId(tree, "child").namespaceURI).toBe(svgNamespace);
	expect(byId(tree, "math").namespaceURI).toBe(mathmlNamespace);
	expect(htmlParseInfo(tree)?.issues["foreign-namespace-mismatch"]).toBe(4);
	expect(() =>
		fragment("", { tagName: "svg", namespaceURI: "invalid" }),
	).toThrow("Invalid HTML fragment namespace");
});

it("retains xml/xlink/xmlns namespace metadata but not arbitrary colon attributes", () => {
	const tree = document(
		'<svg id=root xml:lang=en xml:space=preserve xml:base=base xlink:href="#ref" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" custom:href=x></svg>',
	);
	const root = byId(tree, "root").id;
	for (const [name, prefix, localName, namespaceURI] of [
		["xml:lang", "xml", "lang", "http://www.w3.org/XML/1998/namespace"],
		["xml:space", "xml", "space", "http://www.w3.org/XML/1998/namespace"],
		["xml:base", "xml", "base", "http://www.w3.org/XML/1998/namespace"],
		["xlink:href", "xlink", "href", "http://www.w3.org/1999/xlink"],
		["xmlns", null, "xmlns", "http://www.w3.org/2000/xmlns/"],
		["xmlns:xlink", "xmlns", "xlink", "http://www.w3.org/2000/xmlns/"],
	] as const) {
		const attribute = tree.getAttributeNode(root, name);
		expect(attribute).not.toBeNull();
		expect(tree.getAttributeRecord(attribute as number)).toMatchObject({
			prefix,
			localName,
			namespaceURI,
		});
	}
	const arbitrary = tree.getAttributeNode(root, "custom:href");
	expect(
		tree.getAttributeRecord(arbitrary as number).namespaceURI ?? null,
	).toBeNull();
});

it("recognizes all 44 recorded HTML breakout starts", () => {
	const names =
		"b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img li listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var".split(
			" ",
		);
	expect(names).toHaveLength(44);
	for (const name of names) {
		const tree = document(`<svg id=root><g><${name} id=breakout>`);
		expect(
			htmlParseInfo(tree)?.issues["html-breakout-from-foreign-content"],
		).toBe(1);
		expect(
			elements(tree, byId(tree, "root").id).map((node) => node.tagName),
		).toEqual(["g"]);
	}
});

it.each(["foreignObject", "desc", "title"])(
	"uses the SVG %s HTML integration point",
	(name) => {
		const tree = document(
			`<svg><${name} id=point><input id=html><svg id=nested><g /></svg><span id=span>text</span></${name}><g id=after /></svg>`,
		);
		expect(byId(tree, "point").namespaceURI).toBe(svgNamespace);
		expect(isHtmlElement(byId(tree, "html"), "input")).toBe(true);
		expect(byId(tree, "html").parent).toBe(byId(tree, "point").id);
		expect(byId(tree, "nested").namespaceURI).toBe(svgNamespace);
		expect(byId(tree, "span").parent).toBe(byId(tree, "point").id);
		expect(byId(tree, "after").namespaceURI).toBe(svgNamespace);
	},
);

it.each(["mi", "mo", "mn", "ms", "mtext"])(
	"integrates MathML %s text except mglyph and malignmark starts",
	(name) => {
		const tree = document(
			`<math><${name} id=point><mglyph id=glyph /><malignmark id=mark /><input id=html><math id=nested><mrow /></math></${name}><mrow id=after /></math>`,
		);
		for (const id of ["point", "glyph", "mark", "nested", "after"])
			expect(byId(tree, id).namespaceURI).toBe(mathmlNamespace);
		expect(isHtmlElement(byId(tree, "html"), "input")).toBe(true);
		expect(byId(tree, "html").parent).toBe(byId(tree, "point").id);
	},
);

it.each([
	"text/html",
	"TEXT/HTML",
	"application/xhtml+xml",
	"APPLICATION/XHTML+XML",
])("integrates annotation-xml with encoding %s", (encoding) => {
	const tree = document(
		`<math><annotation-xml id=point encoding="${encoding}"><input id=html><svg id=svg /></annotation-xml></math>`,
	);
	expect(isHtmlElement(byId(tree, "html"), "input")).toBe(true);
	expect(byId(tree, "svg").namespaceURI).toBe(svgNamespace);
});

it("does not trim encoding or infer integration from an unqualified name", () => {
	const tree = document(
		'<math><annotation-xml encoding=" text/html "><input id=foreign /><svg id=svg><g /></svg></annotation-xml></math><svg><mi><input id=svginput /></mi><math id=notmath /></svg>',
	);
	expect(byId(tree, "foreign").namespaceURI).toBe(mathmlNamespace);
	expect(byId(tree, "svg").namespaceURI).toBe(svgNamespace);
	expect(byId(tree, "svginput").namespaceURI).toBe(svgNamespace);
	expect(byId(tree, "notmath").namespaceURI).toBe(svgNamespace);
});

it("breaks out for HTML starts and end p/br while retaining the stopping integration point", () => {
	const tree = document(
		"<svg id=svg><g><div id=div>HTML</div><input id=html><svg id=other><g></p><br id=br><svg><g></br><p id=last>x</p>",
	);
	expect(byId(tree, "div").parent).toBe(byId(tree, "svg").parent);
	for (const id of ["div", "html", "br", "last"])
		expect(isHtmlElement(byId(tree, id))).toBe(true);
	expect(
		htmlParseInfo(tree)?.issues["html-breakout-from-foreign-content"],
	).toBe(3);
	const nested = document(
		"<svg><foreignObject id=point><svg><g><span id=html>text</span></foreignObject><g id=after /></svg>",
	);
	expect(byId(nested, "html").parent).toBe(byId(nested, "point").id);
	expect(byId(nested, "after").namespaceURI).toBe(svgNamespace);
});

it.each(["color", "face", "size"])(
	"breaks out for font only when %s is present",
	(attribute) => {
		const tree = document(
			`<svg id=root><font id=foreign /><font ${attribute} id=html>text</font>`,
		);
		expect(byId(tree, "foreign").namespaceURI).toBe(svgNamespace);
		expect(isHtmlElement(byId(tree, "html"), "font")).toBe(true);
		expect(byId(tree, "html").parent).toBe(byId(tree, "root").parent);
	},
);

it("matches foreign end names ASCII-insensitively and pops misnested foreign ancestors", () => {
	const tree = document(
		"<svg><lineargradient id=first><stop></LINEARGRADIENT><g id=second><path></g><circle id=third /></svg><p id=html>done",
	);
	const parent = byId(tree, "first").parent;
	expect(byId(tree, "second").parent).toBe(parent);
	expect(byId(tree, "third").parent).toBe(parent);
	expect(isHtmlElement(byId(tree, "html"))).toBe(true);
	expect(htmlParseInfo(tree)?.issues["mismatched-foreign-end-tag"]).toBe(2);
});

it("preserves CDATA literally only while the adjusted current node is foreign", () => {
	const tree = document(
		"<svg id=svg>A<![CDATA[<g>&amp;\0]]>B<title id=title><![CDATA[<b>&amp;]]><span id=span><![CDATA[html]]></span></title></svg><div id=html><![CDATA[html]]></div>",
	);
	expect(tree.textContent(byId(tree, "svg").id)).toBe(
		"A<g>&amp;\ufffdB<b>&amp;",
	);
	expect(tree.get(byId(tree, "svg").children[0]).data).toBe("A<g>&amp;\ufffdB");
	for (const id of ["span", "html"]) {
		expect(tree.textContent(byId(tree, id).id)).toBe("");
		expect(tree.get(byId(tree, id).children[0])).toMatchObject({
			kind: "comment",
			data: "[CDATA[html]]",
		});
	}
	expect(htmlParseInfo(tree)?.issues["cdata-in-html-content"]).toBe(2);
});

it.each(["", "]", "]]", "]]]"])(
	"preserves CDATA EOF suffix %j and reports truncation",
	(suffix) => {
		const tree = document(`<svg id=root><![CDATA[text${suffix}`);
		expect(tree.textContent(byId(tree, "root").id)).toBe(`text${suffix}`);
		expect(htmlParseInfo(tree)?.issues["unterminated-cdata"]).toBe(1);
	},
);

it("retries CDATA delimiters across tokenizer insertion boundaries without decoding", () => {
	for (let boundary = 1; boundary < 22; boundary++) {
		const source = "<![CDATA[&amp;<g>]]><p>";
		const issues: string[] = [];
		const tokenizer = new HtmlTokenizer(source, (code) => issues.push(code));
		tokenizer.setBoundary(boundary);
		const first = tokenizer.next(true);
		if (boundary < 19) {
			expect(first).toBeUndefined();
			expect(tokenizer.paused).toBe(true);
		}
		tokenizer.setBoundary(undefined);
		expect(first ?? tokenizer.next(true)).toEqual({
			kind: "text",
			data: "&amp;<g>",
		});
		expect(tokenizer.next(true)).toMatchObject({ kind: "start", name: "p" });
		expect(issues).toEqual([]);
	}
});

it("uses namespace-sensitive fragment contexts rather than the svg/math spelling", () => {
	for (const tagName of ["svg", "math"]) {
		const parsed = fragment("<input id=child><lineargradient id=next />", {
			tagName,
		});
		expect(
			elements(parsed.tree, parsed.fragment).every((node) =>
				isHtmlElement(node),
			),
		).toBe(true);
	}
	for (const namespaceURI of [svgNamespace, mathmlNamespace]) {
		const parsed = fragment("</svg><input /><lineargradient />", {
			tagName: "svg",
			namespaceURI,
		});
		const children = elements(parsed.tree, parsed.fragment);
		expect(children).toHaveLength(2);
		expect(
			children.every((node) => elementNamespace(node) === namespaceURI),
		).toBe(true);
		expect(children[1].tagName).toBe(
			namespaceURI === svgNamespace ? "linearGradient" : "lineargradient",
		);
	}
});

it("retains foreign fragment integration context, attributes and CDATA state", () => {
	for (const context of [
		{ tagName: "foreignObject", namespaceURI: svgNamespace },
		{ tagName: "title", namespaceURI: svgNamespace },
		{ tagName: "mi", namespaceURI: mathmlNamespace },
		{
			tagName: "annotation-xml",
			namespaceURI: mathmlNamespace,
			attributes: { encoding: "TEXT/HTML" },
		},
	]) {
		const parsed = fragment("<![CDATA[&amp;<x>]]><input /><svg />", context);
		expect(parsed.tree.textContent(parsed.fragment)).toBe("&amp;<x>");
		const children = elements(parsed.tree, parsed.fragment);
		expect(isHtmlElement(children[0], "input")).toBe(true);
		expect(children[1].namespaceURI).toBe(svgNamespace);
	}
});

it("does not enter HTML raw-text/template/table/select modes for foreign contexts", () => {
	for (const tagName of [
		"script",
		"style",
		"textarea",
		"template",
		"table",
		"select",
		"html",
	]) {
		const parsed = fragment("<input /><g />", {
			tagName,
			namespaceURI: svgNamespace,
		});
		expect(
			elements(parsed.tree, parsed.fragment).map((node) => [
				node.tagName,
				node.namespaceURI,
			]),
		).toEqual([
			["input", svgNamespace],
			["g", svgNamespace],
		]);
	}
});

it("bounds breakout at the virtual foreign fragment root and restores its context", () => {
	const parsed = fragment("<g><p>HTML</p><input />", {
		tagName: "svg",
		namespaceURI: svgNamespace,
	});
	const children = elements(parsed.tree, parsed.fragment);
	expect(
		children.map((node) => [node.tagName, elementNamespace(node)]),
	).toEqual([
		["g", svgNamespace],
		["p", htmlNamespace],
		["input", svgNamespace],
	]);
});

it("keeps foreign scripts inert while HTML integration scripts retain their hook", async () => {
	const scripts: number[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<svg><script id=svg><![CDATA[throw 1]]></script><script id=empty /><foreignObject><script id=html>ok</script></foreignObject></svg><math><script id=math>bad</script></math>",
		url,
		{},
		{
			start() {},
			async script(_tree, id) {
				scripts.push(id);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(scripts).toEqual([byId(tree, "html").id]);
	expect(tree.textContent(byId(tree, "svg").id)).toBe("throw 1");
	expect(htmlParseInfo(tree)?.issues["foreign-script-not-executed"]).toBe(3);
});

it("retains CDATA tokenizer state across synthetic document.write boundaries", async () => {
	const scripts: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<script>write</script><p id=after>after</p>",
		url,
		{},
		{
			start() {},
			async script(document, id, context) {
				scripts.push(document.textContent(id));
				context.write("<svg id=svg><![CD");
				context.write("ATA[<g>&amp;]]");
				context.write("><script id=foreign /></svg>");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(scripts).toEqual(["write"]);
	expect(tree.textContent(byId(tree, "svg").id)).toBe("<g>&amp;");
	expect(byId(tree, "foreign").namespaceURI).toBe(svgNamespace);
	expect(isHtmlElement(byId(tree, "after"), "p")).toBe(true);
});

it("uses actual namespace and encoding for inner/outer/adjacent HTML insertion", () => {
	const tree = document(
		"<svg id=root><g id=old /></svg><math><annotation-xml id=point encoding=TEXT/HTML  /></math>",
	);
	const root = byId(tree, "root").id;
	setInnerHtml(
		tree,
		root,
		"<lineargradient id=gradient /><input id=foreign />",
	);
	expect(byId(tree, "gradient")).toMatchObject({
		namespaceURI: svgNamespace,
		tagName: "linearGradient",
	});
	setOuterHtml(tree, byId(tree, "foreign").id, "<textpath id=text />");
	expect(byId(tree, "text")).toMatchObject({
		namespaceURI: svgNamespace,
		tagName: "textPath",
	});
	insertAdjacentHtml(
		tree,
		root,
		"beforeend",
		"<foreignObject id=object><input id=html></foreignObject>",
	);
	expect(isHtmlElement(byId(tree, "html"), "input")).toBe(true);
	setInnerHtml(tree, byId(tree, "point").id, "<input id=annotation>");
	expect(isHtmlElement(byId(tree, "annotation"), "input")).toBe(true);
	const fake = tree.createElement("svg");
	tree.append(root, fake);
	setInnerHtml(tree, fake, "<input id=fake>");
	expect(isHtmlElement(byId(tree, "fake"), "input")).toBe(true);
});

it.each([{ maxNodes: 5 }, { maxDepth: 2 }, { maxTextCodeUnits: 10 }])(
	"enforces foreign source/node/depth limits and cleans candidates: %j",
	(limits) => {
		const close = vi.spyOn(DocumentTree.prototype, "close");
		try {
			expect(() =>
				parseHtmlDocument("<svg><g><path /><input /></g></svg>", url, {
					limits,
				}),
			).toThrow("limit");
			expect(close).toHaveBeenCalledTimes(1);
		} finally {
			close.mockRestore();
		}
	},
);

it("preserves frameset/frame rejection only in HTML namespace", () => {
	for (const name of ["frameset", "frame"]) {
		expect(() => document(`<${name}>`)).toThrow("not implemented");
		expect(() => fragment("", { tagName: name })).toThrow("not implemented");
		const tree = document(`<svg><${name} id=foreign /></svg>`);
		expect(byId(tree, "foreign").namespaceURI).toBe(svgNamespace);
	}
});

it("bounds repeated foreign end-tag scanning and tokenizer CDATA issues", () => {
	const close = vi.spyOn(DocumentTree.prototype, "close");
	try {
		expect(() =>
			parseHtmlDocument(
				`<svg>${"<g>".repeat(20)}${"</unknown>".repeat(150)}`,
				url,
				{ limits: { maxNodes: 32 } },
			),
		).toThrow("work limit");
		expect(close).toHaveBeenCalledTimes(1);
	} finally {
		close.mockRestore();
	}
	expect(() => new HtmlTokenizer("<![CDATA[x", () => {}, 0).next(true)).toThrow(
		"issue limit",
	);
	expect(() => new HtmlTokenizer("<![CDATA[x]]>", () => {}, 0).next()).toThrow(
		"issue limit",
	);
});

const integrationCases = [
	["svg", "foreignObject", ""],
	["svg", "desc", ""],
	["svg", "title", ""],
	["math", "mi", ""],
	["math", "mo", ""],
	["math", "mn", ""],
	["math", "ms", ""],
	["math", "mtext", ""],
	["math", "annotation-xml", "encoding=text/html"],
] as const;

it.each(integrationCases)(
	"retains HTML paragraph/list scope inside %s %s",
	(root, point, attributes) => {
		for (const tag of ["p", "li", "dd", "dt"]) {
			const tree = document(
				`<${tag} id=outer><${root}><${point} ${attributes} id=point><${tag} id=inner>text</${tag}><input id=after>`,
			);
			expect(byId(tree, "inner").parent).toBe(byId(tree, "point").id);
			expect(byId(tree, "after").parent).toBe(byId(tree, "point").id);
			expect(isHtmlElement(byId(tree, "inner"), tag)).toBe(true);
		}
	},
);

it.each(integrationCases)(
	"blocks ordinary and formatting end tags across %s %s",
	(root, point, attributes) => {
		for (const outer of ["g", "a"]) {
			const tree = document(
				`<${root}><${outer} id=outer><${point} ${attributes} id=point><span id=span></${outer}><input id=after>`,
			);
			expect(byId(tree, "after").parent).toBe(byId(tree, "span").id);
			expect(isHtmlElement(byId(tree, "after"), "input")).toBe(true);
			expect(elementNamespace(byId(tree, "outer"))).toBe(
				root === "svg" ? svgNamespace : mathmlNamespace,
			);
		}
	},
);

it.each(integrationCases)(
	"does not adopt formatting from outside %s %s",
	(root, point, attributes) => {
		const tree = document(
			`<b id=outer><${root}><${point} ${attributes} id=point><span id=span></b><input id=after></span></${point}></${root}></b><p id=tail>tail`,
		);
		expect(byId(tree, "after").parent).toBe(byId(tree, "span").id);
		expect(isHtmlElement(byId(tree, "after"), "input")).toBe(true);
		expect(
			elements(tree).filter((node) => isHtmlElement(node, "b")),
		).toHaveLength(1);
		expect(htmlParseInfo(tree)?.issues["formatting-end-out-of-scope"]).toBe(1);
	},
);

it.each(integrationCases)(
	"repairs local adoption inside %s %s without losing foreign ancestors",
	(root, point, attributes) => {
		const tree = document(
			`<${root} id=root><${point} ${attributes} id=point><b><p id=paragraph>x</b>y</p><input id=after></${point}><g id=tail /></${root}>`,
		);
		const boundary = byId(tree, "point");
		expect(boundary.children.map((id) => tree.get(id).tagName)).toEqual([
			"b",
			"p",
			"input",
		]);
		const paragraph = byId(tree, "paragraph");
		const clone = tree.get(paragraph.children[0]);
		expect(isHtmlElement(clone, "b")).toBe(true);
		expect(tree.textContent(clone.id)).toBe("x");
		expect(tree.textContent(paragraph.id)).toBe("xy");
		expect(byId(tree, "tail").parent).toBe(byId(tree, "root").id);
		expect(elementNamespace(byId(tree, "tail"))).toBe(
			root === "svg" ? svgNamespace : mathmlNamespace,
		);
	},
);

it.each(["desc", "title", "mi", "mtext", "annotation-xml"])(
	"distinguishes HTML ordinary ends from direct foreign %s ends",
	(point) => {
		const root = ["desc", "title"].includes(point) ? "svg" : "math";
		const tree = document(
			`<${root} id=root><${point} encoding=text/html><span id=span></${point}><input id=after /></${root}>`,
		);
		expect(byId(tree, "after").parent).toBe(byId(tree, "span").id);
		expect(isHtmlElement(byId(tree, "after"), "input")).toBe(true);
		const direct = document(
			`<${root} id=root><${point} encoding=text/html>text</${point}><input id=after /></${root}>`,
		);
		expect(byId(direct, "after").parent).toBe(byId(direct, "root").id);
		expect(elementNamespace(byId(direct, "after"))).toBe(
			root === "svg" ? svgNamespace : mathmlNamespace,
		);
	},
);

it.each([
	"tbody",
	"thead",
	"tfoot",
	"tr",
	"td",
	"th",
	"caption",
	"colgroup",
	"template",
])("ignores foreign %s when choosing HTML table context", (tag) => {
	const tree = document(
		`<svg><${tag}><foreignObject id=point><span><tr><td id=ignored>text</td></tr></span><p id=paragraph>body</p><input id=after>`,
	);
	expect(elements(tree).some((node) => node.attributes.id === "ignored")).toBe(
		false,
	);
	expect(byId(tree, "paragraph").parent).toBe(byId(tree, "point").id);
	expect(byId(tree, "after").parent).toBe(byId(tree, "point").id);
	expect(tree.textContent(byId(tree, "point").id)).toBe("textbody");
});

it.each(integrationCases)(
	"keeps HTML table scope distinct across %s %s",
	(root, point, attributes) => {
		const tree = document(
			`<table id=table><tr id=row><td id=first><${root}><td id=foreign><${point} ${attributes}><span></td><input type=hidden id=marker><td id=second>second</table><p id=after>after`,
		);
		expect(byId(tree, "foreign").parent).not.toBe(byId(tree, "row").id);
		expect(byId(tree, "marker").parent).toBe(byId(tree, "row").id);
		expect(byId(tree, "second").parent).toBe(byId(tree, "row").id);
		expect(byId(tree, "after").parent).toBe(byId(tree, "table").parent);
	},
);

it("restores the surrounding cell mode after a nested HTML table in foreign content", () => {
	const tree = document(
		"<table><tr><td id=cell><svg><foreignObject id=point><table id=inner><tr><td>nested</td></tr></table><p id=paragraph>inner</p></foreignObject></svg><p id=after>outer</p></td><td id=next>next</table>",
	);
	expect(byId(tree, "inner").parent).toBe(byId(tree, "point").id);
	expect(byId(tree, "paragraph").parent).toBe(byId(tree, "point").id);
	expect(byId(tree, "after").parent).toBe(byId(tree, "cell").id);
	expect(byId(tree, "next").parent).toBe(byId(tree, "cell").parent);
});

function stackFixture(definitions: readonly (readonly [string, string])[]) {
	const tree = new DocumentTree(url);
	trees.push(tree);
	const stack: HtmlParserNode[] = [{ tree, id: tree.root, tag: "body" }];
	for (const [tag, namespaceURI] of definitions) {
		const id = tree.createParserElement(tag, {}, namespaceURI);
		tree.append(stack[stack.length - 1].id, id);
		stack.push({ tree, id, tag });
	}
	const options = {
		stack: () => stack,
		reset() {},
		issue() {},
		check() {},
		maxWork: 10_000,
	};
	return { tree, stack, options, scope: new HtmlScope(options) };
}

it("uses namespace-qualified special/scope categories without changing string callers", () => {
	for (const [tag, namespaceURI] of [
		...["foreignObject", "desc", "title"].map(
			(tag) => [tag, svgNamespace] as const,
		),
		...["mi", "mo", "mn", "ms", "mtext", "annotation-xml"].map(
			(tag) => [tag, mathmlNamespace] as const,
		),
	]) {
		const { stack, scope } = stackFixture([
			["p", htmlNamespace],
			[tag, namespaceURI],
		]);
		expect(isHtmlSpecial(stack[2])).toBe(true);
		expect(isHtmlScopeBoundary(stack[2])).toBe(true);
		expect(scope.find("p")).toBe(-1);
		expect(scope.find(stack[2])).toBe(2);
		expect(scope.canEndBody()).toBe(false);
	}
	expect(isHtmlSpecial("title")).toBe(true);
	expect(isHtmlScopeBoundary("title")).toBe(false);
	expect(isHtmlSpecial("foreignObject")).toBe(false);
	expect(isHtmlScopeBoundary("mi")).toBe(false);
});

it("does not treat foreign HTML lookalikes as scope targets, boundaries or implied ends", () => {
	for (const namespaceURI of [svgNamespace, mathmlNamespace]) {
		for (const tag of [
			"p",
			"li",
			"dd",
			"dt",
			"h1",
			"option",
			"optgroup",
			"button",
			"ul",
			"ol",
			"table",
			"template",
			"select",
		]) {
			const { stack, scope } = stackFixture([
				["p", htmlNamespace],
				[tag, namespaceURI],
			]);
			expect(isHtmlParserNode(stack[2])).toBe(false);
			expect(isHtmlSpecial(stack[2])).toBe(false);
			expect(isHtmlScopeBoundary(stack[2])).toBe(false);
			expect(scope.find("p", "button")).toBe(1);
			expect(scope.find("p", "list")).toBe(1);
			expect(scope.find(tag)).toBe(tag === "p" ? 1 : -1);
			expect(scope.findHeading()).toBe(-1);
			scope.imply();
			expect(stack).toHaveLength(3);
		}
	}
});

it("does not confuse foreign boundary spellings across namespaces or case", () => {
	for (const [tag, namespaceURI] of [
		["mi", svgNamespace],
		["mtext", svgNamespace],
		["annotation-xml", svgNamespace],
		["foreignObject", mathmlNamespace],
		["desc", mathmlNamespace],
		["title", mathmlNamespace],
		["foreignobject", svgNamespace],
		["foreignObject", htmlNamespace],
		["mi", htmlNamespace],
		["g", svgNamespace],
	] as const) {
		const { stack, scope } = stackFixture([
			["p", htmlNamespace],
			[tag, namespaceURI],
		]);
		expect(isHtmlSpecial(stack[2])).toBe(false);
		expect(isHtmlScopeBoundary(stack[2])).toBe(false);
		expect(scope.find("p")).toBe(1);
	}
});

it("adopts through an ordinary foreign select without treating it as a special HTML element", () => {
	const { tree, stack, options } = stackFixture([
		["b", htmlNamespace],
		["select", svgNamespace],
		["p", htmlNamespace],
	]);
	const bold = stack[1];
	const foreign = stack[2];
	const paragraph = stack[3];
	tree.append(paragraph.id, tree.createText("text"));
	const formatter = new HtmlFormatting({
		...options,
		maxText: 10_000,
		insert: (tag, attributes) => ({
			tree,
			id: tree.createParserElement(tag, attributes),
			tag,
		}),
		place(node, ancestor) {
			tree.append(ancestor.id, node.id);
		},
	});
	formatter.add(bold, {});
	expect(formatter.inScope(bold)).toBe(true);
	formatter.end("b");
	expect(stack).toEqual([stack[0], paragraph]);
	expect(tree.get(paragraph.id).parent).toBe(tree.root);
	expect(tree.get(foreign.id).parent).toBe(bold.id);
	const clone = tree.get(tree.get(paragraph.id).children[0]);
	expect(isHtmlElement(clone, "b")).toBe(true);
	expect(tree.textContent(clone.id)).toBe("text");
});

it("does not use a foreign a as the HTML adoption fast-path current element", () => {
	const { tree, stack, options } = stackFixture([
		["a", htmlNamespace],
		["a", svgNamespace],
	]);
	const formatter = new HtmlFormatting({
		...options,
		maxText: 10_000,
		insert: (tag, attributes) => ({
			tree,
			id: tree.createParserElement(tag, attributes),
			tag,
		}),
		place() {},
	});
	formatter.add(stack[1], {});
	formatter.end("a");
	expect(stack).toHaveLength(1);
	expect(formatter.find("a")).toBeUndefined();
});

it("does not match foreign ordinary names in HTML ordinary-end or adoption fallback", () => {
	const { tree, stack, options, scope } = stackFixture([
		["a", svgNamespace],
		["span", htmlNamespace],
	]);
	expect(scope.ordinaryEnd("a")).toBe(false);
	expect(stack).toHaveLength(3);
	const formatter = new HtmlFormatting({
		...options,
		maxText: 10_000,
		insert: (tag, attributes) => ({
			tree,
			id: tree.createParserElement(tag, attributes),
			tag,
		}),
		place() {},
	});
	formatter.end("a");
	expect(stack).toHaveLength(3);
});

it("skips foreign table/template lookalikes in table scope and pending-text decisions", () => {
	const { stack, options } = stackFixture([
		["table", htmlNamespace],
		["table", svgNamespace],
		["template", svgNamespace],
		["tr", svgNamespace],
	]);
	const emitted: string[] = [];
	const tables = new HtmlTables({
		...options,
		maxText: 10_000,
		template: () => undefined,
		push() {},
		insert() {},
		form() {},
		emit: (data) => emitted.push(data),
	});
	expect(tables.context()).toMatchObject({
		mode: "table",
		index: 1,
		virtual: false,
	});
	tables.characters("text");
	expect(emitted).toEqual(["text"]);
	expect(
		tables.tag({
			kind: "end",
			name: "table",
			attributes: {},
			selfClosing: false,
		}).handled,
	).toBe(true);
	expect(stack).toHaveLength(1);
});
