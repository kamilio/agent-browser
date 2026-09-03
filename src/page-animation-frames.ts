import { AgentBrowserError } from "./errors.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

export interface AnimationFrameLimits {
	maxActive: number;
	maxScheduled: number;
	maxCallbacks: number;
	maxPendingCallbacks: number;
}
export const animationFrameLimits: Readonly<AnimationFrameLimits> =
	Object.freeze({
		maxActive: 128,
		maxScheduled: 4096,
		maxCallbacks: 1024,
		maxPendingCallbacks: 128,
	});
export const animationFrameIntervalMs = 1000 / 60;
interface FrameCallback {
	id: number;
	callback: unknown;
}

export class PageAnimationFrames {
	readonly limits: Readonly<AnimationFrameLimits>;
	readonly methods = {
		requestAnimationFrame: (callback: unknown) => this.request(callback),
		cancelAnimationFrame: (...args: unknown[]) => this.cancel(args),
	};
	private readonly records = new Map<number, FrameCallback>();
	private readonly inFlight = new Set<FrameCallback>();
	private batch: number[] = [];
	private position = 0;
	private handle?: ReturnType<typeof setTimeout>;
	private timestamp?: number;
	private scheduled = 0;
	private fired = 0;
	private frames = 0;
	private running = false;
	private closed = false;

	constructor(
		private readonly callbacks: ScriptCallbackRuntime,
		private readonly window: () => object,
		private readonly fail: (error: unknown) => void,
		private readonly clock: { now(): number },
		limits: Partial<AnimationFrameLimits> = {},
	) {
		if (!limits || typeof limits !== "object" || Array.isArray(limits))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid animation frame limits",
			);
		for (const [key, value] of Object.entries(limits))
			if (
				!Object.hasOwn(animationFrameLimits, key) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > animationFrameLimits[key as keyof AnimationFrameLimits] * 16
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid animation frame limit",
				);
		this.limits = Object.freeze({ ...animationFrameLimits, ...limits });
	}

	metrics() {
		return Object.freeze({
			partial: true,
			profile: "software-frame-opportunities",
			intervalMs: animationFrameIntervalMs,
			active: this.records.size,
			pendingCallbacks: this.inFlight.size,
			scheduled: this.scheduled,
			fired: this.fired,
			frames: this.frames,
			running: this.running,
			armed: this.handle !== undefined,
			lastTimestamp: this.timestamp ?? null,
			closed: this.closed,
			limits: this.limits,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		if (this.handle !== undefined) clearTimeout(this.handle);
		this.handle = undefined;
		for (const record of this.records.values()) record.callback = undefined;
		for (const record of this.inFlight) record.callback = undefined;
		this.records.clear();
		this.inFlight.clear();
		this.batch = [];
		this.position = 0;
		this.running = false;
	}

	private request(callback: unknown) {
		this.ensureOpen();
		if (typeof callback !== "function")
			throw new TypeError("requestAnimationFrame requires a function");
		if (
			this.records.size >= this.limits.maxActive ||
			this.scheduled >= this.limits.maxScheduled
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Animation frame request limit exceeded",
			);
		const record = { id: ++this.scheduled, callback };
		this.records.set(record.id, record);
		try {
			this.arm();
		} catch (error) {
			this.stop(error);
			throw error;
		}
		return record.id;
	}
	private cancel(args: readonly unknown[]) {
		this.ensureOpen();
		if (!args.length)
			throw new TypeError("cancelAnimationFrame requires a handle");
		const value = args[0];
		if (
			(typeof value === "object" && value !== null) ||
			["function", "symbol", "bigint"].includes(typeof value)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Animation frame object and bigint coercion is unsupported",
			);
		const number = Number(value);
		const id = Number.isFinite(number)
			? ((Math.trunc(number) % 4_294_967_296) + 4_294_967_296) % 4_294_967_296
			: 0;
		const record = this.records.get(id);
		if (record) {
			record.callback = undefined;
			this.records.delete(id);
		}
		if (!this.records.size && this.handle !== undefined) {
			clearTimeout(this.handle);
			this.handle = undefined;
		}
	}
	private arm() {
		if (
			this.closed ||
			this.running ||
			this.handle !== undefined ||
			!this.records.size
		)
			return;
		const now = this.clock.now();
		const deadline = (this.timestamp ?? now) + animationFrameIntervalMs;
		this.handle = setTimeout(
			() => {
				this.handle = undefined;
				try {
					this.ensureOpen();
					if (!this.records.size) return;
					this.timestamp = this.clock.now();
					this.batch = [...this.records.keys()];
					this.position = 0;
					this.frames++;
					this.running = true;
					this.pump();
				} catch (error) {
					this.stop(error);
				}
			},
			Math.max(0, Math.ceil(deadline - now)),
		);
	}
	private pump() {
		if (this.closed) return;
		if (this.callbacks.isClosed()) {
			this.close();
			return;
		}
		let record: FrameCallback | undefined;
		while (this.position < this.batch.length && !record)
			record = this.records.get(this.batch[this.position++]);
		if (!record) {
			this.batch = [];
			this.position = 0;
			this.running = false;
			try {
				this.arm();
			} catch (error) {
				this.stop(error);
			}
			return;
		}
		if (
			this.fired >= this.limits.maxCallbacks ||
			this.inFlight.size >= this.limits.maxPendingCallbacks
		) {
			this.stop(
				new AgentBrowserError(
					"resource-limit",
					"Animation frame callback limit exceeded",
				),
			);
			return;
		}
		this.records.delete(record.id);
		this.inFlight.add(record);
		this.fired++;
		const current = record;
		try {
			const invocation = this.callbacks.startCallback(
				current.callback,
				[this.timestamp],
				{ thisValue: this.window() },
			);
			const settled = () => {
				this.inFlight.delete(current);
				current.callback = undefined;
			};
			void invocation.result.then(settled, settled);
			void invocation.synchronous.then(
				() => this.pump(),
				() => this.pump(),
			);
		} catch (error) {
			this.stop(error);
		}
	}
	private stop(error: unknown) {
		this.close();
		this.fail(error);
	}
	private ensureOpen() {
		if (this.closed || this.callbacks.isClosed())
			throw new AgentBrowserError("closed", "Animation frames are closed");
	}
}
