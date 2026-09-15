import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import { researchNavigation } from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import * as visibility from "../scripts/research-visibility.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	type ResearchReaderVisibilityPolicy,
	researchReaderProfile,
} from "./research-reader-info.js";
import { BrowserSession } from "./session.js";

const url = "https://noscript-challenge.fixture.invalid/document";
const encoder = new TextEncoder();
const policies = ["source-hidden-v1", "source-hidden-inline-v1"] as const;
const readerModes = [
	{ name: "reader default", policy: undefined },
	...policies.map((policy) => ({ name: policy, policy })),
];
const challengeVariants = [
	{
		name: "visible title and noscript",
		html: "<title>Just a moment...</title><noscript>Enable JavaScript and cookies to continue</noscript>",
	},
	{
		name: "hidden title",
		html: "<title hidden>Just a moment...</title><noscript>Enable JavaScript and cookies to continue</noscript>",
	},
	{
		name: "noscript inside a hidden ancestor",
		html: "<title>Just a moment...</title><aside hidden><noscript>Enable JavaScript and cookies to continue</noscript></aside>",
	},
	{
		name: "hidden title and aria-hidden noscript",
		html: '<title hidden>Just a moment...</title><noscript aria-hidden="true">Enable JavaScript and cookies to continue</noscript>',
	},
];
const controls = [
	{
		name: "ordinary application with a JavaScript notice",
		html: "<title>Research application</title><noscript>Enable JavaScript and cookies to continue</noscript>",
	},
	{
		name: "ordinary article quoting the challenge phrase",
		html: "<title>Understanding browser notices</title><article><p>The notice says <q>Enable JavaScript and cookies to continue</q> beneath <q>Just a moment...</q>.</p></article>",
	},
];
const visibleMain =
	"<main><h1>Public services</h1><p>Visible main content</p></main>";

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(extraction, "extractDocument");
	vi.spyOn(visibility, "researchVisibilityEvidence");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected synthetic fetch");
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

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
	html: string,
	status: number,
	policy?: ResearchReaderVisibilityPolicy,
) {
	const body = encoder.encode(html);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status,
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
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		{
			format: "markdown",
			minRequestIntervalMs: 0,
			...(policy === undefined ? {} : { readerVisibilityPolicy: policy }),
		},
	);
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	expect(request).toHaveBeenCalledOnce();
	const sent = request.mock.calls[0][0];
	expect(sent).toMatchObject({ url, cookieContext: { credentials: "omit" } });
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
	expect(report.profile).toBe(researchReaderProfile);
	expect(report.readerVisibilityPolicy).toBe(policy);
	expect(report.finalUrl).toBe(url);
	expect(body).toEqual(encoder.encode(html));
	expect(report.primaryResponse).toMatchObject({
		url,
		status,
		decodedBytes: body.byteLength,
		encodedBytes: body.byteLength,
		bodySha256: hash(body),
		hashScope: "transport-decoded-body-before-loader",
		redirects: 0,
	});
	expect(report.primaryResponse?.headers).toEqual({
		"content-type": ["text/html; charset=utf-8"],
	});
	expect(report.bodyCapture).toEqual({
		encoding: "base64",
		decodedBytes: body.byteLength,
		sha256: hash(body),
		data: Buffer.from(body).toString("base64"),
	});
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(body);
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const trusted = {
		expectedProfile: "default" as const,
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	};
	return { report, raw, trusted };
}

function expectEvidenceOnly(input: Awaited<ReturnType<typeof fixture>>) {
	const admission = validateResearchReplayAdmission(input.raw, input.trusted);
	expect(admission).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		body: null,
		bodyIdentity: null,
		originalMetadata: {
			outcome: input.report.outcome,
			contentSuccess: false,
			classification: input.report.classification,
			primaryResponse: input.report.primaryResponse,
			bodyCapture: {
				encoding: "base64",
				decodedBytes: input.trusted.expectedBody.bytes,
				sha256: input.trusted.expectedBody.sha256,
			},
		},
	});
	expect(admission.originalMetadata.failure).toEqual(input.report.failure);
	expect(admission.originalMetadata.bodyCapture).not.toHaveProperty("data");
	expect(() =>
		extractResearchReplayJson(input.raw, input.trusted, { selector: "main" }),
	).toThrowError(expect.objectContaining({ code: "policy-denied" }));
}

describe.each(readerModes)("noscript workflow ($name)", ({ policy }) => {
	describe.each([200, 403])("HTTP %s", (status) => {
		it.each(challengeVariants)(
			"stops a headerless challenge with $name",
			async ({ html }) => {
				const input = await fixture(`${html}${visibleMain}`, status, policy);
				expect(input.report).toMatchObject({
					outcome: "semantic-barrier",
					contentSuccess: false,
					classification: {
						barrier: "challenge",
						diagnostic: {
							kind: "challenge",
							provider: "unspecified",
							confidence: "possible",
							evidence: ["html-challenge-markers"],
							action: "stop-and-request-user-handoff",
						},
					},
					failure: { category: "policy-denied", stage: "semantic-barrier" },
				});
				expect(input.report.extraction).toBeUndefined();
				if (policy === undefined) {
					expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
				} else {
					expect(visibility.researchVisibilityEvidence).toHaveBeenCalledOnce();
					expect(input.report.reader).toBeUndefined();
				}
				expectEvidenceOnly(input);
				expect(extraction.extractDocument).not.toHaveBeenCalled();
			},
		);

		it.each(controls)(
			"does not classify $name as a challenge",
			async ({ html }) => {
				const input = await fixture(`${html}${visibleMain}`, status, policy);
				expect(input.report).toMatchObject({
					outcome: status === 200 ? "extracted-unverified" : "http-failure",
					contentSuccess: status === 200 ? null : false,
					classification: { barrier: null, diagnostic: null },
				});
				expect(input.report.failure).toBeUndefined();
				expect(input.report.extraction?.content).toContain(
					"Visible main content",
				);
				if (status === 403) expectEvidenceOnly(input);
			},
		);
	});
});

it.each(policies)(
	"omits the hidden GOV-style cookie banner under %s without losing main content",
	async (policy) => {
		const html = `<title>Public services</title><div hidden><h2>Cookies on public services</h2><p>You have accepted optional cookies</p><p>You have rejected optional cookies</p><button>Accept optional cookies</button><button>Reject optional cookies</button><button>Hide this message</button></div>${visibleMain}`;
		const input = await fixture(html, 200, policy);
		expect(input.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			classification: { barrier: null, diagnostic: null },
			reader: { visibilityPolicy: policy, sourceHiddenSubtrees: 1 },
		});
		expect(input.report.failure).toBeUndefined();
		const replay = extractResearchReplayJson(input.raw, input.trusted, {
			selector: "main",
		});
		expect(replay.report.reader?.visibilityPolicy).toBe(policy);
		for (const content of [input.report.extraction?.content, replay.jsonl]) {
			expect(content).toContain("Public services");
			expect(content).toContain("Visible main content");
			for (const hidden of [
				"Cookies on public services",
				"You have accepted optional cookies",
				"You have rejected optional cookies",
				"Accept optional cookies",
				"Reject optional cookies",
				"Hide this message",
			])
				expect(content).not.toContain(hidden);
		}
	},
);
