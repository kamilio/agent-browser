import { AgentBrowserError } from "./errors.js";
import { wasmMemoryLimits } from "./node-wasm-memories.js";
import {
	type WasmDeclarations,
	type WasmSignature,
	meterWasmModule,
} from "./wasm-metering.js";

export const wasmModuleLimits = Object.freeze({
	modules: 8,
	compileCalls: 16,
	pending: 2,
	imports: 256,
	exports: 4096,
	nameCodeUnits: 4096,
	parameters: 64,
	results: 16,
	tables: 8,
	tableElements: 65536,
	globals: 1024,
});
export interface WasmModuleBudget {
	readonly deadline?: number;
	visitNode(): void;
	setRetainedDataUsage(owner: object, usage: number): void;
}
type Metering = Omit<
	ReturnType<typeof meterWasmModule>,
	"originalBytes" | "bytes" | "declarations"
>;
export interface WasmModuleRecord {
	readonly module: WebAssembly.Module;
	readonly metering: Readonly<Metering>;
	readonly declarations: Readonly<WasmDeclarations>;
}
interface Prepared {
	token: object;
	originalBytes: Uint8Array;
	bytes: Uint8Array;
	metering: Readonly<Metering>;
	declarations: Readonly<WasmDeclarations>;
	retainedBytes: number;
}
interface Stored extends Prepared {
	record: Readonly<WasmModuleRecord>;
	leases: number;
}
function unsupported(): never {
	throw new AgentBrowserError(
		"unsupported",
		"Unsupported WASM allocation or import/export boundary",
	);
}
function numeric(signature: WasmSignature): void {
	if (
		signature.parameters.length > wasmModuleLimits.parameters ||
		signature.results.length > wasmModuleLimits.results ||
		[...signature.parameters, ...signature.results].some(
			(type) => ![0x7f, 0x7e, 0x7d, 0x7c].includes(type),
		)
	)
		unsupported();
}
function admit(declarations: WasmDeclarations): void {
	if (
		declarations.imports.length > wasmModuleLimits.imports ||
		declarations.exports.length > wasmModuleLimits.exports ||
		declarations.memories.length ||
		declarations.tables.length > wasmModuleLimits.tables ||
		declarations.globals.length > wasmModuleLimits.globals ||
		declarations.tableGrowInstructions
	)
		unsupported();
	let memories = 0;
	for (const item of declarations.imports) {
		if (
			item.module.length > wasmModuleLimits.nameCodeUnits ||
			item.name.length > wasmModuleLimits.nameCodeUnits
		)
			unsupported();
		if (item.kind === "function") numeric(item.signature);
		else if (item.kind === "memory") {
			memories++;
			if (
				item.minimum > wasmMemoryLimits.pages ||
				(item.maximum !== undefined && item.maximum > wasmMemoryLimits.pages)
			)
				unsupported();
		} else unsupported();
	}
	if (memories > 1) unsupported();
	for (const table of declarations.tables)
		if (
			table.element !== 0x70 ||
			table.minimum > wasmModuleLimits.tableElements ||
			(table.maximum !== undefined &&
				table.maximum > wasmModuleLimits.tableElements)
		)
			unsupported();
	for (const global of declarations.globals)
		if (![0x7f, 0x7e, 0x7d, 0x7c, 0x70].includes(global.valueType))
			unsupported();
	for (const item of declarations.exports) {
		if (item.name.length > wasmModuleLimits.nameCodeUnits) unsupported();
		if (item.kind === "function") {
			if (!item.signature) unsupported();
			numeric(item.signature);
		}
	}
}
function freezeMetadata(
	declarations: WasmDeclarations,
): Readonly<WasmDeclarations> {
	const signatures = new Set<WasmSignature>();
	for (const item of [...declarations.imports, ...declarations.exports])
		if ("signature" in item && item.signature) signatures.add(item.signature);
	for (const signature of signatures) {
		Object.freeze(signature.parameters);
		Object.freeze(signature.results);
		Object.freeze(signature);
	}
	for (const list of [
		declarations.imports,
		declarations.exports,
		declarations.memories,
		declarations.tables,
		declarations.globals,
	]) {
		for (const item of list) Object.freeze(item);
		Object.freeze(list);
	}
	return Object.freeze(declarations);
}
/** Bounded owned compilation only. Instantiation must supply admitted realm-owned
 * imports, guard memory growth and own every execution using NodeWasmCalls.
 * Native compilation cannot be interrupted: canceled work retains its credit
 * and slot until settlement; close waits for it and never admits a late result.
 * Instance leases retain compiled source credits until released; close instances
 * before awaiting module-owner close.
 * Source-byte charges do not measure V8's generated machine-code allocation.
 */
export class NodeWasmModules {
	private readonly controller = new AbortController();
	private readonly signal: AbortSignal;
	private readonly records = new Map<object, Stored>();
	private readonly pending = new Set<Promise<void>>();
	private retainedBytes = 0;
	private calls = 0;
	private leases = 0;
	private drainLeases?: () => void;
	private closed = false;
	private closing?: Promise<void>;
	constructor(
		private readonly budget: WasmModuleBudget,
		signal: AbortSignal,
		private readonly compileNative: (
			bytes: Uint8Array,
		) => Promise<WebAssembly.Module> = (bytes) =>
			WebAssembly.compile(bytes as BufferSource),
	) {
		this.signal = AbortSignal.any([signal, this.controller.signal]);
	}
	metrics() {
		return {
			closed: this.closed,
			modules: this.records.size,
			pending: this.pending.size,
			compileCalls: this.calls,
			leases: this.leases,
			retainedBytes: this.retainedBytes,
		};
	}
	private assertActive() {
		this.signal.throwIfAborted();
		if (this.closed)
			throw new AgentBrowserError("closed", "WASM module owner closed");
		if (this.budget.deadline !== undefined && Date.now() > this.budget.deadline)
			throw new AgentBrowserError(
				"resource-limit",
				"WASM compilation deadline exceeded",
			);
	}
	private prepare(input: Uint8Array): Prepared {
		this.assertActive();
		if (
			this.records.size + this.pending.size >= wasmModuleLimits.modules ||
			this.pending.size >= wasmModuleLimits.pending ||
			this.calls >= wasmModuleLimits.compileCalls
		)
			throw new AgentBrowserError(
				"resource-limit",
				"WASM compilation limit exceeded",
			);
		this.calls++;
		this.budget.visitNode();
		const result = meterWasmModule(input, { guardMemoryGrowth: true });
		if (!WebAssembly.validate(result.originalBytes as BufferSource))
			throw new WebAssembly.CompileError("Invalid original WASM module");
		admit(result.declarations);
		this.assertActive();
		const { originalBytes, bytes, declarations, ...metering } = result;
		const retainedBytes =
			originalBytes.byteLength +
			bytes.byteLength +
			JSON.stringify(declarations).length * 2;
		const token = Object.freeze(Object.create(null)) as object;
		this.budget.setRetainedDataUsage(token, retainedBytes);
		this.retainedBytes += retainedBytes;
		return {
			token,
			originalBytes,
			bytes,
			declarations: freezeMetadata(declarations),
			metering: Object.freeze(metering),
			retainedBytes,
		};
	}
	private release(prepared: Prepared): void {
		this.budget.setRetainedDataUsage(prepared.token, 0);
		this.retainedBytes -= prepared.retainedBytes;
	}
	private commit(prepared: Prepared, module: WebAssembly.Module): object {
		this.assertActive();
		this.budget.visitNode();
		const record = Object.freeze({
			module,
			metering: prepared.metering,
			declarations: prepared.declarations,
		});
		this.records.set(prepared.token, { ...prepared, record, leases: 0 });
		return prepared.token;
	}
	compileSync(input: Uint8Array): object {
		const prepared = this.prepare(input);
		try {
			return this.commit(
				prepared,
				new WebAssembly.Module(prepared.bytes as BufferSource),
			);
		} catch (error) {
			this.release(prepared);
			throw error;
		}
	}
	async compile(input: Uint8Array): Promise<object> {
		const prepared = this.prepare(input);
		let token: object | undefined;
		const job = Promise.resolve()
			.then(() => {
				this.assertActive();
				return this.compileNative(prepared.bytes);
			})
			.then((module) => {
				token = this.commit(prepared, module);
			})
			.finally(() => {
				this.pending.delete(job);
				if (!token) this.release(prepared);
			});
		this.pending.add(job);
		await new Promise<void>((resolve, reject) => {
			const abort = () => reject(this.signal.reason);
			job.then(
				() => {
					this.signal.removeEventListener("abort", abort);
					resolve();
				},
				(error) => {
					this.signal.removeEventListener("abort", abort);
					reject(error);
				},
			);
			if (this.signal.aborted) abort();
			else this.signal.addEventListener("abort", abort, { once: true });
		});
		if (!token) throw new Error("Missing compiled WASM token");
		return token;
	}
	record(token: unknown): Readonly<WasmModuleRecord> {
		this.assertActive();
		const stored = this.records.get(token as object);
		if (!stored)
			throw new AgentBrowserError("invalid-input", "Unowned WASM module");
		return stored.record;
	}
	retain(token: unknown): {
		record: Readonly<WasmModuleRecord>;
		release(): void;
	} {
		const record = this.record(token);
		const stored = this.records.get(token as object);
		if (!stored)
			throw new AgentBrowserError("invalid-input", "Unowned WASM module");
		stored.leases++;
		this.leases++;
		let released = false;
		return {
			record,
			release: () => {
				if (released) return;
				released = true;
				stored.leases--;
				this.leases--;
				if (this.closed && stored.leases === 0) {
					this.records.delete(token as object);
					this.release(stored);
				}
				if (this.leases === 0) this.drainLeases?.();
			},
		};
	}
	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closed = true;
		this.controller.abort(
			new AgentBrowserError("closed", "WASM module owner closed"),
		);
		for (const [token, stored] of this.records)
			if (stored.leases === 0) {
				this.release(stored);
				this.records.delete(token);
			}
		const leased = this.leases
			? new Promise<void>((resolve) => {
					this.drainLeases = resolve;
				})
			: Promise.resolve();
		this.closing = Promise.allSettled([...this.pending, leased]).then(() => {});
		return this.closing;
	}
}
