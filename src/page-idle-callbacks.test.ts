import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type IdleCallbackLimits,
	PageIdleCallbacks,
	idleCallbackBudgetMs,
	idleCallbackIntervalMs,
	idleCallbackLimits,
} from "./page-idle-callbacks.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

interface Deadline {
	readonly didTimeout: boolean;
	timeRemaining(): number;
}

const owners: PageIdleCallbacks[] = [];
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(100_000);
});
afterEach(() => {
	vi.restoreAllMocks();
	for (const owner of owners.splice(0)) {
		owner.close();
		expect(owner.metrics()).toMatchObject({
			active: 0,
			pendingCallbacks: 0,
			closed: true,
		});
	}
	expect(vi.getTimerCount()).toBe(0);
	vi.useRealTimers();
});

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, refuse) => {
		resolve = accept;
		reject = refuse;
	});
	return { promise, resolve, reject };
}

async function flush() {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}

function hostObject(definition: ScriptHostObjectDefinition): object {
	const target = Object.create(null);
	for (const [name, descriptor] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(target, name, descriptor);
	for (const [name, value] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(target, name, { value });
	return target;
}

function fixture(limits: Partial<IdleCallbackLimits> = {}, withBusy = true) {
	let busy = false;
	let closed = false;
	let manualNow: number | undefined;
	const reported: unknown[] = [];
	const fail = vi.fn();
	const clock = { now: vi.fn(() => manualNow ?? Date.now() - 100_000) };
	const factory = { createHostObject: vi.fn(hostObject) };
	const busyCheck = vi.fn(() => busy);
	const runtime: ScriptCallbackRuntime & { isBusy?: () => boolean } = {
		isClosed: () => closed,
		...(withBusy ? { isBusy: busyCheck } : {}),
		startCallback: vi.fn((callback, args, options) => {
			let result: Promise<unknown>;
			try {
				result = Promise.resolve(
					(callback as (...values: unknown[]) => unknown).apply(
						options.thisValue,
						[...args],
					),
				);
			} catch (error) {
				result = Promise.reject(error);
			}
			void result.catch((error) => {
				reported.push(error);
			});
			return { synchronous: Promise.resolve(), result };
		}),
	};
	const owner = new PageIdleCallbacks(runtime, factory, fail, clock, limits);
	owners.push(owner);
	return {
		owner,
		runtime,
		factory,
		fail,
		clock,
		busyCheck,
		reported,
		setBusy: (value: boolean) => {
			busy = value;
		},
		closeRuntime: () => {
			closed = true;
		},
		setNow: (value: number) => {
			manualNow = value;
		},
	};
}

it("exports fixed native policy and snapshots validated limits", () => {
	expect(idleCallbackIntervalMs).toBe(1);
	expect(idleCallbackBudgetMs).toBe(1);
	expect(idleCallbackLimits).toEqual({
		maxActive: 128,
		maxScheduled: 4096,
		maxCallbacks: 1024,
		maxPendingCallbacks: 128,
	});
	expect(Object.isFrozen(idleCallbackLimits)).toBe(true);
	const input = { maxActive: 2 };
	const test = fixture(input);
	input.maxActive = 20;
	expect(test.owner.limits).toEqual({ ...idleCallbackLimits, maxActive: 2 });
	expect(Object.isFrozen(test.owner.limits)).toBe(true);
	expect(test.owner.metrics()).toMatchObject({
		active: 0,
		pendingCallbacks: 0,
		scheduled: 0,
		fired: 0,
		closed: false,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it.each(
	[
		null,
		[],
		1,
		{ unknown: 1 },
		{ maxActive: 0 },
		{ maxActive: -1 },
		{ maxScheduled: 1.5 },
		{ maxCallbacks: Number.NaN },
		{ maxPendingCallbacks: Number.POSITIVE_INFINITY },
		{ maxActive: 2049 },
		{ maxScheduled: 65537 },
		{ maxCallbacks: 16385 },
		{ maxPendingCallbacks: 2049 },
	].map((limits) => ({ limits })),
)("rejects malformed limits $limits before scheduling", ({ limits }) => {
	expect(() => fixture(limits as Partial<IdleCallbackLimits>)).toThrow();
	expect(vi.getTimerCount()).toBe(0);
});

it("accepts each exact 16x configured ceiling", () => {
	const test = fixture({
		maxActive: 2048,
		maxScheduled: 65536,
		maxCallbacks: 16384,
		maxPendingCallbacks: 2048,
	});
	expect(test.owner.limits).toEqual({
		maxActive: 2048,
		maxScheduled: 65536,
		maxCallbacks: 16384,
		maxPendingCallbacks: 2048,
	});
});

it("validates callbacks before options without invoking any timeout getter", () => {
	const test = fixture();
	const getter = vi.fn(() => 1);
	const options = Object.defineProperty({}, "timeout", { get: getter });
	for (const callback of [
		undefined,
		null,
		"source",
		{},
		[],
		1,
		Symbol("callback"),
	])
		expect(() =>
			test.owner.methods.requestIdleCallback(callback, options),
		).toThrow(TypeError);
	expect(() =>
		test.owner.methods.requestIdleCallback(() => {}, options),
	).toThrow();
	expect(getter).not.toHaveBeenCalled();
	expect(test.owner.metrics()).toMatchObject({ scheduled: 0, active: 0 });
	expect(test.owner.methods.requestIdleCallback(() => {})).toBe(1);
});

it("accepts omitted/null and own-data plain/null-prototype options, ignoring unknown data", () => {
	const test = fixture();
	test.setBusy(true);
	for (const options of [
		undefined,
		null,
		{},
		{ ignored: Symbol("ignored") },
		Object.assign(Object.create(null), { timeout: 0, ignored: {} }),
	])
		expect(
			test.owner.methods.requestIdleCallback(() => {}, options),
		).toBeGreaterThan(0);
	expect(vi.getTimerCount()).toBe(0);
});

it("rejects inherited option prototypes and non-dictionaries without charging identifiers", () => {
	const test = fixture();
	for (const options of [
		[],
		1,
		"timeout",
		true,
		() => {},
		Object.create({ timeout: 1 }),
		new Date(0),
	])
		expect(() =>
			test.owner.methods.requestIdleCallback(() => {}, options),
		).toThrow();
	expect(test.owner.methods.requestIdleCallback(() => {})).toBe(1);
});

it("rejects timeout coercion objects and long primitive strings without executing conversion", () => {
	const test = fixture();
	const conversion = vi.fn(() => 1);
	for (const timeout of [
		{ valueOf: conversion, toString: conversion },
		() => 1,
		Symbol("timeout"),
		1n,
	])
		expect(() =>
			test.owner.methods.requestIdleCallback(() => {}, { timeout }),
		).toThrow(/coercion|unsupported/i);
	expect(() =>
		test.owner.methods.requestIdleCallback(() => {}, {
			timeout: "1".repeat(1025),
		}),
	).toThrow(/limit/i);
	expect(conversion).not.toHaveBeenCalled();
	expect(test.owner.metrics()).toMatchObject({ scheduled: 0, active: 0 });
	expect(test.owner.methods.requestIdleCallback(() => {})).toBe(1);
});

it("creates no timeout task for zero/absent or zero-converting primitive timeouts while busy", async () => {
	const test = fixture();
	test.setBusy(true);
	const callback = vi.fn();
	for (const timeout of [
		0,
		undefined,
		null,
		false,
		"",
		"0",
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		4294967296,
	])
		test.owner.methods.requestIdleCallback(callback, { timeout });
	test.owner.methods.requestIdleCallback(callback);
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(1000);
	expect(callback).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
	test.setBusy(false);
	test.owner.wake();
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledOnce();
	expect(callback.mock.calls[0][0].didTimeout).toBe(false);
});

it.each([
	[true, 1],
	["2.9", 2],
	[4294967297.9, 1],
	[-4294967295, 1],
])(
	"converts positive timeout %s by bounded unsigned-long rules",
	async (timeout, milliseconds) => {
		const test = fixture();
		test.setBusy(true);
		const callback = vi.fn();
		test.owner.methods.requestIdleCallback(callback, { timeout });
		await vi.advanceTimersByTimeAsync(milliseconds - 1);
		expect(callback).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(callback).toHaveBeenCalledOnce();
		expect(callback.mock.calls[0][0].didTimeout).toBe(true);
		expect(callback.mock.calls[0][0].timeRemaining()).toBe(0);
	},
);

it("does not overflow a wrapped maximum unsigned timeout into immediate delivery", async () => {
	const test = fixture();
	test.setBusy(true);
	const callback = vi.fn();
	const handle = test.owner.methods.requestIdleCallback(callback, {
		timeout: -1,
	});
	await vi.advanceTimersByTimeAsync(100);
	expect(callback).not.toHaveBeenCalled();
	test.owner.methods.cancelIdleCallback(handle);
	expect(vi.getTimerCount()).toBe(0);
});

it("validates cancellation arguments without coercion and does not charge request quota", () => {
	const test = fixture();
	const conversion = vi.fn(() => 1);
	expect(() => test.owner.methods.cancelIdleCallback()).toThrow(TypeError);
	for (const value of [
		{ valueOf: conversion, toString: conversion },
		() => 1,
		Symbol("handle"),
		1n,
	])
		expect(() => test.owner.methods.cancelIdleCallback(value)).toThrow(
			/coercion|unsupported/i,
		);
	expect(() => test.owner.methods.cancelIdleCallback("1".repeat(1025))).toThrow(
		/limit/i,
	);
	expect(conversion).not.toHaveBeenCalled();
	expect(test.owner.methods.requestIdleCallback(() => {})).toBe(1);
	for (const value of [
		undefined,
		null,
		false,
		"",
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	])
		test.owner.methods.cancelIdleCallback(value);
	expect(test.owner.metrics().active).toBe(1);
	test.owner.methods.cancelIdleCallback(4294967297.9);
	expect(test.owner.metrics().active).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
});

it.each([true, "1", -4294967295])(
	"cancels an existing handle converted from %s",
	async (handle) => {
		const test = fixture();
		const callback = vi.fn();
		expect(test.owner.methods.requestIdleCallback(callback)).toBe(1);
		test.owner.methods.cancelIdleCallback(handle);
		await vi.advanceTimersByTimeAsync(10);
		expect(callback).not.toHaveBeenCalled();
		expect(test.owner.methods.requestIdleCallback(() => {})).toBe(2);
	},
);

it("delivers FIFO at one callback per 1ms opportunity with undefined receiver and fresh readonly deadlines", async () => {
	const test = fixture();
	const order: number[] = [];
	const deadlines: Deadline[] = [];
	for (let index = 0; index < 3; index++)
		test.owner.methods.requestIdleCallback(function (
			this: unknown,
			deadline: Deadline,
		) {
			expect(this).toBeUndefined();
			expect(deadline.didTimeout).toBe(false);
			expect(deadline.timeRemaining()).toBe(1);
			deadlines.push(deadline);
			order.push(index);
		});
	expect(vi.getTimerCount()).toBe(1);
	expect(order).toEqual([]);
	for (let elapsed = 1; elapsed <= 3; elapsed++) {
		await vi.advanceTimersByTimeAsync(1);
		expect(order).toEqual([0, 1, 2].slice(0, elapsed));
	}
	expect(new Set(deadlines).size).toBe(3);
	for (const deadline of deadlines) {
		expect(
			Object.getOwnPropertyDescriptor(deadline, "didTimeout")?.set,
		).toBeUndefined();
		expect(Reflect.set(deadline, "didTimeout", true)).toBe(false);
		expect(Reflect.set(deadline, "timeRemaining", () => 50)).toBe(false);
	}
	expect(test.owner.metrics()).toMatchObject({
		fired: 3,
		active: 0,
		pendingCallbacks: 0,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("bounds many ordinary requests to one alarm instead of one timer per callback", async () => {
	const test = fixture();
	const callback = vi.fn();
	for (let index = 0; index < 32; index++)
		test.owner.methods.requestIdleCallback(callback);
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(5);
	expect(callback).toHaveBeenCalledTimes(5);
	expect(test.owner.metrics().active).toBe(27);
	expect(vi.getTimerCount()).toBe(1);
});

it("keeps nested requests behind pending work and honors reentrant cancellation", async () => {
	const test = fixture();
	const order: string[] = [];
	let canceled = 0;
	test.owner.methods.requestIdleCallback(() => {
		order.push("first");
		test.owner.methods.cancelIdleCallback(canceled);
		test.owner.methods.requestIdleCallback(() => order.push("nested"));
	});
	canceled = test.owner.methods.requestIdleCallback(() =>
		order.push("canceled"),
	);
	test.owner.methods.requestIdleCallback(() => order.push("last"));
	await vi.advanceTimersByTimeAsync(1);
	expect(order).toEqual(["first"]);
	await vi.advanceTimersByTimeAsync(1);
	expect(order).toEqual(["first", "last"]);
	await vi.advanceTimersByTimeAsync(1);
	expect(order).toEqual(["first", "last", "nested"]);
});

it("clamps saved normal deadline budget to nonincreasing nonnegative tenths", async () => {
	const test = fixture();
	let deadline!: Deadline;
	test.owner.methods.requestIdleCallback((value: Deadline) => {
		deadline = value;
	});
	await vi.advanceTimersByTimeAsync(1);
	expect(deadline.timeRemaining()).toBe(1);
	let previous = 1;
	for (const now of [1.26, 1.5, 1.1, 0, 1.9, 2, 20]) {
		test.setNow(now);
		const remaining = deadline.timeRemaining();
		expect(remaining).toBeGreaterThanOrEqual(0);
		expect(remaining).toBeLessThanOrEqual(previous);
		expect(remaining * 10).toBeCloseTo(Math.round(remaining * 10), 10);
		if (now >= 2) expect(remaining).toBe(0);
		previous = remaining;
	}
	const remaining = deadline.timeRemaining;
	test.owner.close();
	expect(() => deadline.didTimeout).toThrow(/closed/i);
	expect(() => remaining()).toThrow(/closed/i);
});

it("never busy-polls ordinary pending work and requires wake after external busy completion", async () => {
	const test = fixture();
	const callback = vi.fn();
	test.setBusy(true);
	test.owner.methods.requestIdleCallback(callback);
	for (let index = 0; index < 20; index++) test.owner.wake();
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(1000);
	expect(callback).not.toHaveBeenCalled();
	test.setBusy(false);
	await vi.advanceTimersByTimeAsync(10);
	expect(callback).not.toHaveBeenCalled();
	test.owner.wake();
	test.owner.wake();
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledOnce();
});

it("disarms an idle opportunity that finds runtime busy without polling again", async () => {
	const test = fixture();
	const callback = vi.fn();
	test.owner.methods.requestIdleCallback(callback);
	test.setBusy(true);
	await vi.advanceTimersByTimeAsync(100);
	expect(callback).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
	test.setBusy(false);
	test.owner.wake();
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledOnce();
});

it("works when the optional runtime busy method is absent", async () => {
	const test = fixture({}, false);
	const callback = vi.fn();
	test.owner.methods.requestIdleCallback(callback);
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledOnce();
});

it("orders expired positive deadlines by deadline then request ID while busy", async () => {
	const test = fixture();
	test.setBusy(true);
	const order: string[] = [];
	for (const [name, timeout] of [
		["late", 8],
		["early", 2],
		["tie", 2],
	] as const)
		test.owner.methods.requestIdleCallback(
			(deadline: Deadline) => {
				expect(deadline.didTimeout).toBe(true);
				expect(deadline.timeRemaining()).toBe(0);
				order.push(name);
			},
			{ timeout },
		);
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(10);
	expect(order).toEqual(["early", "tie", "late"]);
	expect(vi.getTimerCount()).toBe(0);
});

it("treats a positive deadline equal to the idle opportunity as timed out exactly once", async () => {
	const test = fixture();
	const callback = vi.fn();
	test.owner.methods.requestIdleCallback(callback, { timeout: 1 });
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledOnce();
	expect(callback.mock.calls[0][0].didTimeout).toBe(true);
	await vi.advanceTimersByTimeAsync(100);
	expect(callback).toHaveBeenCalledOnce();
});

it("wins the idle/timeout race once and removes the losing positive timeout", async () => {
	const test = fixture();
	const callback = vi.fn();
	test.owner.methods.requestIdleCallback(callback, { timeout: 20 });
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledOnce();
	expect(callback.mock.calls[0][0].didTimeout).toBe(false);
	await vi.advanceTimersByTimeAsync(50);
	expect(callback).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
});

it("canceling the earliest busy timeout preserves the later alarm and callback", async () => {
	const test = fixture();
	test.setBusy(true);
	const canceled = vi.fn();
	const later = vi.fn();
	const handle = test.owner.methods.requestIdleCallback(canceled, {
		timeout: 2,
	});
	test.owner.methods.requestIdleCallback(later, { timeout: 5 });
	test.owner.methods.cancelIdleCallback(handle);
	await vi.advanceTimersByTimeAsync(4);
	expect(later).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(later).toHaveBeenCalledOnce();
	expect(canceled).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it.each(["prefix-first", "result-first"])(
	"holds pending quota until both phases settle in %s order",
	async (order) => {
		const test = fixture({ maxPendingCallbacks: 1 });
		const prefix = deferred<void>();
		const result = deferred<unknown>();
		vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => ({
			synchronous: prefix.promise,
			result: result.promise,
		}));
		test.owner.methods.requestIdleCallback(() => {});
		await vi.advanceTimersByTimeAsync(1);
		expect(test.owner.metrics().pendingCallbacks).toBe(1);
		if (order === "prefix-first") prefix.resolve();
		else result.resolve(undefined);
		await flush();
		expect(test.owner.metrics().pendingCallbacks).toBe(1);
		if (order === "prefix-first") result.resolve(undefined);
		else prefix.resolve();
		await flush();
		expect(test.owner.metrics().pendingCallbacks).toBe(0);
		const next = vi.fn();
		test.owner.methods.requestIdleCallback(next);
		await vi.advanceTimersByTimeAsync(1);
		expect(next).toHaveBeenCalledOnce();
		expect(test.fail).not.toHaveBeenCalled();
	},
);

it("does not overlap synchronous prefixes or burst through missed opportunities", async () => {
	const test = fixture();
	const prefix = deferred<void>();
	const result = deferred<unknown>();
	vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => ({
		synchronous: prefix.promise,
		result: result.promise,
	}));
	const next = vi.fn();
	test.owner.methods.requestIdleCallback(() => {});
	test.owner.methods.requestIdleCallback(next);
	await vi.advanceTimersByTimeAsync(100);
	expect(test.runtime.startCallback).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
	result.resolve(undefined);
	await flush();
	expect(test.owner.metrics().pendingCallbacks).toBe(1);
	await vi.advanceTimersByTimeAsync(20);
	expect(next).not.toHaveBeenCalled();
	prefix.resolve();
	await flush();
	expect(next).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(next).toHaveBeenCalledOnce();
	expect(test.owner.metrics().pendingCallbacks).toBe(0);
});

it("allows later prefixes while an earlier async result remains pending", async () => {
	const test = fixture();
	const result = deferred<void>();
	const next = vi.fn();
	test.owner.methods.requestIdleCallback(() => result.promise);
	test.owner.methods.requestIdleCallback(next);
	await vi.advanceTimersByTimeAsync(2);
	expect(next).toHaveBeenCalledOnce();
	expect(test.owner.metrics().pendingCallbacks).toBe(1);
	result.resolve();
	await flush();
	expect(test.owner.metrics().pendingCallbacks).toBe(0);
});

it("does not overlap a running prefix when another positive deadline expires", async () => {
	const test = fixture();
	const prefix = deferred<void>();
	vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => ({
		synchronous: prefix.promise,
		result: Promise.resolve(),
	}));
	const expired = vi.fn();
	test.owner.methods.requestIdleCallback(() => {});
	test.owner.methods.requestIdleCallback(expired, { timeout: 2 });
	await vi.advanceTimersByTimeAsync(10);
	expect(expired).not.toHaveBeenCalled();
	expect(test.runtime.startCallback).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
	prefix.resolve();
	await flush();
	await vi.advanceTimersByTimeAsync(1);
	expect(expired).toHaveBeenCalledOnce();
	expect(expired.mock.calls[0][0].didTimeout).toBe(true);
});

it.each(["prefix-first", "result-first"])(
	"observes both phase rejections and continues in %s order",
	async (order) => {
		const test = fixture();
		const prefix = deferred<void>();
		const result = deferred<unknown>();
		vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => ({
			synchronous: prefix.promise,
			result: result.promise,
		}));
		const next = vi.fn();
		test.owner.methods.requestIdleCallback(() => {});
		test.owner.methods.requestIdleCallback(next);
		await vi.advanceTimersByTimeAsync(1);
		if (order === "prefix-first") prefix.reject(new Error("prefix rejection"));
		else result.reject(new Error("result rejection"));
		await flush();
		expect(test.owner.metrics().pendingCallbacks).toBe(1);
		if (order === "prefix-first") result.reject(new Error("result rejection"));
		else prefix.reject(new Error("prefix rejection"));
		await flush();
		await vi.advanceTimersByTimeAsync(1);
		expect(next).toHaveBeenCalledOnce();
		expect(test.owner.metrics().pendingCallbacks).toBe(0);
		expect(test.fail).not.toHaveBeenCalled();
	},
);

it("observes runtime-reported user callback rejection without stopping later work", async () => {
	const test = fixture();
	const error = new Error("user callback");
	const next = vi.fn();
	test.owner.methods.requestIdleCallback(() => {
		throw error;
	});
	test.owner.methods.requestIdleCallback(next);
	await vi.advanceTimersByTimeAsync(2);
	expect(test.reported).toEqual([error]);
	expect(next).toHaveBeenCalledOnce();
	expect(test.fail).not.toHaveBeenCalled();
});

it("rejects active and cumulative request excess without canceling existing work or consuming IDs", async () => {
	const test = fixture({ maxActive: 1, maxScheduled: 2 });
	const callback = vi.fn();
	expect(test.owner.methods.requestIdleCallback(callback)).toBe(1);
	expect(() => test.owner.methods.requestIdleCallback(() => {})).toThrow(
		/limit/i,
	);
	expect(test.owner.metrics()).toMatchObject({
		scheduled: 1,
		active: 1,
		closed: false,
	});
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledOnce();
	expect(test.owner.methods.requestIdleCallback(callback)).toBe(2);
	expect(() => test.owner.methods.requestIdleCallback(() => {})).toThrow(
		/limit/i,
	);
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledTimes(2);
	expect(() => test.owner.methods.requestIdleCallback(() => {})).toThrow(
		/limit/i,
	);
	expect(test.fail).not.toHaveBeenCalled();
});

it.each(["maxCallbacks", "maxPendingCallbacks"] as const)(
	"fails closed exactly once at %s dispatch exhaustion",
	async (limit) => {
		const test = fixture({ [limit]: 1 });
		const result = deferred<void>();
		const skipped = vi.fn();
		test.owner.methods.requestIdleCallback(() => result.promise);
		test.owner.methods.requestIdleCallback(skipped);
		await vi.advanceTimersByTimeAsync(2);
		expect(skipped).not.toHaveBeenCalled();
		expect(test.fail).toHaveBeenCalledOnce();
		expect(test.owner.metrics()).toMatchObject({
			closed: true,
			fired: 1,
			active: 0,
			pendingCallbacks: 0,
		});
		expect(vi.getTimerCount()).toBe(0);
		result.resolve();
		await flush();
		test.owner.close();
		test.owner.wake();
		expect(test.fail).toHaveBeenCalledOnce();
	},
);

it("fails closed and reports factory allocation failure once", async () => {
	const test = fixture();
	const error = new Error("factory failed");
	test.factory.createHostObject.mockImplementationOnce(() => {
		throw error;
	});
	test.owner.methods.requestIdleCallback(() => {});
	test.owner.methods.requestIdleCallback(() => {});
	await vi.advanceTimersByTimeAsync(5);
	expect(test.runtime.startCallback).not.toHaveBeenCalled();
	expect(test.fail).toHaveBeenCalledExactlyOnceWith(error);
	expect(test.owner.metrics()).toMatchObject({
		closed: true,
		active: 0,
		pendingCallbacks: 0,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("fails closed and reports runtime startup failure once", async () => {
	const test = fixture();
	const error = new Error("runtime admission failed");
	vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => {
		throw error;
	});
	test.owner.methods.requestIdleCallback(() => {});
	test.owner.methods.requestIdleCallback(() => {});
	await vi.advanceTimersByTimeAsync(5);
	expect(test.runtime.startCallback).toHaveBeenCalledOnce();
	expect(test.fail).toHaveBeenCalledExactlyOnceWith(error);
	expect(test.owner.metrics()).toMatchObject({
		closed: true,
		active: 0,
		pendingCallbacks: 0,
	});
});

it("fails closed on host alarm installation failure", () => {
	const test = fixture();
	const error = new Error("alarm allocation failed");
	vi.spyOn(globalThis, "setTimeout").mockImplementationOnce(() => {
		throw error;
	});
	expect(() => test.owner.methods.requestIdleCallback(() => {})).toThrow(error);
	expect(test.fail).toHaveBeenCalledExactlyOnceWith(error);
	expect(test.owner.metrics()).toMatchObject({
		closed: true,
		active: 0,
		pendingCallbacks: 0,
	});
});

it("does not start a callback after reentrant factory close", async () => {
	const test = fixture();
	test.factory.createHostObject.mockImplementationOnce((definition) => {
		test.owner.close();
		return hostObject(definition);
	});
	test.owner.methods.requestIdleCallback(() => {});
	await vi.advanceTimersByTimeAsync(1);
	expect(test.runtime.startCallback).not.toHaveBeenCalled();
	expect(test.owner.metrics()).toMatchObject({
		closed: true,
		active: 0,
		pendingCallbacks: 0,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it.each(["request-clock", "arm-clock", "busy"])(
	"retains no queued callbacks or host alarm after reentrant %s closure",
	async (boundary) => {
		const test = fixture();
		const callback = vi.fn();
		const closeClock = () => {
			test.owner.close();
			return 0;
		};
		if (boundary === "request-clock") {
			test.clock.now.mockImplementationOnce(closeClock);
			expect(() => test.owner.methods.requestIdleCallback(callback)).toThrow(
				/closed/i,
			);
			expect(test.owner.metrics().scheduled).toBe(0);
		} else {
			if (boundary === "arm-clock")
				test.clock.now
					.mockImplementationOnce(() => 0)
					.mockImplementationOnce(closeClock);
			else
				test.busyCheck.mockImplementationOnce(() => {
					test.owner.close();
					return false;
				});
			test.owner.methods.requestIdleCallback(callback);
		}
		expect(test.owner.metrics()).toMatchObject({
			closed: true,
			active: 0,
			pendingCallbacks: 0,
			armed: false,
		});
		expect(vi.getTimerCount()).toBe(0);
		test.owner.wake();
		await vi.advanceTimersByTimeAsync(20);
		expect(callback).not.toHaveBeenCalled();
		expect(test.runtime.startCallback).not.toHaveBeenCalled();
		expect(test.fail).not.toHaveBeenCalled();
	},
);

it.each(["clock", "busy"])(
	"does not rearm an existing opportunity after %s closes during wake",
	async (boundary) => {
		const test = fixture();
		const callback = vi.fn();
		test.owner.methods.requestIdleCallback(callback);
		expect(vi.getTimerCount()).toBe(1);
		if (boundary === "clock")
			test.clock.now.mockImplementationOnce(() => {
				test.owner.close();
				return 0;
			});
		else
			test.busyCheck.mockImplementationOnce(() => {
				test.owner.close();
				return false;
			});
		test.owner.wake();
		expect(test.owner.metrics()).toMatchObject({
			closed: true,
			active: 0,
			pendingCallbacks: 0,
			armed: false,
		});
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(20);
		expect(callback).not.toHaveBeenCalled();
	},
);

it("marks prefix ownership before a reentrant factory request or nested fake-timer opportunity", async () => {
	const test = fixture();
	const prefix = deferred<void>();
	const result = deferred<unknown>();
	const order: string[] = [];
	const first = () => {
		order.push("first");
	};
	vi.mocked(test.runtime.startCallback).mockImplementationOnce(
		(callback, args, options) => {
			(callback as (...values: unknown[]) => unknown).apply(options.thisValue, [
				...args,
			]);
			return { synchronous: prefix.promise, result: result.promise };
		},
	);
	test.factory.createHostObject.mockImplementationOnce((definition) => {
		expect(test.owner.metrics().running).toBe(true);
		test.owner.methods.requestIdleCallback(() => order.push("nested"));
		test.owner.wake();
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(1);
		expect(test.runtime.startCallback).not.toHaveBeenCalled();
		return hostObject(definition);
	});
	test.owner.methods.requestIdleCallback(first);
	test.owner.methods.requestIdleCallback(() => order.push("queued"));
	await vi.advanceTimersByTimeAsync(1);
	expect(order).toEqual(["first"]);
	await vi.advanceTimersByTimeAsync(20);
	expect(test.runtime.startCallback).toHaveBeenCalledOnce();
	result.resolve(undefined);
	await flush();
	expect(test.owner.metrics().pendingCallbacks).toBe(1);
	prefix.resolve();
	await flush();
	await vi.advanceTimersByTimeAsync(1);
	expect(order).toEqual(["first", "queued"]);
	await vi.advanceTimersByTimeAsync(1);
	expect(order).toEqual(["first", "queued", "nested"]);
	expect(test.fail).not.toHaveBeenCalled();
});

it("honors reentrant factory cancellation of later work", async () => {
	const test = fixture();
	const first = vi.fn();
	const skipped = vi.fn();
	let cancel = 0;
	test.factory.createHostObject.mockImplementationOnce((definition) => {
		test.owner.methods.cancelIdleCallback(cancel);
		return hostObject(definition);
	});
	test.owner.methods.requestIdleCallback(first);
	cancel = test.owner.methods.requestIdleCallback(skipped);
	await vi.advanceTimersByTimeAsync(10);
	expect(first).toHaveBeenCalledOnce();
	expect(skipped).not.toHaveBeenCalled();
	expect(test.owner.metrics()).toMatchObject({
		active: 0,
		pendingCallbacks: 0,
	});
});

it("prevents dispatch when the factory cancels the selected but not yet started callback", async () => {
	const test = fixture({ maxCallbacks: 1 });
	const canceled = vi.fn();
	const next = vi.fn();
	let handle = 0;
	test.factory.createHostObject.mockImplementationOnce((definition) => {
		test.owner.methods.cancelIdleCallback(handle);
		return hostObject(definition);
	});
	handle = test.owner.methods.requestIdleCallback(canceled);
	test.owner.methods.requestIdleCallback(next);
	await vi.advanceTimersByTimeAsync(5);
	expect(canceled).not.toHaveBeenCalled();
	expect(next).toHaveBeenCalledOnce();
	expect(test.owner.metrics()).toMatchObject({
		fired: 1,
		active: 0,
		pendingCallbacks: 0,
		running: false,
		closed: false,
	});
	expect(test.fail).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("observes late phase rejection after close during callback startup without resurrecting work", async () => {
	const test = fixture();
	const prefix = deferred<void>();
	const result = deferred<unknown>();
	vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => {
		test.owner.close();
		return { synchronous: prefix.promise, result: result.promise };
	});
	test.owner.methods.requestIdleCallback(() => {});
	test.owner.methods.requestIdleCallback(() => {});
	await vi.advanceTimersByTimeAsync(1);
	prefix.reject(new Error("closed prefix"));
	result.reject(new Error("closed result"));
	await flush();
	await vi.advanceTimersByTimeAsync(10);
	expect(test.runtime.startCallback).toHaveBeenCalledOnce();
	expect(test.owner.metrics()).toMatchObject({
		closed: true,
		active: 0,
		pendingCallbacks: 0,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("revokes deadline capabilities and request/cancel methods and clears queued/pending work on close", async () => {
	const test = fixture();
	const result = deferred<void>();
	let deadline!: Deadline;
	test.owner.methods.requestIdleCallback((value: Deadline) => {
		deadline = value;
		return result.promise;
	});
	const skipped = vi.fn();
	test.owner.methods.requestIdleCallback(skipped, { timeout: 20 });
	await vi.advanceTimersByTimeAsync(1);
	const remaining = deadline.timeRemaining;
	test.owner.close();
	test.owner.close();
	expect(() => deadline.didTimeout).toThrow(/closed/i);
	expect(() => remaining()).toThrow(/closed/i);
	expect(() => test.owner.methods.requestIdleCallback(() => {})).toThrow(
		/closed/i,
	);
	expect(() => test.owner.methods.cancelIdleCallback(1)).toThrow(/closed/i);
	expect(test.owner.metrics()).toMatchObject({
		active: 0,
		pendingCallbacks: 0,
		closed: true,
	});
	expect(vi.getTimerCount()).toBe(0);
	result.resolve();
	await flush();
	await vi.advanceTimersByTimeAsync(100);
	expect(skipped).not.toHaveBeenCalled();
});

it("closes before dispatch after runtime closure and revokes previously saved deadlines", async () => {
	const test = fixture();
	let deadline!: Deadline;
	test.owner.methods.requestIdleCallback((value: Deadline) => {
		deadline = value;
	});
	await vi.advanceTimersByTimeAsync(1);
	const skipped = vi.fn();
	test.owner.methods.requestIdleCallback(skipped);
	test.closeRuntime();
	await vi.advanceTimersByTimeAsync(1);
	expect(skipped).not.toHaveBeenCalled();
	expect(test.owner.metrics().closed).toBe(true);
	expect(() => deadline.timeRemaining()).toThrow(/closed/i);
});

it("keeps independent owners, identifiers, busy state and deadlines isolated", async () => {
	const first = fixture();
	const second = fixture();
	const canceled = vi.fn();
	let deadline!: Deadline;
	first.setBusy(true);
	expect(
		first.owner.methods.requestIdleCallback(canceled, { timeout: 5 }),
	).toBe(1);
	expect(
		second.owner.methods.requestIdleCallback((value: Deadline) => {
			deadline = value;
		}),
	).toBe(1);
	first.owner.methods.cancelIdleCallback(1);
	await vi.advanceTimersByTimeAsync(1);
	expect(second.owner.metrics().fired).toBe(1);
	first.owner.close();
	expect(deadline.didTimeout).toBe(false);
	expect(deadline.timeRemaining()).toBeGreaterThanOrEqual(0);
	await vi.advanceTimersByTimeAsync(10);
	expect(canceled).not.toHaveBeenCalled();
	expect(second.fail).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});
