import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import {
	type ResearchJsonReplayReport,
	type ResearchJsonReplaySelection,
	extractResearchReplayJson,
	researchJsonReplayLimits,
} from "../scripts/research-json-replay.js";
import { runResearchReplayCli } from "../scripts/research-replay-cli.js";
import * as challenges from "./browser-challenges.js";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import { researchReaderInfo } from "./research-reader-info.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import { textDocumentInfo } from "./text-document-info.js";
import { loadTextDocument } from "./text-loader.js";

const encoder = new TextEncoder();
const url = "https://markdown-links.fixture.invalid/docs/index.md";
const source = [
	"# Source heading",
	"[First *literal* café](guide-one.md)",
	"[Second](../GUIDE-two#details)",
	"[guide label only](other.md)",
	"",
].join("\n");
const trees: DocumentTree[] = [];
const streams: Array<Readable | Writable> = [];
let expectedRequests = 0;

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: TrustedResearchReplayAdmission;
}

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error("Unexpected Markdown integration request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Markdown integration must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		for (const stream of streams.splice(0)) stream.destroy();
		for (const tree of trees.splice(0)) tree.close();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

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
		tabId: "markdown-links",
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

function sourceLinks(result: extraction.DocumentLinkDiscovery) {
	expect(result.entries).toEqual([]);
	expect(result.scannedNodes).toBe(3);
	expect(result.sourceMarkdown).toBeDefined();
	if (!result.sourceMarkdown) throw new Error("Expected source-only links");
	for (const entry of result.sourceMarkdown.entries) {
		expect(Object.keys(entry).sort()).toEqual([
			"column",
			"label",
			"labelTruncated",
			"startLine",
			"url",
		]);
	}
	return result.sourceMarkdown;
}

async function capture(
	text = source,
	options: {
		reader?: boolean;
		mime?: string;
		status?: number;
		profile?: ResearchDocumentProfileId;
		policies?: boolean;
	} = {},
): Promise<Fixture> {
	const input = response(text, options.mime);
	input.status = options.status ?? 200;
	expectedRequests++;
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const profile = options.profile ?? "default";
	const report = await researchNavigation(
		url,
		options.reader ?? true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		profile === "long-v1",
		undefined,
		profile,
		{
			minRequestIntervalMs: 0,
			...(options.policies
				? {
						readerRawPolicy: "separate-omitted-raw-v1" as const,
						readerVisibilityPolicy: "source-hidden-inline-v1" as const,
					}
				: {}),
		},
	);
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(input.body).toEqual(encoder.encode(text));
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
	const serialized = serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	return {
		report,
		raw: serialized.jsonl,
		body: input.body,
		trusted: {
			expectedProfile: profile,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: { bytes: input.body.byteLength, sha256: hash(input.body) },
		},
	};
}

function revised(
	input: Fixture,
	mutate: (report: ResearchNavigationReport) => void,
): Fixture {
	const report = structuredClone(input.report);
	mutate(report);
	const serialized = serializeResearchReport(
		report,
		input.trusted.expectedProfile,
	);
	expect(serialized.disposition).toBe("complete");
	return {
		...input,
		report,
		raw: serialized.jsonl,
		trusted: {
			...input.trusted,
			expectedReceiptSha256: hash(serialized.jsonl),
		},
	};
}

function replay(
	input: Fixture,
	selection: ResearchJsonReplaySelection = { links: "guide" },
) {
	const before = structuredClone(input);
	try {
		const result = extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection,
		);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(result.jsonl.endsWith("\n")).toBe(true);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(
			researchJsonReplayLimits.maxOutputBytes,
		);
		expect(result.report).toMatchObject({
			kind: "native-research-json-replay-v1",
			partial: true,
			networkRequests: 0,
			source: {
				profile: input.trusted.expectedProfile,
				reportedFinalUrl: url,
				receiptSha256: input.trusted.expectedReceiptSha256,
				body: input.trusted.expectedBody,
			},
		});
		expect(result.report).not.toHaveProperty("extraction");
		expect(result.report).not.toHaveProperty("bodyCapture");
		return result;
	} finally {
		expect(input).toEqual(before);
	}
}

function observeOwnership() {
	const validate = admission.validateResearchReplayAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		(...args) => {
			const result = validate(...args);
			if (result.kind === "validated-capture") bodies.push(result.body);
			return result;
		},
	);
	const load = vi.spyOn(loader, "loadResearchDocument");
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return {
		load,
		assert() {
			expect(bodies).toHaveLength(1);
			expect(bodies[0].byteLength).toBeGreaterThan(0);
			expect(bodies[0].every((value) => value === 0)).toBe(true);
			expect(close).toHaveBeenCalledOnce();
			const tree = close.mock.contexts[0];
			expect(tree).toBeInstanceOf(DocumentTree);
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected closed replay document");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(textDocumentInfo(tree)).toBeUndefined();
			expect(researchReaderInfo(tree)).toBeUndefined();
		},
	};
}

it.each([
	{ name: "text", load: loadTextDocument },
	{ name: "native", load: loadBrowserDocument },
	{ name: "reader", load: loader.loadResearchDocument },
])(
	"discovers literal source links through the $name loader without execution",
	async ({ load }) => {
		const forbidden = vi.fn(async () => {
			throw new Error("Literal Markdown must remain inert");
		});
		const input = response(
			`${source}<script src="/inert.js"></script>\n![image](/image.png)\n`,
			' TEXT/MARKDOWN ; CHARSET="UTF-8"',
		);
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
		const revision = tree.revision;
		const before = serializeHtml(tree);
		const result = extraction.discoverDocumentLinks(tree, "gUiDe");
		expect(sourceLinks(result)).toMatchObject({
			kind: "markdown-source-links-v1",
			partial: true,
			query: "gUiDe",
			sourceCodeUnits: tree.textContent(tree.root).length,
			truncated: false,
			entries: [
				{
					url: "https://markdown-links.fixture.invalid/docs/guide-one.md",
					label: "First *literal* café",
					labelTruncated: false,
					startLine: 2,
					column: 1,
				},
				{
					url: "https://markdown-links.fixture.invalid/GUIDE-two#details",
					label: "Second",
					startLine: 3,
					column: 1,
				},
			],
		});
		expect(result).toMatchObject({
			document: tree.reference(tree.root),
			revision,
		});
		const queries = new DocumentQueries(tree);
		try {
			expect(queries.querySelectorAll("a,h1,h2,img,script")).toEqual([]);
		} finally {
			queries.close();
		}
		expect(extraction.discoverDocumentHeadings(tree).entries).toEqual([]);
		expect(extraction.discoverDocumentLinks(tree, "gUiDe")).toEqual(result);
		expect(tree.revision).toBe(revision);
		expect(serializeHtml(tree)).toBe(before);
		expect(input.body).toEqual(encoder.encode(tree.textContent(tree.root)));
		expect(forbidden).not.toHaveBeenCalled();
	},
);

it.each(["json", "markdown"] as const)(
	"keeps %s extraction literal and separate from requested link discovery",
	(format) => {
		const tree = document();
		const before = extraction.extractDocument(tree, { format });
		extraction.discoverDocumentLinks(tree, "guide");
		expect(extraction.extractDocument(tree, { format })).toEqual(before);
		expect(before.title).toBe("");
		expect(before.sourceMarkdown?.kind).toBe("markdown-source-outline-v1");
		if (before.format === "json") {
			expect(before.content.children).toEqual([
				expect.objectContaining({
					type: "pre",
					children: [expect.objectContaining({ type: "text", text: source })],
				}),
			]);
		} else expect(before.content).toBe(`\`\`\`\n${source}\`\`\`\n`);
		expect(extraction.discoverDocumentHeadings(tree).entries).toEqual([]);
	},
);

it("leaves HTML anchors, refs and extraction unchanged", () => {
	const tree = retain(
		parseHtmlDocument(
			'<h1>Heading</h1><a href="guide.md">Guide</a><p>[Literal](guide-two.md)</p>',
			url,
		),
	);
	const before = extraction.extractDocument(tree);
	const result = extraction.discoverDocumentLinks(tree, "guide");
	expect(result).not.toHaveProperty("sourceMarkdown");
	expect(result.entries).toHaveLength(1);
	expect(tree.resolve(result.entries[0].ref).tagName).toBe("a");
	expect(extraction.extractDocument(tree)).toEqual(before);
});

it.each(["text/plain", "text/csv", "application/json"])(
	"does not promote %s source syntax into Markdown links",
	(mime) => {
		const tree = document(source, mime);
		const before = extraction.extractDocument(tree);
		expect(extraction.discoverDocumentLinks(tree, "guide")).toMatchObject({
			entries: [],
			scannedNodes: 3,
			truncated: false,
		});
		expect(extraction.discoverDocumentLinks(tree, "guide")).not.toHaveProperty(
			"sourceMarkdown",
		);
		expect(extraction.extractDocument(tree)).toEqual(before);
		expect(tree.textContent(tree.root)).toBe(source);
	},
);

it.each(["label", "guide.*"])(
	"does not match labels or regex syntax for %s",
	(query) => {
		const result = extraction.discoverDocumentLinks(document(), query);
		expect(result).toMatchObject({
			entries: [],
			scannedNodes: 3,
			truncated: false,
		});
		expect(result.sourceMarkdown?.entries ?? []).toEqual([]);
	},
);

it("applies the default 32-entry and 256-unit label limits only to source candidates", () => {
	const text = Array.from(
		{ length: 35 },
		(_, index) => `[${"L".repeat(257)}](guide-${index})`,
	).join("\n");
	const result = extraction.discoverDocumentLinks(document(text), "guide");
	const metadata = sourceLinks(result);
	expect(result.truncated).toBe(true);
	expect(metadata.truncated).toBe(true);
	expect(metadata.entries).toHaveLength(32);
	expect(metadata.entries[0]).toMatchObject({
		label: "L".repeat(256),
		labelTruncated: true,
	});
	expect(metadata.entries[31].url).toBe(new URL("guide-31", url).href);
	expect(metadata.scannedCodeUnits).toBeLessThanOrEqual(text.length);
});

it("forwards caller entry and label bounds without splitting Unicode", () => {
	const tree = document("[A😀Z](guide-one)\n[Second](guide-two)\n");
	const result = extraction.discoverDocumentLinks(tree, "guide", {
		maxEntries: 1,
		maxLabelCodeUnits: 2,
	});
	expect(sourceLinks(result)).toMatchObject({
		truncated: true,
		entries: [{ label: "A", labelTruncated: true }],
	});
	expect(result.truncated).toBe(true);
});

it("never publishes a caller-truncated destination as a navigable URL", () => {
	const destination = new URL("guide-one.md", url).href;
	const tree = document("[Guide](guide-one.md)");
	expect(
		sourceLinks(
			extraction.discoverDocumentLinks(tree, "guide", {
				maxUrlCodeUnits: destination.length,
			}),
		).entries[0].url,
	).toBe(destination);
	const limited = extraction.discoverDocumentLinks(tree, "guide", {
		maxUrlCodeUnits: destination.length - 1,
	});
	expect(limited.entries).toEqual([]);
	expect(limited.sourceMarkdown?.entries ?? []).toEqual([]);
});

it("charges all source metadata to the existing serialized byte budget", () => {
	const tree = document();
	const result = extraction.discoverDocumentLinks(tree, "guide");
	const { sourceMarkdown, ...withoutSource } = result;
	expect(sourceMarkdown).toBeDefined();
	const bytes = encoder.encode(JSON.stringify(result)).byteLength;
	expect(bytes).toBeGreaterThan(
		encoder.encode(JSON.stringify(withoutSource)).byteLength,
	);
	expect(
		extraction.discoverDocumentLinks(tree, "guide", { maxBytes: bytes }),
	).toEqual(result);
	expect(() =>
		extraction.discoverDocumentLinks(tree, "guide", { maxBytes: bytes - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each([{ maxNodes: 2 }, { maxDepth: 1 }])(
	"retains DOM traversal limits %j for literal documents",
	(options) => {
		expect(() =>
			extraction.discoverDocumentLinks(document(), "guide", options),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("checkpoints during a long source scan and propagates cancellation unchanged", () => {
	const tree = document(`${"x".repeat(20_000)}\n[Guide](guide.md)\n`);
	const before = tree.revision;
	const cancellation = new AgentBrowserError(
		"aborted",
		"Synthetic cancellation",
	);
	let calls = 0;
	const checkpoint = vi.fn(() => {
		if (++calls === 10) throw cancellation;
	});
	expect(() =>
		extraction.discoverDocumentLinks(tree, "guide", { checkpoint }),
	).toThrow(cancellation);
	expect(checkpoint).toHaveBeenCalledTimes(10);
	expect(tree.revision).toBe(before);
	expect(
		sourceLinks(extraction.discoverDocumentLinks(tree, "guide")).entries,
	).toHaveLength(1);
});

it.each(["text", "attribute", "detached"] as const)(
	"excludes stale source metadata after a %s mutation",
	(mutation) => {
		const tree = document();
		const info = textDocumentInfo(tree);
		if (!info) throw new Error("Expected literal registration");
		expect(
			sourceLinks(extraction.discoverDocumentLinks(tree, "guide")).entries,
		).toHaveLength(2);
		const pre = tree.get(info.textNode).parent;
		if (pre === null) throw new Error("Expected source pre");
		if (mutation === "text")
			tree.setTextContent(pre, "[Changed](guide-changed.md)");
		else if (mutation === "attribute")
			tree.setAttribute(pre, "data-changed", "yes");
		else tree.remove(pre);
		expect(tree.revision).not.toBe(info.revision);
		const result = extraction.discoverDocumentLinks(tree, "guide");
		expect(result.entries).toEqual([]);
		expect(result).not.toHaveProperty("sourceMarkdown");
	},
);

it.each([false, true])(
	"replays pinned Markdown source candidates from reader=%s captures",
	async (reader) => {
		const input = await capture(source, { reader });
		expect(input.report.outcome).toBe("extracted-unverified");
		const ownership = observeOwnership();
		const extract = vi.spyOn(extraction, "extractDocument");
		const discover = vi.spyOn(extraction, "discoverDocumentLinks");
		const result = replay(input);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "link-url-search", matches: 2 },
			classification: { barrier: null, diagnostic: null },
		});
		if (!result.report.links) throw new Error("Expected link discovery");
		expect(
			sourceLinks(result.report.links).entries.map((entry) => entry.label),
		).toEqual(["First *literal* café", "Second"]);
		expect(discover).toHaveBeenCalledWith(expect.any(DocumentTree), "guide", {
			maxBytes: 256_000,
			maxNodes: 50_000,
			maxDepth: 128,
			checkpoint: expect.any(Function),
		});
		expect(extract).not.toHaveBeenCalled();
		ownership.assert();
	},
);

it("counts only returned source candidates when replay hits its default entry limit", async () => {
	const input = await capture(
		Array.from({ length: 35 }, (_, index) => `[Guide](guide-${index})`).join(
			"\n",
		),
	);
	const ownership = observeOwnership();
	const result = replay(input);
	expect(result.report.selection.matches).toBe(32);
	expect(result.report.links).toMatchObject({
		entries: [],
		truncated: true,
		sourceMarkdown: { truncated: true },
	});
	expect(result.report.links?.sourceMarkdown?.entries).toHaveLength(32);
	expect(result.report.contentSuccess).toBeNull();
	ownership.assert();
});

it.each(["text/plain", "application/json"])(
	"denies --links replay of other literal MIME %s before loading",
	async (mime) => {
		const input = await capture(source, { mime });
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() => replay(input)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(load).not.toHaveBeenCalled();
	},
);

it.each([{ selector: "pre" }, { section: "h1" }] as const)(
	"does not turn Markdown source links into DOM selection %j",
	async (selection) => {
		const input = await capture();
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() => replay(input, selection)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(load).not.toHaveBeenCalled();
	},
);

it("does not use source links to recover a failed long-profile Markdown capture", async () => {
	const input = await capture(source, { profile: "long-v1" });
	expect(input.report.outcome).toBe("failure");
	const load = vi.spyOn(loader, "loadResearchDocument");
	expect(() => replay(input)).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	expect(load).not.toHaveBeenCalled();
});

it.each(["failure", "http-failure", "semantic-barrier"] as const)(
	"denies %s Markdown receipts without loading source links",
	async (outcome) => {
		const original = await capture(source, {
			status: outcome === "http-failure" ? 404 : 200,
		});
		const input =
			outcome === "http-failure"
				? original
				: revised(original, (report) => {
						report.outcome = outcome;
						report.contentSuccess = false;
						if (outcome === "failure")
							report.failure = { category: "unsupported", stage: "extraction" };
						else report.classification.barrier = "challenge";
					});
		expect(input.report.outcome).toBe(outcome);
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() => replay(input)).toThrow(
			expect.objectContaining({ code: "policy-denied" }),
		);
		expect(load).not.toHaveBeenCalled();
	},
);

it.each([
	{ links: "" },
	{ links: "guide", selector: "pre" },
	{ links: "guide", tableMetadata: true },
])(
	"rejects malformed source-link selection %j before admission",
	async (selection) => {
		const input = await capture();
		const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
		expect(() =>
			replay(input, selection as ResearchJsonReplaySelection),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(validate).not.toHaveBeenCalled();
	},
);

it.each(["receipt", "body"] as const)(
	"retains the %s pin gate for Markdown links",
	async (pin) => {
		const input = await capture();
		input.trusted = {
			...input.trusted,
			...(pin === "receipt"
				? { expectedReceiptSha256: "0".repeat(64) }
				: {
						expectedBody: {
							bytes: input.body.byteLength,
							sha256: "0".repeat(64),
						},
					}),
		};
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() => replay(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(load).not.toHaveBeenCalled();
	},
);

it("preserves raw and visibility declarations without claiming literal source is hidden-filtered", async () => {
	const input = await capture(
		`${source}<aside hidden>[Hidden literal](guide-hidden)</aside>\n`,
		{ policies: true },
	);
	expect(input.report).toMatchObject({
		readerRawPolicy: "separate-omitted-raw-v1",
		readerVisibilityPolicy: "source-hidden-inline-v1",
	});
	const ownership = observeOwnership();
	const result = replay(input);
	expect(ownership.load.mock.calls[0].slice(2)).toEqual([
		"default",
		"separate-omitted-raw-v1",
		"source-hidden-inline-v1",
	]);
	expect(result.report.reader).toMatchObject({
		rawTextPolicy: "separate-omitted-raw-v1",
		visibilityPolicy: "source-hidden-inline-v1",
		hiddenContentSemantics: false,
		sourceHiddenSubtrees: 0,
	});
	expect(result.report.links?.sourceMarkdown?.entries).toHaveLength(2);
	ownership.assert();
});

const syntheticBarrier = {
	kind: "challenge",
	provider: "unspecified",
	confidence: "possible",
	evidence: ["html-challenge-markers"],
	action: "stop-and-request-user-handoff",
} as const;

it("honors a classifier barrier on the bounded literal document before discovery", async () => {
	const input = await capture(`${source}${"x".repeat(10_000)}`);
	const ownership = observeOwnership();
	const classify = vi
		.spyOn(challenges, "classifyBrowserChallenge")
		.mockReturnValue(syntheticBarrier);
	const discover = vi.spyOn(extraction, "discoverDocumentLinks");
	const result = replay(input);
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		selection: { matches: null },
		classification: { barrier: "challenge" },
	});
	expect(result.report).not.toHaveProperty("links");
	expect(discover).not.toHaveBeenCalled();
	expect(classify).toHaveBeenCalledOnce();
	expect(classify.mock.calls[0][0].text?.length).toBeLessThanOrEqual(8193);
	expect(classify.mock.calls[0][0].text).toContain("# Source heading");
	ownership.assert();
});

it("classifies selected source labels beyond the bounded document prefix and honors the barrier", async () => {
	const label = "Checking your browser";
	const input = await capture(`${"x".repeat(9000)}\n[${label}](guide.md)\n`);
	const ownership = observeOwnership();
	const classify = vi
		.spyOn(challenges, "classifyBrowserChallenge")
		.mockImplementation((response) =>
			response.text === label ? syntheticBarrier : null,
		);
	const result = replay(input);
	expect(classify).toHaveBeenCalledTimes(2);
	expect(classify.mock.calls[0][0].text).not.toContain(label);
	expect(classify.mock.calls[0][0].text?.length).toBeLessThanOrEqual(8193);
	expect(classify.mock.calls[1][0]).toMatchObject({
		text: label,
		headers: { "content-type": ["text/markdown"] },
	});
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		selection: { matches: 1 },
		classification: { barrier: "challenge" },
	});
	ownership.assert();
});

it("closes the literal loader and wipes admitted bytes when discovery throws", async () => {
	const input = await capture();
	const ownership = observeOwnership();
	vi.spyOn(extraction, "discoverDocumentLinks").mockImplementationOnce(() => {
		throw new AgentBrowserError(
			"resource-limit",
			"Synthetic source-link limit",
		);
	});
	expect(() => replay(input)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	ownership.assert();
});

async function cli(input: Fixture, selection: string[], expectedCode = 0) {
	const before = structuredClone(input);
	const body = input.trusted.expectedBody;
	if (!body) throw new Error("Expected body pin");
	const chunks: Buffer[] = [];
	const stdin = Readable.from(
		[input.raw.subarray(0, 17), input.raw.subarray(17)],
		{ objectMode: false },
	);
	const stdout = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callback();
		},
	});
	for (const stream of [stdin, stdout]) {
		stream.on("error", () => undefined);
		streams.push(stream);
	}
	try {
		const code = await runResearchReplayCli(
			[
				"--expected-profile",
				input.trusted.expectedProfile,
				"--receipt-sha256",
				input.trusted.expectedReceiptSha256,
				"--body-sha256",
				body.sha256,
				"--body-bytes",
				String(body.bytes),
				...selection,
			],
			stdin,
			stdout,
		);
		const jsonl = Buffer.concat(chunks).toString("utf8");
		expect(code).toBe(expectedCode);
		expect(jsonl.endsWith("\n")).toBe(true);
		expect(jsonl.split("\n")).toHaveLength(2);
		expect(Buffer.byteLength(jsonl)).toBeLessThanOrEqual(
			researchJsonReplayLimits.maxOutputBytes,
		);
		return JSON.parse(jsonl) as ResearchJsonReplayReport;
	} finally {
		expect(input).toEqual(before);
	}
}

it("streams actual default-profile CLI --links JSONL with only pinned source-link metadata", async () => {
	const input = await capture(
		"[Documentation](https://docs.pytorch.org/docs)\n",
	);
	const ownership = observeOwnership();
	const report = await cli(input, ["--links", "docs.pytorch.org"]);
	expect(report).toMatchObject({
		kind: "native-research-json-replay-v1",
		partial: true,
		outcome: "extracted-unverified",
		contentSuccess: null,
		networkRequests: 0,
		selection: { method: "link-url-search", matches: 1 },
		source: {
			profile: "default",
			reportedFinalUrl: url,
			receiptSha256: input.trusted.expectedReceiptSha256,
			body: input.trusted.expectedBody,
		},
	});
	if (!report.links) throw new Error("Expected CLI link discovery");
	expect(sourceLinks(report.links).entries).toEqual([
		{
			url: "https://docs.pytorch.org/docs",
			label: "Documentation",
			labelTruncated: false,
			startLine: 1,
			column: 1,
		},
	]);
	for (const field of [
		"extraction",
		"headings",
		"bodyCapture",
		"rawReceipt",
		"originalMetadata",
	])
		expect(report).not.toHaveProperty(field);
	ownership.assert();
});

it("streams an honest empty CLI result for a label-only query", async () => {
	const input = await capture();
	const ownership = observeOwnership();
	const report = await cli(input, ["--links", "label"], 1);
	expect(report).toMatchObject({
		outcome: "empty-extraction",
		contentSuccess: false,
		networkRequests: 0,
		selection: { method: "link-url-search", matches: 0 },
		links: { entries: [], scannedNodes: 3, truncated: false },
	});
	expect(report.links?.sourceMarkdown?.entries ?? []).toEqual([]);
	expect(report).not.toHaveProperty("extraction");
	ownership.assert();
});
