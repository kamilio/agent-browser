import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HttpsRedirectPolicy } from "./https-redirect-policy.js";
import type { NetworkResponse } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";

const network = vi.hoisted(() => ({
	blocked: vi.fn(() => {
		throw new Error("Actual network access is forbidden in redirect tests");
	}),
}));

vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: network.blocked,
	get: network.blocked,
	createServer: network.blocked,
}));

vi.mock("node:https", async (original) => ({
	...(await original<typeof import("node:https")>()),
	request: network.blocked,
	get: network.blocked,
	createServer: network.blocked,
}));

vi.mock("node:dns/promises", () => ({ Resolver: network.blocked }));

interface WireHost {
	exchange(
		url: URL,
		address: string,
		method: string,
		headers: Record<string, string>,
		body: Buffer | undefined,
		redirect: string,
		signal: AbortSignal,
		maxResponseBytes: number,
	): Promise<Omit<NetworkResponse, "url" | "redirects" | "elapsedMs">>;
}

const policy: HttpsRedirectPolicy = "same-origin-upgrade-v1";
const origin = "https://redirect.example";
const start = `${origin}/start`;
const originalLocation = "http://redirect.example/final";
const final = `${origin}/final`;
const publicAddress = "93.184.216.34";
const transports: NodeNetworkTransport[] = [];
const pending: Promise<unknown>[] = [];

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
	for (const transport of transports.splice(0)) transport.close();
	await Promise.allSettled(pending.splice(0));
	expect(network.blocked).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function response(
	url: string,
	status = 200,
	location?: string,
): NetworkResponse {
	return {
		url,
		status,
		headers: location === undefined ? {} : { location: [location] },
		body: new Uint8Array(),
		encodedBytes: 0,
		redirects: [],
		elapsedMs: 0,
	};
}

function fixture(options: NodeTransportOptions = {}) {
	const resolver = vi.fn(async (_hostname: string, _signal: AbortSignal) => [
		publicAddress,
	]);
	const transport = new NodeNetworkTransport({ ...options, resolver });
	transports.push(transport);
	const exchange = vi
		.spyOn(transport as unknown as WireHost, "exchange")
		.mockImplementation(async () => {
			throw new Error("Unexpected wire exchange");
		});
	return { transport, resolver, exchange };
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((resolveValue) => {
		resolve = resolveValue;
	});
	return { promise, resolve };
}

it("retains a fixed authorization header only over same-origin HTTPS", async () => {
	const { transport, exchange } = fixture({ httpsRedirectPolicy: policy });
	const authorization = "Bearer owned-fixture-constant";
	const seen: { url: string; authorization: string | undefined }[] = [];
	exchange.mockImplementation(async (url, _address, _method, headers) => {
		seen.push({ url: url.href, authorization: headers.authorization });
		return url.href === start
			? response(start, 308, originalLocation)
			: response(url.href);
	});
	const result = await transport.request({
		url: start,
		headers: { authorization },
	});
	expect(result.url).toBe(final);
	expect(seen).toEqual([
		{ url: start, authorization },
		{ url: final, authorization },
	]);
	expect(transport.metrics()).toMatchObject({
		httpsRedirectUpgrades: 1,
		active: 0,
	});
});

it("does not restore authorization after a prior cross-origin HTTPS hop", async () => {
	const { transport, exchange } = fixture({ httpsRedirectPolicy: policy });
	const other = "https://other.example/start";
	const otherFinal = "https://other.example/final";
	const seen: { url: string; authorization: string | undefined }[] = [];
	exchange.mockImplementation(async (url, _address, _method, headers) => {
		seen.push({ url: url.href, authorization: headers.authorization });
		if (url.href === start) return response(start, 302, other);
		if (url.href === other)
			return response(other, 308, "http://other.example/final");
		return response(url.href);
	});
	const result = await transport.request({
		url: start,
		headers: { authorization: "Bearer owned-fixture-constant" },
	});
	expect(result.url).toBe(otherFinal);
	expect(seen).toEqual([
		{ url: start, authorization: "Bearer owned-fixture-constant" },
		{ url: other, authorization: undefined },
		{ url: otherFinal, authorization: undefined },
	]);
	expect(transport.metrics()).toMatchObject({
		redirects: 2,
		httpsRedirectUpgrades: 1,
		active: 0,
	});
});

it("validates only the exact opt-in or undefined", async () => {
	const { validateHttpsRedirectPolicy } = await import(
		"./https-redirect-policy.js"
	);
	expect(validateHttpsRedirectPolicy(undefined)).toBeUndefined();
	expect(validateHttpsRedirectPolicy(policy)).toBe(policy);
});

const invalidPolicies = [
	null,
	false,
	true,
	0,
	"",
	"same-origin-upgrade-v2",
	"SAME-ORIGIN-UPGRADE-V1",
	"same-origin-upgrade-v1 ",
	{},
	[policy],
];

it("rejects invalid values through the standalone validator", async () => {
	const { validateHttpsRedirectPolicy } = await import(
		"./https-redirect-policy.js"
	);
	for (const value of invalidPolicies) {
		expect(() => validateHttpsRedirectPolicy(value)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	}
});

it.each(invalidPolicies.map((value) => ({ value })))(
	"rejects invalid policy $value before transport effects",
	({ value }) => {
		const resolver = vi.fn(async () => [publicAddress]);
		const exchange = vi.spyOn(
			NodeNetworkTransport.prototype as unknown as WireHost,
			"exchange",
		);
		expect(() => {
			const transport = new NodeNetworkTransport({
				resolver,
				httpsRedirectPolicy: value as HttpsRedirectPolicy,
			});
			transports.push(transport);
		}).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(resolver).not.toHaveBeenCalled();
		expect(exchange).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each([{}, { httpsRedirectPolicy: undefined }])(
	"keeps downgrade denial and metric shape for default %j",
	async (options) => {
		const { transport, resolver, exchange } = fixture(options);
		expect(transport.metrics()).not.toHaveProperty("httpsRedirectUpgrades");
		exchange.mockResolvedValue(response(start, 308, originalLocation));
		await expect(transport.request({ url: start })).rejects.toMatchObject({
			code: "policy-denied",
		});
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(exchange).toHaveBeenCalledTimes(1);
		expect(transport.metrics()).not.toHaveProperty("httpsRedirectUpgrades");
		expect(transport.metrics()).toMatchObject({ redirects: 0, active: 0 });
	},
);

it.each([
	["GET", 301],
	["HEAD", 302],
	["GET", 303],
	["HEAD", 303],
	["GET", 307],
	["HEAD", 308],
] as const)(
	"upgrades %s on %i without sending HTTP",
	async (method, status) => {
		const { transport, resolver, exchange } = fixture({
			httpsRedirectPolicy: policy,
			allowedOrigins: [origin],
		});
		const initialMetrics = transport.metrics();
		expect(initialMetrics).toMatchObject({ httpsRedirectUpgrades: 0 });
		exchange
			.mockResolvedValueOnce(response(start, status, originalLocation))
			.mockResolvedValueOnce(response(final));
		const result = await transport.request({ url: start, method });
		expect(result.url).toBe(final);
		expect(result.redirects).toEqual([
			{
				url: start,
				status,
				location: final,
				httpsUpgrade: { policy, originalLocation },
			},
		]);
		expect(Object.isFrozen(result.redirects[0].httpsUpgrade)).toBe(true);
		expect(exchange.mock.calls.map(([url]) => url.href)).toEqual([
			start,
			final,
		]);
		expect(exchange.mock.calls.map((call) => call[2])).toEqual([
			method,
			method,
		]);
		expect(resolver).toHaveBeenCalledTimes(2);
		expect(transport.metrics()).toMatchObject({
			httpsRedirectUpgrades: 1,
			redirects: 1,
			requests: 2,
			active: 0,
		});
		expect(initialMetrics).toMatchObject({ httpsRedirectUpgrades: 0 });
	},
);

it.each([
	["HTTP://REDIRECT.EXAMPLE:80/a/../final?q=a%2Fb&x=1", "#inherited"],
	["http://redirect.example/final?q=a%2Fb&x=1#explicit", "#explicit"],
	["http://redirect.example/final?q=a%2Fb&x=1#", "#"],
])(
	"normalizes provenance and preserves query/fragment for %s",
	async (location, fragment) => {
		const { transport, resolver, exchange } = fixture({
			httpsRedirectPolicy: policy,
		});
		const source = `${start}#inherited`;
		const target = `${origin}/final?q=a%2Fb&x=1${fragment}`;
		const route = vi.fn((input: { url: string }) =>
			input.url === source
				? response(source, 308, location)
				: response(input.url),
		);
		const result = await transport.requestWithRoutes({ url: source }, route);
		expect(route.mock.calls.map(([input]) => input.url)).toEqual([
			source,
			target,
		]);
		expect(result.url).toBe(target);
		expect(result.redirects[0]).toEqual({
			url: source,
			status: 308,
			location: target,
			httpsUpgrade: {
				policy,
				originalLocation: `http://redirect.example/final?q=a%2Fb&x=1${fragment}`,
			},
		});
		expect(resolver).not.toHaveBeenCalled();
		expect(exchange).not.toHaveBeenCalled();
	},
);

it.each([
	[
		"https://redirect.example/start",
		"http://redirect.example:443/final",
		final,
	],
	[
		"https://redirect.example:8443/start",
		"http://redirect.example:8443/final",
		"https://redirect.example:8443/final",
	],
])(
	"uses the effective allowed HTTPS origin for %s",
	async (source, location, target) => {
		const { transport, exchange } = fixture({
			httpsRedirectPolicy: policy,
			allowedOrigins: [new URL(source).origin],
		});
		exchange
			.mockResolvedValueOnce(response(source, 302, location))
			.mockResolvedValueOnce(response(target));
		const result = await transport.request({ url: source });
		expect(result.url).toBe(target);
		expect(result.redirects[0].httpsUpgrade).toEqual({
			policy,
			originalLocation: location,
		});
		expect(exchange.mock.calls.map(([url]) => url.href)).toEqual([
			source,
			target,
		]);
	},
);

it.each([
	[start, "http://other.example/final"],
	[start, "http://redirect.example.evil.example/final"],
	[start, "http://redirect.example:8443/final"],
	["https://redirect.example:8443/start", originalLocation],
	[start, "http://redirect.example:25/final"],
	[start, "http://user:secret@redirect.example/final"],
	[start, "ftp://redirect.example/final"],
	[start, "data:text/plain,blocked"],
])(
	"rejects ineligible target %s -> %s before target route/DNS",
	async (source, location) => {
		const { transport, resolver, exchange } = fixture({
			httpsRedirectPolicy: policy,
		});
		const route = vi.fn((input: { url: string }) =>
			input.url === source
				? response(source, 302, location)
				: response(input.url),
		);
		await expect(
			transport.requestWithRoutes({ url: source }, route),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(route).toHaveBeenCalledTimes(1);
		expect(resolver).not.toHaveBeenCalled();
		expect(exchange).not.toHaveBeenCalled();
		expect(transport.metrics()).toMatchObject({
			httpsRedirectUpgrades: 0,
			redirects: 0,
			active: 0,
		});
	},
);

it.each([
	"https://user:secret@redirect.example/start",
	"http://user:secret@redirect.example/start",
	"ftp://redirect.example/start",
])("rejects invalid initial URL %s before any effects", async (url) => {
	const { transport, resolver, exchange } = fixture({
		httpsRedirectPolicy: policy,
	});
	const route = vi.fn(() => response(url, 302, originalLocation));
	await expect(
		transport.requestWithRoutes({ url }, route),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(route).not.toHaveBeenCalled();
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
});

it.each([
	["POST", 301],
	["POST", 302],
	["POST", 303],
	["PUT", 307],
	["PATCH", 308],
	["DELETE", 303],
	["OPTIONS", 302],
] as const)(
	"does not upgrade current %s even on %i",
	async (method, status) => {
		const { transport, resolver, exchange } = fixture({
			httpsRedirectPolicy: policy,
		});
		exchange.mockResolvedValue(response(start, status, originalLocation));
		await expect(
			transport.request({ url: start, method }),
		).rejects.toMatchObject({
			code: "policy-denied",
		});
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(exchange).toHaveBeenCalledTimes(1);
		expect(transport.metrics()).toMatchObject({
			httpsRedirectUpgrades: 0,
			redirects: 0,
			active: 0,
		});
	},
);

it("uses the current GET after a preceding HTTPS POST-to-GET redirect", async () => {
	const { transport, exchange } = fixture({ httpsRedirectPolicy: policy });
	exchange
		.mockResolvedValueOnce(response(start, 303, "/get"))
		.mockResolvedValueOnce(response(`${origin}/get`, 308, originalLocation))
		.mockResolvedValueOnce(response(final));
	const result = await transport.request({
		url: start,
		method: "POST",
		body: "x",
	});
	expect(result.url).toBe(final);
	expect(exchange.mock.calls.map((call) => call[2])).toEqual([
		"POST",
		"GET",
		"GET",
	]);
	expect(exchange.mock.calls[2][4]).toBeUndefined();
	expect(result.redirects[0]).not.toHaveProperty("httpsUpgrade");
	expect(transport.metrics()).toMatchObject({ httpsRedirectUpgrades: 1 });
});

it.each(["manual", "error"] as const)(
	"preserves %s redirect mode",
	async (redirect) => {
		const { transport, resolver, exchange } = fixture({
			httpsRedirectPolicy: policy,
		});
		exchange.mockResolvedValue(response(start, 308, originalLocation));
		const request = transport.request({ url: start, redirect });
		if (redirect === "manual") {
			expect(await request).toMatchObject({
				url: start,
				status: 308,
				headers: { location: [originalLocation] },
				redirects: [],
			});
		} else {
			await expect(request).rejects.toMatchObject({ code: "policy-denied" });
		}
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(exchange).toHaveBeenCalledTimes(1);
		expect(transport.metrics()).toMatchObject({
			httpsRedirectUpgrades: 0,
			active: 0,
		});
	},
);

it("does not upgrade an initial HTTP URL", async () => {
	const { transport, resolver, exchange } = fixture({
		httpsRedirectPolicy: policy,
	});
	const route = vi.fn((input: { url: string }) => response(input.url));
	const result = await transport.requestWithRoutes(
		{ url: originalLocation },
		route,
	);
	expect(result.url).toBe(originalLocation);
	expect(route.mock.calls.map(([input]) => input.url)).toEqual([
		originalLocation,
	]);
	expect(result.redirects).toEqual([]);
	expect(transport.metrics()).toMatchObject({ httpsRedirectUpgrades: 0 });
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
});

it("does not use upgrading to bypass an HTTPS-only initial origin policy", async () => {
	const { transport, resolver, exchange } = fixture({
		httpsRedirectPolicy: policy,
		allowedOrigins: [origin],
	});
	await expect(
		transport.request({ url: originalLocation }),
	).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
});

it.each([["127.0.0.1"], [publicAddress, "10.0.0.1"], ["::1"]])(
	"rechecks effective target DNS and rejects addresses %j before exchange",
	async (...addresses) => {
		const { transport, resolver, exchange } = fixture({
			httpsRedirectPolicy: policy,
			allowPrivateOrigins: ["http://redirect.example"],
		});
		resolver
			.mockResolvedValueOnce([publicAddress])
			.mockResolvedValueOnce(addresses);
		exchange.mockResolvedValue(response(start, 308, originalLocation));
		await expect(transport.request({ url: start })).rejects.toMatchObject({
			code: "policy-denied",
		});
		expect(resolver).toHaveBeenCalledTimes(2);
		expect(exchange).toHaveBeenCalledTimes(1);
		expect(transport.metrics().active).toBe(0);
	},
);

it("honors an explicit private-address exception for the effective HTTPS origin", async () => {
	const { transport, resolver, exchange } = fixture({
		httpsRedirectPolicy: policy,
		allowedOrigins: [origin],
		allowPrivateOrigins: [origin],
	});
	resolver.mockResolvedValue(["127.0.0.1"]);
	exchange
		.mockResolvedValueOnce(response(start, 308, originalLocation))
		.mockResolvedValueOnce(response(final));
	expect((await transport.request({ url: start })).url).toBe(final);
	expect(exchange.mock.calls.map((call) => call[1])).toEqual([
		"127.0.0.1",
		"127.0.0.1",
	]);
	expect(exchange.mock.calls.map(([url]) => url.href)).toEqual([start, final]);
});

it("counts only upgrades across mixed redirects using each current origin", async () => {
	const { transport, resolver, exchange } = fixture({
		httpsRedirectPolicy: policy,
	});
	const other = "https://other.example/next";
	const otherFinal = "https://other.example/final";
	const route = vi.fn((input: { url: string }) => {
		if (input.url === start) return response(start, 301, originalLocation);
		if (input.url === final) return response(final, 302, other);
		if (input.url === other)
			return response(other, 307, "http://other.example/final");
		return response(input.url);
	});
	const result = await transport.requestWithRoutes({ url: start }, route);
	expect(route.mock.calls.map(([input]) => input.url)).toEqual([
		start,
		final,
		other,
		otherFinal,
	]);
	expect(result.redirects).toEqual([
		{
			url: start,
			status: 301,
			location: final,
			httpsUpgrade: { policy, originalLocation },
		},
		{ url: final, status: 302, location: other },
		{
			url: other,
			status: 307,
			location: otherFinal,
			httpsUpgrade: { policy, originalLocation: "http://other.example/final" },
		},
	]);
	expect(Object.isFrozen(result.redirects[2].httpsUpgrade)).toBe(true);
	expect(transport.metrics()).toMatchObject({
		httpsRedirectUpgrades: 2,
		redirects: 3,
		requests: 4,
		active: 0,
	});
	await transport.requestWithRoutes({ url: start }, () => response(start));
	expect(transport.metrics()).toMatchObject({ httpsRedirectUpgrades: 2 });
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
});

it("keeps ordinary redirect provenance and default metrics absent", async () => {
	const { transport, exchange } = fixture();
	exchange
		.mockResolvedValueOnce(response(start, 302, "/final"))
		.mockResolvedValueOnce(response(final));
	const result = await transport.request({ url: start });
	expect(result.redirects).toEqual([
		{ url: start, status: 302, location: final },
	]);
	expect(transport.metrics()).not.toHaveProperty("httpsRedirectUpgrades");
});

it("enforces the redirect cap before another upgraded target is dispatched", async () => {
	const { transport, resolver, exchange } = fixture({
		httpsRedirectPolicy: policy,
		limits: { maxRedirects: 1 },
	});
	const route = vi.fn((input: { url: string }) =>
		response(input.url, 308, originalLocation),
	);
	await expect(
		transport.requestWithRoutes({ url: start }, route),
	).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(route.mock.calls.map(([input]) => input.url)).toEqual([start, final]);
	expect(transport.metrics()).toMatchObject({
		httpsRedirectUpgrades: 1,
		redirects: 1,
		active: 0,
	});
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
});

it.each(["abort", "close"] as const)(
	"cleans up on %s during upgraded-target DNS",
	async (action) => {
		const { transport, resolver, exchange } = fixture({
			httpsRedirectPolicy: policy,
		});
		const entered = deferred<AbortSignal>();
		const addresses = deferred<string[]>();
		const controller = new AbortController();
		resolver
			.mockResolvedValueOnce([publicAddress])
			.mockImplementationOnce((_hostname, signal) => {
				entered.resolve(signal);
				return addresses.promise;
			});
		exchange.mockResolvedValue(response(start, 308, originalLocation));
		const request = transport.request({
			url: start,
			signal: controller.signal,
		});
		pending.push(request);
		void request.catch(() => undefined);
		const targetSignal = await Promise.race([
			entered.promise,
			request.then(() => {
				throw new Error("Request completed before upgraded-target DNS");
			}),
		]);
		const rejection = expect(request).rejects.toMatchObject({
			code: action === "abort" ? "aborted" : "closed",
		});
		if (action === "abort") controller.abort();
		else transport.close();
		addresses.resolve([publicAddress]);
		await rejection;
		expect(targetSignal.aborted).toBe(true);
		expect(exchange).toHaveBeenCalledTimes(1);
		expect(transport.metrics()).toMatchObject({
			active: 0,
			closed: action === "close",
		});
		if (action === "abort") {
			exchange.mockResolvedValue(response(final));
			expect((await transport.request({ url: final })).url).toBe(final);
		} else {
			await expect(transport.request({ url: final })).rejects.toMatchObject({
				code: "closed",
			});
			expect(resolver).toHaveBeenCalledTimes(2);
		}
	},
);

it("never falls back to HTTP after an upgraded HTTPS exchange fails", async () => {
	const { transport, resolver, exchange } = fixture({
		httpsRedirectPolicy: policy,
	});
	exchange
		.mockResolvedValueOnce(response(start, 308, originalLocation))
		.mockRejectedValueOnce(
			Object.assign(new Error("Synthetic TLS failure"), {
				code: "CERT_HAS_EXPIRED",
			}),
		);
	await expect(transport.request({ url: start })).rejects.toMatchObject({
		code: "network-error",
	});
	expect(exchange.mock.calls.map(([url]) => url.href)).toEqual([start, final]);
	expect(resolver).toHaveBeenCalledTimes(2);
	expect(transport.metrics().active).toBe(0);
	exchange.mockResolvedValue(response(final));
	expect((await transport.request({ url: final })).url).toBe(final);
});

it("returns an upgraded HTTPS access denial without retry or fallback", async () => {
	const { transport, exchange } = fixture({ httpsRedirectPolicy: policy });
	exchange
		.mockResolvedValueOnce(response(start, 308, originalLocation))
		.mockResolvedValueOnce(response(final, 403));
	expect(await transport.request({ url: start })).toMatchObject({
		url: final,
		status: 403,
	});
	expect(exchange.mock.calls.map(([url]) => url.href)).toEqual([start, final]);
	expect(transport.metrics()).toMatchObject({
		httpsRedirectUpgrades: 1,
		active: 0,
	});
});
