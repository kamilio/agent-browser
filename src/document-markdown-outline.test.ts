import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import { researchNavigation } from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { parseResearchReplayArguments } from "../scripts/research-replay-cli.js";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import {
	type ExtractedNode,
	discoverDocumentHeadings,
	discoverDocumentLinks,
	extractDocument,
} from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import { textDocumentInfo } from "./text-document-info.js";
import { loadTextDocument } from "./text-loader.js";

const url = "https://markdown-outline.fixture.invalid/document.md";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const formats = ["json", "markdown"] as const;
const loaders = [
	{ name: "text", load: loadTextDocument },
	{ name: "native", load: loadBrowserDocument },
	{ name: "reader", load: loadResearchDocument },
];
const modes = [
	{ mode: "native", reader: false },
	{ mode: "reader", reader: true },
];
const sourceLines = [
	"---",
	"title: Not a rendered title",
	"# Metadata candidate",
	"---",
	"# Overview",
	"Introduction.",
	"## Wanted *literal* [guide](guide.md)",
	"Wanted body café.",
	"### Detail `code`",
	"```md",
	"# Fenced candidate",
	"```",
	'<script src="https://markdown-outline.fixture.invalid/inert.js">',
	"# Raw candidate",
	"</script>",
	"Detail body.",
	"## Next",
	"Outside suffix.",
	"",
];
const source = sourceLines.join("\n");
const expectedOutline = {
	kind: "markdown-source-outline-v1",
	partial: true,
	sourceCodeUnits: source.length,
	totalLines: 19,
	matchedHeadings: 4,
	leadingMetadataLines: 4,
	truncated: false,
	entries: [
		{
			level: 1,
			title: "Overview",
			titleTruncated: false,
			startLine: 5,
			endLine: 19,
		},
		{
			level: 2,
			title: "Wanted *literal* [guide](guide.md)",
			titleTruncated: false,
			startLine: 7,
			endLine: 16,
		},
		{
			level: 3,
			title: "Detail `code`",
			titleTruncated: false,
			startLine: 9,
			endLine: 16,
		},
		{
			level: 2,
			title: "Next",
			titleTruncated: false,
			startLine: 17,
			endLine: 19,
		},
	],
};
let expectedRequests = 0;

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error("Unexpected Markdown outline fixture request"),
	);
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Markdown outline fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		for (const tree of trees.splice(0)) tree.close();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		expect(fetch).not.toHaveBeenCalled();
		const close = vi.mocked(DocumentTree.prototype.close);
		expect(close).toHaveBeenCalled();
		for (const tree of close.mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected closed fixture document");
			expect(tree.mutationMetrics().closed).toBe(true);
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function response(text = source, mime = "text/markdown"): NetworkResponse {
	const body = encoder.encode(text);
	return {
		url,
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
		tabId: "tab-1",
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
		},
	};
}

function retain(tree: DocumentTree) {
	trees.push(tree);
	return tree;
}

function document(text = source, mime = "text/markdown") {
	return retain(loadTextDocument(response(text, mime), context()));
}

function nodeText(node: ExtractedNode): string {
	return [node.text ?? "", ...(node.children ?? []).map(nodeText)].join("");
}

function expectBody(result: ReturnType<typeof extractDocument>, text: string) {
	if (result.format === "json") {
		expect(nodeText(result.content)).toBe(text);
		expect(result.content.children).toEqual([
			expect.objectContaining({
				type: "pre",
				children: [expect.objectContaining({ type: "text", text })],
			}),
		]);
	} else
		expect(result.content).toBe(
			`\`\`\`\`\n${text}${text.endsWith("\n") ? "" : "\n"}\`\`\`\`\n`,
		);
}

function outline(tree: DocumentTree) {
	const result = extractDocument(tree).sourceMarkdown;
	if (!result) throw new Error("Expected Markdown source outline");
	return result;
}

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

async function capture(
	reader: boolean,
	format: "json" | "markdown",
	status = 200,
) {
	const input = response();
	input.status = status;
	expectedRequests = 1;
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await researchNavigation(
		url,
		reader,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{ format, minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({
		requests: 0,
		active: 0,
		closed: true,
	});
	expect(input.body).toEqual(encoder.encode(source));
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
	expect(report.extraction?.sourceMarkdown).toEqual(expectedOutline);
	const serialized = serializeResearchReport(report);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const text = new TextDecoder().decode(raw);
	expect(text.endsWith("\n")).toBe(true);
	expect(text.split("\n")).toHaveLength(2);
	expect(JSON.parse(text).extraction).toEqual(report.extraction);
	const trusted = {
		expectedProfile: "default",
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: input.body.byteLength, sha256: hash(input.body) },
	} satisfies TrustedResearchReplayAdmission;
	return { report, raw, trusted, body: input.body };
}

it.each(loaders)(
	"adds source metadata through $name without rendering or loading resources",
	async ({ load }) => {
		const forbidden = vi.fn(async () => {
			throw new Error("Markdown must remain inert");
		});
		const input = response(source, ' TEXT/MARKDOWN ; CHARSET="UTF-8"');
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
		const info = textDocumentInfo(tree);
		if (!info) throw new Error("Expected text registration");
		const revision = tree.revision;
		const changes = tree.changesSince(0);
		const queries = new DocumentQueries(tree);
		try {
			const pre = queries.querySelector("pre");
			if (pre === null) throw new Error("Expected literal pre");
			expect(queries.querySelectorAll("*")).toEqual([pre]);
			expect(tree.get(tree.root).children).toEqual([pre]);
			expect(tree.get(pre).children).toEqual([info.textNode]);
			expect(tree.get(info.textNode)).toMatchObject({
				kind: "text",
				data: source,
			});
		} finally {
			queries.close();
		}
		expect(info.mime).toBe("text/markdown");
		expect(extractDocument(tree)).toMatchObject({
			title: "",
			partial: true,
			sourceMarkdown: expectedOutline,
		});
		expect(discoverDocumentHeadings(tree).entries).toEqual([]);
		expect(discoverDocumentLinks(tree, "guide").entries).toEqual([]);
		expect(tree.revision).toBe(revision);
		expect(tree.changesSince(0)).toEqual(changes);
		expect(input.body).toEqual(encoder.encode(source));
		expect(forbidden).not.toHaveBeenCalled();
	},
);

it.each([
	"text/plain",
	"text/html",
	"text/csv",
	"application/json",
	"application/xml",
])("does not sniff an outline from Markdown-looking %s", async (mime) => {
	for (const { load, name } of loaders) {
		const input = response("# Not Markdown\nLiteral body.\n", mime);
		if (mime === "text/html" && name === "text") {
			expect(() => loadTextDocument(input, context())).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
			continue;
		}
		const tree = retain(await load(input, context()));
		for (const format of formats)
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceMarkdown",
			);
	}
});

it("does not infer Markdown registration from a synthetic pre or its URL", () => {
	const tree = retain(new DocumentTree(url));
	const pre = tree.createElement("pre");
	tree.append(tree.root, pre);
	tree.append(pre, tree.createText(source));
	expect(textDocumentInfo(tree)).toBeUndefined();
	expect(extractDocument(tree)).not.toHaveProperty("sourceMarkdown");
});

it("omits the property when registered Markdown has no source headings", () => {
	const tree = document("Ordinary prose and [a link](guide.md).\n");
	for (const format of formats)
		expect(extractDocument(tree, { format })).not.toHaveProperty(
			"sourceMarkdown",
		);
});

it.each(["root sibling", "pre sibling", "wrapper"])(
	"preserves ordinary extraction but omits outlines for initialized %s shapes",
	(shape) => {
		const initializedBody = "Initializer body.";
		const initializedContext: DocumentLoaderContext = {
			...context(),
			initializeDocument: (initialized) => {
				if (shape === "root sibling") {
					const paragraph = initialized.createElement("p");
					initialized.append(initialized.root, paragraph);
					initialized.append(
						paragraph,
						initialized.createText(initializedBody),
					);
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
							initialized.createText(initializedBody),
						);
					else {
						const wrapper = initialized.createElement("div");
						initialized.append(initialized.root, wrapper);
						initialized.append(wrapper, node.id);
					}
				});
			},
		};
		const tree = retain(loadTextDocument(response(), initializedContext));
		const plain = retain(
			loadTextDocument(response(source, "text/plain"), initializedContext),
		);
		const revision = tree.revision;
		expect(textDocumentInfo(tree)?.revision).toBe(revision);
		for (const format of formats) {
			const result = extractDocument(tree, { format });
			const baseline = extractDocument(plain, { format });
			expect(result).not.toHaveProperty("sourceMarkdown");
			const body =
				result.format === "json" ? nodeText(result.content) : result.content;
			expect(body).toBe(
				baseline.format === "json"
					? nodeText(baseline.content)
					: baseline.content,
			);
			expect(body).toContain(source);
			if (shape !== "wrapper")
				expect(body).toContain(
					result.format === "markdown" && shape === "root sibling"
						? "Initializer body\\."
						: initializedBody,
				);
			expect(() =>
				extractDocument(tree, { format, lines: { start: 7, end: 16 } }),
			).toThrow(
				expect.objectContaining({
					code: "unsupported",
					message:
						"Text line extraction requires only the native pre and registered text node",
				}),
			);
		}
		expect(tree.revision).toBe(revision);
		expect(tree.textContent(tree.root)).toContain(source);
	},
);

it("retains outlines and strict lines after shape-preserving initialization", () => {
	const tree = retain(
		loadTextDocument(response(), {
			...context(),
			initializeDocument: (initialized) => {
				initialized.onChange((change) => {
					if (change.kind !== "insert") return;
					const node = initialized.get(change.target);
					if (node.tagName === "pre")
						initialized.setAttribute(node.id, "data-initialized", "true");
				});
			},
		}),
	);
	const revision = tree.revision;
	for (const format of formats) {
		const result = extractDocument(tree, { format });
		expect(result.sourceMarkdown).toEqual(expectedOutline);
		expectBody(result, source);
		const selected = extractDocument(tree, {
			format,
			lines: { start: 7, end: 16 },
		});
		expect(selected.sourceMarkdown).toEqual(expectedOutline);
		expectBody(selected, `${sourceLines.slice(6, 16).join("\n")}\n`);
	}
	const pre = tree.get(tree.root).children[0];
	expect(tree.get(pre).attributes["data-initialized"]).toBe("true");
	expect(tree.revision).toBe(revision);
	expect(textDocumentInfo(tree)?.revision).toBe(revision);
	expect(tree.textContent(tree.root)).toBe(source);
});

it.each(formats)(
	"adds only metadata to existing literal %s extraction",
	(format) => {
		const markdown = document();
		const plain = document(source, "text/plain");
		const result = extractDocument(markdown, { format });
		const baseline = extractDocument(plain, { format });
		expectBody(result, source);
		expect(result.title).toBe("");
		expect(result.sourceMarkdown).toEqual(expectedOutline);
		expect(Object.keys(result).sort()).toEqual(
			[...Object.keys(baseline), "sourceMarkdown"].sort(),
		);
		if (result.format === "markdown" && baseline.format === "markdown")
			expect(result.content).toBe(baseline.content);
		else if (result.format === "json" && baseline.format === "json")
			expect(nodeText(result.content)).toBe(nodeText(baseline.content));
		expect(textDocumentInfo(markdown)?.revision).toBe(markdown.revision);
	},
);

it.each(formats)(
	"uses physical source ranges for %s while keeping a document-wide outline",
	(format) => {
		const physicalLines = sourceLines.map((line, index) =>
			index === sourceLines.length - 1
				? line
				: line + ["\r\n", "\r", "\n"][index % 3],
		);
		const mixedSource = physicalLines.join("");
		const tree = document(mixedSource);
		const discovered = outline(tree);
		expect(discovered).toEqual({
			...expectedOutline,
			sourceCodeUnits: mixedSource.length,
		});
		const wanted = discovered.entries[1];
		const lines = { start: wanted.startLine, end: wanted.endLine };
		const selected = extractDocument(tree, { format, lines });
		expectBody(selected, `${sourceLines.slice(6, 16).join("\n")}\n`);
		expect(selected.sourceMarkdown).toEqual(discovered);
		expect(selected.textSelection).toEqual({
			method: "text-lines",
			...lines,
			totalLines: 19,
			sourceCodeUnits: mixedSource.length,
			selectedCodeUnits: physicalLines.slice(6, 16).join("").length,
		});
		const text =
			selected.format === "markdown"
				? selected.content
				: nodeText(selected.content);
		expect(text).not.toContain("## Next");
		expect(text).not.toContain("Outside suffix.");
		expect(tree.textContent(tree.root)).toBe(mixedSource);
	},
);

it.each(["text", "restored text", "restored attribute"])(
	"drops stale source metadata after %s without trusting restored bytes",
	(change) => {
		const tree = document();
		const before = outline(tree);
		const info = textDocumentInfo(tree);
		if (!info) throw new Error("Expected text registration");
		if (change === "restored attribute") {
			const pre = tree.get(tree.root).children[0];
			tree.setAttribute(pre, "title", "changed");
			tree.removeAttribute(pre, "title");
		} else {
			tree.setData(info.textNode, "# Replacement\nChanged body.");
			if (change === "restored text") tree.setData(info.textNode, source);
		}
		expect(tree.revision).not.toBe(info.revision);
		for (const format of formats)
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceMarkdown",
			);
		expect(before).toEqual(expectedOutline);
	},
);

it("cleans up registration on close and refuses further extraction", () => {
	const tree = document();
	const before = outline(tree);
	tree.close();
	expect(textDocumentInfo(tree)).toBeUndefined();
	expect(() => extractDocument(tree)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(before).toEqual(expectedOutline);
	const replacement = document("# Replacement\n");
	expect(outline(replacement).entries.map((entry) => entry.title)).toEqual([
		"Replacement",
	]);
});

it("returns frozen outline, entries and heading records without changing ownership", () => {
	const tree = document();
	const info = textDocumentInfo(tree);
	const revision = tree.revision;
	const changed = vi.fn();
	tree.onChange(changed);
	tree.onMutation(changed);
	const first = outline(tree);
	expect(Object.isFrozen(first)).toBe(true);
	expect(Object.isFrozen(first.entries)).toBe(true);
	for (const entry of first.entries) expect(Object.isFrozen(entry)).toBe(true);
	expect(Reflect.set(first, "totalLines", 1)).toBe(false);
	expect(Reflect.set(first.entries, "0", null)).toBe(false);
	expect(Reflect.set(first.entries[0], "title", "Changed")).toBe(false);
	expect(outline(tree)).toEqual(expectedOutline);
	expect(tree.revision).toBe(revision);
	expect(textDocumentInfo(tree)).toBe(info);
	expect(changed).not.toHaveBeenCalled();
});

it("escapes terminal controls in metadata without interpreting inline title syntax", () => {
	const text = "# *literal* [guide](guide.md) \u001b[31m\n";
	const tree = document(text);
	expect(outline(tree).entries[0]).toMatchObject({
		title: "*literal* [guide](guide.md) \\u{1b}[31m",
		titleTruncated: false,
	});
	expect(tree.textContent(tree.root)).toBe(text);
	expect(discoverDocumentHeadings(tree).entries).toEqual([]);
	expect(discoverDocumentLinks(tree, "guide").entries).toEqual([]);
});

it.each(formats)(
	"charges source metadata to the existing %s byte quota",
	(format) => {
		const tree = document();
		for (const lines of [undefined, { start: 7, end: 16 }]) {
			const options = { format, lines };
			const result = extractDocument(tree, options);
			const { sourceMarkdown, ...withoutOutline } = result;
			expect(sourceMarkdown).toEqual(expectedOutline);
			const bytes = encoder.encode(JSON.stringify(result)).byteLength;
			expect(bytes).toBeGreaterThan(
				encoder.encode(JSON.stringify(withoutOutline)).byteLength,
			);
			expect(extractDocument(tree, { ...options, maxBytes: bytes })).toEqual(
				result,
			);
			expect(() =>
				extractDocument(tree, { ...options, maxBytes: bytes - 1 }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
		}
		expect(tree.textContent(tree.root)).toBe(source);
	},
);

it.each(
	modes.flatMap((mode) => formats.map((format) => ({ ...mode, format }))),
)(
	"serializes a synthetic $mode receipt and replays its pinned source lines as $format",
	async ({ reader, format }) => {
		const { report, raw, trusted, body } = await capture(reader, format);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			classification: { barrier: null },
			extraction: { format, title: "", partial: true },
		});
		if (!report.extraction?.sourceMarkdown)
			throw new Error("Expected captured outline");
		expectBody(report.extraction, source);
		const wanted = report.extraction.sourceMarkdown.entries[1];
		const parsed = parseResearchReplayArguments([
			"--expected-profile",
			"default",
			"--receipt-sha256",
			trusted.expectedReceiptSha256,
			"--body-sha256",
			trusted.expectedBody.sha256,
			"--body-bytes",
			String(trusted.expectedBody.bytes),
			"--lines",
			`${wanted.startLine}:${wanted.endLine}`,
			"--format",
			format,
		]);
		expect(parsed).toEqual({
			trusted,
			selection: { lines: { start: 7, end: 16 } },
			format,
		});
		if (!("lines" in parsed.selection) || !parsed.format)
			throw new Error("Expected explicit line selection and format");
		const original = raw.slice();
		const close = vi.mocked(DocumentTree.prototype.close);
		const closedBeforeReplay = close.mock.calls.length;
		const result = extractResearchReplayJson(
			raw,
			parsed.trusted,
			parsed.selection,
			undefined,
			parsed.format,
		);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			networkRequests: 0,
			selection: { method: "text-lines", matches: 10 },
			source: {
				receiptSha256: trusted.expectedReceiptSha256,
				body: trusted.expectedBody,
			},
			extraction: {
				format,
				title: "",
				partial: true,
				sourceMarkdown: expectedOutline,
				textSelection: {
					method: "text-lines",
					start: 7,
					end: 16,
					totalLines: 19,
				},
			},
		});
		if (!result.report.extraction)
			throw new Error("Expected replay extraction");
		expectBody(
			result.report.extraction,
			`${sourceLines.slice(6, 16).join("\n")}\n`,
		);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(close).toHaveBeenCalledTimes(closedBeforeReplay + 1);
		expect(raw).toEqual(original);
		expect(body).toEqual(decodeResearchBodyCapture(report.bodyCapture));
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	},
);

it.each(formats)(
	"does not let a %s source outline admit an HTTP-failure receipt",
	async (format) => {
		const { report, raw, trusted } = await capture(true, format, 404);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
		});
		expect(validateResearchReplayAdmission(raw, trusted)).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
		});
		const original = raw.slice();
		const close = vi.mocked(DocumentTree.prototype.close);
		const closedBeforeReplay = close.mock.calls.length;
		expect(() =>
			extractResearchReplayJson(
				raw,
				trusted,
				{ lines: { start: 7, end: 16 } },
				undefined,
				format,
			),
		).toThrow(expect.objectContaining({ code: "policy-denied" }));
		expect(close).toHaveBeenCalledTimes(closedBeforeReplay);
		expect(raw).toEqual(original);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	},
);
