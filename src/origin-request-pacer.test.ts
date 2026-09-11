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
