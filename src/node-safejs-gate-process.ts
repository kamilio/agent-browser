import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { closeSync, constants, openSync } from "node:fs";
import type { SafeJsGateProcess } from "../scripts/run-safejs-gate.js";

export type NodeSafeJsGateCommand = {
	command: string;
	args: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string>>;
	stdoutFile: string;
	stderrFile: string;
};

function throwFailures(failures: readonly unknown[], message: string): void {
	if (failures.length === 1) throw failures[0];
	if (failures.length > 1) throw new AggregateError(failures, message);
}

function isAbsent(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		error.code === "ESRCH"
	);
}

export function launchNodeSafeJsGateProcess(
	command: NodeSafeJsGateCommand,
	register: (process: SafeJsGateProcess) => undefined,
): void {
	let child: ChildProcess | undefined;
	let pid: number | undefined;
	let launchComplete = false;
	let closed = false;
	let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
	let groupAbsent = false;
	let terminationAttempted = false;
	const terminationFailures: unknown[] = [];
	const failures: unknown[] = [];
	const observers = new Set<() => void>();
	const notify = () => {
		for (const observer of [...observers]) observer();
	};
	const onError = (error: Error) => {
		failures.push(error);
		notify();
	};
	const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
		exit = { code, signal };
		notify();
	};
	const detach = () => {
		if (!child) return;
		EventEmitter.prototype.removeListener.call(child, "error", onError);
		EventEmitter.prototype.removeListener.call(child, "exit", onExit);
		EventEmitter.prototype.removeListener.call(child, "close", onClose);
	};
	const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
		closed = true;
		exit ??= { code, signal };
		detach();
		notify();
	};
	function observe<Value>(
		signal: AbortSignal,
		read: () => { value: Value } | undefined,
		poll = false,
	): Promise<Value> {
		return new Promise((resolve, reject) => {
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const dispose = () => {
				settled = true;
				clearTimeout(timer);
				observers.delete(check);
				signal.removeEventListener("abort", abort);
			};
			const abort = () => {
				if (settled) return;
				dispose();
				reject(signal.reason ?? new Error("SafeJS gate observation aborted"));
			};
			const check = () => {
				if (settled) return;
				clearTimeout(timer);
				if (signal.aborted) return abort();
				try {
					const result = launchComplete ? read() : undefined;
					if (result) {
						dispose();
						resolve(result.value);
					} else if (poll) {
						timer = setTimeout(check, 25);
					}
				} catch (error) {
					dispose();
					reject(error);
				}
			};
			try {
				observers.add(check);
				signal.addEventListener("abort", abort, { once: true });
				check();
			} catch (error) {
				dispose();
				reject(error);
			}
		});
	}
	function ownedGroup(): number | undefined {
		if (!child) return undefined;
		if (pid === undefined)
			throw new Error("SafeJS gate child has no validated process group PID");
		return -pid;
	}
	function probeGroup(group: number): boolean {
		try {
			process.kill(group, 0);
			return false;
		} catch (error) {
			if (!isAbsent(error)) throw error;
			groupAbsent = true;
			return true;
		}
	}
	const owned: SafeJsGateProcess = {
		wait(signal) {
			return observe(signal, () => {
				throwFailures(failures, "SafeJS gate child failed");
				if (!exit) return undefined;
				if (exit.signal)
					throw new Error(
						`SafeJS gate child exited from signal ${exit.signal}`,
					);
				return { value: exit.code };
			});
		},
		terminateGroup(signal) {
			return observe(signal, () => {
				throwFailures(
					terminationFailures,
					"SafeJS gate group termination failed",
				);
				if (terminationAttempted || groupAbsent) return { value: undefined };
				const group = ownedGroup();
				if (group === undefined) return { value: undefined };
				terminationAttempted = true;
				try {
					process.kill(group, "SIGKILL");
				} catch (error) {
					if (isAbsent(error)) {
						try {
							if (probeGroup(group)) return { value: undefined };
						} catch (verificationError) {
							const failure = new AggregateError(
								[error, verificationError],
								"SafeJS gate group disappearance could not be verified",
							);
							terminationFailures.push(failure);
							throw failure;
						}
						const failure = new Error(
							"SafeJS gate group still exists after SIGKILL reported ESRCH",
							{ cause: error },
						);
						terminationFailures.push(failure);
						throw failure;
					}
					terminationFailures.push(error);
					throw error;
				}
				return { value: undefined };
			});
		},
		reap(signal) {
			return observe(signal, () => {
				if (child && !closed) return undefined;
				throwFailures(failures, "SafeJS gate child failed before reaping");
				return { value: undefined };
			});
		},
		waitForGroupAbsent(signal) {
			return observe(
				signal,
				() => {
					if (groupAbsent) return { value: true };
					const group = ownedGroup();
					if (group === undefined || probeGroup(group)) return { value: true };
					return undefined;
				},
				true,
			);
		},
	};
	const descriptors: number[] = [];
	try {
		if (process.platform === "win32" || constants.O_NOFOLLOW === undefined)
			throw new Error(
				"SafeJS gate process adapter requires POSIX no-follow files",
			);
		const flags =
			constants.O_WRONLY |
			constants.O_CREAT |
			constants.O_EXCL |
			constants.O_NOFOLLOW;
		const stdout = openSync(command.stdoutFile, flags, 0o600);
		descriptors.push(stdout);
		const stderr = openSync(command.stderrFile, flags, 0o600);
		descriptors.push(stderr);
		const returned = register(owned);
		if (returned !== undefined)
			throw new Error("SafeJS gate process registration must return undefined");
		child = spawn(command.command, [...command.args], {
			cwd: command.cwd,
			env: Object.assign(Object.create(null), command.env),
			detached: true,
			shell: false,
			stdio: ["ignore", stdout, stderr],
		});
		const candidate = child.pid;
		if (
			typeof candidate === "number" &&
			Number.isSafeInteger(candidate) &&
			candidate > 1 &&
			candidate <= 2_147_483_647
		)
			pid = candidate;
		try {
			child.on("error", onError);
			child.on("exit", onExit);
			child.on("close", onClose);
		} catch (error) {
			detach();
			EventEmitter.prototype.on.call(child, "error", onError);
			EventEmitter.prototype.on.call(child, "exit", onExit);
			EventEmitter.prototype.on.call(child, "close", onClose);
			failures.push(error);
		}
		if (pid === undefined)
			throw new Error("SafeJS gate child has no validated process group PID");
	} catch (error) {
		failures.push(error);
	} finally {
		for (const descriptor of descriptors) {
			try {
				closeSync(descriptor);
			} catch (error) {
				failures.push(error);
			}
		}
		launchComplete = true;
		notify();
	}
	throwFailures(failures, "SafeJS gate process launch failed");
}
