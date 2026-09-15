import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	researchNavigation,
} from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";

const url = "https://connection-challenge.fixture.invalid/document";
const source =
	"<title>Verifying Connection</title><h1>Verifying your connection...</h1><p>Please wait while we verify your browser.</p><p>Verification failed. Please try again.</p><main><h2>Section</h2><p>Placeholder content</p></main>";
const encoder = new TextEncoder();

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function navigate(
	html: string,
	status: number,
	reader: boolean,
	execution: ResearchExecutionOptions,
	selector?: string,
) {
	const body = encoder.encode(html);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		reader,
		undefined,
		selector,
		true,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		execution,
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
		expect.objectContaining({
			url,
			cookieContext: expect.objectContaining({ credentials: "omit" }),
		}),
	);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(html));
	expect(report.bodyCapture?.sha256).toBe(
		createHash("sha256").update(body).digest("hex"),
	);
	return { report, body };
}

it.each(
	[200, 403, 503].flatMap((status) =>
		[false, true].flatMap((reader) =>
			(["markdown", "json"] as const).map((format) => ({
				status,
				reader,
				format,
			})),
		),
	),
)("hands off HTTP $status reader=$reader format=$format", async (options) => {
	const { report, body } = await navigate(
		source,
		options.status,
		options.reader,
		{ format: options.format },
	);
	expect(report.outcome).toBe("semantic-barrier");
	expect(report.contentSuccess).toBe(false);
	expect(report.extraction).toBeUndefined();
	expect(report.classification.diagnostic).toMatchObject({
		kind: "challenge",
		provider: "unspecified",
		confidence: "possible",
		evidence: ["html-challenge-markers"],
		action: "stop-and-request-user-handoff",
	});
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const admission = validateResearchReplayAdmission(serialized.jsonl, {
		expectedProfile: "default",
		expectedReceiptSha256: createHash("sha256")
			.update(serialized.jsonl)
			.digest("hex"),
		expectedBody: {
			bytes: body.length,
			sha256: createHash("sha256").update(body).digest("hex"),
		},
	});
	expect(admission).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		body: null,
	});
});

it.each([false, true])(
	"does not let a selector hide the challenge (reader=%s)",
	async (reader) => {
		const { report } = await navigate(
			source,
			200,
			reader,
			{ format: "markdown" },
			"main",
		);
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.extraction).toBeUndefined();
	},
);

it.each([false, true])(
	"does not let main focus hide the challenge (reader=%s)",
	async (reader) => {
		const { report } = await navigate(source, 200, reader, {
			format: "markdown",
			contentFocus: "main-content-v1",
		});
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.extraction).toBeUndefined();
	},
);

it.each([false, true])(
	"retains the early rate-limit stop (reader=%s)",
	async (reader) => {
		const { report } = await navigate(source, 429, reader, {
			format: "markdown",
		});
		expect(report.outcome).toBe("http-failure");
		expect(report.rateLimit).toMatchObject({
			status: 429,
			action: "stop-without-retry",
		});
		expect(report.extraction).toBeUndefined();
	},
);

it.each(
	[false, true].flatMap((reader) =>
		[
			"<title>Connection verification documentation</title><p>Please wait while we verify your browser.</p><main>Article content</main>",
			"<title>Verifying Connection</title><script>Please wait while we verify your browser.</script><main>Article content</main>",
		].map((html) => ({ reader, html })),
	),
)(
	"retains article and script-only controls (reader=$reader)",
	async (options) => {
		const { report } = await navigate(options.html, 200, options.reader, {
			format: "markdown",
		});
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.classification.diagnostic).toBeNull();
		expect(report.extraction?.content).toContain("Article content");
	},
);
