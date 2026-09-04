import { afterEach, expect, it, vi } from "vitest";
import type { CookieJar } from "./cookies.js";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import { pageHistoryPort } from "./page-history.js";
import {
	BrowserSession,
	type BrowserSessionOptions,
	type DocumentLoaderContext,
	type NavigationResult,
} from "./session.js";

const sessions: BrowserSession[] = [];
const initialUrl = "https://example.com/start";

function response(
	url = initialUrl,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url,
		status: 200,
		headers: {},
		body: new TextEncoder().encode("fixture"),
		redirects: [],
		encodedBytes: 7,
		elapsedMs: 1,
		...overrides,
	};
}

function documentFixture(
	result: NetworkResponse,
	context: DocumentLoaderContext,
) {
	const tree = new DocumentTree(result.url, context.limits);
	const body = tree.createElement("body");
	tree.append(tree.root, body);
	const heading = tree.createElement("h1", { id: "target" });
	tree.append(body, heading);
	tree.append(heading, tree.createText("Constructed fixture"));
	const link = tree.createElement("a", { href: "/next" });
	tree.append(body, link);
	tree.append(link, tree.createText("Next"));
	return tree;
}

function deferred<Result>() {
	let resolve!: (value: Result) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<Result>((success, failure) => {
		resolve = success;
		reject = failure;
	});
	return { promise, resolve, reject };
}

function fixture(
	options: Partial<BrowserSessionOptions> = {},
	handler: (request: NetworkRequest) => Promise<NetworkResponse> = async (
		input,
	) => response(input.url),
) {
	const requests: NetworkRequest[] = [];
	let active = 0;
	let closed = false;
	let cookies: CookieJar | undefined;
	const documents: DocumentTree[] = [];
	const transport: NetworkTransport = {
		request: async (input) => {
			requests.push(input);
			active++;
			try {
				return await handler(input);
			} finally {
				active--;
			}
		},
		metrics: () => ({
			requests: requests.length,
			active,
			closed,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
		}),
		close: () => {
			closed = true;
		},
	};
	const session = new BrowserSession({
		createTransport: (jar) => {
			cookies = jar;
			return transport;
		},
		loadDocument: (result, context) => {
			const tree = documentFixture(result, context);
			documents.push(tree);
			return tree;
		},
		...options,
	});
	sessions.push(session);
	return { session, requests, documents, transport, cookies };
}

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

it("rejects fresh old-page traversal while an explicit navigation is pending", async () => {
	const started = deferred<void>();
	const result = deferred<NetworkResponse>();
	const { session } = fixture({}, async (input) => {
		if (input.url.endsWith("/pending")) {
			started.resolve();
			return result.promise;
		}
		return response(input.url);
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const port = pageHistoryPort(session.page(tab).document);
	if (!port) throw new Error("Missing history port");
	const navigation = session.navigate(tab, "https://example.com/pending");
	await started.promise;
	expect(() => port.traverse(-1)).toThrow("explicit navigation");
	result.resolve(response("https://example.com/pending"));
	await navigation;
	expect(session.metrics().pageTraversals[0].accepted).toBe(0);
});

it("initializes a custom loader document once without resetting its parser-time history", async () => {
	const { session } = fixture({
		loadDocument: (response, context) => {
			const tree = documentFixture(response, context);
			context.initializeDocument?.(tree);
			const history = pageHistoryPort(tree);
			if (!history) throw new Error("Missing initialized history");
			history.pushState({ initialized: true }, "/route");
			context.initializeDocument?.(tree);
			return tree;
		},
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(session.page(tab).history.snapshot()).toMatchObject({
		state: { initialized: true },
		length: 2,
		url: "https://example.com/route",
	});
});

it("closes both unowned documents when a loader returns a different initialized candidate", async () => {
	const created: DocumentTree[] = [];
	const { session } = fixture({
		loadDocument: (response, context) => {
			const first = documentFixture(response, context);
			const second = documentFixture(response, context);
			created.push(first, second);
			context.initializeDocument?.(first);
			return second;
		},
	});
	const tab = session.createTab().id;
	await expect(session.navigate(tab, initialUrl)).rejects.toThrow(
		"one document",
	);
	expect(created.map((tree) => tree.nodeCount)).toEqual([0, 0]);
});

it("disposes a candidate initialized after its navigation has been stopped", async () => {
	const started = deferred<DocumentLoaderContext>();
	const loaded = deferred<DocumentTree>();
	const { session } = fixture({
		loadDocument: (_response, context) => {
			started.resolve(context);
			return loaded.promise;
		},
	});
	const tab = session.createTab().id;
	const navigation = expect(
		session.navigate(tab, initialUrl),
	).rejects.toMatchObject({ code: "aborted" });
	const context = await started.promise;
	session.stop(tab);
	await navigation;
	const late = new DocumentTree(initialUrl, context.limits);
	expect(() => context.initializeDocument?.(late)).toThrow();
	expect(late.nodeCount).toBe(0);
	loaded.resolve(late);
	await vi.waitFor(() => expect(session.metrics().pendingLoads).toBe(0));
});

it("keeps request diagnostics scoped to a tab's latest network navigation", async () => {
	const { session } = fixture();
	const first = session.createTab().id;
	const second = session.createTab().id;
	expect(session.requests(first)).toMatchObject({
		navigation: 0,
		document: null,
		entries: [],
	});
	await session.navigate(first, initialUrl);
	const original = session.requests(first);
	expect(original).toMatchObject({
		navigation: 1,
		scope: "latest-network-navigation",
		entries: [{ index: 0, kind: "document", state: "complete" }],
	});
	const tree = session.page(first).document;
	expect(original.document).toBe(tree.reference(tree.root));
	await session.navigate(first, `${initialUrl}#target`);
	expect(session.requests(first)).toEqual(original);
	await session.navigate(second, "https://other.example/");
	expect(session.requests(first)).toEqual(original);
	await session.navigate(first, "https://example.com/next");
	expect(session.requests(first)).toMatchObject({
		navigation: 2,
		entries: [{ index: 0, url: "https://example.com/next" }],
	});
	expect(session.request(first, 0).entry.url).toBe("https://example.com/next");
	session.closeTab(first);
	expect(() => session.requests(first)).toThrow("Unknown session tab");
});

it("gives parsed and committed documents the same scoped fetch port with controlled cookies and redirects", async () => {
	let fetch: DocumentLoaderContext["fetch"];
	const { session, requests } = fixture({
		loadDocument: async (result, context) => {
			fetch = context.fetch;
			await fetch?.({
				url: "https://example.com/early",
				cookieContext: {
					siteUrl: "https://evil.example/",
					credentials: "omit",
					topLevelNavigation: true,
				},
			});
			return documentFixture(result, context);
		},
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(session.page(tab).fetch).toBe(fetch);
	await fetch?.({ url: "https://example.com/late", redirect: "follow" });
	expect(requests[1]).toMatchObject({
		redirect: "manual",
		cookieContext: {
			siteUrl: initialUrl,
			credentials: "omit",
			topLevelNavigation: false,
		},
	});
	expect(requests[2]).toMatchObject({
		redirect: "manual",
		cookieContext: { siteUrl: initialUrl, credentials: "same-origin" },
	});
	expect(session.requests(tab).entries.map((entry) => entry.kind)).toEqual([
		"document",
		"fetch",
		"fetch",
	]);
	await expect(fetch?.({ url: "https://evil.example/" })).rejects.toMatchObject(
		{ code: "policy-denied" },
	);
	expect(requests).toHaveLength(3);
});

it("aborts committed document fetch ports when their tab closes", async () => {
	const pending = deferred<NetworkResponse>();
	const { session, requests } = fixture({}, async (input) =>
		input.url.endsWith("/pending") ? pending.promise : response(input.url),
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const fetch = session.page(tab).fetch;
	if (!fetch) throw Error("Missing document fetch port");
	const task = fetch({ url: "https://example.com/pending" });
	const stopped = expect(task).rejects.toMatchObject({ code: "closed" });
	session.closeTab(tab);
	expect(requests[1].signal?.aborted).toBe(true);
	pending.resolve(response("https://example.com/pending"));
	await stopped;
	await expect(fetch({ url: initialUrl })).rejects.toMatchObject({
		code: "closed",
	});
});

it("blocks response CSP on the session fetch boundary and preserves the readable document", async () => {
	const { session, requests } = fixture({}, async (input) =>
		response(input.url, {
			headers: { "Content-Security-Policy": ["connect-src 'none'"] },
		}),
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	await expect(
		session.page(tab).fetch?.({ url: "https://example.com/data" }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests).toHaveLength(1);
	expect(session.requests(tab).entries[1]).toMatchObject({
		kind: "fetch",
		state: "blocked",
	});
	expect(session.snapshot(tab).entries.length).toBeGreaterThan(0);
});

it("carries trusted CORS preflight metadata without losing document cookie or redirect context", async () => {
	const { session, requests } = fixture();
	const observeCorsResult = vi.fn();
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const fetch = session.page(tab).fetch;
	await fetch?.(
		{
			url: "https://api.example/data",
			method: "OPTIONS",
			cookieContext: {
				siteUrl: "https://wrong.example/",
				credentials: "omit",
				crossSiteRedirect: true,
			},
		},
		{ cors: true, preflight: true, observeCorsResult },
	);
	expect(requests[1]).toMatchObject({
		redirect: "manual",
		cookieContext: {
			siteUrl: initialUrl,
			credentials: "omit",
			crossSiteRedirect: true,
			topLevelNavigation: false,
		},
	});
	expect(session.requests(tab).entries[1]).toMatchObject({
		kind: "preflight",
		method: "OPTIONS",
		state: "complete",
		cors: "pending",
	});
	expect(observeCorsResult).toHaveBeenCalledTimes(1);
	observeCorsResult.mock.calls[0][0]("blocked");
	expect(session.requests(tab).entries[1]).toMatchObject({
		state: "complete",
		cors: "blocked",
	});
	await expect(
		fetch?.({ url: "http://api.example/data" }, { cors: true }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests).toHaveLength(2);
});

it("uses session routes for real HTML and stylesheet loading across tabs without transport calls", async () => {
	const { session, requests } = fixture({ loadDocument: loadBrowserDocument });
	session.routes.add("**/routed.html", {
		body: '<h1>Routed document</h1><link rel="stylesheet" href="/site.css">',
		contentType: "text/html",
	});
	session.routes.add("**/site.css", {
		body: "h1 { color: red; }",
		contentType: "text/css",
	});
	for (let index = 0; index < 2; index++) {
		const tab = session.createTab().id;
		await session.navigate(tab, "https://example.com/routed.html");
		expect(
			session.page(tab).document.textContent(session.page(tab).document.root),
		).toContain("Routed document");
		expect(session.requests(tab).entries).toMatchObject([
			{ kind: "document", routeId: 1 },
			{ kind: "stylesheet", routeId: 2 },
		]);
	}
	expect(requests).toHaveLength(0);
	expect(session.metrics().routes.fulfilled).toBe(4);
	session.close();
	expect(session.routes.metrics()).toMatchObject({
		closed: true,
		routes: 0,
		retainedBytes: 0,
	});
});

it("does not fall through to outbound transport if route matching exhausts its work limit", async () => {
	const { session, requests } = fixture();
	session.routes.add(`**/${"a".repeat(508)}`, { status: 404 });
	const tab = session.createTab().id;
	await expect(
		session.navigate(tab, `https://example.com/${"b".repeat(5000)}`),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(requests).toHaveLength(0);
	expect(session.requests(tab).entries[0]).toMatchObject({
		state: "failed",
		error: "resource-limit",
	});
});

it("prevents automatic transport redirects from silently bypassing active routes", async () => {
	const { session, requests } = fixture({}, async (input) =>
		response(input.url, {
			status: 307,
			headers: { location: ["https://example.com/should-be-mocked"] },
		}),
	);
	session.routes.add("**/should-be-mocked", { body: "mock" });
	const tab = session.createTab().id;
	await expect(
		session.navigate(tab, "https://example.com/start"),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(requests).toHaveLength(1);
	expect(requests[0].redirect).toBe("manual");
	expect(session.routes.metrics().fulfilled).toBe(0);
});

it("exposes manual redirect mocks but fails closed for navigation on an incapable adapter", async () => {
	const { session, requests } = fixture();
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	session.routes.add("**/mock", {
		status: 302,
		headers: { Location: "/target" },
	});
	const fetch = session.page(tab).fetch;
	if (!fetch) throw new Error("Expected document fetch port");
	expect(
		await fetch({ url: "https://example.com/mock", redirect: "manual" }),
	).toMatchObject({ status: 302, headers: { location: ["/target"] } });
	await expect(
		session.navigate(tab, "https://example.com/mock"),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(requests).toHaveLength(1);
	expect(session.page(tab).document.url).toBe(initialUrl);
});

it("revokes the old fetch port on replacement but preserves it across fragment navigation", async () => {
	const { session } = fixture();
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const fetch = session.page(tab).fetch;
	await session.navigate(tab, `${initialUrl}#target`);
	await expect(
		fetch?.({ url: "https://example.com/data" }),
	).resolves.toMatchObject({ status: 200 });
	await session.navigate(tab, "https://example.com/replaced");
	await expect(
		fetch?.({ url: "https://example.com/late" }),
	).rejects.toMatchObject({ code: "closed" });
	expect(session.requests(tab).entries.map((entry) => entry.kind)).toEqual([
		"document",
	]);
});

it("captures subresource responses and mixed-content blocks without exposing secrets", async () => {
	const { session, requests } = fixture({
		loadDocument: async (result, context) => {
			await context.fetchScript?.("https://example.com/app.js?token=secret");
			await context.fetchStylesheet?.("https://example.com/style.css");
			await expect(
				context.fetchScript?.("http://example.com/mixed.js"),
			).rejects.toMatchObject({ code: "policy-denied" });
			return documentFixture(result, context);
		},
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(session.requests(tab).entries).toMatchObject([
		{ kind: "document", state: "complete" },
		{
			kind: "script",
			state: "complete",
			url: "https://example.com/app.js?redacted",
		},
		{ kind: "stylesheet", state: "complete" },
		{ kind: "script", state: "blocked", error: "policy-denied" },
	]);
	expect(requests).toHaveLength(3);
	expect(JSON.stringify(session.requests(tab))).not.toContain("secret");
});

it("captures actual stylesheet and image traffic without inventing disabled script execution", async () => {
	const { session, requests } = fixture(
		{ loadDocument: loadBrowserDocument },
		async (input) => {
			const stylesheet = new URL(input.url).pathname.endsWith(".css");
			const body = new TextEncoder().encode(
				stylesheet
					? "h1 { display: block }"
					: '<link rel="stylesheet" href="/style.css?secret"><link rel="stylesheet" href="http://example.com/mixed.css"><h1>Actual parsed fixture</h1><script src="/disabled.js"></script><img src="/unfetched.png">',
			);
			return response(input.url, {
				body,
				encodedBytes: body.length,
				headers: {
					"content-type": [
						stylesheet ? "text/css" : "text/html; charset=utf-8",
					],
				},
			});
		},
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(
		session
			.snapshot(tab)
			.entries.some((entry) => entry.name === "Actual parsed fixture"),
	).toBe(true);
	expect(requests).toHaveLength(3);
	expect(requests.some((request) => request.url.endsWith("/disabled.js"))).toBe(
		false,
	);
	expect(session.requests(tab).entries).toMatchObject([
		{ kind: "document", state: "complete" },
		{
			kind: "stylesheet",
			state: "complete",
			url: "https://example.com/style.css?redacted",
		},
		{ kind: "stylesheet", state: "blocked" },
		{
			kind: "image",
			state: "complete",
			url: "https://example.com/unfetched.png",
		},
	]);
});

it("distinguishes a failed navigation attempt from the still-displayed old document", async () => {
	const { session } = fixture({}, async (input) => {
		if (input.url.endsWith("/fail"))
			throw new AgentBrowserError("network-error", "secret");
		return response(input.url);
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const previous = session.requests(tab).document;
	await expect(
		session.navigate(tab, "https://example.com/fail"),
	).rejects.toThrow("secret");
	expect(session.requests(tab)).toMatchObject({
		navigation: 2,
		document: null,
		displayedDocument: previous,
		entries: [{ state: "failed", error: "network-error" }],
	});
});

it("records cancellation even when the transport has not settled", async () => {
	const pending = deferred<NetworkResponse>();
	const { session } = fixture({}, () => pending.promise);
	const tab = session.createTab().id;
	const controller = new AbortController();
	const task = session.navigate(tab, initialUrl, { signal: controller.signal });
	await Promise.resolve();
	expect(session.requests(tab).entries[0].state).toBe("pending");
	controller.abort();
	await expect(task).rejects.toMatchObject({ code: "aborted" });
	expect(session.requests(tab).entries[0]).toMatchObject({
		state: "failed",
		error: "aborted",
	});
	pending.resolve(response());
	await Promise.resolve();
	expect(session.requests(tab).entries[0].state).toBe("failed");
});

it("does not let superseded transport completions contaminate the next journal", async () => {
	const pending = deferred<NetworkResponse>();
	const { session } = fixture({}, (input) =>
		input.url === initialUrl
			? pending.promise
			: Promise.resolve(response(input.url)),
	);
	const tab = session.createTab().id;
	const first = session.navigate(tab, initialUrl);
	const cancelled = expect(first).rejects.toMatchObject({ code: "aborted" });
	await Promise.resolve();
	await session.navigate(tab, "https://example.com/new");
	await cancelled;
	const current = session.requests(tab);
	pending.resolve(response());
	await Promise.resolve();
	expect(session.requests(tab)).toEqual(current);
	expect(current).toMatchObject({
		navigation: 2,
		entries: [{ url: "https://example.com/new", state: "complete" }],
	});
});

it("leaves non-network navigation rejections out of the journal and identifies no-content attempts", async () => {
	const { session } = fixture({}, async (input) =>
		response(input.url, { status: input.url.endsWith("/empty") ? 204 : 200 }),
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const previous = session.requests(tab);
	await expect(session.navigate(tab, "file:///secret")).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(session.requests(tab)).toEqual(previous);
	await session.navigate(tab, "https://example.com/empty");
	expect(session.requests(tab)).toMatchObject({
		navigation: 2,
		document: null,
		displayedDocument: previous.document,
		entries: [{ status: 204, state: "complete" }],
	});
});

it("closes partial adapter resources when construction rejects an invalid transport", () => {
	let cookies: CookieJar | undefined;
	const close = vi.fn();
	expect(
		() =>
			new BrowserSession({
				createTransport: (jar) => {
					cookies = jar;
					return { close } as unknown as NetworkTransport;
				},
				loadDocument: documentFixture,
			}),
	).toThrow("Invalid session transport adapter");
	expect(close).toHaveBeenCalledOnce();
	expect(cookies?.metrics().closed).toBe(true);
});

it("keeps abort cleanup bound to the original signal even if caller options change", async () => {
	const waiting = deferred<NetworkResponse>();
	const started = deferred<void>();
	const { session } = fixture({}, async () => {
		started.resolve();
		return waiting.promise;
	});
	const tab = session.createTab();
	const original = new AbortController();
	const replacement = new AbortController();
	const remove = vi.spyOn(original.signal, "removeEventListener");
	const options = { signal: original.signal };
	const pending = session.navigate(tab.id, initialUrl, options);
	await started.promise;
	options.signal = replacement.signal;
	waiting.resolve(response());
	await pending;
	expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});

it("owns tabs, selection, isolated profile cookies and opener-copied session storage", () => {
	const { session, cookies } = fixture();
	expect(cookies).toBe(session.cookies);
	const first = session.createTab();
	session.storage.localStorage(first.id, initialUrl).setItem("shared", "local");
	session.storage
		.sessionStorage(first.id, initialUrl)
		.setItem("copied", "original");
	const second = session.createTab({ opener: first.id, select: false });
	expect(second.selected).toBe(false);
	expect(
		session.storage.localStorage(second.id, initialUrl).getItem("shared"),
	).toBe("local");
	const secondArea = session.storage.sessionStorage(second.id, initialUrl);
	expect(secondArea.getItem("copied")).toBe("original");
	secondArea.setItem("copied", "independent");
	expect(
		session.storage.sessionStorage(first.id, initialUrl).getItem("copied"),
	).toBe("original");
	expect(session.selectTab(second.id).selected).toBe(true);
	session.closeTab(second.id);
	expect(() => secondArea.getItem("copied")).toThrow();
	expect(session.tabs()[0].selected).toBe(true);
	expect(session.createTab().id).not.toBe(second.id);
	expect(fixture().session.storage.metrics().entries).toBe(0);
});

it("commits loaded documents and exposes real queries, actions, snapshots and stale reference rejection", async () => {
	const { session, documents } = fixture();
	const tab = session.createTab();
	expect(() => session.page(tab.id)).toThrow("no committed document");
	const first = await session.navigate(tab.id, initialUrl);
	expect(first.kind).toBe("document");
	expect(first.documentRef).toBe(documents[0].reference(documents[0].root));
	const page = session.page(tab.id);
	const linkId = page.queries.querySelector("a");
	if (linkId === null) throw new Error("Missing fixture link");
	const link = page.document.reference(linkId);
	expect(
		session.snapshot(tab.id).entries.some((entry) => entry.name === "Next"),
	).toBe(true);
	const click = await session.click(tab.id, link);
	expect(click.navigation).toMatchObject({
		kind: "document",
		url: "https://example.com/next",
	});
	expect(() => page.document.resolve(link)).toThrow("closed");
	expect(() => session.page(tab.id).document.resolve(link)).toThrow();
	expect(session.metrics()).toMatchObject({ commits: 2, pendingLoads: 0 });
});

it("uses same-document history for fragment links, retains references and forces fresh documents on reload", async () => {
	const { session, requests } = fixture();
	const tab = session.createTab();
	await session.navigate(tab.id, initialUrl);
	const page = session.page(tab.id);
	const target = page.queries.querySelector("#target");
	expect((await session.navigate(tab.id, "#target")).kind).toBe(
		"same-document",
	);
	expect(session.page(tab.id)).toBe(page);
	expect(page.document.targetElement).toBe(target);
	expect(page.history.snapshot().length).toBe(2);
	expect(requests).toHaveLength(1);
	await session.reload(tab.id);
	expect(requests).toHaveLength(2);
	expect(session.page(tab.id)).not.toBe(page);
	expect(session.page(tab.id).document.targetElement).not.toBeNull();
});

it("resolves relative API navigation against the committed URL, not a document base element", async () => {
	const { session, requests } = fixture();
	const tab = session.createTab();
	await session.navigate(tab.id, "https://example.com/dir/start");
	const tree = session.page(tab.id).document;
	tree.append(
		tree.root,
		tree.createElement("base", { href: "https://other.test/base/" }),
	);
	await session.navigate(tab.id, "next");
	expect(requests[1].url).toBe("https://example.com/dir/next");
});

it("preserves a committed page while loading and after network or loader failure", async () => {
	const loading = deferred<NetworkResponse>();
	const started = deferred<void>();
	const { session } = fixture({}, async (request) => {
		if (request.url.endsWith("/bad")) {
			started.resolve();
			return loading.promise;
		}
		return response(request.url);
	});
	const tab = session.createTab();
	await session.navigate(tab.id, initialUrl);
	const page = session.page(tab.id);
	const failed = session.navigate(tab.id, "/bad");
	const rejection = expect(failed).rejects.toMatchObject({
		code: "network-error",
	});
	await started.promise;
	expect(session.tabs()[0]).toMatchObject({ url: initialUrl, loading: true });
	expect(session.page(tab.id)).toBe(page);
	loading.reject(
		new AgentBrowserError("network-error", "Fixture network failure"),
	);
	await rejection;
	expect(session.page(tab.id)).toBe(page);
	expect(session.tabs()[0].loading).toBe(false);
});

it.each([204, 205])(
	"keeps the old page for HTTP %s without calling the loader",
	async (status) => {
		const { session, documents } = fixture({}, async (request) =>
			response(request.url, {
				status: request.url.endsWith("/empty") ? status : 200,
			}),
		);
		const tab = session.createTab();
		await session.navigate(tab.id, initialUrl);
		const page = session.page(tab.id);
		expect(await session.navigate(tab.id, "/empty")).toMatchObject({
			kind: "no-content",
			url: initialUrl,
			response: { status },
		});
		expect(session.page(tab.id)).toBe(page);
		expect(documents).toHaveLength(1);
	},
);

it("allows HTTP error documents but refuses downloads and bodyless 304 without discarding the old page", async () => {
	const { session, documents } = fixture({}, async (request) =>
		response(request.url, {
			status: request.url.endsWith("/cache") ? 304 : 404,
			headers: request.url.endsWith("/download")
				? { "content-disposition": ['ATTACHMENT; filename="fixture.txt"'] }
				: {},
		}),
	);
	const tab = session.createTab();
	expect((await session.navigate(tab.id, initialUrl)).response?.status).toBe(
		404,
	);
	const page = session.page(tab.id);
	await expect(session.navigate(tab.id, "/download")).rejects.toMatchObject({
		code: "unsupported",
	});
	await expect(session.navigate(tab.id, "/cache")).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(session.page(tab.id)).toBe(page);
	expect(documents).toHaveLength(1);
});

it("supersedes pending work and closes a late document without allowing stale commits", async () => {
	const firstLoad = deferred<DocumentTree>();
	const started = deferred<DocumentLoaderContext>();
	let late: DocumentTree | undefined;
	const { session } = fixture({
		loadDocument: (result, context) => {
			if (result.url.endsWith("/slow")) {
				started.resolve(context);
				late = documentFixture(result, context);
				return firstLoad.promise;
			}
			return documentFixture(result, context);
		},
	});
	const tab = session.createTab();
	const first = session.navigate(tab.id, "https://example.com/slow");
	const rejection = expect(first).rejects.toMatchObject({ code: "aborted" });
	const context = await started.promise;
	await session.navigate(tab.id, "https://example.com/new");
	await rejection;
	expect(context.signal.aborted).toBe(true);
	expect(session.metrics().pendingLoads).toBe(1);
	if (!late) throw new Error("Missing late fixture");
	firstLoad.resolve(late);
	await vi.waitFor(() => expect(session.metrics().pendingLoads).toBe(0));
	expect(late.nodeCount).toBe(0);
	expect(session.tabs()[0].url).toBe("https://example.com/new");
});

it("aborts queued same-document work before it can change the current fragment", async () => {
	const { session } = fixture();
	const tab = session.createTab();
	await session.navigate(tab.id, initialUrl);
	const page = session.page(tab.id);
	const controller = new AbortController();
	const navigation = session.navigate(tab.id, "#target", {
		signal: controller.signal,
	});
	const rejection = expect(navigation).rejects.toMatchObject({
		code: "aborted",
	});
	await Promise.resolve();
	controller.abort();
	await rejection;
	expect(page.document.url).toBe(initialUrl);
});

it.each(["stop", "closeTab", "close"] as const)(
	"%s cancels pending work promptly and disposes late loader results",
	async (action) => {
		const waiting = deferred<DocumentTree>();
		const started = deferred<void>();
		let late: DocumentTree | undefined;
		const { session } = fixture({
			loadDocument: (result, context) => {
				late = documentFixture(result, context);
				started.resolve();
				return waiting.promise;
			},
		});
		const tab = session.createTab();
		const navigation = session.navigate(tab.id, initialUrl);
		const rejection = expect(navigation).rejects.toMatchObject({
			code: action === "stop" ? "aborted" : "closed",
		});
		await started.promise;
		if (action === "close") session.close();
		else session[action](tab.id);
		await rejection;
		expect(session.metrics().pendingLoads).toBe(1);
		if (!late) throw new Error("Missing late fixture");
		waiting.resolve(late);
		await vi.waitFor(() => expect(session.metrics().pendingLoads).toBe(0));
		expect(late.nodeCount).toBe(0);
		if (action === "stop")
			expect(session.tabs()[0]).toMatchObject({ url: null, loading: false });
	},
);

it("bounds uncooperative loaders after timeout instead of allowing unlimited replacements", async () => {
	const waiting = deferred<DocumentTree>();
	let late: DocumentTree | undefined;
	const { session } = fixture({
		limits: { maxPendingNavigations: 1, navigationTimeoutMs: 10 },
		loadDocument: (result, context) => {
			late = documentFixture(result, context);
			return waiting.promise;
		},
	});
	const tab = session.createTab();
	await expect(session.navigate(tab.id, initialUrl)).rejects.toMatchObject({
		code: "timeout",
	});
	expect(session.tabs()[0].loading).toBe(false);
	await expect(session.navigate(tab.id, initialUrl)).rejects.toMatchObject({
		code: "resource-limit",
	});
	if (!late) throw new Error("Missing late fixture");
	waiting.resolve(late);
	await vi.waitFor(() => expect(session.metrics().pendingLoads).toBe(0));
});

it("clears the deadline immediately on stop even if the loader has not settled", async () => {
	vi.useFakeTimers();
	try {
		const waiting = deferred<DocumentTree>();
		const started = deferred<DocumentTree>();
		const { session } = fixture({
			loadDocument: (result, context) => {
				started.resolve(documentFixture(result, context));
				return waiting.promise;
			},
		});
		const tab = session.createTab();
		const navigation = session.navigate(tab.id, initialUrl);
		const rejection = expect(navigation).rejects.toMatchObject({
			code: "aborted",
		});
		const candidate = await started.promise;
		expect(vi.getTimerCount()).toBe(1);
		session.stop(tab.id);
		await rejection;
		expect(vi.getTimerCount()).toBe(0);
		waiting.resolve(candidate);
		await vi.runAllTimersAsync();
		expect(candidate.nodeCount).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});

it("lets the latest reentrant navigation win when cancellation invokes another navigation", async () => {
	const waiting = deferred<DocumentTree>();
	const started = deferred<void>();
	let late: DocumentTree | undefined;
	let reentrant: Promise<NavigationResult> | undefined;
	let tabId = "";
	const { session } = fixture({
		loadDocument: (result, context) => {
			if (result.url.endsWith("/slow")) {
				late = documentFixture(result, context);
				context.signal.addEventListener(
					"abort",
					() => {
						reentrant = session.navigate(tabId, "https://example.com/latest");
					},
					{ once: true },
				);
				started.resolve();
				return waiting.promise;
			}
			return documentFixture(result, context);
		},
	});
	tabId = session.createTab().id;
	const first = session.navigate(tabId, "https://example.com/slow");
	const firstRejection = expect(first).rejects.toMatchObject({
		code: "aborted",
	});
	await started.promise;
	await expect(
		session.navigate(tabId, "https://example.com/intermediate"),
	).rejects.toMatchObject({ code: "aborted" });
	await firstRejection;
	expect((await reentrant)?.url).toBe("https://example.com/latest");
	if (!late) throw new Error("Missing late fixture");
	waiting.resolve(late);
	await vi.waitFor(() => expect(session.metrics().pendingLoads).toBe(0));
});

it("does not let a loader steal or close another page's already-owned document", async () => {
	const first = fixture();
	const firstTab = first.session.createTab();
	await first.session.navigate(firstTab.id, initialUrl);
	const original = first.session.page(firstTab.id).document;
	const second = fixture({ loadDocument: () => original });
	const secondTab = second.session.createTab();
	await expect(
		second.session.navigate(secondTab.id, initialUrl),
	).rejects.toThrow("already owned");
	expect(original.nodeCount).toBeGreaterThan(0);
	expect(first.session.page(firstTab.id).document).toBe(original);
});

it.each(["url", "limits", "closed"])(
	"closes invalid loader documents with bad %s",
	async (problem) => {
		let candidate: DocumentTree | undefined;
		const { session } = fixture({
			loadDocument: (result, context) => {
				candidate = new DocumentTree(
					problem === "url" ? "https://other.test/" : result.url,
					problem === "limits"
						? { ...context.limits, maxNodes: context.limits.maxNodes + 1 }
						: context.limits,
				);
				if (problem === "closed") candidate.close();
				return candidate;
			},
		});
		const tab = session.createTab();
		await expect(session.navigate(tab.id, initialUrl)).rejects.toThrow();
		expect(candidate?.nodeCount).toBe(0);
		expect(session.tabs()[0].url).toBeNull();
	},
);

it("sanitizes unexpected loader failures and executes native form submit navigation", async () => {
	const { session } = fixture({
		loadDocument: () => {
			throw new Error("secret fixture body");
		},
	});
	const tab = session.createTab();
	await expect(session.navigate(tab.id, initialUrl)).rejects.toMatchObject({
		message: "Document loader failed",
	});
	const working = fixture().session;
	const active = working.createTab();
	await working.navigate(active.id, initialUrl);
	const tree = working.page(active.id).document;
	const form = tree.createElement("form");
	const submitter = tree.createElement("button");
	tree.append(tree.get(tree.root).children[0], form);
	tree.append(form, submitter);
	const result = await working.click(active.id, tree.reference(submitter));
	expect(result.interaction.defaultAction?.kind).toBe("submit");
	expect(result.navigation?.kind).toBe("document");
});

it("keeps new-window/named-target links pending without silently navigating the current tab", async () => {
	const { session, requests } = fixture();
	const tab = session.createTab();
	await session.navigate(tab.id, initialUrl);
	const tree = session.page(tab.id).document;
	const link = tree.createElement("a", { href: "/new", target: "_blank" });
	tree.append(tree.get(tree.root).children[0], link);
	tree.append(link, tree.createText("New window"));
	expect(
		(await session.click(tab.id, tree.reference(link))).navigation,
	).toBeUndefined();
	expect(requests).toHaveLength(1);
	expect(session.tabs()).toHaveLength(1);
});

it("cleans all owned resources even if a document's cleanup hook throws", async () => {
	const { session } = fixture();
	const first = session.createTab();
	const second = session.createTab();
	await session.navigate(first.id, initialUrl);
	await session.navigate(second.id, initialUrl);
	session.page(first.id).document.onClose(() => {
		throw new Error("sensitive cleanup fixture");
	});
	session.close();
	expect(session.metrics()).toMatchObject({
		tabs: 0,
		closed: true,
		cleanupErrors: 1,
		network: { closed: true },
		cookies: { closed: true },
		storage: { closed: true },
	});
	expect(JSON.stringify(session.metrics())).not.toContain("sensitive");
	expect(() => session.createTab()).toThrow("closed");
});

it("validates adapters, tab/navigation limits and pre-aborted requests before side effects", async () => {
	expect(() => new BrowserSession({} as BrowserSessionOptions)).toThrow(
		"explicit",
	);
	const { session, requests } = fixture({
		limits: { maxTabs: 1, maxNavigations: 1 },
	});
	const tab = session.createTab();
	expect(() => session.createTab()).toThrow("tab limit");
	const controller = new AbortController();
	controller.abort();
	await expect(
		session.navigate(tab.id, initialUrl, { signal: controller.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	await expect(
		session.navigate(tab.id, "file:///etc/passwd"),
	).rejects.toThrow();
	await expect(
		session.navigate(tab.id, "https://exa\nmple.com/"),
	).rejects.toMatchObject({ code: "invalid-input" });
	await expect(
		session.navigate(
			tab.id,
			initialUrl,
			[] as unknown as { signal?: AbortSignal },
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(() =>
		session.createTab(42 as unknown as { select?: boolean }),
	).toThrow("Invalid tab options");
	expect(requests).toHaveLength(0);
	await session.navigate(tab.id, initialUrl);
	await expect(session.navigate(tab.id, "/next")).rejects.toThrow(
		"navigation limit",
	);
});
