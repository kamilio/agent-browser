import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { documentImages } from "./document-images.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { BrowserSession } from "./session.js";

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
			headers: { accept: "image/png, image/jpeg" },
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
