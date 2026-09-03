import { deflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { pngChunk, pngChunks, pngFixture } from "../scripts/png-fixtures.js";
import { adler32, crc32 } from "./image-checksums.js";
import { decodePng, pngDecodeLimits } from "./png-decoder.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";

const formats = [
	[0, 1],
	[0, 2],
	[0, 4],
	[0, 8],
	[0, 16],
	[2, 8],
	[2, 16],
	[3, 1],
	[3, 2],
	[3, 4],
	[3, 8],
	[4, 8],
	[4, 16],
	[6, 8],
	[6, 16],
];
for (const interlaced of [false, true])
	for (const filter of [0, 1, 2, 3, 4])
		it.each(formats)(
			`decodes color=%i depth=%i interlace=${interlaced} filter=${filter}`,
			(color, depth) => {
				const channels =
					color === 0 || color === 3
						? 1
						: color === 2
							? 3
							: color === 4
								? 2
								: 4;
				const maximum = 2 ** depth - 1;
				const samples = Array.from(
					{ length: 9 * 7 * channels },
					(_, index) => (index * 173 + (index >>> 2) * 7919) % (maximum + 1),
				);
				const palette =
					color === 3
						? Array.from(
								{ length: (maximum + 1) * 3 },
								(_, index) => (index * 43) & 255,
							)
						: undefined;
				const transparency = color === 3 ? [31, 167] : undefined;
				const fixture = pngFixture({
					width: 9,
					height: 7,
					color,
					depth,
					samples,
					palette,
					transparency,
					filter,
					interlaced,
				});
				const result = decodePng(fixture.bytes);
				const expected: number[] = [];
				for (let index = 0; index < samples.length; index += channels) {
					const byte = (offset: number) =>
						Math.round((samples[index + offset] * 255) / maximum);
					if (color === 3) {
						if (!palette) throw new Error("Missing fixture palette");
						const entry = samples[index];
						expected.push(
							...palette.slice(entry * 3, entry * 3 + 3),
							transparency?.[entry] ?? 255,
						);
					} else if (color === 0 || color === 4)
						expected.push(
							byte(0),
							byte(0),
							byte(0),
							color === 4 ? byte(1) : 255,
						);
					else
						expected.push(
							byte(0),
							byte(1),
							byte(2),
							color === 6 ? byte(3) : 255,
						);
				}
				expect(result.image).toMatchObject({ width: 9, height: 7 });
				expect([...result.image.pixels]).toEqual(expected);
				expect(result).toMatchObject({
					colorType: color,
					bitDepth: depth,
					interlaced,
				});
				expect(result.ignoredAncillaryChunks).toEqual([]);
				expect(result.inflatedBytes).toBe(fixture.raw.length);
			},
		);

it.each([
	[1, 1],
	[1, 9],
	[9, 1],
	[2, 3],
	[3, 2],
])("skips empty Adam7 passes in %i by %i images", (width, height) => {
	const samples = Array.from(
		{ length: width * height * 4 },
		(_, index) => (index * 53) & 255,
	);
	const result = decodePng(
		pngFixture({
			width,
			height,
			depth: 8,
			color: 6,
			samples,
			interlaced: true,
			filter: 4,
		}).bytes,
	);
	expect([...result.image.pixels]).toEqual(samples);
});

it.each([0, 2])(
	"compares full 16-bit tRNS samples before byte conversion for color %i",
	(color) => {
		const samples =
			color === 0
				? [0x1234, 0x1235]
				: [0x1234, 0x5678, 0x9abc, 0x1235, 0x5678, 0x9abc];
		const transparency =
			color === 0 ? [0x12, 0x34] : [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc];
		const result = decodePng(
			pngFixture({
				width: 2,
				height: 1,
				depth: 16,
				color,
				samples,
				transparency,
			}).bytes,
		);
		expect(result.image.pixels[0]).toBe(result.image.pixels[4]);
		expect(result.image.pixels[3]).toBe(0);
		expect(result.image.pixels[7]).toBe(255);
	},
);

it("round-trips native captures without sharing the input or output buffers", () => {
	const image = createRaster(47, 31);
	for (let index = 0; index < image.pixels.length; index++)
		image.pixels[index] = (index * 79 + (index >>> 7)) & 255;
	for (const compression of ["auto", "stored"] as const) {
		const encoded = encodePng(image, { compression });
		const padded = new Uint8Array(encoded.length + 20);
		padded.set(encoded, 7);
		const decoded = decodePng(padded.subarray(7, encoded.length + 7));
		expect(decoded.image.pixels).toEqual(image.pixels);
		expect(Object.isFrozen(decoded)).toBe(true);
		expect(Object.isFrozen(decoded.image)).toBe(true);
		padded.fill(0);
		decoded.image.pixels[0] = 99;
		expect(image.pixels[0]).toBe(0);
	}
});

const base = () =>
	pngFixture({
		width: 2,
		height: 2,
		color: 6,
		depth: 8,
		samples: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
	});

it("joins consecutive IDAT chunks even across zlib headers and checksums", () => {
	const fixture = base();
	const compressed = fixture.chunks[1].subarray(8, -4);
	const chunks = [
		fixture.chunks[0],
		pngChunk("IDAT", new Uint8Array()),
		...[...compressed].map((byte) => pngChunk("IDAT", new Uint8Array([byte]))),
		fixture.chunks[2],
	];
	expect(decodePng(pngChunks(chunks)).image.pixels).toEqual(
		decodePng(fixture.bytes).image.pixels,
	);
});

it("reports skipped metadata and APNG control chunks without executing or inflating their contents", () => {
	const fixture = base();
	const ancillary = ["gAMA", "iCCP", "tEXt", "acTL", "fcTL"].map((type) =>
		pngChunk(type, new Uint8Array([255])),
	);
	const result = decodePng(
		pngChunks([fixture.chunks[0], ...ancillary, ...fixture.chunks.slice(1)]),
	);
	expect(result.ignoredAncillaryChunks).toEqual([
		"gAMA",
		"iCCP",
		"tEXt",
		"acTL",
		"fcTL",
	]);
	expect(result.image.pixels).toEqual(decodePng(fixture.bytes).image.pixels);
});

it("verifies independent checksum reference vectors", () => {
	expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
	expect(adler32(new TextEncoder().encode("Wikipedia"))).toBe(0x11e60398);
});

it("rejects every truncated prefix, corrupt chunk CRCs and trailing data", () => {
	const fixture = base();
	for (let length = 0; length < fixture.bytes.length; length++)
		expect(() => decodePng(fixture.bytes.subarray(0, length))).toThrow();
	const corrupt = fixture.bytes.slice();
	corrupt[30] ^= 1;
	expect(() => decodePng(corrupt)).toThrow(/CRC/);
	const trailing = new Uint8Array(fixture.bytes.length + 1);
	trailing.set(fixture.bytes);
	expect(() => decodePng(trailing)).toThrow(/trailing/);
});

it.each([
	"duplicate header",
	"missing header",
	"missing data",
	"missing end",
	"nonconsecutive data",
	"unknown critical",
	"invalid name",
	"end payload",
	"late palette",
])("rejects invalid chunk order or structure: %s", (kind) => {
	const [header, data, end] = base().chunks;
	const metadata = pngChunk("tEXt", new Uint8Array());
	const candidates: Record<string, Uint8Array[]> = {
		"duplicate header": [header, header, data, end],
		"missing header": [data, end],
		"missing data": [header, end],
		"missing end": [header, data],
		"nonconsecutive data": [header, data, metadata, data, end],
		"unknown critical": [header, pngChunk("ABCD", new Uint8Array()), data, end],
		"invalid name": [header, pngChunk("abcd", new Uint8Array()), data, end],
		"end payload": [header, data, pngChunk("IEND", new Uint8Array([0]))],
		"late palette": [
			header,
			data,
			pngChunk("PLTE", new Uint8Array([0, 0, 0])),
			end,
		],
	};
	expect(() => decodePng(pngChunks(candidates[kind]))).toThrow();
});

it.each([
	[8, 3],
	[9, 5],
	[10, 1],
	[11, 1],
	[12, 2],
])("rejects invalid header byte %i = %i", (offset, value) => {
	const [header, data, end] = base().chunks;
	const payload = header.slice(8, -4);
	payload[offset] = value;
	expect(() =>
		decodePng(pngChunks([pngChunk("IHDR", payload), data, end])),
	).toThrow();
});

it("rejects invalid palette and transparency metadata", () => {
	const fixture = pngFixture({
		width: 1,
		height: 1,
		color: 3,
		depth: 1,
		palette: [255, 0, 0],
		samples: [0],
	});
	const [header, palette, data, end] = fixture.chunks;
	for (const chunks of [
		[header, data, end],
		[header, palette, palette, data, end],
		[header, pngChunk("PLTE", new Uint8Array([0])), data, end],
		[header, pngChunk("PLTE", new Uint8Array(9)), data, end],
		[header, pngChunk("tRNS", new Uint8Array([0])), palette, data, end],
		[header, palette, pngChunk("tRNS", new Uint8Array([0, 0])), data, end],
	])
		expect(() => decodePng(pngChunks(chunks))).toThrow();
	expect(() =>
		decodePng(
			pngFixture({
				width: 1,
				height: 1,
				color: 3,
				depth: 1,
				palette: [0, 0, 0],
				samples: [1],
			}).bytes,
		),
	).toThrow(/palette index/);
	expect(() =>
		decodePng(
			pngFixture({
				width: 1,
				height: 1,
				color: 0,
				depth: 1,
				samples: [0],
				transparency: [0, 2],
			}).bytes,
		),
	).toThrow(/transparency sample/);
	expect(() =>
		decodePng(
			pngFixture({
				width: 1,
				height: 1,
				color: 6,
				depth: 8,
				samples: [0, 0, 0, 0],
				transparency: [0, 0],
			}).bytes,
		),
	).toThrow(/color type/);
});

it("rejects invalid scanlines, decompressed sizes and zlib checksums", () => {
	const fixture = base();
	const [header, data, end] = fixture.chunks;
	const invalid = fixture.raw.slice();
	invalid[0] = 5;
	expect(() =>
		decodePng(pngChunks([header, pngChunk("IDAT", deflateSync(invalid)), end])),
	).toThrow(/filter/);
	for (const raw of [
		fixture.raw.subarray(0, -1),
		new Uint8Array(fixture.raw.length + 1),
	])
		expect(() =>
			decodePng(pngChunks([header, pngChunk("IDAT", deflateSync(raw)), end])),
		).toThrow(/length/);
	const compressed = data.slice(8, -4);
	compressed[compressed.length - 1] ^= 1;
	expect(() =>
		decodePng(pngChunks([header, pngChunk("IDAT", compressed), end])),
	).toThrow(/Adler/);
});

it("preflights image sizes and bounds source, chunk count, work and options", () => {
	const fixture = base();
	expect(() => decodePng(fixture.bytes, { maxPixels: 3 })).toThrow(
		/pixel limit/,
	);
	expect(decodePng(fixture.bytes, { maxPixels: 4 }).image.width).toBe(2);
	for (const maxPixels of [
		0,
		-1,
		0.5,
		Number.NaN,
		pngDecodeLimits.maxPixels + 1,
	])
		expect(() => decodePng(fixture.bytes, { maxPixels })).toThrow(
			/pixel limit/,
		);
	const [header, data, end] = fixture.chunks;
	for (const [width, height] of [
		[4097, 1],
		[4096, 4096],
	]) {
		const payload = header.slice(8, -4);
		const view = new DataView(payload.buffer);
		view.setUint32(0, width);
		view.setUint32(4, height);
		expect(() =>
			decodePng(pngChunks([pngChunk("IHDR", payload), data, end])),
		).toThrow(/pixel limit/);
	}
	expect(() =>
		decodePng(new Uint8Array(pngDecodeLimits.maxInputBytes + 1)),
	).toThrow(/input limit/);
	expect(() =>
		decodePng(
			pngChunks([
				header,
				...Array.from({ length: pngDecodeLimits.maxChunks }, () =>
					pngChunk("tEXt", new Uint8Array()),
				),
				data,
				end,
			]),
		),
	).toThrow(/chunk limit/);
	expect(() => decodePng(fixture.bytes, { maxWork: 1 })).toThrow(/work limit/);
	for (const maxWork of [0, -1, 0.5, Number.NaN, pngDecodeLimits.maxWork + 1])
		expect(() => decodePng(fixture.bytes, { maxWork })).toThrow(/work limit/);
	expect(() => decodePng(fixture.bytes, { unknown: true } as never)).toThrow(
		/arguments/,
	);
	expect(() => decodePng(null as never)).toThrow(/arguments/);
	expect(() => decodePng(fixture.bytes, { maxWork: null as never })).toThrow(
		/work limit/,
	);
});
