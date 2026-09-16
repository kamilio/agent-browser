import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	hasResearchExtractionContent,
	researchDocumentDiagnosticText,
	researchExtractionDiagnosticText,
} from "../scripts/research-content.js";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { researchReaderInfo } from "./research-reader-info.js";
import {
	type ResearchSourceChartCell,
	type ResearchSourceChartTables,
	infogramChartRoute,
	researchSourceChartTables,
	setResearchSourceChartTables,
} from "./research-source-chart-tables.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const embedId = "11111111-1111-1111-1111-111111111111";
const url = `https://e.infogram.com/${embedId}?src=embed`;
const encoder = new TextEncoder();
const formats = ["markdown", "json"] as const;
const readerModes = (["default", "long-v1"] as const).flatMap((profile) =>
	([undefined, "separate-omitted-raw-v1"] as const).map((rawPolicy) => ({
		profile,
		rawPolicy,
	})),
);
const extractionModes = readerModes.flatMap((mode) =>
	formats.map((format) => ({ ...mode, format })),
);
const article =
	'<main id="article"><h1 id="guide">Guide</h1><p>Visible café evidence 😀.</p></main>';
const context: DocumentLoaderContext = {
	tabId: "source-chart-fixture",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
const trees: DocumentTree[] = [];
type LoaderArguments = Parameters<typeof loadResearchDocument>;
interface LoadOptions {
	profile?: LoaderArguments[2];
	rawPolicy?: LoaderArguments[3];
	visibilityPolicy?: LoaderArguments[4];
	mime?: string;
	url?: string;
	redirects?: NetworkResponse["redirects"];
	context?: DocumentLoaderContext;
}
type Scalar = string | number | boolean | null;
type SourceCell = { value: Scalar } | null;

function matrix(): SourceCell[][] {
	return [
		[{ value: "Model" }, { value: "Score" }, { value: "Flag" }],
		[{ value: "Source model" }, { value: 0 }, { value: false }],
		[{ value: "Missing model" }, null, { value: null }],
		[{ value: "Literal model" }, { value: "" }, { value: "N/A" }],
		[
			{ value: "Unicode model" },
			{ value: 'café 😀 "\\\n' },
			{ value: "<b>&amp;</b>" },
		],
	];
}

function payload(sheets: SourceCell[][][] = [matrix()]) {
	return {
		path: embedId,
		public: true,
		publicAccess: false,
		description: "PRIVATE_SOURCE_DESCRIPTION verify you are human captcha",
		elements: {
			content: {
				content: {
					blockOrder: ["block"],
					blocks: { block: { entities: ["chart"] } },
					entities: {
						chart: {
							type: "CHART",
							props: {
								chartData: {
									data: sheets,
									sheetnames: sheets.map((_sheet, index) =>
										index === 0 ? "Source sheet" : `Source sheet ${index}`,
									),
									sheets_settings: sheets.map(() => ({
										xlabel: "Source unit",
									})),
								},
							},
						},
					},
				},
			},
		},
	};
}

function script(attributes = "", data: unknown = payload()): string {
	return `<script${attributes ? ` ${attributes}` : ""}>window.infographicData=${JSON.stringify(data)};</script>`;
}

function inactive(source: string): string {
	return source.replaceAll("window.infographicData", "window.inactiveFixture");
}

function sourceDataTable(): string {
	const data = JSON.stringify({
		items: [
			{
				title: "Série Ω",
				elementsOrder: ["memory"],
				elements: {
					memory: { title: "Mémoire", formatValue: "96", suffix: " Go" },
				},
			},
		],
	}).replaceAll('"', "&quot;");
	return `<section data-json="${data}"></section>`;
}

function response(source: string, options: LoadOptions = {}): NetworkResponse {
	const body = encoder.encode(source);
	return {
		url: options.url ?? url,
		status: 200,
		headers: {
			"content-type": [`${options.mime ?? "text/html"}; charset=utf-8`],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: options.redirects ?? [],
		elapsedMs: 0,
	};
}

function load(source: string, options: LoadOptions = {}): DocumentTree {
	const tree = loadResearchDocument(
		response(source, options),
		options.context ?? context,
		options.profile,
		options.rawPolicy,
		options.visibilityPolicy,
	);
	trees.push(tree);
	return tree;
}

function required(data: ResearchSourceChartTables | undefined) {
	if (!data) throw new Error("Expected source chart tables");
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

function expectFrozen(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) expectFrozen(child);
}

function expectPrefix(
	data: ResearchSourceChartTables | undefined,
	full: ResearchSourceChartTables,
): void {
	if (!data) return;
	expect(data.tables.length).toBeLessThanOrEqual(full.tables.length);
	expect(data).toEqual({
		...full,
		tables: full.tables.slice(0, data.tables.length),
		truncated: full.truncated || data.tables.length < full.tables.length,
	});
	expectFrozen(data);
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected resource limit failure");
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Source chart fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	const closed = trees.splice(0);
	try {
		for (const tree of closed) tree.close();
		for (const tree of closed)
			expect(researchSourceChartTables(tree)).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	}
});

describe("source chart reader integration", () => {
	it.each(extractionModes)(
		"adds only metadata for $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const source = `${script()}${article}`;
			const tree = load(source, options);
			const control = load(inactive(source), options);
			const { sourceChartTables, ...result } = extractDocument(tree, {
				format,
			});
			const baseline = extractDocument(control, { format });
			const data = required(sourceChartTables);
			expect(withoutReferences(result)).toEqual(withoutReferences(baseline));
			expect(baseline).not.toHaveProperty("sourceChartTables");
			expect(researchReaderInfo(tree)).toEqual(researchReaderInfo(control));
			expect(data).toMatchObject({
				kind: "infogram-chart-tables-v1",
				scope: "document-source",
				partial: true,
				rendered: false,
				verified: false,
				textFormat: "plain-text",
				embedId,
				truncated: false,
			});
			expect(data.tables).toHaveLength(1);
			expect(data.tables[0]).toMatchObject({
				sheetName: "Source sheet",
				axisLabel: "Source unit",
				source: {
					offset: 0,
					offsetBasis: "lf-normalized-utf16",
					sheetIndex: 0,
				},
				rows: matrix().map((row) =>
					row.map((cell) =>
						cell === null
							? { kind: "null-cell" }
							: { kind: "value-cell", value: cell.value },
					),
				),
			});
			expect(data.tables[0].source.path).toMatch(
				/^\$\.elements\.content\.content\.entities(?:\.chart|\["chart"\])\.props\.chartData\.data\[0\]$/,
			);
			expect(JSON.stringify(data)).not.toContain("PRIVATE_SOURCE_DESCRIPTION");
			expect(JSON.stringify(result.content)).toContain("Visible café evidence");
			for (const omitted of ["infographicData", "Source model", "<script"])
				expect(JSON.stringify(result.content)).not.toContain(omitted);
			expect(new DocumentQueries(tree).querySelector("script")).toBeNull();
			expect(data).toEqual(researchSourceChartTables(tree));
			expectFrozen(data);
		},
	);

	it.each(readerModes)(
		"requires explicit sanitizer route without changing $profile/$rawPolicy accounting",
		({ profile, rawPolicy }) => {
			const source = `<p>Before 😀</p>\r\n\r\n${script()}${article}`;
			const baseline = sanitizeResearchHtml(
				source,
				{},
				undefined,
				profile,
				rawPolicy,
			);
			const { sourceChartTables, ...selected } = sanitizeResearchHtml(
				source,
				{},
				undefined,
				profile,
				rawPolicy,
				undefined,
				undefined,
				undefined,
				infogramChartRoute(url),
			);
			expect(baseline).not.toHaveProperty("sourceChartTables");
			expect(selected).toEqual(baseline);
			const data = required(sourceChartTables);
			expect(data.tables[0].source).toMatchObject({
				offset: source.replace(/\r\n?/g, "\n").indexOf("<script"),
				offsetBasis: "lf-normalized-utf16",
			});
			expect(
				researchSourceChartTables(load(source, { profile, rawPolicy })),
			).toEqual(data);
		},
	);

	it.each(
		readerModes.flatMap((mode) =>
			[
				"",
				'type=""',
				'type="text/javascript"',
				'type="application/javascript"',
				'TYPE=" APPLICATION/JAVASCRIPT "',
			].map((attributes) => ({ ...mode, attributes })),
		),
	)(
		"accepts classic $attributes in $profile/$rawPolicy",
		({ attributes, ...options }) => {
			const source = script(attributes)
				.replace("<script", "<ScRiPt")
				.replace("</script>", "</ScRiPt>");
			expect(
				required(researchSourceChartTables(load(source, options))).tables,
			).toHaveLength(1);
		},
	);

	it.each(
		readerModes.flatMap((mode) =>
			[
				'src=""',
				'SRC="/never.js"',
				'type="module"',
				'type="application/json"',
				'type="application/ld+json"',
				'type="text/plain"',
				'type="text/javascript; charset=utf-8"',
			].map((attributes) => ({ ...mode, attributes })),
		),
	)(
		"ignores $attributes in $profile/$rawPolicy without poisoning eligible scripts",
		({ attributes, ...options }) => {
			const excluded = script(attributes);
			const tree = load(`${excluded}${article}`, options);
			expect(researchSourceChartTables(tree)).toBeUndefined();
			for (const format of formats)
				expect(extractDocument(tree, { format })).not.toHaveProperty(
					"sourceChartTables",
				);
			const eligible = load(`${excluded}${script()}${article}`, options);
			expect(required(researchSourceChartTables(eligible)).tables).toHaveLength(
				1,
			);
		},
	);

	it.each(
		readerModes.flatMap((mode) =>
			[
				"noscript",
				"template",
				"svg",
				"math",
				"iframe",
				"object",
				"noembed",
				"noframes",
			].map((tag) => ({ ...mode, tag })),
		),
	)(
		"omits $tag source subtrees in $profile/$rawPolicy",
		({ tag, ...options }) => {
			const excluded = `<${tag}>${script()}</${tag}>`;
			expect(
				researchSourceChartTables(load(`${excluded}${article}`, options)),
			).toBeUndefined();
			const eligible = load(`${excluded}${script()}${article}`, options);
			expect(required(researchSourceChartTables(eligible)).tables).toHaveLength(
				1,
			);
		},
	);

	it.each(
		readerModes.flatMap((mode) =>
			(["source-hidden-v1", "source-hidden-inline-v1"] as const).flatMap(
				(visibilityPolicy) =>
					[
						"hidden",
						'aria-hidden="true"',
						...(visibilityPolicy === "source-hidden-inline-v1"
							? ['style="display:none"']
							: []),
					].map((attributes) => ({ ...mode, visibilityPolicy, attributes })),
			),
		),
	)(
		"omits hidden $attributes in $profile/$rawPolicy/$visibilityPolicy",
		({ attributes, ...options }) => {
			for (const excluded of [
				script(attributes),
				`<section ${attributes}>${script()}</section>`,
			]) {
				const tree = load(`${excluded}${article}`, options);
				expect(researchSourceChartTables(tree)).toBeUndefined();
				for (const format of formats)
					expect(extractDocument(tree, { format })).not.toHaveProperty(
						"sourceChartTables",
					);
				const eligible = load(`${excluded}${script()}${article}`, options);
				expect(
					required(researchSourceChartTables(eligible)).tables,
				).toHaveLength(1);
			}
		},
	);

	it.each(extractionModes)(
		"never executes source in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const forbidden = vi.fn(() => {
				throw new Error("Unexpected page execution or resource fetch");
			});
			vi.stubGlobal("sourceChartEffect", forbidden);
			const tree = load(
				`${script()}<script>globalThis.sourceChartEffect()</script><script src="/never.js"></script>${article}`,
				{
					...options,
					context: {
						...context,
						fetchScript: forbidden,
						fetchStylesheet: forbidden,
						fetchImage: forbidden,
						scripts: {
							start: forbidden,
						} as unknown as DocumentLoaderContext["scripts"],
					},
				},
			);
			expect(extractDocument(tree, { format }).sourceChartTables).toBeDefined();
			expect(htmlParseInfo(tree)?.scripting).toBe(false);
			expect(researchReaderInfo(tree)?.scripting).toBe(false);
			expect(forbidden).not.toHaveBeenCalled();
		},
	);
});

describe("source chart response eligibility", () => {
	it.each(formats)("uses only the final HTTPS chart URL in %s", (format) => {
		const unrelated = `https://unrelated.fixture.invalid/${embedId}`;
		const source = `<base href="${url}">${script()}${article}`;
		for (const targetUrl of [
			unrelated,
			`http://e.infogram.com/${embedId}`,
			"https://e.infogram.com/",
			`https://e.infogram.com/embed/${embedId}`,
			`https://e.infogram.com:444/${embedId}`,
			"https://e.infogram.com/22222222-2222-2222-2222-222222222222",
		]) {
			const tree = load(source, {
				url: targetUrl,
				redirects: [{ url, status: 302, location: targetUrl }],
			});
			expect(researchSourceChartTables(tree)).toBeUndefined();
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceChartTables",
			);
		}
		const credentialUrl = `https://user@e.infogram.com/${embedId}`;
		expect(() =>
			load(source, {
				url: credentialUrl,
				redirects: [{ url, status: 302, location: credentialUrl }],
			}),
		).toThrow(
			expect.objectContaining({
				code: "policy-denied",
				message: "Credentials in URLs are not allowed",
			}),
		);
		for (const targetUrl of [
			url,
			`https://e.infogram.com/${embedId}?different=query#fragment`,
		]) {
			const tree = load(source, {
				url: targetUrl,
				redirects: [{ url: unrelated, status: 302, location: targetUrl }],
			});
			expect(
				required(extractDocument(tree, { format }).sourceChartTables).embedId,
			).toBe(embedId);
		}
	});

	it.each(readerModes)(
		"rejects mismatched, private and ambiguous payloads in $profile/$rawPolicy",
		(options) => {
			const mismatch = {
				...payload(),
				path: "22222222-2222-2222-2222-222222222222",
			};
			const privateChart = { ...payload(), public: false };
			for (const source of [
				script("", mismatch),
				script("", privateChart),
				`${script()}${script()}`,
			]) {
				const tree = load(`${source}${article}`, options);
				expect(researchSourceChartTables(tree)).toBeUndefined();
				for (const format of formats)
					expect(extractDocument(tree, { format })).not.toHaveProperty(
						"sourceChartTables",
					);
			}
		},
	);

	it.each(formats)(
		"does not attach metadata during plain HTML parsing in %s",
		(format) => {
			const tree = parseHtmlDocument(`${script()}${article}`, url);
			trees.push(tree);
			expect(researchSourceChartTables(tree)).toBeUndefined();
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceChartTables",
			);
		},
	);

	it.each(
		extractionModes.flatMap((mode) =>
			["text/plain", "text/markdown", "application/json"].map((mime) => ({
				...mode,
				mime,
			})),
		),
	)(
		"rejects non-HTML or omits chart metadata from $mime in $profile/$rawPolicy/$format",
		({ format, mime, ...options }) => {
			const source = `${script()}${article}`;
			const loadNonHtml = () =>
				load(
					mime === "application/json" ? JSON.stringify({ source }) : source,
					{ ...options, mime },
				);
			if (options.profile === "long-v1") {
				expect(loadNonHtml).toThrow(
					expect.objectContaining({
						code: "unsupported",
						message: "Long reader requires text/html",
					}),
				);
				return;
			}
			const tree = loadNonHtml();
			expect(researchSourceChartTables(tree)).toBeUndefined();
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceChartTables",
			);
		},
	);
});

describe("source chart snapshot lifecycle", () => {
	it.each(extractionModes)(
		"retains document-source metadata through selection, edits and close in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const tree = load(
				`${script()}<aside>Outside evidence</aside>${article}`,
				options,
			);
			const data = required(researchSourceChartTables(tree));
			const before = JSON.stringify(data);
			const queries = new DocumentQueries(tree);
			const main = queries.querySelector("#article");
			const heading = queries.querySelector("#guide");
			const paragraph = queries.querySelector("p");
			if (main === null || heading === null || paragraph === null)
				throw new Error("Missing article fixture");
			const whole = extractDocument(tree, { format });
			const selected = [
				extractDocument(tree, { format, root: tree.reference(main) }),
				extractDocument(tree, { format, section: tree.reference(heading) }),
				extractDocument(tree, { format, contentFocus: "main-content-v1" }),
			];
			for (const result of selected) {
				expect(result.sourceChartTables).toEqual(data);
				expect(result.sourceChartTables?.scope).toBe("document-source");
				expect(JSON.stringify(result.content)).not.toContain(
					"Outside evidence",
				);
			}
			tree.setTextContent(paragraph, "Edited visible evidence");
			const edited = extractDocument(tree, { format });
			expect(JSON.stringify(edited.content)).toContain(
				"Edited visible evidence",
			);
			expect(edited.sourceChartTables).toEqual(data);
			expect(JSON.stringify(whole.content)).not.toContain(
				"Edited visible evidence",
			);
			expectFrozen(data);
			expect(Reflect.set(data.tables[0].source, "offset", 99)).toBe(false);
			expect(Reflect.set(data.tables[0].rows[1][1], "value", 99)).toBe(false);
			expect(Reflect.set(data.tables, "length", 0)).toBe(false);
			tree.close();
			expect(researchSourceChartTables(tree)).toBeUndefined();
			expect(JSON.stringify(whole.sourceChartTables)).toBe(before);
			expect(JSON.stringify(edited.sourceChartTables)).toBe(before);
		},
	);

	it.each(formats)(
		"retains explicitly attached metadata through native text-line selection in %s",
		(format) => {
			const source = required(researchSourceChartTables(load(script())));
			const tree = load("First line\nSelected line\nLast line", {
				mime: "text/plain",
			});
			expect(researchSourceChartTables(tree)).toBeUndefined();
			const revision = tree.revision;
			const input = {
				...source,
				tables: source.tables.map((table) => ({
					...table,
					source: { ...table.source },
					rows: table.rows.map((row) => row.map((cell) => ({ ...cell }))),
				})),
			};
			setResearchSourceChartTables(tree, input);
			input.tables[0].sheetName = "Changed caller input";
			input.tables[0].rows.length = 0;
			expect(tree.revision).toBe(revision);
			const result = extractDocument(tree, {
				format,
				lines: { start: 2, end: 2 },
			});
			expect(result.sourceChartTables).toEqual(source);
			expect(result.sourceChartTables?.scope).toBe("document-source");
			expect(result.textSelection).toMatchObject({
				method: "text-lines",
				start: 2,
				end: 2,
			});
			expect(JSON.stringify(result.content)).toContain("Selected line");
			expect(JSON.stringify(result.content)).not.toContain("First line");
			expectFrozen(result.sourceChartTables);
		},
	);
});

describe("source chart extraction byte budgets", () => {
	it.each(extractionModes)(
		"fits whole leading matrices including UTF-8 and escaping in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const sheets = [matrix(), matrix(), matrix()];
			sheets[1][1][1] = { value: 'Second café 😀 "\\\n'.repeat(8) };
			sheets[2][1][1] = { value: "Third source matrix" };
			const tree = load(`${script("", payload(sheets))}${article}`, options);
			const full = extractDocument(tree, { format });
			const { sourceChartTables, ...baseline } = full;
			const data = required(sourceChartTables);
			expect(data.tables).toHaveLength(3);
			const original = JSON.stringify(data);
			const empty = { ...data, tables: [], truncated: true };
			const prefix = {
				...data,
				tables: data.tables.slice(0, 1),
				truncated: true,
			};
			const minimum = bytes({ ...baseline, sourceChartTables: prefix });
			expect(bytes(full)).toBeGreaterThan(JSON.stringify(full).length);
			for (const maxBytes of [
				bytes(baseline),
				bytes({ ...baseline, sourceChartTables: empty }) - 1,
				bytes({ ...baseline, sourceChartTables: empty }),
				minimum - 1,
				minimum,
				bytes(full) - 1,
				bytes(full),
			]) {
				const result = extractDocument(tree, { format, maxBytes });
				const { sourceChartTables: fitted, ...body } = result;
				expect(body).toEqual(baseline);
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
				expectPrefix(fitted, data);
				if (maxBytes === bytes(baseline)) expect(fitted).toBeUndefined();
				if (maxBytes === minimum) expect(fitted).toEqual(prefix);
				if (maxBytes === bytes(full)) expect(result).toEqual(full);
			}
			expect(JSON.stringify(researchSourceChartTables(tree))).toBe(original);
		},
	);

	it.each(extractionModes)(
		"preserves existing table/access/feed metadata priority in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const source = `<head><link rel="alternate" type="application/rss+xml" href="/fixture-feed.xml">${script()}<script type="application/ld+json">{"@context":"https://schema.org","isAccessibleForFree":false}</script></head><body>${sourceDataTable()}${article}</body>`;
			const tree = load(source, options);
			const full = extractDocument(tree, { format });
			const { sourceChartTables, ...baseline } = full;
			expect(baseline.sourceDataTables).toBeDefined();
			expect(baseline.sourceAccess).toBeDefined();
			expect(baseline.sourceFeeds).toBeDefined();
			expect(sourceChartTables).toBeDefined();
			const control = extractDocument(load(inactive(source), options), {
				format,
			});
			expect(withoutReferences(baseline)).toEqual(withoutReferences(control));
			for (const maxBytes of [bytes(baseline), bytes(full) - 1, bytes(full)]) {
				const result = extractDocument(tree, { format, maxBytes });
				const { sourceChartTables: fitted, ...body } = result;
				expect(body).toEqual(baseline);
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
				expectPrefix(fitted, required(sourceChartTables));
				if (maxBytes === bytes(full)) expect(result).toEqual(full);
			}
		},
	);

	it.each(readerModes)(
		"preserves explicitly labeled text-prefix fallback in $profile/$rawPolicy",
		(options) => {
			const source = `${script()}<main><p>${"Readable café evidence 😀. ".repeat(1000)}</p></main>`;
			const tree = load(source, options);
			const control = load(inactive(source), options);
			const full = extractDocument(tree);
			expect(
				extractDocument(tree, { outputLimitPolicy: "text-prefix-v1" }),
			).toEqual(full);
			const maxBytes = 4096;
			const strict = failure(() => extractDocument(tree, { maxBytes }));
			expect(strict).toMatchObject({ code: "resource-limit" });
			const selected = {
				maxBytes,
				outputLimitPolicy: "text-prefix-v1" as const,
			};
			const result = extractDocument(tree, selected);
			const { sourceChartTables, ...body } = result;
			expect(withoutReferences(body)).toEqual(
				withoutReferences(extractDocument(control, selected)),
			);
			expect(result.contentFallback).toMatchObject({
				truncated: true,
				trigger: resourceLimitDiagnostic(strict),
			});
			expect(result.content).toContain("Readable café evidence");
			expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
			expectPrefix(sourceChartTables, required(full.sourceChartTables));
			expect(researchSourceChartTables(tree)).toEqual(full.sourceChartTables);
		},
	);
});

describe("source chart research content and diagnostics", () => {
	it.each(extractionModes)(
		"recognizes source-only data without visible scripts in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const source = script();
			const tree = load(source, options);
			const full = extractDocument(tree, { format });
			const { sourceChartTables, ...body } = full;
			const baseline = extractDocument(load(inactive(source), options), {
				format,
			});
			expect(withoutReferences(body)).toEqual(withoutReferences(baseline));
			expect(sourceChartTables).toBeDefined();
			expect(hasResearchExtractionContent(body)).toBe(false);
			expect(hasResearchExtractionContent(full)).toBe(true);
			expect(researchExtractionDiagnosticText(full)).toBe(
				researchExtractionDiagnosticText(baseline),
			);
			expect(researchDocumentDiagnosticText(tree)).not.toContain("captcha");
		},
	);

	it.each(formats)(
		"requires data beyond headers and model labels in %s",
		(format) => {
			const extraction = extractDocument(load(""), { format });
			const source = required(researchSourceChartTables(load(script())));
			const cases: { cell: ResearchSourceChartCell; expected: boolean }[] = [
				{ cell: { kind: "null-cell" }, expected: false },
				{ cell: { kind: "value-cell", value: null }, expected: false },
				{ cell: { kind: "value-cell", value: "" }, expected: false },
				{ cell: { kind: "value-cell", value: " \t\n" }, expected: false },
				{ cell: { kind: "value-cell", value: 0 }, expected: true },
				{ cell: { kind: "value-cell", value: false }, expected: true },
				{ cell: { kind: "value-cell", value: " N/A " }, expected: true },
				{
					cell: { kind: "value-cell", value: "captcha verify you are human" },
					expected: true,
				},
			];
			for (const { cell, expected } of cases) {
				const sourceChartTables: ResearchSourceChartTables = {
					...source,
					tables: [
						{
							...source.tables[0],
							sheetName: "Stale challenge description",
							rows: [
								[
									{ kind: "value-cell", value: "Model" },
									{ kind: "value-cell", value: "Header captcha" },
								],
								[
									{ kind: "value-cell", value: "Model verify you are human" },
									cell,
								],
							],
						},
					],
				};
				const result = { ...extraction, sourceChartTables };
				expect(hasResearchExtractionContent(result)).toBe(expected);
				expect(researchExtractionDiagnosticText(result)).toBe(
					researchExtractionDiagnosticText(extraction),
				);
			}
			for (const tables of [
				[],
				[{ ...source.tables[0], rows: [] }],
				[
					{
						...source.tables[0],
						rows: [[{ kind: "value-cell" as const, value: "Header only" }]],
					},
				],
			]) {
				expect(
					hasResearchExtractionContent({
						...extraction,
						sourceChartTables: { ...source, tables },
					}),
				).toBe(false);
			}
			const empty = { ...source.tables[0], rows: [] };
			expect(
				hasResearchExtractionContent({
					...extraction,
					sourceChartTables: { ...source, tables: [empty, source.tables[0]] },
				}),
			).toBe(true);
		},
	);

	it.each(formats)(
		"keeps unrelated source metadata non-content in %s",
		(format) => {
			const tree = load(
				`<script type="application/ld+json">{"@context":"https://schema.org","isAccessibleForFree":false}</script>${sourceDataTable()}`,
			);
			const result = extractDocument(tree, { format });
			expect(result.sourceAccess).toBeDefined();
			expect(result.sourceDataTables).toBeDefined();
			expect(hasResearchExtractionContent(result)).toBe(false);
		},
	);

	it.each(extractionModes)(
		"excludes source challenge strings but retains visible barrier prose in $profile/$rawPolicy/$format",
		({ format, ...options }) => {
			const sourceChallenge = "Source-only captcha verify you are human";
			const visibleBarrier =
				"Visible barrier: complete the security check to continue.";
			const sheet = matrix();
			sheet[1][1] = { value: sourceChallenge };
			for (const visible of [
				article,
				`<main><p>${visibleBarrier}</p></main>`,
			]) {
				const tree = load(`${script("", payload([sheet]))}${visible}`, options);
				const control = load(visible, options);
				const result = extractDocument(tree, { format });
				const diagnostic = researchExtractionDiagnosticText(result);
				expect(hasResearchExtractionContent(result)).toBe(true);
				expect(JSON.stringify(result.sourceChartTables)).toContain(
					sourceChallenge,
				);
				expect(diagnostic).not.toContain(sourceChallenge);
				expect(diagnostic).not.toContain("PRIVATE_SOURCE_DESCRIPTION");
				expect(diagnostic).toBe(
					researchExtractionDiagnosticText(
						extractDocument(control, { format }),
					),
				);
				expect(researchDocumentDiagnosticText(tree)).toBe(
					researchDocumentDiagnosticText(control),
				);
				if (visible.includes(visibleBarrier)) {
					expect(diagnostic).toContain(
						"complete the security check to continue",
					);
					expect(researchDocumentDiagnosticText(tree)).toContain(
						visibleBarrier,
					);
				}
			}
		},
	);
});
