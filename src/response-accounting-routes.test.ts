import { afterEach, expect, it, vi } from "vitest";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { ResponseByteAccounting } from "./response-byte-accounting.js";

const denied = vi.hoisted(() =>
	vi.fn(() => {
		throw new Error(
			"All wire, resolver and server operations are forbidden in route accounting fixtures",
		);
	}),
);
vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: denied,
	get: denied,
	createServer: denied,
}));
vi.mock("node:https", async (original) => ({
	...(await original<typeof import("node:https")>()),
	request: denied,
	get: denied,
	createServer: denied,
}));
vi.mock("node:dns/promises", () => ({ Resolver: denied }));

const transports: NodeNetworkTransport[] = [];
const owners: ResponseByteAccounting[] = [];
afterEach(() => {
	for (const transport of transports.splice(0)) {
		transport.close();
		expect(transport.metrics().active).toBe(0);
	}
	for (const owner of owners.splice(0)) {
		expect(owner.metrics().outstanding).toBe(0);
		owner.close();
	}
	expect(denied).not.toHaveBeenCalled();
	vi.clearAllMocks();
});

function fixture() {
	const owner = new ResponseByteAccounting(4, 2);
	const transport = new NodeNetworkTransport({ resolver: denied });
	owners.push(owner);
	transports.push(transport);
	return { owner, transport };
}

function response(
	body: Uint8Array,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url: "https://accounting.test/body",
		status: 200,
		headers: {},
		body,
		redirects: [],
		encodedBytes: 0,
		elapsedMs: 0,
		...overrides,
	};
}

it("accounts synthetic routed body bytes as decoded-only without double charging the returned copy", async () => {
	const { owner, transport } = fixture();
	const lease = owner.createLease();
	const source = new Uint8Array([1, 2, 3]);
	const result = await transport.requestWithRoutes(
		{ url: "https://accounting.test/body", responseAccounting: lease },
		() => response(source),
	);
	expect(result.body).not.toBe(source);
	expect(owner.settle(lease, result.body.length)).toBe(true);
	source.fill(9);
	expect(Array.from(result.body)).toEqual([1, 2, 3]);
	expect(owner.metrics()).toMatchObject({
		observedEncodedBytes: 0,
		observedDecodedBytes: 3,
		completedOnlyBytes: 0,
		nativeRequests: 1,
		outstanding: 0,
	});
	expect(transport.metrics()).toMatchObject({
		mockedRequests: 1,
		encodedBytes: 0,
		decodedBytes: 3,
		mockedDecodedBytes: 3,
	});
});

it("charges a routed crossing body before rejecting the shared cumulative allowance", async () => {
	const { owner, transport } = fixture();
	const first = owner.createLease();
	const firstResponse = await transport.requestWithRoutes(
		{ url: "https://accounting.test/body", responseAccounting: first },
		() => response(new Uint8Array(3)),
	);
	expect(owner.settle(first, firstResponse.body.length)).toBe(true);
	const last = owner.createLease();
	await expect(
		transport.requestWithRoutes(
			{ url: "https://accounting.test/body", responseAccounting: last },
			() => response(new Uint8Array(2)),
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	owner.settle(last);
	expect(owner.metrics()).toMatchObject({
		observedEncodedBytes: 0,
		observedDecodedBytes: 5,
		completedOnlyBytes: 0,
		nativeRequests: 2,
		outstanding: 0,
	});
	expect(transport.metrics()).toMatchObject({
		decodedBytes: 5,
		mockedDecodedBytes: 5,
	});
	expect(() => owner.createLease()).toThrow(
		"Fetch response body limit exceeded",
	);
});

it("finalizes a claimed lease when invalid route metadata fails before the debit point", async () => {
	const { owner, transport } = fixture();
	const lease = owner.createLease();
	await expect(
		transport.requestWithRoutes(
			{ url: "https://accounting.test/body", responseAccounting: lease },
			() => response(new Uint8Array(2), { url: "https://different.test/body" }),
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	owner.settle(lease);
	expect(owner.metrics()).toMatchObject({
		observedEncodedBytes: 0,
		observedDecodedBytes: 0,
		nativeRequests: 1,
		outstanding: 0,
	});
	expect(transport.metrics().mockedRequests).toBe(0);
});

it("records a validated routed body arriving after ledger close but refuses its publication", async () => {
	const { owner, transport } = fixture();
	const lease = owner.createLease();
	await expect(
		transport.requestWithRoutes(
			{ url: "https://accounting.test/body", responseAccounting: lease },
			() => {
				owner.close();
				return response(new Uint8Array(2));
			},
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	owner.settle(lease);
	expect(owner.metrics()).toMatchObject({
		observedEncodedBytes: 0,
		observedDecodedBytes: 2,
		closed: true,
		outstanding: 0,
		draining: 0,
	});
});

it("finishes a bodyless routed lease without inventing wire traffic", async () => {
	const { owner, transport } = fixture();
	const lease = owner.createLease();
	const result = await transport.requestWithRoutes(
		{
			url: "https://accounting.test/body",
			responseAccounting: lease,
			method: "HEAD",
		},
		() => response(new Uint8Array()),
	);
	expect(owner.settle(lease, result.body.length)).toBe(true);
	expect(owner.metrics()).toMatchObject({
		observedEncodedBytes: 0,
		observedDecodedBytes: 0,
		completedOnlyBytes: 0,
		nativeRequests: 1,
		outstanding: 0,
	});
});
