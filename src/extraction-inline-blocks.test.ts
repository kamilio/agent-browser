import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	discoverDocumentHeadings,
	discoverDocumentLinks,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { researchReaderInfo } from "./research-reader-info.js";

const url = "https://inline-blocks.fixture.invalid/article";
const storyUrl = "https://inline-blocks.fixture.invalid/story";
const boundary = "**Native list boundary (source groups only)**";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];

function fixture(source?: string) {
	const tree =
		source === undefined
			? new DocumentTree(url)
			: parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function append(
	tree: DocumentTree,
	parent: number,
	tagName: string,
	text?: string,
	attributes: Record<string, string> = {},
) {
	const node = tree.createElement(tagName, attributes);
	tree.append(parent, node);
	if (text !== undefined) tree.setTextContent(node, text);
	return node;
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it.each(["span", "small", "abbr", "cite", "mark"])(
	"separates a paragraph from its sibling date through nested %s wrappers",
	(tagName) => {
		const tree = fixture(
			`<main><${tagName}><${tagName}><p>Summary.</p></${tagName}></${tagName}><span><time datetime="2026-09-14">Sep 14, 2026</time></span></main>`,
		);
		expect(extractDocument(tree).content).toBe("Summary\\.\n\nSep 14, 2026\n");
	},
);

it.each([
	{ source: "<p>First</p><p>Second</p>", expected: "First\n\nSecond\n" },
	{
		source: "<span><p>First</p></span><span><span><p>Second</p></span></span>",
		expected: "First\n\nSecond\n",
	},
	{
		source: "<div>First<section>Second</section></div><article>Third</article>",
		expected: "First\n\nSecond\n\nThird\n",
	},
	{
		source: "<ul><li>First</li><li>Second</li></ul>",
		expected: "- First\n\n- Second\n",
	},
	{
		source: '<ol start="7"><li>First</li><li>Second</li></ol>',
		expected: "7. First\n\n8. Second\n",
	},
	{
		source: "<blockquote><p>First</p><p>Second</p></blockquote>",
		expected: "> First\n\n> Second\n",
	},
	{
		source: "<pre><code>  &lt;literal&gt;\n&amp;value\n</code></pre>",
		expected: "```\n  <literal>\n&value\n```\n",
	},
	{
		source: "<p>First</p><hr><p>Second</p>",
		expected: "First\n\n---\n\nSecond\n",
	},
])("preserves block descendants in $source", ({ source, expected }) => {
	const tree = fixture(`<span><span>${source}</span></span>`);
	expect(extractDocument(tree).content).toBe(expected);
});

it.each([1, 2, 3, 4, 5, 6])(
	"retains level %s headings through generic wrappers without a link",
	(level) => {
		const tree = fixture(
			`<span><span><h${level}>Title</h${level}><p>Summary</p></span></span>`,
		);
		expect(extractDocument(tree).content).toBe(
			`${"#".repeat(level)} Title\n\nSummary\n`,
		);
	},
);

it.each([
	{
		source: "<span>inter</span><span>national</span>",
		expected: "international\n",
	},
	{
		source: "<span><span>inter</span><em>national</em></span>",
		expected: "international\n",
	},
	{
		source: "<span>Before <strong>middle</strong> after</span>",
		expected: "Before middle after\n",
	},
	{
		source:
			"<span>Lead<span> in</span><p>Middle</p>Tail<span> end</span></span>",
		expected: "Lead in\n\nMiddle\n\nTail end\n",
	},
	{
		source:
			"<span><p>First <span>inter</span><em>national</em> item</p><p>Second</p></span>",
		expected: "First international item\n\nSecond\n",
	},
	{
		source: "<span>First<br>line<p>Middle</p>Last</span>",
		expected: "First  \nline\n\nMiddle\n\nLast\n",
	},
	{
		source: "<span> \n <p>First</p> \t <span><p>Second</p></span> \n </span>",
		expected: "First\n\nSecond\n",
	},
])("preserves authored inline runs in $source", ({ source, expected }) => {
	expect(extractDocument(fixture(source)).content).toBe(expected);
});

it.each([
	{
		source: "inter<span>national<p>Summary</p></span>",
		expected: "international\n\nSummary\n",
	},
	{
		source: "<span><p>Summary</p>inter</span>national",
		expected: "Summary\n\ninternational\n",
	},
	{
		source:
			"inter<span><span>national<p>Summary</p>inter</span></span>national",
		expected: "international\n\nSummary\n\ninternational\n",
	},
	{
		source:
			"<span>inter</span><small><span>national<p>Summary</p></span></small>",
		expected: "international\n\nSummary\n",
	},
	{
		source:
			"<span><small><p>Summary</p>inter</small></span><span>national</span>",
		expected: "Summary\n\ninternational\n",
	},
	{
		source: "<span><p>First</p>inter</span><span>national<p>Second</p></span>",
		expected: "First\n\ninternational\n\nSecond\n",
	},
	{
		source:
			"<span><span><p>First</p>inter</span></span><span><span>national<p>Second</p></span></span>",
		expected: "First\n\ninternational\n\nSecond\n",
	},
	{
		source: "Before <span>middle<p>Summary</p></span>",
		expected: "Before middle\n\nSummary\n",
	},
	{
		source: "<span><p>Summary</p>middle </span>after",
		expected: "Summary\n\nmiddle after\n",
	},
	{
		source: "<span><p>First</p>word </span><span>next<p>Second</p></span>",
		expected: "First\n\nword next\n\nSecond\n",
	},
	{
		source: "First<br><span>line<p>Summary</p></span>",
		expected: "First  \nline\n\nSummary\n",
	},
	{
		source: "<span><p>Summary</p>First<br></span>line",
		expected: "Summary\n\nFirst  \nline\n",
	},
	{
		source: "<code>value</code><span>tail<p>Summary</p></span>",
		expected: "` value `tail\n\nSummary\n",
	},
	{
		source: "<span><p>Summary</p>head</span><code>value</code>",
		expected: "Summary\n\nhead` value `\n",
	},
	{
		source: '<a href="/story">inter</a><span>national<p>Summary</p></span>',
		expected: `[inter](<${storyUrl}>)national\n\nSummary\n`,
	},
	{
		source: '<span><p>Summary</p>inter</span><a href="/story">national</a>',
		expected: `Summary\n\ninter[national](<${storyUrl}>)\n`,
	},
])(
	"continues inline runs across wrapper edges in $source",
	({ source, expected }) => {
		expect(extractDocument(fixture(`<main>${source}</main>`)).content).toBe(
			expected,
		);
	},
);

it.each(["leading", "trailing"] as const)(
	"preserves a word crossing a %s wrapper edge in a constructed tree",
	(edge) => {
		const tree = fixture();
		const main = append(tree, tree.root, "main");
		if (edge === "leading") tree.append(main, tree.createText("inter"));
		const wrapper = append(tree, main, "span");
		if (edge === "leading") tree.append(wrapper, tree.createText("national"));
		append(tree, wrapper, "p", "Summary");
		if (edge === "trailing") {
			tree.append(wrapper, tree.createText("inter"));
			tree.append(main, tree.createText("national"));
		}
		expect(extractDocument(tree).content).toBe(
			edge === "leading"
				? "international\n\nSummary\n"
				: "Summary\n\ninternational\n",
		);
	},
);

it.each([
	{ source: "<p>Summary</p>", block: "Summary" },
	{ source: "<h2>Title</h2>", block: "## Title" },
	{ source: "<ul><li>Item</li></ul>", block: "- Item" },
	{
		source: "<pre>  literal\nvalue</pre>",
		block: "```\n  literal\nvalue\n```",
	},
])(
	"retains the actual $source boundary between continued runs",
	({ source, block }) => {
		const tree = fixture(
			`<main>inter<span>national${source}inter</span>national</main>`,
		);
		expect(extractDocument(tree).content).toBe(
			`international\n\n${block}\n\ninternational\n`,
		);
	},
);

it("continues linked runs across both wrapper edges without changing destinations", () => {
	const tree = fixture(
		'<a href="/story">inter<span><span>national<p>Summary</p>inter</span></span>national</a>',
	);
	expect(extractDocument(tree).content).toBe(
		`[international](<${storyUrl}>)\n\n[Summary](<${storyUrl}>)\n\n[international](<${storyUrl}>)\n`,
	);
});

it.each([
	{ tagName: "p", expected: "internationalSummarytailend\n" },
	{ tagName: "h2", expected: "## internationalSummarytailend\n" },
	{ tagName: "strong", expected: "internationalSummarytailend\n" },
	{ tagName: "em", expected: "internationalSummarytailend\n" },
	{ tagName: "code", expected: "` internationalSummarytailend `\n" },
	{ tagName: "pre", expected: "```\ninternationalSummarytailend\n```\n" },
])(
	"keeps cross-wrapper runs inside the $tagName true sink",
	({ tagName, expected }) => {
		const tree = fixture();
		const outer = append(tree, tree.root, "span");
		const sink = append(tree, outer, tagName, "inter");
		const inner = append(tree, sink, "span", "national");
		append(tree, inner, "p", "Summary");
		tree.append(inner, tree.createText("tail"));
		tree.append(sink, tree.createText("end"));
		expect(extractDocument(tree).content).toBe(expected);
	},
);

it("retains nested quote and ordered-list prefixes", () => {
	const tree = fixture(
		'<span><blockquote><span><ol start="3"><li><span><p>Parent</p><ul><li>Child</li></ul></span></li><li>Next</li></ol></span></blockquote></span>',
	);
	expect(extractDocument(tree).content).toBe(
		"> 3. Parent\n\n>    - Child\n\n> 4. Next\n",
	);
});

it("keeps list-group boundaries across generic wrappers in the same item", () => {
	const tree = fixture(
		"<ul><li><span><span><ul><li>First</li></ul></span><span><ul><li>Second</li></ul></span></span></li></ul>",
	);
	expect(extractDocument(tree).content).toBe(
		`- - First\n\n  ${boundary}\n\n  - Second\n`,
	);
});

it("does not emit omitted or empty paragraph descendants", () => {
	const tree = fixture(
		'<span><p hidden>Hidden</p><script>omitted()</script><p></p><span><p>Visible</p></span><p style="display:none">Also hidden</p></span>',
	);
	expect(extractDocument(tree).content).toBe("Visible\n");
});

it("preserves escaped text, inline code and literal preformatted fences", () => {
	const tree = fixture(
		"<span><p>A &amp; &lt;B&gt; [label] *value* <code>a`b</code></p><span><pre>```\n&lt;tag&gt; &amp; [literal]</pre></span></span>",
	);
	expect(extractDocument(tree).content).toBe(
		"A &amp; &lt;B&gt; \\[label\\] \\*value\\* `` a`b ``\n\n````\n```\n<tag> & [literal]\n````\n",
	);
});

it.each([
	{ tagName: "p", expected: "FirstSecond\n" },
	{ tagName: "h2", expected: "## FirstSecond\n" },
	{ tagName: "strong", expected: "FirstSecond\n" },
	{ tagName: "b", expected: "FirstSecond\n" },
	{ tagName: "em", expected: "FirstSecond\n" },
	{ tagName: "i", expected: "FirstSecond\n" },
	{ tagName: "code", expected: "` FirstSecond `\n" },
	{ tagName: "pre", expected: "```\nFirstSecond\n```\n" },
])("retains the $tagName true sink", ({ tagName, expected }) => {
	const tree = fixture();
	const outer = append(tree, tree.root, "span");
	const sink = append(tree, outer, tagName);
	const inner = append(tree, sink, "span");
	append(tree, inner, "p", "First");
	append(tree, inner, "p", "Second");
	expect(extractDocument(tree).content).toBe(expected);
});

it.each([
	undefined,
	"javascript:bad()",
	"data:text/html,bad",
	"mailto:reader@example.invalid",
	"https://user:password@example.invalid/story",
	"/story",
])(
	"preserves block-link semantics inside generic wrappers for href=%s",
	(href) => {
		const tree = fixture();
		const outer = append(tree, tree.root, "span");
		const anchor = append(
			tree,
			outer,
			"a",
			undefined,
			href === undefined ? {} : { href },
		);
		const inner = append(tree, anchor, "span");
		append(tree, inner, "p", "First");
		append(tree, inner, "p", "Second");
		expect(extractDocument(tree).content).toBe(
			href === "/story"
				? `[First](<${storyUrl}>)\n\n[Second](<${storyUrl}>)\n`
				: "First\n\nSecond\n",
		);
	},
);

it("retains inline links within recovered paragraphs without inventing empty labels", () => {
	const tree = fixture(
		'<span><p>Read <a href="/story?a=1&amp;b=2">inter<span>national</span></a> <a href="/empty" title="Not a label"></a>now</p><p>Next</p></span>',
	);
	expect(extractDocument(tree).content).toBe(
		`Read [international](<${storyUrl}?a=1&amp;b=2>) now\n\nNext\n`,
	);
});

it("retains a block link's preformatted destination fallback through wrappers", () => {
	const tree = fixture(
		'<span><a href="/story"><span><pre>literal</pre></span></a></span>',
	);
	expect(extractDocument(tree).content).toBe(
		`\`\`\`\nliteral\n\`\`\`\n\n<${storyUrl}>\n`,
	);
});

it.each([
	{},
	{ compactTables: true },
	{ tableRows: true },
	{ compactTables: true, tableRows: true },
])("retains table modes through generic wrappers with %j", (options) => {
	const source =
		'<p>Before</p><table><tr><td>First</td><td><a href="/story">Second</a></td></tr></table><p>After</p>';
	const ordinary = fixture(source);
	const wrapped = fixture(`<span><span>${source}</span></span>`);
	expect(extractDocument(wrapped, options).content).toBe(
		extractDocument(ordinary, options).content,
	);
	expect(extractDocument(wrapped, options).content).toContain(
		"**Native table begin",
	);
});

it.each(["p", "h2", "strong", "em", "code", "pre", "a"])(
	"does not admit tables through a %s sink inside generic wrappers",
	(tagName) => {
		const tree = fixture();
		const outer = append(tree, tree.root, "span");
		const sink = append(tree, outer, tagName, undefined, { href: "/story" });
		const inner = append(tree, sink, "span");
		const table = append(tree, inner, "table");
		const row = append(tree, table, "tr");
		append(tree, row, "td", "Cell");
		const structured = extractDocument(tree, { format: "json" });
		for (const options of [{}, { compactTables: true }, { tableRows: true }])
			expect(() => extractDocument(tree, options)).toThrow(
				expect.objectContaining({
					code: "unsupported",
					message: "Unsupported table extraction structure",
				}),
			);
		expect(extractDocument(tree, { format: "json" })).toEqual(structured);
	},
);

it("preserves source identities, JSON, discoveries and selected roots", () => {
	const tree = fixture();
	append(tree, tree.root, "aside", "Outside");
	const outer = append(tree, tree.root, "span");
	const inner = append(tree, outer, "span");
	const heading = append(tree, inner, "h2", "Title");
	const paragraph = append(tree, inner, "p", "Summary");
	append(tree, inner, "a", "Details", { href: "/story" });
	const root = tree.reference(outer);
	const source = serializeHtml(tree);
	const revision = tree.revision;
	const structured = extractDocument(tree, { root, format: "json" });
	const links = discoverDocumentLinks(tree, "/story");
	const headings = discoverDocumentHeadings(tree);
	expect(structured.content).toMatchObject({
		ref: root,
		type: "inline",
		children: [
			{
				ref: tree.reference(inner),
				type: "inline",
				children: [
					{ ref: tree.reference(heading), type: "heading", level: 2 },
					{ ref: tree.reference(paragraph), type: "paragraph" },
					{ type: "link", url: storyUrl },
				],
			},
		],
	});
	expect(extractDocument(tree, { root }).content).toBe(
		`## Title\n\nSummary\n\n[Details](<${storyUrl}>)\n`,
	);
	expect(extractDocument(tree, { root: tree.reference(heading) }).content).toBe(
		"## Title\n",
	);
	expect(extractDocument(tree, { root, format: "json" })).toEqual(structured);
	expect(discoverDocumentLinks(tree, "/story")).toEqual(links);
	expect(discoverDocumentHeadings(tree)).toEqual(headings);
	expect(serializeHtml(tree)).toBe(source);
	expect(tree.revision).toBe(revision);
	expect(tree.resolve(root).id).toBe(outer);
	tree.setTextContent(paragraph, "Changed");
	expect(extractDocument(tree, { root }).content).toBe(
		`## Title\n\nChanged\n\n[Details](<${storyUrl}>)\n`,
	);
});

it.each([undefined, "source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"recovers source paragraphs without changing reader counters under %s",
	(visibilityPolicy) => {
		const source =
			'<!doctype html><html><head><title>Reader</title><script>ignored()</script></head><body><main><span><span><p>Summary.</p></span></span><span><time datetime="2026-09-14">Sep 14, 2026</time></span></main></body></html>';
		const body = encoder.encode(source);
		const sanitized = sanitizeResearchHtml(
			source,
			{},
			undefined,
			undefined,
			"separate-omitted-raw-v1",
			visibilityPolicy,
		);
		const tree = loadResearchDocument(
			{
				url,
				status: 200,
				headers: { "content-type": ["text/html; charset=utf-8"] },
				body,
				encodedBytes: body.byteLength,
				redirects: [],
				elapsedMs: 0,
			},
			{
				tabId: "synthetic-inline-blocks",
				signal: new AbortController().signal,
				limits: {
					maxNodes: 50_000,
					maxDepth: 128,
					maxTextCodeUnits: 2_000_000,
					maxChanges: 1024,
				},
			},
			undefined,
			"separate-omitted-raw-v1",
			visibilityPolicy,
		);
		trees.push(tree);
		const reader = researchReaderInfo(tree);
		const readerBefore = JSON.stringify(reader);
		const serialized = serializeHtml(tree);
		const structured = extractDocument(tree, { format: "json" });
		const revision = tree.revision;
		expect(reader).toEqual({ ...sanitized.report, encoding: "utf-8" });
		const extracted = extractDocument(tree);
		expect(extracted.content).toBe("Summary\\.\n\nSep 14, 2026\n");
		expect(extracted.reader).toEqual(reader);
		expect(JSON.stringify(researchReaderInfo(tree))).toBe(readerBefore);
		expect(extractDocument(tree, { format: "json" })).toEqual(structured);
		expect(serializeHtml(tree)).toBe(serialized);
		expect(tree.revision).toBe(revision);
		expect(body).toEqual(encoder.encode(source));
	},
);

it.each(["markdown", "json"] as const)(
	"enforces exact serialized UTF-8 output bounds for wrapped paragraphs in %s",
	(format) => {
		const tree = fixture(
			`<span><p>${"中文 café 😀 ".repeat(24)}</p><p>雪</p></span>`,
		);
		const result = extractDocument(tree, { format });
		const maxBytes = encoder.encode(JSON.stringify(result)).byteLength;
		expect(extractDocument(tree, { format, maxBytes })).toEqual(result);
		expect(() =>
			extractDocument(tree, { format, maxBytes: maxBytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		if (result.format === "markdown") {
			expect(result.content).toContain("\n\n雪\n");
			const joined = { ...result, content: result.content.replace("\n\n", "") };
			const joinedBytes = encoder.encode(JSON.stringify(joined)).byteLength;
			expect(joinedBytes).toBeLessThan(maxBytes);
			expect(() => extractDocument(tree, { maxBytes: joinedBytes })).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		}
		expect(extractDocument(tree, { format })).toEqual(result);
	},
);

it.each(["leading", "trailing"] as const)(
	"enforces exact UTF-8 output bounds for a continued %s-edge run",
	(edge) => {
		const text = "中文 café 😀 ".repeat(24);
		const source =
			edge === "leading"
				? `${text}<span>tail<p>Summary</p></span>`
				: `<span><p>Summary</p>${text}</span>tail`;
		const tree = fixture(`<main>${source}</main>`);
		const structured = extractDocument(tree, { format: "json" });
		const serialized = serializeHtml(tree);
		const revision = tree.revision;
		const result = extractDocument(tree);
		expect(result.content).toBe(
			edge === "leading"
				? `${text}tail\n\nSummary\n`
				: `Summary\n\n${text}tail\n`,
		);
		const maxBytes = encoder.encode(JSON.stringify(result)).byteLength;
		expect(extractDocument(tree, { maxBytes })).toEqual(result);
		expect(() => extractDocument(tree, { maxBytes: maxBytes - 1 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(extractDocument(tree, { format: "json" })).toEqual(structured);
		expect(serializeHtml(tree)).toBe(serialized);
		expect(tree.revision).toBe(revision);
	},
);

it.each([1024, 1536, 2048])(
	"keeps explicit prefix fallback within %s bytes without relaxing source limits",
	(maxBytes) => {
		const tree = fixture(`<span>${"<p>中文 café 😀</p>".repeat(120)}</span>`);
		expect(() => extractDocument(tree, { maxBytes })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const options = { maxBytes, outputLimitPolicy: "text-prefix-v1" as const };
		const result = extractDocument(tree, options);
		expect(result.contentFallback).toMatchObject({
			policy: "text-prefix-v1",
			representation: "indented-plain-text",
			truncated: true,
		});
		expect(
			encoder.encode(JSON.stringify(result)).byteLength,
		).toBeLessThanOrEqual(maxBytes);
		expect(extractDocument(tree, options)).toEqual(result);
		expect(() => extractDocument(tree, { ...options, maxNodes: 4 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("bounds deeply nested generic wrappers at the exact source depth", () => {
	const tree = fixture();
	const outer = append(tree, tree.root, "span");
	let parent = outer;
	for (let depth = 1; depth < 200; depth++)
		parent = append(tree, parent, "span");
	append(tree, parent, "p", "Deep");
	const options = { root: tree.reference(outer), maxNodes: 202, maxDepth: 201 };
	expect(extractDocument(tree, options).content).toBe("Deep\n");
	for (const limits of [{ maxNodes: 201 }, { maxDepth: 200 }])
		expect(() => extractDocument(tree, { ...options, ...limits })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});

it("enforces node and depth quotas for wide paragraph subtrees", () => {
	const tree = fixture();
	const outer = append(tree, tree.root, "span");
	const paragraphs: string[] = [];
	for (let index = 0; index < 48; index++) {
		append(tree, outer, "p", `Group ${index}`);
		paragraphs.push(`Group ${index}`);
	}
	const options = { root: tree.reference(outer), maxNodes: 97, maxDepth: 2 };
	expect(extractDocument(tree, options).content).toBe(
		`${paragraphs.join("\n\n")}\n`,
	);
	for (const limits of [{ maxNodes: 96 }, { maxDepth: 1 }])
		expect(() => extractDocument(tree, { ...options, ...limits })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});
