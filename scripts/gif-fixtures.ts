export interface GifCode {
	readonly code: number;
	readonly width: number;
}

export type GifRgb = readonly [red: number, green: number, blue: number];
export type GifPalette = readonly GifRgb[];

export interface GifGraphicControlOptions {
	readonly disposal?: number;
	readonly delayCentiseconds?: number;
	readonly transparentIndex?: number;
	readonly userInput?: boolean;
}

export interface GifExtensionBlock {
	readonly kind: "extension";
	readonly label: number;
	readonly subBlocks: readonly (readonly number[] | Uint8Array)[];
	readonly terminateData?: boolean;
}

export interface GifImageBlock {
	readonly kind: "image";
	readonly width?: number;
	readonly height?: number;
	readonly left?: number;
	readonly top?: number;
	readonly localPalette?: GifPalette;
	readonly interlaced?: boolean;
	readonly minimumCodeSize?: number;
	readonly indicesInStorageOrder?: readonly number[];
	readonly codes?: readonly GifCode[];
	readonly compressedBytes?: readonly number[] | Uint8Array;
	readonly subBlockSizes?: readonly number[];
	readonly terminateData?: boolean;
}

export type GifFixtureBlock = GifImageBlock | GifExtensionBlock;

export interface GifFixtureOptions {
	readonly version?: "87a" | "89a";
	readonly width?: number;
	readonly height?: number;
	readonly globalPalette?: GifPalette | null;
	readonly backgroundIndex?: number;
	readonly pixelAspectRatio?: number;
	readonly blocks?: readonly GifFixtureBlock[];
	readonly trailer?: boolean;
	readonly trailingBytes?: readonly number[];
}

export interface GifFixture {
	readonly bytes: Uint8Array;
	readonly imageOffsets: readonly number[];
	readonly imageDataOffsets: readonly number[];
	readonly extensionOffsets: readonly number[];
}

export function packGifCodes(codes: readonly GifCode[]): Uint8Array {
	let bitLength = 0;
	for (const { code, width } of codes) {
		if (
			!Number.isInteger(width) ||
			width < 1 ||
			width > 12 ||
			!Number.isInteger(code) ||
			code < 0 ||
			code >= 2 ** width
		)
			throw new Error("Invalid explicit GIF fixture code or width");
		bitLength += width;
	}
	const bytes = new Uint8Array(Math.ceil(bitLength / 8));
	let position = 0;
	for (const { code, width } of codes) {
		for (let bit = 0; bit < width; bit++, position++)
			bytes[position >>> 3] |= ((code >>> bit) & 1) << (position & 7);
	}
	return bytes;
}

export function gifGraphicControl(
	options: GifGraphicControlOptions = {},
): GifExtensionBlock {
	const delay = options.delayCentiseconds ?? 0;
	return {
		kind: "extension",
		label: 0xf9,
		subBlocks: [
			[
				((options.disposal ?? 0) << 2) |
					(options.userInput ? 2 : 0) |
					(options.transparentIndex === undefined ? 0 : 1),
				delay & 255,
				(delay >>> 8) & 255,
				options.transparentIndex ?? 0,
			],
		],
	};
}

export function gifLoopExtension(
	loopCount: number,
	identifier: "NETSCAPE2.0" | "ANIMEXTS1.0" = "NETSCAPE2.0",
): GifExtensionBlock {
	return {
		kind: "extension",
		label: 0xff,
		subBlocks: [
			Array.from(identifier, (character) => character.charCodeAt(0)),
			[1, loopCount & 255, (loopCount >>> 8) & 255],
		],
	};
}

function paletteSizeBits(palette: GifPalette): number {
	const bits = Math.log2(palette.length);
	if (!Number.isInteger(bits) || bits < 1 || bits > 8)
		throw new Error(
			"Fixture palettes require 2, 4, 8, 16, 32, 64, 128, or 256 colors",
		);
	for (const color of palette)
		if (
			color.length !== 3 ||
			color.some(
				(value) => !Number.isInteger(value) || value < 0 || value > 255,
			)
		)
			throw new Error("Invalid GIF fixture palette color");
	return bits - 1;
}

function imageBytes(block: GifImageBlock): Uint8Array {
	const sources = [
		block.indicesInStorageOrder,
		block.codes,
		block.compressedBytes,
	].filter((source) => source !== undefined);
	if (sources.length !== 1)
		throw new Error("GIF image fixture requires exactly one pixel/code source");
	if (block.compressedBytes !== undefined)
		return Uint8Array.from(block.compressedBytes);
	if (block.codes !== undefined) return packGifCodes(block.codes);
	const minimum = block.minimumCodeSize ?? 2;
	if (!Number.isInteger(minimum) || minimum < 2 || minimum > 8)
		throw new Error(
			"Literal GIF fixtures require minimum code size 2 through 8",
		);
	const clear = 1 << minimum;
	const width = minimum + 1;
	const codes: GifCode[] = [];
	for (const index of block.indicesInStorageOrder ?? []) {
		if (!Number.isInteger(index) || index < 0 || index >= clear)
			throw new Error("GIF fixture literal exceeds its minimum code size");
		codes.push({ code: clear, width }, { code: index, width });
	}
	if (!codes.length) codes.push({ code: clear, width });
	codes.push({ code: clear + 1, width });
	return packGifCodes(codes);
}

export function gifFixture(options: GifFixtureOptions = {}): GifFixture {
	const width = options.width ?? 2;
	const height = options.height ?? 1;
	const globalPalette =
		options.globalPalette === undefined
			? ([
					[255, 0, 0],
					[0, 0, 255],
				] as const)
			: options.globalPalette;
	const bytes = Array.from(`GIF${options.version ?? "89a"}`, (character) =>
		character.charCodeAt(0),
	);
	const word = (value: number) => bytes.push(value & 255, (value >>> 8) & 255);
	const appendPalette = (palette: GifPalette) => {
		for (const color of palette) bytes.push(...color);
	};
	const appendSubBlock = (data: readonly number[] | Uint8Array) => {
		if (data.length < 1 || data.length > 255)
			throw new Error("Fixture sub-blocks require 1 through 255 bytes");
		bytes.push(data.length);
		for (const value of data) bytes.push(value);
	};
	word(width);
	word(height);
	bytes.push(
		globalPalette ? 0x80 | paletteSizeBits(globalPalette) : 0,
		options.backgroundIndex ?? 0,
		options.pixelAspectRatio ?? 0,
	);
	if (globalPalette) appendPalette(globalPalette);
	const imageOffsets: number[] = [];
	const imageDataOffsets: number[] = [];
	const extensionOffsets: number[] = [];
	const blocks: readonly GifFixtureBlock[] = options.blocks ?? [
		{ kind: "image", indicesInStorageOrder: [0, 1] },
	];
	for (const block of blocks) {
		if (block.kind === "extension") {
			extensionOffsets.push(bytes.length);
			bytes.push(0x21, block.label);
			for (const data of block.subBlocks) appendSubBlock(data);
			if (block.terminateData !== false) bytes.push(0);
			continue;
		}
		imageOffsets.push(bytes.length);
		bytes.push(0x2c);
		word(block.left ?? 0);
		word(block.top ?? 0);
		word(block.width ?? width);
		word(block.height ?? height);
		bytes.push(
			(block.interlaced ? 0x40 : 0) |
				(block.localPalette ? 0x80 | paletteSizeBits(block.localPalette) : 0),
		);
		if (block.localPalette) appendPalette(block.localPalette);
		imageDataOffsets.push(bytes.length);
		bytes.push(block.minimumCodeSize ?? 2);
		const compressed = imageBytes(block);
		let position = 0;
		for (const size of block.subBlockSizes ?? []) {
			if (
				!Number.isInteger(size) ||
				size < 1 ||
				size > 255 ||
				position + size > compressed.length
			)
				throw new Error("Invalid GIF fixture sub-block split");
			appendSubBlock(compressed.subarray(position, position + size));
			position += size;
		}
		while (position < compressed.length) {
			const end = Math.min(compressed.length, position + 255);
			appendSubBlock(compressed.subarray(position, end));
			position = end;
		}
		if (block.terminateData !== false) bytes.push(0);
	}
	if (options.trailer !== false) bytes.push(0x3b);
	for (const value of options.trailingBytes ?? []) bytes.push(value);
	return {
		bytes: Uint8Array.from(bytes),
		imageOffsets: Object.freeze(imageOffsets),
		imageDataOffsets: Object.freeze(imageDataOffsets),
		extensionOffsets: Object.freeze(extensionOffsets),
	};
}
