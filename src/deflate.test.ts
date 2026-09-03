import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { type DeflateOptions, compressZlib, deflateLimits } from "./deflate.js";

function noise(length: number, seed = 0x12345678) {
	const bytes = new Uint8Array(length);
	let state = seed;
	for (let index = 0; index < length; index++) {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		bytes[index] = state & 255;
	}
	return bytes;
}
function verify(bytes: Uint8Array, options: DeflateOptions = {}) {
	const before = bytes.slice();
	const result = compressZlib(bytes, options);
	expect(inflateSync(result.bytes).equals(bytes)).toBe(true);
	expect(Buffer.from(bytes).equals(before)).toBe(true);
	expect(result.bytes.length).toBeLessThanOrEqual(
		bytes.length + Math.max(1, Math.ceil(bytes.length / 65535)) * 5 + 6,
	);
	expect(result.maximumDistance).toBeLessThanOrEqual(32768);
	expect(result.maximumMatch).toBeLessThanOrEqual(258);
	expect(result.work).toBeLessThanOrEqual(deflateLimits.maxWork);
	expect(Object.isFrozen(result)).toBe(true);
	return result;
}

it("emits independent known empty fixed and stored zlib streams", () => {
	expect([...verify(new Uint8Array()).bytes]).toEqual([
		120, 1, 3, 0, 0, 0, 0, 1,
	]);
	expect([
		...verify(new Uint8Array(), { compression: "stored" }).bytes,
	]).toEqual([120, 1, 1, 0, 0, 255, 255, 0, 0, 0, 1]);
});

it.each([
	1, 2, 3, 4, 10, 11, 18, 19, 34, 35, 66, 67, 130, 131, 257, 258, 259, 516,
	32768, 65535, 65536, 131071,
])(
	"encodes runs and high-entropy input of %s bytes without expansion beyond stored blocks",
	(length) => {
		const run = verify(new Uint8Array(length).fill(213));
		verify(noise(length));
		if (length >= 516) {
			expect(run.mode).toBe("fixed");
			expect(run.maximumMatch).toBe(258);
			expect(run.maximumDistance).toBe(1);
		}
	},
);

it.each([
	8, 9, 12, 13, 16, 17, 24, 25, 32, 33, 48, 49, 64, 65, 96, 97, 128, 129, 192,
	193, 256, 257, 384, 385, 512, 513, 768, 769, 1024, 1025, 1536, 1537, 2048,
	2049, 3072, 3073, 4096, 4097, 6144, 6145, 8192, 8193, 12288, 12289, 16384,
	16385, 24576, 24577, 32767, 32768,
])("round-trips a match at distance %s", (distance) => {
	const input = new Uint8Array(distance + 8);
	const marker = Uint8Array.from([23, 41, 59, 83, 109, 127, 149, 173]);
	input.set(marker);
	input.set(marker, distance);
	const result = verify(input);
	expect(result.maximumDistance).toBe(distance);
});

it("never emits an out-of-window reference", () => {
	const input = new Uint8Array(32777);
	const marker = Uint8Array.from([23, 41, 59, 83, 109, 127, 149, 173]);
	input.set(marker);
	input.set(marker, 32769);
	expect(verify(input).maximumDistance).toBeLessThanOrEqual(32768);
});

it("covers every literal code including high bytes and subarray offsets", () => {
	const input = Uint8Array.from({ length: 256 }, (_, index) => index);
	verify(input);
	const backing = new Uint8Array(1024).fill(99);
	backing.set(input, 17);
	verify(backing.subarray(17, 273));
});

it("falls back to stored blocks for incompressible data without retaining failed token metrics", () => {
	const result = verify(noise(100_000));
	expect(result).toMatchObject({
		mode: "stored",
		matches: 0,
		literals: 0,
		maximumDistance: 0,
		maximumMatch: 0,
	});
	expect(result.bytes[2] & 6).toBe(0);
});

it("checks deterministic mixed, repetitive and random fixtures against native inflate", () => {
	for (let seed = 1; seed <= 100; seed++) {
		const input = noise(seed * 73, seed);
		if (seed % 3 === 0)
			for (let index = 0; index < input.length; index++) input[index] %= 8;
		if (seed % 3 === 1)
			for (let index = 15; index < input.length; index++)
				input[index] = input[index % 15];
		const first = verify(input);
		expect(Buffer.from(compressZlib(input).bytes).equals(first.bytes)).toBe(
			true,
		);
	}
});

it("accepts the maximum PNG scanline input within the fixed work ceiling", () => {
	const input = new Uint8Array(deflateLimits.maxInputBytes).fill(255);
	const result = verify(input);
	expect(result.bytes.length).toBeLessThan(150_000);
	expect(result.work).toBeLessThan(input.length * 4);
});

it.each([
	null,
	{ compression: "dynamic" },
	{ maxWork: null },
	{ maxWork: 0 },
	{ maxWork: 1.5 },
	{ maxWork: deflateLimits.maxWork + 1 },
	{ unknown: true },
])("rejects invalid options %j", (options) => {
	expect(() =>
		compressZlib(new Uint8Array(8), options as DeflateOptions),
	).toThrow("Invalid DEFLATE");
});

it("rejects oversized input and work exhaustion without modifying input", () => {
	expect(() =>
		compressZlib(new Uint8Array(deflateLimits.maxInputBytes + 1)),
	).toThrow("Invalid DEFLATE input");
	expect(() => compressZlib([] as unknown as Uint8Array)).toThrow(
		"Invalid DEFLATE input",
	);
	const input = noise(1024);
	const before = input.slice();
	expect(() => compressZlib(input, { maxWork: 1 })).toThrow("work limit");
	expect(() =>
		compressZlib(input, { compression: "stored", maxWork: 1024 }),
	).toThrow("work limit");
	expect(Buffer.from(input).equals(before)).toBe(true);
	verify(input);
});
