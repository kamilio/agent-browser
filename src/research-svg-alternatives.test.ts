import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DocumentLimits, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type ExtractedNode,
	discoverDocumentLinks,
	extractDocument,
} from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import {
	type ResearchReaderRawPolicy,
	type ResearchReaderVisibilityPolicy,
	setResearchReaderInfo,
} from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const url = "https://svg-alternatives.fixture.invalid/article";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const rawPolicies = [undefined, "separate-omitted-raw-v1"] as const;
const visibilityPolicies = [
	undefined,
	"source-hidden-v1",
	"source-hidden-inline-v1",
] as const;
const configurations = (["default", "long-v1"] as const).flatMap((profile) =>
	rawPolicies.flatMap((rawPolicy) =>
		visibilityPolicies.map((visibilityPolicy) => ({
			profile,
			rawPolicy,
			visibilityPolicy,
		})),
	),
);
type Configuration = {
	profile: ResearchDocumentProfileId;
	rawPolicy?: ResearchReaderRawPolicy;
	visibilityPolicy?: ResearchReaderVisibilityPolicy;
};
const defaultConfiguration: Configuration = { profile: "default" };

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("SVG alternative tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		for (const query of queries.splice(0)) query.close();
		for (const tree of trees.splice(0)) tree.close();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function metadata(elements: number, codeUnits: number) {
	return {
		elements,
		codeUnits,
		attribute: "aria-label" as const,
		rendered: false as const,
		verified: false as const,
	};
}

function sanitize(
	input: string,
	configuration = defaultConfiguration,
	limits: Partial<ResearchReaderLimits> = {},
) {
	return sanitizeResearchHtml(
		input,
		limits,
		undefined,
		configuration.profile,
		configuration.rawPolicy,
		configuration.visibilityPolicy,
	);
}

function response(input: string): NetworkResponse {
	const body = encoder.encode(input);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function load(
	input: string,
	configuration = defaultConfiguration,
	limits: Partial<DocumentLimits> = {},
	context: Partial<DocumentLoaderContext> = {},
) {
	const tree = loadResearchDocument(
		response(input),
		{
			tabId: "synthetic-svg-alternatives",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 1024,
				maxDepth: 64,
				maxTextCodeUnits: 100_000,
				maxChanges: 1024,
				...limits,
			},
			...context,
		},
		configuration.profile,
		configuration.rawPolicy,
		configuration.visibilityPolicy,
	);
	trees.push(tree);
	return tree;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function json(tree: DocumentTree) {
	const result = extractDocument(tree, { format: "json" });
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return result;
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected bounded rejection");
}

it.each(configurations)(
	"retains the owning anchor without rendering SVG for $profile/$rawPolicy/$visibilityPolicy",
	(configuration) => {
		const input =
			'<a href="/saved?view=all&amp;sort=new"><svg aria-label="Saved &amp; 😀" role="button" tabindex="0" onclick="bad()"><title>PRIVATE_TITLE</title><g><path d="M0 0"/><a href="/private">PRIVATE_LINK</a></g></svg></a>';
		const html =
			'<a href="/saved?view=all&amp;sort=new"><code>SVG source aria-label: Saved &amp; 😀</code></a>';
		const alternative = metadata(1, "Saved & 😀".length);
		const sanitized = sanitize(input, configuration);
		expect(sanitized.html).toBe(html);
		expect(sanitized.report).toMatchObject({
			partial: true,
			scripting: false,
			styling: false,
			sourceCodeUnits: input.length,
			outputCodeUnits: html.length,
			omittedSubtrees: { svg: 1 },
			svgAlternatives: alternative,
		});
		const tree = load(input, configuration);
		const owner = new DocumentQueries(tree);
		queries.push(owner);
		expect(owner.querySelectorAll("a")).toHaveLength(1);
		expect(owner.querySelectorAll("code")).toHaveLength(1);
		expect(
			owner.querySelectorAll(
				"svg, g, path, title, script, button, input, [role], [tabindex], [onclick]",
			),
		).toEqual([]);
		const result = json(tree);
		const links = flattened(result.content).filter(
			(node) => node.type === "link",
		);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			url: "https://svg-alternatives.fixture.invalid/saved?view=all&sort=new",
			children: [
				expect.objectContaining({
					type: "code",
					children: [
						expect.objectContaining({
							type: "text",
							text: "SVG source aria-label: Saved & 😀",
						}),
					],
				}),
			],
		});
		expect(result.reader?.svgAlternatives).toEqual(alternative);
		expect(researchReaderInfo(tree)).toEqual({
			...sanitized.report,
			encoding: "utf-8",
		});
		expect(extractDocument(tree).content).toBe(
			"[` SVG source aria-label: Saved & 😀 `](<https://svg-alternatives.fixture.invalid/saved?view=all&amp;sort=new>)\n",
		);
		expect(
			discoverDocumentLinks(
				tree,
				"svg-alternatives.fixture.invalid",
			).entries.map((entry) => entry.url),
		).toEqual([
			"https://svg-alternatives.fixture.invalid/saved?view=all&sort=new",
		]);
		expect(JSON.stringify(result)).not.toContain("PRIVATE_");
	},
);

it.each([
	{
		encoded: "&amp;&lt;&gt;&quot;",
		decoded: '&<>"',
		escaped: "&amp;&lt;&gt;&quot;",
	},
	{
		encoded: "&#x1f600;e&#769;",
		decoded: "😀e\u0301",
		escaped: "😀e\u0301",
	},
	{ encoded: " &#9;Save&#10; ", decoded: " \tSave\n ", escaped: " \tSave\n " },
	{ encoded: "x\r\ny\rz", decoded: "x\ny\nz", escaped: "x\ny\nz" },
	{ encoded: "x&#13;y", decoded: "x\ry", escaped: "x&#13;y" },
	{
		encoded: "&amp;lt;script&amp;gt;",
		decoded: "&lt;script&gt;",
		escaped: "&amp;lt;script&amp;gt;",
	},
])(
	"preserves decoded whitespace and escapes $encoded exactly once",
	({ encoded, decoded, escaped }) => {
		for (const configuration of configurations) {
			const input = `<svg aria-label="${encoded}"/>`;
			const html = `<code>SVG source aria-label: ${escaped}</code>`;
			const sanitized = sanitize(input, configuration, {
				maxTextCodeUnits: decoded.length,
			});
			expect(sanitized.html).toBe(html);
			expect(sanitized.report).toMatchObject({
				sourceCodeUnits: input.length,
				textCodeUnits: decoded.length,
				outputCodeUnits: html.length,
				tokens: 1,
				omittedTokens: 1,
				omittedSubtrees: { svg: 1 },
				svgAlternatives: metadata(1, decoded.length),
			});
			const error = failure(() =>
				sanitize(input, configuration, {
					maxTextCodeUnits: decoded.length - 1,
				}),
			);
			expect(resourceLimitDiagnostic(error)).toMatchObject({
				kind: "reader.text",
				limit: decoded.length - 1,
				observed: decoded.length,
			});
		}
	},
);

it.each([
	"",
	"aria-label",
	'aria-label=""',
	'aria-label=" \t\r\n "',
	'aria-label="&#32;&#9;&#10;&nbsp;"',
	'title="PRIVATE_ATTRIBUTE"',
	'aria-labelledby="PRIVATE_TITLE"',
	'alt="PRIVATE_ALT" alttext="PRIVATE_MATH"',
	'class="PRIVATE_CLASS" href="/PRIVATE_URL"',
])("does not infer a label from %s or descendants", (attributes) => {
	for (const configuration of configurations) {
		const input = `<p>A<svg ${attributes}><title id="PRIVATE_TITLE">PRIVATE_NAME</title><desc>PRIVATE_DESCRIPTION</desc><text>PRIVATE_TEXT</text><svg aria-label="PRIVATE_NESTED"/></svg>B</p>`;
		const sanitized = sanitize(input, configuration);
		expect(sanitized.html).toBe("<p>AB</p>");
		expect(sanitized.report).not.toHaveProperty("svgAlternatives");
		const tree = load(input, configuration);
		expect(researchReaderInfo(tree)).not.toHaveProperty("svgAlternatives");
		expect(json(tree).reader).not.toHaveProperty("svgAlternatives");
		expect(extractDocument(tree).content).toBe("AB\n");
	}
});

it.each([
	{ attributes: 'aria-label="first" aria-label="second"', value: "first" },
	{ attributes: 'ARIA-LABEL="first" aria-label="second"', value: "first" },
	{ attributes: 'aria-label=" " aria-label="second"', value: undefined },
])(
	"keeps first-wins attribute parsing for $attributes",
	({ attributes, value }) => {
		const sanitized = sanitize(`<SVG ${attributes}/>`);
		expect(sanitized.html).toBe(
			value ? `<code>SVG source aria-label: ${value}</code>` : "",
		);
		expect(sanitized.report.tokenizerIssues).toBe(1);
		if (value)
			expect(sanitized.report.svgAlternatives).toEqual(
				metadata(1, value.length),
			);
		else expect(sanitized.report).not.toHaveProperty("svgAlternatives");
	},
);

it.each(configurations)(
	"keeps adjacent self-closing labels and MathML independent for $profile/$rawPolicy/$visibilityPolicy",
	(configuration) => {
		const math = '<math alttext="x&amp;😀"><mi>G</mi></math>';
		const baseline = sanitize(math, configuration);
		expect(baseline.html).toBe("<code>MathML source: x&amp;😀</code>");
		expect(baseline.report.mathAlternatives).toEqual({
			elements: 1,
			codeUnits: 4,
		});
		expect(baseline.report).not.toHaveProperty("svgAlternatives");
		const input = `<svg aria-label="One"/><svg aria-label="Two"><path/><svg aria-label="PRIVATE_SVG"/><math alttext="PRIVATE_MATH"/></svg>${math}<math alttext="y"><svg aria-label="PRIVATE_FOREIGN"/></math><p>After</p>`;
		const sanitized = sanitize(input, configuration);
		expect(sanitized.html).toBe(
			`<code>SVG source aria-label: One</code><code>SVG source aria-label: Two</code>${baseline.html}<code>MathML source: y</code><p>After</p>`,
		);
		expect(sanitized.report).toMatchObject({
			textCodeUnits: 17,
			omittedSubtrees: { svg: 2, math: 2 },
			svgAlternatives: metadata(2, 6),
			mathAlternatives: { elements: 2, codeUnits: 5 },
		});
	},
);

it.each([
	"svg",
	"math",
	"script",
	"style",
	"template",
	"iframe",
	"object",
	"canvas",
	"textarea",
])("suppresses nested labels beneath omitted %s in every mode", (ancestor) => {
	for (const configuration of configurations) {
		const input = `<${ancestor}><svg aria-label="PRIVATE_LABEL"><path/></svg></${ancestor}><p>After</p>`;
		const sanitized = sanitize(input, configuration);
		expect(sanitized.html).toBe("<p>After</p>");
		expect(sanitized.report.omittedSubtrees).toEqual({ [ancestor]: 1 });
		expect(sanitized.report).not.toHaveProperty("svgAlternatives");
	}
});

it("keeps malicious label markup as code without manufacturing links or controls", () => {
	const payload =
		'</code><a href="/injected">go</a><button>bad</button><script>bad()</script>```';
	const encoded = payload
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
	const input = `<svg aria-label="${encoded}"><foreignObject><button>PRIVATE_CONTROL</button></foreignObject></svg>`;
	const sanitized = sanitize(input);
	expect(sanitized.html).toBe(`<code>SVG source aria-label: ${encoded}</code>`);
	const tree = load(input);
	const owner = new DocumentQueries(tree);
	queries.push(owner);
	expect(
		owner.querySelectorAll("svg, foreignobject, a, button, script"),
	).toEqual([]);
	expect(owner.querySelectorAll("code")).toHaveLength(1);
	expect(
		flattened(json(tree).content)
			.filter((node) => node.type === "text")
			.map((node) => node.text),
	).toEqual([`SVG source aria-label: ${payload}`]);
	expect(extractDocument(tree).content).toBe(
		`\`\`\`\` SVG source aria-label: ${payload} \`\`\`\`\n`,
	);
});

it.each([
	{ attributes: "hidden", ancestor: false, inlineOnly: false },
	{ attributes: 'hidden="false"', ancestor: false, inlineOnly: false },
	{ attributes: 'aria-hidden="TrUe"', ancestor: false, inlineOnly: false },
	{ attributes: 'style="display:none"', ancestor: false, inlineOnly: true },
	{ attributes: "hidden", ancestor: true, inlineOnly: false },
	{ attributes: 'aria-hidden="true"', ancestor: true, inlineOnly: false },
	{ attributes: 'style="display: none"', ancestor: true, inlineOnly: true },
])(
	"applies source hiding and its text debit for $attributes, ancestor=$ancestor",
	({ attributes, ancestor, inlineOnly }) => {
		const label = " \tSave &😀 \n";
		const svg = `<svg ${ancestor ? 'aria-hidden="false"' : attributes} aria-label=" &#9;Save &amp;😀 &#10;"><g>G</g></svg>`;
		const input = `${ancestor ? `<div ${attributes}>${svg}</div>` : svg}<p>After</p>`;
		for (const configuration of configurations) {
			const hidden = inlineOnly
				? configuration.visibilityPolicy === "source-hidden-inline-v1"
				: configuration.visibilityPolicy !== undefined;
			const code = "<code>SVG source aria-label:  \tSave &amp;😀 \n</code>";
			const html = hidden
				? "<p>After</p>"
				: `${ancestor ? `<div>${code}</div>` : code}<p>After</p>`;
			const sanitized = sanitize(input, configuration, {
				maxTextCodeUnits: label.length + 6,
			});
			expect(sanitized.html).toBe(html);
			expect(sanitized.report.textCodeUnits).toBe(label.length + 6);
			if (hidden) {
				expect(sanitized.report.sourceHiddenSubtrees).toBe(1);
				expect(sanitized.report).not.toHaveProperty("svgAlternatives");
			} else {
				expect(sanitized.report.svgAlternatives).toEqual(
					metadata(1, label.length),
				);
				if (!configuration.visibilityPolicy)
					expect(sanitized.report.hiddenContentSemantics).toBe(false);
			}
			const tree = load(input, configuration);
			expect(json(tree).reader).toEqual(researchReaderInfo(tree));
			if (hidden) expect(extractDocument(tree).content).toBe("After\n");
			const error = failure(() =>
				sanitize(input, configuration, { maxTextCodeUnits: label.length + 5 }),
			);
			expect(resourceLimitDiagnostic(error)).toMatchObject({
				kind: "reader.text",
				limit: label.length + 5,
				observed: label.length + 6,
			});
		}
	},
);

it.each(configurations)(
	"does not debit nested foreign labels inside a source-hidden ancestor for $profile/$rawPolicy/$visibilityPolicy",
	(configuration) => {
		const input =
			'<div hidden><svg aria-label="Save"><svg aria-label="PRIVATE_NESTED"/><math alttext="PRIVATE_MATH"/></svg></div><p>After</p>';
		const sanitized = sanitize(input, configuration, { maxTextCodeUnits: 9 });
		expect(sanitized.html).toBe(
			configuration.visibilityPolicy
				? "<p>After</p>"
				: "<div><code>SVG source aria-label: Save</code></div><p>After</p>",
		);
		expect(sanitized.report.textCodeUnits).toBe(9);
		expect(sanitized.report).not.toHaveProperty("mathAlternatives");
		if (configuration.visibilityPolicy)
			expect(sanitized.report).not.toHaveProperty("svgAlternatives");
		else expect(sanitized.report.svgAlternatives).toEqual(metadata(1, 4));
	},
);

it.each([
	'aria-hidden="false"',
	'aria-hidden=" true"',
	'style="visibility:hidden"',
	'class="hidden"',
	"inert",
])("does not expand source-hidden semantics for %s", (attributes) => {
	for (const configuration of configurations) {
		const sanitized = sanitize(
			`<svg ${attributes} aria-label="Save"/>`,
			configuration,
		);
		expect(sanitized.html).toBe("<code>SVG source aria-label: Save</code>");
		expect(sanitized.report.svgAlternatives).toEqual(metadata(1, 4));
	}
});

const boundedSource = '<svg aria-label="😀&amp;"><g>G</g></svg>';
const boundedHtml = "<code>SVG source aria-label: 😀&amp;</code>";
const boundaries = [
	{
		option: "maxSourceCodeUnits",
		kind: "reader.source",
		boundary: boundedSource.length,
	},
	{ option: "maxTextCodeUnits", kind: "reader.text", boundary: 4 },
	{
		option: "maxOutputCodeUnits",
		kind: "reader.output",
		boundary: boundedHtml.length,
	},
	{ option: "maxTokens", kind: "reader.tokens", boundary: 5 },
	{ option: "maxDepth", kind: "reader.depth", boundary: 2 },
] as const;

it.each(
	configurations.flatMap((configuration) =>
		boundaries.map((boundary) => ({ ...configuration, ...boundary })),
	),
)(
	"keeps exact $option bounds for $profile/$rawPolicy/$visibilityPolicy",
	({ option, kind, boundary, ...configuration }) => {
		expect(
			sanitize(boundedSource, configuration, { [option]: boundary }).html,
		).toBe(boundedHtml);
		const error = failure(() =>
			sanitize(boundedSource, configuration, { [option]: boundary - 1 }),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind,
			limit: boundary - 1,
			observed: boundary,
		});
	},
);

it.each(configurations)(
	"shares global text and output budgets with ordinary text and math for $profile/$rawPolicy/$visibilityPolicy",
	(configuration) => {
		const input = '<p>AB<svg aria-label=" cd "/><math alttext="ef"/>G</p>';
		const html =
			"<p>AB<code>SVG source aria-label:  cd </code><code>MathML source: ef</code>G</p>";
		expect(
			sanitize(input, configuration, {
				maxTextCodeUnits: 9,
				maxOutputCodeUnits: html.length,
			}).html,
		).toBe(html);
		for (const [option, kind, boundary] of [
			["maxTextCodeUnits", "reader.text", 9],
			["maxOutputCodeUnits", "reader.output", html.length],
		] as const) {
			const error = failure(() =>
				sanitize(input, configuration, { [option]: boundary - 1 }),
			);
			expect(resourceLimitDiagnostic(error)).toMatchObject({
				kind,
				limit: boundary - 1,
				observed: boundary,
			});
		}
	},
);

it.each(configurations)(
	"charges generated annotation output to document admission for $profile/$rawPolicy/$visibilityPolicy",
	(configuration) => {
		const input = `<svg aria-label="${"&".repeat(20)}"/>`;
		const html = `<code>SVG source aria-label: ${"&amp;".repeat(20)}</code>`;
		expect(input.length).toBeLessThan(html.length);
		const error = failure(() =>
			load(input, configuration, { maxTextCodeUnits: html.length - 1 }),
		);
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "reader.output",
			unit: "code-units",
			limit: html.length - 1,
			observed: html.length,
		});
		const tree = load(input, configuration, { maxTextCodeUnits: html.length });
		expect(researchReaderInfo(tree)?.svgAlternatives).toEqual(metadata(1, 20));
	},
);

it("freezes independent metadata snapshots and removes attached reports on close", () => {
	const sanitized = sanitize(boundedSource);
	const tree = load(boundedSource);
	const attached = researchReaderInfo(tree);
	const alternative = metadata(1, 3);
	for (const report of [sanitized.report, attached, json(tree).reader]) {
		expect(report?.svgAlternatives).toEqual(alternative);
		expect(Object.isFrozen(report)).toBe(true);
		expect(Object.isFrozen(report?.svgAlternatives)).toBe(true);
		expect(Object.isFrozen(report?.omittedSubtrees)).toBe(true);
		expect(() =>
			Object.assign(report?.svgAlternatives ?? {}, { elements: 99 }),
		).toThrow(TypeError);
	}
	const mutable = { ...sanitized.report, svgAlternatives: { ...alternative } };
	setResearchReaderInfo(tree, mutable);
	mutable.svgAlternatives.elements = 99;
	mutable.svgAlternatives.codeUnits = 99;
	expect(researchReaderInfo(tree)?.svgAlternatives).toEqual(alternative);
	expect(researchReaderInfo(tree)?.svgAlternatives).not.toBe(
		mutable.svgAlternatives,
	);
	const owner = new DocumentQueries(tree);
	queries.push(owner);
	const revision = tree.revision;
	expect(json(tree).reader?.svgAlternatives).toEqual(alternative);
	expect(tree.revision).toBe(revision);
	tree.close();
	expect(researchReaderInfo(tree)).toBeUndefined();
	expect(tree.mutationMetrics().closed).toBe(true);
	expect(() => owner.querySelector("code")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(attached?.svgAlternatives).toEqual(alternative);
});

it("closes a partially initialized tree when generated code exceeds document nodes", () => {
	let initialized: DocumentTree | undefined;
	const error = failure(() =>
		load(
			'<svg aria-label="Save"/>',
			defaultConfiguration,
			{ maxNodes: 5 },
			{
				initializeDocument(tree) {
					initialized = tree;
				},
			},
		),
	);
	expect(resourceLimitDiagnostic(error)).toMatchObject({
		kind: "document.nodes",
		limit: 5,
		observed: 6,
	});
	expect(initialized).toBeDefined();
	expect(initialized?.mutationMetrics().closed).toBe(true);
	if (initialized) expect(researchReaderInfo(initialized)).toBeUndefined();
});

it.each(["json", "markdown"] as const)(
	"includes annotation and metadata in exact serialized %s extraction limits",
	(format) => {
		const tree = load(boundedSource);
		const result = extractDocument(tree, { format });
		const bytes = encoder.encode(JSON.stringify(result)).byteLength;
		expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(result);
		const error = failure(() =>
			extractDocument(tree, { format, maxBytes: bytes - 1 }),
		);
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "extraction.output",
			unit: "bytes",
			limit: bytes - 1,
			observed: bytes,
		});
	},
);
