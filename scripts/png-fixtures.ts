import { deflateSync } from "node:zlib";
import { crc32 } from "../src/image-checksums.js";

export interface PngFixtureOptions {
	width: number;
	height: number;
	depth: number;
	color: number;
	samples: number[];
	interlaced?: boolean;
	filter?: number;
	palette?: number[];
	transparency?: number[];
}
export function pngChunk(type: string, data: Uint8Array) {
	const bytes = new Uint8Array(data.length + 12);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, data.length);
	bytes.set(new TextEncoder().encode(type), 4);
	bytes.set(data, 8);
	view.setUint32(bytes.length - 4, crc32(bytes, 4, bytes.length - 4));
	return bytes;
}
export function pngChunks(chunks: readonly Uint8Array[]) {
	const bytes = new Uint8Array(
		8 + chunks.reduce((length, chunk) => length + chunk.length, 0),
	);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
	let offset = 8;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
}
export function pngFixture(options: PngFixtureOptions) {
	const { width, height, depth, color, samples } = options;
	const channels =
		color === 0 || color === 3 ? 1 : color === 2 ? 3 : color === 4 ? 2 : 4;
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header[8] = depth;
	header[9] = color;
	header[12] = options.interlaced ? 1 : 0;
	const passes = options.interlaced
		? [
				[0, 0, 8, 8],
				[4, 0, 8, 8],
				[0, 4, 4, 8],
				[2, 0, 4, 4],
				[0, 2, 2, 4],
				[1, 0, 2, 2],
				[0, 1, 1, 2],
			]
		: [[0, 0, 1, 1]];
	const raw: number[] = [];
	for (const [left, top, horizontal, vertical] of passes) {
		const columns = Math.max(0, Math.ceil((width - left) / horizontal));
		if (!columns || top >= height) continue;
		let previous = new Uint8Array(Math.ceil((columns * channels * depth) / 8));
		for (let row = top; row < height; row += vertical) {
			const bytes = new Uint8Array(previous.length);
			let bit = 0;
			for (let column = left; column < width; column += horizontal)
				for (let channel = 0; channel < channels; channel++) {
					const value = samples[(row * width + column) * channels + channel];
					if (depth === 16) {
						bytes[bit / 8] = value >>> 8;
						bytes[bit / 8 + 1] = value & 255;
					} else bytes[bit >>> 3] |= value << (8 - depth - (bit & 7));
					bit += depth;
				}
			const filter = options.filter ?? 0;
			raw.push(filter);
			const pixelBytes = Math.max(1, Math.ceil((channels * depth) / 8));
			for (let index = 0; index < bytes.length; index++) {
				const leftValue = index < pixelBytes ? 0 : bytes[index - pixelBytes];
				const above = previous[index];
				const corner = index < pixelBytes ? 0 : previous[index - pixelBytes];
				const estimate = leftValue + above - corner;
				const distances = [leftValue, above, corner].map((value) =>
					Math.abs(estimate - value),
				);
				const nearest = [leftValue, above, corner][
					distances.indexOf(Math.min(...distances))
				];
				const prediction =
					[0, leftValue, above, Math.floor((leftValue + above) / 2), nearest][
						filter
					] ?? 0;
				raw.push((bytes[index] - prediction) & 255);
			}
			previous = bytes;
		}
	}
	const chunks = [pngChunk("IHDR", header)];
	if (options.palette)
		chunks.push(pngChunk("PLTE", Uint8Array.from(options.palette)));
	if (options.transparency)
		chunks.push(pngChunk("tRNS", Uint8Array.from(options.transparency)));
	chunks.push(
		pngChunk("IDAT", deflateSync(Uint8Array.from(raw))),
		pngChunk("IEND", new Uint8Array()),
	);
	return { bytes: pngChunks(chunks), chunks, raw: Uint8Array.from(raw) };
}
