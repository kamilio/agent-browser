import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	ResearchSourceAccessCollector,
	fitResearchSourceAccess,
	researchSourceAccess,
	setResearchSourceAccess,
} from "./research-source-access.js";

type SourceAccess = NonNullable<
	ReturnType<ResearchSourceAccessCollector["finish"]>
>;

const trees: DocumentTree[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function declaration(overrides: Record<string, unknown> = {}) {
	return {
		"@context": "https://schema.org",
		isAccessibleForFree: false,
		...overrides,
	};
}

function add(
	collector: ResearchSourceAccessCollector,
	json: string,
	offset = 19,
) {
	const prefix = " ".repeat(offset);
	collector.add(
		prefix + json,
		prefix.length,
		prefix.length + json.length,
		offset,
	);
}

function collect(value: unknown = declaration()) {
	const collector = new ResearchSourceAccessCollector();
	add(collector, JSON.stringify(value));
	return collector.finish();
}

function required(data: SourceAccess | undefined) {
	expect(data).toBeDefined();
	if (!data) throw new Error("Missing source access metadata");
	return data;
}

function entry(path = "$", value: boolean | string = false, offset = 19) {
	return { source: { offset }, path, value };
}

function bytes(value: unknown) {
	return new TextEncoder().encode(JSON.stringify(value)).length;
}

function expectFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectFrozen(child);
}

function tree() {
	const document = new DocumentTree("https://source.invalid/");
	trees.push(document);
	return document;
}

function nestedDeclaration(depth: number) {
	let nested: Record<string, unknown> = { isAccessibleForFree: false };
	for (let index = 0; index < depth; index++) nested = { hasPart: nested };
	return { "@context": "https://schema.org", ...nested };
}

function fittingFixture() {
	return required(
		collect([
			declaration({ isAccessibleForFree: "FaLsE" }),
			declaration({ isAccessibleForFree: true }),
			declaration({ isAccessibleForFree: "TRUE" }),
		]),
	);
}

it("returns no envelope without retained declarations", () => {
	expect(new ResearchSourceAccessCollector().finish()).toBeUndefined();
	for (const value of [
		null,
		false,
		1,
		"true",
		[],
		{},
		{ "@context": "https://schema.org" },
	])
		expect(collect(value)).toBeUndefined();
});

it("returns only the advisory envelope, source offset, object path and value", () => {
	expect(
		collect(
			declaration({
				"@type": "NewsArticle",
				articleBody: "Do not recover this body",
				reviewBody: "Do not recover this review",
				memberPayload: { secret: "not reader content" },
				url: "https://never-fetch.invalid/",
			}),
		),
	).toEqual({
		kind: "jsonld-free-access-declarations-v1",
		scope: "document-source",
		partial: true,
		verified: false,
		truncated: false,
		entries: [entry()],
	});
});

it("reads only the supplied raw slice and preserves normalized UTF16 script offsets", () => {
	const collector = new ResearchSourceAccessCollector();
	const prefix = "😀\n";
	const opening = '<script type="application/ld+json">';
	const json = JSON.stringify(declaration());
	const start = prefix.length + opening.length;
	const source = `${prefix}${opening}${json}</script>{invalid trailing data}`;
	collector.add(source, start, start + json.length, prefix.length);
	expect(required(collector.finish()).entries).toEqual([entry("$", false, 3)]);
});

it("rejects invalid source spans before charging collector budgets", () => {
	const collector = new ResearchSourceAccessCollector();
	const source = `  ${JSON.stringify(declaration())}`;
	const valid = { start: 2, end: source.length, offset: 1 };
	const spans = [
		{ ...valid, offset: -1 },
		{ ...valid, offset: 3 },
		{ ...valid, start: -1 },
		{ ...valid, start: source.length + 1 },
		{ ...valid, end: 1 },
		{ ...valid, end: source.length + 1 },
	];
	for (const index of [
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	]) {
		spans.push({ ...valid, start: index });
		spans.push({ ...valid, end: index });
		spans.push({ ...valid, offset: index });
	}
	for (const span of spans)
		expect(() =>
			collector.add(source, span.start, span.end, span.offset),
		).toThrow();
	collector.add(source, valid.start, valid.end, valid.offset);
	const data = required(collector.finish());
	expect(data.entries).toEqual([entry("$", false, 1)]);
	expect(data.truncated).toBe(false);
});

it("accepts zero offsets and empty spans at the end of source", () => {
	const collector = new ResearchSourceAccessCollector();
	const source = JSON.stringify(declaration());
	collector.add(source, source.length, source.length, source.length);
	expect(collector.finish()).toBeUndefined();
	collector.add(source, 0, source.length, 0);
	const data = required(collector.finish());
	expect(data.entries).toEqual([entry("$", false, 0)]);
	expect(data.truncated).toBe(false);
});

it("accepts only the four exact schema.org HTTP and HTTPS context strings", () => {
	for (const context of [
		"http://schema.org",
		"http://schema.org/",
		"https://schema.org",
		"https://schema.org/",
	]) {
		const data = required(collect(declaration({ "@context": context })));
		expect(data.entries).toEqual([entry()]);
		expect(data.truncated).toBe(false);
	}
});

it("rejects context aliases, arrays, remote URLs and near matches", () => {
	for (const context of [
		"HTTPS://schema.org",
		"https://SCHEMA.org",
		" https://schema.org",
		"https://schema.org ",
		"https://schema.org\n",
		"https://schema.org/\n",
		"https://schema.org//",
		"https://schema.org/context.jsonld",
		"https://schema.org?context",
		"https://schema.org#context",
		"https://schema.org.evil.invalid",
		"https://schema.org@evil.invalid/",
		"https://schema.org:443/",
		"//schema.org",
		"schema.org",
		"https://never-fetch.invalid/context",
		["https://schema.org"],
		{ "@vocab": "https://schema.org/" },
		{ schema: "https://schema.org/" },
		null,
		false,
		1,
	])
		expect(collect(declaration({ "@context": context }))).toBeUndefined();
});

it("preserves boolean values and original true/false string casing", () => {
	const values = [
		true,
		false,
		"true",
		"false",
		"TRUE",
		"FALSE",
		"TrUe",
		"fAlSe",
	];
	const data = required(
		collect(values.map((value) => declaration({ isAccessibleForFree: value }))),
	);
	expect(data.entries).toEqual(
		values.map((value, index) => entry(`$[${index}]`, value)),
	);
});

it("never coerces numbers, nulls, containers or whitespace-padded strings", () => {
	for (const value of [
		0,
		1,
		null,
		"",
		"0",
		"1",
		"yes",
		" true",
		"false ",
		"true\n",
		"\tFALSE",
		[true],
		{ "@value": false },
		{ value: true },
	])
		expect(
			collect(declaration({ isAccessibleForFree: value })),
		).toBeUndefined();
});

it("requires the exact property name rather than aliases or prefixed names", () => {
	for (const property of [
		"isaccessibleforfree",
		"IsAccessibleForFree",
		"schema:isAccessibleForFree",
		"https://schema.org/isAccessibleForFree",
		"free",
	])
		expect(
			collect({ "@context": "https://schema.org", [property]: false }),
		).toBeUndefined();
});

it("keeps root-array contexts local to each object", () => {
	const data = required(
		collect([
			declaration(),
			{ isAccessibleForFree: true },
			declaration({ "@context": "https://unknown.invalid/" }),
			declaration({ isAccessibleForFree: "TRUE" }),
		]),
	);
	expect(data.entries).toEqual([entry("$[0]"), entry("$[3]", "TRUE")]);
});

it("inherits recognized context through graph and hasPart arrays and objects", () => {
	const data = required(
		collect({
			"@context": "https://schema.org",
			"@graph": [
				{
					isAccessibleForFree: true,
					hasPart: [
						{ isAccessibleForFree: "FALSE" },
						{ hasPart: { isAccessibleForFree: false } },
					],
				},
			],
		}),
	);
	expect(data.entries).toEqual([
		entry("$.@graph[0]", true),
		entry("$.@graph[0].hasPart[0]", "FALSE"),
		entry("$.@graph[0].hasPart[1].hasPart"),
	]);
	expect(
		required(
			collect({
				"@context": "https://schema.org",
				"@graph": { isAccessibleForFree: true },
			}),
		).entries,
	).toEqual([entry("$.@graph", true)]);
});

it("disables inherited context explicitly without leaking into siblings", () => {
	for (const context of ["https://unknown.invalid/", null, false, [], {}]) {
		const data = required(
			collect({
				"@context": "https://schema.org",
				hasPart: [
					{
						"@context": context,
						isAccessibleForFree: false,
						hasPart: { isAccessibleForFree: false },
					},
					{ isAccessibleForFree: true },
				],
			}),
		);
		expect(data.entries).toEqual([entry("$.hasPart[1]", true)]);
	}
});

it("allows an explicit recognized child context after an unknown ancestor", () => {
	expect(
		required(
			collect({
				"@context": "https://unknown.invalid/",
				isAccessibleForFree: true,
				hasPart: { hasPart: declaration() },
			}),
		).entries,
	).toEqual([entry("$.hasPart.hasPart")]);
});

it("does not traverse unrelated properties even when they contain schema contexts", () => {
	const data = required(
		collect(
			declaration({
				mainEntity: declaration(),
				articleBody: declaration(),
				review: [declaration()],
				memberPayload: { hasPart: declaration() },
				arbitrary: declaration(),
			}),
		),
	);
	expect(data.entries).toEqual([entry()]);
	expect(data.truncated).toBe(false);
});

it("does not spend traversal depth or visited-value budgets on unknown properties", () => {
	const collector = new ResearchSourceAccessCollector();
	const nested = `${"[".repeat(1000)}0${"]".repeat(1000)}`;
	add(
		collector,
		`{"@context":"https://schema.org","isAccessibleForFree":false,"unknown":${nested}}`,
	);
	expect(required(collector.finish())).toEqual(collect());
});

it("treats prototype-sensitive JSON keys as data without inherited declarations", () => {
	const collector = new ResearchSourceAccessCollector();
	add(
		collector,
		'{"@context":"https://schema.org","isAccessibleForFree":false,"__proto__":{"isAccessibleForFree":true},"constructor":{"prototype":{"isAccessibleForFree":true}},"hasPart":{"__proto__":{"isAccessibleForFree":true}}}',
	);
	expect(required(collector.finish()).entries).toEqual([entry()]);
	expect(Object.prototype).not.toHaveProperty("isAccessibleForFree");
	const inheritedContext = new ResearchSourceAccessCollector();
	add(
		inheritedContext,
		'{"__proto__":{"@context":"https://schema.org"},"isAccessibleForFree":false}',
	);
	expect(inheritedContext.finish()).toBeUndefined();
});

it("ignores malformed JSON rather than evaluating source or accepting JSON extensions", () => {
	for (const json of [
		"",
		"{",
		"undefined",
		"NaN",
		"/* comment */ {}",
		"{} {}",
		'{"@context":"https://schema.org","isAccessibleForFree":false,}',
		"({'@context':'https://schema.org',isAccessibleForFree:false})",
		'{"@context":"https://schema.org","isAccessibleForFree":FALSE}',
		'{"@context":"https://schema.org","isAccessibleForFree":false}// comment',
	]) {
		const collector = new ResearchSourceAccessCollector();
		expect(() => add(collector, json)).not.toThrow();
		expect(collector.finish()).toBeUndefined();
	}
});

it("continues after malformed JSON without losing declarations or marking truncation", () => {
	const collector = new ResearchSourceAccessCollector();
	add(collector, JSON.stringify(declaration()), 1);
	add(collector, "{", 2);
	add(collector, JSON.stringify(declaration({ isAccessibleForFree: true })), 3);
	const data = required(collector.finish());
	expect(data.entries).toEqual([entry("$", false, 1), entry("$", true, 3)]);
	expect(data.truncated).toBe(false);
});

it("accepts eight blocks exactly and ignores the ninth with truncation", () => {
	const collector = new ResearchSourceAccessCollector();
	for (let index = 0; index < 8; index++)
		add(collector, JSON.stringify(declaration()), index);
	const boundary = required(collector.finish());
	expect(boundary.entries).toEqual(
		Array.from({ length: 8 }, (_, index) => entry("$", false, index)),
	);
	expect(boundary.truncated).toBe(false);
	add(collector, JSON.stringify(declaration()), 99);
	expect(required(collector.finish())).toEqual({
		...boundary,
		truncated: true,
	});
	expect(boundary.truncated).toBe(false);
});

it("counts invalid and unsupported eligible blocks toward the eight-block limit", () => {
	const collector = new ResearchSourceAccessCollector();
	for (const json of ["{", "null", "{}", "[]", "false", "1", '"text"'])
		add(collector, json);
	add(collector, JSON.stringify(declaration()));
	expect(required(collector.finish()).truncated).toBe(false);
	add(collector, JSON.stringify(declaration()), 99);
	expect(required(collector.finish()).entries).toEqual([entry()]);
	expect(required(collector.finish()).truncated).toBe(true);
});

it("returns undefined after limits are exceeded if no declarations were retained", () => {
	const collector = new ResearchSourceAccessCollector();
	for (let index = 0; index < 8; index++) add(collector, "{");
	add(collector, JSON.stringify(declaration()));
	expect(collector.finish()).toBeUndefined();
	const oversized = new ResearchSourceAccessCollector();
	add(oversized, " ".repeat(262145));
	add(oversized, JSON.stringify(declaration()));
	expect(oversized.finish()).toBeUndefined();
});

it("accepts exactly 65536 UTF16 units rather than imposing a UTF8 block cap", () => {
	const json = JSON.stringify(declaration({ unknown: "😀" })).padEnd(
		65536,
		" ",
	);
	expect(new TextEncoder().encode(json).length).toBeGreaterThan(65536);
	const collector = new ResearchSourceAccessCollector();
	add(collector, json);
	expect(required(collector.finish())).toEqual(collect());
});

it("applies the per-block limit to the slice rather than the whole source", () => {
	const collector = new ResearchSourceAccessCollector();
	const prefix = " ".repeat(65537);
	const json = JSON.stringify(declaration());
	collector.add(
		prefix + json + prefix,
		prefix.length,
		prefix.length + json.length,
		7,
	);
	const data = required(collector.finish());
	expect(data.entries).toEqual([entry("$", false, 7)]);
	expect(data.truncated).toBe(false);
});

it("skips an oversized block without slicing or parsing it", () => {
	const collector = new ResearchSourceAccessCollector();
	const json = JSON.stringify(declaration()).padEnd(65537, " ");
	const slice = vi.spyOn(String.prototype, "slice");
	const parse = vi.spyOn(JSON, "parse");
	let sliceCalls = -1;
	let parseCalls = -1;
	try {
		add(collector, json);
		sliceCalls = slice.mock.calls.length;
		parseCalls = parse.mock.calls.length;
	} finally {
		slice.mockRestore();
		parse.mockRestore();
	}
	expect(sliceCalls).toBe(0);
	expect(parseCalls).toBe(0);
	add(collector, JSON.stringify(declaration()), 5);
	const data = required(collector.finish());
	expect(data.entries).toEqual([entry("$", false, 5)]);
	expect(data.truncated).toBe(true);
});

it("counts oversized blocks toward the block cap even when skipped", () => {
	const collector = new ResearchSourceAccessCollector();
	add(collector, JSON.stringify(declaration()));
	add(collector, " ".repeat(65537));
	for (let index = 0; index < 6; index++) add(collector, "{}");
	add(collector, JSON.stringify(declaration()), 99);
	expect(required(collector.finish()).entries).toEqual([entry()]);
	expect(required(collector.finish()).truncated).toBe(true);
});

it("charges malformed and unsupported blocks at the exact aggregate-unit boundary", () => {
	const collector = new ResearchSourceAccessCollector();
	add(collector, "{".padEnd(65536, " "), 1);
	add(collector, "{}".padEnd(65536, " "), 2);
	add(collector, JSON.stringify(declaration()).padEnd(65536, " "), 3);
	add(collector, JSON.stringify(declaration()).padEnd(65536, " "), 4);
	const boundary = required(collector.finish());
	expect(boundary.entries).toEqual([
		entry("$", false, 3),
		entry("$", false, 4),
	]);
	expect(boundary.truncated).toBe(false);
	add(collector, " ", 5);
	add(collector, JSON.stringify(declaration()), 6);
	expect(required(collector.finish())).toEqual({
		...boundary,
		truncated: true,
	});
});

it("charges all oversized units to the aggregate budget without parsing them", () => {
	const collector = new ResearchSourceAccessCollector();
	add(collector, " ".repeat(196608), 1);
	add(collector, JSON.stringify(declaration()).padEnd(65536, " "), 2);
	const boundary = required(collector.finish());
	expect(boundary.entries).toEqual([entry("$", false, 2)]);
	expect(boundary.truncated).toBe(true);
	add(collector, JSON.stringify(declaration()), 3);
	expect(collector.finish()).toEqual(boundary);
});

it("skips an aggregate-overflowing block whole rather than parsing its prefix", () => {
	const collector = new ResearchSourceAccessCollector();
	for (let index = 0; index < 4; index++)
		add(collector, JSON.stringify(declaration()).padEnd(65535, " "), index);
	add(collector, JSON.stringify(declaration()), 99);
	const data = required(collector.finish());
	expect(data.entries).toHaveLength(4);
	expect(data.entries.some((item) => item.source.offset === 99)).toBe(false);
	expect(data.truncated).toBe(true);
});

it("accepts exactly sixteen entries and marks only actual overflow as truncated", () => {
	const values = Array.from({ length: 16 }, () => declaration());
	const boundary = required(collect(values));
	expect(boundary.entries).toEqual(
		values.map((_, index) => entry(`$[${index}]`)),
	);
	expect(boundary.truncated).toBe(false);
	const overflow = required(collect([...values, declaration()]));
	expect(overflow).toEqual({ ...boundary, truncated: true });
});

it("enforces the entry cap globally across eligible blocks", () => {
	const collector = new ResearchSourceAccessCollector();
	add(
		collector,
		JSON.stringify(Array.from({ length: 15 }, () => declaration())),
		1,
	);
	add(collector, JSON.stringify(declaration()), 2);
	const boundary = required(collector.finish());
	expect(boundary.entries).toHaveLength(16);
	expect(boundary.entries[15]).toEqual(entry("$", false, 2));
	expect(boundary.truncated).toBe(false);
	add(collector, JSON.stringify(declaration()), 3);
	expect(collector.finish()).toEqual({ ...boundary, truncated: true });
});

it("accepts exactly 256 visited values including primitives and the root array", () => {
	const values = [...Array.from({ length: 254 }, () => null), declaration()];
	const boundary = required(collect(values));
	expect(boundary.entries).toEqual([entry("$[254]")]);
	expect(boundary.truncated).toBe(false);
	const overflow = required(collect([...values, declaration()]));
	expect(overflow).toEqual({ ...boundary, truncated: true });
});

it("enforces the visited-value cap globally across blocks", () => {
	const collector = new ResearchSourceAccessCollector();
	add(collector, JSON.stringify(Array.from({ length: 253 }, () => null)), 1);
	add(collector, JSON.stringify(declaration()), 2);
	add(collector, JSON.stringify(declaration()), 3);
	const boundary = required(collector.finish());
	expect(boundary.entries).toEqual([
		entry("$", false, 2),
		entry("$", false, 3),
	]);
	expect(boundary.truncated).toBe(false);
	add(collector, JSON.stringify(declaration()), 4);
	expect(collector.finish()).toEqual({ ...boundary, truncated: true });
});

it("accepts declarations at depth sixteen with root depth zero", () => {
	const data = required(collect(nestedDeclaration(16)));
	expect(data.entries).toEqual([entry(`$${".hasPart".repeat(16)}`)]);
	expect(data.truncated).toBe(false);
});

it("skips depth seventeen while retaining shallower declarations", () => {
	const data = required(
		collect({ ...nestedDeclaration(17), isAccessibleForFree: true }),
	);
	expect(data.entries).toEqual([entry("$", true)]);
	expect(data.truncated).toBe(true);
	expect(collect(nestedDeclaration(17))).toBeUndefined();
});

it("resets traversal depth for each block rather than accumulating it", () => {
	const collector = new ResearchSourceAccessCollector();
	add(collector, JSON.stringify(nestedDeclaration(16)), 1);
	add(collector, JSON.stringify(nestedDeclaration(16)), 2);
	const data = required(collector.finish());
	expect(data.entries).toEqual([
		entry(`$${".hasPart".repeat(16)}`, false, 1),
		entry(`$${".hasPart".repeat(16)}`, false, 2),
	]);
	expect(data.truncated).toBe(false);
});

it("deeply freezes collector snapshots without mutating earlier finishes", () => {
	const collector = new ResearchSourceAccessCollector();
	add(collector, JSON.stringify(declaration()), 1);
	const before = required(collector.finish());
	expectFrozen(before);
	add(
		collector,
		JSON.stringify(declaration({ isAccessibleForFree: "TRUE" })),
		2,
	);
	const after = required(collector.finish());
	expect(after.entries).toEqual([entry("$", false, 1), entry("$", "TRUE", 2)]);
	expectFrozen(after);
	expect(before.entries).toEqual([entry("$", false, 1)]);
	expect(JSON.parse(JSON.stringify(after))).toEqual(after);
});

it("copies and deeply freezes setter input while discarding unrelated properties", () => {
	const document = tree();
	const original = required(collect());
	const mutable = JSON.parse(JSON.stringify(original));
	mutable.unknown = "discard";
	mutable.entries[0].unknown = "discard";
	mutable.entries[0].source.unknown = "discard";
	setResearchSourceAccess(document, mutable);
	const stored = required(researchSourceAccess(document));
	expect(stored).toEqual(original);
	expect(stored).not.toBe(mutable);
	expect(stored.entries).not.toBe(mutable.entries);
	expect(stored.entries[0]).not.toBe(mutable.entries[0]);
	expect(stored.entries[0].source).not.toBe(mutable.entries[0].source);
	expectFrozen(stored);
	mutable.entries[0].source.offset = 99;
	mutable.entries[0].path = "changed";
	mutable.entries[0].value = true;
	mutable.entries.length = 0;
	mutable.truncated = true;
	expect(stored).toEqual(original);
});

it("keeps metadata isolated between trees and setter replacements", () => {
	const first = tree();
	const second = tree();
	expect(researchSourceAccess(first)).toBeUndefined();
	expect(researchSourceAccess(second)).toBeUndefined();
	const original = required(collect());
	setResearchSourceAccess(first, original);
	setResearchSourceAccess(second, original);
	const previous = required(researchSourceAccess(first));
	const replacement = required(
		collect(declaration({ isAccessibleForFree: true })),
	);
	setResearchSourceAccess(first, replacement);
	expect(researchSourceAccess(first)).toEqual(replacement);
	expect(researchSourceAccess(second)).toEqual(original);
	expect(previous).toEqual(original);
	first.close();
	expect(researchSourceAccess(first)).toBeUndefined();
	expect(researchSourceAccess(second)).toEqual(original);
});

it("cleans up on tree close without accumulating handlers on repeated setters", () => {
	const document = tree();
	const data = required(collect());
	for (let index = 0; index < 70; index++)
		setResearchSourceAccess(document, data);
	for (let index = 0; index < 63; index++) document.onClose(() => {});
	const stored = required(researchSourceAccess(document));
	document.close();
	document.close();
	expect(researchSourceAccess(document)).toBeUndefined();
	expect(() => setResearchSourceAccess(document, data)).toThrow("closed");
	expect(researchSourceAccess(document)).toBeUndefined();
	expect(stored).toEqual(data);
});

it("fits the entire envelope at its exact serialized UTF8 byte boundary", () => {
	const data = fittingFixture();
	const limit = bytes(data);
	expect(fitResearchSourceAccess(data, limit)).toEqual(data);
	expect(fitResearchSourceAccess(data, limit + 1)).toEqual(data);
	expect(fitResearchSourceAccess(data, Number.MAX_SAFE_INTEGER)).toEqual(data);
	const smaller = required(fitResearchSourceAccess(data, limit - 1));
	expect(smaller).toEqual({
		...data,
		truncated: true,
		entries: data.entries.slice(0, 2),
	});
	expect(bytes(smaller)).toBeLessThanOrEqual(limit - 1);
	expectFrozen(smaller);
	expect(data.truncated).toBe(false);
	expect(data.entries).toHaveLength(3);
});

it("fits whole entry prefixes at exact boundaries without shortening values", () => {
	const data = fittingFixture();
	for (const count of [1, 2]) {
		const expected = {
			...data,
			truncated: true,
			entries: data.entries.slice(0, count),
		};
		const limit = bytes(expected);
		const fitted = required(fitResearchSourceAccess(data, limit));
		expect(fitted).toEqual(expected);
		expect(bytes(fitted)).toBe(limit);
		expectFrozen(fitted);
		const below = fitResearchSourceAccess(data, limit - 1);
		if (count === 1) expect(below).toBeUndefined();
		else
			expect(required(below).entries).toEqual(data.entries.slice(0, count - 1));
	}
});

it("returns undefined instead of an empty marker when no whole entry fits", () => {
	const data = fittingFixture();
	const first = { ...data, truncated: true, entries: data.entries.slice(0, 1) };
	for (const limit of [
		0,
		1,
		bytes({ ...data, truncated: true, entries: [] }),
		bytes(first) - 1,
	])
		expect(fitResearchSourceAccess(data, limit)).toBeUndefined();
});

it("counts UTF8 and JSON escaping rather than string length when fitting", () => {
	const document = tree();
	const fixture = fittingFixture();
	setResearchSourceAccess(document, {
		...fixture,
		entries: [
			{ ...fixture.entries[0], path: '$["界😀\\"\n"]' },
			fixture.entries[1],
		],
	});
	const data = required(researchSourceAccess(document));
	const expected = {
		...data,
		truncated: true,
		entries: data.entries.slice(0, 1),
	};
	const limit = bytes(expected);
	expect(limit).toBeGreaterThan(JSON.stringify(expected).length);
	expect(fitResearchSourceAccess(data, limit)).toEqual(expected);
	expect(fitResearchSourceAccess(data, limit - 1)).toBeUndefined();
	expect(
		fitResearchSourceAccess(data, JSON.stringify(expected).length),
	).toBeUndefined();
});

it("never skips an oversized first entry to admit a later smaller entry", () => {
	const document = tree();
	const fixture = fittingFixture();
	setResearchSourceAccess(document, {
		...fixture,
		entries: [
			{ ...fixture.entries[0], path: `$.${"hasPart.".repeat(16)}` },
			fixture.entries[1],
		],
	});
	const data = required(researchSourceAccess(document));
	const onlyLater = { ...data, truncated: true, entries: [data.entries[1]] };
	expect(fitResearchSourceAccess(data, bytes(onlyLater))).toBeUndefined();
});

it("preserves existing truncation and source identity through additional fitting", () => {
	const data = required(
		collect(Array.from({ length: 17 }, () => declaration())),
	);
	expect(data.truncated).toBe(true);
	expect(fitResearchSourceAccess(data, bytes(data))).toEqual(data);
	const expected = { ...data, entries: data.entries.slice(0, 2) };
	const fitted = required(fitResearchSourceAccess(data, bytes(expected)));
	expect(fitted).toEqual(expected);
	expect(fitResearchSourceAccess(fitted, bytes(fitted))).toEqual(fitted);
	expectFrozen(fitted);
	expect(data.entries).toHaveLength(16);
});

it("never exceeds any byte budget across the full fitting boundary range", () => {
	const data = fittingFixture();
	for (let limit = 0; limit <= bytes(data) + 1; limit++) {
		const fitted = fitResearchSourceAccess(data, limit);
		if (!fitted) continue;
		expect(bytes(fitted)).toBeLessThanOrEqual(limit);
		expect(fitted.entries.length).toBeGreaterThan(0);
		expect(fitted.entries).toEqual(
			data.entries.slice(0, fitted.entries.length),
		);
		expect(fitted.truncated).toBe(fitted.entries.length < data.entries.length);
	}
});

it("rejects budgets that are not safe nonnegative integers", () => {
	const data = fittingFixture();
	for (const limit of [
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		"256",
		null,
		undefined,
		true,
		{},
		1n,
	])
		expect(() => fitResearchSourceAccess(data, limit as number)).toThrow();
});
