import { expect, it } from "vitest";
import type { FetchCredentials } from "./cors.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import {
	type StylesheetFetchContext,
	type StylesheetFetchPolicy,
	fetchStylesheetResource,
} from "./stylesheet-fetch.js";

const documentUrl = "https://page.example/docs/index.html";
const origin = new URL(documentUrl).origin;
const same = "https://page.example/style.css";
const cross = "https://cdn.example/style.css";
const other = "https://other.example/style.css";
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
		body: new TextEncoder().encode("body { color: green }"),
		redirects: Object.freeze([]),
		encodedBytes: 10,
		elapsedMs: 2.5,
		routeId: 7,
	});
}

function harness(
	responses: readonly NetworkResponse[],
	options: Partial<Omit<StylesheetFetchContext, "request">> = {},
) {
	const requests: NetworkRequest[] = [];
	const controller = new AbortController();
	const context: StylesheetFetchContext = {
		documentUrl,
		signal: controller.signal,
		maxRedirects: 4,
		...options,
		request: async (input) => {
			requests.push(input);
			const output = responses[requests.length - 1];
			if (!output) throw new Error("Unexpected stylesheet request");
			expect(input.url).toBe(output.url);
			return output;
		},
	};
	return { context, requests, controller };
}

it.each(["cors", "no-cors"] as const)(
	"fetches same-origin %s as basic with only native GET options",
	async (mode) => {
		const original = response(same);
		const { context, requests } = harness([original], { maxRedirects: 0 });
		const result = await fetchStylesheetResource(
			"/style.css#fragment",
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
				headers: { accept: "text/css" },
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

it.each(["omit", "same-origin", "include"] as const)(
	"preserves same-origin %s credentials",
	async (credentials) => {
		const { context, requests } = harness([response(same)]);
		await fetchStylesheetResource(same, { mode: "cors", credentials }, context);
		expect(requests[0].cookieContext?.credentials).toBe(credentials);
	},
);

it.each(["omit", "same-origin"] as const)(
	"allows anonymous wildcard CORS with %s",
	async (credentials) => {
		const { context, requests } = harness([
			response(cross, { "Access-Control-Allow-Origin": [" \t* "] }),
		]);
		const result = await fetchStylesheetResource(
			cross,
			{ mode: "cors", credentials },
			context,
		);
		expect(result.type).toBe("cors");
		expect(requests[0].headers).toEqual({ accept: "text/css", origin });
		expect(requests[0].cookieContext?.credentials).toBe("omit");
	},
);

it("accepts explicit origin and credential permission without filtering native response metadata", async () => {
	const original = response(cross, {
		"access-control-allow-origin": [origin],
		"access-control-allow-credentials": ["true"],
		"x-private": ["fixture"],
	});
	const { context, requests } = harness([original]);
	const result = await fetchStylesheetResource(
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
	[
		"missing credential approval",
		"include",
		{ "access-control-allow-origin": [origin] },
	],
	[
		"wrong credential case",
		"include",
		{
			"access-control-allow-origin": [origin],
			"access-control-allow-credentials": ["True"],
		},
	],
	[
		"duplicate origins",
		"same-origin",
		{ "access-control-allow-origin": [origin, origin] },
	],
	[
		"case-variant duplicate origins",
		"same-origin",
		{
			"access-control-allow-origin": [origin],
			"Access-Control-Allow-Origin": [origin],
		},
	],
	[
		"combined origins",
		"omit",
		{ "access-control-allow-origin": [`${origin}, ${origin}`] },
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
	"rejects CORS %s before following a redirect",
	async (_label, credentials, headers) => {
		const { context, requests } = harness([
			response(cross, { ...headers, location: [other] }, 302),
		]);
		await expect(
			fetchStylesheetResource(cross, { mode: "cors", credentials }, context),
		).rejects.toMatchObject({
			code: "policy-denied",
			message: "CORS response permission denied",
		});
		expect(requests).toHaveLength(1);
	},
);

it("rejects a final cross-origin response without permission", async () => {
	const { context, requests } = harness([response(cross)]);
	await expect(
		fetchStylesheetResource(cross, anonymous, context),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests).toHaveLength(1);
});

it.each([same, other])(
	"taints origin to null and omits anonymous credentials on returning or further cross-origin hop %s",
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
		const result = await fetchStylesheetResource(same, anonymous, context);
		expect(result.type).toBe("cors");
		expect(requests.map((input) => input.headers?.origin)).toEqual([
			undefined,
			origin,
			"null",
		]);
		expect(requests.map((input) => input.cookieContext)).toEqual([
			{
				siteUrl: documentUrl,
				topLevelNavigation: false,
				credentials: "same-origin",
				crossSiteRedirect: false,
			},
			{
				siteUrl: documentUrl,
				topLevelNavigation: false,
				credentials: "omit",
				crossSiteRedirect: true,
			},
			{
				siteUrl: documentUrl,
				topLevelNavigation: false,
				credentials: "omit",
				crossSiteRedirect: true,
			},
		]);
	},
);

it("requires null permission even after a redirect back to the document origin", async () => {
	const { context, requests } = harness([
		response(
			cross,
			{ location: [same], "access-control-allow-origin": [origin] },
			302,
		),
		response(same, { "access-control-allow-origin": [origin] }),
	]);
	await expect(
		fetchStylesheetResource(cross, anonymous, context),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests[1].headers?.origin).toBe("null");
});

it("does not taint Origin to null on redirects within the same foreign origin", async () => {
	const destination = "https://cdn.example/next.css";
	const { context, requests } = harness([
		response(
			cross,
			{ location: ["next.css"], "access-control-allow-origin": [origin] },
			302,
		),
		response(destination, { "access-control-allow-origin": [origin] }),
	]);
	await fetchStylesheetResource(cross, anonymous, context);
	expect(requests.map((input) => input.headers?.origin)).toEqual([
		origin,
		origin,
	]);
	expect(
		requests.map((input) => input.cookieContext?.crossSiteRedirect),
	).toEqual([false, false]);
});

it.each(["omit", "include"] as const)(
	"keeps explicit %s credentials across null-origin redirects",
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
		await fetchStylesheetResource(same, { mode: "cors", credentials }, context);
		expect(requests.map((input) => input.cookieContext?.credentials)).toEqual([
			credentials,
			credentials,
			credentials,
		]);
		expect(requests[2].headers?.origin).toBe("null");
	},
);

it.each(["omit", "same-origin", "include"] as const)(
	"keeps no-cors cross-origin returns opaque with %s credentials and no Origin header",
	async (credentials) => {
		const { context, requests } = harness([
			response(same, { location: [cross] }, 302),
			response(cross, { location: [same] }, 302),
			response(same),
		]);
		const result = await fetchStylesheetResource(
			same,
			{ mode: "no-cors", credentials },
			context,
		);
		expect(result.type).toBe("opaque");
		expect(requests.map((input) => input.headers)).toEqual(
			Array(3).fill({ accept: "text/css" }),
		);
		expect(requests.map((input) => input.cookieContext?.credentials)).toEqual([
			credentials,
			credentials === "same-origin" ? "omit" : credentials,
			credentials === "same-origin" ? "omit" : credentials,
		]);
		expect(
			requests.map((input) => input.cookieContext?.crossSiteRedirect),
		).toEqual([false, true, true]);
	},
);

it("returns initial cross-origin no-cors as opaque without CORS grants", async () => {
	const { context } = harness([response(cross)]);
	expect(
		(
			await fetchStylesheetResource(
				cross,
				{ mode: "no-cors", credentials: "include" },
				context,
			)
		).type,
	).toBe("opaque");
});

it("uses the existing same-site predicate separately from origin taint", async () => {
	const port = "https://page.example:8443/style.css";
	const { context, requests } = harness([
		response(same, { location: [port] }, 302),
		response(
			port,
			{ location: [same], "access-control-allow-origin": [origin] },
			302,
		),
		response(same, { "access-control-allow-origin": ["null"] }),
	]);
	await fetchStylesheetResource(same, anonymous, context);
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
	"follows status %s manually and aggregates immutable response records",
	async (status) => {
		const destination = "https://page.example/next.css";
		const original = response(same, { location: ["next.css#ignored"] }, status);
		const final = response(destination);
		const before = structuredClone([original, final]);
		const { context, requests } = harness([original, final], {
			maxRedirects: 1,
		});
		const result = await fetchStylesheetResource(same, anonymous, context);
		expect(result.type).toBe("basic");
		expect(result.response).toEqual({
			...final,
			redirects: [{ url: same, status, location: destination }],
			encodedBytes: 20,
			elapsedMs: 5,
		});
		expect(Object.isFrozen(result.response.redirects)).toBe(true);
		expect(Object.isFrozen(result.response.redirects[0])).toBe(true);
		expect([original, final]).toEqual(before);
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

it.each([200, 204, 300, 304, 305, 306, 400, 404, 500])(
	"leaves status %s and MIME acceptance to the loader",
	async (status) => {
		const { context, requests } = harness(
			[
				response(
					same,
					{ location: [cross], "content-type": ["text/html"] },
					status,
				),
			],
			{ maxRedirects: 0 },
		);
		const result = await fetchStylesheetResource(same, anonymous, context);
		expect(result.response.status).toBe(status);
		expect(result.response.headers["content-type"]).toEqual(["text/html"]);
		expect(result.response.redirects).toEqual([]);
		expect(requests).toHaveLength(1);
	},
);

it.each([301, 302, 303, 307, 308])(
	"returns status %s without a Location rather than manufacturing a request",
	async (status) => {
		const { context, requests } = harness([response(same, {}, status)], {
			maxRedirects: 0,
		});
		expect(
			(await fetchStylesheetResource(same, anonymous, context)).response.status,
		).toBe(status);
		expect(requests).toHaveLength(1);
	},
);

it.each([0, 1, 3, 20])(
	"bounds redirect loops by the original budget %s",
	async (maxRedirects) => {
		const originals = Array.from({ length: maxRedirects + 1 }, () =>
			response(same, { location: [same] }, 302),
		);
		const { context, requests } = harness(originals, { maxRedirects });
		await expect(
			fetchStylesheetResource(same, anonymous, context),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(requests).toHaveLength(maxRedirects + 1);
	},
);

it("allows exactly twenty redirects, without raising the hard ceiling", async () => {
	const originals = Array.from({ length: 20 }, () =>
		response(same, { location: [same] }, 308),
	);
	const { context, requests } = harness([...originals, response(same)], {
		maxRedirects: 20,
	});
	const result = await fetchStylesheetResource(same, anonymous, context);
	expect(requests).toHaveLength(21);
	expect(result.response.redirects).toHaveLength(20);
	expect(result.response.encodedBytes).toBe(210);
	expect(result.response.elapsedMs).toBe(52.5);
});

const ambiguousLocations: NetworkResponse["headers"][] = [
	{ location: [] },
	{ location: [same, same] },
	{ location: [same], Location: [cross] },
];
it.each(ambiguousLocations)(
	"rejects ambiguous Location headers %j before dispatch",
	async (headers) => {
		const { context, requests } = harness([response(same, headers, 302)]);
		await expect(
			fetchStylesheetResource(same, anonymous, context),
		).rejects.toMatchObject({
			code: "network-error",
			message: "Ambiguous stylesheet redirect location",
		});
		expect(requests).toHaveLength(1);
	},
);

it("does not split a single valid comma-containing Location into multiple URLs", async () => {
	const destination = "https://page.example/a,b.css";
	const { context } = harness([
		response(same, { location: ["/a,b.css"] }, 302),
		response(destination),
	]);
	expect(
		(await fetchStylesheetResource(same, anonymous, context)).response.url,
	).toBe(destination);
});

it.each(["changed-url", "hidden-history"] as const)(
	"rejects transport-followed redirects: %s",
	async (kind) => {
		const { context, requests } = harness([response(same)]);
		const request = context.request;
		const redirected: NetworkResponse = {
			...response(kind === "changed-url" ? cross : same),
			redirects:
				kind === "hidden-history"
					? [{ url: same, status: 302, location: cross }]
					: [],
		};
		await expect(
			fetchStylesheetResource(same, anonymous, {
				...context,
				request: async (input) => {
					await request(input);
					return redirected;
				},
			}),
		).rejects.toMatchObject({
			code: "policy-denied",
			message: "Stylesheet fetch adapter must not follow redirects",
		});
		expect(requests).toHaveLength(1);
	},
);

it.each([
	"http://page.example/style.css",
	"data:text/css,body{}",
	"file:///style.css",
	"https://user:fixture@page.example/style.css",
	"https://[bad",
	"https://page.example/\nstyle.css",
])("rejects unsafe initial and redirect targets %s", async (url) => {
	const initial = harness([]);
	await expect(
		fetchStylesheetResource(url, anonymous, initial.context),
	).rejects.toBeInstanceOf(Error);
	expect(initial.requests).toHaveLength(0);
	const redirected = harness([response(same, { location: [url] }, 302)]);
	await expect(
		fetchStylesheetResource(same, anonymous, redirected.context),
	).rejects.toBeInstanceOf(Error);
	expect(redirected.requests).toHaveLength(1);
});

it("keeps the original HTTPS document policy across cross-origin redirects", async () => {
	const { context, requests } = harness([
		response(same, { location: [cross] }, 302),
		response(
			cross,
			{
				location: ["http://other.example/style.css"],
				"access-control-allow-origin": [origin],
			},
			302,
		),
	]);
	await expect(
		fetchStylesheetResource(same, anonymous, context),
	).rejects.toMatchObject({
		code: "policy-denied",
		message: "Mixed-content stylesheet fetch is not allowed",
	});
	expect(requests).toHaveLength(2);
});

it("supports HTTP resources from an HTTP document", async () => {
	const url = "http://page.example/style.css";
	const { context } = harness([response(url)], {
		documentUrl: "http://page.example/",
	});
	expect((await fetchStylesheetResource(url, anonymous, context)).type).toBe(
		"basic",
	);
});

it("does not dispatch when already aborted", async () => {
	const { context, controller, requests } = harness([]);
	const reason = new Error("fixture cancellation");
	controller.abort(reason);
	await expect(fetchStylesheetResource(same, anonymous, context)).rejects.toBe(
		reason,
	);
	expect(requests).toHaveLength(0);
});

it.each([200, 302])(
	"checks cancellation after status %s and before accepting or following",
	async (status) => {
		const { context, controller, requests } = harness([
			response(same, { location: [cross] }, status),
		]);
		const request = context.request;
		const reason = new Error("cancelled during response");
		await expect(
			fetchStylesheetResource(same, anonymous, {
				...context,
				request: async (input) => {
					const output = await request(input);
					controller.abort(reason);
					return output;
				},
			}),
		).rejects.toBe(reason);
		expect(requests).toHaveLength(1);
	},
);

it("preserves transport failures without retrying", async () => {
	const { context } = harness([]);
	const failure = new Error("fixture transport error");
	let calls = 0;
	await expect(
		fetchStylesheetResource(same, anonymous, {
			...context,
			request: async () => {
				calls++;
				throw failure;
			},
		}),
	).rejects.toBe(failure);
	expect(calls).toBe(1);
});

it("captures original caller policy and redirect budget before awaiting", async () => {
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
	const request = context.request;
	const mutable = {
		...context,
		maxRedirects: 1,
		request: async (input: NetworkRequest) => {
			policy.mode = "no-cors";
			policy.credentials = "include";
			mutable.maxRedirects = 20;
			mutable.documentUrl = cross;
			return request(input);
		},
	};
	await expect(
		fetchStylesheetResource(same, policy, mutable),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(requests).toHaveLength(2);
	expect(requests[1].headers?.origin).toBe(origin);
	expect(requests[1].cookieContext?.credentials).toBe("omit");
	expect(requests[1].cookieContext?.siteUrl).toBe(documentUrl);
});

it.each([-1, 21, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "2", undefined])(
	"rejects invalid redirect limit %s without requests",
	async (maxRedirects) => {
		const { context, requests } = harness([]);
		await expect(
			fetchStylesheetResource(same, anonymous, {
				...context,
				maxRedirects,
			} as StylesheetFetchContext),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(requests).toHaveLength(0);
	},
);

it.each([
	null,
	undefined,
	{},
	{ mode: "same-origin", credentials: "omit" },
	{ mode: "cors", credentials: "invalid" },
])("rejects malformed policy %j without requests", async (policy) => {
	const { context, requests } = harness([]);
	await expect(
		fetchStylesheetResource(same, policy as StylesheetFetchPolicy, context),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(requests).toHaveLength(0);
});

it.each([
	null,
	undefined,
	{},
	{ signal: {} },
	{ request: null },
	{ documentUrl: null },
	{ documentUrl: "data:text/html,fixture" },
])("rejects malformed context %j", async (overrides) => {
	const { context, requests } = harness([]);
	const invalid =
		overrides == null
			? overrides
			: {
					...context,
					...overrides,
					...(Object.keys(overrides).length ? {} : { signal: undefined }),
				};
	await expect(
		fetchStylesheetResource(same, anonymous, invalid as StylesheetFetchContext),
	).rejects.toBeInstanceOf(Error);
	expect(requests).toHaveLength(0);
});

it.each([null, undefined, 42, "x".repeat(16_385)])(
	"rejects malformed URL input without dispatch",
	async (url) => {
		const { context, requests } = harness([]);
		await expect(
			fetchStylesheetResource(url as string, anonymous, context),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(requests).toHaveLength(0);
	},
);

it.each([
	{ "bad header": ["fixture"] },
	{ "access-control-allow-origin": ["*\n"] },
	{ "access-control-allow-origin": "*" },
	{ "x-long": ["x".repeat(16_385)] },
])(
	"rejects malformed or oversized native response headers",
	async (headers) => {
		const { context } = harness([
			{
				...response(cross),
				headers: headers as unknown as NetworkResponse["headers"],
			},
		]);
		await expect(
			fetchStylesheetResource(cross, anonymous, context),
		).rejects.toBeInstanceOf(Error);
	},
);
