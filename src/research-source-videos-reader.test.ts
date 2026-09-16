import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasResearchExtractionContent } from "../scripts/research-content.js";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { htmlParseInfo } from "./html-info.js";
import type { NetworkResponse } from "./network.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { researchReaderInfo } from "./research-reader-info.js";
import { setResearchSourceProducts } from "./research-source-products.js";
import {
	type ResearchSourceVideos,
	researchSourceVideos,
	setResearchSourceVideos,
	youtubeSearchRoute,
} from "./research-source-videos.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const url = "https://www.youtube.com/results?search_query=local+llm+hardware";
const encoder = new TextEncoder();
const formats = ["markdown", "json"] as const;
const profiles = ["default", "long-v1"] as const;
const rawPolicies = [undefined, "separate-omitted-raw-v1"] as const;
const readerModes = profiles.flatMap((profile) =>
	rawPolicies.map((rawPolicy) => ({ profile, rawPolicy })),
);
const extractionModes = readerModes.flatMap((mode) =>
	formats.map((format) => ({ ...mode, format })),
);
const article =
	'<main id="article"><h1>Guide</h1><p>Visible café evidence 😀.</p></main>';
const context: DocumentLoaderContext = {
	tabId: "source-videos-fixture",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
const trees: DocumentTree[] = [];

type LoaderArguments = Parameters<typeof loadResearchDocument>;
interface LoadOptions {
	profile?: LoaderArguments[2];
	rawPolicy?: LoaderArguments[3];
	visibilityPolicy?: LoaderArguments[4];
	mimePolicy?: LoaderArguments[5];
	mime?: string;
	url?: string;
	redirects?: NetworkResponse["redirects"];
	context?: DocumentLoaderContext;
}

function video(index = 0) {
	const videoId = `fixture${String(index).padStart(4, "0")}`;
	return {
		videoRenderer: {
			videoId,
			title: {
				runs: [{ text: "Source café 😀 " }, { text: `video ${index}` }],
			},
			ownerText: { runs: [{ text: "Fixture author" }] },
			longBylineText: { runs: [{ text: "Fixture author" }] },
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
					webCommandMetadata: { url: `/watch?v=${videoId}&tracking=omitted` },
				},
			},
			trackingParams: "private-fixture-tracking",
		},
	};
}

function assignment(count = 1): string {
	return `var ytInitialData = ${JSON.stringify({
		contents: {
			twoColumnSearchResultsRenderer: {
				primaryContents: {
					sectionListRenderer: {
						contents: [
							{
								itemSectionRenderer: {
									contents: Array.from({ length: count }, (_, index) =>
										video(index),
									),
								},
							},
						],
					},
				},
			},
		},
	})};`;
}

function script(attributes = "", payload = assignment()): string {
	return `<script${attributes ? ` ${attributes}` : ""}>${payload}</script>`;
}

function response(source: string, options: LoadOptions = {}): NetworkResponse {
	const body = encoder.encode(source);
	return {
		url: options.url ?? url,
		status: 200,
		headers: {
			"content-type": [`${options.mime ?? "text/html"}; charset=utf-8`],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: options.redirects ?? [],
		elapsedMs: 0,
	};
}

function load(source: string, options: LoadOptions = {}): DocumentTree {
	const tree = loadResearchDocument(
		response(source, options),
		options.context ?? context,
		options.profile,
		options.rawPolicy,
		options.visibilityPolicy,
		options.mimePolicy,
	);
	trees.push(tree);
	return tree;
}

function requiredVideos(
	data: ResearchSourceVideos | undefined,
): ResearchSourceVideos {
	if (!data) throw new Error("Expected source video metadata");
	return data;
}

function bytes(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

function withoutReferences(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (key, child) =>
			["document", "scope", "ref"].includes(key) ? undefined : child,
		),
	);
}

function expectFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectFrozen(child);
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Source video fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		for (const tree of trees.splice(0)) {
			tree.close();
			expect(researchSourceVideos(tree)).toBeUndefined();
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	}
});

describe("source video reader integration", () => {
	it.each(extractionModes)(
		"preserves $profile/$rawPolicy DOM content in $format",
		({ profile, rawPolicy, format }) => {
			const source = `${script()}${article}`;
			const tree = load(source, { profile, rawPolicy });
			const control = load(
				source.replaceAll("var ytInitialData", "var xxInitialData"),
				{ profile, rawPolicy },
			);
			const { sourceVideos, ...result } = extractDocument(tree, { format });
			const baseline = extractDocument(control, { format });
			const data = requiredVideos(sourceVideos);
			expect(withoutReferences(result)).toEqual(withoutReferences(baseline));
			expect(baseline).not.toHaveProperty("sourceVideos");
			expect(researchReaderInfo(tree)).toEqual(researchReaderInfo(control));
			expect(hasResearchExtractionContent(result)).toBe(true);
			expect(data).toMatchObject({
				kind: "youtube-search-video-results-v1",
				scope: "document-source",
				partial: true,
				rendered: false,
				verified: false,
				textFormat: "plain-text",
				query: "local llm hardware",
				truncated: false,
				entries: [
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
					},
				],
			});
			expect(JSON.stringify(data)).not.toContain("tracking");
			expect(JSON.stringify(result.content)).not.toContain("Source café");
			expect(sourceVideos).toEqual(researchSourceVideos(tree));
			expectFrozen(data);
		},
	);

	it.each(readerModes)(
		"keeps $profile/$rawPolicy raw scanning and offsets unchanged",
		({ profile, rawPolicy }) => {
			const source = `<p>Before 😀</p>\r\n${script()}${article}`;
			const baseline = sanitizeResearchHtml(
				source,
				{},
				undefined,
				profile,
				rawPolicy,
			);
			const { sourceVideos, ...sanitized } = sanitizeResearchHtml(
				source,
				{},
				undefined,
				profile,
				rawPolicy,
				undefined,
				undefined,
				youtubeSearchRoute(url),
			);
			expect(sanitized).toEqual(baseline);
			expect(requiredVideos(sourceVideos).entries[0].source).toEqual({
				offset: source.replace(/\r\n?/g, "\n").indexOf("<script"),
				offsetBasis: "lf-normalized-utf16",
				path: "$.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].videoRenderer",
			});
		},
	);

	it.each(
		readerModes.flatMap((mode) =>
			[
				"",
				'type=""',
				'type=" \t "',
				'type="text/javascript"',
				'type="application/javascript"',
				'type=" APPLICATION/JAVASCRIPT "',
			].map((attributes) => ({ ...mode, attributes })),
		),
	)(
		"reads inline classic $attributes with $profile/$rawPolicy",
		({ attributes, ...options }) => {
			const tree = load(`${script(attributes)}${article}`, options);
			expect(requiredVideos(researchSourceVideos(tree)).entries).toHaveLength(
				1,
			);
		},
	);

	it.each(
		readerModes.flatMap((mode) =>
			[
				'src=""',
				'src="/fixture.js"',
				'type="module"',
				'type="application/json"',
				'type="application/ld+json"',
				'type="text/plain"',
				'type="text/javascript; charset=utf-8"',
			].map((attributes) => ({ ...mode, attributes })),
		),
	)(
		"excludes $attributes with $profile/$rawPolicy without ambiguity",
		({ attributes, ...options }) => {
			const excluded = script(attributes);
			expect(
				researchSourceVideos(load(`${excluded}${article}`, options)),
			).toBeUndefined();
			const tree = load(`${excluded}${script()}${article}`, options);
			expect(requiredVideos(researchSourceVideos(tree)).entries).toHaveLength(
				1,
			);
		},
	);

	it.each(
		readerModes.flatMap((mode) =>
			["noscript", "template", "svg", "iframe", "object"].map((tag) => ({
				...mode,
				tag,
			})),
		),
	)(
		"excludes scripts inside $tag with $profile/$rawPolicy",
		({ tag, ...options }) => {
			const excluded = `<${tag}>${script()}</${tag}>`;
			expect(
				researchSourceVideos(load(`${excluded}${article}`, options)),
			).toBeUndefined();
			const tree = load(`${excluded}${script()}${article}`, options);
			expect(requiredVideos(researchSourceVideos(tree)).entries).toHaveLength(
				1,
			);
		},
	);

	it.each(
		readerModes.flatMap((mode) =>
			(["source-hidden-v1", "source-hidden-inline-v1"] as const).flatMap(
				(visibilityPolicy) =>
					[
						"hidden",
						'aria-hidden="true"',
						...(visibilityPolicy === "source-hidden-inline-v1"
							? ['style="display:none"']
							: []),
					].map((attributes) => ({ ...mode, visibilityPolicy, attributes })),
			),
		),
	)(
		"excludes $attributes with $profile/$rawPolicy/$visibilityPolicy",
		({ attributes, ...options }) => {
			for (const excluded of [
				script(attributes),
				`<section ${attributes}>${script()}</section>`,
			]) {
				expect(
					researchSourceVideos(load(`${excluded}${article}`, options)),
				).toBeUndefined();
				const tree = load(`${excluded}${script()}${article}`, options);
				expect(requiredVideos(researchSourceVideos(tree)).entries).toHaveLength(
					1,
				);
			}
		},
	);

	it.each(readerModes)(
		"suppresses ambiguous assignments with $profile/$rawPolicy",
		(options) => {
			const tree = load(`${script()}${script()}${article}`, options);
			expect(researchSourceVideos(tree)).toBeUndefined();
			for (const format of formats)
				expect(extractDocument(tree, { format })).not.toHaveProperty(
					"sourceVideos",
				);
		},
	);

	it.each(extractionModes)(
		"does not execute scripts with $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const forbidden = vi.fn(() => {
				throw new Error("Unexpected source script or resource execution");
			});
			vi.stubGlobal("sourceVideoEffect", forbidden);
			const initializeDocument = vi.fn();
			const tree = load(
				`${script()}${script("", 'globalThis.sourceVideoEffect(); throw new Error("never execute");')}${script('src="/never.js"', "")}${article}`,
				{
					...options,
					context: {
						...context,
						initializeDocument,
						fetchScript: forbidden,
						fetchStylesheet: forbidden,
						fetchImage: forbidden,
						scripts: {
							start: forbidden,
						} as unknown as DocumentLoaderContext["scripts"],
					},
				},
			);
			const result = extractDocument(tree, { format });
			expect(result.sourceVideos).toBeDefined();
			expect(new DocumentQueries(tree).querySelector("script")).toBeNull();
			expect(JSON.stringify(result.content)).not.toContain("never execute");
			expect(htmlParseInfo(tree)?.scripting).toBe(false);
			expect(researchReaderInfo(tree)?.scripting).toBe(false);
			expect(forbidden).not.toHaveBeenCalled();
			expect(initializeDocument).toHaveBeenCalledOnce();
		},
	);
});

describe("source video response provenance", () => {
	it.each(formats)("uses only the final HTML URL in %s", (format) => {
		const source = `<base href="${url}">${script()}${article}`;
		const unrelated =
			"https://unrelated.fixture.invalid/results?search_query=fixture";
		for (const targetUrl of [
			unrelated,
			"https://www.youtube.com/",
			"https://www.youtube.com/results?redacted",
			"https://www.youtube.com/watch?v=fixture0000",
			"http://www.youtube.com/results?search_query=fixture",
		]) {
			const tree = load(source, {
				url: targetUrl,
				redirects: [{ url, status: 302, location: targetUrl }],
			});
			expect(researchSourceVideos(tree)).toBeUndefined();
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceVideos",
			);
		}
		const tree = load(source, {
			redirects: [{ url: unrelated, status: 302, location: url }],
		});
		expect(extractDocument(tree, { format }).sourceVideos).toBeDefined();
	});

	it.each(
		formats.flatMap((format) =>
			["text/plain", "text/markdown", "application/json"].map((mime) => ({
				format,
				mime,
			})),
		),
	)("rejects literal $mime metadata in $format", ({ format, mime }) => {
		const source = `<!DOCTYPE html><html><head>${script()}</head><body>${article}</body></html>`;
		const tree = load(
			mime === "application/json" ? JSON.stringify({ source }) : source,
			{ mime },
		);
		expect(researchSourceVideos(tree)).toBeUndefined();
		expect(extractDocument(tree, { format })).not.toHaveProperty(
			"sourceVideos",
		);
	});

	it.each(formats)(
		"supports explicitly interpreted Markdown in %s",
		(format) => {
			const source = `<!DOCTYPE html><html><head>${script()}</head><body>${article}</body></html>`;
			const options = {
				mime: "text/markdown",
				mimePolicy: "markdown-html-document-v1" as const,
			};
			const tree = load(source, options);
			const result = extractDocument(tree, { format });
			expect(result.sourceVideos).toBeDefined();
			expect(withoutReferences(result.content)).toEqual(
				withoutReferences(extractDocument(load(source), { format }).content),
			);
			expect(researchReaderInfo(tree)?.mimeInterpretation).toMatchObject({
				declaredMime: "text/markdown",
				effectiveMime: "text/html",
			});
			for (const literal of ["# Literal Markdown\n", ""]) {
				const rejected = load(`${literal}${script()}${article}`, options);
				expect(researchSourceVideos(rejected)).toBeUndefined();
			}
		},
	);
});

describe("source video extraction metadata", () => {
	it.each(extractionModes)(
		"keeps source-only $profile/$rawPolicy DOM empty in $format",
		({ format, ...options }) => {
			const source = script();
			const tree = load(source, options);
			const baseline = extractDocument(
				load(source.replace("var ytInitialData", "var xxInitialData"), options),
				{ format },
			);
			const { sourceVideos, ...result } = extractDocument(tree, { format });
			expect(sourceVideos).toBeDefined();
			expect(withoutReferences(result)).toEqual(withoutReferences(baseline));
			expect(hasResearchExtractionContent({ ...result, sourceVideos })).toBe(
				false,
			);
		},
	);

	it.each(extractionModes)(
		"retains document-source scope through $profile/$rawPolicy/$format selection and close",
		({ format, ...options }) => {
			const tree = load(
				`${script()}<aside>Outside evidence</aside>${article}`,
				options,
			);
			const data = requiredVideos(researchSourceVideos(tree));
			const before = JSON.stringify(data);
			const selected = new DocumentQueries(tree).querySelector("#article");
			if (selected === null) throw new Error("Expected article fixture");
			const root = tree.reference(selected);
			const whole = extractDocument(tree, { format });
			const focused = extractDocument(tree, {
				format,
				contentFocus: "main-content-v1",
			});
			const explicit = extractDocument(tree, { format, root });
			expect(focused.scope).toBe(root);
			expect(explicit.scope).toBe(root);
			expect(focused.content).toEqual(explicit.content);
			expect(JSON.stringify(whole.content)).toContain("Outside evidence");
			expect(JSON.stringify(explicit.content)).not.toContain(
				"Outside evidence",
			);
			for (const result of [whole, focused, explicit]) {
				expect(result.sourceVideos).toEqual(data);
				expect(result.sourceVideos?.scope).toBe("document-source");
			}
			expectFrozen(data);
			expect(Reflect.set(data, "query", "changed")).toBe(false);
			expect(Reflect.set(data.entries[0], "title", "changed")).toBe(false);
			expect(Reflect.set(data.entries[0].source, "offset", 99)).toBe(false);
			tree.close();
			expect(researchSourceVideos(tree)).toBeUndefined();
			expect(JSON.stringify(whole.sourceVideos)).toBe(before);
		},
	);

	it("attaches an immutable snapshot, independent of setter input", () => {
		const source = requiredVideos(researchSourceVideos(load(script())));
		const input = {
			...source,
			entries: source.entries.map((entry) => ({
				...entry,
				source: { ...entry.source },
			})),
		};
		const tree = load(article);
		setResearchSourceVideos(tree, input);
		const stored = requiredVideos(researchSourceVideos(tree));
		expect(stored).toEqual(source);
		expect(stored).not.toBe(input);
		input.query = "changed";
		input.entries[0].title = "changed";
		input.entries[0].source.offset = 99;
		input.entries.length = 0;
		expect(stored).toEqual(source);
		expectFrozen(stored);
	});

	it.each(extractionModes)(
		"fits whole entries after key overhead for $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const tree = load(`${script("", assignment(3))}${article}`, options);
			const full = extractDocument(tree, { format });
			const { sourceVideos, ...baseline } = full;
			const data = requiredVideos(researchSourceVideos(tree));
			expect(sourceVideos).toEqual(data);
			const before = JSON.stringify(data);
			const prefix = {
				...data,
				entries: data.entries.slice(0, 1),
				truncated: true,
			};
			const minimum = bytes({ ...baseline, sourceVideos: prefix });
			for (const maxBytes of [bytes(baseline), minimum - 1]) {
				const result = extractDocument(tree, { format, maxBytes });
				expect(result).toEqual(baseline);
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
			}
			const fitted = extractDocument(tree, { format, maxBytes: minimum });
			expect(fitted).toEqual({ ...baseline, sourceVideos: prefix });
			expect(bytes(fitted)).toBe(minimum);
			expect(fitted.content).toEqual(full.content);
			expect(extractDocument(tree, { format, maxBytes: bytes(full) })).toEqual(
				full,
			);
			expect(researchSourceVideos(tree)).toBe(data);
			expect(JSON.stringify(data)).toBe(before);
			expectFrozen(fitted.sourceVideos);
		},
	);

	it.each(readerModes)(
		"preserves $profile/$rawPolicy Markdown text-prefix behavior",
		(options) => {
			const source = `${script()}<main><p>${"Visible café evidence 😀. ".repeat(1000)}</p></main>`;
			const tree = load(source, options);
			const control = load(
				source.replace("var ytInitialData", "var xxInitialData"),
				options,
			);
			const data = researchSourceVideos(tree);
			const extractionOptions = {
				maxBytes: 4096,
				outputLimitPolicy: "text-prefix-v1" as const,
			};
			const full = extractDocument(tree);
			expect(
				extractDocument(tree, { outputLimitPolicy: "text-prefix-v1" }),
			).toEqual(full);
			const result = extractDocument(tree, extractionOptions);
			const { sourceVideos, ...withoutVideos } = result;
			const baseline = extractDocument(control, extractionOptions);
			expect(withoutReferences(withoutVideos)).toEqual(
				withoutReferences(baseline),
			);
			expect(result.contentFallback).toMatchObject({ truncated: true });
			expect(result.content).toContain("Visible café evidence");
			expect(bytes(result)).toBeLessThanOrEqual(extractionOptions.maxBytes);
			if (sourceVideos) expect(sourceVideos.entries).toEqual(data?.entries);
			expect(researchSourceVideos(tree)).toBe(data);
		},
	);

	it.each(extractionModes)(
		"accounts for existing table/access/feed metadata in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const payload = JSON.stringify({
				items: [
					{
						title: "Série Ω",
						elementsOrder: ["memory"],
						elements: {
							memory: {
								title: "Mémoire dédiée",
								formatValue: "96",
								suffix: " Go",
							},
						},
					},
				],
			}).replaceAll('"', "&quot;");
			const source = `<head><link rel="alternate" type="application/rss+xml" href="/fixture-feed.xml">${script()}${script('type="application/ld+json"', '{"@context":"https://schema.org","isAccessibleForFree":false}')}</head><body><section data-json="${payload}"></section>${article}</body>`;
			const tree = load(source, options);
			const full = extractDocument(tree, { format });
			const { sourceVideos, ...baseline } = full;
			expect(sourceVideos).toBeDefined();
			expect(baseline.sourceDataTables).toBeDefined();
			expect(baseline.sourceAccess).toBeDefined();
			expect(baseline.sourceFeeds).toBeDefined();
			const control = extractDocument(
				load(source.replace("var ytInitialData", "var xxInitialData"), options),
				{ format },
			);
			expect(withoutReferences(baseline)).toEqual(withoutReferences(control));
			for (const maxBytes of [bytes(baseline), bytes(full) - 1]) {
				const result = extractDocument(tree, { format, maxBytes });
				expect(result).toEqual(baseline);
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
			}
			expect(extractDocument(tree, { format, maxBytes: bytes(full) })).toEqual(
				full,
			);
		},
	);

	it.each(formats)(
		"does not return early after product metadata in %s",
		(format) => {
			const tree = load(`${script()}${article}`);
			setResearchSourceProducts(tree, {
				kind: "nextjs-target-product-descriptions-v1",
				scope: "document-source",
				partial: true,
				rendered: false,
				verified: false,
				textFormat: "html-source",
				routeTcin: "12345678",
				truncated: false,
				entries: [
					{
						source: {
							offset: 0,
							offsetBasis: "lf-normalized-utf16",
							path: "$",
						},
						tcin: "12345678",
						relation: "route-product",
						title: "Synthetic product",
						specifications: [],
						highlights: [],
						truncated: false,
					},
				],
			});
			const full = extractDocument(tree, { format });
			const { sourceVideos, ...baseline } = full;
			expect(sourceVideos).toBeDefined();
			expect(baseline.sourceProducts).toBeDefined();
			expect(
				extractDocument(tree, { format, maxBytes: bytes(baseline) }),
			).toEqual(baseline);
			expect(extractDocument(tree, { format, maxBytes: bytes(full) })).toEqual(
				full,
			);
		},
	);
});
