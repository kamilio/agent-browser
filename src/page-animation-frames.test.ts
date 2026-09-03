import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	PageAnimationFrames,
	type AnimationFrameLimits,
} from "./page-animation-frames.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

const owners: PageAnimationFrames[] = [];
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(100000);
});
afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
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
function fixture(limits: Partial<AnimationFrameLimits> = {}) {
	const window = {};
	const fail = vi.fn();
	let closed = false;
	const runtime: ScriptCallbackRuntime = {
		isClosed: () => closed,
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
			return { synchronous: Promise.resolve(), result };
		}),
	};
	const frames = new PageAnimationFrames(
		runtime,
		() => window,
		fail,
		{ now: () => Date.now() - 100000 },
		limits,
	);
	owners.push(frames);
	return {
		frames,
		runtime,
		fail,
		window,
		closeRuntime: () => {
			closed = true;
		},
		...frames.methods,
	};
}

describe("software animation frame opportunities", () => {
	it("runs an ordered batch asynchronously with one timestamp and Window receiver", async () => {
		const test = fixture();
		const observations: unknown[] = [];
		for (let index = 0; index < 3; index++) {
			expect(
				test.requestAnimationFrame(function (this: unknown, timestamp: number) {
					observations.push([index, timestamp, this === test.window]);
				}),
			).toBe(index + 1);
		}
		expect(observations).toEqual([]);
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(17);
		expect(observations).toEqual([
			[0, 17, true],
			[1, 17, true],
			[2, 17, true],
		]);
		expect(test.frames.metrics()).toMatchObject({
			frames: 1,
			fired: 3,
			active: 0,
			pendingCallbacks: 0,
			armed: false,
			running: false,
		});
		expect(vi.getTimerCount()).toBe(0);
	});
	it("cancels queued handles and never recycles identifiers", async () => {
		const test = fixture();
		const callback = vi.fn();
		const first = test.requestAnimationFrame(callback);
		test.cancelAnimationFrame(first);
		expect(vi.getTimerCount()).toBe(0);
		expect(test.requestAnimationFrame(callback)).toBe(first + 1);
		test.cancelAnimationFrame(String(first + 1));
		await vi.advanceTimersByTimeAsync(100);
		expect(callback).not.toHaveBeenCalled();
	});
	it("bounds a large batch to one alarm and releases every completed record", async () => {
		const test = fixture({ maxActive: 512 });
		const callback = vi.fn();
		for (let index = 0; index < 512; index++)
			test.requestAnimationFrame(callback);
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(17);
		expect(callback).toHaveBeenCalledTimes(512);
		expect(callback.mock.calls.every((args) => args[0] === 17)).toBe(true);
		expect(test.frames.metrics()).toMatchObject({
			fired: 512,
			frames: 1,
			active: 0,
			pendingCallbacks: 0,
			armed: false,
		});
		expect(vi.getTimerCount()).toBe(0);
	});
	it("does not replay missed frames after a slow callback prefix", async () => {
		const test = fixture();
		const prefix = deferred<void>();
		const next = vi.fn();
		vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => {
			test.requestAnimationFrame(next);
			return { synchronous: prefix.promise, result: Promise.resolve() };
		});
		test.requestAnimationFrame(() => {});
		await vi.advanceTimersByTimeAsync(500);
		expect(next).not.toHaveBeenCalled();
		prefix.resolve();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(1);
		expect(next).toHaveBeenCalledOnce();
		expect(test.frames.metrics().frames).toBe(2);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("honors cancellation inside a batch and defers newly registered callbacks", async () => {
		const test = fixture();
		const order: string[] = [];
		let canceled = 0;
		test.requestAnimationFrame(() => {
			order.push("first");
			test.cancelAnimationFrame(canceled);
			test.requestAnimationFrame(() => order.push("next"));
		});
		canceled = test.requestAnimationFrame(() => order.push("canceled"));
		test.requestAnimationFrame(() => order.push("last"));
		await vi.advanceTimersByTimeAsync(17);
		expect(order).toEqual(["first", "last"]);
		await vi.advanceTimersByTimeAsync(17);
		expect(order).toEqual(["first", "last", "next"]);
		expect(test.frames.metrics().frames).toBe(2);
	});
	it("waits for each synchronous prefix without changing the batch timestamp", async () => {
		const test = fixture();
		const prefix = deferred<void>();
		const result = deferred<unknown>();
		const next = vi.fn();
		vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => ({
			synchronous: prefix.promise,
			result: result.promise,
		}));
		test.requestAnimationFrame(() => {});
		test.requestAnimationFrame(next);
		await vi.advanceTimersByTimeAsync(100);
		expect(next).not.toHaveBeenCalled();
		expect(test.frames.metrics()).toMatchObject({
			running: true,
			pendingCallbacks: 1,
		});
		prefix.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(next).toHaveBeenCalledWith(17);
		expect(test.frames.metrics().pendingCallbacks).toBe(1);
		result.resolve(undefined);
		await Promise.resolve();
		expect(test.frames.metrics().pendingCallbacks).toBe(0);
	});
	it("does not await an async result before later callbacks or frames", async () => {
		const test = fixture();
		const tail = deferred<void>();
		const next = vi.fn();
		test.requestAnimationFrame(() => tail.promise);
		test.requestAnimationFrame(() => test.requestAnimationFrame(next));
		await vi.advanceTimersByTimeAsync(34);
		expect(next).toHaveBeenCalledWith(34);
		expect(test.frames.metrics()).toMatchObject({
			frames: 2,
			pendingCallbacks: 1,
		});
		tail.resolve();
		await Promise.resolve();
		expect(test.frames.metrics().pendingCallbacks).toBe(0);
	});
	it("continues after ordinary guest rejection", async () => {
		const test = fixture();
		const next = vi.fn();
		test.requestAnimationFrame(() => {
			throw new Error("guest error");
		});
		test.requestAnimationFrame(next);
		await vi.advanceTimersByTimeAsync(17);
		expect(next).toHaveBeenCalledOnce();
		expect(test.fail).not.toHaveBeenCalled();
	});
	it("closes after callback startup failure", async () => {
		const test = fixture();
		const error = new Error("runtime failed");
		vi.mocked(test.runtime.startCallback).mockImplementation(() => {
			throw error;
		});
		test.requestAnimationFrame(() => {});
		test.requestAnimationFrame(() => {});
		await vi.advanceTimersByTimeAsync(17);
		expect(test.fail).toHaveBeenCalledWith(error);
		expect(test.frames.metrics()).toMatchObject({
			closed: true,
			active: 0,
			pendingCallbacks: 0,
			armed: false,
		});
	});
	it("enforces active and cumulative request quotas before accepting work", () => {
		const test = fixture({ maxActive: 1, maxScheduled: 2 });
		const first = test.requestAnimationFrame(() => {});
		expect(() => test.requestAnimationFrame(() => {})).toThrow(/limit/);
		test.cancelAnimationFrame(first);
		test.cancelAnimationFrame(test.requestAnimationFrame(() => {}));
		expect(() => test.requestAnimationFrame(() => {})).toThrow(/limit/);
		expect(test.frames.metrics()).toMatchObject({ scheduled: 2, active: 0 });
	});
	it.each(["maxCallbacks", "maxPendingCallbacks"] as const)(
		"bounds %s and releases queued work",
		async (limit) => {
			const test = fixture({ [limit]: 1 });
			const tail = deferred<void>();
			test.requestAnimationFrame(() => tail.promise);
			test.requestAnimationFrame(() => {});
			await vi.advanceTimersByTimeAsync(17);
			expect(test.fail).toHaveBeenCalledOnce();
			expect(test.frames.metrics()).toMatchObject({
				fired: 1,
				closed: true,
				active: 0,
				pendingCallbacks: 0,
			});
			tail.resolve();
			await Promise.resolve();
		},
	);
	it("revokes both functions and cancels alarms on close", async () => {
		const test = fixture();
		const callback = vi.fn();
		test.requestAnimationFrame(callback);
		test.frames.close();
		test.frames.close();
		expect(vi.getTimerCount()).toBe(0);
		expect(() => test.requestAnimationFrame(callback)).toThrow(/closed/);
		expect(() => test.cancelAnimationFrame(1)).toThrow(/closed/);
		await vi.advanceTimersByTimeAsync(100);
		expect(callback).not.toHaveBeenCalled();
	});
	it("ignores delayed prefix completion after close", async () => {
		const test = fixture();
		const prefix = deferred<void>();
		vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => ({
			synchronous: prefix.promise,
			result: Promise.resolve(),
		}));
		test.requestAnimationFrame(() => {});
		test.requestAnimationFrame(() => {});
		await vi.advanceTimersByTimeAsync(17);
		test.frames.close();
		prefix.resolve();
		await Promise.resolve();
		expect(test.runtime.startCallback).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});
	it("does not invoke callbacks after external runtime closure", async () => {
		const test = fixture();
		test.requestAnimationFrame(() => {});
		test.closeRuntime();
		await vi.advanceTimersByTimeAsync(17);
		expect(test.runtime.startCallback).not.toHaveBeenCalled();
		expect(test.frames.metrics().closed).toBe(true);
	});
	it("converts primitive cancellation handles as unsigned longs", async () => {
		const test = fixture();
		const callback = vi.fn();
		test.requestAnimationFrame(callback);
		test.cancelAnimationFrame(4_294_967_297.9);
		for (const value of [
			null,
			undefined,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			false,
		])
			test.cancelAnimationFrame(value);
		await vi.advanceTimersByTimeAsync(17);
		expect(callback).not.toHaveBeenCalled();
		expect(() => test.cancelAnimationFrame()).toThrow(TypeError);
		for (const value of [{}, () => 1, Symbol(), 1n])
			expect(() => test.cancelAnimationFrame(value)).toThrow(/coercion/);
		for (const value of [null, undefined, {}, "code", 1])
			expect(() => test.requestAnimationFrame(value)).toThrow(TypeError);
	});
	it.each([
		{ maxActive: 0 },
		{ maxScheduled: 1.5 },
		{ maxCallbacks: Number.POSITIVE_INFINITY },
		{ maxPendingCallbacks: 2049 },
		{ other: 1 },
		null,
		[],
	])("rejects malformed limits %j", (limits) => {
		expect(() => fixture(limits as Partial<AnimationFrameLimits>)).toThrow(
			/limit/,
		);
	});
});
