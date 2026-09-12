import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";

const pacers: OriginRequestPacer[] = [];
const pending: Promise<unknown>[] = [];
const origin = "https://pacing.example";

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
});

afterEach(async () => {
	for (const pacer of pacers.splice(0)) pacer.close();
	await Promise.allSettled(pending.splice(0));
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function fixture(intervalMs = 100) {
	const pacer = new OriginRequestPacer(intervalMs);
	pacers.push(pacer);
	return pacer;
}

function track<Result>(promise: Promise<Result>): Promise<Result> {
	void promise.catch(() => undefined);
	pending.push(promise);
	return promise;
}

function wait(
	pacer: OriginRequestPacer,
	target = origin,
	signal = new AbortController().signal,
) {
	return track(pacer.wait(target, signal));
}

function dispatch<Result>(
	pacer: OriginRequestPacer,
	start: () => Result | PromiseLike<Result>,
	target = origin,
	signal = new AbortController().signal,
) {
	return track(pacer.dispatch(target, signal, start));
}

it("invokes an immediate dispatch synchronously and returns its result", async () => {
	const pacer = fixture();
	const result = { started: true };
	const start = vi.fn(() => result);
	const response = dispatch(pacer, start);
	expect(start).toHaveBeenCalledTimes(1);
	await expect(response).resolves.toBe(result);
	expect(vi.getTimerCount()).toBe(0);
});

it.each([1, 100, 60_000])(
	"dispatches at the exact configured interval %s",
	async (interval) => {
		const pacer = fixture(interval);
		await dispatch(pacer, () => undefined);
		const start = vi.fn(() => performance.now());
		const response = dispatch(pacer, start);
		await vi.advanceTimersByTimeAsync(interval - 1);
		expect(start).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(response).resolves.toBe(interval);
		expect(start).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("starts cooldown after both immediate and queued synchronous startup return", async () => {
	const pacer = fixture();
	const fakeNow = performance.now.bind(performance);
	let delay = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + delay);
	const starts: number[] = [];
	const finishes: number[] = [];
	const launch = (duration: number) =>
		dispatch(pacer, () => {
			starts.push(performance.now());
			delay += duration;
			finishes.push(performance.now());
		});
	await launch(250);
	const second = launch(175);
	const third = launch(0);
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toEqual([0]);
	await vi.advanceTimersByTimeAsync(1);
	await second;
	expect(starts).toEqual([0, 350]);
	expect(finishes).toEqual([250, 525]);
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toHaveLength(2);
	await vi.advanceTimersByTimeAsync(1);
	await third;
	expect(starts).toEqual([0, 350, 625]);
	expect(vi.getTimerCount()).toBe(0);
});

it("shares one FIFO between concurrent dispatches and legacy waits", async () => {
	const pacer = fixture();
	const starts: number[] = [];
	const launch = () => dispatch(pacer, () => starts.push(performance.now()));
	const first = launch();
	const second = launch();
	const legacy = wait(pacer);
	const fourth = launch();
	expect(starts).toEqual([0]);
	await vi.advanceTimersByTimeAsync(100);
	await second;
	expect(starts).toEqual([0, 100]);
	await vi.advanceTimersByTimeAsync(100);
	await legacy;
	expect(starts).toEqual([0, 100]);
	await vi.advanceTimersByTimeAsync(100);
	await Promise.all([first, fourth]);
	expect(starts).toEqual([0, 100, 300]);
});

it("does not retain a grant for an unresolved response or block another origin", async () => {
	const pacer = fixture();
	let complete = () => {};
	const response = new Promise<string>((resolve) => {
		complete = () => resolve("response");
	});
	const received = vi.fn();
	const first = dispatch(pacer, () => response);
	const observed = track(first.then(received));
	try {
		const second = dispatch(pacer, () => performance.now());
		await expect(
			dispatch(pacer, () => performance.now(), "https://other.example"),
		).resolves.toBe(0);
		await vi.advanceTimersByTimeAsync(100);
		await expect(second).resolves.toBe(100);
		expect(received).not.toHaveBeenCalled();
		pacer.close();
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		complete();
	}
	await expect(first).resolves.toBe("response");
	await observed;
});

it.each([false, true])(
	"preserves synchronous startup errors and cooldown with queued=%s",
	async (queued) => {
		const pacer = fixture();
		const fakeNow = performance.now.bind(performance);
		let delay = 0;
		vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + delay);
		if (queued) await wait(pacer);
		const reason = new Error("startup failed");
		const failed = dispatch(pacer, () => {
			delay += 250;
			throw reason;
		});
		const start = vi.fn(() => performance.now());
		const next = dispatch(pacer, start);
		if (queued) await vi.advanceTimersByTimeAsync(100);
		await expect(failed).rejects.toBe(reason);
		await vi.advanceTimersByTimeAsync(99);
		expect(start).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(next).resolves.toBe(queued ? 450 : 350);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("preserves asynchronous response rejection without stopping later starts", async () => {
	const pacer = fixture();
	const reason = new Error("response failed");
	const failed = dispatch(pacer, () => Promise.reject(reason));
	const next = dispatch(pacer, () => performance.now());
	await expect(failed).rejects.toBe(reason);
	await vi.advanceTimersByTimeAsync(100);
	await expect(next).resolves.toBe(100);
});

it("retains an active origin during slow reentrant dispatch and independent startup", async () => {
	const pacer = fixture();
	const fakeNow = performance.now.bind(performance);
	let delay = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + delay);
	const starts: string[] = [];
	const nested: Promise<unknown>[] = [];
	await dispatch(pacer, () => {
		starts.push("outer");
		delay += 250;
		nested.push(
			dispatch(pacer, () => starts.push("other"), "https://other.example"),
			dispatch(pacer, () => starts.push("nested")),
		);
		expect(starts).toEqual(["outer", "other"]);
		expect(vi.getTimerCount()).toBe(0);
	});
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toEqual(["outer", "other"]);
	await vi.advanceTimersByTimeAsync(1);
	await Promise.all(nested);
	expect(starts).toEqual(["outer", "other", "nested"]);
	expect(performance.now()).toBe(350);
});

it("appends reentrant starts behind already queued requests", async () => {
	const pacer = fixture();
	await wait(pacer);
	const starts: string[] = [];
	const nested: Promise<unknown>[] = [];
	const first = dispatch(pacer, () => {
		starts.push("first");
		nested.push(dispatch(pacer, () => starts.push("nested")));
	});
	const second = dispatch(pacer, () => starts.push("second"));
	await vi.advanceTimersByTimeAsync(100);
	await first;
	expect(starts).toEqual(["first"]);
	await vi.advanceTimersByTimeAsync(100);
	await second;
	expect(starts).toEqual(["first", "second"]);
	await vi.advanceTimersByTimeAsync(100);
	await Promise.all(nested);
	expect(starts).toEqual(["first", "second", "nested"]);
});

it("allows reentrant cancellation without starting cancelled work or losing cooldown", async () => {
	const pacer = fixture();
	const controller = new AbortController();
	const start = vi.fn();
	const nested: Promise<unknown>[] = [];
	await dispatch(pacer, () => {
		const cancelled = dispatch(pacer, start, origin, controller.signal);
		nested.push(cancelled);
		controller.abort();
		nested.push(dispatch(pacer, () => performance.now()));
		expect(vi.getTimerCount()).toBe(0);
	});
	await expect(nested[0]).rejects.toMatchObject({ code: "aborted" });
	await vi.advanceTimersByTimeAsync(100);
	await expect(nested[1]).resolves.toBe(100);
	expect(start).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("detaches cancellation ownership before startup aborts its own signal", async () => {
	const pacer = fixture();
	await wait(pacer);
	const controller = new AbortController();
	const remove = vi.spyOn(controller.signal, "removeEventListener");
	const response = dispatch(
		pacer,
		() => {
			controller.abort();
			return "started";
		},
		origin,
		controller.signal,
	);
	const next = dispatch(pacer, () => performance.now());
	await vi.advanceTimersByTimeAsync(100);
	await expect(response).resolves.toBe("started");
	expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
	await vi.advanceTimersByTimeAsync(100);
	await expect(next).resolves.toBe(200);
});

it.each([false, true])(
	"closes reentrantly without new timers or queued callbacks with queued=%s",
	async (queued) => {
		const pacer = fixture();
		if (queued) await wait(pacer);
		const controller = new AbortController();
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		const start = vi.fn();
		const nested: Promise<unknown>[] = [];
		const current = dispatch(pacer, () => {
			nested.push(dispatch(pacer, start, origin, controller.signal));
			pacer.close();
			controller.abort();
			nested.push(dispatch(pacer, start));
			return "started";
		});
		if (queued) await vi.advanceTimersByTimeAsync(100);
		await expect(current).resolves.toBe("started");
		for (const response of nested)
			await expect(response).rejects.toMatchObject({ code: "closed" });
		expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(1000);
		expect(start).not.toHaveBeenCalled();
	},
);

it("rechecks the monotonic deadline when a dispatch timer fires early", async () => {
	const pacer = fixture();
	const fakeNow = performance.now.bind(performance);
	let delay = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + delay);
	await dispatch(pacer, () => undefined);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	delay = -40;
	await vi.advanceTimersByTimeAsync(100);
	expect(start).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(39);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(100);
	expect(vi.getTimerCount()).toBe(0);
});

it("never invokes pre-aborted or cancelled dispatch callbacks", async () => {
	const pacer = fixture();
	const controller = new AbortController();
	const reason = new AgentBrowserError("timeout", "Owned deadline");
	const start = vi.fn();
	controller.abort(reason);
	await expect(dispatch(pacer, start, origin, controller.signal)).rejects.toBe(
		reason,
	);
	await dispatch(pacer, () => undefined);
	const queued = new AbortController();
	const response = dispatch(pacer, start, origin, queued.signal);
	queued.abort(reason);
	await expect(response).rejects.toBe(reason);
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(100);
	expect(start).not.toHaveBeenCalled();
});

it.each([1, 60_000])("accepts the interval boundary %s", async (interval) => {
	await expect(wait(fixture(interval))).resolves.toBeUndefined();
	expect(performance.now()).toBe(0);
});

it.each([
	0,
	-1,
	0.5,
	60_001,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	null,
	undefined,
	"100",
	true,
	{},
])("rejects invalid interval %s", (interval) => {
	expect(() => {
		const pacer = new OriginRequestPacer(interval as number);
		pacers.push(pacer);
	}).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it("grants the first request immediately and subsequent requests in FIFO order", async () => {
	const pacer = fixture();
	const grants: { name: string; time: number }[] = [];
	const record = (name: string) =>
		track(
			wait(pacer).then(() => grants.push({ name, time: performance.now() })),
		);
	await record("first");
	const second = record("second");
	const third = record("third");
	expect(grants).toEqual([{ name: "first", time: 0 }]);
	await vi.advanceTimersByTimeAsync(99);
	expect(grants).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1);
	await second;
	expect(grants).toEqual([
		{ name: "first", time: 0 },
		{ name: "second", time: 100 },
	]);
	await vi.advanceTimersByTimeAsync(99);
	expect(grants).toHaveLength(2);
	await vi.advanceTimersByTimeAsync(1);
	await third;
	expect(grants[2]).toEqual({ name: "third", time: 200 });
});

it("keeps different origins independent", async () => {
	const pacer = fixture();
	await wait(pacer);
	const second = wait(pacer);
	await expect(wait(pacer, "https://other.example")).resolves.toBeUndefined();
	expect(performance.now()).toBe(0);
	await vi.advanceTimersByTimeAsync(100);
	await second;
});

it("starts a new full interval at a delayed grant instead of catching up", async () => {
	const pacer = fixture();
	const fakeNow = performance.now.bind(performance);
	let delay = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + delay);
	await wait(pacer);
	const times: number[] = [];
	const second = track(wait(pacer).then(() => times.push(performance.now())));
	const third = track(wait(pacer).then(() => times.push(performance.now())));
	await vi.advanceTimersByTimeAsync(99);
	delay = 400;
	await vi.advanceTimersByTimeAsync(1);
	await second;
	expect(times).toEqual([500]);
	await vi.advanceTimersByTimeAsync(99);
	expect(times).toEqual([500]);
	await vi.advanceTimersByTimeAsync(1);
	await third;
	expect(times).toEqual([500, 600]);
});

it("removes cancelled head and middle waiters without consuming intervals", async () => {
	const pacer = fixture();
	await wait(pacer);
	const head = new AbortController();
	const middle = new AbortController();
	const cancelledHead = wait(pacer, origin, head.signal);
	const survivor = wait(pacer);
	const cancelledMiddle = wait(pacer, origin, middle.signal);
	const tail = wait(pacer);
	await vi.advanceTimersByTimeAsync(40);
	head.abort();
	middle.abort();
	await expect(cancelledHead).rejects.toMatchObject({ code: "aborted" });
	await expect(cancelledMiddle).rejects.toMatchObject({ code: "aborted" });
	await vi.advanceTimersByTimeAsync(60);
	await survivor;
	expect(performance.now()).toBe(100);
	await vi.advanceTimersByTimeAsync(100);
	await tail;
	expect(performance.now()).toBe(200);
});

it("preserves cooldown when cancellation empties the queue", async () => {
	const pacer = fixture();
	await wait(pacer);
	const controller = new AbortController();
	const cancelled = wait(pacer, origin, controller.signal);
	await vi.advanceTimersByTimeAsync(40);
	controller.abort();
	await expect(cancelled).rejects.toMatchObject({ code: "aborted" });
	const granted = vi.fn();
	const replacement = track(wait(pacer).then(granted));
	await vi.advanceTimersByTimeAsync(59);
	expect(granted).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await replacement;
	expect(granted).toHaveBeenCalledTimes(1);
});

it("preserves AgentBrowserError abort reasons by identity", async () => {
	const pacer = fixture();
	await wait(pacer);
	const controller = new AbortController();
	const reason = new AgentBrowserError("timeout", "Owned deadline");
	const cancelled = wait(pacer, origin, controller.signal);
	controller.abort(reason);
	await expect(cancelled).rejects.toBe(reason);
});

it("normalizes foreign abort reasons and does not reserve a pre-aborted slot", async () => {
	const pacer = fixture();
	const messages: string[] = [];
	for (const reason of [
		new Error("private fixture detail"),
		"other fixture detail",
	]) {
		const controller = new AbortController();
		controller.abort(reason);
		const error = await wait(pacer, origin, controller.signal).catch(
			(error: unknown) => error,
		);
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect(error).toMatchObject({ code: "aborted" });
		messages.push((error as AgentBrowserError).message);
	}
	expect(messages[0]).toBe(messages[1]);
	expect(messages[0]).not.toContain("fixture detail");
	await wait(pacer);
	expect(performance.now()).toBe(0);
});

it("close rejects pending and future work and clears timers idempotently", async () => {
	const pacer = fixture();
	await wait(pacer);
	await wait(pacer, "https://other.example");
	const first = wait(pacer);
	const second = wait(pacer, "https://other.example");
	pacer.close();
	pacer.close();
	await expect(first).rejects.toMatchObject({ code: "closed" });
	await expect(second).rejects.toMatchObject({ code: "closed" });
	await expect(wait(pacer)).rejects.toMatchObject({ code: "closed" });
	await expect(wait(pacer, "https://new.example")).rejects.toMatchObject({
		code: "closed",
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("caps pending waiters at 128 across origins and reuses a cancelled slot", async () => {
	const pacer = fixture();
	const other = "https://other.example";
	await wait(pacer);
	await wait(pacer, other);
	const controller = new AbortController();
	const cancelled = wait(pacer, origin, controller.signal);
	const queued: Promise<void>[] = [];
	for (let index = 0; index < 127; index++) {
		queued.push(wait(pacer, index % 2 ? origin : other));
	}
	await expect(wait(pacer, other)).rejects.toMatchObject({
		code: "resource-limit",
	});
	controller.abort();
	await expect(cancelled).rejects.toMatchObject({ code: "aborted" });
	const replacement = wait(pacer);
	await expect(wait(pacer)).rejects.toMatchObject({ code: "resource-limit" });
	await vi.advanceTimersByTimeAsync(6400);
	await Promise.all([...queued, replacement]);
});

it("retains 256 unexpired origins without evicting cooldowns, then reuses expired entries", async () => {
	const pacer = fixture();
	for (let index = 0; index < 256; index++) {
		await wait(pacer, `https://origin-${index}.example`);
	}
	await expect(wait(pacer, "https://overflow.example")).rejects.toMatchObject({
		code: "resource-limit",
	});
	const granted = vi.fn();
	const existing = track(wait(pacer, "https://origin-0.example").then(granted));
	await vi.advanceTimersByTimeAsync(99);
	expect(granted).not.toHaveBeenCalled();
	await expect(wait(pacer, "https://overflow.example")).rejects.toMatchObject({
		code: "resource-limit",
	});
	await vi.advanceTimersByTimeAsync(1);
	await existing;
	await expect(
		wait(pacer, "https://overflow.example"),
	).resolves.toBeUndefined();
	expect(performance.now()).toBe(100);
	const retained = vi.fn();
	const next = track(wait(pacer, "https://origin-0.example").then(retained));
	await vi.advanceTimersByTimeAsync(99);
	expect(retained).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await next;
});
