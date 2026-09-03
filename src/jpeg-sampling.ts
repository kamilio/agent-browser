import { AgentBrowserError } from "./errors.js";

export interface JpegSamplePlane {
	width: number;
	height: number;
	stride: number;
	horizontal: number;
	vertical: number;
	samples: Uint8Array;
}

export function jpegSamplingWorkingBytes(
	width: number,
	horizontal: number,
	vertical: number,
	maxHorizontal: number,
	maxVertical: number,
): number {
	return horizontal === maxHorizontal && vertical === maxVertical
		? 0
		: width * (17 + (horizontal === maxHorizontal ? 0 : 16));
}

export class JpegSampleRows {
	private readonly direct: boolean;
	private readonly left?: Int32Array;
	private readonly right?: Int32Array;
	private readonly weight?: Float64Array;
	private readonly caches: { row: number; values: Float64Array }[];
	private readonly output?: Uint8Array;
	private lastRow = -1;
	constructor(
		private readonly source: JpegSamplePlane,
		private readonly width: number,
		private readonly height: number,
		maxHorizontal: number,
		private readonly maxVertical: number,
		private readonly charge: (units: number) => void,
	) {
		this.direct =
			source.horizontal === maxHorizontal && source.vertical === maxVertical;
		if (this.direct) {
			this.caches = [];
			return;
		}
		this.caches = [
			{ row: -1, values: new Float64Array(width) },
			{ row: -1, values: new Float64Array(width) },
		];
		this.output = new Uint8Array(width);
		if (source.horizontal !== maxHorizontal) {
			charge(width * 8);
			this.left = new Int32Array(width);
			this.right = new Int32Array(width);
			this.weight = new Float64Array(width);
			for (let column = 0; column < width; column++) {
				const position = Math.max(
					0,
					Math.min(
						source.width - 1,
						((column + 0.5) * source.horizontal) / maxHorizontal - 0.5,
					),
				);
				this.left[column] = Math.floor(position);
				this.right[column] = Math.min(source.width - 1, this.left[column] + 1);
				this.weight[column] = position - this.left[column];
			}
		}
	}
	private expanded(row: number, preserve: number): Float64Array {
		for (const cache of this.caches) if (cache.row === row) return cache.values;
		const cache = this.caches[this.caches[0].row === preserve ? 1 : 0];
		const offset = row * this.source.stride;
		this.charge(this.width * (this.weight ? 2 : 1));
		if (this.left && this.right && this.weight) {
			for (let column = 0; column < this.width; column++)
				cache.values[column] =
					this.source.samples[offset + this.left[column]] *
						(1 - this.weight[column]) +
					this.source.samples[offset + this.right[column]] *
						this.weight[column];
		} else
			for (let column = 0; column < this.width; column++)
				cache.values[column] = this.source.samples[offset + column];
		cache.row = row;
		return cache.values;
	}
	read(row: number): Uint8Array {
		if (!Number.isInteger(row) || row < 0 || row >= this.height)
			throw new AgentBrowserError("invalid-input", "Invalid JPEG sample row");
		if (this.direct) {
			this.charge(this.width);
			return this.source.samples.subarray(
				row * this.source.stride,
				row * this.source.stride + this.width,
			);
		}
		const output = this.output as Uint8Array;
		if (row === this.lastRow) return output;
		this.charge(8);
		const position = Math.max(
			0,
			Math.min(
				this.source.height - 1,
				((row + 0.5) * this.source.vertical) / this.maxVertical - 0.5,
			),
		);
		const top = Math.floor(position);
		const bottom = Math.min(this.source.height - 1, top + 1);
		const fraction = position - top;
		const upper = this.expanded(top, bottom);
		if (top === bottom || fraction === 0) {
			this.charge(this.width);
			for (let column = 0; column < this.width; column++)
				output[column] = Math.round(upper[column]);
		} else {
			const lower = this.expanded(bottom, top);
			this.charge(this.width * 2);
			for (let column = 0; column < this.width; column++)
				output[column] = Math.round(
					upper[column] * (1 - fraction) + lower[column] * fraction,
				);
		}
		this.lastRow = row;
		return output;
	}
}
