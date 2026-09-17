import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import {
	type ExtractedNode,
	type ExtractionOptions,
	type HeadingDiscoveryOptions,
	discoverDocumentHeadings,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { registerTextDocument } from "./text-document-info.js";

const sourceHeadingPolicy = "source-aria-heading-v1";
const options = { sourceHeadingPolicy } as const;
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function html(source: string) {
	const tree = parseHtmlDocument(source, "https://example.com/");
	trees.push(tree);
	return tree;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	const nodes: ExtractedNode[] = [];
	const pending = [node];
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		nodes.push(current);
		pending.push(...(current.children ?? []).slice().reverse());
	}
	return nodes;
}

function extracted(tree: DocumentTree, selection: ExtractionOptions = {}) {
	const result = extractDocument(tree, {
		...options,
		...selection,
		format: "json",
	});
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return flattened(result.content);
}

it("preserves default native-only output shape and admits mixed source headings only explicitly", () => {
	const tree = html(
		'<h1 role="heading" aria-level="9">Native</h1><div role="heading" aria-level="3">Source</div><h4>Native lower</h4><span role="heading">Default level</span>',
	);
	const before = extractDocument(tree);
	expect(before.content).toBe(
		"# Native\n\nSource\n\n#### Native lower\n\nDefault level\n",
	);
	expect(before).not.toHaveProperty("sourceHeadingPolicy");
	const native = discoverDocumentHeadings(tree);
	expect(native).not.toHaveProperty("sourceHeadingPolicy");
	expect(native.entries.map((entry) => entry.level)).toEqual([1, 4]);
	expect(native.entries.every((entry) => !("sourceHeading" in entry))).toBe(
		true,
	);
	const revision = tree.revision;
	const outline = discoverDocumentHeadings(tree, options);
	expect(outline.sourceHeadingPolicy).toBe(sourceHeadingPolicy);
	expect(outline.entries.map((entry) => entry.level)).toEqual([1, 3, 4, 2]);
	expect(outline.entries[1].sourceHeading?.levelBasis).toBe("aria-level");
	expect(outline.entries[3].sourceHeading?.levelBasis).toBe(
		"missing-level-default",
	);
	const queries = new DocumentQueries(tree);
	try {
		for (const entry of outline.entries) {
			expect(entry.selector).not.toBeNull();
			expect(queries.querySelectorAll(entry.selector as string)).toEqual([
				tree.resolve(entry.ref).id,
			]);
		}
	} finally {
		queries.close();
	}
	const headings = extracted(tree).filter((node) => node.type === "heading");
	expect(headings.map((node) => node.level)).toEqual([1, 3, 4, 2]);
	expect(headings[0]).not.toHaveProperty("sourceHeading");
	expect(headings[1].sourceHeading).toEqual(outline.entries[1].sourceHeading);
	expect(extractDocument(tree, options).content).toContain("### Source\n\n");
	expect(tree.revision).toBe(revision);
	expect(extractDocument(tree)).toEqual(before);
});

it("retains opt-in provenance when no headings are found", () => {
	const tree = html("<div>Body only</div>");
	for (const format of ["markdown", "json"] as const)
		expect(
			extractDocument(tree, { ...options, format }).sourceHeadingPolicy,
		).toBe(sourceHeadingPolicy);
	expect(discoverDocumentHeadings(tree, options)).toMatchObject({
		sourceHeadingPolicy,
		entries: [],
	});
});

it.each(["div", "p", "span", "strong"])(
	"separates a real source span heading from adjacent span body text inside %s",
	(tag) => {
		const tree = html(
			`<${tag}><span role="heading" aria-level="2">Overview</span><span>Body text</span></${tag}>`,
		);
		expect(extractDocument(tree).content).toBe("OverviewBody text\n");
		expect(extractDocument(tree, options).content).toBe(
			"## Overview\n\nBody text\n",
		);
	},
);

it("uses mixed native and source levels for section start and end boundaries", () => {
	const tree = html(
		'<h1>Top</h1><div role="heading" aria-level="2">Start</div><span>Body</span><h3>Native nested</h3><div role="heading" aria-level="4">Source nested</div><p>Detail</p><span role="heading" aria-level="broken">Not a boundary</span><span role="heading" aria-level="2" hidden>Hidden boundary</span><h2>Stop</h2><p>Outside</p>',
	);
	const outline = discoverDocumentHeadings(tree, options);
	const section = outline.entries[1].ref;
	expect(() => extractDocument(tree, { section })).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	const result = extractDocument(tree, { ...options, section });
	expect(result.sectionSelection).toMatchObject({
		heading: section,
		level: 2,
		end: outline.entries[4].ref,
		sourceHeading: outline.entries[1].sourceHeading,
	});
	expect(result.content).toBe(
		"## Start\n\nBody\n\n### Native nested\n\n#### Source nested\n\nDetail\n\nNot a boundary\n",
	);
	const fromNative = extractDocument(tree, {
		...options,
		section: outline.entries[0].ref,
	});
	expect(fromNative.sectionSelection).not.toHaveProperty("sourceHeading");
});

it("ends native sections at admitted source headings and ignores malformed explicit levels", () => {
	const tree = html(
		'<h2>Start</h2><p role="heading" aria-level="0">Malformed</p><span role="heading">Stop</span><p>Outside</p>',
	);
	const outline = discoverDocumentHeadings(tree, options);
	const result = extractDocument(tree, {
		...options,
		section: outline.entries[0].ref,
	});
	expect(result.content).toBe("## Start\n\nMalformed\n");
	expect(result.sectionSelection?.end).toBe(outline.entries[1].ref);
});

it.each(["h1", 'div role="heading" aria-level="1"'])(
	"does not reinterpret %s section ancestor context as a heading",
	(ancestor) => {
		const tag = ancestor.split(" ")[0];
		const tree = html(
			`<${ancestor}>Before<span role="heading">Start</span><span>Body</span><span role="heading">Stop</span></${tag}>`,
		);
		const outline = discoverDocumentHeadings(tree, options);
		const section = outline.entries[1].ref;
		const result = extractDocument(tree, { ...options, section });
		expect(result.content).toBe("## Start\n\nBody\n");
		const nodes = extracted(tree, { section });
		const context = nodes.find((node) => node.ref === outline.entries[0].ref);
		expect(context?.type).toBe("container");
		expect(context).not.toHaveProperty("sourceHeading");
		expect(context).not.toHaveProperty("level");
	},
);

it("honors visibility, omitted subtrees, template contents and foreign namespaces", () => {
	const tree = html(
		'<div role="heading" hidden>Hidden</div><div role="heading" inert>Inert</div><div role="heading" aria-hidden="true">Aria hidden</div><div role="heading" style="display:none">Display hidden</div><div role="heading" style="visibility:hidden">Invisible<span role="heading" style="visibility:visible">Restored</span></div><template><span role="heading">Template</span></template><script>Secret</script><div role="heading">Visible</div>',
	);
	for (const namespace of [svgNamespace, mathmlNamespace]) {
		const foreign = tree.createParserElement(
			"span",
			{ role: "heading" },
			namespace,
		);
		tree.append(tree.root, foreign);
		tree.append(foreign, tree.createText("Foreign body"));
	}
	expect(
		discoverDocumentHeadings(tree, options).entries.map((entry) => entry.title),
	).toEqual(["Restored", "Visible"]);
	expect(
		extracted(tree).filter((node) => node.type === "heading"),
	).toHaveLength(2);
	expect(extractDocument(tree, options).content).not.toMatch(
		/Hidden|Inert|Invisible|Template|Secret/,
	);
});

it("never derives heading text from labels, titles, alt text or control values", () => {
	const tree = html(
		'<div role="heading" aria-label="SECRET_LABEL" title="SECRET_TITLE" value="SECRET_VALUE" alt="SECRET_ALT">Public<input value="SECRET_INPUT"><textarea>SECRET_TEXTAREA</textarea><img alt="SECRET_IMAGE"><span role="img" title="SECRET_IMAGE_TITLE"></span><a href="/" aria-label="SECRET_LINK"></a></div><span role="heading" aria-label="SECRET_EMPTY"></span>',
	);
	expect(
		discoverDocumentHeadings(tree, options).entries.map((entry) => entry.title),
	).toEqual(["Public", ""]);
	for (const format of ["markdown", "json"] as const) {
		const result = extractDocument(tree, { ...options, format });
		expect(JSON.stringify(result)).not.toContain("SECRET");
	}
	const markdown = extractDocument(tree, {
		...options,
		sourceLinkLabelPolicy: "source-aria-label-v1",
	});
	expect(markdown.content).not.toContain("SECRET");
});

it("retains unsupported element semantics while admitting only generic source headings", () => {
	const tree = html(
		'<a role="heading" href="/">Link</a><button role="heading">Button</button><pre role="heading">Pre</pre><code role="heading">Code</code><ul role="heading"><li role="heading">Item</li></ul><table role="heading"><tr role="heading"><td role="heading">Cell</td></tr></table>',
	);
	expect(discoverDocumentHeadings(tree, options).entries).toEqual([]);
	expect(extracted(tree).some((node) => node.type === "heading")).toBe(false);
	const { sourceHeadingPolicy: provenance, ...result } = extractDocument(
		tree,
		options,
	);
	expect(provenance).toBe(sourceHeadingPolicy);
	expect(result).toEqual(extractDocument(tree));
});

it("clamps only Markdown markers while retaining high-level numeric hierarchy", () => {
	const tree = html(
		'<span role="heading" aria-level="2147483647">Maximum</span><span>Body</span><div role="heading" aria-level="7">Stop</div>',
	);
	const outline = discoverDocumentHeadings(tree, options);
	expect(outline.entries.map((entry) => entry.level)).toEqual([
		2_147_483_647, 7,
	]);
	expect(
		extracted(tree).find((node) => node.type === "heading")?.sourceHeading
			?.level,
	).toBe(2_147_483_647);
	const result = extractDocument(tree, {
		...options,
		section: outline.entries[0].ref,
	});
	expect(result.content).toBe("###### Maximum\n\nBody\n");
	expect(result.sectionSelection).toMatchObject({
		level: 2_147_483_647,
		end: outline.entries[1].ref,
	});
});

it("keeps entry, title, node, depth, selector and byte budgets in force", () => {
	const tree = html(
		'<div><span role="heading">Long title</span><span role="heading">Next title</span></div>',
	);
	const outline = discoverDocumentHeadings(tree, {
		...options,
		maxEntries: 1,
		maxTitleCodeUnits: 4,
		maxSelectorCodeUnits: 1,
	});
	expect(outline).toMatchObject({
		truncated: true,
		entries: [
			{
				title: "Long",
				titleTruncated: true,
				selector: null,
				selectorUnavailable: "selector-limit",
			},
		],
	});
	for (const limits of [{ maxNodes: 1 }, { maxDepth: 0 }, { maxBytes: 256 }]) {
		expect(() =>
			discoverDocumentHeadings(tree, { ...options, ...limits }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(() =>
			extractDocument(tree, { ...options, ...limits, format: "json" }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
});

it("rejects unknown policies at public entry without leaking their value", () => {
	const tree = html("<h1>Native</h1>");
	const invalid = { sourceHeadingPolicy: "SECRET_POLICY" };
	for (const operation of [
		() => extractDocument(tree, invalid as ExtractionOptions),
		() => discoverDocumentHeadings(tree, invalid as HeadingDiscoveryOptions),
	])
		expect(operation).toThrow(
			expect.objectContaining({
				code: "invalid-input",
				message: "Invalid source heading policy",
			}),
		);
});

it("rejects literal line and JSON selections rather than interpreting their source", () => {
	const tree = new DocumentTree("https://example.com/source.json");
	trees.push(tree);
	const pre = tree.createElement("pre");
	const text = tree.createText('{"value":"<span role=heading>Literal</span>"}');
	tree.append(tree.root, pre);
	tree.append(pre, text);
	registerTextDocument(tree, text, "application/json");
	const literal = extractDocument(tree, { jsonPointer: "/value" });
	for (const selection of [
		{},
		{ lines: { start: 1, end: 1 } },
		{ jsonPointer: "/value" },
	])
		expect(() => extractDocument(tree, { ...options, ...selection })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(extractDocument(tree, { jsonPointer: "/value" })).toEqual(literal);
	expect(discoverDocumentHeadings(tree, options).entries).toEqual([]);
});
