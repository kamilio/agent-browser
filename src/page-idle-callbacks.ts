import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

export interface IdleCallbackLimits {
	maxActive: number;
	maxScheduled: number;
	maxCallbacks: number;
	maxPendingCallbacks: number;
}
export const idleCallbackLimits: Readonly<IdleCallbackLimits> = Object.freeze({
	maxActive: 128,
	maxScheduled: 4096,
	maxCallbacks: 1024,
	maxPendingCallbacks: 128,
});
export const idleCallbackIntervalMs = 1;
export const idleCallbackBudgetMs = 1;

interface IdleCallback {
	readonly id: number;
	readonly expiresAt?: number;
	callback: unknown;
	prefixDone: boolean;
	resultDone: boolean;
}

function unsignedHandle(value: unknown): number {
	if (
		(typeof value === "object" && value !== null) ||
		["function", "symbol", "bigint"].includes(typeof value)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Idle callback object and bigint coercion is unsupported",
		);
	if (typeof value === "string" && value.length > 1024)
		throw new AgentBrowserError(
			"resource-limit",
			"Idle callback argument limit exceeded",
		);
	const number = Number(value);
	return Number.isFinite(number)
		? ((Math.trunc(number) % 4_294_967_296) + 4_294_967_296) % 4_294_967_296
		: 0;
}

function requestedTimeout(options: unknown): number {
	if (options === undefined || options === null) return 0;
	if (typeof options !== "object" || Array.isArray(options))
		throw new TypeError("Idle callback options require a dictionary");
	if (![null, Object.prototype].includes(Object.getPrototypeOf(options)))
		throw new AgentBrowserError(
			"unsupported",
			"Inherited idle callback options are unsupported",
		);
	const descriptor = Object.getOwnPropertyDescriptor(options, "timeout");
	if (!descriptor) return 0;
	if (!Object.hasOwn(descriptor, "value"))
		throw new AgentBrowserError(
			"unsupported",
			"Idle callback option accessors are unsupported",
		);
	return unsignedHandle(descriptor.value);
}

export class PageIdleCallbacks {
	readonly limits: Readonly<IdleCallbackLimits>;
	readonly methods = {
		requestIdleCallback: (callback: unknown, options?: unknown) =>
			this.request(callback, options),
		cancelIdleCallback: (...args: unknown[]) => this.cancel(args),
	};
	private readonly records = new Map<number, IdleCallback>();
	private readonly inFlight = new Set<IdleCallback>();
	private handle?: ReturnType<typeof setTimeout>;
	private handleAt?: number;
	private generation = 0;
	private idleDeadline = 0;
	private scheduled = 0;
	private fired = 0;
	private timedOut = 0;
	private opportunities = 0;
	private running = false;
	private closed = false;

	constructor(
		private readonly callbacks: ScriptCallbackRuntime & { isBusy?(): boolean },
		private readonly factory: ScriptHostObjectFactory,
		private readonly fail: (error: unknown) => void,
		private readonly clock: { now(): number },
		limits: Partial<IdleCallbackLimits> = {},
	) {
		if (!limits || typeof limits !== "object" || Array.isArray(limits))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid idle callback limits",
			);
		for (const [key, value] of Object.entries(limits))
			if (
				!Object.hasOwn(idleCallbackLimits, key) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > idleCallbackLimits[key as keyof IdleCallbackLimits] * 16
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid idle callback limit",
				);
		this.limits = Object.freeze({ ...idleCallbackLimits, ...limits });
	}

	metrics() {
		return Object.freeze({
			partial: true,
			profile: "software-idle-opportunities",
			intervalMs: idleCallbackIntervalMs,
			budgetMs: idleCallbackBudgetMs,
			active: this.records.size,
			pendingCallbacks: this.inFlight.size,
			scheduled: this.scheduled,
			fired: this.fired,
			timedOut: this.timedOut,
			opportunities: this.opportunities,
			running: this.running,
			armed: this.handle !== undefined,
			closed: this.closed,
			limits: this.limits,
		});
	}

	wake() {
		if (this.closed) return;
		try {
			this.arm();
		} catch (error) {
			this.stop(error);
		}
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.disarm();
		for (const record of this.records.values()) record.callback = undefined;
		for (const record of this.inFlight) record.callback = undefined;
		this.records.clear();
		this.inFlight.clear();
		this.running = false;
	}

	private request(callback: unknown, options: unknown) {
		this.ensureOpen();
		if (typeof callback !== "function")
			throw new TypeError("requestIdleCallback requires a function");
		const timeout = requestedTimeout(options);
		this.ensureOpen();
		if (
			this.records.size >= this.limits.maxActive ||
			this.scheduled >= this.limits.maxScheduled
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Idle callback request limit exceeded",
			);
		const now = this.now();
		this.ensureOpen();
		const record: IdleCallback = {
			id: ++this.scheduled,
			callback,
			...(timeout > 0 ? { expiresAt: now + timeout } : {}),
			prefixDone: false,
			resultDone: false,
		};
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
			throw new TypeError("cancelIdleCallback requires a handle");
		const record = this.records.get(unsignedHandle(args[0]));
		if (!record) return;
		record.callback = undefined;
		this.records.delete(record.id);
		this.disarm();
		this.wake();
	}

	private now() {
		const value = this.clock.now();
		if (!Number.isFinite(value) || value < 0)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid idle callback clock",
			);
		return value;
	}

	private disarm() {
		if (this.handle !== undefined) clearTimeout(this.handle);
		this.handle = undefined;
		this.handleAt = undefined;
		this.generation++;
	}

	private arm() {
		if (this.closed) return;
		if (this.callbacks.isClosed()) {
			this.close();
			return;
		}
		if (this.running || !this.records.size) return;
		const now = this.now();
		const busy = this.callbacks.isBusy?.() ?? false;
		if (this.closed) return;
		let due = busy
			? Number.POSITIVE_INFINITY
			: Math.max(now + idleCallbackIntervalMs, this.idleDeadline);
		for (const record of this.records.values())
			if (record.expiresAt !== undefined) due = Math.min(due, record.expiresAt);
		if (!Number.isFinite(due)) {
			this.disarm();
			return;
		}
		if (
			this.handleAt !== undefined &&
			(this.handleAt === due || (!busy && this.handleAt <= due))
		)
			return;
		this.disarm();
		const generation = this.generation;
		this.handleAt = due;
		this.handle = setTimeout(
			() => {
				if (generation !== this.generation) return;
				this.handle = undefined;
				this.handleAt = undefined;
				try {
					this.dispatch();
				} catch (error) {
					this.stop(error);
				}
			},
			Math.min(2_147_483_647, Math.max(0, Math.ceil(due - now))),
		);
	}

	private dispatch() {
		if (this.closed || this.running) return;
		if (this.callbacks.isClosed()) {
			this.close();
			return;
		}
		const now = this.now();
		let record: IdleCallback | undefined;
		for (const candidate of this.records.values())
			if (
				candidate.expiresAt !== undefined &&
				candidate.expiresAt <= now &&
				(record?.expiresAt === undefined ||
					candidate.expiresAt < record.expiresAt)
			)
				record = candidate;
		const didTimeout = record !== undefined;
		if (!record && !this.callbacks.isBusy?.())
			record = this.records.values().next().value;
		if (!record) {
			this.arm();
			return;
		}
		if (
			this.fired >= this.limits.maxCallbacks ||
			this.inFlight.size >= this.limits.maxPendingCallbacks
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Idle callback dispatch limit exceeded",
			);
		this.inFlight.add(record);
		this.running = true;
		const deadline = didTimeout ? now : now + idleCallbackBudgetMs;
		if (!didTimeout) this.idleDeadline = deadline;
		const argument = this.deadline(deadline, didTimeout);
		if (this.closed || this.callbacks.isClosed()) {
			this.close();
			return;
		}
		if (this.records.get(record.id) !== record) {
			this.inFlight.delete(record);
			this.running = false;
			this.wake();
			return;
		}
		this.records.delete(record.id);
		this.fired++;
		if (didTimeout) this.timedOut++;
		else this.opportunities++;
		const invocation = this.callbacks.startCallback(
			record.callback,
			[argument],
			{
				thisValue: undefined,
			},
		);
		const synchronous = invocation.synchronous;
		const result = invocation.result;
		const current = record;
		const finishResult = () => {
			current.resultDone = true;
			this.release(current);
		};
		const finishPrefix = () => {
			current.prefixDone = true;
			this.release(current);
			this.running = false;
			this.wake();
		};
		void Promise.resolve(result).then(finishResult, finishResult);
		void Promise.resolve(synchronous).then(finishPrefix, finishPrefix);
		if (
			typeof synchronous?.then !== "function" ||
			typeof result?.then !== "function"
		)
			throw new AgentBrowserError(
				"unsupported",
				"Invalid idle callback completion phases",
			);
	}

	private deadline(deadline: number, didTimeout: boolean) {
		let remaining = didTimeout ? 0 : idleCallbackBudgetMs;
		return this.factory.createHostObject({
			properties: {
				didTimeout: {
					get: () => {
						this.ensureOpen();
						return didTimeout;
					},
				},
			},
			methods: {
				timeRemaining: () => {
					this.ensureOpen();
					remaining = Math.max(0, Math.min(remaining, deadline - this.now()));
					return Math.floor(remaining * 10) / 10;
				},
			},
		});
	}

	private release(record: IdleCallback) {
		if (!record.prefixDone || !record.resultDone) return;
		record.callback = undefined;
		this.inFlight.delete(record);
	}

	private stop(error: unknown) {
		if (this.closed) return;
		this.close();
		this.fail(error);
	}

	private ensureOpen() {
		if (this.closed || this.callbacks.isClosed())
			throw new AgentBrowserError("closed", "Idle callbacks are closed");
	}
}
