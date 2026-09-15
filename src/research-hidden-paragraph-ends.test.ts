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
const policies = ["source-hidden-v1", "source-hidden-inline-v1"] as const;
const hiddenCases = [
	{ policy: policies[0], attribute: "hidden" },
	{ policy: policies[0], attribute: 'aria-hidden="true"' },
	{ policy: policies[1], attribute: "hidden" },
	{ policy: policies[1], attribute: 'aria-hidden="true"' },
	{ policy: policies[1], attribute: 'style="display:none"' },
];
const rawPolicies: (ResearchReaderRawPolicy | undefined)[] = [
	undefined,
	"separate-omitted-raw-v1",
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function load(
	source: string,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
	rawPolicy?: ResearchReaderRawPolicy,
) {
	const body = new TextEncoder().encode(source);
	const tree = loadResearchDocument(
		{
			url: "https://research.example/hidden-paragraph-ends",
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "synthetic-hidden-paragraph-ends",
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

describe.each(hiddenCases)(
	"hidden paragraph ends with $policy and $attribute",
	({ policy, attribute }) => {
		function sanitize(
			source: string,
			limits: Partial<ResearchReaderLimits> = {},
			rawPolicy?: ResearchReaderRawPolicy,
		) {
			return sanitizeResearchHtml(
				source,
				limits,
				undefined,
				undefined,
				rawPolicy,
				policy,
			);
		}

		it("recovers nested paragraph ends without ending the hidden root", () => {
			const source = `<main><h1>Reference</h1><p>Before</p><div ${attribute}><p><p>SECRET</p></p><span hidden>STILL SECRET</span></div><p>After</p></main>`;
			const result = sanitize(source);
			expect(result.html).toBe(
				"<main><h1>Reference</h1><p>Before</p><p>After</p></main>",
			);
			expect(result.report).toMatchObject({
				visibilityPolicy: policy,
				sourceHiddenSubtrees: 1,
				omittedSubtrees: { div: 1 },
				tokenizerIssues: 0,
			});
			const tree = load(source, policy);
			expect(tree.textContent(tree.root)).toBe("ReferenceBeforeAfter");
			const queries = new DocumentQueries(tree);
			expect(queries.querySelectorAll("main > p")).toHaveLength(2);
			expect(queries.querySelectorAll("div, span")).toHaveLength(0);
			const extracted = extractDocument(tree);
			for (const text of ["Reference", "Before", "After"])
				expect(extracted.content).toContain(text);
			expect(extracted.content).not.toContain("SECRET");
			expect(researchReaderInfo(tree)).toEqual({
				...result.report,
				encoding: "utf-8",
			});
			expect(extracted.reader).toEqual(researchReaderInfo(tree));
		});

		it.each(["script", "style", "textarea"])(
			"keeps nested template and %s content hidden under both raw policies",
			(name) => {
				const raw = `</p></div></template></${name}x><p>RAW SECRET`;
				const source = `<main><div ${attribute}><template><p><p>SECRET</p></p><${name}>${raw}</${name}><p>TAIL</p></template><span hidden>NESTED</span></div><p>Visible</p></main>`;
				for (const rawPolicy of rawPolicies) {
					const result = sanitize(source, {}, rawPolicy);
					expect(result.html).toBe("<main><p>Visible</p></main>");
					const discarded = rawPolicy !== undefined && name !== "textarea";
					expect(result.report.textCodeUnits).toBe(
						23 + (discarded ? 0 : raw.length),
					);
					expect(result.report.sourceHiddenSubtrees).toBe(1);
					if (rawPolicy) {
						expect(result.report.omittedRaw).toMatchObject({
							codeUnits: discarded ? raw.length : 0,
							elements: discarded ? 1 : 0,
						});
					} else expect(result.report).not.toHaveProperty("omittedRaw");
					const tree = load(source, policy, rawPolicy);
					expect(tree.textContent(tree.root)).toBe("Visible");
					const extracted = extractDocument(tree);
					expect(extracted.content).toContain("Visible");
					for (const hidden of ["SECRET", "TAIL", "NESTED"])
						expect(extracted.content).not.toContain(hidden);
					expect(extracted.reader).toEqual({
						...result.report,
						encoding: "utf-8",
					});
				}
			},
		);

		it("ignores repeated orphan ends without popping non-paragraph ancestors", () => {
			const source = `<main><div ${attribute}></p><section></P></p>SECRET</section></p>STILL SECRET</div><p>Visible</p></main>`;
			expect(sanitize(source, { maxDepth: 3 }).html).toBe(
				"<main><p>Visible</p></main>",
			);
			const tree = load(source, policy);
			expect(tree.textContent(tree.root)).toBe("Visible");
		});

		it("charges ignored ends and omitted text to the existing exact budgets", () => {
			const source = `<main><p>Before</p><div ${attribute}><p><p>Hidden</p></p><span>Still hidden</span></div><p>After</p></main>`;
			const result = sanitize(source);
			expect(result.html).toBe("<main><p>Before</p><p>After</p></main>");
			expect(result.report).toMatchObject({
				sourceCodeUnits: source.length,
				outputCodeUnits: result.html.length,
				textCodeUnits: 29,
				tokens: 18,
				omittedTokens: 10,
				sourceHiddenSubtrees: 1,
				omittedSubtrees: { div: 1 },
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

		it("counts visible and hidden depth without adding an orphan paragraph", () => {
			const source = `<main><div ${attribute}><section><p><p>SECRET</p></p></section></div><p>Visible</p></main>`;
			expect(sanitize(source, { maxDepth: 4 }).html).toBe(
				"<main><p>Visible</p></main>",
			);
			const error = failure(() => sanitize(source, { maxDepth: 3 }));
			expect(error).toMatchObject({ code: "resource-limit" });
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "reader.depth",
				unit: "levels",
				limit: 3,
				observed: 4,
			});
		});

		it.each([
			`<div ${attribute}><p><span>SECRET</p></span></div>`,
			`<p><span ${attribute}>SECRET</p></span></p>`,
			`<p ${attribute}><span>SECRET</p></span></p>`,
			`<div ${attribute}><p><p>SECRET</p></p><span></div></span>`,
			`<div ${attribute}><p><p>SECRET</p></p></span></div>`,
			`<div ${attribute}><p><p>SECRET</p></p></section></div>`,
			`<div ${attribute}><p><p>SECRET</p></p>`,
			`<div ${attribute}><p><p>SECRET</p></p><script>UNTERMINATED`,
		])("retains strict mismatches and unclosed roots: %s", (source) => {
			expect(() => sanitize(source)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
			expect(() => load(source, policy)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
		});

		it.each(["svg", "math"])(
			"rejects orphan paragraph ends under %s ancestry",
			(name) => {
				for (const source of [
					`<div ${attribute}><${name}><g></p></g></${name}></div>`,
					`<${name}><div ${attribute}></p></div></${name}>`,
				]) {
					expect(() => sanitize(source)).toThrow(
						expect.objectContaining({ code: "unsupported" }),
					);
					expect(() => load(source, policy)).toThrow(
						expect.objectContaining({ code: "unsupported" }),
					);
				}
			},
		);
	},
);

it.each([undefined, ...policies])(
	"leaves visible paragraph serialization unchanged under %s",
	(policy) => {
		const source = "<main><p><p>Visible</p></p><p>After</p></main>";
		const result = sanitizeResearchHtml(
			source,
			{},
			undefined,
			undefined,
			undefined,
			policy,
		);
		expect(result.html).toBe(source);
		expect(result.report.omittedTokens).toBe(0);
		const tree = load(source, policy);
		expect(tree.textContent(tree.root)).toBe("VisibleAfter");
	},
);

it.each([undefined, ...policies])(
	"does not recover ordinary template mismatches under %s",
	(policy) => {
		const source = "<template><p><p>SECRET</p></p></template><p>Visible</p>";
		expect(() =>
			sanitizeResearchHtml(source, {}, undefined, undefined, undefined, policy),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
		expect(() => load(source, policy)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it.each(["hidden", 'aria-hidden="true"', 'style="display:none"'])(
	"keeps the default policy unchanged for %s",
	(attribute) => {
		const source = `<div ${attribute}><p><p>Retained</p></p></div><p>After</p>`;
		const result = sanitizeResearchHtml(source);
		expect(result.html).toBe("<div><p><p>Retained</p></p></div><p>After</p>");
		expect(result.report).not.toHaveProperty("sourceHiddenSubtrees");
		expect(result.report.hiddenContentSemantics).toBe(false);
		const tree = load(source);
		expect(tree.textContent(tree.root)).toBe("RetainedAfter");
	},
);

it.each([undefined, policies[0]])(
	"retains inline display content without the inline policy: %s",
	(policy) => {
		const source = '<div style="display:none"><p><p>Retained</p></p></div>';
		expect(
			sanitizeResearchHtml(source, {}, undefined, undefined, undefined, policy)
				.html,
		).toBe("<div><p><p>Retained</p></p></div>");
		expect(extractDocument(load(source, policy)).content).toContain("Retained");
	},
);
