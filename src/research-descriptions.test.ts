import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import * as extraction from "./extraction.js";
import type { ExtractedNode } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as loader from "./research-loader.js";

const url = "https://descriptions.fixture.invalid/article";
const encoder = new TextEncoder();
const modes = [
	{ mode: "native", reader: false },
	{ mode: "reader", reader: true },
] as const;
const formats = ["json", "markdown"] as const;
const cases = modes.flatMap((mode) =>
	formats.map((format) => ({ ...mode, format })),
);
const head = [
	"<title>Document title</title>",
	'<meta NAME=" DESCRIPTION " content="SOURCE_ONLY &amp; &quot;quoted&quot; &lt;tag&gt; \u001b[31m" id="discard" class="discard" data-extra="discard">',
	'<meta property="OG:DESCRIPTION" content="OG_ONLY">',
	'<meta name="twitter:description" content="TWITTER_ONLY">',
	'<meta name="description" content="CONFLICT_ONLY">',
	'<meta name="description" content="CONFLICT_ONLY">',
	'<meta name="description" content=" &#9; ">',
	'<meta name="description">',
	'<meta name="keywords" content="IGNORED_KEYWORDS">',
	'<meta http-equiv="refresh" name="description" content="IGNORED_REFRESH">',
].join("");
const sourceDescriptions = {
	kind: "html-meta-descriptions-v1",
	partial: true,
	truncated: false,
	entries: [
		{
			attribute: "name",
			name: "description",
			text: 'SOURCE_ONLY & "quoted" <tag> \\u{1b}[31m',
			truncated: false,
		},
		{
			attribute: "property",
			name: "og:description",
			text: "OG_ONLY",
			truncated: false,
		},
		{
			attribute: "name",
			name: "twitter:description",
			text: "TWITTER_ONLY",
			truncated: false,
		},
		{
			attribute: "name",
			name: "description",
			text: "CONFLICT_ONLY",
			truncated: false,
		},
		{
			attribute: "name",
			name: "description",
			text: "CONFLICT_ONLY",
			truncated: false,
		},
	],
};
const article =
	'<main id="article"><h1>Article</h1><p>Useful prose.</p></main>';

function html(body = article): string {
	return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function nodeText(node: ExtractedNode): string {
	return [node.text ?? "", ...(node.children ?? []).map(nodeText)].join(" ");
}

function bodyText(report: ResearchNavigationReport): string {
	if (!report.extraction) throw new Error("Expected fixture extraction");
	return report.extraction.format === "markdown"
		? report.extraction.content
		: nodeText(report.extraction.content);
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error("Unexpected description fixture request"),
	);
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Description fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
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

async function navigate(
	source: string,
	reader: boolean,
	options: {
		format?: "json" | "markdown";
		selector?: string;
		captureBody?: boolean;
		status?: number;
		contentType?: string;
	} = {},
) {
	const body = encoder.encode(source);
	const response: NetworkResponse = {
		url,
		status: options.status ?? 200,
		headers: {
			"content-type": [options.contentType ?? "text/html; charset=utf-8"],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
	const report = await researchNavigation(
		url,
		reader,
		undefined,
		options.selector,
		options.captureBody ?? false,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{ format: options.format ?? "markdown", minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({
		requests: 0,
		active: 0,
		closed: true,
	});
	expect(body).toEqual(encoder.encode(source));
	return { report, body };
}

function capture(report: ResearchNavigationReport, body: Uint8Array) {
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(body);
	const serialized = serializeResearchReport(report);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const text = new TextDecoder().decode(raw);
	expect(text.endsWith("\n")).toBe(true);
	expect(text.split("\n")).toHaveLength(2);
	expect(JSON.parse(text).extraction).toEqual(report.extraction);
	const trusted: TrustedResearchReplayAdmission = {
		expectedProfile: "default",
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	};
	return { raw, trusted };
}

it.each(cases)(
	"retains canonical head descriptions without body injection ($mode, $format)",
	async ({ reader, format }) => {
		const { report } = await navigate(
			html(
				`${article}<meta name="description" content="IGNORED_BODY"><div><meta property="og:description" content="IGNORED_NESTED"></div>`,
			),
			reader,
			{ format },
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			classification: { barrier: null },
			extraction: { format, title: "Document title", partial: true },
		});
		expect(report.extraction?.sourceDescriptions).toEqual(sourceDescriptions);
		expect(bodyText(report)).toContain("Useful prose");
		for (const marker of [
			"SOURCE_ONLY",
			"OG_ONLY",
			"TWITTER_ONLY",
			"CONFLICT_ONLY",
			"IGNORED_",
		])
			expect(bodyText(report)).not.toContain(marker);
	},
);

it.each(modes)(
	"keeps body-only extraction successful ($mode)",
	async ({ reader }) => {
		const { report } = await navigate(article, reader);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.contentSuccess).toBeNull();
		expect(bodyText(report)).toContain("Useful prose");
		expect(report.extraction).not.toHaveProperty("sourceDescriptions");
	},
);

it.each(cases)(
	"keeps metadata-only pages empty rather than successful ($mode, $format)",
	async ({ reader, format }) => {
		const { report } = await navigate(
			html('<main id="article"></main>'),
			reader,
			{ format },
		);
		expect(report).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
			classification: { barrier: null },
			extraction: { format, title: "Document title" },
		});
		expect(report.extraction?.sourceDescriptions).toEqual(sourceDescriptions);
		expect(bodyText(report).trim()).toBe("");
	},
);

it.each(modes)(
	"does not parse descriptions from literal text ($mode)",
	async ({ reader }) => {
		const source = '<meta name="description" content="LITERAL_ONLY">';
		const { report } = await navigate(source, reader, {
			format: "json",
			contentType: "text/plain; charset=utf-8",
		});
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.contentSuccess).toBeNull();
		expect(report.extraction).not.toHaveProperty("sourceDescriptions");
		expect(bodyText(report)).toContain(source);
	},
);

it.each(modes)(
	"keeps descriptions document-wide under a body selector ($mode)",
	async ({ reader }) => {
		const { report } = await navigate(
			html(`<nav>Outside selection</nav>${article}`),
			reader,
			{ selector: "#article" },
		);
		expect(report.selection).toEqual({ method: "css-selector", matches: 1 });
		expect(report.extraction?.title).toBe("Document title");
		expect(report.extraction?.sourceDescriptions).toEqual(sourceDescriptions);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.contentSuccess).toBeNull();
		expect(bodyText(report)).toContain("Useful prose");
		expect(bodyText(report)).not.toContain("Outside selection");
		expect(bodyText(report)).not.toContain("SOURCE_ONLY");
	},
);

it.each(modes)(
	"stops at a document challenge before scoped extraction ($mode)",
	async ({ reader }) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const source = html(`<p>Checking your browser</p>${article}`).replace(
			"Document title",
			"Just a moment...",
		);
		const { report } = await navigate(source, reader, { selector: "#article" });
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
	},
);

it.each(modes)(
	"preserves HTTP failure and primary-response provenance ($mode)",
	async ({ reader }) => {
		const { report, body } = await navigate(html(), reader, {
			status: 404,
			captureBody: true,
		});
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			classification: { barrier: null },
			primaryResponse: {
				url,
				status: 404,
				decodedBytes: body.byteLength,
				bodySha256: hash(body),
				hashScope: "transport-decoded-body-before-loader",
			},
		});
		expect(report.extraction?.sourceDescriptions).toEqual(sourceDescriptions);
		expect(bodyText(report)).toContain("Useful prose");
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(body);
	},
);

it.each(modes)(
	"does not admit metadata-only captured receipts for replay ($mode)",
	async ({ reader }) => {
		const { report, body } = await navigate(
			html('<main id="article"></main>'),
			reader,
			{ captureBody: true },
		);
		expect(report.outcome).toBe("empty-extraction");
		expect(report.contentSuccess).toBe(false);
		expect(report.extraction?.sourceDescriptions).toEqual(sourceDescriptions);
		const { raw, trusted } = capture(report, body);
		const before = raw.slice();
		expect(validateResearchReplayAdmission(raw, trusted)).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
		});
		const load = vi.spyOn(loader, "loadResearchDocument");
		const close = vi.mocked(DocumentTree.prototype.close);
		const closedBeforeReplay = close.mock.calls.length;
		expect(() =>
			extractResearchReplayJson(raw, trusted, { selector: "#article" }),
		).toThrowError(expect.objectContaining({ code: "policy-denied" }));
		expect(load).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledTimes(closedBeforeReplay);
		expect(raw).toEqual(before);
	},
);

it.each(cases)(
	"retains descriptions in serialized capture and pinned replay ($mode, $format)",
	async ({ reader, format }) => {
		const { report, body } = await navigate(
			html(`<nav>Outside selection</nav>${article}`),
			reader,
			{ format, captureBody: true },
		);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.contentSuccess).toBeNull();
		expect(report.extraction?.sourceDescriptions).toEqual(sourceDescriptions);
		const { raw, trusted } = capture(report, body);
		const before = raw.slice();
		const close = vi.mocked(DocumentTree.prototype.close);
		const closedBeforeReplay = close.mock.calls.length;
		const result = extractResearchReplayJson(
			raw,
			trusted,
			{ selector: "#article" },
			undefined,
			format,
		);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			networkRequests: 0,
			selection: { matches: 1 },
			source: {
				receiptSha256: trusted.expectedReceiptSha256,
				body: trusted.expectedBody,
			},
			extraction: { format, title: "Document title", partial: true },
		});
		expect(result.report.extraction?.sourceDescriptions).toEqual(
			sourceDescriptions,
		);
		const replayed = result.report.extraction;
		if (!replayed) throw new Error("Expected replay extraction");
		const text =
			replayed.format === "markdown"
				? replayed.content
				: nodeText(replayed.content);
		expect(text).toContain("Useful prose");
		expect(text).not.toContain("Outside selection");
		expect(text).not.toContain("SOURCE_ONLY");
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.jsonl.endsWith("\n")).toBe(true);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(close).toHaveBeenCalledTimes(closedBeforeReplay + 1);
		expect(raw).toEqual(before);
		expect(body).toEqual(decodeResearchBodyCapture(report.bodyCapture));
	},
);
