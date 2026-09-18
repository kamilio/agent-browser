import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { bindDocumentWebSockets } from "./document-websocket-owner.js";
import { extensionPageRuntime } from "./extension-page-runtime.js";
import { DocumentInteractions } from "./interactions.js";
import {
	legacyPageRuntime,
	type PageRuntimeOptions,
	type PageScriptCore,
} from "./page-runtime.js";
import { PageScripts } from "./page-scripts.js";
import { pageWebSocketBootstrapSource } from "./page-websocket-bootstrap.js";
import { scriptLimits } from "./safejs.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedHostDefinition,
	ReleasedRealm,
} from "./safejs-extension-types.js";
import type { WebSocketTransport } from "./websocket-transport.js";

type Evaluation = Awaited<ReturnType<ReleasedRealm["evaluate"]>>;
type Definition = Parameters<ReleasedCore["defineExtension"]>[0];
const cleanups: (() => void | Promise<void>)[] = [];
const bootstrapSource = "globalThis.fixtureReady = true;";
const bootstrapFilename = "agent-browser:page-bootstrap";

afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<Value>((success, failure) => {
		resolve = success;
		reject = failure;
	});
	return { promise, resolve, reject };
}

function hostObject(definition: ReleasedHostDefinition) {
	const value = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(value, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(value, name, { value: method });
	return value;
}

function fakeCore() {
	const events: string[] = [];
	const budgets: ConstructorParameters<ReleasedCore["Budget"]>[0][] = [];
	class Budget {
		stepsUsed = 0;
		peakCallDepth = 0;
		peakDataSize = 0;
		constructor(options: ConstructorParameters<ReleasedCore["Budget"]>[0]) {
			budgets.push(options);
		}
	}
	const response = vi.fn<ReleasedRealm["evaluate"]>(async () => ({ ok: true }));
	const defineExtension = vi.fn((definition: Definition) => {
		events.push("define");
		return definition;
	});
	const realms: ReturnType<typeof makeRealm>[] = [];
	function makeRealm(options: Parameters<ReleasedCore["createRealm"]>[0]) {
		const definition = options.extensions[0] as Definition;
		const lifetime = new AbortController();
		const ownedCleanups: (() => void | Promise<void>)[] = [];
		let initialized = false;
		let closing: Promise<void> | undefined;
		const startCallback = vi.fn<ReleasedRealm["startCallback"]>(() => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(undefined),
		}));
		const context: ReleasedContext = {
			signal: lifetime.signal,
			onCleanup: (cleanup) => ownedCleanups.push(cleanup),
			createHostObject: hostObject,
			startCallback,
			releaseCallback() {},
			retainGuestArguments: (operation) => operation,
			releaseGuestReference() {},
			nestedOperation: (operation) => operation,
			async evaluateNested() {
				throw new Error("Unexpected nested bootstrap evaluation");
			},
		};
		const close = vi.fn((): Promise<void> => {
			closing ??= Promise.resolve().then(async () => {
				events.push("dispose");
				options.signal.removeEventListener("abort", abort);
				lifetime.abort();
				for (const cleanup of ownedCleanups.splice(0).reverse())
					await cleanup();
			});
			return closing;
		});
		const abort = () => {
			void close().catch(() => undefined);
		};
		options.signal.addEventListener("abort", abort, { once: true });
		const evaluate = vi.fn<ReleasedRealm["evaluate"]>(
			async (source, evaluation) => {
				if (!initialized) {
					initialized = true;
					events.push("setup");
					definition.setup(context);
				}
				events.push(`source:${source}`);
				return response(source, evaluation);
			},
		);
		return {
			options,
			context,
			lifetime,
			evaluate,
			close,
			startCallback,
			releaseCallback() {},
		};
	}
	const createRealm = vi.fn(
		(options: Parameters<ReleasedCore["createRealm"]>[0]) => {
			events.push("create");
			const realm = makeRealm(options);
			realms.push(realm);
			return realm;
		},
	);
	const core = { Budget, defineExtension, createRealm } satisfies ReleasedCore;
	return {
		core,
		budgets,
		defineExtension,
		createRealm,
		realms,
		response,
		events,
	};
}

function runtimeOptions(overrides: Partial<PageRuntimeOptions> = {}) {
	const controller = new AbortController();
	const setup = vi.fn<PageRuntimeOptions["setup"]>((context) => ({
		console: context.createHostObject({ methods: { log() {} } }),
	}));
	const onClosed = vi.fn();
	const options: PageRuntimeOptions = {
		limits: scriptLimits(),
		signal: controller.signal,
		globals: ["console"],
		onClosed,
		setup,
		sink: { log: vi.fn(), error: vi.fn() },
		...overrides,
	};
	return { options, controller, setup, onClosed };
}

function fixture(overrides: Partial<PageRuntimeOptions> = {}) {
	const shared = fakeCore();
	const configured = runtimeOptions(overrides);
	const runtime = extensionPageRuntime(shared.core).createPageRuntime(
		configured.options,
	);
	cleanups.push(() => runtime.close());
	return { ...shared, ...configured, runtime, realm: shared.realms[0] };
}

function scriptFixture(withWebSockets = false) {
	const shared = fakeCore();
	const tree = new DocumentTree("https://example.com/room");
	cleanups.push(() => tree.close());
	const connect = vi.fn<WebSocketTransport["connect"]>(async () => {
		throw new Error("Bootstrap must not open a WebSocket");
	});
	if (withWebSockets) bindDocumentWebSockets(tree, { connect });
	const factory = extensionPageRuntime(shared.core);
	const scripts = new PageScripts(
		{ document: tree, interactions: new DocumentInteractions(tree) },
		{
			createPageRuntime(options) {
				return factory.createPageRuntime(
					withWebSockets
						? options
						: { ...options, initializationSource: bootstrapSource },
				);
			},
		},
		{ limits: { timeoutMs: 10_000 } },
	);
	cleanups.push(() => scripts.close());
	return { ...shared, scripts, tree, connect, realm: shared.realms[0] };
}

it("evaluates the supplied initialization source once after setup and before user code", async () => {
	const test = fixture({ initializationSource: bootstrapSource });
	expect(test.events).toEqual(["define", "create"]);
	expect(test.setup).not.toHaveBeenCalled();
	expect(test.realm.evaluate).not.toHaveBeenCalled();
	const first = test.runtime.initialize();
	const second = test.runtime.initialize();
	expect(second).toBe(first);
	await Promise.all([first, second]);
	await test.runtime.initialize();
	expect(test.setup).toHaveBeenCalledOnce();
	expect(test.realm.evaluate).toHaveBeenCalledExactlyOnceWith(bootstrapSource, {
		filename: bootstrapFilename,
	});
	await test.runtime.evaluate("user source", {
		signal: test.controller.signal,
		filename: "app.js",
	});
	expect(test.events).toEqual([
		"define",
		"create",
		"setup",
		`source:${bootstrapSource}`,
		"source:user source",
	]);
	expect(test.realm.evaluate).toHaveBeenNthCalledWith(2, "user source", {
		filename: "app.js",
	});
});

it.each([undefined, ""])(
	"preserves empty initialization with the appropriate filename for %j",
	async (initializationSource) => {
		const test = fixture({ initializationSource });
		await test.runtime.initialize();
		await test.runtime.initialize();
		expect(test.realm.evaluate).toHaveBeenCalledExactlyOnceWith(
			"",
			initializationSource === undefined ? {} : { filename: bootstrapFilename },
		);
		expect(test.setup).toHaveBeenCalledOnce();
	},
);

it("uses the source snapshot even if the caller changes the options before initialize", async () => {
	const test = fixture({ initializationSource: bootstrapSource });
	test.options.initializationSource = "replacement source";
	await test.runtime.initialize();
	expect(test.realm.evaluate).toHaveBeenCalledExactlyOnceWith(bootstrapSource, {
		filename: bootstrapFilename,
	});
});

it("does not add a bootstrap if originally absent options are mutated later", async () => {
	const test = fixture();
	test.options.initializationSource = bootstrapSource;
	await test.runtime.initialize();
	expect(test.realm.evaluate).toHaveBeenCalledExactlyOnceWith("", {});
});

it.each([null, false, 0, {}, [], Object("source")])(
	"rejects non-string initialization source %j before realm side effects",
	(initializationSource) => {
		const shared = fakeCore();
		const configured = runtimeOptions({
			initializationSource: initializationSource as unknown as string,
		});
		expect(() =>
			extensionPageRuntime(shared.core).createPageRuntime(configured.options),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(shared.budgets).toHaveLength(0);
		expect(shared.defineExtension).not.toHaveBeenCalled();
		expect(shared.createRealm).not.toHaveBeenCalled();
		expect(configured.setup).not.toHaveBeenCalled();
		expect(shared.response).not.toHaveBeenCalled();
	},
);

it("accepts the exact source code-unit limit", async () => {
	const source = "😀";
	const test = fixture({
		initializationSource: source,
		limits: scriptLimits({ maxSourceCodeUnits: 2 }),
	});
	await test.runtime.initialize();
	expect(test.realm.evaluate).toHaveBeenCalledExactlyOnceWith(source, {
		filename: bootstrapFilename,
	});
});

it("rejects an oversized bootstrap by code units before creating a realm", () => {
	const shared = fakeCore();
	const configured = runtimeOptions({
		initializationSource: "😀",
		limits: scriptLimits({ maxSourceCodeUnits: 1 }),
	});
	expect(() =>
		extensionPageRuntime(shared.core).createPageRuntime(configured.options),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(shared.budgets).toHaveLength(0);
	expect(shared.defineExtension).not.toHaveBeenCalled();
	expect(shared.createRealm).not.toHaveBeenCalled();
	expect(configured.setup).not.toHaveBeenCalled();
});

it("rejects pre-aborted creation without evaluating bootstrap or setting up bindings", () => {
	const shared = fakeCore();
	const configured = runtimeOptions({ initializationSource: bootstrapSource });
	configured.controller.abort();
	expect(() =>
		extensionPageRuntime(shared.core).createPageRuntime(configured.options),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	expect(shared.createRealm).not.toHaveBeenCalled();
	expect(configured.setup).not.toHaveBeenCalled();
	expect(shared.response).not.toHaveBeenCalled();
});

it.each(["result", "throw", "setup"] as const)(
	"closes after a bootstrap %s failure and never admits user source",
	async (kind) => {
		const failure = Object.assign(new Error("Constructed bootstrap failure"), {
			code: "fixture-failure",
		});
		const test = fixture({ initializationSource: bootstrapSource });
		if (kind === "result")
			test.response.mockResolvedValueOnce({ ok: false, error: failure });
		else if (kind === "throw") test.response.mockRejectedValueOnce(failure);
		else
			test.setup.mockImplementationOnce(() => {
				throw failure;
			});
		await expect(test.runtime.initialize()).rejects.toMatchObject({
			code: "fixture-failure",
		});
		expect(test.runtime.closed).toBe(true);
		expect(test.realm.lifetime.signal.aborted).toBe(true);
		expect(test.onClosed).toHaveBeenCalledOnce();
		expect(test.events.filter((event) => event === "dispose")).toHaveLength(1);
		await expect(
			test.runtime.evaluate("must not execute", {
				signal: test.controller.signal,
			}),
		).rejects.toMatchObject({ code: "closed" });
		expect(test.realm.evaluate).toHaveBeenCalledTimes(1);
		expect(() => test.runtime.initialize()).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
		await test.runtime.close();
		expect(test.onClosed).toHaveBeenCalledOnce();
	},
);

it("aborts pending initialization, disposes once, and rejects a late success", async () => {
	const test = fixture({ initializationSource: bootstrapSource });
	const waiting = deferred<Evaluation>();
	test.response.mockImplementationOnce(() => waiting.promise);
	const initialized = test.runtime.initialize();
	const rejected = expect(initialized).rejects.toMatchObject({
		code: "closed",
	});
	test.controller.abort();
	await test.runtime.close();
	waiting.resolve({ ok: true });
	await rejected;
	expect(test.realm.options.signal.aborted).toBe(true);
	expect(test.realm.lifetime.signal.aborted).toBe(true);
	expect(test.onClosed).toHaveBeenCalledOnce();
	expect(test.events.filter((event) => event === "dispose")).toHaveLength(1);
	expect(test.realm.evaluate).toHaveBeenCalledTimes(1);
});

it("does not bootstrap a runtime closed before initialization", async () => {
	const test = fixture({ initializationSource: bootstrapSource });
	await test.runtime.close();
	expect(() => test.runtime.initialize()).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(test.setup).not.toHaveBeenCalled();
	expect(test.realm.evaluate).not.toHaveBeenCalled();
	expect(test.onClosed).toHaveBeenCalledOnce();
});

it("holds PageScripts user evaluation until its pending bootstrap succeeds", async () => {
	const test = scriptFixture();
	const entered = deferred<void>();
	const waiting = deferred<Evaluation>();
	test.response.mockImplementationOnce(() => {
		entered.resolve();
		return waiting.promise;
	});
	const requested = test.scripts.evaluate("first user source", {
		filename: "app.js",
	});
	await entered.promise;
	expect(test.realm.evaluate).toHaveBeenCalledExactlyOnceWith(bootstrapSource, {
		filename: bootstrapFilename,
	});
	expect(test.scripts.metrics().initialized).toBe(false);
	waiting.resolve({ ok: true });
	await expect(requested).resolves.toMatchObject({ ok: true });
	await expect(
		test.scripts.evaluate("second user source"),
	).resolves.toMatchObject({ ok: true });
	expect(test.realm.evaluate.mock.calls.map(([source]) => source)).toEqual([
		bootstrapSource,
		"first user source",
		"second user source",
	]);
	expect(test.realm.evaluate).toHaveBeenNthCalledWith(2, "first user source", {
		filename: "app.js",
	});
});

it.each(["failure", "abort"] as const)(
	"does not submit PageScripts user source after bootstrap %s",
	async (outcome) => {
		const test = scriptFixture();
		const entered = deferred<void>();
		const waiting = deferred<Evaluation>();
		test.response.mockImplementationOnce(() => {
			entered.resolve();
			return waiting.promise;
		});
		const controller = new AbortController();
		const requested = test.scripts
			.evaluate("must not execute", { signal: controller.signal })
			.then(
				(result) => result.ok,
				() => false,
			);
		await entered.promise;
		if (outcome === "abort") controller.abort();
		waiting.resolve(
			outcome === "failure"
				? { ok: false, error: { code: "fixture-failure" } }
				: { ok: true },
		);
		expect(await requested).toBe(false);
		expect(test.scripts.closed).toBe(true);
		expect(test.realm.evaluate.mock.calls.map(([source]) => source)).toEqual([
			bootstrapSource,
		]);
		expect(test.realm.lifetime.signal.aborted).toBe(true);
	},
);

it("selects the WebSocket bootstrap for a document owner without opening sockets", async () => {
	const test = scriptFixture(true);
	await expect(test.scripts.evaluate("user source")).resolves.toMatchObject({
		ok: true,
	});
	expect(test.realm.evaluate).toHaveBeenNthCalledWith(
		1,
		pageWebSocketBootstrapSource,
		{ filename: bootstrapFilename },
	);
	expect(test.realm.evaluate.mock.calls.map(([source]) => source)).toEqual([
		pageWebSocketBootstrapSource,
		"user source",
	]);
	expect(test.connect).not.toHaveBeenCalled();
});

it.each(["", bootstrapSource])(
	"rejects supplied bootstrap %j in the legacy adapter before setup or realm creation",
	(initializationSource) => {
		class Budget {
			stepsUsed = 0;
			peakCallDepth = 0;
			peakDataSize = 0;
		}
		const createRealm = vi.fn<PageScriptCore["createRealm"]>(() => {
			throw new Error("Legacy realm must not be created");
		});
		const core: PageScriptCore = {
			Budget,
			SandboxError: class extends Error {
				code = "script-error";
			},
			createRealm,
			createHostObject: hostObject,
			retainGuestArguments: (operation) => operation,
			releaseGuestReference: () => true,
			deepCopyFromSandbox: (value) => value,
			startCallback: () => ({
				synchronous: Promise.resolve(),
				result: Promise.resolve(undefined),
			}),
		};
		const configured = runtimeOptions({ initializationSource });
		expect(() =>
			legacyPageRuntime(core).createPageRuntime(configured.options),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
		expect(configured.setup).not.toHaveBeenCalled();
		expect(createRealm).not.toHaveBeenCalled();
	},
);
