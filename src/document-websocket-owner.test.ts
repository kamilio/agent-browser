import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	bindDocumentWebSockets,
	existingDocumentWebSockets,
} from "./document-websocket-owner.js";
import type {
	DocumentWebSocketConnectOptions,
	DocumentWebSocketOptions,
} from "./document-websockets.js";
import type { NetworkResponse, NetworkTransport } from "./network.js";
import { BrowserSession, type DocumentLoader } from "./session.js";
import type {
	WebSocketConnection,
	WebSocketTransport,
} from "./websocket-transport.js";

const documents: DocumentTree[] = [];
const sessions: BrowserSession[] = [];

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function document(url = "https://example.com/room") {
	const tree = new DocumentTree(url);
	documents.push(tree);
	return tree;
}

function memorySockets() {
	const connections: WebSocketConnection[] = [];
	const connect = vi.fn<WebSocketTransport["connect"]>(async (url) => {
		let finish!: (result: Awaited<WebSocketConnection["closed"]>) => void;
		const closed: WebSocketConnection["closed"] = new Promise((resolve) => {
			finish = resolve;
		});
		const connection = {
			url,
			protocol: "",
			closed,
			read: vi.fn(async () => undefined),
			send: vi.fn(async (_data: string | Uint8Array) => {}),
			close: vi.fn(async (code = 1000, reason = "") => {
				const result = { code, reason, wasClean: true };
				finish(result);
				return result;
			}),
			abort: vi.fn(() => {
				finish({ code: 1006, reason: "", wasClean: false });
			}),
		} satisfies WebSocketConnection;
		connections.push(connection);
		return connection;
	});
	return { transport: { connect } satisfies WebSocketTransport, connections };
}

function sessionFixture(
	loadDocument: DocumentLoader,
	webSocketTransport: WebSocketTransport,
	headers: NetworkResponse["headers"] = {},
) {
	const request = vi.fn<NetworkTransport["request"]>(async (input) => ({
		url: input.url,
		status: 200,
		headers,
		body: new Uint8Array(),
		redirects: [],
		encodedBytes: 0,
		elapsedMs: 0,
	}));
	let closed = false;
	const transport: NetworkTransport = {
		request,
		metrics: () => ({
			requests: request.mock.calls.length,
			active: 0,
			closed,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
		}),
		close() {
			closed = true;
		},
	};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument,
		webSocketTransport,
	});
	sessions.push(session);
	return { session, tab: session.createTab().id, request };
}

it("looks up owners without creating one or consulting a transport", () => {
	const tree = document();
	const sockets = memorySockets();
	expect(existingDocumentWebSockets(tree)).toBeUndefined();
	expect(existingDocumentWebSockets(tree)).toBeUndefined();
	const owner = bindDocumentWebSockets(tree, sockets.transport);
	expect(existingDocumentWebSockets(tree)).toBe(owner);
	expect(bindDocumentWebSockets(tree, sockets.transport, {})).toBe(owner);
	expect(sockets.transport.connect).not.toHaveBeenCalled();
});

it("reuses equivalent detached configuration regardless of limit key order", () => {
	const tree = document();
	const sockets = memorySockets();
	const owner = bindDocumentWebSockets(tree, sockets.transport, {
		headerValues: ["connect-src wss://example.com"],
		limits: { maxConcurrent: 2, maxConnections: 5 },
	});
	expect(
		bindDocumentWebSockets(tree, sockets.transport, {
			headerValues: ["connect-src wss://example.com"],
			limits: { maxConnections: 5, maxConcurrent: 2 },
		}),
	).toBe(owner);
});

it("rejects transport replacement without disturbing the existing owner", async () => {
	const tree = document();
	const first = memorySockets();
	const replacement = memorySockets();
	const owner = bindDocumentWebSockets(tree, first.transport);
	expect(() => bindDocumentWebSockets(tree, replacement.transport)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(existingDocumentWebSockets(tree)).toBe(owner);
	await owner.connect("/events");
	expect(first.transport.connect).toHaveBeenCalledOnce();
	expect(replacement.transport.connect).not.toHaveBeenCalled();
});

it.each<DocumentWebSocketOptions>([
	{ headerValues: ["connect-src 'none'"] },
	{ headerValues: ["connect-src wss:", "default-src 'none'"] },
	{ limits: { maxConcurrent: 2 } },
	{ limits: { maxConnections: 3 } },
	{ limits: { handshakeTimeoutMs: 20 } },
])("rejects configuration replacement %j", (replacement) => {
	const tree = document();
	const sockets = memorySockets();
	const owner = bindDocumentWebSockets(tree, sockets.transport);
	expect(() =>
		bindDocumentWebSockets(tree, sockets.transport, replacement),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(existingDocumentWebSockets(tree)).toBe(owner);
	expect(sockets.transport.connect).not.toHaveBeenCalled();
});

it("snapshots headers and limits rather than retaining caller-owned objects", async () => {
	const tree = document();
	const sockets = memorySockets();
	const headerValues = ["connect-src wss://example.com"];
	const limits = { maxConcurrent: 1, maxConnections: 2 };
	const owner = bindDocumentWebSockets(tree, sockets.transport, {
		headerValues,
		limits,
	});
	headerValues[0] = "connect-src wss:";
	limits.maxConcurrent = 8;
	limits.maxConnections = 8;
	expect(
		bindDocumentWebSockets(tree, sockets.transport, {
			headerValues: ["connect-src wss://example.com"],
			limits: { maxConcurrent: 1, maxConnections: 2 },
		}),
	).toBe(owner);
	expect(() => owner.start("wss://elsewhere.example/events")).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	const admitted = owner.start("/events");
	expect(() => owner.start("/second")).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	await admitted.connection;
	expect(sockets.transport.connect).toHaveBeenCalledOnce();
});

it.each([
	null,
	false,
	[],
	{ headerValues: "connect-src 'none'" },
	{ limits: [] },
	{ limits: { maxConcurrent: 0 } },
])("does not register an owner after invalid configuration %j", (options) => {
	const tree = document();
	const sockets = memorySockets();
	expect(() =>
		bindDocumentWebSockets(
			tree,
			sockets.transport,
			options as unknown as DocumentWebSocketOptions,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(existingDocumentWebSockets(tree)).toBeUndefined();
	expect(sockets.transport.connect).not.toHaveBeenCalled();
	expect(bindDocumentWebSockets(tree, sockets.transport)).toBeDefined();
});

it("deregisters closed documents and does not register them again", async () => {
	const tree = document();
	const sockets = memorySockets();
	const owner = bindDocumentWebSockets(tree, sockets.transport);
	const connection = await owner.connect("/events");
	tree.close();
	expect(existingDocumentWebSockets(tree)).toBeUndefined();
	expect(connection.abort).toHaveBeenCalledOnce();
	expect(() => owner.start("/events")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => bindDocumentWebSockets(tree, sockets.transport)).toThrow();
	expect(existingDocumentWebSockets(tree)).toBeUndefined();
});

it.each([
	[undefined, "invalid-input"],
	[{}, "invalid-input"],
	["wss://example.com/events#fragment", "invalid-input"],
	["ws://example.com/events", "policy-denied"],
] as const)(
	"rejects invalid start input %j synchronously before IO",
	(input, code) => {
		const tree = document();
		const sockets = memorySockets();
		const owner = bindDocumentWebSockets(tree, sockets.transport);
		expect(() => owner.start(input)).toThrow(expect.objectContaining({ code }));
		expect(sockets.transport.connect).not.toHaveBeenCalled();
	},
);

it.each([
	null,
	{ protocols: ["duplicate", "duplicate"] },
	{ protocols: ["bad protocol"] },
	{ signal: {} },
])("rejects invalid start options %j synchronously before IO", (options) => {
	const sockets = memorySockets();
	const owner = bindDocumentWebSockets(document(), sockets.transport);
	expect(() =>
		owner.start(
			"/events",
			options as unknown as DocumentWebSocketConnectOptions,
		),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(sockets.transport.connect).not.toHaveBeenCalled();
});

it("returns a frozen normalized admission receipt before dispatch", async () => {
	const sockets = memorySockets();
	const owner = bindDocumentWebSockets(document(), sockets.transport);
	const protocols = ["notes.v1"];
	const admitted = owner.start("../events?room=fixture", { protocols });
	expect(Object.isFrozen(admitted)).toBe(true);
	expect(admitted.url).toBe("wss://example.com/events?room=fixture");
	expect(admitted.connection).toBeInstanceOf(Promise);
	expect(sockets.transport.connect).not.toHaveBeenCalled();
	protocols.push("notes.v2");
	expect(await admitted.connection).toBe(sockets.connections[0]);
	expect(sockets.transport.connect).toHaveBeenCalledExactlyOnceWith(
		admitted.url,
		expect.objectContaining({
			origin: "https://example.com",
			protocols: ["notes.v1"],
			signal: expect.any(AbortSignal),
		}),
	);
});

it("rejects an already aborted start synchronously without IO", () => {
	const sockets = memorySockets();
	const owner = bindDocumentWebSockets(document(), sockets.transport);
	const controller = new AbortController();
	controller.abort();
	expect(() => owner.start("/events", { signal: controller.signal })).toThrow(
		expect.objectContaining({ code: "aborted" }),
	);
	expect(sockets.transport.connect).not.toHaveBeenCalled();
});

it.each(["caller", "document"] as const)(
	"cancels an admitted request before microtask dispatch through %s shutdown",
	async (reason) => {
		const tree = document();
		const sockets = memorySockets();
		const owner = bindDocumentWebSockets(tree, sockets.transport);
		const controller = new AbortController();
		const admitted = owner.start("/events", { signal: controller.signal });
		const rejected = expect(admitted.connection).rejects.toMatchObject({
			code: reason === "caller" ? "aborted" : "closed",
		});
		if (reason === "caller") controller.abort();
		else tree.close();
		await rejected;
		expect(sockets.transport.connect).not.toHaveBeenCalled();
	},
);

it("keeps connect rejection asynchronous when start admission would throw", async () => {
	const sockets = memorySockets();
	const owner = bindDocumentWebSockets(document(), sockets.transport);
	let pending: Promise<WebSocketConnection> | undefined;
	expect(() => {
		pending = owner.connect(null);
	}).not.toThrow();
	await expect(pending).rejects.toMatchObject({ code: "invalid-input" });
	expect(sockets.transport.connect).not.toHaveBeenCalled();
});

it("binds the session owner before loader script work and reuses it at commit", async () => {
	const sockets = memorySockets();
	let earlyOwner: ReturnType<typeof existingDocumentWebSockets>;
	const loader: DocumentLoader = async (response, context) => {
		const tree = document(response.url);
		expect(existingDocumentWebSockets(tree)).toBeUndefined();
		expect(context.initializeDocument).toBeTypeOf("function");
		context.initializeDocument?.(tree);
		earlyOwner = existingDocumentWebSockets(tree);
		expect(earlyOwner).toBeDefined();
		expect(() => earlyOwner?.start("wss://blocked.example/events")).toThrow(
			expect.objectContaining({ code: "policy-denied" }),
		);
		await earlyOwner?.connect("/events");
		context.initializeDocument?.(tree);
		expect(existingDocumentWebSockets(tree)).toBe(earlyOwner);
		return tree;
	};
	const { session, tab, request } = sessionFixture(loader, sockets.transport, {
		"content-security-policy": ["connect-src wss://example.com"],
	});
	await session.navigate(tab, "https://example.com/room");
	expect(session.page(tab).webSockets).toBe(earlyOwner);
	expect(sockets.transport.connect).toHaveBeenCalledOnce();
	expect(request).toHaveBeenCalledOnce();
	expect(sockets.connections[0].abort).not.toHaveBeenCalled();
});

it("cleans an initialized failed candidate without retiring the committed owner", async () => {
	const sockets = memorySockets();
	let failedTree: DocumentTree | undefined;
	let failedOwner: ReturnType<typeof existingDocumentWebSockets>;
	const loader: DocumentLoader = async (response, context) => {
		const tree = document(response.url);
		context.initializeDocument?.(tree);
		const owner = existingDocumentWebSockets(tree);
		expect(owner).toBeDefined();
		await owner?.connect("/events");
		if (response.url.endsWith("/failed")) {
			failedTree = tree;
			failedOwner = owner;
			throw new Error("Constructed loader failure after script connection");
		}
		return tree;
	};
	const { session, tab } = sessionFixture(loader, sockets.transport);
	await session.navigate(tab, "https://example.com/room");
	const committed = session.page(tab);
	await expect(
		session.navigate(tab, "https://example.com/failed"),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(session.page(tab)).toBe(committed);
	expect(existingDocumentWebSockets(committed.document)).toBe(
		committed.webSockets,
	);
	expect(failedTree).toBeDefined();
	if (!failedTree || !failedOwner) throw new Error("Missing failed candidate");
	expect(existingDocumentWebSockets(failedTree)).toBeUndefined();
	const closedOwner = failedOwner;
	expect(() => closedOwner.start("/events")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(sockets.connections).toHaveLength(2);
	expect(sockets.connections[0].abort).not.toHaveBeenCalled();
	expect(sockets.connections[1].abort).toHaveBeenCalledOnce();
});
