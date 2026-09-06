import { afterEach, expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { discoverDocumentTextLines } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import { loadResearchDocument } from "./research-loader.js";
import type { DocumentLoaderContext } from "./session.js";
import { textDocumentInfo } from "./text-document-info.js";
import { loadTextDocument } from "./text-loader.js";

const url = "https://example.com/text";
const privateSentinel = "TEXT_LINES_PRIVATE_SENTINEL";
const trees: DocumentTree[] = [];
const loaders = [
	{ name: "text", load: loadTextDocument },
	{ name: "browser", load: loadBrowserDocument },
	{ name: "reader", load: loadResearchDocument },
];
type Options = NonNullable<Parameters<typeof discoverDocumentTextLines>[2]>;

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function response(source: string, mime = "text/plain"): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
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

function retain(tree: DocumentTree) {
	trees.push(tree);
	return tree;
}

function document(source: string, loaderContext = context()) {
	return retain(loadTextDocument(response(source), loaderContext));
}

function expectSafeFailure(action: () => unknown, code: string) {
	let failure: unknown;
	try {
		action();
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AgentBrowserError);
	expect(failure).toMatchObject({ code });
	expect(String(failure)).not.toContain(privateSentinel);
	expect(JSON.stringify(failure)).not.toContain(privateSentinel);
}

it.each(
	[
		"text/plain",
		"TEXT/PLAIN; charset=UTF-8",
		"application/json",
		"application/problem+json",
	].flatMap((mime) => loaders.map((loader) => ({ mime, ...loader }))),
)(
	"admits native $mime through the real $name loader",
	async ({ mime, load }) => {
		const source = `{"value":"${privateSentinel}"}\r\n# ${privateSentinel}\n`;
		const tree = retain(await load(response(source, mime), context()));
		const result = discoverDocumentTextLines(tree, privateSentinel);
		expect(result).toEqual({
			method: "text-line-discovery",
			document: tree.reference(tree.root),
			revision: tree.revision,
			partial: true,
			entries: [
				{ line: 1, column: 11 },
				{ line: 2, column: 3 },
			],
			totalLines: 3,
			matchedLines: 2,
			sourceCodeUnits: source.length,
			truncated: false,
		});
		expect(textDocumentInfo(tree)?.revision).toBe(tree.revision);
		expect(JSON.stringify(result)).not.toContain(privateSentinel);
	},
);

it.each(loaders)(
	"discovers literal Markdown source served as text/plain through $name",
	async ({ load }) => {
		const source = `# ${privateSentinel}\r\n\r\n- See ${privateSentinel}\n`;
		const tree = retain(await load(response(source, "text/plain"), context()));
		const result = discoverDocumentTextLines(tree, privateSentinel);
		expect(result).toMatchObject({
			partial: true,
			entries: [
				{ line: 1, column: 3 },
				{ line: 3, column: 7 },
			],
			totalLines: 4,
			matchedLines: 2,
			sourceCodeUnits: source.length,
			truncated: false,
		});
		expect(JSON.stringify(result)).not.toContain(privateSentinel);
	},
);

it.each(
	["text/markdown", "TEXT/MARKDOWN; charset=UTF-8"].flatMap((mime) =>
		loaders.map((loader) => ({ mime, ...loader })),
	),
)("retains $mime refusal through the $name loader", async ({ mime, load }) => {
	await expect(
		Promise.resolve().then(async () =>
			retain(await load(response(`# ${privateSentinel}`, mime), context())),
		),
	).rejects.toMatchObject({
		code: "unsupported",
		message: expect.not.stringContaining(privateSentinel),
	});
});

it.each([
	{ source: "", query: "x", totalLines: 1, entries: [] },
	{ source: "x", query: "X", totalLines: 1, entries: [] },
	{
		source: "x\n",
		query: "x",
		totalLines: 2,
		entries: [{ line: 1, column: 1 }],
	},
	{
		source: "x\r",
		query: "x",
		totalLines: 2,
		entries: [{ line: 1, column: 1 }],
	},
	{
		source: "x\r\n",
		query: "x",
		totalLines: 2,
		entries: [{ line: 1, column: 1 }],
	},
	{ source: "\r\r\n\n", query: "x", totalLines: 4, entries: [] },
	{ source: "ab\ncd\rab\r\ncd", query: "bc", totalLines: 4, entries: [] },
	{
		source: "😀e\u0301界\u2028\u2029x x\r\nxx\rx\n",
		query: "x",
		totalLines: 4,
		entries: [
			{ line: 1, column: 8 },
			{ line: 2, column: 1 },
			{ line: 3, column: 1 },
		],
	},
	{
		source: "aaaba aa\n[a.*] [a.*]\ne\u0301 é",
		query: "[a.*]",
		totalLines: 3,
		entries: [{ line: 2, column: 1 }],
	},
	{
		source: "aaaaa",
		query: "aa",
		totalLines: 1,
		entries: [{ line: 1, column: 1 }],
	},
	{ source: "e\u0301", query: "é", totalLines: 1, entries: [] },
])("returns only raw first-match coordinates for $source", (fixture) => {
	const tree = document(fixture.source);
	expect(discoverDocumentTextLines(tree, fixture.query)).toEqual({
		method: "text-line-discovery",
		document: tree.reference(tree.root),
		revision: tree.revision,
		partial: true,
		entries: fixture.entries,
		totalLines: fixture.totalLines,
		matchedLines: fixture.entries.length,
		sourceCodeUnits: fixture.source.length,
		truncated: false,
	});
});

it.each(["x", "x".repeat(256), "😀".repeat(128), " ", "--parallel"])(
	"accepts literal primitive query boundaries without trimming: %s",
	(query) => {
		const tree = document(`before${query}\n${query}`);
		expect(discoverDocumentTextLines(tree, query).entries).toEqual([
			{ line: 1, column: 7 },
			{ line: 2, column: 1 },
		]);
	},
);

it.each(
	[
		undefined,
		null,
		false,
		1,
		[],
		{},
		new String(privateSentinel),
		"",
		"x".repeat(257),
		"😀".repeat(129),
		`${privateSentinel}\n`,
		`${privateSentinel}\r`,
		{
			toString: () => {
				throw new Error(privateSentinel);
			},
		},
	].map((query) => ({ query })),
)(
	"rejects invalid query primitives without coercion or echo: $query",
	({ query }) => {
		const tree = document(privateSentinel);
		expectSafeFailure(
			() => discoverDocumentTextLines(tree, query as string),
			"invalid-input",
		);
	},
);

it.each(
	[
		null,
		[],
		"options",
		1,
		false,
		...[0, -1, 201, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "50", null].map(
			(maxEntries) => ({ maxEntries }),
		),
		...[
			0,
			255,
			1_048_577,
			256.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"256",
			null,
		].map((maxBytes) => ({ maxBytes })),
	].map((options) => ({ options })),
)(
	"rejects invalid wrapper options rather than clamping: $options",
	({ options }) => {
		const tree = document(privateSentinel);
		expectSafeFailure(
			() =>
				discoverDocumentTextLines(tree, privateSentinel, options as Options),
			"invalid-input",
		);
	},
);

it.each(["maxEntries", "maxBytes", "proxy"])(
	"redacts hostile option access through %s",
	(property) => {
		const failure = () => {
			throw new Error(privateSentinel);
		};
		const options =
			property === "proxy"
				? new Proxy({}, { get: failure, getOwnPropertyDescriptor: failure })
				: Object.defineProperty({}, property, { get: failure });
		expectSafeFailure(
			() =>
				discoverDocumentTextLines(
					document(privateSentinel),
					privateSentinel,
					options,
				),
			"invalid-input",
		);
	},
);

it.each(
	[1, 50, 200].flatMap((maxEntries) =>
		[0, 1].map((extra) => ({ maxEntries, extra })),
	),
)(
	"counts all lines at cap $maxEntries with $extra extra match",
	({ maxEntries, extra }) => {
		const matchedLines = maxEntries + extra;
		const source = `${Array.from({ length: matchedLines }, () => "x x").join("\r\n")}\nno match\r`;
		const result = discoverDocumentTextLines(document(source), "x", {
			maxEntries,
		});
		expect(result.entries).toEqual(
			Array.from({ length: maxEntries }, (_, index) => ({
				line: index + 1,
				column: 1,
			})),
		);
		expect(result).toMatchObject({
			totalLines: matchedLines + 2,
			matchedLines,
			sourceCodeUnits: source.length,
			truncated: extra > 0,
		});
	},
);

it("defaults to 50 entries and continues counting after truncation", () => {
	const tree = document(`${"x\n".repeat(51)}nothing\n`);
	const result = discoverDocumentTextLines(tree, "x");
	expect(result.entries).toHaveLength(50);
	expect(result).toMatchObject({
		totalLines: 53,
		matchedLines: 51,
		truncated: true,
	});
	expect(discoverDocumentTextLines(tree, "x", { maxBytes: 262_144 })).toEqual(
		result,
	);
});

it.each([256, 1_048_576])(
	"accepts inclusive maxBytes boundary %s",
	(maxBytes) => {
		const result = discoverDocumentTextLines(document(""), "x", { maxBytes });
		expect(result.entries).toEqual([]);
		expect(
			new TextEncoder().encode(JSON.stringify(result)).byteLength,
		).toBeLessThanOrEqual(maxBytes);
	},
);

it("enforces the exact serialized whole-result byte cap, including metadata", () => {
	const tree = document("x\n".repeat(20));
	const result = discoverDocumentTextLines(tree, "x");
	const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
	const entriesBytes = new TextEncoder().encode(
		JSON.stringify(result.entries),
	).byteLength;
	expect(entriesBytes).toBeGreaterThanOrEqual(256);
	expect(bytes).toBeGreaterThan(entriesBytes);
	expect(discoverDocumentTextLines(tree, "x", { maxBytes: bytes })).toEqual(
		result,
	);
	for (const maxBytes of [256, bytes - 1, entriesBytes])
		expectSafeFailure(
			() => discoverDocumentTextLines(tree, "x", { maxBytes }),
			"resource-limit",
		);
});

it.each([2_000_000, 2_000_001])(
	"enforces the independent source cap at %s code units",
	(length) => {
		const source = `${"😀".repeat(999_999)}x${length === 2_000_000 ? "x" : "xx"}`;
		const tree = document(source, context(8_000_000));
		expect(source.length).toBe(length);
		if (length > 2_000_000) {
			expectSafeFailure(
				() => discoverDocumentTextLines(tree, "absent"),
				"resource-limit",
			);
			return;
		}
		expect(discoverDocumentTextLines(tree, "xx")).toMatchObject({
			entries: [{ line: 1, column: 1_999_999 }],
			totalLines: 1,
			matchedLines: 1,
			sourceCodeUnits: length,
			truncated: false,
		});
	},
);

it("refuses HTML lookalikes and unregistered synthetic pre documents", () => {
	const html = retain(parseHtmlDocument(`<pre>${privateSentinel}</pre>`, url));
	const synthetic = retain(new DocumentTree(url));
	const pre = synthetic.createElement("pre");
	synthetic.append(synthetic.root, pre);
	synthetic.append(pre, synthetic.createText(privateSentinel));
	for (const tree of [html, synthetic]) {
		expect(textDocumentInfo(tree)).toBeUndefined();
		expectSafeFailure(
			() => discoverDocumentTextLines(tree, privateSentinel),
			"unsupported",
		);
	}
});

it.each([
	"text",
	"restored text",
	"attribute",
	"restored attribute",
	"replacement",
	"restored structure",
])("refuses changed loader documents after %s", (change) => {
	const tree = document(privateSentinel);
	const pre = tree.get(tree.root).children[0];
	const text = tree.get(pre).children[0];
	if (change === "attribute" || change === "restored attribute") {
		tree.setAttribute(pre, "title", privateSentinel);
		if (change === "restored attribute") tree.removeAttribute(pre, "title");
	} else if (change === "restored structure") {
		const extra = tree.createText(privateSentinel);
		tree.append(pre, extra);
		tree.remove(extra);
	} else if (change === "replacement")
		tree.setTextContent(pre, privateSentinel);
	else {
		tree.setData(text, "changed");
		if (change === "restored text") tree.setData(text, privateSentinel);
	}
	expectSafeFailure(
		() => discoverDocumentTextLines(tree, privateSentinel),
		"unsupported",
	);
});

it.each(["root sibling", "pre sibling", "wrapper"])(
	"checks registered native structure independently of revision: %s",
	(shape) => {
		const tree = document(privateSentinel, {
			...context(),
			initializeDocument: (initialized) => {
				if (shape === "root sibling") {
					initialized.append(initialized.root, initialized.createElement("p"));
					return;
				}
				initialized.onChange((change) => {
					if (change.kind !== "insert") return;
					const node = initialized.get(change.target);
					if (node.tagName !== "pre" || node.parent !== initialized.root)
						return;
					if (shape === "pre sibling")
						initialized.append(
							node.id,
							initialized.createText(privateSentinel),
						);
					else {
						const wrapper = initialized.createElement("div");
						initialized.append(initialized.root, wrapper);
						initialized.append(wrapper, node.id);
					}
				});
			},
		});
		expect(textDocumentInfo(tree)?.revision).toBe(tree.revision);
		expectSafeFailure(
			() => discoverDocumentTextLines(tree, privateSentinel),
			"unsupported",
		);
	},
);

it("preserves document ownership and returns fresh coordinate records", () => {
	const source = `${privateSentinel}\r\n${privateSentinel}`;
	const tree = document(source);
	const info = textDocumentInfo(tree);
	if (!info) throw new Error("Expected text-loader registration");
	const node = tree.get(info.textNode);
	const reference = tree.reference(node.id);
	const changes = tree.changesSince(0);
	let notifications = 0;
	tree.onChange(() => notifications++);
	tree.onMutation(() => notifications++);
	const options = { maxEntries: 1 };
	const first = discoverDocumentTextLines(tree, privateSentinel, options);
	const second = discoverDocumentTextLines(tree, privateSentinel, options);
	expect(second).toEqual(first);
	expect(second).not.toBe(first);
	expect(second.entries).not.toBe(first.entries);
	expect(second.entries[0]).not.toBe(first.entries[0]);
	options.maxEntries = 2;
	expect(first.entries).toEqual([{ line: 1, column: 1 }]);
	expect(first.truncated).toBe(true);
	expect(
		discoverDocumentTextLines(tree, privateSentinel, options).entries,
	).toHaveLength(2);
	expect(tree.get(node.id)).toBe(node);
	expect(node.data).toBe(source);
	expect(tree.reference(node.id)).toBe(reference);
	expect(tree.revision).toBe(info.revision);
	expect(textDocumentInfo(tree)).toBe(info);
	expect(tree.changesSince(0)).toEqual(changes);
	expect(notifications).toBe(0);
	expect(JSON.stringify(first)).not.toContain(privateSentinel);
});

it("does not reuse registration or captured source after close", () => {
	const tree = document(privateSentinel);
	tree.close();
	expect(textDocumentInfo(tree)).toBeUndefined();
	expectSafeFailure(
		() => discoverDocumentTextLines(tree, privateSentinel),
		"closed",
	);
});
