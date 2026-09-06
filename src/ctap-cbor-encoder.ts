import {
	type CtapCborValue,
	ctapCborLimits,
	decodeCtapCbor,
} from "./ctap-cbor.js";
import { AgentBrowserError } from "./errors.js";

const invalid = Symbol("invalid CTAP CBOR encoding");
const limited = Symbol("CTAP CBOR encoding limit");
const unsupported = Symbol("unsupported CTAP CBOR key");
const maximumUnsigned = (1n << 64n) - 1n;
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
const typedArrayValues = Uint8Array.prototype.values;
const hasOwn = Object.prototype.hasOwnProperty;
const utf8 = new TextEncoder();

interface EncodedEntry {
	start: number;
	keyEnd: number;
	end: number;
}

function bytes(input: unknown): Uint8Array {
	if (typedArrayTag?.call(input) !== "Uint8Array") throw invalid;
	typedArrayValues.call(input as Uint8Array);
	const buffer = typedArrayBuffer?.call(input) as ArrayBuffer;
	const offset = typedArrayOffset?.call(input) as number;
	const length = typedArrayLength?.call(input) as number;
	arrayBufferLength?.call(buffer);
	return new Uint8Array(buffer, offset, length);
}

function wipe(value: CtapCborValue): void {
	if (value.kind === "bytes") value.value.fill(0);
	else if (value.kind === "float") value.encoding.fill(0);
	else if (value.kind === "array") {
		for (const item of value.items) wipe(item);
	} else if (value.kind === "map") {
		for (const [key, item] of value.entries) {
			wipe(key);
			wipe(item);
		}
	}
}

function array(input: unknown): readonly unknown[] {
	if (!Array.isArray(input)) throw invalid;
	return input;
}

function count(input: readonly unknown[]): number {
	const length = input.length;
	if (!Number.isSafeInteger(length) || length < 0) throw invalid;
	return length;
}

function item(input: readonly unknown[], index: number): unknown {
	if (!hasOwn.call(input, index)) throw invalid;
	return input[index];
}

class CtapCborEncoder {
	readonly #bytes = new Uint8Array(ctapCborLimits.maxBytes);
	#offset = 0;

	write(input: unknown, depth = 0, key = false): void {
		if (input === null || typeof input !== "object") throw invalid;
		const value = input as CtapCborValue;
		const kind = value.kind;
		if (key && (kind === "array" || kind === "map")) throw unsupported;
		switch (kind) {
			case "unsigned": {
				const scalar = (value as Extract<CtapCborValue, { kind: "unsigned" }>)
					.value;
				if (
					typeof scalar !== "bigint" ||
					scalar < 0n ||
					scalar > maximumUnsigned
				)
					throw invalid;
				this.header(0, scalar);
				break;
			}
			case "negative": {
				const scalar = (value as Extract<CtapCborValue, { kind: "negative" }>)
					.value;
				if (
					typeof scalar !== "bigint" ||
					scalar >= 0n ||
					scalar < -1n - maximumUnsigned
				)
					throw invalid;
				this.header(1, -1n - scalar);
				break;
			}
			case "bytes": {
				const view = bytes(
					(value as Extract<CtapCborValue, { kind: "bytes" }>).value,
				);
				this.header(2, BigInt(view.length));
				this.append(view);
				break;
			}
			case "text":
				this.text((value as Extract<CtapCborValue, { kind: "text" }>).value);
				break;
			case "array": {
				if (depth >= ctapCborLimits.maxDepth) throw limited;
				const items = array(
					(value as Extract<CtapCborValue, { kind: "array" }>).items,
				);
				const length = count(items);
				if (length > this.remaining()) throw limited;
				this.header(4, BigInt(length));
				for (let index = 0; index < length; index++)
					this.write(item(items, index), depth + 1);
				break;
			}
			case "map": {
				if (depth >= ctapCborLimits.maxDepth) throw limited;
				const entries = array(
					(value as Extract<CtapCborValue, { kind: "map" }>).entries,
				);
				this.map(entries, depth + 1);
				break;
			}
			case "simple": {
				const scalar = (value as Extract<CtapCborValue, { kind: "simple" }>)
					.value;
				if (
					typeof scalar !== "number" ||
					!Number.isInteger(scalar) ||
					scalar < 0 ||
					scalar > 255 ||
					(scalar >= 24 && scalar <= 31)
				)
					throw invalid;
				this.append(
					scalar < 24
						? new Uint8Array([0xe0 + scalar])
						: new Uint8Array([0xf8, scalar]),
				);
				break;
			}
			case "float": {
				const floating = value as Extract<CtapCborValue, { kind: "float" }>;
				const scalar = floating.value;
				if (typeof scalar !== "number") throw invalid;
				this.float(scalar, floating.encoding);
				break;
			}
			default:
				throw invalid;
		}
	}

	finish(): Uint8Array {
		return this.#bytes.slice(0, this.#offset);
	}

	close(): void {
		this.#bytes.fill(0);
	}

	private remaining(): number {
		return this.#bytes.length - this.#offset;
	}

	private ensure(length: number): void {
		if (length > this.remaining()) throw limited;
	}

	private append(value: Uint8Array): void {
		this.ensure(value.length);
		this.#bytes.set(value, this.#offset);
		this.#offset += value.length;
	}

	private header(major: number, argument: bigint): void {
		const width =
			argument < 24n
				? 0
				: argument <= 255n
					? 1
					: argument <= 65535n
						? 2
						: argument <= 4294967295n
							? 4
							: 8;
		this.ensure(1 + width);
		const additional =
			width === 0
				? Number(argument)
				: width === 1
					? 24
					: width === 2
						? 25
						: width === 4
							? 26
							: 27;
		this.#bytes[this.#offset++] = major * 32 + additional;
		let remainingArgument = argument;
		for (let remaining = width - 1; remaining >= 0; remaining--) {
			this.#bytes[this.#offset + remaining] = Number(remainingArgument & 255n);
			remainingArgument >>= 8n;
		}
		this.#offset += width;
	}

	private text(value: unknown): void {
		if (typeof value !== "string") throw invalid;
		if (value.length > this.remaining()) throw limited;
		let length = 0;
		for (let index = 0; index < value.length; index++) {
			const code = value.charCodeAt(index);
			if (code >= 0xd800 && code <= 0xdbff) {
				const next = value.charCodeAt(++index);
				if (!(next >= 0xdc00 && next <= 0xdfff)) throw invalid;
				length += 4;
			} else if (code >= 0xdc00 && code <= 0xdfff) throw invalid;
			else length += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
			this.ensure(length);
		}
		this.header(3, BigInt(length));
		this.ensure(length);
		const encoded = utf8.encodeInto(
			value,
			this.#bytes.subarray(this.#offset, this.#offset + length),
		);
		if (encoded.read !== value.length || encoded.written !== length)
			throw invalid;
		this.#offset += length;
	}

	private float(value: number, input: unknown): void {
		const view = bytes(input);
		if (
			!(
				(view.length === 3 && view[0] === 0xf9) ||
				(view.length === 5 && view[0] === 0xfa) ||
				(view.length === 9 && view[0] === 0xfb)
			)
		)
			throw invalid;
		this.ensure(view.length);
		const owned = view.slice();
		let decoded: CtapCborValue | undefined;
		try {
			decoded = decodeCtapCbor(owned);
			if (decoded.kind !== "float" || !Object.is(decoded.value, value))
				throw invalid;
			this.append(owned);
		} finally {
			owned.fill(0);
			if (decoded !== undefined) wipe(decoded);
		}
	}

	private map(entries: readonly unknown[], depth: number): void {
		const length = count(entries);
		if (length > Math.floor(this.remaining() / 2)) throw limited;
		this.header(5, BigInt(length));
		const start = this.#offset;
		const spans: EncodedEntry[] = [];
		for (let index = 0; index < length; index++) {
			const entry = array(item(entries, index));
			if (count(entry) !== 2) throw invalid;
			const entryStart = this.#offset;
			this.write(item(entry, 0), depth, true);
			const keyEnd = this.#offset;
			this.write(item(entry, 1), depth);
			spans.push({ start: entryStart, keyEnd, end: this.#offset });
		}
		spans.sort((left, right) => {
			const shared = Math.min(
				left.keyEnd - left.start,
				right.keyEnd - right.start,
			);
			for (let index = 0; index < shared; index++) {
				const difference =
					this.#bytes[left.start + index] - this.#bytes[right.start + index];
				if (difference !== 0) return difference;
			}
			return left.keyEnd - left.start - (right.keyEnd - right.start);
		});
		const owned = this.#bytes.slice(start, this.#offset);
		try {
			let destination = start;
			for (const span of spans) {
				const value = owned.subarray(span.start - start, span.end - start);
				this.#bytes.set(value, destination);
				destination += value.length;
			}
		} finally {
			owned.fill(0);
		}
	}
}

export function encodeCtapCbor(value: CtapCborValue): Uint8Array {
	const encoder = new CtapCborEncoder();
	let output: Uint8Array | undefined;
	try {
		encoder.write(value);
		output = encoder.finish();
		let decoded: CtapCborValue | undefined;
		try {
			decoded = decodeCtapCbor(output);
		} catch (error) {
			if (error instanceof AgentBrowserError && error.code === "resource-limit")
				throw limited;
			if (error instanceof AgentBrowserError && error.code === "unsupported")
				throw unsupported;
			throw invalid;
		} finally {
			if (decoded !== undefined) wipe(decoded);
		}
		return output;
	} catch (error) {
		output?.fill(0);
		if (error === limited)
			throw new AgentBrowserError(
				"resource-limit",
				"CTAP CBOR encoding limit exceeded.",
			);
		if (error === unsupported)
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported CTAP CBOR map key.",
			);
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid CTAP CBOR encoding input.",
		);
	} finally {
		encoder.close();
	}
}
