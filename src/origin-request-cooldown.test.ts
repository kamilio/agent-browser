import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";

const pacers: OriginRequestPacer[] = [];
const pending: Promise<unknown>[] = [];
const origin = "https://cooldown.example";
const other = "https://other.example";

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
	});
});

afterEach(async () => {
	try {
		for (const pacer of pacers.splice(0)) pacer.close();
		await Promise.allSettled(pending.splice(0));
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.clearAllTimers();
		vi.restoreAllMocks();
		vi.useRealTimers();
	}
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

it.each([1, 250, 86_400_000])(
	"defers a new origin until the exact accepted delay %s",
	async (delayMs) => {
		const pacer = fixture();
		expect(pacer.defer(origin, delayMs)).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
		const start = vi.fn(() => performance.now());
		const response = dispatch(pacer, start);
		await vi.advanceTimersByTimeAsync(delayMs - 1);
		expect(start).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(response).resolves.toBe(delayMs);
		expect(start).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("rejects invalid delays without changing an existing queued cooldown", async () => {
	const pacer = fixture();
	pacer.defer(origin, 300);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	for (const delayMs of [
		-1,
		0.5,
		86_400_001,
		Number.MAX_SAFE_INTEGER + 1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		null,
		undefined,
		"100",
		true,
		{},
	]) {
		expect(() => pacer.defer(origin, delayMs as number)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	}
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(299);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(300);
});

it("treats zero and negative zero on new origins as no-ops without exhausting capacity", async () => {
	const pacer = fixture();
	for (let index = 0; index < 300; index++) {
		expect(
			pacer.defer(`https://zero-${index}.example`, index % 2 ? 0 : -0),
		).toBeUndefined();
	}
	expect(vi.getTimerCount()).toBe(0);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	expect(start).toHaveBeenCalledTimes(1);
	await expect(response).resolves.toBe(0);
});

it("does not shorten the configured minimum with zero deferral", async () => {
	const pacer = fixture();
	await wait(pacer);
	await vi.advanceTimersByTimeAsync(40);
	pacer.defer(origin, 0);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(59);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(100);
});

it("does not shorten a pending server cooldown with zero deferral", async () => {
	const pacer = fixture();
	pacer.defer(origin, 300);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(100);
	pacer.defer(origin, 0);
	await vi.advanceTimersByTimeAsync(199);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(300);
});

it("throws closed for every valid delay including zero after close", () => {
	const pacer = fixture();
	pacer.close();
	for (const delayMs of [0, 1, 86_400_000]) {
		expect(() => pacer.defer(origin, delayMs)).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
	}
	expect(vi.getTimerCount()).toBe(0);
});

it("extends an existing idle origin without scheduling an idle timer", async () => {
	const pacer = fixture();
	await wait(pacer);
	pacer.defer(origin, 300);
	expect(vi.getTimerCount()).toBe(0);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(299);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(300);
});

it("measures each deferral from the current monotonic time", async () => {
	const pacer = fixture();
	await vi.advanceTimersByTimeAsync(700);
	pacer.defer(origin, 250);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(249);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(950);
});

it("keeps a longer configured minimum when a positive deferral is shorter", async () => {
	const pacer = fixture(1000);
	await wait(pacer);
	await vi.advanceTimersByTimeAsync(100);
	pacer.defer(origin, 200);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(899);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(1000);
});

it("never replaces an existing server deadline with a shorter deadline", async () => {
	const pacer = fixture();
	pacer.defer(origin, 500);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(100);
	pacer.defer(origin, 200);
	await vi.advanceTimersByTimeAsync(399);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(500);
});

it("rearms an already queued minimum-interval timer for a longer cooldown", async () => {
	const pacer = fixture();
	await wait(pacer);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(40);
	pacer.defer(origin, 300);
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(60);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(239);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(340);
});

it("repeated extensions retain only one timer and start exactly once", async () => {
	const pacer = fixture();
	pacer.defer(origin, 100);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	for (let index = 0; index < 5; index++) {
		await vi.advanceTimersByTimeAsync(20);
		pacer.defer(origin, 200);
		expect(vi.getTimerCount()).toBe(1);
		expect(start).not.toHaveBeenCalled();
	}
	await vi.advanceTimersByTimeAsync(199);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(300);
	await vi.advanceTimersByTimeAsync(1000);
	expect(start).toHaveBeenCalledTimes(1);
});

it("preserves FIFO across dispatches and waits without a cooldown-expiry burst", async () => {
	const pacer = fixture();
	pacer.defer(origin, 300);
	const starts: number[] = [];
	const first = dispatch(pacer, () => starts.push(performance.now()));
	const legacy = wait(pacer);
	const third = dispatch(pacer, () => starts.push(performance.now()));
	await vi.advanceTimersByTimeAsync(100);
	pacer.defer(origin, 400);
	await vi.advanceTimersByTimeAsync(399);
	expect(starts).toEqual([]);
	await vi.advanceTimersByTimeAsync(1);
	await first;
	expect(starts).toEqual([500]);
	await vi.advanceTimersByTimeAsync(100);
	await legacy;
	expect(starts).toEqual([500]);
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toEqual([500]);
	await vi.advanceTimersByTimeAsync(1);
	await third;
	expect(starts).toEqual([500, 700]);
});

it("starts a full minimum interval after a late cooldown grant without catching up", async () => {
	const pacer = fixture();
	const fakeNow = performance.now.bind(performance);
	let offset = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + offset);
	pacer.defer(origin, 300);
	const starts: number[] = [];
	const first = dispatch(pacer, () => starts.push(performance.now()));
	const second = dispatch(pacer, () => starts.push(performance.now()));
	await vi.advanceTimersByTimeAsync(299);
	offset = 500;
	await vi.advanceTimersByTimeAsync(1);
	await first;
	expect(starts).toEqual([800]);
	await vi.advanceTimersByTimeAsync(99);
	expect(starts).toEqual([800]);
	await vi.advanceTimersByTimeAsync(1);
	await second;
	expect(starts).toEqual([800, 900]);
});

it("renews an expired idle cooldown from now rather than its former deadline", async () => {
	const pacer = fixture();
	pacer.defer(origin, 100);
	await vi.advanceTimersByTimeAsync(150);
	pacer.defer(origin, 200);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(199);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(350);
});

it("recreates an origin after another request reclaims its expired idle state", async () => {
	const pacer = fixture();
	await wait(pacer);
	await vi.advanceTimersByTimeAsync(100);
	await wait(pacer, other);
	pacer.defer(origin, 250);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(249);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(350);
});

it.each([false, true])(
	"preserves synchronous startup deferral through interval update with queued=%s",
	async (queued) => {
		const pacer = fixture();
		if (queued) await wait(pacer);
		const current = dispatch(pacer, () => {
			pacer.defer(origin, 500);
			return "started";
		});
		const start = vi.fn(() => performance.now());
		const next = dispatch(pacer, start);
		if (queued) await vi.advanceTimersByTimeAsync(100);
		await expect(current).resolves.toBe("started");
		await vi.advanceTimersByTimeAsync(499);
		expect(start).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(next).resolves.toBe(queued ? 600 : 500);
	},
);

it.each([false, true])(
	"lets the later post-startup minimum beat an earlier deferral with queued=%s",
	async (queued) => {
		const pacer = fixture();
		const fakeNow = performance.now.bind(performance);
		let offset = 0;
		vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + offset);
		if (queued) await wait(pacer);
		const current = dispatch(pacer, () => {
			pacer.defer(origin, 200);
			offset += 250;
		});
		const start = vi.fn(() => performance.now());
		const next = dispatch(pacer, start);
		if (queued) await vi.advanceTimersByTimeAsync(100);
		await current;
		await vi.advanceTimersByTimeAsync(99);
		expect(start).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(next).resolves.toBe(queued ? 450 : 350);
	},
);

it.each([false, true])(
	"preserves startup errors and their synchronous deferral with queued=%s",
	async (queued) => {
		const pacer = fixture();
		if (queued) await wait(pacer);
		const reason = new Error("startup failed");
		const failed = dispatch(pacer, () => {
			pacer.defer(origin, 300);
			throw reason;
		});
		const start = vi.fn(() => performance.now());
		const next = dispatch(pacer, start);
		if (queued) await vi.advanceTimersByTimeAsync(100);
		await expect(failed).rejects.toBe(reason);
		await vi.advanceTimersByTimeAsync(299);
		expect(start).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(next).resolves.toBe(queued ? 400 : 300);
	},
);

it("keeps a reentrant dispatch behind existing queued work after startup deferral", async () => {
	const pacer = fixture();
	await wait(pacer);
	const starts: string[] = [];
	const nested: Promise<unknown>[] = [];
	const first = dispatch(pacer, () => {
		starts.push("first");
		pacer.defer(origin, 300);
		nested.push(dispatch(pacer, () => starts.push("nested")));
	});
	const second = dispatch(pacer, () => starts.push("second"));
	await vi.advanceTimersByTimeAsync(100);
	await first;
	expect(starts).toEqual(["first"]);
	await vi.advanceTimersByTimeAsync(299);
	expect(starts).toEqual(["first"]);
	await vi.advanceTimersByTimeAsync(1);
	await second;
	expect(starts).toEqual(["first", "second"]);
	await vi.advanceTimersByTimeAsync(100);
	await Promise.all(nested);
	expect(starts).toEqual(["first", "second", "nested"]);
});

it("keeps another origin's startup and minimum independent of a long cooldown", async () => {
	const pacer = fixture();
	pacer.defer(origin, 500);
	const delayedStart = vi.fn(() => performance.now());
	const delayed = dispatch(pacer, delayedStart);
	await expect(dispatch(pacer, () => performance.now(), other)).resolves.toBe(
		0,
	);
	const independent = dispatch(pacer, () => performance.now(), other);
	await vi.advanceTimersByTimeAsync(100);
	await expect(independent).resolves.toBe(100);
	pacer.defer(origin, 500);
	await vi.advanceTimersByTimeAsync(499);
	expect(delayedStart).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(delayed).resolves.toBe(600);
});

it.each([-86_400_000, 86_400_000])(
	"keeps deferral monotonic across a wall-clock change of %s milliseconds",
	async (wallClockShift) => {
		const pacer = fixture();
		pacer.defer(origin, 300);
		const start = vi.fn(() => performance.now());
		const response = dispatch(pacer, start);
		await vi.advanceTimersByTimeAsync(100);
		vi.setSystemTime(Date.now() + wallClockShift);
		expect(performance.now()).toBe(100);
		pacer.defer(origin, 300);
		await vi.advanceTimersByTimeAsync(299);
		expect(start).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(response).resolves.toBe(400);
	},
);

it("rechecks a cooldown deadline when its timer fires before monotonic expiry", async () => {
	const pacer = fixture();
	const fakeNow = performance.now.bind(performance);
	let offset = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + offset);
	pacer.defer(origin, 300);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	offset = -40;
	await vi.advanceTimersByTimeAsync(300);
	expect(start).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(39);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(300);
});

it("removes aborted head and middle entries without consuming cooldown grants", async () => {
	const pacer = fixture();
	pacer.defer(origin, 300);
	const head = new AbortController();
	const middle = new AbortController();
	const cancelledStart = vi.fn();
	const cancelledHead = dispatch(pacer, cancelledStart, origin, head.signal);
	const first = dispatch(pacer, () => performance.now());
	const cancelledMiddle = dispatch(
		pacer,
		cancelledStart,
		origin,
		middle.signal,
	);
	const second = dispatch(pacer, () => performance.now());
	await vi.advanceTimersByTimeAsync(100);
	head.abort();
	middle.abort();
	await expect(cancelledHead).rejects.toMatchObject({ code: "aborted" });
	await expect(cancelledMiddle).rejects.toMatchObject({ code: "aborted" });
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(200);
	await expect(first).resolves.toBe(300);
	await vi.advanceTimersByTimeAsync(100);
	await expect(second).resolves.toBe(400);
	expect(cancelledStart).not.toHaveBeenCalled();
});

it("clears the last cancelled timer without forgetting the server cooldown", async () => {
	const pacer = fixture();
	pacer.defer(origin, 500);
	const controller = new AbortController();
	const remove = vi.spyOn(controller.signal, "removeEventListener");
	const cancelled = wait(pacer, origin, controller.signal);
	await vi.advanceTimersByTimeAsync(100);
	controller.abort();
	await expect(cancelled).rejects.toMatchObject({ code: "aborted" });
	expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
	expect(vi.getTimerCount()).toBe(0);
	const start = vi.fn(() => performance.now());
	const replacement = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(399);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(replacement).resolves.toBe(500);
});

it("preserves a caller deadline reason and leaves a later waiter deferred", async () => {
	const pacer = fixture();
	pacer.defer(origin, 500);
	const controller = new AbortController();
	const reason = new AgentBrowserError("timeout", "Owned caller deadline");
	const expiredStart = vi.fn();
	const expired = dispatch(pacer, expiredStart, origin, controller.signal);
	const survivorStart = vi.fn(() => performance.now());
	const survivor = dispatch(pacer, survivorStart);
	const timer = setTimeout(() => controller.abort(reason), 200);
	try {
		await vi.advanceTimersByTimeAsync(200);
		await expect(expired).rejects.toBe(reason);
		await vi.advanceTimersByTimeAsync(299);
		expect(survivorStart).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(survivor).resolves.toBe(500);
		expect(expiredStart).not.toHaveBeenCalled();
	} finally {
		clearTimeout(timer);
	}
});

it("rejects pre-aborted dispatch without allocating a timer or changing cooldown", async () => {
	const pacer = fixture();
	pacer.defer(origin, 300);
	const controller = new AbortController();
	controller.abort(new Error("foreign reason"));
	const cancelledStart = vi.fn();
	await expect(
		dispatch(pacer, cancelledStart, origin, controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	expect(vi.getTimerCount()).toBe(0);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start);
	await vi.advanceTimersByTimeAsync(299);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(300);
	expect(cancelledStart).not.toHaveBeenCalled();
});

it("close rejects deferred work across origins and removes timers and listeners", async () => {
	const pacer = fixture();
	pacer.defer(origin, 300);
	pacer.defer(other, 500);
	const controller = new AbortController();
	const remove = vi.spyOn(controller.signal, "removeEventListener");
	const start = vi.fn();
	const first = dispatch(pacer, start, origin, controller.signal);
	const second = dispatch(pacer, start, other);
	expect(vi.getTimerCount()).toBe(2);
	pacer.close();
	pacer.close();
	await expect(first).rejects.toMatchObject({ code: "closed" });
	await expect(second).rejects.toMatchObject({ code: "closed" });
	await expect(wait(pacer)).rejects.toMatchObject({ code: "closed" });
	expect(() => pacer.defer(origin, 100)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
	expect(vi.getTimerCount()).toBe(0);
	controller.abort();
	await vi.advanceTimersByTimeAsync(1000);
	expect(start).not.toHaveBeenCalled();
});

it("does not recall an in-flight result when a later cooldown or close occurs", async () => {
	const pacer = fixture();
	let complete = () => {};
	const result = new Promise<string>((resolve) => {
		complete = () => resolve("response");
	});
	const first = dispatch(pacer, () => result);
	const received = vi.fn();
	const observed = track(first.then(received));
	try {
		pacer.defer(origin, 300);
		const start = vi.fn(() => performance.now());
		const second = dispatch(pacer, start);
		await vi.advanceTimersByTimeAsync(299);
		expect(start).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await expect(second).resolves.toBe(300);
		expect(received).not.toHaveBeenCalled();
		pacer.close();
	} finally {
		complete();
	}
	await expect(first).resolves.toBe("response");
	await observed;
});

it("caps unexpired cooldown origins at 256 without eviction or blocking updates", async () => {
	const pacer = fixture();
	for (let index = 0; index < 256; index++) {
		pacer.defer(`https://origin-${index}.example`, 500);
	}
	expect(() => pacer.defer(origin, 500)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	await expect(wait(pacer, origin)).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(() => pacer.defer(origin, 0)).not.toThrow();
	expect(vi.getTimerCount()).toBe(0);
	const retained = "https://origin-0.example";
	pacer.defer(retained, 700);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start, retained);
	await vi.advanceTimersByTimeAsync(699);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(700);
});

it("reclaims expired idle cooldowns at the exact boundary without evicting live ones", async () => {
	const pacer = fixture();
	pacer.defer(origin, 100);
	for (let index = 0; index < 255; index++) {
		pacer.defer(`https://retained-${index}.example`, 1000);
	}
	await vi.advanceTimersByTimeAsync(99);
	expect(() => pacer.defer(other, 200)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	await vi.advanceTimersByTimeAsync(1);
	expect(() => pacer.defer(other, 200)).not.toThrow();
	expect(() => pacer.defer(origin, 200)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const start = vi.fn(() => performance.now());
	const response = dispatch(pacer, start, other);
	await vi.advanceTimersByTimeAsync(199);
	expect(start).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(response).resolves.toBe(300);
	const retainedStart = vi.fn(() => performance.now());
	const retained = dispatch(pacer, retainedStart, "https://retained-0.example");
	await vi.advanceTimersByTimeAsync(699);
	expect(retainedStart).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await expect(retained).resolves.toBe(1000);
});

it("caps deferred pending grants at 128 globally and reuses an aborted slot", async () => {
	const pacer = fixture();
	pacer.defer(origin, 500);
	pacer.defer(other, 500);
	const controller = new AbortController();
	const cancelled = wait(pacer, origin, controller.signal);
	const queued: Promise<void>[] = [];
	for (let index = 0; index < 127; index++) {
		queued.push(wait(pacer, index % 2 ? origin : other));
	}
	await expect(wait(pacer, other)).rejects.toMatchObject({
		code: "resource-limit",
	});
	pacer.defer(origin, 600);
	pacer.defer("https://idle.example", 1000);
	await expect(
		wait(pacer, "https://independent.example"),
	).resolves.toBeUndefined();
	controller.abort();
	await expect(cancelled).rejects.toMatchObject({ code: "aborted" });
	const replacement = wait(pacer);
	await expect(wait(pacer)).rejects.toMatchObject({ code: "resource-limit" });
	await vi.advanceTimersByTimeAsync(6900);
	await Promise.all([...queued, replacement]);
});

it("releases one pending slot per grant without bursting the full deferred queue", async () => {
	const pacer = fixture();
	pacer.defer(origin, 300);
	const start = vi.fn(() => performance.now());
	const queued: Promise<number>[] = [];
	for (let index = 0; index < 128; index++) {
		queued.push(dispatch(pacer, start));
	}
	await expect(wait(pacer)).rejects.toMatchObject({ code: "resource-limit" });
	await vi.advanceTimersByTimeAsync(300);
	expect(start).toHaveBeenCalledTimes(1);
	const replacement = dispatch(pacer, start);
	await expect(wait(pacer)).rejects.toMatchObject({ code: "resource-limit" });
	await vi.advanceTimersByTimeAsync(99);
	expect(start).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	expect(start).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(12_700);
	await Promise.all(queued);
	await expect(replacement).resolves.toBe(13_100);
	expect(start).toHaveBeenCalledTimes(129);
});

it("never reclaims an active or pending origin whose deadline elapsed during startup", async () => {
	const pacer = fixture();
	const fakeNow = performance.now.bind(performance);
	let offset = 0;
	vi.spyOn(performance, "now").mockImplementation(() => fakeNow() + offset);
	pacer.defer(other, 100);
	const otherStart = vi.fn(() => performance.now());
	const otherResponse = dispatch(pacer, otherStart, other);
	for (let index = 0; index < 254; index++) {
		pacer.defer(`https://retained-${index}.example`, 1000);
	}
	const nested: Promise<unknown>[] = [];
	await dispatch(pacer, () => {
		offset = 250;
		expect(() => pacer.defer("https://overflow.example", 100)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		pacer.defer(origin, 300);
		nested.push(dispatch(pacer, () => performance.now()));
		expect(otherStart).not.toHaveBeenCalled();
	});
	await vi.advanceTimersByTimeAsync(100);
	await expect(otherResponse).resolves.toBe(350);
	await vi.advanceTimersByTimeAsync(199);
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(1);
	await expect(nested[0]).resolves.toBe(550);
});
