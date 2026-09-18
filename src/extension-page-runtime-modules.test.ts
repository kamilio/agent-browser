import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { extensionPageRuntime } from "./extension-page-runtime.js";
import { DocumentInteractions } from "./interactions.js";
import { pageEventBootstrapSource } from "./page-event-bootstrap.js";
import {
	legacyPageRuntime,
	type PageRuntime,
	type PageRuntimeFactory,
	type PageScriptCore,
} from "./page-runtime.js";
import { PageScripts } from "./page-scripts.js";
import {
	type PageSourceModuleOptions,
	pageSourceModuleLimits,
} from "./page-source-modules.js";
import { scriptLimits } from "./safejs.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedHostDefinition,
	ReleasedRealm,
} from "./safejs-extension-types.js";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const entry = { id: "app:entry", source: 'export { answer } from "answer";' };
const dependency = { id: "app:answer", source: "export const answer = 42;" };
const graph = (): PageSourceModuleOptions => ({
	sources: [{ ...entry }, { ...dependency }],
	imports: [{ referrer: entry.id, specifier: "answer", id: dependency.id }],
});

function hostObject(definition: ReleasedHostDefinition) {
	const value = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(value, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(value, name, { value: method });
	return value;
}

class Budget {
	stepsUsed = 0;
	peakCallDepth = 0;
	peakDataSize = 0;
}

function fakeCore() {
	const realms: ReturnType<typeof makeRealm>[] = [];
	function makeRealm(options: Parameters<ReleasedCore["createRealm"]>[0]) {
		const lifetime = new AbortController();
		const ownedCleanups: (() => void | Promise<void>)[] = [];
		let initialized = false;
		let closing: Promise<void> | undefined;
		const startCallback = vi.fn(() => ({
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
				throw new Error("Unexpected nested evaluation");
			},
		};
		const state = {
			options,
			lifetime,
			result: { answer: 42 } as unknown,
			startCallback,
			releaseCallback() {},
			evaluate: vi.fn<ReleasedRealm["evaluate"]>(
				async (
					source,
					evaluation,
				): Promise<Awaited<ReturnType<ReleasedRealm["evaluate"]>>> => {
					if (!initialized) {
						initialized = true;
						const definition = options.extensions[0] as Parameters<
							ReleasedCore["defineExtension"]
						>[0];
						definition.setup(context);
					}
					if (source === pageEventBootstrapSource) {
						expect(evaluation).toEqual({
							filename: "agent-browser:page-bootstrap",
						});
						return { ok: true };
					}
					return source
						? { ok: true, returnValue: state.result }
						: { ok: true };
				},
			),
			close: vi.fn(() => {
				closing ??= Promise.resolve().then(async () => {
					lifetime.abort();
					for (const cleanup of ownedCleanups.splice(0)) await cleanup();
				});
				return closing;
			}),
		};
		return state;
	}
	const core: ReleasedCore = {
		Budget,
		defineExtension: (definition) => definition,
		createRealm: vi.fn((options) => {
			const realm = makeRealm(options);
			realms.push(realm);
			return realm;
		}),
	};
	return { core, realms };
}

function runtimeOptions(overrides: { maxSourceCodeUnits?: number } = {}) {
	return {
		limits: scriptLimits(overrides),
		signal: new AbortController().signal,
		globals: [],
		onClosed: vi.fn(),
		setup: vi.fn(() => ({})),
		sink: { log() {}, error() {} },
	};
}

function fixture(configured = true, options = graph()) {
	const test = fakeCore();
	const factory = extensionPageRuntime(
		test.core,
		configured ? { sourceModules: options } : {},
	);
	const tree = new DocumentTree("https://example.com/");
	cleanups.push(() => tree.close());
	const interactions = new DocumentInteractions(tree);
	const scripts = new PageScripts({ document: tree, interactions }, factory);
	cleanups.push(() => scripts.close());
	return { ...test, factory, tree, scripts, realm: test.realms[0] };
}

it("keeps default runtime selection classic and does not install a resolver", async () => {
	const test = fixture(false);
	expect(test.realm.options).not.toHaveProperty("sourceResolver");
	await test.scripts.evaluate("42", { filename: "classic.js" });
	expect(test.realm.evaluate.mock.calls).toEqual([
		[pageEventBootstrapSource, { filename: "agent-browser:page-bootstrap" }],
		["42", { filename: "classic.js" }],
	]);
});

it("rejects module requests on an unconfigured runtime before lazy setup", async () => {
	const test = fixture(false);
	await expect(
		test.scripts.evaluate(entry.source, {
			sourceType: "module",
			filename: entry.id,
		}),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(test.realm.evaluate).not.toHaveBeenCalled();
	expect(test.scripts.metrics()).toMatchObject({
		evaluations: 0,
		initialized: false,
	});
});

it("forwards explicit module mode and exact identity after classic initialization", async () => {
	const test = fixture();
	expect(test.realm.evaluate).not.toHaveBeenCalled();
	expect(
		await test.scripts.evaluate(entry.source, {
			sourceType: "module",
			filename: entry.id,
		}),
	).toMatchObject({ ok: true, value: { answer: 42 } });
	expect(test.realm.evaluate.mock.calls).toEqual([
		[pageEventBootstrapSource, { filename: "agent-browser:page-bootstrap" }],
		[entry.source, { filename: entry.id, sourceType: "module" }],
	]);
	expect(test.scripts.metrics()).toMatchObject({
		evaluations: 1,
		initialized: true,
	});
});

it("supplies only declared dependencies without normalizing opaque identities", async () => {
	const test = fixture();
	const resolve = test.realm.options.sourceResolver;
	expect(resolve).toBeTypeOf("function");
	expect(await resolve?.("answer", entry.id, {})).toEqual(dependency);
	expect(await resolve?.("./answer", entry.id, {})).toBeUndefined();
	expect(
		await resolve?.("https://example.com/answer", entry.id, {}),
	).toBeUndefined();
	expect(await resolve?.("answer", "other-referrer", {})).toBeUndefined();
});

it.each([
	[undefined, "invalid-input"],
	["", "invalid-input"],
	["other-entry", "invalid-input"],
	[dependency.id, "invalid-input"],
] as const)("rejects unmatched module identity %s", async (filename, code) => {
	const test = fixture();
	await expect(
		test.scripts.evaluate(entry.source, { sourceType: "module", filename }),
	).rejects.toMatchObject({ code });
	expect(test.realm.evaluate.mock.calls).toEqual(
		filename
			? [
					[
						pageEventBootstrapSource,
						{ filename: "agent-browser:page-bootstrap" },
					],
				]
			: [],
	);
});

it("does not admit changed source under a previously declared identity", async () => {
	const test = fixture();
	await expect(
		test.scripts.evaluate(`${entry.source}\n`, {
			sourceType: "module",
			filename: entry.id,
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(test.realm.evaluate.mock.calls).toEqual([
		[pageEventBootstrapSource, { filename: "agent-browser:page-bootstrap" }],
	]);
	expect(test.scripts.closed).toBe(false);
});

it.each(["script", "classic", "MODULE", "", null, false, 1])(
	"rejects invalid explicit source type %s",
	async (sourceType) => {
		const test = fixture();
		await expect(
			test.scripts.evaluate(entry.source, {
				sourceType: sourceType as "module",
				filename: entry.id,
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(test.realm.evaluate).not.toHaveBeenCalled();
	},
);

it("snapshots evaluation mode and identity before asynchronous initialization", async () => {
	const test = fixture();
	const options: { sourceType?: "module"; filename: string } = {
		sourceType: "module",
		filename: entry.id,
	};
	const pending = test.scripts.evaluate(entry.source, options);
	options.sourceType = undefined;
	options.filename = "changed";
	await pending;
	expect(test.realm.evaluate.mock.calls[1]).toEqual([
		entry.source,
		{ sourceType: "module", filename: entry.id },
	]);
});

it("snapshots caller-owned graphs before subsequent factory use", async () => {
	const options = {
		sources: [{ ...entry }, { ...dependency }],
		imports: [{ referrer: entry.id, specifier: "answer", id: dependency.id }],
	};
	const test = fixture(true, options);
	options.sources[0].source = "changed";
	options.sources[1].source = "changed dependency";
	options.imports[0].id = entry.id;
	const later = test.factory.createPageRuntime(runtimeOptions());
	cleanups.push(() => later.close());
	expect(
		await test.realms[1].options.sourceResolver?.("answer", entry.id, {}),
	).toEqual(dependency);
	await expect(
		later.evaluate(entry.source, {
			signal: new AbortController().signal,
			sourceType: "module",
			filename: entry.id,
		}),
	).resolves.toMatchObject({ ok: true });
});

it("enforces a page's smaller source limit before constructing the realm", () => {
	const test = fakeCore();
	const factory = extensionPageRuntime(test.core, { sourceModules: graph() });
	expect(() =>
		factory.createPageRuntime(runtimeOptions({ maxSourceCodeUnits: 1 })),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(test.core.createRealm).not.toHaveBeenCalled();
});

it("keeps resolver invocation budgets independent across page realms", async () => {
	const test = fixture();
	const later = test.factory.createPageRuntime(runtimeOptions());
	cleanups.push(() => later.close());
	for (let count = 0; count < pageSourceModuleLimits.resolutions; count++)
		expect(
			await test.realm.options.sourceResolver?.("denied", entry.id, {}),
		).toBeUndefined();
	expect(() =>
		test.realm.options.sourceResolver?.("denied", entry.id, {}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(
		await test.realms[1].options.sourceResolver?.("answer", entry.id, {}),
	).toEqual(dependency);
});

it.each(["close", "owner-abort", "evaluation-abort"] as const)(
	"revokes previously captured resolvers on %s",
	async (reason) => {
		const test = fakeCore();
		const runtime = extensionPageRuntime(test.core, {
			sourceModules: graph(),
		}).createPageRuntime(runtimeOptions());
		cleanups.push(() => runtime.close());
		await runtime.initialize();
		const resolve = test.realms[0].options.sourceResolver;
		if (reason === "close") await runtime.close();
		else if (reason === "owner-abort") test.realms[0].lifetime.abort();
		else {
			const controller = new AbortController();
			controller.abort();
			await expect(
				runtime.evaluate(entry.source, {
					signal: controller.signal,
					sourceType: "module",
					filename: entry.id,
				}),
			).rejects.toMatchObject({ code: "aborted" });
		}
		expect(() => resolve?.("answer", entry.id, {})).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
	},
);

it("checks the resolver's supplied cancellation independently of the owner", () => {
	const test = fixture();
	const controller = new AbortController();
	controller.abort();
	expect(() =>
		test.realm.options.sourceResolver?.("answer", entry.id, {
			signal: controller.signal,
		}),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	expect(test.scripts.closed).toBe(false);
});

it("preserves plain namespace exports without exposing callbacks as JSON", async () => {
	const test = fixture();
	const callback = vi.fn();
	test.realm.result = { answer: 42, callback };
	await expect(
		test.scripts.evaluate(entry.source, {
			sourceType: "module",
			filename: entry.id,
		}),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(callback).not.toHaveBeenCalled();
	await expect(
		test.scripts.evaluate(entry.source, {
			sourceType: "module",
			filename: entry.id,
			discardResult: true,
		}),
	).resolves.toMatchObject({ ok: true });
});

it("does not invoke namespace accessors during JSON result conversion", async () => {
	const test = fixture();
	const getter = vi.fn(() => 42);
	test.realm.result = Object.defineProperty({}, "answer", {
		enumerable: true,
		get: getter,
	});
	await expect(
		test.scripts.evaluate(entry.source, {
			sourceType: "module",
			filename: entry.id,
		}),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(getter).not.toHaveBeenCalled();
});

it("rejects old custom factories that ignore evaluation mode", async () => {
	const tree = new DocumentTree("https://example.com/");
	cleanups.push(() => tree.close());
	const runtime: PageRuntime = {
		budget: new Budget(),
		closed: false,
		initialize: vi.fn(async () => {}),
		evaluate: vi.fn<PageRuntime["evaluate"]>(async () => ({ ok: true })),
		copyResult: (value) => value,
		startCallback: () => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(),
		}),
		errorDetails: () => ({ code: "script-error" }),
		close: vi.fn(async () => {}),
	};
	const factory: PageRuntimeFactory = { createPageRuntime: () => runtime };
	const scripts = new PageScripts(
		{ document: tree, interactions: new DocumentInteractions(tree) },
		factory,
	);
	cleanups.push(() => scripts.close());
	await expect(
		scripts.evaluate(entry.source, {
			sourceType: "module",
			filename: entry.id,
		}),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(runtime.initialize).not.toHaveBeenCalled();
	expect(runtime.evaluate).not.toHaveBeenCalled();
});

it("rejects module evaluation at the legacy adapter boundary too", async () => {
	const evaluate = vi.fn(async () => ({ returnValue: 42 }));
	const core: PageScriptCore = {
		Budget,
		SandboxError: class extends Error {
			code = "script-error";
		},
		createRealm: () => ({ closed: false, evaluate, close: async () => {} }),
		createHostObject: hostObject,
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: () => true,
		deepCopyFromSandbox: (value) => value,
		startCallback: () => ({
			synchronous: Promise.resolve(),
			result: Promise.resolve(),
		}),
	};
	const runtime = legacyPageRuntime(core).createPageRuntime(runtimeOptions());
	cleanups.push(() => runtime.close());
	await expect(
		runtime.evaluate(entry.source, {
			signal: new AbortController().signal,
			sourceType: "module",
			filename: entry.id,
		}),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(evaluate).not.toHaveBeenCalled();
});
