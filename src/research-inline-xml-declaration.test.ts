import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { extractDocument } from "./extraction.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import type { NetworkResponse } from "./network.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type {
	ResearchReaderRawPolicy,
	ResearchReaderVisibilityPolicy,
} from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";

const declaration = '<?xml version="1.0"?>';
const footerDeclaration = '<?xml version="1.0" encoding="iso-8859-1"?>';
const encoder = new TextEncoder();
const context: DocumentLoaderContext = {
	tabId: "synthetic-inline-xml-declaration",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};

function response(source: string): NetworkResponse {
	const body = encoder.encode(source);
	return {
		url: "https://reader.invalid/inline-xml-declaration",
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function failure(action: () => unknown) {
	try {
		action();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		if (!(error instanceof AgentBrowserError)) throw error;
		return error;
	}
	throw new Error("Expected synthetic inline XML declaration failure");
}

function expectOmission(
	source: string,
	baselineSource: string,
	count: number,
	rawPolicy?: ResearchReaderRawPolicy,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
	rawWorkIncrease = 0,
) {
	const sanitize = (html: string) =>
		sanitizeResearchHtml(
			html,
			{},
			undefined,
			undefined,
			rawPolicy,
			visibilityPolicy,
		);
	const baseline = sanitize(baselineSource);
	const sanitized = sanitize(source);
	if (rawWorkIncrease) expect(baseline.report.omittedRaw).toBeDefined();
	expect(sanitized.html).toBe(baseline.html);
	expect(sanitized.report).toEqual({
		...baseline.report,
		sourceCodeUnits: source.length,
		tokens: baseline.report.tokens + count,
		omittedTokens: baseline.report.omittedTokens + count,
		tokenizerIssues: baseline.report.tokenizerIssues + count,
		...(rawWorkIncrease && baseline.report.omittedRaw
			? {
					omittedRaw: {
						...baseline.report.omittedRaw,
						workUnits: baseline.report.omittedRaw.workUnits + rawWorkIncrease,
					},
				}
			: {}),
	});
	return sanitized;
}

it.each([
	{ name: "whitespace", prefix: " \t\r\n" },
	{ name: "comment", prefix: "<!--before-->" },
	{ name: "doctype", prefix: "<!doctype html>" },
	{ name: "text", prefix: "Before &amp; after" },
	{ name: "empty processing marker", prefix: "<?>" },
	{ name: "long ASCII prefix", prefix: `<p>${"before ".repeat(1024)}</p>` },
	{ name: "supplementary prefix", prefix: `<p>${"😀".repeat(256)}</p>` },
	{
		name: "mixed normalized prefix",
		prefix: "\r\n<!--😀-->\r<!doctype html>\r\n<p>Before</p>",
	},
])(
	"omits inline XML after $name without changing other accounting",
	({ prefix }) => {
		const suffix = "<p>Useful body text</p>";
		expectOmission(`${prefix}${declaration}${suffix}`, `${prefix}${suffix}`, 1);
	},
);

it("keeps repeated inline declarations and empty markers individually accounted", () => {
	const secondDeclaration = "<?xml version='1.1' standalone='no'?>";
	const source = `<p>Before${declaration}<?>${secondDeclaration}After</p>`;
	const sanitized = sanitizeResearchHtml(source);
	expect(sanitized.html).toBe("<p>BeforeAfter</p>");
	expect(sanitized.report).toMatchObject({
		sourceCodeUnits: source.length,
		tokens: 7,
		omittedTokens: 3,
		tokenizerIssues: 3,
		textCodeUnits: 11,
		outputCodeUnits: 18,
	});
});

it.each([false, true])(
	"charges split-text inline tokens exactly with hidden=%s",
	(hidden) => {
		const opening = hidden ? "<main><p hidden>" : "<main><p>";
		const source = `${opening}Before${declaration}After</p></main>`;
		const baselineSource = `${opening}BeforeAfter</p></main>`;
		const sanitize = (html: string, maxTokens = 100) =>
			sanitizeResearchHtml(
				html,
				{ maxTokens },
				undefined,
				undefined,
				undefined,
				"source-hidden-v1",
			);
		const baseline = sanitize(baselineSource);
		const sanitized = sanitize(source, 7);
		expect(baseline.report.tokens).toBe(5);
		expect(baseline.report.omittedTokens).toBe(hidden ? 3 : 0);
		expect(sanitized.html).toBe(
			hidden ? "<main></main>" : "<main><p>BeforeAfter</p></main>",
		);
		expect(sanitized.report).toEqual({
			...baseline.report,
			sourceCodeUnits: source.length,
			tokens: baseline.report.tokens + 2,
			omittedTokens: baseline.report.omittedTokens + (hidden ? 2 : 1),
			tokenizerIssues: baseline.report.tokenizerIssues + 1,
		});
		const error = failure(() => sanitize(source, 6));
		expect(error.code).toBe("resource-limit");
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "reader.tokens",
			unit: "tokens",
			limit: 6,
			observed: 7,
		});
	},
);

it.each([255, 256, 257])(
	"measures a %i-unit declaration relative to its nonzero token start",
	(length) => {
		const prefix = `<p>${"😀".repeat(160)}</p>`;
		const local = `<?xml version="1.0"${" ".repeat(length - declaration.length)}?>`;
		const suffix = "<p>After</p>";
		expect(prefix.length).toBeGreaterThan(256);
		expect(local.length).toBe(length);
		if (length <= 256) {
			expectOmission(`${prefix}${local}${suffix}`, `${prefix}${suffix}`, 1);
		} else {
			const error = failure(() =>
				sanitizeResearchHtml(`${prefix}${local}${suffix}`),
			);
			expect(error.code).toBe("unsupported");
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		}
	},
);

it.each([256, 257])(
	"uses the normalized local cap of %i units but charges original CRLF source",
	(length) => {
		const prefix = "<!--😀-->\r\n<p>Before</p>\r\n";
		const local = `<?xml version="1.0"${" ".repeat(length - declaration.length - 1)}\r\n?>`;
		const suffix = "<p>After</p>";
		const source = `${prefix}${local}${suffix}`;
		expect(local.length).toBe(length + 1);
		expect(local.replace(/\r\n?/g, "\n").length).toBe(length);
		if (length === 257) {
			expect(() => sanitizeResearchHtml(source)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
			return;
		}
		const sanitized = expectOmission(source, `${prefix}${suffix}`, 1);
		expect(
			sanitizeResearchHtml(source, { maxSourceCodeUnits: source.length }),
		).toEqual(sanitized);
		const error = failure(() =>
			sanitizeResearchHtml(source, { maxSourceCodeUnits: source.length - 1 }),
		);
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "reader.source",
			unit: "code-units",
			limit: source.length - 1,
			observed: source.length,
		});
	},
);

it("retains the native bogus-comment token and absolute UTF-16 position", () => {
	const prefix = "😀 before";
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer(
		`${prefix}${declaration}<p>After</p>`,
		(issue) => issues.push(issue),
	);
	expect(tokenizer.next()).toEqual({ kind: "text", data: prefix });
	expect(tokenizer.position).toBe(prefix.length);
	expect(tokenizer.next()).toEqual({
		kind: "comment",
		data: 'xml version="1.0"?',
	});
	expect(tokenizer.position).toBe(prefix.length + declaration.length);
	expect(tokenizer.issueCount).toBe(1);
	expect(issues).toEqual(["bogus-declaration"]);
	expect(tokenizer.next()).toMatchObject({ kind: "start", name: "p" });
});

const rawPolicies = [undefined, "separate-omitted-raw-v1"] as const;
const visibilityPolicies = [
	undefined,
	"source-hidden-v1",
	"source-hidden-inline-v1",
] as const;
const policies = rawPolicies.flatMap((rawPolicy) =>
	visibilityPolicies.map((visibilityPolicy) => ({
		name: `${rawPolicy ?? "legacy-raw"}/${visibilityPolicy ?? "legacy-visibility"}`,
		rawPolicy,
		visibilityPolicy,
	})),
);

it.each(policies)(
	"keeps inline declarations inert inside omitted subtrees under $name",
	({ rawPolicy, visibilityPolicy }) => {
		const fixture = (xml: string) =>
			`<main><p>Visible before</p><svg><g>${xml}<path d="M0 0"/></g></svg><template><p>Template before</p>${xml}<p>Template after</p></template><section hidden><p>Hidden before</p>${xml}<template>${xml}<p>Nested template</p></template><p>Hidden after</p></section><section aria-hidden="true">${xml}<p>Aria hidden</p></section><section style="display:none">${xml}<p>Inline hidden</p></section><script>raw payload</script><p>Visible after</p></main>`;
		const source = fixture(declaration);
		const sanitized = expectOmission(
			source,
			fixture(""),
			6,
			rawPolicy,
			visibilityPolicy,
		);
		const tree = loadResearchDocument(
			response(source),
			context,
			undefined,
			rawPolicy,
			visibilityPolicy,
		);
		try {
			const extracted = extractDocument(tree);
			if (extracted.format !== "markdown")
				throw new Error("Expected Markdown extraction");
			const content = extracted.content;
			expect(content).toContain("Visible before");
			expect(content).toContain("Visible after");
			expect(content).not.toMatch(
				/Template before|Template after|Nested template/,
			);
			expect(content).not.toMatch(/raw payload|<\?xml/);
			for (const text of ["Hidden before", "Hidden after", "Aria hidden"])
				expect(content.includes(text)).toBe(!visibilityPolicy);
			expect(content.includes("Inline hidden")).toBe(
				visibilityPolicy !== "source-hidden-inline-v1",
			);
			expect(researchReaderInfo(tree)).toMatchObject(sanitized.report);
		} finally {
			tree.close();
		}
	},
);

it.each([
	{ opening: "<template>", visibilityPolicy: undefined },
	{ opening: "<section hidden>", visibilityPolicy: "source-hidden-v1" },
	{
		opening: '<section style="display:none">',
		visibilityPolicy: "source-hidden-inline-v1",
	},
] as const)(
	"does not let an inline declaration escape $opening with an ancestor end tag",
	({ opening, visibilityPolicy }) => {
		expect(() =>
			sanitizeResearchHtml(
				`<main>${opening}${declaration}</main><p>Must not escape</p>`,
				{},
				undefined,
				undefined,
				"separate-omitted-raw-v1",
				visibilityPolicy,
			),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);

it.each([
	"<?xml?>",
	'<?XML version="1.0"?>',
	'<?xml version="1.2"?>',
	'<?xml version="1.0">',
	'<?xml version="1.0"?',
	`<?xml version="1.0'?>`,
	'<?xml version="1.0"??>',
	'<?xml version="1.0"encoding="UTF-8"?>',
	'<?xml encoding="UTF-8" version="1.0"?>',
	'<?xml version="1.0" standalone="yes" encoding="UTF-8"?>',
	'<?xml version="1.0" version="1.1"?>',
	'<?xml version="1.0" encoding="8UTF"?>',
	'<?xml version="1.0" encoding="UTF>8"?>',
	'<?xml version="1.0" custom="value"?>',
	'<?xml version="1.0" standalone="YES"?>',
	'<?xml version="1.&#48;"?>',
	'<?xml\fversion="1.0"?>',
	'<?xml version="1.0" encoding="UTF\0"?>',
	'<?xml-stylesheet href="unresolved.xsl"?>',
	"<?target data?>",
	"<!unknown>",
	"<![CDATA[ambiguous]]>",
])("still rejects malformed or unknown inline declarations: %j", (invalid) => {
	const source = `<main><p>Before</p>${declaration}${invalid}<p>After</p></main>`;
	const error = failure(() => sanitizeResearchHtml(source));
	expect(error.code).toBe("unsupported");
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
});

it.each([
	{ opening: "<svg>", invalid: "<![CDATA[ambiguous]]>" },
	{ opening: "<template>", invalid: '<?xml version="1.0">' },
	{ opening: "<section hidden>", invalid: "<?target data?>" },
	{
		opening: '<section style="display:none">',
		invalid: '<?xml version="1.0" custom="value"?>',
	},
])("still rejects $invalid inside $opening", ({ opening, invalid }) => {
	expect(() =>
		sanitizeResearchHtml(
			`<main>${opening}${declaration}${invalid}`,
			{},
			undefined,
			undefined,
			"separate-omitted-raw-v1",
			"source-hidden-inline-v1",
		),
	).toThrow(
		expect.objectContaining({
			code: "unsupported",
			message: "Malformed reader input",
		}),
	);
});

it.each(rawPolicies)(
	"does not reinterpret raw, RCDATA, or escaped XML text under %s",
	(rawPolicy) => {
		const escaped = "&lt;?xml version=&quot;1.0&quot;?&gt;";
		const prefix = `<script>${declaration}<?target data?></script><style>${declaration}</style><iframe>${declaration}</iframe><textarea>${declaration}</textarea><title>${declaration}</title><xmp>${declaration}</xmp><p>${escaped}</p>`;
		const suffix = "<p>After</p>";
		const sanitized = expectOmission(
			`${prefix}${declaration}${suffix}`,
			`${prefix}${suffix}`,
			1,
			rawPolicy,
			undefined,
			rawPolicy ? 3 * declaration.length : 0,
		);
		expect(sanitized.html).toBe(
			`<title>${escaped}</title><pre>${escaped}</pre><p>${escaped}</p>${suffix}`,
		);
		expect(sanitized.report.tokenizerIssues).toBe(1);
	},
);

it("extracts UTF-8 body text around a late iso-8859-1 declaration before footer SVG", () => {
	const text = "Repairable laptop — 日本語, café and 😀";
	const prefix = `<!doctype html><html><head><title>Hardware guide</title></head><body><main><h1>${text}</h1><p>${"Useful hardware details. ".repeat(256)}</p></main><footer>`;
	const suffix =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg><p>Footer support information</p></footer></body></html>';
	const source = `${prefix}${footerDeclaration}${suffix}`;
	expect(source.indexOf(footerDeclaration)).toBeGreaterThan(4096);
	const sanitized = expectOmission(source, `${prefix}${suffix}`, 1);
	const tree = loadResearchDocument(response(source), context);
	try {
		const extracted = extractDocument(tree);
		if (extracted.format !== "markdown")
			throw new Error("Expected Markdown extraction");
		expect(extracted.title).toBe("Hardware guide");
		expect(extracted.content).toContain(text);
		expect(extracted.content).toContain("Useful hardware details\\.");
		expect(extracted.content).toContain("Footer support information");
		expect(extracted.content).not.toMatch(/<\?xml|iso-8859-1|<svg|<path/);
		expect(tree.textContent(tree.root)).toContain(text);
		expect(tree.textContent(tree.root)).toContain("Useful hardware details.");
		expect(researchReaderInfo(tree)).toMatchObject({
			...sanitized.report,
			encoding: "utf-8",
			omittedSubtrees: { svg: 1 },
		});
	} finally {
		tree.close();
	}
});

const budgetSource = `<p>${declaration}日😀&amp;</p>`;
const budgetOutput = "<p>日😀&amp;</p>";
it.each([
	{
		option: "maxSourceCodeUnits",
		kind: "reader.source",
		unit: "code-units",
		observed: budgetSource.length,
	},
	{ option: "maxTokens", kind: "reader.tokens", unit: "tokens", observed: 4 },
	{
		option: "maxTextCodeUnits",
		kind: "reader.text",
		unit: "code-units",
		observed: 4,
	},
	{
		option: "maxOutputCodeUnits",
		kind: "reader.output",
		unit: "code-units",
		observed: budgetOutput.length,
	},
])(
	"preserves exact inline $kind boundaries",
	({ option, kind, unit, observed }) => {
		expect(
			sanitizeResearchHtml(budgetSource, { [option]: observed }).html,
		).toBe(budgetOutput);
		const error = failure(() =>
			sanitizeResearchHtml(budgetSource, { [option]: observed - 1 }),
		);
		expect(error.code).toBe("resource-limit");
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind,
			unit,
			limit: observed - 1,
			observed,
		});
	},
);
