import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchNavigation } from "../scripts/research-browser.js";
import {
	type BrowserChallengeDiagnostic,
	type BrowserChallengeResponse,
	classifyBrowserChallenge,
} from "./browser-challenges.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";

const title = "Checking your browser - reCAPTCHA";
const text = "Checking your browser before continuing.";
const response: BrowserChallengeResponse = {
	status: 200,
	headers: { "content-type": ["text/html; charset=utf-8"] },
	title,
	text,
};
const expected: BrowserChallengeDiagnostic = {
	kind: "challenge",
	provider: "unspecified",
	confidence: "possible",
	evidence: ["html-challenge-markers"],
	action: "stop-and-request-user-handoff",
};

describe("bounded reCAPTCHA browser-check title diagnostics", () => {
	it.each([200, 201, 403, 429, 503])(
		"recognizes paired HTML markers for HTTP %s without inferring a provider",
		(status) => {
			expect(classifyBrowserChallenge({ ...response, status })).toEqual(
				expected,
			);
		},
	);

	it("normalizes title, text and HTML header case and whitespace", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				headers: { "Content-Type": " TEXT/HTML ; charset=UTF-8 " },
				title: " \nCHECKING\tyour  BROWSER\r\n-\tRECAPTCHA ",
				text: "Please VERIFY\nthat you are\ta HUMAN before continuing.",
			}),
		).toEqual(expected);
	});

	it.each([
		[title, ""],
		[title, "reCAPTCHA"],
		[title, "Checking your browserware."],
		[title, "An article about browser verification."],
		["", text],
		["Browser verification documentation", text],
		["Checking your browser", text],
		[`${title} documentation`, text],
		[`About ${title}`, text],
		[`${title}!`, text],
		["Checking your browser – reCAPTCHA", text],
	])(
		"requires the exact title and a paired text marker: %j / %j",
		(title, text) => {
			expect(classifyBrowserChallenge({ ...response, title, text })).toBeNull();
		},
	);

	it.each([100, 199, 204, 205, 301, 302, 304, 399])(
		"excludes non-content HTTP %s despite paired markers",
		(status) => {
			expect(classifyBrowserChallenge({ ...response, status })).toBeNull();
		},
	);

	it.each<BrowserChallengeResponse["headers"]>([
		{},
		{ "content-type": "text/plain" },
		{ "content-type": "application/json" },
		{ "content-type": "application/xhtml+xml" },
		{ "content-type": ["text/html", "application/json"] },
	])("requires unambiguous HTML content type: %j", (headers) => {
		expect(classifyBrowserChallenge({ ...response, headers })).toBeNull();
	});

	it("accepts an exact-limit title but rejects truncated or out-of-budget titles", () => {
		expect(
			classifyBrowserChallenge({ ...response, title: title.padEnd(256, " ") }),
		).toEqual(expected);
		for (const boundedTitle of [
			title.padEnd(257, " "),
			`${title.padEnd(256, " ")} documentation`,
			`${" ".repeat(256)}${title}`,
		]) {
			expect(
				classifyBrowserChallenge({ ...response, title: boundedTitle }),
			).toBeNull();
		}
	});

	it("retains complete text markers at the cutoff without manufacturing word boundaries", () => {
		const marker = "Checking your browser";
		const atCutoff = `${" ".repeat(8192 - marker.length)}${marker}`;
		for (const suffix of ["", ". More text."]) {
			expect(
				classifyBrowserChallenge({ ...response, text: atCutoff + suffix }),
			).toEqual(expected);
		}
		for (const boundedText of [
			`${atCutoff}ware`,
			` ${atCutoff}`,
			`${" ".repeat(8192)}${marker}`,
		]) {
			expect(
				classifyBrowserChallenge({ ...response, text: boundedText }),
			).toBeNull();
		}
		expect(
			classifyBrowserChallenge({
				...response,
				text: `${`${marker}. `.padEnd(8192 - marker.length, " ")}${marker}ware`,
			}),
		).toEqual(expected);
	});

	it.each([
		{ status: 200, contentType: "text/html" },
		{ status: 204, contentType: "application/json" },
	])(
		"preserves confirmed cf-mitigated priority for HTTP $status",
		({ status, contentType }) => {
			expect(
				classifyBrowserChallenge({
					...response,
					status,
					headers: {
						"content-type": contentType,
						"cf-mitigated": ["challenge"],
						"retry-after": "17",
					},
				}),
			).toEqual({
				...expected,
				provider: "cloudflare",
				confidence: "confirmed",
				evidence: ["cf-mitigated-challenge"],
				retryAfterSeconds: 17,
			});
		},
	);

	it("does not mutate the response or nested header values", () => {
		const input = Object.freeze({
			...response,
			headers: Object.freeze({
				"content-type": Object.freeze(["text/html; charset=utf-8"]),
			}),
		});
		const original = structuredClone(input);
		expect(classifyBrowserChallenge(input)).toEqual(expected);
		expect(input).toEqual(original);
	});
});

describe("synthetic native reCAPTCHA research navigation", () => {
	const url = "https://browser-check.fixture.invalid/article";

	beforeEach(() => {
		vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
			new AgentBrowserError("policy-denied", "Unexpected fixture request"),
		);
		vi.spyOn(NodeNetworkTransport.prototype, "close");
		vi.spyOn(BrowserSession.prototype, "createTab");
		vi.spyOn(BrowserSession.prototype, "close");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => {
				throw new Error("Browser-check fixtures must not fetch");
			}),
		);
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
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			vi.restoreAllMocks();
			vi.unstubAllGlobals();
		}
	});

	async function navigate(source: string) {
		const body = new TextEncoder().encode(source);
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
			false,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			{ minRequestIntervalMs: 0 },
		);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
		expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
		expect(report).toMatchObject({
			profile: "native",
			partial: true,
			metrics: { active: 0, closed: true },
		});
		expect(body).toEqual(new TextEncoder().encode(source));
		return report;
	}

	it("stops before extraction and does not follow the offered continuation", async () => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			`<title>${title}</title><p>Checking <strong>your browser</strong> before continuing.</p><a href="/continue">Continue</a>`,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: {
				classifier: "browser-challenges",
				barrier: "challenge",
				diagnostic: expected,
			},
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
	});

	it("keeps ordinary browser-verification documentation as unverified content", async () => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			`<title>Browser verification documentation</title><h1>Browser verification</h1><p>The interstitial title is ${title}.</p><p>Checking your browser can appear during verification.</p>`,
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			classification: {
				classifier: "browser-challenges",
				barrier: null,
				diagnostic: null,
			},
		});
		expect(report.failure).toBeUndefined();
		expect(extract).toHaveBeenCalledOnce();
		expect(report.extraction?.content).toContain("Browser verification");
	});
});
