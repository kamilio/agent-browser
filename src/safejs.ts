import { AgentBrowserError } from "./errors.js";
import type { PageTimers } from "./page-timers.js";

export interface SafeJsBudget {
	stepsUsed: number;
	peakCallDepth: number;
	peakDataSize: number;
}

export interface SafeJsSdk {
	Budget: new (options: {
		maxSteps: number;
		deadline: number;
		maxCallDepth: number;
		stringLength: number;
		arrayLength: number;
		dataSize: number;
	}) => SafeJsBudget;
	SandboxError: new (
		...args: never[]
	) => Error & { code: string; budget?: string };
	run(
		source: string,
		options: {
			budget: SafeJsBudget;
			bindings: Readonly<Record<string, unknown>>;
			modules: Readonly<Record<string, never>>;
			signal: AbortSignal;
			sink: {
				log: (...args: unknown[]) => void;
				error: (...args: unknown[]) => void;
			};
		},
	): Promise<{
		ok: boolean;
		returnValue?: unknown;
		error?: { code?: string };
		stats?: {
			nodeVisits: number;
			currentDataSize: number;
			peakDataSize: number;
		};
	}>;
	deepCopyFromSandbox(value: unknown): unknown;
}

export interface ScriptLimits {
	maxSourceCodeUnits: number;
	maxSteps: number;
	maxCallDepth: number;
	maxStringLength: number;
	maxArrayLength: number;
	maxDataSize: number;
	timeoutMs: number;
	maxRuns: number;
	maxResultBytes: number;
}

export type ScriptBudgetProfile =
	| "bounded-v1"
	| "large-source-v1"
	| "application-v1"
	| "application-unicode-v1"
	| "application-media-v1";

const defaults: ScriptLimits = {
	maxSourceCodeUnits: 262_144,
	maxSteps: 100_000,
	maxCallDepth: 64,
	maxStringLength: 262_144,
	maxArrayLength: 16_384,
	maxDataSize: 1_048_576,
	timeoutMs: 1000,
	maxRuns: 128,
	maxResultBytes: 65_536,
};

const largeSourceDefaults: Readonly<ScriptLimits> = Object.freeze({
	...defaults,
	maxSourceCodeUnits: 4_194_304,
	maxSteps: 16_000_000,
	maxCallDepth: 512,
	maxStringLength: 4_194_304,
	maxArrayLength: 262_144,
	maxDataSize: 16_777_216,
	timeoutMs: 16_000,
});

const applicationDefaults: Readonly<ScriptLimits> = Object.freeze({
	...largeSourceDefaults,
	timeoutMs: 120_000,
});

// Explicit opt-in for bounded WASM media heaps and their typed-array views.
const mediaDefaults: Readonly<ScriptLimits> = Object.freeze({
	...applicationDefaults,
	maxArrayLength: 33_554_432,
	maxDataSize: 33_554_432,
});

export function scriptLimits(
	overrides: Partial<ScriptLimits> = {},
	profile: ScriptBudgetProfile = "bounded-v1",
): Readonly<ScriptLimits> {
	if (
		profile !== "bounded-v1" &&
		profile !== "large-source-v1" &&
		profile !== "application-v1" &&
		profile !== "application-unicode-v1" &&
		profile !== "application-media-v1"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid script budget profile",
		);
	const application =
		profile === "application-v1" ||
		profile === "application-unicode-v1" ||
		profile === "application-media-v1";
	const profileDefaults =
		profile === "application-media-v1"
			? mediaDefaults
			: application
				? applicationDefaults
				: profile === "large-source-v1"
					? largeSourceDefaults
					: defaults;
	const limits = Object.freeze({
		...profileDefaults,
		...overrides,
	});
	for (const key of Object.keys(defaults) as (keyof ScriptLimits)[]) {
		let ceiling = defaults[key] * 16;
		if (
			profile === "application-media-v1" &&
			(key === "maxArrayLength" || key === "maxDataSize")
		)
			ceiling = mediaDefaults[key];
		if (profile !== "bounded-v1" && key === "maxSteps")
			ceiling = largeSourceDefaults.maxSteps;
		if (application && key === "timeoutMs")
			ceiling = applicationDefaults.timeoutMs;
		if (
			!Number.isSafeInteger(limits[key]) ||
			limits[key] < 1 ||
			limits[key] > ceiling
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid script runtime limit",
			);
	}
	return limits;
}

export interface ScriptEvaluation {
	engine: "poe-safe-js";
	partial: true;
	ok: boolean;
	value?: unknown;
	error?: { code: string; budget?: string };
	metrics: {
		steps: number;
		peakCallDepth: number;
		peakDataSize: number;
		consoleCalls: number;
		timers?: ReturnType<PageTimers["metrics"]>;
	};
}

export function scriptJsonResult(value: unknown, maxBytes: number): unknown {
	let nodes = 0;
	let bytes = 0;
	const active = new Set<object>();
	const visit = (input: unknown, depth: number): unknown => {
		if (++nodes > 16_384 || depth > 64)
			throw new AgentBrowserError(
				"resource-limit",
				"Script result structure limit exceeded",
			);
		if (input === undefined || input === null || typeof input === "boolean") {
			bytes += 5;
			return input;
		}
		if (typeof input === "number") {
			bytes += 32;
			if (!Number.isFinite(input))
				throw new AgentBrowserError(
					"unsupported",
					"Non-finite script result is not JSON",
				);
			return input;
		}
		if (typeof input === "string") {
			if (input.length > maxBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Script result string limit exceeded",
				);
			bytes += new TextEncoder().encode(input).length + 2;
			if (bytes > maxBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Script result byte limit exceeded",
				);
			return input;
		}
		if (typeof input !== "object" || active.has(input))
			throw new AgentBrowserError(
				"unsupported",
				"Script result is not an acyclic JSON value",
			);
		if (Array.isArray(input) && input.length > 16_384)
			throw new AgentBrowserError(
				"resource-limit",
				"Script result array limit exceeded",
			);
		if (
			!Array.isArray(input) &&
			![Object.prototype, null].includes(Object.getPrototypeOf(input))
		)
			throw new AgentBrowserError(
				"unsupported",
				"Script result object type is unsupported",
			);
		active.add(input);
		try {
			const result: unknown[] | Record<string, unknown> = Array.isArray(input)
				? []
				: Object.create(null);
			for (const key of Object.keys(input)) {
				const descriptor = Object.getOwnPropertyDescriptor(input, key);
				if (!descriptor || !("value" in descriptor))
					throw new AgentBrowserError(
						"unsupported",
						"Script result accessors are unsupported",
					);
				bytes += key.length * 3 + 4;
				if (bytes > maxBytes)
					throw new AgentBrowserError(
						"resource-limit",
						"Script result byte limit exceeded",
					);
				Object.defineProperty(result, key, {
					value: visit(descriptor.value, depth + 1),
					enumerable: true,
					writable: true,
					configurable: true,
				});
			}
			return result;
		} finally {
			active.delete(input);
		}
	};
	const result = visit(value, 0);
	if (
		bytes > maxBytes ||
		new TextEncoder().encode(JSON.stringify(result) ?? "").length > maxBytes
	)
		throw new AgentBrowserError(
			"resource-limit",
			"Script result byte limit exceeded",
		);
	return result;
}

export class SafeJsRuntime {
	readonly limits: Readonly<ScriptLimits>;
	private readonly sdk: SafeJsSdk;
	private closed = false;
	private runs = 0;
	private active?: AbortController;

	constructor(sdk: unknown, limits: Partial<ScriptLimits> = {}) {
		const candidate = sdk as SafeJsSdk | undefined;
		if (
			!candidate ||
			![
				candidate.run,
				candidate.Budget,
				candidate.SandboxError,
				candidate.deepCopyFromSandbox,
			].every((value) => typeof value === "function")
		)
			throw new AgentBrowserError(
				"unsupported",
				"Expected the public Poe SafeJS SDK",
			);
		this.sdk = candidate;
		this.limits = scriptLimits(limits);
	}

	async evaluate(
		source: string,
		options: {
			bindings?: Readonly<Record<string, unknown>>;
			signal?: AbortSignal;
		} = {},
	): Promise<ScriptEvaluation> {
		if (this.closed)
			throw new AgentBrowserError("closed", "Script runtime is closed");
		if (this.active)
			throw new AgentBrowserError(
				"invalid-input",
				"Concurrent script evaluation is not supported",
			);
		if (typeof source !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				"Script source must be a string",
			);
		if (
			!options ||
			(options.signal !== undefined && !(options.signal instanceof AbortSignal))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid script evaluation options",
			);
		if (
			source.length > this.limits.maxSourceCodeUnits ||
			this.runs >= this.limits.maxRuns
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Script source or run limit exceeded",
			);
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Script evaluation aborted");
		const controller = new AbortController();
		const abort = () => controller.abort();
		const budget = new this.sdk.Budget({
			maxSteps: this.limits.maxSteps,
			deadline: Date.now() + this.limits.timeoutMs,
			maxCallDepth: this.limits.maxCallDepth,
			stringLength: this.limits.maxStringLength,
			arrayLength: this.limits.maxArrayLength,
			dataSize: this.limits.maxDataSize,
		});
		options.signal?.addEventListener("abort", abort, { once: true });
		this.active = controller;
		this.runs++;
		const timer = setTimeout(abort, this.limits.timeoutMs);
		let consoleCalls = 0;
		const discard = () => {
			consoleCalls++;
		};
		const metrics = () => ({
			steps: budget.stepsUsed,
			peakCallDepth: budget.peakCallDepth,
			peakDataSize: budget.peakDataSize,
			consoleCalls,
		});
		const base = { engine: "poe-safe-js" as const, partial: true as const };
		try {
			const result = await this.sdk.run(source, {
				budget,
				bindings: options.bindings ?? Object.create(null),
				modules: Object.create(null),
				signal: controller.signal,
				sink: { log: discard, error: discard },
			});
			if (controller.signal.aborted)
				throw new AgentBrowserError("aborted", "Script evaluation aborted");
			if (!result.ok)
				return {
					...base,
					ok: false,
					error: {
						code: /^[A-Z_]{1,64}$/.test(result.error?.code ?? "")
							? (result.error?.code as string)
							: "script-error",
					},
					metrics: metrics(),
				};
			const copied =
				result.returnValue === undefined
					? undefined
					: await this.sdk.deepCopyFromSandbox(result.returnValue);
			if (controller.signal.aborted)
				throw new AgentBrowserError("aborted", "Script evaluation aborted");
			return {
				...base,
				ok: true,
				...(copied === undefined
					? {}
					: { value: scriptJsonResult(copied, this.limits.maxResultBytes) }),
				metrics: metrics(),
			};
		} catch (error) {
			if (error instanceof AgentBrowserError) throw error;
			if (controller.signal.aborted)
				throw new AgentBrowserError("aborted", "Script evaluation aborted");
			if (error instanceof this.sdk.SandboxError)
				return {
					...base,
					ok: false,
					error: {
						code: error.code,
						...(error.budget ? { budget: error.budget } : {}),
					},
					metrics: metrics(),
				};
			return {
				...base,
				ok: false,
				error: { code: "script-error" },
				metrics: metrics(),
			};
		} finally {
			clearTimeout(timer);
			controller.abort();
			options.signal?.removeEventListener("abort", abort);
			this.active = undefined;
		}
	}

	close() {
		this.closed = true;
		this.active?.abort();
	}

	metrics() {
		return { runs: this.runs, active: !!this.active, closed: this.closed };
	}
}
