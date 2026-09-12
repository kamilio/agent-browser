import { AgentBrowserError } from "./errors.js";
import { type RasterImage, createRaster, rasterLimits } from "./raster.js";

export const gifDecodeLimits = Object.freeze({
	maxInputBytes: 33_554_432,
	maxBlocks: 4096,
	maxSubBlocks: 131_072,
	maxFrames: 256,
	maxWork: 268_435_456,
	maxDimension: rasterLimits.maxDimension,
	maxPixels: rasterLimits.maxPixels,
});
export interface GifDecodeOptions {
	maxWork?: number;
	maxPixels?: number;
}
export interface DecodedGif {
	readonly image: Readonly<RasterImage>;
	readonly version: "87a" | "89a";
	readonly frameCount: number;
	readonly animated: boolean;
	readonly loopCount: number | null;
	readonly durationMs: number;
	readonly interlaced: boolean;
	readonly transparent: boolean;
	readonly ignoredMetadata: readonly string[];
	readonly compressedBytes: number;
	readonly decodedIndices: number;
	readonly work: number;
}
interface GraphicControl {
	delayMs: number;
	transparentIndex: number | undefined;
}

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", `Invalid GIF: ${message}`);
}
function limit(message: string): never {
	throw new AgentBrowserError(
		"resource-limit",
		`GIF ${message} limit exceeded`,
	);
}
function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", `Unsupported GIF: ${message}`);
}

class GifDecoder {
	private offset = 0;
	private work = 0;
	private blocks = 0;
	private subBlocks = 0;
	private frameCount = 0;
	private compressedBytes = 0;
	private decodedIndices = 0;
	private durationMs = 0;
	private loopCount: number | null = null;
	private interlaced = false;
	private transparent = false;
	private readonly ignoredMetadata = new Set<string>();
	private control: GraphicControl | undefined;
	private image: Readonly<RasterImage> | undefined;

	constructor(
		private readonly input: Uint8Array,
		private readonly maxWork: number,
		private readonly maxPixels: number,
	) {}

	private charge(amount = 1) {
		if (amount > this.maxWork - this.work) limit("decode work");
		this.work += amount;
	}
	private take(length: number): Uint8Array {
		if (length > this.input.length - this.offset) invalid("truncated stream");
		this.charge(length);
		const data = this.input.subarray(this.offset, this.offset + length);
		this.offset += length;
		return data;
	}
	private byte(): number {
		if (this.offset === this.input.length) invalid("truncated stream");
		this.charge();
		return this.input[this.offset++];
	}
	private word(): number {
		return this.byte() | (this.byte() << 8);
	}
	private dimensions(width: number, height: number) {
		if (!width || !height) invalid("dimensions");
		if (
			width > gifDecodeLimits.maxDimension ||
			height > gifDecodeLimits.maxDimension ||
			width * height > this.maxPixels
		)
			limit("pixel");
	}
	private palette(packed: number): Uint8Array | undefined {
		if (!(packed & 0x80)) return undefined;
		const length = 3 * 2 ** ((packed & 7) + 1);
		const data = this.take(length);
		this.charge(length);
		return new Uint8Array(data);
	}
	private subBlock(): Uint8Array | undefined {
		const length = this.byte();
		if (!length) return undefined;
		if (++this.subBlocks > gifDecodeLimits.maxSubBlocks) limit("sub-block");
		return this.take(length);
	}
	private skipSubBlocks() {
		while (this.subBlock() !== undefined) this.charge();
	}
	private extension() {
		const label = this.byte();
		if (label === 0xf9) {
			if (this.control) invalid("duplicate graphic control extension");
			const data = this.subBlock();
			if (!data || data.length !== 4) invalid("graphic control size");
			if (this.byte() !== 0) invalid("graphic control terminator");
			const packed = data[0];
			if (packed & 0xe0) invalid("graphic control reserved bits");
			if (((packed >> 2) & 7) > 3) unsupported("reserved disposal method");
			if (packed & 2) this.ignoredMetadata.add("user-input");
			this.control = {
				delayMs: (data[1] | (data[2] << 8)) * 10,
				transparentIndex: packed & 1 ? data[3] : undefined,
			};
			return;
		}
		if (label === 0x01) unsupported("plain-text rendering");
		if (label === 0xff) {
			const identifier = this.subBlock();
			if (!identifier || identifier.length !== 11) invalid("application size");
			const name = String.fromCharCode(...identifier);
			if (name === "NETSCAPE2.0" || name === "ANIMEXTS1.0") {
				const data = this.subBlock();
				if (!data || data.length !== 3 || data[0] !== 1)
					invalid("animation loop block");
				const count = data[1] | (data[2] << 8);
				if (this.loopCount !== null && this.loopCount !== count)
					invalid("conflicting animation loop counts");
				if (this.subBlock() !== undefined) invalid("animation loop terminator");
				this.loopCount = count;
				return;
			}
			this.ignoredMetadata.add("application");
		} else {
			this.ignoredMetadata.add(
				label === 0xfe ? "comment" : "unknown-extension",
			);
		}
		this.skipSubBlocks();
	}
	private indices(
		minimum: number,
		pixelCount: number,
		paletteEntries: number,
		write: ((index: number) => void) | undefined,
	) {
		this.charge(4096 * 4);
		const prefixes = new Uint16Array(4096);
		const suffixes = new Uint8Array(4096);
		const stack = new Uint8Array(4096);
		const clear = 1 << minimum;
		const end = clear + 1;
		let next = end + 1;
		let width = minimum + 1;
		let previous = -1;
		let previousFirst = 0;
		let produced = 0;
		let bits = 0;
		let bitCount = 0;
		let block: Uint8Array | undefined;
		let blockOffset = 0;
		for (;;) {
			this.charge();
			while (bitCount < width) {
				if (!block || blockOffset === block.length) {
					block = this.subBlock();
					blockOffset = 0;
					if (!block) invalid("missing LZW end code");
					this.compressedBytes += block.length;
				}
				bits |= block[blockOffset++] << bitCount;
				bitCount += 8;
			}
			const code = bits & ((1 << width) - 1);
			bits >>>= width;
			bitCount -= width;
			if (code === clear) {
				next = end + 1;
				width = minimum + 1;
				previous = -1;
				continue;
			}
			if (code === end) {
				if (produced !== pixelCount) invalid("LZW pixel underflow");
				if (block && blockOffset !== block.length)
					invalid("data after LZW end code");
				if (this.subBlock() !== undefined) invalid("data after LZW end code");
				this.decodedIndices += produced;
				return;
			}
			if (code > next || (code === next && previous < 0)) invalid("LZW code");
			let cursor = code;
			let length = 0;
			if (code === next) {
				stack[length++] = previousFirst;
				cursor = previous;
			}
			while (cursor >= clear) {
				this.charge();
				if (cursor <= end || cursor >= next || length === stack.length)
					invalid("LZW dictionary chain");
				stack[length++] = suffixes[cursor];
				cursor = prefixes[cursor];
			}
			this.charge();
			if (length === stack.length) invalid("LZW dictionary chain");
			stack[length++] = cursor;
			if (length > pixelCount - produced) invalid("LZW pixel overflow");
			this.charge(length * (write ? 5 : 1));
			produced += length;
			while (length) {
				const index = stack[--length];
				if (index >= paletteEntries) invalid("palette index");
				if (write) write(index);
			}
			if (previous >= 0 && next < 4096) {
				this.charge();
				prefixes[next] = previous;
				suffixes[next++] = cursor;
				if (next === 1 << width && width < 12) width++;
			}
			previous = code;
			previousFirst = cursor;
		}
	}
	private frame(
		screenWidth: number,
		screenHeight: number,
		globalPalette: Uint8Array | undefined,
		background: number,
	) {
		if (++this.frameCount > gifDecodeLimits.maxFrames) limit("frame");
		const left = this.word();
		const top = this.word();
		const width = this.word();
		const height = this.word();
		const packed = this.byte();
		this.dimensions(width, height);
		if (left + width > screenWidth || top + height > screenHeight)
			invalid("image rectangle outside logical screen");
		if (packed & 0x18) invalid("image reserved bits");
		const palette = this.palette(packed) ?? globalPalette;
		if (!palette) invalid("missing color table");
		const transparentIndex = this.control?.transparentIndex;
		if (
			transparentIndex !== undefined &&
			transparentIndex >= palette.length / 3
		)
			invalid("transparent palette index");
		const minimum = this.byte();
		if (minimum < 2 || minimum > 8) invalid("LZW minimum code size");
		const interlaced = (packed & 0x40) !== 0;
		this.interlaced ||= interlaced;
		this.transparent ||= transparentIndex !== undefined;
		this.durationMs += this.control?.delayMs ?? 0;
		this.control = undefined;
		let initial: Readonly<RasterImage> | undefined;
		if (this.frameCount === 1) {
			const opaque =
				transparentIndex === undefined && globalPalette !== undefined;
			this.charge(screenWidth * screenHeight * (opaque ? 8 : 4));
			initial = createRaster(
				screenWidth,
				screenHeight,
				opaque
					? [
							globalPalette[background * 3],
							globalPalette[background * 3 + 1],
							globalPalette[background * 3 + 2],
							255,
						]
					: [0, 0, 0, 0],
			);
			this.image = initial;
		}
		let column = 0;
		let row = 0;
		let pass = 0;
		const starts = [0, 4, 2, 1];
		const steps = [8, 8, 4, 2];
		const write = initial
			? (index: number) => {
					if (index !== transparentIndex) {
						const target = ((top + row) * screenWidth + left + column) * 4;
						const source = index * 3;
						initial.pixels[target] = palette[source];
						initial.pixels[target + 1] = palette[source + 1];
						initial.pixels[target + 2] = palette[source + 2];
						initial.pixels[target + 3] = 255;
					}
					if (++column === width) {
						column = 0;
						row += interlaced ? steps[pass] : 1;
						while (interlaced && row >= height && pass < 3)
							row = starts[++pass];
					}
				}
			: undefined;
		this.indices(minimum, width * height, palette.length / 3, write);
	}
	decode(): Readonly<DecodedGif> {
		const header = String.fromCharCode(...this.take(6));
		if (header !== "GIF87a" && header !== "GIF89a") invalid("signature");
		const width = this.word();
		const height = this.word();
		this.dimensions(width, height);
		const packed = this.byte();
		const background = this.byte();
		if (this.byte()) this.ignoredMetadata.add("pixel-aspect-ratio");
		const palette = this.palette(packed);
		if (palette && background >= palette.length / 3)
			invalid("background index");
		for (;;) {
			const marker = this.byte();
			if (marker === 0x3b) {
				if (!this.image) invalid("missing image");
				if (this.control) invalid("graphic control without image");
				if (this.offset !== this.input.length) invalid("trailing stream bytes");
				return Object.freeze({
					image: this.image,
					version: header === "GIF87a" ? "87a" : "89a",
					frameCount: this.frameCount,
					animated: this.frameCount > 1,
					loopCount: this.loopCount,
					durationMs: this.durationMs,
					interlaced: this.interlaced,
					transparent: this.transparent,
					ignoredMetadata: Object.freeze([...this.ignoredMetadata]),
					compressedBytes: this.compressedBytes,
					decodedIndices: this.decodedIndices,
					work: this.work,
				});
			}
			if (++this.blocks > gifDecodeLimits.maxBlocks) limit("block");
			if (marker === 0x21) this.extension();
			else if (marker === 0x2c) this.frame(width, height, palette, background);
			else invalid("block marker");
		}
	}
}

export function decodeGif(
	input: Uint8Array,
	options: GifDecodeOptions = {},
): Readonly<DecodedGif> {
	if (
		!(input instanceof Uint8Array) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Reflect.ownKeys(options).some(
			(key) => key !== "maxWork" && key !== "maxPixels",
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid GIF decode arguments",
		);
	if (input.length > gifDecodeLimits.maxInputBytes) limit("input");
	const maxWork =
		options.maxWork === undefined ? gifDecodeLimits.maxWork : options.maxWork;
	const maxPixels =
		options.maxPixels === undefined
			? gifDecodeLimits.maxPixels
			: options.maxPixels;
	if (
		!Number.isSafeInteger(maxWork) ||
		maxWork < 1 ||
		maxWork > gifDecodeLimits.maxWork
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid GIF decode work limit",
		);
	if (
		!Number.isSafeInteger(maxPixels) ||
		maxPixels < 1 ||
		maxPixels > gifDecodeLimits.maxPixels
	)
		throw new AgentBrowserError("invalid-input", "Invalid GIF pixel limit");
	return new GifDecoder(input, maxWork, maxPixels).decode();
}
