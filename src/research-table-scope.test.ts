import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import type { NetworkResponse } from "./network.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const url = "https://table-scope.fixture.invalid/";
const context = {
	tabId: "table-scope",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 128,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function response(source: string): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	};
}

it.each(["p", "div", "span", "b", "code"])(
	"accounts for implicit cell and row closure across %s descendants",
	(descendant) => {
		const row = `<tr><td><${descendant}>left<td><${descendant}>right`;
		const source = `<table><tbody>${row.repeat(140)}</tbody></table>`;
		const native = parseHtmlDocument(source, url, { limits: context.limits });
		trees.push(native);
		const nativeQueries = new DocumentQueries(native);
		expect(nativeQueries.querySelectorAll("table > tbody > tr")).toHaveLength(
			140,
		);
		expect(nativeQueries.querySelectorAll("tr > td")).toHaveLength(280);
		expect(
			Math.max(...Array.from(native.walk(), ({ depth }) => depth)),
		).toBeLessThanOrEqual(8);
		const sanitized = sanitizeResearchHtml(source, { maxDepth: 5 });
		expect(sanitized.html).toBe(source);
		const reader = loadResearchDocument(response(source), context);
		trees.push(reader);
		const queries = new DocumentQueries(reader);
		expect(queries.querySelectorAll("table > tbody > tr")).toHaveLength(140);
		expect(queries.querySelectorAll("tr > td")).toHaveLength(280);
		expect(queries.querySelector("td td, tr tr")).toBeNull();
		expect(reader.textContent(reader.root)).toBe(
			native.textContent(native.root),
		);
	},
);

function expectLimit(action: () => unknown, kind: string, limit: number) {
	let failure: unknown;
	try {
		action();
	} catch (error) {
		failure = error;
	}
	expect(failure).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(failure)).toMatchObject({ kind, limit });
	expect(resourceLimitDiagnostic(failure)?.observed).toBeGreaterThan(limit);
}

function exactDepth(source: string, maxDepth: number) {
	expect(sanitizeResearchHtml(source, { maxDepth }).html).toBe(source);
	expectLimit(
		() => sanitizeResearchHtml(source, { maxDepth: maxDepth - 1 }),
		"reader.depth",
		maxDepth - 1,
	);
}

function compareTables(source: string) {
	const native = parseHtmlDocument(source, url, { limits: context.limits });
	trees.push(native);
	const reader = loadResearchDocument(response(source), context);
	trees.push(reader);
	expect(serializeHtml(reader, reader.root)).toBe(
		serializeHtml(native, native.root),
	);
	expect(reader.textContent(reader.root)).toBe(native.textContent(native.root));
	return [native, reader].map((tree) => new DocumentQueries(tree));
}

it.each([
	["th", "td"],
	["td", "th"],
	["th", "th"],
	["td", "td"],
])("closes %s descendants before a sibling %s", (first, second) => {
	const source = `<table><tbody><tr><${first}><div><span>first<${second}><p><b>second</table>`;
	exactDepth(source, 6);
	for (const queries of compareTables(source)) {
		expect(queries.querySelectorAll("table > tbody > tr")).toHaveLength(1);
		expect(queries.querySelectorAll(`tr > ${first} > div > span`)).toHaveLength(
			1,
		);
		expect(queries.querySelectorAll(`tr > ${second} > p > b`)).toHaveLength(1);
		expect(queries.querySelectorAll("tr > th, tr > td")).toHaveLength(2);
		expect(queries.querySelector("td td, td th, th td, th th")).toBeNull();
	}
});

it.each(["th", "td"])(
	"closes a row across %s descendants with an implicit tbody",
	(cell) => {
		const source = `<table>${`<tr><${cell}><div><code>value`.repeat(140)}</table>`;
		exactDepth(source, 5);
		for (const queries of compareTables(source)) {
			expect(queries.querySelectorAll("table > tbody")).toHaveLength(1);
			expect(queries.querySelectorAll("tbody > tr")).toHaveLength(140);
			expect(
				queries.querySelectorAll(`tr > ${cell} > div > code`),
			).toHaveLength(140);
			expect(queries.querySelector("tr tr")).toBeNull();
		}
	},
);

it.each([
	["thead", "tbody"],
	["tbody", "tbody"],
	["tbody", "tfoot"],
	["tfoot", "thead"],
])("closes %s descendants before a %s section", (first, second) => {
	const source = `<table><${first}><tr><th><div><span>first<${second}><tr><td><p><code>second</table>`;
	exactDepth(source, 6);
	for (const queries of compareTables(source)) {
		expect(
			queries.querySelectorAll("table > thead, table > tbody, table > tfoot"),
		).toHaveLength(2);
		expect(
			queries.querySelectorAll(`table > ${first} > tr > th > div > span`),
		).toHaveLength(1);
		expect(
			queries.querySelectorAll(`table > ${second} > tr > td > p > code`),
		).toHaveLength(1);
		expect(queries.querySelector("tr tr, td td, th td")).toBeNull();
	}
});

it("keeps outer cells and rows intact while closing inner table descendants", () => {
	const inner = `<table>${"<tr><th><span>inner<td><b>value".repeat(140)}</table>`;
	const source = `<table><tbody><tr><td><div>${inner}<p>after<td><code>sibling<tr><td><span>last</table>`;
	exactDepth(source, 9);
	for (const queries of compareTables(source)) {
		expect(queries.querySelectorAll("table")).toHaveLength(2);
		expect(queries.querySelectorAll("body > table > tbody > tr")).toHaveLength(
			2,
		);
		expect(
			queries.querySelectorAll("body > table > tbody > tr > td"),
		).toHaveLength(3);
		expect(
			queries.querySelectorAll("td > div > table > tbody > tr"),
		).toHaveLength(140);
		expect(queries.querySelectorAll("td > div > p")).toHaveLength(1);
		expect(queries.querySelectorAll("td > code")).toHaveLength(1);
		expect(queries.querySelectorAll("td > span")).toHaveLength(1);
	}
});

it.each([
	"<table><tbody><tr><th><div><span>first</span></div></th><td><p>second</p></td></tr></tbody></table>",
	"<table><tbody><tr><th><div><span>first</th><td><p>second</tr></tbody></table>",
	"<table><tbody><tr><th><div><span>first<td><p>second</tbody></table>",
])("preserves explicit cell, row and section ends: %s", (table) => {
	const source = `${table}<p>outside</p>${table}`;
	exactDepth(source, 6);
	for (const queries of compareTables(source)) {
		expect(queries.querySelectorAll("body > table")).toHaveLength(2);
		expect(queries.querySelectorAll("body > p")).toHaveLength(1);
		expect(queries.querySelectorAll("tr > th > div > span")).toHaveLength(2);
		expect(queries.querySelectorAll("tr > td > p")).toHaveLength(2);
	}
});

it.each([
	["article", "tr", "td", "span"],
	["table", "div", "tbody", "tr", "td", "span"],
	["table", "tbody", "div", "tr", "td", "span"],
	["table", "tbody", "tr", "div", "td", "span"],
	["table", "tbody", "tr", "td", "caption", "span"],
	["table", "tbody", "tr", "td", "colgroup", "span"],
	["table", "tbody", "tr", "td", "table", "span"],
	["table", "tr", "td", "table", "div", "tr", "td", "span"],
])("does not cross a broken or bounded chain starting with %s", (...tags) => {
	for (const next of ["td", "th", "tr", "thead", "tbody", "tfoot"]) {
		const prefix = tags.map((tag) => `<${tag}>`).join("");
		exactDepth(`${prefix}first<${next}>second`, tags.length + 1);
	}
});

it.each([
	`<table><tbody><tr><td>${"<div>".repeat(125)}deep`,
	`${"<table><tr><td><div>".repeat(32)}<span>deep`,
])(
	"rejects genuinely nested descendants before any implicit closure: %s",
	(deep) => {
		const source = `${deep}<td>later</table>`;
		expectLimit(() => sanitizeResearchHtml(source), "reader.depth", 128);
		expectLimit(
			() => loadResearchDocument(response(source), context),
			"reader.depth",
			128,
		);
	},
);

it("retains the independent native depth guard for implicit document wrappers", () => {
	const source = "<table><tr><td><span>first<td><b>second</table>";
	exactDepth(source, 4);
	const limits = { ...context.limits, maxDepth: 4 };
	expectLimit(
		() => parseHtmlDocument(source, url, { limits }),
		"document.depth",
		4,
	);
	expectLimit(
		() => loadResearchDocument(response(source), { ...context, limits }),
		"document.depth",
		4,
	);
	for (const queries of compareTables(source))
		expect(
			queries.querySelectorAll("html > body > table > tbody > tr > td"),
		).toHaveLength(2);
});

it.each([
	["maxSourceCodeUnits", "sourceCodeUnits", "reader.source"],
	["maxTextCodeUnits", "textCodeUnits", "reader.text"],
	["maxOutputCodeUnits", "outputCodeUnits", "reader.output"],
	["maxTokens", "tokens", "reader.tokens"],
] as const)(
	"keeps the exact %s cap after descendant closures",
	(limit, measurement, kind) => {
		const source = `<table><tbody>${"<tr><th><span>A<td><code>B".repeat(140)}</tbody></table>`;
		const result = sanitizeResearchHtml(source, { maxDepth: 5 });
		expect(result.html).toBe(source);
		expect(result.report).toMatchObject({
			sourceCodeUnits: source.length,
			outputCodeUnits: source.length,
			textCodeUnits: 280,
			tokens: 984,
		});
		const maximum = result.report[measurement];
		expect(
			sanitizeResearchHtml(source, { maxDepth: 5, [limit]: maximum }),
		).toEqual(result);
		expectLimit(
			() => sanitizeResearchHtml(source, { maxDepth: 5, [limit]: maximum - 1 }),
			kind,
			maximum - 1,
		);
	},
);

it.each([
	"<svg><table><tr><td><span>hidden<td>still hidden</table></svg>",
	"<template><table><tr><td><div>hidden<tr>still hidden</table></template>",
	"<svg><g></svg>",
	"<template><div></template>",
	"<script>unterminated<td><span>not a cell",
	"<template><table><tr><td><span>unclosed",
])(
	"still rejects malformed omitted content after a shallow table: %s",
	(omitted) => {
		const source = `<table>${"<tr><td><span>value".repeat(140)}</table>${omitted}`;
		for (const rawPolicy of [undefined, "separate-omitted-raw-v1"] as const) {
			expect(() =>
				sanitizeResearchHtml(source, {}, undefined, undefined, rawPolicy),
			).toThrow(expect.objectContaining({ code: "unsupported" }));
			expect(() =>
				loadResearchDocument(response(source), context, undefined, rawPolicy),
			).toThrow(expect.objectContaining({ code: "unsupported" }));
		}
	},
);

it("still charges deep omitted descendants independently of table closure", () => {
	const table = `<table>${"<tr><td><span>value".repeat(140)}</table>`;
	const source = `${table}<template>${"<div>".repeat(4)}hidden${"</div>".repeat(4)}</template>`;
	expectLimit(
		() => sanitizeResearchHtml(source, { maxDepth: 4 }),
		"reader.depth",
		4,
	);
});

it.each([
	[undefined, undefined],
	["default", undefined],
	["long-v1", undefined],
	[undefined, "separate-omitted-raw-v1"],
	["default", "separate-omitted-raw-v1"],
	["long-v1", "separate-omitted-raw-v1"],
] as const)(
	"keeps descendant closure and omission accounting for profile %s / raw policy %s",
	(profile, rawPolicy) => {
		const expected = `<table><tr>${"<td><span>left<th><b>right".repeat(140)}</table>`;
		const source = expected.replace(
			"left",
			"left<svg/><template>hidden</template><script>discard()</script>",
		);
		const sanitized = sanitizeResearchHtml(
			source,
			{ maxDepth: 4 },
			undefined,
			profile,
			rawPolicy,
		);
		expect(sanitized.html).toBe(expected);
		expect(sanitized.report).toMatchObject({
			textCodeUnits: rawPolicy ? 1266 : 1275,
			omittedSubtrees: { svg: 1, template: 1, script: 1 },
		});
		expect(sanitized.report.rawTextPolicy).toBe(rawPolicy);
		if (rawPolicy)
			expect(sanitized.report.omittedRaw).toMatchObject({
				codeUnits: 9,
				elements: 1,
			});
		else expect(sanitized.report.omittedRaw).toBeUndefined();
		expectLimit(
			() =>
				sanitizeResearchHtml(
					source,
					{ maxDepth: 3 },
					undefined,
					profile,
					rawPolicy,
				),
			"reader.depth",
			3,
		);
		const native = parseHtmlDocument(expected, url, { limits: context.limits });
		trees.push(native);
		const reader = loadResearchDocument(
			response(source),
			context,
			profile,
			rawPolicy,
		);
		trees.push(reader);
		expect(serializeHtml(reader, reader.root)).toBe(
			serializeHtml(native, native.root),
		);
		expect(researchReaderInfo(reader)).toEqual({
			...sanitized.report,
			encoding: "utf-8",
		});
		const queries = new DocumentQueries(reader);
		expect(
			queries.querySelectorAll("table > tbody > tr > td > span"),
		).toHaveLength(140);
		expect(
			queries.querySelectorAll("table > tbody > tr > th > b"),
		).toHaveLength(140);
		expect(queries.querySelector("svg, template, script")).toBeNull();
		expect(reader.textContent(reader.root)).toBe("leftright".repeat(140));
	},
);
