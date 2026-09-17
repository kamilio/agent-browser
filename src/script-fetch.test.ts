import { expect, it } from "vitest";
import type { FetchCredentials } from "./cors.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import {
	type ScriptFetchContext,
	type ScriptFetchPolicy,
	fetchScriptResource,
} from "./script-fetch.js";

const documentUrl = "https://page.example/docs/index.html";
const origin = new URL(documentUrl).origin;
const same = "https://page.example/script.js";
const cross = "https://cdn.example/script.js";
const other = "https://other.example/script.js";
const anonymous = Object.freeze({
	mode: "cors",
	credentials: "same-origin",
} as const);

function response(
	url: string,
	headers: NetworkResponse["headers"] = {},
	status = 200,
): NetworkResponse {
	for (const values of Object.values(headers)) Object.freeze(values);
	return Object.freeze({
		url,
		status,
		headers: Object.freeze(headers),
		body: new TextEncoder().encode("globalThis.loaded = true;"),
		redirects: Object.freeze([]),
		encodedBytes: 10,
		elapsedMs: 2.5,
		routeId: 7,
	});
}

function harness(
	responses: readonly NetworkResponse[],
	options: Partial<Omit<ScriptFetchContext, "request">> = {},
) {
	const requests: NetworkRequest[] = [];
	const controller = new AbortController();
	const context: ScriptFetchContext = {
		documentUrl,
		signal: controller.signal,
		maxRedirects: 4,
		...options,
		request: async (input) => {
			requests.push(input);
			const output = responses[requests.length - 1];
			if (!output) throw new Error("Unexpected script request");
			return output;
		},
	};
	return { context, requests, controller };
}

it.each(["cors", "no-cors"] as const)(
	"fetches same-origin %s as basic using a manual GET and script Accept",
	async (mode) => {
		const original = response(same);
		const { context, requests } = harness([original], { maxRedirects: 0 });
		const result = await fetchScriptResource(
			"/script.js#fragment",
			{ mode, credentials: "same-origin" },
			context,
		);
		expect(result.type).toBe("basic");
		expect(Object.isFrozen(result)).toBe(true);
		expect(result.response).not.toBe(original);
		expect(result.response).toEqual(original);
		expect(requests).toEqual([
			{
				url: same,
				method: "GET",
				headers: { accept: "*/*" },
				redirect: "manual",
				signal: context.signal,
				cookieContext: {
					siteUrl: documentUrl,
					topLevelNavigation: false,
					credentials: "same-origin",
					crossSiteRedirect: false,
				},
			},
		]);
	},
);

it.each(["omit", "same-origin"] as const)(
	"accepts anonymous wildcard CORS with %s",
	async (credentials) => {
		const { context, requests } = harness([
			response(cross, { "Access-Control-Allow-Origin": [" \t* "] }),
		]);
		const result = await fetchScriptResource(
			cross,
			{ mode: "cors", credentials },
			context,
		);
		expect(result.type).toBe("cors");
		expect(requests[0].headers).toEqual({ accept: "*/*", origin });
		expect(requests[0].cookieContext?.credentials).toBe("omit");
	},
);

it("accepts credentialed CORS without filtering native bytes or metadata", async () => {
	const original = response(cross, {
		"access-control-allow-origin": [origin],
		"access-control-allow-credentials": ["true"],
		"x-private": ["fixture"],
		"set-cookie": ["fixture=value; Secure"],
	});
	const { context, requests } = harness([original]);
	const result = await fetchScriptResource(
		cross,
		{ mode: "cors", credentials: "include" },
		context,
	);
	expect(result.type).toBe("cors");
	expect(requests[0].cookieContext?.credentials).toBe("include");
	expect(result.response.headers).toBe(original.headers);
	expect(result.response.body).toBe(original.body);
	expect(result.response.routeId).toBe(7);
});

const deniedCors: [string, FetchCredentials, NetworkResponse["headers"]][] = [
	["missing permission", "same-origin", {}],
	[
		"wrong origin",
		"omit",
		{ "access-control-allow-origin": ["https://wrong.example"] },
	],
	[
		"wildcard with credentials",
		"include",
		{
			"access-control-allow-origin": ["*"],
			"access-control-allow-credentials": ["true"],
		},
	],
	["missing ACAC", "include", { "access-control-allow-origin": [origin] }],
	[
		"wrong ACAC case",
		"include",
		{
			"access-control-allow-origin": [origin],
			"access-control-allow-credentials": ["True"],
		},
	],
	[
		"duplicate origins",
		"same-origin",
		{
			"access-control-allow-origin": [origin],
			"Access-Control-Allow-Origin": [origin],
		},
	],
	[
		"duplicate credentials",
		"include",
		{
			"access-control-allow-origin": [origin],
			"access-control-allow-credentials": ["true", "true"],
		},
	],
];
it.each(deniedCors)(
	"rejects CORS %s before following redirects",
	async (_label, credentials, headers) => {
		const { context, requests } = harness([
			response(cross, { ...headers, location: [other] }, 302),
		]);
		await expect(
			fetchScriptResource(cross, { mode: "cors", credentials }, context),
		).rejects.toMatchObject({
			code: "policy-denied",
			message: "CORS response permission denied",
		});
		expect(requests).toHaveLength(1);
	},
);

it("checks final CORS permission", async () => {
	const { context, requests } = harness([response(cross)]);
	await expect(
		fetchScriptResource(cross, anonymous, context),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests).toHaveLength(1);
});

it.each([same, other])(
	"taints Origin and omits anonymous cookies across a redirect to %s",
	async (destination) => {
		const { context, requests } = harness([
			response(same, { location: [cross] }, 302),
			response(
				cross,
				{ location: [destination], "access-control-allow-origin": [origin] },
				307,
			),
			response(destination, { "access-control-allow-origin": ["null"] }),
		]);
		const result = await fetchScriptResource(same, anonymous, context);
		expect(result.type).toBe("cors");
		expect(requests.map((input) => input.url)).toEqual([
			same,
			cross,
			destination,
		]);
		expect(requests.map((input) => input.headers?.origin)).toEqual([
			undefined,
			origin,
			"null",
		]);
		expect(requests.map((input) => input.cookieContext)).toEqual(
			["same-origin", "omit", "omit"].map((credentials, index) => ({
				siteUrl: documentUrl,
				topLevelNavigation: false,
				credentials,
				crossSiteRedirect: index > 0,
			})),
		);
	},
);

it("requires null CORS permission after returning to the document origin", async () => {
	const { context, requests } = harness([
		response(
			cross,
			{ location: [same], "access-control-allow-origin": [origin] },
			302,
		),
		response(same, { "access-control-allow-origin": [origin] }),
	]);
	await expect(
		fetchScriptResource(cross, anonymous, context),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests[1].headers?.origin).toBe("null");
});

it("does not taint Origin for redirects within a foreign origin", async () => {
	const destination = "https://cdn.example/next.js";
	const { context, requests } = harness([
		response(
			cross,
			{ location: ["next.js"], "access-control-allow-origin": [origin] },
			302,
		),
		response(destination, { "access-control-allow-origin": [origin] }),
	]);
	await fetchScriptResource(cross, anonymous, context);
	expect(requests.map((input) => input.headers?.origin)).toEqual([
		origin,
		origin,
	]);
	expect(
		requests.map((input) => input.cookieContext?.crossSiteRedirect),
	).toEqual([false, false]);
});

it.each(["omit", "include"] as const)(
	"preserves explicit %s credentials on origin-tainted CORS chains",
	async (credentials) => {
		const grants = { "access-control-allow-credentials": ["true"] };
		const { context, requests } = harness([
			response(same, { location: [cross] }, 301),
			response(
				cross,
				{
					...grants,
					location: [same],
					"access-control-allow-origin": [origin],
				},
				303,
			),
			response(same, { ...grants, "access-control-allow-origin": ["null"] }),
		]);
		await fetchScriptResource(same, { mode: "cors", credentials }, context);
		expect(requests.map((input) => input.cookieContext?.credentials)).toEqual([
			credentials,
			credentials,
			credentials,
		]);
		expect(requests[2].headers?.origin).toBe("null");
	},
);

it.each(["omit", "same-origin", "include"] as const)(
	"keeps no-cors chains opaque without Origin using %s credentials",
	async (credentials) => {
		const { context, requests } = harness([
			response(same, { location: [cross] }, 302),
			response(cross, { location: [same] }, 302),
			response(same),
		]);
		const result = await fetchScriptResource(
			same,
			{ mode: "no-cors", credentials },
			context,
		);
		expect(result.type).toBe("opaque");
		expect(requests.map((input) => input.headers)).toEqual(
			Array(3).fill({ accept: "*/*" }),
		);
		expect(requests.map((input) => input.cookieContext?.credentials)).toEqual([
			credentials,
			credentials === "same-origin" ? "omit" : credentials,
			credentials === "same-origin" ? "omit" : credentials,
		]);
	},
);

it("classifies an initial no-cors cross-origin response as opaque", async () => {
	const { context } = harness([response(cross)]);
	const result = await fetchScriptResource(
		cross,
		{ mode: "no-cors", credentials: "include" },
		context,
	);
	expect(result.type).toBe("opaque");
});

it("keeps same-site cookie context separate from cross-origin taint", async () => {
	const port = "https://page.example:8443/script.js";
	const { context, requests } = harness([
		response(same, { location: [port] }, 302),
		response(
			port,
			{ location: [same], "access-control-allow-origin": [origin] },
			302,
		),
		response(same, { "access-control-allow-origin": ["null"] }),
	]);
	await fetchScriptResource(same, anonymous, context);
	expect(
		requests.map((input) => input.cookieContext?.crossSiteRedirect),
	).toEqual([false, false, false]);
	expect(requests.map((input) => input.cookieContext?.credentials)).toEqual([
		"same-origin",
		"omit",
		"omit",
	]);
});

it.each([301, 302, 303, 307, 308])(
	"follows %s manually, resolving URLs and aggregating immutable records",
	async (status) => {
		const destination = "https://page.example/a,b.js";
		const original = response(same, { location: ["a,b.js#ignored"] }, status);
		const final = response(destination);
		const before = structuredClone([original, final]);
		const { context, requests } = harness([original, final], {
			maxRedirects: 1,
		});
		const result = await fetchScriptResource(same, anonymous, context);
		expect(result.response).toEqual({
			...final,
			redirects: [{ url: same, status, location: destination }],
			encodedBytes: 20,
			elapsedMs: 5,
		});
		expect(Object.isFrozen(result.response.redirects)).toBe(true);
		expect(Object.isFrozen(result.response.redirects[0])).toBe(true);
		expect([original, final]).toEqual(before);
		expect(requests.map((input) => input.url)).toEqual([same, destination]);
		expect(
			requests.every(
				(input) =>
					input.method === "GET" &&
					input.redirect === "manual" &&
					input.signal === context.signal,
			),
		).toBe(true);
	},
);

it.each([200, 304, 404])(
	"leaves status %s, MIME and byte acceptance to the loader",
	async (status) => {
		const original = response(
			same,
			{ location: [cross], "content-type": ["text/html"] },
			status,
		);
		const { context, requests } = harness([original], { maxRedirects: 0 });
		const result = await fetchScriptResource(same, anonymous, context);
		expect(result.response).toEqual(original);
		expect(result.response.body).toBe(original.body);
		expect(requests).toHaveLength(1);
	},
);

it("does not manufacture a redirect without Location", async () => {
	const { context, requests } = harness([response(same, {}, 302)], {
		maxRedirects: 0,
	});
	const result = await fetchScriptResource(same, anonymous, context);
	expect(result.response.status).toBe(302);
	expect(requests).toHaveLength(1);
});

it.each([0, 1, 20])("bounds redirect loops at %s", async (maxRedirects) => {
	const originals = Array.from({ length: maxRedirects + 1 }, () =>
		response(same, { location: [same] }, 302),
	);
	const { context, requests } = harness(originals, { maxRedirects });
	await expect(
		fetchScriptResource(same, anonymous, context),
	).rejects.toMatchObject({
		code: "resource-limit",
		message: "Script redirect limit exceeded",
	});
	expect(requests).toHaveLength(maxRedirects + 1);
});

it.each([-1, 21, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects invalid redirect budget %s before dispatch",
	async (maxRedirects) => {
		const { context, requests } = harness([], { maxRedirects });
		await expect(
			fetchScriptResource(same, anonymous, context),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(requests).toHaveLength(0);
	},
);

const ambiguousLocations: NetworkResponse["headers"][] = [
	{ location: [] },
	{ location: [same, same] },
	{ location: [same], Location: [cross] },
];
it.each(ambiguousLocations)(
	"rejects ambiguous Location %j before dispatch",
	async (headers) => {
		const { context, requests } = harness([response(same, headers, 302)]);
		await expect(
			fetchScriptResource(same, anonymous, context),
		).rejects.toMatchObject({
			code: "network-error",
			message: "Ambiguous script redirect location",
		});
		expect(requests).toHaveLength(1);
	},
);

it.each(["changed-url", "hidden-history"] as const)(
	"rejects an adapter's hidden redirect: %s",
	async (kind) => {
		const { context, requests } = harness([
			{
				...response(kind === "changed-url" ? cross : same),
				redirects:
					kind === "hidden-history"
						? [{ url: same, status: 302, location: cross }]
						: [],
			},
		]);
		await expect(
			fetchScriptResource(same, anonymous, context),
		).rejects.toMatchObject({
			code: "policy-denied",
			message: "Script fetch adapter must not follow redirects",
		});
		expect(requests).toHaveLength(1);
	},
);

it.each([
	"http://page.example/script.js",
	"data:text/javascript,void(0)",
	"file:///script.js",
	"ftp://page.example/script.js",
	"javascript:void(0)",
	"https://user:fixture@page.example/script.js",
	"https://[bad",
	"https://page.example/\nscript.js",
	"x".repeat(16_385),
])("rejects unsafe initial, redirect and final URLs %#", async (url) => {
	const initial = harness([]);
	await expect(
		fetchScriptResource(url, anonymous, initial.context),
	).rejects.toBeInstanceOf(Error);
	expect(initial.requests).toHaveLength(0);
	const redirected = harness([response(same, { location: [url] }, 302)]);
	await expect(
		fetchScriptResource(same, anonymous, redirected.context),
	).rejects.toBeInstanceOf(Error);
	expect(redirected.requests).toHaveLength(1);
	const final = harness([response(url)]);
	await expect(
		fetchScriptResource(same, anonymous, final.context),
	).rejects.toBeInstanceOf(Error);
	expect(final.requests).toHaveLength(1);
});

it("retains HTTPS policy across cross-origin redirects", async () => {
	const { context, requests } = harness([
		response(same, { location: [cross] }, 302),
		response(
			cross,
			{
				location: ["http://other.example/script.js"],
				"access-control-allow-origin": [origin],
			},
			302,
		),
	]);
	await expect(
		fetchScriptResource(same, anonymous, context),
	).rejects.toMatchObject({
		code: "policy-denied",
		message: "Mixed-content script fetch is not allowed",
	});
	expect(requests).toHaveLength(2);
});

it("permits HTTP resources for HTTP documents", async () => {
	const url = "http://page.example/script.js";
	const { context } = harness([response(url)], {
		documentUrl: "http://page.example/",
	});
	expect((await fetchScriptResource(url, anonymous, context)).type).toBe(
		"basic",
	);
});

it.each([
	{ "bad header": ["fixture"] },
	{ ["x".repeat(257)]: ["fixture"] },
	{ "x-invalid": ["fixture\n"] },
	{ "x-invalid": ["\u0100"] },
	{ "x-invalid": [42] },
	{ "x-invalid": "fixture" },
	{ "x-long": ["x".repeat(16_385)] },
	{ "x-first": ["x".repeat(8192)], "x-second": ["x".repeat(8192)] },
])("rejects malformed or oversized headers %#", async (headers) => {
	const { context, requests } = harness([
		{
			...response(same),
			headers: {
				...headers,
				location: [cross],
			} as unknown as NetworkResponse["headers"],
			status: 302,
		},
	]);
	await expect(
		fetchScriptResource(same, anonymous, context),
	).rejects.toBeInstanceOf(Error);
	expect(requests).toHaveLength(1);
});

it("checks CSP before each request and on each response", async () => {
	const checked: [string, number][] = [];
	const { context } = harness(
		[
			response(same, { location: [cross] }, 302),
			response(cross, { "access-control-allow-origin": [origin] }),
		],
		{
			checkContentSecurityPolicy: (url, redirectCount) => {
				checked.push([url, redirectCount]);
			},
		},
	);
	await fetchScriptResource(same, anonymous, context);
	expect(checked).toEqual([
		[same, 0],
		[same, 0],
		[cross, 1],
		[cross, 1],
	]);
});

it.each([1, 2, 3, 4])(
	"stops dispatch or acceptance when CSP check %s denies or cancels",
	async (stopAt) => {
		for (const cancel of [false, true]) {
			const { context, requests, controller } = harness([
				response(same, { location: [cross] }, 302),
				response(cross, { "access-control-allow-origin": [origin] }),
			]);
			const reason = new Error("fixture CSP stop");
			let checks = 0;
			await expect(
				fetchScriptResource(same, anonymous, {
					...context,
					checkContentSecurityPolicy: () => {
						if (++checks !== stopAt) return;
						if (cancel) controller.abort(reason);
						else throw reason;
					},
				}),
			).rejects.toBe(reason);
			expect(checks).toBe(stopAt);
			expect(requests).toHaveLength(Math.floor(stopAt / 2));
		}
	},
);

it("does not dispatch an already cancelled fetch", async () => {
	const { context, controller, requests } = harness([]);
	const reason = new Error("fixture cancellation");
	controller.abort(reason);
	await expect(fetchScriptResource(same, anonymous, context)).rejects.toBe(
		reason,
	);
	expect(requests).toHaveLength(0);
});

it.each([200, 302])(
	"checks cancellation after status %s before accepting or following",
	async (status) => {
		const { context, controller, requests } = harness([
			response(same, { location: [cross] }, status),
		]);
		const reason = new Error("cancelled during response");
		await expect(
			fetchScriptResource(same, anonymous, {
				...context,
				request: async (input) => {
					const output = await context.request(input);
					controller.abort(reason);
					return output;
				},
			}),
		).rejects.toBe(reason);
		expect(requests).toHaveLength(1);
	},
);

it("propagates transport failures without retrying", async () => {
	const { context } = harness([]);
	const reason = new Error("fixture transport failure");
	let requests = 0;
	await expect(
		fetchScriptResource(same, anonymous, {
			...context,
			request: async () => {
				requests++;
				throw reason;
			},
		}),
	).rejects.toBe(reason);
	expect(requests).toBe(1);
});

it("captures policy and redirect budget before awaiting transport", async () => {
	const policy: { mode: "cors" | "no-cors"; credentials: FetchCredentials } = {
		...anonymous,
	};
	const { context, requests } = harness([
		response(same, { location: [cross] }, 302),
		response(
			cross,
			{ location: [other], "access-control-allow-origin": [origin] },
			302,
		),
	]);
	const mutable = {
		...context,
		maxRedirects: 1,
		request: async (input: NetworkRequest) => {
			policy.mode = "no-cors";
			policy.credentials = "include";
			mutable.maxRedirects = 20;
			mutable.documentUrl = cross;
			return context.request(input);
		},
	};
	await expect(
		fetchScriptResource(same, policy, mutable),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(requests).toHaveLength(2);
	expect(requests[1].headers?.origin).toBe(origin);
	expect(requests[1].cookieContext?.credentials).toBe("omit");
	expect(requests[1].cookieContext?.siteUrl).toBe(documentUrl);
});

it.each([
	null,
	{},
	{ mode: "same-origin", credentials: "omit" },
	{ mode: "cors", credentials: "invalid" },
])("rejects malformed policy %j without dispatch", async (policy) => {
	const { context, requests } = harness([]);
	await expect(
		fetchScriptResource(same, policy as ScriptFetchPolicy, context),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(requests).toHaveLength(0);
});

it.each([
	{ signal: {} },
	{ request: null },
	{ documentUrl: "data:text/html,fixture" },
	{ checkContentSecurityPolicy: true },
])("rejects malformed context %j without dispatch", async (overrides) => {
	const { context, requests } = harness([]);
	await expect(
		fetchScriptResource(same, anonymous, {
			...context,
			...overrides,
		} as unknown as ScriptFetchContext),
	).rejects.toBeInstanceOf(Error);
	expect(requests).toHaveLength(0);
});
