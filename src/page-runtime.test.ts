import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { BrowserEvent } from "./events.js";
import { DocumentInteractions } from "./interactions.js";
import type { PageBindingContext } from "./page-bindings.js";
import { readPageConsole } from "./page-console.js";
import {
	legacyPageRuntime,
	type PageRuntime,
	type PageRuntimeFactory,
	type PageRuntimeOptions,
	type PageRuntimeResult,
	type PageScriptCore,
} from "./page-runtime.js";
import { PageScripts } from "./page-scripts.js";
import { scriptLimits } from "./safejs.js";

function legacyPolicyFixture() {
	const allocate = vi.fn();
	class Budget {
		stepsUsed = 0;
		peakCallDepth = 0;
		peakDataSize = 0;
		constructor() {
			allocate();
		}
	}
	const realm = {
		closed: false,
		evaluate: vi.fn(async () => ({ returnValue: 42 })),
		close: vi.fn(async () => {}),
	};
	const core: PageScriptCore = {
		Budget,
		SandboxError: class extends Error {
			code = "script-error";
		},
		createRealm: vi.fn(() => realm),
		createHostObject: () => ({}),
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => true,
		deepCopyFromSandbox: (value) => value,
		startCallback: () => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(),
		}),
	};
	const options: PageRuntimeOptions = {
		limits: scriptLimits(),
		signal: new AbortController().signal,
		globals: [],
		onClosed: vi.fn(),
		setup: vi.fn(() => ({})),
		sink: { log() {}, error() {} },
	};
	return { core, realm, allocate, options, factory: legacyPageRuntime(core) };
}

it.each(["allow", "deny"] as const)(
	"legacy runtime refuses explicit per-page %s before allocation or setup",
	(stringCompilation) => {
		const test = legacyPolicyFixture();
		Object.assign(test.options, { stringCompilation });
		expect(() => test.factory.createPageRuntime(test.options)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(test.allocate).not.toHaveBeenCalled();
		expect(test.options.setup).not.toHaveBeenCalled();
		expect(test.core.createRealm).not.toHaveBeenCalled();
	},
);

it.each([undefined, null, false, 0, "DENY", {}, []])(
	"legacy runtime rejects malformed per-page policy %j without allocation",
	(stringCompilation) => {
		const test = legacyPolicyFixture();
		Object.assign(test.options, { stringCompilation });
		expect(() => test.factory.createPageRuntime(test.options)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(test.allocate).not.toHaveBeenCalled();
		expect(test.options.setup).not.toHaveBeenCalled();
		expect(test.core.createRealm).not.toHaveBeenCalled();
	},
);

it("legacy runtime rejects inherited and accessor page policies without invoking getters", () => {
	const getter = vi.fn(() => "deny");
	for (const inherited of [false, true]) {
		const test = legacyPolicyFixture();
		const target = inherited ? {} : test.options;
		if (inherited) Object.setPrototypeOf(test.options, target);
		Object.defineProperty(target, "stringCompilation", {
			get: getter,
			enumerable: true,
		});
		expect(() => test.factory.createPageRuntime(test.options)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(test.allocate).not.toHaveBeenCalled();
		expect(test.options.setup).not.toHaveBeenCalled();
		expect(test.core.createRealm).not.toHaveBeenCalled();
	}
	expect(getter).not.toHaveBeenCalled();
});

it("legacy runtime preserves omitted per-page policy compatibility", async () => {
	const test = legacyPolicyFixture();
	const runtime = test.factory.createPageRuntime(test.options);
	try {
		await runtime.initialize();
		expect(
			await runtime.evaluate("source", { signal: test.options.signal }),
		).toEqual({ ok: true, returnValue: 42 });
		expect(test.allocate).toHaveBeenCalledOnce();
		expect(test.options.setup).toHaveBeenCalledOnce();
		expect(
			vi.mocked(test.core.createRealm).mock.calls[0][0],
		).not.toHaveProperty("stringCompilation");
	} finally {
		await runtime.close();
	}
	expect(test.realm.close).toHaveBeenCalledOnce();
});

const owners: { scripts: PageScripts; tree: DocumentTree }[] = [];
afterEach(async () => {
	for (const { scripts, tree } of owners.splice(0)) {
		await scripts.close();
		tree.close();
	}
	vi.useRealTimers();
});

function fixture(timeoutMs = 1000, maxPendingCallbacks = 128) {
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
		errorDetails: vi.fn<PageRuntime["errorDetails"]>(() => ({
			code: "runtime-failure",
			budget: "Steps",
		})),
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
		maxPendingCallbacks,
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

function callbackDispatch(test: ReturnType<typeof fixture>) {
	const window = test.scripts.window as {
		addEventListener(type: string, callback: () => void): void;
	};
	window.addEventListener("callback-budget", () => {});
	const target = test.interactions.events.windowTarget;
	if (target === null) throw new Error("Missing Window target");
	return () => {
		const dispatched = test.interactions.events.dispatchEventAsync(
			target,
			new BrowserEvent("callback-budget"),
		);
		void dispatched.catch(() => undefined);
		return dispatched;
	};
}

it("counts distinct callbacks even when the runtime shares their completion Promise", async () => {
	const test = fixture(1000, 2);
	await test.scripts.evaluate("initialize");
	const dispatch = callbackDispatch(test);
	const result = new Promise<unknown>(() => {});
	const synchronous = Promise.resolve();
	test.runtime.startCallback.mockReturnValue({ synchronous, result });
	await dispatch();
	await dispatch();
	expect(test.scripts.metrics().pendingCallbacks).toBe(2);
	await expect(dispatch()).rejects.toMatchObject({ code: "closed" });
	expect(test.runtime.startCallback).toHaveBeenCalledTimes(2);
	await test.scripts.close();
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
});

it("keeps a callback slot until both public completion phases settle", async () => {
	const test = fixture(1000, 1);
	await test.scripts.evaluate("initialize");
	const dispatch = callbackDispatch(test);
	let release = () => {};
	const synchronous = new Promise<void>((resolve) => {
		release = resolve;
	});
	test.runtime.startCallback.mockReturnValue({
		synchronous,
		result: Promise.resolve(),
	});
	const pending = dispatch();
	await Promise.resolve();
	await Promise.resolve();
	expect(test.scripts.metrics().pendingCallbacks).toBe(1);
	release();
	await pending;
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
});

it("reserves callback capacity before a runtime can synchronously reenter dispatch", async () => {
	const test = fixture(1000, 1);
	await test.scripts.evaluate("initialize");
	const dispatch = callbackDispatch(test);
	let entered = false;
	let nested: Promise<unknown> | undefined;
	test.runtime.startCallback.mockImplementation(() => {
		if (!entered) {
			entered = true;
			nested = dispatch().catch((error) => error);
		}
		return { synchronous: Promise.resolve(), result: Promise.resolve() };
	});
	await dispatch().catch((error) => error);
	await nested;
	expect(test.runtime.startCallback).toHaveBeenCalledTimes(1);
	expect(test.scripts.closed).toBe(true);
	await test.scripts.close();
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
});

it("blocks reentrant source evaluation until the starting callback publishes and completes its prefix", async () => {
	const test = fixture();
	await test.scripts.evaluate("initialize");
	const dispatch = callbackDispatch(test);
	let release = () => {};
	const synchronous = new Promise<void>((resolve) => {
		release = resolve;
	});
	let evaluation: ReturnType<PageScripts["evaluate"]> | undefined;
	test.runtime.startCallback.mockImplementation(() => {
		evaluation = test.scripts.evaluate("reentrant-source");
		void evaluation.catch(() => undefined);
		return { synchronous, result: Promise.resolve() };
	});
	const pending = dispatch();
	await Promise.resolve();
	expect(test.runtime.evaluate).toHaveBeenCalledTimes(1);
	release();
	await pending;
	expect(await evaluation).toMatchObject({ ok: true });
	expect(test.runtime.evaluate).toHaveBeenCalledTimes(2);
});

it.each(["resolve", "reject"])(
	"releases every invocation sharing a tail when it %ss",
	async (outcome) => {
		const test = fixture(1000, 2);
		await test.scripts.evaluate("initialize");
		const dispatch = callbackDispatch(test);
		let settle = () => {};
		const result = new Promise<void>((resolve, reject) => {
			settle =
				outcome === "resolve"
					? resolve
					: () => reject(new Error("synthetic-tail-error"));
		});
		test.runtime.startCallback.mockReturnValue({
			synchronous: Promise.resolve(),
			result,
		});
		await dispatch();
		await dispatch();
		expect(test.scripts.metrics().pendingCallbacks).toBe(2);
		settle();
		await Promise.resolve();
		await Promise.resolve();
		expect(test.scripts.metrics().pendingCallbacks).toBe(0);
		expect(test.scripts.closed).toBe(false);
		await dispatch();
		expect(test.scripts.metrics().pendingCallbacks).toBe(0);
	},
);

it("releases the reserved slot after a synchronous runtime failure without poisoning a healthy runtime", async () => {
	const test = fixture(1000, 1);
	await test.scripts.evaluate("initialize");
	const dispatch = callbackDispatch(test);
	test.runtime.startCallback.mockImplementationOnce(() => {
		throw new Error("synthetic-runtime-error");
	});
	await dispatch().catch(() => undefined);
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
	expect(test.scripts.closed).toBe(false);
	expect(JSON.stringify(readPageConsole(test.tree))).toContain(
		"Page callback failed: runtime-failure",
	);
	await dispatch();
	expect(test.runtime.startCallback).toHaveBeenCalledTimes(2);
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
});

it.each(["missing", "prefix", "result", "rejected-result"])(
	"revokes malformed callback phase contracts: %s",
	async (kind) => {
		const test = fixture(1000, 1);
		await test.scripts.evaluate("initialize");
		const dispatch = callbackDispatch(test);
		test.runtime.startCallback.mockImplementation(() => {
			const value =
				kind === "missing"
					? undefined
					: {
							synchronous: kind === "result" ? Promise.resolve() : undefined,
							result:
								kind === "result"
									? undefined
									: kind === "rejected-result"
										? Promise.reject(new Error("synthetic-runtime-error"))
										: Promise.resolve(),
						};
			return value as ReturnType<PageRuntime["startCallback"]>;
		});
		await expect(dispatch()).rejects.toMatchObject({ code: "closed" });
		await test.scripts.close();
		expect(test.scripts.metrics().pendingCallbacks).toBe(0);
		expect(test.runtime.close).toHaveBeenCalledTimes(1);
		expect(test.scripts.metrics().dom?.classLists.closed).toBe(true);
		expect(test.interactions.events.metrics().closed).toBe(false);
	},
);

it("cancels a prefix-blocked source and does not revive slots when phases settle after closure", async () => {
	const test = fixture();
	await test.scripts.evaluate("initialize");
	const dispatch = callbackDispatch(test);
	let release = () => {};
	const phase = new Promise<void>((resolve) => {
		release = resolve;
	});
	test.runtime.startCallback.mockReturnValue({
		synchronous: phase,
		result: phase,
	});
	const dispatched = dispatch();
	const evaluation = test.scripts.evaluate("blocked-source");
	const cancelled = expect(evaluation).rejects.toMatchObject({
		code: "closed",
	});
	await test.scripts.close();
	await cancelled;
	await expect(dispatched).rejects.toMatchObject({ code: "closed" });
	release();
	await Promise.resolve();
	await Promise.resolve();
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
	expect(test.runtime.evaluate).toHaveBeenCalledTimes(1);
});

it("repeated shared settled phases do not accumulate callback slots", async () => {
	const test = fixture(1000, 1);
	await test.scripts.evaluate("initialize");
	const dispatch = callbackDispatch(test);
	const phase = Promise.resolve();
	test.runtime.startCallback.mockReturnValue({
		synchronous: phase,
		result: phase,
	});
	for (let index = 0; index < 1000; index++) {
		await dispatch();
		expect(test.scripts.metrics().pendingCallbacks).toBe(0);
	}
	expect(test.runtime.startCallback).toHaveBeenCalledTimes(1000);
	expect(test.scripts.closed).toBe(false);
});

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

for (const source of ["callback", "evaluation"] as const) {
	it.each([
		{ budget: "Steps", suffix: " (Steps)" },
		{ budget: "steps", suffix: " (steps)" },
		{ budget: "CallDepth", suffix: " (CallDepth)" },
		{ budget: "DataSize", suffix: " (DataSize)" },
		{ budget: undefined, suffix: "" },
		{ budget: "", suffix: "" },
		{ budget: "private token=secret", suffix: "" },
		{ budget: "Steps\nprivate", suffix: "" },
		{ budget: "A".repeat(33), suffix: "" },
		{ budget: 42, suffix: "" },
		{ budget: null, suffix: "" },
		{ budget: { secret: "private raw value" }, suffix: "" },
	])(
		`records only sanitized ${source} budget diagnostics: $budget`,
		async ({ budget, suffix }) => {
			const test = fixture();
			const error = Object.assign(new Error("private error message"), {
				code: "budget",
				stack: "private error stack",
				value: "private raw value",
			});
			Object.assign(error, { budget });
			if (source === "callback") {
				await test.scripts.evaluate("initialize");
				const dispatch = callbackDispatch(test);
				test.runtime.errorDetails.mockReturnValue(error);
				test.runtime.startCallback.mockImplementationOnce(() => ({
					synchronous: Promise.resolve(),
					result: Promise.reject(error),
				}));
				await dispatch();
			} else {
				test.runtime.evaluate.mockResolvedValue({ ok: false, error });
				const result = await test.scripts.evaluate("failed");
				expect(result).toMatchObject({ ok: false });
				if (!result.ok)
					expect(result.error).toEqual({
						code: "budget",
						...(suffix ? { budget } : {}),
					});
			}
			expect(readPageConsole(test.tree, "error").entries).toMatchObject([
				{ source, text: `Page ${source} failed: budget${suffix}` },
			]);
		},
	);
}

it("uses the adapter's public error classification without requiring an SDK error class", async () => {
	const test = fixture();
	test.runtime.evaluate.mockRejectedValue(new Error("sensitive cause"));
	expect(await test.scripts.evaluate("failed")).toMatchObject({
		ok: false,
		error: { code: "runtime-failure", budget: "Steps" },
	});
	expect(test.runtime.errorDetails).toHaveBeenCalled();
	expect(readPageConsole(test.tree, "error").entries).toMatchObject([
		{
			source: "evaluation",
			text: "Page evaluation failed: runtime-failure (Steps)",
		},
	]);
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
