import { describe, expect, it, vi } from "vitest";
import {
	runSafeJsGate,
	type SafeJsGateOptions,
	type SafeJsGateProcess,
	type SafeJsGateReport,
} from "../scripts/run-safejs-gate.js";

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function fixture() {
	const events: string[] = [];
	const arrivals = new Map<string, ReturnType<typeof deferred<void>>>();
	const reached = (name: string) => {
		let arrival = arrivals.get(name);
		if (!arrival) {
			arrival = deferred<void>();
			arrivals.set(name, arrival);
		}
		return arrival;
	};
	const mark = (name: string) => {
		events.push(name);
		reached(name).resolve();
	};
	let now = 0;
	let sequence = 0;
	const timers = new Map<number, { due: number; expire: () => void }>();
	const controller = new AbortController();
	const records: SafeJsGateReport[] = [];
	const wait = vi.fn<SafeJsGateProcess["wait"]>(() => 0);
	const terminateGroup = vi.fn<SafeJsGateProcess["terminateGroup"]>(() => {});
	const reap = vi.fn<SafeJsGateProcess["reap"]>(() => {});
	const waitForGroupAbsent = vi.fn<SafeJsGateProcess["waitForGroupAbsent"]>(
		() => true,
	);
	const process: SafeJsGateProcess = {
		wait(signal) {
			mark("wait");
			return wait(signal);
		},
		terminateGroup(signal) {
			mark("terminateGroup");
			return terminateGroup(signal);
		},
		reap(signal) {
			mark("reap");
			return reap(signal);
		},
		waitForGroupAbsent(signal) {
			mark("waitForGroupAbsent");
			return waitForGroupAbsent(signal);
		},
	};
	const prerequisites = vi.fn<SafeJsGateOptions["prerequisites"]>(() => true);
	const guard = vi.fn<SafeJsGateOptions["guard"]>(() => true);
	const pins = vi.fn<SafeJsGateOptions["pins"]>(() => true);
	const launch = vi.fn<SafeJsGateOptions["launch"]>((register) =>
		register(process),
	);
	const acceptance = vi.fn<SafeJsGateOptions["acceptance"]>(() => true);
	const writeTerminal = vi.fn<SafeJsGateOptions["writeTerminal"]>((report) => {
		records.push(report);
	});
	const options: SafeJsGateOptions = {
		signal: controller.signal,
		operationTimeoutMs: 100,
		cleanupTimeoutMs: 10,
		terminalTimeoutMs: 20,
		schedule(milliseconds, expire) {
			const id = ++sequence;
			timers.set(id, { due: now + milliseconds, expire });
			return () => {
				timers.delete(id);
			};
		},
		prerequisites(signal) {
			mark("prerequisites");
			return prerequisites(signal);
		},
		guard(phase, signal) {
			mark(`guard-${phase}`);
			return guard(phase, signal);
		},
		pins(phase, signal) {
			mark(`pins-${phase}`);
			return pins(phase, signal);
		},
		launch(register) {
			mark("launch");
			return launch(register);
		},
		acceptance(report, signal) {
			mark("acceptance");
			return acceptance(report, signal);
		},
		writeTerminal(report, signal) {
			mark("terminal");
			return writeTerminal(report, signal);
		},
	};
	return {
		options,
		process,
		controller,
		events,
		records,
		timers,
		wait,
		terminateGroup,
		reap,
		waitForGroupAbsent,
		prerequisites,
		guard,
		pins,
		launch,
		acceptance,
		writeTerminal,
		entered: (name: string) => reached(name).promise,
		advance(milliseconds: number) {
			now += milliseconds;
			for (const [id, timer] of timers) {
				if (timer.due <= now) {
					timers.delete(id);
					timer.expire();
				}
			}
		},
	};
}

describe("host-owned SafeJS gate supervisor", () => {
	it("cleans ordinary exit after ordered mandatory gates", async () => {
		const test = fixture();
		let descendantPresent = true;
		test.terminateGroup.mockImplementation(() => {
			descendantPresent = false;
		});
		test.waitForGroupAbsent.mockImplementation(() => !descendantPresent);
		const result = await runSafeJsGate(test.options);
		expect(test.events).toEqual([
			"prerequisites",
			"guard-before",
			"pins-before",
			"launch",
			"wait",
			"terminateGroup",
			"reap",
			"waitForGroupAbsent",
			"pins-after",
			"guard-after",
			"acceptance",
			"terminal",
		]);
		expect(result).toEqual({
			terminalWritten: true,
			persistedReport: test.records[0],
			report: {
				passed: true,
				launched: true,
				exitCode: 0,
				reaped: true,
				groupAbsent: true,
				primaryFailures: [],
				cleanupFailures: [],
				evidenceFailures: [],
			},
		});
		expect(test.records).toEqual([result.report]);
		expect(Object.isFrozen(result.report)).toBe(true);
		expect(Object.isFrozen(result.report.primaryFailures)).toBe(true);
		expect(test.timers.size).toBe(0);
	});

	it.each(["prerequisites", "guard", "pins"] as const)(
		"rejects an explicit false %s before launch and writes a failed report",
		async (operation) => {
			const test = fixture();
			test[operation].mockReturnValueOnce(false);
			const result = await runSafeJsGate(test.options);
			expect(result.report.passed).toBe(false);
			expect(result.report.launched).toBe(false);
			expect(result.report.primaryFailures[0].message).toContain(
				"explicitly pass",
			);
			expect(test.launch).not.toHaveBeenCalled();
			expect(test.records).toEqual([result.report]);
		},
	);

	it("records thrown preflight failures without launching", async () => {
		const test = fixture();
		test.prerequisites.mockImplementation(() => {
			throw new Error("missing control");
		});
		const result = await runSafeJsGate(test.options);
		expect(result.report.primaryFailures).toEqual([
			{ stage: "prerequisites", message: "missing control" },
		]);
		expect(result.terminalWritten).toBe(true);
		expect(test.launch).not.toHaveBeenCalled();
	});

	it("bounds stalled preflight and cancels its supplied signal", async () => {
		const test = fixture();
		test.prerequisites.mockReturnValue(deferred<boolean>().promise);
		const pending = runSafeJsGate(test.options);
		await test.entered("prerequisites");
		test.advance(100);
		const result = await pending;
		expect(result.report.primaryFailures[0].message).toBe(
			"prerequisites timed out",
		);
		expect(test.prerequisites.mock.calls[0][0].aborted).toBe(true);
		expect(test.launch).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		"reports launch errors with registration=%s",
		async (registered) => {
			const test = fixture();
			test.launch.mockImplementation((register) => {
				if (registered) register(test.process);
				throw new Error("launch failed");
			});
			const result = await runSafeJsGate(test.options);
			expect(result.report.primaryFailures[0]).toEqual({
				stage: "launch",
				message: "launch failed",
			});
			expect(test.wait).not.toHaveBeenCalled();
			expect(test.terminateGroup).toHaveBeenCalledTimes(registered ? 1 : 0);
			expect(test.reap).toHaveBeenCalledTimes(registered ? 1 : 0);
			expect(test.waitForGroupAbsent).toHaveBeenCalledTimes(registered ? 1 : 0);
			expect(result.terminalWritten).toBe(true);
			expect(result.report.passed).toBe(false);
		},
	);

	it("rejects launch without synchronous ownership registration", async () => {
		const test = fixture();
		test.launch.mockImplementation(() => undefined);
		const result = await runSafeJsGate(test.options);
		expect(result.report.primaryFailures[0].message).toContain(
			"did not register",
		);
		expect(test.wait).not.toHaveBeenCalled();
		expect(result.terminalWritten).toBe(true);
	});

	it("cleans every registered handle when launch registers an extra process", async () => {
		const test = fixture();
		const extra = fixture();
		test.launch.mockImplementation((register) => {
			register(test.process);
			return register(extra.process);
		});
		const result = await runSafeJsGate(test.options);
		expect(result.report.passed).toBe(false);
		expect(test.wait).not.toHaveBeenCalled();
		expect(test.reap).toHaveBeenCalledOnce();
		expect(extra.reap).toHaveBeenCalledOnce();
		expect(extra.waitForGroupAbsent).toHaveBeenCalledOnce();
	});

	it.each([1, null])(
		"fails child exit %s without skipping cleanup",
		async (code) => {
			const test = fixture();
			test.wait.mockReturnValue(code);
			const result = await runSafeJsGate(test.options);
			expect(result.report.passed).toBe(false);
			expect(result.report.exitCode).toBe(code);
			expect(test.terminateGroup).toHaveBeenCalledOnce();
			expect(test.acceptance).not.toHaveBeenCalled();
		},
	);

	it("keeps wait, cleanup, and evidence failures separate", async () => {
		const test = fixture();
		test.wait.mockRejectedValue(new Error("wait failed"));
		test.terminateGroup.mockRejectedValue(new Error("kill denied"));
		test.writeTerminal.mockRejectedValue(new Error("disk full"));
		const result = await runSafeJsGate(test.options);
		expect(result.report.primaryFailures).toEqual([
			{ stage: "wait", message: "wait failed" },
		]);
		expect(result.report.cleanupFailures).toEqual([
			{ stage: "terminateGroup", message: "kill denied" },
		]);
		expect(result.report.evidenceFailures).toEqual([
			{ stage: "terminal", message: "disk full" },
		]);
		expect(result.terminalWritten).toBe(false);
		expect(result.report.passed).toBe(false);
		expect(test.reap).toHaveBeenCalledOnce();
		expect(test.waitForGroupAbsent).toHaveBeenCalledOnce();
	});

	it("observes late wait rejection after timeout", async () => {
		const test = fixture();
		const wait = deferred<number>();
		test.wait.mockReturnValue(wait.promise);
		const pending = runSafeJsGate(test.options);
		await test.entered("wait");
		test.advance(100);
		const result = await pending;
		wait.reject(new Error("late wait rejection"));
		expect(result.report.primaryFailures[0].message).toBe("wait timed out");
		expect(test.wait.mock.calls[0][0].aborted).toBe(true);
		expect(test.records).toHaveLength(1);
		expect(test.timers.size).toBe(0);
	});

	it("does not launch when already cancelled", async () => {
		const test = fixture();
		test.controller.abort(new Error("cancelled before start"));
		const result = await runSafeJsGate(test.options);
		expect(result.report.passed).toBe(false);
		expect(test.prerequisites).not.toHaveBeenCalled();
		expect(test.launch).not.toHaveBeenCalled();
		expect(result.terminalWritten).toBe(true);
	});

	it.each(["cancel-first", "timeout-first"])(
		"handles %s wait races",
		async (order) => {
			const test = fixture();
			const wait = deferred<number>();
			test.wait.mockReturnValue(wait.promise);
			const pending = runSafeJsGate(test.options);
			await test.entered("wait");
			if (order === "timeout-first") test.advance(100);
			test.controller.abort(new Error("cancelled wait"));
			if (order === "cancel-first") test.advance(100);
			wait.resolve(0);
			const result = await pending;
			expect(result.report.passed).toBe(false);
			expect(test.terminateGroup).toHaveBeenCalledOnce();
			expect(test.terminateGroup.mock.calls[0][0].aborted).toBe(false);
			expect(test.records).toHaveLength(1);
			expect(test.timers.size).toBe(0);
		},
	);

	it("does not turn cancellation racing a successful wait into a pass", async () => {
		const test = fixture();
		test.wait.mockImplementation(() => {
			test.controller.abort(new Error("cancel at exit"));
			return 0;
		});
		const result = await runSafeJsGate(test.options);
		expect(result.report.passed).toBe(false);
		expect(test.reap).toHaveBeenCalledOnce();
	});

	it("still reaps and verifies after a group signal race", async () => {
		const test = fixture();
		test.terminateGroup.mockImplementation(() => {
			throw Object.assign(new Error("gone"), { code: "ESRCH" });
		});
		const result = await runSafeJsGate(test.options);
		expect(result.report.passed).toBe(true);
		expect(test.reap).toHaveBeenCalledOnce();
		expect(test.waitForGroupAbsent).toHaveBeenCalledOnce();
	});

	it.each(["terminateGroup", "reap", "waitForGroupAbsent"] as const)(
		"bounds a stalled %s and continues finalization",
		async (operation) => {
			const test = fixture();
			test[operation].mockReturnValue(deferred<never>().promise);
			const pending = runSafeJsGate(test.options);
			await test.entered(operation);
			test.advance(10);
			const result = await pending;
			expect(result.report.cleanupFailures[0]).toEqual({
				stage: operation,
				message: `${operation} timed out`,
			});
			expect(test[operation].mock.calls[0][0].aborted).toBe(true);
			expect(test.waitForGroupAbsent).toHaveBeenCalledOnce();
			expect(test.acceptance).not.toHaveBeenCalled();
			expect(result.report.passed).toBe(false);
			expect(result.terminalWritten).toBe(true);
		},
	);

	it("fails unconfirmed group absence", async () => {
		const test = fixture();
		test.waitForGroupAbsent.mockReturnValue(false);
		const result = await runSafeJsGate(test.options);
		expect(result.report.groupAbsent).toBe(false);
		expect(result.report.cleanupFailures[0].stage).toBe("waitForGroupAbsent");
		expect(result.report.passed).toBe(false);
	});

	it("finishes cleanup and postchecks despite cancellation", async () => {
		const test = fixture();
		const reaped = deferred<void>();
		test.reap.mockReturnValue(reaped.promise);
		const pending = runSafeJsGate(test.options);
		await test.entered("reap");
		test.controller.abort(new Error("cancel during cleanup"));
		reaped.resolve();
		const result = await pending;
		expect(test.reap.mock.calls[0][0].aborted).toBe(false);
		expect(test.pins.mock.calls.map(([phase]) => phase)).toEqual([
			"before",
			"after",
		]);
		expect(test.guard.mock.calls.map(([phase]) => phase)).toEqual([
			"before",
			"after",
		]);
		expect(result.report.passed).toBe(false);
		expect(result.terminalWritten).toBe(true);
	});

	it("records post-run integrity and malformed guard failures after cleanup", async () => {
		const test = fixture();
		test.pins.mockImplementation((phase) => phase === "before");
		test.guard.mockImplementation((phase) => {
			if (phase === "after") throw new Error("malformed guard record");
			return true;
		});
		const result = await runSafeJsGate(test.options);
		expect(result.report.primaryFailures.map(({ stage }) => stage)).toEqual([
			"pins-after",
			"guard-after",
		]);
		expect(test.reap).toHaveBeenCalledOnce();
		expect(test.acceptance).not.toHaveBeenCalled();
		expect(result.terminalWritten).toBe(true);
	});

	it.each(["false", "throw"])(
		"requires explicit acceptance on %s",
		async (mode) => {
			const test = fixture();
			test.acceptance.mockImplementation(() => {
				if (mode === "throw") throw new Error("invalid fixture schema");
				return false;
			});
			const result = await runSafeJsGate(test.options);
			expect(result.report.primaryFailures[0].stage).toBe("acceptance");
			expect(result.report.passed).toBe(false);
			expect(test.records[0].passed).toBe(false);
		},
	);

	it("does not acknowledge a timed-out terminal write", async () => {
		const test = fixture();
		const written = deferred<void>();
		test.writeTerminal.mockReturnValue(written.promise);
		const pending = runSafeJsGate(test.options);
		await test.entered("terminal");
		test.advance(20);
		const result = await pending;
		written.resolve();
		expect(result.terminalWritten).toBe(false);
		expect(result.report.passed).toBe(false);
		expect(result.report.evidenceFailures).toEqual([
			{ stage: "terminal", message: "terminal timed out" },
		]);
		expect(test.writeTerminal.mock.calls[0][1].aborted).toBe(true);
		expect(test.records).toHaveLength(0);
		expect(test.timers.size).toBe(0);
	});

	it("reports invalid limits without launching", async () => {
		const test = fixture();
		test.options.cleanupTimeoutMs = 0;
		const result = await runSafeJsGate(test.options);
		expect(result.report.primaryFailures[0].stage).toBe("configuration");
		expect(test.launch).not.toHaveBeenCalled();
		expect(result.terminalWritten).toBe(true);
	});

	it("has no fallback for a missing mandatory guard", async () => {
		const test = fixture();
		Reflect.deleteProperty(test.options, "guard");
		const result = await runSafeJsGate(test.options);
		expect(result.report.primaryFailures[0].message).toBe(
			"Missing mandatory guard operation",
		);
		expect(test.launch).not.toHaveBeenCalled();
		expect(result.terminalWritten).toBe(true);
	});

	it.each([
		"prerequisites",
		"wait",
		"terminateGroup",
		"writeTerminal",
	] as const)(
		"retains finalization without reading getters or coercing %s errors",
		async (operation) => {
			const test = fixture();
			const message = vi.fn(() => {
				throw new Error("message getter must not run");
			});
			const coercionSpy = vi.fn(() => {
				throw new Error("error coercion must not run");
			});
			const error = Object.defineProperty(
				{ toString: coercionSpy },
				"message",
				{
					get: message,
				},
			);
			test[operation].mockRejectedValue(error);
			const result = await runSafeJsGate(test.options);
			const failures = [
				...result.report.primaryFailures,
				...result.report.cleanupFailures,
				...result.report.evidenceFailures,
			];
			expect(failures[0].message).toBe("Host operation failed");
			expect(message).not.toHaveBeenCalled();
			expect(coercionSpy).not.toHaveBeenCalled();
			expect(result.report.passed).toBe(false);
			expect(test.writeTerminal).toHaveBeenCalledOnce();
			expect(result.terminalWritten).toBe(operation !== "writeTerminal");
			expect(test.reap).toHaveBeenCalledTimes(
				operation === "prerequisites" ? 0 : 1,
			);
		},
	);

	it("contains hostile cleanup proxies and still records evidence", async () => {
		const test = fixture();
		const error = new Proxy(
			{},
			{
				getOwnPropertyDescriptor() {
					throw new Error("descriptor denied");
				},
				get() {
					throw new Error("property denied");
				},
				has() {
					throw new Error("membership denied");
				},
			},
		);
		test.terminateGroup.mockImplementation(() => {
			throw error;
		});
		const result = await runSafeJsGate(test.options);
		expect(result.report.cleanupFailures).toEqual([
			{ stage: "terminateGroup", message: "Host operation failed" },
		]);
		expect(test.reap).toHaveBeenCalledOnce();
		expect(test.waitForGroupAbsent).toHaveBeenCalledOnce();
		expect(result.terminalWritten).toBe(true);
		expect(result.persistedReport?.passed).toBe(false);
	});

	it.each(["string", "message"])("bounds %s diagnostics", async (kind) => {
		const test = fixture();
		const text = "x".repeat(40_000);
		test.wait.mockRejectedValue(kind === "string" ? text : { message: text });
		const result = await runSafeJsGate(test.options);
		expect(result.report.primaryFailures[0].message).toBe("x".repeat(1024));
		expect(test.reap).toHaveBeenCalledOnce();
		expect(result.terminalWritten).toBe(true);
	});

	it("distinguishes terminal-time cancellation from persisted success", async () => {
		const test = fixture();
		const written = deferred<void>();
		test.writeTerminal.mockImplementation((report) => {
			test.records.push(report);
			return written.promise;
		});
		const pending = runSafeJsGate(test.options);
		await test.entered("terminal");
		test.controller.abort(new Error("cancel during terminal write"));
		written.resolve();
		const result = await pending;
		expect(result.report.passed).toBe(false);
		expect(result.report.primaryFailures).toEqual([
			{ stage: "cancelled", message: "cancel during terminal write" },
		]);
		expect(result.terminalWritten).toBe(true);
		expect(result.persistedReport).toBe(test.records[0]);
		expect(result.persistedReport?.passed).toBe(true);
		expect(result.persistedReport?.primaryFailures).toEqual([]);
		expect(result.report).not.toBe(result.persistedReport);
		expect(test.records).toHaveLength(1);
		expect(test.writeTerminal.mock.calls[0][1].aborted).toBe(false);
	});

	it("records cancelled, failed writes without persistence claims", async () => {
		const test = fixture();
		const written = deferred<void>();
		test.writeTerminal.mockReturnValue(written.promise);
		const pending = runSafeJsGate(test.options);
		await test.entered("terminal");
		test.controller.abort(new Error("cancel during terminal write"));
		written.reject(new Error("write failed"));
		const result = await pending;
		expect(result.report.passed).toBe(false);
		expect(result.report.primaryFailures[0].stage).toBe("cancelled");
		expect(result.report.evidenceFailures).toEqual([
			{ stage: "terminal", message: "write failed" },
		]);
		expect(result.terminalWritten).toBe(false);
		expect(result.persistedReport).toBeNull();
	});

	it("does not read an ESRCH code getter while classifying cleanup errors", async () => {
		const test = fixture();
		const code = vi.fn(() => {
			throw new Error("code getter must not run");
		});
		test.terminateGroup.mockRejectedValue(
			Object.defineProperty(new Error("kill failed"), "code", { get: code }),
		);
		const result = await runSafeJsGate(test.options);
		expect(code).not.toHaveBeenCalled();
		expect(result.report.cleanupFailures).toEqual([
			{ stage: "terminateGroup", message: "kill failed" },
		]);
		expect(test.reap).toHaveBeenCalledOnce();
		expect(test.waitForGroupAbsent).toHaveBeenCalledOnce();
		expect(result.terminalWritten).toBe(true);
	});

	it("attempts unverified cleanup when deadline setup fails", async () => {
		const test = fixture();
		const schedule = test.options.schedule;
		test.options.schedule = (milliseconds, expire) => {
			if (milliseconds === test.options.cleanupTimeoutMs)
				throw new Error("deadline service failed");
			return schedule(milliseconds, expire);
		};
		const unfinished = deferred<never>();
		test.terminateGroup.mockReturnValue(unfinished.promise);
		test.reap.mockReturnValue(unfinished.promise);
		test.waitForGroupAbsent.mockReturnValue(unfinished.promise);
		const result = await runSafeJsGate(test.options);
		unfinished.reject(new Error("late cleanup rejection"));
		expect(test.terminateGroup).toHaveBeenCalledOnce();
		expect(test.reap).toHaveBeenCalledOnce();
		expect(test.waitForGroupAbsent).toHaveBeenCalledOnce();
		expect(test.terminateGroup.mock.calls[0][0].aborted).toBe(true);
		expect(result.report.reaped).toBe(false);
		expect(result.report.groupAbsent).toBe(false);
		expect(result.report.passed).toBe(false);
		expect(result.report.cleanupFailures).toEqual([
			{
				stage: "terminateGroup:timer-setup",
				message: "deadline service failed",
			},
			{
				stage: "terminateGroup",
				message: "terminateGroup deadline unavailable; outcome unverified",
			},
			{ stage: "reap:timer-setup", message: "deadline service failed" },
			{
				stage: "reap",
				message: "reap deadline unavailable; outcome unverified",
			},
			{
				stage: "waitForGroupAbsent:timer-setup",
				message: "deadline service failed",
			},
			{
				stage: "waitForGroupAbsent",
				message: "waitForGroupAbsent deadline unavailable; outcome unverified",
			},
		]);
		expect(result.terminalWritten).toBe(true);
		expect(test.timers.size).toBe(0);
	});

	it("preserves the wait error separately from failed timer teardown", async () => {
		const test = fixture();
		const schedule = test.options.schedule;
		test.options.schedule = (milliseconds, expire) => {
			const cancel = schedule(milliseconds, expire);
			return () => {
				cancel();
				if (test.events.at(-1) === "wait")
					throw new Error("timer teardown failed");
			};
		};
		test.wait.mockRejectedValue(new Error("original wait failure"));
		const result = await runSafeJsGate(test.options);
		expect(result.report.primaryFailures).toEqual([
			{ stage: "wait:timer-teardown", message: "timer teardown failed" },
			{ stage: "wait", message: "original wait failure" },
		]);
		expect(test.reap).toHaveBeenCalledOnce();
		expect(result.terminalWritten).toBe(true);
	});

	it("blocks launch after prerequisite timer teardown failure", async () => {
		const test = fixture();
		const schedule = test.options.schedule;
		test.options.schedule = (milliseconds, expire) => {
			const cancel = schedule(milliseconds, expire);
			return () => {
				cancel();
				if (test.events.at(-1) === "prerequisites")
					throw new Error("timer teardown failed");
			};
		};
		const result = await runSafeJsGate(test.options);
		expect(test.launch).not.toHaveBeenCalled();
		expect(result.report.primaryFailures[0].stage).toBe(
			"prerequisites:timer-teardown",
		);
		expect(result.report.passed).toBe(false);
		expect(result.terminalWritten).toBe(true);
	});

	it.each(["resolve", "reject"])(
		"keeps terminal %s acknowledgement separate from timer teardown",
		async (outcome) => {
			const test = fixture();
			const schedule = test.options.schedule;
			test.options.schedule = (milliseconds, expire) => {
				const cancel = schedule(milliseconds, expire);
				return () => {
					if (milliseconds === test.options.terminalTimeoutMs)
						throw new Error("terminal timer teardown failed");
					cancel();
				};
			};
			if (outcome === "reject")
				test.writeTerminal.mockRejectedValue(
					new Error("original write failure"),
				);
			const result = await runSafeJsGate(test.options);
			expect(result.report.passed).toBe(false);
			expect(result.report.evidenceFailures[0]).toEqual({
				stage: "terminal:timer-teardown",
				message: "terminal timer teardown failed",
			});
			expect(result.terminalWritten).toBe(outcome === "resolve");
			if (outcome === "resolve") {
				expect(result.persistedReport).toBe(test.records[0]);
				expect(result.persistedReport?.passed).toBe(true);
				expect(result.report.evidenceFailures).toHaveLength(1);
			} else {
				expect(result.persistedReport).toBeNull();
				expect(result.report.evidenceFailures[1]).toEqual({
					stage: "terminal",
					message: "original write failure",
				});
			}
			test.advance(test.options.terminalTimeoutMs);
			expect(test.writeTerminal.mock.calls[0][1].aborted).toBe(
				outcome === "reject",
			);
			expect(test.timers.size).toBe(0);
		},
	);
});
