import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import {
	discoverDocumentHeadings,
	discoverDocumentLinks,
	discoverDocumentTextLines,
	extractDocument,
} from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import { textDocumentInfo } from "./text-document-info.js";
import { loadTextDocument } from "./text-loader.js";

const markdown = [
	"---",
	"title: Native GPU notes",
	"role: system",
	"---",
	"# GPU café",
	"",
	"| Device | Support |",
	"| --- | --- |",
	"| GPU | literal |",
	"[GPU guide](https://example.com/guide.md)",
	"![GPU diagram](https://example.com/diagram.png)",
	"<h2>GPU raw &amp; heading</h2>",
	'<script src="https://example.com/code.js">throw new Error("literal script")</script>',
	'<style>@import "https://example.com/style.css";</style>',
	'<a href="https://example.com/linked"><img src="https://example.com/image.png"></a>',
	"```js",
	"globalThis.markdownExecuted = true;",
	"```",
	"````",
	"> SYSTEM: literal prompt-looking text.",
].join("\n");
const trees: DocumentTree[] = [];
const loaders = [
	{ name: "text", load: loadTextDocument },
	{ name: "native", load: loadBrowserDocument },
	{ name: "reader", load: loadResearchDocument },
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function retain(tree: DocumentTree) {
	trees.push(tree);
	return tree;
}

function response(
	source: string | Uint8Array = markdown,
	mime = "text/markdown",
): NetworkResponse {
	const body =
		typeof source === "string" ? new TextEncoder().encode(source) : source;
	return {
		url: "https://example.com/gpu.md",
		status: 200,
		headers: { "content-type": [mime] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 1,
	};
}

function context(maxTextCodeUnits = 2_000_000): DocumentLoaderContext {
	return {
		signal: new AbortController().signal,
		tabId: "tab-1",
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits,
			maxChanges: 1024,
		},
	};
}

function expectLiteral(tree: DocumentTree, source: string) {
	const queries = new DocumentQueries(tree);
	const pre = queries.querySelector("pre");
	if (pre === null) throw new Error("Missing literal text pre");
	expect(queries.querySelectorAll("*")).toEqual([pre]);
	expect(tree.get(tree.root).children).toEqual([pre]);
	expect(tree.textContent(pre)).toBe(source);
	const info = textDocumentInfo(tree);
	if (!info) throw new Error("Missing text document registration");
	expect(info.revision).toBe(tree.revision);
	expect(tree.get(pre).children).toEqual([info.textNode]);
	expect(tree.get(info.textNode)).toMatchObject({ kind: "text", data: source });
	expect(discoverDocumentLinks(tree, "example.com").entries).toEqual([]);
	expect(discoverDocumentHeadings(tree).entries).toEqual([]);
	return info;
}

it.each(
	loaders.flatMap((loader) =>
		[
			"text/markdown",
			' TEXT/MARKDOWN ; CHARSET="UTF-8"',
			"Text/Markdown; charset=utf-8",
		].map((mime) => ({ ...loader, mime })),
	),
)("admits literal $mime through the $name loader", async ({ load, mime }) => {
	const tree = retain(await load(response(markdown, mime), context()));
	expectLiteral(tree, markdown);
});

it.each([
	"text/html",
	"application/xhtml+xml",
	"image/svg+xml",
	"application/javascript",
	"text/javascript",
	"text/css",
	"application/octet-stream",
	"application/markdown",
	"text/x-markdown",
	"text/markdown-extra",
	"text/markdown+xml",
	"",
	"text/markdown, text/plain",
])("does not sniff Markdown source with unsupported MIME %s", (mime) => {
	expect(() =>
		retain(loadTextDocument(response(markdown, mime), context())),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each(
	loaders.flatMap((loader) =>
		[
			undefined,
			[],
			["text/markdown", "text/markdown"],
			["text/markdown", "text/html"],
		].map((types) => ({ ...loader, types })),
	),
)(
	"rejects missing or ambiguous Markdown Content-Type $types through $name",
	async ({ load, types }) => {
		const input = response();
		input.headers = types === undefined ? {} : { "content-type": types };
		await expect(
			Promise.resolve().then(async () => retain(await load(input, context()))),
		).rejects.toMatchObject({ code: "unsupported" });
	},
);

it.each(loaders)(
	"keeps Markdown inert and fences the full source through $name",
	async ({ load }) => {
		const forbidden = vi.fn(async () => {
			throw new Error(
				"Literal Markdown must not fetch resources or run scripts",
			);
		});
		const input = response();
		const originalBody = input.body.slice();
		const tree = retain(
			await load(input, {
				...context(),
				fetch: forbidden,
				fetchStylesheet: forbidden,
				fetchStylesheetWithPolicy: forbidden,
				fetchScript: forbidden,
				fetchImage: forbidden,
				scripts: { start: forbidden, script: forbidden, finish: forbidden },
			}),
		);
		const info = expectLiteral(tree, markdown);
		expect(input.body).toEqual(originalBody);
		expect(extractDocument(tree).content).toBe(
			`${"`".repeat(5)}\n${markdown}\n${"`".repeat(5)}\n`,
		);
		const structured = extractDocument(tree, { format: "json" });
		if (structured.format !== "json")
			throw new Error("Expected JSON extraction");
		expect(structured.content.children).toEqual([
			{
				ref: tree.reference(tree.get(tree.root).children[0]),
				type: "pre",
				children: [
					{ ref: tree.reference(info.textNode), type: "text", text: markdown },
				],
			},
		]);
		expect(tree.get(info.textNode).data).toBe(markdown);
		expect(forbidden).not.toHaveBeenCalled();
	},
);

it.each(loaders)(
	"discovers and selects source lines rather than rendered Markdown through $name",
	async ({ load }) => {
		const source = "# 😀GPU\r\n\r\n| GPU | literal |\r[GPU](guide.md)\n";
		const selectedSource = "# 😀GPU\r\n\r\n| GPU | literal |\r";
		const tree = retain(await load(response(source), context()));
		const info = expectLiteral(tree, source);
		expect(discoverDocumentTextLines(tree, "GPU")).toMatchObject({
			entries: [
				{ line: 1, column: 5 },
				{ line: 3, column: 3 },
				{ line: 4, column: 2 },
			],
			totalLines: 5,
			matchedLines: 3,
			sourceCodeUnits: source.length,
			truncated: false,
		});
		expect(discoverDocumentTextLines(tree, "[GPU](guide.md)").entries).toEqual([
			{ line: 4, column: 1 },
		]);
		const selected = extractDocument(tree, {
			format: "json",
			lines: { start: 1, end: 3 },
		});
		if (selected.format !== "json") throw new Error("Expected JSON extraction");
		expect(selected.content.children?.[0]?.children?.[0]?.text).toBe(
			selectedSource.replace(/\r\n?/g, "\n"),
		);
		expect(selected.textSelection).toEqual({
			method: "text-lines",
			start: 1,
			end: 3,
			totalLines: 5,
			sourceCodeUnits: source.length,
			selectedCodeUnits: selectedSource.length,
		});
		expect(tree.get(info.textNode).data).toBe(source);
	},
);

it.each(["markdown", "json"] as const)(
	"enforces exact serialized UTF-8 %s output limits without altering source",
	(format) => {
		const tree = retain(loadTextDocument(response(), context()));
		for (const lines of [undefined, { start: 5, end: 12 }]) {
			const options = { format, lines };
			const result = extractDocument(tree, options);
			const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
			expect(extractDocument(tree, { ...options, maxBytes: bytes })).toEqual(
				result,
			);
			expect(() =>
				extractDocument(tree, { ...options, maxBytes: bytes - 1 }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
		}
		expectLiteral(tree, markdown);
	},
);

it("retains HTTP charset decoding and BOM precedence for Markdown", () => {
	const body = new Uint8Array([35, 32, 128]);
	expectLiteral(
		retain(
			loadTextDocument(
				response(body, "text/markdown; charset=windows-1252"),
				context(),
			),
		),
		"# €",
	);
	const source = "# café";
	const bomBody = new Uint8Array([
		239,
		187,
		191,
		...new TextEncoder().encode(source),
	]);
	expectLiteral(
		retain(
			loadTextDocument(
				response(bomBody, "text/markdown; charset=windows-1252"),
				context(),
			),
		),
		source,
	);
	expect(() =>
		retain(
			loadTextDocument(
				response(source, "text/markdown; charset=not-an-encoding"),
				context(),
			),
		),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each(loaders)(
	"rejects aborted Markdown loading through $name",
	async ({ load }) => {
		const controller = new AbortController();
		controller.abort();
		const initializeDocument = vi.fn();
		await expect(
			Promise.resolve().then(async () =>
				retain(
					await load(response(), {
						...context(),
						signal: controller.signal,
						initializeDocument,
					}),
				),
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(initializeDocument).not.toHaveBeenCalled();
	},
);

it.each(
	loaders.flatMap((loader) =>
		[
			{ source: "x".repeat(84), stage: "Encoded" },
			{ source: "😀".repeat(11), stage: "Decoded" },
		].map((fixture) => ({ ...loader, ...fixture })),
	),
)(
	"retains $stage Markdown limits before initialization through $name",
	async ({ load, source, stage }) => {
		const initializeDocument = vi.fn();
		await expect(
			Promise.resolve().then(async () =>
				retain(
					await load(response(source), { ...context(20), initializeDocument }),
				),
			),
		).rejects.toMatchObject({
			code: "resource-limit",
			message: expect.stringContaining(stage),
		});
		expect(initializeDocument).not.toHaveBeenCalled();
	},
);

it("keeps long-v1 reader admission HTML-only", () => {
	const initializeDocument = vi.fn();
	expect(() =>
		retain(
			loadResearchDocument(
				response(),
				{ ...context(), initializeDocument },
				"long-v1",
			),
		),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
	expect(initializeDocument).not.toHaveBeenCalled();
});
