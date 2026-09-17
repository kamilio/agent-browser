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
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { DocumentExtraction, ExtractedNode } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	type ResearchReaderReport,
	researchReaderInfo,
} from "./research-reader-info.js";
import { BrowserSession } from "./session.js";

const encoder = new TextEncoder();
const url = "https://svg-alternatives.fixture.invalid/article";
const destination = "https://svg-alternatives.fixture.invalid/download";
const label = "Download & <guide> 😀";
const annotation = `SVG source aria-label: ${label}`;
const alternatives = {
	elements: 1,
	codeUnits: label.length,
	attribute: "aria-label",
	rendered: false,
	verified: false,
};
const source = [
	"<!doctype html><html><head><title>Owned SVG fixture</title>",
	'<link rel="stylesheet" href="/unused.css">',
	'<script src="/unused.js"></script></head><body><main id="owned">',
	'<p>Owned source evidence.</p><a href="/download">',
	'<svg aria-label="Download &amp; &lt;guide&gt; 😀">',
	"<title>Not an inferred name</title><text>Inert descendant</text>",
	'<image href="/unused.png"/><use href="/unused.svg#icon"/>',
	'<svg aria-label="Nested label"><text>Nested text</text></svg>',
	"</svg></a></main></body></html>",
].join("");
let expectedRequests = 0;

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("SVG replay tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		expect(fetch).not.toHaveBeenCalled();
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected owned tree");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(tree)).toBeUndefined();
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function pins(raw: Uint8Array, body: Uint8Array) {
	return {
		expectedProfile: "default",
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	} satisfies TrustedResearchReplayAdmission;
}

async function capture(
	input = source,
	format: "markdown" | "json" = "markdown",
) {
	const body = encoder.encode(input);
	expectedRequests++;
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		true,
		undefined,
		"#owned",
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{ minRequestIntervalMs: 0, format },
	);
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
	expect(BrowserSession.prototype.close).toHaveBeenCalled();
	expect(DocumentTree.prototype.close).toHaveBeenCalled();
	expect(decodeResearchBodyCapture(report.bodyCapture, "default")).toEqual(
		body,
	);
	expect(body).toEqual(encoder.encode(input));
	const serialized = serializeResearchReport(report);
	expect(serialized.disposition).toBe("complete");
	return {
		report,
		body,
		raw: serialized.jsonl,
		trusted: pins(serialized.jsonl, body),
	};
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function expectAlternative(report: {
	reader?: Readonly<ResearchReaderReport>;
	extraction?: DocumentExtraction;
}) {
	expect(report.reader?.svgAlternatives).toEqual(alternatives);
	expect(report.extraction?.reader?.svgAlternatives).toEqual(alternatives);
	expect(Object.isFrozen(report.reader?.svgAlternatives)).toBe(true);
	expect(Object.isFrozen(report.extraction?.reader?.svgAlternatives)).toBe(
		true,
	);
	expect(report).not.toHaveProperty("sourceLinkLabelPolicy");
	expect(report.extraction).not.toHaveProperty("sourceLinkLabels");
	const extraction = report.extraction;
	if (!extraction) throw new Error("Expected extraction");
	if (extraction.format === "markdown") {
		expect(extraction.content).toContain(
			`[\` ${annotation} \`](<${destination}>)`,
		);
	} else {
		const nodes = flattened(extraction.content);
		const link = nodes.find(
			(node) => node.type === "link" && node.url === destination,
		);
		expect(link).toBeDefined();
		if (!link) throw new Error("Expected owning HTTPS link");
		const codes = flattened(link).filter((node) => node.type === "code");
		expect(codes).toHaveLength(1);
		expect(codes[0].children).toEqual([
			expect.objectContaining({ type: "text", text: annotation }),
		]);
	}
	expect(JSON.stringify(extraction.content)).not.toMatch(
		/Not an inferred name|Inert descendant|Nested label|Nested text|unused\./,
	);
}

it.each(["markdown", "json"] as const)(
	"retains explicit SVG source annotations and owning links in captured and pinned replay %s",
	async (format) => {
		const fixture = await capture(source, format);
		expectAlternative(fixture.report);
		const original = structuredClone(fixture);
		const admitted = validateResearchReplayAdmission(
			fixture.raw,
			fixture.trusted,
		);
		expect(admitted.kind).toBe("validated-capture");
		expect(admitted.body).toEqual(fixture.body);
		expect(admitted.originalMetadata.reader).toMatchObject({
			svgAlternatives: alternatives,
		});
		const closeCalls = vi.mocked(DocumentTree.prototype.close).mock.calls
			.length;
		const replay = extractResearchReplayJson(
			fixture.raw,
			fixture.trusted,
			{ selector: "#owned" },
			undefined,
			format,
		);
		expectAlternative(replay.report);
		expect(replay.report).toMatchObject({
			outcome: "extracted-unverified",
			networkRequests: 0,
			source: {
				profile: "default",
				reportedFinalUrl: url,
				receiptSha256: fixture.trusted.expectedReceiptSha256,
				body: fixture.trusted.expectedBody,
			},
			selection: { method: "css-selector", matches: 1 },
		});
		expect(replay.report.selection).not.toHaveProperty("sourceLinkLabelPolicy");
		expect(replay.report.reader).not.toBe(admitted.originalMetadata.reader);
		for (const serialized of [
			new TextDecoder().decode(fixture.raw),
			replay.jsonl,
		]) {
			expect(JSON.parse(serialized)).toMatchObject({
				reader: { svgAlternatives: alternatives },
				extraction: { format, reader: { svgAlternatives: alternatives } },
			});
		}
		expect(DocumentTree.prototype.close).toHaveBeenCalledTimes(closeCalls + 1);
		expect(fixture).toEqual(original);
	},
);

it("omits ordinary SVG descendants and labels inside already omitted subtrees", async () => {
	const input = [
		'<main id="owned"><p>Ordinary evidence.</p>',
		'<svg title="Title attribute" aria-labelledby="title">',
		'<title id="title">Title descendant</title><text>Ordinary SVG text</text>',
		'<svg aria-label="Nested SVG label"/></svg>',
		'<svg aria-label=" &#32;&#9; "><text>Blank label text</text></svg>',
		'<math><svg aria-label="Foreign label"/></math>',
		'<script><svg aria-label="Raw label"></svg></script></main>',
	].join("");
	const fixture = await capture(input);
	expect(fixture.report.reader).not.toHaveProperty("svgAlternatives");
	expect(fixture.report.extraction?.reader).not.toHaveProperty(
		"svgAlternatives",
	);
	expect(fixture.report.extraction?.content).toBe("Ordinary evidence\\.\n");
	for (const format of ["markdown", "json"] as const) {
		const replay = extractResearchReplayJson(
			fixture.raw,
			fixture.trusted,
			{ selector: "#owned" },
			undefined,
			format,
		);
		expect(replay.report.networkRequests).toBe(0);
		expect(replay.report.reader).not.toHaveProperty("svgAlternatives");
		expect(replay.report.extraction?.reader).not.toHaveProperty(
			"svgAlternatives",
		);
		const extraction = replay.report.extraction;
		if (!extraction) throw new Error("Expected extraction");
		const text =
			extraction.format === "markdown"
				? extraction.content.trim()
				: flattened(extraction.content)
						.map((node) => node.text ?? "")
						.join("");
		expect(text).toBe(
			format === "markdown" ? "Ordinary evidence\\." : "Ordinary evidence.",
		);
	}
});

it("recomputes current SVG metadata without rewriting optional original receipt metadata", async () => {
	const fixture = await capture();
	const ownedReport = structuredClone(fixture.report);
	if (!ownedReport.reader || !ownedReport.extraction?.reader)
		throw new Error("Expected captured reader metadata");
	const { svgAlternatives: readerAlternatives, ...originalReader } =
		ownedReport.reader;
	const {
		svgAlternatives: extractionAlternatives,
		...originalExtractionReader
	} = ownedReport.extraction.reader;
	expect(readerAlternatives).toEqual(alternatives);
	expect(extractionAlternatives).toEqual(alternatives);
	ownedReport.reader = originalReader;
	ownedReport.extraction.reader = originalExtractionReader;
	const serialized = serializeResearchReport(ownedReport);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const trusted = pins(raw, fixture.body);
	const original = { raw: raw.slice(), trusted: structuredClone(trusted) };
	const admitted = validateResearchReplayAdmission(raw, trusted);
	expect(admitted.kind).toBe("validated-capture");
	expect(admitted.originalMetadata.reader).not.toHaveProperty(
		"svgAlternatives",
	);
	const metadata = structuredClone(admitted.originalMetadata);
	const replay = extractResearchReplayJson(
		raw,
		trusted,
		{ selector: "#owned" },
		undefined,
		"markdown",
	);
	expectAlternative(replay.report);
	expect(replay.report.networkRequests).toBe(0);
	expect(replay.report.source).toMatchObject({
		receiptSha256: trusted.expectedReceiptSha256,
		body: fixture.trusted.expectedBody,
	});
	expect(replay.report.source).not.toHaveProperty("reader");
	expect(admitted.originalMetadata).toEqual(metadata);
	expect(admitted.originalMetadata.reader).not.toHaveProperty(
		"svgAlternatives",
	);
	expect({ raw, trusted }).toEqual(original);
	expect(fixture.report.reader?.svgAlternatives).toEqual(alternatives);
});
