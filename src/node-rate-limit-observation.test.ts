import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type ResearchNavigationReport,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as browserLoader from "./document-loader.js";
import { CookieJar } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkRequest } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";
import * as readerLoader from "./research-loader.js";
import type { RetryAfterAdvice } from "./retry-after.js";
import { BrowserSession } from "./session.js";

const network = vi.hoisted(() => {
	const blocked = vi.fn(() => {
		throw new Error("Actual I/O is forbidden in rate-limit observation tests");
	});
	const dns = Object.fromEntries(
		[
			"Resolver",
			"lookup",
			"lookupService",
			"resolve",
			"resolve4",
			"resolve6",
			"resolveAny",
			"resolveCaa",
			"resolveCname",
			"resolveMx",
			"resolveNaptr",
			"resolveNs",
			"resolvePtr",
			"resolveSoa",
			"resolveSrv",
			"resolveTxt",
			"reverse",
		].map((name) => [name, blocked]),
	);
	return { https: vi.fn(), blocked, dns };
});

vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: network.blocked,
	get: network.blocked,
	createServer: network.blocked,
}));

vi.mock("node:https", async (original) => ({
	...(await original<typeof import("node:https")>()),
	request: network.https,
	get: network.blocked,
	createServer: network.blocked,
}));

vi.mock("node:net", async (original) => ({
	...(await original<typeof import("node:net")>()),
	connect: network.blocked,
	createConnection: network.blocked,
	createServer: network.blocked,
}));

vi.mock("node:tls", async (original) => ({
	...(await original<typeof import("node:tls")>()),
	connect: network.blocked,
	createServer: network.blocked,
}));

vi.mock("node:dns", () => ({ ...network.dns, promises: network.dns }));
vi.mock("node:dns/promises", () => network.dns);

interface ResponsePlan {
	status?: number;
	retryAfter?: string | readonly string[];
	headers?: Record<string, string>;
	body?: string;
	bodyError?: Error;
	holdHeaders?: boolean;
	holdBody?: boolean;
	synchronous?: boolean;
}

interface MockExchange {
	options: RequestOptions;
	time: number;
	deliver: () => void;
	finish: () => void;
}

const publicAddress = "93.184.216.34";
const origin = `https://${publicAddress}`;
const sourceUrl = `${origin}/first?token=PRIVATE_QUERY`;
const receivedAt = "2026-09-17T12:00:00.000Z";
const retryAt = "2026-09-17T12:00:02.000Z";
const transports: NodeNetworkTransport[] = [];
const pending: Promise<unknown>[] = [];
const batches: AsyncGenerator<ResearchNavigationReport>[] = [];
const streams: Readable[] = [];
const plans: ResponsePlan[] = [];
const exchanges: MockExchange[] = [];
let controller: AbortController;

function track<Result>(promise: Promise<Result>): Promise<Result> {
	void promise.catch(() => undefined);
	pending.push(promise);
	return promise;
}

function fixture(options: NodeTransportOptions = {}) {
	const transport = new NodeNetworkTransport({
		captureRateLimit: true,
		...options,
	});
	transports.push(transport);
	const request = (
		url = sourceUrl,
		overrides: Omit<NetworkRequest, "url"> = {},
	) =>
		track(transport.request({ url, signal: controller.signal, ...overrides }));
	return { transport, request };
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

const advice: RetryAfterAdvice = {
	kind: "delay-seconds",
	delaySeconds: 2,
	retryAt,
};
const modes = [
	{ name: "native", reader: false },
	{ name: "reader", reader: true },
];
const loadBrowserDocument = browserLoader.loadBrowserDocument;

function expectedObservation(
	retryAfter?: Readonly<RetryAfterAdvice>,
	url = sourceUrl,
) {
	return {
		status: 429,
		url,
		receivedAt,
		...(retryAfter === undefined ? {} : { retryAfter }),
	};
}

function expectReportObservation(
	report: ResearchNavigationReport,
	retryAfter?: Readonly<RetryAfterAdvice>,
	url = `${origin}/first?redacted`,
) {
	expect(report.rateLimit).toEqual({
		...expectedObservation(retryAfter, url),
		kind: "http-rate-limit",
		action: "stop-without-retry",
	});
	expect(report.contentSuccess).toBe(false);
	expect(report).not.toHaveProperty("serviceBackoff");
	expect(report.extraction).toBeUndefined();
	expect(report.headings).toBeUndefined();
	expect(report.textLines).toBeUndefined();
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
	expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
	expect(JSON.stringify(report)).not.toContain("PRIVATE_");
}

function batch(reader: boolean, options: string[] = []) {
	const iterator = researchBatch(
		[
			...(reader ? ["--reader"] : []),
			...options,
			sourceUrl,
			`${origin}/unused`,
		],
		controller.signal,
	);
	batches.push(iterator);
	return iterator;
}

async function nextReport(iterator: AsyncGenerator<ResearchNavigationReport>) {
	const result = await track(iterator.next());
	if (result.done) throw new Error("Expected a research report");
	return result.value;
}

async function expectStopped(
	iterator: AsyncGenerator<ResearchNavigationReport>,
	requests = 1,
) {
	expect(await track(iterator.next())).toEqual({
		done: true,
		value: undefined,
	});
	await vi.advanceTimersByTimeAsync(3000);
	expect(network.https).toHaveBeenCalledTimes(requests);
	for (const exchange of exchanges) expect(exchange.options.method).toBe("GET");
	expect(vi.getTimerCount()).toBe(0);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({
		now: new Date(receivedAt),
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	controller = new AbortController();
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(browserLoader, "loadBrowserDocument");
	vi.spyOn(readerLoader, "loadResearchDocument");
	vi.spyOn(extraction, "extractDocument");
	vi.spyOn(extraction, "discoverDocumentHeadings");
	vi.spyOn(extraction, "discoverDocumentTextLines");
	vi.stubGlobal("fetch", network.blocked);
	network.https.mockImplementation(
		(
			options: RequestOptions,
			callback: (response: IncomingMessage) => void,
		) => {
			expect(options).toMatchObject({
				hostname: publicAddress,
				agent: false,
				rejectUnauthorized: true,
			});
			expect(options.signal?.aborted).toBe(false);
			const plan = plans.shift();
			if (!plan) throw new Error("Unexpected synthetic HTTPS exchange");
			const headers: IncomingMessage["headers"] = { ...plan.headers };
			const rawHeaders = Object.entries(plan.headers ?? {}).flat();
			if (plan.retryAfter !== undefined) {
				const values =
					typeof plan.retryAfter === "string"
						? [plan.retryAfter]
						: [...plan.retryAfter];
				headers["retry-after"] = values.join(", ");
				for (const value of values) rawHeaders.push("Retry-After", value);
			}
			const response = Object.assign(new Readable({ read() {} }), {
				statusCode: plan.status ?? 200,
				headers,
				rawHeaders,
			});
			streams.push(response);
			let ended = false;
			let delivered = false;
			const finish = () => {
				if (ended || response.destroyed) return;
				ended = true;
				if (plan.bodyError) response.destroy(plan.bodyError);
				else {
					response.push(Buffer.from(plan.body ?? "owned body"));
					response.push(null);
				}
			};
			const deliver = () => {
				if (delivered || response.destroyed) return;
				delivered = true;
				callback(response as unknown as IncomingMessage);
				if (!plan.holdBody) finish();
			};
			const request = Object.assign(new EventEmitter(), {
				destroy: vi.fn(() => request),
				end: vi.fn(() => {
					if (!plan.holdHeaders) {
						if (plan.synchronous) deliver();
						else queueMicrotask(deliver);
					}
					return request;
				}),
			});
			exchanges.push({ options, time: performance.now(), deliver, finish });
			return request;
		},
	);
});

afterEach(async () => {
	try {
		controller.abort();
		for (const transport of transports.splice(0)) transport.close();
		for (const session of new Set(
			vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
		))
			if (session instanceof BrowserSession) session.close();
		for (const stream of streams.splice(0)) stream.destroy();
		for (const iterator of batches.splice(0)) track(iterator.return(undefined));
		await Promise.allSettled(pending.splice(0));
		expect(network.blocked).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		plans.splice(0);
		exchanges.splice(0);
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	}
});

it.each([
	{ name: "omitted", options: {} },
	{ name: "undefined", options: { captureRateLimit: undefined } },
	{ name: "false", options: { captureRateLimit: false } },
])("does not observe 429 when capture is $name", async ({ options }) => {
	const transport = new NodeNetworkTransport(options);
	transports.push(transport);
	plans.push({ status: 429, retryAfter: "2" });
	expect(
		(
			await track(
				transport.request({ url: sourceUrl, signal: controller.signal }),
			)
		).status,
	).toBe(429);
	expect(transport.rateLimit()).toBeUndefined();
	expect(transport.serviceBackoff()).toBeUndefined();
	expect(network.https).toHaveBeenCalledOnce();
	expect(transport.metrics()).toMatchObject({ requests: 1, active: 0 });
});

it.each([null, 0, 1, "true", "false", [], {}].map((value) => ({ value })))(
	"rejects nonboolean capture option $value before I/O",
	({ value }) => {
		expect(
			() =>
				new NodeNetworkTransport({
					captureRateLimit: value as unknown as boolean,
				}),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(network.https).not.toHaveBeenCalled();
	},
);

const acceptedAdvice = [
	{ name: "delta", value: "2", expected: advice },
	{
		name: "future date",
		value: "Thu, 17 Sep 2026 12:00:02 GMT",
		expected: { ...advice, kind: "http-date" as const },
	},
	{
		name: "zero",
		value: "0",
		expected: { ...advice, delaySeconds: 0, retryAt: receivedAt },
	},
	{
		name: "stale date",
		value: "Thu, 17 Sep 2026 11:59:59 GMT",
		expected: {
			kind: "http-date" as const,
			delaySeconds: 0,
			retryAt: "2026-09-17T11:59:59.000Z",
		},
	},
	{ name: "equivalent duplicates", value: [" 2", "2\t"], expected: advice },
];

it.each(acceptedAdvice)(
	"captures 429 with $name advice without retry or wait",
	async ({ value, expected }) => {
		const test = fixture();
		plans.push({
			status: 429,
			retryAfter: value,
			headers: { "x-unrelated": "PRIVATE_HEADER" },
		});
		expect(test.transport.rateLimit()).toBeUndefined();
		expect((await test.request()).status).toBe(429);
		expect(test.transport.rateLimit()).toEqual(expectedObservation(expected));
		expect(test.transport.serviceBackoff()).toBeUndefined();
		expect(network.https).toHaveBeenCalledOnce();
		expect(exchanges[0].time).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	},
);

const rejectedAdvice = [
	{ name: "missing", value: undefined },
	{ name: "empty", value: "" },
	{ name: "malformed", value: "later" },
	{ name: "conflicting duplicates", value: ["2", "3"] },
	{ name: "oversized value", value: "2".repeat(129) },
	{ name: "too many duplicates", value: Array<string>(17).fill("2") },
	{ name: "excessive delay", value: "86401" },
];

it.each(rejectedAdvice)(
	"still captures 429 with $name advice",
	async ({ value }) => {
		const test = fixture();
		plans.push({ status: 429, retryAfter: value });
		expect((await test.request()).status).toBe(429);
		expect(test.transport.rateLimit()).toEqual(expectedObservation());
		expect(test.transport.rateLimit()).not.toHaveProperty("retryAfter");
		expect(Object.isFrozen(test.transport.rateLimit())).toBe(true);
		expect(network.https).toHaveBeenCalledOnce();
	},
);

it("keeps the status observation when advice exceeds the header-name parser bound", async () => {
	const test = fixture();
	plans.push({
		status: 429,
		retryAfter: "2",
		headers: Object.fromEntries(
			Array.from({ length: 128 }, (_, index) => [
				`x-owned-${index}`,
				"fixture",
			]),
		),
	});
	expect((await test.request()).status).toBe(429);
	expect(test.transport.rateLimit()).toEqual(expectedObservation());
	expect(test.transport.rateLimit()).not.toHaveProperty("retryAfter");
	expect(network.https).toHaveBeenCalledOnce();
});

it.each([200, 403, 502, 503])(
	"does not confuse status %s with a rate limit",
	async (status) => {
		const test = fixture();
		plans.push({ status, retryAfter: "2" });
		await test.request();
		expect(test.transport.rateLimit()).toBeUndefined();
		expect(test.transport.serviceBackoff()).toBeUndefined();
		expect(network.https).toHaveBeenCalledOnce();
	},
);

it("rejects oversized headers before admitting an observation", async () => {
	const test = fixture({ limits: { maxHeaderBytes: 512 } });
	plans.push({
		status: 429,
		retryAfter: "2",
		headers: { "x-padding": "x".repeat(512) },
	});
	await expect(test.request()).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.transport.rateLimit()).toBeUndefined();
	expect(test.transport.metrics()).toMatchObject({ requests: 1, active: 0 });
	expect(network.https).toHaveBeenCalledOnce();
});

it("timestamps the first headers instead of request start or body completion", async () => {
	const test = fixture();
	plans.push({
		status: 429,
		retryAfter: "2",
		holdHeaders: true,
		holdBody: true,
	});
	const request = test.request();
	const settled = vi.fn();
	track(request.then(settled));
	await flush();
	expect(test.transport.rateLimit()).toBeUndefined();
	await vi.advanceTimersByTimeAsync(1000);
	exchanges[0].deliver();
	await flush();
	expect(settled).not.toHaveBeenCalled();
	const expected = {
		status: 429,
		url: sourceUrl,
		receivedAt: "2026-09-17T12:00:01.000Z",
		retryAfter: { ...advice, retryAt: "2026-09-17T12:00:03.000Z" },
	};
	expect(test.transport.rateLimit()).toEqual(expected);
	expect(test.transport.metrics()).toMatchObject({
		requests: 1,
		active: 1,
		encodedBytes: 0,
		decodedBytes: 0,
	});
	await vi.advanceTimersByTimeAsync(500);
	exchanges[0].finish();
	expect((await request).status).toBe(429);
	expect(test.transport.rateLimit()).toEqual(expected);
	expect(network.https).toHaveBeenCalledOnce();
});

it.each([
	{ name: "with advice", retryAfter: "2", expected: advice },
	{ name: "without advice", retryAfter: undefined, expected: undefined },
])(
	"keeps the first immutable observation $name until close",
	async ({ retryAfter, expected }) => {
		const test = fixture();
		plans.push(
			{ status: 429, retryAfter, synchronous: true },
			{ status: 429, retryAfter: "8" },
		);
		await test.request();
		const observed = test.transport.rateLimit();
		if (!observed) throw new Error("Expected header observation");
		expect(Object.isFrozen(observed)).toBe(true);
		expect(Reflect.set(observed, "url", `${origin}/mutated`)).toBe(false);
		expect(Reflect.set(observed, "retryAfter", advice)).toBe(false);
		if (observed.retryAfter) {
			expect(Object.isFrozen(observed.retryAfter)).toBe(true);
			expect(Reflect.set(observed.retryAfter, "delaySeconds", 99)).toBe(false);
		}
		await test.request(`${origin}/second`);
		expect(test.transport.rateLimit()).toBe(observed);
		expect(observed).toEqual(expectedObservation(expected));
		expect(exchanges.map(({ time }) => time)).toEqual([0, 0]);
		expect(network.https).toHaveBeenCalledTimes(2);
		test.transport.close();
		test.transport.close();
		expect(test.transport.rateLimit()).toBeUndefined();
		expect(observed).toEqual(expectedObservation(expected));
		expect(test.transport.metrics()).toMatchObject({ active: 0, closed: true });
	},
);

it("keeps 429 and 503 first observations independently", async () => {
	const test = fixture({ captureServiceBackoff: true });
	plans.push(
		{ status: 503, retryAfter: "2" },
		{ status: 429 },
		{ status: 503, retryAfter: "8" },
		{ status: 429, retryAfter: "9" },
	);
	await test.request(`${origin}/service`);
	expect(test.transport.rateLimit()).toBeUndefined();
	const service = test.transport.serviceBackoff();
	expect(service).toEqual({
		status: 503,
		url: `${origin}/service`,
		receivedAt,
		retryAfter: advice,
	});
	await test.request();
	const rate = test.transport.rateLimit();
	await test.request(`${origin}/service-later`);
	await test.request(`${origin}/rate-later`);
	expect(test.transport.serviceBackoff()).toBe(service);
	expect(test.transport.rateLimit()).toBe(rate);
	expect(rate).toEqual(expectedObservation());
	expect(network.https).toHaveBeenCalledTimes(4);
	test.transport.close();
	expect(test.transport.rateLimit()).toBeUndefined();
	expect(test.transport.serviceBackoff()).toBeUndefined();
});

it("does not disable service observation when rate capture is off", async () => {
	const test = fixture({
		captureRateLimit: false,
		captureServiceBackoff: true,
	});
	plans.push({ status: 429 }, { status: 503, retryAfter: "2" });
	await test.request();
	await test.request(`${origin}/service`);
	expect(test.transport.rateLimit()).toBeUndefined();
	expect(test.transport.serviceBackoff()).toEqual({
		status: 503,
		url: `${origin}/service`,
		receivedAt,
		retryAfter: advice,
	});
	expect(network.https).toHaveBeenCalledTimes(2);
});

it.each([
	{
		name: "disabled",
		interval: undefined,
		retryAfter: "2",
		delay: 0,
		expected: advice,
	},
	{
		name: "explicit zero",
		interval: 0,
		retryAfter: "2",
		delay: 0,
		expected: advice,
	},
	{
		name: "enabled with advice",
		interval: 100,
		retryAfter: "2",
		delay: 2000,
		expected: advice,
	},
	{
		name: "enabled without advice",
		interval: 100,
		retryAfter: undefined,
		delay: 100,
		expected: undefined,
	},
])(
	"preserves pacing $name independently of capture",
	async ({ interval, retryAfter, delay, expected }) => {
		const test = fixture({ minRequestIntervalMs: interval });
		plans.push({ status: 429, retryAfter }, {});
		await test.request();
		const next = test.request(`${origin}/second`);
		await flush();
		if (delay > 0) {
			await vi.advanceTimersByTimeAsync(delay - 1);
			expect(network.https).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(1);
		}
		expect((await next).status).toBe(200);
		expect(exchanges.map(({ time }) => time)).toEqual([0, delay]);
		expect(test.transport.rateLimit()).toEqual(expectedObservation(expected));
		expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 0 });
	},
);

it("captures the headers before a pacer defer failure", async () => {
	const test = fixture({ minRequestIntervalMs: 100 });
	const failure = new AgentBrowserError(
		"resource-limit",
		"Owned pacer failure",
	);
	vi.spyOn(OriginRequestPacer.prototype, "defer").mockImplementation(() => {
		throw failure;
	});
	plans.push({ status: 429, retryAfter: "2" });
	await expect(test.request()).rejects.toBe(failure);
	expect(test.transport.rateLimit()).toEqual(expectedObservation(advice));
	expect(test.transport.metrics()).toMatchObject({ requests: 1, active: 0 });
});

it.each([
	{
		name: "overflow without advice",
		retryAfter: undefined,
		body: "oversized",
		bodyError: undefined,
		code: "resource-limit",
		expected: undefined,
	},
	{
		name: "overflow with advice",
		retryAfter: "2",
		body: "oversized",
		bodyError: undefined,
		code: "resource-limit",
		expected: advice,
	},
	{
		name: "stream failure with advice",
		retryAfter: "2",
		body: undefined,
		bodyError: Object.assign(new Error("PRIVATE_BODY_FAILURE"), {
			code: "ECONNRESET",
		}),
		code: "network-error",
		expected: advice,
	},
	{
		name: "stream failure with malformed advice",
		retryAfter: "later",
		body: undefined,
		bodyError: Object.assign(new Error("PRIVATE_BODY_FAILURE"), {
			code: "ECONNRESET",
		}),
		code: "network-error",
		expected: undefined,
	},
])(
	"retains 429 after $name",
	async ({ retryAfter, body, bodyError, code, expected }) => {
		const test = fixture({ limits: { maxResponseBytes: 2 } });
		plans.push({ status: 429, retryAfter, body, bodyError });
		await expect(test.request()).rejects.toMatchObject({ code });
		expect(test.transport.rateLimit()).toEqual(expectedObservation(expected));
		expect(test.transport.metrics()).toMatchObject({ requests: 1, active: 0 });
		expect(network.https).toHaveBeenCalledOnce();
		test.transport.close();
		expect(test.transport.rateLimit()).toBeUndefined();
	},
);

it.each(["aborted", "closed"] as const)(
	"cleans up held 429 body when %s",
	async (code) => {
		const test = fixture();
		plans.push({ status: 429, holdBody: true });
		const request = test.request();
		await flush();
		expect(test.transport.rateLimit()).toEqual(expectedObservation());
		if (code === "aborted") controller.abort();
		else test.transport.close();
		await expect(request).rejects.toMatchObject({ code });
		expect(test.transport.rateLimit()).toEqual(
			code === "closed" ? undefined : expectedObservation(),
		);
		expect(streams[0].destroyed).toBe(true);
		expect(test.transport.metrics()).toMatchObject({
			active: 0,
			closed: code === "closed",
		});
		expect(network.https).toHaveBeenCalledOnce();
	},
);

it("does not accept late headers after closing a pending exchange", async () => {
	const test = fixture();
	plans.push({ status: 429, retryAfter: "2", holdHeaders: true });
	const request = test.request();
	await flush();
	test.transport.close();
	await expect(request).rejects.toMatchObject({ code: "closed" });
	exchanges[0].deliver();
	await flush();
	expect(test.transport.rateLimit()).toBeUndefined();
	expect(streams[0].destroyed).toBe(true);
	expect(network.https).toHaveBeenCalledOnce();
});

it("does not create a real-header observation from routed 429", async () => {
	const test = fixture();
	const result = await track(
		test.transport.requestWithRoutes(
			{ url: sourceUrl, signal: controller.signal },
			() => ({
				url: sourceUrl,
				status: 429,
				headers: { "retry-after": ["2"] },
				body: new TextEncoder().encode("routed"),
				encodedBytes: 0,
				redirects: [],
				elapsedMs: 0,
			}),
		),
	);
	expect(result.status).toBe(429);
	expect(test.transport.rateLimit()).toBeUndefined();
	expect(network.https).not.toHaveBeenCalled();
	expect(test.transport.metrics()).toMatchObject({
		mockedRequests: 1,
		requests: 1,
		active: 0,
	});
});

it("does not reinterpret mutated cache delivery as real 429 headers", async () => {
	const jar = new CookieJar();
	const test = fixture({ cookieJar: jar, resourceCache: {} });
	const overrides: Omit<NetworkRequest, "url"> = {
		resourceReuse: "stylesheet",
		method: "GET",
		redirect: "manual",
		cookieContext: {
			credentials: "omit",
			siteUrl: origin,
			topLevelNavigation: false,
		},
	};
	plans.push({
		status: 200,
		headers: {
			"content-type": "text/css",
			"cache-control": "public, max-age=3600",
			date: "Thu, 17 Sep 2026 12:00:00 GMT",
		},
		body: "body { color: red }",
	});
	const resourceUrl = `${origin}/style.css`;
	await test.request(resourceUrl, overrides);
	const cached = await test.request(resourceUrl, overrides);
	expect(cached.delivery).toBe("memory-cache");
	expect(Reflect.set(cached, "status", 429)).toBe(true);
	expect(Reflect.set(cached, "headers", { "retry-after": ["2"] })).toBe(true);
	expect(test.transport.rateLimit()).toBeUndefined();
	const next = await test.request(resourceUrl, overrides);
	expect(next.status).toBe(200);
	expect(next.delivery).toBe("memory-cache");
	expect(test.transport.rateLimit()).toBeUndefined();
	expect(network.https).toHaveBeenCalledOnce();
	expect(test.transport.metrics()).toMatchObject({
		requests: 1,
		cacheHits: 2,
		active: 0,
	});
});

const completeCases = [
	{ name: "missing", retryAfter: undefined, expected: undefined },
	{ name: "malformed", retryAfter: "later", expected: undefined },
	{ name: "valid", retryAfter: "2", expected: advice },
];

it.each(
	modes.flatMap((mode) =>
		completeCases.map((entry) => ({
			...entry,
			mode: mode.name,
			reader: mode.reader,
		})),
	),
)(
	"stops $mode batch on a complete 429 with $name advice",
	async ({ reader, retryAfter, expected }) => {
		const body = "<title>Rate limited</title><p>Retry later.</p>";
		plans.push({
			status: 429,
			retryAfter,
			headers: { "content-type": "text/html" },
			body,
		});
		const iterator = batch(reader, [
			"--capture-body",
			"--min-request-interval-ms",
			"0",
		]);
		const report = await nextReport(iterator);
		expectReportObservation(report, expected);
		expect(report.outcome).toBe("http-failure");
		expect(report.failure).toMatchObject({
			category: "policy-denied",
			stage: "rate-limit",
		});
		expect(report.primaryResponse).toMatchObject({
			status: 429,
			url: `${origin}/first?redacted`,
			decodedBytes: Buffer.byteLength(body),
		});
		expect(report.bodyCapture?.data).toBe(Buffer.from(body).toString("base64"));
		expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		expect(report.metrics).toMatchObject({
			requests: 1,
			active: 0,
			closed: true,
		});
		await expectStopped(iterator);
	},
);

const failedBodies = [
	{
		name: "missing advice stream error",
		retryAfter: undefined,
		overflow: false,
		expected: undefined,
	},
	{
		name: "malformed advice stream error",
		retryAfter: "later",
		overflow: false,
		expected: undefined,
	},
	{
		name: "valid advice stream error",
		retryAfter: "2",
		overflow: false,
		expected: advice,
	},
	{
		name: "valid advice overflow",
		retryAfter: "2",
		overflow: true,
		expected: advice,
	},
];

it.each(
	modes.flatMap((mode) =>
		failedBodies.map((entry) => ({
			...entry,
			mode: mode.name,
			reader: mode.reader,
		})),
	),
)(
	"retains 429 and original failure in $mode batch after $name",
	async ({ reader, retryAfter, overflow, expected }) => {
		plans.push({
			status: 429,
			retryAfter,
			headers: { "content-type": "text/html" },
			...(overflow
				? { body: "x".repeat(2_000_001) }
				: {
						bodyError: Object.assign(new Error("PRIVATE_BODY_FAILURE"), {
							code: "ECONNRESET",
						}),
					}),
		});
		const iterator = batch(reader, [
			"--capture-body",
			"--min-request-interval-ms",
			"100",
		]);
		const report = await nextReport(iterator);
		expectReportObservation(report, expected);
		expect(report.outcome).toBe("http-failure");
		expect(report.failure).toMatchObject({
			category: overflow ? "resource-limit" : "network-error",
			stage: "network",
		});
		expect(report).not.toHaveProperty("bodyCapture");
		expect(report.primaryResponse).toBeNull();
		expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		expect(report.metrics).toMatchObject({
			requests: 1,
			active: 0,
			closed: true,
		});
		await expectStopped(iterator);
		for (const transport of vi.mocked(NodeNetworkTransport.prototype.close).mock
			.contexts)
			if (transport instanceof NodeNetworkTransport)
				expect(transport.rateLimit()).toBeUndefined();
	},
);

it.each(modes)(
	"retains 429 when outer $name navigation aborts before its held body settles",
	async ({ reader }) => {
		const request = vi.spyOn(NodeNetworkTransport.prototype, "request");
		plans.push({
			status: 429,
			headers: { "content-type": "text/html" },
			holdBody: true,
		});
		const navigation = track(
			researchNavigation(sourceUrl, reader, controller.signal, undefined, true),
		);
		const settled = vi.fn();
		track(navigation.then(settled));
		await flush();
		expect(settled).not.toHaveBeenCalled();
		const transport = request.mock.contexts[0];
		if (!(transport instanceof NodeNetworkTransport))
			throw new Error("Expected native transport");
		expect(transport.rateLimit()).toEqual(expectedObservation());
		expect(transport.metrics()).toMatchObject({
			requests: 1,
			active: 1,
			encodedBytes: 0,
			decodedBytes: 0,
		});
		controller.abort(new AgentBrowserError("aborted", "Owned held-body abort"));
		const report = await navigation;
		expectReportObservation(report);
		expect(report.failure).toMatchObject({
			category: "aborted",
			stage: "network",
		});
		expect(report).not.toHaveProperty("bodyCapture");
		expect(report.primaryResponse).toBeNull();
		expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		await Promise.allSettled([request.mock.results[0].value]);
		expect(transport.rateLimit()).toBeUndefined();
		expect(transport.metrics()).toMatchObject({
			requests: 1,
			active: 0,
			closed: true,
		});
		expect(streams[0].destroyed).toBe(true);
		await vi.advanceTimersByTimeAsync(3000);
		expect(request).toHaveBeenCalledOnce();
		expect(network.https).toHaveBeenCalledOnce();
	},
);

it.each(modes)(
	"preserves routed-response 429 fallback in $name mode",
	async ({ reader }) => {
		vi.spyOn(NodeNetworkTransport.prototype, "request").mockImplementation(
			function (this: NodeNetworkTransport, input) {
				return this.requestWithRoutes(input, () => ({
					url: sourceUrl,
					status: 429,
					headers: { "content-type": ["text/html"], "retry-after": ["2"] },
					body: new TextEncoder().encode("<p>Rate limited</p>"),
					encodedBytes: 0,
					redirects: [],
					elapsedMs: 0,
				}));
			},
		);
		const iterator = batch(reader);
		const report = await nextReport(iterator);
		expectReportObservation(report, advice);
		expect(report.failure).toMatchObject({
			category: "policy-denied",
			stage: "rate-limit",
		});
		expect(report.metrics).toMatchObject({
			mockedRequests: 1,
			requests: 1,
			active: 0,
			closed: true,
		});
		await expectStopped(iterator, 0);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	},
);

it.each([false, true])(
	"stops after a swallowed stylesheet 429 with bodyError=%s",
	async (bodyError) => {
		const stylesheetUrl = `${origin}/first.css?token=PRIVATE_RESOURCE`;
		const body =
			'<title>Owned page</title><link rel="stylesheet" href="/first.css?token=PRIVATE_RESOURCE"><link rel="stylesheet" href="/later.css"><main><h1>Owned content</h1><p>Retained primary body.</p></main>';
		plans.push(
			{ status: 200, headers: { "content-type": "text/html" }, body },
			{
				status: 429,
				headers: { "content-type": "text/css" },
				...(bodyError
					? {
							bodyError: Object.assign(
								new Error("PRIVATE_STYLESHEET_FAILURE"),
								{ code: "ECONNRESET" },
							),
						}
					: { body: "Rate limited" }),
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
		const iterator = batch(false, [
			"--capture-body",
			"--min-request-interval-ms",
			"0",
		]);
		const report = await nextReport(iterator);
		expect(loaderCompleted).toBe(true);
		expect(attempted).toEqual([stylesheetUrl, `${origin}/later.css`]);
		expect(failures).toHaveLength(2);
		expect(failures[0]).toMatchObject({
			code: bodyError ? "network-error" : "policy-denied",
		});
		expect(failures[1]).toMatchObject({ code: "policy-denied" });
		expectReportObservation(report, undefined, `${origin}/first.css?redacted`);
		expect(report.failure).toMatchObject({
			category: "policy-denied",
			stage: "rate-limit",
		});
		expect(report.primaryResponse).toMatchObject({
			status: 200,
			decodedBytes: Buffer.byteLength(body),
			url: `${origin}/first?redacted`,
		});
		expect(report.bodyCapture?.data).toBe(Buffer.from(body).toString("base64"));
		expect(report.metrics).toMatchObject({
			requests: 2,
			active: 0,
			closed: true,
		});
		expect(exchanges.map(({ options }) => options.path)).toEqual([
			"/first?token=PRIVATE_QUERY",
			"/first.css?token=PRIVATE_RESOURCE",
		]);
		await expectStopped(iterator, 2);
	},
);

it.each(modes)(
	"keeps explicit challenge precedence alongside the $name rate observation",
	async ({ reader }) => {
		plans.push({
			status: 429,
			retryAfter: "2",
			headers: { "content-type": "text/html", "cf-mitigated": "challenge" },
			body: "<p>Challenge</p>",
		});
		const iterator = batch(reader);
		const report = await nextReport(iterator);
		expectReportObservation(report, advice);
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
		expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		await expectStopped(iterator);
	},
);

it("does not share observations with a separate transport", async () => {
	const first = fixture();
	const second = fixture();
	plans.push({ status: 429, retryAfter: "2" }, { status: 200 });
	await first.request();
	await second.request();
	expect(first.transport.rateLimit()).toEqual(expectedObservation(advice));
	expect(second.transport.rateLimit()).toBeUndefined();
	second.transport.close();
	expect(first.transport.rateLimit()).toEqual(expectedObservation(advice));
	expect(network.https).toHaveBeenCalledTimes(2);
});
