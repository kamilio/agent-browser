import { constants, deflateSync, inflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { compressZlib } from "./deflate.js";
import { adler32 } from "./image-checksums.js";
import { inflateLimits, inflateZlib } from "./inflate.js";

class Bits {
	readonly bytes: number[] = [];
	position = 0;
	write(value: number, count: number) {
		for (let index = 0; index < count; index++) {
			const offset = this.position >>> 3;
			this.bytes[offset] =
				(this.bytes[offset] ?? 0) |
				(((value >>> index) & 1) << (this.position & 7));
			this.position++;
		}
	}
	wrap(output = new Uint8Array()) {
		const result = Uint8Array.from([0x78, 0x01, ...this.bytes, 0, 0, 0, 0]);
		new DataView(result.buffer).setUint32(result.length - 4, adler32(output));
		return result;
	}
}

const fixtures = [
	new Uint8Array(),
	new Uint8Array([42]),
	new Uint8Array(100_000).fill(65),
	Uint8Array.from(
		{ length: 70000 },
		(_, index) => (index * 47 + (index >>> 6)) & 255,
	),
	new TextEncoder().encode(
		"the quick brown fox jumps over the lazy dog.\n".repeat(1000),
	),
];
for (const [mode, options] of [
	["stored", { level: 0 }],
	["fixed", { strategy: constants.Z_FIXED }],
	["dynamic", { level: 9 }],
] as const) {
	it.each(fixtures.map((bytes, index) => ({ bytes, index })))(
		`decodes independent ${mode} zlib fixture $index`,
		({ bytes }) => {
			const encoded = deflateSync(bytes, options);
			const result = inflateZlib(encoded, bytes.length);
			expect(result.bytes).toEqual(bytes);
			expect(result.blocks).toBeGreaterThan(0);
			expect(result.work).toBeLessThan(inflateLimits.maxWork);
			expect(Object.isFrozen(result)).toBe(true);
		},
	);
}

it("actually exercises a dynamic Huffman stream and independent fixed/stored encodings", () => {
	const source = fixtures[4];
	expect((deflateSync(source)[2] >>> 1) & 3).toBe(2);
	for (const compression of ["auto", "stored"] as const) {
		const encoded = compressZlib(source, { compression }).bytes;
		expect(inflateZlib(encoded, source.length).bytes).toEqual(source);
		expect(new Uint8Array(inflateSync(encoded))).toEqual(source);
	}
});

it("preserves multi-block history, overlap copies and nonzero input byte offsets", () => {
	const source = fixtures[3];
	const encoded = deflateSync(source, { level: 0 });
	const padded = new Uint8Array(encoded.length + 32);
	padded.set(encoded, 13);
	const result = inflateZlib(
		padded.subarray(13, 13 + encoded.length),
		source.length,
	);
	expect(result.blocks).toBeGreaterThan(1);
	expect(result.bytes).toEqual(source);
	expect(
		inflateZlib(deflateSync(fixtures[2]), fixtures[2].length).bytes,
	).toEqual(fixtures[2]);
});

it.each([false, true])(
	"accepts literal-only dynamic trees with no distance codes (empty=%s)",
	(empty) => {
		const bits = new Bits();
		bits.write(5, 3);
		bits.write(0, 5);
		bits.write(0, 5);
		bits.write(14, 4);
		for (const symbol of [
			16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1,
		])
			bits.write(symbol === 0 || symbol === 1 ? 1 : 0, 3);
		for (let symbol = 0; symbol < 258; symbol++)
			bits.write(symbol === 256 || (!empty && symbol === 65) ? 1 : 0, 1);
		if (!empty) bits.write(0, 1);
		bits.write(empty ? 0 : 1, 1);
		const source = empty ? new Uint8Array() : new Uint8Array([65]);
		const encoded = bits.wrap(source);
		expect(new Uint8Array(inflateSync(encoded))).toEqual(source);
		expect(inflateZlib(encoded, source.length).bytes).toEqual(source);
	},
);

it("rejects every truncation, corrupt checksums, trailing streams and output mismatches", () => {
	const source = fixtures[4];
	const encoded = new Uint8Array(deflateSync(source));
	for (let end = 0; end < encoded.length; end++)
		expect(() =>
			inflateZlib(encoded.subarray(0, end), source.length),
		).toThrow();
	const corrupt = encoded.slice();
	corrupt[corrupt.length - 1] ^= 1;
	expect(() => inflateZlib(corrupt, source.length)).toThrow(/Adler/);
	const trailing = new Uint8Array(encoded.length + 1);
	trailing.set(encoded.subarray(0, -4));
	trailing.set(encoded.subarray(-4), encoded.length - 3);
	expect(() => inflateZlib(trailing, source.length)).toThrow(/trailing/);
	expect(() => inflateZlib(encoded, source.length - 1)).toThrow(/exceeds/);
	expect(() => inflateZlib(encoded, source.length + 1)).toThrow(/length/);
});

it("validates headers, stored lengths and reserved blocks", () => {
	const encoded = new Uint8Array(deflateSync(fixtures[1], { level: 0 }));
	const header = encoded.slice();
	header[0] = 0;
	expect(() => inflateZlib(header, 1)).toThrow(/header/);
	const stored = encoded.slice();
	stored[5] ^= 1;
	expect(() => inflateZlib(stored, 1)).toThrow(/complement/);
	const reserved = new Bits();
	reserved.write(7, 3);
	expect(() => inflateZlib(reserved.wrap(), 0)).toThrow(/reserved block/);
	const dictionary = encoded.slice();
	dictionary[1] = 0x20;
	expect(() => inflateZlib(dictionary, 1)).toThrow(/dictionaries/);
});

it.each([
	"oversubscribed",
	"incomplete",
	"repeat overflow",
	"repeat without previous",
	"reserved literal",
])("rejects malformed dynamic trees: %s", (kind) => {
	const bits = new Bits();
	bits.write(5, 3);
	bits.write(kind === "reserved literal" ? 31 : 0, 5);
	bits.write(0, 5);
	bits.write(0, 4);
	if (kind === "oversubscribed")
		for (const length of [1, 1, 1, 0]) bits.write(length, 3);
	else if (kind === "incomplete")
		for (const length of [2, 0, 0, 0]) bits.write(length, 3);
	else if (kind === "repeat without previous") {
		for (const length of [1, 0, 0, 1]) bits.write(length, 3);
		bits.write(1, 1);
	} else {
		for (const length of [0, 0, 1, 1]) bits.write(length, 3);
		for (let index = 0; index < 2; index++) {
			bits.write(1, 1);
			bits.write(127, 7);
		}
	}
	expect(() => inflateZlib(bits.wrap(), 0)).toThrow();
});

it("rejects invalid fixed back-references and reserved symbols", () => {
	const distance = new Bits();
	distance.write(3, 3);
	distance.write(64, 7);
	distance.write(0, 5);
	expect(() => inflateZlib(distance.wrap(), 3)).toThrow(/history/);
	const reserved = new Bits();
	reserved.write(3, 3);
	reserved.write(99, 8);
	expect(() => inflateZlib(reserved.wrap(), 0)).toThrow(/reserved length/);
});

it("bounds output allocation, work, block count and option values", () => {
	const encoded = deflateSync(fixtures[2]);
	expect(() => inflateZlib(encoded, inflateLimits.maxOutputBytes + 1)).toThrow(
		/byte limit/,
	);
	expect(() =>
		inflateZlib(new Uint8Array(inflateLimits.maxInputBytes + 1), 0),
	).toThrow(/byte limit/);
	expect(() =>
		inflateZlib(encoded, fixtures[2].length, { maxWork: 100 }),
	).toThrow(/work limit/);
	for (const value of [-1, 0.5, Number.NaN])
		expect(() => inflateZlib(encoded, value)).toThrow(/arguments/);
	for (const maxWork of [0, -1, 1.5, Number.NaN, inflateLimits.maxWork + 1])
		expect(() => inflateZlib(encoded, 0, { maxWork })).toThrow(/work limit/);
	expect(() => inflateZlib(encoded, 0, { other: 1 } as never)).toThrow(
		/arguments/,
	);
	expect(() => inflateZlib(encoded, 0, { maxWork: null as never })).toThrow(
		/work limit/,
	);
	const blocks = new Uint8Array(2 + (inflateLimits.maxBlocks + 1) * 5 + 4);
	blocks.set([0x78, 0x01]);
	for (let index = 0; index <= inflateLimits.maxBlocks; index++)
		blocks.set(
			[index === inflateLimits.maxBlocks ? 1 : 0, 0, 0, 255, 255],
			2 + index * 5,
		);
	blocks[blocks.length - 1] = 1;
	expect(() => inflateZlib(blocks, 0)).toThrow(/block limit/);
});

it("cross-checks deterministically mutated streams against the independent native decoder", () => {
	const source = fixtures[4];
	const encoded = new Uint8Array(deflateSync(source));
	let state = 0x731ac9;
	for (let trial = 0; trial < 1000; trial++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		const mutated = encoded.slice();
		mutated[state % mutated.length] ^= 1 << (trial % 8);
		let decoded: Uint8Array;
		try {
			decoded = inflateZlib(mutated, source.length, {
				maxWork: 2_000_000,
			}).bytes;
		} catch (error) {
			expect(error).toMatchObject({ name: "AgentBrowserError" });
			continue;
		}
		expect(decoded).toEqual(new Uint8Array(inflateSync(mutated)));
	}
});
