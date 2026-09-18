import type { SafeJsBudget } from "./safejs.js";

export interface ReleasedSourceModule {
	readonly id: string;
	readonly source: string;
}

export type ReleasedSourceResolver = (
	specifier: string,
	referrer: string,
	context: { signal?: AbortSignal },
) =>
	| ReleasedSourceModule
	| undefined
	| Promise<ReleasedSourceModule | undefined>;

export interface ReleasedInvocation {
	synchronous: Promise<void>;
	result: Promise<unknown>;
}

export interface ReleasedHostDefinition {
	properties?: Record<
		string,
		{ get?: () => unknown; set?: (value: unknown) => void }
	>;
	methods?: Record<string, (...args: readonly unknown[]) => unknown>;
	indexed?: {
		length(): number;
		get(index: number): unknown;
		maxLength: number;
	};
	named?: {
		keys(): readonly string[];
		get(name: string): unknown;
		set?(name: string, value: unknown): void;
		delete?(name: string): boolean;
		maxKeys: number;
		maxKeyCodeUnits: number;
		enumerable?: boolean;
	};
}

export interface ReleasedContext {
	readonly signal: AbortSignal;
	onCleanup(cleanup: () => void | Promise<void>): void;
	createHostObject(definition: ReleasedHostDefinition): object;
	startCallback(
		callback: unknown,
		options?: { thisValue?: unknown; args?: readonly unknown[] },
	): ReleasedInvocation;
	releaseCallback(callback: unknown): void;
	retainGuestArguments<
		Operation extends (...args: readonly unknown[]) => unknown,
	>(operation: Operation, from: number): Operation;
	releaseGuestReference(reference: unknown): void;
	nestedOperation<Operation extends (...args: readonly unknown[]) => unknown>(
		operation: Operation,
	): Operation;
	evaluateNested(source: string): Promise<void>;
}

export interface ReleasedRealm {
	evaluate(
		source: string,
		options?: { filename?: string; sourceType?: "module" },
	): Promise<{ ok: boolean; returnValue?: unknown; error?: unknown }>;
	startCallback: ReleasedContext["startCallback"];
	releaseCallback: ReleasedContext["releaseCallback"];
	close(): Promise<void>;
}

export interface ReleasedCore {
	Budget: new (options: {
		maxSteps: number;
		deadline?: number;
		maxCallDepth?: number;
		stringLength?: number;
		regexSourceLength?: number;
		regexCompileAllocations?: number;
		arrayLength?: number;
		dataSize: number;
	}) => SafeJsBudget;
	defineExtension(definition: {
		manifest: {
			version: 1;
			name: string;
			globals: readonly string[];
			capabilities?: readonly string[];
		};
		setup(context: ReleasedContext): { globals: Record<string, unknown> };
	}): unknown;
	createRealm(options: {
		classicScripts?: boolean;
		callbackScheduling?: "after-prefix";
		sourceResolver?: ReleasedSourceResolver;
		extensions: readonly unknown[];
		builtinOverrides?: { console?: string };
		grants?: readonly string[];
		budget: SafeJsBudget;
		signal: AbortSignal;
		sink?: {
			log(...values: unknown[]): void;
			error(...values: unknown[]): void;
		};
		limits?: {
			extensions?: number;
			hostObjects?: number;
			callbacks?: number;
			guestReferences?: number;
			cleanups?: number;
			nestedEvaluations?: number;
		};
	}): ReleasedRealm;
}
