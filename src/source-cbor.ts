import { AgentBrowserError } from "./errors.js";

export const sourceCborLimits = Object.freeze({
	maxBytes: 2_000_000,
	maxDepth: 64,
	maxValues: 100_000,
	maxStringBytes: 1_000_000,
	maxContainerEntries: 50_000,
});

export type SourceCborValue = Readonly<
	{ start: number; end: number } & (
		| { kind: "unsigned"; value: bigint }
		| { kind: "negative"; value: bigint }
		| { kind: "bytes"; value: Uint8Array }
		| { kind: "text"; value: string }
		| { kind: "array"; items: readonly SourceCborValue[] }
		| {
				kind: "map";
				entries: readonly (readonly [SourceCborValue, SourceCborValue])[];
		  }
		| { kind: "boolean"; value: boolean }
		| { kind: "null" }
	)
>;

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
const byteCadence = 4096;
const valueCadence = 256;

function invalidInput(): never {
	throw new AgentBrowserError("invalid-input", "Invalid source CBOR input.");
}

function limitExceeded(): never {
	throw new AgentBrowserError("resource-limit", "Source CBOR limit exceeded.");
}

function unsupported(): never {
	throw new AgentBrowserError("unsupported", "Unsupported source CBOR form.");
}

function snapshot(input: Uint8Array): Uint8Array {
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
	if (view.length > sourceCborLimits.maxBytes) limitExceeded();
	const bytes = new Uint8Array(view.length);
	bytes.set(view);
	return bytes;
}

class SourceCborDecoder {
	readonly #bytes: Uint8Array;
	readonly #checkpoint: (() => void) | undefined;
	#offset = 0;
	#values = 0;
	#byteWork = 0;

	constructor(bytes: Uint8Array, checkpoint: (() => void) | undefined) {
		this.#bytes = bytes;
		this.#checkpoint = checkpoint;
	}

	decode(): SourceCborValue {
		this.#checkpoint?.();
		const value = this.read(0);
		if (this.#offset !== this.#bytes.length) invalidInput();
		return value;
	}

	private work(length: number): void {
		this.#byteWork += length;
		if (this.#byteWork >= byteCadence) {
			this.#byteWork %= byteCadence;
			this.#checkpoint?.();
		}
	}

	private take(length: number): Uint8Array {
		if (length > this.#bytes.length - this.#offset) invalidInput();
		const bytes = this.#bytes.subarray(this.#offset, this.#offset + length);
		this.#offset += length;
		this.work(length);
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

	private length(argument: bigint, limit: number, divisor = 1): number {
		if (argument > BigInt(limit)) limitExceeded();
		const available = Math.floor((this.#bytes.length - this.#offset) / divisor);
		if (argument > BigInt(available)) invalidInput();
		return Number(argument);
	}

	private bytes(length: number): Uint8Array {
		const value = new Uint8Array(length);
		for (let offset = 0; offset < length; offset += byteCadence) {
			value.set(this.take(Math.min(byteCadence, length - offset)), offset);
		}
		return value;
	}

	private text(length: number): string {
		const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
		const chunks: string[] = [];
		for (let offset = 0; offset < length; offset += byteCadence) {
			const bytes = this.take(Math.min(byteCadence, length - offset));
			try {
				chunks.push(decoder.decode(bytes, { stream: true }));
			} catch {
				return invalidInput();
			}
		}
		try {
			chunks.push(decoder.decode());
		} catch {
			return invalidInput();
		}
		return chunks.join("");
	}

	private keyIdentity(key: SourceCborValue): string {
		switch (key.kind) {
			case "unsigned":
			case "negative":
				return `integer:${key.value}`;
			case "text":
				return `text:${key.value}`;
			case "boolean":
				return `boolean:${key.value}`;
			case "null":
				return "null";
			case "bytes": {
				let identity = "bytes:";
				for (const byte of key.value) {
					identity += byte.toString(16).padStart(2, "0");
					this.work(1);
				}
				return identity;
			}
			default:
				return unsupported();
		}
	}

	private simple(additional: number, start: number): SourceCborValue {
		if (additional === 20 || additional === 21)
			return {
				kind: "boolean",
				value: additional === 21,
				start,
				end: this.#offset,
			};
		if (additional === 22) return { kind: "null", start, end: this.#offset };
		if (additional === 24) {
			if (this.take(1)[0] < 32) invalidInput();
		} else if (additional >= 25 && additional <= 27) {
			this.take(2 ** (additional - 24));
		} else if (additional > 27) {
			invalidInput();
		}
		return unsupported();
	}

	private read(depth: number): SourceCborValue {
		if (++this.#values > sourceCborLimits.maxValues) limitExceeded();
		if (this.#values % valueCadence === 0) this.#checkpoint?.();
		const start = this.#offset;
		const header = this.take(1)[0];
		const major = header >>> 5;
		const additional = header & 31;
		if (major === 7) return this.simple(additional, start);
		if (additional === 31 && major >= 2 && major <= 5) unsupported();
		const argument = this.argument(additional);
		if (major === 6) unsupported();
		if (major === 0 || major === 1)
			return {
				kind: major === 0 ? "unsigned" : "negative",
				value: major === 0 ? argument : -1n - argument,
				start,
				end: this.#offset,
			};
		if (major === 2 || major === 3) {
			const length = this.length(argument, sourceCborLimits.maxStringBytes);
			if (major === 2)
				return {
					kind: "bytes",
					value: this.bytes(length),
					start,
					end: this.#offset,
				};
			return {
				kind: "text",
				value: this.text(length),
				start,
				end: this.#offset,
			};
		}
		if (depth >= sourceCborLimits.maxDepth) limitExceeded();
		const count = this.length(
			argument,
			sourceCborLimits.maxContainerEntries,
			major === 5 ? 2 : 1,
		);
		if (major === 4) {
			const items: SourceCborValue[] = [];
			for (let index = 0; index < count; index++)
				items.push(this.read(depth + 1));
			return { kind: "array", items, start, end: this.#offset };
		}
		const entries: [SourceCborValue, SourceCborValue][] = [];
		const seen = new Set<string>();
		for (let index = 0; index < count; index++) {
			const keyMajor = this.#bytes[this.#offset] >>> 5;
			if (keyMajor === 4 || keyMajor === 5) unsupported();
			const key = this.read(depth + 1);
			const identity = this.keyIdentity(key);
			if (seen.has(identity)) invalidInput();
			seen.add(identity);
			entries.push([key, this.read(depth + 1)]);
		}
		return { kind: "map", entries, start, end: this.#offset };
	}
}

export function decodeSourceCbor(
	input: Uint8Array,
	options: { checkpoint?: () => void } = {},
): SourceCborValue {
	let checkpoint: (() => void) | undefined;
	try {
		if (
			options === null ||
			typeof options !== "object" ||
			Array.isArray(options)
		)
			invalidInput();
		checkpoint = options.checkpoint;
	} catch {
		return invalidInput();
	}
	if (checkpoint !== undefined && typeof checkpoint !== "function")
		invalidInput();
	return new SourceCborDecoder(snapshot(input), checkpoint).decode();
}
