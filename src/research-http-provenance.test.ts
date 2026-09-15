import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import {
	decodeResearchBodyCapture,
	researchBodyCaptureLimit,
} from "../scripts/research-body-capture.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import * as browserLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as readerLoader from "./research-loader.js";
import { researchReaderProfile } from "./research-reader-info.js";
import { BrowserSession } from "./session.js";

const url = "https://http-provenance.fixture.invalid/paper";
const markup = "<main>Owned diagnostic content.</main>";

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function response(
	source: string,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	};
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(browserLoader, "loadBrowserDocument");
	vi.spyOn(readerLoader, "loadResearchDocument");
	vi.spyOn(extraction, "extractDocument");
});

afterEach(() => {
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
	}
});

function expectClosed(report: ResearchNavigationReport) {
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	expect(request).toHaveBeenCalledOnce();
	const sent = request.mock.calls[0][0];
	expect(sent).toMatchObject({
		url,
		cookieContext: { credentials: "omit" },
	});
	expect(sent.method ?? "GET").toBe("GET");
	expect(sent.body).toBeUndefined();
	for (const name of Object.keys(sent.headers ?? {}))
		expect(["authorization", "proxy-authorization", "cookie"]).not.toContain(
			name.toLowerCase(),
		);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.partial).toBe(true);
}

function expectNoLoading() {
	expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(extraction.extractDocument).not.toHaveBeenCalled();
}

function expectEvidenceOnly(
	report: ResearchNavigationReport,
	body?: Uint8Array,
) {
	const emission = serializeResearchReport(report, "default");
	expect(emission.disposition).toBe("complete");
	const admission = validateResearchReplayAdmission(emission.jsonl, {
		expectedProfile: "default",
		expectedReceiptSha256: hash(emission.jsonl),
		...(body === undefined
			? {}
			: { expectedBody: { bytes: body.byteLength, sha256: hash(body) } }),
	});
	expect(admission).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		body: null,
		bodyIdentity: null,
		originalMetadata: {
			outcome: report.outcome,
			contentSuccess: false,
			primaryResponse: report.primaryResponse,
		},
	});
	expect(admission.originalMetadata.failure).toEqual(report.failure);
	if (report.bodyCapture) {
		expect(admission.originalMetadata.bodyCapture).toEqual({
			encoding: "base64",
			decodedBytes: report.bodyCapture.decodedBytes,
			sha256: report.bodyCapture.sha256,
		});
	} else expect(admission.originalMetadata).not.toHaveProperty("bodyCapture");
}

async function navigate(
	input: NetworkResponse,
	reader: boolean,
	options: { selector?: string; captureBody?: boolean } = {},
) {
	const original = input.body.slice();
	const captureBody = options.captureBody ?? true;
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await researchNavigation(
		url,
		reader,
		undefined,
		options.selector,
		captureBody,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		{ format: "markdown", minRequestIntervalMs: 0 },
	);
	expectClosed(report);
	expect(input.body).toEqual(original);
	expect(report.profile).toBe(reader ? researchReaderProfile : "native");
	expect(report.finalUrl).toBe(url);
	expect(report.primaryResponse).toMatchObject({
		url,
		status: input.status,
		decodedBytes: original.byteLength,
		encodedBytes: input.encodedBytes,
		bodySha256: hash(original),
		hashScope: "transport-decoded-body-before-loader",
		redirects: 0,
	});
	if (captureBody && report.failure?.stage !== "body-capture") {
		expect(report.bodyCapture).toEqual({
			encoding: "base64",
			decodedBytes: original.byteLength,
			sha256: hash(original),
			data: Buffer.from(original).toString("base64"),
		});
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(original);
	} else expect(report).not.toHaveProperty("bodyCapture");
	return report;
}

describe.each([false, true])("HTTP provenance (reader=%s)", (reader) => {
	it.each([false, true])(
		"retains the CNN-shaped empty 403 without MIME (capture=%s)",
		async (captureBody) => {
			const input = response("", {
				status: 403,
				headers: { "content-length": ["0"] },
			});
			const report = await navigate(input, reader, { captureBody });
			expect(report).toMatchObject({
				outcome: "http-failure",
				contentSuccess: false,
				failure: { category: "unsupported", stage: "loader" },
				classification: { barrier: null, diagnostic: null },
				primaryResponse: {
					status: 403,
					decodedBytes: 0,
					encodedBytes: 0,
					bodySha256:
						"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
				},
			});
			expect(report.primaryResponse?.headers).toEqual({
				"content-length": ["0"],
			});
			expect(report.extraction).toBeUndefined();
			expectEvidenceOnly(report, input.body);
		},
	);

	it.each([
		{
			name: "unsupported MIME",
			status: 401,
			source: "Owned binary diagnostic",
			headers: { "content-type": ["application/octet-stream"] },
			selector: undefined,
			category: "unsupported",
			stage: "loader",
			matches: undefined,
		},
		{
			name: "missing selector",
			status: 404,
			source: markup,
			headers: { "content-type": ["text/html"] },
			selector: "#missing",
			category: "not-found",
			stage: "selection",
			matches: 0,
		},
		{
			name: "ambiguous selector",
			status: 500,
			source: "<main>First diagnostic</main><main>Second diagnostic</main>",
			headers: { "content-type": ["text/html"] },
			selector: "main",
			category: "invalid-input",
			stage: "selection",
			matches: 2,
		},
		{
			name: "bounded extraction",
			status: 503,
			source: `<main>${"é".repeat(128_001)}</main>`,
			headers: { "content-type": ["text/html"] },
			selector: "main",
			category: "resource-limit",
			stage: "extraction",
			matches: 1,
		},
	])("retains $status after $name failure", async (fixture) => {
		const input = response(fixture.source, {
			status: fixture.status,
			headers: fixture.headers,
		});
		const report = await navigate(input, reader, {
			selector: fixture.selector,
		});
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			failure: { category: fixture.category, stage: fixture.stage },
			classification: { barrier: null, diagnostic: null },
		});
		expect(report.primaryResponse?.headers).toEqual(fixture.headers);
		expect(report.extraction).toBeUndefined();
		if (fixture.matches !== undefined)
			expect(report.selection).toEqual({
				method: "css-selector",
				matches: fixture.matches,
			});
		if (fixture.stage === "extraction") {
			expect(report.bodyCapture?.decodedBytes).toBeGreaterThan(
				researchRunLimits.extractionBytes,
			);
			expect(report.failure?.resourceLimit).toMatchObject({
				kind: "extraction.output",
				unit: "bytes",
				limit: researchRunLimits.extractionBytes,
			});
		} else expect(extraction.extractDocument).not.toHaveBeenCalled();
		expectEvidenceOnly(report, input.body);
	});

	it("retains HTTP provenance when body capture exceeds its bound", async () => {
		const input = response("x".repeat(researchBodyCaptureLimit + 1), {
			status: 503,
		});
		const report = await navigate(input, reader);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "body-capture" },
		});
		expect(report).not.toHaveProperty("bodyCapture");
		expect(report.extraction).toBeUndefined();
		expectNoLoading();
		expectEvidenceOnly(report);
	});

	it("retains HTTP provenance when the loader reports cancellation", async () => {
		const loader = reader
			? vi.mocked(readerLoader.loadResearchDocument)
			: vi.mocked(browserLoader.loadBrowserDocument);
		loader.mockImplementationOnce(() => {
			throw new AgentBrowserError("aborted", "Synthetic loader cancellation");
		});
		const input = response(markup, { status: 500 });
		const report = await navigate(input, reader);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			failure: { category: "aborted", stage: "loader" },
		});
		expect(report.extraction).toBeUndefined();
		expectEvidenceOnly(report, input.body);
	});

	it.each([200, 299])(
		"keeps %s loader failures as ordinary failures",
		async (status) => {
			const input = response("", {
				status,
				headers:
					status === 200
						? { "content-length": ["0"] }
						: { "content-type": ["application/octet-stream"] },
			});
			const report = await navigate(input, reader);
			expect(report).toMatchObject({
				outcome: "failure",
				contentSuccess: false,
				failure: { category: "unsupported", stage: "loader" },
			});
			expect(report.extraction).toBeUndefined();
			expectEvidenceOnly(report, input.body);
		},
	);

	it.each([200, 299, 403, 503])(
		"keeps parseable %s content distinct from execution failure",
		async (status) => {
			const input = response(markup, { status });
			const report = await navigate(input, reader, { selector: "main" });
			const successfulStatus = status >= 200 && status < 300;
			expect(report).toMatchObject({
				outcome: successfulStatus ? "extracted-unverified" : "http-failure",
				contentSuccess: successfulStatus ? null : false,
				classification: { barrier: null, diagnostic: null },
				selection: { method: "css-selector", matches: 1 },
				extraction: { format: "markdown", partial: true },
			});
			expect(report.failure).toBeUndefined();
			expect(report.extraction?.content).toBe("Owned diagnostic content\\.\n");
			if (!successfulStatus) expectEvidenceOnly(report, input.body);
		},
	);

	it.each(["header", "document"] as const)(
		"gives the %s semantic barrier priority over HTTP failure",
		async (barrier) => {
			const input =
				barrier === "header"
					? response("", {
							status: 403,
							headers: {
								"content-length": ["0"],
								"cf-mitigated": ["challenge"],
							},
						})
					: response(
							"<title>Just a moment...</title><main>Checking your browser</main>",
							{ status: 503 },
						);
			const report = await navigate(input, reader, { selector: "#missing" });
			expect(report).toMatchObject({
				outcome: "semantic-barrier",
				contentSuccess: false,
				classification: {
					barrier: "challenge",
					diagnostic: { action: "stop-and-request-user-handoff" },
				},
				failure: { category: "policy-denied", stage: "semantic-barrier" },
				selection: { method: "css-selector", matches: null },
			});
			expect(report.extraction).toBeUndefined();
			expect(extraction.extractDocument).not.toHaveBeenCalled();
			if (barrier === "header") expectNoLoading();
			expectEvidenceOnly(report, input.body);
		},
	);

	it.each([false, true])(
		"stops 429 without retry or loading (header challenge=%s)",
		async (challenge) => {
			const input = response("", {
				status: 429,
				headers: {
					"content-length": ["0"],
					"retry-after": ["120"],
					...(challenge ? { "cf-mitigated": ["challenge"] } : {}),
				},
			});
			const report = await navigate(input, reader);
			expect(report).toMatchObject({
				outcome: challenge ? "semantic-barrier" : "http-failure",
				contentSuccess: false,
				failure: {
					category: "policy-denied",
					stage: challenge ? "semantic-barrier" : "rate-limit",
				},
				rateLimit: {
					kind: "http-rate-limit",
					status: 429,
					url,
					action: "stop-without-retry",
					retryAfter: { kind: "delay-seconds", delaySeconds: 120 },
				},
			});
			expect(report.extraction).toBeUndefined();
			expectNoLoading();
			expectEvidenceOnly(report, input.body);
		},
	);

	it.each(["timeout", "policy-denied", "network-error"] as const)(
		"does not invent HTTP provenance for a pre-response %s",
		async (category) => {
			vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
				new AgentBrowserError(category, "Synthetic pre-response failure"),
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
				undefined,
				{ minRequestIntervalMs: 0 },
			);
			expectClosed(report);
			expect(report).toMatchObject({
				outcome: "failure",
				contentSuccess: false,
				primaryResponse: null,
				finalUrl: null,
				failure: { category, stage: "network" },
			});
			expect(report).not.toHaveProperty("bodyCapture");
			expect(report).not.toHaveProperty("rateLimit");
			expect(report.extraction).toBeUndefined();
			expectNoLoading();
			expectEvidenceOnly(report);
		},
	);
});
