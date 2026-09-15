import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as visibility from "../scripts/research-visibility.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import { BrowserSession } from "./session.js";

const url = "https://reader-fallback.fixture.invalid/article";
const otherUrl = "https://reader-fallback.fixture.invalid/other";
const fallbackFlags = ["--reader-fallback-encoding", "utf-8"];
const rawPolicy = "separate-omitted-raw-v1";
const mimePolicy = "markdown-html-document-v1";
const source =
	'<!doctype html><html><head><title>Café fixture</title></head><body><h1 id="article">Résumé — café</h1><p>Visible café evidence.</p><p hidden>HIDDEN_SENTINEL</p></body></html>';
const longFlags = [
	"--document-profile",
	"long-v1",
	"--reader",
	"--capture-body",
	"--headings",
];

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(loader, "loadResearchDocument");
	vi.spyOn(visibility, "researchVisibilityEvidence");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected synthetic fetch");
		}),
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function enqueue(text = source, type = "text/html", responseUrl = url) {
	const body = new TextEncoder().encode(text);
	const response: NetworkResponse = {
		url: responseUrl,
		status: 200,
		headers: { "content-type": [type] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
	return body;
}

function navigate(
	options: ResearchExecutionOptions = { readerFallbackEncoding: "utf-8" },
	profile?: ResearchDocumentProfileId,
	reader = true,
) {
	return researchNavigation(
		url,
		reader,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		profile === "long-v1",
		undefined,
		profile,
		options,
	);
}

function noSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(loader.loadResearchDocument).not.toHaveBeenCalled();
	expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
}

function closed(report: ResearchNavigationReport, count = 1) {
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(count);
	for (const [request] of vi.mocked(NodeNetworkTransport.prototype.request).mock
		.calls) {
		expect(request.cookieContext).toMatchObject({ credentials: "omit" });
		expect(request.body).toBeUndefined();
	}
	expect(fetch).not.toHaveBeenCalled();
}

it("adds only explicit canonical fallback selection and documents its scope", () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	expect(parseResearchArguments(["--reader", url])).toEqual({
		reader: true,
		urls: [url],
	});
	for (const args of [
		["--reader", ...fallbackFlags, url],
		[...fallbackFlags, url, "--reader"],
		[...longFlags, ...fallbackFlags, url],
	]) {
		expect(parseResearchArguments(args)).toMatchObject({
			reader: true,
			readerFallbackEncoding: "utf-8",
			urls: [url],
		});
	}
	const cli = readFileSync(
		new URL("../scripts/research-browser.ts", import.meta.url),
		"utf8",
	);
	expect(cli).toContain("[--reader-fallback-encoding utf-8]");
	expect(cli).toContain("UTF-8 fallback applies only to HTML");
	noSetup();
});

it.each([
	["--reader", url, "--reader-fallback-encoding"],
	["--reader", "--reader-fallback-encoding", "--headings", url],
	...["", "unknown", "UTF-8", "utf8", " utf-8", "utf-8 ", "windows-1252"].map(
		(value) => ["--reader", "--reader-fallback-encoding", value, url],
	),
	["--reader", ...fallbackFlags, ...fallbackFlags, url],
	[...fallbackFlags, url],
	["--reader", "--reader-fallback-encoding=utf-8", url],
	[...longFlags, ...fallbackFlags, url, otherUrl],
	[
		...longFlags.filter((flag) => flag !== "--capture-body"),
		...fallbackFlags,
		url,
	],
	[...longFlags.filter((flag) => flag !== "--headings"), ...fallbackFlags, url],
	[...longFlags, ...fallbackFlags, "--reader-mime-policy", mimePolicy, url],
	[...longFlags, ...fallbackFlags, "--prefer-markdown", url],
	[...longFlags, ...fallbackFlags, "--format", "json", url],
	["--reader", ...fallbackFlags, "--table-metadata", url],
	[
		"--reader",
		...fallbackFlags,
		"--reader-mime-policy",
		mimePolicy,
		"--lines",
		"1:2",
		url,
	],
	[
		"--reader",
		...fallbackFlags,
		"--reader-mime-policy",
		mimePolicy,
		"--find",
		"café",
		url,
	],
	["--reader", ...fallbackFlags, "--prefer-markdown", "--selector", "h1", url],
	["--reader", ...fallbackFlags, "--selector", "h1", "--lines", "1:2", url],
	[
		"--reader",
		...fallbackFlags,
		"--content-focus",
		"main-content-v1",
		"--headings",
		url,
	],
	[
		"--reader",
		...fallbackFlags,
		"--output-limit-policy",
		"text-prefix-v1",
		"--format",
		"json",
		url,
	],
])("rejects invalid CLI combinations %j before effects", async (...args) => {
	expect(() => parseResearchArguments(args)).toThrow(AgentBrowserError);
	await expect(researchBatch(args).next()).rejects.toMatchObject({
		code: "invalid-input",
	});
	noSetup();
});

it.each([
	null,
	false,
	1,
	{},
	[],
	"",
	"UTF-8",
	"utf8",
	" utf-8",
	"utf-8 ",
	"windows-1252",
])("rejects invalid API fallback %j before effects", async (value) => {
	await expect(
		navigate({
			readerFallbackEncoding: value,
		} as unknown as ResearchExecutionOptions),
	).rejects.toMatchObject({ code: "invalid-input" });
	noSetup();
});

it.each([false, 1, "true"])(
	"requires exact API reader true rather than %j",
	async (reader) => {
		await expect(
			navigate(undefined, undefined, reader as boolean),
		).rejects.toMatchObject({
			code: "invalid-input",
		});
		noSetup();
	},
);

it.each([
	{ readerRawPolicy: "unknown" },
	{ readerVisibilityPolicy: "unknown" },
	{ readerMimePolicy: "unknown" },
	{ tableMetadata: true },
	{ compactTables: true, format: "json" },
	{ tableRows: true, format: "json" },
	{ outputLimitPolicy: "text-prefix-v1", format: "json" },
])("preserves API option exclusions with fallback: %j", async (options) => {
	await expect(
		navigate({
			...options,
			readerFallbackEncoding: "utf-8",
		} as ResearchExecutionOptions),
	).rejects.toMatchObject({ code: "invalid-input" });
	noSetup();
});

it.each([
	{ readerMimePolicy: mimePolicy },
	{ preferMarkdown: true },
	{ format: "json" as const },
] as const)(
	"preserves long API exclusions with fallback: %j",
	async (options) => {
		await expect(
			navigate({ ...options, readerFallbackEncoding: "utf-8" }, "long-v1"),
		).rejects.toMatchObject({ code: "invalid-input" });
		noSetup();
	},
);

it.each([
	["--prefer-markdown"],
	["--format", "json", "--table-metadata"],
	["--format", "markdown", "--compact-tables", "--table-rows"],
	[
		"--output-limit-policy",
		"text-prefix-v1",
		"--content-focus",
		"main-content-v1",
	],
	["--selector", "h1"],
	["--section", "h1"],
	["--lines", "1:2"],
	["--headings"],
	["--find", "café"],
	["--min-request-interval-ms", "0"],
])("preserves compatible CLI flags %j", (...flags) => {
	const baseline = parseResearchArguments(["--reader", ...flags, url]);
	expect(
		parseResearchArguments(["--reader", ...fallbackFlags, ...flags, url]),
	).toEqual({
		...baseline,
		readerFallbackEncoding: "utf-8",
	});
	noSetup();
});

const combinations = ([undefined, "default", "long-v1"] as const).flatMap(
	(profile) =>
		([undefined, rawPolicy] as const).flatMap((raw) =>
			(
				[undefined, "source-hidden-v1", "source-hidden-inline-v1"] as const
			).flatMap((hidden) =>
				([undefined, mimePolicy] as const)
					.filter((mime) => profile !== "long-v1" || mime === undefined)
					.map((mime) => ({ profile, raw, hidden, mime })),
			),
		),
);

it.each(combinations)(
	"propagates fallback across profile=$profile raw=$raw visibility=$hidden mime=$mime",
	async ({ profile, raw, hidden, mime }) => {
		const body = enqueue(source, mime ? "text/markdown" : "text/html");
		const report = await navigate(
			{
				readerFallbackEncoding: "utf-8",
				readerRawPolicy: raw,
				readerVisibilityPolicy: hidden,
				readerMimePolicy: mime,
			},
			profile,
		);
		expect(report).toMatchObject({
			readerFallbackEncoding: "utf-8",
			outcome: "extracted-unverified",
			partial: true,
			contentSuccess: null,
			reader: { fallbackEncoding: "utf-8", encoding: "utf-8" },
		});
		expect(JSON.stringify(report.headings ?? report.extraction)).toContain(
			"Résumé — café",
		);
		expect(loader.loadResearchDocument).toHaveBeenLastCalledWith(
			expect.any(Object),
			expect.any(Object),
			profile,
			raw,
			hidden,
			mime,
			"utf-8",
		);
		if (hidden) {
			expect(
				visibility.researchVisibilityEvidence,
			).toHaveBeenCalledExactlyOnceWith(
				expect.any(Object),
				expect.any(Object),
				profile,
				raw,
				expect.any(Object),
				mime,
				"utf-8",
			);
			expect(loader.loadResearchDocument).toHaveBeenNthCalledWith(
				1,
				expect.any(Object),
				expect.any(Object),
				profile,
				raw,
				undefined,
				mime,
				"utf-8",
			);
			expect(report.extraction?.content ?? "").not.toContain("HIDDEN_SENTINEL");
		}
		if (mime)
			expect(report.reader?.mimeInterpretation).toMatchObject({
				effectiveMime: "text/html",
			});
		expect(decodeResearchBodyCapture(report.bodyCapture, profile)).toEqual(
			body,
		);
		const emission = serializeResearchReport(report, profile);
		expect(emission.disposition).toBe("complete");
		expect(JSON.parse(new TextDecoder().decode(emission.jsonl))).toMatchObject({
			readerFallbackEncoding: "utf-8",
			reader: { fallbackEncoding: "utf-8" },
		});
		closed(report);
	},
);

it.each(combinations)(
	"preserves absent fallback shape for profile=$profile raw=$raw visibility=$hidden mime=$mime",
	async ({ profile, raw, hidden, mime }) => {
		enqueue(source, mime ? "text/markdown" : "text/html");
		const report = await navigate(
			{
				readerRawPolicy: raw,
				readerVisibilityPolicy: hidden,
				readerMimePolicy: mime,
			},
			profile,
		);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report).not.toHaveProperty("readerFallbackEncoding");
		expect(report.reader).not.toHaveProperty("fallbackEncoding");
		if (!mime) expect(report.reader?.encoding).toBe("windows-1252");
		const optionalArguments = hidden
			? [profile, raw, hidden, ...(mime ? [mime] : [])]
			: mime
				? [profile, raw, undefined, mime]
				: raw
					? [profile, raw]
					: profile === "long-v1"
						? [profile]
						: [];
		expect(loader.loadResearchDocument).toHaveBeenLastCalledWith(
			expect.any(Object),
			expect.any(Object),
			...optionalArguments,
		);
		if (hidden) {
			expect(
				visibility.researchVisibilityEvidence,
			).toHaveBeenCalledExactlyOnceWith(
				expect.any(Object),
				expect.any(Object),
				profile,
				raw,
				expect.any(Object),
				...(mime ? [mime] : []),
			);
		}
		closed(report);
	},
);

it.each([
	{
		name: "HTTP charset",
		text: source,
		type: "text/html; charset=windows-1252",
		encoding: "windows-1252",
		content: "cafÃ©",
	},
	{
		name: "BOM",
		text: `\uFEFF${source}`,
		type: "text/html",
		encoding: "utf-8",
		content: "café",
	},
	{
		name: "early meta",
		text: source.replace("<head>", '<head><meta charset="windows-1252">'),
		type: "text/html",
		encoding: "windows-1252",
		content: "cafÃ©",
	},
	{
		name: "late meta fallback",
		text: `${" ".repeat(1100)}${source.replace("<head>", '<head><meta charset="windows-1252">')}`,
		type: "text/html",
		encoding: "utf-8",
		content: "café",
	},
	{
		name: "plain text",
		text: "Résumé — café",
		type: "text/plain",
		encoding: "utf-8",
		content: "café",
	},
	{
		name: "Markdown",
		text: "# Résumé — café",
		type: "text/markdown",
		encoding: "utf-8",
		content: "café",
	},
])(
	"keeps explicit metadata with $name decoding",
	async ({ text, type, encoding, content }) => {
		enqueue(text, type);
		const report = await navigate();
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			readerFallbackEncoding: "utf-8",
			reader: { fallbackEncoding: "utf-8", encoding },
		});
		expect(report.extraction?.content).toContain(content);
		closed(report);
	},
);

it("passes fallback to every URL in a batch without additional requests", async () => {
	enqueue();
	enqueue(source, "text/html", otherUrl);
	const reports: ResearchNavigationReport[] = [];
	for await (const report of researchBatch([
		"--reader",
		...fallbackFlags,
		url,
		otherUrl,
	]))
		reports.push(report);
	expect(reports).toHaveLength(2);
	for (const report of reports) {
		expect(report).toMatchObject({
			readerFallbackEncoding: "utf-8",
			reader: { fallbackEncoding: "utf-8", encoding: "utf-8" },
		});
		expect(report.extraction?.content).toContain("Résumé — café");
		closed(report, 2);
	}
});

it.each(["network", "loader"] as const)(
	"keeps fallback provenance on %s failure",
	async (stage) => {
		if (stage === "loader")
			enqueue(source, "text/html; charset=unknown-charset");
		const report = await navigate();
		expect(report).toMatchObject({
			readerFallbackEncoding: "utf-8",
			outcome: "failure",
			contentSuccess: false,
			failure: { stage },
		});
		expect(report.extraction).toBeUndefined();
		closed(report);
	},
);

it("retains fallback and stops the batch for an unfiltered hidden barrier", async () => {
	enqueue(
		source
			.replace("Café fixture", "Security check")
			.replace("HIDDEN_SENTINEL", "Verify you are human"),
	);
	const reports: ResearchNavigationReport[] = [];
	for await (const report of researchBatch([
		"--reader",
		...fallbackFlags,
		"--reader-visibility-policy",
		"source-hidden-v1",
		url,
		otherUrl,
	]))
		reports.push(report);
	expect(reports).toHaveLength(1);
	expect(reports[0]).toMatchObject({
		readerFallbackEncoding: "utf-8",
		outcome: "semantic-barrier",
		classification: { barrier: "challenge" },
		failure: { category: "policy-denied", stage: "semantic-barrier" },
	});
	expect(reports[0].extraction).toBeUndefined();
	expect(loader.loadResearchDocument).toHaveBeenCalledExactlyOnceWith(
		expect.any(Object),
		expect.any(Object),
		undefined,
		undefined,
		undefined,
		undefined,
		"utf-8",
	);
	closed(reports[0]);
});

it.each(["text/plain", "text/markdown"])(
	"leaves default %s decoding unchanged",
	async (type) => {
		enqueue("Résumé — café", type);
		const baseline = await navigate({ readerFallbackEncoding: undefined });
		enqueue("Résumé — café", type);
		const selected = await navigate();
		expect(baseline.reader).not.toHaveProperty("fallbackEncoding");
		expect(baseline).not.toHaveProperty("readerFallbackEncoding");
		expect(selected.reader?.encoding).toBe(baseline.reader?.encoding);
		expect(selected.extraction?.content).toBe(baseline.extraction?.content);
		expect(selected.extraction?.content).toContain("Résumé — café");
		closed(selected, 2);
	},
);

it("retains fallback during explicit text-prefix recovery", async () => {
	enqueue(
		`<h1>Résumé — café</h1><p>${"Visible café evidence. ".repeat(14_000)}</p>`,
	);
	const report = await navigate({
		readerFallbackEncoding: "utf-8",
		readerRawPolicy: rawPolicy,
		readerVisibilityPolicy: "source-hidden-v1",
		outputLimitPolicy: "text-prefix-v1",
	});
	expect(report).toMatchObject({
		readerFallbackEncoding: "utf-8",
		outcome: "extracted-unverified",
		reader: { fallbackEncoding: "utf-8", encoding: "utf-8" },
		extraction: { contentFallback: { truncated: true } },
	});
	expect(report.extraction?.content).toContain("Résumé — café");
	for (const call of vi.mocked(loader.loadResearchDocument).mock.calls) {
		expect(call).toHaveLength(7);
		expect(call[6]).toBe("utf-8");
	}
	closed(report);
});
