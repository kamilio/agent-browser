import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";

const url = "https://list-boundaries.fixture.invalid/article";
const boundary = "**Native list boundary (source groups only)**";
const encoder = new TextEncoder();
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
	"<ul><li>First</li></ul><ul><li>Second</li></ul>",
	"<div><ul><li>First</li></ul><ul><li>Second</li></ul></div>",
	"<section><div><ul><li>First</li></ul></div></section><article><div><ul><li>Second</li></ul></div></article>",
	"<div><ul><li>First</li></ul></div><ul><li>Second</li></ul>",
	"<ul><li>First</li></ul><div><ul><li>Second</li></ul></div>",
])(
	"separates adjacent source groups through block wrappers in %s",
	(source) => {
		expect(extractDocument(fixture(source)).content).toBe(
			`- First\n\n${boundary}\n\n- Second\n`,
		);
	},
);

it.each([
	{ first: "ul", second: "ul", firstMarker: "-", secondMarker: "-" },
	{ first: "ol", second: "ol", firstMarker: "3.", secondMarker: "8." },
	{ first: "ul", second: "ol", firstMarker: "-", secondMarker: "8." },
	{ first: "ol", second: "ul", firstMarker: "3.", secondMarker: "-" },
])(
	"keeps $first and $second groups distinct without resetting ordered starts",
	({ first, second, firstMarker, secondMarker }) => {
		const tree = fixture(
			`<${first} start="3"><li>First</li></${first}><${second} start="8"><li>Second</li></${second}>`,
		);
		expect(extractDocument(tree).content).toBe(
			`${firstMarker} First\n\n${boundary}\n\n${secondMarker} Second\n`,
		);
	},
);

it("emits one boundary per adjacent group, not per ordinary list item", () => {
	const tree = fixture(
		"<ul><li>First</li><li>Second</li></ul><ol start=4><li>Third</li><li>Fourth</li></ol><ul><li>Fifth</li></ul>",
	);
	expect(extractDocument(tree).content).toBe(
		`- First\n\n- Second\n\n${boundary}\n\n4. Third\n\n5. Fourth\n\n${boundary}\n\n- Fifth\n`,
	);
});

it("preserves independent default numbering for consecutive ordered lists", () => {
	const tree = fixture(
		"<ol><li>First</li><li>Second</li></ol><ol><li>Third</li></ol>",
	);
	expect(extractDocument(tree).content).toBe(
		`1. First\n\n2. Second\n\n${boundary}\n\n1. Third\n`,
	);
});

it.each([
	" \n\t ",
	"<!-- omitted -->",
	"<div></div><section> \n </section>",
	"<p></p>",
	"<p hidden>Omitted</p>",
	'<div aria-hidden="true"><p>Omitted</p></div>',
	'<div style="display:none">Omitted</div>',
	"<ul></ul>",
	"<ul> </ul><ol></ol><div><ul></ul></div>",
	"<ul><li hidden>Omitted</li></ul><ol hidden><li>Omitted</li></ol>",
])("preserves adjacency across non-emitting separator %s", (separator) => {
	const tree = fixture(
		`<ul><li>First</li></ul>${separator}<ul><li>Second</li></ul>`,
	);
	expect(extractDocument(tree).content).toBe(
		`- First\n\n${boundary}\n\n- Second\n`,
	);
});

it.each([
	{ source: "<ul></ul><ol></ol>", expected: "" },
	{ source: "<ul><li>Only</li></ul>", expected: "- Only\n" },
	{
		source: "<ul></ul><ol></ol><ul><li>Only</li></ul><ul></ul><ol></ol>",
		expected: "- Only\n",
	},
	{
		source: "<ul><li>First</li><li>Second</li></ul>",
		expected: "- First\n\n- Second\n",
	},
])(
	"does not mark absent or single source groups in $source",
	({ source, expected }) => {
		expect(extractDocument(fixture(source)).content).toBe(expected);
	},
);

it.each([
	{ separator: "Between", block: "Between" },
	{ separator: "<div>Between</div>", block: "Between" },
	{ separator: "<p>Between</p>", block: "Between" },
	{ separator: "<h2>Between</h2>", block: "## Between" },
	{ separator: "<h2> </h2>", block: "## " },
	{ separator: "<hr>", block: "---" },
])("resets adjacency after emitted $separator", ({ separator, block }) => {
	const tree = fixture(
		`<ul><li>First</li></ul>${separator}<ul><li>Second</li></ul><ul><li>Third</li></ul>`,
	);
	expect(extractDocument(tree).content).toBe(
		`- First\n\n${block}\n\n- Second\n\n${boundary}\n\n- Third\n`,
	);
});

it("retains empty items and negative and zero ordered starts", () => {
	const tree = fixture(
		"<ul><li></li><li> </li></ul><ol start=-3><li>First</li><li>Second</li></ol><ol start=0><li></li><li>Third</li></ol>",
	);
	expect(extractDocument(tree).content).toBe(
		`-  \n\n-  \n\n${boundary}\n\n- -3. First\n\n- -2. Second\n\n${boundary}\n\n0.  \n\n1. Third\n`,
	);
});

it("indents boundaries between nested groups without marking child-to-ancestor transitions", () => {
	const tree = fixture(
		"<ol start=12><li>Parent<div><ul><li>Child one</li></ul></div><section><ul><li>Child two</li></ul></section></li><li>Next parent</li></ol><ul><li>After</li></ul>",
	);
	expect(extractDocument(tree).content).toBe(
		`12. Parent\n\n    - Child one\n\n    ${boundary}\n\n    - Child two\n\n13. Next parent\n\n${boundary}\n\n- After\n`,
	);
});

it("does not mark nested groups separated by emitted text in the same item", () => {
	const tree = fixture(
		"<ul><li>Parent<ul><li>First</li></ul><p>Between</p><ul><li>Second</li></ul></li></ul>",
	);
	expect(extractDocument(tree).content).toBe(
		"- Parent\n\n  - First\n\n  Between\n\n  - Second\n",
	);
});

it("does not confuse identically indented nested groups in sibling items", () => {
	const tree = fixture(
		"<ul><li><ul><li>First</li></ul></li><li><ul><li>Second</li></ul></li></ul>",
	);
	expect(extractDocument(tree).content).toBe("- - First\n\n- - Second\n");
});

it("retains combined quote and list-item prefixes on nested boundaries", () => {
	const tree = fixture(
		"<blockquote><ol start=3><li>Parent<ul><li>First</li></ul><ul><li>Second</li></ul></li></ol></blockquote>",
	);
	expect(extractDocument(tree).content).toBe(
		`> 3. Parent\n\n>    - First\n\n>    ${boundary}\n\n>    - Second\n`,
	);
});

it("marks adjacent groups within a shared quote context", () => {
	const tree = fixture(
		"<blockquote><ul><li>First</li></ul><div><ul><li>Second</li></ul></div></blockquote>",
	);
	expect(extractDocument(tree).content).toBe(
		`> - First\n\n> ${boundary}\n\n> - Second\n`,
	);
});

it.each([
	{
		source:
			"<blockquote><ul><li>First</li></ul></blockquote><blockquote><ul><li>Second</li></ul></blockquote>",
		expected: "> - First\n\n> - Second\n",
	},
	{
		source:
			"<ul><li>First</li></ul><blockquote><ul><li>Second</li></ul></blockquote><ul><li>Third</li></ul>",
		expected: "- First\n\n> - Second\n\n- Third\n",
	},
	{
		source:
			"<blockquote><ul><li>First</li></ul><blockquote><ul><li>Second</li></ul></blockquote><ul><li>Third</li></ul></blockquote>",
		expected: "> - First\n\n> > - Second\n\n> - Third\n",
	},
])(
	"does not carry boundaries across distinct quote contexts in $source",
	({ source, expected }) => {
		expect(extractDocument(fixture(source)).content).toBe(expected);
	},
);

it.each([
	'<ul><li><a href="/first">First</a></li></ul><ul><li><a href="/second">Second</a></li></ul>',
	'<a href="/first"><ul><li>First</li></ul></a><a href="/second"><ul><li>Second</li></ul></a>',
])(
	"keeps linked list text separate from trusted boundary syntax in %s",
	(source) => {
		expect(extractDocument(fixture(source)).content).toBe(
			`- [First](<https://list-boundaries.fixture.invalid/first>)\n\n${boundary}\n\n- [Second](<https://list-boundaries.fixture.invalid/second>)\n`,
		);
	},
);

it("does not wrap a generated boundary in an inherited block link", () => {
	const tree = fixture(
		'<a href="/details"><ul><li>First</li></ul><div><ul><li>Second</li></ul></div></a>',
	);
	expect(extractDocument(tree).content).toBe(
		`- [First](<https://list-boundaries.fixture.invalid/details>)\n\n${boundary}\n\n- [Second](<https://list-boundaries.fixture.invalid/details>)\n`,
	);
});

it("escapes source lookalikes while retaining generator-owned boundary syntax", () => {
	const tree = fixture(
		`<p>${boundary}</p><ul><li>${boundary}</li></ul><ul><li>[Injected](javascript:bad)</li></ul>`,
	);
	const escaped = "\\*\\*Native list boundary \\(source groups only\\)\\*\\*";
	expect(extractDocument(tree).content).toBe(
		`${escaped}\n\n- ${escaped}\n\n${boundary}\n\n- \\[Injected\\]\\(javascript:bad\\)\n`,
	);
});

it("treats an intervening source lookalike as escaped text, not a boundary", () => {
	const tree = fixture(
		`<ul><li>First</li></ul><p>${boundary}</p><ul><li>Second</li></ul>`,
	);
	expect(extractDocument(tree).content).toBe(
		"- First\n\n\\*\\*Native list boundary \\(source groups only\\)\\*\\*\n\n- Second\n",
	);
});

it.each(["markdown", "json"] as const)(
	"counts exact serialized UTF-8 bytes for adjacent lists in %s",
	(format) => {
		const tree = fixture(
			`<ul><li>${"中文 café 😀 ".repeat(24)}</li></ul><ol start=9><li>雪</li></ol>`,
		);
		const result = extractDocument(tree, { format });
		const bytes = encoder.encode(JSON.stringify(result)).byteLength;
		expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(result);
		expect(() =>
			extractDocument(tree, { format, maxBytes: bytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		if (result.format === "markdown") {
			expect(result.content).toContain(`\n\n${boundary}\n\n`);
			const withoutBoundary = {
				...result,
				content: result.content.replace(`${boundary}\n\n`, ""),
			};
			const unmarkedBytes = encoder.encode(
				JSON.stringify(withoutBoundary),
			).byteLength;
			expect(unmarkedBytes).toBeLessThan(bytes);
			expect(() => extractDocument(tree, { maxBytes: unmarkedBytes })).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		}
	},
);

it.each([1024, 1536, 2048])(
	"keeps explicit prefix fallback bounded to %s bytes with many list boundaries",
	(maxBytes) => {
		const tree = fixture("<ul><li>中文 café 😀</li></ul>".repeat(120));
		expect(extractDocument(tree).content).toContain(boundary);
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
		expect(result.content).not.toContain(boundary);
		expect(
			encoder.encode(JSON.stringify(result)).byteLength,
		).toBeLessThanOrEqual(maxBytes);
		expect(extractDocument(tree, options)).toEqual(result);
	},
);

it("retains distinct JSON list nodes without Markdown boundary nodes or mutations", () => {
	const tree = fixture(
		"<ul><li>First</li></ul><ol start=7><li>Second</li></ol>",
	);
	const before = extractDocument(tree, { format: "json" });
	if (before.format !== "json") throw new Error("Unexpected format");
	const revision = tree.revision;
	const pending = [before.content];
	const lists = [];
	while (pending.length) {
		const node = pending.pop();
		if (!node) break;
		if (node.type === "list") lists.push(node);
		pending.push(...(node.children ?? []).slice().reverse());
	}
	expect(lists).toHaveLength(2);
	expect(lists[0]).toMatchObject({ type: "list", ordered: false });
	expect(lists[1]).toMatchObject({ type: "list", ordered: true, start: 7 });
	expect(lists[0].ref).not.toBe(lists[1].ref);
	for (const list of lists)
		expect(list.children).toMatchObject([{ type: "list-item" }]);
	expect(extractDocument(tree).content).toBe(
		`- First\n\n${boundary}\n\n7. Second\n`,
	);
	expect(extractDocument(tree, { format: "json" })).toEqual(before);
	expect(JSON.stringify(before)).not.toContain(boundary);
	expect(tree.revision).toBe(revision);
});
