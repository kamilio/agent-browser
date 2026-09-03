import { AgentBrowserError } from "./errors.js";
import { crc32 } from "./image-checksums.js";
import { inflateLimits, inflateZlib } from "./inflate.js";
import { type RasterImage, createRaster, rasterLimits } from "./raster.js";

export const pngDecodeLimits = Object.freeze({
	maxInputBytes: 33_554_432,
	maxChunks: 4096,
	maxWork: 268_435_456,
	maxDimension: rasterLimits.maxDimension,
	maxPixels: rasterLimits.maxPixels,
});
export interface PngDecodeOptions {
	maxWork?: number;
	maxPixels?: number;
}
export interface DecodedPng {
	readonly image: Readonly<RasterImage>;
	readonly bitDepth: number;
	readonly colorType: number;
	readonly interlaced: boolean;
	readonly ignoredAncillaryChunks: readonly string[];
	readonly compressedBytes: number;
	readonly inflatedBytes: number;
	readonly work: number;
}
interface Header {
	width: number;
	height: number;
	depth: number;
	color: number;
	channels: number;
	interlaced: boolean;
}
interface Pass {
	x: number;
	y: number;
	xStep: number;
	yStep: number;
	width: number;
	height: number;
	stride: number;
}
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const adam7 = [
	[0, 0, 8, 8],
	[4, 0, 8, 8],
	[0, 4, 4, 8],
	[2, 0, 4, 4],
	[0, 2, 2, 4],
	[1, 0, 2, 2],
	[0, 1, 1, 2],
];

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", `Invalid PNG: ${message}`);
}

function readHeader(data: Uint8Array, maxPixels: number): Header {
	if (data.length !== 13) invalid("IHDR size");
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const width = view.getUint32(0);
	const height = view.getUint32(4);
	if (!width || !height || width > 0x7fffffff || height > 0x7fffffff)
		invalid("dimensions");
	if (
		width > pngDecodeLimits.maxDimension ||
		height > pngDecodeLimits.maxDimension ||
		width * height > maxPixels
	)
		throw new AgentBrowserError("resource-limit", "PNG pixel limit exceeded");
	const depth = data[8];
	const color = data[9];
	const channels =
		color === 0 || color === 3
			? 1
			: color === 2
				? 3
				: color === 4
					? 2
					: color === 6
						? 4
						: 0;
	const depths =
		color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
	if (!channels || !depths.includes(depth)) invalid("color type or bit depth");
	if (data[10] !== 0 || data[11] !== 0 || data[12] > 1)
		invalid("compression, filter or interlace method");
	return { width, height, depth, color, channels, interlaced: data[12] === 1 };
}

function passes(header: Header): Pass[] {
	return (header.interlaced ? adam7 : [[0, 0, 1, 1]])
		.map(([x, y, xStep, yStep]) => {
			const width = Math.max(0, Math.ceil((header.width - x) / xStep));
			const height = Math.max(0, Math.ceil((header.height - y) / yStep));
			return {
				x,
				y,
				xStep,
				yStep,
				width,
				height,
				stride: Math.ceil((width * header.channels * header.depth) / 8),
			};
		})
		.filter((pass) => pass.width > 0 && pass.height > 0);
}

function paeth(left: number, above: number, corner: number) {
	const prediction = left + above - corner;
	const leftDistance = Math.abs(prediction - left);
	const aboveDistance = Math.abs(prediction - above);
	const cornerDistance = Math.abs(prediction - corner);
	return leftDistance <= aboveDistance && leftDistance <= cornerDistance
		? left
		: aboveDistance <= cornerDistance
			? above
			: corner;
}

function sample(row: Uint8Array, index: number, depth: number) {
	if (depth === 8) return row[index];
	if (depth === 16) return row[index * 2] * 256 + row[index * 2 + 1];
	return (
		(row[(index * depth) >>> 3] >>> (8 - depth - ((index * depth) & 7))) &
		((1 << depth) - 1)
	);
}

function paintRow(
	image: RasterImage,
	row: Uint8Array,
	header: Header,
	pass: Pass,
	rowIndex: number,
	palette: Uint8Array | undefined,
	transparency: Uint8Array | undefined,
) {
	const maximum = (1 << header.depth) - 1;
	const toByte = (value: number) => Math.round((value * 255) / maximum);
	const transparent =
		transparency && header.color !== 3
			? new DataView(
					transparency.buffer,
					transparency.byteOffset,
					transparency.byteLength,
				)
			: undefined;
	for (let column = 0; column < pass.width; column++) {
		const offset =
			((pass.y + rowIndex * pass.yStep) * header.width +
				pass.x +
				column * pass.xStep) *
			4;
		const index = column * header.channels;
		const first = sample(row, index, header.depth);
		if (header.color === 3) {
			if (!palette || first * 3 + 2 >= palette.length) invalid("palette index");
			image.pixels[offset] = palette[first * 3];
			image.pixels[offset + 1] = palette[first * 3 + 1];
			image.pixels[offset + 2] = palette[first * 3 + 2];
			image.pixels[offset + 3] = transparency?.[first] ?? 255;
		} else if (header.color === 0 || header.color === 4) {
			const gray = toByte(first);
			image.pixels[offset] = gray;
			image.pixels[offset + 1] = gray;
			image.pixels[offset + 2] = gray;
			image.pixels[offset + 3] =
				header.color === 4
					? toByte(sample(row, index + 1, header.depth))
					: transparent?.getUint16(0) === first
						? 0
						: 255;
		} else {
			const green = sample(row, index + 1, header.depth);
			const blue = sample(row, index + 2, header.depth);
			image.pixels[offset] = toByte(first);
			image.pixels[offset + 1] = toByte(green);
			image.pixels[offset + 2] = toByte(blue);
			image.pixels[offset + 3] =
				header.color === 6
					? toByte(sample(row, index + 3, header.depth))
					: transparent &&
							transparent.getUint16(0) === first &&
							transparent.getUint16(2) === green &&
							transparent.getUint16(4) === blue
						? 0
						: 255;
		}
	}
}

export function decodePng(
	input: Uint8Array,
	options: PngDecodeOptions = {},
): Readonly<DecodedPng> {
	if (
		!(input instanceof Uint8Array) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => !["maxWork", "maxPixels"].includes(key))
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid PNG decode arguments",
		);
	if (input.length > pngDecodeLimits.maxInputBytes)
		throw new AgentBrowserError("resource-limit", "PNG input limit exceeded");
	const maxWork =
		options.maxWork === undefined ? pngDecodeLimits.maxWork : options.maxWork;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > pngDecodeLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid PNG decode work limit",
		);
	let work = 0;
	const maxPixels =
		options.maxPixels === undefined
			? pngDecodeLimits.maxPixels
			: options.maxPixels;
	if (
		!Number.isSafeInteger(maxPixels) ||
		maxPixels < 1 ||
		maxPixels > pngDecodeLimits.maxPixels
	)
		throw new AgentBrowserError("invalid-input", "Invalid PNG pixel limit");
	const charge = (amount: number) => {
		work += amount;
		if (work > maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"PNG decode work limit exceeded",
			);
	};
	if (
		input.length < 8 ||
		signature.some((byte, index) => input[index] !== byte)
	)
		invalid("signature");
	const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
	let cursor = 8;
	let chunks = 0;
	let header: Header | undefined;
	let palette: Uint8Array | undefined;
	let transparency: Uint8Array | undefined;
	let ended = false;
	let dataStarted = false;
	let dataEnded = false;
	let compressedBytes = 0;
	const segments: Uint8Array[] = [];
	const ignored = new Set<string>();
	while (cursor < input.length) {
		if (++chunks > pngDecodeLimits.maxChunks)
			throw new AgentBrowserError("resource-limit", "PNG chunk limit exceeded");
		if (input.length - cursor < 12) invalid("truncated chunk");
		const length = view.getUint32(cursor);
		if (length > 0x7fffffff || length > input.length - cursor - 12)
			invalid("chunk length");
		charge(length + 12);
		const type = String.fromCharCode(...input.subarray(cursor + 4, cursor + 8));
		if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) invalid("chunk name");
		const end = cursor + length + 8;
		if (crc32(input, cursor + 4, end) !== view.getUint32(end))
			invalid("chunk CRC");
		const data = input.subarray(cursor + 8, end);
		cursor = end + 4;
		if (!header && type !== "IHDR") invalid("IHDR must be first");
		if (dataStarted && type !== "IDAT") dataEnded = true;
		if (type === "IHDR") {
			if (header) invalid("duplicate IHDR");
			header = readHeader(data, maxPixels);
		} else if (type === "PLTE") {
			if (
				!header ||
				palette ||
				dataStarted ||
				transparency ||
				header.color === 0 ||
				header.color === 4 ||
				length === 0 ||
				length % 3 !== 0 ||
				length > 768 ||
				(header.color === 3 && length / 3 > 2 ** header.depth)
			)
				invalid("PLTE");
			palette = data;
		} else if (type === "tRNS") {
			if (
				!header ||
				transparency ||
				dataStarted ||
				header.color === 4 ||
				header.color === 6
			)
				invalid("tRNS order or color type");
			if (header.color === 3) {
				if (!palette || length < 1 || length > palette.length / 3)
					invalid("palette transparency");
			} else {
				if (length !== (header.color === 0 ? 2 : 6))
					invalid("transparency length");
				const values = new DataView(
					data.buffer,
					data.byteOffset,
					data.byteLength,
				);
				for (let offset = 0; offset < length; offset += 2)
					if (values.getUint16(offset) >= 2 ** header.depth)
						invalid("transparency sample");
			}
			transparency = data;
		} else if (type === "IDAT") {
			if (!header || dataEnded || (header.color === 3 && !palette))
				invalid("IDAT order");
			dataStarted = true;
			segments.push(data);
			compressedBytes += length;
		} else if (type === "IEND") {
			if (!dataStarted || length !== 0 || cursor !== input.length)
				invalid("IEND or trailing data");
			ended = true;
			break;
		} else if (type.charCodeAt(0) < 97) {
			throw new AgentBrowserError(
				"unsupported",
				`Unsupported critical PNG chunk: ${type}`,
			);
		} else ignored.add(type);
	}
	if (!header || !ended) invalid("missing header, data or end");
	const imagePasses = passes(header);
	const inflatedBytes = imagePasses.reduce(
		(size, pass) => size + (pass.stride + 1) * pass.height,
		0,
	);
	charge(inflatedBytes + header.width * header.height * 4 + compressedBytes);
	let compressed: Uint8Array;
	if (segments.length === 1) compressed = segments[0];
	else {
		compressed = new Uint8Array(compressedBytes);
		let offset = 0;
		for (const segment of segments) {
			compressed.set(segment, offset);
			offset += segment.length;
		}
	}
	if (work === maxWork)
		throw new AgentBrowserError(
			"resource-limit",
			"PNG decode work limit exceeded",
		);
	const inflated = inflateZlib(compressed, inflatedBytes, {
		maxWork: Math.min(inflateLimits.maxWork, maxWork - work),
	});
	charge(inflated.work);
	const image = createRaster(header.width, header.height);
	const bytesPerPixel = Math.max(
		1,
		Math.ceil((header.channels * header.depth) / 8),
	);
	let source = 0;
	for (const pass of imagePasses) {
		let previous = new Uint8Array(pass.stride);
		let row = new Uint8Array(pass.stride);
		for (let rowIndex = 0; rowIndex < pass.height; rowIndex++) {
			const filter = inflated.bytes[source++];
			if (filter > 4) invalid("scanline filter");
			for (let index = 0; index < pass.stride; index++) {
				const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
				const above = previous[index];
				const corner =
					index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
				const prediction =
					filter === 0
						? 0
						: filter === 1
							? left
							: filter === 2
								? above
								: filter === 3
									? Math.floor((left + above) / 2)
									: paeth(left, above, corner);
				row[index] = inflated.bytes[source++] + prediction;
			}
			paintRow(image, row, header, pass, rowIndex, palette, transparency);
			[previous, row] = [row, previous];
		}
	}
	return Object.freeze({
		image,
		bitDepth: header.depth,
		colorType: header.color,
		interlaced: header.interlaced,
		ignoredAncillaryChunks: Object.freeze([...ignored]),
		compressedBytes,
		inflatedBytes,
		work,
	});
}
