import { afterEach, describe, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type { ResearchReaderRawPolicy } from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const rawPolicies: (ResearchReaderRawPolicy | undefined)[] = [
	undefined,
	"separate-omitted-raw-v1",
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function load(source: string, rawPolicy?: ResearchReaderRawPolicy) {
	const body = new TextEncoder().encode(source);
	const tree = loadResearchDocument(
		{
			url: "https://research.example/omitted-paragraphs",
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "synthetic-omitted-paragraphs",
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

describe.each(rawPolicies)(
	"omitted paragraphs with raw policy %s",
	(rawPolicy) => {
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
			);
		}

		it("recovers a synthetic Zoom-shaped template without exposing inert content", () => {
			const source =
				'<main><h1>Meeting tools</h1><p>Before template</p><template id="meeting-card"><div><p>INERT_FIRST<p><strong>INERT_SECOND</strong><p>INERT_LAST</p></div></template><p>After template</p></main>';
			const expected =
				"<main><h1>Meeting tools</h1><p>Before template</p><p>After template</p></main>";
			const result = sanitize(source);
			expect(result.html).toBe(expected);
			expect(result.report).toMatchObject({
				omittedSubtrees: { template: 1 },
				sourceCodeUnits: source.length,
				outputCodeUnits: expected.length,
				tokenizerIssues: 0,
			});
			const tree = load(source, rawPolicy);
			expect(tree.textContent(tree.root)).toBe(
				"Meeting toolsBefore templateAfter template",
			);
			expect(
				new DocumentQueries(tree).querySelectorAll("main > p"),
			).toHaveLength(2);
			expect(
				new DocumentQueries(tree).querySelectorAll("template"),
			).toHaveLength(0);
			const extracted = extractDocument(tree);
			for (const text of ["Meeting tools", "Before template", "After template"])
				expect(extracted.content).toContain(text);
			expect(extracted.content).not.toContain("INERT_");
			expect(researchReaderInfo(tree)).toEqual({
				...result.report,
				encoding: "utf-8",
			});
			expect(extracted.reader).toEqual(researchReaderInfo(tree));
		});

		it.each(["template", "object", "canvas"])(
			"closes only a directly open paragraph inside %s",
			(name) => {
				const source = `<p>Before</p><${name}><p>first<!-- inert --><br><em>middle</em><P>last</P></${name}><p>After</p>`;
				expect(sanitize(source).html).toBe("<p>Before</p><p>After</p>");
				const tree = load(source, rawPolicy);
				expect(tree.textContent(tree.root)).toBe("BeforeAfter");
			},
		);

		it("keeps repeated sibling paragraphs at their actual omitted depth", () => {
			const source = `<template><div>${"<p>hidden".repeat(140)}</p></div></template><p>Kept</p>`;
			const result = sanitize(source, { maxDepth: 3 });
			expect(result.html).toBe("<p>Kept</p>");
			expect(result.report.textCodeUnits).toBe(140 * "hidden".length + 4);
			expect(extractDocument(load(source, rawPolicy)).content).toContain(
				"Kept",
			);
			const error = failure(() => sanitize(source, { maxDepth: 2 }));
			expect(error).toMatchObject({ code: "resource-limit" });
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "reader.depth",
				unit: "levels",
				limit: 2,
				observed: 3,
			});
		});

		it("still charges true nesting rather than flattening non-direct paragraphs", () => {
			const source = `<template>${"<p><div>".repeat(8)}hidden${"</div></p>".repeat(8)}</template>`;
			expect(sanitize(source, { maxDepth: 17 }).html).toBe("");
			const error = failure(() => sanitize(source, { maxDepth: 16 }));
			expect(error).toMatchObject({ code: "resource-limit" });
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "reader.depth",
				unit: "levels",
				limit: 16,
				observed: 17,
			});
		});

		it("preserves exact text, token, source and output accounting", () => {
			const source =
				"<p>Before</p><template><p>hidden one<p>hidden two</p></template><p>After</p>";
			const result = sanitize(source);
			expect(result.html).toBe("<p>Before</p><p>After</p>");
			expect(result.report).toMatchObject({
				sourceCodeUnits: source.length,
				textCodeUnits: 31,
				outputCodeUnits: result.html.length,
				tokens: 13,
				omittedTokens: 7,
				omittedSubtrees: { template: 1 },
			});
			for (const [limit, measurement, kind] of [
				["maxTextCodeUnits", "textCodeUnits", "reader.text"],
				["maxTokens", "tokens", "reader.tokens"],
				["maxSourceCodeUnits", "sourceCodeUnits", "reader.source"],
				["maxOutputCodeUnits", "outputCodeUnits", "reader.output"],
			] as const) {
				const maximum = result.report[measurement];
				expect(sanitize(source, { [limit]: maximum })).toEqual(result);
				const error = failure(() => sanitize(source, { [limit]: maximum - 1 }));
				expect(error).toMatchObject({ code: "resource-limit" });
				expect(resourceLimitDiagnostic(error)).toMatchObject({
					kind,
					limit: maximum - 1,
					observed: maximum,
				});
			}
		});

		it.each(["script", "style", "iframe", "noembed", "noframes"])(
			"keeps paragraph-like %s raw content inert until its matching end",
			(name) => {
				const raw = `<p>RAW_ONLY</template></${name}x><p>STILL_RAW`;
				const source = `<p>Before</p><template><p>first<${name}>${raw}</${name}><p>last</p></template><p>After</p>`;
				const result = sanitize(source);
				expect(result.html).toBe("<p>Before</p><p>After</p>");
				expect(result.report.textCodeUnits).toBe(
					20 + (rawPolicy ? 0 : raw.length),
				);
				if (rawPolicy) {
					expect(result.report.omittedRaw).toMatchObject({
						codeUnits: raw.length,
						elements: 1,
					});
					expect(result.report.omittedRaw?.workUnits).toBeGreaterThan(0);
				} else expect(result.report).not.toHaveProperty("omittedRaw");
				const tree = load(source, rawPolicy);
				expect(tree.textContent(tree.root)).toBe("BeforeAfter");
				expect(extractDocument(tree).content).not.toContain("RAW");
				const unterminated = `<template><p>first<p>last<${name}>${raw}</p></template>`;
				expect(() => sanitize(unterminated)).toThrow(
					expect.objectContaining({ code: "unsupported" }),
				);
				expect(() => load(unterminated, rawPolicy)).toThrow(
					expect.objectContaining({ code: "unsupported" }),
				);
			},
		);

		it.each(["svg", "math"])(
			"does not apply HTML paragraph closure anywhere under %s ancestry",
			(name) => {
				for (const wrapper of ["", "<template><div>"]) {
					const ending = wrapper ? "</div></template>" : "";
					const source = `<template><${name}>${wrapper}<p>first<p>last</p>${ending}</${name}></template>`;
					expect(() => sanitize(source)).toThrow(
						expect.objectContaining({ code: "unsupported" }),
					);
					expect(() => load(source, rawPolicy)).toThrow(
						expect.objectContaining({ code: "unsupported" }),
					);
					const balanced = `<template><${name}>${wrapper}<p>first</p><p>last</p>${ending}</${name}></template><p>Kept</p>`;
					expect(sanitize(balanced).html).toBe("<p>Kept</p>");
				}
			},
		);

		it.each([
			"<template><p>first<p>last</template>",
			"<template><p>first<p>last",
			"<template><p>first<p>last</p>",
			"<template><div><p>first<p>last</div></template>",
			"<template><p>first<p>last<template></template></template>",
			"<template><p>first<p>last</p></p></template>",
			"<template><p>first<span>middle<p>last</p></span></template>",
			"<template><div><span>hidden</div></span></template>",
			"<template><p>first<div>last</div></template>",
			"<template><table><td>first<td>last</table></template>",
		])(
			"retains strict omitted boundary and mismatch rejection: %s",
			(source) => {
				expect(() => sanitize(source)).toThrow(
					expect.objectContaining({ code: "unsupported" }),
				);
				expect(() => load(source, rawPolicy)).toThrow(
					expect.objectContaining({ code: "unsupported" }),
				);
			},
		);
	},
);
