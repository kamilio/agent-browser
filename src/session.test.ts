import { afterEach, expect, it, vi } from "vitest";
import { getEventListeners } from "node:events";
import type { CookieJar } from "./cookies.js";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import {
	NetworkRequestQueue,
	networkRequestQueueLimits,
} from "./network-request-queue.js";
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

function stylesheetResponse(input: NetworkRequest, sheetCount: number) {
	const sheet = new URL(input.url).pathname.match(/^\/sheet-(\d+)\.css$/);
	const body = new TextEncoder().encode(
		sheet
			? `#sheet-${sheet[1]} { visibility: hidden }`
			: `${Array.from(
					{ length: sheetCount },
					(_, index) =>
						`<link rel="stylesheet" href="/sheet-${index}.css"><p id="sheet-${index}">Sheet ${index}</p>`,
				).join("")}<h1>Complete stylesheet fixture</h1>`,
	);
	return response(input.url, {
		body,
		encodedBytes: body.length,
		headers: { "content-type": [sheet ? "text/css" : "text/html"] },
	});
}

function capacityFixture(
	maxConcurrent: number,
	loadDocument: NonNullable<BrowserSessionOptions["loadDocument"]>,
	handler: (request: NetworkRequest) => Promise<NetworkResponse> = async (
		input,
	) => {
		await Promise.resolve();
		return response(input.url);
	},
) {
	const requests: string[] = [];
	let active = 0;
	let peak = 0;
	let closed = false;
	const close = vi.fn(() => {
		closed = true;
	});
	const { session } = fixture({
		createTransport: () => ({
			limits: Object.freeze({ maxConcurrent }),
			async request(input) {
				if (active >= maxConcurrent)
					throw new AgentBrowserError(
						"resource-limit",
						"Concurrent request limit exceeded",
					);
				requests.push(input.url);
				active++;
				peak = Math.max(peak, active);
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
			close,
		}),
		loadDocument,
	});
	return { session, requests, peak: () => peak, close };
}

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});

it.each([1, 2])(
	"schedules shared stylesheet and image work at transport capacity %s",
	async (capacity) => {
		const { session, requests, peak } = capacityFixture(
			capacity,
			async (result, context) => {
				const image = new AbortController();
				await Promise.all([
					context.fetchStylesheet?.("https://example.com/style-1.css"),
					context.fetchImage?.("https://example.com/image.png", image.signal),
					context.fetchStylesheet?.("https://example.com/style-2.css"),
				]);
				return documentFixture(result, context);
			},
		);
		const tab = session.createTab();
		await session.navigate(tab.id, initialUrl);
		expect(requests).toEqual([
			initialUrl,
			"https://example.com/style-1.css",
			"https://example.com/image.png",
			"https://example.com/style-2.css",
		]);
		expect(peak()).toBe(capacity);
		expect(session.metrics()).toMatchObject({
			commits: 1,
			pendingLoads: 0,
			network: { active: 0 },
		});
	},
);

it("releases a resource slot after transport failure without retrying it", async () => {
	const outcomes: PromiseSettledResult<NetworkResponse | undefined>[] = [];
	const { session, requests } = capacityFixture(
		1,
		async (result, context) => {
			outcomes.push(
				...(await Promise.allSettled([
					context.fetchStylesheet?.("https://example.com/failing.css"),
					context.fetchStylesheet?.("https://example.com/next.css"),
				])),
			);
			return documentFixture(result, context);
		},
		async (input) => {
			await Promise.resolve();
			if (input.url.endsWith("/failing.css"))
				throw new AgentBrowserError("network-error", "Fixture failure");
			return response(input.url);
		},
	);
	await session.navigate(session.createTab().id, initialUrl);
	expect(outcomes.map((outcome) => outcome.status)).toEqual([
		"rejected",
		"fulfilled",
	]);
	expect(requests).toEqual([
		initialUrl,
		"https://example.com/failing.css",
		"https://example.com/next.css",
	]);
	expect(session.metrics().network.active).toBe(0);
});

it("removes a canceled queued image without dropping the following stylesheet", async () => {
	const firstStarted = deferred<void>();
	const releaseFirst = deferred<void>();
	const outcomes: PromiseSettledResult<NetworkResponse | undefined>[] = [];
	const { session, requests } = capacityFixture(
		1,
		async (result, context) => {
			const controller = new AbortController();
			const first = context.fetchStylesheet?.("https://example.com/first.css");
			await firstStarted.promise;
			const image = context.fetchImage?.(
				"https://example.com/canceled.png",
				controller.signal,
			);
			const last = context.fetchStylesheet?.("https://example.com/last.css");
			const settled = Promise.allSettled([first, image, last]);
			controller.abort();
			releaseFirst.resolve();
			outcomes.push(...(await settled));
			return documentFixture(result, context);
		},
		async (input) => {
			if (input.url.endsWith("/first.css")) {
				firstStarted.resolve();
				await releaseFirst.promise;
			}
			return response(input.url);
		},
	);
	await session.navigate(session.createTab().id, initialUrl);
	expect(outcomes.map((outcome) => outcome.status)).toEqual([
		"fulfilled",
		"rejected",
		"fulfilled",
	]);
	expect(outcomes[1]).toMatchObject({ reason: { code: "aborted" } });
	expect(requests).toEqual([
		initialUrl,
		"https://example.com/first.css",
		"https://example.com/last.css",
	]);
	expect(session.metrics().network.active).toBe(0);
});

it.each([0, -1, 1.5, 129, Number.NaN])(
	"rejects invalid advertised transport capacity %s and closes its adapter",
	(capacity) => {
		const close = vi.fn();
		expect(() =>
			fixture({
				createTransport: () => ({
					limits: { maxConcurrent: capacity },
					request: async (input) => response(input.url),
					metrics: () => ({
						requests: 0,
						active: 0,
						closed: false,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
					}),
					close,
				}),
			}),
		).toThrow("concurrency");
		expect(close).toHaveBeenCalledOnce();
	},
);

it("bounds pending network work and removes all abort listeners on close", async () => {
	const queue = new NetworkRequestQueue(1);
	const release = await queue.acquire();
	const controllers = Array.from(
		{ length: networkRequestQueueLimits.maxPending },
		() => new AbortController(),
	);
	const pending = Promise.allSettled(
		controllers.map((controller) => queue.acquire(controller.signal)),
	);
	expect(queue.metrics()).toMatchObject({ active: 1, pending: 128 });
	await expect(queue.acquire()).rejects.toMatchObject({
		code: "resource-limit",
	});
	for (const controller of controllers)
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
	queue.close();
	queue.close();
	const results = await pending;
	for (const result of results)
		expect(result).toMatchObject({
			status: "rejected",
			reason: { code: "closed" },
		});
	for (const controller of controllers)
		expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	release();
	release();
	expect(queue.metrics()).toMatchObject({
		active: 0,
		pending: 0,
		closed: true,
	});
	await expect(queue.acquire()).rejects.toMatchObject({ code: "closed" });
});

it("keeps queued network admission FIFO and releases each slot once", async () => {
	const queue = new NetworkRequestQueue(1);
	const release = await queue.acquire();
	const order: number[] = [];
	const tasks = Array.from({ length: 6 }, async (_, index) => {
		const finish = await queue.acquire();
		order.push(index);
		expect(queue.metrics().active).toBe(1);
		finish();
		finish();
	});
	expect(queue.metrics().pending).toBe(6);
	release();
	await Promise.all(tasks);
	expect(order).toEqual([0, 1, 2, 3, 4, 5]);
	expect(queue.metrics()).toMatchObject({ active: 0, pending: 0 });
	queue.close();
});

it("removes aborted queue waiters without consuming a transport slot", async () => {
	const queue = new NetworkRequestQueue(1);
	const release = await queue.acquire();
	const controller = new AbortController();
	const canceled = expect(
		queue.acquire(controller.signal),
	).rejects.toMatchObject({
		code: "aborted",
	});
	const next = queue.acquire();
	controller.abort();
	await canceled;
	expect(queue.metrics()).toMatchObject({ active: 1, pending: 1 });
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	release();
	(await next)();
	expect(queue.metrics()).toMatchObject({ active: 0, pending: 0 });
	await expect(queue.acquire(controller.signal)).rejects.toMatchObject({
		code: "aborted",
	});
	expect(queue.metrics()).toMatchObject({ active: 0, pending: 0 });
	queue.close();
});

it("removes a granted queue waiter's abort listener", async () => {
	const queue = new NetworkRequestQueue(1);
	const release = await queue.acquire();
	const controller = new AbortController();
	const waiting = queue.acquire(controller.signal);
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
	release();
	const finish = await waiting;
	expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
	controller.abort();
	expect(queue.metrics()).toMatchObject({ active: 1, pending: 0 });
	finish();
	queue.close();
});

it("closes active and queued session resources without late transport requests", async () => {
	const started = deferred<void>();
	const loaded = deferred<void>();
	const { session, requests } = capacityFixture(
		1,
		async (result, context) => {
			try {
				await Promise.allSettled([
					context.fetchStylesheet?.("https://example.com/active.css"),
					context.fetchStylesheet?.("https://example.com/queued.css"),
				]);
				return documentFixture(result, context);
			} finally {
				loaded.resolve();
			}
		},
		async (input) => {
			if (input.url.endsWith("/active.css")) {
				await new Promise<void>((_, reject) => {
					const abort = () => {
						input.signal?.removeEventListener("abort", abort);
						reject(new AgentBrowserError("closed", "Fixture closed"));
					};
					input.signal?.addEventListener("abort", abort, { once: true });
					started.resolve();
				});
			}
			return response(input.url);
		},
	);
	const navigation = session.navigate(session.createTab().id, initialUrl);
	const canceled = expect(navigation).rejects.toMatchObject({ code: "closed" });
	await started.promise;
	expect(session.metrics().requestQueue).toMatchObject({
		active: 1,
		pending: 1,
	});
	session.close();
	await canceled;
	await loaded.promise;
	expect(requests).toEqual([initialUrl, "https://example.com/active.css"]);
	expect(session.metrics().requestQueue).toMatchObject({
		active: 0,
		pending: 0,
		closed: true,
	});
	expect(session.metrics().network.active).toBe(0);
});

it.each([
	["stylesheet", false],
	["script", false],
	["stylesheet", true],
	["script", true],
] as const)(
	"cancels queued bootstrap %s work when loading settles with commit %s",
	async (kind, commit) => {
		const started = deferred<void>();
		const releaseActive = deferred<void>();
		const resources: Promise<unknown>[] = [];
		const activeUrl = "https://example.com/active.css";
		const queuedUrl = `https://example.com/stale.${kind === "script" ? "js" : "css"}`;
		const recoveredUrl = "https://example.com/recovered";
		const { session, requests } = capacityFixture(
			1,
			async (result, context) => {
				if (result.url === recoveredUrl)
					return documentFixture(result, context);
				resources.push(
					(
						context.fetchStylesheet?.(activeUrl) as Promise<NetworkResponse>
					).catch(() => undefined),
				);
				await started.promise;
				const fetchResource =
					kind === "script" ? context.fetchScript : context.fetchStylesheet;
				resources.push(
					(fetchResource?.(queuedUrl) as Promise<NetworkResponse>).catch(
						() => undefined,
					),
				);
				if (!commit) throw new Error("Fixture loader failed after resources");
				return documentFixture(result, context);
			},
			async (input) => {
				if (input.url === activeUrl) {
					started.resolve();
					await releaseActive.promise;
				}
				return response(input.url);
			},
		);
		const tab = session.createTab();
		try {
			const navigation = session.navigate(tab.id, initialUrl);
			if (commit) await navigation;
			else
				await expect(navigation).rejects.toMatchObject({ code: "unsupported" });
			expect(session.metrics().requestQueue).toMatchObject({
				active: 1,
				pending: 0,
			});
			releaseActive.resolve();
			await Promise.all(resources);
			await session.navigate(tab.id, recoveredUrl);
			expect(requests).toEqual([initialUrl, activeUrl, recoveredUrl]);
			expect(session.metrics().requestQueue).toMatchObject({
				active: 0,
				pending: 0,
			});
		} finally {
			releaseActive.resolve();
			await Promise.all(resources);
		}
	},
);

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

it.each([
	{ sheetCount: 12, maxStylesheetRequests: undefined, admitted: 8 },
	{ sheetCount: 18, maxStylesheetRequests: undefined, admitted: 8 },
	{ sheetCount: 12, maxStylesheetRequests: 1, admitted: 1 },
	{ sheetCount: 18, maxStylesheetRequests: 1, admitted: 1 },
	{ sheetCount: 12, maxStylesheetRequests: 12, admitted: 12 },
	{ sheetCount: 18, maxStylesheetRequests: 12, admitted: 12 },
	{ sheetCount: 12, maxStylesheetRequests: 24, admitted: 12 },
	{ sheetCount: 18, maxStylesheetRequests: 24, admitted: 18 },
])(
	"loads $admitted of $sheetCount real stylesheets with allowance $maxStylesheetRequests",
	async ({ sheetCount, maxStylesheetRequests, admitted }) => {
		const { session, requests } = fixture(
			{
				loadDocument: loadBrowserDocument,
				limits:
					maxStylesheetRequests === undefined ? {} : { maxStylesheetRequests },
			},
			async (input) => stylesheetResponse(input, sheetCount),
		);
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		expect(session.limits.maxStylesheetRequests).toBe(
			maxStylesheetRequests ?? 8,
		);
		expect(requests.map((request) => request.url)).toEqual([
			initialUrl,
			...Array.from(
				{ length: admitted },
				(_, index) => `https://example.com/sheet-${index}.css`,
			),
		]);
		const page = session.page(tab);
		expect(page.styles.metrics()).toMatchObject({ externalSheets: admitted });
		expect(page.styles.metrics().issues).toEqual(
			admitted < sheetCount
				? {
						"stylesheet-resource-limit": 1,
						"external-stylesheet-not-loaded": sheetCount - admitted,
					}
				: {},
		);
		for (let index = 0; index < sheetCount; index++) {
			const target = page.queries.querySelector(`#sheet-${index}`);
			if (target === null) throw new Error("Missing stylesheet fixture target");
			expect(page.styles.get(target).visibility).toBe(
				index < admitted ? "hidden" : "visible",
			);
		}
		expect(page.document.textContent(page.document.root)).toContain(
			"Complete stylesheet fixture",
		);
		expect(
			session
				.requests(tab)
				.entries.filter((entry) => entry.kind === "stylesheet"),
		).toMatchObject([
			...Array.from({ length: admitted }, () => ({ state: "complete" })),
			...(admitted < sheetCount
				? [{ state: "failed", error: "resource-limit" }]
				: []),
		]);
	},
);

it.each(["replacement", "separate tabs"])(
	"resets the exhausted stylesheet allowance for %s",
	async (mode) => {
		const { session, requests } = fixture(
			{
				loadDocument: loadBrowserDocument,
				limits: { maxStylesheetRequests: 12 },
			},
			async (input) => stylesheetResponse(input, 18),
		);
		const firstTab = session.createTab().id;
		for (let navigation = 0; navigation < 2; navigation++) {
			const tab =
				navigation === 1 && mode === "separate tabs"
					? session.createTab().id
					: firstTab;
			const url = `https://example.com/navigation-${navigation}`;
			const previousRequests = requests.length;
			await session.navigate(tab, url);
			expect(
				requests.slice(previousRequests).map((request) => request.url),
			).toEqual([
				url,
				...Array.from(
					{ length: 12 },
					(_, index) => `https://example.com/sheet-${index}.css`,
				),
			]);
			expect(session.page(tab).styles.metrics()).toMatchObject({
				externalSheets: 12,
				issues: { "stylesheet-resource-limit": 1 },
			});
		}
		expect(requests).toHaveLength(26);
	},
);

it("continues refusing stylesheet requests when a custom loader catches budget failures", async () => {
	const { session, requests } = fixture({
		limits: { maxStylesheetRequests: 2 },
		loadDocument: async (result, context) => {
			if (!context.fetchStylesheet) throw new Error("Missing stylesheet fetch");
			for (let index = 0; index < 6; index++) {
				const pending = context.fetchStylesheet(
					`https://example.com/sheet-${index}.css`,
				);
				if (index < 2)
					await expect(pending).resolves.toMatchObject({ status: 200 });
				else
					await expect(pending).rejects.toMatchObject({
						code: "resource-limit",
						message: "Stylesheet request limit exceeded",
					});
			}
			return documentFixture(result, context);
		},
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(requests.map((request) => request.url)).toEqual([
		initialUrl,
		"https://example.com/sheet-0.css",
		"https://example.com/sheet-1.css",
	]);
	const entries = session.requests(tab).entries;
	expect(entries.slice(3)).toMatchObject(
		Array.from({ length: 4 }, () => ({
			kind: "stylesheet",
			state: "failed",
			error: "resource-limit",
		})),
	);
});

it.each([
	{ url: "http://example.com/mixed.css", code: "policy-denied" },
	{ url: "not a network URL", code: "invalid-input" },
])(
	"counts a rejected $code stylesheet attempt without reaching transport",
	async ({ url, code }) => {
		const { session, requests } = fixture({
			limits: { maxStylesheetRequests: 1 },
			loadDocument: async (result, context) => {
				if (!context.fetchStylesheet)
					throw new Error("Missing stylesheet fetch");
				await expect(context.fetchStylesheet(url)).rejects.toMatchObject({
					code,
				});
				await expect(
					context.fetchStylesheet("https://example.com/valid.css"),
				).rejects.toMatchObject({ code: "resource-limit" });
				return documentFixture(result, context);
			},
		});
		await session.navigate(session.createTab().id, initialUrl);
		expect(requests.map((request) => request.url)).toEqual([initialUrl]);
	},
);

it("counts failed stylesheet transport attempts against the real loader allowance", async () => {
	const { session, requests } = fixture(
		{ loadDocument: loadBrowserDocument, limits: { maxStylesheetRequests: 2 } },
		async (input) => {
			if (input.url.endsWith("/sheet-0.css"))
				throw new AgentBrowserError(
					"network-error",
					"Fixture stylesheet failure",
				);
			return stylesheetResponse(input, 12);
		},
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(requests.map((request) => request.url)).toEqual([
		initialUrl,
		"https://example.com/sheet-0.css",
		"https://example.com/sheet-1.css",
	]);
	expect(session.page(tab).styles.metrics()).toMatchObject({
		externalSheets: 1,
		issues: { "stylesheet-network-error": 1, "stylesheet-resource-limit": 1 },
	});
});

it("reports an underlying transport resource limit beyond the default stylesheet allowance", async () => {
	const { session, requests } = fixture(
		{
			loadDocument: loadBrowserDocument,
			limits: { maxStylesheetRequests: 24 },
		},
		async (input) => {
			if (input.url.endsWith("/sheet-8.css"))
				throw new AgentBrowserError(
					"resource-limit",
					"Transport byte limit exceeded",
				);
			return stylesheetResponse(input, 18);
		},
	);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(requests.map((request) => request.url)).toEqual([
		initialUrl,
		...Array.from(
			{ length: 9 },
			(_, index) => `https://example.com/sheet-${index}.css`,
		),
	]);
	expect(session.page(tab).styles.metrics()).toMatchObject({
		externalSheets: 8,
		issues: { "stylesheet-resource-limit": 1 },
	});
	expect(session.requests(tab).entries.at(-1)).toMatchObject({
		url: "https://example.com/sheet-8.css",
		kind: "stylesheet",
		state: "failed",
		error: "resource-limit",
	});
});

it("preserves an uncaught transport resource failure with a higher stylesheet allowance", async () => {
	const failure = new AgentBrowserError(
		"resource-limit",
		"Transport byte limit exceeded",
	);
	const { session, requests } = fixture(
		{
			limits: { maxStylesheetRequests: 24 },
			loadDocument: async (result, context) => {
				if (!context.fetchStylesheet)
					throw new Error("Missing stylesheet fetch");
				for (let index = 0; index < 18; index++)
					await context.fetchStylesheet(
						`https://example.com/sheet-${index}.css`,
					);
				return documentFixture(result, context);
			},
		},
		async (input) => {
			if (input.url.endsWith("/sheet-8.css")) throw failure;
			return response(input.url);
		},
	);
	await expect(
		session.navigate(session.createTab().id, initialUrl),
	).rejects.toBe(failure);
	expect(requests).toHaveLength(10);
});

it.each([
	0,
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	129,
	"12",
	null,
])(
	"rejects invalid stylesheet allowance %s before creating transport",
	(value) => {
		const createTransport = vi.fn();
		expect(
			() =>
				new BrowserSession({
					createTransport,
					loadDocument: documentFixture,
					limits: { maxStylesheetRequests: value as number },
				}),
		).toThrow(
			expect.objectContaining({
				code: "invalid-input",
				message: "Invalid session limit: maxStylesheetRequests",
			}),
		);
		expect(createTransport).not.toHaveBeenCalled();
	},
);

it.each([1, 128])(
	"admits the valid stylesheet allowance endpoint %s",
	async (maxStylesheetRequests) => {
		const { session, requests } = fixture({
			limits: { maxStylesheetRequests },
			loadDocument: async (result, context) => {
				if (!context.fetchStylesheet)
					throw new Error("Missing stylesheet fetch");
				for (let index = 0; index < maxStylesheetRequests; index++)
					await context.fetchStylesheet(
						`https://example.com/sheet-${index}.css`,
					);
				await expect(
					context.fetchStylesheet("https://example.com/excess.css"),
				).rejects.toMatchObject({ code: "resource-limit" });
				return documentFixture(result, context);
			},
		});
		await session.navigate(session.createTab().id, initialUrl);
		expect(session.limits.maxStylesheetRequests).toBe(maxStylesheetRequests);
		expect(requests).toHaveLength(maxStylesheetRequests + 1);
		expect(
			requests.some((request) => request.url.endsWith("/excess.css")),
		).toBe(false);
	},
);

it("copies and freezes the stylesheet allowance without freezing caller options", async () => {
	const limits = { maxStylesheetRequests: 1 };
	const { session, requests } = fixture(
		{ limits, loadDocument: loadBrowserDocument },
		async (input) => stylesheetResponse(input, 12),
	);
	expect(session.limits).not.toBe(limits);
	expect(Object.isFrozen(session.limits)).toBe(true);
	expect(Object.isFrozen(limits)).toBe(false);
	limits.maxStylesheetRequests = 24;
	expect(Reflect.set(session.limits, "maxStylesheetRequests", 24)).toBe(false);
	expect(session.limits.maxStylesheetRequests).toBe(1);
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	expect(requests).toHaveLength(2);
	expect(session.page(tab).styles.metrics()).toMatchObject({
		externalSheets: 1,
		issues: { "stylesheet-resource-limit": 1 },
	});
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

it.each(["throw", "abort-then-throw"] as const)(
	"settles an initialized loader resource failure after close: %s",
	async (failureMode) => {
		const controller = new AbortController();
		const failure = new AgentBrowserError(
			"resource-limit",
			"Query work limit exceeded",
		);
		let partial: DocumentTree | undefined;
		let loaderCalls = 0;
		const { session, requests } = fixture({
			loadDocument: (result, context) => {
				loaderCalls++;
				partial = documentFixture(result, context);
				if (!context.initializeDocument)
					throw new Error("Missing native document initialization");
				context.initializeDocument(partial);
				if (failureMode === "abort-then-throw") controller.abort(failure);
				throw failure;
			},
		});
		const tab = session.createTab();
		await expect(
			session.navigate(tab.id, initialUrl, { signal: controller.signal }),
		).rejects.toMatchObject({
			code: failureMode === "throw" ? "resource-limit" : "aborted",
		});
		session.close();
		expect(session.metrics().pendingLoads).toBeLessThanOrEqual(1);
		await vi.waitFor(() => expect(session.metrics().pendingLoads).toBe(0));
		expect(loaderCalls).toBe(1);
		expect(requests).toHaveLength(1);
		expect(partial?.nodeCount).toBe(0);
		expect(session.metrics()).toMatchObject({
			closed: true,
			tabs: 0,
			navigations: 1,
			commits: 0,
			cleanupErrors: 0,
			network: { active: 0, closed: true },
		});
	},
);

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
