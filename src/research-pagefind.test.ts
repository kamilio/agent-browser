import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { Readable, Writable } from "node:stream";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	parseResearchPagefindArguments,
	researchPagefindCliLimits,
	runResearchPagefindCli,
} from "../scripts/research-pagefind.js";
import { researchOutputFailureGraceMs } from "../scripts/research-stream-output.js";
import { AgentBrowserError } from "./errors.js";

type CborFixture = string | number | CborFixture[];
type BodyFixture = { url: string; data: string };
type HashedBodyFixture = BodyFixture & { hash: string };
type BundleFixture = {
	version: number;
	metadata: BodyFixture;
	chunks: HashedBodyFixture[];
	fragments: HashedBodyFixture[];
};

const baseUrl = "https://site.fixture.invalid/pagefind/";
const signature = Buffer.from("pagefind_dcd", "ascii");
const streams: Array<Readable | Writable> = [];

function cborArgument(major: number, value: number): Buffer {
	if (value < 24) return Buffer.from([(major << 5) | value]);
	if (value <= 255) return Buffer.from([(major << 5) | 24, value]);
	const bytes = Buffer.alloc(3);
	bytes[0] = (major << 5) | 25;
	bytes.writeUInt16BE(value, 1);
	return bytes;
}

function encode(value: CborFixture): Buffer {
	if (Array.isArray(value))
		return Buffer.concat([cborArgument(4, value.length), ...value.map(encode)]);
	if (typeof value === "string") {
		const bytes = Buffer.from(value);
		return Buffer.concat([cborArgument(3, bytes.length), bytes]);
	}
	return cborArgument(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
}

function sourceBody(payload: Buffer, compressed = false): Buffer {
	const body = Buffer.concat([signature, payload]);
	return compressed ? gzipSync(body) : body;
}

function metadata(documentCount = 2, chunkCount = 1): CborFixture[] {
	return [
		"1.5.2",
		Array.from({ length: documentCount }, (_, index) => [`en_doc${index}`, 3]),
		Array.from({ length: chunkCount }, (_, index) => [
			"a",
			"z",
			`en_chunk${index}`,
		]),
		[],
		[],
		[],
	];
}

function fragment(fields: Record<string, unknown> = {}): Buffer {
	return Buffer.from(
		JSON.stringify({
			url: "/doc.html",
			content: "actual source content",
			word_count: 3,
			filters: {},
			meta: { title: "Doc" },
			anchors: [],
			...fields,
		}),
	);
}

function bundle(compressed = false, withFragments = true): BundleFixture {
	const data = (payload: Buffer) =>
		sourceBody(payload, compressed).toString("base64");
	return {
		version: 1,
		metadata: {
			url: `${baseUrl}pagefind.en_meta.pf_meta`,
			data: data(encode(metadata())),
		},
		chunks: [
			{
				hash: "en_chunk0",
				url: `${baseUrl}index/en_chunk0.pf_index`,
				data: data(
					encode([
						[
							[
								"rebas",
								[
									[0, [-2, 1], []],
									[1, [2], []],
								],
								[],
							],
							["empty", [], []],
							["ratta", [], [["rätta", [[1, [0], []]]]]],
						],
					]),
				),
			},
		],
		fragments: withFragments
			? [
					{
						hash: "en_doc0",
						url: `${baseUrl}fragment/en_doc0.pf_fragment`,
						data: data(fragment()),
					},
				]
			: [],
	};
}

function hash(body: string | Uint8Array): string {
	return createHash("sha256").update(body).digest("hex");
}

function args(body: string | Uint8Array, terms = ["rebas"]): string[] {
	return ["--sha256", hash(body), ...terms.flatMap((term) => ["--term", term])];
}

function retain<Stream extends Readable | Writable>(stream: Stream): Stream {
	stream.on("error", () => undefined);
	streams.push(stream);
	return stream;
}

function capture(body: string | Uint8Array = JSON.stringify(bundle())) {
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

function listeners(stream: Readable | Writable) {
	return ["data", "end", "error", "close", "finish", "drain"].map((event) =>
		stream.listeners(event),
	);
}

async function query(value: BundleFixture, terms = ["rebas"], limit?: number) {
	const body = JSON.stringify(value);
	const target = capture(body);
	const flags = args(body, terms);
	if (limit !== undefined) flags.push("--limit", String(limit));
	await expect(
		runResearchPagefindCli(flags, target.input, target.output),
	).resolves.toBe(0);
	expect(target.text().endsWith("\n")).toBe(true);
	expect(target.text().trim().split("\n")).toHaveLength(1);
	return JSON.parse(target.text());
}

async function rejectsBody(body: string | Uint8Array, code = "invalid-input") {
	const target = capture(body);
	await expect(
		runResearchPagefindCli(args(body), target.input, target.output),
	).rejects.toMatchObject({ name: "AgentBrowserError", code });
	expect(target.text()).toBe("");
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Network is forbidden in Pagefind fixture tests");
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

it("exposes frozen CLI limits and parses a normalized digest with defaults", () => {
	expect(Object.isFrozen(researchPagefindCliLimits)).toBe(true);
	expect(researchPagefindCliLimits).toMatchObject({
		maxInputBytes: 2_000_000,
		maxInputChunks: 65_536,
		maxOutputBytes: 256_000,
		maxArgumentCount: 70,
		maxArgumentCodeUnits: 8192,
		maxTerms: 32,
		maxTermCodeUnits: 256,
		maxLimit: 100,
		defaultLimit: 20,
		timeoutMs: 30_000,
		failureExitTimeoutMs: researchOutputFailureGraceMs,
	});
	expect(
		parseResearchPagefindArguments([
			"--term",
			"Rebas",
			"--sha256",
			hash("fixture").toUpperCase(),
		]),
	).toEqual({ sha256: hash("fixture"), terms: ["Rebas"], limit: 20 });
});

it("preserves 32 distinct literal terms and accepts both result limit endpoints", () => {
	const terms = [
		"rebas",
		"Rebas",
		" two words ",
		"../literal",
		"rätta",
		"ratta",
		"界".repeat(256),
		...Array.from({ length: 25 }, (_, index) => `term${index}`),
	];
	for (const limit of [1, 100])
		expect(
			parseResearchPagefindArguments([
				...args("fixture", terms),
				"--limit",
				String(limit),
			]),
		).toEqual({ sha256: hash("fixture"), terms, limit });
});

it("rejects missing, duplicate, unknown and malformed flags", () => {
	const valid = args("fixture");
	for (const invalid of [
		[],
		["--sha256", hash("fixture")],
		["--term", "rebas"],
		[...valid, "--term"],
		[...valid, "--sha256", hash("fixture")],
		[...valid, "--term", "rebas"],
		[...valid, "--limit", "1", "--limit", "2"],
		[...valid, "--profile", "default"],
		[...valid, "--url", baseUrl],
		[...valid, "--content-type", "application/json"],
		["--help", "extra"],
		[...valid, "--help"],
		...["", "0", "01", "101", "1.5", " 1", "1e1"].map((limit) => [
			...valid,
			"--limit",
			limit,
		]),
		...["a".repeat(63), "a".repeat(65), "g".repeat(64)].map((digest) => [
			"--sha256",
			digest,
			"--term",
			"rebas",
		]),
	])
		expect(() => parseResearchPagefindArguments(invalid)).toThrowError(
			expect.objectContaining({
				name: "AgentBrowserError",
				code: "invalid-input",
			}),
		);
});

it("rejects empty, control, format and oversized terms and argument collections", () => {
	for (const terms of [
		[""],
		["line\nbreak"],
		["tab\tterm"],
		["null\0term"],
		["hidden\u200bterm"],
		["direction\u202eterm"],
		["x".repeat(257)],
		["x".repeat(8193)],
		Array.from({ length: 33 }, (_, index) => `term${index}`),
		Array.from({ length: 35 }, (_, index) => `term${index}`),
	])
		expect(() =>
			parseResearchPagefindArguments(args("fixture", terms)),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	const sparse = args("fixture").slice(0, 3);
	sparse.length = 4;
	for (const invalid of [sparse, ["--sha256", hash("fixture"), "--term", 3]])
		expect(() =>
			parseResearchPagefindArguments(invalid as string[]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});

it("returns two document-ordered matches with optional source-only enrichment", async () => {
	const value = bundle();
	const result = await query(value);
	expect(result).toMatchObject({
		kind: "pagefind-source-research-v1",
		partial: true,
		rendered: false,
		verified: false,
		networkRequests: 0,
		source: {
			sha256: hash(JSON.stringify(value)),
			decodedBytes: Buffer.byteLength(JSON.stringify(value)),
		},
		query: {
			version: "1.5.2",
			scope: "supplied-chunks",
			matching: "literal-stored-term",
			ordering: "document-id",
			totalDocuments: 2,
			suppliedChunks: ["en_chunk0"],
			terms: ["rebas"],
			missingTerms: [],
			totalMatches: 2,
			truncated: false,
			unverified: true,
			results: [
				{
					documentId: 0,
					fragmentHash: "en_doc0",
					wordCount: 3,
					fragment: {
						reportedUrl: "/doc.html",
						title: "Doc",
						content: "actual source content",
						wordCount: 3,
						source: {
							url: value.fragments[0].url,
							sha256: hash(Buffer.from(value.fragments[0].data, "base64")),
							decodedBytes: Buffer.from(value.fragments[0].data, "base64")
								.length,
						},
					},
				},
				{ documentId: 1, fragmentHash: "en_doc1", wordCount: 3 },
			],
		},
	});
	expect(result.query.results[1]).not.toHaveProperty("fragment");
});

it("produces identical query evidence from raw and gzip index fixtures", async () => {
	const raw = await query(bundle(false, false));
	const compressed = await query(bundle(true, false));
	expect(compressed.query).toEqual(raw.query);
	expect(compressed.source.sha256).not.toBe(raw.source.sha256);
	const enriched = await query(bundle(true));
	expect(enriched.query.results[0].fragment).toMatchObject({
		reportedUrl: "/doc.html",
		content: "actual source content",
		wordCount: 3,
	});
});

it("distinguishes missing literals from stored empty postings without stemming", async () => {
	for (const term of ["rebase", "Rebas", "re", " rebas ", "RÄTTA"])
		expect((await query(bundle(), [term])).query).toMatchObject({
			missingTerms: [term],
			totalMatches: 0,
			results: [],
		});
	expect((await query(bundle(), ["empty"])).query).toMatchObject({
		missingTerms: [],
		totalMatches: 0,
		results: [],
	});
	expect((await query(bundle(), ["ratta"])).query).toMatchObject({
		missingTerms: [],
		totalMatches: 0,
		results: [],
	});
	expect((await query(bundle(), ["rätta"])).query).toMatchObject({
		missingTerms: [],
		totalMatches: 1,
		results: [{ documentId: 1, fragmentHash: "en_doc1", wordCount: 3 }],
	});
});

it("intersects terms and truncates only the returned document list", async () => {
	expect((await query(bundle(), ["rebas", "rätta"])).query).toMatchObject({
		terms: ["rebas", "rätta"],
		totalMatches: 1,
		results: [{ documentId: 1 }],
	});
	expect((await query(bundle(), ["rebas"], 1)).query).toMatchObject({
		totalMatches: 2,
		truncated: true,
		results: [{ documentId: 0 }],
	});
});

it("accepts an empty fragment list without inventing document URLs or content", async () => {
	const result = await query(bundle(false, false));
	for (const match of result.query.results) {
		expect(match).not.toHaveProperty("fragment");
		expect(match).not.toHaveProperty("url");
		expect(match).not.toHaveProperty("content");
	}
});

it("validates nonselected fragments without returning them", async () => {
	const value = bundle();
	const result = await query(value, ["rätta"]);
	expect(result.query.results).toHaveLength(1);
	expect(result.query.results[0]).not.toHaveProperty("fragment");
	value.fragments[0].data = sourceBody(Buffer.from('{"url":')).toString(
		"base64",
	);
	const body = JSON.stringify(value);
	const target = capture(body);
	await expect(
		runResearchPagefindCli(args(body, ["rätta"]), target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.text()).toBe("");
});

it("rejects fragment word counts that disagree with metadata", async () => {
	const value = bundle();
	value.fragments[0].data = sourceBody(fragment({ word_count: 4 })).toString(
		"base64",
	);
	await rejectsBody(JSON.stringify(value));
});

it("rejects invalid fragment field types and non-safe word counts", async () => {
	for (const fields of [
		{ url: 42 },
		{ content: [] },
		{ meta: { title: 42 } },
		{ word_count: -1 },
		{ word_count: 1.5 },
		{ word_count: Number.MAX_SAFE_INTEGER + 1 },
	]) {
		const value = bundle();
		value.fragments[0].data = sourceBody(fragment(fields)).toString("base64");
		await rejectsBody(JSON.stringify(value));
	}
});

it("retains a reported relative URL as source data rather than a navigated URL", async () => {
	const value = bundle();
	value.fragments[0].data = sourceBody(
		fragment({ url: "/other/doc.html?from=source#section" }),
	).toString("base64");
	const result = await query(value);
	expect(result.query.results[0].fragment.reportedUrl).toBe(
		"/other/doc.html?from=source#section",
	);
	expect(result.networkRequests).toBe(0);
	expect(result.rendered).toBe(false);
	expect(result.verified).toBe(false);
});

it("rejects missing required envelope fields and undeclared descriptor fields", async () => {
	const original = bundle();
	for (const value of [
		{ version: 1, metadata: original.metadata, chunks: original.chunks },
		{ ...original, extra: true },
		{ ...original, metadata: { ...original.metadata, extra: true } },
		{ ...original, chunks: [{ ...original.chunks[0], extra: true }] },
		{ ...original, fragments: [{ ...original.fragments[0], extra: true }] },
	])
		await rejectsBody(JSON.stringify(value));
});

it("reports unsupported bundle versions distinctly from malformed input", async () => {
	await rejectsBody(JSON.stringify({ ...bundle(), version: 2 }), "unsupported");
});

it("rejects duplicate JSON keys in the envelope, descriptors and fragment source", async () => {
	const body = JSON.stringify(bundle());
	for (const duplicate of [
		body.replace('"version":1', '"version":1,"version":1'),
		body.replace('"metadata":{', '"metadata":{"url":"ignored",'),
		body.replace('"chunks":[{', '"chunks":[{"hash":"en_chunk0",'),
	])
		await rejectsBody(duplicate);
	const value = bundle();
	value.fragments[0].data = sourceBody(
		Buffer.from(
			fragment()
				.toString()
				.replace('"word_count":3', '"word_count":3,"word_count":3'),
		),
	).toString("base64");
	await rejectsBody(JSON.stringify(value));
});

it("rejects malformed UTF8, incomplete JSON and trailing envelope garbage", async () => {
	const body = JSON.stringify(bundle());
	for (const invalid of [
		"",
		body.slice(0, -1),
		`${body}{}`,
		Buffer.concat([Buffer.from(body), Buffer.from([0xc3, 0x28])]),
	])
		await rejectsBody(invalid);
});

it("checks the digest against exact stdin bytes rather than parsed JSON", async () => {
	const body = JSON.stringify(bundle());
	const target = capture(`${body}\n`);
	await expect(
		runResearchPagefindCli(args(body), target.input, target.output),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(target.text()).toBe("");
	const correct = capture(`${body}\n`);
	await expect(
		runResearchPagefindCli(args(`${body}\n`), correct.input, correct.output),
	).resolves.toBe(0);
});

it("requires canonical base64 for every supplied body", async () => {
	for (const descriptor of ["metadata", "chunk", "fragment"] as const) {
		for (const invalid of ["!not-base64!", "YQ", "YR==", "YQ==\n", ""]) {
			const value = bundle();
			const target =
				descriptor === "metadata"
					? value.metadata
					: descriptor === "chunk"
						? value.chunks[0]
						: value.fragments[0];
			target.data = invalid;
			await rejectsBody(JSON.stringify(value));
		}
	}
});

it("rejects malformed gzip, missing signatures and trailing payload garbage", async () => {
	const payload = encode(metadata());
	const compressed = sourceBody(payload, true);
	const corrupt = Buffer.from(compressed);
	corrupt[corrupt.length - 8] ^= 1;
	for (const invalid of [
		Buffer.from([0x1f, 0x8b, 0x08]),
		compressed.subarray(0, compressed.length - 3),
		corrupt,
		payload,
		gzipSync(payload),
		Buffer.concat([Buffer.from("pagefind_bad"), payload]),
		sourceBody(Buffer.concat([payload, Buffer.from([0])])),
		sourceBody(Buffer.concat([payload, Buffer.from([0])]), true),
		Buffer.concat([compressed, Buffer.from("garbage")]),
	]) {
		const value = bundle();
		value.metadata.data = invalid.toString("base64");
		await rejectsBody(JSON.stringify(value));
	}
});

it("rejects noncanonical, private-shaped and non-HTTPS metadata URLs", async () => {
	for (const url of [
		"http://site.fixture.invalid/pagefind/pagefind.en_meta.pf_meta",
		"https://127.0.0.1/pagefind/pagefind.en_meta.pf_meta",
		"https://user:secret@site.fixture.invalid/pagefind/pagefind.en_meta.pf_meta",
		`${baseUrl}pagefind.en_meta.pf_meta?query=1`,
		`${baseUrl}pagefind.en_meta.pf_meta#fragment`,
		"https://SITE.fixture.invalid/pagefind/pagefind.en_meta.pf_meta",
		"file:///pagefind/pagefind.en_meta.pf_meta",
	]) {
		const value = bundle();
		value.metadata.url = url;
		await rejectsBody(JSON.stringify(value));
	}
});

it("rejects chunk and fragment origin, path and hash escapes", async () => {
	for (const kind of ["chunk", "fragment"] as const) {
		for (const url of [
			"https://other.fixture.invalid/pagefind/index/en_chunk0.pf_index",
			`${baseUrl}../index/en_chunk0.pf_index`,
			`${baseUrl}index/%2e%2e/en_chunk0.pf_index`,
			`${baseUrl}index/not-the-declared-hash.pf_index`,
			`${baseUrl}index/en_chunk0.pf_index?query=1`,
			`${baseUrl}fragment/en_doc0.pf_fragment#fragment`,
		]) {
			const value = bundle();
			const descriptor =
				kind === "chunk" ? value.chunks[0] : value.fragments[0];
			descriptor.url = url;
			await rejectsBody(JSON.stringify(value));
		}
	}
});

it("rejects duplicate asset hashes and undeclared chunk hashes", async () => {
	for (const kind of ["chunks", "fragments"] as const) {
		const duplicate = bundle();
		duplicate[kind].push({ ...duplicate[kind][0] });
		await rejectsBody(JSON.stringify(duplicate));
	}
	const undeclared = bundle();
	undeclared.chunks[0].hash = "en_unknown";
	undeclared.chunks[0].url = `${baseUrl}index/en_unknown.pf_index`;
	await rejectsBody(JSON.stringify(undeclared));
});

it("enforces chunk and fragment collection limits before processing bodies", async () => {
	const chunks = bundle();
	chunks.metadata.data = sourceBody(encode(metadata(2, 17))).toString("base64");
	chunks.chunks = Array.from({ length: 17 }, (_, index) => ({
		...chunks.chunks[0],
		hash: `en_chunk${index}`,
		url: `${baseUrl}index/en_chunk${index}.pf_index`,
	}));
	await rejectsBody(JSON.stringify(chunks), "resource-limit");
	const fragments = bundle();
	fragments.metadata.data = sourceBody(encode(metadata(101))).toString(
		"base64",
	);
	fragments.fragments = Array.from({ length: 101 }, (_, index) => ({
		...fragments.fragments[0],
		hash: `en_doc${index}`,
		url: `${baseUrl}fragment/en_doc${index}.pf_fragment`,
	}));
	await rejectsBody(JSON.stringify(fragments), "resource-limit");
});

it("accepts exactly the stdin byte limit and rejects the next byte", async () => {
	const body = JSON.stringify(bundle()).padEnd(
		researchPagefindCliLimits.maxInputBytes,
		" ",
	);
	const target = capture(body);
	await expect(
		runResearchPagefindCli(args(body), target.input, target.output),
	).resolves.toBe(0);
	expect(JSON.parse(target.text()).source.decodedBytes).toBe(
		researchPagefindCliLimits.maxInputBytes,
	);
	await rejectsBody(`${body} `, "resource-limit");
});

it("caps input chunks even when they contain no bytes", async () => {
	const target = capture();
	const input = retain(
		Readable.from(
			Array.from({ length: researchPagefindCliLimits.maxInputChunks + 1 }, () =>
				Buffer.alloc(0),
			),
			{ objectMode: true, autoDestroy: false },
		),
	);
	await expect(
		runResearchPagefindCli(args(""), input, target.output),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(target.text()).toBe("");
	expect(input.readableFlowing).toBe(false);
});

it("bounds decompressed payload bytes before parsing oversized fragment content", async () => {
	const value = bundle(true);
	value.fragments[0].data = sourceBody(
		fragment({ content: "x".repeat(2_000_001) }),
		true,
	).toString("base64");
	expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(
		researchPagefindCliLimits.maxInputBytes,
	);
	await rejectsBody(JSON.stringify(value), "resource-limit");
});

it("bounds aggregate decoded payloads even when each individual body fits", async () => {
	const value = bundle(true);
	value.fragments = [0, 1].map((index) => ({
		hash: `en_doc${index}`,
		url: `${baseUrl}fragment/en_doc${index}.pf_fragment`,
		data: sourceBody(
			fragment({ content: "x".repeat(1_000_001) }),
			true,
		).toString("base64"),
	}));
	await rejectsBody(JSON.stringify(value), "resource-limit");
});

it("caps output by UTF8 bytes before writing any part of the JSON line", async () => {
	const value = bundle(true);
	value.fragments = [0, 1].map((index) => ({
		hash: `en_doc${index}`,
		url: `${baseUrl}fragment/en_doc${index}.pf_fragment`,
		data: sourceBody(fragment({ content: "界".repeat(45_000) }), true).toString(
			"base64",
		),
	}));
	await rejectsBody(JSON.stringify(value), "resource-limit");
});

it("shows help without reading stdin or attaching input listeners", async () => {
	const input = retain(new Readable({ read() {}, autoDestroy: false }));
	const target = capture();
	const before = listeners(input);
	const resume = vi.spyOn(input, "resume");
	await expect(
		runResearchPagefindCli(["--help"], input, target.output),
	).resolves.toBe(0);
	expect(target.text()).toContain("--sha256");
	expect(target.text()).toContain("--term");
	expect(resume).not.toHaveBeenCalled();
	expect(listeners(input)).toEqual(before);
});

it("rejects invalid arguments before consuming stdin or writing output", async () => {
	const target = capture();
	const resume = vi.spyOn(target.input, "resume");
	await expect(
		runResearchPagefindCli([], target.input, target.output),
	).rejects.toMatchObject({ name: "AgentBrowserError", code: "invalid-input" });
	expect(resume).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
});

it("leaves caller streams open and removes owned listeners after success", async () => {
	const body = JSON.stringify(bundle());
	const target = capture(body);
	const inputBefore = listeners(target.input);
	const outputBefore = listeners(target.output);
	const controller = new AbortController();
	const callerAbort = vi.fn();
	controller.signal.addEventListener("abort", callerAbort);
	await expect(
		runResearchPagefindCli(
			args(body),
			target.input,
			target.output,
			controller.signal,
		),
	).resolves.toBe(0);
	expect(listeners(target.input)).toEqual(inputBefore);
	expect(listeners(target.output)).toEqual(outputBefore);
	expect(getEventListeners(controller.signal, "abort")).toEqual([callerAbort]);
	expect(target.input.destroyed).toBe(false);
	expect(target.output.destroyed).toBe(false);
	expect(target.output.writableEnded).toBe(false);
});

it("rejects pre-aborted work without reading stdin or exposing the abort reason", async () => {
	const body = JSON.stringify(bundle());
	const target = capture(body);
	const controller = new AbortController();
	controller.abort(
		new AgentBrowserError("policy-denied", "private abort reason"),
	);
	const resume = vi.spyOn(target.input, "resume");
	const pending = runResearchPagefindCli(
		args(body),
		target.input,
		target.output,
		controller.signal,
	);
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	await expect(pending).rejects.not.toThrow("private abort reason");
	expect(resume).not.toHaveBeenCalled();
	expect(target.text()).toBe("");
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
});

it("aborts blocked stdin and removes only operation-owned listeners", async () => {
	const input = retain(new Readable({ read() {}, autoDestroy: false }));
	const target = capture();
	const inputBefore = listeners(input);
	const outputBefore = listeners(target.output);
	const controller = new AbortController();
	const pending = runResearchPagefindCli(
		args("fixture"),
		input,
		target.output,
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	controller.abort("private abort reason");
	await rejected;
	expect(target.text()).toBe("");
	expect(listeners(input)).toEqual(inputBefore);
	expect(listeners(target.output)).toEqual(outputBefore);
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	expect(input.destroyed).toBe(false);
});

it("times out stalled stdin and clears operation timers and listeners", async () => {
	vi.useFakeTimers();
	const input = retain(new Readable({ read() {}, autoDestroy: false }));
	const target = capture();
	const inputBefore = listeners(input);
	const outputBefore = listeners(target.output);
	const pending = runResearchPagefindCli(args("fixture"), input, target.output);
	const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
	await vi.advanceTimersByTimeAsync(researchPagefindCliLimits.timeoutMs);
	await rejected;
	expect(target.text()).toBe("");
	expect(listeners(input)).toEqual(inputBefore);
	expect(listeners(target.output)).toEqual(outputBefore);
	expect(vi.getTimerCount()).toBe(0);
});

it("aborts blocked output and releases the late callback guard on acknowledgement", async () => {
	const body = JSON.stringify(bundle());
	const target = capture(body);
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
	const pending = runResearchPagefindCli(
		args(body),
		target.input,
		output,
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await writing;
	controller.abort("private abort reason");
	await rejected;
	expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	expect(output.destroyed).toBe(false);
	expect(output.writableEnded).toBe(false);
	acknowledge?.();
	expect(listeners(output)).toEqual(before);
});
