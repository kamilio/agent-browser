import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { BrowserIdentityOptions } from "./browser-identity.js";
import { parseInvocation } from "./cli-parser.js";
import type { CommandRequestOptions, CommandResult } from "./command-host.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import type { NetworkPolicyOptions } from "./network.js";
import { sessionIdentityOptions } from "./node-identity-config.js";
import {
	hasRestrictedPermissions,
	processArguments,
	type processPermissions,
	processReadRoot,
} from "./node-process-boundary.js";
import { ScriptFrameDecoder, scriptFrame } from "./node-script-protocol.js";
import {
	type PageRuntimeAdapter,
	type PageRuntimeConfiguration,
	pageRuntimeConfiguration,
	pageRuntimeRequest,
} from "./page-runtime-selection.js";
import type { PageScriptOptions } from "./page-scripts.js";

export interface SessionProcessOptions {
	packageRoot: string;
	identity?: BrowserIdentityOptions;
	runtimeAdapter?: PageRuntimeAdapter;
	runtimeOptions?: Readonly<PageRuntimeConfiguration>;
	session?: string;
	commandTimeoutMs?: number;
	startupTimeoutMs?: number;
	heartbeatTimeoutMs?: number;
	maxOldSpaceMiB?: number;
	maxPendingCommands?: number;
	scripts?: Omit<PageScriptOptions, "fetch" | "networkSourceModules">;
	websiteScripts?: "classic" | "module";
	network?: NetworkPolicyOptions;
}

export interface SessionProcessInfo {
	pid: number;
	session: string;
	version: string;
	packageName: string;
	runtimeAdapter: PageRuntimeAdapter;
	runtimeValidation: "contract-shape-only";
	runtimeOptions?: Readonly<PageRuntimeConfiguration>;
	publicExport: "./safe-js" | "./core";
	permissions: ReturnType<typeof processPermissions>;
}

interface PendingCommand {
	command: string;
	resolve(result: CommandResult): void;
	reject(error: Error): void;
	timer: ReturnType<typeof setTimeout>;
	cleanup(): void;
}

const errorCodes = new Set<ErrorCode>([
	"invalid-input",
	"stale-reference",
	"not-found",
	"not-actionable",
	"policy-denied",
	"resource-limit",
	"unsupported",
	"network-error",
	"timeout",
	"aborted",
	"closed",
]);

export class BrowserSessionProcess {
	readonly session: string;
	readonly ready: Promise<void>;
	readonly exited: Promise<void>;
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly decoder = new ScriptFrameDecoder();
	private readonly pending = new Map<number, PendingCommand>();
	private readonly timeout: number;
	private readonly heartbeatTimeout: number;
	private readonly maxPending: number;
	private readonly runtimeAdapter: PageRuntimeAdapter;
	private readonly runtimeOptions?: Readonly<PageRuntimeConfiguration>;
	private resolveReady!: () => void;
	private rejectReady!: (error: Error) => void;
	private resolveExited!: () => void;
	private startupTimer: ReturnType<typeof setTimeout>;
	private heartbeatTimer?: ReturnType<typeof setTimeout>;
	private heartbeat = 0;
	private commands = 0;
	private stderrBytes = 0;
	private ended = false;
	private failure?: AgentBrowserError;
	private information?: SessionProcessInfo;

	private constructor(
		root: string,
		options: SessionProcessOptions,
		identity: Readonly<BrowserIdentityOptions>,
		runtime: ReturnType<typeof pageRuntimeRequest>,
	) {
		this.runtimeAdapter = runtime.adapter;
		this.runtimeOptions = runtime.runtimeOptions;
		if (
			options.websiteScripts !== undefined &&
			options.websiteScripts !== "classic" &&
			options.websiteScripts !== "module"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid website script mode",
			);
		if (
			options.websiteScripts === "module" &&
			this.runtimeAdapter !== "extension"
		)
			throw new AgentBrowserError(
				"unsupported",
				"Module website scripts require the extension page runtime",
			);
		this.session = parseInvocation(["capabilities"], {
			AGENT_BROWSER_SESSION: options.session,
		}).session;
		this.timeout = options.commandTimeoutMs ?? 30_000;
		this.heartbeatTimeout = options.heartbeatTimeoutMs ?? 2000;
		this.maxPending = options.maxPendingCommands ?? 8;
		const startup = options.startupTimeoutMs ?? 5000;
		for (const [value, minimum, maximum] of [
			[this.timeout, 20, 300_000],
			[this.heartbeatTimeout, 100, 10_000],
			[startup, 20, 60_000],
			[this.maxPending, 1, 8],
		]) {
			if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid session process bounds",
				);
		}
		const args = processArguments(
			root,
			fileURLToPath(new URL("./node-session-child.js", import.meta.url)),
			options.maxOldSpaceMiB ?? 128,
		);
		const initialize = scriptFrame({
			schemaVersion: 1,
			type: "initialize",
			packageRoot: root,
			identity,
			runtimeAdapter: this.runtimeAdapter,
			...(this.runtimeOptions ? { runtimeOptions: this.runtimeOptions } : {}),
			session: this.session,
			heartbeatMs: Math.max(
				25,
				Math.min(250, Math.floor(this.heartbeatTimeout / 4)),
			),
			scripts: options.scripts,
			websiteScripts: options.websiteScripts,
			network: options.network,
		});
		this.ready = new Promise((resolve, reject) => {
			this.resolveReady = resolve;
			this.rejectReady = reject;
		});
		this.exited = new Promise((resolve) => {
			this.resolveExited = resolve;
		});
		this.child = spawn(process.execPath, args, {
			cwd: root,
			env: {},
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.startupTimer = setTimeout(
			() =>
				this.terminate(
					new AgentBrowserError("timeout", "Session process startup timed out"),
				),
			startup,
		);
		this.child.once("error", () =>
			this.terminate(
				new AgentBrowserError("unsupported", "Session process could not start"),
			),
		);
		this.child.stdin.on("error", () =>
			this.terminate(
				new AgentBrowserError("closed", "Session process input closed"),
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
								"Invalid session process response",
							),
				);
			}
		});
		this.child.stdout.once("end", () => {
			try {
				this.decoder.finish();
			} catch {
				this.terminate(
					new AgentBrowserError(
						"invalid-input",
						"Incomplete session process response",
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
						"Session diagnostic output limit exceeded",
					),
				);
		});
		this.child.once("close", () => {
			this.ended = true;
			clearTimeout(this.startupTimer);
			clearTimeout(this.heartbeatTimer);
			this.failure ??= new AgentBrowserError(
				"closed",
				"Session process exited",
			);
			this.rejectReady(this.failure);
			for (const pending of this.pending.values()) {
				clearTimeout(pending.timer);
				pending.cleanup();
				pending.reject(this.failure);
			}
			this.pending.clear();
			this.resolveExited();
		});
		this.child.stdin.write(initialize);
	}

	static async create(options: SessionProcessOptions) {
		const runtime = pageRuntimeRequest(options, "runtimeAdapter");
		const runtimeAdapter = runtime.adapter;
		if (
			options?.websiteScripts !== undefined &&
			options.websiteScripts !== "classic" &&
			options.websiteScripts !== "module"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid website script mode",
			);
		if (options?.websiteScripts === "module" && runtimeAdapter !== "extension")
			throw new AgentBrowserError(
				"unsupported",
				"Module website scripts require the extension page runtime",
			);
		const identity = sessionIdentityOptions(options?.identity);
		const root = await processReadRoot(options?.packageRoot);
		const actor = new BrowserSessionProcess(root, options, identity, runtime);
		try {
			await actor.ready;
			return actor;
		} catch (error) {
			await actor.close();
			throw error;
		}
	}

	async execute(
		argv: readonly string[],
		options: CommandRequestOptions = {},
	): Promise<CommandResult> {
		if (this.failure) {
			await this.exited;
			throw this.failure;
		}
		if (
			!Array.isArray(argv) ||
			argv.length > 256 ||
			argv.some((value) => typeof value !== "string") ||
			!options ||
			(options.signal !== undefined && !(options.signal instanceof AbortSignal))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid session process command",
			);
		const invocation = parseInvocation(argv, {
			AGENT_BROWSER_SESSION: options.session ?? this.session,
		});
		if (invocation.session !== this.session)
			throw new AgentBrowserError(
				"invalid-input",
				"A session process owns exactly one named session",
			);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Session command aborted");
		const requestedTimeout = Number(invocation.options.timeout ?? this.timeout);
		if (
			!Number.isSafeInteger(requestedTimeout) ||
			requestedTimeout < 1 ||
			requestedTimeout > 300_000
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid session command timeout",
			);
		if (this.pending.size >= this.maxPending)
			throw new AgentBrowserError(
				"resource-limit",
				"Pending session command limit exceeded",
			);
		const id = this.commands + 1;
		const frame = scriptFrame({ schemaVersion: 1, type: "command", id, argv });
		if (Buffer.byteLength(frame) > 262_144)
			throw new AgentBrowserError(
				"resource-limit",
				"Session command input limit exceeded",
			);
		return new Promise((resolve, reject) => {
			const abort = () =>
				this.terminate(
					new AgentBrowserError("aborted", "Session command aborted"),
				);
			this.pending.set(id, {
				command: invocation.command,
				resolve,
				reject,
				timer: setTimeout(
					() =>
						this.terminate(
							new AgentBrowserError(
								"timeout",
								"Session command hard deadline exceeded",
							),
						),
					Math.min(this.timeout, requestedTimeout),
				),
				cleanup: () => options.signal?.removeEventListener("abort", abort),
			});
			this.commands = id;
			options.signal?.addEventListener("abort", abort, { once: true });
			this.child.stdin.write(frame);
		});
	}

	info(): SessionProcessInfo {
		if (!this.information)
			throw new AgentBrowserError("closed", "Session process is not ready");
		return {
			...this.information,
			permissions: { ...this.information.permissions },
		};
	}

	metrics() {
		return {
			pid: this.child.pid,
			commands: this.commands,
			pending: this.pending.size,
			closed: this.ended,
			terminating: !!this.failure && !this.ended,
			failure: this.failure?.code,
			stderrBytes: this.stderrBytes,
		};
	}

	async close() {
		this.terminate(new AgentBrowserError("closed", "Session process closed"));
		await this.exited;
	}

	private terminate(error: AgentBrowserError) {
		if (this.failure) return;
		this.failure = error;
		clearTimeout(this.startupTimer);
		clearTimeout(this.heartbeatTimer);
		this.child.kill("SIGKILL");
	}

	private watchHeartbeat() {
		clearTimeout(this.heartbeatTimer);
		this.heartbeatTimer = setTimeout(
			() =>
				this.terminate(
					new AgentBrowserError(
						"timeout",
						"Session process heartbeat deadline exceeded",
					),
				),
			this.heartbeatTimeout,
		);
	}

	private receive(raw: unknown) {
		if (this.failure) return;
		if (!raw || typeof raw !== "object") throw new Error("Invalid frame");
		const message = raw as Record<string, unknown>;
		if (message.schemaVersion !== 1) throw new Error("Invalid version");
		if (message.type === "fatal") {
			this.terminate(
				new AgentBrowserError(
					errorCodes.has(message.code as ErrorCode)
						? (message.code as ErrorCode)
						: "unsupported",
					"Session process failed",
				),
			);
			return;
		}
		if (message.type === "ready" && !this.information) {
			const info = message as unknown as SessionProcessInfo;
			const runtimeOptions = pageRuntimeConfiguration(
				info.runtimeOptions,
				"extension",
			);
			if (
				info.pid !== this.child.pid ||
				info.session !== this.session ||
				typeof info.version !== "string" ||
				!/^[0-9][0-9A-Za-z.+-]{0,63}$/.test(info.version) ||
				!["@poe-code/safe-js", "@poe-platform/safe-js", "poe-code"].includes(
					info.packageName,
				) ||
				info.runtimeAdapter !== this.runtimeAdapter ||
				info.runtimeValidation !== "contract-shape-only" ||
				JSON.stringify(runtimeOptions) !==
					JSON.stringify(this.runtimeOptions) ||
				info.publicExport !==
					(info.packageName === "poe-code" ? "./safe-js" : "./core") ||
				!hasRestrictedPermissions(info.permissions)
			)
				throw new Error("Invalid process information");
			this.information = {
				pid: info.pid,
				session: info.session,
				version: info.version,
				packageName: info.packageName,
				runtimeAdapter: info.runtimeAdapter,
				runtimeValidation: info.runtimeValidation,
				...(runtimeOptions ? { runtimeOptions } : {}),
				publicExport: info.publicExport,
				permissions: { ...info.permissions },
			};
			clearTimeout(this.startupTimer);
			this.watchHeartbeat();
			this.resolveReady();
			return;
		}
		if (!this.information) throw new Error("Process not ready");
		if (message.type === "heartbeat") {
			if (message.sequence !== this.heartbeat + 1)
				throw new Error("Invalid heartbeat sequence");
			this.heartbeat++;
			this.watchHeartbeat();
			return;
		}
		const pending = this.pending.get(message.id as number);
		if (!pending || !["result", "failure"].includes(String(message.type)))
			throw new Error("Unexpected command result");
		if (message.type === "result") {
			const result = message.result as CommandResult;
			if (
				!result ||
				result.schemaVersion !== 1 ||
				result.command !== pending.command ||
				result.session !== this.session ||
				!Object.hasOwn(result, "data")
			)
				throw new Error("Invalid command result");
			pending.resolve(result);
		} else {
			if (!errorCodes.has(message.code as ErrorCode))
				throw new Error("Invalid command failure");
			pending.reject(
				new AgentBrowserError(
					message.code as ErrorCode,
					"Session command failed",
				),
			);
		}
		this.pending.delete(message.id as number);
		clearTimeout(pending.timer);
		pending.cleanup();
	}
}
