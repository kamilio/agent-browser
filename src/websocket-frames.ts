import { AgentBrowserError } from "./errors.js";

export type NativeWebSocketOpcode = 0 | 1 | 2 | 8 | 9 | 10;

export interface NativeWebSocketFrame {
	readonly fin: boolean;
	readonly opcode: NativeWebSocketOpcode;
	readonly payload: Uint8Array;
}

export interface DecodedNativeWebSocketFrame {
	readonly frame: NativeWebSocketFrame;
	readonly bytesConsumed: number;
}

function validateBound(maxFramePayloadBytes: number): void {
	if (!Number.isSafeInteger(maxFramePayloadBytes) || maxFramePayloadBytes < 1)
		throw new AgentBrowserError(
			"invalid-input",
			"WebSocket frame payload bound must be a positive safe integer",
		);
}

function isOpcode(opcode: unknown): opcode is NativeWebSocketOpcode {
	return (
		opcode === 0 ||
		opcode === 1 ||
		opcode === 2 ||
		opcode === 8 ||
		opcode === 9 ||
		opcode === 10
	);
}

function validateControlFrame(
	fin: boolean,
	opcode: NativeWebSocketOpcode,
	payloadLength: number,
	code: "invalid-input" | "network-error",
): void {
	if (opcode >= 8 && (!fin || payloadLength > 125))
		throw new AgentBrowserError(
			code,
			"WebSocket control frames must be final and at most 125 bytes",
		);
	if (opcode === 8 && payloadLength === 1)
		throw new AgentBrowserError(
			code,
			"WebSocket close payload must not contain exactly one byte",
		);
}

function payloadLimit(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"WebSocket frame payload exceeds its safe-integer bound",
	);
}

export function decodeNativeWebSocketServerFrame(
	input: Uint8Array,
	maxFramePayloadBytes: number,
): DecodedNativeWebSocketFrame | undefined {
	validateBound(maxFramePayloadBytes);
	if (!(input instanceof Uint8Array))
		throw new AgentBrowserError("invalid-input", "Expected WebSocket bytes");
	if (input.length === 0) return undefined;
	const first = input[0];
	const fin = (first & 0x80) !== 0;
	const opcode = first & 0x0f;
	if (first & 0x70)
		throw new AgentBrowserError(
			"network-error",
			"WebSocket extensions are not supported: RSV bits must be zero",
		);
	if (!isOpcode(opcode))
		throw new AgentBrowserError("network-error", "Invalid WebSocket opcode");
	validateControlFrame(fin, opcode, 0, "network-error");
	if (input.length < 2) return undefined;
	const second = input[1];
	if (second & 0x80)
		throw new AgentBrowserError(
			"network-error",
			"Server frames must be unmasked",
		);
	const lengthMarker = second & 0x7f;
	validateControlFrame(fin, opcode, lengthMarker, "network-error");
	const headerLength = lengthMarker === 127 ? 10 : lengthMarker === 126 ? 4 : 2;
	if (lengthMarker === 127 && input.length >= 3 && input[2] & 0x80)
		throw new AgentBrowserError(
			"network-error",
			"WebSocket 64-bit length must have its high bit clear",
		);
	if (input.length < headerLength) return undefined;
	let payloadLength = lengthMarker;
	if (lengthMarker === 126) {
		payloadLength = input[2] * 256 + input[3];
		if (payloadLength < 126)
			throw new AgentBrowserError(
				"network-error",
				"Nonminimal WebSocket length",
			);
	} else if (lengthMarker === 127) {
		let declaredLength = 0n;
		for (let offset = 2; offset < 10; offset++)
			declaredLength = (declaredLength << 8n) | BigInt(input[offset]);
		if (declaredLength < 65536n)
			throw new AgentBrowserError(
				"network-error",
				"Nonminimal WebSocket length",
			);
		if (declaredLength > BigInt(maxFramePayloadBytes)) payloadLimit();
		payloadLength = Number(declaredLength);
	}
	if (payloadLength > maxFramePayloadBytes) payloadLimit();
	if (payloadLength > input.length - headerLength) return undefined;
	const bytesConsumed = headerLength + payloadLength;
	const payload = new Uint8Array(payloadLength);
	payload.set(input.subarray(headerLength, bytesConsumed));
	return { frame: { fin, opcode, payload }, bytesConsumed };
}

export function encodeNativeWebSocketClientFrame(
	frame: NativeWebSocketFrame,
	maskingKey: Uint8Array,
	maxFramePayloadBytes: number,
): Uint8Array {
	validateBound(maxFramePayloadBytes);
	if (
		!frame ||
		typeof frame.fin !== "boolean" ||
		!isOpcode(frame.opcode) ||
		!(frame.payload instanceof Uint8Array)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid WebSocket frame options",
		);
	if (!(maskingKey instanceof Uint8Array) || maskingKey.length !== 4)
		throw new AgentBrowserError(
			"invalid-input",
			"WebSocket masking key must contain exactly four bytes",
		);
	const { fin, opcode, payload } = frame;
	const payloadLength = payload.length;
	validateControlFrame(fin, opcode, payloadLength, "invalid-input");
	if (payloadLength > maxFramePayloadBytes) payloadLimit();
	const headerLength = payloadLength > 65535 ? 10 : payloadLength > 125 ? 4 : 2;
	const payloadOffset = headerLength + 4;
	const outputLength = payloadOffset + payloadLength;
	if (!Number.isSafeInteger(outputLength)) payloadLimit();
	let output: Uint8Array;
	try {
		output = new Uint8Array(outputLength);
	} catch (error) {
		if (!(error instanceof RangeError)) throw error;
		throw new AgentBrowserError(
			"resource-limit",
			"WebSocket encoded frame exceeds the byte-array allocation limit",
		);
	}
	output[0] = (fin ? 0x80 : 0) | opcode;
	output[1] =
		0x80 |
		(headerLength === 10 ? 127 : headerLength === 4 ? 126 : payloadLength);
	if (headerLength === 4) {
		output[2] = payloadLength >>> 8;
		output[3] = payloadLength & 0xff;
	} else if (headerLength === 10) {
		let remainingLength = BigInt(payloadLength);
		for (let offset = 9; offset >= 2; offset--) {
			output[offset] = Number(remainingLength & 0xffn);
			remainingLength >>= 8n;
		}
	}
	output.set(maskingKey, headerLength);
	for (let offset = 0; offset < payloadLength; offset++)
		output[payloadOffset + offset] = payload[offset] ^ maskingKey[offset % 4];
	return output;
}
