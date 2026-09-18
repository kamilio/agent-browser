import { Buffer } from "node:buffer";
import { getEventListeners } from "node:events";
import { Duplex } from "node:stream";
import { setImmediate as nextTurn } from "node:timers/promises";
import {
	assert,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { ErrorCode } from "./errors.js";
import {
	NodeWebSocketConnection,
	type WebSocketConnectionLimits,
} from "./node-websocket-connection.js";

const defaultLimits: WebSocketConnectionLimits = {
	maxFrameBytes: 125,
	maxMessageBytes: 1024,
	maxFramesPerPush: 16,
	maxQueuedMessages: 4,
	maxQueuedBytes: 1024,
	maxPendingSendBytes: 4096,
	maxPendingWrites: 128,
	maxReceivedBytes: 8192,
	maxSentBytes: 8192,
	writeTimeoutMs: 50,
	closeTimeoutMs: 100,
};

class MemoryDuplex extends Duplex {
	readonly writes: Buffer[] = [];
	private pendingWrite?: (error?: Error | null) => void;

	constructor(
		private readonly automaticWrites = true,
		highWaterMark = 1,
	) {
		super({ allowHalfOpen: true, autoDestroy: true, highWaterMark });
	}

	override _read(): void {}

	override _write(
		chunk: Buffer,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		this.writes.push(Buffer.from(chunk));
		if (this.automaticWrites) callback();
		else this.pendingWrite = callback;
	}

	override _destroy(
		error: Error | null,
		callback: (error?: Error | null) => void,
	): void {
		this.pendingWrite = undefined;
		callback(error);
	}

	completeWrite(error?: Error): void {
		const callback = this.pendingWrite;
		assert(callback, "Expected an outstanding in-memory write callback");
		this.pendingWrite = undefined;
		callback(error);
	}

	get pendingWriteCount(): number {
		return this.pendingWrite ? 1 : 0;
	}
}

const fixtures: {
	connection: NodeWebSocketConnection;
	stream: MemoryDuplex;
}[] = [];

function createConnection(
	overrides: Partial<WebSocketConnectionLimits> = {},
	options: {
		automaticWrites?: boolean;
		highWaterMark?: number;
		alreadyAborted?: boolean;
	} = {},
) {
	const limits: WebSocketConnectionLimits = { ...defaultLimits, ...overrides };
	const stream = new MemoryDuplex(
		options.automaticWrites,
		options.highWaterMark,
	);
	const controller = new AbortController();
	if (options.alreadyAborted) controller.abort();
	const onClosed = vi.fn();
	const connection = new NodeWebSocketConnection(
		stream,
		"wss://memory.invalid/chat",
		"chat",
		limits,
		controller.signal,
		onClosed,
	);
	fixtures.push({ connection, stream });
	return { connection, stream, controller, onClosed, limits };
}

function track<Result>(promise: Promise<Result>) {
	const settled = vi.fn();
	const result: Promise<PromiseSettledResult<Result>> = promise.then(
		(value) => {
			settled();
			return { status: "fulfilled" as const, value };
		},
		(reason: unknown) => {
			settled();
			return { status: "rejected" as const, reason };
		},
	);
	return { result, settled };
}

async function expectFailure(
	result: Promise<PromiseSettledResult<unknown>>,
	code: ErrorCode,
): Promise<void> {
	expect(await result).toMatchObject({
		status: "rejected",
		reason: { name: "AgentBrowserError", code },
	});
}

function serverFrame(
	opcode: number,
	data: string | Uint8Array = "",
	fin = true,
): Buffer {
	const payload =
		typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
	assert(payload.length <= 65535);
	const headerBytes = payload.length <= 125 ? 2 : 4;
	const frame = Buffer.alloc(headerBytes + payload.length);
	frame[0] = (fin ? 0x80 : 0) | opcode;
	frame[1] = payload.length <= 125 ? payload.length : 126;
	if (headerBytes === 4) frame.writeUInt16BE(payload.length, 2);
	payload.copy(frame, headerBytes);
	return frame;
}

function closePayload(code?: number, reason = ""): Buffer {
	if (code === undefined) return Buffer.alloc(0);
	const reasonBytes = Buffer.from(reason);
	const payload = Buffer.alloc(2 + reasonBytes.length);
	payload.writeUInt16BE(code);
	reasonBytes.copy(payload, 2);
	return payload;
}

function clientFrames(stream: MemoryDuplex) {
	const wire = Buffer.concat(stream.writes);
	const frames: { fin: boolean; opcode: number; payload: Buffer }[] = [];
	let offset = 0;
	while (offset < wire.length) {
		assert(offset + 2 <= wire.length, "Incomplete client frame header");
		const first = wire[offset++];
		const second = wire[offset++];
		expect(first & 0x70).toBe(0);
		expect(second & 0x80, "Every client frame must be masked").toBe(0x80);
		let payloadBytes = second & 0x7f;
		if (payloadBytes === 126) {
			assert(offset + 2 <= wire.length);
			payloadBytes = wire.readUInt16BE(offset);
			expect(payloadBytes).toBeGreaterThan(125);
			offset += 2;
		} else if (payloadBytes === 127) {
			assert(offset + 8 <= wire.length);
			const length = wire.readBigUInt64BE(offset);
			assert(length <= BigInt(Number.MAX_SAFE_INTEGER));
			payloadBytes = Number(length);
			expect(payloadBytes).toBeGreaterThan(65535);
			offset += 8;
		}
		assert(offset + 4 + payloadBytes <= wire.length);
		const mask = wire.subarray(offset, offset + 4);
		offset += 4;
		const payload = Buffer.alloc(payloadBytes);
		for (let index = 0; index < payloadBytes; index++)
			payload[index] = wire[offset + index] ^ mask[index % 4];
		offset += payloadBytes;
		frames.push({ fin: Boolean(first & 0x80), opcode: first & 0x0f, payload });
	}
	return frames;
}

function expectReleased(fixture: ReturnType<typeof createConnection>): void {
	const { connection, stream, controller, onClosed } = fixture;
	expect(connection.state).toBe("closed");
	expect(connection.metrics()).toMatchObject({
		state: "closed",
		queuedMessages: 0,
		queuedBytes: 0,
		pendingSendBytes: 0,
		pendingWrites: 0,
	});
	expect(stream.destroyed).toBe(true);
	expect(stream.pendingWriteCount).toBe(0);
	for (const event of ["data", "error", "end", "close", "drain"])
		expect(stream.listenerCount(event), `${event} listener count`).toBe(0);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	expect(onClosed).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
	try {
		for (const { connection } of fixtures) connection.abort();
		await nextTurn();
	} finally {
		fixtures.length = 0;
		vi.useRealTimers();
		vi.restoreAllMocks();
	}
});

describe("native WebSocket in-memory receive ownership", () => {
	it("owns queued UTF-8 and binary messages independently of server buffers", async () => {
		const fixture = createConnection();
		const { connection, stream } = fixture;
		expect(connection.url).toBe("wss://memory.invalid/chat");
		expect(connection.protocol).toBe("chat");
		expect(connection.metrics()).toEqual({
			state: "open",
			queuedMessages: 0,
			queuedBytes: 0,
			pendingSendBytes: 0,
			pendingWrites: 0,
			receivedBytes: 0,
			sentBytes: 0,
		});
		const bytes = Buffer.concat([
			serverFrame(1, "é"),
			serverFrame(2, new Uint8Array([0, 255, 128])),
			serverFrame(2, new Uint8Array([0, 255, 128])),
		]);
		stream.push(bytes);
		await nextTurn();
		bytes.fill(0);
		const snapshot = connection.metrics();
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(snapshot).toMatchObject({ queuedMessages: 3, queuedBytes: 8 });
		expect(await connection.read()).toEqual({ data: "é" });
		const binary = await connection.read();
		assert(binary?.data instanceof Uint8Array);
		expect([...binary.data]).toEqual([0, 255, 128]);
		binary.data.fill(7);
		const otherBinary = await connection.read();
		assert(otherBinary?.data instanceof Uint8Array);
		expect([...otherBinary.data]).toEqual([0, 255, 128]);
		expect(connection.metrics()).toMatchObject({
			queuedMessages: 0,
			queuedBytes: 0,
			receivedBytes: bytes.length,
		});
		expect(snapshot.queuedMessages).toBe(3);
		expect(stream.writes).toEqual([]);
	});

	it("allows one pending reader without letting a rejected reader steal messages", async () => {
		const { connection, stream } = createConnection();
		const first = track(connection.read());
		await expectFailure(track(connection.read()).result, "invalid-input");
		stream.push(serverFrame(1, "first"));
		await nextTurn();
		expect(await first.result).toEqual({
			status: "fulfilled",
			value: { data: "first" },
		});
		const second = track(connection.read());
		const bytes = serverFrame(2, new Uint8Array([255, 0]));
		stream.push(bytes);
		await nextTurn();
		bytes.fill(0);
		const result = await second.result;
		assert(result.status === "fulfilled");
		assert(result.value?.data instanceof Uint8Array);
		expect([...result.value.data]).toEqual([255, 0]);
		expect(connection.metrics()).toMatchObject({
			queuedMessages: 0,
			queuedBytes: 0,
		});
	});

	it.each([
		{ name: "UTF-8 text", opcode: 1, data: Buffer.from("A💡B") },
		{ name: "binary", opcode: 2, data: Buffer.from([0, 255, 1, 128, 2, 3]) },
	])(
		"reassembles $name across stream chunks and continuation frames",
		async ({ opcode, data }) => {
			const { connection, stream } = createConnection();
			const read = track(connection.read());
			const first = serverFrame(opcode, data.subarray(0, 3), false);
			stream.push(first.subarray(0, 1));
			await nextTurn();
			expect(read.settled).not.toHaveBeenCalled();
			stream.push(first.subarray(1));
			await nextTurn();
			first.fill(0);
			expect(read.settled).not.toHaveBeenCalled();
			expect(connection.metrics().queuedBytes).toBe(0);
			stream.push(
				Buffer.concat([
					serverFrame(9, "mid"),
					serverFrame(0, data.subarray(3)),
					serverFrame(1, "next"),
				]),
			);
			await nextTurn();
			const result = await read.result;
			assert(result.status === "fulfilled");
			if (opcode === 1) expect(result.value).toEqual({ data: "A💡B" });
			else {
				assert(result.value?.data instanceof Uint8Array);
				expect([...result.value.data]).toEqual([...data]);
			}
			expect(await connection.read()).toEqual({ data: "next" });
			expect(clientFrames(stream)).toEqual([
				{ fin: true, opcode: 10, payload: Buffer.from("mid") },
			]);
		},
	);

	it("releases queue capacity after reads and bypasses queue storage for a waiting reader", async () => {
		const { connection, stream } = createConnection({
			maxQueuedMessages: 1,
			maxQueuedBytes: 2,
		});
		for (const text of ["é", "ab"]) {
			stream.push(serverFrame(1, text));
			await nextTurn();
			expect(connection.metrics()).toMatchObject({
				queuedMessages: 1,
				queuedBytes: 2,
			});
			expect(await connection.read()).toEqual({ data: text });
		}
		const read = track(connection.read());
		stream.push(serverFrame(1, "larger than queue storage"));
		await nextTurn();
		expect(await read.result).toEqual({
			status: "fulfilled",
			value: { data: "larger than queue storage" },
		});
		expect(connection.metrics()).toMatchObject({
			queuedMessages: 0,
			queuedBytes: 0,
		});
	});
});

describe("native WebSocket masked sends and write ownership", () => {
	it.each([1, 16384])(
		"waits for ordered write callbacks at highWaterMark %i without echoing writes",
		async (highWaterMark) => {
			const fixture = createConnection(
				{},
				{ automaticWrites: false, highWaterMark },
			);
			const { connection, stream, limits } = fixture;
			const read = track(connection.read());
			const first = track(connection.send("first"));
			const storage = new Uint8Array([9, 1, 255, 9]);
			const second = track(connection.send(storage.subarray(1, 3)));
			storage.fill(0);
			await nextTurn();
			expect(stream.writes).toHaveLength(1);
			expect(stream.writableNeedDrain).toBe(highWaterMark === 1);
			expect(connection.metrics()).toMatchObject({
				pendingSendBytes: 19,
				sentBytes: 0,
			});
			stream.emit("drain");
			await nextTurn();
			expect(first.settled).not.toHaveBeenCalled();
			expect(second.settled).not.toHaveBeenCalled();
			expect(read.settled).not.toHaveBeenCalled();
			expect(stream.writes).toHaveLength(1);
			stream.completeWrite();
			await nextTurn();
			expect(await first.result).toEqual({
				status: "fulfilled",
				value: undefined,
			});
			expect(second.settled).not.toHaveBeenCalled();
			expect(stream.writes).toHaveLength(2);
			expect(connection.metrics()).toMatchObject({
				pendingSendBytes: 8,
				sentBytes: 11,
			});
			stream.completeWrite();
			await nextTurn();
			expect(await second.result).toEqual({
				status: "fulfilled",
				value: undefined,
			});
			expect(clientFrames(stream)).toEqual([
				{ fin: true, opcode: 1, payload: Buffer.from("first") },
				{ fin: true, opcode: 2, payload: Buffer.from([1, 255]) },
			]);
			expect(connection.metrics()).toMatchObject({
				pendingSendBytes: 0,
				sentBytes: 19,
			});
			expect(read.settled).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
			await vi.advanceTimersByTimeAsync(limits.writeTimeoutMs * 2);
			expect(connection.state).toBe("open");
			connection.abort();
			await nextTurn();
			await expectFailure(read.result, "closed");
			await connection.closed;
			expectReleased(fixture);
		},
	);

	it.each([
		{ name: "text", data: `${"a".repeat(124)}€!`, opcode: 1 },
		{
			name: "binary",
			data: Uint8Array.from({ length: 260 }, (_value, index) => index % 251),
			opcode: 2,
		},
	])(
		"serializes fragmented $name before the next empty message",
		async ({ data, opcode }) => {
			const { connection, stream } = createConnection();
			const payload =
				typeof data === "string"
					? Buffer.from(data, "utf8")
					: Buffer.from(data);
			const first = track(connection.send(data));
			const second = track(connection.send(""));
			await nextTurn();
			expect(await first.result).toEqual({
				status: "fulfilled",
				value: undefined,
			});
			expect(await second.result).toEqual({
				status: "fulfilled",
				value: undefined,
			});
			const expected = [];
			for (let offset = 0; offset < payload.length; offset += 125) {
				expected.push({
					fin: offset + 125 >= payload.length,
					opcode: offset === 0 ? opcode : 0,
					payload: payload.subarray(offset, offset + 125),
				});
			}
			expected.push({ fin: true, opcode: 1, payload: Buffer.alloc(0) });
			expect(clientFrames(stream)).toEqual(expected);
			expect(connection.metrics()).toMatchObject({
				pendingSendBytes: 0,
				sentBytes: payload.length + expected.length * 6,
			});
		},
	);

	it("accounts for the extended masked header of a 126-byte frame", async () => {
		const { connection, stream } = createConnection({ maxFrameBytes: 126 });
		const payload = new Uint8Array(126).fill(42);
		await connection.send(payload);
		expect(clientFrames(stream)).toEqual([
			{ fin: true, opcode: 2, payload: Buffer.from(payload) },
		]);
		expect(connection.metrics()).toMatchObject({
			pendingSendBytes: 0,
			sentBytes: 134,
		});
	});

	it.each(["callback failure", "synchronous throw"])(
		"rejects active and queued sends after a write %s",
		async (mode) => {
			const fixture = createConnection({}, { automaticWrites: false });
			const { connection, stream } = fixture;
			if (mode === "synchronous throw") {
				vi.spyOn(stream, "write").mockImplementationOnce(() => {
					throw new Error("in-memory write failure");
				});
			}
			const read = track(connection.read());
			const first = track(connection.send("first"));
			const second = track(connection.send("second"));
			await nextTurn();
			if (mode === "callback failure")
				stream.completeWrite(new Error("in-memory write failure"));
			await nextTurn();
			await expectFailure(first.result, "network-error");
			await expectFailure(second.result, "network-error");
			await expectFailure(read.result, "network-error");
			expect(stream.writes).toHaveLength(mode === "callback failure" ? 1 : 0);
			expect(connection.metrics().sentBytes).toBe(0);
			expect(await connection.closed).toEqual({
				code: 1006,
				reason: "",
				wasClean: false,
			});
			expectReleased(fixture);
		},
	);
});

describe("native WebSocket control frames and close ownership", () => {
	it.each([0, 125])(
		"answers a %i-byte ping with a masked pong without delivering controls",
		async (length) => {
			const { connection, stream } = createConnection();
			const read = track(connection.read());
			const payload = Uint8Array.from({ length }, (_value, index) => index);
			stream.push(
				Buffer.concat([serverFrame(9, payload), serverFrame(10, "ignored")]),
			);
			await nextTurn();
			expect(read.settled).not.toHaveBeenCalled();
			expect(clientFrames(stream)).toEqual([
				{ fin: true, opcode: 10, payload: Buffer.from(payload) },
			]);
			expect(connection.metrics()).toMatchObject({
				queuedMessages: 0,
				queuedBytes: 0,
				pendingSendBytes: 0,
				sentBytes: length + 6,
			});
			stream.push(serverFrame(1, "application"));
			await nextTurn();
			expect(await read.result).toEqual({
				status: "fulfilled",
				value: { data: "application" },
			});
		},
	);

	it.each([
		{ name: "normal", code: 1000, reason: "done", observedCode: 1000 },
		{
			name: "application",
			code: 4001,
			reason: "à bientôt",
			observedCode: 4001,
		},
		{ name: "empty", code: undefined, reason: "", observedCode: 1005 },
	])(
		"echoes a remote $name close and resolves its observed result",
		async ({ code, reason, observedCode }) => {
			const fixture = createConnection();
			const { connection, stream } = fixture;
			const read = track(connection.read());
			const closed = track(connection.closed);
			const payload = closePayload(code, reason);
			stream.push(serverFrame(8, payload));
			await nextTurn();
			expect(connection.state).toBe("closing");
			expect(stream.writableEnded).toBe(true);
			expect(closed.settled).not.toHaveBeenCalled();
			expect(clientFrames(stream)).toEqual([{ fin: true, opcode: 8, payload }]);
			await expectFailure(track(connection.send("too late")).result, "closed");
			stream.push(null);
			await nextTurn();
			expect(await closed.result).toEqual({
				status: "fulfilled",
				value: { code: observedCode, reason, wasClean: true },
			});
			expect(Object.isFrozen(await connection.closed)).toBe(true);
			expect(await read.result).toEqual({
				status: "fulfilled",
				value: undefined,
			});
			expect(await connection.read()).toBeUndefined();
			expect(connection.close()).toBe(connection.closed);
			connection.abort();
			expectReleased(fixture);
		},
	);

	it("waits for the local close write and peer acknowledgement without sending a second close", async () => {
		const fixture = createConnection({}, { automaticWrites: false });
		const { connection, stream } = fixture;
		const read = track(connection.read());
		const close = connection.close(4000, "local é");
		expect(close).toBe(connection.closed);
		expect(connection.close(4001, "ignored")).toBe(close);
		const closed = track(close);
		await nextTurn();
		expect(connection.state).toBe("closing");
		expect(stream.writableEnded).toBe(false);
		expect(clientFrames(stream)).toEqual([
			{ fin: true, opcode: 8, payload: closePayload(4000, "local é") },
		]);
		await expectFailure(track(connection.send("late")).result, "closed");
		stream.push(serverFrame(8, closePayload(1000, "peer ack")));
		await nextTurn();
		expect(stream.writableEnded).toBe(false);
		expect(closed.settled).not.toHaveBeenCalled();
		expect(read.settled).not.toHaveBeenCalled();
		stream.completeWrite();
		await nextTurn();
		expect(stream.writableEnded).toBe(true);
		stream.push(null);
		await nextTurn();
		expect(await closed.result).toEqual({
			status: "fulfilled",
			value: { code: 1000, reason: "peer ack", wasClean: true },
		});
		expect(await read.result).toEqual({
			status: "fulfilled",
			value: undefined,
		});
		expect(clientFrames(stream)).toHaveLength(1);
		expectReleased(fixture);
	});

	it("lets complete inbound messages drain after a clean close", async () => {
		const fixture = createConnection();
		const { connection, stream } = fixture;
		stream.push(
			Buffer.concat([
				serverFrame(1, "retained"),
				serverFrame(2, new Uint8Array([1, 2])),
				serverFrame(8, closePayload(1000)),
			]),
		);
		stream.push(null);
		await nextTurn();
		expect(await connection.closed).toEqual({
			code: 1000,
			reason: "",
			wasClean: true,
		});
		expect(connection.metrics()).toMatchObject({
			queuedMessages: 2,
			queuedBytes: 10,
		});
		expect(await connection.read()).toEqual({ data: "retained" });
		const binary = await connection.read();
		assert(binary?.data instanceof Uint8Array);
		expect([...binary.data]).toEqual([1, 2]);
		expect(await connection.read()).toBeUndefined();
		expectReleased(fixture);
	});

	it("never writes queued data or remaining fragments after receiving peer close", async () => {
		const fixture = createConnection({}, { automaticWrites: false });
		const { connection, stream } = fixture;
		const read = track(connection.read());
		const first = track(connection.send(new Uint8Array(260).fill(7)));
		const second = track(connection.send("queued"));
		await nextTurn();
		expect(clientFrames(stream)).toEqual([
			{ fin: false, opcode: 2, payload: Buffer.alloc(125, 7) },
		]);
		stream.push(serverFrame(8, closePayload(1000)));
		await nextTurn();
		expect(stream.writes).toHaveLength(1);
		stream.completeWrite();
		await nextTurn();
		await expectFailure(first.result, "closed");
		await expectFailure(second.result, "closed");
		expect(clientFrames(stream)).toEqual([
			{ fin: false, opcode: 2, payload: Buffer.alloc(125, 7) },
			{ fin: true, opcode: 8, payload: closePayload(1000) },
		]);
		stream.completeWrite();
		await nextTurn();
		stream.push(null);
		await nextTurn();
		expect(await connection.closed).toEqual({
			code: 1000,
			reason: "",
			wasClean: true,
		});
		expect(await read.result).toEqual({
			status: "fulfilled",
			value: undefined,
		});
		expect(connection.metrics().sentBytes).toBe(139);
		expectReleased(fixture);
	});
});

describe("native WebSocket failure settlement", () => {
	const failures: {
		name: string;
		code: ErrorCode;
		fail: (fixture: ReturnType<typeof createConnection>) => void;
	}[] = [
		{
			name: "abrupt EOF",
			code: "network-error",
			fail: ({ stream }) => {
				stream.push(null);
			},
		},
		{
			name: "direct stream destruction",
			code: "network-error",
			fail: ({ stream }) => {
				stream.destroy();
			},
		},
		{
			name: "stream error",
			code: "network-error",
			fail: ({ stream }) => {
				stream.emit("error", new Error("in-memory transport failure"));
			},
		},
		{
			name: "invalid server frame",
			code: "network-error",
			fail: ({ stream }) => {
				stream.push(Buffer.from([0xc1, 0]));
			},
		},
		{
			name: "transport abort signal",
			code: "aborted",
			fail: ({ controller }) => {
				controller.abort();
			},
		},
	];

	describe.each(["queued", "waiting"] as const)(
		"with %s inbound work",
		(mode) => {
			it.each(failures)(
				"settles reads and sends and discards retained bytes on $name",
				async ({ code, fail }) => {
					const fixture = createConnection({}, { automaticWrites: false });
					const { connection, stream } = fixture;
					const read =
						mode === "waiting" ? track(connection.read()) : undefined;
					if (mode === "queued") {
						stream.push(serverFrame(1, "retained"));
						await nextTurn();
						expect(connection.metrics()).toMatchObject({
							queuedMessages: 1,
							queuedBytes: 8,
						});
					}
					const first = track(connection.send("active"));
					const second = track(connection.send("queued"));
					await nextTurn();
					fail(fixture);
					await nextTurn();
					await expectFailure(first.result, code);
					await expectFailure(second.result, code);
					if (read) await expectFailure(read.result, code);
					await expectFailure(track(connection.read()).result, code);
					await expectFailure(track(connection.send("late")).result, code);
					expect(await connection.closed).toEqual({
						code: 1006,
						reason: "",
						wasClean: false,
					});
					expect(stream.writes).toHaveLength(1);
					connection.abort();
					fixture.controller.abort();
					expectReleased(fixture);
				},
			);
		},
	);

	it("honors an already-aborted transport signal without owning residual resources", async () => {
		const fixture = createConnection({}, { alreadyAborted: true });
		const { connection, stream } = fixture;
		await nextTurn();
		await expectFailure(track(connection.read()).result, "aborted");
		await expectFailure(
			track(connection.send("never written")).result,
			"aborted",
		);
		expect(await connection.closed).toEqual({
			code: 1006,
			reason: "",
			wasClean: false,
		});
		expect(stream.writes).toEqual([]);
		expectReleased(fixture);
	});
});

describe("native WebSocket resource bounds", () => {
	const receiveBounds: {
		name: string;
		limits: Partial<WebSocketConnectionLimits>;
		chunks: Buffer[];
	}[] = [
		{
			name: "queued message count",
			limits: { maxQueuedMessages: 1 },
			chunks: [serverFrame(1, "a"), serverFrame(1, "b")],
		},
		{
			name: "queued UTF-8 bytes",
			limits: { maxQueuedBytes: 3 },
			chunks: [serverFrame(1, "é"), serverFrame(1, "é")],
		},
		{
			name: "received wire bytes",
			limits: { maxReceivedBytes: 6 },
			chunks: [serverFrame(1, "a"), serverFrame(1, "b"), serverFrame(2)],
		},
		{
			name: "frame payload bytes",
			limits: {},
			chunks: [serverFrame(1, "kept"), serverFrame(2, new Uint8Array(126))],
		},
		{
			name: "fragmented message bytes",
			limits: { maxMessageBytes: 125 },
			chunks: [
				serverFrame(1, "kept"),
				serverFrame(2, new Uint8Array(80), false),
				serverFrame(0, new Uint8Array(46)),
			],
		},
		{
			name: "per-push frame count",
			limits: { maxFramesPerPush: 1 },
			chunks: [
				serverFrame(1, "kept"),
				Buffer.concat([serverFrame(1, "a"), serverFrame(1, "b")]),
			],
		},
	];

	it.each(receiveBounds)(
		"aborts and clears retained queues when exceeding $name",
		async ({ limits, chunks }) => {
			const fixture = createConnection(limits);
			const { connection, stream } = fixture;
			for (const chunk of chunks) {
				stream.push(chunk);
				await nextTurn();
			}
			await expectFailure(track(connection.read()).result, "resource-limit");
			expect(await connection.closed).toEqual({
				code: 1006,
				reason: "",
				wasClean: false,
			});
			expect(connection.metrics().receivedBytes).toBeLessThanOrEqual(
				fixture.limits.maxReceivedBytes,
			);
			expectReleased(fixture);
		},
	);

	it.each([
		{ name: "message bytes", limits: { maxMessageBytes: 125 } },
		{ name: "fragment count", limits: { maxFramesPerPush: 1 } },
	])(
		"rejects excessive send $name before any write without poisoning the connection",
		async ({ limits }) => {
			const { connection, stream } = createConnection(limits);
			await expectFailure(
				track(connection.send(new Uint8Array(126))).result,
				"resource-limit",
			);
			expect(stream.writes).toEqual([]);
			expect(connection.metrics()).toMatchObject({
				state: "open",
				pendingSendBytes: 0,
				sentBytes: 0,
			});
			await connection.send("a");
			stream.push(serverFrame(1, "still readable"));
			await nextTurn();
			expect(await connection.read()).toEqual({ data: "still readable" });
		},
	);

	it("rejects oversized text before scanning its UTF-8 byte length", async () => {
		const { connection, stream } = createConnection();
		const oversized = "x".repeat(defaultLimits.maxMessageBytes + 1);
		const byteLength = vi.spyOn(Buffer, "byteLength");
		await expectFailure(
			track(connection.send(oversized)).result,
			"resource-limit",
		);
		expect(byteLength.mock.calls.some(([value]) => value === oversized)).toBe(
			false,
		);
		expect(stream.writes).toEqual([]);
		expect(connection.state).toBe("open");
		byteLength.mockRestore();
	});

	it("rejects oversized close text before scanning its UTF-8 byte length", async () => {
		const { connection, stream } = createConnection();
		const oversized = "x".repeat(124);
		const byteLength = vi.spyOn(Buffer, "byteLength");
		await expectFailure(
			track(connection.close(1000, oversized)).result,
			"invalid-input",
		);
		expect(byteLength.mock.calls.some(([value]) => value === oversized)).toBe(
			false,
		);
		expect(stream.writes).toEqual([]);
		expect(connection.state).toBe("open");
		byteLength.mockRestore();
	});

	it.each([999, 1001, 1005, 2999, 5000, 1.5, Number.NaN])(
		"rejects invalid caller close code %s without changing state",
		async (code) => {
			const { connection, stream } = createConnection();
			await expectFailure(
				track(connection.close(code)).result,
				"invalid-input",
			);
			expect(stream.writes).toEqual([]);
			expect(connection.state).toBe("open");
		},
	);

	it("bounds close reasons in UTF-8 bytes rather than UTF-16 units", async () => {
		const { connection, stream } = createConnection();
		await expectFailure(
			track(connection.close(3000, "é".repeat(62))).result,
			"invalid-input",
		);
		expect(stream.writes).toEqual([]);
		expect(connection.state).toBe("open");
	});

	it("bounds pending write tasks independently of their wire bytes", async () => {
		const fixture = createConnection(
			{ maxPendingWrites: 2 },
			{ automaticWrites: false },
		);
		const { connection, stream } = fixture;
		const first = track(connection.send(""));
		const second = track(connection.send(""));
		const rejected = track(connection.send(""));
		await nextTurn();
		expect(rejected.settled).toHaveBeenCalledTimes(1);
		await expectFailure(rejected.result, "resource-limit");
		expect(connection.metrics()).toMatchObject({
			state: "open",
			pendingWrites: 2,
			pendingSendBytes: 12,
		});
		await nextTurn();
		stream.completeWrite();
		await nextTurn();
		expect(await first.result).toMatchObject({ status: "fulfilled" });
		expect(connection.metrics().pendingWrites).toBe(1);
		const third = track(connection.send(""));
		expect(connection.metrics().pendingWrites).toBe(2);
		stream.completeWrite();
		await nextTurn();
		expect(await second.result).toMatchObject({ status: "fulfilled" });
		stream.completeWrite();
		await nextTurn();
		expect(await third.result).toMatchObject({ status: "fulfilled" });
		expect(connection.metrics()).toMatchObject({
			pendingWrites: 0,
			pendingSendBytes: 0,
		});
		connection.abort();
		await connection.closed;
		expectReleased(fixture);
	});

	it("bounds tiny pong tasks across pushes and settles all work on overflow", async () => {
		const fixture = createConnection(
			{ maxPendingWrites: 3, maxFramesPerPush: 2 },
			{ automaticWrites: false },
		);
		const { connection } = fixture;
		const pendingRead = track(connection.read());
		const pendingSend = track(connection.send(""));
		await nextTurn();
		connection.accept(serverFrame(9));
		connection.accept(serverFrame(9));
		expect(connection.metrics()).toMatchObject({
			state: "open",
			pendingWrites: 3,
			pendingSendBytes: 18,
		});
		connection.accept(serverFrame(9));
		expect(connection.state).toBe("closing");
		for (let batch = 0; batch < 20; batch++) connection.accept(serverFrame(9));
		expect(connection.metrics().pendingWrites).toBe(3);
		await connection.closed;
		await expectFailure(pendingRead.result, "resource-limit");
		await expectFailure(pendingSend.result, "resource-limit");
		expectReleased(fixture);
	});

	it("reserves pending masked wire bytes and releases them after successful callbacks", async () => {
		const { connection, stream } = createConnection(
			{ maxPendingSendBytes: 7 },
			{ automaticWrites: false },
		);
		const first = track(connection.send("a"));
		await expectFailure(track(connection.send("")).result, "resource-limit");
		await nextTurn();
		expect(connection.metrics().pendingSendBytes).toBe(7);
		stream.completeWrite();
		await nextTurn();
		expect(await first.result).toEqual({
			status: "fulfilled",
			value: undefined,
		});
		const second = track(connection.send("b"));
		await nextTurn();
		stream.completeWrite();
		await nextTurn();
		expect(await second.result).toEqual({
			status: "fulfilled",
			value: undefined,
		});
		expect(connection.metrics()).toMatchObject({
			state: "open",
			pendingSendBytes: 0,
			sentBytes: 14,
		});
	});

	it("counts both reserved and completed wire bytes against the lifetime send budget", async () => {
		const { connection, stream } = createConnection(
			{ maxSentBytes: 13 },
			{ automaticWrites: false },
		);
		const first = track(connection.send("a"));
		await expectFailure(track(connection.send("b")).result, "resource-limit");
		await nextTurn();
		expect(connection.metrics()).toMatchObject({
			pendingSendBytes: 7,
			sentBytes: 0,
		});
		stream.completeWrite();
		await nextTurn();
		expect(await first.result).toEqual({
			status: "fulfilled",
			value: undefined,
		});
		await expectFailure(track(connection.send("b")).result, "resource-limit");
		const empty = track(connection.send(""));
		await nextTurn();
		stream.completeWrite();
		await nextTurn();
		expect(await empty.result).toEqual({
			status: "fulfilled",
			value: undefined,
		});
		await expectFailure(track(connection.send("")).result, "resource-limit");
		expect(connection.metrics()).toMatchObject({
			state: "open",
			pendingSendBytes: 0,
			sentBytes: 13,
		});
		expect(clientFrames(stream).map((frame) => frame.payload)).toEqual([
			Buffer.from("a"),
			Buffer.alloc(0),
		]);
	});

	it.each([
		{ name: "pending send", limits: { maxPendingSendBytes: 6 } },
		{ name: "lifetime send", limits: { maxSentBytes: 6 } },
	])(
		"applies the $name budget to mandatory pong writes",
		async ({ limits }) => {
			const fixture = createConnection(limits);
			const { connection, stream } = fixture;
			const read = track(connection.read());
			stream.push(serverFrame(9, "a"));
			await nextTurn();
			await expectFailure(read.result, "resource-limit");
			expect(await connection.closed).toEqual({
				code: 1006,
				reason: "",
				wasClean: false,
			});
			expect(stream.writes).toEqual([]);
			expectReleased(fixture);
		},
	);
});

describe("native WebSocket controlled deadlines", () => {
	it("times out a stalled write and settles the active send, queued send, and pending read", async () => {
		const fixture = createConnection({}, { automaticWrites: false });
		const { connection, stream, limits } = fixture;
		const first = track(connection.send("active"));
		const second = track(connection.send("queued"));
		const read = track(connection.read());
		const closed = track(connection.closed);
		await nextTurn();
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(limits.writeTimeoutMs - 1);
		expect(first.settled).not.toHaveBeenCalled();
		expect(second.settled).not.toHaveBeenCalled();
		expect(read.settled).not.toHaveBeenCalled();
		expect(closed.settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await nextTurn();
		await expectFailure(first.result, "timeout");
		await expectFailure(second.result, "timeout");
		await expectFailure(read.result, "timeout");
		expect(await closed.result).toEqual({
			status: "fulfilled",
			value: { code: 1006, reason: "", wasClean: false },
		});
		expect(stream.writes).toHaveLength(1);
		expect(connection.metrics().sentBytes).toBe(0);
		expectReleased(fixture);
	});

	it("times out a local close without peer acknowledgement and rejects a waiting read", async () => {
		const fixture = createConnection();
		const { connection, limits } = fixture;
		const read = track(connection.read());
		const closed = track(connection.close());
		await nextTurn();
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(limits.closeTimeoutMs - 1);
		expect(connection.state).toBe("closing");
		expect(read.settled).not.toHaveBeenCalled();
		expect(closed.settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await nextTurn();
		await expectFailure(read.result, "timeout");
		expect(await closed.result).toEqual({
			status: "fulfilled",
			value: { code: 1006, reason: "", wasClean: false },
		});
		expectReleased(fixture);
	});

	it("discards previously queued inbound messages when a local close times out", async () => {
		const fixture = createConnection();
		const { connection, stream, limits } = fixture;
		stream.push(serverFrame(1, "retained"));
		await nextTurn();
		expect(connection.metrics().queuedMessages).toBe(1);
		connection.close();
		await nextTurn();
		await vi.advanceTimersByTimeAsync(limits.closeTimeoutMs);
		await nextTurn();
		await expectFailure(track(connection.read()).result, "timeout");
		expect(await connection.closed).toEqual({
			code: 1006,
			reason: "",
			wasClean: false,
		});
		expectReleased(fixture);
	});

	it("times out peer-close echo blocked behind a write without reporting a clean handshake", async () => {
		const fixture = createConnection(
			{ writeTimeoutMs: 200, closeTimeoutMs: 25 },
			{ automaticWrites: false },
		);
		const { connection, stream, limits } = fixture;
		const first = track(connection.send("active"));
		const second = track(connection.send("queued"));
		const read = track(connection.read());
		const closed = track(connection.closed);
		await nextTurn();
		stream.push(serverFrame(8, closePayload(1000, "peer")));
		await nextTurn();
		expect(vi.getTimerCount()).toBe(2);
		await vi.advanceTimersByTimeAsync(limits.closeTimeoutMs - 1);
		expect(closed.settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await nextTurn();
		await expectFailure(first.result, "timeout");
		await expectFailure(second.result, "timeout");
		await expectFailure(read.result, "timeout");
		expect(await closed.result).toEqual({
			status: "fulfilled",
			value: { code: 1000, reason: "peer", wasClean: false },
		});
		expect(clientFrames(stream).map((frame) => frame.opcode)).toEqual([1]);
		expectReleased(fixture);
	});
});
