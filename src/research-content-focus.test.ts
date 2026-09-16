import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const url = "https://content-focus.fixture.invalid/article";
const encoder = new TextEncoder();
const policy = "main-content-v1";
const policies = [policy, "main-content-v2"] as const;
const flags = ["--content-focus", policy];
const enabled: ResearchExecutionOptions = {
	contentFocus: policy,
	minRequestIntervalMs: 0,
};
const source =
	'<!DOCTYPE html><html><head><title>Research article</title></head><body><aside id="sidebar"><h2>Outside heading</h2><p>Outside evidence retained in capture</p></aside><main id="selected"><h1>Useful heading</h1><p>Useful main evidence</p></main></body></html>';
const modes = [true, false].flatMap((reader) =>
	(["markdown", "json"] as const).map((format) => ({ reader, format })),
);

interface NavigationOptions {
	reader?: boolean;
	selector?: string;
	section?: string;
	lines?: { start: number; end: number };
	headings?: boolean;
	find?: string;
	profile?: "default" | "long-v1";
	execution?: ResearchExecutionOptions;
}

interface BarrierFixture {
	name: string;
	reader: boolean;
	prefix: string;
	execution: ResearchExecutionOptions;
	headers: NetworkResponse["headers"];
	evidence: string;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected content focus request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	const original = extraction.extractDocument;
	vi.spyOn(extraction, "extractDocument").mockImplementation(
		(tree, options) => {
			const result = original(tree, options);
			if (options?.contentFocus === policy) {
				const selected = new DocumentQueries(tree).querySelector("#selected");
				expect(result.scope).toBe(tree.reference(selected ?? tree.root));
			}
			return result;
		},
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Content focus fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		try {
			for (const session of new Set(
				vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
			))
				if (session instanceof BrowserSession) session.close();
			for (const transport of new Set(
				vi.mocked(NodeNetworkTransport.prototype.request).mock.contexts,
			))
				if (transport instanceof NodeNetworkTransport) transport.close();
		} finally {
			vi.restoreAllMocks();
			vi.unstubAllGlobals();
		}
	}
});

function response(
	text = source,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = encoder.encode(text);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	};
}

function navigate(options: NavigationOptions = {}) {
	return researchNavigation(
		url,
		options.reader ?? true,
		undefined,
		options.selector,
		true,
		options.lines,
		options.section,
		options.headings ?? false,
		options.find,
		options.profile,
		options.execution ?? enabled,
	);
}

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function content(report: ResearchNavigationReport): string {
	const result = report.extraction;
	if (!result) throw new Error("Expected content focus extraction");
	return result.format === "markdown"
		? result.content
		: JSON.stringify(result.content);
}

function expectClosed() {
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
		if (!(tree instanceof DocumentTree)) throw new Error("Expected owned tree");
		expect(tree.mutationMetrics().closed).toBe(true);
	}
}

async function fixture(input = response(), options: NavigationOptions = {}) {
	vi.clearAllMocks();
	const original = structuredClone(input);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await navigate(options);
	expect(
		NodeNetworkTransport.prototype.request,
	).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({
			url,
			cookieContext: expect.objectContaining({ credentials: "omit" }),
		}),
	);
	const request = vi.mocked(NodeNetworkTransport.prototype.request).mock
		.calls[0][0];
	expect(request.method ?? "GET").toBe("GET");
	expect(request.body).toBeUndefined();
	for (const name of Object.keys(request.headers ?? {}))
		expect(["authorization", "proxy-authorization", "cookie"]).not.toContain(
			name.toLowerCase(),
		);
	expectClosed();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.partial).toBe(true);
	expect(input).toEqual(original);
	expect(report.primaryResponse).toMatchObject({
		status: original.status,
		headers: original.headers,
		decodedBytes: original.body.byteLength,
		bodySha256: hash(original.body),
		hashScope: "transport-decoded-body-before-loader",
	});
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(original.body);
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const restored = JSON.parse(
		new TextDecoder().decode(serialized.jsonl),
	) as ResearchNavigationReport;
	expect(restored.contentFocus).toBe(report.contentFocus);
	expect(restored.extraction).toEqual(report.extraction);
	expect(restored.primaryResponse).toEqual(report.primaryResponse);
	expect(restored.bodyCapture).toEqual(report.bodyCapture);
	return {
		report,
		raw: serialized.jsonl,
		trusted: {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: {
				bytes: original.body.byteLength,
				sha256: hash(original.body),
			},
		},
	};
}

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(DocumentTree.prototype.close).not.toHaveBeenCalled();
	expect(extraction.extractDocument).not.toHaveBeenCalled();
}

function expectFocused(
	report: ResearchNavigationReport,
	contentFocus: ResearchExecutionOptions["contentFocus"] = policy,
) {
	expect(report).toMatchObject({
		contentFocus,
		outcome: "extracted-unverified",
		contentSuccess: null,
		classification: { barrier: null, diagnostic: null },
	});
	expect(report.failure).toBeUndefined();
	const selection = report.extraction?.contentSelection;
	expect(selection?.policy).toBe(contentFocus);
	expect(Number.isSafeInteger(selection?.scannedNodes)).toBe(true);
	expect(selection?.scannedNodes).toBeGreaterThan(0);
	const calls = vi.mocked(extraction.extractDocument).mock.calls;
	expect(
		calls.filter(([, options]) => options?.contentFocus === contentFocus),
	).toHaveLength(1);
	expect(calls.at(-1)?.[1]?.contentFocus).toBe(contentFocus);
}

describe.each(policies)("%s argument validation", (contentFocus) => {
	const flags = ["--content-focus", contentFocus];
	it.each(
		[
			[],
			["--format", "json"],
			["--reader"],
			["--reader", "--format", "json"],
			["--reader", "--prefer-markdown"],
			["--reader", "--prefer-markdown", "--format", "json"],
			["--reader", "--output-limit-policy", "text-prefix-v1"],
			["--reader", "--reader-mime-policy", "markdown-html-document-v1"],
		].map((args) => ({ args })),
	)("accepts focus with $args", ({ args }) => {
		expect(parseResearchArguments([...args, ...flags, url])).toMatchObject({
			contentFocus,
			urls: [url],
		});
		expectNoSetup();
	});

	it.each(
		[
			["--content-focus"],
			["--content-focus", "--reader", url],
			["--content-focus", "unknown", url],
			["--content-focus", "main-content-v3", url],
			["--content-focus", "MAIN-CONTENT-V2", url],
			["--content-focus", " main-content-v2", url],
			["--content-focus", "main-content-v2\n", url],
			[...flags, ...flags, url],
			[...flags, "--content-focus", "main-content-v2", url],
			[...flags, "--output-limit-policy", "text-prefix-v1", url],
			[
				"--reader",
				...flags,
				"--output-limit-policy",
				"text-prefix-v1",
				"--format",
				"json",
				url,
			],
			...[
				["--selector", "main"],
				["--section", "#selected"],
				["--lines", "1:2"],
				["--find", "Useful"],
			].flatMap(([flag, value]) => [
				["--reader", ...flags, flag, value, url],
				["--reader", flag, value, ...flags, url],
			]),
			["--reader", ...flags, "--headings", url],
			["--reader", "--headings", ...flags, url],
			[
				"--reader",
				...flags,
				"--document-profile",
				"long-v1",
				"--capture-body",
				"--headings",
				url,
			],
		].map((args) => ({ args })),
	)("rejects invalid CLI combinations before setup: $args", ({ args }) => {
		expect(() => parseResearchArguments(args)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expectNoSetup();
	});

	it.each([
		null,
		false,
		true,
		1,
		{},
		[],
		"",
		"unknown",
		"main-content-v3",
		"MAIN-CONTENT-V2",
		" main-content-v2",
		"main-content-v2\n",
	])("rejects invalid API focus %j before setup", async (contentFocus) => {
		await expect(
			navigate({
				execution: {
					...enabled,
					contentFocus,
				} as unknown as ResearchExecutionOptions,
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
		expectNoSetup();
	});

	it.each<NavigationOptions>([
		{ selector: "main" },
		{ section: "#selected" },
		{ lines: { start: 1, end: 2 } },
		{ headings: true },
		{ find: "Useful" },
		{ profile: "long-v1", headings: true },
		{
			reader: false,
			execution: { ...enabled, outputLimitPolicy: "text-prefix-v1" },
		},
		{
			execution: {
				...enabled,
				outputLimitPolicy: "text-prefix-v1",
				format: "json",
			},
		},
	])("rejects API selection conflicts before setup: %j", async (options) => {
		await expect(
			navigate({
				...options,
				execution: { ...enabled, ...options.execution, contentFocus },
			}),
		).rejects.toMatchObject({
			code: "invalid-input",
		});
		expectNoSetup();
	});
});

describe.each(modes)(
	"focus workflow reader=$reader format=$format",
	({ reader, format }) => {
		it("keeps the default extraction whole-document", async () => {
			expect(parseResearchArguments([url])).not.toHaveProperty("contentFocus");
			const { report } = await fixture(response(), {
				reader,
				execution: { format, minRequestIntervalMs: 0 },
			});
			expect(report).not.toHaveProperty("contentFocus");
			expect(report.extraction).not.toHaveProperty("contentSelection");
			expect(report.extraction?.scope).toBe(report.extraction?.document);
			expect(content(report)).toContain("Outside evidence");
			expect(content(report)).toContain("Useful main evidence");
		});

		it.each([
			{
				name: "unique main",
				body: '<main id="selected"><p>Chosen evidence</p></main><article><p>Other article evidence</p></article>',
				selected: "main",
				reason: "unique-main",
				mainCandidates: 1,
				articleCandidates: 1,
			},
			{
				name: "unique article",
				body: '<article id="selected"><p>Chosen evidence</p></article>',
				selected: "article",
				reason: "unique-article",
				mainCandidates: 0,
				articleCandidates: 1,
			},
			{
				name: "ambiguous main",
				body: "<main><p>First main</p></main><main><p>Second main</p></main><article><p>Only article</p></article>",
				selected: "document",
				reason: "ambiguous-main",
				mainCandidates: 2,
				articleCandidates: 1,
			},
			{
				name: "ambiguous article",
				body: "<article><p>First article</p></article><article><p>Second article</p></article>",
				selected: "document",
				reason: "ambiguous-article",
				mainCandidates: 0,
				articleCandidates: 2,
			},
			{
				name: "empty landmarks",
				body: "<main> \n </main><article> </article>",
				selected: "document",
				reason: "no-nonempty-landmark",
				mainCandidates: 0,
				articleCandidates: 0,
			},
			{
				name: "no landmarks",
				body: "<div><p>Ordinary document evidence</p></div>",
				selected: "document",
				reason: "no-nonempty-landmark",
				mainCandidates: 0,
				articleCandidates: 0,
			},
		])(
			"reports $name selection and the selected scope",
			async ({ body, name, ...selection }) => {
				const { report } = await fixture(
					response(
						`<html><head><title>Research article</title></head><body><aside>Outside evidence</aside>${body}</body></html>`,
					),
					{ reader, execution: { ...enabled, format } },
				);
				expectFocused(report);
				expect(report.extraction?.format).toBe(format);
				expect(report.extraction?.contentSelection).toMatchObject(selection);
				if (selection.selected === "document") {
					expect(content(report)).toContain("Outside evidence");
					expect(report.extraction?.scope).toBe(report.extraction?.document);
					if (name === "ambiguous main") {
						expect(content(report)).toContain("First main");
						expect(content(report)).toContain("Second main");
						expect(content(report)).toContain("Only article");
					}
					if (name === "ambiguous article") {
						expect(content(report)).toContain("First article");
						expect(content(report)).toContain("Second article");
					}
				} else {
					expect(content(report)).toContain("Chosen evidence");
					expect(content(report)).not.toContain("Outside evidence");
					expect(content(report)).not.toContain("Other article evidence");
					expect(report.extraction?.scope).not.toBe(
						report.extraction?.document,
					);
				}
			},
		);

		it.each(policies)(
			"threads CLI %s through batch execution",
			async (contentFocus) => {
				vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
					response(),
				);
				const reports: ResearchNavigationReport[] = [];
				for await (const report of researchBatch([
					...(reader ? ["--reader"] : []),
					"--content-focus",
					contentFocus,
					"--format",
					format,
					"--min-request-interval-ms",
					"0",
					url,
				]))
					reports.push(report);
				expect(reports).toHaveLength(1);
				expectFocused(reports[0], contentFocus);
				expect(reports[0].extraction?.format).toBe(format);
				expect(content(reports[0])).toContain("Useful main evidence");
				expect(content(reports[0])).not.toContain("Outside evidence");
				expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
				expectClosed();
			},
		);
	},
);

it.each(
	modes.flatMap((mode) =>
		[
			{ landmark: "article", sibling: "Useful sibling product" },
			{ landmark: "article", sibling: "" },
			{ landmark: "main", sibling: "Useful sibling product" },
		].map((scenario) => ({ ...mode, ...scenario })),
	),
)(
	"preserves policy selection for $landmark with sibling '$sibling', reader=$reader format=$format",
	async ({ reader, format, landmark, sibling }) => {
		for (const contentFocus of policies) {
			const fallback =
				contentFocus === "main-content-v2" &&
				landmark === "article" &&
				sibling !== "";
			const { report } = await fixture(
				response(
					`<html><body><nav>Outside navigation</nav><${landmark} id="selected"><h1>Owned heading</h1><p>Owned evidence</p></${landmark}><section>${sibling}</section><aside>Outside ancillary</aside></body></html>`,
				),
				{ reader, execution: { ...enabled, contentFocus, format } },
			);
			expectFocused(report, contentFocus);
			expect(report.extraction?.contentSelection).toMatchObject({
				policy: contentFocus,
				selected: fallback ? "document" : landmark,
				reason: fallback
					? "article-with-outside-content"
					: `unique-${landmark}`,
			});
			if (contentFocus === "main-content-v2")
				expect(report.extraction?.contentSelection).toHaveProperty(
					"outsideArticleContent",
					sibling !== "",
				);
			else
				expect(report.extraction?.contentSelection).not.toHaveProperty(
					"outsideArticleContent",
				);
			expect(content(report)).toContain("Owned evidence");
			if (fallback) {
				expect(report.extraction?.scope).toBe(report.extraction?.document);
				expect(content(report)).toContain("Useful sibling product");
				expect(content(report)).toContain("Outside navigation");
			} else {
				expect(report.extraction?.scope).not.toBe(report.extraction?.document);
				expect(content(report)).not.toContain("Useful sibling product");
				expect(content(report)).not.toContain("Outside navigation");
			}
		}
	},
);

it.each(
	modes.flatMap((mode) =>
		["text/markdown", "text/plain"].map((mime) => ({ ...mode, mime })),
	),
)(
	"keeps $mime literal with reader=$reader format=$format",
	async ({ reader, format, mime }) => {
		const { report } = await fixture(
			response(source, { headers: { "content-type": [mime] } }),
			{ reader, execution: { ...enabled, format } },
		);
		expectFocused(report);
		expect(report.extraction?.contentSelection).toMatchObject({
			selected: "document",
			reason: "no-nonempty-landmark",
			mainCandidates: 0,
			articleCandidates: 0,
		});
		expect(content(report)).toContain("Outside evidence");
		expect(content(report)).toContain("Useful main evidence");
		expect(report.reader?.mimeInterpretation).toBeUndefined();
	},
);

it.each(["markdown", "json"] as const)(
	"keeps negotiated Markdown literal without MIME interpretation in %s",
	async (format) => {
		const { report } = await fixture(
			response(source, { headers: { "content-type": ["text/markdown"] } }),
			{ execution: { ...enabled, format, preferMarkdown: true } },
		);
		expectFocused(report);
		expect(report.representationPreference).toBe("markdown");
		expect(report.reader?.mimeInterpretation).toBeUndefined();
		expect(report.extraction?.contentSelection).toMatchObject({
			selected: "document",
			reason: "no-nonempty-landmark",
			mainCandidates: 0,
			articleCandidates: 0,
		});
		expect(content(report)).toContain("Outside evidence");
		expect(content(report)).toContain("Useful main evidence");
	},
);

it.each(["markdown", "json"] as const)(
	"supports negotiated Markdown with explicit HTML interpretation in %s",
	async (format) => {
		const { report } = await fixture(
			response(source, { headers: { "content-type": ["text/markdown"] } }),
			{
				execution: {
					...enabled,
					format,
					preferMarkdown: true,
					readerMimePolicy: "markdown-html-document-v1",
				},
			},
		);
		expectFocused(report);
		expect(report.representationPreference).toBe("markdown");
		expect(report.reader?.mimeInterpretation).toMatchObject({
			effectiveMime: "text/html",
		});
		expect(report.extraction?.contentSelection?.selected).toBe("main");
		expect(content(report)).not.toContain("Outside evidence");
		expect(content(report)).toContain("Useful main evidence");
		const request = vi.mocked(NodeNetworkTransport.prototype.request).mock
			.calls[0][0];
		expect(request.headers).toMatchObject({
			accept: "text/markdown, text/html;q=0.9",
		});
	},
);

it("applies focus only to final extraction, not the unfiltered visibility check", async () => {
	const { report } = await fixture(response(), {
		execution: { ...enabled, readerVisibilityPolicy: "source-hidden-v1" },
	});
	expectFocused(report);
	const calls = vi.mocked(extraction.extractDocument).mock.calls;
	expect(calls.length).toBeGreaterThan(1);
	for (const [, options] of calls.slice(0, -1))
		expect(options?.contentFocus).toBeUndefined();
	const results = vi.mocked(extraction.extractDocument).mock.results;
	expect(JSON.stringify(results[0].value.content)).toContain(
		"Outside evidence",
	);
	expect(content(report)).not.toContain("Outside evidence");
});

it("combines focus with reader Markdown text-prefix recovery", async () => {
	const { report } = await fixture(
		response(
			`<aside>Outside evidence</aside><main id="selected"><p>${"Useful main evidence. ".repeat(16_000)}</p></main>`,
		),
		{ execution: { ...enabled, outputLimitPolicy: "text-prefix-v1" } },
	);
	expectFocused(report);
	expect(report.outputLimitPolicy).toBe("text-prefix-v1");
	expect(report.extraction?.contentSelection?.selected).toBe("main");
	expect(report.extraction?.contentFallback).toMatchObject({
		policy: "text-prefix-v1",
		truncated: true,
		trigger: { kind: "extraction.output", unit: "bytes", limit: 256_000 },
	});
	expect(content(report)).toContain("Useful main evidence");
	expect(content(report)).not.toContain("Outside evidence");
	expect(
		encoder.encode(JSON.stringify(report.extraction)).byteLength,
	).toBeLessThanOrEqual(256_000);
});

it.each<BarrierFixture>([
	{
		name: "whole-document challenge",
		reader: true,
		prefix: "<title>Security check</title><aside>Verify you are human</aside>",
		execution: enabled,
		headers: { "content-type": ["text/html"] },
		evidence: "html-challenge-markers",
	},
	{
		name: "native whole-document challenge",
		reader: false,
		prefix: "<title>Security check</title><aside>Verify you are human</aside>",
		execution: enabled,
		headers: { "content-type": ["text/html"] },
		evidence: "html-challenge-markers",
	},
	{
		name: "source noscript challenge",
		reader: true,
		prefix:
			"<title>Just a moment...</title><noscript>Enable JavaScript and cookies to continue</noscript>",
		execution: enabled,
		headers: { "content-type": ["text/html"] },
		evidence: "html-challenge-markers",
	},
	{
		name: "hidden source challenge",
		reader: true,
		prefix:
			"<title hidden>Just a moment...</title><aside hidden><noscript>Enable JavaScript and cookies to continue</noscript></aside>",
		execution: { ...enabled, readerVisibilityPolicy: "source-hidden-v1" },
		headers: { "content-type": ["text/html"] },
		evidence: "html-challenge-markers",
	},
	{
		name: "inline-hidden source challenge",
		reader: true,
		prefix:
			'<title>Just a moment...</title><aside style="display:none"><noscript>Enable JavaScript and cookies to continue</noscript></aside>',
		execution: {
			...enabled,
			readerVisibilityPolicy: "source-hidden-inline-v1",
		},
		headers: { "content-type": ["text/html"] },
		evidence: "html-challenge-markers",
	},
	{
		name: "Cloudflare response header",
		reader: true,
		prefix: "<title>Ordinary article</title>",
		execution: enabled,
		headers: { "content-type": ["text/html"], "cf-mitigated": ["challenge"] },
		evidence: "cf-mitigated-challenge",
	},
	{
		name: "native Cloudflare response header",
		reader: false,
		prefix: "<title>Ordinary article</title>",
		execution: enabled,
		headers: { "content-type": ["text/html"], "cf-mitigated": ["challenge"] },
		evidence: "cf-mitigated-challenge",
	},
])(
	"preserves $name before focus can erase it",
	async ({ reader, prefix, execution, headers, evidence }) => {
		for (const contentFocus of policies) {
			const { report } = await fixture(
				response(
					`${prefix}<main id="selected"><h1>Useful heading</h1><p>Useful main evidence</p></main>`,
					{ headers },
				),
				{ reader, execution: { ...execution, contentFocus } },
			);
			expect(report).toMatchObject({
				contentFocus,
				outcome: "semantic-barrier",
				contentSuccess: false,
				classification: { barrier: "challenge" },
			});
			expect(report.classification.diagnostic?.evidence).toContain(evidence);
			expect(report.extraction).toBeUndefined();
			for (const [, options] of vi.mocked(extraction.extractDocument).mock
				.calls)
				expect(options?.contentFocus).toBeUndefined();
		}
	},
);

it.each(["markdown", "json"] as const)(
	"preserves full capture and does not inherit focus during ordinary %s replay",
	async (format) => {
		const input = await fixture();
		expectFocused(input.report);
		expect(content(input.report)).not.toContain("Outside evidence");
		vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
		vi.mocked(extraction.extractDocument).mockClear();
		for (const selector of ["body", "#sidebar"]) {
			const replay = extractResearchReplayJson(
				input.raw,
				input.trusted,
				{ selector },
				undefined,
				format,
			);
			expect(replay.report).toMatchObject({
				networkRequests: 0,
				outcome: "extracted-unverified",
				contentSuccess: null,
			});
			expect(replay.report.extraction).not.toHaveProperty("contentSelection");
			expect(replay.report).not.toHaveProperty("contentFocus");
			expect(replay.jsonl).toContain("Outside evidence");
			if (selector === "body")
				expect(replay.jsonl).toContain("Useful main evidence");
			else
				expect(JSON.stringify(replay.report.extraction?.content)).not.toContain(
					"Useful main evidence",
				);
		}
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		for (const [, options] of vi.mocked(extraction.extractDocument).mock.calls)
			expect(options?.contentFocus).toBeUndefined();
	},
);
