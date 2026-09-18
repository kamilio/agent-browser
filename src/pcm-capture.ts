import { AgentBrowserError } from "./errors.js";

export interface PcmCaptureOptions {
	sampleRate: number;
	channels: 1 | 2;
	chunkFrames: number;
	maxInputFrames: number;
	maxDurationFrames: number;
	maxChunks: number;
}

export interface PcmCaptureChunk {
	readonly sequence: number;
	readonly startFrame: number;
	readonly startMs: number;
	readonly sourceEndFrame: number;
	readonly frames: number;
	readonly pcm: Uint8Array;
}

export class PcmCapture {
	private readonly options: PcmCaptureOptions;
	private readonly append: (chunk: PcmCaptureChunk) => void;
	private readonly frameBytes: number;
	private readonly chunkBytes: number;
	private state: "recording" | "finished" | "closed" | "failed" = "recording";
	private paused = false;
	private busy = false;
	private sourceFrames = 0;
	private pausedFrames = 0;
	private gapFrames = 0;
	private acceptedFrames = 0;
	private discardedFrames = 0;
	private savedFrames = 0;
	private chunks = 0;
	private buffer: Uint8Array | undefined;
	private bufferedFrames = 0;
	private bufferedSourceEndFrame = 0;

	constructor(
		options: PcmCaptureOptions,
		append: (chunk: PcmCaptureChunk) => void,
	) {
		if (!options || typeof append !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid PCM capture options",
			);
		const {
			sampleRate,
			channels,
			chunkFrames,
			maxInputFrames,
			maxDurationFrames,
			maxChunks,
		} = options;
		for (const value of [
			sampleRate,
			channels,
			chunkFrames,
			maxInputFrames,
			maxDurationFrames,
			maxChunks,
		])
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError(
					"invalid-input",
					"PCM capture bounds must be positive safe integers",
				);
		if (
			sampleRate < 8000 ||
			sampleRate > 96000 ||
			(channels !== 1 && channels !== 2) ||
			chunkFrames > maxDurationFrames ||
			!Number.isSafeInteger(maxDurationFrames * channels * 2)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid PCM capture format",
			);
		this.frameBytes = channels * 2;
		this.chunkBytes = chunkFrames * this.frameBytes;
		if (
			this.chunkBytes > 16 * 1024 * 1024 ||
			maxInputFrames * this.frameBytes > 16 * 1024 * 1024
		)
			throw new AgentBrowserError(
				"resource-limit",
				"PCM capture chunks and inputs must not exceed 16 MiB",
			);
		this.options = {
			sampleRate,
			channels,
			chunkFrames,
			maxInputFrames,
			maxDurationFrames,
			maxChunks,
		};
		this.append = append;
	}

	push(pcm: Uint8Array, sourceStartFrame: number): void {
		this.assertRecording();
		const input = pcmView(pcm);
		if (
			input.byteLength === 0 ||
			input.byteLength % this.frameBytes !== 0 ||
			!Number.isSafeInteger(sourceStartFrame) ||
			sourceStartFrame < this.sourceFrames
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Expected owned complete PCM16 frames and a nonoverlapping source offset",
			);
		const frames = input.byteLength / this.frameBytes;
		if (
			frames > this.options.maxInputFrames ||
			sourceStartFrame > this.options.maxDurationFrames - frames
		)
			throw new AgentBrowserError(
				"resource-limit",
				"PCM capture input or source duration exceeds its bound",
			);
		const gap = sourceStartFrame - this.sourceFrames;
		if (this.paused) {
			this.pausedFrames += gap + frames;
			this.sourceFrames = sourceStartFrame + frames;
			return;
		}
		const owned = new Uint8Array(input);
		this.sourceFrames = sourceStartFrame + frames;
		this.gapFrames += gap;
		this.acceptedFrames += frames;
		this.busy = true;
		try {
			let offset = 0;
			while (offset < owned.byteLength) {
				this.buffer ??= new Uint8Array(this.chunkBytes);
				const usedBytes = this.bufferedFrames * this.frameBytes;
				const copied = Math.min(
					this.chunkBytes - usedBytes,
					owned.byteLength - offset,
				);
				this.buffer.set(owned.subarray(offset, offset + copied), usedBytes);
				this.bufferedFrames += copied / this.frameBytes;
				offset += copied;
				this.bufferedSourceEndFrame =
					sourceStartFrame + offset / this.frameBytes;
				if (this.bufferedFrames === this.options.chunkFrames) this.flush();
			}
		} catch (error) {
			this.fail();
			throw error;
		} finally {
			this.busy = false;
		}
	}

	setPaused(paused: boolean): void {
		this.assertRecording();
		if (typeof paused !== "boolean")
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a PCM pause boolean",
			);
		if (paused === this.paused) return;
		if (paused) this.discardBuffer();
		this.paused = paused;
	}

	finish(): void {
		this.assertNotBusy();
		if (this.state === "finished") return;
		this.assertRecording();
		this.busy = true;
		try {
			this.flush();
			if (this.savedFrames === 0)
				throw new AgentBrowserError(
					"invalid-input",
					"Cannot finish empty PCM capture",
				);
			this.state = "finished";
		} catch (error) {
			this.fail();
			throw error;
		} finally {
			this.busy = false;
		}
	}

	close(): void {
		this.assertNotBusy();
		if (this.state !== "recording") return;
		this.discardBuffer();
		this.state = "closed";
	}

	metrics() {
		return Object.freeze({
			state: this.state,
			paused: this.paused,
			sourceFrames: this.sourceFrames,
			pausedFrames: this.pausedFrames,
			gapFrames: this.gapFrames,
			acceptedFrames: this.acceptedFrames,
			discardedFrames: this.discardedFrames,
			savedFrames: this.savedFrames,
			chunks: this.chunks,
			bufferedFrames: this.bufferedFrames,
			retainedBytes: this.buffer?.byteLength ?? 0,
		});
	}

	private flush(): void {
		if (!this.buffer || this.bufferedFrames === 0) return;
		if (this.chunks >= this.options.maxChunks)
			throw new AgentBrowserError(
				"resource-limit",
				"PCM capture chunk limit exceeded",
			);
		const frames = this.bufferedFrames;
		const sourceEndFrame = this.bufferedSourceEndFrame;
		const pcm =
			frames === this.options.chunkFrames
				? this.buffer
				: this.buffer.slice(0, frames * this.frameBytes);
		this.buffer = undefined;
		this.bufferedFrames = 0;
		this.bufferedSourceEndFrame = 0;
		const chunk = Object.freeze({
			sequence: this.chunks,
			startFrame: this.savedFrames,
			startMs: (this.savedFrames / this.options.sampleRate) * 1000,
			sourceEndFrame,
			frames,
			pcm,
		});
		const append = this.append;
		const result: unknown = append(chunk);
		if (
			result !== null &&
			(typeof result === "object" || typeof result === "function") &&
			typeof (result as { then?: unknown }).then === "function"
		) {
			void Promise.resolve(result).catch(() => {});
			throw new AgentBrowserError(
				"unsupported",
				"PCM capture requires a synchronous sink",
			);
		}
		this.savedFrames += frames;
		this.chunks++;
	}

	private discardBuffer(): void {
		this.discardedFrames += this.bufferedFrames;
		this.buffer = undefined;
		this.bufferedFrames = 0;
		this.bufferedSourceEndFrame = 0;
	}

	private fail(): void {
		this.state = "failed";
		this.buffer = undefined;
		this.bufferedFrames = 0;
		this.bufferedSourceEndFrame = 0;
		this.discardedFrames = this.acceptedFrames - this.savedFrames;
	}

	private assertNotBusy(): void {
		if (this.busy)
			throw new AgentBrowserError(
				"invalid-input",
				"PCM capture cannot be reentered",
			);
	}

	private assertRecording(): void {
		this.assertNotBusy();
		if (this.state !== "recording")
			throw new AgentBrowserError("closed", "PCM capture is not recording");
	}
}

function pcmView(value: Uint8Array): Uint8Array {
	try {
		if (!(value instanceof Uint8Array)) throw new TypeError();
		const prototype = Object.getPrototypeOf(Uint8Array.prototype);
		const buffer = Object.getOwnPropertyDescriptor(
			prototype,
			"buffer",
		)?.get?.call(value);
		const offset = Object.getOwnPropertyDescriptor(
			prototype,
			"byteOffset",
		)?.get?.call(value);
		const length = Object.getOwnPropertyDescriptor(
			prototype,
			"byteLength",
		)?.get?.call(value);
		Object.getOwnPropertyDescriptor(
			ArrayBuffer.prototype,
			"byteLength",
		)?.get?.call(buffer);
		return new Uint8Array(buffer, offset, length);
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"Expected an unshared PCM byte view",
		);
	}
}
