import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

const url = "https://table-rows.fixture.invalid/article";
const begin =
	"**Native table begin (selected structure only; associations unspecified)**";
const end = "**Native table end**";
const trees: DocumentTree[] = [];

function fixture(source: string) {
	const tree = parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function append(
	tree: DocumentTree,
	parent: number,
	tag: string,
	text?: string,
) {
	const node = tree.createElement(tag);
	tree.append(parent, node);
	if (text !== undefined) tree.append(node, tree.createText(text));
	return node;
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it.each(["markdown", "json"] as const)(
	"keeps default and disabled %s output identical",
	(format) => {
		const tree = fixture("<table><tr><td>Value</td></tr></table>");
		const original = extractDocument(tree, { format });
		expect(extractDocument(tree, { format, tableRows: false })).toEqual(
			original,
		);
		expect(original).not.toHaveProperty("tableRows");
	},
);

it.each(["true", "false", 0, 1, null, [], {}].map((value) => ({ value })))(
	"rejects a nonboolean row-list option: $value",
	({ value }) => {
		const tree = fixture("<p>Body</p>");
		expect(() =>
			extractDocument(tree, { tableRows: value as boolean }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it("requires Markdown and discloses the preference even without tables", () => {
	const tree = fixture("<p>Body</p>");
	expect(() =>
		extractDocument(tree, { format: "json", tableRows: true }),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(extractDocument(tree, { tableRows: true })).toEqual({
		...extractDocument(tree),
		tableRows: true,
	});
});

it("renders source row/cell order without promoting the first row to headers", () => {
	const tree = fixture(
		'<table><tbody><tr><td>Feature</td><td>Support</td></tr><tr><th scope="row">Quantization</th><td><p>Available</p></td></tr></tbody></table>',
	);
	const structured = extractDocument(tree, { format: "json" });
	const revision = tree.revision;
	expect(extractDocument(tree, { tableRows: true }).content).toBe(
		[
			begin,
			"- Row 1",
			"  - Cell 1: Feature",
			"  - Cell 2: Support",
			"- Row 2",
			"  - Cell 1: Quantization",
			"  - Cell 2: Available",
			end,
			"",
		].join("\n"),
	);
	expect(extractDocument(tree, { format: "json" })).toEqual(structured);
	expect(tree.revision).toBe(revision);
});

it("retains links, escaped delimiters, inline code and image alternatives", () => {
	const tree = fixture(
		'<table><tr><td>雪|GPU-A <a href="/next?a=1&amp;b=2">Details</a></td><td><code>value`code</code></td><td><img alt="Diagram"><a href="/empty"></a></td></tr></table>',
	);
	const report = extractDocument(tree, { tableRows: true });
	expect(report.content).toContain(
		"  - Cell 1: 雪\\|GPU\\-A [Details](<https://table-rows.fixture.invalid/next?a=1&amp;b=2>)",
	);
	expect(report.content).toContain("  - Cell 2: `` value`code ``");
	expect(report.content).toContain("  - Cell 3: Diagram");
	expect(report.content).not.toContain("/empty");
});

it("retains empty cells, empty rows and empty tables", () => {
	const tree = new DocumentTree(url);
	trees.push(tree);
	const table = append(tree, tree.root, "table");
	append(tree, table, "tr");
	const row = append(tree, table, "tr");
	append(tree, row, "td");
	append(tree, tree.root, "table");
	expect(extractDocument(tree, { tableRows: true }).content).toBe(
		`${begin}\n- Row 1\n- Row 2\n  - Cell 1:\n${end}\n\n${begin}\n${end}\n`,
	);
});

it("keeps physical cell order for spans without inventing grid coordinates", () => {
	const tree = fixture(
		'<table><tr><th colspan="2">Wide</th><td rowspan="2">Tall</td></tr><tr><td>Next</td></tr></table>',
	);
	const report = extractDocument(tree, { tableRows: true });
	expect(report.content).toBe(
		`${begin}\n- Row 1\n  - Cell 1: Wide\n  - Cell 2: Tall\n- Row 2\n  - Cell 1: Next\n${end}\n`,
	);
	expect(report.content).not.toContain("| ---");
});

it.each([
	"<caption>Caption</caption><tr><td>Value</td></tr>",
	"<tr><td><p>First</p><p>Second</p></td></tr>",
	"<tr><td><pre>if ready:\n    run()</pre></td></tr>",
	"<tr><td><ul><li>Item</li></ul></td></tr>",
	"<tr><td><blockquote>Quote</blockquote></td></tr>",
	"<tr><td>Before<br>After</td></tr>",
	"<tr><td><span><pre>code\n    indentation</pre></span></td></tr>",
	"<tr><td><span><ul><li>Wrapped item</li></ul></span></td></tr>",
	"<tr><td><span><div>Wrapped block</div></span></td></tr>",
])("retains exact boundary fallback for complex content: %s", (source) => {
	const tree = fixture(`<table>${source}</table>`);
	for (const compactTables of [false, true]) {
		const original = extractDocument(tree, { compactTables });
		expect(extractDocument(tree, { compactTables, tableRows: true })).toEqual({
			...original,
			tableRows: true,
		});
	}
});

it("retains nested table relationships and restores following standalone context", () => {
	const tree = new DocumentTree(url);
	trees.push(tree);
	const outer = append(tree, tree.root, "table");
	const outerRow = append(tree, outer, "tr");
	const outerCell = append(tree, outerRow, "td");
	append(tree, outerCell, "p", "Before nested");
	const inner = append(tree, outerCell, "table");
	const innerRow = append(tree, inner, "tr");
	append(tree, innerRow, "td", "Inner");
	append(tree, outerCell, "p", "After nested");
	append(tree, tree.root, "td", "Standalone");
	const report = extractDocument(tree, {
		tableRows: true,
		compactTables: true,
	});
	expect(String(report.content).match(/\*\*Native table begin/g)).toHaveLength(
		2,
	);
	expect(String(report.content).match(/\*\*Native table end/g)).toHaveLength(2);
	expect(report.content).toContain("  - Cell 1: Inner");
	expect(report.content).toContain("Before nested");
	expect(report.content).toContain("After nested");
	expect(report.content).toContain(
		"**Native cell begin (selected structure only)**\n\nStandalone",
	);
});

it.each(["tr", "td", "th"])(
	"keeps partial %s scopes as boundary output",
	(tag) => {
		const tree = fixture(
			`<table><tr><${tag === "th" ? "th" : "td"}>Value</${tag === "th" ? "th" : "td"}></tr></table>`,
		);
		const root = tree.reference(
			new DocumentQueries(tree).querySelector(tag) as number,
		);
		const original = extractDocument(tree, { root });
		expect(extractDocument(tree, { root, tableRows: true })).toEqual({
			...original,
			tableRows: true,
		});
	},
);

it.each(["p", "h2", "code", "a"])(
	"does not evade structural rejection below %s",
	(tag) => {
		const tree = new DocumentTree(url);
		trees.push(tree);
		const parent = append(tree, tree.root, tag);
		const table = append(tree, parent, "table");
		const row = append(tree, table, "tr");
		append(tree, row, "td", "Value");
		expect(() => extractDocument(tree, { tableRows: true })).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("preserves outer list/blockquote prefixes", () => {
	const tree = fixture(
		"<blockquote><ol><li><table><tr><td>Inside</td></tr></table></li></ol></blockquote>",
	);
	const content = extractDocument(tree, { tableRows: true }).content;
	expect(content).toContain(`> 1. ${begin}`);
	expect(content).toContain(">    - Row 1");
	expect(content).toContain(">      - Cell 1: Inside");
});

it("does not infer native tables from ARIA roles or expose omitted values", () => {
	const tree = fixture(
		'<div role="table"><div role="row"><span role="cell">ARIA source</span></div></div><table><tr><td><span hidden>Hidden</span>Visible<input value="SYNTHETIC_PRIVATE"></td></tr></table>',
	);
	const content = extractDocument(tree, { tableRows: true }).content;
	expect(String(content).match(/\*\*Native table begin/g)).toHaveLength(1);
	expect(content).toContain("ARIA source");
	expect(content).toContain("  - Cell 1: Visible");
	expect(content).not.toContain("Hidden");
	expect(content).not.toContain("SYNTHETIC_PRIVATE");
});

it("charges final output bytes and original structure instead of dropping cells", () => {
	const tree = fixture(
		`<table>${"<tr><td>GPU</td><td>Supported</td><td></td></tr>".repeat(24)}</table>`,
	);
	const report = extractDocument(tree, { tableRows: true });
	const bytes = new TextEncoder().encode(JSON.stringify(report)).length;
	expect(extractDocument(tree, { tableRows: true, maxBytes: bytes })).toEqual(
		report,
	);
	expect(() =>
		extractDocument(tree, { tableRows: true, maxBytes: bytes - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() => extractDocument(tree, { maxBytes: bytes })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	for (const limits of [{ maxNodes: 5 }, { maxDepth: 2 }])
		expect(() => extractDocument(tree, { ...limits, tableRows: true })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	expect(String(report.content).match(/ {2}- Cell /g)).toHaveLength(72);
});
