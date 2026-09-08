import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type ExtractedNode, extractDocument } from "./extraction.js";
import { setInnerHtml } from "./html-content.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

it("extracts live headings, paragraphs, links and stable structured references", () => {
	const tree = parseHtmlDocument(
		'<title>Example title</title><main><h1>Hello &amp; world</h1><p>Read <a href="/next">the next page</a>.</p></main>',
		"https://example.com/start",
	);
	try {
		const markdown = extractDocument(tree);
		expect(markdown).toMatchObject({
			format: "markdown",
			title: "Example title",
			url: "https://example.com/start",
			partial: true,
		});
		expect(markdown.content).toBe(
			"# Hello &amp; world\n\nRead [the next page](<https://example.com/next>)\\.\n",
		);
		const structured = extractDocument(tree, { format: "json" });
		expect(structured.format).toBe("json");
		expect(JSON.stringify(structured)).toContain('"type":"heading"');
		const reference = tree.reference(
			new DocumentQueries(tree).querySelector("a") as number,
		);
		expect(JSON.stringify(structured)).toContain(reference);
		expect(tree.resolve(reference).tagName).toBe("a");
	} finally {
		tree.close();
	}
});

it("scopes extraction to an attached reference and reflects post-load DOM mutations", () => {
	const tree = parseHtmlDocument(
		"<aside>Outside</aside><main><p>Before</p></main>",
		"https://example.com/",
	);
	try {
		const root = new DocumentQueries(tree).querySelector("main") as number;
		const ref = tree.reference(root);
		expect(extractDocument(tree, { root: ref }).content).toBe("Before\n");
		setInnerHtml(tree, root, "<h2>After</h2><p>New content</p>");
		const after = extractDocument(tree, { root: ref });
		expect(after.content).toBe("## After\n\nNew content\n");
		expect(after.revision).toBe(tree.revision);
		expect(after.content).not.toContain("Outside");
		tree.remove(root);
		expect(() => extractDocument(tree, { root: ref })).toThrow();
	} finally {
		tree.close();
	}
});

it("omits hidden content, executable source and form values while respecting visibility overrides", () => {
	const tree = parseHtmlDocument(
		'<style>.gone{display:none}.invisible{visibility:hidden}.visible{visibility:visible}</style><script>secret script</script><div hidden>Hidden</div><div class=gone>Gone</div><div aria-hidden=true>Aria hidden</div><div class=invisible>Invisible<span class=visible>Visible child</span></div><label>Name<input value="private input"></label><textarea>private textarea</textarea><select><option>private option</option></select><p>Public</p>',
		"https://example.com/",
	);
	try {
		for (const format of ["markdown", "json"] as const) {
			const result = JSON.stringify(extractDocument(tree, { format }));
			for (const value of [
				"secret script",
				"Hidden",
				"Gone",
				"Aria hidden",
				"Invisible",
				"private input",
				"private textarea",
				"private option",
			])
				expect(result).not.toContain(value);
			expect(result).toContain("Visible child");
			expect(result).toContain("Public");
		}
		const hidden = new DocumentQueries(tree).querySelector(
			"[hidden]",
		) as number;
		expect(
			extractDocument(tree, { root: tree.reference(hidden) }).content,
		).toBe("");
	} finally {
		tree.close();
	}
});

it("uses the live base URL and does not emit unsafe or credential-bearing link destinations", () => {
	const tree = parseHtmlDocument(
		'<base href="https://cdn.example.com/docs/"><p><a href="next?q=(test)">Safe</a> <a href="javascript:alert(1)">Script</a> <a href="data:text/html,secret">Data</a> <a href="https://user:secret@example.com/">Credential</a> <a href="file:///etc/passwd">File</a></p>',
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree);
		expect(result.content).toContain(
			"[Safe](<https://cdn.example.com/docs/next?q=(test)>)",
		);
		expect(result.content).toContain("Script Data Credential File");
		const json = JSON.stringify(extractDocument(tree, { format: "json" }));
		expect(json).toContain('"blocked":true');
		for (const value of ["javascript:", "data:text", "user:secret", "file:///"])
			expect(json).not.toContain(value);
	} finally {
		tree.close();
	}
});

it("escapes destination ampersands without changing the structured URL", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const anchor = tree.createElement("a", {
			href: "/next?name=&copy;&other=1",
		});
		tree.append(tree.root, anchor);
		tree.setTextContent(anchor, "Next");
		expect(extractDocument(tree).content).toBe(
			"[Next](<https://example.com/next?name=&amp;copy;&amp;other=1>)\n",
		);
		expect(JSON.stringify(extractDocument(tree, { format: "json" }))).toContain(
			"https://example.com/next?name=&copy;&other=1",
		);
	} finally {
		tree.close();
	}
});

it("renders lists, nested quotes, line breaks and code without accepting source Markdown syntax", () => {
	const tree = parseHtmlDocument(
		"<h2>1. [Injected](javascript:bad) &lt;script&gt;</h2><ol start=3><li>First</li><li>Second<ul><li>Nested</li></ul></li></ol><blockquote><p>Quoted<br>line</p></blockquote><pre><code>const value = `one`;\n```\n  indented\n</code></pre><p>Use <code>a`b</code>.</p>",
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree);
		expect(result.content).toContain(
			"## 1\\. \\[Injected\\]\\(javascript:bad\\) &lt;script&gt;",
		);
		expect(result.content).toContain("3. First");
		expect(result.content).toContain("4. Second");
		expect(result.content).toContain("   - Nested");
		expect(result.content).toContain("> Quoted  \n> line");
		expect(result.content).toContain(
			"````\nconst value = `one`;\n```\n  indented\n````",
		);
		expect(result.content).toContain("`` a`b ``");
	} finally {
		tree.close();
	}
});

it("uses image alternatives without creating auto-loaded Markdown images", () => {
	const tree = parseHtmlDocument(
		'<p>Image <img src="https://tracker.example/pixel" alt="A [diagram]"></p>',
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree);
		expect(result.content).toContain("A \\[diagram\\]");
		expect(result.content).not.toContain("![");
		expect(
			JSON.stringify(extractDocument(tree, { format: "json" })),
		).not.toContain("tracker.example");
	} finally {
		tree.close();
	}
});

it("enforces exact serialized UTF-8 output bounds and structural limits without partial results", () => {
	const tree = parseHtmlDocument(
		`<p>${"界".repeat(100)}</p>`,
		"https://example.com/",
	);
	try {
		for (const format of ["markdown", "json"] as const) {
			const result = extractDocument(tree, { format });
			const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
			expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(
				result,
			);
			expect(() =>
				extractDocument(tree, { format, maxBytes: bytes - 1 }),
			).toThrow("limit");
		}
		expect(() => extractDocument(tree, { maxNodes: 1 })).toThrow("limit");
		expect(() => extractDocument(tree, { maxDepth: 0 })).toThrow("limit");
		for (const options of [
			{ maxBytes: -1 },
			{ maxNodes: 0 },
			{ maxDepth: 1025 },
			{ format: "pdf" as "json" },
		])
			expect(() => extractDocument(tree, options)).toThrow();
	} finally {
		tree.close();
	}
});

it("does not consume document changes and escapes terminal controls in metadata and text", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const paragraph = tree.createElement("p");
		tree.append(tree.root, paragraph);
		tree.setTextContent(paragraph, "Hello\x1b[2J\u202e world");
		const revision = tree.revision;
		const result = extractDocument(tree);
		expect(result.content).not.toContain("\x1b");
		expect(result.content).not.toContain("\u202e");
		expect(tree.revision).toBe(revision);
		expect(extractDocument(tree)).toEqual(result);
	} finally {
		tree.close();
	}
});

it("keeps inline containers in the same paragraph and emits no text for empty code", () => {
	const tree = parseHtmlDocument(
		"<div>Hello <span>world</span>!<code></code> <strong>Bold</strong></div>",
		"https://example.com/",
	);
	try {
		expect(extractDocument(tree).content).toBe("Hello world\\! Bold\n");
	} finally {
		tree.close();
	}
});

it("does not inherit element mappings from Object.prototype", () => {
	const tree = parseHtmlDocument(
		"<constructor>One</constructor><toString>Two</toString><__proto__>Three</__proto__>",
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree, { format: "json" });
		if (result.format !== "json") throw new Error("Unexpected format");
		const pending = [result.content];
		while (pending.length) {
			const node = pending.pop();
			if (!node) break;
			expect(typeof node.type).toBe("string");
			pending.push(...(node.children ?? []));
		}
	} finally {
		tree.close();
	}
});

it("retains empty list items and negative ordered labels without fabricating a new start", () => {
	const tree = parseHtmlDocument(
		"<ul><li></li><li> </li></ul><ol start=-3><li>Minus three</li><li>Minus two</li></ol>",
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree);
		expect(String(result.content).match(/^- +$/gm)).toHaveLength(2);
		expect(result.content).toContain("- -3. Minus three");
		expect(result.content).toContain("- -2. Minus two");
		expect(JSON.stringify(extractDocument(tree, { format: "json" }))).toContain(
			'"start":-3',
		);
	} finally {
		tree.close();
	}
});

it("recomputes visibility after live style changes and excludes scoped hidden descendants", () => {
	const tree = parseHtmlDocument(
		"<div id=parent><p id=child>Visible</p></div>",
		"https://example.com/",
	);
	try {
		const queries = new DocumentQueries(tree);
		const parent = queries.querySelector("#parent") as number;
		const child = queries.querySelector("#child") as number;
		const root = tree.reference(child);
		expect(extractDocument(tree, { root }).content).toBe("Visible\n");
		tree.setAttribute(parent, "hidden", "");
		expect(extractDocument(tree, { root }).content).toBe("");
		tree.removeAttribute(parent, "hidden");
		tree.setAttribute(child, "style", "display:none");
		expect(extractDocument(tree, { root }).content).toBe("");
		tree.setAttribute(child, "style", "display:block");
		expect(extractDocument(tree, { root }).content).toBe("Visible\n");
		queries.close();
	} finally {
		tree.close();
	}
});

it("handles deep documents iteratively and returns detached structured data", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		let parent = tree.root;
		for (let depth = 0; depth < 200; depth++) {
			const child = tree.createElement("span");
			tree.append(parent, child);
			parent = child;
		}
		tree.setTextContent(parent, "Deep content");
		expect(extractDocument(tree).content).toBe("Deep content\n");
		expect(() => extractDocument(tree, { maxDepth: 50 })).toThrow("limit");
		const result = extractDocument(tree, { format: "json" });
		if (result.format !== "json") throw new Error("Unexpected format");
		result.content.children = [];
		expect(extractDocument(tree).content).toBe("Deep content\n");
	} finally {
		tree.close();
	}
});

const tableMarkers = {
	tableBegin:
		"**Native table begin (selected structure only; associations unspecified)**",
	tableEnd: "**Native table end**",
	rowBegin: "**Native row begin (selected structure only)**",
	rowEnd: "**Native row end**",
	cellBegin: "**Native cell begin (selected structure only)**",
	cellEnd: "**Native cell end**",
};

function tableBlocks(...blocks: string[]): string {
	return `${blocks.join("\n\n")}\n`;
}

function appendTableNode(
	tree: DocumentTree,
	parent: number,
	tagName: string,
	text?: string,
	attributes: Record<string, string> = {},
): number {
	const child = tree.createElement(tagName, attributes);
	tree.append(parent, child);
	if (text !== undefined) tree.setTextContent(child, text);
	return child;
}

function tableTextRecord(
	tree: DocumentTree,
	parent: number,
	text: string,
): ExtractedNode {
	const textId = tree.get(parent).children[0];
	if (textId === undefined) throw new Error("Missing fixture text node");
	return { ref: tree.reference(textId), type: "text", text };
}

it("labels every native 2x3 table node without changing structured JSON", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const table = appendTableNode(tree, tree.root, "table");
		const labels = [
			["Device", "Memory", "Mode"],
			["GPU-A", "128 GB", "Release-7"],
		];
		const rows = labels.map((cells, rowIndex) => {
			const row = appendTableNode(tree, table, "tr");
			return {
				ref: tree.reference(row),
				type: "row",
				children: cells.map((label) => {
					const cell = appendTableNode(
						tree,
						row,
						rowIndex === 0 ? "th" : "td",
						label,
					);
					return {
						ref: tree.reference(cell),
						type: "cell",
						children: [tableTextRecord(tree, cell, label)],
					};
				}),
			};
		});
		const root = tree.reference(table);
		const structured = extractDocument(tree, { root, format: "json" });
		expect(structured.content).toEqual({
			ref: root,
			type: "table",
			children: rows,
		});
		expect(extractDocument(tree, { root }).content).toBe(
			tableBlocks(
				tableMarkers.tableBegin,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"Device",
				tableMarkers.cellEnd,
				tableMarkers.cellBegin,
				"Memory",
				tableMarkers.cellEnd,
				tableMarkers.cellBegin,
				"Mode",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"GPU\\-A",
				tableMarkers.cellEnd,
				tableMarkers.cellBegin,
				"128 GB",
				tableMarkers.cellEnd,
				tableMarkers.cellBegin,
				"Release\\-7",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.tableEnd,
			),
		);
		expect(extractDocument(tree, { root, format: "json" })).toEqual(structured);
		const paragraph = appendTableNode(
			tree,
			tree.root,
			"p",
			"GPU-A / Release-7",
		);
		expect(
			extractDocument(tree, { root: tree.reference(paragraph) }).content,
		).toBe("GPU\\-A / Release\\-7\n");
	} finally {
		tree.close();
	}
});

it.each([
	{
		tagName: "table",
		type: "table",
		begin: tableMarkers.tableBegin,
		end: tableMarkers.tableEnd,
	},
	{
		tagName: "tr",
		type: "row",
		begin: tableMarkers.rowBegin,
		end: tableMarkers.rowEnd,
	},
	{
		tagName: "td",
		type: "cell",
		begin: tableMarkers.cellBegin,
		end: tableMarkers.cellEnd,
	},
	{
		tagName: "th",
		type: "cell",
		begin: tableMarkers.cellBegin,
		end: tableMarkers.cellEnd,
	},
])(
	"keeps an empty native $tagName as its own boundary pair",
	({ tagName, type, begin, end }) => {
		const tree = new DocumentTree("https://example.com/");
		try {
			const element = appendTableNode(tree, tree.root, tagName);
			const root = tree.reference(element);
			expect(extractDocument(tree, { root }).content).toBe(
				tableBlocks(begin, end),
			);
			expect(extractDocument(tree, { root, format: "json" }).content).toEqual({
				ref: root,
				type,
				children: [],
			});
		} finally {
			tree.close();
		}
	},
);

it("keeps ragged, empty and absent native cells distinct despite span attributes", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const table = appendTableNode(tree, tree.root, "table");
		const firstRow = appendTableNode(tree, table, "tr");
		const spanning = appendTableNode(tree, firstRow, "th", "Wide", {
			rowspan: "2",
			colspan: "3",
			scope: "col",
			headers: "unverified",
			id: "wide",
		});
		appendTableNode(tree, firstRow, "td");
		const secondRow = appendTableNode(tree, table, "tr");
		appendTableNode(tree, secondRow, "td", "Only");
		appendTableNode(tree, table, "tr");
		const root = tree.reference(table);
		expect(extractDocument(tree, { root }).content).toBe(
			tableBlocks(
				tableMarkers.tableBegin,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"Wide",
				tableMarkers.cellEnd,
				tableMarkers.cellBegin,
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"Only",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.rowBegin,
				tableMarkers.rowEnd,
				tableMarkers.tableEnd,
			),
		);
		const structured = extractDocument(tree, { root, format: "json" });
		if (structured.format !== "json") throw new Error("Unexpected format");
		expect(
			structured.content.children?.map((row) => row.children?.length),
		).toEqual([2, 1, 0]);
		expect(structured.content.children?.[0]?.children?.[0]).toEqual({
			ref: tree.reference(spanning),
			type: "cell",
			children: [tableTextRecord(tree, spanning, "Wide")],
		});
	} finally {
		tree.close();
	}
});

it("retains admitted native table wrapper and non-cell order without grammar repair", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const table = appendTableNode(tree, tree.root, "table");
		const footer = appendTableNode(tree, table, "tfoot");
		const footerRow = appendTableNode(tree, footer, "tr");
		const footerCell = appendTableNode(tree, footerRow, "td", "Footer first");
		const caption = appendTableNode(tree, table, "caption", "Caption later");
		const columns = appendTableNode(
			tree,
			table,
			"colgroup",
			"Column container text",
		);
		const body = appendTableNode(tree, table, "tbody");
		const paragraph = appendTableNode(tree, body, "p", "Not a cell");
		const bodyRow = appendTableNode(tree, body, "tr");
		const bodyCell = appendTableNode(tree, bodyRow, "td", "Body");
		const header = appendTableNode(tree, table, "thead");
		const headerRow = appendTableNode(tree, header, "tr");
		const headerCell = appendTableNode(tree, headerRow, "th", "Header last");
		const rowRecord = (row: number, cell: number, text: string) => ({
			ref: tree.reference(row),
			type: "row",
			children: [
				{
					ref: tree.reference(cell),
					type: "cell",
					children: [tableTextRecord(tree, cell, text)],
				},
			],
		});
		const root = tree.reference(table);
		const structured = extractDocument(tree, { root, format: "json" });
		expect(structured.content).toEqual({
			ref: root,
			type: "table",
			children: [
				{
					ref: tree.reference(footer),
					type: "inline",
					children: [rowRecord(footerRow, footerCell, "Footer first")],
				},
				{
					ref: tree.reference(caption),
					type: "inline",
					children: [tableTextRecord(tree, caption, "Caption later")],
				},
				{
					ref: tree.reference(columns),
					type: "inline",
					children: [tableTextRecord(tree, columns, "Column container text")],
				},
				{
					ref: tree.reference(body),
					type: "container",
					children: [
						{
							ref: tree.reference(paragraph),
							type: "paragraph",
							children: [tableTextRecord(tree, paragraph, "Not a cell")],
						},
						rowRecord(bodyRow, bodyCell, "Body"),
					],
				},
				{
					ref: tree.reference(header),
					type: "inline",
					children: [rowRecord(headerRow, headerCell, "Header last")],
				},
			],
		});
		expect(extractDocument(tree, { root: tree.reference(table) }).content).toBe(
			tableBlocks(
				tableMarkers.tableBegin,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"Footer first",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				"Caption laterColumn container text",
				"Not a cell",
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"Body",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"Header last",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.tableEnd,
			),
		);
		expect(extractDocument(tree, { root, format: "json" })).toEqual(structured);
	} finally {
		tree.close();
	}
});

it("nests native tables once while preserving surrounding cell paragraphs and lists", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const table = appendTableNode(tree, tree.root, "table");
		const row = appendTableNode(tree, table, "tr");
		const cell = appendTableNode(tree, row, "td");
		appendTableNode(tree, cell, "p", "Before");
		const nested = appendTableNode(tree, cell, "table");
		const nestedRow = appendTableNode(tree, nested, "tr");
		appendTableNode(tree, nestedRow, "td", "Inner");
		const list = appendTableNode(tree, cell, "ul");
		appendTableNode(tree, list, "li", "After");
		expect(extractDocument(tree).content).toBe(
			tableBlocks(
				tableMarkers.tableBegin,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"Before",
				tableMarkers.tableBegin,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"Inner",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.tableEnd,
				"- After",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.tableEnd,
			),
		);
	} finally {
		tree.close();
	}
});

it("applies nested quote and list prefixes to every table boundary and content line", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const quote = appendTableNode(tree, tree.root, "blockquote");
		const ordered = appendTableNode(tree, quote, "ol", undefined, {
			start: "3",
		});
		const item = appendTableNode(tree, ordered, "li");
		const table = appendTableNode(tree, item, "table");
		const row = appendTableNode(tree, table, "tr");
		const cell = appendTableNode(tree, row, "td");
		const paragraph = appendTableNode(tree, cell, "p", "Line one");
		appendTableNode(tree, paragraph, "br");
		tree.append(paragraph, tree.createText("Line two"));
		const nestedList = appendTableNode(tree, cell, "ul");
		appendTableNode(tree, nestedList, "li", "Nested");
		appendTableNode(tree, ordered, "li", "Following");
		expect(extractDocument(tree).content).toBe(
			tableBlocks(
				`> 3. ${tableMarkers.tableBegin}`,
				`>    ${tableMarkers.rowBegin}`,
				`>    ${tableMarkers.cellBegin}`,
				">    Line one  \n>    Line two",
				">    - Nested",
				`>    ${tableMarkers.cellEnd}`,
				`>    ${tableMarkers.rowEnd}`,
				`>    ${tableMarkers.tableEnd}`,
				"> 4. Following",
			),
		);
	} finally {
		tree.close();
	}
});

it("keeps cell escaping, inline code, links and fenced literal table text unchanged", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const table = appendTableNode(tree, tree.root, "table");
		const row = appendTableNode(tree, table, "tr");
		const cell = appendTableNode(tree, row, "td");
		appendTableNode(
			tree,
			cell,
			"p",
			"A|B \\ `tick` **label** GPU-A café 雪 & <tag>",
		);
		const paragraph = appendTableNode(tree, cell, "p");
		appendTableNode(tree, paragraph, "code", "a`b");
		tree.append(paragraph, tree.createText(" "));
		appendTableNode(tree, paragraph, "a", "Read-more", { href: "/next" });
		appendTableNode(tree, cell, "pre", "<table>|x|</table>\n```\n");
		appendTableNode(tree, cell, "p", tableMarkers.cellBegin);
		expect(extractDocument(tree).content).toBe(
			tableBlocks(
				tableMarkers.tableBegin,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
				"A\\|B \\\\ \\`tick\\` \\*\\*label\\*\\* GPU\\-A café 雪 &amp; &lt;tag&gt;",
				"`` a`b `` [Read\\-more](<https://example.com/next>)",
				"````\n<table>|x|</table>\n```\n````",
				"\\*\\*Native cell begin \\(selected structure only\\)\\*\\*",
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.tableEnd,
			),
		);
	} finally {
		tree.close();
	}
});

it.each([
	{
		tagName: "table",
		structuralType: "table",
		begin: tableMarkers.tableBegin,
		end: tableMarkers.tableEnd,
	},
	{
		tagName: "tr",
		structuralType: "row",
		begin: tableMarkers.rowBegin,
		end: tableMarkers.rowEnd,
	},
	{
		tagName: "td",
		structuralType: "cell",
		begin: tableMarkers.cellBegin,
		end: tableMarkers.cellEnd,
	},
])(
	"migrates generic span/$tagName coverage to positive whole and scoped boundaries",
	({ tagName, structuralType, begin, end }) => {
		const tree = new DocumentTree("https://example.com/");
		try {
			appendTableNode(tree, tree.root, "p", "Before rejected subtree");
			const parent = appendTableNode(tree, tree.root, "span");
			const wrapper = appendTableNode(tree, parent, "span");
			const structural = appendTableNode(tree, wrapper, tagName, "Retained");
			const root = tree.reference(parent);
			const structured = extractDocument(tree, { root, format: "json" });
			expect(structured.content).toEqual({
				ref: root,
				type: "inline",
				children: [
					{
						ref: tree.reference(wrapper),
						type: "inline",
						children: [
							{
								ref: tree.reference(structural),
								type: structuralType,
								children: [tableTextRecord(tree, structural, "Retained")],
							},
						],
					},
				],
			});
			const wholeStructured = extractDocument(tree, { format: "json" });
			expect(extractDocument(tree, { root }).content).toBe(
				tableBlocks(begin, "Retained", end),
			);
			expect(extractDocument(tree).content).toBe(
				tableBlocks("Before rejected subtree", begin, "Retained", end),
			);
			expect(extractDocument(tree, { root, format: "json" })).toEqual(
				structured,
			);
			expect(extractDocument(tree, { format: "json" })).toEqual(
				wholeStructured,
			);
		} finally {
			tree.close();
		}
	},
);

it("keeps unmarked generic wrappers on the old text-only and ordinary-block inline path", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const wrapper = appendTableNode(tree, tree.root, "span", "A");
		const first = appendTableNode(tree, wrapper, "span", "B");
		const second = appendTableNode(tree, wrapper, "span", "C");
		const lastText = tree.createText("D");
		tree.append(wrapper, lastText);
		const root = tree.reference(wrapper);
		const structured = extractDocument(tree, { root, format: "json" });
		expect(structured.content).toEqual({
			ref: root,
			type: "inline",
			children: [
				tableTextRecord(tree, wrapper, "A"),
				{
					ref: tree.reference(first),
					type: "inline",
					children: [tableTextRecord(tree, first, "B")],
				},
				{
					ref: tree.reference(second),
					type: "inline",
					children: [tableTextRecord(tree, second, "C")],
				},
				{ ref: tree.reference(lastText), type: "text", text: "D" },
			],
		});
		expect(extractDocument(tree).content).toBe("ABCD\n");
		expect(extractDocument(tree, { root }).content).toBe("ABCD\n");
		expect(extractDocument(tree, { root, format: "json" })).toEqual(structured);
		const ordinary = appendTableNode(tree, tree.root, "span", "W");
		const block = appendTableNode(tree, ordinary, "div", "X");
		const inline = appendTableNode(tree, ordinary, "span", "Y");
		const suffix = tree.createText("Z");
		tree.append(ordinary, suffix);
		const ordinaryRoot = tree.reference(ordinary);
		const ordinaryStructured = extractDocument(tree, {
			root: ordinaryRoot,
			format: "json",
		});
		expect(ordinaryStructured.content).toEqual({
			ref: ordinaryRoot,
			type: "inline",
			children: [
				tableTextRecord(tree, ordinary, "W"),
				{
					ref: tree.reference(block),
					type: "container",
					children: [tableTextRecord(tree, block, "X")],
				},
				{
					ref: tree.reference(inline),
					type: "inline",
					children: [tableTextRecord(tree, inline, "Y")],
				},
				{ ref: tree.reference(suffix), type: "text", text: "Z" },
			],
		});
		expect(extractDocument(tree).content).toBe("ABCDWXYZ\n");
		expect(extractDocument(tree, { root: ordinaryRoot }).content).toBe(
			"WXYZ\n",
		);
		expect(
			extractDocument(tree, {
				root: ordinaryRoot,
				format: "json",
			}),
		).toEqual(ordinaryStructured);
	} finally {
		tree.close();
	}
});

it.each([1, 64])(
	"traverses %s generic wrapper levels through blocks and direct list children within exact budgets",
	(wrapperDepth) => {
		const tree = new DocumentTree("https://example.com/");
		try {
			const quote = appendTableNode(tree, tree.root, "blockquote");
			const list = appendTableNode(tree, quote, "ol", undefined, {
				start: "3",
			});
			const item = appendTableNode(tree, list, "li");
			const outer = appendTableNode(tree, item, "span", "Before");
			const wrappers = [outer];
			let parent = outer;
			for (let depth = 1; depth < wrapperDepth; depth++) {
				parent = appendTableNode(tree, parent, "span");
				wrappers.push(parent);
			}
			const block = appendTableNode(tree, parent, "div");
			const inner = appendTableNode(tree, block, "span");
			const table = appendTableNode(tree, inner, "table");
			const row = appendTableNode(tree, table, "tr");
			const cell = appendTableNode(tree, row, "td", "Inner 雪|A");
			const after = tree.createText("After");
			tree.append(outer, after);
			const direct = appendTableNode(tree, list, "span", "Direct before");
			const directRow = appendTableNode(tree, direct, "tr");
			const directCell = appendTableNode(tree, directRow, "td", "Direct");
			const directAfter = tree.createText("Direct after");
			tree.append(direct, directAfter);
			const following = appendTableNode(tree, list, "li", "Following");
			let expectedWrapper: ExtractedNode = {
				ref: tree.reference(block),
				type: "container",
				children: [
					{
						ref: tree.reference(inner),
						type: "inline",
						children: [
							{
								ref: tree.reference(table),
								type: "table",
								children: [
									{
										ref: tree.reference(row),
										type: "row",
										children: [
											{
												ref: tree.reference(cell),
												type: "cell",
												children: [tableTextRecord(tree, cell, "Inner 雪|A")],
											},
										],
									},
								],
							},
						],
					},
				],
			};
			for (let index = wrappers.length - 1; index >= 0; index--) {
				const children: ExtractedNode[] = [expectedWrapper];
				if (index === 0) {
					children.unshift(tableTextRecord(tree, outer, "Before"));
					children.push({
						ref: tree.reference(after),
						type: "text",
						text: "After",
					});
				}
				expectedWrapper = {
					ref: tree.reference(wrappers[index]),
					type: "inline",
					children,
				};
			}
			const expectedTree: ExtractedNode = {
				ref: tree.reference(tree.root),
				type: "container",
				children: [
					{
						ref: tree.reference(quote),
						type: "blockquote",
						children: [
							{
								ref: tree.reference(list),
								type: "list",
								ordered: true,
								start: 3,
								children: [
									{
										ref: tree.reference(item),
										type: "list-item",
										children: [expectedWrapper],
									},
									{
										ref: tree.reference(direct),
										type: "inline",
										children: [
											tableTextRecord(tree, direct, "Direct before"),
											{
												ref: tree.reference(directRow),
												type: "row",
												children: [
													{
														ref: tree.reference(directCell),
														type: "cell",
														children: [
															tableTextRecord(tree, directCell, "Direct"),
														],
													},
												],
											},
											{
												ref: tree.reference(directAfter),
												type: "text",
												text: "Direct after",
											},
										],
									},
									{
										ref: tree.reference(following),
										type: "list-item",
										children: [tableTextRecord(tree, following, "Following")],
									},
								],
							},
						],
					},
				],
			};
			const expectedMarkdown = tableBlocks(
				"> 3. Before",
				`>    ${tableMarkers.tableBegin}`,
				`>    ${tableMarkers.rowBegin}`,
				`>    ${tableMarkers.cellBegin}`,
				">    Inner 雪\\|A",
				`>    ${tableMarkers.cellEnd}`,
				`>    ${tableMarkers.rowEnd}`,
				`>    ${tableMarkers.tableEnd}`,
				">    After",
				"> Direct before",
				`> ${tableMarkers.rowBegin}`,
				`> ${tableMarkers.cellBegin}`,
				"> Direct",
				`> ${tableMarkers.cellEnd}`,
				`> ${tableMarkers.rowEnd}`,
				"> Direct after",
				"> 4. Following",
			);
			const root = tree.reference(outer);
			const structured = extractDocument(tree, { format: "json" });
			const scoped = extractDocument(tree, { root, format: "json" });
			expect(structured.content).toEqual(expectedTree);
			expect(scoped.content).toEqual(expectedWrapper);
			expect(extractDocument(tree, { root }).content).toBe(
				tableBlocks(
					"Before",
					tableMarkers.tableBegin,
					tableMarkers.rowBegin,
					tableMarkers.cellBegin,
					"Inner 雪\\|A",
					tableMarkers.cellEnd,
					tableMarkers.rowEnd,
					tableMarkers.tableEnd,
					"After",
				),
			);
			for (const format of ["markdown", "json"] as const) {
				const result = extractDocument(tree, { format });
				if (result.format === "markdown") {
					expect(result.content).toBe(expectedMarkdown);
				} else {
					expect(result).toEqual(structured);
				}
				const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
				expect(bytes).toBeGreaterThan(256);
				expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(
					result,
				);
				expect(() =>
					extractDocument(tree, { format, maxBytes: bytes - 1 }),
				).toThrow(expect.objectContaining({ code: "resource-limit" }));
				expect(
					extractDocument(tree, {
						format,
						maxNodes: wrapperDepth + 20,
						maxDepth: wrapperDepth + 9,
					}),
				).toEqual(result);
				expect(() =>
					extractDocument(tree, {
						format,
						maxNodes: wrapperDepth + 19,
					}),
				).toThrow(expect.objectContaining({ code: "resource-limit" }));
				expect(() =>
					extractDocument(tree, {
						format,
						maxDepth: wrapperDepth + 8,
					}),
				).toThrow(expect.objectContaining({ code: "resource-limit" }));
				expect(extractDocument(tree, { format })).toEqual(result);
			}
			expect(extractDocument(tree, { root, format: "json" })).toEqual(scoped);
			expect(extractDocument(tree, { format: "json" })).toEqual(structured);
		} finally {
			tree.close();
		}
	},
);

it.each(
	[
		{ sink: "h2", type: "heading" },
		{ sink: "p", type: "paragraph" },
		{ sink: "pre", type: "pre" },
		{ sink: "code", type: "code" },
		{ sink: "strong", type: "strong" },
		{ sink: "b", type: "strong" },
		{ sink: "em", type: "emphasis" },
		{ sink: "i", type: "emphasis" },
		{ sink: "a", type: "link" },
	].flatMap((sink) => [
		{ ...sink, tagName: "table", structuralType: "table" },
		{ ...sink, tagName: "tr", structuralType: "row" },
		{ ...sink, tagName: "td", structuralType: "cell" },
	]),
)(
	"rejects an admitted $tagName descendant under $sink only for Markdown",
	({ sink, type, tagName, structuralType }) => {
		const tree = new DocumentTree("https://example.com/");
		try {
			appendTableNode(tree, tree.root, "p", "Before rejected subtree");
			const parent = appendTableNode(
				tree,
				tree.root,
				sink,
				undefined,
				sink === "a" ? { href: "/next" } : {},
			);
			const wrapper = appendTableNode(tree, parent, "span");
			const structural = appendTableNode(tree, wrapper, tagName, "Retained");
			const root = tree.reference(parent);
			const structured = extractDocument(tree, { root, format: "json" });
			expect(structured.content).toEqual({
				ref: root,
				type,
				...(sink === "h2" ? { level: 2 } : {}),
				...(sink === "a" ? { url: "https://example.com/next" } : {}),
				children: [
					{
						ref: tree.reference(wrapper),
						type: "inline",
						children: [
							{
								ref: tree.reference(structural),
								type: structuralType,
								children: [tableTextRecord(tree, structural, "Retained")],
							},
						],
					},
				],
			});
			for (const options of [{ root }, {}]) {
				expect(() => extractDocument(tree, options)).toThrow(AgentBrowserError);
				expect(() => extractDocument(tree, options)).toThrow(
					expect.objectContaining({
						code: "unsupported",
						message: "Unsupported table extraction structure",
					}),
				);
			}
			expect(extractDocument(tree, { root, format: "json" })).toEqual(
				structured,
			);
		} finally {
			tree.close();
		}
	},
);

it.each(["hidden", "aria-hidden", "inert", "style"])(
	"checks only admitted table nodes after native visibility filtering: %s",
	(attribute) => {
		const tree = new DocumentTree("https://example.com/");
		try {
			const paragraph = appendTableNode(tree, tree.root, "p", "Visible");
			const value =
				attribute === "aria-hidden"
					? "true"
					: attribute === "style"
						? "display:none"
						: "";
			const hidden = appendTableNode(tree, paragraph, "table", undefined, {
				[attribute]: value,
			});
			const row = appendTableNode(tree, hidden, "tr");
			const cell = appendTableNode(tree, row, "td", "Hidden");
			expect(extractDocument(tree).content).toBe("Visible\n");
			expect(
				extractDocument(tree, { root: tree.reference(cell) }).content,
			).toBe("");
			const structured = extractDocument(tree, {
				root: tree.reference(paragraph),
				format: "json",
			});
			expect(structured.content).toEqual({
				ref: tree.reference(paragraph),
				type: "paragraph",
				children: [tableTextRecord(tree, paragraph, "Visible")],
			});
		} finally {
			tree.close();
		}
	},
);

it.each(["img", "br"])(
	"does not preflight structural children pruned by existing %s leaf extraction",
	(tagName) => {
		const tree = new DocumentTree("https://example.com/");
		try {
			const leaf = appendTableNode(tree, tree.root, tagName, undefined, {
				alt: "Visible alternative",
			});
			appendTableNode(tree, leaf, "table", "Not admitted");
			const root = tree.reference(leaf);
			expect(extractDocument(tree, { root }).content).toBe(
				tagName === "img" ? "Visible alternative\n" : "",
			);
			expect(extractDocument(tree, { root, format: "json" }).content).toEqual({
				ref: root,
				type: tagName === "img" ? "image" : "break",
				...(tagName === "img" ? { text: "Visible alternative" } : {}),
			});
		} finally {
			tree.close();
		}
	},
);

it.each(["markdown", "json"] as const)(
	"counts the complete table result at the exact UTF8 byte budget for %s",
	(format) => {
		const tree = new DocumentTree("https://example.com/");
		try {
			const quote = appendTableNode(tree, tree.root, "blockquote");
			const list = appendTableNode(tree, quote, "ul");
			const item = appendTableNode(tree, list, "li");
			const table = appendTableNode(tree, item, "table");
			const row = appendTableNode(tree, table, "tr");
			appendTableNode(tree, row, "td", "雪|\\GPU-A");
			const result = extractDocument(tree, { format });
			if (result.format === "markdown")
				expect(result.content).toBe(
					tableBlocks(
						`> - ${tableMarkers.tableBegin}`,
						`>   ${tableMarkers.rowBegin}`,
						`>   ${tableMarkers.cellBegin}`,
						">   雪\\|\\\\GPU\\-A",
						`>   ${tableMarkers.cellEnd}`,
						`>   ${tableMarkers.rowEnd}`,
						`>   ${tableMarkers.tableEnd}`,
					),
				);
			const serialized = JSON.stringify(result);
			const bytes = new TextEncoder().encode(serialized).length;
			expect(bytes).toBeGreaterThan(256);
			expect(bytes).toBeGreaterThan(serialized.length);
			expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(
				result,
			);
			expect(() =>
				extractDocument(tree, { format, maxBytes: bytes - 1 }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
			expect(extractDocument(tree, { format })).toEqual(result);
		} finally {
			tree.close();
		}
	},
);

it.each(["markdown", "json"] as const)(
	"retains native node and depth boundaries independently of table markers for %s",
	(format) => {
		const tree = new DocumentTree("https://example.com/");
		try {
			const table = appendTableNode(tree, tree.root, "table");
			const row = appendTableNode(tree, table, "tr");
			appendTableNode(tree, row, "td", "Budget");
			const root = tree.reference(table);
			const expected = extractDocument(tree, { root, format });
			expect(
				extractDocument(tree, { root, format, maxNodes: 4, maxDepth: 3 }),
			).toEqual(expected);
			expect(() =>
				extractDocument(tree, { root, format, maxNodes: 3 }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
			expect(() =>
				extractDocument(tree, { root, format, maxDepth: 2 }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
		} finally {
			tree.close();
		}
	},
);

it("balances a bounded deep native table chain with exact node and depth limits", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		let parent = tree.root;
		for (let depth = 0; depth < 64; depth++) {
			const table = appendTableNode(tree, parent, "table");
			const row = appendTableNode(tree, table, "tr");
			parent = appendTableNode(tree, row, "td");
		}
		tree.setTextContent(parent, "Deep leaf");
		const expected = tableBlocks(
			...Array.from({ length: 64 }, () => [
				tableMarkers.tableBegin,
				tableMarkers.rowBegin,
				tableMarkers.cellBegin,
			]).flat(),
			"Deep leaf",
			...Array.from({ length: 64 }, () => [
				tableMarkers.cellEnd,
				tableMarkers.rowEnd,
				tableMarkers.tableEnd,
			]).flat(),
		);
		expect(
			extractDocument(tree, { maxNodes: 194, maxDepth: 193 }).content,
		).toBe(expected);
		expect(() => extractDocument(tree, { maxNodes: 193 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(() => extractDocument(tree, { maxDepth: 192 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	} finally {
		tree.close();
	}
});
