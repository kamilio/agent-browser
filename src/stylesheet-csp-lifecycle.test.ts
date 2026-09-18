import { afterEach, expect, it } from "vitest";
import { documentImageContentSecurityPolicy } from "./document-image-content-security-policy.js";
import { documentImages } from "./document-images.js";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";
import { fetchStylesheetResource } from "./stylesheet-fetch.js";

const sessions: BrowserSession[] = [];
const documents: DocumentTree[] = [];
const pageUrl = "https://style-lifecycle.example/document";
const parentUrl = "https://style-lifecycle.example/permitted/parent.css";
const childUrl = "https://style-lifecycle.example/permitted/child.css";
const outsideUrl = "https://style-lifecycle.example/elsewhere/final.css";
const deniedUrl = "https://denied-style.example/blocked.css";
const scopedPolicy =
	"style-src-elem https://style-lifecycle.example/permitted/; style-src *";
const parentCss = "#probe { display: none }";
const childCss = "#probe { visibility: hidden }";

it.each([
	{ header: "enforcing", policies: ["style-src 'self'"], admitted: false },
	{ header: "absent", policies: null, admitted: true },
])(
	"enforces inline-parent CSP separately from no-header imports ($header header)",
	async ({ policies, admitted }) => {
		const test = nativeFixture(
			async (request) => response(request.url, childCss),
			{
				policies,
				html: "<style>@import '/child.css';</style><main id=probe>Inline-parent import</main>",
			},
		);
		await test.load();
		const tree = test.session.page(test.tab).document;
		expect(test.urls()).toEqual(
			admitted
				? [pageUrl, "https://style-lifecycle.example/child.css"]
				: [pageUrl],
		);
		expect(documentStyles(tree).metrics()).toMatchObject({
			externalSheets: 0,
			importedSheets: admitted ? 1 : 0,
		});
		expect(probeStyle(tree)).toMatchObject({
			display: "block",
			visibility: admitted ? "hidden" : "visible",
		});
		if (!admitted)
			expect(
				documentStyles(tree).metrics().issues["inline-style-policy-denied"],
			).toBe(1);
		expectSettled(tree);
	},
);

it("captures enforcing header values before a custom initialization callback can replace them or enable inline imports", async () => {
	const policies = ["style-src 'self'"];
	const main = response(
		pageUrl,
		`<style>@import '/child.css';</style><link rel="stylesheet" href="${deniedUrl}"><main id="probe">Captured policy</main>`,
		"text/html",
	);
	main.headers = { ...main.headers, "content-security-policy": policies };
	const calls: string[] = [];
	const fetch = async (url: string) => {
		calls.push(url);
		return response(url, childCss);
	};
	const tree = await loadBrowserDocument(main, {
		tabId: "mutating-stylesheet-initialization",
		signal: new AbortController().signal,
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
		},
		initializeDocument(document) {
			documents.push(document);
			policies[0] = "style-src *";
			main.headers = { "content-type": ["text/html"] };
		},
		fetchStylesheet: fetch,
		fetchStylesheetWithPolicy: async (url) => ({
			type: "basic",
			response: await fetch(url),
		}),
	});
	expect(calls).toEqual([]);
	expect(
		documentImageContentSecurityPolicy(tree).matches(["style-src 'self'"]),
	).toBe(true);
	expect(documentStyles(tree).metrics()).toMatchObject({
		externalSheets: 0,
		importedSheets: 0,
		issues: { "css-import-policy-denied": 1, "stylesheet-policy-denied": 1 },
	});
	expect(probeStyle(tree)).toMatchObject({
		display: "block",
		visibility: "visible",
	});
	expectSettled(tree);
});

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

function response(
	url: string,
	text = parentCss,
	type = "text/css",
): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url,
		status: 200,
		headers: { "content-type": [type] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function redirect(url: string, location: string): NetworkResponse {
	return { ...response(url), status: 307, headers: { location: [location] } };
}

function markup(attributes = "") {
	return `<link rel="stylesheet" href="/permitted/parent.css" ${attributes}><main id="probe">Native style lifecycle</main>`;
}

function transientRestriction(tree: DocumentTree) {
	const meta = tree.createElement("meta", {
		"http-equiv": "Content-Security-Policy",
		content: "style-src 'none'",
	});
	tree.append(tree.root, meta);
	tree.remove(meta);
}

function probeStyle(tree: DocumentTree) {
	const probe = [...tree.walk()].find(
		({ node }) => node.attributes.id === "probe",
	);
	if (!probe) throw new Error("Missing stylesheet lifecycle probe");
	return documentStyles(tree).get(probe.node.id);
}

function expectSettled(tree: DocumentTree) {
	expect(documentImages(tree).metrics()).toMatchObject({
		active: 0,
		queued: 0,
		waiters: 0,
		closed: false,
	});
	expect(documentInteractions(tree).events.metrics().activeDispatches).toBe(0);
}

async function customDocument(
	html: string,
	policies: string[],
	fetch: (url: string, tree: DocumentTree) => Promise<NetworkResponse>,
) {
	const main = response(pageUrl, html, "text/html");
	main.headers = { ...main.headers, "content-security-policy": policies };
	let document!: DocumentTree;
	return loadBrowserDocument(main, {
		tabId: "custom-stylesheet-lifecycle",
		signal: new AbortController().signal,
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
		},
		initializeDocument(tree) {
			document = tree;
			documents.push(tree);
		},
		fetchStylesheet: (url) => fetch(url, document),
		fetchStylesheetWithPolicy: async (url) => ({
			type: "basic",
			response: await fetch(url, document),
		}),
	});
}

function nativeFixture(
	fetch: (
		request: NetworkRequest,
		tree: DocumentTree,
	) => Promise<NetworkResponse>,
	options: { html?: string; policies?: string[] | null } = {},
) {
	const requests: NetworkRequest[] = [];
	const initialized: DocumentTree[] = [];
	const main = response(pageUrl, options.html ?? markup(), "text/html");
	if (options.policies !== null)
		main.headers = {
			...main.headers,
			"content-security-policy": options.policies ?? [scopedPolicy],
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
					if (!tree)
						throw new Error(
							"Stylesheet requested before document initialization",
						);
					return await fetch(request, tree);
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
		loadDocument: (result, context) =>
			loadBrowserDocument(result, {
				...context,
				initializeDocument(tree) {
					initialized.push(tree);
					context.initializeDocument?.(tree);
				},
			}),
	});
	sessions.push(session);
	const tab = session.createTab().id;
	return {
		session,
		tab,
		initialized,
		requests,
		active: () => active,
		urls: () => requests.map((request) => request.url),
		load: (signal?: AbortSignal) => session.navigate(tab, pageUrl, { signal }),
	};
}

it.each(["ordinary", "cors"] as const)(
	"checks custom %s loader URLs before invoking the callback and still installs an admitted sibling",
	async (mode) => {
		const calls: string[] = [];
		const attributes = mode === "cors" ? "crossorigin=anonymous" : "";
		const html = `<link rel="stylesheet" href="/restricted/blocked.css" ${attributes}>${markup(attributes)}`;
		const tree = await customDocument(html, [scopedPolicy], async (url) => {
			calls.push(url);
			return response(url);
		});
		expect(calls).toEqual([parentUrl]);
		expect(documentStyles(tree).metrics()).toMatchObject({
			externalSheets: 1,
			importedSheets: 0,
			issues: { "stylesheet-policy-denied": 1 },
		});
		expect(probeStyle(tree).display).toBe("none");
		expectSettled(tree);
	},
);

it.each([
	{
		label: "unreported path change",
		final: outsideUrl,
		redirected: false,
		admitted: false,
	},
	{
		label: "reported path redirect",
		final: outsideUrl,
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
	"checks custom loader $label after receiving the caller-owned response",
	async ({ final, redirected, admitted }) => {
		const calls: string[] = [];
		const tree = await customDocument(markup(), [scopedPolicy], async (url) => {
			calls.push(url);
			return {
				...response(final),
				redirects: redirected
					? [{ url: parentUrl, status: 307, location: final }]
					: [],
			};
		});
		expect(calls).toEqual([parentUrl]);
		expect(documentStyles(tree).metrics().externalSheets).toBe(
			admitted ? 1 : 0,
		);
		expect(probeStyle(tree).display).toBe(admitted ? "none" : "block");
		if (!admitted)
			expect(
				documentStyles(tree).metrics().issues["stylesheet-policy-denied"],
			).toBe(1);
		expectSettled(tree);
	},
);

it("rechecks a custom policy-fetch response after transient connected metadata before installing CSS", async () => {
	const calls: string[] = [];
	const tree = await customDocument(
		markup("crossorigin=anonymous"),
		[scopedPolicy],
		async (url, document) => {
			calls.push(url);
			transientRestriction(document);
			return response(url);
		},
	);
	expect(calls).toEqual([parentUrl]);
	expect(documentStyles(tree).metrics()).toMatchObject({
		externalSheets: 0,
		issues: { "stylesheet-policy-denied": 1 },
	});
	expect(probeStyle(tree)).toMatchObject({
		display: "block",
		visibility: "visible",
	});
	expectSettled(tree);
});

it("denies an imported child before custom policy fetch while retaining its admitted parent", async () => {
	const calls: string[] = [];
	const tree = await customDocument(markup(), [scopedPolicy], async (url) => {
		calls.push(url);
		return response(url, `@import "/restricted/child.css"; ${parentCss}`);
	});
	expect(calls).toEqual([parentUrl]);
	expect(documentStyles(tree).metrics()).toMatchObject({
		externalSheets: 1,
		importedSheets: 0,
		issues: { "css-import-policy-denied": 1 },
	});
	expect(probeStyle(tree)).toMatchObject({
		display: "none",
		visibility: "visible",
	});
	expectSettled(tree);
});

it("rejects an imported custom response final host without installing its CSS or following its nested import", async () => {
	const calls: string[] = [];
	const tree = await customDocument(markup(), [scopedPolicy], async (url) => {
		calls.push(url);
		return url === parentUrl
			? response(url, `@import "child.css"; ${parentCss}`)
			: {
					...response(deniedUrl, `@import "nested.css"; ${childCss}`),
					redirects: [{ url: childUrl, status: 307, location: deniedUrl }],
				};
	});
	expect(calls).toEqual([parentUrl, childUrl]);
	expect(documentStyles(tree).metrics()).toMatchObject({
		externalSheets: 1,
		importedSheets: 0,
		issues: { "css-import-policy-denied": 1 },
	});
	expect(probeStyle(tree)).toMatchObject({
		display: "none",
		visibility: "visible",
	});
	expectSettled(tree);
});

it("keeps admitted parent and child rules while blocking a grandchild before native transport", async () => {
	const test = nativeFixture(async (request) =>
		request.url === parentUrl
			? response(request.url, `@import "child.css"; ${parentCss}`)
			: response(
					request.url,
					`@import "/restricted/grandchild.css"; ${childCss}`,
				),
	);
	await test.load();
	const tree = test.session.page(test.tab).document;
	expect(test.urls()).toEqual([pageUrl, parentUrl, childUrl]);
	expect(documentStyles(tree).metrics()).toMatchObject({
		externalSheets: 1,
		importedSheets: 1,
		issues: { "css-import-policy-denied": 1 },
	});
	expect(probeStyle(tree)).toMatchObject({
		display: "none",
		visibility: "hidden",
	});
	expectSettled(tree);
});

it("checks each imported native redirect before transport even after skipping an admitted path", async () => {
	const test = nativeFixture(async (request) => {
		if (request.url === parentUrl)
			return response(request.url, `@import "child.css"; ${parentCss}`);
		return redirect(
			request.url,
			request.url === childUrl ? outsideUrl : deniedUrl,
		);
	});
	await test.load();
	const tree = test.session.page(test.tab).document;
	expect(test.urls()).toEqual([pageUrl, parentUrl, childUrl, outsideUrl]);
	expect(test.requests.slice(1).map((request) => request.redirect)).toEqual([
		"manual",
		"manual",
		"manual",
	]);
	expect(documentStyles(tree).metrics()).toMatchObject({
		externalSheets: 1,
		importedSheets: 0,
		issues: { "css-import-policy-denied": 1 },
	});
	expect(probeStyle(tree)).toMatchObject({
		display: "none",
		visibility: "visible",
	});
	expectSettled(tree);
});

it.each([
	{ mode: "ordinary", stage: "redirect", attributes: "" },
	{ mode: "cors", stage: "redirect", attributes: "crossorigin=anonymous" },
	{ mode: "ordinary", stage: "final-response", attributes: "" },
	{
		mode: "cors",
		stage: "final-response",
		attributes: "crossorigin=anonymous",
	},
])(
	"retains transient metadata during a native $mode $stage callback",
	async ({ stage, attributes }) => {
		const test = nativeFixture(
			async (request, tree) => {
				transientRestriction(tree);
				return stage === "redirect"
					? redirect(request.url, outsideUrl)
					: response(request.url);
			},
			{ html: markup(attributes) },
		);
		await test.load();
		const tree = test.session.page(test.tab).document;
		expect(test.urls()).toEqual([pageUrl, parentUrl]);
		expect(test.active()).toBe(0);
		expect(documentStyles(tree).metrics()).toMatchObject({
			externalSheets: 0,
			importedSheets: 0,
			issues: { "stylesheet-policy-denied": 1 },
		});
		expect(probeStyle(tree)).toMatchObject({
			display: "block",
			visibility: "visible",
		});
		expectSettled(tree);
	},
);

it("uses the original document origin for self despite a cross-origin base and admits an absolute original-origin sibling", async () => {
	const test = nativeFixture(async (request) => response(request.url), {
		policies: ["style-src-elem 'self'; style-src https://base-style.example/"],
		html: `<base href="https://base-style.example/assets/"><link rel="stylesheet" href="relative.css"><link rel="stylesheet" href="${parentUrl}"><main id="probe">Base-origin probe</main>`,
	});
	await test.load();
	const tree = test.session.page(test.tab).document;
	expect(tree.url).toBe(pageUrl);
	expect(test.urls()).toEqual([pageUrl, parentUrl]);
	expect(documentStyles(tree).metrics()).toMatchObject({
		externalSheets: 1,
		issues: { "stylesheet-policy-denied": 1 },
	});
	expect(probeStyle(tree).display).toBe("none");
	expectSettled(tree);
});

it.each(["abort-navigation", "close-tab"] as const)(
	"settles native stylesheet ownership on %s while a redirect callback is pending",
	async (action) => {
		const started = deferred<NetworkRequest>();
		const late = deferred<NetworkResponse>();
		const test = nativeFixture(
			async (request) => {
				if (request.url === parentUrl) return redirect(request.url, outsideUrl);
				started.resolve(request);
				return late.promise;
			},
			{
				html: `${markup()}<link rel="stylesheet" href="/permitted/later.css">`,
			},
		);
		const controller = new AbortController();
		const navigation = test.load(controller.signal).then(
			() => ({ code: "unexpected-success" }),
			(error: unknown) => error,
		);
		const pending = await started.promise;
		const tree = test.initialized[0];
		const styles = documentStyles(tree);
		const policy = documentImageContentSecurityPolicy(tree);
		const images = documentImages(tree);
		const events = documentInteractions(tree).events;
		try {
			if (action === "abort-navigation") controller.abort();
			else test.session.closeTab(test.tab);
			expect(await navigation).toMatchObject({
				code: action === "abort-navigation" ? "aborted" : "closed",
			});
			expect(pending.signal?.aborted).toBe(true);
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(test.session.metrics().pendingLoads).toBe(0);
			expect(() => policy.checkStylesheet(parentUrl)).toThrow("closed");
			expect(() => styles.metrics()).toThrow("closed");
			expect(images.metrics()).toMatchObject({
				active: 0,
				queued: 0,
				resources: 0,
				waiters: 0,
				closed: true,
			});
			expect(events.metrics()).toMatchObject({
				activeDispatches: 0,
				listeners: 0,
				closed: true,
			});
			expect(tree.nodeCount).toBe(0);
		} finally {
			late.resolve(redirect(outsideUrl, childUrl));
		}
		await late.promise;
		await Promise.resolve();
		expect(test.active()).toBe(0);
		expect(test.urls()).toEqual([pageUrl, parentUrl, outsideUrl]);
	},
);

it("retains the document stylesheet checker when its public fetch context is mutated during an awaited request", async () => {
	const tree = parseHtmlDocument("<main></main>", pageUrl);
	documents.push(tree);
	const owner = documentImageContentSecurityPolicy(tree, [scopedPolicy]);
	const started = deferred<void>();
	const reply = deferred<NetworkResponse>();
	const requests: string[] = [];
	const checks: { url: string; redirectCount: number }[] = [];
	let replacements = 0;
	const context = {
		documentUrl: pageUrl,
		signal: new AbortController().signal,
		maxRedirects: 3,
		request: async (request: NetworkRequest) => {
			requests.push(request.url);
			started.resolve();
			return reply.promise;
		},
		checkContentSecurityPolicy: (url: string, redirectCount: number) => {
			checks.push({ url, redirectCount });
			owner.checkStylesheet(url, redirectCount);
		},
	};
	const operation = fetchStylesheetResource(
		parentUrl,
		{ mode: "no-cors", credentials: "include" },
		context,
	);
	const rejected = expect(operation).rejects.toMatchObject({
		code: "policy-denied",
	});
	await started.promise;
	context.checkContentSecurityPolicy = () => {
		replacements++;
	};
	reply.resolve(redirect(parentUrl, deniedUrl));
	await rejected;
	expect(requests).toEqual([parentUrl]);
	expect(replacements).toBe(0);
	expect(checks).toEqual([
		{ url: parentUrl, redirectCount: 0 },
		{ url: parentUrl, redirectCount: 0 },
		{ url: deniedUrl, redirectCount: 1 },
	]);
});

it.each([
	{
		phase: "before the first request",
		abortAt: 1,
		redirects: false,
		expectedRequests: [],
	},
	{
		phase: "after the final response",
		abortAt: 2,
		redirects: false,
		expectedRequests: [parentUrl],
	},
	{
		phase: "before the next redirect request",
		abortAt: 3,
		redirects: true,
		expectedRequests: [parentUrl],
	},
])(
	"honors checker-triggered abort $phase without more I/O or a successful result",
	async ({ abortAt, redirects, expectedRequests }) => {
		const tree = parseHtmlDocument("<main></main>", pageUrl);
		documents.push(tree);
		const owner = documentImageContentSecurityPolicy(tree, [scopedPolicy]);
		const controller = new AbortController();
		const reason = new Error("Stylesheet checker requested cancellation");
		const requests: string[] = [];
		let checks = 0;
		await expect(
			fetchStylesheetResource(
				parentUrl,
				{ mode: "no-cors", credentials: "include" },
				{
					documentUrl: pageUrl,
					signal: controller.signal,
					maxRedirects: 3,
					checkContentSecurityPolicy: (url, redirectCount) => {
						owner.checkStylesheet(url, redirectCount);
						if (++checks === abortAt) controller.abort(reason);
					},
					request: async (request) => {
						requests.push(request.url);
						return redirects
							? redirect(request.url, childUrl)
							: response(request.url);
					},
				},
			),
		).rejects.toBe(reason);
		expect(checks).toBe(abortAt);
		expect(controller.signal.aborted).toBe(true);
		expect(requests).toEqual(expectedRequests);
	},
);
