import { AsyncLocalStorage } from "node:async_hooks";
import { AgentBrowserError } from "./errors.js";
import { WasmCallDepth } from "./wasm-metering.js";

type WasmScalar = number | bigint;
type WasmResult = WasmScalar | WasmScalar[] | undefined;
export interface WasmPromiseApi {
	Suspending: new (
		operation: (...args: unknown[]) => Promise<unknown>,
	) => unknown;
	promising(
		operation: (...args: WasmScalar[]) => unknown,
	): (...args: WasmScalar[]) => Promise<unknown>;
}
interface CallFrame {
	depth: WasmCallDepth;
	asynchronous: boolean;
}
interface MeterNames {
	importModule: string;
	importName: string;
	enterImportName: string;
	leaveImportName: string;
}
const maxCalls = 64;
const maxArguments = 4096;
function invalid(): never {
	throw new TypeError(
		"WASM calls require primitive numeric arguments and results",
	);
}
function scalar(value: unknown): value is WasmScalar {
	return typeof value === "number" || typeof value === "bigint";
}
function numericList(values: readonly unknown[]): boolean {
	const length = values.length;
	if (length > maxArguments) return false;
	for (let index = 0; index < length; index++)
		if (!scalar(values[index])) return false;
	return true;
}
function result(value: unknown): WasmResult {
	if (value === undefined || scalar(value)) return value;
	if (Array.isArray(value) && numericList(value)) return value;
	return invalid();
}

/** Node execution boundary for instrumented WASM with async interpreter imports.
 * Requires the current Suspending/promising API; no flags are enabled here.
 * Compile/validate, memory limits, import admission and page exposure belong to
 * the caller. Synchronous start functions cannot invoke interpreter imports.
 */
export class NodeWasmCalls {
	private readonly scope = new AsyncLocalStorage<CallFrame>();
	private readonly frames = new Set<CallFrame>();
	private readonly pending = new Set<Promise<unknown>>();
	private readonly wrappers = new WeakMap<
		object,
		(...args: WasmScalar[]) => Promise<unknown>
	>();
	private readonly controller = new AbortController();
	private readonly signal: AbortSignal;
	private readonly api: WasmPromiseApi;
	private closed = false;
	private closing?: Promise<void>;
	constructor(
		private readonly budget: { visitNode(): void; enterCall(): () => void },
		signal: AbortSignal,
		api: Partial<WasmPromiseApi> = WebAssembly as unknown as Partial<WasmPromiseApi>,
	) {
		if (
			typeof api.Suspending !== "function" ||
			typeof api.promising !== "function"
		)
			throw new AgentBrowserError(
				"unsupported",
				"WASM interpreter imports require the current WebAssembly promise integration API",
			);
		this.api = api as WasmPromiseApi;
		this.signal = AbortSignal.any([signal, this.controller.signal]);
	}
	get pendingCalls(): number {
		return this.frames.size;
	}
	get callDepth(): number {
		return Array.from(this.frames, (frame) => frame.depth.depth).reduce(
			(sum, depth) => sum + depth,
			0,
		);
	}
	private assertActive(): void {
		this.signal.throwIfAborted();
		if (this.closed)
			throw new AgentBrowserError("invalid-input", "WASM execution closed");
	}
	private frame(): CallFrame {
		this.assertActive();
		const frame = this.scope.getStore();
		if (!frame || !this.frames.has(frame))
			throw new AgentBrowserError("invalid-input", "Unowned WASM call");
		return frame;
	}
	meterImports(names: MeterNames): WebAssembly.Imports {
		return {
			[names.importModule]: {
				[names.importName]: () => {
					this.frame();
					this.budget.visitNode();
				},
				[names.enterImportName]: () => this.frame().depth.enter(),
				[names.leaveImportName]: () => this.frame().depth.leave(),
			},
		};
	}
	suspending(callback: (...args: unknown[]) => unknown): unknown {
		this.assertActive();
		if (typeof callback !== "function")
			throw new TypeError("Invalid WASM import callback");
		return new this.api.Suspending((...args) => {
			const frame = this.frame();
			if (!frame.asynchronous)
				throw new AgentBrowserError(
					"unsupported",
					"Asynchronous WASM imports in start functions are unsupported",
				);
			if (!numericList(args)) invalid();
			this.budget.visitNode();
			// Calling before constructing a promise preserves synchronous throws and
			// avoids starting a callback for an unowned or unsupported entry.
			const value = callback(...args);
			return this.wait(value).then((value) => {
				this.frame();
				this.budget.visitNode();
				return result(value);
			});
		});
	}
	private wait(value: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const cancel = () => reject(this.signal.reason);
			Promise.resolve(value).then(
				(value) => {
					this.signal.removeEventListener("abort", cancel);
					resolve(value);
				},
				(error) => {
					this.signal.removeEventListener("abort", cancel);
					reject(error);
				},
			);
			if (this.signal.aborted) cancel();
			else this.signal.addEventListener("abort", cancel, { once: true });
		});
	}
	instantiate<Value>(operation: () => Value): Value {
		this.assertActive();
		if (this.frames.size >= maxCalls)
			throw new AgentBrowserError("resource-limit", "WASM call limit exceeded");
		const frame = {
			depth: new WasmCallDepth(this.budget),
			asynchronous: false,
		};
		this.frames.add(frame);
		try {
			return this.scope.run(frame, () =>
				frame.depth.run(() => {
					this.budget.visitNode();
					return operation();
				}),
			);
		} finally {
			this.frames.delete(frame);
		}
	}
	async invoke(
		operation: (...args: WasmScalar[]) => unknown,
		args: WasmScalar[] = [],
	): Promise<WasmResult> {
		this.assertActive();
		if (this.frames.size >= maxCalls)
			throw new AgentBrowserError("resource-limit", "WASM call limit exceeded");
		if (typeof operation !== "function" || !numericList(args)) invalid();
		let wrapped = this.wrappers.get(operation);
		if (!wrapped) {
			wrapped = this.api.promising(operation);
			this.wrappers.set(operation, wrapped);
		}
		const frame = { depth: new WasmCallDepth(this.budget), asynchronous: true };
		this.frames.add(frame);
		let complete!: (value: WasmResult) => void;
		let fail!: (error: unknown) => void;
		const pending = new Promise<WasmResult>((resolve, reject) => {
			complete = resolve;
			fail = reject;
		});
		// Register before entering native code: an import can close this owner while
		// the first native invocation is still on its synchronous prefix.
		this.pending.add(pending);
		const execution = this.scope.run(frame, () =>
			frame.depth.runAsync(async () => {
				this.budget.visitNode();
				const value = await wrapped(...args);
				this.assertActive();
				return result(value);
			}),
		);
		void execution.then(complete, fail);
		try {
			return await pending;
		} finally {
			this.pending.delete(pending);
			this.frames.delete(frame);
		}
	}
	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closed = true;
		this.controller.abort(
			new AgentBrowserError("invalid-input", "WASM execution closed"),
		);
		this.closing = Promise.allSettled([...this.pending]).then(() => {});
		return this.closing;
	}
}
