import { expect, it, vi } from "vitest";
import {
	type PageRuntimeConfiguration,
	type PageRuntimeAdapter,
	pageRuntimeAdapter,
	selectPageRuntime,
} from "./page-runtime-selection.js";
import type { PageRuntimeOptions, PageScriptCore } from "./page-runtime.js";
import type {
	ReleasedContext,
	ReleasedCore,
} from "./safejs-extension-types.js";
import { scriptLimits } from "./safejs.js";

class Budget {
	stepsUsed = 0;
	peakCallDepth = 0;
	peakDataSize = 0;
}

it.each([
	{ classicScripts: true },
	{ classicScripts: false },
	{ callbackScheduling: "after-prefix" },
	{ classicScripts: true, callbackScheduling: "after-prefix" },
] as const)(
	"snapshots and forwards only explicit extension configuration %#",
	async (configuration) => {
		const test = extensionFixture();
		const requested = { ...configuration };
		const selected = selectPageRuntime(test.core, "extension", requested);
		expect(selected.runtimeOptions).toEqual(configuration);
		expect(Object.isFrozen(selected.runtimeOptions)).toBe(true);
		Object.assign(requested, {
			classicScripts: false,
			callbackScheduling: undefined,
		});
		const runtime = selected.factory.createPageRuntime(options());
		const actual = test.core.createRealm.mock.calls[0][0];
		expect(actual.classicScripts).toBe(
			configuration.classicScripts === true ? true : undefined,
		);
		expect(actual.callbackScheduling).toBe(configuration.callbackScheduling);
		await runtime.close();
	},
);

it.each([
	null,
	[],
	true,
	"classic",
	{ classicScripts: "true" },
	{ classicScripts: undefined },
	{ callbackScheduling: "immediate" },
	{ moduleOptions: {} },
	{ sourceResolver() {} },
	Object.create({ classicScripts: true }),
])(
	"rejects malformed runtime configuration before touching the core %#",
	(configuration) => {
		const getter = vi.fn();
		const core = Object.defineProperty({}, "Budget", { get: getter });
		expect(() =>
			selectPageRuntime(
				core,
				"extension",
				configuration as PageRuntimeConfiguration,
			),
		).toThrow(/runtime/);
		expect(getter).not.toHaveBeenCalled();
	},
);

it("rejects configuration accessors and non-serializable keys without executing them", () => {
	const getter = vi.fn(() => true);
	for (const value of [
		Object.defineProperty({}, "classicScripts", {
			get: getter,
			enumerable: true,
		}),
		{ [Symbol("option")]: true },
		Object.defineProperty({}, "classicScripts", { value: true }),
	]) {
		expect(() =>
			selectPageRuntime(extensionFixture().core, "extension", value),
		).toThrow(/runtime/);
	}
	expect(getter).not.toHaveBeenCalled();
});

it.each([
	{ classicScripts: true },
	{ classicScripts: false },
	{ callbackScheduling: "after-prefix" },
] as const)(
	"rejects requested extension semantics on legacy %#",
	(configuration) => {
		expect(() =>
			selectPageRuntime(legacyFixture().core, "legacy", configuration),
		).toThrow(/extension/);
	},
);

it("keeps default selection metadata free of configuration", () => {
	expect(selectPageRuntime(legacyFixture().core)).not.toHaveProperty(
		"runtimeOptions",
	);
	expect(
		selectPageRuntime(extensionFixture().core, "extension", {}),
	).not.toHaveProperty("runtimeOptions");
});

it("normalizes null-prototype configuration into a frozen serializable snapshot", () => {
	const configuration = Object.assign(Object.create(null), {
		callbackScheduling: "after-prefix",
		classicScripts: false,
	});
	const selected = selectPageRuntime(
		extensionFixture().core,
		"extension",
		configuration,
	);
	expect(JSON.stringify(selected.runtimeOptions)).toBe(
		'{"classicScripts":false,"callbackScheduling":"after-prefix"}',
	);
	expect(Object.isFrozen(selected.runtimeOptions)).toBe(true);
});

function options(): PageRuntimeOptions {
	return {
		limits: scriptLimits(),
		signal: new AbortController().signal,
		globals: ["console"],
		onClosed: vi.fn(),
		setup: vi.fn(() => ({ console: {} })),
		sink: { log: vi.fn(), error: vi.fn() },
	};
}

function legacyFixture() {
	let closed = false;
	const realm = {
		get closed() {
			return closed;
		},
		evaluate: vi.fn(async () => ({ returnValue: { answer: 42 } })),
		close: vi.fn(async () => {
			closed = true;
		}),
	};
	const core = {
		Budget,
		SandboxError: class SandboxError extends Error {
			code = "fixture-error";
		},
		createRealm: vi.fn<PageScriptCore["createRealm"]>(() => realm),
		createHostObject: vi.fn(() => ({})),
		startCallback: vi.fn<PageScriptCore["startCallback"]>(() => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve("callback-result"),
		})),
		deepCopyFromSandbox: vi.fn((value: unknown) => ({ copied: value })),
		retainGuestArguments<
			Operation extends (...args: readonly unknown[]) => unknown,
		>(operation: Operation, _from: number): Operation {
			return operation;
		},
		releaseGuestReference: vi.fn(() => true),
	} satisfies PageScriptCore;
	return { core, realm };
}

function extensionFixture() {
	let definition: Parameters<ReleasedCore["defineExtension"]>[0] | undefined;
	let initialized = false;
	const controller = new AbortController();
	const cleanups: (() => void | Promise<void>)[] = [];
	const context: ReleasedContext = {
		signal: controller.signal,
		onCleanup: (cleanup) => cleanups.push(cleanup),
		createHostObject: vi.fn(() => ({})),
		startCallback: vi.fn(() => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve("callback-result"),
		})),
		releaseCallback: vi.fn(),
		retainGuestArguments: vi.fn((operation, _from) => operation),
		releaseGuestReference: vi.fn(),
		nestedOperation: (operation) => operation,
		evaluateNested: vi.fn(async () => {}),
	};
	const realm = {
		evaluate: vi.fn(async (source: string) => {
			if (!initialized) {
				if (!definition) throw new Error("Missing fixture definition");
				definition.setup(context);
				initialized = true;
			}
			return { ok: true, returnValue: source ? { answer: 42 } : undefined };
		}),
		startCallback: context.startCallback,
		releaseCallback: context.releaseCallback,
		close: vi.fn(async () => {
			controller.abort();
			for (const cleanup of cleanups.splice(0)) await cleanup();
		}),
	};
	const core = {
		Budget,
		defineExtension: vi.fn<ReleasedCore["defineExtension"]>((input) => {
			definition = input;
			return input;
		}),
		createRealm: vi.fn<ReleasedCore["createRealm"]>(() => realm),
	} satisfies ReleasedCore;
	return { core, realm, context };
}

it("selects legacy by default without evaluating or creating a realm", () => {
	const test = legacyFixture();
	const selected = selectPageRuntime(test.core);
	expect(selected.adapter).toBe("legacy");
	expect(selected.validation).toBe("contract-shape-only");
	expect(Object.isFrozen(selected)).toBe(true);
	expect(test.core.createRealm).not.toHaveBeenCalled();
	expect(test.realm.evaluate).not.toHaveBeenCalled();
});

it("requires explicit extension opt-in without falling back in either direction", () => {
	const legacy = legacyFixture();
	const extension = extensionFixture();
	expect(() => selectPageRuntime(extension.core)).toThrow(
		"legacy page runtime",
	);
	expect(() => selectPageRuntime(legacy.core, "extension")).toThrow(
		"extension page runtime",
	);
	expect(selectPageRuntime(extension.core, "extension")).toMatchObject({
		adapter: "extension",
		validation: "contract-shape-only",
	});
	expect(extension.core.createRealm).not.toHaveBeenCalled();
	expect(extension.core.defineExtension).not.toHaveBeenCalled();
});

it("chooses the requested contract even when a namespace exposes both shapes", () => {
	const legacy = legacyFixture();
	const extension = extensionFixture();
	const hybrid = {
		...legacy.core,
		defineExtension: extension.core.defineExtension,
	};
	expect(selectPageRuntime(hybrid).adapter).toBe("legacy");
	expect(selectPageRuntime(hybrid, "extension").adapter).toBe("extension");
	expect(extension.core.defineExtension).not.toHaveBeenCalled();
	expect(legacy.core.createRealm).not.toHaveBeenCalled();
});

it.each([
	"Budget",
	"SandboxError",
	"createRealm",
	"createHostObject",
	"startCallback",
	"deepCopyFromSandbox",
	"retainGuestArguments",
	"releaseGuestReference",
])("rejects incomplete legacy contracts missing %s", (name) => {
	const { core } = legacyFixture();
	expect(() => selectPageRuntime({ ...core, [name]: undefined })).toThrow(
		"legacy page runtime contract",
	);
	expect(core.createRealm).not.toHaveBeenCalled();
});

it.each(["Budget", "defineExtension", "createRealm"])(
	"rejects incomplete extension contracts missing %s",
	(name) => {
		const { core } = extensionFixture();
		expect(() =>
			selectPageRuntime({ ...core, [name]: null }, "extension"),
		).toThrow("extension page runtime contract");
		expect(core.defineExtension).not.toHaveBeenCalled();
	},
);

it.each([null, undefined, false, "sdk", 42, [], () => {}])(
	"rejects malformed namespaces without running them: %s",
	(core) => {
		expect(() => selectPageRuntime(core)).toThrow(
			"legacy page runtime contract",
		);
	},
);

it("rejects accessors and inherited operations without invoking getters", () => {
	const { core } = legacyFixture();
	const getter = vi.fn(() => core.createRealm);
	const accessor = { ...core };
	Object.defineProperty(accessor, "createRealm", { get: getter });
	expect(() => selectPageRuntime(accessor)).toThrow("legacy page runtime");
	expect(getter).not.toHaveBeenCalled();
	expect(() => selectPageRuntime(Object.create(core))).toThrow(
		"legacy page runtime",
	);
});

it.each([null, false, "auto", "released", "", 1])(
	"rejects invalid adapter values before inspecting the core: %s",
	(adapter) => {
		const getter = vi.fn();
		const core = Object.defineProperty({}, "Budget", { get: getter });
		expect(() =>
			selectPageRuntime(core, adapter as PageRuntimeAdapter),
		).toThrow("Invalid page runtime adapter");
		expect(getter).not.toHaveBeenCalled();
	},
);

it("uses only the documented adapter names and keeps undefined legacy", () => {
	expect(pageRuntimeAdapter()).toBe("legacy");
	expect(pageRuntimeAdapter("legacy")).toBe("legacy");
	expect(pageRuntimeAdapter("extension")).toBe("extension");
});

it("returns a usable legacy factory with unchanged result and callback translation", async () => {
	const test = legacyFixture();
	const input = options();
	const runtime = selectPageRuntime(test.core).factory.createPageRuntime(input);
	expect(input.setup).toHaveBeenCalledWith(test.core);
	expect(test.core.createRealm).toHaveBeenCalledWith(
		expect.objectContaining({
			bindings: { console: {} },
			budget: runtime.budget,
			signal: input.signal,
		}),
	);
	await runtime.initialize();
	expect(test.realm.evaluate).not.toHaveBeenCalled();
	const evaluation = { signal: input.signal, filename: "fixture.js" };
	await expect(runtime.evaluate("fixture", evaluation)).resolves.toEqual({
		ok: true,
		returnValue: { answer: 42 },
	});
	expect(test.realm.evaluate).toHaveBeenCalledWith("fixture", evaluation);
	expect(runtime.copyResult(42)).toEqual({ copied: 42 });
	const callback = {};
	const receiver = { thisValue: {} };
	const ticket = runtime.startCallback(callback, [42], receiver);
	await expect(ticket.result).resolves.toBe("callback-result");
	expect(test.core.startCallback).toHaveBeenCalledWith(
		callback,
		[42],
		receiver,
	);
	await runtime.close();
	expect(runtime.closed).toBe(true);
	expect(test.realm.close).toHaveBeenCalledOnce();
});

it("returns the existing extension factory with lazy setup, ownership and callbacks", async () => {
	const test = extensionFixture();
	const input = options();
	const selected = selectPageRuntime(test.core, "extension");
	const runtime = selected.factory.createPageRuntime(input);
	expect(input.setup).not.toHaveBeenCalled();
	expect(test.core.createRealm).toHaveBeenCalledWith(
		expect.objectContaining({
			builtinOverrides: { console: "agent-browser-page" },
			grants: ["guest:retain", "source:nested"],
		}),
	);
	await runtime.initialize();
	await runtime.initialize();
	expect(input.setup).toHaveBeenCalledOnce();
	const result = await runtime.evaluate("fixture", {
		signal: input.signal,
		filename: "fixture.js",
	});
	expect(result).toEqual({ ok: true, returnValue: { answer: 42 } });
	expect(test.realm.evaluate).toHaveBeenLastCalledWith("fixture", {
		filename: "fixture.js",
	});
	const value = { answer: 42 };
	expect(runtime.copyResult(value)).toBe(value);
	const callback = {};
	const receiver = {};
	const ticket = runtime.startCallback(callback, [42], { thisValue: receiver });
	await expect(ticket.synchronous).resolves.toBeUndefined();
	await expect(ticket.result).resolves.toBe("callback-result");
	expect(test.realm.startCallback).toHaveBeenCalledWith(callback, {
		args: [42],
		thisValue: receiver,
	});
	await runtime.close();
	await runtime.close();
	expect(test.realm.close).toHaveBeenCalledOnce();
	expect(input.onClosed).toHaveBeenCalledOnce();
	expect(() =>
		runtime.startCallback(callback, [], { thisValue: undefined }),
	).toThrow("closed");
});

it("propagates extension initialization failure and closes the selected realm", async () => {
	const test = extensionFixture();
	const input = options();
	input.setup = () => {
		throw new Error("fixture setup failure");
	};
	const runtime = selectPageRuntime(
		test.core,
		"extension",
	).factory.createPageRuntime(input);
	await expect(runtime.initialize()).rejects.toThrow("fixture setup failure");
	expect(runtime.closed).toBe(true);
	expect(test.realm.close).toHaveBeenCalledOnce();
	expect(input.onClosed).toHaveBeenCalledOnce();
});

it("keeps extension abort and revocation in the existing adapter", async () => {
	const test = extensionFixture();
	const controller = new AbortController();
	const input = { ...options(), signal: controller.signal };
	const runtime = selectPageRuntime(
		test.core,
		"extension",
	).factory.createPageRuntime(input);
	await runtime.initialize();
	controller.abort();
	await runtime.close();
	expect(runtime.closed).toBe(true);
	expect(input.onClosed).toHaveBeenCalledOnce();
	expect(test.realm.close).toHaveBeenCalledOnce();
	await expect(
		runtime.evaluate("fixture", { signal: input.signal }),
	).rejects.toThrow("closed");
});

it("does not create an extension realm when the owner is already aborted", () => {
	const test = extensionFixture();
	const controller = new AbortController();
	controller.abort();
	expect(() =>
		selectPageRuntime(test.core, "extension").factory.createPageRuntime({
			...options(),
			signal: controller.signal,
		}),
	).toThrow("aborted");
	expect(test.core.createRealm).not.toHaveBeenCalled();
});
