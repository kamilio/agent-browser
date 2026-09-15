import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import { researchNavigation } from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import {
	type DocumentExtraction,
	type ExtractedNode,
	extractDocument,
} from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";
import {
	type ResearchSourceDataTables,
	researchSourceDataTables,
} from "./research-source-data-tables.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";

const url = "https://source-data.fixture.invalid/document";
const encoder = new TextEncoder();
const formats = ["markdown", "json"] as const;
const policies = [
	{ name: "default", policy: undefined },
	{ name: "source-hidden", policy: "source-hidden-v1" },
	{ name: "source-hidden-inline", policy: "source-hidden-inline-v1" },
] as const;
const context: DocumentLoaderContext = {
	tabId: "source-data-fixture",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
const article =
	'<main id="article"><h1>Guide</h1><p>Visible café documentation.</p></main>';
const fields = [
	{
		key: "memory",
		label: "Mémoire dédiée",
		value: "96",
		suffix: " Go ± 1",
	},
	{
		key: "speed",
		label: "Fréquence &amp; <b>source</b>",
		value: "≥ 3,5",
		prefix: "jusqu’à ",
		suffix: " GHz ⚡",
		hidePrefix: true,
	},
];
const trees: DocumentTree[] = [];

function payload(titles = ["Série Ω"]) {
	return {
		items: titles.map((title) => ({
			title,
			elementsOrder: ["memory", "speed", "rawOnly"],
			elements: {
				speed: {
					title: fields[1].label,
					formatValue: fields[1].value,
					prefix: fields[1].prefix,
					suffix: fields[1].suffix,
					hidePrefix: true,
					value: 987654321,
					tooltip: "PRIVATE_TOOLTIP",
				},
				memory: {
					title: fields[0].label,
					formatValue: fields[0].value,
					suffix: fields[0].suffix,
					value: 103079215104,
				},
				rawOnly: { title: "RAW_ONLY_LABEL", value: 246813579 },
			},
			model: "PRIVATE_MODEL",
			description: "PRIVATE_DESCRIPTION",
		})),
		productPages: ["https://source-data.fixture.invalid/PRIVATE_PRODUCT"],
		bootstrap: "PRIVATE_BOOTSTRAP",
	};
}

function attribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function tableMarkup(
	id = "source-data",
	titles = ["Série Ω"],
	attributes = "",
	tag = "section",
): string {
	return `<${tag} id="${id}" data-json="${attribute(JSON.stringify(payload(titles)))}"${attributes ? ` ${attributes}` : ""}></${tag}>`;
}

function response(source: string): NetworkResponse {
	const body = encoder.encode(source);
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
	source: string,
	policy?: ResearchReaderVisibilityPolicy,
): DocumentTree {
	const tree = loadResearchDocument(
		response(source),
		context,
		undefined,
		"separate-omitted-raw-v1",
		policy,
	);
	trees.push(tree);
	return tree;
}

function sanitize(source: string, policy?: ResearchReaderVisibilityPolicy) {
	return sanitizeResearchHtml(
		source,
		{},
		undefined,
		undefined,
		"separate-omitted-raw-v1",
		policy,
	);
}

function requireData(
	data: ResearchSourceDataTables | undefined,
): ResearchSourceDataTables {
	if (!data) throw new Error("Expected source data table metadata");
	return data;
}

function requireExtraction(
	result: DocumentExtraction | undefined,
): DocumentExtraction {
	if (!result) throw new Error("Expected source data fixture extraction");
	return result;
}

function nodeText(node: ExtractedNode): string {
	return [node.text ?? "", ...(node.children ?? []).map(nodeText)].join("");
}

function bodyText(result: DocumentExtraction): string {
	return result.format === "markdown"
		? result.content
		: nodeText(result.content);
}

function bytes(value: unknown): number {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

function hash(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

afterEach(() => {
	try {
		for (const tree of trees.splice(0)) tree.close();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

describe("source data reader integration", () => {
	it.each(formats)(
		"keeps formatted source data separate from the %s content tree",
		(format) => {
			const source = `<title>Guide</title>${tableMarkup()}${article}`;
			const sanitized = sanitize(source);
			const ignoredSource = source.replace("data-json=", "data-ignored=");
			const ignored = sanitize(ignoredSource);
			expect(sanitized.html).toBe(ignored.html);
			expect(sanitized.report.sourceCodeUnits).toBe(source.length);
			expect(ignored.report.sourceCodeUnits).toBe(ignoredSource.length);
			expect(sanitized.report).toEqual({
				...ignored.report,
				sourceCodeUnits: source.length,
			});
			expect(ignored.sourceDataTables).toBeUndefined();
			const tree = load(source);
			const result = extractDocument(tree, { format });
			const data = requireData(result.sourceDataTables);
			expect(data).toEqual({
				kind: "html-data-json-tables-v1",
				scope: "document-source",
				partial: true,
				rendered: false,
				truncated: false,
				tables: [
					{
						source: {
							attribute: "data-json",
							tag: "section",
							offset: source.indexOf("<section"),
							id: "source-data",
						},
						rows: [{ title: "Série Ω", fields, truncated: false }],
						truncated: false,
					},
				],
			});
			expect(data).toEqual(sanitized.sourceDataTables);
			expect(data).toBe(researchSourceDataTables(tree));
			expect(bodyText(result)).toContain("Visible café documentation");
			for (const marker of ["Série Ω", "Mémoire", "GHz", "≥ 3,5"])
				expect(JSON.stringify(result.content)).not.toContain(marker);
			for (const marker of [
				"987654321",
				"103079215104",
				"246813579",
				"RAW_ONLY_LABEL",
				"PRIVATE_",
			])
				expect(JSON.stringify(result)).not.toContain(marker);
			expect(new DocumentQueries(tree).querySelector("[data-json]")).toBeNull();
		},
	);

	it.each(policies)(
		"collects only non-omitted source starts under $name visibility",
		({ policy }) => {
			const source = [
				article,
				tableMarkup("visible"),
				tableMarkup("hidden-self", undefined, "hidden"),
				`<div aria-hidden="true">${tableMarkup("aria-child")}</div>`,
				tableMarkup("inline-self", undefined, 'style="display:none"'),
				`<div style="display:none">${tableMarkup("inline-child")}</div>`,
				tableMarkup("legacy-self", undefined, "", "template"),
				`<svg>${tableMarkup("legacy-child")}</svg>`,
				tableMarkup("raw-self", undefined, "", "script"),
				`<script>${tableMarkup("raw-child")}</script>`,
			].join("");
			const sanitized = sanitize(source, policy);
			const ignored = sanitize(
				source.replaceAll("data-json=", "data-skip="),
				policy,
			);
			expect(sanitized.html).toBe(ignored.html);
			expect(sanitized.report).toEqual(ignored.report);
			const ids = ["visible"];
			if (policy === undefined) ids.push("hidden-self", "aria-child");
			if (policy !== "source-hidden-inline-v1")
				ids.push("inline-self", "inline-child");
			const data = requireData(
				extractDocument(load(source, policy)).sourceDataTables,
			);
			expect(data.tables.map((table) => table.source.id)).toEqual(ids);
			expect(data).toEqual(sanitized.sourceDataTables);
			expect(sanitized.report.omittedSubtrees).toMatchObject({
				template: 1,
				svg: 1,
				script: 2,
			});
		},
	);

	it("distinguishes real starts from comments, raw text and escaped text", () => {
		const fake = tableMarkup("not-a-source-start");
		const source = [
			`<!--${fake}-->`,
			`<script>${fake}</script>`,
			`<textarea>${fake}</textarea>`,
			`<xmp>${fake}</xmp>`,
			`<p>${attribute(fake)}</p>`,
			tableMarkup("real"),
		].join("");
		const data = requireData(sanitize(source).sourceDataTables);
		expect(data.tables.map((table) => table.source.id)).toEqual(["real"]);
		expect(data.tables[0].source.offset).toBe(
			source.indexOf('<section id="real"'),
		);
	});

	it("does not decode double-encoded JSON attribute syntax a second time", () => {
		const encoded = attribute(JSON.stringify(payload()));
		const source = `<section data-json="${attribute(encoded)}"></section>${article}`;
		expect(sanitize(source).sourceDataTables).toBeUndefined();
		expect(extractDocument(load(source))).not.toHaveProperty(
			"sourceDataTables",
		);
	});

	it("retains normalized UTF-16 document offsets and snapshot scope through selection and close", () => {
		const source = `<!--😀\r\npréface-->\r\n${tableMarkup()}\r\n${article}`;
		const normalized = source.replace(/\r\n?/g, "\n");
		const tree = load(source);
		const data = requireData(researchSourceDataTables(tree));
		const before = JSON.stringify(data);
		const offset = normalized.indexOf("<section");
		expect(data.tables[0].source.offset).toBe(offset);
		expect(offset).not.toBe(source.indexOf("<section"));
		expect(offset).not.toBe(
			encoder.encode(normalized.slice(0, offset)).byteLength,
		);
		const queries = new DocumentQueries(tree);
		const selected = queries.querySelector("#article");
		const sourceNode = queries.querySelector("#source-data");
		if (selected === null || sourceNode === null)
			throw new Error("Expected source data and article fixture nodes");
		tree.setAttribute(
			sourceNode,
			"data-json",
			JSON.stringify(payload(["LATER"])),
		);
		for (const format of formats) {
			const result = extractDocument(tree, {
				format,
				root: tree.reference(selected),
			});
			expect(result.scope).toBe(tree.reference(selected));
			expect(result.sourceDataTables).toBe(data);
			expect(result.sourceDataTables?.scope).toBe("document-source");
			expect(bodyText(result)).toContain("Visible café documentation");
			expect(JSON.stringify(result.content)).not.toContain("Série Ω");
			expect(JSON.stringify(result)).not.toContain("LATER");
		}
		expect(Object.isFrozen(data)).toBe(true);
		expect(JSON.stringify(data)).toBe(before);
		tree.close();
		expect(researchSourceDataTables(tree)).toBeUndefined();
		expect(JSON.stringify(data)).toBe(before);
		expect(researchSourceDataTables(load(article))).toBeUndefined();
	});

	it.each(formats)(
		"preserves the original %s byte bound and fits only complete UTF-8 rows",
		(format) => {
			const source = `${tableMarkup("source-data", ["Série Ω", "Série β", "Série γ"])}${article}`;
			const tree = load(source);
			const full = extractDocument(tree, { format });
			const { sourceDataTables, ...baseline } = full;
			const data = requireData(sourceDataTables);
			expect(baseline).not.toHaveProperty("sourceDataTables");
			const bodyBytes = bytes(baseline);
			expect(bodyBytes).toBeGreaterThan(JSON.stringify(baseline).length);
			const stored = requireData(researchSourceDataTables(tree));
			expect(stored).toBe(data);
			const before = JSON.stringify(data);
			const tight = extractDocument(tree, { format, maxBytes: bodyBytes });
			expect(tight).toEqual(baseline);
			expect(bytes(tight)).toBe(bodyBytes);
			expect(() =>
				extractDocument(tree, { format, maxBytes: bodyBytes - 1 }),
			).toThrowError(expect.objectContaining({ code: "resource-limit" }));
			const empty: ResearchSourceDataTables = {
				...data,
				truncated: true,
				tables: [],
			};
			const prefix: ResearchSourceDataTables = {
				...data,
				truncated: true,
				tables: [
					{
						...data.tables[0],
						truncated: true,
						rows: data.tables[0].rows.slice(0, 1),
					},
				],
			};
			const keyBytes = encoder.encode(',"sourceDataTables":').byteLength;
			for (const expected of [empty, prefix, data]) {
				const maxBytes = bodyBytes + keyBytes + bytes(expected);
				const result = extractDocument(tree, { format, maxBytes });
				expect(result).toEqual({ ...baseline, sourceDataTables: expected });
				expect(bytes(result)).toBe(maxBytes);
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
				for (const table of requireData(result.sourceDataTables).tables)
					for (const row of table.rows) expect(row.fields).toEqual(fields);
			}
			const belowMarker = bodyBytes + keyBytes + bytes(empty) - 1;
			expect(extractDocument(tree, { format, maxBytes: belowMarker })).toEqual(
				baseline,
			);
			expect(researchSourceDataTables(tree)).toBe(stored);
			expect(JSON.stringify(stored)).toBe(before);
			expect(JSON.stringify(data)).toBe(before);
		},
	);
});

it("regenerates metadata from captured HTML in pinned native navigation replay", async () => {
	const source = `<title>Guide</title>${tableMarkup()}${article}`;
	const input = response(source);
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockRejectedValue(new Error("Unexpected source data fixture request"));
	request.mockResolvedValueOnce(input);
	const createTab = vi.spyOn(BrowserSession.prototype, "createTab");
	const sessionClose = vi.spyOn(BrowserSession.prototype, "close");
	const transportClose = vi.spyOn(NodeNetworkTransport.prototype, "close");
	const treeClose = vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Source data fixtures must not fetch");
		}),
	);
	try {
		const report = await researchNavigation(
			url,
			true,
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			false,
			undefined,
			"default",
			{
				format: "markdown",
				minRequestIntervalMs: 0,
				readerRawPolicy: "separate-omitted-raw-v1",
				readerVisibilityPolicy: "source-hidden-inline-v1",
			},
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			metrics: { active: 0, closed: true },
		});
		const original = requireExtraction(report.extraction);
		const data = requireData(original.sourceDataTables);
		expect(data).toEqual(
			sanitize(source, "source-hidden-inline-v1").sourceDataTables,
		);
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
		const serialized = serializeResearchReport(report, "default");
		expect(serialized.disposition).toBe("complete");
		const raw = serialized.jsonl;
		const before = raw.slice();
		const trusted = {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: input.body.byteLength, sha256: hash(input.body) },
		};
		for (const format of formats) {
			const closedBefore = treeClose.mock.calls.length;
			const replay = extractResearchReplayJson(
				raw,
				trusted,
				{ selector: "#article" },
				undefined,
				format,
			);
			expect(replay.report).toMatchObject({
				outcome: "extracted-unverified",
				contentSuccess: null,
				networkRequests: 0,
				selection: { matches: 1 },
				source: {
					receiptSha256: trusted.expectedReceiptSha256,
					body: trusted.expectedBody,
				},
			});
			const extracted = requireExtraction(replay.report.extraction);
			expect(extracted.sourceDataTables).toEqual(data);
			expect(bodyText(extracted)).toContain("Visible café documentation");
			expect(JSON.stringify(extracted.content)).not.toContain("Série Ω");
			expect(treeClose.mock.calls.length).toBeGreaterThan(closedBefore);
		}
		const forged = serializeResearchReport(
			{
				...report,
				extraction: {
					...original,
					sourceDataTables: {
						...data,
						tables: data.tables.map((table) => ({
							...table,
							rows: table.rows.map((row) => ({
								...row,
								title: "FORGED_RECEIPT_METADATA",
							})),
						})),
					},
				},
			},
			"default",
		);
		expect(forged.disposition).toBe("complete");
		expect(() =>
			extractResearchReplayJson(forged.jsonl, trusted, {
				selector: "#article",
			}),
		).toThrow();
		const replay = extractResearchReplayJson(
			forged.jsonl,
			{ ...trusted, expectedReceiptSha256: hash(forged.jsonl) },
			{ selector: "#article" },
		);
		expect(replay.report.networkRequests).toBe(0);
		expect(replay.report.extraction?.sourceDataTables).toEqual(data);
		expect(JSON.stringify(replay.report.extraction)).not.toContain(
			"FORGED_RECEIPT_METADATA",
		);
		expect(raw).toEqual(before);
		expect(hash(input.body)).toBe(trusted.expectedBody.sha256);
		expect(request).toHaveBeenCalledOnce();
		expect(fetch).not.toHaveBeenCalled();
		expect(sessionClose).toHaveBeenCalledOnce();
		expect(transportClose).toHaveBeenCalledOnce();
		expect(treeClose).toHaveBeenCalled();
		for (const session of new Set(createTab.mock.contexts)) {
			if (!(session instanceof BrowserSession))
				throw new Error("Expected fixture session owner");
			expect(session.metrics().closed).toBe(true);
		}
		for (const transport of new Set(request.mock.contexts)) {
			if (!(transport instanceof NodeNetworkTransport))
				throw new Error("Expected fixture transport owner");
			expect(transport.metrics()).toMatchObject({ active: 0, closed: true });
		}
		for (const tree of treeClose.mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected fixture document owner");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(researchSourceDataTables(tree)).toBeUndefined();
		}
	} finally {
		for (const session of new Set(createTab.mock.contexts))
			if (session instanceof BrowserSession) session.close();
		for (const transport of new Set(request.mock.contexts))
			if (transport instanceof NodeNetworkTransport) transport.close();
	}
});
