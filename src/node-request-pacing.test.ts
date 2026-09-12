import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CookieJar } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";

const network = vi.hoisted(() => ({
	https: vi.fn(),
	blocked: vi.fn(() => {
		throw new Error("Actual network access is forbidden in pacing tests");
	}),
}));

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

vi.mock("node:dns/promises", () => ({ Resolver: network.blocked }));

type ExchangeResponse = Omit<
	NetworkResponse,
	"url" | "redirects" | "elapsedMs"
>;
interface ExchangeOwner {
	exchange(
		url: URL,
		address: string,
		method: string,
		headers: Record<string, string>,
		body: Buffer<ArrayBuffer> | undefined,
		redirect: string,
		signal: AbortSignal,
		maxResponseBytes: number,
		onHeaders?: (headers: NetworkResponse["headers"]) => void,
	): Promise<ExchangeResponse>;
}

const origin = "https://pacing.example";
const other = "https://other.example";
const publicAddress = "93.184.216.34";
const transports: NodeNetworkTransport[] = [];
const jars: CookieJar[] = [];
const pending: Promise<unknown>[] = [];
const responses: Readable[] = [];

beforeEach(() => {
	vi.clearAllMocks();
	network.https.mockImplementation(network.blocked);
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
});

afterEach(async () => {
	for (const transport of transports.splice(0)) transport.close();
	await Promise.allSettled(pending.splice(0));
	for (const jar of jars.splice(0)) jar.close();
	for (const response of responses.splice(0)) response.destroy();
	expect(network.blocked).not.toHaveBeenCalled();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function track<Result>(promise: Promise<Result>): Promise<Result> {
	void promise.catch(() => undefined);
	pending.push(promise);
	return promise;
}

function fixture(
	options: NodeTransportOptions = { minRequestIntervalMs: 100 },
) {
	const resolver = vi.fn(async (_hostname: string, _signal: AbortSignal) => [
		publicAddress,
	]);
	const transport = new NodeNetworkTransport({ ...options, resolver });
	transports.push(transport);
	const responses = new Map<string, ExchangeResponse>();
	const starts: { url: string; time: number; cookie: string | undefined }[] =
		[];
	const exchange = vi
		.spyOn(transport as unknown as ExchangeOwner, "exchange")
		.mockImplementation(
			async (
				url,
				address,
				_method,
				headers,
				_body,
				_redirect,
				signal,
				_limit,
				onHeaders,
			) => {
				expect(address).toBe(publicAddress);
				expect(signal.aborted).toBe(false);
				starts.push({
					url: url.href,
					time: performance.now(),
					cookie: headers.cookie,
				});
				const response = responses.get(url.href) ?? {
					status: 204,
					headers: {},
					body: new Uint8Array(),
					encodedBytes: 0,
				};
				onHeaders?.(response.headers);
				return response;
			},
		);
	const request = (
		url = `${origin}/`,
		options: Omit<NetworkRequest, "url"> = {},
	) => track(transport.request({ ...options, url }));
	const redirect = (url: string, location: string) =>
		responses.set(url, {
			status: 302,
			headers: { location: [location] },
			body: new Uint8Array(),
			encodedBytes: 0,
		});
	return { transport, resolver, exchange, starts, request, redirect };
}

async function flush() {
	await vi.advanceTimersByTimeAsync(0);
}

it.each([{}, { minRequestIntervalMs: undefined }, { minRequestIntervalMs: 0 }])(
	"preserves unpaced default behavior for %j",
	async (options) => {
		const test = fixture(options);
		await Promise.all([test.request(), test.request(), test.request()]);
		expect(test.starts.map((start) => start.time)).toEqual([0, 0, 0]);
		expect(test.transport.metrics()).toMatchObject({
			requests: 3,
			active: 0,
			mockedRequests: 0,
		});
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each([1, 60_000])("accepts pacing option boundary %s", async (interval) => {
	const test = fixture({ minRequestIntervalMs: interval });
	await test.request();
	expect(test.starts.map((start) => start.time)).toEqual([0]);
});

it.each([1, 10, 99, 100, 250])(
	"preserves the start interval after %s ms of synchronous request setup",
	async (setupMs) => {
		const test = fixture();
		const exchange = test.exchange.getMockImplementation();
		if (!exchange) throw new Error("Missing exchange fixture");
		test.exchange.mockImplementationOnce((...arguments_) => {
			vi.advanceTimersByTime(setupMs);
			return exchange(...arguments_);
		});
		await test.request(`${origin}/slow-setup`);
		const next = test.request(`${origin}/next`);
		await flush();
		await vi.advanceTimersByTimeAsync(100);
		await next;
		expect(test.starts).toHaveLength(2);
		expect(test.starts[1].time - test.starts[0].time).toBeGreaterThanOrEqual(
			100,
		);
		expect(test.transport.metrics()).toMatchObject({ active: 0 });
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each([1, 10, 99, 100, 250])(
	"paces actual exchange construction after %s ms without opening a socket",
	async (setupMs) => {
		const starts: number[] = [];
		network.https.mockImplementation(
			(
				options: RequestOptions,
				callback: (response: IncomingMessage) => void,
			) => {
				expect(options.hostname).toBe(publicAddress);
				expect(options.method).toBe("GET");
				if (starts.length === 0) vi.advanceTimersByTime(setupMs);
				starts.push(performance.now());
				const response = Object.assign(
					Readable.from([], { objectMode: false }),
					{ statusCode: 204, headers: {}, rawHeaders: [] },
				);
				responses.push(response);
				const request = Object.assign(new EventEmitter(), {
					destroy: vi.fn(() => request),
					end: vi.fn(() => {
						queueMicrotask(() =>
							callback(response as unknown as IncomingMessage),
						);
						return request;
					}),
				});
				return request;
			},
		);
		const test = fixture();
		test.exchange.mockRestore();
		await expect(test.request(`${origin}/first`)).resolves.toMatchObject({
			status: 204,
		});
		const next = test.request(`${origin}/second`);
		await flush();
		await vi.advanceTimersByTimeAsync(100);
		await expect(next).resolves.toMatchObject({ status: 204 });
		expect(starts).toHaveLength(2);
		expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(100);
		expect(network.https).toHaveBeenCalledTimes(2);
		expect(test.transport.metrics()).toMatchObject({ active: 0, requests: 2 });
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each([
	-1,
	0.5,
	60_001,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	null,
	"100",
	true,
	{},
	[],
])("rejects invalid pacing option %s", (value) => {
	expect(() => fixture({ minRequestIntervalMs: value as number })).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("paces same-origin exchanges FIFO and retains request and active metrics", async () => {
	const test = fixture();
	await test.request(`${origin}/first`);
	const second = test.request(`${origin}/second`);
	const third = test.request(`${origin}/third`);
	await flush();
	expect(test.transport.metrics()).toMatchObject({ requests: 3, active: 2 });
	expect(test.exchange).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(99);
	expect(test.exchange).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	expect((await second).elapsedMs).toBe(100);
	await vi.advanceTimersByTimeAsync(100);
	expect((await third).elapsedMs).toBe(200);
	expect(test.starts.map(({ url, time }) => [url, time])).toEqual([
		[`${origin}/first`, 0],
		[`${origin}/second`, 100],
		[`${origin}/third`, 200],
	]);
	expect(test.transport.metrics()).toMatchObject({
		requests: 3,
		active: 0,
		redirects: 0,
		mockedRequests: 0,
		encodedBytes: 0,
		decodedBytes: 0,
		closed: false,
	});
});

it("keeps scheme, host and port origins independent", async () => {
	const test = fixture();
	await test.request();
	const waiting = test.request(`${origin}/waiting`);
	await Promise.all([
		test.request(`${other}/`),
		test.request("http://pacing.example/"),
		test.request("https://pacing.example:8443/"),
	]);
	expect(test.starts.map((start) => start.time)).toEqual([0, 0, 0, 0]);
	await vi.advanceTimersByTimeAsync(100);
	await waiting;
	expect(test.starts[4].time).toBe(100);
});

it("does not share pacing state between transports", async () => {
	const first = fixture();
	const second = fixture();
	await first.request();
	const waiting = first.request();
	await second.request();
	expect(second.starts[0].time).toBe(0);
	await vi.advanceTimersByTimeAsync(100);
	await waiting;
	expect(first.starts.map((start) => start.time)).toEqual([0, 100]);
});

it("queues each redirected exchange at its target origin behind existing work", async () => {
	const test = fixture();
	await test.request(`${other}/seed`);
	const ahead = test.request(`${other}/ahead`);
	await flush();
	test.redirect(`${origin}/start`, `${other}/landing`);
	test.redirect(`${other}/landing`, `${other}/final`);
	const navigation = test.request(`${origin}/start`);
	await flush();
	expect(test.starts.map(({ url, time }) => [url, time])).toEqual([
		[`${other}/seed`, 0],
		[`${origin}/start`, 0],
	]);
	await vi.advanceTimersByTimeAsync(100);
	await ahead;
	await vi.advanceTimersByTimeAsync(100);
	expect(test.starts[3]).toMatchObject({ url: `${other}/landing`, time: 200 });
	await vi.advanceTimersByTimeAsync(100);
	const response = await navigation;
	expect(test.starts[4]).toMatchObject({ url: `${other}/final`, time: 300 });
	expect(response.redirects).toEqual([
		{ url: `${origin}/start`, status: 302, location: `${other}/landing` },
		{ url: `${other}/landing`, status: 302, location: `${other}/final` },
	]);
	expect(response.elapsedMs).toBe(300);
	expect(test.transport.metrics()).toMatchObject({
		requests: 5,
		redirects: 2,
		active: 0,
	});
});

it("bypasses DNS and pacing for routed mocks without moving the real cooldown", async () => {
	const test = fixture();
	const route = vi.fn(
		({ url }: Pick<NetworkRequest, "url">): NetworkResponse => ({
			url,
			status: 200,
			headers: {},
			body: new Uint8Array([111, 107]),
			encodedBytes: 0,
			redirects: [],
			elapsedMs: 0,
		}),
	);
	await track(
		test.transport.requestWithRoutes({ url: `${origin}/mock-first` }, route),
	);
	await test.request();
	const waiting = test.request(`${origin}/waiting`);
	await flush();
	await vi.advanceTimersByTimeAsync(40);
	await track(
		test.transport.requestWithRoutes({ url: `${origin}/mock-second` }, route),
	);
	expect(test.exchange).toHaveBeenCalledTimes(1);
	expect(test.resolver).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(60);
	await waiting;
	expect(test.starts.map((start) => start.time)).toEqual([0, 100]);
	expect(test.transport.metrics()).toMatchObject({
		requests: 4,
		mockedRequests: 2,
		mockedDecodedBytes: 4,
		decodedBytes: 4,
		active: 0,
	});
});

it("waits for successful DNS before taking a pacing slot", async () => {
	const test = fixture();
	let resolveAddresses!: (addresses: string[]) => void;
	test.resolver.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				resolveAddresses = resolve;
			}),
	);
	const unresolved = test.request(`${origin}/unresolved`);
	await flush();
	await test.request(`${origin}/ready`);
	await vi.advanceTimersByTimeAsync(40);
	resolveAddresses([publicAddress]);
	await flush();
	expect(test.exchange).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(60);
	await unresolved;
	expect(test.starts.map(({ url, time }) => [url, time])).toEqual([
		[`${origin}/ready`, 0],
		[`${origin}/unresolved`, 100],
	]);
});

it("does not consume a pacing slot for failed DNS or rejected addresses", async () => {
	const test = fixture();
	test.resolver.mockRejectedValueOnce(
		new AgentBrowserError("network-error", "Owned DNS failure"),
	);
	await expect(test.request()).rejects.toMatchObject({ code: "network-error" });
	test.resolver.mockResolvedValueOnce(["127.0.0.1"]);
	await expect(test.request()).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.exchange).not.toHaveBeenCalled();
	await test.request();
	expect(test.starts[0].time).toBe(0);
	expect(test.transport.metrics()).toMatchObject({ requests: 3, active: 0 });
});

it("does not burst queued exchanges after a delayed timer", async () => {
	const test = fixture();
	const fakeNow = performance.now.bind(performance);
	let delay = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + delay);
	await test.request();
	const second = test.request();
	const third = test.request();
	await flush();
	await vi.advanceTimersByTimeAsync(99);
	delay = 400;
	await vi.advanceTimersByTimeAsync(1);
	await second;
	expect(test.starts.map((start) => start.time)).toEqual([0, 500]);
	await vi.advanceTimersByTimeAsync(99);
	expect(test.exchange).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(1);
	await third;
	expect(test.starts.map((start) => start.time)).toEqual([0, 500, 600]);
});

it("aborts a queued call without exchanging or delaying its successor", async () => {
	const test = fixture();
	await test.request();
	const controller = new AbortController();
	const cancelled = test.request(`${origin}/cancelled`, {
		signal: controller.signal,
	});
	const survivor = test.request(`${origin}/survivor`);
	await flush();
	await vi.advanceTimersByTimeAsync(40);
	controller.abort();
	await expect(cancelled).rejects.toMatchObject({ code: "aborted" });
	expect(test.transport.metrics()).toMatchObject({ requests: 3, active: 1 });
	await vi.advanceTimersByTimeAsync(60);
	await survivor;
	await vi.advanceTimersByTimeAsync(1000);
	expect(test.starts.map(({ url, time }) => [url, time])).toEqual([
		[`${origin}/`, 0],
		[`${origin}/survivor`, 100],
	]);
	expect(test.transport.metrics().active).toBe(0);
});

it("close aborts queued calls, rejects future calls and clears timers", async () => {
	const test = fixture();
	await test.request();
	const waiting = test.request(`${origin}/waiting`);
	await flush();
	test.transport.close();
	await expect(waiting).rejects.toMatchObject({ code: "closed" });
	await expect(test.request()).rejects.toMatchObject({ code: "closed" });
	await vi.advanceTimersByTimeAsync(1000);
	expect(test.exchange).toHaveBeenCalledTimes(1);
	expect(test.transport.metrics()).toMatchObject({
		requests: 2,
		active: 0,
		closed: true,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("rechecks abort at a queued pacing dispatch before starting the exchange", async () => {
	const test = fixture();
	await test.request();
	const controller = new AbortController();
	const dispatch = OriginRequestPacer.prototype.dispatch;
	vi.spyOn(OriginRequestPacer.prototype, "dispatch").mockImplementationOnce(
		function <Result>(
			this: OriginRequestPacer,
			target: string,
			signal: AbortSignal,
			start: () => Result | PromiseLike<Result>,
		) {
			return dispatch.bind(this)(target, signal, () => {
				controller.abort();
				return start();
			});
		},
	);
	const cancelled = test.request(`${origin}/cancelled-after-grant`, {
		signal: controller.signal,
	});
	await flush();
	await vi.advanceTimersByTimeAsync(100);
	await expect(cancelled).rejects.toMatchObject({ code: "aborted" });
	expect(test.exchange).toHaveBeenCalledTimes(1);
	expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 0 });
});

it("includes queued pacing in the navigation-wide deadline across redirects", async () => {
	const test = fixture({
		minRequestIntervalMs: 100,
		limits: { timeoutMs: 150 },
	});
	test.redirect(`${origin}/start`, `${origin}/middle`);
	test.redirect(`${origin}/middle`, `${origin}/too-late`);
	const navigation = test.request(`${origin}/start`);
	await flush();
	await vi.advanceTimersByTimeAsync(100);
	expect(test.exchange).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(50);
	await expect(navigation).rejects.toMatchObject({ code: "timeout" });
	await vi.advanceTimersByTimeAsync(1000);
	expect(test.starts.map(({ url, time }) => [url, time])).toEqual([
		[`${origin}/start`, 0],
		[`${origin}/middle`, 100],
	]);
	expect(test.transport.metrics()).toMatchObject({
		requests: 3,
		redirects: 2,
		active: 0,
	});
});

it("rechecks the elapsed deadline after a grant even before its timeout callback runs", async () => {
	const test = fixture({
		minRequestIntervalMs: 100,
		limits: { timeoutMs: 150 },
	});
	const fakeNow = performance.now.bind(performance);
	let delay = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + delay);
	await test.request();
	const late = test.request(`${origin}/late`);
	await flush();
	await vi.advanceTimersByTimeAsync(99);
	delay = 100;
	await vi.advanceTimersByTimeAsync(1);
	await expect(late).rejects.toMatchObject({ code: "timeout" });
	expect(test.exchange).toHaveBeenCalledTimes(1);
	expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 0 });
});

it("keeps concurrency and request-count limits while requests wait", async () => {
	const test = fixture({
		minRequestIntervalMs: 100,
		limits: { maxConcurrent: 1, maxRequests: 2 },
	});
	await test.request();
	const waiting = test.request(`${origin}/waiting`);
	await flush();
	await expect(test.request(`${origin}/concurrent`)).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 1 });
	await vi.advanceTimersByTimeAsync(100);
	await waiting;
	await expect(test.request(`${origin}/over-budget`)).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.exchange).toHaveBeenCalledTimes(2);
	expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 0 });
});

it.each([false, true])(
	"refreshes expired jar cookies while waiting, replacement: %s",
	async (replace) => {
		const jar = new CookieJar({}, () => Date.now());
		jars.push(jar);
		const cookieContext = {
			siteUrl: `${origin}/`,
			credentials: "include" as const,
		};
		expect(
			jar.setCookie(
				`${origin}/`,
				"short=owned; Secure; Path=/; Max-Age=1",
				cookieContext,
			),
		).toMatchObject({ accepted: true });
		const test = fixture({ minRequestIntervalMs: 2000, cookieJar: jar });
		await test.request(`${origin}/first`, { cookieContext });
		const waiting = test.request(`${origin}/waiting`, { cookieContext });
		await flush();
		await vi.advanceTimersByTimeAsync(1000);
		if (replace) {
			expect(
				jar.setCookie(
					`${origin}/`,
					"fresh=owned; Secure; Path=/",
					cookieContext,
				),
			).toMatchObject({ accepted: true });
		}
		await vi.advanceTimersByTimeAsync(1000);
		await waiting;
		expect(test.starts).toEqual([
			{ url: `${origin}/first`, time: 0, cookie: "short=owned" },
			{
				url: `${origin}/waiting`,
				time: 2000,
				cookie: replace ? "fresh=owned" : undefined,
			},
		]);
		expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 0 });
	},
);

it.each(["aborted", "closed", "timeout"] as const)(
	"never reaches exchange when the post-wait cookie clock invalidates with %s",
	async (code) => {
		const fakeNow = performance.now.bind(performance);
		let elapsedOffset = 0;
		vi.spyOn(performance, "now").mockImplementation(
			() => fakeNow() + elapsedOffset,
		);
		const onClock = vi.fn<() => void>();
		const clock = vi.fn(() => {
			onClock();
			return Date.now();
		});
		const jar = new CookieJar({}, clock);
		jars.push(jar);
		const cookieContext = {
			siteUrl: `${origin}/`,
			credentials: "include" as const,
		};
		expect(
			jar.setCookie(`${origin}/`, "owned=value; Secure; Path=/", cookieContext),
		).toMatchObject({ accepted: true });
		clock.mockClear();
		const test = fixture({
			minRequestIntervalMs: 100,
			limits: { timeoutMs: 150 },
			cookieJar: jar,
		});
		await test.request(`${origin}/seed`);
		test.exchange.mockClear();
		const controller = new AbortController();
		const waiting = test.request(`${origin}/invalidated`, {
			cookieContext,
			signal: controller.signal,
		});
		await flush();
		expect(clock).toHaveBeenCalledTimes(1);
		expect(test.resolver).toHaveBeenCalledTimes(2);
		const requestSignal = test.resolver.mock.calls[1][1];
		const invalidate = vi.fn(() => {
			expect(performance.now()).toBe(100);
			expect(requestSignal.aborted).toBe(false);
			if (code === "aborted") controller.abort();
			else if (code === "closed") test.transport.close();
			else elapsedOffset = 50;
		});
		onClock.mockImplementation(invalidate);
		await vi.advanceTimersByTimeAsync(99);
		expect(invalidate).not.toHaveBeenCalled();
		expect(test.exchange).not.toHaveBeenCalled();
		expect(test.transport.metrics()).toMatchObject({ requests: 2, active: 1 });
		await vi.advanceTimersByTimeAsync(1);
		await expect(waiting).rejects.toMatchObject({ code });
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(clock).toHaveBeenCalledTimes(2);
		expect(fakeNow()).toBe(100);
		expect(requestSignal.aborted).toBe(code !== "timeout");
		expect(test.exchange).not.toHaveBeenCalled();
		expect(test.starts).toEqual([
			{ url: `${origin}/seed`, time: 0, cookie: undefined },
		]);
		expect(test.transport.metrics()).toMatchObject({
			requests: 2,
			active: 0,
			closed: code === "closed",
		});
		expect(vi.getTimerCount()).toBe(0);
	},
);
