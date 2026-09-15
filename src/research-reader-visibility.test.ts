import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import {
	discoverDocumentHeadings,
	discoverDocumentLinks,
	extractDocument,
} from "./extraction.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderRawLimits,
	sanitizeResearchHtml,
} from "./research-loader.js";
import {
	type ResearchReaderRawPolicy,
	type ResearchReaderVisibilityPolicy,
	researchReaderInfo,
	researchReaderNotice,
	researchReaderNoticeFor,
	setResearchReaderInfo,
	validateResearchReaderVisibilityPolicy,
} from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";

const policy: ResearchReaderVisibilityPolicy = "source-hidden-v1";
const rawPolicy: ResearchReaderRawPolicy = "separate-omitted-raw-v1";
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
});

function context(): DocumentLoaderContext {
	return {
		tabId: "synthetic-reader-visibility",
		signal: new AbortController().signal,
		limits: {
			maxNodes: 50_000,
			maxDepth: 128,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
		},
	};
}

function response(source: string, type = "text/html"): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: "https://reader.invalid/visibility",
		status: 200,
		headers: { "content-type": [`${type}; charset=utf-8`] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function sanitize(
	source: string,
	limits: Partial<ResearchReaderLimits> = {},
	raw?: ResearchReaderRawPolicy,
) {
	return sanitizeResearchHtml(
		source,
		limits,
		undefined,
		undefined,
		raw,
		policy,
	);
}

function load(source: string, type = "text/html") {
	const tree = loadResearchDocument(
		response(source, type),
		context(),
		undefined,
		undefined,
		policy,
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

it("preserves the exact default HTML and report without visibility selection", () => {
	expect(sanitizeResearchHtml.length).toBe(1);
	expect(loadResearchDocument.length).toBe(4);
	const source = '<div hidden>x</div><span aria-hidden="true">y</span>';
	const html = "<div>x</div><span>y</span>";
	const legacy = sanitizeResearchHtml(source);
	expect(legacy).toEqual({
		html,
		report: {
			profile: "native-semantic-reader-v1",
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			sourceCodeUnits: source.length,
			textCodeUnits: 2,
			outputCodeUnits: html.length,
			tokens: 6,
			omittedTokens: 0,
			omittedSubtrees: {},
			ignoredAttributes: 2,
			unwrappedElements: 0,
			tokenizerIssues: 0,
		},
	});
	expect(
		sanitizeResearchHtml(
			source,
			{},
			undefined,
			undefined,
			undefined,
			undefined,
		),
	).toEqual(legacy);
	const tree = loadResearchDocument(response(source), context());
	trees.push(tree);
	expect(researchReaderInfo(tree)).toEqual({
		...legacy.report,
		encoding: "utf-8",
	});
	expect(researchReaderNoticeFor(researchReaderInfo(tree))).toBe(
		researchReaderNotice,
	);
	expect(researchReaderNoticeFor()).toBe(researchReaderNotice);
});

it.each([
	"hidden",
	'hidden=""',
	'hidden="false"',
	'hidden="until-found"',
	'HIDDEN="UNTIL-FOUND"',
	'hidden="invalid"',
	'aria-hidden="true"',
	'ARIA-HIDDEN="TrUe"',
	'aria-hidden="&#116;rue"',
])("omits explicit source hiding from %s", (attribute) => {
	const result = sanitize(`<span ${attribute}>drop</span><p>keep</p>`);
	expect(result.html).toBe("<p>keep</p>");
	expect(result.report).toMatchObject({
		visibilityPolicy: policy,
		sourceHiddenSubtrees: 1,
		hiddenContentSemantics: "source-attributes",
		textCodeUnits: 8,
		omittedSubtrees: { span: 1 },
	});
});

it.each(["false", "FALSE", " true", "true ", "\ttrue\n", "", "1", "yes"])(
	"does not trim or reinterpret the ARIA value %j",
	(value) => {
		const result = sanitize(`<span aria-hidden="${value}">keep</span>`);
		expect(result.html).toBe("<span>keep</span>");
		expect(result.report.sourceHiddenSubtrees).toBe(0);
	},
);

it("keeps CSS-only, inert, role and selection metadata outside the predicate", () => {
	const result = sanitize(
		'<div style="display:none">CONFIG</div><div inert>READABLE</div><p style="visibility:hidden" class="hidden">CSS</p><div role="tabpanel" aria-selected="false">PANEL</div>',
	);
	expect(result.html).toBe(
		'<div>CONFIG</div><div>READABLE</div><p class="hidden">CSS</p><div role="tabpanel">PANEL</div>',
	);
	expect(result.report.sourceHiddenSubtrees).toBe(0);
});

it("retains only the explicitly non-hidden counter digits without inventing values", () => {
	const source =
		'<h3><span aria-hidden="true">2</span><span aria-hidden="false">9</span>%</h3><h3>+<span aria-hidden="true">3</span><span aria-hidden="false">8</span>%</h3>';
	expect(sanitizeResearchHtml(source).html).toBe(
		"<h3><span>2</span><span>9</span>%</h3><h3>+<span>3</span><span>8</span>%</h3>",
	);
	expect(sanitize(source).html).toBe(
		"<h3><span>9</span>%</h3><h3>+<span>8</span>%</h3>",
	);
	expect(sanitize(source).report.sourceHiddenSubtrees).toBe(2);
});

it.each(["div", "form", "details", "button", "x-card", "html"])(
	"omits the complete %s subtree before preservation, remapping or unwrapping",
	(name) => {
		const result = sanitize(
			`<${name} id="anchor" hidden><span aria-hidden="false">drop</span><b hidden>nested</b></${name}><p>keep</p>`,
		);
		expect(result.html).toBe("<p>keep</p>");
		expect(result.report.sourceHiddenSubtrees).toBe(1);
		expect(result.report.omittedSubtrees).toEqual({ [name]: 1 });
	},
);

it.each(["img", "br", "hr", "input", "meta", "base"])(
	"does not swallow siblings of hidden void %s",
	(name) => {
		const result = sanitize(`<${name} hidden alt="drop"><p>keep</p>`);
		expect(result.html).toBe("<p>keep</p>");
		expect(result.report.sourceHiddenSubtrees).toBe(1);
	},
);

it("suppresses hidden metadata and MathML alternatives without bypassing text debits", () => {
	const result = sanitize(
		'<head><meta hidden name="description" content="DROP"><meta name="description" content="KEEP"></head><math hidden alttext="HIDE"><mi>x</mi></math><math alttext="SHOW"/>',
	);
	expect(result.html).toBe(
		'<head><meta name="description" content="KEEP"></head><code>MathML source: SHOW</code>',
	);
	expect(result.report).toMatchObject({
		sourceHiddenSubtrees: 2,
		textCodeUnits: 17,
		mathAlternatives: { elements: 1, codeUnits: 4 },
	});
	const tree = load(
		'<head hidden><meta name="description" content="DROP"></head><h1>keep</h1>',
	);
	expect(extractDocument(tree).sourceDescriptions).toBeUndefined();
});

it.each([
	["<p hidden>drop<p>keep</p>", "<p>keep</p>"],
	["<p hidden>drop<div>keep</div>", "<div>keep</div>"],
	["<div><p hidden>drop</div><p>keep</p>", "<div></div><p>keep</p>"],
	["<ul><li hidden>drop<li>keep</ul>", "<ul><li>keep</ul>"],
	["<ul><li hidden>drop</ul><p>keep</p>", "<ul></ul><p>keep</p>"],
	["<ul><li hidden><p>drop<li>keep</ul>", "<ul><li>keep</ul>"],
	["<div hidden><p>drop<p>also drop</div><p>keep</p>", "<p>keep</p>"],
	[
		"<div hidden><ul><li>drop<li>also drop</ul></div><p>keep</p>",
		"<p>keep</p>",
	],
	["<x-card hidden/>drop</x-card><p>keep</p>", "<p>keep</p>"],
	["<div hidden><span/>drop</span></div><p>keep</p>", "<p>keep</p>"],
	["<svg hidden/><math hidden alttext='drop'/><p>keep</p>", "<p>keep</p>"],
])("handles a bounded source-hidden boundary in %s", (source, html) => {
	expect(sanitize(source).html).toBe(html);
});

it.each([
	"<div hidden><b>drop</div><p>leak</p>",
	"<p hidden><b>drop<p>ambiguous</p>",
	"<ul><li hidden><span>drop<li>ambiguous</ul>",
	"<x-card hidden/>unclosed",
	"<div hidden>unclosed",
	"<svg hidden><p>drop<p>ambiguous</svg>",
])(
	"fails closed rather than claiming full parser recovery for %s",
	(source) => {
		expect(failure(() => sanitize(source))).toMatchObject({
			code: "unsupported",
		});
	},
);

it("does not repair unrelated legacy omitted-subtree parsing", () => {
	const source = "<template><div>drop</template><p>keep</p>";
	const legacy = failure(() => sanitizeResearchHtml(source));
	const selected = failure(() => sanitize(source));
	expect(legacy).toMatchObject({ code: "unsupported" });
	expect(selected).toMatchObject({
		code: "unsupported",
		message: (legacy as Error).message,
	});
});

it("does not interpret encoded examples or plain attribute-looking text", () => {
	const source =
		'<pre><code>&lt;span hidden&gt;example&lt;/span&gt; aria-hidden="true"</code></pre><p>hidden="false"</p>';
	const selected = sanitize(source);
	expect(selected.html).toBe(sanitizeResearchHtml(source).html);
	expect(selected.report.sourceHiddenSubtrees).toBe(0);
});

it.each([
	"script",
	"style",
	"iframe",
	"noembed",
	"noframes",
	"xmp",
	"title",
	"textarea",
])(
	"keeps %s raw strings out of source-hidden boundary detection under either raw policy",
	(name) => {
		const source = `<div hidden><${name}>marker = '</div><span hidden>literal</span>';</${name}></div><p>keep</p>`;
		for (const raw of [undefined, rawPolicy]) {
			const result = sanitize(source, {}, raw);
			expect(result.html).toBe("<p>keep</p>");
			expect(result.report.sourceHiddenSubtrees).toBe(1);
		}
	},
);

it("consumes plaintext literally, including a hidden plaintext remainder", () => {
	const source = '<plaintext><span hidden>literal</span> aria-hidden="true"';
	expect(sanitize(source).html).toBe(sanitizeResearchHtml(source).html);
	expect(sanitize(source).report.sourceHiddenSubtrees).toBe(0);
	const hidden = sanitize("<plaintext hidden><span hidden>literal</span>");
	expect(hidden.html).toBe("");
	expect(hidden.report.sourceHiddenSubtrees).toBe(1);
	expect(hidden.report.textCodeUnits).toBe(
		"<span hidden>literal</span>".length,
	);
	expect(
		failure(() => sanitize("<div hidden><plaintext></div><p>not markup</p>")),
	).toMatchObject({ code: "unsupported" });
});

it.each([
	{ limits: { maxSourceCodeUnits: 1 }, kind: "reader.source" },
	{ limits: { maxTextCodeUnits: 1 }, kind: "reader.text" },
	{ limits: { maxTokens: 1 }, kind: "reader.tokens" },
	{ limits: { maxDepth: 1 }, kind: "reader.depth" },
	{ limits: { maxOutputCodeUnits: 1 }, kind: "reader.output" },
])("retains $kind accounting for hidden source", ({ limits, kind }) => {
	const error = failure(() =>
		sanitize("<div><span hidden>drop</span>keep</div>", limits),
	);
	expect(error).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(error)?.kind).toBe(kind);
});

it.each([
	'<meta hidden name="description" content="long">',
	'<math hidden alttext="long"/>',
	"<title hidden>long</title>",
	'<head hidden><meta name="description" content="long"></head>',
	'<div hidden><math alttext="long"/></div>',
])("still charges suppressed metadata and raw text in %s", (source) => {
	const error = failure(() => sanitize(source, { maxTextCodeUnits: 3 }));
	expect(resourceLimitDiagnostic(error)).toMatchObject({
		kind: "reader.text",
		limit: 3,
		observed: 4,
	});
});

it.each([
	{
		source: "<template hidden><title>&amp;</title></template>",
		codeUnits: 5,
	},
	{
		source: "<div hidden><template><title>&amp;</title></template></div>",
		codeUnits: 5,
	},
	{
		source: "<svg hidden><title>&amp;</title></svg>",
		codeUnits: 5,
	},
	{
		source: "<div hidden><svg><title>&amp;</title></svg></div>",
		codeUnits: 5,
	},
	{
		source: "<div hidden><title>&amp;&amp;</title></div>",
		codeUnits: 2,
	},
	{
		source: '<div hidden><math alttext="L&amp;NG"><mi>x</mi></math></div>',
		codeUnits: 5,
	},
	{
		source:
			'<head hidden><meta name="description" content="L&amp;NG"><title>&amp;</title></head>',
		codeUnits: 5,
	},
	{
		source:
			'<template hidden><math alttext="IGNORED"><mi>x</mi></math><meta name="description" content="IGNORED"><title>&amp;</title></template>',
		codeUnits: 6,
	},
	{
		source:
			'<svg hidden><math alttext="IGNORED"><mi>x</mi></math><meta name="description" content="IGNORED"><title>&amp;</title></svg>',
		codeUnits: 6,
	},
	{
		source:
			'<div hidden><template><math alttext="IGNORED"/><title>&amp;</title></template><title>&amp;</title><math alttext="LONG"/><p>x<p>y</div>',
		codeUnits: 12,
	},
	{
		source:
			'<head hidden><template><meta name="description" content="IGNORED"><math alttext="IGNORED"/><title>&amp;</title></template><meta name="description" content="LONG"><title>&amp;</title></head>',
		codeUnits: 10,
	},
	{
		source:
			"<template hidden><title>&amp;</title></template><title hidden>&amp;</title>",
		codeUnits: 6,
	},
	{
		source:
			"<p hidden><template><title>&amp;</title></template><p hidden><title>&amp;</title></p>",
		codeUnits: 6,
	},
	{
		source:
			"<ul><li hidden><template><title>&amp;</title></template><li hidden><title>&amp;</title></ul>",
		codeUnits: 6,
	},
])(
	"preserves the exact legacy text debit for $source",
	({ source, codeUnits }) => {
		for (const raw of [undefined, rawPolicy]) {
			const limits = { maxTextCodeUnits: codeUnits };
			const legacy = sanitizeResearchHtml(
				source,
				limits,
				undefined,
				undefined,
				raw,
			);
			const selected = sanitize(source, limits, raw);
			expect(legacy.report.textCodeUnits).toBe(codeUnits);
			expect(selected.report.textCodeUnits).toBe(codeUnits);
			expect(selected.html).not.toContain("IGNORED");
			expect(selected.html).not.toContain("LONG");
			for (const maxTextCodeUnits of [1, codeUnits - 1]) {
				const bounded = { maxTextCodeUnits };
				const legacyError = failure(() =>
					sanitizeResearchHtml(source, bounded, undefined, undefined, raw),
				);
				const selectedError = failure(() => sanitize(source, bounded, raw));
				expect(resourceLimitDiagnostic(legacyError)).toMatchObject({
					kind: "reader.text",
					limit: maxTextCodeUnits,
				});
				expect(resourceLimitDiagnostic(selectedError)).toEqual(
					resourceLimitDiagnostic(legacyError),
				);
			}
		}
	},
);

it("keeps omitted raw accounting separate only when independently selected", () => {
	const source = `<script hidden>${"x".repeat(100)}</script><p>y</p>`;
	expect(
		resourceLimitDiagnostic(
			failure(() => sanitize(source, { maxTextCodeUnits: 1 })),
		),
	).toMatchObject({ kind: "reader.text", observed: 100 });
	const result = sanitize(source, { maxTextCodeUnits: 1 }, rawPolicy);
	expect(result.html).toBe("<p>y</p>");
	expect(result.report).toMatchObject({
		rawTextPolicy: rawPolicy,
		visibilityPolicy: policy,
		sourceHiddenSubtrees: 1,
		textCodeUnits: 1,
		omittedRaw: { elements: 1, codeUnits: 100 },
	});
	expect(
		resourceLimitDiagnostic(
			failure(() =>
				sanitize(source, { maxSourceCodeUnits: source.length - 1 }, rawPolicy),
			),
		),
	).toMatchObject({ kind: "reader.source", observed: source.length });
});

it("retains the omitted-raw work limit while filtering source-hidden content", () => {
	vi.spyOn(HtmlTokenizer.prototype, "discardRaw").mockImplementation(
		(_name, debit) => {
			debit(researchReaderRawLimits.maxWorkUnits + 1);
			throw new Error("Expected omitted-work limit");
		},
	);
	const error = failure(() =>
		sanitize("<script hidden>x</script>", {}, rawPolicy),
	);
	expect(resourceLimitDiagnostic(error)).toMatchObject({
		kind: "reader.omitted-work",
		limit: researchReaderRawLimits.maxWorkUnits,
		observed: researchReaderRawLimits.maxWorkUnits + 1,
	});
});

it("reports zero selected omissions and freezes the report and copied subreports", () => {
	const selected = sanitize("<p>keep</p>", {}, rawPolicy);
	expect(selected.report).toMatchObject({
		visibilityPolicy: policy,
		sourceHiddenSubtrees: 0,
		hiddenContentSemantics: "source-attributes",
	});
	expect(Object.isFrozen(selected.report)).toBe(true);
	expect(Object.isFrozen(selected.report.omittedSubtrees)).toBe(true);
	expect(Object.isFrozen(selected.report.omittedRaw)).toBe(true);
	expect(researchReaderNoticeFor(selected.report)).toContain("source-hidden");
	expect(researchReaderNoticeFor(selected.report)).toContain(
		"CSS visibility ignored",
	);
	const tree = load("<p>keep</p>");
	const omissions = { span: 1 };
	setResearchReaderInfo(tree, {
		...selected.report,
		omittedSubtrees: omissions,
	});
	omissions.span = 2;
	expect(researchReaderInfo(tree)?.omittedSubtrees.span).toBe(1);
	expect(Object.isFrozen(researchReaderInfo(tree))).toBe(true);
	expect(Object.isFrozen(researchReaderInfo(tree)?.omittedSubtrees)).toBe(true);
	tree.close();
	expect(researchReaderInfo(tree)).toBeUndefined();
	trees.pop();
});

it.each(["text/plain", "text/markdown", "application/json", "application/xml"])(
	"keeps %s literal with selected provenance but no HTML hiding semantics",
	(type) => {
		const source =
			'<div hidden>literal</div><span aria-hidden="true">text</span>';
		const tree = load(source, type);
		expect(tree.textContent(tree.root)).toBe(source);
		expect(researchReaderInfo(tree)).toMatchObject({
			visibilityPolicy: policy,
			sourceHiddenSubtrees: 0,
			hiddenContentSemantics: false,
			sourceCodeUnits: source.length,
			textCodeUnits: source.length,
		});
		expect(researchReaderNoticeFor(researchReaderInfo(tree))).toBe(
			researchReaderNotice,
		);
	},
);

it.each([null, false, 0, "", "SOURCE-HIDDEN-V1", "source-hidden-v2", {}, []])(
	"rejects invalid visibility selection %j at both boundaries",
	(value) => {
		expect(
			failure(() => validateResearchReaderVisibilityPolicy(value)),
		).toMatchObject({ code: "invalid-input" });
		const invalid = value as ResearchReaderVisibilityPolicy;
		expect(
			failure(() =>
				sanitizeResearchHtml("", {}, undefined, undefined, undefined, invalid),
			),
		).toMatchObject({ code: "invalid-input" });
		expect(
			failure(() =>
				loadResearchDocument(
					response(""),
					context(),
					undefined,
					undefined,
					invalid,
				),
			),
		).toMatchObject({ code: "invalid-input" });
	},
);

it("accepts only the optional policy literal and retains abort checks", () => {
	expect(validateResearchReaderVisibilityPolicy(undefined)).toBeUndefined();
	expect(validateResearchReaderVisibilityPolicy(policy)).toBe(policy);
	const controller = new AbortController();
	controller.abort();
	expect(
		failure(() =>
			sanitizeResearchHtml(
				"<p hidden>x</p>",
				{},
				controller.signal,
				undefined,
				undefined,
				policy,
			),
		),
	).toMatchObject({ code: "aborted" });
	expect(
		failure(() =>
			loadResearchDocument(
				response("<p hidden>x</p>"),
				{ ...context(), signal: controller.signal },
				undefined,
				undefined,
				policy,
			),
		),
	).toMatchObject({ code: "aborted" });
});

it("removes matching content from extraction, heading outlines and link discovery", () => {
	const tree = load(
		'<h1 hidden>DROP heading</h1><x-card aria-hidden="true"><a href="/drop">DROP link</a></x-card><h2>KEEP heading</h2><a href="/keep">KEEP link</a>',
	);
	const extracted = extractDocument(tree);
	expect(extracted.content).not.toContain("DROP");
	expect(extracted.content).toContain("KEEP heading");
	expect(extracted.reader).toEqual(researchReaderInfo(tree));
	expect(
		discoverDocumentHeadings(tree).entries.map((entry) => entry.title),
	).toEqual(["KEEP heading"]);
	expect(
		discoverDocumentLinks(tree, "reader.invalid").entries.map(
			(entry) => entry.url,
		),
	).toEqual(["https://reader.invalid/keep"]);
});
