import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	svgNamespace,
	xlinkNamespace,
	xmlNamespace,
	xmlnsNamespace,
} from "./dom-namespaces.js";
import { createSvgImageDocument } from "./svg-image-document.js";
import {
	parseSvgImageXml,
	svgImageXmlLimits,
	type SvgXmlDocument,
	type SvgXmlElement,
	type SvgXmlNode,
} from "./svg-image-xml.js";

const trees: DocumentTree[] = [];
const encoder = new TextEncoder();

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function parse(body = "", attributes = "") {
	return parseSource(
		`<svg xmlns="${svgNamespace}" ${attributes}>${body}</svg>`,
	);
}

function parseSource(source: string) {
	return parseSvgImageXml(encoder.encode(source), () => {});
}

function build(xml = parse(), charge: (amount: number) => void = () => {}) {
	const result = createSvgImageDocument(xml, charge);
	trees.push(result.tree);
	return result;
}

function changedRoot(
	changes: Partial<SvgXmlElement>,
	document: Partial<SvgXmlDocument> = {},
): SvgXmlDocument {
	const xml = parse();
	return { ...xml, root: { ...xml.root, ...changes }, ...document };
}

function fails(xml: SvgXmlDocument, code: string) {
	expect(() => build(xml)).toThrowError(
		expect.objectContaining({ name: "AgentBrowserError", code }),
	);
}

function closed(tree: unknown) {
	if (!(tree instanceof DocumentTree)) throw new Error("Expected DocumentTree");
	expect(tree.nodeCount).toBe(0);
	expect(tree.resourceUsage()).toEqual({ nodes: 0, textCodeUnits: 0 });
	expect(() => tree.get(tree.root)).toThrow(/closed/i);
}

it("creates a standalone SVG document without HTML recovery or a doctype node", () => {
	const xml = parseSource(
		`<?xml version="1.0"?><!DOCTYPE svg SYSTEM "https://invalid.test/never-fetch.dtd"><svg xmlns="${svgNamespace}" viewBox="0 0 10 20"><linearGradient id="Paint"/><rect width="4"/></svg>`,
	);
	const before = JSON.stringify(xml);
	const { tree, root } = build(xml);
	expect(tree.url).toBe("about:blank");
	expect(tree.get(tree.root)).toMatchObject({
		kind: "document",
		children: [root],
	});
	expect(tree.get(root)).toMatchObject({
		kind: "element",
		tagName: "svg",
		namespaceURI: svgNamespace,
		parent: tree.root,
		attributes: { xmlns: svgNamespace, viewBox: "0 0 10 20" },
	});
	expect(tree.get(root).children.map((id) => tree.get(id).tagName)).toEqual([
		"linearGradient",
		"rect",
	]);
	expect(tree.nodeCount).toBe(4);
	expect(JSON.stringify(xml)).toBe(before);
	expect(Object.isFrozen(xml.root.attributes)).toBe(true);
	expect(xml.doctype).toEqual({
		name: "svg",
		systemId: "https://invalid.test/never-fetch.dtd",
	});
});

it("preserves prolog, epilog, text, CDATA and comments in document order", () => {
	const { tree, root } = build(
		parseSource(
			` \n<!--before--><!DOCTYPE svg SYSTEM 'urn:unused'>\t<svg xmlns="${svgNamespace}">A&amp;B<![CDATA[<x>]]><!--inside--><g/>tail</svg><!--after-->\n`,
		),
	);
	expect(
		tree.get(tree.root).children.map((id) => {
			const node = tree.get(id);
			return [node.kind, node.data, node.tagName];
		}),
	).toEqual([
		["text", " \n", ""],
		["comment", "before", ""],
		["text", "\t", ""],
		["element", "", "svg"],
		["comment", "after", ""],
		["text", "\n", ""],
	]);
	expect(
		tree.get(root).children.map((id) => {
			const node = tree.get(id);
			return [node.kind, node.data, node.tagName];
		}),
	).toEqual([
		["text", "A&B", ""],
		["text", "<x>", ""],
		["comment", "inside", ""],
		["element", "", "g"],
		["text", "tail", ""],
	]);
});

it("resolves prefixed SVG names to exact local-name case, not HTML names", () => {
	const { tree, root } = build(
		parseSource(
			`<s:svg xmlns:s="${svgNamespace}"><s:linearGradient gradientUnits="userSpaceOnUse"/><s:FOREIGNOBJECT/><s:template/><s:input value="literal"/></s:svg>`,
		),
	);
	expect(tree.get(root).attributes).toEqual({ "xmlns:s": svgNamespace });
	expect(tree.get(root).children.map((id) => tree.get(id))).toEqual([
		expect.objectContaining({
			tagName: "linearGradient",
			namespaceURI: svgNamespace,
			attributes: { gradientUnits: "userSpaceOnUse" },
		}),
		expect.objectContaining({
			tagName: "FOREIGNOBJECT",
			namespaceURI: svgNamespace,
		}),
		expect.objectContaining({
			tagName: "template",
			namespaceURI: svgNamespace,
		}),
		expect.objectContaining({
			tagName: "input",
			namespaceURI: svgNamespace,
			control: {},
		}),
	]);
	expect(tree.nodeCount).toBe(6);
});

it("keeps foreign attributes qualified and canonicalizes supported XLink URI names", () => {
	const xml = parse(
		'<use p:href="#Paint" p:title="Title" f:fill="red" fill="blue" xml:space="preserve" p:custom="opaque" __proto__="safe"/>',
		`xmlns:p="${xlinkNamespace}" xmlns:f="urn:foreign"`,
	);
	const original = JSON.stringify(xml);
	const { tree, root } = build(xml);
	const use = tree.get(root).children[0];
	expect(tree.get(use).attributes).toEqual({
		"xlink:href": "#Paint",
		"xlink:title": "Title",
		"f:fill": "red",
		fill: "blue",
		"xml:space": "preserve",
		"p:custom": "opaque",
		["__proto__"]: "safe",
	});
	expect(tree.getAttributeNames(use)).toEqual([
		"xlink:href",
		"xlink:title",
		"f:fill",
		"fill",
		"xml:space",
		"p:custom",
		"__proto__",
	]);
	expect(tree.getAttributeNamespace(use, "xlink:href")).toEqual({
		namespaceURI: xlinkNamespace,
		prefix: "xlink",
		localName: "href",
	});
	expect(tree.getAttributeNamespace(use, "xml:space")).toEqual({
		namespaceURI: xmlNamespace,
		prefix: "xml",
		localName: "space",
	});
	expect(tree.getAttributeNamespace(root, "xmlns")).toEqual({
		namespaceURI: xmlnsNamespace,
		prefix: null,
		localName: "xmlns",
	});
	expect(tree.get(root).attributes["xmlns:p"]).toBe(xlinkNamespace);
	expect(JSON.stringify(xml)).toBe(original);
});

it.each(["actuate", "arcrole", "href", "role", "show", "title", "type"])(
	"canonicalizes the supported XLink %s name by URI",
	(local) => {
		const { tree, root } = build(
			parse("", `xmlns:alias="${xlinkNamespace}" alias:${local}="value"`),
		);
		expect(tree.get(root).attributes[`xlink:${local}`]).toBe("value");
		expect(
			tree.getAttributeNamespace(root, `xlink:${local}`)?.namespaceURI,
		).toBe(xlinkNamespace);
	},
);

it("respects namespace shadowing without treating foreign href as an XLink reference", () => {
	const { tree, root } = build(
		parse(
			'<g xmlns:p="urn:foreign" p:href="never-fetch"/><use p:href="#Paint"/>',
			`xmlns:p="${xlinkNamespace}"`,
		),
	);
	const [group, use] = tree.get(root).children;
	expect(tree.get(group).attributes).toEqual({
		"xmlns:p": "urn:foreign",
		"p:href": "never-fetch",
	});
	expect(tree.get(group).attributes["xlink:href"]).toBeUndefined();
	expect(tree.get(use).attributes).toEqual({ "xlink:href": "#Paint" });
});

it("rejects an XLink-looking name bound to another namespace rather than misclassifying it", () => {
	fails(
		parse('<g xlink:href="never-fetch"/>', 'xmlns:xlink="urn:not-xlink"'),
		"unsupported",
	);
});

it("rejects canonical-name collisions instead of silently overwriting attributes", () => {
	const attribute = {
		name: "alias:href",
		localName: "href",
		namespaceURI: xlinkNamespace,
		value: "#second",
	};
	fails(
		changedRoot(
			{
				attributes: [
					{ ...attribute, name: "xlink:href", value: "#first" },
					attribute,
				],
			},
			{ sourceCodeUnits: 200 },
		),
		"unsupported",
	);
});

it.each([
	'<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">meaningful</body></foreignObject>',
	'<metadata><meta:record xmlns:meta="urn:metadata">meaningful</meta:record></metadata>',
	'<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>meaningful</mi></math>',
	'<g xmlns="">meaningful</g>',
])(
	"rejects meaningful foreign elements without erasing or renaming them: %s",
	(body) => {
		fails(parse(body), "unsupported");
	},
);

it.each(["_shape", "shape.part", "é", "形"])(
	"rejects nonrepresentable SVG local names: %s",
	(name) => {
		fails(parse(`<${name}/>`), "unsupported");
	},
);

it("preserves representable Unicode attribute names and Unicode SVG prefixes", () => {
	const { tree, root } = build(
		parseSource(`<前:svg xmlns:前="${svgNamespace}" é="値"/>`),
	);
	expect(tree.get(root).tagName).toBe("svg");
	expect(tree.get(root).attributes).toEqual({
		"xmlns:前": svgNamespace,
		é: "値",
	});
});

it.each([
	`<?xml-stylesheet href="https://invalid.test/never-fetch.css"?><svg xmlns="${svgNamespace}"/>`,
	`<svg xmlns="${svgNamespace}"><?instruction data?></svg>`,
	`<svg xmlns="${svgNamespace}"/><?instruction data?>`,
])("rejects processing instructions explicitly: %s", (source) => {
	fails(parseSource(source), "unsupported");
});

it("copies script, style and URI attributes as inert data without attaching a runtime", () => {
	const { tree, root } = build(
		parse(
			'<script href="https://invalid.test/never-execute.js"><![CDATA[throw new Error("must not run")]]></script><style>@import "https://invalid.test/never-fetch.css";</style><image href="https://invalid.test/never-fetch.png" onload="mustNotRun()"/>',
		),
	);
	const [script, style, image] = tree.get(root).children;
	expect(tree.get(tree.get(script).children[0]).data).toBe(
		'throw new Error("must not run")',
	);
	expect(tree.get(tree.get(style).children[0]).data).toContain("@import");
	expect(tree.get(image).attributes.onload).toBe("mustNotRun()");
	expect(tree.nodeCount).toBe(7);
});

it.each([
	{ name: "g", localName: "g" },
	{ name: "svg", localName: "svg", namespaceURI: null },
	{ name: "s:other", localName: "svg" },
	{ name: ":svg", localName: "svg" },
	{ name: "s:s:svg", localName: "svg" },
	{ name: "bad svg", localName: "svg" },
])("rejects malformed root mappings: %j", (changes) => {
	fails(changedRoot(changes), "invalid-input");
});

it.each([
	{
		name: "p:fill",
		localName: "color",
		namespaceURI: "urn:foreign",
		value: "red",
	},
	{
		name: "fill",
		localName: "fill",
		namespaceURI: "urn:foreign",
		value: "red",
	},
	{ name: "p:fill", localName: "fill", namespaceURI: null, value: "red" },
	{ name: "fill", localName: "fill", namespaceURI: "", value: "red" },
])("rejects malformed attribute mappings: %j", (attribute) => {
	fails(changedRoot({ attributes: [attribute] }), "invalid-input");
});

it("rejects namespace declarations falsely mapped as unqualified attributes", () => {
	fails(
		changedRoot(
			{
				attributes: [
					{
						name: "xmlns",
						localName: "xmlns",
						namespaceURI: null,
						value: svgNamespace,
					},
				],
			},
			{ sourceCodeUnits: 100 },
		),
		"unsupported",
	);
});

it.each([
	{ nodes: 0 },
	{ nodes: 1.5 },
	{ nodes: Number.NaN },
	{ sourceCodeUnits: 0 },
	{ sourceCodeUnits: Number.POSITIVE_INFINITY },
	{ nodes: 2 },
])("rejects malformed or inconsistent metadata: %j", (metadata) => {
	fails({ ...parse(), ...metadata }, "invalid-input");
});

it.each([
	{ nodes: svgImageXmlLimits.maxNodes + 1 },
	{ sourceCodeUnits: svgImageXmlLimits.maxSourceCodeUnits + 1 },
])(
	"rejects metadata above fixed parser bounds before allocating: %j",
	(metadata) => {
		const close = vi.spyOn(DocumentTree.prototype, "close");
		fails({ ...parse(), ...metadata }, "resource-limit");
		expect(close).not.toHaveBeenCalled();
	},
);

it("uses fixed parser-corresponding native limits and permits exact node and depth bounds", () => {
	const wide = build(parse("<g/>".repeat(svgImageXmlLimits.maxNodes - 1)));
	expect(wide.tree.nodeCount).toBe(svgImageXmlLimits.maxNodes + 1);
	expect(wide.tree.limits).toEqual({
		maxNodes: svgImageXmlLimits.maxNodes + 1,
		maxDepth: svgImageXmlLimits.maxElementDepth + 1,
		maxTextCodeUnits: svgImageXmlLimits.maxSourceCodeUnits * 2,
		maxChanges: 1,
	});
	const depth = svgImageXmlLimits.maxElementDepth - 1;
	const deep = build(
		parse("<g>".repeat(depth) + "text" + "</g>".repeat(depth)),
	);
	expect(deep.tree.nodeCount).toBe(svgImageXmlLimits.maxElementDepth + 2);
});

it("rejects actual node overflow even when metadata underreports it", () => {
	const children: SvgXmlNode[] = Array.from(
		{ length: svgImageXmlLimits.maxNodes },
		() => ({ kind: "text", data: "" }),
	);
	fails(changedRoot({ children }, { nodes: 1 }), "resource-limit");
});

it("rejects actual depth overflow and cyclic or shared nodes", () => {
	let nested: SvgXmlElement = {
		kind: "element",
		name: "g",
		localName: "g",
		namespaceURI: svgNamespace,
		attributes: [],
		children: [],
	};
	for (let index = 0; index < svgImageXmlLimits.maxElementDepth; index++)
		nested = { ...nested, children: [nested] };
	fails(
		changedRoot({ children: [nested] }, { sourceCodeUnits: 1000 }),
		"resource-limit",
	);
	const shared: SvgXmlNode = { kind: "text", data: "" };
	fails(changedRoot({ children: [shared, shared] }), "invalid-input");
	const cyclic: SvgXmlNode[] = [];
	const xml = changedRoot({ children: cyclic });
	cyclic.push(xml.root);
	fails(xml, "invalid-input");
});

it("enforces source, attribute, name and list bounds on actual construction", () => {
	fails(
		changedRoot({
			children: [
				{
					kind: "text",
					data: "x".repeat(svgImageXmlLimits.maxSourceCodeUnits),
				},
			],
		}),
		"resource-limit",
	);
	fails(
		changedRoot({
			name: "p".repeat(svgImageXmlLimits.maxNameCodeUnits) + ":svg",
		}),
		"resource-limit",
	);
	fails(
		changedRoot({
			attributes: Array.from(
				{ length: svgImageXmlLimits.maxAttributesPerElement + 1 },
				(_, index) => ({
					name: `attr${index}`,
					localName: `attr${index}`,
					namespaceURI: null,
					value: "",
				}),
			),
		}),
		"resource-limit",
	);
	fails(
		{ ...parse(), epilog: new Array(svgImageXmlLimits.maxNodes + 1) },
		"resource-limit",
	);
});

it("accepts an exact source bound, exact attribute bound and long XLink canonicalization", () => {
	const empty = `<svg xmlns="${svgNamespace}"></svg>`;
	const text = "x".repeat(svgImageXmlLimits.maxSourceCodeUnits - empty.length);
	const large = build(parseSource(empty.replace("</svg>", `${text}</svg>`)));
	expect(
		large.tree.get(large.tree.get(large.root).children[0]).data.length,
	).toBe(text.length);
	const attributes = Array.from(
		{ length: svgImageXmlLimits.maxAttributesPerElement - 1 },
		(_, index) => `attr${index}="value"`,
	).join(" ");
	const many = build(parse("", attributes));
	expect(many.tree.getAttributeNames(many.root).length).toBe(
		svgImageXmlLimits.maxAttributesPerElement,
	);
	const prefix = "p".repeat(svgImageXmlLimits.maxNameCodeUnits - 6);
	const linked = build(
		parse("", `xmlns:${prefix}="${xlinkNamespace}" ${prefix}:href="#target"`),
	);
	expect(linked.tree.get(linked.root).attributes["xlink:href"]).toBe("#target");
});

it("rejects invalid API shapes and misplaced document content", () => {
	fails(null as unknown as SvgXmlDocument, "invalid-input");
	expect(() =>
		createSvgImageDocument(
			parse(),
			null as unknown as (amount: number) => void,
		),
	).toThrow(/adapter input/);
	fails(
		{ ...parse(), prolog: null as unknown as SvgXmlNode[] },
		"invalid-input",
	);
	fails(
		changedRoot({ children: [null as unknown as SvgXmlNode] }),
		"invalid-input",
	);
	fails(
		changedRoot({ children: [{ kind: "doctype" } as unknown as SvgXmlNode] }),
		"invalid-input",
	);
	fails(changedRoot({ attributes: null as unknown as [] }), "invalid-input");
	fails({ ...parse(), prolog: [parse().root] }, "invalid-input");
	fails(
		{ ...parse(), epilog: [{ kind: "text", data: "meaningful" }] },
		"invalid-input",
	);
});

it("closes partially built trees after unsupported mappings, late PIs and count mismatches", () => {
	const close = vi.spyOn(DocumentTree.prototype, "close");
	fails(
		parse('<g/><metadata><m:record xmlns:m="urn:foreign"/></metadata>'),
		"unsupported",
	);
	fails(parse("<g/><?late instruction?>"), "unsupported");
	fails({ ...parse("<g/>"), nodes: 1 }, "invalid-input");
	expect(close).toHaveBeenCalledTimes(3);
	for (const tree of close.mock.contexts) closed(tree);
});

it("propagates every work-budget exhaustion unchanged and closes every allocated tree", () => {
	const xml = parse(
		'<g p:href="#target">text<!--comment--></g>',
		`xmlns:p="${xlinkNamespace}"`,
	);
	const charges: number[] = [];
	build(xml, (amount) => charges.push(amount));
	expect(
		charges.every((amount) => Number.isSafeInteger(amount) && amount > 0),
	).toBe(true);
	const close = vi.spyOn(DocumentTree.prototype, "close");
	for (let stop = 0; stop < charges.length; stop++) {
		const exhausted = new Error(`budget at ${stop}`);
		let calls = 0;
		let remaining =
			charges.slice(0, stop + 1).reduce((total, amount) => total + amount, 0) -
			1;
		expect(() =>
			createSvgImageDocument(xml, (amount) => {
				calls++;
				remaining -= amount;
				if (remaining < 0) throw exhausted;
			}),
		).toThrow(exhausted);
		expect(calls).toBe(stop + 1);
	}
	expect(close).toHaveBeenCalledTimes(charges.length - 1);
	for (const tree of close.mock.contexts) closed(tree);
	let remaining = charges.reduce((total, amount) => total + amount, 0);
	const exact = build(xml, (amount) => {
		remaining -= amount;
		if (remaining < 0) throw new Error("unexpected exhaustion");
	});
	expect(remaining).toBe(0);
	expect(exact.tree.nodeCount).toBe(5);
});

it.each([
	"createParserElement",
	"createText",
	"createComment",
	"append",
] as const)("closes the tree and preserves a native %s failure", (method) => {
	const failure = new Error("injected native failure");
	vi.spyOn(DocumentTree.prototype, method).mockImplementationOnce(() => {
		throw failure;
	});
	const close = vi.spyOn(DocumentTree.prototype, "close");
	expect(() =>
		createSvgImageDocument(parse("<g>text<!--comment--></g>"), () => {}),
	).toThrow(failure);
	expect(close).toHaveBeenCalledTimes(1);
	closed(close.mock.contexts[0]);
});

it("leaves a successful tree open for the caller to close", () => {
	const close = vi.spyOn(DocumentTree.prototype, "close");
	const { tree, root } = build();
	expect(close).not.toHaveBeenCalled();
	expect(tree.get(root).tagName).toBe("svg");
	tree.close();
	closed(tree);
});
