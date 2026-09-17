import { AgentBrowserError } from "./errors.js";
import type { PageBindingContext } from "./page-bindings.js";
import type { SafeJsBudget, ScriptLimits } from "./safejs.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

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
	sourceType?: "module";
}

export interface PageRuntime {
	readonly budget: SafeJsBudget;
	readonly closed: boolean;
	readonly supportsSourceModules?: boolean;
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
	limits: Readonly<ScriptLimits>;
	signal: AbortSignal;
	globals: readonly string[];
	onClosed(): void;
	setup(context: PageBindingContext): Record<string, unknown>;
	sink: PageRealmOptions["sink"];
}

export interface PageRuntimeFactory {
	createPageRuntime(options: PageRuntimeOptions): PageRuntime;
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
			const budget = new core.Budget({
				maxSteps: options.limits.maxSteps,
				maxCallDepth: options.limits.maxCallDepth,
				stringLength: options.limits.maxStringLength,
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
