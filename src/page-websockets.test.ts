import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentWebSockets } from "./document-websockets.js";
import type {
	PageBindingContext,
	PageBindingLifecycle,
} from "./page-bindings.js";
import { PageWebSockets, type PageWebSocketLimits } from "./page-websockets.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import type {
	NativeWebSocketMessage,
	WebSocketCloseResult,
	WebSocketConnection,
	WebSocketTransport,
} from "./websocket-transport.js";

interface SocketCapability {
	readonly url: string;
	readonly readyState: number;
	readonly protocol: string;
	readonly extensions: string;
	readonly bufferedAmount: number;
	binaryType: unknown;
	onopen: unknown;
	onmessage: unknown;
	onerror: unknown;
	onclose: unknown;
	send(value: unknown): void;
	close(code?: unknown, reason?: unknown): void;
	addEventListener(type: unknown, callback: unknown, options?: unknown): void;
	removeEventListener(
		type: unknown,
		callback: unknown,
		options?: unknown,
	): void;
}

interface Bootstrap {
	publish(...args: unknown[]): void;
	create(...args: unknown[]): SocketCapability;
}

interface SocketEvent {
	type: string;
	target: unknown;
	currentTarget: unknown;
	data?: unknown;
	origin?: string;
	lastEventId?: string;
	code?: number;
	reason?: string;
	wasClean?: boolean;
}

const documents: DocumentTree[] = [];
const controllers: PageWebSockets[] = [];

afterEach(async () => {
	for (const controller of controllers.splice(0)) controller.close();
	for (const document of documents.splice(0)) document.close();
	await flush();
	vi.useRealTimers();
});

function deferred<Value>() {
	let resolve!: (value: Value | PromiseLike<Value>) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, deny) => {
		resolve = accept;
		reject = deny;
	});
	return { promise, resolve, reject };
}

async function flush() {
	for (let index = 0; index < 96; index++) {
		await Promise.resolve();
		if (controllers.some((controller) => controller.metrics().pendingTasks))
			await vi.advanceTimersByTimeAsync(1);
	}
}

function memoryConnection(protocol = "", url = "wss://example.com/feed") {
	const completion = deferred<WebSocketCloseResult>();
	const messages: NativeWebSocketMessage[] = [];
	let waiter:
		| ReturnType<typeof deferred<NativeWebSocketMessage | undefined>>
		| undefined;
	let ended = false;
	const finish = (
		result: WebSocketCloseResult = { code: 1000, reason: "", wasClean: true },
	) => {
		ended = true;
		waiter?.resolve(undefined);
		waiter = undefined;
		completion.resolve(result);
	};
	const connection: WebSocketConnection = {
		url,
		protocol,
		closed: completion.promise,
		read: vi.fn(() => {
			if (messages.length) return Promise.resolve(messages.shift());
			if (ended) return Promise.resolve(undefined);
			if (waiter) throw Error("Concurrent memory reads");
			waiter = deferred<NativeWebSocketMessage | undefined>();
			return waiter.promise;
		}),
		send: vi.fn(() => Promise.resolve()),
		close: vi.fn((code = 1000, reason = "") => {
			finish({ code, reason, wasClean: true });
			return completion.promise;
		}),
		abort: vi.fn(() => finish({ code: 1006, reason: "", wasClean: false })),
	};
	return {
		connection,
		completion,
		finish,
		push(data: string | Uint8Array) {
			if (waiter) {
				waiter.resolve({ data });
				waiter = undefined;
			} else messages.push({ data });
		},
		failRead(error: unknown) {
			if (!waiter) throw Error("No memory read pending");
			waiter.reject(error);
			waiter = undefined;
		},
	};
}

function fixture(limits: Partial<PageWebSocketLimits> = {}) {
	vi.useFakeTimers();
	const tree = new DocumentTree("https://example.com/page");
	documents.push(tree);
	const pending: ReturnType<typeof deferred<WebSocketConnection>>[] = [];
	const transport: WebSocketTransport = {
		connect: vi.fn(() => {
			const admission = deferred<WebSocketConnection>();
			pending.push(admission);
			return admission.promise;
		}),
	};
	const owner = new DocumentWebSockets(tree, transport);
	const retained: number[] = [];
	const definitions: ScriptHostObjectDefinition[] = [];
	const context: PageBindingContext = {
		createHostObject(definition) {
			definitions.push(definition);
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, {
					get: property.get,
					set: property.set,
				});
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
		retainGuestArguments(operation, from) {
			retained.push(from);
			return operation;
		},
		releaseGuestReference: vi.fn(),
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: vi.fn(() => false),
		startCallback: vi.fn((callback, args, options) => {
			if (typeof callback !== "function") throw Error("Expected callback");
			try {
				return {
					synchronous: Promise.resolve(),
					result: Promise.resolve(callback.apply(options.thisValue, args)),
				};
			} catch (error) {
				return {
					synchronous: Promise.reject(error),
					result: Promise.reject(error),
				};
			}
		}),
		fail: vi.fn(),
		onConsoleCall: vi.fn(),
	};
	const controller = new PageWebSockets(
		tree,
		context,
		lifecycle,
		owner,
		limits,
	);
	controllers.push(controller);
	const bootstrap = controller.bootstrap() as Bootstrap;
	const guestConstructor = {};
	bootstrap.publish(guestConstructor);
	return {
		tree,
		owner,
		transport,
		pending,
		context,
		lifecycle,
		controller,
		bootstrap,
		constructor: guestConstructor,
		retained,
		definitions,
		create(url: unknown = "/feed", protocols?: unknown) {
			const receiver = {};
			const socket = bootstrap.create(url, protocols, receiver);
			return { socket, receiver };
		},
	};
}

async function establish(
	selected: ReturnType<typeof fixture>,
	connection = memoryConnection(),
	index = 0,
) {
	await flush();
	selected.pending[index].resolve(connection.connection);
	await flush();
	return connection;
}

describe("page WebSocket network tasks", () => {
	it("releases writes accepted before the terminal network task", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		native.finish();
		for (let index = 0; index < 96; index++) await Promise.resolve();
		expect(socket.readyState).toBe(1);
		expect(selected.controller.metrics().pendingTasks).toBe(1);
		socket.send("late");
		expect(selected.controller.metrics().pendingSends).toBe(1);
		expect(socket.bufferedAmount).toBe(4);
		await flush();
		expect(socket.readyState).toBe(3);
		expect(selected.controller.metrics().pendingSends).toBe(0);
		expect(selected.controller.metrics().retainedBytes).toBe(0);
		expect(socket.bufferedAmount).toBe(0);
		expect(native.connection.send).not.toHaveBeenCalled();
	});

	it("releases a suppressed open event reservation before terminal events", async () => {
		const selected = fixture({ maxEvents: 2 });
		const { socket } = selected.create();
		const seen: string[] = [];
		for (const type of ["open", "error", "close"])
			socket.addEventListener(type, () => seen.push(type));
		await flush();
		const native = memoryConnection();
		selected.pending[0].resolve(native.connection);
		for (let index = 0; index < 96; index++) await Promise.resolve();
		expect(selected.controller.metrics().pendingTasks).toBe(1);
		expect(selected.controller.metrics().events).toBe(1);
		socket.close();
		await flush();
		expect(seen).toEqual(["error", "close"]);
		expect(socket.readyState).toBe(3);
		expect(selected.controller.metrics().events).toBe(2);
		expect(selected.controller.metrics().closed).toBe(false);
		expect(selected.lifecycle.fail).not.toHaveBeenCalled();
	});

	it("does not publish open or close transitions during interpreter microtasks", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		await flush();
		const native = memoryConnection();
		selected.pending[0].resolve(native.connection);
		for (let index = 0; index < 96; index++) await Promise.resolve();
		expect(socket.readyState).toBe(0);
		expect(selected.controller.metrics().pendingTasks).toBe(1);
		await flush();
		expect(socket.readyState).toBe(1);
		socket.close(3001, "done");
		for (let index = 0; index < 96; index++) await Promise.resolve();
		expect(native.connection.close).toHaveBeenCalledExactlyOnceWith(
			3001,
			"done",
		);
		expect(socket.readyState).toBe(2);
		expect(selected.controller.metrics().pendingTasks).toBe(1);
		await flush();
		expect(socket.readyState).toBe(3);
		expect(selected.controller.metrics().pendingTasks).toBe(0);
	});

	it("queues message callbacks behind a network task while accounting their bytes", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		const callback = vi.fn();
		socket.onmessage = callback;
		native.push("data");
		for (let index = 0; index < 96; index++) await Promise.resolve();
		expect(callback).not.toHaveBeenCalled();
		expect(selected.controller.metrics().pendingTasks).toBe(1);
		expect(selected.controller.metrics().retainedBytes).toBeGreaterThan(0);
		await flush();
		expect(callback).toHaveBeenCalledOnce();
	});

	it.each(["document", "controller"])(
		"cancels queued network tasks on %s close",
		async (target) => {
			const selected = fixture();
			const { socket } = selected.create();
			const native = await establish(selected);
			const callback = vi.fn();
			socket.onmessage = callback;
			native.push("queued");
			for (let index = 0; index < 96; index++) await Promise.resolve();
			expect(selected.controller.metrics().pendingTasks).toBe(1);
			if (target === "document") selected.tree.close();
			else selected.controller.close();
			expect(selected.controller.metrics().pendingTasks).toBe(0);
			await vi.advanceTimersByTimeAsync(1);
			expect(callback).not.toHaveBeenCalled();
			expect(selected.controller.metrics().retainedBytes).toBe(0);
			expect(vi.getTimerCount()).toBe(0);
		},
	);
});

describe("page WebSocket bootstrap and admission", () => {
	it("registers retention during setup and publishes the original guest reference", () => {
		const selected = fixture();
		expect(selected.retained).toEqual([0, 2]);
		expect(selected.controller.constructorValue).toBe(selected.constructor);
		expect(() => selected.controller.bootstrap()).toThrow(/exactly once/);
		const second = {};
		expect(() => selected.bootstrap.publish(second)).toThrow(/exactly once/);
		expect(selected.context.releaseGuestReference).toHaveBeenCalledWith(second);
		expect(selected.controller.constructorValue).toBe(selected.constructor);
		selected.controller.close();
		selected.controller.close();
		expect(selected.context.releaseGuestReference).toHaveBeenCalledTimes(2);
	});

	it("does not release a currently owned constructor on duplicate publication", () => {
		const selected = fixture();
		expect(() => selected.bootstrap.publish(selected.constructor)).toThrow();
		expect(selected.context.releaseGuestReference).not.toHaveBeenCalled();
		selected.controller.close();
		expect(selected.context.releaseGuestReference).toHaveBeenCalledOnce();
	});

	it.each([
		{ protocols: undefined },
		{ protocols: "chat" },
		{ protocols: ["chat", "updates"] },
	])(
		"normalizes offered protocols $protocols through the owner",
		async ({ protocols }) => {
			const selected = fixture();
			const { socket } = selected.create("/feed", protocols);
			expect(socket.url).toBe("wss://example.com/feed");
			expect(socket.readyState).toBe(0);
			await flush();
			expect(selected.transport.connect).toHaveBeenCalledWith(
				"wss://example.com/feed",
				expect.objectContaining({
					origin: "https://example.com",
					protocols:
						protocols === undefined
							? []
							: typeof protocols === "string"
								? [protocols]
								: protocols,
				}),
			);
		},
	);

	it.each([
		[17, undefined],
		["wss://example.com/#bad", undefined],
		["ws://example.com/", undefined],
		["wss://user:secret@example.com/", undefined],
		["/feed", ["same", "same"]],
		["/feed", ["bad token"]],
		["/feed", [42]],
		["/feed", {}],
		["/feed", new Array(1)],
	])(
		"rejects constructor input %j / %j before transport effects",
		(url, protocols) => {
			const selected = fixture();
			const receiver = {};
			expect(() =>
				selected.bootstrap.create(url, protocols, receiver),
			).toThrow();
			expect(selected.transport.connect).not.toHaveBeenCalled();
			expect(selected.owner.metrics().attempts).toBe(0);
			expect(selected.controller.metrics().socketObjects).toBe(0);
			expect(selected.context.releaseGuestReference).toHaveBeenCalledWith(
				receiver,
			);
		},
	);

	it("does not invoke protocol accessors", () => {
		const selected = fixture();
		const protocols = ["chat"];
		const getter = vi.fn(() => "chat");
		Object.defineProperty(protocols, "0", { get: getter });
		expect(() => selected.create("/feed", protocols)).toThrow(/accessors/);
		expect(getter).not.toHaveBeenCalled();
	});

	it("does not allocate socket capabilities for invalid URLs", () => {
		const selected = fixture();
		const count = selected.definitions.length;
		expect(() => selected.create("wss://example.com/#invalid")).toThrow();
		expect(selected.definitions).toHaveLength(count);
	});

	it("cancels admission when host capability allocation fails", async () => {
		const selected = fixture();
		const receiver = {};
		vi.spyOn(selected.context, "createHostObject").mockImplementationOnce(
			() => {
				throw Error("capability allocation failed");
			},
		);
		expect(() =>
			selected.bootstrap.create("/feed", undefined, receiver),
		).toThrow(/allocation failed/);
		await flush();
		expect(selected.transport.connect).not.toHaveBeenCalled();
		expect(selected.context.releaseGuestReference).toHaveBeenCalledWith(
			receiver,
		);
		expect(selected.controller.metrics().socketObjects).toBe(0);
		expect(selected.owner.metrics().connecting).toBe(0);
	});

	it("enforces the socket-object lifetime cap synchronously", () => {
		const selected = fixture({ maxSockets: 1 });
		selected.create();
		expect(() => selected.create()).toThrow(/object limit/);
		expect(selected.owner.metrics().attempts).toBe(1);
	});

	it("rejects duplicate receivers without invalidating the owned reference", () => {
		const selected = fixture();
		const { receiver } = selected.create();
		expect(() =>
			selected.bootstrap.create("/feed", undefined, receiver),
		).toThrow(/already retained/);
		expect(selected.context.releaseGuestReference).not.toHaveBeenCalled();
	});

	it("releases all distinct extra retained arguments on invalid construction", () => {
		const selected = fixture();
		const receiver = {};
		const extra = {};
		expect(() =>
			selected.bootstrap.create("/feed", undefined, receiver, extra, extra),
		).toThrow();
		expect(selected.context.releaseGuestReference).toHaveBeenCalledTimes(2);
		expect(selected.transport.connect).not.toHaveBeenCalled();
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects invalid limits %s",
		(value) => {
			const selected = fixture();
			expect(
				() =>
					new PageWebSockets(
						selected.tree,
						selected.context,
						selected.lifecycle,
						selected.owner,
						{ maxSockets: value },
					),
			).toThrow(/limits/);
		},
	);
});

describe("page WebSocket capabilities and messages", () => {
	it("exposes read-only socket metadata and the selected protocol", async () => {
		const selected = fixture();
		const { socket, receiver } = selected.create("/feed", "chat");
		const invocations: { receiver: unknown; event: SocketEvent }[] = [];
		const opened = vi.fn(function (this: unknown, event: SocketEvent) {
			invocations.push({ receiver: this, event });
		});
		socket.onopen = opened;
		expect(socket.binaryType).toBe("blob");
		expect(socket.protocol).toBe("");
		expect(socket.extensions).toBe("");
		await establish(selected, memoryConnection("chat"));
		expect(opened).toHaveBeenCalledOnce();
		expect(invocations[0].receiver).toBe(receiver);
		expect(invocations[0].event.target).toBe(receiver);
		expect(invocations[0].event.currentTarget).toBe(receiver);
		expect(invocations[0].event.type).toBe("open");
		expect(socket.readyState).toBe(1);
		expect(socket.protocol).toBe("chat");
		for (const name of [
			"url",
			"readyState",
			"protocol",
			"extensions",
			"bufferedAmount",
		])
			expect(Reflect.set(socket, name, "changed")).toBe(false);
		expect("connection" in socket).toBe(false);
		expect("controller" in socket).toBe(false);
		expect(() => {
			socket.binaryType = "uint8array";
		}).toThrow(/binaryType/);
	});

	it.each(["blob", "arraybuffer"])(
		"receives text with binaryType %s",
		async (binaryType) => {
			const selected = fixture();
			const { socket, receiver } = selected.create();
			socket.binaryType = binaryType;
			const received: SocketEvent[] = [];
			socket.onmessage = (event: SocketEvent) => received.push(event);
			const native = await establish(selected);
			native.push("hello");
			await flush();
			expect(received).toHaveLength(1);
			expect(received[0]).toMatchObject({
				type: "message",
				data: "hello",
				origin: "wss://example.com",
				lastEventId: "",
				target: receiver,
				currentTarget: receiver,
			});
			expect(selected.controller.metrics().retainedBytes).toBe(10);
			selected.controller.close();
			expect(() => received[0].data).toThrow(/closed/);
			expect(selected.controller.metrics().retainedBytes).toBe(0);
		},
	);

	it("copies binary receive storage and preserves ArrayBuffer type", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		socket.binaryType = "arraybuffer";
		let received: ArrayBuffer | undefined;
		socket.onmessage = (event: SocketEvent) => {
			received = event.data as ArrayBuffer;
		};
		const native = await establish(selected);
		const source = new Uint8Array([0, 7, 8, 0]);
		native.push(source.subarray(1, 3));
		await flush();
		expect(received).toBeInstanceOf(ArrayBuffer);
		expect(received).not.toBe(source.buffer);
		source.fill(9);
		expect([...new Uint8Array(received as ArrayBuffer)]).toEqual([7, 8]);
	});

	it("fails unsupported Blob receive instead of exposing an incorrect data type", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const events: SocketEvent[] = [];
		socket.onmessage = (event: SocketEvent) => events.push(event);
		socket.onerror = (event: SocketEvent) => events.push(event);
		socket.onclose = (event: SocketEvent) => events.push(event);
		const native = await establish(selected);
		native.push(new Uint8Array([1]));
		await flush();
		expect(events.map((event) => event.type)).toEqual(["error", "close"]);
		expect(events[1]).toMatchObject({
			code: 1006,
			reason: "",
			wasClean: false,
		});
		expect(native.connection.abort).toHaveBeenCalledOnce();
		expect(socket.readyState).toBe(3);
	});

	it("drains queued messages before a native close already resolved", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const events: string[] = [];
		socket.onopen = () => events.push("open");
		socket.onmessage = (event: SocketEvent) => events.push(String(event.data));
		socket.onclose = () => events.push("close");
		const native = memoryConnection();
		native.push("first");
		native.push("second");
		native.finish();
		await establish(selected, native);
		expect(events).toEqual(["open", "first", "second", "close"]);
		expect(socket.readyState).toBe(3);
	});

	it("reports handshake errors without exposing transport details", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const events: SocketEvent[] = [];
		socket.onerror = (event: SocketEvent) => events.push(event);
		socket.onclose = (event: SocketEvent) => events.push(event);
		await flush();
		selected.pending[0].reject(Error("credential=secret; private address"));
		await flush();
		expect(events.map((event) => event.type)).toEqual(["error", "close"]);
		expect("message" in events[0]).toBe(false);
		expect("error" in events[0]).toBe(false);
		expect(events[1].reason).toBe("");
		expect(socket.readyState).toBe(3);
	});

	it("observes rejected native reads and emits one terminal event pair", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const error = vi.fn();
		const close = vi.fn();
		socket.onerror = error;
		socket.onclose = close;
		const native = await establish(selected);
		native.failRead(Error("private transport failure"));
		await flush();
		expect(error).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
		expect(native.connection.abort).toHaveBeenCalledOnce();
	});

	it("observes rejected completion even with an outstanding native read", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const close = vi.fn();
		socket.onclose = close;
		const native = await establish(selected);
		native.completion.reject(Error("completion failed"));
		await flush();
		expect(close).toHaveBeenCalledOnce();
		expect(socket.readyState).toBe(3);
		expect(selected.controller.metrics().pendingNativeClosures).toBe(0);
	});

	it("rejects an unoffered negotiated protocol", async () => {
		const selected = fixture();
		const { socket } = selected.create("/feed", "chat");
		const opened = vi.fn();
		socket.onopen = opened;
		const native = await establish(selected, memoryConnection("unexpected"));
		expect(opened).not.toHaveBeenCalled();
		expect(native.connection.abort).toHaveBeenCalledOnce();
		expect(socket.readyState).toBe(3);
	});
});

describe("page WebSocket writes and close", () => {
	it("rejects sends while connecting without scheduling a write", () => {
		const selected = fixture();
		const { socket } = selected.create();
		expect(() => socket.send("early")).toThrow(/connecting/);
		expect(selected.controller.metrics().sends).toBe(0);
	});

	it("reserves UTF-8 buffered bytes synchronously and preserves write ordering", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		const first = deferred<void>();
		vi.mocked(native.connection.send).mockImplementationOnce(
			() => first.promise,
		);
		socket.send("é");
		socket.send("next");
		expect(socket.bufferedAmount).toBe(6);
		expect(selected.controller.metrics().pendingSends).toBe(2);
		expect(native.connection.send).not.toHaveBeenCalled();
		await flush();
		expect(native.connection.send).toHaveBeenCalledTimes(1);
		expect(native.connection.send).toHaveBeenNthCalledWith(1, "é");
		first.resolve();
		await flush();
		expect(native.connection.send).toHaveBeenNthCalledWith(2, "next");
		expect(socket.bufferedAmount).toBe(0);
		expect(selected.controller.metrics().pendingSends).toBe(0);
	});

	it.each(["arraybuffer", "typedarray", "dataview"])(
		"copies %s sends before asynchronous writes",
		async (kind) => {
			const selected = fixture();
			const { socket } = selected.create();
			const native = await establish(selected);
			const source = new Uint8Array([0, 4, 5, 0]);
			const data =
				kind === "arraybuffer"
					? source.buffer
					: kind === "typedarray"
						? source.subarray(1, 3)
						: new DataView(source.buffer, 1, 2);
			socket.send(data);
			source.fill(9);
			await flush();
			const sent = vi.mocked(native.connection.send).mock.calls[0][0];
			expect(sent).toBeInstanceOf(Uint8Array);
			expect([...(sent as Uint8Array)]).toEqual(
				kind === "arraybuffer" ? [0, 4, 5, 0] : [4, 5],
			);
		},
	);

	it.each(
		[
			undefined,
			null,
			17,
			{},
			[1, 2],
			new SharedArrayBuffer(2),
			new Uint8Array(new SharedArrayBuffer(2)),
			new DataView(new SharedArrayBuffer(2)),
		].map((data) => ({ data })),
	)("rejects unsupported or shared send data $data", async ({ data }) => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		expect(() => socket.send(data)).toThrow(/unshared ArrayBuffer/);
		expect(native.connection.send).not.toHaveBeenCalled();
		expect(socket.bufferedAmount).toBe(0);
	});

	it("ignores overridden view accessors and never coerces arbitrary send objects", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		const view = new Uint8Array([2, 3]);
		const getter = vi.fn(() => new SharedArrayBuffer(2));
		Object.defineProperty(view, "buffer", { get: getter });
		socket.send(view);
		await flush();
		expect(getter).not.toHaveBeenCalled();
		expect(native.connection.send).toHaveBeenCalledWith(new Uint8Array([2, 3]));
		const convert = vi.fn(() => "text");
		expect(() => socket.send({ toString: convert })).toThrow();
		expect(convert).not.toHaveBeenCalled();
	});

	it("enforces pending-send and lifetime-send limits before queueing", async () => {
		const selected = fixture({ maxPendingSends: 1, maxSends: 1 });
		const { socket } = selected.create();
		await establish(selected);
		socket.send("one");
		expect(() => socket.send("two")).toThrow(/send limit/);
		await flush();
		expect(() => socket.send("three")).toThrow(/send limit/);
		expect(selected.controller.metrics().sends).toBe(1);
	});

	it("enforces copied byte bounds before write effects", async () => {
		const selected = fixture({ maxRetainedBytes: 3, maxMessageBytes: 3 });
		const { socket } = selected.create();
		const native = await establish(selected);
		expect(() => socket.send("éé")).toThrow(/UTF-8/);
		expect(() => socket.send("aa")).toThrow(/retained byte/);
		expect(() => socket.send(new Uint8Array(4))).toThrow(/message limit/);
		expect(native.connection.send).not.toHaveBeenCalled();
		expect(selected.controller.metrics().retainedBytes).toBe(0);
	});

	it("waits for accepted writes before sending close and discards later sends", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		const first = deferred<void>();
		vi.mocked(native.connection.send).mockImplementationOnce(
			() => first.promise,
		);
		socket.send("first");
		socket.send("second");
		socket.close(3001, "done");
		socket.send("discarded");
		expect(socket.readyState).toBe(2);
		await flush();
		expect(native.connection.close).not.toHaveBeenCalled();
		first.resolve();
		await flush();
		expect(native.connection.send).toHaveBeenCalledTimes(2);
		expect(native.connection.close).toHaveBeenCalledExactlyOnceWith(
			3001,
			"done",
		);
		expect(socket.readyState).toBe(3);
	});

	it.each([999, 1001, 1006, 2999, 5000, 3000.5, "1000", null])(
		"validates close code %j before state changes",
		async (code) => {
			const selected = fixture();
			const { socket } = selected.create();
			const native = await establish(selected);
			expect(() => socket.close(code)).toThrow(/close code/);
			expect(socket.readyState).toBe(1);
			expect(native.connection.close).not.toHaveBeenCalled();
		},
	);

	it.each([undefined, 1000, 3000, 4999])(
		"accepts browser close code %j",
		async (code) => {
			const selected = fixture();
			const { socket } = selected.create();
			const native = await establish(selected);
			socket.close(code);
			await flush();
			expect(native.connection.close).toHaveBeenCalledExactlyOnceWith(code, "");
			expect(socket.readyState).toBe(3);
		},
	);

	it("validates the UTF-8 close reason limit, including surrogate pairs", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		expect(() => socket.close(1000, "💬".repeat(31))).toThrow(/UTF-8/);
		expect(() => socket.close(1000, {})).toThrow(/string/);
		expect(socket.readyState).toBe(1);
		socket.close(1000, `${"💬".repeat(30)}abc`);
		await flush();
		expect(native.connection.close).toHaveBeenCalledOnce();
	});

	it("cancels a connecting socket without dispatching open on late results", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const opened = vi.fn();
		const closed = vi.fn();
		socket.onopen = opened;
		socket.onclose = closed;
		await flush();
		socket.close();
		expect(socket.readyState).toBe(2);
		await flush();
		expect(closed).toHaveBeenCalledOnce();
		const native = memoryConnection();
		selected.pending[0].resolve(native.connection);
		await flush();
		expect(native.connection.abort).toHaveBeenCalledOnce();
		expect(opened).not.toHaveBeenCalled();
		expect(closed).toHaveBeenCalledOnce();
	});

	it("observes write rejection, discards queued writes, and closes once", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		vi.mocked(native.connection.send).mockRejectedValueOnce(
			Error("private failure"),
		);
		const closed = vi.fn();
		socket.onclose = closed;
		socket.send("first");
		socket.send("second");
		await flush();
		expect(native.connection.send).toHaveBeenCalledOnce();
		expect(native.connection.abort).toHaveBeenCalledOnce();
		expect(closed).toHaveBeenCalledOnce();
		expect(socket.bufferedAmount).toBe(0);
		expect(selected.controller.metrics().pendingSends).toBe(0);
	});

	it("observes close-request rejection", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		vi.mocked(native.connection.close).mockRejectedValueOnce(
			Error("close failed"),
		);
		socket.close();
		await flush();
		expect(native.connection.abort).toHaveBeenCalledOnce();
		expect(socket.readyState).toBe(3);
		expect(selected.controller.metrics().pendingCloseRequests).toBe(0);
	});
});

describe("page WebSocket callback ownership", () => {
	it("preserves handler insertion order, replacement, deduplication, and once", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const order: string[] = [];
		const first = () => order.push("first");
		const removed = () => order.push("removed");
		socket.addEventListener("message", first);
		socket.onmessage = () => order.push("old");
		socket.addEventListener("message", () => order.push("once"), {
			once: true,
		});
		socket.addEventListener("message", first, { once: true });
		socket.addEventListener("message", removed, true);
		socket.removeEventListener("message", removed, false);
		socket.removeEventListener("message", removed, true);
		socket.onmessage = () => order.push("replacement");
		const native = await establish(selected);
		native.push("one");
		native.push("two");
		await flush();
		expect(order).toEqual([
			"first",
			"replacement",
			"once",
			"first",
			"replacement",
		]);
		expect(selected.controller.metrics().listeners).toBe(2);
	});

	it("skips removed listeners and defers listeners added during dispatch", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const order: string[] = [];
		const removed = () => order.push("removed");
		const added = () => order.push("added");
		socket.addEventListener("message", () => {
			order.push("first");
			socket.removeEventListener("message", removed);
			socket.addEventListener("message", added);
		});
		socket.addEventListener("message", removed);
		const native = await establish(selected);
		native.push("one");
		native.push("two");
		await flush();
		expect(order).toEqual(["first", "first", "added"]);
	});

	it.each(
		[
			{ passive: true },
			{ signal: new AbortController().signal },
			{ once: "yes" },
			{ capture: 1 },
			[],
			"capture",
		].map((options) => ({ options })),
	)("rejects unsupported listener options $options", ({ options }) => {
		const selected = fixture();
		const { socket } = selected.create();
		expect(() =>
			socket.addEventListener("message", () => undefined, options),
		).toThrow();
		expect(selected.controller.metrics().listeners).toBe(0);
	});

	it("rejects listener objects and accessors without invoking them", () => {
		const selected = fixture();
		const { socket } = selected.create();
		const getter = vi.fn(() => true);
		const options = Object.defineProperty({}, "once", { get: getter });
		expect(() =>
			socket.addEventListener("message", () => undefined, options),
		).toThrow();
		expect(() =>
			socket.addEventListener("message", { handleEvent: vi.fn() }),
		).toThrow(/functions/);
		expect(() => {
			socket.onmessage = {};
		}).toThrow(/functions/);
		expect(getter).not.toHaveBeenCalled();
	});

	it("shares listener bounds across handlers and sockets", () => {
		const selected = fixture({ maxListeners: 1 });
		const first = selected.create().socket;
		const second = selected.create().socket;
		first.onopen = () => undefined;
		expect(() => second.addEventListener("open", () => undefined)).toThrow(
			/listener limit/,
		);
		first.onopen = null;
		second.onopen = () => undefined;
		expect(selected.controller.metrics().listeners).toBe(1);
	});

	it("waits only for a callback's prefix, not its suspended result", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const tail = deferred<void>();
		const order: string[] = [];
		socket.addEventListener("message", () => {
			order.push("pending");
			return tail.promise;
		});
		socket.addEventListener("message", () => order.push("next"));
		const native = await establish(selected);
		native.push("hello");
		await flush();
		expect(order).toEqual(["pending", "next"]);
		expect(selected.controller.metrics().pendingCallbacks).toBe(1);
		tail.resolve();
		await flush();
		expect(selected.controller.metrics().pendingCallbacks).toBe(0);
	});

	it("waits for a synchronous prefix before subsequent events and close", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		const prefix = deferred<void>();
		const order: string[] = [];
		socket.onmessage = () => order.push("message");
		socket.onclose = () => order.push("close");
		vi.mocked(selected.lifecycle.startCallback).mockImplementationOnce(
			(callback, args, options) => {
				(callback as (...values: unknown[]) => unknown).apply(
					options.thisValue,
					[...args],
				);
				return { synchronous: prefix.promise, result: Promise.resolve() };
			},
		);
		native.push("one");
		await flush();
		native.finish();
		await flush();
		expect(order).toEqual(["message"]);
		expect(selected.controller.metrics().pendingCallbacks).toBe(1);
		prefix.resolve();
		await flush();
		expect(order).toEqual(["message", "close"]);
	});

	it("observes rejected callback phases and continues other listeners", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const next = vi.fn();
		socket.onmessage = () => {
			throw Error("guest error");
		};
		socket.addEventListener("message", next);
		const native = await establish(selected);
		native.push("one");
		await flush();
		expect(next).toHaveBeenCalledOnce();
		expect(selected.controller.metrics()).toMatchObject({
			callbackFailures: 1,
			pendingCallbacks: 0,
		});
	});

	it("bounds retained pending invocations instead of accumulating async tails", async () => {
		const selected = fixture({ maxPendingCallbacks: 1 });
		const { socket } = selected.create();
		const tail = deferred<void>();
		socket.onmessage = () => tail.promise;
		socket.addEventListener("message", vi.fn());
		const native = await establish(selected);
		native.push("one");
		await flush();
		expect(selected.controller.metrics()).toMatchObject({
			closed: true,
			pendingCallbacks: 1,
		});
		expect(selected.lifecycle.fail).toHaveBeenCalledOnce();
		tail.reject(Error("late callback failure"));
		await flush();
		expect(selected.controller.metrics().pendingCallbacks).toBe(0);
	});

	it("bounds total callbacks even when every invocation settles", async () => {
		const selected = fixture({ maxCallbacks: 1 });
		const { socket } = selected.create();
		socket.onmessage = vi.fn();
		const native = await establish(selected);
		native.push("one");
		native.push("two");
		await flush();
		expect(selected.controller.metrics()).toMatchObject({
			callbacks: 1,
			closed: true,
		});
		expect(selected.lifecycle.fail).toHaveBeenCalledOnce();
	});

	it("bounds event objects even without registered listeners", async () => {
		const selected = fixture({ maxEvents: 1 });
		selected.create();
		const native = await establish(selected);
		native.push("one");
		await flush();
		expect(selected.controller.metrics().closed).toBe(true);
		expect(selected.lifecycle.fail).toHaveBeenCalledOnce();
	});

	it("retains event data accounting while guest code could still hold events", async () => {
		const selected = fixture({ maxRetainedBytes: 4 });
		const { socket } = selected.create();
		const received: SocketEvent[] = [];
		socket.onmessage = (event: SocketEvent) => received.push(event);
		const native = await establish(selected);
		native.push("ab");
		await flush();
		expect(selected.controller.metrics().retainedBytes).toBe(4);
		expect(received[0].data).toBe("ab");
		native.push("c");
		await flush();
		expect(received).toHaveLength(1);
		expect(socket.readyState).toBe(3);
		expect(received[0].data).toBe("ab");
	});
});

describe("page WebSocket document shutdown", () => {
	it("suppresses pending events and releases each receiver and constructor once", async () => {
		const selected = fixture();
		const { socket, receiver } = selected.create();
		const message = vi.fn();
		const close = vi.fn();
		socket.onmessage = message;
		socket.onclose = close;
		const native = await establish(selected);
		native.push("pending");
		selected.tree.close();
		selected.controller.close();
		await flush();
		expect(message).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
		expect(selected.context.releaseGuestReference).toHaveBeenCalledTimes(2);
		expect(selected.context.releaseGuestReference).toHaveBeenCalledWith(
			receiver,
		);
		expect(selected.context.releaseGuestReference).toHaveBeenCalledWith(
			selected.constructor,
		);
		expect(() => socket.readyState).toThrow(/closed/);
		expect(() => selected.bootstrap.create("/feed", undefined, {})).toThrow(
			/closed/,
		);
	});

	it("does not close the shared document owner or a host-owned connection", async () => {
		const selected = fixture();
		const host = selected.owner.connect("/host");
		const { socket } = selected.create();
		const hostNative = memoryConnection("", "wss://example.com/host");
		const pageNative = memoryConnection();
		await flush();
		selected.pending[0].resolve(hostNative.connection);
		selected.pending[1].resolve(pageNative.connection);
		await host;
		await flush();
		expect(socket.readyState).toBe(1);
		selected.controller.close();
		await flush();
		expect(hostNative.connection.abort).not.toHaveBeenCalled();
		expect(pageNative.connection.abort).toHaveBeenCalledOnce();
		expect(selected.owner.metrics()).toMatchObject({ closed: false, open: 1 });
	});

	it("leaves late resource accounting to the owner and cleans late connections", async () => {
		const selected = fixture();
		selected.create();
		await flush();
		selected.controller.close();
		await flush();
		expect(selected.controller.metrics()).toMatchObject({
			closed: true,
			sharedOwner: { connecting: 1 },
		});
		const native = memoryConnection();
		selected.pending[0].resolve(native.connection);
		await flush();
		expect(native.connection.abort).toHaveBeenCalledOnce();
		expect(selected.controller.metrics().sharedOwner.connecting).toBe(0);
		expect(selected.lifecycle.startCallback).not.toHaveBeenCalled();
	});

	it("observes asynchronous abort failure without claiming native work is reaped", async () => {
		const selected = fixture();
		selected.create();
		const native = memoryConnection();
		native.connection.abort = vi.fn(async () => {
			throw Error("abort failed");
		});
		await establish(selected, native);
		selected.controller.close();
		await flush();
		expect(selected.controller.metrics()).toMatchObject({
			closed: true,
			pendingNativeClosures: 1,
			pendingReads: 1,
			sharedOwner: { closing: 1, cleanupFailures: 1 },
		});
		native.finish();
		await flush();
		expect(selected.controller.metrics().pendingNativeClosures).toBe(0);
		expect(selected.controller.metrics().pendingReads).toBe(0);
	});

	it("keeps in-flight write accounting until actual settlement after shutdown", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		const write = deferred<void>();
		vi.mocked(native.connection.send).mockImplementationOnce(
			() => write.promise,
		);
		socket.send("live");
		socket.send("queued");
		await flush();
		selected.controller.close();
		await flush();
		expect(selected.controller.metrics()).toMatchObject({
			pendingSends: 1,
			retainedBytes: 8,
		});
		write.reject(Error("late write failure"));
		await flush();
		expect(native.connection.send).toHaveBeenCalledOnce();
		expect(selected.controller.metrics()).toMatchObject({
			pendingSends: 0,
			retainedBytes: 0,
		});
	});

	it("interrupts a suspended callback prefix without pretending it settled", async () => {
		const selected = fixture();
		const { socket, receiver } = selected.create();
		const native = await establish(selected);
		const prefix = deferred<void>();
		const tail = deferred<void>();
		vi.mocked(selected.lifecycle.startCallback).mockReturnValueOnce({
			synchronous: prefix.promise,
			result: tail.promise,
		});
		socket.onmessage = vi.fn();
		const next = vi.fn();
		socket.addEventListener("message", next);
		native.push("one");
		await flush();
		selected.controller.close();
		await flush();
		expect(next).not.toHaveBeenCalled();
		expect(selected.controller.metrics().pendingCallbacks).toBe(1);
		expect(selected.context.releaseGuestReference).toHaveBeenCalledWith(
			receiver,
		);
		prefix.resolve();
		tail.reject(Error("late failure"));
		await flush();
		expect(selected.controller.metrics().pendingCallbacks).toBe(0);
	});

	it.each(["throw", "reject"])(
		"observes guest reference cleanup %s",
		async (kind) => {
			const selected = fixture();
			selected.create();
			vi.mocked(selected.context.releaseGuestReference).mockImplementation(
				() => {
					if (kind === "throw") throw Error("release failed");
					return Promise.reject(Error("release failed"));
				},
			);
			selected.controller.close();
			await flush();
			expect(selected.controller.metrics().cleanupFailures).toBe(2);
			expect(selected.context.releaseGuestReference).toHaveBeenCalledTimes(2);
		},
	);

	it("revokes capabilities when the page runtime closes", async () => {
		const selected = fixture();
		const { socket } = selected.create();
		const native = await establish(selected);
		vi.mocked(selected.lifecycle.isClosed).mockReturnValue(true);
		expect(() => socket.send("late")).toThrow(/closed/);
		await flush();
		expect(native.connection.abort).toHaveBeenCalledOnce();
		expect(selected.controller.metrics().closed).toBe(true);
	});
});
