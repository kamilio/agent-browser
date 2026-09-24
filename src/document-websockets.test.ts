import { getEventListeners } from "node:events";
import { Duplex } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import {
	type DocumentWebSocketLimits,
	DocumentWebSockets,
} from "./document-websockets.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { NodeWebSocketConnection } from "./node-websocket-connection.js";
import { nodeWebSocketLimits } from "./node-websocket-transport.js";
import type {
	WebSocketCloseResult,
	WebSocketConnection,
	WebSocketTransport,
} from "./websocket-transport.js";

const trees: DocumentTree[] = [];

it.each([false, true])(
	"aborts throwing completion getters exactly once (late: %s)",
	async (late) => {
		vi.useFakeTimers();
		const { sockets, pending } = fixture({ maxConcurrent: 1 });
		const selected = connection();
		Object.defineProperty(selected.socket, "closed", {
			get() {
				throw Error("bad completion");
			},
		});
		const controller = new AbortController();
		const requested = sockets.connect("/feed", { signal: controller.signal });
		const rejected = expect(requested).rejects.toMatchObject({
			code: late ? "aborted" : "network-error",
		});
		await Promise.resolve();
		if (late) controller.abort();
		pending.resolve(selected.socket);
		await rejected;
		await vi.advanceTimersByTimeAsync(0);
		expect(selected.socket.abort).toHaveBeenCalledOnce();
		expect(sockets.metrics()).toMatchObject({
			connecting: 0,
			closing: 1,
			quarantined: 1,
			cleanupFailures: 1,
		});
		await expect(sockets.connect("/feed")).rejects.toMatchObject({
			code: "resource-limit",
		});
		sockets.close();
		expect(selected.socket.abort).toHaveBeenCalledOnce();
	},
);

it.each([
	[false, "resolve"],
	[true, "resolve"],
	[false, "reject"],
	[true, "reject"],
	[false, "throw"],
	[true, "throw"],
] as const)(
	"quarantines missing completion after %s late / %s abort",
	async (late, outcome) => {
		vi.useFakeTimers();
		const { sockets, pending } = fixture({ maxConcurrent: 1 });
		const selected = connection();
		Object.defineProperty(selected.socket, "closed", { value: undefined });
		const cleanup = deferred<void>();
		selected.socket.abort = vi.fn(() => {
			if (outcome === "throw") throw Error("cleanup failed");
			return cleanup.promise;
		});
		const controller = new AbortController();
		const requested = sockets.connect("/feed", { signal: controller.signal });
		const rejected = expect(requested).rejects.toMatchObject({
			code: late ? "aborted" : "network-error",
		});
		await Promise.resolve();
		if (late) controller.abort();
		pending.resolve(selected.socket);
		await rejected;
		await vi.advanceTimersByTimeAsync(0);
		expect(selected.socket.abort).toHaveBeenCalledOnce();
		await expect(sockets.connect("/feed")).rejects.toMatchObject({
			code: "resource-limit",
		});
		if (outcome === "reject") cleanup.reject(Error("cleanup failed"));
		else cleanup.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(sockets.metrics()).toMatchObject({
			connecting: 0,
			closing: 1,
			quarantined: 1,
			cleanupFailures: outcome === "resolve" ? 0 : 1,
		});
		await expect(sockets.connect("/feed")).rejects.toMatchObject({
			code: "resource-limit",
		});
		sockets.close();
		expect(selected.socket.abort).toHaveBeenCalledOnce();
	},
);

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});

function deferred<Result>() {
	let resolve!: (result: Result) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Result>((success, failure) => {
		resolve = success;
		reject = failure;
	});
	return { promise, resolve, reject };
}

function connection(url = "wss://example.com/feed", protocol = "") {
	const completion = deferred<WebSocketCloseResult>();
	const result: WebSocketCloseResult = {
		code: 1000,
		reason: "",
		wasClean: true,
	};
	const socket: WebSocketConnection = {
		url,
		protocol,
		closed: completion.promise,
		read: vi.fn(async () => undefined),
		send: vi.fn(async () => undefined),
		close: vi.fn(async () => {
			completion.resolve(result);
			return result;
		}),
		abort: vi.fn(() =>
			completion.resolve({ ...result, code: 1006, wasClean: false }),
		),
	};
	return { socket, completion };
}

function fixture(limits: Partial<DocumentWebSocketLimits> = {}) {
	const tree = parseHtmlDocument(
		"<main>Offline fixture</main>",
		"https://example.com/page",
	);
	trees.push(tree);
	const pending = deferred<WebSocketConnection>();
	const transport = {
		connect: vi.fn(() => pending.promise),
	} satisfies WebSocketTransport;
	const sockets = new DocumentWebSockets(tree, transport, { limits });
	return { tree, sockets, transport, pending };
}

it("hands normalized URLs, immutable protocols and document origin to an explicit adapter", async () => {
	const { sockets, transport, pending } = fixture();
	const protocols = ["one"];
	const requested = sockets.connect("/feed", { protocols });
	protocols[0] = "two";
	await Promise.resolve();
	expect(transport.connect).toHaveBeenCalledOnce();
	expect(transport.connect).toHaveBeenCalledWith("wss://example.com/feed", {
		origin: "https://example.com",
		protocols: ["one"],
		signal: expect.any(AbortSignal),
	});
	const selected = connection(undefined, "one");
	pending.resolve(selected.socket);
	expect(await requested).toBe(selected.socket);
	expect(sockets.metrics()).toMatchObject({
		attempts: 1,
		connecting: 0,
		open: 1,
		failures: 0,
	});
});

it.each([null, {}, { connect: 1 }])(
	"rejects invalid adapters %j",
	(transport) => {
		const { tree } = fixture();
		expect(
			() =>
				new DocumentWebSockets(
					tree,
					transport as unknown as WebSocketTransport,
				),
		).toThrow(/transport/);
	},
);

it.each([
	0,
	-1,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
])("rejects invalid limits %s", (value) => {
	for (const name of [
		"maxConcurrent",
		"maxConnections",
		"handshakeTimeoutMs",
	] as const)
		expect(() => fixture({ [name]: value })).toThrow(/limits|timeout/);
});

it("rejects overflowing timer values", () => {
	expect(() => fixture({ handshakeTimeoutMs: 2_147_483_648 })).toThrow(
		/timeout/,
	);
});

it.each([null, [], 2])(
	"rejects invalid request options before an adapter call %j",
	async (options) => {
		const { sockets, transport } = fixture();
		await expect(
			sockets.connect("/feed", options as never),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(transport.connect).not.toHaveBeenCalled();
	},
);

it.each([
	[""],
	["a", "a"],
	["bad token"],
	["a".repeat(257)],
	Array(33).fill("a"),
])("validates requested protocols before connecting %j", async (protocols) => {
	const { sockets, transport } = fixture();
	await expect(sockets.connect("/feed", { protocols })).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(transport.connect).not.toHaveBeenCalled();
	expect(sockets.metrics().attempts).toBe(0);
});

it("rejects non-signals without transport effects", async () => {
	const { sockets, transport } = fixture();
	await expect(
		sockets.connect("/feed", { signal: {} as AbortSignal }),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(transport.connect).not.toHaveBeenCalled();
});

it("rejects already aborted requests without spending admission", async () => {
	const { sockets, transport } = fixture();
	await expect(
		sockets.connect("/feed", { signal: AbortSignal.abort() }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(transport.connect).not.toHaveBeenCalled();
	expect(sockets.metrics().attempts).toBe(0);
});

it("cancels before dispatch without invoking the transport", async () => {
	const { sockets, transport } = fixture();
	const controller = new AbortController();
	const requested = sockets.connect("/feed", { signal: controller.signal });
	controller.abort();
	await expect(requested).rejects.toMatchObject({ code: "aborted" });
	expect(transport.connect).not.toHaveBeenCalled();
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it("cancels an uncooperative pending transport and aborts its late result", async () => {
	const { sockets, transport, pending } = fixture();
	const controller = new AbortController();
	const requested = sockets.connect("/feed", { signal: controller.signal });
	await Promise.resolve();
	controller.abort();
	await expect(requested).rejects.toMatchObject({ code: "aborted" });
	expect(transport.connect.mock.calls[0]).toBeDefined();
	const late = connection();
	pending.resolve(late.socket);
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	expect(late.socket.abort).toHaveBeenCalledOnce();
	expect(sockets.metrics()).toMatchObject({
		connecting: 0,
		open: 0,
		failures: 1,
	});
});

it("terminates pending ownership on a bounded handshake timeout", async () => {
	vi.useFakeTimers();
	const { sockets, pending } = fixture({ handshakeTimeoutMs: 5 });
	const controller = new AbortController();
	const requested = sockets.connect("/feed", { signal: controller.signal });
	const rejected = expect(requested).rejects.toMatchObject({ code: "timeout" });
	await vi.advanceTimersByTimeAsync(5);
	await rejected;
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	const late = connection();
	pending.resolve(late.socket);
	await vi.advanceTimersByTimeAsync(0);
	expect(late.socket.abort).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
});

it("clears the handshake deadline after a successful open", async () => {
	vi.useFakeTimers();
	const { sockets, pending } = fixture({ handshakeTimeoutMs: 5 });
	const selected = connection();
	pending.resolve(selected.socket);
	await sockets.connect("/feed");
	await vi.advanceTimersByTimeAsync(10);
	expect(selected.socket.abort).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("counts pending and established sockets against the concurrent limit", async () => {
	const { sockets, pending, transport } = fixture({ maxConcurrent: 1 });
	const requested = sockets.connect("/feed");
	await expect(sockets.connect("/other")).rejects.toMatchObject({
		code: "resource-limit",
	});
	const selected = connection();
	pending.resolve(selected.socket);
	await requested;
	await expect(sockets.connect("/other")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(transport.connect).toHaveBeenCalledOnce();
	await selected.socket.close();
	expect(sockets.metrics().open).toBe(0);
});

it("releases concurrency but not the lifetime attempt budget after close", async () => {
	const { sockets, pending } = fixture({ maxConcurrent: 1, maxConnections: 1 });
	const selected = connection();
	pending.resolve(selected.socket);
	await sockets.connect("/feed");
	await selected.socket.close();
	await expect(sockets.connect("/feed")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(sockets.metrics()).toMatchObject({ attempts: 1, open: 0 });
});

it.each([false, true])(
	"charges failed attempts and removes signal listeners (sync: %s)",
	async (synchronous) => {
		const { sockets, transport, pending } = fixture({ maxConnections: 1 });
		const controller = new AbortController();
		if (synchronous)
			transport.connect.mockImplementation(() => {
				throw Error("private detail");
			});
		else pending.reject(Error("private detail"));
		await expect(
			sockets.connect("/feed", { signal: controller.signal }),
		).rejects.toMatchObject({
			code: "network-error",
			message: "WebSocket connection failed",
		});
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		await expect(sockets.connect("/feed")).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(sockets.metrics()).toMatchObject({
			attempts: 1,
			connecting: 0,
			failures: 1,
		});
	},
);

it.each([false, true])(
	"owns the native frame connection over memory streams (binary: %s)",
	async (binary) => {
		const { tree, sockets, transport } = fixture();
		const writes: Uint8Array[] = [];
		const stream = new Duplex({
			read() {},
			write(chunk, _encoding, complete) {
				writes.push(new Uint8Array(chunk));
				complete();
			},
		});
		const native = new NodeWebSocketConnection(
			stream,
			"wss://example.com/feed",
			"",
			nodeWebSocketLimits,
		);
		transport.connect.mockResolvedValue(native);
		const selected = await sockets.connect("/feed");
		const payload = Uint8Array.from([104, 105]);
		stream.push(Uint8Array.from([binary ? 0x82 : 0x81, 2, ...payload]));
		expect(await selected.read()).toEqual({ data: binary ? payload : "hi" });
		await selected.send(binary ? payload : "hi");
		expect(writes).toHaveLength(1);
		const frame = writes[0];
		expect(frame[0]).toBe(binary ? 0x82 : 0x81);
		expect(frame[1]).toBe(0x82);
		expect(
			frame.slice(6).map((value, index) => value ^ frame[2 + (index % 4)]),
		).toEqual(payload);
		const pendingRead = expect(selected.read()).rejects.toMatchObject({
			code: "closed",
		});
		tree.close();
		await pendingRead;
		expect(await selected.closed).toMatchObject({
			code: 1006,
			wasClean: false,
		});
		expect(stream.destroyed).toBe(true);
		expect(native.state).toBe("closed");
		expect(sockets.metrics()).toMatchObject({
			closed: true,
			connecting: 0,
			closing: 0,
			open: 0,
			cleanupFailures: 0,
		});
	},
);

it("preserves typed transport policy failures", async () => {
	const { sockets, pending } = fixture();
	pending.reject(new AgentBrowserError("policy-denied", "Denied transport"));
	await expect(sockets.connect("/feed")).rejects.toMatchObject({
		code: "policy-denied",
	});
});

it.each(["url", "protocol", "read", "send", "close", "abort", "closed"])(
	"rejects invalid transport results (%s)",
	async (field) => {
		const { sockets, pending } = fixture();
		const selected = connection();
		const altered = {
			...selected.socket,
			[field]: field === "url" ? "wss://other.example/feed" : "invalid",
		} as unknown as WebSocketConnection;
		pending.resolve(altered);
		await expect(sockets.connect("/feed")).rejects.toMatchObject({
			code: "network-error",
		});
		expect(sockets.metrics()).toMatchObject({
			open: 0,
			failures: 1,
			cleanupFailures: field === "abort" ? 1 : 0,
		});
	},
);

it("caller cancellation remains attached until the connection closes", async () => {
	const { sockets, pending } = fixture();
	const selected = connection();
	const controller = new AbortController();
	pending.resolve(selected.socket);
	await sockets.connect("/feed", { signal: controller.signal });
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
	controller.abort();
	expect(selected.socket.abort).toHaveBeenCalledOnce();
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	expect(sockets.metrics().open).toBe(0);
});

it("normal peer closure detaches caller cancellation without aborting again", async () => {
	const { sockets, pending } = fixture();
	const selected = connection();
	const controller = new AbortController();
	pending.resolve(selected.socket);
	await sockets.connect("/feed", { signal: controller.signal });
	await selected.socket.close();
	controller.abort();
	expect(selected.socket.abort).not.toHaveBeenCalled();
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it("handles rejected close promises without leaking ownership", async () => {
	const { sockets, pending } = fixture();
	const selected = connection();
	pending.resolve(selected.socket);
	await sockets.connect("/feed");
	selected.completion.reject(Error("close failure"));
	await Promise.resolve();
	expect(selected.socket.abort).toHaveBeenCalledOnce();
	expect(sockets.metrics()).toMatchObject({ open: 0, failures: 1 });
});

it("document close cancels all owned requests and makes reconnect impossible", async () => {
	const { tree, sockets, pending } = fixture();
	const requested = sockets.connect("/feed");
	await Promise.resolve();
	tree.close();
	await expect(requested).rejects.toMatchObject({ code: "closed" });
	await expect(sockets.connect("/feed")).rejects.toMatchObject({
		code: "closed",
	});
	const selected = connection();
	pending.resolve(selected.socket);
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	expect(selected.socket.abort).toHaveBeenCalledOnce();
	expect(sockets.metrics()).toMatchObject({
		closed: true,
		connecting: 0,
		open: 0,
	});
});

it("owner close is idempotent and continues after one adapter abort throws", async () => {
	const { tree, sockets, transport } = fixture();
	const first = connection();
	const second = connection();
	first.socket.abort = vi.fn(() => {
		throw Error("abort failure");
	});
	transport.connect
		.mockResolvedValueOnce(first.socket)
		.mockResolvedValueOnce(second.socket);
	await sockets.connect("/feed");
	await sockets.connect("/feed");
	sockets.close();
	sockets.close();
	tree.close();
	expect(first.socket.abort).toHaveBeenCalledOnce();
	expect(second.socket.abort).toHaveBeenCalledOnce();
	expect(sockets.metrics()).toMatchObject({ open: 0, cleanupFailures: 1 });
});

it("rejects policy violations before transport dispatch or attempt consumption", async () => {
	const { sockets, transport } = fixture();
	await expect(sockets.connect("ws://example.com/feed")).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(transport.connect).not.toHaveBeenCalled();
	expect(sockets.metrics().attempts).toBe(0);
});

it.each(["abort", "timeout"])(
	"retains pending concurrency after %s until late resource closure",
	async (method) => {
		vi.useFakeTimers();
		const { sockets, pending, transport } = fixture({
			maxConcurrent: 1,
			handshakeTimeoutMs: 5,
		});
		const controller = new AbortController();
		const requested = sockets.connect("/feed", { signal: controller.signal });
		const rejected = expect(requested).rejects.toMatchObject({
			code: method === "abort" ? "aborted" : "timeout",
		});
		await Promise.resolve();
		if (method === "abort") controller.abort();
		else await vi.advanceTimersByTimeAsync(5);
		await rejected;
		await expect(sockets.connect("/next")).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(transport.connect).toHaveBeenCalledOnce();
		expect(sockets.metrics()).toMatchObject({ connecting: 1, open: 0 });
		const late = connection();
		late.socket.abort = vi.fn();
		pending.resolve(late.socket);
		await vi.advanceTimersByTimeAsync(0);
		expect(late.socket.abort).toHaveBeenCalledOnce();
		expect(sockets.metrics()).toMatchObject({
			connecting: 0,
			closing: 1,
			open: 0,
		});
		await expect(sockets.connect("/next")).rejects.toMatchObject({
			code: "resource-limit",
		});
		late.completion.resolve({ code: 1006, reason: "", wasClean: false });
		await vi.advanceTimersByTimeAsync(0);
		expect(sockets.metrics()).toMatchObject({
			connecting: 0,
			closing: 0,
			open: 0,
		});
		const replacement = connection();
		transport.connect.mockResolvedValueOnce(replacement.socket);
		expect(await sockets.connect("/feed")).toBe(replacement.socket);
	},
);

it("retains an established closing slot until its closed promise settles", async () => {
	const { sockets, pending } = fixture({ maxConcurrent: 1 });
	const selected = connection();
	selected.socket.abort = vi.fn();
	pending.resolve(selected.socket);
	const controller = new AbortController();
	await sockets.connect("/feed", { signal: controller.signal });
	controller.abort();
	await expect(sockets.connect("/feed")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(sockets.metrics()).toMatchObject({ open: 0, closing: 1 });
	selected.completion.resolve({ code: 1006, reason: "", wasClean: false });
	await Promise.resolve();
	expect(sockets.metrics().closing).toBe(0);
});

it.each([false, true])(
	"observes rejected asynchronous abort cleanup (late: %s)",
	async (late) => {
		vi.useFakeTimers();
		const { sockets, pending } = fixture();
		const controller = new AbortController();
		const selected = connection();
		selected.socket.abort = vi.fn(async () => {
			throw Error("cleanup failed");
		});
		const requested = sockets.connect("/feed", { signal: controller.signal });
		await Promise.resolve();
		if (late) {
			controller.abort();
			await expect(requested).rejects.toMatchObject({ code: "aborted" });
			pending.resolve(selected.socket);
		} else {
			pending.resolve(selected.socket);
			await requested;
			controller.abort();
		}
		await vi.advanceTimersByTimeAsync(0);
		expect(selected.socket.abort).toHaveBeenCalledOnce();
		expect(sockets.metrics()).toMatchObject({ cleanupFailures: 1, closing: 1 });
		selected.completion.resolve({ code: 1006, reason: "", wasClean: false });
		await vi.advanceTimersByTimeAsync(0);
		expect(sockets.metrics().closing).toBe(0);
	},
);

it("uses fetched Worker connect policy and base URL independently of document CSP", async () => {
	const tree = parseHtmlDocument(
		'<base href="https://foreign.test/">',
		"https://example.com/page",
	);
	trees.push(tree);
	const selected = connection("wss://example.com/workers/feed");
	const transport = { connect: vi.fn(async () => selected.socket) };
	const sockets = new DocumentWebSockets(tree, transport, {
		headerValues: ["connect-src 'none'"],
	});
	const check = vi.fn();
	const worker = sockets.forWorker(
		"https://example.com/workers/main.js",
		check,
	);
	await expect(worker.start("feed").connection).resolves.toBe(selected.socket);
	expect(check.mock.calls).toEqual([
		[selected.socket.url],
		[selected.socket.url],
	]);
	expect(transport.connect).toHaveBeenCalledWith(
		selected.socket.url,
		expect.objectContaining({ origin: "https://example.com" }),
	);
	expect(() => sockets.start(selected.socket.url)).toThrow(
		/Content Security Policy/,
	);
	expect(() =>
		sockets.forWorker("blob:https://example.com/id").start(selected.socket.url),
	).toThrow(/Content Security Policy/);
});

it("rechecks Worker CSP before dispatch and shares document admission quotas", async () => {
	const { sockets, transport } = fixture({ maxConcurrent: 1 });
	const check = vi
		.fn()
		.mockImplementationOnce(() => undefined)
		.mockImplementation(() => {
			throw new AgentBrowserError("policy-denied", "revoked");
		});
	const worker = sockets.forWorker("https://example.com/worker.js", check);
	const attempt = worker.start("/feed");
	expect(() => sockets.start("/feed")).toThrow(/connection limit/);
	expect(() =>
		sockets.forWorker("https://example.com/other.js", () => {}).start("/feed"),
	).toThrow(/connection limit/);
	await expect(attempt.connection).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(transport.connect).not.toHaveBeenCalled();
	expect(sockets.metrics()).toMatchObject({ connecting: 0, open: 0 });
});

it("denies missing Worker policy, foreign owners, unsafe URLs and closed document scopes", () => {
	const { sockets, transport } = fixture();
	expect(() => sockets.forWorker("https://foreign.test/worker.js")).toThrow(
		/same-origin/,
	);
	expect(() =>
		sockets.forWorker("https://example.com/worker.js").start("/feed"),
	).toThrow(/CSP is unavailable/);
	const check = vi.fn();
	const worker = sockets.forWorker("https://example.com/worker.js", check);
	for (const url of [
		"ws://example.com/feed",
		"wss://user:pass@example.com/feed",
		"wss://example.com/feed#",
		"file:///feed",
		"x".repeat(4097),
	])
		expect(() => worker.start(url)).toThrow();
	expect(check).not.toHaveBeenCalled();
	sockets.close();
	expect(() => worker.start("/feed")).toThrow(/closed/);
	expect(transport.connect).not.toHaveBeenCalled();
});
