import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
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

function load(source: string) {
	const body = new TextEncoder().encode(source);
	const tree = loadResearchDocument(
		{
			url: "https://research.example/definitions",
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 1,
		},
		{
			tabId: "synthetic-definitions",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50_000,
				maxDepth: 128,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
		},
	);
	trees.push(tree);
	return tree;
}

it.each(["dt", "dd"])("accounts for 140 optional %s siblings", (tag) => {
	const source = `<dl>${`<${tag}>value`.repeat(140)}</dl>`;
	const result = sanitizeResearchHtml(source, { maxDepth: 2 });
	expect(result.html).toBe(source);
	expect(result.report).toMatchObject({
		tokens: 282,
		textCodeUnits: 700,
		omittedTokens: 0,
		ignoredAttributes: 0,
		tokenizerIssues: 0,
	});
	const tree = load(source);
	const queries = new DocumentQueries(tree);
	expect(queries.querySelectorAll(`dl > ${tag}`)).toHaveLength(140);
	expect(queries.querySelector(`${tag} ${tag}`)).toBeNull();
	expect(researchReaderInfo(tree)).toEqual({
		...result.report,
		encoding: "utf-8",
	});
});

it.each([
	["<dt>term<dd>definition", 2],
	["<dt><code>term</code><dd><p>definition", 3],
	["<dt>term<dd><div><p>definition", 4],
	["<dt>term<dd><address>definition", 3],
	["<dt><span>term<dd>definition", 3],
] as const)(
	"retains native tree semantics for optional definitions %s",
	(entry, depth) => {
		const source = `<dl>${entry.repeat(140)}</dl>`;
		const result = sanitizeResearchHtml(source, { maxDepth: depth });
		expect(result.html).toBe(source);
		expect(result.report.outputCodeUnits).toBe(source.length);
		const tree = load(source);
		const original = parseHtmlDocument(
			source,
			"https://research.example/definitions",
		);
		trees.push(original);
		expect(serializeHtml(tree, tree.root)).toBe(
			serializeHtml(original, original.root),
		);
		const queries = new DocumentQueries(tree);
		expect(queries.querySelectorAll("dl > dt")).toHaveLength(140);
		expect(queries.querySelectorAll("dl > dd")).toHaveLength(140);
		expect(queries.querySelector("dt dt, dd dd, dt dd, dd dt")).toBeNull();
		expect(extractDocument(tree).content).toContain("term");
		expect(extractDocument(tree).content).toContain("definition");
		expect(() => sanitizeResearchHtml(source, { maxDepth: depth - 1 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it.each(["dt", "dd"])(
	"closes an immediately open paragraph before %s",
	(tag) => {
		const source = `<body><p>paragraph<${tag}>definition</body>`;
		expect(sanitizeResearchHtml(source, { maxDepth: 2 }).html).toBe(source);
		const tree = load(source);
		expect(new DocumentQueries(tree).querySelector(`p ${tag}`)).toBeNull();
	},
);

it.each([
	"dl",
	"blockquote",
	"section",
	"article",
	"ul",
	"ol",
	"li",
	"button",
	"table",
	"td",
	"th",
	"caption",
	"pre",
	"main",
])("does not collapse definition depth across %s scope barriers", (barrier) => {
	for (const tag of ["dt", "dd"]) {
		const source = `<dl><${tag}><${barrier}><${tag}>value`;
		expect(sanitizeResearchHtml(source, { maxDepth: 4 }).html).toBe(
			barrier === "button" ? source.replace("<button>", "") : source,
		);
		expect(() => sanitizeResearchHtml(source, { maxDepth: 3 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	}
});

it("retains genuinely nested definition-list depth and native hierarchy", () => {
	const source =
		"<dl><dd>outer<dl><dt>inner term<dd>inner definition</dl><dt>last</dl>";
	expect(sanitizeResearchHtml(source, { maxDepth: 4 }).html).toBe(source);
	expect(() => sanitizeResearchHtml(source, { maxDepth: 3 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const queries = new DocumentQueries(load(source));
	expect(queries.querySelectorAll("body > dl > dd > dl > dt")).toHaveLength(1);
	expect(queries.querySelectorAll("body > dl > dd > dl > dd")).toHaveLength(1);
	expect(queries.querySelectorAll("body > dl > dt")).toHaveLength(1);
});

it.each([
	"maxSourceCodeUnits",
	"maxTextCodeUnits",
	"maxOutputCodeUnits",
	"maxTokens",
] as const)("retains %s limits for flat definitions", (limit) => {
	expect(() =>
		sanitizeResearchHtml(`<dl>${"<dt>term<dd>definition".repeat(140)}</dl>`, {
			[limit]: 128,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each([
	"<template><dt>term<dd>definition</template>",
	"<svg><dt>term<dd>definition</svg>",
	"<script>unterminated",
])("does not relax omitted-subtree validation: %s", (source) => {
	expect(() => sanitizeResearchHtml(source)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("preserves omission and attribute accounting around definition ends", () => {
	const source =
		"<dl><dt id=source>term<svg/><dd hidden>definition<script>ignored()</script><dt>last</dl>";
	const result = sanitizeResearchHtml(source, { maxDepth: 2 });
	expect(result.html).toBe("<dl><dt>term<dd>definition<dt>last</dl>");
	expect(result.report).toMatchObject({
		partial: true,
		scripting: false,
		styling: false,
		hiddenContentSemantics: false,
		ignoredAttributes: 2,
		omittedSubtrees: { svg: 1, script: 1 },
		tokenizerIssues: 0,
	});
});

it.each(formatting)(
	"retains conservative accounting across unclosed formatting %s",
	(tag) => {
		for (const [before, after] of [
			["dt", "dd"],
			["dd", "dt"],
		]) {
			const source = `<dl><${before}><${tag}>term<${after}><i>definition`;
			expect(() => sanitizeResearchHtml(source, { maxDepth: 3 })).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
			expect(
				sanitizeResearchHtml(source, { maxDepth: 5 }).report.sourceCodeUnits,
			).toBe(source.length);
		}
	},
);

it.each(formatting)(
	"still admits explicitly closed formatting %s in flat definitions",
	(tag) => {
		const source = `<dl>${`<dt><${tag}>term</${tag}><dd>definition`.repeat(140)}</dl>`;
		expect(
			sanitizeResearchHtml(source, { maxDepth: 3 }).report.sourceCodeUnits,
		).toBe(source.length);
		const queries = new DocumentQueries(load(source));
		expect(queries.querySelectorAll("dl > dt")).toHaveLength(140);
		expect(queries.querySelectorAll("dl > dd")).toHaveLength(140);
	},
);

it.each([
	"<dl><dt><b>term<dd>definition</dd><dt><i>last",
	"<dl><dd><b>definition<dt>term</dt><dd><i>last",
])(
	"does not forget formatting after an explicit subsequent definition end: %s",
	(source) => {
		expect(() => sanitizeResearchHtml(source, { maxDepth: 4 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const tree = load(source);
		expect(
			new DocumentQueries(tree).querySelector(
				"dl > dt > b > i, dl > dd > b > i",
			),
		).not.toBeNull();
	},
);
