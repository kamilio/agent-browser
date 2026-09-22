import { documentResourceCsp } from "./document-resource-csp.js";
import {
	type DocumentScriptCsp,
	documentScriptCsp,
} from "./document-script-csp.js";
import { existingDocumentWebSockets } from "./document-websocket-owner.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type HtmlClassicScriptRequest,
	type HtmlModuleRequest,
	type HtmlModuleSource,
	moduleInputData,
} from "./html-module.js";
import {
	type PageBindingOptions,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { pageDomConstructorBootstrapSource } from "./page-dom-constructor-bootstrap.js";
import { pageEventBootstrapSource } from "./page-event-bootstrap.js";
import type { PageNetworkModuleOptions } from "./page-network-modules.js";
import { PageClock } from "./page-performance.js";
import {
	type PageRuntime,
	type PageRuntimeError,
	type PageRuntimeFactory,
	type PageScriptCore,
	legacyPageRuntime,
} from "./page-runtime.js";
import { pageWebSocketBootstrapSource } from "./page-websocket-bootstrap.js";
import { pageXmlHttpRequestBootstrapSource } from "./page-xml-http-request-bootstrap.js";
import {
	type ScriptBudgetProfile,
	type ScriptEvaluation,
	type ScriptLimits,
	scriptJsonResult,
	scriptLimits,
} from "./safejs.js";
import type { ScriptCallbackRuntime } from "./script-events.js";
import type { SessionPage } from "./session.js";
import type { WorkerScriptFetch } from "./worker-fetch.js";

export type {
	PageRealm,
	PageRealmOptions,
	PageScriptCore,
} from "./page-runtime.js";

export interface PageScriptOptions extends PageBindingOptions {
	workerFetch?: WorkerScriptFetch;
	budgetProfile?: ScriptBudgetProfile;
	networkSourceModules?: PageNetworkModuleOptions;
	limits?: Partial<ScriptLimits>;
	maxPendingCallbacks?: number;
}

const ownedDocuments = new WeakSet<DocumentTree>();

export class PageScripts {
	readonly limits: Readonly<ScriptLimits>;
	private readonly lifetime = new AbortController();
	private readonly clock = new PageClock();
	private readonly pending = new Set<symbol>();
	private readonly prefixes = new Set<Promise<void>>();
	private readonly maxPending: number;
	private runtime?: PageRuntime;
	private initialized = false;
	private bindings?: PageBindings;
	private active?: AbortController;
	private classicScriptTask = false;
	private closing?: Promise<void>;
	private closedValue = false;
	private evaluations = 0;
	private consoleCalls = 0;
	private unregisterClose: () => void = () => {};
	private unregisterPolicy: () => void = () => {};
	private readonly scriptPolicy?: DocumentScriptCsp;

	constructor(
		page: Pick<SessionPage, "document" | "interactions">,
		core: PageScriptCore | PageRuntimeFactory,
		options: PageScriptOptions = {},
	) {
		const factory =
			core &&
			typeof core === "object" &&
			"createPageRuntime" in core &&
			typeof core.createPageRuntime === "function"
				? core
				: legacyPageRuntime(core as PageScriptCore);
		if (!options || typeof options !== "object" || Array.isArray(options))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page script options",
			);
		const eventConstructors = factory.supportsPageInitialization === true;
		const xmlHttpRequests =
			factory.supportsPageInitialization === true &&
			options.fetch !== undefined;
		this.scriptPolicy = documentScriptCsp(page.document);
		if (this.scriptPolicy?.unsupported)
			throw new AgentBrowserError(
				"policy-denied",
				"Document script policy is unavailable",
			);
		const networkSourceModules = moduleInputData(
			options,
			"networkSourceModules",
			true,
		) as PageNetworkModuleOptions | undefined;
		const workerFetch = moduleInputData(options, "workerFetch", true) as
			| WorkerScriptFetch
			| undefined;
		if (workerFetch !== undefined && typeof workerFetch !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid Worker fetch configuration",
			);
		const budgetProfile = options.budgetProfile;
		this.limits = scriptLimits(options.limits, budgetProfile);
		if (networkSourceModules !== undefined) {
			const documentUrl = moduleInputData(networkSourceModules, "documentUrl");
			if (documentUrl !== page.document.url)
				throw new AgentBrowserError(
					"invalid-input",
					"Module configuration must belong to this document",
				);
		}
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
		ownedDocuments.add(page.document);
		this.unregisterClose = page.document.onClose(() => {
			void this.close().catch(() => undefined);
		});
		if (this.scriptPolicy)
			this.unregisterPolicy = this.scriptPolicy.onInvalidated(() => {
				void this.close().catch(() => undefined);
			});
		try {
			const record = (level: "log" | "error", values: unknown[]) => {
				if (this.closed) return;
				this.consoleCalls++;
				this.bindings?.console.buffer.write(level, values);
			};
			this.runtime = factory.createPageRuntime({
				workerFetch,
				workerDocumentUrl: page.document.url,
				workerPolicy: (url) => {
					this.ensureOpen();
					const resource = documentResourceCsp(page.document);
					if (resource) resource.check("worker", url);
					else if (this.scriptPolicy?.enforced)
						throw new AgentBrowserError("policy-denied", "Worker CSP is unavailable");
				},
				...(this.scriptPolicy?.stringCompilation === undefined
					? {}
					: { stringCompilation: this.scriptPolicy.stringCompilation }),
				...(budgetProfile === "large-source-v1" ||
				budgetProfile === "application-v1" ||
				budgetProfile === "application-unicode-v1"
					? {
							regexSourceLength:
								budgetProfile === "application-unicode-v1" ? 16384 : 8192,
							regexCompileAllocations:
								budgetProfile === "application-unicode-v1" ? 65536 : 32768,
						}
					: {}),
				...(existingDocumentWebSockets(page.document) ||
				xmlHttpRequests ||
				eventConstructors
					? {
							initializationSource:
								(eventConstructors ? pageEventBootstrapSource : "") +
								(eventConstructors ? pageDomConstructorBootstrapSource : "") +
								(existingDocumentWebSockets(page.document)
									? pageWebSocketBootstrapSource
									: "") +
								(xmlHttpRequests ? pageXmlHttpRequestBootstrapSource : ""),
						}
					: {}),
				...(networkSourceModules !== undefined ? { networkSourceModules } : {}),
				limits: this.limits,
				signal: this.lifetime.signal,
				globals: pageBindingGlobalNames(
					page.document,
					options,
					xmlHttpRequests,
					eventConstructors,
				),
				onClosed: () => {
					if (!this.active) void this.close().catch(() => undefined);
				},
				setup: (context) => {
					this.ensureOpen();
					if (this.bindings)
						throw new AgentBrowserError(
							"invalid-input",
							"Page runtime setup may run only once",
						);
					this.bindings = new PageBindings(
						page,
						context,
						{
							isClosed: () => this.closed,
							isBusy: () =>
								this.active !== undefined || this.prefixes.size !== 0,
							isTimerBusy: () =>
								this.classicScriptTask || this.prefixes.size !== 0,
							startCallback: (callback, args, receiver) =>
								this.startCallback(callback, args, receiver),
							fail: (error) => {
								if (error !== undefined) this.recordFailure("callback", error);
								void this.close().catch(() => undefined);
							},
							onConsoleCall: () => {
								this.consoleCalls++;
							},
						},
						options,
						this.clock,
						xmlHttpRequests,
						eventConstructors,
					);
					return this.bindings.globals;
				},
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
		return this.closedValue || this.runtime?.closed === true;
	}

	get dom() {
		return this.requireBindings().dom;
	}
	get window() {
		return this.requireBindings().window;
	}
	get console() {
		return this.requireBindings().console;
	}
	get timers() {
		return this.requireBindings().timers;
	}
	get network() {
		return this.requireBindings().network;
	}
	get location() {
		return this.requireBindings().location;
	}
	get history() {
		return this.requireBindings().history;
	}
	get storage() {
		return this.requireBindings().storage;
	}

	get supportsHtmlModules(): boolean {
		return !this.closed && typeof this.runtime?.prepareModule === "function";
	}

	get supportsHtmlClassicScripts(): boolean {
		return (
			!this.closed && typeof this.runtime?.prepareClassicScript === "function"
		);
	}

	async prepareClassicScript(
		request: HtmlClassicScriptRequest,
	): Promise<HtmlModuleSource> {
		this.ensureOpen();
		const runtime = this.runtime;
		if (!runtime?.prepareClassicScript)
			throw new AgentBrowserError(
				"unsupported",
				"Classic source admission requires an explicitly configured extension runtime",
			);
		const source = await runtime.prepareClassicScript(request);
		this.ensureOpen();
		return source;
	}

	async prepareModule(request: HtmlModuleRequest): Promise<HtmlModuleSource> {
		this.ensureOpen();
		const runtime = this.runtime;
		if (!runtime?.prepareModule)
			throw new AgentBrowserError(
				"unsupported",
				"HTML modules require an explicitly configured extension runtime",
			);
		const source = await runtime.prepareModule(request);
		this.ensureOpen();
		return source;
	}

	async evaluate(
		source: string,
		options: {
			signal?: AbortSignal;
			filename?: string;
			classicScriptId?: string;
			discardResult?: boolean;
			classicScriptTask?: boolean;
			sourceType?: "module";
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
		const filename = options.filename;
		const sourceType = options.sourceType;
		const classicScriptId = options.classicScriptId;
		if (
			classicScriptId !== undefined &&
			(typeof classicScriptId !== "string" ||
				classicScriptId.length > 4096 ||
				options.classicScriptTask !== true ||
				sourceType !== undefined)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid classic source identity",
			);
		if (
			(options.classicScriptTask !== undefined &&
				typeof options.classicScriptTask !== "boolean") ||
			(options.classicScriptTask === true && sourceType !== undefined)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid classic script task",
			);
		if (
			filename !== undefined &&
			(typeof filename !== "string" || filename.length > 4096)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid script source label",
			);
		if (sourceType !== undefined && (sourceType !== "module" || !filename))
			throw new AgentBrowserError(
				"invalid-input",
				"Source modules require an explicit source type and identity",
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
		const runtime = this.runtime;
		if (!runtime)
			throw new AgentBrowserError("closed", "Page realm is unavailable");
		if (sourceType === "module" && runtime.supportsSourceModules !== true)
			throw new AgentBrowserError(
				"unsupported",
				"The selected page runtime does not support source modules",
			);
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
			if (!this.initialized) {
				await this.initializeRuntime(runtime, controller.signal);
				await interrupted();
				this.requireBindings();
				this.initialized = true;
			}
			while (this.prefixes.size) {
				await this.waitForPrefixes(controller.signal);
				await interrupted();
			}
			this.ensureOpen();
			// Timers are tasks, so due callbacks wait until the classic script and
			// its microtask checkpoint return. Modules may await a timer directly.
			this.classicScriptTask = options.classicScriptTask === true;
			const evaluated = await runtime.evaluate(source, {
				signal: controller.signal,
				filename,
				...(classicScriptId === undefined ? {} : { classicScriptId }),
				...(options.discardResult === true ? { discardResult: true } : {}),
				...(sourceType === "module" ? { sourceType: "module" } : {}),
			});
			await interrupted();
			if (!evaluated.ok) {
				const error = this.safeError(evaluated.error);
				this.recordDiagnostic("evaluation", error);
				if (runtime.closed) await this.close();
				return {
					engine: "poe-safe-js",
					partial: true,
					ok: false,
					error,
					metrics: this.evaluationMetrics(),
				};
			}
			const copied = options.discardResult
				? undefined
				: await runtime.copyResult(evaluated.returnValue);
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
			if (!this.initialized || runtime.closed) await this.close();
			if (error instanceof AgentBrowserError) throw error;
			return {
				engine: "poe-safe-js",
				partial: true,
				ok: false,
				error: this.safeError(runtime.errorDetails(error)),
				metrics: this.evaluationMetrics(),
			};
		} finally {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", abort);
			if (this.active === controller) this.active = undefined;
			this.classicScriptTask = false;
			if (runtime.closed && !this.closedValue) await this.close();
			this.bindings?.scrolling.wake();
			this.bindings?.idleCallbacks.wake();
			this.bindings?.timers.wake();
		}
	}

	metrics() {
		return Object.freeze({
			...this.evaluationMetrics(),
			initialized: this.initialized,
			evaluations: this.evaluations,
			pendingCallbacks: this.pending.size,
			active: !!this.active,
			closed: this.closed,
			...(this.bindings ? { dom: this.bindings.dom.metrics() } : {}),
			...(this.bindings?.network
				? { fetch: this.bindings.network.metrics() }
				: {}),
		});
	}

	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closedValue = true;
		this.closing = Promise.resolve().then(async () => {
			try {
				await this.runtime?.close();
			} finally {
				this.pending.clear();
				this.prefixes.clear();
			}
		});
		this.active?.abort();
		this.lifetime.abort();
		this.bindings?.close();
		this.clock.close();
		this.unregisterClose();
		this.unregisterPolicy();
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
		const slot = Symbol("page-callback");
		let releasePrefix = () => {};
		const prefix = new Promise<void>((resolve) => {
			releasePrefix = resolve;
		});
		let prefixFinished = false;
		let resultFinished = false;
		this.pending.add(slot);
		this.prefixes.add(prefix);
		const prefixComplete = () => {
			if (prefixFinished) return;
			prefixFinished = true;
			this.prefixes.delete(prefix);
			releasePrefix();
			if (resultFinished) this.pending.delete(slot);
			this.bindings?.scrolling.wake();
			this.bindings?.idleCallbacks.wake();
			this.bindings?.timers.wake();
		};
		const complete = () => {
			resultFinished = true;
			if (prefixFinished) this.pending.delete(slot);
			if (this.runtime?.closed) void this.close().catch(() => undefined);
		};
		let invocation: ReturnType<ScriptCallbackRuntime["startCallback"]>;
		let started = false;
		try {
			if (!this.runtime)
				throw new AgentBrowserError("closed", "Page runtime is unavailable");
			const candidate = this.runtime.startCallback(callback, args, options);
			started = true;
			const synchronous = candidate?.synchronous;
			const result = candidate?.result;
			invocation = {
				synchronous: Promise.resolve(synchronous),
				result: Promise.resolve(result),
			};
			void invocation.synchronous.then(prefixComplete, prefixComplete);
			void invocation.result.then(complete, (error) => {
				this.recordFailure("callback", error);
				complete();
			});
			if (
				typeof synchronous?.then !== "function" ||
				typeof result?.then !== "function"
			)
				throw new AgentBrowserError(
					"unsupported",
					"Invalid page callback completion phases",
				);
		} catch (error) {
			resultFinished = true;
			prefixComplete();
			this.recordFailure("callback", error);
			if (started || this.runtime?.closed)
				void this.close().catch(() => undefined);
			throw error;
		}
		return invocation;
	}

	private recordFailure(source: "evaluation" | "callback", error: unknown) {
		this.recordDiagnostic(
			source,
			this.safeError(
				error instanceof AgentBrowserError
					? { code: error.code }
					: (this.runtime?.errorDetails(error) ?? { code: "script-error" }),
			),
		);
	}

	private safeError(error: PageRuntimeError): PageRuntimeError {
		return {
			code:
				typeof error?.code === "string" && /^[A-Za-z_-]{1,64}$/.test(error.code)
					? error.code
					: "script-error",
			...(typeof error?.budget === "string" &&
			/^[A-Za-z]{1,32}$/.test(error.budget)
				? { budget: error.budget }
				: {}),
		};
	}

	private recordDiagnostic(
		source: "evaluation" | "callback",
		error: PageRuntimeError,
	) {
		if (this.closedValue) return;
		const budget = error.budget ? ` (${error.budget})` : "";
		this.bindings?.console.buffer.write(
			"error",
			[`Page ${source} failed: ${error.code}${budget}`],
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
			steps: this.runtime?.budget.stepsUsed ?? 0,
			peakCallDepth: this.runtime?.budget.peakCallDepth ?? 0,
			peakDataSize: this.runtime?.budget.peakDataSize ?? 0,
			consoleCalls: this.consoleCalls,
			performance: this.clock.metrics(),
			...(this.bindings
				? {
						timers: this.bindings.timers.metrics(),
						animationFrames: this.bindings.animationFrames.metrics(),
						idleCallbacks: this.bindings.idleCallbacks.metrics(),
						media: this.bindings.media.metrics(),
						scrolling: this.bindings.scrolling.metrics(),
					}
				: {}),
		};
	}

	private async initializeRuntime(runtime: PageRuntime, signal: AbortSignal) {
		let abort = () => {};
		const interrupted = new Promise<void>((resolve) => {
			abort = resolve;
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) resolve();
		});
		try {
			await Promise.race([runtime.initialize(), interrupted]);
		} finally {
			signal.removeEventListener("abort", abort);
		}
	}

	private requireBindings() {
		if (!this.bindings)
			throw new AgentBrowserError(
				"invalid-input",
				"Page bindings have not been initialized by evaluation",
			);
		return this.bindings;
	}

	private ensureOpen() {
		if (this.scriptPolicy?.unsupported)
			void this.close().catch(() => undefined);
		if (this.closed)
			throw new AgentBrowserError("closed", "Page scripts are closed");
	}
}
