import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { PageFetch } from "./page-fetch.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

const trees: DocumentTree[] = [];
const target = "https://api.example/data";
function fixture(
	options: ConstructorParameters<typeof PageFetch>[3] = {},
	rewrite?: (
		input: NetworkRequest,
		response: NetworkResponse,
	) => NetworkResponse,
) {
	const tree = new DocumentTree("https://example.com/page");
	trees.push(tree);
	const calls: NetworkRequest[] = [];
	const headers: Record<string, string[]> = {
		"access-control-allow-origin": ["https://example.com"],
		"access-control-allow-credentials": ["true"],
		"access-control-allow-methods": ["PUT, DELETE"],
		"access-control-allow-headers": ["x-first, x-second"],
	};
	let failure = false;
	const owner = new PageFetch(
		tree,
		{
			createHostObject(definition: ScriptHostObjectDefinition) {
				const object = { ...definition.methods };
				for (const [name, descriptor] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(object, name, descriptor);
				return object;
			},
		},
		async (input): Promise<NetworkResponse> => {
			calls.push(input);
			if (failure && input.method !== "OPTIONS") throw new Error("offline");
			const response: NetworkResponse = {
				url: input.url,
				status: 204,
				headers,
				body: new Uint8Array(),
				redirects: [],
				encodedBytes: 0,
				elapsedMs: 0,
			};
			return rewrite ? rewrite(input, response) : response;
		},
		options,
	);
	return {
		owner,
		calls,
		headers,
		tree,
		fail: () => {
			failure = true;
		},
		recover: () => {
			failure = false;
		},
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("reuses granted methods and headers, not just an identical request", async () => {
	const { owner, calls } = fixture();
	await owner.fetch(target, { method: "PUT", headers: { "x-first": "one" } });
	await owner.fetch(target, {
		method: "DELETE",
		headers: { "x-second": "two" },
	});
	expect(calls.map((call) => call.method)).toEqual([
		"OPTIONS",
		"PUT",
		"DELETE",
	]);
});

it("keeps exact URL and credential permissions isolated", async () => {
	const { owner, calls } = fixture();
	await owner.fetch(target, { method: "PUT" });
	await owner.fetch(target, { method: "PUT", credentials: "include" });
	await owner.fetch(target, { method: "DELETE", credentials: "omit" });
	await owner.fetch(`${target}?other`, { method: "PUT" });
	expect(calls.filter((call) => call.method === "OPTIONS")).toHaveLength(3);
});

it("checks actual CORS responses even on cache hits", async () => {
	const { owner, headers } = fixture();
	await owner.fetch(target, { method: "PUT" });
	headers["access-control-allow-origin"] = ["https://wrong.example"];
	await expect(owner.fetch(target, { method: "PUT" })).rejects.toThrow();
	expect(owner.metrics().preflights).toBe(1);
});

it("invalidates grants after a failed actual request", async () => {
	const { owner, fail, recover } = fixture();
	await owner.fetch(target, { method: "PUT" });
	fail();
	await expect(owner.fetch(target, { method: "PUT" })).rejects.toThrow(
		"offline",
	);
	recover();
	await owner.fetch(target, { method: "DELETE" });
	expect(owner.metrics().preflights).toBe(2);
});

it("does not share preflight grants between document owners", async () => {
	const first = fixture();
	const second = fixture();
	await first.owner.fetch(target, { method: "PUT" });
	await second.owner.fetch(target, { method: "PUT" });
	expect(second.owner.metrics().preflights).toBe(1);
});

it("does not retain a zero max-age grant", async () => {
	const { owner, headers } = fixture();
	headers["access-control-max-age"] = ["0"];
	await owner.fetch(target, { method: "PUT" });
	await owner.fetch(target, { method: "PUT" });
	expect(owner.metrics().preflights).toBe(2);
});

it("expires page-owner grants against the injected native clock", async () => {
	let now = 0;
	const { owner } = fixture({ preflightClock: () => now });
	await owner.fetch(target, { method: "PUT" });
	now = 4999;
	await owner.fetch(target, { method: "DELETE" });
	now = 5000;
	await owner.fetch(target, { method: "PUT" });
	expect(owner.metrics().preflights).toBe(2);
	expect(owner.metrics().preflightCache).toMatchObject({ hits: 1, misses: 2 });
});

it("removes retained grants on document teardown", async () => {
	const { owner, tree } = fixture();
	await owner.fetch(target, { method: "PUT" });
	expect(owner.metrics().preflightCache.entries).toBeGreaterThan(0);
	tree.close();
	expect(owner.metrics().preflightCache).toMatchObject({
		entries: 0,
		retainedUnits: 0,
	});
	await expect(owner.fetch(target, { method: "PUT" })).rejects.toThrow(
		"closed",
	);
});

it("does not confuse the preflight cache with the HTTP response cache", async () => {
	const { owner, calls } = fixture();
	await owner.fetch(`${target}#first`, { method: "PUT", cache: "no-store" });
	await owner.fetch(`${target}#second`, { method: "PUT", cache: "no-store" });
	expect(calls.map((call) => call.method)).toEqual(["OPTIONS", "PUT", "PUT"]);
	expect(calls.every((call) => call.url === target)).toBe(true);
});

it("reuses header grants for safelisted methods without a method grant", async () => {
	const { owner, headers, calls } = fixture();
	Reflect.deleteProperty(headers, "access-control-allow-methods");
	await owner.fetch(target, { method: "POST", headers: { "x-first": "one" } });
	await owner.fetch(target, { headers: { "x-second": "two" } });
	expect(calls.map((call) => call.method)).toEqual(["OPTIONS", "POST", "GET"]);
});

it("never sends an ungranted unsafe method", async () => {
	const { owner, calls } = fixture();
	await owner.fetch(target, { method: "PUT" });
	await expect(owner.fetch(target, { method: "PATCH" })).rejects.toThrow(
		"CORS",
	);
	expect(calls.map((call) => call.method)).toEqual([
		"OPTIONS",
		"PUT",
		"OPTIONS",
	]);
	expect(owner.metrics().preflightCache.entries).toBe(0);
});

it("never sends an ungranted unsafe header", async () => {
	const { owner, calls } = fixture();
	await owner.fetch(target, { method: "PUT" });
	await expect(
		owner.fetch(target, { method: "PUT", headers: { "x-secret": "one" } }),
	).rejects.toThrow("CORS");
	expect(calls.map((call) => call.method)).toEqual([
		"OPTIONS",
		"PUT",
		"OPTIONS",
	]);
});

it("does not grant authorization through a cached wildcard", async () => {
	const { owner, headers, calls } = fixture();
	headers["access-control-allow-headers"] = ["*"];
	await owner.fetch(target, { method: "PUT", headers: { "x-first": "one" } });
	await expect(
		owner.fetch(target, {
			method: "PUT",
			headers: { authorization: "secret" },
		}),
	).rejects.toThrow("CORS");
	expect(calls.map((call) => call.method)).toEqual([
		"OPTIONS",
		"PUT",
		"OPTIONS",
	]);
});

it("does not amplify credentialed wildcard response tokens", async () => {
	const { owner, headers } = fixture();
	headers["access-control-allow-methods"] = ["PUT, *"];
	headers["access-control-allow-headers"] = ["x-first, *"];
	await owner.fetch(target, {
		method: "PUT",
		credentials: "include",
		headers: { "x-first": "one" },
	});
	await expect(
		owner.fetch(target, { method: "DELETE", credentials: "include" }),
	).rejects.toThrow("CORS");
	expect(owner.metrics().preflights).toBe(2);
});

it("clears all credential variants after an actual CORS failure", async () => {
	const { owner, headers } = fixture();
	await owner.fetch(target, { method: "PUT" });
	await owner.fetch(target, { method: "PUT", credentials: "include" });
	headers["access-control-allow-origin"] = ["https://wrong.example"];
	await expect(owner.fetch(target, { method: "PUT" })).rejects.toThrow("CORS");
	expect(owner.metrics().preflightCache.entries).toBe(0);
	headers["access-control-allow-origin"] = ["https://example.com"];
	await owner.fetch(target, { method: "PUT", credentials: "include" });
	expect(owner.metrics().preflights).toBe(3);
});

it("does not cache failed preflight responses", async () => {
	let denied = true;
	const { owner, calls } = fixture({}, (input, response) =>
		input.method === "OPTIONS" && denied
			? { ...response, status: 403 }
			: response,
	);
	await expect(owner.fetch(target, { method: "PUT" })).rejects.toThrow("CORS");
	expect(owner.metrics().preflightCache.entries).toBe(0);
	denied = false;
	await owner.fetch(target, { method: "PUT" });
	expect(calls.map((call) => call.method)).toEqual([
		"OPTIONS",
		"OPTIONS",
		"PUT",
	]);
});

it("checks preflight permissions separately at redirected URLs", async () => {
	const next = "https://other.example/final";
	const { owner, calls } = fixture({}, (input, response) => {
		if (input.url === target && input.method !== "OPTIONS")
			return {
				...response,
				status: 307,
				headers: { ...response.headers, location: [next] },
			};
		if (input.url === next)
			return {
				...response,
				headers: {
					...response.headers,
					"access-control-allow-origin": ["null"],
				},
			};
		return response;
	});
	await owner.fetch(target, { method: "PUT" });
	await owner.fetch(target, { method: "PUT" });
	expect(
		calls
			.filter((call) => call.method === "OPTIONS")
			.map((call) => [call.url, call.headers?.origin]),
	).toEqual([
		[target, "https://example.com"],
		[next, "null"],
	]);
	await expect(owner.fetch(next, { method: "PUT" })).rejects.toThrow("CORS");
	expect(owner.metrics().preflights).toBe(3);
});

it("treats a failed native clock as no cache rather than bypassing preflight", async () => {
	const { owner } = fixture({
		preflightClock: () => {
			throw new Error("clock");
		},
	});
	await owner.fetch(target, { method: "PUT" });
	await owner.fetch(target, { method: "PUT" });
	expect(owner.metrics().preflights).toBe(2);
});
