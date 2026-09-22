import { types } from "node:util";
import { AgentBrowserError } from "./errors.js";
import type { NodeWasmCalls } from "./node-wasm-calls.js";
import type { NodeWasmMemories } from "./node-wasm-memories.js";
import type {
	NodeWasmModules,
	WasmModuleBudget,
	WasmModuleRecord,
} from "./node-wasm-modules.js";
import type { ReleasedContext } from "./safejs-extension-types.js";

export const wasmInstanceLimits = Object.freeze({
	instances: 8,
	attempts: 16,
	arguments: 4096,
});
export interface WasmInstanceOptions {
	context: Pick<ReleasedContext, "signal" | "invokeCallback">;
	budget: WasmModuleBudget & { allocateArrayLength(length: number): void };
	modules: NodeWasmModules;
	memories: NodeWasmMemories;
	calls: NodeWasmCalls;
}
interface InstanceRecord {
	native: WebAssembly.Instance;
	module: Readonly<WasmModuleRecord>;
	releaseModule(): void;
	memoryHandle?: object;
	retainedBytes: number;
}
function sequence(input: unknown, max: number): unknown[] {
	if (!Array.isArray(input) || types.isProxy(input) || input.length > max)
		throw new TypeError("Invalid WASM argument array");
	const values: unknown[] = [];
	for (let index = 0; index < input.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
		if (!descriptor || !Object.hasOwn(descriptor, "value"))
			throw new TypeError("WASM arguments require dense data fields");
		values.push(descriptor.value);
	}
	return values;
}
/** Realm-owned instantiation and numeric exported calls. Caller must wrap host
 * operations with a granted nestedOperation before exposing synchronous guest APIs.
 * SDK owns borrowed callback handles and memory owners; this owner never revokes
 * shared callbacks. Raw native Table/Global/function values never cross this API.
 */
export class NodeWasmInstances {
	private readonly records = new Map<object, InstanceRecord>();
	private closed = false;
	private closing?: Promise<void>;
	private attempts = 0;
	private retainedBytes = 0;
	private readonly invokeCallback: NonNullable<
		ReleasedContext["invokeCallback"]
	>;
	constructor(
		private readonly options: WasmInstanceOptions,
		private readonly instantiateNative: (
			module: WebAssembly.Module,
			imports: WebAssembly.Imports,
		) => WebAssembly.Instance = (module, imports) =>
			new WebAssembly.Instance(module, imports),
	) {
		if (!options.context.invokeCallback)
			throw new AgentBrowserError(
				"unsupported",
				"WASM imports require full realm-owned callbacks",
			);
		this.invokeCallback = options.context.invokeCallback.bind(options.context);
	}
	metrics() {
		return {
			closed: this.closed,
			instances: this.records.size,
			attempts: this.attempts,
			retainedBytes: this.retainedBytes,
			pending: this.options.calls.pendingCalls,
		};
	}
	private assertActive() {
		if (this.closed || this.options.context.signal.aborted)
			throw new AgentBrowserError("closed", "WASM instance owner closed");
		if (
			this.options.budget.deadline !== undefined &&
			Date.now() > this.options.budget.deadline
		)
			throw new AgentBrowserError(
				"resource-limit",
				"WASM instance deadline exceeded",
			);
	}
	private record(token: unknown): InstanceRecord {
		this.assertActive();
		const record = this.records.get(token as object);
		if (!record)
			throw new AgentBrowserError("invalid-input", "Unowned WASM instance");
		return record;
	}
	instantiate(moduleToken: unknown, input: unknown): object {
		this.assertActive();
		if (
			this.records.size >= wasmInstanceLimits.instances ||
			this.attempts >= wasmInstanceLimits.attempts
		)
			throw new AgentBrowserError(
				"resource-limit",
				"WASM instance limit exceeded",
			);
		this.attempts++;
		const lease = this.options.modules.retain(moduleToken);
		let token: object | undefined;
		let credited = false;
		let retainedBytes = 0;
		try {
			const declarations = lease.record.declarations;
			const values = sequence(input, declarations.imports.length);
			if (values.length !== declarations.imports.length)
				throw new WebAssembly.LinkError("WASM import count mismatch");
			const bindings = new Map<
				string,
				Map<string, { values: unknown[]; next: number }>
			>();
			const imports: WebAssembly.Imports = Object.create(null);
			let memoryHandle: object | undefined;
			declarations.imports.forEach((item, index) => {
				let value: unknown;
				if (item.kind === "function") {
					const callback = values[index];
					if (typeof callback !== "function")
						throw new WebAssembly.LinkError(
							"WASM import requires a realm-owned function",
						);
					value = this.options.calls.suspending((...args) =>
						this.invokeCallback(callback, { args }),
					);
				} else if (item.kind === "memory") {
					const memory = this.options.memories.nativeMemory(values[index]);
					if (!memory)
						throw new AgentBrowserError("invalid-input", "Unowned WASM memory");
					memoryHandle = values[index] as object;
					value = memory;
				} else
					throw new AgentBrowserError(
						"unsupported",
						"Unsupported WASM import kind",
					);
				let names = bindings.get(item.module);
				if (!names) {
					names = new Map();
					bindings.set(item.module, names);
					Object.defineProperty(imports, item.module, {
						value: Object.create(null),
						enumerable: true,
					});
				}
				let binding = names.get(item.name);
				if (!binding) {
					binding = { values: [], next: 0 };
					names.set(item.name, binding);
					const entry = binding;
					Object.defineProperty(imports[item.module], item.name, {
						enumerable: true,
						get: () => {
							if (entry.next >= entry.values.length)
								throw new WebAssembly.LinkError(
									"Unexpected WASM import resolution",
								);
							return entry.values[entry.next++];
						},
					});
				}
				binding.values.push(value);
			});
			Object.assign(
				imports,
				this.options.calls.meterImports(lease.record.metering, (delta) => {
					if (memoryHandle === undefined)
						throw new AgentBrowserError(
							"invalid-input",
							"Unowned WASM memory growth",
						);
					return this.options.memories.wasmGrow(memoryHandle, delta);
				}),
			);
			for (const table of declarations.tables) {
				this.options.budget.allocateArrayLength(table.minimum);
				retainedBytes += table.minimum * 8;
			}
			retainedBytes +=
				1 +
				declarations.globals.length * 8 +
				(declarations.exports.length + declarations.imports.length) * 16;
			token = Object.freeze(Object.create(null)) as object;
			this.options.budget.setRetainedDataUsage(token, retainedBytes);
			credited = true;
			this.retainedBytes += retainedBytes;
			const native = this.options.calls.instantiate(() =>
				this.instantiateNative(lease.record.module, imports),
			);
			this.assertActive();
			this.records.set(token, {
				native,
				module: lease.record,
				releaseModule: lease.release,
				memoryHandle,
				retainedBytes,
			});
			return token;
		} catch (error) {
			if (token && credited) {
				this.options.budget.setRetainedDataUsage(token, 0);
				this.retainedBytes -= retainedBytes;
			}
			lease.release();
			throw error;
		}
	}
	exportDeclarations(token: unknown) {
		return this.record(token).module.declarations.exports;
	}
	async invoke(
		token: unknown,
		name: unknown,
		input: unknown,
	): Promise<unknown> {
		const record = this.record(token);
		if (
			typeof name !== "string" ||
			!record.module.declarations.exports.some(
				(item) => item.name === name && item.kind === "function",
			)
		)
			throw new TypeError("Invalid WASM function export");
		const values = sequence(input, wasmInstanceLimits.arguments);
		if (
			values.some(
				(value) => typeof value !== "number" && typeof value !== "bigint",
			)
		)
			throw new TypeError("WASM calls require primitive numeric arguments");
		const operation = record.native.exports[name];
		if (typeof operation !== "function")
			throw new TypeError("Invalid WASM native export");
		return this.options.calls.invoke(
			operation as (...args: (number | bigint)[]) => unknown,
			values as (number | bigint)[],
		);
	}
	memoryExport(token: unknown, name: unknown): object {
		const record = this.record(token);
		if (
			typeof name !== "string" ||
			!record.module.declarations.exports.some(
				(item) => item.name === name && item.kind === "memory",
			) ||
			record.memoryHandle === undefined
		)
			throw new TypeError("Invalid WASM memory export");
		const expected = this.options.memories.nativeMemory(record.memoryHandle);
		if (record.native.exports[name] !== expected)
			throw new TypeError("Unowned WASM memory export");
		return record.memoryHandle;
	}
	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closed = true;
		this.closing = this.options.calls.close().then(() => {
			for (const [token, record] of this.records) {
				this.options.budget.setRetainedDataUsage(token, 0);
				this.retainedBytes -= record.retainedBytes;
				record.releaseModule();
			}
			this.records.clear();
		});
		return this.closing;
	}
}
