import { AgentBrowserError } from "./errors.js";
import { adler32 } from "./image-checksums.js";

export const deflateLimits = Object.freeze({
	maxInputBytes: 16_781_312,
	maxWork: 128_000_000,
	windowBytes: 32768,
	maxMatchBytes: 258,
	hashEntries: 65536,
});
export interface DeflateOptions {
	compression?: "auto" | "stored";
	maxWork?: number;
}
export interface DeflateResult {
	bytes: Uint8Array;
	mode: "fixed" | "stored";
	work: number;
	literals: number;
	matches: number;
	maximumDistance: number;
	maximumMatch: number;
}

const lengthBases = [
	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
	83, 99, 115, 131, 163, 195, 227, 258,
];
const lengthExtras = [
	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
	5, 5, 0,
];
const distanceBases = [
	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
	1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const distanceExtras = [
	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
	11, 12, 12, 13, 13,
];
const lengthIndices = new Uint8Array(259);
const distanceIndices = new Uint8Array(32769);
for (let index = 0; index < lengthBases.length; index++)
	lengthIndices.fill(index, lengthBases[index], lengthBases[index + 1] ?? 259);
for (let index = 0; index < distanceBases.length; index++)
	distanceIndices.fill(
		index,
		distanceBases[index],
		distanceBases[index + 1] ?? 32769,
	);

function reverseBits(value: number, count: number) {
	let reversed = 0;
	for (let index = 0; index < count; index++) {
		reversed = (reversed << 1) | ((value >>> index) & 1);
	}
	return reversed;
}
const fixedCodes = new Uint16Array(288);
const fixedBits = new Uint8Array(288);
for (let symbol = 0; symbol < 288; symbol++) {
	const bits = symbol < 144 ? 8 : symbol < 256 ? 9 : symbol < 280 ? 7 : 8;
	const code =
		symbol < 144
			? 48 + symbol
			: symbol < 256
				? 400 + symbol - 144
				: symbol < 280
					? symbol - 256
					: 192 + symbol - 280;
	fixedCodes[symbol] = reverseBits(code, bits);
	fixedBits[symbol] = bits;
}
const distanceCodes = Uint8Array.from({ length: 30 }, (_, index) =>
	reverseBits(index, 5),
);

function stored(bytes: Uint8Array, checksum: number) {
	const blocks = Math.max(1, Math.ceil(bytes.length / 65535));
	const result = new Uint8Array(6 + blocks * 5 + bytes.length);
	result.set([0x78, 0x01]);
	let cursor = 2;
	for (let block = 0; block < blocks; block++) {
		const offset = block * 65535;
		const size = Math.min(65535, bytes.length - offset);
		result[cursor++] = block === blocks - 1 ? 1 : 0;
		result[cursor++] = size & 255;
		result[cursor++] = size >>> 8;
		result[cursor++] = ~size & 255;
		result[cursor++] = (~size >>> 8) & 255;
		result.set(bytes.subarray(offset, offset + size), cursor);
		cursor += size;
	}
	new DataView(result.buffer).setUint32(cursor, checksum);
	return result;
}

class BitWriter {
	private bytes: Uint8Array;
	private cursor = 2;
	private pending = 0;
	private bits = 0;
	overflow = false;
	constructor(private readonly limit: number) {
		this.bytes = new Uint8Array(Math.min(16384, limit));
		this.bytes.set([0x78, 0x01]);
	}
	private byte(value: number) {
		if (this.cursor >= this.limit) {
			this.overflow = true;
			return;
		}
		if (this.cursor === this.bytes.length) {
			const grown = new Uint8Array(Math.min(this.limit, this.bytes.length * 2));
			grown.set(this.bytes);
			this.bytes = grown;
		}
		this.bytes[this.cursor++] = value;
	}
	write(value: number, count: number) {
		this.pending |= value << this.bits;
		this.bits += count;
		while (this.bits >= 8) {
			this.byte(this.pending & 255);
			this.pending >>>= 8;
			this.bits -= 8;
		}
	}
	finish(checksum: number): Uint8Array | undefined {
		if (this.bits) this.byte(this.pending & 255);
		for (const shift of [24, 16, 8, 0]) this.byte((checksum >>> shift) & 255);
		return this.overflow ? undefined : this.bytes.slice(0, this.cursor);
	}
}

export function compressZlib(
	bytes: Uint8Array,
	options: DeflateOptions = {},
): Readonly<DeflateResult> {
	if (
		!(bytes instanceof Uint8Array) ||
		bytes.length > deflateLimits.maxInputBytes
	)
		throw new AgentBrowserError("invalid-input", "Invalid DEFLATE input");
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some(
			(key) => !["compression", "maxWork"].includes(key),
		) ||
		(options.compression !== undefined &&
			!["auto", "stored"].includes(options.compression))
	)
		throw new AgentBrowserError("invalid-input", "Invalid DEFLATE options");
	const limit =
		options.maxWork === undefined ? deflateLimits.maxWork : options.maxWork;
	if (
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > deflateLimits.maxWork
	)
		throw new AgentBrowserError("invalid-input", "Invalid DEFLATE work limit");
	let work = 0;
	let literals = 0;
	let matches = 0;
	let maximumDistance = 0;
	let maximumMatch = 0;
	const charge = (amount = 1) => {
		work += amount;
		if (work > limit)
			throw new AgentBrowserError(
				"resource-limit",
				"DEFLATE work limit exceeded",
			);
	};
	charge(bytes.length);
	const checksum = adler32(bytes);
	const asStored = () => {
		charge(bytes.length);
		return Object.freeze({
			bytes: stored(bytes, checksum),
			mode: "stored" as const,
			work,
			literals: 0,
			matches: 0,
			maximumDistance: 0,
			maximumMatch: 0,
		});
	};
	if (options.compression === "stored") return asStored();
	const maximumStored =
		6 + Math.max(1, Math.ceil(bytes.length / 65535)) * 5 + bytes.length;
	const writer = new BitWriter(maximumStored - 1);
	const table = new Int32Array(deflateLimits.hashEntries);
	table.fill(-1);
	const hash = (position: number) =>
		((bytes[position] * 251 + bytes[position + 1]) * 251 +
			bytes[position + 2]) &
		65535;
	const symbol = (value: number) => {
		charge();
		writer.write(fixedCodes[value], fixedBits[value]);
	};
	writer.write(3, 3);
	let position = 0;
	while (position < bytes.length && !writer.overflow) {
		let length = 0;
		let distance = 0;
		if (position + 2 < bytes.length) {
			charge();
			const key = hash(position);
			const candidate = table[key];
			table[key] = position;
			if (candidate >= 0 && position - candidate <= deflateLimits.windowBytes) {
				const maximum = Math.min(
					deflateLimits.maxMatchBytes,
					bytes.length - position,
				);
				while (length < maximum) {
					charge();
					if (bytes[candidate + length] !== bytes[position + length]) break;
					length++;
				}
				if (length >= 3) distance = position - candidate;
			}
		}
		if (length >= 3) {
			const lengthIndex = lengthIndices[length];
			const distanceIndex = distanceIndices[distance];
			symbol(257 + lengthIndex);
			writer.write(
				length - lengthBases[lengthIndex],
				lengthExtras[lengthIndex],
			);
			charge();
			writer.write(distanceCodes[distanceIndex], 5);
			writer.write(
				distance - distanceBases[distanceIndex],
				distanceExtras[distanceIndex],
			);
			for (
				let offset = 1;
				offset < length && position + offset + 2 < bytes.length;
				offset++
			) {
				charge();
				table[hash(position + offset)] = position + offset;
			}
			position += length;
			matches++;
			maximumDistance = Math.max(maximumDistance, distance);
			maximumMatch = Math.max(maximumMatch, length);
		} else {
			symbol(bytes[position++]);
			literals++;
		}
	}
	if (writer.overflow) return asStored();
	symbol(256);
	const compressed = writer.finish(checksum);
	if (!compressed) return asStored();
	return Object.freeze({
		bytes: compressed,
		mode: "fixed" as const,
		work,
		literals,
		matches,
		maximumDistance,
		maximumMatch,
	});
}
