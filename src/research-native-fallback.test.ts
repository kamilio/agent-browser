import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import * as visibility from "../scripts/research-visibility.js";
import * as nativeLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as fallbackLoader from "./research-fallback-loader.js";
import * as readerLoader from "./research-loader.js";
import {
	researchReaderInfo,
	researchReaderProfile,
} from "./research-reader-info.js";
import {
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";
import { BrowserSession } from "./session.js";

const url = "https://native-fallback.fixture.invalid/article";
const policy = "native-reader-fallback-v1";
const flags = ["--document-strategy", policy];
const source =
	'<title>Owned fixture</title><main><h1>Résumé</h1><p>Visible café evidence.</p><p hidden>HIDDEN_SENTINEL</p><p style="display:none">INLINE_SENTINEL</p></main><script type="module" src="/module.js"></script><script type="application/json">{"url":"/data.json"}</script><link rel="stylesheet" href="/remote.css"><img src="/image.png">';

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(nativeLoader, "loadBrowserDocument");
	vi.spyOn(readerLoader, "loadResearchDocument");
	vi.spyOn(fallbackLoader, "loadNativeReaderFallbackDocument");
	vi.spyOn(visibility, "researchVisibilityEvidence");
	vi.spyOn(extraction, "extractDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected synthetic fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
		for (const result of vi.mocked(readerLoader.loadResearchDocument).mock
			.results) {
			if (result.type !== "return") continue;
			expect(result.value.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(result.value)).toBeUndefined();
		}
	} finally {
		for (const session of new Set(
			vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
		))
			if (session instanceof BrowserSession) session.close();
		for (const transport of new Set(
			vi.mocked(NodeNetworkTransport.prototype.request).mock.contexts,
		))
			if (transport instanceof NodeNetworkTransport) transport.close();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function enqueue(html = source, overrides: Partial<NetworkResponse> = {}) {
	const body = new TextEncoder().encode(html);
	const response: NetworkResponse = {
		url,
		status: 200,
		headers: { "content-type": ["text/html"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
	return response;
}

function navigate(
	options: ResearchExecutionOptions = { documentStrategy: policy },
	navigation: {
		reader?: boolean;
		signal?: AbortSignal;
		selector?: string;
		captureBody?: boolean;
		lines?: { start: number; end: number };
		section?: string;
		headings?: boolean;
		find?: string;
		documentProfile?: "default" | "long-v1";
	} = {},
) {
	return researchNavigation(
		url,
		navigation.reader ?? false,
		navigation.signal,
		navigation.selector,
		navigation.captureBody ?? true,
		navigation.lines,
		navigation.section,
		navigation.headings ?? false,
		navigation.find,
		navigation.documentProfile,
		options,
	);
}

function noSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(nativeLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(
		fallbackLoader.loadNativeReaderFallbackDocument,
	).not.toHaveBeenCalled();
}

function closed(report: ResearchNavigationReport, requests = 1, sessions = 1) {
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(sessions);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(sessions);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
		requests,
	);
	for (const [request] of vi.mocked(NodeNetworkTransport.prototype.request).mock
		.calls) {
		expect(request.cookieContext).toMatchObject({ credentials: "omit" });
		expect(request.body).toBeUndefined();
	}
}

function captured(report: ResearchNavigationReport, response: NetworkResponse) {
	const hash = createHash("sha256").update(response.body).digest("hex");
	expect(report.primaryResponse).toMatchObject({
		bodySha256: hash,
		decodedBytes: response.body.byteLength,
		hashScope: "transport-decoded-body-before-loader",
	});
	expect(report.bodyCapture).toEqual({
		encoding: "base64",
		decodedBytes: response.body.byteLength,
		sha256: hash,
		data: Buffer.from(response.body).toString("base64"),
	});
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(response.body);
}

function nativeFailure() {
	const failure = resourceLimitError(
		"html.tokens",
		10,
		11,
		"PRIVATE_NATIVE_SOURCE",
	);
	vi.mocked(nativeLoader.loadBrowserDocument).mockRejectedValueOnce(failure);
	return failure;
}

it("adds only an explicitly selected strategy to parsed options", () => {
	expect(JSON.stringify(parseResearchArguments([url]))).toBe(
		JSON.stringify({ reader: false, urls: [url] }),
	);
	expect(JSON.stringify(parseResearchArguments(["--reader", url]))).toBe(
		JSON.stringify({ reader: true, urls: [url] }),
	);
	for (const args of [
		[...flags, url],
		[url, ...flags],
	])
		expect(parseResearchArguments(args)).toEqual({
			reader: false,
			urls: [url],
			documentStrategy: policy,
		});
	noSetup();
});

it.each([
	["--document-strategy"],
	["--document-strategy", "--reader", url],
	[`--document-strategy=${policy}`, url],
	[...flags, ...flags, url],
	...[
		"",
		"native",
		"reader",
		"unknown",
		"NATIVE-READER-FALLBACK-V1",
		` ${policy}`,
		`${policy} `,
	].map((value) => ["--document-strategy", value, url]),
])("rejects invalid or duplicate strategy arguments %j", (...args) => {
	expect(() => parseResearchArguments(args)).toThrow(AgentBrowserError);
	noSetup();
});

const incompatibleFlags = [
	["--reader"],
	["--reader-raw-policy", "separate-omitted-raw-v1"],
	["--reader-visibility-policy", "source-hidden-v1"],
	["--reader-visibility-policy", "source-hidden-inline-v1"],
	["--reader-mime-policy", "markdown-html-document-v1"],
	["--reader-fallback-encoding", "utf-8"],
	["--document-profile", "long-v1"],
	["--selector", "main"],
	["--lines", "1:2"],
	["--section", "h1"],
	["--headings"],
	["--find", "evidence"],
	["--content-focus", "main-content-v1"],
	["--content-focus", "main-content-v2"],
	["--content-focus", "main-content-v3"],
	["--json-pointer", ""],
	["--output-limit-policy", "text-prefix-v1"],
	["--source-link-label-policy", "source-aria-label-v1"],
	["--source-heading-policy", "source-aria-heading-v1"],
	["--prefer-markdown"],
];

it.each(incompatibleFlags)(
	"rejects incompatible options in both orders %j",
	(...options) => {
		for (const args of [
			[...flags, ...options, url],
			[...options, ...flags, url],
		])
			expect(() => parseResearchArguments(args)).toThrow(AgentBrowserError);
		noSetup();
	},
);

it.each([
	["--document-profile", "default"],
	["--capture-body"],
	["--https-redirect-policy", "same-origin-upgrade-v1"],
	["--min-request-interval-ms", "0"],
	["--format", "json", "--table-metadata"],
	["--format", "markdown", "--compact-tables", "--table-rows"],
])("preserves compatible flags in both orders %j", (...options) => {
	const baseline = parseResearchArguments([...options, url]);
	for (const args of [
		[...flags, ...options, url],
		[...options, ...flags, url],
	])
		expect(parseResearchArguments(args)).toEqual({
			...baseline,
			documentStrategy: policy,
		});
	noSetup();
});

it.each([
	null,
	false,
	true,
	0,
	1,
	{},
	[],
	"",
	"native",
	` ${policy}`,
	`${policy} `,
])("rejects invalid programmatic strategy %j before effects", async (value) => {
	await expect(
		navigate({
			documentStrategy: value,
		} as unknown as ResearchExecutionOptions),
	).rejects.toMatchObject({ code: "invalid-input" });
	noSetup();
});

it.each<ResearchExecutionOptions>([
	{ readerRawPolicy: "separate-omitted-raw-v1" },
	{ readerVisibilityPolicy: "source-hidden-v1" },
	{ readerVisibilityPolicy: "source-hidden-inline-v1" },
	{ readerMimePolicy: "markdown-html-document-v1" },
	{ readerFallbackEncoding: "utf-8" },
	{ contentFocus: "main-content-v1" },
	{ contentFocus: "main-content-v2" },
	{ contentFocus: "main-content-v3" },
	{ jsonPointer: "" },
	{ outputLimitPolicy: "text-prefix-v1" },
	{ sourceLinkLabelPolicy: "source-aria-label-v1" },
	{ sourceHeadingPolicy: "source-aria-heading-v1" },
	{ preferMarkdown: true },
])("rejects incompatible programmatic policies %j", async (options) => {
	await expect(
		navigate({ ...options, documentStrategy: policy }),
	).rejects.toMatchObject({ code: "invalid-input" });
	noSetup();
});

it.each<NonNullable<Parameters<typeof navigate>[1]>>([
	{ reader: true },
	{ selector: "main" },
	{ lines: { start: 1, end: 2 } },
	{ section: "h1" },
	{ headings: true },
	{ find: "evidence" },
	{ reader: true, documentProfile: "long-v1", headings: true },
])("rejects incompatible programmatic selection %j", async (navigation) => {
	await expect(navigate(undefined, navigation)).rejects.toMatchObject({
		code: "invalid-input",
	});
	noSetup();
});

it.each([false, true])(
	"preserves omitted-strategy report fields and loader arity for reader=%j",
	async (reader) => {
		enqueue("<h1>Owned content</h1>");
		const report = await navigate({}, { reader });
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.profile).toBe(reader ? researchReaderProfile : "native");
		for (const field of [
			"documentStrategy",
			"readerRawPolicy",
			"readerVisibilityPolicy",
			"readerFallbackEncoding",
		])
			expect(report).not.toHaveProperty(field);
		expect(JSON.stringify(report)).not.toContain('"documentStrategy"');
		expect(
			fallbackLoader.loadNativeReaderFallbackDocument,
		).not.toHaveBeenCalled();
		expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
		const calls = reader
			? vi.mocked(readerLoader.loadResearchDocument).mock.calls
			: vi.mocked(nativeLoader.loadBrowserDocument).mock.calls;
		expect(calls).toHaveLength(1);
		expect(calls[0]).toHaveLength(2);
		closed(report);
	},
);

it("keeps successful CSS-hidden native output empty without trying the reader", async () => {
	const response = enqueue(
		'<style>.error-template { display: none; }</style><div class="error-template">MISLEADING_ERROR_TEMPLATE</div>',
	);
	const report = await navigate();
	expect(report).toMatchObject({
		profile: "native",
		outcome: "empty-extraction",
		contentSuccess: false,
		documentStrategy: { policy, mode: "native" },
	});
	expect(report.extraction?.content).toBe("");
	expect(report.documentStrategy).toEqual({ policy, mode: "native" });
	expect(Object.isFrozen(report.documentStrategy)).toBe(true);
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
	expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledOnce();
	const tree = await vi.mocked(nativeLoader.loadBrowserDocument).mock.results[0]
		.value;
	expect(tree.mutationMetrics().closed).toBe(true);
	captured(report, response);
	closed(report);
});

it("falls back once on the same captured body and uses an independent visibility tree", async () => {
	const response = enqueue();
	const body = response.body.slice();
	const failure = nativeFailure();
	const report = await navigate();
	expect(report).toMatchObject({
		profile: researchReaderProfile,
		outcome: "extracted-unverified",
		contentSuccess: null,
		readerRawPolicy: "separate-omitted-raw-v1",
		readerVisibilityPolicy: "source-hidden-inline-v1",
		readerFallbackEncoding: "utf-8",
		reader: {
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: "source-attributes-and-inline-display",
			visibilityPolicy: "source-hidden-inline-v1",
			rawTextPolicy: "separate-omitted-raw-v1",
			encoding: "utf-8",
			fallbackEncoding: "utf-8",
		},
	});
	expect(report.documentStrategy).toEqual({
		policy,
		mode: "reader",
		nativeFailure: {
			category: "resource-limit",
			stage: "loader",
			resourceLimit: resourceLimitDiagnostic(failure),
		},
	});
	expect(Object.isFrozen(report.documentStrategy)).toBe(true);
	expect(Object.isFrozen(report.documentStrategy?.nativeFailure)).toBe(true);
	expect(
		Object.isFrozen(report.documentStrategy?.nativeFailure?.resourceLimit),
	).toBe(true);
	expect(report.failure).toBeUndefined();
	expect(report.extraction?.content).toContain("Visible café evidence\\.");
	for (const omitted of [
		"HIDDEN_SENTINEL",
		"INLINE_SENTINEL",
		"/module.js",
		"/data.json",
		"PRIVATE_NATIVE_SOURCE",
	])
		expect(report.extraction?.content).not.toContain(omitted);
	expect(JSON.stringify(report.documentStrategy)).not.toContain(
		"PRIVATE_NATIVE_SOURCE",
	);
	expect(
		fallbackLoader.loadNativeReaderFallbackDocument,
	).toHaveBeenCalledOnce();
	expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledOnce();
	expect(readerLoader.loadResearchDocument).toHaveBeenCalledTimes(2);
	const nativeCall = vi.mocked(nativeLoader.loadBrowserDocument).mock.calls[0];
	const [chosen, evidence] = vi.mocked(readerLoader.loadResearchDocument).mock
		.calls;
	expect(nativeCall[0]).toBe(response);
	expect(chosen[0]).toBe(response);
	expect(evidence[0]).toBe(response);
	expect(chosen[1]).toBe(nativeCall[1]);
	expect(Object.keys(chosen[1]).sort()).toEqual(["limits", "signal", "tabId"]);
	expect(chosen.slice(2)).toEqual([
		undefined,
		"separate-omitted-raw-v1",
		"source-hidden-inline-v1",
		undefined,
		"utf-8",
	]);
	expect(evidence[1].initializeDocument).toEqual(expect.any(Function));
	expect(evidence.slice(2)).toEqual([
		undefined,
		"separate-omitted-raw-v1",
		undefined,
		undefined,
		"utf-8",
	]);
	expect(response.body).toEqual(body);
	captured(report, response);
	closed(report);
});

it.each([
	{ format: "json" as const, tableMetadata: true },
	{ format: "markdown" as const, tableRows: true, compactTables: true },
])(
	"forwards parsed batch options to fallback and visibility evidence %j",
	async (options) => {
		enqueue();
		nativeFailure();
		const tableFlags =
			options.format === "json"
				? ["--table-metadata"]
				: ["--table-rows", "--compact-tables"];
		const reports = [];
		for await (const report of researchBatch([
			...flags,
			"--document-profile",
			"default",
			"--capture-body",
			"--min-request-interval-ms",
			"0",
			"--format",
			options.format,
			...tableFlags,
			url,
		]))
			reports.push(report);
		expect(reports).toHaveLength(1);
		expect(reports[0].documentStrategy?.mode).toBe("reader");
		expect(reports[0].outcome).toBe("extracted-unverified");
		expect(reports[0].extraction?.format).toBe(options.format);
		expect(visibility.researchVisibilityEvidence).toHaveBeenCalledOnce();
		const call = vi.mocked(visibility.researchVisibilityEvidence).mock.calls[0];
		expect(call[1].initializeDocument).toBeUndefined();
		expect(call[2]).toBe("default");
		expect(call[3]).toBe("separate-omitted-raw-v1");
		expect(call[4]).toMatchObject({
			...options,
			method: "document",
			limits: {
				maxBytes: researchRunLimits.extractionBytes,
				maxNodes: 50_000,
				maxDepth: 128,
			},
		});
		expect(call.slice(5)).toEqual([undefined, "utf-8"]);
		closed(reports[0]);
	},
);

it("retains native failure provenance and attempted reader policy when both loaders fail", async () => {
	const response = enqueue();
	nativeFailure();
	vi.mocked(readerLoader.loadResearchDocument).mockImplementationOnce(() => {
		throw new AgentBrowserError("unsupported", "PRIVATE_READER_SOURCE");
	});
	const report = await navigate();
	expect(report).toMatchObject({
		profile: researchReaderProfile,
		outcome: "failure",
		failure: { category: "unsupported", stage: "loader" },
		readerRawPolicy: "separate-omitted-raw-v1",
		readerVisibilityPolicy: "source-hidden-inline-v1",
		readerFallbackEncoding: "utf-8",
		documentStrategy: {
			policy,
			mode: "reader",
			nativeFailure: {
				category: "resource-limit",
				stage: "loader",
				resourceLimit: {
					kind: "html.tokens",
					unit: "tokens",
					limit: 10,
					observed: 11,
				},
			},
		},
	});
	expect(report.reader).toBeUndefined();
	expect(JSON.stringify(report)).not.toMatch(
		/PRIVATE_(?:NATIVE|READER)_SOURCE/,
	);
	expect(readerLoader.loadResearchDocument).toHaveBeenCalledOnce();
	expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
	captured(report, response);
	closed(report);
});

it.each(["policy-denied", "network-error", "aborted", "timeout"] as const)(
	"does not fall back for native %s errors",
	async (category) => {
		enqueue();
		vi.mocked(nativeLoader.loadBrowserDocument).mockRejectedValueOnce(
			new AgentBrowserError(category, "PRIVATE_NATIVE_SOURCE"),
		);
		const report = await navigate();
		expect(report.documentStrategy).toEqual({ policy, mode: "native" });
		expect(report.profile).toBe("native");
		expect(report.failure).toEqual({ category, stage: "loader" });
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		closed(report);
	},
);

it("does not fall back for unknown native errors", async () => {
	enqueue();
	vi.mocked(nativeLoader.loadBrowserDocument).mockRejectedValueOnce(
		new Error("PRIVATE_NATIVE_SOURCE"),
	);
	const report = await navigate();
	expect(report.documentStrategy).toEqual({ policy, mode: "native" });
	expect(report.outcome).toBe("failure");
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(JSON.stringify(report)).not.toContain("PRIVATE_NATIVE_SOURCE");
	closed(report);
});

it("does not fall back when cancelled after the native attempt", async () => {
	const controller = new AbortController();
	enqueue();
	vi.mocked(nativeLoader.loadBrowserDocument).mockImplementationOnce(
		async () => {
			controller.abort();
			throw new AgentBrowserError("unsupported", "Synthetic native failure");
		},
	);
	const report = await navigate(undefined, { signal: controller.signal });
	expect(report.documentStrategy).toEqual({ policy, mode: "native" });
	expect(report.failure?.category).toBe("aborted");
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	closed(report);
});

it.each([404, 500, 503])(
	"does not fall back after an HTTP %s native failure",
	async (status) => {
		const response = enqueue("<p>Unavailable</p>", { status });
		nativeFailure();
		const report = await navigate();
		expect(report.outcome).toBe("http-failure");
		expect(report.documentStrategy).toEqual({ policy, mode: "native" });
		expect(report.failure?.category).toBe("resource-limit");
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		captured(report, response);
		closed(report);
	},
);

it.each([401, 403, 429, 503])(
	"preserves HTTP/access stops and batch closure for status %s",
	async (status) => {
		const html =
			status === 401
				? "<title>Sign in</title><p>Email address and password. Sign in to continue</p>"
				: status === 403
					? "<p>You've been blocked by network security</p>"
					: "<p>Unavailable</p>";
		const response = enqueue(html, {
			status,
			headers: {
				"content-type": ["text/html"],
				...(status === 503 ? { "retry-after": ["60"] } : {}),
			},
		});
		const reports = [];
		for await (const report of researchBatch([
			...flags,
			"--capture-body",
			url,
			`${url}/later`,
		]))
			reports.push(report);
		expect(reports).toHaveLength(1);
		const report = reports[0];
		expect(report.documentStrategy).toEqual({ policy, mode: "native" });
		expect(report.profile).toBe("native");
		expect(report.outcome).toBe(
			status === 401 || status === 403 ? "semantic-barrier" : "http-failure",
		);
		if (status === 429)
			expect(report.rateLimit?.action).toBe("stop-without-retry");
		if (status === 503)
			expect(report.serviceBackoff?.action).toBe("stop-without-retry");
		expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledTimes(
			status === 401 || status === 403 ? 1 : 0,
		);
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		captured(report, response);
		closed(report);
	},
);

it("retains a source challenge that the fallback visibility policy omits", async () => {
	enqueue(
		"<title hidden>Just a moment...</title><noscript hidden>Enable JavaScript and cookies to continue</noscript><main><p>Ordinary visible content</p></main>",
	);
	nativeFailure();
	const report = await navigate();
	expect(report).toMatchObject({
		profile: researchReaderProfile,
		outcome: "semantic-barrier",
		classification: { barrier: "challenge" },
		failure: { category: "policy-denied", stage: "semantic-barrier" },
		documentStrategy: {
			policy,
			mode: "reader",
			nativeFailure: { category: "resource-limit", stage: "loader" },
		},
		reader: { visibilityPolicy: "source-hidden-inline-v1" },
	});
	expect(report.extraction).toBeUndefined();
	expect(visibility.researchVisibilityEvidence).toHaveBeenCalledOnce();
	closed(report);
});

it("keeps a successful native response inert without fetching referenced resources", async () => {
	enqueue();
	const report = await navigate();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.documentStrategy).toEqual({ policy, mode: "native" });
	expect(report.profile).toBe("native");
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
	const call = vi.mocked(nativeLoader.loadBrowserDocument).mock.calls[0];
	expect(Object.keys(call[1]).sort()).toEqual(["limits", "signal", "tabId"]);
	const tree = await vi.mocked(nativeLoader.loadBrowserDocument).mock.results[0]
		.value;
	expect(tree.mutationMetrics().closed).toBe(true);
	closed(report);
});

it("falls back for unsupported native loading without inventing resource provenance", async () => {
	enqueue();
	vi.mocked(nativeLoader.loadBrowserDocument).mockRejectedValueOnce(
		new AgentBrowserError("unsupported", "PRIVATE_NATIVE_SOURCE"),
	);
	const report = await navigate();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.documentStrategy).toEqual({
		policy,
		mode: "reader",
		nativeFailure: { category: "unsupported", stage: "loader" },
	});
	closed(report);
});

it.each<NetworkResponse["headers"]>([
	{},
	{ "content-type": ["text/plain"] },
	{ "content-type": ["text/html", "text/html"] },
])(
	"does not fall back without one explicit HTML MIME type %j",
	async (headers) => {
		enqueue("<p>Owned source</p>", { headers });
		nativeFailure();
		const report = await navigate();
		expect(report.documentStrategy).toEqual({ policy, mode: "native" });
		expect(report.failure?.category).toBe("resource-limit");
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		closed(report);
	},
);

it("reports explicit native strategy when network policy prevents loading", async () => {
	const report = await navigate();
	expect(report.documentStrategy).toEqual({ policy, mode: "native" });
	expect(report.failure).toMatchObject({
		category: "policy-denied",
		stage: "network",
	});
	expect(report.profile).toBe("native");
	expect(
		fallbackLoader.loadNativeReaderFallbackDocument,
	).not.toHaveBeenCalled();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	closed(report);
});

it("closes the initialized fallback document when source evidence fails", async () => {
	enqueue();
	nativeFailure();
	vi.mocked(visibility.researchVisibilityEvidence).mockImplementationOnce(
		() => {
			throw resourceLimitError(
				"reader.output",
				1,
				2,
				"PRIVATE_EVIDENCE_SOURCE",
			);
		},
	);
	const report = await navigate();
	expect(report.documentStrategy?.mode).toBe("reader");
	expect(report.documentStrategy?.nativeFailure?.category).toBe(
		"resource-limit",
	);
	expect(report.failure).toMatchObject({
		category: "resource-limit",
		stage: "loader",
		resourceLimit: { kind: "reader.output" },
	});
	expect(report.reader?.visibilityPolicy).toBe("source-hidden-inline-v1");
	expect(readerLoader.loadResearchDocument).toHaveBeenCalledOnce();
	expect(JSON.stringify(report)).not.toContain("PRIVATE_EVIDENCE_SOURCE");
	closed(report);
});

it("does not retry either loader after extraction fails", async () => {
	enqueue("<h1>Owned content</h1>");
	vi.mocked(extraction.extractDocument).mockImplementationOnce(() => {
		throw resourceLimitError(
			"extraction.output",
			1,
			2,
			"Synthetic extraction failure",
		);
	});
	const report = await navigate();
	expect(report.documentStrategy).toEqual({ policy, mode: "native" });
	expect(report.failure?.category).toBe("resource-limit");
	expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledOnce();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	closed(report);
});
