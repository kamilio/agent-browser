import { expect, it, vi } from "vitest";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import {
	PageNetworkModuleRegistry,
	pageNetworkModuleLimits,
} from "./page-network-modules.js";
import { pageSourceModuleLimits } from "./page-source-modules.js";
import {
	fetchScriptResource,
	type ScriptFetchPolicy,
	type ScriptFetchResult,
} from "./script-fetch.js";

const documentUrl = "https://page.example/docs/index.html";
const entryId = "https://page.example/modules/entry.js";
const entrySource = "export const entry = true;";
const dependencySource = "export const value = 42;";
type RegistryOptions = ConstructorParameters<
	typeof PageNetworkModuleRegistry
>[0];
type PolicyFetch = (
	url: string,
	policy: ScriptFetchPolicy,
	signal: AbortSignal,
) => Promise<Readonly<ScriptFetchResult>>;

function response(
	url: string,
	source = dependencySource,
	options: {
		type?: ScriptFetchResult["type"];
		status?: number;
		headers?: NetworkResponse["headers"];
		body?: Uint8Array;
	} = {},
): Readonly<ScriptFetchResult> {
	const body = options.body ?? new TextEncoder().encode(source);
	return Object.freeze({
		type: options.type ?? "basic",
		response: Object.freeze({
			url,
			status: options.status ?? 200,
			headers: options.headers ?? {
				"content-type": ["text/javascript; charset=utf-8"],
			},
			body,
			redirects: Object.freeze([]),
			encodedBytes: body.byteLength,
			elapsedMs: 0,
		}),
	});
}

function fixture(
	implementation: PolicyFetch = async (url) => response(url),
	options: Partial<Omit<RegistryOptions, "fetchWithPolicy">> = {},
	maxSourceCodeUnits: number = pageSourceModuleLimits.sourceCodeUnits,
) {
	const fetchWithPolicy = vi.fn(implementation);
	const owner = new AbortController();
	const registry = new PageNetworkModuleRegistry({
		documentUrl,
		entries: [{ id: entryId, source: entrySource }],
		...options,
		fetchWithPolicy,
	});
	const scope = registry.createScope(owner.signal, maxSourceCodeUnits);
	return { fetchWithPolicy, owner, registry, scope };
}

function failure(action: () => unknown, code?: ErrorCode) {
	let error: unknown;
	try {
		action();
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (code !== undefined) expect(error).toMatchObject({ code });
	return error as AgentBrowserError;
}

async function rejection(operation: Promise<unknown>, code?: ErrorCode) {
	let error: unknown;
	try {
		await operation;
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (code !== undefined) expect(error).toMatchObject({ code });
	return error as AgentBrowserError;
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<Value>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

async function flushSettlement() {
	for (let turn = 0; turn < 32; turn++) await Promise.resolve();
}

function gatedFetch() {
	const requests: {
		url: string;
		signal: AbortSignal;
		pending: ReturnType<typeof deferred<Readonly<ScriptFetchResult>>>;
	}[] = [];
	let active = 0;
	let peak = 0;
	const fetchWithPolicy: PolicyFetch = async (url, _policy, signal) => {
		const pending = deferred<Readonly<ScriptFetchResult>>();
		requests.push({ url, signal, pending });
		active++;
		peak = Math.max(peak, active);
		try {
			return await pending.promise;
		} finally {
			active--;
		}
	};
	return { requests, fetchWithPolicy, peak: () => peak };
}

it("exports frozen network limits consistent with source-module limits", () => {
	expect(Object.isFrozen(pageNetworkModuleLimits)).toBe(true);
	expect(pageNetworkModuleLimits).toMatchObject({
		fetches: 128,
		activeFetches: 4,
		responseBytes: 1_048_576,
		sources: pageSourceModuleLimits.sources,
		resolutions: pageSourceModuleLimits.resolutions,
		sourceCodeUnits: pageSourceModuleLimits.sourceCodeUnits,
		totalSourceCodeUnits: pageSourceModuleLimits.totalSourceCodeUnits,
		identifierCodeUnits: pageSourceModuleLimits.identifierCodeUnits,
	});
});

it("requires an explicit policy-fetch callback", () => {
	failure(
		() =>
			new PageNetworkModuleRegistry({
				documentUrl,
				entries: [{ id: entryId, source: entrySource }],
			} as unknown as RegistryOptions),
		"invalid-input",
	);
});

it("resolves relative, root-relative and cross-origin imports through CORS policy", async () => {
	const test = fixture(async (url) =>
		response(url, dependencySource, {
			type:
				new URL(url).origin === new URL(documentUrl).origin ? "basic" : "cors",
		}),
	);
	expect(test.scope.validateEntry(entrySource, entryId)).toBeUndefined();
	for (const [specifier, expected] of [
		["./dependency.js", "https://page.example/modules/dependency.js"],
		["../shared.js", "https://page.example/shared.js"],
		["/root.js", "https://page.example/root.js"],
		["https://cdn.example/library.js", "https://cdn.example/library.js"],
	]) {
		const module = await test.scope.resolve(specifier, entryId, {});
		expect(module).toEqual({ id: expected, source: dependencySource });
		expect(Object.isFrozen(module)).toBe(true);
		expect(test.fetchWithPolicy).toHaveBeenLastCalledWith(
			expected,
			{ mode: "cors", credentials: "same-origin" },
			expect.any(AbortSignal),
		);
	}
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(4);
});

it.each(["omit", "same-origin", "include"] as const)(
	"forwards configured %s credentials with CORS mode",
	async (credentials) => {
		const test = fixture(
			async (url) => response(url, dependencySource, { type: "cors" }),
			{ credentials },
		);
		await test.scope.resolve("https://cdn.example/dependency.js", entryId, {});
		expect(test.fetchWithPolicy).toHaveBeenCalledWith(
			"https://cdn.example/dependency.js",
			{ mode: "cors", credentials },
			expect.any(AbortSignal),
		);
	},
);

it.each([
	["https://cdn.example/request.js", "https://cdn.example/final.js"],
	["https://page.example/request.js", "https://cdn.example/final.js"],
	["https://cdn.example/request.js", "https://page.example/final.js"],
])("requires CORS when request %s ends at %s", async (requested, finalUrl) => {
	const basic = fixture(async () => response(finalUrl));
	await rejection(basic.scope.resolve(requested, entryId, {}), "policy-denied");
	const cors = fixture(async () =>
		response(finalUrl, dependencySource, { type: "cors" }),
	);
	await expect(cors.scope.resolve(requested, entryId, {})).resolves.toEqual({
		id: finalUrl,
		source: dependencySource,
	});
	expect(basic.fetchWithPolicy).toHaveBeenCalledTimes(1);
	expect(cors.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("decodes module bytes as UTF-8 regardless of the response charset", async () => {
	const source = 'export const text = "café 雪 😀";';
	const test = fixture(async (url) =>
		response(url, source, {
			headers: {
				"content-type": ["application/javascript; charset=iso-8859-1"],
			},
		}),
	);
	await expect(test.scope.resolve("./utf8.js", entryId, {})).resolves.toEqual({
		id: "https://page.example/modules/utf8.js",
		source,
	});
});

it("accepts case-insensitive Content-Type headers from the policy-fetch result", async () => {
	const test = fixture(async (url) =>
		response(url, dependencySource, {
			headers: { "Content-Type": ["text/javascript"] },
		}),
	);
	await expect(
		test.scope.resolve("./header-case.js", entryId, {}),
	).resolves.toEqual({
		id: "https://page.example/modules/header-case.js",
		source: dependencySource,
	});
});

it("snapshots entries, document URL, credentials and the supplied callback", async () => {
	const entries = [{ id: entryId, source: entrySource }];
	const fetchWithPolicy = vi.fn<PolicyFetch>(async (url) => response(url));
	const replacement = vi.fn<PolicyFetch>(async (url) =>
		response(url, "changed"),
	);
	const options = {
		documentUrl,
		entries,
		credentials: "omit" as RegistryOptions["credentials"],
		fetchWithPolicy,
	};
	const registry = new PageNetworkModuleRegistry(options);
	entries[0].id = "https://changed.example/entry.js";
	entries[0].source = "changed";
	entries.push({ id: "https://changed.example/extra.js", source: "" });
	options.documentUrl = "http://changed.example/";
	options.credentials = "include";
	options.fetchWithPolicy = replacement;
	const scope = registry.createScope(
		new AbortController().signal,
		pageSourceModuleLimits.sourceCodeUnits,
	);
	expect(scope.validateEntry(entrySource, entryId)).toBeUndefined();
	await expect(scope.resolve(entryId, entryId, {})).resolves.toEqual({
		id: entryId,
		source: entrySource,
	});
	await scope.resolve("./dependency.js", entryId, {});
	expect(fetchWithPolicy).toHaveBeenCalledTimes(1);
	expect(fetchWithPolicy).toHaveBeenCalledWith(
		"https://page.example/modules/dependency.js",
		{ mode: "cors", credentials: "omit" },
		expect.any(AbortSignal),
	);
	await rejection(
		scope.resolve("http://page.example/insecure.js", entryId, {}),
	);
	expect(fetchWithPolicy).toHaveBeenCalledTimes(1);
	expect(replacement).not.toHaveBeenCalled();
});

it("rejects non-exact entry source and unknown entry identity synchronously", () => {
	const test = fixture();
	for (const [source, filename] of [
		[`${entrySource}\n`, entryId],
		[dependencySource, entryId],
		[entrySource, "https://page.example/modules/unknown.js"],
		[entrySource, ""],
	]) {
		failure(() => test.scope.validateEntry(source, filename), "invalid-input");
	}
	expect(test.scope.validateEntry(entrySource, entryId)).toBeUndefined();
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it("returns undefined without fetching bare imports or imports from unknown referrers", async () => {
	const test = fixture();
	for (const [specifier, referrer] of [
		["package", entryId],
		["@scope/package", entryId],
		["package/subpath", entryId],
		["./dependency.js", "https://unknown.example/entry.js"],
		["https://cdn.example/library.js", "https://unknown.example/entry.js"],
	]) {
		await expect(
			test.scope.resolve(specifier, referrer, {}),
		).resolves.toBeUndefined();
	}
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it("shares concurrent and completed requests for the same dependency", async () => {
	const pending = deferred<Readonly<ScriptFetchResult>>();
	const test = fixture(async () => pending.promise);
	const first = test.scope.resolve("./dependency.js", entryId, {});
	const second = test.scope.resolve("./dependency.js", entryId, {});
	await flushSettlement();
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
	pending.resolve(response("https://page.example/modules/dependency.js"));
	const modules = await Promise.all([first, second]);
	expect(modules[0]).toEqual({
		id: "https://page.example/modules/dependency.js",
		source: dependencySource,
	});
	expect(modules[1]).toEqual(modules[0]);
	expect(Object.isFrozen(modules[0])).toBe(true);
	await expect(
		test.scope.resolve("./dependency.js", entryId, {}),
	).resolves.toEqual(modules[0]);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("retains failed in-flight requests without retrying", async () => {
	const pending = deferred<Readonly<ScriptFetchResult>>();
	const test = fixture(async () => pending.promise);
	const first = rejection(
		test.scope.resolve("./broken.js", entryId, {}),
		"network-error",
	);
	const second = rejection(
		test.scope.resolve("./broken.js", entryId, {}),
		"network-error",
	);
	await flushSettlement();
	pending.reject(new AgentBrowserError("network-error", "Mock fetch failed"));
	await Promise.all([first, second]);
	await rejection(
		test.scope.resolve("./broken.js", entryId, {}),
		"network-error",
	);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("retains decoded source independently of mutable response bytes", async () => {
	const body = new TextEncoder().encode(dependencySource);
	const test = fixture(async (url) => response(url, "", { body }));
	const first = await test.scope.resolve("./dependency.js", entryId, {});
	body.fill(32);
	await expect(
		test.scope.resolve("./dependency.js", entryId, {}),
	).resolves.toEqual({
		id: "https://page.example/modules/dependency.js",
		source: dependencySource,
	});
	expect(first?.source).toBe(dependencySource);
	expect(Object.isFrozen(first)).toBe(true);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("keeps a successful request identity when a later alias populates its requested URL", async () => {
	const requested = "https://page.example/modules/first.js";
	const destination = "https://page.example/modules/final.js";
	const test = fixture(async (url) =>
		response(url === requested ? destination : requested, dependencySource),
	);
	const first = await test.scope.resolve(requested, entryId, {});
	const alias = await test.scope.resolve("./alias.js", entryId, {});
	expect(first?.id).toBe(destination);
	expect(alias?.id).toBe(requested);
	expect(await test.scope.resolve(requested, entryId, {})).toBe(first);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(2);
	test.owner.abort();
});

it("keeps a failed request rejected when a later alias populates its requested URL", async () => {
	const requested = "https://page.example/modules/failed.js";
	const test = fixture(async (url) =>
		response(requested, dependencySource, {
			status: url === requested ? 503 : 200,
		}),
	);
	const first = await rejection(
		test.scope.resolve(requested, entryId, {}),
		"network-error",
	);
	await test.scope.resolve("./alias.js", entryId, {});
	expect(
		await rejection(
			test.scope.resolve(requested, entryId, {}),
			"network-error",
		),
	).toBe(first);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(2);
	test.owner.abort();
});

it("bounds the final identity after restoring a requested fragment", async () => {
	const prefix = "https://page.example/";
	const destination =
		prefix +
		"x".repeat(pageNetworkModuleLimits.identifierCodeUnits - prefix.length);
	const test = fixture(async () => response(destination));
	await rejection(
		test.scope.resolve("./fragment.js#section", entryId, {}),
		"resource-limit",
	);
	await rejection(
		test.scope.resolve("./fragment.js#section", entryId, {}),
		"resource-limit",
	);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
	test.owner.abort();
});

it("rejects malformed scalar Content-Type values from a host callback", async () => {
	const headers = {
		"content-type": "text/javascript",
	} as unknown as NetworkResponse["headers"];
	const test = fixture(async (url) =>
		response(url, dependencySource, { headers }),
	);
	await rejection(test.scope.resolve("./malformed.js", entryId, {}));
	test.owner.abort();
});

it.each([
	{},
	{ "content-type": ["text/plain"] },
	{ "content-type": ["text/html"] },
	{ "content-type": ["application/json"] },
	{ "content-type": ["application/octet-stream"] },
	{ "content-type": ["text/javascript-not-really"] },
	{ "content-type": ["text/javascript", "application/javascript"] },
	{ "content-type": ["text/javascript"], "Content-Type": ["text/javascript"] },
	{ "content-type": ["text/javascript"], "CONTENT-TYPE": ["text/html"] },
] as NetworkResponse["headers"][])(
	"rejects non-JavaScript MIME headers %j and memoizes the rejection",
	async (headers) => {
		const test = fixture(async (url) =>
			response(url, dependencySource, { headers }),
		);
		await rejection(test.scope.resolve("./mime.js", entryId, {}));
		await rejection(test.scope.resolve("./mime.js", entryId, {}));
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
	},
);

it.each([199, 301, 304, 404, 500])(
	"rejects unsuccessful HTTP status %s",
	async (status) => {
		const test = fixture(async (url) =>
			response(url, dependencySource, { status }),
		);
		await rejection(test.scope.resolve("./status.js", entryId, {}));
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
	},
);

it("rejects opaque responses even with successful status and JavaScript MIME", async () => {
	const test = fixture(async (url) =>
		response(url, dependencySource, { type: "opaque" }),
	);
	await rejection(
		test.scope.resolve("https://cdn.example/opaque.js", entryId, {}),
	);
	await expect(
		test.scope.resolve("./child.js", "https://cdn.example/opaque.js", {}),
	).resolves.toBeUndefined();
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it.each([
	"http://page.example/insecure.js",
	"https://user:password@page.example/private.js",
])(
	"rejects prohibited import URL %s before policy fetch",
	async (specifier) => {
		const test = fixture();
		await rejection(test.scope.resolve(specifier, entryId, {}));
		expect(test.fetchWithPolicy).not.toHaveBeenCalled();
	},
);

it.each([
	"http://cdn.example/insecure.js",
	"https://user:password@cdn.example/private.js",
])("rejects prohibited final response URL %s", async (finalUrl) => {
	const test = fixture(async () =>
		response(finalUrl, dependencySource, { type: "cors" }),
	);
	await rejection(test.scope.resolve("./redirect.js", entryId, {}));
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("uses the canonical final identity as a known referrer and caches matching aliases", async () => {
	const finalId = "https://cdn.example/releases/dependency.js";
	const childId = "https://cdn.example/releases/child.js";
	const test = fixture(async (url) =>
		response(url === childId ? childId : finalId, dependencySource, {
			type: "cors",
		}),
	);
	const first = await test.scope.resolve("./redirect.js", entryId, {});
	expect(first).toEqual({ id: finalId, source: dependencySource });
	await expect(test.scope.resolve(finalId, entryId, {})).resolves.toEqual(
		first,
	);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
	await expect(
		test.scope.resolve("./another-alias.js", entryId, {}),
	).resolves.toEqual(first);
	await expect(test.scope.resolve("./child.js", finalId, {})).resolves.toEqual({
		id: childId,
		source: dependencySource,
	});
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(3);
});

it("rejects conflicting sources for the same final identity without replacing the cached source", async () => {
	const finalId = "https://cdn.example/shared.js";
	const test = fixture(async (url) =>
		response(
			finalId,
			url.endsWith("first.js") ? dependencySource : "export const value = 99;",
			{ type: "cors" },
		),
	);
	const first = await test.scope.resolve("./first.js", entryId, {});
	await rejection(test.scope.resolve("./second.js", entryId, {}));
	await rejection(test.scope.resolve("./second.js", entryId, {}));
	await expect(test.scope.resolve(finalId, entryId, {})).resolves.toEqual(
		first,
	);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(2);
});

it("does not let a fetched alias replace a configured entry source", async () => {
	const test = fixture(async () => response(entryId, dependencySource));
	await rejection(test.scope.resolve("./alias.js", entryId, {}));
	expect(test.scope.validateEntry(entrySource, entryId)).toBeUndefined();
	await expect(test.scope.resolve(entryId, entryId, {})).resolves.toEqual({
		id: entryId,
		source: entrySource,
	});
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("applies smaller page source limits to configured entries", () => {
	const registry = new PageNetworkModuleRegistry({
		documentUrl,
		entries: [{ id: entryId, source: entrySource }],
		fetchWithPolicy: async (url) => response(url),
	});
	failure(
		() =>
			registry.createScope(
				new AbortController().signal,
				entrySource.length - 1,
			),
		"resource-limit",
	);
	expect(
		registry
			.createScope(new AbortController().signal, entrySource.length)
			.validateEntry(entrySource, entryId),
	).toBeUndefined();
});

it("applies the page source budget in UTF-16 code units to fetched dependencies", async () => {
	const limit = 64;
	const source = "😀".repeat(limit / 2);
	const test = fixture(
		async (url) =>
			response(url, url.endsWith("exact.js") ? source : `${source} `),
		{},
		limit,
	);
	await expect(
		test.scope.resolve("./exact.js", entryId, {}),
	).resolves.toMatchObject({ source });
	await rejection(
		test.scope.resolve("./over.js", entryId, {}),
		"resource-limit",
	);
});

it("enforces the fixed source limit even when the page requests a larger allowance", async () => {
	const source = " ".repeat(pageSourceModuleLimits.sourceCodeUnits);
	const test = fixture(
		async (url) =>
			response(url, url.endsWith("exact.js") ? source : `${source} `),
		{},
		pageSourceModuleLimits.sourceCodeUnits + 1,
	);
	await expect(
		test.scope.resolve("./exact.js", entryId, {}),
	).resolves.toMatchObject({ source });
	await rejection(
		test.scope.resolve("./over.js", entryId, {}),
		"resource-limit",
	);
});

it("rejects oversized response bytes", async () => {
	const body = new Uint8Array(pageNetworkModuleLimits.responseBytes + 1);
	const test = fixture(async (url) => response(url, "", { body }));
	await rejection(
		test.scope.resolve("./large.js", entryId, {}),
		"resource-limit",
	);
});

it("charges distinct sources against the cumulative budget without charging cache hits twice", async () => {
	const source = " ".repeat(pageSourceModuleLimits.sourceCodeUnits);
	const test = fixture(
		async (url) => response(url, url.endsWith("over.js") ? " " : source),
		{ entries: [{ id: entryId, source: "" }] },
	);
	const count = pageSourceModuleLimits.totalSourceCodeUnits / source.length;
	for (let index = 0; index < count; index++) {
		const specifier = `./part-${index}.js`;
		await test.scope.resolve(specifier, entryId, {});
		await test.scope.resolve(specifier, entryId, {});
	}
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(count);
	await rejection(
		test.scope.resolve("./over.js", entryId, {}),
		"resource-limit",
	);
});

it("includes entry sources in the cumulative budget", async () => {
	const source = " ".repeat(pageSourceModuleLimits.sourceCodeUnits);
	const count = pageSourceModuleLimits.totalSourceCodeUnits / source.length;
	const entries = Array.from({ length: count }, (_, index) => ({
		id: `https://page.example/entry-${index}.js`,
		source,
	}));
	const test = fixture(async (url) => response(url, " "), { entries });
	await rejection(
		test.scope.resolve("./over.js", entries[0].id, {}),
		"resource-limit",
	);
});

it("bounds distinct sources including configured entries", async () => {
	const test = fixture(async (url) => response(url, ""));
	for (let index = 1; index < pageSourceModuleLimits.sources; index++) {
		await test.scope.resolve(`./dependency-${index}.js`, entryId, {});
	}
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(
		pageSourceModuleLimits.sources - 1,
	);
	await rejection(
		test.scope.resolve("./over.js", entryId, {}),
		"resource-limit",
	);
});

it("reserves source slots for active and queued imports and releases failed reservations", async () => {
	const pendingCount = pageNetworkModuleLimits.activeFetches + 2;
	const entries = Array.from(
		{ length: pageSourceModuleLimits.sources - pendingCount },
		(_, index) => ({
			id: index === 0 ? entryId : `https://page.example/entry-${index}.js`,
			source: "",
		}),
	);
	const gate = gatedFetch();
	const test = fixture(gate.fetchWithPolicy, { entries });
	const completed = Promise.allSettled(
		Array.from({ length: pendingCount }, (_, index) =>
			test.scope.resolve(`./pending-${index}.js`, entryId, {}),
		),
	);
	await flushSettlement();
	expect(gate.requests).toHaveLength(pageNetworkModuleLimits.activeFetches);
	await rejection(
		test.scope.resolve("./no-slot.js", entryId, {}),
		"resource-limit",
	);
	let released = 0;
	for (let batch = 0; batch < 2; batch++) {
		for (const request of gate.requests.slice(released)) {
			request.pending.reject(
				new AgentBrowserError("network-error", "Mock fetch failed"),
			);
		}
		released = gate.requests.length;
		await flushSettlement();
	}
	const results = await completed;
	for (const result of results) {
		expect(result.status).toBe("rejected");
		if (result.status === "rejected") {
			expect(result.reason).toBeInstanceOf(AgentBrowserError);
			expect(result.reason).toMatchObject({ code: "network-error" });
		}
	}
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(pendingCount);
	const recovered = test.scope.resolve("./no-slot.js", entryId, {});
	await flushSettlement();
	expect(gate.requests).toHaveLength(pendingCount + 1);
	const request = gate.requests[pendingCount];
	request.pending.resolve(response(request.url));
	await expect(recovered).resolves.toMatchObject({ source: dependencySource });
});

it("bounds resolution calls even when every call hits an existing entry", async () => {
	const test = fixture();
	for (let index = 0; index < pageSourceModuleLimits.resolutions; index++) {
		await test.scope.resolve(entryId, entryId, {});
	}
	await rejection(test.scope.resolve(entryId, entryId, {}), "resource-limit");
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it("bounds fetch attempts including failures without charging memoized failures again", async () => {
	const test = fixture(async () => {
		throw new AgentBrowserError("network-error", "Mock fetch failed");
	});
	for (let index = 0; index < pageNetworkModuleLimits.fetches; index++) {
		const specifier = `./missing-${index}.js`;
		await rejection(
			test.scope.resolve(specifier, entryId, {}),
			"network-error",
		);
		await rejection(
			test.scope.resolve(specifier, entryId, {}),
			"network-error",
		);
	}
	await rejection(
		test.scope.resolve("./over.js", entryId, {}),
		"resource-limit",
	);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(
		pageNetworkModuleLimits.fetches,
	);
});

it("rejects overlong dependency identifiers without fetching", async () => {
	const test = fixture();
	const specifier = `./${"a".repeat(pageSourceModuleLimits.identifierCodeUnits)}.js`;
	await rejection(test.scope.resolve(specifier, entryId, {}), "resource-limit");
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it("queues excess work and never has more than four active policy fetches", async () => {
	const gate = gatedFetch();
	const test = fixture(gate.fetchWithPolicy);
	const total = pageNetworkModuleLimits.activeFetches * 2 + 1;
	const completed = Promise.allSettled(
		Array.from({ length: total }, (_, index) =>
			test.scope.resolve(`./dependency-${index}.js`, entryId, {}),
		),
	);
	let released = 0;
	for (let batch = 0; batch < 3; batch++) {
		await flushSettlement();
		const expected = Math.min(
			released + pageNetworkModuleLimits.activeFetches,
			total,
		);
		expect(gate.requests).toHaveLength(expected);
		for (const request of gate.requests.slice(released)) {
			request.pending.resolve(response(request.url));
		}
		released = expected;
	}
	const results = await completed;
	expect(results.every((result) => result.status === "fulfilled")).toBe(true);
	expect(gate.peak()).toBe(4);
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(total);
});

it("revokes queued and active imports on owner abort even when policy fetch ignores cancellation", async () => {
	const gate = gatedFetch();
	const test = fixture(gate.fetchWithPolicy);
	const total = pageNetworkModuleLimits.activeFetches + 2;
	const completed = Promise.allSettled(
		Array.from({ length: total }, (_, index) =>
			test.scope.resolve(`./dependency-${index}.js`, entryId, {}),
		),
	);
	await flushSettlement();
	expect(gate.requests).toHaveLength(pageNetworkModuleLimits.activeFetches);
	test.owner.abort();
	const results = await completed;
	for (const result of results) {
		expect(result.status).toBe("rejected");
		if (result.status === "rejected") {
			expect(result.reason).toBeInstanceOf(AgentBrowserError);
			expect(result.reason).toMatchObject({ code: "aborted" });
		}
	}
	for (const request of gate.requests) {
		expect(request.signal.aborted).toBe(true);
		request.pending.resolve(response(request.url));
	}
	await flushSettlement();
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(
		pageNetworkModuleLimits.activeFetches,
	);
	await rejection(
		test.scope.resolve("./dependency-0.js", entryId, {}),
		"aborted",
	);
	await rejection(test.scope.resolve("./new.js", entryId, {}), "aborted");
	failure(() => test.scope.validateEntry(entrySource, entryId), "aborted");
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(
		pageNetworkModuleLimits.activeFetches,
	);
});

it.each(["first", "second"] as const)(
	"cancels the %s waiter without cancelling another waiter for the same fetch",
	async (cancelled) => {
		const gate = gatedFetch();
		const test = fixture(gate.fetchWithPolicy);
		const caller = new AbortController();
		const first = test.scope.resolve("./shared.js", entryId, {
			...(cancelled === "first" ? { signal: caller.signal } : {}),
		});
		const second = test.scope.resolve("./shared.js", entryId, {
			...(cancelled === "second" ? { signal: caller.signal } : {}),
		});
		const denied = rejection(cancelled === "first" ? first : second, "aborted");
		const survivor = cancelled === "first" ? second : first;
		await flushSettlement();
		expect(gate.requests).toHaveLength(1);
		caller.abort();
		await denied;
		expect(gate.requests[0].signal.aborted).toBe(false);
		gate.requests[0].pending.resolve(response(gate.requests[0].url));
		await expect(survivor).resolves.toEqual({
			id: "https://page.example/modules/shared.js",
			source: dependencySource,
		});
		await expect(
			test.scope.resolve("./shared.js", entryId, {}),
		).resolves.toMatchObject({
			source: dependencySource,
		});
		expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
	},
);

it("denies a pre-aborted caller without poisoning a later request", async () => {
	const test = fixture();
	const caller = new AbortController();
	caller.abort();
	await rejection(
		test.scope.resolve("./shared.js", entryId, { signal: caller.signal }),
		"aborted",
	);
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
	await expect(
		test.scope.resolve("./shared.js", entryId, {}),
	).resolves.toMatchObject({
		source: dependencySource,
	});
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("denies cached and new resolutions plus entry validation after scope revocation", async () => {
	const test = fixture();
	await test.scope.resolve("./cached.js", entryId, {});
	test.owner.abort();
	for (const specifier of [entryId, "./cached.js", "./new.js", "package"]) {
		await rejection(test.scope.resolve(specifier, entryId, {}), "aborted");
	}
	failure(() => test.scope.validateEntry(entrySource, entryId), "aborted");
	expect(test.fetchWithPolicy).toHaveBeenCalledTimes(1);
});

it("rejects creating a scope with an already-aborted owner", () => {
	const test = fixture();
	test.owner.abort();
	failure(
		() =>
			test.registry.createScope(
				test.owner.signal,
				pageSourceModuleLimits.sourceCodeUnits,
			),
		"aborted",
	);
	expect(test.fetchWithPolicy).not.toHaveBeenCalled();
});

it("resolves dependencies through native policy-fetch redirects and CORS checks", async () => {
	const target = "https://cdn.example/module.js";
	const request = vi.fn(
		async (input: NetworkRequest): Promise<NetworkResponse> => {
			if (input.url === "https://page.example/modules/redirect.js")
				return response(input.url, "", {
					status: 302,
					headers: { Location: [target] },
				}).response;
			return response(target, dependencySource, {
				headers: {
					"Content-Type": ["text/javascript"],
					"Access-Control-Allow-Origin": ["https://page.example"],
				},
			}).response;
		},
	);
	const checkContentSecurityPolicy = vi.fn();
	const test = fixture((url, policy, signal) =>
		fetchScriptResource(url, policy, {
			documentUrl,
			signal,
			maxRedirects: 2,
			request,
			checkContentSecurityPolicy,
		}),
	);
	await expect(
		test.scope.resolve("./redirect.js", entryId, {}),
	).resolves.toEqual({
		id: target,
		source: dependencySource,
	});
	expect(request).toHaveBeenCalledTimes(2);
	expect(checkContentSecurityPolicy.mock.calls).toEqual([
		["https://page.example/modules/redirect.js", 0],
		["https://page.example/modules/redirect.js", 0],
		[target, 1],
		[target, 1],
	]);
	expect(request.mock.calls[1][0]).toMatchObject({
		url: target,
		method: "GET",
		redirect: "manual",
		headers: { origin: "https://page.example" },
		cookieContext: { credentials: "omit" },
	});
	await test.scope.resolve("./redirect.js", entryId, {});
	expect(request).toHaveBeenCalledTimes(2);
	test.owner.abort();
});

it.each(["cors", "csp"] as const)(
	"preserves native policy-fetch %s denial without repeating a dependency request",
	async (failureKind) => {
		const target = "https://cdn.example/denied.js";
		const request = vi.fn(async () => response(target).response);
		const test = fixture((url, policy, signal) =>
			fetchScriptResource(url, policy, {
				documentUrl,
				signal,
				maxRedirects: 2,
				request,
				checkContentSecurityPolicy() {
					if (failureKind === "csp")
						throw new AgentBrowserError("policy-denied", "Mock CSP denied");
				},
			}),
		);
		await rejection(test.scope.resolve(target, entryId, {}), "policy-denied");
		await rejection(test.scope.resolve(target, entryId, {}), "policy-denied");
		expect(request).toHaveBeenCalledTimes(failureKind === "csp" ? 0 : 1);
		test.owner.abort();
	},
);
