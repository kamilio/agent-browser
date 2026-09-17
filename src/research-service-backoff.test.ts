import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
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
import * as readerLoader from "./research-loader.js";
import { researchReaderProfile } from "./research-reader-info.js";
import type { RetryAfterAdvice } from "./retry-after.js";
import { BrowserSession } from "./session.js";

const origin = "https://service-backoff.fixture.invalid";
const url = `${origin}/paper?token=PRIVATE_QUERY`;
const redactedUrl = `${origin}/paper?redacted`;
const nextUrl = `${origin}/next`;
const receivedAt = "2026-09-11T12:00:00.000Z";
const retryAt = "2026-09-11T12:02:00.000Z";
const markup =
	"<title>Owned service fixture</title><main><h1>Owned content</h1><p>Service response fixture.</p></main>";
const stylesheetMarkup =
	'<title>Owned service fixture</title><link rel="stylesheet" href="/first.css?token=PRIVATE_RESOURCE"><link rel="stylesheet" href="/later.css"><main><h1>Owned content</h1><p>Service response fixture.</p></main>';
const modes = [
	{ name: "native", reader: false },
	{ name: "reader", reader: true },
];
const pending: Promise<unknown>[] = [];
const batches: AsyncGenerator<ResearchNavigationReport>[] = [];
const loadBrowserDocument = browserLoader.loadBrowserDocument;
let controller: AbortController;

function track<Result>(promise: Promise<Result>): Promise<Result> {
	void promise.catch(() => undefined);
	pending.push(promise);
	return promise;
}

function response(
	headers: NetworkResponse["headers"] = { "retry-after": ["120"] },
	status = 503,
	source = markup,
	responseUrl = url,
): NetworkResponse {
	return {
		url: responseUrl,
		status,
		headers: { "content-type": ["text/html; charset=utf-8"], ...headers },
		body: new TextEncoder().encode(source),
		encodedBytes: 0,
		redirects: [],
		elapsedMs: 0,
	};
}

function enqueue(inputResponse: NetworkResponse, expectedUrl = url) {
	vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
		function (this: NodeNetworkTransport, input) {
			expect(input.url).toBe(expectedUrl);
			expect(input.cookieContext?.credentials).toBe("omit");
			return this.requestWithRoutes(input, () => inputResponse);
		},
	);
}

function navigate(reader = false, captureBody = false) {
	return track(
		researchNavigation(url, reader, controller.signal, undefined, captureBody),
	);
}

function batch(args: string[] = [], urls = [url, nextUrl]) {
	const iterator = researchBatch([...args, ...urls], controller.signal);
	batches.push(iterator);
	return iterator;
}

async function nextReport(iterator: AsyncGenerator<ResearchNavigationReport>) {
	const result = await track(iterator.next());
	expect(result.done).toBe(false);
	if (result.done) throw new Error("Expected owned research report");
	return result.value;
}

function expectNoExtraction(report: ResearchNavigationReport) {
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

function expectNoLoading() {
	expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(htmlParser.parseHtmlDocument).not.toHaveBeenCalled();
	expect(htmlParser.parseHtmlDocumentAsync).not.toHaveBeenCalled();
}

function expectBackoff(
	report: ResearchNavigationReport,
	advice: RetryAfterAdvice = {
		kind: "delay-seconds",
		delaySeconds: 120,
		retryAt,
	},
	stoppedUrl = redactedUrl,
) {
	expect(report.serviceBackoff).toEqual({
		kind: "http-service-backoff",
		status: 503,
		url: stoppedUrl,
		receivedAt,
		action: "stop-without-retry",
		retryAfter: advice,
	});
	expect(report).not.toHaveProperty("rateLimit");
	expect(report.contentSuccess).toBe(false);
	expect(report.partial).toBe(true);
	expectNoExtraction(report);
	expect(JSON.stringify(report)).not.toContain("PRIVATE_");
}

function expectPlainStop(report: ResearchNavigationReport) {
	expect(report).toMatchObject({
		outcome: "http-failure",
		classification: { barrier: null, diagnostic: null },
		failure: { category: "policy-denied", stage: "service-backoff" },
	});
}

function expectClosed(report: ResearchNavigationReport, requests = 1) {
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
		requests,
	);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({
		requests,
		mockedRequests: requests,
		active: 0,
		closed: true,
	});
	expect(report.finishedAt).toBe(receivedAt);
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
	vi.spyOn(browserLoader, "loadBrowserDocument");
	vi.spyOn(readerLoader, "loadResearchDocument");
	vi.spyOn(htmlParser, "parseHtmlDocument");
	vi.spyOn(htmlParser, "parseHtmlDocumentAsync");
	vi.spyOn(extraction, "extractDocument");
	vi.spyOn(extraction, "discoverDocumentHeadings");
	vi.spyOn(extraction, "discoverDocumentTextLines");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Native fixtures must not call global fetch");
		}),
	);
});

afterEach(async () => {
	try {
		controller.abort(
			new AgentBrowserError("aborted", "Synthetic service-backoff cleanup"),
		);
		for (const iterator of batches.splice(0)) track(iterator.return(undefined));
		await vi.runAllTimersAsync();
		await Promise.allSettled(pending.splice(0));
		expect(fetch).not.toHaveBeenCalled();
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
		vi.unstubAllGlobals();
		vi.useRealTimers();
	}
});

it.each(
	modes.flatMap((mode) =>
		[false, true].map((captureBody) => ({ ...mode, captureBody })),
	),
)("stops primary 503 in $name (capture=$captureBody)", async (mode) => {
	const input = response();
	enqueue(input);
	const report = await navigate(mode.reader, mode.captureBody);
	expectBackoff(report);
	expectPlainStop(report);
	expectNoLoading();
	expect(report.profile).toBe(mode.reader ? researchReaderProfile : "native");
	expect(report.primaryResponse).toMatchObject({
		status: 503,
		url: redactedUrl,
		decodedBytes: input.body.byteLength,
		bodySha256: createHash("sha256").update(input.body).digest("hex"),
	});
	if (mode.captureBody)
		expect(report.bodyCapture).toMatchObject({
			encoding: "base64",
			decodedBytes: input.body.byteLength,
			sha256: report.primaryResponse?.bodySha256,
			data: Buffer.from(input.body).toString("base64"),
		});
	else expect(report).not.toHaveProperty("bodyCapture");
	expectClosed(report);
});

const acceptedAdvice: {
	name: string;
	headers: NetworkResponse["headers"];
	advice: RetryAfterAdvice;
}[] = [
	...[
		{ name: "zero", value: "0", delaySeconds: 0 },
		{ name: "delta", value: "120", delaySeconds: 120 },
		{ name: "trimmed delta", value: "\t 120 \t", delaySeconds: 120 },
		{ name: "maximum delta", value: "86400", delaySeconds: 86400 },
	].map(({ name, value, delaySeconds }) => ({
		name,
		headers: { "retry-after": [value] },
		advice: {
			kind: "delay-seconds" as const,
			delaySeconds,
			retryAt: new Date(
				Date.parse(receivedAt) + delaySeconds * 1000,
			).toISOString(),
		},
	})),
	{
		name: "future HTTP date",
		headers: { "retry-after": ["Fri, 11 Sep 2026 12:02:00 GMT"] },
		advice: { kind: "http-date", delaySeconds: 120, retryAt },
	},
	{
		name: "stale HTTP date",
		headers: { "retry-after": ["Fri, 11 Sep 2026 11:59:00 GMT"] },
		advice: {
			kind: "http-date",
			delaySeconds: 0,
			retryAt: "2026-09-11T11:59:00.000Z",
		},
	},
	{
		name: "identical repeated values",
		headers: { "retry-after": ["120", " 120 "] },
		advice: { kind: "delay-seconds", delaySeconds: 120, retryAt },
	},
	{
		name: "identical case-variant fields",
		headers: { "Retry-After": ["120"], "retry-after": ["120"] },
		advice: { kind: "delay-seconds", delaySeconds: 120, retryAt },
	},
];

it.each(
	modes.flatMap((mode) =>
		acceptedAdvice.flatMap((testCase) =>
			[0, 100].map((interval) => ({
				...testCase,
				interval,
				reader: mode.reader,
				mode: mode.name,
			})),
		),
	),
)(
	"stops the $mode batch for $name at interval=$interval without sleeping",
	async ({ headers, advice, interval, reader }) => {
		enqueue(response(headers));
		const iterator = batch([
			...(reader ? ["--reader"] : []),
			"--min-request-interval-ms",
			String(interval),
		]);
		const report = await nextReport(iterator);
		expectBackoff(report, advice);
		expectPlainStop(report);
		expectNoLoading();
		expect(await track(iterator.next())).toEqual({
			done: true,
			value: undefined,
		});
		expectClosed(report);
		await vi.advanceTimersByTimeAsync(300_000);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	},
);

const invalidAdvice: { name: string; headers: NetworkResponse["headers"] }[] = [
	{ name: "absent", headers: {} },
	...[
		{ name: "empty array", values: [] },
		{ name: "empty value", values: [""] },
		{ name: "word", values: ["later"] },
		{ name: "negative", values: ["-1"] },
		{ name: "fractional", values: ["1.5"] },
		{ name: "nonfinite", values: ["Infinity"] },
		{ name: "conflicting values", values: ["120", "240"] },
		{ name: "comma-joined values", values: ["120, 120"] },
		{ name: "overlong value", values: ["0".repeat(129)] },
		{ name: "excess values", values: Array<string>(17).fill("120") },
		{ name: "delta beyond bound", values: ["86401"] },
		{
			name: "date beyond bound",
			values: ["Sat, 12 Sep 2026 12:00:01 GMT"],
		},
		{ name: "invalid weekday", values: ["Thu, 11 Sep 2026 12:02:00 GMT"] },
	].map(({ name, values }) => ({ name, headers: { "retry-after": values } })),
	{
		name: "conflicting case-variant fields",
		headers: { "Retry-After": ["120"], "retry-after": ["240"] },
	},
	{
		name: "excess header names",
		headers: {
			...Object.fromEntries(
				Array.from({ length: 128 }, (_, index) => [
					`x-owned-${index}`,
					["fixture"],
				]),
			),
			"retry-after": ["120"],
		},
	},
];

it.each(
	modes.flatMap((mode) =>
		invalidAdvice.map((testCase) => ({
			...mode,
			...testCase,
			mode: mode.name,
		})),
	),
)("continues without backoff after $name advice in $mode", async (testCase) => {
	enqueue(response(testCase.headers));
	enqueue(response({}, 200, markup, nextUrl), nextUrl);
	const iterator = batch(testCase.reader ? ["--reader"] : []);
	const first = await nextReport(iterator);
	expect(first).not.toHaveProperty("serviceBackoff");
	expect(first).not.toHaveProperty("rateLimit");
	if (testCase.name === "excess header names") {
		expect(first.outcome).toBe("failure");
		expect(first.failure).toMatchObject({
			category: "resource-limit",
			stage: "network",
		});
		expectNoExtraction(first);
		expectNoLoading();
	} else {
		expect(first.outcome).toBe("http-failure");
		expect(first).not.toHaveProperty("failure");
		expect(first.extraction).toBeDefined();
	}
	expect(first.metrics).toMatchObject({ requests: 1, active: 0, closed: true });
	const second = await nextReport(iterator);
	expect(second.outcome).toBe("extracted-unverified");
	expect(second).not.toHaveProperty("serviceBackoff");
	expect(await track(iterator.next())).toEqual({
		done: true,
		value: undefined,
	});
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(2);
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});

it.each(
	modes.flatMap((mode) =>
		[200, 404, 500, 502].map((status) => ({ ...mode, status })),
	),
)(
	"does not treat $status Retry-After as service backoff in $name",
	async (mode) => {
		enqueue(response({ "retry-after": ["120"] }, mode.status));
		const report = await navigate(mode.reader);
		expect(report).not.toHaveProperty("serviceBackoff");
		expect(report).not.toHaveProperty("rateLimit");
		expect(report.extraction).toBeDefined();
		expect(report.outcome).toBe(
			mode.status === 200 ? "extracted-unverified" : "http-failure",
		);
		expectClosed(report);
	},
);

it.each(modes)("preserves 429 rate-limit behavior in $name", async (mode) => {
	enqueue(response({ "retry-after": ["120"] }, 429));
	const report = await navigate(mode.reader);
	expect(report).not.toHaveProperty("serviceBackoff");
	expect(report.rateLimit).toMatchObject({
		kind: "http-rate-limit",
		status: 429,
		retryAfter: { kind: "delay-seconds", delaySeconds: 120, retryAt },
	});
	expect(report.failure).toMatchObject({
		category: "policy-denied",
		stage: "rate-limit",
	});
	expectNoExtraction(report);
	expectNoLoading();
	expectClosed(report);
});

it.each(modes)(
	"keeps explicit header challenge precedence in $name",
	async (mode) => {
		enqueue(
			response({ "retry-after": ["120"], "cf-mitigated": ["challenge"] }),
		);
		const report = await navigate(mode.reader, true);
		expectBackoff(report);
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
		});
		expect(report.bodyCapture?.data).toBe(
			Buffer.from(new TextEncoder().encode(markup)).toString("base64"),
		);
		expectNoLoading();
		expectClosed(report);
	},
);

it.each(modes)(
	"does not inspect challenge-like or malformed body in $name",
	async (mode) => {
		enqueue(
			response(
				{ "retry-after": ["120"] },
				503,
				'<title>Just a moment...</title><main>Checking your browser</main><script>unterminated\u0000<div title="',
			),
		);
		const report = await navigate(mode.reader);
		expectBackoff(report);
		expectPlainStop(report);
		expectNoLoading();
		expectClosed(report);
	},
);

it.each([
	{ name: "heading outline", flags: ["--headings"] },
	{ name: "line discovery", flags: ["--find", "Owned"] },
	{
		name: "reader raw policy",
		flags: ["--reader-raw-policy", "separate-omitted-raw-v1"],
	},
])("stops before $name in reader mode", async ({ flags }) => {
	enqueue(response());
	const iterator = batch(["--reader", ...flags]);
	const report = await nextReport(iterator);
	expectBackoff(report);
	expectPlainStop(report);
	expectNoLoading();
	expect(await track(iterator.next())).toEqual({
		done: true,
		value: undefined,
	});
	expectClosed(report);
});

it.each([0, 100])(
	"captures batch stop before report mutation at interval=%s",
	async (interval) => {
		enqueue(response());
		const iterator = batch(["--min-request-interval-ms", String(interval)]);
		const report = await nextReport(iterator);
		expectBackoff(report);
		report.outcome = "extracted-unverified";
		report.contentSuccess = null;
		report.classification.barrier = null;
		report.classification.diagnostic = null;
		expect(Reflect.deleteProperty(report, "serviceBackoff")).toBe(true);
		expect(Reflect.deleteProperty(report, "failure")).toBe(true);
		if (report.primaryResponse) report.primaryResponse.status = 200;
		expect(await track(iterator.next())).toEqual({
			done: true,
			value: undefined,
		});
		expectClosed(report);
	},
);

it("does not persist service backoff across independent batches", async () => {
	enqueue(response());
	const first = batch();
	expectBackoff(await nextReport(first));
	expect(await track(first.next())).toEqual({ done: true, value: undefined });
	enqueue(response({}, 200));
	const second = batch([], [url]);
	const report = await nextReport(second);
	expect(report.outcome).toBe("extracted-unverified");
	expect(report).not.toHaveProperty("serviceBackoff");
	expect(await track(second.next())).toEqual({ done: true, value: undefined });
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(2);
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});

it.each([0, 100])(
	"stops after a later 503 at interval=%s",
	async (interval) => {
		enqueue(response({}, 200));
		enqueue(
			response({ "retry-after": ["120"] }, 503, markup, nextUrl),
			nextUrl,
		);
		const iterator = batch(
			["--min-request-interval-ms", String(interval)],
			[url, nextUrl, "https://other.fixture.invalid/unused"],
		);
		expect((await nextReport(iterator)).outcome).toBe("extracted-unverified");
		vi.mocked(extraction.extractDocument).mockClear();
		vi.mocked(browserLoader.loadBrowserDocument).mockClear();
		vi.mocked(htmlParser.parseHtmlDocument).mockClear();
		vi.mocked(htmlParser.parseHtmlDocumentAsync).mockClear();
		const next = track(iterator.next());
		await vi.advanceTimersByTimeAsync(interval);
		const result = await next;
		if (result.done) throw new Error("Expected later service-backoff report");
		const report = result.value;
		expect(report.serviceBackoff).toMatchObject({
			kind: "http-service-backoff",
			status: 503,
			url: nextUrl,
			action: "stop-without-retry",
			retryAfter: { kind: "delay-seconds", delaySeconds: 120 },
		});
		expect(report).not.toHaveProperty("rateLimit");
		expectPlainStop(report);
		expectNoExtraction(report);
		expectNoLoading();
		expect(await track(iterator.next())).toEqual({
			done: true,
			value: undefined,
		});
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(2);
		expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(2);
		expect(report.metrics).toMatchObject({
			requests: 1,
			active: 0,
			closed: true,
		});
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("does not restart or leak timers when aborted after yielding backoff", async () => {
	enqueue(response());
	const iterator = batch(["--min-request-interval-ms", "100"]);
	const report = await nextReport(iterator);
	expectBackoff(report);
	controller.abort(new AgentBrowserError("aborted", "Owned caller abort"));
	expect(await track(iterator.next())).toEqual({
		done: true,
		value: undefined,
	});
	expectClosed(report);
});

it("makes no request when already aborted", async () => {
	controller.abort(new AgentBrowserError("aborted", "Owned preflight abort"));
	const report = await navigate();
	expect(report).not.toHaveProperty("serviceBackoff");
	expect(report.failure?.category).toBe("aborted");
	expectNoExtraction(report);
	expectNoLoading();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("stops later transport and extraction when stylesheet loader swallows 503", async () => {
	const primary = response({}, 200, stylesheetMarkup);
	const stylesheetUrl = `${origin}/first.css?token=PRIVATE_RESOURCE`;
	enqueue(primary);
	enqueue(
		response(
			{ "retry-after": ["120"], "content-type": ["text/css"] },
			503,
			"Service unavailable",
			stylesheetUrl,
		),
		stylesheetUrl,
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
	const iterator = batch(["--capture-body", "--min-request-interval-ms", "0"]);
	const report = await nextReport(iterator);
	expect(loaderCompleted).toBe(true);
	expect(attempted).toEqual([stylesheetUrl, `${origin}/later.css`]);
	expect(failures).toHaveLength(2);
	for (const failure of failures)
		expect(failure).toMatchObject({ code: "policy-denied" });
	expectBackoff(report, undefined, `${origin}/first.css?redacted`);
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
	expect(await track(iterator.next())).toEqual({
		done: true,
		value: undefined,
	});
	expectClosed(report, 2);
	expect(
		vi
			.mocked(NodeNetworkTransport.prototype.request)
			.mock.calls.map(([input]) => input.url),
	).toEqual([url, stylesheetUrl]);
	await vi.advanceTimersByTimeAsync(300_000);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});
