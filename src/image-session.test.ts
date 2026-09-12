import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { documentImages } from "./document-images.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { BrowserSession } from "./session.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const sessions: BrowserSession[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
});
function response(url: string, html?: string): NetworkResponse {
	const body =
		html === undefined
			? encodePng(createRaster(3, 2, [10, 20, 30, 255]))
			: new TextEncoder().encode(html);
	return {
		url,
		status: 200,
		headers: {
			"content-type": [html === undefined ? "image/png" : "text/html"],
		},
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}
function fixture(
	load?: (input: NetworkRequest) => Promise<NetworkResponse>,
	html = '<img src="/image.png?secret=value"><img src="/image.png?secret=value">',
	initialized?: (tree: DocumentTree) => void,
) {
	const requests: NetworkRequest[] = [];
	const documents: DocumentTree[] = [];
	const browser = new BrowserSession({
		createTransport: () => ({
			request: async (input) => {
				requests.push(input);
				return load
					? load(input)
					: response(input.url, input.url.includes(".png") ? undefined : html);
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
		}),
		loadDocument: (result, context) =>
			loadBrowserDocument(result, {
				...context,
				initializeDocument(tree) {
					documents.push(tree);
					context.initializeDocument?.(tree);
					initialized?.(tree);
				},
			}),
	});
	sessions.push(browser);
	const tab = browser.createTab().id;
	return { browser, tab, requests, documents };
}

it("loads PNGs through session policy and exposes redacted agent/resource journal inspection", async () => {
	const { browser, requests } = fixture();
	const host = new BrowserCommandHost({ createSession: () => browser });
	try {
		const opened = await host.execute(["open", "https://example.com/page"]);
		expect(opened.command).toBe("open");
		const result = await host.execute(["images"]);
		expect(result.command).toBe("images");
		const serialized = JSON.stringify(result);
		expect(serialized).toContain('"naturalWidth":3');
		expect(serialized).not.toContain("secret=value");
		expect(
			requests.filter((request) => request.url.includes(".png")),
		).toHaveLength(1);
		const imageRequest = requests.find((request) =>
			request.url.includes(".png"),
		);
		expect(imageRequest).toMatchObject({
			redirect: "manual",
			headers: { accept: "image/png, image/jpeg, image/gif" },
			cookieContext: { credentials: "include", topLevelNavigation: false },
		});
		const journal = await host.execute(["requests"]);
		expect(JSON.stringify(journal)).toContain('"kind":"image"');
		expect(JSON.stringify(journal)).not.toContain("secret=value");
		const capability = await host.execute(["capabilities"]);
		expect(capability.data).toMatchObject({
			imageResources: {
				layout: true,
				painting: true,
				scaling: "nearest-neighbor",
			},
		});
	} finally {
		await host.close();
	}
});

it("allows post-commit source changes and releases the old document on replacement", async () => {
	const { browser, tab, requests } = fixture();
	await browser.navigate(tab, "https://example.com/page");
	const tree = browser.page(tab).document;
	const images = documentImages(tree);
	const first = images.inspect().images[0];
	tree.setAttribute(tree.resolve(first.ref).id, "src", "/next.png");
	await images.settle();
	expect(requests.some((request) => request.url.endsWith("/next.png"))).toBe(
		true,
	);
	await browser.navigate(tab, "https://example.com/next");
	expect(images.metrics()).toMatchObject({
		closed: true,
		decodedBytes: 0,
		resources: 0,
	});
});

it("rechecks every redirect target before issuing a mixed-content request", async () => {
	const { browser, tab, requests } = fixture(async (input) =>
		input.url.includes(".png")
			? {
					...response(input.url),
					status: 302,
					headers: { location: ["http://example.com/final.png"] },
				}
			: response(input.url, '<img src="/image.png">'),
	);
	await browser.navigate(tab, "https://example.com/page");
	expect(requests.some((request) => request.url.startsWith("http:"))).toBe(
		false,
	);
	expect(
		documentImages(browser.page(tab).document).inspect().images[0].error,
	).toBe("policy-denied");
	expect(
		browser.requests(tab).entries.find((entry) => entry.kind === "image")
			?.state,
	).toBe("blocked");
});

it("tracks cross-origin redirect taint even when an image returns to the page origin", async () => {
	const { browser, tab, requests } = fixture(async (input) => {
		if (input.url.endsWith("/page"))
			return response(input.url, '<img src="/image.png">');
		if (input.url.endsWith("/image.png"))
			return {
				...response(input.url),
				status: 302,
				headers: { location: ["https://cdn.example/remote.png"] },
			};
		if (input.url.includes("cdn.example"))
			return {
				...response(input.url),
				status: 302,
				headers: { location: ["https://example.com/final.png"] },
			};
		return response(input.url);
	});
	await browser.navigate(tab, "https://example.com/page");
	expect(
		documentImages(browser.page(tab).document).inspect().images[0],
	).toMatchObject({ state: "complete", originClean: false });
	expect(requests.at(-1)?.cookieContext?.crossSiteRedirect).toBe(true);
	expect(
		browser.requests(tab).entries.find((entry) => entry.kind === "image")
			?.redirectCount,
	).toBe(2);
});

it("bounds redirect loops and blocks CSP before issuing image network requests", async () => {
	const loop = fixture(async (input) =>
		input.url.includes(".png")
			? {
					...response(input.url),
					status: 302,
					headers: { location: ["/image.png"] },
				}
			: response(input.url, '<img src="/image.png">'),
	);
	await loop.browser.navigate(loop.tab, "https://example.com/page");
	expect(loop.requests).toHaveLength(22);
	expect(
		documentImages(loop.browser.page(loop.tab).document).inspect().images[0]
			.error,
	).toBe("resource-limit");
	const csp = fixture(async (input) => ({
		...response(input.url, '<img src="/image.png">'),
		headers: {
			"content-type": ["text/html"],
			"content-security-policy": ["img-src 'none'"],
		},
	}));
	await csp.browser.navigate(csp.tab, "https://example.com/page");
	expect(csp.requests).toHaveLength(1);
	expect(
		documentImages(csp.browser.page(csp.tab).document).inspect().images[0]
			.error,
	).toBe("policy-denied");
});

it("aborts an in-flight image navigation and closes its candidate owner", async () => {
	let imageStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		imageStarted = resolve;
	});
	const { browser, tab, documents } = fixture(async (input) => {
		if (input.url.includes(".png")) {
			imageStarted();
			return new Promise(() => {});
		}
		return response(input.url, '<img src="/image.png">');
	});
	const controller = new AbortController();
	const navigation = browser.navigate(tab, "https://example.com/page", {
		signal: controller.signal,
	});
	const rejected = expect(navigation).rejects.toMatchObject({
		code: "aborted",
	});
	await started;
	controller.abort();
	await rejected;
	expect(documentImages(documents[0]).metrics()).toMatchObject({
		closed: true,
		resources: 0,
		decodedBytes: 0,
	});
});

it("never shares decoded resources or network ownership across sessions", async () => {
	const first = fixture();
	const second = fixture();
	await Promise.all([
		first.browser.navigate(first.tab, "https://example.com/page"),
		second.browser.navigate(second.tab, "https://example.com/page"),
	]);
	const firstImages = documentImages(first.browser.page(first.tab).document);
	const secondImages = documentImages(second.browser.page(second.tab).document);
	expect(firstImages).not.toBe(secondImages);
	first.browser.close();
	expect(secondImages.inspect().images[0].state).toBe("complete");
	expect(first.requests).toHaveLength(2);
	expect(second.requests).toHaveLength(2);
});

it.each(["policy-denied", "network-error", "aborted"] as const)(
	"keeps optional image %s local while loading original CSS and navigating a link",
	async (code) => {
		const failed: number[] = [];
		const loaded: number[] = [];
		const { browser, tab, requests } = fixture(
			async (input) => {
				if (new URL(input.url).hostname === "blocked.invalid")
					throw new AgentBrowserError(
						code,
						"Isolated optional-image rejection",
					);
				if (input.url.endsWith("/style.css"))
					return {
						...response(
							input.url,
							"html,body{margin:0}main{width:120px;font-size:8px;line-height:10px}img{display:block}",
						),
						headers: { "content-type": ["text/css"] },
					};
				if (input.url.endsWith("/good.png")) return response(input.url);
				return response(
					input.url,
					input.url.endsWith("/next")
						? "<!doctype html><p>Next page</p>"
						: '<!doctype html><link rel="stylesheet" href="/style.css"><main><img id="blocked" src="https://blocked.invalid/track.png" alt="Blocked"><img id="good" src="/good.png"><a id="next" href="/next">Next</a></main>',
				);
			},
			undefined,
			(tree) => {
				const events = documentInteractions(tree).events;
				events.addEventListener(
					tree.root,
					"error",
					(event) => {
						if (event.target !== null) failed.push(event.target);
					},
					{ capture: true },
				);
				events.addEventListener(
					tree.root,
					"load",
					(event) => {
						if (event.target !== null) loaded.push(event.target);
					},
					{ capture: true },
				);
			},
		);
		await browser.navigate(tab, "https://example.com/page");
		const tree = browser.page(tab).document;
		const queries = new DocumentQueries(tree);
		const blocked = queries.querySelector("#blocked");
		const good = queries.querySelector("#good");
		const next = queries.querySelector("#next");
		if (blocked === null || good === null || next === null)
			throw new Error("Missing optional-image navigation fixture");
		const images = documentImages(tree);
		const events = documentInteractions(tree).events;
		expect(images.get(blocked)).toMatchObject({ state: "broken", error: code });
		expect(images.get(good)).toMatchObject({
			state: "complete",
			naturalWidth: 3,
		});
		expect(tree.get(blocked).attributes.src).toBe(
			"https://blocked.invalid/track.png",
		);
		expect(failed).toEqual([blocked]);
		expect(loaded).toEqual([good]);
		expect(documentStyles(tree).metrics().externalSheets).toBe(1);
		expect(
			requests.filter((request) => request.url.endsWith("/style.css")),
		).toHaveLength(1);
		expect(
			browser
				.requests(tab)
				.entries.find(
					(entry) => entry.kind === "image" && entry.error === code,
				),
		).toMatchObject({ state: code === "policy-denied" ? "blocked" : "failed" });
		expect(images.metrics()).toMatchObject({
			active: 0,
			queued: 0,
			requests: 2,
			closed: false,
		});
		await browser.click(tab, tree.reference(next));
		expect(browser.page(tab).document.url).toBe("https://example.com/next");
		expect(tree.nodeCount).toBe(0);
		expect(images.metrics()).toMatchObject({
			closed: true,
			active: 0,
			queued: 0,
			resources: 0,
			decodedBytes: 0,
		});
		expect(events.metrics()).toMatchObject({
			closed: true,
			listeners: 0,
			activeDispatches: 0,
		});
	},
);

it("shares one locally denied image failure and recovers only the changed source", async () => {
	const { browser, tab, requests } = fixture(async (input) => {
		if (new URL(input.url).hostname === "blocked.invalid")
			throw new AgentBrowserError(
				"policy-denied",
				"Isolated image origin policy",
			);
		return input.url.endsWith("/good.png")
			? response(input.url)
			: response(
					input.url,
					'<img id="first" src="https://blocked.invalid/track.png"><img id="second" src="https://blocked.invalid/track.png">',
				);
	});
	await browser.navigate(tab, "https://example.com/page");
	const tree = browser.page(tab).document;
	const queries = new DocumentQueries(tree);
	const first = queries.querySelector("#first");
	const second = queries.querySelector("#second");
	if (first === null || second === null)
		throw new Error("Missing shared images");
	const images = documentImages(tree);
	expect(images.get(first)).toMatchObject({
		state: "broken",
		error: "policy-denied",
	});
	expect(images.get(second)).toMatchObject({
		state: "broken",
		error: "policy-denied",
	});
	expect(
		requests.filter(
			(request) => new URL(request.url).hostname === "blocked.invalid",
		),
	).toHaveLength(1);
	const recovered: number[] = [];
	documentInteractions(tree).events.addEventListener(first, "load", () =>
		recovered.push(first),
	);
	tree.setAttribute(first, "src", "/good.png");
	await images.settle();
	expect(images.get(first)).toMatchObject({
		state: "complete",
		naturalWidth: 3,
	});
	expect(images.get(second)).toMatchObject({
		state: "broken",
		error: "policy-denied",
	});
	expect(recovered).toEqual([first]);
	expect(
		requests.filter(
			(request) => new URL(request.url).hostname === "blocked.invalid",
		),
	).toHaveLength(1);
	expect(browser.page(tab).document).toBe(tree);
});

it("keeps global cancellation fatal and closes candidate owners without replacing the prior page", async () => {
	let imageStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		imageStarted = resolve;
	});
	const { browser, tab, documents } = fixture(async (input) => {
		if (input.url.endsWith("/pending.png")) {
			imageStarted();
			return new Promise(() => {});
		}
		return response(
			input.url,
			input.url.endsWith("/candidate")
				? '<img src="/pending.png">'
				: "<p>Original page</p>",
		);
	});
	await browser.navigate(tab, "https://example.com/start");
	const original = browser.page(tab).document;
	const history = browser.history(tab);
	const controller = new AbortController();
	const navigation = browser.navigate(tab, "https://example.com/candidate", {
		signal: controller.signal,
	});
	const rejected = expect(navigation).rejects.toMatchObject({
		code: "aborted",
	});
	await started;
	const candidate = documents[1];
	const images = documentImages(candidate);
	const events = documentInteractions(candidate).events;
	expect(images.metrics()).toMatchObject({ active: 1, closed: false });
	controller.abort();
	await rejected;
	expect(browser.page(tab).document).toBe(original);
	expect(browser.history(tab)).toEqual(history);
	expect(original.nodeCount).toBeGreaterThan(0);
	expect(candidate.nodeCount).toBe(0);
	expect(images.metrics()).toMatchObject({
		closed: true,
		active: 0,
		queued: 0,
		resources: 0,
		decodedBytes: 0,
	});
	expect(events.metrics()).toMatchObject({
		closed: true,
		listeners: 0,
		activeDispatches: 0,
	});
});
