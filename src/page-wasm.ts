import { types } from "node:util";
import { AgentBrowserError } from "./errors.js";
import { NodeWasmCalls, type WasmPromiseApi } from "./node-wasm-calls.js";
import { NodeWasmInstances } from "./node-wasm-instances.js";
import {
	NodeWasmMemories,
	type WasmMemoryBudget,
} from "./node-wasm-memories.js";
import { NodeWasmModules, type WasmModuleBudget } from "./node-wasm-modules.js";
import type { ReleasedContext } from "./safejs-extension-types.js";
export const pageWasmLimits = Object.freeze({ sourceBytes: 1048576 });
export type PageWasmBudget = WasmModuleBudget &
	WasmMemoryBudget & { enterCall(): () => void };
/** Guest API bridge; uses declared/granted source:nested and array-buffer:share.
 * The caller admits its compilation policy before installing the guest namespace.
 * Table/Global exports, streaming and async start imports remain unsupported.
 */
export class PageWasm {
	readonly port: object;
	private readonly calls: NodeWasmCalls;
	private readonly memories: NodeWasmMemories;
	private readonly modules: NodeWasmModules;
	private readonly instances: NodeWasmInstances;
	private readonly modulePorts = new Map<object, object>();
	private readonly instancePorts = new Map<object, object>();
	private closed = false;
	private closing?: Promise<void>;
	constructor(
		private readonly context: Pick<
			ReleasedContext,
			| "signal"
			| "onCleanup"
			| "createHostObject"
			| "createArrayBufferReference"
			| "releaseGuestReference"
			| "invokeCallback"
			| "nestedOperation"
		>,
		private readonly budget: PageWasmBudget,
		api?: Partial<WasmPromiseApi>,
		private readonly compilation: "allow" | "deny" = "allow",
	) {
		this.calls = new NodeWasmCalls(budget, context.signal, api);
		this.memories = new NodeWasmMemories(context, budget);
		this.modules = new NodeWasmModules(budget, context.signal);
		this.instances = new NodeWasmInstances({
			context,
			budget,
			modules: this.modules,
			memories: this.memories,
			calls: this.calls,
		});
		context.onCleanup(() => this.close());
		this.port = context.createHostObject({
			methods: {
				memory: (initial, maximum) => {
					this.assertActive();
					return this.memories.createMemory(initial, maximum);
				},
				validate: (input) => {
					const bytes = this.bytes(input);
					budget.visitNode();
					const valid = WebAssembly.validate(bytes as BufferSource);
					this.assertActive();
					return valid;
				},
				compileSync: (input) => {
					this.assertCompilation();
					return this.publishModule(
						this.modules.compileSync(this.bytes(input)),
					);
				},
				compile: context.nestedOperation(async (input) => {
					this.assertCompilation();
					return this.publishModule(
						await this.modules.compile(this.bytes(input)),
					);
				}),
				instantiate: (module, values) => this.instantiate(module, values),
				call: context.nestedOperation((port, name, values) => {
					this.assertActive();
					const token = this.instancePorts.get(port as object);
					if (!token) throw new TypeError("Invalid WASM instance handle");
					return this.instances.invoke(token, name, values);
				}),
			},
		});
	}
	private assertCompilation() {
		this.assertActive();
		if (this.compilation !== "allow")
			throw new WebAssembly.CompileError(
				"WASM compilation blocked by Content Security Policy",
			);
	}
	private assertActive() {
		if (this.closed || this.context.signal.aborted)
			throw new AgentBrowserError("closed", "Page WASM bridge closed");
		if (this.budget.deadline !== undefined && Date.now() > this.budget.deadline)
			throw new AgentBrowserError(
				"resource-limit",
				"Page WASM deadline exceeded",
			);
	}
	private bytes(input: unknown): Uint8Array {
		this.assertActive();
		if (!types.isUint8Array(input) || types.isProxy(input))
			throw new TypeError("WASM source requires a native Uint8Array snapshot");
		if (input.byteLength > pageWasmLimits.sourceBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"WASM source byte limit exceeded",
			);
		return new Uint8Array(input as Uint8Array);
	}
	private publishModule(token: object): object {
		this.assertActive();
		const record = this.modules.record(token);
		const port = this.context.createHostObject({
			properties: {
				imports: {
					get: () => {
						this.assertActive();
						return record.declarations.imports;
					},
				},
				exports: {
					get: () => {
						this.assertActive();
						return record.declarations.exports;
					},
				},
			},
		});
		this.modulePorts.set(port, token);
		return port;
	}
	private instantiate(modulePort: unknown, input: unknown): object {
		this.assertActive();
		const token = this.modulePorts.get(modulePort as object);
		if (!token) throw new TypeError("Invalid WASM module handle");
		const record = this.modules.record(token);
		if (
			record.declarations.exports.some(
				(item) => item.kind !== "function" && item.kind !== "memory",
			)
		)
			throw new AgentBrowserError(
				"unsupported",
				"WASM Table/Global exports are unsupported",
			);
		const instance = this.instances.instantiate(token, input);
		const port = this.context.createHostObject({
			properties: {
				exports: {
					get: () => {
						this.assertActive();
						// Construct descriptor data at the bridge, avoiding interpreted
						// object literals for each export. Each read stays fresh and the
						// SDK accounts for the returned graph under the guest's limits.
						return record.declarations.exports.map((entry) => {
							if (entry.kind !== "function") return entry;
							if (!entry.signature)
								throw new WebAssembly.LinkError(
									"Missing WASM export signature",
								);
							return {
								...entry,
								functionMetadata: {
									length: {
										value: entry.signature.parameters.length,
										configurable: true,
									},
									name: { value: String(entry.index), configurable: true },
								},
							};
						});
					},
				},
			},
			methods: {
				memory: (name) => {
					this.assertActive();
					return this.instances.memoryExport(instance, name);
				},
			},
		});
		this.instancePorts.set(port, instance);
		return port;
	}
	metrics() {
		return {
			closed: this.closed,
			modules: this.modules.metrics(),
			instances: this.instances.metrics(),
			memories: this.memories.metrics(),
			depth: this.calls.callDepth,
			pending: this.calls.pendingCalls,
		};
	}
	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closed = true;
		this.closing = this.instances.close().then(async () => {
			this.modulePorts.clear();
			this.instancePorts.clear();
			await this.modules.close();
			this.memories.close();
		});
		return this.closing;
	}
}
