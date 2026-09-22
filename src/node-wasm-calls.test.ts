import { expect, it } from "vitest";
import { NodeWasmCalls, type WasmPromiseApi } from "./node-wasm-calls.js";

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
function fixture() {
	let current = 2;
	let steps = 0;
	const owner = new AbortController();
	const calls = new NodeWasmCalls(
		{
			visitNode() {
				steps++;
			},
			enterCall() {
				current++;
				return () => {
					current--;
				};
			},
		},
		owner.signal,
		api,
	);
	const imports = calls.meterImports({
		importModule: "meter",
		importName: "step",
		enterImportName: "enter",
		leaveImportName: "leave",
	}).meter as { step(): void; enter(): void; leave(): void };
	return {
		calls,
		owner,
		imports,
		get current() {
			return current;
		},
		get steps() {
			return steps;
		},
	};
}
function paused() {
	let finish!: (value: number) => void;
	const promise = new Promise<number>((resolve) => {
		finish = resolve;
	});
	return { promise, finish };
}

it("retains suspended depths and resumes the numeric import result", async () => {
	const f = fixture();
	const pause = paused();
	const imported = f.calls.suspending(() => pause.promise) as Suspending;
	const pending = f.calls.invoke(async () => {
		f.imports.enter();
		f.imports.step();
		const value = await imported.operation(3);
		f.imports.leave();
		return Number(value) + 1;
	});
	expect(f.current).toBe(3);
	expect(f.calls.callDepth).toBe(1);
	pause.finish(41);
	expect(await pending).toBe(42);
	expect(f.current).toBe(2);
	expect(f.calls.pendingCalls).toBe(0);
	await f.calls.close();
});
it("isolates concurrent native stacks that settle in either order", async () => {
	const f = fixture();
	const a = paused();
	const b = paused();
	const first = f.calls.invoke(async () => {
		f.imports.enter();
		await a.promise;
		f.imports.leave();
		return 1;
	});
	const second = f.calls.invoke(async () => {
		f.imports.enter();
		await b.promise;
		f.imports.leave();
		return 2;
	});
	expect(f.current).toBe(4);
	b.finish(0);
	expect(await second).toBe(2);
	expect(f.current).toBe(3);
	a.finish(0);
	expect(await first).toBe(1);
	expect(f.current).toBe(2);
	await f.calls.close();
});
it("preserves outer frames through an imported callback that reenters WASM", async () => {
	const f = fixture();
	const imported = f.calls.suspending(async () => {
		expect(f.calls.callDepth).toBe(1);
		const result = await f.calls.invoke(() => {
			f.imports.enter();
			expect(f.calls.callDepth).toBe(2);
			f.imports.leave();
			return 41;
		});
		expect(f.calls.callDepth).toBe(1);
		return result;
	}) as Suspending;
	expect(
		await f.calls.invoke(async () => {
			f.imports.enter();
			const value = await imported.operation();
			f.imports.leave();
			return Number(value) + 1;
		}),
	).toBe(42);
	expect(f.current).toBe(2);
	await f.calls.close();
});
it("cancels an import that never settles and releases its frames", async () => {
	const f = fixture();
	const imported = f.calls.suspending(
		() => new Promise(() => {}),
	) as Suspending;
	const pending = f.calls.invoke(async () => {
		f.imports.enter();
		return imported.operation();
	});
	const reason = new Error("cancelled");
	f.owner.abort(reason);
	await expect(pending).rejects.toBe(reason);
	expect(f.current).toBe(2);
	expect(f.calls.pendingCalls).toBe(0);
	await f.calls.close();
});
it("close cancels pending imports and prevents late callbacks from resuming WASM", async () => {
	const f = fixture();
	const pause = paused();
	const imported = f.calls.suspending(() => pause.promise) as Suspending;
	let resumed = false;
	const pending = f.calls.invoke(async () => {
		f.imports.enter();
		await imported.operation();
		resumed = true;
		f.imports.leave();
		return 1;
	});
	void pending.catch(() => {});
	await f.calls.close();
	await expect(pending).rejects.toThrow(/closed/);
	pause.finish(7);
	await Promise.resolve();
	expect(resumed).toBe(false);
	expect(f.current).toBe(2);
	await expect(f.calls.invoke(() => 1)).rejects.toThrow(/closed/);
});
it("unwinds imports' thrown values and bounds results to numeric WASM values", async () => {
	const f = fixture();
	const reason = new Error("import failed");
	for (const result of [
		() => {
			throw reason;
		},
		() => ({ secret: 1 }),
		() => [1, "bad"],
	]) {
		const imported = f.calls.suspending(result) as Suspending;
		await expect(
			f.calls.invoke(async () => {
				f.imports.enter();
				return imported.operation();
			}),
		).rejects.toBeDefined();
		expect(f.current).toBe(2);
	}
	expect(await f.calls.invoke(() => [42, 7n])).toEqual([42, 7n]);
	await f.calls.close();
});
it("rejects unowned imports and metering hooks before invoking a callback", async () => {
	const f = fixture();
	let called = false;
	const imported = f.calls.suspending(() => {
		called = true;
		return 1;
	}) as Suspending;
	expect(() => imported.operation()).toThrow(/Unowned/);
	expect(called).toBe(false);
	expect(() => f.imports.step()).toThrow(/Unowned/);
	await f.calls.close();
});
it("refuses unavailable JSPI and asynchronous imports in synchronous start functions", async () => {
	expect(
		() =>
			new NodeWasmCalls(
				{
					visitNode() {},
					enterCall() {
						return () => {};
					},
				},
				new AbortController().signal,
				{},
			),
	).toThrow(/promise integration/);
	const f = fixture();
	let called = false;
	const imported = f.calls.suspending(() => {
		called = true;
		return 1;
	}) as Suspending;
	expect(() =>
		f.calls.instantiate(() => {
			f.imports.enter();
			return imported.operation();
		}),
	).toThrow(/start/);
	expect(called).toBe(false);
	expect(f.current).toBe(2);
	await f.calls.close();
});

it("waits for native frames when close is initiated inside an import", async () => {
	const f = fixture();
	let depthOnClose = -1;
	const imported = f.calls.suspending(async () => {
		await f.calls.close();
		depthOnClose = f.calls.callDepth;
		return 1;
	}) as Suspending;
	await expect(
		f.calls.invoke(async () => {
			f.imports.enter();
			return imported.operation();
		}),
	).rejects.toThrow(/closed/);
	await f.calls.close();
	await Promise.resolve();
	expect(depthOnClose).toBe(0);
	expect(f.current).toBe(2);
});

it("rejects sparse numeric lists and nonnumeric invocation arguments", async () => {
	const f = fixture();
	let invoked = false;
	await expect(
		f.calls.invoke(() => {
			invoked = true;
			return 1;
		}, new Array<number>(1)),
	).rejects.toThrow(/numeric/);
	expect(invoked).toBe(false);
	await expect(f.calls.invoke(() => new Array<number>(1))).rejects.toThrow(
		/numeric/,
	);
	await f.calls.close();
});
it("bounds concurrent entries before starting another callback", async () => {
	const f = fixture();
	const imported = f.calls.suspending(
		() => new Promise(() => {}),
	) as Suspending;
	const pending = Array.from({ length: 64 }, () =>
		f.calls.invoke(async () => {
			f.imports.enter();
			return imported.operation();
		}),
	);
	for (const promise of pending) void promise.catch(() => {});
	expect(f.calls.pendingCalls).toBe(64);
	await expect(f.calls.invoke(() => 42)).rejects.toThrow(/call limit/);
	await f.calls.close();
	await Promise.allSettled(pending);
	expect(f.current).toBe(2);
	expect(f.calls.callDepth).toBe(0);
});
