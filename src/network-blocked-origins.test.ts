import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { documentScriptCsp } from "./document-script-csp.js";
import { documentScriptState } from "./document-script-state.js";
import { AgentBrowserError } from "./errors.js";
import { networkPolicyDiagnostic } from "./network-policy-diagnostic.js";
import {
	NetworkPolicy,
	type NetworkPolicyOptions,
	type NetworkResponse,
	type NetworkRouteResolver,
} from "./network.js";
import {
	type AddressResolver,
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import { ScriptLoader } from "./script-loader.js";
import { BrowserSession } from "./session.js";

const forbiddenIO = vi.hoisted(() =>
	vi.fn(() => {
		throw new Error("Blocked-origin fixtures forbid native DNS and wire IO");
	}),
);
vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: forbiddenIO,
	get: forbiddenIO,
	createServer: forbiddenIO,
}));
vi.mock("node:https", async (original) => ({
	...(await original<typeof import("node:https")>()),
	request: forbiddenIO,
	get: forbiddenIO,
	createServer: forbiddenIO,
}));
vi.mock("node:dns/promises", () => ({ Resolver: forbiddenIO }));

const origin = "https://blocked.example";
const allowed = "https://allowed.example";
const transports: NodeNetworkTransport[] = [];
const sessions: BrowserSession[] = [];

it.each(["allowedOrigins", "allowPrivateOrigins", "blockedOrigins"] as const)(
	"validates bounded indexed entries without an iterator for %s",
	(option) => {
		const origins = [origin];
		const iterator = vi.fn(() => {
			throw new Error("Origin policies must not invoke supplied iterators");
		});
		Object.defineProperty(origins, Symbol.iterator, { value: iterator });
		const policy = new NetworkPolicy({ [option]: origins });
		expect(iterator).not.toHaveBeenCalled();
		if (option === "blockedOrigins")
			expect(() => policy.checkUrl(origin)).toThrow("explicitly blocked");
		else expect(policy.checkUrl(origin).origin).toBe(origin);
	},
);

afterEach(() => {
	for (const session of sessions.splice(0)) {
		session.close();
		expect(session.metrics()).toMatchObject({
			closed: true,
			pendingLoads: 0,
			cleanupErrors: 0,
			requestQueue: { active: 0, pending: 0, closed: true },
		});
	}
	for (const transport of transports.splice(0)) {
		transport.close();
		expect(transport.metrics()).toMatchObject({ active: 0, closed: true });
	}
	expect(forbiddenIO).not.toHaveBeenCalled();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

function response(
	url: string,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url,
		status: 200,
		headers: {},
		body: new Uint8Array(),
		redirects: [],
		encodedBytes: 0,
		elapsedMs: 0,
		...overrides,
	};
}

function fixture(options: NodeTransportOptions = {}) {
	const resolver = vi.fn<AddressResolver>(async () => ["8.8.8.8"]);
	const transport = new NodeNetworkTransport({ ...options, resolver });
	transports.push(transport);
	const exchange = vi
		.spyOn(
			transport as unknown as {
				exchange(url: URL): Promise<NetworkResponse>;
			},
			"exchange",
		)
		.mockImplementation(async (url) => response(url.href));
	return { transport, resolver, exchange };
}

async function rejection(pending: Promise<unknown>): Promise<unknown> {
	return pending.then(
		() => {
			throw new Error("Expected blocked-origin refusal");
		},
		(error: unknown) => error,
	);
}

function expectBlocked(error: unknown) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({
		code: "policy-denied",
		message: "Network origin is explicitly blocked",
	});
	expect(networkPolicyDiagnostic(error)).toEqual({
		kind: "network-policy-v1",
		reason: "origin-blocked",
	});
}

it.each([origin, "http://localhost:9000", "http://127.0.0.1", "http://[::1]"])(
	"denies %s before resolver and exchange despite explicit admission",
	async (target) => {
		const { transport, resolver, exchange } = fixture({
			blockedOrigins: [target],
			allowedOrigins: [target],
			allowPrivateOrigins: [target],
		});
		expectBlocked(
			await rejection(transport.request({ url: `${target}/path` })),
		);
		expect(resolver).not.toHaveBeenCalled();
		expect(exchange).not.toHaveBeenCalled();
		expect(transport.metrics()).toEqual({
			requests: 0,
			mockedRequests: 0,
			mockedDecodedBytes: 0,
			redirects: 0,
			encodedBytes: 0,
			decodedBytes: 0,
			active: 0,
			closed: false,
		});
	},
);

it("denies before route resolution or response delivery", async () => {
	const { transport, resolver, exchange } = fixture({
		blockedOrigins: [origin],
	});
	const route = vi.fn<NetworkRouteResolver>(() => response(`${origin}/data`));
	expectBlocked(
		await rejection(
			transport.requestWithRoutes({ url: `${origin}/data` }, route),
		),
	);
	expect(route).not.toHaveBeenCalled();
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
	expect(transport.metrics()).toMatchObject({
		requests: 0,
		mockedRequests: 0,
		active: 0,
	});
});

it.each([301, 302, 303, 307, 308])(
	"rechecks a wire redirect destination at status %s before its DNS/exchange",
	async (status) => {
		const { transport, resolver, exchange } = fixture({
			blockedOrigins: [origin],
		});
		exchange.mockImplementation(async (url) =>
			response(url.href, {
				status,
				headers: { location: [`${origin}/private`] },
			}),
		);
		expectBlocked(
			await rejection(transport.request({ url: `${allowed}/start` })),
		);
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(resolver.mock.calls[0]?.[0]).toBe("allowed.example");
		expect(exchange).toHaveBeenCalledTimes(1);
		expect(transport.metrics()).toMatchObject({
			requests: 1,
			redirects: 0,
			active: 0,
		});
	},
);

it("rechecks routed redirect destinations before another route or DNS", async () => {
	const { transport, resolver, exchange } = fixture({
		blockedOrigins: [origin],
	});
	const route = vi.fn<NetworkRouteResolver>((request) =>
		response(request.url, {
			status: 302,
			headers: { location: [`${origin}/script.js`] },
		}),
	);
	expectBlocked(
		await rejection(transport.requestWithRoutes({ url: allowed }, route)),
	);
	expect(route).toHaveBeenCalledTimes(1);
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
	expect(transport.metrics()).toMatchObject({
		requests: 1,
		mockedRequests: 1,
		redirects: 0,
		active: 0,
	});
});

it.each([undefined, []])(
	"preserves unfiltered defaults for %j",
	async (blockedOrigins) => {
		const { transport, resolver, exchange } = fixture({ blockedOrigins });
		expect((await transport.request({ url: origin })).status).toBe(200);
		const route = vi.fn<NetworkRouteResolver>((request) =>
			response(request.url),
		);
		expect(
			(await transport.requestWithRoutes({ url: origin }, route)).status,
		).toBe(200);
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(exchange).toHaveBeenCalledTimes(1);
		expect(route).toHaveBeenCalledTimes(1);
		expect(transport.metrics()).toMatchObject({
			requests: 2,
			mockedRequests: 1,
			active: 0,
		});
	},
);

it("canonicalizes case, default ports, IPv6 and explicit ports exactly", () => {
	const policy = new NetworkPolicy({
		blockedOrigins: [
			"HTTPS://BLOCKED.EXAMPLE:443/",
			"http://blocked.example:80",
			"https://blocked.example:8443",
			"http://[0:0:0:0:0:0:0:1]:8080",
		],
	});
	for (const target of [
		origin,
		"http://blocked.example",
		"https://blocked.example:8443",
		"http://[::1]:8080",
	]) {
		expect(() =>
			policy.checkUrl(`${target}/path?secret=fixture#fragment`),
		).toThrow("explicitly blocked");
	}
	for (const target of [
		allowed,
		"https://child.blocked.example",
		"https://blocked.example.evil.example",
		"https://blocked.example:8444",
	]) {
		expect(policy.checkUrl(target).origin).toBe(target);
	}
});

it("does not give literal wildcard origins suffix semantics", () => {
	const policy = new NetworkPolicy({ blockedOrigins: ["https://*.example"] });
	expect(policy.checkUrl(origin).origin).toBe(origin);
});

it("snapshots caller lists and accepts frozen readonly lists", () => {
	const list = [origin];
	const policy = new NetworkPolicy({ blockedOrigins: list });
	list.splice(0, 1, allowed);
	expect(() => policy.checkUrl(origin)).toThrow("explicitly blocked");
	expect(policy.checkUrl(allowed).origin).toBe(allowed);
	expect(() =>
		new NetworkPolicy({ blockedOrigins: Object.freeze([origin]) }).checkUrl(
			origin,
		),
	).toThrow("explicitly blocked");
});

it("admits 1000 entries but refuses 1001 even if duplicates", () => {
	const policy = new NetworkPolicy({
		blockedOrigins: Array.from(
			{ length: 1000 },
			(_, index) => `https://host${index}.example`,
		),
	});
	expect(() => policy.checkUrl("https://host999.example")).toThrow(
		"explicitly blocked",
	);
	expect(
		() => new NetworkPolicy({ blockedOrigins: Array(1001).fill(origin) }),
	).toThrow("Invalid network origin policy");
});

it.each(
	[
		null,
		origin,
		{},
		new Set([origin]),
		[null],
		[42],
		[undefined],
		Array(1),
		[`${origin}/path`],
		[`${origin}?token=fixture`],
		[`${origin}#fixture`],
		["https://user:fixture@blocked.example"],
		["file:///fixture"],
		["not a URL"],
		["https://blocked.\nexample"],
		[`${origin}/${"x".repeat(16_384)}`],
	].map((value) => ({ value })),
)("rejects malformed blocked-origin list %#", ({ value }) => {
	expect(
		() =>
			new NetworkPolicy({
				blockedOrigins: value as NetworkPolicyOptions["blockedOrigins"],
			}),
	).toThrow(AgentBrowserError);
});

it("keeps URL, port, allowlist, private-name, literal and DNS restrictions", async () => {
	const policy = new NetworkPolicy({
		blockedOrigins: [origin],
		allowedOrigins: [],
	});
	expect(() => policy.checkUrl(origin)).toThrow("explicitly blocked");
	expect(() => policy.checkUrl(allowed)).toThrow("origin is not allowed");
	const defaults = new NetworkPolicy({ blockedOrigins: [] });
	for (const target of [
		"https://user:secret@allowed.example",
		"file:///fixture",
		"https://allowed.example:25",
		"http://localhost",
		"http://127.0.0.1",
	]) {
		expect(() => defaults.checkUrl(target)).toThrow(AgentBrowserError);
	}
	expect(() =>
		defaults.checkAddresses(allowed, ["8.8.8.8", "127.0.0.1"]),
	).toThrow("DNS returned");
	expect(() =>
		new NetworkPolicy({ blockedOrigins: [origin] }).checkAddresses(origin, [
			"8.8.8.8",
		]),
	).toThrow("explicitly blocked");
	const { transport, resolver, exchange } = fixture({
		blockedOrigins: [origin],
	});
	resolver.mockResolvedValue(["127.0.0.1"]);
	expect(await rejection(transport.request({ url: allowed }))).toMatchObject({
		code: "policy-denied",
	});
	expect(exchange).not.toHaveBeenCalled();
});

it("returns only the stable redacted diagnostic without URL/query details", async () => {
	const { transport } = fixture({ blockedOrigins: [origin] });
	const error = await rejection(
		transport.request({ url: `${origin}/private?token=synthetic-secret` }),
	);
	expectBlocked(error);
	const diagnostic = networkPolicyDiagnostic(error);
	expect(Object.isFrozen(diagnostic)).toBe(true);
	expect(Object.keys(diagnostic ?? {}).sort()).toEqual(["kind", "reason"]);
	expect(JSON.stringify({ error, diagnostic })).not.toMatch(
		/blocked\.example|private|synthetic-secret/,
	);
	expect(
		networkPolicyDiagnostic({
			code: "policy-denied",
			reason: "origin-blocked",
		}),
	).toBeUndefined();
});

it("preserves full policy and continues with allowed nonce scripts after a blocked fetch", async () => {
	const evaluated: string[] = [];
	const creation: (string | undefined)[] = [];
	let closed = false;
	const close = vi.fn(() => {
		closed = true;
	});
	let setup!: ReturnType<typeof fixture>;
	const session = new BrowserSession({
		createTransport: (cookieJar) => {
			setup = fixture({ blockedOrigins: [origin], cookieJar });
			return setup.transport;
		},
		loadDocument(input, context) {
			const scripts = new ScriptLoader({
				response: input,
				topLevelDocument: context.topLevelDocument,
				signal: context.signal,
				fetch: context.fetchScript,
				fetchWithPolicy: context.fetchScriptWithPolicy,
				owner(document) {
					creation.push(documentScriptCsp(document)?.stringCompilation);
					return {
						get closed() {
							return closed;
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
			return loadBrowserDocument(input, { ...context, scripts });
		},
	});
	sessions.push(session);
	const { transport, resolver, exchange } = setup;
	const policy =
		"upgrade-insecure-requests; default-src 'none'; img-src 'self'; style-src 'unsafe-inline' 'self'; font-src 'self'; connect-src 'self'; media-src blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; script-src 'nonce-native' 'strict-dynamic' 'unsafe-eval'";
	session.routes.add(`${allowed}/page`, {
		contentType: "text/html",
		headers: { "content-security-policy": policy },
		body: `<script nonce="native" src="${origin}/blocked.js"></script><script nonce="native" src="/allowed.js"></script><script nonce="native">allowed-inline</script><script>csp-denied</script>`,
	});
	session.routes.add(`${origin}/blocked.js`, {
		contentType: "text/javascript",
		body: "must-not-execute",
	});
	session.routes.add(`${allowed}/allowed.js`, {
		contentType: "text/javascript",
		body: "allowed-external",
	});
	const fulfill = vi.spyOn(session.routes, "fulfill");
	const tab = session.createTab().id;
	await session.navigate(tab, `${allowed}/page`);
	expect(creation).toEqual(["allow"]);
	expect(evaluated).toEqual(["allowed-external", "allowed-inline"]);
	expect(fulfill.mock.calls.map(([request]) => request.url)).toEqual([
		`${allowed}/page`,
		`${allowed}/allowed.js`,
	]);
	expect(documentScriptState(session.page(tab).document)?.report).toMatchObject(
		{
			executed: 2,
			failed: 1,
			halted: false,
			complete: true,
			issues: { "fetch-policy-denied": 1 },
		},
	);
	expect(resolver).not.toHaveBeenCalled();
	expect(exchange).not.toHaveBeenCalled();
	expect(transport.metrics()).toMatchObject({
		requests: 2,
		mockedRequests: 2,
		active: 0,
	});
	session.close();
	expect(close).toHaveBeenCalledTimes(1);
	expect(closed).toBe(true);
});
