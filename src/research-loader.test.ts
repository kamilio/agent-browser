import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
	parseResearchArguments,
	researchExitCode,
	researchNavigation,
	summarizePrimaryResponse,
} from "../scripts/research-browser.js";
import { CookieJar } from "./cookies.js";
import { loadBrowserDocument } from "./document-loader.js";
import { svgNamespace } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { type ExtractedNode, extractDocument } from "./extraction.js";
import { htmlParseInfo } from "./html-info.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	researchReaderProfile,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const context: DocumentLoaderContext = {
	tabId: "synthetic-reader",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};

function response(
	text: string,
	type = "text/html; charset=utf-8",
): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url: "https://research.example/paper",
		status: 200,
		headers: { "content-type": [type] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 1,
	};
}

afterEach(() => vi.restoreAllMocks());

it.each(["about", "blog"])(
	"synthetic login diagnostics classify the final Poe-style response before extraction from %s",
	async (path) => {
		const input = response(
			"<title>Poe - Fast, Helpful AI Chat</title><p>Continue with GoogleContinue with Apple</p><p>GoUse phone</p>",
		);
		input.url = "https://poe.com/login?return=PRIVATE";
		const request = vi
			.spyOn(NodeNetworkTransport.prototype, "request")
			.mockResolvedValue(input);
		const report = await researchNavigation(`https://poe.com/${path}`, true);
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.contentSuccess).toBe(false);
		expect(report.classification.diagnostic).toEqual({
			kind: "login",
			provider: "unspecified",
			confidence: "possible",
			evidence: ["login-url-and-html-markers"],
			action: "stop-and-request-user-handoff",
		});
		expect(report.extraction).toBeUndefined();
		expect(report.finalUrl).toBe("https://poe.com/login?redacted");
		expect(report.failure).toEqual({
			category: "policy-denied",
			stage: "semantic-barrier",
		});
		expect(JSON.stringify(report)).not.toContain("PRIVATE");
		expect(researchExitCode([report])).toBe(1);
		expect(request).toHaveBeenCalledOnce();
	},
);

it("synthetic login diagnostics do not use a requested login URL or HTML base in place of the final response", async () => {
	const input = response(
		'<title>Public post</title><base href="https://research.example/login"><p>Public post body and publication date.</p><footer>Continue with GoogleContinue with Apple</footer>',
	);
	input.url = "https://research.example/author/status/123";
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValue(input);
	const report = await researchNavigation(
		"https://research.example/login",
		true,
	);
	expect(report.classification.diagnostic).toBeNull();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.contentSuccess).toBeNull();
	expect(report.extraction?.content).toContain(
		"Public post body and publication date",
	);
	expect(request).toHaveBeenCalledOnce();
});

it("reads synthetic vendor content around SVG, MathML, CSS and script omissions", () => {
	const tree = loadResearchDocument(
		response(`<!doctype html>
		<title>Research &amp; hardware</title><base href="https://research.example/docs/">
		<link rel=stylesheet href=/large.css><style>${".x{color:red}".repeat(12_000)}</style>
		<main><h1>Model &amp; memory</h1><svg><g><path d="M 0 0"/></g><text>Omitted graphic</text></svg>
		<p>Measured memory <math><mi>x</mi></math> and throughput.</p>
		<script>throw new Error('never execute');</script>
		<ul><li><a href="table?size=4&amp;mode=fast">Results</a></li></ul>
		<table><tr><th>Device</th><td>128 GB</td></tr></table></main>`),
		context,
	);
	try {
		const extracted = extractDocument(tree);
		expect(extracted.title).toBe("Research & hardware");
		expect(tree.textContent(tree.root)).toContain("Model & memory");
		expect(extracted.content).toContain("Model &amp; memory");
		expect(extracted.content).toContain(
			"https://research.example/docs/table?size=4&amp;mode=fast",
		);
		expect(extracted.content).toContain("128 GB");
		expect(extracted.content).not.toContain("Omitted graphic");
		expect(extracted.content).not.toContain("never execute");
		expect(researchReaderInfo(tree)).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			omittedSubtrees: { svg: 1, math: 1, link: 1, style: 1, script: 1 },
		});
		expect(htmlParseInfo(tree)?.scripting).toBe(false);
	} finally {
		tree.close();
	}
	expect(researchReaderInfo(tree)).toBeUndefined();
});

it("keeps native frameset rejection explicit", async () => {
	await expect(
		loadBrowserDocument(
			response("<frameset><frame src=/never></frameset>"),
			context,
		),
	).rejects.toMatchObject({ code: "unsupported" });
});

it("strips active attributes, resources and hiding without invoking supplied hooks", () => {
	const fetch = vi.fn();
	const script = vi.fn();
	const initializeDocument = vi.fn();
	const tree = loadResearchDocument(
		response(`<style>p{display:none}</style>
		<link rel=stylesheet href=/sheet.css><script src=/app.js></script>
		<meta http-equiv=refresh content="0;url=/next"><iframe src=/frame><p>Frame</p></iframe>
		<template><script>bad()</script></template><object data=/object>Object</object>
		<p hidden inert aria-hidden=true style="display:none" onclick="bad()">Still readable</p>
		<details><summary>More</summary>Collapsed content</details>
		<form action=/submit><input type=password value=secret><button>Never submit</button></form>
		<img src=/image srcset=/other alt=Diagram><a href="javascript:bad()">Unsafe</a>`),
		{
			...context,
			initializeDocument,
			fetchStylesheet: fetch,
			fetchScript: fetch,
			fetchImage: fetch,
			scripts: { start: script } as unknown as DocumentLoaderContext["scripts"],
		},
	);
	try {
		const queries = new DocumentQueries(tree);
		for (const selector of [
			"script",
			"style",
			"link",
			"iframe",
			"object",
			"template",
			"form",
			"input",
			"[onclick]",
			"[src]",
			"[srcset]",
			"[hidden]",
			"[style]",
			"a[href]",
		])
			expect(queries.querySelector(selector)).toBeNull();
		const extracted = extractDocument(tree).content;
		expect(extracted).toContain("Still readable");
		expect(extracted).toContain("Collapsed content");
		expect(extracted).not.toContain("secret");
		expect(fetch).not.toHaveBeenCalled();
		expect(script).not.toHaveBeenCalled();
		expect(initializeDocument).toHaveBeenCalledOnce();
		expect(researchReaderInfo(tree)?.ignoredAttributes).toBeGreaterThan(5);
	} finally {
		tree.close();
	}
});

it.each([
	'<svg><foreignObject><script>"</svg><p>escape</p>"</script></foreignObject></svg><p>Kept</p>',
	"<math><annotation-xml><svg><path/></svg></annotation-xml></math><p>Kept</p>",
	'<script/>"<p>escape</p>"</script><p>Kept</p>',
	'<svg data-markup="</svg><p>escape</p>"><!-- </svg> --><g/></svg><p>Kept</p>',
])("keeps omitted markup contained: %s", (source) => {
	const sanitized = sanitizeResearchHtml(source);
	expect(sanitized.html).toBe("<p>Kept</p>");
});

it("escapes decoded text and raw text instead of reinterpreting markup", () => {
	const tree = loadResearchDocument(
		response(`<title>&lt;script&gt;Title&lt;/script&gt;</title>
		<p>&lt;svg&gt;literal&lt;/svg&gt; &amp; &lt;script&gt;</p>
		<xmp><img src=/never>&amp;</xmp><p>After</p>`),
		context,
	);
	try {
		expect(
			new DocumentQueries(tree).querySelector("script, svg, img"),
		).toBeNull();
		expect(tree.textContent(tree.root)).toContain("<svg>literal</svg>");
		expect(tree.textContent(tree.root)).toContain("<img src=/never>&amp;");
	} finally {
		tree.close();
	}
});

it.each([
	"<svg><g></svg><p>escape</p>",
	"<svg><g/>",
	"<script>unterminated",
	"<style>unterminated",
	'<p title="unterminated>',
	"<svg><g><path/></g>",
	"<svg><![CDATA[> </svg><p>escape</p>]]></svg>",
])("rejects malformed omitted or incomplete markup: %s", (source) => {
	expect(() => sanitizeResearchHtml(source)).toThrow(AgentBrowserError);
});

it.each([
	["<p>Before<?>After</p>", "<p>BeforeAfter</p>"],
	["<?><p>Kept</p>", "<p>Kept</p>"],
	["<p>Kept</p><?>", "<p>Kept</p>"],
	["<p><?><?>Kept</p>", "<p>Kept</p>"],
	["<script>omitted</script><?><p>Kept</p>", "<p>Kept</p>"],
	["<svg><g><?></g></svg><p>Kept</p>", "<p>Kept</p>"],
	["<template><?><p>Omitted</p></template><p>Kept</p>", "<p>Kept</p>"],
])("omits a complete empty processing marker: %s", (source, expected) => {
	expect(sanitizeResearchHtml(source).html).toBe(expected);
});

it("accounts for empty processing markers without hiding tokenizer diagnostics", () => {
	const source = "<p>Before<?>After</p>";
	const sanitized = sanitizeResearchHtml(source);
	expect(sanitized.report).toMatchObject({
		partial: true,
		sourceCodeUnits: source.length,
		textCodeUnits: 11,
		outputCodeUnits: 18,
		tokens: 5,
		omittedTokens: 1,
		tokenizerIssues: 1,
	});
	const tree = loadResearchDocument(response(source), context);
	try {
		expect(tree.textContent(tree.root)).toBe("BeforeAfter");
		expect(extractDocument(tree).content).toContain("BeforeAfter");
		expect(researchReaderInfo(tree)).toMatchObject(sanitized.report);
	} finally {
		tree.close();
	}
});

it.each([
	"<?",
	"<? >",
	"<?name?>",
	"<?xml version='1.0'?>",
	"<!>",
	"<!name <?>",
	"<?name <?>",
	"<![CDATA[ambiguous]]><p>Kept</p>",
	"<p><![CDATA[ambiguous]]></p>",
	"<math><![CDATA[ambiguous]]></math><p>Kept</p>",
	"<template><![CDATA[ambiguous]]></template><p>Kept</p>",
	"<svg><![CDATA[> </svg><p>escape</p>]]></svg>",
	"<svg><?><g></svg><p>escape</p>",
	"<svg><?>",
	"<?><!--unterminated",
	"<?><script>unterminated",
])("keeps malformed and nonempty declarations rejected: %s", (source) => {
	expect(() => sanitizeResearchHtml(source)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() => loadResearchDocument(response(source), context)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([
	["<?>", { maxSourceCodeUnits: 2 }],
	["<?><?>", { maxTokens: 1 }],
	["<?><p>large</p>", { maxTextCodeUnits: 4 }],
	["<?><p>text</p>", { maxOutputCodeUnits: 4 }],
	["<?><div><div>deep</div></div>", { maxDepth: 1 }],
])(
	"retains reader budgets around empty processing markers",
	(source, limits) => {
		expect(() => sanitizeResearchHtml(source, limits)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("does not reinterpret empty processing markers inside raw or decoded text", () => {
	const sanitized = sanitizeResearchHtml(
		"<script>const marker = '<?>';</script><title>Before<?>After</title><p>&lt;?&gt;</p>",
	);
	expect(sanitized.html).toBe(
		"<title>Before&lt;?&gt;After</title><p>&lt;?&gt;</p>",
	);
	expect(sanitized.report.tokenizerIssues).toBe(0);
	expect(sanitized.report.omittedSubtrees).toEqual({ script: 1 });
});

it.each([
	["<svg><g><g/></g></svg>", { maxDepth: 1 }],
	["<div><div>deep</div></div>", { maxDepth: 1 }],
	["<p>text</p>", { maxTokens: 2 }],
	["<style>large</style>", { maxTextCodeUnits: 4 }],
	["<p>large</p>", { maxTextCodeUnits: 4 }],
	["<p>text</p>", { maxSourceCodeUnits: 4 }],
	["&lt;&lt;", { maxOutputCodeUnits: 4 }],
] as const)("enforces isolated reader budgets", (source, limits) => {
	expect(() => sanitizeResearchHtml(source, limits)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	["p", "body", "paragraph"],
	["li", "ul", "item"],
	["li", "ol", "item"],
] as const)(
	"accounts for 140 optional %s siblings in %s",
	(tag, parent, text) => {
		const source = `<${parent}>${`<${tag}>${text}`.repeat(140)}</${parent}>`;
		const sanitized = sanitizeResearchHtml(source, { maxDepth: 2 });
		expect(sanitized.html).toBe(source);
		expect(sanitized.report).toMatchObject({
			sourceCodeUnits: source.length,
			outputCodeUnits: source.length,
			textCodeUnits: text.length * 140,
			tokens: 282,
			omittedTokens: 0,
			omittedSubtrees: {},
			ignoredAttributes: 0,
			unwrappedElements: 0,
			tokenizerIssues: 0,
		});
		const tree = loadResearchDocument(response(source), {
			...context,
			limits: { ...context.limits, maxDepth: 128 },
		});
		try {
			const queries = new DocumentQueries(tree);
			const siblings = queries.querySelectorAll(`${parent} > ${tag}`);
			expect(siblings).toHaveLength(140);
			expect(queries.querySelector(`${tag} ${tag}`)).toBeNull();
			expect(siblings.map((id) => tree.textContent(id))).toEqual(
				Array(140).fill(text),
			);
			expect(extractDocument(tree).content).toBe(
				tag === "p"
					? `${Array(140).fill(text).join("\n\n")}\n`
					: `${Array.from({ length: 140 }, (_, index) =>
							parent === "ol" ? `${index + 1}. ${text}` : `- ${text}`,
						).join("\n\n")}\n`,
			);
			expect(researchReaderInfo(tree)).toMatchObject(sanitized.report);
		} finally {
			tree.close();
		}
	},
);

it("accounts for adjacent paragraph ends within optional list items", () => {
	const source = `<ul>${"<li><p>first<p>second".repeat(140)}</ul>`;
	expect(sanitizeResearchHtml(source, { maxDepth: 3 }).html).toBe(source);
	const tree = loadResearchDocument(response(source), context);
	try {
		const queries = new DocumentQueries(tree);
		expect(queries.querySelectorAll("ul > li")).toHaveLength(140);
		expect(queries.querySelectorAll("ul > li > p")).toHaveLength(280);
		expect(queries.querySelector("li li, p p")).toBeNull();
		expect(extractDocument(tree).content).toContain("first\n\n  second");
	} finally {
		tree.close();
	}
});

it("keeps nested optional lists and their paragraphs nested", () => {
	const source =
		"<ul><li><p>outer<ul><li>inner one<li>inner two</ul><li>outer two</ul>";
	expect(sanitizeResearchHtml(source, { maxDepth: 5 }).html).toBe(source);
	expect(() => sanitizeResearchHtml(source, { maxDepth: 4 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const tree = loadResearchDocument(response(source), context);
	try {
		const queries = new DocumentQueries(tree);
		expect(queries.querySelectorAll("body > ul > li")).toHaveLength(2);
		expect(queries.querySelectorAll("body > ul > li > ul > li")).toHaveLength(
			2,
		);
		expect(extractDocument(tree).content).toContain("  - inner one");
	} finally {
		tree.close();
	}
});

it.each([
	"<div>",
	"<unknown>",
	"<ul><li>",
	"<ol><li>",
	"<table><tr><td>",
	"<p><span>",
	"<p><b>",
	"<li><strong>",
])("retains default depth bounds for nested %s", (start) => {
	const source = start.repeat(129);
	expect(() => sanitizeResearchHtml(source)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => loadResearchDocument(response(source), context)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each(["p", "li"])(
	"does not close a distant %s across intervening tags",
	(tag) => {
		for (const barrier of [
			"ul",
			"ol",
			"table",
			"td",
			"th",
			"caption",
			"button",
			"select",
			"applet",
			"div",
			"span",
			"unknown",
			"b",
			"strong",
			"a",
		]) {
			const source = `<${tag}><${barrier}><${tag}>text`;
			expect(
				sanitizeResearchHtml(source, { maxDepth: 3 }).report.sourceCodeUnits,
			).toBe(source.length);
			expect(() => sanitizeResearchHtml(source, { maxDepth: 2 })).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		}
	},
);

it.each([
	["<body><p>one<p>two</body>", 1],
	["<ul><li>one<li>two</ul>", 1],
	["<ul><li><p>one<li><p>two</ul>", 2],
] as const)(
	"enforces reduced depth for optional siblings: %s",
	(source, maxDepth) => {
		expect(() => sanitizeResearchHtml(source, { maxDepth })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(() =>
			loadResearchDocument(response(source), {
				...context,
				limits: { ...context.limits, maxDepth },
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it.each([
	"maxSourceCodeUnits",
	"maxTextCodeUnits",
	"maxOutputCodeUnits",
	"maxTokens",
] as const)("retains %s bounds with optional siblings", (limit) => {
	expect(() =>
		sanitizeResearchHtml("<p>text".repeat(140), { [limit]: 128 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each([
	"<svg><p>one<p>two</svg>",
	"<template><p>one<p>two</template>",
	"<template><li>one<li>two</template>",
	"<svg><g></svg>",
	"<script>unterminated",
	"<template><script>unterminated",
])(
	"retains omitted-subtree rejection after optional siblings: %s",
	(omitted) => {
		expect(() => sanitizeResearchHtml(omitted)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() =>
			sanitizeResearchHtml(`<body>${"<p>paragraph".repeat(140)}${omitted}`),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
	},
);

it("preserves sanitized bytes and omission provenance around optional siblings", () => {
	const source =
		"<body><p hidden>one<svg/><template><p>hidden</p></template><script>bad()</script><p>two</body>";
	const sanitized = sanitizeResearchHtml(source);
	expect(sanitized).toEqual({
		html: "<body><p>one<p>two</body>",
		report: {
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			sourceCodeUnits: source.length,
			textCodeUnits: 17,
			outputCodeUnits: 25,
			tokens: 14,
			omittedTokens: 8,
			omittedSubtrees: { svg: 1, template: 1, script: 1 },
			ignoredAttributes: 1,
			unwrappedElements: 0,
			tokenizerIssues: 0,
		},
	});
});

it("retains formatting ancestors but allows explicitly closed inline children", () => {
	const source = `<b>${"<p><em>paragraph</em>".repeat(140)}</p></b>`;
	expect(sanitizeResearchHtml(source, { maxDepth: 3 }).html).toBe(source);
	expect(() => sanitizeResearchHtml(source, { maxDepth: 2 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const tree = loadResearchDocument(response(source), context);
	try {
		expect(
			new DocumentQueries(tree).querySelectorAll("body > b > p > em"),
		).toHaveLength(140);
	} finally {
		tree.close();
	}
});

it.each([`<table>${"<tr><td><div>value".repeat(140)}</table>`])(
	"accounts for implicit table closure across cell descendants",
	(source) => {
		expect(sanitizeResearchHtml(source, { maxDepth: 4 }).html).toBe(source);
	},
);

it("rejects invalid limits and pre-aborted loading", () => {
	expect(() => sanitizeResearchHtml("text", { maxTokens: 100_001 })).toThrow();
	expect(() => sanitizeResearchHtml("text", { maxDepth: 0 })).toThrow();
	const controller = new AbortController();
	controller.abort();
	expect(() =>
		loadResearchDocument(response("<p>Text</p>"), {
			...context,
			signal: controller.signal,
		}),
	).toThrow(expect.objectContaining({ code: "aborted" }));
});

it("uses native entity/encoding handling and initializes literal non-HTML documents", () => {
	for (const [source, type, expected] of [
		["<meta charset=utf-8><p>日本語 £</p>", "text/html", "日本語 £"],
		["<svg>literal</svg>", "text/plain", "<svg>literal</svg>"],
		['{"svg":"literal"}', "application/json", '{"svg":"literal"}'],
	]) {
		const tree = loadResearchDocument(response(source, type), context);
		try {
			expect(tree.textContent(tree.root)).toContain(expected);
			expect(researchReaderInfo(tree)?.partial).toBe(true);
		} finally {
			tree.close();
		}
	}
	expect(() =>
		loadResearchDocument(response("<svg/>", "image/svg+xml"), context),
	).toThrow();
	expect(() =>
		loadResearchDocument({ ...response("text"), headers: {} }, context),
	).toThrow();
});

it("requires explicit public URLs and an explicit reader switch", () => {
	expect(
		parseResearchArguments(["https://research.example/paper"]).reader,
	).toBe(false);
	expect(
		parseResearchArguments(["--reader", "https://research.example/paper"])
			.reader,
	).toBe(true);
	for (const args of [
		[],
		["--reader"],
		["--other"],
		["--reader", "--reader"],
		["file:///tmp/page"],
		["http://localhost/"],
		["http://127.0.0.1/"],
		["http://10.0.0.1/"],
		["https://user:secret@research.example/"],
		["https://research.example/#fragment"],
		Array(9).fill("https://research.example/"),
	])
		expect(() => parseResearchArguments(args)).toThrow();
});

it("captures bounded response evidence without cookies, raw body or query credentials", () => {
	const input = response("Synthetic response body");
	input.url += "?token=sensitive#fragment";
	input.headers = {
		"content-type": ["text/html"],
		"set-cookie": ["session=sensitive"],
		authorization: ["Bearer sensitive"],
		"x-extra": ["sensitive"],
	};
	const summary = summarizePrimaryResponse(input);
	expect(summary.bodySha256).toBe(
		createHash("sha256").update(input.body).digest("hex"),
	);
	expect(summary.url).toBe("https://research.example/paper?redacted");
	expect(JSON.stringify(summary)).not.toMatch(
		/sensitive|Synthetic response body|set-cookie/,
	);
});

it("loads native SVG structure without claiming painting support", async () => {
	const tree = await loadBrowserDocument(
		response(
			'<svg viewBox="0 0 10 10"><path id=shape d="M0 0L10 10"/></svg><p>Paper</p>',
		),
		context,
	);
	try {
		const shape = new DocumentQueries(tree).querySelector("#shape");
		if (shape === null) throw new Error("Missing SVG fixture");
		expect(tree.get(shape)).toMatchObject({
			tagName: "path",
			namespaceURI: svgNamespace,
			attributes: { d: "M0 0L10 10" },
		});
		expect(researchReaderInfo(tree)).toBeUndefined();
		expect(extractDocument(tree).content).toContain("Paper");
	} finally {
		tree.close();
	}
});

it("retains PRIMARY evidence when native SVG loading succeeds", async () => {
	const input = response("<svg><path d='M0 0L10 10'/></svg><p>Paper</p>");
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValue(input);
	const result = await researchNavigation(input.url);
	expect(result.profile).toBe("native");
	expect(result.outcome).toBe("extracted-unverified");
	expect(result.failure).toBeUndefined();
	expect(result.contentSuccess).toBeNull();
	expect(result.extraction?.content).toContain("Paper");
	expect(result.primaryResponse?.bodySha256).toBe(
		summarizePrimaryResponse(input).bodySha256,
	);
	expect(result.primaryResponse?.status).toBe(200);
	expect(result.metrics?.closed).toBe(true);
	expect(request).toHaveBeenCalledOnce();
});

it("retains PRIMARY evidence when the native parser rejects framesets", async () => {
	const input = response("<frameset><frame src=/never></frameset>");
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValue(input);
	const result = await researchNavigation(input.url);
	expect(result.profile).toBe("native");
	expect(result.outcome).toBe("failure");
	expect(result.failure).toEqual({ category: "unsupported", stage: "loader" });
	expect(result.primaryResponse?.bodySha256).toBe(
		summarizePrimaryResponse(input).bodySha256,
	);
	expect(result.primaryResponse?.status).toBe(200);
	expect(result.metrics?.closed).toBe(true);
	expect(request).toHaveBeenCalledOnce();
});

it("uses one synthetic primary request in reader mode without loading resources", async () => {
	const input = response(
		"<title>Paper</title><link rel=stylesheet href=/style><svg/><p>Research result</p><img src=/image>",
	);
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValue(input);
	const result = await researchNavigation(input.url, true);
	expect(result.failure).toBeUndefined();
	expect(result.outcome).toBe("extracted-unverified");
	expect(result.contentSuccess).toBeNull();
	expect(result.reader?.omittedSubtrees).toMatchObject({ svg: 1, link: 1 });
	expect(result.extraction?.content).toContain("Research result");
	expect(request).toHaveBeenCalledOnce();
	expect(result.startedAt).toMatch(/Z$/);
	expect(result.finishedAt).toMatch(/Z$/);
});

it("never replaces primary evidence with stylesheet responses", async () => {
	const input = response(
		"<link rel=stylesheet href=/sheet.css><p>Research result</p>",
	);
	const sheet = response("p{color:red}", "text/css");
	sheet.url = "https://research.example/sheet.css";
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValueOnce(input)
		.mockResolvedValueOnce(sheet);
	const result = await researchNavigation(input.url);
	expect(result.failure).toBeUndefined();
	expect(request).toHaveBeenCalledTimes(2);
	expect(result.primaryResponse?.url).toBe(input.url);
	expect(result.primaryResponse?.bodySha256).toBe(
		summarizePrimaryResponse(input).bodySha256,
	);
});

it.each([
	["<title>Just a moment...</title><p>Verify you are human</p>", "challenge"],
	[
		"<title>Sign in</title><p>Sign in to continue</p><form><input type=password></form>",
		"login",
	],
] as const)(
	"keeps HTTP 200 barriers distinct without retrying",
	async (source, barrier) => {
		const input = response(source);
		const request = vi
			.spyOn(NodeNetworkTransport.prototype, "request")
			.mockResolvedValue(input);
		const result = await researchNavigation(input.url, true);
		expect(result.outcome).toBe("semantic-barrier");
		expect(result.contentSuccess).toBe(false);
		expect(result.classification.barrier).toBe(barrier);
		expect(researchExitCode([result])).toBe(1);
		expect(request).toHaveBeenCalledOnce();
	},
);

it("distinguishes HTTP errors, empty pages and network failures", async () => {
	const input = { ...response("<p>Unavailable</p>"), status: 503 };
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValueOnce(input)
		.mockResolvedValueOnce(response("<svg/>"))
		.mockRejectedValueOnce(
			new AgentBrowserError("network-error", "Do not report secret details"),
		);
	const http = await researchNavigation(input.url, true);
	const empty = await researchNavigation(input.url, true);
	const failed = await researchNavigation(input.url, true);
	expect(http.outcome).toBe("http-failure");
	expect(empty.outcome).toBe("empty-extraction");
	expect(failed.primaryResponse).toBeNull();
	expect(failed.failure).toEqual({
		category: "network-error",
		stage: "network",
	});
	expect(JSON.stringify(failed)).not.toContain("secret details");
	expect(request).toHaveBeenCalledTimes(3);
	expect(researchExitCode([http, empty, failed])).toBe(1);
	const success = { ...empty, outcome: "extracted-unverified" as const };
	expect(researchExitCode([success])).toBe(0);
	expect(researchExitCode([success, failed])).toBe(2);
});

it("classifies response headers before a failing parser and retains only static evidence", async () => {
	const input = response("<frameset><frame src=/never></frameset>");
	input.headers = {
		...input.headers,
		"cf-mitigated": ["challenge"],
		"retry-after": ["30"],
		"set-cookie": ["session=not-for-report"],
	};
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValue(input);
	const report = await researchNavigation(input.url);
	expect(report.outcome).toBe("semantic-barrier");
	expect(report.failure?.stage).toBe("semantic-barrier");
	expect(report.classification.diagnostic).toMatchObject({
		kind: "challenge",
		provider: "cloudflare",
		confidence: "confirmed",
		action: "stop-and-request-user-handoff",
		retryAfterSeconds: 30,
	});
	expect(report.primaryResponse?.bodySha256).toBe(
		summarizePrimaryResponse(input).bodySha256,
	);
	expect(JSON.stringify(report)).not.toMatch(/set-cookie|not-for-report/);
	expect(request).toHaveBeenCalledOnce();
});

it("treats a null classifier as inconclusive, not confirmed content success", async () => {
	const input = response(
		"<title>Research article</title><p>A login challenge is discussed in this paper.</p>",
	);
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockResolvedValue(input);
	const report = await researchNavigation(input.url, true);
	expect(report.classification).toEqual({
		classifier: "browser-challenges",
		barrier: null,
		diagnostic: null,
	});
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.contentSuccess).toBeNull();
});

it("keeps response and omission metadata when bounded extraction fails", async () => {
	const input = response(`<svg/><p>${"x".repeat(260_000)}</p>`);
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockResolvedValue(input);
	const report = await researchNavigation(input.url, true);
	expect(report.failure).toEqual({
		category: "resource-limit",
		stage: "extraction",
	});
	expect(report.primaryResponse?.bodySha256).toBe(
		summarizePrimaryResponse(input).bodySha256,
	);
	expect(report.reader?.omittedSubtrees.svg).toBe(1);
	expect(report.metrics?.closed).toBe(true);
});

it("uses the classifier's access-denied diagnostic on synthetic HTTP 403 content", async () => {
	const input = {
		...response("<p>You've been blocked by network security</p>"),
		status: 403,
	};
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockResolvedValue(input);
	const report = await researchNavigation(input.url, true);
	expect(report.outcome).toBe("semantic-barrier");
	expect(report.classification.barrier).toBe("access-denied");
});

it.each([false, true])(
	"validates real transport cookie context without sockets (reader=%s)",
	async (reader) => {
		const initialUrl = "https://research.example/paper";
		const finalUrl = "https://research.example/final";
		const sheetUrl = "https://research.example/sheet.css";
		const cookieHeader = vi.spyOn(CookieJar.prototype, "cookieHeader");
		const setCookie = vi.spyOn(CookieJar.prototype, "setCookie");
		const resolveRoute = vi.fn(({ url }: { url: string }): NetworkResponse => {
			if (url === initialUrl)
				return {
					...response(""),
					url,
					status: 302,
					headers: {
						location: [finalUrl],
						"set-cookie": ["redirect=synthetic; Secure"],
					},
				};
			if (url !== finalUrl && url !== sheetUrl)
				throw new Error("Unexpected synthetic research request");
			const fixture =
				url === sheetUrl
					? response("p{color:red}", "text/css")
					: response(
							"<title>Research</title><link rel=stylesheet href=/sheet.css><p>Result</p>",
						);
			return {
				...fixture,
				url,
				encodedBytes: 0,
				headers: {
					...fixture.headers,
					"set-cookie": ["session=synthetic; Secure"],
				},
			};
		});
		const request = vi
			.spyOn(NodeNetworkTransport.prototype, "request")
			.mockImplementation(function (this: NodeNetworkTransport, input) {
				return this.requestWithRoutes(input, resolveRoute);
			});
		const report = await researchNavigation(initialUrl, reader);
		expect(report.failure).toBeUndefined();
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.finalUrl).toBe(finalUrl);
		expect(report.primaryResponse?.redirects).toBe(1);
		expect(report.extraction?.content).toContain("Result");
		expect(request.mock.calls[0][0].cookieContext).toEqual({
			siteUrl: null,
			credentials: "omit",
			topLevelNavigation: true,
		});
		for (const [input] of request.mock.calls)
			expect(input.cookieContext?.credentials).toBe("omit");
		if (!reader)
			expect(request.mock.calls[1][0].cookieContext).toMatchObject({
				siteUrl: finalUrl,
				topLevelNavigation: false,
			});
		expect(resolveRoute).toHaveBeenCalledTimes(reader ? 2 : 3);
		expect(report.metrics).toMatchObject({
			requests: reader ? 2 : 3,
			mockedRequests: reader ? 2 : 3,
			closed: true,
		});
		expect(cookieHeader).not.toHaveBeenCalled();
		expect(setCookie).not.toHaveBeenCalled();
	},
);

it("requires a real transport jar even when credentials are omitted", async () => {
	const transport = new NodeNetworkTransport();
	const input = response("<p>Never reached</p>");
	const resolveRoute = vi.fn(() => ({ ...input, encodedBytes: 0 }));
	try {
		await expect(
			transport.requestWithRoutes(
				{
					url: input.url,
					cookieContext: { siteUrl: null, credentials: "omit" },
				},
				resolveRoute,
			),
		).rejects.toThrow(
			"Cookie context requires a jar and valid credentials mode",
		);
		expect(resolveRoute).not.toHaveBeenCalled();
	} finally {
		transport.close();
	}
});

const readerTableMarkers = {
	tableBegin:
		"**Native table begin (selected structure only; associations unspecified)**",
	tableEnd: "**Native table end**",
	rowBegin: "**Native row begin (selected structure only)**",
	rowEnd: "**Native row end**",
	cellBegin: "**Native cell begin (selected structure only)**",
	cellEnd: "**Native cell end**",
};

function readerTableBlocks(...blocks: string[]): string {
	return `${blocks.join("\n\n")}\n`;
}

function readerTableCells(root: ExtractedNode): ExtractedNode[] {
	const cells: ExtractedNode[] = [];
	const pending = [root];
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		if (current.type === "cell") cells.push(current);
		pending.push(...[...(current.children ?? [])].reverse());
	}
	return cells;
}

it("traverses unstyled reader thead, tbody and tfoot while preserving native wrapper JSON", () => {
	const tree = loadResearchDocument(
		response(
			"<table><thead><tr><th>Header</th></tr></thead>" +
				"<tbody><tr><td>Body</td></tr></tbody>" +
				"<tfoot><tr><td>Footer</td></tr></tfoot></table>",
		),
		context,
	);
	const queries = new DocumentQueries(tree);
	try {
		const table = queries.querySelector("table");
		if (table === null) throw new Error("Missing reader fixture table");
		const root = tree.reference(table);
		const wrapperRecord = (
			tagName: string,
			type: "inline" | "container",
			cellTag: string,
			text: string,
		): ExtractedNode => {
			const wrapper = queries.querySelector(tagName);
			if (wrapper === null) throw new Error("Missing reader fixture wrapper");
			const row = tree.get(wrapper).children[0];
			if (row === undefined) throw new Error("Missing reader fixture row");
			const cell = tree.get(row).children[0];
			if (cell === undefined) throw new Error("Missing reader fixture cell");
			const textId = tree.get(cell).children[0];
			if (textId === undefined) throw new Error("Missing reader fixture text");
			expect(tree.get(row).tagName).toBe("tr");
			expect(tree.get(cell).tagName).toBe(cellTag);
			return {
				ref: tree.reference(wrapper),
				type,
				children: [
					{
						ref: tree.reference(row),
						type: "row",
						children: [
							{
								ref: tree.reference(cell),
								type: "cell",
								children: [{ ref: tree.reference(textId), type: "text", text }],
							},
						],
					},
				],
			};
		};
		const structured = extractDocument(tree, { root, format: "json" });
		expect(structured.content).toEqual({
			ref: root,
			type: "table",
			children: [
				wrapperRecord("thead", "inline", "th", "Header"),
				wrapperRecord("tbody", "container", "td", "Body"),
				wrapperRecord("tfoot", "inline", "td", "Footer"),
			],
		});
		const wholeStructured = extractDocument(tree, { format: "json" });
		const markdown = extractDocument(tree);
		const scopedMarkdown = extractDocument(tree, { root });
		const expected = readerTableBlocks(
			readerTableMarkers.tableBegin,
			readerTableMarkers.rowBegin,
			readerTableMarkers.cellBegin,
			"Header",
			readerTableMarkers.cellEnd,
			readerTableMarkers.rowEnd,
			readerTableMarkers.rowBegin,
			readerTableMarkers.cellBegin,
			"Body",
			readerTableMarkers.cellEnd,
			readerTableMarkers.rowEnd,
			readerTableMarkers.rowBegin,
			readerTableMarkers.cellBegin,
			"Footer",
			readerTableMarkers.cellEnd,
			readerTableMarkers.rowEnd,
			readerTableMarkers.tableEnd,
		);
		expect(markdown.content).toBe(expected);
		expect(scopedMarkdown.content).toBe(expected);
		const info = researchReaderInfo(tree);
		expect(info).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			ignoredAttributes: 0,
		});
		for (const result of [
			structured,
			wholeStructured,
			markdown,
			scopedMarkdown,
		]) {
			expect(result.partial).toBe(true);
			expect(result.reader).toEqual(info);
		}
		expect(extractDocument(tree, { root, format: "json" })).toEqual(structured);
		expect(extractDocument(tree, { format: "json" })).toEqual(wholeStructured);
	} finally {
		queries.close();
		tree.close();
	}
});

it("retains reader provenance for allowed table attributes without reconstructing spans", () => {
	const tree = loadResearchDocument(
		response(
			'<table style="color:red"><caption>Owned sample</caption>' +
				'<tr><th id="device" scope="col">Device</th><th scope="col">Memory</th></tr>' +
				'<tr><td rowspan="2" colspan="2" headers="device">GPU-A</td><td>雪</td></tr>' +
				'<tr><td headers="device">Only</td></tr></table>',
		),
		context,
	);
	try {
		const info = researchReaderInfo(tree);
		expect(info).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			ignoredAttributes: 1,
		});
		const structured = extractDocument(tree, { format: "json" });
		if (structured.format !== "json") throw new Error("Unexpected format");
		expect(structured.reader).toEqual(info);
		const cells = readerTableCells(structured.content);
		const labels = ["Device", "Memory", "GPU-A", "雪", "Only"];
		expect(cells).toHaveLength(labels.length);
		for (const [index, cell] of cells.entries()) {
			expect(cell).toEqual({
				ref: cell.ref,
				type: "cell",
				children: [
					{
						ref: expect.any(String),
						type: "text",
						text: labels[index],
					},
				],
			});
		}
		expect(cells.map((cell) => tree.resolve(cell.ref).attributes)).toEqual([
			{ id: "device", scope: "col" },
			{ scope: "col" },
			{ rowspan: "2", colspan: "2", headers: "device" },
			{},
			{ headers: "device" },
		]);
		const markdown = extractDocument(tree);
		expect(markdown.partial).toBe(true);
		expect(markdown.reader).toEqual(info);
		expect(markdown.content).toBe(
			readerTableBlocks(
				readerTableMarkers.tableBegin,
				"Owned sample",
				readerTableMarkers.rowBegin,
				readerTableMarkers.cellBegin,
				"Device",
				readerTableMarkers.cellEnd,
				readerTableMarkers.cellBegin,
				"Memory",
				readerTableMarkers.cellEnd,
				readerTableMarkers.rowEnd,
				readerTableMarkers.rowBegin,
				readerTableMarkers.cellBegin,
				"GPU\\-A",
				readerTableMarkers.cellEnd,
				readerTableMarkers.cellBegin,
				"雪",
				readerTableMarkers.cellEnd,
				readerTableMarkers.rowEnd,
				readerTableMarkers.rowBegin,
				readerTableMarkers.cellBegin,
				"Only",
				readerTableMarkers.cellEnd,
				readerTableMarkers.rowEnd,
				readerTableMarkers.tableEnd,
			),
		);
		expect(extractDocument(tree, { format: "json" })).toEqual(structured);
	} finally {
		tree.close();
	}
});

it("uses linear reader boundaries even for equal cell counts and zero ignored attributes", () => {
	const tree = loadResearchDocument(
		response(
			"<p>GPU-A / Release-7</p><table>" +
				"<tr><th>Device</th><th>Mode</th></tr>" +
				"<tr><td>GPU-A</td><td>Release-7</td></tr></table>",
		),
		context,
	);
	try {
		const result = extractDocument(tree);
		expect(result.reader).toEqual(researchReaderInfo(tree));
		expect(result.reader).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			ignoredAttributes: 0,
			hiddenContentSemantics: false,
		});
		expect(result.content).toBe(
			readerTableBlocks(
				"GPU\\-A / Release\\-7",
				readerTableMarkers.tableBegin,
				readerTableMarkers.rowBegin,
				readerTableMarkers.cellBegin,
				"Device",
				readerTableMarkers.cellEnd,
				readerTableMarkers.cellBegin,
				"Mode",
				readerTableMarkers.cellEnd,
				readerTableMarkers.rowEnd,
				readerTableMarkers.rowBegin,
				readerTableMarkers.cellBegin,
				"GPU\\-A",
				readerTableMarkers.cellEnd,
				readerTableMarkers.cellBegin,
				"Release\\-7",
				readerTableMarkers.cellEnd,
				readerTableMarkers.rowEnd,
				readerTableMarkers.tableEnd,
			),
		);
	} finally {
		tree.close();
	}
});

it("keeps source-hidden table styling limitations explicit in reader extraction", () => {
	const tree = loadResearchDocument(
		response(
			'<table hidden style="display:none"><tr>' +
				'<td aria-hidden="true" style="display:none">Reader retained</td>' +
				"<td></td></tr><tr></tr></table>",
		),
		context,
	);
	try {
		const result = extractDocument(tree);
		expect(result.partial).toBe(true);
		expect(result.reader).toEqual(researchReaderInfo(tree));
		expect(result.reader).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			ignoredAttributes: 4,
		});
		expect(result.content).toBe(
			readerTableBlocks(
				readerTableMarkers.tableBegin,
				readerTableMarkers.rowBegin,
				readerTableMarkers.cellBegin,
				"Reader retained",
				readerTableMarkers.cellEnd,
				readerTableMarkers.cellBegin,
				readerTableMarkers.cellEnd,
				readerTableMarkers.rowEnd,
				readerTableMarkers.rowBegin,
				readerTableMarkers.rowEnd,
				readerTableMarkers.tableEnd,
			),
		);
		const structured = extractDocument(tree, { format: "json" });
		if (structured.format !== "json") throw new Error("Unexpected format");
		expect(structured.reader).toEqual(result.reader);
		expect(
			readerTableCells(structured.content).map((cell) => cell.children?.length),
		).toEqual([1, 0]);
	} finally {
		tree.close();
	}
});
