import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { PageFetch } from "./page-fetch.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

interface ResponseFixture {
	status: number;
	ok: boolean;
	url: string;
	type: string;
	redirected: boolean;
	bodyUsed: boolean;
	headers: { get(name: string): string | null; has(name: string): boolean };
	text(): Promise<string>;
	json(): Promise<unknown>;
	clone(): ResponseFixture;
}

const owners: PageFetch[] = [];
const trees: DocumentTree[] = [];
function response(
	url = "https://example.com/data",
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url,
		status: 200,
		headers: {
			"content-type": ["application/json"],
			"set-cookie": ["secret=value"],
		},
		body: new TextEncoder().encode('{"answer":42}'),
		redirects: [],
		encodedBytes: 13,
		elapsedMs: 0,
		...overrides,
	};
}
function fixture(
	handler: (input: NetworkRequest) => Promise<NetworkResponse> = async (
		input,
	) => response(input.url),
	options: ConstructorParameters<typeof PageFetch>[3] = {},
) {
	const tree = new DocumentTree("https://example.com/page");
	trees.push(tree);
	const request = vi.fn(handler);
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
	const owner = new PageFetch(tree, factory, request, options);
	owners.push(owner);
	const fetch = async (input: unknown, init?: unknown) =>
		(await owner.fetch(input, init)) as ResponseFixture;
	return { tree, owner, request, fetch };
}
afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});

it("fetches relative data with document credentials, immutable filtered headers and one-shot bodies", async () => {
	const { fetch, request, owner } = fixture();
	const result = await fetch("/data#fragment");
	expect(request.mock.calls[0][0]).toMatchObject({
		url: "https://example.com/data",
		method: "GET",
		redirect: "manual",
		cookieContext: {
			siteUrl: "https://example.com/page",
			credentials: "same-origin",
			topLevelNavigation: false,
		},
	});
	expect(result).toMatchObject({
		status: 200,
		ok: true,
		type: "basic",
		redirected: false,
		bodyUsed: false,
	});
	expect(result.headers.get("Content-Type")).toBe("application/json");
	expect(result.headers.has("set-cookie")).toBe(false);
	expect(await result.json()).toEqual({ answer: 42 });
	expect(result.bodyUsed).toBe(true);
	await expect(result.text()).rejects.toThrow("already consumed");
	expect(owner.metrics().retainedBytes).toBe(0);
});

it("sends string bodies and filters forbidden request headers", async () => {
	const { fetch, request } = fixture();
	await fetch("/data", {
		method: "post",
		body: "payload",
		credentials: "omit",
		headers: {
			Cookie: "secret",
			Host: "evil.example",
			"Sec-Fetch-Site": "same-origin",
			"X-Client": "test",
		},
	});
	expect(request.mock.calls[0][0]).toMatchObject({
		method: "POST",
		body: "payload",
		headers: {
			"x-client": "test",
			"content-type": "text/plain;charset=UTF-8",
			origin: "https://example.com",
		},
		cookieContext: { credentials: "omit" },
	});
	expect(request.mock.calls[0][0].headers).not.toHaveProperty("cookie");
	expect(request.mock.calls[0][0].headers).not.toHaveProperty("host");
});

it("blocks same-origin mode escapes and non-HTTP requests before transport", async () => {
	const { fetch, request } = fixture();
	for (const url of [
		"https://other.example/data",
		"http://example.com/data",
		"file:///secret",
		"https://user:secret@example.com/",
	])
		await expect(fetch(url, { mode: "same-origin" })).rejects.toThrow();
	expect(request).not.toHaveBeenCalled();
});

it("follows only same-origin redirects and applies POST-to-GET rewriting", async () => {
	const { fetch, request } = fixture(async (input) =>
		input.url.endsWith("/start")
			? response(input.url, { status: 302, headers: { location: ["/data"] } })
			: response(input.url),
	);
	const result = await fetch("/start", { method: "POST", body: "secret" });
	expect(result).toMatchObject({
		redirected: true,
		url: "https://example.com/data",
	});
	expect(request.mock.calls[1][0]).toMatchObject({ method: "GET" });
	expect(request.mock.calls[1][0].body).toBeUndefined();
	expect(request.mock.calls[1][0].headers).not.toHaveProperty("content-type");
});

it("does not follow cross-origin redirects and hides manual redirect details", async () => {
	const { fetch, request } = fixture(async (input) =>
		response(input.url, {
			status: 302,
			headers: { location: ["https://other.example/secret"] },
		}),
	);
	await expect(fetch("/data", { mode: "same-origin" })).rejects.toThrow();
	expect(request).toHaveBeenCalledTimes(1);
	const manual = await fetch("/data", { redirect: "manual" });
	expect(manual).toMatchObject({
		status: 0,
		type: "opaqueredirect",
		url: "",
		ok: false,
	});
	expect(manual.headers.get("location")).toBeNull();
	expect(manual.headers.get("constructor")).toBeNull();
	expect(manual.headers.get("__proto__")).toBeNull();
	expect(await manual.text()).toBe("");
	await expect(fetch("/data", { redirect: "error" })).rejects.toThrow();
});

it("clones retained bodies independently, bounds retention and clears it on close", async () => {
	const { fetch, owner } = fixture(undefined, {
		limits: { maxRetainedBytes: 26 },
	});
	const result = await fetch("/data");
	const clone = result.clone();
	expect(owner.metrics().retainedBytes).toBe(26);
	expect(() => clone.clone()).toThrow("retention");
	await result.text();
	expect(await clone.json()).toEqual({ answer: 42 });
	expect(owner.metrics().retainedBytes).toBe(0);
	expect(() => result.clone()).toThrow("already consumed");
	await fetch("/data");
	owner.close();
	expect(owner.metrics()).toMatchObject({
		retainedBytes: 0,
		active: 0,
		closed: true,
	});
});

it("resolves HTTP errors, treats null bodies correctly and uses UTF-8 regardless of MIME charset", async () => {
	const { fetch } = fixture(async (input) =>
		response(
			input.url,
			input.method === "HEAD"
				? { status: 200 }
				: {
						status: 404,
						body: new Uint8Array([0xef, 0xbb, 0xbf, 0x41]),
						headers: { "content-type": ["text/plain;charset=windows-1252"] },
					},
		),
	);
	const result = await fetch("/missing");
	expect(result.ok).toBe(false);
	expect(await result.text()).toBe("A");
	const head = await fetch("/data", { method: "HEAD" });
	expect(await head.text()).toBe("");
	expect(await head.text()).toBe("");
	expect(head.bodyUsed).toBe(false);
});

it("rejects unsupported init fields and invalid method/header/body inputs", async () => {
	const { fetch, request } = fixture();
	for (const init of [
		{ method: "TRACE" },
		{ method: "GET", body: "x" },
		{ headers: { "X-Test": "bad\nvalue" } },
		{ credentials: "wrong" },
		{ mode: "no-cors" },
		{ signal: {} },
		{ body: {} },
		{ cache: "force-cache" },
	])
		await expect(fetch("/data", init)).rejects.toThrow();
	expect(request).not.toHaveBeenCalled();
});

it("blocks CSP rather than bypassing unsupported policy enforcement", async () => {
	const { fetch, request, tree } = fixture();
	const meta = tree.createElement("meta", {
		"http-equiv": "Content-Security-Policy",
		content: "connect-src 'none'",
	});
	tree.append(tree.root, meta);
	await expect(fetch("/data")).rejects.toThrow("CSP");
	expect(request).not.toHaveBeenCalled();
});

it("aborts document-owned pending requests on close even for non-cooperative transports", async () => {
	const { fetch, request, tree, owner } = fixture(
		async () => new Promise<NetworkResponse>(() => {}),
	);
	const pending = fetch("/data");
	const rejected = expect(pending).rejects.toThrow("closed");
	await Promise.resolve();
	tree.close();
	await rejected;
	expect(request.mock.calls[0][0].signal?.aborted).toBe(true);
	expect(owner.metrics()).toMatchObject({ active: 0, closed: true });
});

it("enforces deadlines, concurrency, request and body bounds", async () => {
	vi.useFakeTimers();
	const { fetch, owner } = fixture(
		async () => new Promise<NetworkResponse>(() => {}),
		{ limits: { timeoutMs: 5, maxPending: 1 } },
	);
	const first = fetch("/data");
	const failed = expect(first).rejects.toThrow("deadline");
	await expect(fetch("/data")).rejects.toThrow("request limit");
	await vi.advanceTimersByTimeAsync(5);
	await failed;
	expect(owner.metrics().active).toBe(0);
	await expect(
		fixture(undefined, { limits: { maxResponseBytes: 5 } }).fetch("/data"),
	).rejects.toThrow("body limit");
	const limited = fixture(undefined, { limits: { maxRequests: 1 } });
	await limited.fetch("/data");
	await expect(limited.fetch("/data")).rejects.toThrow("request limit");
});

it("rejects a transport that silently follows redirects and denies CSP response policy", async () => {
	const automatic = fixture(async () =>
		response("https://example.com/elsewhere"),
	);
	await expect(automatic.fetch("/data")).rejects.toThrow(
		"must not follow redirects",
	);
	const csp = fixture(undefined, { csp: true });
	await expect(csp.fetch("/data")).rejects.toThrow("CSP");
	expect(csp.request).not.toHaveBeenCalled();
});

it("bounds redirects and total response bytes independently of consumed-body retention", async () => {
	const loop = fixture(
		async (input) =>
			response(input.url, { status: 307, headers: { location: ["/data"] } }),
		{ limits: { maxRedirects: 2 } },
	);
	await expect(loop.fetch("/data")).rejects.toThrow("redirect limit");
	expect(loop.request).toHaveBeenCalledTimes(3);
	const limited = fixture(undefined, { limits: { maxTotalBytes: 13 } });
	await (await limited.fetch("/data")).text();
	await expect(limited.fetch("/data")).rejects.toThrow("body limit");
});

it("drops inherited header properties and revokes response capabilities on close", async () => {
	const { fetch, owner, request } = fixture();
	const inherited = Object.create({ Authorization: "not-owned" });
	inherited.Accept = "application/json";
	const result = await fetch("/data", { headers: inherited });
	expect(request.mock.calls[0][0].headers).toEqual({
		accept: "application/json",
	});
	const headers = result.headers;
	owner.close();
	expect(() => result.url).toThrow("closed");
	expect(() => headers.get("content-type")).toThrow("closed");
});

it("preserves string bodies on 307 redirects and does not treat HEAD as a consumed stream", async () => {
	const { fetch, request } = fixture(async (input) =>
		response(
			input.url,
			input.url.endsWith("/start")
				? { status: 307, headers: { location: ["/data"] } }
				: {},
		),
	);
	await fetch("/start", { method: "POST", body: "preserved" });
	expect(request.mock.calls[1][0]).toMatchObject({
		method: "POST",
		body: "preserved",
		headers: { "content-type": "text/plain;charset=UTF-8" },
	});
	const head = await fetch("/data", { method: "HEAD" });
	await expect(head.json()).rejects.toThrow();
	expect(head.bodyUsed).toBe(false);
});

it.each([
	{ timeoutMs: undefined, deadline: 5000 },
	{ timeoutMs: 30000, deadline: 30000 },
])(
	"enforces the selected finite fetch deadline $deadline",
	async ({ timeoutMs, deadline }) => {
		vi.useFakeTimers();
		const { fetch, owner, request } = fixture(
			async () => new Promise<NetworkResponse>(() => {}),
			timeoutMs === undefined ? {} : { limits: { timeoutMs } },
		);
		const pending = fetch("/slow-wasm");
		const rejected = expect(pending).rejects.toThrow("deadline");
		await vi.advanceTimersByTimeAsync(deadline - 1);
		expect(owner.metrics().active).toBe(1);
		expect(request.mock.calls[0][0].signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await rejected;
		expect(owner.metrics().active).toBe(0);
		expect(request.mock.calls[0][0].signal?.aborted).toBe(true);
	},
);

it("validates limit overrides before registering document resources", () => {
	for (const limits of [
		{ maxRequests: 0 },
		{ maxPending: 9 },
		{ timeoutMs: Number.NaN },
		{ timeoutMs: 30001 },
		{ timeoutMs: Number.POSITIVE_INFINITY },
		{ maxRetainedBytes: 1_048_577 },
	])
		expect(() => fixture(undefined, { limits })).toThrow(
			"Invalid page fetch limits",
		);
});

it("accepts absent optional fields but does not silently default invalid null enum values", async () => {
	const { fetch } = fixture();
	await expect(
		fetch("/data", { signal: undefined, referrer: undefined }),
	).resolves.toMatchObject({ ok: true });
	await expect(fetch("/data", { signal: null })).resolves.toMatchObject({
		ok: true,
	});
	await expect(fetch("/data", { credentials: null })).rejects.toThrow(
		"Invalid fetch credentials",
	);
	await expect(fetch("/data", { redirect: null })).rejects.toThrow(
		"Invalid fetch credentials",
	);
});

it("exposes only permitted CORS response headers and omits default cross-origin credentials", async () => {
	const { fetch, request } = fixture(async (input) =>
		response(input.url, {
			headers: {
				"access-control-allow-origin": ["*"],
				"access-control-expose-headers": ["X-Visible"],
				"content-type": ["application/json"],
				"x-visible": ["yes"],
				"x-hidden": ["secret"],
				"set-cookie": ["private=value"],
			},
		}),
	);
	const result = await fetch("https://api.example/data");
	expect(result.type).toBe("cors");
	expect(result.headers.get("x-visible")).toBe("yes");
	expect(result.headers.get("x-hidden")).toBeNull();
	expect(result.headers.get("set-cookie")).toBeNull();
	expect(await result.json()).toEqual({ answer: 42 });
	expect(request.mock.calls[0][0]).toMatchObject({
		headers: { origin: "https://example.com" },
		cookieContext: { credentials: "omit" },
	});
});

it("preflights unsafe CORS requests without credentials or a body and only then sends the mutation", async () => {
	const { fetch, request } = fixture(async (input) =>
		response(input.url, {
			status: input.method === "OPTIONS" ? 204 : 200,
			headers: {
				"access-control-allow-origin": ["https://example.com"],
				"access-control-allow-credentials": ["true"],
				"access-control-allow-methods": ["PUT"],
				"access-control-allow-headers": ["content-type, x-client"],
			},
		}),
	);
	await fetch("https://api.example/data", {
		method: "PUT",
		credentials: "include",
		headers: { "Content-Type": "application/json", "X-Client": "fixture" },
		body: "{}",
	});
	expect(request).toHaveBeenCalledTimes(2);
	expect(request.mock.calls[0][0]).toMatchObject({
		method: "OPTIONS",
		headers: {
			origin: "https://example.com",
			"access-control-request-method": "PUT",
			"access-control-request-headers": "content-type,x-client",
		},
		cookieContext: { credentials: "omit" },
	});
	expect(request.mock.calls[0][0].body).toBeUndefined();
	expect(request.mock.calls[0][0].headers).not.toHaveProperty("x-client");
	expect(request.mock.calls[1][0]).toMatchObject({
		method: "PUT",
		body: "{}",
		cookieContext: { credentials: "include" },
	});
});

it("never sends the actual request after a denied or redirected preflight", async () => {
	for (const status of [204, 302]) {
		const { fetch, request } = fixture(async (input) =>
			response(input.url, {
				status,
				headers: { "access-control-allow-origin": ["*"], location: ["/other"] },
			}),
		);
		await expect(
			fetch("https://api.example/data", { method: "DELETE" }),
		).rejects.toThrow("CORS");
		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][0].method).toBe("OPTIONS");
	}
});

it("checks the actual CORS response even after a successful preflight", async () => {
	const { fetch, request } = fixture(async (input) =>
		response(input.url, {
			headers:
				input.method === "OPTIONS"
					? {
							"access-control-allow-origin": ["*"],
							"access-control-allow-methods": ["DELETE"],
						}
					: {},
		}),
	);
	await expect(
		fetch("https://api.example/data", { method: "DELETE" }),
	).rejects.toThrow("CORS");
	expect(request).toHaveBeenCalledTimes(2);
});

it("keeps CORS taint and cookie omission when a cross-origin redirect returns to the document origin", async () => {
	const { fetch, request } = fixture(async (input) =>
		response(input.url, {
			status: input.url.startsWith("https://api.example/") ? 302 : 200,
			headers: {
				"access-control-allow-origin": [input.headers?.origin ?? "missing"],
				location: ["https://example.com/returned"],
			},
		}),
	);
	const result = await fetch("https://api.example/data");
	expect(result).toMatchObject({
		type: "cors",
		redirected: true,
		url: "https://example.com/returned",
	});
	expect(request.mock.calls[1][0]).toMatchObject({
		headers: { origin: "null" },
		cookieContext: { credentials: "omit", crossSiteRedirect: true },
	});
});

it("strips Authorization on origin-changing redirects and serializes a tainted origin as null", async () => {
	const { fetch, request } = fixture(async (input) =>
		response(input.url, {
			status:
				input.method === "OPTIONS"
					? 204
					: input.url.startsWith("https://api.example/")
						? 302
						: 200,
			headers: {
				"access-control-allow-origin": [input.headers?.origin ?? "missing"],
				"access-control-allow-headers": ["authorization"],
				location: ["https://other.example/data"],
			},
		}),
	);
	await fetch("https://api.example/data", {
		headers: { Authorization: "Bearer private" },
	});
	expect(request.mock.calls.map(([input]) => input.method)).toEqual([
		"OPTIONS",
		"GET",
		"GET",
	]);
	expect(request.mock.calls[1][0].headers?.authorization).toBe(
		"Bearer private",
	);
	expect(request.mock.calls[2][0].headers).toEqual({ origin: "null" });
});

it("rejects credentialed wildcard permission and invalid duplicate origins", async () => {
	for (const origins of [
		["*"],
		["https://example.com", "https://example.com"],
	]) {
		const { fetch } = fixture(async (input) =>
			response(input.url, {
				headers: {
					"access-control-allow-origin": origins,
					"access-control-allow-credentials": ["true"],
				},
			}),
		);
		await expect(
			fetch("https://api.example/data", { credentials: "include" }),
		).rejects.toThrow("CORS");
	}
});

it("cancels a pending preflight without sending the actual body", async () => {
	const { fetch, owner, request } = fixture(
		async () => new Promise<NetworkResponse>(() => {}),
	);
	const task = fetch("https://api.example/data", {
		method: "PUT",
		body: "private",
	});
	const stopped = expect(task).rejects.toThrow("closed");
	await Promise.resolve();
	owner.close();
	await stopped;
	expect(request).toHaveBeenCalledTimes(1);
	expect(request.mock.calls[0][0].body).toBeUndefined();
});

it("checks redirect response permission even in manual mode and blocks mixed content", async () => {
	const { fetch, request } = fixture(async (input) =>
		response(input.url, {
			status: 302,
			headers: { location: ["https://other.example/"] },
		}),
	);
	await expect(
		fetch("https://api.example/", { redirect: "manual" }),
	).rejects.toThrow("CORS");
	expect(request).toHaveBeenCalledTimes(1);
	await expect(fetch("http://api.example/")).rejects.toThrow("Mixed-content");
	expect(request).toHaveBeenCalledTimes(1);
});

it("reuses preflight grants and charges preflight body limits", async () => {
	const allowed = fixture(async (input) =>
		response(input.url, {
			headers: {
				"access-control-allow-origin": ["*"],
				"access-control-allow-methods": ["PUT"],
			},
		}),
	);
	await allowed.fetch("https://api.example/", { method: "PUT" });
	await allowed.fetch("https://api.example/", { method: "PUT" });
	expect(allowed.request.mock.calls.map(([input]) => input.method)).toEqual([
		"OPTIONS",
		"PUT",
		"PUT",
	]);
	const limited = fixture(async (input) => response(input.url), {
		limits: { maxResponseBytes: 5 },
	});
	await expect(
		limited.fetch("https://api.example/", { method: "PUT" }),
	).rejects.toThrow("body limit");
	expect(limited.request).toHaveBeenCalledTimes(1);
});
