import { afterEach, describe, expect, it } from "vitest";
import {
	hasResearchExtractionContent,
	researchDocumentDiagnosticText,
	researchExtractionDiagnosticText,
} from "../scripts/research-content.js";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { researchSourceTemplateFallbacks } from "./research-source-template-fallbacks.js";
import { DocumentQueries } from "./selectors.js";

const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const url = "https://template-fallback.fixture.invalid/reference";
const limits = {
	maxNodes: 4096,
	maxDepth: 128,
	maxTextCodeUnits: 200_000,
	maxChanges: 1024,
};
const modes = ([undefined, "long-v1"] as const).flatMap((profile) =>
	([undefined, "separate-omitted-raw-v1"] as const).flatMap((rawPolicy) =>
		([undefined, "source-hidden-inline-v1"] as const).map(
			(visibilityPolicy) => ({ profile, rawPolicy, visibilityPolicy }),
		),
	),
);
type ReaderMode = (typeof modes)[number];
const notice = "Enable JavaScript to view this browser compatibility table.";
const fragment = `<template shadowroot="open" shadowrootmode="open"><style>[hidden]{display:none!important}</style><!--lit-part--><p><noscript>${notice}</noscript></p></template>`;
const article = `<main><h1 id="promise">Promise</h1><p>Original documentation.</p><h2 id="compatibility">Browser compatibility</h2><mdn-compat-table-lazy>${fragment}</mdn-compat-table-lazy><h2 id="next">Next</h2><p>Other content.</p></main>`;

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function sanitize(source: string, mode: ReaderMode) {
	return sanitizeResearchHtml(
		source,
		{},
		undefined,
		mode.profile,
		mode.rawPolicy,
		mode.visibilityPolicy,
	);
}

function load(source: string, mode = modes[0], mime = "text/html") {
	const body = encoder.encode(source);
	return loadResearchDocument(
		{
			url,
			status: 200,
			headers: { "content-type": [mime] },
			body,
			encodedBytes: body.byteLength,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "synthetic-template-fallback",
			signal: new AbortController().signal,
			limits,
			initializeDocument: (tree) => trees.push(tree),
		},
		mode.profile,
		mode.rawPolicy,
		mode.visibilityPolicy,
	);
}

function baseline(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (key, child) =>
			["document", "scope", "ref", "sourceTemplateFallbacks"].includes(key)
				? undefined
				: child,
		),
	);
}

describe.each(modes)("template fallback reader %j", (mode) => {
	it("retains the exact MDN notice without changing sanitized HTML or counters", () => {
		const result = sanitize(article, mode);
		const control = sanitize(article.replaceAll("noscript", "fallback"), mode);
		expect(result.html).toBe(control.html);
		expect(result.report).toEqual(control.report);
		expect(result.html).not.toContain(notice);
		expect(result.sourceTemplateFallbacks).toEqual({
			kind: "html-template-noscript-source-v1",
			scope: "document-source",
			partial: true,
			rendered: false,
			verified: false,
			textFormat: "html-source",
			truncated: false,
			entries: [
				{
					template: {
						offset: article.indexOf("<template"),
						attributes: { shadowrootmode: "open" },
					},
					source: {
						offset: article.indexOf("<noscript"),
						offsetBasis: "lf-normalized-utf16",
					},
					html: notice,
				},
			],
		});
	});

	it.each(["markdown", "json"] as const)(
		"exports source-only %s metadata without changing ordinary content",
		(format) => {
			const tree = load(article, mode);
			const control = load(article.replaceAll("noscript", "fallback"), mode);
			const result = extractDocument(tree, { format });
			expect(result.sourceTemplateFallbacks?.entries[0].html).toBe(notice);
			expect(baseline(result)).toEqual(
				baseline(extractDocument(control, { format })),
			);
			expect(researchExtractionDiagnosticText(result)).not.toContain(notice);
			expect(researchDocumentDiagnosticText(tree)).not.toContain(notice);
		},
	);

	it("keeps a fallback-only document empty for content-success classification", () => {
		const tree = load(`<main>${fragment}</main>`, mode);
		for (const format of ["markdown", "json"] as const) {
			const result = extractDocument(tree, { format });
			expect(result.sourceTemplateFallbacks?.entries[0].html).toBe(notice);
			expect(hasResearchExtractionContent(result)).toBe(false);
			expect(researchExtractionDiagnosticText(result)).toBe("");
		}
	});

	it.each(["hidden", "inert", 'aria-hidden="true"', 'style="display:none"'])(
		"does not mine %s ordinary ancestors or template roots",
		(attribute) => {
			for (const source of [
				`<div ${attribute}>${fragment}</div>`,
				fragment.replace("<template ", `<template ${attribute} `),
			])
				expect(sanitize(source, mode).sourceTemplateFallbacks).toBeUndefined();
		},
	);

	it("recovers eligibility after hidden siblings and implied paragraph closure", () => {
		for (const source of [
			`<div inert>${fragment}</div>${fragment}`,
			`<p inert>Excluded<p>Next${fragment}</p>`,
			`<p inert>Excluded</p>${fragment}`,
		])
			expect(
				sanitize(source, mode).sourceTemplateFallbacks?.entries,
			).toHaveLength(1);
	});

	it("ignores fallback lookalikes in scripts, ordinary noscript, head and foreign trees", () => {
		for (const source of [
			`<script>const inertSource = '${fragment}';</script>`,
			`<noscript>${fragment}</noscript>`,
			`<head>${fragment}</head><body>Other</body>`,
			`<svg>${fragment}</svg>`,
			`<math>${fragment}</math>`,
		])
			expect(sanitize(source, mode).sourceTemplateFallbacks).toBeUndefined();
	});

	it("resets nested hidden state after omitted implied paragraph closure", () => {
		const source = `<template><p hidden>Excluded<p><noscript>${notice}</noscript></p></template>`;
		expect(
			sanitize(source, mode).sourceTemplateFallbacks?.entries[0].html,
		).toBe(notice);
	});

	it("rejects an entire fallback with hidden descendants and retains its sibling", () => {
		const source = `<template><noscript>Before <span hidden>excluded</span> after</noscript><noscript>${notice}</noscript></template>`;
		const entries = sanitize(source, mode).sourceTemplateFallbacks?.entries;
		expect(entries).toHaveLength(1);
		expect(entries?.[0].html).toBe(notice);
	});
});

it("does not add source metadata to ordinary parsed documents or plain text", () => {
	const tree = parseHtmlDocument(article, url, { limits });
	trees.push(tree);
	expect(extractDocument(tree).sourceTemplateFallbacks).toBeUndefined();
	expect(
		extractDocument(load(article, modes[0], "text/plain"))
			.sourceTemplateFallbacks,
	).toBeUndefined();
});

it("keeps section and selector metadata explicitly document-scoped", () => {
	const tree = load(article);
	const queries = new DocumentQueries(tree);
	try {
		const selected = queries.querySelector("#next");
		expect(selected).not.toBeNull();
		if (selected === null) throw new Error("Missing synthetic heading");
		for (const result of [
			extractDocument(tree, { section: tree.reference(selected) }),
			extractDocument(tree, { root: tree.reference(selected) }),
		]) {
			expect(result.sourceTemplateFallbacks?.scope).toBe("document-source");
			expect(result.sourceTemplateFallbacks?.entries[0].html).toBe(notice);
		}
	} finally {
		queries.close();
	}
});

it("retains alternate-feed metadata before source template fallbacks", () => {
	const tree = load(
		`<head><link rel="alternate" type="application/rss+xml" href="/feed"></head><body>${article}</body>`,
	);
	const result = extractDocument(tree);
	expect(result.sourceFeeds).toBeDefined();
	expect(result.sourceTemplateFallbacks?.entries[0].html).toBe(notice);
});

it.each(["markdown", "json"] as const)(
	"fits complete optional entries into exact serialized %s output bounds",
	(format) => {
		const tree = load(article.replace(notice, `${notice} café 😀`.repeat(8)));
		const complete = extractDocument(tree, { format, maxBytes: 100_000 });
		const size = encoder.encode(JSON.stringify(complete)).length;
		expect(extractDocument(tree, { format, maxBytes: size })).toEqual(complete);
		for (const maximum of [size - 1, size - 100, size - 300]) {
			const bounded = extractDocument(tree, { format, maxBytes: maximum });
			expect(
				encoder.encode(JSON.stringify(bounded)).length,
			).toBeLessThanOrEqual(maximum);
			expect(bounded.content).toEqual(complete.content);
			if (bounded.sourceTemplateFallbacks) {
				expect(bounded.sourceTemplateFallbacks.truncated).toBe(true);
				expect(bounded.sourceTemplateFallbacks.entries).toEqual([]);
			}
		}
	},
);

it("releases template metadata when the owning document closes", () => {
	const tree = load(article);
	expect(researchSourceTemplateFallbacks(tree)?.entries).toHaveLength(1);
	tree.close();
	expect(researchSourceTemplateFallbacks(tree)).toBeUndefined();
});
