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
const blockEnds =
	"address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer header hgroup listing main menu nav ol pre search section summary ul".split(
		" ",
	);

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function sanitize(
	source: string,
	visibilityPolicy: ResearchReaderVisibilityPolicy = policies[1],
	limits: Partial<ResearchReaderLimits> = {},
	rawPolicy?: ResearchReaderRawPolicy,
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

function load(
	source: string,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
	rawPolicy?: ResearchReaderRawPolicy,
) {
	const body = new TextEncoder().encode(source);
	const tree = loadResearchDocument(
		{
			url: "https://research.example/hidden-block-ends",
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "synthetic-hidden-block-ends",
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

function expectUnsupported(source: string) {
	for (const policy of policies) {
		expect(() => sanitize(source, policy)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => load(source, policy)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	}
}

describe.each(hiddenCases)(
	"hidden block ends with $policy and $attribute",
	({ policy, attribute }) => {
		it.each(["SECRET", "<span>SECRET", "<ul><li>SECRET<li>ALSO SECRET"])(
			"closes direct and descendant blocks without losing visible siblings: %s",
			(descendants) => {
				const source = `<main><p>Before</p><div ${attribute}>${descendants}</div><p>After</p></main>`;
				const result = sanitize(source, policy);
				expect(result.html).toBe("<main><p>Before</p><p>After</p></main>");
				expect(result.report).toMatchObject({
					visibilityPolicy: policy,
					sourceHiddenSubtrees: 1,
					omittedSubtrees: { div: 1 },
					tokenizerIssues: 0,
				});
				const tree = load(source, policy);
				expect(tree.textContent(tree.root)).toBe("BeforeAfter");
				const queries = new DocumentQueries(tree);
				expect(queries.querySelectorAll("main > p")).toHaveLength(2);
				expect(queries.querySelectorAll("div, span, ul, li")).toHaveLength(0);
				for (const format of ["markdown", "json"] as const) {
					const extracted = extractDocument(tree, { format });
					const content = JSON.stringify(extracted.content);
					expect(content).toContain("Before");
					expect(content).toContain("After");
					expect(content).not.toContain("SECRET");
					expect(extracted.reader).toEqual(researchReaderInfo(tree));
				}
				expect(researchReaderInfo(tree)).toEqual({
					...result.report,
					encoding: "utf-8",
				});
			},
		);

		it("closes the nearest repeated ancestor without disclosing the hidden tail", () => {
			const source = `<main><div ${attribute}><div><span>INNER SECRET</div><section><span>NESTED SECRET</section><span>TAIL SECRET</span></div><p>Visible</p></main>`;
			expect(sanitize(source, policy).html).toBe("<main><p>Visible</p></main>");
			const tree = load(source, policy);
			expect(tree.textContent(tree.root)).toBe("Visible");
		});

		it("accepts a block close after orphan paragraph ends without repairing visible ends", () => {
			const source = `<div ${attribute}><p><p>SECRET</p></p><span></div></span><p>Visible</p>`;
			expect(sanitize(source, policy).html).toBe("</span><p>Visible</p>");
			const tree = load(source, policy);
			expect(tree.textContent(tree.root)).toBe("Visible");
		});

		it("keeps hidden source metadata excluded after a nested ancestor close", () => {
			const data = JSON.stringify({
				items: [
					{
						title: "SECRET",
						elements: {
							value: { title: "Label", formatValue: "SECRET" },
						},
						elementsOrder: ["value"],
					},
				],
			});
			expect(
				sanitize(`<div data-json='${data}'></div>`, policy).sourceDataTables
					?.tables,
			).toHaveLength(1);
			const source = `<head><meta name="description" content="PUBLIC"></head><main><div ${attribute} data-json='${data}'><section><span>SECRET</section><meta name="description" content="SECRET"><link rel="alternate" type="text/markdown" href="/secret.md"><div data-json='${data}'></div></div><p>Visible</p></main>`;
			const selected = sanitize(source, policy);
			expect(selected.html).toBe(
				'<head><meta name="description" content="PUBLIC"></head><main><p>Visible</p></main>',
			);
			expect(selected.sourceDataTables).toBeUndefined();
			const tree = load(source, policy);
			for (const format of ["markdown", "json"] as const) {
				const extracted = extractDocument(tree, { format });
				expect(extracted.sourceDescriptions?.entries).toEqual([
					{
						attribute: "name",
						name: "description",
						text: "PUBLIC",
						truncated: false,
					},
				]);
				expect(extracted.sourceDataTables).toBeUndefined();
				expect(extracted.sourceAlternates).toBeUndefined();
				expect(JSON.stringify(extracted)).not.toContain("SECRET");
				expect(JSON.stringify(extracted)).not.toContain("secret.md");
			}
		});

		it("preserves exact token, text and depth accounting when discarding descendants", () => {
			const source = `<main><div ${attribute}><section><span>Hidden</section>Tail</div><p>Visible</p></main>`;
			const result = sanitize(source, policy);
			expect(result.html).toBe("<main><p>Visible</p></main>");
			expect(result.report).toMatchObject({
				textCodeUnits: 17,
				tokens: 12,
				omittedTokens: 7,
				sourceHiddenSubtrees: 1,
				omittedSubtrees: { div: 1 },
			});
			for (const [limit, maximum, kind] of [
				["maxTextCodeUnits", 17, "reader.text"],
				["maxTokens", 12, "reader.tokens"],
				["maxDepth", 4, "reader.depth"],
			] as const) {
				expect(sanitize(source, policy, { [limit]: maximum })).toEqual(result);
				const error = failure(() =>
					sanitize(source, policy, { [limit]: maximum - 1 }),
				);
				expect(error).toMatchObject({ code: "resource-limit" });
				expect(resourceLimitDiagnostic(error)).toMatchObject({
					kind,
					limit: maximum - 1,
					observed: maximum,
				});
			}
		});
	},
);

it.each(blockEnds)("allows the supported hidden %s ancestor end", (name) => {
	const source = `<main><${name} hidden><span>SECRET</${name}><p>Visible</p></main>`;
	expect(sanitize(source).html).toBe("<main><p>Visible</p></main>");
	const tree = load(source, policies[1]);
	expect(tree.textContent(tree.root)).toBe("Visible");
});

it.each([
	"applet",
	"caption",
	"html",
	"table",
	"td",
	"th",
	"marquee",
	"object",
	"select",
	"template",
	"body",
	"form",
])("does not cross the %s scope boundary", (name) => {
	expectUnsupported(
		`<div hidden><${name}><span>SECRET</div></span></${name}><p>Visible</p>`,
	);
});

it.each(["hidden", 'aria-hidden="true"', 'style="display:none"'])(
	"rejects duplicate body attribute merging across a block close: %s",
	(attribute) => {
		expectUnsupported(
			`<body><div hidden><body ${attribute}><span></div><p>SECRET</p></body>`,
		);
	},
);

it("does not discard persistent form state across a block close", () => {
	expectUnsupported(
		"<div hidden><form><span></div><form hidden><p>Following</p></form><p>After</p>",
	);
});

it.each(policies)(
	"charges an explicit ancestor end exactly once under %s",
	(policy) => {
		const source = "<div hidden><ul><li>H</li></div><p>V</p>";
		const result = sanitize(source, policy);
		expect(result.html).toBe("<p>V</p>");
		expect(result.report).toMatchObject({
			sourceCodeUnits: 40,
			tokens: 9,
			omittedTokens: 6,
			textCodeUnits: 2,
			outputCodeUnits: 8,
		});
		for (const [limit, maximum, kind] of [
			["maxTokens", 9, "reader.tokens"],
			["maxTextCodeUnits", 2, "reader.text"],
			["maxOutputCodeUnits", 8, "reader.output"],
			["maxDepth", 3, "reader.depth"],
		] as const) {
			expect(sanitize(source, policy, { [limit]: maximum })).toEqual(result);
			expect(
				resourceLimitDiagnostic(
					failure(() => sanitize(source, policy, { [limit]: maximum - 1 })),
				),
			).toMatchObject({ kind, limit: maximum - 1, observed: maximum });
		}
	},
);

it.each("a b big code em font i nobr s small strike strong tt u".split(" "))(
	"does not discard reconstructable %s formatting across a block end",
	(name) => {
		expectUnsupported(
			`<div hidden><${name}><span>SECRET</div>TAIL</${name}><p>Visible</p>`,
		);
	},
);

it.each(["span", "form", "h1", "li", "x-card"])(
	"does not extend ancestor closure to unsupported %s ends",
	(name) => {
		expectUnsupported(
			`<${name} hidden><x-child>SECRET</${name}><p>Visible</p>`,
		);
	},
);

it.each(["svg", "math"])(
	"does not repair hidden block mismatches under %s ancestry",
	(name) => {
		for (const source of [
			`<div hidden><${name}><section><span>SECRET</section></${name}></div>`,
			`<${name} hidden><div><span>SECRET</div></${name}>`,
			`<${name}><div hidden><span>SECRET</div></${name}>`,
		])
			expectUnsupported(source);
	},
);

it.each(["template", "object", "canvas"])(
	"does not scan even local block ancestors inside legacy-omitted %s",
	(name) => {
		expectUnsupported(
			`<div hidden><${name}><section><span>SECRET</section></${name}></div>`,
		);
		expectUnsupported(`<${name}><div hidden><span>SECRET</div></${name}>`);
	},
);

it("retains direct matches and resumes recovery after a legacy subtree closes", () => {
	const source =
		"<main><div hidden><b><section><span>SECRET</span></section></b><template><section>SECRET</section></template><section><span>TAIL</section></div><p>Visible</p></main>";
	for (const rawPolicy of rawPolicies) {
		expect(sanitize(source, policies[1], {}, rawPolicy).html).toBe(
			"<main><p>Visible</p></main>",
		);
		const tree = load(source, policies[1], rawPolicy);
		expect(tree.textContent(tree.root)).toBe("Visible");
	}
});

it.each([
	"<section><div hidden><span>SECRET</section></div>",
	"<div><section hidden><span>SECRET</div></section>",
	"<div hidden><span>SECRET</article></div>",
	"<div hidden><span>SECRET",
	"<div hidden><section><span>SECRET</section>",
	"<div hidden><section><script>UNTERMINATED",
	"<div hidden><section><plaintext></section></div><p>NOT VISIBLE</p>",
])("rejects outside ancestors, unmatched ends and EOF in %s", (source) => {
	expectUnsupported(source);
});

it.each([
	"script",
	"style",
	"textarea",
	"title",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
])("does not use raw %s literals as block end tokens", (name) => {
	const raw = `</section></div></${name}x><p>RAW SECRET`;
	const source = `<main><div hidden><section><${name}>${raw}</${name}><span>TAIL</section>HIDDEN</div><p>Visible</p></main>`;
	for (const rawPolicy of rawPolicies) {
		const result = sanitize(source, policies[1], {}, rawPolicy);
		const discarded =
			rawPolicy !== undefined && !["textarea", "title"].includes(name);
		expect(result.html).toBe("<main><p>Visible</p></main>");
		expect(result.report.textCodeUnits).toBe(17 + (discarded ? 0 : raw.length));
		if (rawPolicy)
			expect(result.report.omittedRaw).toMatchObject({
				codeUnits: discarded ? raw.length : 0,
				elements: discarded ? 1 : 0,
			});
		else expect(result.report).not.toHaveProperty("omittedRaw");
		const tree = load(source, policies[1], rawPolicy);
		expect(tree.textContent(tree.root)).toBe("Visible");
	}
});

it("does not interpret encoded ancestor ends as markup", () => {
	const source =
		"<div hidden><section><span>&lt;/section&gt;&lt;/div&gt;SECRET</section>TAIL</div><p>Visible</p>";
	expect(sanitize(source).html).toBe("<p>Visible</p>");
});

it.each([undefined, ...policies])(
	"leaves the visible open stack serialization unchanged under %s",
	(policy) => {
		const source = "<main><div><span>Retained</div><p>After</p></main>";
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
		expect(tree.textContent(tree.root)).toBe("RetainedAfter");
	},
);

it.each(["hidden", 'aria-hidden="true"', 'style="display:none"'])(
	"does not change default visibility for %s",
	(attribute) => {
		const source = `<div ${attribute}><span>Retained</div><p>After</p>`;
		expect(sanitizeResearchHtml(source).html).toBe(
			"<div><span>Retained</div><p>After</p>",
		);
		const tree = load(source);
		expect(tree.textContent(tree.root)).toBe("RetainedAfter");
	},
);

it("does not apply inline display filtering to the attributes-only policy", () => {
	const source = '<div style="display:none"><ul><li>Retained</div><p>After</p>';
	expect(sanitize(source, policies[0]).html).toBe(
		"<div><ul><li>Retained</div><p>After</p>",
	);
	expect(sanitize(source, policies[1]).html).toBe("<p>After</p>");
});
