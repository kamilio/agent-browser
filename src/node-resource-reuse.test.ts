import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CookieJar, type CookieRequestContext } from "./cookies.js";
import { NetworkRoutes } from "./network-routes.js";
import type {
	NetworkMetrics,
	NetworkRequest,
	NetworkResponse,
	NetworkRouteResolver,
} from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import { ResponseByteAccounting } from "./response-byte-accounting.js";

const network = vi.hoisted(() => {
	const blocked = vi.fn(() => {
		throw new Error(
			"Actual network access is forbidden in resource reuse tests",
		);
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
	return { request: vi.fn(), blocked, dns };
});

vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: network.request,
	get: network.blocked,
	createServer: network.blocked,
}));

vi.mock("node:https", async (original) => ({
	...(await original<typeof import("node:https")>()),
	request: network.request,
	get: network.blocked,
	createServer: network.blocked,
}));

vi.mock("node:dns", () => ({ ...network.dns, promises: network.dns }));
vi.mock("node:dns/promises", () => network.dns);

const origin = "https://reuse.example";
const assetUrl = `${origin}/asset.css`;
const assetBody = "body{color:red}";
const assetBytes = Buffer.byteLength(assetBody);
const publicAddress = "93.184.216.34";
const cookieContext: CookieRequestContext = {
	siteUrl: `${origin}/page`,
	credentials: "omit",
	topLevelNavigation: false,
	crossSiteRedirect: false,
};
const transports: NodeNetworkTransport[] = [];
const jars: CookieJar[] = [];
const pending: Promise<unknown>[] = [];
const streams: Readable[] = [];
const plans: { body?: string; contentType?: string; deferred?: boolean }[] = [];
const exchanges: {
	options: RequestOptions;
	deliver: () => void;
	destroy: ReturnType<typeof vi.fn>;
}[] = [];

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	vi.setSystemTime(new Date("2026-09-14T12:00:00.000Z"));
	network.request.mockImplementation(
		(
			options: RequestOptions,
			callback: (response: IncomingMessage) => void,
		) => {
			expect(options.hostname).toBe(publicAddress);
			expect(options.agent).toBe(false);
			const plan = plans.shift() ?? {};
			const headers = {
				"content-type": plan.contentType ?? "text/css",
				"cache-control": "public, max-age=3600",
				date: new Date().toUTCString(),
			};
			const response = Object.assign(
				Readable.from([Buffer.from(plan.body ?? assetBody)], {
					objectMode: false,
				}),
				{
					statusCode: 200,
					headers,
					rawHeaders: Object.entries(headers).flat(),
				},
			);
			streams.push(response);
			const deliver = () => callback(response as unknown as IncomingMessage);
			const request = Object.assign(new EventEmitter(), {
				destroy: vi.fn(() => request),
				end: vi.fn(() => {
					if (!plan.deferred) queueMicrotask(deliver);
					return request;
				}),
			});
			exchanges.push({ options, deliver, destroy: request.destroy });
			return request;
		},
	);
});

afterEach(async () => {
	for (const transport of transports.splice(0)) transport.close();
	for (const stream of streams.splice(0)) stream.destroy();
	await Promise.allSettled(pending.splice(0));
	for (const jar of jars.splice(0)) jar.close();
	plans.splice(0);
	exchanges.splice(0);
	expect(network.blocked).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function track<Result>(promise: Promise<Result>): Promise<Result> {
	void promise.catch(() => undefined);
	pending.push(promise);
	return promise;
}

function resource(overrides: Partial<NetworkRequest> = {}): NetworkRequest {
	return {
		url: assetUrl,
		resourceReuse: "stylesheet",
		method: "GET",
		redirect: "manual",
		cookieContext: { ...cookieContext },
		...overrides,
	};
}

function fixture(options: NodeTransportOptions = { resourceCache: {} }) {
	const jar = new CookieJar();
	jars.push(jar);
	const resolver = vi.fn(async (_hostname: string, _signal: AbortSignal) => [
		publicAddress,
	]);
	const transport = new NodeNetworkTransport({
		...options,
		cookieJar: jar,
		resolver,
	});
	transports.push(transport);
	const request = (overrides: Partial<NetworkRequest> = {}) =>
		track(transport.request(resource(overrides)));
	return { transport, resolver, jar, request };
}

function expectNetwork(
	transport: NodeNetworkTransport,
	expected: Partial<NetworkMetrics> = {},
) {
	const { cacheHits, cachedDecodedBytes, cacheEntries, cacheBytes, ...actual } =
		transport.metrics();
	expect(actual).toEqual({
		requests: 0,
		redirects: 0,
		encodedBytes: 0,
		decodedBytes: 0,
		mockedRequests: 0,
		mockedDecodedBytes: 0,
		active: 0,
		closed: false,
		...expected,
	});
	if (!transport.resourceReuse)
		expect([cacheHits, cachedDecodedBytes, cacheEntries, cacheBytes]).toEqual([
			undefined,
			undefined,
			undefined,
			undefined,
		]);
}

function expectCache(
	transport: NodeNetworkTransport,
	cacheHits: number,
	cachedDecodedBytes: number,
	cacheEntries: number,
) {
	expect(transport.metrics()).toMatchObject({
		cacheHits,
		cachedDecodedBytes,
		cacheEntries,
		cacheBytes: cacheEntries === 0 ? 0 : expect.any(Number),
	});
	if (cacheEntries > 0) {
		expect(transport.metrics().cacheBytes).toBeGreaterThan(0);
		expect(transport.metrics().cacheBytes).toBeLessThanOrEqual(2_097_152);
	}
}

it.each([{}, { resourceCache: undefined }])(
	"keeps repeat requests and the metrics shape unchanged when disabled: %j",
	async (options) => {
		const test = fixture(options);
		expect(test.transport.resourceReuse).toBe(false);
		const first = await test.request();
		const second = await test.request();
		expect(second).toEqual(first);
		expect(second).not.toHaveProperty("delivery");
		expect(second.body).toEqual(Buffer.from(assetBody));
		expect(second.encodedBytes).toBe(assetBytes);
		expect(test.resolver).toHaveBeenCalledTimes(2);
		expect(network.request).toHaveBeenCalledTimes(2);
		expectNetwork(test.transport, {
			requests: 2,
			encodedBytes: 2 * assetBytes,
			decodedBytes: 2 * assetBytes,
		});
	},
);

it.each([
	["stylesheet", "text/css", assetBody],
	["image", "image/svg+xml", "<svg/>"],
] as const)(
	"reuses fresh %s bytes without another exchange or transfer debit",
	async (resourceReuse, contentType, body) => {
		const test = fixture();
		plans.push({ contentType, body });
		const first = await test.request({ resourceReuse });
		const before = test.transport.metrics();
		expect(test.transport.resourceReuse).toBe(true);
		expect(first).toEqual({
			url: assetUrl,
			status: 200,
			headers: {
				"content-type": [contentType],
				"cache-control": ["public, max-age=3600"],
				date: ["Mon, 14 Sep 2026 12:00:00 GMT"],
			},
			body: Buffer.from(body),
			redirects: [],
			encodedBytes: Buffer.byteLength(body),
			elapsedMs: 0,
		});
		expectCache(test.transport, 0, 0, 1);
		const second = await test.request({ resourceReuse });
		expect(second).toEqual({
			...first,
			headers: { ...first.headers, age: ["0"] },
			body: new Uint8Array(Buffer.from(body)),
			encodedBytes: 0,
			delivery: "memory-cache",
		});
		expect(second.body).not.toBe(first.body);
		expect(second.headers).not.toBe(first.headers);
		expect(second.headers["content-type"]).not.toBe(
			first.headers["content-type"],
		);
		expect(test.transport.metrics()).toEqual({
			...before,
			cacheHits: 1,
			cachedDecodedBytes: Buffer.byteLength(body),
		});
		expectNetwork(test.transport, {
			requests: 1,
			encodedBytes: Buffer.byteLength(body),
			decodedBytes: Buffer.byteLength(body),
		});
		expect(test.resolver).toHaveBeenCalledTimes(1);
		expect(network.request).toHaveBeenCalledTimes(1);
	},
);

it("isolates both network and cached response mutations from retained bytes", async () => {
	const test = fixture();
	const first = await test.request();
	first.body.fill(0);
	const second = await test.request();
	expect(second.body).toEqual(new Uint8Array(Buffer.from(assetBody)));
	second.body.fill(1);
	Reflect.set(second.headers["content-type"], "0", "text/plain");
	const third = await test.request();
	expect(third.body).toEqual(new Uint8Array(Buffer.from(assetBody)));
	expect(third.headers["content-type"]).toEqual(["text/css"]);
	expect(third.headers["content-type"]).not.toBe(
		second.headers["content-type"],
	);
	expectCache(test.transport, 2, 2 * assetBytes, 1);
	expect(network.request).toHaveBeenCalledTimes(1);
});

const excludedRequests: [string, Partial<NetworkRequest>][] = [
	["missing hint", { resourceReuse: undefined }],
	["default redirect", { redirect: undefined }],
	["follow redirect", { redirect: "follow" }],
	["error redirect", { redirect: "error" }],
	["missing context", { cookieContext: undefined }],
	[
		"include credentials",
		{ cookieContext: { ...cookieContext, credentials: "include" } },
	],
	[
		"same-origin credentials",
		{ cookieContext: { ...cookieContext, credentials: "same-origin" } },
	],
	[
		"top-level navigation",
		{ cookieContext: { ...cookieContext, topLevelNavigation: true } },
	],
	[
		"cross-site redirect",
		{ cookieContext: { ...cookieContext, crossSiteRedirect: true } },
	],
	["missing site", { cookieContext: { ...cookieContext, siteUrl: null } }],
	[
		"different site origin",
		{
			cookieContext: {
				...cookieContext,
				siteUrl: "https://other.example/page",
			},
		},
	],
	[
		"different site port",
		{
			cookieContext: {
				...cookieContext,
				siteUrl: "https://reuse.example:8443/page",
			},
		},
	],
	["HEAD method", { method: "HEAD" }],
	["OPTIONS method", { method: "OPTIONS" }],
];

it.each(excludedRequests)(
	"bypasses existing reuse for %s",
	async (_name, overrides) => {
		const test = fixture();
		await test.request();
		const before = test.transport.metrics();
		const response = await test.request(overrides);
		const bytes = overrides.method === "HEAD" ? 0 : assetBytes;
		expect(response).not.toHaveProperty("delivery");
		expect(Buffer.from(response.body)).toEqual(
			Buffer.from(bytes === 0 ? "" : assetBody),
		);
		expect(response.encodedBytes).toBe(bytes);
		expectCache(test.transport, 0, 0, 1);
		expect(test.transport.metrics().cacheBytes).toBe(before.cacheBytes);
		expectNetwork(test.transport, {
			requests: 2,
			encodedBytes: assetBytes + bytes,
			decodedBytes: assetBytes + bytes,
		});
		expect(test.resolver).toHaveBeenCalledTimes(2);
		expect(network.request).toHaveBeenCalledTimes(2);
	},
);

it("does not admit HTTP resources even with a same-origin omit context", async () => {
	const test = fixture();
	const input = {
		url: "http://reuse.example/asset.css",
		cookieContext: { ...cookieContext, siteUrl: "http://reuse.example/page" },
	};
	await test.request(input);
	const second = await test.request(input);
	expect(second).not.toHaveProperty("delivery");
	expect(second.encodedBytes).toBe(assetBytes);
	expect(exchanges.map(({ options }) => options.port)).toEqual([80, 80]);
	expectCache(test.transport, 0, 0, 0);
	expectNetwork(test.transport, {
		requests: 2,
		encodedBytes: 2 * assetBytes,
		decodedBytes: 2 * assetBytes,
	});
});

it("preserves explicit credentials instead of rewriting them to permit reuse", async () => {
	const test = fixture();
	test.jar.setCookie(
		assetUrl,
		"session=synthetic; Secure; Path=/",
		cookieContext,
	);
	await test.request();
	await test.request({
		cookieContext: { ...cookieContext, credentials: "include" },
	});
	expect(exchanges[0].options.headers).not.toHaveProperty("cookie");
	expect(exchanges[1].options.headers).toHaveProperty(
		"cookie",
		"session=synthetic",
	);
	expect((await test.request()).delivery).toBe("memory-cache");
	expectCache(test.transport, 1, assetBytes, 1);
	expect(network.request).toHaveBeenCalledTimes(2);
});

it.each([
	[
		"URL credentials",
		{ url: "https://user:pass@reuse.example/asset.css" },
		"policy-denied",
	],
	["URL scheme", { url: "file:///asset.css" }, "policy-denied"],
	[
		"blocked origin",
		{ url: "https://other.example/asset.css" },
		"policy-denied",
	],
	["private address", { url: "https://127.0.0.1/asset.css" }, "policy-denied"],
	[
		"controlled header",
		{ headers: { host: "reuse.example" } },
		"policy-denied",
	],
	[
		"cookie header",
		{ headers: { cookie: "session=synthetic" } },
		"policy-denied",
	],
	[
		"malformed header",
		{ headers: { accept: "text/css\r\ninjected: yes" } },
		"invalid-input",
	],
	["GET body", { body: "" }, "invalid-input"],
	["forbidden method", { method: "CONNECT" }, "policy-denied"],
] as const)(
	"runs %s policy before any reuse or route resolution",
	async (_name, overrides, code) => {
		const test = fixture({ resourceCache: {}, allowedOrigins: [origin] });
		await test.request();
		const before = test.transport.metrics();
		const resolve = vi.fn<NetworkRouteResolver>(() => undefined);
		await expect(
			test.transport.requestWithRoutes(resource(overrides), resolve),
		).rejects.toMatchObject({ code });
		expect(resolve).not.toHaveBeenCalled();
		expect(test.transport.metrics()).toEqual(before);
		expect(test.resolver).toHaveBeenCalledTimes(1);
		expect(network.request).toHaveBeenCalledTimes(1);
	},
);

it("consults routes on hits and reports the current request elapsed time", async () => {
	const test = fixture();
	await test.request();
	vi.advanceTimersByTime(1000);
	const resolve = vi.fn<NetworkRouteResolver>(() => {
		vi.advanceTimersByTime(25);
		return undefined;
	});
	const result = await test.transport.requestWithRoutes(resource(), resolve);
	expect(resolve).toHaveBeenCalledExactlyOnceWith({
		url: assetUrl,
		method: "GET",
		signal: expect.any(AbortSignal),
	});
	expect(result).toMatchObject({
		delivery: "memory-cache",
		elapsedMs: 25,
		encodedBytes: 0,
		headers: { age: ["1"] },
	});
	expect(result).not.toHaveProperty("routeId");
	expectCache(test.transport, 1, assetBytes, 1);
	expectNetwork(test.transport, {
		requests: 1,
		encodedBytes: assetBytes,
		decodedBytes: assetBytes,
	});
	expect(test.resolver).toHaveBeenCalledTimes(1);
});

it.each(["stylesheet", undefined] as const)(
	"gives fulfilled routes precedence and invalidates stored bytes with hint %s",
	async (resourceReuse) => {
		const test = fixture();
		await test.request();
		const routes = new NetworkRoutes();
		try {
			const route = routes.add("**/asset.css", {
				body: "route",
				contentType: "text/css",
			});
			const result = await test.transport.requestWithRoutes(
				resource({ resourceReuse }),
				(input) => routes.fulfill(input),
			);
			expect(result).toMatchObject({
				routeId: route.id,
				body: new Uint8Array(Buffer.from("route")),
				encodedBytes: 0,
			});
			expect(result).not.toHaveProperty("delivery");
			expectCache(test.transport, 0, 0, 0);
			expectNetwork(test.transport, {
				requests: 2,
				encodedBytes: assetBytes,
				decodedBytes: assetBytes + 5,
				mockedRequests: 1,
				mockedDecodedBytes: 5,
			});
			expect(network.request).toHaveBeenCalledTimes(1);
			expect((await test.request()).delivery).toBeUndefined();
			expect(network.request).toHaveBeenCalledTimes(2);
			expectCache(test.transport, 0, 0, 1);
		} finally {
			routes.close();
		}
	},
);

it("serves a hit after the HTTP request budget is exhausted but rejects a miss", async () => {
	const test = fixture({ resourceCache: {}, limits: { maxRequests: 1 } });
	await test.request();
	expect((await test.request()).delivery).toBe("memory-cache");
	const before = test.transport.metrics();
	await expect(
		test.request({ url: `${origin}/other.css` }),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.transport.metrics()).toEqual(before);
	expectCache(test.transport, 1, assetBytes, 1);
	expectNetwork(test.transport, {
		requests: 1,
		encodedBytes: assetBytes,
		decodedBytes: assetBytes,
	});
	expect(network.request).toHaveBeenCalledTimes(1);
});

it.each([0, assetBytes - 1])(
	"enforces a caller cap of %i on a cached resource through the normal miss path",
	async (maxResponseBytes) => {
		const test = fixture();
		await test.request();
		await expect(test.request({ maxResponseBytes })).rejects.toMatchObject({
			code: "resource-limit",
		});
		expectCache(test.transport, 0, 0, 1);
		expectNetwork(test.transport, {
			requests: 2,
			encodedBytes: 2 * assetBytes,
			decodedBytes: assetBytes,
		});
		expect(network.request).toHaveBeenCalledTimes(2);
		const bounded = await test.request({ maxResponseBytes: assetBytes });
		expect(bounded.body).toEqual(new Uint8Array(Buffer.from(assetBody)));
		expect(bounded.delivery).toBe("memory-cache");
		expectCache(test.transport, 1, assetBytes, 1);
		expect(network.request).toHaveBeenCalledTimes(2);
	},
);

it("enforces the same byte cap on an uncached response without inserting it", async () => {
	const test = fixture();
	await expect(
		test.request({ maxResponseBytes: assetBytes - 1 }),
	).rejects.toMatchObject({ code: "resource-limit" });
	expectCache(test.transport, 0, 0, 0);
	expectNetwork(test.transport, { requests: 1, encodedBytes: assetBytes });
	expect((await test.request()).delivery).toBeUndefined();
	expectCache(test.transport, 0, 0, 1);
	expectNetwork(test.transport, {
		requests: 2,
		encodedBytes: 2 * assetBytes,
		decodedBytes: assetBytes,
	});
});

it("excludes response-accounted requests from both reuse and insertion", async () => {
	const test = fixture();
	const accounting = new ResponseByteAccounting(1024, 2);
	try {
		await test.request();
		for (const url of [assetUrl, `${origin}/accounted.css`]) {
			const lease = accounting.createLease();
			const result = await test.request({ url, responseAccounting: lease });
			expect(result.delivery).toBeUndefined();
			expect(result.encodedBytes).toBe(assetBytes);
			accounting.settle(lease, result.body.byteLength);
		}
		expect(accounting.metrics()).toMatchObject({
			observedEncodedBytes: 2 * assetBytes,
			observedDecodedBytes: 2 * assetBytes,
			nativeRequests: 2,
			outstanding: 0,
			draining: 0,
		});
		expectCache(test.transport, 0, 0, 1);
		expect(
			(await test.request({ url: `${origin}/accounted.css` })).delivery,
		).toBeUndefined();
		expectCache(test.transport, 0, 0, 2);
		expectNetwork(test.transport, {
			requests: 4,
			encodedBytes: 4 * assetBytes,
			decodedBytes: 4 * assetBytes,
		});
	} finally {
		accounting.close();
	}
});

it("rejects a pre-aborted hit without changing cache or network counters", async () => {
	const test = fixture();
	await test.request();
	const before = test.transport.metrics();
	const controller = new AbortController();
	controller.abort();
	await expect(
		test.request({ signal: controller.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(test.transport.metrics()).toEqual(before);
	expect(network.request).toHaveBeenCalledTimes(1);
});

it.each(["abort", "close"] as const)(
	"does not deliver a cached response after a resolver-triggered %s",
	async (operation) => {
		const test = fixture();
		await test.request();
		const controller = new AbortController();
		const resolve = vi.fn<NetworkRouteResolver>(() => {
			if (operation === "abort") controller.abort();
			else test.transport.close();
			return undefined;
		});
		await expect(
			test.transport.requestWithRoutes(
				resource({ signal: controller.signal }),
				resolve,
			),
		).rejects.toMatchObject({
			code: operation === "abort" ? "aborted" : "closed",
		});
		expect(resolve).toHaveBeenCalledTimes(1);
		expectCache(test.transport, 0, 0, operation === "abort" ? 1 : 0);
		expectNetwork(test.transport, {
			requests: 1,
			encodedBytes: assetBytes,
			decodedBytes: assetBytes,
			closed: operation === "close",
		});
		expect(network.request).toHaveBeenCalledTimes(1);
	},
);

it.each(["abort", "close"] as const)(
	"rejects an in-flight %s and discards its late response",
	async (operation) => {
		const test = fixture();
		const controller = new AbortController();
		plans.push({ deferred: true });
		const result = test.request({ signal: controller.signal });
		await vi.advanceTimersByTimeAsync(0);
		expect(exchanges).toHaveLength(1);
		if (operation === "abort") controller.abort();
		else test.transport.close();
		await expect(result).rejects.toMatchObject({
			code: operation === "abort" ? "aborted" : "closed",
		});
		expect(exchanges[0].destroy).toHaveBeenCalledTimes(1);
		exchanges[0].deliver();
		await vi.advanceTimersByTimeAsync(0);
		expectCache(test.transport, 0, 0, 0);
		expectNetwork(test.transport, {
			requests: 1,
			closed: operation === "close",
		});
		if (operation === "close") {
			await expect(test.request()).rejects.toMatchObject({ code: "closed" });
			expect(network.request).toHaveBeenCalledTimes(1);
		} else {
			expect((await test.request()).delivery).toBeUndefined();
			expect(network.request).toHaveBeenCalledTimes(2);
			expectCache(test.transport, 0, 0, 1);
		}
	},
);

it.each(["POST", "PUT", "PATCH", "DELETE"])(
	"clears existing entries for unsafe %s requests",
	async (method) => {
		const test = fixture();
		await test.request();
		const result = await test.request({ method, body: "change" });
		expect(result.delivery).toBeUndefined();
		expectCache(test.transport, 0, 0, 0);
		expect((await test.request()).delivery).toBeUndefined();
		expectCache(test.transport, 0, 0, 1);
		expectNetwork(test.transport, {
			requests: 3,
			encodedBytes: 3 * assetBytes,
			decodedBytes: 3 * assetBytes,
		});
		expect(network.request).toHaveBeenCalledTimes(3);
	},
);

it("prevents a GET started before an unsafe method from repopulating the cache", async () => {
	const test = fixture();
	await test.request();
	plans.push({ deferred: true });
	const lateUrl = `${origin}/late.css`;
	const late = test.request({ url: lateUrl });
	await vi.advanceTimersByTimeAsync(0);
	expect(exchanges).toHaveLength(2);
	await test.request({ method: "POST", body: "change" });
	expectCache(test.transport, 0, 0, 0);
	exchanges[1].deliver();
	expect((await late).body).toEqual(Buffer.from(assetBody));
	expectCache(test.transport, 0, 0, 0);
	expect((await test.request({ url: lateUrl })).delivery).toBeUndefined();
	expectCache(test.transport, 0, 0, 1);
	expectNetwork(test.transport, {
		requests: 4,
		encodedBytes: 4 * assetBytes,
		decodedBytes: 4 * assetBytes,
	});
	expect(network.request).toHaveBeenCalledTimes(4);
});

it("keeps retained bytes, counters, and closure independent across transports", async () => {
	const first = fixture();
	const second = fixture();
	await first.request();
	expectCache(second.transport, 0, 0, 0);
	expectNetwork(second.transport);
	expect((await second.request()).delivery).toBeUndefined();
	first.transport.close();
	expectCache(first.transport, 0, 0, 0);
	await expect(first.request()).rejects.toMatchObject({ code: "closed" });
	expect((await second.request()).delivery).toBe("memory-cache");
	expectCache(second.transport, 1, assetBytes, 1);
	expectNetwork(second.transport, {
		requests: 1,
		encodedBytes: assetBytes,
		decodedBytes: assetBytes,
	});
	expect(network.request).toHaveBeenCalledTimes(2);
});

it.each([
	["before", "success"],
	["after", "success"],
	["before", "abort"],
	["after", "abort"],
] as const)(
	"invalidates an overlapping GET delivered %s unsafe request %s",
	async (order, completion) => {
		const test = fixture();
		const controller = new AbortController();
		plans.push({ deferred: true });
		const mutation = test.request({
			method: "POST",
			body: "change",
			signal: controller.signal,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(exchanges).toHaveLength(1);
		plans.push({ deferred: true });
		const overlapping = test.request();
		await vi.advanceTimersByTimeAsync(0);
		expect(exchanges).toHaveLength(2);
		if (order === "before") {
			exchanges[1].deliver();
			await overlapping;
			expectCache(test.transport, 0, 0, 1);
		}
		if (completion === "abort") {
			controller.abort();
			await expect(mutation).rejects.toMatchObject({ code: "aborted" });
		} else {
			exchanges[0].deliver();
			await mutation;
		}
		expectCache(test.transport, 0, 0, 0);
		if (order === "after") {
			exchanges[1].deliver();
			await overlapping;
			expectCache(test.transport, 0, 0, 0);
		}
		expect((await test.request()).delivery).toBeUndefined();
		expectCache(test.transport, 0, 0, 1);
		expectNetwork(test.transport, {
			requests: 3,
			encodedBytes: (completion === "success" ? 3 : 2) * assetBytes,
			decodedBytes: (completion === "success" ? 3 : 2) * assetBytes,
		});
		expect(network.request).toHaveBeenCalledTimes(3);
	},
);
