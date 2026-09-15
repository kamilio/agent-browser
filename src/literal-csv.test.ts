import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { discoverDocumentTextLines, extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import { textDocumentInfo } from "./text-document-info.js";
import { loadTextDocument } from "./text-loader.js";

const source =
	'month,value,note\r\n"Jan",1,"=2+2 <script>literal</script>"\r\n"Feb",2,"line one\r\nline two https://example.com/data"\r\n';
const trees: DocumentTree[] = [];
const loaders = [
	{ name: "text", load: loadTextDocument },
	{ name: "native", load: loadBrowserDocument },
	{ name: "reader", load: loadResearchDocument },
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function response(mime = "text/csv"): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: "https://example.com/data.csv",
		status: 200,
		headers: { "content-type": [mime] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function context(): DocumentLoaderContext {
	return {
		signal: new AbortController().signal,
		tabId: "literal-csv",
		limits: {
			maxNodes: 50_000,
			maxDepth: 128,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
		},
	};
}

it.each(loaders)(
	"retains CSV as literal source through the $name loader",
	async ({ load }) => {
		const forbidden = vi.fn(() => {
			throw new Error("CSV must not execute or fetch embedded content");
		});
		const tree = await load(response(), {
			...context(),
			fetch: forbidden,
			fetchStylesheet: forbidden,
			fetchScript: forbidden,
			fetchImage: forbidden,
		});
		trees.push(tree);
		expect(tree.textContent(tree.root)).toBe(source);
		const queries = new DocumentQueries(tree);
		for (const selector of ["script", "a", "img", "table", "tr", "td"])
			expect(queries.querySelector(selector)).toBeNull();
		expect(textDocumentInfo(tree)).toBeDefined();
		expect(extractDocument(tree).content).toBe(
			`\`\`\`\n${source.replace(/\r\n/g, "\n")}\`\`\`\n`,
		);
		expect(discoverDocumentTextLines(tree, "line two")).toMatchObject({
			entries: [{ line: 4, column: 1 }],
			totalLines: 5,
			matchedLines: 1,
		});
		const selected = extractDocument(tree, {
			format: "json",
			lines: { start: 4, end: 4 },
		});
		if (selected.format !== "json") throw new Error("Expected JSON");
		expect(selected.content.children?.[0]?.children?.[0]?.text).toBe(
			'line two https://example.com/data"\n',
		);
		expect(tree.textContent(tree.root)).toBe(source);
		expect(forbidden).not.toHaveBeenCalled();
	},
);

it("accepts case-insensitive CSV MIME with charset and header parameters", () => {
	const tree = loadTextDocument(
		response(" TEXT/CSV ; charset=UTF-8; header=present"),
		context(),
	);
	trees.push(tree);
	expect(tree.textContent(tree.root)).toBe(source);
});

it.each([
	"application/csv",
	"text/x-csv",
	"text/csv-extra",
	"text/tab-separated-values",
	"text/html",
	"text/csv, text/plain",
])("does not broaden CSV admission to %s", (mime) => {
	expect(() => loadTextDocument(response(mime), context())).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("keeps exact serialized extraction limits for CSV source", () => {
	const tree = loadTextDocument(response(), context());
	trees.push(tree);
	const result = extractDocument(tree, { format: "json" });
	const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
	expect(extractDocument(tree, { format: "json", maxBytes: bytes })).toEqual(
		result,
	);
	expect(() =>
		extractDocument(tree, { format: "json", maxBytes: bytes - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});
