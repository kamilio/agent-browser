import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { Duplex } from "node:stream";
import type { PeerCertificate } from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type NodeWebSocketConnectOptions,
	NodeWebSocketTransport,
	type NodeWebSocketTransportOptions,
	nodeWebSocketLimits,
} from "./node-websocket-transport.js";

const entrypoints = vi.hoisted(() => ({
	http: vi.fn(),
	https: vi.fn(),
}));

vi.mock("node:http", () => ({ request: entrypoints.http }));
vi.mock("node:https", () => ({ request: entrypoints.https }));

const publicAddress = "93.184.216.34";
const otherPublicAddress = "1.1.1.1";
const publicIpv6 = "2606:4700:4700::1111";
const target = "wss://chat.example/room";
const documentOptions = { origin: "https://document.example" };
const transports: NodeWebSocketTransport[] = [];
const requests: FakeClientRequest[] = [];
const streams: MemoryDuplex[] = [];
const settleResolvers: Array<() => void> = [];

class FakeClientRequest extends EventEmitter {
	destroyed = false;
	maxHeadersCount: number | null = null;
	maxHeadersCountAtEnd: number | null | undefined;
	readonly end = vi.fn(() => {
		this.maxHeadersCountAtEnd = this.maxHeadersCount;
		return this;
	});
	readonly destroy = vi.fn(() => {
		this.destroyed = true;
		return this;
	});

	constructor(readonly options: RequestOptions) {
		super();
	}
}

class MemoryDuplex extends Duplex {
	readonly writes: Buffer[] = [];
	readonly closedEvent: Promise<void>;
	holdWrites = false;

	constructor() {
		super();
		this.closedEvent = new Promise((resolve) => this.once("close", resolve));
		streams.push(this);
	}

	_read(): void {}

	_write(
		chunk: Buffer,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		this.writes.push(Buffer.from(chunk));
		if (!this.holdWrites) callback();
	}
}

function createTransport(options: NodeWebSocketTransportOptions = {}) {
	const transport = new NodeWebSocketTransport({
		...options,
		resolver: options.resolver ?? vi.fn(async () => [publicAddress]),
	});
	transports.push(transport);
	return transport;
}

function deferredDns() {
	let resolve!: (addresses: readonly string[]) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<readonly string[]>(
		(resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		},
	);
	settleResolvers.push(() => resolve([publicAddress]));
	return { promise, resolve, reject };
}

function beginConnect(
	transport: NodeWebSocketTransport,
	url = target,
	options: NodeWebSocketConnectOptions = documentOptions,
) {
	const operation = transport.connect(url, options);
	void operation.catch(() => undefined);
	return operation;
}

function observe<Value>(promise: Promise<Value>) {
	return promise.then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
}

async function flushMicrotasks() {
	for (let turn = 0; turn < 24; turn++) await Promise.resolve();
}

async function requestAt(index = 0) {
	await flushMicrotasks();
	expect(requests).toHaveLength(index + 1);
	const request = requests[index];
	expect(request.end).toHaveBeenCalledTimes(1);
	expect(request.end).toHaveBeenCalledWith();
	return request;
}

function requestHeaders(request: FakeClientRequest) {
	return request.options.headers as Record<string, string>;
}

function responseHeaders(request: FakeClientRequest) {
	const accept = createHash("sha1")
		.update(
			`${requestHeaders(request)["Sec-WebSocket-Key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
		)
		.digest("base64");
	return [
		"Upgrade",
		"websocket",
		"Connection",
		"Upgrade",
		"Sec-WebSocket-Accept",
		accept,
	];
}

function upgrade(
	request: FakeClientRequest,
	{
		statusCode = 101,
		rawHeaders = responseHeaders(request),
		head = Buffer.alloc(0),
	}: { statusCode?: number; rawHeaders?: string[]; head?: Buffer } = {},
) {
	const socket = new MemoryDuplex();
	const response = { statusCode, rawHeaders, destroy: vi.fn() };
	request.emit("upgrade", response, socket, head);
	return socket;
}

function expectNoRequest() {
	expect(entrypoints.http).not.toHaveBeenCalled();
	expect(entrypoints.https).not.toHaveBeenCalled();
	expect(requests).toHaveLength(0);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	const capture = (options: RequestOptions) => {
		const request = new FakeClientRequest(options);
		requests.push(request);
		return request;
	};
	entrypoints.http.mockReset().mockImplementation(capture);
	entrypoints.https.mockReset().mockImplementation(capture);
});

afterEach(async () => {
	try {
		await Promise.all(
			transports.splice(0).map((transport) => transport.close()),
		);
	} finally {
		for (const settle of settleResolvers.splice(0)) settle();
		for (const request of requests.splice(0)) request.destroy();
		const ownedStreams = streams.splice(0);
		for (const socket of ownedStreams) socket.destroy();
		await Promise.all(ownedStreams.map((socket) => socket.closedEvent));
		entrypoints.http.mockReset();
		entrypoints.https.mockReset();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

describe("mocked WebSocket HTTP upgrade", () => {
	it.each(["ws://chat.example/room", target])(
		"disables header extraction truncation before ending the request to %s",
		async (url) => {
			const operation = beginConnect(createTransport(), url, {
				origin: "http://document.example",
			});
			const request = await requestAt();
			expect(request.maxHeadersCountAtEnd).toBe(0);
			expect(request.options.maxHeaderSize).toBe(
				nodeWebSocketLimits.maxHeaderBytes,
			);
			upgrade(request);
			await operation;
		},
	);

	it("sends an honest GET handshake and delivers the selected protocol and upgrade head", async () => {
		const resolver = vi.fn(async () => [publicAddress, otherPublicAddress]);
		const transport = createTransport({ resolver });
		const operation = beginConnect(transport, target, {
			origin: "HTTPS://DOCUMENT.EXAMPLE:443/",
			protocols: ["chat", "chat.v2"],
		});
		const request = await requestAt();
		const key = requestHeaders(request)["Sec-WebSocket-Key"];
		expect(key).toMatch(/^[A-Za-z0-9+/]{22}==$/);
		expect(Buffer.from(key, "base64")).toHaveLength(16);
		expect(Buffer.from(key, "base64").toString("base64")).toBe(key);
		expect(requestHeaders(request)).toEqual({
			Host: "chat.example",
			Upgrade: "websocket",
			Connection: "Upgrade",
			"Sec-WebSocket-Key": key,
			"Sec-WebSocket-Version": "13",
			Origin: "https://document.example",
			"User-Agent": "AgentBrowser/0.1",
			"Sec-WebSocket-Protocol": "chat, chat.v2",
		});
		expect(request.options).toMatchObject({
			hostname: publicAddress,
			port: 443,
			path: "/room",
			method: "GET",
			agent: false,
			maxHeaderSize: nodeWebSocketLimits.maxHeaderBytes,
		});
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(resolver).toHaveBeenCalledWith(
			"chat.example",
			expect.any(AbortSignal),
		);
		expect(entrypoints.https).toHaveBeenCalledTimes(1);
		expect(entrypoints.http).not.toHaveBeenCalled();
		const head = Buffer.from([0x81, 5, 104, 101, 108, 108, 111]);
		const socket = upgrade(request, {
			rawHeaders: [
				...responseHeaders(request),
				"Sec-WebSocket-Protocol",
				"chat.v2",
			],
			head,
		});
		const connection = await operation;
		expect(connection.url).toBe(target);
		expect(connection.protocol).toBe("chat.v2");
		expect(connection.state).toBe("open");
		await expect(connection.read()).resolves.toEqual({ data: "hello" });
		expect(connection.metrics().receivedBytes).toBe(head.length);
		expect(socket.writes).toHaveLength(0);
		expect(transport.metrics()).toEqual({
			attempts: 1,
			requests: 1,
			established: 1,
			pending: 0,
			active: 1,
			closed: false,
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("preserves a partial frame in upgrade head until subsequent stream bytes arrive", async () => {
		const operation = beginConnect(createTransport());
		const request = await requestAt();
		const socket = upgrade(request, { head: Buffer.from([0x81, 2, 111]) });
		const connection = await operation;
		const message = connection.read();
		socket.push(Buffer.from([107]));
		await expect(message).resolves.toEqual({ data: "ok" });
	});

	it.each([
		[
			"WS://CHAT.EXAMPLE:80",
			"ws://chat.example/",
			"http",
			80,
			"/",
			"chat.example",
		],
		[
			"WSS://CHAT.EXAMPLE:443/a/../room?q=x%20y",
			"wss://chat.example/room?q=x%20y",
			"https",
			443,
			"/room?q=x%20y",
			"chat.example",
		],
		[
			"ws://chat.example:8080/room",
			"ws://chat.example:8080/room",
			"http",
			"8080",
			"/room",
			"chat.example:8080",
		],
		[
			"wss://chat.example:9443/room",
			"wss://chat.example:9443/room",
			"https",
			"9443",
			"/room",
			"chat.example:9443",
		],
	] as const)(
		"normalizes %s without changing its WebSocket scheme",
		async (url, normalized, entrypoint, port, path, host) => {
			const operation = beginConnect(createTransport(), url, {
				origin: "http://document.example",
			});
			const request = await requestAt();
			expect(entrypoints[entrypoint]).toHaveBeenCalledTimes(1);
			expect(
				entrypoints[entrypoint === "http" ? "https" : "http"],
			).not.toHaveBeenCalled();
			expect(request.options).toMatchObject({ port, path });
			expect(requestHeaders(request).Host).toBe(host);
			if (entrypoint === "http") {
				expect(request.options).not.toHaveProperty("servername");
				expect(request.options).not.toHaveProperty("checkServerIdentity");
			}
			upgrade(request);
			const connection = await operation;
			expect(connection.url).toBe(normalized);
			expect(connection.protocol).toBe("");
		},
	);

	it.each([publicAddress, publicIpv6])(
		"pins public DNS address %s while checking the original TLS hostname",
		async (address) => {
			const resolver = vi.fn(async () => [address, otherPublicAddress]);
			const operation = beginConnect(createTransport({ resolver }));
			const request = await requestAt();
			expect(request.options).toMatchObject({
				hostname: address,
				servername: "chat.example",
				rejectUnauthorized: true,
			});
			expect(requestHeaders(request).Host).toBe("chat.example");
			expect(resolver).toHaveBeenCalledTimes(1);
			const checkIdentity = request.options.checkServerIdentity;
			expect(checkIdentity).toEqual(expect.any(Function));
			const certificate = (subjectaltname: string) =>
				({ subjectaltname }) as PeerCertificate;
			expect(
				checkIdentity?.(address, certificate("DNS:chat.example")),
			).toBeUndefined();
			expect(
				checkIdentity?.(address, certificate("DNS:wrong.example")),
			).toMatchObject({
				code: "ERR_TLS_CERT_ALTNAME_INVALID",
			});
			expect(
				checkIdentity?.(address, certificate(`IP Address:${address}`)),
			).toMatchObject({
				code: "ERR_TLS_CERT_ALTNAME_INVALID",
			});
			upgrade(request);
			await operation;
		},
	);

	it.each([
		[publicAddress, publicAddress],
		[`[${publicIpv6}]`, publicIpv6],
	])("pins literal %s without DNS or a DNS-name SNI", async (host, address) => {
		const resolver = vi.fn(async () => ["127.0.0.1"]);
		const operation = beginConnect(
			createTransport({ resolver }),
			`wss://${host}/room`,
		);
		const request = await requestAt();
		expect(resolver).not.toHaveBeenCalled();
		expect(request.options).toMatchObject({
			hostname: address,
			servername: "",
			rejectUnauthorized: true,
		});
		expect(requestHeaders(request).Host).toBe(host);
		const certificate = {
			subjectaltname: `IP Address:${address}`,
		} as PeerCertificate;
		expect(
			request.options.checkServerIdentity?.("wrong.example", certificate),
		).toBeUndefined();
		upgrade(request);
		await operation;
	});

	it("never offers extensions or credentials and ignores response cookies on later upgrades", async () => {
		const transport = createTransport();
		const first = beginConnect(transport);
		const firstRequest = await requestAt();
		upgrade(firstRequest, {
			rawHeaders: [
				...responseHeaders(firstRequest),
				"Set-Cookie",
				"secret=value; Secure; Path=/",
			],
		});
		await first;
		const second = beginConnect(transport);
		const secondRequest = await requestAt(1);
		for (const request of [firstRequest, secondRequest]) {
			const names = Object.keys(requestHeaders(request)).map((name) =>
				name.toLowerCase(),
			);
			for (const name of [
				"cookie",
				"cookie2",
				"authorization",
				"proxy-authorization",
				"sec-websocket-extensions",
				"sec-websocket-protocol",
			])
				expect(names).not.toContain(name);
			expect(request.options).not.toHaveProperty("auth");
		}
		upgrade(secondRequest);
		await second;
	});
});

describe("WebSocket transport policy and input admission", () => {
	it.each([
		"127.0.0.1",
		"10.0.0.1",
		"172.16.0.1",
		"192.168.1.1",
		"169.254.169.254",
		"0.0.0.0",
		"[::1]",
		"[fc00::1]",
		"localhost",
		"service.local",
		"service.internal",
	])("denies private or local target %s before DNS or HTTP", async (host) => {
		const resolver = vi.fn(async () => [publicAddress]);
		await expect(
			createTransport({ resolver }).connect(`wss://${host}/`, documentOptions),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(resolver).not.toHaveBeenCalled();
		expectNoRequest();
	});

	it.each([
		{ addresses: ["127.0.0.1"] },
		{ addresses: ["::1"] },
		{ addresses: [publicAddress, "10.0.0.1"] },
		{ addresses: ["10.0.0.1", publicAddress] },
		{ addresses: [publicIpv6, "fc00::1"] },
		{ addresses: [publicAddress, "not-an-address"] },
	])(
		"rejects the entire DNS result $addresses rather than selecting a safe subset",
		async ({ addresses }) => {
			const resolver = vi.fn(async () => addresses);
			const transport = createTransport({ resolver });
			await expect(
				transport.connect(target, documentOptions),
			).rejects.toMatchObject({ code: "policy-denied" });
			expectNoRequest();
			expect(transport.metrics()).toMatchObject({
				attempts: 1,
				pending: 0,
				active: 0,
			});
		},
	);

	it("rejects an empty DNS result without requesting or retrying", async () => {
		const resolver = vi.fn(async () => []);
		await expect(
			createTransport({ resolver }).connect(target, documentOptions),
		).rejects.toMatchObject({ code: "network-error" });
		expect(resolver).toHaveBeenCalledTimes(1);
		expectNoRequest();
	});

	it.each(["throw", "reject"])(
		"contains a resolver %s without retrying",
		async (failure) => {
			const resolver = vi.fn(() => {
				if (failure === "throw") throw new Error("resolver failed");
				return Promise.reject(new Error("resolver failed"));
			});
			await expect(
				createTransport({ resolver }).connect(target, documentOptions),
			).rejects.toMatchObject({ code: "network-error" });
			expect(resolver).toHaveBeenCalledTimes(1);
			expectNoRequest();
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it.each(["wss://chat.example", "https://chat.example"])(
		"accepts equivalent allowed target origin %s independently of document origin",
		async (allowedOrigin) => {
			const operation = beginConnect(
				createTransport({ allowedOrigins: [allowedOrigin] }),
			);
			upgrade(await requestAt());
			await operation;
		},
	);

	it.each([
		{ allowedOrigins: [] },
		{ allowedOrigins: ["wss://other.example"] },
		{ allowedOrigins: ["ws://chat.example"] },
		{ allowedOrigins: ["wss://chat.example:9443"] },
	])(
		"denies a target outside the exact allowed origins $allowedOrigins",
		async ({ allowedOrigins }) => {
			const resolver = vi.fn(async () => [publicAddress]);
			await expect(
				createTransport({ allowedOrigins, resolver }).connect(
					target,
					documentOptions,
				),
			).rejects.toMatchObject({ code: "policy-denied" });
			expect(resolver).not.toHaveBeenCalled();
			expectNoRequest();
		},
	);

	it("allows private DNS only for an explicitly authorized exact target origin", async () => {
		const resolver = vi.fn(async () => ["127.0.0.1", publicAddress]);
		const transport = createTransport({
			resolver,
			allowPrivateOrigins: ["wss://chat.example"],
		});
		const operation = beginConnect(transport);
		const request = await requestAt();
		expect(request.options.hostname).toBe("127.0.0.1");
		upgrade(request);
		await operation;
		await expect(
			transport.connect("wss://chat.example:9443/", documentOptions),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(requests).toHaveLength(1);
	});

	it("does not let a private-origin exception override the allowed-origin policy", async () => {
		const resolver = vi.fn(async () => ["127.0.0.1"]);
		await expect(
			createTransport({
				resolver,
				allowedOrigins: ["wss://other.example"],
				allowPrivateOrigins: ["wss://chat.example"],
			}).connect(target, documentOptions),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(resolver).not.toHaveBeenCalled();
		expectNoRequest();
	});

	it.each([
		"https://chat.example/",
		"http://chat.example/",
		"file:///room",
		"ftp://chat.example/",
		"not a URL",
		"wss://",
		"wss://user@chat.example/",
		"wss://user:secret@chat.example/",
		"wss://chat.example/#fragment",
		"wss://chat.example/#",
	])(
		"rejects malformed, credentialed, fragmented, or non-WebSocket URL %s",
		async (url) => {
			const resolver = vi.fn(async () => [publicAddress]);
			await expect(
				createTransport({ resolver }).connect(url, documentOptions),
			).rejects.toMatchObject({ code: "invalid-input" });
			expect(resolver).not.toHaveBeenCalled();
			expectNoRequest();
		},
	);

	it("rejects secure-document ws even with explicit origin permissions", async () => {
		const resolver = vi.fn(async () => [publicAddress]);
		await expect(
			createTransport({
				resolver,
				allowedOrigins: ["ws://chat.example"],
				allowPrivateOrigins: ["ws://chat.example"],
			}).connect("ws://chat.example/", documentOptions),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(resolver).not.toHaveBeenCalled();
		expectNoRequest();
	});

	it.each([
		undefined,
		null,
		"null",
		"",
		"ws://document.example",
		"file:///",
		"https://document.example/path",
		"https://document.example/?query=1",
		"https://document.example/#",
		"https://user:secret@document.example/",
	])("rejects invalid document origin %j before admission", async (origin) => {
		const resolver = vi.fn(async () => [publicAddress]);
		const transport = createTransport({ resolver });
		await expect(
			transport.connect(target, { origin } as NodeWebSocketConnectOptions),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(resolver).not.toHaveBeenCalled();
		expect(transport.metrics().attempts).toBe(0);
		expectNoRequest();
	});

	it.each([
		{ label: "missing", value: undefined },
		{ label: "null", value: null },
		{ label: "primitive", value: "https://document.example" },
		{ label: "array", value: [] },
		{
			label: "fake signal",
			value: { ...documentOptions, signal: { aborted: false } },
		},
	])("rejects $label connect options", async ({ value }) => {
		const resolver = vi.fn(async () => [publicAddress]);
		await expect(
			createTransport({ resolver }).connect(
				target,
				value as NodeWebSocketConnectOptions,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(resolver).not.toHaveBeenCalled();
		expectNoRequest();
	});

	it.each([
		{ label: "string", value: "chat" },
		{ label: "null", value: null },
		{ label: "empty token", value: [""] },
		{ label: "duplicate", value: ["chat", "chat"] },
		{ label: "whitespace", value: ["two words"] },
		{ label: "header injection", value: ["chat\r\nCookie: secret=value"] },
		{ label: "non-ASCII", value: ["chát"] },
		{ label: "number", value: [13] },
		{ label: "oversized token", value: ["a".repeat(257)] },
		{
			label: "too many tokens",
			value: Array.from({ length: 33 }, (_, index) => `chat-${index}`),
		},
	])(
		"rejects $label subprotocols before consuming an attempt",
		async ({ value }) => {
			const resolver = vi.fn(async () => [publicAddress]);
			const transport = createTransport({ resolver });
			await expect(
				transport.connect(target, {
					...documentOptions,
					protocols: value as readonly string[],
				}),
			).rejects.toMatchObject({ code: "invalid-input" });
			expect(resolver).not.toHaveBeenCalled();
			expect(transport.metrics().attempts).toBe(0);
			expectNoRequest();
		},
	);

	it.each([
		{ label: "null options", value: null },
		{ label: "array options", value: [] },
		{ label: "primitive options", value: true },
		{ label: "null limits", value: { limits: null } },
		{ label: "array limits", value: { limits: [] } },
		{ label: "unknown limit", value: { limits: { unknown: 1 } } },
		{ label: "invalid resolver", value: { resolver: true } },
		{
			label: "frame larger than message",
			value: { limits: { maxFrameBytes: 2, maxMessageBytes: 1 } },
		},
		{
			label: "non-array origins",
			value: { allowedOrigins: "wss://chat.example" },
		},
		{
			label: "origin path",
			value: { allowedOrigins: ["wss://chat.example/path"] },
		},
		{
			label: "private origin query",
			value: { allowPrivateOrigins: ["wss://chat.example/?query=1"] },
		},
		{
			label: "too many origins",
			value: { allowedOrigins: Array(1001).fill("wss://chat.example") },
		},
	])("rejects $label at construction", ({ value }) => {
		expect(
			() => new NodeWebSocketTransport(value as NodeWebSocketTransportOptions),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expectNoRequest();
	});

	it.each(Object.keys(nodeWebSocketLimits))(
		"validates every supplied %s limit as a positive safe integer",
		(name) => {
			for (const value of [
				0,
				-1,
				1.5,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
				"1",
				null,
				undefined,
			]) {
				expect(() =>
					createTransport({
						limits: { [name]: value },
					} as NodeWebSocketTransportOptions),
				).toThrowError(expect.objectContaining({ code: "invalid-input" }));
			}
			expectNoRequest();
		},
	);

	it.each([
		"handshakeTimeoutMs",
		"writeTimeoutMs",
		"closeTimeoutMs",
		"maxHeaderBytes",
	])("rejects platform-overflowing %s", (name) => {
		expect(() =>
			createTransport({ limits: { [name]: 2_147_483_648 } }),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expectNoRequest();
	});

	it("copies and freezes limits rather than accepting later caller mutation", () => {
		const limits = { maxConcurrent: 2 };
		const transport = createTransport({ limits });
		limits.maxConcurrent = 99;
		expect(transport.limits.maxConcurrent).toBe(2);
		expect(Object.isFrozen(transport.limits)).toBe(true);
		expectNoRequest();
	});
});

describe("upgrade rejection and request cleanup", () => {
	it("enforces the outgoing header budget before HTTP", async () => {
		const transport = createTransport({ limits: { maxHeaderBytes: 1 } });
		await expect(
			transport.connect(target, documentOptions),
		).rejects.toMatchObject({ code: "resource-limit" });
		expectNoRequest();
		expect(transport.metrics()).toMatchObject({ attempts: 1, pending: 0 });
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each([200, 204, 301, 302, 303, 307, 308, 401, 403, 500])(
		"destroys HTTP %s responses without redirects, retries, or cookie reuse",
		async (statusCode) => {
			const resolver = vi.fn(async () => [publicAddress, otherPublicAddress]);
			const transport = createTransport({ resolver });
			const operation = beginConnect(transport);
			const request = await requestAt();
			const response = {
				statusCode,
				headers: {
					location: "wss://other.example/",
					"set-cookie": ["secret=value"],
				},
				rawHeaders: [
					"Location",
					"wss://other.example/",
					"Set-Cookie",
					"secret=value",
				],
				destroy: vi.fn(),
			};
			request.emit("response", response);
			await expect(operation).rejects.toMatchObject({ code: "network-error" });
			expect(response.destroy).toHaveBeenCalledTimes(1);
			expect(request.destroyed).toBe(true);
			await flushMicrotasks();
			expect(resolver).toHaveBeenCalledTimes(1);
			expect(entrypoints.https).toHaveBeenCalledTimes(1);
			expect(entrypoints.http).not.toHaveBeenCalled();
			expect(transport.metrics()).toMatchObject({
				requests: 1,
				pending: 0,
				active: 0,
				established: 0,
			});
			expect(vi.getTimerCount()).toBe(0);
			const lateSocket = upgrade(request);
			expect(lateSocket.destroyed).toBe(true);
		},
	);

	it.each([
		"bad accept",
		"extension",
		"unoffered protocol",
		"non101 upgrade",
		"oversized response",
	])("destroys the request and upgraded stream for %s", async (failure) => {
		const transport = createTransport({ limits: { maxHeaderBytes: 512 } });
		const operation = beginConnect(transport);
		const request = await requestAt();
		const rawHeaders = responseHeaders(request);
		if (failure === "bad accept") rawHeaders[5] = "invalid-digest";
		if (failure === "extension")
			rawHeaders.push("Sec-WebSocket-Extensions", "permessage-deflate");
		if (failure === "unoffered protocol")
			rawHeaders.push("Sec-WebSocket-Protocol", "unoffered");
		if (failure === "oversized response")
			rawHeaders.push("X-Padding", "a".repeat(512));
		const socket = upgrade(request, {
			rawHeaders,
			statusCode: failure === "non101 upgrade" ? 200 : 101,
		});
		await expect(operation).rejects.toMatchObject({
			code:
				failure === "oversized response" ? "resource-limit" : "network-error",
		});
		expect(request.destroyed).toBe(true);
		expect(socket.destroyed).toBe(true);
		await socket.closedEvent;
		expect(transport.metrics()).toMatchObject({
			pending: 0,
			active: 0,
			established: 0,
		});
		expect(requests).toHaveLength(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(["extension", "unoffered protocol", "duplicate accept"])(
		"rejects a trailing %s after many short headers with modeled count extraction",
		async (failure) => {
			const transport = createTransport();
			const operation = beginConnect(transport);
			const request = await requestAt();
			const rawHeaders = responseHeaders(request);
			for (let index = 0; index < 2500; index++) rawHeaders.push("X", "");
			if (failure === "extension")
				rawHeaders.push("Sec-WebSocket-Extensions", "permessage-deflate");
			else if (failure === "unoffered protocol")
				rawHeaders.push("Sec-WebSocket-Protocol", "unoffered");
			else rawHeaders.push("Sec-WebSocket-Accept", rawHeaders[5]);
			const headerBytes = rawHeaders.reduce(
				(bytes, value) => bytes + Buffer.byteLength(value) + 2,
				2,
			);
			expect(headerBytes).toBeLessThan(nodeWebSocketLimits.maxHeaderBytes);
			const modeledHeaderCount = request.maxHeadersCountAtEnd ?? 1000;
			const socket = upgrade(request, {
				rawHeaders:
					modeledHeaderCount === 0
						? rawHeaders
						: rawHeaders.slice(0, modeledHeaderCount * 2),
			});
			await expect(operation).rejects.toMatchObject({ code: "network-error" });
			expect(request.maxHeadersCountAtEnd).toBe(0);
			expect(request.destroyed).toBe(true);
			expect(socket.destroyed).toBe(true);
			await socket.closedEvent;
			expect(transport.metrics()).toMatchObject({
				pending: 0,
				active: 0,
				established: 0,
			});
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("settles a request error once without retrying another DNS address", async () => {
		const transport = createTransport({
			resolver: async () => [publicAddress, otherPublicAddress],
		});
		const operation = beginConnect(transport);
		const request = await requestAt();
		request.emit("error", new Error("handshake failed"));
		await expect(operation).rejects.toMatchObject({ code: "network-error" });
		expect(request.destroyed).toBe(true);
		expect(() =>
			request.emit("error", new Error("late failure")),
		).not.toThrow();
		const lateSocket = upgrade(request);
		expect(lateSocket.destroyed).toBe(true);
		expect(transport.metrics()).toMatchObject({
			pending: 0,
			active: 0,
			requests: 1,
		});
		expect(requests).toHaveLength(1);
	});

	it("contains a throwing request entrypoint without retrying", async () => {
		entrypoints.https.mockImplementationOnce(() => {
			throw new Error("request failed");
		});
		const transport = createTransport();
		await expect(
			transport.connect(target, documentOptions),
		).rejects.toMatchObject({ code: "network-error" });
		expect(entrypoints.https).toHaveBeenCalledTimes(1);
		expect(transport.metrics()).toMatchObject({
			attempts: 1,
			requests: 1,
			pending: 0,
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("destroys an owned request when end throws", async () => {
		entrypoints.https.mockImplementationOnce((options: RequestOptions) => {
			const request = new FakeClientRequest(options);
			request.end.mockImplementationOnce(() => {
				throw new Error("end failed");
			});
			requests.push(request);
			return request;
		});
		await expect(
			createTransport().connect(target, documentOptions),
		).rejects.toMatchObject({ code: "network-error" });
		expect(requests).toHaveLength(1);
		expect(requests[0].destroyed).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects a request close before upgrade immediately, not at the handshake timeout", async () => {
		const transport = createTransport();
		const operation = observe(beginConnect(transport));
		let outcome: Awaited<typeof operation> | undefined;
		void operation.then((result) => {
			outcome = result;
		});
		const request = await requestAt();
		request.emit("close");
		await flushMicrotasks();
		expect(outcome).toMatchObject({ error: { code: "network-error" } });
		expect(request.destroyed).toBe(true);
		expect(transport.metrics()).toMatchObject({ pending: 0, active: 0 });
		expect(vi.getTimerCount()).toBe(0);
		expect(upgrade(request).destroyed).toBe(true);
	});

	it("destroys duplicate upgrades without losing the established connection", async () => {
		const transport = createTransport();
		const operation = beginConnect(transport);
		const request = await requestAt();
		const originalSocket = upgrade(request);
		const connection = await operation;
		const lateSocket = upgrade(request);
		expect(lateSocket.destroyed).toBe(true);
		expect(originalSocket.destroyed).toBe(false);
		request.emit("close");
		expect(connection.state).toBe("open");
		expect(transport.metrics()).toMatchObject({ active: 1, established: 1 });
	});
});

describe("abort, timeout, and transport ownership", () => {
	it("rejects a pre-aborted signal without DNS, requests, or consuming an attempt", async () => {
		const resolver = vi.fn(async () => [publicAddress]);
		const controller = new AbortController();
		controller.abort();
		const transport = createTransport({ resolver });
		await expect(
			transport.connect(target, {
				...documentOptions,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ code: "aborted" });
		expect(resolver).not.toHaveBeenCalled();
		expect(transport.metrics()).toMatchObject({ attempts: 0, pending: 0 });
		expectNoRequest();
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(["abort", "close"])(
		"does not start scheduled DNS after immediate %s",
		async (action) => {
			const resolver = vi.fn(async () => [publicAddress]);
			const controller = new AbortController();
			const transport = createTransport({ resolver });
			const operation = beginConnect(transport, target, {
				...documentOptions,
				signal: controller.signal,
			});
			if (action === "abort") controller.abort();
			else await transport.close();
			await expect(operation).rejects.toMatchObject({
				code: action === "abort" ? "aborted" : "closed",
			});
			expect(resolver).not.toHaveBeenCalled();
			expectNoRequest();
			expect(transport.metrics().pending).toBe(0);
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it.each(["resolve", "reject"])(
		"aborts unresolved DNS and ignores its late %s",
		async (completion) => {
			const dns = deferredDns();
			const resolver = vi.fn(
				(_hostname: string, _signal: AbortSignal) => dns.promise,
			);
			const controller = new AbortController();
			const transport = createTransport({ resolver });
			const operation = beginConnect(transport, target, {
				...documentOptions,
				signal: controller.signal,
			});
			await flushMicrotasks();
			expect(resolver).toHaveBeenCalledTimes(1);
			controller.abort();
			await expect(operation).rejects.toMatchObject({ code: "aborted" });
			expect(resolver.mock.calls[0][1].aborted).toBe(true);
			if (completion === "resolve") dns.resolve([publicAddress]);
			else dns.reject(new Error("late DNS failure"));
			await flushMicrotasks();
			expectNoRequest();
			expect(transport.metrics()).toMatchObject({ pending: 0, active: 0 });
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("aborts an in-flight handshake and destroys any late upgrade", async () => {
		const controller = new AbortController();
		const transport = createTransport();
		const operation = beginConnect(transport, target, {
			...documentOptions,
			signal: controller.signal,
		});
		const request = await requestAt();
		controller.abort();
		await expect(operation).rejects.toMatchObject({ code: "aborted" });
		expect(request.destroyed).toBe(true);
		expect(upgrade(request).destroyed).toBe(true);
		expect(transport.metrics()).toMatchObject({
			pending: 0,
			active: 0,
			established: 0,
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps the caller signal attached after upgrade and settles a pending read on abort", async () => {
		const controller = new AbortController();
		const transport = createTransport();
		const operation = beginConnect(transport, target, {
			...documentOptions,
			signal: controller.signal,
		});
		const socket = upgrade(await requestAt());
		const connection = await operation;
		const read = observe(connection.read());
		controller.abort();
		await expect(read).resolves.toMatchObject({ error: { code: "aborted" } });
		await expect(connection.closed).resolves.toMatchObject({
			code: 1006,
			wasClean: false,
		});
		expect(socket.destroyed).toBe(true);
		expect(connection.state).toBe("closed");
		expect(transport.metrics()).toMatchObject({ active: 0, pending: 0 });
	});

	it.each(["DNS", "request"])(
		"times out a pending %s with deterministic timers and no late admission",
		async (phase) => {
			const dns = deferredDns();
			const transport = createTransport({
				limits: { handshakeTimeoutMs: 50 },
				resolver:
					phase === "DNS" ? () => dns.promise : async () => [publicAddress],
			});
			const operation = beginConnect(transport);
			await flushMicrotasks();
			const request = phase === "request" ? await requestAt() : undefined;
			await vi.advanceTimersByTimeAsync(49);
			expect(transport.metrics().pending).toBe(1);
			expect(request?.destroyed ?? false).toBe(false);
			await vi.advanceTimersByTimeAsync(1);
			await expect(operation).rejects.toMatchObject({ code: "timeout" });
			if (request) {
				expect(request.destroyed).toBe(true);
				expect(upgrade(request).destroyed).toBe(true);
			} else {
				dns.resolve([publicAddress]);
				await flushMicrotasks();
				expectNoRequest();
			}
			expect(transport.metrics()).toMatchObject({ pending: 0, active: 0 });
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("cancels the handshake timer after upgrade", async () => {
		const transport = createTransport({ limits: { handshakeTimeoutMs: 50 } });
		const operation = beginConnect(transport);
		const socket = upgrade(await requestAt());
		const connection = await operation;
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(100);
		expect(connection.state).toBe("open");
		expect(socket.destroyed).toBe(false);
	});

	it.each(["DNS", "request"])(
		"close settles pending %s and rejects future connects",
		async (phase) => {
			const dns = deferredDns();
			const resolver = vi.fn((_hostname: string, _signal: AbortSignal) =>
				phase === "DNS" ? dns.promise : Promise.resolve([publicAddress]),
			);
			const transport = createTransport({ resolver });
			const operation = beginConnect(transport);
			await flushMicrotasks();
			const request = phase === "request" ? await requestAt() : undefined;
			await transport.close();
			await expect(operation).rejects.toMatchObject({ code: "closed" });
			expect(resolver.mock.calls[0][1].aborted).toBe(true);
			if (request) {
				expect(request.destroyed).toBe(true);
				expect(upgrade(request).destroyed).toBe(true);
			} else {
				dns.resolve([publicAddress]);
				await flushMicrotasks();
				expectNoRequest();
			}
			await expect(
				transport.connect(target, documentOptions),
			).rejects.toMatchObject({ code: "closed" });
			await transport.close();
			expect(resolver).toHaveBeenCalledTimes(1);
			expect(transport.metrics()).toMatchObject({
				closed: true,
				pending: 0,
				active: 0,
			});
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("close settles all streams, queued writes, read waiters, pending requests, and DNS together", async () => {
		const dns = deferredDns();
		const resolver = vi.fn((hostname: string) =>
			hostname === "pending.example"
				? dns.promise
				: Promise.resolve([publicAddress]),
		);
		const transport = createTransport({ resolver });
		const firstOperation = beginConnect(transport);
		const firstSocket = upgrade(await requestAt());
		const first = await firstOperation;
		const secondOperation = beginConnect(transport);
		const secondSocket = upgrade(await requestAt(1));
		const second = await secondOperation;
		const firstRead = observe(first.read());
		const secondRead = observe(second.read());
		firstSocket.holdWrites = true;
		const write = observe(first.send("outgoing only"));
		const requestOperation = observe(beginConnect(transport));
		const pendingRequest = await requestAt(2);
		const dnsOperation = observe(
			beginConnect(transport, "wss://pending.example/"),
		);
		await flushMicrotasks();
		expect(firstSocket.writes).toHaveLength(1);
		expect(first.metrics().receivedBytes).toBe(0);
		expect(transport.metrics()).toMatchObject({ active: 2, pending: 2 });
		await transport.close();
		for (const operation of [
			firstRead,
			secondRead,
			write,
			requestOperation,
			dnsOperation,
		])
			await expect(operation).resolves.toMatchObject({
				error: { code: "closed" },
			});
		for (const connection of [first, second]) {
			await expect(connection.closed).resolves.toMatchObject({
				code: 1006,
				wasClean: false,
			});
			expect(connection.state).toBe("closed");
		}
		expect(firstSocket.destroyed).toBe(true);
		expect(secondSocket.destroyed).toBe(true);
		expect(pendingRequest.destroyed).toBe(true);
		expect(first.metrics().pendingSendBytes).toBe(0);
		dns.resolve([publicAddress]);
		await flushMicrotasks();
		expect(requests).toHaveLength(3);
		expect(upgrade(pendingRequest).destroyed).toBe(true);
		expect(transport.metrics()).toMatchObject({
			active: 0,
			pending: 0,
			closed: true,
		});
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("concurrent and lifetime attempt limits", () => {
	it.each(["DNS", "request", "active"])(
		"counts %s connections against the concurrent cap before further DNS",
		async (phase) => {
			const dns = deferredDns();
			const resolver = vi.fn(() =>
				phase === "DNS" ? dns.promise : Promise.resolve([publicAddress]),
			);
			const transport = createTransport({
				resolver,
				limits: { maxConcurrent: 1 },
			});
			const operation = beginConnect(transport);
			await flushMicrotasks();
			if (phase !== "DNS") {
				const request = await requestAt();
				if (phase === "active") {
					upgrade(request);
					await operation;
				}
			}
			await expect(
				transport.connect(target, documentOptions),
			).rejects.toMatchObject({ code: "resource-limit" });
			expect(resolver).toHaveBeenCalledTimes(1);
			expect(transport.metrics()).toMatchObject({
				attempts: 1,
				active: phase === "active" ? 1 : 0,
				pending: phase === "active" ? 0 : 1,
			});
			expect(requests).toHaveLength(phase === "DNS" ? 0 : 1);
		},
	);

	it("releases concurrent capacity after failed handshakes and closed connections", async () => {
		const transport = createTransport({ limits: { maxConcurrent: 1 } });
		const failed = beginConnect(transport);
		const failedRequest = await requestAt();
		failedRequest.emit("error", new Error("failed"));
		await expect(failed).rejects.toMatchObject({ code: "network-error" });
		const successful = beginConnect(transport);
		upgrade(await requestAt(1));
		const connection = await successful;
		connection.abort();
		await connection.closed;
		const replacement = beginConnect(transport);
		upgrade(await requestAt(2));
		await replacement;
		expect(transport.metrics()).toMatchObject({
			attempts: 3,
			requests: 3,
			active: 1,
			pending: 0,
			established: 2,
		});
	});

	it("counts DNS and request failures toward the lifetime attempt cap", async () => {
		const resolver = vi.fn(async () => [publicAddress]);
		resolver.mockRejectedValueOnce(new Error("DNS failed"));
		const transport = createTransport({
			resolver,
			limits: { maxConnections: 2 },
		});
		await expect(
			transport.connect(target, documentOptions),
		).rejects.toMatchObject({ code: "network-error" });
		const second = beginConnect(transport);
		const request = await requestAt();
		request.emit("error", new Error("request failed"));
		await expect(second).rejects.toMatchObject({ code: "network-error" });
		await expect(
			transport.connect(target, documentOptions),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(resolver).toHaveBeenCalledTimes(2);
		expect(requests).toHaveLength(1);
		expect(transport.metrics()).toMatchObject({
			attempts: 2,
			requests: 1,
			pending: 0,
			active: 0,
			established: 0,
		});
	});

	it("does not restore lifetime capacity when an established connection closes", async () => {
		const resolver = vi.fn(async () => [publicAddress]);
		const transport = createTransport({
			resolver,
			limits: { maxConnections: 1 },
		});
		const operation = beginConnect(transport);
		upgrade(await requestAt());
		const connection = await operation;
		connection.abort();
		await connection.closed;
		await expect(
			transport.connect(target, documentOptions),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(transport.metrics()).toMatchObject({
			attempts: 1,
			active: 0,
			pending: 0,
			established: 1,
		});
	});
});
