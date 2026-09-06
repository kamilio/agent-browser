import { Readable } from "node:stream";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { afterEach, expect, it, vi } from "vitest";
import { researchNavigation } from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import {
	type ResponseAccountingWriter,
	ResponseByteAccounting,
	claimResponseAccounting,
} from "./response-byte-accounting.js";

interface StreamConsumer {
	consume(
		response: Readable,
		contentEncoding: string,
		signal: AbortSignal,
		maxResponseBytes: number,
		accounting?: ResponseAccountingWriter,
	): Promise<{ body: Uint8Array; encodedBytes: number }>;
}

type ByteKind =
	| "network.response-encoded"
	| "network.response-decoded"
	| "network.session-encoded"
	| "network.session-decoded";

const messages = {
	"network.response-encoded": "Encoded response byte limit exceeded",
	"network.response-decoded": "Decoded response byte limit exceeded",
	"network.session-encoded": "Session network byte limit exceeded",
	"network.session-decoded": "Session network byte limit exceeded",
};
const codecs = [
	{ encoding: "gzip", compress: gzipSync },
	{ encoding: "deflate", compress: deflateSync },
	{ encoding: "br", compress: brotliCompressSync },
];
const fixtureUrl = "https://byte-diagnostics.fixture.invalid/";
const privateBody = "PRIVATE_BODY_DIAGNOSTIC_SENTINEL";
const privateMessage = "PRIVATE_EXCEPTION_DIAGNOSTIC_SENTINEL";
const privateUrl = "https://private-diagnostic.invalid/SECRET_PATH";
const privateHeader = "PRIVATE_HEADER_DIAGNOSTIC_SENTINEL";
const transports: NodeNetworkTransport[] = [];
const resolvers: ReturnType<typeof vi.fn>[] = [];
const streams: Readable[] = [];
const fixtures: Array<{ buffer: Buffer; before: Buffer }> = [];
const cleanup: Array<() => void> = [];

function transport(maxTotalBytes = 4096) {
	const resolver = vi.fn(async () => {
		throw new Error("Synthetic byte diagnostics must not resolve addresses.");
	});
	const active = new NodeNetworkTransport({
		resolver,
		limits: { maxTotalBytes },
	});
	transports.push(active);
	resolvers.push(resolver);
	return active;
}

function consume(
	active: NodeNetworkTransport,
	chunks: readonly Buffer[],
	limit: number,
	encoding = "identity",
	accounting?: ResponseAccountingWriter,
	signal = new AbortController().signal,
) {
	for (const buffer of chunks)
		fixtures.push({ buffer, before: Buffer.from(buffer) });
	const source = Readable.from(chunks);
	streams.push(source);
	return (active as unknown as StreamConsumer).consume(
		source,
		encoding,
		signal,
		limit,
		accounting,
	);
}

async function failure(operation: Promise<unknown>) {
	try {
		await operation;
	} catch (error) {
		return error;
	}
	throw new Error("Expected an actual in-memory consumption failure.");
}

function diagnostic(
	error: unknown,
	kind: ByteKind,
	limit: number,
	observed: number,
) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({
		code: "resource-limit",
		message: messages[kind],
	});
	const value = resourceLimitDiagnostic(error);
	expect(value).toEqual({ kind, unit: "bytes", limit, observed });
	expect(Object.isFrozen(value)).toBe(true);
	return value;
}

function accounting(maxTotalBytes: number) {
	const owner = new ResponseByteAccounting(maxTotalBytes, 1);
	const writer = claimResponseAccounting(owner.createLease());
	cleanup.push(() => {
		writer.finish();
		owner.close();
	});
	return { owner, writer };
}

afterEach(() => {
	try {
		for (const source of streams) source.destroy();
		for (const active of transports) active.close();
		for (const release of cleanup) release();
		for (const resolver of resolvers) expect(resolver).not.toHaveBeenCalled();
		for (const { buffer, before } of fixtures) expect(buffer).toEqual(before);
	} finally {
		transports.length = 0;
		resolvers.length = 0;
		streams.length = 0;
		fixtures.length = 0;
		cleanup.length = 0;
		vi.restoreAllMocks();
	}
});

it("accepts the exact encoded response cap over split in-memory chunks", async () => {
	const active = transport();
	const result = await consume(
		active,
		[Buffer.from("abc"), Buffer.from("defgh")],
		8,
	);
	expect(Buffer.from(result.body)).toEqual(Buffer.from("abcdefgh"));
	expect(result.encodedBytes).toBe(8);
	expect(active.metrics()).toMatchObject({ encodedBytes: 8, decodedBytes: 8 });
});

it("tags encoded response cap plus one after debiting the whole offending chunk", async () => {
	const active = transport();
	const error = await failure(
		consume(active, [Buffer.from("abc"), Buffer.from("defghi")], 8),
	);
	diagnostic(error, "network.response-encoded", 8, 9);
	expect(active.metrics()).toMatchObject({ encodedBytes: 9, decodedBytes: 3 });
});

it("reports the actual encoded overshoot rather than a clamped cap plus one", async () => {
	const active = transport();
	const error = await failure(
		consume(active, [Buffer.from("abc"), Buffer.from("defghij")], 5),
	);
	diagnostic(error, "network.response-encoded", 5, 10);
	expect(active.metrics()).toMatchObject({ encodedBytes: 10, decodedBytes: 3 });
});

it.each(codecs)(
	"accepts the exact decoded response cap for split $encoding input",
	async ({ encoding, compress }) => {
		const active = transport();
		const body = Buffer.alloc(256, 0x61);
		const encoded = compress(body);
		expect(encoded.byteLength).toBeLessThan(256);
		const middle = Math.floor(encoded.byteLength / 2);
		const result = await consume(
			active,
			[encoded.subarray(0, middle), encoded.subarray(middle)],
			256,
			encoding,
		);
		expect(Buffer.from(result.body)).toEqual(body);
		expect(result.encodedBytes).toBe(encoded.byteLength);
		expect(active.metrics()).toMatchObject({
			encodedBytes: encoded.byteLength,
			decodedBytes: 256,
		});
	},
);

it.each(codecs)(
	"tags decoded response cap plus one for actual split $encoding decompression",
	async ({ encoding, compress }) => {
		const active = transport();
		const body = Buffer.alloc(256, 0x62);
		const encoded = compress(body);
		expect(encoded.byteLength).toBeLessThan(255);
		const middle = Math.floor(encoded.byteLength / 2);
		const error = await failure(
			consume(
				active,
				[encoded.subarray(0, middle), encoded.subarray(middle)],
				255,
				encoding,
			),
		);
		diagnostic(error, "network.response-decoded", 255, 256);
		expect(active.metrics()).toMatchObject({
			encodedBytes: encoded.byteLength,
			decodedBytes: 256,
		});
	},
);

it("reports the complete decoded chunk overshoot rather than the configured cap", async () => {
	const active = transport();
	const encoded = gzipSync(Buffer.alloc(256, 0x63));
	const error = await failure(consume(active, [encoded], 200, "gzip"));
	diagnostic(error, "network.response-decoded", 200, 256);
	expect(active.metrics().decodedBytes).toBe(256);
});

it("retains encoded session counters across operations including exact cap and cap plus one", async () => {
	const active = transport(10);
	await consume(active, [Buffer.from("abcdef")], 10);
	await consume(active, [Buffer.from("ghij")], 10);
	expect(active.metrics()).toMatchObject({
		encodedBytes: 10,
		decodedBytes: 10,
	});
	const error = await failure(consume(active, [Buffer.from("k")], 10));
	diagnostic(error, "network.session-encoded", 10, 11);
	expect(active.metrics()).toMatchObject({
		encodedBytes: 11,
		decodedBytes: 10,
	});
});

it("exhausts decoded session bytes independently of encoded bytes across compressed operations", async () => {
	const active = transport(128);
	const first = gzipSync(Buffer.alloc(64, 0x61));
	const second = gzipSync(Buffer.alloc(64, 0x62));
	const last = gzipSync(Buffer.from("c"));
	const encodedTotal = first.byteLength + second.byteLength + last.byteLength;
	expect(encodedTotal).toBeLessThan(128);
	await consume(active, [first], 64, "gzip");
	await consume(active, [second], 64, "gzip");
	expect(active.metrics()).toMatchObject({
		encodedBytes: first.byteLength + second.byteLength,
		decodedBytes: 128,
	});
	const error = await failure(consume(active, [last], 64, "gzip"));
	diagnostic(error, "network.session-decoded", 128, 129);
	expect(active.metrics()).toMatchObject({
		encodedBytes: encodedTotal,
		decodedBytes: 129,
	});
});

it.each([
	{ dimension: "encoded", winner: "session" },
	{ dimension: "encoded", winner: "accounting" },
	{ dimension: "encoded", winner: "response" },
	{ dimension: "decoded", winner: "session" },
	{ dimension: "decoded", winner: "accounting" },
	{ dimension: "decoded", winner: "response" },
] as const)(
	"preserves $dimension debit/session/accounting/response precedence when $winner wins",
	async ({ dimension, winner }) => {
		const decoded = dimension === "decoded";
		const limit = decoded ? 255 : 4;
		const observed = limit + 1;
		const wire = decoded
			? gzipSync(Buffer.alloc(256, 0x64))
			: Buffer.from("abcde");
		const active = transport(winner === "session" ? limit : 4096);
		const { owner, writer } = accounting(winner === "response" ? 4096 : limit);
		const error = await failure(
			consume(active, [wire], limit, decoded ? "gzip" : "identity", writer),
		);
		if (winner === "accounting") {
			expect(error).toMatchObject({
				code: "resource-limit",
				message: "Fetch response body limit exceeded",
			});
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		} else {
			const kind: ByteKind =
				winner === "session"
					? decoded
						? "network.session-decoded"
						: "network.session-encoded"
					: decoded
						? "network.response-decoded"
						: "network.response-encoded";
			diagnostic(error, kind, limit, observed);
		}
		expect(owner.metrics()).toMatchObject({
			observedEncodedBytes: wire.byteLength,
			observedDecodedBytes: decoded ? observed : 0,
		});
		expect(active.metrics()).toMatchObject({
			encodedBytes: wire.byteLength,
			decodedBytes: decoded ? observed : 0,
		});
	},
);

it("preserves a throwing actual accounting debit before checking the session maximum", async () => {
	const active = transport(4);
	const { owner, writer } = accounting(4);
	writer.finish();
	const error = await failure(
		consume(active, [Buffer.from("abcde")], 4, "identity", writer),
	);
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({
		code: "closed",
		message: "Response accounting writer is finished",
	});
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	expect(owner.metrics()).toMatchObject({
		observedEncodedBytes: 0,
		observedDecodedBytes: 0,
	});
	expect(active.metrics()).toMatchObject({ encodedBytes: 5, decodedBytes: 0 });
});

it("keeps actual byte diagnostics immutable and independent of hostile error properties", async () => {
	const error = await failure(
		consume(transport(), [Buffer.from(privateBody)], 1),
	);
	const value = diagnostic(
		error,
		"network.response-encoded",
		1,
		Buffer.byteLength(privateBody),
	);
	if (!(error instanceof AgentBrowserError) || !value)
		throw new Error("Expected actual consumer byte metadata.");
	const getter = vi.fn(() => {
		throw new Error(privateMessage);
	});
	Object.defineProperty(error, "resourceLimit", { get: getter });
	Object.assign(error, {
		message: privateMessage,
		url: privateUrl,
		headers: { authorization: privateHeader },
		body: Buffer.from(privateBody),
	});
	expect(resourceLimitDiagnostic(error)).toBe(value);
	expect(Reflect.set(value, "observed", 999)).toBe(false);
	expect(Object.keys(value).sort()).toEqual([
		"kind",
		"limit",
		"observed",
		"unit",
	]);
	expect(getter).not.toHaveBeenCalled();
	for (const secret of [privateMessage, privateUrl, privateHeader, privateBody])
		expect(JSON.stringify(value)).not.toContain(secret);
});

it("ignores forged, inherited, wrapped and revoked diagnostic provenance", async () => {
	const error = await failure(consume(transport(), [Buffer.from("abc")], 2));
	const metadata = diagnostic(error, "network.response-encoded", 2, 3);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected actual consumer failure.");
	const getter = vi.fn(() => {
		throw new Error(privateMessage);
	});
	const fake = new AgentBrowserError("resource-limit", privateMessage);
	Object.assign(fake, {
		kind: "network.response-encoded",
		unit: "bytes",
		limit: 2,
		observed: 3,
	});
	Object.defineProperty(fake, "resourceLimit", { get: getter });
	const inherited = Object.create(error);
	const copy = Object.assign(
		new AgentBrowserError("resource-limit", privateMessage),
		{ resourceLimit: metadata },
	);
	const wrapped = Proxy.revocable(error, {
		get: getter,
		getPrototypeOf: getter,
	});
	for (const untrusted of [fake, inherited, copy, wrapped.proxy])
		expect(resourceLimitDiagnostic(untrusted)).toBeUndefined();
	wrapped.revoke();
	expect(resourceLimitDiagnostic(wrapped.proxy)).toBeUndefined();
	expect(getter).not.toHaveBeenCalled();
});

it.each(["unknown", "gzip, gzip, gzip, gzip"])(
	"leaves unsupported encoding %s untagged",
	async (encoding) => {
		const active = transport();
		const error = await failure(
			consume(active, [Buffer.from(privateBody)], 1, encoding),
		);
		expect(error).toMatchObject({
			code: "unsupported",
			message: "Unsupported response content encoding",
		});
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		expect(active.metrics()).toMatchObject({
			encodedBytes: 0,
			decodedBytes: 0,
		});
	},
);

it("leaves the actual pipeline abort untagged", async () => {
	const controller = new AbortController();
	controller.abort(new AgentBrowserError("aborted", privateMessage));
	const error = await failure(
		consume(
			transport(),
			[Buffer.from("abc")],
			8,
			"identity",
			undefined,
			controller.signal,
		),
	);
	expect(error).toMatchObject({ name: "AbortError", code: "ABORT_ERR" });
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
});

it("does not mislabel a real decompression error as a byte limit", async () => {
	const wire = Buffer.from("not a gzip stream");
	const active = transport();
	const error = await failure(consume(active, [wire], 256, "gzip"));
	expect(error).toMatchObject({ code: "Z_DATA_ERROR" });
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	expect(active.metrics()).toMatchObject({
		encodedBytes: wire.byteLength,
		decodedBytes: 0,
	});
});

it("preserves closed transport admission without resolution or byte diagnostics", async () => {
	const active = transport();
	active.close();
	const error = await failure(active.request({ url: fixtureUrl }));
	expect(error).toMatchObject({
		code: "closed",
		message: "Transport is closed",
	});
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	expect(active.metrics()).toMatchObject({
		closed: true,
		encodedBytes: 0,
		decodedBytes: 0,
	});
});

async function actualFailure(kind: ByteKind) {
	if (kind === "network.response-encoded") {
		const wire = Buffer.from(privateBody);
		const error = await failure(
			consume(transport(), [wire], wire.byteLength - 1),
		);
		return { error, limit: wire.byteLength - 1, observed: wire.byteLength };
	}
	if (kind === "network.session-encoded") {
		const wire = Buffer.from(privateBody);
		const active = transport(wire.byteLength);
		await consume(active, [wire], wire.byteLength);
		const error = await failure(
			consume(active, [Buffer.from("!")], wire.byteLength),
		);
		return { error, limit: wire.byteLength, observed: wire.byteLength + 1 };
	}
	const body = Buffer.alloc(256, 0x65);
	body.set(Buffer.from(privateBody));
	const encoded = gzipSync(body);
	expect(
		encoded.byteLength + gzipSync(Buffer.from("!")).byteLength,
	).toBeLessThan(256);
	if (kind === "network.response-decoded") {
		const error = await failure(consume(transport(), [encoded], 255, "gzip"));
		return { error, limit: 255, observed: 256 };
	}
	const active = transport(256);
	await consume(active, [encoded], 256, "gzip");
	const error = await failure(
		consume(active, [gzipSync(Buffer.from("!"))], 256, "gzip"),
	);
	return { error, limit: 256, observed: 257 };
}

it.each([
	"network.response-encoded",
	"network.response-decoded",
	"network.session-encoded",
	"network.session-decoded",
] as const)(
	"synthetic navigation serializes actual %s metadata without a body or secret properties",
	async (kind) => {
		let measured: ReturnType<typeof resourceLimitDiagnostic>;
		let expected:
			| { kind: ByteKind; unit: "bytes"; limit: number; observed: number }
			| undefined;
		const getter = vi.fn(() => {
			throw new Error(privateMessage);
		});
		const request = vi
			.spyOn(NodeNetworkTransport.prototype, "request")
			.mockImplementation(async () => {
				const { error, limit, observed } = await actualFailure(kind);
				expected = { kind, unit: "bytes", limit, observed };
				measured = resourceLimitDiagnostic(error);
				if (!(error instanceof AgentBrowserError))
					throw new Error("Expected actual consumer failure.");
				Object.assign(error, {
					message: privateMessage,
					url: privateUrl,
					headers: { authorization: privateHeader },
					body: Buffer.from(privateBody),
				});
				Object.defineProperty(error, "resourceLimit", { get: getter });
				throw error;
			});
		const report = await researchNavigation(
			fixtureUrl,
			false,
			undefined,
			undefined,
			true,
		);
		expect(request).toHaveBeenCalledOnce();
		expect(expected).toBeDefined();
		expect(report.failure).toEqual({
			category: "resource-limit",
			stage: "network",
			resourceLimit: expected,
		});
		expect(measured).toBeDefined();
		expect(measured).toEqual(expected);
		expect(report.failure?.resourceLimit).toBe(measured);
		expect(report.outcome).toBe("failure");
		expect(report.contentSuccess).toBe(false);
		expect(report.partial).toBe(true);
		expect(report.primaryResponse).toBeNull();
		expect(report.bodyCapture).toBeUndefined();
		expect(report.extraction).toBeUndefined();
		expect(report.metrics?.closed).toBe(true);
		const serialized = JSON.stringify(report);
		expect(JSON.parse(serialized).failure).toEqual({
			category: "resource-limit",
			stage: "network",
			resourceLimit: measured,
		});
		for (const secret of [
			privateMessage,
			privateUrl,
			privateHeader,
			privateBody,
		])
			expect(serialized).not.toContain(secret);
		expect(getter).not.toHaveBeenCalled();
	},
);

it("synthetic navigation ignores forged metadata on an untrusted replacement of an actual consumer failure", async () => {
	const getter = vi.fn(() => {
		throw new Error(privateMessage);
	});
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockImplementation(
		async () => {
			const { limit, observed } = await actualFailure(
				"network.response-encoded",
			);
			const forged = new AgentBrowserError("resource-limit", privateMessage);
			Object.defineProperty(forged, "resourceLimit", { get: getter });
			Object.assign(forged, {
				kind: "network.response-encoded",
				unit: "bytes",
				limit,
				observed,
			});
			throw forged;
		},
	);
	const report = await researchNavigation(
		fixtureUrl,
		false,
		undefined,
		undefined,
		true,
	);
	expect(report.failure).toEqual({
		category: "resource-limit",
		stage: "network",
	});
	expect(report.primaryResponse).toBeNull();
	expect(report.bodyCapture).toBeUndefined();
	expect(report.extraction).toBeUndefined();
	expect(report.metrics?.closed).toBe(true);
	expect(JSON.stringify(report)).not.toContain(privateMessage);
	expect(getter).not.toHaveBeenCalled();
});
