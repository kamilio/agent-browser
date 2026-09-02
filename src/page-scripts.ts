import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { type ConsoleLimits, PageConsole } from "./page-console.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
import { PageTimers, type TimerLimits } from "./page-timers.js";
import {
	type SafeJsBudget,
	type ScriptEvaluation,
	type ScriptLimits,
	scriptJsonResult,
	scriptLimits,
} from "./safejs.js";
import {
	ScriptDom,
	type ScriptHostObjectFactory,
	domString,
} from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";
import type { SessionPage } from "./session.js";

export interface PageRealm {
	readonly closed: boolean;
	evaluate(
		source: string,
		options?: { signal?: AbortSignal; filename?: string },
	): Promise<{ returnValue?: unknown }>;
	close(): Promise<void>;
}

export interface PageRealmOptions {
	bindings: Record<string, unknown>;
	budget: SafeJsBudget;
	signal: AbortSignal;
	maxSourceLength: number;
	maxEvaluations: number;
	sink: { log(...values: unknown[]): void; error(...values: unknown[]): void };
}

export interface PageScriptCore extends ScriptHostObjectFactory {
	Budget: new (options: {
		maxSteps: number;
		maxCallDepth?: number;
		stringLength?: number;
		arrayLength?: number;
		dataSize?: number;
	}) => SafeJsBudget;
	SandboxError: new (
		...args: never[]
	) => Error & { code: string; budget?: string };
	createRealm(options: PageRealmOptions): PageRealm;
	startCallback: ScriptCallbackRuntime["startCallback"];
	deepCopyFromSandbox(value: unknown): unknown;
	retainGuestArguments<
		Operation extends (...args: readonly unknown[]) => unknown,
	>(operation: Operation, from: number): Operation;
	releaseGuestReference(value: unknown): boolean;
}

export interface PageScriptOptions {
	fetch?: PageFetchTransport;
	fetchLimits?: Partial<PageFetchLimits>;
	limits?: Partial<ScriptLimits>;
	maxPendingCallbacks?: number;
	consoleLimits?: Partial<ConsoleLimits>;
	timerLimits?: Partial<TimerLimits>;
}

const ownedDocuments = new WeakSet<DocumentTree>();

export class PageScripts {
	readonly dom: ScriptDom;
	readonly window: object;
	readonly console: PageConsole;
	readonly timers: PageTimers;
	readonly network?: PageFetch;
	readonly limits: Readonly<ScriptLimits>;
	private readonly budget: SafeJsBudget;
	private readonly lifetime = new AbortController();
	private readonly pending = new Set<Promise<unknown>>();
	private readonly prefixes = new Set<Promise<void>>();
	private readonly maxPending: number;
	private realm?: PageRealm;
	private active?: AbortController;
	private closing?: Promise<void>;
	private closedValue = false;
	private evaluations = 0;
	private consoleCalls = 0;
	private unregisterClose: () => void = () => {};

	constructor(
		page: Pick<SessionPage, "document" | "interactions">,
		private readonly core: PageScriptCore,
		options: PageScriptOptions = {},
	) {
		if (
			!core ||
			![
				core.Budget,
				core.SandboxError,
				core.createRealm,
				core.createHostObject,
				core.startCallback,
				core.deepCopyFromSandbox,
				core.retainGuestArguments,
				core.releaseGuestReference,
			].every((value) => typeof value === "function")
		)
			throw new AgentBrowserError(
				"unsupported",
				"The extended public SafeJS core is required",
			);
		if (!options || typeof options !== "object" || Array.isArray(options))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page script options",
			);
		this.limits = scriptLimits(options.limits);
		this.maxPending = options.maxPendingCallbacks ?? 128;
		if (
			!Number.isSafeInteger(this.maxPending) ||
			this.maxPending < 1 ||
			this.maxPending > 1024
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid pending callback limit",
			);
		if (ownedDocuments.has(page.document))
			throw new AgentBrowserError(
				"invalid-input",
				"Script document is already owned",
			);
		const events = page.interactions.events;
		const windowTarget = events.windowTarget;
		if (
			events.documentRoot !== page.document.root ||
			windowTarget === null ||
			events.metrics().closed
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Page scripts require this document's active Window dispatcher",
			);
		this.budget = new core.Budget({
			maxSteps: this.limits.maxSteps,
			maxCallDepth: this.limits.maxCallDepth,
			stringLength: this.limits.maxStringLength,
			arrayLength: this.limits.maxArrayLength,
			dataSize: this.limits.maxDataSize,
		});
		ownedDocuments.add(page.document);
		this.unregisterClose = page.document.onClose(() => {
			void this.close().catch(() => undefined);
		});
		try {
			if (options.fetch !== undefined) {
				if (typeof options.fetch !== "function")
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid page fetch transport",
					);
				this.network = new PageFetch(page.document, core, options.fetch, {
					limits: options.fetchLimits,
				});
			}
			this.timers = new PageTimers(
				{
					isClosed: () => this.closed,
					startCallback: (callback, args, value) =>
						this.startCallback(callback, args, value),
				},
				() => this.window,
				(error) => {
					if (error !== undefined) this.recordFailure("callback", error);
					void this.close().catch(() => undefined);
				},
				options.timerLimits,
				(value) => core.releaseGuestReference(value),
			);
			core.retainGuestArguments(this.timers.methods.setTimeout, 2);
			core.retainGuestArguments(this.timers.methods.setInterval, 2);
			this.window = core.createHostObject({
				properties: {
					console: { get: () => this.console.object },
					document: { get: () => this.dom.document },
					window: { get: () => this.window },
					self: { get: () => this.window },
					top: { get: () => this.window },
					parent: { get: () => this.window },
				},
				methods: {
					...(this.network ? { fetch: this.network.fetch } : {}),
					...this.timers.methods,
					addEventListener: (type, callback, value) => {
						this.ensureOpen();
						this.dom.eventBindings?.add(
							windowTarget,
							domString(type),
							callback,
							value,
						);
					},
					removeEventListener: (type, callback, value) => {
						this.ensureOpen();
						this.dom.eventBindings?.remove(
							windowTarget,
							domString(type),
							callback,
							value,
						);
					},
				},
			});
			this.dom = new ScriptDom(page.document, core, {
				events,
				window: this.window,
				callbacks: {
					isClosed: () => this.closed,
					startCallback: (callback, args, value) =>
						this.startCallback(callback, args, value),
				},
			});
			this.console = new PageConsole(page.document, core, {
				limits: options.consoleLimits,
				isClosed: () => this.closed,
				onCall: () => {
					this.consoleCalls++;
				},
				describe: (value) => this.dom.consoleLabel(value),
			});
			const record = (level: "log" | "error", values: unknown[]) => {
				if (this.closed) return;
				this.consoleCalls++;
				this.console.buffer.write(level, values);
			};
			this.realm = core.createRealm({
				bindings: {
					...(this.network ? { fetch: this.network.fetch } : {}),
					...this.timers.methods,
					console: this.console.object,
					document: this.dom.document,
					window: this.window,
					self: this.window,
				},
				budget: this.budget,
				signal: this.lifetime.signal,
				maxSourceLength: this.limits.maxSourceCodeUnits,
				maxEvaluations: this.limits.maxRuns,
				sink: {
					log: (...values) => record("log", values),
					error: (...values) => record("error", values),
				},
			});
		} catch (error) {
			void this.close().catch(() => undefined);
			throw error;
		}
	}

	get closed() {
		return this.closedValue || this.realm?.closed === true;
	}

	async evaluate(
		source: string,
		options: {
			signal?: AbortSignal;
			filename?: string;
			discardResult?: boolean;
		} = {},
	): Promise<ScriptEvaluation> {
		this.ensureOpen();
		if (
			!options ||
			(options.signal !== undefined &&
				!(options.signal instanceof AbortSignal)) ||
			typeof source !== "string" ||
			(options.discardResult !== undefined &&
				typeof options.discardResult !== "boolean")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page script evaluation",
			);
		if (
			options.filename !== undefined &&
			(typeof options.filename !== "string" || options.filename.length > 4096)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid script source label",
			);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Page script request was aborted");
		if (this.active)
			throw new AgentBrowserError(
				"invalid-input",
				"Concurrent page source evaluation is not supported",
			);
		if (
			source.length > this.limits.maxSourceCodeUnits ||
			this.evaluations >= this.limits.maxRuns
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Page script source or evaluation limit exceeded",
			);
		const realm = this.realm;
		if (!realm)
			throw new AgentBrowserError("closed", "Page realm is unavailable");
		const controller = new AbortController();
		const abort = () => controller.abort();
		let timedOut = false;
		this.active = controller;
		this.evaluations++;
		options.signal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, this.limits.timeoutMs);
		const interrupted = async () => {
			if (!controller.signal.aborted) return;
			await this.close();
			throw new AgentBrowserError(
				timedOut ? "timeout" : options.signal?.aborted ? "aborted" : "closed",
				"Page script execution was interrupted",
			);
		};
		try {
			while (this.prefixes.size) {
				await this.waitForPrefixes(controller.signal);
				await interrupted();
			}
			this.ensureOpen();
			const evaluated = await realm.evaluate(source, {
				signal: controller.signal,
				filename: options.filename,
			});
			await interrupted();
			const copied = options.discardResult
				? undefined
				: await this.core.deepCopyFromSandbox(evaluated.returnValue);
			await interrupted();
			return {
				engine: "poe-safe-js",
				partial: true,
				ok: true,
				...(copied === undefined
					? {}
					: { value: scriptJsonResult(copied, this.limits.maxResultBytes) }),
				metrics: this.evaluationMetrics(),
			};
		} catch (error) {
			await interrupted();
			this.recordFailure("evaluation", error);
			if (realm.closed) await this.close();
			if (error instanceof AgentBrowserError) throw error;
			const known = error instanceof this.core.SandboxError;
			return {
				engine: "poe-safe-js",
				partial: true,
				ok: false,
				error: {
					code:
						known && /^[A-Za-z_-]{1,64}$/.test(error.code)
							? error.code
							: "script-error",
					...(known &&
					typeof error.budget === "string" &&
					/^[A-Za-z]{1,32}$/.test(error.budget)
						? { budget: error.budget }
						: {}),
				},
				metrics: this.evaluationMetrics(),
			};
		} finally {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", abort);
			if (this.active === controller) this.active = undefined;
		}
	}

	metrics() {
		return Object.freeze({
			...this.evaluationMetrics(),
			evaluations: this.evaluations,
			pendingCallbacks: this.pending.size,
			active: !!this.active,
			closed: this.closed,
			...(this.network ? { fetch: this.network.metrics() } : {}),
		});
	}

	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closedValue = true;
		this.closing = Promise.resolve().then(async () => {
			await this.realm?.close();
			this.pending.clear();
			this.prefixes.clear();
		});
		this.active?.abort();
		this.lifetime.abort();
		this.timers?.close();
		this.network?.close();
		this.dom?.close();
		this.unregisterClose();
		return this.closing;
	}

	private startCallback(
		callback: unknown,
		args: readonly unknown[],
		options: { thisValue: unknown },
	) {
		this.ensureOpen();
		if (this.pending.size >= this.maxPending) {
			const error = new AgentBrowserError(
				"resource-limit",
				"Pending page callback limit exceeded",
			);
			this.recordFailure("callback", error);
			void this.close().catch(() => undefined);
			throw error;
		}
		let invocation: ReturnType<ScriptCallbackRuntime["startCallback"]>;
		try {
			invocation = this.core.startCallback(callback, args, options);
		} catch (error) {
			this.recordFailure("callback", error);
			if (this.realm?.closed) void this.close().catch(() => undefined);
			throw error;
		}
		this.pending.add(invocation.result);
		this.prefixes.add(invocation.synchronous);
		const prefixComplete = () => this.prefixes.delete(invocation.synchronous);
		void invocation.synchronous.then(prefixComplete, prefixComplete);
		const complete = () => {
			this.pending.delete(invocation.result);
			if (this.realm?.closed) void this.close().catch(() => undefined);
		};
		void invocation.result.then(complete, (error) => {
			this.recordFailure("callback", error);
			complete();
		});
		return invocation;
	}

	private recordFailure(source: "evaluation" | "callback", error: unknown) {
		if (this.closedValue) return;
		const code =
			(error instanceof this.core.SandboxError ||
				error instanceof AgentBrowserError) &&
			typeof error.code === "string" &&
			/^[A-Za-z_-]{1,64}$/.test(error.code)
				? error.code
				: "script-error";
		this.console.buffer.write(
			"error",
			[`Page ${source} failed: ${code}`],
			source,
		);
	}

	private async waitForPrefixes(signal: AbortSignal) {
		let abort = () => {};
		const interrupted = new Promise<void>((resolve) => {
			abort = resolve;
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) resolve();
		});
		try {
			await Promise.race([Promise.allSettled([...this.prefixes]), interrupted]);
		} finally {
			signal.removeEventListener("abort", abort);
		}
	}

	private evaluationMetrics() {
		return {
			steps: this.budget.stepsUsed,
			peakCallDepth: this.budget.peakCallDepth,
			peakDataSize: this.budget.peakDataSize,
			consoleCalls: this.consoleCalls,
			timers: this.timers.metrics(),
		};
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page scripts are closed");
	}
}
