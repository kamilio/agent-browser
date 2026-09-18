import { Buffer } from "node:buffer";
import { assert, describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import type { NativeWebSocketOpcode } from "./websocket-frames.js";
import {
	type WebSocketIncomingEvent,
	WebSocketReceiver,
	type WebSocketReceiverLimits,
} from "./websocket-receiver.js";

function receiver(
	limits: Partial<WebSocketReceiverLimits> = {},
): WebSocketReceiver {
	return new WebSocketReceiver({
		maxFrameBytes: 65536,
		maxMessageBytes: 131072,
		maxFramesPerPush: 32,
		...limits,
	});
}

function bytes(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

function join(...chunks: Uint8Array[]): Uint8Array {
	const output = new Uint8Array(
		chunks.reduce((length, chunk) => length + chunk.length, 0),
	);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}
	return output;
}

function serverFrame(
	opcode: NativeWebSocketOpcode,
	payload: Uint8Array = new Uint8Array(),
	fin = true,
): Uint8Array {
	const headerLength =
		payload.length > 65535 ? 10 : payload.length > 125 ? 4 : 2;
	const header = new Uint8Array(headerLength);
	header[0] = (fin ? 0x80 : 0) | opcode;
	header[1] =
		headerLength === 10 ? 127 : headerLength === 4 ? 126 : payload.length;
	if (headerLength === 4) {
		header[2] = payload.length >>> 8;
		header[3] = payload.length & 0xff;
	} else if (headerLength === 10) {
		let remaining = BigInt(payload.length);
		for (let offset = 9; offset >= 2; offset--) {
			header[offset] = Number(remaining & 0xffn);
			remaining >>= 8n;
		}
	}
	return join(header, payload);
}

function closeFrame(
	code: number,
	reason: Uint8Array = new Uint8Array(),
): Uint8Array {
	return serverFrame(
		8,
		join(new Uint8Array([code >>> 8, code & 0xff]), reason),
	);
}

function expectCode(action: () => unknown, code: string): void {
	let thrown: unknown;
	try {
		action();
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toBeInstanceOf(AgentBrowserError);
	expect(thrown).toMatchObject({ code });
}

function expectReleased(target: WebSocketReceiver): void {
	expect(target.metrics()).toMatchObject({
		partialFrameAllocatedBytes: 0,
		assembledMessageBytes: 0,
		assemblyCapacityBytes: 0,
	});
	expect(target).toMatchObject({
		headerBytes: 0,
		frame: undefined,
		payloadBytes: 0,
		messageOpcode: undefined,
		messageBytes: 0,
		assembly: undefined,
	});
}

function expectTerminal(target: WebSocketReceiver): void {
	expectReleased(target);
	expect(target.metrics().state).toBe("closed");
	expectCode(() => target.push(new Uint8Array()), "closed");
	expectCode(() => target.push(serverFrame(1, bytes("later"))), "closed");
}

describe("WebSocket receiver deframing and ownership", () => {
	it.each([0, 1, 125, 126, 65535, 65536])(
		"receives a %s-byte binary frame",
		(length) => {
			const payload = Uint8Array.from(
				{ length },
				(_value, index) => index % 251,
			);
			const target = receiver();
			expect(target.push(serverFrame(2, payload))).toEqual([
				{ type: "message", data: payload },
			]);
			expectReleased(target);
		},
	);

	it("accepts every 64-bit header split and a partial payload tail", () => {
		const payload = new Uint8Array(65536).fill(42);
		const wire = serverFrame(2, payload);
		for (const split of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, wire.length - 1]) {
			const target = receiver();
			expect(target.push(wire.subarray(0, split))).toEqual([]);
			expect(target.push(wire.subarray(split))).toEqual([
				{ type: "message", data: payload },
			]);
		}
	});

	it("copies reused byte-at-a-time input through an extended frame", () => {
		const target = receiver();
		const payload = Uint8Array.from(
			{ length: 4096 },
			(_value, index) => index % 251,
		);
		const wire = serverFrame(2, payload);
		const scratch = new Uint8Array(1);
		for (let offset = 0; offset < wire.length; offset++) {
			scratch[0] = wire[offset];
			const events = target.push(scratch);
			scratch[0] = 255;
			expect(events).toEqual(
				offset === wire.length - 1 ? [{ type: "message", data: payload }] : [],
			);
		}
		expectReleased(target);
	});

	it("accepts every split boundary of coalesced data and control frames", () => {
		const payload = bytes("A€😀Z");
		const binary = new Uint8Array(126).fill(123);
		const wire = join(
			serverFrame(1, payload.subarray(0, 2), false),
			serverFrame(9, bytes("ping")),
			serverFrame(0, payload.subarray(2, 6), false),
			serverFrame(10),
			serverFrame(0, payload.subarray(6)),
			serverFrame(2, binary),
			closeFrame(1000, bytes("done")),
		);
		const expected = [
			{ type: "ping", payload: bytes("ping") },
			{ type: "pong", payload: new Uint8Array() },
			{ type: "message", data: "A€😀Z" },
			{ type: "message", data: binary },
			{ type: "close", code: 1000, reason: "done" },
		];
		for (let split = 0; split <= wire.length; split++) {
			const target = receiver();
			expect([
				...target.push(wire.subarray(0, split)),
				...target.push(wire.subarray(split)),
			]).toEqual(expected);
			expectReleased(target);
		}
	});

	it("receives text codepoints split over byte-sized fragments and pushes", () => {
		const payload = bytes("€😀\uFEFF");
		const wire = join(
			...Array.from(payload, (value, index) =>
				serverFrame(
					index === 0 ? 1 : 0,
					new Uint8Array([value]),
					index === payload.length - 1,
				),
			),
		);
		const target = receiver();
		const events: WebSocketIncomingEvent[] = [];
		for (const value of wire)
			events.push(...target.push(new Uint8Array([value])));
		expect(events).toEqual([{ type: "message", data: "€😀\uFEFF" }]);
	});

	it("preserves an initial UTF-8 BOM and resets text decoding between messages", () => {
		const target = receiver();
		expect(target.push(serverFrame(1, bytes("\uFEFFhello")))).toEqual([
			{ type: "message", data: "\uFEFFhello" },
		]);
		expect(target.push(serverFrame(1, bytes("\uFEFFagain")))).toEqual([
			{ type: "message", data: "\uFEFFagain" },
		]);
	});

	it.each([false, true])(
		"owns partial and fragmented binary input, Buffer=%s",
		(useBuffer) => {
			const target = receiver();
			const wire = serverFrame(2, new Uint8Array([1, 2, 3]), false);
			const backing = useBuffer ? Buffer.from(wire) : wire;
			expect(target.push(backing.subarray(0, 3))).toEqual([]);
			backing[2] = 99;
			expect(target.push(backing.subarray(3))).toEqual([]);
			backing.fill(88);
			const final = serverFrame(0, new Uint8Array([4, 5]));
			const events = target.push(final);
			final.fill(77);
			expect(events).toEqual([
				{ type: "message", data: new Uint8Array([1, 2, 3, 4, 5]) },
			]);
			const event = events[0];
			assert(event.type === "message" && event.data instanceof Uint8Array);
			expect(event.data.buffer).not.toBe(backing.buffer);
			expect(event.data.buffer).not.toBe(final.buffer);
			expect(event.data.buffer.byteLength).toBe(5);
			event.data.fill(66);
			expect(target.push(serverFrame(2, new Uint8Array([6])))).toEqual([
				{ type: "message", data: new Uint8Array([6]) },
			]);
			expectReleased(target);
		},
	);

	it("owns coalesced binary, ping and pong events independently of caller input", () => {
		const target = receiver();
		const backing = join(
			serverFrame(2, new Uint8Array([1])),
			serverFrame(9, new Uint8Array([2])),
			serverFrame(10, new Uint8Array([3])),
		);
		const events = target.push(backing);
		backing.fill(255);
		expect(events).toEqual([
			{ type: "message", data: new Uint8Array([1]) },
			{ type: "ping", payload: new Uint8Array([2]) },
			{ type: "pong", payload: new Uint8Array([3]) },
		]);
		expectReleased(target);
	});

	it("handles empty data and continuation frames without retaining empty fragments", () => {
		const target = receiver({ maxFramesPerPush: 1 });
		expect(target.push(new Uint8Array())).toEqual([]);
		expect(target.push(serverFrame(1))).toEqual([
			{ type: "message", data: "" },
		]);
		expect(target.push(serverFrame(2, new Uint8Array(), false))).toEqual([]);
		for (let index = 0; index < 100; index++) {
			expect(target.push(serverFrame(0, new Uint8Array(), false))).toEqual([]);
			expect(target.metrics()).toEqual({
				state: "open",
				partialFrameAllocatedBytes: 0,
				assembledMessageBytes: 0,
				assemblyCapacityBytes: 0,
			});
		}
		expect(target).toMatchObject({
			assembly: undefined,
			messageOpcode: 2,
			messageBytes: 0,
		});
		expect(target.push(serverFrame(0))).toEqual([
			{ type: "message", data: new Uint8Array() },
		]);
		expectReleased(target);
	});
});

describe("WebSocket receiver assembly retention", () => {
	it("returns frozen metrics snapshots independent of later receiver state", () => {
		const target = receiver();
		const initial = target.metrics();
		expect(Object.isFrozen(initial)).toBe(true);
		expect(initial).toEqual({
			state: "open",
			partialFrameAllocatedBytes: 0,
			assembledMessageBytes: 0,
			assemblyCapacityBytes: 0,
		});
		expect(Reflect.set(initial, "assemblyCapacityBytes", 99)).toBe(false);
		expect(target.push(serverFrame(2, bytes("abc"), false))).toEqual([]);
		const assembled = target.metrics();
		expect(Object.isFrozen(assembled)).toBe(true);
		expect(assembled).not.toBe(initial);
		expect(assembled).toEqual({
			state: "open",
			partialFrameAllocatedBytes: 0,
			assembledMessageBytes: 3,
			assemblyCapacityBytes: 3,
		});
		expect(initial.assemblyCapacityBytes).toBe(0);
		expect(target.push(serverFrame(8))).toEqual([
			{ type: "close", code: undefined, reason: "" },
		]);
		expectReleased(target);
		expect(target.metrics().state).toBe("received-close");
		expect(assembled.state).toBe("open");
		expect(assembled.assembledMessageBytes).toBe(3);
		expect(assembled.assemblyCapacityBytes).toBe(3);
		target.close();
		expectTerminal(target);
	});

	it("bounds geometric capacity across many mutated one-byte fragment pushes", () => {
		const maxMessageBytes = 5003;
		const target = receiver({
			maxFrameBytes: 1,
			maxMessageBytes,
			maxFramesPerPush: 1,
		});
		const payload = Uint8Array.from(
			{ length: 4097 },
			(_value, index) => index % 251,
		);
		const scratch = new Uint8Array(3);
		const capacities: number[] = [];
		let expectedCapacity = 0;
		for (let index = 0; index < payload.length; index++) {
			scratch[0] = index === 0 ? 2 : 0;
			scratch[1] = 1;
			scratch[2] = payload[index];
			expect(target.push(scratch)).toEqual([]);
			scratch.fill(255);
			if (index + 1 > expectedCapacity) {
				expectedCapacity = Math.min(
					maxMessageBytes,
					Math.max(1, expectedCapacity * 2),
				);
				capacities.push(expectedCapacity);
			}
			expect(target.metrics()).toEqual({
				state: "open",
				partialFrameAllocatedBytes: 0,
				assembledMessageBytes: index + 1,
				assemblyCapacityBytes: expectedCapacity,
			});
			expect(expectedCapacity).toBeLessThanOrEqual(maxMessageBytes);
		}
		expect(capacities).toEqual([
			1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 5003,
		]);
		const events = target.push(serverFrame(0));
		expect(events).toEqual([{ type: "message", data: payload }]);
		const event = events[0];
		assert(event.type === "message" && event.data instanceof Uint8Array);
		expect(event.data.buffer.byteLength).toBe(payload.length);
		expect(event.data.buffer).not.toBe(scratch.buffer);
		expectReleased(target);
		expect(target.push(serverFrame(2, new Uint8Array([42]), false))).toEqual(
			[],
		);
		expect(target.metrics().assemblyCapacityBytes).toBe(1);
		expect(event.data).toEqual(payload);
		event.data.fill(99);
		expect(target.push(serverFrame(0))).toEqual([
			{ type: "message", data: new Uint8Array([42]) },
		]);
		expectReleased(target);
	});

	it("separates partial-frame allocation from assembly growth and output", () => {
		const target = receiver({
			maxFrameBytes: 8,
			maxMessageBytes: 13,
			maxFramesPerPush: 1,
		});
		expect(target.push(serverFrame(1, bytes("abc"), false))).toEqual([]);
		const continuation = serverFrame(0, bytes("defgh"), false);
		expect(target.push(continuation.subarray(0, 4))).toEqual([]);
		expect(target.metrics()).toEqual({
			state: "open",
			partialFrameAllocatedBytes: 5,
			assembledMessageBytes: 3,
			assemblyCapacityBytes: 3,
		});
		continuation.fill(255, 0, 4);
		expect(target.push(continuation.subarray(4))).toEqual([]);
		continuation.fill(255);
		expect(target.metrics()).toEqual({
			state: "open",
			partialFrameAllocatedBytes: 0,
			assembledMessageBytes: 8,
			assemblyCapacityBytes: 8,
		});
		expect(target.push(serverFrame(9, bytes("?")))).toEqual([
			{ type: "ping", payload: bytes("?") },
		]);
		expect(target.metrics().assemblyCapacityBytes).toBe(8);
		expect(target.push(serverFrame(0, bytes("ij")))).toEqual([
			{ type: "message", data: "abcdefghij" },
		]);
		expectReleased(target);
	});

	it("releases simultaneous assembly and partial-frame buffers on explicit close", () => {
		const target = receiver();
		expect(target.push(serverFrame(2, bytes("abc"), false))).toEqual([]);
		expect(target.push(new Uint8Array([0, 4, 1]))).toEqual([]);
		expect(target.metrics()).toEqual({
			state: "open",
			partialFrameAllocatedBytes: 4,
			assembledMessageBytes: 3,
			assemblyCapacityBytes: 3,
		});
		target.close();
		expectTerminal(target);
	});

	it("releases full assembly capacity when another fragment exceeds the bound", () => {
		const target = receiver({
			maxFrameBytes: 1,
			maxMessageBytes: 13,
			maxFramesPerPush: 1,
		});
		for (let index = 0; index < 13; index++)
			expect(
				target.push(
					serverFrame(index === 0 ? 2 : 0, new Uint8Array([1]), false),
				),
			).toEqual([]);
		expect(target.metrics()).toEqual({
			state: "open",
			partialFrameAllocatedBytes: 0,
			assembledMessageBytes: 13,
			assemblyCapacityBytes: 13,
		});
		expectCode(() => target.push(new Uint8Array([0, 1])), "resource-limit");
		expectTerminal(target);
	});
});

describe("WebSocket receiver wire validation", () => {
	it.each([
		{ wire: [0x80, 0] },
		{ wire: [0x00, 0] },
		{ wire: [0xc1] },
		{ wire: [0x83] },
		{ wire: [0x81, 0x80] },
		{ wire: [0x09] },
		{ wire: [0x88, 1] },
		{ wire: [0x89, 126] },
		{ wire: [0x8a, 127] },
		{ wire: [0x82, 126, 0, 125] },
		{ wire: [0x82, 127, 0x80] },
		{ wire: [0x82, 127, 0, 0, 0, 0, 0, 0, 255, 255] },
	])("rejects malformed or out-of-sequence wire data: $wire", ({ wire }) => {
		const target = receiver();
		expectCode(() => target.push(new Uint8Array(wire)), "network-error");
		expectTerminal(target);
	});

	it.each([1, 2] as const)(
		"rejects data opcode %s while fragmented",
		(opcode) => {
			const target = receiver();
			expect(target.push(serverFrame(1, bytes("open"), false))).toEqual([]);
			expectCode(() => target.push(serverFrame(opcode)), "network-error");
			expectTerminal(target);
		},
	);

	it("rejects a continuation after a completed fragmented message", () => {
		const target = receiver();
		expect(
			target.push(join(serverFrame(1, bytes("hi"), false), serverFrame(0))),
		).toEqual([{ type: "message", data: "hi" }]);
		expectCode(() => target.push(serverFrame(0)), "network-error");
		expectTerminal(target);
	});

	it.each([
		{ payload: [255] },
		{ payload: [0x80] },
		{ payload: [0xc0, 0xaf] },
		{ payload: [0xed, 0xa0, 0x80] },
		{ payload: [0xf4, 0x90, 0x80, 0x80] },
		{ payload: [0xe2, 0x82] },
	])("rejects invalid complete-message UTF-8: $payload", ({ payload }) => {
		const target = receiver();
		expectCode(
			() => target.push(serverFrame(1, new Uint8Array(payload))),
			"network-error",
		);
		expectTerminal(target);
	});

	it("validates text only on message completion, including empty final fragments", () => {
		const target = receiver();
		expect(
			target.push(serverFrame(1, new Uint8Array([0xe2, 0x82]), false)),
		).toEqual([]);
		expect(target.push(serverFrame(9))).toEqual([
			{ type: "ping", payload: new Uint8Array() },
		]);
		expectCode(() => target.push(serverFrame(0)), "network-error");
		expectTerminal(target);
	});

	it("never returns the successful prefix of a batch with invalid wire data", () => {
		const target = receiver();
		let returned: readonly WebSocketIncomingEvent[] | undefined;
		expectCode(() => {
			returned = target.push(
				join(serverFrame(1, bytes("valid")), serverFrame(0)),
			);
		}, "network-error");
		expect(returned).toBeUndefined();
		expectTerminal(target);
	});
});

describe("WebSocket receiver close handling", () => {
	it.each([
		1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014,
		3000, 4999,
	])("accepts close status %s and a UTF-8 reason", (code) => {
		const target = receiver();
		expect(target.push(closeFrame(code, bytes("bye €")))).toEqual([
			{ type: "close", code, reason: "bye €" },
		]);
		expectReleased(target);
	});

	it.each([0, 999, 1004, 1005, 1006, 1015, 1016, 2000, 2999, 5000, 65535])(
		"rejects reserved close status %s",
		(code) => {
			const target = receiver();
			expectCode(() => target.push(closeFrame(code)), "network-error");
			expectTerminal(target);
		},
	);

	it("rejects a malformed UTF-8 close reason", () => {
		const target = receiver();
		expectCode(
			() => target.push(closeFrame(1000, new Uint8Array([0xc0, 0xaf]))),
			"network-error",
		);
		expectTerminal(target);
	});

	it("accepts an empty close, discards fragments and ignores all trailing input", () => {
		const target = receiver({ maxFramesPerPush: 2 });
		expect(target.push(serverFrame(1, bytes("unfinished"), false))).toEqual([]);
		expect(
			target.push(join(serverFrame(9), serverFrame(8), new Uint8Array([0xff]))),
		).toEqual([
			{ type: "ping", payload: new Uint8Array() },
			{ type: "close", code: undefined, reason: "" },
		]);
		expectReleased(target);
		expect(target.push(serverFrame(0))).toEqual([]);
		expect(target.push(new Uint8Array([0xff]))).toEqual([]);
		target.close();
		expectTerminal(target);
	});

	it.each([
		{ wire: new Uint8Array([0x82, 126, 0]) },
		{ wire: new Uint8Array([0x82, 4, 1, 2]) },
		{ wire: serverFrame(1, bytes("queued"), false) },
	])(
		"explicit close releases pending header, payload or message: $wire",
		({ wire }) => {
			const target = receiver();
			expect(target.push(wire)).toEqual([]);
			target.close();
			target.close();
			expectTerminal(target);
		},
	);
});

describe("WebSocket receiver resource bounds", () => {
	for (const name of [
		"maxFrameBytes",
		"maxMessageBytes",
		"maxFramesPerPush",
	] as const) {
		it.each([
			0,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			2 ** 53,
			undefined,
			"8",
		])(`rejects invalid ${name}=%s`, (value) => {
			expectCode(
				() => receiver({ [name]: value } as Partial<WebSocketReceiverLimits>),
				"invalid-input",
			);
		});
	}

	it("requires limits and frame <= message", () => {
		expectCode(
			() =>
				new WebSocketReceiver(undefined as unknown as WebSocketReceiverLimits),
			"invalid-input",
		);
		expectCode(
			() => receiver({ maxFrameBytes: 2, maxMessageBytes: 1 }),
			"invalid-input",
		);
	});

	it("accepts maximum-safe limits and reports impossible allocation as a resource error", () => {
		const target = receiver({
			maxFrameBytes: Number.MAX_SAFE_INTEGER,
			maxMessageBytes: Number.MAX_SAFE_INTEGER,
			maxFramesPerPush: Number.MAX_SAFE_INTEGER,
		});
		expect(target.push(new Uint8Array())).toEqual([]);
		expectCode(
			() =>
				target.push(
					new Uint8Array([0x82, 127, 0, 0x1f, 255, 255, 255, 255, 255, 255]),
				),
			"resource-limit",
		);
		expectTerminal(target);
	});

	it("copies the supplied limits rather than retaining mutable configuration", () => {
		const limits = {
			maxFrameBytes: 1,
			maxMessageBytes: 1,
			maxFramesPerPush: 1,
		};
		const target = new WebSocketReceiver(limits);
		limits.maxFrameBytes = 100;
		limits.maxMessageBytes = 100;
		limits.maxFramesPerPush = 100;
		expectCode(() => target.push(new Uint8Array([0x82, 2])), "resource-limit");
		expectTerminal(target);
	});

	it.each([
		{ wire: [0x82, 5] },
		{ wire: [0x02, 126, 0, 126] },
		{ wire: [0x82, 127, 0, 0, 0, 0, 0, 1, 0, 0] },
		{ wire: [0x82, 127, 0, 0x20, 0, 0, 0, 0, 0, 0] },
	])(
		"rejects advertised oversized frames without a payload: $wire",
		({ wire }) => {
			const target = receiver({ maxFrameBytes: 4, maxMessageBytes: 4 });
			expectCode(() => target.push(new Uint8Array(wire)), "resource-limit");
			expectTerminal(target);
		},
	);

	it.each([false, true])(
		"rejects an oversized assembled message from its header, fin=%s",
		(fin) => {
			const target = receiver({ maxFrameBytes: 3, maxMessageBytes: 4 });
			expect(
				target.push(serverFrame(2, new Uint8Array([1, 2, 3]), false)),
			).toEqual([]);
			expectCode(
				() => target.push(new Uint8Array([fin ? 0x80 : 0, 2])),
				"resource-limit",
			);
			expectTerminal(target);
		},
	);

	it("accepts the exact frame and message bounds across fragments and pushes", () => {
		const target = receiver({
			maxFrameBytes: 2,
			maxMessageBytes: 4,
			maxFramesPerPush: 1,
		});
		expect(target.push(serverFrame(1, bytes("ab"), false))).toEqual([]);
		expect(target.push(serverFrame(0, bytes("cd")))).toEqual([
			{ type: "message", data: "abcd" },
		]);
		expectReleased(target);
	});

	it("counts only completed event bytes in each push", () => {
		const target = receiver({ maxFrameBytes: 4, maxMessageBytes: 4 });
		const second = serverFrame(1, bytes("next"));
		expect(
			target.push(join(serverFrame(1, bytes("full")), second.subarray(0, 4))),
		).toEqual([{ type: "message", data: "full" }]);
		expect(target.push(second.subarray(4))).toEqual([
			{ type: "message", data: "next" },
		]);
	});

	it("caps aggregate event bytes without returning a partial successful batch", () => {
		const target = receiver({ maxFrameBytes: 4, maxMessageBytes: 4 });
		let returned: readonly WebSocketIncomingEvent[] | undefined;
		expectCode(() => {
			returned = target.push(
				join(serverFrame(2, bytes("abc")), serverFrame(9, bytes("de"))),
			);
		}, "resource-limit");
		expect(returned).toBeUndefined();
		expectTerminal(target);
	});

	it("counts bytes from earlier fragments when a message completes", () => {
		const target = receiver({ maxFrameBytes: 4, maxMessageBytes: 4 });
		expect(target.push(serverFrame(1, bytes("abc"), false))).toEqual([]);
		expectCode(
			() =>
				target.push(
					join(serverFrame(10, bytes("p")), serverFrame(0, bytes("d"))),
				),
			"resource-limit",
		);
		expectTerminal(target);
	});

	it("counts UTF-8 payload bytes rather than UTF-16 string length", () => {
		const target = receiver({ maxFrameBytes: 4, maxMessageBytes: 4 });
		expectCode(
			() =>
				target.push(
					join(serverFrame(1, bytes("€")), serverFrame(1, bytes("ab"))),
				),
			"resource-limit",
		);
		expectTerminal(target);
	});

	it("counts close payload bytes including its status code", () => {
		const target = receiver({ maxFrameBytes: 4, maxMessageBytes: 4 });
		expectCode(
			() => target.push(join(serverFrame(1, bytes("abc")), closeFrame(1000))),
			"resource-limit",
		);
		expectTerminal(target);
	});

	it("allows the exact aggregate byte and frame bounds", () => {
		const target = receiver({
			maxFrameBytes: 4,
			maxMessageBytes: 4,
			maxFramesPerPush: 3,
		});
		expect(
			target.push(
				join(
					serverFrame(1, bytes("ab")),
					serverFrame(9, bytes("c")),
					serverFrame(10, bytes("d")),
				),
			),
		).toEqual([
			{ type: "message", data: "ab" },
			{ type: "ping", payload: bytes("c") },
			{ type: "pong", payload: bytes("d") },
		]);
	});

	it.each([0, 1, 2, 9, 10] as const)(
		"counts empty opcode %s frames against per-push work",
		(opcode) => {
			const target = receiver({ maxFramesPerPush: 2 });
			if (opcode === 0) target.push(serverFrame(2, new Uint8Array(), false));
			const frame = serverFrame(opcode, new Uint8Array(), opcode !== 0);
			expectCode(
				() => target.push(join(frame, frame, frame)),
				"resource-limit",
			);
			expectTerminal(target);
		},
	);

	it("counts fragments even when a chunk emits only one message", () => {
		const target = receiver({ maxFramesPerPush: 2 });
		expectCode(
			() =>
				target.push(
					join(
						serverFrame(1, bytes("a"), false),
						serverFrame(0, bytes("b"), false),
						serverFrame(0, bytes("c")),
					),
				),
			"resource-limit",
		);
		expectTerminal(target);
	});

	it("counts close frames against the frame-work bound", () => {
		const target = receiver({ maxFramesPerPush: 1 });
		expectCode(
			() => target.push(join(serverFrame(1), serverFrame(8))),
			"resource-limit",
		);
		expectTerminal(target);
	});

	it("resets the frame-work bound on each push", () => {
		const target = receiver({ maxFramesPerPush: 1 });
		for (let index = 0; index < 3; index++)
			expect(target.push(serverFrame(9))).toEqual([
				{ type: "ping", payload: new Uint8Array() },
			]);
	});

	it("rejects non-byte input without damaging an open receiver", () => {
		const target = receiver();
		expectCode(
			() => target.push([0x81, 0] as unknown as Uint8Array),
			"invalid-input",
		);
		expect(target.push(serverFrame(1))).toEqual([
			{ type: "message", data: "" },
		]);
	});
});
