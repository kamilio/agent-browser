import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	researchNavigation,
	summarizePrimaryResponse,
} from "../scripts/research-browser.js";
import { classifyBrowserChallenge } from "./browser-challenges.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	captureResearchResponseHeaders,
	researchResponseHeaderNames,
	researchResponseHeaderNamesV1,
} from "./research-response-headers.js";
import { BrowserSession } from "./session.js";

const url = "https://header-capture.fixture.invalid/article";
const source =
	'<!doctype html><html><head><title>Fixture catalogue</title></head><body><main><h1 id="catalogue">Catalogue</h1><p>Ordinary café evidence.</p><h2 id="details">Details</h2><p>More ordinary evidence.</p></main></body></html>';
const mimePolicy = "markdown-html-document-v1";
const privateHeaders = {
	cookie: ["SYNTHETIC_COOKIE_HEADER"],
	"set-cookie": ["SYNTHETIC_SET_COOKIE_HEADER"],
	authorization: ["SYNTHETIC_AUTHORIZATION_HEADER"],
	"proxy-authorization": ["SYNTHETIC_PROXY_AUTHORIZATION_HEADER"],
	location: ["SYNTHETIC_LOCATION_HEADER"],
	"x-unselected": ["SYNTHETIC_UNSELECTED_HEADER"],
};

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function response(
	headers: NetworkResponse["headers"] = {
		"content-type": ["text/html; charset=utf-8"],
	},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers,
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected header fixture request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Header fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
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

function assertPrivateHeadersAbsent(value: unknown) {
	const serialized = JSON.stringify(value);
	for (const [name, values] of Object.entries(privateHeaders)) {
		expect(serialized).not.toContain(`"${name}":`);
		for (const sentinel of values) expect(serialized).not.toContain(sentinel);
	}
}

function roundTrip(report: ResearchNavigationReport, body: Uint8Array) {
	const primaryBefore = structuredClone(report.primaryResponse);
	const captureBefore = structuredClone(report.bodyCapture);
	const emission = serializeResearchReport(report, "default");
	expect(emission.disposition).toBe("complete");
	const restored = JSON.parse(
		new TextDecoder().decode(emission.jsonl),
	) as ResearchNavigationReport;
	if (restored.primaryResponse === null)
		throw new Error("Expected captured primary response");
	expect(restored.primaryResponse).toEqual(primaryBefore);
	expect(restored.bodyCapture).toEqual(captureBefore);
	expect(restored.classification).toEqual(report.classification);
	const admission = validateResearchReplayAdmission(emission.jsonl, {
		expectedProfile: "default",
		expectedReceiptSha256: hash(emission.jsonl),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	});
	expect(admission.originalMetadata.primaryResponse).toEqual(primaryBefore);
	expect(admission.originalMetadata.classification).toEqual(
		report.classification,
	);
	expect(report.primaryResponse).toEqual(primaryBefore);
	expect(report.bodyCapture).toEqual(captureBefore);
	assertPrivateHeadersAbsent(report);
	assertPrivateHeadersAbsent(restored);
	assertPrivateHeadersAbsent(admission.originalMetadata);
	return { restored, admission, primary: restored.primaryResponse };
}

interface NavigationOptions {
	reader?: boolean;
	selector?: string;
	headings?: boolean;
	execution?: ResearchExecutionOptions;
}

async function navigate(
	input: NetworkResponse,
	options: NavigationOptions = {},
) {
	const originalBody = input.body;
	const originalHeaders = input.headers;
	const before = structuredClone(input);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await researchNavigation(
		url,
		options.reader ?? true,
		undefined,
		options.selector,
		true,
		undefined,
		undefined,
		options.headings ?? false,
		undefined,
		undefined,
		{ minRequestIntervalMs: 0, ...options.execution },
	);
	expect(
		NodeNetworkTransport.prototype.request,
	).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({
			url,
			cookieContext: expect.objectContaining({ credentials: "omit" }),
		}),
	);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({
		requests: 0,
		active: 0,
		closed: true,
	});
	for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
		if (!(tree instanceof DocumentTree)) throw new Error("Expected owned tree");
		expect(tree.mutationMetrics().closed).toBe(true);
	}
	expect(input).toEqual(before);
	expect(input.body).toBe(originalBody);
	expect(input.headers).toBe(originalHeaders);
	expect(report.primaryResponse).toMatchObject({
		...captureResearchResponseHeaders(before.headers),
		status: 200,
		decodedBytes: before.body.byteLength,
		bodySha256: hash(before.body),
		hashScope: "transport-decoded-body-before-loader",
	});
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(before.body);
	return report;
}

describe("primary response selected-header summaries", () => {
	it("retains exact independent immutable evidence without changing source identity", () => {
		const input = response({
			...privateHeaders,
			"content-type": [" text/html\t", " text/html\t", "text/markdown"],
			"content-length": ["001", "001", "002"],
			"content-encoding": [" identity ", "identity", "gzip"],
			"cf-mitigated": [" challenge\t", " challenge\t", "not-challenge"],
			"retry-after": [" 120\t", " 120\t", "240"],
			"content-security-policy": ["script-src 'self'", "object-src 'none'"],
			"content-security-policy-report-only": ["default-src 'none'"],
		});
		const before = structuredClone(input);
		const bodyReference = input.body;
		const headersReference = input.headers;
		const started = Date.now();
		const summary = summarizePrimaryResponse(input);
		const finished = Date.now();
		expect(summary).toMatchObject(
			captureResearchResponseHeaders(input.headers),
		);
		expect(summary.headerCapture).toEqual({
			kind: "selected-response-headers-v2",
			partial: true,
			omitted: [],
		});
		expect(Object.keys(summary.headers)).toEqual(researchResponseHeaderNames);
		expect(Object.isFrozen(summary.headers)).toBe(true);
		expect(Object.isFrozen(summary.headerCapture)).toBe(true);
		expect(Object.isFrozen(summary.headerCapture?.omitted)).toBe(true);
		for (const name of researchResponseHeaderNames) {
			expect(summary.headers[name]).toEqual(input.headers[name]);
			expect(summary.headers[name]).not.toBe(input.headers[name]);
			expect(Object.isFrozen(summary.headers[name])).toBe(true);
		}
		expect(input).toEqual(before);
		expect(input.body).toBe(bodyReference);
		expect(input.headers).toBe(headersReference);
		expect(summary.bodySha256).toBe(hash(before.body));
		expect(Date.parse(summary.receivedAt)).toBeGreaterThanOrEqual(started);
		expect(Date.parse(summary.receivedAt)).toBeLessThanOrEqual(finished);
		const summaryBefore = structuredClone(summary);
		const mutableValues = input.headers["cf-mitigated"] as string[];
		mutableValues[0] = "SYNTHETIC_LATER_HEADER";
		expect(summary).toEqual(summaryBefore);
		assertPrivateHeadersAbsent(summary);
	});

	it.each(researchResponseHeaderNames)(
		"retains all sixteen exact 160-unit Latin-1 values for %s",
		(name) => {
			const values = Array.from({ length: 16 }, (_, index) =>
				`${index}\t${"é".repeat(160)}`.slice(0, 160),
			);
			const summary = summarizePrimaryResponse(response({ [name]: values }));
			expect(summary.headers).toEqual({ [name]: values });
			expect(summary.headerCapture?.omitted).toEqual([]);
		},
	);

	it.each([
		{ name: "empty array", values: [] },
		{ name: "seventeenth value", values: Array(17).fill("challenge") },
		{
			name: "overlong third value",
			values: ["challenge", "challenge", "x".repeat(161)],
		},
		{
			name: "CRLF third value",
			values: ["challenge", "challenge", "bad\r\nvalue"],
		},
		{
			name: "NUL third value",
			values: ["challenge", "challenge", "bad\0value"],
		},
		{
			name: "DEL third value",
			values: ["challenge", "challenge", "bad\u007fvalue"],
		},
		{
			name: "non-Latin-1 third value",
			values: ["challenge", "challenge", "bad\u0100"],
		},
		{
			name: "non-string third value",
			values: ["challenge", "challenge", 7],
		},
		{ name: "non-array field", values: "challenge" },
	])(
		"omits a whole selected field with $name, never its conflicting tail",
		({ values }) => {
			for (const name of researchResponseHeaderNamesV1) {
				const input = response({
					[name]: values,
				} as unknown as NetworkResponse["headers"]);
				const before = structuredClone(input);
				const summary = summarizePrimaryResponse(input);
				expect(summary.headers).toEqual({});
				expect(summary.headerCapture).toEqual({
					kind: "selected-response-headers-v2",
					partial: true,
					omitted: [name],
				});
				expect(input).toEqual(before);
				expect(classifyBrowserChallenge(summary)).toBeNull();
			}
		},
	);

	it("distinguishes absent fields from canonical whole-field omissions", () => {
		const summary = summarizePrimaryResponse(
			response({
				"retry-after": [],
				"cf-mitigated": ["challenge", "challenge", "x".repeat(161)],
				"content-type": [],
			}),
		);
		expect(summary.headers).toEqual({});
		expect(summary.headerCapture?.omitted).toEqual([
			"content-type",
			"cf-mitigated",
			"retry-after",
		]);
		expect(summarizePrimaryResponse(response({})).headerCapture).toEqual({
			kind: "selected-response-headers-v2",
			partial: true,
			omitted: [],
		});
	});
});

describe("mocked native header-capture workflows", () => {
	it.each([false, true])(
		"preserves actual CSP policy evidence through capture and replay (reader=%s)",
		async (reader) => {
			const policies = {
				"content-security-policy": [
					"default-src 'self'; script-src 'nonce-synthetic' https://scripts.example.invalid",
					"object-src 'none'; report-uri /synthetic-report",
				],
				"content-security-policy-report-only": ["script-src 'none'"],
			};
			const input = response({
				...privateHeaders,
				...policies,
				"content-type": ["text/html; charset=utf-8"],
			});
			const report = await navigate(input, { reader });
			expect(report.primaryResponse?.headers).toMatchObject(policies);
			expect(report.primaryResponse?.headerCapture).toEqual({
				kind: "selected-response-headers-v2",
				partial: true,
				omitted: [],
			});
			roundTrip(report, input.body);
			assertPrivateHeadersAbsent(report);
		},
	);

	it.each([false, true])(
		"retains header-essential challenge evidence without retrying or replaying content (reader=%s)",
		async (reader) => {
			const input = response({
				...privateHeaders,
				"content-type": ["text/html; charset=utf-8"],
				"cf-mitigated": [" challenge\t", "challenge", "challenge"],
				"retry-after": [" 7200\t", "7200", "7200"],
			});
			const timers = vi.spyOn(globalThis, "setTimeout");
			const report = await navigate(input, { reader });
			expect(report.outcome).toBe("semantic-barrier");
			expect(report.classification).toMatchObject({
				barrier: "challenge",
				diagnostic: {
					provider: "cloudflare",
					confidence: "confirmed",
					evidence: ["cf-mitigated-challenge"],
					action: "stop-and-request-user-handoff",
					retryAfterSeconds: 7200,
				},
			});
			expect(report.extraction).toBeUndefined();
			expect(report.headings).toBeUndefined();
			expect(report.reader).toBeUndefined();
			expect(timers.mock.calls.some(([, delay]) => delay === 7_200_000)).toBe(
				false,
			);
			const { primary, admission } = roundTrip(report, input.body);
			expect(classifyBrowserChallenge(primary)).toEqual(
				report.classification.diagnostic,
			);
			expect(admission).toMatchObject({
				kind: "evidence-only",
				reason: "native-failure",
				body: null,
				bodyIdentity: null,
			});
		},
	);

	it("preserves a third challenge-header conflict rather than inventing a barrier", async () => {
		const input = response({
			"content-type": ["text/html"],
			"cf-mitigated": ["challenge", "challenge", "not-challenge"],
			"retry-after": ["120", "120", "240"],
		});
		const report = await navigate(input);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.classification.diagnostic).toBeNull();
		const { primary, admission } = roundTrip(report, input.body);
		expect(classifyBrowserChallenge(primary)).toBeNull();
		expect(admission.kind).toBe("validated-capture");
		expect(admission.body).toEqual(input.body);
	});

	it("retains conflicting Retry-After values without manufacturing retry advice", async () => {
		const input = response({
			"content-type": ["text/html"],
			"cf-mitigated": ["challenge"],
			"retry-after": ["120", "120", "240"],
		});
		const report = await navigate(input);
		expect(report.classification.diagnostic).not.toHaveProperty(
			"retryAfterSeconds",
		);
		const { primary, admission } = roundTrip(report, input.body);
		expect(classifyBrowserChallenge(primary)).toEqual(
			report.classification.diagnostic,
		);
		expect(admission.kind).toBe("evidence-only");
	});

	it("keeps omitted header evidence missing even when original bytes established a barrier", async () => {
		const input = response({
			"content-type": ["text/html"],
			"cf-mitigated": [`${" ".repeat(152)}challenge`],
			"retry-after": ["120"],
		});
		expect(classifyBrowserChallenge(input)?.evidence).toEqual([
			"cf-mitigated-challenge",
		]);
		const report = await navigate(input);
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.primaryResponse?.headerCapture?.omitted).toEqual([
			"cf-mitigated",
		]);
		expect(report.primaryResponse?.headers).not.toHaveProperty("cf-mitigated");
		const { primary, admission } = roundTrip(report, input.body);
		expect(classifyBrowserChallenge(primary)).toBeNull();
		expect(admission).toMatchObject({ kind: "evidence-only", body: null });
		expect(admission.originalMetadata.primaryResponse).toEqual(
			report.primaryResponse,
		);
	});

	it.each([
		{
			name: "native capture without selection",
			reader: false,
			markdown: false,
			headings: false,
		},
		{
			name: "normal HTML reader selection",
			reader: true,
			markdown: false,
			headings: false,
		},
		{
			name: "explicit Markdown-labelled HTML selection",
			reader: true,
			markdown: true,
			headings: false,
		},
		{
			name: "normal HTML heading outline",
			reader: true,
			markdown: false,
			headings: true,
		},
		{
			name: "explicit Markdown-labelled HTML heading outline",
			reader: true,
			markdown: true,
			headings: true,
		},
	])(
		"preserves $name semantics without inventing absent challenge evidence",
		async ({ reader, markdown, headings }) => {
			const contentType = markdown
				? "text/markdown; charset=utf-8"
				: "text/html; charset=utf-8";
			const input = response({
				...privateHeaders,
				"content-type": [contentType],
				"retry-after": [" 120\t", "120", "240"],
			});
			const report = await navigate(input, {
				reader,
				headings,
				selector: reader && !headings ? "main" : undefined,
				execution: markdown ? { readerMimePolicy: mimePolicy } : {},
			});
			expect(report.outcome).toBe("extracted-unverified");
			expect(report.contentSuccess).toBeNull();
			expect(report.classification.barrier).toBeNull();
			expect(report.classification.diagnostic).toBeNull();
			expect(report.primaryResponse?.headers).not.toHaveProperty(
				"cf-mitigated",
			);
			expect(report.primaryResponse?.headerCapture?.omitted).toEqual([]);
			if (headings) {
				expect(report.selection).toEqual({ method: "heading-outline" });
				expect(report.headings?.entries.map(({ title }) => title)).toEqual([
					"Catalogue",
					"Details",
				]);
				expect(report.extraction).toBeUndefined();
			} else {
				expect(report.extraction?.content).toContain(
					"Ordinary café evidence\\.",
				);
				if (reader)
					expect(report.selection).toEqual({
						method: "css-selector",
						matches: 1,
					});
				else expect(report.selection).toBeUndefined();
			}
			if (markdown) {
				expect(report.reader?.mimeInterpretation).toMatchObject({
					declaredMime: "text/markdown",
					effectiveMime: "text/html",
				});
				expect(report.readerMimePolicy).toBe(mimePolicy);
			} else {
				expect(report.reader?.mimeInterpretation).toBeUndefined();
				expect(report.readerMimePolicy).toBeUndefined();
			}
			const { restored, primary, admission } = roundTrip(report, input.body);
			expect(restored.reader).toEqual(report.reader);
			expect(primary.headers["content-type"]).toEqual([contentType]);
			expect(classifyBrowserChallenge(primary)).toBeNull();
			expect(admission.kind).toBe("validated-capture");
			expect(admission.body).toEqual(input.body);
		},
	);
});
