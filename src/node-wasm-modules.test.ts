import { expect, it, vi } from "vitest";
import { NodeWasmModules } from "./node-wasm-modules.js";
const section = (id: number, bytes: number[]) => [id, bytes.length, ...bytes];
const bytes = (...sections: number[][]) =>
	Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0, ...sections.flat()]);
const valid = bytes(
	section(1, [1, 96, 0, 1, 127]),
	section(3, [1, 0]),
	section(7, [1, 3, 114, 117, 110, 0, 0]),
	section(10, [1, 4, 0, 65, 42, 11]),
);
function fixture(compile?: (bytes: Uint8Array) => Promise<WebAssembly.Module>) {
	const credits = new Map<object, number>();
	const controller = new AbortController();
	const budget = {
		visitNode: vi.fn(),
		setRetainedDataUsage(owner: object, size: number) {
			if (size) credits.set(owner, size);
			else credits.delete(owner);
		},
	};
	const owner = new NodeWasmModules(budget, controller.signal, compile);
	return { owner, controller, budget, credits };
}
it("validates original code before compiling and retains guarded modules with original reflection", async () => {
	const f = fixture();
	const token = await f.owner.compile(valid);
	const record = f.owner.record(token);
	expect(record.metering.memoryGrowImportName).toBe("memory_grow");
	expect(record.declarations.imports).toEqual([]);
	expect(record.declarations.exports).toMatchObject([
		{ name: "run", kind: "function", index: 0 },
	]);
	expect(WebAssembly.Module.imports(record.module)).toHaveLength(4);
	expect(f.owner.metrics()).toMatchObject({ modules: 1, pending: 0 });
	expect(f.credits.size).toBe(1);
	f.owner.close();
	expect(f.credits.size).toBe(0);
	expect(() => f.owner.record(token)).toThrow(/closed/);
});
it("rejects semantic errors which instrumentation could otherwise repair before native compilation", async () => {
	const compile = vi.fn(
		async (input: Uint8Array) => new WebAssembly.Module(input as BufferSource),
	);
	const f = fixture(compile);
	const invalid = bytes(
		section(1, [1, 96, 0, 1, 127]),
		section(3, [1, 0]),
		section(10, [1, 2, 0, 11]),
	);
	await expect(f.owner.compile(invalid)).rejects.toThrow(
		WebAssembly.CompileError,
	);
	expect(compile).not.toHaveBeenCalled();
	expect(f.credits.size).toBe(0);
	f.owner.close();
});
it.each([
	["defined memory", bytes(section(5, [1, 1, 1, 2]))],
	[
		"oversized memory",
		bytes(section(2, [1, 1, 101, 1, 109, 2, 1, 129, 16, 129, 16])),
	],
	["oversized table", bytes(section(4, [1, 112, 1, 129, 128, 4, 129, 128, 4]))],
	[
		"reference boundary",
		bytes(
			section(1, [1, 96, 1, 111, 0]),
			section(2, [1, 1, 101, 1, 102, 0, 0]),
		),
	],
	["global import", bytes(section(2, [1, 1, 101, 1, 103, 3, 127, 0]))],
])("rejects unsupported allocation or boundary: %s", async (_, input) => {
	const f = fixture();
	await expect(f.owner.compile(input)).rejects.toThrow(/WASM/);
	expect(f.owner.metrics().modules).toBe(0);
	expect(f.credits.size).toBe(0);
	f.owner.close();
});
it("owns pending compilation through cancellation and discards late native completion", async () => {
	let finish!: (module: WebAssembly.Module) => void;
	const f = fixture(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = f.owner.compile(valid);
	void pending.catch(() => {});
	await Promise.resolve();
	expect(f.owner.metrics().pending).toBe(1);
	expect(f.credits.size).toBe(1);
	f.controller.abort(new Error("cancel compile"));
	await expect(pending).rejects.toThrow("cancel compile");
	finish(new WebAssembly.Module(bytes()));
	await Promise.resolve();
	expect(f.owner.metrics().modules).toBe(0);
	await f.owner.close();
	expect(f.credits.size).toBe(0);
});
it("bounds concurrent compilation and rolls back failed native compilation", async () => {
	const finish: ((module: WebAssembly.Module) => void)[] = [];
	const f = fixture(() => new Promise((resolve) => finish.push(resolve)));
	const a = f.owner.compile(valid);
	const b = f.owner.compile(valid);
	void a.catch(() => {});
	void b.catch(() => {});
	await Promise.resolve();
	await expect(f.owner.compile(valid)).rejects.toThrow(/limit/);
	const closed = f.owner.close();
	await Promise.allSettled([a, b]);
	expect(f.credits.size).toBe(2);
	for (const resolve of finish) resolve(new WebAssembly.Module(bytes()));
	await closed;
	expect(f.credits.size).toBe(0);
	const g = fixture(async () => {
		throw new WebAssembly.CompileError("native failure");
	});
	await expect(g.owner.compile(valid)).rejects.toThrow("native failure");
	expect(g.credits.size).toBe(0);
	g.owner.close();
});
it("keeps metadata immutable and rejects foreign module tokens", () => {
	const f = fixture();
	const token = f.owner.compileSync(valid);
	const record = f.owner.record(token);
	expect(() => {
		(record.declarations.exports as unknown[]).push({});
	}).toThrow();
	expect(() => f.owner.record({})).toThrow(/Unowned/);
	f.owner.close();
});

it("rejects native table growth until its allocation hook is owned", async () => {
	const input = bytes(
		section(1, [1, 96, 0, 1, 127]),
		section(3, [1, 0]),
		section(4, [1, 112, 1, 0, 1]),
		section(10, [1, 9, 0, 208, 112, 65, 1, 252, 15, 0, 11]),
	);
	expect(WebAssembly.validate(input as BufferSource)).toBe(true);
	const f = fixture();
	await expect(f.owner.compile(input)).rejects.toThrow(/WASM/);
	expect(f.credits.size).toBe(0);
	await f.owner.close();
});
it("holds compilation slots and credits until native work actually settles after cancellation", async () => {
	let finish!: (module: WebAssembly.Module) => void;
	const f = fixture(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = f.owner.compile(valid);
	void pending.catch(() => {});
	await Promise.resolve();
	const closed = f.owner.close();
	await expect(pending).rejects.toThrow(/closed/);
	expect(f.owner.metrics()).toMatchObject({ pending: 1, modules: 0 });
	expect(f.credits.size).toBe(1);
	let settled = false;
	void closed.then(() => {
		settled = true;
	});
	await Promise.resolve();
	expect(settled).toBe(false);
	finish(new WebAssembly.Module(bytes()));
	await closed;
	expect(f.credits.size).toBe(0);
	expect(f.owner.metrics().pending).toBe(0);
});
it("rejects expired compilation deadlines before starting work and after native completion", async () => {
	const f = fixture();
	Object.defineProperty(f.budget, "deadline", { value: Date.now() - 1 });
	await expect(f.owner.compile(valid)).rejects.toThrow(/deadline/);
	expect(f.owner.metrics().compileCalls).toBe(0);
	await f.owner.close();
	const g = fixture(async () => {
		Object.defineProperty(g.budget, "deadline", { value: Date.now() - 1 });
		return new WebAssembly.Module(bytes());
	});
	await expect(g.owner.compile(valid)).rejects.toThrow(/deadline/);
	expect(g.credits.size).toBe(0);
	await g.owner.close();
});
it("enforces retained-byte quotas before starting native compilation", async () => {
	const compile = vi.fn(
		async (input: Uint8Array) => new WebAssembly.Module(input as BufferSource),
	);
	const f = fixture(compile);
	f.budget.setRetainedDataUsage = () => {
		throw new RangeError("data quota");
	};
	await expect(f.owner.compile(valid)).rejects.toThrow(/quota/);
	expect(compile).not.toHaveBeenCalled();
	expect(f.owner.metrics().retainedBytes).toBe(0);
	await f.owner.close();
});

it("retains module credit while an instance lease survives owner close", async () => {
	const f = fixture();
	const token = f.owner.compileSync(valid);
	const lease = f.owner.retain(token);
	const closing = f.owner.close();
	let settled = false;
	void closing.then(() => {
		settled = true;
	});
	await Promise.resolve();
	expect(f.credits.size).toBe(1);
	expect(settled).toBe(false);
	expect(lease.record.module).toBeInstanceOf(WebAssembly.Module);
	lease.release();
	lease.release();
	await closing;
	expect(f.credits.size).toBe(0);
	expect(f.owner.metrics().leases).toBe(0);
});
