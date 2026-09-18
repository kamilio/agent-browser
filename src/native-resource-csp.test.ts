import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentResourceCsp } from "./document-resource-csp.js";
import { documentScriptCsp } from "./document-script-csp.js";
import { documentBaseUrl } from "./document-url.js";
import { existingDocumentWebSockets } from "./document-websocket-owner.js";
import { DocumentTree } from "./document.js";
import type {
	NetworkRequest,
	NetworkResponse,
	NetworkTransport,
} from "./network.js";
import { pageBindingGlobalNames } from "./page-bindings.js";
import { PageFetch } from "./page-fetch.js";
import {
	createNativeDocumentScriptCspPolicy,
	createScriptCspPolicy,
} from "./script-csp-policy.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { ScriptLoader } from "./script-loader.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";
import { documentStyles } from "./styles.js";
import type { WebSocketTransport } from "./websocket-transport.js";

const pageUrl = "https://example.com/page";
const policy =
	"upgrade-insecure-requests; default-src 'none'; img-src 'self'; style-src 'unsafe-inline' 'self'; font-src 'self'; connect-src 'self' https://api.example.com wss://socket.example.com; media-src blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; script-src 'nonce-native' 'strict-dynamic' 'unsafe-eval'";
const cleanup: (() => unknown)[] = [];
afterEach(async () => {
	for (const close of cleanup.splice(0).reverse()) await close();
});

function required<Value>(value: Value | undefined): Value {
	if (value === undefined) throw new Error("Missing native fixture value");
	return value;
}

function response(
	url: string,
	body = "",
	headers: NetworkResponse["headers"] = {},
	status = 200,
): NetworkResponse {
	const bytes = new TextEncoder().encode(body);
	return {
		url,
		status,
		body: bytes,
		headers: {
			"content-type": [
				url.endsWith(".css")
					? "text/css"
					: url.endsWith(".js")
						? "text/javascript"
						: "text/html",
			],
			...headers,
		},
		redirects: [],
		elapsedMs: 0,
		encodedBytes: bytes.length,
	};
}

function fixture(
	options: {
		policies?: readonly string[];
		html?: string;
		url?: string;
		request?: (input: NetworkRequest) => Promise<NetworkResponse>;
		sockets?: WebSocketTransport;
	} = {},
) {
	const url = options.url ?? pageUrl;
	const requests: NetworkRequest[] = [];
	const evaluated: string[] = [];
	const runtimePolicies: (string | undefined)[] = [];
	const runtimeClose = vi.fn();
	let context: DocumentLoaderContext;
	const transport: NetworkTransport = {
		async request(input) {
			requests.push(input);
			if (input.url === url)
				return response(
					url,
					options.html ?? '<script nonce="native">admitted</script>',
					{ "content-security-policy": options.policies ?? [policy] },
				);
			return options.request
				? options.request(input)
				: response(input.url, "resource", {
						"access-control-allow-origin": [new URL(url).origin],
					});
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
		...(options.sockets ? { webSocketTransport: options.sockets } : {}),
		loadDocument(input, supplied) {
			context = supplied;
			const scripts = new ScriptLoader({
				response: input,
				signal: supplied.signal,
				topLevelDocument: true,
				fetch: supplied.fetchScript,
				fetchWithPolicy: supplied.fetchScriptWithPolicy,
				owner(tree) {
					runtimePolicies.push(documentScriptCsp(tree)?.stringCompilation);
					return {
						closed: false,
						close: runtimeClose,
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
			return loadBrowserDocument(input, { ...supplied, scripts });
		},
	});
	cleanup.push(() => session.close());
	const tab = session.createTab().id;
	return {
		requests,
		evaluated,
		runtimePolicies,
		runtimeClose,
		session,
		tab,
		load: () => session.navigate(tab, url),
		tree: () => session.page(tab).document,
		context: () => context,
	};
}

function pageFetch(test: ReturnType<typeof fixture>) {
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = { ...definition.methods };
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, descriptor);
			return object;
		},
	};
	const fetch = new PageFetch(
		test.tree(),
		factory,
		required(test.context().fetch),
	);
	cleanup.push(() => fetch.close());
	return fetch;
}

it("keeps standalone generic evaluation fail closed for the entire eleven-directive policy", () => {
	const result = createScriptCspPolicy(pageUrl, {
		"content-security-policy": [policy],
	});
	expect(result.unsupported).toBe(true);
	expect(result.stringCompilation).toBe("deny");
});

it("admits the unchanged full synthetic policy only through native destination enforcement", async () => {
	const test = fixture({
		html: '<style>body { color: red }</style><div style="color:blue"></div><script nonce="native">admitted</script><script>blocked</script><script src="/blocked.js"></script>',
	});
	await test.load();
	expect(test.runtimePolicies).toEqual(["allow"]);
	expect(test.evaluated).toEqual(["admitted"]);
	expect(test.requests).toHaveLength(1);
	expect(documentScriptCsp(test.tree())?.unsupported).toBe(false);
});

it.each([
	"style-src 'unsafe-inline' 'nonce-style'",
	"style-src 'unsafe-inline' 'sha256-YWJj'",
])(
	"refuses unenforced inline style restrictions before parsing: %s",
	async (style) => {
		const test = fixture({
			policies: [policy.replace("style-src 'unsafe-inline' 'self'", style)],
		});
		await expect(test.load()).rejects.toMatchObject({ code: "policy-denied" });
		expect(test.evaluated).toEqual([]);
		expect(test.requests).toHaveLength(1);
	},
);

it.each(["worker-src 'self'", "form-action 'self'", "frame-ancestors 'none'"])(
	"does not ignore unsupported restrictions appended to a backed policy: %s",
	async (directive) => {
		const test = fixture({ policies: [`${policy}; ${directive}`] });
		await expect(test.load()).rejects.toMatchObject({ code: "policy-denied" });
		expect(test.runtimePolicies).toEqual([]);
	},
);

it("checks connect targets without script trust and intersects every policy", async () => {
	const test = fixture({ policies: [policy, "connect-src 'self'"] });
	await test.load();
	const fetch = pageFetch(test);
	await expect(fetch.fetch("/data")).resolves.toMatchObject({ status: 200 });
	await expect(
		fetch.fetch("https://api.example.com/data"),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		fetch.fetch("https://blocked.example/data"),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.requests.map((input) => input.url)).toEqual([
		pageUrl,
		"https://example.com/data",
	]);
});

it("checks default-src for connect when no connect-src is present", async () => {
	const test = fixture({ policies: [policy.replace(/connect-src[^;]+;/, "")] });
	await test.load();
	await expect(pageFetch(test).fetch("/blocked")).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(test.requests).toHaveLength(1);
});

it("owns default-only resource restrictions across inline style mutations and close", async () => {
	const test = fixture({
		policies: ["default-src 'none'; script-src 'nonce-native'"],
		html: '<style>@import "/blocked.css"; #probe {display:none}</style><div id="probe" style="visibility:hidden">text</div><script nonce="native">admitted</script>',
	});
	await test.load();
	const tree = test.tree();
	const owner = required(documentResourceCsp(tree));
	expect(owner.active).toBe(true);
	expect(test.evaluated).toEqual(["admitted"]);
	const probe = required(
		[...tree.walk()].find(({ node }) => node.attributes.id === "probe"),
	).node;
	const styles = documentStyles(tree);
	expect(styles.get(probe.id)).toMatchObject({
		display: "block",
		visibility: "visible",
	});
	tree.setAttribute(probe.id, "style", "display:none;visibility:hidden");
	const style = tree.createElement("style");
	tree.setTextContent(style, '@import "/later.css"; #probe {display:none}');
	tree.append(tree.root, style);
	expect(styles.get(probe.id)).toMatchObject({
		display: "block",
		visibility: "visible",
	});
	await expect(pageFetch(test).fetch("/blocked")).rejects.toMatchObject({
		code: "policy-denied",
	});
	await expect(
		required(test.context().fetchImage)(
			"https://example.com/blocked.png",
			new AbortController().signal,
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	required(documentScriptCsp(tree)).close();
	expect(owner.signal.aborted).toBe(true);
	expect(owner.active).toBe(false);
	expect(styles.get(probe.id).display).toBe("block");
	expect(test.requests).toHaveLength(1);
});

it.each(["'nonce-native'", "'sha256-YWJj'"])(
	"refuses unenforced style fallback from default-src %s",
	async (source) => {
		const test = fixture({
			policies: [`default-src ${source}; script-src 'nonce-native'`],
		});
		await expect(test.load()).rejects.toMatchObject({ code: "policy-denied" });
		expect(test.evaluated).toEqual([]);
		expect(test.requests).toHaveLength(1);
	},
);

it.each([
	["", "https://other.example/base/"],
	["; base-uri 'none'", pageUrl],
	["; base-uri 'self'", pageUrl],
])(
	"keeps base-uri separate from destination fallback: %s",
	async (base, url) => {
		const test = fixture({
			policies: [`default-src 'none'; script-src 'nonce-native'${base}`],
			html: '<base href="https://other.example/base/"><script nonce="native">admitted</script>',
		});
		await test.load();
		expect(documentBaseUrl(test.tree())).toBe(url);
		expect(test.evaluated).toEqual(["admitted"]);
		await expect(pageFetch(test).fetch("relative")).rejects.toMatchObject({
			code: "policy-denied",
		});
		expect(test.requests).toHaveLength(1);
	},
);

it("parses inert scheme-only sources without enabling new resource protocols", async () => {
	const test = fixture({
		policies: [
			"default-src 'none'; script-src 'nonce-native'; img-src 'self' native-image:; style-src 'unsafe-inline' 'self' native-style:; connect-src 'self' native-connect:; font-src native-font:; media-src native-media:; frame-src native-frame:",
		],
	});
	await test.load();
	const owner = required(documentResourceCsp(test.tree()));
	expect(owner.supported).toBe(true);
	for (const destination of ["image", "style", "connect"] as const) {
		expect(() =>
			owner.check(destination, "https://example.com/resource"),
		).not.toThrow();
		expect(() =>
			owner.check(destination, `native-${destination}:resource`),
		).toThrow();
		expect(() =>
			owner.check(destination, "https://blocked.example/resource"),
		).toThrow();
	}
	await expect(
		pageFetch(test).fetch("native-connect:resource"),
	).rejects.toBeDefined();
	expect(test.requests).toHaveLength(1);
});

it.each(["7invalid:", "native://[broken", "https://example.com/%broken"])(
	"does not admit malformed resource source syntax: %s",
	async (source) => {
		const test = fixture({ policies: [`${policy}; style-src-attr ${source}`] });
		await expect(test.load()).rejects.toMatchObject({ code: "policy-denied" });
		expect(test.requests).toHaveLength(1);
	},
);

it("does not turn connect-src none into a blanket script restriction", async () => {
	const test = fixture({
		policies: ["connect-src 'none'"],
		html: '<script>inline</script><script src="/admitted.js"></script>',
	});
	await test.load();
	expect(test.evaluated).toEqual(["inline", "resource"]);
	await expect(pageFetch(test).fetch("/blocked")).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(test.requests).toHaveLength(2);
});

it.each([
	["style-src 'none'", "block", "visible"],
	["style-src 'unsafe-inline'", "none", "hidden"],
	["style-src 'unsafe-inline'; style-src-elem 'none'", "block", "hidden"],
	["style-src 'unsafe-inline'; style-src-attr 'none'", "none", "visible"],
] as const)(
	"enforces style blocks and attributes separately: %s",
	async (style, display, visibility) => {
		const test = fixture({
			policies: [policy.replace("style-src 'unsafe-inline' 'self'", style)],
			html: '<style>#probe { display:none }</style><div id="probe" style="visibility:hidden">text</div><script nonce="native">admitted</script>',
		});
		await test.load();
		const node = required(
			[...test.tree().walk()].find(
				({ node }) => node.attributes.id === "probe",
			),
		).node;
		const styles = documentStyles(test.tree());
		expect(styles.get(node.id)).toMatchObject({ display, visibility });
		test
			.tree()
			.setAttribute(node.id, "style", "display:none;visibility:hidden");
		if (style.includes("style-src-attr 'none'") || style === "style-src 'none'")
			expect(styles.get(node.id).visibility).toBe("visible");
		required(documentScriptCsp(test.tree())).close();
		expect(styles.get(node.id)).toMatchObject({
			display: "block",
			visibility: "visible",
		});
	},
);

it("intersects inline-style permissions and fetches allowed inline imports through style checks", async () => {
	const blocked = fixture({
		policies: [policy, "style-src 'none'"],
		html: '<style>#probe { display:none }</style><div id="probe" style="visibility:hidden">text</div>',
	});
	await blocked.load();
	const blockedNode = required(
		[...blocked.tree().walk()].find(
			({ node }) => node.attributes.id === "probe",
		),
	).node;
	expect(documentStyles(blocked.tree()).get(blockedNode.id)).toMatchObject({
		display: "block",
		visibility: "visible",
	});
	const test = fixture({
		html: '<style>@import "/allowed.css"; #probe { display:none }</style><div id="probe">text</div><script nonce="native">admitted</script>',
		request: async (input) => response(input.url, "#probe {visibility:hidden}"),
	});
	await test.load();
	expect(test.requests.map((input) => input.url)).toEqual([
		pageUrl,
		"https://example.com/allowed.css",
	]);
	const node = required(
		[...test.tree().walk()].find(({ node }) => node.attributes.id === "probe"),
	).node;
	expect(documentStyles(test.tree()).get(node.id)).toMatchObject({
		display: "none",
		visibility: "hidden",
	});
});

it("revokes native-backed decisions and rejects unreported redirects", async () => {
	const test = fixture({
		request: async (input) => ({
			...response(input.url),
			redirects: [{ url: input.url, status: 302, location: input.url }],
		}),
	});
	await test.load();
	await expect(
		required(test.context().fetchImage)(
			"https://example.com/image",
			new AbortController().signal,
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(pageFetch(test).fetch("/data")).rejects.toMatchObject({
		code: "policy-denied",
	});
	const compiled = createNativeDocumentScriptCspPolicy(test.tree(), {
		"content-security-policy": [policy],
	});
	const request = {
		kind: "inline" as const,
		nonce: "native",
		parserInserted: true,
		nonceable: true,
	};
	expect(compiled.allowsScript(request)).toBe(true);
	required(documentScriptCsp(test.tree())).close();
	expect(compiled.allowsScript(request)).toBe(false);
});

it("checks preflight before dispatch and preserves CORS response restrictions", async () => {
	const test = fixture({ request: async (input) => response(input.url) });
	await test.load();
	const fetch = pageFetch(test);
	await expect(
		fetch.fetch("https://blocked.example/data", { method: "PUT" }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.requests).toHaveLength(1);
	await expect(
		fetch.fetch("https://api.example.com/data", { method: "PUT" }),
	).rejects.toBeDefined();
	expect(test.requests).toHaveLength(2);
	expect(test.requests[1].method).toBe("OPTIONS");
});

it("keeps meta invalidation sticky and cancels pending native image work", async () => {
	let started = () => {};
	const ready = new Promise<void>((resolve) => {
		started = resolve;
	});
	const test = fixture({
		request: (input) =>
			new Promise((_resolve, reject) => {
				started();
				input.signal?.addEventListener(
					"abort",
					() => reject(input.signal?.reason),
					{ once: true },
				);
			}),
	});
	await test.load();
	const pending = required(test.context().fetchImage)(
		"https://example.com/image",
		new AbortController().signal,
	);
	const rejected = expect(pending).rejects.toBeDefined();
	await ready;
	const tree = test.tree();
	const meta = tree.createElement("meta", {
		"http-equiv": "content-security-policy",
		content: "img-src *",
	});
	tree.append(tree.root, meta);
	tree.remove(meta);
	await rejected;
	expect(test.requests[1].signal?.aborted).toBe(true);
	await expect(pageFetch(test).fetch("/after")).rejects.toBeDefined();
	expect(test.requests).toHaveLength(2);
});

it("cancels an admitted mock WebSocket handshake when its document owner is invalidated", async () => {
	let started = () => {};
	const ready = new Promise<void>((resolve) => {
		started = resolve;
	});
	let signal: AbortSignal | undefined;
	const connect = vi.fn(
		(_url: string, options: { signal?: AbortSignal }) =>
			new Promise<never>((_resolve, reject) => {
				signal = required(options.signal);
				started();
				signal.addEventListener("abort", () => reject(signal?.reason), {
					once: true,
				});
			}),
	);
	const test = fixture({ sockets: { connect } });
	await test.load();
	const pending = required(existingDocumentWebSockets(test.tree())).connect(
		"wss://socket.example.com/events",
	);
	const rejected = expect(pending).rejects.toBeDefined();
	await ready;
	required(documentScriptCsp(test.tree())).close();
	await rejected;
	expect(signal?.aborted).toBe(true);
	expect(connect).toHaveBeenCalledOnce();
});

it("checks every fetch redirect with the actual count, but never permits a different host", async () => {
	const test = fixture({
		policies: [
			policy.replace(
				/connect-src[^;]+/,
				"connect-src https://example.com/allowed/",
			),
		],
		request: async (input) =>
			input.url.endsWith("start")
				? response(input.url, "", { location: ["/elsewhere"] }, 302)
				: input.url.endsWith("elsewhere")
					? response(
							input.url,
							"",
							{ location: ["https://blocked.example/last"] },
							302,
						)
					: response(input.url),
	});
	await test.load();
	const fetch = pageFetch(test);
	await expect(fetch.fetch("/elsewhere")).rejects.toMatchObject({
		code: "policy-denied",
	});
	await expect(fetch.fetch("/allowed/start")).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(test.requests.map((input) => input.url)).toEqual([
		pageUrl,
		"https://example.com/allowed/start",
		"https://example.com/elsewhere",
	]);
});

it("checks stylesheet redirects and imports before requesting disallowed destinations", async () => {
	const test = fixture({
		policies: [
			policy.replace(
				"style-src 'unsafe-inline' 'self'",
				"style-src 'unsafe-inline' https://example.com/allowed/",
			),
		],
		html: '<link rel="stylesheet" href="/allowed/start.css"><script nonce="native">admitted</script>',
		request: async (input) =>
			input.url.endsWith("start.css")
				? response(input.url, "", { location: ["/elsewhere.css"] }, 302)
				: response(
						input.url,
						'@import "https://blocked.example/secret.css"; body { color:red }',
					),
	});
	await test.load();
	expect(test.requests.map((input) => input.url)).toEqual([
		pageUrl,
		"https://example.com/allowed/start.css",
		"https://example.com/elsewhere.css",
	]);
	expect(test.evaluated).toEqual(["admitted"]);
});

it("checks image redirects with real paths and hosts", async () => {
	const test = fixture({
		policies: [
			policy.replace("img-src 'self'", "img-src https://example.com/allowed/"),
		],
		request: async (input) =>
			input.url.endsWith("first")
				? response(input.url, "", { location: ["/second"] }, 302)
				: response(
						input.url,
						"",
						{ location: ["https://blocked.example/third"] },
						302,
					),
	});
	await test.load();
	await expect(
		required(test.context().fetchImage)(
			"https://example.com/allowed/first",
			new AbortController().signal,
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.requests.map((input) => input.url)).toEqual([
		pageUrl,
		"https://example.com/allowed/first",
		"https://example.com/second",
	]);
});

it("rejects insecure targets instead of upgrading, including documents originally loaded over HTTP", async () => {
	const test = fixture({
		url: "http://example.com/page",
		policies: [
			policy.replace("connect-src 'self'", "connect-src http: https:"),
		],
	});
	await test.load();
	await expect(
		pageFetch(test).fetch("http://example.com/data"),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		required(test.context().fetchImage)(
			"http://example.com/image",
			new AbortController().signal,
		),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		test.session.navigate(test.tab, "http://other.example/page"),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.requests).toHaveLength(1);
});

it("rejects insecure script admissions, form submissions and insecure navigation redirects", async () => {
	const test = fixture({
		url: "http://example.com/page",
		html: '<form id="form" action="http://other.example/submit"><input name="field" value="value"></form><script nonce="native" src="http://other.example/script.js"></script>',
		request: async (input) =>
			response(input.url, "", { location: ["http://other.example/next"] }, 302),
	});
	await test.load();
	expect(test.requests).toHaveLength(1);
	const form = required(
		[...test.tree().walk()].find(({ node }) => node.tagName === "form"),
	).node;
	await expect(
		test.session.requestSubmit(test.tab, test.tree().reference(form.id)),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.requests).toHaveLength(1);
	await expect(
		test.session.navigate(test.tab, "https://other.example/start"),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.requests).toHaveLength(2);
	expect(test.requests[1].redirect).toBe("manual");
});

it("cannot grant resource enforcement to generic or unbound factories with a forged argument", () => {
	const tree = new DocumentTree(pageUrl);
	cleanup.push(() => tree.close());
	const headers = { "content-security-policy": [policy] };
	expect(createNativeDocumentScriptCspPolicy(tree, headers).unsupported).toBe(
		true,
	);
	const result = Reflect.apply(createScriptCspPolicy, undefined, [
		pageUrl,
		headers,
		{},
		{ supportsDirective: () => true, active: true },
	]);
	expect(result.unsupported).toBe(true);
	expect(
		result.allowsScript({
			kind: "inline",
			nonce: "native",
			parserInserted: true,
			nonceable: true,
		}),
	).toBe(false);
});

it("does not fetch inactive font, media, frame or object resources or grant unavailable APIs", async () => {
	const test = fixture({
		html: '<style>@font-face { font-family: native; src: url(https://inactive.example/font.woff) }</style><iframe src="https://inactive.example/frame"></iframe><object data="https://inactive.example/object"></object><embed src="https://inactive.example/embed"><audio src="https://inactive.example/audio"></audio><video src="https://inactive.example/video"><source src="https://inactive.example/source"><track src="https://inactive.example/track"></video><link rel="preload" as="font" href="https://inactive.example/preload"><script nonce="native">admitted</script>',
	});
	await test.load();
	expect(test.evaluated).toEqual(["admitted"]);
	expect(test.requests).toHaveLength(1);
	const names = pageBindingGlobalNames(test.tree());
	for (const name of [
		"open",
		"Worker",
		"SharedWorker",
		"EventSource",
		"XMLHttpRequest",
		"FontFace",
		"Audio",
		"WebAssembly",
	])
		expect(names).not.toContain(name);
});

it("aborts pending connect work and closes runtimes when owner invalidation occurs", async () => {
	let started = () => {};
	const ready = new Promise<void>((resolve) => {
		started = resolve;
	});
	const test = fixture({
		request: (input) =>
			new Promise((_resolve, reject) => {
				started();
				input.signal?.addEventListener(
					"abort",
					() => reject(input.signal?.reason),
					{ once: true },
				);
			}),
	});
	await test.load();
	const pending = pageFetch(test).fetch("/pending");
	const rejected = expect(pending).rejects.toBeDefined();
	await ready;
	required(documentScriptCsp(test.tree())).close();
	await rejected;
	expect(test.runtimeClose).toHaveBeenCalledOnce();
	expect(test.requests[1].signal?.aborted).toBe(true);
});

it("denies insecure or CSP-blocked WebSocket destinations before transport dispatch", async () => {
	const connect = vi.fn(async () => {
		throw new Error("Unexpected transport dispatch");
	});
	const test = fixture({
		sockets: { connect },
		url: "http://example.com/page",
	});
	await test.load();
	const sockets = required(existingDocumentWebSockets(test.tree()));
	await expect(
		sockets.connect("ws://example.com/events"),
	).rejects.toMatchObject({ code: "policy-denied" });
	await expect(
		sockets.connect("wss://blocked.example/events"),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(connect).not.toHaveBeenCalled();
});
