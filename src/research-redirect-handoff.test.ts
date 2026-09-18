import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import {
	parseResearchArguments,
	researchBatch,
	researchExitCode,
	researchNavigation,
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
} from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { networkPolicyError } from "./network-policy-diagnostic.js";
import { NodeNetworkTransport } from "./node-transport.js";

const url = "https://redirect-handoff.fixture.invalid/start";
let expectedRequests = 0;

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected native fixture request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected fixture fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function response(
	status = 308,
	headers: NetworkResponse["headers"] = { location: ["/introduction"] },
): NetworkResponse {
	const body = new TextEncoder().encode(
		"<title>Owned response</title><main><p>Retained response body.</p></main>",
	);
	return {
		url,
		status,
		headers: { "content-type": ["text/html; charset=utf-8"], ...headers },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function navigate(options: ResearchExecutionOptions = {}) {
	return researchNavigation(
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
		{ ...options, minRequestIntervalMs: 0 },
	);
}

async function manual(received = response()) {
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		received,
	);
	expectedRequests++;
	return navigate({ redirectMode: "manual" });
}

function admitted(report: ResearchNavigationReport) {
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const primary = report.primaryResponse;
	if (!primary) throw new Error("Expected a captured primary response");
	return {
		serialized,
		admission: validateResearchReplayAdmission(serialized.jsonl, {
			expectedProfile: "default",
			expectedReceiptSha256: createHash("sha256")
				.update(serialized.jsonl)
				.digest("hex"),
			expectedBody: {
				bytes: primary.decodedBytes,
				sha256: primary.bodySha256,
			},
		}),
	};
}

describe("manual redirect CLI selection", () => {
	it("requires explicit manual selection and preserves the default", () => {
		expect(parseResearchArguments([url])).not.toHaveProperty("redirectMode");
		expect(
			parseResearchArguments(["--reader", "--redirect-mode", "manual", url]),
		).toMatchObject({ reader: true, redirectMode: "manual", urls: [url] });
	});

	it.each([
		{ flags: ["--redirect-mode"] },
		{ flags: ["--redirect-mode", "follow"] },
		{ flags: ["--redirect-mode", "error"] },
		{ flags: ["--redirect-mode", "manual", "--redirect-mode", "manual"] },
		{
			flags: [
				"--redirect-mode",
				"manual",
				"--https-redirect-policy",
				"same-origin-upgrade-v1",
			],
		},
	])("rejects invalid or conflicting flags $flags before IO", ({ flags }) => {
		expect(() => parseResearchArguments([...flags, url])).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	});

	it("rejects conflicting host execution policies before requesting", async () => {
		await expect(
			navigate({
				redirectMode: "manual",
				httpsRedirectPolicy: "same-origin-upgrade-v1",
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
	});
});

describe("native manual redirect handoff", () => {
	it.each([301, 302, 303, 307, 308])(
		"retains HTTP %s and a review-only location without following it",
		async (status) => {
			const report = await manual(response(status));
			expect(report).toMatchObject({
				redirectMode: "manual",
				outcome: "http-failure",
				contentSuccess: false,
				primaryResponse: { status, redirects: 0 },
				redirect: {
					kind: "http-redirect-handoff-v1",
					status,
					action: "review-before-new-request",
					followed: false,
					reason: "available",
					location: {
						url: "https://redirect-handoff.fixture.invalid/introduction",
						sameOrigin: true,
						queryRedacted: false,
						fragmentOmitted: false,
					},
				},
				metrics: { active: 0, closed: true },
			});
			expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
				expect.objectContaining({ url, redirect: "manual" }),
			);
			expect(report.finalUrl).toBe(url);
			expect(report).not.toHaveProperty("failure");
			expect(report.extraction?.format).toBe("markdown");
			expect(report.extraction?.content).toContain("Retained response body\\.");
			expect(report.primaryResponse?.headers).not.toHaveProperty("location");
			expect(researchExitCode([report])).toBe(1);
			expect(admitted(report).admission.kind).toBe("evidence-only");
		},
	);

	it("redacts cross-origin query and fragment without promoting them to an actionable URL", async () => {
		const report = await manual(
			response(302, {
				location: [
					"https://destination.fixture.invalid/page?token=owned-secret#private-section",
				],
			}),
		);
		expect(report.redirect?.location).toEqual({
			url: "https://destination.fixture.invalid/page?redacted",
			sameOrigin: false,
			queryRedacted: true,
			fragmentOmitted: true,
		});
		const text = Buffer.from(admitted(report).serialized.jsonl).toString(
			"utf8",
		);
		expect(text).not.toContain("owned-secret");
		expect(text).not.toContain("private-section");
	});

	it.each<{ headers: NetworkResponse["headers"]; reason: string }>([
		{ headers: {}, reason: "missing-location" },
		{ headers: { location: ["/one", "/two"] }, reason: "ambiguous-location" },
		{
			headers: { location: ["javascript:owned-secret"] },
			reason: "unsupported-protocol",
		},
		{
			headers: {
				location: ["https://alice:owned-secret@destination.fixture.invalid/"],
			},
			reason: "credentials",
		},
		{ headers: { location: ["http://127.0.0.1/"] }, reason: "disallowed-url" },
	])(
		"reports unavailable locations as $reason",
		async ({ headers, reason }) => {
			const report = await manual(response(307, headers));
			expect(report.redirect).toMatchObject({
				location: null,
				reason,
				followed: false,
			});
			expect(
				Buffer.from(admitted(report).serialized.jsonl).toString("utf8"),
			).not.toContain("owned-secret");
		},
	);

	it("retains normal 200 extraction under manual mode without a redirect claim", async () => {
		const report = await manual(response(200));
		expect(report.outcome).toBe("extracted-unverified");
		expect(report).not.toHaveProperty("redirect");
		const result = admitted(report).admission;
		expect(result.kind).toBe("validated-capture");
		if (result.kind === "validated-capture") result.body.fill(0);
	});

	it("preserves default redirect refusal without fabricating a Location", async () => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			networkPolicyError("redirect-mode-error"),
		);
		expectedRequests++;
		const report = await navigate();
		expect(report).toMatchObject({
			outcome: "failure",
			finalUrl: null,
			primaryResponse: null,
			failure: { category: "policy-denied", stage: "network" },
		});
		expect(report).not.toHaveProperty("redirect");
		expect(report).not.toHaveProperty("redirectMode");
	});

	it("keeps challenge classification ahead of the redirect hint", async () => {
		const report = await manual(
			response(302, {
				location: ["/challenge"],
				"cf-mitigated": ["challenge"],
			}),
		);
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.classification.barrier).not.toBeNull();
		expect(report).not.toHaveProperty("redirect");
		expect(admitted(report).admission.kind).toBe("evidence-only");
	});

	it("propagates manual mode through a batch and only visits explicitly listed URLs", async () => {
		const next = "https://redirect-handoff.fixture.invalid/listed";
		vi.mocked(NodeNetworkTransport.prototype.request)
			.mockResolvedValueOnce(response())
			.mockResolvedValueOnce({ ...response(200), url: next });
		expectedRequests = 2;
		const reports: ResearchNavigationReport[] = [];
		for await (const report of researchBatch([
			"--reader",
			"--redirect-mode",
			"manual",
			url,
			next,
		]))
			reports.push(report);
		expect(reports.map((report) => report.outcome)).toEqual([
			"http-failure",
			"extracted-unverified",
		]);
		expect(
			vi
				.mocked(NodeNetworkTransport.prototype.request)
				.mock.calls.map(([request]) => request.url),
		).toEqual([url, next]);
		expect(reports[0].redirect?.followed).toBe(false);
	});

	it("rejects contradictory or malformed redirect evidence during serialization", async () => {
		const report = await manual();
		for (const change of [
			{ redirectMode: "follow" },
			{ redirectMode: undefined },
			{ redirect: null },
			{ redirect: { ...report.redirect, followed: true } },
			{ primaryResponse: { ...report.primaryResponse, status: 200 } },
		])
			expect(() =>
				serializeResearchReport(
					{ ...report, ...change } as ResearchNavigationReport,
					"default",
				),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	});

	it("validates redirect metadata on legacy header records without invoking accessors", async () => {
		const report = await manual();
		if (!report.primaryResponse) throw new Error("Expected primary response");
		const { headerCapture, ...primaryResponse } = report.primaryResponse;
		expect(headerCapture).toBeDefined();
		const legacy = {
			...report,
			primaryResponse,
		};
		const getter = vi.fn(() => {
			throw new Error("Redirect metadata getter must not run");
		});
		Object.defineProperty(legacy, "redirect", {
			enumerable: true,
			get: getter,
		});
		expect(() =>
			serializeResearchReport(legacy as ResearchNavigationReport, "default"),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(getter).not.toHaveBeenCalled();
	});
});
