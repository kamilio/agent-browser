import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	hasResearchExtractionContent,
	researchDocumentDiagnosticText,
	researchExtractionDiagnosticText,
} from "../scripts/research-content.js";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { researchReaderInfo } from "./research-reader-info.js";
import { setResearchSourceChartTables } from "./research-source-chart-tables.js";
import { setResearchSourceProducts } from "./research-source-products.js";
import {
	type ResearchSourceReviews,
	researchSourceReviews,
	rtingsReviewRoute,
	setResearchSourceReviews,
} from "./research-source-reviews.js";
import { setResearchSourceVideos } from "./research-source-videos.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const routePath = "/headphones/reviews/fixture/source-review";
const url = `https://www.rtings.com${routePath}`;
const reviewPath = "$.page_banner.page.product.review";
const encoder = new TextEncoder();
const formats = ["markdown", "json"] as const;
const readerModes = (["default", "long-v1"] as const).flatMap((profile) =>
	([undefined, "separate-omitted-raw-v1"] as const).map((rawPolicy) => ({
		profile,
		rawPolicy,
	})),
);
const extractionModes = readerModes.flatMap((mode) =>
	formats.map((format) => ({ ...mode, format })),
);
const article =
	'<main id="article"><h1 id="guide">Guide</h1><p>Visible café evidence 😀.</p></main>';
const introduction = "<p>SOURCE_ONLY café 😀 &amp; &#x41; <em>review</em>.</p>";
const context: DocumentLoaderContext = {
	tabId: "source-reviews-fixture",
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
	mime?: string;
	url?: string;
	redirects?: NetworkResponse["redirects"];
	context?: DocumentLoaderContext;
}

function summary(index = 0) {
	return {
		id: String(index + 100),
		title: index === 0 ? "Source association" : null,
		priority: index === 0 ? false : "unsorted",
		order: index === 0 ? 9 : null,
		usage_ids: ["21", "22"],
		blurb: `<p>Summary ${index}: café 😀 &amp; "quoted" \\ text.</p>`,
	};
}

function rating(index = 0) {
	return {
		linked_description: `<p>Rating description ${index} &amp; source.</p>`,
		usage: {
			id: String(index + 21),
			name: `Usage ${index}`,
			kind: "source-kind",
			is_hidden_from_featured_sections: false,
		},
		unblurred: index !== 0,
	};
}

function payload() {
	return {
		query_details: {
			url: routePath,
			named_version: "public",
			version_id: null,
		},
		has_insider_access: false,
		has_admin_access: false,
		has_preview_access: false,
		has_preview_access_through_product_token: false,
		has_preview_access_through_share_token: null,
		had_preview_access_through_expired_share_token: false,
		page_banner: {
			page: {
				product: {
					id: "123",
					fullname: "Fixture source product",
					review: {
						id: "456",
						introduction_linked: introduction,
						summaries: [summary(), summary(1)],
						ratings: [
							rating(),
							{ ...rating(1), score: null },
							{ ...rating(2), score: "OMITTED_SYNTHETIC_SCORE" },
						],
					},
				},
			},
		},
	};
}

function attribute(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function component(
	value: string | undefined = JSON.stringify(payload()),
	attributes = 'data-vue="ProductVuePage"',
	tag = "div",
): string {
	const props = value === undefined ? "" : ` data-props="${attribute(value)}"`;
	return `<${tag} ${attributes}${props}></${tag}>`;
}

function inactive(source: string): string {
	return source.replaceAll("ProductVuePage", "IgnoredVuePage");
}

function load(source: string, options: LoadOptions = {}): DocumentTree {
	const body = encoder.encode(source);
	const response: NetworkResponse = {
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
	const tree = loadResearchDocument(
		response,
		options.context ?? context,
		options.profile,
		options.rawPolicy,
		options.visibilityPolicy,
	);
	trees.push(tree);
	return tree;
}

function required(data: ResearchSourceReviews | undefined) {
	if (!data) throw new Error("Expected source review metadata");
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

function expectPrefix(
	data: ResearchSourceReviews | undefined,
	full: ResearchSourceReviews,
): void {
	if (!data) return;
	expect(data.entries.length).toBeLessThanOrEqual(full.entries.length);
	expect(data).toEqual({
		...full,
		entries: full.entries.slice(0, data.entries.length),
		truncated: full.truncated || data.entries.length < full.entries.length,
	});
	expectFrozen(data);
}

function sourceDataTable(): string {
	return `<section data-json="${attribute(
		JSON.stringify({
			items: [
				{
					title: "Prior source table",
					elementsOrder: ["memory"],
					elements: {
						memory: { title: "Memory", formatValue: "96", suffix: " GB" },
					},
				},
			],
		}),
	)}"></section>`;
}

function attachPriorMetadata(tree: DocumentTree, kind: string): void {
	const envelope = {
		scope: "document-source",
		partial: true,
		rendered: false,
		verified: false,
		truncated: false,
	} as const;
	const source = {
		offset: 0,
		offsetBasis: "lf-normalized-utf16",
		path: "$.synthetic",
	} as const;
	if (kind === "products" || kind === "all")
		setResearchSourceProducts(tree, {
			...envelope,
			kind: "nextjs-target-product-descriptions-v1",
			textFormat: "html-source",
			routeTcin: "12345678",
			entries: [
				{
					source,
					tcin: "12345678",
					relation: "route-product",
					title: "Prior product",
					specifications: ["Prior specification"],
					highlights: [],
					truncated: false,
				},
			],
		});
	if (kind === "videos" || kind === "all")
		setResearchSourceVideos(tree, {
			...envelope,
			kind: "youtube-search-video-results-v1",
			textFormat: "plain-text",
			query: "synthetic prior video",
			entries: [
				{
					source,
					videoId: "fixture0000",
					url: "https://www.youtube.com/watch?v=fixture0000",
					title: "Prior video",
					truncated: false,
				},
			],
		});
	if (kind === "charts" || kind === "all")
		setResearchSourceChartTables(tree, {
			...envelope,
			kind: "infogram-chart-tables-v1",
			textFormat: "plain-text",
			embedId: "11111111-1111-1111-1111-111111111111",
			tables: [
				{
					source: { ...source, sheetIndex: 0 },
					sheetName: "Prior chart",
					rows: [[{ kind: "value-cell", value: "Prior cell" }]],
				},
			],
		});
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Source review fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	const closed = trees.splice(0);
	try {
		for (const tree of closed) tree.close();
		for (const tree of closed)
			expect(researchSourceReviews(tree)).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	}
});

describe("source review reader integration", () => {
	it.each(extractionModes)(
		"adds only metadata in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const source = `${component()}${article}`;
			const tree = load(source, options);
			const control = load(inactive(source), options);
			const { sourceReviews, ...result } = extractDocument(tree, { format });
			const baseline = extractDocument(control, { format });
			const data = required(sourceReviews);
			expect(withoutReferences(result)).toEqual(withoutReferences(baseline));
			expect(baseline).not.toHaveProperty("sourceReviews");
			expect(researchReaderInfo(tree)).toEqual(researchReaderInfo(control));
			expect(data).toEqual({
				kind: "rtings-component-review-text-v1",
				scope: "document-source",
				partial: true,
				rendered: false,
				verified: false,
				textFormat: "html-source",
				routePath,
				productId: "123",
				productName: "Fixture source product",
				reviewId: "456",
				truncated: false,
				entries: [
					{
						kind: "introduction",
						html: introduction,
						source: {
							offset: 0,
							offsetBasis: "lf-normalized-utf16",
							path: `${reviewPath}.introduction_linked`,
						},
					},
					...[summary(), summary(1)].map((entry, index) => ({
						kind: "summary",
						html: entry.blurb,
						id: entry.id,
						title: entry.title,
						priority: entry.priority,
						order: entry.order,
						usageIds: entry.usage_ids,
						source: {
							offset: 0,
							offsetBasis: "lf-normalized-utf16",
							path: `${reviewPath}.summaries[${index}].blurb`,
						},
					})),
					...["missing", "null", "omitted"].map((scoreState, index) => ({
						kind: "rating-description",
						html: rating(index).linked_description,
						usageId: rating(index).usage.id,
						usageName: rating(index).usage.name,
						usageKind: "source-kind",
						unblurred: rating(index).unblurred,
						scoreState,
						source: {
							offset: 0,
							offsetBasis: "lf-normalized-utf16",
							path: `${reviewPath}.ratings[${index}].linked_description`,
						},
					})),
				],
			});
			expect(JSON.stringify(data)).not.toContain("OMITTED_SYNTHETIC_SCORE");
			expect(JSON.stringify(result.content)).toContain("Visible café evidence");
			expect(JSON.stringify(result.content)).not.toContain("SOURCE_ONLY");
			expect(
				new DocumentQueries(tree).querySelector("[data-props]"),
			).toBeNull();
			expect(researchSourceReviews(tree)).toEqual(data);
			expectFrozen(data);
		},
	);

	it.each(readerModes)(
		"requires explicit sanitizer route and preserves $profile/$rawPolicy counters and source offsets",
		({ profile, rawPolicy }) => {
			const source = `<p>Before 😀</p>\r\n\r<style>ignored</style>\r\n${component()}${article}`;
			const baseline = sanitizeResearchHtml(
				source,
				{},
				undefined,
				profile,
				rawPolicy,
			);
			const { sourceReviews, ...selected } = sanitizeResearchHtml(
				source,
				{},
				undefined,
				profile,
				rawPolicy,
				undefined,
				undefined,
				undefined,
				undefined,
				rtingsReviewRoute(url),
			);
			expect(baseline).not.toHaveProperty("sourceReviews");
			expect(selected).toEqual(baseline);
			const data = required(sourceReviews);
			for (const entry of data.entries)
				expect(entry.source.offset).toBe(
					source.replace(/\r\n?/g, "\n").indexOf("<div"),
				);
			expect(
				researchSourceReviews(load(source, { profile, rawPolicy })),
			).toEqual(data);
		},
	);

	it.each(readerModes)(
		"requires DIV and exact decoded component value in $profile/$rawPolicy",
		(options) => {
			for (const attributes of [
				'data-vue="ProductVuePage"',
				"DATA-VUE='ProductVuePage'",
				"data-vue=ProductVuePage",
				'data-vue="ProductVuePag&#101;"',
			]) {
				const source = component(JSON.stringify(payload()), attributes, "DiV");
				expect(
					required(researchSourceReviews(load(source, options))).entries,
				).toHaveLength(6);
			}
			for (const excluded of [
				component(
					JSON.stringify(payload()),
					'data-vue="ProductVuePage"',
					"section",
				),
				component(
					JSON.stringify(payload()),
					'data-vue="ProductVuePage"',
					"span",
				),
				...[
					'data-vue="productvuepage"',
					'data-vue=" ProductVuePage"',
					'data-vue="ProductVuePage "',
					'data-component="ProductVuePage"',
					"",
				].map((attributes) => component(JSON.stringify(payload()), attributes)),
			]) {
				expect(
					researchSourceReviews(load(`${excluded}${article}`, options)),
				).toBeUndefined();
				expect(
					required(
						researchSourceReviews(
							load(`${excluded}${component()}${article}`, options),
						),
					).entries,
				).toHaveLength(6);
			}
		},
	);

	it.each(readerModes)(
		"decodes attributes exactly once in $profile/$rawPolicy",
		(options) => {
			const data = required(researchSourceReviews(load(component(), options)));
			expect(data.entries[0].html).toBe(introduction);
			const twiceEncoded = component(attribute(JSON.stringify(payload())));
			expect(
				researchSourceReviews(load(twiceEncoded, options)),
			).toBeUndefined();
		},
	);

	it.each(readerModes)(
		"rejects missing, invalid and ambiguous props without failing $profile/$rawPolicy",
		(options) => {
			const missing = '<div data-vue="ProductVuePage"></div>';
			const invalid = [
				missing,
				...[
					"",
					"{",
					"null",
					"[]",
					'{"constructor":{}}',
					" ".repeat(65_537),
				].map((value) => component(value)),
				component(`[${"[".repeat(20)}0${"]".repeat(20)}]`),
			];
			for (const source of [
				...invalid,
				`${component()}${component()}`,
				...invalid.flatMap((source) => [
					`${source}${component()}`,
					`${component()}${source}`,
				]),
			]) {
				const tree = load(`${source}${article}`, options);
				expect(researchSourceReviews(tree)).toBeUndefined();
				for (const format of formats) {
					const result = extractDocument(tree, { format });
					expect(result).not.toHaveProperty("sourceReviews");
					expect(JSON.stringify(result.content)).toContain(
						"Visible café evidence",
					);
				}
			}
		},
	);

	it.each(readerModes)(
		"excludes legacy and noscript subtrees in $profile/$rawPolicy",
		(options) => {
			for (const tag of [
				"noscript",
				"template",
				"svg",
				"math",
				"iframe",
				"object",
				"noembed",
				"noframes",
				"canvas",
				"textarea",
			]) {
				const excluded = `<${tag}>${component()}</${tag}>`;
				expect(
					researchSourceReviews(load(`${excluded}${article}`, options)),
				).toBeUndefined();
				expect(
					required(
						researchSourceReviews(
							load(`${excluded}${component()}${article}`, options),
						),
					).entries,
				).toHaveLength(6);
			}
		},
	);

	it.each(readerModes)(
		"collects only after source-hidden omissions in $profile/$rawPolicy",
		(options) => {
			for (const visibilityPolicy of [
				"source-hidden-v1",
				"source-hidden-inline-v1",
			] as const) {
				const attributes = [
					"hidden",
					'aria-hidden="true"',
					...(visibilityPolicy === "source-hidden-inline-v1"
						? ['style="display:none"']
						: []),
				];
				for (const hidden of attributes) {
					for (const excluded of [
						component(
							JSON.stringify(payload()),
							`data-vue="ProductVuePage" ${hidden}`,
						),
						`<section ${hidden}>${component()}</section>`,
					]) {
						const selected = { ...options, visibilityPolicy };
						expect(
							researchSourceReviews(load(`${excluded}${article}`, selected)),
						).toBeUndefined();
						expect(
							required(
								researchSourceReviews(
									load(`${excluded}${component()}${article}`, selected),
								),
							).entries,
						).toHaveLength(6);
						expect(
							researchSourceReviews(load(`${excluded}${article}`, options)),
						).toBeDefined();
					}
				}
			}
		},
	);

	it.each(extractionModes)(
		"never renders descriptions or executes page code in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const forbidden = vi.fn(() => {
				throw new Error("Unexpected page execution or fetch");
			});
			vi.stubGlobal("sourceReviewEffect", forbidden);
			const data = payload();
			data.page_banner.page.product.review.introduction_linked =
				'<script>globalThis.sourceReviewEffect()</script><img src="/never.png" onerror="sourceReviewEffect()"><a href="/never">Source link</a>';
			const tree = load(
				`${component(JSON.stringify(data))}<script>globalThis.sourceReviewEffect()</script><script src="/never.js"></script><link rel="stylesheet" href="/never.css">${article}`,
				{
					...options,
					context: {
						...context,
						fetchScript: forbidden,
						fetchStylesheet: forbidden,
						fetchImage: forbidden,
						scripts: {
							start: forbidden,
						} as unknown as DocumentLoaderContext["scripts"],
					},
				},
			);
			expect(
				required(extractDocument(tree, { format }).sourceReviews).entries[0]
					.html,
			).toBe(data.page_banner.page.product.review.introduction_linked);
			for (const selector of ["script", "img", "a"])
				expect(new DocumentQueries(tree).querySelector(selector)).toBeNull();
			expect(htmlParseInfo(tree)?.scripting).toBe(false);
			expect(researchReaderInfo(tree)?.scripting).toBe(false);
			expect(forbidden).not.toHaveBeenCalled();
		},
	);
});

describe("source review response eligibility", () => {
	it.each(formats)("uses only the final exact HTTPS route in %s", (format) => {
		const unrelated = "https://unrelated.fixture.invalid/article";
		const source = `<base href="${url}">${component()}${article}`;
		for (const finalUrl of [
			unrelated,
			`http://www.rtings.com${routePath}`,
			`https://rtings.com${routePath}`,
			`https://www.rtings.com:444${routePath}`,
			`${url}?query=ignored`,
			`${url}/`,
			url.replace("headphones", "early-access"),
			url.replace("source-review", "different-review"),
		]) {
			const tree = load(source, {
				url: finalUrl,
				redirects: [{ url, status: 302, location: finalUrl }],
			});
			expect(researchSourceReviews(tree)).toBeUndefined();
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceReviews",
			);
		}
		for (const finalUrl of [url, `${url}#guide`]) {
			const tree = load(source, {
				url: finalUrl,
				redirects: [{ url: unrelated, status: 302, location: finalUrl }],
			});
			expect(
				required(extractDocument(tree, { format }).sourceReviews).routePath,
			).toBe(routePath);
		}
		expect(() =>
			load(source, { url: `https://user@www.rtings.com${routePath}` }),
		).toThrow(
			expect.objectContaining({
				code: "policy-denied",
				message: "Credentials in URLs are not allowed",
			}),
		);
	});

	it.each(readerModes)(
		"rejects route and public-schema mismatches in $profile/$rawPolicy",
		(options) => {
			const accessKeys = [
				"has_insider_access",
				"has_admin_access",
				"has_preview_access",
				"has_preview_access_through_product_token",
				"has_preview_access_through_share_token",
				"had_preview_access_through_expired_share_token",
			] as const;
			const missingAccess = accessKeys.map((key) => {
				const data: Record<string, unknown> = payload();
				delete data[key];
				return data;
			});
			for (const data of [
				{
					...payload(),
					query_details: {
						...payload().query_details,
						url: "/headphones/reviews/other/route",
					},
				},
				{
					...payload(),
					query_details: {
						...payload().query_details,
						named_version: "preview",
					},
				},
				{
					...payload(),
					query_details: { ...payload().query_details, version_id: "1" },
				},
				{ ...payload(), page_banner: {} },
				...missingAccess,
				...accessKeys.flatMap((key) =>
					[true, "false"].map((value) => ({ ...payload(), [key]: value })),
				),
			]) {
				const tree = load(
					`${component(JSON.stringify(data))}${article}`,
					options,
				);
				expect(researchSourceReviews(tree)).toBeUndefined();
				for (const format of formats)
					expect(extractDocument(tree, { format })).not.toHaveProperty(
						"sourceReviews",
					);
			}
		},
	);

	it.each(formats)(
		"does not attach reader metadata during plain HTML parsing in %s",
		(format) => {
			const tree = parseHtmlDocument(`${component()}${article}`, url);
			trees.push(tree);
			expect(researchSourceReviews(tree)).toBeUndefined();
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceReviews",
			);
		},
	);

	it.each(extractionModes)(
		"preserves HTML-only boundaries in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			for (const mime of ["text/plain", "text/markdown", "application/json"]) {
				const source = `${component()}${article}`;
				const loadNonHtml = () =>
					load(
						mime === "application/json" ? JSON.stringify({ source }) : source,
						{ ...options, mime },
					);
				if (options.profile === "long-v1") {
					expect(loadNonHtml).toThrow(
						expect.objectContaining({
							code: "unsupported",
							message: "Long reader requires text/html",
						}),
					);
					continue;
				}
				const tree = loadNonHtml();
				expect(researchSourceReviews(tree)).toBeUndefined();
				expect(extractDocument(tree, { format })).not.toHaveProperty(
					"sourceReviews",
				);
			}
		},
	);
});

describe("source review metadata budgets and lifecycle", () => {
	it.each(extractionModes)(
		"fits whole leading entries with UTF-8 and escaping in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const tree = load(`${component()}${article}`, options);
			const full = extractDocument(tree, { format });
			const { sourceReviews, ...baseline } = full;
			const data = required(sourceReviews);
			const original = JSON.stringify(data);
			const empty = { ...data, entries: [], truncated: true };
			const prefix = {
				...data,
				entries: data.entries.slice(0, 1),
				truncated: true,
			};
			const minimum = bytes({ ...baseline, sourceReviews: prefix });
			expect(bytes(full)).toBeGreaterThan(JSON.stringify(full).length);
			for (const maxBytes of [
				bytes(baseline),
				bytes({ ...baseline, sourceReviews: empty }) - 1,
				bytes({ ...baseline, sourceReviews: empty }),
				minimum - 1,
				minimum,
				bytes(full) - 1,
				bytes(full),
			]) {
				const result = extractDocument(tree, { format, maxBytes });
				const { sourceReviews: fitted, ...body } = result;
				expect(body).toEqual(baseline);
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
				expectPrefix(fitted, data);
				if (maxBytes === bytes(baseline)) expect(fitted).toBeUndefined();
				if (maxBytes === bytes({ ...baseline, sourceReviews: empty }))
					expect(fitted).toEqual(empty);
				if (maxBytes === minimum) expect(fitted).toEqual(prefix);
				if (maxBytes === bytes(full)) expect(result).toEqual(full);
			}
			expect(JSON.stringify(researchSourceReviews(tree))).toBe(original);
		},
	);

	it.each(readerModes)(
		"caps attached metadata without clipping description strings in $profile/$rawPolicy",
		(options) => {
			const data = payload();
			const review = data.page_banner.page.product.review;
			review.summaries = Array.from({ length: 18 }, (_, index) => ({
				...summary(index),
				blurb: `Entry ${index}: ${'é😀\\"'.repeat(300)}`,
			}));
			review.ratings = [];
			const tree = load(
				`${component(JSON.stringify(data))}${article}`,
				options,
			);
			const snapshot = required(researchSourceReviews(tree));
			expect(bytes(snapshot)).toBeLessThanOrEqual(32_768);
			expect(snapshot.truncated).toBe(true);
			expect(snapshot.entries.length).toBeGreaterThan(1);
			expect(snapshot.entries.length).toBeLessThan(19);
			expect(snapshot.entries.map((entry) => entry.html)).toEqual(
				[introduction, ...review.summaries.map((entry) => entry.blurb)].slice(
					0,
					snapshot.entries.length,
				),
			);
			for (const format of formats)
				expect(extractDocument(tree, { format }).sourceReviews).toEqual(
					snapshot,
				);
		},
	);

	it.each(extractionModes)(
		"preserves all prior metadata and independent access declarations in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const source = `<head><link rel="alternate" type="application/rss+xml" href="/fixture-feed.xml"><script type="application/ld+json">{"@context":"https://schema.org","isAccessibleForFree":false}</script></head><body>${sourceDataTable()}${component()}${article}</body>`;
			for (const kind of ["feeds", "products", "videos", "charts", "all"]) {
				const tree = load(source, options);
				const control = load(inactive(source), options);
				attachPriorMetadata(tree, kind);
				attachPriorMetadata(control, kind);
				const full = extractDocument(tree, { format });
				const { sourceReviews, ...baseline } = full;
				const data = required(sourceReviews);
				for (const key of ["sourceDataTables", "sourceAccess", "sourceFeeds"])
					expect(baseline).toHaveProperty(key);
				for (const [selected, key] of [
					["products", "sourceProducts"],
					["videos", "sourceVideos"],
					["charts", "sourceChartTables"],
				])
					if (kind === selected || kind === "all")
						expect(baseline).toHaveProperty(key);
				expect(withoutReferences(baseline)).toEqual(
					withoutReferences(extractDocument(control, { format })),
				);
				for (const maxBytes of [
					bytes(baseline),
					bytes(full) - 1,
					bytes(full),
				]) {
					const result = extractDocument(tree, { format, maxBytes });
					const { sourceReviews: fitted, ...body } = result;
					expect(body).toEqual(baseline);
					expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
					expectPrefix(fitted, data);
					if (maxBytes === bytes(baseline)) expect(fitted).toBeUndefined();
					if (maxBytes === bytes(full)) expect(result).toEqual(full);
				}
			}
		},
	);

	it.each(readerModes)(
		"preserves ordinary text-prefix fallback in $profile/$rawPolicy",
		(options) => {
			const source = `${component()}<main><p>${"Readable café evidence 😀. ".repeat(1000)}</p></main>`;
			const tree = load(source, options);
			const control = load(inactive(source), options);
			let failure: unknown;
			try {
				extractDocument(tree, { maxBytes: 4096 });
			} catch (error) {
				failure = error;
			}
			expect(failure).toMatchObject({ code: "resource-limit" });
			const selected = {
				maxBytes: 4096,
				outputLimitPolicy: "text-prefix-v1" as const,
			};
			const result = extractDocument(tree, selected);
			const { sourceReviews, ...body } = result;
			expect(withoutReferences(body)).toEqual(
				withoutReferences(extractDocument(control, selected)),
			);
			expect(result.contentFallback).toMatchObject({
				truncated: true,
				trigger: resourceLimitDiagnostic(failure),
			});
			expect(bytes(result)).toBeLessThanOrEqual(selected.maxBytes);
			expectPrefix(sourceReviews, required(researchSourceReviews(tree)));
		},
	);

	it.each(extractionModes)(
		"retains document scope through selection, mutation and close in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const tree = load(
				`${component()}<aside>Outside evidence</aside>${article}`,
				options,
			);
			const data = required(researchSourceReviews(tree));
			const original = JSON.stringify(data);
			const queries = new DocumentQueries(tree);
			const main = queries.querySelector("#article");
			const heading = queries.querySelector("#guide");
			const paragraph = queries.querySelector("p");
			const sourceComponent = queries.querySelector("div");
			if (
				main === null ||
				heading === null ||
				paragraph === null ||
				sourceComponent === null
			)
				throw new Error("Missing reader fixture");
			const whole = extractDocument(tree, { format });
			for (const result of [
				extractDocument(tree, { format, root: tree.reference(main) }),
				extractDocument(tree, { format, section: tree.reference(heading) }),
				extractDocument(tree, { format, contentFocus: "main-content-v1" }),
			]) {
				expect(result.sourceReviews).toEqual(data);
				expect(result.sourceReviews?.scope).toBe("document-source");
				expect(JSON.stringify(result.content)).not.toContain(
					"Outside evidence",
				);
			}
			tree.setTextContent(paragraph, "Edited visible evidence");
			tree.setTextContent(sourceComponent, "Edited component DOM");
			const edited = extractDocument(tree, { format });
			expect(JSON.stringify(edited.content)).toContain(
				"Edited visible evidence",
			);
			expect(edited.sourceReviews).toEqual(data);
			expect(JSON.stringify(whole.content)).not.toContain(
				"Edited visible evidence",
			);
			expectFrozen(data);
			expect(Reflect.set(data.entries[0], "html", "Changed source")).toBe(
				false,
			);
			expect(Reflect.set(data.entries[0].source, "offset", 99)).toBe(false);
			expect(Reflect.set(data.entries, "length", 0)).toBe(false);
			tree.close();
			expect(researchSourceReviews(tree)).toBeUndefined();
			expect(JSON.stringify(whole.sourceReviews)).toBe(original);
			expect(JSON.stringify(edited.sourceReviews)).toBe(original);
		},
	);

	it.each(formats)(
		"copies explicitly attached snapshots without changing native DOM revision in %s",
		(format) => {
			const source = required(researchSourceReviews(load(component())));
			const input = {
				...source,
				unexpected: "Do not retain caller fields",
				entries: source.entries.map((entry) => ({
					...entry,
					source: { ...entry.source },
					...(entry.kind === "summary"
						? { usageIds: [...entry.usageIds] }
						: {}),
				})),
			};
			const tree = load(article);
			const revision = tree.revision;
			setResearchSourceReviews(tree, input);
			input.entries[0].html = "Changed caller input";
			input.entries[0].source.offset = 99;
			input.entries.length = 0;
			expect(tree.revision).toBe(revision);
			expect(researchSourceReviews(tree)).toEqual(source);
			const result = extractDocument(tree, { format });
			expect(result.sourceReviews).toEqual(source);
			expectFrozen(result.sourceReviews);
		},
	);
});

describe("source review content and diagnostic boundaries", () => {
	it.each(extractionModes)(
		"does not classify unrendered source HTML as content in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const data = payload();
			data.page_banner.page.product.review.introduction_linked =
				"<p>SOURCE_ONLY verify you are human captcha access denied</p>";
			const source = component(JSON.stringify(data));
			const tree = load(source, options);
			const control = load(inactive(source), options);
			const full = extractDocument(tree, { format });
			const { sourceReviews, ...body } = full;
			expect(sourceReviews).toBeDefined();
			expect(withoutReferences(body)).toEqual(
				withoutReferences(extractDocument(control, { format })),
			);
			expect(hasResearchExtractionContent(full)).toBe(false);
			expect(hasResearchExtractionContent(body)).toBe(false);
			for (const text of [
				researchDocumentDiagnosticText(tree),
				researchExtractionDiagnosticText(full),
			])
				for (const omitted of [
					"SOURCE_ONLY",
					"captcha",
					"access denied",
					"Rating description",
				])
					expect(text).not.toContain(omitted);
			const withArticle = load(`${source}${article}`, options);
			const result = extractDocument(withArticle, { format });
			expect(hasResearchExtractionContent(result)).toBe(true);
			expect(researchDocumentDiagnosticText(withArticle)).toContain(
				"Visible café evidence",
			);
			expect(researchExtractionDiagnosticText(result)).toContain(
				"Visible café evidence",
			);
		},
	);
});
