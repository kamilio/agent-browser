import { afterEach, expect, it, vi } from "vitest";
import type { DocumentLimits, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { htmlParseInfo } from "./html-info.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	researchReaderLimits,
	researchReaderProfile,
	sanitizeResearchHtml,
} from "./research-loader.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
} from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const profiles = ["default", "long-v1"] as const;
const looseDocumentLimits = Object.freeze({
	maxNodes: 100_000,
	maxDepth: 256,
	maxTextCodeUnits: 8_000_000,
	maxChanges: 2048,
});
const tighterDocumentLimits = Object.freeze({
	maxNodes: 16,
	maxDepth: 8,
	maxTextCodeUnits: 256,
	maxChanges: 16,
});

function context(limits: Partial<DocumentLimits> = {}): DocumentLoaderContext {
	return Object.freeze({
		tabId: "synthetic-admission-loader",
		signal: new AbortController().signal,
		limits: Object.freeze({
			...researchLongDocumentAdmission.document,
			...limits,
		}),
	});
}

function response(
	source: string,
	type = "text/html; charset=utf-8",
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: "https://reader.invalid/synthetic",
		status: 200,
		headers: { "content-type": [type] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function ceilings(profile: ResearchDocumentProfileId): ResearchReaderLimits {
	return profile === "long-v1"
		? researchLongDocumentAdmission.reader
		: researchReaderLimits;
}

function comment(length: number): string {
	return `<!--${"x".repeat(length - 7)}-->`;
}

function failure(action: () => unknown): AgentBrowserError {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected a synthetic admission failure.");
	expect(caught.cause).toBeUndefined();
	return caught;
}

function loadFailure(
	input: NetworkResponse,
	options: DocumentLoaderContext,
	profile?: ResearchDocumentProfileId,
): AgentBrowserError {
	return failure(() => {
		const tree = loadResearchDocument(input, options, profile);
		tree.close();
	});
}

function expectLimit(
	error: unknown,
	message: string,
	diagnostic: ResourceLimitDiagnostic,
) {
	expect(error).toMatchObject({ code: "resource-limit", message });
	expect(resourceLimitDiagnostic(error)).toEqual(diagnostic);
	expect(Object.isFrozen(resourceLimitDiagnostic(error))).toBe(true);
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("keeps the exported default reader limits frozen and unchanged", () => {
	expect(researchReaderLimits).toEqual({
		maxSourceCodeUnits: 2_000_000,
		maxTextCodeUnits: 1_000_000,
		maxOutputCodeUnits: 2_000_000,
		maxTokens: 100_000,
		maxDepth: 128,
	});
	expect(Object.isFrozen(researchReaderLimits)).toBe(true);
	expect(researchReaderLimits).not.toBe(researchLongDocumentAdmission.reader);
	expect(sanitizeResearchHtml("<p>Same</p>")).toEqual(
		sanitizeResearchHtml("<p>Same</p>", {}, undefined, "default"),
	);
});

it.each([undefined, "default"] as const)(
	"preserves HTML and plain-text loading with profile %s",
	(profile) => {
		for (const type of ["text/html", "text/plain"]) {
			const input = response(
				"<p>Literal &amp; text</p>",
				`${type}; charset=utf-8`,
			);
			const original = loadResearchDocument(input, context());
			let selected: DocumentTree | undefined;
			try {
				selected = loadResearchDocument(input, context(), profile);
				expect(selected.textContent(selected.root)).toBe(
					original.textContent(original.root),
				);
				expect(researchReaderInfo(selected)).toEqual(
					researchReaderInfo(original),
				);
				expect(htmlParseInfo(selected)).toEqual(htmlParseInfo(original));
			} finally {
				selected?.close();
				original.close();
			}
		}
	},
);

it("admits actual greater-than-2m comment-heavy HTML only with explicit long opt-in", () => {
	const source = `${comment(2_000_001)}<h1>Bounded heading</h1><p>Readable</p>`;
	const input = response(source);
	input.url = "https://reader.invalid/long-v1?profile=long-v1";
	input.headers = { ...input.headers, "x-research-profile": ["long-v1"] };
	const options = context();
	const originalLimits = { ...options.limits };
	const tree = loadResearchDocument(input, options, "long-v1");
	try {
		expect(new DocumentQueries(tree).querySelector("h1")).not.toBeNull();
		expect(tree.textContent(tree.root)).toBe("Bounded headingReadable");
		expect(tree.nodeCount).toBeLessThan(16);
		expect(tree.limits).toEqual(originalLimits);
		expect(options.limits).toEqual(originalLimits);
		expect(researchReaderInfo(tree)).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			sourceCodeUnits: source.length,
			omittedTokens: 1,
			encoding: "utf-8",
		});
		expect(Object.isFrozen(researchReaderInfo(tree))).toBe(true);
		expect(htmlParseInfo(tree)?.encoding).toBe("utf-8");
	} finally {
		tree.close();
	}
	expect(researchReaderInfo(tree)).toBeUndefined();
	expect(htmlParseInfo(tree)).toBeUndefined();
	for (const profile of [undefined, "default"] as const)
		expectLimit(
			loadFailure(input, options, profile),
			"Decoded reader limit exceeded",
			{
				kind: "reader.decoded",
				unit: "code-units",
				limit: 2_000_000,
				observed: source.length,
			},
		);
	expectLimit(
		loadFailure(input, context({ maxTextCodeUnits: 2_000_000 }), "long-v1"),
		"Decoded reader limit exceeded",
		{
			kind: "reader.decoded",
			unit: "code-units",
			limit: 2_000_000,
			observed: source.length,
		},
	);
});

it.each(profiles)(
	"enforces the actual %s source ceiling and accepts equality",
	(profile) => {
		const limit = ceilings(profile).maxSourceCodeUnits;
		const source = comment(limit);
		expect(sanitizeResearchHtml(source, {}, undefined, profile).html).toBe("");
		const input = response(source);
		const tree = loadResearchDocument(input, context(), profile);
		try {
			expect(researchReaderInfo(tree)?.sourceCodeUnits).toBe(limit);
			expect(tree.nodeCount).toBeLessThan(8);
		} finally {
			tree.close();
		}
		expectLimit(
			failure(() => sanitizeResearchHtml(`${source}x`, {}, undefined, profile)),
			"Reader budget exceeded",
			{ kind: "reader.source", unit: "code-units", limit, observed: limit + 1 },
		);
		expectLimit(
			loadFailure(response(`${source}x`), context(), profile),
			"Decoded reader limit exceeded",
			{
				kind: "reader.decoded",
				unit: "code-units",
				limit,
				observed: limit + 1,
			},
		);
	},
);

it.each(profiles)(
	"checks the actual %s encoded-byte ceiling before decoding",
	(profile) => {
		const limit = ceilings(profile).maxSourceCodeUnits * 4 + 3;
		const input = response("", "text/html; charset=invalid-synthetic-encoding");
		input.body = new Uint8Array(limit + 1);
		input.encodedBytes = 1;
		expectLimit(
			loadFailure(input, context(), profile),
			"Encoded reader limit exceeded",
			{ kind: "reader.encoded", unit: "bytes", limit, observed: limit + 1 },
		);
		input.body = input.body.subarray(0, limit);
		input.encodedBytes = limit + 100;
		const error = loadFailure(input, context(), profile);
		expect(error).toMatchObject({
			code: "unsupported",
			message: "Unsupported response text encoding",
		});
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	},
);

it.each(profiles)(
	"enforces the actual %s text ceiling and accepts equality",
	(profile) => {
		const limit = ceilings(profile).maxTextCodeUnits;
		const source = "x".repeat(limit);
		const sanitized = sanitizeResearchHtml(source, {}, undefined, profile);
		expect(sanitized.report.textCodeUnits).toBe(limit);
		expect(sanitized.html).toHaveLength(limit);
		const diagnostic: ResourceLimitDiagnostic = {
			kind: "reader.text",
			unit: "code-units",
			limit,
			observed: limit + 1,
		};
		expectLimit(
			failure(() => sanitizeResearchHtml(`${source}x`, {}, undefined, profile)),
			"Reader budget exceeded",
			diagnostic,
		);
		expectLimit(
			loadFailure(response(`${source}x`), context(), profile),
			"Reader budget exceeded",
			diagnostic,
		);
	},
);

it.each(profiles)(
	"enforces the actual %s escaped-output ceiling",
	(profile) => {
		const limit = ceilings(profile).maxOutputCodeUnits;
		const source = "&".repeat(limit / "&amp;".length);
		const sanitized = sanitizeResearchHtml(source, {}, undefined, profile);
		expect(sanitized.html).toHaveLength(limit);
		expect(sanitized.report.outputCodeUnits).toBe(limit);
		const diagnostic: ResourceLimitDiagnostic = {
			kind: "reader.output",
			unit: "code-units",
			limit,
			observed: limit + 1,
		};
		expectLimit(
			failure(() => sanitizeResearchHtml(`${source}!`, {}, undefined, profile)),
			"Reader budget exceeded",
			diagnostic,
		);
		expectLimit(
			loadFailure(response(`${source}!`), context(), profile),
			"Reader budget exceeded",
			diagnostic,
		);
	},
);

it.each(profiles)(
	"counts discarded tokens against the actual %s token ceiling",
	(profile) => {
		const limit = ceilings(profile).maxTokens;
		const source = "<!---->".repeat(limit);
		const sanitized = sanitizeResearchHtml(source, {}, undefined, profile);
		expect(sanitized.html).toBe("");
		expect(sanitized.report.tokens).toBe(limit);
		const tree = loadResearchDocument(response(source), context(), profile);
		try {
			expect(researchReaderInfo(tree)?.tokens).toBe(limit);
			expect(tree.nodeCount).toBeLessThan(8);
		} finally {
			tree.close();
		}
		const diagnostic: ResourceLimitDiagnostic = {
			kind: "reader.tokens",
			unit: "tokens",
			limit,
			observed: limit + 1,
		};
		expectLimit(
			failure(() =>
				sanitizeResearchHtml(`${source}<!---->`, {}, undefined, profile),
			),
			"Reader budget exceeded",
			diagnostic,
		);
		expectLimit(
			loadFailure(response(`${source}<!---->`), context(), profile),
			"Reader budget exceeded",
			diagnostic,
		);
	},
);

it.each(profiles)("does not widen the %s depth ceiling", (profile) => {
	const limit = ceilings(profile).maxDepth;
	expect(limit).toBe(128);
	const source = "<widget>".repeat(limit);
	expect(sanitizeResearchHtml(source, {}, undefined, profile).html).toBe("");
	const diagnostic: ResourceLimitDiagnostic = {
		kind: "reader.depth",
		unit: "levels",
		limit,
		observed: limit + 1,
	};
	expectLimit(
		failure(() =>
			sanitizeResearchHtml(`${source}<widget>`, {}, undefined, profile),
		),
		"Reader budget exceeded",
		diagnostic,
	);
	expectLimit(
		loadFailure(response(`${source}<widget>`), context(), profile),
		"Reader budget exceeded",
		diagnostic,
	);
});

const tighterBounds: {
	name: string;
	source: string;
	limits: Partial<DocumentLimits>;
	message: string;
	diagnostic: ResourceLimitDiagnostic;
}[] = [
	{
		name: "encoded bytes",
		source: "x".repeat(44),
		limits: { maxTextCodeUnits: 10 },
		message: "Encoded reader limit exceeded",
		diagnostic: {
			kind: "reader.encoded",
			unit: "bytes",
			limit: 43,
			observed: 44,
		},
	},
	{
		name: "decoded source",
		source: comment(11),
		limits: { maxTextCodeUnits: 10 },
		message: "Decoded reader limit exceeded",
		diagnostic: {
			kind: "reader.decoded",
			unit: "code-units",
			limit: 10,
			observed: 11,
		},
	},
	{
		name: "escaped output",
		source: "&&&",
		limits: { maxTextCodeUnits: 10 },
		message: "Reader budget exceeded",
		diagnostic: {
			kind: "reader.output",
			unit: "code-units",
			limit: 10,
			observed: 15,
		},
	},
	{
		name: "tokens derived from context nodes",
		source: "<!---->".repeat(9),
		limits: { maxNodes: 1 },
		message: "Reader budget exceeded",
		diagnostic: {
			kind: "reader.tokens",
			unit: "tokens",
			limit: 8,
			observed: 9,
		},
	},
	{
		name: "open depth",
		source: "<widget><widget><widget>",
		limits: { maxDepth: 2 },
		message: "Reader budget exceeded",
		diagnostic: { kind: "reader.depth", unit: "levels", limit: 2, observed: 3 },
	},
];

it.each(tighterBounds)(
	"clamps long admission to tighter context $name",
	({ source, limits, message, diagnostic }) => {
		const options = context(limits);
		const before = { ...options.limits };
		expectLimit(
			loadFailure(response(source), options, "long-v1"),
			message,
			diagnostic,
		);
		expect(options.limits).toEqual(before);
	},
);

it("retains real parser node limits and closes the failed document", () => {
	let initialized: DocumentTree | undefined;
	const options: DocumentLoaderContext = {
		...context({ maxNodes: 5 }),
		initializeDocument(tree) {
			initialized = tree;
			expect(tree.limits).toEqual(options.limits);
		},
	};
	expectLimit(
		loadFailure(response("<p>x</p>"), options, "long-v1"),
		"Document node limit exceeded",
		{ kind: "document.nodes", unit: "nodes", limit: 5, observed: 6 },
	);
	expect(initialized).toBeDefined();
	expect(initialized?.mutationMetrics().closed).toBe(true);
	expect(options.limits.maxNodes).toBe(5);
});

it("retains real document depth limits including the HTML scaffold", () => {
	let initialized: DocumentTree | undefined;
	const error = loadFailure(
		response("<p>x</p>"),
		{
			...context({ maxDepth: 2 }),
			initializeDocument(tree) {
				initialized = tree;
			},
		},
		"long-v1",
	);
	expect(error.code).toBe("resource-limit");
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "document.depth",
		unit: "levels",
		limit: 2,
		observed: 3,
	});
	expect(initialized).toBeDefined();
	expect(initialized?.mutationMetrics().closed).toBe(true);
});

it.each(profiles)(
	"validates sanitizer overrides against selected %s ceilings",
	(profile) => {
		const selected = ceilings(profile);
		expect(() =>
			sanitizeResearchHtml("", selected, undefined, profile),
		).not.toThrow();
		for (const name of Object.keys(
			selected,
		) as (keyof ResearchReaderLimits)[]) {
			for (const value of [
				0,
				-1,
				1.5,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				selected[name] + 1,
			]) {
				const error = failure(() =>
					sanitizeResearchHtml("", { [name]: value }, undefined, profile),
				);
				expect(error).toMatchObject({
					code: "invalid-input",
					message: "Invalid reader limit",
				});
				expect(resourceLimitDiagnostic(error)).toBeUndefined();
			}
		}
	},
);

it("permits tighter long sanitizer overrides at the real guards", () => {
	const bounds: {
		source: string;
		option: keyof ResearchReaderLimits;
		diagnostic: ResourceLimitDiagnostic;
	}[] = [
		{
			source: "a😀",
			option: "maxSourceCodeUnits",
			diagnostic: {
				kind: "reader.source",
				unit: "code-units",
				limit: 2,
				observed: 3,
			},
		},
		{
			source: "<svg>a😀</svg>",
			option: "maxTextCodeUnits",
			diagnostic: {
				kind: "reader.text",
				unit: "code-units",
				limit: 2,
				observed: 3,
			},
		},
		{
			source: "&",
			option: "maxOutputCodeUnits",
			diagnostic: {
				kind: "reader.output",
				unit: "code-units",
				limit: 4,
				observed: 5,
			},
		},
		{
			source: "<p>x</p>",
			option: "maxTokens",
			diagnostic: {
				kind: "reader.tokens",
				unit: "tokens",
				limit: 2,
				observed: 3,
			},
		},
		{
			source: "<svg><g></g></svg>",
			option: "maxDepth",
			diagnostic: {
				kind: "reader.depth",
				unit: "levels",
				limit: 1,
				observed: 2,
			},
		},
	];
	for (const { source, option, diagnostic } of bounds) {
		expectLimit(
			failure(() =>
				sanitizeResearchHtml(
					source,
					{ [option]: diagnostic.limit },
					undefined,
					"long-v1",
				),
			),
			"Reader budget exceeded",
			diagnostic,
		);
		expect(() =>
			sanitizeResearchHtml(
				source,
				{ [option]: diagnostic.observed },
				undefined,
				"long-v1",
			),
		).not.toThrow();
	}
});

it.each([
	{ name: "null", value: null },
	{ name: "boolean", value: true },
	{ name: "number", value: 1 },
	{ name: "object", value: {} },
	{ name: "boxed string", value: Object("long-v1") },
	{ name: "array", value: ["long-v1"] },
	{ name: "symbol", value: Symbol("long-v1") },
	{ name: "empty string", value: "" },
	{ name: "wrong case", value: "LONG-V1" },
	{ name: "whitespace", value: " long-v1" },
	{ name: "unknown name", value: "long-v2" },
])(
	"rejects a $name profile before any input access or override spread",
	({ value }) => {
		let traps = 0;
		const trap = () => {
			traps++;
			throw new Error("Synthetic input must not be inspected.");
		};
		const hostile = new Proxy(
			{},
			{
				get: trap,
				ownKeys: trap,
				getOwnPropertyDescriptor: trap,
				getPrototypeOf: trap,
			},
		);
		const profile = value as ResearchDocumentProfileId;
		for (const action of [
			() =>
				loadResearchDocument(
					hostile as NetworkResponse,
					hostile as DocumentLoaderContext,
					profile,
				),
			() =>
				sanitizeResearchHtml(
					hostile as unknown as string,
					hostile,
					hostile as AbortSignal,
					profile,
				),
		]) {
			const error = failure(action);
			expect(error).toMatchObject({
				code: "invalid-input",
				message: "Invalid research document profile",
			});
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		}
		expect(traps).toBe(0);
	},
);

it.each(["text/plain", "application/json", "application/xhtml+xml"])(
	"rejects long %s before any TextDecoder construction",
	(type) => {
		let decoderCalls = 0;
		vi.stubGlobal(
			"TextDecoder",
			class ForbiddenTextDecoder {
				constructor() {
					decoderCalls++;
					throw new Error("Synthetic decoder must not run.");
				}
			},
		);
		const input = response(
			"<p>Not admitted</p>",
			`${type}; charset=invalid-encoding`,
		);
		const error = loadFailure(input, context(), "long-v1");
		expect(error).toMatchObject({
			code: "unsupported",
			message: "Long reader requires text/html",
		});
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		expect(decoderCalls).toBe(0);
	},
);

it.each(["text/html; charset=utf-8", '  TeXt/HtMl ; ChArSeT="utf-8"'])(
	"retains HTML MIME and charset handling for %s",
	(type) => {
		const tree = loadResearchDocument(
			response("<p>é😀</p>", type),
			context(),
			"long-v1",
		);
		try {
			expect(tree.textContent(tree.root)).toBe("é😀");
			expect(researchReaderInfo(tree)?.encoding).toBe("utf-8");
			expect(htmlParseInfo(tree)?.encoding).toBe("utf-8");
		} finally {
			tree.close();
		}
	},
);

it.each([
	{ name: "empty", types: [] },
	{ name: "duplicate", types: ["text/html", "text/html"] },
	{ name: "missing", types: undefined },
])(
	"still requires exactly one Content-Type for long admission: $name",
	({ types }) => {
		const input = response("<p>Finite</p>");
		input.headers = types === undefined ? {} : { "content-type": types };
		expect(loadFailure(input, context(), "long-v1")).toMatchObject({
			code: "unsupported",
			message: "Reader requires Content-Type",
		});
	},
);

it.each(["text/plain", "application/json"])(
	"does not widen the default decoded %s text budget",
	(type) => {
		expectLimit(
			loadFailure(response("x".repeat(1_000_001), type), context()),
			"Decoded reader limit exceeded",
			{
				kind: "reader.decoded",
				unit: "code-units",
				limit: 1_000_000,
				observed: 1_000_001,
			},
		);
	},
);

it("keeps long output inert, privately owned and annotated without invoking hooks", () => {
	const source =
		"<style>p{display:none}</style><script src=/never>bad()</script>" +
		"<svg><text>Omitted</text></svg><math><mi>Hidden</mi></math>" +
		'<form action=/submit><input value=secret><p hidden onclick="bad()">Readable</p></form>' +
		'<img src=/never alt=Diagram><a href="javascript:bad()">Link</a>';
	const input = response(source);
	const before = input.body.slice();
	const fetch = vi.fn();
	const script = vi.fn();
	const initializeDocument = vi.fn();
	const tree = loadResearchDocument(
		input,
		{
			...context(),
			initializeDocument,
			fetchStylesheet: fetch,
			fetchScript: fetch,
			fetchImage: fetch,
			scripts: { start: script } as unknown as DocumentLoaderContext["scripts"],
		},
		"long-v1",
	);
	try {
		const queries = new DocumentQueries(tree);
		expect(
			queries.querySelector(
				"script, style, svg, math, form, input, [onclick], [src], [hidden], a[href]",
			),
		).toBeNull();
		expect(tree.textContent(tree.root)).toBe("ReadableLink");
		expect(researchReaderInfo(tree)).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			omittedSubtrees: { style: 1, script: 1, svg: 1, math: 1, input: 1 },
		});
		expect(htmlParseInfo(tree)?.scripting).toBe(false);
		expect(fetch).not.toHaveBeenCalled();
		expect(script).not.toHaveBeenCalled();
		expect(initializeDocument).toHaveBeenCalledOnce();
		expect(input.body).toEqual(before);
		input.body.fill(0);
		expect(tree.textContent(tree.root)).toBe("ReadableLink");
	} finally {
		tree.close();
	}
	expect(researchReaderInfo(tree)).toBeUndefined();
});

it.each(profiles)(
	"preserves already-aborted behavior with profile %s",
	(profile) => {
		const controller = new AbortController();
		controller.abort();
		let reads = 0;
		const input = new Proxy(
			{},
			{
				get() {
					reads++;
					throw new Error("Aborted response must not be read.");
				},
			},
		) as NetworkResponse;
		const error = loadFailure(
			input,
			{ ...context(), signal: controller.signal },
			profile,
		);
		expect(error).toMatchObject({ code: "aborted", message: "Reader aborted" });
		expect(reads).toBe(0);
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		const sanitizedError = failure(() =>
			sanitizeResearchHtml(
				"xx",
				{ maxSourceCodeUnits: 1 },
				controller.signal,
				profile,
			),
		);
		expect(sanitizedError).toMatchObject({
			code: "aborted",
			message: "Reader aborted",
		});
		expect(resourceLimitDiagnostic(sanitizedError)).toBeUndefined();
	},
);

it("passes cancellation through real long parsing and closes an initialized tree", () => {
	const controller = new AbortController();
	let initialized: DocumentTree | undefined;
	const error = loadFailure(
		response("<p>Bounded</p>"),
		{
			...context(),
			signal: controller.signal,
			initializeDocument(tree) {
				initialized = tree;
				controller.abort();
			},
		},
		"long-v1",
	);
	expect(error).toMatchObject({
		code: "aborted",
		message: "HTML parsing aborted",
	});
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	expect(initialized).toBeDefined();
	expect(initialized?.mutationMetrics().closed).toBe(true);
});

it.each([
	{
		name: "loose",
		limits: looseDocumentLimits,
		expected: researchLongDocumentAdmission.document,
	},
	{
		name: "tighter",
		limits: tighterDocumentLimits,
		expected: tighterDocumentLimits,
	},
	{
		name: "mixed",
		limits: {
			maxNodes: 16,
			maxDepth: 256,
			maxTextCodeUnits: 256,
			maxChanges: 2048,
		},
		expected: {
			maxNodes: 16,
			maxDepth: 128,
			maxTextCodeUnits: 256,
			maxChanges: 1024,
		},
	},
])(
	"uses bounded actual long tree limits for a $name context without mutating it",
	({ limits, expected }) => {
		const supplied = context(limits);
		const callerLimits = supplied.limits;
		const before = { ...callerLimits };
		let initialized: DocumentTree | undefined;
		const tree = loadResearchDocument(
			response("<h1>Limits</h1>"),
			{
				...supplied,
				initializeDocument(document) {
					initialized = document;
					expect(document.limits).toEqual(expected);
				},
			},
			"long-v1",
		);
		try {
			expect(initialized).toBe(tree);
			expect(tree.limits).toEqual(expected);
			expect(tree.limits).not.toBe(callerLimits);
			expect(Object.isFrozen(tree.limits)).toBe(true);
			expect(tree.nodeCount).toBeLessThan(16);
			expect(tree.textContent(tree.root)).toBe("Limits");
			expect(tree.limits.maxNodes * 8).toBeLessThanOrEqual(
				researchLongDocumentAdmission.derived.maxParserTokens,
			);
			expect(tree.limits.maxTextCodeUnits * 8).toBeLessThanOrEqual(
				researchLongDocumentAdmission.derived.maxParserInputWorkCodeUnits,
			);
			expect(supplied.limits).toBe(callerLimits);
			expect(supplied.limits).toEqual(before);
		} finally {
			tree.close();
		}
	},
);

it.each([undefined, "default"] as const)(
	"leaves loose caller tree limits unchanged with default profile %s",
	(profile) => {
		const supplied = context(looseDocumentLimits);
		const tree = loadResearchDocument(
			response("<p>Default context</p>"),
			supplied,
			profile,
		);
		try {
			expect(tree.limits).toEqual(looseDocumentLimits);
			expect(supplied.limits).toEqual(looseDocumentLimits);
			expect(tree.limits.maxNodes).toBeGreaterThan(
				researchLongDocumentAdmission.document.maxNodes,
			);
			expect(researchReaderInfo(tree)?.profile).toBe(researchReaderProfile);
		} finally {
			tree.close();
		}
	},
);

it.each(["maxNodes", "maxDepth", "maxTextCodeUnits", "maxChanges"] as const)(
	"rejects invalid long context %s before response access without coercion",
	(name) => {
		const coerce = vi.fn(() => 16);
		const values: unknown[] = [
			0,
			-1,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
			"16",
			true,
			16n,
			null,
			undefined,
			{ [Symbol.toPrimitive]: coerce },
		];
		let reads = 0;
		const input = new Proxy(
			{},
			{
				get() {
					reads++;
					throw new Error("Invalid context must not inspect the response.");
				},
			},
		) as NetworkResponse;
		for (const value of values) {
			const limits = {
				...researchLongDocumentAdmission.document,
				[name]: value,
			} as DocumentLimits;
			const error = loadFailure(input, { ...context(), limits }, "long-v1");
			expect(error).toMatchObject({
				code: "invalid-input",
				message: "Invalid document limit",
			});
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
			expect(limits[name]).toBe(value);
		}
		expect(reads).toBe(0);
		expect(coerce).not.toHaveBeenCalled();
	},
);

it("rejects missing or non-record long document limits without default repair", () => {
	for (const limits of [undefined, null, 1, "limits", [], {}]) {
		const error = loadFailure(
			response("<p>Finite</p>"),
			{ ...context(), limits: limits as unknown as DocumentLimits },
			"long-v1",
		);
		expect(error).toMatchObject({
			code: "invalid-input",
			message: "Invalid document limit",
		});
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	}
});

it("snapshots all four long context fields once for reader guards and the real parser", () => {
	const suppliedLimits = Object.create(null) as DocumentLimits;
	const reads: Record<keyof DocumentLimits, number> = {
		maxNodes: 0,
		maxDepth: 0,
		maxTextCodeUnits: 0,
		maxChanges: 0,
	};
	for (const name of Object.keys(reads) as (keyof DocumentLimits)[])
		Object.defineProperty(suppliedLimits, name, {
			get() {
				reads[name]++;
				return reads[name] === 1 ? looseDocumentLimits[name] : 1;
			},
		});
	let contextReads = 0;
	const tree = loadResearchDocument(
		response("<p>Snapshot</p>"),
		{
			...context(),
			get limits() {
				contextReads++;
				return suppliedLimits;
			},
		},
		"long-v1",
	);
	try {
		expect(tree.limits).toEqual(researchLongDocumentAdmission.document);
		expect(tree.textContent(tree.root)).toBe("Snapshot");
		expect(contextReads).toBe(1);
		expect(reads).toEqual({
			maxNodes: 1,
			maxDepth: 1,
			maxTextCodeUnits: 1,
			maxChanges: 1,
		});
	} finally {
		tree.close();
	}
});

it("preserves abort-before-work before the long document-limit snapshot", () => {
	const controller = new AbortController();
	controller.abort();
	const trap = vi.fn(() => {
		throw new Error("Aborted long admission must not inspect limits or input.");
	});
	const input = new Proxy({}, { get: trap }) as NetworkResponse;
	const error = loadFailure(
		input,
		{
			tabId: "synthetic-aborted-long-context",
			signal: controller.signal,
			get limits() {
				return trap();
			},
		},
		"long-v1",
	);
	expect(error).toMatchObject({ code: "aborted", message: "Reader aborted" });
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	expect(trap).not.toHaveBeenCalled();
});
