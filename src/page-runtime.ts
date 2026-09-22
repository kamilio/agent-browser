import type { BrowserIdentity } from "./browser-identity.js";
import { AgentBrowserError } from "./errors.js";
import type {
	HtmlClassicScriptRequest,
	HtmlModuleRequest,
	HtmlModuleSource,
} from "./html-module.js";
import type { PageBindingContext } from "./page-bindings.js";
import type { PageNetworkModuleOptions } from "./page-network-modules.js";
import type { SafeJsBudget, ScriptLimits } from "./safejs.js";
import type { ScriptCallbackRuntime } from "./script-events.js";
import type {
	WorkerImportFetch,
	WorkerImportPolicy,
	WorkerScriptFetch,
} from "./worker-fetch.js";

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

export interface PageScriptCore extends PageBindingContext {
	Budget: new (options: {
		maxSteps: number;
		maxCallDepth?: number;
		stringLength?: number;
		regexSourceLength?: number;
		regexCompileAllocations?: number;
		arrayLength?: number;
		dataSize?: number;
	}) => SafeJsBudget;
	SandboxError: new (
		...args: never[]
	) => Error & { code: string; budget?: string };
	createRealm(options: PageRealmOptions): PageRealm;
	startCallback: ScriptCallbackRuntime["startCallback"];
	deepCopyFromSandbox(value: unknown): unknown;
	releaseGuestReference(value: unknown): boolean;
}

export interface PageRuntimeError {
	code: string;
	budget?: string;
}

export type PageRuntimeResult =
	| { ok: true; returnValue?: unknown }
	| { ok: false; error: PageRuntimeError };

export interface PageRuntimeEvaluationOptions {
	signal: AbortSignal;
	filename?: string;
	classicScriptId?: string;
	sourceType?: "module";
	discardResult?: boolean;
}

export interface PageSourceModuleStatus {
	readonly pendingImports: number;
	readonly preparedModules: number;
	readonly fulfilledImports: number;
	readonly rejectedImports: number;
}

export interface PageRuntime {
	readonly budget: SafeJsBudget;
	readonly closed: boolean;
	readonly supportsSourceModules?: boolean;
	sourceModuleStatus?(): Readonly<PageSourceModuleStatus> | undefined;
	prepareModule?(request: HtmlModuleRequest): Promise<HtmlModuleSource>;
	prepareClassicScript?(
		request: HtmlClassicScriptRequest,
	): Promise<HtmlModuleSource>;
	initialize(): Promise<void>;
	evaluate(
		source: string,
		options: PageRuntimeEvaluationOptions,
	): Promise<PageRuntimeResult>;
	copyResult(value: unknown): unknown;
	startCallback: ScriptCallbackRuntime["startCallback"];
	errorDetails(error: unknown): PageRuntimeError;
	close(): Promise<void>;
}

export interface PageRuntimeOptions {
	workerFetch?: WorkerScriptFetch;
	workerImportFetch?: WorkerImportFetch;
	workerImportPolicy?: WorkerImportPolicy;
	workerPolicy?: (url: string, redirects?: number) => void;
	workerDocumentUrl?: string;
	workerIdentity?: Readonly<BrowserIdentity>;
	stringCompilation?: "allow" | "deny";
	wasmCompilation?: "allow" | "deny";
	regexSourceLength?: number;
	regexCompileAllocations?: number;
	initializationSource?: string;
	networkSourceModules?: PageNetworkModuleOptions;
	limits: Readonly<ScriptLimits>;
	signal: AbortSignal;
	globals: readonly string[];
	onClosed(): void;
	setup(context: PageBindingContext): Record<string, unknown>;
	sink: PageRealmOptions["sink"];
}

export interface PageRuntimeFactory {
	readonly supportsPageInitialization?: boolean;
	createPageRuntime(options: PageRuntimeOptions): PageRuntime;
}

export function readPageStringCompilation(
	options: PageRuntimeOptions,
): "allow" | "deny" | undefined {
	const descriptor = Object.getOwnPropertyDescriptor(
		options,
		"stringCompilation",
	);
	if (
		descriptor
			? !Object.hasOwn(descriptor, "value") ||
				!descriptor.enumerable ||
				(descriptor.value !== "allow" && descriptor.value !== "deny")
			: "stringCompilation" in options
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid per-page guest string compilation policy",
		);
	return descriptor?.value;
}

export function readPageWasmCompilation(
	options: PageRuntimeOptions,
): "allow" | "deny" | undefined {
	const descriptor = Object.getOwnPropertyDescriptor(
		options,
		"wasmCompilation",
	);
	if (
		descriptor
			? !Object.hasOwn(descriptor, "value") ||
				!descriptor.enumerable ||
				(descriptor.value !== "allow" && descriptor.value !== "deny")
			: "wasmCompilation" in options
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid per-page WASM compilation policy",
		);
	return descriptor?.value;
}

export function legacyPageRuntime(core: PageScriptCore): PageRuntimeFactory {
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
		].every((operation) => typeof operation === "function")
	)
		throw new AgentBrowserError(
			"unsupported",
			"The extended public SafeJS core is required",
		);
	return {
		createPageRuntime(options) {
			if (readPageWasmCompilation(options) !== undefined)
				throw new AgentBrowserError(
					"unsupported",
					"Per-page WASM compilation policy requires the extension runtime",
				);
			if (readPageStringCompilation(options) !== undefined)
				throw new AgentBrowserError(
					"unsupported",
					"Per-page string compilation policy requires the extension runtime",
				);
			if (options.initializationSource !== undefined)
				throw new AgentBrowserError(
					"unsupported",
					"Page initialization source requires the extension runtime",
				);
			if (options.networkSourceModules !== undefined)
				throw new AgentBrowserError(
					"unsupported",
					"Network source modules require the extension page runtime",
				);
			const budget = new core.Budget({
				maxSteps: options.limits.maxSteps,
				maxCallDepth: options.limits.maxCallDepth,
				stringLength: options.limits.maxStringLength,
				...(options.regexSourceLength === undefined
					? {}
					: { regexSourceLength: options.regexSourceLength }),
				...(options.regexCompileAllocations === undefined
					? {}
					: { regexCompileAllocations: options.regexCompileAllocations }),
				arrayLength: options.limits.maxArrayLength,
				dataSize: options.limits.maxDataSize,
			});
			const bindings = options.setup(core);
			const realm = core.createRealm({
				bindings,
				budget,
				signal: options.signal,
				maxSourceLength: options.limits.maxSourceCodeUnits,
				maxEvaluations: options.limits.maxRuns,
				sink: options.sink,
			});
			return {
				budget,
				get closed() {
					return realm.closed;
				},
				async initialize() {},
				async evaluate(source, options) {
					if (options.sourceType !== undefined)
						throw new AgentBrowserError(
							"unsupported",
							"The legacy page runtime does not support source modules",
						);
					const result = await realm.evaluate(source, options);
					return { ok: true, returnValue: result.returnValue };
				},
				copyResult: (value) => core.deepCopyFromSandbox(value),
				startCallback: (callback, args, receiver) =>
					core.startCallback(callback, args, receiver),
				errorDetails(error) {
					return error instanceof core.SandboxError
						? { code: error.code, budget: error.budget }
						: { code: "script-error" };
				},
				close: () => realm.close(),
			};
		},
	};
}
