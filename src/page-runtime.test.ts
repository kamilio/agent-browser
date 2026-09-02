import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import type { PageBindingContext } from "./page-bindings.js";
import { readPageConsole } from "./page-console.js";
import type {
	PageRuntime,
	PageRuntimeFactory,
	PageRuntimeOptions,
	PageRuntimeResult,
} from "./page-runtime.js";
import { PageScripts } from "./page-scripts.js";

const owners: { scripts: PageScripts; tree: DocumentTree }[] = [];
afterEach(async () => {
	for (const { scripts, tree } of owners.splice(0)) {
		await scripts.close();
		tree.close();
	}
	vi.useRealTimers();
});

function fixture(timeoutMs = 1000) {
	const tree = new DocumentTree("https://example.com/");
	const interactions = new DocumentInteractions(tree);
	let options: PageRuntimeOptions | undefined;
	const context: PageBindingContext = {
		createHostObject(definition) {
			const value = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(value, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(value, name, { value: method });
			return value;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference() {},
	};
	const runtime = {
		budget: { stepsUsed: 7, peakCallDepth: 2, peakDataSize: 12 },
		closed: false,
		initialize: vi.fn(async () => {
			if (!options) throw new Error("Missing runtime options");
			options.setup(context);
		}),
		evaluate: vi.fn(
			async (
				_source: string,
				_options: { signal: AbortSignal; filename?: string },
			): Promise<PageRuntimeResult> => ({
				ok: true,
				returnValue: { answer: 42 },
			}),
		),
		copyResult: vi.fn((value: unknown) => value),
		startCallback: vi.fn<PageRuntime["startCallback"]>(() => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(undefined),
		})),
		errorDetails: vi.fn(() => ({ code: "runtime-failure", budget: "Steps" })),
		close: vi.fn(async () => {
			runtime.closed = true;
		}),
	};
	const factory: PageRuntimeFactory = {
		createPageRuntime(input) {
			options = input;
			return runtime;
		},
	};
	const scripts = new PageScripts({ document: tree, interactions }, factory, {
		limits: { timeoutMs },
	});
	owners.push({ scripts, tree });
	return {
		tree,
		interactions,
		scripts,
		runtime,
		context,
		options: () => {
			if (!options) throw new Error("Missing runtime options");
			return options;
		},
	};
}

it("creates lazy bindings once, preserves aliases and forwards source options", async () => {
	const test = fixture();
	expect(test.runtime.initialize).not.toHaveBeenCalled();
	expect(test.scripts.metrics()).toMatchObject({
		initialized: false,
		evaluations: 0,
	});
	expect(test.scripts.metrics().dom).toBeUndefined();
	expect(() => test.scripts.dom).toThrow("not been initialized");
	const result = await test.scripts.evaluate("first", {
		filename: "fixture.js",
	});
	expect(result).toMatchObject({
		ok: true,
		value: { answer: 42 },
		metrics: { steps: 7 },
	});
	expect(test.runtime.evaluate.mock.calls[0][1]).toMatchObject({
		filename: "fixture.js",
		signal: expect.any(AbortSignal),
	});
	expect((test.scripts.window as { document: object }).document).toBe(
		test.scripts.dom.document,
	);
	await test.scripts.evaluate("second");
	expect(test.runtime.initialize).toHaveBeenCalledTimes(1);
	expect(test.scripts.metrics()).toMatchObject({
		initialized: true,
		evaluations: 2,
	});
});

it("closing an unused owner does not initialize or acquire DOM capabilities", async () => {
	const test = fixture();
	await test.scripts.close();
	await test.scripts.close();
	expect(test.runtime.initialize).not.toHaveBeenCalled();
	expect(test.runtime.close).toHaveBeenCalledTimes(1);
	expect(test.options().signal.aborted).toBe(true);
	expect(test.scripts.metrics().dom).toBeUndefined();
	expect(test.interactions.events.metrics().closed).toBe(false);
});

it("honors tagged runtime failures instead of projecting them as successful values", async () => {
	const test = fixture();
	test.runtime.evaluate.mockResolvedValue({
		ok: false,
		error: { code: "budget", budget: "Steps" },
	});
	const result = await test.scripts.evaluate("failed");
	expect(result).toMatchObject({
		ok: false,
		error: { code: "budget", budget: "Steps" },
	});
	expect(test.runtime.copyResult).not.toHaveBeenCalled();
	expect(test.scripts.closed).toBe(false);
	expect(JSON.stringify(readPageConsole(test.tree))).toContain(
		"Page evaluation failed: budget",
	);
});

it("closes browser-owned bindings when a tagged failure poisons the runtime", async () => {
	const test = fixture();
	test.runtime.evaluate.mockImplementation(async () => {
		test.runtime.closed = true;
		return { ok: false, error: { code: "budget" } };
	});
	expect(await test.scripts.evaluate("failed")).toMatchObject({ ok: false });
	expect(test.scripts.closed).toBe(true);
	expect(test.scripts.metrics().dom?.classLists.closed).toBe(true);
	expect(test.runtime.close).toHaveBeenCalledTimes(1);
});

it("sanitizes tagged diagnostics without exposing arbitrary error text", async () => {
	const test = fixture();
	test.runtime.evaluate.mockResolvedValue({
		ok: false,
		error: { code: "private token=secret", budget: "bad\nvalue" },
	});
	const result = await test.scripts.evaluate("failed");
	expect(result).toMatchObject({ ok: false, error: { code: "script-error" } });
	expect(JSON.stringify(result)).not.toContain("secret");
	expect(JSON.stringify(readPageConsole(test.tree))).not.toContain("secret");
});

it("uses the adapter's public error classification without requiring an SDK error class", async () => {
	const test = fixture();
	test.runtime.evaluate.mockRejectedValue(new Error("sensitive cause"));
	expect(await test.scripts.evaluate("failed")).toMatchObject({
		ok: false,
		error: { code: "runtime-failure", budget: "Steps" },
	});
	expect(test.runtime.errorDetails).toHaveBeenCalled();
});

it("closes partially initialized bindings after setup failure", async () => {
	const test = fixture();
	test.runtime.initialize.mockImplementation(async () => {
		test.options().setup(test.context);
		throw new Error("setup failed");
	});
	expect(await test.scripts.evaluate("never")).toMatchObject({ ok: false });
	expect(test.runtime.evaluate).not.toHaveBeenCalled();
	expect(test.runtime.close).toHaveBeenCalledTimes(1);
	expect(test.scripts.metrics().dom?.classLists.closed).toBe(true);
	expect(test.interactions.events.metrics().closed).toBe(false);
});

it("rejects repeated setup rather than leaking a replacement capability owner", async () => {
	const test = fixture();
	test.runtime.initialize.mockImplementation(async () => {
		test.options().setup(test.context);
		test.options().setup(test.context);
	});
	await expect(test.scripts.evaluate("never")).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(test.scripts.closed).toBe(true);
	expect(test.scripts.metrics().dom?.classLists.closed).toBe(true);
});

it("times out pending initialization and aborts the runtime lifetime", async () => {
	vi.useFakeTimers();
	const test = fixture(20);
	test.runtime.initialize.mockImplementation(() => new Promise(() => {}));
	const result = test.scripts
		.evaluate("never")
		.catch((error: unknown) => error);
	await vi.advanceTimersByTimeAsync(25);
	expect(await result).toMatchObject({ code: "timeout" });
	expect(test.options().signal.aborted).toBe(true);
	expect(test.runtime.evaluate).not.toHaveBeenCalled();
	expect(test.runtime.close).toHaveBeenCalledTimes(1);
});

it("cancels pending initialization and rejects late setup after owner closure", async () => {
	const test = fixture();
	test.runtime.initialize.mockImplementation(() => new Promise(() => {}));
	const abort = new AbortController();
	const result = test.scripts
		.evaluate("never", { signal: abort.signal })
		.catch((error: unknown) => error);
	abort.abort();
	expect(await result).toMatchObject({ code: "aborted" });
	expect(() => test.options().setup(test.context)).toThrow("closed");
	expect(test.options().signal.aborted).toBe(true);
});

it("validates source bounds and pre-aborted requests before lazy setup", async () => {
	const test = fixture();
	await expect(
		test.scripts.evaluate(
			"x".repeat(test.scripts.limits.maxSourceCodeUnits + 1),
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	const abort = new AbortController();
	abort.abort();
	await expect(
		test.scripts.evaluate("never", { signal: abort.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(test.runtime.initialize).not.toHaveBeenCalled();
});

it("does not initialize a second evaluation concurrently", async () => {
	const test = fixture();
	test.runtime.initialize.mockImplementation(() => new Promise(() => {}));
	const abort = new AbortController();
	const first = test.scripts
		.evaluate("first", { signal: abort.signal })
		.catch((error: unknown) => error);
	await expect(test.scripts.evaluate("second")).rejects.toMatchObject({
		code: "invalid-input",
	});
	abort.abort();
	await first;
	expect(test.runtime.initialize).toHaveBeenCalledTimes(1);
});

it("waits for callback prefixes without waiting for their pending async tails", async () => {
	vi.useFakeTimers();
	const test = fixture();
	await test.scripts.evaluate("initialize");
	let completePrefix = () => {};
	let completeResult = () => {};
	const synchronous = new Promise<void>((resolve) => {
		completePrefix = resolve;
	});
	const result = new Promise<void>((resolve) => {
		completeResult = resolve;
	});
	test.runtime.startCallback.mockReturnValue({ synchronous, result });
	(
		test.scripts.window as {
			setTimeout(callback: () => void, delay: number): number;
		}
	).setTimeout(() => {}, 1);
	await vi.advanceTimersByTimeAsync(1);
	expect(test.scripts.metrics().pendingCallbacks).toBe(1);
	const next = test.scripts.evaluate("after-prefix");
	await Promise.resolve();
	expect(test.runtime.evaluate).toHaveBeenCalledTimes(1);
	completePrefix();
	expect(await next).toMatchObject({ ok: true });
	expect(test.scripts.metrics().pendingCallbacks).toBe(1);
	completeResult();
	await vi.advanceTimersByTimeAsync(0);
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
	expect(test.runtime.initialize).toHaveBeenCalledTimes(1);
});

it("retains close failures but releases browser bookkeeping and native wrappers", async () => {
	vi.useFakeTimers();
	const test = fixture();
	owners.pop();
	try {
		await test.scripts.evaluate("initialize");
		test.runtime.startCallback.mockReturnValue({
			synchronous: Promise.resolve(),
			result: new Promise(() => {}),
		});
		(
			test.scripts.window as {
				setTimeout(callback: () => void, delay: number): number;
			}
		).setTimeout(() => {}, 1);
		await vi.advanceTimersByTimeAsync(1);
		expect(test.scripts.metrics().pendingCallbacks).toBe(1);
		const failure = new Error("runtime cleanup failed");
		test.runtime.close.mockRejectedValue(failure);
		const closing = test.scripts.close();
		expect(test.scripts.close()).toBe(closing);
		await expect(closing).rejects.toBe(failure);
		expect(test.scripts.metrics().pendingCallbacks).toBe(0);
		expect(test.scripts.metrics().dom?.classLists.closed).toBe(true);
		expect(test.interactions.events.metrics().closed).toBe(false);
	} finally {
		await test.scripts.close().catch(() => undefined);
		test.tree.close();
	}
});
