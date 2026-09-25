import { AgentBrowserError } from "./errors.js";
import {
	PcmCapture,
	type PcmCaptureChunk,
	type PcmCaptureOptions,
} from "./pcm-capture.js";
import { PcmResampler } from "./pcm-resampler.js";

export interface AudioInputPacket {
	readonly channels: readonly Float32Array[];
	readonly startFrame: number;
}

/** A source must settle a pending read when cancelled or closed, using null,
 * signal.reason or an AbortError for cancellation. Closing a
 * recording waits for that read AND close acknowledgement; cancellation alone
 * is not proof that device or transport resources have been released.
 */
export interface AudioRecordingSource {
	read(signal: AbortSignal): Promise<AudioInputPacket | null>;
	close(): void | Promise<void>;
}

export interface AudioRecordingOptions {
	inputSampleRate: number;
	inputChannels: 1 | 2;
	maxInputFrames: number;
	maxSourceFrames: number;
	capture: PcmCaptureOptions;
}

const discarded = Symbol("audio-recording-discarded");

/** Owns the pull/convert/record lifecycle of an existing audio source. It does
 * not create a microphone, browser media device, or meeting transport.
 */
export class AudioRecording {
	private readonly capture: PcmCapture;
	private readonly conversion: PcmResampler;
	private readonly controller = new AbortController();
	private state:
		| "idle"
		| "recording"
		| "stopping"
		| "finished"
		| "closed"
		| "failed" = "idle";
	private mode: "finish" | "discard" | undefined;
	private paused = false;
	private processing = false;
	private pendingRead = false;
	private sourceClosed = false;
	private task: Promise<void> | undefined;
	private sourceClosing: Promise<void> | undefined;
	private detachAbort: (() => void) | undefined;
	private resumeYield: (() => void) | undefined;

	constructor(
		private readonly source: AudioRecordingSource,
		options: AudioRecordingOptions,
		append: (chunk: PcmCaptureChunk) => void,
		signal?: AbortSignal,
	) {
		if (
			!source ||
			typeof source.read !== "function" ||
			typeof source.close !== "function" ||
			!options ||
			!options.capture ||
			typeof append !== "function"
		) {
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid audio recording source or options",
			);
		}
		const capture = { ...options.capture };
		this.capture = new PcmCapture(capture, (chunk) => {
			// A document may close inside the sink. No later chunk may escape.
			if (this.mode === "discard") throw discarded;
			return append(chunk);
		});
		this.conversion = new PcmResampler(
			{
				inputSampleRate: options.inputSampleRate,
				outputSampleRate: capture.sampleRate,
				inputChannels: options.inputChannels,
				outputChannels: capture.channels,
				maxInputFrames: options.maxInputFrames,
				maxOutputFrames: capture.maxInputFrames,
				maxDurationFrames: options.maxSourceFrames,
			},
			(pcm, start) => this.capture.push(pcm, start),
		);
		if (signal !== undefined) {
			const abort = () => {
				void this.close().catch(() => {});
			};
			signal.addEventListener("abort", abort, { once: true });
			this.detachAbort = () => signal.removeEventListener("abort", abort);
			if (signal.aborted) abort();
		}
	}

	/** Resolves at EOF or completed shutdown, and rejects on input, sink or
	 * cleanup failure. Repeated calls observe the same operation.
	 */
	run(): Promise<void> {
		if (this.task === undefined) {
			this.state = this.mode === undefined ? "recording" : "stopping";
			// Install the task before invoking a source that can reenter its owner.
			this.task = Promise.resolve().then(() => this.consume());
			void this.task.catch(() => {});
		}
		return this.task;
	}

	setPaused(paused: boolean): void {
		if (
			typeof paused !== "boolean" ||
			this.processing ||
			this.mode !== undefined ||
			(this.state !== "idle" && this.state !== "recording")
		) {
			throw new AgentBrowserError(
				"invalid-input",
				"Audio recording cannot change pause state now",
			);
		}
		if (paused === this.paused) return;
		this.conversion.reset();
		this.capture.setPaused(paused);
		this.paused = paused;
	}

	/** Flush accepted audio, cancel the next read, and release the source. */
	stop(): Promise<void> {
		return this.requestStop("finish");
	}

	/** Discard pending audio and release the source. Already published chunks
	 * remain owned by the sink; this operation does not delete saved recordings.
	 */
	close(): Promise<void> {
		return this.requestStop("discard");
	}

	metrics() {
		const capture = this.capture.metrics();
		const conversion = this.conversion.metrics();
		return Object.freeze({
			state: this.state,
			paused: this.paused,
			pendingRead: this.pendingRead,
			pendingYield: this.resumeYield !== undefined,
			sourceClosed: this.sourceClosed,
			capture,
			conversion,
			cleanupVerified:
				this.sourceClosed &&
				!this.pendingRead &&
				this.resumeYield === undefined &&
				!this.processing &&
				(this.state === "finished" ||
					this.state === "closed" ||
					this.state === "failed") &&
				capture.retainedBytes === 0 &&
				conversion.retainedBytes === 0,
		});
	}

	private requestStop(mode: "finish" | "discard"): Promise<void> {
		if (
			this.state === "finished" ||
			this.state === "closed" ||
			this.state === "failed"
		)
			return this.task ?? Promise.resolve();
		if (this.mode !== "discard") this.mode = mode;
		this.state = "stopping";
		this.controller.abort(
			new AgentBrowserError("aborted", "Audio recording stopped"),
		);
		this.resumeYield?.();
		void this.closeSource();
		if (this.mode === "discard" && !this.processing) this.closeBuffers();
		return this.run();
	}

	private async consume(): Promise<void> {
		let failure: { error: unknown } | undefined;
		let packets = 0;
		try {
			while (this.mode === undefined) {
				let packet: AudioInputPacket | null;
				this.pendingRead = true;
				try {
					packet = await this.source.read(this.controller.signal);
				} catch (error) {
					// A cancelled read cannot admit more audio. Its owner still waits
					// for the independent close acknowledgement below.
					if (
						this.mode !== undefined &&
						(error === this.controller.signal.reason ||
							(error instanceof Error && error.name === "AbortError"))
					)
						break;
					throw error;
				} finally {
					this.pendingRead = false;
				}
				if (this.mode !== undefined || packet === null) break;
				this.processing = true;
				try {
					this.conversion.push(packet.channels, packet.startFrame);
					// Paused packets still validate source bounds/ordering, but their
					// filter history must not survive to the next read or resume.
					if (this.paused) this.conversion.reset();
				} finally {
					this.processing = false;
				}
				// Awaiting an already-settled read only yields to microtasks. Let
				// owner cancellation and other page tasks run for ready sources too.
				if (++packets % 32 === 0 && this.mode === undefined)
					await this.yieldTurn();
			}
			if (this.mode !== "discard") {
				this.processing = true;
				try {
					this.conversion.finish();
					this.capture.finish();
				} finally {
					this.processing = false;
				}
			}
		} catch (error) {
			if (error !== discarded) failure = { error };
		}
		this.state = "stopping";
		this.closeBuffers();
		try {
			await this.closeSource();
		} catch (error) {
			failure = {
				error:
					failure === undefined
						? error
						: new AggregateError(
								[failure.error, error],
								"Audio recording and source cleanup failed",
							),
			};
		} finally {
			this.detachAbort?.();
			this.detachAbort = undefined;
		}
		this.state =
			failure !== undefined
				? "failed"
				: this.mode === "discard"
					? "closed"
					: "finished";
		if (failure !== undefined) throw failure.error;
	}

	private closeSource(): Promise<void> {
		if (this.sourceClosing === undefined) {
			// Store before calling out: source.close can reenter stop/close.
			this.sourceClosing = Promise.resolve()
				.then(() => this.source.close())
				.then(() => {
					this.sourceClosed = true;
				});
			void this.sourceClosing.catch(() => {});
		}
		return this.sourceClosing;
	}

	private yieldTurn(): Promise<void> {
		return new Promise((resolve) => {
			const resume = () => {
				clearTimeout(timer);
				this.resumeYield = undefined;
				resolve();
			};
			const timer = setTimeout(resume, 0);
			this.resumeYield = resume;
		});
	}

	private closeBuffers(): void {
		this.conversion.close();
		this.capture.close();
	}
}
