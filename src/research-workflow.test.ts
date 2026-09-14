import { Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchLineRange,
	type ResearchNavigationReport,
	emitResearchReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import {
	researchDiagnosticTextLimit,
	researchDocumentDiagnosticText,
} from "../scripts/research-content.js";
import * as challenges from "./browser-challenges.js";
import { AgentBrowserError } from "./errors.js";
import type { ExtractedNode } from "./extraction.js";
import * as extraction from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { loadResearchDocument } from "./research-loader.js";
import { researchReaderProfile } from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const url = "https://research-workflow.fixture.invalid/paper";
const otherUrl = "https://research-workflow.fixture.invalid/other";
const outputs: Writable[] = [];
const modes = [false, true];
const jsonOptions: ResearchExecutionOptions = {
	format: "json",
	minRequestIntervalMs: 0,
};
const tableOptions: ResearchExecutionOptions = {
	...jsonOptions,
	tableMetadata: true,
};
const tableMarkup =
	'<table id="results" data-private="OMITTED_DATA"><caption id="caption">Owned measurements</caption><colgroup id="columns" span=" +02 "><col id="column" span="-2"></colgroup><thead id="head"><tr id="header-row"><th id="heading&amp;😀" headers=" missing&#9;duplicate duplicate " colspan="not-a-number" rowspan="-3" scope=" ROWGROUP " abbr="Short &amp; exact" title="OMITTED_TITLE" class="OMITTED_CLASS" onclick="OMITTED_EVENT" data-private="OMITTED_DATA">Header</th></tr></thead><tbody id="body"><tr id="data-row"><td id="value" headers="heading&amp;😀 heading&amp;😀 missing" colspan="0" rowspan="+0002" scope="OMITTED_SCOPE" abbr="OMITTED_ABBR">42</td></tr></tbody><tfoot id="foot"><tr id="footer-row"><td headers="" colspan="NaN" rowspan="1.5">End</td></tr></tfoot></table>';
const tableRecords = [
	{ tag: "table", attributes: { id: "results" } },
	{ tag: "caption", attributes: { id: "caption" } },
	{ tag: "colgroup", attributes: { id: "columns", span: " +02 " } },
	{ tag: "col", attributes: { id: "column", span: "-2" } },
	{ tag: "thead", attributes: { id: "head" } },
	{ tag: "tr", attributes: { id: "header-row" } },
	{
		tag: "th",
		attributes: {
			id: "heading&😀",
			headers: " missing\tduplicate duplicate ",
			colspan: "not-a-number",
			rowspan: "-3",
			scope: " ROWGROUP ",
			abbr: "Short & exact",
		},
	},
	{ tag: "tbody", attributes: { id: "body" } },
	{ tag: "tr", attributes: { id: "data-row" } },
	{
		tag: "td",
		attributes: {
			id: "value",
			headers: "heading&😀 heading&😀 missing",
			colspan: "0",
			rowspan: "+0002",
		},
	},
	{ tag: "tfoot", attributes: { id: "foot" } },
	{ tag: "tr", attributes: { id: "footer-row" } },
	{
		tag: "td",
		attributes: { headers: "", colspan: "NaN", rowspan: "1.5" },
	},
].map((record) => ({ kind: "native-table-source-v1", ...record }));

interface WorkflowOptions {
	reader?: boolean;
	selector?: string;
	lines?: ResearchLineRange;
	section?: string;
	captureBody?: boolean;
	execution?: ResearchExecutionOptions;
	response?: Partial<NetworkResponse>;
}

function response(
	source: string,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	};
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected owned fixture request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
});

afterEach(() => {
	try {
		for (const output of outputs.splice(0)) output.destroy();
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
	}
});

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
}

function expectClosed(report: ResearchNavigationReport) {
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
		expect.objectContaining({
			url,
			cookieContext: expect.objectContaining({ credentials: "omit" }),
		}),
	);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.partial).toBe(true);
}

async function navigate(source: string, options: WorkflowOptions = {}) {
	const input = response(source, options.response);
	const original = input.body.slice();
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await researchNavigation(
		url,
		options.reader,
		undefined,
		options.selector,
		options.captureBody ?? false,
		options.lines,
		options.section,
		false,
		undefined,
		undefined,
		options.execution ?? jsonOptions,
	);
	expectClosed(report);
	expect(input.body).toEqual(original);
	return report;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function jsonNodes(report: ResearchNavigationReport) {
	expect(report.extraction?.format).toBe("json");
	if (report.extraction?.format !== "json")
		throw new Error("Expected owned JSON extraction");
	return flattened(report.extraction.content);
}

function expectUnverified(report: ResearchNavigationReport, reader: boolean) {
	expect(report).toMatchObject({
		profile: reader ? researchReaderProfile : "native",
		outcome: "extracted-unverified",
		partial: true,
		contentSuccess: null,
		classification: {
			classifier: "browser-challenges",
			barrier: null,
			diagnostic: null,
		},
		extraction: { partial: true },
	});
	expect(report.failure).toBeUndefined();
	if (reader) {
		expect(report.reader).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
		});
		expect(report.extraction?.reader).toBe(report.reader);
	} else {
		expect(report.reader).toBeUndefined();
		expect(report.extraction).not.toHaveProperty("reader");
	}
}

it("preserves exact default argument shapes", () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	expect(parseResearchArguments(["--reader", url])).toEqual({
		reader: true,
		urls: [url],
	});
	expectNoSetup();
});

it.each(["markdown", "json"] as const)(
	"accepts explicit %s before or after URLs",
	(format) => {
		for (const args of [
			["--format", format, url, otherUrl],
			[url, "--format", format, otherUrl],
			[url, otherUrl, "--format", format],
		])
			expect(parseResearchArguments(args)).toEqual({
				reader: false,
				urls: [url, otherUrl],
				format,
			});
		expectNoSetup();
	},
);

it.each([
	{ flags: ["--selector", "main"], selected: { selector: "main" } },
	{ flags: ["--section", "h2"], selected: { section: "h2" } },
	{ flags: ["--lines", "2:3"], selected: { lines: { start: 2, end: 3 } } },
])("accepts JSON metadata with $selected", ({ flags, selected }) => {
	for (const formatFlags of [
		["--format", "json", "--table-metadata"],
		["--table-metadata", "--format", "json"],
	])
		expect(
			parseResearchArguments([url, "--reader", ...flags, ...formatFlags]),
		).toEqual({
			reader: true,
			urls: [url],
			format: "json",
			tableMetadata: true,
			...selected,
		});
	expectNoSetup();
});

it.each(
	[
		["--format"],
		["--format", "--reader"],
		["--format", ""],
		["--format", "JSON"],
		["--format", " json"],
		["--format", "html"],
		["--format=json"],
		["--format", "json", "--format", "json"],
		["--format", "json", "--format", "markdown"],
		["--format", "markdown", "--format", "json"],
		["--table-metadata"],
		["--format", "markdown", "--table-metadata"],
		["--table-metadata", "--format", "markdown"],
		["--format", "json", "--table-metadata", "--table-metadata"],
		["--format", "json", "--table-metadata", "false"],
		["--format", "json", "--table-metadata=true"],
	].map((flags) => ({ flags })),
)("rejects missing, invalid or duplicate flags $flags", ({ flags }) => {
	expect(() => parseResearchArguments([url, ...flags])).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expectNoSetup();
});

it.each(
	["markdown", "json"].flatMap((format) =>
		[["--headings"], ["--find", "Owned"]].flatMap((discovery) =>
			[false, true].map((metadata) => ({ format, discovery, metadata })),
		),
	),
)(
	"rejects discovery $discovery with $format, metadata=$metadata",
	({ format, discovery, metadata }) => {
		const flags = [
			"--format",
			format,
			...(metadata ? ["--table-metadata"] : []),
		];
		for (const args of [
			[url, ...discovery, ...flags],
			[url, ...flags, ...discovery],
		])
			expect(() => parseResearchArguments(args)).toThrowError(
				expect.objectContaining({ code: "invalid-input" }),
			);
		expectNoSetup();
	},
);

it.each(["markdown", "json"])(
	"rejects explicit %s in long-v1 headings mode",
	(format) => {
		expect(() =>
			parseResearchArguments([
				url,
				"--document-profile",
				"long-v1",
				"--reader",
				"--capture-body",
				"--headings",
				"--format",
				format,
			]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expectNoSetup();
	},
);

it.each(
	[
		null,
		false,
		0,
		"json",
		[],
		...[null, "", "JSON", "html", 1, false, [], {}].map((format) => ({
			format,
		})),
		...[null, 0, 1, "true", [], {}].map((tableMetadata) => ({
			format: "json",
			tableMetadata,
		})),
		{ tableMetadata: true },
		{ format: "markdown", tableMetadata: true },
		...[
			null,
			-1,
			0.5,
			60_001,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"0",
			false,
		].map((minRequestIntervalMs) => ({ format: "json", minRequestIntervalMs })),
	].map((options) => ({ options })),
)("rejects runtime options $options before setup", async ({ options }) => {
	await expect(
		researchNavigation(
			url,
			false,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			options as ResearchExecutionOptions,
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expectNoSetup();
});

it.each(["markdown", "json"] as const)(
	"rejects runtime %s discovery combinations before setup",
	async (format) => {
		for (const discovery of [
			{ headings: true, find: undefined, profile: undefined },
			{ headings: false, find: "Owned", profile: undefined },
			{ headings: true, find: undefined, profile: "long-v1" as const },
		]) {
			await expect(
				researchNavigation(
					url,
					true,
					undefined,
					undefined,
					true,
					undefined,
					undefined,
					discovery.headings,
					discovery.find,
					discovery.profile,
					{ format, minRequestIntervalMs: 0 },
				),
			).rejects.toMatchObject({ code: "invalid-input" });
		}
		expectNoSetup();
	},
);

it.each(modes)(
	"preserves all ten legacy positional argument slots (reader=%s)",
	async (reader) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response("<aside>Outside</aside><main><p>Owned text</p></main>"),
		);
		const controller = new AbortController();
		const report = await researchNavigation(
			url,
			reader,
			controller.signal,
			"main",
			true,
			undefined,
			undefined,
			false,
			undefined,
			"default",
		);
		expectClosed(report);
		expectUnverified(report, reader);
		expect(report.selection).toEqual({ method: "css-selector", matches: 1 });
		expect(report.bodyCapture).toBeDefined();
		expect(report).not.toHaveProperty("admission");
		expect(report.extraction).toMatchObject({
			format: "markdown",
			content: "Owned text\n",
		});
	},
);

it.each(modes)(
	"retains exact table source metadata without arbitrary attributes (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(tableMarkup, {
			reader,
			execution: tableOptions,
		});
		expectUnverified(report, reader);
		expect(jsonNodes(report).flatMap((node) => node.tableSource ?? [])).toEqual(
			tableRecords,
		);
		expect(JSON.stringify(report)).not.toContain("OMITTED_");
		expect(extract).toHaveBeenCalledOnce();
		expect(extract.mock.calls[0][1]).toMatchObject({
			format: "json",
			tableMetadata: true,
			maxBytes: researchRunLimits.extractionBytes,
		});
	},
);

it.each(
	modes.flatMap((reader) =>
		[undefined, false].map((tableMetadata) => ({ reader, tableMetadata })),
	),
)(
	"omits table metadata by default and with false (reader=$reader, metadata=$tableMetadata)",
	async ({ reader, tableMetadata }) => {
		const report = await navigate(tableMarkup, {
			reader,
			execution: { ...jsonOptions, tableMetadata },
		});
		expectUnverified(report, reader);
		for (const node of jsonNodes(report))
			expect(node).not.toHaveProperty("tableSource");
		expect(JSON.stringify(report)).not.toContain("OMITTED_");
	},
);

it.each(
	modes.flatMap((reader) =>
		[{}, { tableMetadata: false }, { format: "markdown" as const }].map(
			(execution) => ({ reader, execution }),
		),
	),
)(
	"keeps Markdown defaults and explicit false (reader=$reader, options=$execution)",
	async ({ reader, execution }) => {
		const report = await navigate("<h1>Owned heading</h1><p>Owned text</p>", {
			reader,
			execution,
		});
		expectUnverified(report, reader);
		expect(report.extraction).toMatchObject({
			format: "markdown",
			content: "# Owned heading\n\nOwned text\n",
		});
		for (const property of [
			"format",
			"tableMetadata",
			"minRequestIntervalMs",
			"selection",
			"headings",
			"textLines",
			"bodyCapture",
			"admission",
		])
			expect(report).not.toHaveProperty(property);
	},
);

it.each(modes)(
	"selects literal plaintext lines as JSON (reader=%s)",
	async (reader) => {
		const source =
			"Outside prefix\r\n<main>literal & 😀</main>\r\nkept\rOutside suffix";
		const selected = "<main>literal & 😀</main>\r\nkept\r";
		const report = await navigate(source, {
			reader,
			lines: { start: 2, end: 3 },
			execution: tableOptions,
			response: { headers: { "content-type": ["text/plain; charset=utf-8"] } },
		});
		expectUnverified(report, reader);
		expect(report.selection).toEqual({
			method: "text-lines",
			start: 2,
			end: 3,
		});
		expect(report.extraction?.textSelection).toEqual({
			method: "text-lines",
			start: 2,
			end: 3,
			totalLines: 4,
			sourceCodeUnits: source.length,
			selectedCodeUnits: selected.length,
		});
		expect(
			jsonNodes(report)
				.filter((node) => node.type === "text")
				.map((node) => node.text)
				.join(""),
		).toBe("<main>literal & 😀</main>\nkept\n");
		expect(JSON.stringify(report.extraction)).not.toContain("Outside");
		for (const node of jsonNodes(report))
			expect(node).not.toHaveProperty("tableSource");
	},
);

it.each(modes)(
	"limits JSON table extraction to the selector scope (reader=%s)",
	async (reader) => {
		const report = await navigate(
			`<aside>Outside prefix</aside><main id="chosen">${tableMarkup}</main><p>Outside suffix</p>`,
			{ reader, selector: "main", execution: tableOptions },
		);
		expectUnverified(report, reader);
		expect(report.selection).toEqual({ method: "css-selector", matches: 1 });
		expect(jsonNodes(report)[0].ref).toBe(report.extraction?.scope);
		expect(report.extraction?.scope).not.toBe(report.extraction?.document);
		expect(jsonNodes(report).flatMap((node) => node.tableSource ?? [])).toEqual(
			tableRecords,
		);
		expect(JSON.stringify(report.extraction)).not.toContain("Outside");
	},
);

it.each(modes)(
	"includes a heading section and its table but not adjacent sections (reader=%s)",
	async (reader) => {
		const report = await navigate(
			`<p>Outside prefix</p><h2 id="chosen">Owned section</h2>${tableMarkup}<h3>Nested heading</h3><p>Nested body</p><h2>Outside boundary</h2><p>Outside suffix</p>`,
			{ reader, section: "h2:first-of-type", execution: tableOptions },
		);
		expectUnverified(report, reader);
		expect(report.selection).toEqual({ method: "heading-section", matches: 1 });
		expect(report.extraction?.sectionSelection).toMatchObject({
			method: "heading-section",
			level: 2,
			heading: expect.any(String),
			end: expect.any(String),
		});
		const text = jsonNodes(report)
			.map((node) => node.text ?? "")
			.join(" ");
		expect(text).toContain("Owned section");
		expect(text).toContain("Nested heading");
		expect(text).toContain("Nested body");
		expect(JSON.stringify(report.extraction)).not.toContain("Outside");
		expect(jsonNodes(report).flatMap((node) => node.tableSource ?? [])).toEqual(
			tableRecords,
		);
	},
);

it.each(modes)(
	"accepts the exact metadata string cap without normalizing malformed spans (reader=%s)",
	async (reader) => {
		const value = "😀".repeat(2048);
		const report = await navigate(
			`<table><tr><th headers="${value}" colspan="NaN" rowspan="-3">Owned</th></tr></table>`,
			{ reader, execution: tableOptions },
		);
		expectUnverified(report, reader);
		expect(
			jsonNodes(report).find((node) => node.tableSource?.tag === "th")
				?.tableSource,
		).toEqual({
			kind: "native-table-source-v1",
			tag: "th",
			attributes: { headers: value, colspan: "NaN", rowspan: "-3" },
		});
	},
);

it.each(
	modes.flatMap((reader) =>
		[true, false].map((tableMetadata) => ({ reader, tableMetadata })),
	),
)(
	"applies the 4096-unit attribute cap only to requested metadata (reader=$reader, metadata=$tableMetadata)",
	async ({ reader, tableMetadata }) => {
		const value = `${"😀".repeat(2048)}x`;
		const report = await navigate(
			`<table><tr><th headers="${value}">Owned</th></tr></table>`,
			{ reader, execution: { ...jsonOptions, tableMetadata } },
		);
		if (tableMetadata) {
			expect(report).toMatchObject({
				outcome: "failure",
				contentSuccess: false,
				failure: { category: "resource-limit", stage: "extraction" },
			});
			expect(report.extraction).toBeUndefined();
		} else {
			expectUnverified(report, reader);
			for (const node of jsonNodes(report))
				expect(node).not.toHaveProperty("tableSource");
		}
		expect(JSON.stringify(report)).not.toContain(value);
	},
);

it.each(modes)(
	"bounds aggregate JSON metadata output (reader=%s)",
	async (reader) => {
		const cell = `<td headers="${"x".repeat(4096)}">Owned</td>`;
		const report = await navigate(
			`<table><tr>${cell.repeat(70)}</tr></table>`,
			{
				reader,
				execution: tableOptions,
			},
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "extraction" },
		});
		expect(report.extraction).toBeUndefined();
	},
);

it("retains captured reader source and bounded sections after a Markdown output limit", async () => {
	const destination = `${url}/${"x".repeat(4096)}`;
	const label = "Référence";
	const linkCount = 70;
	const source = `<!doctype html><html><head><title>Owned article</title></head><body><h2 id="history">History</h2><p>Owned history</p><h2>References</h2><p>${`<a href="${destination}">${label}</a>`.repeat(linkCount)}</p></body></html>`;
	const report = await navigate(source, {
		reader: true,
		captureBody: true,
		execution: { format: "markdown", minRequestIntervalMs: 0 },
	});
	expect(report.reader?.textCodeUnits).toBeLessThanOrEqual(131_072);
	expect(report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		classification: { barrier: null, diagnostic: null },
	});
	expect(report.extraction).toBeUndefined();
	const body = decodeResearchBodyCapture(report.bodyCapture);
	expect(body).toEqual(new TextEncoder().encode(source));
	const tree = loadResearchDocument(
		{ ...response(source), body },
		{
			signal: new AbortController().signal,
			tabId: "owned-capture",
			limits: { maxNodes: 50_000, maxDepth: 128, maxTextCodeUnits: 2_000_000 },
		},
	);
	try {
		const heading = new DocumentQueries(tree).querySelector("#history");
		if (heading === null) throw new Error("Missing owned history section");
		const section = extraction.extractDocument(tree, {
			section: tree.reference(heading),
			maxBytes: researchRunLimits.extractionBytes,
		});
		expect(section.content).toBe("## History\n\nOwned history\n");
		expect(section.partial).toBe(true);
	} finally {
		tree.close();
	}
	expectClosed(report);
	expect(researchRunLimits.extractionBytes).toBe(256_000);
	const observed = new TextEncoder().encode(
		`## History\n\nOwned history\n\n## References\n\n${`[${label}](<${destination}>)`.repeat(linkCount)}\n`,
	).byteLength;
	expect(observed).toBeGreaterThan(256_000);
	expect(report.failure).toEqual({
		category: "resource-limit",
		stage: "extraction",
		resourceLimit: {
			kind: "extraction.output",
			unit: "bytes",
			limit: 256_000,
			observed,
		},
	});
});

it.each([
	{ quota: "line", text: "é".repeat(256) },
	{ quota: "separator", text: `${"é".repeat(255)}x` },
])("measures Markdown $quota output limits in bytes", ({ text }) => {
	const tree = parseHtmlDocument(`<p>${text}</p>`, url);
	try {
		expect(() => extraction.extractDocument(tree, { maxBytes: 512 })).toThrow(
			expect.objectContaining({
				code: "resource-limit",
				message: "Markdown extraction output limit exceeded",
			}),
		);
		try {
			extraction.extractDocument(tree, { maxBytes: 512 });
		} catch (error) {
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "extraction.output",
				unit: "bytes",
				limit: 512,
				observed: 513,
			});
		}
	} finally {
		tree.close();
	}
});

it.each(["markdown", "json"] as const)(
	"measures final serialized %s extraction output in bytes",
	(format) => {
		const tree = parseHtmlDocument(`<p>${"é".repeat(180)}</p>`, url);
		try {
			const result = extraction.extractDocument(tree, { format });
			const observed = new TextEncoder().encode(
				JSON.stringify(result),
			).byteLength;
			const maxBytes = observed - 1;
			expect(() =>
				extraction.extractDocument(tree, { format, maxBytes }),
			).toThrow(
				expect.objectContaining({
					code: "resource-limit",
					message: "Extraction output limit exceeded",
				}),
			);
			try {
				extraction.extractDocument(tree, { format, maxBytes });
			} catch (error) {
				expect(resourceLimitDiagnostic(error)).toEqual({
					kind: "extraction.output",
					unit: "bytes",
					limit: maxBytes,
					observed,
				});
			}
		} finally {
			tree.close();
		}
	},
);

it.each(
	modes.flatMap((reader) =>
		[
			"",
			"<title>Title alone is not extracted content</title>",
			"<main><p> \t\n </p><div><span></span></div><br></main>",
		].map((source) => ({ reader, source })),
	),
)(
	"does not count JSON structure as content (reader=$reader, $source)",
	async ({ reader, source }) => {
		const report = await navigate(source, { reader, execution: tableOptions });
		expect(report).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
			classification: { barrier: null, diagnostic: null },
			extraction: { format: "json", partial: true },
		});
		expect(report.failure).toBeUndefined();
		for (const node of jsonNodes(report)) {
			expect(node.text?.trim() ?? "").toBe("");
			expect(["image", "separator", "table"]).not.toContain(node.type);
			expect(node).not.toHaveProperty("tableSource");
		}
	},
);

it.each(
	modes.flatMap((reader) =>
		["<p>Owned text</p>", '<img alt="">', "<hr>", "<table></table>"].map(
			(source) => ({ reader, source }),
		),
	),
)(
	"recognizes meaningful JSON nodes without metadata (reader=$reader, $source)",
	async ({ reader, source }) => {
		const report = await navigate(source, { reader });
		expectUnverified(report, reader);
		expect(jsonNodes(report).length).toBeGreaterThan(0);
		for (const node of jsonNodes(report))
			expect(node).not.toHaveProperty("tableSource");
	},
);

it.each(modes)(
	"recognizes an empty selected table-source container (reader=%s)",
	async (reader) => {
		const report = await navigate(
			'<table><tbody id="chosen"></tbody></table>',
			{
				reader,
				selector: "#chosen",
				execution: tableOptions,
			},
		);
		expectUnverified(report, reader);
		expect(jsonNodes(report)[0]).toMatchObject({
			type: "container",
			tableSource: {
				kind: "native-table-source-v1",
				tag: "tbody",
				attributes: { id: "chosen" },
			},
		});
	},
);

it.each(
	modes.flatMap((reader) =>
		["header", "body", "unselected-body"].map((challenge) => ({
			reader,
			challenge,
		})),
	),
)(
	"stops for Cloudflare $challenge without successful JSON extraction (reader=$reader)",
	async ({ reader, challenge }) => {
		const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			challenge === "header"
				? '<main id="chosen">Owned-looking content</main>'
				: '<title>Attention Required! | Cloudflare</title><aside>Verify <strong>you are</strong> human with Cloudflare</aside><main id="chosen">Owned-looking content</main>',
			{
				reader,
				selector: challenge === "unselected-body" ? "#chosen" : undefined,
				execution: tableOptions,
				...(challenge === "header"
					? {
							response: {
								headers: {
									"content-type": ["text/html"],
									"cf-mitigated": ["challenge"],
								},
							},
						}
					: {}),
			},
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: {
				barrier: "challenge",
				diagnostic: {
					kind: "challenge",
					provider: "cloudflare",
					confidence: challenge === "header" ? "confirmed" : "possible",
					evidence: [
						challenge === "header"
							? "cf-mitigated-challenge"
							: "html-challenge-markers",
					],
					action: "stop-and-request-user-handoff",
				},
			},
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
		if (challenge !== "header") {
			const texts = classify.mock.calls.flatMap(([input]) => input.text ?? []);
			expect(texts).toEqual([
				expect.stringContaining("Verify you are human with Cloudflare"),
			]);
			for (const text of texts) expect(text).not.toContain('"children"');
		}
	},
);

it.each(
	modes.flatMap((reader) =>
		(["markdown", "json"] as const).flatMap((format) =>
			["selector", "section"].map((selection) => ({
				reader,
				format,
				selection,
			})),
		),
	),
)(
	"classifies selected $selection challenge text beyond the document prefix as $format (reader=$reader)",
	async ({ reader, format, selection }) => {
		const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
		const selected =
			selection === "selector"
				? "<main>Checking your browser</main>"
				: '<section><h2 id="chosen">Owned heading</h2><p>Checking your browser</p></section><h2>Outside boundary</h2>';
		const report = await navigate(
			`<title>Just a moment...</title><aside>${"x".repeat(8192)}</aside>${selected}`,
			{
				reader,
				...(selection === "selector"
					? { selector: "main" }
					: { section: "section > h2" }),
				execution: { format, minRequestIntervalMs: 0 },
			},
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			selection: {
				method: selection === "selector" ? "css-selector" : "heading-section",
				matches: 1,
			},
			classification: {
				barrier: "challenge",
				diagnostic: {
					kind: "challenge",
					provider: "unspecified",
					confidence: "possible",
					evidence: ["html-challenge-markers"],
					action: "stop-and-request-user-handoff",
				},
			},
			extraction: { format, partial: true },
		});
		expect(report.failure).toBeUndefined();
		const texts = classify.mock.calls.flatMap(([input]) => input.text ?? []);
		expect(texts).toHaveLength(2);
		expect(texts[0]).toContain("x".repeat(100));
		expect(texts[0].length).toBeLessThanOrEqual(
			researchRunLimits.diagnosticTextCodeUnits + 1,
		);
		expect(texts[0]).not.toContain("Checking your browser");
		expect(texts[1]).toContain("Checking your browser");
		expect(texts[1]).not.toContain("x".repeat(100));
		expect(texts[1]).not.toContain("Outside boundary");
		expect(texts[1]).not.toContain('"children"');
		expect(texts[1]).not.toContain('"ref"');
	},
);

it.each(modes)(
	"never classifies serialized table attributes as document text (reader=%s)",
	async (reader) => {
		const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
		const marker = "Cloudflare verify you are human";
		const report = await navigate(
			`<title>Security check</title><table><tr><th abbr="${marker}">Owned results</th></tr></table>`,
			{ reader, execution: tableOptions },
		);
		expectUnverified(report, reader);
		expect(JSON.stringify(report.extraction)).toContain(marker);
		const texts = classify.mock.calls.flatMap(([input]) => input.text ?? []);
		expect(texts.length).toBeGreaterThan(0);
		for (const text of texts) {
			expect(text).toContain("Owned results");
			expect(text).not.toContain(marker);
			expect(text).not.toContain('"tableSource"');
			expect(text).not.toContain('"children"');
		}
	},
);

it.each(modes)(
	"keeps HTTP failure distinct from unverified JSON content (reader=%s)",
	async (reader) => {
		const report = await navigate("<p>Owned unavailable response</p>", {
			reader,
			response: { status: 503 },
		});
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			classification: { barrier: null, diagnostic: null },
			extraction: { format: "json" },
		});
		expect(report.failure).toBeUndefined();
	},
);

it.each(modes)(
	"passes parsed JSON metadata through the batch and owned Writable (reader=%s)",
	async (reader) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response(tableMarkup),
		);
		const reports: ResearchNavigationReport[] = [];
		for await (const report of researchBatch([
			url,
			...(reader ? ["--reader"] : []),
			"--format",
			"json",
			"--table-metadata",
			"--min-request-interval-ms",
			"0",
		]))
			reports.push(report);
		expect(reports).toHaveLength(1);
		const report = reports[0];
		expectClosed(report);
		expectUnverified(report, reader);
		expect(jsonNodes(report).flatMap((node) => node.tableSource ?? [])).toEqual(
			tableRecords,
		);
		const chunks: Buffer[] = [];
		const output = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			},
		});
		outputs.push(output);
		const before = JSON.stringify(report);
		const exit = await emitResearchReport(output, report);
		expect(chunks).toHaveLength(1);
		const emitted = Buffer.concat(chunks).toString("utf8");
		expect(emitted).toBe(`${before}\n`);
		expect(emitted.split("\n")).toHaveLength(2);
		expect(JSON.parse(emitted)).toEqual(JSON.parse(before));
		expect(JSON.parse(emitted)).toMatchObject({
			partial: true,
			contentSuccess: null,
			extraction: { format: "json" },
		});
		expect(exit).toMatchObject({ outcome: "extracted-unverified" });
		expect(JSON.stringify(report)).toBe(before);
		expect(output.listenerCount("error")).toBe(0);
		expect(output.listenerCount("close")).toBe(0);
	},
);

const challengeOutputModes = modes.flatMap((reader) =>
	([undefined, "markdown", "json"] as const).map((format) => ({
		reader,
		mode: format ?? "default",
		execution: {
			minRequestIntervalMs: 0,
			...(format === undefined ? {} : { format }),
		},
	})),
);

it.each(
	challengeOutputModes.flatMap((options) =>
		[
			{
				marker: "client",
				title: "Client Challenge",
				body: '<p>JavaScript is <strong>disabled</strong> in your browser.</p><p>Please <a href="/help">enable JavaScript</a> to proceed.</p>',
				text: "JavaScript is disabled in your browser.",
				provider: "unspecified",
			},
			{
				marker: "human",
				title: "Security check",
				body: '<p>Verify <strong>you are</strong> <a href="/help">human</a></p>',
				text: "Verify you are human",
				provider: "unspecified",
			},
			{
				marker: "Cloudflare",
				title: "Attention Required! | Cloudflare",
				body: '<p><a href="/help">Checking your</a> <em>browser</em> with Cloudflare</p>',
				text: "Checking your browser with Cloudflare",
				provider: "cloudflare",
			},
		].map((fixture) => ({ ...options, ...fixture })),
	),
)(
	"requests $marker handoff before $mode extraction (reader=$reader)",
	async ({ reader, execution, title, body, text, provider }) => {
		const classify = vi.spyOn(challenges, "classifyBrowserChallenge");
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(`<title>${title}</title>${body}`, {
			reader,
			execution,
		});
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			partial: true,
			contentSuccess: false,
			classification: {
				classifier: "browser-challenges",
				barrier: "challenge",
				diagnostic: {
					kind: "challenge",
					provider,
					confidence: "possible",
					evidence: ["html-challenge-markers"],
					action: "stop-and-request-user-handoff",
				},
			},
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
		const texts = classify.mock.calls.flatMap(([input]) => input.text ?? []);
		expect(texts).toEqual([expect.stringContaining(text)]);
		if (title === "Client Challenge")
			expect(texts[0]).toContain("Please enable JavaScript to proceed.");
	},
);

it.each(
	challengeOutputModes.flatMap((options) =>
		[
			{
				fixture: "ordinary title with quoted markers",
				source:
					"<title>Owned documentation</title><p>Verify you are human. JavaScript is disabled in your browser. Please enable JavaScript to proceed.</p>",
			},
			{
				fixture: "client title without both markers",
				source:
					"<title>Client Challenge</title><p>JavaScript is disabled in your browser.</p>",
			},
			{
				fixture: "client markers only in script",
				source:
					'<title>Client Challenge</title><script type="application/json">"JavaScript is disabled in your browser. Please enable JavaScript to proceed."</script><p>Owned content</p>',
			},
			{
				fixture: "hidden client markers",
				retainedInReader: true,
				source:
					"<title>Client Challenge</title><div hidden>JavaScript is disabled in your browser. Please enable JavaScript to proceed.</div><p>Owned content</p>",
			},
			{
				fixture: "hidden human markers",
				retainedInReader: true,
				source:
					'<title>Security check</title><div hidden>Verify you are human</div><div style="display:none">Checking your browser</div><p>Owned content</p>',
			},
			{
				fixture: "Cloudflare markers only in script",
				source:
					'<title>Attention Required! | Cloudflare</title><script type="application/json">"Checking your browser with Cloudflare"</script><p>Owned content</p>',
			},
		].map((fixture) => ({
			...options,
			...fixture,
			retainedInReader: "retainedInReader" in fixture,
		})),
	),
)(
	"keeps $fixture outcomes explicit in $mode (reader=$reader)",
	async ({ reader, execution, source, retainedInReader }) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(source, { reader, execution });
		if (reader && retainedInReader) {
			expect(report.reader).toMatchObject({ hiddenContentSemantics: false });
			expect(report).toMatchObject({
				outcome: "semantic-barrier",
				contentSuccess: false,
				classification: {
					barrier: "challenge",
					diagnostic: {
						confidence: "possible",
						action: "stop-and-request-user-handoff",
					},
				},
				failure: { category: "policy-denied", stage: "semantic-barrier" },
			});
			expect(report.extraction).toBeUndefined();
			expect(extract).not.toHaveBeenCalled();
			return;
		}
		expectUnverified(report, reader);
		expect(report.extraction?.format).toBe(execution.format ?? "markdown");
		expect(extract).toHaveBeenCalledOnce();
	},
);

it.each([
	{
		fixture: "continuing word",
		marker: "not a robot",
		suffix: "ic",
		blocked: false,
	},
	{
		fixture: "continuing underscore",
		marker: "not a robot",
		suffix: "_",
		blocked: false,
	},
	{
		fixture: "continuing digit",
		marker: "not a robot",
		suffix: "2",
		blocked: false,
	},
	{
		fixture: "inline word continuation",
		marker: "not a <strong>robot</strong>",
		suffix: "<em>ic</em>",
		blocked: false,
	},
	{
		fixture: "space boundary",
		marker: "not a robot",
		suffix: " remaining",
		blocked: true,
	},
	{
		fixture: "punctuation boundary",
		marker: "not a robot",
		suffix: ".",
		blocked: true,
	},
	{
		fixture: "block boundary",
		marker: "not a robot",
		suffix: "<p>ic</p>",
		blocked: true,
	},
	{ fixture: "document end", marker: "not a robot", suffix: "", blocked: true },
	{
		fixture: "marker completed only by lookahead",
		marker: "not a robo",
		suffix: "t",
		blocked: false,
	},
	{
		fixture: "marker beyond search prefix",
		marker: "",
		suffix: " not a robot",
		blocked: false,
	},
])(
	"bounds document diagnostics with one lookahead unit for $fixture",
	({ marker, suffix, blocked }) => {
		const visibleMarker = marker.replace(/<[^>]*>/g, "");
		const padding = "x".repeat(
			researchDiagnosticTextLimit - visibleMarker.length - 2,
		);
		const tree = parseHtmlDocument(
			`<title>Robot check</title><body>${padding} ${marker}${suffix}</body>`,
			url,
		);
		try {
			const text = researchDocumentDiagnosticText(tree);
			expect(text).toHaveLength(8193);
			expect(text.slice(0, researchDiagnosticTextLimit)).toBe(
				` ${padding} ${visibleMarker}`,
			);
			const diagnostic = challenges.classifyBrowserChallenge({
				status: 200,
				headers: { "content-type": ["text/html"] },
				url,
				title: "Robot check",
				text,
			});
			if (blocked)
				expect(diagnostic).toMatchObject({
					kind: "challenge",
					provider: "unspecified",
					confidence: "possible",
					evidence: ["html-challenge-markers"],
					action: "stop-and-request-user-handoff",
				});
			else expect(diagnostic).toBeNull();
		} finally {
			tree.close();
		}
	},
);
