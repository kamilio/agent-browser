import type {
	AudioInputPacket,
	AudioRecordingSource,
} from "./audio-recording.js";
import { AgentBrowserError } from "./errors.js";

const quantum = 128;
const maximumFloat = 3.4028234663852886e38;
const maxNodes = 128;
const maxEvents = 512;

/** Bounded step automation. Ramps, curves and signal-rate parameter inputs are
 * separate capabilities; this implements constant values and setValueAtTime.
 */
export class AudioValue {
	private events: { time: number; value: number; integral: number }[];
	constructor(
		initial: number,
		readonly min: number,
		readonly max: number,
		private readonly ensureOpen: () => void,
	) {
		this.events = [{ time: 0, value: initial, integral: 0 }];
	}
	set(value: number, time: number): void {
		this.ensureOpen();
		finite(value);
		nonnegative(time);
		const selected = Math.min(this.max, Math.max(this.min, value));
		const existing = this.events.findIndex((event) => event.time === time);
		if (existing < 0 && this.events.length >= maxEvents)
			throw limit("Audio automation event limit exceeded");
		if (existing >= 0) this.events[existing].value = selected;
		else {
			this.events.push({ time, value: selected, integral: 0 });
			this.events.sort((a, b) => a.time - b.time);
		}
		for (let i = 1; i < this.events.length; i++) {
			const previous = this.events[i - 1];
			const event = this.events[i];
			event.integral =
				previous.integral + (event.time - previous.time) * previous.value;
		}
	}
	at(time: number): number {
		return this.event(time).value;
	}
	integral(time: number): number {
		const event = this.event(time);
		return event.integral + (time - event.time) * event.value;
	}
	release(time: number): void {
		this.events = [
			{ time, value: this.at(time), integral: this.integral(time) },
		];
	}
	private event(time: number) {
		let low = 0;
		let high = this.events.length;
		while (low + 1 < high) {
			const mid = (low + high) >>> 1;
			if (this.events[mid].time <= time) low = mid;
			else high = mid;
		}
		return this.events[low];
	}
}
export interface NativeAudioNode {
	readonly id: number;
	readonly kind: "oscillator" | "buffer" | "gain" | "destination";
	readonly parameter?: AudioValue;
}
interface Node extends NativeAudioNode {
	inputs: Set<Node>;
	started?: number;
	stopped: number;
	buffer?: { channels: Float32Array[]; sampleRate: number };
	offset?: number;
	naturalEnd?: number;
	ended?: boolean;
	onended?: () => void;
}
interface PendingRead {
	resolve(value: AudioInputPacket | null): void;
	reject(reason: unknown): void;
	detach(): void;
}
interface Output {
	node: Node;
	frame: number;
	closed: boolean;
	pending?: PendingRead;
	timer?: ReturnType<typeof setTimeout>;
	cached?: AudioInputPacket;
}

/** Headless oscillator, PCM and gain rendering into clocked audio sources.
 * It does not open a hardware device, provide WebRTC, or execute AudioWorklets.
 */
export class NativeAudioContext {
	readonly sampleRate: number;
	private readonly nodes = new Map<number, Node>();
	private readonly outputs = new Set<Output>();
	private readonly ownedNodes = new WeakSet<object>();
	private createdNodes = 0;
	private bufferBytes = 0;
	private endTimer?: ReturnType<typeof setTimeout>;
	private mode: "running" | "suspended" | "closed" = "running";
	private anchor: number;
	private elapsed = 0;
	private lastClock: number;
	private edges = 0;
	constructor(
		sampleRate = 48000,
		private readonly now: () => number = () => performance.now(),
	) {
		if (
			!Number.isInteger(sampleRate) ||
			sampleRate < 8000 ||
			sampleRate > 96000
		)
			throw new TypeError("Invalid audio sample rate");
		this.sampleRate = sampleRate;
		this.anchor = this.lastClock = now();
		finite(this.anchor);
	}
	get state() {
		return this.mode;
	}
	get currentTime(): number {
		const now = this.now();
		finite(now);
		this.lastClock = Math.max(now, this.lastClock);
		return (
			this.elapsed +
			(this.mode === "running" ? (this.lastClock - this.anchor) / 1000 : 0)
		);
	}
	createOscillator(): NativeAudioNode & { readonly parameter: AudioValue } {
		return this.create(
			"oscillator",
			440,
			-this.sampleRate / 2,
			this.sampleRate / 2,
		) as NativeAudioNode & { readonly parameter: AudioValue };
	}
	createGain(): NativeAudioNode & { readonly parameter: AudioValue } {
		return this.create(
			"gain",
			1,
			-maximumFloat,
			maximumFloat,
		) as NativeAudioNode & { readonly parameter: AudioValue };
	}
	createBufferSource(onended?: () => void): NativeAudioNode {
		const node = this.create("buffer");
		node.onended = onended;
		return node;
	}
	/** Copies PCM into bounded native storage; page buffers call this at start. */
	setBuffer(
		source: NativeAudioNode,
		channels: readonly Float32Array[],
		sampleRate: number,
	): void {
		this.ensureOpen();
		const node = this.owned(source);
		if (node.kind !== "buffer" || node.started !== undefined)
			throw new DOMException(
				"Cannot change a started audio source",
				"InvalidStateError",
			);
		if (
			!Number.isInteger(sampleRate) ||
			sampleRate < 8000 ||
			sampleRate > 96000 ||
			channels.length < 1 ||
			channels.length > 2 ||
			!channels.every(
				(channel) =>
					channel instanceof Float32Array &&
					channel.length === channels[0].length,
			) ||
			channels[0].length < 1 ||
			channels[0].length > sampleRate * 300
		)
			throw new TypeError("Invalid audio buffer");
		const bytes = channels[0].length * channels.length * 4;
		const oldBytes =
			node.buffer?.channels.reduce(
				(total, channel) => total + channel.byteLength,
				0,
			) ?? 0;
		if (this.bufferBytes - oldBytes + bytes > 33554432)
			throw limit("Audio buffer memory limit exceeded");
		const copies = channels.map((channel) => {
			const copy = new Float32Array(channel);
			if (!copy.every(Number.isFinite))
				throw new TypeError("Audio samples must be finite");
			return copy;
		});
		node.buffer = { channels: copies, sampleRate };
		this.bufferBytes += bytes - oldBytes;
	}
	createDestination(): { node: NativeAudioNode; source: AudioRecordingSource } {
		this.ensureOpen();
		if (this.outputs.size >= 16)
			throw limit("Audio destination limit exceeded");
		const node = this.create("destination");
		const output: Output = {
			node,
			frame:
				Math.floor((this.currentTime * this.sampleRate) / quantum) * quantum,
			closed: false,
		};
		this.outputs.add(output);
		return {
			node,
			source: {
				read: (signal) => this.read(output, signal),
				close: () => this.closeOutput(output),
			},
		};
	}
	connect(source: NativeAudioNode, destination: NativeAudioNode): void {
		this.ensureOpen();
		const from = this.owned(source);
		const to = this.owned(destination);
		if (
			from.kind === "destination" ||
			to.kind === "oscillator" ||
			to.kind === "buffer"
		)
			throw new TypeError("Audio node has no matching input or output");
		if (to.inputs.has(from)) return;
		if (this.edges >= 256) throw limit("Audio connection limit exceeded");
		const visits = new Set<Node>();
		const reaches = (node: Node): boolean => {
			if (node === to) return true;
			if (visits.has(node)) return false;
			visits.add(node);
			return [...node.inputs].some(reaches);
		};
		if (reaches(from))
			throw new TypeError("Audio feedback cycles are unsupported");
		to.inputs.add(from);
		this.edges++;
	}
	disconnect(source: NativeAudioNode, destination?: NativeAudioNode): void {
		this.ensureOpen();
		const from = this.owned(source);
		if (destination !== undefined) {
			if (this.owned(destination).inputs.delete(from)) this.edges--;
		} else
			for (const node of this.nodes.values())
				if (node.inputs.delete(from)) this.edges--;
	}
	start(
		source: NativeAudioNode,
		when = 0,
		offset = 0,
		duration?: number,
	): void {
		this.ensureOpen();
		nonnegative(when);
		nonnegative(offset);
		if (duration !== undefined) nonnegative(duration);
		const node = this.owned(source);
		if (
			(node.kind !== "oscillator" && node.kind !== "buffer") ||
			node.started !== undefined
		)
			throw new DOMException(
				"Audio source already started or invalid source",
				"InvalidStateError",
			);
		const started = Math.max(this.currentTime, when);
		if (node.kind === "buffer") {
			const length = node.buffer
				? node.buffer.channels[0].length / node.buffer.sampleRate
				: 0;
			const selectedOffset = Math.min(offset, length);
			const end =
				started + Math.min(duration ?? length, length - selectedOffset);
			if (end > 3600) throw limit("Audio context duration limit exceeded");
			node.offset = selectedOffset;
			node.naturalEnd = end;
			node.started = started;
			this.scheduleEnds();
		} else node.started = started;
	}
	stop(source: NativeAudioNode, when = 0): void {
		this.ensureOpen();
		nonnegative(when);
		const node = this.owned(source);
		if (
			(node.kind !== "oscillator" && node.kind !== "buffer") ||
			node.started === undefined
		)
			throw new DOMException(
				"Audio source has not started",
				"InvalidStateError",
			);
		const now = this.currentTime;
		if (now >= node.stopped) return;
		node.stopped = Math.max(now, when);
		this.scheduleEnds();
	}
	suspend(): void {
		this.ensureOpen();
		if (this.mode === "suspended") return;
		this.elapsed = this.currentTime;
		this.mode = "suspended";
		for (const output of this.outputs) this.clearTimer(output);
		this.clearEndTimer();
	}
	resume(): void {
		this.ensureOpen();
		if (this.mode === "running") return;
		this.currentTime;
		this.anchor = this.lastClock;
		this.mode = "running";
		for (const output of this.outputs) this.pump(output);
		this.scheduleEnds();
	}
	close(): void {
		if (this.mode === "closed") return;
		this.elapsed = this.currentTime;
		this.mode = "closed";
		this.clearEndTimer();
		for (const output of [...this.outputs]) this.closeOutput(output);
		for (const node of this.nodes.values()) {
			node.inputs.clear();
			node.parameter?.release(this.elapsed);
			node.buffer = undefined;
			node.onended = undefined;
		}
		this.nodes.clear();
		this.edges = 0;
		this.bufferBytes = 0;
	}
	metrics() {
		return {
			state: this.mode,
			nodes: this.nodes.size,
			connections: this.edges,
			sources: this.outputs.size,
			bufferBytes: this.bufferBytes,
			scheduledSources: [...this.nodes.values()].filter(
				(node) => node.naturalEnd !== undefined && !node.ended,
			).length,
			pendingReads: [...this.outputs].filter((output) => output.pending).length,
			timers:
				[...this.outputs].filter((output) => output.timer !== undefined)
					.length + (this.endTimer === undefined ? 0 : 1),
		};
	}
	private create(kind: Node["kind"], initial?: number, min = 0, max = 0): Node {
		this.ensureOpen();
		if (this.nodes.size >= maxNodes || this.createdNodes >= 4096)
			throw limit("Audio node limit exceeded");
		const node: Node = {
			id: ++this.createdNodes,
			kind,
			inputs: new Set(),
			stopped: Number.POSITIVE_INFINITY,
			...(initial === undefined
				? {}
				: {
						parameter: new AudioValue(initial, min, max, () =>
							this.ensureOpen(),
						),
					}),
		};
		this.nodes.set(node.id, node);
		this.ownedNodes.add(node);
		return node;
	}
	private owned(node: NativeAudioNode): Node {
		if (!node || !this.ownedNodes.has(node))
			throw new TypeError("Audio node belongs to another context");
		return node as Node;
	}
	private read(
		output: Output,
		signal: AbortSignal,
	): Promise<AudioInputPacket | null> {
		if (output.closed) return Promise.resolve(null);
		if (signal.aborted) return Promise.reject(signal.reason);
		if (output.pending)
			return Promise.reject(
				new TypeError("Audio source already has a pending read"),
			);
		return new Promise((resolve, reject) => {
			const abort = () => this.settle(output, undefined, signal.reason);
			output.pending = {
				resolve,
				reject,
				detach: () => signal.removeEventListener("abort", abort),
			};
			signal.addEventListener("abort", abort, { once: true });
			this.pump(output);
		});
	}
	private pump(output: Output): void {
		if (output.closed || !output.pending || this.mode !== "running") return;
		this.clearTimer(output);
		try {
			const frame = Math.floor(this.currentTime * this.sampleRate);
			if (frame >= this.sampleRate * 3600)
				throw limit("Audio context duration limit exceeded");
			const latest = Math.floor(frame / quantum) * quantum - quantum;
			if (latest >= output.frame) {
				const start = Math.max(latest, output.frame);
				const channels =
					output.cached?.startFrame === start
						? output.cached.channels
						: this.render(output.node, start, new Map());
				output.cached = undefined;
				output.frame = start + quantum;
				this.settle(output, {
					startFrame: start,
					channels,
				});
			} else
				output.timer = setTimeout(
					() => {
						output.timer = undefined;
						this.pump(output);
					},
					Math.max(
						1,
						((output.frame + quantum - frame) * 1000) / this.sampleRate,
					),
				);
		} catch (error) {
			this.settle(output, undefined, error);
		}
	}
	private render(
		node: Node,
		start: number,
		rendered: Map<Node, Float32Array[]>,
	): Float32Array[] {
		const cached = rendered.get(node);
		if (cached) return cached;
		const channels = [new Float32Array(quantum), new Float32Array(quantum)];
		const samples = channels[0];
		rendered.set(node, channels);
		if (node.kind === "oscillator") {
			if (node.started === undefined) return channels;
			const parameter = node.parameter;
			if (!parameter) throw new Error("Missing oscillator frequency");
			const phase = parameter.integral(node.started);
			for (let i = 0; i < quantum; i++) {
				const time = (start + i) / this.sampleRate;
				if (time >= node.started && time < node.stopped)
					samples[i] = Math.sin(
						2 * Math.PI * (parameter.integral(time) - phase),
					);
			}
			channels[1].set(samples);
		} else if (node.kind === "buffer") {
			if (!node.buffer || node.started === undefined) return channels;
			const end = Math.min(
				node.stopped,
				node.naturalEnd ?? Number.POSITIVE_INFINITY,
			);
			for (let channel = 0; channel < 2; channel++) {
				const data = node.buffer.channels[channel] ?? node.buffer.channels[0];
				for (let i = 0; i < quantum; i++) {
					const time = (start + i) / this.sampleRate;
					if (time < node.started || time >= end) continue;
					const position =
						(time - node.started + (node.offset ?? 0)) * node.buffer.sampleRate;
					const index = Math.floor(position);
					if (index >= data.length) continue;
					const first = data[index];
					channels[channel][i] =
						first + ((data[index + 1] ?? first) - first) * (position - index);
				}
			}
		} else {
			const inputs = [...node.inputs].map((input) =>
				this.render(input, start, rendered),
			);
			for (let channel = 0; channel < 2; channel++)
				for (let i = 0; i < quantum; i++) {
					let value = 0;
					for (const input of inputs) value += input[channel][i];
					if (node.kind === "gain")
						value *= node.parameter?.at((start + i) / this.sampleRate) ?? 1;
					channels[channel][i] = Math.max(
						-maximumFloat,
						Math.min(maximumFloat, value),
					);
				}
		}
		return channels;
	}
	private clearEndTimer(): void {
		if (this.endTimer !== undefined) clearTimeout(this.endTimer);
		this.endTimer = undefined;
	}
	private scheduleEnds(): void {
		this.clearEndTimer();
		if (this.mode !== "running") return;
		let deadline = Number.POSITIVE_INFINITY;
		for (const node of this.nodes.values())
			if (node.naturalEnd !== undefined && !node.ended)
				deadline = Math.min(
					deadline,
					(Math.ceil(
						(Math.min(node.stopped, node.naturalEnd) * this.sampleRate) /
							quantum,
					) *
						quantum) /
						this.sampleRate,
				);
		if (!Number.isFinite(deadline)) return;
		this.endTimer = setTimeout(
			() => {
				this.endTimer = undefined;
				const now = this.currentTime;
				const finished = [...this.nodes.values()].filter(
					(node) =>
						node.naturalEnd !== undefined &&
						!node.ended &&
						(Math.ceil(
							(Math.min(node.stopped, node.naturalEnd) * this.sampleRate) /
								quantum,
						) *
							quantum) /
							this.sampleRate <=
							now,
				);
				const notifications: (() => void)[] = [];
				if (finished.length) {
					// Cache the completed block before onended handlers disconnect nodes.
					// An idle destination retains at most one stereo quantum.
					const startFrame =
						Math.floor((now * this.sampleRate) / quantum) * quantum - quantum;
					for (const output of this.outputs)
						if (startFrame >= output.frame) {
							output.cached = {
								startFrame,
								channels: this.render(output.node, startFrame, new Map()),
							};
							this.pump(output);
						}
					for (const node of finished) {
						node.ended = true;
						this.disconnect(node);
						this.bufferBytes -=
							node.buffer?.channels.reduce(
								(total, channel) => total + channel.byteLength,
								0,
							) ?? 0;
						node.buffer = undefined;
						this.nodes.delete(node.id);
						const notify = node.onended;
						node.onended = undefined;
						if (notify) notifications.push(notify);
					}
				}
				this.scheduleEnds();
				for (const notify of notifications) notify();
			},
			Math.max(1, (deadline - this.currentTime) * 1000),
		);
	}
	private settle(
		output: Output,
		packet?: AudioInputPacket | null,
		error?: unknown,
	): void {
		const pending = output.pending;
		output.pending = undefined;
		this.clearTimer(output);
		if (!pending) return;
		pending.detach();
		if (packet === undefined) pending.reject(error);
		else pending.resolve(packet);
	}
	private clearTimer(output: Output): void {
		if (output.timer !== undefined) clearTimeout(output.timer);
		output.timer = undefined;
	}
	private closeOutput(output: Output): void {
		if (output.closed) return;
		output.closed = true;
		output.cached = undefined;
		this.settle(output, null);
		this.outputs.delete(output);
	}
	private ensureOpen(): void {
		if (this.mode === "closed")
			throw new DOMException("Audio context is closed", "InvalidStateError");
	}
}
function finite(value: number): void {
	if (typeof value !== "number" || !Number.isFinite(value))
		throw new TypeError("Audio value must be finite");
}
function nonnegative(value: number): void {
	finite(value);
	if (value < 0) throw new RangeError("Audio time must not be negative");
}
function limit(message: string) {
	return new AgentBrowserError("resource-limit", message);
}
