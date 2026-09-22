import { createContext, runInContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { NodeWasmMemories } from "./node-wasm-memories.js";
import { pageWasmMemoryBootstrapSource } from "./page-wasm-memory-bootstrap.js";
import type { ReleasedHostDefinition } from "./safejs-extension-types.js";

function fixture(maxBytes = 4 * 65536) {
	const controller = new AbortController();
	const references = new Set<object>();
	let retained = 0;
	const budget = {
		allocateArrayLength: vi.fn((bytes: number) => {
			if (bytes > maxBytes) throw new RangeError("array quota");
		}),
		provisionDataUsage: vi.fn((bytes: number) => {
			if (retained + bytes > maxBytes) throw new RangeError("data quota");
			return vi.fn();
		}),
	};
	const context = {
		signal: controller.signal,
		createHostObject(definition: ReleasedHostDefinition) {
			const object = Object.create(null);
			for (const [key, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, key, descriptor);
			for (const [key, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, key, { value: method });
			return object;
		},
		createArrayBufferReference(buffer: ArrayBuffer) {
			references.add(buffer);
			retained += buffer.byteLength;
			return buffer;
		},
		releaseGuestReference(value: unknown) {
			references.delete(value as object);
			retained = Array.from(
				references,
				(buffer) => (buffer as ArrayBuffer).byteLength,
			).reduce((a, b) => a + b, 0);
		},
	};
	const owner = new NodeWasmMemories(context, budget);
	const vm = createContext({ __agentBrowserWasmMemories: owner.port });
	const evaluate = (source: string) =>
		runInContext(source, vm, { timeout: 1000 });
	evaluate(pageWasmMemoryBootstrapSource);
	return { owner, evaluate, controller, budget, references, context };
}
it("owns native memory with stable guest buffers and shared writes", () => {
	const f = fixture();
	f.evaluate(
		"var memory=new WebAssembly.Memory({initial:1,maximum:3}); memory",
	);
	expect(
		f.evaluate(
			"[memory.buffer===memory.buffer,memory instanceof WebAssembly.Memory,Object.prototype.toString.call(memory)]",
		),
	).toEqual([true, true, "[object WebAssembly.Memory]"]);
	f.evaluate("new Uint8Array(memory.buffer)[0]=42");
	expect(new Uint8Array([...f.references][0] as ArrayBuffer)[0]).toBe(42);
	expect(f.owner.metrics().retainedBytes).toBe(65536);
	f.owner.close();
	expect(f.references.size).toBe(0);
});
it("refreshes buffer identity, detaches old views and preserves bytes on grow", () => {
	const f = fixture();
	expect(
		f.evaluate(
			"var m=new WebAssembly.Memory({initial:1,maximum:3});var b=m.buffer;var v=new Uint8Array(b);v[0]=42;var pages=m.grow(1);[pages,b.byteLength,v.length,m.buffer.byteLength,new Uint8Array(m.buffer)[0],m.buffer===b]",
		),
	).toEqual([1, 0, 0, 131072, 42, false]);
	expect(f.references.size).toBe(1);
	expect(f.owner.metrics().retainedBytes).toBe(131072);
	expect(
		f.evaluate(
			"var old=m.buffer;m.grow(0);[old.byteLength,m.buffer===old,m.buffer.byteLength]",
		),
	).toEqual([0, false, 131072]);
	f.owner.close();
});
it("rejects growth before detaching or changing bytes when quotas fail", () => {
	const f = fixture(65536);
	f.evaluate(
		"var m=new WebAssembly.Memory({initial:1,maximum:3});var b=m.buffer;new Uint8Array(b)[0]=42",
	);
	expect(() => f.evaluate("m.grow(1)")).toThrow(/quota/);
	expect(
		f.evaluate("[m.buffer===b,b.byteLength,new Uint8Array(b)[0]]"),
	).toEqual([true, 65536, 42]);
	f.owner.close();
});
it.each([
	"{}",
	"{initial:-1}",
	"{initial:Infinity}",
	"{initial:2,maximum:1}",
	"{initial:1,shared:true}",
	"{initial:1,address:'i64'}",
	"{initial:2049}",
])("rejects unsupported or invalid descriptors %s", (input) => {
	const f = fixture();
	expect(() => f.evaluate(`new WebAssembly.Memory(${input})`)).toThrow();
	expect(f.owner.metrics().memories).toBe(0);
	f.owner.close();
});
it("converts descriptor getters once and enforces receiver brands", () => {
	const f = fixture();
	expect(
		f.evaluate(
			"var reads=[];var m=new WebAssembly.Memory({get initial(){reads.push('initial');return '1.9'},get maximum(){reads.push('maximum');return 2},get shared(){reads.push('shared');return false},get address(){reads.push('address');return undefined}});[reads,m.buffer.byteLength]",
		),
	).toEqual([["initial", "maximum", "shared", "address"], 65536]);
	expect(() => f.evaluate("WebAssembly.Memory({initial:1})")).toThrow();
	expect(() =>
		f.evaluate("WebAssembly.Memory.prototype.grow.call({},0)"),
	).toThrow();
	expect(() =>
		f.evaluate(
			"Object.getOwnPropertyDescriptor(WebAssembly.Memory.prototype,'buffer').get.call({})",
		),
	).toThrow();
	f.owner.close();
});
it("bounds memory count and growth calls, revoking after close or abort", () => {
	const f = fixture(16 * 65536);
	for (let i = 0; i < 8; i++)
		f.evaluate("new WebAssembly.Memory({initial:0,maximum:0})");
	expect(() => f.evaluate("new WebAssembly.Memory({initial:0})")).toThrow(
		/limit/,
	);
	f.owner.close();
	f.owner.close();
	expect(() => f.evaluate("new WebAssembly.Memory({initial:0})")).toThrow(
		/closed/,
	);
	const g = fixture();
	g.evaluate("var m=new WebAssembly.Memory({initial:1})");
	g.controller.abort();
	expect(() => g.evaluate("m.buffer")).toThrow(/closed/);
	expect(g.owner.metrics().memories).toBe(0);
});
it("admits primitive host arguments only and exposes native memory only for owned handles", () => {
	const f = fixture();
	const handle = (
		f.owner.port as { create(initial: unknown, maximum: unknown): object }
	).create(1, 2);
	expect(f.owner.nativeMemory(handle)).toBeInstanceOf(WebAssembly.Memory);
	expect(f.owner.nativeMemory({})).toBeUndefined();
	expect(() =>
		(
			f.owner.port as { create(initial: unknown, maximum: unknown): object }
		).create(
			{
				valueOf() {
					throw new Error("called");
				},
			},
			2,
		),
	).toThrow(/Invalid/);
	f.owner.close();
	expect(() => f.owner.nativeMemory(handle)).toThrow(/closed/);
});

it.each([
	"m.grow()",
	"m.grow(NaN)",
	"m.grow(-0.9)",
	"m.grow(2**32)",
	"m.grow(1n)",
])("matches wasm32 numeric rejection: %s", (source) => {
	const f = fixture();
	f.evaluate("var m=new WebAssembly.Memory({initial:1})");
	expect(() => f.evaluate(source)).toThrow(/Invalid WASM memory index/);
	f.owner.close();
});

it("preflights data quotas independently of array quotas", () => {
	const f = fixture();
	f.evaluate("var m=new WebAssembly.Memory({initial:1});var old=m.buffer");
	f.budget.provisionDataUsage.mockImplementationOnce(() => {
		throw new RangeError("data quota");
	});
	expect(() => f.evaluate("m.grow(1)")).toThrow(/data quota/);
	expect(f.evaluate("[old===m.buffer,old.byteLength]")).toEqual([true, 65536]);
	f.owner.close();
});
it("closes ownership if new live reference admission fails after irreversible growth", () => {
	const f = fixture();
	f.evaluate("var m=new WebAssembly.Memory({initial:1});var old=m.buffer");
	f.context.createArrayBufferReference = () => {
		throw new Error("reference limit");
	};
	expect(() => f.evaluate("m.grow(1)")).toThrow(/reference limit/);
	expect(f.evaluate("old.byteLength")).toBe(0);
	expect(f.references.size).toBe(0);
	expect(() => f.evaluate("m.buffer")).toThrow(/closed/);
	expect(f.owner.metrics().memories).toBe(0);
});
it("rolls back live references if the host record factory fails", () => {
	const f = fixture();
	f.context.createHostObject = () => {
		throw new Error("host limit");
	};
	expect(() => f.owner.createMemory(1, 2)).toThrow(/host limit/);
	expect(f.references.size).toBe(0);
	expect(f.owner.metrics().retainedBytes).toBe(0);
	f.owner.close();
});
it("bounds repeated grow(0) calls without retaining detached buffer references", () => {
	const f = fixture();
	f.evaluate(
		"var m=new WebAssembly.Memory({initial:0,maximum:0});for(let i=0;i<4096;i++)m.grow(0)",
	);
	expect(() => f.evaluate("m.grow(0)")).toThrow(/limit/);
	expect(f.references.size).toBe(1);
	f.owner.close();
});

it("implements WASM signed-i32 growth and returns -1 for maximum failure without detaching", () => {
	const f = fixture();
	const handle = f.owner.createMemory(1, 2);
	const memory = f.owner.nativeMemory(handle);
	if (!memory) throw new Error("Missing native memory");
	const original = memory.buffer;
	expect(f.owner.wasmGrow(handle, -1)).toBe(-1);
	expect(memory.buffer).toBe(original);
	expect(f.owner.wasmGrow(handle, 1)).toBe(1);
	expect(original.byteLength).toBe(0);
	const grown = memory.buffer;
	expect(f.owner.wasmGrow(handle, 1)).toBe(-1);
	expect(memory.buffer).toBe(grown);
	expect(f.owner.wasmGrow(handle, 0)).toBe(2);
	expect(grown.byteLength).toBe(0);
	f.owner.close();
});
it("fails WASM quota exhaustion before mutation and rejects foreign handles", () => {
	const f = fixture(65536);
	const handle = f.owner.createMemory(1, 3);
	const memory = f.owner.nativeMemory(handle);
	if (!memory) throw new Error("Missing native memory");
	const original = memory.buffer;
	expect(() => f.owner.wasmGrow(handle, 1)).toThrow(/quota/);
	expect(memory.buffer).toBe(original);
	expect(() => f.owner.wasmGrow({}, 0)).toThrow(/Unowned/);
	expect(() => f.owner.wasmGrow(handle, 2 ** 32)).toThrow(/i32/);
	f.owner.close();
});
