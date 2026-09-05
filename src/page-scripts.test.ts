import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { BrowserEvent } from "./events.js";
import { DocumentInteractions } from "./interactions.js";
import { readPageConsole } from "./page-console.js";
import {
	type PageRealmOptions,
	type PageScriptCore,
	PageScripts,
} from "./page-scripts.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

afterEach(() => vi.useRealTimers());

it("shares live Location aliases and revokes them with the page realm", async () => {
	const test = fixture();
	const scripts = new PageScripts(
		{ document: test.tree, interactions: test.actions },
		test.core,
	);
	const location = test.options().bindings.location as { href: string };
	const window = scripts.window as { location: object };
	const document = scripts.dom.document as { location: object };
	expect(window.location).toBe(location);
	expect(document.location).toBe(location);
	test.tree.setUrl("https://example.com/next#fragment");
	expect(location.href).toBe(test.tree.url);
	expect(() => {
		window.location = {};
	}).toThrow("not implemented");
	await scripts.close();
	expect(() => location.href).toThrow("closed");
	test.tree.close();
});

it("owns timers on the page and cancels them when the document closes", async () => {
	vi.useFakeTimers();
	const test = fixture();
	const scripts = new PageScripts(
		{ document: test.tree, interactions: test.actions },
		test.core,
	);
	const callback = vi.fn();
	const window = scripts.window as {
		setTimeout(callback: unknown, delay: number): number;
	};
	window.setTimeout(callback, 20);
	expect(scripts.metrics().timers?.active).toBe(1);
	test.tree.close();
	await scripts.close();
	await vi.advanceTimersByTimeAsync(20);
	expect(callback).not.toHaveBeenCalled();
	expect(scripts.metrics().timers).toMatchObject({ active: 0, closed: true });
});

it("waits for an active callback prefix before entering a later source evaluation", async () => {
	vi.useFakeTimers();
	const test = fixture();
	let release!: () => void;
	const synchronous = new Promise<void>((resolve) => {
		release = resolve;
	});
	test.core.startCallback = () => ({ synchronous, result: synchronous });
	const scripts = new PageScripts(
		{ document: test.tree, interactions: test.actions },
		test.core,
	);
	scripts.timers.methods.setTimeout(() => undefined, 1);
	await vi.advanceTimersByTimeAsync(1);
	const evaluation = scripts.evaluate("after prefix");
	expect(test.evaluate).not.toHaveBeenCalled();
	await expect(scripts.evaluate("overlap")).rejects.toMatchObject({
		code: "invalid-input",
	});
	release();
	expect(await evaluation).toMatchObject({ ok: true });
	expect(test.evaluate).toHaveBeenCalledOnce();
	await scripts.close();
	test.tree.close();
});

it("honors the evaluation deadline while waiting for an active callback prefix", async () => {
	vi.useFakeTimers();
	const test = fixture();
	let release!: () => void;
	const synchronous = new Promise<void>((resolve) => {
		release = resolve;
	});
	test.core.startCallback = () => ({ synchronous, result: synchronous });
	const scripts = new PageScripts(
		{ document: test.tree, interactions: test.actions },
		test.core,
		{
			limits: { timeoutMs: 20 },
		},
	);
	scripts.timers.methods.setTimeout(() => undefined, 1);
	await vi.advanceTimersByTimeAsync(1);
	const evaluation = expect(
		scripts.evaluate("never entered"),
	).rejects.toMatchObject({ code: "timeout" });
	await vi.advanceTimersByTimeAsync(20);
	await evaluation;
	expect(test.evaluate).not.toHaveBeenCalled();
	expect(scripts.closed).toBe(true);
	release();
	await scripts.close();
	test.tree.close();
});

it("shares the browser console between globals and window, retaining logs after realm close", async () => {
	const test = fixture();
	const scripts = new PageScripts(
		{ document: test.tree, interactions: test.actions },
		test.core,
	);
	const methods = test.options().bindings.console as Record<
		string,
		(...args: unknown[]) => unknown
	>;
	expect((scripts.window as { console: object }).console).toBe(methods);
	methods.log("hello", scripts.dom.document);
	methods.warn("warning");
	methods.error("failure");
	expect(readPageConsole(test.tree).entries.map((entry) => entry.text)).toEqual(
		["hello #document", "warning", "failure"],
	);
	expect(scripts.metrics().consoleCalls).toBe(3);
	await scripts.close();
	expect(readPageConsole(test.tree).entries).toHaveLength(3);
	expect(() => methods.log("late")).toThrow("closed");
	test.tree.close();
});

it("records sanitized evaluation failures without exposing host error details", async () => {
	const test = fixture();
	test.evaluate.mockRejectedValueOnce(new Error("private host path"));
	const scripts = new PageScripts(
		{ document: test.tree, interactions: test.actions },
		test.core,
	);
	expect((await scripts.evaluate("invalid source")).ok).toBe(false);
	const entry = readPageConsole(test.tree, "error").entries[0];
	expect(entry.source).toBe("evaluation");
	expect(entry.text).toBe("Page evaluation failed: script-error");
	await scripts.close();
	test.tree.close();
});

it("retains sanitized callback diagnostics without closing a healthy realm", async () => {
	const test = fixture();
	const scripts = new PageScripts(
		{ document: test.tree, interactions: test.actions },
		test.core,
	);
	const window = scripts.window as {
		addEventListener(type: string, callback: unknown): void;
	};
	window.addEventListener("diagnostic", async () => {
		throw new Error("private callback details");
	});
	const target = test.actions.events.windowTarget;
	if (target === null) throw new Error("Window target missing");
	await test.actions.events.dispatchEventAsync(
		target,
		new BrowserEvent("diagnostic"),
	);
	expect(readPageConsole(test.tree, "error").entries).toMatchObject([
		{ source: "callback", text: "Page callback failed: script-error" },
	]);
	expect(scripts.closed).toBe(false);
	await scripts.close();
	test.tree.close();
});

it("grants the same document-owned fetch function globally and on Window only with a transport", async () => {
	const test = fixture();
	const scripts = new PageScripts(
		{ document: test.tree, interactions: test.actions },
		test.core,
		{
			fetch: async (input) => ({
				url: input.url,
				status: 200,
				headers: {},
				body: new TextEncoder().encode("data"),
				encodedBytes: 4,
				redirects: [],
				elapsedMs: 0,
			}),
		},
	);
	const fetch = test.options().bindings.fetch as (
		input: string,
	) => Promise<{ text(): Promise<string> }>;
	expect((scripts.window as { fetch: unknown }).fetch).toBe(fetch);
	expect(await (await fetch("/data")).text()).toBe("data");
	expect(scripts.metrics().fetch).toMatchObject({
		requests: 1,
		retainedBytes: 0,
	});
	await scripts.close();
	expect(scripts.metrics().fetch).toMatchObject({ closed: true });
	await expect(fetch("/late")).rejects.toMatchObject({ code: "closed" });
	test.tree.close();
	const isolated = fixture();
	const withoutNetwork = new PageScripts(
		{ document: isolated.tree, interactions: isolated.actions },
		isolated.core,
	);
	expect(isolated.options().bindings.fetch).toBeUndefined();
	await withoutNetwork.close();
	isolated.tree.close();
});

function fixture() {
	const tree = new DocumentTree("https://example.com/");
	const actions = new DocumentInteractions(tree);
	let options: PageRealmOptions | undefined;
	const evaluate = vi.fn(
		async (_source: string, _options?: { signal?: AbortSignal }) => ({
			returnValue: { answer: 42 },
		}),
	);
	const realm = {
		closed: false,
		evaluate,
		close: vi.fn(async () => {
			realm.closed = true;
		}),
	};
	const createHostObject = (definition: ScriptHostObjectDefinition) => {
		const result = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(result, name, {
				get: property.get,
				set: property.set,
			});
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(result, name, { value: method });
		return result;
	};
	class Budget {
		stepsUsed = 0;
		peakCallDepth = 0;
		peakDataSize = 0;
	}
	class SandboxError extends Error {
		code = "aborted";
	}
	const core: PageScriptCore = {
		Budget,
		SandboxError,
		createHostObject,
		deepCopyFromSandbox: (value) => value,
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => false,
		createRealm: vi.fn((input) => {
			options = input;
			return realm;
		}),
		startCallback(callback, args, callbackOptions) {
			if (typeof callback !== "function") throw new Error("Expected callback");
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(
					callback.apply(callbackOptions.thisValue, args),
				),
			};
		},
	};
	return {
		tree,
		actions,
		core,
		realm,
		evaluate,
		options: () => {
			if (!options) throw new Error("Realm was not initialized");
			return options;
		},
	};
}

it("creates one persistent realm with live document/window aliases and explicit lifetime limits", async () => {
	const { tree, actions, core, options } = fixture();
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
	);
	const bindings = options().bindings;
	expect(Object.keys(bindings).sort()).toEqual([
		"CSS",
		"cancelAnimationFrame",
		"cancelIdleCallback",
		"clearInterval",
		"clearTimeout",
		"console",
		"devicePixelRatio",
		"document",
		"getComputedStyle",
		"getSelection",
		"location",
		"matchMedia",
		"outerHeight",
		"outerWidth",
		"performance",
		"requestAnimationFrame",
		"requestIdleCallback",
		"scroll",
		"scrollBy",
		"scrollTo",
		"self",
		"setInterval",
		"setTimeout",
		"window",
	]);
	expect((bindings.window as { document: object }).document).toBe(
		bindings.document,
	);
	expect(bindings.self).toBe(bindings.window);
	expect(options().maxEvaluations).toBe(scripts.limits.maxRuns);
	expect(options().maxSourceLength).toBe(scripts.limits.maxSourceCodeUnits);
	expect(await scripts.evaluate("first")).toMatchObject({
		ok: true,
		value: { answer: 42 },
	});
	expect(await scripts.evaluate("second")).toMatchObject({ ok: true });
	expect(core.createRealm).toHaveBeenCalledTimes(1);
	expect(scripts.metrics().evaluations).toBe(2);
	await scripts.close();
	tree.close();
});

it("does not copy ignored website-script completion values", async () => {
	const { tree, actions, core } = fixture();
	const copy = vi.fn(() => {
		throw new Error("must not project a script completion");
	});
	core.deepCopyFromSandbox = copy;
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
	);
	expect(
		await scripts.evaluate("source", { discardResult: true }),
	).toMatchObject({ ok: true });
	expect(copy).not.toHaveBeenCalled();
	await scripts.close();
	tree.close();
});

it("owns only one runtime per document and disposes it once on document close", async () => {
	const { tree, actions, core, realm, options } = fixture();
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
	);
	expect(
		() => new PageScripts({ document: tree, interactions: actions }, core),
	).toThrow(/already owned/i);
	tree.close();
	await scripts.close();
	expect(realm.close).toHaveBeenCalledTimes(1);
	expect(options().signal.aborted).toBe(true);
	expect(actions.events.metrics().closed).toBe(true);
	await expect(scripts.evaluate("late")).rejects.toMatchObject({
		code: "closed",
	});
});

it("aborts page JavaScript while preserving native link actions when the caller cancels", async () => {
	const { tree, actions, core, evaluate } = fixture();
	evaluate.mockImplementation(
		(_source, options) =>
			new Promise((_resolve, reject) => {
				options?.signal?.addEventListener(
					"abort",
					() => reject(new Error("canceled")),
					{ once: true },
				);
			}),
	);
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
	);
	const controller = new AbortController();
	const pending = scripts.evaluate("pending", { signal: controller.signal });
	controller.abort();
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	expect(scripts.closed).toBe(true);
	expect(actions.events.metrics().closed).toBe(false);
	const link = tree.createElement("a", { href: "/recover" });
	tree.append(tree.root, link);
	expect(
		(await actions.clickAsync(tree.reference(link))).defaultAction,
	).toMatchObject({ kind: "navigate", url: "https://example.com/recover" });
	await scripts.close();
	tree.close();
});

it("does not close an idle page for a pre-aborted evaluation request", async () => {
	const { tree, actions, core, evaluate } = fixture();
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
	);
	await expect(
		scripts.evaluate("unused", { signal: AbortSignal.abort() }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(evaluate).not.toHaveBeenCalled();
	expect(scripts.closed).toBe(false);
	await scripts.close();
	tree.close();
});

it("rejects overlapping evaluations without aborting the running source", async () => {
	const { tree, actions, core, evaluate } = fixture();
	let release = () => {};
	evaluate.mockImplementation(
		() =>
			new Promise((resolve) => {
				release = () => resolve({ returnValue: { answer: 42 } });
			}),
	);
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
	);
	const pending = scripts.evaluate("first");
	await expect(scripts.evaluate("second")).rejects.toMatchObject({
		code: "invalid-input",
	});
	release();
	expect(await pending).toMatchObject({ ok: true });
	expect(scripts.closed).toBe(false);
	await scripts.close();
	tree.close();
});

it("bounds result projection without invoking accessors or discarding successful realm state", async () => {
	const { tree, actions, core } = fixture();
	const getter = vi.fn(() => 1);
	core.deepCopyFromSandbox = () =>
		Object.defineProperty({}, "secret", { get: getter, enumerable: true });
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
	);
	await expect(scripts.evaluate("result")).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(getter).not.toHaveBeenCalled();
	expect(scripts.closed).toBe(false);
	await scripts.close();
	tree.close();
});

it("times out a cooperating pending evaluation and observes its cleanup", async () => {
	vi.useFakeTimers();
	const { tree, actions, core, evaluate } = fixture();
	evaluate.mockImplementation(
		(_source, options) =>
			new Promise((_resolve, reject) => {
				options?.signal?.addEventListener(
					"abort",
					() => reject(new Error("interrupted")),
					{ once: true },
				);
			}),
	);
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
		{ limits: { timeoutMs: 20 } },
	);
	const failed = expect(scripts.evaluate("pending")).rejects.toMatchObject({
		code: "timeout",
	});
	await vi.advanceTimersByTimeAsync(20);
	await failed;
	expect(scripts.closed).toBe(true);
	await scripts.close();
	tree.close();
});

it("binds Window listeners and closes scripts before exceeding pending callback capacity", async () => {
	const { tree, actions, core, options } = fixture();
	core.startCallback = () => ({
		synchronous: Promise.resolve(),
		result: new Promise<unknown>(() => {}),
	});
	const scripts = new PageScripts(
		{ document: tree, interactions: actions },
		core,
		{ maxPendingCallbacks: 1 },
	);
	const window = options().bindings.window as {
		addEventListener(type: string, callback: unknown): void;
	};
	window.addEventListener("tick", () => {});
	const target = actions.events.windowTarget;
	if (target === null) throw new Error("Missing Window");
	await actions.events.dispatchEventAsync(target, new BrowserEvent("tick"));
	expect(scripts.metrics().pendingCallbacks).toBe(1);
	await expect(
		actions.events.dispatchEventAsync(target, new BrowserEvent("tick")),
	).rejects.toMatchObject({ code: "closed" });
	await scripts.close();
	expect(actions.events.metrics().closed).toBe(false);
	expect(
		await actions.events.dispatchEventAsync(target, new BrowserEvent("tick")),
	).toBe(true);
	tree.close();
});
