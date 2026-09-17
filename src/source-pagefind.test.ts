import { expect, it, vi } from "vitest";
import { sourceCborLimits } from "./source-cbor.js";
import {
	type PagefindSourceChunk,
	type PagefindSourceSearchOptions,
	searchPagefindSource,
	sourcePagefindLimits,
} from "./source-pagefind.js";

type Fixture = string | number | bigint | boolean | null | Fixture[];

function join(parts: readonly Uint8Array[]): Uint8Array {
	const output = new Uint8Array(
		parts.reduce((length, part) => length + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}

function argument(major: number, value: bigint): Uint8Array {
	if (value < 24n) return new Uint8Array([(major << 5) | Number(value)]);
	const width =
		value <= 255n ? 1 : value <= 65535n ? 2 : value <= 4294967295n ? 4 : 8;
	const additional =
		width === 1 ? 24 : width === 2 ? 25 : width === 4 ? 26 : 27;
	const output = new Uint8Array(1 + width);
	output[0] = (major << 5) | additional;
	for (let index = 0; index < width; index++)
		output[index + 1] = Number(
			(value >> BigInt((width - index - 1) * 8)) & 255n,
		);
	return output;
}

function encode(value: Fixture): Uint8Array {
	if (Array.isArray(value))
		return join([argument(4, BigInt(value.length)), ...value.map(encode)]);
	if (typeof value === "string") {
		const bytes = new TextEncoder().encode(value);
		return join([argument(3, BigInt(bytes.length)), bytes]);
	}
	if (value === null) return new Uint8Array([0xf6]);
	if (typeof value === "boolean") return new Uint8Array([value ? 0xf5 : 0xf4]);
	const integer = BigInt(value);
	return argument(integer < 0n ? 1 : 0, integer < 0n ? -1n - integer : integer);
}

function metadataFields(count = 6): Fixture[] {
	return [
		"1.5.2",
		Array.from({ length: count }, (_, index) => [`en_doc${index}`, 239]),
		[
			["a", "r", "en_chunkA"],
			["r", "⌘", "en_chunkB"],
		],
		[["category", "en_filter"]],
		[],
		["category", "image", "image_alt", "title"],
	];
}

function posting(delta: number | bigint): Fixture[] {
	return [delta, [-2, 3788, 151], []];
}

function record(term: string, deltas: (number | bigint)[]): Fixture[] {
	return [term, deltas.map(posting), []];
}

function chunk(records: Fixture[], hash = "en_chunkA"): PagefindSourceChunk {
	return { hash, bytes: encode([records]) };
}

function search(
	records: Fixture[] = [record("rebas", [0, 2, 3])],
	terms: readonly string[] = ["rebas"],
	options?: PagefindSourceSearchOptions,
) {
	return searchPagefindSource(
		encode(metadataFields()),
		[chunk(records)],
		terms,
		options,
	);
}

function rejects(
	metadata: unknown,
	chunks: unknown,
	terms: unknown = ["rebas"],
	options?: unknown,
	code = "invalid-input",
) {
	expect(() =>
		searchPagefindSource(
			metadata as Uint8Array,
			chunks as readonly PagefindSourceChunk[],
			terms as readonly string[],
			options as PagefindSourceSearchOptions,
		),
	).toThrowError(expect.objectContaining({ name: "AgentBrowserError", code }));
}

it("returns bounded JSON-safe evidence with zero-based delta document IDs", () => {
	const result = search();
	expect(result).toEqual({
		version: "1.5.2",
		scope: "supplied-chunks",
		matching: "literal-stored-term",
		ordering: "document-id",
		totalDocuments: 6,
		suppliedChunks: ["en_chunkA"],
		terms: ["rebas"],
		missingTerms: [],
		totalMatches: 3,
		truncated: false,
		results: [
			{ documentId: 0, fragmentHash: "en_doc0", wordCount: 239 },
			{ documentId: 2, fragmentHash: "en_doc2", wordCount: 239 },
			{ documentId: 5, fragmentHash: "en_doc5", wordCount: 239 },
		],
		unverified: true,
	});
	expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});

it("accumulates deltas independently and intersects terms across supplied chunks", () => {
	const result = searchPagefindSource(
		encode(metadataFields()),
		[
			chunk([record("second", [2, 2])], "en_chunkB"),
			chunk([record("rebas", [0, 2, 3])]),
		],
		["rebas", "second"],
	);
	expect(result.results).toEqual([
		{ documentId: 2, fragmentHash: "en_doc2", wordCount: 239 },
	]);
	expect(result.suppliedChunks).toEqual(["en_chunkB", "en_chunkA"]);
});

it("matches variant literals exactly without assigning them to their parent", () => {
	const records: Fixture[] = [
		["ratta", [], [["rätta", [posting(0), posting(2)]]]],
		record("rätta", [1, 1]),
		record("rebas", [0]),
	];
	expect(
		search(records, ["rätta"]).results.map((match) => match.documentId),
	).toEqual([0, 1, 2]);
	expect(search(records, ["ratta"])).toMatchObject({
		missingTerms: [],
		totalMatches: 0,
	});
	for (const literal of ["rebase", "Rebas", "re", "RÄTTA", " ratta "])
		expect(search(records, [literal])).toMatchObject({
			missingTerms: [literal],
			totalMatches: 0,
		});
});

it("does not normalize Unicode, trim, fold case or treat literals as paths", () => {
	for (const literal of [" ratta ", "rätta", "A", "../literal", "__proto__"])
		expect(search([record(literal, [0])], [literal]).totalMatches).toBe(1);
});

it("distinguishes absent literals from empty direct and variant postings", () => {
	const result = search(
		[["empty", [], [["empty-variant", []]]]],
		["absent", "empty", "empty-variant"],
	);
	expect(result.missingTerms).toEqual(["absent"]);
	expect(result.totalMatches).toBe(0);
	expect(result.truncated).toBe(false);
});

it("permits omitted chunks and never infers complete-site absence from ranges", () => {
	const result = search([], ["z"]);
	expect(result.scope).toBe("supplied-chunks");
	expect(result.suppliedChunks).toEqual(["en_chunkA"]);
	expect(result.missingTerms).toEqual(["z"]);
	expect(result.unverified).toBe(true);
});

it("sorts document IDs before applying the default and explicit limits", () => {
	const records: Fixture[] = [
		["ratta", [], [["rätta", [posting(5)]]]],
		record("rätta", [0, 2]),
	];
	expect(search(records, ["rätta"], { limit: 2 })).toMatchObject({
		totalMatches: 3,
		truncated: true,
		results: [
			{ documentId: 0, fragmentHash: "en_doc0", wordCount: 239 },
			{ documentId: 2, fragmentHash: "en_doc2", wordCount: 239 },
		],
	});
	expect(search(records, ["rätta"], { limit: 3 }).truncated).toBe(false);
	const many = searchPagefindSource(
		encode(metadataFields(25)),
		[chunk([record("rebas", [0, ...new Array<number>(24).fill(1)])])],
		["rebas"],
	);
	expect(many.results).toHaveLength(20);
	expect(many.totalMatches).toBe(25);
	expect(many.truncated).toBe(true);
});

it("validates metadata root, document rows, ranges and all remaining arrays", () => {
	const malformed: Fixture[] = [[], metadataFields().slice(0, 5)];
	malformed.push([...metadataFields(), []]);
	for (const [field, replacement] of [
		[0, 152],
		[1, "documents"],
		[1, [["en_doc", 0, 1]]],
		[1, [["en_doc"]]],
		[1, [["en_doc", -1]]],
		[1, [["en_doc", "1"]]],
		[1, [["en_doc", 9007199254740992n]]],
		[1, [["en_doc", 18446744073709551615n]]],
		[
			1,
			[
				["en_doc", 0],
				["en_doc", 1],
			],
		],
		[2, "ranges"],
		[2, [["z", "a", "en_chunkA"]]],
		[2, [[0, "z", "en_chunkA"]]],
		[2, [["a", "z"]]],
		[2, [["a", "z", "en_chunkA", 0]]],
		[
			2,
			[
				["a", "b", "en_chunkA"],
				["c", "d", "en_chunkA"],
			],
		],
		[3, null],
		[4, "not-array"],
		[5, false],
	] as [number, Fixture][]) {
		const fields = metadataFields();
		fields[field] = replacement;
		malformed.push(fields);
	}
	for (const fields of malformed)
		rejects(encode(fields), [chunk([record("rebas", [0])])]);
});

it("rejects unknown string versions as unsupported without echoing source text", () => {
	const fields = metadataFields();
	fields[0] = "secret-version";
	rejects(encode(fields), [chunk([])], ["rebas"], undefined, "unsupported");
	expect(() =>
		searchPagefindSource(encode(fields), [chunk([])], ["rebas"]),
	).toThrowError("Unsupported Pagefind source version.");
});

it("leaves the final metadata arrays opaque rather than inventing semantics", () => {
	const fields = metadataFields();
	fields[3] = [null, [true, -1]];
	fields[4] = ["opaque"];
	fields[5] = [17];
	expect(
		searchPagefindSource(encode(fields), [chunk([])], ["absent"]),
	).toMatchObject({ totalMatches: 0 });
});

it("validates all unused records, posting fields and variants despite empty results", () => {
	const malformed: Fixture[] = [
		[],
		["unused", []],
		[0, [], []],
		["unused", null, []],
		["unused", [], null],
		["unused", [[0, [], [], 0]], []],
		["unused", [[0, []]], []],
		["unused", [[-1, [], []]], []],
		["unused", [["0", [], []]], []],
		["unused", [[0, null, []]], []],
		["unused", [[0, [], null]], []],
		["unused", [[0, ["position"], []]], []],
		["unused", [[0, [], [false]]], []],
		["unused", [posting(0), posting(0)], []],
		["unused", [posting(6)], []],
		["unused", [posting(5), posting(1)], []],
		["unused", [], [["variant"]]],
		["unused", [], [[0, []]]],
		["unused", [], [["variant", [], 0]]],
		["unused", [], [["variant", [posting(-1)]]]],
		["unused", [], [["variant", [posting(0), posting(0)]]]],
		["unused", [], [["variant", [posting(6)]]]],
		[
			"unused",
			[],
			[
				["variant", []],
				["variant", []],
			],
		],
	];
	for (const invalid of malformed)
		rejects(encode(metadataFields()), [chunk([record("rebas", []), invalid])]);
	for (const root of [[], [[], []], [0], "not-array"] as Fixture[])
		rejects(encode(metadataFields()), [
			{ hash: "en_chunkA", bytes: encode(root) },
		]);
});

it("rejects duplicate direct terms and variant names within and across chunks", () => {
	const direct = record("rebas", []);
	const variant: Fixture = ["other", [], [["variant", []]]];
	rejects(encode(metadataFields()), [chunk([direct, direct])]);
	rejects(encode(metadataFields()), [
		chunk([direct]),
		chunk([direct], "en_chunkB"),
	]);
	rejects(encode(metadataFields()), [
		chunk([variant]),
		chunk([["different", [], [["variant", []]]]], "en_chunkB"),
	]);
});

it("validates every supplied chunk rather than stopping after a match or limit", () => {
	rejects(
		encode(metadataFields()),
		[
			chunk([record("rebas", [0])]),
			chunk([["unused", [posting(-1)], []]], "en_chunkB"),
		],
		["rebas"],
		{ limit: 1 },
	);
});

it("validates hash syntax, metadata membership and conflicting descriptors", () => {
	for (const hash of [
		"",
		"../escape",
		"a/b",
		"a\\b",
		"a.b",
		"a%2fb",
		"é",
		"valid\n",
		"a".repeat(129),
	]) {
		rejects(encode(metadataFields()), [chunk([], hash)]);
		const documents = metadataFields();
		documents[1] = [[hash, 1]];
		rejects(encode(documents), [chunk([])]);
		const ranges = metadataFields();
		ranges[2] = [["a", "z", hash]];
		rejects(encode(ranges), [chunk([])]);
	}
	rejects(encode(metadataFields()), [chunk([], "en_unknown")]);
	rejects(encode(metadataFields()), [chunk([]), chunk([record("other", [])])]);
	const fields = metadataFields();
	const hash = "A0_-".repeat(32);
	fields[1] = [[hash, 0]];
	fields[2] = [["a", "z", hash]];
	expect(
		searchPagefindSource(
			encode(fields),
			[chunk([record("x", [0])], hash)],
			["x"],
		),
	).toMatchObject({
		results: [{ documentId: 0, fragmentHash: hash, wordCount: 0 }],
	});
});

it("requires literal query strings, distinct terms and valid result limits", () => {
	for (const terms of [null, "rebas", [], [""], [1], ["rebas", "rebas"]])
		rejects(encode(metadataFields()), [chunk([])], terms);
	for (const limit of [
		0,
		-1,
		101,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		"1",
		null,
	])
		rejects(encode(metadataFields()), [chunk([])], ["rebas"], { limit });
	for (const options of [null, [], "options", { checkpoint: true }])
		rejects(encode(metadataFields()), [chunk([])], ["rebas"], options);
	for (const chunks of [null, [], "chunks", [null], [{}], [["en_chunkA"]]])
		rejects(encode(metadataFields()), chunks);
});

it("enforces aggregate bytes and bounded chunk and query descriptors", () => {
	expect(Object.isFrozen(sourcePagefindLimits)).toBe(true);
	const metadata = encode(metadataFields());
	rejects(
		metadata,
		Array.from({ length: 17 }, (_, index) => chunk([], `en_${index}`)),
		["rebas"],
		undefined,
		"resource-limit",
	);
	for (const terms of [
		Array.from({ length: 33 }, (_, index) => `term${index}`),
		["a".repeat(257)],
		["😀".repeat(129)],
	])
		rejects(metadata, [chunk([])], terms, undefined, "resource-limit");
	rejects(
		new Uint8Array(2_000_001),
		[chunk([])],
		["rebas"],
		undefined,
		"resource-limit",
	);
	rejects(
		metadata,
		[{ hash: "en_chunkA", bytes: new Uint8Array(2_000_000) }],
		["rebas"],
		undefined,
		"resource-limit",
	);
	rejects(
		metadata,
		[
			{ hash: "en_chunkA", bytes: new Uint8Array(1_000_000) },
			{ hash: "en_chunkB", bytes: new Uint8Array(1_000_000) },
		],
		["rebas"],
		undefined,
		"resource-limit",
	);
});

it("accepts maximum descriptor counts, UTF16 lengths and result limit", () => {
	const fields = metadataFields();
	fields[2] = Array.from({ length: 16 }, (_, index) => [
		"a",
		"z",
		`en_${index}`,
	]);
	const terms = Array.from({ length: 31 }, (_, index) => `term${index}`);
	terms.push("😀".repeat(128));
	const result = searchPagefindSource(
		encode(fields),
		Array.from({ length: 16 }, (_, index) => chunk([], `en_${index}`)),
		terms,
		{ limit: 100 },
	);
	expect(result.missingTerms).toEqual(terms);
	expect(result.suppliedChunks).toHaveLength(16);
});

it("does not round large deltas and does not interpret signed position values", () => {
	const unsignedMaximum = 18446744073709551615n;
	for (const delta of [9007199254740993n, unsignedMaximum])
		rejects(encode(metadataFields()), [chunk([record("rebas", [delta])])]);
	const fields = metadataFields();
	fields[1] = [["en_doc0", BigInt(Number.MAX_SAFE_INTEGER)]];
	const result = searchPagefindSource(
		encode(fields),
		[
			chunk([
				["rebas", [[0, [-1n - unsignedMaximum, unsignedMaximum], [-2]]], []],
			]),
		],
		["rebas"],
	);
	expect(result.results).toEqual([
		{
			documentId: 0,
			fragmentHash: "en_doc0",
			wordCount: Number.MAX_SAFE_INTEGER,
		},
	]);
});

it("preserves the reported fragment ID and safe word count for parent verification", () => {
	const fields = metadataFields(8);
	(fields[1] as Fixture[])[7] = ["en_2ac05e1", 145];
	const result = searchPagefindSource(
		encode(fields),
		[chunk([record("rebas", [7])])],
		["rebas"],
	);
	expect(result.results).toEqual([
		{ documentId: 7, fragmentHash: "en_2ac05e1", wordCount: 145 },
	]);
	expect(result.unverified).toBe(true);
});

it("permits empty document collections only when all postings are empty", () => {
	const metadata = encode(metadataFields(0));
	expect(
		searchPagefindSource(metadata, [chunk([record("rebas", [])])], ["rebas"]),
	).toMatchObject({ totalDocuments: 0, missingTerms: [], totalMatches: 0 });
	rejects(metadata, [chunk([record("rebas", [0])])]);
});

it("retains decoder rejection and resource boundaries without using CTAP", () => {
	const validChunks = [chunk([])];
	for (const input of [
		null,
		[],
		new Uint16Array(8),
		new Uint8Array(),
		new Uint8Array([0x86]),
	])
		rejects(input, validChunks);
	rejects(encode(metadataFields()), [
		{ hash: "en_chunkA", bytes: new Uint8Array() },
	]);
	rejects(join([encode(metadataFields()), new Uint8Array([0])]), validChunks);
	const tooMany = join([
		new Uint8Array([0x81]),
		argument(4, BigInt(sourceCborLimits.maxContainerEntries + 1)),
		new Uint8Array(sourceCborLimits.maxContainerEntries + 1),
	]);
	rejects(
		encode(metadataFields()),
		[{ hash: "en_chunkA", bytes: tooMany }],
		["rebas"],
		undefined,
		"resource-limit",
	);
});

it("copies descriptors and bytes before callbacks and reads caller fields once", () => {
	const metadata = encode(metadataFields());
	const bytes = chunk([record("rebas", [0])]).bytes;
	const hash = vi.fn(() => "en_chunkA");
	const readBytes = vi.fn(() => bytes);
	const terms = ["rebas"];
	const chunks: PagefindSourceChunk[] = [
		{
			get hash() {
				return hash();
			},
			get bytes() {
				return readBytes();
			},
		},
	];
	const checkpoint = vi.fn(() => {
		terms[0] = "changed";
		chunks.length = 0;
		metadata.fill(0);
		bytes.fill(0);
	});
	const result = searchPagefindSource(metadata, chunks, terms, { checkpoint });
	expect(result.terms).toEqual(["rebas"]);
	expect(result.suppliedChunks).toEqual(["en_chunkA"]);
	expect(result.totalMatches).toBe(1);
	expect(hash).toHaveBeenCalledTimes(1);
	expect(readBytes).toHaveBeenCalledTimes(1);
	expect(checkpoint).toHaveBeenCalled();
});

it("sanitizes caller getters and proxies without invoking error stringification", () => {
	const secret = new Error("private caller details");
	const checkpoint = vi.fn();
	const chunks = [
		{
			get hash(): string {
				throw secret;
			},
			bytes: encode([[]]),
		},
	];
	expect(() =>
		searchPagefindSource(encode(metadataFields()), chunks, ["rebas"], {
			checkpoint,
		}),
	).toThrowError("Invalid Pagefind source input.");
	expect(checkpoint).not.toHaveBeenCalled();
	const terms = new Proxy(["rebas"], {
		get() {
			throw secret;
		},
	});
	rejects(encode(metadataFields()), [chunk([])], terms);
	rejects(encode(metadataFields()), [chunk([])], ["rebas"], {
		get limit() {
			throw secret;
		},
	});
	rejects(encode(metadataFields()), [
		{
			hash: "en_chunkA",
			get bytes() {
				throw secret;
			},
		},
	]);
	const revoked = Proxy.revocable([], {});
	revoked.revoke();
	rejects(encode(metadataFields()), revoked.proxy);
});

it("propagates entry cancellation unchanged after descriptor validation", () => {
	const cancellation = new Error("cancelled");
	expect(() =>
		search(undefined, undefined, {
			checkpoint() {
				throw cancellation;
			},
		}),
	).toThrow(cancellation);
});

it("checkpoints bounded validation and propagates later cancellation unchanged", () => {
	const records = Array.from({ length: 900 }, (_, index) =>
		record(`unused${index}`, [0]),
	);
	const checkpoint = vi.fn();
	search(records, ["absent"], { checkpoint });
	expect(checkpoint.mock.calls.length).toBeGreaterThan(10);
	const cancellation = new Error("late cancellation");
	let calls = 0;
	expect(() =>
		search(records, ["absent"], {
			checkpoint() {
				if (++calls === 10) throw cancellation;
			},
		}),
	).toThrow(cancellation);
	expect(calls).toBe(10);
});
