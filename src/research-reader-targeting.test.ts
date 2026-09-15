import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const url = "https://reader-targeting.fixture.invalid/article";
const documents: DocumentTree[] = [];
const profiles = ["default", "long-v1"] as const;
const source =
	'<nav class="menu" role="navigation">Menu</nav><div id="article" class="body content" role="main"><h1>Article</h1><p>Useful prose.</p><pre>if ready:\n    act()</pre></div><footer class="footer" role="contentinfo">Footer</footer>';

function response(html: string) {
	const body = new TextEncoder().encode(html);
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

function reader(
	html = source,
	profile: (typeof profiles)[number] = "default",
	overrides: Partial<DocumentLoaderContext> = {},
) {
	const tree = loadResearchDocument(
		response(html),
		{
			tabId: "reader-targeting",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50000,
				maxDepth: 128,
				maxTextCodeUnits: 2000000,
				maxChanges: 1024,
			},
			...overrides,
		},
		profile,
		"separate-omitted-raw-v1",
	);
	documents.push(tree);
	return { tree, queries: new DocumentQueries(tree) };
}

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.restoreAllMocks();
});

it.each(profiles)(
	"preserves class/role article targets in the %s reader",
	(profile) => {
		const { tree, queries } = reader(source, profile);
		const matches = queries.querySelectorAll('.body.content[role="main"]');
		expect(matches).toHaveLength(1);
		expect(tree.get(matches[0]).attributes).toEqual({
			id: "article",
			class: "body content",
			role: "main",
		});
		expect(queries.querySelector('[role="navigation"]')).not.toBeNull();
		expect(queries.querySelector('[role="contentinfo"]')).not.toBeNull();
		const result = extractDocument(tree, {
			root: tree.reference(matches[0]),
			format: "markdown",
		});
		expect(result.content).toContain("# Article");
		expect(result.content).toContain("Useful prose");
		expect(result.content).toContain("if ready:\n    act()");
		expect(result.content).not.toContain("Menu");
		expect(result.content).not.toContain("Footer");
		expect(researchReaderInfo(tree)).toMatchObject({
			ignoredAttributes: 0,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
		});
	},
);

it.each([
	"div",
	"main",
	"article",
	"section",
	"nav",
	"aside",
	"header",
	"footer",
	"p",
	"span",
	"h1",
	"a",
	"table",
])(
	"keeps inert source targeting attributes on preserved %s elements",
	(tag) => {
		const { tree, queries } = reader(
			`<${tag} class="owned" role="main">Text</${tag}>`,
		);
		const matches = queries.querySelectorAll('.owned[role="main"]');
		expect(matches).toHaveLength(1);
		expect(tree.get(matches[0]).tagName).toBe(tag);
	},
);

it("retains raw class/role token strings without inventing role semantics", () => {
	const { tree, queries } = reader(
		'<div class="one\ttwo  three" role="unknown main">Text</div>',
	);
	const match = queries.querySelector('.two[role~="main"]');
	expect(match).not.toBeNull();
	expect(tree.get(match as number).attributes).toEqual({
		class: "one\ttwo  three",
		role: "unknown main",
	});
	expect(queries.querySelector('[role="main"]')).toBeNull();
});

it("escapes retained attributes instead of creating active attributes or elements", () => {
	const value = 'owned" onclick="bad() <script>&';
	const { tree, queries } = reader(
		`<div class='${value}' role='${value}'>Text</div>`,
	);
	const match = queries.querySelector("div");
	expect(tree.get(match as number).attributes).toEqual({
		class: value,
		role: value,
	});
	expect(queries.querySelector("[onclick]")).toBeNull();
	expect(queries.querySelector("script")).toBeNull();
	expect(tree.textContent(match as number)).toBe("Text");
});

it("keeps classes as inert data without restoring CSS, hiding or resource hooks", () => {
	const fetch = vi.fn();
	const start = vi.fn();
	const { tree, queries } = reader(
		'<style>.hidden {display:none}</style><script src="/never"></script><div class="hidden" role="main" style="display:none" hidden inert aria-hidden="true" onclick="bad()" data-extra="drop">Still readable</div><img class="photo" src="/never.png" alt="Diagram">',
		"default",
		{
			fetchStylesheet: fetch,
			fetchScript: fetch,
			fetchImage: fetch,
			scripts: { start } as unknown as DocumentLoaderContext["scripts"],
		},
	);
	expect(queries.querySelector(".hidden[role=main]")).not.toBeNull();
	expect(queries.querySelector(".photo")).not.toBeNull();
	for (const selector of [
		"style",
		"script",
		"[style]",
		"[hidden]",
		"[inert]",
		"[aria-hidden]",
		"[onclick]",
		"[data-extra]",
		"[src]",
	])
		expect(queries.querySelector(selector)).toBeNull();
	expect(extractDocument(tree).content).toContain("Still readable");
	expect(fetch).not.toHaveBeenCalled();
	expect(start).not.toHaveBeenCalled();
});

it.each(["form", "button", "custom-container", "xmp"])(
	"does not transfer class/role identity from unwrapped or remapped %s elements",
	(tag) => {
		const { queries } = reader(
			`<${tag} id="point" class="not-retained" role="main">Text</${tag}>`,
		);
		expect(queries.querySelector("#point")).not.toBeNull();
		expect(queries.querySelector(".not-retained")).toBeNull();
		expect(queries.querySelector("[role]")).toBeNull();
	},
);

it.each(["script", "style", "iframe", "template", "svg", "math"])(
	"does not resurrect targeting attributes from omitted %s subtrees",
	(tag) => {
		const { queries } = reader(
			`<${tag} id="omitted" class="missing" role="main">Hidden subtree</${tag}><p>Kept</p>`,
		);
		expect(queries.querySelector("#omitted")).toBeNull();
		expect(queries.querySelector(".missing")).toBeNull();
		expect(queries.querySelector("[role]")).toBeNull();
	},
);

it.each(["class", "role"])(
	"charges retained %s bytes to existing source/output/document limits",
	(attribute) => {
		const html = `<div ${attribute}="${"x".repeat(200)}">Text</div>`;
		const sanitized = sanitizeResearchHtml(html);
		expect(sanitized.report.ignoredAttributes).toBe(0);
		expect(sanitized.html).toContain(`${attribute}="${"x".repeat(200)}"`);
		expect(() =>
			sanitizeResearchHtml(html, { maxSourceCodeUnits: html.length - 1 }),
		).toThrowError(expect.objectContaining({ code: "resource-limit" }));
		let failure: unknown;
		try {
			sanitizeResearchHtml(html, {
				maxOutputCodeUnits: sanitized.html.length - 1,
			});
		} catch (error) {
			failure = error;
		}
		expect(resourceLimitDiagnostic(failure)).toMatchObject({
			kind: "reader.output",
			limit: sanitized.html.length - 1,
		});
		expect(() =>
			reader(html, "default", {
				limits: {
					maxNodes: 50000,
					maxDepth: 128,
					maxTextCodeUnits: 100,
					maxChanges: 1024,
				},
			}),
		).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("allows captured class/role replay selection without a new request", async () => {
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValueOnce(response(source));
	const report = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
	);
	const raw = serializeResearchReport(report).jsonl;
	const before = raw.slice();
	const hash = (bytes: Uint8Array) =>
		createHash("sha256").update(bytes).digest("hex");
	const body = new TextEncoder().encode(source);
	request.mockClear();
	const result = extractResearchReplayJson(
		raw,
		{
			expectedProfile: "default",
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.length, sha256: hash(body) },
		},
		{ selector: '.body[role="main"]' },
		undefined,
		"markdown",
	);
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
		networkRequests: 0,
		selection: { matches: 1 },
	});
	expect(result.report.extraction?.content).toContain("Useful prose");
	expect(result.report.extraction?.content).not.toContain("Menu");
	expect(request).not.toHaveBeenCalled();
	expect(Buffer.from(raw).equals(Buffer.from(before))).toBe(true);
});
