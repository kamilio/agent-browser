import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type SourceHeadingInlineDiagnostic,
	type SourceHeadingInlineObservedTag,
	type SourceHeadingScope,
	type SourceHeadingScopeContextDiagnostic,
	type SourceHeadingScopeDiagnostic,
	type SourceHeadingStructureReason,
	discoverResearchSourceHeadings,
	researchSourceHeadingLimits,
	sourceHeadingInlineDiagnostic,
	sourceHeadingScopeContextDiagnostic,
	sourceHeadingScopeDiagnostic,
	sourceHeadingStructureDiagnostic,
} from "../scripts/research-source-headings.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	type HtmlDiscardRawName,
	type HtmlRawDiscardStep,
	HtmlTokenCursor,
	htmlTokenCursorWindowDiagnostic,
} from "./html-token-cursor.js";
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
	if (
		sourceHeadingStructureDiagnostic(error)?.reason !== "scope-close-structure"
	)
		expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
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

describe("trusted scope-close predicate diagnostics", () => {
	const stackedNames = [...suppressedNames, ...omittedFrames] as const;
	const trackedNames: readonly SourceHeadingScope[] = [
		...stackedNames,
		"embed",
		"frame",
		"input",
		"link",
		"meta",
		"source",
		"track",
		"script",
		"style",
		"iframe",
		"noembed",
		"noframes",
		"textarea",
	];

	async function expectScopeFailure(
		source: string,
		expected: Omit<SourceHeadingScopeDiagnostic, "kind">,
	) {
		const error = await captureFailure(() => scan(source));
		expectCode(error, "unsupported");
		expect((error as Error).message).toBe(
			"Unsupported native source-heading structure",
		);
		const structure = sourceHeadingStructureDiagnostic(error);
		expect(structure).toEqual({
			kind: "source-heading-structure",
			reason: "scope-close-structure",
			position: source.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(Reflect.ownKeys(structure ?? {})).toEqual([
			"kind",
			"reason",
			"position",
			"positionSemantics",
		]);
		const diagnostic = sourceHeadingScopeDiagnostic(error);
		expect(diagnostic).toEqual({
			kind: "source-heading-scope-close",
			...expected,
		});
		expect(Object.isFrozen(diagnostic)).toBe(true);
		expect(sourceHeadingScopeDiagnostic(error)).toBe(diagnostic);
		expect(sourceHeadingStructureDiagnostic(error)).toBe(structure);
		expect(diagnostic).not.toBe(structure);
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		return { error, diagnostic };
	}

	it.each(trackedNames)(
		"bounds stray %s closes to the finite scope vocabulary and an empty stack",
		async (name) => {
			await expectScopeFailure(`</${name}>`, {
				condition: "scope-mismatch",
				expectedScope: null,
				observedScope: name,
				depth: 0,
			});
		},
	);

	it.each(stackedNames)(
		"snapshots %s as the actual expected scope on a mismatched close",
		async (name) => {
			const observedScope = name === "template" ? "head" : "template";
			await expectScopeFailure(`<${name}></${observedScope}>`, {
				condition: "scope-mismatch",
				expectedScope: name,
				observedScope,
				depth: 1,
			});
		},
	);

	it.each(stackedNames)(
		"separates matching %s closes with attributes or a self-closing flag",
		async (name) => {
			for (const suffix of [" extra=x", "/"]) {
				await expectScopeFailure(`<${name}></${name}${suffix}>`, {
					condition: "non-plain-close",
					expectedScope: name,
					observedScope: name,
					depth: 1,
				});
			}
		},
	);

	it.each([
		["head", "scope-mismatch", 0],
		["template", "non-plain-close", 1],
	] as const)(
		"checks %s closing attributes exactly %s / %i times after comparing the scope",
		async (name, condition, expectedReads) => {
			const keyReads = vi.spyOn(Object, "keys");
			const error = await captureFailure(() =>
				scan(`<template></${name} data-scope-check="${privateMarker}">`),
			);
			const attributeReads = keyReads.mock.calls.filter(
				([value]) =>
					value !== null &&
					typeof value === "object" &&
					Object.hasOwn(value, "data-scope-check"),
			).length;
			keyReads.mockRestore();
			expectCode(error, "unsupported");
			expect(attributeReads).toBe(expectedReads);
			expect(sourceHeadingScopeDiagnostic(error)).toEqual({
				kind: "source-heading-scope-close",
				condition,
				expectedScope: "template",
				observedScope: name,
				depth: 1,
			});
		},
	);

	it.each(rawNames)(
		"does not push raw %s content onto the tracked stack",
		async (name) => {
			await expectScopeFailure(
				`<template><${name}>${privateMarker}</${name}></head>`,
				{
					condition: "scope-mismatch",
					expectedScope: "template",
					observedScope: "head",
					depth: 1,
				},
			);
		},
	);

	it("retains frozen primitive snapshots after cleanup and subsequent scans", async () => {
		const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
		const source = `<h1>${privateMarker}</h1><template><svg/><math/><input><table><tbody><tr><td></table data-secret="${privateMarker}">`;
		const expected = {
			condition: "scope-mismatch",
			expectedScope: "td",
			observedScope: "table",
			depth: 5,
		} as const;
		const { error, diagnostic } = await expectScopeFailure(source, expected);
		expect(close).toHaveBeenCalledTimes(1);
		const cursor = close.mock.contexts[0] as HtmlTokenCursor;
		expect(cursor.closed).toBe(true);
		expect(cursor.position).toBe(source.length);
		expect(Reflect.ownKeys(diagnostic ?? {})).toEqual([
			"kind",
			"condition",
			"expectedScope",
			"observedScope",
			"depth",
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
		expect(JSON.stringify(error)).not.toContain(privateMarker);
		const success = await scan(
			"<template><table><tr><td>X</td></tr></table></template><h1>After</h1>",
		);
		expect(success.report.entries.map((entry) => entry.title)).toEqual([
			"After",
		]);
		expect(sourceHeadingScopeDiagnostic(success)).toBeUndefined();
		await expectScopeFailure("<template></template></head>", {
			condition: "scope-mismatch",
			expectedScope: null,
			observedScope: "head",
			depth: 0,
		});
		const repeated = await expectScopeFailure(source, expected);
		expect(repeated.error).not.toBe(error);
		expect(repeated.diagnostic).toEqual(diagnostic);
		expect(repeated.diagnostic).not.toBe(diagnostic);
		expect(sourceHeadingScopeDiagnostic(error)).toBe(diagnostic);
	});

	it("snapshots the maximum admitted depth without branding earlier depth limits", async () => {
		const prefix = "<template>".repeat(canonicalLimits.maxTrackedDepth);
		await expectScopeFailure(`${prefix}</head>`, {
			condition: "scope-mismatch",
			expectedScope: "template",
			observedScope: "head",
			depth: canonicalLimits.maxTrackedDepth,
		});
		expectCode(
			await captureFailure(() => scan(`${prefix}<template></head>`)),
			"resource-limit",
		);
	});

	it.each([
		["<table><tr><td>A</table>", "table", 3],
		["<table><tbody><tr><td>A</tr>", "tr", 4],
		["<table><tr><td>A<td>B</tr>", "tr", 4],
	] as const)(
		"keeps strict synthetic table/optional-close rejection: %s",
		async (source, observedScope, depth) => {
			await expectScopeFailure(source, {
				condition: "scope-mismatch",
				expectedScope: "td",
				observedScope,
				depth,
			});
		},
	);

	it.each([
		["<table><tr><td>A", "unclosed-context"],
		["<template></untracked-private-name>", "unclosed-context"],
		["<template></head duplicate duplicate>", "tokenizer-issue"],
		["<template></template duplicate duplicate>", "tokenizer-issue"],
		["<template><script>x</script extra=x>", "raw-close-structure"],
		["<h1></table>", "heading-close-structure"],
	] as const)(
		"does not attach scope metadata to the earlier rejection of %s",
		async (source, reason) => {
			const error = await captureFailure(() => scan(source));
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)?.reason).toBe(reason);
			expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
		},
	);

	it("preserves native issue and operation limits before the scope guard", async () => {
		for (const operation of [
			() => scan("<template></head duplicate duplicate>", { maxIssues: 0 }),
			() => scan("<template></head>", { maxOperations: 1 }),
		])
			expectCode(await captureFailure(operation), "resource-limit");
	});

	it("rejects forged, copied, wrapped, foreign and hostile values without inspection", async () => {
		const error = (await captureFailure(() => scan("</table>"))) as Error;
		const diagnostic = sourceHeadingScopeDiagnostic(error);
		expect(diagnostic).toBeDefined();
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const traps = {
			get: trap,
			getPrototypeOf: trap,
			getOwnPropertyDescriptor: trap,
			ownKeys: trap,
			has: trap,
			apply: trap,
		};
		const accessor = {};
		for (const name of [
			"code",
			"message",
			"kind",
			"condition",
			"expectedScope",
			"observedScope",
			"depth",
			"diagnostic",
		])
			Object.defineProperty(accessor, name, { get: trap });
		const revokedObject = Proxy.revocable(error, traps);
		const revokedFunction = Proxy.revocable(() => undefined, traps);
		revokedObject.revoke();
		revokedFunction.revoke();
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
			new Error(error.message, { cause: error }),
			runInNewContext(
				"new Error('Unsupported native source-heading structure')",
			),
			{ ...error },
			Object.create(error),
			Object.create(
				Object.getPrototypeOf(error),
				Object.getOwnPropertyDescriptors(error),
			),
			diagnostic,
			{ ...diagnostic },
			sourceHeadingStructureDiagnostic(error),
			{ code: "unsupported", diagnostic },
			accessor,
			Object.create(accessor),
			new Proxy(error, {}),
			new Proxy(error, traps),
			new Proxy(() => undefined, traps),
			revokedObject.proxy,
			revokedFunction.proxy,
		])
			expect(sourceHeadingScopeDiagnostic(value)).toBeUndefined();
		expect(trap).not.toHaveBeenCalled();
		expect(sourceHeadingScopeDiagnostic(error)).toBe(diagnostic);
	});
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

describe("explicit optional-table policy admission", () => {
	const tableScopePolicy = "optional-end-tags-v1";
	const explicitTable = `<table><tr><td><h2>${privateMarker}</h2></td></tr></table><h1>After</h1>`;
	const strictReportKeys = [
		"completion",
		"contentSuccess",
		"counters",
		"entries",
		"kind",
		"limits",
		"method",
		"partial",
		"scannedTo",
		"semantics",
		"source",
	];

	async function expectInvalidOptions(options: unknown) {
		const input = ownedSource("<h1>Unreached</h1>");
		const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor");
		const prototypes = vi.spyOn(Object, "getPrototypeOf");
		const keys = vi.spyOn(Reflect, "ownKeys");
		let error: unknown;
		let sourceInspections = 0;
		try {
			error = await captureFailure(() =>
				discoverResearchSourceHeadings(input, options),
			);
			sourceInspections =
				descriptors.mock.calls.filter(([value]) => value === input).length +
				prototypes.mock.calls.filter(([value]) => value === input).length +
				keys.mock.calls.filter(([value]) => value === input).length;
		} finally {
			keys.mockRestore();
			prototypes.mockRestore();
			descriptors.mockRestore();
		}
		expectCode(error, "invalid-input");
		expect((error as Error).message).not.toContain(privateMarker);
		expect(sourceInspections).toBe(0);
	}

	it("rejects every present nonliteral policy before inspecting valid source", async () => {
		for (const value of [
			undefined,
			null,
			"",
			"strict",
			"optional-end-tags-v3",
			"OPTIONAL-END-TAGS-V1",
			" optional-end-tags-v1",
			"optional-end-tags-v1 ",
			0,
			1,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			true,
			false,
			1n,
			Symbol(tableScopePolicy),
			{},
			[],
			[tableScopePolicy],
			Object(tableScopePolicy),
			() => tableScopePolicy,
		])
			await expectInvalidOptions({ method, tableScopePolicy: value });
	});

	it("does not inspect or coerce hostile policy values or proxy options", async () => {
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const traps = {
			get: trap,
			getPrototypeOf: trap,
			getOwnPropertyDescriptor: trap,
			ownKeys: trap,
			has: trap,
			apply: trap,
		};
		const coercible = {
			[Symbol.toPrimitive]: trap,
			toString: trap,
			valueOf: trap,
		};
		const accessor = Object.defineProperty({}, "tableScopePolicy", {
			get: trap,
		});
		const revokedValue = Proxy.revocable(coercible, traps);
		const revokedFunction = Proxy.revocable(() => tableScopePolicy, traps);
		const revokedOptions = Proxy.revocable({ method, tableScopePolicy }, traps);
		revokedValue.revoke();
		revokedFunction.revoke();
		revokedOptions.revoke();
		for (const value of [
			coercible,
			accessor,
			new Proxy(coercible, traps),
			new Proxy(() => tableScopePolicy, traps),
			revokedValue.proxy,
			revokedFunction.proxy,
		])
			await expectInvalidOptions({ method, tableScopePolicy: value });
		for (const options of [
			new Proxy({ method, tableScopePolicy }, traps),
			revokedOptions.proxy,
			new Proxy(() => ({ method, tableScopePolicy }), traps),
		])
			await expectInvalidOptions(options);
		expect(trap).not.toHaveBeenCalled();
	});

	it("rejects policy accessors without invoking either getter or setter", async () => {
		const getter = vi.fn(() => tableScopePolicy);
		const setter = vi.fn();
		for (const enumerable of [false, true]) {
			for (const descriptor of [
				{ get: getter },
				{ set: setter },
				{ get: getter, set: setter },
			])
				await expectInvalidOptions(
					Object.defineProperty({ method }, "tableScopePolicy", {
						...descriptor,
						enumerable,
					}),
				);
		}
		expect(getter).not.toHaveBeenCalled();
		expect(setter).not.toHaveBeenCalled();
	});

	it("retains explicit method, prototype, exact-key and numeric admission rules", async () => {
		for (const options of [
			{ tableScopePolicy },
			{ method: undefined, tableScopePolicy },
			{ method: "reader", tableScopePolicy },
			Object.assign(Object.create({ tableScopePolicy }), { method }),
			Object.assign(Object.create({}), { method, tableScopePolicy }),
			Object.assign([], { method, tableScopePolicy }),
			{ method, tableScopePolicy, unknown: 1 },
			{ method, tableScopePolicy, [Symbol("extra")]: 1 },
			Object.defineProperty({ method, tableScopePolicy }, "unknown", {
				value: 1,
			}),
			Object.defineProperty({ method, tableScopePolicy }, Symbol("extra"), {
				value: 1,
			}),
			{ method, tableScopePolicy, maxOutputBytes: 0 },
			{ method, tableScopePolicy, maxWorkUnits: "1" },
			{ method, tableScopePolicy, maxTrackedDepth: Number.NaN },
		])
			await expectInvalidOptions(options);
	});

	it.each([false, true])(
		"admits nonenumerable own data policy with null-prototype=%s",
		async (nullPrototype) => {
			const options = Object.assign(
				Object.create(nullPrototype ? null : Object.prototype),
				{ method },
			);
			Object.defineProperty(options, "tableScopePolicy", {
				value: tableScopePolicy,
				enumerable: false,
			});
			const result = await discoverResearchSourceHeadings(
				ownedSource("<h1>One</h1>"),
				options,
			);
			expect(result.report.tableScopePolicy).toBe(tableScopePolicy);
			expect(Object.hasOwn(result.report, "tableScopePolicy")).toBe(true);
			expect(result.report.entries.map((entry) => entry.title)).toEqual([
				"One",
			]);
			expect(result.report.limits).toEqual(canonicalLimits);
			expectDeepFrozen(result);
		},
	);

	it("preserves the default strict schema and marks only explicit opted-in output", async () => {
		const strict = await scan(explicitTable);
		const selected = await scan(explicitTable, { tableScopePolicy });
		expect(Object.keys(strict.report).sort()).toEqual(strictReportKeys);
		expect(Object.hasOwn(strict.report, "tableScopePolicy")).toBe(false);
		expect(Object.hasOwn(JSON.parse(strict.jsonl), "tableScopePolicy")).toBe(
			false,
		);
		expect(Object.keys(selected.report).sort()).toEqual(
			[...strictReportKeys, "tableScopePolicy"].sort(),
		);
		expect(
			Object.getOwnPropertyDescriptor(selected.report, "tableScopePolicy"),
		).toEqual({
			value: tableScopePolicy,
			enumerable: true,
			writable: false,
			configurable: false,
		});
		expect(Reflect.set(selected.report, "tableScopePolicy", "changed")).toBe(
			false,
		);
		expect(Reflect.deleteProperty(selected.report, "tableScopePolicy")).toBe(
			false,
		);
		for (const result of [strict, selected]) {
			expect(result.report.entries.map((entry) => entry.title)).toEqual([
				"After",
			]);
			expect(result.report.limits).toEqual(canonicalLimits);
			expect(Object.keys(result.report.limits).sort()).toEqual(
				Object.keys(canonicalLimits).sort(),
			);
			expect(
				Object.values(result.report.limits).every(
					(value) => typeof value === "number",
				),
			).toBe(true);
			expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
			expect(result.jsonl.split("\n")).toHaveLength(2);
			expect(result.jsonl).not.toContain(privateMarker);
			expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
			expect(result.outputBytes).toBeLessThanOrEqual(
				result.report.limits.maxOutputBytes,
			);
			expect(JSON.parse(result.jsonl)).toEqual(result.report);
			expectDeepFrozen(result);
		}
		expect(JSON.parse(selected.jsonl).tableScopePolicy).toBe(tableScopePolicy);
		expect(researchSourceHeadingLimits).toEqual(canonicalLimits);
		expect(Object.hasOwn(researchSourceHeadingLimits, "tableScopePolicy")).toBe(
			false,
		);
	});

	it.each([false, true])(
		"snapshots opt-in=%s before an actual scanner yield and later option mutation",
		async (selected) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			const options: Record<string, unknown> = {
				method,
				yieldEveryOperations: 1,
			};
			if (selected) options.tableScopePolicy = tableScopePolicy;
			const controller = controllerFor();
			const pending = observe(
				discoverResearchSourceHeadings(
					ownedSource(explicitTable),
					options,
					controller.signal,
				),
			);
			const changedPolicy = vi.fn(() =>
				selected ? undefined : tableScopePolicy,
			);
			try {
				await microtasks();
				expect(pending.settled).toBe(false);
				expect(vi.getTimerCount()).toBeGreaterThan(0);
				Object.defineProperty(options, "tableScopePolicy", {
					get: changedPolicy,
					enumerable: true,
					configurable: true,
				});
				await vi.runAllTimersAsync();
				const outcome = await pending.outcome;
				expect(outcome.error).toBeUndefined();
				expect(outcome.value).toBeDefined();
				expect(
					outcome.value?.report.entries.map((entry) => entry.title),
				).toEqual(["After"]);
				expect(outcome.value?.report.tableScopePolicy).toBe(
					selected ? tableScopePolicy : undefined,
				);
				expect(
					Object.hasOwn(outcome.value?.report ?? {}, "tableScopePolicy"),
				).toBe(selected);
				expect(outcome.value?.report.counters.yields).toBeGreaterThan(0);
				expect(changedPolicy).not.toHaveBeenCalled();
			} finally {
				controller.abort();
				vi.clearAllTimers();
				vi.useRealTimers();
			}
		},
	);

	it("counts the policy field in exact self-describing JSONL output bounds", async () => {
		const source = '<h1>Quote" \\ 😀</h1>';
		const baseline = await scan(source, { tableScopePolicy });
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
		const exact = await scan(source, { tableScopePolicy, maxOutputBytes: cap });
		expect(exact.report.tableScopePolicy).toBe(tableScopePolicy);
		expect(exact.outputBytes).toBe(cap);
		expect(exact.outputBytes).toBe(encoder.encode(exact.jsonl).byteLength);
		expect(exact.jsonl).toBe(`${JSON.stringify(exact.report)}\n`);
		const error = await captureFailure(() =>
			scan(source, { tableScopePolicy, maxOutputBytes: cap - 1 }),
		);
		expectCode(error, "resource-limit");
		const diagnostic = resourceLimitDiagnostic(error);
		expect(diagnostic).toMatchObject({
			kind: "source.headings-output",
			unit: "bytes",
			limit: cap - 1,
		});
		expect(diagnostic?.observed).toBeGreaterThan(cap - 1);
	});

	it("retains the work cap while the policy is selected", async () => {
		const error = await captureFailure(() =>
			scan(explicitTable, { tableScopePolicy, maxWorkUnits: 1 }),
		);
		expectCode(error, "resource-limit");
		const diagnostic = resourceLimitDiagnostic(error);
		expect(["html.cursor-work", "source.headings-work"]).toContain(
			diagnostic?.kind,
		);
		expect(diagnostic?.limit).toBe(1);
		expect(diagnostic?.observed).toBeGreaterThan(1);
	});

	it("retains the depth cap for explicit well-nested table scopes", async () => {
		const error = await captureFailure(() =>
			scan(explicitTable, { tableScopePolicy, maxTrackedDepth: 2 }),
		);
		expectCode(error, "resource-limit");
		const diagnostic = resourceLimitDiagnostic(error);
		expect(diagnostic).toMatchObject({
			kind: "source.headings-depth",
			unit: "levels",
			limit: 2,
		});
		expect(diagnostic?.observed).toBeGreaterThan(2);
	});
});

describe("conservative optional-table scope transitions", () => {
	const tableScopePolicy = "optional-end-tags-v1";
	const hiddenHeading = `<h2>${privateMarker}</h2>`;
	const outsideHeading = "<h1>After 😀</h1>";

	function selectedScan(source: string, limits: Record<string, unknown> = {}) {
		return scan(source, { tableScopePolicy, ...limits });
	}

	async function expectOutsideHeading(
		prefix: string,
		limits: Record<string, unknown> = {},
	) {
		const source = prefix + outsideHeading;
		const result = await selectedScan(source, limits);
		expect(result.report.entries).toEqual([
			{
				ordinal: 1,
				level: 1,
				title: "After 😀",
				titleTruncated: false,
				anchor: {
					kind: "source-utf16-range-v1",
					startTag: { start: prefix.length, end: prefix.length + 4 },
					endTag: { start: source.length - 5, end: source.length },
				},
			},
		]);
		expect(result.report.tableScopePolicy).toBe(tableScopePolicy);
		expect(result.report.completion).toBe("eof");
		expect(result.report.scannedTo).toBe(source.length);
		expect(result.report.source.bytes).toEqual({
			length: encoder.encode(source).byteLength,
			sha256: sha256(encoder.encode(source)),
		});
		expect(result.report.source.text.codeUnits).toBe(source.length);
		expect(result.report.source.text.sha256).toBe(sha256(source));
		expect(result.jsonl).not.toContain(privateMarker);
		expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expectDeepFrozen(result);
		return result;
	}

	async function expectSelectedScopeFailure(
		prefix: string,
		expected: Omit<SourceHeadingScopeDiagnostic, "kind">,
	) {
		const error = await captureFailure(() =>
			selectedScan(prefix + outsideHeading),
		);
		expectCode(error, "unsupported");
		const structure = sourceHeadingStructureDiagnostic(error);
		const diagnostic = sourceHeadingScopeDiagnostic(error);
		expect(structure).toEqual({
			kind: "source-heading-structure",
			reason: "scope-close-structure",
			position: prefix.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(diagnostic).toEqual({
			kind: "source-heading-scope-close",
			...expected,
		});
		expect(Object.isFrozen(structure)).toBe(true);
		expect(Object.isFrozen(diagnostic)).toBe(true);
		expect(sourceHeadingStructureDiagnostic(error)).toBe(structure);
		expect(sourceHeadingScopeDiagnostic(error)).toBe(diagnostic);
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		expect(JSON.stringify({ error, structure, diagnostic })).not.toContain(
			privateMarker,
		);
		return { error, structure, diagnostic };
	}

	function observeNativeCursors() {
		const cursors = new Set<HtmlTokenCursor>();
		const next = HtmlTokenCursor.prototype.next;
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			cursors.add(this);
			return next.call(this);
		});
		return cursors;
	}

	it.each([
		{
			name: "direct rows and td/th sibling switches",
			source: `<table><tr><td>${hiddenHeading}<th>${hiddenHeading}<tr><td>${hiddenHeading}</table>`,
			hidden: 3,
		},
		{
			name: "cell, row and tbody omitted at table end",
			source: `<table><tbody><tr><td>${hiddenHeading}</table>`,
			hidden: 1,
		},
		{
			name: "explicit row and matching group closes",
			source: `<table><tbody><tr><td>${hiddenHeading}</tr></tbody></table>`,
			hidden: 1,
		},
		{
			name: "sibling tbody after an unfinished row",
			source: `<table><tbody><tr><td>${hiddenHeading}<tbody><tr><th>${hiddenHeading}</table>`,
			hidden: 2,
		},
		{
			name: "tfoot replaces tbody but closes explicitly",
			source: `<table><tbody><tr><td>${hiddenHeading}<tfoot><tr><th>${hiddenHeading}</tfoot></table>`,
			hidden: 2,
		},
		{
			name: "thead closes explicitly before tbody",
			source: `<table><thead><tr><th>${hiddenHeading}</thead><tbody><tr><td>${hiddenHeading}</table>`,
			hidden: 2,
		},
		{
			name: "sibling row without a preceding cell",
			source: `<table><tbody><tr><tr><td>${hiddenHeading}</table>`,
			hidden: 1,
		},
		{
			name: "sibling empty tbody",
			source: `<table><tbody><tbody><tr><td>${hiddenHeading}</table>`,
			hidden: 1,
		},
	])("recovers $name without promoting table headings", async (fixture) => {
		const prefix = `😀\r\n${fixture.source}`;
		const result = await expectOutsideHeading(prefix);
		expect(result.report.counters.suppressedHeadingStarts).toBe(fixture.hidden);
		await expectUnsupported(prefix + outsideHeading);
	});

	it("replaces repeated sibling cells within the constant canonical depth cap", async () => {
		const cells = Array.from(
			{ length: 24 },
			(_value, index) => `<${index % 2 === 0 ? "td" : "th"}>${hiddenHeading}`,
		).join("");
		const prefix = `<table><tr>${cells}</table>`;
		const result = await expectOutsideHeading(prefix, { maxTrackedDepth: 3 });
		expect(result.report.counters.maxTrackedDepth).toBe(3);
		expect(result.report.counters.suppressedStarts).toEqual({
			table: 1,
			tr: 1,
			td: 12,
			th: 12,
		});
		expect(result.report.counters.suppressedHeadingStarts).toBe(24);
		await expectUnsupported(prefix + outsideHeading);
		expectLimit(
			await captureFailure(() =>
				scan(prefix + outsideHeading, { maxTrackedDepth: 3 }),
			),
			{
				kind: "source.headings-depth",
				unit: "levels",
				limit: 3,
				observed: 4,
			},
		);
	});

	it.each([
		["inside a cell", "<table><tr><td>", 6],
		["outside a cell", "<table><tr>", 5],
	] as const)(
		"keeps a nested table start %s as a strict push",
		async (_name, outer, depth) => {
			const prefix = `${outer}<table><tr><td>${hiddenHeading}</table>${hiddenHeading}</table>`;
			const result = await expectOutsideHeading(prefix);
			expect(result.report.counters.suppressedStarts.table).toBe(2);
			expect(result.report.counters.suppressedHeadingStarts).toBe(2);
			expect(result.report.counters.maxTrackedDepth).toBe(depth);
		},
	);

	it.each(["template", "svg", "select"] as const)(
		"retains outer %s suppression after local table recovery",
		async (scope) => {
			const prefix = `<${scope}><table><tr><td>${hiddenHeading}</table>${hiddenHeading}</${scope}>`;
			const result = await expectOutsideHeading(prefix);
			expect(result.report.counters.suppressedHeadingStarts).toBe(2);
			expect(result.report.counters.maxTrackedDepth).toBe(4);
		},
	);

	it("retains balanced strict fallback without inventing missing rows or groups", async () => {
		const prefix = `<table><td>${hiddenHeading}</td></table>`;
		const selected = await expectOutsideHeading(prefix);
		const strict = await scan(prefix + outsideHeading);
		expect(selected.report.entries).toEqual(strict.report.entries);
		expect(selected.report.counters.suppressedStarts).toEqual({
			table: 1,
			td: 1,
		});
		expect(selected.report.counters.maxTrackedDepth).toBe(2);
	});

	it.each(["script", "textarea"] as const)(
		"leaves %s raw table-like bytes to the native cursor",
		async (name) => {
			const raw = `<${name}></table><td>${hiddenHeading}</${name}>`;
			const prefix = `<table><tr><td>${raw}${hiddenHeading}</table>`;
			const result = await expectOutsideHeading(prefix);
			expect(result.report.counters.rawStarts).toEqual({ [name]: 1 });
			expect(result.report.counters.suppressedStarts.td).toBe(1);
			expect(result.report.counters.suppressedHeadingStarts).toBe(1);
			const malformed = `<table><tr><td><${name}>${privateMarker}</${name} extra=x>`;
			const error = await captureFailure(() => selectedScan(malformed));
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toMatchObject({
				reason: "raw-close-structure",
				position: malformed.length,
			});
		},
	);

	it.each([
		{
			name: "absent table",
			source: `<tr><td>${hiddenHeading}</tr>`,
			expectedScope: "td",
			observedScope: "tr",
			depth: 2,
		},
		{
			name: "absent row",
			source: `<table><td>${hiddenHeading}</table>`,
			expectedScope: "td",
			observedScope: "table",
			depth: 2,
		},
		{
			name: "absent row inside tbody",
			source: `<table><tbody><td>${hiddenHeading}</table>`,
			expectedScope: "td",
			observedScope: "table",
			depth: 3,
		},
		{
			name: "implicit thead close",
			source: `<table><thead><tr><th>${hiddenHeading}</table>`,
			expectedScope: "th",
			observedScope: "table",
			depth: 4,
		},
		{
			name: "implicit tfoot close",
			source: `<table><tfoot><tr><td>${hiddenHeading}</table>`,
			expectedScope: "td",
			observedScope: "table",
			depth: 4,
		},
		{
			name: "wrong cell close",
			source: `<table><tr><td>${hiddenHeading}</th>`,
			expectedScope: "td",
			observedScope: "th",
			depth: 3,
		},
		{
			name: "wrong group close",
			source: `<table><tbody><tr><td>${hiddenHeading}</tfoot>`,
			expectedScope: "td",
			observedScope: "tfoot",
			depth: 4,
		},
		{
			name: "outer group behind an inner table",
			source: `<table><tbody><tr><td><table><tr><td>${hiddenHeading}</tbody>`,
			expectedScope: "td",
			observedScope: "tbody",
			depth: 7,
		},
		{
			name: "outer template behind a table",
			source: `<template><table><tr><td>${hiddenHeading}</template>`,
			expectedScope: "td",
			observedScope: "template",
			depth: 4,
		},
		{
			name: "caption barrier",
			source: `<table><caption>${hiddenHeading}</table>`,
			expectedScope: "caption",
			observedScope: "table",
			depth: 2,
		},
		{
			name: "colgroup barrier",
			source: `<table><colgroup>${hiddenHeading}</table>`,
			expectedScope: "colgroup",
			observedScope: "table",
			depth: 2,
		},
		{
			name: "redundant cell close after replacement",
			source: `<table><tr><td>${hiddenHeading}<th>${hiddenHeading}</th></th>`,
			expectedScope: "tr",
			observedScope: "th",
			depth: 2,
		},
		{
			name: "stray table end",
			source: "</table>",
			expectedScope: null,
			observedScope: "table",
			depth: 0,
		},
	] as const)(
		"refuses $name without publishing later headings",
		async (fixture) => {
			await expectSelectedScopeFailure(fixture.source, {
				condition: "scope-mismatch",
				expectedScope: fixture.expectedScope,
				observedScope: fixture.observedScope,
				depth: fixture.depth,
			});
		},
	);

	it.each(["template", "svg", "math", "select", "object"] as const)(
		"does not search past an open %s frame above the table suffix",
		async (scope) => {
			await expectSelectedScopeFailure(
				`<table><tr><td><${scope}>${hiddenHeading}</table>`,
				{
					condition: "scope-mismatch",
					expectedScope: scope,
					observedScope: "table",
					depth: 4,
				},
			);
		},
	);

	it.each([`</table extra="${privateMarker}">`, "</table/>"])(
		"keeps original stack diagnostics when a proposed close is nonplain: %s",
		async (closing) => {
			const prefix = `😀<table><tbody><tr><td>${hiddenHeading}${closing}`;
			const first = await expectSelectedScopeFailure(prefix, {
				condition: "scope-mismatch",
				expectedScope: "td",
				observedScope: "table",
				depth: 4,
			});
			const strict = await captureFailure(() => scan(prefix + outsideHeading));
			expect(sourceHeadingScopeDiagnostic(strict)).toEqual(first.diagnostic);
			expect(sourceHeadingStructureDiagnostic(strict)).toEqual(first.structure);
			const repeated = await captureFailure(() =>
				selectedScan(prefix + outsideHeading),
			);
			expect(repeated).not.toBe(first.error);
			expect(sourceHeadingScopeDiagnostic(repeated)).toEqual(first.diagnostic);
			expect(sourceHeadingScopeDiagnostic(repeated)).not.toBe(first.diagnostic);
			expect(
				sourceHeadingScopeDiagnostic({ ...first.diagnostic }),
			).toBeUndefined();
			await expectOutsideHeading(`<table><tr><td>${hiddenHeading}</table>`);
			expect(sourceHeadingScopeDiagnostic(first.error)).toBe(first.diagnostic);
			expect(sourceHeadingStructureDiagnostic(first.error)).toBe(
				first.structure,
			);
		},
	);

	it("keeps matching nonplain cell closes on the unchanged strict predicate", async () => {
		await expectSelectedScopeFailure(
			`<table><tr><td>${hiddenHeading}</td extra=x>`,
			{
				condition: "non-plain-close",
				expectedScope: "td",
				observedScope: "td",
				depth: 3,
			},
		);
	});

	it.each([
		["<td/>", "scope-self-closing", true],
		["<td duplicate duplicate>", "tokenizer-issue", false],
	] as const)(
		"keeps malformed sibling start %s ahead of transition mutation",
		async (token, reason, committed) => {
			const prefix = "<table><tr><td>A";
			const error = await captureFailure(() =>
				selectedScan(`${prefix}${token}${outsideHeading}`),
			);
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason,
				position: prefix.length + (committed ? token.length : 0),
				positionSemantics: "last-committed-source-utf16",
			});
			expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([1, 2])(
		"does not drain unresolved tables at EOF with maxEntries=%i",
		async (maxEntries) => {
			const source = `<h1>Before</h1><table><tr><td>${hiddenHeading}<td>${hiddenHeading}`;
			const error = await captureFailure(() =>
				selectedScan(source, { maxEntries }),
			);
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason: "unclosed-context",
				position: source.length,
				positionSemantics: "last-committed-source-utf16",
			});
			expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
		},
	);

	it("preserves source UTF16 anchors through reduced native windows and recovery", async () => {
		const prefix = `😀\r\n<table><tbody><tr><td>${hiddenHeading}<th>${hiddenHeading}</table>`;
		const ordinary = await expectOutsideHeading(prefix);
		const windowed = await expectOutsideHeading(prefix, {
			maxWindowCodeUnits: 64,
		});
		expect(windowed.report.entries).toEqual(ordinary.report.entries);
		expect(windowed.report.source).toEqual(ordinary.report.source);
		expect(windowed.report.counters.suppressedHeadingStarts).toBe(2);
	});

	it.each(["success", "scope-rejection", "depth-limit"] as const)(
		"closes the actual native cursor after %s on the opt-in path",
		async (scenario) => {
			const cursors = observeNativeCursors();
			const prefix = `<table><tr><td>${hiddenHeading}`;
			if (scenario === "success") {
				await expectOutsideHeading(`${prefix}</table>`);
			} else {
				const source =
					scenario === "scope-rejection"
						? `${prefix}</table extra=x>${outsideHeading}`
						: `${prefix}</table>${outsideHeading}`;
				const error = await captureFailure(() =>
					selectedScan(
						source,
						scenario === "depth-limit" ? { maxTrackedDepth: 2 } : {},
					),
				);
				expectCode(
					error,
					scenario === "depth-limit" ? "resource-limit" : "unsupported",
				);
			}
			expect(cursors.size).toBe(1);
			for (const cursor of cursors) expect(cursor.closed).toBe(true);
		},
	);

	it("bounds repeated transition work and enforces a reduced real work cap", async () => {
		const sourceFor = (count: number) =>
			`<table><tr>${`<td>${hiddenHeading}`.repeat(count)}</table>${outsideHeading}`;
		const small = await selectedScan(sourceFor(12));
		const large = await selectedScan(sourceFor(24));
		expect(large.report.counters.workUnits).toBeGreaterThan(
			small.report.counters.workUnits,
		);
		expect(large.report.counters.workUnits).toBeLessThanOrEqual(
			small.report.counters.workUnits * 3,
		);
		const limit = large.report.counters.workUnits - 1;
		const error = await captureFailure(() =>
			selectedScan(sourceFor(24), { maxWorkUnits: limit }),
		);
		expectCode(error, "resource-limit");
		const diagnostic = resourceLimitDiagnostic(error);
		expect(["source.headings-work", "html.cursor-work"]).toContain(
			diagnostic?.kind,
		);
		expect(diagnostic?.limit).toBe(limit);
		expect(diagnostic?.observed).toBeGreaterThan(limit);
	});

	it.each(["aborted", "timeout"] as const)(
		"cooperates with %s after a real sibling-cell transition",
		async (code) => {
			let now = 1_000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = controllerFor();
			const cursors = new Set<HtmlTokenCursor>();
			const next = HtmlTokenCursor.prototype.next;
			const repairedPrefix = "<table><tr><td>A<td>";
			let scheduled = false;
			let dispatched = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				cursors.add(this);
				if (!scheduled && this.position >= repairedPrefix.length) {
					scheduled = true;
					timer = setTimeout(() => {
						dispatched = true;
						now = 1_010;
						if (code === "aborted") controller.abort(new Error(privateMarker));
					}, 0);
				}
				return next.call(this);
			});
			try {
				const error = await captureFailure(() =>
					discoverResearchSourceHeadings(
						ownedSource(
							`${repairedPrefix}B${"<td>C".repeat(24)}</table>${outsideHeading}`,
						),
						{
							method,
							tableScopePolicy,
							timeoutMs: 10,
							yieldEveryOperations: 1,
						},
						controller.signal,
					),
				);
				expect(scheduled).toBe(true);
				expect(dispatched).toBe(true);
				expectCode(error, code);
				expect((error as Error).message).not.toContain(privateMarker);
				expect(cursors.size).toBe(1);
				for (const cursor of cursors) expect(cursor.closed).toBe(true);
			} finally {
				clearTimeout(timer);
			}
		},
	);
});

describe("explicit v2 canonical thead-to-tbody starts", () => {
	const tableScopePolicy = "optional-end-tags-v2";
	const hiddenHeading = `<h2>${privateMarker}</h2>`;
	const outsideHeading = "<h1>After 😀</h1>";
	const header = "<table><thead><tr><th>";
	const transitioned = `${header}<tbody>`;
	const syntheticHead = `<head>${header}x<tbody>${"<tr><th>x<td>x<td>x<td>x".repeat(5)}</table>`;

	function selectedScan(source: string, limits: Record<string, unknown> = {}) {
		return scan(source, { tableScopePolicy, ...limits });
	}

	async function expectOutside(
		prefix: string,
		limits: Record<string, unknown> = {},
	) {
		const source = prefix + outsideHeading;
		const result = await selectedScan(source, limits);
		expect(result.report.entries).toEqual([
			{
				ordinal: 1,
				level: 1,
				title: "After 😀",
				titleTruncated: false,
				anchor: {
					kind: "source-utf16-range-v1",
					startTag: { start: prefix.length, end: prefix.length + 4 },
					endTag: { start: source.length - 5, end: source.length },
				},
			},
		]);
		expect(result.report.tableScopePolicy).toBe(tableScopePolicy);
		expect(result.report.completion).toBe("eof");
		expect(result.report.scannedTo).toBe(source.length);
		expect(result.report.source.bytes).toEqual({
			length: encoder.encode(source).byteLength,
			sha256: sha256(encoder.encode(source)),
		});
		expect(result.report.source.text.codeUnits).toBe(source.length);
		expect(result.report.source.text.sha256).toBe(sha256(source));
		expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
		expect(result.jsonl).not.toContain(privateMarker);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(sourceHeadingScopeContextDiagnostic(result)).toBeUndefined();
		expectDeepFrozen(result);
		return result;
	}

	async function expectScopeFailure(
		source: string,
		scopes: readonly SourceHeadingScope[],
		observedScope: SourceHeadingScope = "table",
		condition: SourceHeadingScopeDiagnostic["condition"] = "scope-mismatch",
	) {
		const error = await captureFailure(() => selectedScan(source));
		expectCode(error, "unsupported");
		expect((error as Error).message).toBe(
			"Unsupported native source-heading structure",
		);
		expect(sourceHeadingStructureDiagnostic(error)).toEqual({
			kind: "source-heading-structure",
			reason: "scope-close-structure",
			position: source.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(sourceHeadingScopeDiagnostic(error)).toEqual({
			kind: "source-heading-scope-close",
			condition,
			expectedScope: scopes.at(-1) ?? null,
			observedScope,
			depth: scopes.length,
		});
		const context = sourceHeadingScopeContextDiagnostic(error);
		expect(context).toEqual({
			kind: "source-heading-scope-context",
			tableScopePolicy,
			order: "outer-to-inner",
			scopes,
		});
		expect(sourceHeadingScopeContextDiagnostic(error)).toBe(context);
		expectDeepFrozen(context);
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		expect(JSON.stringify(context)).not.toContain(privateMarker);
		return { error, context };
	}

	function observeNativeCursors() {
		const cursors = new Set<HtmlTokenCursor>();
		const next = HtmlTokenCursor.prototype.next;
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			cursors.add(this);
			return next.call(this);
		});
		return cursors;
	}

	it.each([
		{ name: "empty section", suffix: "", scopes: [] },
		{ name: "row", suffix: "<tr>", scopes: ["tr"] },
		{ name: "td cell", suffix: "<tr><td>", scopes: ["tr", "td"] },
		{ name: "th cell", suffix: "<tr><th>", scopes: ["tr", "th"] },
	] as const)(
		"replaces canonical thead with $name only under v2",
		async (fixture) => {
			const prefix = `<table><thead>${fixture.suffix}${hiddenHeading}<tbody><tr><td>${hiddenHeading}</table>`;
			const result = await expectOutside(prefix, { maxTrackedDepth: 4 });
			expect(result.report.counters.maxTrackedDepth).toBe(4);
			expect(result.report.counters.suppressedHeadingStarts).toBe(2);
			let strictError: unknown;
			for (const policy of ["strict", "optional-end-tags-v1"] as const) {
				const error = await captureFailure(() =>
					scan(
						prefix + outsideHeading,
						policy === "strict" ? {} : { tableScopePolicy: policy },
					),
				);
				expectCode(error, "unsupported");
				expect(sourceHeadingStructureDiagnostic(error)).toEqual({
					kind: "source-heading-structure",
					reason: "scope-close-structure",
					position: prefix.length,
					positionSemantics: "last-committed-source-utf16",
				});
				expect(sourceHeadingScopeContextDiagnostic(error)).toEqual({
					kind: "source-heading-scope-context",
					tableScopePolicy: policy,
					order: "outer-to-inner",
					scopes: ["table", "thead", ...fixture.scopes, "tbody", "tr", "td"],
				});
				if (policy === "strict") strictError = error;
				else {
					expect(sourceHeadingScopeDiagnostic(error)).toEqual(
						sourceHeadingScopeDiagnostic(strictError),
					);
					expect(sourceHeadingStructureDiagnostic(error)).toEqual(
						sourceHeadingStructureDiagnostic(strictError),
					);
				}
			}
		},
	);

	it("keeps alternating later cells and rows within depth four", async () => {
		const cells = Array.from(
			{ length: 6 },
			(_value, index) => `<${index % 2 === 0 ? "td" : "th"}>${hiddenHeading}`,
		).join("");
		const prefix = `${header}${hiddenHeading}<tbody>${`<tr>${cells}`.repeat(12)}</table>`;
		const result = await expectOutside(prefix, { maxTrackedDepth: 4 });
		expect(result.report.counters.maxTrackedDepth).toBe(4);
		expect(result.report.counters.suppressedHeadingStarts).toBe(73);
		expect(result.report.counters.suppressedStarts).toEqual({
			table: 1,
			thead: 1,
			tbody: 1,
			tr: 13,
			th: 37,
			td: 36,
		});
		expect(result.report.counters.yields).toBeGreaterThan(0);
	});

	it.each([
		["template", "<template>", "</template>", 5],
		["head", "<head>", "</head>", 5],
		["outer table cell", "<table><tr><td>", "</table>", 7],
	] as const)(
		"retains the %s prefix around a complete inner table",
		async (_name, opening, closing, depth) => {
			const prefix = `${opening}${header}${hiddenHeading}<tbody><tr><td>${hiddenHeading}</table>${hiddenHeading}${closing}`;
			const result = await expectOutside(prefix, { maxTrackedDepth: depth });
			expect(result.report.counters.maxTrackedDepth).toBe(depth);
			expect(result.report.counters.suppressedHeadingStarts).toBe(3);
		},
	);

	it("reproduces a synthetic 31-name v1 stack without treating it as live markup", async () => {
		const expectedScopes = [
			"head",
			"table",
			"thead",
			"tr",
			"th",
			"tbody",
			...Array.from({ length: 5 }, () => ["tr", "th", "td", "td", "td"]).flat(),
		];
		expect(expectedScopes).toHaveLength(31);
		const legacy = await captureFailure(() =>
			scan(syntheticHead, { tableScopePolicy: "optional-end-tags-v1" }),
		);
		expectCode(legacy, "unsupported");
		expect(sourceHeadingScopeContextDiagnostic(legacy)).toEqual({
			kind: "source-heading-scope-context",
			tableScopePolicy: "optional-end-tags-v1",
			order: "outer-to-inner",
			scopes: expectedScopes,
		});
		expect(sourceHeadingStructureDiagnostic(legacy)?.position).toBe(
			syntheticHead.length,
		);
		const selected = await captureFailure(() => selectedScan(syntheticHead));
		expectCode(selected, "unsupported");
		expect(sourceHeadingStructureDiagnostic(selected)).toEqual({
			kind: "source-heading-structure",
			reason: "unclosed-context",
			position: syntheticHead.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(sourceHeadingScopeContextDiagnostic(selected)).toBeUndefined();
	});

	it("exposes the remaining outer head with a tracked template mismatch", async () => {
		await expectScopeFailure(
			`${syntheticHead}${hiddenHeading}</template>`,
			["head"],
			"template",
		);
	});

	it("keeps headings suppressed until the retained head closes explicitly", async () => {
		const result = await expectOutside(
			`${syntheticHead}${hiddenHeading}</head>`,
		);
		expect(result.report.counters.suppressedHeadingStarts).toBe(1);
	});

	it.each(["</head extra=x>"])(
		"does not relax the retained head close %s",
		async (closing) => {
			await expectScopeFailure(
				`${syntheticHead}${closing}`,
				["head"],
				"head",
				"non-plain-close",
			);
		},
	);

	it.each(["template", "svg", "math", "caption", "colgroup"] as const)(
		"does not cross opaque %s within the proposed header suffix",
		async (scope) => {
			await expectScopeFailure(`${header}<${scope}><tbody></table>`, [
				"table",
				"thead",
				"tr",
				"th",
				scope,
				"tbody",
			]);
		},
	);

	it.each([
		{
			name: "missing table",
			source: "<thead><tr><th><tbody></table>",
			scopes: ["thead", "tr", "th", "tbody"],
			observed: "table",
		},
		{
			name: "missing row",
			source: "<table><thead><th><tbody></table>",
			scopes: ["table", "thead", "th", "tbody"],
			observed: "table",
		},
		{
			name: "duplicate section",
			source: "<table><thead><thead><tr><th><tbody></table>",
			scopes: ["table", "thead", "thead", "tr", "th", "tbody"],
			observed: "table",
		},
		{
			name: "outer group behind an inner table",
			source: `${header}<table><tbody></thead>`,
			scopes: ["table", "thead", "tr", "th", "table", "tbody"],
			observed: "thead",
		},
		{
			name: "cells without a row",
			source: "<table><thead><td><th><tbody></table>",
			scopes: ["table", "thead", "td", "th", "tbody"],
			observed: "table",
		},
	] as const)("leaves $name unrepaired", async (fixture) => {
		await expectScopeFailure(fixture.source, fixture.scopes, fixture.observed);
	});

	it.each([
		["thead", "tfoot"],
		["thead", "thead"],
		["tfoot", "tbody"],
		["tbody", "thead"],
	] as const)(
		"does not add a %s to %s section replacement",
		async (previous, incoming) => {
			await expectScopeFailure(
				`<table><${previous}><tr><th><${incoming}></table>`,
				["table", previous, "tr", "th", incoming],
			);
		},
	);

	it.each(["thead", "tfoot"] as const)(
		"does not change implicit %s table-end rejection",
		async (group) => {
			await expectScopeFailure(`<table><${group}><tr><td></table>`, [
				"table",
				group,
				"tr",
				"td",
			]);
		},
	);

	it.each([1, 2])(
		"does not drain v2 contexts at EOF with maxEntries=%i",
		async (maxEntries) => {
			const source = `<h1>Before</h1>${transitioned}<tr><td>${hiddenHeading}`;
			const error = await captureFailure(() =>
				selectedScan(source, { maxEntries }),
			);
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason: "unclosed-context",
				position: source.length,
				positionSemantics: "last-committed-source-utf16",
			});
			expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([
		["<tbody/>", "scope-self-closing", true],
		["<tbody duplicate duplicate>", "tokenizer-issue", false],
	] as const)(
		"rejects malformed incoming %s before planning",
		async (token, reason, committed) => {
			const prefix = `${header}x`;
			const error = await captureFailure(() =>
				selectedScan(prefix + token + outsideHeading),
			);
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason,
				position: prefix.length + (committed ? token.length : 0),
				positionSemantics: "last-committed-source-utf16",
			});
			expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
		},
	);

	it.each(["</table extra=x>", "</table/>"])(
		"keeps the post-transition stack for nonplain %s",
		async (closing) => {
			await expectScopeFailure(`${transitioned}<tr><td>x${closing}`, [
				"table",
				"tbody",
				"tr",
				"td",
			]);
		},
	);

	it("keeps closing-token issues ahead of scope diagnostics after transition", async () => {
		const prefix = `${transitioned}<tr><td>x`;
		const error = await captureFailure(() =>
			selectedScan(`${prefix}</table duplicate duplicate>`),
		);
		expectCode(error, "unsupported");
		expect(sourceHeadingStructureDiagnostic(error)).toEqual({
			kind: "source-heading-structure",
			reason: "tokenizer-issue",
			position: prefix.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
	});

	it("keeps snapshotted v2 context provenance after options mutate during a yield", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const options = { method, tableScopePolicy, yieldEveryOperations: 1 };
		const controller = controllerFor();
		const pending = observe(
			discoverResearchSourceHeadings(
				ownedSource(`${transitioned}<tr><td>x</table extra=x>`),
				options,
				controller.signal,
			),
		);
		const changed = vi.fn(() => {
			throw new Error(privateMarker);
		});
		try {
			await microtasks();
			expect(pending.settled).toBe(false);
			expect(vi.getTimerCount()).toBeGreaterThan(0);
			Object.defineProperty(options, "tableScopePolicy", {
				get: changed,
				enumerable: true,
				configurable: true,
			});
			await vi.runAllTimersAsync();
			const outcome = await pending.outcome;
			expectCode(outcome.error, "unsupported");
			expect(outcome.value).toBeUndefined();
			const context = sourceHeadingScopeContextDiagnostic(outcome.error);
			expect(context).toEqual({
				kind: "source-heading-scope-context",
				tableScopePolicy,
				order: "outer-to-inner",
				scopes: ["table", "tbody", "tr", "td"],
			});
			expectDeepFrozen(context);
			expect(sourceHeadingScopeContextDiagnostic(outcome.error)).toBe(context);
			expect(
				sourceHeadingScopeContextDiagnostic({ ...context }),
			).toBeUndefined();
			expect(changed).not.toHaveBeenCalled();
		} finally {
			controller.abort();
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it.each(["strict", "optional-end-tags-v1"] as const)(
		"retains fixed %s no-table report counters and schema",
		async (policy) => {
			const source = "<h1>A</h1>";
			const options = policy === "strict" ? {} : { tableScopePolicy: policy };
			const baseline = await scan(source, options);
			expect(baseline.report.counters).toEqual({
				tokens: 3,
				operations: 4,
				workUnits: 24,
				issueAttempts: 0,
				entityIssues: {},
				omittedStarts: {},
				suppressedStarts: {},
				suppressedHeadingStarts: 0,
				rawStarts: {},
				maxTrackedDepth: 1,
				yields: 0,
			});
			expect(baseline.report.limits).toEqual(canonicalLimits);
			expect(baseline.report.tableScopePolicy).toBe(
				policy === "strict" ? undefined : policy,
			);
			expect(Object.hasOwn(baseline.report, "tableScopePolicy")).toBe(
				policy !== "strict",
			);
			expect(await scan(source, options)).toEqual(baseline);
			const selected = await selectedScan(source);
			const { tableScopePolicy: selectedPolicy, ...selectedReport } =
				selected.report;
			const { tableScopePolicy: legacyPolicy, ...legacyReport } =
				baseline.report;
			expect(selectedPolicy).toBe(tableScopePolicy);
			expect(legacyPolicy).toBe(policy === "strict" ? undefined : policy);
			expect(selectedReport).toEqual(legacyReport);
			expect(selected.jsonl).toBe(`${JSON.stringify(selected.report)}\n`);
			expectDeepFrozen(selected);
		},
	);

	it.each([32])(
		"retains astral/CRLF source anchors with a %i-unit native window",
		async (maxWindowCodeUnits) => {
			const prefix = `${"x".repeat(maxWindowCodeUnits - 1)}😀\r\n${header}${hiddenHeading}<tbody><tr><td>${hiddenHeading}</table>`;
			const ordinary = await expectOutside(prefix);
			const windowed = await expectOutside(prefix, { maxWindowCodeUnits });
			expect(windowed.report.entries).toEqual(ordinary.report.entries);
			expect(windowed.report.source).toEqual(ordinary.report.source);
			expect(windowed.report.counters.suppressedHeadingStarts).toBe(2);
			expect(windowed.report.source.bytes.length).toBeGreaterThan(
				windowed.report.source.text.codeUnits,
			);
		},
	);

	it.each(["success", "scope-rejection"] as const)(
		"closes the actual native cursor after v2 %s",
		async (scenario) => {
			const cursors = observeNativeCursors();
			if (scenario === "success")
				await expectOutside(`${transitioned}<tr><td>x</table>`);
			else {
				const error = await captureFailure(() =>
					selectedScan(`${transitioned}<tr><td>x</table extra=x>`),
				);
				expectCode(error, "unsupported");
			}
			expect(cursors.size).toBe(1);
			for (const cursor of cursors) expect(cursor.closed).toBe(true);
		},
	);

	it("bounds finite repeated v2 transition work without downward searches", async () => {
		const table = `${transitioned}<tr><td>${hiddenHeading}</table>`;
		const small = await expectOutside(table.repeat(8), { maxTrackedDepth: 4 });
		const large = await expectOutside(table.repeat(16), { maxTrackedDepth: 4 });
		expect(large.report.counters.workUnits).toBeGreaterThan(
			small.report.counters.workUnits,
		);
		expect(large.report.counters.workUnits).toBeLessThanOrEqual(
			small.report.counters.workUnits * 3,
		);
		expect(large.report.counters.suppressedStarts.tbody).toBe(16);
		expect(large.report.counters.suppressedHeadingStarts).toBe(16);
	});

	it("admits an exact real work cap and rejects one unit less without context branding", async () => {
		const source = `${transitioned}${`<tr><td>${hiddenHeading}<th>${hiddenHeading}`.repeat(12)}</table>${outsideHeading}`;
		const baseline = await selectedScan(source);
		const limit = baseline.report.counters.workUnits;
		const exact = await selectedScan(source, { maxWorkUnits: limit });
		expect(exact.report.counters).toEqual(baseline.report.counters);
		expect(exact.report.entries).toEqual(baseline.report.entries);
		const error = await captureFailure(() =>
			selectedScan(source, { maxWorkUnits: limit - 1 }),
		);
		expectCode(error, "resource-limit");
		expect(["source.headings-work", "html.cursor-work"]).toContain(
			resourceLimitDiagnostic(error)?.kind,
		);
		expect(resourceLimitDiagnostic(error)?.limit).toBe(limit - 1);
		expect(resourceLimitDiagnostic(error)?.observed).toBeGreaterThan(limit - 1);
		expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
	});

	it("keeps a prior trusted header snapshot independent of failed v2 mutation admission", async () => {
		const original = await expectScopeFailure(
			`${header}</head>`,
			["table", "thead", "tr", "th"],
			"head",
		);
		const source = `${transitioned}</head>`;
		const native = new HtmlTokenCursor(source, () => {
			throw new Error("Unexpected synthetic tokenizer issue");
		});
		try {
			for (let attempt = 0; attempt < 5; attempt++)
				expect(native.next()).toBeDefined();
			expect(native.position).toBe(transitioned.length);
			const observed = native.workUnits + 21;
			const limit = observed - 1;
			const cursors = observeNativeCursors();
			const error = await captureFailure(() =>
				selectedScan(source, { maxWorkUnits: limit }),
			);
			expectLimit(error, {
				kind: "source.headings-work",
				unit: "code-units",
				limit,
				observed,
			});
			expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
			expect(sourceHeadingScopeContextDiagnostic(original.error)).toBe(
				original.context,
			);
			expect(original.context?.scopes).toEqual(["table", "thead", "tr", "th"]);
			expect(cursors.size).toBe(1);
			for (const cursor of cursors) {
				expect(cursor.closed).toBe(true);
				expect(cursor.position).toBe(transitioned.length);
			}
		} finally {
			native.close();
		}
	});

	it.each([
		{
			limits: { maxWindowCodeUnits: 6 },
			kind: "html.cursor-window",
			limit: 6,
			observed: 7,
		},
		{
			limits: { maxOperations: 4 },
			kind: "html.cursor-operations",
			limit: 4,
			observed: 5,
		},
	] as const)(
		"retains the real $kind bound before a new section can complete",
		async (fixture) => {
			const error = await captureFailure(() =>
				selectedScan(`${transitioned}</tbody></table>`, fixture.limits),
			);
			expectLimit(error, {
				kind: fixture.kind,
				unit:
					fixture.kind === "html.cursor-window" ? "code-units" : "operations",
				limit: fixture.limit,
				observed: fixture.observed,
			});
			expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
		},
	);

	it.each(["aborted", "timeout"] as const)(
		"cooperates with %s after an actual v2 section transition",
		async (code) => {
			let now = 1_000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = controllerFor();
			const cursors = new Set<HtmlTokenCursor>();
			const next = HtmlTokenCursor.prototype.next;
			let scheduled = false;
			let dispatched = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				cursors.add(this);
				if (!scheduled && this.position >= transitioned.length) {
					scheduled = true;
					timer = setTimeout(() => {
						dispatched = true;
						now = 1_010;
						if (code === "aborted") controller.abort(new Error(privateMarker));
					}, 0);
				}
				return next.call(this);
			});
			try {
				const error = await captureFailure(() =>
					discoverResearchSourceHeadings(
						ownedSource(
							`${transitioned}x<tr><td>${"<td>x".repeat(24)}</table>${outsideHeading}`,
						),
						{
							method,
							tableScopePolicy,
							timeoutMs: 10,
							yieldEveryOperations: 1,
						},
						controller.signal,
					),
				);
				expect(scheduled).toBe(true);
				expect(dispatched).toBe(true);
				expectCode(error, code);
				expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
				expect(cursors.size).toBe(1);
				for (const cursor of cursors) expect(cursor.closed).toBe(true);
			} finally {
				clearTimeout(timer);
			}
		},
	);

	it.each(["accessor", "proxy"] as const)(
		"does not admit %s options through v2",
		async (kind) => {
			const trap = vi.fn((): never => {
				throw new Error(privateMarker);
			});
			const options =
				kind === "accessor"
					? Object.defineProperty({ method }, "tableScopePolicy", { get: trap })
					: new Proxy(
							{ method, tableScopePolicy },
							{
								get: trap,
								getPrototypeOf: trap,
								getOwnPropertyDescriptor: trap,
								ownKeys: trap,
							},
						);
			const error = await captureFailure(() =>
				discoverResearchSourceHeadings(ownedSource("<h1>A</h1>"), options),
			);
			expectCode(error, "invalid-input");
			expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
			expect(trap).not.toHaveBeenCalled();
		},
	);
});

describe("explicit leading-head body-boundary policy", () => {
	const headScopePolicy = "explicit-body-boundary-v1";
	const outsideHeading = "<h1>After 😀</h1>";
	const hiddenHeading = `<h2>${privateMarker}</h2>`;
	const transitioned = "<head><body>";

	function selectedScan(source: string, limits: Record<string, unknown> = {}) {
		return scan(source, { headScopePolicy, ...limits });
	}

	async function expectOutside(
		prefix: string,
		limits: Record<string, unknown> = {},
	) {
		const source = prefix + outsideHeading;
		const result = await selectedScan(source, limits);
		expect(result.report.entries).toEqual([
			{
				ordinal: 1,
				level: 1,
				title: "After 😀",
				titleTruncated: false,
				anchor: {
					kind: "source-utf16-range-v1",
					startTag: { start: prefix.length, end: prefix.length + 4 },
					endTag: { start: source.length - 5, end: source.length },
				},
			},
		]);
		expect(result.report.headScopePolicy).toBe(headScopePolicy);
		expect(result.report.completion).toBe("eof");
		expect(result.report.scannedTo).toBe(source.length);
		expect(result.report.source.bytes).toEqual({
			length: encoder.encode(source).byteLength,
			sha256: sha256(encoder.encode(source)),
		});
		expect(result.report.source.text.codeUnits).toBe(source.length);
		expect(result.report.source.text.sha256).toBe(sha256(source));
		expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
		expect(result.jsonl).not.toContain(privateMarker);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expectDeepFrozen(result);
		return result;
	}

	async function expectScopeFailure(
		source: string,
		scopes: readonly SourceHeadingScope[],
		observedScope: SourceHeadingScope = "template",
	) {
		const error = await captureFailure(() => selectedScan(source));
		expectCode(error, "unsupported");
		expect(sourceHeadingStructureDiagnostic(error)).toEqual({
			kind: "source-heading-structure",
			reason: "scope-close-structure",
			position: source.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(sourceHeadingScopeDiagnostic(error)).toEqual({
			kind: "source-heading-scope-close",
			condition: "scope-mismatch",
			expectedScope: scopes.at(-1) ?? null,
			observedScope,
			depth: scopes.length,
		});
		const context = sourceHeadingScopeContextDiagnostic(error);
		expect(context).toEqual({
			kind: "source-heading-scope-context",
			tableScopePolicy: "strict",
			order: "outer-to-inner",
			scopes,
		});
		expectDeepFrozen(context);
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		expect(JSON.stringify(context)).not.toContain(privateMarker);
		return error;
	}

	async function expectDisabled(prefix: string) {
		await expectScopeFailure(`${prefix}<body></template>`, ["head"]);
		const result = await expectOutside(
			`${prefix}<body>${hiddenHeading}</head>`,
		);
		expect(result.report.counters.suppressedHeadingStarts).toBeGreaterThan(0);
	}

	function observeNativeCursors() {
		const cursors = new Set<HtmlTokenCursor>();
		const next = HtmlTokenCursor.prototype.next;
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			cursors.add(this);
			return next.call(this);
		});
		return cursors;
	}

	it.each([
		"",
		`\t\n\f\r <!--${privateMarker} 😀-->`,
		"<!doctype html>",
		'<html lang="en">',
		'<!doctype html>\r\n<!--prefix--><html lang="en">\t',
	])(
		"accepts only selected leading prefix %j at a real body start",
		async (prefix) => {
			const beforeHeading = `${prefix}<HEAD>\t\n\f\r <BODY class="outside">`;
			const result = await expectOutside(beforeHeading);
			expect(result.report.counters.maxTrackedDepth).toBe(1);
			expect(result.report.counters.suppressedStarts).toEqual({ head: 1 });
			const source = beforeHeading + outsideHeading;
			const strict = await captureFailure(() => scan(source));
			expectCode(strict, "unsupported");
			expect(sourceHeadingStructureDiagnostic(strict)).toEqual({
				kind: "source-heading-structure",
				reason: "unclosed-context",
				position: source.length,
				positionSemantics: "last-committed-source-utf16",
			});
		},
	);

	it("preserves explicit head closure and never rearms after it", async () => {
		await expectOutside(`<head>${hiddenHeading}</head><body>`);
		await expectOutside("<head></head><body>");
		await expectScopeFailure("<head></head><head><body></template>", ["head"]);
	});

	it.each([
		'<base href="/synthetic/"><link rel="synthetic"><meta charset="utf-8">',
		`<title>${privateMarker} &amp; 😀</title>`,
		`<style>${privateMarker}</style>`,
		`<script>${privateMarker}</script>`,
	])("retains eligibility through completed metadata %s", async (metadata) => {
		await expectOutside(`<head>${metadata}<body>`);
	});

	it.each([
		`<!--<body>${hiddenHeading}-->`,
		`<meta content='<body>${hiddenHeading}'>`,
		`<title>&lt;body&gt;<body>${hiddenHeading}</title>`,
		`<script><!--<script><body>${hiddenHeading}</script>escaped--></script>`,
	])(
		"does not treat hidden body text as a boundary: %s",
		async (hiddenBody) => {
			await expectScopeFailure(`<head>${hiddenBody}</template>`, ["head"]);
			await expectOutside(`<head>${hiddenBody}<body>`);
		},
	);

	it.each([
		"\u00a0",
		"non-whitespace",
		hiddenHeading,
		`<div hidden>${hiddenHeading}</div>`,
		"&lt;body&gt;",
		`<textarea><body>${hiddenHeading}</textarea>`,
		`<iframe><body>${hiddenHeading}</iframe>`,
		"<svg/>",
	])("permanently disables omission after head content %s", async (content) => {
		await expectDisabled(`<head>${content}`);
		if (content === "\u00a0") await expectDisabled(`${content}<head>`);
	});

	it.each([
		"template",
		"svg",
		"math",
		"select",
		"caption",
		"colgroup",
	] as const)(
		"neither crosses open %s nor rearms after its balanced close",
		async (name) => {
			await expectScopeFailure(
				`<head><${name}><body></head>`,
				["head", name],
				"head",
			);
			await expectDisabled(`<head><${name}>${hiddenHeading}</${name}>`);
		},
	);

	it.each([
		"non-whitespace",
		"<div></div>",
		"<template></template>",
		"<!doctype html><!doctype html>",
		"<html><!doctype html>",
		"<html><html>",
		"<html/>",
		"<body>",
	])("never arms after disqualified leading prefix %s", async (prefix) => {
		await expectDisabled(`${prefix}<head>`);
		if (prefix !== "<body>") await expectDisabled(`<head>${prefix}`);
	});

	it("does not arm a head inside an outer scope or forget nested heads", async () => {
		await expectScopeFailure("<template><head><body></template>", [
			"template",
			"head",
		]);
		await expectScopeFailure("<head><head><body></template>", ["head", "head"]);
		await expectDisabled("<head><head></head>");
	});

	it("does not transition on self-closing body or rearm on a later body", async () => {
		await expectDisabled("<head><body/>");
	});

	it("rejects a redundant explicit head end after the one-frame transition", async () => {
		await expectScopeFailure(`${transitioned}</head>`, [], "head");
	});

	it("does not infer a head end at EOF, end body or end html", async () => {
		for (const ending of ["", "</body>", "</html>"]) {
			const source = `<head><meta charset="utf-8">${ending}`;
			const error = await captureFailure(() => selectedScan(source));
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason: "unclosed-context",
				position: source.length,
				positionSemantics: "last-committed-source-utf16",
			});
			expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
		}
	});

	it.each([
		["<head/>", "scope-self-closing"],
		["<head><script/>", "raw-self-closing"],
		["<head><title><body>", "tokenizer-issue"],
		["<head><script><body></script extra=x>", "raw-close-structure"],
		["<head><body duplicate duplicate>", "tokenizer-issue"],
		["<head><noscript><body>", "ambiguous-text-mode"],
		["<head></head extra=x>", "scope-close-structure"],
	] as const)("retains earlier rejection for %s", async (source, reason) => {
		const strict = await captureFailure(() => scan(source));
		const selected = await captureFailure(() => selectedScan(source));
		expectCode(selected, "unsupported");
		expect(sourceHeadingStructureDiagnostic(selected)?.reason).toBe(reason);
		expect(sourceHeadingStructureDiagnostic(selected)).toEqual(
			sourceHeadingStructureDiagnostic(strict),
		);
		expect(sourceHeadingScopeDiagnostic(selected)).toEqual(
			sourceHeadingScopeDiagnostic(strict),
		);
		expect(sourceHeadingScopeContextDiagnostic(selected)).toEqual(
			sourceHeadingScopeContextDiagnostic(strict),
		);
		expect((selected as Error).message).not.toContain(privateMarker);
	});

	it.each([
		{
			policy: "strict",
			table: `<table><tr><td>${hiddenHeading}</td></tr></table>`,
		},
		{
			policy: "optional-end-tags-v1",
			table: `<table><tbody><tr><td>${hiddenHeading}<tr><td>${hiddenHeading}</table>`,
		},
		{
			policy: "optional-end-tags-v2",
			table: `<table><thead><tr><th>${hiddenHeading}<tbody><tr><td>${hiddenHeading}</table>`,
		},
	] as const)(
		"composes independently with $policy tables, never using them to end head",
		async ({ policy, table }) => {
			const options = policy === "strict" ? {} : { tableScopePolicy: policy };
			const result = await expectOutside(transitioned + table, options);
			expect(result.report.tableScopePolicy).toBe(
				policy === "strict" ? undefined : policy,
			);
			const retained = await expectOutside(
				`<head>${table}<body>${hiddenHeading}</head>`,
				options,
			);
			expect(retained.report.counters.suppressedHeadingStarts).toBeGreaterThan(
				result.report.counters.suppressedHeadingStarts,
			);
		},
	);

	it("reports only the actual post-transition scopes without adding head-policy diagnostics", async () => {
		await expectScopeFailure(`${transitioned}</template>`, []);
		await expectScopeFailure(
			`${transitioned}<template>${hiddenHeading}</head>`,
			["template"],
			"head",
		);
		await expectOutside(`${transitioned}<template>${hiddenHeading}</template>`);
	});

	it("preserves exact default counters and keys while selected success records permission", async () => {
		const source = "<h1>A</h1>";
		const baseline = await scan(source);
		expect(baseline.report.counters).toEqual({
			tokens: 3,
			operations: 4,
			workUnits: 24,
			issueAttempts: 0,
			entityIssues: {},
			omittedStarts: {},
			suppressedStarts: {},
			suppressedHeadingStarts: 0,
			rawStarts: {},
			maxTrackedDepth: 1,
			yields: 0,
		});
		expect(Object.keys(baseline.report)).toEqual([
			"kind",
			"method",
			"semantics",
			"partial",
			"contentSuccess",
			"source",
			"completion",
			"scannedTo",
			"entries",
			"limits",
			"counters",
		]);
		expect(baseline.report.limits).toEqual(canonicalLimits);
		expect(baseline.jsonl).toBe(`${JSON.stringify(baseline.report)}\n`);
		expect(await scan(source)).toEqual(baseline);
		const selected = await selectedScan(source);
		const {
			headScopePolicy: selectedPolicy,
			counters: selectedCounters,
			...selectedReport
		} = selected.report;
		const { counters: baselineCounters, ...baselineReport } = baseline.report;
		expect(selectedPolicy).toBe(headScopePolicy);
		expect(selectedReport).toEqual(baselineReport);
		expect(selectedCounters.tokens).toBe(baselineCounters.tokens);
		expect(selectedCounters.operations).toBe(baselineCounters.operations);
		expect(Object.keys(selected.report).sort()).toEqual(
			[...Object.keys(baseline.report), "headScopePolicy"].sort(),
		);
		expectDeepFrozen(selected);
	});

	it.each(["invalid", "accessor", "proxy"] as const)(
		"rejects %s head selection before touching hostile source or option traps",
		async (kind) => {
			const trap = vi.fn((): never => {
				throw new Error(privateMarker);
			});
			const traps = {
				get: trap,
				getPrototypeOf: trap,
				ownKeys: trap,
				getOwnPropertyDescriptor: trap,
			};
			const source = new Proxy({}, traps);
			const options =
				kind === "invalid"
					? [
							undefined,
							null,
							true,
							"strict",
							"explicit-body-boundary-v2",
							{},
						].map((value) => ({ method, headScopePolicy: value }))
					: [
							kind === "accessor"
								? Object.defineProperty({ method }, "headScopePolicy", {
										get: trap,
									})
								: new Proxy({ method, headScopePolicy }, traps),
						];
			for (const option of options) {
				const error = await captureFailure(() =>
					discoverResearchSourceHeadings(source, option),
				);
				expectCode(error, "invalid-input");
				expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
			}
			expect(trap).not.toHaveBeenCalled();
		},
	);

	it("snapshots head permission before yielding and never rereads a replaced accessor", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const options = { method, headScopePolicy, yieldEveryOperations: 1 };
		const controller = controllerFor();
		const pending = observe(
			discoverResearchSourceHeadings(
				ownedSource(transitioned + outsideHeading),
				options,
				controller.signal,
			),
		);
		const changed = vi.fn(() => {
			throw new Error(privateMarker);
		});
		try {
			await microtasks();
			expect(pending.settled).toBe(false);
			expect(vi.getTimerCount()).toBeGreaterThan(0);
			Object.defineProperty(options, "headScopePolicy", {
				get: changed,
				enumerable: true,
				configurable: true,
			});
			await vi.runAllTimersAsync();
			const outcome = await pending.outcome;
			expect(outcome.error).toBeUndefined();
			expect(outcome.value?.report.headScopePolicy).toBe(headScopePolicy);
			expect(outcome.value?.report.entries.map((entry) => entry.title)).toEqual(
				["After 😀"],
			);
			expect(outcome.value?.report.counters.yields).toBeGreaterThan(0);
			expectDeepFrozen(outcome.value);
			expect(changed).not.toHaveBeenCalled();
		} finally {
			controller.abort();
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it.each([32, 256])(
		"bounds dense ASCII whitespace with a %i-unit native window",
		async (maxWindowCodeUnits) => {
			const whitespace = " \t\r\n\f".repeat(256);
			const prefix = `${whitespace}<head>${whitespace}<body>`;
			const source = prefix + outsideHeading;
			const options = { maxWindowCodeUnits, yieldEveryWorkUnits: 256 };
			const baseline = await expectOutside(prefix, options);
			expect(baseline.report.counters.yields).toBeGreaterThan(0);
			const workLimit = baseline.report.counters.workUnits;
			const exact = await selectedScan(source, {
				...options,
				maxWorkUnits: workLimit,
			});
			expect(exact.report.counters).toEqual(baseline.report.counters);
			expect(exact.report.entries).toEqual(baseline.report.entries);
			const workError = await captureFailure(() =>
				selectedScan(source, { ...options, maxWorkUnits: workLimit - 1 }),
			);
			expectCode(workError, "resource-limit");
			expect(["source.headings-work", "html.cursor-work"]).toContain(
				resourceLimitDiagnostic(workError)?.kind,
			);
			expect(resourceLimitDiagnostic(workError)?.limit).toBe(workLimit - 1);
			expect(resourceLimitDiagnostic(workError)?.observed).toBeGreaterThan(
				workLimit - 1,
			);
			const operationLimit = baseline.report.counters.operations - 1;
			const operationError = await captureFailure(() =>
				selectedScan(source, { ...options, maxOperations: operationLimit }),
			);
			expectLimit(operationError, {
				kind: "html.cursor-operations",
				unit: "operations",
				limit: operationLimit,
				observed: operationLimit + 1,
			});
			const windowError = await captureFailure(() =>
				selectedScan(source, { ...options, maxWindowCodeUnits: 5 }),
			);
			expectLimit(windowError, {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 5,
				observed: 6,
			});
		},
	);

	it("accounts for head-selection provenance in the exact self-describing output cap", async () => {
		const source = transitioned + outsideHeading;
		const baseline = await selectedScan(source);
		let cap = baseline.outputBytes;
		for (let attempt = 0; attempt < 4; attempt++) {
			cap = encoder.encode(
				`${JSON.stringify({
					...baseline.report,
					limits: { ...baseline.report.limits, maxOutputBytes: cap },
				})}\n`,
			).byteLength;
		}
		const exact = await selectedScan(source, { maxOutputBytes: cap });
		expect(String(cap - 1).length).toBe(String(cap).length);
		expect(exact.outputBytes).toBe(cap);
		expect(exact.report.headScopePolicy).toBe(headScopePolicy);
		expect(exact.report.entries).toEqual(baseline.report.entries);
		const error = await captureFailure(() =>
			selectedScan(source, { maxOutputBytes: cap - 1 }),
		);
		expectLimit(error, {
			kind: "source.headings-output",
			unit: "bytes",
			limit: cap - 1,
			observed: cap,
		});
	});

	it.each(["success", "scope-rejection", "work-limit"] as const)(
		"closes the actual native cursor after selected %s",
		async (kind) => {
			const cursors = observeNativeCursors();
			if (kind === "success") await expectOutside(transitioned);
			else if (kind === "scope-rejection")
				await expectScopeFailure(`${transitioned}</head>`, [], "head");
			else {
				const error = await captureFailure(() =>
					selectedScan(transitioned + outsideHeading, { maxWorkUnits: 1 }),
				);
				expectCode(error, "resource-limit");
				expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
			}
			expect(cursors.size).toBe(1);
			for (const cursor of cursors) expect(cursor.closed).toBe(true);
		},
	);

	it.each(["aborted", "timeout"] as const)(
		"cooperates with %s after consuming an actual body boundary",
		async (code) => {
			let now = 1_000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = controllerFor();
			const cursors = new Set<HtmlTokenCursor>();
			const next = HtmlTokenCursor.prototype.next;
			let scheduled = false;
			let dispatched = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				cursors.add(this);
				if (!scheduled && this.position >= transitioned.length) {
					scheduled = true;
					timer = setTimeout(() => {
						dispatched = true;
						now = 1_010;
						if (code === "aborted") controller.abort(new Error(privateMarker));
					}, 0);
				}
				return next.call(this);
			});
			try {
				const error = await captureFailure(() =>
					discoverResearchSourceHeadings(
						ownedSource(
							`${transitioned}${"<div>x</div>".repeat(24)}${outsideHeading}`,
						),
						{ method, headScopePolicy, timeoutMs: 10, yieldEveryOperations: 1 },
						controller.signal,
					),
				);
				expect(scheduled).toBe(true);
				expect(dispatched).toBe(true);
				expectCode(error, code);
				expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
				expect(cursors.size).toBe(1);
				for (const cursor of cursors) expect(cursor.closed).toBe(true);
			} finally {
				clearTimeout(timer);
			}
		},
	);

	it("preserves depth admission after transition without retaining an invented head", async () => {
		await expectOutside(transitioned, { maxTrackedDepth: 1 });
		const error = await captureFailure(() =>
			selectedScan(`${transitioned}<template><select>`, { maxTrackedDepth: 1 }),
		);
		expectLimit(error, {
			kind: "source.headings-depth",
			unit: "levels",
			limit: 1,
			observed: 2,
		});
	});

	it("preserves native entity-issue admission inside an allowed raw block", async () => {
		const prefix = "<head><title>&#0;</title><body>";
		const accepted = await expectOutside(prefix, { maxIssues: 1 });
		expect(accepted.report.counters.issueAttempts).toBe(1);
		expect(accepted.report.counters.entityIssues).toEqual({
			"invalid-numeric-entity": 1,
		});
		const strict = await captureFailure(() =>
			scan(prefix + outsideHeading, { maxIssues: 0 }),
		);
		const selected = await captureFailure(() =>
			selectedScan(prefix + outsideHeading, { maxIssues: 0 }),
		);
		expectCode(selected, "resource-limit");
		expect(resourceLimitDiagnostic(selected)).toEqual(
			resourceLimitDiagnostic(strict),
		);
	});
});

describe("trusted bounded scope-context diagnostics", () => {
	const policies = ["strict", "optional-end-tags-v1"] as const;
	const admittedNames: readonly SourceHeadingScope[] = [
		...suppressedNames,
		...omittedFrames,
	];

	function policyOptions(
		policy: SourceHeadingScopeContextDiagnostic["tableScopePolicy"],
	) {
		return policy === "strict" ? {} : { tableScopePolicy: policy };
	}

	async function expectContextFailure(
		source: string,
		expectedScopes: readonly SourceHeadingScope[],
		policy: SourceHeadingScopeContextDiagnostic["tableScopePolicy"] = "strict",
		limits: Record<string, unknown> = {},
	) {
		const error = await captureFailure(() =>
			scan(source, { ...limits, ...policyOptions(policy) }),
		);
		expectCode(error, "unsupported");
		const context = sourceHeadingScopeContextDiagnostic(error);
		expect(context).toBeDefined();
		if (!context)
			throw new Error("Expected trusted source-heading scope context");
		const expected: SourceHeadingScopeContextDiagnostic = {
			kind: "source-heading-scope-context",
			tableScopePolicy: policy,
			order: "outer-to-inner",
			scopes: expectedScopes,
		};
		expect(context).toEqual(expected);
		expect(Reflect.ownKeys(context)).toEqual([
			"kind",
			"tableScopePolicy",
			"order",
			"scopes",
		]);
		expect(Object.isFrozen(context)).toBe(true);
		expect(Object.isFrozen(context.scopes)).toBe(true);
		expect(context.scopes).not.toBe(expectedScopes);
		expect(context.scopes.length).toBeLessThanOrEqual(
			canonicalLimits.maxTrackedDepth,
		);
		expect(context.scopes.every((name) => admittedNames.includes(name))).toBe(
			true,
		);
		expect(sourceHeadingScopeContextDiagnostic(error)).toBe(context);
		expect(sourceHeadingStructureDiagnostic(error)).toEqual({
			kind: "source-heading-structure",
			reason: "scope-close-structure",
			position: source.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(sourceHeadingScopeDiagnostic(error)?.depth).toBe(
			expectedScopes.length,
		);
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		expect(JSON.stringify(context)).not.toContain(privateMarker);
		return { error, context };
	}

	it.each(policies)(
		"snapshots an empty actual stack under %s without an invented frame",
		async (policy) => {
			const { error, context } = await expectContextFailure(
				"</table>",
				[],
				policy,
			);
			expect(context.scopes).toHaveLength(0);
			expect(sourceHeadingScopeDiagnostic(error)).toEqual({
				kind: "source-heading-scope-close",
				condition: "scope-mismatch",
				expectedScope: null,
				observedScope: "table",
				depth: 0,
			});
		},
	);

	it.each(policies)(
		"retains actual outer-to-inner tracked order under %s",
		async (policy) => {
			const source = `<template><table><tbody><tr><td><svg><foreignObject>${privateMarker}</foreignObject></head>`;
			const { error, context } = await expectContextFailure(
				source,
				["template", "table", "tbody", "tr", "td", "svg"],
				policy,
			);
			expect(sourceHeadingScopeDiagnostic(error)).toEqual({
				kind: "source-heading-scope-close",
				condition: "scope-mismatch",
				expectedScope: "svg",
				observedScope: "head",
				depth: 6,
			});
			expect(JSON.stringify(context)).not.toContain("foreignObject");
		},
	);

	it.each(admittedNames)(
		"retains the actual admitted %s frame without source attributes or text",
		async (name) => {
			const observed = name === "template" ? "head" : "template";
			const source = `<${name} data-secret="${privateMarker}">${privateMarker}</${observed}>`;
			const { context } = await expectContextFailure(source, [name]);
			expect(JSON.stringify(context)).not.toContain("data-secret");
		},
	);

	it("does not invent tracked frames for consumed raw, void or foreign self-closes", async () => {
		const source = `<template><svg/><math/><input><script>${privateMarker}</script><table><tbody><tr><td></head>`;
		await expectContextFailure(
			source,
			["template", "table", "tbody", "tr", "td"],
			"optional-end-tags-v1",
		);
	});

	it("snapshots the actual remaining prefix after successful opt-in transitions", async () => {
		const source =
			"<template><table><tbody><tr><td>A<th>B<tr><td>C</table></head>";
		const { error } = await expectContextFailure(
			source,
			["template"],
			"optional-end-tags-v1",
		);
		expect(sourceHeadingScopeDiagnostic(error)).toEqual({
			kind: "source-heading-scope-close",
			condition: "scope-mismatch",
			expectedScope: "template",
			observedScope: "head",
			depth: 1,
		});
	});

	it.each([
		{
			name: "rejected ancestor plan",
			source: "<template><table><tbody><tr><td>x</table extra=x>",
			scopes: ["template", "table", "tbody", "tr", "td"],
			condition: "scope-mismatch",
			observedScope: "table",
		},
		{
			name: "matching nonplain close",
			source: "<table><tr><td>x</td extra=x>",
			scopes: ["table", "tr", "td"],
			condition: "non-plain-close",
			observedScope: "td",
		},
	] as const)("keeps the original stack for $name", async (fixture) => {
		const { error } = await expectContextFailure(
			fixture.source,
			fixture.scopes,
			"optional-end-tags-v1",
		);
		expect(sourceHeadingScopeDiagnostic(error)).toEqual({
			kind: "source-heading-scope-close",
			condition: fixture.condition,
			expectedScope: "td",
			observedScope: fixture.observedScope,
			depth: fixture.scopes.length,
		});
	});

	it.each(policies)(
		"uses the snapshotted %s selection after host options mutate during a yield",
		async (policy) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			const options: Record<string, unknown> = {
				method,
				yieldEveryOperations: 1,
				...policyOptions(policy),
			};
			const controller = controllerFor();
			const pending = observe(
				discoverResearchSourceHeadings(
					ownedSource("<template></head>"),
					options,
					controller.signal,
				),
			);
			const changed = vi.fn(() => {
				throw new Error(privateMarker);
			});
			try {
				await microtasks();
				expect(pending.settled).toBe(false);
				expect(vi.getTimerCount()).toBeGreaterThan(0);
				Object.defineProperty(options, "tableScopePolicy", {
					get: changed,
					enumerable: true,
					configurable: true,
				});
				await vi.runAllTimersAsync();
				const outcome = await pending.outcome;
				expect(outcome.value).toBeUndefined();
				expectCode(outcome.error, "unsupported");
				expect(sourceHeadingScopeContextDiagnostic(outcome.error)).toEqual({
					kind: "source-heading-scope-context",
					tableScopePolicy: policy,
					order: "outer-to-inner",
					scopes: ["template"],
				});
				expect(changed).not.toHaveBeenCalled();
			} finally {
				controller.abort();
				vi.clearAllTimers();
				vi.useRealTimers();
			}
		},
	);

	it("owns deeply frozen independent snapshots after cleanup without changing error shape", async () => {
		const closed = vi.spyOn(HtmlTokenCursor.prototype, "close");
		const source = `<h1 data-secret="${privateMarker}">${privateMarker}_CANDIDATE</h1><template><table><tr><td>${privateMarker}</head>`;
		const input = {
			...ownedSource(source),
			finalUrl: `https://example.com/${privateMarker}`,
		};
		const error = await captureFailure(() =>
			discoverResearchSourceHeadings(input, { method }),
		);
		expectCode(error, "unsupported");
		const context = sourceHeadingScopeContextDiagnostic(error);
		expect(context).toBeDefined();
		if (!context)
			throw new Error("Expected trusted source-heading scope context");
		expect(context.scopes).toEqual(["template", "table", "tr", "td"]);
		expectDeepFrozen(context);
		expect(Reflect.set(context, "kind", "forged")).toBe(false);
		expect(Reflect.deleteProperty(context, "order")).toBe(false);
		expect(Reflect.set(context.scopes, "0", "head")).toBe(false);
		expect(Reflect.set(context.scopes, "length", 0)).toBe(false);
		expect(Reflect.deleteProperty(context.scopes, "0")).toBe(false);
		expect(Reflect.ownKeys(context)).toEqual([
			"kind",
			"tableScopePolicy",
			"order",
			"scopes",
		]);
		const reference = new AgentBrowserError(
			"unsupported",
			"Unsupported native source-heading structure",
		);
		expect(Reflect.ownKeys(error as object)).toEqual(
			Reflect.ownKeys(reference),
		);
		expect((error as Error).message).toBe(reference.message);
		expect(JSON.stringify({ error, context })).not.toContain(privateMarker);
		expect(JSON.stringify(context)).not.toContain(input.finalUrl);
		expect(sourceHeadingScopeContextDiagnostic(error)).toBe(context);
		const scope = sourceHeadingScopeDiagnostic(error);
		const structure = sourceHeadingStructureDiagnostic(error);
		const repeated = await expectContextFailure(source, [
			"template",
			"table",
			"tr",
			"td",
		]);
		expect(repeated.error).not.toBe(error);
		expect(repeated.context).toEqual(context);
		expect(repeated.context).not.toBe(context);
		expect(repeated.context.scopes).not.toBe(context.scopes);
		await scan("<template></template><h1>After</h1>");
		expect(sourceHeadingScopeContextDiagnostic(error)).toBe(context);
		expect(sourceHeadingScopeDiagnostic(error)).toBe(scope);
		expect(sourceHeadingStructureDiagnostic(error)).toBe(structure);
		expect(closed).toHaveBeenCalled();
		for (const cursor of closed.mock.contexts)
			expect((cursor as HtmlTokenCursor).closed).toBe(true);
	});

	it.each([canonicalLimits.maxTrackedDepth, 3])(
		"copies exactly %i admitted frames and never brands the next depth-limit failure",
		async (limit) => {
			const prefix = "<template>".repeat(limit);
			const expectedScopes = Array.from(
				{ length: limit },
				() => "template" as const,
			);
			for (const policy of policies) {
				const { context } = await expectContextFailure(
					`${prefix}</head>`,
					expectedScopes,
					policy,
					{ maxTrackedDepth: limit },
				);
				expect(context.scopes).toHaveLength(limit);
				const error = await captureFailure(() =>
					scan(`${prefix}<template></head>`, {
						maxTrackedDepth: limit,
						...policyOptions(policy),
					}),
				);
				expectLimit(error, {
					kind: "source.headings-depth",
					unit: "levels",
					limit,
					observed: limit + 1,
				});
				expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
			}
		},
	);

	it.each([
		{
			name: "tokenizer",
			source: "<template></head duplicate duplicate>",
			limits: {},
			code: "unsupported",
		},
		{
			name: "unclosed scope",
			source: "<template>",
			limits: {},
			code: "unsupported",
		},
		{
			name: "raw close",
			source: "<template><script>x</script extra=x>",
			limits: {},
			code: "unsupported",
		},
		{
			name: "heading close",
			source: "<h1></table>",
			limits: {},
			code: "unsupported",
		},
		{
			name: "native operations",
			source: "<template></head>",
			limits: { maxOperations: 1 },
			code: "resource-limit",
		},
		{
			name: "native work",
			source: "<template></head>",
			limits: { maxWorkUnits: 1 },
			code: "resource-limit",
		},
		{
			name: "native issues",
			source: "<template></head duplicate duplicate>",
			limits: { maxIssues: 0 },
			code: "resource-limit",
		},
		{
			name: "invalid option",
			source: "",
			limits: { tableScopePolicy: "wrong-policy" },
			code: "invalid-input",
		},
	] as const)("does not brand the earlier $name rejection", async (fixture) => {
		const error = await captureFailure(() =>
			scan(fixture.source, fixture.limits),
		);
		expectCode(error, fixture.code);
		expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
		expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
	});

	it.each(["aborted", "timeout"] as const)(
		"leaves actual native %s failures unbranded",
		async (code) => {
			const controller = controllerFor();
			if (code === "aborted") controller.abort(new Error(privateMarker));
			else {
				let now = 1_000;
				vi.spyOn(performance, "now").mockImplementation(() => {
					now += 10;
					return now;
				});
			}
			const error = await captureFailure(() =>
				discoverResearchSourceHeadings(
					ownedSource("<template></head>"),
					{ method, tableScopePolicy: "optional-end-tags-v1", timeoutMs: 1 },
					controller.signal,
				),
			);
			expectCode(error, code);
			expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
			expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
		},
	);

	it("ignores forged, copied, wrapped, foreign and revoked values without traps", async () => {
		const { error, context } = await expectContextFailure("<template></head>", [
			"template",
		]);
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const traps = {
			get: trap,
			getPrototypeOf: trap,
			getOwnPropertyDescriptor: trap,
			ownKeys: trap,
			has: trap,
			apply: trap,
		};
		const accessor = {};
		for (const name of [
			"code",
			"message",
			"stack",
			"kind",
			"tableScopePolicy",
			"order",
			"scopes",
			"diagnostic",
		])
			Object.defineProperty(accessor, name, { get: trap });
		Object.defineProperty(accessor, Symbol.toPrimitive, { get: trap });
		const callable = vi.fn(() => error);
		const revokedObject = Proxy.revocable(error as object, traps);
		const revokedFunction = Proxy.revocable(callable, traps);
		revokedObject.revoke();
		revokedFunction.revoke();
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
			callable,
			Object.assign(() => undefined, context),
			new Error("Unsupported native source-heading structure"),
			new AgentBrowserError(
				"unsupported",
				"Unsupported native source-heading structure",
			),
			new AgentBrowserError("network-error", privateMarker),
			new Error(privateMarker, { cause: error }),
			runInNewContext(
				"new Error('Unsupported native source-heading structure')",
			),
			{ ...(error as object) },
			Object.create(error as object),
			Object.create(
				Object.getPrototypeOf(error),
				Object.getOwnPropertyDescriptors(error),
			),
			context,
			{ ...context },
			context.scopes,
			sourceHeadingScopeDiagnostic(error),
			sourceHeadingStructureDiagnostic(error),
			{ code: "unsupported", diagnostic: context },
			accessor,
			Object.create(accessor),
			new Proxy(error as object, {}),
			new Proxy(error as object, traps),
			new Proxy(callable, traps),
			revokedObject.proxy,
			revokedFunction.proxy,
		])
			expect(sourceHeadingScopeContextDiagnostic(value)).toBeUndefined();
		expect(trap).not.toHaveBeenCalled();
		expect(callable).not.toHaveBeenCalled();
		expect(sourceHeadingScopeContextDiagnostic(error)).toBe(context);
	});

	it.each(policies)(
		"does not add diagnostic fields to successful %s report keys",
		async (policy) => {
			const result = await scan(
				`<table><tr><td>${privateMarker}</td></tr></table><h1>After</h1>`,
				policyOptions(policy),
			);
			expect(Object.keys(result.report)).toEqual([
				"kind",
				"method",
				"semantics",
				"partial",
				"contentSuccess",
				...(policy === "strict" ? [] : ["tableScopePolicy"]),
				"source",
				"completion",
				"scannedTo",
				"entries",
				"limits",
				"counters",
			]);
			expect(Object.keys(result.report.counters)).toEqual([
				"tokens",
				"operations",
				"workUnits",
				"issueAttempts",
				"entityIssues",
				"omittedStarts",
				"suppressedStarts",
				"suppressedHeadingStarts",
				"rawStarts",
				"maxTrackedDepth",
				"yields",
			]);
			expect(result.report.entries.map((entry) => entry.title)).toEqual([
				"After",
			]);
			expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
			expect(result.jsonl).not.toContain("source-heading-scope-context");
			expect(result.jsonl).not.toContain(privateMarker);
			expect(sourceHeadingScopeContextDiagnostic(result)).toBeUndefined();
			expect(
				sourceHeadingScopeContextDiagnostic(result.report),
			).toBeUndefined();
		},
	);
});

describe("trusted heading-inline predicate diagnostics", () => {
	const knownTags = [
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
		"svg",
		"math",
		"script",
		"style",
		"template",
		"iframe",
		"object",
		"canvas",
		"noembed",
		"noframes",
		"frameset",
		"textarea",
		"audio",
		"video",
		"head",
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
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"xmp",
		"title",
		"html",
		"body",
		"abbr",
		"address",
		"article",
		"aside",
		"bdi",
		"bdo",
		"blockquote",
		"cite",
		"dd",
		"del",
		"div",
		"dl",
		"dt",
		"figcaption",
		"figure",
		"footer",
		"header",
		"hgroup",
		"ins",
		"kbd",
		"li",
		"main",
		"mark",
		"nav",
		"ol",
		"p",
		"pre",
		"q",
		"rp",
		"rt",
		"ruby",
		"s",
		"samp",
		"section",
		"time",
		"u",
		"ul",
		"var",
	] as const satisfies readonly SourceHeadingInlineObservedTag[];
	const admittedInlineNames = new Set<string>(inlineNames);
	const nonInlineTags = knownTags.filter(
		(name) => !admittedInlineNames.has(name) && name !== "br" && name !== "wbr",
	);
	const policies = (
		["strict", "optional-end-tags-v1", "optional-end-tags-v2"] as const
	).flatMap((tablePolicy) =>
		[false, true].map((selectedHead) => ({ tablePolicy, selectedHead })),
	);

	async function expectInlineFailure(
		source: string,
		expected: Omit<SourceHeadingInlineDiagnostic, "kind">,
		limits: Record<string, unknown> = {},
	) {
		const error = await captureFailure(() => scan(source, limits));
		expectCode(error, "unsupported");
		expect((error as Error).message).toBe(
			"Unsupported native source-heading structure",
		);
		const structure = sourceHeadingStructureDiagnostic(error);
		expect(structure).toEqual({
			kind: "source-heading-structure",
			reason: "heading-inline-structure",
			position: source.length,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(Reflect.ownKeys(structure ?? {})).toEqual([
			"kind",
			"reason",
			"position",
			"positionSemantics",
		]);
		const diagnostic = sourceHeadingInlineDiagnostic(error);
		expect(diagnostic).toEqual({
			kind: "source-heading-inline-start",
			...expected,
		});
		expectDeepFrozen(diagnostic);
		expect(sourceHeadingInlineDiagnostic(error)).toBe(diagnostic);
		expect(sourceHeadingStructureDiagnostic(error)).toBe(structure);
		expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
		expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		return { error, diagnostic };
	}

	it("declares exactly the closed 99-tag vocabulary plus other", () => {
		const completeUnion: Exclude<
			SourceHeadingInlineObservedTag,
			(typeof knownTags)[number] | "other"
		> extends never
			? true
			: false = true;
		expect(completeUnion).toBe(true);
		expect(knownTags).toHaveLength(99);
		expect(new Set(knownTags).size).toBe(99);
		expect(
			new Set<SourceHeadingInlineObservedTag>([...knownTags, "other"]).size,
		).toBe(100);
		expect(Math.max(...knownTags.map((name) => name.length))).toBe(10);
		expect(knownTags.filter((name) => name.length === 10)).toEqual([
			"blockquote",
			"figcaption",
		]);
		expect(nonInlineTags).toHaveLength(87);
	});

	it.each(
		nonInlineTags.flatMap((name) =>
			[false, true].map((selfClosing) => ({ name, selfClosing })),
		),
	)(
		"labels non-inline $name with selfClosing=$selfClosing without accepting it",
		async ({ name, selfClosing }) => {
			await expectInlineFailure(`<h3><${name}${selfClosing ? "/" : ""}>`, {
				condition: "non-inline-start",
				headingLevel: 3,
				observedTag: name,
				inlineDepth: 0,
			});
		},
	);

	it.each(inlineNames)(
		"labels self-closing inline %s without changing grammar",
		async (name) => {
			await expectInlineFailure(`<h4><${name}/>`, {
				condition: "self-closing-inline",
				headingLevel: 4,
				observedTag: name,
				inlineDepth: 0,
			});
		},
	);

	it.each([1, 2, 3, 4, 5, 6] as const)(
		"uses active heading level %i, not the rejected h2 level",
		async (headingLevel) => {
			await expectInlineFailure(`<h${headingLevel}><h2>`, {
				condition: "non-inline-start",
				headingLevel,
				observedTag: "h2",
				inlineDepth: 0,
			});
		},
	);

	it.each([
		"z",
		"abcdefghij",
		"abcdefghijk",
		"form",
		"summary",
		"button",
		`x-${privateMarker.toLowerCase()}-${"x".repeat(1024)}`,
	])("maps unknown diagnostic name %s to other", async (name) => {
		const { error, diagnostic } = await expectInlineFailure(`<h1><${name}>`, {
			condition: "non-inline-start",
			headingLevel: 1,
			observedTag: "other",
			inlineDepth: 0,
		});
		expect(JSON.stringify(diagnostic)).not.toContain(name);
		expect((error as Error).message).not.toContain(name);
	});

	it("never includes source tag, title, attribute or URL text in the record or error", async () => {
		const tag = `x-${privateMarker.toLowerCase()}`;
		const url = `https://example.com/${privateMarker}`;
		const source = `<h2 data-secret="${privateMarker}">${privateMarker} 😀<${tag} href="${url}">`;
		const error = await captureFailure(() =>
			discoverResearchSourceHeadings(
				{ ...ownedSource(source), finalUrl: url },
				{ method },
			),
		);
		expectCode(error, "unsupported");
		const diagnostic = sourceHeadingInlineDiagnostic(error);
		expect(diagnostic).toEqual({
			kind: "source-heading-inline-start",
			condition: "non-inline-start",
			headingLevel: 2,
			observedTag: "other",
			inlineDepth: 0,
		});
		expect(sourceHeadingStructureDiagnostic(error)?.position).toBe(
			source.length,
		);
		for (const value of [
			JSON.stringify(diagnostic),
			JSON.stringify(error),
			(error as Error).message,
			(error as Error).stack ?? "",
		]) {
			for (const secret of [
				privateMarker,
				privateMarker.toLowerCase(),
				tag,
				url,
			])
				expect(value).not.toContain(secret);
		}
	});

	it.each([0, 2, 127])(
		"records pre-push inline depth %i, excluding the heading",
		async (inlineDepth) => {
			const prefix = `<h1>${"<span>".repeat(inlineDepth)}`;
			for (const fixture of [
				{ tag: "<img>", observedTag: "img", condition: "non-inline-start" },
				{
					tag: "<span/>",
					observedTag: "span",
					condition: "self-closing-inline",
				},
			] as const) {
				await expectInlineFailure(
					prefix + fixture.tag,
					{
						condition: fixture.condition,
						headingLevel: 1,
						observedTag: fixture.observedTag,
						inlineDepth,
					},
					{ maxTrackedDepth: inlineDepth + 1 },
				);
			}
		},
	);

	it.each([
		{
			name: "img",
			selfClosing: false,
			reads: 0,
			condition: "non-inline-start",
		},
		{ name: "img", selfClosing: true, reads: 0, condition: "non-inline-start" },
		{ name: "span", selfClosing: false, reads: 1, condition: null },
		{
			name: "span",
			selfClosing: true,
			reads: 1,
			condition: "self-closing-inline",
		},
		{ name: "br", selfClosing: false, reads: 0, condition: null },
		{ name: "br", selfClosing: true, reads: 0, condition: null },
		{ name: "wbr", selfClosing: false, reads: 0, condition: null },
		{ name: "wbr", selfClosing: true, reads: 0, condition: null },
	] as const)(
		"reads selfClosing $reads times for actual $name/$selfClosing",
		async (fixture) => {
			const prefix = `<h1>A<${fixture.name}${fixture.selfClosing ? "/" : ""}>`;
			const source = fixture.condition
				? prefix
				: `${prefix}B${fixture.name === "span" ? "</span>" : ""}</h1>`;
			const reads = vi.fn(() => fixture.selfClosing);
			const next = HtmlTokenCursor.prototype.next;
			const cursors = new Set<HtmlTokenCursor>();
			let instrumented = 0;
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				cursors.add(this);
				const token = next.call(this);
				if (token?.kind === "start" && token.name === fixture.name) {
					expect(token.selfClosing).toBe(fixture.selfClosing);
					instrumented++;
					Object.defineProperty(token, "selfClosing", {
						get: reads,
						enumerable: true,
						configurable: true,
					});
				}
				return token;
			});
			if (fixture.condition) {
				await expectInlineFailure(source, {
					condition: fixture.condition,
					headingLevel: 1,
					observedTag: fixture.name,
					inlineDepth: 0,
				});
			} else {
				const result = await scan(source);
				expect(result.report.entries.map((entry) => entry.title)).toEqual([
					fixture.name === "br" ? "A B" : "AB",
				]);
				expect(sourceHeadingInlineDiagnostic(result)).toBeUndefined();
			}
			expect(instrumented).toBe(1);
			expect(reads).toHaveBeenCalledTimes(fixture.reads);
			expect(cursors.size).toBe(1);
			for (const cursor of cursors) {
				expect(cursor.closed).toBe(true);
				expect(cursor.position).toBe(source.length);
			}
		},
	);

	it.each([
		["<h1><img duplicate duplicate>", "tokenizer-issue"],
		["<h1><plaintext>", "ambiguous-text-mode"],
		["<h1><noscript>", "ambiguous-text-mode"],
		["<h1><span></h1>", "heading-close-structure"],
		["<script/>", "raw-self-closing"],
		["<script>x</script extra=x>", "raw-close-structure"],
		["<template></head>", "scope-close-structure"],
		["<h1>", "unclosed-context"],
		["<h1/>", "heading-start-structure"],
	] as const)(
		"does not brand the earlier rejection of %s",
		async (source, reason) => {
			const error = await captureFailure(() => scan(source));
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)?.reason).toBe(reason);
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([
		{
			source: "<h1><span>",
			limits: { maxTrackedDepth: 1 },
			diagnostic: {
				kind: "source.headings-depth",
				unit: "levels",
				limit: 1,
				observed: 2,
			},
		},
		{
			source: "<h1><img>",
			limits: { maxHeadingCodeUnits: 8 },
			diagnostic: {
				kind: "source.heading-extent",
				unit: "code-units",
				limit: 8,
				observed: 9,
			},
		},
		{
			source: "<h1><img>",
			limits: { maxOperations: 1 },
			diagnostic: {
				kind: "html.cursor-operations",
				unit: "operations",
				limit: 1,
				observed: 2,
			},
		},
		{
			source: "<h1><img>",
			limits: { maxWindowCodeUnits: 4 },
			diagnostic: {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 4,
				observed: 5,
			},
		},
		{
			source: "<h1><img duplicate duplicate>",
			limits: { maxIssues: 0 },
			diagnostic: {
				kind: "html.issues",
				unit: "issues",
				limit: 0,
				observed: 1,
			},
		},
	] as const)(
		"keeps earlier $diagnostic.kind failure unbranded",
		async ({ source, limits, diagnostic }) => {
			const error = await captureFailure(() => scan(source, limits));
			expectLimit(error, diagnostic);
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([
		{ tag: "<img>", observedTag: "img", condition: "non-inline-start" },
		{ tag: "<span/>", observedTag: "span", condition: "self-closing-inline" },
	] as const)(
		"adds no scanner work or operation for $condition bookkeeping",
		async (fixture) => {
			const source = `<h1>${fixture.tag}`;
			const native = new HtmlTokenCursor(source, () => {
				throw new Error("Unexpected synthetic tokenizer issue");
			});
			try {
				expect(native.next()).toBeDefined();
				expect(native.next()).toBeDefined();
				expect(native.position).toBe(source.length);
				const workLimit = native.workUnits + 2;
				const options = {
					maxWorkUnits: workLimit,
					maxOperations: native.operations,
				};
				await expectInlineFailure(
					source,
					{
						condition: fixture.condition,
						headingLevel: 1,
						observedTag: fixture.observedTag,
						inlineDepth: 0,
					},
					options,
				);
				const error = await captureFailure(() =>
					scan(source, { ...options, maxWorkUnits: workLimit - 1 }),
				);
				expectLimit(error, {
					kind: "source.headings-work",
					unit: "code-units",
					limit: workLimit - 1,
					observed: workLimit,
				});
				expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
			} finally {
				native.close();
			}
		},
	);

	it.each(["aborted", "timeout"] as const)(
		"leaves a real post-read yielded %s unbranded",
		async (code) => {
			let now = 1_000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = controllerFor();
			const source = "<h1><img>";
			const next = HtmlTokenCursor.prototype.next;
			const cursors = new Set<HtmlTokenCursor>();
			let scheduled = false;
			let dispatched = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				cursors.add(this);
				const token = next.call(this);
				if (token?.kind === "start" && token.name === "img") {
					scheduled = true;
					timer = setTimeout(() => {
						dispatched = true;
						now = 1_010;
						if (code === "aborted") controller.abort(new Error(privateMarker));
					}, 0);
				}
				return token;
			});
			try {
				const error = await captureFailure(() =>
					discoverResearchSourceHeadings(
						ownedSource(source),
						{ method, timeoutMs: 10, yieldEveryOperations: 2 },
						controller.signal,
					),
				);
				expect(scheduled).toBe(true);
				expect(dispatched).toBe(true);
				expectCode(error, code);
				expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
				expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
				expect((error as Error).message).not.toContain(privateMarker);
				expect(cursors.size).toBe(1);
				for (const cursor of cursors) {
					expect(cursor.closed).toBe(true);
					expect(cursor.position).toBe(source.length);
				}
			} finally {
				clearTimeout(timer);
			}
		},
	);

	it("owns one frozen five-field scalar snapshot without changing error descriptors", async () => {
		const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
		const source = "<h1><span><em><img>";
		const expected = {
			condition: "non-inline-start",
			headingLevel: 1,
			observedTag: "img",
			inlineDepth: 2,
		} as const;
		const { error, diagnostic } = await expectInlineFailure(source, expected);
		expect(close).toHaveBeenCalledTimes(1);
		const cursor = close.mock.contexts[0] as HtmlTokenCursor;
		expect(cursor.closed).toBe(true);
		expect(cursor.position).toBe(source.length);
		expect(Reflect.ownKeys(diagnostic ?? {})).toEqual([
			"kind",
			"condition",
			"headingLevel",
			"observedTag",
			"inlineDepth",
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
			expect(Object.hasOwn(descriptor, "set")).toBe(false);
		}
		expect(Reflect.set(diagnostic ?? {}, "observedTag", "other")).toBe(false);
		expect(Reflect.deleteProperty(diagnostic ?? {}, "inlineDepth")).toBe(false);
		const reference = new AgentBrowserError(
			"unsupported",
			"Unsupported native source-heading structure",
		);
		expect(Reflect.ownKeys(error as object)).toEqual(
			Reflect.ownKeys(reference),
		);
		for (const name of Reflect.ownKeys(reference)) {
			const actual = Object.getOwnPropertyDescriptor(error, name);
			const original = Object.getOwnPropertyDescriptor(reference, name);
			if (name === "stack") {
				expect(actual?.configurable).toBe(original?.configurable);
				expect(actual?.enumerable).toBe(original?.enumerable);
				expect(typeof (error as Error).stack).toBe("string");
			} else expect(actual).toEqual(original);
		}
		expect(Object.hasOwn(error as object, "cause")).toBe(false);
		await scan("<h1>After</h1>");
		const repeated = await expectInlineFailure(source, expected);
		expect(repeated.error).not.toBe(error);
		expect(repeated.diagnostic).not.toBe(diagnostic);
		expect(repeated.diagnostic).toEqual(diagnostic);
		expect(sourceHeadingInlineDiagnostic(error)).toBe(diagnostic);
	});

	it("rejects forged, foreign, accessor, callable and revoked values without inspection", async () => {
		const { error, diagnostic } = await expectInlineFailure("<h1><img>", {
			condition: "non-inline-start",
			headingLevel: 1,
			observedTag: "img",
			inlineDepth: 0,
		});
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const traps = {
			get: trap,
			getPrototypeOf: trap,
			getOwnPropertyDescriptor: trap,
			ownKeys: trap,
			has: trap,
			apply: trap,
		};
		const accessor = {};
		for (const name of [
			"kind",
			"condition",
			"headingLevel",
			"observedTag",
			"inlineDepth",
			"code",
			"message",
			"stack",
			"cause",
			"toString",
			"valueOf",
		])
			Object.defineProperty(accessor, name, { get: trap });
		Object.defineProperty(accessor, Symbol.toPrimitive, { get: trap });
		const callable = vi.fn(() => error);
		const revokedObject = Proxy.revocable(error as object, traps);
		const revokedFunction = Proxy.revocable(callable, traps);
		revokedObject.revoke();
		revokedFunction.revoke();
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
			callable,
			Object.assign(() => undefined, diagnostic),
			new Error((error as Error).message),
			new AgentBrowserError("unsupported", (error as Error).message),
			new Error((error as Error).message, { cause: error }),
			runInNewContext(
				"new Error('Unsupported native source-heading structure')",
			),
			{ ...(error as object) },
			Object.create(error as object),
			Object.create(
				Object.getPrototypeOf(error),
				Object.getOwnPropertyDescriptors(error),
			),
			diagnostic,
			{ ...diagnostic },
			sourceHeadingStructureDiagnostic(error),
			{ code: "unsupported", diagnostic },
			accessor,
			Object.create(accessor),
			new Proxy(error as object, {}),
			new Proxy(error as object, traps),
			new Proxy(callable, traps),
			revokedObject.proxy,
			revokedFunction.proxy,
		])
			expect(sourceHeadingInlineDiagnostic(value)).toBeUndefined();
		expect(trap).not.toHaveBeenCalled();
		expect(callable).not.toHaveBeenCalled();
		expect(sourceHeadingInlineDiagnostic(error)).toBe(diagnostic);
	});

	it.each(policies)(
		"composes without changing success under $tablePolicy / selectedHead=$selectedHead",
		async ({ tablePolicy, selectedHead }) => {
			const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
			const options = {
				...(tablePolicy === "strict" ? {} : { tableScopePolicy: tablePolicy }),
				...(selectedHead
					? { headScopePolicy: "explicit-body-boundary-v1" }
					: {}),
				yieldEveryOperations: 1,
			};
			const hidden = `<h2>${privateMarker}</h2>`;
			const table =
				tablePolicy === "strict"
					? `<table><tr><td>${hidden}</td></tr></table>`
					: tablePolicy === "optional-end-tags-v1"
						? `<table><tr><td>${hidden}<td>${hidden}</table>`
						: `<table><thead><tr><th>${hidden}<tbody><tr><td>${hidden}</table>`;
			const prefix =
				(selectedHead ? "<head><body>" : "<head></head><body>") + table;
			const heading = `<h1>${inlineNames.map((name) => `<${name}>A</${name}>`).join("")}<br>B<wbr>C</h1>`;
			const source = prefix + heading;
			const baseline = await scan(source, options);
			await expectInlineFailure(
				`${prefix}<h1><span><img/>`,
				{
					condition: "non-inline-start",
					headingLevel: 1,
					observedTag: "img",
					inlineDepth: 1,
				},
				options,
			);
			const result = await scan(source, options);
			expect(result).toEqual(baseline);
			expect(close).toHaveBeenCalledTimes(3);
			for (const cursor of close.mock.contexts)
				expect((cursor as HtmlTokenCursor).closed).toBe(true);
			expect(result.report.entries).toEqual([
				{
					ordinal: 1,
					level: 1,
					title: `${"A".repeat(inlineNames.length)} BC`,
					titleTruncated: false,
					anchor: {
						kind: "source-utf16-range-v1",
						startTag: { start: prefix.length, end: prefix.length + 4 },
						endTag: { start: source.length - 5, end: source.length },
					},
				},
			]);
			expect(Object.keys(result.report)).toEqual([
				"kind",
				"method",
				"semantics",
				"partial",
				"contentSuccess",
				...(tablePolicy === "strict" ? [] : ["tableScopePolicy"]),
				...(selectedHead ? ["headScopePolicy"] : []),
				"source",
				"completion",
				"scannedTo",
				"entries",
				"limits",
				"counters",
			]);
			expect(result.report.counters).toEqual(baseline.report.counters);
			expect(result.report.counters.yields).toBeGreaterThan(0);
			expect(result.report.counters.suppressedHeadingStarts).toBe(
				tablePolicy === "strict" ? 1 : 2,
			);
			expect(result.report.limits).toEqual({
				...canonicalLimits,
				yieldEveryOperations: 1,
			});
			expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
			expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
			expect(result.jsonl).not.toContain(privateMarker);
			for (const value of [
				result,
				result.report,
				result.report.entries[0],
				result.report.counters,
			])
				expect(sourceHeadingInlineDiagnostic(value)).toBeUndefined();
			expectDeepFrozen(result);
		},
	);

	it("keeps fixed default counters/schema and admits no diagnostic option", async () => {
		const result = await scan("<h1>A</h1>");
		expect(result.report.counters).toEqual({
			tokens: 3,
			operations: 4,
			workUnits: 24,
			issueAttempts: 0,
			entityIssues: {},
			omittedStarts: {},
			suppressedStarts: {},
			suppressedHeadingStarts: 0,
			rawStarts: {},
			maxTrackedDepth: 1,
			yields: 0,
		});
		expect(Object.keys(result.report)).toEqual([
			"kind",
			"method",
			"semantics",
			"partial",
			"contentSuccess",
			"source",
			"completion",
			"scannedTo",
			"entries",
			"limits",
			"counters",
		]);
		expect(result.report.limits).toEqual(canonicalLimits);
		expect(sourceHeadingInlineDiagnostic(result)).toBeUndefined();
		const error = await captureFailure(() =>
			scan("<h1><img>", { inlineDiagnosticPolicy: "enabled" }),
		);
		expectCode(error, "invalid-input");
		expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
	});
});

describe("explicit balanced source-element heading policy", () => {
	const headingInlinePolicy = "balanced-source-elements-v1";
	const limitations = [
		"source-balance-only",
		"attributes-ignored",
		"not-dom-or-visibility",
	] as const;
	const longName = "x".repeat(64);
	const excludedNames = [
		...new Set([
			...rawNames,
			...suppressedNames,
			...omittedFrames,
			...voidNames,
			"html",
			"body",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
		] as const),
	].filter((name) => name !== "br" && name !== "wbr");
	const combinations = (
		["strict", "optional-end-tags-v1", "optional-end-tags-v2"] as const
	).flatMap((tablePolicy) =>
		[false, true].flatMap((selectedHead) =>
			[false, true].map((selectedInline) => ({
				tablePolicy,
				selectedHead,
				selectedInline,
			})),
		),
	);

	function selectedScan(source: string, options: Record<string, unknown> = {}) {
		return scan(source, { headingInlinePolicy, ...options });
	}

	async function expectCandidate(
		source: string,
		title: string,
		options: Record<string, unknown> = {},
		level = 1,
		titleTruncated = false,
	) {
		const result = await selectedScan(source, options);
		expect(result.report.entries).toEqual([
			{
				ordinal: 1,
				level,
				title,
				titleTruncated,
				anchor: {
					kind: "source-utf16-range-v1",
					startTag: { start: 0, end: source.indexOf(">") + 1 },
					endTag: { start: source.length - 5, end: source.length },
				},
			},
		]);
		expect(result.report.headingInlinePolicy).toBe(headingInlinePolicy);
		expect(result.report.headingInlineLimitations).toEqual(limitations);
		expect(result.report.completion).toBe("eof");
		expect(result.report.scannedTo).toBe(source.length);
		expect(result.report.source.bytes).toEqual({
			length: encoder.encode(source).byteLength,
			sha256: sha256(encoder.encode(source)),
		});
		expect(result.report.source.text.codeUnits).toBe(source.length);
		expect(result.report.source.text.sha256).toBe(sha256(source));
		expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(sourceHeadingInlineDiagnostic(result)).toBeUndefined();
		expectDeepFrozen(result);
		return result;
	}

	async function expectInlineFailure(
		source: string,
		expected: Pick<SourceHeadingInlineDiagnostic, "observedTag"> &
			Partial<Omit<SourceHeadingInlineDiagnostic, "kind" | "observedTag">>,
		options: Record<string, unknown> = {},
		position = source.length,
	) {
		const error = await captureFailure(() => selectedScan(source, options));
		expectCode(error, "unsupported");
		expect((error as Error).message).toBe(
			"Unsupported native source-heading structure",
		);
		expect(sourceHeadingStructureDiagnostic(error)).toEqual({
			kind: "source-heading-structure",
			reason: "heading-inline-structure",
			position,
			positionSemantics: "last-committed-source-utf16",
		});
		const diagnostic = sourceHeadingInlineDiagnostic(error);
		expect(diagnostic).toEqual({
			kind: "source-heading-inline-start",
			condition: "non-inline-start",
			headingLevel: 1,
			inlineDepth: 0,
			...expected,
		});
		expectDeepFrozen(diagnostic);
		expect(sourceHeadingInlineDiagnostic(error)).toBe(diagnostic);
		expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
		expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		return { error, diagnostic };
	}

	function nativePrefixWork(source: string, tokenCount: number) {
		const native = new HtmlTokenCursor(source, () => {
			throw new Error("Unexpected synthetic tokenizer issue");
		});
		let titleUnits = 0;
		try {
			for (let index = 0; index < tokenCount; index++) {
				const token = native.next();
				expect(token).toBeDefined();
				if (token?.kind === "text") titleUnits += token.data.length;
			}
			expect(native.position).toBe(source.length);
			return {
				workUnits: native.workUnits + tokenCount + titleUnits,
				operations: native.operations,
			};
		} finally {
			native.close();
		}
	}

	it.each([
		undefined,
		null,
		true,
		false,
		0,
		"strict",
		"balanced-source-elements-v3",
		{},
	])(
		"rejects nonliteral inline selection %j before source access",
		async (value) => {
			const trap = vi.fn((): never => {
				throw new Error(privateMarker);
			});
			const input = new Proxy(
				{},
				{
					get: trap,
					ownKeys: trap,
					getPrototypeOf: trap,
					getOwnPropertyDescriptor: trap,
				},
			);
			const error = await captureFailure(() =>
				discoverResearchSourceHeadings(input, {
					method,
					headingInlinePolicy: value,
				}),
			);
			expectCode(error, "invalid-input");
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
			expect(trap).not.toHaveBeenCalled();
		},
	);

	it.each(["accessor", "proxy", "inherited"] as const)(
		"does not invoke hostile %s admission",
		async (kind) => {
			const trap = vi.fn((): never => {
				throw new Error(privateMarker);
			});
			const traps = {
				get: trap,
				ownKeys: trap,
				getPrototypeOf: trap,
				getOwnPropertyDescriptor: trap,
			};
			const options =
				kind === "accessor"
					? Object.defineProperty({ method }, "headingInlinePolicy", {
							get: trap,
						})
					: kind === "proxy"
						? new Proxy({ method, headingInlinePolicy }, traps)
						: Object.assign(Object.create({ headingInlinePolicy }), { method });
			const error = await captureFailure(() =>
				discoverResearchSourceHeadings(new Proxy({}, traps), options),
			);
			expectCode(error, "invalid-input");
			expect(trap).not.toHaveBeenCalled();
		},
	);

	it("admits an exact own-data selection on null-prototype options", async () => {
		const options = Object.assign(Object.create(null), {
			method,
			headingInlinePolicy,
		});
		const result = await discoverResearchSourceHeadings(
			ownedSource("<h1><x>A</x></h1>"),
			options,
		);
		expect(result.report.entries[0].title).toBe("A");
		expect(result.report.headingInlinePolicy).toBe(headingInlinePolicy);
		expect(result.report.headingInlineLimitations).toEqual(limitations);
		expectDeepFrozen(result);
	});

	it("snapshots selection before yields without rereading a replaced accessor", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const controller = controllerFor();
		const options = { method, headingInlinePolicy, yieldEveryOperations: 1 };
		const changed = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const pending = observe(
			discoverResearchSourceHeadings(
				ownedSource("<h1><x-local>A</x-local></h1>"),
				options,
				controller.signal,
			),
		);
		try {
			await microtasks();
			expect(pending.settled).toBe(false);
			expect(vi.getTimerCount()).toBeGreaterThan(0);
			Object.defineProperty(options, "headingInlinePolicy", {
				get: changed,
				enumerable: true,
				configurable: true,
			});
			await vi.runAllTimersAsync();
			const outcome = await pending.outcome;
			expect(outcome.error).toBeUndefined();
			expect(outcome.value?.report.entries[0].title).toBe("A");
			expect(outcome.value?.report.headingInlinePolicy).toBe(
				headingInlinePolicy,
			);
			expect(outcome.value?.report.headingInlineLimitations).toEqual(
				limitations,
			);
			expect(changed).not.toHaveBeenCalled();
		} finally {
			controller.abort();
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it("discloses exact frozen limitations only when selected and preserves default counters", async () => {
		const source = "<h1>A</h1>";
		const strict = await scan(source);
		expect(strict.report.counters).toEqual({
			tokens: 3,
			operations: 4,
			workUnits: 24,
			issueAttempts: 0,
			entityIssues: {},
			omittedStarts: {},
			suppressedStarts: {},
			suppressedHeadingStarts: 0,
			rawStarts: {},
			maxTrackedDepth: 1,
			yields: 0,
		});
		expect(strict.report.limits).toEqual(canonicalLimits);
		for (const key of ["headingInlinePolicy", "headingInlineLimitations"]) {
			expect(Object.hasOwn(strict.report, key)).toBe(false);
			expect(Object.hasOwn(JSON.parse(strict.jsonl), key)).toBe(false);
		}
		const selected = await expectCandidate(source, "A");
		expect(selected.report.counters.workUnits).toBe(30);
		expect(Object.keys(selected.report).sort()).toEqual(
			[
				...Object.keys(strict.report),
				"headingInlinePolicy",
				"headingInlineLimitations",
			].sort(),
		);
		for (const key of ["headingInlinePolicy", "headingInlineLimitations"]) {
			expect(
				Object.getOwnPropertyDescriptor(selected.report, key),
			).toMatchObject({
				writable: false,
				configurable: false,
				enumerable: true,
			});
		}
		expect(
			Reflect.set(
				selected.report.headingInlineLimitations ?? {},
				"0",
				"changed",
			),
		).toBe(false);
		const {
			headingInlinePolicy: policy,
			headingInlineLimitations: disclosure,
			counters: selectedCounters,
			...selectedRest
		} = selected.report;
		const { counters: strictCounters, ...strictRest } = strict.report;
		expect(policy).toBe(headingInlinePolicy);
		expect(disclosure).toEqual(limitations);
		expect(selectedRest).toEqual(strictRest);
		expect(selectedCounters.operations).toBe(strictCounters.operations);
		expect(selectedCounters.tokens).toBe(strictCounters.tokens);
		expect(await scan(source)).toEqual(strict);
		const error = await captureFailure(() =>
			selectedScan(source, { headingInlineLimitations: limitations }),
		);
		expectCode(error, "invalid-input");
	});

	it.each([1, 2, 3, 4, 5, 6] as const)(
		"balances new and old elements at heading level %i",
		async (level) => {
			const source = `<h${level}><div>A<x-local>B</x-local><span>C</span></div>D</h${level}>`;
			await expectCandidate(source, "ABCD", {}, level);
			const error = await captureFailure(() => scan(source));
			expectCode(error, "unsupported");
			expect(sourceHeadingInlineDiagnostic(error)).toEqual({
				kind: "source-heading-inline-start",
				condition: "non-inline-start",
				headingLevel: level,
				observedTag: "div",
				inlineDepth: 0,
			});
		},
	);

	it.each([
		"div",
		"p",
		"dfn",
		"form",
		"summary",
		"button",
		"label",
		"custom-element",
		"ns:local",
		"x_y",
		"z",
		longName,
	])(
		"admits balanced lexical name %s without treating it as DOM phrasing",
		async (name) => {
			await expectCandidate(`<h1>A<${name}>B</${name}>C</h1>`, "ABC");
		},
	);

	it("uses native normalized case for balanced names", async () => {
		await expectCandidate(
			"<H2><DiV>A<X-LOCAL>B</x-local></DIV></H2>",
			"AB",
			{},
			2,
		);
	});

	it("keeps entity/comment/br semantics and ignores hidden/style/ARIA attributes", async () => {
		const source = `<h1>A<div hidden style="display:none" aria-label="${privateMarker}" data-look="<img>">B&amp;C<!--<script>${privateMarker}-->&lt;img&gt;</div><br/>D<wbr/>E</h1>`;
		const result = await expectCandidate(source, "AB&C<img> DE");
		expect(result.jsonl).not.toContain(privateMarker);
	});

	it.each(excludedNames)(
		"still rejects special %s starts, even with a balancing tail",
		async (name) => {
			expect(excludedNames).toHaveLength(49);
			const prefix = `<h1><${name}>`;
			for (const tail of ["", `${privateMarker}</${name}></h1>`])
				await expectInlineFailure(
					prefix + tail,
					{ observedTag: name },
					{},
					prefix.length,
				);
		},
	);

	it.each([
		{ name: "div", observedTag: "div" },
		{ name: "x-local", observedTag: "other" },
	] as const)(
		"keeps new slash $name rejection attributed to the base non-inline predicate",
		async ({ name, observedTag }) => {
			await expectInlineFailure(`<h1><${name}/>`, { observedTag });
		},
	);

	it.each(inlineNames)(
		"keeps original slash %s attributed to self-closing-inline",
		async (name) => {
			await expectInlineFailure(`<h1><${name}/>`, {
				observedTag: name,
				condition: "self-closing-inline",
			});
		},
	);

	it("refuses a 65-unit private name without leaking tag, attributes, title or URL", async () => {
		const name = `x-${privateMarker.toLowerCase()}`.padEnd(65, "x");
		expect(name.length).toBe(65);
		const prefix = `<h1>${privateMarker} 😀<x-local><div>`;
		const source = `${prefix}<${name} href="https://example.com/${privateMarker}">`;
		const { error, diagnostic } = await expectInlineFailure(source, {
			observedTag: "other",
			inlineDepth: 2,
		});
		for (const value of [
			JSON.stringify(diagnostic),
			JSON.stringify(error),
			(error as Error).message,
			(error as Error).stack ?? "",
		]) {
			expect(value).not.toContain(privateMarker);
			expect(value).not.toContain(name);
			expect(value).not.toContain("x-local");
		}
	});

	it.each([
		["<h1><div></h1>", "heading-close-structure"],
		["<h1><div><x></div>", "heading-close-structure"],
		["<h1><div></p>", "heading-close-structure"],
		["<h1><x></x extra=y>", "heading-close-structure"],
		["<h1><x></x/>", "heading-close-structure"],
		["<h1><x>", "unclosed-context"],
		["<h1><div></div>", "unclosed-context"],
		[`<h1><x></${"x".repeat(65)}>`, "heading-close-structure"],
	] as const)(
		"retains strict close/EOF rejection for %s",
		async (source, reason) => {
			const error = await captureFailure(() => selectedScan(source));
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason,
				position: source.length,
				positionSemantics: "last-committed-source-utf16",
			});
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
			expect(sourceHeadingScopeDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([false, true])(
		"continues validation after title clipping, malformed=%s",
		async (malformed) => {
			if (malformed) {
				const error = await captureFailure(() =>
					selectedScan("<h1>A<x-local>BC</wrong>", { maxTitleCodeUnits: 1 }),
				);
				expectCode(error, "unsupported");
				expect(sourceHeadingStructureDiagnostic(error)?.reason).toBe(
					"heading-close-structure",
				);
				expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
			} else
				await expectCandidate(
					"<h1>A<x-local>BC</x-local>D</h1>",
					"A",
					{ maxTitleCodeUnits: 1 },
					1,
					true,
				);
		},
	);

	it.each([0, 2, 127])(
		"retains actual admitted depth %i and rejects the next frame",
		async (depth) => {
			const prefix = `<h1>${"<x>".repeat(depth)}`;
			const options = { maxTrackedDepth: depth + 1 };
			await expectCandidate(
				`${prefix}A${"</x>".repeat(depth)}</h1>`,
				"A",
				options,
			);
			await expectInlineFailure(
				`${prefix}<img>`,
				{ observedTag: "img", inlineDepth: depth },
				options,
			);
			const error = await captureFailure(() =>
				selectedScan(`${prefix}<x>`, options),
			);
			expectLimit(error, {
				kind: "source.headings-depth",
				unit: "levels",
				limit: depth + 1,
				observed: depth + 2,
			});
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([
		{ name: "x", selectedUnits: 24 },
		{ name: "xy", selectedUnits: 37 },
		{ name: "div", selectedUnits: 40 },
		{ name: "x-local", selectedUnits: 72 },
		{ name: longName, selectedUnits: 528 },
		{ name: "span", selectedUnits: 19 },
	])(
		"pins exact conservative success units for $name",
		async ({ name, selectedUnits }) => {
			const source = `<h1><${name}>A</${name}></h1>`;
			const native = nativePrefixWork(source, 5);
			const workLimit = native.workUnits + selectedUnits;
			const result = await expectCandidate(source, "A", {
				maxWorkUnits: workLimit,
			});
			expect(result.report.counters.workUnits).toBe(workLimit);
			expect(result.report.counters.operations).toBe(native.operations + 1);
			expect(result.report.counters.tokens).toBe(5);
			if (name === "span") {
				const strict = await scan(source);
				expect(
					result.report.counters.workUnits - strict.report.counters.workUnits,
				).toBe(19);
			}
			const error = await captureFailure(() =>
				selectedScan(source, { maxWorkUnits: workLimit - 1 }),
			);
			expectLimit(error, {
				kind: "source.headings-work",
				unit: "code-units",
				limit: workLimit - 1,
				observed: workLimit,
			});
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([
		{
			tag: `<${"x".repeat(65)}>`,
			units: 1,
			observedTag: "other",
			condition: "non-inline-start",
		},
		{
			tag: "<img/>",
			units: 23,
			observedTag: "img",
			condition: "non-inline-start",
		},
		{
			tag: "<div/>",
			units: 23,
			observedTag: "div",
			condition: "non-inline-start",
		},
		{
			tag: "<span/>",
			units: 0,
			observedTag: "span",
			condition: "self-closing-inline",
		},
	] as const)(
		"pins classification work before $condition for $tag",
		async (fixture) => {
			const source = `<h1>${fixture.tag}`;
			const workLimit = nativePrefixWork(source, 2).workUnits + fixture.units;
			await expectInlineFailure(
				source,
				{ observedTag: fixture.observedTag, condition: fixture.condition },
				{ maxWorkUnits: workLimit },
			);
			const error = await captureFailure(() =>
				selectedScan(source, { maxWorkUnits: workLimit - 1 }),
			);
			expectLimit(error, {
				kind: "source.headings-work",
				unit: "code-units",
				limit: workLimit - 1,
				observed: workLimit,
			});
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		},
	);

	it("charges the selected push before depth admission", async () => {
		const source = "<h1><x>";
		const beforePush = nativePrefixWork(source, 2).workUnits + 11;
		const error = await captureFailure(() =>
			selectedScan(source, { maxTrackedDepth: 1, maxWorkUnits: beforePush }),
		);
		expectLimit(error, {
			kind: "source.headings-work",
			unit: "code-units",
			limit: beforePush,
			observed: beforePush + 1,
		});
		const depthError = await captureFailure(() =>
			selectedScan(source, {
				maxTrackedDepth: 1,
				maxWorkUnits: beforePush + 1,
			}),
		);
		expectLimit(depthError, {
			kind: "source.headings-depth",
			unit: "levels",
			limit: 1,
			observed: 2,
		});
		expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		expect(sourceHeadingInlineDiagnostic(depthError)).toBeUndefined();
	});

	it.each([
		{ name: "x", unitsBeforePop: 17 },
		{ name: longName, unitsBeforePop: 521 },
	])(
		"charges the selected $name pop after admitted name comparisons",
		async ({ name, unitsBeforePop }) => {
			const source = `<h1><${name}></${name}>`;
			const beforePop = nativePrefixWork(source, 3).workUnits + unitsBeforePop;
			const error = await captureFailure(() =>
				selectedScan(source, { maxWorkUnits: beforePop }),
			);
			expectLimit(error, {
				kind: "source.headings-work",
				unit: "code-units",
				limit: beforePop,
				observed: beforePop + 1,
			});
			const exact = await captureFailure(() =>
				selectedScan(source, { maxWorkUnits: beforePop + 1 }),
			);
			expectCode(exact, "unsupported");
			expect(sourceHeadingStructureDiagnostic(exact)?.reason).toBe(
				"unclosed-context",
			);
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
			expect(sourceHeadingInlineDiagnostic(exact)).toBeUndefined();
		},
	);

	it.each([
		{ source: "<h1></wrong>", tokens: 2, units: 2 },
		{ source: "<h1><xy></zz>", tokens: 3, units: 30 },
		{ source: `<h1><${longName}></${"x".repeat(65)}>`, tokens: 3, units: 392 },
		{ source: "<h1><x></x extra=y>", tokens: 3, units: 17 },
		{ source: "<h1></h1 extra=y>", tokens: 2, units: 7 },
	])(
		"bounds selected closing-name comparisons for $source",
		async ({ source, tokens, units }) => {
			const workLimit = nativePrefixWork(source, tokens).workUnits + units;
			const exact = await captureFailure(() =>
				selectedScan(source, { maxWorkUnits: workLimit }),
			);
			expectCode(exact, "unsupported");
			expect(sourceHeadingStructureDiagnostic(exact)?.reason).toBe(
				"heading-close-structure",
			);
			expect(sourceHeadingInlineDiagnostic(exact)).toBeUndefined();
			const error = await captureFailure(() =>
				selectedScan(source, { maxWorkUnits: workLimit - 1 }),
			);
			expectLimit(error, {
				kind: "source.headings-work",
				unit: "code-units",
				limit: workLimit - 1,
				observed: workLimit,
			});
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([
		{
			source: "<h1><x>",
			options: { maxOperations: 1 },
			diagnostic: {
				kind: "html.cursor-operations",
				unit: "operations",
				limit: 1,
				observed: 2,
			},
		},
		{
			source: "<h1><x-local>",
			options: { maxWindowCodeUnits: 4 },
			diagnostic: {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 4,
				observed: 5,
			},
		},
		{
			source: "<h1><x duplicate duplicate>",
			options: { maxIssues: 0 },
			diagnostic: {
				kind: "html.issues",
				unit: "issues",
				limit: 0,
				observed: 1,
			},
		},
		{
			source: "<h1><x>",
			options: { maxHeadingCodeUnits: 6 },
			diagnostic: {
				kind: "source.heading-extent",
				unit: "code-units",
				limit: 6,
				observed: 7,
			},
		},
	] as const)(
		"retains earlier $diagnostic.kind admission and cursor cleanup",
		async ({ source, options, diagnostic }) => {
			const next = HtmlTokenCursor.prototype.next;
			const cursors = new Set<HtmlTokenCursor>();
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				cursors.add(this);
				return next.call(this);
			});
			const error = await captureFailure(() => selectedScan(source, options));
			expectLimit(error, diagnostic);
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
			expect(cursors.size).toBe(1);
			for (const cursor of cursors) expect(cursor.closed).toBe(true);
		},
	);

	it("counts both disclosures in the exact output cap and rejects one byte under", async () => {
		const source = "<h1><x>A</x></h1>";
		const baseline = await selectedScan(source);
		let cap = baseline.outputBytes;
		for (let attempt = 0; attempt < 4; attempt++) {
			cap = encoder.encode(
				`${JSON.stringify({ ...baseline.report, limits: { ...baseline.report.limits, maxOutputBytes: cap } })}\n`,
			).byteLength;
		}
		expect(String(cap - 1).length).toBe(String(cap).length);
		const exact = await expectCandidate(source, "A", { maxOutputBytes: cap });
		expect(exact.outputBytes).toBe(cap);
		const error = await captureFailure(() =>
			selectedScan(source, { maxOutputBytes: cap - 1 }),
		);
		expectLimit(error, {
			kind: "source.headings-output",
			unit: "bytes",
			limit: cap - 1,
			observed: cap,
		});
		expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
	});

	it.each(["aborted", "timeout"] as const)(
		"cooperates with real %s after additional-name admission",
		async (code) => {
			let now = 1_000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = controllerFor();
			const prefix = "<h1><x-local>";
			const source = `${prefix}${"<x>A</x>".repeat(24)}</x-local></h1>`;
			const next = HtmlTokenCursor.prototype.next;
			const cursors = new Set<HtmlTokenCursor>();
			let scheduled = false;
			let dispatched = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				cursors.add(this);
				if (!scheduled && this.position >= prefix.length) {
					scheduled = true;
					timer = setTimeout(() => {
						dispatched = true;
						now = 1_010;
						if (code === "aborted") controller.abort(new Error(privateMarker));
					}, 0);
				}
				return next.call(this);
			});
			try {
				const error = await captureFailure(() =>
					discoverResearchSourceHeadings(
						ownedSource(source),
						{
							method,
							headingInlinePolicy,
							timeoutMs: 10,
							yieldEveryOperations: 1,
						},
						controller.signal,
					),
				);
				expect(scheduled).toBe(true);
				expect(dispatched).toBe(true);
				expectCode(error, code);
				expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
				expect(sourceHeadingScopeContextDiagnostic(error)).toBeUndefined();
				expect(cursors.size).toBe(1);
				for (const cursor of cursors) expect(cursor.closed).toBe(true);
			} finally {
				clearTimeout(timer);
			}
		},
	);

	it.each([
		{ name: "img", selfClosing: true, reads: 0 },
		{ name: "script", selfClosing: false, reads: 0 },
		{ name: "x".repeat(65), selfClosing: false, reads: 0 },
		{ name: "div", selfClosing: true, reads: 1 },
		{ name: "div", selfClosing: false, reads: 1 },
	])(
		"reads selected selfClosing $reads times for $name/$selfClosing",
		async (fixture) => {
			const prefix = `<h1><${fixture.name}${fixture.selfClosing ? "/" : ""}>`;
			const source =
				fixture.name === "div" && !fixture.selfClosing
					? `${prefix}A</div></h1>`
					: prefix;
			const reads = vi.fn(() => fixture.selfClosing);
			const next = HtmlTokenCursor.prototype.next;
			let instrumented = 0;
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				const token = next.call(this);
				if (token?.kind === "start" && token.name === fixture.name) {
					expect(token.selfClosing).toBe(fixture.selfClosing);
					instrumented++;
					Object.defineProperty(token, "selfClosing", {
						get: reads,
						enumerable: true,
						configurable: true,
					});
				}
				return token;
			});
			if (source !== prefix) await expectCandidate(source, "A");
			else {
				const error = await captureFailure(() => selectedScan(source));
				expectCode(error, "unsupported");
				expect(sourceHeadingInlineDiagnostic(error)?.condition).toBe(
					"non-inline-start",
				);
			}
			expect(instrumented).toBe(1);
			expect(reads).toHaveBeenCalledTimes(fixture.reads);
		},
	);

	it("retains diagnostic identity and forgery resistance after additional frames", async () => {
		const { error, diagnostic } = await expectInlineFailure(
			"<h1><x-local><div><img>",
			{ observedTag: "img", inlineDepth: 2 },
		);
		expect(Reflect.ownKeys(diagnostic ?? {})).toEqual([
			"kind",
			"condition",
			"headingLevel",
			"observedTag",
			"inlineDepth",
		]);
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const proxy = new Proxy(error as object, {
			get: trap,
			ownKeys: trap,
			getPrototypeOf: trap,
		});
		const revoked = Proxy.revocable(error as object, {});
		revoked.revoke();
		for (const value of [
			diagnostic,
			{ ...diagnostic },
			{ ...(error as object) },
			Object.create(error as object),
			proxy,
			revoked.proxy,
		])
			expect(sourceHeadingInlineDiagnostic(value)).toBeUndefined();
		expect(trap).not.toHaveBeenCalled();
		await expectCandidate("<h1><x-local>A</x-local></h1>", "A");
		expect(sourceHeadingInlineDiagnostic(error)).toBe(diagnostic);
	});

	it.each(combinations)(
		"composes $tablePolicy/head=$selectedHead/inline=$selectedInline without promoting suppression",
		async ({ tablePolicy, selectedHead, selectedInline }) => {
			const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
			const options = {
				...(tablePolicy === "strict" ? {} : { tableScopePolicy: tablePolicy }),
				...(selectedHead
					? { headScopePolicy: "explicit-body-boundary-v1" }
					: {}),
				...(selectedInline ? { headingInlinePolicy } : {}),
				yieldEveryOperations: 1,
			};
			const hidden = `<h2>${privateMarker}</h2>`;
			const table =
				tablePolicy === "strict"
					? `<table><tr><td>${hidden}</td></tr></table>`
					: tablePolicy === "optional-end-tags-v1"
						? `<table><tr><td>${hidden}<td>${hidden}</table>`
						: `<table><thead><tr><th>${hidden}<tbody><tr><td>${hidden}</table>`;
			const prefix =
				(selectedHead ? "<head><body>" : "<head></head><body>") + table;
			const name = selectedInline ? "x-local" : "span";
			const source = `${prefix}<h1>A<${name}>B</${name}></h1>`;
			const result = await scan(source, options);
			expect(result.report.entries).toEqual([
				{
					ordinal: 1,
					level: 1,
					title: "AB",
					titleTruncated: false,
					anchor: {
						kind: "source-utf16-range-v1",
						startTag: { start: prefix.length, end: prefix.length + 4 },
						endTag: { start: source.length - 5, end: source.length },
					},
				},
			]);
			expect(Object.keys(result.report).sort()).toEqual(
				[
					"kind",
					"method",
					"semantics",
					"partial",
					"contentSuccess",
					"source",
					"completion",
					"scannedTo",
					"entries",
					"limits",
					"counters",
					...(tablePolicy === "strict" ? [] : ["tableScopePolicy"]),
					...(selectedHead ? ["headScopePolicy"] : []),
					...(selectedInline
						? ["headingInlinePolicy", "headingInlineLimitations"]
						: []),
				].sort(),
			);
			expect(result.report.headingInlinePolicy).toBe(
				selectedInline ? headingInlinePolicy : undefined,
			);
			expect(result.report.headingInlineLimitations).toEqual(
				selectedInline ? limitations : undefined,
			);
			expect(result.report.counters.suppressedHeadingStarts).toBe(
				tablePolicy === "strict" ? 1 : 2,
			);
			expect(result.report.counters.yields).toBeGreaterThan(0);
			expect(result.jsonl).not.toContain(privateMarker);
			const error = await captureFailure(() =>
				scan(`${prefix}<h1><span><img/>`, options),
			);
			expectCode(error, "unsupported");
			expect(sourceHeadingInlineDiagnostic(error)).toEqual({
				kind: "source-heading-inline-start",
				condition: "non-inline-start",
				headingLevel: 1,
				observedTag: "img",
				inlineDepth: 1,
			});
			expect(await scan(source, options)).toEqual(result);
			expect(close).toHaveBeenCalledTimes(3);
			for (const cursor of close.mock.contexts)
				expect((cursor as HtmlTokenCursor).closed).toBe(true);
			expectDeepFrozen(result);
		},
	);

	it("does not apply the additional-name ceiling outside an active heading", async () => {
		const name = "x".repeat(65);
		const prefix = `<${name}>`;
		const result = await selectedScan(`${prefix}<h1>A</h1></${name}>`, {
			maxTrackedDepth: 1,
		});
		expect(result.report.entries[0].title).toBe("A");
		expect(result.report.entries[0].anchor.startTag).toEqual({
			start: prefix.length,
			end: prefix.length + 4,
		});
		expect(result.report.counters.maxTrackedDepth).toBe(1);
	});

	it("does not rearm a head boundary after an ordinary pre-heading barrier", async () => {
		const prefix = `<head><div></div><body><h2>${privateMarker}</h2>`;
		const options = { headScopePolicy: "explicit-body-boundary-v1" };
		const error = await captureFailure(() =>
			selectedScan(`${prefix}<h1><x>A</x></h1>`, options),
		);
		expectCode(error, "unsupported");
		expect(sourceHeadingStructureDiagnostic(error)?.reason).toBe(
			"unclosed-context",
		);
		expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		const result = await selectedScan(
			`${prefix}</head><h1>A<x>B</x></h1>`,
			options,
		);
		expect(result.report.entries.map((entry) => entry.title)).toEqual(["AB"]);
		expect(result.jsonl).not.toContain(privateMarker);
	});

	it.each([
		{ token: "<plaintext>", reason: "ambiguous-text-mode", committed: true },
		{ token: "<noscript>", reason: "ambiguous-text-mode", committed: true },
		{
			token: "<x duplicate duplicate>",
			reason: "tokenizer-issue",
			committed: false,
		},
	] as const)(
		"retains earlier $reason before additional-name admission",
		async ({ token, reason, committed }) => {
			const source = `<h1>${token}`;
			const error = await captureFailure(() => selectedScan(source));
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason,
				position: committed ? source.length : 4,
				positionSemantics: "last-committed-source-utf16",
			});
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		},
	);

	it.each([
		{ source: "<h1><x></h1 data-close-check=x>", flags: 0, attributes: 0 },
		{ source: "<h1></h1 data-close-check=x>", flags: 1, attributes: 1 },
		{ source: "<h1><x></x data-close-check=x>", flags: 1, attributes: 1 },
		{ source: "<h1><x></x/>", flags: 1, attributes: 0 },
	])("preserves plainEnd ordering for $source", async (fixture) => {
		const flags = vi.fn();
		const attributes = vi.fn();
		const next = HtmlTokenCursor.prototype.next;
		let instrumented = 0;
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			const token = next.call(this);
			if (token?.kind === "end") {
				const actualFlag = token.selfClosing;
				const actualAttributes = token.attributes;
				flags.mockImplementation(() => actualFlag);
				attributes.mockImplementation(() => actualAttributes);
				Object.defineProperties(token, {
					selfClosing: { get: flags, configurable: true, enumerable: true },
					attributes: { get: attributes, configurable: true, enumerable: true },
				});
				instrumented++;
			}
			return token;
		});
		const error = await captureFailure(() => selectedScan(fixture.source));
		expectCode(error, "unsupported");
		expect(sourceHeadingStructureDiagnostic(error)?.reason).toBe(
			"heading-close-structure",
		);
		expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		expect(instrumented).toBe(1);
		expect(flags).toHaveBeenCalledTimes(fixture.flags);
		expect(attributes).toHaveBeenCalledTimes(fixture.attributes);
	});

	it.each(["x", longName])(
		"separately admits length and eligibility precharges for %s",
		async (name) => {
			const source = `<h1><${name}/>`;
			const base = nativePrefixWork(source, 2).workUnits;
			const classified = base + 6 * name.length + 5;
			for (const boundary of [
				{ limit: base, observed: base + 1 },
				{ limit: base + 1, observed: classified },
				{ limit: classified - 1, observed: classified },
			]) {
				const error = await captureFailure(() =>
					selectedScan(source, { maxWorkUnits: boundary.limit }),
				);
				expectLimit(error, {
					kind: "source.headings-work",
					unit: "code-units",
					...boundary,
				});
				expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
			}
			await expectInlineFailure(
				source,
				{ observedTag: "other" },
				{ maxWorkUnits: classified },
			);
		},
	);

	it("precharges both length admissions before an unequal 64-unit comparison", async () => {
		const source = `<h1><${longName}></${"y".repeat(64)}>`;
		const base = nativePrefixWork(source, 3).workUnits;
		for (const boundary of [
			{ limit: base + 390, observed: base + 391 },
			{ limit: base + 391, observed: base + 392 },
			{ limit: base + 392, observed: base + 521 },
			{ limit: base + 520, observed: base + 521 },
		]) {
			const error = await captureFailure(() =>
				selectedScan(source, { maxWorkUnits: boundary.limit }),
			);
			expectLimit(error, {
				kind: "source.headings-work",
				unit: "code-units",
				...boundary,
			});
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		}
		const exact = await captureFailure(() =>
			selectedScan(source, { maxWorkUnits: base + 521 }),
		);
		expectCode(exact, "unsupported");
		expect(sourceHeadingStructureDiagnostic(exact)?.reason).toBe(
			"heading-close-structure",
		);
		expect(sourceHeadingInlineDiagnostic(exact)).toBeUndefined();
	});

	it("does not add a completion yield before the ordinary EOF read", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const controller = controllerFor();
		const cursors = new Set<HtmlTokenCursor>();
		const next = HtmlTokenCursor.prototype.next;
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			cursors.add(this);
			return next.call(this);
		});
		const pending = observe(
			discoverResearchSourceHeadings(
				ownedSource("<h1>A</h1>"),
				{ method, headingInlinePolicy, yieldEveryWorkUnits: 30 },
				controller.signal,
			),
		);
		try {
			await microtasks();
			expect(pending.settled).toBe(false);
			expect(vi.getTimerCount()).toBeGreaterThan(0);
			expect(cursors.size).toBe(1);
			for (const cursor of cursors) expect(cursor.operations).toBe(4);
			await vi.runAllTimersAsync();
			const outcome = await pending.outcome;
			expect(outcome.error).toBeUndefined();
			expect(outcome.value?.report.counters.workUnits).toBe(30);
			expect(outcome.value?.report.counters.yields).toBe(1);
			for (const cursor of cursors) expect(cursor.closed).toBe(true);
		} finally {
			controller.abort();
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});

	it.each([
		{ name: "push", source: "<h1><x>", tokens: 2, units: 12 },
		{ name: "pop", source: "<h1><x></x>", tokens: 3, units: 18 },
	])(
		"yields after the selected $name and checks cancellation on resumption",
		async ({ source, tokens, units }) => {
			const threshold = nativePrefixWork(source, tokens).workUnits + units;
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			const controller = controllerFor();
			const cursors = new Set<HtmlTokenCursor>();
			const next = HtmlTokenCursor.prototype.next;
			vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
				this: HtmlTokenCursor,
			) {
				cursors.add(this);
				return next.call(this);
			});
			const pending = observe(
				discoverResearchSourceHeadings(
					ownedSource(source),
					{ method, headingInlinePolicy, yieldEveryWorkUnits: threshold },
					controller.signal,
				),
			);
			try {
				await microtasks();
				expect(pending.settled).toBe(false);
				expect(vi.getTimerCount()).toBeGreaterThan(0);
				expect(cursors.size).toBe(1);
				for (const cursor of cursors) {
					expect(cursor.operations).toBe(tokens);
					expect(cursor.position).toBe(source.length);
				}
				controller.abort(new Error(privateMarker));
				await vi.runAllTimersAsync();
				const outcome = await pending.outcome;
				expectCode(outcome.error, "aborted");
				expect(outcome.value).toBeUndefined();
				expect(sourceHeadingInlineDiagnostic(outcome.error)).toBeUndefined();
				for (const cursor of cursors) expect(cursor.closed).toBe(true);
			} finally {
				controller.abort();
				vi.clearAllTimers();
				vi.useRealTimers();
			}
		},
	);
});

describe("explicit v2 source-heading image omission", () => {
	const headingInlinePolicy = "balanced-source-elements-v2";
	const limitations = [
		"source-balance-only",
		"attributes-ignored",
		"not-dom-or-visibility",
		"image-elements-and-alt-omitted",
	] as const;
	const images = [
		"<img>",
		"<img/>",
		"<IMG>",
		"<ImG />",
		`<img alt="${privateMarker}" src="https://example.com/image" srcset="https://example.com/large 2x" onerror="${privateMarker}" title="${privateMarker}" aria-label="${privateMarker}">`,
	];

	function selectedScan(source: string, options: Record<string, unknown> = {}) {
		return scan(source, { headingInlinePolicy, ...options });
	}

	it.each(images)(
		"accepts a void %s without deriving image text",
		async (image) => {
			const source = `<h1>A${image}B</h1>`;
			const input = ownedSource(source);
			const original = input.body.slice();
			const result = await discoverResearchSourceHeadings(input, {
				method,
				headingInlinePolicy,
			});
			expect(result.report.entries).toEqual([
				{
					ordinal: 1,
					level: 1,
					title: "AB",
					titleTruncated: false,
					anchor: {
						kind: "source-utf16-range-v1",
						startTag: { start: 0, end: 4 },
						endTag: { start: source.length - 5, end: source.length },
					},
				},
			]);
			expect(input.body).toEqual(original);
			expect(result.report.source.bytes).toEqual({
				length: original.byteLength,
				sha256: sha256(original),
			});
			expect(result.report.source.text.codeUnits).toBe(source.length);
			expect(result.report.source.text.sha256).toBe(sha256(source));
			expect(result.report.headingInlinePolicy).toBe(headingInlinePolicy);
			expect(result.report.headingInlineLimitations).toEqual(limitations);
			expect(result.report.limits).toEqual(canonicalLimits);
			expect(result.report.completion).toBe("eof");
			expect(result.report.scannedTo).toBe(source.length);
			expect(result.report.partial).toBe(true);
			expect(result.report.contentSuccess).toBeNull();
			expect(result.report.counters.tokens).toBe(5);
			expect(result.report.counters.maxTrackedDepth).toBe(1);
			expect(result.jsonl).toBe(`${JSON.stringify(result.report)}\n`);
			expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
			expect(result.jsonl).not.toContain(privateMarker);
			expect(result.jsonl).not.toContain("https://example.com/image");
			expectDeepFrozen(result);
		},
	);

	it.each(images)("preserves default and v1 rejection of %s", async (image) => {
		for (const options of [
			{},
			{ headingInlinePolicy: "balanced-source-elements-v1" },
		]) {
			const error = await captureFailure(() =>
				scan(`<h1>${image}</h1>`, options),
			);
			expectCode(error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(error)).toEqual({
				kind: "source-heading-structure",
				reason: "heading-inline-structure",
				position: 4 + image.length,
				positionSemantics: "last-committed-source-utf16",
			});
			expect(sourceHeadingInlineDiagnostic(error)).toEqual({
				kind: "source-heading-inline-start",
				condition: "non-inline-start",
				headingLevel: 1,
				observedTag: "img",
				inlineDepth: 0,
			});
		}
	});

	it("preserves v1 counters and metadata on image-free source", async () => {
		const source = "<h1><div>A<span>B</span><br>C<wbr>D</div></h1>";
		const previous = await scan(source, {
			headingInlinePolicy: "balanced-source-elements-v1",
		});
		const selected = await selectedScan(source);
		expect(selected.report).toEqual({
			...previous.report,
			headingInlinePolicy,
			headingInlineLimitations: limitations,
		});
		expect(previous.report.headingInlineLimitations).toEqual(
			limitations.slice(0, 3),
		);
		expect(
			Object.hasOwn((await scan("<h1>A</h1>")).report, "headingInlinePolicy"),
		).toBe(false);
	});

	it("retains balanced nested formatting without pushing image frames", async () => {
		const source =
			"<h1><x-local>A<img><span>B<img/><strong>C<img></strong></span>D</x-local></h1>";
		const result = await selectedScan(source, { maxTrackedDepth: 4 });
		expect(result.report.entries[0].title).toBe("ABCD");
		expect(result.report.counters.maxTrackedDepth).toBe(4);
		expect(result.report.entries[0].anchor.endTag).toEqual({
			start: source.length - 5,
			end: source.length,
		});
		const shallow = await selectedScan("<h1><img><img/><img></h1>", {
			maxTrackedDepth: 1,
		});
		expect(shallow.report.counters.maxTrackedDepth).toBe(1);
	});

	it.each([
		["<h1><img alt='not title'></h1>", ""],
		["<h1> \t<img alt='not title'/> \n</h1>", ""],
		["<h1>A<img>B</h1>", "AB"],
		["<h1> A \t<img>\n B </h1>", "A B"],
		["<h1><img> A<img> </h1>", "A"],
		["<h1>A<img><br/><img><wbr>B</h1>", "A B"],
	])("does not invent spacing or alt text for %s", async (source, title) => {
		const result = await selectedScan(source);
		expect(result.report.entries).toHaveLength(1);
		expect(result.report.entries[0]).toMatchObject({
			title,
			titleTruncated: false,
		});
	});

	it.each([
		{
			source: "<h1>AB<img alt='long text'>CD</h1>",
			limit: 3,
			title: "ABC",
			truncated: true,
		},
		{
			source: "<h1>A<img alt='long text'>B</h1>",
			limit: 2,
			title: "AB",
			truncated: false,
		},
		{ source: "<h1>A<img>😀Z</h1>", limit: 2, title: "A", truncated: true },
		{
			source: "<h1><img alt='long text'></h1>",
			limit: 1,
			title: "",
			truncated: false,
		},
	])(
		"keeps title clipping for $source",
		async ({ source, limit, title, truncated }) => {
			const result = await selectedScan(source, { maxTitleCodeUnits: limit });
			expect(result.report.entries[0]).toMatchObject({
				title,
				titleTruncated: truncated,
			});
		},
	);

	it.each(["</img>", "</IMG>", "</img/>", "</img alt='ignored'>"])(
		"does not accept an image closing tag %s",
		async (close) => {
			const error = await captureFailure(() =>
				selectedScan(`<h1><img>${close}</h1>`),
			);
			expectCode(error, "unsupported");
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
			if (close === "</img>" || close === "</IMG>") {
				expect(sourceHeadingStructureDiagnostic(error)?.reason).toBe(
					"heading-close-structure",
				);
			}
		},
	);

	it.each([
		"<h1><span><img></h1>",
		"<h1><span/><img></h1>",
		"<h1><div/><img></h1>",
	])("does not relax surrounding balance for %s", async (source) => {
		expectCode(await captureFailure(() => selectedScan(source)), "unsupported");
	});

	it.each(
		[
			...new Set([
				...voidNames,
				...rawNames,
				...omittedFrames,
				...suppressedNames,
				"html",
				"body",
				"h2",
			]),
		].filter((name) => name !== "img" && name !== "br" && name !== "wbr"),
	)("preserves the v1 exclusion and diagnostics for %s", async (name) => {
		const source = `<h1><${name}>`;
		const previous = await captureFailure(() =>
			scan(source, { headingInlinePolicy: "balanced-source-elements-v1" }),
		);
		const selected = await captureFailure(() => selectedScan(source));
		expectCode(previous, "unsupported");
		expectCode(selected, "unsupported");
		expect(sourceHeadingStructureDiagnostic(selected)).toEqual(
			sourceHeadingStructureDiagnostic(previous),
		);
		expect(sourceHeadingInlineDiagnostic(selected)).toEqual(
			sourceHeadingInlineDiagnostic(previous),
		);
	});

	it("does not inspect image attributes or selfClosing after tokenization", async () => {
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const next = HtmlTokenCursor.prototype.next;
		let instrumented = 0;
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			const token = next.call(this);
			if (token?.kind !== "start" || token.name !== "img") return token;
			instrumented++;
			return Object.defineProperties(
				{ ...token },
				{
					attributes: { get: trap },
					selfClosing: { get: trap },
				},
			);
		});
		const result = await selectedScan(
			"<h1>A<img alt='ignored' onload='ignored'/>B</h1>",
		);
		expect(result.report.entries[0].title).toBe("AB");
		expect(instrumented).toBe(1);
		expect(trap).not.toHaveBeenCalled();
	});

	it("retains native token accounting and cursor cleanup without omitted-scope frames", async () => {
		const source = "<h1>A<img>B</h1>";
		const native = new HtmlTokenCursor(source, () => {
			throw new Error("Unexpected synthetic tokenizer issue");
		});
		let nativeTokens = 0;
		try {
			while (native.next()) nativeTokens++;
			const result = await selectedScan(source);
			expect(nativeTokens).toBe(5);
			expect(result.report.counters).toEqual({
				tokens: 5,
				operations: native.operations,
				workUnits: native.workUnits + 5 + 2 + 6,
				issueAttempts: 0,
				entityIssues: {},
				omittedStarts: {},
				suppressedStarts: {},
				suppressedHeadingStarts: 0,
				rawStarts: {},
				maxTrackedDepth: 1,
				yields: 0,
			});
		} finally {
			native.close();
		}
		const next = HtmlTokenCursor.prototype.next;
		const cursors = new Set<HtmlTokenCursor>();
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			cursors.add(this);
			return next.call(this);
		});
		await selectedScan(source);
		await captureFailure(() => selectedScan("<h1><img></img></h1>"));
		expect(cursors.size).toBe(2);
		for (const cursor of cursors) expect(cursor.closed).toBe(true);
	});

	it.each([
		{
			source: "<h1><img></h1>",
			options: { maxHeadingCodeUnits: 8 },
			diagnostic: {
				kind: "source.heading-extent",
				unit: "code-units",
				limit: 8,
				observed: 9,
			},
		},
		{
			source: "<h1><img></h1>",
			options: { maxWindowCodeUnits: 4 },
			diagnostic: {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 4,
				observed: 5,
			},
		},
		{
			source: "<h1><img duplicate duplicate>",
			options: { maxIssues: 0 },
			diagnostic: {
				kind: "html.issues",
				unit: "issues",
				limit: 0,
				observed: 1,
			},
		},
	] as const)(
		"preserves the $diagnostic.kind budget",
		async ({ source, options, diagnostic }) => {
			const error = await captureFailure(() => selectedScan(source, options));
			expectLimit(error, diagnostic);
			expect(sourceHeadingInlineDiagnostic(error)).toBeUndefined();
		},
	);

	it("counts the image-omission disclosure in the unchanged exact output cap", async () => {
		const source = "<h1>A<img>B</h1>";
		const baseline = await selectedScan(source);
		let cap = baseline.outputBytes;
		for (let attempt = 0; attempt < 4; attempt++) {
			cap = encoder.encode(
				`${JSON.stringify({ ...baseline.report, limits: { ...baseline.report.limits, maxOutputBytes: cap } })}\n`,
			).byteLength;
		}
		expect(String(cap - 1).length).toBe(String(cap).length);
		expect(
			(await selectedScan(source, { maxOutputBytes: cap })).outputBytes,
		).toBe(cap);
		expectLimit(
			await captureFailure(() =>
				selectedScan(source, { maxOutputBytes: cap - 1 }),
			),
			{
				kind: "source.headings-output",
				unit: "bytes",
				limit: cap - 1,
				observed: cap,
			},
		);
	});

	it("accepts only own literal v2 options and rejects hostile admission before source access", async () => {
		const accepted = await discoverResearchSourceHeadings(
			ownedSource("<h1><img></h1>"),
			Object.assign(Object.create(null), { method, headingInlinePolicy }),
		);
		expect(accepted.report.headingInlinePolicy).toBe(headingInlinePolicy);
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const traps = {
			get: trap,
			ownKeys: trap,
			getPrototypeOf: trap,
			getOwnPropertyDescriptor: trap,
		};
		const invalidOptions = [
			{ method, headingInlinePolicy: "balanced-source-elements-v3" },
			{ method, headingInlinePolicy: undefined },
			{ method, headingInlinePolicy: { toString: trap } },
			{ method, headingInlinePolicy: new Proxy({}, traps) },
			Object.defineProperty({ method }, "headingInlinePolicy", { get: trap }),
			Object.assign(Object.create({ headingInlinePolicy }), { method }),
			new Proxy({ method, headingInlinePolicy }, traps),
		];
		for (const options of invalidOptions) {
			const error = await captureFailure(() =>
				discoverResearchSourceHeadings(new Proxy({}, traps), options),
			);
			expectCode(error, "invalid-input");
		}
		expect(trap).not.toHaveBeenCalled();
	});
});

describe("explicit bounded non-entity raw discard", () => {
	const rawDiscardPolicy = "bounded-non-entity-v1";
	const limitations = [
		"six-non-entity-names-only",
		"title-textarea-legacy-raw",
		"closing-token-still-window-bounded",
		"lexical-not-dom-or-visibility",
	];
	const discardNames = [
		"script",
		"style",
		"xmp",
		"iframe",
		"noembed",
		"noframes",
	] as const;
	const selected = (text: string, options: Record<string, unknown> = {}) =>
		scan(text, { rawDiscardPolicy, ...options });

	function trackSteps() {
		const native = HtmlTokenCursor.prototype.discardRawStep;
		const cursors = new Set<HtmlTokenCursor>();
		const steps: Readonly<HtmlRawDiscardStep>[] = [];
		const spy = vi
			.spyOn(HtmlTokenCursor.prototype, "discardRawStep")
			.mockImplementation(function (
				this: HtmlTokenCursor,
				name: HtmlDiscardRawName,
			) {
				cursors.add(this);
				const result = native.call(this, name);
				steps.push(result);
				return result;
			});
		return { cursors, steps, spy };
	}

	function expectSelected(result: Awaited<ReturnType<typeof scan>>) {
		const report = result.report;
		const counters = report.counters;
		const discard = counters.rawDiscard;
		expect(report.rawDiscardPolicy).toBe(rawDiscardPolicy);
		expect(report.rawDiscardLimitations).toEqual(limitations);
		expect(discard).toBeDefined();
		if (!discard) throw new Error("Missing selected raw-discard counters");
		expect(Object.keys(discard).sort()).toEqual([
			"codeUnits",
			"elements",
			"legacyRawCalls",
			"steps",
		]);
		expect(counters.operations).toBe(
			counters.tokens +
				discard.steps +
				discard.legacyRawCalls +
				(report.completion === "eof" ? 1 : 0),
		);
		expect(
			Object.values(counters.rawStarts).reduce(
				(total, count) => total + count,
				0,
			),
		).toBe(discard.elements + discard.legacyRawCalls);
		expect(discard.legacyRawCalls).toBe(
			(counters.rawStarts.title ?? 0) + (counters.rawStarts.textarea ?? 0),
		);
		expect(report.method).toBe(method);
		expect(report.semantics).toBe("lexical-not-dom");
		expect(report.partial).toBe(true);
		expect(report.contentSuccess).toBeNull();
		expect(JSON.parse(result.jsonl)).toEqual(report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(
			report.limits.maxOutputBytes,
		);
		expectDeepFrozen(result);
		return discard;
	}

	async function rejectBeforeSource(options: unknown) {
		const input = ownedSource("<h1>Unreached</h1>");
		const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor");
		const prototypes = vi.spyOn(Object, "getPrototypeOf");
		const keys = vi.spyOn(Reflect, "ownKeys");
		let error: unknown;
		let inspections = 0;
		try {
			error = await captureFailure(() =>
				discoverResearchSourceHeadings(input, options),
			);
			inspections =
				descriptors.mock.calls.filter(([value]) => value === input).length +
				prototypes.mock.calls.filter(([value]) => value === input).length +
				keys.mock.calls.filter(([value]) => value === input).length;
		} finally {
			keys.mockRestore();
			prototypes.mockRestore();
			descriptors.mockRestore();
		}
		expectCode(error, "invalid-input");
		expect(inspections).toBe(0);
		expect((error as Error).message).not.toContain(privateMarker);
	}

	it("leaves default calls and exact report keys unchanged", async () => {
		const steps = trackSteps();
		const raw = vi.spyOn(HtmlTokenCursor.prototype, "raw");
		const result = await scan(
			"<script>x</script><title>y</title><h1>Outside</h1>",
		);
		expect(raw.mock.calls).toEqual([
			["script", false],
			["title", true],
		]);
		expect(steps.spy).not.toHaveBeenCalled();
		expect(Object.keys(result.report).sort()).toEqual([
			"completion",
			"contentSuccess",
			"counters",
			"entries",
			"kind",
			"limits",
			"method",
			"partial",
			"scannedTo",
			"semantics",
			"source",
		]);
		expect(Object.keys(result.report.counters).sort()).toEqual([
			"entityIssues",
			"issueAttempts",
			"maxTrackedDepth",
			"omittedStarts",
			"operations",
			"rawStarts",
			"suppressedHeadingStarts",
			"suppressedStarts",
			"tokens",
			"workUnits",
			"yields",
		]);
		expect(result.report.counters.operations).toBe(
			result.report.counters.tokens + 3,
		);
		expect(result.jsonl).not.toContain("rawDiscard");
	});

	it("adds only selected disclosure and zero counters when no raw element occurs", async () => {
		const text = "<h1>One</h1>";
		const baseline = await scan(text);
		const result = await selected(text);
		const {
			rawDiscardPolicy: policy,
			rawDiscardLimitations,
			counters,
			...rest
		} = result.report;
		const { rawDiscard, ...ordinaryCounters } = counters;
		expect({ ...rest, counters: ordinaryCounters }).toEqual(baseline.report);
		expect(policy).toBe(rawDiscardPolicy);
		expect(rawDiscardLimitations).toEqual(limitations);
		expect(rawDiscard).toEqual({
			steps: 0,
			elements: 0,
			codeUnits: 0,
			legacyRawCalls: 0,
		});
		expectSelected(result);
		if (!rawDiscard || !rawDiscardLimitations)
			throw new Error("Missing selected metadata");
		expect(Reflect.set(result.report, "rawDiscardPolicy", "changed")).toBe(
			false,
		);
		expect(Reflect.set(rawDiscardLimitations, "0", "changed")).toBe(false);
		expect(Reflect.set(rawDiscard, "steps", 1)).toBe(false);
	});

	it("accounts separately for all six discarded and two entity-aware raw names", async () => {
		const trace = trackSteps();
		const raw = vi.spyOn(HtmlTokenCursor.prototype, "raw");
		const text = `${rawNames.map((name) => `<${name}>text</${name}>`).join("")}<h1>Outside</h1>`;
		const result = await selected(text);
		expect(expectSelected(result)).toEqual({
			steps: 6,
			elements: 6,
			codeUnits: 24,
			legacyRawCalls: 2,
		});
		expect(trace.spy.mock.calls).toEqual(discardNames.map((name) => [name]));
		expect(raw.mock.calls).toEqual([
			["title", true],
			["textarea", true],
		]);
		expect(result.report.counters.rawStarts).toEqual(
			Object.fromEntries(rawNames.map((name) => [name, 1])),
		);
		expect(result.report.entries.map((entry) => entry.title)).toEqual([
			"Outside",
		]);
		for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
	});

	it("keeps the selected entry-limit operation identity without a synthetic EOF", async () => {
		const result = await selected(
			"<style>x</style><h1>One</h1><h2>Unread</h2>",
			{ maxEntries: 1 },
		);
		expect(result.report.completion).toBe("entry-limit");
		expect(result.report.entries.map((entry) => entry.title)).toEqual(["One"]);
		expect(expectSelected(result)).toEqual({
			steps: 1,
			elements: 1,
			codeUnits: 1,
			legacyRawCalls: 0,
		});
	});

	it.each(["plain", "null"])(
		"admits own nonenumerable selection on a %s prototype",
		async (prototype) => {
			const options = Object.assign(
				Object.create(prototype === "null" ? null : Object.prototype),
				{ method },
			);
			Object.defineProperty(options, "rawDiscardPolicy", {
				value: rawDiscardPolicy,
			});
			expectSelected(
				await discoverResearchSourceHeadings(ownedSource(""), options),
			);
		},
	);

	it("rejects explicit undefined and nonliteral selections before source admission", async () => {
		for (const value of [
			undefined,
			null,
			false,
			true,
			0,
			"",
			"bounded-non-entity-v0",
			"BOUNDED-NON-ENTITY-V1",
			`${rawDiscardPolicy} `,
			{},
			[],
			new String(rawDiscardPolicy),
		]) {
			await rejectBeforeSource({ method, rawDiscardPolicy: value });
		}
		for (const options of [
			{ rawDiscardPolicy },
			{ method, rawDiscardPolicy, entities: false },
			{ method, rawDiscardPolicy, [Symbol("unknown")]: true },
			Object.assign(Object.create({ rawDiscardPolicy }), { method }),
		])
			await rejectBeforeSource(options);
	});

	it("rejects policy accessors, coercible values and revoked proxies without traps", async () => {
		const trap = vi.fn((): never => {
			throw new Error(privateMarker);
		});
		const traps = {
			get: trap,
			getPrototypeOf: trap,
			ownKeys: trap,
			getOwnPropertyDescriptor: trap,
		};
		const revoked = Proxy.revocable({ method, rawDiscardPolicy }, traps);
		revoked.revoke();
		const accessor = Object.defineProperty({ method }, "rawDiscardPolicy", {
			get: trap,
		});
		for (const options of [
			accessor,
			new Proxy({ method, rawDiscardPolicy }, traps),
			revoked.proxy,
		]) {
			await rejectBeforeSource(options);
		}
		for (const value of [
			new Proxy({}, traps),
			revoked.proxy,
			{ toString: trap, valueOf: trap, [Symbol.toPrimitive]: trap },
		]) {
			await rejectBeforeSource({ method, rawDiscardPolicy: value });
		}
		expect(trap).not.toHaveBeenCalled();
	});

	it("rejects every selected window below16 before source admission, not on raw encounter", async () => {
		for (
			let maxWindowCodeUnits = 1;
			maxWindowCodeUnits < 16;
			maxWindowCodeUnits++
		) {
			await rejectBeforeSource({
				method,
				rawDiscardPolicy,
				maxWindowCodeUnits,
			});
		}
		expectSelected(await selected("", { maxWindowCodeUnits: 16 }));
		expect((await scan("", { maxWindowCodeUnits: 1 })).report.completion).toBe(
			"eof",
		);
	});

	it("snapshots policy and owned bytes before a suspended scan resumes", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const text = `<style>${"x".repeat(80)}</style><h1>Original</h1>`;
		const input = ownedSource(text);
		const options = {
			method,
			rawDiscardPolicy,
			maxWindowCodeUnits: 16,
			yieldEveryOperations: 1,
		};
		const pending = observe(discoverResearchSourceHeadings(input, options));
		await microtasks();
		expect(pending.settled).toBe(false);
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		options.rawDiscardPolicy = "changed";
		options.maxWindowCodeUnits = 1;
		input.body.fill(0);
		await vi.runAllTimersAsync();
		const outcome = await pending.outcome;
		expect(outcome.error).toBeUndefined();
		if (!outcome.value) throw new Error("Missing completed snapshot result");
		expectSelected(outcome.value);
		expect(outcome.value.report.entries.map((entry) => entry.title)).toEqual([
			"Original",
		]);
		expect(outcome.value.report.limits.maxWindowCodeUnits).toBe(16);
		expect(outcome.value.report.source.bytes.sha256).toBe(
			sha256(encoder.encode(text)),
		);
	});

	it.each(discardNames)(
		"uses actual multi-window %s discard where default raw refuses",
		async (name) => {
			const body = `${privateMarker}<h3>Hidden</h3>${"x".repeat(65_537)}`;
			const text = `<h1>Before</h1><${name}>${body}</${name}><h2>After</h2>`;
			const error = await captureFailure(() => scan(text));
			expectLimit(error, {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 65_536,
				observed: 65_537,
			});
			expect(htmlTokenCursorWindowDiagnostic(error)).toMatchObject({
				operation: "raw",
				position: text.indexOf(body),
			});
			const trace = trackSteps();
			const raw = vi.spyOn(HtmlTokenCursor.prototype, "raw");
			const result = await selected(text);
			const counters = expectSelected(result);
			expect(counters.steps).toBeGreaterThan(1);
			expect(counters.elements).toBe(1);
			expect(counters.codeUnits).toBe(body.length);
			expect(counters.legacyRawCalls).toBe(0);
			expect(counters.steps).toBe(trace.steps.length);
			expect(trace.steps.at(-1)?.status).toBe("end-tag");
			expect(trace.steps.at(-1)?.position).toBe(text.indexOf(`</${name}>`));
			expect(raw).not.toHaveBeenCalled();
			expect(result.report.entries.map((entry) => entry.title)).toEqual([
				"Before",
				"After",
			]);
			expect(result.report.scannedTo).toBe(text.length);
			expect(result.jsonl).not.toContain(privateMarker);
			for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
		},
	);

	it("counts a zero-advance immediate close as one completed discard step", async () => {
		const trace = trackSteps();
		const result = await selected("<style></style><h1>X</h1>", {
			maxWindowCodeUnits: 16,
		});
		expect(expectSelected(result)).toEqual({
			steps: 1,
			elements: 1,
			codeUnits: 0,
			legacyRawCalls: 0,
		});
		expect(trace.steps).toEqual([
			{ status: "end-tag", position: 7, discardedCodeUnits: 0 },
		]);
		expect(result.report.entries[0].title).toBe("X");
	});

	it.each(discardNames)(
		"recognizes slash as a %s delimiter but still refuses a self-closing end token",
		async (name) => {
			const trace = trackSteps();
			const text = `<${name}>x</${name}/><h1>Unreached</h1>`;
			const outcome = await observe(selected(text, { maxWindowCodeUnits: 16 }))
				.outcome;
			expect(outcome.value).toBeUndefined();
			expectCode(outcome.error, "unsupported");
			expect(sourceHeadingStructureDiagnostic(outcome.error)?.reason).toBe(
				"raw-close-structure",
			);
			expect(trace.steps.at(-1)).toEqual({
				status: "end-tag",
				position: name.length + 3,
				discardedCodeUnits: 1,
			});
			expect(htmlTokenCursorWindowDiagnostic(outcome.error)).toBeUndefined();
		},
	);

	it.each([
		"<!----><script>",
		"<!--x--><script>",
		"<!--<script>inner</script>escaped-->",
		"<!--<script>--><script>",
		"<!--<script>inner</script>",
		"abc</scriptx>still",
		"<!--<ScRiPt >inside</sCrIpT >-->",
	])(
		"preserves native script state across small-window splits: %s",
		async (body) => {
			const text = `<script>${body}</script><h1>Outside</h1>`;
			const baseline = await scan(text);
			const result = await selected(text, { maxWindowCodeUnits: 16 });
			expect(expectSelected(result).codeUnits).toBe(body.length);
			expect(result.report.entries).toEqual(baseline.report.entries);
			expect(result.report.counters.issueAttempts).toBe(
				baseline.report.counters.issueAttempts,
			);
		},
	);

	it.each(["\t", "\n", "\f", "\r", " ", ">"])(
		"uses native case-insensitive name boundaries and delimiter %j",
		async (delimiter) => {
			for (const name of discardNames) {
				const body = `z</${name}x>q`;
				const close = `</${name.toUpperCase()}${delimiter}${delimiter === ">" ? "" : ">"}`;
				const result = await selected(`<${name}>${body}${close}<h1>X</h1>`, {
					maxWindowCodeUnits: 16,
				});
				expect(expectSelected(result).codeUnits).toBe(body.length);
				expect(result.report.entries[0].title).toBe("X");
			}
		},
	);

	it("sums committed UTF16 advances, not bytes or overlapped window lengths", async () => {
		const body = `aaaaa😀${"😀".repeat(18)}${privateMarker}`;
		const trace = trackSteps();
		const result = await selected(`<style>${body}</style><h1>😀 Outside</h1>`, {
			maxWindowCodeUnits: 16,
		});
		expect(expectSelected(result).codeUnits).toBe(body.length);
		expect(body.length).not.toBe(encoder.encode(body).byteLength);
		expect(trace.steps[0].discardedCodeUnits).toBe(6);
		expect(
			trace.steps.reduce((total, step) => total + step.discardedCodeUnits, 0),
		).toBe(body.length);
		expect(result.report.entries[0].title).toBe("😀 Outside");
		expect(result.jsonl).not.toContain(privateMarker);
	});

	it.each(discardNames)(
		"does not add entity or NUL validation to non-entity %s",
		async (name) => {
			const body = `\0&#0;&not-a-reference;${privateMarker}`;
			const result = await selected(`<${name}>${body}</${name}><h1>X</h1>`, {
				maxIssues: 0,
				maxWindowCodeUnits: 16,
			});
			expect(expectSelected(result).codeUnits).toBe(body.length);
			expect(result.report.counters.issueAttempts).toBe(0);
			expect(result.report.counters.entityIssues).toEqual({});
			expect(result.jsonl).not.toContain(privateMarker);
		},
	);

	it.each(["title", "textarea"])(
		"keeps %s on actual legacy entity decoding and issue limits",
		async (name) => {
			const raw = vi.spyOn(HtmlTokenCursor.prototype, "raw");
			const steps = trackSteps();
			const text = `<${name}>&#0;</${name}><h1>X</h1>`;
			const result = await selected(text);
			expect(expectSelected(result)).toEqual({
				steps: 0,
				elements: 0,
				codeUnits: 0,
				legacyRawCalls: 1,
			});
			expect(raw.mock.calls).toEqual([[name, true]]);
			expect(steps.spy).not.toHaveBeenCalled();
			expect(result.report.counters.entityIssues).toEqual({
				"invalid-numeric-entity": 1,
			});
			expect(result.report.counters.issueAttempts).toBe(1);
			const error = await captureFailure(() =>
				selected(text, { maxIssues: 0 }),
			);
			expectLimit(error, {
				kind: "html.issues",
				unit: "issues",
				limit: 0,
				observed: 1,
			});
			expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		},
	);

	it.each(["title", "textarea"])(
		"does not recover long or unterminated legacy %s",
		async (name) => {
			const steps = trackSteps();
			const text = `<h1>Provisional</h1><${name}>${"x".repeat(65_537)}</${name}>`;
			const outcome = await observe(selected(text)).outcome;
			expect(outcome.value).toBeUndefined();
			expectLimit(outcome.error, {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 65_536,
				observed: 65_537,
			});
			expect(htmlTokenCursorWindowDiagnostic(outcome.error)?.operation).toBe(
				"raw",
			);
			expectCode(
				await captureFailure(() => selected(`<${name}>missing`)),
				"unsupported",
			);
			expect(steps.spy).not.toHaveBeenCalled();
		},
	);

	it.each(discardNames)(
		"does not select %s inside headings even with balanced inline enabled",
		async (name) => {
			const trace = trackSteps();
			for (const options of [
				{},
				{ headingInlinePolicy: "balanced-source-elements-v1" },
			]) {
				const text = `<h1>Provisional</h1><h2><${name}>${privateMarker}</${name}></h2>`;
				const baseline = await captureFailure(() => scan(text, options));
				const outcome = await observe(selected(text, options)).outcome;
				expect(outcome.value).toBeUndefined();
				expectCode(outcome.error, "unsupported");
				expect(sourceHeadingStructureDiagnostic(outcome.error)).toEqual(
					sourceHeadingStructureDiagnostic(baseline),
				);
			}
			expect(trace.spy).not.toHaveBeenCalled();
		},
	);

	it.each([
		"<style/>",
		"<style>x</style extra=x>",
		"<style>x</style/>",
		"<style>x</style",
		"<style>missing",
		"<style>x</style><template></head>",
	])(
		"rejects malformed raw or later scope input without provisional output: %s",
		async (suffix) => {
			const outcome = await observe(selected(`<h1>Provisional</h1>${suffix}`))
				.outcome;
			expect(outcome.value).toBeUndefined();
			expectCode(outcome.error, "unsupported");
			expect(resourceLimitDiagnostic(outcome.error)).toBeUndefined();
			expect(htmlTokenCursorWindowDiagnostic(outcome.error)).toBeUndefined();
			expect((outcome.error as Error).message).not.toContain("Provisional");
		},
	);

	it("does not publish an EOF raw result and enforces its actual issue attempt", async () => {
		const trace = trackSteps();
		const outcome = await observe(selected("<style>", { maxIssues: 0 }))
			.outcome;
		expect(outcome.value).toBeUndefined();
		expectLimit(outcome.error, {
			kind: "html.issues",
			unit: "issues",
			limit: 0,
			observed: 1,
		});
		expect(trace.steps).toHaveLength(0);
		for (const cursor of trace.cursors) {
			expect(cursor.position).toBe(7);
			expect(cursor.issueCount).toBe(1);
			expect(cursor.closed).toBe(true);
		}
	});

	it("still parses an oversized closing token with next and retains its trusted diagnostic", async () => {
		const trace = trackSteps();
		const text = `<style>x</style${" ".repeat(24)}><h1>Unreached</h1>`;
		const outcome = await observe(selected(text, { maxWindowCodeUnits: 16 }))
			.outcome;
		expect(outcome.value).toBeUndefined();
		expectLimit(outcome.error, {
			kind: "html.cursor-window",
			unit: "code-units",
			limit: 16,
			observed: 17,
		});
		expect(trace.steps).toEqual([
			{ status: "end-tag", position: 8, discardedCodeUnits: 1 },
		]);
		expect(htmlTokenCursorWindowDiagnostic(outcome.error)).toEqual({
			kind: "html-cursor-window",
			operation: "next",
			position: 8,
			positionSemantics: "last-committed-source-utf16",
		});
	});

	it("composes with explicit head, table and balanced-inline policies without exposing omitted headings", async () => {
		const text = `<head><style>${"x".repeat(80)}</style><title>Hidden</title><body><h1><span>A</span></h1><table><tbody><tr><td><h2>Hidden</h2></td></tr></tbody></table><h2>B</h2>`;
		const options = {
			headScopePolicy: "explicit-body-boundary-v1",
			tableScopePolicy: "optional-end-tags-v2",
			headingInlinePolicy: "balanced-source-elements-v1",
		};
		const baseline = await scan(text, options);
		const result = await selected(text, { ...options, maxWindowCodeUnits: 16 });
		expectSelected(result);
		expect(result.report.entries).toEqual(baseline.report.entries);
		expect(result.report.entries.map((entry) => entry.title)).toEqual([
			"A",
			"B",
		]);
		expect(result.report.counters.suppressedHeadingStarts).toBe(1);
		expect(result.report.headScopePolicy).toBe(options.headScopePolicy);
		expect(result.report.tableScopePolicy).toBe(options.tableScopePolicy);
		expect(result.report.headingInlinePolicy).toBe(options.headingInlinePolicy);
	});

	it("includes selected metadata in the exact self-describing output cap", async () => {
		const text = "<style>discard</style><h1>One</h1>";
		const baseline = await selected(text);
		let cap = baseline.outputBytes;
		for (let attempt = 0; attempt < 8; attempt++) {
			cap = encoder.encode(
				`${JSON.stringify({ ...baseline.report, limits: { ...baseline.report.limits, maxOutputBytes: cap } })}\n`,
			).byteLength;
		}
		expect(String(cap - 1).length).toBe(String(cap).length);
		const exact = await selected(text, { maxOutputBytes: cap });
		expectSelected(exact);
		expect(exact.outputBytes).toBe(cap);
		const outcome = await observe(selected(text, { maxOutputBytes: cap - 1 }))
			.outcome;
		expect(outcome.value).toBeUndefined();
		expectLimit(outcome.error, {
			kind: "source.headings-output",
			unit: "bytes",
			limit: cap - 1,
			observed: cap,
		});
	});

	it("charges each discard call against the same operation cap and closes on exhaustion", async () => {
		const trace = trackSteps();
		const outcome = await observe(
			selected(`<style>${"x".repeat(80)}</style>`, {
				maxWindowCodeUnits: 16,
				maxOperations: 2,
			}),
		).outcome;
		expect(outcome.value).toBeUndefined();
		expectLimit(outcome.error, {
			kind: "html.cursor-operations",
			unit: "operations",
			limit: 2,
			observed: 3,
		});
		expect(trace.steps).toHaveLength(1);
		expect(htmlTokenCursorWindowDiagnostic(outcome.error)).toBeUndefined();
		for (const cursor of trace.cursors) {
			expect(cursor.position).toBe(13);
			expect(cursor.closed).toBe(true);
		}
	});

	it.each([
		{ cap: 46, kind: "html.cursor-work", observed: 47, committed: 7, steps: 0 },
		{
			cap: 47,
			kind: "source.headings-work",
			observed: 48,
			committed: 13,
			steps: 1,
		},
	] as const)(
		"enforces shared $kind before any scanner result",
		async ({ cap, kind, observed, committed, steps }) => {
			const trace = trackSteps();
			const outcome = await observe(
				selected(`<style>${"x".repeat(80)}</style>`, {
					maxWindowCodeUnits: 16,
					maxWorkUnits: cap,
				}),
			).outcome;
			expect(outcome.value).toBeUndefined();
			expectLimit(outcome.error, {
				kind,
				unit: "code-units",
				limit: cap,
				observed,
			});
			expect(trace.steps).toHaveLength(steps);
			expect(htmlTokenCursorWindowDiagnostic(outcome.error)).toBeUndefined();
			for (const cursor of trace.cursors) {
				expect(cursor.position).toBe(committed);
				expect(cursor.closed).toBe(true);
			}
		},
	);

	it.each([
		{
			name: "operations",
			yieldEveryOperations: 2,
			yieldEveryWorkUnits: 32_768,
		},
		{ name: "work", yieldEveryOperations: 256, yieldEveryWorkUnits: 48 },
	])(
		"yields after the first bounded step on the $name threshold",
		async (threshold) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			const trace = trackSteps();
			const pending = observe(
				selected(`<style>${"x".repeat(80)}</style><h1>X</h1>`, {
					maxWindowCodeUnits: 16,
					yieldEveryOperations: threshold.yieldEveryOperations,
					yieldEveryWorkUnits: threshold.yieldEveryWorkUnits,
				}),
			);
			await microtasks();
			expect(pending.settled).toBe(false);
			expect(trace.steps).toHaveLength(1);
			expect(trace.steps[0]).toEqual({
				status: "more",
				position: 13,
				discardedCodeUnits: 6,
			});
			expect(vi.getTimerCount()).toBeGreaterThan(0);
			await vi.runAllTimersAsync();
			const outcome = await pending.outcome;
			expect(outcome.error).toBeUndefined();
			if (!outcome.value) throw new Error("Missing yielded result");
			expectSelected(outcome.value);
			expect(outcome.value.report.counters.yields).toBeGreaterThan(0);
			for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
		},
	);

	it.each(["abort", "timeout", "abort-before-timeout"])(
		"refuses publication after a raw-step yield on %s",
		async (failure) => {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			let now = 1_000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = controllerFor();
			const trace = trackSteps();
			const pending = observe(
				discoverResearchSourceHeadings(
					ownedSource(`<style>${"x".repeat(80)}</style><h1>Unreached</h1>`),
					{
						method,
						rawDiscardPolicy,
						maxWindowCodeUnits: 16,
						timeoutMs: 10,
						yieldEveryOperations: 2,
					},
					controller.signal,
				),
			);
			await microtasks();
			expect(pending.settled).toBe(false);
			expect(trace.steps).toHaveLength(1);
			if (failure !== "abort") now = 1_010;
			if (failure !== "timeout") controller.abort(new Error(privateMarker));
			await vi.runOnlyPendingTimersAsync();
			const outcome = await pending.outcome;
			expect(outcome.value).toBeUndefined();
			expectCode(outcome.error, failure === "timeout" ? "timeout" : "aborted");
			expect((outcome.error as Error).message).not.toContain(privateMarker);
			expect(trace.steps).toHaveLength(1);
			for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
		},
	);

	it("does not renew the original deadline across successful discard batches", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		let now = 1_000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const trace = trackSteps();
		const pending = observe(
			selected(`<style>${"x".repeat(120)}</style>`, {
				maxWindowCodeUnits: 16,
				timeoutMs: 10,
				yieldEveryOperations: 2,
			}),
		);
		await microtasks();
		expect(trace.steps).toHaveLength(1);
		now = 1_005;
		await vi.runOnlyPendingTimersAsync();
		expect(pending.settled).toBe(false);
		expect(trace.steps.length).toBeGreaterThan(1);
		now = 1_010;
		await vi.runOnlyPendingTimersAsync();
		const outcome = await pending.outcome;
		expect(outcome.value).toBeUndefined();
		expectCode(outcome.error, "timeout");
		for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
	});
});
