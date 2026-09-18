import { Buffer } from "node:buffer";
import { assert, describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	type NativeWebSocketFrame,
	type NativeWebSocketOpcode,
	decodeNativeWebSocketServerFrame,
	encodeNativeWebSocketClientFrame,
	inspectNativeWebSocketServerFrameHeader,
} from "./websocket-frames.js";

const maskingKey = new Uint8Array([0x37, 0xfa, 0x21, 0x3d]);
const transitions = [
	{ length: 0, header: [0x82, 0] },
	{ length: 125, header: [0x82, 125] },
	{ length: 126, header: [0x82, 126, 0, 126] },
	{ length: 65535, header: [0x82, 126, 255, 255] },
	{ length: 65536, header: [0x82, 127, 0, 0, 0, 0, 0, 1, 0, 0] },
];
const opcodes: NativeWebSocketOpcode[] = [0, 1, 2, 8, 9, 10];
const reservedOpcodes = [3, 4, 5, 6, 7, 11, 12, 13, 14, 15];

function expectCode(action: () => unknown, code: string): void {
	expect(action).toThrowError(AgentBrowserError);
	expect(action).toThrowError(expect.objectContaining({ code }));
}

function binaryFrame(payload: Uint8Array): NativeWebSocketFrame {
	return { fin: true, opcode: 2, payload };
}

function serverBytes(header: number[], payload: Uint8Array): Uint8Array {
	const bytes = new Uint8Array(header.length + payload.length);
	bytes.set(header);
	bytes.set(payload, header.length);
	return bytes;
}

describe("native no-extensions server frame header inspection", () => {
	it.each(transitions)(
		"admits a $length-byte payload from its header alone",
		({ length, header }) => {
			const bytes = new Uint8Array(header);
			for (let end = 0; end < bytes.length; end++)
				expect(
					inspectNativeWebSocketServerFrameHeader(
						bytes.subarray(0, end),
						Math.max(1, length),
					),
				).toBeUndefined();
			expect(
				inspectNativeWebSocketServerFrameHeader(bytes, Math.max(1, length)),
			).toEqual({
				fin: true,
				opcode: 2,
				payloadLength: length,
				headerLength: header.length,
			});
			expect(Array.from(bytes)).toEqual(header);
		},
	);

	it("inspects a header without consuming or validating the body", () => {
		const bytes = new Uint8Array([0x01, 2, 255, 255, 0xff]);
		expect(inspectNativeWebSocketServerFrameHeader(bytes, 2)).toEqual({
			fin: false,
			opcode: 1,
			payloadLength: 2,
			headerLength: 2,
		});
	});

	it.each([
		{ header: [0xc1] },
		{ header: [0x83] },
		{ header: [0x09] },
		{ header: [0x81, 0x80] },
		{ header: [0x88, 1] },
		{ header: [0x89, 126] },
		{ header: [0x8a, 127] },
		{ header: [0x82, 126, 0, 125] },
		{ header: [0x82, 127, 0x80] },
		{ header: [0x82, 127, 0, 0, 0, 0, 0, 0, 255, 255] },
	])("preserves early header errors: $header", ({ header }) => {
		expectCode(
			() =>
				inspectNativeWebSocketServerFrameHeader(new Uint8Array(header), 65536),
			"network-error",
		);
	});

	it.each(transitions.filter(({ length }) => length > 1))(
		"rejects an over-bound $length-byte declaration without a body",
		({ length, header }) => {
			expectCode(
				() =>
					inspectNativeWebSocketServerFrameHeader(
						new Uint8Array(header),
						length - 1,
					),
				"resource-limit",
			);
		},
	);

	it("returns a maximum-safe payload length without allocating its body", () => {
		const bytes = new Uint8Array([
			0x82, 127, 0, 0x1f, 255, 255, 255, 255, 255, 255,
		]);
		expect(
			inspectNativeWebSocketServerFrameHeader(bytes, Number.MAX_SAFE_INTEGER),
		).toEqual({
			fin: true,
			opcode: 2,
			payloadLength: Number.MAX_SAFE_INTEGER,
			headerLength: 10,
		});
		expectCode(
			() =>
				inspectNativeWebSocketServerFrameHeader(
					new Uint8Array([0x82, 127, 0, 0x20, 0, 0, 0, 0, 0, 0]),
					Number.MAX_SAFE_INTEGER,
				),
			"resource-limit",
		);
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
		"rejects invalid inspection bound %s",
		(bound) => {
			expectCode(
				() => inspectNativeWebSocketServerFrameHeader(new Uint8Array(), bound),
				"invalid-input",
			);
		},
	);

	it("requires byte input", () => {
		expectCode(
			() =>
				inspectNativeWebSocketServerFrameHeader(
					[0x82, 0] as unknown as Uint8Array,
					1,
				),
			"invalid-input",
		);
	});
});

describe("native no-extensions server frame decoding", () => {
	it.each(transitions)(
		"decodes the $length-byte length transition",
		({ length, header }) => {
			const payload = Uint8Array.from(
				{ length },
				(_value, index) => index % 251,
			);
			const bytes = serverBytes(header, payload);
			expect(
				decodeNativeWebSocketServerFrame(bytes, Math.max(1, length)),
			).toEqual({
				frame: binaryFrame(payload),
				bytesConsumed: bytes.length,
			});
		},
	);

	it.each(transitions)(
		"waits for partial headers and payload boundaries at $length",
		({ length, header }) => {
			const bytes = serverBytes(header, new Uint8Array(length));
			const ends = new Set([
				...Array.from({ length: header.length }, (_value, index) => index),
				header.length,
				header.length + 1,
				bytes.length - 1,
			]);
			for (const end of ends) {
				if (end >= bytes.length) continue;
				expect(
					decodeNativeWebSocketServerFrame(bytes.subarray(0, end), 65536),
				).toBeUndefined();
			}
		},
	);

	it("waits at every prefix of a short payload", () => {
		const bytes = new Uint8Array([0x81, 5, 72, 101, 108, 108, 111]);
		for (let end = 0; end < bytes.length; end++)
			expect(
				decodeNativeWebSocketServerFrame(bytes.subarray(0, end), 5),
			).toBeUndefined();
	});

	it("reports consumed bytes independently of coalesced frames", () => {
		const bytes = new Uint8Array([0x81, 2, 72, 105, 0x89, 0, 0x82]);
		const first = decodeNativeWebSocketServerFrame(bytes, 2);
		assert(first);
		expect(first).toEqual({
			frame: { fin: true, opcode: 1, payload: new Uint8Array([72, 105]) },
			bytesConsumed: 4,
		});
		const second = decodeNativeWebSocketServerFrame(
			bytes.subarray(first.bytesConsumed),
			2,
		);
		expect(second).toEqual({
			frame: { fin: true, opcode: 9, payload: new Uint8Array() },
			bytesConsumed: 2,
		});
		expect(
			decodeNativeWebSocketServerFrame(bytes.subarray(6), 2),
		).toBeUndefined();
	});

	it.each(opcodes)("accepts opcode %s", (opcode) => {
		expect(
			decodeNativeWebSocketServerFrame(new Uint8Array([0x80 | opcode, 0]), 1)
				?.frame,
		).toEqual({
			fin: true,
			opcode,
			payload: new Uint8Array(),
		});
	});

	it.each([0, 1, 2])(
		"permits nonfinal data opcode %s without tracking sequencing",
		(opcode) => {
			expect(
				decodeNativeWebSocketServerFrame(new Uint8Array([opcode, 0]), 1)?.frame
					.fin,
			).toBe(false);
		},
	);

	it.each([0x10, 0x20, 0x40, 0x70])("rejects RSV bits %s", (bits) => {
		expectCode(
			() =>
				decodeNativeWebSocketServerFrame(new Uint8Array([0x81 | bits, 0]), 1),
			"network-error",
		);
	});

	it.each(reservedOpcodes)("rejects reserved opcode %s", (opcode) => {
		expectCode(
			() =>
				decodeNativeWebSocketServerFrame(new Uint8Array([0x80 | opcode, 0]), 1),
			"network-error",
		);
	});

	it("rejects masked server frames before waiting for their key", () => {
		expectCode(
			() => decodeNativeWebSocketServerFrame(new Uint8Array([0x81, 0x80]), 1),
			"network-error",
		);
	});

	it.each([8, 9, 10])(
		"rejects fragmented and oversized control opcode %s",
		(opcode) => {
			expectCode(
				() =>
					decodeNativeWebSocketServerFrame(new Uint8Array([opcode, 0]), 125),
				"network-error",
			);
			for (const marker of [126, 127])
				expectCode(
					() =>
						decodeNativeWebSocketServerFrame(
							new Uint8Array([0x80 | opcode, marker]),
							65536,
						),
					"network-error",
				);
		},
	);

	it.each([8, 9, 10])("accepts 125-byte control opcode %s", (opcode) => {
		const bytes = serverBytes([0x80 | opcode, 125], new Uint8Array(125));
		expect(
			decodeNativeWebSocketServerFrame(bytes, 125)?.frame.payload.length,
		).toBe(125);
	});

	it("rejects a one-byte close declaration before receiving the payload", () => {
		expectCode(
			() => decodeNativeWebSocketServerFrame(new Uint8Array([0x88, 1]), 1),
			"network-error",
		);
	});

	it.each([
		[0x82, 126, 0, 0],
		[0x82, 126, 0, 125],
		[0x82, 127, 0, 0, 0, 0, 0, 0, 0, 0],
		[0x82, 127, 0, 0, 0, 0, 0, 0, 0, 126],
		[0x82, 127, 0, 0, 0, 0, 0, 0, 255, 255],
	])("rejects nonminimal length headers %j", (...header) => {
		expectCode(
			() => decodeNativeWebSocketServerFrame(new Uint8Array(header), 65536),
			"network-error",
		);
	});

	it("rejects the 64-bit high bit even in a partial header", () => {
		for (const header of [
			[0x82, 127, 0x80],
			[0x82, 127, 0x80, 0, 0, 0, 0, 0, 0, 0],
		])
			expectCode(
				() =>
					decodeNativeWebSocketServerFrame(
						new Uint8Array(header),
						Number.MAX_SAFE_INTEGER,
					),
				"network-error",
			);
	});

	it.each([
		{ header: [0x82, 125], bound: 124 },
		{ header: [0x82, 126, 0, 126], bound: 125 },
		{ header: [0x82, 126, 255, 255], bound: 65534 },
		{ header: [0x82, 127, 0, 0, 0, 0, 0, 1, 0, 0], bound: 65535 },
		{ header: [0x82, 127, 0, 0, 0, 1, 0, 0, 0, 0], bound: 65536 },
		{
			header: [0x82, 127, 0, 0x20, 0, 0, 0, 0, 0, 0],
			bound: Number.MAX_SAFE_INTEGER,
		},
		{
			header: [0x82, 127, 0x7f, 255, 255, 255, 255, 255, 255, 255],
			bound: Number.MAX_SAFE_INTEGER,
		},
	])(
		"rejects oversized and unsafe declarations without a body: $header",
		({ header, bound }) => {
			const bytes = new Uint8Array(header);
			expectCode(
				() => decodeNativeWebSocketServerFrame(bytes, bound),
				"resource-limit",
			);
			expect(Array.from(bytes)).toEqual(header);
		},
	);

	it("does not round a maximum-safe declaration or allocate an incomplete body", () => {
		const bytes = new Uint8Array([
			0x82, 127, 0, 0x1f, 255, 255, 255, 255, 255, 255,
		]);
		expect(
			decodeNativeWebSocketServerFrame(bytes, Number.MAX_SAFE_INTEGER),
		).toBeUndefined();
		expectCode(
			() =>
				decodeNativeWebSocketServerFrame(bytes, Number.MAX_SAFE_INTEGER - 1),
			"resource-limit",
		);
	});

	it.each([false, true])(
		"copies only the payload, including Buffer input: %s",
		(useBuffer) => {
			const backing = useBuffer
				? Buffer.from([99, 0x82, 2, 12, 34, 88])
				: new Uint8Array([99, 0x82, 2, 12, 34, 88]);
			const before = Array.from(backing);
			const result = decodeNativeWebSocketServerFrame(
				backing.subarray(1, 5),
				2,
			);
			assert(result);
			expect(Array.from(backing)).toEqual(before);
			expect(result.frame.payload.buffer).not.toBe(backing.buffer);
			expect(result.frame.payload.buffer.byteLength).toBe(2);
			backing[3] = 55;
			expect(result.frame.payload[0]).toBe(12);
			result.frame.payload[1] = 66;
			expect(backing[4]).toBe(34);
		},
	);

	it("leaves UTF-8 and close-code validation to a future connection owner", () => {
		for (const opcode of [1, 8]) {
			const payload = new Uint8Array([255, 255]);
			expect(
				decodeNativeWebSocketServerFrame(
					serverBytes([0x80 | opcode, 2], payload),
					2,
				)?.frame.payload,
			).toEqual(payload);
		}
	});
});

describe("native no-extensions client frame encoding", () => {
	it("matches the RFC masked Hello vector", () => {
		const payload = new Uint8Array([72, 101, 108, 108, 111]);
		expect(
			encodeNativeWebSocketClientFrame(
				{ fin: true, opcode: 1, payload },
				maskingKey,
				5,
			),
		).toEqual(
			new Uint8Array([
				0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58,
			]),
		);
	});

	it.each(transitions)(
		"encodes a minimal masked $length-byte frame",
		({ length, header }) => {
			const payload = Uint8Array.from(
				{ length },
				(_value, index) => index % 251,
			);
			const encoded = encodeNativeWebSocketClientFrame(
				binaryFrame(payload),
				maskingKey,
				Math.max(1, length),
			);
			const expectedHeader = [...header];
			expectedHeader[1] |= 0x80;
			expect(Array.from(encoded.subarray(0, header.length))).toEqual(
				expectedHeader,
			);
			expect(encoded.subarray(header.length, header.length + 4)).toEqual(
				maskingKey,
			);
			expect(encoded.length).toBe(header.length + 4 + length);
			const unmasked = new Uint8Array(length);
			for (let offset = 0; offset < length; offset++)
				unmasked[offset] =
					encoded[header.length + 4 + offset] ^ maskingKey[offset % 4];
			expect(unmasked).toEqual(payload);
		},
	);

	it.each(opcodes)("encodes final opcode %s", (opcode) => {
		const encoded = encodeNativeWebSocketClientFrame(
			{ fin: true, opcode, payload: new Uint8Array() },
			maskingKey,
			1,
		);
		expect(encoded[0]).toBe(0x80 | opcode);
		expect(encoded[1]).toBe(0x80);
	});

	it.each([0, 1, 2] as const)("preserves nonfinal data opcode %s", (opcode) => {
		const encoded = encodeNativeWebSocketClientFrame(
			{ fin: false, opcode, payload: new Uint8Array([255]) },
			maskingKey,
			1,
		);
		expect(encoded[0]).toBe(opcode);
	});

	it.each([8, 9, 10] as const)(
		"enforces control opcode %s constraints",
		(opcode) => {
			const frame = { fin: true, opcode, payload: new Uint8Array(125) };
			expect(
				encodeNativeWebSocketClientFrame(frame, maskingKey, 125).length,
			).toBe(131);
			expectCode(
				() =>
					encodeNativeWebSocketClientFrame(
						{ ...frame, fin: false },
						maskingKey,
						125,
					),
				"invalid-input",
			);
			expectCode(
				() =>
					encodeNativeWebSocketClientFrame(
						{ ...frame, payload: new Uint8Array(126) },
						maskingKey,
						126,
					),
				"invalid-input",
			);
		},
	);

	it("rejects a one-byte close payload", () => {
		expectCode(
			() =>
				encodeNativeWebSocketClientFrame(
					{ fin: true, opcode: 8, payload: new Uint8Array(1) },
					maskingKey,
					1,
				),
			"invalid-input",
		);
	});

	it.each([...reservedOpcodes, -1, 16, 256, 1.5, Number.NaN, "1", undefined])(
		"rejects invalid caller opcode %s",
		(opcode) => {
			const frame = {
				fin: true,
				opcode,
				payload: new Uint8Array(),
			} as NativeWebSocketFrame;
			expectCode(
				() => encodeNativeWebSocketClientFrame(frame, maskingKey, 1),
				"invalid-input",
			);
		},
	);

	it.each([
		null,
		undefined,
		{},
		{ fin: 1, opcode: 2, payload: new Uint8Array() },
		{ fin: true, opcode: 2, payload: [1] },
	])("rejects malformed caller frame %j", (frame) => {
		expectCode(
			() =>
				encodeNativeWebSocketClientFrame(
					frame as unknown as NativeWebSocketFrame,
					maskingKey,
					1,
				),
			"invalid-input",
		);
	});

	it.each([
		undefined,
		null,
		[1, 2, 3, 4],
		new Uint8Array(),
		new Uint8Array(3),
		new Uint8Array(5),
	])("requires an explicit four-byte key: %j", (key) => {
		expectCode(
			() =>
				encodeNativeWebSocketClientFrame(
					binaryFrame(new Uint8Array()),
					key as Uint8Array,
					1,
				),
			"invalid-input",
		);
	});

	it("enforces the caller payload bound before encoding", () => {
		expectCode(
			() =>
				encodeNativeWebSocketClientFrame(
					binaryFrame(new Uint8Array(126)),
					maskingKey,
					125,
				),
			"resource-limit",
		);
	});

	it("preserves overlapping key/payload views and isolates output", () => {
		const backing = new Uint8Array([99, 1, 2, 3, 4, 5, 88]);
		const payload = backing.subarray(1, 6);
		const key = backing.subarray(2, 6);
		const before = new Uint8Array(backing);
		const encoded = encodeNativeWebSocketClientFrame(
			binaryFrame(payload),
			key,
			5,
		);
		expect(backing).toEqual(before);
		expect(encoded).toEqual(
			new Uint8Array([0x82, 0x85, 2, 3, 4, 5, 3, 1, 7, 1, 7]),
		);
		backing.fill(0);
		expect(Array.from(encoded.subarray(2, 6))).toEqual([2, 3, 4, 5]);
		encoded.fill(255);
		expect(Array.from(backing)).toEqual([0, 0, 0, 0, 0, 0, 0]);
	});

	it("uses the supplied key without generating or replacing it", () => {
		const payload = new Uint8Array([10, 20]);
		const encoded = encodeNativeWebSocketClientFrame(
			binaryFrame(payload),
			new Uint8Array(4),
			2,
		);
		expect(encoded).toEqual(new Uint8Array([0x82, 0x82, 0, 0, 0, 0, 10, 20]));
	});
});

describe("native frame caller validation", () => {
	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		undefined,
		null,
		"125",
	])("rejects invalid bound %s even for empty input", (bound) => {
		expectCode(
			() => decodeNativeWebSocketServerFrame(new Uint8Array(), bound as number),
			"invalid-input",
		);
		expectCode(
			() =>
				encodeNativeWebSocketClientFrame(
					binaryFrame(new Uint8Array()),
					maskingKey,
					bound as number,
				),
			"invalid-input",
		);
	});

	it.each([undefined, null, [], new ArrayBuffer(2), new Uint16Array(2)])(
		"rejects non-byte decoder input %j",
		(input) => {
			expectCode(
				() =>
					decodeNativeWebSocketServerFrame(input as unknown as Uint8Array, 1),
				"invalid-input",
			);
		},
	);
});
