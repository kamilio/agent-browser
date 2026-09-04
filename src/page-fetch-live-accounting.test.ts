import { EventEmitter, getEventListeners } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { CookieJar } from "./cookies.js";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import type { NetworkRequest } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
import { ResponseByteAccounting } from "./response-byte-accounting.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { BrowserSession } from "./session.js";

const network = vi.hoisted(() => ({
	http: vi.fn(),
	https: vi.fn(),
	blocked: vi.fn(() => {
		throw new Error(
			"Actual network access is forbidden in live accounting tests",
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

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

class ResponseStream extends PassThrough {
	holdDestroy = false;
	releaseDestroy: (() => void) | undefined;
	_destroy(error: Error | null, callback: (error?: Error | null) => void) {
		if (this.holdDestroy) {
			this.releaseDestroy = () => {
				this.holdDestroy = false;
				this.releaseDestroy = undefined;
				callback(error);
			};
		} else callback(error);
	}
}

interface ResponseFixture {
	url: URL;
	ready: ReturnType<typeof deferred>;
	stream: ResponseStream & {
		statusCode: number;
		headers: Record<string, string>;
		rawHeaders: string[];
	};
	chunks?: readonly Uint8Array[];
}
const pending: ResponseFixture[] = [];
const fixtures: ResponseFixture[] = [];
const transports: NodeNetworkTransport[] = [];
const cleanup: (() => void)[] = [];
const resolver = vi.fn(async () => ["8.8.8.8"]);

function fixture(
	path: string,
	options: {
		chunks?: readonly Uint8Array[];
		headers?: Record<string, string>;
		status?: number;
		holdDestroy?: boolean;
	} = {},
) {
	const headers = options.headers ?? {};
	const stream = Object.assign(new ResponseStream(), {
		statusCode: options.status ?? 200,
		headers,
		rawHeaders: Object.entries(headers).flat(),
	});
	stream.holdDestroy = options.holdDestroy ?? false;
	const entry: ResponseFixture = {
		url: new URL(path, "http://accounting.test"),
		ready: deferred(),
		stream,
		chunks: options.chunks,
	};
	pending.push(entry);
	fixtures.push(entry);
	return entry;
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
	let destroyed = false;
	const request = Object.assign(new EventEmitter(), {
		destroy: vi.fn(() => {
			destroyed = true;
			return request;
		}),
		end: vi.fn(() => {
			queueMicrotask(() => {
				if (destroyed) return;
				callback(entry.stream as unknown as IncomingMessage);
				entry.ready.resolve();
				if (entry.chunks) {
					for (const chunk of entry.chunks) entry.stream.write(chunk);
					entry.stream.end();
				}
			});
			return request;
		}),
	});
	return request;
}

function transport(options: NodeTransportOptions = {}) {
	let cookieJar = options.cookieJar;
	if (!cookieJar) {
		cookieJar = new CookieJar();
		const ownedJar = cookieJar;
		cleanup.push(() => ownedJar.close());
	}
	const native = new NodeNetworkTransport({ resolver, ...options, cookieJar });
	transports.push(native);
	return native;
}

function page(
	request: PageFetchTransport,
	limits: Partial<PageFetchLimits> = {},
	document?: DocumentTree,
) {
	const tree = document ?? new DocumentTree("http://accounting.test/page");
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
		{ limits: { maxTotalBytes: 4, maxResponseBytes: 4, ...limits } },
	);
	cleanup.push(() => owner.close());
	const fetch = async (path: string, init?: unknown) =>
		(await owner.fetch(path, init)) as { text(): Promise<string> };
	return { owner, provider, fetch };
}

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const outcome = (request: Promise<unknown>) =>
	request.then(
		() => "fulfilled",
		(error: unknown) => (error as { code: string }).code,
	);
async function drained(owner: PageFetch) {
	for (
		let attempt = 0;
		attempt < 20 && owner.metrics().responseAccounting.outstanding;
		attempt++
	)
		await turn();
	expect(owner.metrics().responseAccounting.outstanding).toBe(0);
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
afterEach(async () => {
	for (const close of cleanup.splice(0).reverse()) close();
	for (const native of transports.splice(0)) {
		native.close();
		expect(native.metrics().active).toBe(0);
	}
	for (const entry of fixtures.splice(0)) {
		entry.stream.holdDestroy = false;
		entry.stream.releaseDestroy?.();
		entry.stream.destroy();
	}
	await turn();
	vi.useRealTimers();
	vi.restoreAllMocks();
	expect(pending.splice(0)).toHaveLength(0);
	expect(network.blocked).not.toHaveBeenCalled();
});

it("shares live byte charging between concurrently dispatched complete bodies", async () => {
	fixture("/first", { chunks: [Buffer.from("AAAA")] });
	fixture("/second", { chunks: [Buffer.from("BBBB")] });
	const native = transport();
	const test = page((input) => native.request(input));
	expect(
		(
			await Promise.all([
				outcome(test.fetch("/first")),
				outcome(test.fetch("/second")),
			])
		).sort(),
	).toEqual(["fulfilled", "resource-limit"]);
	expect(native.metrics()).toMatchObject({ encodedBytes: 8, decodedBytes: 4 });
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 4,
		responseAccounting: {
			observedEncodedBytes: 8,
			observedDecodedBytes: 4,
			completedOnlyBytes: 0,
			nativeRequests: 2,
		},
	});
	await expect(test.fetch("/never")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.provider).toHaveBeenCalledTimes(2);
	await drained(test.owner);
});

it("does not reuse page allowance after concurrent partial stream failures", async () => {
	const first = fixture("/first");
	const second = fixture("/second");
	const native = transport();
	const test = page((input) => native.request(input));
	const results = Promise.all([
		outcome(test.fetch("/first")),
		outcome(test.fetch("/second")),
	]);
	await Promise.all([first.ready.promise, second.ready.promise]);
	first.stream.write(Buffer.from("AA"));
	second.stream.write(Buffer.from("BB"));
	await turn();
	first.stream.destroy(new Error("first injected failure"));
	second.stream.destroy(new Error("second injected failure"));
	expect(await results).toEqual(["network-error", "network-error"]);
	await expect(test.fetch("/never")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.provider).toHaveBeenCalledTimes(2);
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 0,
		retainedBytes: 0,
		responseAccounting: {
			observedEncodedBytes: 4,
			observedDecodedBytes: 4,
			completedOnlyBytes: 0,
		},
	});
	await drained(test.owner);
});

it("charges encoded crossing chunks without pretending they reached decoded retention", async () => {
	const entry = fixture("/crossing");
	const native = transport();
	const test = page((input) => native.request(input));
	const result = outcome(test.fetch("/crossing"));
	await entry.ready.promise;
	entry.stream.write(Buffer.from("AA"));
	await turn();
	entry.stream.end(Buffer.from("BBB"));
	expect(await result).toBe("resource-limit");
	expect(native.metrics()).toMatchObject({ encodedBytes: 5, decodedBytes: 2 });
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 0,
		responseAccounting: { observedEncodedBytes: 5, observedDecodedBytes: 2 },
	});
	await expect(test.fetch("/never")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.provider).toHaveBeenCalledOnce();
	await drained(test.owner);
});

it("charges a decoded decompression crossing before the body copy and blocks repetition", async () => {
	const compressed = gzipSync(Buffer.alloc(512, 65));
	fixture("/compressed", {
		chunks: [compressed],
		headers: { "content-encoding": "gzip" },
	});
	const native = transport();
	const test = page((input) => native.request(input), {
		maxTotalBytes: 32,
		maxResponseBytes: 32,
	});
	await expect(test.fetch("/compressed")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 0,
		retainedBytes: 0,
		responseAccounting: {
			observedEncodedBytes: compressed.length,
			observedDecodedBytes: 512,
		},
	});
	await expect(test.fetch("/never")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.provider).toHaveBeenCalledOnce();
	await drained(test.owner);
});

it("retains the old owner's partial byte history after close", async () => {
	const entry = fixture("/closing");
	const native = transport();
	const test = page((input) => native.request(input));
	const result = outcome(test.fetch("/closing"));
	await entry.ready.promise;
	entry.stream.write(Buffer.from("AA"));
	await turn();
	test.owner.close();
	expect(await result).toBe("closed");
	await drained(test.owner);
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 0,
		active: 0,
		responseAccounting: {
			observedEncodedBytes: 2,
			observedDecodedBytes: 2,
			closed: true,
			draining: 0,
		},
	});
	expect(native.metrics().active).toBe(0);
});

it("keeps a draining native lease after prompt timeout until the actual pipeline settles", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	const entry = fixture("/draining", { holdDestroy: true });
	const native = transport();
	const test = page((input) => native.request(input), {
		maxTotalBytes: 8,
		maxPending: 1,
		timeoutMs: 5,
	});
	const result = outcome(test.fetch("/draining"));
	await entry.ready.promise;
	entry.stream.write(Buffer.from("AA"));
	await turn();
	await vi.advanceTimersByTimeAsync(5);
	expect(await result).toBe("timeout");
	expect(native.metrics().active).toBe(0);
	expect(test.owner.metrics()).toMatchObject({
		active: 0,
		responseAccounting: {
			outstanding: 1,
			draining: 1,
			observedDecodedBytes: 2,
		},
	});
	await expect(test.fetch("/blocked")).rejects.toMatchObject({
		code: "resource-limit",
		message: "Response accounting operation limit exceeded",
	});
	expect(test.provider).toHaveBeenCalledOnce();
	expect(entry.stream.releaseDestroy).toBeTypeOf("function");
	entry.stream.releaseDestroy?.();
	await drained(test.owner);
	fixture("/next", { chunks: [] });
	expect(await (await test.fetch("/next")).text()).toBe("");
	expect(test.owner.metrics().responseAccounting.observedDecodedBytes).toBe(2);
});

it("allows exact completion without charging the metered response twice", async () => {
	fixture("/exact", { chunks: [Buffer.from("done")] });
	const native = transport();
	const test = page((input) => native.request(input));
	expect(await (await test.fetch("/exact")).text()).toBe("done");
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 4,
		retainedBytes: 0,
		responseAccounting: {
			observedEncodedBytes: 4,
			observedDecodedBytes: 4,
			completedOnlyBytes: 0,
			completedOnlyRequests: 0,
			nativeRequests: 1,
			outstanding: 0,
		},
	});
	await expect(test.fetch("/never")).rejects.toMatchObject({
		code: "resource-limit",
	});
});

it("preserves independent ledgers for two pages sharing one native transport", async () => {
	fixture("/small", { chunks: [Buffer.from("large")] });
	fixture("/large", { chunks: [Buffer.from("larger")] });
	const native = transport();
	const small = page((input) => native.request(input));
	const large = page((input) => native.request(input), {
		maxTotalBytes: 8,
		maxResponseBytes: 8,
	});
	const results = await Promise.allSettled([
		small.fetch("/small"),
		large.fetch("/large"),
	]);
	expect(results[0].status).toBe("rejected");
	expect(results[1].status).toBe("fulfilled");
	small.owner.close();
	fixture("/last", { chunks: [Buffer.from("ok")] });
	expect(await (await large.fetch("/last")).text()).toBe("ok");
	expect(small.owner.metrics().responseAccounting.observedEncodedBytes).toBe(5);
	expect(large.owner.metrics().responseAccounting).toMatchObject({
		observedEncodedBytes: 8,
		observedDecodedBytes: 8,
		completedOnlyBytes: 0,
		closed: false,
	});
	await drained(small.owner);
	await drained(large.owner);
});

it("preserves lease identity and partial accounting through the committed session fetch port", async () => {
	fixture("/page", {
		chunks: [Buffer.from("<!doctype html><p>ready</p>")],
		headers: { "content-type": "text/html" },
	});
	let native!: NodeNetworkTransport;
	const session = new BrowserSession({
		createTransport: (cookieJar) => {
			native = transport({ cookieJar });
			return native;
		},
		loadDocument: loadBrowserDocument,
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	cleanup.push(() => host.close());
	await host.execute(["open", "http://accounting.test/page"]);
	const current = session.page(session.tabs()[0].id);
	if (!current.fetch) throw new Error("Missing session fetch port");
	const seen = vi.spyOn(native, "requestWithRoutes");
	const test = page(current.fetch, {}, current.document);
	const entry = fixture("/partial");
	const result = outcome(test.fetch("/partial"));
	await entry.ready.promise;
	entry.stream.write(Buffer.from("AA"));
	await turn();
	entry.stream.destroy(new Error("injected failure through session"));
	expect(await result).toBe("network-error");
	expect(seen.mock.calls[0][0].responseAccounting).toBe(
		test.provider.mock.calls[0][0].responseAccounting,
	);
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 0,
		responseAccounting: {
			observedEncodedBytes: 2,
			observedDecodedBytes: 2,
			nativeRequests: 1,
			completedOnlyBytes: 0,
		},
	});
	await drained(test.owner);
});

it("refuses the revoked lease when its owner closes during a later request getter", async () => {
	const ledger = new ResponseByteAccounting(4, 1);
	cleanup.push(() => ledger.close());
	const lease = ledger.createLease();
	const native = transport();
	const read = vi.fn(() => lease);
	await expect(
		native.request({
			url: "http://accounting.test/never",
			get responseAccounting() {
				return read();
			},
			get maxResponseBytes() {
				ledger.close();
				return 4;
			},
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(read).toHaveBeenCalledOnce();
	expect(ledger.metrics()).toMatchObject({ outstanding: 0, nativeRequests: 0 });
	expect(native.metrics()).toMatchObject({ requests: 0, active: 0 });
	expect(resolver).not.toHaveBeenCalled();
});

it("rejects a lease revoked during genuine signal registration before claiming it", async () => {
	const ledger = new ResponseByteAccounting(4, 1);
	cleanup.push(() => ledger.close());
	const lease = ledger.createLease();
	const controller = new AbortController();
	const register = controller.signal.addEventListener.bind(controller.signal);
	vi.spyOn(controller.signal, "addEventListener").mockImplementation(
		(...args) => {
			register(...args);
			ledger.close();
		},
	);
	const native = transport();
	await expect(
		native.request({
			url: "http://accounting.test/never",
			responseAccounting: lease,
			signal: controller.signal,
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	expect(ledger.metrics()).toMatchObject({ outstanding: 0, nativeRequests: 0 });
	expect(native.metrics()).toMatchObject({ requests: 0, active: 0 });
	expect(resolver).not.toHaveBeenCalled();
});

it("rejects forged and reused leases without another dispatch", async () => {
	const ledger = new ResponseByteAccounting(4, 2);
	cleanup.push(() => ledger.close());
	const native = transport();
	await expect(
		native.request({
			url: "http://accounting.test/never",
			responseAccounting: {},
		} as NetworkRequest),
	).rejects.toMatchObject({ code: "invalid-input" });
	const lease = ledger.createLease();
	fixture("/once", { chunks: [Buffer.from("ok")] });
	await native.request({
		url: "http://accounting.test/once",
		responseAccounting: lease,
	});
	ledger.settle(lease, 2);
	await expect(
		native.request({
			url: "http://accounting.test/never",
			responseAccounting: lease,
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(network.http).toHaveBeenCalledOnce();
	expect(ledger.metrics()).toMatchObject({
		observedEncodedBytes: 2,
		observedDecodedBytes: 2,
		outstanding: 0,
	});
});
