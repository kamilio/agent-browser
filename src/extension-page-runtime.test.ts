import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	type ExtensionPageRuntimeOptions,
	extensionPageRuntime,
	extensionPageRuntimeLimits,
} from "./extension-page-runtime.js";
import { DocumentInteractions } from "./interactions.js";
import { pageBindingGlobalNames } from "./page-bindings.js";
import {
	pageEventBootstrapGlobal,
	pageEventBootstrapSource,
} from "./page-event-bootstrap.js";
import { bindPageHistory } from "./page-history.js";
import type { PageRuntime, PageRuntimeOptions } from "./page-runtime.js";
import { PageScripts, type PageScriptOptions } from "./page-scripts.js";
import { bindPageStorage } from "./page-storage.js";
import { scriptLimits } from "./safejs.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedInvocation,
	ReleasedRealm,
} from "./safejs-extension-types.js";

type Definition = Parameters<ReleasedCore["defineExtension"]>[0];
type RealmOptions = Parameters<ReleasedCore["createRealm"]>[0];
const owners: { scripts: PageScripts; tree: DocumentTree }[] = [];
const pageRuntimes: PageRuntime[] = [];
afterEach(async () => {
	for (const runtime of pageRuntimes.splice(0)) await runtime.close();
	for (const { scripts, tree } of owners.splice(0)) {
		await scripts.close().catch(() => undefined);
		tree.close();
	}
	vi.useRealTimers();
});

function fakeCore(stringPolicy?: PropertyDescriptor) {
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
					if (source === pageEventBootstrapSource) {
						expect(_options).toEqual({
							filename: "agent-browser:page-bootstrap",
						});
						return { ok: true };
					}
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
		const realm = {
			evaluate: state.evaluate,
			startCallback: state.startCallback,
			releaseCallback() {},
			close: state.close,
		};
		if (stringPolicy)
			Object.defineProperty(realm, "stringCompilation", stringPolicy);
		return realm;
	});
	const core: ReleasedCore = { Budget, defineExtension, createRealm };
	return { core, realms, defineExtension, createRealm, budgetOptions };
}

function fixture(
	shared = fakeCore(),
	timeoutMs = 1000,
	configuration: ExtensionPageRuntimeOptions = {},
	pageConfiguration: PageScriptOptions = {},
) {
	const tree = new DocumentTree("https://example.com/");
	const interactions = new DocumentInteractions(tree);
	const scripts = new PageScripts(
		{ document: tree, interactions },
		extensionPageRuntime(shared.core, configuration),
		{
			...pageConfiguration,
			limits: { ...pageConfiguration.limits, timeoutMs },
		},
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

function policyPageOptions(
	selection: Record<string, unknown> = {},
): PageRuntimeOptions {
	return Object.assign(
		{
			limits: scriptLimits(),
			signal: new AbortController().signal,
			globals: ["console"],
			onClosed: vi.fn(),
			setup: vi.fn((context: Parameters<PageRuntimeOptions["setup"]>[0]) => ({
				console: context.createHostObject({ methods: {} }),
			})),
			sink: { log() {}, error() {} },
		},
		selection,
	);
}

it.each([undefined, "bounded-v1"] as const)(
	"snapshots factory DOM expandos %s as an immutable internal marker",
	async (domExpandos) => {
		const shared = fakeCore();
		const configuration: ExtensionPageRuntimeOptions = domExpandos
			? { domExpandos }
			: {};
		const factory = extensionPageRuntime(shared.core, configuration);
		Object.assign(configuration, {
			domExpandos: domExpandos ? undefined : "bounded-v1",
		});
		const setup = vi.fn(
			(context: Parameters<PageRuntimeOptions["setup"]>[0]) => {
				if (domExpandos)
					expect(
						Object.getOwnPropertyDescriptor(context, "domExpandos"),
					).toEqual({
						value: "bounded-v1",
						enumerable: true,
						writable: false,
						configurable: false,
					});
				else expect(Object.hasOwn(context, "domExpandos")).toBe(false);
				return { console: context.createHostObject({ methods: {} }) };
			},
		);
		const runtime = factory.createPageRuntime({
			...policyPageOptions(),
			setup,
		});
		pageRuntimes.push(runtime);
		await runtime.initialize();
		expect(setup).toHaveBeenCalledOnce();
		expect(shared.realms[0].options).not.toHaveProperty("domExpandos");
	},
);

it.each([
	undefined,
	null,
	true,
	false,
	1,
	"",
	"allow",
	{},
	[],
	new String("bounded-v1"),
])(
	"rejects explicit malformed factory DOM expandos %j without SDK allocation",
	(domExpandos) => {
		const shared = fakeCore();
		expect(() =>
			extensionPageRuntime(shared.core, {
				domExpandos,
			} as ExtensionPageRuntimeOptions),
		).toThrow(/expando/i);
		expect(shared.budgetOptions).toEqual([]);
		expect(shared.defineExtension).not.toHaveBeenCalled();
		expect(shared.createRealm).not.toHaveBeenCalled();
	},
);

it("rejects inherited, accessor and hidden factory DOM expandos without getters", () => {
	const getter = vi.fn(() => "bounded-v1");
	const shared = fakeCore();
	for (const configuration of [
		Object.create({ domExpandos: "bounded-v1" }),
		Object.create(Object.defineProperty({}, "domExpandos", { get: getter })),
		Object.defineProperty({}, "domExpandos", { get: getter, enumerable: true }),
		Object.defineProperty({}, "domExpandos", { value: "bounded-v1" }),
	])
		expect(() => extensionPageRuntime(shared.core, configuration)).toThrow(
			/expando/i,
		);
	expect(getter).not.toHaveBeenCalled();
	expect(shared.budgetOptions).toEqual([]);
	expect(shared.defineExtension).not.toHaveBeenCalled();
	expect(shared.createRealm).not.toHaveBeenCalled();
});

it.each([undefined, "bounded-v1"] as const)(
	"forwards node-only DOM metadata for %s and keeps other capabilities fixed",
	async (domExpandos) => {
		const test = fixture(fakeCore(), 1000, domExpandos ? { domExpandos } : {});
		const create = vi.spyOn(test.state.context, "createHostObject");
		await test.scripts.evaluate("initialize");
		const definitions = create.mock.calls.map(([definition]) => definition);
		const nodes = definitions.filter(
			(definition) => definition.properties?.nodeType,
		);
		const fixed = definitions.filter(
			(definition) => !definition.properties?.nodeType,
		);
		expect(nodes.length).toBeGreaterThan(0);
		expect(fixed.length).toBeGreaterThan(0);
		for (const definition of nodes) {
			if (domExpandos) {
				expect(definition.expandos).toEqual({
					maxKeys: 64,
					maxKeyCodeUnits: 4096,
					assertActive: expect.any(Function),
				});
				expect(definition.expandos?.assertActive?.()).toBeUndefined();
			} else expect(Object.hasOwn(definition, "expandos")).toBe(false);
		}
		for (const definition of fixed)
			expect(Object.hasOwn(definition, "expandos")).toBe(false);
		await test.scripts.close();
		if (domExpandos)
			for (const definition of nodes)
				expect(() => definition.expandos?.assertActive?.()).toThrow();
		expect(test.state.objectCount).toBe(0);
		expect(test.state.disposals).toBe(1);
	},
);

it("closes without fallback when the SDK mock rejects requested node expandos", async () => {
	const test = fixture(fakeCore(), 1000, { domExpandos: "bounded-v1" });
	const create = test.state.context.createHostObject;
	const rejected: Parameters<ReleasedContext["createHostObject"]>[0][] = [];
	vi.spyOn(test.state.context, "createHostObject").mockImplementation(
		(definition) => {
			if (Object.hasOwn(definition, "expandos")) {
				rejected.push(definition);
				throw new Error("Unknown host definition field: expandos");
			}
			return create(definition);
		},
	);
	await expect(test.scripts.evaluate("must not start")).resolves.toMatchObject({
		ok: false,
		error: { code: "script-error" },
	});
	expect(rejected).toHaveLength(1);
	expect(() => rejected[0].expandos?.assertActive?.()).toThrow();
	expect(test.createRealm).toHaveBeenCalledOnce();
	expect(test.state.evaluate).toHaveBeenCalledOnce();
	expect(test.state.objectCount).toBe(0);
	expect(test.state.disposals).toBe(1);
	expect(test.scripts.metrics().active).toBe(false);
	await test.scripts.close();
	expect(test.state.disposals).toBe(1);
});

it.each([
	[undefined, undefined, undefined],
	[undefined, "allow", "allow"],
	[undefined, "deny", "deny"],
	["allow", undefined, "allow"],
	["allow", "allow", "allow"],
	["allow", "deny", "deny"],
	["deny", undefined, "deny"],
	["deny", "allow", "deny"],
	["deny", "deny", "deny"],
] as const)(
	"intersects factory %s and per-page %s as %s",
	async (factoryPolicy, pagePolicy, effective) => {
		const shared = fakeCore(
			effective === undefined ? undefined : { value: effective },
		);
		const factory = extensionPageRuntime(
			shared.core,
			factoryPolicy === undefined ? {} : { stringCompilation: factoryPolicy },
		);
		const options = policyPageOptions(
			pagePolicy === undefined ? {} : { stringCompilation: pagePolicy },
		);
		const runtime = factory.createPageRuntime(options);
		pageRuntimes.push(runtime);
		if (effective === undefined)
			expect(shared.realms[0].options).not.toHaveProperty("stringCompilation");
		else expect(shared.realms[0].options.stringCompilation).toBe(effective);
		expect(options.setup).not.toHaveBeenCalled();
		await runtime.initialize();
		expect(options.setup).toHaveBeenCalledOnce();
	},
);

it("snapshots both selections before other page properties and lazy setup can mutate them", async () => {
	const shared = fakeCore({ value: "deny" });
	const configuration: ExtensionPageRuntimeOptions = {
		stringCompilation: "allow",
	};
	const factory = extensionPageRuntime(shared.core, configuration);
	configuration.stringCompilation = "deny";
	const options = policyPageOptions({ stringCompilation: "deny" });
	Object.defineProperty(options, "globals", {
		get() {
			Object.assign(options, { stringCompilation: "allow" });
			return ["console"];
		},
	});
	const runtime = factory.createPageRuntime(options);
	pageRuntimes.push(runtime);
	expect(shared.realms[0].options.stringCompilation).toBe("deny");
	await runtime.initialize();
	expect(shared.realms[0].options.stringCompilation).toBe("deny");
	const second = extensionPageRuntime(shared.core, {
		stringCompilation: "deny",
	});
	const allowed = policyPageOptions({ stringCompilation: "allow" });
	pageRuntimes.push(second.createPageRuntime(allowed));
	expect(shared.realms[1].options.stringCompilation).toBe("deny");
});

it("keeps distinct page selections and lifetimes in a shared factory", async () => {
	const policy = { value: "deny" };
	const shared = fakeCore(policy);
	const configuration: ExtensionPageRuntimeOptions = {};
	const factory = extensionPageRuntime(shared.core, configuration);
	configuration.stringCompilation = "deny";
	for (const selection of ["deny", "allow", undefined] as const) {
		policy.value = selection ?? "allow";
		const options = policyPageOptions(
			selection === undefined ? {} : { stringCompilation: selection },
		);
		const runtime = factory.createPageRuntime(options);
		pageRuntimes.push(runtime);
		await runtime.initialize();
	}
	expect(shared.realms.map((state) => state.options.stringCompilation)).toEqual(
		["deny", "allow", undefined],
	);
	expect(shared.realms[2].options).not.toHaveProperty("stringCompilation");
	await pageRuntimes[0].close();
	expect(pageRuntimes[1].closed).toBe(false);
	expect(pageRuntimes[2].closed).toBe(false);
	expect(shared.realms.map((state) => state.disposals)).toEqual([1, 0, 0]);
});

it.each([
	undefined,
	null,
	false,
	true,
	0,
	"",
	"DENY",
	"block",
	{},
	[],
	new String("deny"),
])(
	"rejects malformed page selection %j before any SDK allocation even under factory deny",
	(stringCompilation) => {
		const shared = fakeCore({ value: "deny" });
		const options = policyPageOptions({ stringCompilation });
		expect(() =>
			extensionPageRuntime(shared.core, {
				stringCompilation: "deny",
			}).createPageRuntime(options),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(shared.budgetOptions).toEqual([]);
		expect(shared.defineExtension).not.toHaveBeenCalled();
		expect(shared.createRealm).not.toHaveBeenCalled();
		expect(options.setup).not.toHaveBeenCalled();
	},
);

it("rejects inherited, accessor and hidden per-page policy descriptors without invoking them", () => {
	const getter = vi.fn(() => "deny");
	const setter = vi.fn();
	const inherited = policyPageOptions();
	Object.setPrototypeOf(
		inherited,
		Object.defineProperty({}, "stringCompilation", { get: getter }),
	);
	for (const options of [
		inherited,
		Object.setPrototypeOf(policyPageOptions(), { stringCompilation: "allow" }),
		Object.defineProperty(policyPageOptions(), "stringCompilation", {
			get: getter,
			enumerable: true,
		}),
		Object.defineProperty(policyPageOptions(), "stringCompilation", {
			set: setter,
			enumerable: true,
		}),
		Object.defineProperty(policyPageOptions(), "stringCompilation", {
			value: "deny",
		}),
	]) {
		const shared = fakeCore();
		expect(() =>
			extensionPageRuntime(shared.core).createPageRuntime(options),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(shared.budgetOptions).toEqual([]);
		expect(shared.defineExtension).not.toHaveBeenCalled();
		expect(shared.createRealm).not.toHaveBeenCalled();
		expect(options.setup).not.toHaveBeenCalled();
	}
	expect(getter).not.toHaveBeenCalled();
	expect(setter).not.toHaveBeenCalled();
});

it.each([
	["allow", undefined],
	["deny", undefined],
	["allow", { value: "deny" }],
	["deny", { value: "allow" }],
	["deny", { value: "deny", writable: true }],
	["deny", { value: "deny", configurable: true }],
	["deny", { value: new String("deny") }],
] as const)(
	"disposes an SDK with mismatched per-page %s echo %# before any bootstrap",
	async (stringCompilation, descriptor) => {
		const shared = fakeCore(descriptor);
		const options = policyPageOptions({ stringCompilation });
		options.initializationSource = "must not execute";
		expect(() =>
			extensionPageRuntime(shared.core).createPageRuntime(options),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
		await Promise.resolve();
		expect(shared.realms).toHaveLength(1);
		expect(shared.realms[0].disposals).toBe(1);
		expect(shared.realms[0].signal.signal.aborted).toBe(true);
		expect(shared.realms[0].evaluate).not.toHaveBeenCalled();
		expect(options.setup).not.toHaveBeenCalled();
		expect(options.onClosed).toHaveBeenCalledOnce();
	},
);

it("rejects a getter or inherited SDK echo for a page-only requirement", async () => {
	const getter = vi.fn(() => "deny");
	for (const inherited of [false, true]) {
		const shared = fakeCore(inherited ? undefined : { get: getter });
		if (inherited) {
			const create = shared.createRealm.getMockImplementation();
			if (!create) throw new Error("Missing realm fixture");
			shared.createRealm.mockImplementation((options) =>
				Object.setPrototypeOf(create(options), { stringCompilation: "deny" }),
			);
		}
		const options = policyPageOptions({ stringCompilation: "deny" });
		expect(() =>
			extensionPageRuntime(shared.core).createPageRuntime(options),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
		await Promise.resolve();
		expect(shared.realms[0].disposals).toBe(1);
		expect(shared.realms[0].evaluate).not.toHaveBeenCalled();
		expect(options.setup).not.toHaveBeenCalled();
		expect(options.onClosed).toHaveBeenCalledOnce();
	}
	expect(getter).not.toHaveBeenCalled();
});

it.each([undefined, "bounded-v1", "large-source-v1"] as const)(
	"requests larger regex compilation only for explicit large-source profile %s",
	(budgetProfile) => {
		const test = fixture(fakeCore(), 1000, {}, { budgetProfile });
		if (budgetProfile === "large-source-v1")
			expect(test.budgetOptions[0]).toMatchObject({
				maxSteps: 16_000_000,
				regexSourceLength: 8192,
				regexCompileAllocations: 32768,
			});
		else {
			expect(test.budgetOptions[0]).not.toHaveProperty("regexSourceLength");
			expect(test.budgetOptions[0]).not.toHaveProperty(
				"regexCompileAllocations",
			);
		}
	},
);

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

it.each(["allow", "deny"] as const)(
	"forwards and verifies the immutable guest string policy %s",
	async (stringCompilation) => {
		const configuration = { stringCompilation };
		const test = fixture(
			fakeCore({ value: stringCompilation }),
			1000,
			configuration,
		);
		configuration.stringCompilation =
			stringCompilation === "allow" ? "deny" : "allow";
		expect(test.state.options.stringCompilation).toBe(stringCompilation);
		expect(test.state.options).not.toHaveProperty("classicScripts");
		await expect(
			test.scripts.evaluate("trusted source"),
		).resolves.toMatchObject({ ok: true });
	},
);

it.each([null, true, false, 0, "", "DENY", "block", {}, []])(
	"rejects invalid guest string policy %j before realm creation",
	(stringCompilation) => {
		const shared = fakeCore();
		expect(() =>
			extensionPageRuntime(shared.core, {
				stringCompilation: stringCompilation as "deny",
			}),
		).toThrow("Invalid guest string compilation policy");
		expect(shared.createRealm).not.toHaveBeenCalled();
	},
);

it("rejects inherited or accessor guest string policies without invoking getters", () => {
	const getter = vi.fn(() => "deny");
	for (const configuration of [
		Object.create({ stringCompilation: "deny" }),
		Object.defineProperty({}, "stringCompilation", {
			get: getter,
			enumerable: true,
		}),
		Object.defineProperty({}, "stringCompilation", { value: "deny" }),
	])
		expect(() => extensionPageRuntime(fakeCore().core, configuration)).toThrow(
			"Invalid guest string compilation policy",
		);
	expect(getter).not.toHaveBeenCalled();
});

it.each([
	undefined,
	{ value: "allow" },
	{ value: "deny", writable: true },
	{ value: "deny", configurable: true },
])(
	"closes SDKs that cannot attest immutable denial before evaluating %#",
	async (policy) => {
		const shared = fakeCore(policy);
		const tree = new DocumentTree("https://example.com/");
		try {
			expect(
				() =>
					new PageScripts(
						{ document: tree, interactions: new DocumentInteractions(tree) },
						extensionPageRuntime(shared.core, { stringCompilation: "deny" }),
					),
			).toThrow("SafeJS guest string compilation policy is unavailable");
			await Promise.resolve();
			expect(shared.realms).toHaveLength(1);
			expect(shared.realms[0].disposals).toBe(1);
			expect(shared.realms[0].evaluate).not.toHaveBeenCalled();
			expect(shared.realms[0].signal.signal.aborted).toBe(true);
		} finally {
			tree.close();
		}
	},
);

it("refuses a getter-based SDK policy echo without executing it", async () => {
	const getter = vi.fn(() => "deny");
	const shared = fakeCore({ get: getter });
	const tree = new DocumentTree("https://example.com/");
	try {
		expect(
			() =>
				new PageScripts(
					{ document: tree, interactions: new DocumentInteractions(tree) },
					extensionPageRuntime(shared.core, { stringCompilation: "deny" }),
				),
		).toThrow("SafeJS guest string compilation policy is unavailable");
		await Promise.resolve();
		expect(getter).not.toHaveBeenCalled();
		expect(shared.realms[0].evaluate).not.toHaveBeenCalled();
		expect(shared.realms[0].disposals).toBe(1);
	} finally {
		tree.close();
	}
});

it("leaves default guest string policy to older SDKs", () => {
	const test = fixture();
	expect(test.state.options).not.toHaveProperty("stringCompilation");
});

it("declares owned console, retention, and focus await-result grants before lazy setup", async () => {
	const test = fixture();
	expect(test.defineExtension.mock.calls[0][0].manifest).toMatchObject({
		name: "agent-browser-page",
		globals: [pageEventBootstrapGlobal, ...pageBindingGlobalNames(test.tree)],
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
		pageEventBootstrapSource,
		"first",
		"second",
	]);
	expect(test.state.evaluate.mock.calls[0][1]).toEqual({
		filename: "agent-browser:page-bootstrap",
	});
	expect(test.state.evaluate.mock.calls[1][1]).toEqual({ filename: "app.js" });
	expect(test.state.globals?.console).toBe(
		(test.scripts.window as { console: object }).console,
	);
	expect(test.state.globals?.self).toBe(test.state.globals?.window);
	expect(test.state.globals?.document).toBe(test.scripts.dom.document);
	const retainedArgumentStarts = [4, 0, 2, 2];
	expect(test.state.context.retainGuestArguments).toHaveBeenCalledTimes(
		retainedArgumentStarts.length,
	);
	expect(
		vi
			.mocked(test.state.context.retainGuestArguments)
			.mock.calls.map(([, from]) => from),
	).toEqual(retainedArgumentStarts);
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
		pageEventBootstrapSource,
	]);
	expect(test.state.evaluate.mock.calls[0][1]).toEqual({
		filename: "agent-browser:page-bootstrap",
	});
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
