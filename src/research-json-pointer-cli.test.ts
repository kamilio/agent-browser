import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	emitResearchReport,
	parseResearchArguments,
	researchBatch,
	researchExitCode,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import * as documentLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as readerLoader from "./research-loader.js";
import { BrowserSession } from "./session.js";

const url = "https://research.example/project/json";
const info = `{\r\n  "version": 9007199254740993, "negative": -0, "exponent": 1e400,${String.raw` "a/b": {"~key": [false, "\u0041\/B"]}, "empty": ""`}\r\n}`;
const source = ` \r\n{"label":"😀", "info": ${info}, "outside":"unselected"}\t`;
const outputs: Writable[] = [];

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(documentLoader, "loadBrowserDocument");
	vi.spyOn(readerLoader, "loadResearchDocument");
	vi.spyOn(extraction, "extractDocument");
});

afterEach(() => {
	for (const output of outputs.splice(0)) output.destroy();
	vi.restoreAllMocks();
});

function route(text = source, overrides: Partial<NetworkResponse> = {}) {
	const body = new TextEncoder().encode(text);
	const response: NetworkResponse = {
		url,
		status: 200,
		headers: { "content-type": ["application/json; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 1,
		...overrides,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
		async (request) => {
			expect(request.url).toBe(url);
			return response;
		},
	);
	return response;
}

interface NavigationOptions {
	reader?: boolean;
	signal?: AbortSignal;
	selector?: string;
	captureBody?: boolean;
	lines?: { start: number; end: number };
	section?: string;
	headings?: boolean;
	find?: string;
	documentProfile?: "default" | "long-v1";
}

function navigate(
	options: ResearchExecutionOptions = { jsonPointer: "/info" },
	navigation: NavigationOptions = {},
) {
	return researchNavigation(
		url,
		navigation.reader ?? true,
		navigation.signal,
		navigation.selector,
		navigation.captureBody ?? false,
		navigation.lines,
		navigation.section,
		navigation.headings ?? false,
		navigation.find,
		navigation.documentProfile,
		options,
	);
}

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(documentLoader.loadBrowserDocument).not.toHaveBeenCalled();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
	expect(extraction.extractDocument).not.toHaveBeenCalled();
}

function expectCleanup(report: ResearchNavigationReport, requests = 1) {
	expect(BrowserSession.prototype.createTab).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
		requests,
	);
	expect(report.metrics?.closed).toBe(true);
	for (const [tree] of vi.mocked(extraction.extractDocument).mock.calls)
		expect(tree.mutationMetrics().closed).toBe(true);
}

it.each(["", "/", "/info", "/a~1b/~0/0", "/😀/", "/a%2Fb"])(
	"parses an explicit pointer %j without transport setup",
	(pointer) => {
		expect(
			parseResearchArguments([url, "--json-pointer", pointer, "--reader"]),
		).toEqual({ reader: true, urls: [url], jsonPointer: pointer });
		expectNoSetup();
	},
);

it("leaves ordinary parsed arguments unchanged when the pointer is absent", () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	expect(parseResearchArguments(["--reader", "--lines", "1:2", url])).toEqual({
		reader: true,
		urls: [url],
		lines: { start: 1, end: 2 },
	});
	expectNoSetup();
});

it.each(
	[
		["--json-pointer"],
		["--json-pointer", "--reader"],
		["--json-pointer", "/info", "--json-pointer", "/other"],
		["--json-pointer", "", "--json-pointer", "/info"],
		["--json-pointer=/info"],
		["--json-pointer", "info"],
		["--json-pointer", "#/info"],
		["--json-pointer", "/bad~"],
		["--json-pointer", "/bad~2escape"],
	].map((args) => ({ args })),
)("rejects invalid pointer flags $args before setup", async ({ args }) => {
	expect(() => parseResearchArguments([url, ...args])).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	await expect(researchBatch([url, ...args]).next()).rejects.toMatchObject({
		code: "invalid-input",
	});
	expectNoSetup();
});

it.each([`/${"x".repeat(4096)}`, "/".repeat(129)])(
	"rejects an oversized pointer before setup (%#)",
	async (pointer) => {
		const args = [url, "--json-pointer", pointer];
		expect(() => parseResearchArguments(args)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		await expect(researchBatch(args).next()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expectNoSetup();
	},
);

const incompatibleModes: {
	name: string;
	flags: string[];
	navigation?: NavigationOptions;
	options?: ResearchExecutionOptions;
}[] = [
	{
		name: "selector",
		flags: ["--selector", "main"],
		navigation: { selector: "main" },
	},
	{
		name: "section",
		flags: ["--section", "h1"],
		navigation: { section: "h1" },
	},
	{
		name: "lines",
		flags: ["--lines", "1:2"],
		navigation: { lines: { start: 1, end: 2 } },
	},
	{ name: "headings", flags: ["--headings"], navigation: { headings: true } },
	{
		name: "find",
		flags: ["--find", "version"],
		navigation: { find: "version" },
	},
	{
		name: "content focus v1",
		flags: ["--content-focus", "main-content-v1"],
		options: { contentFocus: "main-content-v1" },
	},
	{
		name: "content focus v2",
		flags: ["--content-focus", "main-content-v2"],
		options: { contentFocus: "main-content-v2" },
	},
	{
		name: "text-prefix",
		flags: ["--output-limit-policy", "text-prefix-v1"],
		options: { outputLimitPolicy: "text-prefix-v1" },
	},
	{
		name: "long profile",
		flags: ["--document-profile", "long-v1"],
		navigation: { documentProfile: "long-v1" },
	},
	{
		name: "MIME repair",
		flags: ["--reader-mime-policy", "markdown-html-document-v1"],
		options: { readerMimePolicy: "markdown-html-document-v1" },
	},
];

it.each(incompatibleModes)(
	"rejects $name with empty-root pointer in CLI and programmatic calls",
	async ({ flags, navigation, options }) => {
		expect(() =>
			parseResearchArguments(["--reader", "--json-pointer", "", ...flags, url]),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		await expect(
			navigate({ ...options, jsonPointer: "" }, navigation),
		).rejects.toMatchObject({ code: "invalid-input" });
		expectNoSetup();
	},
);

it.each([null, false, 0, [], {}, "info", "#/info", "/bad~9"])(
	"validates programmatic pointer %j before transport setup",
	async (jsonPointer) => {
		await expect(
			navigate({ jsonPointer } as ResearchExecutionOptions),
		).rejects.toMatchObject({ code: "invalid-input" });
		expectNoSetup();
	},
);

it.each([
	{
		flag: "--reader-fallback-encoding",
		value: "utf-8",
		options: { readerFallbackEncoding: "utf-8" as const },
	},
	{
		flag: "--reader-raw-policy",
		value: "separate-omitted-raw-v1",
		options: { readerRawPolicy: "separate-omitted-raw-v1" as const },
	},
	{
		flag: "--reader-visibility-policy",
		value: "source-hidden-v1",
		options: { readerVisibilityPolicy: "source-hidden-v1" as const },
	},
])(
	"retains the reader requirement for $flag",
	async ({ flag, value, options }) => {
		expect(() =>
			parseResearchArguments(["--json-pointer", "/info", flag, value, url]),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		await expect(
			navigate({ jsonPointer: "/info", ...options }, { reader: false }),
		).rejects.toMatchObject({ code: "invalid-input" });
		expectNoSetup();
	},
);

const selections = [
	{ pointer: "/info", selected: info, valueKind: "object" },
	{
		pointer: "/info/a~1b/~0key/1",
		selected: String.raw`"\u0041\/B"`,
		valueKind: "string",
	},
	{
		pointer: "/info/version",
		selected: "9007199254740993",
		valueKind: "number",
	},
	{ pointer: "/info/negative", selected: "-0", valueKind: "number" },
	{ pointer: "/info/exponent", selected: "1e400", valueKind: "number" },
	{ pointer: "/info/empty", selected: '""', valueKind: "string" },
	{ pointer: "", selected: source.trim(), valueKind: "object" },
];

it.each(
	selections.flatMap((selection) =>
		[false, true].map((reader) => ({ ...selection, reader })),
	),
)(
	"retrieves literal $pointer via the actual loader and extractor (reader=$reader)",
	async ({ pointer, selected, valueKind, reader }) => {
		const response = route();
		const before = response.body.slice();
		const report = await navigate(
			{ jsonPointer: pointer },
			{ reader, captureBody: true },
		);
		const start = source.indexOf(selected);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			partial: true,
			contentSuccess: null,
			profile: reader ? readerLoader.researchReaderProfile : "native",
			selection: { method: "json-pointer", pointer },
			extraction: {
				format: "markdown",
				content: `\`\`\`\n${selected}\n\`\`\`\n`,
				jsonSelection: {
					kind: "json-source-selection-v1",
					method: "json-pointer",
					pointer,
					start,
					end: start + selected.length,
					sourceCodeUnits: source.length,
					selectedCodeUnits: selected.length,
					offsetBasis: "document-text-utf16",
					valueKind,
					duplicateMembers: "rejected",
				},
			},
		});
		expect(report.failure).toBeUndefined();
		expect(report.extraction).not.toHaveProperty("contentFallback");
		expect(report.extraction).not.toHaveProperty("textSelection");
		expect(report.primaryResponse).toMatchObject({
			decodedBytes: before.byteLength,
			bodySha256: createHash("sha256").update(before).digest("hex"),
			hashScope: "transport-decoded-body-before-loader",
		});
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(before);
		expect(response.body).toEqual(before);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
			expect.objectContaining({
				url,
				cookieContext: {
					credentials: "omit",
					siteUrl: null,
					topLevelNavigation: true,
				},
			}),
		);
		expect(extraction.extractDocument).toHaveBeenCalledOnce();
		const [tree, options] = vi.mocked(extraction.extractDocument).mock.calls[0];
		expect(options).toEqual({
			format: "markdown",
			jsonPointer: pointer,
			maxBytes: researchRunLimits.extractionBytes,
			maxNodes: 50_000,
			maxDepth: 128,
		});
		const loader = reader
			? vi.mocked(readerLoader.loadResearchDocument)
			: vi.mocked(documentLoader.loadBrowserDocument);
		expect(loader).toHaveBeenCalledOnce();
		expect(await loader.mock.results[0].value).toBe(tree);
		expect(loader.mock.calls[0][1].scripts).toBeUndefined();
		expectCleanup(report);
	},
);

it.each(["", "/info/a~1b/~0key/1"])(
	"plumbs %j through batch JSON output and the real report writer",
	async (pointer) => {
		route();
		const reports: ResearchNavigationReport[] = [];
		for await (const report of researchBatch([
			"--reader",
			"--capture-body",
			"--json-pointer",
			pointer,
			"--format",
			"json",
			"--table-metadata",
			url,
		]))
			reports.push(report);
		expect(reports).toHaveLength(1);
		const report = reports[0];
		const selected = pointer === "" ? source.trim() : String.raw`"\u0041\/B"`;
		expect(report.selection).toEqual({ method: "json-pointer", pointer });
		expect(report.extraction).toMatchObject({
			format: "json",
			content: {
				type: "container",
				children: [
					{ type: "pre", children: [{ type: "text", text: selected }] },
				],
			},
			jsonSelection: { pointer, selectedCodeUnits: selected.length },
		});
		const chunks: Buffer[] = [];
		const output = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			},
		});
		outputs.push(output);
		const exit = await emitResearchReport(output, report);
		expect(researchExitCode([exit])).toBe(0);
		const emitted = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		expect(emitted.selection).toEqual(report.selection);
		expect(emitted.extraction).toEqual(report.extraction);
		expect(emitted.bodyCapture).toEqual(report.bodyCapture);
		expectCleanup(report);
	},
);

it.each([
	{ text: '{"info":1} trailing', pointer: "/info", category: "invalid-input" },
	{
		text: '{"info":1,"outside":[0,]}',
		pointer: "/info",
		category: "invalid-input",
	},
	{
		text: '{"info":1,"outside":{"key":1,"key":2}}',
		pointer: "/info",
		category: "invalid-input",
	},
	{ text: '{"info":1}', pointer: "/missing", category: "not-found" },
	{ text: '{"info":[1]}', pointer: "/info/01", category: "not-found" },
	{ text: '{"info":1}', pointer: "/__proto__", category: "not-found" },
])(
	"reports $category for $pointer without retries or partial values",
	async ({ text, pointer, category }) => {
		const response = route(text);
		const report = await navigate(
			{ jsonPointer: pointer },
			{ captureBody: true },
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			selection: { method: "json-pointer", pointer },
			failure: { category, stage: "extraction" },
		});
		expect(report.extraction).toBeUndefined();
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(
			response.body,
		);
		expect(extraction.extractDocument).toHaveBeenCalledOnce();
		expectCleanup(report);
	},
);

it.each([false, true])(
	"does not guess a JSON source from HTML (reader=%s)",
	async (reader) => {
		route('<pre>{"info":1}</pre>', {
			headers: { "content-type": ["text/html"] },
		});
		const report = await navigate({ jsonPointer: "/info" }, { reader });
		expect(report).toMatchObject({
			outcome: "failure",
			failure: { category: "unsupported", stage: "extraction" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extraction.extractDocument).toHaveBeenCalledOnce();
		expectCleanup(report);
	},
);

it("selects a small value without truncating or reserializing a large source", async () => {
	route(`{"padding":"${"x".repeat(300_000)}","info":9007199254740993}`);
	const report = await navigate();
	expect(report).toMatchObject({
		outcome: "extracted-unverified",
		extraction: {
			content: "```\n9007199254740993\n```\n",
			jsonSelection: { selectedCodeUnits: 16 },
		},
	});
	expect(report.primaryResponse?.decodedBytes).toBeGreaterThan(
		researchRunLimits.extractionBytes,
	);
	expect(report).not.toHaveProperty("bodyCapture");
	expectCleanup(report);
});

it.each(["markdown", "json"] as const)(
	"rejects an oversized complete literal in %s instead of truncating it",
	async (format) => {
		route(`{"info":"${"x".repeat(300_000)}"}`);
		const report = await navigate({ jsonPointer: "/info", format });
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "extraction" },
		});
		expect(report.extraction).toBeUndefined();
		expectCleanup(report);
	},
);

it("does not bypass source admission limits for a small selected literal", async () => {
	route(`{"info":1,"padding":"${"x".repeat(2_000_000)}"}`);
	const report = await navigate();
	expect(report).toMatchObject({
		outcome: "failure",
		failure: { category: "resource-limit", stage: "loader" },
	});
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expect(report.extraction).toBeUndefined();
	expectCleanup(report);
});

it.each([404, 429])(
	"retains HTTP %s and does not retry JSON selection",
	async (status) => {
		route('{"info":"unavailable"}', {
			status,
			headers: { "content-type": ["application/json"], "retry-after": ["60"] },
		});
		const report = await navigate();
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
		});
		if (status === 429) {
			expect(report.rateLimit).toMatchObject({
				action: "stop-without-retry",
				status,
			});
			expect(extraction.extractDocument).not.toHaveBeenCalled();
		}
		expectCleanup(report);
	},
);

it("preserves transport failure and closes without attempting extraction", async () => {
	vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
		new AgentBrowserError("network-error", "PRIVATE_JSON_TRANSPORT_ERROR"),
	);
	const report = await navigate();
	expect(report).toMatchObject({
		outcome: "failure",
		primaryResponse: null,
		failure: { category: "network-error", stage: "network" },
	});
	expect(JSON.stringify(report)).not.toContain("PRIVATE_JSON_TRANSPORT_ERROR");
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expectCleanup(report);
});

it("honors an already aborted navigation without issuing a request", async () => {
	const controller = new AbortController();
	controller.abort();
	const report = await navigate(
		{ jsonPointer: "" },
		{ signal: controller.signal },
	);
	expect(report).toMatchObject({
		outcome: "failure",
		failure: { category: "aborted" },
	});
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expectCleanup(report, 0);
});

it("keeps output failure explicit after JSON extraction cleanup", async () => {
	route();
	const report = await navigate();
	const output = new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		},
	});
	outputs.push(output);
	output.destroy();
	await expect(emitResearchReport(output, report)).rejects.toMatchObject({
		code: "closed",
	});
	expectCleanup(report);
});

it("leaves ordinary extraction options and request headers unchanged", async () => {
	route("<main>Ordinary content</main>", {
		headers: { "content-type": ["text/html"] },
	});
	const report = await navigate({}, { selector: "main" });
	expect(report).toMatchObject({
		outcome: "extracted-unverified",
		selection: { method: "css-selector", matches: 1 },
		extraction: { content: "Ordinary content\n" },
	});
	expect(report.extraction).not.toHaveProperty("jsonSelection");
	const options = vi.mocked(extraction.extractDocument).mock.calls[0][1];
	expect(options).not.toHaveProperty("jsonPointer");
	expect(options).toMatchObject({ root: expect.any(String) });
	const request = vi.mocked(NodeNetworkTransport.prototype.request).mock
		.calls[0][0];
	expect(request.headers).not.toHaveProperty("accept");
	expectCleanup(report);
});
