import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type SourceHeadingStructureReason,
	discoverResearchSourceHeadings,
	researchSourceHeadingLimits,
	sourceHeadingStructureDiagnostic,
} from "../scripts/research-source-headings.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { HtmlTokenCursor } from "./html-token-cursor.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
} from "./resource-limit.js";

const method = "native-source-headings-v1";
const privateMarker = "SYNTHETIC_PRIVATE_SOURCE_NOT_A_TITLE";
const encoder = new TextEncoder();
const controllers: AbortController[] = [];
const canonicalLimits = {
	maxInputBytes: 4_000_000,
	maxSourceCodeUnits: 4_000_000,
	maxWindowCodeUnits: 65_536,
	maxWorkUnits: 32_000_000,
	maxOperations: 200_000,
	maxIssues: 1_024,
	timeoutMs: 120_000,
	maxTrackedDepth: 128,
	maxHeadingCodeUnits: 16_384,
	maxEntries: 256,
	maxTitleCodeUnits: 256,
	maxOutputBytes: 65_536,
	yieldEveryOperations: 256,
	yieldEveryWorkUnits: 32_768,
};
const rawNames = [
	"script",
	"style",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
	"title",
	"textarea",
] as const;
const suppressedNames = [
	"head",
	"template",
	"select",
	"table",
	"caption",
	"colgroup",
	"tbody",
	"thead",
	"tfoot",
	"tr",
	"td",
	"th",
] as const;
const omittedFrames = [
	"svg",
	"math",
	"object",
	"canvas",
	"frameset",
	"audio",
	"video",
] as const;
const voidNames = [
	"area",
	"base",
	"br",
	"col",
	"embed",
	"frame",
	"hr",
	"img",
	"input",
	"keygen",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
] as const;
const omittedVoids = new Set([
	"embed",
	"frame",
	"input",
	"link",
	"meta",
	"source",
	"track",
]);
const inlineNames = [
	"span",
	"a",
	"b",
	"strong",
	"i",
	"em",
	"code",
	"small",
	"sub",
	"sup",
] as const;

afterEach(() => {
	for (const controller of controllers.splice(0)) controller.abort();
	if (vi.isFakeTimers()) vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function ownedSource(text: string) {
	return {
		finalUrl: "https://example.com/",
		contentType: "text/html; charset=utf-8",
		body: encoder.encode(text),
	};
}

function controllerFor() {
	const controller = new AbortController();
	controllers.push(controller);
	return controller;
}

function scan(text: string, limits: Record<string, unknown> = {}) {
	return discoverResearchSourceHeadings(ownedSource(text), {
		method,
		...limits,
	});
}

async function captureFailure(operation: () => unknown): Promise<unknown> {
	try {
		await operation();
	} catch (error) {
		return error;
	}
	throw new Error("Expected source-heading discovery to fail");
}

function expectCode(error: unknown, code: ErrorCode) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code });
	if (code !== "unsupported")
		expect(sourceHeadingStructureDiagnostic(error)).toBeUndefined();
}

function expectLimit(error: unknown, diagnostic: ResourceLimitDiagnostic) {
	expectCode(error, "resource-limit");
	expect(resourceLimitDiagnostic(error)).toEqual(diagnostic);
	expect(Object.isFrozen(resourceLimitDiagnostic(error))).toBe(true);
	expect(
		resourceLimitDiagnostic({ ...diagnostic, code: "resource-limit" }),
	).toBeUndefined();
}

async function expectUnsupported(text: string) {
	const error = await captureFailure(() => scan(text));
	expectCode(error, "unsupported");
	expect((error as Error).message).not.toContain(privateMarker);
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	expect(sourceHeadingStructureDiagnostic(error)?.kind).toBe(
		"source-heading-structure",
	);
}

function expectDeepFrozen(value: unknown, depth = 0) {
	if (value === null || typeof value !== "object") return;
	expect(depth).toBeLessThan(16);
	expect(Object.isFrozen(value)).toBe(true);
	for (const nested of Object.values(value))
		expectDeepFrozen(nested, depth + 1);
}

function sha256(value: string | Uint8Array) {
	return createHash("sha256").update(value).digest("hex");
}

function observe<Result>(promise: Promise<Result>) {
	let settled = false;
	const outcome = promise.then(
		(value) => {
			settled = true;
			return { value, error: undefined };
		},
		(error: unknown) => {
			settled = true;
			return { value: undefined, error };
		},
	);
	return {
		outcome,
		get settled() {
			return settled;
		},
	};
}

async function microtasks() {
	for (let step = 0; step < 16; step++) await Promise.resolve();
}

describe("explicit scanner method and immutable admission", () => {
	it("requires explicit method before accessing the input record", async () => {
		let touched = 0;
		const input = new Proxy(
			{},
			{
				get() {
					touched++;
					throw new Error(privateMarker);
				},
				ownKeys() {
					touched++;
					throw new Error(privateMarker);
				},
				getPrototypeOf() {
					touched++;
					throw new Error(privateMarker);
				},
			},
		);
		for (const options of [
			undefined,
			null,
			[],
			{},
			"native-source-headings-v1",
			{ method: undefined },
			{ method: "reader" },
			{ method, unknown: 1 },
			{ method, [Symbol("extra")]: 1 },
			Object.create({ method }),
		]) {
			const error = await captureFailure(() =>
				discoverResearchSourceHeadings(input, options),
			);
			expectCode(error, "invalid-input");
			expect((error as Error).message).not.toContain(privateMarker);
		}
		expect(touched).toBe(0);
	});

	it("rejects accessor and proxy options without evaluating their traps", async () => {
		let touched = 0;
		const accessor = Object.defineProperty({}, "method", {
			enumerable: true,
			get() {
				touched++;
				return method;
			},
		});
		const proxy = new Proxy(
			{ method },
			{
				ownKeys() {
					touched++;
					throw new Error(privateMarker);
				},
				getPrototypeOf() {
					touched++;
					throw new Error(privateMarker);
				},
			},
		);
		for (const options of [accessor, proxy]) {
			expectCode(
				await captureFailure(() =>
					discoverResearchSourceHeadings(ownedSource(""), options),
				),
				"invalid-input",
			);
		}
		expect(touched).toBe(0);
	});

	for (const key of Object.keys(canonicalLimits) as Array<
		keyof typeof canonicalLimits
	>) {
		it(`strictly bounds ${key} before touching input`, async () => {
			let touched = 0;
			const input = Object.defineProperty({}, "body", {
				get() {
					touched++;
					throw new Error(privateMarker);
				},
			});
			const coercible = {
				valueOf() {
					touched++;
					return 1;
				},
			};
			for (const value of [
				undefined,
				null,
				true,
				"1",
				coercible,
				-1,
				0.5,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
				canonicalLimits[key] + 1,
				...(key === "maxIssues" ? [] : [0]),
			]) {
				expectCode(
					await captureFailure(() =>
						discoverResearchSourceHeadings(input, { method, [key]: value }),
					),
					"invalid-input",
				);
			}
			expect(touched).toBe(0);
		});
	}

	it("pins every default ceiling and recursively freezes owned output", async () => {
		const result = await scan("<h1>One</h1>");
		expect(researchSourceHeadingLimits).toEqual(canonicalLimits);
		expect(Object.isFrozen(researchSourceHeadingLimits)).toBe(true);
		expect(result.report.limits).toEqual(canonicalLimits);
		expectDeepFrozen(result);
		expect(Reflect.set(result.report.entries[0], "title", "changed")).toBe(
			false,
		);
		expect(Reflect.set(result.report.limits, "maxEntries", 1)).toBe(false);
		expect(result.report).toMatchObject({
			kind: "source-heading-candidates",
			method,
			semantics: "lexical-not-dom",
			partial: true,
			contentSuccess: null,
			completion: "eof",
			scannedTo: 12,
		});
		expect(Object.keys(result).sort()).toEqual([
			"jsonl",
			"outputBytes",
			"report",
		]);
	});

	it("snapshots options and owned bytes before the first asynchronous yield", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const text = "<h1>Original</h1><h2>Second</h2>";
		const input = ownedSource(text);
		const originalBytes = input.body.slice();
		const options = { method, maxEntries: 2, yieldEveryOperations: 1 };
		const controller = controllerFor();
		const pending = observe(
			discoverResearchSourceHeadings(input, options, controller.signal),
		);
		await microtasks();
		expect(pending.settled).toBe(false);
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		input.body.fill(0x78);
		input.finalUrl = "https://changed.example/";
		options.maxEntries = 1;
		await vi.runAllTimersAsync();
		const outcome = await pending.outcome;
		expect(outcome.error).toBeUndefined();
		expect(outcome.value?.report.entries.map((entry) => entry.title)).toEqual([
			"Original",
			"Second",
		]);
		expect(outcome.value?.report.source.bytes.sha256).toBe(
			sha256(originalBytes),
		);
		expect(outcome.value?.report.source.reportedFinalUrl).toBe(
			"https://example.com/",
		);
		expect(outcome.value?.report.limits.maxEntries).toBe(2);
	});
});

describe("completed decoder-output UTF16 anchors and compact bounded JSONL", () => {
	it("preserves BOM identity, CRLF and Unicode source ranges before normalization", async () => {
		const prefix = "<!doctype html>\r\n<!--synthetic-->";
		const startTag = '<h2 id="unused">';
		const interior = " A\r\n😀 &amp; <em>B</em> ";
		const endTag = "</h2>";
		const decoded = `${prefix}${startTag}${interior}${endTag}\r\n`;
		const input = ownedSource(`\ufeff${decoded}`);
		const result = await discoverResearchSourceHeadings(input, { method });
		expect(result.report.source).toEqual({
			kind: "decoded-html-source-v1",
			reportedFinalUrl: input.finalUrl,
			contentType: input.contentType,
			bytes: { length: input.body.byteLength, sha256: sha256(input.body) },
			decoder: {
				policy: "native-research-html-v1",
				encoding: "utf-8",
				bomConsumed: true,
			},
			text: {
				codeUnits: decoded.length,
				sha256: sha256(decoded),
				digestEncoding: "utf-8",
				coordinates: "decoder-output-utf16-before-parser-normalization",
			},
		});
		expect(result.report.entries).toEqual([
			{
				ordinal: 1,
				level: 2,
				title: "A 😀 & B",
				titleTruncated: false,
				anchor: {
					kind: "source-utf16-range-v1",
					startTag: {
						start: prefix.length,
						end: prefix.length + startTag.length,
					},
					endTag: {
						start: prefix.length + startTag.length + interior.length,
						end: decoded.length - 2,
					},
				},
			},
		]);
		expect(result.report.scannedTo).toBe(decoded.length);
	});

	it("publishes exact escaped UTF8 JSON plus LF without unrelated source text", async () => {
		const title = 'Quote" slash\\ control\u0001 😀';
		const result = await scan(`<!--${privateMarker}--><h1>${title}</h1>`);
		expect(result.report.entries[0].title).toBe(title);
		expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.jsonl).toContain("\\u0001");
		expect(result.jsonl).not.toContain(privateMarker);
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(Object.keys(result.report.entries[0]).sort()).toEqual([
			"anchor",
			"level",
			"ordinal",
			"title",
			"titleTruncated",
		]);
		expect(Object.keys(result.report.entries[0].anchor).sort()).toEqual([
			"endTag",
			"kind",
			"startTag",
		]);
	});

	it("admits the exact self-describing JSONL byte cap and rejects one byte less", async () => {
		const text = '<h1>Quote" \\ \u0001 😀</h1>';
		const baseline = await scan(text);
		let cap = baseline.outputBytes;
		for (let attempt = 0; attempt < 8; attempt++) {
			cap = encoder.encode(
				`${JSON.stringify({
					...baseline.report,
					limits: { ...baseline.report.limits, maxOutputBytes: cap },
				})}\n`,
			).byteLength;
		}
		expect(String(cap - 1).length).toBe(String(cap).length);
		const exact = await scan(text, { maxOutputBytes: cap });
		expect(exact.outputBytes).toBe(cap);
		expect(exact.jsonl).toBe(`${JSON.stringify(exact.report)}\n`);
		expectLimit(
			await captureFailure(() => scan(text, { maxOutputBytes: cap - 1 })),
			{
				kind: "source.headings-output",
				unit: "bytes",
				limit: cap - 1,
				observed: cap,
			},
		);
	});

	it("reports the first unadmitted output chunk rather than a hypothetical full length", async () => {
		const error = await captureFailure(() =>
			scan("<h1>X</h1>", {
				maxOutputBytes: 1,
			}),
		);
		expectLimit(error, {
			kind: "source.headings-output",
			unit: "bytes",
			limit: 1,
			observed: encoder.encode('{"kind"').byteLength,
		});
	});

	it("preserves duplicate labels as distinct levels, ordinals and ranges", async () => {
		const source = Array.from(
			{ length: 6 },
			(_, index) => `<h${index + 1}>Same</h${index + 1}>`,
		).join("");
		const result = await scan(source);
		expect(
			result.report.entries.map((entry) => ({
				ordinal: entry.ordinal,
				level: entry.level,
				title: entry.title,
			})),
		).toEqual(
			Array.from({ length: 6 }, (_, index) => ({
				ordinal: index + 1,
				level: index + 1,
				title: "Same",
			})),
		);
		expect(
			new Set(result.report.entries.map((entry) => entry.anchor.startTag.start))
				.size,
		).toBe(6);
	});
});

describe("lexical scopes are not DOM visibility or ancestry", () => {
	it.each(suppressedNames)(
		"suppresses %s with the suppressed classification",
		async (name) => {
			const result = await scan(
				`<${name}><h2>${privateMarker}</h2></${name}><h1>Visible</h1>`,
			);
			expect(result.report.entries.map((entry) => entry.title)).toEqual([
				"Visible",
			]);
			expect(result.report.counters.suppressedStarts).toEqual({ [name]: 1 });
			expect(result.report.counters.omittedStarts).toEqual({});
			expect(result.report.counters.suppressedHeadingStarts).toBe(1);
			expect(result.report.counters.maxTrackedDepth).toBe(1);
			expect(result.jsonl).not.toContain(privateMarker);
		},
	);

	it.each(omittedFrames)(
		"omits %s without resuming foreign integration points",
		async (name) => {
			const result = await scan(
				`<${name}><foreignObject><h2>${privateMarker}</h2></foreignObject></${name}><h1>Visible</h1>`,
			);
			expect(result.report.entries.map((entry) => entry.title)).toEqual([
				"Visible",
			]);
			expect(result.report.counters.omittedStarts).toEqual({ [name]: 1 });
			expect(result.report.counters.suppressedStarts).toEqual({});
			expect(result.report.counters.suppressedHeadingStarts).toBe(1);
			expect(result.jsonl).not.toContain(privateMarker);
		},
	);

	it.each(voidNames)("does not push the finite void name %s", async (name) => {
		const result = await scan(`<${name}><h1>After void</h1>`);
		expect(result.report.entries[0].title).toBe("After void");
		expect(result.report.counters.maxTrackedDepth).toBe(1);
		expect(result.report.counters.omittedStarts).toEqual(
			omittedVoids.has(name) ? { [name]: 1 } : {},
		);
	});

	for (const name of [...suppressedNames, ...omittedFrames]) {
		it(`rejects unmatched, unclosed and mismatched tracked ${name} scopes`, async () => {
			await expectUnsupported(`<${name}><h1>${privateMarker}</h1>`);
			await expectUnsupported(`</${name}><h1>${privateMarker}</h1>`);
			await expectUnsupported(
				`<${name}></${name === "head" ? "template" : "head"}>`,
			);
			await expectUnsupported(`<${name}></${name} extra=x>`);
			await expectUnsupported(`<${name}></${name}/>`);
			if (name !== "svg" && name !== "math")
				await expectUnsupported(`<${name}/><h1>${privateMarker}</h1>`);
		});
	}

	it("accepts immediate foreign self-closes and ignores ordinary ancestry outside headings", async () => {
		const source = `${"<div>".repeat(200)}<svg/><math/><h7>Not a candidate</h7><h1 hidden style="display:none" aria-label="not used">Lexical</h1>${"</div>".repeat(200)}`;
		const result = await scan(source, { maxTrackedDepth: 1 });
		expect(result.report.entries.map((entry) => entry.title)).toEqual([
			"Lexical",
		]);
		expect(result.report.counters.omittedStarts).toEqual({ svg: 1, math: 1 });
		expect(result.report.counters.suppressedHeadingStarts).toBe(0);
	});

	it.each(["plaintext", "noscript"])(
		"rejects %s outside raw even inside suppression",
		async (name) => {
			await expectUnsupported(`<${name}>${privateMarker}</${name}>`);
			await expectUnsupported(
				`<template><${name}>${privateMarker}</${name}></template>`,
			);
		},
	);
});

describe("actual native raw and script state", () => {
	it.each(rawNames)(
		"does not tokenize heading-looking text inside %s",
		async (name) => {
			const source = `<${name}><h1>${privateMarker}</h1><noscript>raw</noscript></${name}><h2>Outside</h2>`;
			const result = await scan(source);
			expect(result.report.entries.map((entry) => entry.title)).toEqual([
				"Outside",
			]);
			expect(result.report.counters.rawStarts).toEqual({ [name]: 1 });
			expect(result.report.counters.suppressedHeadingStarts).toBe(0);
			expect(result.jsonl).not.toContain(privateMarker);
		},
	);

	it.each(rawNames)(
		"requires a plain matching explicit %s close",
		async (name) => {
			for (const source of [
				`<${name}>${privateMarker}`,
				`<${name}/>`,
				`<${name}>${privateMarker}</${name} extra=x>`,
				`<${name}>${privateMarker}</${name}/>`,
			])
				await expectUnsupported(source);
		},
	);

	it("keeps native script double-escaped closing text inside the raw body", async () => {
		const source = `<script><!--<script><h1>${privateMarker}</h1></script>escaped--></script><h2>Outside</h2>`;
		const result = await scan(source);
		expect(result.report.entries.map((entry) => entry.title)).toEqual([
			"Outside",
		]);
		expect(result.report.counters.rawStarts).toEqual({ script: 1 });
		expect(result.report.counters.suppressedHeadingStarts).toBe(0);
		expect(result.jsonl).not.toContain(privateMarker);
	});

	it("counts allowed issues from entity-decoded raw text without publishing that text", async () => {
		const result = await scan(
			`<title>&#0;&lt;h1&gt;${privateMarker}</title><h1>X</h1>`,
		);
		expect(result.report.entries.map((entry) => entry.title)).toEqual(["X"]);
		expect(result.report.counters.rawStarts).toEqual({ title: 1 });
		expect(result.report.counters.issueAttempts).toBe(1);
		expect(result.report.counters.entityIssues).toEqual({
			"invalid-numeric-entity": 1,
		});
		expect(result.jsonl).not.toContain(privateMarker);
	});

	it("includes raw closing-prefix lookahead in the same window budget", async () => {
		const source = "<script>abc</script><h1>X</h1>";
		const accepted = await scan(source, { maxWindowCodeUnits: 12 });
		expect(accepted.report.entries[0].title).toBe("X");
		expectLimit(
			await captureFailure(() => scan(source, { maxWindowCodeUnits: 11 })),
			{
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 11,
				observed: 12,
			},
		);
	});
});

describe("balanced inline titles, native entities and bounded clipping", () => {
	it.each(inlineNames)(
		"accepts only a balanced nonvoid %s wrapper",
		async (name) => {
			const result = await scan(
				`<h1>A<${name} title="ignored">B</${name}>C</h1>`,
			);
			expect(result.report.entries[0].title).toBe("ABC");
			await expectUnsupported(`<h1><${name}/>X</h1>`);
			await expectUnsupported(`<h1><${name}>X</h1>`);
			await expectUnsupported(`<h1><${name}>X</${name} extra=x></h1>`);
			await expectUnsupported(`<h1><${name}>X</${name}/></h1>`);
		},
	);

	it.each([
		"<h1/>",
		"<h1>unfinished",
		"</h1>",
		"<h1>x</h2>",
		"<h1>x<h2>nested</h2></h1>",
		"<h1>x</h1 extra=x>",
		"<h1>x</h1/>",
		"<h1><b><i>x</b></i></h1>",
		"<h1><div>x</div></h1>",
		"<h1><img alt='not a title'></h1>",
		"<h1><script>x</script></h1>",
		"<h1><template>x</template></h1>",
		"<h1></br></h1>",
	])(
		"rejects incomplete or unsupported heading grammar: %s",
		async (source) => {
			await expectUnsupported(source);
		},
	);

	it("normalizes JS whitespace, br and wbr without labels or comment text", async () => {
		const source = `<h1 aria-label="${privateMarker}"> \tA<span>B</span><br> C<wbr>D<!--${privateMarker}--><!doctype html>\u00a0E\u2003 </h1>`;
		const result = await scan(source);
		expect(result.report.entries[0].title).toBe("AB CD E");
		expect(result.report.entries[0].titleTruncated).toBe(false);
		expect(result.jsonl).not.toContain(privateMarker);
	});

	it.each([
		["abc   ", 3, "abc", false],
		["abc   d", 3, "abc", true],
		["ab c", 3, "ab", true],
		["  \r\n\t", 1, "", false],
		["😀", 1, "", true],
		["😀", 2, "😀", false],
		["A 😀Z", 3, "A", true],
	] as const)(
		"clips normalized title %s at %i without trailing whitespace",
		async (body, cap, title, clipped) => {
			const result = await scan(`<h1>${body}</h1>`, { maxTitleCodeUnits: cap });
			expect(result.report.entries[0]).toMatchObject({
				title,
				titleTruncated: clipped,
			});
		},
	);

	it.each([
		[6, "abcde", true],
		[7, "abcde😀", true],
		[8, "abcde😀z", false],
	] as const)(
		"preserves actual window-split surrogate pairs at title cap %i",
		async (cap, title, clipped) => {
			const result = await scan("<h1>abcde😀z</h1>", {
				maxWindowCodeUnits: 5,
				maxTitleCodeUnits: cap,
			});
			expect(result.report.entries[0]).toMatchObject({
				title,
				titleTruncated: clipped,
			});
			expect(result.report.entries[0].anchor.endTag).toEqual({
				start: 12,
				end: 17,
			});
		},
	);

	it.each([
		["&#;", "missing-numeric-entity-digits", "&#;"],
		["&amp", "missing-entity-semicolon", "&"],
		["&#0;", "invalid-numeric-entity", "\ufffd"],
		["&#128;", "legacy-numeric-entity", "€"],
		["&#1;", "control-numeric-entity", "\u0001"],
		["&#65535;", "noncharacter-numeric-entity", "\uffff"],
		["&zzzzzz;", "unresolved-named-reference", "&zzzzzz;"],
	] as const)(
		"counts allowed native entity issue %s as %s",
		async (body, issue, title) => {
			const result = await scan(`<h1>${body}</h1>`, { maxIssues: 1 });
			expect(result.report.entries[0].title).toBe(title);
			expect(result.report.counters.entityIssues).toEqual({ [issue]: 1 });
			expect(result.report.counters.issueAttempts).toBe(1);
		},
	);

	it("distinguishes discarded native issue attempts from delivered warnings", async () => {
		const startTag = "<h1 a='&#0;' b='x'>";
		const result = await scan(`xx${startTag}Safe</h1>`, {
			maxWindowCodeUnits: startTag.length,
			maxIssues: 2,
		});
		expect(result.report.entries[0].title).toBe("Safe");
		expect(result.report.counters.issueAttempts).toBe(2);
		expect(result.report.counters.entityIssues).toEqual({
			"invalid-numeric-entity": 1,
		});
	});

	it.each([
		"<h1 a a>x</h1>",
		"<?bogus>",
		"<!bogus>",
		"<!--\0-->",
		"<!--unfinished",
		"<!--a--!>",
		"<!doctype>",
		"<h1 a='unfinished",
	])("rejects non-allowlisted native tokenizer issues: %s", async (source) => {
		await expectUnsupported(`${source}${privateMarker}`);
	});
});

describe("trusted source-heading structure diagnostics", () => {
	const completedTokenFailures: Array<[SourceHeadingStructureReason, string]> =
		[
			["unclosed-context", "<h1>unfinished"],
			["unclosed-context", "<template>"],
			["ambiguous-text-mode", "<plaintext>"],
			["ambiguous-text-mode", "<template><noscript>"],
			["ambiguous-text-mode", "</noscript>"],
			["heading-inline-structure", "<h1><div>"],
			["heading-inline-structure", "<h1><span/>"],
			["heading-inline-structure", "<h1><h2>"],
			["heading-close-structure", "<h1>x</h2>"],
			["heading-close-structure", "<h1><b><i>x</b>"],
			["heading-close-structure", "<h1><b>x</b extra=x>"],
			["heading-close-structure", "<h1>x</h1/>"],
			["raw-self-closing", "<script/>"],
			["raw-close-structure", "<script>body</script extra=x>"],
			["raw-close-structure", "<textarea>body</textarea/>"],
			["scope-self-closing", "<template/>"],
			["scope-close-structure", "</template>"],
			["scope-close-structure", "<template></head>"],
			["scope-close-structure", "<template></template extra=x>"],
			["scope-close-structure", "<template></template/>"],
			["heading-start-structure", "<h1/>"],
			["heading-start-structure", "</h6>"],
		];

	it.each(completedTokenFailures)(
		"reports %s at the committed cursor after %s",
		async (reason, source) => {
			const error = await captureFailure(() => scan(source));
			expectCode(error, "unsupported");
			expect((error as Error).message).toBe(
				"Unsupported native source-heading structure",
			);
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason,
				position: source.length,
				positionSemantics: "last-committed-source-utf16",
			});
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		},
	);

	it.each(["<h1 a a>", "<?bogus>", "<!--unfinished"])(
		"reports tokenizer issues before committing the failing read: %s",
		async (suffix) => {
			const prefix = "<div>😀</div>";
			const error = await captureFailure(() => scan(prefix + suffix));
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason: "tokenizer-issue",
				position: prefix.length,
				positionSemantics: "last-committed-source-utf16",
			});
		},
	);

	it.each([8, canonicalLimits.maxWindowCodeUnits])(
		"keeps UTF16 positions across surrogate pairs with window size %i",
		async (maxWindowCodeUnits) => {
			const prefix = `${"x".repeat(7)}😀${"y".repeat(22)}`;
			const fixtures: Array<[SourceHeadingStructureReason, string, number]> = [
				["tokenizer-issue", "<h1 a a>", prefix.length],
				["heading-start-structure", "<h1/>", prefix.length + "<h1/>".length],
			];
			for (const [reason, suffix, position] of fixtures) {
				const source = prefix + suffix;
				const error = await captureFailure(() =>
					scan(source, { maxWindowCodeUnits }),
				);
				expectCode(error, "unsupported");
				expect(sourceHeadingStructureDiagnostic(error)).toEqual({
					kind: "source-heading-structure",
					reason,
					position,
					positionSemantics: "last-committed-source-utf16",
				});
				expect(position).toBeGreaterThan(0);
				expect(position).not.toBe(
					encoder.encode(source.slice(0, position)).byteLength,
				);
			}
		},
	);

	it.each(rawNames)(
		"missing or mismatched %s raw closes hit tokenizer issues before the unreachable absent/mismatched closing-token guard",
		async (name) => {
			const start = `<${name}>`;
			for (const closing of ["", "</different>"]) {
				const error = await captureFailure(() =>
					scan(`${start}${privateMarker}${closing}`),
				);
				expectCode(error, "unsupported");
				expect(sourceHeadingStructureDiagnostic(error)).toEqual({
					kind: "source-heading-structure",
					reason: "tokenizer-issue",
					position: start.length,
					positionSemantics: "last-committed-source-utf16",
				});
			}
		},
	);

	it.each(rawNames)(
		"keeps %s closing-token issues ahead of structural-close diagnostics",
		async (name) => {
			const prefix = `<${name}>${privateMarker}`;
			const error = await captureFailure(() =>
				scan(`${prefix}</${name} duplicate duplicate>`),
			);
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason: "tokenizer-issue",
				position: prefix.length,
				positionSemantics: "last-committed-source-utf16",
			});
		},
	);

	it("returns one frozen scalar record per failure without exposing source strings", async () => {
		const source = `<h1 data-secret="${privateMarker}">${privateMarker}_TITLE</h1><plaintext>`;
		const input = {
			...ownedSource(source),
			finalUrl: `https://example.com/${privateMarker}`,
		};
		const error = await captureFailure(() =>
			discoverResearchSourceHeadings(input, { method }),
		);
		const diagnostic = sourceHeadingStructureDiagnostic(error);
		expectCode(error, "unsupported");
		expect(diagnostic).toEqual({
			kind: "source-heading-structure",
			reason: "ambiguous-text-mode",
			position: source.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(sourceHeadingStructureDiagnostic(error)).toBe(diagnostic);
		expect(Object.isFrozen(diagnostic)).toBe(true);
		expect(Reflect.ownKeys(diagnostic ?? {})).toEqual([
			"kind",
			"reason",
			"position",
			"positionSemantics",
		]);
		for (const descriptor of Object.values(
			Object.getOwnPropertyDescriptors(diagnostic ?? {}),
		)) {
			expect(descriptor).toMatchObject({
				configurable: false,
				enumerable: true,
				writable: false,
			});
			expect(["string", "number"]).toContain(typeof descriptor.value);
			expect(Object.hasOwn(descriptor, "get")).toBe(false);
		}
		expect(JSON.stringify(diagnostic)).not.toContain(privateMarker);
		expect(JSON.stringify(diagnostic)).not.toContain(input.finalUrl);
		expect(JSON.stringify(error)).not.toContain(privateMarker);
		expect((error as Error).message).toBe(
			"Unsupported native source-heading structure",
		);
		const repeatedError = await captureFailure(() =>
			discoverResearchSourceHeadings(input, { method }),
		);
		const repeatedDiagnostic = sourceHeadingStructureDiagnostic(repeatedError);
		expect(repeatedError).not.toBe(error);
		expect(repeatedDiagnostic).toEqual(diagnostic);
		expect(repeatedDiagnostic).not.toBe(diagnostic);
		expect(Object.isFrozen(repeatedDiagnostic)).toBe(true);
		expect(sourceHeadingStructureDiagnostic(error)).toBe(diagnostic);
	});

	it("rejects nonobjects, unbranded functions, forged errors and copied records", async () => {
		const error = (await captureFailure(() => scan("<h1/>"))) as Error;
		const diagnostic = sourceHeadingStructureDiagnostic(error);
		expect(diagnostic).toBeDefined();
		for (const value of [
			undefined,
			null,
			true,
			false,
			0,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			1n,
			Symbol(privateMarker),
			privateMarker,
			{},
			[],
			Object.create(null),
			() => error,
			Object.assign(() => undefined, diagnostic),
			new Error(error.message),
			new AgentBrowserError("unsupported", error.message),
			{ ...error },
			Object.create(error),
			Object.create(
				Object.getPrototypeOf(error),
				Object.getOwnPropertyDescriptors(error),
			),
			diagnostic,
			{ ...diagnostic },
			{ code: "unsupported", diagnostic },
		])
			expect(sourceHeadingStructureDiagnostic(value)).toBeUndefined();
	});

	it("never inspects getters or traps on hostile and revoked proxies", async () => {
		const error = (await captureFailure(() => scan("<h1/>"))) as Error;
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const traps = {
			get: trap,
			getOwnPropertyDescriptor: trap,
			getPrototypeOf: trap,
			ownKeys: trap,
			has: trap,
			apply: trap,
		};
		const accessor = {};
		for (const name of [
			"code",
			"message",
			"kind",
			"reason",
			"position",
			"positionSemantics",
			"diagnostic",
		])
			Object.defineProperty(accessor, name, { get: trap });
		const revokedObject = Proxy.revocable(error, traps);
		const revokedFunction = Proxy.revocable(() => undefined, traps);
		revokedObject.revoke();
		revokedFunction.revoke();
		for (const value of [
			accessor,
			Object.create(accessor),
			new Proxy({}, traps),
			new Proxy(error, traps),
			new Proxy(() => undefined, traps),
			revokedObject.proxy,
			revokedFunction.proxy,
		])
			expect(sourceHeadingStructureDiagnostic(value)).toBeUndefined();
		expect(trap).not.toHaveBeenCalled();
		expect(sourceHeadingStructureDiagnostic(error)).toBeDefined();
	});

	it.each(["<h@>", "<h1 '=x>"])(
		"does not rebrand unrelated native tokenizer errors: %s",
		async (source) => {
			const error = await captureFailure(() => scan(source));
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toBeUndefined();
		},
	);
});

describe("EOF completion, actual counters and trusted numeric guards", () => {
	it("reports empty source EOF without inventing candidates", async () => {
		const result = await scan("", { maxIssues: 0 });
		expect(result.report.entries).toEqual([]);
		expect(result.report.completion).toBe("eof");
		expect(result.report.scannedTo).toBe(0);
		expect(result.report.counters).toEqual({
			tokens: 0,
			operations: 1,
			workUnits: 0,
			issueAttempts: 0,
			entityIssues: {},
			omittedStarts: {},
			suppressedStarts: {},
			suppressedHeadingStarts: 0,
			rawStarts: {},
			maxTrackedDepth: 0,
			yields: 0,
		});
	});

	it("keeps EOF when the exact entry cap is followed only by ineligible headings", async () => {
		const source = "<h1>One</h1><template><h2>Suppressed</h2></template>tail";
		const result = await scan(source, { maxEntries: 1 });
		expect(result.report.entries).toHaveLength(1);
		expect(result.report.completion).toBe("eof");
		expect(result.report.scannedTo).toBe(source.length);
		expect(result.report.counters.suppressedHeadingStarts).toBe(1);
	});

	it("marks entry-limit only after another eligible start, without a partial entry", async () => {
		const first = "<h1>One</h1>";
		const source = `${first}<h2>${privateMarker}`;
		const result = await scan(source, { maxEntries: 1 });
		expect(result.report.entries.map((entry) => entry.title)).toEqual(["One"]);
		expect(result.report.completion).toBe("entry-limit");
		expect(result.report.scannedTo).toBe(first.length + "<h2>".length);
		expect(result.jsonl).not.toContain(privateMarker);
	});

	it("does not silently stop validating malformed scopes after reaching the entry cap", async () => {
		expectCode(
			await captureFailure(() =>
				scan("<h1>One</h1><template>", {
					maxEntries: 1,
				}),
			),
			"unsupported",
		);
	});

	it.each(["A&amp;B", "&#0;"])(
		"counts real native work, tokens, title units and delivered warnings for %s",
		async (body) => {
			const source = `<h1>${body}</h1>`;
			let warnings = 0;
			const native = new HtmlTokenCursor(source, () => {
				warnings++;
			});
			let tokens = 0;
			let titleUnits = 0;
			try {
				for (let attempt = 0; attempt < 8; attempt++) {
					const token = native.next();
					if (!token) break;
					tokens++;
					if (token.kind === "text") titleUnits += token.data.length;
				}
				const result = await scan(source);
				const total = native.workUnits + tokens + titleUnits + warnings;
				expect(result.report.counters.tokens).toBe(tokens);
				expect(result.report.counters.operations).toBe(native.operations);
				expect(result.report.counters.workUnits).toBe(total);
				expect(result.report.counters.yields).toBe(0);
				expect(
					(await scan(source, { maxWorkUnits: total })).report.counters
						.workUnits,
				).toBe(total);
				expectLimit(
					await captureFailure(() => scan(source, { maxWorkUnits: total - 1 })),
					{
						kind: "source.headings-work",
						unit: "code-units",
						limit: total - 1,
						observed: total,
					},
				);
			} finally {
				native.close();
			}
		},
	);

	it("forwards input byte and decoded code-unit caps with numeric identity", async () => {
		const source = "<h1>😀</h1>";
		const bytes = encoder.encode(source).byteLength;
		expect(
			(
				await scan(source, {
					maxInputBytes: bytes,
					maxSourceCodeUnits: source.length,
				})
			).report.entries[0].title,
		).toBe("😀");
		expectLimit(
			await captureFailure(() => scan(source, { maxInputBytes: bytes - 1 })),
			{
				kind: "source.input",
				unit: "bytes",
				limit: bytes - 1,
				observed: bytes,
			},
		);
		expectLimit(
			await captureFailure(() =>
				scan(source, { maxSourceCodeUnits: source.length - 1 }),
			),
			{
				kind: "source.decoded",
				unit: "code-units",
				limit: source.length - 1,
				observed: source.length,
			},
		);
	});

	it("checks tracked depth equality and the first over-limit frame", async () => {
		const exact = await scan("<template><svg></svg></template><h1>X</h1>", {
			maxTrackedDepth: 2,
		});
		expect(exact.report.counters.maxTrackedDepth).toBe(2);
		expectLimit(
			await captureFailure(() =>
				scan("<template><svg><math></math></svg></template>", {
					maxTrackedDepth: 2,
				}),
			),
			{
				kind: "source.headings-depth",
				unit: "levels",
				limit: 2,
				observed: 3,
			},
		);
	});

	it("bounds the full source heading extent including both explicit tags", async () => {
		const source = "<h1>x</h1>";
		expect(
			(await scan(source, { maxHeadingCodeUnits: source.length })).report
				.entries,
		).toHaveLength(1);
		expectLimit(
			await captureFailure(() =>
				scan(source, { maxHeadingCodeUnits: source.length - 1 }),
			),
			{
				kind: "source.heading-extent",
				unit: "code-units",
				limit: source.length - 1,
				observed: source.length,
			},
		);
	});

	it("retains native operation, window, issue and window-admission work diagnostics", async () => {
		const source = "<h1>x</h1>";
		expectLimit(
			await captureFailure(() => scan(source, { maxOperations: 3 })),
			{
				kind: "html.cursor-operations",
				unit: "operations",
				limit: 3,
				observed: 4,
			},
		);
		expectLimit(
			await captureFailure(() => scan(source, { maxWindowCodeUnits: 4 })),
			{
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 4,
				observed: 5,
			},
		);
		expectLimit(
			await captureFailure(() => scan("<h1>&#0;</h1>", { maxIssues: 0 })),
			{
				kind: "html.issues",
				unit: "issues",
				limit: 0,
				observed: 1,
			},
		);
		expectLimit(await captureFailure(() => scan(source, { maxWorkUnits: 1 })), {
			kind: "html.cursor-work",
			unit: "code-units",
			limit: 1,
			observed: source.length,
		});
	});
});

describe("real event-loop cooperation and clock-only post-yield deadlines", () => {
	it("lets an actual scheduled abort interrupt a finite native scan", async () => {
		const controller = controllerFor();
		let dispatched = false;
		const timer = setTimeout(() => {
			dispatched = true;
			controller.abort(new Error(privateMarker));
		}, 0);
		try {
			const error = await captureFailure(() =>
				discoverResearchSourceHeadings(
					ownedSource(`${"<span>x</span>".repeat(512)}<h1>Late</h1>`),
					{ method, yieldEveryOperations: 1 },
					controller.signal,
				),
			);
			expect(dispatched).toBe(true);
			expectCode(error, "aborted");
			expect((error as Error).message).not.toContain(privateMarker);
		} finally {
			clearTimeout(timer);
		}
	});

	it.each([
		["yieldEveryOperations", 1],
		["yieldEveryWorkUnits", 1],
		["yieldEveryOperations", 4],
	] as const)(
		"actually yields at %s=%i and rejects clock-only expiry even at EOF",
		async (threshold, batch) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			let now = 1_000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = controllerFor();
			const pending = observe(
				discoverResearchSourceHeadings(
					ownedSource("<h1>Never published</h1>"),
					{ method, timeoutMs: 10, [threshold]: batch },
					controller.signal,
				),
			);
			await microtasks();
			expect(pending.settled).toBe(false);
			expect(vi.getTimerCount()).toBeGreaterThan(0);
			now = 1_010;
			expect(pending.settled).toBe(false);
			await vi.runOnlyPendingTimersAsync();
			const outcome = await pending.outcome;
			expect(outcome.value).toBeUndefined();
			expectCode(outcome.error, "timeout");
		},
	);

	it("checks abort before an expired deadline when resuming a yielded batch", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		let now = 1_000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const controller = controllerFor();
		const pending = observe(
			discoverResearchSourceHeadings(
				ownedSource("<h1>Never published</h1>"),
				{ method, timeoutMs: 10, yieldEveryOperations: 1 },
				controller.signal,
			),
		);
		await microtasks();
		expect(pending.settled).toBe(false);
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		now = 1_010;
		controller.abort(new Error(privateMarker));
		await vi.runOnlyPendingTimersAsync();
		const outcome = await pending.outcome;
		expect(outcome.value).toBeUndefined();
		expectCode(outcome.error, "aborted");
		expect((outcome.error as Error).message).not.toContain(privateMarker);
	});

	it("rejects already-aborted input before decoding or scanner success", async () => {
		const controller = controllerFor();
		controller.abort();
		expectCode(
			await captureFailure(() =>
				discoverResearchSourceHeadings(
					ownedSource("<h1>Never published</h1>"),
					{ method },
					controller.signal,
				),
			),
			"aborted",
		);
	});
});

it("synthetic span-heavy source exceeds the native tree guard but yields real scanner candidates through EOF", async () => {
	const spans = 25_001;
	const prefix = "<h1>Before</h1>";
	const source = `${prefix}${"<span>x</span>".repeat(spans)}<h2>After</h2>`;
	let admitted: DocumentTree | undefined;
	let returned: DocumentTree | undefined;
	try {
		const error = await captureFailure(() => {
			returned = parseHtmlDocument(source, "about:blank", {
				initializeDocument(tree) {
					admitted = tree;
				},
			});
		});
		expect(admitted).toBeDefined();
		expect(admitted?.limits.maxNodes).toBe(50_000);
		expectLimit(error, {
			kind: "document.nodes",
			unit: "nodes",
			limit: 50_000,
			observed: 50_001,
		});
		const result = await scan(source, {
			maxInputBytes: encoder.encode(source).byteLength,
			maxSourceCodeUnits: source.length,
			maxWindowCodeUnits: 256,
			maxWorkUnits: 4_000_000,
			maxOperations: spans * 3 + 16,
			maxIssues: 0,
			maxEntries: 2,
		});
		expect(result.report.completion).toBe("eof");
		expect(result.report.scannedTo).toBe(source.length);
		expect(result.report.entries.map((entry) => entry.title)).toEqual([
			"Before",
			"After",
		]);
		expect(result.report.entries[1].anchor.startTag.start).toBe(
			prefix.length + "<span>x</span>".length * spans,
		);
		expect(result.report.counters.tokens).toBeGreaterThanOrEqual(spans * 3 + 6);
		expect(result.report.counters.tokens).toBeLessThanOrEqual(spans * 3 + 15);
		expect(result.report.counters.operations).toBe(
			result.report.counters.tokens + 1,
		);
		expect(result.report.counters.issueAttempts).toBe(0);
		expect(result.report.counters.yields).toBeGreaterThan(0);
		expect(result.report.counters.workUnits).toBeLessThanOrEqual(
			result.report.limits.maxWorkUnits,
		);
		expect(result.report.contentSuccess).toBeNull();
		expect(result.report.semantics).toBe("lexical-not-dom");
	} finally {
		returned?.close();
		admitted?.close();
	}
});
