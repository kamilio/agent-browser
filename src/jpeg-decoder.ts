import { AgentBrowserError } from "./errors.js";
import {
	inverseJpegBlock,
	jpegInverseBlockWork,
	scaleJpegQuantization,
} from "./jpeg-idct.js";
import { JpegSampleRows, jpegSamplingWorkingBytes } from "./jpeg-sampling.js";
import { createRaster, rasterLimits, type RasterImage } from "./raster.js";

export const jpegDecodeLimits = Object.freeze({
	maxInputBytes: 33_554_432,
	maxSegments: 4096,
	maxScans: 256,
	maxWork: 268_435_456,
	maxWorkingBytes: 67_108_864,
	maxDimension: rasterLimits.maxDimension,
	maxPixels: rasterLimits.maxPixels,
});
export interface JpegDecodeOptions {
	maxWork?: number;
	maxPixels?: number;
	maxWorkingBytes?: number;
}
export interface DecodedJpeg {
	readonly image: Readonly<RasterImage>;
	readonly progressive: boolean;
	readonly colorSpace: "grayscale" | "rgb" | "ycbcr";
	readonly scans: number;
	readonly restartMarkers: number;
	readonly ignoredAppMarkers: readonly string[];
	readonly encodedBytes: number;
	readonly workingBytes: number;
	readonly work: number;
}
interface HuffmanTable {
	minimum: Int32Array;
	maximum: Int32Array;
	position: Int32Array;
	symbols: Uint8Array;
}
interface Component {
	id: number;
	horizontal: number;
	vertical: number;
	quantizer: number;
	quantization?: Uint16Array;
	width: number;
	height: number;
	stride: number;
	rows: number;
	coefficients: Int32Array;
	samples: Uint8Array;
	approximation: Int8Array;
	predictor: number;
}
interface ScanComponent {
	component: Component;
	dc?: HuffmanTable;
	ac?: HuffmanTable;
}

const zigzag: number[] = [];
for (let diagonal = 0; diagonal < 15; diagonal++) {
	const first = Math.max(0, diagonal - 7);
	const last = Math.min(7, diagonal);
	for (let step = first; step <= last; step++) {
		const row = diagonal % 2 ? step : diagonal - step;
		zigzag.push(row * 8 + diagonal - row);
	}
}
function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", `Invalid JPEG: ${message}`);
}
function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", `Unsupported JPEG: ${message}`);
}
function coefficient(value: number) {
	if (!Number.isSafeInteger(value) || Math.abs(value) > 1_048_576)
		invalid("coefficient magnitude");
	return value;
}
function sample(value: number) {
	return Math.max(0, Math.min(255, Math.round(value)));
}

class EntropyReader {
	private current = 0;
	private remaining = 0;
	constructor(
		private readonly input: Uint8Array,
		public offset: number,
		private readonly charge: (units?: number) => void,
	) {}
	bit() {
		this.charge();
		if (!this.remaining) {
			if (this.offset >= this.input.length) invalid("truncated entropy data");
			this.current = this.input[this.offset++];
			if (this.current === 255 && this.input[this.offset++] !== 0)
				invalid("premature entropy marker");
			this.remaining = 8;
		}
		return (this.current >> --this.remaining) & 1;
	}
	bits(count: number) {
		let result = 0;
		for (let index = 0; index < count; index++)
			result = result * 2 + this.bit();
		return result;
	}
	signed(count: number) {
		const value = this.bits(count);
		return count && value < 2 ** (count - 1) ? value + 1 - 2 ** count : value;
	}
	decode(table: HuffmanTable | undefined) {
		if (!table) invalid("missing Huffman table");
		let code = 0;
		for (let length = 1; length <= 16; length++) {
			code = code * 2 + this.bit();
			if (table.maximum[length] >= 0 && code <= table.maximum[length]) {
				if (code < table.minimum[length]) invalid("Huffman code");
				return table.symbols[
					table.position[length] + code - table.minimum[length]
				];
			}
		}
		return invalid("Huffman code exceeds 16 bits");
	}
	align() {
		const mask = (1 << this.remaining) - 1;
		if ((this.current & mask) !== mask)
			invalid("entropy padding is not all ones");
		this.remaining = 0;
	}
	restart(expected: number) {
		this.align();
		if (this.input[this.offset++] !== 255) invalid("missing restart marker");
		while (this.input[this.offset] === 255) {
			this.charge();
			this.offset++;
		}
		if (this.input[this.offset++] !== 0xd0 + expected)
			invalid("restart marker sequence");
	}
}

class JpegDecoder {
	private offset = 2;
	private work = 0;
	private workingBytes = 0;
	private width = 0;
	private height = 0;
	private frame = 0;
	private maxHorizontal = 1;
	private maxVertical = 1;
	private columns = 0;
	private rows = 0;
	private scans = 0;
	private restartInterval = 0;
	private restartMarkers = 0;
	private jfif = false;
	private adobe: number | undefined;
	private components: Component[] = [];
	private quantizers = new Map<
		number,
		{ values: Uint16Array; precision: number }
	>();
	private huffman = new Map<number, HuffmanTable>();
	private ignored = new Set<string>();
	constructor(
		private readonly input: Uint8Array,
		private readonly limits: {
			maxWork: number;
			maxPixels: number;
			maxWorkingBytes: number;
		},
	) {}
	private charge = (units = 1) => {
		this.work += units;
		if (this.work > this.limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"JPEG decode work limit exceeded",
			);
	};
	private word(data: Uint8Array, offset: number) {
		if (offset + 2 > data.length) invalid("truncated segment integer");
		return data[offset] * 256 + data[offset + 1];
	}
	private marker() {
		if (this.input[this.offset++] !== 255) invalid("expected marker");
		while (this.input[this.offset] === 255) {
			this.charge();
			this.offset++;
		}
		if (this.offset >= this.input.length) invalid("truncated marker");
		return this.input[this.offset++];
	}
	private segment() {
		const length = this.word(this.input, this.offset);
		if (length < 2 || this.offset + length > this.input.length)
			invalid("segment length");
		this.charge(length);
		const data = this.input.subarray(this.offset + 2, this.offset + length);
		this.offset += length;
		return data;
	}
	private frameHeader(marker: number, data: Uint8Array) {
		if (this.frame) invalid("multiple frames");
		if (data.length < 6) invalid("frame header length");
		if (data[0] !== 8) unsupported("sample precision is not 8 bits");
		this.height = this.word(data, 1);
		this.width = this.word(data, 3);
		if (!this.width || !this.height)
			unsupported("zero or deferred frame dimensions");
		if (
			this.width > jpegDecodeLimits.maxDimension ||
			this.height > jpegDecodeLimits.maxDimension ||
			this.width * this.height > this.limits.maxPixels
		)
			throw new AgentBrowserError(
				"resource-limit",
				"JPEG pixel limit exceeded",
			);
		if (data[5] !== 1 && data[5] !== 3)
			unsupported("component count is not one or three");
		if (data.length !== 6 + data[5] * 3) invalid("frame component length");
		const descriptions: {
			id: number;
			horizontal: number;
			vertical: number;
			quantizer: number;
		}[] = [];
		for (let offset = 6; offset < data.length; offset += 3) {
			const id = data[offset];
			const horizontal = data[offset + 1] >> 4;
			const vertical = data[offset + 1] & 15;
			const quantizer = data[offset + 2];
			if (
				!horizontal ||
				horizontal > 4 ||
				!vertical ||
				vertical > 4 ||
				quantizer > 3 ||
				descriptions.some((entry) => entry.id === id)
			)
				invalid("frame component descriptor");
			descriptions.push({ id, horizontal, vertical, quantizer });
			this.maxHorizontal = Math.max(this.maxHorizontal, horizontal);
			this.maxVertical = Math.max(this.maxVertical, vertical);
		}
		if (
			descriptions.reduce(
				(total, entry) => total + entry.horizontal * entry.vertical,
				0,
			) > 10
		)
			unsupported("more than ten blocks per frame MCU");
		this.columns = Math.ceil(this.width / (8 * this.maxHorizontal));
		this.rows = Math.ceil(this.height / (8 * this.maxVertical));
		this.workingBytes = descriptions.reduce(
			(total, entry) =>
				total +
				this.columns * entry.horizontal * this.rows * entry.vertical * 64 * 5 +
				jpegSamplingWorkingBytes(
					this.width,
					entry.horizontal,
					entry.vertical,
					this.maxHorizontal,
					this.maxVertical,
				),
			16_384,
		);
		if (this.workingBytes > this.limits.maxWorkingBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"JPEG working buffer limit exceeded",
			);
		this.charge(Math.ceil(this.workingBytes / 5));
		this.components = descriptions.map((entry) => {
			const stride = this.columns * entry.horizontal;
			const rows = this.rows * entry.vertical;
			return {
				...entry,
				width: Math.ceil((this.width * entry.horizontal) / this.maxHorizontal),
				height: Math.ceil((this.height * entry.vertical) / this.maxVertical),
				stride,
				rows,
				coefficients: new Int32Array(stride * rows * 64),
				samples: new Uint8Array(stride * rows * 64),
				approximation: new Int8Array(64).fill(-1),
				predictor: 0,
			};
		});
		this.frame = marker;
	}
	private quantization(data: Uint8Array) {
		if (!data.length) invalid("empty quantization segment");
		for (let offset = 0; offset < data.length; ) {
			const descriptor = data[offset++];
			const precision = descriptor >> 4;
			const id = descriptor & 15;
			if (
				precision > 1 ||
				id > 3 ||
				offset + 64 * (precision + 1) > data.length
			)
				invalid("quantization table descriptor");
			const values = new Uint16Array(64);
			for (let index = 0; index < 64; index++) {
				const value = precision ? this.word(data, offset) : data[offset];
				if (!value) invalid("zero quantization value");
				values[zigzag[index]] = value;
				offset += precision + 1;
			}
			this.quantizers.set(id, { values, precision });
		}
	}
	private huffmanTables(data: Uint8Array) {
		if (!data.length) invalid("empty Huffman segment");
		for (let offset = 0; offset < data.length; ) {
			const descriptor = data[offset++];
			if (
				descriptor >> 4 > 1 ||
				(descriptor & 15) > 3 ||
				offset + 16 > data.length
			)
				invalid("Huffman descriptor");
			const counts = data.subarray(offset, offset + 16);
			offset += 16;
			const count = counts.reduce((total, value) => total + value, 0);
			if (!count || count > 256 || offset + count > data.length)
				invalid("Huffman symbol count");
			const table: HuffmanTable = {
				minimum: new Int32Array(17),
				maximum: new Int32Array(17).fill(-1),
				position: new Int32Array(17),
				symbols: data.slice(offset, offset + count),
			};
			let code = 0;
			let position = 0;
			for (let length = 1; length <= 16; length++) {
				const size = counts[length - 1];
				if (size && code + size >= 2 ** length)
					invalid("oversubscribed or all-ones Huffman code");
				if (size) {
					table.minimum[length] = code;
					table.maximum[length] = code + size - 1;
					table.position[length] = position;
				}
				code = (code + size) * 2;
				position += size;
			}
			this.huffman.set(descriptor, table);
			offset += count;
		}
	}
	private scan(data: Uint8Array) {
		if (!this.frame || data.length < 6) invalid("scan without complete frame");
		if (++this.scans > jpegDecodeLimits.maxScans)
			throw new AgentBrowserError("resource-limit", "JPEG scan limit exceeded");
		const count = data[0];
		if (
			!count ||
			count > this.components.length ||
			data.length !== 4 + count * 2
		)
			invalid("scan component count");
		const start = data[data.length - 3];
		const end = data[data.length - 2];
		const high = data[data.length - 1] >> 4;
		const low = data[data.length - 1] & 15;
		const progressive = this.frame === 0xc2;
		if (
			progressive
				? start > end ||
					end > 63 ||
					(start === 0 ? end !== 0 : count !== 1) ||
					high > 13 ||
					low > 13 ||
					(high !== 0 && high !== low + 1)
				: start !== 0 || end !== 63 || high !== 0 || low !== 0
		)
			invalid("scan spectral or approximation parameters");
		const selected: ScanComponent[] = [];
		for (let index = 0; index < count; index++) {
			const component = this.components.find(
				(entry) => entry.id === data[1 + index * 2],
			);
			const selectors = data[2 + index * 2];
			const dc = selectors >> 4;
			const ac = selectors & 15;
			if (
				!component ||
				selected.some((entry) => entry.component === component) ||
				dc > 3 ||
				ac > 3 ||
				(this.frame === 0xc0 && (dc > 1 || ac > 1))
			)
				invalid("scan table selector");
			if (
				progressive &&
				((start === 0 && ac !== 0) || (start !== 0 && dc !== 0))
			)
				invalid("unused progressive table selector");
			if (progressive && start > 0 && component.approximation[0] < 0)
				invalid("AC scan precedes DC scan");
			for (let spectral = start; spectral <= end; spectral++) {
				if (component.approximation[spectral] !== (high ? high : -1))
					invalid("duplicate or out-of-order coefficient scan");
				component.approximation[spectral] = low;
			}
			if (!component.quantization) {
				const quantizer = this.quantizers.get(component.quantizer);
				if (!quantizer) invalid("missing quantization table");
				if (this.frame === 0xc0 && quantizer.precision !== 0)
					invalid("baseline quantization precision");
				component.quantization = quantizer.values;
			}
			selected.push({
				component,
				dc: this.huffman.get(dc),
				ac: this.huffman.get(16 + ac),
			});
			component.predictor = 0;
		}
		const reader = new EntropyReader(this.input, this.offset, this.charge);
		let eob = 0;
		const bitValue = 2 ** low;
		const refine = (values: Int32Array, position: number) => {
			if (reader.bit() && !(Math.abs(values[position]) & bitValue))
				values[position] = coefficient(
					values[position] + (values[position] < 0 ? -bitValue : bitValue),
				);
		};
		const block = (entry: ScanComponent, column: number, row: number) => {
			this.charge(64);
			const component = entry.component;
			const values = component.coefficients;
			const base = (row * component.stride + column) * 64;
			if (start === 0) {
				if (high)
					values[base] = coefficient(values[base] | (reader.bit() * bitValue));
				else {
					const size = reader.decode(entry.dc);
					if (size > 11) invalid("DC magnitude category");
					component.predictor = coefficient(
						component.predictor + reader.signed(size),
					);
					values[base] = coefficient(component.predictor * bitValue);
				}
				if (progressive) return;
			}
			let spectral = Math.max(1, start);
			if (!high) {
				if (eob) {
					eob--;
					return;
				}
				while (spectral <= end) {
					const symbol = reader.decode(entry.ac);
					const run = symbol >> 4;
					const size = symbol & 15;
					if (!size) {
						if (run === 15) {
							spectral += 16;
							if (spectral > end + 1) invalid("AC zero run exceeds band");
							continue;
						}
						if (!progressive && run !== 0) invalid("sequential EOB run");
						eob = progressive ? 2 ** run + reader.bits(run) - 1 : 0;
						break;
					}
					if (size > 10) invalid("AC magnitude category");
					spectral += run;
					if (spectral > end) invalid("AC coefficient exceeds band");
					values[base + zigzag[spectral++]] = coefficient(
						reader.signed(size) * bitValue,
					);
				}
			} else {
				if (!eob)
					while (spectral <= end) {
						const symbol = reader.decode(entry.ac);
						let zeros = symbol >> 4;
						const size = symbol & 15;
						let added = 0;
						if (size) {
							if (size !== 1) invalid("AC refinement category");
							added = reader.bit() ? bitValue : -bitValue;
						} else if (zeros !== 15) {
							eob = 2 ** zeros + reader.bits(zeros);
							break;
						} else zeros = 16;
						while (spectral <= end) {
							const position = base + zigzag[spectral];
							if (values[position]) {
								refine(values, position);
								spectral++;
							} else {
								if (!zeros) break;
								zeros--;
								spectral++;
								if (!zeros && !added) break;
							}
						}
						if (zeros) invalid("AC refinement run exceeds band");
						if (added) {
							if (spectral > end)
								invalid("AC refinement coefficient exceeds band");
							values[base + zigzag[spectral++]] = added;
						}
					}
				if (eob) {
					for (; spectral <= end; spectral++) {
						const position = base + zigzag[spectral];
						if (values[position]) refine(values, position);
					}
					eob--;
				}
			}
		};
		const single = selected[0].component;
		const columns = count === 1 ? Math.ceil(single.width / 8) : this.columns;
		const rows = count === 1 ? Math.ceil(single.height / 8) : this.rows;
		for (let mcu = 0; mcu < columns * rows; mcu++) {
			if (mcu && this.restartInterval && mcu % this.restartInterval === 0) {
				if (eob) invalid("EOB run crosses restart boundary");
				reader.restart((Math.floor(mcu / this.restartInterval) - 1) % 8);
				this.restartMarkers++;
				for (const entry of selected) entry.component.predictor = 0;
			}
			const column = mcu % columns;
			const row = Math.floor(mcu / columns);
			for (const entry of selected) {
				if (count === 1) block(entry, column, row);
				else
					for (
						let vertical = 0;
						vertical < entry.component.vertical;
						vertical++
					)
						for (
							let horizontal = 0;
							horizontal < entry.component.horizontal;
							horizontal++
						)
							block(
								entry,
								column * entry.component.horizontal + horizontal,
								row * entry.component.vertical + vertical,
							);
			}
		}
		if (eob) invalid("EOB run exceeds scan");
		reader.align();
		this.offset = reader.offset;
	}
	private reconstruct(component: Component) {
		const quantization = component.quantization;
		if (!quantization) invalid("component has no quantization table");
		const intermediate = new Float64Array(64);
		let scaledQuantization: Float64Array | undefined;
		const coefficients = component.coefficients;
		for (let row = 0; row < Math.ceil(component.height / 8); row++)
			for (let column = 0; column < Math.ceil(component.width / 8); column++) {
				const base = (row * component.stride + column) * 64;
				this.charge(64);
				let constant = true;
				for (let index = 1; index < 64; index++)
					if (coefficients[base + index]) {
						constant = false;
						break;
					}
				if (constant) {
					const value = sample(
						(coefficients[base] * quantization[0]) / 8 + 128,
					);
					for (let vertical = 0; vertical < 8; vertical++)
						component.samples.fill(
							value,
							(row * 8 + vertical) * component.stride * 8 + column * 8,
							(row * 8 + vertical) * component.stride * 8 + column * 8 + 8,
						);
					continue;
				}
				if (!scaledQuantization) {
					this.charge(128);
					scaledQuantization = scaleJpegQuantization(quantization);
				}
				this.charge(jpegInverseBlockWork);
				inverseJpegBlock(
					coefficients,
					base,
					scaledQuantization,
					intermediate,
					component.samples,
					row * 8 * component.stride * 8 + column * 8,
					component.stride * 8,
				);
			}
	}
	private colorSpace(): DecodedJpeg["colorSpace"] {
		if (this.components.length === 1) {
			if (this.adobe !== undefined && this.adobe !== 0)
				unsupported("grayscale Adobe transform");
			return "grayscale";
		}
		if (this.adobe === 2) unsupported("YCCK transform");
		if (this.jfif && this.adobe === 0)
			unsupported("conflicting JFIF and Adobe color spaces");
		if (
			this.adobe === 0 ||
			(!this.jfif &&
				this.adobe === undefined &&
				this.components.map((entry) => entry.id).join(",") === "82,71,66")
		)
			return "rgb";
		return "ycbcr";
	}
	run(): Readonly<DecodedJpeg> {
		if (this.limits.maxWorkingBytes < 16_384)
			throw new AgentBrowserError(
				"resource-limit",
				"JPEG working buffer limit exceeded",
			);
		for (let segments = 0; ; segments++) {
			this.charge();
			if (segments >= jpegDecodeLimits.maxSegments)
				throw new AgentBrowserError(
					"resource-limit",
					"JPEG segment limit exceeded",
				);
			const marker = this.marker();
			if (marker === 0xd9) {
				if (
					!this.scans ||
					this.components.some((entry) => entry.approximation[0] < 0)
				)
					invalid("missing component scans");
				if (this.offset !== this.input.length) invalid("trailing data");
				break;
			}
			if (
				marker === 0 ||
				marker === 0xd8 ||
				marker === 1 ||
				(marker >= 0xd0 && marker <= 0xd7)
			)
				invalid("unexpected standalone marker");
			const data = this.segment();
			if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2)
				this.frameHeader(marker, data);
			else if (marker === 0xdb) this.quantization(data);
			else if (marker === 0xc4) this.huffmanTables(data);
			else if (marker === 0xda) this.scan(data);
			else if (marker === 0xdd) {
				if (data.length !== 2) invalid("restart interval length");
				this.restartInterval = this.word(data, 0);
			} else if (marker === 0xfe) this.ignored.add("COM");
			else if (marker >= 0xe0 && marker <= 0xef) {
				const prefix = String.fromCharCode(...data.subarray(0, 5));
				if (marker === 0xe0 && prefix === "JFIF\0") {
					if (data.length < 14 || data.length !== 14 + data[12] * data[13] * 3)
						invalid("JFIF segment length");
					this.jfif = true;
				} else if (marker === 0xee && prefix === "Adobe") {
					if (data.length !== 12 || data[11] > 2) invalid("Adobe segment");
					if (this.adobe !== undefined && this.adobe !== data[11])
						invalid("conflicting Adobe transforms");
					this.adobe = data[11];
				} else this.ignored.add(`APP${marker - 0xe0}`);
			} else unsupported(`marker 0x${marker.toString(16)}`);
		}
		const colorSpace = this.colorSpace();
		for (const component of this.components) this.reconstruct(component);
		this.charge(this.width * this.height * 4);
		const readers = this.components.map(
			(component) =>
				new JpegSampleRows(
					{ ...component, stride: component.stride * 8 },
					this.width,
					this.height,
					this.maxHorizontal,
					this.maxVertical,
					this.charge,
				),
		);
		const image = createRaster(this.width, this.height);
		for (let row = 0; row < this.height; row++) {
			const firstRow = readers[0].read(row);
			const secondRow =
				colorSpace === "grayscale" ? firstRow : readers[1].read(row);
			const thirdRow =
				colorSpace === "grayscale" ? firstRow : readers[2].read(row);
			for (let column = 0; column < this.width; column++) {
				const offset = (row * this.width + column) * 4;
				const first = firstRow[column];
				if (colorSpace === "grayscale")
					image.pixels.fill(first, offset, offset + 3);
				else {
					const second = secondRow[column];
					const third = thirdRow[column];
					image.pixels[offset] =
						colorSpace === "rgb"
							? first
							: sample(first + 1.402 * (third - 128));
					image.pixels[offset + 1] =
						colorSpace === "rgb"
							? second
							: sample(
									first - 0.344136 * (second - 128) - 0.714136 * (third - 128),
								);
					image.pixels[offset + 2] =
						colorSpace === "rgb"
							? third
							: sample(first + 1.772 * (second - 128));
				}
				image.pixels[offset + 3] = 255;
			}
		}
		return Object.freeze({
			image,
			progressive: this.frame === 0xc2,
			colorSpace,
			scans: this.scans,
			restartMarkers: this.restartMarkers,
			ignoredAppMarkers: Object.freeze([...this.ignored]),
			encodedBytes: this.input.length,
			workingBytes: this.workingBytes,
			work: this.work,
		});
	}
}

export function decodeJpeg(
	input: Uint8Array,
	options: JpegDecodeOptions = {},
): Readonly<DecodedJpeg> {
	if (
		!(input instanceof Uint8Array) ||
		!options ||
		typeof options !== "object" ||
		Array.isArray(options)
	)
		throw new AgentBrowserError("invalid-input", "Invalid JPEG decode input");
	for (const [key, value] of Object.entries(options)) {
		if (
			!(["maxWork", "maxPixels", "maxWorkingBytes"] as string[]).includes(
				key,
			) ||
			!Number.isSafeInteger(value) ||
			value < 1 ||
			value > jpegDecodeLimits[key as keyof JpegDecodeOptions]
		)
			throw new AgentBrowserError("invalid-input", "Invalid JPEG decode limit");
	}
	if (input.length > jpegDecodeLimits.maxInputBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"JPEG input byte limit exceeded",
		);
	if (input.length < 4 || input[0] !== 255 || input[1] !== 0xd8)
		invalid("SOI signature");
	return new JpegDecoder(input, {
		maxWork: options.maxWork ?? jpegDecodeLimits.maxWork,
		maxPixels: options.maxPixels ?? jpegDecodeLimits.maxPixels,
		maxWorkingBytes:
			options.maxWorkingBytes ?? jpegDecodeLimits.maxWorkingBytes,
	}).run();
}
