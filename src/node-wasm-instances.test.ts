import { expect, it, vi } from "vitest";
import { NodeWasmCalls, type WasmPromiseApi } from "./node-wasm-calls.js";
import { NodeWasmInstances } from "./node-wasm-instances.js";
import { NodeWasmMemories } from "./node-wasm-memories.js";
import { NodeWasmModules } from "./node-wasm-modules.js";
import type { ReleasedHostDefinition } from "./safejs-extension-types.js";
const section = (id: number, bytes: number[]) => [id, bytes.length, ...bytes];
const binary = (...sections: number[][]) =>
	Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0, ...sections.flat()]);
const simple = binary(
	section(1, [1, 96, 0, 1, 127]),
	section(3, [1, 0]),
	section(7, [1, 3, 114, 117, 110, 0, 0]),
	section(10, [1, 4, 0, 65, 42, 11]),
);
const memoryInput = binary(
	section(1, [1, 96, 1, 127, 1, 127]),
	section(2, [1, 1, 101, 1, 109, 2, 1, 1, 2]),
	section(3, [1, 0]),
	section(7, [2, 4, 103, 114, 111, 119, 0, 0, 1, 109, 2, 0]),
	section(10, [1, 6, 0, 32, 0, 64, 0, 11]),
);
const imported = binary(
	section(1, [1, 96, 0, 1, 127]),
	section(2, [1, 1, 101, 1, 102, 0, 0]),
	section(3, [1, 0]),
	section(7, [1, 3, 114, 117, 110, 0, 1]),
	section(10, [1, 4, 0, 16, 0, 11]),
);
class Suspending {
	constructor(readonly operation: (...args: unknown[]) => Promise<unknown>) {}
}
const api: WasmPromiseApi = {
	Suspending,
	promising:
		(operation) =>
		(...args) =>
			Promise.resolve(operation(...args)),
};
function fixture(native?: ConstructorParameters<typeof NodeWasmInstances>[1]) {
	const controller = new AbortController();
	const credits = new Map<object, number>();
	let depth = 0;
	const budget = {
		visitNode: vi.fn(),
		allocateArrayLength: vi.fn(),
		provisionDataUsage: () => () => {},
		setRetainedDataUsage(token: object, size: number) {
			if (size) credits.set(token, size);
			else credits.delete(token);
		},
		enterCall() {
			depth++;
			return () => {
				depth--;
			};
		},
	};
	const context = {
		signal: controller.signal,
		createHostObject(def: ReleasedHostDefinition) {
			const result = Object.create(null);
			for (const [key, d] of Object.entries(def.properties ?? {}))
				Object.defineProperty(result, key, d);
			for (const [key, fn] of Object.entries(def.methods ?? {}))
				Object.defineProperty(result, key, { value: fn });
			return result;
		},
		createArrayBufferReference: (buffer: ArrayBuffer) => buffer,
		releaseGuestReference: () => {},
		invokeCallback: vi.fn(
			async (callback: unknown, opts?: { args?: readonly unknown[] }) =>
				(callback as (...args: unknown[]) => unknown)(...(opts?.args ?? [])),
		),
	};
	const modules = new NodeWasmModules(budget, controller.signal);
	const memories = new NodeWasmMemories(context, budget);
	const calls = new NodeWasmCalls(budget, controller.signal, api);
	const owner = new NodeWasmInstances(
		{ context, budget, modules, memories, calls },
		native,
	);
	async function close() {
		await owner.close();
		await modules.close();
		memories.close();
	}
	return {
		owner,
		modules,
		memories,
		calls,
		budget,
		context,
		credits,
		controller,
		close,
		get depth() {
			return depth;
		},
	};
}
it("instantiates admitted modules and meters every exported invocation", async () => {
	const f = fixture();
	const module = f.modules.compileSync(simple);
	const token = f.owner.instantiate(module, []);
	expect(await f.owner.invoke(token, "run", [])).toBe(42);
	expect(f.depth).toBe(0);
	expect(f.owner.metrics().instances).toBe(1);
	expect(f.credits.size).toBe(2);
	await f.close();
	expect(f.credits.size).toBe(0);
	await expect(f.owner.invoke(token, "run", [])).rejects.toThrow(/closed/);
});
it("binds only owned imported memory and exports its original handle", async () => {
	const f = fixture();
	const module = f.modules.compileSync(memoryInput);
	const handle = f.memories.createMemory(1, 2);
	const token = f.owner.instantiate(module, [handle]);
	expect(f.owner.memoryExport(token, "m")).toBe(handle);
	expect(await f.owner.invoke(token, "grow", [1])).toBe(1);
	expect(f.memories.nativeMemory(handle)?.buffer.byteLength).toBe(131072);
	expect(await f.owner.invoke(token, "grow", [-1])).toBe(-1);
	expect(() =>
		f.owner.instantiate(module, [
			new WebAssembly.Memory({ initial: 1, maximum: 2 }),
		]),
	).toThrow(/Unowned/);
	await f.close();
});
it("rejects hostile argument arrays without invoking native accessors or proxies", async () => {
	const f = fixture();
	const module = f.modules.compileSync(simple);
	const token = f.owner.instantiate(module, []);
	const get = vi.fn(() => 1);
	const args: number[] = [];
	Object.defineProperty(args, 0, { get });
	await expect(f.owner.invoke(token, "run", args)).rejects.toThrow(/data/);
	expect(get).not.toHaveBeenCalled();
	expect(() => f.owner.instantiate(module, new Proxy([], {}))).toThrow();
	await expect(
		f.owner.invoke(token, "run", new Proxy([], {})),
	).rejects.toThrow();
	await f.close();
});
it("retains instance allocation credits and module leases until suspended native calls finish", async () => {
	let finish!: (value: number) => void;
	const f = fixture(
		() =>
			({
				exports: {
					run: () =>
						new Promise((resolve) => {
							finish = resolve;
						}),
				},
			}) as unknown as WebAssembly.Instance,
	);
	const module = f.modules.compileSync(simple);
	const token = f.owner.instantiate(module, []);
	const pending = f.owner.invoke(token, "run", []);
	const closing = f.owner.close();
	expect(f.credits.size).toBe(2);
	finish(42);
	await expect(pending).rejects.toThrow();
	await closing;
	expect(f.credits.size).toBe(1);
	await f.modules.close();
	expect(f.credits.size).toBe(0);
	f.memories.close();
});
it("checks imported callback ownership through the realm and permits borrowed handles to survive instance close", async () => {
	let installed: WebAssembly.Imports | undefined;
	const f = fixture((_, imports) => {
		installed = imports;
		return {
			exports: {
				run: () => (imports.e.f as unknown as Suspending).operation(),
			},
		} as unknown as WebAssembly.Instance;
	});
	const module = f.modules.compileSync(imported);
	const callback = vi.fn(() => 42);
	const token = f.owner.instantiate(module, [callback]);
	expect(installed).toBeDefined();
	expect(await f.owner.invoke(token, "run", [])).toBe(42);
	expect(f.context.invokeCallback).toHaveBeenCalledWith(callback, { args: [] });
	await f.close();
	expect(callback()).toBe(42);
});
it("rolls back native allocation credit and module lease on failed native instantiation", async () => {
	const f = fixture(() => {
		throw new WebAssembly.RuntimeError("start trap");
	});
	const module = f.modules.compileSync(simple);
	expect(() => f.owner.instantiate(module, [])).toThrow("start trap");
	expect(f.credits.size).toBe(1);
	expect(f.modules.metrics().leases).toBe(0);
	await f.close();
});
it("preflights per-instance table and global allocation charges before native instantiation", async () => {
	const native = vi.fn(() => ({ exports: {} }) as WebAssembly.Instance);
	const f = fixture(native);
	const module = f.modules.compileSync(
		binary(section(4, [1, 112, 1, 3, 3]), section(6, [1, 127, 0, 65, 0, 11])),
	);
	const token = f.owner.instantiate(module, []);
	expect(f.owner.metrics().retainedBytes).toBeGreaterThanOrEqual(32);
	expect(f.budget.allocateArrayLength).toHaveBeenCalledWith(3);
	expect(token).toBeDefined();
	await f.close();
});

it("bounds retained instances and leaves foreign instance tokens unusable", async () => {
	const f = fixture();
	const module = f.modules.compileSync(simple);
	for (let i = 0; i < 8; i++) f.owner.instantiate(module, []);
	expect(() => f.owner.instantiate(module, [])).toThrow(/limit/);
	await expect(f.owner.invoke({}, "run", [])).rejects.toThrow(/Unowned/);
	await f.close();
	expect(f.credits.size).toBe(0);
});
it("preserves repeated import resolution and prototype-shaped names without native getter access", async () => {
	const string = (value: string) => [
		value.length,
		...new TextEncoder().encode(value),
	];
	const input = binary(
		section(1, [1, 96, 0, 0]),
		section(2, [
			2,
			...string("__proto__"),
			...string("__proto__"),
			0,
			0,
			...string("__proto__"),
			...string("__proto__"),
			0,
			0,
		]),
	);
	const values: unknown[] = [];
	const f = fixture((_, imports) => {
		expect(Object.getPrototypeOf(imports)).toBe(null);
		const names = imports.__proto__;
		expect(Object.getPrototypeOf(names)).toBe(null);
		values.push(names.__proto__, names.__proto__);
		return { exports: {} } as WebAssembly.Instance;
	});
	const module = f.modules.compileSync(input);
	f.owner.instantiate(module, [() => {}, () => {}]);
	expect(values).toHaveLength(2);
	expect(values[0]).not.toBe(values[1]);
	await f.close();
});
it("fails instance quotas before native allocation and releases the borrowed module lease", async () => {
	const native = vi.fn(() => ({ exports: {} }) as WebAssembly.Instance);
	const f = fixture(native);
	const module = f.modules.compileSync(simple);
	const original = f.budget.setRetainedDataUsage;
	f.budget.setRetainedDataUsage = (token, usage) => {
		if (usage) throw new RangeError("instance quota");
		original(token, usage);
	};
	expect(() => f.owner.instantiate(module, [])).toThrow(/quota/);
	expect(native).not.toHaveBeenCalled();
	expect(f.modules.metrics().leases).toBe(0);
	await f.close();
});

it("rejects asynchronous start imports before invoking borrowed guest callbacks", async () => {
	const input = binary(
		section(1, [1, 96, 0, 0]),
		section(2, [1, 1, 101, 1, 102, 0, 0]),
		section(3, [1, 0]),
		section(8, [1]),
		section(10, [1, 4, 0, 16, 0, 11]),
	);
	const f = fixture((_, imports) => {
		(imports.e.f as unknown as Suspending).operation();
		return { exports: {} } as WebAssembly.Instance;
	});
	const module = f.modules.compileSync(input);
	const callback = vi.fn(() => {});
	expect(() => f.owner.instantiate(module, [callback])).toThrow(
		/start functions/,
	);
	expect(f.context.invokeCallback).not.toHaveBeenCalled();
	expect(callback).not.toHaveBeenCalled();
	expect(f.modules.metrics().leases).toBe(0);
	await f.close();
});
