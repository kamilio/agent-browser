import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import {
	BrowserSession,
	type BrowserSessionOptions,
	type DocumentLoaderContext,
} from "./session.js";
import type {
	WebSocketConnection,
	WebSocketTransport,
} from "./websocket-transport.js";

const sessions: BrowserSession[] = [];
const initialUrl = "https://example.com/start";
const socketUrl = "wss://example.com/events";

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<Value>((success, failure) => {
		resolve = success;
		reject = failure;
	});
	return { promise, resolve, reject };
}

function response(
	url: string,
	headers: NetworkResponse["headers"] = {},
): NetworkResponse {
	const body = new TextEncoder().encode("Constructed WebSocket fixture");
	return {
		url,
		status: 200,
		headers,
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 1,
	};
}

function documentFixture(
	result: NetworkResponse,
	context: DocumentLoaderContext,
) {
	const tree = new DocumentTree(result.url, context.limits);
	const body = tree.createElement("body");
	tree.append(tree.root, body);
	const heading = tree.createElement("h1", { id: "target" });
	tree.append(body, heading);
	tree.append(heading, tree.createText("Constructed WebSocket fixture"));
	return tree;
}

function fixture(
	options: Partial<BrowserSessionOptions> = {},
	handler: (input: NetworkRequest) => Promise<NetworkResponse> = async (
		input,
	) => response(input.url),
) {
	const requests: NetworkRequest[] = [];
	let active = 0;
	let closed = false;
	const transport: NetworkTransport = {
		async request(input) {
			requests.push(input);
			active++;
			try {
				return await handler(input);
			} finally {
				active--;
			}
		},
		metrics: () => ({
			requests: requests.length,
			active,
			closed,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
		}),
		close: () => {
			closed = true;
		},
	};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument: documentFixture,
		...options,
	});
	sessions.push(session);
	return { session, requests };
}

function socketFixture(url = socketUrl, protocol = "") {
	const completion = deferred<Awaited<WebSocketConnection["closed"]>>();
	const connection = {
		url,
		protocol,
		closed: completion.promise,
		read: vi.fn(async () => undefined),
		send: vi.fn(async (_data: string | Uint8Array) => {}),
		close: vi.fn(async (code = 1000, reason = "") => {
			const result = { code, reason, wasClean: true };
			completion.resolve(result);
			return result;
		}),
		abort: vi.fn((_error?: AgentBrowserError) => {
			completion.resolve({ code: 1006, reason: "", wasClean: false });
		}),
	} satisfies WebSocketConnection;
	return connection;
}

function webSocketFixture(handler?: WebSocketTransport["connect"]) {
	const connections: ReturnType<typeof socketFixture>[] = [];
	const connect = vi.fn<WebSocketTransport["connect"]>(async (url, options) => {
		if (handler) return handler(url, options);
		const connection = socketFixture(url, options.protocols?.[0]);
		connections.push(connection);
		return connection;
	});
	return { transport: { connect } satisfies WebSocketTransport, connections };
}

function webSockets(session: BrowserSession, tab: string) {
	const owner = session.page(tab).webSockets;
	if (!owner) throw new Error("Expected a document WebSocket owner");
	return owner;
}

function observeConnection(promise: Promise<WebSocketConnection>) {
	return promise.then(
		() => ({ state: "connected" }),
		(error: unknown) => ({ state: "rejected", error }),
	);
}

function expectClosed(connection: ReturnType<typeof socketFixture>) {
	expect(
		connection.abort.mock.calls.length + connection.close.mock.calls.length,
	).toBeGreaterThan(0);
}

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

it("does not expose document WebSockets without an explicit transport", async () => {
	const { session, requests } = fixture();
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(session.page(tab).webSockets).toBeUndefined();
	expect(requests.map((request) => request.url)).toEqual([initialUrl]);
});

it.each([null, false, "transport", {}, { connect: null }, { connect: 1 }])(
	"rejects an invalid WebSocket transport %j before constructing HTTP",
	(invalid) => {
		const createTransport = vi.fn((): NetworkTransport => {
			throw new Error("HTTP adapter must not be constructed");
		});
		expect(() =>
			fixture({
				createTransport,
				webSocketTransport: invalid as unknown as WebSocketTransport,
			}),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(createTransport).not.toHaveBeenCalled();
	},
);

it("forwards resolved URLs, document origin, protocols and a live signal", async () => {
	const sockets = webSocketFixture();
	const { session, requests } = fixture({
		webSocketTransport: sockets.transport,
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const owner = webSockets(session, tab);
	expect(sockets.transport.connect).not.toHaveBeenCalled();
	const connection = await owner.connect("/events?room=fixture", {
		protocols: ["notes.v1", "notes.v2"],
	});
	expect(sockets.transport.connect).toHaveBeenCalledExactlyOnceWith(
		"wss://example.com/events?room=fixture",
		expect.objectContaining({
			origin: "https://example.com",
			protocols: ["notes.v1", "notes.v2"],
			signal: expect.any(AbortSignal),
		}),
	);
	expect(sockets.transport.connect.mock.calls[0][1].signal?.aborted).toBe(
		false,
	);
	expect(connection.url).toBe("wss://example.com/events?room=fixture");
	expect(connection.protocol).toBe("notes.v1");
	await connection.send("constructed frame");
	expect(sockets.connections[0].send).toHaveBeenCalledWith("constructed frame");
	expect(requests).toHaveLength(1);
});

it("uses the final document origin and its response CSP after navigation redirects", async () => {
	const sockets = webSocketFixture();
	const finalUrl = "https://destination.example/room";
	const { session } = fixture(
		{ webSocketTransport: sockets.transport },
		async () => ({
			...response(finalUrl, {
				"content-security-policy": ["connect-src wss://relay.example"],
			}),
			redirects: [{ url: initialUrl, status: 302, location: finalUrl }],
		}),
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const owner = webSockets(session, tab);
	await owner.connect("wss://relay.example/stream");
	expect(sockets.transport.connect).toHaveBeenCalledWith(
		"wss://relay.example/stream",
		expect.objectContaining({ origin: "https://destination.example" }),
	);
	await expect(owner.connect(socketUrl)).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(sockets.transport.connect).toHaveBeenCalledTimes(1);
});

it.each([
	["connect-src 'none'"],
	["default-src 'none'"],
	["connect-src wss:", "connect-src 'none'"],
])(
	"enforces response CSP headers %j before transport use",
	async (...policies) => {
		const sockets = webSocketFixture();
		const { session } = fixture(
			{ webSocketTransport: sockets.transport },
			async (input) =>
				response(input.url, { "content-security-policy": policies }),
		);
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		await expect(
			webSockets(session, tab).connect(socketUrl),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(sockets.transport.connect).not.toHaveBeenCalled();
	},
);

it("allows cross-origin secure sockets but blocks mixed content before transport use", async () => {
	const sockets = webSocketFixture();
	const { session } = fixture({ webSocketTransport: sockets.transport });
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const owner = webSockets(session, tab);
	await owner.connect("wss://relay.example/stream");
	await expect(
		owner.connect("ws://relay.example/stream"),
	).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(sockets.transport.connect).toHaveBeenCalledExactlyOnceWith(
		"wss://relay.example/stream",
		expect.objectContaining({ origin: "https://example.com" }),
	);
});

it("closes established sockets on replacement and applies the new response CSP", async () => {
	const sockets = webSocketFixture();
	const replacement = "https://example.com/replaced";
	const { session } = fixture(
		{ webSocketTransport: sockets.transport },
		async (input) =>
			response(input.url, {
				"content-security-policy": [
					input.url === replacement ? "connect-src 'none'" : "connect-src wss:",
				],
			}),
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const previous = webSockets(session, tab);
	await previous.connect(socketUrl);
	await session.navigate(tab, replacement);
	expectClosed(sockets.connections[0]);
	expect(webSockets(session, tab)).not.toBe(previous);
	await expect(previous.connect(socketUrl)).rejects.toMatchObject({
		code: "closed",
	});
	await expect(
		webSockets(session, tab).connect(socketUrl),
	).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(sockets.transport.connect).toHaveBeenCalledTimes(1);
});

it("cancels a pending connection on replacement and disposes a late transport result", async () => {
	const started = deferred<Parameters<WebSocketTransport["connect"]>[1]>();
	const pending = deferred<WebSocketConnection>();
	const sockets = webSocketFixture(async (_url, options) => {
		started.resolve(options);
		return pending.promise;
	});
	const { session } = fixture({ webSocketTransport: sockets.transport });
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const result = observeConnection(webSockets(session, tab).connect(socketUrl));
	const options = await started.promise;
	await session.navigate(tab, "https://example.com/replaced");
	expect(options.signal?.aborted).toBe(true);
	await expect(result).resolves.toMatchObject({
		state: "rejected",
		error: expect.any(AgentBrowserError),
	});
	const late = socketFixture();
	pending.resolve(late);
	await expect(late.closed).resolves.toEqual(expect.any(Object));
	expectClosed(late);
});

it.each(["transport", "loader"] as const)(
	"preserves the displayed document socket when the next %s fails",
	async (failure) => {
		const sockets = webSocketFixture();
		const replacement = "https://example.com/failed";
		const { session } = fixture(
			{
				webSocketTransport: sockets.transport,
				loadDocument: (result, context) => {
					if (failure === "loader" && result.url === replacement)
						throw new Error("Constructed document failure");
					return documentFixture(result, context);
				},
			},
			async (input) => {
				if (failure === "transport" && input.url === replacement)
					throw new AgentBrowserError(
						"network-error",
						"Constructed HTTP failure",
					);
				return response(input.url);
			},
		);
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		const page = session.page(tab);
		const connection = await webSockets(session, tab).connect(socketUrl);
		await expect(session.navigate(tab, replacement)).rejects.toBeInstanceOf(
			AgentBrowserError,
		);
		expect(session.page(tab)).toBe(page);
		expect(sockets.connections[0].abort).not.toHaveBeenCalled();
		expect(sockets.connections[0].close).not.toHaveBeenCalled();
		await connection.send("still active");
		await webSockets(session, tab).connect("/another");
		expect(sockets.transport.connect).toHaveBeenCalledTimes(2);
	},
);

it("preserves sockets and their owner across fragment navigation", async () => {
	const sockets = webSocketFixture();
	const { session, requests } = fixture({
		webSocketTransport: sockets.transport,
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const owner = webSockets(session, tab);
	const connection = await owner.connect(socketUrl);
	const navigation = await session.navigate(tab, `${initialUrl}#target`);
	expect(navigation.kind).toBe("same-document");
	expect(webSockets(session, tab)).toBe(owner);
	expect(sockets.connections[0].abort).not.toHaveBeenCalled();
	expect(sockets.connections[0].close).not.toHaveBeenCalled();
	expect(sockets.transport.connect.mock.calls[0][1].signal?.aborted).toBe(
		false,
	);
	await connection.send("after fragment navigation");
	expect(requests).toHaveLength(1);
});

it("isolates tab owners, origins and socket cleanup", async () => {
	const sockets = webSocketFixture();
	const { session } = fixture({ webSocketTransport: sockets.transport });
	const first = session.createTab().id;
	const second = session.createTab().id;
	await session.navigate(first, initialUrl);
	await session.navigate(second, "https://other.example/room");
	const firstOwner = webSockets(session, first);
	const secondOwner = webSockets(session, second);
	expect(firstOwner).not.toBe(secondOwner);
	await firstOwner.connect("/events");
	const survivor = await secondOwner.connect("/events");
	expect(
		sockets.transport.connect.mock.calls.map(([url, options]) => [
			url,
			options.origin,
		]),
	).toEqual([
		["wss://example.com/events", "https://example.com"],
		["wss://other.example/events", "https://other.example"],
	]);
	session.closeTab(first);
	expectClosed(sockets.connections[0]);
	expect(sockets.connections[1].abort).not.toHaveBeenCalled();
	expect(sockets.connections[1].close).not.toHaveBeenCalled();
	await expect(firstOwner.connect(socketUrl)).rejects.toMatchObject({
		code: "closed",
	});
	await survivor.send("other tab remains active");
	await secondOwner.connect("/another");
	expect(sockets.transport.connect).toHaveBeenCalledTimes(3);
});

it.each(["tab", "session", "document", "owner"] as const)(
	"closing the %s cancels pending and established document sockets",
	async (target) => {
		const pending = deferred<WebSocketConnection>();
		const started = deferred<Parameters<WebSocketTransport["connect"]>[1]>();
		const established = socketFixture();
		const sockets = webSocketFixture(async (url, options) => {
			if (url === socketUrl) return established;
			started.resolve(options);
			return pending.promise;
		});
		const { session } = fixture({ webSocketTransport: sockets.transport });
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		const owner = webSockets(session, tab);
		await owner.connect(socketUrl);
		const result = observeConnection(owner.connect("/pending"));
		const options = await started.promise;
		if (target === "tab") session.closeTab(tab);
		else if (target === "session") session.close();
		else if (target === "document") session.page(tab).document.close();
		else expect(owner.close()).toBeUndefined();
		expectClosed(established);
		expect(options.signal?.aborted).toBe(true);
		await expect(result).resolves.toMatchObject({
			state: "rejected",
			error: expect.any(AgentBrowserError),
		});
		await expect(owner.connect(socketUrl)).rejects.toMatchObject({
			code: "closed",
		});
		pending.reject(new AgentBrowserError("aborted", "Constructed late abort"));
		await Promise.resolve();
		expect(sockets.transport.connect).toHaveBeenCalledTimes(2);
	},
);

it("keeps response CSP isolated between simultaneously open tabs", async () => {
	const sockets = webSocketFixture();
	const blockedUrl = "https://example.com/blocked";
	const { session } = fixture(
		{ webSocketTransport: sockets.transport },
		async (input) =>
			response(input.url, {
				"content-security-policy": [
					input.url === blockedUrl ? "connect-src 'none'" : "connect-src wss:",
				],
			}),
	);
	const allowed = session.createTab().id;
	const blocked = session.createTab().id;
	await session.navigate(allowed, initialUrl);
	await session.navigate(blocked, blockedUrl);
	await expect(
		webSockets(session, blocked).connect(socketUrl),
	).rejects.toMatchObject({ code: "policy-denied" });
	await webSockets(session, allowed).connect(socketUrl);
	expect(sockets.transport.connect).toHaveBeenCalledTimes(1);
});

it("does not invoke the transport for an already aborted connection request", async () => {
	const sockets = webSocketFixture();
	const { session } = fixture({ webSocketTransport: sockets.transport });
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const controller = new AbortController();
	controller.abort(
		new AgentBrowserError("aborted", "Constructed caller abort"),
	);
	await expect(
		webSockets(session, tab).connect(socketUrl, { signal: controller.signal }),
	).rejects.toBeInstanceOf(AgentBrowserError);
	expect(sockets.transport.connect).not.toHaveBeenCalled();
});

it("isolates caller cancellation from other connections in the same document", async () => {
	const pending = deferred<WebSocketConnection>();
	const started = deferred<Parameters<WebSocketTransport["connect"]>[1]>();
	const established = socketFixture();
	const sockets = webSocketFixture(async (url, options) => {
		if (url === socketUrl) return established;
		started.resolve(options);
		return pending.promise;
	});
	const { session } = fixture({ webSocketTransport: sockets.transport });
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const owner = webSockets(session, tab);
	const survivor = await owner.connect(socketUrl);
	const controller = new AbortController();
	const result = observeConnection(
		owner.connect("/pending", { signal: controller.signal }),
	);
	const options = await started.promise;
	controller.abort(
		new AgentBrowserError("aborted", "Constructed caller abort"),
	);
	expect(options.signal?.aborted).toBe(true);
	await expect(result).resolves.toMatchObject({
		state: "rejected",
		error: expect.any(AgentBrowserError),
	});
	expect(established.abort).not.toHaveBeenCalled();
	expect(established.close).not.toHaveBeenCalled();
	await survivor.send("independent socket survives cancellation");
	pending.reject(
		new AgentBrowserError("aborted", "Constructed late rejection"),
	);
	await Promise.resolve();
});

it("closes established sockets in every tab when the session closes", async () => {
	const sockets = webSocketFixture();
	const { session } = fixture({ webSocketTransport: sockets.transport });
	const first = session.createTab().id;
	const second = session.createTab().id;
	await session.navigate(first, initialUrl);
	await session.navigate(second, "https://other.example/room");
	const firstOwner = webSockets(session, first);
	const secondOwner = webSockets(session, second);
	await firstOwner.connect("/events");
	await secondOwner.connect("/events");
	session.close();
	for (const connection of sockets.connections) expectClosed(connection);
	await expect(firstOwner.connect(socketUrl)).rejects.toMatchObject({
		code: "closed",
	});
	await expect(secondOwner.connect(socketUrl)).rejects.toMatchObject({
		code: "closed",
	});
	expect(sockets.transport.connect).toHaveBeenCalledTimes(2);
});
