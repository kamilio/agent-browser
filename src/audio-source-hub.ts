import type {
	AudioInputPacket,
	AudioRecordingSource,
} from "./audio-recording.js";
import { AgentBrowserError } from "./errors.js";

export interface AudioSourceHubLimits {
	channels: 1 | 2;
	maxPacketFrames: number;
	maxSourceFrames: number;
	maxReaders: number;
	maxCreatedReaders: number;
	maxQueuedFrames: number;
}

interface Reader {
	queue: AudioInputPacket[];
	frames: number;
	closed: boolean;
	error?: { value: unknown };
	pending?: {
		resolve(value: AudioInputPacket | null): void;
		reject(error: unknown): void;
		detach(): void;
	};
}

const typedPrototype = Object.getPrototypeOf(Float32Array.prototype);
function intrinsicGetter(prototype: object, name: PropertyKey) {
	const getter = Object.getOwnPropertyDescriptor(prototype, name)?.get;
	if (!getter) throw new TypeError("Missing audio buffer intrinsic");
	return getter;
}
const typedBuffer = intrinsicGetter(typedPrototype, "buffer");
const typedOffset = intrinsicGetter(typedPrototype, "byteOffset");
const typedLength = intrinsicGetter(typedPrototype, "length");
const typedKind = intrinsicGetter(typedPrototype, Symbol.toStringTag);
const bufferLength = intrinsicGetter(ArrayBuffer.prototype, "byteLength");

/** Fans out an existing source into independently owned recording readers.
 * It does not acquire media or implement the page's MediaStream APIs. New readers
 * start with the next packet; cancellation retires that reader. A reader that
 * exceeds its queue bound fails without stopping its siblings. Closing the last
 * reader releases the upstream source, including any pending read.
 */
export class AudioSourceHub {
	private readonly limits: Readonly<AudioSourceHubLimits>;
	private readonly readers = new Set<Reader>();
	private readonly holds = new Set<object>();
	private createdHolds = 0;
	private readonly controller = new AbortController();
	private created = 0;
	private sourceFrames = 0;
	private packets = 0;
	private halted = false;
	private terminal = false;
	private sourceClosed = false;
	private pendingRead = false;
	private failure?: { value: unknown };
	private pumping?: Promise<void>;
	private closingSource?: Promise<void>;
	private closing?: Promise<void>;
	private detachOwner?: () => void;
	private resumeYield?: () => void;

	constructor(
		private source: AudioRecordingSource | undefined,
		limits: AudioSourceHubLimits,
		owner?: AbortSignal,
	) {
		if (
			!source ||
			typeof source.read !== "function" ||
			typeof source.close !== "function" ||
			!limits
		)
			throw this.invalid("Invalid shared audio source");
		const copy = { ...limits };
		for (const value of [
			copy.channels,
			copy.maxPacketFrames,
			copy.maxSourceFrames,
			copy.maxReaders,
			copy.maxCreatedReaders,
			copy.maxQueuedFrames,
		])
			if (!Number.isSafeInteger(value) || value < 1)
				throw this.invalid("Invalid shared audio bounds");
		if (
			(copy.channels !== 1 && copy.channels !== 2) ||
			copy.maxPacketFrames > copy.maxQueuedFrames ||
			copy.maxReaders > copy.maxCreatedReaders
		)
			throw this.invalid("Invalid shared audio format or queue bounds");
		if (
			copy.maxReaders > 64 ||
			copy.maxCreatedReaders > 4096 ||
			copy.maxQueuedFrames * copy.channels * 4 * copy.maxReaders >
				16 * 1024 * 1024
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Shared audio queues must not exceed 16 MiB",
			);
		this.limits = Object.freeze(copy);
		if (owner) {
			const abort = () => {
				void this.close().catch(() => {});
			};
			owner.addEventListener("abort", abort, { once: true });
			this.detachOwner = () => owner.removeEventListener("abort", abort);
			if (owner.aborted) abort();
		}
	}

	open(): AudioRecordingSource {
		if (this.halted) throw this.invalid("Shared audio source has ended");
		if (
			this.readers.size >= this.limits.maxReaders ||
			this.created >= this.limits.maxCreatedReaders
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Shared audio reader limit exceeded",
			);
		const reader: Reader = { queue: [], frames: 0, closed: false };
		this.readers.add(reader);
		this.created++;
		return Object.freeze({
			read: (signal: AbortSignal) => this.read(reader, signal),
			close: () => {
				this.retire(reader);
				return this.closeIfUnused();
			},
		});
	}

	/** Keeps an idle source available for a live track without buffering audio.
	 * Explicit hub/owner shutdown still revokes every hold.
	 */
	retain(): { close(): Promise<void> } {
		if (this.halted) throw this.invalid("Shared audio source has ended");
		if (
			this.holds.size >= this.limits.maxReaders ||
			this.createdHolds >= this.limits.maxCreatedReaders
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Shared audio owner limit exceeded",
			);
		const token = {};
		this.holds.add(token);
		this.createdHolds++;
		return Object.freeze({
			close: () => {
				this.holds.delete(token);
				return this.closeIfUnused();
			},
		});
	}

	private closeIfUnused(): Promise<void> {
		return this.readers.size === 0 && this.holds.size === 0
			? this.close()
			: Promise.resolve();
	}

	/** Discards every reader's queue. Completion waits for upstream read settlement
	 * and close acknowledgement; an uncooperative source keeps it pending.
	 */
	close(): Promise<void> {
		return this.shutdown(true);
	}

	metrics() {
		let queuedFrames = 0;
		for (const reader of this.readers) queuedFrames += reader.frames;
		return Object.freeze({
			holds: this.holds.size,
			readers: this.readers.size,
			createdReaders: this.created,
			queuedFrames,
			retainedBytes: queuedFrames * this.limits.channels * 4,
			sourceFrames: this.sourceFrames,
			pendingRead: this.pendingRead,
			pendingYield: this.resumeYield !== undefined,
			sourceClosed: this.sourceClosed,
			state: this.failure
				? "failed"
				: this.terminal
					? "closed"
					: this.halted
						? "closing"
						: "open",
			cleanupVerified:
				this.terminal &&
				this.sourceClosed &&
				!this.pendingRead &&
				!this.resumeYield &&
				queuedFrames === 0,
		});
	}

	private read(
		reader: Reader,
		signal: AbortSignal,
	): Promise<AudioInputPacket | null> {
		if (reader.pending)
			return Promise.reject(
				this.invalid("An audio reader already has a pending read"),
			);
		if (reader.error) return Promise.reject(reader.error.value);
		if (reader.closed) return Promise.resolve(null);
		if (signal.aborted) {
			this.retire(reader, { value: signal.reason });
			return Promise.reject(signal.reason);
		}
		const packet = reader.queue.shift();
		if (packet) {
			reader.frames -= packet.channels[0].length;
			return Promise.resolve(packet);
		}
		if (this.halted)
			return this.failure
				? Promise.reject(this.failure.value)
				: Promise.resolve(null);
		return new Promise((resolve, reject) => {
			const abort = () => this.retire(reader, { value: signal.reason });
			reader.pending = {
				resolve,
				reject,
				detach: () => signal.removeEventListener("abort", abort),
			};
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) abort();
			else this.pump();
		});
	}

	private settle(
		reader: Reader,
		packet: AudioInputPacket | null,
		error?: { value: unknown },
	): void {
		const pending = reader.pending;
		reader.pending = undefined;
		if (!pending) return;
		pending.detach();
		if (error) pending.reject(error.value);
		else pending.resolve(packet);
	}

	private retire(reader: Reader, error?: { value: unknown }): void {
		if (reader.closed) return;
		reader.closed = true;
		reader.error = error;
		reader.queue = [];
		reader.frames = 0;
		this.readers.delete(reader);
		this.settle(reader, null, error);
		if (!this.halted) void this.closeIfUnused().catch(() => {});
	}

	private hasDemand(): boolean {
		for (const reader of this.readers) if (reader.pending) return true;
		return false;
	}

	private pump(): void {
		if (this.pumping || this.halted || !this.hasDemand()) return;
		this.pumping = Promise.resolve()
			.then(() => this.consume())
			.finally(() => {
				this.pumping = undefined;
				this.pump();
			});
	}

	private async consume(): Promise<void> {
		try {
			while (!this.halted && this.hasDemand()) {
				// Ready upstream promises must not starve task-level cancellation.
				if (this.packets > 0 && this.packets % 32 === 0) await this.yieldTurn();
				if (this.halted || !this.hasDemand()) break;
				let packet: AudioInputPacket | null;
				this.pendingRead = true;
				try {
					const source = this.source;
					if (!source) throw this.invalid("Audio source is closed");
					packet = await source.read(this.controller.signal);
				} finally {
					this.pendingRead = false;
				}
				if (this.halted) break;
				if (packet === null) {
					void this.shutdown(false).catch(() => {});
					break;
				}
				const owned = this.copyPacket(packet);
				if (this.halted) break;
				this.sourceFrames = owned.startFrame + owned.channels[0].length;
				this.packets++;
				for (const reader of this.readers) {
					const frames = owned.channels[0].length;
					if (
						!reader.pending &&
						reader.frames + frames > this.limits.maxQueuedFrames
					) {
						this.retire(reader, {
							value: new AgentBrowserError(
								"resource-limit",
								"Audio reader queue exceeded its frame limit",
							),
						});
						continue;
					}
					const copy = {
						startFrame: owned.startFrame,
						channels: owned.channels.map(
							(channel) => new Float32Array(channel),
						),
					};
					if (reader.pending) this.settle(reader, copy);
					else {
						reader.queue.push(copy);
						reader.frames += frames;
					}
				}
			}
		} catch (error) {
			if (
				!(
					this.halted &&
					(error === this.controller.signal.reason ||
						(error instanceof Error && error.name === "AbortError"))
				)
			) {
				this.failure = { value: error };
				void this.shutdown(true).catch(() => {});
			}
		}
	}

	private shutdown(discard: boolean): Promise<void> {
		this.halted = true;
		this.holds.clear();
		for (const reader of this.readers) {
			if (discard) {
				reader.queue = [];
				reader.frames = 0;
				reader.closed = true;
				reader.error = this.failure;
			}
			this.settle(reader, null, this.failure);
		}
		if (discard) this.readers.clear();
		this.controller.abort(
			new AgentBrowserError("aborted", "Shared audio source stopped"),
		);
		this.resumeYield?.();
		if (!this.closingSource) {
			this.closingSource = Promise.resolve()
				.then(() => {
					const source = this.source;
					if (!source) throw this.invalid("Audio source is closed");
					return source.close();
				})
				.then(() => {
					this.sourceClosed = true;
				});
		}
		if (!this.closing) {
			this.closing = Promise.allSettled([
				this.pumping,
				this.closingSource,
			]).then((results) => {
				const cleanup = results[1];
				if (cleanup.status === "rejected")
					this.failure = {
						value: this.failure
							? new AggregateError(
									[this.failure.value, cleanup.reason],
									"Audio source and cleanup failed",
								)
							: cleanup.reason,
					};
				this.terminal = true;
				this.detachOwner?.();
				this.detachOwner = undefined;
				this.source = undefined;
				if (this.failure) throw this.failure.value;
			});
			void this.closing.catch(() => {});
		}
		return this.closing;
	}

	private copyPacket(packet: AudioInputPacket): AudioInputPacket {
		const start = packet.startFrame;
		const input = packet.channels;
		if (
			!Number.isSafeInteger(start) ||
			start < this.sourceFrames ||
			!Array.isArray(input) ||
			input.length !== this.limits.channels
		)
			throw this.invalid("Invalid or overlapping audio source packet");
		const channels: Float32Array[] = [];
		let frames = 0;
		for (let index = 0; index < this.limits.channels; index++) {
			const channel = input[index];
			let view: Float32Array;
			try {
				if (typedKind.call(channel) !== "Float32Array") throw new Error();
				const buffer = typedBuffer.call(channel);
				const length = typedLength.call(channel);
				const offset = typedOffset.call(channel);
				bufferLength.call(buffer); // Reject shared buffers before reading samples.
				if (
					!length ||
					length > this.limits.maxPacketFrames ||
					(frames !== 0 && frames !== length)
				)
					throw new Error();
				view = new Float32Array(buffer, offset, length);
			} catch {
				throw this.invalid("Invalid audio packet channel");
			}
			frames = view.length;
			if (
				!Number.isSafeInteger(start + frames) ||
				start + frames > this.limits.maxSourceFrames
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Audio source frame limit exceeded",
				);
			const copy = new Float32Array(frames);
			for (let i = 0; i < frames; i++) {
				const value = view[i];
				if (!Number.isFinite(value))
					throw this.invalid("Audio source samples must be finite");
				copy[i] = value;
			}
			channels.push(copy);
		}
		return { startFrame: start, channels };
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
	private invalid(message: string): AgentBrowserError {
		return new AgentBrowserError("invalid-input", message);
	}
}
