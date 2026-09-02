import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { CookieJar } from "./cookies.js";
import { loadBrowserDocument } from "./document-loader.js";
import { NetworkRoutes } from "./network-routes.js";
import type { NetworkResponse, NetworkRouteResolver } from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import { BrowserSession } from "./session.js";

interface WireHost {
	consume(
		response: Readable,
		encoding: string,
		signal: AbortSignal,
	): Promise<{ body: Uint8Array; encodedBytes: number }>;
	exchange(
		url: URL,
		address: string,
		method: string,
		headers: Record<string, string>,
		body: Buffer | undefined,
		redirect: string,
		signal: AbortSignal,
		onHeaders?: (headers: NetworkResponse["headers"]) => void,
	): Promise<Omit<NetworkResponse, "url" | "redirects" | "elapsedMs">>;
}
const transports: NodeNetworkTransport[] = [];
const jars: CookieJar[] = [];
afterEach(() => {
	for (const transport of transports.splice(0)) transport.close();
	for (const jar of jars.splice(0)) jar.close();
	vi.restoreAllMocks();
});

function response(
	url: string,
	status = 200,
	headers: NetworkResponse["headers"] = {},
): NetworkResponse {
	return {
		url,
		status,
		headers,
		body: new TextEncoder().encode("mock"),
		encodedBytes: 0,
		redirects: [],
		elapsedMs: 0,
	};
}
function fixture(options: NodeTransportOptions = {}) {
	const resolver = vi.fn(async (_hostname: string, _signal: AbortSignal) => [
		"93.184.216.34",
	]);
	const transport = new NodeNetworkTransport({ resolver, ...options });
	transports.push(transport);
	const exchange = vi
		.spyOn(transport as unknown as WireHost, "exchange")
		.mockImplementation(async () => {
			throw new Error("Unexpected wire exchange");
		});
	const routes = new NetworkRoutes();
	return { transport, resolver, exchange, routes };
}

it("fulfills a redirected target before its DNS lookup or wire exchange", async () => {
	const { transport, resolver, exchange, routes } = fixture();
	routes.add("**/mocked", { body: "replacement" });
	exchange.mockImplementation(async (url) =>
		response(url.href, 302, { location: ["https://target.example/mocked"] }),
	);
	const result = await transport.requestWithRoutes(
		{ url: "https://source.example/start" },
		(input) => routes.fulfill(input),
	);
	expect(resolver).toHaveBeenCalledTimes(1);
	expect(resolver.mock.calls[0][0]).toBe("source.example");
	expect(exchange).toHaveBeenCalledTimes(1);
	expect(result).toMatchObject({
		routeId: 1,
		url: "https://target.example/mocked",
		redirects: [{ status: 302, location: "https://target.example/mocked" }],
	});
	expect(new TextDecoder().decode(result.body)).toBe("replacement");
	expect(transport.metrics()).toMatchObject({
		requests: 2,
		mockedRequests: 1,
		mockedDecodedBytes: 11,
		active: 0,
	});
});

it("can fulfill the initial hop without DNS and preserves detached response ownership", async () => {
	const { transport, resolver, exchange } = fixture();
	const supplied = {
		...response("https://example.com/"),
		body: Buffer.from("mock"),
	};
	const result = await transport.requestWithRoutes(
		{ url: supplied.url },
		() => supplied,
	);
	supplied.body.fill(0);
	expect(new TextDecoder().decode(result.body)).toBe("mock");
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
});

it.each([
	[301, "GET"],
	[302, "GET"],
	[303, "GET"],
	[307, "POST"],
	[308, "POST"],
])(
	"preserves the native %i redirect method policy",
	async (status, expectedMethod) => {
		const { transport, exchange, routes } = fixture();
		routes.add("**/mocked", { body: "mock" });
		const methods: (string | undefined)[] = [];
		exchange.mockImplementation(
			async (url, _address, method, headers, body) => {
				if (url.pathname === "/start")
					return response(url.href, status as number, {
						location: ["/middle"],
					});
				expect(method).toBe(expectedMethod);
				if (expectedMethod === "GET") {
					expect(body).toBeUndefined();
					expect(headers).not.toHaveProperty("content-type");
				} else expect(body?.toString()).toBe("payload");
				return response(url.href, 307, { location: ["/mocked"] });
			},
		);
		await transport.requestWithRoutes(
			{ url: "https://example.com/start", method: "POST", body: "payload" },
			(input) => {
				methods.push(input.method);
				return routes.fulfill(input);
			},
		);
		expect(methods).toEqual(["POST", expectedMethod, expectedMethod]);
		expect(exchange).toHaveBeenCalledTimes(2);
	},
);

it("keeps cookie recomputation and cross-origin sensitive-header stripping before a routed target", async () => {
	const cookieJar = new CookieJar();
	jars.push(cookieJar);
	const { transport, exchange, routes } = fixture({ cookieJar });
	routes.add("**/mocked", { body: "mock" });
	exchange.mockImplementation(
		async (
			url,
			_address,
			_method,
			headers,
			_body,
			_redirect,
			_signal,
			onHeaders,
		) => {
			if (url.pathname === "/start") {
				onHeaders?.({
					"set-cookie": ["session=synthetic; Path=/; Secure; SameSite=Lax"],
				});
				return response(url.href, 302, { location: ["/same"] });
			}
			if (url.pathname === "/same") {
				expect(headers.cookie).toBe("session=synthetic");
				expect(headers.authorization).toBe("synthetic authorization");
				return response(url.href, 302, {
					location: ["https://other.example/cross"],
				});
			}
			expect(headers).not.toHaveProperty("authorization");
			expect(headers).not.toHaveProperty("referer");
			expect(headers).not.toHaveProperty("cookie");
			return response(url.href, 302, { location: ["/mocked"] });
		},
	);
	await transport.requestWithRoutes(
		{
			url: "https://example.com/start",
			headers: {
				authorization: "synthetic authorization",
				referer: "https://example.com/",
			},
			cookieContext: {
				siteUrl: "https://example.com/",
				topLevelNavigation: true,
				credentials: "include",
			},
		},
		(input) => routes.fulfill(input),
	);
	expect(exchange).toHaveBeenCalledTimes(3);
	expect(routes.metrics().fulfilled).toBe(1);
});

it.each([
	"http://target.example/mocked",
	"https://user:secret@target.example/mocked",
	"https://target.example:25/mocked",
])("rejects unsafe redirect %s before resolving its route", async (target) => {
	const { transport, exchange, routes } = fixture();
	routes.add("**/mocked", { body: "mock" });
	exchange.mockImplementation(async (url) =>
		response(url.href, 302, { location: [target] }),
	);
	await expect(
		transport.requestWithRoutes({ url: "https://example.com/" }, (input) =>
			routes.fulfill(input),
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(routes.metrics().fulfilled).toBe(0);
	expect(exchange).toHaveBeenCalledTimes(1);
});

it("retains DNS/address policy for unmatched hops", async () => {
	const { transport, exchange } = fixture({
		resolver: async () => ["127.0.0.1"],
	});
	await expect(
		transport.requestWithRoutes(
			{ url: "https://example.com/" },
			() => undefined,
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(exchange).not.toHaveBeenCalled();
});

it("retains request, response and aggregate budgets for intercepted responses", async () => {
	for (const limits of [{ maxResponseBytes: 3 }, { maxTotalBytes: 3 }]) {
		const { transport, resolver } = fixture({ limits });
		await expect(
			transport.requestWithRoutes({ url: "https://example.com/" }, () =>
				response("https://example.com/"),
			),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(resolver).not.toHaveBeenCalled();
		expect(transport.metrics().active).toBe(0);
	}
	const { transport } = fixture({ limits: { maxRequests: 1 } });
	const resolve = () => response("https://example.com/");
	await transport.requestWithRoutes({ url: "https://example.com/" }, resolve);
	await expect(
		transport.requestWithRoutes({ url: "https://example.com/" }, resolve),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it("preserves manual/error redirect modes and redirect limits", async () => {
	const { transport, exchange, routes } = fixture({
		limits: { maxRedirects: 1 },
	});
	routes.add("**/mocked", { body: "mock" });
	exchange.mockImplementation(async (url) =>
		response(url.href, 302, { location: ["/again"] }),
	);
	expect(
		await transport.requestWithRoutes(
			{ url: "https://example.com/", redirect: "manual" },
			(input) => routes.fulfill(input),
		),
	).toMatchObject({ status: 302, redirects: [] });
	await expect(
		transport.requestWithRoutes(
			{ url: "https://example.com/", redirect: "error" },
			(input) => routes.fulfill(input),
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		transport.requestWithRoutes({ url: "https://example.com/" }, (input) =>
			routes.fulfill(input),
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(routes.metrics().fulfilled).toBe(0);
});

it("fails closed for invalid providers/responses and never falls through after provider failure", async () => {
	const { transport, resolver, exchange } = fixture();
	const input = { url: "https://example.com/" };
	await expect(
		transport.requestWithRoutes(input, null as unknown as NetworkRouteResolver),
	).rejects.toMatchObject({ code: "invalid-input" });
	for (const supplied of [
		response("https://wrong.example/"),
		{ ...response(input.url), encodedBytes: 1 },
		{ ...response(input.url), status: 101 },
		{ ...response(input.url), headers: { invalid: ["bad\r\nvalue"] } },
		Promise.resolve(response(input.url)),
	])
		await expect(
			transport.requestWithRoutes(input, () => supplied as NetworkResponse),
		).rejects.toMatchObject({ code: "invalid-input" });
	await expect(
		transport.requestWithRoutes(input, () => {
			throw new Error("provider failed");
		}),
	).rejects.toMatchObject({ code: "network-error" });
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
});

it("does not emit a response if the provider closes its transport", async () => {
	const { transport, resolver } = fixture();
	await expect(
		transport.requestWithRoutes({ url: "https://example.com/" }, () => {
			transport.close();
			return response("https://example.com/");
		}),
	).rejects.toMatchObject({ code: "closed" });
	expect(resolver).not.toHaveBeenCalled();
	expect(transport.metrics()).toMatchObject({ active: 0, closed: true });
});

it("does not let synchronous routing work outrun the shared deadline", async () => {
	let now = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const { transport, resolver } = fixture({ limits: { timeoutMs: 10 } });
	await expect(
		transport.requestWithRoutes({ url: "https://example.com/" }, () => {
			now = 20;
			return response("https://example.com/");
		}),
	).rejects.toMatchObject({ code: "timeout" });
	expect(resolver).not.toHaveBeenCalled();
	expect(transport.metrics().active).toBe(0);
});

it("charges real in-memory stream consumption and routed bodies to the same byte budget", async () => {
	const { transport, exchange, routes } = fixture({
		limits: { maxTotalBytes: 5 },
	});
	routes.add("**/mocked", { body: "four" });
	exchange.mockImplementation(
		async (_url, _address, _method, _headers, _body, _redirect, signal) => ({
			status: 200,
			headers: {},
			...(await (transport as unknown as WireHost).consume(
				Readable.from([Buffer.from("12")]),
				"identity",
				signal,
			)),
		}),
	);
	await transport.request({ url: "https://example.com/real" });
	await expect(
		transport.requestWithRoutes(
			{ url: "https://example.com/mocked" },
			(input) => routes.fulfill(input),
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(transport.metrics()).toMatchObject({
		encodedBytes: 2,
		decodedBytes: 6,
		mockedDecodedBytes: 4,
		active: 0,
	});
	expect(exchange).toHaveBeenCalledTimes(1);
});

it("lets the real session load a routed HTML redirect target through the capable adapter", async () => {
	let native!: ReturnType<typeof fixture>;
	const session = new BrowserSession({
		createTransport: (cookieJar) => {
			native = fixture({ cookieJar });
			return native.transport;
		},
		loadDocument: loadBrowserDocument,
	});
	try {
		native.exchange.mockImplementation(async (url) =>
			response(url.href, 302, { location: ["https://target.example/page"] }),
		);
		session.routes.add("**/page", {
			body: "<h1>Routed target</h1>",
			contentType: "text/html",
		});
		const tab = session.createTab().id;
		await session.navigate(tab, "https://source.example/start");
		const document = session.page(tab).document;
		expect(document.textContent(document.root)).toContain("Routed target");
		expect(session.requests(tab).entries[0]).toMatchObject({
			state: "complete",
			routeId: 1,
			redirectCount: 1,
			finalUrl: "https://target.example/page",
		});
		expect(session.metrics().routes.automaticRedirects).toBe(true);
		expect(native.exchange).toHaveBeenCalledTimes(1);
		expect(native.resolver).toHaveBeenCalledTimes(1);
	} finally {
		session.close();
	}
});
