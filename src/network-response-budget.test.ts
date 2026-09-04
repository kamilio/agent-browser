import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { CookieJar } from "./cookies.js";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { BrowserSession } from "./session.js";

const network = vi.hoisted(() => ({
	http: vi.fn(),
	https: vi.fn(),
	blocked: vi.fn(() => {
		throw new Error("Actual network access is forbidden in budget tests");
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

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

class RequestFixture extends EventEmitter {
	destroyed = false;
	constructor(private readonly respond: () => void) {
		super();
	}
	destroy = vi.fn(() => {
		this.destroyed = true;
		return this;
	});
	end = vi.fn(() => {
		queueMicrotask(() => {
			if (!this.destroyed) this.respond();
		});
		return this;
	});
}

interface ResponseFixture {
	url: URL;
	response: Readable & {
		statusCode: number;
		headers: Record<string, string>;
		rawHeaders: string[];
	};
	ready: ReturnType<typeof deferred>;
	request?: RequestFixture;
	options?: RequestOptions;
}

const pending: ResponseFixture[] = [];
const fixtures: ResponseFixture[] = [];
const transports: NodeNetworkTransport[] = [];
const cleanup: (() => void)[] = [];
const resolver = vi.fn(async () => ["8.8.8.8"]);

function fixture(
	path = "/data",
	options: {
		chunks?: readonly Uint8Array[];
		headers?: Record<string, string>;
		status?: number;
	} = {},
) {
	const source =
		options.chunks === undefined
			? new Readable({ read() {} })
			: Readable.from(options.chunks, { objectMode: false });
	const headers = options.headers ?? {};
	const result: ResponseFixture = {
		url: new URL(path, "http://budget.test"),
		response: Object.assign(source, {
			statusCode: options.status ?? 200,
			headers,
			rawHeaders: Object.entries(headers).flat(),
		}),
		ready: deferred(),
	};
	pending.push(result);
	fixtures.push(result);
	return result;
}

function dispatch(
	secure: boolean,
	options: RequestOptions,
	callback: (response: IncomingMessage) => void,
) {
	const index = pending.findIndex(
		(entry) =>
			entry.url.protocol === (secure ? "https:" : "http:") &&
			`${entry.url.pathname}${entry.url.search}` === options.path,
	);
	if (index < 0) return network.blocked();
	const [entry] = pending.splice(index, 1);
	entry.options = options;
	entry.request = new RequestFixture(() => {
		callback(entry.response as IncomingMessage);
		entry.ready.resolve();
	});
	return entry.request;
}

function transport(options: NodeTransportOptions = {}) {
	const result = new NodeNetworkTransport({ resolver, ...options });
	transports.push(result);
	return result;
}

function routed(
	body: Uint8Array,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url: "http://budget.test/data",
		status: 200,
		headers: {},
		body,
		redirects: [],
		encodedBytes: 0,
		elapsedMs: 0,
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	network.http.mockImplementation((options, callback) =>
		dispatch(false, options, callback),
	);
	network.https.mockImplementation((options, callback) =>
		dispatch(true, options, callback),
	);
});

afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
	for (const active of transports.splice(0)) {
		active.close();
		expect(active.metrics().active).toBe(0);
	}
	for (const entry of fixtures.splice(0)) entry.response.destroy();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	expect(pending.splice(0)).toHaveLength(0);
	expect(network.blocked).not.toHaveBeenCalled();
});

it.each([
	-1,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	null,
	"2",
	true,
	{},
])(
	"rejects invalid ceiling %s before route, DNS or dispatch",
	async (value) => {
		const active = transport();
		const route = vi.fn();
		const request = {
			url: "http://budget.test/data",
			maxResponseBytes: value,
		} as NetworkRequest;
		await expect(active.request(request)).rejects.toMatchObject({
			code: "invalid-input",
		});
		await expect(
			active.requestWithRoutes(request, route),
		).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(route).not.toHaveBeenCalled();
		expect(resolver).not.toHaveBeenCalled();
		expect(network.http).not.toHaveBeenCalled();
		expect(network.https).not.toHaveBeenCalled();
		expect(active.metrics()).toMatchObject({ requests: 0, active: 0 });
	},
);

it.each(["http:", "https:"])(
	"accepts exactly the encoded and decoded ceiling over mocked %s",
	async (protocol) => {
		const entry = fixture(`${protocol}//budget.test/data`, {
			chunks: [Buffer.from("12"), Buffer.from("34")],
		});
		const active = transport();
		const result = await active.request({
			url: entry.url.href,
			maxResponseBytes: 4,
		});
		expect(Buffer.from(result.body).toString()).toBe("1234");
		expect(result.encodedBytes).toBe(4);
		expect(active.metrics()).toMatchObject({
			encodedBytes: 4,
			decodedBytes: 4,
			active: 0,
		});
		expect(entry.options?.hostname).toBe("8.8.8.8");
	},
);

it("rejects an encoded crossing chunk before retaining it and destroys the exchange", async () => {
	const first = Buffer.from("12");
	const crossing = Buffer.from("345");
	const entry = fixture();
	const active = transport();
	const copies = vi.spyOn(Buffer, "from");
	const result = active.request({ url: entry.url.href, maxResponseBytes: 4 });
	const rejected = expect(result).rejects.toMatchObject({
		code: "resource-limit",
		message: "Encoded response byte limit exceeded",
	});
	await entry.ready.promise;
	entry.response.push(first);
	entry.response.push(crossing);
	await rejected;
	expect(copies.mock.calls.filter(([value]) => value === first)).toHaveLength(
		1,
	);
	expect(
		copies.mock.calls.filter(([value]) => value === crossing),
	).toHaveLength(0);
	expect(entry.response.destroyed).toBe(true);
	expect(entry.request?.destroy).toHaveBeenCalledOnce();
	expect(active.metrics()).toMatchObject({ encodedBytes: 5, decodedBytes: 2 });
});

it.each([
	["gzip", gzipSync],
	["deflate", deflateSync],
	["br", brotliCompressSync],
] as const)(
	"rejects %s expansion before copying the oversized decoded chunk",
	async (encoding, compress) => {
		const encoded = compress(Buffer.alloc(16_384, 120));
		expect(encoded.length).toBeLessThan(128);
		const entry = fixture("/compressed", {
			chunks: [encoded],
			headers: { "content-encoding": encoding },
		});
		const active = transport();
		const copies = vi.spyOn(Buffer, "from");
		const concat = vi.spyOn(Buffer, "concat");
		await expect(
			active.request({ url: entry.url.href, maxResponseBytes: 128 }),
		).rejects.toMatchObject({
			code: "resource-limit",
			message: "Decoded response byte limit exceeded",
		});
		expect(
			copies.mock.calls.filter(
				([value]) => value instanceof Uint8Array && value.byteLength > 128,
			),
		).toHaveLength(0);
		expect(concat).not.toHaveBeenCalled();
		expect(entry.response.destroyed).toBe(true);
		expect(entry.request?.destroy).toHaveBeenCalledOnce();
		expect(active.metrics()).toMatchObject({
			encodedBytes: encoded.length,
			decodedBytes: 16_384,
		});
	},
);

it("enforces encoded limits even when the decoded content would fit", async () => {
	const encoded = gzipSync("x");
	const entry = fixture("/overhead", {
		chunks: [encoded],
		headers: { "content-encoding": "gzip" },
	});
	const active = transport();
	await expect(
		active.request({ url: entry.url.href, maxResponseBytes: 1 }),
	).rejects.toMatchObject({ message: "Encoded response byte limit exceeded" });
	expect(active.metrics()).toMatchObject({
		encodedBytes: encoded.length,
		decodedBytes: 0,
	});
});

it.each([undefined, 100, Number.MAX_SAFE_INTEGER])(
	"keeps the configured session response limit authoritative for %s",
	async (maxResponseBytes) => {
		const entry = fixture("/session-limit", { chunks: [Buffer.from("12345")] });
		const active = transport({ limits: { maxResponseBytes: 4 } });
		await expect(
			active.request({ url: entry.url.href, maxResponseBytes }),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(active.limits.maxResponseBytes).toBe(4);
	},
);

it("preserves omitted-ceiling behavior and copies the returned body", async () => {
	const bytes = Buffer.from("default");
	const entry = fixture("/default", { chunks: [bytes] });
	const active = transport();
	const result = await active.request({ url: entry.url.href });
	expect(result.body).toEqual(bytes);
	bytes.fill(0);
	expect(Buffer.from(result.body).toString()).toBe("default");
	expect(active.limits.maxResponseBytes).toBe(2_097_152);
});

it("allows zero only for empty bodies", async () => {
	const empty = fixture("/empty", { chunks: [] });
	const nonempty = fixture("/nonempty", { chunks: [Buffer.from("x")] });
	const active = transport();
	expect(
		(await active.request({ url: empty.url.href, maxResponseBytes: 0 })).body
			.length,
	).toBe(0);
	await expect(
		active.request({ url: nonempty.url.href, maxResponseBytes: 0 }),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it("snapshots the ceiling once before asynchronous resolution", async () => {
	const gate = deferred();
	const entry = fixture("/snapshot", { chunks: [Buffer.from("12345")] });
	const active = transport({
		resolver: async () => {
			await gate.promise;
			return ["8.8.8.8"];
		},
	});
	let ceiling = 4;
	const read = vi.fn(() => ceiling);
	const request = {
		url: entry.url.href,
		get maxResponseBytes() {
			return read();
		},
	};
	const result = active.request(request);
	ceiling = 100;
	gate.resolve();
	await expect(result).rejects.toMatchObject({ code: "resource-limit" });
	expect(read).toHaveBeenCalledOnce();
});

it("keeps concurrent ceilings independent", async () => {
	const small = fixture("/small");
	const large = fixture("/large");
	const active = transport();
	const result = Promise.allSettled([
		active.request({ url: small.url.href, maxResponseBytes: 2 }),
		active.request({ url: large.url.href, maxResponseBytes: 8 }),
	]);
	await Promise.all([small.ready.promise, large.ready.promise]);
	expect(active.metrics().active).toBe(2);
	small.response.push(Buffer.from("123"));
	large.response.push(Buffer.from("12345678"));
	large.response.push(null);
	const [rejected, accepted] = await result;
	expect(rejected).toMatchObject({
		status: "rejected",
		reason: { code: "resource-limit" },
	});
	expect(accepted).toMatchObject({
		status: "fulfilled",
		value: { encodedBytes: 8 },
	});
	expect(large.request?.destroy).not.toHaveBeenCalled();
	expect(active.metrics()).toMatchObject({ encodedBytes: 11, decodedBytes: 8 });
});

it.each(["abort", "close"])(
	"cleans suspended streams on %s",
	async (action) => {
		const entry = fixture();
		const active = transport();
		const controller = new AbortController();
		const result = active.request({
			url: entry.url.href,
			signal: controller.signal,
			maxResponseBytes: 4,
		});
		const rejected = expect(result).rejects.toMatchObject({
			code: action === "abort" ? "aborted" : "closed",
		});
		await entry.ready.promise;
		entry.response.push(Buffer.from("12"));
		if (action === "abort") controller.abort();
		else active.close();
		await rejected;
		expect(entry.response.destroyed).toBe(true);
		expect(entry.request?.destroy).toHaveBeenCalledOnce();
	},
);

it.each(["HEAD", "204", "205", "304"])(
	"preserves %s metadata without consuming a body at ceiling zero",
	async (kind) => {
		const entry = fixture("/metadata", {
			status: kind === "HEAD" ? 200 : Number(kind),
			headers: {
				"content-length": "999999999",
				"content-encoding": "unsupported",
			},
		});
		const active = transport();
		const result = await active.request({
			url: entry.url.href,
			method: kind === "HEAD" ? "HEAD" : "GET",
			maxResponseBytes: 0,
		});
		expect(result.body.length).toBe(0);
		expect(result.headers["content-length"]).toEqual(["999999999"]);
		expect(result.encodedBytes).toBe(0);
		expect(entry.response.destroyed).toBe(true);
		expect(active.metrics()).toMatchObject({
			encodedBytes: 0,
			decodedBytes: 0,
		});
	},
);

it.each(["manual", "follow"] as const)(
	"limits consumed redirect bodies in %s mode",
	async (redirect) => {
		const entry = fixture("/redirect", {
			chunks: [Buffer.from("oversized")],
			status: 302,
			headers: { location: "/final" },
		});
		if (redirect === "follow")
			fixture("/final", { chunks: [Buffer.from("12345")] });
		const active = transport();
		await expect(
			active.request({ url: entry.url.href, redirect, maxResponseBytes: 4 }),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(active.metrics()).toMatchObject({
			requests: redirect === "follow" ? 2 : 1,
			redirects: redirect === "follow" ? 1 : 0,
			encodedBytes: redirect === "follow" ? 5 : 9,
		});
	},
);

it("follows without retaining redirect bodies and keeps the original ceiling on the final hop", async () => {
	const first = fixture("/redirect", {
		status: 302,
		headers: { location: "/final" },
	});
	fixture("/final", { chunks: [Buffer.from("1234")] });
	const active = transport();
	const request = { url: first.url.href, maxResponseBytes: 4 };
	const result = active.request(request);
	await first.ready.promise;
	request.maxResponseBytes = 0;
	expect(await result).toMatchObject({
		encodedBytes: 4,
		url: "http://budget.test/final",
		redirects: [{ status: 302 }],
	});
	expect(first.response.destroyed).toBe(true);
	expect(active.metrics()).toMatchObject({ encodedBytes: 4, decodedBytes: 4 });
});

it("returns a bounded manual redirect body without following", async () => {
	const entry = fixture("/redirect", {
		status: 302,
		headers: { location: "/unmatched" },
		chunks: [Buffer.from("1234")],
	});
	const result = await transport().request({
		url: entry.url.href,
		redirect: "manual",
		maxResponseBytes: 4,
	});
	expect(result).toMatchObject({ status: 302, redirects: [], encodedBytes: 4 });
	expect(network.http).toHaveBeenCalledOnce();
});

it("preserves redirect error mode without consuming its body", async () => {
	const entry = fixture("/redirect", {
		status: 302,
		headers: { location: "/unmatched" },
	});
	const active = transport();
	await expect(
		active.request({
			url: entry.url.href,
			redirect: "error",
			maxResponseBytes: 0,
		}),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(entry.response.destroyed).toBe(true);
	expect(active.metrics()).toMatchObject({ encodedBytes: 0, decodedBytes: 0 });
});

it("retains aggregate session accounting after a rejected per-request chunk", async () => {
	const first = fixture("/first", { chunks: [Buffer.from("123")] });
	const second = fixture("/second", { chunks: [Buffer.from("456")] });
	const active = transport({ limits: { maxTotalBytes: 5 } });
	await expect(
		active.request({ url: first.url.href, maxResponseBytes: 2 }),
	).rejects.toMatchObject({ message: "Encoded response byte limit exceeded" });
	await expect(
		active.request({ url: second.url.href, maxResponseBytes: 3 }),
	).rejects.toMatchObject({ message: "Session network byte limit exceeded" });
	expect(active.metrics()).toMatchObject({ encodedBytes: 6, decodedBytes: 0 });
});

it("keeps decoded aggregate accounting authoritative across compressed responses", async () => {
	const encoded = gzipSync(Buffer.alloc(1000, 120));
	const first = fixture("/first", {
		chunks: [encoded],
		headers: { "content-encoding": "gzip" },
	});
	const second = fixture("/second", {
		chunks: [encoded],
		headers: { "content-encoding": "gzip" },
	});
	const active = transport({ limits: { maxTotalBytes: 1500 } });
	await active.request({ url: first.url.href, maxResponseBytes: 1000 });
	await expect(
		active.request({ url: second.url.href, maxResponseBytes: 1000 }),
	).rejects.toMatchObject({ message: "Session network byte limit exceeded" });
	expect(active.metrics().decodedBytes).toBe(2000);
});

it.each([0, 3, 4, 5, undefined, Number.MAX_SAFE_INTEGER])(
	"checks routed body size before copying with ceiling %s",
	async (maxResponseBytes) => {
		const body = new Uint8Array([1, 2, 3, 4]);
		const construct = vi.fn();
		vi.stubGlobal(
			"Uint8Array",
			new Proxy(Uint8Array, {
				construct(target, args, newTarget) {
					if (args[0] === body) construct();
					return Reflect.construct(target, args, newTarget);
				},
			}),
		);
		const active = transport({ limits: { maxResponseBytes: 4 } });
		const result = active.requestWithRoutes(
			{ url: "http://budget.test/data", maxResponseBytes },
			() => routed(body),
		);
		if (maxResponseBytes !== undefined && maxResponseBytes < 4) {
			await expect(result).rejects.toMatchObject({ code: "resource-limit" });
			expect(construct).not.toHaveBeenCalled();
		} else {
			const response = await result;
			expect(response.body).toEqual(body);
			expect(response.body).not.toBe(body);
			expect(construct).toHaveBeenCalledOnce();
		}
		expect(active.metrics()).toMatchObject({
			mockedRequests: 1,
			mockedDecodedBytes: 4,
			decodedBytes: 4,
			encodedBytes: 0,
		});
		expect(resolver).not.toHaveBeenCalled();
		expect(network.http).not.toHaveBeenCalled();
	},
);

it("does not let a routed response relax the configured ceiling", async () => {
	const active = transport({ limits: { maxResponseBytes: 3 } });
	await expect(
		active.requestWithRoutes(
			{ url: "http://budget.test/data", maxResponseBytes: 100 },
			() => routed(new Uint8Array(4)),
		),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it("snapshots before a route resolver can mutate the request", async () => {
	const request = { url: "http://budget.test/data", maxResponseBytes: 3 };
	await expect(
		transport().requestWithRoutes(request, () => {
			request.maxResponseBytes = 100;
			return routed(new Uint8Array(4));
		}),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it("preserves routed HEAD metadata and rejects illegal HEAD bodies", async () => {
	const active = transport();
	const request = {
		url: "http://budget.test/data",
		method: "HEAD",
		maxResponseBytes: 0,
	};
	const result = await active.requestWithRoutes(request, () =>
		routed(new Uint8Array(), { headers: { "content-length": ["999999999"] } }),
	);
	expect(result.headers["content-length"]).toEqual(["999999999"]);
	expect(result.body.length).toBe(0);
	await expect(
		active.requestWithRoutes(request, () => routed(new Uint8Array(1))),
	).rejects.toMatchObject({ code: "invalid-input" });
});

it.each(["manual", "follow"] as const)(
	"bounds routed redirect bodies before copying in %s mode",
	async (redirect) => {
		const route = vi.fn(() =>
			routed(new Uint8Array(5), {
				status: 302,
				headers: { location: ["/final"] },
			}),
		);
		await expect(
			transport().requestWithRoutes(
				{ url: "http://budget.test/data", redirect, maxResponseBytes: 4 },
				route,
			),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(route).toHaveBeenCalledOnce();
	},
);

it("keeps the ceiling when following a route into a streamed response", async () => {
	fixture("/final", { chunks: [Buffer.from("12345")] });
	const active = transport();
	await expect(
		active.requestWithRoutes(
			{ url: "http://budget.test/data", maxResponseBytes: 4 },
			({ url }) =>
				url.endsWith("/data")
					? routed(new Uint8Array(), {
							status: 302,
							headers: { location: ["/final"] },
						})
					: undefined,
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(active.metrics()).toMatchObject({
		requests: 2,
		redirects: 1,
		mockedRequests: 1,
	});
});

it("keeps shared session total accounting across routed and streamed responses", async () => {
	const entry = fixture("/wire", { chunks: [Buffer.from("123")] });
	const active = transport({ limits: { maxTotalBytes: 5 } });
	await active.requestWithRoutes(
		{ url: "http://budget.test/data", maxResponseBytes: 3 },
		() => routed(new Uint8Array(3)),
	);
	await expect(
		active.request({ url: entry.url.href, maxResponseBytes: 3 }),
	).rejects.toMatchObject({ message: "Session network byte limit exceeded" });
	expect(active.metrics()).toMatchObject({
		decodedBytes: 6,
		mockedDecodedBytes: 3,
		encodedBytes: 3,
	});
});

it("checks the routed session total before copying an otherwise allowed body", async () => {
	const active = transport({ limits: { maxTotalBytes: 5 } });
	const request = { url: "http://budget.test/data", maxResponseBytes: 3 };
	await active.requestWithRoutes(request, () => routed(new Uint8Array(3)));
	const body = new Uint8Array(3);
	const construct = vi.fn();
	vi.stubGlobal(
		"Uint8Array",
		new Proxy(Uint8Array, {
			construct(target, args, newTarget) {
				if (args[0] === body) construct();
				return Reflect.construct(target, args, newTarget);
			},
		}),
	);
	await expect(
		active.requestWithRoutes(request, () => routed(body)),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(construct).not.toHaveBeenCalled();
	expect(active.metrics()).toMatchObject({
		mockedDecodedBytes: 6,
		decodedBytes: 6,
	});
});

it("preserves response validation before routed byte admission", async () => {
	const active = transport();
	const request = { url: "http://budget.test/data", maxResponseBytes: 0 };
	for (const response of [
		routed(new Uint8Array(1), { encodedBytes: 1 }),
		routed(new Uint8Array(1), { url: "http://other.test/data" }),
		routed(new Uint8Array(1), { status: 204 }),
	]) {
		await expect(
			active.requestWithRoutes(request, () => response),
		).rejects.toMatchObject({ code: "invalid-input" });
	}
	expect(active.metrics()).toMatchObject({
		mockedRequests: 0,
		decodedBytes: 0,
	});
});

it("keeps the ceiling when a streamed redirect reaches a routed body", async () => {
	const entry = fixture("/redirect", {
		status: 302,
		headers: { location: "/data" },
	});
	const active = transport();
	await expect(
		active.requestWithRoutes(
			{ url: entry.url.href, maxResponseBytes: 4 },
			({ url }) =>
				url.endsWith("/data") ? routed(new Uint8Array(5)) : undefined,
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(entry.response.destroyed).toBe(true);
	expect(active.metrics()).toMatchObject({
		requests: 2,
		redirects: 1,
		mockedDecodedBytes: 5,
		encodedBytes: 0,
	});
});

it("retains existing redirect method rewriting and request body removal", async () => {
	const first = fixture("/redirect", {
		status: 303,
		headers: { location: "/final" },
	});
	const final = fixture("/final", { chunks: [Buffer.from("1234")] });
	const result = await transport().request({
		url: first.url.href,
		method: "POST",
		body: "request",
		maxResponseBytes: 4,
	});
	expect(result.body.length).toBe(4);
	expect(first.options?.method).toBe("POST");
	expect(final.options?.method).toBe("GET");
	expect(first.request?.end).toHaveBeenCalledWith(Buffer.from("request"));
	expect(final.request?.end).toHaveBeenCalledWith(undefined);
});

it("does not poison later requests after per-request rejection within session totals", async () => {
	const first = fixture("/first", { chunks: [Buffer.from("12345")] });
	const second = fixture("/second", { chunks: [Buffer.from("12345")] });
	const active = transport();
	await expect(
		active.request({ url: first.url.href, maxResponseBytes: 4 }),
	).rejects.toMatchObject({ code: "resource-limit" });
	const result = await active.request({
		url: second.url.href,
		maxResponseBytes: 5,
	});
	expect(result.body.length).toBe(5);
	expect(active.metrics()).toMatchObject({
		encodedBytes: 10,
		decodedBytes: 5,
		active: 0,
	});
});

it.each(
	["http", "https", "route"].flatMap((channel) =>
		["maxResponseBytes", "headers", "body", "header-value"].map((field) => ({
			channel,
			field,
		})),
	),
)(
	"rejects owner close during $field access before $channel admission",
	async ({ channel, field }) => {
		const active = transport();
		const url = `${channel === "https" ? "https" : "http"}://budget.test/reentrant`;
		const read = vi.fn(() => {
			active.close();
			return field === "maxResponseBytes"
				? 8
				: field === "headers"
					? { "x-safe": "1" }
					: "payload";
		});
		const request: NetworkRequest = { url, method: "POST", body: "payload" };
		if (field === "header-value") {
			request.headers = Object.defineProperty({}, "x-safe", {
				enumerable: true,
				get: read,
			});
		} else {
			Object.defineProperty(request, field, { enumerable: true, get: read });
		}
		network.http.mockImplementation((options, callback) => {
			fixture(url, { chunks: [] });
			return dispatch(false, options, callback);
		});
		network.https.mockImplementation((options, callback) => {
			fixture(url, { chunks: [] });
			return dispatch(true, options, callback);
		});
		const route = vi.fn(() => routed(new Uint8Array(), { url }));
		const result = await (channel === "route"
			? active.requestWithRoutes(request, route)
			: active.request(request)
		).then(
			() => "fulfilled",
			(error: unknown) => (error as { code: string }).code,
		);
		expect({
			result,
			reads: read.mock.calls.length,
			requests: active.metrics().requests,
			active: active.metrics().active,
			closed: active.metrics().closed,
			dns: resolver.mock.calls.length,
			http: network.http.mock.calls.length,
			https: network.https.mock.calls.length,
			routes: route.mock.calls.length,
		}).toEqual({
			result: "closed",
			reads: 1,
			requests: 0,
			active: 0,
			closed: true,
			dns: 0,
			http: 0,
			https: 0,
			routes: 0,
		});
	},
);

it("snapshots the body accessor once for validation, copying and default headers", async () => {
	const entry = fixture("/body-snapshot", { chunks: [] });
	const read = vi.fn(() => "original");
	await transport().request({
		url: entry.url.href,
		method: "POST",
		get body() {
			return read();
		},
		maxResponseBytes: 0,
	});
	expect(read).toHaveBeenCalledOnce();
	expect(entry.request?.end).toHaveBeenCalledWith(Buffer.from("original"));
	expect(entry.options?.headers).toMatchObject({
		"content-type": "text/plain;charset=UTF-8",
	});
});

function pageTransport() {
	const cookieJar = new CookieJar();
	cleanup.push(() => cookieJar.close());
	return transport({ cookieJar });
}

function pageFetch(
	request: PageFetchTransport,
	limits: Partial<PageFetchLimits> = {},
	document?: DocumentTree,
) {
	const tree = document ?? new DocumentTree("http://budget.test/page");
	if (!document) cleanup.push(() => tree.close());
	const provider = vi.fn(request);
	const owner = new PageFetch(
		tree,
		{
			createHostObject(definition: ScriptHostObjectDefinition) {
				const capability = { ...definition.methods };
				for (const [name, descriptor] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(capability, name, descriptor);
				return capability;
			},
		},
		provider,
		{ limits: { maxResponseBytes: 4, maxTotalBytes: 8, ...limits } },
	);
	cleanup.push(() => owner.close());
	const fetch = async (path = "/data", init?: unknown) =>
		(await owner.fetch(path, init)) as { text(): Promise<string> };
	return { owner, provider, fetch };
}

it("forwards the page response ceiling before native body retention", async () => {
	fixture("/data", { chunks: [Buffer.from("data")] });
	const active = pageTransport();
	const page = pageFetch((input) => active.request(input));
	expect(await (await page.fetch()).text()).toBe("data");
	expect(page.provider.mock.calls[0][0].maxResponseBytes).toBe(4);
	expect(page.owner.metrics()).toMatchObject({
		totalBytes: 4,
		retainedBytes: 0,
	});
});

it("rejects an oversized page stream before decoded retention without claiming page partial-byte accounting", async () => {
	fixture("/data", { chunks: [Buffer.from("large")] });
	const active = pageTransport();
	const page = pageFetch((input) => active.request(input));
	await expect(page.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(active.metrics()).toMatchObject({
		encodedBytes: 5,
		decodedBytes: 0,
		active: 0,
	});
	expect(page.owner.metrics()).toMatchObject({
		totalBytes: 0,
		retainedBytes: 0,
		active: 0,
	});
});

it("lowers each dispatched ceiling to the remaining cumulative page allowance", async () => {
	fixture("/first", { chunks: [Buffer.from("abc")] });
	fixture("/last", { chunks: [Buffer.from("de")] });
	const active = pageTransport();
	const page = pageFetch((input) => active.request(input), {
		maxTotalBytes: 5,
	});
	expect(await (await page.fetch("/first")).text()).toBe("abc");
	expect(await (await page.fetch("/last")).text()).toBe("de");
	await expect(page.fetch("/never-sent")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(
		page.provider.mock.calls.map(([input]) => input.maxResponseBytes),
	).toEqual([4, 2]);
	expect(network.http).toHaveBeenCalledTimes(2);
	expect(page.owner.metrics()).toMatchObject({
		totalBytes: 5,
		retainedBytes: 0,
	});
});

it("preserves the page ceiling through manually followed redirect hops", async () => {
	fixture("/redirect", {
		chunks: [],
		status: 302,
		headers: { location: "/final" },
	});
	fixture("/final", { chunks: [Buffer.from("done")] });
	const active = pageTransport();
	const page = pageFetch((input) => active.request(input));
	expect(await (await page.fetch("/redirect")).text()).toBe("done");
	expect(
		page.provider.mock.calls.map(([input]) => [
			new URL(input.url).pathname,
			input.maxResponseBytes,
		]),
	).toEqual([
		["/redirect", 4],
		["/final", 4],
	]);
});

it("applies the page ceiling to CORS preflight and the permitted final request", async () => {
	const url = "http://other.test/data";
	fixture(url, {
		chunks: [],
		status: 204,
		headers: {
			"access-control-allow-origin": "http://budget.test",
			"access-control-allow-methods": "POST",
			"access-control-allow-headers": "x-custom",
		},
	});
	fixture(url, {
		chunks: [Buffer.from("done")],
		headers: { "access-control-allow-origin": "http://budget.test" },
	});
	const active = pageTransport();
	const page = pageFetch((input) => active.request(input));
	expect(
		await (
			await page.fetch(url, { method: "POST", headers: { "x-custom": "yes" } })
		).text(),
	).toBe("done");
	expect(
		page.provider.mock.calls.map(([input]) => [
			input.method,
			input.maxResponseBytes,
		]),
	).toEqual([
		["OPTIONS", 4],
		["POST", 4],
	]);
});

it("propagates the page ceiling through the actual session fetch port", async () => {
	fixture("/page", {
		chunks: [Buffer.from("<!doctype html><p>ready</p>")],
		headers: { "content-type": "text/html" },
	});
	let active!: NodeNetworkTransport;
	const session = new BrowserSession({
		createTransport: (cookieJar) => {
			active = transport({ cookieJar });
			return active;
		},
		loadDocument: loadBrowserDocument,
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	cleanup.push(() => host.close());
	await host.execute(["open", "http://budget.test/page"]);
	const current = session.page(session.tabs()[0].id);
	if (!current.fetch) throw new Error("Missing committed page fetch port");
	const page = pageFetch(current.fetch, {}, current.document);
	const decodedBefore = active.metrics().decodedBytes;
	fixture("/resource", { chunks: [Buffer.from("excess")] });
	await expect(page.fetch("/resource")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(active.metrics().decodedBytes).toBe(decodedBefore);
	expect(page.owner.metrics()).toMatchObject({ totalBytes: 0, active: 0 });
});

it("keeps final page checks when a custom provider ignores the optional ceiling", async () => {
	const page = pageFetch(
		async (input) => routed(Buffer.from("large"), { url: input.url }),
		{ maxTotalBytes: 4 },
	);
	await expect(page.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	await expect(page.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(page.provider).toHaveBeenCalledTimes(1);
	expect(page.provider.mock.calls[0][0].maxResponseBytes).toBe(4);
	expect(page.owner.metrics().totalBytes).toBe(5);
});

it("isolates different page ceilings sharing the same native transport", async () => {
	fixture("/small", { chunks: [Buffer.from("large")] });
	fixture("/large", { chunks: [Buffer.from("larger")] });
	const active = pageTransport();
	const small = pageFetch((input) => active.request(input));
	const large = pageFetch((input) => active.request(input), {
		maxResponseBytes: 8,
	});
	const results = await Promise.allSettled([
		small.fetch("/small"),
		large.fetch("/large"),
	]);
	expect(results[0].status).toBe("rejected");
	expect(results[1].status).toBe("fulfilled");
	if (results[1].status !== "fulfilled") throw new Error("Larger page failed");
	expect(await results[1].value.text()).toBe("larger");
	expect(small.provider.mock.calls[0][0].maxResponseBytes).toBe(4);
	expect(large.provider.mock.calls[0][0].maxResponseBytes).toBe(8);
	expect(active.metrics().active).toBe(0);
});
