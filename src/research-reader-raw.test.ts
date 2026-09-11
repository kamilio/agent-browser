import { afterEach, expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { extractDocument } from "./extraction.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import type { NetworkResponse } from "./network.js";
import { researchLongDocumentAdmission } from "./research-admission.js";
import {
	loadResearchDocument,
	researchReaderRawLimits,
	sanitizeResearchHtml,
} from "./research-loader.js";
import {
	type ResearchReaderRawPolicy,
	researchReaderInfo,
	setResearchReaderInfo,
	validateResearchReaderRawPolicy,
} from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const rawPolicy: ResearchReaderRawPolicy = "separate-omitted-raw-v1";
const rawNames = ["script", "style", "iframe", "noembed", "noframes"] as const;

function context(): DocumentLoaderContext {
	return {
		tabId: "synthetic-reader-raw",
		signal: new AbortController().signal,
		limits: { ...researchLongDocumentAdmission.document },
	};
}

function response(source: string, type = "text/html"): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: "https://reader.invalid/raw-policy",
		status: 200,
		headers: { "content-type": [`${type}; charset=utf-8`] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected failure");
}

function expectTextLimit(source: string, observed: number) {
	const error = failure(() =>
		sanitizeResearchHtml(
			source,
			{ maxTextCodeUnits: observed - 1 },
			undefined,
			"long-v1",
			rawPolicy,
		),
	);
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "reader.text",
		unit: "code-units",
		limit: observed - 1,
		observed,
	});
	expect(
		sanitizeResearchHtml(
			source,
			{ maxTextCodeUnits: observed },
			undefined,
			"long-v1",
			rawPolicy,
		).report.textCodeUnits,
	).toBe(observed);
}

afterEach(() => vi.restoreAllMocks());

it("leaves loader and extraction metadata unchanged without the raw policy", () => {
	const source = "<style>abc</style><p>Readable</p>";
	const legacy = sanitizeResearchHtml(source);
	const tree = loadResearchDocument(response(source), context(), "long-v1");
	try {
		const report = researchReaderInfo(tree);
		expect(report).toEqual({ ...legacy.report, encoding: "utf-8" });
		expect(report).not.toHaveProperty("rawTextPolicy");
		expect(report).not.toHaveProperty("omittedRaw");
		expect(extractDocument(tree).reader).toEqual(report);
	} finally {
		tree.close();
	}
});

it.each([
	{
		source: "<script>abc</script><p>x</p>",
		limits: { maxOutputCodeUnits: 7 },
		kind: "reader.output",
		limit: 7,
		observed: 8,
	},
	{
		source: "<script>abc</script>",
		limits: { maxTokens: 1 },
		kind: "reader.tokens",
		limit: 1,
		observed: 2,
	},
	{
		source: "<template><script>abc</script></template>",
		limits: { maxDepth: 1 },
		kind: "reader.depth",
		limit: 1,
		observed: 2,
	},
])(
	"retains the $kind guard after raw-policy selection",
	({ source, limits, kind, limit, observed }) => {
		const error = failure(() =>
			sanitizeResearchHtml(source, limits, undefined, "long-v1", rawPolicy),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind,
			limit,
			observed,
		});
	},
);

it("exposes the fixed raw limits and validates opt-in without changing the default", () => {
	expect(researchReaderRawLimits).toEqual({
		maxWorkUnits: 32_000_000,
		maxWindowCodeUnits: 65_536,
	});
	expect(Object.isFrozen(researchReaderRawLimits)).toBe(true);
	expect(validateResearchReaderRawPolicy(undefined)).toBeUndefined();
	expect(validateResearchReaderRawPolicy(rawPolicy)).toBe(rawPolicy);
});

it("admits a real greater-than-2MB omitted script under long-v1 only with the policy", () => {
	const payload = "x".repeat(2_100_000);
	const source = `<script>${payload}</script><p>Retained</p>`;
	const legacyError = failure(() =>
		sanitizeResearchHtml(source, {}, undefined, "long-v1"),
	);
	expect(resourceLimitDiagnostic(legacyError)).toEqual({
		kind: "reader.text",
		unit: "code-units",
		limit: 2_000_000,
		observed: payload.length,
	});
	const selected = sanitizeResearchHtml(
		source,
		{},
		undefined,
		"long-v1",
		rawPolicy,
	);
	expect(selected.html).toBe("<p>Retained</p>");
	expect(selected.report.textCodeUnits).toBe(8);
	expect(selected.report.sourceCodeUnits).toBe(source.length);
	expect(selected.report.omittedRaw).toMatchObject({
		codeUnits: payload.length,
		elements: 1,
		...researchReaderRawLimits,
	});
	expect(selected.report.omittedRaw?.steps).toBeGreaterThan(1);
	expect(selected.report.omittedRaw?.workUnits).toBeGreaterThan(payload.length);
	expect(selected.report.omittedRaw?.workUnits).toBeLessThanOrEqual(
		researchReaderRawLimits.maxWorkUnits,
	);
	const tree = loadResearchDocument(
		response(source),
		context(),
		"long-v1",
		rawPolicy,
	);
	try {
		expect(tree.textContent(tree.root)).toBe("Retained");
		expect(researchReaderInfo(tree)).toEqual({
			...selected.report,
			encoding: "utf-8",
		});
	} finally {
		tree.close();
	}
});

it.each(rawNames)(
	"preserves small %s output while separating only raw payload accounting",
	(name) => {
		const payload = "a😀&amp;<p>not markup</p>";
		const source = `<${name}>${payload}</${name}><p>A&amp;😀</p>`;
		const legacy = sanitizeResearchHtml(source);
		const selected = sanitizeResearchHtml(
			source,
			{},
			undefined,
			undefined,
			rawPolicy,
		);
		expect(selected.html).toBe(legacy.html);
		expect(selected.html).toBe("<p>A&amp;😀</p>");
		expect(selected.report).toMatchObject({
			rawTextPolicy: rawPolicy,
			textCodeUnits: 4,
			omittedRaw: { codeUnits: payload.length, elements: 1 },
		});
		const { rawTextPolicy, omittedRaw, ...legacyFields } = selected.report;
		expect(rawTextPolicy).toBe(rawPolicy);
		expect(omittedRaw).toBeDefined();
		expect(legacyFields).toEqual({
			...legacy.report,
			textCodeUnits: legacy.report.textCodeUnits - payload.length,
		});
		expect(legacy.report).not.toHaveProperty("rawTextPolicy");
		expect(legacy.report).not.toHaveProperty("omittedRaw");
		expect(
			sanitizeResearchHtml(source, {}, undefined, undefined, undefined),
		).toEqual(legacy);
	},
);

it.each([undefined, "long-v1"] as const)(
	"retains selected source limits for profile %s",
	(profile) => {
		const limit = profile === "long-v1" ? 4_000_000 : 2_000_000;
		const source = `<script>${"x".repeat(limit - 16)}</script>`;
		expect(source.length).toBe(limit + 1);
		const discard = vi.spyOn(HtmlTokenizer.prototype, "discardRaw");
		const error = failure(() =>
			sanitizeResearchHtml(source, {}, undefined, profile, rawPolicy),
		);
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "reader.source",
			unit: "code-units",
			limit,
			observed: limit + 1,
		});
		expect(discard).not.toHaveBeenCalled();
		const loaderError = failure(() => {
			const tree = loadResearchDocument(
				response(source),
				context(),
				profile,
				rawPolicy,
			);
			tree.close();
		});
		expect(resourceLimitDiagnostic(loaderError)).toEqual({
			kind: "reader.decoded",
			unit: "code-units",
			limit,
			observed: limit + 1,
		});
		expect(discard).not.toHaveBeenCalled();
	},
);

it("accepts equality at a caller source bound, without exempting discarded input", () => {
	const source = "<script>abc</script>";
	const sanitize = (maxSourceCodeUnits: number) =>
		sanitizeResearchHtml(
			source,
			{ maxSourceCodeUnits },
			undefined,
			"long-v1",
			rawPolicy,
		);
	expect(sanitize(source.length).report.sourceCodeUnits).toBe(source.length);
	expect(
		resourceLimitDiagnostic(failure(() => sanitize(source.length - 1))),
	).toEqual({
		kind: "reader.source",
		unit: "code-units",
		limit: source.length - 1,
		observed: source.length,
	});
});

it.each([
	["<title>&amp;😀</title>", 3],
	["<textarea>&amp;😀</textarea>", 7],
	["<template><title>&amp;😀</title></template>", 7],
	["<template><textarea>&amp;😀</textarea></template>", 7],
	["<template>&amp;😀</template>", 3],
	["<svg>&amp;😀</svg>", 3],
	["<object><p>&amp;😀</p></object>", 3],
	["<xmp>&amp;😀</xmp>", 7],
	["<plaintext>&amp;😀", 7],
] as const)(
	"retains legacy text limits and decoding for %s",
	(source, observed) => {
		expectTextLimit(source, observed);
		const legacy = sanitizeResearchHtml(source);
		const selected = sanitizeResearchHtml(
			source,
			{},
			undefined,
			undefined,
			rawPolicy,
		);
		expect(selected.html).toBe(legacy.html);
		expect(selected.report.textCodeUnits).toBe(legacy.report.textCodeUnits);
		expect(selected.report.omittedRaw).toMatchObject({
			codeUnits: 0,
			workUnits: 0,
			steps: 0,
			elements: 0,
		});
	},
);

it("aggregates nested omitted raw including xmp, but still charges ordinary omitted text", () => {
	const payload = "&amp;😀";
	const names = [...rawNames, "xmp"] as const;
	const source = `<template><div>a${names.map((name) => `<${name}>${payload}</${name}>`).join("")}b</div></template><p>Visible</p>`;
	const selected = sanitizeResearchHtml(
		source,
		{ maxTextCodeUnits: 9 },
		undefined,
		"long-v1",
		rawPolicy,
	);
	expect(selected.html).toBe("<p>Visible</p>");
	expect(selected.report.textCodeUnits).toBe(9);
	expect(selected.report.omittedSubtrees).toEqual({ template: 1 });
	expect(selected.report.omittedRaw).toMatchObject({
		codeUnits: payload.length * names.length,
		elements: names.length,
	});
	expect(
		resourceLimitDiagnostic(
			failure(() =>
				sanitizeResearchHtml(
					source,
					{ maxTextCodeUnits: 8 },
					undefined,
					"long-v1",
					rawPolicy,
				),
			),
		),
	).toMatchObject({ kind: "reader.text", limit: 8, observed: 9 });
});

it("reports exact UTF-16 payload and tokenizer debit/step totals without charging following content", () => {
	const original = HtmlTokenizer.prototype.discardRaw;
	let workUnits = 0;
	let steps = 0;
	const discard = vi
		.spyOn(HtmlTokenizer.prototype, "discardRaw")
		.mockImplementation(function (this: HtmlTokenizer, name, debit) {
			const result = original.call(this, name, (units) => {
				workUnits += units;
				debit(units);
			});
			steps += result.steps;
			return result;
		});
	const source =
		"<style>a😀&amp;</style><p>&amp;😀</p><script><!--<script>inner</script>--></script>";
	const selected = sanitizeResearchHtml(
		source,
		{},
		undefined,
		undefined,
		rawPolicy,
	);
	expect(selected.html).toBe("<p>&amp;😀</p>");
	expect(selected.report).toMatchObject({
		partial: true,
		textCodeUnits: 3,
		sourceCodeUnits: source.length,
	});
	expect(selected.report.outputCodeUnits).toBe(selected.html.length);
	expect(selected.report.omittedRaw).toEqual({
		codeUnits: "a😀&amp;".length + "<!--<script>inner</script>-->".length,
		workUnits,
		steps,
		elements: 2,
		...researchReaderRawLimits,
	});
	expect(workUnits).toBeGreaterThan(0);
	expect(steps).toBeGreaterThanOrEqual(2);
	expect(discard.mock.calls.map(([name]) => name)).toEqual(["style", "script"]);
});

it.each([0, 1])(
	"enforces a single aggregate omitted-work cap across raw calls (excess %s)",
	(excess) => {
		const original = HtmlTokenizer.prototype.discardRaw;
		let calls = 0;
		const limit = researchReaderRawLimits.maxWorkUnits;
		const discard = vi
			.spyOn(HtmlTokenizer.prototype, "discardRaw")
			.mockImplementation(function (this: HtmlTokenizer, name, debit) {
				calls++;
				debit(limit / 2 + (calls === 2 ? excess : 0));
				return original.call(this, name, () => {});
			});
		const source =
			"<script>a</script><template><style>b</style></template><p>After</p>";
		const sanitize = () =>
			sanitizeResearchHtml(source, {}, undefined, "long-v1", rawPolicy);
		if (excess) {
			const error = failure(sanitize);
			expect(error).toMatchObject({ code: "resource-limit" });
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "reader.omitted-work",
				unit: "code-units",
				limit,
				observed: limit + excess,
			});
		} else {
			const selected = sanitize();
			expect(selected.html).toBe("<p>After</p>");
			expect(selected.report.omittedRaw).toMatchObject({
				workUnits: limit,
				codeUnits: 2,
				elements: 2,
			});
		}
		expect(discard).toHaveBeenCalledTimes(2);
		discard.mockRestore();
		expect(sanitize().report.omittedRaw?.workUnits).toBeLessThan(limit);
	},
);

it("aborts during raw debits without initializing a document or leaking state into the next load", () => {
	const controller = new AbortController();
	const initializeDocument = vi.fn();
	const original = HtmlTokenizer.prototype.discardRaw;
	let debits = 0;
	const discard = vi
		.spyOn(HtmlTokenizer.prototype, "discardRaw")
		.mockImplementation(function (this: HtmlTokenizer, name, debit) {
			return original.call(this, name, (units) => {
				if (++debits === 3) controller.abort();
				debit(units);
			});
		});
	const input = response("<script>abc</script><p>After</p>");
	const error = failure(() => {
		const tree = loadResearchDocument(
			input,
			{ ...context(), signal: controller.signal, initializeDocument },
			"long-v1",
			rawPolicy,
		);
		tree.close();
	});
	expect(error).toMatchObject({ code: "aborted" });
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	expect(debits).toBe(3);
	expect(initializeDocument).not.toHaveBeenCalled();
	discard.mockRestore();
	const tree = loadResearchDocument(input, context(), "long-v1", rawPolicy);
	try {
		expect(tree.textContent(tree.root)).toBe("After");
		expect(researchReaderInfo(tree)?.omittedRaw).toMatchObject({
			elements: 1,
			codeUnits: 3,
		});
	} finally {
		tree.close();
	}
	expect(researchReaderInfo(tree)).toBeUndefined();
});

it("rejects pre-aborted loads without accessing their response", () => {
	const controller = new AbortController();
	controller.abort();
	const read = vi.fn(() => {
		throw new Error("Must not read aborted input");
	});
	const input = new Proxy({}, { get: read }) as NetworkResponse;
	expect(
		failure(() =>
			loadResearchDocument(
				input,
				{ ...context(), signal: controller.signal },
				"long-v1",
				rawPolicy,
			),
		),
	).toMatchObject({ code: "aborted" });
	expect(read).not.toHaveBeenCalled();
});

it.each([
	"<script>",
	"<script>unterminated",
	"<script>abc</script",
	"<script>abc</script trailing='",
	"<script><!--<script>inner</script>",
	"<style>abc</style",
	"<iframe>abc</iframe",
	"<template><script>abc</script></object>",
	"<template><xmp>abc</xmp>",
	"<script>abc</script><!--",
])("continues rejecting malformed raw or closing syntax: %s", (source) => {
	for (const selected of [undefined, rawPolicy]) {
		const error = failure(() =>
			sanitizeResearchHtml(source, {}, undefined, "long-v1", selected),
		);
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect(error).toMatchObject({ code: "unsupported" });
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	}
});

it.each(["", "<p>Plain</p>", "<template>Ordinary</template>"])(
	"includes zero selected raw metadata when raw elements are absent: %s",
	(source) => {
		const selected = sanitizeResearchHtml(
			source,
			{},
			undefined,
			undefined,
			rawPolicy,
		);
		expect(selected.report.rawTextPolicy).toBe(rawPolicy);
		expect(selected.report.omittedRaw).toEqual({
			codeUnits: 0,
			workUnits: 0,
			steps: 0,
			elements: 0,
			...researchReaderRawLimits,
		});
		expect(Object.isFrozen(selected.report)).toBe(true);
		expect(Object.isFrozen(selected.report.omittedRaw)).toBe(true);
		expect(Object.isFrozen(selected.report.omittedSubtrees)).toBe(true);
	},
);

it("counts empty raw elements separately from zero discarded code units", () => {
	const source = rawNames.map((name) => `<${name}></${name}>`).join("");
	const selected = sanitizeResearchHtml(
		source,
		{},
		undefined,
		undefined,
		rawPolicy,
	);
	expect(selected.html).toBe("");
	expect(selected.report.textCodeUnits).toBe(0);
	expect(selected.report.omittedRaw).toMatchObject({
		codeUnits: 0,
		elements: rawNames.length,
	});
	expect(selected.report.omittedRaw?.steps).toBeGreaterThanOrEqual(
		rawNames.length,
	);
	expect(selected.report.omittedRaw?.workUnits).toBeGreaterThan(0);
});

it.each(["text/html", "text/plain"])(
	"keeps selected report metadata immutable through loading and extraction of %s",
	(type) => {
		const source =
			type === "text/html" ? "<style>abc</style><p>Readable</p>" : "Readable";
		const tree = loadResearchDocument(
			response(source, type),
			context(),
			undefined,
			rawPolicy,
		);
		try {
			const report = researchReaderInfo(tree);
			if (!report?.omittedRaw)
				throw new Error("Missing selected reader metadata");
			expect(Object.isFrozen(report)).toBe(true);
			expect(Object.isFrozen(report.omittedRaw)).toBe(true);
			expect(Object.isFrozen(report.omittedSubtrees)).toBe(true);
			expect(report.omittedRaw.codeUnits).toBe(type === "text/html" ? 3 : 0);
			for (const format of ["markdown", "json"] as const) {
				const extracted = extractDocument(tree, { format });
				expect(extracted.reader).toEqual(report);
				expect(extracted.partial).toBe(true);
				expect(Object.isFrozen(extracted.reader?.omittedRaw)).toBe(true);
			}
			const mutable = {
				...report,
				omittedSubtrees: { ...report.omittedSubtrees },
				omittedRaw: { ...report.omittedRaw },
			};
			setResearchReaderInfo(tree, mutable);
			const cloned = researchReaderInfo(tree);
			expect(cloned).toEqual(report);
			expect(cloned).not.toBe(mutable);
			expect(cloned?.omittedRaw).not.toBe(mutable.omittedRaw);
			mutable.omittedRaw.codeUnits = 999;
			mutable.omittedSubtrees.script = 999;
			expect(cloned).toEqual(report);
			expect(Object.isFrozen(cloned?.omittedRaw)).toBe(true);
		} finally {
			tree.close();
		}
	},
);

it("rejects invalid policies without coercion or accessing source/response", () => {
	const coerce = vi.fn(() => rawPolicy);
	const invalid: unknown[] = [
		null,
		false,
		true,
		0,
		1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		1n,
		Symbol("invalid-policy"),
		"",
		"default",
		"long-v1",
		"separate-omitted-raw-v2",
		"separate-omitted-raw-v1 ",
		[],
		{},
		{ [Symbol.toPrimitive]: coerce },
	];
	const read = vi.fn(() => {
		throw new Error("Invalid policy must not access input");
	});
	const source = new Proxy({}, { get: read }) as unknown as string;
	const input = new Proxy({}, { get: read }) as NetworkResponse;
	for (const value of invalid) {
		const selected = value as ResearchReaderRawPolicy;
		for (const action of [
			() => validateResearchReaderRawPolicy(value),
			() => sanitizeResearchHtml(source, {}, undefined, "long-v1", selected),
			() => loadResearchDocument(input, context(), "long-v1", selected),
		]) {
			const error = failure(action);
			expect(error).toBeInstanceOf(AgentBrowserError);
			expect(error).toMatchObject({ code: "invalid-input" });
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		}
	}
	expect(read).not.toHaveBeenCalled();
	expect(coerce).not.toHaveBeenCalled();
});

it("keeps raw-policy loading inert without invoking script or subresource hooks", () => {
	const fetch = vi.fn(() => {
		throw new Error("Reader must not fetch subresources");
	});
	const script = vi.fn(() => {
		throw new Error("Reader must not execute scripts");
	});
	const initializeDocument = vi.fn();
	const source =
		'<link rel="stylesheet" href="/sheet.css"><style>@import "/other.css";</style><script src="/app.js">throw new Error("must not execute")</script><iframe src="/frame">secret</iframe><noembed>secret</noembed><noframes>secret</noframes><template><xmp>secret</xmp></template><img src="/image.png" srcset="/other.png 2x" alt="Diagram"><p onclick="bad()">Readable</p>';
	const tree = loadResearchDocument(
		response(source),
		{
			...context(),
			initializeDocument,
			fetchStylesheet: fetch,
			fetchScript: fetch,
			fetchImage: fetch,
			scripts: { start: script } as unknown as DocumentLoaderContext["scripts"],
		},
		"long-v1",
		rawPolicy,
	);
	try {
		const queries = new DocumentQueries(tree);
		for (const selector of [
			"script",
			"style",
			"link",
			"iframe",
			"noembed",
			"noframes",
			"template",
			"xmp",
			"[src]",
			"[srcset]",
			"[onclick]",
		])
			expect(queries.querySelector(selector)).toBeNull();
		const extracted = extractDocument(tree);
		expect(extracted.content).toContain("Readable");
		expect(extracted.content).not.toContain("secret");
		expect(extracted.reader).toMatchObject({
			rawTextPolicy: rawPolicy,
			scripting: false,
			styling: false,
			omittedRaw: { elements: 6 },
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(script).not.toHaveBeenCalled();
		expect(initializeDocument).toHaveBeenCalledOnce();
	} finally {
		tree.close();
	}
});
