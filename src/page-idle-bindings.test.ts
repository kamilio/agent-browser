import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	type PageBindingOptions,
	PageBindings,
	pageBindingGlobalNames,
} from "./page-bindings.js";
import { readPageConsole } from "./page-console.js";
import { PageClock } from "./page-performance.js";
import type {
	PageRuntime,
	PageRuntimeFactory,
	PageRuntimeOptions,
	PageRuntimeResult,
} from "./page-runtime.js";
import { type PageScriptOptions, PageScripts } from "./page-scripts.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";
import { DocumentQueries } from "./selectors.js";

interface Deadline {
	readonly didTimeout: boolean;
	timeRemaining(): number;
}
interface IdleWindow {
	requestIdleCallback(callback: unknown, options?: unknown): number;
	cancelIdleCallback(...args: unknown[]): void;
	setTimeout(callback: unknown, delay?: number): number;
	clearTimeout(handle: number): void;
	requestAnimationFrame(callback: unknown): number;
	cancelAnimationFrame(handle: number): void;
}
type IdleOptions = PageScriptOptions & {
	idleCallbackLimits?: Record<string, number>;
};
interface IdleMetrics {
	active: number;
	pendingCallbacks: number;
	scheduled: number;
	fired: number;
	closed: boolean;
	limits: Record<string, number>;
}

const trees: DocumentTree[] = [];
const bindings: PageBindings[] = [];
const scripts: PageScripts[] = [];

beforeEach(() => {
	vi.useFakeTimers({
		toFake: [
			"setTimeout",
			"clearTimeout",
			"setInterval",
			"clearInterval",
			"Date",
			"performance",
		],
	});
	vi.setSystemTime(100000);
});

afterEach(async () => {
	for (const owner of scripts.splice(0)) await owner.close();
	for (const owner of bindings.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
	expect(vi.getTimerCount()).toBe(0);
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, refuse) => {
		resolve = accept;
		reject = refuse;
	});
	return { promise, resolve, reject };
}

async function settle() {
	for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

function fixture() {
	const tree = parseHtmlDocument(
		'<div id="target">before</div>',
		"https://fixture.invalid/idle-bindings",
	);
	trees.push(tree);
	const interactions = documentInteractions(tree);
	const definitions: ScriptHostObjectDefinition[] = [];
	const context: PageBindingContext = {
		createHostObject: vi.fn((definition: ScriptHostObjectDefinition) => {
			definitions.push(definition);
			const value = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(value, name, {
					get: property.get,
					set: property.set,
				});
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(value, name, { value: method });
			return value;
		}),
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: vi.fn(),
	};
	const startCallback = vi.fn<ScriptCallbackRuntime["startCallback"]>(
		(callback, args, options) => {
			let result: Promise<unknown>;
			try {
				result = Promise.resolve(
					(callback as (...values: unknown[]) => unknown).apply(
						options.thisValue,
						[...args],
					),
				);
			} catch (error) {
				result = Promise.reject(error);
			}
			return { synchronous: Promise.resolve(), result };
		},
	);
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		isBusy: () => false,
		startCallback,
		fail: vi.fn(),
		onConsoleCall: vi.fn(),
	};
	const build = (
		options: PageBindingOptions & {
			idleCallbackLimits?: Record<string, number>;
		} = {},
	) => {
		const owner = new PageBindings(
			{ document: tree, interactions },
			context,
			lifecycle,
			options,
			new PageClock({ now: () => Date.now(), timeOrigin: 0 }),
		);
		bindings.push(owner);
		return owner;
	};
	return {
		tree,
		interactions,
		context,
		definitions,
		startCallback,
		lifecycle,
		build,
	};
}

function runtimeFixture(options: IdleOptions = {}) {
	const test = fixture();
	let runtimeOptions: PageRuntimeOptions | undefined;
	let globals: Record<string, unknown> | undefined;
	const runtime = {
		budget: { stepsUsed: 7, peakCallDepth: 2, peakDataSize: 12 },
		closed: false as boolean,
		initialize: vi.fn(async () => {
			if (!runtimeOptions) throw new Error("Missing runtime options");
			globals = runtimeOptions.setup(test.context);
		}),
		evaluate: vi.fn(
			async (
				_source: string,
				_options: { signal: AbortSignal },
			): Promise<PageRuntimeResult> => ({ ok: true, returnValue: 42 }),
		),
		copyResult: vi.fn((value: unknown) => value),
		startCallback: test.startCallback,
		errorDetails: vi.fn(() => ({ code: "script-error" })),
		close: vi.fn(async () => {
			runtime.closed = true;
		}),
	} satisfies PageRuntime;
	const factory: PageRuntimeFactory = {
		createPageRuntime(input) {
			runtimeOptions = input;
			return runtime;
		},
	};
	const owner = new PageScripts(
		{ document: test.tree, interactions: test.interactions },
		factory,
		{ limits: { timeoutMs: 1000 }, ...options },
	);
	scripts.push(owner);
	return {
		...test,
		owner,
		runtime,
		globals: () => {
			if (!globals) throw new Error("Bindings not installed");
			return globals;
		},
		options: () => {
			if (!runtimeOptions) throw new Error("Runtime not created");
			return runtimeOptions;
		},
	};
}

function idleWindow(value: object): IdleWindow {
	const window = value as IdleWindow;
	expect(window.requestIdleCallback).toBeTypeOf("function");
	expect(window.cancelIdleCallback).toBeTypeOf("function");
	return window;
}

function metrics(owner: PageScripts): IdleMetrics {
	const result = owner.metrics() as unknown as { idleCallbacks?: IdleMetrics };
	expect(result.idleCallbacks).toBeDefined();
	return result.idleCallbacks as IdleMetrics;
}

it("declares and installs idle globals exactly once with live Window aliases", () => {
	const test = fixture();
	const owner = test.build();
	const window = idleWindow(owner.window);
	const names = pageBindingGlobalNames(test.tree);
	for (const name of ["requestIdleCallback", "cancelIdleCallback"] as const) {
		expect(names.filter((value) => value === name)).toHaveLength(1);
		expect(owner.globals[name]).toBe(window[name]);
		expect(Object.getOwnPropertyDescriptor(window, name)?.writable).toBe(false);
	}
	expect(owner.globals.window).toBe(window);
	expect(owner.globals.self).toBe(window);
	expect((window as unknown as { self: object }).self).toBe(window);
	expect(names).not.toContain("IdleDeadline");
	expect(owner.globals).not.toHaveProperty("IdleDeadline");
});

it("passes declared and installed idle capabilities through the injected runtime factory", async () => {
	const test = runtimeFixture();
	expect(test.options().globals).toContain("requestIdleCallback");
	expect(test.options().globals).toContain("cancelIdleCallback");
	expect(await test.owner.evaluate("initialize")).toMatchObject({ ok: true });
	const window = idleWindow(test.owner.window);
	expect(test.globals().requestIdleCallback).toBe(window.requestIdleCallback);
	expect(test.globals().cancelIdleCallback).toBe(window.cancelIdleCallback);
	expect(test.globals().self).toBe(window);
	expect(metrics(test.owner)).toMatchObject({
		active: 0,
		scheduled: 0,
		fired: 0,
		closed: false,
	});
});

it("dispatches one host deadline with undefined receiver and revokes saved capabilities", async () => {
	const test = fixture();
	const owner = test.build();
	const window = idleWindow(owner.window);
	const deadlines: Deadline[] = [];
	const receivers: unknown[] = [];
	window.requestIdleCallback(function (this: unknown, deadline: Deadline) {
		deadlines.push(deadline);
		receivers.push(this);
	});
	expect(deadlines).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(1);
	expect(deadlines).toHaveLength(1);
	expect(receivers).toEqual([undefined]);
	expect(test.startCallback.mock.calls[0][2]).toEqual({ thisValue: undefined });
	const deadline = deadlines[0];
	expect(deadline.didTimeout).toBe(false);
	expect(deadline.timeRemaining()).toBe(1);
	expect(Reflect.set(deadline, "didTimeout", true)).toBe(false);
	expect(Reflect.set(deadline, "timeRemaining", () => 20)).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	expect(deadline.timeRemaining()).toBe(0);
	const saved = deadline.timeRemaining;
	owner.close();
	expect(() => saved()).toThrow(/closed/);
	expect(() => deadline.didTimeout).toThrow(/closed/);
	expect(() => window.requestIdleCallback(() => {})).toThrow(/closed/);
	expect(() => window.cancelIdleCallback(1)).toThrow(/closed/);
});

it("runs an injected guest callback against the shared native DOM and reports evaluation metrics", async () => {
	const test = runtimeFixture();
	await test.owner.evaluate("initialize");
	const window = idleWindow(test.owner.window);
	const document = test.globals().document as {
		getElementById(id: string): {
			textContent: string;
			setAttribute(name: string, value: string): void;
		};
	};
	const target = new DocumentQueries(test.tree).querySelector("#target");
	if (target === null) throw new Error("Missing target");
	test.runtime.evaluate.mockImplementationOnce(async () => {
		window.requestIdleCallback((deadline: Deadline) => {
			const element = document.getElementById("target");
			element.textContent = "from idle";
			element.setAttribute("data-idle", String(deadline.didTimeout));
		});
		return { ok: true, returnValue: "scheduled" };
	});
	const evaluation = await test.owner.evaluate("injected scheduling operation");
	expect(evaluation).toMatchObject({
		ok: true,
		value: "scheduled",
		metrics: { idleCallbacks: { active: 1, scheduled: 1, fired: 0 } },
	});
	expect(test.tree.textContent(target)).toBe("before");
	await vi.advanceTimersByTimeAsync(1);
	expect(test.tree.textContent(target)).toBe("from idle");
	expect(test.tree.get(target).attributes["data-idle"]).toBe("false");
	expect(metrics(test.owner)).toMatchObject({
		active: 0,
		scheduled: 1,
		fired: 1,
		pendingCallbacks: 0,
	});
	expect((await test.owner.evaluate("observe")).metrics).toMatchObject({
		idleCallbacks: { fired: 1 },
	});
});

it("waits without polling during evaluation and wakes after evaluation completion", async () => {
	const test = runtimeFixture();
	await test.owner.evaluate("initialize");
	const window = idleWindow(test.owner.window);
	const evaluation = deferred<PageRuntimeResult>();
	const callback = vi.fn();
	test.runtime.evaluate.mockImplementationOnce(() => {
		window.requestIdleCallback(callback);
		return evaluation.promise;
	});
	const pending = test.owner.evaluate("held evaluation");
	await settle();
	expect(test.owner.metrics().active).toBe(true);
	expect(vi.getTimerCount()).toBe(1);
	await vi.advanceTimersByTimeAsync(25);
	expect(callback).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(1);
	evaluation.resolve({ ok: true, returnValue: 1 });
	expect(await pending).toMatchObject({ ok: true });
	expect(callback).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(callback).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
});

it.each(["timer", "animation-frame"] as const)(
	"wakes idle work after a %s synchronous prefix, not its unresolved result",
	async (kind) => {
		const test = runtimeFixture();
		await test.owner.evaluate("initialize");
		const window = idleWindow(test.owner.window);
		const prefix = deferred<void>();
		const result = deferred<unknown>();
		const idle = vi.fn();
		test.runtime.startCallback.mockImplementationOnce(
			(callback, args, options) => {
				(callback as (...values: unknown[]) => void).apply(options.thisValue, [
					...args,
				]);
				return { synchronous: prefix.promise, result: result.promise };
			},
		);
		const callback = () => window.requestIdleCallback(idle);
		if (kind === "timer") window.setTimeout(callback, 1);
		else window.requestAnimationFrame(callback);
		await vi.advanceTimersByTimeAsync(kind === "timer" ? 1 : 17);
		expect(test.runtime.startCallback).toHaveBeenCalledTimes(1);
		expect(test.owner.metrics().pendingCallbacks).toBe(1);
		await vi.advanceTimersByTimeAsync(10);
		expect(idle).not.toHaveBeenCalled();
		prefix.resolve();
		await settle();
		await vi.advanceTimersByTimeAsync(1);
		expect(idle).toHaveBeenCalledOnce();
		expect(test.owner.metrics().pendingCallbacks).toBe(1);
		result.resolve(undefined);
		await settle();
		expect(test.owner.metrics().pendingCallbacks).toBe(0);
	},
);

it("queues positive idle timeouts through the runtime while evaluation is busy", async () => {
	const test = runtimeFixture();
	await test.owner.evaluate("initialize");
	const window = idleWindow(test.owner.window);
	const evaluation = deferred<PageRuntimeResult>();
	const admission = deferred<void>();
	const callback = vi.fn();
	test.runtime.startCallback.mockImplementationOnce(
		(handler, args, options) => {
			const synchronous = admission.promise.then(() => {
				(handler as (...values: unknown[]) => void).apply(options.thisValue, [
					...args,
				]);
			});
			return { synchronous, result: synchronous };
		},
	);
	test.runtime.evaluate.mockImplementationOnce(() => {
		window.requestIdleCallback(callback, { timeout: 5 });
		return evaluation.promise;
	});
	const pending = test.owner.evaluate("held evaluation");
	await settle();
	await vi.advanceTimersByTimeAsync(5);
	expect(test.runtime.startCallback).toHaveBeenCalledOnce();
	const deadline = test.runtime.startCallback.mock.calls[0][1][0] as Deadline;
	expect(deadline.didTimeout).toBe(true);
	expect(deadline.timeRemaining()).toBe(0);
	expect(callback).not.toHaveBeenCalled();
	evaluation.resolve({ ok: true });
	await pending;
	admission.resolve();
	await settle();
	expect(callback).toHaveBeenCalledOnce();
	expect(test.owner.metrics().pendingCallbacks).toBe(0);
	await vi.advanceTimersByTimeAsync(20);
	expect(callback).toHaveBeenCalledOnce();
});

it("keeps timer and frame handles and metrics independent of idle cancellation", async () => {
	const test = runtimeFixture();
	await test.owner.evaluate("initialize");
	const window = idleWindow(test.owner.window);
	const timer = vi.fn();
	const frame = vi.fn();
	const idle = vi.fn();
	const timerId = window.setTimeout(timer, 5);
	const frameId = window.requestAnimationFrame(frame);
	const before = test.owner.metrics();
	const idleId = window.requestIdleCallback(idle);
	window.cancelIdleCallback(idleId);
	expect(test.owner.metrics().timers).toEqual(before.timers);
	expect(test.owner.metrics().animationFrames).toEqual(before.animationFrames);
	await vi.advanceTimersByTimeAsync(17);
	expect(timer).toHaveBeenCalledOnce();
	expect(frame).toHaveBeenCalledOnce();
	expect(idle).not.toHaveBeenCalled();
	const secondIdle = vi.fn();
	window.requestIdleCallback(secondIdle);
	window.clearTimeout(timerId);
	window.cancelAnimationFrame(frameId);
	await vi.advanceTimersByTimeAsync(1);
	expect(secondIdle).toHaveBeenCalledOnce();
});

it("routes active and scheduled idle quotas without consuming timer/frame capacity", async () => {
	const test = runtimeFixture({
		idleCallbackLimits: { maxActive: 1, maxScheduled: 2 },
		timerLimits: { maxActive: 1 },
		animationFrameLimits: { maxActive: 1 },
	});
	await test.owner.evaluate("initialize");
	const window = idleWindow(test.owner.window);
	expect(metrics(test.owner).limits).toMatchObject({
		maxActive: 1,
		maxScheduled: 2,
	});
	const callback = vi.fn();
	const first = window.requestIdleCallback(callback);
	expect(() => window.requestIdleCallback(callback)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	window.cancelIdleCallback(first);
	expect(window.requestIdleCallback(callback)).toBe(first + 1);
	const timer = vi.fn();
	const frame = vi.fn();
	window.setTimeout(timer, 3);
	window.requestAnimationFrame(frame);
	await vi.advanceTimersByTimeAsync(17);
	expect(callback).toHaveBeenCalledOnce();
	expect(timer).toHaveBeenCalledOnce();
	expect(frame).toHaveBeenCalledOnce();
	expect(() => window.requestIdleCallback(callback)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(test.owner.closed).toBe(false);
});

it("fails closed at the configured idle dispatch quota through PageScripts", async () => {
	const test = runtimeFixture({ idleCallbackLimits: { maxCallbacks: 1 } });
	await test.owner.evaluate("initialize");
	const window = idleWindow(test.owner.window);
	const callback = vi.fn();
	window.requestIdleCallback(callback);
	window.requestIdleCallback(callback);
	await vi.advanceTimersByTimeAsync(3);
	expect(callback).toHaveBeenCalledTimes(1);
	expect(test.owner.closed).toBe(true);
	expect(metrics(test.owner)).toMatchObject({
		active: 0,
		pendingCallbacks: 0,
		closed: true,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("enforces the idle pending quota on unresolved guest results without stopping completed prefixes", async () => {
	const test = runtimeFixture({
		idleCallbackLimits: { maxPendingCallbacks: 1 },
	});
	await test.owner.evaluate("initialize");
	const window = idleWindow(test.owner.window);
	const result = deferred<unknown>();
	window.requestIdleCallback(() => result.promise);
	await vi.advanceTimersByTimeAsync(1);
	expect(test.owner.metrics().pendingCallbacks).toBe(1);
	expect(metrics(test.owner).pendingCallbacks).toBe(1);
	window.requestIdleCallback(() => {});
	await vi.advanceTimersByTimeAsync(1);
	expect(test.owner.closed).toBe(true);
	result.resolve(undefined);
	await settle();
	expect(metrics(test.owner)).toMatchObject({
		closed: true,
		active: 0,
		pendingCallbacks: 0,
	});
});

it.each<Record<string, number>>([
	{ maxActive: 0 },
	{ maxScheduled: 1.5 },
	{ unexpected: 1 },
])("validates idle options through PageBindings (%j)", (idleCallbackLimits) => {
	const test = fixture();
	expect(() => test.build({ idleCallbackLimits })).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(test.interactions.events.metrics().closed).toBe(false);
});

it("observes rejected guest results and continues scheduling in the healthy runtime", async () => {
	const test = runtimeFixture();
	await test.owner.evaluate("initialize");
	const window = idleWindow(test.owner.window);
	window.requestIdleCallback(async () => {
		throw new Error("private idle detail");
	});
	const next = vi.fn();
	window.requestIdleCallback(next);
	await vi.advanceTimersByTimeAsync(2);
	expect(next).toHaveBeenCalledOnce();
	expect(test.owner.closed).toBe(false);
	expect(test.owner.metrics().pendingCallbacks).toBe(0);
	expect(JSON.stringify(readPageConsole(test.tree))).toContain(
		"Page callback failed: script-error",
	);
	expect(JSON.stringify(readPageConsole(test.tree))).not.toContain(
		"private idle detail",
	);
});

it.each(["document", "runtime", "scripts"] as const)(
	"closes idle ownership and saved capabilities on %s closure",
	async (kind) => {
		const test = runtimeFixture();
		await test.owner.evaluate("initialize");
		const window = idleWindow(test.owner.window);
		const callback = vi.fn();
		window.requestIdleCallback(callback, { timeout: 100 });
		if (kind === "document") test.tree.close();
		else if (kind === "runtime") {
			test.runtime.closed = true;
			test.options().onClosed();
		} else await test.owner.close();
		await settle();
		expect(metrics(test.owner)).toMatchObject({
			active: 0,
			pendingCallbacks: 0,
			closed: true,
		});
		expect(test.runtime.close).toHaveBeenCalledOnce();
		expect(() => window.requestIdleCallback(callback)).toThrow(/closed/);
		expect(() => window.cancelIdleCallback(1)).toThrow(/closed/);
		await vi.advanceTimersByTimeAsync(200);
		expect(callback).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("cancels admitted idle work when later runtime initialization fails", async () => {
	const test = runtimeFixture();
	let window: IdleWindow | undefined;
	const callback = vi.fn();
	test.runtime.initialize.mockImplementationOnce(async () => {
		const globals = test.options().setup(test.context);
		window = idleWindow(globals.window as object);
		window.requestIdleCallback(callback, { timeout: 20 });
		throw new Error("injected initialization failure");
	});
	expect(await test.owner.evaluate("never evaluate")).toMatchObject({
		ok: false,
	});
	expect(window?.requestIdleCallback).toBeTypeOf("function");
	expect(test.runtime.evaluate).not.toHaveBeenCalled();
	expect(metrics(test.owner)).toMatchObject({ active: 0, closed: true });
	expect(test.runtime.close).toHaveBeenCalledOnce();
	await vi.advanceTimersByTimeAsync(30);
	expect(callback).not.toHaveBeenCalled();
});

it("cleans up idle work admitted reentrantly during a failing Window host factory", () => {
	const test = fixture();
	const create = test.context.createHostObject;
	const failure = new Error("injected Window factory failure");
	let request: IdleWindow["requestIdleCallback"] | undefined;
	test.context.createHostObject = (definition) => {
		if (definition.methods?.setTimeout) {
			expect(definition.methods.requestIdleCallback).toBeTypeOf("function");
			request = definition.methods
				.requestIdleCallback as IdleWindow["requestIdleCallback"];
			request(() => {}, { timeout: 10 });
			throw failure;
		}
		return create(definition);
	};
	expect(() => test.build()).toThrow(failure);
	expect(request).toBeTypeOf("function");
	expect(() => request?.(() => {})).toThrow(/closed/);
	expect(vi.getTimerCount()).toBe(0);
});

it("keeps independent page idle owners isolated when one document closes", async () => {
	const first = fixture();
	const second = fixture();
	const firstWindow = idleWindow(first.build().window);
	const secondWindow = idleWindow(second.build().window);
	const firstCallback = vi.fn();
	const secondCallback = vi.fn();
	expect(firstWindow.requestIdleCallback(firstCallback)).toBe(1);
	expect(secondWindow.requestIdleCallback(secondCallback)).toBe(1);
	first.tree.close();
	await vi.advanceTimersByTimeAsync(1);
	expect(firstCallback).not.toHaveBeenCalled();
	expect(secondCallback).toHaveBeenCalledOnce();
});
