import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CookieJar } from "./cookies.js";
import type { NetworkRequest } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";

const network = vi.hoisted(() => {
	const blocked = vi.fn(() => {
		throw new Error("Actual I/O is forbidden in Retry-After pacing tests");
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

const origin = "https://cooldown.example";
const publicAddress = "93.184.216.34";
const transports: NodeNetworkTransport[] = [];
const jars: CookieJar[] = [];
const pending: Promise<unknown>[] = [];
const streams: Readable[] = [];
const plans: ResponsePlan[] = [];
const exchanges: MockExchange[] = [];

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
	vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
	network.https.mockImplementation(
		(
			options: RequestOptions,
			callback: (response: IncomingMessage) => void,
		) => {
			expect(options.hostname).toBe(publicAddress);
			expect(options.agent).toBe(false);
			expect(options).toMatchObject({ rejectUnauthorized: true });
			expect(options.signal?.aborted).toBe(false);
			const plan = plans.shift() ?? {};
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
				response.push(Buffer.from(plan.body ?? ""));
				response.push(null);
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

function fixture(options: NodeTransportOptions = {}) {
	const resolver = vi.fn(async (_hostname: string, _signal: AbortSignal) => [
		publicAddress,
	]);
	const transport = new NodeNetworkTransport({
		minRequestIntervalMs: 100,
		...options,
		resolver,
	});
	transports.push(transport);
	const request = (path = "/", overrides: Omit<NetworkRequest, "url"> = {}) =>
		track(
			transport.request({
				...overrides,
				url: new URL(path, origin).href,
			}),
		);
	return { transport, resolver, request };
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

async function expectDelayed<Result>(
	promise: Promise<Result>,
	delayMs: number,
) {
	await flush();
	const starts = exchanges.length;
	await vi.advanceTimersByTimeAsync(delayMs - 1);
	expect(exchanges).toHaveLength(starts);
	await vi.advanceTimersByTimeAsync(1);
	const result = await promise;
	expect(exchanges).toHaveLength(starts + 1);
	return result;
}

it.each([
	[429, "delta"],
	[503, "delta"],
	[429, "date"],
	[503, "date"],
] as const)(
	"observes %s %s advice at header arrival before a slow body, without retrying",
	async (status, kind) => {
		const test = fixture();
		const retryAfter =
			kind === "delta" ? "2" : new Date(Date.now() + 3000).toUTCString();
		plans.push({
			status,
			retryAfter,
			body: "original response",
			holdHeaders: true,
			holdBody: true,
		});
		const original = test.request("/limited");
		const settled = vi.fn();
		track(original.then(settled));
		await flush();
		await vi.advanceTimersByTimeAsync(1000);
		exchanges[0].deliver();
		await flush();
		expect(test.transport.metrics()).toMatchObject({
			encodedBytes: 0,
			decodedBytes: 0,
			active: 1,
		});
		await expectDelayed(test.request("/next"), 2000);
		expect(exchanges.map(({ time }) => time)).toEqual([0, 3000]);
		expect(settled).not.toHaveBeenCalled();
		exchanges[0].finish();
		const result = await original;
		expect(result).toMatchObject({
			status,
			url: `${origin}/limited`,
			headers: { "retry-after": [retryAfter] },
			redirects: [],
			encodedBytes: 17,
		});
		expect(Buffer.from(result.body).toString()).toBe("original response");
		await vi.advanceTimersByTimeAsync(2000);
		expect(network.https).toHaveBeenCalledTimes(2);
		expect(test.transport.metrics()).toMatchObject({
			requests: 2,
			redirects: 0,
			mockedRequests: 0,
			encodedBytes: 17,
			decodedBytes: 17,
			active: 0,
		});
	},
);

it("retains cooldowns observed synchronously inside request.end startup", async () => {
	const test = fixture();
	plans.push({ status: 429, retryAfter: "2", synchronous: true });
	await test.request();
	await expectDelayed(test.request("/next"), 2000);
	expect(exchanges.map(({ time }) => time)).toEqual([0, 2000]);
});

it("re-arms an already queued grant and preserves FIFO and minimum spacing", async () => {
	const test = fixture();
	plans.push({ status: 503, retryAfter: "2", holdHeaders: true });
	const original = test.request("/first");
	await flush();
	const second = test.request("/second");
	await flush();
	await vi.advanceTimersByTimeAsync(50);
	exchanges[0].deliver();
	await original;
	const third = test.request("/third");
	await expectDelayed(second, 2000);
	await expectDelayed(third, 100);
	expect(exchanges.map(({ options, time }) => [options.path, time])).toEqual([
		["/first", 0],
		["/second", 2050],
		["/third", 2150],
	]);
});

it.each([
	[429, "1", 3100],
	[503, "5", 5200],
	[200, "20", 3100],
] as const)(
	"keeps in-flight work and merges late %s advice %s to deadline %s",
	async (status, retryAfter, deadline) => {
		const test = fixture();
		plans.push(
			{ status, retryAfter, holdHeaders: true },
			{ status: 503, retryAfter: "3" },
		);
		const first = test.request("/slow-headers");
		await flush();
		await expectDelayed(test.request("/already-starting"), 100);
		const queued = test.request("/queued");
		await flush();
		await vi.advanceTimersByTimeAsync(100);
		exchanges[0].deliver();
		await first;
		await expectDelayed(queued, deadline - 200);
		expect(exchanges.map(({ time }) => time)).toEqual([0, 100, deadline]);
	},
);

it("isolates cooldowns from other hosts and other ports on the same host", async () => {
	const test = fixture();
	plans.push({ status: 429, retryAfter: "2" });
	await test.request();
	const waiting = test.request("/waiting");
	await test.request("https://other.example/independent");
	await test.request("https://cooldown.example:8443/independent");
	expect(exchanges.map(({ time }) => time)).toEqual([0, 0, 0]);
	await expectDelayed(waiting, 2000);
});

it.each(["aborted", "closed", "timeout"] as const)(
	"cancels a 24-hour cooldown waiter with %s before HTTPS starts",
	async (code) => {
		const test = fixture({ limits: { timeoutMs: 500 } });
		plans.push({ status: 503, retryAfter: "86400" });
		await test.request();
		const controller = new AbortController();
		const waiting = test.request("/waiting", { signal: controller.signal });
		await flush();
		expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 1 });
		if (code === "aborted") controller.abort();
		else if (code === "closed") test.transport.close();
		else await vi.advanceTimersByTimeAsync(500);
		await expect(waiting).rejects.toMatchObject({ code });
		await vi.advanceTimersByTimeAsync(1000);
		expect(network.https).toHaveBeenCalledTimes(1);
		expect(test.transport.metrics()).toMatchObject({
			requests: 2,
			active: 0,
			closed: code === "closed",
		});
	},
);

it.each([
	["negative", "-1"],
	["fractional", "1.5"],
	["exponent", "1e2"],
	["empty", ""],
	["combined", "2, 3"],
	["ambiguous duplicates", ["2", "3"]],
	["too many duplicates", Array.from({ length: 17 }, () => "2")],
	["oversized value", "2".repeat(129)],
	["over one day", "86401"],
	["unsafe integer", "9007199254740992"],
	["unsupported date", "2026-09-15T12:00:02Z"],
	["date over one day", "Wed, 16 Sep 2026 12:00:01 GMT"],
] as const)(
	"ignores %s advice without changing normal pacing",
	async (_name, advice) => {
		const test = fixture();
		plans.push({ status: 429, retryAfter: advice });
		const result = await test.request();
		expect(result.status).toBe(429);
		await expectDelayed(test.request("/next"), 100);
		expect(exchanges.map(({ time }) => time)).toEqual([0, 100]);
	},
);

it.each([200, 404, 302])(
	"does not establish cooldowns from status %s",
	async (status) => {
		const test = fixture();
		plans.push({
			status,
			retryAfter: "20",
			...(status === 302 ? { headers: { location: "/target" } } : {}),
		});
		const response = test.request();
		await flush();
		if (status === 302) {
			await expectDelayed(response, 100);
			expect((await response).redirects).toEqual([
				{ url: `${origin}/`, status: 302, location: `${origin}/target` },
			]);
		} else {
			expect((await response).status).toBe(status);
			await expectDelayed(test.request("/next"), 100);
		}
		expect(exchanges.map(({ time }) => time)).toEqual([0, 100]);
	},
);

it.each(["0", "Tue, 15 Sep 2026 11:59:59 GMT"])(
	"does not shorten minimum pacing for zero or stale advice %s",
	async (retryAfter) => {
		const test = fixture();
		plans.push({ status: 503, retryAfter });
		await test.request();
		await expectDelayed(test.request("/next"), 100);
		expect(exchanges.map(({ time }) => time)).toEqual([0, 100]);
	},
);

it.each(["omitted", "undefined", "zero"] as const)(
	"leaves pacing disabled when the option is %s",
	async (mode) => {
		const resolver = vi.fn(async () => [publicAddress]);
		const transport = new NodeNetworkTransport({
			resolver,
			...(mode === "omitted"
				? {}
				: { minRequestIntervalMs: mode === "zero" ? 0 : undefined }),
		});
		transports.push(transport);
		plans.push({ status: 429, retryAfter: "86400" });
		await track(transport.request({ url: `${origin}/limited` }));
		await track(transport.request({ url: `${origin}/next` }));
		expect(exchanges.map(({ time }) => time)).toEqual([0, 0]);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("accepts equivalent duplicate raw headers instead of a comma-joined value", async () => {
	const test = fixture();
	plans.push({ status: 503, retryAfter: [" 2", "2\t"] });
	const result = await test.request();
	expect(result.headers["retry-after"]).toEqual([" 2", "2\t"]);
	await expectDelayed(test.request("/next"), 2000);
	expect(exchanges.map(({ time }) => time)).toEqual([0, 2000]);
});

it("accepts the 24-hour boundary without advancing through the whole queue", async () => {
	const test = fixture({ limits: { timeoutMs: 300_000 } });
	plans.push({ status: 429, retryAfter: "86400" });
	await test.request();
	const controller = new AbortController();
	const waiting = test.request("/waiting", { signal: controller.signal });
	await flush();
	await vi.advanceTimersByTimeAsync(60_000);
	expect(network.https).toHaveBeenCalledTimes(1);
	controller.abort();
	await expect(waiting).rejects.toMatchObject({ code: "aborted" });
});

it.each([false, true])(
	"stores header cookies early and refreshes expired cookies after cooldown, replacement: %s",
	async (replace) => {
		const jar = new CookieJar({}, () => Date.now());
		jars.push(jar);
		const test = fixture({ cookieJar: jar });
		const cookieContext = {
			siteUrl: `${origin}/`,
			credentials: "include" as const,
		};
		plans.push({
			status: 503,
			retryAfter: "2",
			headers: { "set-cookie": "short=owned; Secure; Path=/; Max-Age=1" },
			holdBody: true,
		});
		const original = test.request("/first", { cookieContext });
		await flush();
		expect(jar.cookieHeader(`${origin}/`, cookieContext)).toBe("short=owned");
		const waiting = test.request("/waiting", { cookieContext });
		await flush();
		await vi.advanceTimersByTimeAsync(1000);
		if (replace)
			expect(
				jar.setCookie(
					`${origin}/`,
					"fresh=owned; Secure; Path=/",
					cookieContext,
				),
			).toMatchObject({ accepted: true });
		await expectDelayed(waiting, 1000);
		expect(exchanges[1].options.headers).toMatchObject({
			host: "cooldown.example",
		});
		expect(
			(exchanges[1].options.headers as Record<string, string>).cookie,
		).toBe(replace ? "fresh=owned" : undefined);
		exchanges[0].finish();
		await original;
	},
);

it("bypasses cooldowns for full routes without using routed advice to extend them", async () => {
	const test = fixture();
	plans.push({ status: 429, retryAfter: "2" });
	await test.request();
	const routed = await track(
		test.transport.requestWithRoutes({ url: `${origin}/routed` }, () => ({
			url: `${origin}/routed`,
			status: 503,
			headers: { "retry-after": ["86400"] },
			body: new Uint8Array(),
			encodedBytes: 0,
			redirects: [],
			elapsedMs: 0,
		})),
	);
	expect(routed.status).toBe(503);
	expect(performance.now()).toBe(0);
	expect(test.resolver).toHaveBeenCalledTimes(1);
	await expectDelayed(test.request("/next"), 2000);
	expect(test.transport.metrics()).toMatchObject({
		requests: 3,
		mockedRequests: 1,
		active: 0,
	});
});

it("serves cache hits during cooldown without DNS, HTTPS, or transfer debits", async () => {
	const jar = new CookieJar();
	jars.push(jar);
	const test = fixture({ resourceCache: {}, cookieJar: jar });
	const resource = {
		resourceReuse: "stylesheet" as const,
		redirect: "manual" as const,
		cookieContext: {
			siteUrl: `${origin}/page`,
			credentials: "omit" as const,
			topLevelNavigation: false,
			crossSiteRedirect: false,
		},
	};
	plans.push(
		{
			body: "body{}",
			headers: {
				"content-type": "text/css",
				"cache-control": "public, max-age=3600",
				date: new Date().toUTCString(),
			},
		},
		{ status: 503, retryAfter: "2" },
	);
	await test.request("/asset.css", resource);
	await expectDelayed(test.request("/limited"), 100);
	const before = test.transport.metrics();
	const cached = await test.request("/asset.css", resource);
	expect(cached.delivery).toBe("memory-cache");
	expect(Buffer.from(cached.body).toString()).toBe("body{}");
	expect(performance.now()).toBe(100);
	expect(test.resolver).toHaveBeenCalledTimes(2);
	expect(network.https).toHaveBeenCalledTimes(2);
	expect(test.transport.metrics()).toMatchObject({
		requests: before.requests,
		encodedBytes: before.encodedBytes,
		decodedBytes: before.decodedBytes,
		cacheHits: 1,
	});
	await expectDelayed(test.request("/next"), 2000);
});

it("keeps concurrency and request limits while cooldown work is queued", async () => {
	const test = fixture({ limits: { maxConcurrent: 1, maxRequests: 2 } });
	plans.push({ status: 429, retryAfter: "2" });
	await test.request();
	const waiting = test.request("/waiting");
	await flush();
	await expect(test.request("/concurrent")).rejects.toMatchObject({
		code: "resource-limit",
	});
	await expectDelayed(waiting, 2000);
	await expect(test.request("/budget")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 0 });
	expect(network.https).toHaveBeenCalledTimes(2);
});

it("rejects oversized headers before their advice can establish a cooldown", async () => {
	const test = fixture({ limits: { maxHeaderBytes: 512 } });
	plans.push({
		status: 429,
		retryAfter: "2",
		headers: { "x-padding": "x".repeat(512) },
	});
	await expect(test.request()).rejects.toMatchObject({
		code: "resource-limit",
	});
	await expectDelayed(test.request("/next"), 100);
	expect(exchanges.map(({ time }) => time)).toEqual([0, 100]);
});

it("retains address policy and pinned TLS options around cooldown admission", async () => {
	const test = fixture();
	plans.push({ status: 503, retryAfter: "2" });
	await test.request();
	test.resolver.mockResolvedValueOnce(["127.0.0.1"]);
	await expect(test.request("/private")).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(network.https).toHaveBeenCalledTimes(1);
	await expectDelayed(test.request("/next"), 2000);
	for (const exchange of exchanges)
		expect(exchange.options).toMatchObject({
			hostname: publicAddress,
			port: 443,
			servername: "cooldown.example",
			rejectUnauthorized: true,
			checkServerIdentity: expect.any(Function),
			agent: false,
		});
});

it("retains body byte limits and accounting after observing valid advice", async () => {
	const test = fixture({ limits: { maxResponseBytes: 2 } });
	plans.push({ status: 429, retryAfter: "2", body: "oversized" });
	await expect(test.request()).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.transport.metrics()).toMatchObject({
		requests: 1,
		encodedBytes: 9,
		active: 0,
	});
	await expectDelayed(test.request("/next"), 2000);
	expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 0 });
});
