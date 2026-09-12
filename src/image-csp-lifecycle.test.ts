import { afterEach, expect, it } from "vitest";
import { documentImageContentSecurityPolicy } from "./document-image-content-security-policy.js";
import { documentImages } from "./document-images.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";
import { documentStyles } from "./styles.js";

const sessions: BrowserSession[] = [];
const documents: DocumentTree[] = [];
const pageUrl = "https://lifecycle.example/document";
const entryUrl = "https://lifecycle.example/admitted/entry.png";
const finalUrl = "https://lifecycle.example/outside/final.png";
const deniedUrl = "https://denied.example/final.png";

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function response(url: string, html?: string): NetworkResponse {
	const body =
		html === undefined
			? encodePng(createRaster(2, 4, [30, 60, 90, 255]))
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

function redirect(url: string, location: string): NetworkResponse {
	return {
		...response(url),
		status: 307,
		headers: { location: [location] },
	};
}

function transientRestriction(tree: DocumentTree) {
	const meta = tree.createElement("meta", {
		"http-equiv": "Content-Security-Policy",
		content: "img-src 'none'",
	});
	tree.append(tree.root, meta);
	tree.remove(meta);
}

function imageId(tree: DocumentTree) {
	const image = [...tree.walk()].find(({ node }) => node.tagName === "img");
	if (!image) throw new Error("Missing lifecycle image");
	return image.node.id;
}

function nativeFixture(
	image: (
		request: NetworkRequest,
		tree: DocumentTree,
	) => Promise<NetworkResponse>,
	options: {
		policies?: string[];
		html?: string;
	} = {},
) {
	const requests: NetworkRequest[] = [];
	const initialized: DocumentTree[] = [];
	const contexts: DocumentLoaderContext[] = [];
	const main = response(
		pageUrl,
		options.html ?? '<img src="/admitted/entry.png">',
	);
	main.headers = {
		...main.headers,
		"content-security-policy": options.policies ?? ["img-src 'self'"],
	};
	let active = 0;
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			request: async (request) => {
				requests.push(request);
				active++;
				try {
					if (request.url === pageUrl) return main;
					const tree = initialized[0];
					if (!tree) throw new Error("Image request before document ownership");
					return await image(request, tree);
				} finally {
					active--;
				}
			},
			metrics: () => ({
				requests: requests.length,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				active,
				closed,
			}),
			close: () => {
				closed = true;
			},
		}),
		loadDocument: (result, context) => {
			contexts.push(context);
			return loadBrowserDocument(result, {
				...context,
				initializeDocument(tree) {
					initialized.push(tree);
					context.initializeDocument?.(tree);
				},
			});
		},
	});
	sessions.push(session);
	const tab = session.createTab().id;
	return {
		session,
		tab,
		main,
		initialized,
		contexts,
		requests,
		active: () => active,
		urls: () => requests.map((request) => request.url),
		load: (signal?: AbortSignal) => session.navigate(tab, pageUrl, { signal }),
	};
}

function expectIdle(tree: DocumentTree) {
	expect(documentImages(tree).metrics()).toMatchObject({
		active: 0,
		queued: 0,
		waiters: 0,
		closed: false,
	});
	expect(documentInteractions(tree).events.metrics().activeDispatches).toBe(0);
}

it("retains a transient meta restriction from an admitted native redirect callback before the next hop", async () => {
	const events: string[] = [];
	const test = nativeFixture(async (request, tree) => {
		const owner = documentInteractions(tree).events;
		owner.addEventListener(imageId(tree), "load", () => events.push("load"));
		owner.addEventListener(imageId(tree), "error", () => events.push("error"));
		transientRestriction(tree);
		return redirect(request.url, finalUrl);
	});
	await test.load();
	const tree = test.session.page(test.tab).document;
	expect(test.urls()).toEqual([pageUrl, entryUrl]);
	expect(test.active()).toBe(0);
	expect(documentImages(tree).get(imageId(tree))).toMatchObject({
		state: "broken",
		error: "policy-denied",
		naturalWidth: 0,
	});
	expect(events).toEqual(["error"]);
	expectIdle(tree);
});

it("rechecks a callback-selected image after transient metadata without delivering a second load", async () => {
	const events: string[] = [];
	const test = nativeFixture(async (request, tree) => {
		const image = imageId(tree);
		const owner = documentInteractions(tree).events;
		owner.addEventListener(image, "load", () => {
			events.push("load");
			transientRestriction(tree);
			tree.setAttribute(image, "src", "/callback/replacement.png");
		});
		owner.addEventListener(image, "error", () => events.push("error"));
		return response(request.url);
	});
	await test.load();
	const tree = test.session.page(test.tab).document;
	expect(test.urls()).toEqual([pageUrl, entryUrl]);
	expect(events).toEqual(["load", "error"]);
	expect(documentImages(tree).get(imageId(tree))).toMatchObject({
		state: "broken",
		error: "policy-denied",
		currentSrc: "https://lifecycle.example/callback/replacement.png",
	});
	expectIdle(tree);
});

it("does not let in-flight header array and input replacement weaken configured native redirect policy", async () => {
	const policies = ["img-src https://lifecycle.example/admitted/"];
	const test = nativeFixture(
		async (request) => {
			policies[0] = "img-src *";
			test.main.headers = {
				"content-type": ["text/html"],
				"content-security-policy": ["img-src *"],
			};
			return redirect(request.url, deniedUrl);
		},
		{ policies },
	);
	await test.load();
	const tree = test.session.page(test.tab).document;
	expect(test.urls()).toEqual([pageUrl, entryUrl]);
	expect(documentImages(tree).get(imageId(tree))).toMatchObject({
		state: "broken",
		error: "policy-denied",
	});
	expectIdle(tree);
});

it("keeps host enforcement after an admitted native out-of-path redirect", async () => {
	const test = nativeFixture(
		async (request) =>
			redirect(request.url, request.url === entryUrl ? finalUrl : deniedUrl),
		{ policies: ["img-src https://lifecycle.example/admitted/"] },
	);
	await test.load();
	const tree = test.session.page(test.tab).document;
	expect(test.urls()).toEqual([pageUrl, entryUrl, finalUrl]);
	expect(test.requests.slice(1).map((request) => request.redirect)).toEqual([
		"manual",
		"manual",
	]);
	expect(documentImages(tree).get(imageId(tree))).toMatchObject({
		state: "broken",
		error: "policy-denied",
	});
	expectIdle(tree);
});

it.each([
	{
		label: "unreported path change",
		final: finalUrl,
		redirected: false,
		admitted: false,
	},
	{
		label: "reported path redirect",
		final: finalUrl,
		redirected: true,
		admitted: true,
	},
	{
		label: "reported host redirect",
		final: deniedUrl,
		redirected: true,
		admitted: false,
	},
])(
	"checks custom ImageFetch $label after the caller has returned a response",
	async ({ final, redirected, admitted }) => {
		const calls: string[] = [];
		const main = response(pageUrl, '<img src="/admitted/entry.png">');
		main.headers = {
			...main.headers,
			"content-security-policy": [
				"img-src https://lifecycle.example/admitted/",
			],
		};
		const tree = await loadBrowserDocument(main, {
			tabId: "custom-lifecycle",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50_000,
				maxDepth: 256,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
			initializeDocument: (document) => {
				documents.push(document);
			},
			fetchImage: async (url) => {
				calls.push(url);
				return {
					...response(final),
					redirects: redirected
						? [{ url: entryUrl, status: 307, location: final }]
						: [],
				};
			},
		});
		expect(calls).toEqual([entryUrl]);
		const images = documentImages(tree);
		expect(images.get(imageId(tree))).toMatchObject(
			admitted
				? {
						state: "complete",
						naturalWidth: 2,
						naturalHeight: 4,
						originClean: true,
					}
				: {
						state: "broken",
						error: "policy-denied",
						naturalWidth: 0,
						originClean: false,
					},
		);
		expect(images.metrics().receivedBytes).toBeGreaterThan(0);
		expectIdle(tree);
	},
);

it("retains configured loader header values after a custom fetch mutates its input and returns a denied final URL", async () => {
	const policies = ["img-src https://lifecycle.example/admitted/"];
	const calls: string[] = [];
	const main = response(pageUrl, '<img src="/admitted/entry.png">');
	main.headers = { ...main.headers, "content-security-policy": policies };
	const tree = await loadBrowserDocument(main, {
		tabId: "custom-mutating-input",
		signal: new AbortController().signal,
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
		},
		initializeDocument: (document) => {
			documents.push(document);
		},
		fetchImage: async (url) => {
			calls.push(url);
			policies.splice(0, policies.length, "img-src *");
			main.headers = { "content-type": ["text/html"] };
			return response(deniedUrl);
		},
	});
	expect(calls).toEqual([entryUrl]);
	expect(documentImages(tree).get(imageId(tree))).toMatchObject({
		state: "broken",
		error: "policy-denied",
		naturalWidth: 0,
	});
	expectIdle(tree);
});

it.each(["abort-navigation", "close-tab"] as const)(
	"releases policy, image and callback work on %s during a native redirect",
	async (action) => {
		const started = deferred<NetworkRequest>();
		const late = deferred<NetworkResponse>();
		const events: string[] = [];
		const test = nativeFixture(async (request, tree) => {
			if (request.url === entryUrl) return redirect(request.url, finalUrl);
			const owner = documentInteractions(tree).events;
			owner.addEventListener(imageId(tree), "load", () => events.push("load"));
			owner.addEventListener(imageId(tree), "error", () =>
				events.push("error"),
			);
			started.resolve(request);
			return late.promise;
		});
		const controller = new AbortController();
		const navigation = test.load(controller.signal).then(
			() => ({ code: "unexpected-success" }),
			(error: unknown) => error,
		);
		const pending = await started.promise;
		const tree = test.initialized[0];
		const images = documentImages(tree);
		const policy = documentImageContentSecurityPolicy(tree);
		const owner = documentInteractions(tree).events;
		const decoding = expect(images.decode(imageId(tree))).rejects.toMatchObject(
			{ code: "closed" },
		);
		if (action === "abort-navigation") controller.abort();
		else test.session.closeTab(test.tab);
		expect(await navigation).toMatchObject({
			code: action === "abort-navigation" ? "aborted" : "closed",
		});
		await decoding;
		expect(pending.signal?.aborted).toBe(true);
		expect(() => policy.check(entryUrl)).toThrow("closed");
		expect(images.metrics()).toMatchObject({
			closed: true,
			active: 0,
			queued: 0,
			resources: 0,
			waiters: 0,
			decodedBytes: 0,
		});
		late.resolve(redirect(finalUrl, "https://lifecycle.example/late.png"));
		await late.promise;
		await Promise.resolve();
		expect(test.urls()).toEqual([pageUrl, entryUrl, finalUrl]);
		expect(test.active()).toBe(0);
		expect(events).toEqual([]);
		expect(owner.metrics()).toMatchObject({
			closed: true,
			listeners: 0,
			activeDispatches: 0,
		});
		expect(tree.nodeCount).toBe(0);
	},
);

it("aborts a replaced native redirect and settles its denied replacement before a late transport response", async () => {
	const started = deferred<NetworkRequest>();
	const late = deferred<NetworkResponse>();
	const events: string[] = [];
	const test = nativeFixture(
		async (request) => {
			started.resolve(request);
			return late.promise;
		},
		{ html: "<img>" },
	);
	await test.load();
	const tree = test.session.page(test.tab).document;
	const image = imageId(tree);
	const images = documentImages(tree);
	const owner = documentInteractions(tree).events;
	owner.addEventListener(image, "load", () => events.push("load"));
	owner.addEventListener(image, "error", () => events.push("error"));
	tree.setAttribute(image, "src", "/admitted/entry.png");
	expect(images.get(image).state).toBe("loading");
	const pending = await started.promise;
	const decoding = expect(images.decode(image)).rejects.toMatchObject({
		name: "EncodingError",
	});
	transientRestriction(tree);
	tree.setAttribute(image, "src", "/admitted/replacement.png");
	expect(images.get(image)).toMatchObject({
		state: "broken",
		error: "policy-denied",
	});
	await decoding;
	await images.settle();
	expect(pending.signal?.aborted).toBe(true);
	expectIdle(tree);
	expect(test.urls()).toEqual([pageUrl, entryUrl]);
	expect(test.active()).toBe(1);
	late.resolve(redirect(entryUrl, finalUrl));
	await late.promise;
	await images.settle();
	expect(test.active()).toBe(0);
	expect(test.urls()).toEqual([pageUrl, entryUrl]);
	expect(events).toEqual(["error"]);
	expect(images.metrics()).toMatchObject({ resources: 0, decodedBytes: 0 });
});

it("does not extend the image-only matcher to generic fetch or stylesheets", async () => {
	const test = nativeFixture(async (request) => response(request.url), {
		policies: ["img-src 'self'; connect-src *; style-src 'none'"],
		html: '<link rel="stylesheet" crossorigin="anonymous" href="/blocked.css"><img src="/admitted/entry.png">',
	});
	await test.load();
	const tree = test.session.page(test.tab).document;
	const fetch = test.contexts[0].fetch;
	if (!fetch) throw new Error("Missing native page fetch");
	await expect(
		fetch({ url: "https://lifecycle.example/data" }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.urls()).toEqual([pageUrl, entryUrl]);
	expect(documentImages(tree).get(imageId(tree)).state).toBe("complete");
	expect(documentStyles(tree).metrics()).toMatchObject({
		externalSheets: 0,
		issues: { "stylesheet-csp-not-implemented": 1 },
	});
	expectIdle(tree);
});
