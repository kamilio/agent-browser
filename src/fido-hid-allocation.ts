import { AgentBrowserError } from "./errors.js";
import {
	copyFidoHidChannel,
	encodeFidoHidMessage,
	fidoHidMaximumPayload,
} from "./fido-hid-packets.js";

export interface FidoHidAllocation {
	channel: Uint8Array;
	protocolVersion: number;
	deviceVersion: { major: number; minor: number; build: number };
	capabilities: number;
	wink: boolean;
	cbor: boolean;
	msg: boolean;
	extensions: Uint8Array;
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBuffer = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"buffer",
)?.get;
const typedArrayOffset = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteOffset",
)?.get;
const typedArrayLength = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteLength",
)?.get;
const typedArrayTag = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	Symbol.toStringTag,
)?.get;
const arrayBufferLength = Object.getOwnPropertyDescriptor(
	ArrayBuffer.prototype,
	"byteLength",
)?.get;

function invalidInput(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid FIDO HID allocation input.",
	);
}

function byteView(value: Uint8Array): { view: Uint8Array; length: number } {
	try {
		if (typedArrayTag?.call(value) !== "Uint8Array") invalidInput();
		const buffer = typedArrayBuffer?.call(value) as ArrayBuffer;
		const offset = typedArrayOffset?.call(value) as number;
		const length = typedArrayLength?.call(value) as number;
		arrayBufferLength?.call(buffer);
		return { view: new Uint8Array(buffer, offset, length), length };
	} catch {
		return invalidInput();
	}
}

function copyBytes(
	view: Uint8Array,
	offset: number,
	length: number,
): Uint8Array {
	const copy = new Uint8Array(length);
	for (let index = 0; index < length; index++)
		copy[index] = view[offset + index];
	return copy;
}

function isBroadcast(channel: Uint8Array): boolean {
	return (
		channel[0] === 0xff &&
		channel[1] === 0xff &&
		channel[2] === 0xff &&
		channel[3] === 0xff
	);
}

export function encodeFidoHidAllocationRequest(
	nonce: Uint8Array,
	reportBytes = 64,
): readonly Uint8Array[] {
	try {
		const { view, length } = byteView(nonce);
		if (length !== 8) invalidInput();
		const ownedNonce = copyBytes(view, 0, 8);
		return encodeFidoHidMessage(
			new Uint8Array([0xff, 0xff, 0xff, 0xff]),
			0x06,
			ownedNonce,
			reportBytes,
		);
	} catch {
		return invalidInput();
	}
}

export function decodeFidoHidAllocationResponse(
	channel: Uint8Array,
	command: number,
	payload: Uint8Array,
	expectedNonce: Uint8Array,
): FidoHidAllocation | null {
	try {
		const envelope = copyFidoHidChannel(channel);
		if (!isBroadcast(envelope) || command !== 0x06) invalidInput();
		const { view, length } = byteView(payload);
		const expected = byteView(expectedNonce);
		if (
			length < 17 ||
			length > fidoHidMaximumPayload() ||
			expected.length !== 8
		)
			invalidInput();
		for (let index = 0; index < 8; index++)
			if (view[index] !== expected.view[index]) return null;
		const assignedChannel = copyBytes(view, 8, 4);
		if (
			!(
				assignedChannel[0] |
				assignedChannel[1] |
				assignedChannel[2] |
				assignedChannel[3]
			) ||
			isBroadcast(assignedChannel)
		)
			invalidInput();
		const capabilities = view[16];
		return {
			channel: assignedChannel,
			protocolVersion: view[12],
			deviceVersion: { major: view[13], minor: view[14], build: view[15] },
			capabilities,
			wink: (capabilities & 0x01) !== 0,
			cbor: (capabilities & 0x04) !== 0,
			msg: (capabilities & 0x08) === 0,
			extensions: copyBytes(view, 17, length - 17),
		};
	} catch {
		return invalidInput();
	}
}
