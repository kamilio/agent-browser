import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import { researchNavigation } from "../scripts/research-browser.js";
import {
	type ResearchJsonReplaySelection,
	extractResearchReplayJson,
} from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { DocumentExtraction, ExtractedNode } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";
import { BrowserSession } from "./session.js";

const url = "https://alternates.fixture.invalid/document";
const alternateUrl = "https://alternates.fixture.invalid/guide.md";
const alternate =
	'<link rel="alternate" type="text/markdown" href="/guide.md">';
const sourceAlternates = {
	kind: "html-alternate-representations-v1",
	partial: true,
	truncated: false,
	entries: [{ type: "text/markdown", url: alternateUrl }],
};
const article = "<main><h1>Guide</h1><p>Visible documentation.</p></main>";
const articleMarkdown = "# Guide\n\nVisible documentation\\.\n";
const encoder = new TextEncoder();
const readerModes = [
	{ name: "reader default", policy: undefined },
	{ name: "source-hidden-v1", policy: "source-hidden-v1" },
	{ name: "source-hidden-inline-v1", policy: "source-hidden-inline-v1" },
] as const;
const hiddenVariants = [
	{ name: "hidden link", target: "link", attributes: "hidden", inline: false },
	{
		name: "aria-hidden link",
		target: "link",
		attributes: 'aria-hidden="true"',
		inline: false,
	},
	{
		name: "inline-hidden link",
		target: "link",
		attributes: 'style="display:none"',
		inline: true,
	},
	{ name: "hidden head", target: "head", attributes: "hidden", inline: false },
	{
		name: "aria-hidden head",
		target: "head",
		attributes: 'aria-hidden="true"',
		inline: false,
	},
	{
		name: "inline-hidden head",
		target: "head",
		attributes: 'style="display:none"',
		inline: true,
	},
] as const;

function html(body = article, head = alternate): string {
	return `<!doctype html><html><head><title>Guide</title>${head}</head><body>${body}</body></html>`;
}

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function nodeText(node: ExtractedNode): string {
	return [node.text ?? "", ...(node.children ?? []).map(nodeText)].join("");
}

function bodyText(result: DocumentExtraction | undefined): string {
	if (!result) throw new Error("Expected alternate fixture extraction");
	return result.format === "markdown"
		? result.content
		: nodeText(result.content);
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected alternate request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.spyOn(extraction, "extractDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Alternate fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(fetch).not.toHaveBeenCalled();
		for (const session of new Set(
			vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
		)) {
			if (!(session instanceof BrowserSession))
				throw new Error("Expected alternate fixture session");
			expect(session.metrics().closed).toBe(true);
		}
		for (const transport of new Set(
			vi.mocked(NodeNetworkTransport.prototype.request).mock.contexts,
		)) {
			if (!(transport instanceof NodeNetworkTransport))
				throw new Error("Expected alternate fixture transport");
			expect(transport.metrics()).toMatchObject({ active: 0, closed: true });
		}
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected alternate fixture document");
			expect(tree.mutationMetrics().closed).toBe(true);
		}
	} finally {
		try {
			for (const session of new Set(
				vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
			))
				if (session instanceof BrowserSession) session.close();
			for (const transport of new Set(
				vi.mocked(NodeNetworkTransport.prototype.request).mock.contexts,
			))
				if (transport instanceof NodeNetworkTransport) transport.close();
		} finally {
			vi.restoreAllMocks();
			vi.unstubAllGlobals();
		}
	}
});

async function fixture(
	source: string,
	policy: ResearchReaderVisibilityPolicy | undefined,
	options: {
		format?: "json" | "markdown";
		status?: number;
		contentType?: string;
	} = {},
) {
	const body = encoder.encode(source);
	const status = options.status ?? 200;
	const contentType = options.contentType ?? "text/html; charset=utf-8";
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status,
		headers: { "content-type": [contentType] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{
			format: options.format ?? "markdown",
			minRequestIntervalMs: 0,
			preferMarkdown: true,
			readerRawPolicy: "separate-omitted-raw-v1",
			...(policy === undefined ? {} : { readerVisibilityPolicy: policy }),
		},
	);
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	expect(request).toHaveBeenCalledOnce();
	const sent = request.mock.calls[0][0];
	expect(sent).toMatchObject({ url, cookieContext: { credentials: "omit" } });
	expect(sent.method ?? "GET").toBe("GET");
	expect(sent.body).toBeUndefined();
	const headers = Object.fromEntries(
		Object.entries(sent.headers ?? {}).map(([name, value]) => [
			name.toLowerCase(),
			value,
		]),
	);
	expect(headers.accept).toBe("text/markdown, text/html;q=0.9");
	for (const name of ["authorization", "proxy-authorization", "cookie"])
		expect(headers).not.toHaveProperty(name);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report).toMatchObject({
		partial: true,
		finalUrl: url,
		representationPreference: "markdown",
		readerRawPolicy: "separate-omitted-raw-v1",
		primaryResponse: {
			url,
			status,
			headers: { "content-type": [contentType] },
			decodedBytes: body.byteLength,
			encodedBytes: body.byteLength,
			bodySha256: hash(body),
			hashScope: "transport-decoded-body-before-loader",
			redirects: 0,
		},
	});
	expect(report.readerVisibilityPolicy).toBe(policy);
	expect(body).toEqual(encoder.encode(source));
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(body);
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const trusted = {
		expectedProfile: "default" as const,
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	};
	return { report, raw, trusted, body };
}

function replay(
	input: Awaited<ReturnType<typeof fixture>>,
	format: "json" | "markdown" = "markdown",
	selection: ResearchJsonReplaySelection = { selector: "main" },
) {
	const close = vi.mocked(DocumentTree.prototype.close);
	const closedBeforeReplay = close.mock.calls.length;
	const result = extractResearchReplayJson(
		input.raw,
		input.trusted,
		selection,
		undefined,
		format,
	);
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
		partial: true,
		networkRequests: 0,
		source: {
			receiptSha256: input.trusted.expectedReceiptSha256,
			body: input.trusted.expectedBody,
			reportedFinalUrl: url,
		},
	});
	expect(result.report.reader).toEqual(input.report.reader);
	expect(result.report.reader?.rawTextPolicy).toBe("separate-omitted-raw-v1");
	expect(result.report.reader?.visibilityPolicy).toBe(
		input.report.readerVisibilityPolicy,
	);
	expect(close.mock.calls.length).toBeGreaterThan(closedBeforeReplay);
	expect(hash(input.raw)).toBe(input.trusted.expectedReceiptSha256);
	expect(hash(input.body)).toBe(input.trusted.expectedBody.sha256);
	expect(decodeResearchBodyCapture(input.report.bodyCapture)).toEqual(
		input.body,
	);
	expect(JSON.parse(result.jsonl)).toEqual(result.report);
	expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	return result.report;
}

function expectEvidenceOnly(input: Awaited<ReturnType<typeof fixture>>) {
	expect(
		validateResearchReplayAdmission(input.raw, input.trusted),
	).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		body: null,
		bodyIdentity: null,
		originalMetadata: {
			outcome: input.report.outcome,
			contentSuccess: false,
			classification: input.report.classification,
			primaryResponse: input.report.primaryResponse,
		},
	});
	const callsBeforeReplay = vi.mocked(extraction.extractDocument).mock.calls
		.length;
	expect(() =>
		extractResearchReplayJson(input.raw, input.trusted, { selector: "main" }),
	).toThrowError(expect.objectContaining({ code: "policy-denied" }));
	expect(extraction.extractDocument).toHaveBeenCalledTimes(callsBeforeReplay);
	expect(hash(input.raw)).toBe(input.trusted.expectedReceiptSha256);
	expect(hash(input.body)).toBe(input.trusted.expectedBody.sha256);
}

describe.each(readerModes)("alternate workflow ($name)", ({ policy }) => {
	it.each(["json", "markdown"] as const)(
		"preserves head metadata through pinned %s replay without body injection",
		async (format) => {
			const input = await fixture(html(), policy, { format });
			expect(input.report).toMatchObject({
				outcome: "extracted-unverified",
				contentSuccess: null,
				classification: { barrier: null, diagnostic: null },
			});
			const result = replay(input, format);
			for (const extracted of [input.report.extraction, result.extraction]) {
				expect(extracted?.sourceAlternates).toEqual(sourceAlternates);
				expect(bodyText(extracted)).toBe(
					format === "markdown"
						? articleMarkdown
						: "GuideVisible documentation.",
				);
				expect(bodyText(extracted)).not.toContain("guide.md");
			}
		},
	);

	it.each(hiddenVariants)(
		"applies source visibility to $name without changing body Markdown",
		async ({ target, attributes, inline }) => {
			const source =
				target === "link"
					? html(article, alternate.replace("<link ", `<link ${attributes} `))
					: html().replace("<head>", `<head ${attributes}>`);
			const input = await fixture(source, policy);
			const result = replay(input);
			const omitted =
				policy !== undefined &&
				(!inline || policy === "source-hidden-inline-v1");
			for (const extracted of [input.report.extraction, result.extraction]) {
				if (omitted) expect(extracted).not.toHaveProperty("sourceAlternates");
				else expect(extracted?.sourceAlternates).toEqual(sourceAlternates);
				expect(bodyText(extracted)).toBe(articleMarkdown);
			}
			if (omitted)
				expect(input.report.reader?.sourceHiddenSubtrees).toBeGreaterThan(0);
		},
	);

	it("keeps a JavaScript notice unverified despite advertised Markdown", async () => {
		const input = await fixture(
			html(
				'<main><p>This documentation requires JavaScript.</p><a href="/guide.md">View Markdown</a></main>',
			),
			policy,
		);
		const result = replay(input);
		for (const report of [input.report, result]) {
			expect(report).toMatchObject({
				outcome: "extracted-unverified",
				contentSuccess: null,
				classification: { barrier: null, diagnostic: null },
			});
			expect(report.extraction?.sourceAlternates).toEqual(sourceAlternates);
			expect(bodyText(report.extraction)).toBe(
				`This documentation requires JavaScript\\.\n\n[View Markdown](<${alternateUrl}>)\n`,
			);
			expect(bodyText(report.extraction)).not.toContain(
				"Visible documentation.",
			);
		}
	});

	it("does not admit an alternate-only empty document for replay", async () => {
		const input = await fixture(html("<main></main>"), policy);
		expect(input.report).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
		});
		expect(input.report.extraction?.sourceAlternates).toEqual(sourceAlternates);
		expect(bodyText(input.report.extraction)).toBe("");
		expectEvidenceOnly(input);
	});

	it.each([200, 403])(
		"stops an HTTP %s challenge before extraction despite an alternate",
		async (status) => {
			const source = html(
				`<aside hidden><noscript>Enable JavaScript and cookies to continue</noscript></aside>${article}`,
			).replace("<title>Guide</title>", "<title>Just a moment...</title>");
			const input = await fixture(source, policy, { status });
			expect(input.report).toMatchObject({
				outcome: "semantic-barrier",
				contentSuccess: false,
				classification: {
					barrier: "challenge",
					diagnostic: { action: "stop-and-request-user-handoff" },
				},
				failure: { category: "policy-denied", stage: "semantic-barrier" },
			});
			expect(input.report.extraction).toBeUndefined();
			expect(extraction.extractDocument).not.toHaveBeenCalled();
			expectEvidenceOnly(input);
		},
	);

	it.each([403, 404])(
		"does not let alternate metadata authorize replay of HTTP %s",
		async (status) => {
			const input = await fixture(html(), policy, { status });
			expect(input.report).toMatchObject({
				outcome: "http-failure",
				contentSuccess: false,
				classification: { barrier: null, diagnostic: null },
			});
			expect(input.report.extraction?.sourceAlternates).toEqual(
				sourceAlternates,
			);
			expect(bodyText(input.report.extraction)).toBe(articleMarkdown);
			expectEvidenceOnly(input);
		},
	);

	it.each(["text/plain", "text/markdown"])(
		"keeps alternate markup literal in %s navigation and replay",
		async (contentType) => {
			const source = `# Literal &amp;\n<head>${alternate}</head>\n[View Markdown](/guide.md)\n`;
			const input = await fixture(source, policy, {
				format: "json",
				contentType,
			});
			const result = replay(input, "json", { lines: { start: 1, end: 3 } });
			for (const extracted of [input.report.extraction, result.extraction]) {
				expect(extracted).not.toHaveProperty("sourceAlternates");
				expect(bodyText(extracted)).toBe(source);
			}
		},
	);

	it("rejects credential-bearing advertised URLs without following them", async () => {
		const input = await fixture(
			html(
				article,
				`${alternate}<link rel="alternate" type="text/markdown" href="https://synthetic:discard@alternates.fixture.invalid/private.md">`,
			),
			policy,
		);
		const result = replay(input);
		for (const extracted of [input.report.extraction, result.extraction]) {
			expect(extracted?.sourceAlternates).toEqual(sourceAlternates);
			expect(bodyText(extracted)).toBe(articleMarkdown);
		}
	});
});
