import {
	DocumentObservers,
	type DocumentObserverOptions,
	type ObservedDocumentMutation,
} from "./document-observers.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

export interface ScriptMutationObserverLimits {
	maxObservers: number;
	maxPendingCallbacks: number;
	maxCallbacks: number;
}

export interface ScriptMutationObserverPort {
	identify(value: unknown): number;
	records(records: readonly ObservedDocumentMutation[]): readonly object[];
}

interface Binding {
	id: number;
	callback: unknown;
	capability: object | null;
}

interface Invocation {
	prefixFinished: boolean;
	resultFinished: boolean;
	failed: boolean;
}

export class ScriptMutationObservers {
	private readonly observers: DocumentObservers;
	private readonly limits: ScriptMutationObserverLimits;
	private readonly bindings = new Map<number, Binding>();
	private readonly inFlight = new Set<Invocation>();
	private factory: ScriptHostObjectFactory | null;
	private port: ScriptMutationObserverPort | null;
	private runtime: ScriptCallbackRuntime | null;
	private unregisterClose: (() => unknown) | null;
	private readonly interrupted: Promise<void>;
	private interrupt: (() => void) | null = null;
	private running = false;
	private closed = false;
	private failureCode: ErrorCode = "closed";
	private calls = 0;
	private failures = 0;

	constructor(
		tree: DocumentTree,
		factory: ScriptHostObjectFactory,
		port: ScriptMutationObserverPort,
		runtime: ScriptCallbackRuntime,
		limits: Partial<ScriptMutationObserverLimits> = {},
	) {
		this.factory = factory;
		this.port = port;
		this.runtime = runtime;
		this.limits = {
			maxObservers: 256,
			maxPendingCallbacks: 128,
			maxCallbacks: 4096,
			...limits,
		};
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid observer callback limit",
				);
		if (
			![
				factory?.createHostObject,
				port?.identify,
				port?.records,
				runtime?.startCallback,
				runtime?.isClosed,
			].every((operation) => typeof operation === "function")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid observer callback provider",
			);
		if (runtime.isClosed())
			throw new AgentBrowserError("closed", "Observer runtime is closed");
		this.interrupted = new Promise<void>((resolve) => {
			this.interrupt = resolve;
		});
		this.observers = new DocumentObservers(tree, {
			maxObservers: this.limits.maxObservers,
		});
		try {
			this.unregisterClose = tree.onClose(() => this.close());
		} catch (error) {
			this.observers.close();
			throw error;
		}
	}

	create(callback: unknown): object {
		this.ensureOpen();
		if (typeof callback !== "function")
			throw new TypeError("MutationObserver requires a callback function");
		const id = this.observers.create();
		const binding: Binding = { id, callback, capability: null };
		this.bindings.set(id, binding);
		try {
			const capability = this.factory?.createHostObject({
				methods: {
					observe: (...args) => {
						this.ensureOpen();
						if (!args.length)
							throw new TypeError("MutationObserver.observe requires a target");
						const target = this.port?.identify(args[0]);
						this.ensureOpen();
						if (typeof target !== "number")
							throw new TypeError("Invalid observer target");
						this.observers.observe(id, target, observerOptions(args[1]));
					},
					takeRecords: () => {
						this.ensureOpen();
						return this.materialize(this.observers.takeRecords(id));
					},
					disconnect: () => {
						this.ensureOpen();
						this.observers.disconnect(id);
					},
				},
			});
			this.ensureOpen();
			if (
				!capability ||
				typeof capability !== "object" ||
				[...this.bindings.values()].some(
					(entry) => entry.capability === capability,
				)
			)
				throw new AgentBrowserError(
					"unsupported",
					"Invalid observer capability",
				);
			binding.capability = capability;
			return capability;
		} catch (error) {
			binding.callback = null;
			binding.capability = null;
			this.bindings.delete(id);
			if (!this.closed) this.observers.release(id);
			throw error;
		}
	}

	hasPending() {
		this.ensureOpen();
		return this.observers.hasPending();
	}

	async checkpoint() {
		this.ensureOpen();
		if (this.running)
			throw new AgentBrowserError(
				"invalid-input",
				"Observer checkpoint is active",
			);
		this.running = true;
		try {
			if (!this.observers.beginDelivery()) return;
			while (true) {
				this.ensureOpen();
				const delivery = this.observers.nextDelivery();
				if (!delivery) break;
				const binding = this.bindings.get(delivery.observer);
				if (!binding?.capability)
					throw new AgentBrowserError(
						"unsupported",
						"Observer binding is unavailable",
					);
				const prefix = this.invoke(binding, delivery.records);
				await Promise.race([prefix, this.interrupted]);
				this.ensureOpen();
			}
		} catch (error) {
			this.fail(error);
			throw error;
		} finally {
			this.running = false;
		}
	}

	metrics() {
		return Object.freeze({
			observers: this.bindings.size,
			pendingCallbacks: this.inFlight.size,
			calls: this.calls,
			callbackFailures: this.failures,
			running: this.running,
			closed: this.closed,
			queue: this.observers.metrics(),
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.interrupt?.();
		this.interrupt = null;
		this.running = false;
		for (const binding of this.bindings.values()) {
			binding.callback = null;
			binding.capability = null;
		}
		this.bindings.clear();
		this.inFlight.clear();
		this.observers.close();
		this.factory = null;
		this.port = null;
		this.runtime = null;
		this.unregisterClose?.();
		this.unregisterClose = null;
	}

	private invoke(
		binding: Binding,
		records: readonly ObservedDocumentMutation[],
	) {
		if (
			this.inFlight.size >= this.limits.maxPendingCallbacks ||
			this.calls >= this.limits.maxCallbacks
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Observer callback limit exceeded",
			);
		const invocation: Invocation = {
			prefixFinished: false,
			resultFinished: false,
			failed: false,
		};
		this.inFlight.add(invocation);
		const settle = (
			phase: "prefixFinished" | "resultFinished",
			failed: boolean,
		) => {
			if (this.closed) return;
			invocation[phase] = true;
			if (failed && !invocation.failed) {
				invocation.failed = true;
				this.failures++;
			}
			if (invocation.prefixFinished && invocation.resultFinished)
				this.inFlight.delete(invocation);
		};
		const materialized = this.materialize(records);
		this.calls++;
		let started = false;
		try {
			const candidate = this.runtime?.startCallback(
				binding.callback,
				[materialized, binding.capability],
				{ thisValue: binding.capability },
			);
			started = true;
			const result = candidate?.result;
			void Promise.resolve(result).then(
				() => settle("resultFinished", false),
				() => settle("resultFinished", true),
			);
			const synchronous = candidate?.synchronous;
			const prefix = Promise.resolve(synchronous).then(
				() => settle("prefixFinished", false),
				() => settle("prefixFinished", true),
			);
			if (
				typeof synchronous?.then !== "function" ||
				typeof result?.then !== "function"
			)
				throw new AgentBrowserError(
					"unsupported",
					"Invalid observer callback completion phases",
				);
			this.ensureOpen();
			return prefix;
		} catch (error) {
			if (started || error instanceof AgentBrowserError) throw error;
			settle("prefixFinished", true);
			settle("resultFinished", true);
			this.ensureOpen();
			return Promise.resolve();
		}
	}

	private materialize(records: readonly ObservedDocumentMutation[]) {
		try {
			const result = this.port?.records(records);
			this.ensureOpen();
			if (!Array.isArray(result) || result.length !== records.length)
				throw new AgentBrowserError(
					"unsupported",
					"Invalid observer record capabilities",
				);
			for (let index = 0; index < result.length; index++)
				if (!result[index] || typeof result[index] !== "object")
					throw new AgentBrowserError(
						"unsupported",
						"Invalid observer record capabilities",
					);
			return result;
		} catch (error) {
			this.fail(error);
			throw error;
		}
	}

	private fail(error: unknown) {
		if (this.closed) return;
		this.failureCode =
			error instanceof AgentBrowserError ? error.code : "unsupported";
		this.close();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError(
				this.failureCode,
				"Mutation observer bindings are unavailable",
			);
		if (this.runtime?.isClosed()) {
			this.close();
			throw new AgentBrowserError("closed", "Observer runtime is closed");
		}
		try {
			this.observers.assertHealthy();
		} catch (error) {
			this.fail(error);
			throw error;
		}
	}
}

function observerOptions(value: unknown): DocumentObserverOptions {
	if (value == null) return {};
	if (typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Invalid observer options");
	const read = (object: object, key: string) => {
		const descriptor = Object.getOwnPropertyDescriptor(object, key);
		if (descriptor && !("value" in descriptor))
			throw new TypeError("Observer options require converted data properties");
		return descriptor?.value;
	};
	const options: DocumentObserverOptions = {};
	for (const name of [
		"childList",
		"attributes",
		"characterData",
		"subtree",
		"attributeOldValue",
		"characterDataOldValue",
	] as const) {
		const flag = read(value, name);
		if (flag !== undefined) options[name] = Boolean(flag);
	}
	const filter = read(value, "attributeFilter");
	if (filter !== undefined) {
		if (!Array.isArray(filter))
			throw new TypeError(
				"Observer attributeFilter requires a converted array",
			);
		if (filter.length > 128)
			throw new AgentBrowserError(
				"resource-limit",
				"Observer filter limit exceeded",
			);
		const names: string[] = [];
		let codeUnits = 0;
		for (let index = 0; index < filter.length; index++) {
			const name = read(filter, String(index));
			if (
				(typeof name === "object" && name !== null) ||
				typeof name === "function" ||
				typeof name === "symbol"
			)
				throw new TypeError("Observer filter names require primitive strings");
			const text = String(name);
			codeUnits += text.length;
			if (codeUnits > 4096)
				throw new AgentBrowserError(
					"resource-limit",
					"Observer filter limit exceeded",
				);
			names.push(text);
		}
		options.attributeFilter = names;
	}
	return options;
}
