import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type PassRunner,
	PassSecretProvider,
	nodeSecretProviderLimits,
} from "./node-secret-providers.js";

const boundary = vi.hoisted(() => ({
	spawn: vi.fn(),
	lstat: vi.fn(() => {
		throw new Error("Synthetic filesystem access forbidden");
	}),
	open: vi.fn(() => {
		throw new Error("Synthetic filesystem access forbidden");
	}),
}));

vi.mock("node:child_process", () => ({ spawn: boundary.spawn }));
vi.mock("node:fs/promises", () => ({
	lstat: boundary.lstat,
	open: boundary.open,
}));

const syntheticPid = process.pid === 424242 ? 424243 : 424242;
const concurrentPid = process.pid === 424244 ? 424245 : 424244;
const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
if (!platformDescriptor) throw new Error("Missing process platform descriptor");
const children: FakeChild[] = [];

class FakeStream extends EventEmitter {
	readonly destroy = vi.fn(() => this);
}

class FakeChild extends EventEmitter {
	pid: unknown = syntheticPid;
	readonly stdout = new FakeStream();
	readonly stderr = new FakeStream();
	readonly kill = vi.fn((_signal: string) => true);
}

function platform(value: string) {
	Object.defineProperty(process, "platform", {
		...platformDescriptor,
		value,
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(process, "kill").mockImplementation(() => true);
	platform("linux");
	boundary.spawn.mockReset().mockImplementation(() => {
		throw new Error("Synthetic subprocess access forbidden");
	});
	boundary.lstat.mockClear();
	boundary.open.mockClear();
});

afterEach(() => {
	try {
		for (const child of children.splice(0)) child.emit("close", null);
		expect(boundary.lstat).not.toHaveBeenCalled();
		expect(boundary.open).not.toHaveBeenCalled();
		for (const [target, signal] of vi.mocked(process.kill).mock.calls) {
			expect([-syntheticPid, -concurrentPid]).toContain(target);
			expect(target).toBeLessThan(-1);
			expect(target).not.toBe(-process.pid);
			expect(signal).toBe("SIGKILL");
		}
	} finally {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		Object.defineProperty(process, "platform", platformDescriptor);
	}
});

function fixture(
	options: { executable?: string; timeoutMs?: number } = {},
	controller = new AbortController(),
) {
	const child = new FakeChild();
	children.push(child);
	boundary.spawn.mockReturnValue(child);
	const provider = new PassSecretProvider(options);
	const outcome = provider.resolve("synthetic/entry", controller.signal).then(
		(value) => ({ value, error: undefined }),
		(error: unknown) => ({ value: undefined, error }),
	);
	return { child, controller, outcome, provider };
}

async function failed(outcome: ReturnType<typeof fixture>["outcome"]) {
	const result = await outcome;
	expect(result.value).toBeUndefined();
	expect(result.error).toBeInstanceOf(Error);
	expect((result.error as Error).message).toBe("Secret operation failed");
	expect((result.error as Error).cause).toBeUndefined();
	expect(String(result.error)).not.toContain("synthetic-private");
}

function wiped(chunk: Uint8Array) {
	expect(chunk.every((byte) => byte === 0)).toBe(true);
}

function terminated(child: FakeChild) {
	expect(process.kill).toHaveBeenCalledExactlyOnceWith(
		-syntheticPid,
		"SIGKILL",
	);
	expect(child.kill).not.toHaveBeenCalled();
	expect(child.stdout.destroy).toHaveBeenCalledTimes(1);
	expect(child.stderr.destroy).toHaveBeenCalledTimes(1);
	const signalOrder = vi.mocked(process.kill).mock.invocationCallOrder[0];
	expect(signalOrder).toBeLessThan(
		child.stdout.destroy.mock.invocationCallOrder[0],
	);
	expect(signalOrder).toBeLessThan(
		child.stderr.destroy.mock.invocationCallOrder[0],
	);
}

it("launches only the exact detached non-shell pass command with extensions disabled", async () => {
	vi.stubEnv("PASSWORD_STORE_ENABLE_EXTENSIONS", "true");
	vi.stubEnv("PASS_RUNNER_SYNTHETIC_ENV", "synthetic-inherited");
	const environment = { ...process.env };
	const { child, outcome } = fixture({ executable: "/synthetic/bin/pass" });
	await Promise.resolve();
	expect(boundary.spawn).toHaveBeenCalledExactlyOnceWith(
		"/synthetic/bin/pass",
		["show", "synthetic/entry"],
		{
			detached: true,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...environment, PASSWORD_STORE_ENABLE_EXTENSIONS: "false" },
		},
	);
	expect(process.env.PASSWORD_STORE_ENABLE_EXTENSIONS).toBe("true");
	const stdout = Buffer.from("synthetic-secret\nsynthetic-metadata");
	const stderr = Buffer.from("synthetic-private-diagnostic");
	child.stdout.emit("data", stdout);
	child.stderr.emit("data", stderr);
	wiped(stdout);
	wiped(stderr);
	child.emit("close", 0);
	await expect(outcome).resolves.toEqual({
		value: "synthetic-secret",
		error: undefined,
	});
	expect(process.kill).not.toHaveBeenCalled();
	expect(child.kill).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("fails closed on Windows before invoking the default runner spawn", async () => {
	platform("win32");
	const { outcome } = fixture();
	await failed(outcome);
	expect(boundary.spawn).not.toHaveBeenCalled();
	expect(process.kill).not.toHaveBeenCalled();
});

it("leaves custom runners available on Windows without any subprocess", async () => {
	platform("win32");
	const runner = vi.fn<PassRunner>(async (_executable, _args, options) => {
		options.stdout(Buffer.from("synthetic-custom\nmetadata"));
		return 0;
	});
	await expect(
		new PassSecretProvider({ runner }).resolve(
			"synthetic/entry",
			new AbortController().signal,
		),
	).resolves.toBe("synthetic-custom");
	expect(runner).toHaveBeenCalledTimes(1);
	expect(boundary.spawn).not.toHaveBeenCalled();
	expect(process.kill).not.toHaveBeenCalled();
});

it.each(["already aborted", "before runner microtask"])(
	"does not spawn when cancellation is %s",
	async (timing) => {
		const controller = new AbortController();
		if (timing === "already aborted") controller.abort("synthetic-private");
		const { outcome } = fixture({}, controller);
		controller.abort("synthetic-private");
		await failed(outcome);
		expect(boundary.spawn).not.toHaveBeenCalled();
		expect(process.kill).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("cancels after spawn, signals once before destroying streams, and rejects without close", async () => {
	const { child, controller, outcome } = fixture();
	await Promise.resolve();
	controller.abort("synthetic-private-abort");
	terminated(child);
	await failed(outcome);
	controller.abort();
	child.emit("error", new Error("synthetic-private-repeat"));
	child.stdout.emit("error", new Error("synthetic-private-repeat"));
	child.stderr.emit("error", new Error("synthetic-private-repeat"));
	terminated(child);
	expect(vi.getTimerCount()).toBe(0);
});

it("handles cancellation inside spawn before the runner subscribes", async () => {
	const { child, controller, outcome } = fixture();
	boundary.spawn.mockImplementation(() => {
		controller.abort("synthetic-private-spawn-race");
		return child;
	});
	await failed(outcome);
	terminated(child);
});

it("times out at the configured deadline without waiting for child close", async () => {
	const { child, outcome } = fixture({ timeoutMs: 7 });
	await Promise.resolve();
	await vi.advanceTimersByTimeAsync(6);
	expect(process.kill).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	await failed(outcome);
	terminated(child);
	await vi.advanceTimersByTimeAsync(100);
	terminated(child);
	expect(vi.getTimerCount()).toBe(0);
});

it.each(["child", "stdout", "stderr"] as const)(
	"scrubs %s errors and repeated events without repeating cleanup",
	async (source) => {
		const { child, controller, outcome } = fixture();
		await Promise.resolve();
		const emitter = source === "child" ? child : child[source];
		const error = new Error("synthetic-private-error", {
			cause: "synthetic-private-cause",
		});
		expect(() => emitter.emit("error", error)).not.toThrow();
		expect(() => emitter.emit("error", error)).not.toThrow();
		controller.abort();
		await failed(outcome);
		terminated(child);
	},
);

it("removes both abort subscriptions at settlement and close", async () => {
	const add = vi.spyOn(AbortSignal.prototype, "addEventListener");
	const remove = vi.spyOn(AbortSignal.prototype, "removeEventListener");
	const { child, controller, outcome } = fixture();
	await Promise.resolve();
	const runnerSubscriptions = add.mock.calls.flatMap((call, index) =>
		call[0] === "abort" && add.mock.contexts[index] !== controller.signal
			? [{ signal: add.mock.contexts[index], listener: call[1] }]
			: [],
	);
	expect(runnerSubscriptions.length).toBeGreaterThanOrEqual(2);
	child.stderr.emit("error", new Error("synthetic-private-error"));
	await failed(outcome);
	child.emit("close", null);
	const removed = remove.mock.calls.map((call, index) => ({
		signal: remove.mock.contexts[index],
		type: call[0],
		listener: call[1],
	}));
	expect(removed.some((entry) => entry.signal === controller.signal)).toBe(
		true,
	);
	expect(
		runnerSubscriptions.some((subscription) =>
			removed.some(
				(entry) =>
					entry.type === "abort" &&
					entry.signal === subscription.signal &&
					entry.listener === subscription.listener,
			),
		),
	).toBe(true);
});

it.each(["stdout", "stderr"] as const)(
	"bounds cumulative %s output, wipes overflow and late chunks, and signals once",
	async (stream) => {
		const { child, outcome } = fixture();
		await Promise.resolve();
		const limit =
			stream === "stdout"
				? nodeSecretProviderLimits.maxStdoutBytes
				: nodeSecretProviderLimits.maxStderrBytes;
		for (const size of [limit - 1, 1]) {
			const chunk = Buffer.alloc(size, 65);
			child[stream].emit("data", chunk);
			wiped(chunk);
			expect(process.kill).not.toHaveBeenCalled();
		}
		const overflow = Buffer.from("x");
		child[stream].emit("data", overflow);
		wiped(overflow);
		await failed(outcome);
		for (const lateStream of [child.stdout, child.stderr]) {
			const late = Buffer.from("synthetic-private-late");
			lateStream.emit("data", late);
			wiped(late);
		}
		child.emit("close", 0);
		terminated(child);
	},
);

it.each([
	undefined,
	null,
	0,
	1,
	-1,
	-syntheticPid,
	process.pid,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	2 ** 31,
	Number.MAX_SAFE_INTEGER,
	Number.MAX_SAFE_INTEGER + 1,
	"424242",
])("falls back to child.kill for inadmissible PID case %#", async (pid) => {
	const { child, controller, outcome } = fixture();
	child.pid = pid;
	await Promise.resolve();
	controller.abort();
	await failed(outcome);
	expect(process.kill).not.toHaveBeenCalled();
	expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
	expect(child.stdout.destroy).toHaveBeenCalledTimes(1);
	expect(child.stderr.destroy).toHaveBeenCalledTimes(1);
});

it("captures the original PID rather than reading a later child PID", async () => {
	const { child, controller, outcome } = fixture();
	await Promise.resolve();
	child.pid = process.pid;
	controller.abort();
	await failed(outcome);
	terminated(child);
});

it("isolates concurrent resolutions and never retargets a mutated PID to the other group", async () => {
	const first = fixture();
	await Promise.resolve();
	const secondChild = new FakeChild();
	secondChild.pid = concurrentPid;
	children.push(secondChild);
	boundary.spawn.mockReturnValue(secondChild);
	const secondController = new AbortController();
	const secondOutcome = first.provider
		.resolve("synthetic/second-entry", secondController.signal)
		.then(
			(value) => ({ value, error: undefined }),
			(error: unknown) => ({ value: undefined, error }),
		);
	await Promise.resolve();
	expect(boundary.spawn).toHaveBeenCalledTimes(2);
	first.child.pid = concurrentPid;
	secondChild.pid = syntheticPid;
	first.controller.abort();
	await failed(first.outcome);
	terminated(first.child);
	expect(secondChild.kill).not.toHaveBeenCalled();
	expect(secondChild.stdout.destroy).not.toHaveBeenCalled();
	expect(secondChild.stderr.destroy).not.toHaveBeenCalled();
	secondChild.stdout.emit("data", Buffer.from("synthetic-second-secret\n"));
	secondChild.emit("close", 0);
	await expect(secondOutcome).resolves.toEqual({
		value: "synthetic-second-secret",
		error: undefined,
	});
	secondController.abort();
	terminated(first.child);
	expect(secondChild.kill).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it("signals each concurrent cancellation only through its own captured process group", async () => {
	const first = fixture();
	await Promise.resolve();
	const second = fixture();
	second.child.pid = concurrentPid;
	await Promise.resolve();
	second.controller.abort();
	await failed(second.outcome);
	expect(process.kill).toHaveBeenCalledExactlyOnceWith(
		-concurrentPid,
		"SIGKILL",
	);
	expect(first.child.stdout.destroy).not.toHaveBeenCalled();
	expect(first.child.stderr.destroy).not.toHaveBeenCalled();
	first.controller.abort();
	await failed(first.outcome);
	expect(vi.mocked(process.kill).mock.calls).toEqual([
		[-concurrentPid, "SIGKILL"],
		[-syntheticPid, "SIGKILL"],
	]);
	for (const child of [first.child, second.child]) {
		expect(child.kill).not.toHaveBeenCalled();
		expect(child.stdout.destroy).toHaveBeenCalledTimes(1);
		expect(child.stderr.destroy).toHaveBeenCalledTimes(1);
	}
});

it.each([false, true])(
	"falls back after group signal failure and contains cleanup errors (throwing: %s)",
	async (throwing) => {
		const { child, controller, outcome } = fixture();
		const error = new Error("synthetic-private-cleanup");
		vi.mocked(process.kill).mockImplementation(() => {
			throw error;
		});
		child.kill.mockImplementation(() => {
			if (throwing) throw error;
			return false;
		});
		if (throwing) {
			child.stdout.destroy.mockImplementation(() => {
				throw error;
			});
			child.stderr.destroy.mockImplementation(() => {
				throw error;
			});
		}
		await Promise.resolve();
		expect(() => controller.abort()).not.toThrow();
		await failed(outcome);
		expect(process.kill).toHaveBeenCalledExactlyOnceWith(
			-syntheticPid,
			"SIGKILL",
		);
		expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
		expect(child.stdout.destroy).toHaveBeenCalledTimes(1);
		expect(child.stderr.destroy).toHaveBeenCalledTimes(1);
		expect(child.kill.mock.invocationCallOrder[0]).toBeLessThan(
			child.stdout.destroy.mock.invocationCallOrder[0],
		);
		expect(child.kill.mock.invocationCallOrder[0]).toBeLessThan(
			child.stderr.destroy.mock.invocationCallOrder[0],
		);
	},
);

it("does not send stale signals after close, even through captured late callbacks", async () => {
	const { child, controller, outcome } = fixture();
	await Promise.resolve();
	const errors = [child, child.stdout, child.stderr].flatMap((emitter) =>
		emitter.listeners("error"),
	);
	const stdout = child.stdout.listeners("data");
	const stderr = child.stderr.listeners("data");
	child.stdout.emit("data", Buffer.from("synthetic-secret\n"));
	child.emit("close", 0);
	for (const callback of errors) {
		expect(() => callback(new Error("synthetic-private-late"))).not.toThrow();
	}
	for (const callback of [...stdout, ...stderr]) {
		const late = Buffer.from("synthetic-private-late");
		expect(() => callback(late)).not.toThrow();
		wiped(late);
	}
	await expect(outcome).resolves.toEqual({
		value: "synthetic-secret",
		error: undefined,
	});
	controller.abort();
	await vi.advanceTimersByTimeAsync(nodeSecretProviderLimits.defaultTimeoutMs);
	expect(process.kill).not.toHaveBeenCalled();
	expect(child.kill).not.toHaveBeenCalled();
});

it.each([1, 127, null])(
	"scrubs unsuccessful close code %s without stale kills",
	async (code) => {
		const { child, controller, outcome } = fixture();
		await Promise.resolve();
		child.stdout.emit("data", Buffer.from("synthetic-private-secret\n"));
		child.stderr.emit("data", Buffer.from("synthetic-private-error"));
		child.emit("close", code);
		await failed(outcome);
		controller.abort();
		expect(process.kill).not.toHaveBeenCalled();
		expect(child.kill).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("scrubs spawn exceptions and releases the timeout without signaling", async () => {
	const { child, outcome } = fixture();
	boundary.spawn.mockImplementation(() => {
		throw new Error("synthetic-private-spawn", {
			cause: "synthetic-private-cause",
		});
	});
	await failed(outcome);
	expect(process.kill).not.toHaveBeenCalled();
	expect(child.kill).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});

it.each([
	["é-synthetic\r\nsynthetic-metadata", "é-synthetic"],
	["synthetic-no-newline", "synthetic-no-newline"],
])("decodes a byte-split first line for %s", async (text, expected) => {
	const { child, outcome } = fixture();
	await Promise.resolve();
	for (const byte of Buffer.from(text)) {
		const chunk = Buffer.from([byte]);
		child.stdout.emit("data", chunk);
		wiped(chunk);
	}
	child.emit("close", 0);
	await expect(outcome).resolves.toEqual({ value: expected, error: undefined });
	expect(process.kill).not.toHaveBeenCalled();
});

it.each([
	Buffer.from([0xc3, 0x28, 10]),
	Buffer.from("\r\nsynthetic-metadata"),
	Buffer.from("synthetic\0secret\n"),
])(
	"rejects invalid first-line bytes case %# without signaling a closed child",
	async (chunk) => {
		const { child, outcome } = fixture();
		await Promise.resolve();
		child.stdout.emit("data", chunk);
		wiped(chunk);
		child.emit("close", 0);
		await failed(outcome);
		expect(process.kill).not.toHaveBeenCalled();
		expect(child.kill).not.toHaveBeenCalled();
	},
);
