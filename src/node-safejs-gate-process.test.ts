import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter, getEventListeners } from "node:events";
import { closeSync, constants, openSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeJsGateProcess } from "../scripts/run-safejs-gate.js";
import {
	launchNodeSafeJsGateProcess,
	type NodeSafeJsGateCommand,
} from "./node-safejs-gate-process.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs", () => ({
	constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128, O_NOFOLLOW: 131072 },
	openSync: vi.fn(),
	closeSync: vi.fn(),
}));

class FakeChild extends EventEmitter {
	pid: number | undefined = 4200;

	finish(code: number | null = 0, signal: NodeJS.Signals | null = null) {
		this.emit("exit", code, signal);
		this.emit("close", code, signal);
	}
}

const command: NodeSafeJsGateCommand = {
	command: "/owned/pinned-node",
	args: ["--max-old-space-size=384", "/owned/input.mjs"],
	cwd: "/owned/work",
	env: { HOME: "/owned/home", TMPDIR: "/owned/tmp" },
	stdoutFile: "/owned/stdout",
	stderrFile: "/owned/stderr",
};

function signal() {
	return new AbortController().signal;
}

function systemError(code: string) {
	return Object.assign(new Error(code), { code });
}

function fixture() {
	const child = new FakeChild();
	vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
	let owned: SafeJsGateProcess | undefined;
	const register = vi.fn((handle: SafeJsGateProcess): undefined => {
		owned = handle;
		return undefined;
	});
	return {
		child,
		register,
		start: () => launchNodeSafeJsGateProcess(command, register),
		get owned() {
			if (!owned) throw new Error("Fixture was not registered");
			return owned;
		},
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(spawn).mockReset();
	vi.mocked(openSync)
		.mockReset()
		.mockReturnValueOnce(30)
		.mockReturnValueOnce(31);
	vi.mocked(closeSync).mockReset();
	vi.spyOn(process, "kill").mockReturnValue(true);
});

afterEach(() => {
	expect(vi.getTimerCount()).toBe(0);
	vi.clearAllTimers();
	vi.restoreAllMocks();
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

describe("native SafeJS gate process ownership", () => {
	it("registers before one detached spawn with exact isolated argv, env and files", async () => {
		const test = fixture();
		vi.stubEnv("SAFEJS_PARENT_ONLY", "not-for-the-child");
		test.start();
		expect(test.register).toHaveBeenCalledOnce();
		expect(test.register.mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(spawn).mock.invocationCallOrder[0],
		);
		expect(spawn).toHaveBeenCalledExactlyOnceWith(
			command.command,
			command.args,
			{
				cwd: command.cwd,
				env: command.env,
				detached: true,
				shell: false,
				stdio: ["ignore", 30, 31],
			},
		);
		const options = vi.mocked(spawn).mock.calls[0][2];
		expect(options?.env).not.toBe(command.env);
		expect(Object.getPrototypeOf(options?.env)).toBeNull();
		expect(options?.env).not.toHaveProperty("SAFEJS_PARENT_ONLY");
		expect(options).not.toHaveProperty("signal");
		expect(vi.mocked(spawn).mock.calls[0][1]).not.toBe(command.args);
		const flags =
			constants.O_WRONLY |
			constants.O_CREAT |
			constants.O_EXCL |
			constants.O_NOFOLLOW;
		expect(openSync).toHaveBeenNthCalledWith(
			1,
			command.stdoutFile,
			flags,
			0o600,
		);
		expect(openSync).toHaveBeenNthCalledWith(
			2,
			command.stderrFile,
			flags,
			0o600,
		);
		expect(vi.mocked(closeSync).mock.calls).toEqual([[30], [31]]);
		test.child.finish();
		await expect(test.owned.wait(signal())).resolves.toBe(0);
		await expect(test.owned.reap(signal())).resolves.toBeUndefined();
		expect(process.kill).not.toHaveBeenCalled();
	});

	it("excludes inherited environment properties", () => {
		const test = fixture();
		const env = Object.assign(Object.create({ INHERITED: "not-approved" }), {
			EXPLICIT: "approved",
		});
		launchNodeSafeJsGateProcess({ ...command, env }, test.register);
		expect(vi.mocked(spawn).mock.calls[0][2]?.env).toEqual({
			EXPLICIT: "approved",
		});
		test.child.finish();
	});

	it.each([1, 2])(
		"closes all acquired FDs when output open %i fails",
		(index) => {
			const test = fixture();
			const failure = systemError("EEXIST");
			vi.mocked(openSync).mockReset();
			if (index === 2) vi.mocked(openSync).mockReturnValueOnce(30);
			vi.mocked(openSync).mockImplementationOnce(() => {
				throw failure;
			});
			expect(test.start).toThrow(failure);
			expect(vi.mocked(closeSync).mock.calls).toEqual(
				index === 1 ? [] : [[30]],
			);
			expect(test.register).not.toHaveBeenCalled();
			expect(spawn).not.toHaveBeenCalled();
			expect(process.kill).not.toHaveBeenCalled();
		},
	);

	it("does not create an unowned child when registration throws", () => {
		const test = fixture();
		const failure = new Error("registration failed");
		test.register.mockImplementation(() => {
			throw failure;
		});
		expect(test.start).toThrow(failure);
		expect(spawn).not.toHaveBeenCalled();
		expect(vi.mocked(closeSync).mock.calls).toEqual([[30], [31]]);
		expect(process.kill).not.toHaveBeenCalled();
	});

	it("does not spawn when registration returns a non-undefined value", () => {
		const test = fixture();
		test.register.mockReturnValue(true as unknown as undefined);
		expect(test.start).toThrow("registration must return undefined");
		expect(spawn).not.toHaveBeenCalled();
		expect(vi.mocked(closeSync).mock.calls).toEqual([[30], [31]]);
	});

	it("settles a registered handle after synchronous spawn failure without signals", async () => {
		const test = fixture();
		const failure = new Error("spawn threw");
		vi.mocked(spawn).mockImplementation(() => {
			throw failure;
		});
		expect(test.start).toThrow(failure);
		await expect(test.owned.wait(signal())).rejects.toBe(failure);
		await expect(test.owned.terminateGroup(signal())).resolves.toBeUndefined();
		await expect(test.owned.reap(signal())).rejects.toBe(failure);
		await expect(test.owned.waitForGroupAbsent(signal())).resolves.toBe(true);
		expect(vi.mocked(closeSync).mock.calls).toEqual([[30], [31]]);
		expect(spawn).toHaveBeenCalledOnce();
		expect(process.kill).not.toHaveBeenCalled();
	});

	it("attempts both FD closes and retains spawn and close failures", async () => {
		const test = fixture();
		const spawnFailure = new Error("spawn failed");
		const stdoutFailure = new Error("stdout close failed");
		const stderrFailure = new Error("stderr close failed");
		vi.mocked(spawn).mockImplementation(() => {
			throw spawnFailure;
		});
		vi.mocked(closeSync)
			.mockImplementationOnce(() => {
				throw stdoutFailure;
			})
			.mockImplementationOnce(() => {
				throw stderrFailure;
			});
		expect(test.start).toThrow(AggregateError);
		await expect(test.owned.wait(signal())).rejects.toMatchObject({
			errors: [spawnFailure, stdoutFailure, stderrFailure],
		});
		expect(vi.mocked(closeSync).mock.calls).toEqual([[30], [31]]);
		expect(spawn).toHaveBeenCalledOnce();
	});

	it("keeps a spawned child owned when closing an output FD fails", async () => {
		const test = fixture();
		const failure = new Error("close failed");
		vi.mocked(closeSync).mockImplementationOnce(() => {
			throw failure;
		});
		expect(test.start).toThrow(failure);
		await test.owned.terminateGroup(signal());
		expect(process.kill).toHaveBeenCalledExactlyOnceWith(-4200, "SIGKILL");
		test.child.finish(null, "SIGKILL");
		await expect(test.owned.reap(signal())).rejects.toBe(failure);
		expect(vi.mocked(closeSync).mock.calls).toEqual([[30], [31]]);
	});

	it.each(["error", "exit", "close"])(
		"retains ownership and native event observers if %s listener setup throws",
		async (failedEvent) => {
			const test = fixture();
			const failure = new Error("listener setup failed");
			vi.spyOn(test.child, "on").mockImplementation((event, listener) => {
				if (event === failedEvent) throw failure;
				EventEmitter.prototype.on.call(test.child, event, listener);
				return test.child;
			});
			expect(test.start).toThrow(failure);
			for (const event of ["error", "exit", "close"])
				expect(test.child.listenerCount(event)).toBe(1);
			await test.owned.terminateGroup(signal());
			expect(process.kill).toHaveBeenCalledExactlyOnceWith(-4200, "SIGKILL");
			const reaped = expect(test.owned.reap(signal())).rejects.toBe(failure);
			test.child.finish(null, "SIGKILL");
			await reaped;
			expect(test.child.eventNames()).toEqual([]);
			expect(vi.mocked(closeSync).mock.calls).toEqual([[30], [31]]);
		},
	);

	it("handles child errors after listener setup failure until actual close", async () => {
		const test = fixture();
		const setupFailure = new Error("listener setup failed");
		const childFailure = new Error("child error");
		vi.spyOn(test.child, "on").mockImplementation(() => {
			throw setupFailure;
		});
		expect(test.start).toThrow(setupFailure);
		expect(() => test.child.emit("error", childFailure)).not.toThrow();
		const reaped = expect(test.owned.reap(signal())).rejects.toMatchObject({
			errors: [setupFailure, childFailure],
		});
		test.child.finish(1);
		await reaped;
		expect(test.child.eventNames()).toEqual([]);
	});

	it.each([
		undefined,
		0,
		1,
		-4200,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		2_147_483_648,
	])("never signals an invalid or unavailable PID %s", async (pid) => {
		const test = fixture();
		test.child.pid = pid;
		expect(test.start).toThrow("no validated process group PID");
		await expect(test.owned.wait(signal())).rejects.toThrow("no validated");
		await expect(test.owned.terminateGroup(signal())).rejects.toThrow(
			"no validated",
		);
		await expect(test.owned.waitForGroupAbsent(signal())).rejects.toThrow(
			"no validated",
		);
		test.child.finish(1);
		await expect(test.owned.reap(signal())).rejects.toThrow("no validated");
		expect(process.kill).not.toHaveBeenCalled();
		expect(test.child.eventNames()).toEqual([]);
	});
});

describe("native SafeJS gate child observation", () => {
	it.each([0, 7])(
		"waits for actual exit %i and reaps only after close",
		async (code) => {
			const test = fixture();
			test.start();
			const waitSignal = signal();
			const reapSignal = signal();
			const waited = Promise.resolve(test.owned.wait(waitSignal));
			const reaped = Promise.resolve(test.owned.reap(reapSignal));
			const waitSettled = vi.fn();
			const reapSettled = vi.fn();
			void waited.then(waitSettled);
			void reaped.then(reapSettled);
			await Promise.resolve();
			expect(waitSettled).not.toHaveBeenCalled();
			expect(reapSettled).not.toHaveBeenCalled();
			test.child.emit("exit", code, null);
			await expect(waited).resolves.toBe(code);
			expect(reapSettled).not.toHaveBeenCalled();
			expect(getEventListeners(waitSignal, "abort")).toEqual([]);
			test.child.emit("close", code, null);
			await expect(reaped).resolves.toBeUndefined();
			await expect(test.owned.reap(signal())).resolves.toBeUndefined();
			expect(getEventListeners(reapSignal, "abort")).toEqual([]);
			expect(test.child.eventNames()).toEqual([]);
		},
	);

	it("preserves the actual terminating signal without fabricating successful wait", async () => {
		const test = fixture();
		test.start();
		const waited = expect(test.owned.wait(signal())).rejects.toThrow("SIGTERM");
		test.child.finish(null, "SIGTERM");
		await waited;
		await expect(test.owned.wait(signal())).rejects.toThrow("SIGTERM");
		await expect(test.owned.reap(signal())).resolves.toBeUndefined();
	});

	it("settles asynchronous errors but does not fabricate a reap", async () => {
		const test = fixture();
		test.start();
		const failure = new Error("asynchronous child error");
		const waited = expect(test.owned.wait(signal())).rejects.toBe(failure);
		const controller = new AbortController();
		const reaped = Promise.resolve(test.owned.reap(controller.signal));
		const settled = vi.fn();
		void reaped.then(settled, settled);
		expect(() => test.child.emit("error", failure)).not.toThrow();
		await waited;
		expect(settled).not.toHaveBeenCalled();
		const cancelled = expect(reaped).rejects.toThrow("reap deadline");
		controller.abort(new Error("reap deadline"));
		await cancelled;
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		test.child.finish(1);
		await expect(test.owned.reap(signal())).rejects.toBe(failure);
		expect(test.child.eventNames()).toEqual([]);
		expect(process.kill).not.toHaveBeenCalled();
	});

	it("consumes asynchronous spawn errors with no PID and preserves both failures", async () => {
		const test = fixture();
		test.child.pid = undefined;
		expect(test.start).toThrow("no validated");
		const failure = systemError("ENOENT");
		expect(() => test.child.emit("error", failure)).not.toThrow();
		const reaped = expect(test.owned.reap(signal())).rejects.toMatchObject({
			errors: [expect.any(Error), failure],
		});
		test.child.emit("close", -2, null);
		await reaped;
		expect(test.child.eventNames()).toEqual([]);
		expect(process.kill).not.toHaveBeenCalled();
	});

	it("cancels wait without killing and permits independent cleanup", async () => {
		const test = fixture();
		test.start();
		const controller = new AbortController();
		const failure = new Error("operation cancelled");
		const waited = expect(test.owned.wait(controller.signal)).rejects.toBe(
			failure,
		);
		controller.abort(failure);
		await waited;
		expect(process.kill).not.toHaveBeenCalled();
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		await test.owned.terminateGroup(signal());
		expect(process.kill).toHaveBeenCalledExactlyOnceWith(-4200, "SIGKILL");
		const reaped = test.owned.reap(signal());
		test.child.finish(null, "SIGKILL");
		await expect(reaped).resolves.toBeUndefined();
		expect(test.child.eventNames()).toEqual([]);
	});

	it("preserves errors arriving after wait cancellation for the reaper", async () => {
		const test = fixture();
		test.start();
		const controller = new AbortController();
		const waited = expect(test.owned.wait(controller.signal)).rejects.toThrow(
			"cancelled",
		);
		controller.abort(new Error("cancelled"));
		await waited;
		const failure = new Error("late child failure");
		test.child.emit("error", failure);
		test.child.finish(1);
		await expect(test.owned.reap(signal())).rejects.toBe(failure);
		expect(process.kill).not.toHaveBeenCalled();
	});

	it.each(["wait", "terminateGroup", "reap", "waitForGroupAbsent"] as const)(
		"settles pre-aborted %s without any signal or poll",
		async (operation) => {
			const test = fixture();
			test.start();
			const controller = new AbortController();
			const failure = new Error("already aborted");
			controller.abort(failure);
			await expect(test.owned[operation](controller.signal)).rejects.toBe(
				failure,
			);
			expect(process.kill).not.toHaveBeenCalled();
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			test.child.finish();
		},
	);
});

describe("native SafeJS gate process group cleanup", () => {
	it("signals only the captured owned group, once, even after leader exit", async () => {
		const test = fixture();
		test.start();
		test.child.pid = 1;
		test.child.finish();
		await test.owned.terminateGroup(signal());
		await test.owned.terminateGroup(signal());
		expect(process.kill).toHaveBeenCalledExactlyOnceWith(-4200, "SIGKILL");
		await expect(test.owned.reap(signal())).resolves.toBeUndefined();
	});

	it("polls for leftover descendants rather than equating leader exit with absence", async () => {
		const test = fixture();
		test.start();
		test.child.finish();
		await test.owned.terminateGroup(signal());
		const controller = new AbortController();
		const absent = Promise.resolve(
			test.owned.waitForGroupAbsent(controller.signal),
		);
		const settled = vi.fn();
		void absent.then(settled);
		await vi.advanceTimersByTimeAsync(50);
		expect(settled).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
		vi.mocked(process.kill).mockImplementation(() => {
			throw systemError("ESRCH");
		});
		await vi.advanceTimersByTimeAsync(25);
		await expect(absent).resolves.toBe(true);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		const calls = vi.mocked(process.kill).mock.calls.length;
		await expect(test.owned.waitForGroupAbsent(signal())).resolves.toBe(true);
		await test.owned.terminateGroup(signal());
		expect(process.kill).toHaveBeenCalledTimes(calls);
		expect(vi.mocked(process.kill).mock.calls.slice(1)).toEqual([
			[-4200, 0],
			[-4200, 0],
			[-4200, 0],
			[-4200, 0],
		]);
	});

	it("bounds leftover-group polling by cancellation and releases its timer", async () => {
		const test = fixture();
		test.start();
		test.child.finish();
		const controller = new AbortController();
		const failure = new Error("group deadline");
		const absent = expect(
			test.owned.waitForGroupAbsent(controller.signal),
		).rejects.toBe(failure);
		await vi.advanceTimersByTimeAsync(50);
		controller.abort(failure);
		await absent;
		expect(vi.getTimerCount()).toBe(0);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		const calls = vi.mocked(process.kill).mock.calls.length;
		await vi.advanceTimersByTimeAsync(100);
		expect(process.kill).toHaveBeenCalledTimes(calls);
		expect(
			vi.mocked(process.kill).mock.calls.every((call) => call[1] === 0),
		).toBe(true);
		vi.mocked(process.kill).mockImplementation(() => {
			throw systemError("ESRCH");
		});
		await expect(test.owned.waitForGroupAbsent(signal())).resolves.toBe(true);
	});

	it("tolerates SIGKILL ESRCH only after a confirming group probe", async () => {
		const test = fixture();
		test.start();
		vi.mocked(process.kill).mockImplementation(() => {
			throw systemError("ESRCH");
		});
		await expect(test.owned.terminateGroup(signal())).resolves.toBeUndefined();
		await expect(test.owned.waitForGroupAbsent(signal())).resolves.toBe(true);
		await test.owned.terminateGroup(signal());
		expect(vi.mocked(process.kill).mock.calls).toEqual([
			[-4200, "SIGKILL"],
			[-4200, 0],
		]);
		test.child.finish();
	});

	it("does not expose an unverified ESRCH for the supervisor to ignore", async () => {
		const test = fixture();
		test.start();
		const failure = systemError("ESRCH");
		vi.mocked(process.kill).mockImplementationOnce(() => {
			throw failure;
		});
		await expect(test.owned.terminateGroup(signal())).rejects.toMatchObject({
			message: expect.stringContaining("still exists"),
			cause: failure,
		});
		await expect(
			test.owned.terminateGroup(signal()),
		).rejects.not.toHaveProperty("code");
		expect(process.kill).toHaveBeenCalledTimes(2);
		test.child.finish();
	});

	it("also verifies structured ESRCH failures before tolerating absence", async () => {
		const test = fixture();
		test.start();
		const failure = { code: "ESRCH", message: "structured signal failure" };
		vi.mocked(process.kill).mockImplementationOnce(() => {
			throw failure;
		});
		await expect(test.owned.terminateGroup(signal())).rejects.toMatchObject({
			message: expect.stringContaining("still exists"),
			cause: failure,
		});
		expect(vi.mocked(process.kill).mock.calls).toEqual([
			[-4200, "SIGKILL"],
			[-4200, 0],
		]);
		test.child.finish();
	});

	it("retains both SIGKILL ESRCH and failed absence verification", async () => {
		const test = fixture();
		test.start();
		const missing = systemError("ESRCH");
		const denied = systemError("EPERM");
		vi.mocked(process.kill)
			.mockImplementationOnce(() => {
				throw missing;
			})
			.mockImplementation(() => {
				throw denied;
			});
		await expect(test.owned.terminateGroup(signal())).rejects.toMatchObject({
			errors: [missing, denied],
		});
		await expect(
			test.owned.terminateGroup(signal()),
		).rejects.not.toHaveProperty("code");
		expect(process.kill).toHaveBeenCalledTimes(2);
		await expect(test.owned.waitForGroupAbsent(signal())).rejects.toBe(denied);
		test.child.finish();
	});

	it.each(["EPERM", "EINVAL"])(
		"preserves %s signal failure across idempotent cleanup calls",
		async (code) => {
			const test = fixture();
			test.start();
			const failure = systemError(code);
			vi.mocked(process.kill).mockImplementation(() => {
				throw failure;
			});
			await expect(test.owned.terminateGroup(signal())).rejects.toBe(failure);
			await expect(test.owned.terminateGroup(signal())).rejects.toBe(failure);
			expect(process.kill).toHaveBeenCalledExactlyOnceWith(-4200, "SIGKILL");
			const controller = new AbortController();
			await expect(
				test.owned.waitForGroupAbsent(controller.signal),
			).rejects.toBe(failure);
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			test.child.finish();
			await expect(test.owned.reap(signal())).resolves.toBeUndefined();
		},
	);

	it("releases polling observers when timer setup fails", async () => {
		const test = fixture();
		test.start();
		const failure = new Error("timer unavailable");
		const controller = new AbortController();
		vi.spyOn(globalThis, "setTimeout").mockImplementationOnce(() => {
			throw failure;
		});
		await expect(test.owned.waitForGroupAbsent(controller.signal)).rejects.toBe(
			failure,
		);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		test.child.finish();
		expect(process.kill).toHaveBeenCalledExactlyOnceWith(-4200, 0);
	});
});
