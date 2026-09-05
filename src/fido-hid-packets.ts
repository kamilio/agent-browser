import { AgentBrowserError } from "./errors.js";

export const fidoHidLimits = Object.freeze({
	minReportBytes: 7,
	maxReportBytes: 64,
	maxContinuationPackets: 128,
});

export type FidoHidPacket =
	| {
			type: "initialization";
			channel: Uint8Array;
			command: number;
			payloadLength: number;
			data: Uint8Array;
	  }
	| {
			type: "continuation";
			channel: Uint8Array;
			sequence: number;
			data: Uint8Array;
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
		"Invalid FIDO HID packet input.",
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

export function fidoHidMaximumPayload(reportBytes = 64): number {
	if (
		!Number.isInteger(reportBytes) ||
		reportBytes < fidoHidLimits.minReportBytes ||
		reportBytes > fidoHidLimits.maxReportBytes
	)
		invalidInput();
	return (
		reportBytes - 7 + fidoHidLimits.maxContinuationPackets * (reportBytes - 5)
	);
}

export function copyFidoHidChannel(channel: Uint8Array): Uint8Array {
	const { view, length } = byteView(channel);
	if (length !== 4 || !(view[0] | view[1] | view[2] | view[3])) invalidInput();
	return copyBytes(view, 0, 4);
}

export function encodeFidoHidMessage(
	channel: Uint8Array,
	command: number,
	payload: Uint8Array,
	reportBytes = 64,
): readonly Uint8Array[] {
	const maximum = fidoHidMaximumPayload(reportBytes);
	if (!Number.isInteger(command) || command < 0 || command > 127)
		invalidInput();
	const { view, length } = byteView(payload);
	if (length > maximum)
		throw new AgentBrowserError(
			"resource-limit",
			"FIDO HID payload exceeds the packet limit.",
		);
	const ownedChannel = copyFidoHidChannel(channel);
	const reports: Uint8Array[] = [];
	let payloadOffset = 0;
	let sequence = 0;
	do {
		const report = new Uint8Array(reportBytes);
		report.set(ownedChannel);
		const initial = reports.length === 0;
		const dataOffset = initial ? 7 : 5;
		if (initial) {
			report[4] = command | 0x80;
			report[5] = length >> 8;
			report[6] = length & 0xff;
		} else report[4] = sequence++;
		const count = Math.min(reportBytes - dataOffset, length - payloadOffset);
		for (let index = 0; index < count; index++)
			report[dataOffset + index] = view[payloadOffset + index];
		payloadOffset += count;
		reports.push(report);
	} while (payloadOffset < length);
	return reports;
}

export function decodeFidoHidPacket(
	report: Uint8Array,
	reportBytes = 64,
): FidoHidPacket {
	fidoHidMaximumPayload(reportBytes);
	const { view, length } = byteView(report);
	if (length !== reportBytes || !(view[0] | view[1] | view[2] | view[3]))
		invalidInput();
	const channel = copyBytes(view, 0, 4);
	if (view[4] & 0x80)
		return {
			type: "initialization",
			channel,
			command: view[4] & 0x7f,
			payloadLength: (view[5] << 8) | view[6],
			data: copyBytes(view, 7, reportBytes - 7),
		};
	return {
		type: "continuation",
		channel,
		sequence: view[4],
		data: copyBytes(view, 5, reportBytes - 5),
	};
}
