import { AgentBrowserError } from "./errors.js";

export const ctapCborLimits = Object.freeze({ maxBytes: 7609, maxDepth: 4 });

export type CtapCborValue =
	| { kind: "unsigned"; value: bigint }
	| { kind: "negative"; value: bigint }
	| { kind: "bytes"; value: Uint8Array }
	| { kind: "text"; value: string }
	| { kind: "array"; items: readonly CtapCborValue[] }
	| {
			kind: "map";
			entries: readonly (readonly [CtapCborValue, CtapCborValue])[];
	  }
	| { kind: "simple"; value: number }
	| { kind: "float"; value: number; encoding: Uint8Array };

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
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function invalidInput(): never {
	throw new AgentBrowserError("invalid-input", "Invalid CTAP CBOR input.");
}

function limitExceeded(): never {
	throw new AgentBrowserError("resource-limit", "CTAP CBOR limit exceeded.");
}

function unsupportedKey(): never {
	throw new AgentBrowserError("unsupported", "Unsupported CTAP CBOR map key.");
}

export function copyCtapBytes(input: Uint8Array): Uint8Array {
	let view: Uint8Array;
	try {
		if (typedArrayTag?.call(input) !== "Uint8Array") invalidInput();
		const buffer = typedArrayBuffer?.call(input) as ArrayBuffer;
		const offset = typedArrayOffset?.call(input) as number;
		const length = typedArrayLength?.call(input) as number;
		arrayBufferLength?.call(buffer);
		view = new Uint8Array(buffer, offset, length);
	} catch {
		return invalidInput();
	}
	if (view.length === 0) invalidInput();
	if (view.length > ctapCborLimits.maxBytes) limitExceeded();
	const copy = new Uint8Array(view.length);
	for (let index = 0; index < view.length; index++) copy[index] = view[index];
	return copy;
}

function keyIdentity(key: CtapCborValue): string {
	switch (key.kind) {
		case "unsigned":
		case "negative":
			return `number:${key.value}`;
		case "float":
			if (Number.isNaN(key.value)) {
				const fractionBits =
					key.encoding.length === 3 ? 10 : key.encoding.length === 5 ? 23 : 52;
				let bits = 0n;
				for (let index = 1; index < key.encoding.length; index++)
					bits = (bits << 8n) | BigInt(key.encoding[index]);
				const significand = bits & ((1n << BigInt(fractionBits)) - 1n);
				return `nan:${significand << BigInt(64 - fractionBits)}`;
			}
			return Number.isInteger(key.value)
				? `number:${BigInt(key.value)}`
				: `float:${key.value}`;
		case "simple":
			return `simple:${key.value}`;
		case "text":
			return `text:${key.value}`;
		case "bytes": {
			let identity = "bytes:";
			for (const byte of key.value)
				identity += byte.toString(16).padStart(2, "0");
			return identity;
		}
		default:
			return unsupportedKey();
	}
}

class CtapCborDecoder {
	readonly #bytes: Uint8Array;
	#offset = 0;

	constructor(bytes: Uint8Array) {
		this.#bytes = bytes;
	}

	decode(): CtapCborValue {
		const value = this.read(0);
		if (this.#offset !== this.#bytes.length) invalidInput();
		return value;
	}

	private take(length: number): Uint8Array {
		if (length > this.#bytes.length - this.#offset) invalidInput();
		const bytes = this.#bytes.subarray(this.#offset, this.#offset + length);
		this.#offset += length;
		return bytes;
	}

	private argument(additional: number): bigint {
		if (additional < 24) return BigInt(additional);
		if (additional > 27) invalidInput();
		const width = 2 ** (additional - 24);
		let value = 0n;
		for (const byte of this.take(width)) value = (value << 8n) | BigInt(byte);
		const minimum =
			additional === 24
				? 24n
				: additional === 25
					? 256n
					: additional === 26
						? 65536n
						: 4294967296n;
		if (value < minimum) invalidInput();
		return value;
	}

	private length(argument: bigint, divisor = 1): number {
		const available = Math.floor((this.#bytes.length - this.#offset) / divisor);
		if (argument > BigInt(available)) invalidInput();
		return Number(argument);
	}

	private simple(additional: number, start: number): CtapCborValue {
		if (additional < 24) return { kind: "simple", value: additional };
		if (additional === 24) {
			const value = this.take(1)[0];
			if (value < 32) invalidInput();
			return { kind: "simple", value };
		}
		if (additional > 27) invalidInput();
		const bytes = this.take(2 ** (additional - 24));
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		let value: number;
		if (additional === 25) {
			const bits = view.getUint16(0);
			const exponent = (bits >>> 10) & 31;
			const fraction = bits & 1023;
			value =
				exponent === 0
					? fraction * 2 ** -24
					: exponent === 31
						? fraction === 0
							? Number.POSITIVE_INFINITY
							: Number.NaN
						: (fraction + 1024) * 2 ** (exponent - 25);
			if ((bits & 0x8000) !== 0) value = -value;
		} else {
			value = additional === 26 ? view.getFloat32(0) : view.getFloat64(0);
		}
		return {
			kind: "float",
			value,
			encoding: this.#bytes.slice(start, this.#offset),
		};
	}

	private ordered(
		previousStart: number,
		previousEnd: number,
		start: number,
		end: number,
	): boolean {
		const previousLength = previousEnd - previousStart;
		const length = end - start;
		for (let index = 0; index < Math.min(previousLength, length); index++) {
			const previous = this.#bytes[previousStart + index];
			const current = this.#bytes[start + index];
			if (previous !== current) return previous < current;
		}
		return previousLength < length;
	}

	private read(depth: number): CtapCborValue {
		const start = this.#offset;
		const header = this.take(1)[0];
		const major = header >>> 5;
		const additional = header & 31;
		if (major === 7) return this.simple(additional, start);
		if (major === 6) invalidInput();
		const argument = this.argument(additional);
		if (major === 0) return { kind: "unsigned", value: argument };
		if (major === 1) return { kind: "negative", value: -1n - argument };
		if (major === 2)
			return { kind: "bytes", value: this.take(this.length(argument)).slice() };
		if (major === 3) {
			try {
				return {
					kind: "text",
					value: utf8.decode(this.take(this.length(argument))),
				};
			} catch {
				return invalidInput();
			}
		}
		if (depth >= ctapCborLimits.maxDepth) limitExceeded();
		if (major === 4) {
			const count = this.length(argument);
			const items: CtapCborValue[] = [];
			for (let index = 0; index < count; index++)
				items.push(this.read(depth + 1));
			return { kind: "array", items };
		}
		const count = this.length(argument, 2);
		const entries: [CtapCborValue, CtapCborValue][] = [];
		const seen = new Set<string>();
		let previousStart = 0;
		let previousEnd = 0;
		for (let index = 0; index < count; index++) {
			const keyStart = this.#offset;
			const keyMajor = this.#bytes[keyStart] >>> 5;
			if (keyMajor === 4 || keyMajor === 5) unsupportedKey();
			const key = this.read(depth + 1);
			const keyEnd = this.#offset;
			if (
				index !== 0 &&
				!this.ordered(previousStart, previousEnd, keyStart, keyEnd)
			)
				invalidInput();
			const identity = keyIdentity(key);
			if (seen.has(identity)) invalidInput();
			seen.add(identity);
			previousStart = keyStart;
			previousEnd = keyEnd;
			entries.push([key, this.read(depth + 1)]);
		}
		return { kind: "map", entries };
	}
}

export function decodeCtapCbor(input: Uint8Array): CtapCborValue {
	const bytes = copyCtapBytes(input);
	try {
		return new CtapCborDecoder(bytes).decode();
	} catch (error) {
		if (error instanceof AgentBrowserError) throw error;
		return invalidInput();
	} finally {
		bytes.fill(0);
	}
}
