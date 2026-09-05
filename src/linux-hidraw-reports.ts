import { AgentBrowserError } from "./errors.js";
import { fidoHidMaximumPayload } from "./fido-hid-packets.js";

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
		"Invalid Linux hidraw report input.",
	);
}

function validateMetadata(reportBytes: number, reportId: number): void {
	if (
		!Number.isInteger(reportBytes) ||
		!Number.isInteger(reportId) ||
		reportId < 0 ||
		reportId > 255
	)
		invalidInput();
	fidoHidMaximumPayload(reportBytes);
}

function byteView(value: Uint8Array, expectedLength: number): Uint8Array {
	if (typedArrayTag?.call(value) !== "Uint8Array") invalidInput();
	const buffer = typedArrayBuffer?.call(value) as ArrayBuffer;
	const offset = typedArrayOffset?.call(value) as number;
	const length = typedArrayLength?.call(value) as number;
	arrayBufferLength?.call(buffer);
	if (length !== expectedLength) invalidInput();
	return new Uint8Array(buffer, offset, length);
}

export function encodeLinuxHidrawOutputReport(
	report: Uint8Array,
	reportBytes: number,
	reportId = 0,
): Uint8Array {
	try {
		validateMetadata(reportBytes, reportId);
		const view = byteView(report, reportBytes);
		const output = new Uint8Array(reportBytes + 1);
		output[0] = reportId;
		for (let index = 0; index < reportBytes; index++)
			output[index + 1] = view[index];
		return output;
	} catch {
		return invalidInput();
	}
}

export function decodeLinuxHidrawInputReport(
	bytes: Uint8Array,
	reportBytes: number,
	reportId = 0,
): Uint8Array {
	try {
		validateMetadata(reportBytes, reportId);
		const offset = reportId === 0 ? 0 : 1;
		const view = byteView(bytes, reportBytes + offset);
		if (offset !== 0 && view[0] !== reportId) invalidInput();
		const report = new Uint8Array(reportBytes);
		for (let index = 0; index < reportBytes; index++)
			report[index] = view[index + offset];
		return report;
	} catch {
		return invalidInput();
	}
}
