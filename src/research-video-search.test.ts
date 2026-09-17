import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as capture from "../scripts/research-body-capture.js";
import * as nativeResearch from "../scripts/research-browser.js";
import { hasResearchExtractionContent } from "../scripts/research-content.js";
import {
	parseResearchVideoSearchArguments,
	researchVideoSearch,
	researchVideoSearchLimits,
} from "../scripts/research-video-search.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as loader from "./research-loader.js";
import { researchReaderInfo } from "./research-reader-info.js";
import { researchSourceVideos } from "./research-source-videos.js";
import { BrowserSession } from "./session.js";

type Report = Awaited<ReturnType<typeof researchVideoSearch>>;

const query = "local llm hardware";
const url = "https://www.youtube.com/results?search_query=local+llm+hardware";
const article =
	"<main><h1>Visible guide</h1><p>Useful native DOM content.</p></main>";
const privateFailure = "PRIVATE_VIDEO_SEARCH_FAILURE";
const privateSource = "PRIVATE_VIDEO_SOURCE_CONFIGURATION";
const controllers: AbortController[] = [];
const originalExtract = extraction.extractDocument;

function video(index = 0, overrides: Record<string, unknown> = {}) {
	const videoId = `fixture${String(index).padStart(4, "0")}`;
	return {
		videoRenderer: {
			videoId,
			title: {
				runs: [{ text: "Source café 😀 " }, { text: `video ${index}` }],
			},
			ownerText: { runs: [{ text: "Fixture author" }] },
			lengthText: { simpleText: "12:34" },
			publishedTimeText: { simpleText: "2 days ago" },
			viewCountText: { simpleText: "1,234 views" },
			detailedMetadataSnippets: [
				{
					snippetText: {
						runs: [{ text: "Literal <b>source</b> &amp; text." }],
					},
				},
			],
			navigationEndpoint: {
				watchEndpoint: { videoId },
				commandMetadata: {
					webCommandMetadata: {
						url: `/watch?v=${videoId}&tracking=${privateSource}`,
					},
				},
			},
			trackingParams: privateSource,
			...overrides,
		},
	};
}

function assignment(items: unknown[] = [video()]): string {
	return `var ytInitialData = ${JSON.stringify({
		responseContext: { visitorData: privateSource },
		contents: {
			twoColumnSearchResultsRenderer: {
				primaryContents: {
					sectionListRenderer: {
						contents: [{ itemSectionRenderer: { contents: items } }],
					},
				},
			},
		},
	})};`;
}

function source(items: unknown[] = [video()]): string {
	return `<script>${assignment(items)}</script>`;
}

function serve(bodyText = source(), options: Partial<NetworkResponse> = {}) {
	const body = new TextEncoder().encode(bodyText);
	const response: NetworkResponse = {
		url,
		status: 200,
		headers: { "content-type": ["text/html"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...options,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
	return response;
}

function controller() {
	const value = new AbortController();
	controllers.push(value);
	return value;
}

function requests(
	expected: readonly string[] = [url],
	redirectMode: "manual" | "follow" = "manual",
) {
	const calls = vi.mocked(NodeNetworkTransport.prototype.request).mock.calls;
	expect(calls.map(([request]) => request.url)).toEqual(expected);
	for (const [request] of calls) {
		expect(request.method ?? "GET").toBe("GET");
		expect(request.redirect ?? "follow").toBe(redirectMode);
		expect(request.body).toBeUndefined();
		expect(request.cookieContext?.credentials).toBe("omit");
		const headers = Object.fromEntries(
			Object.entries(request.headers ?? {}).map(([name, value]) => [
				name.toLowerCase(),
				value,
			]),
		);
		expect(headers).toMatchObject({ "user-agent": "AgentBrowser/0.1" });
		for (const name of ["cookie", "authorization", "proxy-authorization"])
			expect(headers).not.toHaveProperty(name);
	}
}

function navigateWithOptions(options: nativeResearch.ResearchExecutionOptions) {
	return nativeResearch.researchNavigation(
		url,
		true,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		options,
	);
}

async function lastNativeReport(): Promise<nativeResearch.ResearchNavigationReport> {
	const result = vi
		.mocked(nativeResearch.researchNavigation)
		.mock.results.at(-1);
	expect(result?.type).toBe("return");
	if (!result || result.type !== "return")
		throw new Error("Expected real native research navigation");
	return result.value;
}

function videos(report: Report) {
	expect(report.sourceVideos).toBeDefined();
	if (!report.sourceVideos) throw new Error("Expected source video records");
	return report.sourceVideos;
}

function unsuccessful(report: Report, outcome: Report["outcome"]) {
	expect(report).toMatchObject({
		kind: "native-video-search-v1",
		query,
		url,
		partial: true,
		rendered: false,
		verified: false,
		outcome,
		contentSuccess: false,
	});
	expect(report).not.toHaveProperty("sourceVideos");
	expect(JSON.stringify(report)).not.toContain(privateSource);
	expect(JSON.stringify(report)).not.toContain(privateFailure);
}

function sanitized(error: unknown, code: string) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	if (!(error instanceof AgentBrowserError))
		throw new Error("Expected sanitized video search error");
	expect(error.code).toBe(code);
	expect(error.cause).toBeUndefined();
	for (const text of [error.message, error.stack ?? "", JSON.stringify(error)])
		expect(text).not.toContain(privateFailure);
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(
		NodeNetworkTransport.prototype,
		"requestWithRoutes",
	).mockImplementation(function (this: NodeNetworkTransport, request) {
		return this.request(request);
	});
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(nativeResearch, "researchNavigation");
	vi.spyOn(capture, "captureResearchBody");
	vi.spyOn(loader, "loadResearchDocument");
	vi.spyOn(extraction, "extractDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Video search fixtures must not fetch");
		}),
	);
	vi.stubGlobal(
		"sourceVideoEffect",
		vi.fn(() => {
			throw new Error("Video source must not execute");
		}),
	);
});

afterEach(() => {
	const sessions = vi.mocked(BrowserSession.prototype.createTab).mock
		.contexts as BrowserSession[];
	try {
		expect(fetch).not.toHaveBeenCalled();
		expect(Reflect.get(globalThis, "sourceVideoEffect")).not.toHaveBeenCalled();
		expect(capture.captureResearchBody).not.toHaveBeenCalled();
		for (const session of sessions)
			expect(session.metrics()).toMatchObject({
				closed: true,
				tabs: 0,
				pendingLoads: 0,
				cleanupErrors: 0,
				network: { active: 0, closed: true },
			});
		if (sessions.length) {
			expect(BrowserSession.prototype.close).toHaveBeenCalled();
			expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
		}
		for (const result of vi.mocked(loader.loadResearchDocument).mock.results) {
			if (result.type !== "return") continue;
			expect(result.value.mutationMetrics().closed).toBe(true);
			expect(researchSourceVideos(result.value)).toBeUndefined();
		}
	} finally {
		for (const value of controllers.splice(0)) value.abort();
		for (const session of sessions) session.close();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

describe("video search argument preflight", () => {
	it.each([
		query,
		"  café 😀 & a+b/%?#=  ",
		"cafe\u0301",
		"\u00a0hardware\u2003",
		"first\u2028second\u2029third",
		"--help",
		"a&search_query=other&url=https://example.invalid/",
		"x".repeat(256),
		"😀".repeat(128),
	])("preserves valid decoded query %j in one canonical parameter", (value) => {
		const parsed = parseResearchVideoSearchArguments(["--query", value]);
		expect(parsed).toEqual({
			query: value,
			url: `https://www.youtube.com/results?${new URLSearchParams({ search_query: value })}`,
		});
		const target = new URL(parsed.url);
		expect(target.origin).toBe("https://www.youtube.com");
		expect(target.pathname).toBe("/results");
		expect([...target.searchParams]).toEqual([["search_query", value]]);
		expect(target.hash).toBe("");
		requests([]);
		expect(nativeResearch.researchNavigation).not.toHaveBeenCalled();
	});

	it.each([
		{ name: "empty", value: "" },
		{ name: "blank", value: " \u00a0\u2003 " },
		{ name: "257 UTF-16 units", value: "x".repeat(257) },
		{ name: "129 surrogate pairs", value: "😀".repeat(129) },
		{ name: "NUL", value: "query\u0000" },
		{ name: "tab", value: "query\ttext" },
		{ name: "newline", value: "query\ntext" },
		{ name: "carriage return", value: "query\rtext" },
		{ name: "DEL", value: "query\u007f" },
		{ name: "C1 control", value: "query\u0085" },
		{ name: "soft hyphen", value: "query\u00ad" },
		{ name: "zero-width joiner", value: "query\u200d" },
		{ name: "bidi override", value: "query\u202e" },
		{ name: "byte order mark", value: "\ufeffquery" },
		{ name: "supplementary format control", value: "query\u{e0001}" },
		{ name: "unpaired high surrogate", value: "query\ud800" },
		{ name: "unpaired low surrogate", value: "query\udfff" },
		{ name: "broken surrogate pair", value: "\ud800text\udc00" },
		{ name: "undefined", value: undefined },
		{ name: "null", value: null },
		{ name: "number", value: 123 },
		{ name: "array", value: [query] },
		{ name: "boxed string", value: Object(query) },
	])("rejects $name before native setup", async ({ value }) => {
		expect(() =>
			parseResearchVideoSearchArguments(["--query", value] as string[]),
		).toThrow(AgentBrowserError);
		const error: unknown = await researchVideoSearch(value as string).catch(
			(error: unknown) => error,
		);
		sanitized(error, "invalid-input");
		requests([]);
		expect(nativeResearch.researchNavigation).not.toHaveBeenCalled();
		expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	});

	it.each([
		{ name: "no arguments", args: [] },
		{ name: "positional query", args: [query] },
		{ name: "missing query", args: ["--query"] },
		{ name: "wrong flag", args: ["--url", url] },
		{ name: "equals syntax", args: [`--query=${query}`] },
		{ name: "duplicate flag", args: ["--query", query, "--query", query] },
		{ name: "extra URL", args: ["--query", query, url] },
		{
			name: "profile override",
			args: ["--query", query, "--document-profile", "long-v1"],
		},
		{ name: "body capture", args: ["--query", query, "--capture-body"] },
		{ name: "selector", args: ["--query", query, "--selector", "main"] },
		{ name: "string instead of array", args: query },
		{ name: "null arguments", args: null },
		{ name: "nonstring flag", args: [null, query] },
	])("rejects $name without a request", ({ args }) => {
		expect(() =>
			parseResearchVideoSearchArguments(args as readonly string[]),
		).toThrow(AgentBrowserError);
		requests([]);
		expect(nativeResearch.researchNavigation).not.toHaveBeenCalled();
	});

	it("declares bounded output and operation lifetime", () => {
		expect(researchVideoSearchLimits).toMatchObject({
			maxOutputBytes: 65_536,
			timeoutMs: 120_000,
		});
	});
});

describe("native source-video search composition", () => {
	it.each(["", article])(
		"returns unverified source records without changing native DOM outcome: %j",
		async (content) => {
			const response = serve(`<!-- 😀 -->\r\n${source()}${content}`);
			const report = await researchVideoSearch(query);
			const native = await lastNativeReport();
			const nativeOutcome = content
				? "extracted-unverified"
				: "empty-extraction";
			expect(report).toMatchObject({
				kind: "native-video-search-v1",
				query,
				url,
				partial: true,
				rendered: false,
				verified: false,
				outcome: "source-results-unverified",
				contentSuccess: null,
				nativeOutcome,
				classification: {
					classifier: "browser-challenges",
					barrier: null,
					diagnostic: null,
				},
				metrics: { active: 0, closed: true },
			});
			expect(report.source).toEqual(native.primaryResponse);
			expect(report.source).toMatchObject({
				url: "https://www.youtube.com/results?redacted",
				status: 200,
				decodedBytes: response.body.byteLength,
				encodedBytes: response.encodedBytes,
				bodySha256: createHash("sha256").update(response.body).digest("hex"),
				hashScope: "transport-decoded-body-before-loader",
				redirects: 0,
			});
			expect(native.outcome).toBe(nativeOutcome);
			expect(native.contentSuccess).toBe(content ? null : false);
			expect(native.extraction).toBeDefined();
			if (!native.extraction) throw new Error("Missing native extraction");
			expect(hasResearchExtractionContent(native.extraction)).toBe(!!content);
			expect(nativeResearch.researchExitCode([native])).toBe(content ? 0 : 1);
			expect(JSON.stringify(native.extraction.content)).not.toContain(
				"Source café",
			);
			expect(report.sourceVideos).toEqual(native.extraction.sourceVideos);
			const records = videos(report);
			expect(records).toMatchObject({
				kind: "youtube-search-video-results-v1",
				scope: "document-source",
				partial: true,
				rendered: false,
				verified: false,
				textFormat: "plain-text",
				query,
				truncated: false,
			});
			expect(records.entries).toEqual([
				{
					videoId: "fixture0000",
					url: "https://www.youtube.com/watch?v=fixture0000",
					title: "Source café 😀 video 0",
					authorText: "Fixture author",
					durationText: "12:34",
					publishedText: "2 days ago",
					viewsText: "1,234 views",
					snippetText: "Literal <b>source</b> &amp; text.",
					truncated: false,
					source: {
						offset: "<!-- 😀 -->\n".length,
						offsetBasis: "lf-normalized-utf16",
						path: "$.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].videoRenderer",
					},
				},
			]);
			expect(report.failure).toBeUndefined();
			expect(report.rateLimit).toBeUndefined();
			expect(report.serviceBackoff).toBeUndefined();
			expect(JSON.stringify(report)).not.toContain(privateSource);
			requests();
		},
	);

	it("uses only the explicit reader configuration and never follows source resources", async () => {
		serve(`${source()}<p hidden>HIDDEN_SENTINEL</p><p style="display:none">INLINE_HIDDEN_SENTINEL</p>
			<script>globalThis.sourceVideoEffect(); var ytcfg = {secret:"${privateSource}"};</script>
			<script src="/never.js"></script><link rel="stylesheet" href="/never.css">
			<img src="/never.png"><a href="/watch?v=fixture0000">Watch</a>`);
		const report = await researchVideoSearch(query);
		expect(report.outcome).toBe("source-results-unverified");
		expect(nativeResearch.researchNavigation).toHaveBeenCalledOnce();
		const call = vi.mocked(nativeResearch.researchNavigation).mock.calls[0];
		expect(call[0]).toBe(url);
		expect(call[1]).toBe(true);
		for (const index of [3, 5, 6, 8, 9]) expect(call[index]).toBeUndefined();
		expect(call[4] ?? false).toBe(false);
		expect(call[7] ?? false).toBe(false);
		expect(call[10]).toEqual({
			redirectMode: "manual",
			format: "markdown",
			readerRawPolicy: "separate-omitted-raw-v1",
			readerVisibilityPolicy: "source-hidden-inline-v1",
			readerFallbackEncoding: "utf-8",
		});
		expect(loader.loadResearchDocument).toHaveBeenCalled();
		const loads = vi.mocked(loader.loadResearchDocument).mock.calls;
		expect(
			loads.some(
				(load) =>
					load[3] === "separate-omitted-raw-v1" &&
					load[4] === "source-hidden-inline-v1" &&
					load[6] === "utf-8",
			),
		).toBe(true);
		const native = await lastNativeReport();
		expect(native.reader?.scripting).toBe(false);
		for (const sentinel of [
			privateSource,
			"HIDDEN_SENTINEL",
			"INLINE_HIDDEN_SENTINEL",
		])
			expect(JSON.stringify(native.extraction?.content)).not.toContain(
				sentinel,
			);
		for (const key of [
			"bodyCapture",
			"extraction",
			"reader",
			"selection",
			"headings",
			"textLines",
			"admission",
			"sourceProducts",
		])
			expect(report).not.toHaveProperty(key);
		expect(JSON.stringify(report)).not.toContain(privateSource);
		requests();
	});

	it("preserves query spelling through the request, reader, and report", async () => {
		const value = "  café 😀 & a+b/%?#=  ";
		const target = `https://www.youtube.com/results?${new URLSearchParams({ search_query: value })}`;
		serve(source(), { url: target });
		const report = await researchVideoSearch(value);
		expect(report).toMatchObject({
			query: value,
			url: target,
			outcome: "source-results-unverified",
			contentSuccess: null,
		});
		expect(videos(report).query).toBe(value);
		requests([target]);
	});

	it.each(["", article])(
		"does not turn a record-free DOM into source results: %j",
		async (content) => {
			serve(content);
			const report = await researchVideoSearch(query);
			unsuccessful(report, "empty-source");
			expect(report.nativeOutcome).toBe(
				content ? "extracted-unverified" : "empty-extraction",
			);
			requests();
		},
	);

	it.each([
		{ name: "duplicate assignments", body: `${source()}${source()}` },
		{ name: "empty records", body: source([]) },
		{
			name: "invalid endpoint",
			body: source([
				video(0, {
					navigationEndpoint: { watchEndpoint: { videoId: "fixture0001" } },
				}),
			]),
		},
		{
			name: "nonliteral script",
			body: `<script>${assignment()} globalThis.sourceVideoEffect();</script>`,
		},
		{
			name: "module script",
			body: `<script type="module">${assignment()}</script>`,
		},
		{
			name: "hidden assignment",
			body: `<section hidden>${source()}</section>`,
		},
		{
			name: "inline-hidden assignment",
			body: `<section style="display:none">${source()}</section>`,
		},
		{
			name: "unrelated JSON metadata",
			body: '<script type="application/ld+json">{"@type":"VideoObject","name":"Source video"}</script>',
		},
	])("rejects $name despite useful DOM content", async ({ body }) => {
		serve(`${body}${article}`);
		const report = await researchVideoSearch(query);
		unsuccessful(report, "empty-source");
		expect(report.nativeOutcome).toBe("extracted-unverified");
		requests();
	});

	it.each([
		"https://www.youtube.com/watch?v=fixture0000",
		"https://www.youtube.com/shorts/fixture0000",
		"https://example.invalid/results?search_query=local+llm+hardware",
		"https://www.youtube.com/results",
		`${url}&search_query=another`,
		"https://www.youtube.com/results?search_query=different+query",
		"https://www.youtube.com/results?search_query=+local+llm+hardware+",
	])("does not accept response records from route %s", async (responseUrl) => {
		serve(`${source()}${article}`, { url: responseUrl });
		unsuccessful(await researchVideoSearch(query), "empty-source");
		requests();
	});

	it("retains the first twenty bounded records and their document paths", async () => {
		serve(source(Array.from({ length: 25 }, (_, index) => video(index))));
		const records = videos(await researchVideoSearch(query));
		expect(records.truncated).toBe(true);
		expect(records.entries).toHaveLength(20);
		expect(records.entries.map((entry) => entry.videoId)).toEqual(
			Array.from(
				{ length: 20 },
				(_, index) => `fixture${String(index).padStart(4, "0")}`,
			),
		);
		expect(records.entries[19].source.path).toBe(
			"$.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents[19].videoRenderer",
		);
		expect(Buffer.byteLength(JSON.stringify(records))).toBeLessThanOrEqual(
			32_768,
		);
		requests();
	});

	it("preserves the source byte budget with multibyte literal fields", async () => {
		serve(
			source(
				Array.from({ length: 20 }, (_, index) =>
					video(index, {
						title: { simpleText: "😀".repeat(512) },
						detailedMetadataSnippets: [
							{ snippetText: { simpleText: "😀".repeat(1024) } },
						],
					}),
				),
			),
		);
		const report = await researchVideoSearch(query);
		const records = videos(report);
		expect(records.entries.length).toBeGreaterThan(0);
		expect(records.entries.length).toBeLessThan(20);
		expect(records.truncated).toBe(true);
		expect(Buffer.byteLength(JSON.stringify(records))).toBeLessThanOrEqual(
			32_768,
		);
		expect(records).toEqual(
			(await lastNativeReport()).extraction?.sourceVideos,
		);
		requests();
	});

	it("keeps field truncation instead of leaking oversized optional source text", async () => {
		serve(source([video(0, { ownerText: { simpleText: "a".repeat(257) } })]));
		const records = videos(await researchVideoSearch(query));
		expect(records.truncated).toBe(true);
		expect(records.entries).toHaveLength(1);
		expect(records.entries[0].truncated).toBe(true);
		expect(records.entries[0]).not.toHaveProperty("authorText");
		requests();
	});
});

describe("API-only manual redirect policy", () => {
	it.each([
		"https://www.youtube.com/watch?v=fixture0000",
		"https://www.youtube.com/results?search_query=different",
		"https://example.invalid/redirect-target",
		"/watch?v=fixture0000",
	])("does not follow HTTP 302 Location %s", async (location) => {
		serve(`${source()}${article}`, {
			status: 302,
			headers: { "content-type": ["text/html"], location: [location] },
		});
		const report = await researchVideoSearch(query);
		unsuccessful(report, "http-failure");
		expect(report.nativeOutcome).toBe("http-failure");
		expect(report.source).toMatchObject({ status: 302, redirects: 0 });
		requests();
	});

	it.each([
		{ name: "follow", value: "follow" },
		{ name: "error", value: "error" },
		{ name: "uppercase", value: "MANUAL" },
		{ name: "padded", value: " manual " },
		{ name: "empty", value: "" },
		{ name: "null", value: null },
		{ name: "boolean", value: true },
		{ name: "number", value: 0 },
		{ name: "array", value: ["manual"] },
		{ name: "object", value: {} },
	])("rejects $name redirectMode before native setup", async ({ value }) => {
		const error: unknown = await navigateWithOptions({
			redirectMode: value as "manual",
		}).catch((error: unknown) => error);
		sanitized(error, "invalid-input");
		requests([]);
		expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	});

	it.each([{}, { redirectMode: undefined }])(
		"preserves generic follow-default behavior and empty DOM semantics: %j",
		async (options) => {
			serve(source());
			const report = await navigateWithOptions(options);
			expect(report.outcome).toBe("empty-extraction");
			expect(report.contentSuccess).toBe(false);
			expect(report.extraction?.sourceVideos?.entries).toHaveLength(1);
			if (!report.extraction) throw new Error("Missing native extraction");
			expect(hasResearchExtractionContent(report.extraction)).toBe(false);
			expect(nativeResearch.researchExitCode([report])).toBe(1);
			requests([url], "follow");
		},
	);

	it("does not introduce a generic CLI redirect override", () => {
		expect(() =>
			nativeResearch.parseResearchArguments([
				"--reader",
				"--redirect-mode",
				"manual",
				url,
			]),
		).toThrow(AgentBrowserError);
		requests([]);
	});
});

describe("source-video failure and cancellation boundaries", () => {
	it.each([302, 403, 404, 429, 500, 503])(
		"preserves HTTP %s without exposing source results or retrying",
		async (status) => {
			serve(`${source()}${article}`, {
				status,
				headers: { "content-type": ["text/html"], "retry-after": ["60"] },
			});
			const report = await researchVideoSearch(query);
			const native = await lastNativeReport();
			unsuccessful(report, "http-failure");
			expect(report.nativeOutcome).toBe("http-failure");
			expect(report.source).toEqual(native.primaryResponse);
			expect(report.source?.status).toBe(status);
			expect(report.failure).toEqual(native.failure);
			expect(report.classification).toEqual(native.classification);
			expect(report.rateLimit).toEqual(native.rateLimit);
			expect(report.serviceBackoff).toEqual(native.serviceBackoff);
			if (status === 429)
				expect(report.rateLimit).toMatchObject({
					kind: "http-rate-limit",
					status: 429,
					action: "stop-without-retry",
				});
			if (status === 503)
				expect(report.serviceBackoff).toMatchObject({
					kind: "http-service-backoff",
					status: 503,
					action: "stop-without-retry",
				});
			requests();
		},
	);

	it.each(["header", "visible challenge", "hidden source challenge"] as const)(
		"preserves a 200 %s barrier even with source records",
		async (kind) => {
			const challenge =
				kind === "header"
					? ""
					: `<title>Just a moment...</title><aside${kind === "hidden source challenge" ? " hidden" : ""}>Checking your browser. Verify you are human. Complete the CAPTCHA.</aside>`;
			serve(`${challenge}${source()}${article}`, {
				headers: {
					"content-type": ["text/html"],
					...(kind === "header" ? { "cf-mitigated": ["challenge"] } : {}),
				},
			});
			const report = await researchVideoSearch(query);
			const native = await lastNativeReport();
			unsuccessful(report, "semantic-barrier");
			expect(report.nativeOutcome).toBe("semantic-barrier");
			expect(report.source?.status).toBe(200);
			expect(report.classification).toEqual(native.classification);
			expect(report.classification.barrier).toBeTruthy();
			expect(report.failure).toEqual(native.failure);
			requests();
		},
	);

	it.each([
		"network-error",
		"timeout",
		"resource-limit",
		"policy-denied",
		"internal-error",
	] as const)("sanitizes native %s and closes resources", async (category) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			category === "internal-error"
				? new Error(privateFailure)
				: new AgentBrowserError(category, privateFailure),
		);
		const report = await researchVideoSearch(query);
		unsuccessful(report, "failure");
		expect(report.nativeOutcome).toBe("failure");
		expect(report.source).toBeNull();
		expect(report.failure).toMatchObject({ category });
		expect(report.metrics).toMatchObject({ active: 0, closed: true });
		requests();
	});

	it("does not promote source records when native extraction fails", async () => {
		serve(source());
		vi.mocked(extraction.extractDocument).mockImplementation(
			(tree, options) => {
				if (
					researchReaderInfo(tree)?.visibilityPolicy ===
					"source-hidden-inline-v1"
				)
					throw new AgentBrowserError("resource-limit", privateFailure);
				return originalExtract(tree, options);
			},
		);
		const report = await researchVideoSearch(query);
		unsuccessful(report, "failure");
		expect(report.source?.status).toBe(200);
		expect(report.failure).toMatchObject({ category: "resource-limit" });
		requests();
	});

	it("rejects pre-aborted work before native setup without leaking the reason", async () => {
		const cancellation = controller();
		cancellation.abort(new Error(privateFailure));
		const before = getEventListeners(cancellation.signal, "abort");
		const error: unknown = await researchVideoSearch(
			query,
			cancellation.signal,
		).catch((error: unknown) => error);
		sanitized(error, "aborted");
		requests([]);
		expect(nativeResearch.researchNavigation).not.toHaveBeenCalled();
		expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
		expect(getEventListeners(cancellation.signal, "abort")).toEqual(before);
	});

	it("cancels an in-flight native request and releases the caller listener", async () => {
		const cancellation = controller();
		const callerListener = vi.fn();
		cancellation.signal.addEventListener("abort", callerListener);
		const before = getEventListeners(cancellation.signal, "abort");
		let requestSignal: AbortSignal | undefined;
		vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
			async (request) => {
				requestSignal = request.signal;
				cancellation.abort(new Error(privateFailure));
				throw new AgentBrowserError("aborted", privateFailure);
			},
		);
		const error: unknown = await researchVideoSearch(
			query,
			cancellation.signal,
		).catch((error: unknown) => error);
		sanitized(error, "aborted");
		expect(requestSignal?.aborted).toBe(true);
		expect(callerListener).toHaveBeenCalledOnce();
		expect(getEventListeners(cancellation.signal, "abort")).toEqual(before);
		requests();
	});

	it("does not publish late source records after cancellation during extraction", async () => {
		const cancellation = controller();
		const before = getEventListeners(cancellation.signal, "abort");
		serve(source());
		vi.mocked(extraction.extractDocument).mockImplementation(
			(tree, options) => {
				const result = originalExtract(tree, options);
				if (
					researchReaderInfo(tree)?.visibilityPolicy ===
					"source-hidden-inline-v1"
				) {
					expect(result.sourceVideos?.entries).toHaveLength(1);
					cancellation.abort(new Error(privateFailure));
				}
				return result;
			},
		);
		const error: unknown = await researchVideoSearch(
			query,
			cancellation.signal,
		).catch((error: unknown) => error);
		sanitized(error, "aborted");
		expect(getEventListeners(cancellation.signal, "abort")).toEqual(before);
		requests();
	});
});
