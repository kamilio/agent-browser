import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import { researchNavigation } from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { documentFeeds, fitDocumentFeeds } from "./document-feeds.js";
import { DocumentTree } from "./document.js";
import * as extraction from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	researchReaderLimits,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type {
	ResearchReaderRawPolicy,
	ResearchReaderVisibilityPolicy,
} from "./research-reader-info.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";
import { loadTextDocument } from "./text-loader.js";

const url = "https://feeds.fixture.invalid/docs/article";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const formats = ["markdown", "json"] as const;
const rss = '<link rel="alternate" type="application/rss+xml" href="rss.xml">';
const atom =
	'<link rel="alternate" type="application/atom+xml" href="atom.xml">';
const alternate = '<link rel="alternate" type="text/markdown" href="guide.md">';
const article =
	'<main id="article"><h1>Guide</h1><p>Visible café evidence 😀. This guide explains how to read the visible source material while retaining headings and ordinary paragraphs in their original order.</p></main>';
const feeds = {
	kind: "html-feed-links-v1",
	scope: "document-head",
	partial: true,
	verified: false,
	truncated: false,
	entries: [
		{ type: "application/rss+xml", url: new URL("rss.xml", url).href },
		{ type: "application/atom+xml", url: new URL("atom.xml", url).href },
	],
} as const;
const context: DocumentLoaderContext = {
	tabId: "feed-discovery",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 128,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
let expectedRequests = 0;

function html(head = rss + atom, body = article): string {
	return `<!doctype html><html><head><title>Guide</title>${head}</head><body>${body}</body></html>`;
}

function response(source: string, mime = "text/html", status = 200) {
	const body = encoder.encode(source);
	return {
		url,
		status,
		headers: { "content-type": [`${mime}; charset=utf-8`] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function load(
	source = html(),
	reader = true,
	options: {
		mime?: string;
		rawPolicy?: ResearchReaderRawPolicy;
		visibilityPolicy?: ResearchReaderVisibilityPolicy;
	} = {},
) {
	const input = response(source, options.mime);
	const tree = reader
		? loadResearchDocument(
				input,
				context,
				undefined,
				options.rawPolicy,
				options.visibilityPolicy,
			)
		: options.mime && options.mime !== "text/html"
			? loadTextDocument(input, context)
			: parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function bytes(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

function hash(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

function nodeText(node: extraction.ExtractedNode): string {
	return [node.text ?? "", ...(node.children ?? []).map(nodeText)].join("");
}

function pin(
	report: Awaited<ReturnType<typeof researchNavigation>>,
	body: Uint8Array,
) {
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	return {
		raw: serialized.jsonl,
		trusted: {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

async function navigate(source = html()) {
	const input = response(source);
	expectedRequests = 1;
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{
			format: "markdown",
			minRequestIntervalMs: 0,
			preferMarkdown: true,
			readerRawPolicy: "separate-omitted-raw-v1",
		},
	);
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	expect(request).toHaveBeenCalledOnce();
	const sent = request.mock.calls[0][0];
	expect(sent).toMatchObject({ url, cookieContext: { credentials: "omit" } });
	expect(sent.method ?? "GET").toBe("GET");
	expect(sent.body).toBeUndefined();
	const headers = Object.fromEntries(
		Object.entries(sent.headers ?? {}).map(([name, value]) => [
			name.toLowerCase(),
			value,
		]),
	);
	expect(headers.accept).toBe("text/markdown, text/html;q=0.9");
	for (const name of ["authorization", "proxy-authorization", "cookie"])
		expect(headers).not.toHaveProperty(name);
	return { report, body: input.body };
}

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error("Unexpected feed request"),
	);
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.spyOn(extraction, "extractDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Feed discovery must not fetch");
		}),
	);
});

afterEach(() => {
	const sessions = new Set(
		vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
	);
	const transports = new Set(
		vi.mocked(NodeNetworkTransport.prototype.request).mock.contexts,
	);
	try {
		expect(fetch).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		for (const session of sessions) {
			if (!(session instanceof BrowserSession))
				throw new Error("Missing fixture session");
			expect(session.metrics().closed).toBe(true);
		}
		for (const transport of transports) {
			if (!(transport instanceof NodeNetworkTransport))
				throw new Error("Missing fixture transport");
			expect(transport.metrics()).toMatchObject({ active: 0, closed: true });
		}
	} finally {
		for (const session of sessions)
			if (session instanceof BrowserSession) session.close();
		for (const transport of transports)
			if (transport instanceof NodeNetworkTransport) transport.close();
		for (const tree of trees.splice(0)) tree.close();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

describe.each([false, true])("feed extraction reader=%s", (reader) => {
	it.each(formats)(
		"discovers RSS and Atom without changing %s content",
		(format) => {
			const tree = load(html(), reader);
			const result = extraction.extractDocument(tree, { format });
			for (const link of new DocumentQueries(tree).querySelectorAll(
				"head link",
			))
				tree.remove(link);
			const baseline = extraction.extractDocument(tree, { format });
			expect(result.sourceFeeds).toEqual(feeds);
			expect(result.content).toEqual(baseline.content);
			expect(baseline).not.toHaveProperty("sourceFeeds");
			expect(result).not.toHaveProperty("sourceAlternates");
			expect(JSON.stringify(result.content)).not.toContain("rss.xml");
			expect(Object.isFrozen(result.sourceFeeds)).toBe(true);
			expect(Object.isFrozen(result.sourceFeeds?.entries)).toBe(true);
			expect(result.sourceFeeds?.entries.every(Object.isFrozen)).toBe(true);
		},
	);

	it.each([
		"text/markdown",
		"text/xml",
		"application/rss+xml",
		"application/atom+xml",
	])("keeps %s literal", (mime) => {
		const source = `<?xml version="1.0"?><head>${rss}${atom}</head>\n# Literal &amp;`;
		const tree = load(source, reader, { mime });
		for (const format of formats) {
			const result = extraction.extractDocument(tree, { format });
			expect(result).not.toHaveProperty("sourceFeeds");
			expect(result).not.toHaveProperty("sourceAlternates");
			if (result.format === "json")
				expect(nodeText(result.content)).toBe(source);
		}
		expect(tree.textContent(tree.root)).toBe(source);
		expect(documentFeeds(tree)).toBeUndefined();
	});
});

it.each([undefined, "source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"respects reader visibility %s on links and head",
	(visibilityPolicy) => {
		for (const target of ["link", "head"]) {
			for (const attributes of [
				"hidden",
				'aria-hidden="true"',
				'style="display:none"',
			]) {
				const source =
					target === "head"
						? html().replace("<head>", `<head ${attributes}>`)
						: html().replaceAll("<link rel=", `<link ${attributes} rel=`);
				const tree = load(source, true, { visibilityPolicy });
				const omitted =
					visibilityPolicy !== undefined &&
					(attributes !== 'style="display:none"' ||
						visibilityPolicy === "source-hidden-inline-v1");
				expect(extraction.extractDocument(tree).sourceFeeds).toEqual(
					omitted ? undefined : feeds,
				);
				expect(extraction.extractDocument(tree).content).toBe(
					extraction.extractDocument(load(html(""))).content,
				);
				if (omitted)
					expect(
						researchReaderInfo(tree)?.sourceHiddenSubtrees,
					).toBeGreaterThan(0);
			}
		}
	},
);

it("excludes body, omitted, nested and foreign feed links", () => {
	const sources = [html("", rss + atom + article)];
	for (const tag of [
		"template",
		"noscript",
		"script",
		"style",
		"svg",
		"math",
		"iframe",
	])
		sources.push(html(`<${tag}>${rss}${atom}</${tag}>`));
	for (const reader of [false, true]) {
		for (const source of sources)
			expect(
				extraction.extractDocument(load(source, reader)),
			).not.toHaveProperty("sourceFeeds");
	}
});

it("preserves only rel/type/href and omits unsafe or unsupported reader links", () => {
	const extra = rss.replace(
		"<link ",
		'<link id="private" class="private" onload="PRIVATE" data-token="PRIVATE" ',
	);
	const rejected = [
		"text/xml",
		"application/xml",
		"application/feed+json",
		"application/rss+xml; charset=utf-8",
	]
		.map((type) => rss.replace("application/rss+xml", type))
		.join("");
	const unsafe = [
		"javascript:void(0)",
		"https://user:password@feeds.fixture.invalid/private",
		"bad&#10;url",
	]
		.map((href) => rss.replace("rss.xml", href))
		.join("");
	const tree = load(html(extra + atom + rejected + unsafe));
	const links = [...tree.walk()].filter(
		({ node }) => node.kind === "element" && node.tagName === "link",
	);
	expect(links.map(({ node }) => node.attributes)).toEqual([
		{ rel: "alternate", type: "application/rss+xml", href: "rss.xml" },
		{ rel: "alternate", type: "application/atom+xml", href: "atom.xml" },
	]);
	expect(extraction.extractDocument(tree).sourceFeeds).toEqual(feeds);
});

it.each([undefined, "separate-omitted-raw-v1"] as const)(
	"keeps raw-policy %s feed discovery inert",
	(rawPolicy) => {
		const source = html(
			`${rss}<script>globalThis.FEED_EXECUTED = true; ${atom}</script><style>${atom}</style>${atom}`,
		);
		const tree = load(source, true, { rawPolicy });
		expect(extraction.extractDocument(tree).sourceFeeds).toEqual(feeds);
		expect(extraction.extractDocument(tree).content).toBe(
			extraction.extractDocument(load(html())).content,
		);
		expect(researchReaderInfo(tree)?.rawTextPolicy).toBe(rawPolicy);
		expect(researchReaderInfo(tree)?.omittedSubtrees).toMatchObject({
			script: 1,
			style: 1,
		});
		expect(globalThis).not.toHaveProperty("FEED_EXECUTED");
	},
);

it.each(["focused", "manual", "prefix"] as const)(
	"retains document-head provenance under %s selection",
	(selection) => {
		for (const reader of [false, true]) {
			const tree = load(
				html(undefined, `<nav>Outside</nav>${article}`),
				reader,
			);
			const target = new DocumentQueries(tree).querySelector("main");
			if (target === null) throw new Error("Missing main fixture");
			const options =
				selection === "focused"
					? { contentFocus: "main-content-v1" as const }
					: selection === "manual"
						? { root: tree.reference(target) }
						: { outputLimitPolicy: "text-prefix-v1" as const };
			const selectedFormats =
				selection === "prefix" ? (["markdown"] as const) : formats;
			for (const format of selectedFormats) {
				const result = extraction.extractDocument(tree, { ...options, format });
				expect(result.sourceFeeds).toEqual(feeds);
				if (selection !== "prefix")
					expect(JSON.stringify(result.content)).not.toContain("Outside");
			}
		}
	},
);

it("keeps Markdown alternates separate and resolves feed URLs using the first base", () => {
	for (const reader of [false, true]) {
		const result = extraction.extractDocument(
			load(
				html(
					`${rss}${alternate}${atom}${rss}<base href="/news/"><base href="/ignored/">`,
				),
				reader,
			),
		);
		expect(result.sourceAlternates?.entries).toEqual([
			{ type: "text/markdown", url: new URL("/news/guide.md", url).href },
		]);
		expect(result.sourceFeeds?.entries).toEqual(
			["rss", "atom", "rss"].map((name) => ({
				type: `application/${name}+xml`,
				url: new URL(`/news/${name}.xml`, url).href,
			})),
		);
	}
});

it.each(formats)(
	"fits exact serialized %s bytes without displacing content",
	(format) => {
		for (const reader of [false, true]) {
			const tree = load(html(), reader);
			const full = extraction.extractDocument(tree, { format });
			const { sourceFeeds, ...baseline } = full;
			expect(sourceFeeds).toEqual(feeds);
			const prefix = { ...feeds, truncated: true, entries: [feeds.entries[0]] };
			const expected = { ...baseline, sourceFeeds: prefix };
			expect(
				extraction.extractDocument(tree, { format, maxBytes: bytes(full) }),
			).toEqual(full);
			expect(
				extraction.extractDocument(tree, { format, maxBytes: bytes(full) - 1 }),
			).toEqual(expected);
			expect(
				extraction.extractDocument(tree, { format, maxBytes: bytes(expected) }),
			).toEqual(expected);
			for (const maxBytes of [bytes(baseline), bytes(expected) - 1]) {
				const result = extraction.extractDocument(tree, { format, maxBytes });
				expect(result).toEqual(baseline);
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
			}
			expect(() =>
				extraction.extractDocument(tree, {
					format,
					maxBytes: bytes(baseline) - 1,
				}),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
		}
	},
);

it("fits whole UTF-8 entries and preserves prior truncation", () => {
	const data = {
		...feeds,
		entries: [
			{ ...feeds.entries[0], url: "https://feeds.fixture.invalid/café/😀" },
			feeds.entries[1],
		],
	};
	const prefix = { ...data, truncated: true, entries: [data.entries[0]] };
	expect(bytes(data)).toBeGreaterThan(JSON.stringify(data).length);
	expect(fitDocumentFeeds(data, bytes(data))).toEqual(data);
	expect(fitDocumentFeeds(data, bytes(data) - 1)).toEqual(prefix);
	expect(fitDocumentFeeds(data, bytes(prefix))).toEqual(prefix);
	expect(fitDocumentFeeds(data, bytes(prefix) - 1)).toBeUndefined();
	expect(fitDocumentFeeds(data, 0)).toBeUndefined();
	expect(fitDocumentFeeds(prefix, bytes(prefix) + 100)).toEqual(prefix);
	expect(data.entries).toHaveLength(2);
	expect(data.truncated).toBe(false);
});

it("rejects invalid fitter budgets", () => {
	for (const budget of [
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	])
		expect(() => fitDocumentFeeds(feeds, budget)).toThrow();
});

it("bounds retained entries and native head scans without empty metadata", () => {
	for (const reader of [false, true]) {
		const result = extraction.extractDocument(
			load(html(rss.repeat(9)), reader),
		);
		expect(result.sourceFeeds).toEqual({
			...feeds,
			truncated: true,
			entries: Array(8).fill(feeds.entries[0]),
		});
	}
	const ignored = '<meta name="unrelated" content="ignored">';
	expect(
		documentFeeds(load(html(ignored.repeat(256) + rss), false)),
	).toBeUndefined();
	expect(
		documentFeeds(load(html(rss + ignored.repeat(256) + atom), false)),
	).toEqual({ ...feeds, truncated: true, entries: [feeds.entries[0]] });
});

it("does not displace a text prefix to make room for feed metadata", () => {
	const tree = load(
		html(
			undefined,
			`<main><p>${"Visible café evidence 😀. ".repeat(2000)}</p></main>`,
		),
		false,
	);
	const options = {
		maxBytes: 3000,
		outputLimitPolicy: "text-prefix-v1" as const,
	};
	const result = extraction.extractDocument(tree, options);
	for (const link of new DocumentQueries(tree).querySelectorAll("head link"))
		tree.remove(link);
	const baseline = extraction.extractDocument(tree, options);
	const { sourceFeeds, ...withoutFeeds } = result;
	expect(withoutFeeds).toEqual({ ...baseline, revision: result.revision });
	expect(bytes(result)).toBeLessThanOrEqual(options.maxBytes);
	expect(result.contentFallback?.truncated).toBe(true);
	if (sourceFeeds) expect(sourceFeeds.scope).toBe("document-head");
	expect(JSON.stringify(result.content).length).toBeLessThan(10_000);
});

it("appends feeds after existing table/access metadata within the same budget", () => {
	const access =
		'<script type="application/ld+json">{"@context":"https://schema.org","isAccessibleForFree":false}</script>';
	const payload = JSON.stringify({
		items: [
			{
				title: "Série Ω",
				elementsOrder: ["memory"],
				elements: {
					memory: { title: "Mémoire", formatValue: "96", suffix: " Go" },
				},
			},
		],
	}).replaceAll('"', "&quot;");
	const tree = load(
		html(
			rss + atom + access,
			`<section data-json="${payload}"></section>${article}`,
		),
	);
	const full = extraction.extractDocument(tree);
	const { sourceFeeds, ...baseline } = full;
	expect(sourceFeeds).toEqual(feeds);
	expect(baseline.sourceAccess).toBeDefined();
	expect(baseline.sourceDataTables).toBeDefined();
	expect(
		extraction.extractDocument(tree, { maxBytes: bytes(baseline) }),
	).toEqual(baseline);
});

it("retains source and document caps while accounting for preserved links", () => {
	expect(researchReaderLimits).toEqual({
		maxSourceCodeUnits: 2_000_000,
		maxTextCodeUnits: 1_000_000,
		maxOutputCodeUnits: 2_000_000,
		maxTokens: 100_000,
		maxDepth: 128,
	});
	const source = html();
	const report = researchReaderInfo(load(source));
	expect(report?.sourceCodeUnits).toBe(source.length);
	expect(report?.outputCodeUnits).toBeGreaterThan(
		researchReaderInfo(load(html("")))?.outputCodeUnits ?? 0,
	);
	expect(() =>
		sanitizeResearchHtml(source, { maxSourceCodeUnits: source.length - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	for (const limits of [
		{ ...context.limits, maxTextCodeUnits: source.length - 1 },
		{ ...context.limits, maxNodes: 4 },
	])
		expect(() =>
			loadResearchDocument(response(source), { ...context, limits }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("derives pinned replay feeds from captured source rather than forged prior metadata", async () => {
	const { report, body } = await navigate();
	expect(report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
	});
	const original = report.extraction;
	if (!original) throw new Error("Missing navigation extraction");
	expect(original.sourceFeeds).toEqual(feeds);
	const pinned = pin(report, body);
	const forged = pin(
		{
			...report,
			extraction: {
				...original,
				sourceFeeds: {
					...feeds,
					entries: [
						{
							type: "application/rss+xml",
							url: "https://forged.fixture.invalid/private.xml",
						},
					],
				},
			},
		},
		body,
	);
	expect(() =>
		extractResearchReplayJson(forged.raw, pinned.trusted, { selector: "main" }),
	).toThrow();
	for (const input of [pinned, forged]) {
		for (const format of formats) {
			const closedBefore = vi.mocked(DocumentTree.prototype.close).mock.calls
				.length;
			const result = extractResearchReplayJson(
				input.raw,
				input.trusted,
				{ selector: "main" },
				undefined,
				format,
			);
			expect(result.report).toMatchObject({
				outcome: "extracted-unverified",
				contentSuccess: null,
				networkRequests: 0,
				source: {
					receiptSha256: input.trusted.expectedReceiptSha256,
					body: input.trusted.expectedBody,
				},
			});
			expect(result.report.extraction?.sourceFeeds).toEqual(feeds);
			expect(JSON.stringify(result.report.extraction)).not.toContain(
				"forged.fixture.invalid",
			);
			expect(
				vi.mocked(DocumentTree.prototype.close).mock.calls.length,
			).toBeGreaterThan(closedBefore);
			expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		}
	}
	expect(hash(body)).toBe(pinned.trusted.expectedBody.sha256);
});

it("denies challenge admission before extraction despite advertised feeds", async () => {
	const source = html(
		undefined,
		`<aside hidden><noscript>Enable JavaScript and cookies to continue</noscript></aside>${article}`,
	).replace("<title>Guide</title>", "<title>Just a moment...</title>");
	const { report, body } = await navigate(source);
	expect(report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		classification: {
			barrier: "challenge",
			diagnostic: { action: "stop-and-request-user-handoff" },
		},
		failure: { category: "policy-denied", stage: "semantic-barrier" },
	});
	expect(report.extraction).toBeUndefined();
	const { raw, trusted } = pin(report, body);
	expect(validateResearchReplayAdmission(raw, trusted)).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		body: null,
	});
	expect(() =>
		extractResearchReplayJson(raw, trusted, { selector: "main" }),
	).toThrow(expect.objectContaining({ code: "policy-denied" }));
	expect(extraction.extractDocument).not.toHaveBeenCalled();
});
