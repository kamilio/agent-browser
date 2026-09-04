import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
import {
	type ResponseAccountingWriter,
	claimResponseAccounting,
	validateResponseAccountingLease,
} from "./response-byte-accounting.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

interface ResponseFixture {
	bodyUsed: boolean;
	text(): Promise<string>;
	clone(): ResponseFixture;
}

const owners: PageFetch[] = [];
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});

function response(
	input: NetworkRequest,
	bytes = 3,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url: input.url,
		status: 200,
		headers: {},
		body: new Uint8Array(bytes).fill(65),
		redirects: [],
		encodedBytes: bytes,
		elapsedMs: 0,
		...overrides,
	};
}

function fixture(
	handler: PageFetchTransport = async (input) => response(input),
	limits: Partial<PageFetchLimits> = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/page");
	trees.push(tree);
	const request = vi.fn(handler);
	const owner = new PageFetch(
		tree,
		{
			createHostObject(definition: ScriptHostObjectDefinition) {
				const capability = { ...definition.methods };
				for (const [name, descriptor] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(capability, name, descriptor);
				return capability;
			},
		},
		request,
		{
			limits: {
				maxTotalBytes: 8,
				maxResponseBytes: 4,
				maxPending: 2,
				...limits,
			},
		},
	);
	owners.push(owner);
	const fetch = async (input = "/data", init?: unknown) =>
		(await owner.fetch(input, init)) as ResponseFixture;
	return { owner, tree, request, fetch };
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
	for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

it("propagates a fresh opaque lease, records fallback, and returns detached metrics", async () => {
	const test = fixture(async (input) => {
		expect(() =>
			validateResponseAccountingLease(input.responseAccounting),
		).not.toThrow();
		expect(Object.isFrozen(input.responseAccounting)).toBe(true);
		expect(Object.keys(input.responseAccounting ?? {})).toEqual([]);
		return response(input);
	});
	const before = test.owner.metrics().responseAccounting;
	const result = await test.fetch();
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 3,
		retainedBytes: 3,
		responseAccounting: {
			observedEncodedBytes: 0,
			observedDecodedBytes: 0,
			completedOnlyBytes: 3,
			completedOnlyRequests: 1,
			nativeRequests: 0,
			unmeteredFailures: 0,
			outstanding: 0,
			draining: 0,
			closed: false,
			maxTotalBytes: 8,
			maxOutstanding: 2,
		},
	});
	expect(before.completedOnlyBytes).toBe(0);
	expect(Object.isFrozen(before)).toBe(true);
	expect(() =>
		claimResponseAccounting(test.request.mock.calls[0][0].responseAccounting),
	).toThrow();
	expect(await result.text()).toBe("AAA");
	expect(test.owner.metrics().responseAccounting.completedOnlyBytes).toBe(3);
});

it.each(["sync", "async"])(
	"counts an unclaimed %s rejection once and preserves its identity",
	async (kind) => {
		const failure = new Error("custom provider failed");
		const test = fixture((input) => {
			expect(input.responseAccounting).toBeDefined();
			if (kind === "sync") throw failure;
			return Promise.reject(failure);
		});
		await expect(test.fetch()).rejects.toBe(failure);
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 0,
			active: 0,
			responseAccounting: {
				unmeteredFailures: 1,
				completedOnlyBytes: 0,
				outstanding: 0,
			},
		});
		test.owner.close();
		expect(test.owner.metrics().responseAccounting.unmeteredFailures).toBe(1);
	},
);

it.each(["body", "headers", "cors", "url"])(
	"keeps the legacy %s rejection order while charging completed fallback",
	async (kind) => {
		const test = fixture(
			async (input) =>
				response(
					input,
					3,
					kind === "headers"
						? { headers: { "invalid header": ["value"] } }
						: kind === "url"
							? { url: "https://fixture.invalid/unrequested" }
							: {},
				),
			kind === "body" ? { maxResponseBytes: 2 } : {},
		);
		await expect(
			test.fetch(kind === "cors" ? "https://other.invalid/data" : "/data"),
		).rejects.toThrow();
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: kind === "url" ? 0 : 3,
			retainedBytes: 0,
			responses: 0,
			responseAccounting: {
				completedOnlyBytes: 3,
				completedOnlyRequests: 1,
				unmeteredFailures: 0,
			},
		});
	},
);

it.each([8, 9])(
	"charges a %i-byte rejected completed body before refusing further dispatch",
	async (bytes) => {
		const test = fixture(async (input) => response(input, bytes));
		await expect(test.fetch()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: bytes,
			retainedBytes: 0,
			responseAccounting: { completedOnlyBytes: bytes, outstanding: 0 },
		});
		await expect(test.fetch()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.request).toHaveBeenCalledTimes(1);
	},
);

it("never refunds cumulative fallback when response bodies are cloned or consumed", async () => {
	const test = fixture();
	const result = await test.fetch();
	const clone = result.clone();
	expect(test.owner.metrics().retainedBytes).toBe(6);
	await result.text();
	await clone.text();
	expect(test.owner.metrics()).toMatchObject({
		retainedBytes: 0,
		totalBytes: 3,
		responseAccounting: { completedOnlyBytes: 3, completedOnlyRequests: 1 },
	});
});

it.each([0, 1, 3])(
	"charges only the completed-body deficit after %i real writer decoded bytes",
	async (decoded) => {
		const test = fixture(async (input) => {
			const writer = claimResponseAccounting(input.responseAccounting);
			expect(writer.debit("encodedBytes", 2)).toBe(true);
			expect(writer.debit("decodedBytes", decoded)).toBe(true);
			writer.finish();
			return response(input);
		});
		await test.fetch();
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 3,
			responseAccounting: {
				observedEncodedBytes: 2,
				observedDecodedBytes: decoded,
				completedOnlyBytes: 3 - decoded,
				completedOnlyRequests: decoded === 3 ? 0 : 1,
				nativeRequests: 1,
				unmeteredFailures: 0,
				outstanding: 0,
				draining: 0,
			},
		});
	},
);

it.each(["encodedBytes", "decodedBytes"] as const)(
	"uses partial %s accounting to clamp the next cap without altering legacy totals",
	async (kind) => {
		const failure = new Error("partial failure");
		const test = fixture(async (input) => {
			if (input.url.endsWith("partial")) {
				const writer = claimResponseAccounting(input.responseAccounting);
				expect(writer.debit(kind, 6)).toBe(true);
				writer.finish();
				throw failure;
			}
			expect(input.maxResponseBytes).toBe(2);
			return response(input, 2);
		});
		await expect(test.fetch("/partial")).rejects.toBe(failure);
		expect(test.owner.metrics().totalBytes).toBe(0);
		await test.fetch("/remainder");
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 2,
			responseAccounting: {
				nativeRequests: 1,
				completedOnlyBytes: 2,
				unmeteredFailures: 0,
			},
		});
	},
);

it.each([8, 9])(
	"refuses queued and subsequent dispatch after %i live bytes even with zero legacy bytes",
	async (bytes) => {
		const failure = new Error("metered failure");
		const test = fixture(async (input) => {
			const writer = claimResponseAccounting(input.responseAccounting);
			expect(writer.debit("encodedBytes", bytes)).toBe(bytes === 8);
			writer.finish();
			throw failure;
		});
		const first = test.fetch("/first");
		const queued = test.fetch("/queued");
		await expect(first).rejects.toBe(failure);
		await expect(queued).rejects.toMatchObject({ code: "resource-limit" });
		await expect(test.fetch()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.request).toHaveBeenCalledTimes(1);
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 0,
			responseAccounting: {
				observedEncodedBytes: bytes,
				outstanding: 0,
				unmeteredFailures: 0,
			},
		});
	},
);

it("does not reject an already metered completion for another lease's encoded excess", async () => {
	const firstResult = deferred<NetworkResponse>();
	const secondResult = deferred<NetworkResponse>();
	const started = deferred<void>();
	const writers: ResponseAccountingWriter[] = [];
	const test = fixture((input) => {
		writers.push(claimResponseAccounting(input.responseAccounting));
		if (writers.length === 1) return firstResult.promise;
		started.resolve();
		return secondResult.promise;
	});
	const first = test.fetch("/first");
	const second = test.fetch("/second");
	const failed = expect(second).rejects.toThrow("encoded excess");
	await started.promise;
	expect(writers[0].debit("decodedBytes", 3)).toBe(true);
	expect(writers[1].debit("encodedBytes", 9)).toBe(false);
	writers[0].finish();
	writers[1].finish();
	secondResult.reject(new Error("encoded excess"));
	firstResult.resolve(response(test.request.mock.calls[0][0]));
	expect(await (await first).text()).toBe("AAA");
	await failed;
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 3,
		responseAccounting: {
			observedEncodedBytes: 9,
			observedDecodedBytes: 3,
			completedOnlyBytes: 0,
		},
	});
});

it("rejects excess fallback before publication but still charges the legacy completed counter", async () => {
	const pending = deferred<NetworkResponse>();
	const started = deferred<void>();
	const test = fixture((input) => {
		if (input.url.endsWith("fallback")) {
			started.resolve();
			return pending.promise;
		}
		const writer = claimResponseAccounting(input.responseAccounting);
		expect(writer.debit("decodedBytes", 7)).toBe(true);
		writer.finish();
		return Promise.reject(new Error("partial decoded failure"));
	});
	const fallback = test.fetch("/fallback");
	const rejected = expect(fallback).rejects.toMatchObject({
		code: "resource-limit",
	});
	await started.promise;
	await expect(test.fetch("/partial")).rejects.toThrow(
		"partial decoded failure",
	);
	pending.resolve(response(test.request.mock.calls[0][0], 2));
	await rejected;
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 2,
		responses: 0,
		retainedBytes: 0,
		responseAccounting: {
			observedDecodedBytes: 7,
			completedOnlyBytes: 2,
			outstanding: 0,
		},
	});
});

it.each(["resolve", "reject"] as const)(
	"settles a late custom-provider %s after timeout without reviving the response",
	async (outcome) => {
		vi.useFakeTimers();
		const pending = deferred<NetworkResponse>();
		const started = deferred<void>();
		const test = fixture(
			() => {
				started.resolve();
				return pending.promise;
			},
			{ timeoutMs: 10 },
		);
		const fetch = test.fetch();
		const timedOut = expect(fetch).rejects.toMatchObject({ code: "timeout" });
		await started.promise;
		await vi.advanceTimersByTimeAsync(10);
		await timedOut;
		expect(test.owner.metrics().responseAccounting).toMatchObject({
			outstanding: 0,
			unmeteredFailures: 1,
		});
		expect(() =>
			claimResponseAccounting(test.request.mock.calls[0][0].responseAccounting),
		).toThrow();
		if (outcome === "resolve")
			pending.resolve(response(test.request.mock.calls[0][0], 6));
		else pending.reject(new Error("late rejection"));
		await flushSettlement();
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 0,
			responses: 0,
			retainedBytes: 0,
			responseAccounting: {
				completedOnlyBytes: outcome === "resolve" ? 6 : 0,
				completedOnlyRequests: outcome === "resolve" ? 1 : 0,
				unmeteredFailures: 1,
				outstanding: 0,
			},
		});
		test.request.mockImplementation(async (input) => response(input, 0));
		await test.fetch("/after-timeout");
		expect(test.request.mock.calls[1][0].maxResponseBytes).toBe(
			outcome === "resolve" ? 2 : 4,
		);
	},
);

it("keeps claimed work draining after timeout until the provider's real writer finishes", async () => {
	vi.useFakeTimers();
	const pending = deferred<NetworkResponse>();
	const started = deferred<ResponseAccountingWriter>();
	const test = fixture(
		(input) => {
			started.resolve(claimResponseAccounting(input.responseAccounting));
			return pending.promise;
		},
		{ timeoutMs: 10, maxPending: 1 },
	);
	const timedOut = expect(test.fetch()).rejects.toMatchObject({
		code: "timeout",
	});
	const writer = await started.promise;
	await vi.advanceTimersByTimeAsync(10);
	await timedOut;
	expect(test.owner.metrics()).toMatchObject({
		active: 0,
		responseAccounting: { outstanding: 1, draining: 1, unmeteredFailures: 0 },
	});
	await expect(test.fetch("/blocked-by-draining")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.request).toHaveBeenCalledTimes(1);
	expect(writer.debit("decodedBytes", 2)).toBe(true);
	pending.resolve(response(test.request.mock.calls[0][0], 2));
	await flushSettlement();
	expect(test.owner.metrics().responseAccounting).toMatchObject({
		outstanding: 1,
		draining: 1,
		completedOnlyBytes: 0,
	});
	writer.finish();
	test.request.mockImplementation(async (input) => response(input, 0));
	await test.fetch("/released");
	expect(test.request).toHaveBeenCalledTimes(2);
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 0,
		responseAccounting: { outstanding: 0, draining: 0 },
	});
});

it.each([false, true])(
	"closes accounting before reentrant abort handlers and records late completion (claimed=%s)",
	async (claimed) => {
		const pending = deferred<NetworkResponse>();
		const started = deferred<void>();
		let writer: ResponseAccountingWriter | undefined;
		let observedClosed = false;
		const test = fixture((input) => {
			if (claimed) writer = claimResponseAccounting(input.responseAccounting);
			input.signal?.addEventListener(
				"abort",
				() => {
					observedClosed = test.owner.metrics().responseAccounting.closed;
					expect(test.owner.metrics().closed).toBe(true);
					if (writer) expect(writer.debit("decodedBytes", 2)).toBe(false);
					else
						expect(() =>
							claimResponseAccounting(input.responseAccounting),
						).toThrow();
				},
				{ once: true },
			);
			started.resolve();
			return pending.promise;
		});
		const closed = expect(test.fetch()).rejects.toMatchObject({
			code: "closed",
		});
		await started.promise;
		test.tree.close();
		await closed;
		expect(observedClosed).toBe(true);
		expect(test.owner.metrics().responseAccounting).toMatchObject({
			outstanding: claimed ? 1 : 0,
			draining: claimed ? 1 : 0,
		});
		pending.resolve(response(test.request.mock.calls[0][0], 3));
		await flushSettlement();
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 0,
			retainedBytes: 0,
			responses: 0,
			responseAccounting: {
				closed: true,
				observedDecodedBytes: claimed ? 2 : 0,
				completedOnlyBytes: claimed ? 1 : 3,
				unmeteredFailures: claimed ? 0 : 1,
			},
		});
		writer?.finish();
		expect(test.owner.metrics().responseAccounting.outstanding).toBe(0);
	},
);

it("releases neither claimed capacity nor writer ownership just because a response is published", async () => {
	let writer!: ResponseAccountingWriter;
	const test = fixture(
		async (input) => {
			writer = claimResponseAccounting(input.responseAccounting);
			writer.debit("decodedBytes", 3);
			return response(input);
		},
		{ maxPending: 1 },
	);
	await test.fetch();
	expect(test.owner.metrics().responseAccounting).toMatchObject({
		outstanding: 1,
		draining: 1,
	});
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(1);
	writer.finish();
	expect(test.owner.metrics().responseAccounting).toMatchObject({
		outstanding: 0,
		draining: 0,
	});
});

it.each(["redirect", "preflight"])(
	"refuses the next %s dispatch after live encoded exhaustion with no completed body bytes",
	async (kind) => {
		const test = fixture(async (input) => {
			const writer = claimResponseAccounting(input.responseAccounting);
			expect(writer.debit("encodedBytes", 8)).toBe(true);
			writer.finish();
			return response(
				input,
				0,
				kind === "redirect"
					? {
							status: 307,
							headers: { location: ["/next"] },
						}
					: {
							headers: {
								"access-control-allow-origin": ["https://fixture.invalid"],
								"access-control-allow-methods": ["PUT"],
							},
						},
			);
		});
		await expect(
			test.fetch(
				kind === "redirect" ? "/start" : "https://other.invalid/data",
				{
					method: "PUT",
					body: "side effect",
				},
			),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(test.request).toHaveBeenCalledTimes(1);
		expect(test.request.mock.calls[0][0].method).toBe(
			kind === "redirect" ? "PUT" : "OPTIONS",
		);
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 0,
			responses: 0,
			responseAccounting: {
				observedEncodedBytes: 8,
				completedOnlyBytes: 0,
				nativeRequests: 1,
				outstanding: 0,
			},
		});
	},
);

it("allows an exact-fit metered response but not a new dispatch", async () => {
	const test = fixture(
		async (input) => {
			const writer = claimResponseAccounting(input.responseAccounting);
			expect(writer.debit("encodedBytes", 4)).toBe(true);
			expect(writer.debit("decodedBytes", 4)).toBe(true);
			writer.finish();
			return response(input, 4);
		},
		{ maxTotalBytes: 4 },
	);
	expect(await (await test.fetch()).text()).toBe("AAAA");
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(1);
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 4,
		retainedBytes: 0,
		responseAccounting: {
			observedEncodedBytes: 4,
			observedDecodedBytes: 4,
			completedOnlyBytes: 0,
		},
	});
});
