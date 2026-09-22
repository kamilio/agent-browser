import { AgentBrowserError } from "./errors.js";
import type { ReleasedContext } from "./safejs-extension-types.js";

const pageBytes = 65536;
export const wasmMemoryLimits = Object.freeze({
	memories: 8,
	pages: 2048,
	totalPages: 2048,
	growCalls: 4096,
});
export interface WasmMemoryBudget {
	allocateArrayLength(bytes: number): void;
	provisionDataUsage(bytes: number): () => void;
}
interface MemoryRecord {
	memory: WebAssembly.Memory;
	reference: object;
	pages: number;
	maximum: number;
}
function pages(value: unknown): number {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < 0 ||
		value > 4294967295
	)
		throw new TypeError("Invalid WASM memory pages");
	return value;
}
/** Owns unshared wasm32 memory and live realm references. Module admission must
 * route memory.grow instructions through wasmGrow before exposing exports.
 * This owner is not a page API installer or a WASM execution boundary.
 */
export class NodeWasmMemories {
	readonly port: object;
	private readonly records = new Map<object, MemoryRecord>();
	private totalPages = 0;
	private growCalls = 0;
	private closed = false;
	constructor(
		private readonly context: Pick<
			ReleasedContext,
			| "signal"
			| "createHostObject"
			| "createArrayBufferReference"
			| "releaseGuestReference"
		>,
		private readonly budget: WasmMemoryBudget,
	) {
		if (!context.createArrayBufferReference)
			throw new AgentBrowserError(
				"unsupported",
				"WASM memory requires realm-owned live buffer references",
			);
		this.port = context.createHostObject({
			methods: {
				create: (initial, maximum) => this.createMemory(initial, maximum),
			},
		});
	}
	metrics() {
		return {
			closed: this.closed,
			memories: this.records.size,
			retainedBytes: this.totalPages * pageBytes,
			growCalls: this.growCalls,
		};
	}
	private ensureOpen() {
		if (this.context.signal.aborted) this.close();
		if (this.closed)
			throw new AgentBrowserError("closed", "WASM memory owner closed");
	}
	private limited(): never {
		throw new AgentBrowserError("resource-limit", "WASM memory limit exceeded");
	}
	private provision(nextPages: number, delta: number): () => void {
		if (
			nextPages > wasmMemoryLimits.pages ||
			delta > wasmMemoryLimits.totalPages - this.totalPages
		)
			this.limited();
		this.budget.allocateArrayLength(nextPages * pageBytes);
		return this.budget.provisionDataUsage(delta * pageBytes);
	}
	createMemory(initialInput: unknown, maximumInput?: unknown): object {
		this.ensureOpen();
		const initial = pages(initialInput);
		const maximum =
			maximumInput === undefined ? wasmMemoryLimits.pages : pages(maximumInput);
		if (initial > maximum)
			throw new RangeError("WASM memory minimum exceeds maximum");
		if (
			maximum > wasmMemoryLimits.pages ||
			this.records.size >= wasmMemoryLimits.memories
		)
			this.limited();
		const release = this.provision(initial, initial);
		let memory: WebAssembly.Memory;
		try {
			memory = new WebAssembly.Memory({ initial, maximum });
		} finally {
			release();
		}
		const reference = this.context.createArrayBufferReference?.(
			memory.buffer,
		) as object;
		const record = { memory, reference, pages: initial, maximum };
		try {
			const handle = this.context.createHostObject({
				properties: {
					buffer: {
						get: () => {
							this.ensureOpen();
							return record.reference;
						},
					},
				},
				methods: { grow: (input) => this.grow(record, input) },
			});
			this.records.set(handle, record);
			this.totalPages += initial;
			return handle;
		} catch (error) {
			if (!this.context.signal.aborted)
				this.context.releaseGuestReference(reference);
			throw error;
		}
	}
	private grow(
		record: MemoryRecord,
		input: unknown,
		wasmInstruction = false,
	): number {
		this.ensureOpen();
		const delta = pages(input);
		if (this.growCalls >= wasmMemoryLimits.growCalls) this.limited();
		this.growCalls++;
		const next = record.pages + delta;
		if (next > record.maximum) {
			if (wasmInstruction) return -1;
			throw new RangeError("WASM memory maximum exceeded");
		}
		const release = this.provision(next, delta);
		let previous: number;
		try {
			previous = record.memory.grow(delta);
		} catch (error) {
			if (wasmInstruction && error instanceof RangeError) return -1;
			throw error;
		} finally {
			release();
		}
		// Native growth detaches the old buffer even for grow(0). A failed reference
		// admission cannot undo it, so revoke this owner before returning an error.
		try {
			const reference = this.context.createArrayBufferReference?.(
				record.memory.buffer,
			) as object;
			this.context.releaseGuestReference(record.reference);
			record.reference = reference;
			record.pages = next;
			this.totalPages += delta;
			return previous;
		} catch (error) {
			this.close();
			throw error;
		}
	}
	wasmGrow(handle: unknown, input: unknown): number {
		this.ensureOpen();
		const record = this.records.get(handle as object);
		if (!record)
			throw new AgentBrowserError("invalid-input", "Unowned WASM memory");
		if (
			typeof input !== "number" ||
			!Number.isInteger(input) ||
			input < -2147483648 ||
			input > 2147483647
		)
			throw new TypeError("WASM growth requires an i32 argument");
		return this.grow(record, input >>> 0, true);
	}
	nativeMemory(handle: unknown): WebAssembly.Memory | undefined {
		this.ensureOpen();
		return this.records.get(handle as object)?.memory;
	}
	close(): void {
		if (this.closed) return;
		this.closed = true;
		const records = [...this.records.values()];
		this.records.clear();
		this.totalPages = 0;
		if (!this.context.signal.aborted)
			for (const record of records)
				this.context.releaseGuestReference(record.reference);
	}
}
