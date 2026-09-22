import { AgentBrowserError } from "./errors.js";

const maxInput = 1_048_576;
const maxOutput = 8_388_608;
const maxEntries = 65_536;
const meterModule = "agent_browser_meter_v1";
const meterName = "step";
const enterName = "enter";
const leaveName = "leave";
const memoryGrowName = "memory_grow";
const magic = [0, 97, 115, 109, 1, 0, 0, 0];
const typedArrayByteLength = Object.getOwnPropertyDescriptor(
	Object.getPrototypeOf(Uint8Array.prototype),
	"byteLength",
)?.get;

function invalid(): never {
	throw new AgentBrowserError(
		"unsupported",
		"Unsupported or malformed WASM metering input",
	);
}
class Reader {
	position = 0;
	constructor(readonly bytes: Uint8Array) {}
	byte(): number {
		if (this.position >= this.bytes.length) invalid();
		return this.bytes[this.position++];
	}
	u32(): number {
		let value = 0;
		for (let index = 0; index < 5; index++) {
			const byte = this.byte();
			if (index === 4 && byte & 240) invalid();
			value += (byte & 127) * 2 ** (index * 7);
			if (!(byte & 128)) return value;
		}
		return invalid();
	}
	count(): number {
		const value = this.u32();
		if (value > maxEntries) invalid();
		return value;
	}
	signed(bits: number): void {
		const length = Math.ceil(bits / 7);
		for (let index = 0; index < length; index++) {
			const byte = this.byte();
			if (index === length - 1) {
				const used = bits - index * 7;
				const mask = 127 ^ ((1 << used) - 1);
				const padding = byte & (1 << (used - 1)) ? mask : 0;
				if ((byte & mask) !== padding) invalid();
			}
			if (!(byte & 128)) return;
		}
		invalid();
	}
	take(length: number): Uint8Array {
		if (length > this.bytes.length - this.position) invalid();
		const bytes = this.bytes.subarray(this.position, this.position + length);
		this.position += length;
		return bytes;
	}
	name(): string {
		const bytes = this.take(this.u32());
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			return invalid();
		}
	}
	done(): void {
		if (this.position !== this.bytes.length) invalid();
	}
}
class Writer {
	private bytes = new Uint8Array(256);
	private position = 0;
	private reserve(length: number): void {
		if (length > maxOutput - this.position) invalid();
		const required = this.position + length;
		if (required <= this.bytes.length) return;
		const grown = new Uint8Array(
			Math.min(maxOutput, Math.max(required, this.bytes.length * 2)),
		);
		grown.set(this.bytes);
		this.bytes = grown;
	}
	put(...bytes: number[]): void {
		this.reserve(bytes.length);
		for (const byte of bytes) this.bytes[this.position++] = byte;
	}
	copy(bytes: Uint8Array): void {
		this.reserve(bytes.length);
		this.bytes.set(bytes, this.position);
		this.position += bytes.length;
	}
	u32(value: number): void {
		let remaining = value;
		do {
			const byte = remaining % 128;
			remaining = Math.floor(remaining / 128);
			this.put(byte | (remaining ? 128 : 0));
		} while (remaining);
	}
	s33(value: number): void {
		let remaining = value;
		let more: boolean;
		do {
			const byte = remaining % 128;
			remaining = Math.floor(remaining / 128);
			more = remaining !== 0 || (byte & 64) !== 0;
			this.put(byte | (more ? 128 : 0));
			if (!more) return;
		} while (more);
	}
	name(value: string): void {
		const bytes = new TextEncoder().encode(value);
		this.u32(bytes.length);
		this.copy(bytes);
	}
	finish(): Uint8Array {
		return this.bytes.slice(0, this.position);
	}
}
function valueType(reader: Reader): void {
	if (![0x7f, 0x7e, 0x7d, 0x7c, 0x70, 0x6f].includes(reader.byte())) invalid();
}
function limits(reader: Reader): void {
	const flags = reader.byte();
	// No shared memories, memory64 or threads in this initial instrumentation path.
	if (flags > 1) invalid();
	reader.u32();
	if (flags) reader.u32();
}
function table(reader: Reader): void {
	if (![0x70, 0x6f].includes(reader.byte())) invalid();
	limits(reader);
}
interface Section {
	id: number;
	bytes: Uint8Array;
}

/** Portable binary instrumentation, not a page WebAssembly implementation.
 * The backend must validate the returned originalBytes before compiling bytes;
 * this structural reader does not replace the WebAssembly semantic validator.
 * Supply the reserved imports yourself, enforce a deadline/step budget and
 * use WasmCallDepth.run around instantiation and all synchronous WASM entries.
 * prevent untrusted imports from blocking. Set guardMemoryGrowth to route memory.grow
 * through the reserved i32 -> i32 import; admit one owned memory and enforce its
 * quotas in that hook. Unguarded instrumentation does not enforce memory quotas.
 * MVP + reference/bulk-memory instructions are supported; SIMD, threads, GC,
 * exceptions and tail calls are rejected. No runtime dependency is introduced.
 */
export function meterWasmModule(
	input: Uint8Array,
	options: { guardMemoryGrowth?: boolean } = {},
): {
	originalBytes: Uint8Array;
	bytes: Uint8Array;
	importModule: string;
	importName: string;
	enterImportName: string;
	leaveImportName: string;
	checkpoints: number;
	memoryGrowImportName?: string;
	memoryGrowInstructions: number;
} {
	const guardedGrowth = options.guardMemoryGrowth === true;
	const addedImports = guardedGrowth ? 4 : 3;
	const addedTypes = guardedGrowth ? 2 : 1;
	if (!(input instanceof Uint8Array) || !typedArrayByteLength) invalid();
	try {
		if (typedArrayByteLength.call(input) > maxInput) invalid();
	} catch {
		invalid();
	}
	// Own a stable snapshot, including when the caller supplies a shared view.
	// Subclass overrides of subarray/slice never participate in parsing.
	const originalBytes = new Uint8Array(input);
	const reader = new Reader(originalBytes);
	if (!magic.every((byte) => reader.byte() === byte)) invalid();
	const sections: Section[] = [];
	const ranks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 10];
	let rank = 0;
	while (reader.position < originalBytes.length) {
		if (sections.length >= maxEntries) invalid();
		const id = reader.byte();
		if (id > 12 || (id !== 0 && ranks[id] <= rank)) invalid();
		if (id) rank = ranks[id];
		sections.push({ id, bytes: reader.take(reader.u32()) });
	}
	let typeCount = 0;
	let importedFunctions = 0;
	let definedFunctions = 0;
	let memories = 0;
	const functionTypes: { parameters: number; results: number[] }[] = [];
	const definedTypes: number[] = [];
	for (const section of sections) {
		const r = new Reader(section.bytes);
		if (section.id === 1) {
			typeCount = r.count();
			for (let index = 0; index < typeCount; index++) {
				if (r.byte() !== 0x60) invalid();
				const parameters = r.count();
				for (let i = 0; i < parameters; i++) valueType(r);
				const resultCount = r.count();
				const start = r.position;
				for (let i = 0; i < resultCount; i++) valueType(r);
				functionTypes.push({
					parameters,
					results: [...r.bytes.subarray(start, r.position)],
				});
			}
			r.done();
		} else if (section.id === 2) {
			const count = r.count();
			if (count + addedImports > maxEntries) invalid();
			for (let index = 0; index < count; index++) {
				if (r.name() === meterModule) invalid();
				r.name();
				switch (r.byte()) {
					case 0:
						if (r.u32() >= typeCount) invalid();
						importedFunctions++;
						break;
					case 1:
						table(r);
						break;
					case 2:
						memories++;
						limits(r);
						break;
					case 3:
						valueType(r);
						if (r.byte() > 1) invalid();
						break;
					default:
						invalid();
				}
			}
			r.done();
		} else if (section.id === 3) {
			definedFunctions = r.count();
			for (let index = 0; index < definedFunctions; index++) {
				const type = r.u32();
				if (type >= typeCount) invalid();
				definedTypes.push(type);
			}
			r.done();
		} else if (section.id === 4 || section.id === 5) {
			const count = r.count();
			for (let index = 0; index < count; index++) {
				if (section.id === 4) table(r);
				else {
					memories++;
					limits(r);
				}
			}
			r.done();
		}
	}
	if (
		importedFunctions + definedFunctions + addedImports > maxEntries ||
		typeCount + addedTypes > maxEntries ||
		(guardedGrowth && memories > 1)
	)
		invalid();
	const wrapperTypes: number[][] = [];
	const wrapperIndices = new Map<string, number>();
	const blockTypes = new Map<number, Uint8Array>();
	for (const typeIndex of new Set(definedTypes)) {
		const type = functionTypes[typeIndex];
		const w = new Writer();
		if (!type.results.length) w.put(0x40);
		else if (type.results.length === 1) w.put(type.results[0]);
		else if (!type.parameters) w.s33(typeIndex);
		else {
			const key = type.results.join(",");
			let index = wrapperIndices.get(key);
			if (index === undefined) {
				index = typeCount + addedTypes + wrapperTypes.length;
				wrapperIndices.set(key, index);
				wrapperTypes.push(type.results);
			}
			w.s33(index);
		}
		blockTypes.set(typeIndex, w.finish());
	}
	if (typeCount + addedTypes + wrapperTypes.length > maxEntries) invalid();
	const functionIndex = (r: Reader, w: Writer) => {
		const index = r.u32();
		if (index >= importedFunctions + definedFunctions) invalid();
		w.u32(index < importedFunctions ? index : index + addedImports);
	};
	const expression = (r: Reader, w: Writer) => {
		for (let count = 0; count < maxEntries; count++) {
			const opcode = r.byte();
			w.put(opcode);
			if (opcode === 0x0b) return;
			if (opcode === 0xd2) {
				functionIndex(r, w);
				continue;
			}
			const start = r.position;
			if (opcode === 0x41) r.signed(32);
			else if (opcode === 0x42) r.signed(64);
			else if (opcode === 0x43) r.take(4);
			else if (opcode === 0x44) r.take(8);
			else if (opcode === 0x23) r.u32();
			else if (opcode === 0xd0) {
				if (![0x70, 0x6f].includes(r.byte())) invalid();
			} else invalid();
			w.copy(r.bytes.subarray(start, r.position));
		}
		invalid();
	};
	let checkpoints = 0;
	let memoryGrowInstructions = 0;
	const instrumentBody = (bytes: Uint8Array, typeIndex: number): Uint8Array => {
		const r = new Reader(bytes);
		const w = new Writer();
		const localGroups = r.count();
		let locals = 0;
		for (let i = 0; i < localGroups; i++) {
			locals += r.count();
			if (locals > maxEntries) invalid();
			valueType(r);
		}
		w.copy(bytes.subarray(0, r.position));
		w.put(0x10);
		w.u32(importedFunctions + 1);
		// Replace the implicit function label with a typed outer block. All original
		// branch depths still target the same labels; exits pass through leave.
		w.put(0x02);
		w.copy(blockTypes.get(typeIndex) ?? invalid());
		let depth = 1;
		while (depth) {
			if (++checkpoints > 1_048_576) invalid();
			// A void check preserves live operand-stack values. Loop branch targets
			// land before the first interior instruction's check, so back edges cannot
			// skip metering. Every defined-function entry is checked, including start.
			w.put(0x10);
			w.u32(importedFunctions);
			const opcode = r.byte();
			if (opcode === 0x0f) {
				w.put(0x0c);
				w.u32(depth - 1);
				continue;
			}
			if (opcode === 0x40) {
				memoryGrowInstructions++;
				if (guardedGrowth) {
					if (r.u32() !== 0) invalid();
					w.put(0x10);
					w.u32(importedFunctions + 3);
					continue;
				}
			}
			w.put(opcode);
			if (opcode === 0x10 || opcode === 0xd2) {
				functionIndex(r, w);
				continue;
			}
			const start = r.position;
			if ([0x02, 0x03, 0x04].includes(opcode)) {
				r.signed(33);
				if (++depth > 1024) invalid();
			} else if (opcode === 0x0b) depth--;
			else if ([0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26].includes(opcode))
				r.u32();
			else if (opcode === 0x0c || opcode === 0x0d) {
				if (r.u32() >= depth) invalid();
			} else if (opcode === 0x0e) {
				const count = r.count();
				for (let i = 0; i <= count; i++) if (r.u32() >= depth) invalid();
			} else if (opcode === 0x11) {
				r.u32();
				r.u32();
			} else if (opcode === 0x1c) {
				const count = r.count();
				for (let i = 0; i < count; i++) valueType(r);
			} else if (opcode >= 0x28 && opcode <= 0x3e) {
				r.u32();
				r.u32();
			} else if (opcode === 0x3f || opcode === 0x40) {
				if (r.u32() !== 0) invalid();
			} else if (opcode === 0x41) r.signed(32);
			else if (opcode === 0x42) r.signed(64);
			else if (opcode === 0x43) r.take(4);
			else if (opcode === 0x44) r.take(8);
			else if (opcode === 0xd0) {
				if (![0x70, 0x6f].includes(r.byte())) invalid();
			} else if (opcode === 0xfc) {
				const sub = r.u32();
				if ([8, 10, 12, 14].includes(sub)) {
					r.u32();
					r.u32();
				} else if ([9, 11, 13, 15, 16, 17].includes(sub)) r.u32();
				else if (sub > 7) invalid();
			} else if (
				![0x00, 0x01, 0x05, 0x0f, 0x1a, 0x1b, 0xd1].includes(opcode) &&
				!(opcode >= 0x45 && opcode <= 0xc4)
			)
				invalid();
			w.copy(bytes.subarray(start, r.position));
		}
		r.done();
		w.put(0x10);
		w.u32(importedFunctions + 2);
		w.put(0x0b);
		return w.finish();
	};
	const rewrite = (section: Section): Uint8Array => {
		const r = new Reader(section.bytes);
		const w = new Writer();
		if (section.id === 1 || section.id === 2) {
			w.u32(
				r.count() +
					(section.id === 1 ? addedTypes + wrapperTypes.length : addedImports),
			);
			w.copy(r.take(section.bytes.length - r.position));
			if (section.id === 1) {
				w.put(0x60, 0, 0);
				if (guardedGrowth) w.put(0x60, 1, 0x7f, 1, 0x7f);
				for (const results of wrapperTypes) {
					w.put(0x60, 0);
					w.u32(results.length);
					w.copy(Uint8Array.from(results));
				}
			} else {
				for (const name of [
					meterName,
					enterName,
					leaveName,
					...(guardedGrowth ? [memoryGrowName] : []),
				]) {
					w.name(meterModule);
					w.name(name);
					w.put(0);
					w.u32(typeCount + (name === memoryGrowName ? 1 : 0));
				}
			}
		} else if (section.id === 7) {
			const count = r.count();
			w.u32(count);
			for (let i = 0; i < count; i++) {
				w.name(r.name());
				const kind = r.byte();
				if (kind > 3) invalid();
				w.put(kind);
				if (kind === 0) functionIndex(r, w);
				else w.u32(r.u32());
			}
		} else if (section.id === 8) functionIndex(r, w);
		else if (section.id === 6) {
			const count = r.count();
			w.u32(count);
			for (let i = 0; i < count; i++) {
				const start = r.position;
				valueType(r);
				if (r.byte() > 1) invalid();
				w.copy(r.bytes.subarray(start, r.position));
				expression(r, w);
			}
		} else if (section.id === 9) {
			const count = r.count();
			w.u32(count);
			for (let i = 0; i < count; i++) {
				const flags = r.u32();
				if (flags > 7) invalid();
				w.u32(flags);
				if (flags === 2 || flags === 6) w.u32(r.u32());
				if ([0, 2, 4, 6].includes(flags)) expression(r, w);
				if ([1, 2, 3].includes(flags)) {
					if (r.byte() !== 0) invalid();
					w.put(0);
				}
				if ([5, 6, 7].includes(flags)) {
					const start = r.position;
					valueType(r);
					w.copy(r.bytes.subarray(start, r.position));
				}
				const length = r.count();
				w.u32(length);
				for (let j = 0; j < length; j++) {
					if (flags < 4) functionIndex(r, w);
					else expression(r, w);
				}
			}
		} else if (section.id === 10) {
			const count = r.count();
			if (count !== definedFunctions) invalid();
			w.u32(count);
			for (let i = 0; i < count; i++) {
				const body = instrumentBody(r.take(r.u32()), definedTypes[i]);
				w.u32(body.length);
				w.copy(body);
			}
		} else return section.bytes;
		r.done();
		return w.finish();
	};
	const output = new Writer();
	output.copy(Uint8Array.from(magic));
	const append = (id: number, bytes: Uint8Array) => {
		output.put(id);
		output.u32(bytes.length);
		output.copy(bytes);
	};
	const missing = new Set(
		[1, 2].filter((id) => !sections.some((section) => section.id === id)),
	);
	for (const section of sections) {
		if (section.id)
			for (const id of missing)
				if (id < section.id) {
					append(id, rewrite({ id, bytes: Uint8Array.of(0) }));
					missing.delete(id);
				}
		// Debug function names carry old indices; discard that optional section.
		if (section.id === 0 && new Reader(section.bytes).name() === "name")
			continue;
		append(section.id, rewrite(section));
	}
	for (const id of missing)
		append(id, rewrite({ id, bytes: Uint8Array.of(0) }));
	if (definedFunctions && !sections.some((section) => section.id === 10))
		invalid();
	return {
		originalBytes,
		bytes: output.finish(),
		importModule: meterModule,
		importName: meterName,
		enterImportName: enterName,
		leaveImportName: leaveName,
		checkpoints,
		memoryGrowImportName: guardedGrowth ? memoryGrowName : undefined,
		memoryGrowInstructions,
	};
}

/** Owns synchronous native entries and releases budget depths on traps/import
 * exceptions. Nested entries preserve caller frames. No asynchronous callback or
 * Promise may outlive run; WASM execution itself must remain synchronous.
 */
export class WasmCallDepth {
	private readonly frames: (() => void)[] = [];
	private readonly boundaries: number[] = [];
	constructor(private readonly budget: { enterCall(): () => void }) {}
	get depth(): number {
		return this.frames.length;
	}
	run<Result>(operation: () => Result): Result {
		const base = this.frames.length;
		this.boundaries.push(base);
		try {
			return operation();
		} finally {
			while (this.frames.length > base) this.frames.pop()?.();
			this.boundaries.pop();
		}
	}
	async runAsync<Result>(operation: () => Promise<Result>): Promise<Result> {
		if (this.boundaries.length)
			throw new AgentBrowserError(
				"invalid-input",
				"Overlapping asynchronous WASM entries",
			);
		this.boundaries.push(0);
		try {
			return await operation();
		} finally {
			while (this.frames.length) this.frames.pop()?.();
			this.boundaries.pop();
		}
	}
	enter(): void {
		if (!this.boundaries.length)
			throw new AgentBrowserError("invalid-input", "Unowned WASM entry");
		this.frames.push(this.budget.enterCall());
	}
	leave(): void {
		const base = this.boundaries[this.boundaries.length - 1];
		if (base === undefined || this.frames.length <= base)
			throw new AgentBrowserError("invalid-input", "Unbalanced WASM depth");
		this.frames.pop()?.();
	}
}
