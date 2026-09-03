import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { encodePng } from "./png.js";
import { type RasterImage, createRaster } from "./raster.js";

function independentCrc(bytes: Uint8Array) {
	let checksum = 0xffffffff;
	for (const byte of bytes) {
		checksum ^= byte;
		for (let bit = 0; bit < 8; bit++)
			checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
	}
	return (checksum ^ 0xffffffff) >>> 0;
}

function inspect(bytes: Uint8Array) {
	expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const chunks: { type: string; data: Uint8Array }[] = [];
	let cursor = 8;
	while (cursor < bytes.length) {
		const length = view.getUint32(cursor);
		expect(cursor + length + 12).toBeLessThanOrEqual(bytes.length);
		const type = String.fromCharCode(...bytes.subarray(cursor + 4, cursor + 8));
		expect(view.getUint32(cursor + length + 8)).toBe(
			independentCrc(bytes.subarray(cursor + 4, cursor + length + 8)),
		);
		chunks.push({ type, data: bytes.slice(cursor + 8, cursor + length + 8) });
		cursor += length + 12;
	}
	expect(cursor).toBe(bytes.length);
	expect(chunks.map(({ type }) => type)).toEqual(["IHDR", "IDAT", "IEND"]);
	expect(chunks[2].data).toHaveLength(0);
	return chunks;
}

it.each([
	[1, 1],
	[3, 5],
	[1092, 15],
	[1092, 16],
	[4096, 12],
])("encodes independently checked stored RGBA PNG %s x %s", (width, height) => {
	const image = createRaster(width, height);
	for (let index = 0; index < image.pixels.length; index++)
		image.pixels[index] = (index * 31 + Math.floor(index / 7)) % 256;
	const before = image.pixels.slice();
	const encoded = encodePng(image, { compression: "stored" });
	const chunks = inspect(encoded);
	const header = new DataView(chunks[0].data.buffer);
	expect(header.getUint32(0)).toBe(width);
	expect(header.getUint32(4)).toBe(height);
	expect([...chunks[0].data.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
	const decoded = inflateSync(chunks[1].data);
	const stride = width * 4;
	expect(decoded).toHaveLength((stride + 1) * height);
	for (let row = 0; row < height; row++) {
		expect(decoded[row * (stride + 1)]).toBe(0);
		expect(
			new Uint8Array(
				decoded.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)),
			),
		).toEqual(before.subarray(row * stride, (row + 1) * stride));
	}
	const blockCount = Math.ceil(decoded.length / 65535);
	expect(chunks[1].data.length).toBe(decoded.length + blockCount * 5 + 6);
	let cursor = 2;
	for (let block = 0; block < blockCount; block++) {
		expect(chunks[1].data[cursor++]).toBe(block === blockCount - 1 ? 1 : 0);
		const length = chunks[1].data[cursor] | (chunks[1].data[cursor + 1] << 8);
		const complement =
			chunks[1].data[cursor + 2] | (chunks[1].data[cursor + 3] << 8);
		expect(length ^ complement).toBe(65535);
		cursor += 4 + length;
	}
	expect(cursor).toBe(chunks[1].data.length - 4);
	expect(image.pixels).toEqual(before);
	expect(encodePng(image, { compression: "stored" })).toEqual(encoded);
});

it("compresses by default while preserving the exact scanlines, alpha and chunk checksums", () => {
	const image = createRaster(320, 240, [12, 34, 56, 78]);
	const encoded = encodePng(image);
	const stored = encodePng(image, { compression: "stored" });
	const actual = inflateSync(inspect(encoded)[1].data);
	const expected = inflateSync(inspect(stored)[1].data);
	expect(actual.equals(expected)).toBe(true);
	expect(encoded.length).toBeLessThan(stored.length / 50);
	expect(Buffer.from(encodePng(image)).equals(encoded)).toBe(true);
});

it("propagates compression budget failures rather than emitting partial PNG data", () => {
	expect(() => encodePng(createRaster(10, 10), { maxWork: 1 })).toThrow(
		"DEFLATE work limit",
	);
});

it("preserves transparent RGB channels and exact alpha", () => {
	const image = createRaster(1, 1, [12, 34, 56, 0]);
	expect([...inflateSync(inspect(encodePng(image))[1].data)]).toEqual([
		0, 12, 34, 56, 0,
	]);
});

it.each([
	null,
	{},
	{ width: 1, height: 1, pixels: [0, 0, 0, 0] },
	{ width: 2, height: 2, pixels: new Uint8Array(4) },
	{ width: 4097, height: 1, pixels: new Uint8Array(4) },
])("rejects malformed image %j", (image) => {
	expect(() => encodePng(image as RasterImage)).toThrow();
});
