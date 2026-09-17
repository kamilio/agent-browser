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
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkRequest } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";
import * as readerLoader from "./research-loader.js";
import { BrowserSession } from "./session.js";

const network = vi.hoisted(() => {
	const blocked = vi.fn(() => {
		throw new Error("Actual I/O is forbidden in service-backoff tests");
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
		captureServiceBackoff: true,
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

function expectedObservation(url = sourceUrl) {
	return {
		status: 503,
		url,
		receivedAt,
		retryAfter: { kind: "delay-seconds", delaySeconds: 2, retryAt },
	};
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
	{ name: "undefined", options: { captureServiceBackoff: undefined } },
	{ name: "false", options: { captureServiceBackoff: false } },
])(
	"does not observe service backoff when capture is $name",
	async ({ options }) => {
		const transport = new NodeNetworkTransport(options);
		transports.push(transport);
		plans.push({ status: 503, retryAfter: "2" });
		await track(
			transport.request({ url: sourceUrl, signal: controller.signal }),
		);
		expect(transport.serviceBackoff()).toBeUndefined();
		expect(network.https).toHaveBeenCalledOnce();
		expect(transport.metrics()).toMatchObject({ requests: 1, active: 0 });
	},
);

it.each([null, 0, 1, "true", "false", [], {}].map((value) => ({ value })))(
	"rejects nonboolean capture option $value before I/O",
	({ value }) => {
		expect(
			() =>
				new NodeNetworkTransport({
					captureServiceBackoff: value as unknown as boolean,
				}),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expect(network.https).not.toHaveBeenCalled();
	},
);

const accepted = [
	{
		name: "delta",
		value: "2",
		kind: "delay-seconds",
		delaySeconds: 2,
		retryAt,
	},
	{
		name: "future date",
		value: "Thu, 17 Sep 2026 12:00:02 GMT",
		kind: "http-date",
		delaySeconds: 2,
		retryAt,
	},
	{
		name: "zero",
		value: "0",
		kind: "delay-seconds",
		delaySeconds: 0,
		retryAt: receivedAt,
	},
	{
		name: "stale date",
		value: "Thu, 17 Sep 2026 11:59:59 GMT",
		kind: "http-date",
		delaySeconds: 0,
		retryAt: "2026-09-17T11:59:59.000Z",
	},
	{
		name: "equivalent duplicate values",
		value: [" 2", "2\t"],
		kind: "delay-seconds",
		delaySeconds: 2,
		retryAt,
	},
];

it.each(
	accepted.flatMap((advice) =>
		[undefined, 0, 100].map((interval) => ({ ...advice, interval })),
	),
)(
	"captures $name advice with interval=$interval without retrying",
	async (advice) => {
		const test = fixture({ minRequestIntervalMs: advice.interval });
		expect(test.transport.serviceBackoff()).toBeUndefined();
		plans.push({
			status: 503,
			retryAfter: advice.value,
			headers: { "x-other": "not retained" },
		});
		const result = await test.request();
		expect(result.status).toBe(503);
		expect(test.transport.serviceBackoff()).toEqual({
			status: 503,
			url: sourceUrl,
			receivedAt,
			retryAfter: {
				kind: advice.kind,
				delaySeconds: advice.delaySeconds,
				retryAt: advice.retryAt,
			},
		});
		expect(network.https).toHaveBeenCalledOnce();
		expect(test.transport.metrics()).toMatchObject({ requests: 1, active: 0 });
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each([
	{ name: "200", status: 200, advice: "2" },
	{ name: "429", status: 429, advice: "2" },
	{ name: "502", status: 502, advice: "2" },
	{ name: "absent advice", status: 503, advice: undefined },
	{ name: "empty advice", status: 503, advice: "" },
	{ name: "malformed advice", status: 503, advice: "later" },
	{ name: "conflicting values", status: 503, advice: ["2", "3"] },
	{ name: "oversized value", status: 503, advice: "2".repeat(129) },
	{
		name: "excess duplicates",
		status: 503,
		advice: Array<string>(17).fill("2"),
	},
	{ name: "beyond delay bound", status: 503, advice: "86401" },
])("does not capture $name", async ({ status, advice }) => {
	const test = fixture();
	plans.push({ status, retryAfter: advice });
	await test.request();
	expect(test.transport.serviceBackoff()).toBeUndefined();
	expect(network.https).toHaveBeenCalledOnce();
	expect(test.transport.metrics()).toMatchObject({ requests: 1, active: 0 });
});

it("does not capture advice beyond the parser header-name bound", async () => {
	const test = fixture();
	plans.push({
		status: 503,
		retryAfter: "2",
		headers: Object.fromEntries(
			Array.from({ length: 128 }, (_, index) => [
				`x-owned-${index}`,
				"fixture",
			]),
		),
	});
	expect((await test.request()).status).toBe(503);
	expect(test.transport.serviceBackoff()).toBeUndefined();
	expect(network.https).toHaveBeenCalledOnce();
});

it("rejects oversized headers before admitting service advice", async () => {
	const test = fixture({ limits: { maxHeaderBytes: 512 } });
	plans.push({
		status: 503,
		retryAfter: "2",
		headers: { "x-padding": "x".repeat(512) },
	});
	await expect(test.request()).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.transport.serviceBackoff()).toBeUndefined();
	expect(network.https).toHaveBeenCalledOnce();
	expect(test.transport.metrics()).toMatchObject({ requests: 1, active: 0 });
});

it("observes at header arrival before a held body settles", async () => {
	const test = fixture();
	plans.push({
		status: 503,
		retryAfter: "2",
		holdHeaders: true,
		holdBody: true,
	});
	const request = test.request();
	const settled = vi.fn();
	track(request.then(settled));
	await flush();
	expect(test.transport.serviceBackoff()).toBeUndefined();
	await vi.advanceTimersByTimeAsync(1000);
	exchanges[0].deliver();
	await flush();
	expect(settled).not.toHaveBeenCalled();
	expect(test.transport.serviceBackoff()).toEqual({
		status: 503,
		url: sourceUrl,
		receivedAt: "2026-09-17T12:00:01.000Z",
		retryAfter: {
			kind: "delay-seconds",
			delaySeconds: 2,
			retryAt: "2026-09-17T12:00:03.000Z",
		},
	});
	expect(test.transport.metrics()).toMatchObject({
		requests: 1,
		active: 1,
		encodedBytes: 0,
		decodedBytes: 0,
	});
	exchanges[0].finish();
	expect((await request).status).toBe(503);
	expect(network.https).toHaveBeenCalledOnce();
});

it("retains the first admitted observation and freezes nested advice until close", async () => {
	const test = fixture();
	plans.push(
		{ status: 503, retryAfter: "2", synchronous: true },
		{ status: 503, retryAfter: "8" },
	);
	await test.request();
	const observed = test.transport.serviceBackoff();
	if (!observed) throw new Error("Expected admitted service advice");
	expect(Object.isFrozen(observed)).toBe(true);
	expect(Object.isFrozen(observed.retryAfter)).toBe(true);
	expect(Reflect.set(observed, "url", `${origin}/changed`)).toBe(false);
	expect(Reflect.set(observed.retryAfter, "delaySeconds", 99)).toBe(false);
	expect(Reflect.deleteProperty(observed, "retryAfter")).toBe(false);
	await test.request(`${origin}/second`);
	expect(test.transport.serviceBackoff()).toEqual(expectedObservation());
	expect(exchanges.map(({ time }) => time)).toEqual([0, 0]);
	expect(network.https).toHaveBeenCalledTimes(2);
	test.transport.close();
	expect(test.transport.serviceBackoff()).toBeUndefined();
	expect(observed).toEqual(expectedObservation());
	expect(test.transport.metrics()).toMatchObject({ active: 0, closed: true });
});

it("preserves enabled transport pacing independently of observation capture", async () => {
	const test = fixture({ minRequestIntervalMs: 100 });
	plans.push({ status: 503, retryAfter: "2" }, {});
	await test.request();
	const next = test.request(`${origin}/second`);
	await flush();
	await vi.advanceTimersByTimeAsync(1999);
	expect(network.https).toHaveBeenCalledOnce();
	await vi.advanceTimersByTimeAsync(1);
	expect((await next).status).toBe(200);
	expect(exchanges.map(({ time }) => time)).toEqual([0, 2000]);
	expect(test.transport.serviceBackoff()).toEqual(expectedObservation());
	expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 0 });
});

it("captures observation before pacer defer throws", async () => {
	const test = fixture({ minRequestIntervalMs: 100 });
	const failure = new AgentBrowserError(
		"resource-limit",
		"Owned defer failure",
	);
	vi.spyOn(OriginRequestPacer.prototype, "defer").mockImplementation(() => {
		throw failure;
	});
	plans.push({ status: 503, retryAfter: "2" });
	await expect(test.request()).rejects.toBe(failure);
	expect(test.transport.serviceBackoff()).toEqual(expectedObservation());
	expect(network.https).toHaveBeenCalledOnce();
	expect(test.transport.metrics()).toMatchObject({ requests: 1, active: 0 });
});

it.each([undefined, 100])(
	"retains advice after body byte-limit failure with interval=%s",
	async (interval) => {
		const test = fixture({
			minRequestIntervalMs: interval,
			limits: { maxResponseBytes: 2 },
		});
		plans.push({ status: 503, retryAfter: "2", body: "oversized" });
		await expect(test.request()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.transport.serviceBackoff()).toEqual(expectedObservation());
		expect(test.transport.metrics()).toMatchObject({
			requests: 1,
			encodedBytes: 9,
			active: 0,
		});
		expect(network.https).toHaveBeenCalledOnce();
		test.transport.close();
		expect(test.transport.serviceBackoff()).toBeUndefined();
	},
);

it.each([undefined, 100])(
	"retains advice after abrupt body failure with interval=%s",
	async (interval) => {
		const test = fixture({ minRequestIntervalMs: interval });
		plans.push({
			status: 503,
			retryAfter: "2",
			bodyError: Object.assign(new Error("Owned body interruption"), {
				code: "ECONNRESET",
			}),
		});
		await expect(test.request()).rejects.toMatchObject({
			code: "network-error",
		});
		expect(test.transport.serviceBackoff()).toEqual(expectedObservation());
		expect(test.transport.metrics()).toMatchObject({ requests: 1, active: 0 });
		expect(network.https).toHaveBeenCalledOnce();
	},
);

it.each(["aborted", "closed"] as const)(
	"cleans up a held body on %s",
	async (code) => {
		const test = fixture();
		plans.push({ status: 503, retryAfter: "2", holdBody: true });
		const request = test.request();
		await flush();
		expect(test.transport.serviceBackoff()).toEqual(expectedObservation());
		if (code === "aborted") controller.abort();
		else test.transport.close();
		await expect(request).rejects.toMatchObject({ code });
		expect(test.transport.serviceBackoff()).toEqual(
			code === "closed" ? undefined : expectedObservation(),
		);
		expect(test.transport.metrics()).toMatchObject({
			active: 0,
			closed: code === "closed",
		});
		expect(network.https).toHaveBeenCalledOnce();
	},
);

it("does not treat routed mock responses as HTTP header observations", async () => {
	const test = fixture();
	const result = await track(
		test.transport.requestWithRoutes(
			{ url: sourceUrl, signal: controller.signal },
			() => ({
				url: sourceUrl,
				status: 503,
				headers: { "retry-after": ["2"] },
				body: new TextEncoder().encode("owned routed body"),
				encodedBytes: 0,
				redirects: [],
				elapsedMs: 0,
			}),
		),
	);
	expect(result.status).toBe(503);
	expect(test.transport.serviceBackoff()).toBeUndefined();
	expect(network.https).not.toHaveBeenCalled();
	expect(test.transport.metrics()).toMatchObject({
		requests: 1,
		mockedRequests: 1,
		active: 0,
	});
});

it.each(
	[false, true].flatMap((reader) =>
		[0, 100].map((interval) => ({ reader, interval })),
	),
)(
	"stops research after header-observed 503 then body failure (reader=$reader, interval=$interval)",
	async ({ reader, interval }) => {
		plans.push({
			status: 503,
			retryAfter: "2",
			headers: { "content-type": "text/html" },
			bodyError: Object.assign(new Error("PRIVATE_BODY_FAILURE"), {
				code: "ECONNRESET",
			}),
		});
		const iterator = researchBatch(
			[
				...(reader ? ["--reader"] : []),
				"--capture-body",
				"--min-request-interval-ms",
				String(interval),
				sourceUrl,
				`${origin}/unused`,
			],
			controller.signal,
		);
		batches.push(iterator);
		const first = await track(iterator.next());
		if (first.done) throw new Error("Expected body-failure report");
		const report = first.value;
		expect(report.serviceBackoff).toEqual({
			kind: "http-service-backoff",
			status: 503,
			url: `${origin}/first?redacted`,
			receivedAt,
			action: "stop-without-retry",
			retryAfter: { kind: "delay-seconds", delaySeconds: 2, retryAt },
		});
		expect(report.failure).toMatchObject({
			category: "network-error",
			stage: "network",
		});
		expect(report.contentSuccess).toBe(false);
		expect(report).not.toHaveProperty("rateLimit");
		expect(report).not.toHaveProperty("bodyCapture");
		expect(report.extraction).toBeUndefined();
		expect(report.headings).toBeUndefined();
		expect(report.textLines).toBeUndefined();
		expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		expect(extraction.extractDocument).not.toHaveBeenCalled();
		expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
		expect(JSON.stringify(report)).not.toContain("PRIVATE_");
		expect(report.metrics).toMatchObject({
			requests: 1,
			active: 0,
			closed: true,
		});
		expect(await track(iterator.next())).toEqual({
			done: true,
			value: undefined,
		});
		await vi.advanceTimersByTimeAsync(3000);
		expect(network.https).toHaveBeenCalledOnce();
		expect(exchanges[0].options.method).toBe("GET");
		expect(vi.getTimerCount()).toBe(0);
		for (const transport of vi.mocked(NodeNetworkTransport.prototype.close).mock
			.contexts)
			if (transport instanceof NodeNetworkTransport)
				expect(transport.serviceBackoff()).toBeUndefined();
	},
);

it.each([
	{ name: "native", reader: false },
	{ name: "reader", reader: true },
])(
	"retains header-time service advice when outer $name navigation aborts during a held body",
	async ({ reader }) => {
		const request = vi.spyOn(NodeNetworkTransport.prototype, "request");
		const sessionClose = vi.spyOn(BrowserSession.prototype, "close");
		plans.push({
			status: 503,
			retryAfter: "2",
			headers: { "content-type": "text/html" },
			holdBody: true,
		});
		const navigation = track(
			researchNavigation(sourceUrl, reader, controller.signal, undefined, true),
		);
		const settled = vi.fn();
		track(navigation.then(settled));
		await flush();
		expect(request).toHaveBeenCalledOnce();
		expect(network.https).toHaveBeenCalledOnce();
		expect(settled).not.toHaveBeenCalled();
		const transport = request.mock.contexts[0];
		if (!(transport instanceof NodeNetworkTransport))
			throw new Error("Expected native research transport");
		expect(transport.serviceBackoff()).toEqual(expectedObservation());
		expect(transport.metrics()).toMatchObject({
			requests: 1,
			active: 1,
			closed: false,
			encodedBytes: 0,
			decodedBytes: 0,
		});
		controller.abort(new AgentBrowserError("aborted", "Owned held-body abort"));
		const report = await navigation;
		expect(report.serviceBackoff).toEqual({
			kind: "http-service-backoff",
			status: 503,
			url: `${origin}/first?redacted`,
			receivedAt,
			action: "stop-without-retry",
			retryAfter: { kind: "delay-seconds", delaySeconds: 2, retryAt },
		});
		expect(report.failure).toMatchObject({
			category: "aborted",
			stage: "network",
		});
		expect(report.contentSuccess).toBe(false);
		expect(report).not.toHaveProperty("rateLimit");
		expect(report).not.toHaveProperty("bodyCapture");
		expect(report.extraction).toBeUndefined();
		expect(report.headings).toBeUndefined();
		expect(report.textLines).toBeUndefined();
		expect(browserLoader.loadBrowserDocument).not.toHaveBeenCalled();
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		expect(extraction.extractDocument).not.toHaveBeenCalled();
		expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
		expect(JSON.stringify(report)).not.toContain("PRIVATE_");
		expect(report.metrics).toMatchObject({ requests: 1, closed: true });
		expect(sessionClose).toHaveBeenCalledOnce();
		await Promise.allSettled([request.mock.results[0].value]);
		expect(transport.serviceBackoff()).toBeUndefined();
		expect(transport.metrics()).toMatchObject({
			requests: 1,
			active: 0,
			closed: true,
		});
		expect(streams).toHaveLength(1);
		expect(streams[0].destroyed).toBe(true);
		await vi.advanceTimersByTimeAsync(3000);
		expect(request).toHaveBeenCalledOnce();
		expect(network.https).toHaveBeenCalledOnce();
		expect(exchanges[0].options.method).toBe("GET");
		expect(vi.getTimerCount()).toBe(0);
	},
);
