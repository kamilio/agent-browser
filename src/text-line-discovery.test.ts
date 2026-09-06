import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	type TextLineDiscoveryOptions,
	discoverTextLines,
} from "./text-line-discovery.js";

function expectFailure(
	action: () => unknown,
	code: "invalid-input" | "resource-limit" = "invalid-input",
) {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({
		name: "AgentBrowserError",
		code,
		message:
			code === "invalid-input"
				? "Invalid text line discovery input."
				: "Text line discovery source limit exceeded.",
	});
	expect(caught).not.toHaveProperty("cause");
}

it("returns only ordered line coordinates and aggregate metadata", () => {
	const source = "skip\n  target tail\r\nx target\rtarget";
	expect(discoverTextLines(source, "target")).toEqual({
		entries: [
			{ line: 2, column: 3 },
			{ line: 3, column: 3 },
			{ line: 4, column: 1 },
		],
		totalLines: 4,
		matchedLines: 3,
		sourceCodeUnits: source.length,
		truncated: false,
	});
});

it("keeps only the first repeated or overlapping match on each line", () => {
	expect(discoverTextLines("aaaaa\nxxaaaaaa\naaa aaa", "aaa")).toEqual({
		entries: [
			{ line: 1, column: 1 },
			{ line: 2, column: 3 },
			{ line: 3, column: 1 },
		],
		totalLines: 3,
		matchedLines: 3,
		sourceCodeUnits: 22,
		truncated: false,
	});
});

it("finds single-code-unit queries without duplicate entries", () => {
	expect(discoverTextLines("xxx\n--x-x\nx", "x").entries).toEqual([
		{ line: 1, column: 1 },
		{ line: 2, column: 3 },
		{ line: 3, column: 1 },
	]);
});

it("falls back through query prefixes without skipping the first match", () => {
	expect(discoverTextLines("abababaca\nababaca", "ababaca").entries).toEqual([
		{ line: 1, column: 3 },
		{ line: 2, column: 1 },
	]);
});

it("never carries a query prefix across any line boundary", () => {
	for (const ending of ["\n", "\r", "\r\n"]) {
		const source = `ab${ending}c${ending}abc`;
		expect(discoverTextLines(source, "abc")).toEqual({
			entries: [{ line: 3, column: 1 }],
			totalLines: 3,
			matchedLines: 1,
			sourceCodeUnits: source.length,
			truncated: false,
		});
	}
});

it("counts mixed LF, CR and CRLF boundaries and interior empty lines", () => {
	const source = "hit\r\n\rhit\n\nhit\rhit\r\n";
	expect(discoverTextLines(source, "hit")).toEqual({
		entries: [
			{ line: 1, column: 1 },
			{ line: 3, column: 1 },
			{ line: 5, column: 1 },
			{ line: 6, column: 1 },
		],
		totalLines: 7,
		matchedLines: 4,
		sourceCodeUnits: source.length,
		truncated: false,
	});
});

it("counts newline-only sources including adjacent mixed boundaries", () => {
	const cases: [string, number][] = [
		["\n", 2],
		["\r", 2],
		["\r\n", 2],
		["\n\r", 3],
		["\r\r\n\n", 4],
		["\r\n\r\n", 3],
	];
	for (const [source, totalLines] of cases)
		expect(discoverTextLines(source, "x")).toEqual({
			entries: [],
			totalLines,
			matchedLines: 0,
			sourceCodeUnits: source.length,
			truncated: false,
		});
});

it("retains one empty line for an empty source", () => {
	expect(discoverTextLines("", "x")).toEqual({
		entries: [],
		totalLines: 1,
		matchedLines: 0,
		sourceCodeUnits: 0,
		truncated: false,
	});
});

it("retains an empty final line after each supported trailing newline", () => {
	for (const ending of ["\n", "\r", "\r\n"])
		expect(discoverTextLines(`x${ending}`, "x")).toEqual({
			entries: [{ line: 1, column: 1 }],
			totalLines: 2,
			matchedLines: 1,
			sourceCodeUnits: 1 + ending.length,
			truncated: false,
		});
});

it("matches case sensitively without case folding", () => {
	expect(
		discoverTextLines("TARGET\nTarget target\ntarget", "target").entries,
	).toEqual([
		{ line: 2, column: 8 },
		{ line: 3, column: 1 },
	]);
	expect(discoverTextLines("ß", "ss").matchedLines).toBe(0);
});

it("does not normalize combining characters", () => {
	expect(discoverTextLines("e\u0301\né", "é").entries).toEqual([
		{ line: 2, column: 1 },
	]);
	expect(discoverTextLines("é\ne\u0301", "e\u0301").entries).toEqual([
		{ line: 2, column: 1 },
	]);
});

it("reports raw UTF-16 columns rather than glyph or code-point positions", () => {
	const source = "😀e\u0301界target\r\n\t😀target";
	expect(discoverTextLines(source, "target")).toEqual({
		entries: [
			{ line: 1, column: 6 },
			{ line: 2, column: 4 },
		],
		totalLines: 2,
		matchedLines: 2,
		sourceCodeUnits: 22,
		truncated: false,
	});
});

it("matches paired and lone surrogate code units literally", () => {
	expect(discoverTextLines("x😀\n😀", "😀").entries).toEqual([
		{ line: 1, column: 2 },
		{ line: 2, column: 1 },
	]);
	expect(discoverTextLines("😀\nx\ude00", "\ude00").entries).toEqual([
		{ line: 1, column: 2 },
		{ line: 2, column: 2 },
	]);
	expect(discoverTextLines("x\ud800", "\ud800").entries).toEqual([
		{ line: 1, column: 2 },
	]);
});

it("treats regex syntax and backslashes as literal text", () => {
	const query = ".*+?^${}()|[]\\";
	expect(discoverTextLines(`xx${query}\nanything`, query).entries).toEqual([
		{ line: 1, column: 3 },
	]);
	expect(discoverTextLines("abc\n.*", ".*").entries).toEqual([
		{ line: 2, column: 1 },
	]);
});

it("keeps Unicode separators and control characters inside literal lines", () => {
	const source = "a\u2028\u2029\u0085\v\f\0\tb";
	expect(discoverTextLines(source, "\u2028\u2029\u0085\v\f\0\t")).toEqual({
		entries: [{ line: 1, column: 2 }],
		totalLines: 1,
		matchedLines: 1,
		sourceCodeUnits: 9,
		truncated: false,
	});
});

it("counts every line even when the query is longer than any line", () => {
	expect(discoverTextLines("a\rb\nc\r\n", "long query")).toEqual({
		entries: [],
		totalLines: 4,
		matchedLines: 0,
		sourceCodeUnits: 7,
		truncated: false,
	});
});

it("defaults to fifty entries while retaining complete totals", () => {
	const result = discoverTextLines("x\n".repeat(51), "x");
	expect(result.entries).toEqual(
		Array.from({ length: 50 }, (_, index) => ({
			line: index + 1,
			column: 1,
		})),
	);
	expect(result).toMatchObject({
		totalLines: 52,
		matchedLines: 51,
		sourceCodeUnits: 102,
		truncated: true,
	});
});

it("uses the default for omitted or explicitly undefined optional values", () => {
	const source = "x\n".repeat(50);
	const expected = discoverTextLines(source, "x");
	expect(discoverTextLines(source, "x", {})).toEqual(expected);
	expect(discoverTextLines(source, "x", undefined)).toEqual(expected);
	expect(discoverTextLines(source, "x", { maxEntries: undefined })).toEqual(
		expected,
	);
	expect(expected.entries).toHaveLength(50);
	expect(expected.truncated).toBe(false);
});

it("does not truncate an exact minimum cap or repeated matches on one line", () => {
	expect(discoverTextLines("xxx\nno\r\n", "x", { maxEntries: 1 })).toEqual({
		entries: [{ line: 1, column: 1 }],
		totalLines: 3,
		matchedLines: 1,
		sourceCodeUnits: 8,
		truncated: false,
	});
});

it("accepts exactly two hundred retained matching lines without truncation", () => {
	const result = discoverTextLines("x\n".repeat(200), "x", {
		maxEntries: 200,
	});
	expect(result.entries).toHaveLength(200);
	expect(result.entries[199]).toEqual({ line: 200, column: 1 });
	expect(result).toMatchObject({
		totalLines: 201,
		matchedLines: 200,
		sourceCodeUnits: 400,
		truncated: false,
	});
});

it("counts matching and nonmatching lines after either entry cap overflows", () => {
	for (const maxEntries of [1, 200]) {
		const source = "x\r\nmiss\r".repeat(205);
		const result = discoverTextLines(source, "x", { maxEntries });
		expect(result.entries).toEqual(
			Array.from({ length: maxEntries }, (_, index) => ({
				line: index * 2 + 1,
				column: 1,
			})),
		);
		expect(result).toMatchObject({
			totalLines: 411,
			matchedLines: 205,
			sourceCodeUnits: source.length,
			truncated: true,
		});
	}
});

it("accepts the exact UTF-16 source cap and finds a match at its end", () => {
	const source = `${"😀".repeat(999_999)}xy`;
	expect(discoverTextLines(source, "xy")).toEqual({
		entries: [{ line: 1, column: 1_999_999 }],
		totalLines: 1,
		matchedLines: 1,
		sourceCodeUnits: 2_000_000,
		truncated: false,
	});
});

it("rejects an oversized source even if a match occurs immediately", () => {
	expectFailure(
		() => discoverTextLines(`x${"😀".repeat(1_000_000)}`, "x"),
		"resource-limit",
	);
});

it("accepts query lengths one and 256 measured in UTF-16 code units", () => {
	for (const query of ["x", "a".repeat(256), "😀".repeat(128)])
		expect(discoverTextLines(`-${query}`, query).entries).toEqual([
			{ line: 1, column: 2 },
		]);
});

it("rejects empty, oversized and newline-bearing queries even on empty input", () => {
	for (const query of [
		"",
		"a".repeat(257),
		"😀".repeat(129),
		"\r",
		"\n",
		"\r\n",
		"a\rb",
		"a\nb",
		"a\r\nb",
	])
		expectFailure(() => discoverTextLines("", query));
});

it("requires a primitive source string without coercing invalid values", () => {
	for (const source of [
		null,
		undefined,
		1,
		true,
		1n,
		Symbol("private source"),
		[],
		{},
		Object("x"),
		() => "x",
		{
			toString() {
				throw new Error("private coercion");
			},
		},
	])
		expectFailure(() => discoverTextLines(source as string, "x"));
});

it("requires a primitive query string without coercing invalid values", () => {
	for (const query of [
		null,
		undefined,
		1,
		false,
		1n,
		Symbol("private query"),
		[],
		{},
		Object("x"),
		() => "x",
		{
			toString() {
				throw new Error("private coercion");
			},
		},
	])
		expectFailure(() => discoverTextLines("x", query as string));
});

it("rejects null, arrays and nonobject options without coercion", () => {
	for (const options of [
		null,
		[],
		Object.assign([], { maxEntries: 1 }),
		"options",
		1,
		true,
		1n,
		Symbol("private options"),
		() => ({ maxEntries: 1 }),
	])
		expectFailure(() =>
			discoverTextLines("", "x", options as TextLineDiscoveryOptions),
		);
});

it("rejects invalid entry limits rather than clamping or coercing them", () => {
	for (const maxEntries of [
		0,
		-0,
		-1,
		1.5,
		201,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.MAX_SAFE_INTEGER,
		null,
		"1",
		true,
		1n,
		Symbol("private limit"),
		[],
		{},
		Object(1),
		{
			valueOf() {
				throw new Error("private numeric coercion");
			},
		},
	])
		expectFailure(() =>
			discoverTextLines("", "x", { maxEntries: maxEntries as number }),
		);
});

it("accepts frozen, inherited and null-prototype object options", () => {
	for (const options of [
		Object.freeze({ maxEntries: 1 }),
		Object.create({ maxEntries: 1 }) as TextLineDiscoveryOptions,
		Object.assign(Object.create(null), { maxEntries: 1 }),
	]) {
		const result = discoverTextLines("x\nx", "x", options);
		expect(result.entries).toEqual([{ line: 1, column: 1 }]);
		expect(result.matchedLines).toBe(2);
		expect(result.truncated).toBe(true);
	}
});

it("replaces thrown getter values with a fixed error and no cause", () => {
	for (const thrown of [
		new Error("private getter text"),
		"private thrown string",
		new AgentBrowserError("resource-limit", "private forged error"),
		{
			toString() {
				throw new Error("private thrown object");
			},
		},
	])
		expectFailure(() =>
			discoverTextLines("private source", "private query", {
				get maxEntries(): number {
					throw thrown;
				},
			}),
		);
});

it("replaces hostile proxy errors without retaining their messages", () => {
	const options = new Proxy<TextLineDiscoveryOptions>(
		{},
		{
			get() {
				throw new Error("private proxy text");
			},
		},
	);
	expectFailure(() => discoverTextLines("", "x", options));
});

it("replaces revoked proxy errors from object validation", () => {
	const { proxy, revoke } = Proxy.revocable<TextLineDiscoveryOptions>({}, {});
	revoke();
	expectFailure(() => discoverTextLines("", "x", proxy));
});

it("reads a valid entry getter once and retains only its numeric value", () => {
	let reads = 0;
	let limit = 1;
	const options = {
		get maxEntries() {
			reads++;
			return limit;
		},
	};
	const result = discoverTextLines("x\nx\nx", "x", options);
	limit = 200;
	expect(reads).toBe(1);
	expect(result.entries).toEqual([{ line: 1, column: 1 }]);
	expect(result.matchedLines).toBe(3);
	expect(result.truncated).toBe(true);
});

it("counts many short matching lines after the output cap", () => {
	const result = discoverTextLines("x\n".repeat(100_000), "x", {
		maxEntries: 2,
	});
	expect(result).toEqual({
		entries: [
			{ line: 1, column: 1 },
			{ line: 2, column: 1 },
		],
		totalLines: 100_001,
		matchedLines: 100_000,
		sourceCodeUnits: 200_000,
		truncated: true,
	});
});

it("counts the maximum newline-only source without retaining entries", () => {
	expect(discoverTextLines("\n".repeat(2_000_000), "x")).toEqual({
		entries: [],
		totalLines: 2_000_001,
		matchedLines: 0,
		sourceCodeUnits: 2_000_000,
		truncated: false,
	});
});

it("handles repetitive near-matches followed by a late first match", () => {
	const query = `${"a".repeat(255)}b`;
	const source = `${"a".repeat(100_000)}b\r\n${"a".repeat(100_000)}c`;
	expect(discoverTextLines(source, query)).toEqual({
		entries: [{ line: 1, column: 99_746 }],
		totalLines: 2,
		matchedLines: 1,
		sourceCodeUnits: 200_004,
		truncated: false,
	});
});

it("returns fresh arrays, records and metadata across calls", () => {
	const first = discoverTextLines("x\nx", "x");
	const second = discoverTextLines("x\nx", "x");
	expect(first).not.toBe(second);
	expect(first.entries).not.toBe(second.entries);
	expect(first.entries[0]).not.toBe(second.entries[0]);
	expect(first.entries[0]).not.toBe(first.entries[1]);
	first.entries[0].line = 999;
	first.entries.pop();
	first.totalLines = 999;
	expect(second).toEqual({
		entries: [
			{ line: 1, column: 1 },
			{ line: 2, column: 1 },
		],
		totalLines: 2,
		matchedLines: 2,
		sourceCodeUnits: 3,
		truncated: false,
	});
	expect(discoverTextLines("x\nx", "x")).toEqual(second);
	expect(discoverTextLines("", "x").entries).not.toBe(
		discoverTextLines("", "x").entries,
	);
});

it("does not retain caller options or mutable holders of input strings", () => {
	const input = { source: "x\nx", query: "x" };
	const options = { maxEntries: 1 };
	const result = discoverTextLines(input.source, input.query, options);
	expect(input).toEqual({ source: "x\nx", query: "x" });
	expect(options).toEqual({ maxEntries: 1 });
	input.source = "changed";
	input.query = "changed";
	options.maxEntries = 200;
	expect(result).toEqual({
		entries: [{ line: 1, column: 1 }],
		totalLines: 2,
		matchedLines: 2,
		sourceCodeUnits: 3,
		truncated: true,
	});
});
