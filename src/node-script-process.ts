import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { processArguments, processReadRoot } from "./node-process-boundary.js";
import { ScriptFrameDecoder, scriptFrame } from "./node-script-protocol.js";
import {
	type ScriptEvaluation,
	type ScriptLimits,
	scriptLimits,
} from "./safejs.js";

export interface ScriptProcessOptions {
	packageRoot: string;
	limits?: Partial<ScriptLimits>;
	hardTimeoutMs?: number;
	startupTimeoutMs?: number;
	maxOldSpaceMiB?: number;
}

export interface ScriptProcessInfo {
	version: string;
	pid: number;
	permissions: {
		enabled: boolean;
		filesystemWrite: boolean;
		childProcess: boolean;
		worker: boolean;
		addons: boolean;
		wasi: boolean;
		stringCodeGenerationDisabled: boolean;
	};
}

const codes = new Set<ErrorCode>([
	"invalid-input",
	"resource-limit",
	"unsupported",
	"aborted",
	"closed",
	"timeout",
]);

export class SafeJsProcess {
	readonly ready: Promise<void>;
	readonly exited: Promise<void>;
	readonly limits: Readonly<ScriptLimits>;
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly decoder = new ScriptFrameDecoder();
	private readonly hardTimeoutMs: number;
	private startupTimer: ReturnType<typeof setTimeout>;
	private resolveReady!: () => void;
	private rejectReady!: (error: Error) => void;
	private resolveExited!: () => void;
	private infoValue?: ScriptProcessInfo;
	private failure?: AgentBrowserError;
	private ended = false;
	private runs = 0;
	private stderrBytes = 0;
	private pending?: {
		id: number;
		resolve: (result: ScriptEvaluation) => void;
		reject: (error: Error) => void;
		timer: ReturnType<typeof setTimeout>;
		cleanup: () => void;
	};

	private constructor(root: string, options: ScriptProcessOptions) {
		this.limits = scriptLimits(options.limits);
		this.hardTimeoutMs =
			options.hardTimeoutMs ?? Math.max(2000, this.limits.timeoutMs + 500);
		const startupTimeoutMs = options.startupTimeoutMs ?? 5000;
		const heap = options.maxOldSpaceMiB ?? 96;
		for (const timeout of [this.hardTimeoutMs, startupTimeoutMs])
			if (!Number.isSafeInteger(timeout) || timeout < 20 || timeout > 60_000)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid script process timeout",
				);
		if (!Number.isSafeInteger(heap) || heap < 32 || heap > 256)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid script process heap setting",
			);
		if (
			typeof Bun !== "undefined" ||
			!process.allowedNodeEnvironmentFlags.has("--permission")
		)
			throw new AgentBrowserError(
				"unsupported",
				"Script process requires a Node host with permission flags",
			);
		const childFile = fileURLToPath(
			new URL("./node-script-child.js", import.meta.url),
		);
		this.ready = new Promise((resolve, reject) => {
			this.resolveReady = resolve;
			this.rejectReady = reject;
		});
		this.exited = new Promise((resolve) => {
			this.resolveExited = resolve;
		});
		this.child = spawn(
			process.execPath,
			processArguments(root, childFile, heap),
			{ cwd: root, env: {}, stdio: ["pipe", "pipe", "pipe"] },
		);
		this.startupTimer = setTimeout(
			() =>
				this.terminate(
					new AgentBrowserError("timeout", "Script process startup timed out"),
				),
			startupTimeoutMs,
		);
		this.child.once("error", () =>
			this.terminate(
				new AgentBrowserError("unsupported", "Script process could not start"),
			),
		);
		this.child.stdin.on("error", () =>
			this.terminate(
				new AgentBrowserError("closed", "Script process input closed"),
			),
		);
		this.child.stdout.on("data", (chunk: Buffer) => {
			if (this.failure) return;
			try {
				for (const message of this.decoder.push(chunk)) this.receive(message);
			} catch (error) {
				this.terminate(
					error instanceof AgentBrowserError
						? error
						: new AgentBrowserError(
								"invalid-input",
								"Invalid script process response",
							),
				);
			}
		});
		this.child.stderr.on("data", (chunk: Buffer) => {
			this.stderrBytes += chunk.length;
			if (this.stderrBytes > 16_384)
				this.terminate(
					new AgentBrowserError(
						"resource-limit",
						"Script process diagnostic output limit exceeded",
					),
				);
		});
		this.child.once("close", () => {
			this.ended = true;
			clearTimeout(this.startupTimer);
			this.failure ??= new AgentBrowserError("closed", "Script process exited");
			this.rejectReady(this.failure);
			if (this.pending) {
				const pending = this.pending;
				this.pending = undefined;
				clearTimeout(pending.timer);
				pending.cleanup();
				pending.reject(this.failure);
			}
			this.resolveExited();
		});
		this.child.stdin.write(
			scriptFrame({
				schemaVersion: 1,
				type: "initialize",
				packageRoot: root,
				limits: this.limits,
			}),
		);
	}

	static async create(options: ScriptProcessOptions) {
		const root = await processReadRoot(options?.packageRoot);
		const process = new SafeJsProcess(root, options);
		try {
			await process.ready;
			return process;
		} catch (error) {
			await process.close();
			throw error;
		}
	}

	info(): Readonly<ScriptProcessInfo> {
		if (!this.infoValue)
			throw new AgentBrowserError("closed", "Script process is not ready");
		return structuredClone(this.infoValue);
	}

	evaluate(
		source: string,
		options: { signal?: AbortSignal } = {},
	): Promise<ScriptEvaluation> {
		if (this.failure || this.ended)
			return Promise.reject(
				this.failure ??
					new AgentBrowserError("closed", "Script process is closed"),
			);
		if (this.pending)
			return Promise.reject(
				new AgentBrowserError(
					"invalid-input",
					"Concurrent script process evaluation is not supported",
				),
			);
		if (
			typeof source !== "string" ||
			!options ||
			(options.signal !== undefined && !(options.signal instanceof AbortSignal))
		)
			return Promise.reject(
				new AgentBrowserError(
					"invalid-input",
					"Invalid script process evaluation",
				),
			);
		if (
			source.length > this.limits.maxSourceCodeUnits ||
			this.runs >= this.limits.maxRuns
		)
			return Promise.reject(
				new AgentBrowserError(
					"resource-limit",
					"Script process source or run limit exceeded",
				),
			);
		if (options.signal?.aborted)
			return Promise.reject(
				new AgentBrowserError("aborted", "Script process evaluation aborted"),
			);
		let frame: string;
		const id = this.runs + 1;
		try {
			frame = scriptFrame({ schemaVersion: 1, type: "evaluate", id, source });
		} catch (error) {
			return Promise.reject(error);
		}
		return new Promise((resolve, reject) => {
			const abort = () =>
				this.terminate(
					new AgentBrowserError("aborted", "Script process evaluation aborted"),
				);
			this.pending = {
				id,
				resolve,
				reject,
				timer: setTimeout(
					() =>
						this.terminate(
							new AgentBrowserError(
								"timeout",
								"Script process hard deadline exceeded",
							),
						),
					this.hardTimeoutMs,
				),
				cleanup: () => options.signal?.removeEventListener("abort", abort),
			};
			this.runs = id;
			options.signal?.addEventListener("abort", abort, { once: true });
			this.child.stdin.write(frame);
		});
	}

	async close() {
		this.terminate(new AgentBrowserError("closed", "Script process closed"));
		await this.exited;
	}

	metrics() {
		return {
			pid: this.child.pid,
			runs: this.runs,
			active: !!this.pending,
			closed: this.ended,
			terminating: !!this.failure && !this.ended,
			stderrBytes: this.stderrBytes,
		};
	}

	private terminate(error: AgentBrowserError) {
		if (this.failure) return;
		this.failure = error;
		clearTimeout(this.startupTimer);
		this.child.kill("SIGKILL");
	}

	private receive(raw: unknown) {
		if (this.failure) return;
		if (!raw || typeof raw !== "object") throw new Error("Invalid response");
		const message = raw as Record<string, unknown>;
		if (message.schemaVersion !== 1) throw new Error("Invalid version");
		if (message.type === "fatal") {
			this.terminate(
				new AgentBrowserError(
					codes.has(message.code as ErrorCode)
						? (message.code as ErrorCode)
						: "unsupported",
					"Script process initialization failed",
				),
			);
			return;
		}
		if (message.type === "ready" && !this.infoValue) {
			const info = message as unknown as ScriptProcessInfo;
			const permissions = info.permissions;
			if (
				info.pid !== this.child.pid ||
				typeof info.version !== "string" ||
				info.version.length > 64 ||
				!permissions ||
				!permissions.enabled ||
				!permissions.stringCodeGenerationDisabled ||
				permissions.filesystemWrite !== false ||
				permissions.childProcess !== false ||
				permissions.worker !== false ||
				permissions.addons !== false ||
				permissions.wasi !== false
			)
				throw new Error("Invalid runtime permissions");
			this.infoValue = {
				pid: info.pid,
				version: info.version,
				permissions: { ...permissions },
			};
			clearTimeout(this.startupTimer);
			this.resolveReady();
			return;
		}
		const pending = this.pending;
		if (
			!this.infoValue ||
			!pending ||
			message.id !== pending.id ||
			!["result", "failure"].includes(String(message.type))
		)
			throw new Error("Unexpected response");
		if (message.type === "result") {
			const result = message.result as ScriptEvaluation;
			if (
				!result ||
				result.engine !== "poe-safe-js" ||
				result.partial !== true ||
				typeof result.ok !== "boolean" ||
				!result.metrics
			)
				throw new Error("Invalid evaluation result");
			if (
				![
					result.metrics.steps,
					result.metrics.peakCallDepth,
					result.metrics.peakDataSize,
					result.metrics.consoleCalls,
				].every((value) => Number.isSafeInteger(value) && value >= 0)
			)
				throw new Error("Invalid evaluation metrics");
			if (
				!result.ok &&
				(!result.error ||
					!/^[A-Za-z_-]{1,64}$/.test(result.error.code) ||
					(result.error.budget !== undefined &&
						!/^[A-Za-z]{1,32}$/.test(result.error.budget)))
			)
				throw new Error("Invalid evaluation error");
			if (
				Buffer.byteLength(JSON.stringify(result.value) ?? "") >
				this.limits.maxResultBytes
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Script process result limit exceeded",
				);
			this.pending = undefined;
			clearTimeout(pending.timer);
			pending.cleanup();
			pending.resolve(result);
		} else {
			this.pending = undefined;
			clearTimeout(pending.timer);
			pending.cleanup();
			pending.reject(
				new AgentBrowserError(
					codes.has(message.code as ErrorCode)
						? (message.code as ErrorCode)
						: "unsupported",
					"Script evaluation failed",
				),
			);
		}
	}
}
