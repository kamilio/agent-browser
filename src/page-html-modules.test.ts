import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { FetchCredentials } from "./cors.js";
import { AgentBrowserError } from "./errors.js";
import type { HtmlModuleRequest } from "./html-module.js";
import type { NetworkResponse } from "./network.js";
import {
	type PageNetworkModuleOptions,
	PageNetworkModuleRegistry,
	pageNetworkModuleLimits,
} from "./page-network-modules.js";
import type { ScriptFetchResult } from "./script-fetch.js";
import {
	type IntegrityAlgorithm,
	subresourceIntegrityLimits,
} from "./subresource-integrity.js";

const documentUrl = "https://page.example/docs/index.html";
const inlineId = "urn:agent-browser:html-module:1";
const rootId = "https://page.example/modules/root.js";
const moduleSource = "export const value = 42;";
const cleanups = new Set<() => void>();

afterEach(() => {
	for (const cleanup of cleanups) cleanup();
	cleanups.clear();
});

function response(
	url: string,
	options: {
		source?: string;
		body?: Uint8Array;
		type?: ScriptFetchResult["type"];
		status?: number;
		headers?: NetworkResponse["headers"];
	} = {},
): Readonly<ScriptFetchResult> {
	const body =
		options.body ?? new TextEncoder().encode(options.source ?? moduleSource);
	return {
		type: options.type ?? "basic",
		response: {
			url,
			status: options.status ?? 200,
			headers: options.headers ?? { "content-type": ["text/javascript"] },
			body,
			redirects: [],
			encodedBytes: body.byteLength,
			elapsedMs: 0,
		},
	};
}

function fixture(
	implementation: PageNetworkModuleOptions["fetchWithPolicy"] = async (url) =>
		response(url),
	options: Partial<Omit<PageNetworkModuleOptions, "fetchWithPolicy">> = {},
	maximum: number = pageNetworkModuleLimits.sourceCodeUnits,
) {
	const fetchWithPolicy = vi.fn(implementation);
	const owner = new AbortController();
	const registry = new PageNetworkModuleRegistry({
		documentUrl,
		entries: [],
		htmlEntries: true,
		...options,
		fetchWithPolicy,
	});
	const scope = registry.createScope(owner.signal, maximum);
	cleanups.add(scope.close);
	return { scope, owner, fetchWithPolicy, registry };
}

function request(
	overrides: Partial<HtmlModuleRequest> = {},
): HtmlModuleRequest {
	return {
		id: rootId,
		baseUrl: documentUrl,
		credentials: "same-origin",
		signal: new AbortController().signal,
		...overrides,
	};
}

function inline(overrides: Partial<HtmlModuleRequest> = {}): HtmlModuleRequest {
	return request({ id: inlineId, source: moduleSource, ...overrides });
}

function integrity(algorithm: IntegrityAlgorithm, bytes: Uint8Array): string {
	return `${algorithm}-${createHash(algorithm).update(bytes).digest("base64")}`;
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

async function flush() {
	for (let turn = 0; turn < 32; turn++) await Promise.resolve();
}

it.each([undefined, false])(
	"requires explicit HTML admission, not %s",
	async (htmlEntries) => {
		const fetchWithPolicy = vi.fn(async (url: string) => response(url));
		expect(
			() =>
				new PageNetworkModuleRegistry({
					documentUrl,
					entries: [],
					fetchWithPolicy,
					htmlEntries,
				}),
		).toThrow(AgentBrowserError);
		const test = fixture(fetchWithPolicy, {
			htmlEntries,
			entries: [{ id: rootId, source: moduleSource }],
		});
		await expect(test.scope.prepareHtmlModule(inline())).rejects.toMatchObject({
			code: "policy-denied",
		});
		await expect(test.scope.prepareHtmlModule(request())).rejects.toMatchObject(
			{ code: "policy-denied" },
		);
		expect(test.scope.validateEntry(moduleSource, rootId)).toBeUndefined();
		expect(() => test.scope.validateEntry(moduleSource, inlineId)).toThrow(
			AgentBrowserError,
		);
		expect(fetchWithPolicy).not.toHaveBeenCalled();
	},
);

it.each([null, 0, 1, "true", {}, []])(
	"rejects invalid htmlEntries %j",
	(htmlEntries) => {
		expect(() =>
			fixture(undefined, {
				htmlEntries,
			} as unknown as PageNetworkModuleOptions),
		).toThrow(AgentBrowserError);
	},
);

it("admits immutable inline sources with independent bases and credentials", async () => {
	const test = fixture();
	const input = {
		...inline({ baseUrl: "https://page.example/assets/", credentials: "omit" }),
	};
	const preparing = test.scope.prepareHtmlModule(input);
	input.source = "changed";
	input.baseUrl = "https://changed.example/";
	input.credentials = "include";
	const prepared = await preparing;
	expect(prepared).toEqual({ id: inlineId, source: moduleSource });
	expect(Object.isFrozen(prepared)).toBe(true);
	expect(test.scope.validateEntry(moduleSource, inlineId)).toBeUndefined();
	await expect(test.scope.resolve("./child.js", inlineId, {})).resolves.toEqual(
		{
			id: "https://page.example/assets/child.js",
			source: moduleSource,
		},
	);
	expect(test.fetchWithPolicy.mock.calls[0][1]).toEqual({
		mode: "cors",
		credentials: "omit",
	});
	expect(Object.isFrozen(test.fetchWithPolicy.mock.calls[0][1])).toBe(true);
	await expect(
		test.scope.prepareHtmlModule(
			inline({
				id: "urn:agent-browser:html-module:2",
				source: "",
			}),
		),
	).resolves.toEqual({ id: "urn:agent-browser:html-module:2", source: "" });
	expect(
		test.scope.validateEntry("", "urn:agent-browser:html-module:2"),
	).toBeUndefined();
});

it("deduplicates identical inline admissions without allowing source, base or credential replacement", async () => {
	const test = fixture();
	const prepared = await test.scope.prepareHtmlModule(inline());
	await expect(test.scope.prepareHtmlModule(inline())).resolves.toBe(prepared);
	for (const overrides of [
		{ source: "changed" },
		{ baseUrl: "https://page.example/other/" },
		{ credentials: "include" as const },
	]) {
		await expect(
			test.scope.prepareHtmlModule(inline(overrides)),
		).rejects.toMatchObject({ code: "invalid-input" });
	}
	expect(() => test.scope.validateEntry("changed", inlineId)).toThrow(
		AgentBrowserError,
	);
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it.each([
	"urn:agent-browser:html-module:0",
	"urn:agent-browser:html-module:01",
	"urn:agent-browser:html-module:-1",
	"urn:agent-browser:html-module:1.5",
	"urn:agent-browser:html-module:9007199254740992",
	"urn:agent-browser:html-module:1#x",
	"urn:other:1",
	rootId,
])("rejects inline identity %s", async (id) => {
	const test = fixture();
	await expect(
		test.scope.prepareHtmlModule(inline({ id })),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it("keeps external requested identity, final import base and inherited root credentials", async () => {
	const finalUrl = "https://cdn.example/releases/root.js";
	const test = fixture(async (url) =>
		response(url === rootId ? finalUrl : url, { type: "cors" }),
	);
	const prepared = await test.scope.prepareHtmlModule(
		request({ credentials: "include" }),
	);
	expect(prepared).toEqual({ id: rootId, source: moduleSource });
	expect(test.scope.validateEntry(moduleSource, rootId)).toBeUndefined();
	expect(() => test.scope.validateEntry(moduleSource, finalUrl)).toThrow(
		AgentBrowserError,
	);
	const child = await test.scope.resolve("./child.js", rootId, {});
	expect(child?.id).toBe("https://cdn.example/releases/child.js");
	await test.scope.resolve("./grandchild.js", child?.id ?? "", {});
	expect(test.fetchWithPolicy.mock.calls.map(([url]) => url)).toEqual([
		rootId,
		"https://cdn.example/releases/child.js",
		"https://cdn.example/releases/grandchild.js",
	]);
	for (const [, policy] of test.fetchWithPolicy.mock.calls)
		expect(policy).toEqual({ mode: "cors", credentials: "include" });
	await expect(
		test.scope.prepareHtmlModule(
			request({ baseUrl: "https://page.example/ignored/" }),
		),
	).resolves.toBe(prepared);
	await test.scope.resolve("./child.js", rootId, {});
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(3);
});

it.each(["omit", "same-origin", "include"] as const)(
	"inherits %s from an inline root instead of the registry default",
	async (credentials) => {
		const test = fixture(undefined, {
			credentials: credentials === "omit" ? "include" : "omit",
		});
		await test.scope.prepareHtmlModule(inline({ credentials }));
		const child = await test.scope.resolve("./child.js", inlineId, {});
		await test.scope.resolve("./grandchild.js", child?.id ?? "", {});
		for (const [, policy] of test.fetchWithPolicy.mock.calls)
			expect(policy).toEqual({ mode: "cors", credentials });
	},
);

it.each(["root", "dependency"] as const)(
	"shares single-flight root/dependency loads with %s first-encounter policy",
	async (first) => {
		const pending = deferred<Readonly<ScriptFetchResult>>();
		const test = fixture(async (url) =>
			url === rootId ? pending.promise : response(url),
		);
		await test.scope.prepareHtmlModule(inline({ credentials: "omit" }));
		const prepare = () =>
			test.scope.prepareHtmlModule(request({ credentials: "include" }));
		const resolve = () => test.scope.resolve(rootId, inlineId, {});
		const operations =
			first === "root" ? [prepare(), resolve()] : [resolve(), prepare()];
		await flush();
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
		const credentials = first === "root" ? "include" : "omit";
		expect(test.fetchWithPolicy.mock.calls[0][1]).toEqual({
			mode: "cors",
			credentials,
		});
		pending.resolve(response(rootId));
		const [initial, duplicate] = await Promise.all(operations);
		expect(initial).toBe(duplicate);
		await test.scope.resolve("./child.js", rootId, {});
		expect(test.fetchWithPolicy.mock.calls[1][1].credentials).toBe(credentials);
		await expect(prepare()).resolves.toBe(initial);
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(2);
	},
);

it("does not merge distinct requested identities redirected to the same final URL", async () => {
	const test = fixture(async () => response("https://page.example/final.js"));
	const otherId = `${rootId}#other`;
	const [first, second] = await Promise.all([
		test.scope.prepareHtmlModule(request()),
		test.scope.prepareHtmlModule(request({ id: otherId })),
	]);
	expect(first.id).toBe(rootId);
	expect(second.id).toBe(otherId);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(2);
});

it("isolates independent external root credentials while sharing a dependency's first policy", async () => {
	const test = fixture();
	const otherId = "https://page.example/other/root.js";
	await test.scope.prepareHtmlModule(request({ credentials: "omit" }));
	await test.scope.prepareHtmlModule(
		request({ id: otherId, credentials: "include" }),
	);
	await test.scope.resolve("./child.js", rootId, {});
	await test.scope.resolve("./child.js", otherId, {});
	const sharedId = "https://page.example/shared/module.js";
	await test.scope.resolve(sharedId, rootId, {});
	await test.scope.resolve(sharedId, otherId, {});
	await test.scope.resolve("./descendant.js", sharedId, {});
	expect(
		test.fetchWithPolicy.mock.calls.map(([url, policy]) => [
			url,
			policy.credentials,
		]),
	).toEqual([
		[rootId, "omit"],
		[otherId, "include"],
		["https://page.example/modules/child.js", "omit"],
		["https://page.example/other/child.js", "include"],
		[sharedId, "omit"],
		["https://page.example/shared/descendant.js", "omit"],
	]);
});

it("shares the active fetch queue between external roots and inline descendants", async () => {
	const pending: {
		url: string;
		result: ReturnType<typeof deferred<Readonly<ScriptFetchResult>>>;
	}[] = [];
	const test = fixture(async (url) => {
		const result = deferred<Readonly<ScriptFetchResult>>();
		pending.push({ url, result });
		return result.promise;
	});
	await test.scope.prepareHtmlModule(inline());
	const roots = Array.from(
		{ length: pageNetworkModuleLimits.activeFetches },
		(_, index) =>
			test.scope.prepareHtmlModule(
				request({ id: `https://page.example/root-${index}.js` }),
			),
	);
	const child = test.scope.resolve("./child.js", inlineId, {});
	await flush();
	expect(pending).toHaveLength(pageNetworkModuleLimits.activeFetches);
	pending[0].result.resolve(response(pending[0].url));
	await roots[0];
	await flush();
	expect(pending).toHaveLength(pageNetworkModuleLimits.activeFetches + 1);
	for (const { url, result } of pending.slice(1)) result.resolve(response(url));
	await Promise.all([...roots, child]);
});

it.each(["sha256", "sha384", "sha512"] as const)(
	"checks %s against original bytes and promotes a cached dependency without refetch",
	async (algorithm) => {
		const body = Uint8Array.from([0xef, 0xbb, 0xbf, 0xff, 0x61]);
		const expected = integrity(algorithm, body);
		const test = fixture(async (url) => response(url, { body }));
		await test.scope.prepareHtmlModule(inline());
		const loaded = await test.scope.resolve(rootId, inlineId, {});
		expect(loaded?.source).toBe("\ufffda");
		body.fill(0);
		await expect(
			test.scope.prepareHtmlModule(request({ integrity: expected })),
		).resolves.toBe(loaded);
		await expect(
			test.scope.prepareHtmlModule(
				request({ integrity: `${algorithm}-wrong` }),
			),
		).rejects.toMatchObject({ code: "policy-denied" });
		await expect(test.scope.resolve(rootId, inlineId, {})).resolves.toBe(
			loaded,
		);
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
	},
);

it("uses strongest supported SRI metadata and accepts any matching strongest digest", async () => {
	const bytes = new TextEncoder().encode(moduleSource);
	const test = fixture();
	const expected = `${integrity("sha256", bytes)} sha512-wrong ${integrity("sha512", bytes)}?option`;
	await expect(
		test.scope.prepareHtmlModule(request({ integrity: expected })),
	).resolves.toMatchObject({ source: moduleSource });
	await expect(
		test.scope.prepareHtmlModule(
			request({ integrity: `${integrity("sha256", bytes)} sha512-wrong` }),
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it.each(["", "sha1-ignored", "unknown"])(
	"reuses integrity parser no-restriction semantics for %j",
	async (metadata) => {
		const test = fixture();
		await expect(
			test.scope.prepareHtmlModule(request({ integrity: metadata })),
		).resolves.toMatchObject({ source: moduleSource });
	},
);

it("denies initial SRI failures before registration and caches the failure", async () => {
	const test = fixture();
	await expect(
		test.scope.prepareHtmlModule(request({ integrity: "sha512-wrong" })),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(() => test.scope.validateEntry(moduleSource, rootId)).toThrow(
		AgentBrowserError,
	);
	await expect(test.scope.prepareHtmlModule(request())).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("checks each joined preparation's integrity without poisoning a successful first load", async () => {
	const pending = deferred<Readonly<ScriptFetchResult>>();
	const test = fixture(async () => pending.promise);
	const first = test.scope.prepareHtmlModule(request());
	const rejected = expect(
		test.scope.prepareHtmlModule(request({ integrity: "sha256-wrong" })),
	).rejects.toMatchObject({ code: "policy-denied" });
	const expected = integrity("sha384", new TextEncoder().encode(moduleSource));
	const valid = test.scope.prepareHtmlModule(request({ integrity: expected }));
	pending.resolve(response(rootId));
	const prepared = await first;
	await rejected;
	await expect(valid).resolves.toBe(prepared);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("does not invent original-byte integrity for configured source-only entries", async () => {
	const test = fixture(undefined, {
		entries: [{ id: rootId, source: moduleSource }],
	});
	await expect(test.scope.prepareHtmlModule(request())).resolves.toMatchObject({
		source: moduleSource,
	});
	await expect(
		test.scope.prepareHtmlModule(
			request({
				integrity: integrity("sha256", new TextEncoder().encode(moduleSource)),
			}),
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it.each([
	["bad-type", 7, "invalid-input"],
	[
		"length",
		"x".repeat(subresourceIntegrityLimits.metadataCodeUnits + 1),
		"resource-limit",
	],
	[
		"items",
		" ".repeat(subresourceIntegrityLimits.metadataItems),
		"resource-limit",
	],
])("rejects %s integrity before fetching", async (_name, metadata, code) => {
	const test = fixture();
	await expect(
		test.scope.prepareHtmlModule(request({ integrity: metadata as string })),
	).rejects.toMatchObject({ code });
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it.each(["first", "second"] as const)(
	"cancels only the %s caller's waiter",
	async (cancelled) => {
		const pending = deferred<Readonly<ScriptFetchResult>>();
		const test = fixture(async () => pending.promise);
		const caller = new AbortController();
		const first = test.scope.prepareHtmlModule(
			request(cancelled === "first" ? { signal: caller.signal } : {}),
		);
		const second = test.scope.prepareHtmlModule(
			request(cancelled === "second" ? { signal: caller.signal } : {}),
		);
		const rejected = expect(
			cancelled === "first" ? first : second,
		).rejects.toMatchObject({ code: "aborted" });
		await flush();
		caller.abort();
		await rejected;
		expect(test.fetchWithPolicy.mock.calls[0][2].aborted).toBe(false);
		pending.resolve(response(rootId));
		await expect(cancelled === "first" ? second : first).resolves.toMatchObject(
			{ id: rootId },
		);
		await expect(
			test.scope.prepareHtmlModule(request()),
		).resolves.toMatchObject({ id: rootId });
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
	},
);

it("rejects pre-cancelled callers before admitting inline or starting external work", async () => {
	const test = fixture();
	const caller = new AbortController();
	caller.abort();
	await expect(
		test.scope.prepareHtmlModule(inline({ signal: caller.signal })),
	).rejects.toMatchObject({ code: "aborted" });
	await expect(
		test.scope.prepareHtmlModule(request({ signal: caller.signal })),
	).rejects.toMatchObject({ code: "aborted" });
	expect(() => test.scope.validateEntry(moduleSource, inlineId)).toThrow(
		AgentBrowserError,
	);
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
	await expect(test.scope.prepareHtmlModule(request())).resolves.toMatchObject({
		id: rootId,
	});
});

it("settles a preparation when the fetch adapter synchronously closes the scope", async () => {
	const test = fixture(async () => {
		close();
		throw new AgentBrowserError("network-error", "Adapter stopped");
	});
	const close = test.scope.close;
	await expect(test.scope.prepareHtmlModule(request())).rejects.toMatchObject({
		code: "aborted",
	});
	expect(test.fetchWithPolicy.mock.calls[0][2].aborted).toBe(true);
});

it.each(["close", "abort"] as const)(
	"settles active and queued preparations on scope %s even if fetch ignores cancellation",
	async (action) => {
		const pending = deferred<Readonly<ScriptFetchResult>>();
		const test = fixture(async () => pending.promise);
		await test.scope.prepareHtmlModule(inline());
		const preparations = Array.from(
			{ length: pageNetworkModuleLimits.activeFetches + 2 },
			(_, index) =>
				test.scope.prepareHtmlModule(
					request({ id: `https://page.example/pending-${index}.js` }),
				),
		);
		const settled = Promise.allSettled(preparations);
		await flush();
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(
			pageNetworkModuleLimits.activeFetches,
		);
		if (action === "close") test.scope.close();
		else test.owner.abort();
		for (const result of await settled) {
			expect(result.status).toBe("rejected");
			if (result.status === "rejected")
				expect(result.reason).toMatchObject({ code: "aborted" });
		}
		for (const [, , signal] of test.fetchWithPolicy.mock.calls)
			expect(signal.aborted).toBe(true);
		await expect(test.scope.prepareHtmlModule(inline())).rejects.toMatchObject({
			code: "aborted",
		});
		await expect(
			test.scope.resolve(rootId, inlineId, {}),
		).rejects.toMatchObject({ code: "aborted" });
		expect(() => test.scope.validateEntry(moduleSource, inlineId)).toThrow(
			AgentBrowserError,
		);
		pending.resolve(response(rootId));
		await flush();
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(
			pageNetworkModuleLimits.activeFetches,
		);
	},
);

it("keeps credentials, inline registrations and retained digests scoped to one lifetime", async () => {
	const bytes = new TextEncoder().encode(moduleSource);
	const test = fixture();
	await test.scope.prepareHtmlModule(inline({ credentials: "include" }));
	await test.scope.resolve(rootId, inlineId, {});
	test.scope.close();
	const owner = new AbortController();
	const other = test.registry.createScope(
		owner.signal,
		pageNetworkModuleLimits.sourceCodeUnits,
	);
	cleanups.add(other.close);
	expect(() => other.validateEntry(moduleSource, inlineId)).toThrow(
		AgentBrowserError,
	);
	await expect(
		other.prepareHtmlModule(
			request({ credentials: "omit", integrity: integrity("sha512", bytes) }),
		),
	).resolves.toMatchObject({ source: moduleSource });
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(2);
	expect(test.fetchWithPolicy.mock.calls[1][1].credentials).toBe("omit");
});

it.each([
	["opaque", { type: "opaque" }, "policy-denied"],
	[
		"cross-origin basic",
		{ url: "https://cdn.example/root.js" },
		"policy-denied",
	],
	["mixed redirect", { url: "http://page.example/root.js" }, "policy-denied"],
	["status", { status: 404 }, "network-error"],
	["missing MIME", { headers: {} }, "unsupported"],
	["HTML MIME", { headers: { "content-type": ["text/html"] } }, "unsupported"],
	[
		"duplicate MIME",
		{ headers: { "content-type": ["text/javascript", "text/javascript"] } },
		"unsupported",
	],
])(
	"applies strict response checks to HTML roots: %s",
	async (_name, overrides, code) => {
		const options = overrides as Parameters<typeof response>[1] & {
			url?: string;
		};
		const test = fixture(async (url) => response(options.url ?? url, options));
		await expect(test.scope.prepareHtmlModule(request())).rejects.toMatchObject(
			{ code },
		);
		expect(() => test.scope.validateEntry(moduleSource, rootId)).toThrow(
			AgentBrowserError,
		);
	},
);

it("decodes root and dependency bytes as UTF-8 regardless of charset labels", async () => {
	const source = 'export const text = "café 雪 😀";';
	const test = fixture(async (url) =>
		response(url, {
			source,
			headers: {
				"Content-Type": ["application/javascript; charset=iso-8859-1"],
			},
		}),
	);
	await expect(test.scope.prepareHtmlModule(request())).resolves.toMatchObject({
		source,
	});
	await expect(
		test.scope.resolve("./child.js", rootId, {}),
	).resolves.toMatchObject({ source });
});

it.each([
	{ id: "data:text/javascript,export{}" },
	{ id: "file:///tmp/root.js" },
	{ id: "http://page.example/root.js" },
	{ id: "https://user:password@page.example/root.js" },
	{ id: "https://PAGE.example/root.js" },
	{ id: "./root.js" },
	{ id: inlineId },
	{ baseUrl: "data:text/javascript,export{}" },
	{ baseUrl: "http://page.example/base/" },
	{ baseUrl: "./base/" },
	{ credentials: "invalid" as FetchCredentials },
	{ signal: {} as AbortSignal },
	{ source: 42 as unknown as string },
])(
	"rejects invalid HTML request fields before network: %j",
	async (overrides) => {
		const test = fixture();
		await expect(
			test.scope.prepareHtmlModule(request(overrides)),
		).rejects.toBeInstanceOf(AgentBrowserError);
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
	},
);

it.each([
	"id",
	"source",
	"baseUrl",
	"credentials",
	"integrity",
	"signal",
] as const)(
	"rejects accessor and inherited %s without invoking a getter",
	async (field) => {
		const test = fixture();
		const getter = vi.fn(() => request()[field]);
		const accessor = Object.defineProperty(request(), field, { get: getter });
		await expect(test.scope.prepareHtmlModule(accessor)).rejects.toMatchObject({
			code: "invalid-input",
		});
		const inherited = { ...request() };
		Reflect.deleteProperty(inherited, field);
		Object.setPrototypeOf(
			inherited,
			Object.defineProperty({}, field, { get: getter }),
		);
		await expect(test.scope.prepareHtmlModule(inherited)).rejects.toMatchObject(
			{ code: "invalid-input" },
		);
		expect(getter).not.toHaveBeenCalled();
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
	},
);

it("rejects proxy requests and inherited HTML opt-in without invoking traps or getters", async () => {
	const test = fixture();
	const trap = vi.fn(() => undefined);
	await expect(
		test.scope.prepareHtmlModule(
			new Proxy(request(), { getOwnPropertyDescriptor: trap }),
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(trap).not.toHaveBeenCalled();
	const getter = vi.fn(() => true);
	const options = Object.assign(
		Object.create(Object.defineProperty({}, "htmlEntries", { get: getter })),
		{
			documentUrl,
			entries: [],
			fetchWithPolicy: test.fetchWithPolicy,
		},
	);
	expect(() => new PageNetworkModuleRegistry(options)).toThrow(
		AgentBrowserError,
	);
	expect(getter).not.toHaveBeenCalled();
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it.each([
	{ action: "caller", depth: 1 },
	{ action: "scope", depth: 1 },
	{ action: "caller", depth: 3 },
	{ action: "scope", depth: 3 },
])(
	"rejects a depth-$depth Proxy prototype before $action cancellation traps",
	async ({ action, depth }) => {
		const test = fixture();
		const caller = new AbortController();
		const trap = vi.fn(() => {
			if (action === "caller") caller.abort();
			else test.scope.close();
		});
		let prototype: object = new Proxy(
			{},
			{
				has: () => {
					trap();
					return false;
				},
				getOwnPropertyDescriptor: () => {
					trap();
					return undefined;
				},
				getPrototypeOf: () => {
					trap();
					return null;
				},
			},
		);
		for (let index = 1; index < depth; index++)
			prototype = Object.create(prototype);
		const input = Object.setPrototypeOf(
			inline({ signal: caller.signal }),
			prototype,
		);
		await expect(test.scope.prepareHtmlModule(input)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(trap).not.toHaveBeenCalled();
		expect(caller.signal.aborted).toBe(false);
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
		expect(() => test.scope.validateEntry(moduleSource, inlineId)).toThrow(
			AgentBrowserError,
		);
		await expect(test.scope.prepareHtmlModule(inline())).resolves.toEqual({
			id: inlineId,
			source: moduleSource,
		});
	},
);

it("bounds prototype traversal without reading inherited data", async () => {
	const test = fixture();
	let prototype: object | null = null;
	for (let depth = 0; depth < 33; depth++) prototype = Object.create(prototype);
	const input = Object.setPrototypeOf(inline(), prototype);
	await expect(test.scope.prepareHtmlModule(input)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(() => test.scope.validateEntry(moduleSource, inlineId)).toThrow(
		AgentBrowserError,
	);
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it("bounds inline inputs before fetching or registering them", async () => {
	const test = fixture(undefined, {}, 8);
	for (const input of [
		inline({ source: "x".repeat(9) }),
		inline({
			source: "",
			id: "x".repeat(pageNetworkModuleLimits.identifierCodeUnits + 1),
		}),
		inline({
			source: "",
			baseUrl: "x".repeat(pageNetworkModuleLimits.identifierCodeUnits + 1),
		}),
	])
		await expect(test.scope.prepareHtmlModule(input)).rejects.toMatchObject({
			code: "resource-limit",
		});
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
	await expect(
		test.scope.prepareHtmlModule(inline({ source: "😀".repeat(4) })),
	).resolves.toMatchObject({ source: "😀".repeat(4) });
});

it.each(["body", "source"] as const)(
	"bounds external %s before admission",
	async (kind) => {
		const test = fixture(
			async (url) =>
				response(
					url,
					kind === "body"
						? {
								body: new Uint8Array(pageNetworkModuleLimits.responseBytes + 1),
							}
						: { source: "x".repeat(9) },
				),
			{},
			8,
		);
		await expect(test.scope.prepareHtmlModule(request())).rejects.toMatchObject(
			{ code: "resource-limit" },
		);
		expect(() => test.scope.validateEntry("", rootId)).toThrow(
			AgentBrowserError,
		);
	},
);

it("shares the total source budget across configured, inline and external entries without charging hits twice", async () => {
	const source = "x".repeat(pageNetworkModuleLimits.sourceCodeUnits);
	const test = fixture(async (url) => response(url, { source }), {
		entries: [{ id: "https://page.example/configured.js", source }],
	});
	await test.scope.prepareHtmlModule(inline({ source }));
	await test.scope.prepareHtmlModule(
		inline({ id: "urn:agent-browser:html-module:2", source }),
	);
	const root = await test.scope.prepareHtmlModule(request());
	await expect(test.scope.prepareHtmlModule(request())).resolves.toBe(root);
	await expect(
		test.scope.prepareHtmlModule(inline({ source })),
	).resolves.toMatchObject({ source });
	await expect(
		test.scope.prepareHtmlModule(
			inline({ id: "urn:agent-browser:html-module:3", source: "x" }),
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	await expect(
		test.scope.resolve("./extra.js", rootId, {}),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it("reserves shared source slots for pending roots before admitting inline entries", async () => {
	const pending = deferred<Readonly<ScriptFetchResult>>();
	const test = fixture(async () => pending.promise);
	for (let index = 1; index < pageNetworkModuleLimits.sources; index++)
		await test.scope.prepareHtmlModule(
			inline({ id: `urn:agent-browser:html-module:${index}`, source: "" }),
		);
	const root = test.scope.prepareHtmlModule(request());
	const rejected = expect(root).rejects.toMatchObject({ code: "aborted" });
	await expect(
		test.scope.prepareHtmlModule(
			inline({
				id: `urn:agent-browser:html-module:${pageNetworkModuleLimits.sources}`,
				source: "",
			}),
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	await expect(
		test.scope.prepareHtmlModule(
			request({ id: "https://page.example/overflow.js" }),
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	test.scope.close();
	await rejected;
	pending.resolve(response(rootId));
});

it("shares resolution budgets between repeated preparations and dependency resolutions", async () => {
	const test = fixture();
	await test.scope.prepareHtmlModule(inline());
	for (let index = 1; index < pageNetworkModuleLimits.resolutions; index++) {
		if (index % 2) await test.scope.prepareHtmlModule(inline());
		else await test.scope.resolve("bare-name", inlineId, {});
	}
	await expect(test.scope.prepareHtmlModule(inline())).rejects.toMatchObject({
		code: "resource-limit",
	});
	await expect(
		test.scope.resolve("bare-name", inlineId, {}),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it("charges failed roots and dependencies to the same fetch budget and releases their source slots", async () => {
	const test = fixture(async (url) => response(url, { status: 404 }));
	await test.scope.prepareHtmlModule(inline());
	for (let index = 0; index < pageNetworkModuleLimits.fetches; index++) {
		const id = `https://page.example/failure-${index}.js`;
		const operation =
			index % 2
				? test.scope.prepareHtmlModule(request({ id }))
				: test.scope.resolve(id, inlineId, {});
		await expect(operation).rejects.toMatchObject({ code: "network-error" });
	}
	await expect(
		test.scope.prepareHtmlModule(
			inline({ id: "urn:agent-browser:html-module:2", source: "" }),
		),
	).resolves.toMatchObject({ source: "" });
	await expect(test.scope.prepareHtmlModule(request())).rejects.toMatchObject({
		code: "resource-limit",
	});
	await expect(test.scope.resolve(rootId, inlineId, {})).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(
		pageNetworkModuleLimits.fetches,
	);
});
