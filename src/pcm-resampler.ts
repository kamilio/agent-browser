import { AgentBrowserError } from "./errors.js";

export interface PcmResamplerOptions {
	inputSampleRate: number;
	outputSampleRate: number;
	inputChannels: 1 | 2;
	outputChannels: 1 | 2;
	maxInputFrames: number;
	maxOutputFrames: number;
	/** Absolute source-frame bound, including gaps. */
	maxDurationFrames: number;
}

const typedArrayPrototype = Object.getPrototypeOf(Float32Array.prototype);
const typedArrayBuffer = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"buffer",
)?.get;
const typedArrayOffset = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteOffset",
)?.get;
const typedArrayLength = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"length",
)?.get;
const typedArrayKind = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	Symbol.toStringTag,
)?.get;
const arrayBufferLength = Object.getOwnPropertyDescriptor(
	ArrayBuffer.prototype,
	"byteLength",
)?.get;
const maxBufferBytes = 16 * 1024 * 1024;
const maxCachedPhases = 256;

/** Bounded planar Float32 audio conversion. The sink receives owned, interleaved
 * PCM16 and an absolute frame offset in the output sample rate. Connect it to
 * PcmCapture.push; finish this converter before finishing the capture.
 * This transforms supplied audio; it does not acquire a device or network track.
 */
export class PcmResampler {
	private readonly options: Readonly<PcmResamplerOptions>;
	private readonly radius: number;
	private readonly kernels = new Map<number, Float64Array>();
	private buffers: Float64Array[] = [];
	private bufferStart = 0;
	private segmentStart: number | undefined;
	private sourceFrames = 0;
	private nextOutputFrame = 0;
	private outputFrames = 0;
	private state: "open" | "finished" | "closed" | "failed" = "open";
	private busy = false;
	private readonly append: (pcm: Uint8Array, sourceStartFrame: number) => void;

	constructor(
		options: PcmResamplerOptions,
		append: (pcm: Uint8Array, sourceStartFrame: number) => void,
	) {
		if (!options || typeof append !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid audio conversion options",
			);
		const {
			inputSampleRate,
			outputSampleRate,
			inputChannels,
			outputChannels,
			maxInputFrames,
			maxOutputFrames,
			maxDurationFrames,
		} = options;
		for (const value of [
			inputSampleRate,
			outputSampleRate,
			inputChannels,
			outputChannels,
			maxInputFrames,
			maxOutputFrames,
			maxDurationFrames,
		]) {
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError(
					"invalid-input",
					"Audio conversion bounds must be positive safe integers",
				);
		}
		if (
			inputSampleRate < 8000 ||
			inputSampleRate > 96000 ||
			outputSampleRate < 8000 ||
			outputSampleRate > 96000 ||
			(inputChannels !== 1 && inputChannels !== 2) ||
			(outputChannels !== 1 && outputChannels !== 2) ||
			!Number.isSafeInteger(
				(maxDurationFrames + 1) * Math.max(inputSampleRate, outputSampleRate),
			)
		) {
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid audio conversion format or duration",
			);
		}
		// A symmetric Blackman-windowed sinc suppresses aliases before decimation.
		// The lookahead is 32 output samples when downsampling; equal rates are exact.
		this.radius =
			inputSampleRate === outputSampleRate
				? 0
				: Math.ceil(32 / Math.min(1, outputSampleRate / inputSampleRate));
		if (
			(maxInputFrames + 2 * this.radius + 1) * outputChannels * 8 >
				maxBufferBytes ||
			maxInputFrames * inputChannels * 4 > maxBufferBytes ||
			maxOutputFrames * outputChannels * 2 > maxBufferBytes
		) {
			throw new AgentBrowserError(
				"resource-limit",
				"Audio conversion buffers must not exceed 16 MiB",
			);
		}
		this.options = Object.freeze({
			inputSampleRate,
			outputSampleRate,
			inputChannels,
			outputChannels,
			maxInputFrames,
			maxOutputFrames,
			maxDurationFrames,
		});
		this.append = append;
	}

	push(input: readonly Float32Array[], sourceStartFrame: number): void {
		this.assertOpen();
		this.busy = true;
		try {
			// Validate and copy the whole packet before a gap flush can call the sink.
			const channels = this.copyInput(input, sourceStartFrame);
			const frames = channels[0].length;
			try {
				if (
					this.segmentStart !== undefined &&
					sourceStartFrame !== this.sourceFrames
				) {
					this.drain(true);
					this.clearAudio();
				}
				if (this.segmentStart === undefined) {
					this.segmentStart = this.bufferStart = sourceStartFrame;
					this.nextOutputFrame = this.outputFrameAt(sourceStartFrame);
					this.buffers = channels;
				} else {
					this.buffers = this.buffers.map((previous, index) => {
						const joined = new Float64Array(previous.length + frames);
						joined.set(previous);
						joined.set(channels[index], previous.length);
						return joined;
					});
				}
				this.sourceFrames = sourceStartFrame + frames;
				this.drain(false);
				const keepFrom = Math.max(
					this.bufferStart,
					Math.floor(
						(this.nextOutputFrame * this.options.inputSampleRate) /
							this.options.outputSampleRate,
					) - this.radius,
				);
				const discard = Math.min(
					this.buffers[0].length,
					keepFrom - this.bufferStart,
				);
				this.buffers = this.buffers.map((buffer) => buffer.slice(discard));
				this.bufferStart += discard;
			} catch (error) {
				this.fail();
				throw error;
			}
		} finally {
			this.busy = false;
		}
	}

	/** Discard filter history and pending output, e.g. when pausing a recorder.
	 * The source clock stays monotonic; the next packet begins a fresh segment.
	 */
	reset(): void {
		this.assertOpen();
		this.clearAudio();
	}

	finish(): void {
		this.assertNotBusy();
		if (this.state === "finished") return;
		this.assertOpen();
		this.busy = true;
		try {
			this.drain(true);
			this.state = "finished";
			this.clearAudio();
			this.kernels.clear();
		} catch (error) {
			this.fail();
			throw error;
		} finally {
			this.busy = false;
		}
	}

	close(): void {
		this.assertNotBusy();
		if (this.state !== "open") return;
		this.state = "closed";
		this.clearAudio();
		this.kernels.clear();
	}

	metrics() {
		return Object.freeze({
			state: this.state,
			sourceFrames: this.sourceFrames,
			outputFrames: this.outputFrames,
			retainedFrames: this.buffers[0]?.length ?? 0,
			retainedBytes:
				this.buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0) +
				[...this.kernels.values()].reduce(
					(sum, kernel) => sum + kernel.byteLength,
					0,
				),
		});
	}

	private copyInput(
		input: readonly Float32Array[],
		start: number,
	): Float64Array[] {
		if (
			!Array.isArray(input) ||
			input.length !== this.options.inputChannels ||
			!Number.isSafeInteger(start) ||
			start < this.sourceFrames
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Expected audio channels and a nonoverlapping source frame offset",
			);
		const channels: Float32Array[] = [];
		for (let index = 0; index < this.options.inputChannels; index++)
			channels.push(floatView(input[index]));
		const frames = channels[0].length;
		if (frames === 0 || channels.some((channel) => channel.length !== frames))
			throw new AgentBrowserError(
				"invalid-input",
				"Audio channels must contain the same nonzero number of frames",
			);
		if (
			frames > this.options.maxInputFrames ||
			start > this.options.maxDurationFrames - frames
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Audio input exceeds its frame or duration bound",
			);
		const output = Array.from(
			{ length: this.options.outputChannels },
			() => new Float64Array(frames),
		);
		for (let frame = 0; frame < frames; frame++) {
			const left = channels[0][frame];
			const right = channels[1]?.[frame] ?? left;
			if (!Number.isFinite(left) || !Number.isFinite(right))
				throw new AgentBrowserError(
					"invalid-input",
					"Audio samples must be finite",
				);
			if (output.length === 1) output[0][frame] = (left + right) / 2;
			else {
				output[0][frame] = left;
				output[1][frame] = right;
			}
		}
		return output;
	}

	private drain(final: boolean): void {
		if (this.segmentStart === undefined) return;
		const {
			inputSampleRate,
			outputSampleRate,
			outputChannels,
			maxOutputFrames,
		} = this.options;
		const end = this.outputFrameAt(
			this.sourceFrames - (final ? 0 : this.radius),
		);
		while (this.nextOutputFrame < end) {
			const start = this.nextOutputFrame;
			const frames = Math.min(end - start, maxOutputFrames);
			const pcm = new Uint8Array(frames * outputChannels * 2);
			const view = new DataView(pcm.buffer);
			for (let frame = 0; frame < frames; frame++) {
				// Integer frame products keep phase independent of packet boundaries.
				const numerator = (start + frame) * inputSampleRate;
				const center = Math.floor(numerator / outputSampleRate);
				const kernel =
					this.radius === 0
						? undefined
						: this.kernel(numerator % outputSampleRate);
				for (let channel = 0; channel < outputChannels; channel++) {
					const buffer = this.buffers[channel];
					let sample = 0;
					if (kernel === undefined) sample = buffer[center - this.bufferStart];
					else
						for (let tap = 0; tap < kernel.length; tap++) {
							const source = center - this.radius + 1 + tap;
							if (source >= this.segmentStart && source < this.sourceFrames)
								sample += buffer[source - this.bufferStart] * kernel[tap];
						}
					const clipped = Math.max(-1, Math.min(1, sample));
					view.setInt16(
						(frame * outputChannels + channel) * 2,
						Math.round(clipped * (clipped < 0 ? 32768 : 32767)),
						true,
					);
				}
			}
			const append = this.append;
			const result: unknown = append(pcm, start);
			if (
				result !== null &&
				(typeof result === "object" || typeof result === "function") &&
				typeof (result as { then?: unknown }).then === "function"
			) {
				void Promise.resolve(result).catch(() => {});
				throw new AgentBrowserError(
					"unsupported",
					"Audio conversion requires a synchronous sink",
				);
			}
			this.nextOutputFrame += frames;
			this.outputFrames += frames;
		}
	}

	private kernel(phase: number): Float64Array {
		const cached = this.kernels.get(phase);
		if (cached) return cached;
		const fraction = phase / this.options.outputSampleRate;
		const cutoff =
			0.45 *
			Math.min(1, this.options.outputSampleRate / this.options.inputSampleRate);
		const kernel = new Float64Array(this.radius * 2);
		let total = 0;
		for (let tap = 0; tap < kernel.length; tap++) {
			const distance = tap - this.radius + 1 - fraction;
			const angle = 2 * Math.PI * cutoff * distance;
			const sinc = angle === 0 ? 1 : Math.sin(angle) / angle;
			const window =
				0.42 +
				0.5 * Math.cos((Math.PI * distance) / this.radius) +
				0.08 * Math.cos((2 * Math.PI * distance) / this.radius);
			total += kernel[tap] = 2 * cutoff * sinc * window;
		}
		for (let tap = 0; tap < kernel.length; tap++) kernel[tap] /= total;
		if (this.kernels.size >= maxCachedPhases)
			this.kernels.delete(this.kernels.keys().next().value as number);
		this.kernels.set(phase, kernel);
		return kernel;
	}

	private outputFrameAt(source: number): number {
		return Math.ceil(
			(source * this.options.outputSampleRate) / this.options.inputSampleRate,
		);
	}
	private clearAudio(): void {
		this.buffers = [];
		this.segmentStart = undefined;
	}
	private fail(): void {
		this.state = "failed";
		this.clearAudio();
		this.kernels.clear();
	}
	private assertNotBusy(): void {
		if (this.busy)
			throw new AgentBrowserError(
				"invalid-input",
				"Audio conversion cannot be reentered",
			);
	}
	private assertOpen(): void {
		this.assertNotBusy();
		if (this.state !== "open")
			throw new AgentBrowserError("closed", "Audio converter is not open");
	}
}

function floatView(value: Float32Array): Float32Array {
	try {
		if (typedArrayKind?.call(value) !== "Float32Array") throw new TypeError();
		const buffer = typedArrayBuffer?.call(value);
		arrayBufferLength?.call(buffer);
		return new Float32Array(
			buffer,
			typedArrayOffset?.call(value),
			typedArrayLength?.call(value),
		);
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"Expected an unshared Float32 audio view",
		);
	}
}
