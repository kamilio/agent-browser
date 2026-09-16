import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type ResearchBodyCapture,
	captureResearchBody,
	decodeResearchBodyCapture,
	researchBodyCaptureLimit,
} from "../scripts/research-body-capture.js";
import {
	parseResearchArguments,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import * as documentLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as readerLoader from "./research-loader.js";
import { BrowserSession } from "./session.js";

const url = "https://research.example/paper";
const otherUrl = "https://research.example/other";
const privateSentinel = "CAPTURE_PRIVATE_ERROR_SENTINEL";

function fixtureCapture(
	bytes: Uint8Array = Uint8Array.of(0),
): ResearchBodyCapture {
	return {
		encoding: "base64",
		decodedBytes: bytes.byteLength,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		data: Buffer.from(bytes).toString("base64"),
	};
}

function invalidCaptureMessage(value: unknown): string {
	let caught: unknown;
	try {
		decodeResearchBodyCapture(value);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	const error = caught as AgentBrowserError;
	expect(error.code).toBe("invalid-input");
	expect(error.message.length).toBeGreaterThan(0);
	expect(error.message.length).toBeLessThan(200);
	expect(error.message).not.toContain(privateSentinel);
	expect(Object.hasOwn(error, "cause")).toBe(false);
	return error.message;
}

function expectInvalidCapture(value: unknown) {
	expect(invalidCaptureMessage(value)).toBe(invalidCaptureMessage(null));
}

function response(
	source: string,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 1,
		...overrides,
	};
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
});

afterEach(() => vi.restoreAllMocks());

function expectCleanup() {
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
}

async function navigate(input: NetworkResponse, reader = false) {
	const expected = fixtureCapture(input.body);
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	request.mockResolvedValueOnce(input);
	const report = await researchNavigation(url, reader, undefined, "main", true);
	expect(request).toHaveBeenCalledOnce();
	expect(request.mock.calls[0][0]).toMatchObject({
		cookieContext: { credentials: "omit" },
	});
	const sent = request.mock.calls[0][0];
	expect(sent.method ?? "GET").toBe("GET");
	expect(sent.body).toBeUndefined();
	for (const name of Object.keys(sent.headers ?? {}))
		expect(["authorization", "proxy-authorization", "cookie"]).not.toContain(
			name.toLowerCase(),
		);
	expect(report.bodyCapture).toEqual(expected);
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
	expect(report.primaryResponse).toMatchObject({
		decodedBytes: expected.decodedBytes,
		bodySha256: expected.sha256,
		status: input.status,
		hashScope: "transport-decoded-body-before-loader",
	});
	expect(report.partial).toBe(true);
	expect(report.contentSuccess).not.toBe(true);
	expect(report.metrics?.closed).toBe(true);
	expectCleanup();
	return report;
}

it("keeps the capture bound equal to the transport response bound", () => {
	expect(researchBodyCaptureLimit).toBe(2_000_000);
	expect(researchBodyCaptureLimit).toBe(
		researchRunLimits.network.maxResponseBytes,
	);
});

it.each([
	{ name: "empty", bytes: new Uint8Array() },
	{
		name: "all byte values",
		bytes: Uint8Array.from({ length: 256 }, (_, index) => index),
	},
	{ name: "invalid UTF-8", bytes: Uint8Array.of(255, 192, 175, 237, 160, 128) },
	{ name: "one padded byte", bytes: Uint8Array.of(0) },
	{ name: "two padded bytes", bytes: Uint8Array.of(0, 255) },
	{ name: "unpadded triple", bytes: Uint8Array.of(0, 255, 128) },
])("roundtrips $name without text decoding", ({ bytes }) => {
	const captured = captureResearchBody(bytes);
	expect(captured).toEqual(fixtureCapture(bytes));
	expect(decodeResearchBodyCapture(captured)).toEqual(bytes);
	expect(
		decodeResearchBodyCapture(JSON.parse(JSON.stringify(captured))),
	).toEqual(bytes);
});

it("captures only a nonzero-offset view, not the surrounding backing bytes", () => {
	const backing = Uint8Array.of(99, 98, 0, 255, 128, 97);
	const view = backing.subarray(2, 5);
	const captured = captureResearchBody(view);
	expect(captured).toEqual(fixtureCapture(Uint8Array.of(0, 255, 128)));
	expect(decodeResearchBodyCapture(captured)).toEqual(
		Uint8Array.of(0, 255, 128),
	);
});

it("accepts the exact byte limit and rejects one extra byte", () => {
	const bytes = new Uint8Array(researchBodyCaptureLimit).fill(173);
	const captured = captureResearchBody(bytes);
	expect(captured).toEqual(fixtureCapture(bytes));
	expect(decodeResearchBodyCapture(captured)).toEqual(bytes);
	expect(() =>
		captureResearchBody(new Uint8Array(researchBodyCaptureLimit + 1)),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("separates captured storage and every decoded result", () => {
	const original = Uint8Array.of(0, 255, 128);
	const captured = captureResearchBody(original);
	const expected = fixtureCapture(original);
	original.fill(42);
	expect(captured).toEqual(expected);
	const first = decodeResearchBodyCapture(captured);
	const second = decodeResearchBodyCapture(captured);
	expect(first).not.toBe(second);
	expect(first.buffer).not.toBe(second.buffer);
	first.fill(91);
	expect(second).toEqual(Uint8Array.of(0, 255, 128));
	expect(decodeResearchBodyCapture(captured)).toEqual(second);
	expect(captured).toEqual(expected);
});

it("accepts an exact null-prototype own-data record", () => {
	const value = Object.assign(Object.create(null), fixtureCapture());
	expect(decodeResearchBodyCapture(value)).toEqual(Uint8Array.of(0));
});

it("accepts frozen own-data records without requiring writable fields", () => {
	expect(decodeResearchBodyCapture(Object.freeze(fixtureCapture()))).toEqual(
		Uint8Array.of(0),
	);
});

it("accepts own-data fields independent of insertion order", () => {
	const value = fixtureCapture();
	expect(
		decodeResearchBodyCapture({
			data: value.data,
			sha256: value.sha256,
			decodedBytes: value.decodedBytes,
			encoding: value.encoding,
		}),
	).toEqual(Uint8Array.of(0));
});

it.each([
	"",
	"A",
	"AA",
	"AA=",
	"AA===",
	"=AA=",
	"A=A=",
	"AAAA=",
	"AA==\n",
	" AA==",
	"AA==\0",
	"AA==AA==",
	"AB==",
	"AAB=",
	"_w==",
	"-w==",
	"ＡＡ==",
	privateSentinel,
])("rejects malformed or noncanonical base64 %j", (data) => {
	expectInvalidCapture({ ...fixtureCapture(), data });
});

it("rejects nonzero unused padding bits even with matching decoded count/hash", () => {
	expectInvalidCapture({ ...fixtureCapture(Uint8Array.of(0)), data: "AB==" });
	expectInvalidCapture({
		...fixtureCapture(Uint8Array.of(0, 0)),
		data: "AAB=",
	});
});

it.each([
	-1,
	0,
	2,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	Number.MAX_SAFE_INTEGER,
	2_000_001,
	"1",
	null,
	undefined,
	true,
	1n,
	{},
])("rejects invalid or mismatched decoded counts %s", (decodedBytes) => {
	expectInvalidCapture({ ...fixtureCapture(), decodedBytes });
});

it.each([
	"",
	"0".repeat(63),
	"0".repeat(65),
	"g".repeat(64),
	"0".repeat(64),
	fixtureCapture().sha256.toUpperCase(),
	`${fixtureCapture().sha256}\n`,
	privateSentinel,
	null,
	undefined,
	42,
])("rejects invalid or mismatched SHA256 %s", (sha256) => {
	expectInvalidCapture({ ...fixtureCapture(), sha256 });
});

it("rejects independently tampered content with the original digest", () => {
	expectInvalidCapture({ ...fixtureCapture(), data: "AQ==" });
});

it.each([null, undefined, false, 42, "base64", {}, [], new Date(0)])(
	"rejects non-record or incomplete input %s",
	(value) => expectInvalidCapture(value),
);

it.each(["encoding", "decodedBytes", "sha256", "data"] as const)(
	"rejects missing or inherited %s",
	(key) => {
		const incomplete: Partial<ResearchBodyCapture> = fixtureCapture();
		delete incomplete[key];
		expectInvalidCapture(incomplete);
		expectInvalidCapture(
			Object.assign(Object.create(fixtureCapture()), incomplete),
		);
	},
);

it.each(["hex", "BASE64", "base64url", null, undefined, 42])(
	"rejects unsupported encoding %s",
	(encoding) => expectInvalidCapture({ ...fixtureCapture(), encoding }),
);

it.each([null, undefined, 42, [], Uint8Array.of(0)])(
	"rejects non-string data %s",
	(data) => expectInvalidCapture({ ...fixtureCapture(), data }),
);

it("rejects extra string, nonenumerable and symbol properties", () => {
	for (const key of ["extra", Symbol(privateSentinel)]) {
		for (const enumerable of [true, false]) {
			const value = Object.defineProperty(fixtureCapture(), key, {
				value: privateSentinel,
				enumerable,
			});
			expectInvalidCapture(value);
		}
	}
});

it.each(["encoding", "decodedBytes", "sha256", "data", "extra"])(
	"rejects %s accessors without invoking them",
	(key) => {
		const getter = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		const setter = vi.fn();
		for (const enumerable of [true, false]) {
			const value = Object.defineProperty(fixtureCapture(), key, {
				get: getter,
				set: setter,
				enumerable,
			});
			expectInvalidCapture(value);
		}
		expect(getter).not.toHaveBeenCalled();
		expect(setter).not.toHaveBeenCalled();
	},
);

it("rejects ordinary and throwing proxies without invoking reflection traps", () => {
	expectInvalidCapture(new Proxy(fixtureCapture(), {}));
	const trap = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const value = new Proxy(fixtureCapture(), {
		get: trap,
		getPrototypeOf: trap,
		getOwnPropertyDescriptor: trap,
		ownKeys: trap,
		has: trap,
	});
	expectInvalidCapture(value);
	expect(trap).not.toHaveBeenCalled();
	const revoked = Proxy.revocable(fixtureCapture(), {});
	revoked.revoke();
	expectInvalidCapture(revoked.proxy);
});

it("does not coerce hostile fields or traverse custom prototypes", () => {
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const hostile = { toString: hook, valueOf: hook, [Symbol.toPrimitive]: hook };
	for (const key of ["encoding", "decodedBytes", "sha256", "data"])
		expectInvalidCapture({ ...fixtureCapture(), [key]: hostile });
	const prototype = Object.defineProperty({}, "data", { get: hook });
	expectInvalidCapture(
		Object.create(
			prototype,
			Object.getOwnPropertyDescriptors(fixtureCapture()),
		),
	);
	expect(hook).not.toHaveBeenCalled();
});

it("captures intrinsic view metadata without invoking shadowed getters", () => {
	const view = Uint8Array.of(99, 0, 255, 98).subarray(1, 3);
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	for (const key of [
		"buffer",
		"byteLength",
		"byteOffset",
		"length",
		"constructor",
	])
		Object.defineProperty(view, key, { get: hook });
	expect(captureResearchBody(view)).toEqual(
		fixtureCapture(Uint8Array.of(0, 255)),
	);
	expect(hook).not.toHaveBeenCalled();
});

it("captures an exact Buffer view without surrounding storage", () => {
	const view = Buffer.from([99, 0, 255, 98]).subarray(1, 3);
	expect(captureResearchBody(view)).toEqual(
		fixtureCapture(Uint8Array.of(0, 255)),
	);
});

it("rejects non-byte views and shared backing with a fixed safe error", () => {
	for (const value of [
		null,
		{},
		new Uint16Array(1),
		new DataView(new ArrayBuffer(1)),
		new Uint8Array(new SharedArrayBuffer(1)),
	])
		expect(() => captureResearchBody(value as Uint8Array)).toThrowError(
			new AgentBrowserError("invalid-input", invalidCaptureMessage(null)),
		);
});

it("rejects proxied and revoked source views without invoking traps", () => {
	const trap = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const value = new Proxy(Uint8Array.of(0), {
		get: trap,
		getPrototypeOf: trap,
		getOwnPropertyDescriptor: trap,
	});
	const revoked = Proxy.revocable(Uint8Array.of(0), {});
	revoked.revoke();
	for (const input of [value, revoked.proxy])
		expect(() => captureResearchBody(input)).toThrowError(
			new AgentBrowserError("invalid-input", invalidCaptureMessage(null)),
		);
	expect(trap).not.toHaveBeenCalled();
});

it("rejects detached source storage rather than producing an empty capture", () => {
	const backing = new ArrayBuffer(1);
	const view = new Uint8Array(backing);
	structuredClone(backing, { transfer: [backing] });
	expect(() => captureResearchBody(view)).toThrowError(
		new AgentBrowserError("invalid-input", invalidCaptureMessage(null)),
	);
});

it("rejects oversized encoded input before allocating decoded storage", () => {
	const maximumEncodedLength = Math.ceil(researchBodyCaptureLimit / 3) * 4;
	const value = {
		...fixtureCapture(),
		data: "A".repeat(maximumEncodedLength + 4),
	};
	const expectedMessage = invalidCaptureMessage(null);
	const allocate = vi.spyOn(Buffer, "from");
	let caught: unknown;
	try {
		decodeResearchBodyCapture(value);
	} catch (error) {
		caught = error;
	}
	const allocations = allocate.mock.calls.length;
	allocate.mockRestore();
	expect(allocations).toBe(0);
	expect(caught).toMatchObject({
		code: "invalid-input",
		message: expectedMessage,
	});
});

it("rejects an oversized declared count before decoding a short payload", () => {
	const value = {
		...fixtureCapture(),
		decodedBytes: researchBodyCaptureLimit + 1,
	};
	const expectedMessage = invalidCaptureMessage(null);
	const allocate = vi.spyOn(Buffer, "from");
	let caught: unknown;
	try {
		decodeResearchBodyCapture(value);
	} catch (error) {
		caught = error;
	}
	const allocations = allocate.mock.calls.length;
	allocate.mockRestore();
	expect(allocations).toBe(0);
	expect(caught).toMatchObject({
		code: "invalid-input",
		message: expectedMessage,
	});
});

it("rejects an extra decoded byte even at the maximum encoded string length", () => {
	const value = fixtureCapture(new Uint8Array(researchBodyCaptureLimit + 1));
	expect(value.data.length).toBe(Math.ceil(researchBodyCaptureLimit / 3) * 4);
	expectInvalidCapture({ ...value, decodedBytes: researchBodyCaptureLimit });
});

it("preserves parser default shape without an own captureBody property", () => {
	const parsed = parseResearchArguments([url]);
	expect(parsed).toEqual({ reader: false, urls: [url] });
	expect(Object.hasOwn(parsed, "captureBody")).toBe(false);
	expect(
		parseResearchArguments(["--reader", url, "--selector", "main"]),
	).toEqual({
		reader: true,
		urls: [url],
		selector: "main",
	});
});

it.each(
	[
		["--capture-body", url],
		[url, "--capture-body"],
		["--reader", "--capture-body", url, "--selector", "main", otherUrl],
		["--capture-body", "--selector", "main", url, "--reader", otherUrl],
		[url, "--selector", "main", otherUrl, "--capture-body", "--reader"],
	].map((args) => ({ args })),
)("parses capture in permitted flag positions $args", ({ args }) => {
	expect(parseResearchArguments(args)).toEqual({
		reader: args.includes("--reader"),
		urls: args.filter((argument) => argument.startsWith("https:")),
		...(args.includes("--selector") ? { selector: "main" } : {}),
		captureBody: true,
	});
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
});

it.each(
	[
		["--capture-body"],
		["--reader", "--capture-body"],
		["--capture-body", "--selector", "main"],
		[url, "--capture-body", "--capture-body"],
		["--capture-body", url, "--reader", "--capture-body"],
		[url, "--capture-body=true"],
		[url, "--capture-body", "--selector"],
		[url, "--selector", "--capture-body"],
	].map((args) => ({ args })),
)("rejects invalid capture arguments $args", ({ args }) => {
	expect(() => parseResearchArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
});

it.each([null, 0, 1, "true", "false", [], {}, Object(true)])(
	"rejects invalid fifth navigation argument %s before startup",
	async (value) => {
		await expect(
			researchNavigation(url, false, undefined, undefined, value as boolean),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
		expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	},
);

it.each([false, true])(
	"captures exact primary bytes before sanitization (reader=%s)",
	async (reader) => {
		const input = response(
			"<script>RAW_SCRIPT_SENTINEL()</script><main><p>Visible source</p></main>",
			{
				url: `${url}?TOKEN_SENTINEL=private#fragment`,
				headers: {
					"content-type": ["text/html; charset=utf-8"],
					"content-encoding": ["gzip"],
					"set-cookie": ["PRIVATE_COOKIE_SENTINEL=value"],
				},
				encodedBytes: 17,
			},
		);
		const report = await navigate(input, reader);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.contentSuccess).toBeNull();
		expect(report.extraction?.content).toContain("Visible source");
		expect(report.extraction?.content).not.toContain("RAW_SCRIPT_SENTINEL");
		expect(
			new TextDecoder().decode(decodeResearchBodyCapture(report.bodyCapture)),
		).toContain("RAW_SCRIPT_SENTINEL");
		expect(report.primaryResponse?.encodedBytes).toBe(17);
		expect(report.primaryResponse?.url).toBe(`${url}?redacted`);
		expect(report.finalUrl).toBe(`${url}?redacted`);
		expect(JSON.stringify(report)).not.toContain("TOKEN_SENTINEL");
		expect(JSON.stringify(report)).not.toContain("PRIVATE_COOKIE_SENTINEL");
		if (reader) expect(report.reader?.omittedSubtrees.script).toBe(1);
	},
);

it.each([false, true])(
	"retains captures when a confirmed header barrier stops loading (reader=%s)",
	async (reader) => {
		const nativeLoader = vi.spyOn(documentLoader, "loadBrowserDocument");
		const semanticLoader = vi.spyOn(readerLoader, "loadResearchDocument");
		const report = await navigate(
			response('<svg><invalid title="unterminated', {
				status: 403,
				headers: {
					"content-type": ["text/html"],
					"cf-mitigated": ["challenge"],
				},
			}),
			reader,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: {
				barrier: "challenge",
				diagnostic: { action: "stop-and-request-user-handoff" },
			},
			failure: { stage: "semantic-barrier" },
		});
		expect(report.extraction).toBeUndefined();
		expect(report.navigation).toBeUndefined();
		expect(nativeLoader).not.toHaveBeenCalled();
		expect(semanticLoader).not.toHaveBeenCalled();
	},
);

it.each([false, true])(
	"retains captures without making text challenges successful (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				"<title>Just a moment...</title><main>Checking your browser</main>",
			),
			reader,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
			failure: { stage: "semantic-barrier" },
		});
	},
);

it.each([false, true])(
	"retains captures and non-2xx outcomes (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response("<main>Public document is unavailable.</main>", { status: 404 }),
			reader,
		);
		expect(report.outcome).toBe("http-failure");
		expect(report.contentSuccess).toBe(false);
		expect(report.classification.barrier).toBeNull();
	},
);

it.each([false, true])(
	"retains captures across loader failures without raw errors (reader=%s)",
	async (reader) => {
		const failure = new AgentBrowserError("unsupported", privateSentinel);
		if (reader)
			vi.spyOn(readerLoader, "loadResearchDocument").mockImplementationOnce(
				() => {
					throw failure;
				},
			);
		else
			vi.spyOn(documentLoader, "loadBrowserDocument").mockRejectedValueOnce(
				failure,
			);
		const report = await navigate(
			response("<main>Saved before loading</main>"),
			reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "unsupported", stage: "loader" },
		});
		expect(report.extraction).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain(privateSentinel);
	},
);

it.each([false, true])(
	"preserves the full body when extraction exceeds its smaller byte budget (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(`<main>${"é".repeat(128_001)}</main>`),
			reader,
		);
		expect(report.bodyCapture?.decodedBytes).toBeGreaterThan(
			researchRunLimits.extractionBytes,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "extraction" },
		});
		expect(report.extraction).toBeUndefined();
	},
);

it("has no capture when the mocked network rejects before a response", async () => {
	vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
		new AgentBrowserError("network-error", privateSentinel),
	);
	const report = await researchNavigation(
		url,
		false,
		undefined,
		undefined,
		true,
	);
	expect(report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		primaryResponse: null,
		failure: { category: "network-error", stage: "network" },
	});
	expect(Object.hasOwn(report, "bodyCapture")).toBe(false);
	expect(JSON.stringify(report)).not.toContain(privateSentinel);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics?.closed).toBe(true);
	expectCleanup();
});

it.each([undefined, false])(
	"omits bodyCapture by default or with explicit %s",
	async (captureBody) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response("<main>Default extraction</main>"),
		);
		const report = await researchNavigation(
			url,
			false,
			undefined,
			undefined,
			captureBody,
		);
		expect(report.outcome).toBe("extracted-unverified");
		expect(Object.hasOwn(report, "bodyCapture")).toBe(false);
		expect(report.primaryResponse).not.toBeNull();
		expectCleanup();
	},
);

it.each([false, true])(
	"retains unscoped capture while stopping before challenge extraction (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const input = response(
			"<title>Just a moment...</title><main>Checking your browser</main>",
		);
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			input,
		);
		const report = await researchNavigation(
			url,
			reader,
			undefined,
			undefined,
			true,
		);
		expect(report.bodyCapture).toEqual(fixtureCapture(input.body));
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.contentSuccess).toBe(false);
		expect(report.classification.barrier).toBe("challenge");
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
		expect(report.failure).toEqual({
			category: "policy-denied",
			stage: "semantic-barrier",
		});
		expect(Object.hasOwn(report, "selection")).toBe(false);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(report.metrics?.closed).toBe(true);
		expectCleanup();
	},
);

it("reports capture resource failures before invoking a loader", async () => {
	const nativeLoader = vi.spyOn(documentLoader, "loadBrowserDocument");
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response("", { body: new Uint8Array(researchBodyCaptureLimit + 1) }),
	);
	const report = await researchNavigation(
		url,
		false,
		undefined,
		undefined,
		true,
	);
	expect(report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		failure: { category: "resource-limit", stage: "body-capture" },
	});
	expect(Object.hasOwn(report, "bodyCapture")).toBe(false);
	expect(nativeLoader).not.toHaveBeenCalled();
	expectCleanup();
});
