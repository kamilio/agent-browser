import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchNavigation } from "../scripts/research-browser.js";
import type { DocumentTree } from "./document.js";
import { type DocumentExtraction, extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type {
	ResearchReaderRawPolicy,
	ResearchReaderVisibilityPolicy,
} from "./research-reader-info.js";
import {
	type ResearchSourceAccess,
	researchSourceAccess,
} from "./research-source-access.js";
import { researchSourceDataTables } from "./research-source-data-tables.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";

const url = "https://source-access.fixture.invalid/article";
const encoder = new TextEncoder();
const formats = ["markdown", "json"] as const;
const rawModes = [
	{ name: "default", rawPolicy: undefined },
	{ name: "separate", rawPolicy: "separate-omitted-raw-v1" },
] as const;
const visibilityModes = [
	{ visibility: "source", visibilityPolicy: undefined },
	{ visibility: "attributes", visibilityPolicy: "source-hidden-v1" },
	{ visibility: "inline", visibilityPolicy: "source-hidden-inline-v1" },
] as const;
const context: DocumentLoaderContext = {
	tabId: "source-access-fixture",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
const article =
	'<main id="article"><h1>Guide</h1><p>Visible café evidence 😀.</p></main>';
const trees: DocumentTree[] = [];

function declaration(value: boolean | string = false): string {
	return JSON.stringify({
		"@context": "https://schema.org",
		isAccessibleForFree: value,
	});
}

function script(
	payload = declaration(),
	attributes = "",
	type = "application/ld+json",
): string {
	return `<script type="${type}"${attributes ? ` ${attributes}` : ""}>${payload}</script>`;
}

function inactive(source: string): string {
	return source.replaceAll(
		"application/ld+json",
		"x".repeat("application/ld+json".length),
	);
}

function response(source: string, mime = "text/html"): NetworkResponse {
	const body = encoder.encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": [`${mime}; charset=utf-8`] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function load(
	source: string,
	rawPolicy?: ResearchReaderRawPolicy,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
	mime = "text/html",
	loaderContext = context,
): DocumentTree {
	const tree = loadResearchDocument(
		response(source, mime),
		loaderContext,
		undefined,
		rawPolicy,
		visibilityPolicy,
	);
	trees.push(tree);
	return tree;
}

function sanitize(
	source: string,
	rawPolicy?: ResearchReaderRawPolicy,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
) {
	return sanitizeResearchHtml(
		source,
		{},
		undefined,
		undefined,
		rawPolicy,
		visibilityPolicy,
	);
}

function requiredAccess(
	data: ResearchSourceAccess | undefined,
): ResearchSourceAccess {
	if (!data) throw new Error("Expected source access declarations");
	return data;
}

function bytes(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

function withoutReferences(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (key, child) =>
			["document", "scope", "ref"].includes(key) ? undefined : child,
		),
	);
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected a reader resource limit");
}

function expectFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectFrozen(child);
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error("Unexpected source access fixture request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Source access fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		try {
			for (const tree of trees.splice(0)) tree.close();
			for (const session of new Set(
				vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
			))
				if (session instanceof BrowserSession) session.close();
			for (const transport of new Set(
				vi.mocked(NodeNetworkTransport.prototype.request).mock.contexts,
			))
				if (transport instanceof NodeNetworkTransport) transport.close();
		} finally {
			vi.restoreAllMocks();
			vi.unstubAllGlobals();
		}
	}
});

describe("source access reader admission", () => {
	it.each(rawModes)(
		"uses normalized UTF-16 opening offsets with $name raw accounting",
		({ rawPolicy }) => {
			const graph = JSON.stringify({
				"@context": "http://schema.org/",
				"@graph": [
					{
						isAccessibleForFree: "TRUE",
						hasPart: { isAccessibleForFree: false },
					},
				],
			});
			const source = `<!--😀\r\npréface-->\r${script(graph)}\r\n${script(declaration("FaLsE"))}${article}`;
			const normalized = source.replace(/\r\n?/g, "\n");
			const firstOffset = normalized.indexOf("<script");
			const lastOffset = normalized.lastIndexOf("<script");
			const sanitized = sanitize(source, rawPolicy);
			const tree = load(source, rawPolicy);
			const data = requiredAccess(researchSourceAccess(tree));
			expect(data).toEqual({
				kind: "jsonld-free-access-declarations-v1",
				scope: "document-source",
				partial: true,
				verified: false,
				truncated: false,
				entries: [
					{
						source: { offset: firstOffset },
						path: "$.@graph[0]",
						value: "TRUE",
					},
					{
						source: { offset: firstOffset },
						path: "$.@graph[0].hasPart",
						value: false,
					},
					{ source: { offset: lastOffset }, path: "$", value: "FaLsE" },
				],
			});
			expect(data).toEqual(sanitized.sourceAccess);
			expect(firstOffset).not.toBe(source.indexOf("<script"));
			expect(firstOffset).not.toBe(
				encoder.encode(normalized.slice(0, firstOffset)).byteLength,
			);
			expectFrozen(data);
			for (const format of formats)
				expect(extractDocument(tree, { format }).sourceAccess).toBe(data);
		},
	);

	it.each([
		"application/ld+json",
		"APPLICATION/LD+JSON",
		" \tApplication/Ld+Json\n ",
		"application/ld&#43;json",
	])("accepts the decoded, trimmed case-insensitive LD type %j", (type) => {
		const source = script(declaration(), "", type).replaceAll(
			"script",
			"SCRIPT",
		);
		expect(requiredAccess(researchSourceAccess(load(source))).entries).toEqual([
			{ source: { offset: 0 }, path: "$", value: false },
		]);
	});

	it.each(
		rawModes.flatMap((rawMode) =>
			visibilityModes.map((visibilityMode) => ({
				...rawMode,
				...visibilityMode,
			})),
		),
	)(
		"obeys $visibility visibility independently of $name raw accounting",
		({ rawPolicy, visibilityPolicy }) => {
			const blocks = [
				script(declaration(), 'id="visible"'),
				script(declaration(), 'id="hidden-self" hidden'),
				`<div hidden>${script(declaration(), 'id="hidden-child"')}</div>`,
				`<div aria-hidden="TRUE">${script(declaration(), 'id="aria-child"')}</div>`,
				script(declaration(), 'id="inline-self" style="display:none"'),
				`<div style="display:none">${script(declaration(), 'id="inline-child"')}</div>`,
				script(declaration(), 'id="aria-false" aria-hidden="false"'),
			];
			const source = `${blocks.join("")}${article}`;
			const expected = ["visible"];
			if (visibilityPolicy === undefined)
				expected.push("hidden-self", "hidden-child", "aria-child");
			if (visibilityPolicy !== "source-hidden-inline-v1")
				expected.push("inline-self", "inline-child");
			expected.push("aria-false");
			const sanitized = sanitize(source, rawPolicy, visibilityPolicy);
			const control = sanitize(inactive(source), rawPolicy, visibilityPolicy);
			const tree = load(source, rawPolicy, visibilityPolicy);
			const data = requiredAccess(researchSourceAccess(tree));
			expect(data.entries).toEqual(
				expected.map((id) => ({
					source: {
						offset: source.indexOf(
							`<script type="application/ld+json" id="${id}"`,
						),
					},
					path: "$",
					value: false,
				})),
			);
			expect(data.truncated).toBe(false);
			expect(data).toEqual(sanitized.sourceAccess);
			expect(sanitized.html).toBe(control.html);
			expect(sanitized.report).toEqual(control.report);
		},
	);

	it.each(
		rawModes.flatMap((mode) =>
			[
				"template",
				"svg",
				"math",
				"object",
				"canvas",
				"iframe",
				"noembed",
				"noframes",
				"textarea",
			].map((tag) => ({ ...mode, tag })),
		),
	)(
		"does not collect or spend block capacity inside $tag with $name raw accounting",
		({ rawPolicy, tag }) => {
			const omitted = `<${tag}>${script(declaration(true)).repeat(9)}</${tag}>`;
			const source = `${omitted}${script()}${article}`;
			const sanitized = sanitize(source, rawPolicy);
			const data = requiredAccess(
				researchSourceAccess(load(source, rawPolicy)),
			);
			expect(data.entries).toEqual([
				{ source: { offset: omitted.length }, path: "$", value: false },
			]);
			expect(data.truncated).toBe(false);
			expect(data).toEqual(sanitized.sourceAccess);
		},
	);

	it.each(rawModes)(
		"ignores script-shaped comments and raw text with $name raw accounting",
		({ rawPolicy }) => {
			const fake = script(declaration(true));
			const prefix = `<!--${fake}--><style>${fake}</style><xmp>${fake}</xmp>`;
			const source = `${prefix}${script()}${article}`;
			expect(
				requiredAccess(researchSourceAccess(load(source, rawPolicy))).entries,
			).toEqual([
				{ source: { offset: prefix.length }, path: "$", value: false },
			]);
		},
	);

	it.each([
		{ name: "missing type", markup: `<script>${declaration()}</script>` },
		{
			name: "ordinary JSON",
			markup: script(declaration(), "", "application/json"),
		},
		{
			name: "JavaScript",
			markup: script(declaration(), "", "text/javascript"),
		},
		{
			name: "type parameters",
			markup: script(declaration(), "", "application/ld+json; charset=utf-8"),
		},
		{ name: "malformed JSON", markup: script('{"@context":') },
		{
			name: "JavaScript suffix",
			markup: script(`${declaration()};globalThis.sourceAccessProbe()`),
		},
		{
			name: "HTML entities in JSON",
			markup: script(
				"{&quot;@context&quot;:&quot;https://schema.org&quot;,&quot;isAccessibleForFree&quot;:false}",
			),
		},
		{
			name: "missing context",
			markup: script('{"isAccessibleForFree":false}'),
		},
		{
			name: "unknown context",
			markup: script(
				'{"@context":"https://schema.org.evil.invalid","isAccessibleForFree":false}',
			),
		},
		{
			name: "padded declaration value",
			markup: script(declaration(" false ")),
		},
	])("ignores $name without poisoning a later valid block", ({ markup }) => {
		const empty = load(`${markup}${article}`);
		expect(researchSourceAccess(empty)).toBeUndefined();
		for (const format of formats)
			expect(extractDocument(empty, { format })).not.toHaveProperty(
				"sourceAccess",
			);
		const tree = load(`${markup}${script()}${article}`);
		expect(requiredAccess(researchSourceAccess(tree)).entries).toEqual([
			{ source: { offset: markup.length }, path: "$", value: false },
		]);
	});

	it.each(rawModes)(
		"preserves raw reports and text admission limits with $name accounting",
		({ rawPolicy }) => {
			const payload = declaration();
			const source = `${script(payload)}<p>Visible Ω</p>`;
			const controlSource = inactive(source);
			const selected = sanitize(source, rawPolicy);
			const control = sanitize(controlSource, rawPolicy);
			expect(selected.html).toBe(control.html);
			expect(selected.report).toEqual(control.report);
			expect(selected.report.textCodeUnits).toBe(
				"Visible Ω".length + (rawPolicy ? 0 : payload.length),
			);
			if (rawPolicy)
				expect(selected.report.omittedRaw).toMatchObject({
					codeUnits: payload.length,
					elements: 1,
				});
			else expect(selected.report).not.toHaveProperty("omittedRaw");
			const maxTextCodeUnits = selected.report.textCodeUnits;
			for (const input of [source, controlSource]) {
				expect(
					sanitizeResearchHtml(
						input,
						{ maxTextCodeUnits },
						undefined,
						undefined,
						rawPolicy,
					).report,
				).toEqual(selected.report);
				const error = failure(() =>
					sanitizeResearchHtml(
						input,
						{ maxTextCodeUnits: maxTextCodeUnits - 1 },
						undefined,
						undefined,
						rawPolicy,
					),
				);
				expect(resourceLimitDiagnostic(error)).toEqual({
					kind: "reader.text",
					unit: "code-units",
					limit: maxTextCodeUnits - 1,
					observed: maxTextCodeUnits,
				});
			}
		},
	);

	it.each(rawModes)(
		"skips oversized advisory payloads without changing $name raw budgets",
		({ rawPolicy }) => {
			const oversized = JSON.stringify({
				"@context": "https://schema.org",
				isAccessibleForFree: true,
				articleBody: "x".repeat(65_536),
			});
			const prefix = script(oversized);
			const source = `${prefix}${script()}${article}`;
			const selected = sanitize(source, rawPolicy);
			const control = sanitize(inactive(source), rawPolicy);
			expect(selected.report).toEqual(control.report);
			expect(selected.html).toBe(control.html);
			const data = requiredAccess(
				researchSourceAccess(load(source, rawPolicy)),
			);
			expect(data.entries).toEqual([
				{ source: { offset: prefix.length }, path: "$", value: false },
			]);
			expect(data.truncated).toBe(true);
		},
	);

	it.each(rawModes)(
		"keeps scripts and articleBody inert with $name raw accounting",
		({ rawPolicy }) => {
			const forbidden = vi.fn(() => {
				throw new Error("Source declarations cannot execute or fetch");
			});
			vi.stubGlobal("sourceAccessProbe", forbidden);
			const initializeDocument = vi.fn();
			const payload = JSON.stringify({
				"@context": "https://schema.org",
				isAccessibleForFree: false,
				articleBody: "ARTICLE_BODY_SECRET Verify you are human with Cloudflare",
				review: { reviewBody: "REVIEW_BODY_SECRET" },
				hasPart: { isAccessibleForFree: "TRUE", text: "MEMBER_PAYLOAD_SECRET" },
			});
			const source = `${script(payload, 'src="/never.jsonld"')}<script src="/never.js">globalThis.sourceAccessProbe()</script>${article}`;
			const tree = load(source, rawPolicy, undefined, "text/html", {
				...context,
				initializeDocument,
				fetchStylesheet: forbidden,
				fetchScript: forbidden,
				fetchImage: forbidden,
				scripts: {
					start: forbidden,
				} as unknown as DocumentLoaderContext["scripts"],
			});
			const queries = new DocumentQueries(tree);
			expect(queries.querySelector("script")).toBeNull();
			expect(queries.querySelector("[src]")).toBeNull();
			for (const format of formats) {
				const result = extractDocument(tree, { format });
				expect(
					requiredAccess(result.sourceAccess).entries.map(
						(entry) => entry.value,
					),
				).toEqual([false, "TRUE"]);
				expect(result.reader).toMatchObject({
					scripting: false,
					styling: false,
				});
				for (const marker of [
					"ARTICLE_BODY_SECRET",
					"REVIEW_BODY_SECRET",
					"MEMBER_PAYLOAD_SECRET",
					"sourceAccessProbe",
					"Cloudflare",
				])
					expect(JSON.stringify(result)).not.toContain(marker);
			}
			expect(forbidden).not.toHaveBeenCalled();
			expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
			expect(initializeDocument).toHaveBeenCalledOnce();
		},
	);
});

describe("source access extraction integration", () => {
	it.each(formats)(
		"retains document-source provenance through %s focus and close",
		(format) => {
			const source = `${script()}<aside>Outside scope evidence</aside>${article}`;
			const tree = load(source);
			const data = requiredAccess(researchSourceAccess(tree));
			const before = JSON.stringify(data);
			const selected = new DocumentQueries(tree).querySelector("#article");
			if (selected === null) throw new Error("Expected article fixture");
			const root = tree.reference(selected);
			const whole = extractDocument(tree, { format });
			const focused = extractDocument(tree, {
				format,
				contentFocus: "main-content-v1",
			});
			const explicit = extractDocument(tree, { format, root });
			expect(focused.scope).toBe(root);
			expect(explicit.scope).toBe(root);
			expect(focused.contentSelection).toMatchObject({
				selected: "main",
				reason: "unique-main",
			});
			expect(focused.content).toEqual(explicit.content);
			expect(JSON.stringify(whole.content)).toContain("Outside scope evidence");
			for (const result of [whole, focused, explicit]) {
				expect(result.sourceAccess).toBe(data);
				expect(result.sourceAccess?.scope).toBe("document-source");
				expect(JSON.stringify(result.content)).toContain(
					"Visible café evidence",
				);
				expect(JSON.stringify(result.content)).not.toContain(
					"isAccessibleForFree",
				);
			}
			expect(JSON.stringify(focused.content)).not.toContain(
				"Outside scope evidence",
			);
			tree.close();
			expect(researchSourceAccess(tree)).toBeUndefined();
			expect(JSON.stringify(focused.sourceAccess)).toBe(before);
			expectFrozen(focused.sourceAccess);
			expect(researchSourceAccess(load(article))).toBeUndefined();
		},
	);

	it.each(formats)(
		"fits whole declaration prefixes within the %s UTF-8 byte budget",
		(format) => {
			const source = `${script()}${script(declaration("TRUE"))}${script(declaration(true))}${article}`;
			const tree = load(source);
			const full = extractDocument(tree, { format });
			const { sourceAccess, ...baseline } = full;
			const data = requiredAccess(sourceAccess);
			const before = JSON.stringify(data);
			expect(bytes(baseline)).toBeGreaterThan(JSON.stringify(baseline).length);
			expect(extractDocument(tree, { format, maxBytes: bytes(full) })).toEqual(
				full,
			);
			expect(
				extractDocument(tree, { format, maxBytes: bytes(baseline) }),
			).toEqual(baseline);
			expect(() =>
				extractDocument(tree, { format, maxBytes: bytes(baseline) - 1 }),
			).toThrowError(expect.objectContaining({ code: "resource-limit" }));
			const prefix: ResearchSourceAccess = {
				...data,
				truncated: true,
				entries: data.entries.slice(0, 1),
			};
			const expected = { ...baseline, sourceAccess: prefix };
			const maxBytes = bytes(expected);
			const fitted = extractDocument(tree, { format, maxBytes });
			expect(fitted).toEqual(expected);
			expect(bytes(fitted)).toBe(maxBytes);
			expectFrozen(fitted.sourceAccess);
			expect(extractDocument(tree, { format, maxBytes: maxBytes - 1 })).toEqual(
				baseline,
			);
			expect(researchSourceAccess(tree)).toBe(data);
			expect(JSON.stringify(data)).toBe(before);
			expect(extractDocument(tree, { format })).toEqual(full);
		},
	);

	it.each(formats)(
		"gives table metadata priority over access metadata in %s",
		(format) => {
			const payload = JSON.stringify({
				items: [
					{
						title: "Série Ω",
						elementsOrder: ["memory"],
						elements: {
							memory: {
								title: "Mémoire dédiée",
								formatValue: "96",
								suffix: " Go",
							},
						},
					},
				],
			})
				.replaceAll("&", "&amp;")
				.replaceAll('"', "&quot;");
			const source = `${script()}<section data-json="${payload}"></section>${article}`;
			const tree = load(source);
			const full = extractDocument(tree, { format });
			const { sourceAccess, sourceDataTables, ...baseline } = full;
			const data = requiredAccess(sourceAccess);
			expect(sourceDataTables).toBeDefined();
			expect(sourceDataTables).toBe(researchSourceDataTables(tree));
			const expected = { ...baseline, sourceDataTables };
			const maxBytes = bytes(expected);
			expect(bytes({ ...baseline, sourceAccess: data })).toBeLessThanOrEqual(
				maxBytes,
			);
			const fitted = extractDocument(tree, { format, maxBytes });
			expect(fitted).toEqual(expected);
			expect(fitted).not.toHaveProperty("sourceAccess");
			expect(bytes(fitted)).toBe(maxBytes);
			expect(fitted.content).toEqual(full.content);
			expect(researchSourceAccess(tree)).toBe(data);
			expect(extractDocument(tree, { format, maxBytes: bytes(full) })).toEqual(
				full,
			);
		},
	);

	it.each(rawModes)(
		"preserves Markdown text-prefix behavior with $name raw accounting",
		({ rawPolicy }) => {
			const source = `${script()}<main><p>${"Readable café evidence 😀. ".repeat(1000)}</p></main>`;
			const tree = load(source, rawPolicy);
			const control = load(inactive(source), rawPolicy);
			const full = extractDocument(tree);
			expect(
				extractDocument(tree, { outputLimitPolicy: "text-prefix-v1" }),
			).toEqual(full);
			const maxBytes = 4096;
			const strict = failure(() => extractDocument(tree, { maxBytes }));
			const options = {
				maxBytes,
				outputLimitPolicy: "text-prefix-v1",
			} as const;
			const result = extractDocument(tree, options);
			const baseline = extractDocument(control, options);
			expect(result.contentFallback).toMatchObject({
				truncated: true,
				trigger: resourceLimitDiagnostic(strict),
			});
			const { sourceAccess, ...withoutAccess } = result;
			expect(withoutReferences(withoutAccess)).toEqual(
				withoutReferences(baseline),
			);
			expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
			expect(result.content).toContain("Readable café evidence");
			if (sourceAccess)
				expect(sourceAccess.entries).toEqual(full.sourceAccess?.entries);
			expect(researchSourceAccess(tree)).toBe(full.sourceAccess);
		},
	);

	it.each(
		formats.flatMap((format) =>
			["text/plain", "text/markdown", "application/json"].map((mime) => ({
				format,
				mime,
			})),
		),
	)(
		"does not attach source access to $mime extracted as $format",
		({ format, mime }) => {
			const source =
				mime === "application/json"
					? JSON.stringify({
							html: script(),
							"@context": "https://schema.org",
							isAccessibleForFree: false,
						})
					: `${script()}${article}`;
			const tree = load(source, "separate-omitted-raw-v1", undefined, mime);
			expect(researchSourceAccess(tree)).toBeUndefined();
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceAccess",
			);
		},
	);
});

describe("source access mocked research workflow", () => {
	it.each(
		[false, true, "FALSE"].flatMap((value) =>
			[false, true].map((challenge) => ({ value, challenge })),
		),
	)(
		"leaves outcome and barriers unchanged for $value with challenge=$challenge",
		async ({ value, challenge }) => {
			const source = `${script(declaration(value))}${article}`;
			const reports = [];
			for (const input of [inactive(source), source]) {
				const fixture = response(input);
				if (challenge)
					fixture.headers = {
						...fixture.headers,
						"cf-mitigated": ["challenge"],
					};
				const original = fixture.body.slice();
				vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
					fixture,
				);
				const report = await researchNavigation(
					url,
					true,
					undefined,
					undefined,
					false,
					undefined,
					undefined,
					false,
					undefined,
					undefined,
					{
						format: "json",
						readerRawPolicy: "separate-omitted-raw-v1",
						minRequestIntervalMs: 0,
					},
				);
				expect(fixture.body).toEqual(original);
				expect(report.metrics).toMatchObject({ active: 0, closed: true });
				reports.push(report);
			}
			const [control, selected] = reports;
			expect(selected.outcome).toBe(control.outcome);
			expect(selected.contentSuccess).toBe(control.contentSuccess);
			expect(selected.classification).toEqual(control.classification);
			expect(selected.failure).toEqual(control.failure);
			if (challenge) {
				expect(selected).toMatchObject({
					outcome: "semantic-barrier",
					contentSuccess: false,
					classification: { barrier: "challenge" },
					failure: { category: "policy-denied", stage: "semantic-barrier" },
				});
				expect(selected.extraction).toBeUndefined();
			} else {
				expect(selected).toMatchObject({
					outcome: "extracted-unverified",
					contentSuccess: null,
					classification: { barrier: null, diagnostic: null },
				});
				expect(control.extraction).not.toHaveProperty("sourceAccess");
				const extracted = selected.extraction;
				if (!extracted) throw new Error("Expected mocked research extraction");
				const { sourceAccess, ...baseline }: DocumentExtraction = extracted;
				expect(requiredAccess(sourceAccess).entries).toEqual([
					{ source: { offset: 0 }, path: "$", value },
				]);
				expect(withoutReferences(baseline)).toEqual(
					withoutReferences(control.extraction),
				);
			}
			expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
			expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
				expect.objectContaining({
					url,
					cookieContext: expect.objectContaining({ credentials: "omit" }),
				}),
			);
			expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(2);
			expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(2);
		},
	);
});
