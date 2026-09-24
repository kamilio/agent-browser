import { AgentBrowserError } from "./errors.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

export interface TimerLimits {
	maxActive: number;
	maxScheduled: number;
	maxCallbacks: number;
	maxArguments: number;
}

interface PageTimer {
	id: number;
	callback: unknown;
	args: readonly unknown[];
	delay: number;
	repeat: boolean;
	nesting: number;
	handle?: ReturnType<typeof setTimeout>;
}

const defaults: TimerLimits = {
	maxActive: 128,
	maxScheduled: 4096,
	maxCallbacks: 1024,
	maxArguments: 32,
};

export class PageTimers {
	readonly limits: Readonly<TimerLimits>;
	readonly methods = {
		setTimeout: (callback: unknown, delay?: unknown, ...args: unknown[]) =>
			this.schedule(callback, delay, args, false),
		setInterval: (callback: unknown, delay?: unknown, ...args: unknown[]) =>
			this.schedule(callback, delay, args, true),
		clearTimeout: (id?: unknown) => this.clear(id),
		clearInterval: (id?: unknown) => this.clear(id),
	};
	private readonly records = new Map<number, PageTimer>();
	private readonly ready: PageTimer[] = [];
	private readonly inFlight = new Map<PageTimer, number>();
	private scheduled = 0;
	private fired = 0;
	private nesting = 0;
	private running = false;
	private current?: PageTimer;
	private wakeHandle?: ReturnType<typeof setTimeout>;
	private closedValue = false;

	constructor(
		private readonly callbacks: ScriptCallbackRuntime & { isBusy?(): boolean },
		private readonly window: () => object,
		private readonly fail: (error?: unknown) => void,
		limits: Partial<TimerLimits> = {},
		private readonly releaseArgument: (value: unknown) => unknown = () =>
			undefined,
		private readonly releaseCallback?: (value: unknown) => unknown,
	) {
		this.limits = Object.freeze({ ...defaults, ...limits });
		for (const key of Object.keys(defaults) as (keyof TimerLimits)[])
			if (
				!Number.isSafeInteger(this.limits[key]) ||
				this.limits[key] < 1 ||
				this.limits[key] > defaults[key] * 16
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid page timer limits",
				);
	}

	metrics() {
		return Object.freeze({
			partial: true,
			active: this.records.size,
			queued: this.ready.length,
			pendingCallbacks: [...this.inFlight.values()].reduce(
				(total, count) => total + count,
				0,
			),
			scheduled: this.scheduled,
			fired: this.fired,
			running: this.running,
			closed: this.closedValue,
			limits: this.limits,
		});
	}

	wake() {
		if (
			this.closedValue ||
			this.running ||
			this.wakeHandle !== undefined ||
			!this.ready.length ||
			this.callbacks.isBusy?.()
		)
			return;
		this.wakeHandle = setTimeout(() => {
			this.wakeHandle = undefined;
			if (this.callbacks.isClosed()) this.close();
			else this.pump();
		}, 0);
	}

	close() {
		if (this.closedValue) return;
		this.closedValue = true;
		clearTimeout(this.wakeHandle);
		this.wakeHandle = undefined;
		for (const record of this.records.values()) {
			clearTimeout(record.handle);
			this.release(record, true);
		}
		for (const record of this.inFlight.keys()) this.release(record, true);
		if (this.current) this.release(this.current, true);
		this.current = undefined;
		this.records.clear();
		this.inFlight.clear();
		this.ready.length = 0;
		this.nesting = 0;
		this.running = false;
	}

	private schedule(
		callback: unknown,
		delay: unknown,
		args: readonly unknown[],
		repeat: boolean,
	): number {
		this.ensureOpen();
		if (typeof callback !== "function")
			throw new AgentBrowserError(
				"unsupported",
				"Page timers require a function; source-string handlers are unsupported",
			);
		const milliseconds = Math.max(0, timerLong(delay));
		if (
			this.records.size >= this.limits.maxActive ||
			this.scheduled >= this.limits.maxScheduled ||
			args.length > this.limits.maxArguments
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Page timer limit exceeded",
			);
		const record: PageTimer = {
			id: ++this.scheduled,
			callback,
			args: [...args],
			delay: milliseconds,
			repeat,
			nesting: this.nesting + 1,
		};
		this.records.set(record.id, record);
		this.arm(record);
		return record.id;
	}

	private clear(value: unknown) {
		this.ensureOpen();
		const id = timerLong(value);
		const record = this.records.get(id);
		if (!record) return;
		clearTimeout(record.handle);
		this.records.delete(id);
		this.release(record);
		const queued = this.ready.indexOf(record);
		if (queued >= 0) this.ready.splice(queued, 1);
	}

	private arm(record: PageTimer) {
		const delay = record.nesting > 6 ? Math.max(4, record.delay) : record.delay;
		record.handle = setTimeout(() => {
			record.handle = undefined;
			if (this.callbacks.isClosed()) {
				this.close();
				return;
			}
			if (!this.live(record)) return;
			this.ready.push(record);
			this.pump();
		}, delay);
	}

	private live(record: PageTimer) {
		return (
			!this.closedValue &&
			!this.callbacks.isClosed() &&
			this.records.get(record.id) === record
		);
	}

	private pump() {
		if (this.running || this.closedValue || this.callbacks.isBusy?.()) return;
		const record = this.ready.shift();
		if (!record) return;
		if (!this.live(record)) {
			this.close();
			return;
		}
		if (this.fired >= this.limits.maxCallbacks) {
			this.close();
			this.fail(
				new AgentBrowserError(
					"resource-limit",
					"Page timer callback limit exceeded",
				),
			);
			return;
		}
		this.fired++;
		this.running = true;
		this.current = record;
		this.nesting = record.nesting;
		this.inFlight.set(record, (this.inFlight.get(record) ?? 0) + 1);
		let invocation: ReturnType<ScriptCallbackRuntime["startCallback"]>;
		try {
			invocation = this.callbacks.startCallback(record.callback, record.args, {
				thisValue: this.window(),
			});
		} catch {
			this.running = false;
			this.close();
			this.fail();
			return;
		}
		let phases = 2;
		const settled = () => {
			if (--phases || this.closedValue) return;
			const remaining = (this.inFlight.get(record) ?? 1) - 1;
			if (remaining) this.inFlight.set(record, remaining);
			else this.inFlight.delete(record);
			if (!this.live(record)) this.release(record);
		};
		void invocation.result.then(settled, settled);
		const finish = () => {
			settled();
			if (this.closedValue) return;
			this.running = false;
			this.current = undefined;
			this.nesting = 0;
			if (this.live(record)) {
				if (record.repeat) {
					record.nesting++;
					this.arm(record);
				} else this.records.delete(record.id);
			}
			if (!this.live(record)) this.release(record);
			this.pump();
		};
		void invocation.synchronous.then(finish, finish);
	}

	private release(record: PageTimer, force = false) {
		if (!force && (this.inFlight.has(record) || this.current === record))
			return;
		for (const argument of record.args) this.releaseArgument(argument);
		record.args = [];
		const callback = record.callback;
		record.callback = undefined;
		if (callback !== undefined) this.releaseCallback?.(callback);
	}

	private ensureOpen() {
		if (this.closedValue || this.callbacks.isClosed())
			throw new AgentBrowserError("closed", "Page timers are closed");
	}
}

function timerLong(value: unknown): number {
	if (
		(value !== null && typeof value === "object") ||
		typeof value === "function" ||
		typeof value === "symbol" ||
		typeof value === "bigint"
	)
		throw new AgentBrowserError(
			"unsupported",
			"Object and non-number timer coercion is unsupported",
		);
	const number = Number(value);
	return Number.isFinite(number) ? Math.trunc(number) | 0 : 0;
}
