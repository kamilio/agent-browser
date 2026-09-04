import { EventEmitter, getEventListeners } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";

const network = vi.hoisted(() => ({
	http: vi.fn(),
	https: vi.fn(),
	blocked: vi.fn(() => {
		throw new Error(
			"Actual network access is forbidden in signal admission tests",
		);
	}),
}));

vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: network.http,
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

const resolver = vi.fn(async () => ["8.8.8.8"]);
const transports: NodeNetworkTransport[] = [];
const responses: Readable[] = [];

function dispatch(
	options: RequestOptions,
	callback: (response: IncomingMessage) => void,
) {
	if (options.path !== "/signal" || options.hostname !== "8.8.8.8")
		return network.blocked();
	const response = Object.assign(Readable.from([], { objectMode: false }), {
		statusCode: 200,
		headers: {},
		rawHeaders: [],
	});
	responses.push(response);
	const request = Object.assign(new EventEmitter(), {
		destroy: vi.fn(() => request),
		end: vi.fn(() => {
			queueMicrotask(() => callback(response as unknown as IncomingMessage));
			return request;
		}),
	});
	return request;
}

function transport() {
	const active = new NodeNetworkTransport({ resolver });
	transports.push(active);
	return active;
}

function routeResponse(url: string): NetworkResponse {
	return {
		url,
		status: 200,
		headers: {},
		body: new Uint8Array(),
		redirects: [],
		encodedBytes: 0,
		elapsedMs: 0,
	};
}

function observe(signal: AbortSignal) {
	return {
		remove: vi.spyOn(signal, "removeEventListener"),
		timers: vi.spyOn(globalThis, "setTimeout"),
		clear: vi.spyOn(globalThis, "clearTimeout"),
	};
}

function expectCleanup(
	active: NodeNetworkTransport,
	signal: AbortSignal,
	observed: ReturnType<typeof observe>,
) {
	expect(active.metrics().active).toBe(0);
	expect(getEventListeners(signal, "abort")).toHaveLength(0);
	expect(observed.timers).toHaveBeenCalledOnce();
	expect(observed.clear).toHaveBeenCalledWith(
		observed.timers.mock.results[0].value,
	);
	expect(observed.remove).toHaveBeenCalledOnce();
}

beforeEach(() => {
	vi.clearAllMocks();
	network.http.mockImplementation(dispatch);
	network.https.mockImplementation(dispatch);
});

afterEach(() => {
	for (const active of transports.splice(0)) {
		active.close();
		expect(active.metrics().active).toBe(0);
	}
	for (const response of responses.splice(0)) response.destroy();
	vi.restoreAllMocks();
	expect(network.blocked).not.toHaveBeenCalled();
});

it.each(
	["http", "https", "route"].flatMap((channel) =>
		["before", "after"].map((order) => ({ channel, order })),
	),
)(
	"rejects late signal closure $order genuine registration before $channel dispatch",
	async ({ channel, order }) => {
		const active = transport();
		const source = new AbortController();
		const signal = source.signal;
		const originalAdd = signal.addEventListener.bind(signal);
		const activeAtClose: number[] = [];
		const close = () => {
			activeAtClose.push(active.metrics().active);
			active.close();
		};
		const add = vi
			.spyOn(signal, "addEventListener")
			.mockImplementation((...args) => {
				if (order === "before") close();
				originalAdd(...args);
				if (order === "after") close();
			});
		const observed = observe(signal);
		const url = `${channel === "https" ? "https" : "http"}://budget.test/signal`;
		const route = vi.fn(() => routeResponse(url));
		const request = { url, signal, maxResponseBytes: 0 };
		const result = await (channel === "route"
			? active.requestWithRoutes(request, route)
			: active.request(request)
		).then(
			() => "fulfilled",
			(error: unknown) => (error as { code: string }).code,
		);
		expect(signal).toBe(source.signal);
		expect(signal).toBeInstanceOf(AbortSignal);
		expect(signal.aborted).toBe(false);
		expect(add).toHaveBeenCalledOnce();
		expect(activeAtClose).toEqual([0]);
		expectCleanup(active, signal, observed);
		expect(observed.remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
		expect({
			result,
			closed: active.metrics().closed,
			requests: active.metrics().requests,
			dns: resolver.mock.calls.length,
			http: network.http.mock.calls.length,
			https: network.https.mock.calls.length,
			routes: route.mock.calls.length,
		}).toEqual({
			result: "closed",
			closed: true,
			requests: 0,
			dns: 0,
			http: 0,
			https: 0,
			routes: 0,
		});
		source.abort();
		expect(getEventListeners(signal, "abort")).toHaveLength(0);
		expect(active.metrics().active).toBe(0);
	},
);

it.each(["http", "https", "route"])(
	"preserves ordinary genuine signal registration and cleanup for %s",
	async (channel) => {
		const active = transport();
		const source = new AbortController();
		const signal = source.signal;
		const add = vi.spyOn(signal, "addEventListener");
		const observed = observe(signal);
		const url = `${channel === "https" ? "https" : "http"}://budget.test/signal`;
		const request = { url, signal, maxResponseBytes: 0 };
		const result = await (channel === "route"
			? active.requestWithRoutes(request, () => routeResponse(url))
			: active.request(request));
		expect(result.status).toBe(200);
		expect(result.body.length).toBe(0);
		expect(active.metrics()).toMatchObject({ closed: false, requests: 1 });
		expect(add).toHaveBeenCalledOnce();
		expectCleanup(active, signal, observed);
		expect(observed.remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
	},
);

it.each([false, true])(
	"preserves genuine abort precedence during registration with close=%s",
	async (close) => {
		const active = transport();
		const source = new AbortController();
		const signal = source.signal;
		const originalAdd = signal.addEventListener.bind(signal);
		vi.spyOn(signal, "addEventListener").mockImplementation((...args) => {
			originalAdd(...args);
			if (close) active.close();
			source.abort();
		});
		const observed = observe(signal);
		await expect(
			active.request({ url: "http://budget.test/signal", signal }),
		).rejects.toMatchObject({ code: "aborted" });
		expectCleanup(active, signal, observed);
		expect(active.metrics().requests).toBe(0);
		expect(resolver).not.toHaveBeenCalled();
		expect(network.http).not.toHaveBeenCalled();
	},
);

it("rejects an already closed owner before registering a genuine signal or timer", async () => {
	const active = transport();
	active.close();
	const signal = new AbortController().signal;
	const add = vi.spyOn(signal, "addEventListener");
	const observed = observe(signal);
	await expect(
		active.request({ url: "http://budget.test/signal", signal }),
	).rejects.toMatchObject({ code: "closed" });
	expect(add).not.toHaveBeenCalled();
	expect(observed.timers).not.toHaveBeenCalled();
	expect(observed.remove).not.toHaveBeenCalled();
	expect(getEventListeners(signal, "abort")).toHaveLength(0);
	expect(active.metrics().active).toBe(0);
});
