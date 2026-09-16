import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	ResearchSourceReviewsCollector,
	fitResearchSourceReviews,
	researchSourceReviews,
	rtingsReviewRoute,
	setResearchSourceReviews,
	type ResearchSourceReviews,
	type RtingsReviewRoute,
} from "./research-source-reviews.js";
import { sourceLiteralLimits } from "./source-literal.js";

const path = "/projector/reviews/example/synthetic-4k";
const url = `https://www.rtings.com${path}`;
const reviewPath = "$.page_banner.page.product.review";
const trees: DocumentTree[] = [];
const strictAccessKeys = [
	"has_insider_access",
	"has_admin_access",
	"has_preview_access",
	"has_preview_access_through_product_token",
];
const nullableAccessKeys = [
	"has_preview_access_through_share_token",
	"had_preview_access_through_expired_share_token",
];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function summary(overrides: Record<string, unknown> = {}) {
	return {
		id: "31",
		title: null,
		priority: "01",
		order: 0,
		usage_ids: ["41", "42", "41"],
		blurb: "<b>Source &amp; summary</b><script>notExecuted()</script>",
		...overrides,
	};
}

function rating(overrides: Record<string, unknown> = {}) {
	return {
		usage: { id: "41", name: "Synthetic usage", kind: "synthetic" },
		linked_description: "<p>Source rating description</p>",
		unblurred: false,
		score: null,
		...overrides,
	};
}

function payload(
	review: Record<string, unknown> = {},
	product: Record<string, unknown> = {},
	root: Record<string, unknown> = {},
) {
	return {
		query_details: { url: path, named_version: "public", version_id: null },
		has_insider_access: false,
		has_admin_access: false,
		has_preview_access: false,
		has_preview_access_through_product_token: false,
		has_preview_access_through_share_token: null,
		had_preview_access_through_expired_share_token: null,
		page_banner: {
			page: {
				product: {
					id: "11",
					fullname: "Synthetic product",
					review: {
						id: "21",
						introduction_linked:
							'<p>Exact &amp; <a href="/relative">intro</a></p>',
						summaries: [summary()],
						ratings: [rating()],
						...review,
					},
					...product,
				},
			},
		},
		...root,
	};
}

function collect(
	source: string | undefined = JSON.stringify(payload()),
	offset = 17,
) {
	const collector = new ResearchSourceReviewsCollector({ path });
	collector.add(source, offset);
	return collector.finish();
}

function collectReview(review: Record<string, unknown>) {
	return collect(JSON.stringify(payload(review)));
}

function required(
	data: ResearchSourceReviews | undefined,
): ResearchSourceReviews {
	expect(data).toBeDefined();
	if (!data) throw new Error("Missing source reviews");
	return data;
}

function bytes(value: unknown) {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function expectFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectFrozen(child);
}

describe("RTINGS review routes", () => {
	it.each(["", "#", "#description", "#fragment?not-a-query", "#😀"])(
		"accepts the exact source route with fragment %s",
		(fragment) => {
			const route = rtingsReviewRoute(url + fragment);
			expect(route).toEqual({ path });
			expectFrozen(route);
		},
	);

	it.each([
		`http://www.rtings.com${path}`,
		`HTTPS://www.rtings.com${path}`,
		`https://WWW.RTINGS.COM${path}`,
		`https://rtings.com${path}`,
		`https://www.rtings.com.example.invalid${path}`,
		`https://user:pass@www.rtings.com${path}`,
		`https://www.rtings.com:443${path}`,
		`${url}/`,
		`${url}?`,
		`${url}?mode=public#fragment`,
		url.replace("synthetic-4k", "Synthetic-4k"),
		url.replace("synthetic-4k", "synthetic_4k"),
		url.replace("synthetic-4k", "%73ynthetic-4k"),
		url.replace("synthetic-4k", "../synthetic-4k"),
		url.replace("synthetic-4k", "nested/slug"),
		url.replace("projector", "early-access"),
		url.replace("projector", "-projector"),
		url.replace("example", "-example"),
		url.replace("synthetic-4k", "-synthetic-4k"),
		url.replace("projector", ""),
		url.replace("example", ""),
		url.replace("synthetic-4k", "."),
		url.replace("synthetic-4k", ".."),
		` ${url}`,
		`${url} `,
		`${url}\n`,
		`${url}#\t`,
		`${url}#\u007f`,
		`${url}#\u0085`,
	])("rejects nonexact routes %j", (value) => {
		expect(rtingsReviewRoute(value)).toBeUndefined();
	});

	it("enforces each route segment limit and the total UTF16 limit", () => {
		const segments = ["a".repeat(64), "b".repeat(128), "c".repeat(256)];
		const routeUrl = (parts: string[]) =>
			`https://www.rtings.com/${parts[0]}/reviews/${parts[1]}/${parts[2]}`;
		expect(rtingsReviewRoute(routeUrl(segments))).toBeDefined();
		for (let index = 0; index < segments.length; index++) {
			const oversized = [...segments];
			oversized[index] += "a";
			expect(rtingsReviewRoute(routeUrl(oversized))).toBeUndefined();
		}
		const boundary = `${url}#${"a".repeat(4096 - url.length - 1)}`;
		expect(rtingsReviewRoute(boundary)).toBeDefined();
		expect(rtingsReviewRoute(`${boundary}a`)).toBeUndefined();
		expect(rtingsReviewRoute(null as unknown as string)).toBeUndefined();
	});

	it("validates and copies constructor routes", () => {
		for (const route of [
			null,
			{},
			[],
			{ path: 1 },
			{ path: url },
			{ path: `${path}#x` },
			{ path: `${path}?` },
		]) {
			expect(
				() => new ResearchSourceReviewsCollector(route as RtingsReviewRoute),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
		const route = { path };
		const collector = new ResearchSourceReviewsCollector(route);
		route.path = "/tv/reviews/other/product";
		collector.add(JSON.stringify(payload()), 17);
		expect(collector.finish()).toEqual(collect());
	});
});

describe("strict and bounded component collection", () => {
	it("preserves only selected HTML source fields and exact locations", () => {
		const data = required(collect());
		expect(data).toEqual({
			kind: "rtings-component-review-text-v1",
			scope: "document-source",
			partial: true,
			rendered: false,
			verified: false,
			textFormat: "html-source",
			routePath: path,
			productId: "11",
			productName: "Synthetic product",
			reviewId: "21",
			truncated: false,
			entries: [
				{
					kind: "introduction",
					source: {
						offset: 17,
						offsetBasis: "lf-normalized-utf16",
						path: `${reviewPath}.introduction_linked`,
					},
					html: payload().page_banner.page.product.review.introduction_linked,
				},
				{
					kind: "summary",
					source: {
						offset: 17,
						offsetBasis: "lf-normalized-utf16",
						path: `${reviewPath}.summaries[0].blurb`,
					},
					html: summary().blurb,
					id: "31",
					title: null,
					priority: "01",
					order: 0,
					usageIds: ["41", "42", "41"],
				},
				{
					kind: "rating-description",
					source: {
						offset: 17,
						offsetBasis: "lf-normalized-utf16",
						path: `${reviewPath}.ratings[0].linked_description`,
					},
					html: rating().linked_description,
					usageId: "41",
					usageName: "Synthetic usage",
					usageKind: "synthetic",
					unblurred: false,
					scoreState: "null",
				},
			],
		});
		expectFrozen(data);
		expect(collect(` \t\r\n${JSON.stringify(payload())}\r\n`)).toEqual(data);
		expect(
			required(collect(JSON.stringify(payload()), Number.MAX_SAFE_INTEGER))
				.entries[0].source.offset,
		).toBe(Number.MAX_SAFE_INTEGER);
	});

	it.each([
		(source: string) => source.replace('"query_details":', "query_details:"),
		(source: string) => source.replace('"public"', "'public'"),
		(source: string) => source.replace(/}$/, ",}"),
		(source: string) => `/* comment */${source}`,
		(source: string) => `(${source})`,
		(source: string) => `${source};`,
		(source: string) => source + source,
		(source: string) => source.replace('"public"', "undefined"),
		(source: string) => source.replace('"public"', "(()=>{throw 1})()"),
		(source: string) => source.replace('"order":0', '"order":01'),
		(source: string) => source.replace('"order":0', '"order":NaN'),
		(source: string) => source.replace('"order":0', '"order":1e999'),
		(source: string) => source.replace('"order":0', '"order":9007199254740992'),
		(source: string) => source.replace('"order":0', '"order":0,"order":1'),
		(source: string) =>
			source.replace('"order":0', '"order":0,"\\u006frder":1'),
		(source: string) => source.replace(/}$/, ',"__proto__":{}}'),
		(source: string) => source.replace(/}$/, ',"prototype":{}}'),
		(source: string) => source.replace(/}$/, ',"constructor":{}}'),
		(source: string) => source.replace(/}$/, ',"\\u005f_proto__":{}}'),
		(source: string) => source.replaceAll('"', "&quot;"),
	])(
		"rejects non-JSON syntax or maintained-parser rejections (#%#)",
		(change) => {
			expect(collect(change(JSON.stringify(payload())))).toBeUndefined();
		},
	);

	it("invalidates all metadata for multiple eligible components, even missing or invalid props", () => {
		const valid = JSON.stringify(payload());
		for (const other of [undefined, "", "{}", "{", valid, " ".repeat(65_537)]) {
			for (const values of [
				[valid, other],
				[other, valid],
			]) {
				const collector = new ResearchSourceReviewsCollector({ path });
				for (const value of values) collector.add(value, 0);
				expect(collector.finish()).toBeUndefined();
				collector.add(valid, 100);
				expect(collector.finish()).toBeUndefined();
			}
		}
		const empty = new ResearchSourceReviewsCollector({ path });
		expect(empty.finish()).toBeUndefined();
		empty.add(undefined, 0);
		expect(empty.finish()).toBeUndefined();
	});

	it("rejects invalid API input, including after ambiguity", () => {
		const collector = new ResearchSourceReviewsCollector({ path });
		collector.add(undefined, 0);
		collector.add(undefined, 1);
		for (const offset of [
			-1,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
			"1",
			undefined,
		]) {
			expect(() => collector.add("{}", offset as number)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		for (const value of [null, 0, false, {}, [], new String("{}")]) {
			expect(() => collector.add(value as string, 0)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
	});

	it("retains the maintained parser's input, depth, value, key, string and UTF8 bounds", () => {
		const source = JSON.stringify(payload());
		const boundary =
			source + " ".repeat(sourceLiteralLimits.inputCodeUnits - source.length);
		expect(collect(boundary)).toEqual(collect());
		expect(collect(`${boundary} `)).toBeUndefined();
		let nested: unknown = null;
		for (let depth = 0; depth <= sourceLiteralLimits.depth; depth++)
			nested = [nested];
		const rejected = [
			nested,
			Array.from({ length: sourceLiteralLimits.entries + 1 }, () => null),
			Object.fromEntries(
				Array.from({ length: sourceLiteralLimits.entries + 1 }, (_, index) => [
					`key${index}`,
					null,
				]),
			),
			Array.from({ length: 17 }, () => Array.from({ length: 256 }, () => null)),
			"a".repeat(sourceLiteralLimits.stringCodeUnits + 1),
			Array.from({ length: 8 }, () => "界".repeat(4096)),
		];
		for (const unknown of rejected) {
			const input = JSON.stringify(payload({}, {}, { unknown }));
			expect(input.length).toBeLessThanOrEqual(65_536);
			expect(collect(input)).toBeUndefined();
		}
		expect(
			collectReview({ introduction_linked: "a".repeat(4097) }),
		).toBeUndefined();
	});
});

describe("source schema and access-context restrictions", () => {
	it("requires exact query details", () => {
		for (const query_details of [
			null,
			[],
			{},
			{ url: path, named_version: "public" },
			{ url: path, version_id: null },
			{ url: `${path}#x`, named_version: "public", version_id: null },
			{ url: path, named_version: "preview", version_id: null },
			{ url: path, named_version: "public", version_id: "0" },
		]) {
			expect(
				collect(JSON.stringify(payload({}, {}, { query_details }))),
			).toBeUndefined();
		}
	});

	it("requires all six explicit access flags without coercion", () => {
		for (const key of [...strictAccessKeys, ...nullableAccessKeys]) {
			for (const value of [undefined, true, "false", 0, [], {}]) {
				expect(
					collect(JSON.stringify(payload({}, {}, { [key]: value }))),
				).toBeUndefined();
			}
			expect(
				collect(JSON.stringify(payload({}, {}, { [key]: false }))),
			).toEqual(collect());
		}
		for (const key of strictAccessKeys) {
			expect(
				collect(JSON.stringify(payload({}, {}, { [key]: null }))),
			).toBeUndefined();
		}
		for (const key of nullableAccessKeys) {
			expect(collect(JSON.stringify(payload({}, {}, { [key]: null })))).toEqual(
				collect(),
			);
		}
	});

	it("requires the selected product/review and arrays rather than scanning alternate objects", () => {
		for (const root of [
			null,
			[],
			{},
			{ ...payload(), page_banner: null },
			{ ...payload(), page_banner: { page: { product: [] } } },
		]) {
			expect(collect(JSON.stringify(root))).toBeUndefined();
		}
		for (const review of [
			null,
			[],
			{},
			{ id: "21", summaries: [] },
			{ id: "21", ratings: [] },
		]) {
			expect(collect(JSON.stringify(payload({}, { review })))).toBeUndefined();
		}
		for (const key of ["summaries", "ratings"]) {
			for (const value of [undefined, null, {}, "", false]) {
				expect(collectReview({ [key]: value })).toBeUndefined();
			}
		}
	});

	it.each([
		undefined,
		null,
		1,
		0,
		"",
		"0",
		"01",
		"-1",
		"1.0",
		"1e3",
		"1 ",
		"1\n",
		"١",
		"1".repeat(33),
	])("rejects noncanonical IDs without coercion: %j", (id) => {
		expect(collect(JSON.stringify(payload({}, { id })))).toBeUndefined();
		expect(collectReview({ id })).toBeUndefined();
		const summaries = required(collectReview({ summaries: [summary({ id })] }));
		expect(summaries.entries.some((entry) => entry.kind === "summary")).toBe(
			false,
		);
		expect(summaries.truncated).toBe(true);
		const ratings = required(
			collectReview({
				ratings: [rating({ usage: { id, name: "Name", kind: "Kind" } })],
			}),
		);
		expect(
			ratings.entries.some((entry) => entry.kind === "rating-description"),
		).toBe(false);
		expect(ratings.truncated).toBe(true);
	});

	it("accepts 32-digit IDs as strings and enforces product name bounds", () => {
		const id = "9".repeat(32);
		const data = required(
			collect(
				JSON.stringify(payload({ id }, { id, fullname: "😀".repeat(256) })),
			),
		);
		expect(data.productId).toBe(id);
		expect(data.reviewId).toBe(id);
		for (const fullname of [undefined, null, "", 1, "a".repeat(513)]) {
			expect(
				collect(JSON.stringify(payload({}, { fullname }))),
			).toBeUndefined();
		}
	});
});

describe("whole source records and qualifiers", () => {
	it("allows absent or empty introductions but truncates invalid present text", () => {
		for (const introduction_linked of [
			undefined,
			"",
			" \t\r\n",
			"\u00a0\u2003",
			null,
			0,
			false,
			[],
			{},
		]) {
			const data = required(collectReview({ introduction_linked }));
			expect(data.entries.map((entry) => entry.kind)).toEqual([
				"summary",
				"rating-description",
			]);
			expect(data.truncated).toBe(
				introduction_linked !== undefined &&
					typeof introduction_linked !== "string",
			);
		}
		for (const introduction_linked of [undefined, "", " \t\r\n", null]) {
			expect(
				collectReview({ introduction_linked, summaries: [], ratings: [] }),
			).toBeUndefined();
		}
	});

	it.each([" ", "\t\r\n", "\u00a0\u2003"])(
		"rejects blank required names and descriptions without retaining partial records: %j",
		(blank) => {
			expect(
				collect(JSON.stringify(payload({}, { fullname: blank }))),
			).toBeUndefined();
			const summaries = required(
				collectReview({ summaries: [summary({ blurb: blank })] }),
			);
			expect(summaries.entries.map((entry) => entry.kind)).toEqual([
				"introduction",
				"rating-description",
			]);
			expect(summaries.truncated).toBe(true);
			const invalidRatings = [
				rating({ linked_description: blank }),
				rating({ usage: { ...rating().usage, name: blank } }),
				rating({ usage: { ...rating().usage, kind: blank } }),
			];
			for (const invalid of invalidRatings) {
				const data = required(collectReview({ ratings: [invalid] }));
				expect(data.entries.map((entry) => entry.kind)).toEqual([
					"introduction",
					"summary",
				]);
				expect(data.truncated).toBe(true);
			}
		},
	);

	it("preserves surrounding whitespace in accepted names, descriptions and qualifiers", () => {
		const original = " \t Original source &amp; text \r\n";
		const data = required(
			collect(
				JSON.stringify(
					payload(
						{
							introduction_linked: original,
							summaries: [
								summary({
									blurb: original,
									title: " \t",
									priority: " 01 ",
									order: " 0 ",
								}),
							],
							ratings: [
								rating({
									linked_description: original,
									usage: { id: "41", name: original, kind: original },
								}),
							],
						},
						{ fullname: original },
					),
				),
			),
		);
		expect(data.productName).toBe(original);
		expect(data.entries.map((entry) => entry.html)).toEqual([
			original,
			original,
			original,
		]);
		expect(data.entries[1]).toMatchObject({
			title: " \t",
			priority: " 01 ",
			order: " 0 ",
		});
		expect(data.entries[2]).toMatchObject({
			usageName: original,
			usageKind: original,
		});
		expect(data.truncated).toBe(false);
	});

	it("preserves exact text up to 4096 UTF16 units without decoding or clipping", () => {
		const html = "😀".repeat(2048);
		const data = required(
			collectReview({
				introduction_linked: html,
				summaries: [summary({ blurb: html })],
				ratings: [rating({ linked_description: html })],
			}),
		);
		expect(data.entries.map((entry) => entry.html)).toEqual([html, html, html]);
		expect(data.truncated).toBe(false);
		const exact = '\r\n\t\u0000 &amp; &#39; <b title="&quot;">source</b>';
		expect(
			required(collectReview({ introduction_linked: exact })).entries[0].html,
		).toBe(exact);
	});

	it("retains typed scalar qualifiers, order, titles and all usage ID associations", () => {
		const qualifiers = [null, false, true, 0, -1.25, "0", "z".repeat(128)];
		const summaries = qualifiers.map((priority, index) =>
			summary({
				id: String(index + 1),
				priority,
				order: priority,
				title: index % 2 ? "" : "t".repeat(256),
				usage_ids: Array.from({ length: 32 }, () => "9".repeat(32)),
			}),
		);
		const data = required(collectReview({ summaries }));
		const selected = data.entries.filter((entry) => entry.kind === "summary");
		expect(selected.map((entry) => entry.priority)).toEqual(qualifiers);
		expect(selected.map((entry) => entry.order)).toEqual(qualifiers);
		expect(selected.map((entry) => entry.id)).toEqual(
			summaries.map((entry) => entry.id),
		);
		expect(selected.map((entry) => entry.title)).toEqual(
			summaries.map((entry) => entry.title),
		);
		expect(selected.map((entry) => entry.usageIds)).toEqual(
			summaries.map((entry) => entry.usage_ids),
		);
		expect(data.truncated).toBe(false);
		expectFrozen(data);
		expect(
			required(collectReview({ summaries: [summary({ usage_ids: [] })] }))
				.entries[1],
		).toMatchObject({ usageIds: [] });
	});

	it("skips entire invalid summaries without losing associations or source indices", () => {
		const overrides = [
			{ title: undefined },
			{ title: false },
			{ title: "t".repeat(257) },
			{ priority: undefined },
			{ priority: [] },
			{ priority: "a".repeat(129) },
			{ order: undefined },
			{ order: {} },
			{ order: "a".repeat(129) },
			{ usage_ids: undefined },
			{ usage_ids: {} },
			{ usage_ids: ["41", 42] },
			{ usage_ids: ["41", "0"] },
			{ usage_ids: ["41", "1\n"] },
			{ usage_ids: Array.from({ length: 33 }, () => "41") },
			{ blurb: undefined },
			{ blurb: null },
			{ blurb: "" },
			{ blurb: {} },
		];
		for (const invalid of [
			null,
			[],
			...overrides.map((override) => summary(override)),
		]) {
			const data = required(collectReview({ summaries: [invalid, summary()] }));
			expect(
				data.entries
					.filter((entry) => entry.kind === "summary")
					.map((entry) => entry.source.path),
			).toEqual([`${reviewPath}.summaries[1].blurb`]);
			expect(data.truncated).toBe(true);
		}
	});

	it("distinguishes missing/null/omitted scores without exporting any score value", () => {
		const scores = [
			undefined,
			null,
			8.125,
			"PRIVATE_SCORE",
			false,
			{ rendered_value: "PRIVATE_RENDERED" },
			[9],
		];
		const data = required(
			collectReview({
				ratings: scores.map((score, index) =>
					rating({ score, unblurred: index % 2 === 0 }),
				),
			}),
		);
		const entries = data.entries.filter(
			(entry) => entry.kind === "rating-description",
		);
		expect(entries.map((entry) => entry.scoreState)).toEqual([
			"missing",
			"null",
			"omitted",
			"omitted",
			"omitted",
			"omitted",
			"omitted",
		]);
		expect(entries.map((entry) => entry.unblurred)).toEqual([
			true,
			false,
			true,
			false,
			true,
			false,
			true,
		]);
		for (const entry of entries)
			expect(Object.hasOwn(entry, "score")).toBe(false);
		expect(JSON.stringify(data)).not.toContain("PRIVATE_");
		expect(JSON.stringify(data)).not.toContain("8.125");
		expect(data.truncated).toBe(false);
	});

	it("excludes explicitly hidden usages without truncation or interpreting other flags", () => {
		for (const flag of [undefined, false, null, "true", 1, true]) {
			const data = required(
				collectReview({
					ratings: [
						rating({
							usage: {
								...rating().usage,
								is_hidden_from_featured_sections: flag,
							},
						}),
					],
				}),
			);
			expect(
				data.entries.some((entry) => entry.kind === "rating-description"),
			).toBe(flag !== true);
			expect(data.truncated).toBe(false);
		}
		const data = required(
			collectReview({
				ratings: [
					{ usage: { is_hidden_from_featured_sections: true } },
					rating(),
				],
			}),
		);
		expect(data.truncated).toBe(false);
		expect(data.entries[2].source.path).toBe(
			`${reviewPath}.ratings[1].linked_description`,
		);
	});

	it("requires complete rating usage, description and unblurred fields", () => {
		const invalidRatings = [
			null,
			[],
			rating({ usage: undefined }),
			rating({ usage: [] }),
			...(["name", "kind"] as const).flatMap((key) =>
				[undefined, null, "", false, "a".repeat(key === "name" ? 257 : 65)].map(
					(value) => rating({ usage: { ...rating().usage, [key]: value } }),
				),
			),
			...[undefined, null, 0, "false"].map((unblurred) =>
				rating({ unblurred }),
			),
			...[undefined, null, "", false, {}].map((linked_description) =>
				rating({ linked_description }),
			),
		];
		for (const invalid of invalidRatings) {
			const data = required(collectReview({ ratings: [invalid, rating()] }));
			expect(
				data.entries
					.filter((entry) => entry.kind === "rating-description")
					.map((entry) => entry.source.path),
			).toEqual([`${reviewPath}.ratings[1].linked_description`]);
			expect(data.truncated).toBe(true);
		}
		const data = required(
			collectReview({
				ratings: [
					rating({
						usage: {
							id: "9".repeat(32),
							name: "a".repeat(256),
							kind: "b".repeat(64),
						},
					}),
				],
			}),
		);
		expect(data.truncated).toBe(false);
	});

	it("uses at most 32 summary slots and 16 rating slots in original order", () => {
		const summaries = Array.from({ length: 33 }, (_, index) =>
			summary({ id: String(index + 1), blurb: `Summary ${index}` }),
		);
		const ratings = Array.from({ length: 17 }, (_, index) =>
			rating({ linked_description: `Rating ${index}` }),
		);
		const bounded = required(collectReview({ summaries, ratings }));
		expect(bounded.entries).toHaveLength(49);
		expect(bounded.entries.slice(1, 33).map((entry) => entry.html)).toEqual(
			summaries.slice(0, 32).map((entry) => entry.blurb),
		);
		expect(bounded.entries.slice(33).map((entry) => entry.html)).toEqual(
			ratings.slice(0, 16).map((entry) => entry.linked_description),
		);
		expect(bounded.truncated).toBe(true);
		expect(
			required(
				collectReview({
					summaries: summaries.slice(0, 32),
					ratings: ratings.slice(0, 16),
				}),
			).truncated,
		).toBe(false);
		const skipped = required(
			collectReview({
				summaries: [...Array.from({ length: 32 }, () => null), summary()],
				ratings: [
					...Array.from({ length: 16 }, () =>
						rating({ usage: { is_hidden_from_featured_sections: true } }),
					),
					rating(),
				],
			}),
		);
		expect(skipped.entries.map((entry) => entry.kind)).toEqual([
			"introduction",
		]);
		expect(skipped.truncated).toBe(true);
	});

	it("excludes unknown fields and arbitrary global product/review identities", () => {
		const secret = "PRIVATE_UNSELECTED";
		const data = required(
			collect(
				JSON.stringify(
					payload(
						{
							default_score_set_score: secret,
							featured_test_results: [{ rendered_value: secret }],
							summaries: [
								summary({
									worths: secret,
									suitable: secret,
									preferred: secret,
								}),
							],
							ratings: [
								rating({
									score: secret,
									rendered_value: secret,
									worths: secret,
									suitable: secret,
									preferred: secret,
								}),
							],
						},
						{ skus: secret, images: secret, unknown: secret },
						{
							session: secret,
							deal: secret,
							tracking: secret,
							global_config: {
								id: "999",
								fullname: secret,
								review: { id: "888" },
							},
						},
					),
				),
			),
		);
		expect(JSON.stringify(data)).not.toContain(secret);
		expect(data.productId).toBe("11");
		expect(data.reviewId).toBe("21");
		expect(data.entries[2]).toMatchObject({ scoreState: "omitted" });
	});
});

describe("UTF8 fitting and metadata lifecycle", () => {
	it("fits whole leading records with exact envelope, escaping and UTF8 accounting", () => {
		const data = required(
			collectReview({
				introduction_linked: '\u0000"\\😀界',
				summaries: [summary({ blurb: "middle" })],
				ratings: [rating({ linked_description: "last" })],
			}),
		);
		const before = JSON.stringify(data);
		const full = required(fitResearchSourceReviews(data, bytes(data)));
		expect(full).toEqual(data);
		expect(full).not.toBe(data);
		for (let count = 0; count < data.entries.length; count++) {
			const expected = {
				...data,
				entries: data.entries.slice(0, count),
				truncated: true,
			};
			const limit = bytes(expected);
			const fitted = required(fitResearchSourceReviews(data, limit));
			expect(fitted).toEqual(expected);
			expect(bytes(fitted)).toBe(limit);
			expectFrozen(fitted);
			const smaller = fitResearchSourceReviews(data, limit - 1);
			if (count === 0) expect(smaller).toBeUndefined();
			else expect(required(smaller).entries).toHaveLength(count - 1);
		}
		expect(
			required(fitResearchSourceReviews(data, bytes(data) - 1)).entries,
		).toHaveLength(2);
		expect(JSON.stringify(data)).toBe(before);
		expect(fitResearchSourceReviews(data, 0)).toBeUndefined();
	});

	it("caps collector and fitter metadata at 32768 UTF8 bytes without clipping", () => {
		const html = "界".repeat(4096);
		const data = required(
			collectReview({
				introduction_linked: html,
				summaries: [summary({ blurb: html }), summary({ blurb: html })],
				ratings: [],
			}),
		);
		expect(data.entries).toHaveLength(2);
		expect(data.entries.map((entry) => entry.html)).toEqual([html, html]);
		expect(data.truncated).toBe(true);
		expect(bytes(data)).toBeLessThanOrEqual(32_768);
		const oversized = {
			...data,
			truncated: false,
			entries: [...data.entries, data.entries[1], data.entries[1]],
		};
		expect(
			required(fitResearchSourceReviews(oversized, Number.MAX_SAFE_INTEGER)),
		).toEqual(data);
		const empty = required(
			fitResearchSourceReviews({ ...data, entries: [] }, 32_768),
		);
		expect(empty.entries).toEqual([]);
		expect(empty.truncated).toBe(true);
	});

	it("does not skip a large first entry to retain a smaller later one", () => {
		const data = required(
			collectReview({ introduction_linked: "a".repeat(4096) }),
		);
		const limit = bytes({
			...data,
			entries: [data.entries[1]],
			truncated: true,
		});
		expect(required(fitResearchSourceReviews(data, limit)).entries).toEqual([]);
	});

	it.each([
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		"100",
		undefined,
	])("rejects invalid byte budgets: %j", (limit) => {
		expect(() =>
			fitResearchSourceReviews(required(collect()), limit as number),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	});

	it("copies and deeply freezes only whitelisted fields, without touching unknown getters", () => {
		const original = required(collect());
		const input = JSON.parse(JSON.stringify(original));
		for (const target of [
			input,
			...input.entries,
			...input.entries.map((entry: { source: unknown }) => entry.source),
		]) {
			Object.defineProperty(target, "unknown", {
				enumerable: true,
				get() {
					throw new Error("Unknown field accessed");
				},
			});
		}
		input.entries[2].score = "PRIVATE_SCORE";
		input.entries[2].rendered_value = "PRIVATE_RENDERED";
		const copied = required(fitResearchSourceReviews(input, 32_768));
		expect(copied).toEqual(original);
		expectFrozen(copied);
		input.productName = "changed";
		input.entries[0].source.path = "changed";
		input.entries[1].usageIds.push("999");
		expect(copied).toEqual(original);
	});

	it("stores independent immutable source metadata, reuses cleanup and clears on close", () => {
		const tree = new DocumentTree(url);
		const other = new DocumentTree(url);
		trees.push(tree, other);
		const onClose = vi.spyOn(tree, "onClose");
		const expected = required(collect());
		const input = JSON.parse(JSON.stringify(expected));
		input.extra = "PRIVATE_ROOT";
		input.entries[0].extra = "PRIVATE_ENTRY";
		input.entries[0].source.extra = "PRIVATE_LOCATION";
		input.entries[2].score = "PRIVATE_SCORE";
		setResearchSourceReviews(tree, input);
		const stored = required(researchSourceReviews(tree));
		expect(stored).toEqual(expected);
		expect(stored).not.toBe(input);
		expectFrozen(stored);
		input.entries[1].usageIds.push("999");
		input.entries[0].html = "changed";
		expect(researchSourceReviews(tree)).toEqual(expected);
		expect(researchSourceReviews(other)).toBeUndefined();
		for (let index = 0; index < 70; index++)
			setResearchSourceReviews(tree, expected);
		expect(onClose).toHaveBeenCalledTimes(1);
		tree.close();
		expect(researchSourceReviews(tree)).toBeUndefined();
		expect(stored).toEqual(expected);
		expect(() => setResearchSourceReviews(tree, expected)).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
	});
});
