import { afterEach, expect, it, vi } from "vitest";
import {
	extensionPageRuntime,
	type ExtensionPageRuntimeOptions,
} from "./extension-page-runtime.js";
import type { PageNetworkModuleOptions } from "./page-network-modules.js";
import type { PageRuntimeOptions } from "./page-runtime.js";
import { scriptLimits } from "./safejs.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedRealm,
} from "./safejs-extension-types.js";
import type { ScriptFetchResult } from "./script-fetch.js";

type FetchWithPolicy = PageNetworkModuleOptions["fetchWithPolicy"];

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const documentUrl = "https://example.com/app/index.html";
const entry = {
	id: "https://example.com/app/entry.js",
	source: 'export { answer } from "./answer.js";',
};
const dependency = {
	id: "https://example.com/app/answer.js",
	source: "export const answer = 42;",
};

function response(
	source = dependency.source,
	url = dependency.id,
): Readonly<ScriptFetchResult> {
	const body = new TextEncoder().encode(source);
	return {
		type: "basic",
		response: {
			url,
			status: 200,
			headers: { "content-type": ["text/javascript; charset=utf-8"] },
			body,
			redirects: [],
			encodedBytes: body.byteLength,
			elapsedMs: 0,
		},
	};
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((fulfill) => {
		resolve = fulfill;
	});
	return { promise, resolve };
}

function graph() {
	return {
		documentUrl,
		entries: [{ ...entry }],
		fetchWithPolicy: vi.fn<FetchWithPolicy>(async () => response()),
	} satisfies PageNetworkModuleOptions;
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
			createHostObject() {
				throw new Error("Unexpected host object creation");
			},
			startCallback,
			releaseCallback() {},
			retainGuestArguments: (operation) => operation,
			releaseGuestReference() {},
			nestedOperation: (operation) => operation,
			async evaluateNested() {
				throw new Error("Unexpected nested evaluation");
			},
		};
		return {
			options,
			lifetime,
			startCallback,
			releaseCallback() {},
			evaluate: vi.fn<ReleasedRealm["evaluate"]>(async () => {
				if (!initialized) {
					initialized = true;
					const definition = options.extensions[0] as Parameters<
						ReleasedCore["defineExtension"]
					>[0];
					definition.setup(context);
				}
				return { ok: true, returnValue: { answer: 42 } };
			}),
			close: vi.fn(() => {
				closing ??= Promise.resolve().then(async () => {
					lifetime.abort();
					for (const cleanup of ownedCleanups.splice(0)) await cleanup();
				});
				return closing;
			}),
		};
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

function runtimeOptions(maxSourceCodeUnits?: number): PageRuntimeOptions {
	return {
		limits: scriptLimits(
			maxSourceCodeUnits === undefined ? {} : { maxSourceCodeUnits },
		),
		signal: new AbortController().signal,
		globals: [],
		onClosed: vi.fn(),
		setup: vi.fn(() => ({})),
		sink: { log() {}, error() {} },
	};
}

function fixture(
	configuration: ExtensionPageRuntimeOptions = {
		networkSourceModules: graph(),
	},
	options = runtimeOptions(),
) {
	const test = fakeCore();
	const factory = extensionPageRuntime(test.core, configuration);
	const runtime = factory.createPageRuntime(options);
	cleanups.push(() => runtime.close());
	return { ...test, factory, runtime, options, realm: test.realms[0] };
}

it("forwards asynchronous dependencies and exact module options to the fake core", async () => {
	const fetched = deferred<Readonly<ScriptFetchResult>>();
	const started = deferred<AbortSignal>();
	const configuration = graph();
	configuration.fetchWithPolicy = vi.fn<FetchWithPolicy>(
		(_url, _policy, signal) => {
			started.resolve(signal);
			return fetched.promise;
		},
	);
	const test = fixture({ networkSourceModules: configuration });
	expect(test.runtime.supportsSourceModules).toBe(true);
	expect(test.realm.evaluate).not.toHaveBeenCalled();
	await test.runtime.initialize();
	await test.runtime.initialize();
	const resolved = test.realm.options.sourceResolver?.(
		"./answer.js",
		entry.id,
		{},
	);
	expect(resolved).toBeInstanceOf(Promise);
	const signal = await started.promise;
	expect(signal.aborted).toBe(false);
	expect(configuration.fetchWithPolicy).toHaveBeenCalledOnce();
	expect(configuration.fetchWithPolicy).toHaveBeenCalledWith(
		dependency.id,
		{ mode: "cors", credentials: "same-origin" },
		signal,
	);
	fetched.resolve(response());
	await expect(resolved).resolves.toEqual(dependency);
	await expect(
		test.runtime.evaluate(entry.source, {
			signal: new AbortController().signal,
			filename: entry.id,
			sourceType: "module",
		}),
	).resolves.toMatchObject({ ok: true, returnValue: { answer: 42 } });
	expect(test.realm.evaluate.mock.calls).toEqual([
		["", {}],
		[entry.source, { filename: entry.id, sourceType: "module" }],
	]);
});

it("keeps redirected request identity and resolves children against the response base", async () => {
	const finalUrl = "https://example.com/releases/answer.js";
	const redirectedSource = 'export { answer } from "./value.js";';
	const child = {
		id: "https://example.com/releases/value.js",
		source: dependency.source,
	};
	const configuration = graph();
	configuration.fetchWithPolicy = vi.fn<FetchWithPolicy>(async (url) => {
		if (url === dependency.id) return response(redirectedSource, finalUrl);
		if (url === child.id) return response(child.source, child.id);
		throw new Error(`Unexpected module request: ${url}`);
	});
	const test = fixture({ networkSourceModules: configuration });
	await test.runtime.initialize();
	const resolve = test.realm.options.sourceResolver;
	const redirected = await resolve?.("./answer.js", entry.id, {});
	expect(redirected).toEqual({ id: dependency.id, source: redirectedSource });
	if (!redirected) throw new Error("Expected redirected module");
	await expect(resolve?.("./value.js", finalUrl, {})).resolves.toBeUndefined();
	await expect(resolve?.("./value.js", redirected.id, {})).resolves.toEqual(
		child,
	);
	await expect(resolve?.("./answer.js", entry.id, {})).resolves.toBe(
		redirected,
	);
	expect(configuration.fetchWithPolicy.mock.calls.map(([url]) => url)).toEqual([
		dependency.id,
		child.id,
	]);
});

it("keeps aliases and their shared response URL distinct at the fake-core resolver", async () => {
	const aliases = [dependency.id, "https://example.com/app/alias.js"];
	const finalUrl = "https://example.com/releases/shared.js";
	const configuration = graph();
	configuration.fetchWithPolicy = vi.fn<FetchWithPolicy>(async () =>
		response(dependency.source, finalUrl),
	);
	const test = fixture({ networkSourceModules: configuration });
	await test.runtime.initialize();
	const resolve = test.realm.options.sourceResolver;
	const resolved = await Promise.all(
		aliases.map((id) => resolve?.(id, entry.id, {})),
	);
	expect(resolved).toEqual(
		aliases.map((id) => ({ id, source: dependency.source })),
	);
	expect(resolved[0]).not.toBe(resolved[1]);
	for (const [index, id] of aliases.entries()) {
		await expect(resolve?.(id, entry.id, {})).resolves.toBe(resolved[index]);
	}
	expect(configuration.fetchWithPolicy).toHaveBeenCalledTimes(2);
	await expect(resolve?.(finalUrl, entry.id, {})).resolves.toEqual({
		id: finalUrl,
		source: dependency.source,
	});
	expect(configuration.fetchWithPolicy.mock.calls.map(([url]) => url)).toEqual([
		...aliases,
		finalUrl,
	]);
});

it.each([false, true])(
	"keeps classic evaluation unchanged with network configuration %s",
	async (configured) => {
		const configuration = graph();
		const test = fixture(
			configured ? { networkSourceModules: configuration } : {},
		);
		await test.runtime.initialize();
		await test.runtime.evaluate("42", {
			signal: new AbortController().signal,
			filename: "classic.js",
		});
		expect(test.realm.evaluate.mock.calls).toEqual([
			["", {}],
			["42", { filename: "classic.js" }],
		]);
		expect(configuration.fetchWithPolicy).not.toHaveBeenCalled();
		if (!configured) {
			expect(test.runtime.supportsSourceModules).toBe(false);
			expect(test.realm.options).not.toHaveProperty("sourceResolver");
		}
	},
);

it("rejects unconfigured modules before initialization", async () => {
	const test = fixture({});
	await expect(
		test.runtime.evaluate(entry.source, {
			signal: new AbortController().signal,
			filename: entry.id,
			sourceType: "module",
		}),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(test.realm.evaluate).not.toHaveBeenCalled();
});

it("preserves synchronous static resolution and opaque module identities", async () => {
	const staticEntry = {
		id: "app:entry",
		source: 'export { answer } from "answer";',
	};
	const staticDependency = { ...dependency, id: "app:answer" };
	const test = fixture({
		sourceModules: {
			sources: [staticEntry, staticDependency],
			imports: [
				{
					referrer: staticEntry.id,
					specifier: "answer",
					id: staticDependency.id,
				},
			],
		},
	});
	expect(
		test.realm.options.sourceResolver?.("answer", staticEntry.id, {}),
	).toEqual(staticDependency);
	expect(
		test.realm.options.sourceResolver?.("./answer.js", staticEntry.id, {}),
	).toBeUndefined();
	await test.runtime.initialize();
	await test.runtime.evaluate(staticEntry.source, {
		signal: new AbortController().signal,
		filename: staticEntry.id,
		sourceType: "module",
	});
	expect(test.realm.evaluate.mock.calls).toEqual([
		["", {}],
		[staticEntry.source, { filename: staticEntry.id, sourceType: "module" }],
	]);
});

it("rejects simultaneous static and network registries at factory creation", () => {
	const test = fakeCore();
	const networkSourceModules = graph();
	expect(() =>
		extensionPageRuntime(test.core, {
			sourceModules: { sources: [entry] },
			networkSourceModules,
		}),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(test.core.createRealm).not.toHaveBeenCalled();
	expect(networkSourceModules.fetchWithPolicy).not.toHaveBeenCalled();
});

it("snapshots network configuration before later runtime creation", async () => {
	const test = fakeCore();
	const entries = [{ ...entry }];
	const configuration = { ...graph(), entries };
	const fetchWithPolicy = configuration.fetchWithPolicy;
	const factory = extensionPageRuntime(test.core, {
		networkSourceModules: configuration,
	});
	entries[0].source = "changed";
	configuration.documentUrl = "https://other.example/";
	configuration.fetchWithPolicy = vi.fn<FetchWithPolicy>(async () => {
		throw new Error("Unexpected replacement fetch");
	});
	const runtime = factory.createPageRuntime(runtimeOptions());
	cleanups.push(() => runtime.close());
	await runtime.initialize();
	await expect(
		runtime.evaluate(entry.source, {
			signal: new AbortController().signal,
			filename: entry.id,
			sourceType: "module",
		}),
	).resolves.toMatchObject({ ok: true });
	await expect(
		test.realms[0].options.sourceResolver?.("./answer.js", entry.id, {}),
	).resolves.toEqual(dependency);
	expect(fetchWithPolicy).toHaveBeenCalledOnce();
	expect(configuration.fetchWithPolicy).not.toHaveBeenCalled();
});

it("snapshots an entry response base without changing its direct evaluation identity", async () => {
	const test = fakeCore();
	const baseUrl = "https://example.com/releases/entry.js";
	const entries = [{ ...entry, baseUrl }];
	const imported = {
		...dependency,
		id: "https://example.com/releases/answer.js",
	};
	const configuration = { ...graph(), entries };
	configuration.fetchWithPolicy = vi.fn<FetchWithPolicy>(async () =>
		response(imported.source, imported.id),
	);
	const factory = extensionPageRuntime(test.core, {
		networkSourceModules: configuration,
	});
	entries[0].id = "https://example.com/changed/entry.js";
	entries[0].source = "changed";
	entries[0].baseUrl = "https://example.com/changed/base.js";
	const runtime = factory.createPageRuntime(runtimeOptions());
	cleanups.push(() => runtime.close());
	await expect(
		runtime.evaluate(entry.source, {
			signal: new AbortController().signal,
			filename: baseUrl,
			sourceType: "module",
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(test.realms[0].evaluate).not.toHaveBeenCalled();
	await runtime.initialize();
	await expect(
		runtime.evaluate(entry.source, {
			signal: new AbortController().signal,
			filename: entry.id,
			sourceType: "module",
		}),
	).resolves.toMatchObject({ ok: true });
	expect(test.realms[0].evaluate.mock.calls).toEqual([
		["", {}],
		[entry.source, { filename: entry.id, sourceType: "module" }],
	]);
	await expect(
		test.realms[0].options.sourceResolver?.("./answer.js", entry.id, {}),
	).resolves.toEqual(imported);
	expect(configuration.fetchWithPolicy).toHaveBeenCalledOnce();
	expect(configuration.fetchWithPolicy).toHaveBeenCalledWith(
		imported.id,
		{ mode: "cors", credentials: "same-origin" },
		expect.any(AbortSignal),
	);
});

it.each([
	[entry.source, undefined],
	[entry.source, dependency.id],
	[`${entry.source}\n`, entry.id],
] as const)(
	"validates network entry source %s and filename %s before evaluation",
	async (source, filename) => {
		const test = fixture();
		await expect(
			test.runtime.evaluate(source, {
				signal: new AbortController().signal,
				filename,
				sourceType: "module",
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(test.realm.evaluate).not.toHaveBeenCalled();
		expect(test.runtime.closed).toBe(false);
	},
);

it.each(["runtime-close", "owner-abort", "realm-close", "page-abort"] as const)(
	"aborts in-flight dependencies and revokes retained resolvers on %s",
	async (reason) => {
		const fetched = deferred<Readonly<ScriptFetchResult>>();
		const started = deferred<AbortSignal>();
		const controller = new AbortController();
		const configuration = graph();
		configuration.fetchWithPolicy = vi.fn<FetchWithPolicy>(
			(_url, _policy, signal) => {
				started.resolve(signal);
				return fetched.promise;
			},
		);
		const test = fixture(
			{ networkSourceModules: configuration },
			{ ...runtimeOptions(), signal: controller.signal },
		);
		await test.runtime.initialize();
		const resolve = test.realm.options.sourceResolver;
		const pending = resolve?.("./answer.js", entry.id, {});
		const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
		const signal = await started.promise;
		if (reason === "runtime-close") await test.runtime.close();
		else if (reason === "owner-abort") test.realm.lifetime.abort();
		else if (reason === "realm-close") await test.realm.close();
		else controller.abort();
		expect(signal.aborted).toBe(true);
		fetched.resolve(response());
		await rejected;
		expect(test.runtime.closed).toBe(true);
		expect(() => resolve?.("./answer.js", entry.id, {})).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
		await test.runtime.close();
		expect(test.options.onClosed).toHaveBeenCalledOnce();
		expect(configuration.fetchWithPolicy).toHaveBeenCalledOnce();
	},
);

it("applies the page source limit to entries before creating a realm", () => {
	const test = fakeCore();
	const configuration = graph();
	const factory = extensionPageRuntime(test.core, {
		networkSourceModules: configuration,
	});
	expect(() =>
		factory.createPageRuntime(runtimeOptions(entry.source.length - 1)),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(test.core.createRealm).not.toHaveBeenCalled();
	expect(configuration.fetchWithPolicy).not.toHaveBeenCalled();
});

it("forwards the page source limit to fetched dependencies", async () => {
	const configuration = graph();
	configuration.fetchWithPolicy = vi.fn<FetchWithPolicy>(async () =>
		response(" ".repeat(entry.source.length + 1)),
	);
	const test = fixture(
		{ networkSourceModules: configuration },
		runtimeOptions(entry.source.length),
	);
	await test.runtime.initialize();
	await expect(
		test.realm.options.sourceResolver?.("./answer.js", entry.id, {}),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(configuration.fetchWithPolicy).toHaveBeenCalledOnce();
	expect(test.runtime.closed).toBe(false);
});
