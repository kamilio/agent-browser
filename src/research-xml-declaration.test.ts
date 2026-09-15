import { describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { extractDocument } from "./extraction.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";

const declaration = '<?xml version="1.0"?>';
const encoder = new TextEncoder();
const context: DocumentLoaderContext = {
	tabId: "synthetic-xml-declaration",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};

function response(
	source: string | Uint8Array,
	contentType = "text/html; charset=utf-8",
): NetworkResponse {
	const body = typeof source === "string" ? encoder.encode(source) : source;
	return {
		url: "https://reader.invalid/xml-declaration",
		status: 200,
		headers: { "content-type": [contentType] },
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
	throw new Error("Expected synthetic XML declaration failure");
}

const acceptedDeclarations = [
	'<?xml version="1.0"?>',
	"<?xml version='1.0'?>",
	'<?xml version="1.1"?>',
	"<?xml version='1.1'?>",
	'<?xml version="1.0" encoding="UTF-8"?>',
	"<?xml version='1.0' encoding='Shift_JIS'?>",
	'<?xml version="1.0" standalone="yes"?>',
	"<?xml version='1.1' standalone='no'?>",
	'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
	`<?xml version='1.1' encoding="utf-8" standalone='no'?>`,
	'<?xml\tversion \t=\t "1.0"\tencoding = "UTF-8"\tstandalone = "yes" \t?>',
	"<?xml\r\nversion\r=\n'1.1'\r\nencoding='UTF-8'\rstandalone='no'\r\n?>",
	'<?xml version="1.0" encoding="A0._-z"?>',
	'<?xml version="1.0" encoding="Unknown-But-Inert"?>',
];

it.each(acceptedDeclarations)(
	"omits a complete leading XML declaration without hiding its issue: %j",
	(sourceDeclaration) => {
		const body = "<!doctype html><p>日本語 &amp; café</p>";
		const baseline = sanitizeResearchHtml(body);
		const sanitized = sanitizeResearchHtml(`${sourceDeclaration}${body}`);
		expect(sanitized.html).toBe(baseline.html);
		expect(sanitized.report).toEqual({
			...baseline.report,
			sourceCodeUnits:
				baseline.report.sourceCodeUnits + sourceDeclaration.length,
			tokens: baseline.report.tokens + 1,
			omittedTokens: baseline.report.omittedTokens + 1,
			tokenizerIssues: baseline.report.tokenizerIssues + 1,
		});
	},
);

const rejectedDeclarations = [
	"<?xml?>",
	"<?xml ?>",
	'<?XML version="1.0"?>',
	'<?Xml version="1.0"?>',
	'<?xmlversion="1.0"?>',
	'<?xml Version="1.0"?>',
	'<?xml version="1"?>',
	'<?xml version="1.2"?>',
	'<?xml version="2.0"?>',
	'<?xml version=" 1.0"?>',
	'<?xml version="1.0 "?>',
	"<?xml version=1.0?>",
	`<?xml version="1.0'?>`,
	`<?xml version='1.0"?>`,
	'<?xml version="1.0" encoding="UTF-8\'?>',
	'<?xml version="1.0" standalone="yes\'?>',
	'<?xml version="1.0"',
	'<?xml version="1.0"?',
	'<?xml version="1.0">',
	'<?xml version="1.0"/?>',
	'<?xml version="1.0"? >',
	'<?xml version="1.0"??>',
	'<?xml version="1.0"encoding="UTF-8"?>',
	'<?xml version="1.0" encoding="UTF-8"standalone="yes"?>',
	'<?xml encoding="UTF-8"?>',
	'<?xml encoding="UTF-8" version="1.0"?>',
	'<?xml version="1.0" standalone="yes" encoding="UTF-8"?>',
	'<?xml version="1.0" version="1.1"?>',
	'<?xml version="1.0" encoding="UTF-8" encoding="UTF-8"?>',
	'<?xml version="1.0" standalone="yes" standalone="no"?>',
	'<?xml version="1.0" custom="value"?>',
	'<?xml version="1.0" Encoding="UTF-8"?>',
	'<?xml version="1.0" Standalone="yes"?>',
	'<?xml version="1.0" encoding=""?>',
	'<?xml version="1.0" encoding="8UTF"?>',
	'<?xml version="1.0" encoding="_UTF"?>',
	'<?xml version="1.0" encoding="UTF 8"?>',
	'<?xml version="1.0" encoding="UTF:8"?>',
	'<?xml version="1.0" encoding="é"?>',
	'<?xml version="1.0" standalone="YES"?>',
	'<?xml version="1.0" standalone="true"?>',
	'<?xml version="1.0" standalone=""?>',
	'<?xml version="1.&#48;"?>',
	'<?xml version="1.0" encoding="UTF&#45;8"?>',
	'<?xml version="1.0" standalone="y&#101;s"?>',
	'<?xml version="1.0" encoding="UTF<8"?>',
	'<?xml version="1.0" encoding="UTF>8"?>',
	'<?xml version="1.0" encoding="UTF&8"?>',
	'<?xml version="1.0" encoding="UTF\0"?>',
	'<?xml\fversion="1.0"?>',
	'<?xml\vversion="1.0"?>',
	'<?xml\u00a0version="1.0"?>',
	'<?xml version="1.0"\f?>',
	'<?xml-stylesheet href="https://resources.invalid/style.xsl"?>',
	"<?target data?>",
	"<??>",
	"<?",
	"<? >",
	"<![CDATA[ambiguous]]>",
];

it.each(rejectedDeclarations)(
	"rejects malformed or non-XML processing declarations: %j",
	(sourceDeclaration) => {
		const source = `${sourceDeclaration}<p>Kept</p>`;
		const error = failure(() => sanitizeResearchHtml(source));
		expect(error.code).toBe("unsupported");
		expect(resourceLimitDiagnostic(error)).toBeUndefined();
		expect(() => loadResearchDocument(response(source), context)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it.each([255, 256])("accepts a %i-code-unit declaration", (length) => {
	const sourceDeclaration = `<?xml version="1.0"${" ".repeat(length - declaration.length)}?>`;
	expect(sourceDeclaration.length).toBe(length);
	expect(sanitizeResearchHtml(`${sourceDeclaration}<p>Kept</p>`).html).toBe(
		"<p>Kept</p>",
	);
});

it.each([257, 512])("rejects a %i-code-unit declaration", (length) => {
	const sourceDeclaration = `<?xml version="1.0"${" ".repeat(length - declaration.length)}?>`;
	expect(sourceDeclaration.length).toBe(length);
	expect(() => sanitizeResearchHtml(`${sourceDeclaration}<p>Kept</p>`)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("measures the declaration cap after CRLF normalization but charges original source units", () => {
	const source = `<?xml version="1.0"${" ".repeat(234)}\r\n?>`;
	expect(source.length).toBe(257);
	const sanitized = sanitizeResearchHtml(source, { maxSourceCodeUnits: 257 });
	expect(sanitized.html).toBe("");
	expect(sanitized.report).toMatchObject({
		sourceCodeUnits: 257,
		textCodeUnits: 0,
		outputCodeUnits: 0,
		tokens: 1,
		omittedTokens: 1,
		tokenizerIssues: 1,
	});
	const error = failure(() =>
		sanitizeResearchHtml(source, { maxSourceCodeUnits: 256 }),
	);
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "reader.source",
		unit: "code-units",
		limit: 256,
		observed: 257,
	});
});

it("retains the native tokenizer's bogus-comment token and issue", () => {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer(`${declaration}<p>Kept</p>`, (issue) =>
		issues.push(issue),
	);
	expect(tokenizer.next()).toEqual({
		kind: "comment",
		data: 'xml version="1.0"?',
	});
	expect(tokenizer.position).toBe(declaration.length);
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

describe.each(policies)("$name", ({ rawPolicy, visibilityPolicy }) => {
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

	it("adds one omitted token and issue without changing extraction or omission accounting", () => {
		const body =
			'<title>日本語</title><script>omitted</script><p hidden>Hidden</p><p style="display:none">Inline</p><p>Visible</p>';
		const baseline = sanitize(body);
		const sanitized = sanitize(`${declaration}${body}`);
		expect(sanitized.html).toBe(baseline.html);
		expect(sanitized.report).toEqual({
			...baseline.report,
			sourceCodeUnits: baseline.report.sourceCodeUnits + declaration.length,
			tokens: baseline.report.tokens + 1,
			omittedTokens: baseline.report.omittedTokens + 1,
			tokenizerIssues: baseline.report.tokenizerIssues + 1,
		});
		const tree = loadResearchDocument(
			response(`${declaration}${body}`),
			context,
			undefined,
			rawPolicy,
			visibilityPolicy,
		);
		try {
			const extracted = extractDocument(tree);
			if (extracted.format !== "markdown")
				throw new Error("Expected Markdown extraction");
			expect(extracted.title).toBe("日本語");
			expect(extracted.content).toContain("Visible");
			expect(extracted.content).not.toContain("<?xml");
			expect(extracted.content.includes("Hidden")).toBe(!visibilityPolicy);
			expect(extracted.content.includes("Inline")).toBe(
				visibilityPolicy !== "source-hidden-inline-v1",
			);
			expect(researchReaderInfo(tree)).toMatchObject(sanitized.report);
		} finally {
			tree.close();
		}
	});

	it("rejects declarations outside normalized offset zero, including omitted subtrees", () => {
		for (const source of [
			` ${declaration}`,
			`\t${declaration}`,
			`\r\n${declaration}`,
			`\ufeff${declaration}`,
			`<!--before-->${declaration}`,
			`<!doctype html>${declaration}`,
			`<?>${declaration}`,
			`${declaration}${declaration}`,
			`<body>${declaration}</body>`,
			`<p>Before${declaration}After</p>`,
			`<svg>${declaration}</svg>`,
			`<template>${declaration}</template>`,
			`<div hidden>${declaration}</div>`,
			`<div aria-hidden="true">${declaration}</div>`,
			`<div style="display:none">${declaration}</div>`,
			`${declaration}<?target data?>`,
			`${declaration}<![CDATA[ambiguous]]>`,
		])
			expect(() => sanitize(source)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
	});

	it("keeps empty processing markers omitted and individually accounted", () => {
		const sanitized = sanitize(`${declaration}<?><p>Before<?>After</p>`);
		expect(sanitized.html).toBe("<p>BeforeAfter</p>");
		expect(sanitized.report).toMatchObject({
			tokens: 7,
			omittedTokens: 3,
			tokenizerIssues: 3,
			textCodeUnits: 11,
			outputCodeUnits: 18,
		});
	});

	it("does not reinterpret XML-looking raw, RCDATA, or entity-decoded text", () => {
		const escaped = "&lt;?xml version=&quot;1.0&quot;?&gt;";
		const body = `<script>${declaration}</script><style>${declaration}</style><textarea>${declaration}</textarea><title>${declaration}</title><xmp>${declaration}</xmp><p>${escaped}</p>`;
		const baseline = sanitize(body);
		expect(baseline.report.tokenizerIssues).toBe(0);
		expect(baseline.html).toBe(
			`<title>${escaped}</title><pre>${escaped}</pre><p>${escaped}</p>`,
		);
		const sanitized = sanitize(`${declaration}${body}`);
		expect(sanitized.html).toBe(baseline.html);
		expect(sanitized.report.textCodeUnits).toBe(baseline.report.textCodeUnits);
		expect(sanitized.report.omittedRaw).toEqual(baseline.report.omittedRaw);
		expect(sanitized.report.tokenizerIssues).toBe(1);
	});

	const body = "<p>日😀&amp;</p>";
	const source = `${declaration}${body}`;
	const budgets = [
		{
			option: "maxSourceCodeUnits",
			kind: "reader.source",
			unit: "code-units",
			observed: source.length,
		},
		{
			option: "maxTokens",
			kind: "reader.tokens",
			unit: "tokens",
			observed: 4,
		},
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
			observed: body.length,
		},
	] as const;

	it.each(budgets)(
		"preserves exact $kind boundaries",
		({ option, kind, unit, observed }) => {
			expect(sanitize(source, { [option]: observed }).html).toBe(body);
			const error = failure(() => sanitize(source, { [option]: observed - 1 }));
			expect(error.code).toBe("resource-limit");
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind,
				unit,
				limit: observed - 1,
				observed,
			});
		},
	);
});

const multilingual = "日本語 العربية café 😀";
const decodingCases = [
	{
		name: "UTF-8 response charset overrides XML and meta Shift-JIS",
		xmlEncoding: "Shift_JIS",
		meta: '<meta charset="Shift_JIS">',
		contentType: "text/html; charset=utf-8",
		textBytes: encoder.encode(multilingual),
		expected: multilingual,
		encoding: "utf-8",
		bom: false,
	},
	{
		name: "UTF-8 meta overrides XML Shift-JIS",
		xmlEncoding: "Shift_JIS",
		meta: '<meta charset="utf-8">',
		contentType: "text/html",
		textBytes: encoder.encode(multilingual),
		expected: multilingual,
		encoding: "utf-8",
		bom: false,
	},
	{
		name: "Shift-JIS response charset overrides XML and meta UTF-8",
		xmlEncoding: "UTF-8",
		meta: '<meta charset="utf-8">',
		contentType: "text/html; charset=Shift_JIS",
		textBytes: new Uint8Array([0x93, 0xfa, 0x96, 0x7b]),
		expected: "日本",
		encoding: "shift_jis",
		bom: false,
	},
	{
		name: "Shift-JIS meta overrides XML UTF-8",
		xmlEncoding: "UTF-8",
		meta: '<meta charset="Shift_JIS">',
		contentType: "text/html",
		textBytes: new Uint8Array([0x93, 0xfa, 0x96, 0x7b]),
		expected: "日本",
		encoding: "shift_jis",
		bom: false,
	},
	{
		name: "Shift-JIS HTTP-equivalent meta overrides XML UTF-8",
		xmlEncoding: "UTF-8",
		meta: '<meta http-equiv="content-type" content="text/html; charset=Shift_JIS">',
		contentType: "text/html",
		textBytes: new Uint8Array([0x93, 0xfa, 0x96, 0x7b]),
		expected: "日本",
		encoding: "shift_jis",
		bom: false,
	},
	{
		name: "UTF-8 BOM overrides response, meta and XML Shift-JIS",
		xmlEncoding: "Shift_JIS",
		meta: '<meta charset="Shift_JIS">',
		contentType: "text/html; charset=Shift_JIS",
		textBytes: encoder.encode(multilingual),
		expected: multilingual,
		encoding: "utf-8",
		bom: true,
	},
	{
		name: "unsupported XML encoding remains inert under UTF-8 response charset",
		xmlEncoding: "Unknown-But-Inert",
		meta: "",
		contentType: "text/html; charset=utf-8",
		textBytes: encoder.encode(multilingual),
		expected: multilingual,
		encoding: "utf-8",
		bom: false,
	},
	{
		name: "HTML fallback ignores XML UTF-8 without a response or meta charset",
		xmlEncoding: "UTF-8",
		meta: "",
		contentType: "text/html",
		textBytes: new Uint8Array([0x63, 0x61, 0x66, 0xe9]),
		expected: "café",
		encoding: "windows-1252",
		bom: false,
	},
];

it.each(decodingCases)("loads and extracts literal bytes: $name", (fixture) => {
	const prefix = encoder.encode(
		`<?xml version="1.0" encoding="${fixture.xmlEncoding}"?>${fixture.meta}<h1>`,
	);
	const body = new Uint8Array([
		...(fixture.bom ? [0xef, 0xbb, 0xbf] : []),
		...prefix,
		...fixture.textBytes,
		...encoder.encode("</h1>"),
	]);
	const tree = loadResearchDocument(
		response(body, fixture.contentType),
		context,
	);
	try {
		expect(tree.textContent(tree.root)).toBe(fixture.expected);
		expect(extractDocument(tree).content).toContain(fixture.expected);
		expect(extractDocument(tree).content).not.toContain("<?xml");
		expect(researchReaderInfo(tree)).toMatchObject({
			encoding: fixture.encoding,
			tokenizerIssues: 1,
			omittedTokens: fixture.meta ? 2 : 1,
		});
	} finally {
		tree.close();
	}
});

it("does not let an XML encoding rescue an unsupported HTTP charset", () => {
	expect(() =>
		loadResearchDocument(
			response(
				`${declaration}<p>Kept</p>`,
				"text/html; charset=invalid-encoding",
			),
			context,
		),
	).toThrow(
		expect.objectContaining({
			code: "unsupported",
			message: "Unsupported response text encoding",
		}),
	);
});

it("retains HTML case folding, optional end tags and named entities rather than enabling XML", () => {
	const tree = loadResearchDocument(
		response(
			`${declaration}<H1>HTML &copy;</H1><P>One<P>Two &amp; &unregistered;`,
		),
		context,
	);
	try {
		const extracted = extractDocument(tree);
		expect(extracted.content).toContain("HTML ©");
		expect(extracted.content).toContain("One");
		expect(extracted.content).toContain("Two");
		expect(tree.textContent(tree.root)).toContain("Two & &unregistered;");
	} finally {
		tree.close();
	}
});

it("does not resolve an external XML doctype or its custom entities", () => {
	const tree = loadResearchDocument(
		response(
			`${declaration}<!DOCTYPE html SYSTEM "https://resources.invalid/document.dtd"><p>&privateEntity; &copy;</p>`,
		),
		context,
	);
	try {
		expect(tree.textContent(tree.root)).toBe("&privateEntity; ©");
		expect(extractDocument(tree).content).toContain("&amp;privateEntity; ©");
		expect(extractDocument(tree).content).not.toContain("resources.invalid");
	} finally {
		tree.close();
	}
});

it.each(["markdown", "json"] as const)(
	"preserves UTF-8 extraction output byte boundaries for %s",
	(format) => {
		const tree = loadResearchDocument(
			response(`${declaration}<h1>${multilingual}</h1>`),
			context,
		);
		try {
			const extracted = extractDocument(tree, { format });
			const bytes = encoder.encode(JSON.stringify(extracted)).byteLength;
			expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(
				extracted,
			);
			const error = failure(() =>
				extractDocument(tree, { format, maxBytes: bytes - 1 }),
			);
			expect(error.code).toBe("resource-limit");
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "extraction.output",
				unit: "bytes",
				limit: bytes - 1,
				observed: bytes,
			});
		} finally {
			tree.close();
		}
	},
);
