import { getEventListeners } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { bindDocumentResourceCsp } from "./document-resource-csp.js";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { PageAbortSignals } from "./page-abort-signals.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTextResponse,
	type PageFetchTransport,
} from "./page-fetch.js";
import { claimResponseAccounting } from "./response-byte-accounting.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

const owners: PageFetch[] = [];
const trees: DocumentTree[] = [];
const registries: PageAbortSignals[] = [];

afterEach(() => {
	for (const owner of owners.splice(0)) {
		owner.close();
		expect(owner.metrics()).toMatchObject({
			closed: true,
			active: 0,
			retainedBytes: 0,
		});
	}
	for (const registry of registries.splice(0)) registry.close();
	for (const tree of trees.splice(0)) tree.close();
	if (vi.isFakeTimers()) expect(vi.getTimerCount()).toBe(0);
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function response(
	input: NetworkRequest,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url: input.url,
		status: 200,
		headers: {
			"content-type": ["text/plain"],
			"x-visible": ["value"],
			"set-cookie": ["private=fixture"],
			"set-cookie2": ["private2=fixture"],
		},
		body: new TextEncoder().encode("data"),
		redirects: [],
		encodedBytes: 4,
		elapsedMs: 0,
		...overrides,
	};
}

function fixture(
	handler: PageFetchTransport = async (input) => response(input),
	limits: Partial<PageFetchLimits> = {},
	csp?: string,
) {
	vi.useFakeTimers();
	const tree = new DocumentTree("https://fixture.example/page");
	trees.push(tree);
	if (csp) bindDocumentResourceCsp(tree, { "content-security-policy": [csp] });
	const createHostObject = vi.fn((definition: ScriptHostObjectDefinition) => {
		const result = { ...definition.methods };
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(result, name, descriptor);
		return result;
	});
	const signals = new PageAbortSignals(tree, { createHostObject });
	registries.push(signals);
	const request = vi.fn(handler);
	const owner = new PageFetch(tree, { createHostObject }, request, {
		limits,
		signals,
	});
	owners.push(owner);
	return { owner, tree, request, signals, createHostObject };
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function unreadable(result: PageFetchTextResponse, headers = result.headers) {
	for (const field of [
		"url",
		"status",
		"statusText",
		"headers",
		"text",
	] as const)
		expect(() => result[field]).toThrow();
	expect(() => headers["x-visible"]).toThrow();
	expect(() => Object.keys(headers)).toThrow();
	expect(() =>
		Object.getOwnPropertyDescriptor(headers, "content-type"),
	).toThrow();
	expect(() => result.release()).not.toThrow();
}

it("returns a native readonly text view using filtered headers and no host capabilities", async () => {
	const bytes = new TextEncoder().encode("héllo");
	const test = fixture(async (input) =>
		response(input, { body: bytes, status: 201 }),
	);
	const result = await test.owner.requestText("/data#fragment");
	expect(result.url).toBe("https://fixture.example/data");
	expect(result.status).toBe(201);
	expect(result.statusText).toBe("");
	expect(result.text).toBe("héllo");
	expect(result.headers).toEqual({
		"content-type": "text/plain",
		"x-visible": "value",
	});
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.headers)).toBe(true);
	expect(Reflect.set(result, "status", 0)).toBe(false);
	expect(Reflect.set(result.headers, "x-visible", "altered")).toBe(false);
	expect(test.createHostObject).not.toHaveBeenCalled();
	bytes.fill(0);
	expect(result.text).toBe("héllo");
	expect(test.owner.metrics()).toMatchObject({
		responses: 1,
		retainedBytes: 6,
		totalBytes: 6,
	});
	const headers = result.headers;
	result.release();
	result.release();
	unreadable(result, headers);
	expect(test.owner.metrics()).toMatchObject({
		responses: 1,
		retainedBytes: 0,
	});
});

it.each(["release", "owner", "document", "abort"])(
	"revokes previously obtained metadata/header views on %s",
	async (action) => {
		const test = fixture();
		const controller = new AbortController();
		const result = await test.owner.requestText(
			"/data",
			undefined,
			controller.signal,
		);
		const headers = result.headers;
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
		if (action === "release") result.release();
		else if (action === "owner") test.owner.close();
		else if (action === "document") test.tree.close();
		else controller.abort(new Error("native-abort"));
		unreadable(result, headers);
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		expect(test.owner.metrics().retainedBytes).toBe(0);
	},
);

it.each([
	{ method: "HEAD", status: 200 },
	{ method: "GET", status: 204 },
	{ method: "GET", status: 205 },
	{ method: "GET", status: 304 },
])(
	"cancels metadata of bodyless $method/$status responses",
	async ({ method, status }) => {
		const test = fixture(async (input) => response(input, { status }));
		const controller = new AbortController();
		const result = await test.owner.requestText(
			"/empty",
			{ method },
			controller.signal,
		);
		const headers = result.headers;
		expect(result.text).toBe("");
		expect(test.owner.metrics().retainedBytes).toBe(0);
		controller.abort();
		unreadable(result, headers);
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	},
);

it("fails an already aborted native request without provider work or subscriptions", async () => {
	const test = fixture();
	const controller = new AbortController();
	const reason = new Error("cancelled-before-start");
	controller.abort(reason);
	await expect(
		test.owner.requestText("/data", undefined, controller.signal),
	).rejects.toBe(reason);
	expect(test.request).not.toHaveBeenCalled();
	expect(test.owner.metrics()).toMatchObject({
		requests: 0,
		responses: 0,
		active: 0,
	});
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it.each(["resolve", "reject"])(
	"cancels a pending provider and preserves late %s accounting",
	async (outcome) => {
		const pending = deferred<NetworkResponse>();
		const test = fixture(() => pending.promise, { maxPending: 1 });
		const controller = new AbortController();
		const reason = new Error("pending-abort");
		const result = test.owner
			.requestText("/data", undefined, controller.signal)
			.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(0);
		const input = test.request.mock.calls[0][0];
		controller.abort(reason);
		expect(await result).toBe(reason);
		expect(input.signal?.aborted).toBe(true);
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
		expect(test.owner.metrics()).toMatchObject({
			active: 0,
			retainedBytes: 0,
			responseAccounting: { outstanding: 0, unmeteredFailures: 1 },
		});
		expect(test.request).toHaveBeenCalledTimes(1);
		test.request.mockImplementation(async (next) => response(next));
		const recovered = (await test.owner.fetch("/recovered")) as {
			text(): Promise<string>;
		};
		expect(await recovered.text()).toBe("data");
		if (outcome === "resolve") pending.resolve(response(input));
		else pending.reject(new Error("late-provider-failure"));
		await vi.advanceTimersByTimeAsync(0);
		expect(test.owner.metrics()).toMatchObject({
			responses: 1,
			retainedBytes: 0,
			responseAccounting: {
				outstanding: 0,
				completedOnlyBytes: outcome === "resolve" ? 8 : 4,
				unmeteredFailures: 1,
			},
		});
	},
);

it("retains a claimed late provider lease after close until the provider settles", async () => {
	const pending = deferred<NetworkResponse>();
	let finish = () => {};
	const test = fixture(
		(input) => {
			const writer = claimResponseAccounting(input.responseAccounting);
			expect(writer.debit("decodedBytes", 4)).toBe(true);
			finish = () => writer.finish();
			return pending.promise;
		},
		{ maxPending: 1 },
	);
	const controller = new AbortController();
	const result = test.owner
		.requestText("/data", undefined, controller.signal)
		.catch((error: unknown) => error);
	await vi.advanceTimersByTimeAsync(0);
	const reason = new Error("native-claimed-abort");
	controller.abort(reason);
	expect(await result).toBe(reason);
	await expect(test.owner.fetch("/draining")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.request).toHaveBeenCalledTimes(1);
	test.tree.close();
	expect(test.owner.metrics().responseAccounting).toMatchObject({
		closed: true,
		draining: 1,
		observedDecodedBytes: 4,
	});
	finish();
	pending.resolve(response(test.request.mock.calls[0][0]));
	await vi.advanceTimersByTimeAsync(0);
	expect(test.owner.metrics()).toMatchObject({
		retainedBytes: 0,
		responseAccounting: {
			draining: 0,
			outstanding: 0,
			observedDecodedBytes: 4,
		},
	});
});

it("native abort and release do not cancel independent native or guest siblings", async () => {
	const test = fixture();
	const controller = new AbortController();
	const first = await test.owner.requestText(
		"/first",
		undefined,
		controller.signal,
	);
	const headers = first.headers;
	const second = await test.owner.requestText("/second");
	const guest = (await test.owner.fetch("/guest")) as {
		text(): Promise<string>;
	};
	controller.abort();
	unreadable(first, headers);
	expect(second.text).toBe("data");
	expect(await guest.text()).toBe("data");
	expect(test.owner.metrics().retainedBytes).toBe(4);
	second.release();
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it("uses identical CORS response filtering to ordinary fetch", async () => {
	const test = fixture(async (input) =>
		response(input, {
			headers: {
				"access-control-allow-origin": ["https://fixture.example"],
				"access-control-expose-headers": ["x-visible, set-cookie"],
				"content-type": ["text/plain"],
				"x-visible": ["yes"],
				"x-private": ["hidden"],
				"set-cookie": ["secret=fixture"],
			},
		}),
	);
	const result = await test.owner.requestText("https://other.example/data");
	const guest = (await test.owner.fetch("https://other.example/data")) as {
		headers: { get(name: string): string | null };
	};
	expect(result.headers).toEqual({
		"content-type": "text/plain",
		"x-visible": "yes",
	});
	for (const name of ["content-type", "x-visible", "x-private", "set-cookie"])
		expect(result.headers[name] ?? null).toBe(guest.headers.get(name));
	expect(test.request.mock.calls[0][0].cookieContext?.credentials).toBe("omit");
});

it("denies CORS failures and detaches the native signal without publishing a response", async () => {
	const test = fixture();
	const controller = new AbortController();
	await expect(
		test.owner.requestText(
			"https://other.example/data",
			undefined,
			controller.signal,
		),
	).rejects.toThrow();
	expect(test.owner.metrics()).toMatchObject({
		responses: 0,
		retainedBytes: 0,
		active: 0,
	});
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	expect(test.createHostObject).not.toHaveBeenCalled();
});

it.each([true, false])(
	"uses the existing credentialed CORS preflight path, allowed=%s",
	async (grant) => {
		const test = fixture(async (input) =>
			response(input, {
				headers: {
					"access-control-allow-origin": ["https://fixture.example"],
					"access-control-allow-credentials": ["true"],
					"access-control-allow-methods": [grant ? "PUT" : "GET"],
					"access-control-allow-headers": ["x-test"],
				},
			}),
		);
		const result = test.owner.requestText("https://other.example/data", {
			method: "PUT",
			headers: { "x-test": "yes" },
			body: "payload",
			credentials: "include",
		});
		if (grant) expect((await result).text).toBe("data");
		else await expect(result).rejects.toThrow();
		expect(test.request.mock.calls.map(([input]) => input.method)).toEqual(
			grant ? ["OPTIONS", "PUT"] : ["OPTIONS"],
		);
		expect(test.request.mock.calls[0][0].cookieContext?.credentials).toBe(
			"omit",
		);
		if (grant)
			expect(test.request.mock.calls[1][0].cookieContext?.credentials).toBe(
				"include",
			);
	},
);

it.each(["http://fixture.example/data", "https://other.example/data"])(
	"does not bypass mixed-content or connect-src for %s",
	async (url) => {
		const test = fixture(
			undefined,
			{},
			"default-src 'none'; connect-src 'self'",
		);
		await expect(test.owner.requestText(url)).rejects.toMatchObject({
			code: "policy-denied",
		});
		expect(test.request).not.toHaveBeenCalled();
	},
);

it("shares same-origin mode, request header restrictions and redirect credential/body handling", async () => {
	const test = fixture(async (input) =>
		response(
			input,
			input.url.startsWith("https://fixture.example")
				? {
						status: 302,
						headers: { location: ["https://other.example/final"] },
					}
				: {
						headers: {
							"access-control-allow-origin": ["https://fixture.example"],
						},
					},
		),
	);
	await expect(
		test.owner.requestText("https://other.example/data", {
			mode: "same-origin",
		}),
	).rejects.toMatchObject({ code: "policy-denied" });
	const result = await test.owner.requestText("/start", {
		method: "POST",
		body: "payload",
		headers: {
			authorization: "fixture",
			cookie: "forbidden=fixture",
			"content-type": "text/plain",
		},
	});
	expect(result.url).toBe("https://other.example/final");
	const [initial, redirected] = test.request.mock.calls.map(([input]) => input);
	expect(initial.headers?.cookie).toBeUndefined();
	expect(redirected).toMatchObject({
		method: "GET",
		cookieContext: { credentials: "omit" },
	});
	expect(redirected.body).toBeUndefined();
	expect(redirected.headers?.authorization).toBeUndefined();
	expect(redirected.headers?.["content-type"]).toBeUndefined();
});

it("keeps manual redirects opaque and error redirects rejected", async () => {
	const test = fixture(async (input) =>
		response(input, {
			status: 302,
			headers: { location: ["/next"], "x-visible": ["hidden"] },
		}),
	);
	const result = await test.owner.requestText("/start", { redirect: "manual" });
	expect({
		url: result.url,
		status: result.status,
		text: result.text,
		headers: result.headers,
	}).toEqual({ url: "", status: 0, text: "", headers: {} });
	await expect(
		test.owner.requestText("/start", { redirect: "error" }),
	).rejects.toThrow();
	expect(test.request).toHaveBeenCalledTimes(2);
});

it.each(["maxRequests", "maxResponses"] as const)(
	"shares cumulative %s with guest fetch",
	async (limit) => {
		const test = fixture(undefined, { [limit]: 1 });
		const native = await test.owner.requestText("/native");
		native.release();
		await expect(test.owner.fetch("/guest")).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.owner.metrics().responses).toBe(1);
	},
);

it("shares retained byte limits in both directions until native release or guest consumption", async () => {
	const test = fixture(undefined, { maxRetainedBytes: 4 });
	const native = await test.owner.requestText("/native");
	await expect(test.owner.fetch("/guest")).rejects.toMatchObject({
		code: "resource-limit",
	});
	native.release();
	const guest = (await test.owner.fetch("/guest")) as {
		text(): Promise<string>;
	};
	await expect(test.owner.requestText("/native")).rejects.toMatchObject({
		code: "resource-limit",
	});
	await guest.text();
	expect((await test.owner.requestText("/native")).text).toBe("data");
});

it.each(["maxResponseBytes", "maxTotalBytes"] as const)(
	"shares %s and does not erase cumulative bytes on release",
	async (limit) => {
		const test = fixture(undefined, { [limit]: 3 });
		await expect(test.owner.requestText("/native")).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.owner.metrics().retainedBytes).toBe(0);
		const capped = fixture(undefined, { maxTotalBytes: 4 });
		const native = await capped.owner.requestText("/native");
		native.release();
		await expect(capped.owner.fetch("/guest")).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(capped.request).toHaveBeenCalledTimes(1);
	},
);

it("shares pending and request-body limits", async () => {
	const pending = deferred<NetworkResponse>();
	const test = fixture(() => pending.promise, {
		maxPending: 1,
		maxRequestBytes: 3,
	});
	await expect(
		test.owner.requestText("/data", { method: "POST", body: "four" }),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).not.toHaveBeenCalled();
	const native = test.owner.requestText("/data");
	await vi.advanceTimersByTimeAsync(0);
	await expect(test.owner.fetch("/guest")).rejects.toMatchObject({
		code: "resource-limit",
	});
	pending.resolve(response(test.request.mock.calls[0][0]));
	expect((await native).text).toBe("data");
});

it("uses the same deadline and preserves late settlement", async () => {
	const pending = deferred<NetworkResponse>();
	const test = fixture(() => pending.promise, { timeoutMs: 5 });
	const native = test.owner
		.requestText("/data")
		.catch((error: unknown) => error);
	await vi.advanceTimersByTimeAsync(5);
	expect(await native).toMatchObject({ code: "timeout" });
	expect(test.owner.metrics().responseAccounting).toMatchObject({
		outstanding: 0,
		unmeteredFailures: 1,
	});
	pending.resolve(response(test.request.mock.calls[0][0]));
	await vi.advanceTimersByTimeAsync(0);
	expect(test.owner.metrics().responseAccounting.outstanding).toBe(0);
});

it.each(["preflight", "redirect"])(
	"does not dispatch a later hop after native abort during %s",
	async (phase) => {
		const pending = deferred<NetworkResponse>();
		const test = fixture(() => pending.promise);
		const controller = new AbortController();
		const reason = new Error("stop-before-next-hop");
		const result = test.owner
			.requestText(
				phase === "preflight" ? "https://other.example/data" : "/start",
				phase === "preflight" ? { method: "PUT", body: "data" } : undefined,
				controller.signal,
			)
			.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(0);
		controller.abort(reason);
		expect(await result).toBe(reason);
		const input = test.request.mock.calls[0][0];
		pending.resolve(
			response(input, {
				status: phase === "redirect" ? 302 : 200,
				headers: {
					location: ["/next"],
					"access-control-allow-origin": ["https://fixture.example"],
					"access-control-allow-methods": ["PUT"],
				},
			}),
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(test.request).toHaveBeenCalledTimes(1);
		expect(test.owner.metrics()).toMatchObject({
			responses: 0,
			active: 0,
			retainedBytes: 0,
		});
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	},
);

it("never treats a native signal in guest init or a guest handle as a native signal", async () => {
	const test = fixture();
	const controller = new AbortController();
	const guestSignal = test.signals.publish(controller.signal);
	await expect(
		test.owner.fetch("/data", { signal: controller.signal }),
	).rejects.toThrow();
	await expect(
		test.owner.requestText("/data", { signal: controller.signal }),
	).rejects.toThrow();
	await expect(
		test.owner.requestText("/data", undefined, guestSignal as AbortSignal),
	).rejects.toThrow();
	expect(test.request).not.toHaveBeenCalled();
	const native = await test.owner.requestText("/data", { signal: guestSignal });
	const headers = native.headers;
	controller.abort();
	unreadable(native, headers);
});

it("rejects forged/proxied native signals without invoking their getters or traps", async () => {
	const test = fixture();
	const inspect = vi.fn(() => {
		throw new Error("must-not-inspect");
	});
	const forged = Object.create(AbortSignal.prototype, {
		aborted: { get: inspect },
		reason: { get: inspect },
		addEventListener: { get: inspect },
	});
	const proxy = new Proxy(new AbortController().signal, {
		get: inspect,
		getPrototypeOf: inspect,
	});
	for (const signal of [forged, proxy, {}, null, 42])
		await expect(
			test.owner.requestText("/data", undefined, signal as AbortSignal),
		).rejects.toThrow();
	expect(inspect).not.toHaveBeenCalled();
	expect(test.request).not.toHaveBeenCalled();
});

it("uses native signal intrinsics rather than overridden instance accessors", async () => {
	const test = fixture();
	const controller = new AbortController();
	const inspect = vi.fn(() => {
		throw new Error("must-not-inspect");
	});
	for (const name of [
		"aborted",
		"reason",
		"addEventListener",
		"removeEventListener",
	])
		Object.defineProperty(controller.signal, name, { get: inspect });
	const result = await test.owner.requestText(
		"/data",
		undefined,
		controller.signal,
	);
	const headers = result.headers;
	controller.abort();
	unreadable(result, headers);
	expect(inspect).not.toHaveBeenCalled();
});

it("does not coerce guest-style response handles or URL getters as request inputs", async () => {
	const test = fixture();
	const inspect = vi.fn(() => {
		throw new Error("must-not-inspect");
	});
	await expect(
		test.owner.requestText({
			toString: inspect,
			get url() {
				return inspect();
			},
		}),
	).rejects.toThrow();
	expect(inspect).not.toHaveBeenCalled();
	expect(test.request).not.toHaveBeenCalled();
});
