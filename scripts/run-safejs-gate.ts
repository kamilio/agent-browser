type Pending<Value> = Value | Promise<Value>;

export type SafeJsGateProcess = {
	wait(signal: AbortSignal): Pending<number | null>;
	terminateGroup(signal: AbortSignal): Pending<void>;
	reap(signal: AbortSignal): Pending<void>;
	waitForGroupAbsent(signal: AbortSignal): Pending<boolean>;
};

export type SafeJsGateFailure = Readonly<{
	stage: string;
	message: string;
}>;

export type SafeJsGateReport = Readonly<{
	passed: boolean;
	launched: boolean;
	exitCode: number | null;
	reaped: boolean;
	groupAbsent: boolean;
	primaryFailures: readonly SafeJsGateFailure[];
	cleanupFailures: readonly SafeJsGateFailure[];
	evidenceFailures: readonly SafeJsGateFailure[];
}>;

export type SafeJsGateOptions = {
	signal?: AbortSignal;
	operationTimeoutMs: number;
	cleanupTimeoutMs: number;
	terminalTimeoutMs: number;
	schedule(milliseconds: number, expire: () => void): () => void;
	prerequisites(signal: AbortSignal): Pending<boolean>;
	guard(phase: "before" | "after", signal: AbortSignal): Pending<boolean>;
	pins(phase: "before" | "after", signal: AbortSignal): Pending<boolean>;
	launch(register: (process: SafeJsGateProcess) => undefined): undefined;
	acceptance(report: SafeJsGateReport, signal: AbortSignal): Pending<boolean>;
	writeTerminal(report: SafeJsGateReport, signal: AbortSignal): Pending<void>;
};

export type SafeJsGateResult = Readonly<{
	report: SafeJsGateReport;
	terminalWritten: boolean;
	persistedReport: SafeJsGateReport | null;
}>;

function validTimeout(milliseconds: number) {
	return (
		Number.isSafeInteger(milliseconds) &&
		milliseconds > 0 &&
		milliseconds <= 2_147_483_647
	);
}

function ownData(value: unknown, key: string): unknown {
	if (
		value === null ||
		(typeof value !== "object" && typeof value !== "function")
	)
		return undefined;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor && Object.hasOwn(descriptor, "value"))
			return descriptor.value;
	} catch {}
	return undefined;
}

function failure(stage: string, error: unknown): SafeJsGateFailure {
	const message = typeof error === "string" ? error : ownData(error, "message");
	return Object.freeze({
		stage,
		message:
			typeof message === "string"
				? message.slice(0, 1024)
				: "Host operation failed",
	});
}

async function bounded<Value>(
	options: SafeJsGateOptions,
	stage: string,
	milliseconds: number,
	operation: (signal: AbortSignal) => Pending<Value>,
	supervision: {
		signal?: AbortSignal;
		failures: SafeJsGateFailure[];
		bestEffort?: boolean;
	},
): Promise<Value> {
	if (!validTimeout(milliseconds)) throw new Error(`Invalid ${stage} timeout`);
	const signal = supervision.signal;
	const controller = new AbortController();
	let cancelTimer = () => {};
	let cancel = () => {};
	try {
		return await new Promise<Value>((resolve, reject) => {
			let settled = false;
			const stop = (error: unknown) => {
				if (settled) return;
				settled = true;
				controller.abort(error);
				reject(error);
			};
			cancel = () => stop(signal?.reason ?? new Error("Gate cancelled"));
			signal?.addEventListener("abort", cancel, { once: true });
			if (signal?.aborted) return cancel();
			const start = () => {
				try {
					Promise.resolve(operation(controller.signal)).then((value) => {
						if (signal?.aborted) return cancel();
						if (settled) return;
						settled = true;
						resolve(value);
					}, stop);
				} catch (error) {
					stop(error);
				}
			};
			if (supervision.bestEffort) start();
			if (settled) return;
			try {
				const dispose = options.schedule(milliseconds, () =>
					stop(new Error(`${stage} timed out`)),
				);
				if (typeof dispose !== "function")
					throw new Error("Timer did not return a cancel operation");
				cancelTimer = dispose;
			} catch (error) {
				supervision.failures.push(failure(`${stage}:timer-setup`, error));
				stop(new Error(`${stage} deadline unavailable; outcome unverified`));
				return;
			}
			if (!settled && !supervision.bestEffort) start();
		});
	} finally {
		signal?.removeEventListener("abort", cancel);
		try {
			cancelTimer();
		} catch (error) {
			supervision.failures.push(failure(`${stage}:timer-teardown`, error));
		}
	}
}

export async function runSafeJsGate(
	options: SafeJsGateOptions,
): Promise<SafeJsGateResult> {
	const processes: SafeJsGateProcess[] = [];
	const primaryFailures: SafeJsGateFailure[] = [];
	const cleanupFailures: SafeJsGateFailure[] = [];
	const evidenceFailures: SafeJsGateFailure[] = [];
	let exitCode: number | null = null;
	let reaped = false;
	let groupAbsent = false;
	let accepted = false;
	let launchAttempted = false;
	let stage = "configuration";
	const report = (): SafeJsGateReport =>
		Object.freeze({
			passed:
				accepted &&
				processes.length === 1 &&
				exitCode === 0 &&
				reaped &&
				groupAbsent &&
				primaryFailures.length +
					cleanupFailures.length +
					evidenceFailures.length ===
					0,
			launched: processes.length > 0,
			exitCode,
			reaped,
			groupAbsent,
			primaryFailures: Object.freeze([...primaryFailures]),
			cleanupFailures: Object.freeze([...cleanupFailures]),
			evidenceFailures: Object.freeze([...evidenceFailures]),
		});
	const check = async (
		name: string,
		operation: (signal: AbortSignal) => Pending<boolean>,
		signal?: AbortSignal,
	) => {
		stage = name;
		const failureCount = primaryFailures.length;
		const passed = await bounded(
			options,
			name,
			options.operationTimeoutMs,
			operation,
			{ signal, failures: primaryFailures },
		);
		if (passed !== true) throw new Error(`${name} did not explicitly pass`);
		if (primaryFailures.length !== failureCount)
			throw new Error(`${name} timer supervision failed`);
	};
	try {
		for (const milliseconds of [
			options.operationTimeoutMs,
			options.cleanupTimeoutMs,
			options.terminalTimeoutMs,
		]) {
			if (!validTimeout(milliseconds)) throw new Error("Invalid gate timeout");
		}
		for (const name of [
			"schedule",
			"prerequisites",
			"guard",
			"pins",
			"launch",
			"acceptance",
			"writeTerminal",
		] as const) {
			if (typeof options[name] !== "function")
				throw new Error(`Missing mandatory ${name} operation`);
		}
		await check(
			"prerequisites",
			(signal) => options.prerequisites(signal),
			options.signal,
		);
		await check(
			"guard-before",
			(signal) => options.guard("before", signal),
			options.signal,
		);
		await check(
			"pins-before",
			(signal) => options.pins("before", signal),
			options.signal,
		);
		stage = "launch";
		if (options.signal?.aborted) throw options.signal.reason;
		launchAttempted = true;
		let registering = true;
		try {
			const returned = options.launch((process) => {
				if (!registering)
					throw new Error("Launch registration must be synchronous");
				if (!processes.includes(process)) processes.push(process);
				if (processes.length !== 1)
					throw new Error("Launch must register exactly one owned process");
				return undefined;
			});
			if (returned !== undefined) {
				void Promise.resolve(returned).catch(() => {});
				throw new Error("Launch must complete synchronously");
			}
		} finally {
			registering = false;
		}
		if (processes.length !== 1)
			throw new Error("Launch did not register an owned process");
		stage = "wait";
		const status = await bounded(
			options,
			stage,
			options.operationTimeoutMs,
			(signal) => processes[0].wait(signal),
			{ signal: options.signal, failures: primaryFailures },
		);
		if (status !== null && !Number.isSafeInteger(status))
			throw new Error("Invalid child exit status");
		exitCode = status;
		if (exitCode !== 0) throw new Error(`Child exited with ${exitCode}`);
	} catch (error) {
		primaryFailures.push(failure(stage, error));
	} finally {
		reaped = processes.length > 0;
		groupAbsent = processes.length > 0;
		for (const process of processes) {
			for (const operation of [
				"terminateGroup",
				"reap",
				"waitForGroupAbsent",
			] as const) {
				try {
					const result = await bounded<boolean | undefined>(
						options,
						operation,
						options.cleanupTimeoutMs,
						async (signal) => {
							const value = await process[operation](signal);
							return typeof value === "boolean" ? value : undefined;
						},
						{ failures: cleanupFailures, bestEffort: true },
					);
					if (operation === "waitForGroupAbsent" && result !== true) {
						groupAbsent = false;
						cleanupFailures.push(
							failure(
								operation,
								new Error("Owned process group absence was not confirmed"),
							),
						);
					}
				} catch (error) {
					if (
						operation === "terminateGroup" &&
						ownData(error, "code") === "ESRCH"
					)
						continue;
					if (operation === "reap") reaped = false;
					if (operation === "waitForGroupAbsent") groupAbsent = false;
					cleanupFailures.push(failure(operation, error));
				}
			}
		}
	}
	if (launchAttempted) {
		for (const name of ["pins", "guard"] as const) {
			try {
				await check(`${name}-after`, (signal) =>
					options[name]("after", signal),
				);
			} catch (error) {
				primaryFailures.push(failure(stage, error));
			}
		}
	}
	if (primaryFailures.length === 0 && cleanupFailures.length === 0) {
		try {
			await check(
				"acceptance",
				(signal) => options.acceptance(report(), signal),
				options.signal,
			);
			accepted = true;
		} catch (error) {
			primaryFailures.push(failure(stage, error));
		}
	}
	const recordCancellation = () => {
		if (
			options.signal?.aborted &&
			!primaryFailures.some((entry) => entry.stage === "cancelled")
		)
			primaryFailures.push(failure("cancelled", options.signal.reason));
	};
	recordCancellation();
	let persistedReport: SafeJsGateReport | null = null;
	try {
		const terminal = report();
		await bounded(
			options,
			"terminal",
			options.terminalTimeoutMs,
			(signal) => options.writeTerminal(terminal, signal),
			{ failures: evidenceFailures },
		);
		persistedReport = terminal;
	} catch (error) {
		evidenceFailures.push(failure("terminal", error));
	}
	recordCancellation();
	return Object.freeze({
		report: report(),
		terminalWritten: persistedReport !== null,
		persistedReport,
	});
}
