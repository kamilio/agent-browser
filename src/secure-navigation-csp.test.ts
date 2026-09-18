import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentScriptCsp } from "./document-script-csp.js";
import { AgentBrowserError } from "./errors.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import { BrowserSession } from "./session.js";

const pageUrl = "https://example.com/page";
const policy =
	"upgrade-insecure-requests; default-src 'self'; script-src 'none'";
const sessions: BrowserSession[] = [];
const nativeTransports: NodeNetworkTransport[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) {
		session.close();
		expect(session.metrics().requestQueue).toMatchObject({
			active: 0,
			pending: 0,
		});
	}
	vi.useRealTimers();
	for (const transport of nativeTransports.splice(0)) {
		transport.close();
		expect(transport.metrics()).toMatchObject({ active: 0, closed: true });
	}
	vi.restoreAllMocks();
});

function response(
	url: string,
	status = 200,
	headers: NetworkResponse["headers"] = {},
	html = "<p>destination</p>",
): NetworkResponse {
	const body = new TextEncoder().encode(html);
	return {
		url,
		status,
		headers: { "content-type": ["text/html"], ...headers },
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 0,
	};
}

function fixture(
	options: {
		request?: (input: NetworkRequest) => Promise<NetworkResponse>;
		maxRedirects?: number;
		timeoutMs?: number;
		policy?: string;
	} = {},
) {
	const requests: NetworkRequest[] = [];
	const transport: NetworkTransport = {
		limits: {
			maxConcurrent: 2,
			maxRedirects: options.maxRedirects ?? 4,
			...{ timeoutMs: options.timeoutMs ?? 15000 },
		},
		async request(input) {
			requests.push(input);
			if (input.url === pageUrl)
				return response(
					pageUrl,
					200,
					options.policy === ""
						? {}
						: { "content-security-policy": [options.policy ?? policy] },
					'<form id="form" method="post" action="/start"><input name="field" value="synthetic"></form>',
				);
			return options.request ? options.request(input) : response(input.url);
		},
		metrics: () => ({
			requests: requests.length,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			active: 0,
			closed: false,
		}),
		close() {},
	};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab().id;
	return { session, tab, requests, load: () => session.navigate(tab, pageUrl) };
}

it("follows secure multi-hop redirects with manual dispatch and aggregate history", async () => {
	const test = fixture({
		request: async (input) =>
			input.url.endsWith("/start")
				? response(input.url, 302, { location: ["/middle"] })
				: input.url.endsWith("/middle")
					? response(input.url, 307, {
							location: ["https://other.example/final"],
						})
					: response(input.url),
	});
	await test.load();
	const old = test.session.page(test.tab).document;
	const result = await test.session.navigate(
		test.tab,
		"https://example.com/start",
	);
	expect(result).toMatchObject({
		kind: "document",
		url: "https://other.example/final",
		response: { redirects: 2 },
	});
	expect(
		test.requests.slice(1).map(({ url, redirect }) => [url, redirect]),
	).toEqual([
		["https://example.com/start", "manual"],
		["https://example.com/middle", "manual"],
		["https://other.example/final", "manual"],
	]);
	expect(() => old.get(old.root)).toThrow();
	expect(test.session.requests(test.tab).entries[0]).toMatchObject({
		state: "complete",
		redirectCount: 2,
		finalUrl: "https://other.example/final",
	});
});

it.each([
	"http://other.example/next",
	"https://user:password@other.example/next",
	"data:text/html,denied",
	"https://[invalid",
	"https://other.example/\nnext",
	"",
	" ",
	"https://other.example/%zz",
])("denies invalid/insecure Location before dispatch: %s", async (location) => {
	const test = fixture({
		request: async (input) =>
			response(input.url, 302, { location: [location] }),
	});
	await test.load();
	const old = test.session.page(test.tab).document;
	await expect(
		test.session.navigate(test.tab, "https://example.com/start"),
	).rejects.toBeDefined();
	expect(test.requests).toHaveLength(2);
	expect(test.session.page(test.tab).document).toBe(old);
});

it.each<NetworkResponse["headers"]>([
	{},
	{ location: [] },
	{ location: ["/one", "/two"] },
	{ location: ["/one"], Location: ["/two"] },
])("rejects absent or ambiguous redirect locations", async (headers) => {
	const test = fixture({
		request: async (input) => response(input.url, 302, headers),
	});
	await test.load();
	await expect(
		test.session.navigate(test.tab, "https://example.com/start"),
	).rejects.toBeDefined();
	expect(test.requests).toHaveLength(2);
});

it.each([301, 302, 303, 307, 308])(
	"preserves native POST %i redirect semantics",
	async (status) => {
		const test = fixture({
			request: async (input) =>
				input.url.endsWith("/start")
					? response(input.url, status, { location: ["/final"] })
					: response(input.url),
		});
		await test.load();
		const tree = test.session.page(test.tab).document;
		const form = [...tree.walk()].find(
			({ node }) => node.attributes.id === "form",
		);
		if (!form) throw new Error("Missing form");
		await test.session.requestSubmit(test.tab, tree.reference(form.node.id));
		const [first, second] = test.requests.slice(1);
		expect(first.method).toBe("POST");
		expect(second.method).toBe(status >= 307 ? "POST" : "GET");
		if (status >= 307) {
			expect(second.body).toEqual(first.body);
			expect(second.headers?.["content-type"]).toBe(
				first.headers?.["content-type"],
			);
		} else {
			expect(second.body).toBeUndefined();
			expect(second.headers).not.toHaveProperty("content-type");
		}
	},
);

it.each([0, 1])(
	"honors a %i-hop bound before dispatch",
	async (maxRedirects) => {
		let next = 0;
		const test = fixture({
			maxRedirects,
			request: async (input) =>
				response(input.url, 302, { location: [`/hop${++next}`] }),
		});
		await test.load();
		await expect(
			test.session.navigate(test.tab, "https://example.com/start"),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(test.requests).toHaveLength(maxRedirects + 2);
	},
);

it("rejects fragment-only redirect loops before a repeated resource request", async () => {
	const test = fixture({
		request: async (input) =>
			response(input.url, 302, { location: ["#again"] }),
	});
	await test.load();
	await expect(
		test.session.navigate(test.tab, "https://example.com/start"),
	).rejects.toBeDefined();
	expect(test.requests).toHaveLength(2);
});

it.each(["history", "url"])(
	"rejects an adapter-followed redirect reported through %s",
	async (kind) => {
		const test = fixture({
			request: async (input) => ({
				...response(kind === "url" ? "https://other.example/final" : input.url),
				redirects:
					kind === "history"
						? [{ url: input.url, status: 302, location: "/final" }]
						: [],
			}),
		});
		await test.load();
		await expect(
			test.session.navigate(test.tab, "https://example.com/start"),
		).rejects.toMatchObject({ code: "policy-denied" });
		expect(test.requests).toHaveLength(2);
	},
);

it.each(["abort", "owner-close", "supersede"])(
	"does not follow after %s during a redirect",
	async (action) => {
		const controller = new AbortController();
		let nextNavigation: Promise<unknown> | undefined;
		const test = fixture({
			request: async (input) => {
				if (input.url.endsWith("/replacement")) return response(input.url);
				if (action === "abort") controller.abort();
				else if (action === "owner-close")
					documentScriptCsp(test.session.page(test.tab).document)?.close();
				else
					nextNavigation = test.session.navigate(
						test.tab,
						"https://example.com/replacement",
					);
				return response(input.url, 302, { location: ["/never"] });
			},
		});
		await test.load();
		await expect(
			test.session.navigate(test.tab, "https://example.com/start", {
				signal: controller.signal,
			}),
		).rejects.toBeDefined();
		await nextNavigation;
		expect(test.requests.some(({ url }) => url.endsWith("/never"))).toBe(false);
		expect(test.requests[1].signal?.aborted).toBe(true);
	},
);

it("aborts a pending adapter at a single whole-chain network deadline", async () => {
	vi.useFakeTimers();
	const test = fixture({
		timeoutMs: 40,
		request: async (input) =>
			new Promise((_resolve, reject) => {
				input.signal?.addEventListener(
					"abort",
					() => reject(input.signal?.reason),
					{ once: true },
				);
			}),
	});
	await test.load();
	let outcome = "pending";
	void test.session.navigate(test.tab, "https://example.com/start").then(
		() => {
			outcome = "resolved";
		},
		(error: unknown) => {
			outcome = error instanceof AgentBrowserError ? error.code : "unknown";
		},
	);
	await vi.advanceTimersByTimeAsync(41);
	expect(outcome).toBe("timeout");
	expect(test.requests[1].signal?.aborted).toBe(true);
});

it("retains a timed-out adapter's queue lease until actual settlement", async () => {
	vi.useFakeTimers();
	let settle: ((response: NetworkResponse) => void) | undefined;
	const test = fixture({
		timeoutMs: 40,
		request: () =>
			new Promise((resolve) => {
				settle = resolve;
			}),
	});
	await test.load();
	const old = test.session.page(test.tab).document;
	const pending = test.session.navigate(test.tab, "https://example.com/start");
	const timedOut = expect(pending).rejects.toMatchObject({ code: "timeout" });
	await vi.advanceTimersByTimeAsync(41);
	await timedOut;
	expect(test.requests[1].signal?.aborted).toBe(true);
	expect(test.session.metrics()).toMatchObject({
		closed: false,
		requestQueue: { active: 1, pending: 0 },
	});
	expect(test.session.page(test.tab).document).toBe(old);
	if (!settle) throw new Error("Adapter was not dispatched");
	settle(response("https://example.com/start", 302, { location: ["/never"] }));
	await vi.advanceTimersByTimeAsync(0);
	expect(test.session.metrics().requestQueue).toMatchObject({
		active: 0,
		pending: 0,
	});
	expect(test.requests).toHaveLength(2);
	expect(test.session.page(test.tab).document).toBe(old);
});

it("dispatches every hop through fallback native routes", async () => {
	const test = fixture();
	await test.load();
	test.session.routes.add("**/start", {
		status: 302,
		headers: { location: "/final" },
	});
	test.session.routes.add("**/final", {
		body: "<p>routed</p>",
		contentType: "text/html",
	});
	await expect(
		test.session.navigate(test.tab, "https://example.com/start"),
	).resolves.toMatchObject({ response: { redirects: 1 } });
	expect(test.requests).toHaveLength(1);
	expect(test.session.metrics().routes.fulfilled).toBe(2);
});

it("keeps fragment navigation and ordinary non-CSP transport delegation unchanged", async () => {
	const protectedPage = fixture();
	await protectedPage.load();
	await expect(
		protectedPage.session.navigate(protectedPage.tab, `${pageUrl}#part`),
	).resolves.toMatchObject({ kind: "same-document" });
	expect(protectedPage.requests).toHaveLength(1);
	const ordinary = fixture({
		policy: "",
		request: async () => ({
			...response("https://other.example/final"),
			redirects: [
				{
					url: "https://example.com/start",
					status: 302,
					location: "https://other.example/final",
				},
			],
		}),
	});
	await ordinary.load();
	await expect(
		ordinary.session.navigate(ordinary.tab, "https://example.com/start"),
	).resolves.toMatchObject({ response: { redirects: 1 } });
	expect(ordinary.requests[1].redirect).toBeUndefined();
});

function nativeFixture(options: NodeTransportOptions = {}) {
	const resolver = vi.fn(async () => ["93.184.216.34"]);
	let transport: NodeNetworkTransport | undefined;
	const session = new BrowserSession({
		createTransport(cookieJar) {
			transport = new NodeNetworkTransport({ ...options, cookieJar, resolver });
			nativeTransports.push(transport);
			return transport;
		},
		loadDocument: loadBrowserDocument,
	});
	if (!transport) throw new Error("Missing native transport");
	sessions.push(session);
	session.routes.add(pageUrl, {
		body: "<p>source</p>",
		contentType: "text/html",
		headers: { "content-security-policy": policy },
	});
	const tab = session.createTab().id;
	return {
		session,
		tab,
		resolver,
		transport,
		load: () => session.navigate(tab, pageUrl),
	};
}

it("preserves native cookie selection and sticky cross-site taint across manual hops", async () => {
	const test = nativeFixture();
	await test.load();
	for (const sameSite of ["Strict", "None"])
		expect(
			test.session.cookies.setCookie(
				pageUrl,
				`${sameSite.toLowerCase()}=synthetic; Path=/; Secure; HttpOnly; SameSite=${sameSite}`,
				{ siteUrl: pageUrl },
			).accepted,
		).toBe(true);
	const selected: { url: string; cookie?: string }[] = [];
	const exchange = vi
		.spyOn(
			test.transport as unknown as {
				exchange(
					url: URL,
					address: string,
					method: string,
					headers: Record<string, string>,
					body: Buffer | undefined,
					redirect: string,
				): Promise<NetworkResponse>;
			},
			"exchange",
		)
		.mockImplementation(
			async (url, _address, method, headers, _body, redirect) => {
				selected.push({ url: url.href, cookie: headers.cookie });
				expect(method).toBe("GET");
				expect(redirect).toBe("manual");
				return url.pathname === "/start"
					? response(url.href, 302, {
							location: ["https://other.example/return"],
						})
					: url.pathname === "/return"
						? response(url.href, 302, {
								location: ["https://example.com/final"],
							})
						: response(url.href);
			},
		);
	await expect(
		test.session.navigate(test.tab, "https://example.com/start"),
	).resolves.toMatchObject({ response: { redirects: 2 } });
	expect(selected).toEqual([
		{
			url: "https://example.com/start",
			cookie: "strict=synthetic; none=synthetic",
		},
		{ url: "https://other.example/return", cookie: undefined },
		{ url: "https://example.com/final", cookie: "none=synthetic" },
	]);
	expect(exchange).toHaveBeenCalledTimes(3);
	expect(test.resolver).toHaveBeenCalledTimes(3);
});

it("checks native origin policy before resolving a redirect route or DNS", async () => {
	const test = nativeFixture({ allowedOrigins: ["https://example.com"] });
	await test.load();
	test.session.routes.add("https://example.com/start", {
		status: 302,
		headers: { location: "https://other.example/final" },
	});
	test.session.routes.add("https://other.example/final", {
		body: "<p>must not load</p>",
		contentType: "text/html",
	});
	await expect(
		test.session.navigate(test.tab, "https://example.com/start"),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.session.metrics().routes.fulfilled).toBe(2);
	expect(test.resolver).not.toHaveBeenCalled();
	expect(test.session.page(test.tab).document.url).toBe(pageUrl);
});

it.each([{ maxResponseBytes: 50 }, { maxTotalBytes: 100 }, { maxRequests: 2 }])(
	"retains native response, total-body and request budgets across redirected routes: %j",
	async (limits) => {
		const test = nativeFixture({ limits });
		await test.load();
		test.session.routes.add("https://example.com/start", {
			status: 302,
			body: "a".repeat(limits.maxResponseBytes ? 0 : 60),
			headers: { location: "/final" },
		});
		test.session.routes.add("https://example.com/final", {
			body: "b".repeat(60),
			contentType: "text/html",
		});
		await expect(
			test.session.navigate(test.tab, "https://example.com/start"),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(test.resolver).not.toHaveBeenCalled();
		expect(test.session.page(test.tab).document.url).toBe(pageUrl);
	},
);
