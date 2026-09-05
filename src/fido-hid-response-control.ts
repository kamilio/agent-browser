import { AgentBrowserError } from "./errors.js";
import { copyFidoHidChannel } from "./fido-hid-packets.js";

export type FidoHidKeepaliveStatus =
	| "STATUS_PROCESSING"
	| "STATUS_UPNEEDED"
	| "unknown";

export type FidoHidResponseError =
	| "ERR_INVALID_CMD"
	| "ERR_INVALID_PAR"
	| "ERR_INVALID_LEN"
	| "ERR_INVALID_SEQ"
	| "ERR_MSG_TIMEOUT"
	| "ERR_CHANNEL_BUSY"
	| "ERR_LOCK_REQUIRED"
	| "ERR_INVALID_CHANNEL"
	| "ERR_OTHER"
	| "unknown";

export type FidoHidResponseControl =
	| {
			kind: "keepalive";
			channel: Uint8Array;
			code: number;
			status: FidoHidKeepaliveStatus;
	  }
	| {
			kind: "error";
			channel: Uint8Array;
			code: number;
			error: FidoHidResponseError;
	  };

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
		"Invalid FIDO HID response control input.",
	);
}

function payloadView(value: Uint8Array): Uint8Array {
	if (typedArrayTag?.call(value) !== "Uint8Array") invalidInput();
	const buffer = typedArrayBuffer?.call(value) as ArrayBuffer;
	const offset = typedArrayOffset?.call(value) as number;
	const length = typedArrayLength?.call(value) as number;
	arrayBufferLength?.call(buffer);
	if (length !== 1) invalidInput();
	return new Uint8Array(buffer, offset, length);
}

function errorLabel(code: number): FidoHidResponseError {
	switch (code) {
		case 0x01:
			return "ERR_INVALID_CMD";
		case 0x02:
			return "ERR_INVALID_PAR";
		case 0x03:
			return "ERR_INVALID_LEN";
		case 0x04:
			return "ERR_INVALID_SEQ";
		case 0x05:
			return "ERR_MSG_TIMEOUT";
		case 0x06:
			return "ERR_CHANNEL_BUSY";
		case 0x0a:
			return "ERR_LOCK_REQUIRED";
		case 0x0b:
			return "ERR_INVALID_CHANNEL";
		case 0x7f:
			return "ERR_OTHER";
		default:
			return "unknown";
	}
}

export function decodeFidoHidResponseControl(
	channel: Uint8Array,
	command: number,
	payload: Uint8Array,
): FidoHidResponseControl {
	try {
		if (command !== 0x3b && command !== 0x3f) invalidInput();
		const ownedChannel = copyFidoHidChannel(channel);
		if (
			ownedChannel[0] === 0xff &&
			ownedChannel[1] === 0xff &&
			ownedChannel[2] === 0xff &&
			ownedChannel[3] === 0xff
		)
			invalidInput();
		const code = payloadView(payload)[0];
		if (command === 0x3b)
			return {
				kind: "keepalive",
				channel: ownedChannel,
				code,
				status:
					code === 1
						? "STATUS_PROCESSING"
						: code === 2
							? "STATUS_UPNEEDED"
							: "unknown",
			};
		return {
			kind: "error",
			channel: ownedChannel,
			code,
			error: errorLabel(code),
		};
	} catch {
		return invalidInput();
	}
}
