import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	parseResearchSourceIndexArguments,
	researchSourceIndexCliLimits,
	runResearchSourceIndexCli,
} from "../scripts/research-source-index.js";
import { AgentBrowserError } from "./errors.js";
import * as sourceSearch from "./source-search-index.js";

const url = "https://source.fixture.invalid/searchindex.js";
const streams: Array<Readable | Writable> = [];

function source(fields: Record<string, unknown> = {}): string {
	return `Search.setIndex(${JSON.stringify({
		docnames: ["guide/intro", "library/socket", "howto/network", "unmatched"],
		titles: ["Introduction", "Socket API", "Python networking", "Other"],
		terms: { python: [0, 1, 2], socket: [1, 2] },
		titleterms: { python: [2], socket: [0] },
		...fields,
	})});`;
}

function hash(body: string | Uint8Array): string {
	return createHash("sha256").update(body).digest("hex");
}

function args(body: string | Uint8Array = source()): string[] {
	return [
		"--url",
		url,
		"--content-type",
		"application/javascript; charset=utf-8",
		"--sha256",
		hash(body),
		"--term",
		"python",
	];
}

function replace(flag: string, value: string): string[] {
	const result = args();
	result[result.indexOf(flag) + 1] = value;
	return result;
}

function retain<Stream extends Readable | Writable>(stream: Stream): Stream {
	stream.on("error", () => undefined);
	streams.push(stream);
	return stream;
}

function capture(body: string | Uint8Array = source()) {
	const bytes = Buffer.from(body);
	const input = retain(
		Readable.from([bytes.subarray(0, 11), bytes.subarray(11)], {
			objectMode: false,
			autoDestroy: false,
		}),
	);
	const chunks: Buffer[] = [];
	const output = retain(
		new Writable({
			autoDestroy: false,
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			},
		}),
	);
	return { input, output, text: () => Buffer.concat(chunks).toString("utf8") };
}

function idleInput(): Readable {
	return retain(new Readable({ read() {}, autoDestroy: false }));
}

function listeners(stream: Readable | Writable) {
	return ["data", "end", "error", "close", "finish", "drain"].map((event) =>
		stream.listeners(event),
	);
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Network is forbidden in source index research");
		}),
	);
});

afterEach(() => {
	expect(globalThis.fetch).not.toHaveBeenCalled();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	for (const stream of streams.splice(0)) stream.destroy();
});

it("exposes frozen limits and parses explicit metadata with conservative defaults", () => {
	expect(Object.isFrozen(researchSourceIndexCliLimits)).toBe(true);
	expect(researchSourceIndexCliLimits).toMatchObject({
		maxInputBytes: 2_000_000,
		maxLongInputBytes: 4_000_000,
		maxInputChunks: 65_536,
		maxOutputBytes: 256_000,
		timeoutMs: 30_000,
	});
	expect(
		parseResearchSourceIndexArguments(
			replace("--sha256", hash(source()).toUpperCase()),
		),
	).toEqual({
		url,
		contentType: "application/javascript; charset=utf-8",
		sha256: hash(source()),
		terms: ["python"],
		profile: "default",
		limit: 20,
	});
});

it("accepts eight distinct literal terms, either profile, and result limit endpoints", () => {
	const terms = [
		"Python",
		"python",
		"a/b",
		"a~b",
		"two words",
		"[]",
		"界",
		"x".repeat(128),
	];
	for (const profile of ["default", "long-v1"]) {
		for (const limit of ["1", "100"]) {
			const value = [
				...args().slice(0, 6),
				...terms.flatMap((term) => ["--term", term]),
				"--limit",
				limit,
				"--profile",
				profile,
			];
			expect(parseResearchSourceIndexArguments(value)).toMatchObject({
				terms,
				profile,
				limit: Number(limit),
			});
		}
	}
});

it.each([
	"application/javascript",
	"text/javascript",
	"APPLICATION/JAVASCRIPT; CHARSET=UTF-8",
	'text/javascript; charset="utf-8"',
	" text/javascript ; charset = utf8 ",
])("accepts only a JavaScript MIME with optional UTF8 charset: %s", (mime) => {
	expect(
		parseResearchSourceIndexArguments(replace("--content-type", mime))
			.contentType,
	).toBe(mime);
});

it.each([
	["--content-type", "text/html"],
	["--content-type", "application/x-javascript"],
	["--content-type", "application/json"],
	["--content-type", "text/javascript; charset=windows-1252"],
	["--content-type", "text/javascript; charset=utf-16"],
	["--content-type", "text/javascript; charset=utf-8; charset=utf-8"],
	["--content-type", "text/javascript; version=1"],
	["--content-type", "text/javascript,"],
	["--content-type", "text/javascript;"],
	["--content-type", 'text/javascript; charset="utf-8'],
	["--content-type", "text/javascript\t"],
	["--content-type", `text/javascript${" ".repeat(1024)}`],
	["--sha256", "a".repeat(63)],
	["--sha256", "a".repeat(65)],
	["--sha256", "g".repeat(64)],
	["--sha256", ` ${"a".repeat(64)}`],
	["--sha256", `${"a".repeat(64)}\n`],
	["--term", ""],
	["--term", "x".repeat(129)],
	["--term", "secret\nvalue"],
	["--term", "secret\u0000value"],
	["--term", "secret\u007fvalue"],
	["--term", "secret\u0085value"],
	["--term", "secret\u202evalue"],
])("rejects invalid %s metadata without reflecting it", (flag, value) => {
	expect(() => parseResearchSourceIndexArguments(replace(flag, value))).toThrow(
		"Invalid research source index arguments",
	);
});

it.each([
	"http://source.fixture.invalid/searchindex.js",
	"https://USER:SECRET@source.fixture.invalid/searchindex.js",
	"https://source.fixture.invalid/searchindex.js?secret=value",
	"https://source.fixture.invalid/searchindex.js?",
	"https://source.fixture.invalid/searchindex.js#secret",
	"https://source.fixture.invalid/searchindex.js#",
	"https://SOURCE.fixture.invalid/searchindex.js",
	"https://source.fixture.invalid:443/searchindex.js",
	"https://source.fixture.invalid",
	"https://source.fixture.invalid/a/../searchindex.js",
	"https://source.fixture.invalid/secret\nvalue",
	"https://localhost/searchindex.js",
	"https://name.localhost/searchindex.js",
	"https://name.local/searchindex.js",
	"https://name.internal/searchindex.js",
	"https://intranet/searchindex.js",
	"https://127.0.0.1/searchindex.js",
	"https://10.0.0.1/searchindex.js",
	"https://169.254.169.254/searchindex.js",
	"https://[::1]/searchindex.js",
	"https://[fc00::1]/searchindex.js",
	"https://source.fixture.invalid:25/searchindex.js",
	`https://source.fixture.invalid/${"x".repeat(8192)}`,
])("rejects noncanonical or nonpublic source URL %s", (value) => {
	expect(() =>
		parseResearchSourceIndexArguments(replace("--url", value)),
	).toThrow("Invalid research source index arguments");
});

it.each([
	"https://8.8.8.8/searchindex.js",
	"https://[2001:4860:4860::8888]/searchindex.js",
	"https://source.fixture.invalid:8443/path%20name.js",
])("admits canonical public URL syntax without resolving %s", (value) => {
	expect(parseResearchSourceIndexArguments(replace("--url", value)).url).toBe(
		value,
	);
});

it.each([
	"",
	"0",
	"101",
	"01",
	"1.0",
	"1e1",
	"-1",
	"+1",
	"NaN",
	"Infinity",
	" 1",
])("rejects noncanonical result limit %s", (value) => {
	expect(() =>
		parseResearchSourceIndexArguments([...args(), "--limit", value]),
	).toThrow("Invalid research source index arguments");
});

it("rejects missing, duplicate, unknown, sparse, oversized and nonstring arguments", () => {
	const sparse = args();
	Reflect.deleteProperty(sparse, "1");
	const invalid: unknown[] = [
		null,
		{},
		[],
		["--help", "extra"],
		args().slice(0, 6),
		args().slice(2),
		args().slice(0, -1),
		[...args(), "--unknown", "secret"],
		[...args(), "--profile", "long"],
		[
			...args(),
			...Array.from({ length: 8 }, () => ["--term", "python"]).flat(),
		],
		[
			...args(),
			...Array.from({ length: 8 }, (_, index) => [
				"--term",
				String(index),
			]).flat(),
		],
		[...args(), "--profile", "default", "--profile", "long-v1"],
		[...args(), "--limit", "1", "--limit", "2"],
		[...args(), "--url", url],
		[...args(), "--content-type", "text/javascript"],
		[...args(), "--sha256", hash(source())],
		[...args(), "x".repeat(8193), "secret"],
		[...args(), "--term", 42],
		sparse,
	];
	for (const value of invalid) {
		expect(() => parseResearchSourceIndexArguments(value as string[])).toThrow(
			"Invalid research source index arguments",
		);
	}
});

it("accepts eight raw duplicate terms and lets the query count them once", async () => {
	const body = source();
	const target = capture(body);
	const repeated = [
		...args(body),
		...Array.from({ length: 7 }, () => ["--term", "python"]).flat(),
	];
	expect(parseResearchSourceIndexArguments(repeated).terms).toEqual(
		Array(8).fill("python"),
	);
	await expect(
		runResearchSourceIndexCli(repeated, target.input, target.output),
	).resolves.toBe(0);
	const query = JSON.parse(target.text()).query;
	expect(query).toEqual(sourceSearch.searchSourceIndex(body, ["python"]));
	expect(query.terms).toEqual(["python"]);
});

it("serializes useful literal query results without inventing document URLs or verification", async () => {
	const body = source();
	const target = capture(body);
	const query = sourceSearch.searchSourceIndex(body, ["python", "socket"], {
		limit: 2,
	});
	const inputListeners = listeners(target.input);
	const outputListeners = listeners(target.output);
	await expect(
		runResearchSourceIndexCli(
			[...args(body), "--term", "socket", "--limit", "2"],
			target.input,
			target.output,
		),
	).resolves.toBe(0);
	expect(target.text().split("\n")).toHaveLength(2);
	expect(JSON.parse(target.text())).toEqual({
		kind: "source-index-research-v1",
		partial: true,
		rendered: false,
		verified: false,
		scope: "source-index",
		source: {
			url,
			contentType: "application/javascript; charset=utf-8",
			sha256: hash(body),
			decodedBytes: Buffer.byteLength(body),
		},
		query,
		networkRequests: 0,
	});
	expect(target.text()).toContain("guide/intro");
	expect(target.text()).toContain("howto/network");
	expect(target.text()).not.toContain("unmatched");
	expect(target.text().match(/https:\/\//g)).toHaveLength(1);
	expect(listeners(target.input)).toEqual(inputListeners);
	expect(listeners(target.output)).toEqual(outputListeners);
	expect(target.input.destroyed).toBe(false);
	expect(target.output.destroyed).toBe(false);
	expect(target.output.writableEnded).toBe(false);
});

it("preserves UTF8 split across chunks and measures bytes, not code units", async () => {
	const body = source({ titles: ["導入", "ソケット", "🐍", "Other"] });
	const bytes = Buffer.from(body);
	const target = capture();
	const input = retain(
		Readable.from(
			Array.from(bytes, (byte) => Buffer.from([byte])),
			{ objectMode: false, autoDestroy: false },
		),
	);
	await runResearchSourceIndexCli(args(body), input, target.output);
	const record = JSON.parse(target.text());
	expect(record.source.decodedBytes).toBe(bytes.length);
	expect(record.source.decodedBytes).toBeGreaterThan(body.length);
	expect(record.query).toEqual(
		sourceSearch.searchSourceIndex(body, ["python"]),
	);
});

it("checks the raw-byte digest before decoding or querying", async () => {
	const target = capture(Buffer.from([0xff]));
	const decode = vi.spyOn(TextDecoder.prototype, "decode");
	const search = vi.spyOn(sourceSearch, "searchSourceIndex");
	await expect(
		runResearchSourceIndexCli(args(), target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(decode).not.toHaveBeenCalled();
	expect(search).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
});

it("preserves a leading UTF8 BOM so the source envelope rejects it", async () => {
	const body = Buffer.from(`\uFEFF${source()}`);
	const target = capture(body);
	const search = vi.spyOn(sourceSearch, "searchSourceIndex");
	await expect(
		runResearchSourceIndexCli(args(body), target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(search).toHaveBeenCalledTimes(1);
	expect(search.mock.calls[0][0]).toBe(`\uFEFF${source()}`);
	expect(target.text()).toBe("");
});

it.each([
	[[0xff]],
	[[0xc0, 0xaf]],
	[[0xe2, 0x82]],
	[[0xed, 0xa0, 0x80]],
	[[0xf4, 0x90, 0x80, 0x80]],
])(
	"fatally rejects invalid UTF8 bytes %j even with a matching digest",
	async (bytes) => {
		const body = Buffer.from(bytes);
		const target = capture(body);
		const search = vi.spyOn(sourceSearch, "searchSourceIndex");
		await expect(
			runResearchSourceIndexCli(args(body), target.input, target.output),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(search).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
	},
);

it.each([
	"",
	"<html>Not a successful index response</html>",
	"throw new Error('secret');",
	`${source()}globalThis.secret = true;`,
	'Search.setIndex({"docnames":[],"titles":[],"terms":{},"titleterms":{},"secret":undefined})',
	source({ terms: { python: [-1] } }),
	source({ titles: [] }),
])("emits nothing for a failed source query", async (body) => {
	const target = capture(body);
	await expect(
		runResearchSourceIndexCli(args(body), target.input, target.output),
	).rejects.toMatchObject({
		message: "Research source index operation failed",
	});
	expect(target.text()).toBe("");
});

it("shows help without consuming, allocating or attaching input listeners", async () => {
	const input = idleInput();
	const target = capture();
	const before = listeners(input);
	const read = vi.spyOn(input, "resume");
	const allocation = vi.spyOn(Buffer, "alloc");
	await expect(
		runResearchSourceIndexCli(["--help"], input, target.output),
	).resolves.toBe(0);
	expect(target.text()).toContain("Usage: research-source-index");
	expect(target.text()).toContain("not proof of successful HTTP retrieval");
	expect(read).not.toHaveBeenCalled();
	expect(allocation).not.toHaveBeenCalled();
	expect(listeners(input)).toEqual(before);
});

it("rejects bad arguments before reading or writing", async () => {
	const target = capture();
	const resume = vi.spyOn(target.input, "resume");
	await expect(
		runResearchSourceIndexCli(
			replace("--term", "secret\nvalue"),
			target.input,
			target.output,
		),
	).rejects.toMatchObject({
		code: "invalid-input",
		message: "Invalid research source index arguments",
	});
	expect(resume).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
});

it("resumes a caller-paused input and leaves caller streams open", async () => {
	const target = capture();
	target.input.pause();
	expect(target.input.isPaused()).toBe(true);
	await expect(
		runResearchSourceIndexCli(args(), target.input, target.output),
	).resolves.toBe(0);
	expect(target.input.readableFlowing).toBe(false);
	expect(target.input.destroyed).toBe(false);
	expect(target.output.writableEnded).toBe(false);
});

it.each(["default", "long-v1"] as const)(
	"enforces the %s byte ceiling before decoding",
	async (profile) => {
		const limit =
			profile === "default"
				? researchSourceIndexCliLimits.maxInputBytes
				: researchSourceIndexCliLimits.maxLongInputBytes;
		const body = Buffer.alloc(limit + 1, 32);
		const target = capture(body);
		const search = vi.spyOn(sourceSearch, "searchSourceIndex");
		await expect(
			runResearchSourceIndexCli(
				[...args(body), "--profile", profile],
				target.input,
				target.output,
			),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(search).not.toHaveBeenCalled();
		expect(target.text()).toBe("");
	},
);

it.each(["default", "long-v1"] as const)(
	"accepts exactly the %s byte ceiling with explicit profile selection",
	async (profile) => {
		const limit =
			profile === "default"
				? researchSourceIndexCliLimits.maxInputBytes
				: researchSourceIndexCliLimits.maxLongInputBytes;
		const body = source().padEnd(limit, " ");
		const target = capture(body);
		await expect(
			runResearchSourceIndexCli(
				[...args(body), "--profile", profile],
				target.input,
				target.output,
			),
		).resolves.toBe(0);
		expect(JSON.parse(target.text()).source.decodedBytes).toBe(limit);
		expect(JSON.parse(target.text()).query).toEqual(
			sourceSearch.searchSourceIndex(body, ["python"], { profile }),
		);
	},
);

it("does not silently promote an oversized default body to long-v1", async () => {
	const body = source().padEnd(
		researchSourceIndexCliLimits.maxInputBytes + 1,
		" ",
	);
	const target = capture(body);
	await expect(
		runResearchSourceIndexCli(args(body), target.input, target.output),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(target.text()).toBe("");
});

it("caps output by UTF8 bytes before the first write", async () => {
	const docnames = Array.from(
		{ length: 30 },
		(_, index) => `document-${index}`,
	);
	const body = source({
		docnames,
		titles: docnames.map(() => "界".repeat(4096)),
		terms: { python: docnames.map((_, index) => index) },
		titleterms: {},
	});
	const target = capture(body);
	await expect(
		runResearchSourceIndexCli(
			[...args(body), "--limit", "100"],
			target.input,
			target.output,
		),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(target.text()).toBe("");
});

it("caps input chunks even when they contain no bytes", async () => {
	const target = capture();
	const input = retain(
		Readable.from(
			Array.from(
				{ length: researchSourceIndexCliLimits.maxInputChunks + 1 },
				() => Buffer.alloc(0),
			),
			{ objectMode: true, autoDestroy: false },
		),
	);
	await expect(
		runResearchSourceIndexCli(args(""), input, target.output),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(target.text()).toBe("");
	expect(input.readableFlowing).toBe(false);
});

it.each([
	"secret string chunk",
	{ secret: true },
	new Uint16Array([1]),
	new DataView(new ArrayBuffer(1)),
	new Uint8Array(new SharedArrayBuffer(1)),
])(
	"rejects non-raw or shared input chunks without reflection",
	async (chunk) => {
		const target = capture();
		const input = retain(
			Readable.from([chunk], { objectMode: true, autoDestroy: false }),
		);
		await expect(
			runResearchSourceIndexCli(args(), input, target.output),
		).rejects.toMatchObject({
			code: "invalid-input",
			message: "Research source index operation failed",
		});
		expect(target.text()).toBe("");
	},
);

it("rejects a stream whose encoding has already converted bytes to strings", async () => {
	const target = capture();
	target.input.setEncoding("utf8");
	await expect(
		runResearchSourceIndexCli(args(), target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.text()).toBe("");
});

it.each(["input", "output"])(
	"rejects an already closed %s without consuming data",
	async (side) => {
		const target = capture();
		const stream = side === "input" ? target.input : target.output;
		stream.destroy();
		await new Promise<void>((resolve) => stream.once("close", resolve));
		await expect(
			runResearchSourceIndexCli(args(), target.input, target.output),
		).rejects.toMatchObject({ code: "closed" });
		expect(target.text()).toBe("");
	},
);

it("settles an already ended input rather than waiting for another end event", async () => {
	const input = idleInput();
	input.push(null);
	input.resume();
	await new Promise<void>((resolve) => input.once("end", resolve));
	const target = capture();
	await expect(
		runResearchSourceIndexCli(args(""), input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.text()).toBe("");
});

it.each([
	"abort",
	"input-error",
	"input-close",
	"output-error",
	"output-close",
	"output-finish",
])(
	"cancels an idle read on %s and removes only owned listeners",
	async (event) => {
		const input = idleInput();
		const target = capture();
		const inputListeners = listeners(input);
		const outputListeners = listeners(target.output);
		const controller = new AbortController();
		const pending = runResearchSourceIndexCli(
			args(),
			input,
			target.output,
			controller.signal,
		);
		const rejected = expect(pending).rejects.toMatchObject({
			code: event === "abort" ? "aborted" : "closed",
			message: "Research source index operation failed",
		});
		if (event === "abort") controller.abort(new Error("secret term/body/url"));
		else if (event === "input-error")
			input.emit("error", new Error("secret input"));
		else if (event === "input-close") input.emit("close");
		else if (event === "output-error")
			target.output.emit("error", new Error("secret output"));
		else if (event === "output-close") target.output.emit("close");
		else target.output.emit("finish");
		await rejected;
		expect(target.text()).toBe("");
		expect(listeners(input)).toEqual(inputListeners);
		expect(listeners(target.output)).toEqual(outputListeners);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		expect(input.destroyed).toBe(false);
		expect(target.output.destroyed).toBe(false);
		expect(target.output.writableEnded).toBe(false);
	},
);

it("rejects pre-aborted work without reading or writing", async () => {
	const target = capture();
	const controller = new AbortController();
	controller.abort(new AgentBrowserError("policy-denied", "secret reason"));
	const resume = vi.spyOn(target.input, "resume");
	await expect(
		runResearchSourceIndexCli(
			args(),
			target.input,
			target.output,
			controller.signal,
		),
	).rejects.toMatchObject({
		code: "aborted",
		message: "Research source index operation failed",
	});
	expect(resume).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
});

it("times out stalled input and clears owned bytes without altering caller bytes", async () => {
	vi.useFakeTimers();
	const input = idleInput();
	const target = capture();
	const allocation = vi.spyOn(Buffer, "alloc");
	const pending = runResearchSourceIndexCli(args(), input, target.output);
	const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
	const bytes = Buffer.from("secret");
	input.emit("data", bytes);
	await vi.advanceTimersByTimeAsync(researchSourceIndexCliLimits.timeoutMs);
	await rejected;
	const owned = allocation.mock.results[0].value as Buffer;
	expect(owned.every((byte) => byte === 0)).toBe(true);
	expect(bytes.toString()).toBe("secret");
	expect(target.text()).toBe("");
	expect(vi.getTimerCount()).toBe(0);
});

it("checks monotonic time during synchronous input delivery", async () => {
	let now = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const input = idleInput();
	const target = capture();
	const pending = runResearchSourceIndexCli(args(), input, target.output);
	const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
	now = researchSourceIndexCliLimits.timeoutMs;
	input.emit("data", Buffer.from("secret"));
	await rejected;
	expect(target.text()).toBe("");
});

it.each(["abort", "timeout"])(
	"propagates %s through the source query CPU checkpoint",
	async (stop) => {
		let now = 0;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const controller = new AbortController();
		const target = capture();
		vi.spyOn(sourceSearch, "searchSourceIndex").mockImplementationOnce(
			(_body, _terms, options) => {
				if (stop === "abort") controller.abort("secret");
				else now = researchSourceIndexCliLimits.timeoutMs;
				options?.checkpoint?.();
				throw new Error("Checkpoint failed to stop work");
			},
		);
		await expect(
			runResearchSourceIndexCli(
				args(),
				target.input,
				target.output,
				controller.signal,
			),
		).rejects.toMatchObject({ code: stop === "abort" ? "aborted" : "timeout" });
		expect(target.text()).toBe("");
	},
);

it("clears owned input before querying and redacts arbitrary core failures", async () => {
	const body = Buffer.from(source());
	const target = capture(body);
	const allocation = vi.spyOn(Buffer, "alloc");
	let clearedBeforeQuery = false;
	vi.spyOn(sourceSearch, "searchSourceIndex").mockImplementationOnce(() => {
		const owned = allocation.mock.results[0].value as Buffer;
		clearedBeforeQuery = owned.every((byte) => byte === 0);
		throw new Error("secret term, body, https://user:secret@example.invalid/");
	});
	await expect(
		runResearchSourceIndexCli(args(body), target.input, target.output),
	).rejects.toMatchObject({
		code: "invalid-input",
		message: "Research source index operation failed",
	});
	expect(clearedBeforeQuery).toBe(true);
	expect(body.toString()).toBe(source());
	expect(target.text()).toBe("");
});

it("waits for the writable callback and real backpressure without ending output", async () => {
	const target = capture();
	let acknowledge: (() => void) | undefined;
	let began: (() => void) | undefined;
	const writing = new Promise<void>((resolve) => {
		began = resolve;
	});
	const output = retain(
		new Writable({
			highWaterMark: 1,
			autoDestroy: false,
			write(_chunk, _encoding, callback) {
				acknowledge = callback;
				began?.();
			},
		}),
	);
	const before = listeners(output);
	let completed = false;
	const pending = runResearchSourceIndexCli(args(), target.input, output).then(
		(code) => {
			completed = true;
			return code;
		},
	);
	await writing;
	expect(completed).toBe(false);
	expect(output.writableNeedDrain).toBe(true);
	acknowledge?.();
	await expect(pending).resolves.toBe(0);
	expect(listeners(output)).toEqual(before);
	expect(output.destroyed).toBe(false);
	expect(output.writableEnded).toBe(false);
});

it.each(["callback-first", "drain-first"])(
	"requires both callback and drain when %s",
	async (order) => {
		const target = capture();
		let acknowledge: (() => void) | undefined;
		let began: (() => void) | undefined;
		const writing = new Promise<void>((resolve) => {
			began = resolve;
		});
		vi.spyOn(target.output, "write").mockImplementation(((
			_text: unknown,
			callback: () => void,
		) => {
			acknowledge = callback;
			began?.();
			return false;
		}) as typeof target.output.write);
		let completed = false;
		const pending = runResearchSourceIndexCli(
			args(),
			target.input,
			target.output,
		).then((code) => {
			completed = true;
			return code;
		});
		await writing;
		if (order === "callback-first") acknowledge?.();
		else target.output.emit("drain");
		await Promise.resolve();
		expect(completed).toBe(false);
		if (order === "callback-first") target.output.emit("drain");
		else acknowledge?.();
		await expect(pending).resolves.toBe(0);
	},
);

it.each(["abort", "timeout", "error", "close", "finish"])(
	"settles a stalled output on %s with listener cleanup",
	async (event) => {
		vi.useFakeTimers();
		const target = capture();
		const controller = new AbortController();
		let acknowledge: (() => void) | undefined;
		let began: (() => void) | undefined;
		const writing = new Promise<void>((resolve) => {
			began = resolve;
		});
		const output = retain(
			new Writable({
				highWaterMark: 1,
				autoDestroy: false,
				write(_chunk, _encoding, callback) {
					acknowledge = callback;
					began?.();
				},
			}),
		);
		const before = listeners(output);
		const pending = runResearchSourceIndexCli(
			args(),
			target.input,
			output,
			controller.signal,
		);
		const rejected = expect(pending).rejects.toMatchObject({
			code:
				event === "abort"
					? "aborted"
					: event === "timeout"
						? "timeout"
						: "closed",
			message: "Research source index operation failed",
		});
		await writing;
		if (event === "abort") controller.abort("secret");
		else if (event === "timeout")
			await vi.advanceTimersByTimeAsync(researchSourceIndexCliLimits.timeoutMs);
		else if (event === "error") output.emit("error", new Error("secret"));
		else output.emit(event);
		await rejected;
		expect(output.listenerCount("error")).toBe(before[2].length + 1);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		expect(output.destroyed).toBe(false);
		expect(output.writableEnded).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		acknowledge?.();
		expect(listeners(output)).toEqual(before);
	},
);

it("cancels while waiting only for drain after acknowledgement", async () => {
	const target = capture();
	const controller = new AbortController();
	let began: (() => void) | undefined;
	const writing = new Promise<void>((resolve) => {
		began = resolve;
	});
	vi.spyOn(target.output, "write").mockImplementation(((
		_text: unknown,
		callback: () => void,
	) => {
		callback();
		began?.();
		return false;
	}) as typeof target.output.write);
	const before = listeners(target.output);
	const pending = runResearchSourceIndexCli(
		args(),
		target.input,
		target.output,
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await writing;
	controller.abort();
	await rejected;
	expect(listeners(target.output)).toEqual(before);
});

it("sanitizes writable callback failures without leaking listeners", async () => {
	const target = capture();
	const output = retain(
		new Writable({
			autoDestroy: false,
			write(_chunk, _encoding, callback) {
				callback(new Error("secret output detail"));
			},
		}),
	);
	const before = listeners(output);
	await expect(
		runResearchSourceIndexCli(args(), target.input, output),
	).rejects.toMatchObject({
		code: "closed",
		message: "Research source index operation failed",
	});
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(listeners(output)).toEqual(before);
	expect(output.destroyed).toBe(false);
});

it("sanitizes synchronous write exceptions", async () => {
	const target = capture();
	const before = listeners(target.output);
	vi.spyOn(target.output, "write").mockImplementation(() => {
		throw new Error("secret synchronous output detail");
	});
	await expect(
		runResearchSourceIndexCli(args(), target.input, target.output),
	).rejects.toMatchObject({
		code: "closed",
		message: "Research source index operation failed",
	});
	expect(listeners(target.output)).toEqual(before);
	expect(target.text()).toBe("");
});

it.each([false, true])(
	"handles a late failed callback after cancellation without a caller error guard (autoDestroy %s)",
	async (autoDestroy) => {
		const input = idleInput();
		const controller = new AbortController();
		let acknowledge: ((error?: Error | null) => void) | undefined;
		let began: (() => void) | undefined;
		const writing = new Promise<void>((resolve) => {
			began = resolve;
		});
		const output = new Writable({
			autoDestroy,
			write(_chunk, _encoding, callback) {
				acknowledge = callback;
				began?.();
			},
		});
		streams.push(output);
		const pending = runResearchSourceIndexCli(
			["--help"],
			input,
			output,
			controller.signal,
		);
		const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
		await writing;
		controller.abort();
		await rejected;
		try {
			expect(output.listenerCount("error")).toBe(1);
		} catch (error) {
			acknowledge?.();
			throw error;
		}
		acknowledge?.(new Error("late operation error"));
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(output.listenerCount("error")).toBe(0);
		expect(output.listenerCount("close")).toBe(0);
	},
);

it("releases a cancelled pending-write guard when the caller destroys the stream", async () => {
	const input = idleInput();
	const controller = new AbortController();
	let began: (() => void) | undefined;
	const writing = new Promise<void>((resolve) => {
		began = resolve;
	});
	const output = new Writable({
		write() {
			began?.();
		},
	});
	streams.push(output);
	const pending = runResearchSourceIndexCli(
		["--help"],
		input,
		output,
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await writing;
	controller.abort();
	await rejected;
	expect(output.listenerCount("error")).toBe(1);
	output.destroy();
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(output.listenerCount("error")).toBe(0);
	expect(output.listenerCount("close")).toBe(0);
});

it.each([false, true])(
	"retains error protection through asynchronous destruction (abort first %s)",
	async (abortFirst) => {
		const input = idleInput();
		const controller = new AbortController();
		let acknowledge: ((error?: Error | null) => void) | undefined;
		let completeDestroy: (() => void) | undefined;
		let began: (() => void) | undefined;
		const writing = new Promise<void>((resolve) => {
			began = resolve;
		});
		const output = new Writable({
			autoDestroy: true,
			write(_chunk, _encoding, callback) {
				acknowledge = callback;
				began?.();
			},
			destroy(error, callback) {
				completeDestroy = () => callback(error);
			},
		});
		streams.push(output);
		const pending = runResearchSourceIndexCli(
			["--help"],
			input,
			output,
			controller.signal,
		);
		const rejected = expect(pending).rejects.toMatchObject({
			code: abortFirst ? "aborted" : "closed",
		});
		await writing;
		if (abortFirst) {
			controller.abort();
			await rejected;
		}
		acknowledge?.(new Error("asynchronous destroy error"));
		await rejected;
		await new Promise<void>((resolve) => setImmediate(resolve));
		try {
			expect(output.destroyed).toBe(true);
			expect(output.closed).toBe(false);
			expect(output.listenerCount("error")).toBe(1);
		} catch (error) {
			output.once("error", () => undefined);
			completeDestroy?.();
			throw error;
		}
		completeDestroy?.();
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(output.closed).toBe(true);
		expect(output.listenerCount("error")).toBe(0);
		expect(output.listenerCount("close")).toBe(0);
	},
);
