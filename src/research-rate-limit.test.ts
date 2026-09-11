import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { researchBodyCaptureLimit } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as browserLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import * as htmlParser from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import * as readerLoader from "./research-loader.js";
import { researchReaderProfile } from "./research-reader-info.js";
import { BrowserSession } from "./session.js";

const origin = "https://rate-limit.fixture.invalid";
const url = `${origin}/paper?token=PRIVATE_QUERY`;
const redactedUrl = `${origin}/paper?redacted`;
const nextUrl = `${origin}/next`;
const receivedAt = "2026-09-11T12:00:00.000Z";
const retryAt = "2026-09-11T12:02:00.000Z";
const markup =
	'<title>Owned fixture</title><link rel="stylesheet" href="/first.css"><link rel="stylesheet" href="/later.css"><main><h1>Owned content</h1><p>No retry.</p></main>';
const pending: Promise<unknown>[] = [];
const batches: AsyncGenerator<ResearchNavigationReport>[] = [];
const loadBrowserDocument = browserLoader.loadBrowserDocument;
let controller: AbortController;

interface Mode {
	name: string;
	reader: boolean;
	documentProfile?: ResearchDocumentProfileId;
	readerRawPolicy?: ResearchExecutionOptions["readerRawPolicy"];
}

const modes: Mode[] = [
	{ name: "native", reader: false },
	{ name: "reader", reader: true },
	{
		name: "reader with raw policy",
		reader: true,
		readerRawPolicy: "separate-omitted-raw-v1",
	},
	{ name: "long reader", reader: true, documentProfile: "long-v1" },
	{
		name: "long reader with raw policy",
		reader: true,
		documentProfile: "long-v1",
		readerRawPolicy: "separate-omitted-raw-v1",
	},
];

function response(
	source: string | Uint8Array = markup,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body =
		typeof source === "string" ? new TextEncoder().encode(source) : source;
	return {
		url,
		status: 429,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	};
}

function track<Result>(promise: Promise<Result>): Promise<Result> {
	void promise.catch(() => undefined);
	pending.push(promise);
	return promise;
}

function navigate(mode: Mode = modes[0], captureBody = false) {
	return track(
		researchNavigation(
			url,
			mode.reader,
			controller.signal,
			undefined,
			captureBody,
			undefined,
			undefined,
			mode.documentProfile === "long-v1",
			undefined,
			mode.documentProfile,
			{ readerRawPolicy: mode.readerRawPolicy, minRequestIntervalMs: 100 },
		),
	);
}

function batch(args: string[] = []) {
	const iterator = researchBatch([...args, url, nextUrl], controller.signal);
	batches.push(iterator);
	return iterator;
}

function expectRateLimit(
	report: ResearchNavigationReport,
	limitedUrl = redactedUrl,
) {
	expect(report.rateLimit).toMatchObject({
		kind: "http-rate-limit",
		status: 429,
		url: limitedUrl,
		receivedAt,
		action: "stop-without-retry",
	});
	expect(report.contentSuccess).toBe(false);
	expect(report.partial).toBe(true);
	expect(report.extraction).toBeUndefined();
	expect(report.headings).toBeUndefined();
	expect(report.textLines).toBeUndefined();
	for (const name of [
		"extractDocument",
		"discoverDocumentHeadings",
		"discoverDocumentTextLines",
	] as const)
		expect(extraction[name]).not.toHaveBeenCalled();
}

function expectPlainStop(report: ResearchNavigationReport) {
	expect(report).toMatchObject({
		outcome: "http-failure",
		contentSuccess: false,
		classification: { barrier: null, diagnostic: null },
		failure: { category: "policy-denied", stage: "rate-limit" },
	});
}

function expectNoLoading() {
	expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(htmlParser.parseHtmlDocument).not.toHaveBeenCalled();
	expect(htmlParser.parseHtmlDocumentAsync).not.toHaveBeenCalled();
}

function expectClosed(report: ResearchNavigationReport, requests = 1) {
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
		requests,
	);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.finishedAt).toBe(receivedAt);
	expect(report.elapsedMs).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
}

beforeEach(() => {
	vi.useFakeTimers({
		now: new Date(receivedAt),
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	controller = new AbortController();
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(OriginRequestPacer.prototype, "close");
	vi.spyOn(browserLoader, "loadBrowserDocument");
	vi.spyOn(readerLoader, "loadResearchDocument");
	vi.spyOn(htmlParser, "parseHtmlDocument");
	vi.spyOn(htmlParser, "parseHtmlDocumentAsync");
	vi.spyOn(extraction, "extractDocument");
	vi.spyOn(extraction, "discoverDocumentHeadings");
	vi.spyOn(extraction, "discoverDocumentTextLines");
});

afterEach(async () => {
	try {
		controller.abort(
			new AgentBrowserError("aborted", "Synthetic test cleanup"),
		);
		for (const iterator of batches.splice(0)) track(iterator.return(undefined));
		await vi.runAllTimersAsync();
		await Promise.allSettled(pending.splice(0));
	} finally {
		for (const session of new Set(
			vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
		))
			if (session instanceof BrowserSession) session.close();
		for (const transport of new Set(
			vi.mocked(NodeNetworkTransport.prototype.request).mock.contexts,
		))
			if (transport instanceof NodeNetworkTransport) transport.close();
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
});

it.each(
	modes.flatMap((mode) =>
		(mode.documentProfile === "long-v1" ? [true] : [false, true]).map(
			(captureBody) => ({ ...mode, captureBody }),
		),
	),
)(
	"stops primary 429 before loading in $name (capture=$captureBody)",
	async (mode) => {
		const input = response();
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			input,
		);
		const report = await navigate(mode, mode.captureBody);
		expectRateLimit(report);
		expectPlainStop(report);
		expectNoLoading();
		expect(report.profile).toBe(mode.reader ? researchReaderProfile : "native");
		expect(report.readerRawPolicy).toBe(mode.readerRawPolicy);
		expect(report.rateLimit).not.toHaveProperty("retryAfter");
		expect(report.primaryResponse).toMatchObject({
			status: 429,
			url: redactedUrl,
			decodedBytes: input.body.byteLength,
			bodySha256: createHash("sha256").update(input.body).digest("hex"),
		});
		if (mode.captureBody) {
			expect(report.bodyCapture).toMatchObject({
				encoding: "base64",
				decodedBytes: input.body.byteLength,
				sha256: report.primaryResponse?.bodySha256,
				data: Buffer.from(input.body).toString("base64"),
			});
		} else expect(report).not.toHaveProperty("bodyCapture");
		expect(input.body).toEqual(new TextEncoder().encode(markup));
		expectClosed(report);
	},
);

it.each(
	modes.slice(0, 3).flatMap((mode) =>
		["malformed", "oversized", "non-html"].map((bodyKind) => ({
			...mode,
			bodyKind,
		})),
	),
)("does not parse $bodyKind primary 429 in $name", async (mode) => {
	const source =
		mode.bodyKind === "oversized"
			? `<main>${"x".repeat(researchLongDocumentAdmission.reader.maxSourceCodeUnits + 1)}</main>`
			: mode.bodyKind === "malformed"
				? '<html><script>unterminated\u0000<div title="'
				: Uint8Array.of(0, 255, 128, 1);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response(source, {
			headers: {
				"content-type": [
					mode.bodyKind === "non-html"
						? "application/octet-stream"
						: "text/html",
				],
			},
		}),
	);
	const report = await navigate(mode);
	expectRateLimit(report);
	expectPlainStop(report);
	expectNoLoading();
	expectClosed(report);
});

it.each([
	{ header: "0", kind: "delay-seconds", delaySeconds: 0, retryAt: receivedAt },
	{ header: "120", kind: "delay-seconds", delaySeconds: 120, retryAt },
	{
		header: "Fri, 11 Sep 2026 12:02:00 GMT",
		kind: "http-date",
		delaySeconds: 120,
		retryAt,
	},
])(
	"records $kind advice ($header) without sleeping or retrying",
	async (advice) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response(markup, {
				headers: {
					"content-type": ["text/html"],
					"retry-after": [advice.header],
				},
			}),
		);
		const iterator = batch(["--min-request-interval-ms", "100"]);
		const first = await track(iterator.next());
		expect(first.done).toBe(false);
		const report = first.value as ResearchNavigationReport;
		expectRateLimit(report);
		expectPlainStop(report);
		expect(report.rateLimit?.retryAfter).toEqual({
			kind: advice.kind,
			delaySeconds: advice.delaySeconds,
			retryAt: advice.retryAt,
		});
		expect(await track(iterator.next())).toEqual({
			done: true,
			value: undefined,
		});
		expectNoLoading();
		expectClosed(report);
		expect(OriginRequestPacer.prototype.close).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(300_000);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each(
	[
		undefined,
		[],
		[""],
		["later"],
		["-1"],
		["1.5"],
		["Infinity"],
		["120", "240"],
	].map((header) => ({ header })),
)(
	"stops a batch even with absent or malformed Retry-After $header",
	async ({ header }) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response(markup, {
				headers: {
					"content-type": ["text/html"],
					...(header === undefined ? {} : { "retry-after": header }),
				},
			}),
		);
		const iterator = batch();
		const first = await track(iterator.next());
		expect(first.done).toBe(false);
		const report = first.value as ResearchNavigationReport;
		expectRateLimit(report);
		expectPlainStop(report);
		expect(report.rateLimit).not.toHaveProperty("retryAfter");
		expect(await track(iterator.next())).toEqual({
			done: true,
			value: undefined,
		});
		expectNoLoading();
		expectClosed(report);
	},
);

it.each(modes)(
	"retains header-confirmed challenge precedence in $name",
	async (mode) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response(markup, {
				headers: {
					"content-type": ["text/html"],
					"cf-mitigated": ["challenge"],
					"retry-after": ["120"],
				},
			}),
		);
		const report = await navigate(mode, true);
		expectRateLimit(report);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			classification: {
				barrier: "challenge",
				diagnostic: {
					provider: "cloudflare",
					confidence: "confirmed",
					evidence: ["cf-mitigated-challenge"],
				},
			},
			failure: { category: "policy-denied", stage: "semantic-barrier" },
			rateLimit: {
				retryAfter: { kind: "delay-seconds", delaySeconds: 120, retryAt },
			},
		});
		expect(report.bodyCapture).toBeDefined();
		expectNoLoading();
		expectClosed(report);
	},
);

it.each(modes)(
	"preserves capture ceilings on primary 429 in $name",
	async (mode) => {
		const limit =
			mode.documentProfile === "long-v1"
				? researchLongDocumentAdmission.maxCaptureBytes
				: researchBodyCaptureLimit;
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response(new Uint8Array(limit + 1)),
		);
		const report = await navigate(mode, true);
		expectRateLimit(report);
		expect(report.primaryResponse).toMatchObject({
			status: 429,
			decodedBytes: limit + 1,
		});
		expect(report.failure).toMatchObject({
			category: "resource-limit",
			stage: "body-capture",
		});
		expect(report).not.toHaveProperty("bodyCapture");
		expectNoLoading();
		expectClosed(report);
	},
);

it("allows long capture above the default ceiling without invoking the reader", async () => {
	const body = new Uint8Array(researchBodyCaptureLimit + 1).fill(65);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response(body),
	);
	const report = await navigate(modes[3], true);
	expectRateLimit(report);
	expectPlainStop(report);
	expect(report.bodyCapture?.decodedBytes).toBe(body.byteLength);
	expect(report.bodyCapture?.data).toBe(Buffer.from(body).toString("base64"));
	expectNoLoading();
	expectClosed(report);
});

it.each(["120", "malformed"])(
	"blocks later stylesheet transport and batch URLs after subresource 429 (Retry-After=%s)",
	async (retryAfter) => {
		const stylesheetUrl = `${origin}/first.css?token=PRIVATE_RESOURCE#PRIVATE_RESOURCE_FRAGMENT`;
		const primary = response(markup, { status: 200 });
		const requested: string[] = [];
		vi.mocked(NodeNetworkTransport.prototype.request).mockImplementation(
			async function (
				this: NodeNetworkTransport,
				input,
			): Promise<NetworkResponse> {
				requested.push(input.url);
				if (input.url === url) return primary;
				if (input.url === `${origin}/first.css`)
					return response("limited", {
						url: stylesheetUrl,
						headers: {
							"content-type": ["text/css"],
							"retry-after": [retryAfter],
						},
					});
				throw new AgentBrowserError(
					"policy-denied",
					"Unexpected synthetic request",
				);
			},
		);
		const attempted: string[] = [];
		const failures: unknown[] = [];
		let loaderCompleted = false;
		vi.mocked(browserLoader.loadBrowserDocument).mockImplementation(
			async function (this: typeof browserLoader, input, context) {
				const tree = await loadBrowserDocument(input, {
					...context,
					fetchStylesheet: async (resourceUrl) => {
						attempted.push(resourceUrl);
						try {
							if (!context.fetchStylesheet)
								throw new Error("Expected stylesheet fetch");
							return await context.fetchStylesheet(resourceUrl);
						} catch (error) {
							failures.push(error);
							throw error;
						}
					},
				});
				loaderCompleted = true;
				return tree;
			},
		);
		const iterator = batch([
			"--capture-body",
			"--min-request-interval-ms",
			"100",
		]);
		const first = await track(iterator.next());
		expect(first.done).toBe(false);
		const report = first.value as ResearchNavigationReport;
		expect(loaderCompleted).toBe(true);
		expect(attempted).toEqual([`${origin}/first.css`, `${origin}/later.css`]);
		expect(failures).toHaveLength(2);
		for (const failure of failures)
			expect(failure).toMatchObject({ code: "policy-denied" });
		expectRateLimit(report, `${origin}/first.css?redacted`);
		expectPlainStop(report);
		expect(report.primaryResponse).toMatchObject({
			status: 200,
			url: redactedUrl,
			decodedBytes: primary.body.byteLength,
			bodySha256: createHash("sha256").update(primary.body).digest("hex"),
		});
		expect(report.bodyCapture?.data).toBe(
			Buffer.from(primary.body).toString("base64"),
		);
		expect(report.finalUrl).toBe(redactedUrl);
		expect(report.requestedUrl).toBe(redactedUrl);
		expect(JSON.stringify(report)).not.toContain("PRIVATE_");
		if (retryAfter === "120")
			expect(report.rateLimit?.retryAfter).toEqual({
				kind: "delay-seconds",
				delaySeconds: 120,
				retryAt,
			});
		else expect(report.rateLimit).not.toHaveProperty("retryAfter");
		expect(await track(iterator.next())).toEqual({
			done: true,
			value: undefined,
		});
		expect(requested).toEqual([url, `${origin}/first.css`]);
		expectClosed(report, 2);
		expect(OriginRequestPacer.prototype.close).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(300_000);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each(
	modes
		.slice(0, 3)
		.flatMap((mode) => [404, 503].map((status) => ({ ...mode, status }))),
)(
	"keeps ordinary $status extraction and batch continuation in $name",
	async (mode) => {
		vi.mocked(NodeNetworkTransport.prototype.request)
			.mockResolvedValueOnce(
				response("<main>Unavailable fixture</main>", { status: mode.status }),
			)
			.mockResolvedValueOnce(
				response("<main>Next fixture</main>", { status: 200, url: nextUrl }),
			);
		const iterator = batch([
			...(mode.reader ? ["--reader"] : []),
			...(mode.readerRawPolicy
				? ["--reader-raw-policy", mode.readerRawPolicy]
				: []),
		]);
		const first = await track(iterator.next());
		expect(first.done).toBe(false);
		expect(first.value).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			primaryResponse: { status: mode.status },
			classification: { barrier: null },
		});
		expect(first.value).not.toHaveProperty("rateLimit");
		expect(first.value).not.toHaveProperty("failure");
		expect((first.value as ResearchNavigationReport).extraction).toBeDefined();
		expectClosed(first.value as ResearchNavigationReport);
		const second = await track(iterator.next());
		expect(second.done).toBe(false);
		expect(second.value).toMatchObject({
			requestedUrl: nextUrl,
			outcome: "extracted-unverified",
		});
		expect(second.value).not.toHaveProperty("rateLimit");
		expect(await track(iterator.next())).toEqual({
			done: true,
			value: undefined,
		});
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(2);
		expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("does not impose a persistent cooldown on a later independent navigation", async () => {
	vi.mocked(NodeNetworkTransport.prototype.request)
		.mockResolvedValueOnce(
			response(markup, {
				headers: { "content-type": ["text/html"], "retry-after": ["120"] },
			}),
		)
		.mockResolvedValueOnce(
			response("<main>Independent fixture</main>", { status: 200 }),
		);
	const first = await navigate();
	expectRateLimit(first);
	expectPlainStop(first);
	expectClosed(first);
	const second = await navigate();
	expect(second.outcome).toBe("extracted-unverified");
	expect(second).not.toHaveProperty("rateLimit");
	expect(second.metrics).toMatchObject({ active: 0, closed: true });
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});
