import { expect, it } from "vitest";
import { jpegFixtures } from "../scripts/jpeg-fixtures.js";
import { AgentBrowserError } from "./errors.js";
import { decodeJpeg, jpegDecodeLimits } from "./jpeg-decoder.js";

const bytes = (...parts: (number[] | Uint8Array)[]) =>
	Uint8Array.from(parts.flatMap((part) => [...part]));
function segment(marker: number, data: number[]) {
	return [
		255,
		marker,
		(data.length + 2) >> 8,
		(data.length + 2) & 255,
		...data,
	];
}
function entropy(bits: string) {
	const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, "1");
	const output: number[] = [];
	for (let index = 0; index < padded.length; index += 8) {
		const value = Number.parseInt(padded.slice(index, index + 8), 2);
		output.push(value);
		if (value === 255) output.push(0);
	}
	return output;
}
const quantization = segment(0xdb, [0, ...Array<number>(64).fill(8)]);
const huffman = (selector: number, symbol: number) =>
	segment(0xc4, [selector, 1, ...Array<number>(15).fill(0), symbol]);
const frame = (width = 3, height = 2, mode = 0xc0) =>
	segment(mode, [
		8,
		height >> 8,
		height & 255,
		width >> 8,
		width & 255,
		1,
		1,
		0x11,
		0,
	]);
const scan = (start = 0, end = 63, approximation = 0) =>
	segment(0xda, [1, 1, 0, start, end, approximation]);
function constant(
	options: {
		width?: number;
		height?: number;
		value?: number;
		restart?: boolean;
		mode?: number;
	} = {},
) {
	const width = options.width ?? 3;
	const height = options.height ?? 2;
	const difference = (options.value ?? 128) - 128;
	const category = difference
		? Math.floor(Math.log2(Math.abs(difference))) + 1
		: 0;
	const amplitude = category
		? (difference < 0 ? difference + 2 ** category - 1 : difference)
				.toString(2)
				.padStart(category, "0")
		: "";
	const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
	const encoded: number[] = [];
	if (options.restart) {
		for (let index = 0; index < blocks; index++) {
			if (index) encoded.push(255, 0xd0 + ((index - 1) % 8));
			encoded.push(...entropy(`0${amplitude}0`));
		}
	} else encoded.push(...entropy(`0${amplitude}0`.repeat(blocks)));
	return bytes(
		[255, 0xd8],
		quantization,
		frame(width, height, options.mode),
		huffman(0, category),
		huffman(16, 0),
		options.restart ? segment(0xdd, [0, 1]) : [],
		scan(),
		encoded,
		[255, 0xd9],
	);
}

it.each(jpegFixtures)(
	"decodes independent baseline/progressive pixels: $name",
	(fixture) => {
		const input = Buffer.from(fixture.jpeg, "base64");
		const expected = Buffer.from(fixture.rgba, "base64");
		const result = decodeJpeg(input);
		expect(result.image.width).toBe(fixture.width);
		expect(result.image.height).toBe(fixture.height);
		expect(result.progressive).toBe(fixture.progressive);
		expect(result.colorSpace).toBe(fixture.colorSpace);
		expect(result.restartMarkers).toBe(
			input.reduce(
				(total, value, index) =>
					total +
					(value === 255 && input[index + 1] >= 0xd0 && input[index + 1] <= 0xd7
						? 1
						: 0),
				0,
			),
		);
		expect(result.image.pixels.length).toBe(expected.length);
		let maximum = 0;
		for (let index = 0; index < expected.length; index++)
			maximum = Math.max(
				maximum,
				Math.abs(result.image.pixels[index] - expected[index]),
			);
		expect(maximum).toBeLessThanOrEqual(fixture.maximumError);
		expect(
			Object.isFrozen(result) &&
				Object.isFrozen(result.image) &&
				Object.isFrozen(result.ignoredAppMarkers),
		).toBe(true);
		expect(Number.isSafeInteger(result.work)).toBe(true);
	},
);

it("reconstructs the same coefficients from sequential and progressive scans", () => {
	for (const first of jpegFixtures.filter((entry) => !entry.progressive)) {
		const second = jpegFixtures.find(
			(entry) => entry.name === first.name.replace("-p0-", "-p1-"),
		);
		if (!second) throw new Error("Missing independent progressive pair");
		expect(decodeJpeg(Buffer.from(first.jpeg, "base64")).image.pixels).toEqual(
			decodeJpeg(Buffer.from(second.jpeg, "base64")).image.pixels,
		);
	}
});

it("includes bounded chroma row caches in decoder working-buffer preflight", () => {
	const fixture = jpegFixtures.find(
		(entry) => entry.name === "RGB-17x13-q80-s2-p0-r2.jpg",
	);
	if (!fixture) throw new Error("Missing subsampled JPEG fixture");
	const input = Buffer.from(fixture.jpeg, "base64");
	const result = decodeJpeg(input);
	expect(result.workingBytes).toBe(16384 + 3840 + 2 * 33 * 17);
	expect(() =>
		decodeJpeg(input, { maxWorkingBytes: result.workingBytes - 1 }),
	).toThrow(/working buffer/);
});

it.each([0, 1, 64, 127, 128, 129, 192, 254, 255])(
	"decodes independently calculable grayscale DC value %s",
	(value) => {
		const result = decodeJpeg(constant({ value }));
		expect([...result.image.pixels]).toEqual(
			Array.from({ length: 6 }, () => [value, value, value, 255]).flat(),
		);
	},
);

it.each([
	[1, 1],
	[7, 9],
	[17, 13],
	[31, 23],
	[3, 65],
])("crops padded grayscale blocks to %s by %s", (width, height) => {
	const result = decodeJpeg(constant({ width, height }));
	expect(result.image.pixels.length).toBe(width * height * 4);
	expect(
		result.image.pixels.every(
			(value, index) => value === (index % 4 === 3 ? 255 : 128),
		),
	).toBe(true);
});

it("resets predictors and consumes cyclic restart markers at exact MCU boundaries", () => {
	const result = decodeJpeg(
		constant({ width: 80, height: 8, restart: true, value: 64 }),
	);
	expect(result.restartMarkers).toBe(9);
	expect(
		result.image.pixels.every(
			(value, index) => value === (index % 4 === 3 ? 255 : 64),
		),
	).toBe(true);
});

it.each([false, true])(
	"refines positive and negative DC coefficients using signed bit representation (%s)",
	(negative) => {
		const input = bytes(
			[255, 0xd8],
			quantization,
			frame(3, 2, 0xc2),
			huffman(0, negative ? 1 : 0),
			scan(0, 0, 1),
			entropy(negative ? "00" : "0"),
			scan(0, 0, 0x10),
			entropy("1"),
			[255, 0xd9],
		);
		const result = decodeJpeg(input);
		expect(result.scans).toBe(2);
		expect(result.image.pixels[0]).toBe(negative ? 127 : 129);
	},
);

it.each([false, true])(
	"refines positive and negative AC magnitudes without changing their sign (%s)",
	(negative) => {
		const input = bytes(
			[255, 0xd8],
			quantization,
			frame(8, 8, 0xc2),
			huffman(0, 0),
			huffman(16, 1),
			scan(0, 0),
			entropy("0"),
			scan(1, 1, 1),
			entropy(negative ? "00" : "01"),
			huffman(16, 0),
			scan(1, 1, 0x10),
			entropy("01"),
			[255, 0xd9],
		);
		const result = decodeJpeg(input);
		for (let row = 0; row < 8; row++)
			for (let column = 0; column < 8; column++) {
				const expected = Math.round(
					128 +
						(((negative ? -3 : 3) * 8 * Math.SQRT1_2) / 4) *
							Math.cos(((2 * column + 1) * Math.PI) / 16),
				);
				expect(result.image.pixels[(row * 8 + column) * 4]).toBe(expected);
			}
	},
);

it("accepts extended sequential 8-bit frames and 16-bit quantization tables", () => {
	const table = segment(0xdb, [
		16,
		...Array.from({ length: 64 }, () => [0, 8]).flat(),
	]);
	const input = bytes(
		[255, 0xd8],
		table,
		frame(3, 2, 0xc1),
		huffman(0, 0),
		huffman(16, 0),
		scan(),
		entropy("00"),
		[255, 0xd9],
	);
	expect(decodeJpeg(input).image.pixels[0]).toBe(128);
	const invalidInput = input.slice();
	invalidInput[table.length + 3] = 0xc0;
	expect(() => decodeJpeg(invalidInput)).toThrow(/baseline quantization/);
});

it("skips and reports bounded application metadata without interpreting EXIF or profiles", () => {
	const base = constant();
	const input = bytes(
		base.subarray(0, 2),
		segment(0xe1, [69, 120, 105, 102, 0, 0]),
		segment(0xe2, [73, 67, 67]),
		segment(0xfe, [104, 105]),
		base.subarray(2),
	);
	const result = decodeJpeg(input);
	expect(result.ignoredAppMarkers).toEqual(["APP1", "APP2", "COM"]);
	expect(result.image.pixels).toEqual(decodeJpeg(base).image.pixels);
});

it("accepts marker fill bytes without accepting stuffed entropy outside a scan", () => {
	const input = constant();
	expect(
		decodeJpeg(bytes(input.subarray(0, 2), [255, 255], input.subarray(2))).image
			.width,
	).toBe(3);
	expect(() =>
		decodeJpeg(bytes(input.subarray(0, 2), [255, 0], input.subarray(2))),
	).toThrow();
});

it("rejects every truncated prefix of a complete independent progressive JPEG", () => {
	const fixture = jpegFixtures.find(
		(entry) => entry.progressive && entry.colorSpace === "grayscale",
	);
	if (!fixture) throw new Error("Missing JPEG");
	const input = Buffer.from(fixture.jpeg, "base64");
	for (let length = 0; length < input.length; length++)
		expect(() => decodeJpeg(input.subarray(0, length))).toThrow(
			AgentBrowserError,
		);
});

it.each([
	[
		"missing tables",
		bytes([255, 0xd8], frame(), scan(), entropy("00"), [255, 0xd9]),
	],
	["missing scans", bytes([255, 0xd8], frame(), [255, 0xd9])],
	["empty table", bytes([255, 0xd8], segment(0xc4, []), [255, 0xd9])],
	[
		"all-ones code",
		bytes(
			[255, 0xd8],
			segment(0xc4, [0, 2, ...Array<number>(15).fill(0), 0, 1]),
			[255, 0xd9],
		),
	],
	[
		"zero quantizer",
		bytes(
			[255, 0xd8],
			segment(0xdb, [0, ...Array<number>(64).fill(0)]),
			[255, 0xd9],
		),
	],
	["unknown marker", bytes([255, 0xd8], segment(0xcc, [0, 0]), [255, 0xd9])],
	["multiple frame", bytes([255, 0xd8], frame(), frame(), [255, 0xd9])],
	["no image", bytes([255, 0xd8, 255, 0xd9])],
	["trailing bytes", bytes(constant(), [0])],
	["wrong segment length", bytes([255, 0xd8, 255, 0xdb, 0, 1, 255, 0xd9])],
	["standalone restart", bytes([255, 0xd8, 255, 0xd0, 255, 0xd9])],
])("rejects malformed structure: %s", (_label, input) => {
	expect(() => decodeJpeg(input as Uint8Array)).toThrow(AgentBrowserError);
});

it.each([12, 15, 255])("rejects impossible DC categories %s", (symbol) => {
	expect(() =>
		decodeJpeg(
			bytes(
				[255, 0xd8],
				quantization,
				frame(),
				huffman(0, symbol),
				huffman(16, 0),
				scan(),
				entropy("00"),
				[255, 0xd9],
			),
		),
	).toThrow(/DC magnitude/);
});

it.each([11, 16, 255])(
	"rejects impossible sequential AC symbols %s",
	(symbol) => {
		expect(() =>
			decodeJpeg(
				bytes(
					[255, 0xd8],
					quantization,
					frame(),
					huffman(0, 0),
					huffman(16, symbol),
					scan(),
					entropy("00"),
					[255, 0xd9],
				),
			),
		).toThrow(AgentBrowserError);
	},
);

it("rejects duplicate scans and invalid approximation order", () => {
	const prefix = bytes(
		[255, 0xd8],
		quantization,
		frame(3, 2, 0xc2),
		huffman(0, 0),
	);
	expect(() =>
		decodeJpeg(
			bytes(
				prefix,
				scan(0, 0),
				entropy("0"),
				scan(0, 0),
				entropy("0"),
				[255, 0xd9],
			),
		),
	).toThrow(/duplicate/);
	expect(() =>
		decodeJpeg(bytes(prefix, scan(0, 0, 0x10), entropy("1"), [255, 0xd9])),
	).toThrow(/out-of-order/);
	expect(() =>
		decodeJpeg(bytes(prefix, scan(1, 1), entropy("0"), [255, 0xd9])),
	).toThrow(/precedes DC/);
});

it("rejects EOB runs crossing scan and restart bounds", () => {
	const prefix = bytes(
		[255, 0xd8],
		quantization,
		frame(3, 2, 0xc2),
		huffman(0, 0),
		huffman(16, 16),
		scan(0, 0),
		entropy("0"),
	);
	expect(() =>
		decodeJpeg(bytes(prefix, scan(1, 63), entropy("00"), [255, 0xd9])),
	).toThrow(/EOB run exceeds scan/);
	const restarted = bytes(
		[255, 0xd8],
		quantization,
		frame(16, 8, 0xc2),
		huffman(0, 0),
		huffman(16, 16),
		segment(0xdd, [0, 1]),
		scan(0, 0),
		entropy("0"),
		[255, 0xd0],
		entropy("0"),
		scan(1, 63),
		entropy("00"),
		[255, 0xd0],
		entropy("0"),
		[255, 0xd9],
	);
	expect(() => decodeJpeg(restarted)).toThrow(/EOB run crosses restart/);
});

it.each([false, true])(
	"decodes component-separated and interleaved subsampled sequential scans (%s)",
	(interleaved) => {
		const rgbFrame = segment(
			0xc0,
			[8, 0, 13, 0, 17, 3, 1, 0x22, 0, 2, 0x11, 0, 3, 0x11, 0],
		);
		const scans = interleaved
			? bytes(
					segment(0xda, [3, 1, 0, 2, 0, 3, 0, 0, 63, 0]),
					entropy("00".repeat(12)),
				)
			: bytes(
					...[1, 2, 3].flatMap((id) => [
						segment(0xda, [1, id, 0, 0, 63, 0]),
						entropy("00".repeat(id === 1 ? 6 : 2)),
					]),
				);
		const input = bytes(
			[255, 0xd8],
			quantization,
			rgbFrame,
			huffman(0, 0),
			huffman(16, 0),
			scans,
			[255, 0xd9],
		);
		const result = decodeJpeg(input);
		expect(result.scans).toBe(interleaved ? 1 : 3);
		expect(
			result.image.pixels.every(
				(value, index) => value === (index % 4 === 3 ? 255 : 128),
			),
		).toBe(true);
	},
);

it("rejects missing, misnumbered and prematurely inserted restart markers", () => {
	const input = constant({ width: 24, height: 8, restart: true });
	const index = input.findIndex(
		(value, offset) => value === 255 && input[offset + 1] === 0xd0,
	);
	const wrong = input.slice();
	wrong[index + 1] = 0xd3;
	expect(() => decodeJpeg(wrong)).toThrow(/restart marker sequence/);
	expect(() =>
		decodeJpeg(bytes(input.subarray(0, index), input.subarray(index + 2))),
	).toThrow(/missing restart/);
	const premature = constant();
	premature[premature.length - 3] = 255;
	expect(() => decodeJpeg(premature)).toThrow(/premature entropy/);
});

it("requires one-bit entropy padding rather than silently accepting extra zero data", () => {
	const input = constant();
	input[input.length - 3] = 0;
	expect(() => decodeJpeg(input)).toThrow(/padding/);
});

it("bounds input, pixels, working buffers and work before expensive reconstruction", () => {
	expect(() =>
		decodeJpeg(new Uint8Array(jpegDecodeLimits.maxInputBytes + 1)),
	).toThrow(/input byte limit/);
	expect(() => decodeJpeg(constant(), { maxPixels: 5 })).toThrow(/pixel limit/);
	expect(() => decodeJpeg(constant(), { maxWorkingBytes: 16384 })).toThrow(
		/working buffer/,
	);
	expect(() => decodeJpeg(constant(), { maxWorkingBytes: 1 })).toThrow(
		/working buffer/,
	);
	expect(() => decodeJpeg(constant(), { maxWork: 1 })).toThrow(/work limit/);
	expect(() =>
		decodeJpeg(bytes([255, 0xd8], frame(4096, 4096), [255, 0xd9])),
	).toThrow(/pixel limit/);
});

it.each([
	{ maxWork: 0 },
	{ maxPixels: 4_194_305 },
	{ maxWorkingBytes: -1 },
	{ unknown: 1 },
	{ maxPixels: Number.NaN },
	{ maxWork: 0.5 },
])("rejects invalid decoder limit %j", (options) => {
	expect(() => decodeJpeg(constant(), options)).toThrow(/decode limit/);
});

it("bounds metadata segment and progressive scan counts", () => {
	const metadata = bytes(
		[255, 0xd8],
		Array.from({ length: 4097 }, () => segment(0xfe, [])).flat(),
		constant().subarray(2),
	);
	expect(() => decodeJpeg(metadata)).toThrow(/segment limit/);
	const scans: number[] = [];
	for (let spectral = 1; spectral <= 20; spectral++)
		for (let low = 13; low >= 0; low--)
			scans.push(
				...scan(spectral, spectral, low === 13 ? 13 : (low + 1) * 16 + low),
				...entropy("0"),
			);
	const input = bytes(
		[255, 0xd8],
		quantization,
		frame(3, 2, 0xc2),
		huffman(0, 0),
		huffman(16, 0),
		scan(0, 0),
		entropy("0"),
		scans,
		[255, 0xd9],
	);
	expect(() => decodeJpeg(input)).toThrow(/scan limit/);
});

it("keeps deterministic malformed-input mutations bounded and returns only typed failures", () => {
	const input = Buffer.from(jpegFixtures[0].jpeg, "base64");
	let state = 731;
	for (let attempt = 0; attempt < 1000; attempt++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		const changed = Uint8Array.from(input);
		changed[state % changed.length] ^= 1 << (state % 8);
		try {
			const result = decodeJpeg(changed, {
				maxWork: 2_000_000,
				maxPixels: 1024,
				maxWorkingBytes: 1_048_576,
			});
			expect(result.work).toBeLessThanOrEqual(2_000_000);
			expect(result.image.pixels.length).toBe(
				result.image.width * result.image.height * 4,
			);
		} catch (error) {
			expect(error).toBeInstanceOf(AgentBrowserError);
		}
	}
});
