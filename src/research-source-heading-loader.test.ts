import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { type ExtractedNode, extractDocument } from "./extraction.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type { ResearchReaderMimePolicy } from "./research-mime-policy.js";
import type {
	ResearchReaderRawPolicy,
	ResearchReaderVisibilityPolicy,
} from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import type { SourceHeadingPolicy } from "./source-headings.js";

const policy: SourceHeadingPolicy = "source-aria-heading-v1";
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
});

function context(maxTextCodeUnits = 2_000_000): DocumentLoaderContext {
	return {
		tabId: "synthetic-source-heading-reader",
		signal: new AbortController().signal,
		limits: {
			maxNodes: 50_000,
			maxDepth: 128,
			maxTextCodeUnits,
			maxChanges: 1024,
		},
		initializeDocument: (tree) => trees.push(tree),
	};
}

function response(source: string, mime = "text/html"): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: "https://reader.invalid/source-headings",
		status: 200,
		headers: { "content-type": [`${mime}; charset=utf-8`] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function sanitize(
	source: string,
	limits: Partial<ResearchReaderLimits> = {},
	rawPolicy?: ResearchReaderRawPolicy,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
) {
	return sanitizeResearchHtml(
		source,
		limits,
		undefined,
		undefined,
		rawPolicy,
		visibilityPolicy,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		policy,
	);
}

function load(
	source: string,
	mime = "text/html",
	rawPolicy?: ResearchReaderRawPolicy,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
	mimePolicy?: ResearchReaderMimePolicy,
) {
	return loadResearchDocument(
		response(source, mime),
		context(),
		undefined,
		rawPolicy,
		visibilityPolicy,
		mimePolicy,
		undefined,
		policy,
	);
}

function attributes(tree: DocumentTree, selector: string) {
	const queries = new DocumentQueries(tree);
	try {
		const node = queries.querySelector(selector);
		if (node === null) throw new Error(`Missing node: ${selector}`);
		return tree.get(node).attributes;
	} finally {
		queries.close();
	}
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected reader failure");
}

it("leaves disabled sanitizer output, counters and report shape unchanged", () => {
	const source = '<div role="heading" aria-level="7">Visible</div>';
	const legacy = sanitizeResearchHtml(source);
	expect(legacy.html).toBe('<div role="heading">Visible</div>');
	expect(legacy.report.ignoredAttributes).toBe(1);
	expect(legacy.report).not.toHaveProperty("sourceHeadingPolicy");
	expect(
		sanitizeResearchHtml(
			source,
			{},
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		),
	).toEqual(legacy);
	const tree = loadResearchDocument(response(source), context());
	expect(attributes(tree, "div")).not.toHaveProperty("aria-level");
	expect(researchReaderInfo(tree)).toEqual({
		...legacy.report,
		encoding: "utf-8",
	});
	const enabled = sanitize(source);
	expect(enabled.html).toBe(source);
	expect(enabled.report).toEqual({
		...legacy.report,
		sourceHeadingPolicy: policy,
		ignoredAttributes: 0,
		outputCodeUnits: source.length,
	});
	expect(researchReaderInfo(load(source))).toEqual({
		...enabled.report,
		encoding: "utf-8",
	});
	expect(Object.isFrozen(enabled.report)).toBe(true);
});

it.each([
	"div",
	"span",
	"p",
	"section",
	"article",
	"header",
	"footer",
	"main",
	"aside",
	"hgroup",
])("retains authored source heading levels on %s", (tag) => {
	const source = `<${tag} role="heading" aria-level="7">Visible</${tag}>`;
	expect(sanitize(source).html).toBe(source);
	expect(attributes(load(source), tag)["aria-level"]).toBe("7");
});

it("records explicit HTML policy even without source headings and leaves plain defaults alone", () => {
	const source = "<p>Ordinary prose</p>";
	expect(sanitize(source).report.sourceHeadingPolicy).toBe(policy);
	const report = researchReaderInfo(load(source));
	expect(report?.sourceHeadingPolicy).toBe(policy);
	expect(Object.isFrozen(report)).toBe(true);
	const plain = loadResearchDocument(
		response("Ordinary prose", "text/plain"),
		context(),
	);
	expect(researchReaderInfo(plain)).not.toHaveProperty("sourceHeadingPolicy");
});

it.each([
	[undefined, undefined],
	["1", "1"],
	["2", "2"],
	["7", "7"],
	["2147483647", "2147483647"],
	[" \t\n\f\r7 \t", " \t\n\f\n7 \t"],
	[`${" ".repeat(63)}1`, `${" ".repeat(63)}1`],
	[`${" ".repeat(64)}1`, undefined],
	["", ""],
	[" ", " "],
	["0", "0"],
	["01", "01"],
	["+1", "+1"],
	["-1", "-1"],
	["1.0", "1.0"],
	["1e2", "1e2"],
	["1 2", "1 2"],
	["2147483648", "2147483648"],
	["999999999999999999999", "999999999999999999999"],
	["\u00a02\u00a0", "\u00a02\u00a0"],
	["\u000b2", "\u000b2"],
	["two", "two"],
])("keeps bounded authored level spelling %j", (level, retained) => {
	const attribute = level === undefined ? "" : ` aria-level="${level}"`;
	const source = `<div role="heading"${attribute}>Visible</div>`;
	const oversized = level !== undefined && level.length > 64;
	const result = sanitize(source);
	expect(result.html).toBe(
		oversized
			? "<div>Visible</div>"
			: `<div role="heading"${retained === undefined ? "" : ` aria-level="${retained}"`}>Visible</div>`,
	);
	expect(result.report.ignoredAttributes).toBe(oversized ? 2 : 0);
	expect(attributes(load(source), "div")["aria-level"]).toBe(retained);
});

it.each(["", "0", "1.5", "2147483648", "9".repeat(65), `${" ".repeat(64)}2`])(
	"does not reinterpret malformed loaded level %j as missing level 2",
	(level) => {
		const source = `<div id="invalid" role="heading" aria-level="${level}">Ordinary prose</div><div id="missing" role="heading">Missing level</div>`;
		const tree = load(source);
		const invalid = attributes(tree, "#invalid");
		if (level.length <= 64) {
			expect(invalid.role).toBe("heading");
			expect(invalid["aria-level"]).toBe(level);
		} else {
			expect(invalid).not.toHaveProperty("role");
			expect(invalid).not.toHaveProperty("aria-level");
		}
		const result = extractDocument(tree, {
			sourceHeadingPolicy: policy,
			format: "json",
		});
		if (result.format !== "json") throw new Error("Expected JSON extraction");
		const pending = [result.content];
		const headings: ExtractedNode[] = [];
		while (pending.length) {
			const node = pending.pop();
			if (!node) break;
			if (node.type === "heading") headings.push(node);
			pending.push(...(node.children ?? []));
		}
		expect(headings).toHaveLength(1);
		expect(headings[0]).toMatchObject({
			level: 2,
			sourceHeading: {
				policy,
				level: 2,
				levelBasis: "missing-level-default",
			},
		});
		const markdown = extractDocument(tree, { sourceHeadingPolicy: policy });
		expect(markdown.content).toContain("Ordinary prose");
		expect(markdown.content).not.toContain("## Ordinary prose");
		expect(markdown.content).toContain("## Missing level");
		expect(sanitizeResearchHtml(source).html).toBe(
			'<div id="invalid" role="heading">Ordinary prose</div><div id="missing" role="heading">Missing level</div>',
		);
	},
);

it.each([
	["div", "button"],
	["div", "heading button"],
	["div", `${" ".repeat(58)}heading`],
	["nav", "heading"],
	["h2", "heading"],
])("leaves oversized-level noncandidate %s role %j unchanged", (tag, role) => {
	const source = `<${tag} role="${role}" aria-level="${"9".repeat(65)}">Visible</${tag}>`;
	const legacy = sanitizeResearchHtml(source);
	const enabled = sanitize(source);
	expect(enabled.html).toBe(legacy.html);
	expect(enabled.report).toEqual({
		...legacy.report,
		sourceHeadingPolicy: policy,
	});
	expect(attributes(load(source), tag).role).toBe(role);
});

it.each([
	["heading", true],
	["\theading\n", true],
	["HeAdInG", false],
	[`${" ".repeat(57)}heading`, true],
	[`${" ".repeat(58)}heading`, false],
	["heading button", false],
	["button heading", false],
	["heading heading", false],
	["\u00a0heading", false],
	["button", false],
	["", false],
])("requires a bounded single heading role %j", (role, retained) => {
	const source = `<div role="${role}" aria-level="3">Visible</div>`;
	expect(sanitize(source).html).toContain(`role="${role}"`);
	expect(sanitize(source).html.includes("aria-level")).toBe(retained);
	expect(attributes(load(source), "div")["aria-level"]).toBe(
		retained ? "3" : undefined,
	);
});

it("does not invent levels, inherit roles, promote replacements or override native headings", () => {
	const source =
		'<div role="heading"><span aria-level="4">Child</span></div><p aria-level="5">Plain</p><form role="heading" aria-level="6">Inert</form><h2 role="heading" aria-level="9">Native</h2><nav role="heading" aria-level="3">Navigation</nav>';
	const result = sanitize(source);
	expect(result.html).not.toContain("aria-level");
	expect(result.html).not.toContain("<form");
	expect(result.html).toContain('<h2 role="heading">Native</h2>');
	const tree = load(source);
	for (const selector of ["div", "span", "p", "h2", "nav"])
		expect(attributes(tree, selector)).not.toHaveProperty("aria-level");
	expect(tree.textContent(tree.root)).toContain("Native");
});

it("preserves decoded authored spelling without synthesizing label text", () => {
	const source =
		'<DIV ROLE=" heading " ARIA-LEVEL="&#32;7&#32;" aria-label="Synthetic private label" aria-labelledby="missing">Visible title</DIV>';
	const result = sanitize(source);
	expect(result.html).toBe(
		'<div role=" heading " aria-level=" 7 " aria-label="Synthetic private label" aria-labelledby="missing">Visible title</div>',
	);
	const tree = load(source);
	expect(attributes(tree, "div")).toMatchObject({
		role: " heading ",
		"aria-level": " 7 ",
		"aria-label": "Synthetic private label",
		"aria-labelledby": "missing",
	});
	expect(tree.textContent(tree.root)).toBe("Visible title");
	expect(extractDocument(tree).content).not.toContain(
		"Synthetic private label",
	);
});

it.each([undefined, "source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"respects raw, namespace, template and visibility behavior with %j",
	(visibilityPolicy) => {
		const source =
			'<script>throw new Error("never execute");</script><style>.hidden{display:none}</style><svg><foreignObject><div role="heading" aria-level="3">SVG omitted</div></foreignObject></svg><math><mtext><div role="heading" aria-level="4">Math omitted</div></mtext></math><template><div role="heading" aria-level="5">Template omitted</div></template><div hidden role="heading" aria-level="6">Hidden</div><div style="display:none" role="heading" aria-level="7">Inline</div><div role="heading" aria-level="8">Visible</div>';
		const rawPolicy = "separate-omitted-raw-v1";
		const result = sanitize(source, {}, rawPolicy, visibilityPolicy);
		expect(result.html).not.toMatch(
			/never execute|SVG omitted|Math omitted|Template omitted/,
		);
		expect(result.html.includes('aria-level="6"')).toBe(!visibilityPolicy);
		expect(result.html.includes('aria-level="7"')).toBe(
			visibilityPolicy !== "source-hidden-inline-v1",
		);
		expect(result.html).toContain('aria-level="8"');
		expect(result.report).toMatchObject({
			sourceHeadingPolicy: policy,
			rawTextPolicy: rawPolicy,
			scripting: false,
			styling: false,
		});
		const tree = load(source, "text/html", rawPolicy, visibilityPolicy);
		expect(researchReaderInfo(tree)).toEqual({
			...result.report,
			encoding: "utf-8",
		});
		expect(tree.textContent(tree.root)).not.toMatch(/never execute|omitted/);
	},
);

it("accepts explicitly interpreted HTML and retains MIME and fallback provenance", () => {
	const source =
		'<!doctype html><html><body><div role="heading" aria-level="7">Visible</div></body></html>';
	const tree = loadResearchDocument(
		response(source, "text/markdown"),
		context(),
		undefined,
		undefined,
		undefined,
		"markdown-html-document-v1",
		"utf-8",
		policy,
	);
	expect(attributes(tree, "div")["aria-level"]).toBe("7");
	expect(researchReaderInfo(tree)).toMatchObject({
		sourceHeadingPolicy: policy,
		fallbackEncoding: "utf-8",
		mimePolicy: "markdown-html-document-v1",
		mimeInterpretation: {
			declaredMime: "text/markdown",
			effectiveMime: "text/html",
		},
	});
});

it.each([
	"text/plain",
	"text/markdown",
	"application/json",
	"application/xhtml+xml",
])(
	"rejects explicit source heading policy on non-effective HTML %s",
	(mime) => {
		expect(failure(() => load("Plain source", mime))).toMatchObject({
			code: "unsupported",
		});
		expect(trees).toHaveLength(0);
	},
);

it("does not mistake a MIME policy or HTML-looking markdown for effective HTML", () => {
	for (const [source, mimePolicy] of [
		["# Plain markdown", "markdown-html-document-v1"],
		["<!doctype html><html><body>HTML</body></html>", undefined],
	] as const)
		expect(
			failure(() =>
				load(source, "text/markdown", undefined, undefined, mimePolicy),
			),
		).toMatchObject({ code: "unsupported" });
	expect(trees).toHaveLength(0);
});

it.each(["unknown", "", null, false, 1, {}])(
	"rejects invalid policy %j before source processing or document initialization",
	(value) => {
		const invalid = value as SourceHeadingPolicy;
		const next = vi.spyOn(HtmlTokenizer.prototype, "next");
		const controller = new AbortController();
		controller.abort();
		expect(
			failure(() =>
				sanitizeResearchHtml(
					"<p>Source</p>",
					{},
					controller.signal,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					invalid,
				),
			),
		).toMatchObject({ code: "invalid-input" });
		const original = response("Source");
		const input = {
			...original,
			get body() {
				return original.body;
			},
		};
		const body = vi.spyOn(input, "body", "get").mockImplementation(() => {
			throw new Error("Unexpected body access");
		});
		expect(
			failure(() =>
				loadResearchDocument(
					input,
					context(),
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					invalid,
				),
			),
		).toMatchObject({ code: "invalid-input" });
		expect(next).not.toHaveBeenCalled();
		expect(body).not.toHaveBeenCalled();
		expect(trees).toHaveLength(0);
	},
);

it("charges retained attributes to sanitizer and loader output budgets", () => {
	const source = "<div role=heading aria-level=2>x</div>";
	const legacy = sanitizeResearchHtml(source);
	const enabled = sanitize(source);
	expect(enabled.report.outputCodeUnits).toBe(enabled.html.length);
	expect(enabled.report.textCodeUnits).toBe(legacy.report.textCodeUnits);
	expect(enabled.report.tokens).toBe(legacy.report.tokens);
	expect(
		sanitize(source, { maxOutputCodeUnits: enabled.html.length }).html,
	).toBe(enabled.html);
	const error = failure(() =>
		sanitize(source, { maxOutputCodeUnits: enabled.html.length - 1 }),
	);
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "reader.output",
		unit: "code-units",
		limit: enabled.html.length - 1,
		observed: enabled.html.length,
	});
	loadResearchDocument(response(source), context(source.length));
	const loadError = failure(() =>
		loadResearchDocument(
			response(source),
			context(source.length),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			policy,
		),
	);
	expect(resourceLimitDiagnostic(loadError)).toMatchObject({
		kind: "reader.output",
		limit: source.length,
	});
});
