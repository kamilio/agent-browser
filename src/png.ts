import { type DeflateOptions, compressZlib } from "./deflate.js";
import { crc32 } from "./image-checksums.js";
import { type RasterImage, validateRaster } from "./raster.js";

function chunk(type: string, bytes: Uint8Array) {
	const result = new Uint8Array(bytes.length + 12);
	const view = new DataView(result.buffer);
	view.setUint32(0, bytes.length);
	for (let index = 0; index < 4; index++)
		result[4 + index] = type.charCodeAt(index);
	result.set(bytes, 8);
	view.setUint32(bytes.length + 8, crc32(result, 4, bytes.length + 8));
	return result;
}

export function encodePng(
	image: RasterImage,
	options: DeflateOptions = {},
): Uint8Array {
	validateRaster(image);
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, image.width);
	view.setUint32(4, image.height);
	header[8] = 8;
	header[9] = 6;
	const stride = image.width * 4;
	const filtered = new Uint8Array((stride + 1) * image.height);
	for (let row = 0; row < image.height; row++)
		filtered.set(
			image.pixels.subarray(row * stride, (row + 1) * stride),
			row * (stride + 1) + 1,
		);
	const chunks = [
		chunk("IHDR", header),
		chunk("IDAT", compressZlib(filtered, options).bytes),
		chunk("IEND", new Uint8Array()),
	];
	const result = new Uint8Array(
		8 + chunks.reduce((length, entry) => length + entry.length, 0),
	);
	result.set([137, 80, 78, 71, 13, 10, 26, 10]);
	let cursor = 8;
	for (const entry of chunks) {
		result.set(entry, cursor);
		cursor += entry.length;
	}
	return result;
}
