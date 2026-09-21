import { afterEach, expect, it, vi } from "vitest";
import type { BrowserIdentityOptions } from "./browser-identity.js";
import { documentIdentity } from "./document-identity.js";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import { BrowserSession, type BrowserSessionOptions } from "./session.js";

const sessions: BrowserSession[] = [];
const initialUrl = "https://example.com/start";

function response(url: string): NetworkResponse {
	return {
		url,
		status: 200,
		headers: {},
		body: new Uint8Array(),
		redirects: [],
		encodedBytes: 0,
		elapsedMs: 0,
	};
}

function fixture(
	options: Partial<BrowserSessionOptions> = {},
	routeAware = false,
	handler: (input: NetworkRequest) => NetworkResponse = (input) =>
		response(input.url),
) {
	const requests: NetworkRequest[] = [];
	const transport: NetworkTransport = {
		request: async (input) => {
			requests.push(input);
			return handler(input);
		},
		metrics: () => ({
			requests: requests.length,
			active: 0,
			closed: false,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
		}),
		close: vi.fn(),
	};
	if (routeAware)
		transport.requestWithRoutes = async (input, resolveRoute) => {
			requests.push(input);
			return resolveRoute(input) ?? handler(input);
		};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument: (result, context) =>
			new DocumentTree(result.url, context.limits),
		...options,
	});
	sessions.push(session);
	return { session, requests };
}

function expectHeaders(request: NetworkRequest, language = "en-US") {
	expect(request.headers).toMatchObject({
		"User-Agent": "AgentBrowser/0.1",
		"Accept-Language": language,
	});
}

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	vi.restoreAllMocks();
});

it("defaults session requests and committed documents to the explicit native profile", async () => {
	const { session, requests } = fixture();
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(session.identity).toEqual({
		userAgent: "AgentBrowser/0.1",
		language: "en-US",
		languages: ["en-US"],
		acceptLanguage: "en-US",
	});
	expectHeaders(requests[0]);
	expect(documentIdentity(session.page(tab).document)).toBe(session.identity);
});

it("uses one opt-in user agent for navigation, subresources and the committed document", async () => {
	const identity = { userAgent: "Compatibility/1 AgentBrowser/0.1" };
	const { session, requests } = fixture({
		identity,
		loadDocument: async (result, context) => {
			const document = new DocumentTree(result.url, context.limits);
			context.initializeDocument?.(document);
			expect(documentIdentity(document).userAgent).toBe(
				session.identity.userAgent,
			);
			await context.fetchScript?.("https://example.com/script.js");
			return document;
		},
	});
	identity.userAgent = "Changed/1";
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	await session.page(tab).fetch?.({ url: "https://example.com/data" });
	expect(requests).toHaveLength(3);
	for (const request of requests)
		expect(request.headers?.["User-Agent"]).toBe(
			"Compatibility/1 AgentBrowser/0.1",
		);
	expect(documentIdentity(session.page(tab).document)).toBe(session.identity);
});

it("canonicalizes and snapshots custom language preferences without retaining caller arrays", async () => {
	const languages = ["fr-ca", "EN-us"];
	const identity = { languages };
	const { session, requests } = fixture({ identity });
	languages[0] = "de-DE";
	identity.languages = ["ja-JP"];
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(session.identity.languages).toEqual(["fr-CA", "en-US"]);
	expect(session.identity.language).toBe("fr-CA");
	expect(Object.isFrozen(session.identity)).toBe(true);
	expect(Object.isFrozen(session.identity.languages)).toBe(true);
	expectHeaders(requests[0], "fr-CA, en-US;q=0.9");
	expect(documentIdentity(session.page(tab).document)).toBe(session.identity);
});

it("snapshots identity before the transport factory can mutate its configuration", () => {
	const languages = ["fr-ca"];
	const { session } = fixture({
		identity: { languages },
		createTransport: () => {
			languages[0] = "de-DE";
			return {
				request: async (input) => response(input.url),
				metrics: () => ({
					requests: 0,
					active: 0,
					closed: false,
					redirects: 0,
					encodedBytes: 0,
					decodedBytes: 0,
				}),
				close: () => {},
			};
		},
	});
	expect(languages).toEqual(["de-DE"]);
	expect(session.identity.languages).toEqual(["fr-CA"]);
});

it.each([
	["null", null],
	["empty languages", { languages: [] }],
	["noncanonical duplicates", { languages: ["en-us", "en-US"] }],
	["malformed language", { languages: ["en_US"] }],
	["header injection", { languages: ["en-US\r\nInjected: true"] }],
	["user agent injection", { userAgent: "OtherBrowser\r\nInjected: yes" }],
] as const)(
	"rejects %s identity before transport or resource configuration",
	(_name, identity) => {
		const createTransport = vi.fn();
		const cookieLimits = Object.defineProperty({}, "maxCookies", {
			get: () => {
				throw new Error("Cookie configuration was read");
			},
			enumerable: true,
		});
		const construct = () =>
			new BrowserSession({
				createTransport,
				loadDocument: (result) => new DocumentTree(result.url),
				identity: identity as unknown as BrowserIdentityOptions,
				cookieLimits,
			});
		expect(construct).toThrow(AgentBrowserError);
		expect(construct).toThrow("Invalid browser identity");
		expect(createTransport).not.toHaveBeenCalled();
	},
);

it("binds identity before loader initialization returns and keeps repeated initialization idempotent", async () => {
	const initialized = vi.fn();
	const { session } = fixture({
		identity: { languages: ["pl-PL"] },
		loadDocument: (result, context) => {
			const document = new DocumentTree(result.url, context.limits);
			context.initializeDocument?.(document);
			initialized(documentIdentity(document));
			context.initializeDocument?.(document);
			return document;
		},
	});
	await session.navigate(session.createTab().id, initialUrl);
	expect(initialized).toHaveBeenCalledExactlyOnceWith(session.identity);
});

it("makes identity available to synthetic parser hooks before any script hook", async () => {
	const observed: string[] = [];
	const { session } = fixture({
		identity: { languages: ["ja-JP"] },
		loadDocument: (result, context) =>
			loadBrowserDocument(
				{
					...result,
					headers: { "content-type": ["text/html; charset=utf-8"] },
					body: new TextEncoder().encode("<script></script><p>fixture</p>"),
				},
				{
					...context,
					scripts: {
						start: (document) => {
							expect(documentIdentity(document)).toBe(session.identity);
							observed.push("start");
						},
						script: async (document) => {
							expect(documentIdentity(document)).toBe(session.identity);
							observed.push("script");
						},
						finish: async (document) => {
							expect(documentIdentity(document)).toBe(session.identity);
							observed.push("finish");
						},
					},
				},
			),
	});
	await session.navigate(session.createTab().id, initialUrl);
	expect(observed).toEqual(["start", "script", "finish"]);
});

it("retains one profile through navigation reload history and opener tabs", async () => {
	const { session, requests } = fixture({ identity: { languages: ["de-DE"] } });
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const first = session.page(tab).document;
	for (const navigate of [
		() => session.navigate(tab, `${initialUrl}#fragment`),
		() => session.navigate(tab, "https://example.com/next"),
		() => session.reload(tab),
		() => session.back(tab),
		() => session.forward(tab),
	]) {
		await navigate();
		expect(documentIdentity(session.page(tab).document)).toBe(session.identity);
	}
	const child = session.createTab({ opener: tab }).id;
	await session.navigate(child, "https://example.com/child");
	expect(documentIdentity(session.page(child).document)).toBe(session.identity);
	expect(() => documentIdentity(first)).toThrow("closed");
	for (const request of requests) expectHeaders(request, "de-DE");
});

it("uses profile defaults for loader fetch stylesheet script and every manual image redirect hop", async () => {
	const { session, requests } = fixture(
		{
			identity: { languages: ["es-MX", "es"] },
			loadDocument: async (result, context) => {
				const document = new DocumentTree(result.url, context.limits);
				context.initializeDocument?.(document);
				await context.fetch?.({ url: "https://example.com/data" });
				await context.fetchStylesheet?.("https://example.com/style.css");
				await context.fetchScript?.("https://example.com/script.js");
				await context.fetchImage?.("https://example.com/image", context.signal);
				return document;
			},
		},
		false,
		(input) => ({
			...response(input.url),
			...(input.url.endsWith("/image")
				? { status: 302, headers: { location: ["/image-final"] } }
				: {}),
		}),
	);
	await session.navigate(session.createTab().id, initialUrl);
	expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
		"/start",
		"/data",
		"/style.css",
		"/script.js",
		"/image",
		"/image-final",
	]);
	for (const request of requests) expectHeaders(request, "es-MX, es;q=0.9");
	expect(requests.slice(-2).map((request) => request.redirect)).toEqual([
		"manual",
		"manual",
	]);
	expect(requests[2].headers?.accept).toBe("text/css");
	expect(requests[3].headers?.accept).toContain("javascript");
});

it("preserves POST form semantics while applying session identity defaults", async () => {
	const { session, requests } = fixture({ identity: { languages: ["it-IT"] } });
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const document = session.page(tab).document;
	const form = document.createElement("form", {
		method: "post",
		action: "/submit",
	});
	const input = document.createElement("input", {
		name: "value",
		value: "fixture",
	});
	document.append(document.root, form);
	document.append(form, input);
	await session.requestSubmit(tab, document.reference(form));
	expect(requests).toHaveLength(2);
	expectHeaders(requests[1], "it-IT");
	expect(requests[1]).toMatchObject({
		url: "https://example.com/submit",
		method: "POST",
		body: new TextEncoder().encode("value=fixture"),
		cookieContext: { topLevelNavigation: true },
	});
});

it("preserves explicit mixed-case identity headers and caller bytes without changing fetch policy", async () => {
	const { session, requests } = fixture({ identity: { languages: ["fr-FR"] } });
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const headers = Object.freeze({
		"uSeR-aGeNt": "ExplicitAgent/2",
		"aCcEpT-LaNgUaGe": "de-DE",
		Host: "example.com",
		Origin: "https://example.com",
		"X-Fixture": "unchanged",
	});
	const body = new Uint8Array([1, 2, 3]);
	const cookieContext = Object.freeze({
		siteUrl: initialUrl,
		credentials: "omit" as const,
		crossSiteRedirect: true,
		topLevelNavigation: false,
	});
	const input = Object.freeze({
		url: "https://example.com/data?value=1",
		method: "POST",
		headers,
		body,
		cookieContext,
		redirect: "error" as const,
	});
	await session.page(tab).fetch?.(input);
	const sent = requests[1];
	expect(sent).not.toBe(input);
	expect(sent.headers).not.toBe(headers);
	expect(sent.headers).toEqual(headers);
	expect(sent.body).toBe(body);
	expect(sent.cookieContext).toEqual(cookieContext);
	expect(sent).toMatchObject({
		url: input.url,
		method: "POST",
		redirect: "manual",
	});
	expect(input.redirect).toBe("error");
	expect(input.headers).toBe(headers);
	expect([...body]).toEqual([1, 2, 3]);
	expect(session.identity.language).toBe("fr-FR");
	expect(documentIdentity(session.page(tab).document)).toBe(session.identity);
});

it.each([
	[{ "user-agent": "ExplicitAgent/2" }, { "Accept-Language": "sv-SE" }],
	[{ "accept-language": "de-DE" }, { "User-Agent": "AgentBrowser/0.1" }],
])(
	"adds only missing defaults without mutating explicit headers %j",
	async (explicit, defaults) => {
		const { session, requests } = fixture({
			identity: { languages: ["sv-SE"] },
		});
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		const headers = Object.freeze(explicit);
		const input = Object.freeze({ url: "https://example.com/data", headers });
		const before = JSON.stringify(input);
		await session.page(tab).fetch?.(input);
		expect(JSON.stringify(input)).toBe(before);
		expect(requests[1].headers).toEqual({ ...explicit, ...defaults });
	},
);

it.each([false, true])(
	"shares normalized defaults between route interception and transport (route-aware=%s)",
	async (routeAware) => {
		const { session, requests } = fixture(
			{ identity: { languages: ["nl-NL"] } },
			routeAware,
		);
		const fulfill = vi.spyOn(session.routes, "fulfill");
		session.routes.add("**/mock", { body: "mocked" });
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		expectHeaders(requests[0], "nl-NL");
		expect(fulfill.mock.calls[0][0]).toMatchObject({
			headers: requests[0].headers,
		});
		if (!routeAware) expect(requests[0].redirect).toBe("manual");
		await session.page(tab).fetch?.({ url: "https://example.com/mock" });
		expect(fulfill.mock.calls[1][0]).toMatchObject({
			headers: { "User-Agent": "AgentBrowser/0.1", "Accept-Language": "nl-NL" },
		});
		expect(requests).toHaveLength(routeAware ? 2 : 1);
		expect(session.routes.metrics().fulfilled).toBe(1);
	},
);

it("isolates independent sessions and rejects identity lookup after document close", async () => {
	const custom = fixture({ identity: { languages: ["ko-KR"] } });
	const independent = fixture();
	for (const { session } of [custom, independent]) {
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		const document = session.page(tab).document;
		expect(documentIdentity(document)).toBe(session.identity);
		session.close();
		expect(() => documentIdentity(document)).toThrow("closed");
	}
	expectHeaders(custom.requests[0], "ko-KR");
	expectHeaders(independent.requests[0]);
	expect(custom.session.identity).not.toBe(independent.session.identity);
});
