import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CookieJar } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkRequest } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import {
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";
import {
	type ResponseAccountingWriter,
	ResponseByteAccounting,
} from "./response-byte-accounting.js";

const network = vi.hoisted(() => ({
	request: vi.fn(),
	blocked: vi.fn(() => {
		throw new Error("Network access is forbidden in response prefix tests");
	}),
}));

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

vi.mock("node:dns/promises", () => ({ Resolver: network.blocked }));

interface ResponsePlan {
	chunks: readonly Uint8Array[];
	encoding: string;
	status?: number;
	rawHeaders?: string[];
	stream?: Readable;
	onRequest?: (request: EventEmitter) => void;
}

interface StreamConsumer {
	consume(
		response: Readable,
		contentEncoding: string,
		signal: AbortSignal,
		maxResponseBytes: number,
		accounting?: ResponseAccountingWriter,
		onPrefix?: (
			error: AgentBrowserError,
			prefix: {
				body: Uint8Array;
				encodedBytes: number;
				decodedBytes: number;
				limit: number;
			},
		) => void,
		onPrefixError?: (error: AgentBrowserError) => void,
	): Promise<{ body: Uint8Array; encodedBytes: number }>;
}

const fixtureUrl = "https://prefix.fixture.invalid/body.css";
const publicAddress = "93.184.216.34";
const body = Buffer.from("prefix: λ🙂 response bytes\n".repeat(128));
const responseLimit = 256;
const prefixLimit = 37;
const plans: ResponsePlan[] = [];
const streams: Readable[] = [];
const transports: NodeNetworkTransport[] = [];
const pending: Promise<unknown>[] = [];
const cleanup: (() => void)[] = [];
const codecs = [
	{ encoding: "gzip", compress: gzipSync },
	{ encoding: "deflate", compress: deflateSync },
	{ encoding: "br", compress: brotliCompressSync },
	{
		encoding: "gzip, br",
		compress: (bytes: Uint8Array) => brotliCompressSync(gzipSync(bytes)),
	},
	{
		encoding: "deflate, gzip, br",
		compress: (bytes: Uint8Array) =>
			brotliCompressSync(gzipSync(deflateSync(bytes))),
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	network.request.mockImplementation(
		(
			options: RequestOptions,
			callback: (response: IncomingMessage) => void,
		) => {
			expect(options.hostname).toBe(publicAddress);
			expect(options.agent).toBe(false);
			const plan = plans.shift();
			if (!plan) throw new Error("Unexpected mocked HTTP exchange");
			const response = Object.assign(
				plan.stream ?? Readable.from(plan.chunks, { objectMode: false }),
				{
					statusCode: plan.status ?? 200,
					headers: { "content-encoding": plan.encoding },
					rawHeaders: plan.rawHeaders ?? [
						"Content-Encoding",
						plan.encoding,
						"Content-Type",
						"text/css",
						"Cache-Control",
						"public, max-age=3600",
					],
				},
			);
			streams.push(response);
			const request = Object.assign(new EventEmitter(), {
				destroy: vi.fn(() => request),
				end: vi.fn(() => {
					queueMicrotask(() =>
						callback(response as unknown as IncomingMessage),
					);
					return request;
				}),
			});
			plan.onRequest?.(request);
			return request;
		},
	);
});

afterEach(async () => {
	for (const active of transports.splice(0)) active.close();
	for (const stream of streams.splice(0)) stream.destroy();
	for (const release of cleanup.splice(0)) release();
	await Promise.allSettled(pending.splice(0));
	plans.splice(0);
	expect(network.blocked).not.toHaveBeenCalled();
	vi.restoreAllMocks();
});

function track<Result>(operation: Promise<Result>): Promise<Result> {
	void operation.catch(() => undefined);
	pending.push(operation);
	return operation;
}

function transport(options: NodeTransportOptions = {}) {
	const active = new NodeNetworkTransport({
		...options,
		limits: { maxResponseBytes: responseLimit, ...options.limits },
		resolver: async (hostname, signal) => {
			expect(hostname).toBe("prefix.fixture.invalid");
			expect(signal.aborted).toBe(false);
			return [publicAddress];
		},
	});
	transports.push(active);
	return active;
}

function respond(
	wire: Uint8Array,
	encoding = "identity",
	options: Partial<ResponsePlan> = {},
) {
	plans.push({ chunks: [wire], encoding, ...options });
}

function request(
	active: NodeNetworkTransport,
	options: Partial<NetworkRequest> = {},
) {
	return track(active.request({ url: fixtureUrl, ...options }));
}

async function failure(operation: Promise<unknown>): Promise<unknown> {
	try {
		await operation;
	} catch (error) {
		return error;
	}
	throw new Error("Expected the mocked response to fail");
}

function observeConsumption(active: NodeNetworkTransport) {
	const consumer = active as unknown as StreamConsumer;
	const consume = consumer.consume.bind(consumer);
	const operations: ReturnType<StreamConsumer["consume"]>[] = [];
	vi.spyOn(consumer, "consume").mockImplementation((...arguments_) => {
		const operation = track(consume(...arguments_));
		operations.push(operation);
		return operation;
	});
	return operations;
}

function gatedResponse(
	options: {
		forwardError?: boolean;
		delayed?: boolean;
		requestError?: Error;
	} = {},
) {
	let client: EventEmitter | undefined;
	let notify!: (result: { error: Error | null; finish: () => void }) => void;
	const destroying = new Promise<{ error: Error | null; finish: () => void }>(
		(resolve) => {
			notify = resolve;
		},
	);
	let sent = false;
	const stream = new Readable({
		read() {
			if (sent) return;
			sent = true;
			this.push(gzipSync(body));
		},
		destroy(error, callback) {
			let finished = false;
			const finish = () => {
				if (finished) return;
				finished = true;
				callback(error);
			};
			cleanup.push(finish);
			if (options.requestError) client?.emit("error", options.requestError);
			if (options.forwardError && error) client?.emit("error", error);
			notify({ error, finish });
			if (options.delayed === false) finish();
		},
	});
	respond(new Uint8Array(), "gzip", {
		stream,
		onRequest: (request) => {
			client = request;
		},
	});
	return destroying;
}

it.each([
	0,
	-1,
	1.5,
	65_537,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	null,
	"37",
	true,
])(
	"rejects invalid captureDecodedPrefixBytes %s before any exchange",
	(value) => {
		expect(() =>
			transport({ captureDecodedPrefixBytes: value as number }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(network.request).not.toHaveBeenCalled();
	},
);

it.each([undefined, prefixLimit])(
	"keeps decoded failures strict and fully accounted with capture %s",
	async (capture) => {
		const active = transport(
			capture === undefined ? {} : { captureDecodedPrefixBytes: capture },
		);
		const wire = gzipSync(body);
		const accounting = new ResponseByteAccounting(16_384, 1);
		cleanup.push(() => accounting.close());
		const lease = accounting.createLease();
		respond(wire, "gzip");
		const error = await failure(request(active, { responseAccounting: lease }));
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "network.response-decoded",
			unit: "bytes",
			limit: responseLimit,
			observed: body.byteLength,
		});
		if (capture === undefined)
			expect(active.responsePrefix(error)).toBeUndefined();
		else
			expect(active.responsePrefix(error)?.body).toEqual(
				new Uint8Array(body.subarray(0, capture)),
			);
		expect(active.metrics()).toMatchObject({
			encodedBytes: wire.byteLength,
			decodedBytes: body.byteLength,
			active: 0,
		});
		expect(accounting.settle(lease)).toBe(false);
		expect(accounting.metrics()).toMatchObject({
			observedEncodedBytes: wire.byteLength,
			observedDecodedBytes: body.byteLength,
			completedOnlyBytes: 0,
			nativeRequests: 1,
			unmeteredFailures: 0,
			outstanding: 0,
			draining: 0,
		});
	},
);

it.each(codecs)(
	"captures the exact first bytes of a $encoding first-chunk overshoot without replacing the failure",
	async ({ encoding, compress }) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		const operations = observeConsumption(active);
		const wire = compress(body);
		expect(wire.byteLength).toBeLessThan(responseLimit);
		respond(wire, encoding);
		const error = await failure(request(active));
		expect(operations).toHaveLength(1);
		expect(await failure(operations[0])).toBe(error);
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind: "network.response-decoded",
			limit: responseLimit,
			observed: body.byteLength,
		});
		const prefix = active.responsePrefix(error);
		expect(prefix).toEqual({
			kind: "decoded-response-prefix-v1",
			complete: false,
			url: fixtureUrl,
			status: 200,
			headers: {
				"content-encoding": [encoding],
				"content-type": ["text/css"],
				"cache-control": ["public, max-age=3600"],
			},
			body: new Uint8Array(body.subarray(0, prefixLimit)),
			encodedBytes: wire.byteLength,
			decodedBytes: body.byteLength,
			limit: responseLimit,
		});
		expect(active.metrics()).toMatchObject({
			encodedBytes: wire.byteLength,
			decodedBytes: body.byteLength,
			active: 0,
		});
		expect(streams[0].destroyed).toBe(true);
	},
);

it.each(codecs)(
	"captures $encoding split into one-byte wire chunks",
	async ({ encoding, compress }) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		const wire = compress(body);
		respond(wire, encoding, {
			chunks: Array.from(wire, (byte) => Uint8Array.of(byte)),
		});
		const error = await failure(request(active));
		const prefix = active.responsePrefix(error);
		expect(prefix).toBeDefined();
		expect(prefix?.body).toEqual(new Uint8Array(body.subarray(0, prefixLimit)));
		expect(prefix?.decodedBytes).toBeGreaterThan(responseLimit);
		expect(prefix?.decodedBytes).toBeLessThanOrEqual(body.byteLength);
		expect(prefix?.encodedBytes).toBeGreaterThan(0);
		expect(prefix?.encodedBytes).toBeLessThanOrEqual(wire.byteLength);
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind: "network.response-decoded",
			observed: prefix?.decodedBytes,
		});
		expect(active.metrics()).toMatchObject({
			encodedBytes: prefix?.encodedBytes,
			decodedBytes: prefix?.decodedBytes,
		});
	},
);

it.each([
	{ capture: 1, requested: 128, expected: 1 },
	{ capture: 200, requested: 128, expected: 128 },
	{ capture: 65_536, requested: 1024, expected: responseLimit },
])(
	"bounds capture $capture by effective request cap $requested",
	async ({ capture, requested, expected }) => {
		const active = transport({ captureDecodedPrefixBytes: capture });
		const wire = gzipSync(body);
		expect(wire.byteLength).toBeLessThan(Math.min(requested, responseLimit));
		respond(wire, "gzip");
		const error = await failure(
			request(active, { maxResponseBytes: requested }),
		);
		expect(active.responsePrefix(error)).toMatchObject({
			limit: Math.min(requested, responseLimit),
			body: new Uint8Array(body.subarray(0, expected)),
		});
	},
);

it("retains the maximum prefix across multiple decoded chunks", async () => {
	const largeBody = Buffer.alloc(98_304, 0x61);
	largeBody.set(body);
	const active = transport({
		captureDecodedPrefixBytes: 65_536,
		limits: { maxResponseBytes: 70_000 },
	});
	respond(gzipSync(largeBody), "gzip");
	const error = await failure(request(active));
	const prefix = active.responsePrefix(error);
	expect(prefix?.body).toEqual(new Uint8Array(largeBody.subarray(0, 65_536)));
	expect(prefix?.limit).toBe(70_000);
	expect(prefix?.decodedBytes).toBeGreaterThan(70_000);
	expect(prefix?.decodedBytes).toBeLessThanOrEqual(largeBody.byteLength);
});

it("freezes metadata, copies bytes on every read, and forgets captures on close", async () => {
	const active = transport({ captureDecodedPrefixBytes: prefixLimit });
	const wire = gzipSync(body);
	const rawHeaders = [
		"Content-Encoding",
		"gzip",
		"X-Trace",
		"first",
		"X-Trace",
		"second",
	];
	respond(wire, "gzip", { rawHeaders });
	const error = await failure(request(active));
	const prefix = active.responsePrefix(error);
	if (!prefix) throw new Error("Expected retained prefix");
	expect(Object.isFrozen(prefix)).toBe(true);
	expect(Object.isFrozen(prefix.headers)).toBe(true);
	for (const values of Object.values(prefix.headers))
		expect(Object.isFrozen(values)).toBe(true);
	expect(prefix.headers["x-trace"]).toEqual(["first", "second"]);
	expect(prefix.body).toBeInstanceOf(Uint8Array);
	const expected = new Uint8Array(body.subarray(0, prefixLimit));
	rawHeaders.fill("changed");
	wire.fill(0);
	prefix.body.fill(0);
	const reread = active.responsePrefix(error);
	expect(reread?.body).not.toBe(prefix.body);
	expect(reread?.body.buffer).not.toBe(prefix.body.buffer);
	expect(reread?.body).toEqual(expected);
	expect(reread?.headers["x-trace"]).toEqual(["first", "second"]);
	active.close();
	expect(active.responsePrefix(error)).toBeUndefined();
	expect(reread?.body).toEqual(expected);
	active.close();
	expect(active.responsePrefix(error)).toBeUndefined();
});

it("binds retained bytes to each original error and its owning transport", async () => {
	const active = transport({ captureDecodedPrefixBytes: prefixLimit });
	const other = transport({ captureDecodedPrefixBytes: prefixLimit });
	respond(gzipSync(body), "gzip");
	const first = await failure(request(active));
	const secondBody = Buffer.alloc(body.byteLength, 0x7a);
	respond(gzipSync(secondBody), "gzip");
	const second = await failure(request(active));
	expect(second).not.toBe(first);
	expect(active.responsePrefix(first)?.body).toEqual(
		new Uint8Array(body.subarray(0, prefixLimit)),
	);
	expect(active.responsePrefix(second)?.body).toEqual(
		new Uint8Array(secondBody.subarray(0, prefixLimit)),
	);
	expect(other.responsePrefix(first)).toBeUndefined();
	const getter = vi.fn(() => {
		throw new Error("Must not inspect forged properties");
	});
	const forged = Object.defineProperty({}, "responsePrefix", { get: getter });
	for (const error of [
		undefined,
		null,
		"resource-limit",
		42,
		forged,
		{ ...Object(first) },
		new AgentBrowserError(
			"resource-limit",
			"Decoded response byte limit exceeded",
		),
		resourceLimitError(
			"network.response-decoded",
			responseLimit,
			body.byteLength,
			"forged",
		),
		new Error("wrapped", { cause: first }),
	])
		expect(active.responsePrefix(error)).toBeUndefined();
	expect(getter).not.toHaveBeenCalled();
});

it("reports the failing redirect hop rather than the original navigation", async () => {
	const active = transport({ captureDecodedPrefixBytes: prefixLimit });
	respond(new Uint8Array(), "identity", {
		status: 302,
		rawHeaders: ["Location", "/failed?hop=2", "X-Hop", "redirect"],
	});
	respond(gzipSync(body), "gzip", {
		status: 503,
		rawHeaders: ["Content-Encoding", "gzip", "X-Hop", "failed"],
	});
	const error = await failure(request(active));
	expect(active.responsePrefix(error)).toMatchObject({
		url: "https://prefix.fixture.invalid/failed?hop=2",
		status: 503,
		headers: { "content-encoding": ["gzip"], "x-hop": ["failed"] },
	});
	expect(active.responsePrefix(error)?.headers.location).toBeUndefined();
	expect(active.metrics()).toMatchObject({ requests: 2, redirects: 1 });
	expect(network.request).toHaveBeenCalledTimes(2);
});

it.each(["http:", "https:"])(
	"captures through the mocked %s request export",
	async (protocol) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		const url = fixtureUrl.replace("https:", protocol);
		respond(gzipSync(body), "gzip");
		const error = await failure(request(active, { url }));
		expect(active.responsePrefix(error)?.url).toBe(url);
	},
);

it.each(["identity", "gzip", "deflate", "br"])(
	"does not capture successful or exact-cap %s responses",
	async (encoding) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		for (const size of [0, 128, responseLimit]) {
			const complete = Buffer.alloc(size, 0x61);
			const codec = codecs.find((candidate) => candidate.encoding === encoding);
			respond(codec ? codec.compress(complete) : complete, encoding);
			const result = await request(active);
			expect(Buffer.from(result.body)).toEqual(complete);
			expect(active.responsePrefix(result)).toBeUndefined();
		}
	},
);

it.each([
	{
		name: "encoded response overflow",
		wire: Buffer.alloc(257),
		encoding: "identity",
		limits: {},
		kind: "network.response-encoded",
		code: "resource-limit",
	},
	{
		name: "encoded session overflow",
		wire: Buffer.alloc(257),
		encoding: "identity",
		limits: { maxTotalBytes: 128 },
		kind: "network.session-encoded",
		code: "resource-limit",
	},
	{
		name: "decoded session overflow",
		wire: gzipSync(body),
		encoding: "gzip",
		limits: { maxTotalBytes: 512 },
		kind: "network.session-decoded",
		code: "resource-limit",
	},
	{
		name: "invalid gzip",
		wire: Buffer.from("not gzip"),
		encoding: "gzip",
		limits: {},
		kind: undefined,
		code: "network-error",
	},
	{
		name: "invalid deflate",
		wire: Buffer.from("not deflate"),
		encoding: "deflate",
		limits: {},
		kind: undefined,
		code: "network-error",
	},
	{
		name: "truncated gzip after decoded output",
		wire: gzipSync(Buffer.alloc(128, 0x61)).subarray(0, -4),
		encoding: "gzip",
		limits: {},
		kind: undefined,
		code: "network-error",
	},
	{
		name: "unsupported encoding",
		wire: gzipSync(body),
		encoding: "zstd",
		limits: {},
		kind: undefined,
		code: "unsupported",
	},
	{
		name: "unsupported encoding stack",
		wire: gzipSync(body),
		encoding: "gzip, identity, identity, identity",
		limits: {},
		kind: undefined,
		code: "unsupported",
	},
])("does not capture $name", async ({ wire, encoding, limits, kind, code }) => {
	const active = transport({ captureDecodedPrefixBytes: prefixLimit, limits });
	respond(wire, encoding);
	const error = await failure(request(active));
	expect(error).toMatchObject({ code });
	expect(resourceLimitDiagnostic(error)?.kind).toBe(kind);
	expect(active.responsePrefix(error)).toBeUndefined();
});

it.each(["encoded", "decoded"])(
	"does not capture a %s accounting failure",
	async (dimension) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		const accounting = new ResponseByteAccounting(256, 1);
		cleanup.push(() => accounting.close());
		const lease = accounting.createLease();
		respond(
			dimension === "encoded" ? Buffer.alloc(257) : gzipSync(body),
			dimension === "encoded" ? "identity" : "gzip",
		);
		const error = await failure(request(active, { responseAccounting: lease }));
		expect(error).toMatchObject({
			code: "resource-limit",
			message: "Fetch response body limit exceeded",
		});
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		expect(active.responsePrefix(error)).toBeUndefined();
		accounting.settle(lease);
		expect(accounting.metrics()).toMatchObject({
			nativeRequests: 1,
			outstanding: 0,
			draining: 0,
			completedOnlyBytes: 0,
		});
	},
);

it.each(["encodedBytes", "decodedBytes"] as const)(
	"does not mistake a throwing %s accounting writer for its own decoded overflow",
	async (dimension) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		const thrown = resourceLimitError(
			"network.response-decoded",
			responseLimit,
			body.byteLength,
			"Accounting writer failure",
		);
		const source = Readable.from([gzipSync(body)], { objectMode: false });
		streams.push(source);
		const onPrefix = vi.fn();
		const onPrefixError = vi.fn();
		const writer: ResponseAccountingWriter = {
			debit: (kind) => {
				if (kind === dimension) throw thrown;
				return true;
			},
			remainingBytes: () => 16_384,
			finish: vi.fn(),
		};
		const error = await failure(
			track(
				(active as unknown as StreamConsumer).consume(
					source,
					"gzip",
					new AbortController().signal,
					responseLimit,
					writer,
					onPrefix,
					onPrefixError,
				),
			),
		);
		expect(error).toBe(thrown);
		expect(onPrefix).not.toHaveBeenCalled();
		expect(onPrefixError).not.toHaveBeenCalled();
		expect(active.responsePrefix(error)).toBeUndefined();
	},
);

it("waits for pipeline destruction before publishing a prefix", async () => {
	const active = transport({ captureDecodedPrefixBytes: prefixLimit });
	const operations = observeConsumption(active);
	const destroying = gatedResponse();
	const failed = failure(request(active));
	let settled = false;
	void failed.then(() => {
		settled = true;
	});
	const gate = await destroying;
	expect(resourceLimitDiagnostic(gate.error)?.kind).toBe(
		"network.response-decoded",
	);
	expect(active.responsePrefix(gate.error)).toBeUndefined();
	expect(settled).toBe(false);
	gate.finish();
	const error = await failed;
	expect(error).toBe(gate.error);
	expect(await failure(operations[0])).toBe(error);
	expect(active.responsePrefix(error)?.body).toEqual(
		new Uint8Array(body.subarray(0, prefixLimit)),
	);
});

it.each([
	{ action: "abort", forwardError: false },
	{ action: "close", forwardError: false },
	{ action: "abort", forwardError: true },
	{ action: "close", forwardError: true },
])(
	"discards a pending prefix when $action wins during teardown with forwarded error $forwardError",
	async ({ action, forwardError }) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		const operations = observeConsumption(active);
		const controller = new AbortController();
		const reason = new AgentBrowserError("aborted", "Synthetic cancellation");
		const destroying = gatedResponse({ forwardError });
		const failed = failure(request(active, { signal: controller.signal }));
		const gate = await destroying;
		expect(resourceLimitDiagnostic(gate.error)?.kind).toBe(
			"network.response-decoded",
		);
		if (action === "abort") controller.abort(reason);
		else active.close();
		const error = await failed;
		expect(error).toMatchObject({
			code: action === "abort" ? "aborted" : "closed",
		});
		if (action === "abort")
			expect(error).toMatchObject({ message: "Request aborted" });
		expect(active.responsePrefix(error)).toBeUndefined();
		expect(active.responsePrefix(gate.error)).toBeUndefined();
		gate.finish();
		await Promise.allSettled(operations);
		expect(active.responsePrefix(error)).toBeUndefined();
		expect(active.responsePrefix(gate.error)).toBeUndefined();
	},
);

it.each([false, true])(
	"publishes before public rejection when response destruction forwards the exact request error (delayed: %s)",
	async (delayed) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		const operations = observeConsumption(active);
		const destroying = gatedResponse({ forwardError: true, delayed });
		const failed = failure(request(active));
		let settled = false;
		void failed.then(() => {
			settled = true;
		});
		if (delayed) {
			const gate = await destroying;
			expect(resourceLimitDiagnostic(gate.error)?.kind).toBe(
				"network.response-decoded",
			);
			expect(active.responsePrefix(gate.error)).toBeUndefined();
			expect(settled).toBe(false);
			gate.finish();
		}
		const error = await failed;
		const prefix = active.responsePrefix(error);
		expect(prefix?.body).toEqual(new Uint8Array(body.subarray(0, prefixLimit)));
		expect(prefix?.decodedBytes).toBe(body.byteLength);
		expect(error).toBe((await destroying).error);
		expect(await failure(operations[0])).toBe(error);
	},
);

it("does not defer or capture when a different typed request error wins during teardown", async () => {
	const active = transport({ captureDecodedPrefixBytes: prefixLimit });
	const operations = observeConsumption(active);
	const unrelated = resourceLimitError(
		"network.response-decoded",
		responseLimit,
		body.byteLength,
		"Unrelated request error",
	);
	const destroying = gatedResponse({
		forwardError: true,
		requestError: unrelated,
	});
	const failed = failure(request(active));
	const gate = await destroying;
	const error = await failed;
	expect(error).toBe(unrelated);
	expect(error).not.toBe(gate.error);
	expect(active.responsePrefix(error)).toBeUndefined();
	expect(active.responsePrefix(gate.error)).toBeUndefined();
	gate.finish();
	await Promise.allSettled(operations);
	expect(active.responsePrefix(error)).toBeUndefined();
	expect(active.responsePrefix(gate.error)).toBeUndefined();
});

it("preserves default-off request error ordering during delayed response destruction", async () => {
	const active = transport();
	const operations = observeConsumption(active);
	const destroying = gatedResponse({ forwardError: true });
	const failed = failure(request(active));
	const gate = await destroying;
	const error = await failed;
	expect(error).toBe(gate.error);
	expect(resourceLimitDiagnostic(error)?.kind).toBe("network.response-decoded");
	expect(active.responsePrefix(error)).toBeUndefined();
	gate.finish();
	await Promise.allSettled(operations);
	expect(active.responsePrefix(error)).toBeUndefined();
});

it.each(["abort", "close"])(
	"discards staged capture when %s wins after consumption but before public settlement",
	async (action) => {
		const active = transport({ captureDecodedPrefixBytes: prefixLimit });
		const controller = new AbortController();
		const operations = observeConsumption(active);
		const destroying = gatedResponse({ forwardError: true });
		const failed = failure(request(active, { signal: controller.signal }));
		const gate = await destroying;
		void operations[0].catch(() => {
			if (action === "abort") controller.abort();
			else active.close();
		});
		gate.finish();
		const error = await failed;
		expect(error).toMatchObject({
			code: action === "abort" ? "aborted" : "closed",
		});
		expect(active.responsePrefix(error)).toBeUndefined();
		expect(active.responsePrefix(gate.error)).toBeUndefined();
		expect(active.metrics().active).toBe(0);
	},
);

it("rejects a pre-aborted request without an exchange or prefix", async () => {
	const active = transport({ captureDecodedPrefixBytes: prefixLimit });
	const controller = new AbortController();
	const reason = new AgentBrowserError("aborted", "Already cancelled");
	controller.abort(reason);
	const error = await failure(request(active, { signal: controller.signal }));
	expect(error).toMatchObject({ code: "aborted", message: "Request aborted" });
	expect(active.responsePrefix(error)).toBeUndefined();
	expect(network.request).not.toHaveBeenCalled();
});

it("never promotes a failed prefix into the resource cache", async () => {
	const cookieJar = new CookieJar();
	cleanup.push(() => cookieJar.close());
	const active = transport({
		captureDecodedPrefixBytes: prefixLimit,
		resourceCache: {},
		cookieJar,
	});
	const options: Partial<NetworkRequest> = {
		resourceReuse: "stylesheet",
		redirect: "manual",
		cookieContext: {
			siteUrl: fixtureUrl,
			credentials: "omit",
			topLevelNavigation: false,
			crossSiteRedirect: false,
		},
	};
	respond(gzipSync(body), "gzip");
	const error = await failure(request(active, options));
	expect(active.responsePrefix(error)).toBeDefined();
	expect(active.metrics()).toMatchObject({ cacheEntries: 0, cacheHits: 0 });
	const complete = Buffer.from("body{color:red}");
	respond(complete, "identity", {
		rawHeaders: [
			"Content-Encoding",
			"identity",
			"Content-Type",
			"text/css",
			"Cache-Control",
			"public, max-age=3600",
			"Date",
			new Date().toUTCString(),
		],
	});
	const fresh = await request(active, options);
	expect(fresh.delivery).toBeUndefined();
	expect(Buffer.from(fresh.body)).toEqual(complete);
	expect(active.responsePrefix(fresh)).toBeUndefined();
	expect(active.metrics()).toMatchObject({ cacheEntries: 1, cacheHits: 0 });
	const cached = await request(active, options);
	expect(cached.delivery).toBe("memory-cache");
	expect(Buffer.from(cached.body)).toEqual(complete);
	expect(active.metrics()).toMatchObject({
		cacheEntries: 1,
		cacheHits: 1,
		requests: 2,
	});
	expect(network.request).toHaveBeenCalledTimes(2);
	expect(active.responsePrefix(error)?.body).toEqual(
		new Uint8Array(body.subarray(0, prefixLimit)),
	);
});
