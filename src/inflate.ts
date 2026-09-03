import { AgentBrowserError } from "./errors.js";
import { adler32 } from "./image-checksums.js";

export const inflateLimits = Object.freeze({
	maxInputBytes: 33_554_432,
	maxOutputBytes: 33_600_000,
	maxWork: 268_435_456,
	maxBlocks: 65_536,
});
export interface InflateOptions {
	maxWork?: number;
}
export interface InflateResult {
	readonly bytes: Uint8Array;
	readonly work: number;
	readonly blocks: number;
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
const codeOrder = [
	16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

function invalid(message: string): never {
	throw new AgentBrowserError(
		"invalid-input",
		`Invalid zlib stream: ${message}`,
	);
}

class BitReader {
	position = 0;
	work = 0;
	constructor(
		readonly bytes: Uint8Array,
		readonly maxWork: number,
	) {}
	charge(amount: number) {
		this.work += amount;
		if (this.work > this.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Inflate work limit exceeded",
			);
	}
	read(count: number) {
		this.charge(1);
		if (this.position + count > this.bytes.length * 8)
			invalid("truncated bits");
		let result = 0;
		let written = 0;
		while (written < count) {
			const offset = this.position & 7;
			const take = Math.min(8 - offset, count - written);
			result |=
				((this.bytes[this.position >>> 3] >>> offset) & ((1 << take) - 1)) <<
				written;
			written += take;
			this.position += take;
		}
		return result;
	}
	align() {
		this.position = Math.ceil(this.position / 8) * 8;
	}
}

class Huffman {
	private readonly counts = new Uint16Array(16);
	private readonly first = new Uint16Array(16);
	private readonly offsets = new Uint16Array(16);
	private readonly symbols: Uint16Array;
	private maximum = 0;
	constructor(
		lengths: readonly number[],
		reader?: BitReader,
		complete = false,
	) {
		reader?.charge(lengths.length + 16);
		for (const length of lengths) {
			if (length) this.counts[length]++;
			this.maximum = Math.max(this.maximum, length);
		}
		let available = 1;
		let code = 0;
		let offset = 0;
		for (let length = 1; length <= 15; length++) {
			available = available * 2 - this.counts[length];
			if (available < 0) invalid("oversubscribed Huffman tree");
			code = (code + this.counts[length - 1]) * 2;
			this.first[length] = code;
			this.offsets[length] = offset;
			offset += this.counts[length];
		}
		if (available && (complete || this.maximum > 1))
			invalid("incomplete Huffman tree");
		this.symbols = new Uint16Array(offset);
		const next = this.offsets.slice();
		for (let symbol = 0; symbol < lengths.length; symbol++) {
			const length = lengths[symbol];
			if (length) this.symbols[next[length]++] = symbol;
		}
	}
	read(reader: BitReader) {
		let code = 0;
		for (let length = 1; length <= this.maximum; length++) {
			code = code * 2 + reader.read(1);
			const delta = code - this.first[length];
			if (delta >= 0 && delta < this.counts[length])
				return this.symbols[this.offsets[length] + delta];
		}
		return invalid("missing Huffman code");
	}
}

const fixedLiterals = new Huffman(
	Array.from({ length: 288 }, (_, symbol) =>
		symbol < 144 ? 8 : symbol < 256 ? 9 : symbol < 280 ? 7 : 8,
	),
);
const fixedDistances = new Huffman(Array.from({ length: 32 }, () => 5));

function dynamicTrees(reader: BitReader) {
	const literalCount = reader.read(5) + 257;
	const distanceCount = reader.read(5) + 1;
	const codeCount = reader.read(4) + 4;
	if (literalCount > 286) invalid("reserved literal count");
	const codeLengths = Array.from({ length: 19 }, () => 0);
	for (let index = 0; index < codeCount; index++)
		codeLengths[codeOrder[index]] = reader.read(3);
	const codes = new Huffman(codeLengths, reader, true);
	const lengths: number[] = [];
	while (lengths.length < literalCount + distanceCount) {
		const symbol = codes.read(reader);
		if (symbol < 16) lengths.push(symbol);
		else {
			if (symbol === 16 && lengths.length === 0)
				invalid("repeat without previous length");
			const repeated = symbol === 16 ? lengths[lengths.length - 1] : 0;
			const count =
				symbol === 16
					? reader.read(2) + 3
					: symbol === 17
						? reader.read(3) + 3
						: reader.read(7) + 11;
			if (lengths.length + count > literalCount + distanceCount)
				invalid("length repeat overflow");
			reader.charge(count);
			for (let index = 0; index < count; index++) lengths.push(repeated);
		}
	}
	if (!lengths[256]) invalid("missing end-of-block code");
	return [
		new Huffman(lengths.slice(0, literalCount), reader),
		new Huffman(lengths.slice(literalCount), reader),
	] as const;
}

export function inflateZlib(
	input: Uint8Array,
	expectedBytes: number,
	options: InflateOptions = {},
): Readonly<InflateResult> {
	if (
		!(input instanceof Uint8Array) ||
		!Number.isSafeInteger(expectedBytes) ||
		expectedBytes < 0 ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => key !== "maxWork")
	)
		throw new AgentBrowserError("invalid-input", "Invalid inflate arguments");
	if (
		input.length > inflateLimits.maxInputBytes ||
		expectedBytes > inflateLimits.maxOutputBytes
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Inflate byte limit exceeded",
		);
	const maxWork =
		options.maxWork === undefined ? inflateLimits.maxWork : options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > inflateLimits.maxWork
	)
		throw new AgentBrowserError("invalid-input", "Invalid inflate work limit");
	if (input.length < 6) invalid("truncated header");
	if (
		(input[0] & 15) !== 8 ||
		input[0] >>> 4 > 7 ||
		(input[0] * 256 + input[1]) % 31 !== 0
	)
		invalid("header");
	if (input[1] & 32)
		throw new AgentBrowserError(
			"unsupported",
			"Preset zlib dictionaries are unsupported",
		);
	const window = 1 << ((input[0] >>> 4) + 8);
	const reader = new BitReader(input.subarray(2, input.length - 4), maxWork);
	reader.charge(expectedBytes);
	const output = new Uint8Array(expectedBytes);
	let written = 0;
	let blocks = 0;
	let final = false;
	while (!final) {
		if (++blocks > inflateLimits.maxBlocks)
			throw new AgentBrowserError(
				"resource-limit",
				"Inflate block limit exceeded",
			);
		final = reader.read(1) !== 0;
		const type = reader.read(2);
		if (type === 3) invalid("reserved block type");
		if (type === 0) {
			reader.align();
			const length = reader.read(16);
			if ((length ^ reader.read(16)) !== 65535)
				invalid("stored length complement");
			if (written + length > expectedBytes)
				invalid("output exceeds expected length");
			const start = reader.position / 8;
			if (start + length > reader.bytes.length)
				invalid("truncated stored block");
			reader.charge(length);
			output.set(reader.bytes.subarray(start, start + length), written);
			written += length;
			reader.position += length * 8;
			continue;
		}
		const [literals, distances] =
			type === 1 ? [fixedLiterals, fixedDistances] : dynamicTrees(reader);
		for (;;) {
			const symbol = literals.read(reader);
			if (symbol === 256) break;
			if (symbol < 256) {
				if (written === expectedBytes)
					invalid("output exceeds expected length");
				output[written++] = symbol;
				continue;
			}
			if (symbol > 285) invalid("reserved length code");
			const length =
				lengthBases[symbol - 257] + reader.read(lengthExtras[symbol - 257]);
			const distanceCode = distances.read(reader);
			if (distanceCode > 29) invalid("reserved distance code");
			const distance =
				distanceBases[distanceCode] + reader.read(distanceExtras[distanceCode]);
			if (distance > written || distance > window)
				invalid("back-reference exceeds history window");
			if (written + length > expectedBytes)
				invalid("output exceeds expected length");
			reader.charge(length);
			for (let index = 0; index < length; index++) {
				output[written] = output[written - distance];
				written++;
			}
		}
	}
	reader.align();
	if (written !== expectedBytes || reader.position !== reader.bytes.length * 8)
		invalid("output length or trailing bytes");
	const checksum = new DataView(
		input.buffer,
		input.byteOffset + input.length - 4,
		4,
	).getUint32(0);
	reader.charge(output.length);
	if (adler32(output) !== checksum) invalid("Adler-32 checksum");
	return Object.freeze({ bytes: output, work: reader.work, blocks });
}
