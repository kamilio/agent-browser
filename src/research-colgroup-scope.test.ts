import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import type { NetworkResponse } from "./network.js";
import {
	loadResearchDocument,
	researchReaderLimits,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const url = "https://colgroup-scope.fixture.invalid/";
const context = {
	tabId: "colgroup-scope",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: researchReaderLimits.maxDepth,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
const rowCount = researchReaderLimits.maxDepth + 12;

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

function native(source: string, maxDepth: number = context.limits.maxDepth) {
	const tree = parseHtmlDocument(source, url, {
		limits: { ...context.limits, maxDepth },
	});
	trees.push(tree);
	return tree;
}

function load(source: string, maxDepth: number = context.limits.maxDepth) {
	const tree = loadResearchDocument(response(source), {
		...context,
		limits: { ...context.limits, maxDepth },
	});
	trees.push(tree);
	return tree;
}

function expectDepthLimit(
	action: () => unknown,
	kind: "reader.depth" | "document.depth",
	limit: number,
) {
	let failure: unknown;
	try {
		action();
	} catch (error) {
		failure = error;
	}
	expect(failure).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(failure)).toEqual({
		kind,
		unit: "levels",
		limit,
		observed: limit + 1,
	});
}

function exactDepth(source: string, maxDepth: number, expected = source) {
	const sanitized = sanitizeResearchHtml(source, { maxDepth });
	expect(sanitized.html).toBe(expected);
	expect(sanitized.report.outputCodeUnits).toBe(expected.length);
	expectDepthLimit(
		() => sanitizeResearchHtml(source, { maxDepth: maxDepth - 1 }),
		"reader.depth",
		maxDepth - 1,
	);
	return sanitized;
}

function compare(source: string, maxDepth: number, expected = source) {
	const original = native(expected);
	exactDepth(source, maxDepth, expected);
	const reader = load(source);
	expect(serializeHtml(reader, reader.root)).toBe(
		serializeHtml(original, original.root),
	);
	expect(reader.textContent(reader.root)).toBe(
		original.textContent(original.root),
	);
	return [original, reader];
}

it.each([
	{
		next: "thead",
		tail: "<thead><tr><td><span>value</table>",
		path: ["table", "thead", "tr", "td", "span"],
	},
	{
		next: "tbody",
		tail: "<tbody><tr><td><span>value</table>",
		path: ["table", "tbody", "tr", "td", "span"],
	},
	{
		next: "tfoot",
		tail: "<tfoot><tr><td><span>value</table>",
		path: ["table", "tfoot", "tr", "td", "span"],
	},
	{
		next: "tr",
		tail: "<tr><td><span>value</table>",
		path: ["table", "tr", "td", "span"],
	},
	{
		next: "caption",
		tail: "<caption><span>caption</span></caption><tbody><tr><td><span>value</table>",
		path: ["table", "tbody", "tr", "td", "span"],
	},
	{
		next: "colgroup",
		tail: "<colgroup><col><tbody><tr><td><span>value</table>",
		path: ["table", "tbody", "tr", "td", "span"],
	},
])("matches an explicit colgroup end before $next", ({ next, tail, path }) => {
	const source = `<table><colgroup><col>${tail}`;
	const explicit = source.replaceAll(
		"<colgroup><col>",
		"<colgroup><col></colgroup>",
	);
	const reference = native(explicit);
	for (const tree of [...compare(source, path.length), load(explicit)]) {
		const queries = new DocumentQueries(tree);
		expect(serializeHtml(tree, tree.root)).toBe(
			serializeHtml(reference, reference.root),
		);
		expect(queries.querySelectorAll("table > colgroup")).toHaveLength(
			next === "colgroup" ? 2 : 1,
		);
		expect(queries.querySelectorAll("tr > td > span")).toHaveLength(1);
		expect(queries.querySelector("colgroup tbody, colgroup tr")).toBeNull();
		if (next === "caption")
			expect(queries.querySelectorAll("table > caption > span")).toHaveLength(
				1,
			);
	}
});

it.each(["thead", "tbody", "tfoot", ""])(
	"keeps long rows flat after an omitted colgroup end with section '%s'",
	(section) => {
		const row = "<tr><th><span>left<td><span>right";
		const sectionStart = section ? `<${section}>` : "";
		const source = `<table><colgroup><col>${sectionStart}${row.repeat(rowCount)}</table>`;
		const path = ["table", ...(section ? [section] : []), "tr", "td", "span"];
		for (const tree of compare(source, path.length)) {
			const queries = new DocumentQueries(tree);
			expect(
				queries.querySelectorAll(`table > ${section || "tbody"} > tr`),
			).toHaveLength(rowCount);
			expect(queries.querySelectorAll("tr > th, tr > td")).toHaveLength(
				rowCount * 2,
			);
			expect(queries.querySelector("tr tr, th td, td th")).toBeNull();
			expect(tree.textContent(tree.root)).toBe("leftright".repeat(rowCount));
		}
	},
);

it("keeps repeated omitted section ends flat after a column group", () => {
	const sections = ["thead", "tbody", "tfoot"];
	const rows = Array.from(
		{ length: rowCount },
		(_, index) => `<${sections[index % sections.length]}><tr><td><span>value`,
	).join("");
	const source = `<table><colgroup><col>${rows}</table>`;
	const path = ["table", "tbody", "tr", "td", "span"];
	for (const tree of compare(source, path.length)) {
		const queries = new DocumentQueries(tree);
		expect(
			queries.querySelectorAll("table > thead, table > tbody, table > tfoot"),
		).toHaveLength(rowCount);
		expect(queries.querySelectorAll("tr > td > span")).toHaveLength(rowCount);
		expect(queries.querySelector("tr tr, td td, colgroup tbody")).toBeNull();
	}
});

it("keeps repeated omitted colgroup ends as sibling groups", () => {
	const source = `<table>${"<colgroup><col>".repeat(rowCount)}<tbody><tr><td><span>value</table>`;
	const path = ["table", "tbody", "tr", "td", "span"];
	for (const tree of compare(source, path.length)) {
		const queries = new DocumentQueries(tree);
		expect(queries.querySelectorAll("table > colgroup > col")).toHaveLength(
			rowCount,
		);
		expect(queries.querySelector("colgroup colgroup")).toBeNull();
	}
});

it.each(["<!-- between columns -->", "<!-- <tbody><tr>not markup -->"])(
	"preserves column-group whitespace while omitting comment %s",
	(comment) => {
		const tail = "<tbody><tr><td><span>value</table>";
		const source = `<table><colgroup> \n<col/>\t${comment}\n<col /> ${tail}`;
		const expected = `<table><colgroup> \n<col>\t\n<col> ${tail}`;
		const path = ["table", "tbody", "tr", "td", "span"];
		const original = native(source);
		for (const tree of compare(source, path.length, expected)) {
			const queries = new DocumentQueries(tree);
			expect(queries.querySelectorAll("table > colgroup > col")).toHaveLength(
				2,
			);
			expect(tree.textContent(tree.root)).toBe(
				original.textContent(original.root),
			);
		}
		expect(sanitizeResearchHtml(source).report.omittedTokens).toBe(1);
	},
);

it("does not charge repeated void columns as open ancestors", () => {
	const source = `<table><colgroup>${"<col>".repeat(rowCount)}</table>`;
	const path = ["table", "colgroup"];
	for (const tree of compare(source, path.length))
		expect(
			new DocumentQueries(tree).querySelectorAll("table > colgroup > col"),
		).toHaveLength(rowCount);
});

it("matches fully explicit column, cell, row and section ends", () => {
	const omitted = `<table><colgroup><col><tbody>${"<tr><td><span>value".repeat(rowCount)}</table>`;
	const explicit = `<table><colgroup><col></colgroup><tbody>${"<tr><td><span>value</span></td></tr>".repeat(rowCount)}</tbody></table>`;
	const path = ["table", "tbody", "tr", "td", "span"];
	const reference = native(explicit);
	for (const tree of [
		...compare(omitted, path.length),
		...compare(explicit, path.length),
	])
		expect(serializeHtml(tree, tree.root)).toBe(
			serializeHtml(reference, reference.root),
		);
});

it.each(["<tbody>", ""])(
	"preserves outer cells around an inner column group with outer section '%s'",
	(sectionStart) => {
		const inner = `<table><colgroup><col><tbody>${"<tr><td><span>inner".repeat(rowCount)}</table>`;
		const source = `<table><colgroup><col>${sectionStart}<tr><td><div>${inner}<p>after inner</p></div><td><span>sibling<tr><td><span>next row</table>`;
		const path = [
			"table",
			...(sectionStart ? ["tbody"] : []),
			"tr",
			"td",
			"div",
			"table",
			"tbody",
			"tr",
			"td",
			"span",
		];
		for (const tree of compare(source, path.length)) {
			const queries = new DocumentQueries(tree);
			expect(queries.querySelectorAll("table")).toHaveLength(2);
			expect(queries.querySelectorAll("table > colgroup > col")).toHaveLength(
				2,
			);
			expect(
				queries.querySelectorAll("body > table > tbody > tr"),
			).toHaveLength(2);
			expect(
				queries.querySelectorAll("body > table > tbody > tr > td"),
			).toHaveLength(3);
			expect(
				queries.querySelectorAll("td > div > table > tbody > tr"),
			).toHaveLength(rowCount);
			expect(queries.querySelectorAll("td > div > p")).toHaveLength(1);
			expect(tree.textContent(tree.root)).toBe(
				`${"inner".repeat(rowCount)}after innersiblingnext row`,
			);
		}
	},
);

it("enforces real descendant depth before a later cell could close it", () => {
	const path = ["table", "tbody", "tr", "td", "div", "div", "div", "span"];
	const source =
		"<table><colgroup><col><tbody><tr><td><div><div><div><span>deep<td>later</table>";
	for (const tree of compare(source, path.length))
		expect(new DocumentQueries(tree).querySelectorAll("tr > td")).toHaveLength(
			2,
		);
	expectDepthLimit(
		() => load(source, path.length - 1),
		"reader.depth",
		path.length - 1,
	);
});

it("retains the independent native depth boundary including implicit wrappers", () => {
	const source = "<table><colgroup><col><tr><td><span>value</table>";
	const path = ["table", "tr", "td", "span"];
	exactDepth(source, path.length);
	const original = native(source);
	const documentDepth = Math.max(
		...Array.from(original.walk(), ({ depth }) => depth),
	);
	expect(documentDepth).toBeGreaterThan(path.length);
	expect(serializeHtml(load(source, documentDepth))).toBe(
		serializeHtml(original),
	);
	expectDepthLimit(
		() => native(source, documentDepth - 1),
		"document.depth",
		documentDepth - 1,
	);
	expectDepthLimit(
		() => load(source, documentDepth - 1),
		"document.depth",
		documentDepth - 1,
	);
});

it.each([
	["article", "colgroup"],
	["table", "div", "colgroup"],
	["table", "tbody", "tr", "td", "colgroup", "span"],
])(
	"does not flatten an unrelated or broken column-group chain: %j",
	(first, ...rest) => {
		const path = [first, ...rest, "tbody"];
		const source = `${path.map((tag) => `<${tag}>`).join("")}value`;
		exactDepth(source, path.length);
	},
);

it.each(["ordinary descendants", "nested tables"])(
	"still rejects genuinely deep %s",
	(kind) => {
		const limit = researchReaderLimits.maxDepth;
		const shallow = "<table><colgroup><col><tbody><tr><td>value</table>";
		const source =
			kind === "ordinary descendants"
				? `${shallow}${"<div>".repeat(limit + 1)}deep`
				: `${"<table><colgroup><col><tr><td>".repeat(Math.floor(limit / 3) + 1)}deep`;
		expectDepthLimit(() => sanitizeResearchHtml(source), "reader.depth", limit);
		expectDepthLimit(() => load(source), "reader.depth", limit);
	},
);

it.each([
	"<template><div></template>",
	"<script>unterminated",
	'<table><colgroup><col title="unterminated>',
])(
	"does not relax malformed input rejection after a column group: %s",
	(suffix) => {
		const source = `<table><colgroup><col><tbody>${"<tr><td>value".repeat(rowCount)}</table>${suffix}`;
		expect(() => sanitizeResearchHtml(source)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => load(source)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);
