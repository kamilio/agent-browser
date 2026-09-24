import { afterEach, expect, it, vi } from "vitest";
import { PageTimers, type TimerLimits } from "./page-timers.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

afterEach(() => vi.useRealTimers());

function fixture(limits?: Partial<TimerLimits>) {
	vi.useFakeTimers();
	const window = {};
	const fail = vi.fn();
	const runtime: ScriptCallbackRuntime = {
		isClosed: () => false,
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
	const timers = new PageTimers(runtime, () => window, fail, limits);
	return { timers, methods: timers.methods, runtime, window, fail };
}

function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((accept, refuse) => {
		resolve = accept;
		reject = refuse;
	});
	return { promise, resolve, reject };
}

it("releases owned callbacks once on completion, cancellation and close", async () => {
	const test = fixture();
	const release = vi.fn();
	const timers = new PageTimers(
		test.runtime,
		() => test.window,
		test.fail,
		{},
		undefined,
		release,
	);
	const completed = () => {};
	const canceled = () => {};
	const recurring = () => {};
	timers.methods.setTimeout(completed, 1);
	const id = timers.methods.setTimeout(canceled, 10);
	timers.methods.setInterval(recurring, 1);
	timers.methods.clearTimeout(id);
	await vi.advanceTimersByTimeAsync(3);
	expect(release.mock.calls).toEqual([[canceled], [completed]]);
	timers.close();
	timers.close();
	expect(release.mock.calls).toEqual([[canceled], [completed], [recurring]]);
	test.timers.close();
});

it.each([false, true])(
	"keeps an owned interval callback until overlapping invocations settle (close=%s)",
	async (close) => {
		const test = fixture();
		const release = vi.fn();
		const first = deferred();
		const second = deferred();
		vi.mocked(test.runtime.startCallback)
			.mockReturnValueOnce({
				synchronous: Promise.resolve(),
				result: first.promise,
			})
			.mockReturnValueOnce({
				synchronous: Promise.resolve(),
				result: second.promise,
			});
		const timers = new PageTimers(
			test.runtime,
			() => test.window,
			test.fail,
			{},
			undefined,
			release,
		);
		const callback = () => {};
		const id = timers.methods.setInterval(callback, 5);
		await vi.advanceTimersByTimeAsync(10);
		timers.methods.clearInterval(id);
		expect(release).not.toHaveBeenCalled();
		first.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(release).not.toHaveBeenCalled();
		if (close) {
			timers.close();
			expect(release).toHaveBeenCalledExactlyOnceWith(callback);
		}
		second.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(release).toHaveBeenCalledExactlyOnceWith(callback);
		timers.close();
		test.timers.close();
	},
);

it("keeps due timers queued while a source task is busy and resumes on a later task", async () => {
	const test = fixture();
	let busy = true;
	const runtime = { ...test.runtime, isBusy: () => busy };
	const timers = new PageTimers(runtime, () => test.window, test.fail);
	const calls: string[] = [];
	timers.methods.setTimeout(() => calls.push("first"), 1);
	const canceled = timers.methods.setTimeout(() => calls.push("canceled"), 1);
	timers.methods.setTimeout(() => calls.push("last"), 1);
	await vi.advanceTimersByTimeAsync(10);
	expect(calls).toEqual([]);
	expect(timers.metrics()).toMatchObject({
		queued: 3,
		fired: 0,
		pendingCallbacks: 0,
	});
	timers.methods.clearTimeout(canceled);
	timers.wake();
	expect(vi.getTimerCount()).toBe(0);
	busy = false;
	timers.wake();
	timers.wake();
	expect(vi.getTimerCount()).toBe(1);
	expect(calls).toEqual([]);
	await vi.advanceTimersByTimeAsync(0);
	expect(calls).toEqual(["first", "last"]);
	expect(timers.metrics()).toMatchObject({ queued: 0, active: 0, fired: 2 });
	timers.close();
	test.timers.close();
});

it("cancels a deferred dispatch and releases its arguments when closed", async () => {
	const test = fixture();
	let busy = true;
	const release = vi.fn();
	const timers = new PageTimers(
		{ ...test.runtime, isBusy: () => busy },
		() => test.window,
		test.fail,
		{},
		release,
	);
	const argument = {};
	timers.methods.setTimeout(() => undefined, 1, argument);
	await vi.advanceTimersByTimeAsync(1);
	expect(release).not.toHaveBeenCalled();
	busy = false;
	timers.wake();
	timers.close();
	expect(vi.getTimerCount()).toBe(0);
	expect(release).toHaveBeenCalledExactlyOnceWith(argument);
	await vi.advanceTimersByTimeAsync(1);
	expect(test.runtime.startCallback).not.toHaveBeenCalled();
	test.timers.close();
});

it("reserves pending ownership before entering a timer callback", async () => {
	const test = fixture();
	let observed = -1;
	test.methods.setTimeout(() => {
		observed = test.timers.metrics().pendingCallbacks;
	}, 1);
	await vi.advanceTimersByTimeAsync(1);
	expect(observed).toBe(1);
	expect(test.timers.metrics().pendingCallbacks).toBe(0);
	test.timers.close();
});

it.each([false, true])(
	"holds ownership until a delayed prefix settles after result rejection=%s",
	async (rejectResult) => {
		const test = fixture();
		const prefix = deferred();
		const result = deferred();
		vi.mocked(test.runtime.startCallback).mockReturnValue({
			synchronous: prefix.promise,
			result: result.promise,
		});
		test.methods.setTimeout(() => undefined, 1);
		await vi.advanceTimersByTimeAsync(1);
		if (rejectResult) result.reject(new Error("callback failure"));
		else result.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(test.timers.metrics()).toMatchObject({
			pendingCallbacks: 1,
			running: true,
		});
		prefix.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(test.timers.metrics()).toMatchObject({
			pendingCallbacks: 0,
			running: false,
			active: 0,
		});
		test.timers.close();
	},
);

it("revokes pending ownership and alarms when closed during callback startup", async () => {
	const test = fixture();
	const tail = deferred();
	test.methods.setTimeout(() => {
		test.timers.close();
		return tail.promise;
	}, 1);
	test.methods.setTimeout(() => undefined, 50);
	await vi.advanceTimersByTimeAsync(1);
	expect(test.timers.metrics()).toMatchObject({
		closed: true,
		pendingCallbacks: 0,
		running: false,
		active: 0,
		queued: 0,
	});
	expect(vi.getTimerCount()).toBe(0);
	tail.resolve();
	await vi.advanceTimersByTimeAsync(0);
	expect(test.timers.metrics().pendingCallbacks).toBe(0);
});

it.each([false, true])(
	"closes pending prefixes without waiting for tail rejection=%s",
	async (rejectTail) => {
		const test = fixture();
		const prefix = deferred();
		const tail = deferred();
		vi.mocked(test.runtime.startCallback).mockReturnValue({
			synchronous: prefix.promise,
			result: tail.promise,
		});
		test.methods.setInterval(() => undefined, 1);
		test.methods.setTimeout(() => undefined, 1);
		await vi.advanceTimersByTimeAsync(1);
		test.timers.close();
		expect(test.timers.metrics()).toMatchObject({
			closed: true,
			pendingCallbacks: 0,
			running: false,
			active: 0,
			queued: 0,
		});
		prefix.reject(new Error("prefix closed"));
		if (rejectTail) tail.reject(new Error("tail closed"));
		else tail.resolve();
		await vi.advanceTimersByTimeAsync(100);
		expect(test.runtime.startCallback).toHaveBeenCalledTimes(1);
		expect(test.timers.metrics().pendingCallbacks).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("revokes remaining alarms when the runtime closes before a timer fires", async () => {
	const test = fixture();
	test.methods.setTimeout(() => undefined, 1);
	test.methods.setInterval(() => undefined, 100);
	test.runtime.isClosed = () => true;
	await vi.advanceTimersByTimeAsync(1);
	expect(test.timers.metrics()).toMatchObject({
		closed: true,
		active: 0,
		pendingCallbacks: 0,
	});
	expect(test.runtime.startCallback).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("runs timeouts asynchronously with positive IDs, Window this and ordered extra arguments", async () => {
	const test = fixture();
	const calls: unknown[] = [];
	const callback = function (this: unknown, ...args: unknown[]) {
		calls.push({ current: this, args });
	};
	const first = test.methods.setTimeout(callback, 10, "one", 2);
	const second = test.methods.setTimeout(callback, 10, "two");
	expect([first, second]).toEqual([1, 2]);
	expect(calls).toEqual([]);
	await vi.advanceTimersByTimeAsync(9);
	expect(calls).toEqual([]);
	await vi.advanceTimersByTimeAsync(1);
	expect(calls).toEqual([
		{ current: test.window, args: ["one", 2] },
		{ current: test.window, args: ["two"] },
	]);
	expect(test.timers.metrics()).toMatchObject({
		active: 0,
		scheduled: 2,
		fired: 2,
		running: false,
	});
	test.timers.close();
});

it("shares cancellation IDs between timeout and interval and does not reuse cleared IDs", async () => {
	const test = fixture();
	const callback = vi.fn();
	const first = test.methods.setTimeout(callback, 5);
	const second = test.methods.setInterval(callback, 5);
	test.methods.clearInterval(first);
	test.methods.clearTimeout(String(second));
	test.methods.clearTimeout();
	test.methods.clearInterval(9999);
	expect(test.methods.setTimeout(callback, 10)).toBe(3);
	await vi.advanceTimersByTimeAsync(10);
	expect(callback).toHaveBeenCalledTimes(1);
	test.timers.close();
});

it("lets an interval cancel itself and waits only for an async callback's synchronous prefix", async () => {
	const test = fixture();
	let count = 0;
	const interval = test.methods.setInterval(() => {
		count++;
		if (count === 3) test.methods.clearTimeout(interval);
		return new Promise(() => undefined);
	}, 5);
	await vi.advanceTimersByTimeAsync(50);
	expect(count).toBe(3);
	expect(test.timers.metrics().active).toBe(0);
	test.timers.close();
});

it("serializes due callback prefixes and can cancel a queued timer", async () => {
	const test = fixture();
	let release!: () => void;
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	const start = vi.mocked(test.runtime.startCallback);
	start.mockReturnValueOnce({ synchronous: prefix, result: prefix });
	test.methods.setTimeout(() => undefined, 1);
	const canceled = test.methods.setTimeout(() => undefined, 1);
	test.methods.setTimeout(() => undefined, 1);
	await vi.advanceTimersByTimeAsync(1);
	expect(start).toHaveBeenCalledTimes(1);
	expect(test.timers.metrics().queued).toBe(2);
	test.methods.clearTimeout(canceled);
	release();
	await vi.advanceTimersByTimeAsync(0);
	expect(start).toHaveBeenCalledTimes(2);
	expect(test.timers.metrics()).toMatchObject({ queued: 0, active: 0 });
	test.timers.close();
});

it("uses primitive signed-long delay conversion without invoking object coercion", async () => {
	const test = fixture();
	const callback = vi.fn();
	for (const delay of [
		undefined,
		null,
		false,
		"-1",
		Number.NaN,
		Number.POSITIVE_INFINITY,
		2 ** 32,
	])
		test.methods.setTimeout(callback, delay);
	const convert = vi.fn(() => 1);
	for (const delay of [{ valueOf: convert }, Symbol("delay"), 1n])
		expect(() => test.methods.setTimeout(callback, delay)).toThrow("coercion");
	expect(convert).not.toHaveBeenCalled();
	expect(() => test.methods.clearTimeout({ valueOf: convert })).toThrow(
		"coercion",
	);
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledTimes(7);
	test.timers.close();
});

it("applies a four-millisecond floor after deeply nested timers", async () => {
	const test = fixture();
	const times: number[] = [];
	const callback = () => {
		times.push(Date.now());
		if (times.length < 9) test.methods.setTimeout(callback, 0);
	};
	test.methods.setTimeout(callback, 0);
	await vi.advanceTimersByTimeAsync(100);
	expect(times).toHaveLength(9);
	expect(times[6] - times[5]).toBeGreaterThanOrEqual(4);
	expect(times[8] - times[7]).toBeGreaterThanOrEqual(4);
	test.timers.close();
});

it("enforces active, argument and lifetime registration limits before retaining more work", () => {
	const test = fixture({ maxActive: 1, maxScheduled: 2, maxArguments: 1 });
	const callback = () => undefined;
	expect(() => test.methods.setTimeout(callback, 0, 1, 2)).toThrow("limit");
	const first = test.methods.setTimeout(callback, 100);
	expect(() => test.methods.setTimeout(callback, 0)).toThrow("limit");
	test.methods.clearTimeout(first);
	const second = test.methods.setInterval(callback, 100);
	test.methods.clearInterval(second);
	expect(() => test.methods.setTimeout(callback, 0)).toThrow("limit");
	expect(test.timers.metrics()).toMatchObject({ scheduled: 2, active: 0 });
	test.timers.close();
});

it("halts recurring timers at the cumulative callback limit with an explicit failure", async () => {
	const test = fixture({ maxCallbacks: 2 });
	const callback = vi.fn();
	test.methods.setInterval(callback, 1);
	await vi.advanceTimersByTimeAsync(100);
	expect(callback).toHaveBeenCalledTimes(2);
	expect(test.fail).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(test.timers.metrics()).toMatchObject({
		closed: true,
		active: 0,
		fired: 2,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("continues after an ordinary callback rejection but halts on a callback-start failure", async () => {
	const test = fixture();
	const normal = vi.fn();
	test.methods.setTimeout(() => {
		throw new Error("page failure");
	}, 0);
	test.methods.setTimeout(normal, 1);
	await vi.advanceTimersByTimeAsync(1);
	expect(normal).toHaveBeenCalledOnce();
	expect(test.fail).not.toHaveBeenCalled();
	vi.mocked(test.runtime.startCallback).mockImplementationOnce(() => {
		throw new Error("start failed");
	});
	test.methods.setTimeout(normal, 1);
	await vi.advanceTimersByTimeAsync(1);
	expect(test.fail).toHaveBeenCalledExactlyOnceWith();
	expect(test.timers.metrics().closed).toBe(true);
});

it("cancels native handles and releases queued work on close", async () => {
	const test = fixture();
	const callback = vi.fn();
	test.methods.setTimeout(callback, 100);
	test.methods.setInterval(callback, 200);
	test.timers.close();
	test.timers.close();
	await vi.advanceTimersByTimeAsync(300);
	expect(callback).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
	expect(test.timers.metrics()).toMatchObject({
		closed: true,
		active: 0,
		queued: 0,
	});
	expect(() => test.methods.setTimeout(callback)).toThrow("closed");
	expect(() => test.methods.clearTimeout(1)).toThrow("closed");
});

it("rejects string handlers and invalid limits without scheduling native work", () => {
	const test = fixture();
	for (const handler of ["alert(1)", undefined, null, {}])
		expect(() => test.methods.setTimeout(handler)).toThrow("function");
	for (const maxActive of [
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		2049,
	])
		expect(() => fixture({ maxActive })).toThrow("limits");
	expect(test.timers.metrics().scheduled).toBe(0);
	test.timers.close();
});

it("releases retained arguments on cancellation, completion and close", async () => {
	const test = fixture();
	const release = vi.fn();
	const timers = new PageTimers(
		test.runtime,
		() => test.window,
		test.fail,
		{},
		release,
	);
	const canceled = {};
	const completed = {};
	const recurring = {};
	const first = timers.methods.setTimeout(() => undefined, 100, canceled);
	timers.methods.clearTimeout(first);
	expect(release).toHaveBeenCalledWith(canceled);
	timers.methods.setTimeout(() => undefined, 1, completed);
	timers.methods.setInterval(() => undefined, 1, recurring);
	await vi.advanceTimersByTimeAsync(2);
	expect(release).toHaveBeenCalledWith(completed);
	expect(release.mock.calls.some(([value]) => value === recurring)).toBe(false);
	timers.close();
	expect(release).toHaveBeenCalledWith(recurring);
	expect(release).toHaveBeenCalledTimes(3);
	test.timers.close();
});

it("keeps argument references budgeted until a canceled async callback settles", async () => {
	const test = fixture();
	const release = vi.fn();
	let resolve!: () => void;
	const result = new Promise<void>((complete) => {
		resolve = complete;
	});
	vi.mocked(test.runtime.startCallback).mockReturnValue({
		synchronous: Promise.resolve(),
		result,
	});
	const timers = new PageTimers(
		test.runtime,
		() => test.window,
		test.fail,
		{},
		release,
	);
	const argument = {};
	const interval = timers.methods.setInterval(() => undefined, 1, argument);
	await vi.advanceTimersByTimeAsync(1);
	timers.methods.clearInterval(interval);
	expect(timers.metrics().active).toBe(0);
	expect(release).not.toHaveBeenCalled();
	resolve();
	await vi.advanceTimersByTimeAsync(0);
	expect(release).toHaveBeenCalledExactlyOnceWith(argument);
	timers.close();
	test.timers.close();
});

it.each([false, true])(
	"retains canceled arguments until the prefix settles with rejection=%s",
	async (rejectPrefix) => {
		const test = fixture();
		const release = vi.fn();
		const prefix = deferred();
		vi.mocked(test.runtime.startCallback).mockReturnValue({
			synchronous: prefix.promise,
			result: Promise.resolve(),
		});
		const timers = new PageTimers(
			test.runtime,
			() => test.window,
			test.fail,
			{},
			release,
		);
		const argument = {};
		const id = timers.methods.setInterval(() => undefined, 1, argument);
		await vi.advanceTimersByTimeAsync(1);
		timers.methods.clearInterval(id);
		expect(timers.metrics()).toMatchObject({ active: 0, pendingCallbacks: 1 });
		expect(release).not.toHaveBeenCalled();
		if (rejectPrefix) prefix.reject(new Error("prefix failed"));
		else prefix.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(timers.metrics().pendingCallbacks).toBe(0);
		expect(release).toHaveBeenCalledExactlyOnceWith(argument);
		timers.close();
		test.timers.close();
	},
);

it.each([false, true])(
	"counts overlapping interval calls sharing one result until close=%s",
	async (close) => {
		const test = fixture();
		const release = vi.fn();
		const result = deferred();
		vi.mocked(test.runtime.startCallback).mockReturnValue({
			synchronous: Promise.resolve(),
			result: result.promise,
		});
		const timers = new PageTimers(
			test.runtime,
			() => test.window,
			test.fail,
			{},
			release,
		);
		const argument = {};
		const id = timers.methods.setInterval(() => undefined, 1, argument);
		await vi.advanceTimersByTimeAsync(3);
		timers.methods.clearInterval(id);
		expect(timers.metrics()).toMatchObject({ active: 0, pendingCallbacks: 3 });
		expect(release).not.toHaveBeenCalled();
		if (close) {
			timers.close();
			expect(timers.metrics().pendingCallbacks).toBe(0);
			expect(release).toHaveBeenCalledExactlyOnceWith(argument);
		}
		result.resolve();
		await vi.advanceTimersByTimeAsync(0);
		expect(timers.metrics().pendingCallbacks).toBe(0);
		expect(release).toHaveBeenCalledExactlyOnceWith(argument);
		timers.close();
		test.timers.close();
	},
);

it("releases the reserved callback and argument owners after startup failure", async () => {
	const test = fixture();
	const release = vi.fn();
	const timers = new PageTimers(
		test.runtime,
		() => test.window,
		test.fail,
		{},
		release,
	);
	const argument = {};
	let pendingAtEntry = -1;
	vi.mocked(test.runtime.startCallback).mockImplementation(() => {
		pendingAtEntry = timers.metrics().pendingCallbacks;
		throw new Error("startup failure");
	});
	timers.methods.setTimeout(() => undefined, 1, argument);
	await vi.advanceTimersByTimeAsync(1);
	expect(pendingAtEntry).toBe(1);
	expect(timers.metrics()).toMatchObject({
		closed: true,
		active: 0,
		pendingCallbacks: 0,
		running: false,
	});
	expect(release).toHaveBeenCalledExactlyOnceWith(argument);
	expect(test.fail).toHaveBeenCalledOnce();
	test.timers.close();
});
