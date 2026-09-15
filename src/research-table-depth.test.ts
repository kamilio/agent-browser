import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	researchReaderLimits,
	researchReaderProfile,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const url = "https://research.example/tables";
const trees: DocumentTree[] = [];
const groups = ["tbody", "thead", "tfoot"];
const cells = ["td", "th"];
const formatting = [
	"a",
	"b",
	"big",
	"code",
	"em",
	"font",
	"i",
	"nobr",
	"s",
	"small",
	"strike",
	"strong",
	"tt",
	"u",
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function load(source: string, maxDepth = 128) {
	const body = new TextEncoder().encode(source);
	const tree = loadResearchDocument(
		{
			url,
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 1,
		},
		{
			tabId: "synthetic-tables",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50_000,
				maxDepth,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
		},
	);
	trees.push(tree);
	return tree;
}

function exactSourceDepth(source: string, maxDepth: number, expected = source) {
	const result = sanitizeResearchHtml(source, { maxDepth });
	expect(result.html).toBe(expected);
	expect(result.report.outputCodeUnits).toBe(expected.length);
	let failure: unknown;
	try {
		sanitizeResearchHtml(source, { maxDepth: maxDepth - 1 });
	} catch (error) {
		failure = error;
	}
	expect(failure).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(failure)).toEqual({
		kind: "reader.depth",
		unit: "levels",
		limit: maxDepth - 1,
		observed: maxDepth,
	});
	return result;
}

function expectImpliedTableEndRecovery(tag: string) {
	for (const next of [...cells, "tr", ...groups]) {
		const source = `<table><tbody><tr><td><${tag}>first<${next}>second`;
		const unwrapped = [
			"big",
			"font",
			"nobr",
			"strike",
			"tt",
			"unknown",
		].includes(tag);
		const expected = unwrapped
			? source.replace(`<${tag}>`, "")
			: tag === "form"
				? source.replace("<form>", "<div>")
				: source;
		const result = exactSourceDepth(source, 5, expected);
		expect(result.report).toMatchObject({
			sourceCodeUnits: source.length,
			textCodeUnits: 11,
			tokens: 8,
			omittedTokens: 0,
			ignoredAttributes: 0,
			unwrappedElements: Number(unwrapped),
			tokenizerIssues: 0,
		});
		const tree = load(source);
		const native = parseHtmlDocument(expected, url);
		trees.push(native);
		expect(serializeHtml(tree, tree.root)).toBe(
			serializeHtml(native, native.root),
		);
		expect(tree.textContent(tree.root)).toBe(
			cells.includes(next) ? "firstsecond" : "secondfirst",
		);
		const queries = new DocumentQueries(tree);
		expect(queries.querySelectorAll("table")).toHaveLength(1);
		expect(queries.querySelectorAll("tr > td, tr > th")).toHaveLength(
			cells.includes(next) ? 2 : 1,
		);
		expect(
			queries.querySelectorAll("table > tbody, table > thead, table > tfoot"),
		).toHaveLength(groups.includes(next) ? 2 : 1);
		expect(
			queries.querySelectorAll("tbody > tr, thead > tr, tfoot > tr"),
		).toHaveLength(next === "tr" ? 2 : 1);
		expect(
			queries.querySelector("td td, td th, th td, th th, tr tr"),
		).toBeNull();
	}
}

function expectNativeStructure(
	source: string,
	rowCount: number,
	cellCount: number,
) {
	const tree = load(source);
	const original = parseHtmlDocument(source, url);
	trees.push(original);
	expect(serializeHtml(tree, tree.root)).toBe(
		serializeHtml(original, original.root),
	);
	const queries = new DocumentQueries(tree);
	expect(queries.querySelectorAll("table")).toHaveLength(1);
	expect(
		queries.querySelectorAll(
			"table > tbody > tr, table > thead > tr, table > tfoot > tr",
		),
	).toHaveLength(rowCount);
	expect(queries.querySelectorAll("tr > td, tr > th")).toHaveLength(cellCount);
	expect(queries.querySelector("td td, td th, th td, th th, tr tr")).toBeNull();
	if (cellCount) {
		const content = extractDocument(tree).content;
		expect(typeof content).toBe("string");
		if (typeof content !== "string")
			throw new Error("Expected Markdown extraction");
		expect(content.match(/value/g)).toHaveLength(cellCount);
	}
	return { tree, queries };
}

it.each(
	["", ...groups].flatMap((group) =>
		[false, true].flatMap((row) =>
			cells.flatMap((first) =>
				cells.map((second) => ({ group, row, first, second })),
			),
		),
	),
)(
	"accounts for 140 flat $first/$second cells (group=$group, source row=$row)",
	({ group, row, first, second }) => {
		const entries = Array.from(
			{ length: 140 },
			(_, index) => `<${index % 2 ? second : first}>value`,
		).join("");
		const source = `<table>${group ? `<${group}>` : ""}${row ? "<tr>" : ""}${entries}</table>`;
		const result = exactSourceDepth(
			source,
			2 + Number(Boolean(group)) + Number(row),
		);
		expect(result.report).toMatchObject({
			tokens: 282 + Number(Boolean(group)) + Number(row),
			textCodeUnits: 700,
			omittedTokens: 0,
			ignoredAttributes: 0,
			tokenizerIssues: 0,
		});
		const { tree } = expectNativeStructure(source, 1, 140);
		expect(researchReaderInfo(tree)).toEqual({
			...result.report,
			encoding: "utf-8",
		});
	},
);

it.each(
	["", ...groups].flatMap((group) =>
		["", ...cells].map((cell) => ({ group, cell })),
	),
)(
	"accounts for 140 flat rows (group=$group, cell=$cell)",
	({ group, cell }) => {
		const entry = `<tr>${cell ? `<${cell}>value` : ""}`;
		const source = `<table>${group ? `<${group}>` : ""}${entry.repeat(140)}</table>`;
		exactSourceDepth(
			source,
			2 + Number(Boolean(group)) + Number(Boolean(cell)),
		);
		expectNativeStructure(source, 140, cell ? 140 : 0);
	},
);

it.each(
	groups.flatMap((first) =>
		groups.flatMap((second) =>
			[false, true].flatMap((row) =>
				cells.map((cell) => ({ first, second, row, cell })),
			),
		),
	),
)(
	"accounts for 140 $first/$second groups (source row=$row, cell=$cell)",
	({ first, second, row, cell }) => {
		const entries = Array.from(
			{ length: 140 },
			(_, index) =>
				`<${index % 2 ? second : first}>${row ? "<tr>" : ""}<${cell}>value`,
		).join("");
		const source = `<table>${entries}</table>`;
		exactSourceDepth(source, 3 + Number(row));
		const { queries } = expectNativeStructure(source, 140, 140);
		expect(
			queries.querySelectorAll("table > tbody, table > thead, table > tfoot"),
		).toHaveLength(140);
	},
);

it.each(groups)("accounts for 140 empty optional %s groups", (group) => {
	const source = `<table>${`<${group}>`.repeat(140)}</table>`;
	exactSourceDepth(source, 2);
	const { queries } = expectNativeStructure(source, 0, 0);
	expect(queries.querySelectorAll(`table > ${group}`)).toHaveLength(140);
});

it("retains real nested tables and closes only the innermost adjacent cells", () => {
	const source =
		"<table><tr><td>outer<table><tbody><tr><th>inner<th>second</table><td>last</table>";
	exactSourceDepth(source, 7);
	const tree = load(source);
	const queries = new DocumentQueries(tree);
	expect(queries.querySelectorAll("table")).toHaveLength(2);
	expect(
		queries.querySelectorAll("body > table > tbody > tr > td"),
	).toHaveLength(2);
	expect(queries.querySelectorAll("td > table > tbody > tr > th")).toHaveLength(
		2,
	);
	for (const value of ["outer", "inner", "second", "last"])
		expect(extractDocument(tree).content).toContain(value);
	const original = parseHtmlDocument(source, url);
	trees.push(original);
	expect(serializeHtml(tree, tree.root)).toBe(
		serializeHtml(original, original.root),
	);
});

it.each([...cells, "tr", ...groups])(
	"does not forget wrapper depth for outside-table %s tags",
	(tag) => {
		const source = `<div><${tag}>first<${tag}>second</div>`;
		exactSourceDepth(source, 3);
		const excessive = `<div>${`<${tag}>value`.repeat(140)}</div>`;
		expect(() => sanitizeResearchHtml(excessive)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(() => load(excessive)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it.each(formatting)(
	"accounts for implied table ends across open formatting %s without losing descendant depth",
	expectImpliedTableEndRecovery,
);

it.each(["span", "div", "section", "unknown", "form"])(
	"accounts for implied table ends across open nonformatting %s without losing descendant depth",
	expectImpliedTableEndRecovery,
);

it.each(["caption", "colgroup"])(
	"does not cross an open nonformatting %s wrapper",
	(tag) => {
		for (const next of [...cells, "tr", ...groups]) {
			const source = `<table><tbody><tr><td><${tag}>first<${next}>second`;
			expect(
				sanitizeResearchHtml(source, { maxDepth: 6 }).report.sourceCodeUnits,
			).toBe(source.length);
			expect(() => sanitizeResearchHtml(source, { maxDepth: 5 })).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		}
	},
);

it.each([
	"<table><div><tbody><tr><td>first<td>second",
	"<table><tbody><span><tr><td>first<td>second",
	"<table><tbody><tr><div><td>first<td>second",
])("requires a contiguous source-open table suffix: %s", (source) => {
	exactSourceDepth(source, 6);
});

it.each(["caption"])("does not treat %s as a table row/group prefix", (tag) => {
	for (const next of [...cells, "tr", ...groups]) {
		const source = `<table><${tag}><${next}>first<${next}>second`;
		exactSourceDepth(source, 4);
	}
});

it("accounts for implied table ends after a table-level colgroup", () => {
	for (const next of [...cells, "tr", ...groups]) {
		const source = `<table><colgroup><${next}>first<${next}>second`;
		exactSourceDepth(source, 2);
		const tree = load(source);
		const native = parseHtmlDocument(source, url);
		trees.push(native);
		expect(serializeHtml(tree, tree.root)).toBe(
			serializeHtml(native, native.root),
		);
		const queries = new DocumentQueries(tree);
		expect(queries.querySelectorAll("table > colgroup")).toHaveLength(1);
		expect(queries.querySelectorAll(`table ${next}`)).toHaveLength(2);
		expect(queries.querySelector(`colgroup ${next}`)).toBeNull();
		expect(tree.textContent(tree.root)).toBe("firstsecond");
	}
});

it.each(formatting)(
	"allows adjacent cells after explicitly closed %s children",
	(tag) => {
		const source = `<table><tr>${`<td><${tag}>value</${tag}>`.repeat(140)}</table>`;
		const sanitized = sanitizeResearchHtml(source, { maxDepth: 4 });
		expect(() => sanitizeResearchHtml(source, { maxDepth: 3 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const unwrapped = ["big", "font", "nobr", "strike", "tt"].includes(tag);
		const expected = unwrapped
			? `<table><tr>${"<td>value".repeat(140)}</table>`
			: source;
		expect(sanitized.html).toBe(expected);
		const tree = load(source);
		const native = parseHtmlDocument(expected, url);
		trees.push(native);
		expect(serializeHtml(tree, tree.root)).toBe(
			serializeHtml(native, native.root),
		);
		expect(new DocumentQueries(tree).querySelectorAll("tr > td")).toHaveLength(
			140,
		);
		expect(sanitized.report.unwrappedElements).toBe(unwrapped ? 140 : 0);
	},
);

it("preserves existing li/p/dt/dd optional-end accounting within a table cell", () => {
	const source =
		"<table><tr><td><ul><li>one<li>two</ul><p>alpha<p>beta</p><dl><dt>term<dd>definition</dl><td>last</table>";
	exactSourceDepth(source, 5);
	const tree = load(source);
	const queries = new DocumentQueries(tree);
	for (const [selector, count] of [
		["tr > td", 2],
		["ul > li", 2],
		["td > p", 2],
		["dl > dt", 1],
		["dl > dd", 1],
	] as const)
		expect(queries.querySelectorAll(selector)).toHaveLength(count);
	for (const value of [
		"one",
		"two",
		"alpha",
		"beta",
		"term",
		"definition",
		"last",
	])
		expect(extractDocument(tree).content).toContain(value);
});

it.each([
	"<template><table><td>first<td>second</table></template>",
	"<svg><table><tr><td>first<td>second</table></svg>",
	"<math><table><tbody><tr>first<tr>second</table></math>",
	"<svg><g></svg>",
	"<script>unterminated",
	'<table><td title="unterminated>',
	"<template><table>",
])("does not relax malformed/omitted source rejection: %s", (malformed) => {
	const source = `<table>${"<td>value".repeat(140)}</table>${malformed}`;
	expect(() => sanitizeResearchHtml(source)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() => load(source)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([
	{ limit: "maxSourceCodeUnits", measurement: "sourceCodeUnits" },
	{ limit: "maxTextCodeUnits", measurement: "textCodeUnits" },
	{ limit: "maxOutputCodeUnits", measurement: "outputCodeUnits" },
	{ limit: "maxTokens", measurement: "tokens" },
] as const)(
	"preserves the exact $limit boundary for 140 flat rows",
	({ limit, measurement }) => {
		const source = `<table>${"<tr><td>value".repeat(140)}</table>`;
		const result = sanitizeResearchHtml(source);
		const maximum = result.report[measurement];
		expect(sanitizeResearchHtml(source, { [limit]: maximum })).toEqual(result);
		expect(() =>
			sanitizeResearchHtml(source, { [limit]: maximum - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("still charges omitted subtree depth and text budgets", () => {
	const table = `<table>${"<td>value".repeat(140)}</table>`;
	expect(() =>
		sanitizeResearchHtml(
			`${table}<template><div><div><div>hidden</div></div></div></template>`,
			{ maxDepth: 3 },
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		sanitizeResearchHtml(`${table}<script>${"x".repeat(100)}</script>`, {
			maxTextCodeUnits: 799,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("preserves sanitized bytes and complete omission provenance around optional table ends", () => {
	const source =
		"<table id=x><tr><td hidden>one<svg/><template><p>hidden</p></template><script>bad()</script><th class=y>two</table>";
	const expected = '<table id="x"><tr><td>one<th class="y">two</table>';
	const sanitized = sanitizeResearchHtml(source, { maxDepth: 3 });
	expect(sanitized).toEqual({
		html: expected,
		report: {
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			sourceCodeUnits: source.length,
			textCodeUnits: 17,
			outputCodeUnits: expected.length,
			tokens: 15,
			omittedTokens: 8,
			omittedSubtrees: { svg: 1, template: 1, script: 1 },
			ignoredAttributes: 1,
			unwrappedElements: 0,
			tokenizerIssues: 0,
		},
	});
	const tree = load(source);
	expect(researchReaderInfo(tree)).toEqual({
		...sanitized.report,
		encoding: "utf-8",
	});
	const native = parseHtmlDocument(expected, url);
	trees.push(native);
	expect(serializeHtml(tree, tree.root)).toBe(
		serializeHtml(native, native.root),
	);
	expect(tree.textContent(tree.root)).toBe("onetwo");
	expect(
		new DocumentQueries(tree).querySelectorAll("table#x > tbody > tr > th.y"),
	).toHaveLength(1);
	expect(extractDocument(tree).reader).toEqual(researchReaderInfo(tree));
	expect(extractDocument(tree).content).toContain("one");
	expect(extractDocument(tree).content).toContain("two");
	expect(extractDocument(tree).content).not.toContain("hidden");
	tree.close();
	expect(researchReaderInfo(tree)).toBeUndefined();
});

it.each([
	{ source: "<table><td>value</table>", maxDepth: 4 },
	{ source: "<div><table><tr><td>value</table></div>", maxDepth: 5 },
])(
	"keeps the native DOM guard authoritative with implicit table/full-page wrappers: $source",
	({ source, maxDepth }) => {
		expect(sanitizeResearchHtml(source, { maxDepth }).html).toBe(source);
		expect(() => load(source, maxDepth)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const tree = load(source);
		expect(
			new DocumentQueries(tree).querySelectorAll(
				"html > body table > tbody > tr > td",
			),
		).toHaveLength(1);
	},
);

it("retains the default final DOM depth guard under 126 ordinary wrappers", () => {
	const source = `${"<div>".repeat(126)}<table>${"<td>value".repeat(140)}</table>${"</div>".repeat(126)}`;
	exactSourceDepth(source, 128);
	expect(researchReaderLimits.maxDepth).toBe(128);
	expect(() => load(source)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("does not turn genuinely deep nested tables into flat source siblings", () => {
	const source = "<table><tr><td>".repeat(43);
	expect(() => sanitizeResearchHtml(source)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => load(source)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});
