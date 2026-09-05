import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { PageAbortSignals } from "./page-abort-signals.js";
import {
	type PageBindingContext,
	type PageBindingLifecycle,
	PageBindings,
} from "./page-bindings.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
import {
	type ResponseAccountingWriter,
	claimResponseAccounting,
} from "./response-byte-accounting.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

interface ResponseFixture {
	status: number;
	ok: boolean;
	url: string;
	type: string;
	redirected: boolean;
	bodyUsed: boolean;
	headers: { get(name: string): string | null };
	text(): Promise<string>;
	json(): Promise<unknown>;
	clone(): ResponseFixture;
}

const owners: PageFetch[] = [];
const bindingOwners: PageBindings[] = [];
const registries: PageAbortSignals[] = [];
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const bindings of bindingOwners.splice(0)) bindings.close();
	for (const owner of owners.splice(0)) owner.close();
	for (const registry of registries.splice(0)) registry.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function hostObject(definition: ScriptHostObjectDefinition): object {
	const capability = { ...definition.methods };
	for (const [name, descriptor] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(capability, name, descriptor);
	return capability;
}

function response(
	input: NetworkRequest,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url: input.url,
		status: 200,
		headers: { "content-type": ["text/plain"] },
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
	withRegistry = true,
) {
	vi.useFakeTimers();
	const tree = new DocumentTree("https://fixture.invalid/page");
	trees.push(tree);
	let implementation = hostObject;
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			return implementation(definition);
		},
	};
	const signals = new PageAbortSignals(tree, factory);
	registries.push(signals);
	const request = vi.fn(handler);
	const owner = new PageFetch(tree, factory, request, {
		limits,
		...(withRegistry ? { signals } : {}),
	});
	owners.push(owner);
	const fetch = async (input = "/data", init?: unknown) =>
		(await owner.fetch(input, init)) as ResponseFixture;
	return {
		tree,
		signals,
		owner,
		request,
		fetch,
		setFactory(next: typeof hostObject) {
			implementation = next;
		},
	};
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

function bindingFixture(
	handler: PageFetchTransport = async (input) => response(input),
) {
	vi.useFakeTimers();
	const document = new DocumentTree("https://fixture.invalid/page");
	trees.push(document);
	const page = { document, interactions: new DocumentInteractions(document) };
	const context: PageBindingContext = {
		createHostObject: hostObject,
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: vi.fn(),
	};
	const lifecycle: PageBindingLifecycle = {
		isClosed: () => false,
		startCallback: vi.fn((callback, args, options) => {
			if (typeof callback !== "function")
				throw new Error("Expected fixture callback");
			return {
				synchronous: Promise.resolve(),
				result: Promise.resolve(callback.apply(options.thisValue, args)),
			};
		}),
		fail: vi.fn(),
		onConsoleCall: vi.fn(),
	};
	const signals = new PageAbortSignals(document, context);
	registries.push(signals);
	const request = vi.fn(handler);
	return {
		signals,
		request,
		build(fetchSignals = signals) {
			const bindings = new PageBindings(page, context, lifecycle, {
				fetch: request,
				fetchSignals,
			});
			bindingOwners.push(bindings);
			const window = bindings.window as {
				fetch(input: unknown, init?: unknown): Promise<ResponseFixture>;
			};
			const globalFetch = bindings.globals.fetch as typeof window.fetch;
			return { bindings, window, globalFetch };
		},
	};
}

async function flushSettlement() {
	for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

it("rejects native, forged and foreign-owner signals without inspecting their members", async () => {
	const test = fixture();
	const foreign = fixture();
	const controller = new AbortController();
	const read = vi.fn(() => {
		throw new Error("Signal members must not be inspected");
	});
	const forged = Object.defineProperties(
		{},
		{
			aborted: { get: read },
			reason: { get: read },
			subscribe: { get: read },
		},
	);
	for (const signal of [
		controller.signal,
		{},
		forged,
		foreign.signals.publish(controller.signal),
	])
		await expect(test.fetch("/data", { signal })).rejects.toThrow();
	expect(read).not.toHaveBeenCalled();
	expect(test.request).not.toHaveBeenCalled();
	expect(test.owner.metrics()).toMatchObject({ requests: 0, active: 0 });
	expect(test.signals.metrics().subscriptions).toBe(0);
});

it("keeps nonnull signals unsupported without a registry and accepts null or absent signals", async () => {
	const test = fixture(undefined, {}, false);
	const controller = new AbortController();
	for (const signal of [
		controller.signal,
		test.signals.publish(controller.signal),
	])
		await expect(test.fetch("/data", { signal })).rejects.toThrow();
	expect(test.request).not.toHaveBeenCalled();
	for (const init of [undefined, {}, { signal: undefined }, { signal: null }])
		expect(await (await test.fetch("/data", init)).text()).toBe("data");
	expect(test.request).toHaveBeenCalledTimes(4);
});

it.each(["error", "object", "null", "string", "default"])(
	"rejects a pre-aborted %s reason by identity without consuming request or accounting quotas",
	async (kind) => {
		const test = fixture(undefined, { maxRequests: 1, maxPending: 1 });
		const controller = new AbortController();
		const reasons: Record<string, unknown> = {
			error: new Error("cancelled before admission"),
			object: { cancelled: true },
			null: null,
			string: "cancelled",
		};
		controller.abort(reasons[kind]);
		const signal = test.signals.publish(controller.signal);
		await expect(test.fetch("/data", { signal })).rejects.toBe(
			controller.signal.reason,
		);
		expect(test.request).not.toHaveBeenCalled();
		expect(test.owner.metrics()).toMatchObject({
			requests: 0,
			active: 0,
			responses: 0,
			retainedBytes: 0,
			totalBytes: 0,
			responseAccounting: {
				outstanding: 0,
				completedOnlyBytes: 0,
				unmeteredFailures: 0,
			},
		});
		expect(test.signals.metrics().subscriptions).toBe(0);
		expect(await (await test.fetch()).text()).toBe("data");
	},
);

it.each(["resolve", "reject"])(
	"cancels an ignoring transport, recovers pending capacity and accounts its late %s",
	async (outcome) => {
		const pending = deferred<NetworkResponse>();
		const started = deferred<NetworkRequest>();
		const test = fixture(
			(input) => {
				started.resolve(input);
				return pending.promise;
			},
			{ maxPending: 1, maxTotalBytes: 8, maxResponseBytes: 4 },
		);
		const controller = new AbortController();
		const reason = { cancelled: "in flight" };
		const signal = test.signals.publish(controller.signal);
		const rejected = expect(test.fetch("/slow", { signal })).rejects.toBe(
			reason,
		);
		const input = await started.promise;
		expect(input.signal).not.toBe(controller.signal);
		expect(input.signal?.aborted).toBe(false);
		await expect(test.fetch("/blocked")).rejects.toMatchObject({
			code: "resource-limit",
		});
		controller.abort(reason);
		await rejected;
		expect(input.signal?.reason).toBe(reason);
		expect(input.signal?.aborted).toBe(true);
		expect(test.signals.metrics().subscriptions).toBe(0);
		expect(test.owner.metrics()).toMatchObject({
			active: 0,
			retainedBytes: 0,
			responseAccounting: { outstanding: 0, unmeteredFailures: 1 },
		});
		test.request.mockImplementation(async (next) => response(next));
		expect(await (await test.fetch("/recovered")).text()).toBe("data");
		if (outcome === "resolve") pending.resolve(response(input));
		else pending.reject(new Error("late provider rejection"));
		await flushSettlement();
		expect(test.owner.metrics()).toMatchObject({
			active: 0,
			responses: 1,
			retainedBytes: 0,
			totalBytes: 4,
			responseAccounting: {
				completedOnlyBytes: outcome === "resolve" ? 8 : 4,
				completedOnlyRequests: outcome === "resolve" ? 2 : 1,
				unmeteredFailures: 1,
				outstanding: 0,
			},
		});
		if (outcome === "resolve") {
			await expect(test.fetch("/exhausted")).rejects.toMatchObject({
				code: "resource-limit",
			});
			expect(test.request).toHaveBeenCalledTimes(2);
		}
	},
);

it("keeps claimed accounting draining after cancellation until the writer finishes", async () => {
	const pending = deferred<NetworkResponse>();
	const started = deferred<ResponseAccountingWriter>();
	const test = fixture(
		(input) => {
			started.resolve(claimResponseAccounting(input.responseAccounting));
			return pending.promise;
		},
		{ maxPending: 1 },
	);
	const controller = new AbortController();
	const reason = new Error("cancel metered request");
	const rejected = expect(
		test.fetch("/slow", {
			signal: test.signals.publish(controller.signal),
		}),
	).rejects.toBe(reason);
	const writer = await started.promise;
	expect(writer.debit("decodedBytes", 2)).toBe(true);
	controller.abort(reason);
	await rejected;
	expect(test.owner.metrics()).toMatchObject({
		active: 0,
		responseAccounting: { outstanding: 1, draining: 1 },
	});
	expect(test.signals.metrics().subscriptions).toBe(0);
	await expect(test.fetch("/blocked")).rejects.toMatchObject({
		code: "resource-limit",
	});
	pending.resolve(response(test.request.mock.calls[0][0]));
	await flushSettlement();
	expect(test.owner.metrics().responseAccounting).toMatchObject({
		outstanding: 1,
		draining: 1,
		completedOnlyBytes: 2,
		completedOnlyRequests: 1,
	});
	writer.finish();
	test.request.mockImplementation(async (input) => response(input));
	expect(await (await test.fetch("/recovered")).text()).toBe("data");
	expect(test.owner.metrics().responseAccounting).toMatchObject({
		outstanding: 0,
		draining: 0,
		observedDecodedBytes: 2,
		completedOnlyBytes: 6,
		completedOnlyRequests: 2,
	});
});

it.each(["preflight", "redirect"])(
	"cancels during %s without dispatching a later hop after late completion",
	async (phase) => {
		const pending = deferred<NetworkResponse>();
		const started = deferred<NetworkRequest>();
		const test = fixture((input) => {
			started.resolve(input);
			return pending.promise;
		});
		const controller = new AbortController();
		const reason = new Error(`cancel ${phase}`);
		const signal = test.signals.publish(controller.signal);
		const rejected = expect(
			test.fetch(
				phase === "preflight" ? "https://other.invalid/data" : "/start",
				{ signal, ...(phase === "preflight" ? { method: "PUT" } : {}) },
			),
		).rejects.toBe(reason);
		const input = await started.promise;
		expect(input.method).toBe(phase === "preflight" ? "OPTIONS" : "GET");
		controller.abort(reason);
		await rejected;
		pending.resolve(
			response(
				input,
				phase === "preflight"
					? {
							status: 204,
							body: new Uint8Array(),
							encodedBytes: 0,
							headers: {
								"access-control-allow-origin": ["https://fixture.invalid"],
								"access-control-allow-methods": ["PUT"],
							},
						}
					: {
							status: 302,
							headers: { location: ["/next"] },
						},
			),
		);
		await flushSettlement();
		expect(test.request).toHaveBeenCalledOnce();
		expect(test.signals.metrics().subscriptions).toBe(0);
		expect(test.owner.metrics()).toMatchObject({
			active: 0,
			responses: 0,
			retainedBytes: 0,
			responseAccounting: { outstanding: 0 },
		});
	},
);

it("cancels an in-flight redirected request using the original source", async () => {
	const pending = deferred<NetworkResponse>();
	const started = deferred<NetworkRequest>();
	const test = fixture(async (input) => {
		if (input.url.endsWith("/start"))
			return response(input, { status: 302, headers: { location: ["/next"] } });
		started.resolve(input);
		return pending.promise;
	});
	const controller = new AbortController();
	const reason = new Error("cancel redirected transport");
	const rejected = expect(
		test.fetch("/start", {
			signal: test.signals.publish(controller.signal),
		}),
	).rejects.toBe(reason);
	const input = await started.promise;
	expect(input.url).toBe("https://fixture.invalid/next");
	controller.abort(reason);
	await rejected;
	expect(input.signal?.reason).toBe(reason);
	pending.resolve(response(input));
	await flushSettlement();
	expect(test.request).toHaveBeenCalledTimes(2);
	expect(test.signals.metrics().subscriptions).toBe(0);
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it.each(["failure", "timeout", "fetch-close", "tree-close", "source-close"])(
	"releases subscriptions on %s and settles pending consumers",
	async (ending) => {
		const pending = deferred<NetworkResponse>();
		const started = deferred<NetworkRequest>();
		const test = fixture(
			(input) => {
				started.resolve(input);
				return pending.promise;
			},
			{ timeoutMs: 5 },
		);
		const controller = new AbortController();
		const failure = new Error("provider failed");
		const result = test.fetch("/pending", {
			signal: test.signals.publish(controller.signal),
		});
		const rejected =
			ending === "failure"
				? expect(result).rejects.toBe(failure)
				: expect(result).rejects.toMatchObject({
						code: ending === "timeout" ? "timeout" : "closed",
					});
		const input = await started.promise;
		expect(test.signals.metrics().subscriptions).toBe(1);
		if (ending === "failure") pending.reject(failure);
		else if (ending === "timeout") await vi.advanceTimersByTimeAsync(5);
		else if (ending === "fetch-close") test.owner.close();
		else if (ending === "tree-close") test.tree.close();
		else test.signals.close();
		await rejected;
		expect(test.signals.metrics().subscriptions).toBe(0);
		expect(test.owner.metrics()).toMatchObject({ active: 0, retainedBytes: 0 });
		expect(controller.signal.aborted).toBe(false);
		if (ending !== "failure") {
			expect(input.signal?.aborted).toBe(true);
			pending.resolve(response(input));
			await flushSettlement();
		}
		expect(test.owner.metrics().responseAccounting.outstanding).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("aborts shared-source requests without affecting an unrelated request", async () => {
	const first = deferred<NetworkResponse>();
	const second = deferred<NetworkResponse>();
	const independent = deferred<NetworkResponse>();
	const test = fixture((input) => {
		if (input.url.endsWith("/first")) return first.promise;
		if (input.url.endsWith("/second")) return second.promise;
		return independent.promise;
	});
	const controller = new AbortController();
	const otherController = new AbortController();
	const signal = test.signals.publish(controller.signal);
	const reason = { shared: true };
	const firstRejected = expect(test.fetch("/first", { signal })).rejects.toBe(
		reason,
	);
	const secondRejected = expect(test.fetch("/second", { signal })).rejects.toBe(
		reason,
	);
	const unrelated = test.fetch("/independent", {
		signal: test.signals.publish(otherController.signal),
	});
	await flushSettlement();
	expect(test.request).toHaveBeenCalledTimes(3);
	controller.abort(reason);
	await Promise.all([firstRejected, secondRejected]);
	expect(test.request.mock.calls[2][0].signal?.aborted).toBe(false);
	expect(test.owner.metrics().active).toBe(1);
	expect(test.signals.metrics().subscriptions).toBe(1);
	independent.resolve(response(test.request.mock.calls[2][0]));
	expect(await (await unrelated).text()).toBe("data");
	first.resolve(response(test.request.mock.calls[0][0]));
	second.resolve(response(test.request.mock.calls[1][0]));
	await flushSettlement();
	expect(test.signals.metrics().subscriptions).toBe(0);
	expect(test.owner.metrics()).toMatchObject({ active: 0, retainedBytes: 0 });
});

it("errors unread bodies and clones on abort while preserving response metadata", async () => {
	const test = fixture(undefined, { maxResponses: 3, maxRetainedBytes: 8 });
	const controller = new AbortController();
	const reason = { bodyCancelled: true };
	const result = await test.fetch("/data", {
		signal: test.signals.publish(controller.signal),
	});
	const clone = result.clone();
	expect(test.owner.metrics().retainedBytes).toBe(8);
	controller.abort(reason);
	expect(test.owner.metrics().retainedBytes).toBe(0);
	expect(test.signals.metrics().subscriptions).toBe(0);
	const erroredClone = clone.clone();
	expect(test.owner.metrics().responses).toBe(3);
	expect(() => clone.clone()).toThrow("retention");
	for (const body of [result, clone, erroredClone]) {
		expect(body).toMatchObject({
			status: 200,
			ok: true,
			url: "https://fixture.invalid/data",
			type: "basic",
			redirected: false,
			bodyUsed: false,
		});
		expect(body.headers.get("content-type")).toBe("text/plain");
		await expect(body === clone ? body.json() : body.text()).rejects.toBe(
			reason,
		);
		expect(body.bodyUsed).toBe(true);
		await expect(body.text()).rejects.toThrow("already consumed");
		expect(() => body.clone()).toThrow("already consumed");
		expect(body.status).toBe(200);
	}
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it("keeps consumed bodies consumed and retains cancellation only for unread clones", async () => {
	const test = fixture();
	const controller = new AbortController();
	const result = await test.fetch("/data", {
		signal: test.signals.publish(controller.signal),
	});
	const clone = result.clone();
	expect(await result.text()).toBe("data");
	expect(test.owner.metrics().retainedBytes).toBe(4);
	expect(test.signals.metrics().subscriptions).toBeGreaterThan(0);
	const reason = new Error("cancel unread clone");
	controller.abort(reason);
	await expect(result.text()).rejects.toThrow("already consumed");
	expect(result.bodyUsed).toBe(true);
	expect(clone.bodyUsed).toBe(false);
	await expect(clone.text()).rejects.toBe(reason);
	expect(test.signals.metrics().subscriptions).toBe(0);
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it("releases successful body subscriptions only when all retained clones are consumed", async () => {
	const test = fixture();
	const controller = new AbortController();
	const result = await test.fetch("/data", {
		signal: test.signals.publish(controller.signal),
	});
	const clone = result.clone();
	expect(await result.text()).toBe("data");
	expect(test.signals.metrics().subscriptions).toBeGreaterThan(0);
	expect(await clone.text()).toBe("data");
	expect(test.signals.metrics().subscriptions).toBe(0);
	expect(test.owner.metrics().retainedBytes).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
	controller.abort(new Error("after consumption"));
	await expect(result.text()).rejects.toThrow("already consumed");
	await expect(clone.text()).rejects.toThrow("already consumed");
});

it.each(["HEAD", "204", "205", "304", "manual"])(
	"keeps a %s null body repeatably readable and unused after abort",
	async (kind) => {
		const test = fixture(async (input) =>
			response(input, {
				status: kind === "HEAD" ? 200 : kind === "manual" ? 302 : Number(kind),
				...(kind === "manual" ? { headers: { location: ["/next"] } } : {}),
			}),
		);
		const controller = new AbortController();
		const result = await test.fetch("/data", {
			signal: test.signals.publish(controller.signal),
			...(kind === "HEAD" ? { method: "HEAD" } : {}),
			...(kind === "manual" ? { redirect: "manual" } : {}),
		});
		const clone = result.clone();
		expect(test.signals.metrics().subscriptions).toBe(0);
		controller.abort(new Error("no body to cancel"));
		for (const body of [result, clone, result.clone()]) {
			expect(await body.text()).toBe("");
			expect(await body.text()).toBe("");
			await expect(body.json()).rejects.toBeInstanceOf(SyntaxError);
			expect(body.bodyUsed).toBe(false);
		}
		expect(test.owner.metrics().retainedBytes).toBe(0);
	},
);

it("distinguishes an empty nonnull body from a null body when aborted", async () => {
	const test = fixture(async (input) =>
		response(input, {
			body: new Uint8Array(),
			encodedBytes: 0,
		}),
	);
	const controller = new AbortController();
	const reason = new Error("empty but cancellable");
	const result = await test.fetch("/data", {
		signal: test.signals.publish(controller.signal),
	});
	controller.abort(reason);
	await expect(result.text()).rejects.toBe(reason);
	expect(result.bodyUsed).toBe(true);
});

it("errors retained bodies when their source owner closes without aborting the native source", async () => {
	const test = fixture();
	const controller = new AbortController();
	const result = await test.fetch("/data", {
		signal: test.signals.publish(controller.signal),
	});
	const clone = result.clone();
	test.signals.close();
	expect(controller.signal.aborted).toBe(false);
	expect(test.owner.metrics()).toMatchObject({
		closed: false,
		retainedBytes: 0,
	});
	for (const body of [result, clone]) {
		expect(body.status).toBe(200);
		await expect(body.text()).rejects.toMatchObject({ code: "closed" });
		expect(body.bodyUsed).toBe(true);
	}
	expect(test.signals.metrics().subscriptions).toBe(0);
	expect(await (await test.fetch("/unrelated")).text()).toBe("data");
});

it.each(["throw", "alias", "close"])(
	"cleans up subscriptions and retention when response publication factories %s",
	async (action) => {
		const test = fixture();
		const controller = new AbortController();
		const signal = test.signals.publish(controller.signal);
		const shared = {};
		let publications = 0;
		test.setFactory((definition) => {
			publications++;
			if (action === "alias") return shared;
			if (definition.methods?.text) {
				if (action === "close") test.owner.close();
				else throw new Error("publication failure");
			}
			return hostObject(definition);
		});
		await expect(test.fetch("/data", { signal })).rejects.toThrow();
		expect(publications).toBeLessThanOrEqual(2);
		expect(test.signals.metrics().subscriptions).toBe(0);
		expect(test.owner.metrics()).toMatchObject({ active: 0, retainedBytes: 0 });
		expect(test.owner.metrics().responseAccounting.outstanding).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("keeps reentrant clones unpublished and bounded during response construction", async () => {
	const test = fixture(undefined, { maxResponses: 2, maxRetainedBytes: 8 });
	const controller = new AbortController();
	const signal = test.signals.publish(controller.signal);
	let attempts = 0;
	test.setFactory((definition) => {
		const capability = hostObject(definition);
		if (definition.methods?.clone) {
			attempts++;
			expect(() => (capability as ResponseFixture).clone()).toThrow(
				"published",
			);
		}
		return capability;
	});
	const result = await test.fetch("/data", { signal });
	const clone = result.clone();
	expect(attempts).toBe(2);
	expect(() => clone.clone()).toThrow("retention");
	expect(await result.text()).toBe("data");
	expect(await clone.text()).toBe("data");
	expect(test.owner.metrics()).toMatchObject({
		responses: 2,
		retainedBytes: 0,
	});
	expect(test.signals.metrics().subscriptions).toBe(0);
});

it.each(["headers", "response"])(
	"does not leak a body or subscription when the source aborts during %s publication",
	async (stage) => {
		const test = fixture();
		const controller = new AbortController();
		const signal = test.signals.publish(controller.signal);
		const reason = { publicationCancelled: stage };
		let publications = 0;
		test.setFactory((definition) => {
			publications++;
			if (
				(stage === "headers" && definition.methods?.get) ||
				(stage === "response" && definition.methods?.text)
			)
				controller.abort(reason);
			return hostObject(definition);
		});
		await expect(test.fetch("/data", { signal })).rejects.toBe(reason);
		expect(publications).toBeGreaterThan(0);
		expect(publications).toBeLessThanOrEqual(2);
		expect(test.signals.metrics().subscriptions).toBe(0);
		expect(test.owner.metrics()).toMatchObject({ active: 0, retainedBytes: 0 });
		expect(test.owner.metrics().responseAccounting.outstanding).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each(["fetch", "tree"])(
	"releases subscriptions for already returned bodies when the %s owner closes",
	async (owner) => {
		const test = fixture();
		const controller = new AbortController();
		const result = await test.fetch("/data", {
			signal: test.signals.publish(controller.signal),
		});
		const clone = result.clone();
		expect(test.signals.metrics().subscriptions).toBeGreaterThan(0);
		if (owner === "fetch") test.owner.close();
		else test.tree.close();
		expect(test.signals.metrics().subscriptions).toBe(0);
		expect(test.owner.metrics()).toMatchObject({
			closed: true,
			retainedBytes: 0,
		});
		expect(controller.signal.aborted).toBe(false);
		await expect(result.text()).rejects.toMatchObject({ code: "closed" });
		await expect(clone.text()).rejects.toMatchObject({ code: "closed" });
	},
);

it("wires the same approved signal capability through globals.fetch and window.fetch", async () => {
	const test = bindingFixture();
	const { bindings, window, globalFetch } = test.build();
	const controller = new AbortController();
	const signal = test.signals.publish(controller.signal);
	expect(bindings.globals.fetch).toBe(window.fetch);
	const globalResponse = await globalFetch("/global", { signal });
	const windowResponse = await window.fetch("/window", { signal });
	expect(test.request.mock.calls.map(([input]) => input.url)).toEqual([
		"https://fixture.invalid/global",
		"https://fixture.invalid/window",
	]);
	expect(await globalResponse.text()).toBe("data");
	expect(await windowResponse.text()).toBe("data");
	expect(test.signals.metrics()).toMatchObject({
		closed: false,
		subscriptions: 0,
	});
	expect(bindings.network?.metrics()).toMatchObject({
		requests: 2,
		active: 0,
		retainedBytes: 0,
	});
});

it("propagates source cancellation by identity through both binding fetch entry points", async () => {
	const globalPending = deferred<NetworkResponse>();
	const windowPending = deferred<NetworkResponse>();
	const test = bindingFixture((input) =>
		input.url.endsWith("/global")
			? globalPending.promise
			: windowPending.promise,
	);
	const { bindings, window, globalFetch } = test.build();
	const controller = new AbortController();
	const signal = test.signals.publish(controller.signal);
	const reason = { bindingCancelled: true };
	const globalRejected = expect(
		globalFetch("/global", { signal }),
	).rejects.toBe(reason);
	const windowRejected = expect(
		window.fetch("/window", { signal }),
	).rejects.toBe(reason);
	await flushSettlement();
	expect(test.request).toHaveBeenCalledTimes(2);
	controller.abort(reason);
	await Promise.all([globalRejected, windowRejected]);
	for (const [input] of test.request.mock.calls) {
		expect(input.signal?.aborted).toBe(true);
		expect(input.signal?.reason).toBe(reason);
	}
	expect(test.signals.metrics()).toMatchObject({
		closed: false,
		subscriptions: 0,
	});
	globalPending.resolve(response(test.request.mock.calls[0][0]));
	windowPending.resolve(response(test.request.mock.calls[1][0]));
	await flushSettlement();
	expect(bindings.network?.metrics()).toMatchObject({
		active: 0,
		responses: 0,
		retainedBytes: 0,
		responseAccounting: { outstanding: 0 },
	});
});

it("closes binding fetch consumers without closing or detaching caller-owned registry consumers", async () => {
	const globalPending = deferred<NetworkResponse>();
	const windowPending = deferred<NetworkResponse>();
	const test = bindingFixture(async (input) => {
		if (input.url.endsWith("/retained")) return response(input);
		return input.url.endsWith("/global")
			? globalPending.promise
			: windowPending.promise;
	});
	const { bindings, window, globalFetch } = test.build();
	const controller = new AbortController();
	const signal = test.signals.publish(controller.signal);
	const callerListener = vi.fn();
	const unsubscribe = test.signals.resolve(signal).subscribe(callerListener);
	const retained = await globalFetch("/retained", { signal });
	const clone = retained.clone();
	const globalRejected = expect(
		globalFetch("/global", { signal }),
	).rejects.toMatchObject({ code: "closed" });
	const windowRejected = expect(
		window.fetch("/window", { signal }),
	).rejects.toMatchObject({ code: "closed" });
	await flushSettlement();
	expect(test.request).toHaveBeenCalledTimes(3);
	const globalInput = test.request.mock.calls[1][0];
	const windowInput = test.request.mock.calls[2][0];
	bindings.close();
	bindings.close();
	await Promise.all([globalRejected, windowRejected]);
	for (const input of [globalInput, windowInput]) {
		expect(input.signal?.aborted).toBe(true);
		expect(input.signal?.reason).toMatchObject({ code: "closed" });
	}
	await expect(retained.text()).rejects.toMatchObject({ code: "closed" });
	await expect(clone.text()).rejects.toMatchObject({ code: "closed" });
	expect(controller.signal.aborted).toBe(false);
	expect(callerListener).not.toHaveBeenCalled();
	expect(test.signals.metrics()).toMatchObject({
		closed: false,
		subscriptions: 1,
	});
	expect(test.signals.publish(controller.signal)).toBe(signal);
	expect(test.signals.resolve(signal).aborted).toBe(false);
	await expect(globalFetch("/closed", { signal })).rejects.toMatchObject({
		code: "closed",
	});
	await expect(window.fetch("/closed", { signal })).rejects.toMatchObject({
		code: "closed",
	});
	expect(test.request).toHaveBeenCalledTimes(3);
	globalPending.resolve(response(globalInput));
	windowPending.resolve(response(windowInput));
	await flushSettlement();
	expect(bindings.network?.metrics()).toMatchObject({
		closed: true,
		active: 0,
		retainedBytes: 0,
		responseAccounting: { outstanding: 0 },
	});
	const reason = { callerStillOwnsRegistry: true };
	controller.abort(reason);
	expect(callerListener).toHaveBeenCalledTimes(1);
	expect(callerListener).toHaveBeenCalledWith(reason);
	unsubscribe();
	expect(test.signals.metrics()).toMatchObject({
		closed: false,
		subscriptions: 0,
	});
	expect(vi.getTimerCount()).toBe(0);
});

it("rejects a wrong-document fetch registry during binding construction without closing it", () => {
	const test = bindingFixture();
	const foreign = bindingFixture();
	const controller = new AbortController();
	const signal = foreign.signals.publish(controller.signal);
	const callerListener = vi.fn();
	const unsubscribe = foreign.signals.resolve(signal).subscribe(callerListener);
	expect(() => test.build(foreign.signals)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(test.request).not.toHaveBeenCalled();
	expect(foreign.request).not.toHaveBeenCalled();
	expect(foreign.signals.metrics()).toMatchObject({
		closed: false,
		subscriptions: 1,
	});
	expect(foreign.signals.publish(controller.signal)).toBe(signal);
	expect(callerListener).not.toHaveBeenCalled();
	expect(controller.signal.aborted).toBe(false);
	unsubscribe();
	expect(foreign.signals.metrics().subscriptions).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
});
