import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { discoverDocumentLinks, extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

const url = "https://empty-links.fixture.invalid/article";
const trees: DocumentTree[] = [];

function fixture(source: string) {
	const tree = parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it.each([
	"",
	" ",
	"\t\n ",
	"&nbsp;",
	"<span></span>",
	"<strong><em> </em></strong>",
	"<img alt=''>",
	"<code></code>",
])("omits an empty Markdown destination wrapper for %j", (label) => {
	const tree = fixture(`<h2>Heading<a href="#heading">${label}</a></h2>`);
	expect(extractDocument(tree).content).toBe("## Heading\n");
});

it.each([
	{ label: "", expected: "Beforeafter\n" },
	{ label: " \t ", expected: "Before after\n" },
	{ label: "<br>", expected: "Before  \nafter\n" },
])(
	"preserves neighboring text and whitespace for $label",
	({ label, expected }) => {
		const tree = fixture(`<p>Before<a href="/empty">${label}</a>after</p>`);
		expect(extractDocument(tree).content).toBe(expected);
	},
);

it.each([
	{ label: "Read", expected: "Read" },
	{ label: "<strong>Read</strong>", expected: "Read" },
	{ label: '<img alt="Diagram">', expected: "Diagram" },
	{ label: "<code> </code>", expected: "` `" },
	{ label: "\u200b", expected: "\\\\u\\{200b\\}" },
])("keeps a rendered label for $label", ({ label, expected }) => {
	const tree = fixture(`<p><a href="/next">${label}</a></p>`);
	expect(extractDocument(tree).content).toBe(
		`[${expected}](<https://empty-links.fixture.invalid/next>)\n`,
	);
});

it("does not invent text from title or ARIA labels", () => {
	const tree = fixture(
		'<p>Body<a href="/next" title="Permalink" aria-label="Hidden label"></a></p>',
	);
	expect(extractDocument(tree).content).toBe("Body\n");
});

it("preserves URL escaping and destination safety for nonempty links", () => {
	const tree = fixture(
		'<p><a href="/next?a=1&amp;b=2">A &amp; B</a> <a href="javascript:bad()">Blocked</a> <a href="https://user:secret@example.com">Credentials</a></p>',
	);
	expect(extractDocument(tree).content).toBe(
		"[A &amp; B](<https://empty-links.fixture.invalid/next?a=1&amp;b=2>) Blocked Credentials\n",
	);
});

it("keeps empty anchor records in JSON and explicit link discovery", () => {
	const tree = fixture(
		'<main><a id="empty" href="/next"></a><p>Body</p></main>',
	);
	const queries = new DocumentQueries(tree);
	const reference = tree.reference(queries.querySelector("a") as number);
	const before = extractDocument(tree, { root: reference, format: "json" });
	expect(before.content).toEqual({
		ref: reference,
		type: "link",
		url: "https://empty-links.fixture.invalid/next",
		children: [],
	});
	const links = discoverDocumentLinks(tree, "/next");
	expect(links.entries).toEqual([
		{
			ref: reference,
			url: "https://empty-links.fixture.invalid/next",
			label: "",
			labelTruncated: false,
		},
	]);
	const revision = tree.revision;
	expect(extractDocument(tree, { root: reference }).content).toBe("");
	expect(extractDocument(tree).content).toBe("Body\n");
	expect(extractDocument(tree, { root: reference, format: "json" })).toEqual(
		before,
	);
	expect(discoverDocumentLinks(tree, "/next")).toEqual(links);
	expect(tree.revision).toBe(revision);
});

it.each(["default", "long-v1"] as const)(
	"omits reader-stripped icon links without changing article content (%s)",
	(profile) => {
		const source =
			'<div class="article"><h1><a href="#title"><svg><path d="M0 0"/></svg></a>Title</h1><p>Read <a href="/next">Next</a></p><pre>if ready:\n    run()</pre></div>';
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
				tabId: "empty-links",
				signal: new AbortController().signal,
				limits: {
					maxNodes: 50000,
					maxDepth: 128,
					maxTextCodeUnits: 2000000,
					maxChanges: 1024,
				},
			},
			profile,
			"separate-omitted-raw-v1",
		);
		trees.push(tree);
		const reference = tree.reference(
			new DocumentQueries(tree).querySelector(".article") as number,
		);
		const report = extractDocument(tree, { root: reference });
		expect(report.content).toBe(
			"# Title\n\nRead [Next](<https://empty-links.fixture.invalid/next>)\n\n```\nif ready:\n    run()\n```\n",
		);
		expect(report.reader).toMatchObject({
			scripting: false,
			styling: false,
			partial: true,
		});
	},
);

it.each([false, true])(
	"preserves empty list and table structure (compact=%s)",
	(compactTables) => {
		const tree = fixture(
			'<ul><li><a href="/empty"></a></li><li>Useful</li></ul><table><tr><td><a href="/empty"></a></td><td>Cell</td></tr></table>',
		);
		const report = extractDocument(tree, { compactTables });
		expect(report.content).not.toContain("/empty");
		expect(String(report.content).match(/^- +$/gm)).toHaveLength(1);
		expect(report.content).toContain("Useful");
		expect(report.content).toContain("Cell");
		expect(report.content).toContain("table");
	},
);

it.each(["", "Deep"])(
	"handles nested native links without nested Markdown wrappers (%j)",
	(text) => {
		const tree = new DocumentTree(url);
		trees.push(tree);
		let parent = tree.root;
		for (let index = 0; index < 80; index++) {
			const anchor = tree.createElement("a", { href: `/link-${index}` });
			tree.append(parent, anchor);
			parent = anchor;
		}
		if (text) tree.append(parent, tree.createText(text));
		expect(extractDocument(tree, { maxDepth: 128 }).content).toBe(
			text ? "[Deep](<https://empty-links.fixture.invalid/link-0>)\n" : "",
		);
		expect(() => extractDocument(tree, { maxDepth: 20 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("does not bypass structure or intermediate budgets when empty links emit no URL", () => {
	const tree = fixture(`<p>Body</p>${'<a href="/empty"></a>'.repeat(200)}`);
	expect(extractDocument(tree, { maxBytes: 512 }).content).toBe("Body\n");
	expect(() => extractDocument(tree, { maxNodes: 20 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => extractDocument(tree, { maxDepth: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const oversized = new DocumentTree(url, { maxTextCodeUnits: 8_000_000 });
	trees.push(oversized);
	for (let index = 0; index < 5; index++) {
		const anchor = oversized.createElement("a", {
			href: `/${"x".repeat(900_000)}`,
		});
		oversized.append(oversized.root, anchor);
	}
	expect(() => extractDocument(oversized, { maxBytes: 512 })).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "Extraction intermediate limit exceeded",
		}),
	);
});
