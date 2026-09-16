import { afterEach, expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { type DocumentMode, documentMode } from "./document-mode.js";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { decodeResponseText, type NetworkResponse } from "./network.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const url = "https://reader-mode.fixture.invalid/";
const context: DocumentLoaderContext = {
	tabId: "reader-mode",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 128,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
const trees: DocumentTree[] = [];
const body =
	"<main><p>Before<table><tr><td>Value</td></tr></table><p>After</main>";
const markdown =
	"Before\n\n**Native table begin (selected structure only; associations unspecified)**\n- Row 1\n  - Cell 1: Value\n**Native table end**\n\nAfter\n";
const variants = [
	{ profile: "default", raw: undefined, visibility: undefined },
	{
		profile: "default",
		raw: "separate-omitted-raw-v1",
		visibility: "source-hidden-inline-v1",
	},
	{
		profile: "long-v1",
		raw: "separate-omitted-raw-v1",
		visibility: "source-hidden-inline-v1",
	},
] as const;

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function response(source: string): NetworkResponse {
	const encoded = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body: encoded,
		encodedBytes: encoded.length,
		redirects: [],
		elapsedMs: 0,
	};
}

function retain(tree: DocumentTree) {
	trees.push(tree);
	return tree;
}

function assertMode(tree: DocumentTree, mode: DocumentMode) {
	expect(documentMode(tree)).toBe(mode);
	expect(htmlParseInfo(tree)?.mode).toBe(mode);
	const queries = new DocumentQueries(tree);
	try {
		expect(queries.querySelectorAll("table")).toHaveLength(1);
		expect(queries.querySelectorAll("p table")).toHaveLength(
			mode === "quirks" ? 1 : 0,
		);
	} finally {
		queries.close();
	}
	const extract = () =>
		extractDocument(tree, {
			format: "markdown",
			tableRows: true,
			compactTables: true,
			maxBytes: 256_000,
			maxNodes: 50_000,
			maxDepth: 128,
		});
	if (mode === "quirks")
		expect(extract).toThrowError("Unsupported table extraction structure");
	else expect(extract().content).toBe(markdown);
}

const declarations: readonly [string, DocumentMode][] = [
	["", "quirks"],
	["<!doctype html>", "no-quirks"],
	["<!DOCTYPE hTmL>", "no-quirks"],
	["<!doctypehtml>", "no-quirks"],
	['<!doctype html SYSTEM "about:legacy-compat">', "no-quirks"],
	[
		'<!doctype html PUBLIC "unknown" "https://never.invalid/external.dtd">',
		"no-quirks",
	],
	[
		'<!doctype html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">',
		"limited-quirks",
	],
	[
		'<!doctype html PUBLIC "-//W3C//DTD HTML 4.01 Frameset//EN" "system.dtd">',
		"limited-quirks",
	],
	['<!doctype html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">', "quirks"],
	["<!doctype wrong>", "quirks"],
	["<!doctype>", "quirks"],
	["<!doctype html WHAT>", "quirks"],
	['<!doctype html SYSTEM "bad>', "quirks"],
	[
		'<!doctype html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" broken>',
		"quirks",
	],
];

for (const variant of variants)
	for (const [declaration, mode] of declarations)
		it(`preserves ${mode} for ${declaration || "missing doctype"} in ${JSON.stringify(variant)}`, () => {
			const source = declaration + body;
			const native = retain(
				parseHtmlDocument(source, url, { limits: context.limits }),
			);
			const reader = retain(
				loadResearchDocument(
					response(source),
					context,
					variant.profile,
					variant.raw,
					variant.visibility,
				),
			);
			assertMode(native, mode);
			assertMode(reader, mode);
			const doctype = (tree: DocumentTree) =>
				tree
					.get(tree.root)
					.children.map((id) => tree.get(id))
					.filter((node) => node.kind === "doctype")
					.map((node) => node.doctype);
			expect(doctype(reader)).toEqual(doctype(native));
			expect(sanitizeResearchHtml(source).html).toBe(source);
			expect(researchReaderInfo(reader)?.scripting).toBe(false);
		});

for (const prefix of [
	"",
	" ",
	"\t\n\f",
	"\r\n",
	"<!-- lead -->",
	"<!-- lead --> \n",
	"\ufeff",
	"\ufeff<!-- lead --> \n",
	"&#9;",
	"&#32;",
])
	it(`recognizes an effective declaration after ${JSON.stringify(prefix)}`, () => {
		const source = `${prefix}<!doctype html>${body}`;
		const native = retain(
			parseHtmlDocument(source, url, { limits: context.limits }),
		);
		const reader = retain(loadResearchDocument(response(source), context));
		assertMode(native, "no-quirks");
		assertMode(reader, "no-quirks");
		expect(sanitizeResearchHtml(source).html).toContain("<!doctype html>");
	});

for (const variant of variants)
	for (const prefix of [
		"<script>unused</script>",
		"<style>unused</style>",
		'<link rel="stylesheet" href="/never.css">',
		'<meta name="ignored" content="unused">',
		"<span></span>",
		"<div hidden>ignored</div>",
		'<div style="display:none">ignored</div>',
		"</div>",
		"<template><!doctype html></template>",
		"<script><!doctype html></script>",
		"<style><!doctype html></style>",
	])
		it(`does not promote a declaration after omitted or significant ${prefix} in ${JSON.stringify(variant)}`, () => {
			const source = `${prefix}<!doctype html>${body}`;
			const sanitized = sanitizeResearchHtml(
				source,
				{},
				undefined,
				variant.profile,
				variant.raw,
				variant.visibility,
			);
			expect(sanitized.html).not.toContain("<!doctype");
			const native = retain(
				parseHtmlDocument(source, url, { limits: context.limits }),
			);
			const reader = retain(
				loadResearchDocument(
					response(source),
					context,
					variant.profile,
					variant.raw,
					variant.visibility,
				),
			);
			expect(documentMode(native)).toBe("quirks");
			expect(documentMode(reader)).toBe("quirks");
			const queries = new DocumentQueries(reader);
			try {
				expect(queries.querySelectorAll("p table")).toHaveLength(1);
			} finally {
				queries.close();
			}
		});

for (const prefix of [
	"&#xfeff;",
	"<!-- lead -->\ufeff",
	"\u00a0",
	"&#160;",
	"\u2003",
	"\v",
	"x",
	"\0",
])
	it(`does not treat ${JSON.stringify(prefix)} as initial HTML whitespace`, () => {
		const source = `${prefix}<!doctype html>${body}`;
		const native = retain(
			parseHtmlDocument(source, url, { limits: context.limits }),
		);
		const reader = retain(loadResearchDocument(response(source), context));
		expect(documentMode(native)).toBe("quirks");
		expect(documentMode(reader)).toBe("quirks");
		expect(sanitizeResearchHtml(source).html).not.toContain("<!doctype");
	});

for (const [first, mode] of declarations.filter(([declaration]) => declaration))
	it(`does not replace the effective ${first} with a later HTML5 declaration`, () => {
		const source = `${first}<!doctype html>${body}`;
		expect(sanitizeResearchHtml(source).html).toBe(first + body);
		assertMode(retain(loadResearchDocument(response(source), context)), mode);
	});

it.each([1, 2, 3])(
	"distinguishes raw string BOM handling from response decoding for %i BOMs",
	async (count) => {
		const source = `${"\ufeff".repeat(count)}<!doctype html>${body}`;
		const direct = sanitizeResearchHtml(source);
		expect(direct.html.includes("<!doctype html>")).toBe(count === 1);
		expect(
			documentMode(
				retain(parseHtmlDocument(source, url, { limits: context.limits })),
			),
		).toBe(count === 1 ? "no-quirks" : "quirks");
		expect(decodeResponseText(response(source), "utf-8").text).toBe(
			source.slice(1),
		);
		const native = retain(await loadBrowserDocument(response(source), context));
		const reader = retain(loadResearchDocument(response(source), context));
		assertMode(native, count <= 2 ? "no-quirks" : "quirks");
		assertMode(reader, count <= 2 ? "no-quirks" : "quirks");
	},
);

for (const declaration of [
	"<!doctype",
	"<!doctype html",
	'<!doctype html SYSTEM "unfinished',
])
	it(`preserves force-quirks at EOF in ${declaration}`, () => {
		const sanitized = sanitizeResearchHtml(declaration);
		expect(sanitized.html).toBe(declaration);
		expect(sanitized.report.omittedTokens).toBe(0);
		const reader = retain(loadResearchDocument(response(declaration), context));
		expect(documentMode(reader)).toBe("quirks");
		expect(treeDoctypes(reader)).toHaveLength(1);
	});

function treeDoctypes(tree: DocumentTree) {
	return tree
		.get(tree.root)
		.children.map((id) => tree.get(id))
		.filter((node) => node.kind === "doctype");
}

function failure(action: () => unknown) {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected a reader limit failure");
}

it("charges the retained declaration to output and tokens, not omitted text", () => {
	const source = "<!doctype html><p>x</p>";
	const result = sanitizeResearchHtml(source, {
		maxSourceCodeUnits: source.length,
		maxOutputCodeUnits: source.length,
		maxTextCodeUnits: 1,
		maxTokens: 4,
	});
	expect(result.html).toBe(source);
	expect(result.report).toMatchObject({
		sourceCodeUnits: source.length,
		outputCodeUnits: source.length,
		textCodeUnits: 1,
		tokens: 4,
		omittedTokens: 0,
	});
	for (const [options, kind, limit] of [
		[
			{ maxOutputCodeUnits: source.length - 1 },
			"reader.output",
			source.length - 1,
		],
		[
			{ maxSourceCodeUnits: source.length - 1 },
			"reader.source",
			source.length - 1,
		],
		[{ maxTokens: 3 }, "reader.tokens", 3],
	] as const) {
		const error = failure(() => sanitizeResearchHtml(source, options));
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind,
			limit,
			observed: limit + 1,
		});
	}
});

it("preserves exact CR-normalized declaration bytes and distinguishes omitted declarations", () => {
	const source =
		'<!-- lead --><!DOCTYPE\r\nHTML PUBLIC "public\r\nlabel" "system"><!doctype wrong><p>x</p>';
	const expected = '<!DOCTYPE\nHTML PUBLIC "public\nlabel" "system"><p>x</p>';
	const result = sanitizeResearchHtml(source);
	expect(result.html).toBe(expected);
	expect(result.report.sourceCodeUnits).toBe(source.length);
	expect(result.report.outputCodeUnits).toBe(expected.length);
	expect(result.report.omittedTokens).toBe(2);
	const reader = retain(loadResearchDocument(response(source), context));
	expect(treeDoctypes(reader)[0].doctype).toEqual({
		name: "html",
		publicId: "public\nlabel",
		systemId: "system",
	});
});

it("charges the additional native doctype node without relaxing document limits", () => {
	const source = "<!doctype html><p>x</p>";
	const bounded = { ...context, limits: { ...context.limits, maxNodes: 7 } };
	const reader = retain(loadResearchDocument(response(source), bounded));
	expect([...reader.walk()]).toHaveLength(7);
	expect(treeDoctypes(reader)[0].doctype).toEqual({
		name: "html",
		publicId: "",
		systemId: "",
	});
	const tooSmall = { ...bounded, limits: { ...bounded.limits, maxNodes: 6 } };
	expect(
		failure(() => loadResearchDocument(response(source), tooSmall)),
	).toMatchObject({ code: "resource-limit" });
	expect([
		...retain(loadResearchDocument(response("<p>x</p>"), tooSmall)).walk(),
	]).toHaveLength(6);
});

it("keeps pre-aborted readers closed before retaining any declaration", () => {
	const controller = new AbortController();
	controller.abort();
	expect(
		failure(() =>
			sanitizeResearchHtml("<!doctype html>", {}, controller.signal),
		),
	).toMatchObject({ code: "aborted" });
});
