import { expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
} from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";
import { loadTextDocument } from "./text-loader.js";

function context(maxTextCodeUnits = 2_000_000): DocumentLoaderContext {
	return {
		tabId: "synthetic-loader-limits",
		signal: new AbortController().signal,
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits,
			maxChanges: 1024,
		},
	};
}

function response(text: string, type = "text/html"): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url: "https://reader.invalid/synthetic",
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

async function loadFailure(
	loader: typeof loadResearchDocument | typeof loadBrowserDocument,
	input: NetworkResponse,
	options: DocumentLoaderContext,
): Promise<unknown> {
	try {
		const tree = await loader(input, options);
		tree.close();
	} catch (error) {
		return error;
	}
	throw new Error("Expected loader failure");
}

function expectLimit(
	error: unknown,
	message: string,
	diagnostic: ResourceLimitDiagnostic,
) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({ code: "resource-limit", message });
	expect(resourceLimitDiagnostic(error)).toEqual(diagnostic);
}

const sanitizerBounds: {
	name: string;
	source: string;
	option: keyof ResearchReaderLimits;
	diagnostic: ResourceLimitDiagnostic;
}[] = [
	{
		name: "source UTF-16 code units",
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
		name: "text UTF-16 code units",
		source: "a😀",
		option: "maxTextCodeUnits",
		diagnostic: {
			kind: "reader.text",
			unit: "code-units",
			limit: 2,
			observed: 3,
		},
	},
	{
		name: "cumulative text across elements",
		source: "<p>a</p><p>😀</p>",
		option: "maxTextCodeUnits",
		diagnostic: {
			kind: "reader.text",
			unit: "code-units",
			limit: 2,
			observed: 3,
		},
	},
	{
		name: "escaped output rather than source text",
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
		name: "escaped attribute output",
		source: '<a title="&">',
		option: "maxOutputCodeUnits",
		diagnostic: {
			kind: "reader.output",
			unit: "code-units",
			limit: 16,
			observed: 17,
		},
	},
	{
		name: "cumulative output including closing tags",
		source: "<p>x</p>",
		option: "maxOutputCodeUnits",
		diagnostic: {
			kind: "reader.output",
			unit: "code-units",
			limit: 7,
			observed: 8,
		},
	},
	{
		name: "tokens including closing tags",
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
		name: "open element depth",
		source: "<div><span>x</span></div>",
		option: "maxDepth",
		diagnostic: { kind: "reader.depth", unit: "levels", limit: 1, observed: 2 },
	},
	{
		name: "unwrapped element depth",
		source: "<widget><widget>",
		option: "maxDepth",
		diagnostic: { kind: "reader.depth", unit: "levels", limit: 1, observed: 2 },
	},
	{
		name: "omitted subtree depth",
		source: "<svg><g></g></svg>",
		option: "maxDepth",
		diagnostic: { kind: "reader.depth", unit: "levels", limit: 1, observed: 2 },
	},
	{
		name: "omitted subtree text",
		source: "<svg>a😀</svg>",
		option: "maxTextCodeUnits",
		diagnostic: {
			kind: "reader.text",
			unit: "code-units",
			limit: 2,
			observed: 3,
		},
	},
	...[
		"<script>&amp;</script>",
		"<svg><script>&amp;</script></svg>",
		"<xmp>&amp;</xmp>",
		"<plaintext>&amp;",
	].map((source) => ({
		name: `raw text without entity decoding: ${source}`,
		source,
		option: "maxTextCodeUnits" as const,
		diagnostic: {
			kind: "reader.text" as const,
			unit: "code-units" as const,
			limit: 4,
			observed: 5,
		},
	})),
	{
		name: "entity-decoded title text",
		source: "<title>&amp;&amp;</title>",
		option: "maxTextCodeUnits",
		diagnostic: {
			kind: "reader.text",
			unit: "code-units",
			limit: 1,
			observed: 2,
		},
	},
];

it.each(sanitizerBounds)(
	"reports exact $name and accepts equality",
	({ source, option, diagnostic }) => {
		expectLimit(
			failure(() =>
				sanitizeResearchHtml(source, { [option]: diagnostic.limit }),
			),
			"Reader budget exceeded",
			diagnostic,
		);
		expect(() =>
			sanitizeResearchHtml(source, { [option]: diagnostic.observed }),
		).not.toThrow();
	},
);

it.each(sanitizerBounds)(
	"prioritizes cancellation at each check through $name",
	({ source, option, diagnostic }) => {
		let checks = 0;
		const countingSignal = {
			get aborted() {
				checks++;
				return false;
			},
		} as AbortSignal;
		failure(() =>
			sanitizeResearchHtml(
				source,
				{ [option]: diagnostic.limit },
				countingSignal,
			),
		);
		expect(checks).toBeGreaterThan(0);
		for (let abortAt = 1; abortAt <= checks; abortAt++) {
			let current = 0;
			const signal = {
				get aborted() {
					return ++current >= abortAt;
				},
			} as AbortSignal;
			const error = failure(() =>
				sanitizeResearchHtml(source, { [option]: diagnostic.limit }, signal),
			);
			expect(error).toMatchObject({
				code: "aborted",
				message: "Reader aborted",
			});
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		}
	},
);

it.each([
	{ source: "", finalCheck: 2 },
	{ source: "<svg>", finalCheck: 3 },
])(
	"retains the final abort-only check for '$source'",
	({ source, finalCheck }) => {
		let checks = 0;
		const signal = {
			get aborted() {
				return ++checks === finalCheck;
			},
		} as AbortSignal;
		const error = failure(() => sanitizeResearchHtml(source, {}, signal));
		expect(checks).toBe(finalCheck);
		expect(error).toMatchObject({ code: "aborted", message: "Reader aborted" });
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	},
);

it("keeps omission accounting and separate open/skipped depth counters", () => {
	const result = sanitizeResearchHtml("<div><svg><g>&amp;</g></svg></div>", {
		maxDepth: 2,
	});
	expect(result.html).toBe("<div></div>");
	expect(result.report).toMatchObject({
		sourceCodeUnits: 34,
		textCodeUnits: 1,
		outputCodeUnits: 11,
		tokens: 7,
		omittedTokens: 5,
		omittedSubtrees: { svg: 1 },
	});
});

const loaders = [
	{
		kind: "reader.encoded",
		loader: loadResearchDocument,
		type: "text/html",
		message: "Encoded reader limit exceeded",
	},
	{
		kind: "text.encoded",
		loader: loadTextDocument,
		type: "text/plain",
		message: "Encoded text document limit exceeded",
	},
	{
		kind: "html.encoded",
		loader: loadBrowserDocument,
		type: "text/html",
		message: "Encoded HTML document limit exceeded",
	},
] as const;

it.each(loaders)(
	"$kind measures transport-decoded response.body bytes, not wire encodedBytes",
	async ({ kind, loader, type, message }) => {
		const input = response("x".repeat(44), type);
		input.encodedBytes = 1;
		expectLimit(await loadFailure(loader, input, context(10)), message, {
			kind,
			unit: "bytes",
			limit: 43,
			observed: 44,
		});
	},
);

it.each(loaders)(
	"$kind accepts the exact body-byte boundary before decoding",
	async ({ loader, type }) => {
		const input = response("x".repeat(43), type);
		input.encodedBytes = 1_000_000;
		input.headers = { "content-type": [`${type}; charset=invalid-encoding`] };
		const error = await loadFailure(loader, input, context(10));
		expect(error).toMatchObject({
			code: "unsupported",
			message: "Unsupported response text encoding",
		});
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	},
);

it.each(loaders)(
	"$kind preserves cancellation before MIME and body checks",
	async ({ loader, type }) => {
		const controller = new AbortController();
		controller.abort();
		const input = response("x".repeat(44), type);
		input.headers = {};
		const error = await loadFailure(loader, input, {
			...context(10),
			signal: controller.signal,
		});
		expect(error).toMatchObject({ code: "aborted" });
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	},
);

it.each(loaders)(
	"$kind retains its existing MIME/body check order",
	async ({ kind, loader, type, message }) => {
		const input = response("x".repeat(44), type);
		input.headers = {};
		const error = await loadFailure(loader, input, context(10));
		if (kind === "reader.encoded") {
			expectLimit(error, message, {
				kind,
				unit: "bytes",
				limit: 43,
				observed: 44,
			});
		} else {
			expect(error).toMatchObject({ code: "unsupported" });
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		}
	},
);

const decodedLoaders = [
	{
		kind: "reader.decoded",
		loader: loadResearchDocument,
		type: "text/html",
		message: "Decoded reader limit exceeded",
	},
	{
		kind: "reader.decoded",
		loader: loadResearchDocument,
		type: "text/plain",
		message: "Decoded reader limit exceeded",
	},
	{
		kind: "text.decoded",
		loader: loadTextDocument,
		type: "text/plain",
		message: "Decoded text document limit exceeded",
	},
] as const;

it.each(decodedLoaders)(
	"$kind counts UTF-16 code units for $type",
	async ({ kind, loader, type, message }) => {
		expectLimit(
			await loadFailure(loader, response("a😀", type), context(2)),
			message,
			{
				kind,
				unit: "code-units",
				limit: 2,
				observed: 3,
			},
		);
	},
);

it.each(decodedLoaders)(
	"$kind accepts decoded equality before document construction for $type",
	async ({ loader, type }) => {
		const reachedDocument = new Error("Reached document initialization");
		const error = await loadFailure(loader, response("a".repeat(64), type), {
			...context(64),
			initializeDocument: () => {
				throw reachedDocument;
			},
		});
		expect(error).toBe(reachedDocument);
	},
);

it.each(["text/plain", "application/json"])(
	"reader.decoded reports the effective non-HTML ceiling for %s",
	async (type) => {
		expectLimit(
			await loadFailure(
				loadResearchDocument,
				response("a".repeat(1_000_001), type),
				context(),
			),
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

it("reader.decoded reports the effective ceiling even when both non-HTML conditions exceed", async () => {
	expectLimit(
		await loadFailure(
			loadResearchDocument,
			response("a".repeat(1_500_001), "text/plain"),
			context(1_500_000),
		),
		"Decoded reader limit exceeded",
		{
			kind: "reader.decoded",
			unit: "code-units",
			limit: 1_000_000,
			observed: 1_500_001,
		},
	);
});

it("reader.decoded retains the source ceiling for HTML", async () => {
	expectLimit(
		await loadFailure(
			loadResearchDocument,
			response("a".repeat(2_000_001)),
			context(3_000_000),
		),
		"Decoded reader limit exceeded",
		{
			kind: "reader.decoded",
			unit: "code-units",
			limit: 2_000_000,
			observed: 2_000_001,
		},
	);
});

it.each(loaders)(
	"$kind omits invalid measurements without changing resource errors",
	async ({ loader, type, message }) => {
		for (const limit of [0.1, -Number.MAX_SAFE_INTEGER]) {
			const error = await loadFailure(
				loader,
				response("xxxx", type),
				context(limit),
			);
			expect(error).toMatchObject({ code: "resource-limit", message });
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		}
	},
);

it.each(decodedLoaders)(
	"$kind omits fractional decoded limits for $type",
	async ({ loader, type, message }) => {
		const error = await loadFailure(loader, response("aa", type), context(1.5));
		expect(error).toMatchObject({ code: "resource-limit", message });
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	},
);
