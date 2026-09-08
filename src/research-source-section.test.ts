import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type ResearchSourceSectionExtraction,
	type ResearchSourceSectionSelection,
	discoverResearchSourceHeadings,
	extractResearchSourceSection,
	researchSourceSectionLimits,
	sourceHeadingStructureDiagnostic,
} from "../scripts/research-source-headings.js";
import { admitResearchHtmlSource } from "../scripts/research-source-input.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	HtmlTokenCursor,
	htmlTokenCursorWindowDiagnostic,
} from "./html-token-cursor.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
} from "./resource-limit.js";

const encoder = new TextEncoder();
const target = "<h2>Target</h2>";
const stop = "<h2>Stop</h2>";
const marker = "SYNTHETIC_SECTION_PRIVATE";
const policies = {
	tableScopePolicy: "optional-end-tags-v2",
	headScopePolicy: "explicit-body-boundary-v1",
	headingInlinePolicy: "balanced-source-elements-v1",
	rawDiscardPolicy: "bounded-non-entity-v1",
} as const;
const baseOptions = {
	method: "native-source-section-v1",
	projection: "normalized-source-prose-v1",
} as const;
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
	maxTitleCodeUnits: 256,
	maxHeadingStarts: 256,
	maxSectionCodeUnits: 262_144,
	maxBlocks: 256,
	maxBlockCodeUnits: 4_096,
	maxTextCodeUnits: 32_768,
	maxOutputBytes: 65_536,
	yieldEveryOperations: 256,
	yieldEveryWorkUnits: 32_768,
};
const inlineLimitations = [
	"source-balance-only",
	"attributes-ignored",
	"not-dom-or-visibility",
];
const rawLimitations = [
	"six-non-entity-names-only",
	"title-textarea-legacy-raw",
	"closing-token-still-window-bounded",
	"lexical-not-dom-or-visibility",
];
const sectionLimitations = [
	"lexical-source-projection",
	"not-dom-or-visibility",
	"attributes-ignored",
	"ordinary-container-balance-not-validated",
	"special-context-text-omitted",
	"normalized-not-verbatim",
	"link-labels-only-destinations-omitted",
	"ranges-are-covering-not-character-maps",
];
const controllers: AbortController[] = [];

afterEach(() => {
	for (const controller of controllers.splice(0)) controller.abort();
	if (vi.isFakeTimers()) vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function source(text: string) {
	return {
		finalUrl: "https://example.com/section",
		contentType: "text/html; charset=utf-8",
		body: encoder.encode(text),
	};
}

async function selectionFor(
	input: unknown,
	validPrefix = target,
	ordinal = 1,
): Promise<ResearchSourceSectionSelection> {
	const admitted = admitResearchHtmlSource(
		input,
		4_000_000,
		4_000_000,
		() => {},
	);
	const outline = await discoverResearchSourceHeadings(source(validPrefix), {
		method: "native-source-headings-v1",
		...policies,
	});
	const heading = outline.report.entries[ordinal - 1];
	if (!heading) throw new Error("Missing synthetic selection fixture");
	return structuredClone({
		source: admitted.identity,
		headingPolicies: policies,
		heading: { ordinal, level: heading.level, anchor: heading.anchor },
	});
}

async function section(
	text: string,
	options: Record<string, unknown> = {},
	validPrefix = target,
	ordinal = 1,
) {
	const input = source(text);
	const selection = await selectionFor(input, validPrefix, ordinal);
	return extractResearchSourceSection(input, selection, {
		...baseOptions,
		...options,
	});
}

async function failure(operation: () => unknown, code: ErrorCode) {
	let captured: unknown;
	try {
		await operation();
	} catch (error) {
		captured = error;
	}
	expect(captured).toBeInstanceOf(AgentBrowserError);
	if (!(captured instanceof AgentBrowserError))
		throw new Error("Expected native section rejection");
	expect(captured.code).toBe(code);
	expect(captured.message).not.toContain(marker);
	expect(captured.message).not.toContain("https://example.com");
	for (const key of ["report", "blocks", "prefix", "bodyCapture", "cause"])
		expect(Object.hasOwn(captured, key)).toBe(false);
	return captured;
}

function limit(error: unknown, expected: ResourceLimitDiagnostic) {
	expect(resourceLimitDiagnostic(error)).toEqual(expected);
	expect(Object.isFrozen(resourceLimitDiagnostic(error))).toBe(true);
	expect(resourceLimitDiagnostic({ ...expected })).toBeUndefined();
}

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object")
		throw new Error("Invalid synthetic record path");
	return value as Record<string, unknown>;
}

function atPath(value: unknown, path: readonly string[]) {
	let current = record(value);
	for (const key of path) current = record(current[key]);
	return current;
}

function replaceAt(
	value: unknown,
	path: readonly string[],
	replacement: unknown,
) {
	if (path.length === 0) return replacement;
	const key = path.at(-1);
	if (key === undefined) throw new Error("Invalid synthetic replacement");
	atPath(value, path.slice(0, -1))[key] = replacement;
	return value;
}

function deepFrozen(value: unknown) {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) deepFrozen(child);
}

function traceCursor() {
	const next = HtmlTokenCursor.prototype.next;
	const raw = HtmlTokenCursor.prototype.raw;
	const discard = HtmlTokenCursor.prototype.discardRawStep;
	const cursors = new Set<HtmlTokenCursor>();
	const calls: { method: string; position: number }[] = [];
	const nextSpy = vi
		.spyOn(HtmlTokenCursor.prototype, "next")
		.mockImplementation(function (this: HtmlTokenCursor) {
			cursors.add(this);
			calls.push({ method: "next", position: this.position });
			return Reflect.apply(next, this, []);
		});
	const rawSpy = vi
		.spyOn(HtmlTokenCursor.prototype, "raw")
		.mockImplementation(function (this: HtmlTokenCursor, ...args) {
			cursors.add(this);
			calls.push({ method: "raw", position: this.position });
			return Reflect.apply(raw, this, args);
		});
	const discardSpy = vi
		.spyOn(HtmlTokenCursor.prototype, "discardRawStep")
		.mockImplementation(function (this: HtmlTokenCursor, ...args) {
			cursors.add(this);
			calls.push({ method: "discard", position: this.position });
			return Reflect.apply(discard, this, args);
		});
	return { cursors, calls, nextSpy, rawSpy, discardSpy };
}

function assertResult(result: ResearchSourceSectionExtraction) {
	const report = result.report;
	expect(Object.keys(result).sort()).toEqual([
		"jsonl",
		"outputBytes",
		"report",
	]);
	expect(Object.keys(report).sort()).toEqual(
		[
			"blocks",
			"bodyOmissions",
			"bodyRange",
			"boundary",
			"contentSuccess",
			"counters",
			"headingInlineLimitations",
			"headingPolicies",
			"kind",
			"limitations",
			"limits",
			"method",
			"partial",
			"projection",
			"rawDiscardLimitations",
			"selection",
			"semantics",
			"source",
			"textTruncated",
			"validatedThrough",
		].sort(),
	);
	expect(report).toMatchObject({
		kind: "source-section-prose",
		...baseOptions,
		semantics: "lexical-not-dom",
		partial: true,
		contentSuccess: null,
		textTruncated: false,
	});
	expect(report.headingPolicies).toEqual(policies);
	expect(report.headingInlineLimitations).toEqual(inlineLimitations);
	expect(report.rawDiscardLimitations).toEqual(rawLimitations);
	expect(report.limitations).toEqual(sectionLimitations);
	expect(Object.keys(report.source).sort()).toEqual([
		"bytes",
		"contentType",
		"decoder",
		"kind",
		"reportedFinalUrl",
		"text",
	]);
	expect(Object.keys(report.source.bytes).sort()).toEqual(["length", "sha256"]);
	expect(Object.keys(report.source.decoder).sort()).toEqual([
		"bomConsumed",
		"encoding",
		"policy",
	]);
	expect(Object.keys(report.source.text).sort()).toEqual([
		"codeUnits",
		"coordinates",
		"digestEncoding",
		"sha256",
	]);
	expect(Object.keys(report.headingPolicies).sort()).toEqual(
		Object.keys(policies).sort(),
	);
	expect(Object.keys(report.selection).sort()).toEqual([
		"anchor",
		"level",
		"ordinal",
		"title",
		"titleTruncated",
	]);
	expect(Object.keys(report.selection.anchor).sort()).toEqual([
		"endTag",
		"kind",
		"startTag",
	]);
	for (const range of [
		report.selection.anchor.startTag,
		report.selection.anchor.endTag,
		report.bodyRange,
	])
		expect(Object.keys(range).sort()).toEqual(["end", "start"]);
	expect(report.bodyRange.start).toBe(report.selection.anchor.endTag.end);
	if (report.boundary.kind === "eof") {
		expect(Object.keys(report.boundary)).toEqual(["kind"]);
		expect(report.bodyRange.end).toBe(report.source.text.codeUnits);
		expect(report.validatedThrough).toBe(report.source.text.codeUnits);
	} else {
		expect(Object.keys(report.boundary).sort()).toEqual(["heading", "kind"]);
		expect(report.bodyRange.end).toBe(
			report.boundary.heading.anchor.startTag.start,
		);
		expect(report.validatedThrough).toBe(
			report.boundary.heading.anchor.endTag.end,
		);
		expect(report.boundary.heading.level).toBeLessThanOrEqual(
			report.selection.level,
		);
	}
	expect(Object.keys(report.counters).sort()).toEqual(
		[
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
			"rawDiscard",
			"projectionWorkUnits",
			"headingStarts",
			"retainedTextCodeUnits",
		].sort(),
	);
	expect(Object.keys(report.bodyOmissions).sort()).toEqual([
		"omittedStarts",
		"rawStarts",
		"suppressedHeadingStarts",
		"suppressedStarts",
	]);
	const counters = report.counters;
	expect(Object.keys(counters.rawDiscard).sort()).toEqual([
		"codeUnits",
		"elements",
		"legacyRawCalls",
		"steps",
	]);
	const eof = report.boundary.kind === "eof" ? 1 : 0;
	expect(counters.operations).toBe(
		counters.tokens +
			counters.rawDiscard.steps +
			counters.rawDiscard.legacyRawCalls +
			eof,
	);
	expect(
		Object.values(counters.rawStarts).reduce(
			(total, count) => total + count,
			0,
		),
	).toBe(counters.rawDiscard.elements + counters.rawDiscard.legacyRawCalls);
	expect(counters.rawDiscard.legacyRawCalls).toBe(
		(counters.rawStarts.title ?? 0) + (counters.rawStarts.textarea ?? 0),
	);
	expect(counters.retainedTextCodeUnits).toBe(
		report.blocks.reduce((total, block) => total + block.text.length, 0),
	);
	expect(counters.workUnits).toBeGreaterThanOrEqual(
		counters.projectionWorkUnits,
	);
	for (const value of Object.values(counters)) {
		if (typeof value === "number")
			expect(Number.isSafeInteger(value) && value >= 0).toBe(true);
	}
	for (const block of report.blocks) {
		expect(Object.keys(block).sort()).toEqual(
			block.kind === "text"
				? ["kind", "sourceEnvelope", "text"]
				: ["heading", "kind", "text"],
		);
		if (block.kind === "heading")
			expect(Object.keys(block.heading).sort()).toEqual([
				"anchor",
				"level",
				"ordinal",
			]);
		else {
			expect(Object.keys(block.sourceEnvelope).sort()).toEqual([
				"end",
				"start",
			]);
			expect(block.sourceEnvelope.start).toBeGreaterThanOrEqual(
				report.bodyRange.start,
			);
			expect(block.sourceEnvelope.end).toBeLessThanOrEqual(
				report.bodyRange.end,
			);
		}
	}
	deepFrozen(result.report);
	expect(result.jsonl).toBe(`${JSON.stringify(report)}\n`);
	expect(result.outputBytes).toBe(encoder.encode(result.jsonl).length);
	expect(result.outputBytes).toBeLessThanOrEqual(report.limits.maxOutputBytes);
	return report;
}

describe("section exact admission before native input access", () => {
	it("exports only the exact lowerable section limits and accepts their full defaults", async () => {
		expect(researchSourceSectionLimits).toEqual(canonicalLimits);
		expect(Object.isFrozen(researchSourceSectionLimits)).toBe(true);
		const result = await section(target, canonicalLimits);
		expect(assertResult(result).limits).toEqual(canonicalLimits);
	});

	it.each(
		[
			undefined,
			null,
			[],
			"section",
			{ ...baseOptions, method: undefined },
			{ ...baseOptions, projection: undefined },
			{ method: baseOptions.method },
			{ ...baseOptions, method: "native-source-headings-v1" },
			{ ...baseOptions, projection: new String(baseOptions.projection) },
		].map((options, index) => ({ options, index })),
	)(
		"rejects malformed options case$index before inspecting input",
		async ({ options }) => {
			const input = source(target);
			const selection = await selectionFor(input);
			const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor");
			await failure(
				() => extractResearchSourceSection(input, selection, options),
				"invalid-input",
			);
			expect(descriptors.mock.calls.some(([value]) => value === input)).toBe(
				false,
			);
		},
	);

	it.each([
		"overflow",
		"maxEntries",
		"onText",
		"title",
		"selector",
		"end",
		"resume",
		"authorized",
		"rawDiscardPolicy",
		"headingInlinePolicy",
	])("rejects undeclared option %s", async (key) => {
		await failure(
			() => section(target, { [key]: "not-authority" }),
			"invalid-input",
		);
	});

	it.each(Object.entries(canonicalLimits))(
		"rejects explicit undefined and one-above-ceiling for %s",
		async (key, ceiling) => {
			const input = source(target);
			const selection = await selectionFor(input);
			for (const value of [undefined, ceiling + 1])
				await failure(
					() =>
						extractResearchSourceSection(input, selection, {
							...baseOptions,
							[key]: value,
						}),
					"invalid-input",
				);
		},
	);

	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		-1,
		0,
		1.5,
		"2",
		2n,
		new Number(2),
	])("refuses coercion or invalid numeric block limit %s", async (value) => {
		await failure(() => section(target, { maxBlocks: value }), "invalid-input");
	});

	it("admits zero issues but refuses selected windows below sixteen", async () => {
		assertResult(
			await section(target, { maxIssues: 0, maxWindowCodeUnits: 16 }),
		);
		await failure(
			() => section(target, { maxWindowCodeUnits: 15 }),
			"invalid-input",
		);
	});

	const recordPaths = [
		[],
		["source"],
		["source", "bytes"],
		["source", "decoder"],
		["source", "text"],
		["headingPolicies"],
		["heading"],
		["heading", "anchor"],
		["heading", "anchor", "startTag"],
		["heading", "anchor", "endTag"],
	];
	it.each(
		recordPaths.map((path) => ({ name: path.join(".") || "selection", path })),
	)(
		"refuses proxy/array/accessor/symbol/inherited/undefined data at $name",
		async ({ path }) => {
			const input = source(target);
			const baseline = await selectionFor(input);
			const trap = vi.fn(() => {
				throw new Error(marker);
			});
			for (const mode of [
				"proxy",
				"array",
				"accessor",
				"symbol",
				"inherited",
				"undefined",
				"extra",
				"missing",
			]) {
				const selected = structuredClone(baseline);
				const original = atPath(selected, path);
				const first = Object.keys(original)[0];
				if (first === undefined) throw new Error("Missing synthetic own field");
				let replacement: unknown = original;
				if (mode === "proxy")
					replacement = new Proxy(original, {
						get: trap,
						ownKeys: trap,
						getOwnPropertyDescriptor: trap,
						getPrototypeOf: trap,
					});
				if (mode === "array") replacement = [];
				if (mode === "accessor")
					Object.defineProperty(original, first, { get: trap });
				if (mode === "symbol")
					Object.defineProperty(original, Symbol(marker), { value: true });
				if (mode === "inherited") replacement = Object.create(original);
				if (mode === "undefined") original[first] = undefined;
				if (mode === "extra") original.extra = true;
				if (mode === "missing") delete original[first];
				const selection = replaceAt(selected, path, replacement);
				const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor");
				await failure(
					() => extractResearchSourceSection(input, selection, baseOptions),
					"invalid-input",
				);
				expect(descriptors.mock.calls.some(([value]) => value === input)).toBe(
					false,
				);
				descriptors.mockRestore();
			}
			expect(trap).not.toHaveBeenCalled();
		},
	);

	it("refuses top-level option proxies and revoked selections without invoking traps", async () => {
		const input = source(target);
		const selection = await selectionFor(input);
		const trap = vi.fn(() => {
			throw new Error(marker);
		});
		const options = new Proxy(baseOptions, {
			ownKeys: trap,
			getPrototypeOf: trap,
			get: trap,
		});
		await failure(
			() => extractResearchSourceSection(input, selection, options),
			"invalid-input",
		);
		const revoked = Proxy.revocable(selection, {});
		revoked.revoke();
		await failure(
			() => extractResearchSourceSection(input, revoked.proxy, baseOptions),
			"invalid-input",
		);
		expect(trap).not.toHaveBeenCalled();
	});

	it.each(
		[
			{ path: ["source", "reportedFinalUrl"], value: "x".repeat(8193) },
			{ path: ["source", "contentType"], value: "x".repeat(1025) },
			{ path: ["source", "bytes", "length"], value: 4_000_001 },
			{ path: ["source", "bytes", "sha256"], value: "A".repeat(64) },
			{ path: ["source", "decoder", "encoding"], value: "" },
			{ path: ["source", "decoder", "encoding"], value: "x".repeat(65) },
			{ path: ["source", "decoder", "bomConsumed"], value: "false" },
			{ path: ["source", "text", "codeUnits"], value: -1 },
			{ path: ["source", "text", "sha256"], value: "0".repeat(63) },
			{ path: ["heading", "ordinal"], value: 1.5 },
			{ path: ["heading", "anchor", "endTag", "end"], value: 14.5 },
		].map((entry, index) => ({ ...entry, index })),
	)(
		"rejects out-of-domain scalar case$index before input admission",
		async ({ path, value }) => {
			const input = source(target);
			const selection = await selectionFor(input);
			replaceAt(selection, path, value);
			const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor");
			await failure(
				() => extractResearchSourceSection(input, selection, baseOptions),
				"invalid-input",
			);
			expect(descriptors.mock.calls.some(([value]) => value === input)).toBe(
				false,
			);
		},
	);

	it("accepts recursively reordered frozen nonenumerable null-prototype records", async () => {
		const input = source(`${target}text`);
		const selection = await selectionFor(input);
		const convert = (value: unknown): unknown => {
			if (value === null || typeof value !== "object") return value;
			const converted = Object.create(null);
			for (const [key, child] of Object.entries(value).reverse())
				Object.defineProperty(converted, key, { value: convert(child) });
			return Object.freeze(converted);
		};
		const result = await extractResearchSourceSection(
			input,
			convert(selection),
			convert(baseOptions),
		);
		expect(assertResult(result).blocks.map((block) => block.text)).toEqual([
			"text",
		]);
	});

	it("snapshots all selected state and options before the first await", async () => {
		const input = source(`${target}<p>kept</p>${stop}`);
		const selection = await selectionFor(input);
		const expected = structuredClone(selection);
		const options: Record<string, unknown> = {
			...baseOptions,
			yieldEveryOperations: 1,
		};
		const pending = extractResearchSourceSection(input, selection, options);
		options.method = "changed";
		options.maxBlocks = 0;
		atPath(selection, ["source", "bytes"]).sha256 = "0".repeat(64);
		atPath(selection, ["headingPolicies"]).rawDiscardPolicy = "changed";
		atPath(selection, ["heading", "anchor", "endTag"]).end = 0;
		const report = assertResult(await pending);
		expect(report.source).toEqual(expected.source);
		expect(report.headingPolicies).toEqual(policies);
		expect(report.selection.anchor).toEqual(expected.heading.anchor);
		expect(report.blocks.map((block) => block.text)).toEqual(["kept"]);
	});
});

describe("complete native identity and ordinal authority", () => {
	const mismatches = [
		{ path: ["kind"], value: "other" },
		{ path: ["reportedFinalUrl"], value: "https://example.com/other" },
		{ path: ["contentType"], value: "text/html; charset=UTF-8" },
		{ path: ["bytes", "length"], value: 1 },
		{ path: ["bytes", "sha256"], value: "0".repeat(64) },
		{ path: ["decoder", "policy"], value: "other" },
		{ path: ["decoder", "encoding"], value: "windows-1252" },
		{ path: ["decoder", "bomConsumed"], value: true },
		{ path: ["text", "codeUnits"], value: 1_000 },
		{ path: ["text", "sha256"], value: "1".repeat(64) },
		{ path: ["text", "digestEncoding"], value: "utf-16le" },
		{ path: ["text", "coordinates"], value: "bytes" },
	];
	it.each(
		mismatches.map((entry) => ({ ...entry, name: entry.path.join(".") })),
	)("rejects source identity mismatch $name", async ({ path, value }) => {
		const input = source(`${target}body`);
		const selection = await selectionFor(input);
		replaceAt(selection, ["source", ...path], value);
		await failure(
			() => extractResearchSourceSection(input, selection, baseOptions),
			"invalid-input",
		);
	});

	it.each(Object.keys(policies))(
		"requires exact explicit heading policy %s",
		async (key) => {
			const input = source(target);
			const selection = await selectionFor(input);
			for (const mode of ["missing", "undefined", "wrong"]) {
				const changed = structuredClone(selection);
				const selected = atPath(changed, ["headingPolicies"]);
				if (mode === "missing") delete selected[key];
				else selected[key] = mode === "undefined" ? undefined : "strict";
				await failure(
					() => extractResearchSourceSection(input, changed, baseOptions),
					"invalid-input",
				);
			}
		},
	);

	it.each([
		{ path: ["ordinal"], value: 0 },
		{ path: ["ordinal"], value: 257 },
		{ path: ["level"], value: 7 },
		{ path: ["level"], value: new Number(2) },
		{ path: ["anchor", "kind"], value: "bytes" },
		{ path: ["anchor", "startTag", "start"], value: -1 },
		{ path: ["anchor", "startTag", "end"], value: 3 },
		{ path: ["anchor", "endTag", "start"], value: 3 },
		{ path: ["anchor", "endTag", "end"], value: 99 },
	])("rejects malformed ordinal/anchor $path", async ({ path, value }) => {
		const input = source(target);
		const selection = await selectionFor(input);
		replaceAt(selection, ["heading", ...path], value);
		await failure(
			() => extractResearchSourceSection(input, selection, baseOptions),
			"invalid-input",
		);
	});

	it.each(["ordinal", "level", "start", "startEnd", "endStart", "end"])(
		"rejects structurally valid but unmatched native %s",
		async (field) => {
			const prefix = "xx<h2 >Target</h2 >";
			const input = source(`${prefix}tail`);
			const selection = await selectionFor(input, prefix);
			const heading = atPath(selection, ["heading"]);
			if (field === "ordinal") heading.ordinal = 2;
			if (field === "level") heading.level = 1;
			if (field === "start") atPath(heading, ["anchor", "startTag"]).start = 1;
			if (field === "startEnd") atPath(heading, ["anchor", "startTag"]).end = 6;
			if (field === "endStart")
				atPath(heading, ["anchor", "endTag"]).start = prefix.indexOf("</") - 1;
			if (field === "end")
				atPath(heading, ["anchor", "endTag"]).end = prefix.length + 1;
			await failure(
				() => extractResearchSourceSection(input, selection, baseOptions),
				"not-found",
			);
		},
	);

	it("rejects same-decoded-text different bytes and preserves complete native BOM identity", async () => {
		const input = source(`${target}<p>é😀</p>`);
		const selection = await selectionFor(input);
		const withBom = {
			...input,
			body: new Uint8Array([0xef, 0xbb, 0xbf, ...input.body]),
		};
		const native = admitResearchHtmlSource(
			withBom,
			4_000_000,
			4_000_000,
			() => {},
		);
		expect(native.identity.text.sha256).toBe(selection.source.text.sha256);
		expect(native.identity.bytes.sha256).not.toBe(
			selection.source.bytes.sha256,
		);
		await failure(
			() => extractResearchSourceSection(withBom, selection, baseOptions),
			"invalid-input",
		);
		const result = await extractResearchSourceSection(
			withBom,
			await selectionFor(withBom),
			baseOptions,
		);
		expect(assertResult(result).source).toEqual(native.identity);
		expect(result.report.blocks.map((block) => block.text)).toEqual(["é😀"]);
	});
});

describe("native byte admission without capture or host parser overloads", () => {
	it.each(["utf16-bom", "windows1252", "replacement-utf8"])(
		"uses the native canonical decoder and identity for %s",
		async (encoding) => {
			let input = source(`${target}<p>é😀</p>`);
			let expected = "é😀";
			if (encoding === "utf16-bom")
				input = {
					...input,
					body: Buffer.from(`\ufeff${target}<p>é😀</p>`, "utf16le"),
				};
			if (encoding === "windows1252") {
				input = {
					...input,
					contentType: "text/html; charset=windows-1252",
					body: new Uint8Array([
						...encoder.encode(`${target}<p>`),
						0x80,
						0xe9,
						...encoder.encode("</p>"),
					]),
				};
				expected = "€é";
			}
			if (encoding === "replacement-utf8") {
				input = {
					...input,
					body: new Uint8Array([
						...encoder.encode(`${target}<p>`),
						0xc3,
						0x28,
						...encoder.encode("</p>"),
					]),
				};
				expected = "\ufffd(";
			}
			const native = admitResearchHtmlSource(
				input,
				4_000_000,
				4_000_000,
				() => {},
			);
			const result = await extractResearchSourceSection(
				input,
				await selectionFor(input),
				baseOptions,
			);
			expect(assertResult(result).source).toEqual(native.identity);
			expect(result.report.blocks.map((block) => block.text)).toEqual([
				expected,
			]);
		},
	);

	it("copies only the native subview and ignores shadowed byte getters", async () => {
		const text = `${target}<p>owned</p>`;
		const bytes = encoder.encode(text);
		const backing = new Uint8Array(bytes.length + 4);
		backing.set(bytes, 2);
		const body = backing.subarray(2, 2 + bytes.length);
		const input = { ...source(text), body };
		const selection = await selectionFor(input);
		const expected = structuredClone(selection.source);
		const trap = vi.fn(() => {
			throw new Error(marker);
		});
		for (const key of ["buffer", "byteOffset", "byteLength", "length"])
			Object.defineProperty(body, key, { get: trap });
		const original = HtmlTokenCursor.prototype.next;
		let changed = false;
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			if (!changed) {
				changed = true;
				Uint8Array.prototype.fill.call(body, 0);
			}
			return Reflect.apply(original, this, []);
		});
		const result = await extractResearchSourceSection(
			input,
			selection,
			baseOptions,
		);
		expect(changed).toBe(true);
		expect(assertResult(result).source).toEqual(expected);
		expect(result.report.blocks.map((block) => block.text)).toEqual(["owned"]);
		expect(trap).not.toHaveBeenCalled();
	});

	it.each([
		"string",
		"capture",
		"arraybuffer",
		"dataview",
		"uint16",
		"shared",
		"proxy",
		"detached",
	])("rejects non-native body admission %s", async (kind) => {
		const input = source(target);
		const selection = await selectionFor(input);
		let body: unknown;
		if (kind === "string") body = target;
		if (kind === "capture") body = { encoding: "base64", data: "PHI+" };
		if (kind === "arraybuffer") body = input.body.buffer;
		if (kind === "dataview") body = new DataView(new ArrayBuffer(16));
		if (kind === "uint16") body = new Uint16Array(16);
		if (kind === "shared") body = new Uint8Array(new SharedArrayBuffer(16));
		if (kind === "proxy") body = new Proxy(input.body, {});
		if (kind === "detached") {
			const backing = new ArrayBuffer(16);
			body = new Uint8Array(backing);
			structuredClone(backing, { transfer: [backing] });
		}
		await failure(
			() =>
				extractResearchSourceSection(
					{ ...input, body },
					selection,
					baseOptions,
				),
			"invalid-input",
		);
	});
});

describe("native section boundary and normalized lexical blocks", () => {
	it("validates the entire same-level stop but never reads a malformed later tail", async () => {
		const body = "<p>A <em>B</em> C</p>";
		const text = `${target}${body}${stop}<script>${marker}`;
		const input = source(text);
		const selection = await selectionFor(input);
		const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor");
		const trace = traceCursor();
		const report = assertResult(
			await extractResearchSourceSection(input, selection, baseOptions),
		);
		expect(
			descriptors.mock.calls.filter(
				([value, key]) => value === input && key === "body",
			),
		).toHaveLength(1);
		expect(trace.cursors.size).toBe(1);
		for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
		expect(report.bodyRange).toEqual({
			start: target.length,
			end: target.length + body.length,
		});
		expect(report.validatedThrough).toBe(
			target.length + body.length + stop.length,
		);
		expect(report.boundary).toMatchObject({
			kind: "next-heading",
			heading: { ordinal: 2, level: 2, title: "Stop" },
		});
		expect(
			trace.calls.every((call) => call.position < report.validatedThrough),
		).toBe(true);
		expect(trace.rawSpy).not.toHaveBeenCalled();
		expect(trace.discardSpy).not.toHaveBeenCalled();
		expect(report.blocks).toEqual([
			{
				kind: "text",
				text: "A B C",
				sourceEnvelope: {
					start: target.length + 3,
					end: target.length + body.indexOf("</p>"),
				},
			},
		]);
		expect(report.source.bytes).toEqual(selection.source.bytes);
		expect(report.counters.headingStarts).toBe(2);
	});

	it.each([1, 2])(
		"stops at a fully validated level%i heading",
		async (level) => {
			const ending = `<h${level}>Boundary</h${level}>`;
			const text = `${target}body${ending}<h1><img>`;
			const report = assertResult(await section(text));
			expect(report.bodyRange).toEqual({
				start: target.length,
				end: target.length + 4,
			});
			expect(report.validatedThrough).toBe(target.length + 4 + ending.length);
			expect(report.boundary).toMatchObject({
				kind: "next-heading",
				heading: { level },
			});
			expect(report.blocks.map((block) => block.text)).toEqual(["body"]);
		},
	);

	it("retains full deeper-heading text rather than its truncated metadata title", async () => {
		const deeperText = "x".repeat(300);
		const deeper = `<h3>${deeperText}</h3>`;
		const ending = "<h2>VeryLongBoundary</h2>";
		const report = assertResult(
			await section(`${target}before${deeper}after${ending}`, {
				maxTitleCodeUnits: 4,
			}),
		);
		expect(report.selection).toMatchObject({
			title: "Targ",
			titleTruncated: true,
		});
		expect(report.boundary).toMatchObject({
			kind: "next-heading",
			heading: { title: "Very", titleTruncated: true },
		});
		expect(report.blocks.map((block) => [block.kind, block.text])).toEqual([
			["text", "before"],
			["heading", deeperText],
			["text", "after"],
		]);
		expect(report.blocks[1]).toMatchObject({
			heading: { ordinal: 2, level: 3 },
		});
		expect(report.counters.headingStarts).toBe(3);
		expect(report.textTruncated).toBe(false);
	});

	it("uses balanced heading grammar rather than body separators in deeper headings", async () => {
		const deeper = "<h3>A<div>B</div>C<br>D<wbr>E</h3>";
		const report = assertResult(await section(`${target}${deeper}${stop}`));
		expect(report.blocks.map((block) => [block.kind, block.text])).toEqual([
			["heading", "ABC DE"],
		]);
	});

	it("retains empty deeper headings but drops empty ordinary blocks", async () => {
		const report = assertResult(
			await section(`${target}<p> \t</p><h3> </h3><div></div>${stop}`),
		);
		expect(report.blocks.map((block) => [block.kind, block.text])).toEqual([
			["heading", ""],
		]);
		expect(report.counters.retainedTextCodeUnits).toBe(0);
	});

	it.each(["", " \t\n", "<p></p>"])(
		"admits empty EOF body %j without a fabricated block",
		async (body) => {
			const text = target + body;
			const report = assertResult(await section(text));
			expect(report.blocks).toEqual([]);
			expect(report.boundary).toEqual({ kind: "eof" });
			expect(report.bodyRange).toEqual({
				start: target.length,
				end: text.length,
			});
			expect(report.validatedThrough).toBe(text.length);
		},
	);

	it("does not terminate at an ordinary ancestor close or repair optional/crossed tags", async () => {
		const prefix = `<article>${target}`;
		const report = assertResult(
			await section(
				`${prefix}<p>A<p>B<li>C</p>D</li></article>E${stop}`,
				{},
				prefix,
			),
		);
		expect(report.blocks.map((block) => block.text)).toEqual([
			"A",
			"B",
			"C",
			"D",
			"E",
		]);
		expect(report.boundary.kind).toBe("next-heading");
	});

	it.each(
		"address article aside blockquote dd div dl dt figcaption figure footer header hr li main nav ol p pre section ul".split(
			" ",
		),
	)(
		"flushes fixed ordinary separator %s without adding its tag text",
		async (name) => {
			const report = assertResult(
				await section(`${target}A<${name}>B</${name}>C${stop}`),
			);
			expect(report.blocks.map((block) => block.text)).toEqual(["A", "B", "C"]);
		},
	);

	it("treats br starts as boundaries and wbr/end-br/unknown inline markup as transparent", async () => {
		const report = assertResult(
			await section(
				`${target}A<br>B</br>C<wbr><ordinarylongname>D</ordinarylongname>${stop}`,
			),
		);
		expect(report.blocks.map((block) => block.text)).toEqual(["A", "BCD"]);
	});

	it("projects inert link labels only, ignores attributes/comments/doctype and normalizes pre text", async () => {
		const body = `<p><a href="${marker}">label</a><img alt="${marker}"><span title="${marker}" aria-label="${marker}" hidden style="display:none">visible source</span><!--${marker}--></p><pre>  code\n\t  next </pre><!doctype html>`;
		const result = await section(`${target}${body}${stop}`);
		expect(assertResult(result).blocks.map((block) => block.text)).toEqual([
			"labelvisible source",
			"code next",
		]);
		expect(result.jsonl).not.toContain(marker);
	});

	it("normalizes ECMAScript whitespace/entities and carries whitespace across inline tokens", async () => {
		const report = assertResult(
			await section(
				`${target}<p>\u00a0 A\t<span>\n B</span>&nbsp;C\u2003\ufeff</p>${stop}`,
			),
		);
		expect(report.blocks.map((block) => block.text)).toEqual(["A B C"]);
	});

	it("does not split an entity-produced surrogate pair at the 256-unit projection chunk", async () => {
		const body = `${"x".repeat(255)}&#x1f600;`;
		const report = assertResult(
			await section(`${target}<p>${body}</p>`, {
				maxBlockCodeUnits: 257,
				maxTextCodeUnits: 257,
			}),
		);
		expect(report.blocks[0].text).toBe(`${"x".repeat(255)}😀`);
		expect(report.counters.retainedTextCodeUnits).toBe(257);
		limit(
			await failure(
				() => section(`${target}<p>${body}</p>`, { maxBlockCodeUnits: 256 }),
				"resource-limit",
			),
			{
				kind: "source.section-block-text",
				unit: "code-units",
				limit: 256,
				observed: 257,
			},
		);
	});
});

describe("all native body omission classes and raw modes", () => {
	it.each(["svg", "math", "object", "canvas", "frameset", "audio", "video"])(
		"omits tracked %s text and fake same-level headings",
		async (name) => {
			const report = assertResult(
				await section(
					`${target}A<${name}><h2>${marker}</h2></${name}>B${stop}`,
				),
			);
			expect(report.blocks.map((block) => block.text)).toEqual(["A", "B"]);
			expect(report.bodyOmissions).toEqual({
				rawStarts: {},
				omittedStarts: { [name]: 1 },
				suppressedStarts: {},
				suppressedHeadingStarts: 1,
			});
			expect(report.counters.headingStarts).toBe(2);
		},
	);

	it.each(["embed", "frame", "input", "link", "meta", "source", "track"])(
		"omits native void %s and prevents word joining",
		async (name) => {
			const report = assertResult(
				await section(`${target}A<${name} title="${marker}">B${stop}`),
			);
			expect(report.blocks.map((block) => block.text)).toEqual(["A", "B"]);
			expect(report.bodyOmissions.omittedStarts).toEqual({ [name]: 1 });
		},
	);

	it.each(["head", "template", "select"])(
		"suppresses native %s context in the selected body",
		async (name) => {
			const report = assertResult(
				await section(
					`${target}A<${name}><h1>${marker}</h1></${name}>B${stop}`,
				),
			);
			expect(report.blocks.map((block) => block.text)).toEqual(["A", "B"]);
			expect(report.bodyOmissions).toEqual({
				rawStarts: {},
				omittedStarts: {},
				suppressedStarts: { [name]: 1 },
				suppressedHeadingStarts: 1,
			});
		},
	);

	it("counts every table-family context but never turns cells or suppressed headings into prose", async () => {
		const fake = `<h1>${marker}</h1>`;
		const table = `<table><caption>${fake}</caption><colgroup>${fake}</colgroup><thead><tr><th>${fake}</th></tr></thead><tbody><tr><td>${fake}</td></tr></tbody><tfoot><tr><td>${fake}</td></tr></tfoot></table>`;
		const report = assertResult(await section(`${target}A${table}B${stop}`));
		expect(report.blocks.map((block) => block.text)).toEqual(["A", "B"]);
		expect(report.bodyOmissions).toEqual({
			rawStarts: {},
			omittedStarts: {},
			suppressedHeadingStarts: 5,
			suppressedStarts: {
				table: 1,
				caption: 1,
				colgroup: 1,
				thead: 1,
				tbody: 1,
				tfoot: 1,
				tr: 3,
				th: 1,
				td: 2,
			},
		});
	});

	it("keeps nested body maps separate from prefix maps and whole-walk entity issues", async () => {
		const prefix = `<svg>prefix</svg>&#0;${target}`;
		const body =
			"A<svg><object><h1>fake</h1><script>hidden</script></object></svg>B";
		const report = assertResult(
			await section(`${prefix}${body}${stop}`, {}, prefix),
		);
		expect(report.bodyOmissions).toEqual({
			rawStarts: { script: 1 },
			omittedStarts: { svg: 1, object: 1 },
			suppressedStarts: {},
			suppressedHeadingStarts: 1,
		});
		expect(report.counters.omittedStarts).toEqual({ svg: 2, object: 1 });
		expect(report.counters.entityIssues).toEqual({
			"invalid-numeric-entity": 1,
		});
		expect(report.blocks.map((block) => block.text)).toEqual(["A", "B"]);
	});

	it.each([
		"script",
		"style",
		"xmp",
		"iframe",
		"noembed",
		"noframes",
		"title",
		"textarea",
	])(
		"omits raw %s while retaining its real native mode and closing validation",
		async (name) => {
			const text = `${target}A<${name}>hidden</${name}>B${stop}`;
			const input = source(text);
			const selection = await selectionFor(input);
			const trace = traceCursor();
			const report = assertResult(
				await extractResearchSourceSection(input, selection, baseOptions),
			);
			expect(report.blocks.map((block) => block.text)).toEqual(["A", "B"]);
			expect(report.bodyOmissions.rawStarts).toEqual({ [name]: 1 });
			const legacy = name === "title" || name === "textarea";
			expect(trace.rawSpy.mock.calls).toEqual(legacy ? [[name, true]] : []);
			expect(trace.discardSpy.mock.calls).toEqual(legacy ? [] : [[name]]);
			expect(report.counters.rawDiscard).toEqual({
				steps: legacy ? 0 : 1,
				elements: legacy ? 0 : 1,
				codeUnits: legacy ? 0 : 6,
				legacyRawCalls: legacy ? 1 : 0,
			});
		},
	);

	it.each(["script", "style", "xmp", "iframe", "noembed", "noframes"])(
		"shares one cursor across multiple bounded %s discard windows",
		async (name) => {
			const body =
				name === "script"
					? `<!--<script>nested-->${"x".repeat(40)}`
					: "x".repeat(40);
			const input = source(`${target}A<${name}>${body}</${name}>B${stop}`);
			const selection = await selectionFor(input);
			const trace = traceCursor();
			const report = assertResult(
				await extractResearchSourceSection(input, selection, {
					...baseOptions,
					maxWindowCodeUnits: 16,
				}),
			);
			expect(trace.cursors.size).toBe(1);
			expect(trace.discardSpy.mock.calls.length).toBeGreaterThan(1);
			expect(report.counters.rawDiscard.steps).toBe(
				trace.discardSpy.mock.calls.length,
			);
			expect(report.counters.rawDiscard.codeUnits).toBe(body.length);
			expect(report.blocks.map((block) => block.text)).toEqual(["A", "B"]);
			for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
		},
	);

	it.each(["title", "textarea"])(
		"retains actual legacy %s window refusal without discard attribution",
		async (name) => {
			const input = source(
				`${target}A<${name}>${"x".repeat(40)}</${name}>B${stop}`,
			);
			const selection = await selectionFor(input);
			const trace = traceCursor();
			const error = await failure(
				() =>
					extractResearchSourceSection(input, selection, {
						...baseOptions,
						maxWindowCodeUnits: 16,
					}),
				"resource-limit",
			);
			limit(error, {
				kind: "html.cursor-window",
				unit: "code-units",
				limit: 16,
				observed: 17,
			});
			expect(htmlTokenCursorWindowDiagnostic(error)).toEqual({
				kind: "html-cursor-window",
				operation: "raw",
				position: target.length + 1 + name.length + 2,
				positionSemantics: "last-committed-source-utf16",
			});
			expect(trace.discardSpy).not.toHaveBeenCalled();
			expect(trace.rawSpy.mock.results[0]?.value).toBe(error);
			for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
		},
	);
});

describe("bounded section accounting and error-only overflow", () => {
	it.each([
		{ key: "maxBlockCodeUnits", kind: "source.section-block-text" },
		{ key: "maxTextCodeUnits", kind: "source.section-text" },
	] as const)("admits exact3 and refuses2 for $key", async ({ key, kind }) => {
		const text = `${target}<p>abc</p>`;
		expect(assertResult(await section(text, { [key]: 3 })).blocks[0].text).toBe(
			"abc",
		);
		limit(await failure(() => section(text, { [key]: 2 }), "resource-limit"), {
			kind,
			unit: "code-units",
			limit: 2,
			observed: 3,
		});
	});

	it("counts retained text across blocks and ignores unmaterialized trailing whitespace", async () => {
		const text = `${target}<p>ab \t\n</p><p>c \u00a0</p>`;
		const report = assertResult(
			await section(text, {
				maxBlockCodeUnits: 2,
				maxTextCodeUnits: 3,
				maxBlocks: 2,
			}),
		);
		expect(report.blocks.map((block) => block.text)).toEqual(["ab", "c"]);
		limit(
			await failure(
				() => section(text, { maxTextCodeUnits: 2 }),
				"resource-limit",
			),
			{
				kind: "source.section-text",
				unit: "code-units",
				limit: 2,
				observed: 3,
			},
		);
	});

	it("checks prospective block count before text and current-block limits", async () => {
		const text = `${target}<p>a</p><h3></h3>`;
		assertResult(
			await section(text, {
				maxBlocks: 2,
				maxTextCodeUnits: 1,
				maxBlockCodeUnits: 1,
			}),
		);
		limit(
			await failure(
				() =>
					section(text, {
						maxBlocks: 1,
						maxTextCodeUnits: 1,
						maxBlockCodeUnits: 1,
					}),
				"resource-limit",
			),
			{
				kind: "source.section-blocks",
				unit: "blocks",
				limit: 1,
				observed: 2,
			},
		);
	});

	it("charges section extent through the entire stopping heading, not only bodyRange", async () => {
		const text = `${target}x${stop}`;
		const report = assertResult(
			await section(text, { maxSectionCodeUnits: text.length }),
		);
		expect(report.bodyRange.end).toBe(target.length + 1);
		expect(report.validatedThrough).toBe(text.length);
		limit(
			await failure(
				() => section(text, { maxSectionCodeUnits: text.length - 1 }),
				"resource-limit",
			),
			{
				kind: "source.section-extent",
				unit: "code-units",
				limit: text.length - 1,
				observed: text.length,
			},
		);
	});

	it("starts extent at the target rather than the source prefix", async () => {
		const prefix = `<p>${"x".repeat(80)}</p>${target}`;
		const text = `${prefix}body${stop}`;
		const extent = target.length + 4 + stop.length;
		assertResult(await section(text, { maxSectionCodeUnits: extent }, prefix));
		limit(
			await failure(
				() => section(text, { maxSectionCodeUnits: extent - 1 }, prefix),
				"resource-limit",
			),
			{
				kind: "source.section-extent",
				unit: "code-units",
				limit: extent - 1,
				observed: extent,
			},
		);
	});

	it("includes omitted raw progress in extent rather than counting just retained prose", async () => {
		const text = `${target}<style>${"x".repeat(40)}</style>${stop}`;
		const cap = target.length + "<style>".length + 5;
		const error = await failure(
			() => section(text, { maxWindowCodeUnits: 16, maxSectionCodeUnits: cap }),
			"resource-limit",
		);
		limit(error, {
			kind: "source.section-extent",
			unit: "code-units",
			limit: cap,
			observed: cap + 1,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
	});

	it("counts target, deeper and stopping starts against one heading budget", async () => {
		const text = `${target}<h3>Deep</h3>${stop}`;
		expect(
			assertResult(await section(text, { maxHeadingStarts: 3 })).counters
				.headingStarts,
		).toBe(3);
		limit(
			await failure(
				() => section(text, { maxHeadingStarts: 2 }),
				"resource-limit",
			),
			{
				kind: "source.section-headings",
				unit: "headings",
				limit: 2,
				observed: 3,
			},
		);
	});

	it("admits target ordinal256 at EOF but never admits stopping heading257", async () => {
		const prefix = "<h2>T</h2>".repeat(256);
		const report = assertResult(await section(prefix, {}, prefix, 256));
		expect(report.selection.ordinal).toBe(256);
		expect(report.counters.headingStarts).toBe(256);
		expect(report.boundary).toEqual({ kind: "eof" });
		limit(
			await failure(
				() => section(prefix + stop, {}, prefix, 256),
				"resource-limit",
			),
			{
				kind: "source.section-headings",
				unit: "headings",
				limit: 256,
				observed: 257,
			},
		);
		await failure(
			() => section(prefix, { maxHeadingStarts: 255 }, prefix, 256),
			"invalid-input",
		);
	});

	it("preserves exact native byte and decoded-unit admission boundaries", async () => {
		const text = `${target}<p>😀</p>`;
		const byteLength = encoder.encode(text).length;
		assertResult(
			await section(text, {
				maxInputBytes: byteLength,
				maxSourceCodeUnits: text.length,
			}),
		);
		limit(
			await failure(
				() => section(text, { maxInputBytes: byteLength - 1 }),
				"resource-limit",
			),
			{
				kind: "source.input",
				unit: "bytes",
				limit: byteLength - 1,
				observed: byteLength,
			},
		);
		limit(
			await failure(
				() => section(text, { maxSourceCodeUnits: text.length - 1 }),
				"resource-limit",
			),
			{
				kind: "source.decoded",
				unit: "code-units",
				limit: text.length - 1,
				observed: text.length,
			},
		);
	});

	it("shares exact operation and work quotas without resetting them for section projection", async () => {
		const text = `${target}<p>abc</p>`;
		const baseline = assertResult(await section(text));
		expect(baseline.counters.projectionWorkUnits).toBeGreaterThan(0);
		const work = baseline.counters.workUnits;
		const operations = baseline.counters.operations;
		assertResult(
			await section(text, { maxWorkUnits: work, maxOperations: operations }),
		);
		limit(
			await failure(
				() => section(text, { maxWorkUnits: work - 1 }),
				"resource-limit",
			),
			{
				kind: "source.section-work",
				unit: "code-units",
				limit: work - 1,
				observed: work,
			},
		);
		limit(
			await failure(
				() => section(text, { maxOperations: operations - 1 }),
				"resource-limit",
			),
			{
				kind: "html.cursor-operations",
				unit: "operations",
				limit: operations - 1,
				observed: operations,
			},
		);
	});

	it("preserves native issue and tracked-depth quota identities", async () => {
		const text = `${target}<p>&#0;</p>`;
		const report = assertResult(await section(text, { maxIssues: 1 }));
		expect(report.counters.issueAttempts).toBe(1);
		expect(report.blocks[0].text).toBe("\ufffd");
		limit(
			await failure(() => section(text, { maxIssues: 0 }), "resource-limit"),
			{
				kind: "html.issues",
				unit: "issues",
				limit: 0,
				observed: 1,
			},
		);
		limit(
			await failure(
				() =>
					section(`${target}<template><svg></svg></template>`, {
						maxTrackedDepth: 1,
					}),
				"resource-limit",
			),
			{
				kind: "source.headings-depth",
				unit: "levels",
				limit: 1,
				observed: 2,
			},
		);
	});

	it("enforces exact self-describing escaped JSON bytes without clipping", async () => {
		const text = `${target}<p>Quote" \\ \u0001 😀</p>`;
		const baseline = await section(text);
		let cap = baseline.outputBytes;
		for (let attempt = 0; attempt < 8; attempt++) {
			cap = encoder.encode(
				`${JSON.stringify({ ...baseline.report, limits: { ...baseline.report.limits, maxOutputBytes: cap } })}\n`,
			).length;
		}
		expect(String(cap - 1).length).toBe(String(cap).length);
		const exact = await section(text, { maxOutputBytes: cap });
		assertResult(exact);
		expect(exact.outputBytes).toBe(cap);
		expect(exact.jsonl).toContain("\\u0001");
		limit(
			await failure(
				() => section(text, { maxOutputBytes: cap - 1 }),
				"resource-limit",
			),
			{
				kind: "source.section-output",
				unit: "bytes",
				limit: cap - 1,
				observed: cap,
			},
		);
	});
});

describe("native failure withholding, cancellation and unchanged discovery", () => {
	it("retains a genuine next-window diagnostic for an oversized raw closing token", async () => {
		const input = source(
			`${target}<p>${marker}</p><style>${"x".repeat(40)}</style ${" ".repeat(40)}>`,
		);
		const selection = await selectionFor(input);
		const trace = traceCursor();
		const error = await failure(
			() =>
				extractResearchSourceSection(input, selection, {
					...baseOptions,
					maxWindowCodeUnits: 32,
				}),
			"resource-limit",
		);
		limit(error, {
			kind: "html.cursor-window",
			unit: "code-units",
			limit: 32,
			observed: 33,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toEqual({
			kind: "html-cursor-window",
			operation: "next",
			position:
				target.length +
				"<p>".length +
				marker.length +
				"</p><style>".length +
				40,
			positionSemantics: "last-committed-source-utf16",
		});
		expect(trace.nextSpy.mock.results.at(-1)?.value).toBe(error);
		for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
	});

	it("keeps native stopping-heading extent refusal distinct from section overflow", async () => {
		const text = `${target}body<h2>${"x".repeat(20)}</h2>`;
		const error = await failure(
			() => section(text, { maxHeadingCodeUnits: target.length }),
			"resource-limit",
		);
		limit(error, {
			kind: "source.heading-extent",
			unit: "code-units",
			limit: target.length,
			observed: 24,
		});
		expect(htmlTokenCursorWindowDiagnostic(error)).toBeUndefined();
		await failure(
			() => section(target, { maxHeadingCodeUnits: target.length - 1 }),
			"invalid-input",
		);
	});

	it.each([
		{ tail: "<h2><div></h2>", reason: "heading-close-structure" },
		{ tail: "<h3>unfinished", reason: "unclosed-context" },
		{ tail: "<template>unfinished", reason: "unclosed-context" },
		{ tail: "<script>unfinished", reason: "tokenizer-issue" },
		{ tail: "</table>", reason: "scope-close-structure" },
		{ tail: "<h3><img>", reason: "heading-inline-structure" },
		{ tail: "<h2 a a>", reason: "tokenizer-issue" },
		{ tail: "<style>x</style extra=x>", reason: "raw-close-structure" },
	])(
		"withholds useful prose after native $reason from $tail",
		async ({ tail, reason }) => {
			const input = source(`${target}<p>${marker}</p>${tail}`);
			const selection = await selectionFor(input);
			const trace = traceCursor();
			const error = await failure(
				() => extractResearchSourceSection(input, selection, baseOptions),
				"unsupported",
			);
			expect(sourceHeadingStructureDiagnostic(error)?.reason).toBe(reason);
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
			for (const cursor of trace.cursors) expect(cursor.closed).toBe(true);
		},
	);

	it("preserves an earlier structural failure ahead of a missing ordinal", async () => {
		const input = source(`${target}</template>`);
		const selection = await selectionFor(input);
		atPath(selection, ["heading"]).ordinal = 2;
		const error = await failure(
			() => extractResearchSourceSection(input, selection, baseOptions),
			"unsupported",
		);
		expect(sourceHeadingStructureDiagnostic(error)?.reason).toBe(
			"scope-close-structure",
		);
	});

	it("checks already-aborted admission before accessing native input", async () => {
		const input = source(target);
		const selection = await selectionFor(input);
		const controller = new AbortController();
		controllers.push(controller);
		controller.abort(new Error(marker));
		const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor");
		await failure(
			() =>
				extractResearchSourceSection(
					input,
					selection,
					baseOptions,
					controller.signal,
				),
			"aborted",
		);
		expect(descriptors.mock.calls.some(([value]) => value === input)).toBe(
			false,
		);
	});

	it("rejects late abort after a real successful raw step and closes the shared cursor", async () => {
		const input = source(`${target}<p>${marker}</p><style>hidden</style>`);
		const selection = await selectionFor(input);
		const controller = new AbortController();
		controllers.push(controller);
		const original = HtmlTokenCursor.prototype.discardRawStep;
		const cursors = new Set<HtmlTokenCursor>();
		vi.spyOn(HtmlTokenCursor.prototype, "discardRawStep").mockImplementation(
			function (this: HtmlTokenCursor, ...args) {
				cursors.add(this);
				const result = Reflect.apply(original, this, args);
				controller.abort(new Error(marker));
				return result;
			},
		);
		await failure(
			() =>
				extractResearchSourceSection(
					input,
					selection,
					baseOptions,
					controller.signal,
				),
			"aborted",
		);
		expect(cursors.size).toBe(1);
		for (const cursor of cursors) expect(cursor.closed).toBe(true);
	});

	it("checks clock-only expiry after the actual EOF operation before publication", async () => {
		const input = source(`${target}<p>${marker}</p>`);
		const selection = await selectionFor(input);
		let now = 1_000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const original = HtmlTokenCursor.prototype.next;
		const cursors = new Set<HtmlTokenCursor>();
		vi.spyOn(HtmlTokenCursor.prototype, "next").mockImplementation(function (
			this: HtmlTokenCursor,
		) {
			cursors.add(this);
			const token = Reflect.apply(original, this, []);
			if (token === undefined) now = 1_010;
			return token;
		});
		await failure(
			() =>
				extractResearchSourceSection(input, selection, {
					...baseOptions,
					timeoutMs: 10,
				}),
			"timeout",
		);
		for (const cursor of cursors) expect(cursor.closed).toBe(true);
	});

	it.each(["aborted", "timeout"] as const)(
		"cooperates with the shared yield and rejects late %s",
		async (code) => {
			const input = source(`${target}<p>${"x".repeat(1024)}</p>`);
			const selection = await selectionFor(input);
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			let now = 1_000;
			vi.spyOn(performance, "now").mockImplementation(() => now);
			const controller = new AbortController();
			controllers.push(controller);
			let settled = false;
			const pending = failure(
				() =>
					extractResearchSourceSection(
						input,
						selection,
						{ ...baseOptions, timeoutMs: 10, yieldEveryWorkUnits: 1 },
						controller.signal,
					),
				code,
			).then((error) => {
				settled = true;
				return error;
			});
			for (let turn = 0; turn < 16; turn++) await Promise.resolve();
			expect(settled).toBe(false);
			expect(vi.getTimerCount()).toBeGreaterThan(0);
			if (code === "aborted") controller.abort(new Error(marker));
			else now = 1_010;
			await vi.runOnlyPendingTimersAsync();
			await pending;
		},
	);

	it("preserves exact inactive discovery calls, counters and absent section metadata", async () => {
		const trace = traceCursor();
		const result = await discoverResearchSourceHeadings(source("<h1>A</h1>"), {
			method: "native-source-headings-v1",
		});
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
		expect(trace.calls).toEqual(
			[0, 4, 5, 10].map((position) => ({ method: "next", position })),
		);
		expect(trace.rawSpy).not.toHaveBeenCalled();
		expect(trace.discardSpy).not.toHaveBeenCalled();
		for (const key of [
			"blocks",
			"bodyRange",
			"projection",
			"projectionWorkUnits",
			"headingStarts",
		])
			expect(result.jsonl).not.toContain(`"${key}":`);
	});

	it.each([false, true])(
		"preserves inactive discovery native raw mode selected=%s",
		async (selected) => {
			const trace = traceCursor();
			const result = await discoverResearchSourceHeadings(
				source("<script>x</script><h1>A</h1>"),
				{
					method: "native-source-headings-v1",
					...(selected ? { rawDiscardPolicy: "bounded-non-entity-v1" } : {}),
				},
			);
			expect(result.report.entries.map((entry) => entry.title)).toEqual(["A"]);
			expect(result.report.counters.tokens).toBe(5);
			expect(result.report.counters.operations).toBe(7);
			expect(trace.nextSpy).toHaveBeenCalledTimes(6);
			expect(trace.rawSpy.mock.calls).toEqual(
				selected ? [] : [["script", false]],
			);
			expect(trace.discardSpy.mock.calls).toEqual(selected ? [["script"]] : []);
			expect(Object.hasOwn(result.report.counters, "projectionWorkUnits")).toBe(
				false,
			);
		},
	);
});
