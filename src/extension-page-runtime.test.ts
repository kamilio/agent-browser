import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	type ExtensionPageRuntimeOptions,
	extensionPageRuntime,
	extensionPageRuntimeLimits,
} from "./extension-page-runtime.js";
import { DocumentInteractions } from "./interactions.js";
import { pageBindingGlobalNames } from "./page-bindings.js";
import { bindPageHistory } from "./page-history.js";
import { PageScripts } from "./page-scripts.js";
import { bindPageStorage } from "./page-storage.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedInvocation,
	ReleasedRealm,
} from "./safejs-extension-types.js";

type Definition = Parameters<ReleasedCore["defineExtension"]>[0];
type RealmOptions = Parameters<ReleasedCore["createRealm"]>[0];
const owners: { scripts: PageScripts; tree: DocumentTree }[] = [];
afterEach(async () => {
	for (const { scripts, tree } of owners.splice(0)) {
		await scripts.close().catch(() => undefined);
		tree.close();
	}
	vi.useRealTimers();
});

function fakeCore() {
	const budgetOptions: ConstructorParameters<ReleasedCore["Budget"]>[0][] = [];
	class Budget {
		stepsUsed = 0;
		peakCallDepth = 0;
		peakDataSize = 0;
		constructor(options: ConstructorParameters<ReleasedCore["Budget"]>[0]) {
			budgetOptions.push(options);
		}
	}
	const realms: ReturnType<typeof makeRealm>[] = [];
	const defineExtension = vi.fn((definition: Definition) => definition);
	function makeRealm(options: RealmOptions) {
		const definition = options.extensions[0] as Definition;
		if (
			options.builtinOverrides?.console !== definition.manifest.name ||
			!definition.manifest.globals.includes("console")
		)
			throw new Error("Missing explicit console authorization");
		const signal = new AbortController();
		const cleanups: (() => void | Promise<void>)[] = [];
		const objects = new Set<object>();
		let globals: Record<string, unknown> | undefined;
		let closing: Promise<void> | undefined;
		let settingUp = false;
		const state = {
			options,
			response: { ok: true, returnValue: { answer: 42 } } as Awaited<
				ReturnType<ReleasedRealm["evaluate"]>
			>,
			failure: undefined as unknown,
			closeFailure: undefined as unknown,
			disposals: 0,
			get globals() {
				return globals;
			},
			get objectCount() {
				return objects.size;
			},
			signal,
			context: undefined as unknown as ReleasedContext,
			startCallback: vi.fn<ReleasedRealm["startCallback"]>(() => ({
				synchronous: Promise.resolve(),
				result: Promise.resolve(undefined),
			})),
			close: vi.fn((): Promise<void> => {
				closing ??= Promise.resolve().then(async () => {
					state.disposals++;
					signal.abort();
					options.signal.removeEventListener("abort", abort);
					for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
					objects.clear();
					if (state.closeFailure) throw state.closeFailure;
				});
				return closing;
			}),
			evaluate: vi.fn(
				async (source: string, _options?: { filename?: string }) => {
					if (!globals) {
						settingUp = true;
						try {
							globals = definition.setup(context).globals;
						} catch (error) {
							await state.close();
							throw error;
						} finally {
							settingUp = false;
						}
						if (!objects.has(globals.console as object)) {
							await state.close();
							throw new Error("Console is not owned");
						}
						if (
							Object.keys(globals).sort().join() !==
							[...definition.manifest.globals].sort().join()
						) {
							await state.close();
							throw new Error("Global declaration mismatch");
						}
					}
					if (!source) return { ok: true };
					if (state.failure) {
						await state.close();
						throw state.failure;
					}
					if (!state.response.ok) await state.close();
					return state.response;
				},
			),
		};
		const context: ReleasedContext = {
			signal: signal.signal,
			onCleanup(cleanup) {
				cleanups.push(cleanup);
			},
			createHostObject(definition) {
				if (signal.signal.aborted) throw new Error("Revoked context");
				const value = Object.create(null);
				for (const [name, property] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(value, name, property);
				for (const [name, method] of Object.entries(definition.methods ?? {}))
					Object.defineProperty(value, name, { value: method });
				objects.add(value);
				return value;
			},
			startCallback: state.startCallback,
			releaseCallback() {},
			retainGuestArguments: vi.fn((operation, _from) => {
				if (!settingUp) throw new Error("Late retention registration");
				return operation;
			}),
			releaseGuestReference: vi.fn(() => {
				if (signal.signal.aborted) throw new Error("Revoked reference");
			}),
			nestedOperation: (operation) => operation,
			async evaluateNested() {
				throw new Error("Unexpected nested source");
			},
		};
		state.context = context;
		const abort = () => {
			void state.close().catch(() => undefined);
		};
		options.signal.addEventListener("abort", abort, { once: true });
		if (options.signal.aborted) abort();
		return state;
	}
	const createRealm = vi.fn((options: RealmOptions): ReleasedRealm => {
		const state = makeRealm(options);
		realms.push(state);
		return {
			evaluate: state.evaluate,
			startCallback: state.startCallback,
			releaseCallback() {},
			close: state.close,
		};
	});
	const core: ReleasedCore = { Budget, defineExtension, createRealm };
	return { core, realms, defineExtension, createRealm, budgetOptions };
}

function fixture(
	shared = fakeCore(),
	timeoutMs = 1000,
	configuration: ExtensionPageRuntimeOptions = {},
) {
	const tree = new DocumentTree("https://example.com/");
	const interactions = new DocumentInteractions(tree);
	const scripts = new PageScripts(
		{ document: tree, interactions },
		extensionPageRuntime(shared.core, configuration),
		{ limits: { timeoutMs } },
	);
	owners.push({ scripts, tree });
	return {
		...shared,
		tree,
		interactions,
		scripts,
		state: shared.realms[shared.realms.length - 1],
	};
}

it.each([null, 0, "true", [], {}])(
	"rejects a non-boolean classic Script option (%j)",
	(classicScripts) => {
		expect(() =>
			extensionPageRuntime(fakeCore().core, {
				classicScripts: classicScripts as boolean,
			}),
		).toThrow("Invalid classic Script option");
	},
);

it("opts into classic Scripts and fails closed if the SDK skips the window bootstrap", async () => {
	const test = fixture(fakeCore(), 1000, { classicScripts: true });
	expect(test.state.options.classicScripts).toBe(true);
	const names = test.defineExtension.mock.calls[0][0].manifest.globals;
	expect(names).not.toContain("window");
	expect(names).not.toContain("self");
	expect(names).toContain("__agentBrowserWindowGlobal");
	await expect(test.scripts.evaluate("publisher source")).rejects.toThrow(
		"SafeJS did not initialize page extension bindings",
	);
	expect(test.state.evaluate).toHaveBeenCalledTimes(1);
	expect(test.state.evaluate.mock.calls[0][0]).toContain(
		"bridge.bind(globalThis)",
	);
	expect(test.state.disposals).toBe(1);
});

it("counts its native window bootstrap against the configured source limit", () => {
	const shared = fakeCore();
	const tree = new DocumentTree("https://example.com/");
	try {
		expect(
			() =>
				new PageScripts(
					{ document: tree, interactions: new DocumentInteractions(tree) },
					extensionPageRuntime(shared.core, { classicScripts: true }),
					{ limits: { maxSourceCodeUnits: 1 } },
				),
		).toThrow("Page initialization source is too large");
		expect(shared.createRealm).not.toHaveBeenCalled();
	} finally {
		tree.close();
	}
});

it.each([null, false, true, 0, "", "immediate", [], {}])(
	"rejects invalid callback scheduling (%j)",
	(callbackScheduling) => {
		expect(() =>
			extensionPageRuntime(fakeCore().core, {
				callbackScheduling: callbackScheduling as "after-prefix",
			}),
		).toThrow("Invalid callback scheduling option");
	},
);

it("forwards explicit callback-prefix scheduling without enabling classic Scripts", async () => {
	const test = fixture(fakeCore(), 1000, {
		callbackScheduling: "after-prefix",
	});
	expect(test.state.options.callbackScheduling).toBe("after-prefix");
	expect(test.state.options).not.toHaveProperty("classicScripts");
	await expect(test.scripts.evaluate("source")).resolves.toMatchObject({
		ok: true,
	});
});

it("leaves callback scheduling to the SDK when no option is selected", () => {
	const test = fixture();
	expect(test.state.options).not.toHaveProperty("callbackScheduling");
});

it("declares owned console, retention, and focus await-result grants before lazy setup", async () => {
	const test = fixture();
	expect(test.defineExtension.mock.calls[0][0].manifest).toMatchObject({
		name: "agent-browser-page",
		globals: pageBindingGlobalNames(test.tree),
		capabilities: ["guest:retain", "source:nested"],
	});
	expect(test.state.options).toMatchObject({
		builtinOverrides: { console: "agent-browser-page" },
		grants: ["guest:retain", "source:nested"],
		limits: extensionPageRuntimeLimits,
	});
	expect(test.state.objectCount).toBe(0);
	expect(test.state.evaluate).not.toHaveBeenCalled();
	await test.scripts.close();
	expect(test.state.evaluate).not.toHaveBeenCalled();
	expect(test.state.disposals).toBe(1);
});

it("bootstraps once, shares owned aliases and forwards only supported public evaluation options", async () => {
	const test = fixture();
	expect(
		await test.scripts.evaluate("first", { filename: "app.js" }),
	).toMatchObject({ ok: true, value: { answer: 42 } });
	await test.scripts.evaluate("second");
	expect(test.state.evaluate.mock.calls.map(([source]) => source)).toEqual([
		"",
		"first",
		"second",
	]);
	expect(test.state.evaluate.mock.calls[1][1]).toEqual({ filename: "app.js" });
	expect(test.state.globals?.console).toBe(
		(test.scripts.window as { console: object }).console,
	);
	expect(test.state.globals?.self).toBe(test.state.globals?.window);
	expect(test.state.globals?.document).toBe(test.scripts.dom.document);
	expect(test.state.context.retainGuestArguments).toHaveBeenCalledTimes(2);
	expect(
		vi
			.mocked(test.state.context.retainGuestArguments)
			.mock.calls.map(([, from]) => from),
	).toEqual([2, 2]);
});

it("passes lifetime work/data limits without imposing a fixed lifetime deadline", async () => {
	vi.useFakeTimers();
	const test = fixture();
	expect(test.budgetOptions[0]).toMatchObject({
		maxSteps: test.scripts.limits.maxSteps,
		maxCallDepth: test.scripts.limits.maxCallDepth,
		stringLength: test.scripts.limits.maxStringLength,
		arrayLength: test.scripts.limits.maxArrayLength,
		dataSize: test.scripts.limits.maxDataSize,
	});
	expect(test.budgetOptions[0]).not.toHaveProperty("deadline");
	await test.scripts.evaluate("first");
	await vi.advanceTimersByTimeAsync(2000);
	expect(test.scripts.closed).toBe(false);
	expect(await test.scripts.evaluate("second")).toMatchObject({ ok: true });
});

it("keeps tagged public failures instead of masking them as closure or successful values", async () => {
	const test = fixture();
	test.state.response = {
		ok: false,
		error: { code: "UNBOUND_IDENTIFIER", message: "private detail" },
	};
	const result = await test.scripts.evaluate("failure");
	expect(result).toMatchObject({
		ok: false,
		error: { code: "UNBOUND_IDENTIFIER" },
	});
	expect(JSON.stringify(result)).not.toContain("private detail");
	expect(test.scripts.closed).toBe(true);
	expect(test.scripts.metrics().dom?.classLists.closed).toBe(true);
	expect(test.interactions.events.metrics().closed).toBe(false);
});

it("classifies own public budget fields without importing SDK error constructors", async () => {
	const test = fixture();
	test.state.failure = Object.assign(new Error("sensitive"), {
		code: "budgetExceeded",
		budget: "steps",
	});
	expect(await test.scripts.evaluate("failure")).toMatchObject({
		ok: false,
		error: { code: "budgetExceeded", budget: "steps" },
	});
	expect(test.scripts.closed).toBe(true);
});

it("does not read accessor-based error details", async () => {
	const test = fixture();
	const getter = vi.fn(() => {
		throw new Error("accessor");
	});
	test.state.failure = Object.defineProperty(new Error("private"), "code", {
		get: getter,
	});
	expect(await test.scripts.evaluate("failure")).toMatchObject({
		ok: false,
		error: { code: "script-error" },
	});
	expect(getter).not.toHaveBeenCalled();
});

it("notifies an idle page owner when the SDK context closes autonomously", async () => {
	const test = fixture();
	await test.scripts.evaluate("initialize");
	await test.state.close();
	await test.scripts.close();
	expect(test.scripts.closed).toBe(true);
	expect(test.scripts.metrics().timers?.closed).toBe(true);
	expect(test.state.options.signal.aborted).toBe(true);
	expect(test.interactions.events.metrics().closed).toBe(false);
});

it("forwards native callback receivers and arguments without collapsing completion phases", async () => {
	vi.useFakeTimers();
	const test = fixture();
	await test.scripts.evaluate("initialize");
	let prefix = () => {};
	let result = () => {};
	const phases: ReleasedInvocation = {
		synchronous: new Promise<void>((resolve) => {
			prefix = resolve;
		}),
		result: new Promise<void>((resolve) => {
			result = resolve;
		}),
	};
	test.state.startCallback.mockReturnValue(phases);
	const callback = () => {};
	const token = Object.freeze({});
	(
		test.scripts.window as {
			setTimeout(
				callback: () => void,
				delay: number,
				argument: unknown,
			): number;
		}
	).setTimeout(callback, 1, token);
	await vi.advanceTimersByTimeAsync(1);
	expect(test.state.startCallback).toHaveBeenCalledWith(callback, {
		thisValue: test.scripts.window,
		args: [token],
	});
	const next = test.scripts.evaluate("after-prefix");
	prefix();
	expect(await next).toMatchObject({ ok: true });
	expect(test.scripts.metrics().pendingCallbacks).toBe(1);
	result();
	await vi.advanceTimersByTimeAsync(0);
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
	expect(test.state.context.releaseGuestReference).toHaveBeenCalledWith(token);
});

it("releases timer bookkeeping without calling release on already revoked SDK references", async () => {
	const test = fixture();
	await test.scripts.evaluate("initialize");
	(
		test.scripts.window as {
			setTimeout(
				callback: () => void,
				delay: number,
				argument: unknown,
			): number;
		}
	).setTimeout(() => {}, 60_000, Object.freeze({}));
	await test.state.close();
	await test.scripts.close();
	expect(test.state.context.releaseGuestReference).not.toHaveBeenCalled();
	expect(test.scripts.metrics().timers?.active).toBe(0);
});

it("cancels an in-flight public evaluation through the realm lifetime signal", async () => {
	const test = fixture();
	await test.scripts.evaluate("initialize");
	test.state.evaluate.mockImplementation(
		() =>
			new Promise((_resolve, reject) =>
				test.state.signal.signal.addEventListener(
					"abort",
					() => reject(new Error("aborted")),
					{ once: true },
				),
			),
	);
	const controller = new AbortController();
	const pending = test.scripts
		.evaluate("waiting", { signal: controller.signal })
		.catch((error: unknown) => error);
	controller.abort();
	expect(await pending).toMatchObject({ code: "aborted" });
	expect(test.state.options.signal.aborted).toBe(true);
	expect(test.scripts.closed).toBe(true);
});

it("times out lazy bootstrap, closes its realm and never fabricates bindings", async () => {
	vi.useFakeTimers();
	const test = fixture(undefined, 20);
	test.state.evaluate.mockImplementation(
		() =>
			new Promise((_resolve, reject) =>
				test.state.signal.signal.addEventListener(
					"abort",
					() => reject(new Error("aborted")),
					{ once: true },
				),
			),
	);
	const pending = test.scripts
		.evaluate("never")
		.catch((error: unknown) => error);
	await vi.advanceTimersByTimeAsync(25);
	expect(await pending).toMatchObject({ code: "timeout" });
	expect(test.state.objectCount).toBe(0);
	expect(test.scripts.metrics().dom).toBeUndefined();
});

it("keeps separate documents in separate extension contexts", async () => {
	const shared = fakeCore();
	const first = fixture(shared);
	const second = fixture(shared);
	await first.scripts.evaluate("first");
	await second.scripts.evaluate("second");
	expect(first.state.globals?.window).not.toBe(second.state.globals?.window);
	await first.scripts.close();
	expect(second.scripts.closed).toBe(false);
	expect(await second.scripts.evaluate("still-live")).toMatchObject({
		ok: true,
	});
});

it("declares optional globals before setup and emits exactly that set when initialized", async () => {
	const tree = new DocumentTree("https://example.com/");
	bindPageHistory(tree, {
		snapshot: () => ({ state: null, length: 1 }),
		pushState() {},
		replaceState() {},
		traverse() {},
		navigate() {},
	});
	bindPageStorage(tree, {
		area() {
			throw new Error("unused");
		},
		readCookie: () => "",
		writeCookie() {},
	});
	const shared = fakeCore();
	const scripts = new PageScripts(
		{ document: tree, interactions: new DocumentInteractions(tree) },
		extensionPageRuntime(shared.core),
		{
			fetch: async () => {
				throw new Error("unused");
			},
		},
	);
	owners.push({ scripts, tree });
	expect(shared.defineExtension.mock.calls[0][0].manifest.globals).toEqual(
		expect.arrayContaining([
			"history",
			"localStorage",
			"sessionStorage",
			"fetch",
		]),
	);
	expect(shared.realms[0].objectCount).toBe(0);
	await scripts.evaluate("initialize");
	expect(Object.keys(shared.realms[0].globals ?? {}).sort()).toEqual(
		[...shared.defineExtension.mock.calls[0][0].manifest.globals].sort(),
	);
	await scripts.close();
});

it("does not fall back when a core rejects the public console authorization", async () => {
	const shared = fakeCore();
	shared.createRealm.mockImplementation(() => {
		throw new TypeError("Unsupported builtinOverrides");
	});
	const tree = new DocumentTree("https://example.com/");
	const interactions = new DocumentInteractions(tree);
	try {
		expect(
			() =>
				new PageScripts(
					{ document: tree, interactions },
					extensionPageRuntime(shared.core),
				),
		).toThrow("Unsupported builtinOverrides");
		expect(shared.createRealm).toHaveBeenCalledTimes(1);
		expect(shared.realms).toHaveLength(0);
		expect(interactions.events.metrics().closed).toBe(false);
	} finally {
		tree.close();
	}
});

it("rejects a selection stub without real public budget metrics before constructing a realm", () => {
	const shared = fakeCore();
	const tree = new DocumentTree("https://example.com/");
	const interactions = new DocumentInteractions(tree);
	shared.core.Budget = class {} as never;
	try {
		expect(
			() =>
				new PageScripts(
					{ document: tree, interactions },
					extensionPageRuntime(shared.core),
				),
		).toThrow("budget metrics");
		expect(shared.createRealm).not.toHaveBeenCalled();
	} finally {
		tree.close();
	}
});

it("fails closed if a selected core ignores extension setup", async () => {
	const test = fixture();
	test.state.evaluate.mockResolvedValue({ ok: true });
	await expect(test.scripts.evaluate("never")).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(test.scripts.closed).toBe(true);
	expect(test.state.evaluate.mock.calls.map(([source]) => source)).toEqual([
		"",
	]);
});

it("does not accept an old untagged evaluation result as success", async () => {
	const test = fixture();
	await test.scripts.evaluate("initialize");
	test.state.evaluate.mockResolvedValue({ returnValue: "old" } as never);
	await expect(test.scripts.evaluate("invalid")).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(test.scripts.closed).toBe(true);
});

it("does not return successful data after the SDK revokes its context during evaluation", async () => {
	const test = fixture();
	await test.scripts.evaluate("initialize");
	test.state.evaluate.mockImplementation(async () => {
		await test.state.close();
		return { ok: true, returnValue: "revoked" };
	});
	await expect(test.scripts.evaluate("revoked")).rejects.toMatchObject({
		code: "closed",
	});
	expect(test.scripts.metrics().dom?.classLists.closed).toBe(true);
	expect(test.scripts.metrics().active).toBe(false);
});

it("preserves runtime close failures while clearing browser resources", async () => {
	const test = fixture();
	await test.scripts.evaluate("initialize");
	const failure = new Error("cleanup failed");
	test.state.closeFailure = failure;
	const closing = test.scripts.close();
	expect(test.scripts.close()).toBe(closing);
	await expect(closing).rejects.toBe(failure);
	expect(test.scripts.metrics().dom?.classLists.closed).toBe(true);
	expect(test.scripts.metrics().pendingCallbacks).toBe(0);
});
