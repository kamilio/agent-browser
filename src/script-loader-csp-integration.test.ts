import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import {
	bindDocumentScriptCsp,
	documentScriptCsp,
	initializeDocumentScriptCsp,
} from "./document-script-csp.js";
import { documentScriptState } from "./document-script-state.js";
import { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import type { PageRuntime, PageRuntimeOptions } from "./page-runtime.js";
import { PageScripts } from "./page-scripts.js";
import {
	initializeScriptElement,
	markScriptElementStarted,
} from "./script-element-state.js";
import { ScriptLoader } from "./script-loader.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";

const pageUrl = "https://example.com/page";
const cleanup: (() => unknown)[] = [];
afterEach(async () => {
	for (const close of cleanup.splice(0).reverse()) await close();
});

function required<Value>(value: Value | undefined): Value {
	if (value === undefined) throw new Error("Missing fixture value");
	return value;
}

function response(
	url: string,
	text: string,
	headers: NetworkResponse["headers"] = {},
): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url,
		status: 200,
		headers: {
			"content-type": [url === pageUrl ? "text/html" : "text/javascript"],
			...headers,
		},
		body,
		encodedBytes: body.length,
		elapsedMs: 0,
		redirects: [],
	};
}

function fixture(
	html: string,
	policy?: string,
	resource?: (input: NetworkRequest) => Promise<NetworkResponse>,
) {
	const requests: NetworkRequest[] = [];
	const evaluated: string[] = [];
	const creation: (string | undefined)[] = [];
	let loader!: ScriptLoader;
	let context!: DocumentLoaderContext;
	let runtimeClosed = false;
	const close = vi.fn(() => {
		runtimeClosed = true;
	});
	const transport: NetworkTransport = {
		async request(input) {
			requests.push(input);
			return input.url === pageUrl
				? response(
						pageUrl,
						html,
						policy === undefined ? {} : { "content-security-policy": [policy] },
					)
				: resource
					? resource(input)
					: response(input.url, new URL(input.url).pathname);
		},
		metrics: () => ({
			requests: requests.length,
			active: 0,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			closed: false,
		}),
		close() {},
	};
	const session = new BrowserSession({
		createTransport: () => transport,
		loadDocument(input, supplied) {
			context = supplied;
			loader = new ScriptLoader({
				response: input,
				topLevelDocument: supplied.topLevelDocument,
				signal: supplied.signal,
				fetch: supplied.fetchScript,
				fetchWithPolicy: supplied.fetchScriptWithPolicy,
				owner(tree) {
					creation.push(documentScriptCsp(tree)?.stringCompilation);
					return {
						get closed() {
							return runtimeClosed;
						},
						close,
						async evaluate(source) {
							evaluated.push(source);
							return {
								engine: "poe-safe-js",
								partial: true,
								ok: true,
								metrics: {
									steps: 0,
									peakCallDepth: 0,
									peakDataSize: 0,
									consoleCalls: 0,
								},
							};
						},
					};
				},
			});
			return loadBrowserDocument(input, { ...supplied, scripts: loader });
		},
	});
	cleanup.push(() => session.close());
	const tab = session.createTab().id;
	return {
		requests,
		evaluated,
		creation,
		close,
		session,
		tab,
		load: () => session.navigate(tab, pageUrl),
		tree: () => session.page(tab).document,
		loader: () => loader,
		context: () => context,
	};
}

it("binds nonce policy before owner creation and admits only the authorized sources", async () => {
	const test = fixture(
		'<script nonce="native">yes</script><script>no</script><script src="/yes.js" nonce="native"></script><script src="/no.js"></script>',
		"script-src 'nonce-native'",
	);
	await test.load();
	expect(test.creation).toEqual(["deny"]);
	expect(test.evaluated).toEqual(["yes", "/yes.js"]);
	expect(test.requests.map((input) => input.url)).toEqual([
		pageUrl,
		"https://example.com/yes.js",
	]);
	const script = required(
		[...test.tree().walk()].find(({ node }) => node.tagName === "script"),
	).node;
	expect(script.attributes.nonce).toBe("");
});

it.each([
	"script-src 'none'",
	"script-src 'nonce-native'; img-src *",
	"script-src 'sha256-YWJj'",
])("never fetches or executes rejected scripts for %s", async (policy) => {
	const test = fixture(
		'<script nonce="native">inline</script><script nonce="native" src="/blocked.js"></script>',
		policy,
	);
	await test.load();
	expect(test.requests).toHaveLength(1);
	expect(test.evaluated).toEqual([]);
	if (policy !== "script-src 'none'") expect(test.creation).toEqual([]);
});

it("applies actual redirect counts, ignores redirected paths only, and blocks the next host before fetching", async () => {
	const test = fixture(
		'<script src="/allowed/start.js"></script>',
		"script-src https://example.com/allowed/",
		async (input) => ({
			...response(input.url, ""),
			status: 302,
			headers: {
				location: [
					input.url.endsWith("start.js")
						? "/elsewhere.js"
						: "https://other.example/blocked.js",
				],
			},
		}),
	);
	await test.load();
	expect(test.requests.map((input) => input.url)).toEqual([
		pageUrl,
		"https://example.com/allowed/start.js",
		"https://example.com/elsewhere.js",
	]);
	expect(
		test.requests.slice(1).every((input) => input.redirect === "manual"),
	).toBe(true);
	expect(test.evaluated).toEqual([]);
});

it("accepts an allowed redirected response without fabricating zero redirects", async () => {
	const test = fixture(
		'<script src="/allowed/start.js"></script>',
		"script-src https://example.com/allowed/",
		async (input) =>
			input.url.endsWith("start.js")
				? {
						...response(input.url, ""),
						status: 302,
						headers: { location: ["/elsewhere.js"] },
					}
				: response(input.url, "redirected"),
	);
	await test.load();
	expect(test.evaluated).toEqual(["redirected"]);
});

it("keeps active-policy raw and unproven policy fetch ports closed", async () => {
	const test = fixture("<body>", "script-src *");
	await test.load();
	await expect(
		required(test.context().fetchScript)("https://example.com/a.js"),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		required(test.context().fetchScriptWithPolicy)(
			"https://example.com/a.js",
			{ mode: "no-cors", credentials: "include" },
			new AbortController().signal,
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	const getter = vi.fn(() => () => true);
	await expect(
		required(test.context().fetchScriptWithPolicy)(
			"https://example.com/a.js",
			{ mode: "no-cors", credentials: "include" },
			new AbortController().signal,
			Object.defineProperty({}, "allows", { get: getter }) as {
				allows: () => boolean;
			},
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(getter).not.toHaveBeenCalled();
	expect(test.requests).toHaveLength(1);
});

it("preserves parser provenance and gives strict-dynamic only its external dynamic branch", async () => {
	const test = fixture(
		'<script nonce="native">parser</script><script src="/parser-blocked.js"></script>',
		"script-src 'nonce-native' 'strict-dynamic' 'unsafe-inline'",
	);
	await test.load();
	const tree = test.tree();
	for (const [origin, attributes, text] of [
		["dynamic", { src: "/dynamic.js" }, ""],
		["dynamic", {}, "dynamic inline blocked"],
		["parser", { nonce: "native", src: "/forged-parser.js" }, ""],
		["inert", { nonce: "native", src: "/inert.js" }, ""],
	] as const) {
		const id = tree.createElement("script", attributes);
		initializeScriptElement(tree, id, origin);
		if (text) tree.append(id, tree.createText(text));
		tree.append(tree.root, id);
	}
	await test.loader().settle();
	expect(test.evaluated).toEqual(["parser", "/dynamic.js"]);
	expect(test.requests.map((input) => input.url)).toEqual([
		pageUrl,
		"https://example.com/dynamic.js",
	]);
});

it("keeps nonce/base snapshots and refuses a new header policy on an already-bound tree", () => {
	const tree = new DocumentTree(pageUrl);
	cleanup.push(() => tree.close());
	bindDocumentScriptCsp(tree, {
		"content-security-policy": ["script-src 'unsafe-inline'"],
	});
	const loader = new ScriptLoader({
		response: response(pageUrl, "", {
			"content-security-policy": ["script-src 'none'"],
		}),
		signal: new AbortController().signal,
		owner: vi.fn(),
	});
	expect(() => loader.start(tree)).toThrow();
});

it("uses owner-issued, per-document admissions without rereading a changed nonce after start", () => {
	const tree = new DocumentTree(pageUrl);
	const other = new DocumentTree(pageUrl);
	cleanup.push(
		() => tree.close(),
		() => other.close(),
	);
	const owner = bindDocumentScriptCsp(tree, {
		"content-security-policy": ["script-src 'nonce-native'"],
	});
	const otherOwner = bindDocumentScriptCsp(other, {
		"content-security-policy": ["script-src *"],
	});
	const id = tree.createElement("script", {
		src: "/script.js",
		nonce: "native",
	});
	initializeScriptElement(tree, id, "dynamic");
	tree.append(tree.root, id);
	const admission = required(owner.prepareScript(id));
	markScriptElementStarted(tree, id);
	tree.setAttribute(id, "nonce", "changed");
	expect(owner.allowsScript(id)).toBe(false);
	expect(
		owner.allowsRequest(admission, "https://example.com/script.js", 0),
	).toBe(true);
	expect(
		otherOwner.allowsRequest(admission, "https://example.com/script.js", 0),
	).toBe(false);
	expect(
		owner.allowsRequest(
			{ allows: () => true },
			"https://example.com/script.js",
			0,
		),
	).toBe(false);
	owner.close();
	expect(admission.allows("https://example.com/script.js", 0)).toBe(false);
});

it("fails closed on meta policy and closes the runtime, including after no-policy startup", async () => {
	for (const policy of [undefined, "script-src 'unsafe-inline'"]) {
		const test = fixture(
			'<script>before</script><meta http-equiv="content-security-policy" content="script-src *"><script>after</script>',
			policy,
		);
		await test.load();
		expect(test.evaluated).toEqual(["before"]);
		expect(test.close).toHaveBeenCalledTimes(1);
		expect(documentScriptCsp(test.tree())?.unsupported).toBe(true);
	}
});

it("forwards an immutable per-page requirement before factory allocation and closes on later policy failure", async () => {
	for (const keyword of ["'unsafe-inline'", "'unsafe-eval'"]) {
		const tree = new DocumentTree(pageUrl);
		cleanup.push(() => tree.close());
		bindDocumentScriptCsp(tree, {
			"content-security-policy": [`script-src ${keyword}`],
		});
		const close = vi.fn(async () => {});
		const create = vi.fn((options: PageRuntimeOptions) => {
			expect(options.stringCompilation).toBe(
				keyword === "'unsafe-eval'" ? "allow" : "deny",
			);
			return { closed: false, close } as unknown as PageRuntime;
		});
		const page = new PageScripts(
			{ document: tree, interactions: documentInteractions(tree) },
			{ createPageRuntime: create },
		);
		cleanup.push(() => page.close());
		expect(create).toHaveBeenCalledOnce();
		tree.append(
			tree.root,
			tree.createElement("meta", { "http-equiv": "content-security-policy" }),
		);
		expect(page.closed).toBe(true);
		await page.close();
		expect(close).toHaveBeenCalledOnce();
	}
});

it("does not allocate a page runtime for an unsupported or closed document policy", () => {
	for (const closed of [false, true]) {
		const tree = new DocumentTree(pageUrl);
		cleanup.push(() => tree.close());
		const policy = bindDocumentScriptCsp(tree, {
			"content-security-policy": [closed ? "script-src *" : "img-src *"],
		});
		if (closed) policy.close();
		const create = vi.fn();
		expect(
			() =>
				new PageScripts(
					{ document: tree, interactions: documentInteractions(tree) },
					{ createPageRuntime: create },
				),
		).toThrow();
		expect(create).not.toHaveBeenCalled();
	}
});

it("closes loader and page runtimes immediately on explicit policy invalidation", async () => {
	const test = fixture("<script>before</script>", "script-src 'unsafe-inline'");
	await test.load();
	required(documentScriptCsp(test.tree())).close();
	expect(test.close).toHaveBeenCalledOnce();
	const tree = new DocumentTree(pageUrl);
	cleanup.push(() => tree.close());
	const policy = bindDocumentScriptCsp(tree, {});
	const close = vi.fn(async () => {});
	const page = new PageScripts(
		{ document: tree, interactions: documentInteractions(tree) },
		{
			createPageRuntime: () =>
				({ closed: false, close }) as unknown as PageRuntime,
		},
	);
	cleanup.push(() => page.close());
	policy.close();
	expect(page.closed).toBe(true);
	await page.close();
	expect(close).toHaveBeenCalledOnce();
});

it("preserves unrestricted startup without requesting a runtime policy or hiding nonces", async () => {
	const test = fixture(
		'<script nonce="visible">inline</script><script src="/script.js"></script>',
	);
	await test.load();
	expect(test.creation).toEqual([undefined]);
	expect(test.evaluated).toEqual(["inline", "/script.js"]);
	expect(
		required(
			[...test.tree().walk()].find(({ node }) => node.tagName === "script"),
		).node.attributes.nonce,
	).toBe("visible");
	expect(documentScriptState(test.tree())?.report?.complete).toBe(true);
});

it.each([undefined, "script-src 'unsafe-inline' *"])(
	"keeps post-load meta invalidation sticky for %s",
	async (policy) => {
		const test = fixture("<script>before</script>", policy);
		await test.load();
		const tree = test.tree();
		const meta = tree.createElement("meta", {
			"http-equiv": "content-security-policy",
			content: "script-src *",
		});
		tree.append(tree.root, meta);
		expect(test.close).toHaveBeenCalledOnce();
		tree.remove(meta);
		const script = tree.createElement("script", { src: "/after.js" });
		initializeScriptElement(tree, script, "dynamic");
		tree.append(tree.root, script);
		await test.loader().settle();
		expect(test.requests).toHaveLength(1);
		expect(test.evaluated).toEqual(["before"]);
		expect(documentScriptCsp(tree)?.unsupported).toBe(true);
	},
);

it("does not request string compilation enforcement for a no-policy page runtime", async () => {
	const tree = new DocumentTree(pageUrl);
	cleanup.push(() => tree.close());
	initializeDocumentScriptCsp(tree, {});
	const close = vi.fn(async () => {});
	const create = vi.fn((options: PageRuntimeOptions) => {
		expect(Object.hasOwn(options, "stringCompilation")).toBe(false);
		return { closed: false, close } as unknown as PageRuntime;
	});
	const page = new PageScripts(
		{ document: tree, interactions: documentInteractions(tree) },
		{ createPageRuntime: create },
	);
	cleanup.push(() => page.close());
	expect(create).toHaveBeenCalledOnce();
	required(documentScriptCsp(tree)).close();
	expect(page.closed).toBe(true);
	await page.close();
	expect(close).toHaveBeenCalledOnce();
});

it("rejects malformed and accessor-backed CSP without invoking accessors or allocating a runner", () => {
	const getter = vi.fn(() => ["script-src *"]);
	const entries = Object.defineProperty([""], "0", { get: getter });
	for (const headers of [
		Object.defineProperty({}, "content-security-policy", { get: getter }),
		{ "content-security-policy": entries },
		{ "content-security-policy": [] },
		{ "content-security-policy": new Array(1) },
		{ "content-security-policy": "script-src *" },
		Object.create({ "content-security-policy": ["script-src *"] }),
	]) {
		const tree = new DocumentTree(pageUrl);
		cleanup.push(() => tree.close());
		const owner = vi.fn();
		const loader = new ScriptLoader({
			response: { ...response(pageUrl, ""), headers },
			signal: new AbortController().signal,
			owner,
		});
		loader.start(tree);
		expect(owner).not.toHaveBeenCalled();
		expect(documentScriptCsp(tree)?.unsupported).toBe(true);
	}
	expect(getter).not.toHaveBeenCalled();
});

it("snapshots the original policy before loader startup and refuses a raw-only external adapter", async () => {
	const policies = ["script-src 'none'"];
	const input = response(pageUrl, "<script>blocked</script>", {
		"content-security-policy": policies,
	});
	const evaluate = vi.fn();
	const loader = new ScriptLoader({
		response: input,
		signal: new AbortController().signal,
		owner: () => ({ closed: false, evaluate }),
	});
	policies[0] = "script-src 'unsafe-inline'";
	const context: DocumentLoaderContext = {
		signal: new AbortController().signal,
		tabId: "fixture",
		limits: {
			maxNodes: 1000,
			maxDepth: 64,
			maxTextCodeUnits: 100_000,
			maxChanges: 100,
		},
	};
	const loaded = await loadBrowserDocument(input, {
		...context,
		scripts: loader,
	});
	cleanup.push(() => loaded.close());
	expect(evaluate).not.toHaveBeenCalled();
	const external = response(pageUrl, '<script src="/script.js"></script>', {
		"content-security-policy": ["script-src 'self'"],
	});
	const fetch = vi.fn();
	const rawLoader = new ScriptLoader({
		response: external,
		signal: new AbortController().signal,
		fetch,
		owner: () => ({ closed: false, evaluate }),
	});
	const rawLoaded = await loadBrowserDocument(external, {
		...context,
		scripts: rawLoader,
	});
	cleanup.push(() => rawLoaded.close());
	expect(fetch).not.toHaveBeenCalled();
	expect(evaluate).not.toHaveBeenCalled();
});
