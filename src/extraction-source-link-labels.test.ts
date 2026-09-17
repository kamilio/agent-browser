import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { extractDocument, type ExtractionOptions } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";
import { sourceLinkLabelLimits } from "./source-link-labels.js";

const url = "https://source-labels.fixture.invalid/article";
const policy = "source-aria-label-v1" as const;
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(source: string) {
	const tree = parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function labeled(tree: DocumentTree, options: ExtractionOptions = {}) {
	return extractDocument(tree, { ...options, sourceLinkLabelPolicy: policy });
}

it("preserves the default no-invented-label contract and opts in explicitly", () => {
	const tree = fixture(
		'<p>Before<a href="/author" aria-label="Author profile"></a>after</p>',
	);
	const before = extractDocument(tree);
	const revision = tree.revision;
	expect(before.content).toBe("Beforeafter\n");
	expect(before).not.toHaveProperty("sourceLinkLabels");
	expect(labeled(tree)).toMatchObject({
		content:
			"Before[Source aria\\-label: Author profile](<https://source-labels.fixture.invalid/author>)after\n",
		sourceLinkLabels: {
			policy,
			attribute: "aria-label",
			rendered: false,
			verified: false,
			links: 1,
			truncatedLabels: 0,
			omittedCandidates: 0,
		},
	});
	expect(Object.isFrozen(labeled(tree).sourceLinkLabels)).toBe(true);
	expect(extractDocument(tree)).toEqual(before);
	expect(tree.revision).toBe(revision);
});

it("recovers three reader-stripped SVG profile links without executing SVG or scripts", () => {
	const source =
		'<main><h1>Article</h1><p>Substantive prose.</p><a href="/social" aria-label="Author on social"><svg><title>SVG social</title></svg></a><a href="/code" aria-label="Author code"><svg><path d="M0 0"/></svg></a><a href="/home" aria-label="Author home"><svg><title>SVG home</title></svg></a><pre>const answer = 42;</pre></main>';
	const body = new TextEncoder().encode(source);
	const tree = loadResearchDocument(
		{
			url,
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.length,
			elapsedMs: 0,
			redirects: [],
		},
		{
			tabId: "source-labels",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50000,
				maxDepth: 128,
				maxTextCodeUnits: 2000000,
				maxChanges: 1024,
			},
		},
		"default",
		"separate-omitted-raw-v1",
	);
	trees.push(tree);
	const before = extractDocument(tree);
	expect(before.content).not.toContain("/social");
	const result = labeled(tree);
	expect(result.sourceLinkLabels?.links).toBe(3);
	for (const path of ["social", "code", "home"])
		expect(result.content).toContain(
			`https://source-labels.fixture.invalid/${path}`,
		);
	expect(result.content).not.toContain("SVG social");
	expect(result.content).toContain("Substantive prose\\.");
	expect(result.content).toContain("```\nconst answer = 42;\n```");
	expect(result.reader).toMatchObject({ scripting: false, styling: false });
	expect(extractDocument(tree)).toEqual(before);
});

it.each([
	"Read",
	"<strong>Read</strong>",
	'<img alt="Diagram">',
	"<code> </code>",
	"&#8203;",
])("does not override existing emitted descendant content: %s", (children) => {
	const tree = fixture(
		`<a href="/next" aria-label="Override forbidden">${children}</a>`,
	);
	expect(labeled(tree).content).toBe(extractDocument(tree).content);
	expect(labeled(tree).sourceLinkLabels?.links).toBe(0);
});

it.each([
	"",
	" ",
	"\t\n",
	"<span></span>",
	"<strong> </strong>",
	'<img alt="">',
	"<code></code>",
])(
	"adds a source annotation only when descendant output has no label: %j",
	(children) => {
		const tree = fixture(
			`<a href="/next" aria-label="Source name">${children}</a>`,
		);
		expect(labeled(tree).content).toContain("Source aria\\-label: Source name");
		expect(labeled(tree).sourceLinkLabels?.links).toBe(1);
	},
);

it.each([
	'title="Not an aria label"',
	'aria-labelledby="external"',
	'aria-label=""',
	'aria-label="  &#9; "',
])(
	"does not infer names from unsupported or empty declarations: %s",
	(attributes) => {
		const tree = fixture(
			`<a href="/next" ${attributes}></a><p id="external" hidden>Hidden name</p>`,
		);
		expect(labeled(tree).content).toBe(extractDocument(tree).content);
		expect(labeled(tree).sourceLinkLabels?.links).toBe(0);
	},
);

it.each([
	"javascript:bad()",
	"data:text/plain,bad",
	"file:///private",
	"mailto:private@example.com",
	"https://user:secret@example.com/",
])("does not annotate blocked destinations: %s", (href) => {
	const tree = fixture(`<a href="${href}" aria-label="Do not expose"></a>`);
	expect(labeled(tree).content).toBe("");
	expect(labeled(tree).sourceLinkLabels?.links).toBe(0);
});

it("does not annotate hidden links or foreign anchors", () => {
	const tree = fixture(
		'<a href="/hidden" style="display:none" aria-label="Hidden source"></a><svg><a href="/foreign" aria-label="Foreign source"></a></svg><p>Body</p>',
	);
	expect(labeled(tree).content).toBe(extractDocument(tree).content);
	expect(labeled(tree).sourceLinkLabels?.links).toBe(0);
});

it("leaves code and pre payloads literal without source-label insertion", () => {
	const tree = fixture(
		'<pre>start<a href="/inside" aria-label="Not code text"></a>end</pre><p><code>a<a href="/inline" aria-label="Not inline text"></a>b</code></p><a href="/code-block" aria-label="Not code override"><pre>actual code</pre></a>',
	);
	expect(labeled(tree).content).toBe(extractDocument(tree).content);
	expect(labeled(tree).sourceLinkLabels?.links).toBe(0);
});

it("labels a block-wrapping empty anchor without replacing existing paragraph text", () => {
	const tree = fixture(
		'<a href="/blank" aria-label="Empty card"><div><p> </p></div></a><a href="/full" aria-label="Unused"><p>Visible card</p></a>',
	);
	const result = labeled(tree);
	expect(result.content).toContain(
		"[Source aria\\-label: Empty card](<https://source-labels.fixture.invalid/blank>)",
	);
	expect(result.content).toContain(
		"[Visible card](<https://source-labels.fixture.invalid/full>)",
	);
	expect(result.content).not.toContain("Unused");
	expect(result.sourceLinkLabels?.links).toBe(1);
});

it.each([
	{},
	{ tableRows: true },
	{ compactTables: true },
	{ tableRows: true, compactTables: true },
])("preserves annotated links through table serialization %j", (options) => {
	const tree = fixture(
		'<table><tr><td><a href="/cell" aria-label="Cell link"></a></td><td>Value</td></tr></table>',
	);
	const result = labeled(tree, options);
	expect(result.content).toContain(
		"[Source aria\\-label: Cell link](<https://source-labels.fixture.invalid/cell>)",
	);
	expect(result.sourceLinkLabels?.links).toBe(1);
});

it("does not double-charge a table preview that falls back to structural output", () => {
	const tree = fixture(
		'<table><tr><td><a href="/cell" aria-label="Cell link"></a></td><td><p>First</p><p>Second</p></td></tr></table>',
	);
	const result = labeled(tree, { tableRows: true });
	expect(result.content).toContain("Source aria\\-label: Cell link");
	expect(result.sourceLinkLabels?.links).toBe(1);
});

it("keeps nested declarations from activating a second destination", () => {
	const tree = new DocumentTree(url);
	trees.push(tree);
	const outer = tree.createElement("a", {
		href: "/outer",
		"aria-label": "Outer",
	});
	const inner = tree.createElement("a", {
		href: "/inner",
		"aria-label": "Inner",
	});
	tree.append(tree.root, outer);
	tree.append(outer, inner);
	const result = labeled(tree);
	expect(result.content).toContain("/outer");
	expect(result.content).not.toContain("/inner");
	expect(result.content).not.toContain("Inner");
	expect(result.sourceLinkLabels?.links).toBe(1);
});

it("escapes source labels and preserves exact safe query destinations", () => {
	const tree = fixture(
		'<a href="/next?a=1&amp;b=2" aria-label="A &amp; B [label](bad) &lt;tag&gt; &#x202e;"></a>',
	);
	const result = labeled(tree);
	expect(result.content).toContain(
		"A &amp; B \\[label\\]\\(bad\\) &lt;tag&gt; \\\\u\\{202e\\}",
	);
	expect(result.content).toContain(
		"https://source-labels.fixture.invalid/next?a=1&amp;b=2",
	);
	expect(result.content).not.toContain("\u202e");
});

it("limits actual fallback labels and explicitly counts omitted candidates", () => {
	const anchors = Array.from(
		{ length: sourceLinkLabelLimits.maxLinks + 1 },
		(_, index) => `<a href="/${index}" aria-label="Name"></a>`,
	).join("");
	const result = labeled(
		fixture(`<main><p>Readable body</p>${anchors}</main>`),
	);
	expect(result.content).toContain("Readable body");
	expect(result.sourceLinkLabels).toMatchObject({
		links: sourceLinkLabelLimits.maxLinks,
		omittedCandidates: 1,
		truncatedLabels: 0,
	});
	expect(result.content).not.toContain(
		`<https://source-labels.fixture.invalid/${sourceLinkLabelLimits.maxLinks}>`,
	);
});

it("does not spend fallback budgets on already-labeled links", () => {
	const anchors = Array.from(
		{ length: sourceLinkLabelLimits.maxLinks + 1 },
		(_, index) => `<a href="/${index}" aria-label="Unused">Visible</a>`,
	).join("");
	const result = labeled(
		fixture(`${anchors}<a href="/last" aria-label="Needed"></a>`),
	);
	expect(result.content).toContain("Source aria\\-label: Needed");
	expect(result.sourceLinkLabels).toMatchObject({
		links: 1,
		omittedCandidates: 0,
	});
});

it("marks bounded source-name truncation instead of silently returning a full name", () => {
	const tree = fixture(
		`<a href="/long" aria-label="${"name".repeat(300)}"></a>`,
	);
	const result = labeled(tree);
	expect(result.content).toContain("Source aria\\-label \\(truncated\\): ");
	expect(result.sourceLinkLabels).toMatchObject({
		links: 1,
		truncatedLabels: 1,
	});
});

it("limits annotations to the selected root or heading section", () => {
	const tree = fixture(
		'<a href="/outside" aria-label="Outside"></a><main><h2 id="start">Start</h2><a href="/inside" aria-label="Inside"></a><h2>End</h2><a href="/later" aria-label="Later"></a></main>',
	);
	const queries = new DocumentQueries(tree);
	const heading = tree.reference(queries.querySelector("#start") as number);
	const selected = labeled(tree, { section: heading });
	expect(selected.content).toContain("Source aria\\-label: Inside");
	expect(selected.content).not.toContain("/outside");
	expect(selected.content).not.toContain("/later");
	expect(selected.sourceLinkLabels?.links).toBe(1);
	const focused = labeled(tree, { contentFocus: "main-content-v3" });
	expect(focused.content).not.toContain("/outside");
	expect(focused.sourceLinkLabels?.links).toBe(2);
});

it("retains the existing extraction output bound", () => {
	const tree = fixture(
		`<a href="/long" aria-label="${"name".repeat(250)}"></a>`,
	);
	expect(() => extractDocument(tree, { maxBytes: 500 })).not.toThrow();
	expect(() => labeled(tree, { maxBytes: 500 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	{ format: "json" },
	{ lines: { start: 1, end: 1 } },
	{ jsonPointer: "/name" },
	{ outputLimitPolicy: "text-prefix-v1" },
] as const)(
	"rejects incompatible source-label modes instead of silently ignoring them: %j",
	(options) => {
		expect(() => labeled(fixture("<p>Body</p>"), options)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each(["", "other", true, null, {}, 1])(
	"rejects invalid policy %j",
	(value) => {
		expect(() =>
			extractDocument(fixture("<p>Body</p>"), {
				sourceLinkLabelPolicy: value as typeof policy,
			}),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);
