import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	discoverDocumentHeadings,
	discoverDocumentLinks,
	extractDocument,
} from "./extraction.js";
import { setInnerHtml } from "./html-content.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";

const url = "https://block-links.fixture.invalid/catalog/index.html";
const storyUrl = "https://block-links.fixture.invalid/story";
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

function textRecord(tree: DocumentTree, parent: number, text: string) {
	return {
		ref: tree.reference(tree.get(parent).children[0]),
		type: "text",
		text,
	};
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it.each([1, 2, 3, 4, 5, 6])(
	"preserves level %s headings and paragraphs inside a card anchor",
	(level) => {
		const tree = fixture(
			`<a href="/story"><div><h${level}>Title</h${level}><p>Summary</p></div></a>`,
		);
		expect(extractDocument(tree).content).toBe(
			`${"#".repeat(level)} [Title](<${storyUrl}>)\n\n[Summary](<${storyUrl}>)\n`,
		);
	},
);

it("keeps nested containers and direct inline groups separate in source order", () => {
	const tree = fixture(
		'<p>Before</p><a href="/story">Lead<section><div><h2>Title</h2><p>First <span>part</span></p></div><article><p>Second</p></article></section>Tail</a><p>After</p>',
	);
	expect(extractDocument(tree).content).toBe(
		`Before\n\n[Lead](<${storyUrl}>)\n\n## [Title](<${storyUrl}>)\n\n[First part](<${storyUrl}>)\n\n[Second](<${storyUrl}>)\n\n[Tail](<${storyUrl}>)\n\nAfter\n`,
	);
});

it.each([
	'<span><span><a href="/story"><h2>Title</h2><p>Summary</p></a></span></span>',
	'<a href="/story"><span><span><h2>Title</h2><p>Summary</p></span></span></a>',
	'<span><a href="/story"><span><div><h2>Title</h2><p>Summary</p></div></span></a></span>',
])("finds block links through generic inline wrappers in %s", (source) => {
	const tree = fixture(source);
	expect(extractDocument(tree).content).toBe(
		`## [Title](<${storyUrl}>)\n\n[Summary](<${storyUrl}>)\n`,
	);
});

it("leaves generic non-link inline wrappers on their existing flattening path", () => {
	const tree = fixture();
	const wrapper = append(tree, tree.root, "span", "Before");
	append(tree, wrapper, "div", "Middle");
	append(tree, wrapper, "span", "After");
	expect(extractDocument(tree).content).toBe("BeforeMiddleAfter\n");
});

it.each([
	{ tagName: "p", expected: `[TitleSummary](<${storyUrl}>)\n` },
	{ tagName: "h2", expected: `## [TitleSummary](<${storyUrl}>)\n` },
	{ tagName: "strong", expected: `[TitleSummary](<${storyUrl}>)\n` },
	{ tagName: "em", expected: `[TitleSummary](<${storyUrl}>)\n` },
	{ tagName: "code", expected: "` TitleSummary `\n" },
	{ tagName: "pre", expected: "```\nTitleSummary\n```\n" },
])(
	"does not promote block links through the $tagName true sink",
	({ tagName, expected }) => {
		const tree = fixture();
		const sink = append(tree, tree.root, tagName);
		const anchor = append(tree, sink, "a", undefined, { href: "/story" });
		append(tree, anchor, "h2", "Title");
		append(tree, anchor, "p", "Summary");
		expect(extractDocument(tree).content).toBe(expected);
	},
);

it("preserves quote, ordered-list and nested-list prefixes outside link labels", () => {
	const tree = fixture(
		'<a href="/story"><blockquote><h2>Title</h2><p>First<br>line</p><ol start="3"><li>One</li><li><p>Two</p><ul><li>Nested</li></ul></li></ol></blockquote></a>',
	);
	expect(extractDocument(tree).content).toBe(
		`> ## [Title](<${storyUrl}>)\n\n> [First  \n> line](<${storyUrl}>)\n\n> 3. [One](<${storyUrl}>)\n\n> 4. [Two](<${storyUrl}>)\n\n>    - [Nested](<${storyUrl}>)\n`,
	);
});

it("preserves surrounding list prefixes and resumes unlinked content afterward", () => {
	const tree = fixture(
		'<ul><li><a href="/story"><h2>Title</h2><p>Summary</p></a><p>After</p></li><li>Next</li></ul>',
	);
	expect(extractDocument(tree).content).toBe(
		`- ## [Title](<${storyUrl}>)\n\n  [Summary](<${storyUrl}>)\n\n  After\n\n- Next\n`,
	);
});

it.each([
	"javascript:alert(1)",
	"data:text/html,secret",
	"file:///etc/passwd",
	"mailto:reader@example.com",
	"https://user:secret@example.com/story",
	"https://[invalid]/story",
])("retains block structure without exposing the unsafe URL %s", (href) => {
	const tree = fixture();
	const anchor = append(tree, tree.root, "a", undefined, { href });
	append(tree, anchor, "h2", "Title");
	append(tree, anchor, "p", "Summary");
	append(tree, anchor, "pre", "literal");
	expect(extractDocument(tree).content).toBe(
		"## Title\n\nSummary\n\n```\nliteral\n```\n",
	);
	const structured = extractDocument(tree, {
		root: tree.reference(anchor),
		format: "json",
	});
	expect(structured.content).toMatchObject({ type: "link", blocked: true });
	expect(structured.content).not.toHaveProperty("url");
	expect(JSON.stringify(structured)).not.toContain(href);
	setInnerHtml(tree, anchor, "<pre>literal</pre>");
	expect(extractDocument(tree).content).toBe("```\nliteral\n```\n");
});

it("preserves blocks in an anchor without an href", () => {
	const tree = fixture(
		'<a title="Not a label"><h2>Title</h2><p>Summary</p></a>',
	);
	expect(extractDocument(tree).content).toBe("## Title\n\nSummary\n");
});

it("resolves the live base and escapes every repeated destination only in Markdown", () => {
	const tree = fixture();
	const base = append(tree, tree.root, "base", undefined, {
		href: "https://cdn.fixture.invalid/docs/",
	});
	const anchor = append(tree, tree.root, "a", undefined, {
		href: "next?name=&copy;&other=(one)<two>",
	});
	append(tree, anchor, "h2", "A & B");
	append(tree, anchor, "p", "[Summary]");
	for (const baseUrl of [
		"https://cdn.fixture.invalid/docs/",
		"https://other.fixture.invalid/manual/",
	]) {
		tree.setAttribute(base, "href", baseUrl);
		const resolved = `${baseUrl}next?name=&copy;&other=(one)%3Ctwo%3E`;
		const escapedUrl = resolved.replace(/&/g, "&amp;");
		expect(extractDocument(tree).content).toBe(
			`## [A &amp; B](<${escapedUrl}>)\n\n[\\[Summary\\]](<${escapedUrl}>)\n`,
		);
		expect(
			extractDocument(tree, { root: tree.reference(anchor), format: "json" })
				.content,
		).toMatchObject({ url: resolved });
		expect(discoverDocumentLinks(tree, "next").entries[0].url).toBe(resolved);
	}
});

it.each([
	"<div></div>",
	"<div> \t\n </div>",
	"<div><p>&nbsp;</p><span> </span></div>",
	"<p><img alt=''></p>",
	"<p><code></code></p>",
	"<div><br></div>",
])("does not invent a label or fallback URL for empty blocks %j", (source) => {
	const tree = fixture(
		`<a href="/story" title="Invented title" aria-label="Invented label">${source}</a>`,
	);
	expect(extractDocument(tree).content).toBe("");
	expect(discoverDocumentLinks(tree, "/story").entries).toHaveLength(1);
});

it("ignores inter-block whitespace and preserves ordinary inline whitespace", () => {
	const tree = fixture(
		'<a href="/story"> \n <div><h2>Title</h2> \n <p>One <span>two</span> three</p></div> \t </a>',
	);
	expect(extractDocument(tree).content).toBe(
		`## [Title](<${storyUrl}>)\n\n[One two three](<${storyUrl}>)\n`,
	);
});

it("keeps linked preformatted code literal and emits an unlabeled fallback URL", () => {
	const tree = fixture();
	const anchor = append(tree, tree.root, "a", undefined, { href: "/story" });
	const wrapper = append(tree, anchor, "div");
	const pre = append(tree, wrapper, "pre");
	append(tree, pre, "code", 'const value = "<&>";\n```\n  [literal](url)\n');
	expect(extractDocument(tree).content).toBe(
		`\`\`\`\`\nconst value = "<&>";\n\`\`\`\n  [literal](url)\n\`\`\`\`\n\n<${storyUrl}>\n`,
	);
});

it.each(["", " \t\n", "\u00a0"])(
	"retains whitespace-only pre source %j without a fallback URL",
	(text) => {
		const tree = fixture();
		const anchor = append(tree, tree.root, "a", undefined, { href: "/story" });
		append(tree, anchor, "pre", text);
		expect(extractDocument(tree).content).toBe(
			`\`\`\`\n${text}${text.endsWith("\n") ? "" : "\n"}\`\`\`\n`,
		);
	},
);

it("emits one escaped fallback for several pre blocks without a linked text group", () => {
	const tree = fixture(
		'<a href="/story?a=1&amp;b=2"><div><pre>first</pre><p> </p><pre>second</pre></div></a>',
	);
	expect(extractDocument(tree).content).toBe(
		`\`\`\`\nfirst\n\`\`\`\n\n\`\`\`\nsecond\n\`\`\`\n\n<${storyUrl}?a=1&amp;b=2>\n`,
	);
});

it.each([true, false])(
	"does not duplicate the destination when linked text accompanies pre code (text first=%s)",
	(textFirst) => {
		const label = "<p>Read</p>";
		const pre = "<pre>literal</pre>";
		const tree = fixture(
			`<a href="/story">${textFirst ? label + pre : pre + label}</a>`,
		);
		const linked = `[Read](<${storyUrl}>)`;
		const fenced = "```\nliteral\n```";
		expect(extractDocument(tree).content).toBe(
			`${textFirst ? `${linked}\n\n${fenced}` : `${fenced}\n\n${linked}`}\n`,
		);
	},
);

it("keeps pre fallback outside fences with inherited quote and item prefixes", () => {
	const tree = fixture(
		'<blockquote><ul><li><a href="/story"><pre>literal</pre></a></li></ul></blockquote>',
	);
	expect(extractDocument(tree).content).toBe(
		`> - \`\`\`\n>   literal\n>   \`\`\`\n\n>   <${storyUrl}>\n`,
	);
});

it("retains inline code and literal strong and emphasis semantics in linked groups", () => {
	const tree = fixture(
		'<a href="/story"><h2><strong>Bold</strong> <em>soft</em></h2><p>Use <code>a`b</code> and <code> </code></p><pre>literal</pre></a>',
	);
	expect(extractDocument(tree).content).toBe(
		`## [Bold soft](<${storyUrl}>)\n\n[Use \`\` a\`b \`\` and \` \`](<${storyUrl}>)\n\n\`\`\`\nliteral\n\`\`\`\n`,
	);
});

it.each([
	{ source: "<span>Read</span>", label: "Read" },
	{ source: "<strong>Bold</strong> <em>soft</em>", label: "Bold soft" },
	{ source: "<code>a`b</code>", label: "`` a`b ``" },
	{ source: '<img alt="A [diagram]">', label: "A \\[diagram\\]" },
])(
	"matches ordinary inline-link rendering for $source",
	({ source, label }) => {
		const ordinary = fixture(
			`<p>Before <a href="/story">${source}</a> after</p>`,
		);
		const block = fixture(`<a href="/story"><p>${source}</p></a>`);
		expect(extractDocument(ordinary).content).toBe(
			`Before [${label}](<${storyUrl}>) after\n`,
		);
		expect(extractDocument(block).content).toBe(`[${label}](<${storyUrl}>)\n`);
	},
);

it.each([
	{ href: "/story", label: `[Before Inside After](<${storyUrl}>)` },
	{
		href: "javascript:bad()",
		label: "Before [Inside](<https://block-links.fixture.invalid/inner>) After",
	},
])(
	"keeps outer-valid-destination precedence for nested links ($href)",
	({ href, label }) => {
		const tree = fixture();
		const outer = append(tree, tree.root, "a", undefined, { href });
		const paragraph = append(tree, outer, "p", "Before ");
		append(tree, paragraph, "a", "Inside", { href: "/inner" });
		tree.append(paragraph, tree.createText(" After"));
		expect(extractDocument(tree).content).toBe(`${label}\n`);
	},
);

it.each([
	{ href: "/story", destination: storyUrl },
	{
		href: "javascript:bad()",
		destination: "https://block-links.fixture.invalid/inner",
	},
])(
	"inherits the first valid destination through nested block links ($href)",
	({ href, destination }) => {
		const tree = fixture();
		const outer = append(tree, tree.root, "a", undefined, { href });
		const wrapper = append(tree, outer, "div");
		const inner = append(tree, wrapper, "a", undefined, { href: "/inner" });
		append(tree, inner, "h2", "Title");
		append(tree, inner, "p", "Summary");
		expect(extractDocument(tree).content).toBe(
			`## [Title](<${destination}>)\n\n[Summary](<${destination}>)\n`,
		);
	},
);

it("preserves source identities, JSON and discovery rather than synthesizing links", () => {
	const tree = fixture();
	const anchor = append(tree, tree.root, "a", undefined, { href: "/story" });
	const wrapper = append(tree, anchor, "div");
	const heading = append(tree, wrapper, "h2", "Title");
	const paragraph = append(tree, wrapper, "p", "Summary");
	const root = tree.reference(anchor);
	const source = serializeHtml(tree);
	const revision = tree.revision;
	const structured = extractDocument(tree, { root, format: "json" });
	const links = discoverDocumentLinks(tree, "/story");
	const headings = discoverDocumentHeadings(tree);
	expect(structured.content).toEqual({
		ref: root,
		type: "link",
		url: storyUrl,
		children: [
			{
				ref: tree.reference(wrapper),
				type: "container",
				children: [
					{
						ref: tree.reference(heading),
						type: "heading",
						level: 2,
						children: [textRecord(tree, heading, "Title")],
					},
					{
						ref: tree.reference(paragraph),
						type: "paragraph",
						children: [textRecord(tree, paragraph, "Summary")],
					},
				],
			},
		],
	});
	expect(links.entries).toEqual([
		{ ref: root, url: storyUrl, label: "TitleSummary", labelTruncated: false },
	]);
	expect(headings.entries).toHaveLength(1);
	expect(headings.entries[0]).toMatchObject({
		ref: tree.reference(heading),
		level: 2,
	});
	expect(extractDocument(tree, { root }).content).toBe(
		`## [Title](<${storyUrl}>)\n\n[Summary](<${storyUrl}>)\n`,
	);
	expect(extractDocument(tree, { root, format: "json" })).toEqual(structured);
	expect(discoverDocumentLinks(tree, "/story")).toEqual(links);
	expect(discoverDocumentHeadings(tree)).toEqual(headings);
	expect(serializeHtml(tree)).toBe(source);
	expect(tree.revision).toBe(revision);
	expect(tree.resolve(root).id).toBe(anchor);
});

it("scopes to the selected source root and reflects content and href mutations", () => {
	const tree = fixture(
		'<aside>Outside</aside><main><a href="/story"><h2>Title</h2><p>Summary</p></a></main>',
	);
	const queries = new DocumentQueries(tree);
	const anchor = queries.querySelector("a") as number;
	const heading = queries.querySelector("h2") as number;
	const root = tree.reference(anchor);
	expect(extractDocument(tree, { root }).content).toBe(
		`## [Title](<${storyUrl}>)\n\n[Summary](<${storyUrl}>)\n`,
	);
	expect(extractDocument(tree, { root: tree.reference(heading) }).content).toBe(
		"## Title\n",
	);
	setInnerHtml(tree, anchor, "<div><h3>Changed</h3><p>New summary</p></div>");
	tree.setAttribute(anchor, "href", "/updated");
	const after = extractDocument(tree, { root });
	expect(after.content).toBe(
		"### [Changed](<https://block-links.fixture.invalid/updated>)\n\n[New summary](<https://block-links.fixture.invalid/updated>)\n",
	);
	expect(after.revision).toBe(tree.revision);
	expect(after.scope).toBe(root);
	tree.setAttribute(anchor, "href", "javascript:bad()");
	expect(extractDocument(tree, { root }).content).toBe(
		"### Changed\n\nNew summary\n",
	);
	tree.remove(anchor);
	expect(() => extractDocument(tree, { root })).toThrow();
});

it.each(["markdown", "json"] as const)(
	"enforces exact serialized UTF-8 output and source structure quotas for %s",
	(format) => {
		const tree = fixture();
		const anchor = append(tree, tree.root, "a", undefined, { href: "/story" });
		const wrapper = append(tree, anchor, "div");
		append(tree, wrapper, "h2", "界😀");
		append(tree, wrapper, "p", "Résumé");
		const options = { root: tree.reference(anchor), format };
		const result = extractDocument(tree, options);
		const maxBytes = new TextEncoder().encode(JSON.stringify(result)).length;
		expect(
			extractDocument(tree, { ...options, maxBytes, maxNodes: 6, maxDepth: 3 }),
		).toEqual(result);
		for (const limits of [
			{ maxBytes: maxBytes - 1 },
			{ maxNodes: 5 },
			{ maxDepth: 2 },
		]) {
			expect(() => extractDocument(tree, { ...options, ...limits })).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		}
		expect(extractDocument(tree, options)).toEqual(result);
	},
);

it("includes literal code and its escaped fallback in the exact output byte quota", () => {
	const code = "界😀".repeat(32);
	const tree = fixture(`<a href="/story?a=1&amp;b=2"><pre>${code}</pre></a>`);
	const result = extractDocument(tree);
	expect(result.content).toBe(
		`\`\`\`\n${code}\n\`\`\`\n\n<${storyUrl}?a=1&amp;b=2>\n`,
	);
	const maxBytes = new TextEncoder().encode(JSON.stringify(result)).length;
	expect(extractDocument(tree, { maxBytes })).toEqual(result);
	expect(() => extractDocument(tree, { maxBytes: maxBytes - 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("bounds deeply wrapped block links at the exact source depth", () => {
	const tree = fixture();
	const root = append(tree, tree.root, "span");
	let parent = root;
	for (let depth = 1; depth < 200; depth++)
		parent = append(tree, parent, "span");
	const anchor = append(tree, parent, "a", undefined, { href: "/story" });
	append(tree, anchor, "h2", "Deep");
	const options = { root: tree.reference(root), maxNodes: 203, maxDepth: 202 };
	expect(extractDocument(tree, options).content).toBe(
		`## [Deep](<${storyUrl}>)\n`,
	);
	for (const limits of [{ maxNodes: 202 }, { maxDepth: 201 }])
		expect(() => extractDocument(tree, { ...options, ...limits })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});

it("counts source nodes rather than repeated destinations for wide block links", () => {
	const tree = fixture();
	const anchor = append(tree, tree.root, "a", undefined, { href: "/story" });
	const groups: string[] = [];
	for (let index = 0; index < 48; index++) {
		append(tree, anchor, "p", `Group ${index}`);
		groups.push(`[Group ${index}](<${storyUrl}>)`);
	}
	const options = { root: tree.reference(anchor), maxNodes: 97, maxDepth: 2 };
	expect(extractDocument(tree, options).content).toBe(
		`${groups.join("\n\n")}\n`,
	);
	expect(() => extractDocument(tree, { ...options, maxNodes: 96 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([{}, { compactTables: true }, { tableRows: true }])(
	"keeps table-inside-link unsupported for Markdown with %j",
	(options) => {
		const tree = fixture();
		const anchor = append(tree, tree.root, "a", undefined, { href: "/story" });
		const wrapper = append(tree, anchor, "div");
		append(tree, wrapper, "h2", "Title");
		const table = append(tree, wrapper, "table");
		const row = append(tree, table, "tr");
		append(tree, row, "td", "Cell");
		const root = tree.reference(anchor);
		const structured = extractDocument(tree, { root, format: "json" });
		expect(JSON.stringify(structured.content)).toContain('"type":"table"');
		expect(() => extractDocument(tree, { root, ...options })).toThrow(
			expect.objectContaining({
				code: "unsupported",
				message: "Unsupported table extraction structure",
			}),
		);
		expect(extractDocument(tree, { root, format: "json" })).toEqual(structured);
	},
);
