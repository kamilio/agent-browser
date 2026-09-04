import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
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
	bytes = 4,
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
		{ limits: { maxTotalBytes: 4, ...limits } },
	);
	owners.push(owner);
	const fetch = async (input = "/data", init?: unknown) =>
		(await owner.fetch(input, init)) as ResponseFixture;
	return { owner, tree, request, fetch };
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

it.each([4, 5])(
	"refuses new work after charging %i bytes against a four-byte cumulative allowance",
	async (bytes) => {
		const test = fixture(async (input) => response(input, bytes));
		if (bytes === 4) await test.fetch();
		else
			await expect(test.fetch()).rejects.toMatchObject({
				code: "resource-limit",
			});
		await expect(
			test.fetch("/never-sent", { method: "POST", body: "side effect" }),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(test.request).toHaveBeenCalledTimes(1);
		expect(test.owner.metrics()).toMatchObject({
			requests: 1,
			active: 0,
			totalBytes: bytes,
			responses: bytes === 4 ? 1 : 0,
		});
	},
);

it.each(["HEAD", "GET"])(
	"fails closed for a new potentially empty %s response once the budget is exactly exhausted",
	async (method) => {
		const test = fixture();
		await test.fetch();
		test.request.mockImplementation(async (input) => response(input, 0));
		await expect(test.fetch("/empty", { method })).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.request).toHaveBeenCalledTimes(1);
	},
);

it("allows empty responses and a final exact-fit response while byte allowance remains", async () => {
	const test = fixture(async (input) =>
		response(input, input.url.endsWith("empty") ? 0 : 2),
	);
	await test.fetch("/empty");
	await test.fetch("/part");
	await test.fetch("/empty");
	await test.fetch("/last");
	expect(test.owner.metrics()).toMatchObject({
		requests: 4,
		responses: 4,
		totalBytes: 4,
	});
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(4);
});

it.each(["body", "cors", "headers"])(
	"keeps rejected %s bytes charged and prevents subsequent transport admission",
	async (kind) => {
		const test = fixture(
			async (input) =>
				response(
					input,
					4,
					kind === "headers"
						? { headers: { "invalid header": ["value"] } }
						: {},
				),
			kind === "body" ? { maxResponseBytes: 3 } : {},
		);
		await expect(
			test.fetch(kind === "cors" ? "https://other.invalid/data" : "/data"),
		).rejects.toThrow();
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 4,
			responses: 0,
			retainedBytes: 0,
			active: 0,
		});
		await expect(test.fetch()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.request).toHaveBeenCalledTimes(1);
	},
);

it("does not mistake retained-byte release or cloning for a cumulative budget refund", async () => {
	const test = fixture();
	const result = await test.fetch();
	const clone = result.clone();
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 4,
		retainedBytes: 8,
	});
	expect(await result.text()).toBe("AAAA");
	expect(await clone.text()).toBe("AAAA");
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 4,
		retainedBytes: 0,
		responses: 2,
	});
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(1);
});

it("allows retained-capacity reuse without replenishing cumulative bytes", async () => {
	const test = fixture(async (input) => response(input, 2), {
		maxRetainedBytes: 2,
	});
	await (await test.fetch()).text();
	await (await test.fetch()).text();
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 4,
		retainedBytes: 0,
	});
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(2);
});

it("retains charges when response publication is rejected for retained capacity", async () => {
	const test = fixture(undefined, { maxRetainedBytes: 3 });
	await expect(test.fetch()).rejects.toThrow("retention");
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(1);
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 4,
		retainedBytes: 0,
		active: 0,
	});
});

it.each(["same-origin", "cross-origin"])(
	"does not dispatch a redirect hop or its preflight after %s redirect bytes exhaust the budget",
	async (target) => {
		const test = fixture(async (input) =>
			response(input, 4, {
				status: 307,
				headers: {
					location: [
						target === "same-origin" ? "/next" : "https://other.invalid/next",
					],
				},
			}),
		);
		await expect(
			test.fetch("/start", {
				method: "PUT",
				body: "payload",
				headers: { "X-Client": "present" },
			}),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(test.request).toHaveBeenCalledTimes(1);
		expect(test.owner.metrics()).toMatchObject({
			totalBytes: 4,
			active: 0,
			responses: 0,
		});
	},
);

it("does not send the mutation after an allowed preflight body exhausts cumulative bytes", async () => {
	const test = fixture(async (input) =>
		response(input, 4, {
			headers: {
				"access-control-allow-origin": ["https://fixture.invalid"],
				"access-control-allow-methods": ["PUT"],
				"access-control-allow-headers": ["x-client"],
				"access-control-allow-credentials": ["true"],
			},
		}),
	);
	await expect(
		test.fetch("https://other.invalid/data", {
			method: "PUT",
			body: "payload",
			credentials: "include",
			headers: { "X-Client": "present" },
		}),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(1);
	expect(test.request.mock.calls[0][0]).toMatchObject({
		method: "OPTIONS",
		cookieContext: { credentials: "omit" },
	});
	expect(test.request.mock.calls[0][0].body).toBeUndefined();
	expect(test.owner.metrics()).toMatchObject({ totalBytes: 4, active: 0 });
});

it("keeps preflight, credential, header filtering and redirect behavior when byte allowance remains", async () => {
	const test = fixture(async (input) =>
		response(input, input.method === "OPTIONS" ? 0 : 2, {
			headers: {
				"access-control-allow-origin": ["https://fixture.invalid"],
				"access-control-allow-methods": ["PUT"],
				"access-control-allow-headers": ["x-client"],
				"access-control-allow-credentials": ["true"],
				"set-cookie": ["private=value"],
			},
		}),
	);
	await test.fetch("https://other.invalid/data", {
		method: "PUT",
		body: "payload",
		credentials: "include",
		headers: { "X-Client": "present", Cookie: "do-not-send" },
	});
	expect(test.request.mock.calls.map(([input]) => input.method)).toEqual([
		"OPTIONS",
		"PUT",
	]);
	expect(test.request.mock.calls[1][0]).toMatchObject({
		body: "payload",
		cookieContext: { credentials: "include" },
		headers: { "x-client": "present", origin: "https://fixture.invalid" },
	});
	expect(test.request.mock.calls[1][0].headers).not.toHaveProperty("cookie");
	expect(test.owner.metrics()).toMatchObject({ totalBytes: 2, active: 0 });
});

it("rechecks byte admission at deferred dispatch after a concurrent response settles", async () => {
	let witnessedQueuedBoundary = false;
	for (let turns = 0; turns < 10; turns++) {
		const test = fixture();
		const first = test.fetch("/first");
		for (let turn = 0; turn < turns; turn++) await Promise.resolve();
		const before = test.owner.metrics().totalBytes;
		const second = test.fetch("/second");
		const outcomes = await Promise.allSettled([first, second]);
		if (
			before === 0 &&
			test.owner.metrics().requests === 2 &&
			test.request.mock.calls.length === 1
		) {
			witnessedQueuedBoundary = true;
			expect(outcomes[1]).toMatchObject({
				status: "rejected",
				reason: { code: "resource-limit" },
			});
			expect(test.owner.metrics()).toMatchObject({ totalBytes: 4, active: 0 });
		}
	}
	expect(witnessedQueuedBoundary).toBe(true);
});

it("charges already in-flight responses even if they overshoot, then admits no more work", async () => {
	const firstReply = deferred<NetworkResponse>();
	const secondReply = deferred<NetworkResponse>();
	const test = fixture((input) =>
		input.url.endsWith("first") ? firstReply.promise : secondReply.promise,
	);
	const first = test.fetch("/first");
	const second = test.fetch("/second");
	const outcomes = Promise.allSettled([first, second]);
	await Promise.resolve();
	expect(test.request).toHaveBeenCalledTimes(2);
	firstReply.resolve(response(test.request.mock.calls[0][0]));
	await first;
	secondReply.resolve(response(test.request.mock.calls[1][0], 2));
	expect(await outcomes).toMatchObject([
		{ status: "fulfilled" },
		{ status: "rejected", reason: { code: "resource-limit" } },
	]);
	expect(test.owner.metrics()).toMatchObject({ totalBytes: 6, active: 0 });
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(2);
});

it("preserves close and CSP errors instead of starting new work after exhaustion", async () => {
	const test = fixture();
	await test.fetch();
	const meta = test.tree.createElement("meta", {
		"http-equiv": "content-security-policy",
		content: "connect-src 'none'",
	});
	test.tree.append(test.tree.root, meta);
	await expect(test.fetch()).rejects.toMatchObject({ code: "policy-denied" });
	test.tree.close();
	await expect(test.fetch()).rejects.toMatchObject({ code: "closed" });
	expect(test.request).toHaveBeenCalledTimes(1);
});

it("aborts a queued send on close before calling transport and clears its timer", async () => {
	vi.useFakeTimers();
	const test = fixture();
	const pending = test.fetch();
	test.owner.close();
	await expect(pending).rejects.toMatchObject({ code: "closed" });
	expect(test.request).not.toHaveBeenCalled();
	expect(test.owner.metrics()).toMatchObject({ totalBytes: 0, active: 0 });
	expect(vi.getTimerCount()).toBe(0);
});

it("cleans up timeouts without charging an absent response or reopening an exhausted budget", async () => {
	vi.useFakeTimers();
	const test = fixture(() => new Promise<NetworkResponse>(() => {}), {
		timeoutMs: 5,
	});
	const pending = test.fetch();
	const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
	await vi.advanceTimersByTimeAsync(5);
	await rejected;
	expect(test.request.mock.calls[0][0].signal?.aborted).toBe(true);
	expect(test.owner.metrics()).toMatchObject({ totalBytes: 0, active: 0 });
	test.request.mockImplementation(async (input) => response(input));
	await test.fetch();
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(2);
	expect(vi.getTimerCount()).toBe(0);
});

it("preserves transport errors and allows retry only while byte allowance remains", async () => {
	const failure = new AgentBrowserError(
		"network-error",
		"fixture transport failure",
	);
	const test = fixture(async () => {
		throw failure;
	});
	await expect(test.fetch()).rejects.toBe(failure);
	expect(test.owner.metrics()).toMatchObject({ totalBytes: 0, active: 0 });
	test.request.mockImplementation(async (input) => response(input));
	await test.fetch();
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(2);
});
