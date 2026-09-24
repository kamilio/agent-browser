import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentScriptCsp } from "./document-script-csp.js";
import { documentScriptState } from "./document-script-state.js";
import { writeDocument } from "./document-write.js";
import { DocumentTree } from "./document.js";
import {
	type ExtensionPageRuntimeOptions,
	extensionPageRuntime,
} from "./extension-page-runtime.js";
import type { HtmlModuleRequest } from "./html-module.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkResponse } from "./network.js";
import { pageDomConstructorBootstrapSource } from "./page-dom-constructor-bootstrap.js";
import { pageEventBootstrapSource } from "./page-event-bootstrap.js";
import type { PageNetworkModuleOptions } from "./page-network-modules.js";
import {
	type PageRuntimeFactory,
	type PageRuntimeOptions,
	type PageScriptCore,
	legacyPageRuntime,
} from "./page-runtime.js";
import { type PageScriptOptions, PageScripts } from "./page-scripts.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedHostDefinition,
	ReleasedRealm,
} from "./safejs-extension-types.js";
import { scriptLimits } from "./safejs.js";
import type { ScriptFetchResult } from "./script-fetch.js";
import { ScriptLoader } from "./script-loader.js";

const documentUrl = "https://example.com/app/index.html";
const inlineId = "urn:agent-browser:html-module:7";
const inlineSource = 'export const marker = "inline-contract";';
const externalId = "https://example.com/app/entry.js";
const externalSource = 'export const marker = "external-contract";';
const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

class Budget {
	stepsUsed = 0;
	peakCallDepth = 0;
	peakDataSize = 0;
}

function hostObject(definition: ReleasedHostDefinition) {
	const value = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(value, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(value, name, { value: method });
	return value;
}

type RealmOptions = Parameters<ReleasedCore["createRealm"]>[0];
type EvaluationOptions = Parameters<ReleasedRealm["evaluate"]>[1];

function fakeCore(
	onEvaluate?: (
		source: string,
		evaluation: EvaluationOptions,
		options: RealmOptions,
	) => void | Promise<void>,
) {
	const realms: ReturnType<typeof makeRealm>[] = [];
	const setup = vi.fn();
	function makeRealm(options: RealmOptions) {
		const lifetime = new AbortController();
		const ownedCleanups: (() => void | Promise<void>)[] = [];
		let initialized = false;
		let closing: Promise<void> | undefined;
		const context: ReleasedContext = {
			signal: lifetime.signal,
			onCleanup: (cleanup) => ownedCleanups.push(cleanup),
			createHostObject: hostObject,
			startCallback: vi.fn(() => ({
				synchronous: Promise.resolve(),
				result: Promise.resolve(undefined),
			})),
			releaseCallback() {},
			retainGuestArguments: (operation) => operation,
			releaseGuestReference() {},
			nestedOperation: (operation) => operation,
			async evaluateNested() {
				throw new Error("Unexpected nested evaluation in fake SDK contract");
			},
		};
		return {
			options,
			lifetime,
			startCallback: context.startCallback,
			releaseCallback() {},
			evaluate: vi.fn<ReleasedRealm["evaluate"]>(async (source, evaluation) => {
				if (!initialized) {
					initialized = true;
					const definition = options.extensions[0] as Parameters<
						ReleasedCore["defineExtension"]
					>[0];
					const extensionExports = definition.setup(context);
					setup(extensionExports);
					if (options.classicScripts) {
						// Emulate only the Window bootstrap contract; no guest code runs.
						const bridge = extensionExports.globals.__agentBrowserWindowGlobal as {
							bind(reference: unknown): void;
						};
						bridge.bind({});
					}
				}
				if (
					source ===
					pageEventBootstrapSource + pageDomConstructorBootstrapSource
				) {
					expect(evaluation).toEqual({
						filename: "agent-browser:page-bootstrap",
					});
					return { ok: true };
				}
				await onEvaluate?.(source, evaluation, options);
				return { ok: true, returnValue: { contract: "fake-sdk" } };
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
		defineExtension: vi.fn((definition) => definition),
		createRealm: vi.fn((options) => {
			const realm = makeRealm(options);
			Object.defineProperty(realm, "sourceImportTimeoutMs", {
				value: options.sourceImportTimeoutMs,
			});
			Object.defineProperty(realm, "stringCompilation", {
				value: options.stringCompilation ?? "allow",
			});
			realms.push(realm);
			return realm;
		}),
	};
	return { core, realms, setup };
}

function response(
	source: string,
	url = externalId,
	contentType = "text/javascript; charset=utf-8",
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": [contentType] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
	};
}

function fetched(source = externalSource, url = externalId): ScriptFetchResult {
	return { type: "basic", response: response(source, url) };
}

function configuration(url = documentUrl) {
	return {
		documentUrl: url,
		entries: [],
		htmlEntries: true,
		fetchWithPolicy: vi.fn<PageNetworkModuleOptions["fetchWithPolicy"]>(
			async () => fetched(),
		),
	} satisfies PageNetworkModuleOptions;
}

function request(
	overrides: Partial<HtmlModuleRequest> = {},
): HtmlModuleRequest {
	return {
		id: inlineId,
		source: inlineSource,
		baseUrl: documentUrl,
		credentials: "same-origin",
		signal: new AbortController().signal,
		...overrides,
	};
}

function page(
	factory: PageRuntimeFactory,
	modules?: PageNetworkModuleOptions,
	options: Pick<PageScriptOptions, "budgetProfile" | "limits"> = {},
) {
	const tree = new DocumentTree(modules?.documentUrl ?? documentUrl);
	cleanups.push(() => tree.close());
	const scripts = new PageScripts(
		{ document: tree, interactions: documentInteractions(tree) },
		factory,
		{
			...options,
			...(modules === undefined ? {} : { networkSourceModules: modules }),
		},
	);
	cleanups.push(() => scripts.close());
	return { tree, scripts };
}

function fixture(modules = configuration()) {
	const test = fakeCore();
	const factory = extensionPageRuntime(test.core);
	return {
		...test,
		...page(factory, modules),
		factory,
		modules,
		realm: test.realms[0],
	};
}

function runtimeOptions(
	networkSourceModules?: PageNetworkModuleOptions,
): PageRuntimeOptions {
	return {
		networkSourceModules,
		limits: scriptLimits(),
		signal: new AbortController().signal,
		globals: [],
		onClosed: vi.fn(),
		setup: vi.fn(() => ({})),
		sink: { log() {}, error() {} },
	};
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((fulfill) => {
		resolve = fulfill;
	});
	return { promise, resolve };
}

it.each([inlineSource, ""])(
	"prepares inline source %j without setup and forwards exact module options",
	async (source) => {
		const test = fixture();
		expect(test.scripts.supportsHtmlModules).toBe(true);
		const prepared = await test.scripts.prepareModule(request({ source }));
		expect(prepared).toEqual({ id: inlineId, source });
		expect(test.realm.evaluate).not.toHaveBeenCalled();
		expect(test.setup).not.toHaveBeenCalled();
		await expect(
			test.scripts.evaluate(prepared.source, {
				sourceType: "module",
				filename: prepared.id,
			}),
		).resolves.toMatchObject({ ok: true, value: { contract: "fake-sdk" } });
		expect(test.realm.evaluate.mock.calls).toEqual([
			[
				pageEventBootstrapSource + pageDomConstructorBootstrapSource,
				{ filename: "agent-browser:page-bootstrap" },
			],
			[source, { sourceType: "module", filename: inlineId }],
		]);
		expect(test.modules.fetchWithPolicy).not.toHaveBeenCalled();
	},
);

it("keeps the default page budget from admitting an HTML module over 1 MiB", async () => {
	const test = fixture();
	test.modules.fetchWithPolicy.mockResolvedValue(
		fetched(externalSource.padEnd(1_196_388, " ")),
	);
	await expect(
		test.scripts
			.prepareModule(request({ id: externalId, source: undefined }))
			.then(() => undefined),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.modules.fetchWithPolicy).toHaveBeenCalledOnce();
	expect(test.setup).not.toHaveBeenCalled();
	expect(test.realm.evaluate).not.toHaveBeenCalled();
});

it.each([
	"large-source-v1",
	"application-v1",
	"application-unicode-v1",
] as const)(
	"admits an HTML module over 1 MiB with %s for runtime and factory registries",
	async (budgetProfile) => {
		const source = externalSource.padEnd(1_196_388, " ");
		for (const configuredAtFactory of [false, true]) {
			const test = fakeCore();
			const modules = configuration();
			modules.fetchWithPolicy.mockResolvedValue(fetched(source));
			const factory = extensionPageRuntime(
				test.core,
				configuredAtFactory ? { networkSourceModules: modules } : {},
			);
			const owner = page(factory, configuredAtFactory ? undefined : modules, {
				budgetProfile,
			});
			const prepared = await owner.scripts.prepareModule(
				request({ id: externalId, source: undefined }),
			);
			expect(prepared.id).toBe(externalId);
			expect(prepared.source.length).toBe(source.length);
			expect(prepared.source === source).toBe(true);
			expect(modules.fetchWithPolicy).toHaveBeenCalledOnce();
			expect(test.setup).not.toHaveBeenCalled();
			expect(test.realms[0].evaluate).not.toHaveBeenCalled();
		}
	},
);

it.each(["maxSourceCodeUnits", "maxDataSize"] as const)(
	"enforces smaller explicit page %s for inline and external HTML modules",
	async (limit) => {
		const source = externalSource.padEnd(262_144, " ");
		for (const inline of [false, true]) {
			const test = fakeCore();
			const modules = configuration();
			modules.fetchWithPolicy.mockResolvedValue(fetched(source));
			const owner = page(extensionPageRuntime(test.core), modules, {
				budgetProfile: "application-unicode-v1",
				limits: { [limit]: source.length - 1 },
			});
			await expect(
				owner.scripts
					.prepareModule(
						request({
							id: inline ? inlineId : externalId,
							source: inline ? source : undefined,
						}),
					)
					.then(() => undefined),
			).rejects.toMatchObject({ code: "resource-limit" });
			expect(modules.fetchWithPolicy).toHaveBeenCalledTimes(inline ? 0 : 1);
			expect(test.setup).not.toHaveBeenCalled();
			expect(test.realms[0].evaluate).not.toHaveBeenCalled();
		}
	},
);

it.each([131_072, 600_000])(
	"accounts for inline roots and cached dependencies in the page aggregate with %i-unit modules",
	async (moduleSize) => {
		const test = fakeCore();
		const modules = configuration();
		const source = externalSource.padEnd(moduleSize, " ");
		modules.fetchWithPolicy.mockImplementation(async (url) =>
			fetched(source, url),
		);
		const owner = page(extensionPageRuntime(test.core), modules, {
			budgetProfile: "application-unicode-v1",
			limits: { maxDataSize: inlineSource.length + source.length * 2 },
		});
		await owner.scripts.prepareModule(request());
		const resolve = test.realms[0].options.sourceResolver;
		if (!resolve) throw new Error("Missing fake SDK source resolver");
		const first = await resolve("./first.js", inlineId, {});
		expect(first?.source.length).toBe(source.length);
		expect((await resolve("./first.js", inlineId, {})) === first).toBe(true);
		const second = await resolve("./second.js", first?.id, {});
		expect(second?.source.length).toBe(source.length);
		await expect(
			Promise.resolve(resolve("./overflow.js", second?.id, {})).then(
				() => undefined,
			),
		).rejects.toMatchObject({ code: "resource-limit" });
		await expect(
			owner.scripts
				.prepareModule(request({ id: `${inlineId}1`, source: " " }))
				.then(() => undefined),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(modules.fetchWithPolicy).toHaveBeenCalledTimes(3);
		expect(test.setup).not.toHaveBeenCalled();
		expect(test.realms[0].evaluate).not.toHaveBeenCalled();
	},
);

it("isolates expanded budgets, module caches and aggregate accounting across factory runtimes", async () => {
	const test = fakeCore();
	const modules = configuration();
	const source = externalSource.padEnd(1_196_388, " ");
	modules.fetchWithPolicy.mockResolvedValue(fetched(source));
	const factory = extensionPageRuntime(test.core, {
		networkSourceModules: modules,
	});
	const options = {
		budgetProfile: "application-unicode-v1" as const,
		limits: { maxDataSize: source.length },
	};
	const expanded = page(factory, undefined, options);
	const bounded = page(factory);
	const independent = page(factory, undefined, options);
	const input = request({ id: externalId, source: undefined });
	const prepared = await expanded.scripts.prepareModule(input);
	expect(prepared.source.length).toBe(source.length);
	await expect(
		bounded.scripts.prepareModule(input).then(() => undefined),
	).rejects.toMatchObject({
		code: "resource-limit",
	});
	const separatelyPrepared = await independent.scripts.prepareModule(input);
	expect(separatelyPrepared.source.length).toBe(source.length);
	await expect(
		expanded.scripts
			.prepareModule(request({ source: " " }))
			.then(() => undefined),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(modules.fetchWithPolicy).toHaveBeenCalledTimes(3);
	expect(test.setup).not.toHaveBeenCalled();
	for (const realm of test.realms)
		expect(realm.evaluate).not.toHaveBeenCalled();
});

it.each(["unregistered", "changed-source", "changed-identity"])(
	"rejects %s module evaluation before forwarding source to the fake SDK",
	async (reason) => {
		const test = fixture();
		if (reason !== "unregistered") await test.scripts.prepareModule(request());
		await expect(
			test.scripts.evaluate(
				reason === "changed-source" ? `${inlineSource}\n` : inlineSource,
				{
					sourceType: "module",
					filename:
						reason === "changed-identity"
							? "urn:agent-browser:html-module:8"
							: inlineId,
				},
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(test.realm.evaluate.mock.calls).toEqual([
			[
				pageEventBootstrapSource + pageDomConstructorBootstrapSource,
				{ filename: "agent-browser:page-bootstrap" },
			],
		]);
	},
);

it("keeps HTML admission opt-in for default and configured static entries", async () => {
	for (const modules of [
		undefined,
		{
			...configuration(),
			htmlEntries: false,
			entries: [{ id: externalId, source: externalSource }],
		},
	]) {
		const test = fakeCore();
		const owner = page(extensionPageRuntime(test.core), modules);
		expect(owner.scripts.supportsHtmlModules).toBe(false);
		await expect(owner.scripts.prepareModule(request())).rejects.toMatchObject({
			code: "unsupported",
		});
		expect(test.setup).not.toHaveBeenCalled();
		expect(test.realms[0].evaluate).not.toHaveBeenCalled();
	}
});

it("does not claim HTML modules on the legacy adapter or accept its configuration", async () => {
	const createRealm = vi.fn(() => ({
		closed: false,
		evaluate: vi.fn(async () => ({ returnValue: undefined })),
		close: vi.fn(async () => {}),
	}));
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
			result: Promise.resolve(),
		}),
	};
	const factory = legacyPageRuntime(core);
	const owner = page(factory);
	expect(owner.scripts.supportsHtmlModules).toBe(false);
	await expect(owner.scripts.prepareModule(request())).rejects.toMatchObject({
		code: "unsupported",
	});
	const options = runtimeOptions(configuration());
	expect(() => factory.createPageRuntime(options)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(options.setup).not.toHaveBeenCalled();
	expect(createRealm).toHaveBeenCalledOnce();
});

it.each(["static", "network"] as const)(
	"rejects factory %s modules combined with per-runtime network configuration",
	(kind) => {
		const test = fakeCore();
		const factoryModules: ExtensionPageRuntimeOptions =
			kind === "static"
				? {
						sourceModules: {
							sources: [{ id: externalId, source: externalSource }],
						},
					}
				: {
						networkSourceModules: {
							...configuration(),
							entries: [{ id: externalId, source: externalSource }],
						},
					};
		const factory = extensionPageRuntime(test.core, factoryModules);
		const options = runtimeOptions(configuration());
		expect(() => factory.createPageRuntime(options)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(test.core.createRealm).not.toHaveBeenCalled();
		expect(test.core.defineExtension).not.toHaveBeenCalled();
		expect(options.setup).not.toHaveBeenCalled();
	},
);

it.each(["foreign-document", "accessor-document"])(
	"rejects %s module options before calling the host factory",
	(kind) => {
		const tree = new DocumentTree(documentUrl);
		cleanups.push(() => tree.close());
		const modules = configuration("https://other.example/app/index.html");
		const getter = vi.fn(() => documentUrl);
		if (kind === "accessor-document")
			Object.defineProperty(modules, "documentUrl", { get: getter });
		const test = fakeCore();
		const factory = extensionPageRuntime(test.core);
		const create = vi.spyOn(factory, "createPageRuntime");
		const context = {
			document: tree,
			interactions: documentInteractions(tree),
		};
		expect(
			() =>
				new PageScripts(context, factory, { networkSourceModules: modules }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(getter).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
		expect(test.setup).not.toHaveBeenCalled();
		const scripts = new PageScripts(context, factory, {
			networkSourceModules: configuration(),
		});
		cleanups.push(() => scripts.close());
		expect(scripts.supportsHtmlModules).toBe(true);
	},
);

it.each(["options", "configuration"])(
	"rejects Proxy prototypes in %s without invoking traps",
	(target) => {
		const tree = new DocumentTree(documentUrl);
		cleanups.push(() => tree.close());
		const test = fakeCore();
		const factory = extensionPageRuntime(test.core);
		const create = vi.spyOn(factory, "createPageRuntime");
		const trap = vi.fn(() => false);
		const prototype = new Proxy({}, { has: trap });
		const modules = configuration();
		const options =
			target === "options"
				? Object.setPrototypeOf({}, prototype)
				: { networkSourceModules: Object.setPrototypeOf(modules, prototype) };
		expect(
			() =>
				new PageScripts(
					{ document: tree, interactions: documentInteractions(tree) },
					factory,
					options,
				),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(trap).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
		expect(test.setup).not.toHaveBeenCalled();
	},
);

it("isolates prepared entries, import bases and transport between document runtimes", async () => {
	const test = fixture();
	const otherModules = configuration("https://other.example/other/index.html");
	const other = page(test.factory, otherModules);
	const otherSource = 'export const marker = "other-document-contract";';
	await test.scripts.prepareModule(request());
	const otherResolver = test.realms[1].options.sourceResolver;
	await expect(
		otherResolver?.("./child.js", inlineId, {}),
	).resolves.toBeUndefined();
	expect(otherModules.fetchWithPolicy).not.toHaveBeenCalled();
	await expect(
		other.scripts.prepareModule(
			request({
				source: otherSource,
				baseUrl: otherModules.documentUrl,
			}),
		),
	).resolves.toEqual({ id: inlineId, source: otherSource });
	otherModules.fetchWithPolicy.mockResolvedValue(
		fetched(otherSource, "https://other.example/other/child.js"),
	);
	await expect(otherResolver?.("./child.js", inlineId, {})).resolves.toEqual({
		id: "https://other.example/other/child.js",
		source: otherSource,
	});
	expect(test.modules.fetchWithPolicy).not.toHaveBeenCalled();
	await test.scripts.close();
	expect(other.scripts.supportsHtmlModules).toBe(true);
	await expect(
		other.scripts.evaluate(otherSource, {
			sourceType: "module",
			filename: inlineId,
		}),
	).resolves.toMatchObject({ ok: true });
});

it("forwards inline import bases, credentials and resolver cancellation", async () => {
	const test = fixture();
	const dependencyId = "https://example.com/assets/child.js";
	test.modules.fetchWithPolicy.mockResolvedValue(
		fetched(externalSource, dependencyId),
	);
	await test.scripts.prepareModule(
		request({
			baseUrl: "https://example.com/assets/",
			credentials: "include",
		}),
	);
	const resolve = test.realm.options.sourceResolver;
	const canceled = new AbortController();
	canceled.abort();
	await expect(
		resolve?.("./child.js", inlineId, {
			signal: canceled.signal,
		}),
	).rejects.toMatchObject({ code: "aborted" });
	expect(test.modules.fetchWithPolicy).not.toHaveBeenCalled();
	const dependency = await resolve?.("./child.js", inlineId, {});
	expect(dependency).toEqual({ id: dependencyId, source: externalSource });
	expect(test.modules.fetchWithPolicy).toHaveBeenCalledWith(
		dependencyId,
		{ mode: "cors", credentials: "include" },
		expect.any(AbortSignal),
	);
	await expect(
		test.scripts.prepareModule(
			request({
				id: dependencyId,
				source: undefined,
				credentials: "include",
			}),
		),
	).resolves.toBe(dependency);
	expect(test.modules.fetchWithPolicy).toHaveBeenCalledOnce();
});

it("keeps the external request identity while resolving children against its response URL", async () => {
	const test = fixture();
	const finalUrl = "https://example.com/releases/entry.js";
	const childId = "https://example.com/releases/child.js";
	test.modules.fetchWithPolicy
		.mockResolvedValueOnce(fetched(externalSource, finalUrl))
		.mockResolvedValueOnce(fetched(inlineSource, childId));
	const prepared = await test.scripts.prepareModule(
		request({
			id: externalId,
			source: undefined,
			baseUrl: "https://example.com/ignored-inline-base/",
		}),
	);
	expect(prepared).toEqual({ id: externalId, source: externalSource });
	const resolve = test.realm.options.sourceResolver;
	await expect(resolve?.("./child.js", finalUrl, {})).resolves.toBeUndefined();
	await expect(resolve?.("./child.js", prepared.id, {})).resolves.toEqual({
		id: childId,
		source: inlineSource,
	});
	await test.scripts.evaluate(prepared.source, {
		sourceType: "module",
		filename: prepared.id,
	});
	expect(test.realm.evaluate).toHaveBeenLastCalledWith(externalSource, {
		sourceType: "module",
		filename: externalId,
	});
	expect(test.modules.fetchWithPolicy.mock.calls.map(([url]) => url)).toEqual([
		externalId,
		childId,
	]);
});

it.each([
	"request-abort",
	"scripts-close",
	"document-close",
	"realm-close",
] as const)(
	"settles pending HTML preparation on %s without evaluating source",
	async (reason) => {
		const test = fixture();
		const started = deferred<AbortSignal>();
		const transport = deferred<Readonly<ScriptFetchResult>>();
		test.modules.fetchWithPolicy.mockImplementation((_url, _policy, signal) => {
			started.resolve(signal);
			return transport.promise;
		});
		if (reason === "realm-close")
			await test.scripts.evaluate("classic-contract");
		test.realm.evaluate.mockClear();
		const controller = new AbortController();
		const pending = test.scripts.prepareModule(
			request({
				id: externalId,
				source: undefined,
				signal: controller.signal,
			}),
		);
		const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
		const signal = await started.promise;
		if (reason === "request-abort") controller.abort();
		else if (reason === "scripts-close") await test.scripts.close();
		else if (reason === "document-close") test.tree.close();
		else await test.realm.close();
		await rejected;
		if (reason === "request-abort") {
			expect(test.scripts.closed).toBe(false);
			await expect(test.scripts.prepareModule(request())).resolves.toEqual({
				id: inlineId,
				source: inlineSource,
			});
		} else {
			expect(signal.aborted).toBe(true);
			expect(test.scripts.supportsHtmlModules).toBe(false);
			await expect(test.scripts.prepareModule(request())).rejects.toMatchObject(
				{
					code: "closed",
				},
			);
			expect(() =>
				test.realm.options.sourceResolver?.("./child.js", externalId, {}),
			).toThrow(expect.objectContaining({ code: "closed" }));
		}
		transport.resolve(fetched());
		expect(test.modules.fetchWithPolicy).toHaveBeenCalledOnce();
		expect(test.realm.evaluate).not.toHaveBeenCalled();
	},
);

it("rejects already canceled preparation without setup or transport", async () => {
	const test = fixture();
	const controller = new AbortController();
	controller.abort();
	await expect(
		test.scripts.prepareModule(
			request({
				id: externalId,
				source: undefined,
				signal: controller.signal,
			}),
		),
	).rejects.toMatchObject({ code: "aborted" });
	expect(test.modules.fetchWithPolicy).not.toHaveBeenCalled();
	expect(test.setup).not.toHaveBeenCalled();
});

it("revokes captured runtime preparation when its owner aborts before setup", async () => {
	const test = fakeCore();
	const modules = configuration();
	const controller = new AbortController();
	const options = { ...runtimeOptions(modules), signal: controller.signal };
	const runtime = extensionPageRuntime(test.core).createPageRuntime(options);
	cleanups.push(() => runtime.close());
	const prepare = runtime.prepareModule;
	if (!prepare) throw new Error("Missing HTML preparation capability");
	const started = deferred<AbortSignal>();
	const transport = deferred<Readonly<ScriptFetchResult>>();
	modules.fetchWithPolicy.mockImplementation((_url, _policy, signal) => {
		started.resolve(signal);
		return transport.promise;
	});
	const pending = prepare(request({ id: externalId, source: undefined }));
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	const signal = await started.promise;
	controller.abort();
	await rejected;
	expect(signal.aborted).toBe(true);
	await expect(prepare(request())).rejects.toMatchObject({ code: "closed" });
	transport.resolve(fetched());
	await runtime.close();
	expect(options.onClosed).toHaveBeenCalledOnce();
	expect(options.setup).not.toHaveBeenCalled();
	expect(test.realms[0].evaluate).not.toHaveBeenCalled();
	expect(modules.fetchWithPolicy).toHaveBeenCalledOnce();
});

it("rejects accessor-backed HTML source without invoking it or setting up the realm", async () => {
	const test = fixture();
	const getter = vi.fn(() => inlineSource);
	const input = Object.defineProperty(request(), "source", { get: getter });
	await expect(test.scripts.prepareModule(input)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(getter).not.toHaveBeenCalled();
	expect(test.modules.fetchWithPolicy).not.toHaveBeenCalled();
	expect(test.setup).not.toHaveBeenCalled();
});

it.each([false, true])(
	"routes synthetic HTML modules through the loader and PageScripts with CSP=%s using fake SDK operations only",
	async (csp) => {
		let owner: DocumentTree | undefined;
		const dependencyId = "https://example.com/assets/child.js";
		const dependencySource = 'export const marker = "dependency-contract";';
		const test = fakeCore(async (source, evaluation, options) => {
			if (evaluation?.sourceType !== "module") return;
			const tree = owner;
			if (!tree) throw new Error("Missing synthetic document owner");
			expect(documentScriptState(tree)).toMatchObject({
				currentScript: null,
				readyState: "interactive",
			});
			expect(tree.textContent(tree.root)).toContain("after modules");
			expect(() => writeDocument(tree, "forbidden insertion")).toThrow();
			if (source === inlineSource) {
				if (!evaluation.filename)
					throw new Error("Missing inline module identity");
				await expect(
					options.sourceResolver?.("./child.js", evaluation.filename, {}),
				).resolves.toEqual({ id: dependencyId, source: dependencySource });
			}
		});
		const factory = extensionPageRuntime(test.core);
		const modules = configuration();
		modules.fetchWithPolicy.mockImplementation(
			async (url, _policy, _signal, admission) => {
				if (csp) {
					if (!owner || !admission)
						throw new Error("Missing module CSP owner or admission");
					expect(
						documentScriptCsp(owner)?.allowsRequest(admission, url, 0),
					).toBe(true);
				} else expect(admission).toBeUndefined();
				if (url === externalId) return fetched(externalSource, url);
				if (url === dependencyId) return fetched(dependencySource, url);
				throw new Error(`Unexpected in-memory module URL: ${url}`);
			},
		);
		const controller = new AbortController();
		cleanups.push(() => controller.abort());
		const input = response(
			`<base href="/assets/"><script nomodule>legacy-contract</script><script type="module" nonce="native">${inlineSource}</script><script type="module" nonce="native" src="/app/entry.js"></script><p>after modules</p>`,
			documentUrl,
			"text/html; charset=utf-8",
		);
		if (csp)
			input.headers = {
				...input.headers,
				"content-security-policy": ["script-src 'nonce-native'"],
			};
		const classicFetch = vi.fn(async (): Promise<NetworkResponse> => {
			throw new Error("Unexpected classic fetch in module-only fixture");
		});
		const loader = new ScriptLoader({
			response: input,
			signal: controller.signal,
			fetch: classicFetch,
			fetchWithPolicy: modules.fetchWithPolicy,
			limits: { modules: true },
			owner: (tree) => {
				owner = tree;
				cleanups.push(() => tree.close());
				const scripts = new PageScripts(
					{ document: tree, interactions: documentInteractions(tree) },
					factory,
					{ networkSourceModules: modules },
				);
				cleanups.push(() => scripts.close());
				return scripts;
			},
		});
		const tree = await loadBrowserDocument(input, {
			scripts: loader,
			signal: controller.signal,
			tabId: "html-module-runtime-contract",
			limits: {
				maxNodes: 1000,
				maxDepth: 64,
				maxTextCodeUnits: 100_000,
				maxChanges: 100,
			},
		});
		const inline = [...tree.walk()].find(
			({ node }) =>
				node.tagName === "script" &&
				node.attributes.type === "module" &&
				!node.attributes.src,
		);
		if (!inline) throw new Error("Missing inline script node");
		expect(test.realms[0].evaluate.mock.calls).toEqual([
			[
				pageEventBootstrapSource + pageDomConstructorBootstrapSource,
				{ filename: "agent-browser:page-bootstrap" },
			],
			[
				inlineSource,
				{
					sourceType: "module",
					filename: `urn:agent-browser:html-module:${inline.node.id}`,
				},
			],
			[externalSource, { sourceType: "module", filename: externalId }],
		]);
		expect(documentScriptState(tree)?.report).toMatchObject({
			mode: "classic-and-module",
			discovered: 3,
			executed: 2,
			skipped: 1,
			failed: 0,
			complete: true,
		});
		expect(
			modules.fetchWithPolicy.mock.calls.map(([url]) => url).sort(),
		).toEqual([externalId, dependencyId].sort());
		expect(classicFetch).not.toHaveBeenCalled();
	},
);

const classicRuntimeId = "urn:agent-browser:html-classic:11";
const classicRuntimeSource = "classic-source-contract";

function classicRuntimeRequest(
	overrides: Partial<import("./html-module.js").HtmlClassicScriptRequest> = {},
): import("./html-module.js").HtmlClassicScriptRequest {
	return {
		id: classicRuntimeId,
		source: classicRuntimeSource,
		baseUrl: "https://example.com/original/",
		credentials: "same-origin",
		signal: new AbortController().signal,
		...overrides,
	};
}

it("forwards admitted classic source runtime identity separately from its filename", async () => {
	const test = fakeCore();
	const owner = page(
		extensionPageRuntime(test.core, { classicScripts: true }),
		configuration(),
	);
	expect(owner.scripts.supportsHtmlClassicScripts).toBe(true);
	const prepared = await owner.scripts.prepareClassicScript(
		classicRuntimeRequest(),
	);
	expect(
		await owner.scripts.evaluate(prepared.source, {
			filename: documentUrl,
			classicScriptId: prepared.id,
			classicScriptTask: true,
		}),
	).toMatchObject({ ok: true });
	expect(test.realms[0].evaluate.mock.calls.at(-1)).toEqual([
		classicRuntimeSource,
		{ filename: classicRuntimeId },
	]);
});

it.each([
	"unknown",
	"changed-source",
	"module-mode",
	"missing-task",
])("rejects %s classic source runtime admission before forwarding the guest source", async (reason) => {
	const test = fakeCore();
	const owner = page(
		extensionPageRuntime(test.core, { classicScripts: true }),
		configuration(),
	);
	const prepared = await owner.scripts.prepareClassicScript(
		classicRuntimeRequest(),
	);
	const source =
		reason === "changed-source" ? `${prepared.source} ` : prepared.source;
	await expect(
		owner.scripts.evaluate(source, {
			filename: documentUrl,
			classicScriptId: reason === "unknown" ? `${prepared.id}1` : prepared.id,
			classicScriptTask: reason !== "missing-task",
			...(reason === "module-mode" ? { sourceType: "module" as const } : {}),
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(
		test.realms[0].evaluate.mock.calls.filter(([text]) => text === source),
	).toEqual([]);
});

it("keeps named host classic source runtime evaluations from borrowing admitted referrers", async () => {
	const modules = configuration();
	const denied: unknown[] = [];
	const test = fakeCore(async (source, evaluation, options) => {
		if (source !== "named-host-contract") return;
		if (!evaluation?.filename) throw new Error("Missing host source identity");
		expect(evaluation.filename).toBe("agent-browser:unadmitted-classic");
		denied.push(
			await options.sourceResolver?.("./child.js", evaluation.filename, {}),
		);
	});
	const owner = page(
		extensionPageRuntime(test.core, { classicScripts: true }),
		modules,
	);
	await owner.scripts.prepareClassicScript(classicRuntimeRequest());
	await owner.scripts.prepareModule(
		request({ id: externalId, source: undefined }),
	);
	modules.fetchWithPolicy.mockClear();
	for (const filename of [classicRuntimeId, externalId]) {
		expect(
			await owner.scripts.evaluate("named-host-contract", { filename }),
		).toMatchObject({ ok: true });
	}
	expect(denied).toEqual([undefined, undefined]);
	expect(modules.fetchWithPolicy).not.toHaveBeenCalled();
});

it.each(
	[false, true].flatMap((csp) =>
		[undefined, "anonymous", "use-credentials"].map((crossOrigin) => ({
			csp,
			crossOrigin,
		})),
	),
)("routes inline and redirected external classic source runtime imports with $csp CSP and $crossOrigin crossorigin", async ({
	csp,
	crossOrigin,
}) => {
	const credentials =
		crossOrigin === "use-credentials" ? "include" : "same-origin";
	const attribute =
		crossOrigin === undefined ? "" : ` crossorigin="${crossOrigin}"`;
	let tree: DocumentTree | undefined;
	const resolved: string[] = [];
	const inlineText = "inline-classic-contract";
	const externalText = "external-classic-contract";
	const externalFinal = "https://example.com/redirected/entry.js";
	const test = fakeCore(async (source, evaluation, options) => {
		if (source !== inlineText && source !== externalText) return;
		if (!tree || !evaluation?.filename)
			throw new Error("Missing classic source owner");
		expect(documentScriptState(tree)?.currentScript).not.toBeNull();
		expect(evaluation.sourceType).toBeUndefined();
		expect(evaluation.filename).toMatch(/^urn:agent-browser:html-classic:/);
		const child = await options.sourceResolver?.(
			"./child.js",
			evaluation.filename,
			{},
		);
		if (!child)
			throw new Error("Prepared classic source lost import admission");
		resolved.push(child.id);
	});
	const modules = configuration();
	modules.fetchWithPolicy.mockImplementation(
		async (url, policy, _signal, admission) => {
			if (csp) expect(admission).toBeDefined();
			if (url === externalId) {
				expect(policy).toEqual(
					crossOrigin === undefined
						? { mode: "no-cors", credentials: "include" }
						: { mode: "cors", credentials },
				);
				const fetchedEntry = fetched(externalText, externalFinal);
				fetchedEntry.response.redirects = [
					{ url: externalId, status: 302, location: externalFinal },
				];
				return fetchedEntry;
			}
			expect(policy).toEqual({
				mode: "cors",
				credentials,
			});
			return fetched("export const value=42;", url);
		},
	);
	const controller = new AbortController();
	cleanups.push(() => controller.abort());
	const input = response(
		`<base href="/original/"><script nonce="native"${attribute}>${inlineText}</script><script nonce="native"${attribute} src="/app/entry.js"></script>`,
		documentUrl,
		"text/html",
	);
	if (csp)
		input.headers = {
			...input.headers,
			"content-security-policy": ["script-src 'nonce-native'"],
		};
	const loader = new ScriptLoader({
		response: input,
		signal: controller.signal,
		fetch: async (url) => {
			if (csp) throw new Error("CSP classic fetch must use its policy");
			const entry = response(externalText, externalFinal);
			entry.redirects = [{ url, status: 302, location: externalFinal }];
			return entry;
		},
		fetchWithPolicy: modules.fetchWithPolicy,
		owner(document) {
			tree = document;
			cleanups.push(() => document.close());
			const scripts = new PageScripts(
				{ document, interactions: documentInteractions(document) },
				extensionPageRuntime(test.core, { classicScripts: true }),
				{ networkSourceModules: modules },
			);
			cleanups.push(() => scripts.close());
			return scripts;
		},
	});
	const document = await loadBrowserDocument(input, {
		scripts: loader,
		signal: controller.signal,
		tabId: "classic-runtime-imports",
		limits: {
			maxNodes: 1000,
			maxDepth: 64,
			maxTextCodeUnits: 100000,
			maxChanges: 100,
		},
	});
	expect(documentScriptState(document)?.report?.issues).toEqual({});
	expect(documentScriptState(document)?.report).toMatchObject({
		executed: 2,
		failed: 0,
		halted: false,
	});
	expect(resolved).toEqual([
		"https://example.com/original/child.js",
		"https://example.com/redirected/child.js",
	]);
});

it.each([
	{},
	{ classicScripts: true },
])("requires explicit HTML configuration for classic source runtime preparation %j", async (options) => {
	const test = fakeCore();
	const owner = page(extensionPageRuntime(test.core, options));
	expect(owner.scripts.supportsHtmlClassicScripts).toBe(false);
	await expect(
		owner.scripts.prepareClassicScript(classicRuntimeRequest()),
	).rejects.toMatchObject({ code: "unsupported" });
});
