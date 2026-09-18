import { afterEach, expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { fetchSecureNavigation } from "./secure-navigation-fetch.js";

afterEach(() => vi.useRealTimers());

function response(
	url: string,
	status = 200,
	location?: string,
): NetworkResponse {
	return {
		url,
		status,
		headers: location === undefined ? {} : { location: [location] },
		body: new Uint8Array([1, 2]),
		redirects: [],
		encodedBytes: 2,
		elapsedMs: 0,
	};
}

function context(request: (input: NetworkRequest) => Promise<NetworkResponse>) {
	return {
		maxRedirects: 4,
		timeoutMs: 1000,
		checkCurrent: vi.fn(),
		sameSite: (url: string, siteUrl: string | null) =>
			siteUrl !== null && new URL(url).hostname === new URL(siteUrl).hostname,
		request: vi.fn(request),
	};
}

it("strips sensitive headers case-insensitively on cross-origin redirects and never restores them", async () => {
	const selected: NetworkRequest[] = [];
	const run = context(async (input) => {
		selected.push(input);
		return selected.length === 1
			? response(input.url, 307, "https://other.example/second")
			: selected.length === 2
				? response(input.url, 307, "https://example.com/final")
				: response(input.url);
	});
	const headers = {
		Authorization: "synthetic",
		COOKIE: "synthetic",
		Referer: "https://example.com/",
		"Proxy-Authorization": "synthetic",
		Cookie2: "synthetic",
		"X-Trace": "keep",
		"Content-Type": "text/plain",
	};
	await fetchSecureNavigation(
		{
			url: "https://example.com/first",
			method: "POST",
			headers,
			body: "synthetic",
			cookieContext: {
				siteUrl: "https://example.com/page",
				credentials: "include",
				topLevelNavigation: true,
			},
		},
		run,
	);
	expect(selected[0].headers).toEqual(headers);
	for (const input of selected.slice(1)) {
		expect(input.headers).toEqual({
			"X-Trace": "keep",
			"Content-Type": "text/plain",
		});
		expect(input.cookieContext).toMatchObject({
			credentials: "include",
			method: "POST",
			crossSiteRedirect: true,
			siteUrl: "https://example.com/page",
			topLevelNavigation: true,
		});
	}
	expect(headers.Authorization).toBe("synthetic");
});

it.each(["manual", "error"] as const)(
	"refuses caller redirect mode %s rather than silently following",
	async (redirect) => {
		const run = context(async (input) => response(input.url, 302, "/never"));
		await expect(
			fetchSecureNavigation(
				{ url: "https://example.com/start", redirect },
				run,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(run.request).not.toHaveBeenCalled();
	},
);

it("accepts explicit follow intent but dispatches only manual hops", async () => {
	const run = context(async (input) => response(input.url));
	await fetchSecureNavigation(
		{ url: "https://example.com/start", redirect: "follow" },
		run,
	);
	expect(run.request.mock.calls[0][0].redirect).toBe("manual");
});

it.each([301, 302, 303])(
	"removes every body header on POST %i rewrite, preserving unrelated fields",
	async (status) => {
		const requests: NetworkRequest[] = [];
		const run = context(async (input) => {
			requests.push(input);
			return requests.length === 1
				? response(input.url, status, "/final")
				: response(input.url);
		});
		await fetchSecureNavigation(
			{
				url: "https://example.com/start",
				method: "POST",
				body: "synthetic",
				headers: {
					"Content-Type": "text/plain",
					"Content-Encoding": "identity",
					"Content-Language": "en",
					"Content-Location": "/start",
					"Content-Length": "9",
					Authorization: "keep",
				},
			},
			run,
		);
		expect(requests[1]).toMatchObject({
			method: "GET",
			headers: { Authorization: "keep" },
		});
		expect(requests[1].headers).toEqual({ Authorization: "keep" });
		expect(requests[1].body).toBeUndefined();
	},
);

it.each([
	["PUT", 301, "PUT"],
	["PATCH", 302, "PATCH"],
	["DELETE", 303, "GET"],
	["HEAD", 303, "HEAD"],
	["POST", 307, "POST"],
	["POST", 308, "POST"],
] as const)(
	"keeps %s/%i method semantics",
	async (method, status, expected) => {
		let calls = 0;
		const run = context(async (input) =>
			++calls === 1
				? response(input.url, status, "/final")
				: response(input.url),
		);
		await fetchSecureNavigation(
			{ url: "https://example.com/start", method },
			run,
		);
		expect(run.request.mock.calls[1][0].method).toBe(expected);
	},
);

it("snapshots replay bytes and request headers across asynchronous requests", async () => {
	const body = new Uint8Array([1, 2, 3]);
	const headers = { "X-Value": "before" };
	let calls = 0;
	const run = context(async (input) => {
		if (++calls === 1) {
			body.fill(9);
			headers["X-Value"] = "after";
			if (input.body instanceof Uint8Array) input.body.fill(8);
			return response(input.url, 307, "/final");
		}
		expect(input.body).toEqual(new Uint8Array([1, 2, 3]));
		expect(input.headers).toEqual({ "X-Value": "before" });
		return response(input.url);
	});
	await fetchSecureNavigation(
		{ url: "https://example.com/start", method: "POST", headers, body },
		run,
	);
});

it("inherits fragments, aggregates response bytes and permits same-URL POST-to-GET", async () => {
	let calls = 0;
	const run = context(async (input) =>
		++calls === 1
			? response(input.url, 303, "/start")
			: response("https://example.com/start"),
	);
	const result = await fetchSecureNavigation(
		{
			url: "https://example.com/start#keep",
			method: "POST",
			body: "synthetic",
		},
		run,
	);
	expect(result).toMatchObject({
		url: "https://example.com/start#keep",
		encodedBytes: 4,
		redirects: [
			{
				url: "https://example.com/start#keep",
				status: 303,
				location: "https://example.com/start#keep",
			},
		],
	});
	expect(run.request.mock.calls[1][0]).toMatchObject({
		method: "GET",
		url: "https://example.com/start#keep",
	});
});

it("does not refresh the network deadline at a redirect", async () => {
	vi.useFakeTimers();
	let calls = 0;
	const run = context(
		(input) =>
			new Promise((resolve) => {
				const first = ++calls === 1;
				setTimeout(
					() =>
						resolve(
							response(
								input.url,
								first ? 302 : 200,
								first ? "/final" : undefined,
							),
						),
					30,
				);
			}),
	);
	const pending = fetchSecureNavigation(
		{ url: "https://example.com/start" },
		{ ...run, timeoutMs: 50 },
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
	await vi.advanceTimersByTimeAsync(51);
	await rejected;
	expect(run.request).toHaveBeenCalledTimes(2);
	expect(run.request.mock.calls[1][0].signal?.aborted).toBe(true);
	await vi.advanceTimersByTimeAsync(20);
	expect(run.request).toHaveBeenCalledTimes(2);
});

it("rechecks the owner after response and leaves no redirect request on invalidation", async () => {
	let live = true;
	const run = context(async (input) => {
		live = false;
		return response(input.url, 302, "/never");
	});
	run.checkCurrent.mockImplementation(() => {
		if (!live) throw new AgentBrowserError("closed", "Owner closed");
	});
	await expect(
		fetchSecureNavigation({ url: "https://example.com/start" }, run),
	).rejects.toMatchObject({ code: "closed" });
	expect(run.request).toHaveBeenCalledTimes(1);
});

it.each([-1, 21, Number.NaN, 1.5])(
	"rejects invalid hop bounds before requesting: %s",
	async (maxRedirects) => {
		const run = context(async (input) => response(input.url));
		await expect(
			fetchSecureNavigation(
				{ url: "https://example.com/start" },
				{ ...run, maxRedirects },
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(run.request).not.toHaveBeenCalled();
	},
);

it.each([-1, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
	"rejects invalid response accounting: %s",
	async (encodedBytes) => {
		const run = context(async (input) => ({
			...response(input.url),
			encodedBytes,
		}));
		await expect(
			fetchSecureNavigation({ url: "https://example.com/start" }, run),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(run.request).toHaveBeenCalledTimes(1);
	},
);
