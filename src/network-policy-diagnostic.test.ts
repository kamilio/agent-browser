import { afterEach, describe, expect, it, vi } from "vitest";
import { CookieJar } from "./cookies.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	isNetworkPolicyReason,
	networkPolicyDiagnostic,
	networkPolicyError,
} from "./network-policy-diagnostic.js";
import {
	NetworkPolicy,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRouteResolver,
	parseNetworkUrl,
} from "./network.js";
import {
	NodeNetworkTransport,
	type NodeTransportOptions,
} from "./node-transport.js";
import { BrowserSession, type BrowserSessionOptions } from "./session.js";

const forbiddenIO = vi.hoisted(() =>
	vi.fn(() => {
		throw new Error("Synthetic policy fixtures forbid DNS, wire and server IO");
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

type Reason = Parameters<typeof networkPolicyError>[0];

const messages = {
	"url-scheme": "Only HTTP and HTTPS network URLs are allowed",
	"url-credentials": "Credentials in URLs are not allowed",
	"blocked-port": "Network port is not allowed",
	"origin-not-allowed": "Network origin is not allowed",
	"local-name": "Local network names are not allowed",
	"literal-address-policy":
		"Private or reserved network addresses are not allowed",
	"resolved-address-policy":
		"DNS returned a private, reserved or invalid address",
	"transport-controlled-header": "Transport-controlled request header",
	"method-not-allowed": "HTTP method is not allowed",
	"cookie-header-controlled": "Cookie header is controlled by the session jar",
	"redirect-mode-error": "Redirects are not allowed",
	"https-downgrade": "HTTPS downgrade redirects are not allowed",
} satisfies Record<Reason, string>;

const reasons = Object.keys(messages) as Reason[];

it.each(reasons)(
	"admits the shared policy-reason vocabulary entry %s",
	(reason) => {
		expect(isNetworkPolicyReason(reason)).toBe(true);
		const error = networkPolicyError(reason);
		const diagnostic = expectPolicy(error, reason);
		expect(diagnostic.reason).toBe(reason);
		expect(networkPolicyDiagnostic(error)).toBe(diagnostic);
	},
);

it("rejects non-vocabulary inputs without coercion and preserves the fixed factory error", () => {
	let inspections = 0;
	const inspect = () => {
		inspections++;
		throw new Error("synthetic-policy-vocabulary-private");
	};
	const hostile = {
		toString: inspect,
		valueOf: inspect,
		[Symbol.toPrimitive]: inspect,
	};
	const proxy = new Proxy(
		{},
		{
			get: inspect,
			getPrototypeOf: inspect,
			ownKeys: inspect,
			getOwnPropertyDescriptor: inspect,
		},
	);
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	const values: unknown[] = [
		"",
		"unknown",
		"__proto__",
		"constructor",
		"toString",
		"hasOwnProperty",
		"url-scheme ",
		"URL-SCHEME",
		undefined,
		null,
		0,
		false,
		Symbol("reason"),
		new String("url-scheme"),
		["url-scheme"],
		{ reason: "url-scheme" },
		hostile,
		proxy,
		revoked.proxy,
	];
	expect(values).toHaveLength(19);
	for (const value of values) {
		expect(isNetworkPolicyReason(value)).toBe(false);
		const error = capture(() => networkPolicyError(value as Reason));
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect(error).toMatchObject({
			code: "invalid-input",
			message: "Invalid network policy reason",
		});
		expect(networkPolicyDiagnostic(error)).toBeUndefined();
	}
	expect(inspections).toBe(0);
});

it("validates serialized reason vocabulary without minting error identity", () => {
	const error = networkPolicyError("resolved-address-policy");
	const diagnostic = expectPolicy(error, "resolved-address-policy");
	const parsed = JSON.parse(
		JSON.stringify({
			category: "policy-denied",
			stage: "network",
			networkPolicy: diagnostic,
		}),
	) as { networkPolicy: { reason: unknown } };
	expect(isNetworkPolicyReason(parsed.networkPolicy.reason)).toBe(true);
	for (const value of [parsed, parsed.networkPolicy, { cause: error }])
		expect(networkPolicyDiagnostic(value)).toBeUndefined();
	expect(networkPolicyDiagnostic(error)).toBe(diagnostic);
});

const privateMarker = "synthetic-private-network-detail";
const requestUrl = `https://policy.fixture.invalid/start?token=${privateMarker}`;
const localUrl = `https://localhost/start?token=${privateMarker}`;
const navigationTimeoutMs = 25;
const transports: NodeNetworkTransport[] = [];
const sessions: BrowserSession[] = [];
const jars: CookieJar[] = [];
const releases: (() => void)[] = [];

afterEach(async () => {
	for (const session of sessions.splice(0)) session.close();
	for (const release of releases.splice(0)) release();
	for (const transport of transports.splice(0)) {
		transport.close();
		expect(transport.metrics()).toMatchObject({ active: 0, closed: true });
	}
	for (const jar of jars.splice(0)) jar.close();
	if (vi.isFakeTimers()) {
		await vi.advanceTimersByTimeAsync(0);
		expect(vi.getTimerCount()).toBe(0);
		vi.clearAllTimers();
	}
	expect(forbiddenIO).not.toHaveBeenCalled();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

function capture(operation: () => unknown): unknown {
	try {
		operation();
	} catch (error) {
		return error;
	}
	throw new Error("Expected a synchronous synthetic fixture refusal");
}

function rejection(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(
		() => {
			throw new Error("Expected an asynchronous synthetic fixture refusal");
		},
		(error: unknown) => error,
	);
}

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function expectPolicy(error: unknown, reason: Reason) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({
		name: "AgentBrowserError",
		code: "policy-denied",
		message: messages[reason],
	});
	const diagnostic = networkPolicyDiagnostic(error);
	expect(diagnostic).toEqual({ kind: "network-policy-v1", reason });
	if (!diagnostic) throw new Error("Missing native policy diagnostic");
	expect(Reflect.ownKeys(diagnostic).sort()).toEqual(["kind", "reason"]);
	expect(Object.isFrozen(diagnostic)).toBe(true);
	expect(networkPolicyDiagnostic(error)).toBe(diagnostic);
	expect(JSON.stringify(diagnostic)).not.toContain(privateMarker);
	expect(Object.hasOwn(error as object, "reason")).toBe(false);
	expect(Object.hasOwn(error as object, "networkPolicy")).toBe(false);
	return diagnostic;
}

function transportFixture(options: NodeTransportOptions = {}) {
	const transport = new NodeNetworkTransport({
		...options,
		resolver: forbiddenIO,
	});
	transports.push(transport);
	return transport;
}

function expectMetrics(
	transport: NodeNetworkTransport,
	requests = 0,
	mockedRequests = 0,
	decodedBytes = 0,
	closed = false,
) {
	expect(transport.metrics()).toEqual({
		requests,
		mockedRequests,
		mockedDecodedBytes: decodedBytes,
		redirects: 0,
		encodedBytes: 0,
		decodedBytes,
		active: 0,
		closed,
	});
	expect(forbiddenIO).not.toHaveBeenCalled();
}

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

function sessionFixture() {
	let transport!: NodeNetworkTransport;
	const loadDocument = vi.fn<BrowserSessionOptions["loadDocument"]>(() => {
		throw new Error("Synthetic refusal must not reach document loading");
	});
	const session = new BrowserSession({
		createTransport: (cookieJar) => {
			transport = transportFixture({ cookieJar });
			return transport;
		},
		loadDocument,
		limits: { navigationTimeoutMs },
	});
	sessions.push(session);
	const tab = session.createTab().id;
	return { session, transport, tab, loadDocument };
}

describe("private network-policy factory and getter contract", () => {
	it.each(reasons)(
		"creates exact immutable nonconsuming %s records",
		(reason) => {
			const first = networkPolicyError(reason);
			const second = networkPolicyError(reason);
			const diagnostic = expectPolicy(first, reason);
			expectPolicy(second, reason);
			expect(first).not.toBe(second);
			expect(Reflect.set(diagnostic, "reason", privateMarker)).toBe(false);
			expect(Reflect.set(diagnostic, "extra", privateMarker)).toBe(false);
			expect(Reflect.deleteProperty(diagnostic, "kind")).toBe(false);
			expectPolicy(first, reason);
		},
	);

	it("rejects invalid factory reasons with one fixed unmarked invalid-input error", () => {
		const inspect = vi.fn(() => {
			throw new Error(privateMarker);
		});
		const hostile = {
			toString: inspect,
			valueOf: inspect,
			[Symbol.toPrimitive]: inspect,
		};
		const revoked = Proxy.revocable(
			{},
			{ get: inspect, getPrototypeOf: inspect },
		);
		revoked.revoke();
		const invalid: unknown[] = [
			undefined,
			null,
			true,
			42,
			"",
			"__proto__",
			"constructor",
			"toString",
			"url-scheme ",
			`url-scheme\n${privateMarker}`,
			"policy-denied",
			new String("url-scheme"),
			{ reason: "url-scheme" },
			Symbol(privateMarker),
			hostile,
			revoked.proxy,
		];
		const failures = invalid.map((value) =>
			capture(() => networkPolicyError(value as Reason)),
		);
		expect(failures).toHaveLength(16);
		const fixedMessage = (failures[0] as Error).message;
		expect(typeof fixedMessage).toBe("string");
		expect(fixedMessage.length).toBeGreaterThan(0);
		for (const error of failures) {
			expect(error).toBeInstanceOf(AgentBrowserError);
			expect(error).toMatchObject({
				code: "invalid-input",
				message: fixedMessage,
			});
			expect(networkPolicyDiagnostic(error)).toBeUndefined();
			expect((error as Error).message).not.toContain(privateMarker);
		}
		expect(inspect).not.toHaveBeenCalled();
	});

	it("does not infer metadata from nonpolicy categories or matching messages", () => {
		const codes: ErrorCode[] = [
			"invalid-input",
			"network-error",
			"timeout",
			"aborted",
			"closed",
			"unsupported",
			"resource-limit",
		];
		for (const code of codes) {
			const error = new AgentBrowserError(code, messages["url-scheme"]);
			expect(networkPolicyDiagnostic(error)).toBeUndefined();
		}
	});

	it("ignores primitive values and functions", () => {
		for (const value of [
			undefined,
			null,
			false,
			0,
			"url-scheme",
			Symbol(),
			() => {},
		])
			expect(networkPolicyDiagnostic(value)).toBeUndefined();
	});

	it.each([
		{
			label: "manually constructed policy error",
			make: () =>
				new AgentBrowserError("policy-denied", messages["url-scheme"]),
		},
		{
			label: "plain property spoof",
			make: () => ({
				code: "policy-denied",
				kind: "network-policy-v1",
				reason: "url-scheme",
			}),
		},
		{
			label: "error name and code spoof",
			make: () =>
				Object.assign(new Error(messages["url-scheme"]), {
					name: "AgentBrowserError",
					code: "policy-denied",
					reason: "url-scheme",
				}),
		},
		{
			label: "descriptor copy",
			make: (original: AgentBrowserError) =>
				Object.defineProperties(
					new AgentBrowserError("policy-denied", "copy"),
					Object.getOwnPropertyDescriptors(original),
				),
		},
		{
			label: "prototype spoof",
			make: (original: AgentBrowserError) => Object.create(original),
		},
		{
			label: "cause wrapper",
			make: (original: AgentBrowserError) =>
				new Error(privateMarker, { cause: original }),
		},
	])("does not recognize a $label", ({ make }) => {
		const original = networkPolicyError("url-scheme");
		const diagnostic = networkPolicyDiagnostic(original);
		expect(networkPolicyDiagnostic(make(original))).toBeUndefined();
		expect(networkPolicyDiagnostic(original)).toBe(diagnostic);
	});

	it("never reads public fields of branded or unbranded getter objects", () => {
		const original = networkPolicyError("url-scheme");
		const diagnostic = networkPolicyDiagnostic(original);
		const plain = {};
		const inspect = vi.fn(() => {
			throw new Error(privateMarker);
		});
		for (const target of [original, plain]) {
			for (const name of [
				"stack",
				"message",
				"name",
				"code",
				"cause",
				"reason",
				"kind",
			])
				Object.defineProperty(target, name, { get: inspect });
		}
		expect(networkPolicyDiagnostic(original)).toBe(diagnostic);
		expect(networkPolicyDiagnostic(plain)).toBeUndefined();
		expect(inspect).not.toHaveBeenCalled();
	});

	it.each(["plain", "branded", "revoked"])(
		"does not inspect a %s proxy",
		(kind) => {
			const original = networkPolicyError("url-scheme");
			const diagnostic = networkPolicyDiagnostic(original);
			const inspect = vi.fn(() => {
				throw new Error(privateMarker);
			});
			const wrapped = Proxy.revocable(kind === "plain" ? {} : original, {
				get: inspect,
				getPrototypeOf: inspect,
				getOwnPropertyDescriptor: inspect,
				ownKeys: inspect,
				has: inspect,
			});
			if (kind === "revoked") wrapped.revoke();
			expect(networkPolicyDiagnostic(wrapped.proxy)).toBeUndefined();
			expect(inspect).not.toHaveBeenCalled();
			expect(networkPolicyDiagnostic(original)).toBe(diagnostic);
		},
	);
});

const policyGuards: readonly { reason: Reason; operation: () => unknown }[] = [
	{
		reason: "url-scheme",
		operation: () => parseNetworkUrl("ftp://policy.fixture.invalid/"),
	},
	{
		reason: "url-credentials",
		operation: () =>
			parseNetworkUrl(`https://user:${privateMarker}@policy.fixture.invalid/`),
	},
	{
		reason: "blocked-port",
		operation: () =>
			new NetworkPolicy().checkUrl("https://policy.fixture.invalid:25/"),
	},
	{
		reason: "origin-not-allowed",
		operation: () =>
			new NetworkPolicy({
				allowedOrigins: ["https://allowed.fixture.invalid"],
			}).checkUrl(requestUrl),
	},
	{
		reason: "local-name",
		operation: () => new NetworkPolicy().checkUrl(localUrl),
	},
	{
		reason: "literal-address-policy",
		operation: () => new NetworkPolicy().checkUrl("https://127.0.0.1/"),
	},
	{
		reason: "resolved-address-policy",
		operation: () =>
			new NetworkPolicy().checkAddresses(requestUrl, ["8.8.8.8", "127.0.0.1"]),
	},
];

const earlyGuards: readonly {
	reason: Reason;
	request: NetworkRequest;
	withJar?: boolean;
}[] = [
	{
		reason: "transport-controlled-header",
		request: { url: requestUrl, headers: { Host: privateMarker } },
	},
	{
		reason: "method-not-allowed",
		request: { url: requestUrl, method: "CONNECT" },
	},
	{
		reason: "cookie-header-controlled",
		request: { url: requestUrl, headers: { Cookie: `owned=${privateMarker}` } },
		withJar: true,
	},
];

describe("actual native policy and transport guards without wire IO", () => {
	it.each(policyGuards)(
		"preserves the actual $reason guard",
		({ reason, operation }) => {
			expectPolicy(capture(operation), reason);
			expect(forbiddenIO).not.toHaveBeenCalled();
		},
	);

	it("keeps invalid and reserved address members in the combined resolved guard", () => {
		const policy = new NetworkPolicy();
		for (const addresses of [["not-an-address"], ["192.0.2.1"]]) {
			const error = capture(() => policy.checkAddresses(requestUrl, addresses));
			expectPolicy(error, "resolved-address-policy");
		}
	});

	it.each([
		{ label: "empty", addresses: [] },
		{ label: "non-array", addresses: null },
		{ label: "oversized", addresses: Array(65).fill("8.8.8.8") },
	])(
		"leaves $label resolver-result shape failures unmarked",
		({ addresses }) => {
			const error = capture(() =>
				new NetworkPolicy().checkAddresses(
					requestUrl,
					addresses as unknown as readonly string[],
				),
			);
			expect(error).toBeInstanceOf(AgentBrowserError);
			expect(error).toMatchObject({
				code: "network-error",
				message: "Invalid DNS address result",
			});
			expect(networkPolicyDiagnostic(error)).toBeUndefined();
		},
	);

	it.each(earlyGuards)(
		"refuses $reason before routing, DNS or exchange",
		async (fixture) => {
			let cookieJar: CookieJar | undefined;
			if (fixture.withJar) {
				cookieJar = new CookieJar();
				jars.push(cookieJar);
			}
			const transport = transportFixture(cookieJar ? { cookieJar } : {});
			const route = vi.fn<NetworkRouteResolver>((request) =>
				response(request.url),
			);
			const error = await rejection(
				transport.requestWithRoutes(fixture.request, route),
			);
			expectPolicy(error, fixture.reason);
			expect(route).not.toHaveBeenCalled();
			expectMetrics(transport);
		},
	);

	it.each([
		{
			reason: "redirect-mode-error" as const,
			redirect: "error" as const,
			location: "https://policy.fixture.invalid/next",
		},
		{
			reason: "https-downgrade" as const,
			redirect: "follow" as const,
			location: "http://policy.fixture.invalid/next",
		},
	])(
		"preserves $reason using one native fulfilled route without following",
		async (fixture) => {
			const transport = transportFixture();
			const route = vi.fn<NetworkRouteResolver>((request) =>
				response(request.url, {
					status: 302,
					headers: { location: [fixture.location] },
				}),
			);
			const error = await rejection(
				transport.requestWithRoutes(
					{ url: requestUrl, redirect: fixture.redirect },
					route,
				),
			);
			expectPolicy(error, fixture.reason);
			expect(route).toHaveBeenCalledTimes(1);
			expect(route.mock.calls.map(([request]) => request.url)).toEqual([
				requestUrl,
			]);
			expectMetrics(transport, 1, 1);
		},
	);

	it("preserves ordinary allowed URL and literal-address admission without resolution", () => {
		const policy = new NetworkPolicy();
		expect(policy.checkUrl(requestUrl).href).toBe(requestUrl);
		expect(
			policy.checkAddresses(requestUrl, ["8.8.8.8", "1.1.1.1"]),
		).toBeUndefined();
		expect(forbiddenIO).not.toHaveBeenCalled();
	});

	it("returns an ordinary synthetic route with unchanged native accounting", async () => {
		const transport = transportFixture();
		const route = vi.fn<NetworkRouteResolver>((request) =>
			response(request.url, {
				body: new Uint8Array([1, 2, 3]),
			}),
		);
		const result = await transport.requestWithRoutes(
			{ url: requestUrl },
			route,
		);
		expect(result).toMatchObject({
			url: requestUrl,
			status: 200,
			redirects: [],
			encodedBytes: 0,
		});
		expect(Array.from(result.body)).toEqual([1, 2, 3]);
		expect(networkPolicyDiagnostic(result)).toBeUndefined();
		expect(route).toHaveBeenCalledTimes(1);
		expectMetrics(transport, 1, 1, 3);
	});

	it("preserves a genuine transport error through session and journal without public metadata", async () => {
		const { session, transport, tab, loadDocument } = sessionFixture();
		const original = transport.requestWithRoutes.bind(transport);
		const observed: unknown[] = [];
		vi.spyOn(transport, "requestWithRoutes").mockImplementation(
			async (request, resolveRoute) => {
				try {
					return await original(request, resolveRoute);
				} catch (error) {
					observed.push(error);
					throw error;
				}
			},
		);
		const error = await rejection(session.navigate(tab, localUrl));
		expect(observed).toHaveLength(1);
		expect(error).toBe(observed[0]);
		expectPolicy(error, "local-name");
		const journal = session.requests(tab);
		expect(journal.entries).toHaveLength(1);
		expect(journal.entries[0]).toMatchObject({
			state: "blocked",
			error: "policy-denied",
		});
		expect(journal.entries[0]).not.toHaveProperty("networkPolicy");
		expect(networkPolicyDiagnostic(journal.entries[0])).toBeUndefined();
		expect(JSON.stringify(journal)).not.toContain("network-policy-v1");
		expect(JSON.stringify(journal)).not.toContain(privateMarker);
		expect(loadDocument).not.toHaveBeenCalled();
		expectMetrics(transport);
	});

	it.each([
		{ action: "abort", code: "aborted", message: "Navigation aborted" },
		{
			action: "timeout",
			code: "timeout",
			message: "Navigation deadline exceeded",
		},
		{ action: "close", code: "closed", message: "Session is closed" },
	])(
		"does not transfer a deferred genuine refusal onto a winning session $action",
		async ({ action, code, message }) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			const { session, transport, tab, loadDocument } = sessionFixture();
			const entered = deferred<unknown>();
			const release = deferred<void>();
			const finished = deferred<void>();
			releases.push(() => release.resolve());
			const original = transport.requestWithRoutes.bind(transport);
			vi.spyOn(transport, "requestWithRoutes").mockImplementation(
				async (request, resolveRoute) => {
					try {
						return await original(request, resolveRoute);
					} catch (error) {
						entered.resolve(error);
						await release.promise;
						throw error;
					} finally {
						finished.resolve();
					}
				},
			);
			const caller = new AbortController();
			const pending = rejection(
				session.navigate(tab, localUrl, { signal: caller.signal }),
			);
			const genuine = await Promise.race([
				entered.promise,
				pending.then(() => {
					throw new Error(
						"Expected the actual transport guard before settlement",
					);
				}),
			]);
			expectPolicy(genuine, "local-name");
			if (action === "abort") caller.abort(privateMarker);
			else if (action === "close") session.close();
			else vi.advanceTimersByTime(navigationTimeoutMs);
			const winner = await pending;
			expect(winner).toBeInstanceOf(AgentBrowserError);
			expect(winner).toMatchObject({ code, message });
			expect(winner).not.toBe(genuine);
			expect(networkPolicyDiagnostic(winner)).toBeUndefined();
			release.resolve();
			await finished.promise;
			await vi.advanceTimersByTimeAsync(0);
			expect(networkPolicyDiagnostic(winner)).toBeUndefined();
			expectPolicy(genuine, "local-name");
			expect(loadDocument).not.toHaveBeenCalled();
			expectMetrics(transport, 0, 0, 0, action === "close");
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("does not propagate a genuine guard's metadata through an ordinary transport wrapper", async () => {
		const genuine = capture(() => new NetworkPolicy().checkUrl(localUrl));
		expectPolicy(genuine, "local-name");
		const transport = transportFixture();
		const wrapper = new Error(privateMarker, { cause: genuine });
		const route = vi.fn<NetworkRouteResolver>(() => {
			throw wrapper;
		});
		const error = await rejection(
			transport.requestWithRoutes({ url: requestUrl }, route),
		);
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect(error).toMatchObject({
			code: "network-error",
			message: "Network request failed",
		});
		expect(error).not.toBe(wrapper);
		expect(error).not.toBe(genuine);
		expect(networkPolicyDiagnostic(wrapper)).toBeUndefined();
		expect(networkPolicyDiagnostic(error)).toBeUndefined();
		expectPolicy(genuine, "local-name");
		expect(route).toHaveBeenCalledTimes(1);
		expectMetrics(transport, 1);
	});
});
