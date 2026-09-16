import { afterEach, describe, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type {
	ResearchReaderRawPolicy,
	ResearchReaderVisibilityPolicy,
} from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const controlNames = ["select", "optgroup", "option"] as const;
const rawPolicies: (ResearchReaderRawPolicy | undefined)[] = [
	undefined,
	"separate-omitted-raw-v1",
];
const visibilityPolicies: (ResearchReaderVisibilityPolicy | undefined)[] = [
	undefined,
	"source-hidden-v1",
	"source-hidden-inline-v1",
];
const policyCases = rawPolicies.flatMap((rawPolicy) =>
	visibilityPolicies.map((visibilityPolicy) => ({
		rawPolicy,
		visibilityPolicy,
	})),
);

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function load(
	source: string,
	rawPolicy?: ResearchReaderRawPolicy,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
) {
	const body = new TextEncoder().encode(`<main>${source}</main>`);
	const tree = loadResearchDocument(
		{
			url: "https://reader.invalid/option-text",
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.byteLength,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "synthetic-option-text",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50_000,
				maxDepth: 128,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
		},
		undefined,
		rawPolicy,
		visibilityPolicy,
	);
	trees.push(tree);
	return tree;
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected failure");
}

it.each([
	{
		name: "adjacent numeric options",
		source:
			"<select><option>25</option><option>50</option><option>100</option><option>200</option></select>results per page",
		html: "  25  50  100  200  results per page",
		text: "  25  50  100  200  results per page",
	},
	{
		name: "text options with leading and trailing prose",
		source:
			"Search<select><option>All fields</option><option>Title</option><option>Author</option></select>results",
		html: "Search  All fields  Title  Author  results",
		text: "Search  All fields  Title  Author  results",
	},
	{
		name: "adjacent option groups without attribute labels",
		source:
			'<select><optgroup label="FIRST_LABEL"><option>A</option></optgroup><optgroup label="SECOND_LABEL"><option>B</option></optgroup></select>',
		html: "   A    B   ",
		text: "   A    B   ",
	},
	{
		name: "empty controls without attribute content",
		source:
			'<select value="SELECT_VALUE"><optgroup label="GROUP_LABEL"><option label="OPTION_LABEL" value="OPTION_VALUE"></option></optgroup></select>',
		html: "      ",
		text: "      ",
	},
	{
		name: "inline formatting within an option",
		source:
			"<select><option><strong>All</strong><span>fields</span></option><option><em>Title</em></option></select>",
		html: "  <strong>All</strong><span>fields</span>  <em>Title</em>  ",
		text: "  Allfields  Title  ",
	},
	{
		name: "escaped entities and Unicode",
		source:
			"<select><option>&amp;&lt;b&gt;&nbsp;&#x1F600;</option><option>标题</option></select>",
		html: "  &amp;&lt;b&gt;\u00a0😀  标题  ",
		text: "  &<b>\u00a0😀  标题  ",
	},
	{
		name: "two optional option ends without new stack semantics",
		source: "<select><option>A<option>B</select>",
		html: "  A B ",
		text: "  A B ",
	},
	{
		name: "an unmatched option close after its select closed",
		source: "A<select><option>B</select>C</option>D",
		html: "A  B CD",
		text: "A  B CD",
	},
	{
		name: "ordinary adjacent inline text",
		source: "before<span>A</span><em>B</em><strong>C</strong>after",
		html: "before<span>A</span><em>B</em><strong>C</strong>after",
		text: "beforeABCafter",
	},
])("retains semantic source text for $name", ({ source, html, text }) => {
	const result = sanitizeResearchHtml(source);
	expect(result.html).toBe(html);
	expect(result.report).toMatchObject({
		sourceCodeUnits: source.length,
		outputCodeUnits: html.length,
		tokenizerIssues: 0,
		scripting: false,
		styling: false,
	});
	const tree = load(source);
	expect(tree.textContent(tree.root)).toBe(text);
	expect(
		new DocumentQueries(tree).querySelectorAll("select, optgroup, option"),
	).toHaveLength(0);
});

it.each(controlNames)(
	"adds ASCII spaces at admitted %s boundaries but not unmatched closes",
	(name) => {
		expect(
			sanitizeResearchHtml(`left<${name}>middle</${name}>right`).html,
		).toBe("left middle right");
		expect(sanitizeResearchHtml(`left</${name}>right`).html).toBe("leftright");
		expect(sanitizeResearchHtml(`<${name}>A</${name}></${name}>B`).html).toBe(
			" A B",
		);
	},
);

describe.each(policyCases)(
	"option text with raw=$rawPolicy and visibility=$visibilityPolicy",
	({ rawPolicy, visibilityPolicy }) => {
		function sanitize(
			source: string,
			limits: Partial<ResearchReaderLimits> = {},
		) {
			return sanitizeResearchHtml(
				source,
				limits,
				undefined,
				undefined,
				rawPolicy,
				visibilityPolicy,
			);
		}

		it("retains every literal option, never input values or selection labels", () => {
			const source =
				'<input type="password" value="SYNTHETIC_PASSWORD"><select value="SELECT_VALUE" aria-label="SELECT_LABEL" onchange="SYNTHETIC_HANDLER"><option value="FIRST_VALUE" label="FIRST_LABEL">First</option><option selected disabled value="SECOND_VALUE" data-password="SYNTHETIC_ATTRIBUTE">Second</option></select>';
			const result = sanitize(source);
			expect(result.html).toBe("  First  Second  ");
			expect(result.report).toMatchObject({
				unwrappedElements: 3,
				omittedSubtrees: { input: 1 },
				textCodeUnits: 11,
			});
			if (rawPolicy === undefined)
				expect(result.report).not.toHaveProperty("rawTextPolicy");
			else expect(result.report.rawTextPolicy).toBe(rawPolicy);
			if (visibilityPolicy === undefined)
				expect(result.report.hiddenContentSemantics).toBe(false);
			else expect(result.report.visibilityPolicy).toBe(visibilityPolicy);
			const tree = load(source, rawPolicy, visibilityPolicy);
			expect(tree.textContent(tree.root)).toBe(result.html);
			expect(
				new DocumentQueries(tree).querySelectorAll("input, select, option"),
			).toHaveLength(0);
			const extracted = extractDocument(tree);
			expect(extracted.content).toContain("First Second");
			expect(JSON.stringify(extracted)).not.toMatch(
				/SYNTHETIC_|SELECT_VALUE|SELECT_LABEL|FIRST_VALUE|FIRST_LABEL|SECOND_VALUE/,
			);
			expect(extracted.reader).toEqual(researchReaderInfo(tree));
		});

		it.each(controlNames)(
			"applies source hiding before %s boundaries",
			(name) => {
				for (const attribute of [
					"hidden",
					'aria-hidden="true"',
					'style="display:none"',
				]) {
					const hidden =
						visibilityPolicy !== undefined &&
						(attribute !== 'style="display:none"' ||
							visibilityPolicy === "source-hidden-inline-v1");
					const source = `Before<${name} ${attribute}>SECRET</${name}>After`;
					const result = sanitize(source);
					expect(result.html).toBe(
						hidden ? "BeforeAfter" : "Before SECRET After",
					);
					expect(result.report.textCodeUnits).toBe(17);
					if (visibilityPolicy !== undefined)
						expect(result.report.sourceHiddenSubtrees).toBe(hidden ? 1 : 0);
					const tree = load(source, rawPolicy, visibilityPolicy);
					expect(tree.textContent(tree.root)).toBe(result.html);
				}
			},
		);

		it("suppresses all nested boundaries inside a hidden select", () => {
			const source =
				"Before<select hidden><optgroup><option>SECRET</option></optgroup></select>After";
			const result = sanitize(source);
			expect(result.html).toBe(
				visibilityPolicy === undefined
					? "Before   SECRET   After"
					: "BeforeAfter",
			);
			const tree = load(source, rawPolicy, visibilityPolicy);
			expect(tree.textContent(tree.root)).toBe(result.html);
		});

		it("omits hidden option children without dropping visible siblings", () => {
			const source =
				'<select><option hidden>SECRET</option><option>A<span aria-hidden="true">CHILD</span>B</option></select>';
			const result = sanitize(source);
			const hidden = visibilityPolicy !== undefined;
			expect(result.html).toBe(
				hidden ? "  AB  " : "  SECRET  A<span>CHILD</span>B  ",
			);
			expect(result.report.textCodeUnits).toBe(13);
			const tree = load(source, rawPolicy, visibilityPolicy);
			expect(tree.textContent(tree.root)).toBe(
				hidden ? "  AB  " : "  SECRET  ACHILDB  ",
			);
		});

		it("does not infer rendered hiding from unrelated attributes or CSS", () => {
			const source =
				'<select inert class="hidden" style="visibility:hidden;opacity:0"><option aria-hidden="false" aria-selected="false">A</option><option style="display:var(--hidden)" disabled>B</option></select>';
			expect(sanitize(source).html).toBe("  A  B  ");
		});

		it.each(["script", "template", "svg", "math"])(
			"adds no boundaries for controls inside omitted %s content",
			(name) => {
				const source = `<select><option>A<${name}><select><optgroup><option>SECRET</option></optgroup></select></${name}>B</option></select>`;
				const result = sanitize(source);
				expect(result.html).toBe("  AB  ");
				expect(result.report.omittedSubtrees).toMatchObject({ [name]: 1 });
				const tree = load(source, rawPolicy, visibilityPolicy);
				expect(tree.textContent(tree.root)).toBe("  AB  ");
				expect(new DocumentQueries(tree).querySelectorAll(name)).toHaveLength(
					0,
				);
			},
		);

		it.each([
			"<select><option>A<template><span>SECRET</template></option></select>",
			"<select><option>A<svg><option>SECRET</svg></option></select>",
		])("retains malformed omitted-subtree rejection: %s", (source) => {
			expect(() => sanitize(source)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
		});

		it("retains raw-policy accounting independently of boundary output", () => {
			const source = "<select><option>A<script>RAW</script>B</option></select>";
			const textCodeUnits = rawPolicy === undefined ? 5 : 2;
			const result = sanitize(source, { maxTextCodeUnits: textCodeUnits });
			expect(result.html).toBe("  AB  ");
			expect(result.report.textCodeUnits).toBe(textCodeUnits);
			expect(result.report.outputCodeUnits).toBe(6);
			const error = failure(() =>
				sanitize(source, { maxTextCodeUnits: textCodeUnits - 1 }),
			);
			expect(resourceLimitDiagnostic(error)).toMatchObject({
				kind: "reader.text",
				observed: textCodeUnits,
			});
		});
	},
);

it.each([
	...controlNames.flatMap((name) => [
		{ name: `${name} opening`, source: `A<${name}>`, html: "A " },
		{ name: `${name} closing`, source: `<${name}>A</${name}>`, html: " A " },
		{ name: `empty ${name}`, source: `<${name}></${name}>`, html: "  " },
	]),
	{
		name: "select and option closings",
		source: "<select><option>A</option></select>",
		html: "  A  ",
	},
	{
		name: "group closing",
		source: "<select><optgroup><option>A</option></optgroup></select>",
		html: "   A   ",
	},
	{ name: "escaped entity", source: "<option>&amp;</option>", html: " &amp; " },
	{ name: "Unicode code units", source: "<option>😀</option>", html: " 😀 " },
])("counts $name spaces at the exact output limit", ({ source, html }) => {
	const result = sanitizeResearchHtml(source, {
		maxOutputCodeUnits: html.length,
	});
	expect(result.html).toBe(html);
	expect(result.report.outputCodeUnits).toBe(html.length);
	const error = failure(() =>
		sanitizeResearchHtml(source, { maxOutputCodeUnits: html.length - 1 }),
	);
	expect(error).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "reader.output",
		unit: "code-units",
		limit: html.length - 1,
		observed: html.length,
	});
});

it.each(controlNames)(
	"does not charge empty %s spaces as source text",
	(name) => {
		const source = `<${name}></${name}>`;
		const result = sanitizeResearchHtml(source, {
			maxSourceCodeUnits: source.length,
			maxTextCodeUnits: 1,
			maxOutputCodeUnits: 2,
		});
		expect(result.html).toBe("  ");
		expect(result.report).toMatchObject({
			sourceCodeUnits: source.length,
			textCodeUnits: 0,
			outputCodeUnits: 2,
		});
	},
);

const boundedSource =
	"<select><optgroup><option>AB</option></optgroup></select>";

it.each([
	{
		option: "maxSourceCodeUnits",
		kind: "reader.source",
		unit: "code-units",
		observed: boundedSource.length,
	},
	{
		option: "maxTextCodeUnits",
		kind: "reader.text",
		unit: "code-units",
		observed: 2,
	},
	{
		option: "maxTokens",
		kind: "reader.tokens",
		unit: "tokens",
		observed: 7,
	},
	{
		option: "maxDepth",
		kind: "reader.depth",
		unit: "levels",
		observed: 3,
	},
] as const)(
	"retains the $kind limit without charging spaces",
	({ option, kind, unit, observed }) => {
		const result = sanitizeResearchHtml(boundedSource, { [option]: observed });
		expect(result.html).toBe("   AB   ");
		expect(result.report).toMatchObject({
			sourceCodeUnits: boundedSource.length,
			textCodeUnits: 2,
			tokens: 7,
			outputCodeUnits: 8,
		});
		const error = failure(() =>
			sanitizeResearchHtml(boundedSource, { [option]: observed - 1 }),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind,
			unit,
			limit: observed - 1,
			observed,
		});
	},
);

it.each(["source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"still charges omitted child text under %s",
	(policy) => {
		const source =
			"<select><option>A<span hidden>SECRET</span>B</option></select>";
		const result = sanitizeResearchHtml(
			source,
			{ maxTextCodeUnits: 8 },
			undefined,
			undefined,
			undefined,
			policy,
		);
		expect(result.html).toBe("  AB  ");
		expect(result.report.textCodeUnits).toBe(8);
		const error = failure(() =>
			sanitizeResearchHtml(
				source,
				{ maxTextCodeUnits: 7 },
				undefined,
				undefined,
				undefined,
				policy,
			),
		);
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "reader.text",
			unit: "code-units",
			limit: 7,
			observed: 8,
		});
	},
);

it("retains pre-abort and cancellation at each boundary-budget check", () => {
	const controller = new AbortController();
	controller.abort();
	expect(() =>
		sanitizeResearchHtml(boundedSource, {}, controller.signal),
	).toThrow(expect.objectContaining({ code: "aborted" }));
	let checks = 0;
	const countingSignal = {
		get aborted() {
			checks++;
			return false;
		},
	} as AbortSignal;
	const limits = { maxOutputCodeUnits: 7 };
	const budgetError = failure(() =>
		sanitizeResearchHtml(boundedSource, limits, countingSignal),
	);
	expect(resourceLimitDiagnostic(budgetError)).toMatchObject({
		kind: "reader.output",
		observed: 8,
	});
	expect(checks).toBeGreaterThan(0);
	for (let abortAt = 1; abortAt <= checks; abortAt++) {
		let current = 0;
		const signal = {
			get aborted() {
				return ++current >= abortAt;
			},
		} as AbortSignal;
		const error = failure(() =>
			sanitizeResearchHtml(boundedSource, limits, signal),
		);
		expect(error).toMatchObject({ code: "aborted" });
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
	}
});
