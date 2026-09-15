import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import * as challenges from "./browser-challenges.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { ExtractedNode } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";
import { textDocumentInfo } from "./text-document-info.js";

const encoder = new TextEncoder();
const url = "https://text-replay.fixture.invalid/source";
const privateMarker = "SYNTHETIC_TEXT_REPLAY_PRIVATE";
const textSelections = [
	{ find: "Owned" },
	{ lines: { start: 1, end: 1 } },
] satisfies replay.ResearchJsonReplaySelection[];

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: admission.TrustedResearchReplayAdmission;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Text replay must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
	source = "Owned first\nOwned second\nOutside suffix",
	options: {
		mime?: string;
		profile?: ResearchDocumentProfileId;
		reader?: boolean;
		lines?: { start: number; end: number };
		status?: number;
		outcome?: ResearchNavigationReport["outcome"];
	} = {},
): Promise<Fixture> {
	const body = encoder.encode(source);
	const profile = options.profile ?? "default";
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: options.status ?? 200,
		headers: {
			"content-type": [options.mime ?? "text/plain; charset=utf-8"],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		options.reader ?? profile === "long-v1",
		undefined,
		undefined,
		true,
		options.lines,
		undefined,
		profile === "long-v1",
		undefined,
		profile,
		{ minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(source));
	expect(report.outcome).toBe(options.outcome ?? "extracted-unverified");
	const serialized = admission.serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	vi.clearAllMocks();
	return {
		report,
		raw: serialized.jsonl,
		body,
		trusted: {
			expectedProfile: profile,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

function revised(
	input: Fixture,
	mutate: (report: ResearchNavigationReport) => void,
): Fixture {
	const report = structuredClone(input.report);
	mutate(report);
	const raw = encoder.encode(`${JSON.stringify(report)}\n`);
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function run(
	input: Fixture,
	selection: replay.ResearchJsonReplaySelection,
	format: replay.ResearchReplayFormat = "json",
	signal?: AbortSignal,
) {
	const original = {
		raw: hash(input.raw),
		body: hash(input.body),
		report: JSON.stringify(input.report),
		trusted: structuredClone(input.trusted),
		selection: structuredClone(selection),
	};
	try {
		const result = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection,
			signal,
			format,
		);
		expect(result).not.toBeInstanceOf(Promise);
		expect(result.jsonl.endsWith("\n")).toBe(true);
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(
			replay.researchJsonReplayLimits.maxOutputBytes,
		);
		expect(result.report).toMatchObject({
			kind: "native-research-json-replay-v1",
			partial: true,
			networkRequests: 0,
			source: {
				profile: input.trusted.expectedProfile,
				reportedFinalUrl: input.report.finalUrl,
				receiptSha256: input.trusted.expectedReceiptSha256,
				body: input.trusted.expectedBody,
			},
		});
		for (const key of [
			"bodyCapture",
			"rawReceipt",
			"originalMetadata",
			"recovery",
		])
			expect(result.report).not.toHaveProperty(key);
		return result;
	} finally {
		expect(hash(input.raw)).toBe(original.raw);
		expect(hash(input.body)).toBe(original.body);
		expect(JSON.stringify(input.report)).toBe(original.report);
		expect(input.trusted).toEqual(original.trusted);
		expect(selection).toEqual(original.selection);
	}
}

function literalText(node: ExtractedNode): string {
	return node.type === "text"
		? (node.text ?? "")
		: (node.children ?? []).map(literalText).join("");
}

function observeOwnership() {
	const validate = admission.validateResearchReplayAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		(...args) => {
			const admitted = validate(...args);
			if (admitted.kind === "validated-capture") bodies.push(admitted.body);
			return admitted;
		},
	);
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return (expectedTrees = bodies.length) => {
		expect(bodies.length).toBeGreaterThan(0);
		for (const body of bodies) {
			expect(body.byteLength).toBeGreaterThan(0);
			expect(body.every((value) => value === 0)).toBe(true);
		}
		expect(close).toHaveBeenCalledTimes(expectedTrees);
		for (const tree of close.mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected owned tree");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(loader.researchReaderInfo(tree)).toBeUndefined();
			expect(textDocumentInfo(tree)).toBeUndefined();
		}
	};
}

it("keeps four-argument JSON and explicit Markdown overloads for text lines", async () => {
	const input = await fixture();
	const released = observeOwnership();
	const selection = { lines: { start: 2, end: 2 } };
	const json = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		selection,
		undefined,
	);
	expectTypeOf(json.report.extraction?.content).toEqualTypeOf<
		ExtractedNode | undefined
	>();
	expect(json.report.extraction?.format).toBe("json");
	expect(json.report.extraction?.content).toBeDefined();
	const markdown = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		selection,
		undefined,
		"markdown",
	);
	expectTypeOf(markdown.report.extraction?.content).toEqualTypeOf<
		string | undefined
	>();
	expect(markdown.report.extraction?.content).toBe("```\nOwned second\n```\n");
	const explicit = run(input, selection);
	const withoutReferences = (
		report: replay.ResearchJsonReplayReport<replay.ResearchReplayFormat>,
	) =>
		JSON.parse(
			JSON.stringify(report, (key, value) =>
				["ref", "document", "scope"].includes(key) ? undefined : value,
			),
		);
	expect(withoutReferences(explicit.report)).toEqual(
		withoutReferences(json.report),
	);
	released();
});

it("finds first literal matches per line using UTF-16 coordinates", async () => {
	const source =
		"# 😀Needle Needle\r\n\r\n| Needle |\r[Needle](no-follow)\nneedle";
	const input = await fixture(source, { mime: "text/markdown", reader: true });
	const released = observeOwnership();
	const discover = vi.spyOn(extraction, "discoverDocumentTextLines");
	const extract = vi.spyOn(extraction, "extractDocument");
	const result = run(input, { find: "Needle" });
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
		selection: { method: "text-line-discovery", matches: 3 },
		textLines: {
			method: "text-line-discovery",
			partial: true,
			entries: [
				{ line: 1, column: 5 },
				{ line: 3, column: 3 },
				{ line: 4, column: 2 },
			],
			totalLines: 5,
			matchedLines: 3,
			sourceCodeUnits: source.length,
			truncated: false,
		},
		reader: { scripting: false, styling: false, partial: true },
	});
	expect(discover).toHaveBeenCalledOnce();
	expect(discover.mock.calls[0][1]).toBe("Needle");
	expect(discover.mock.calls[0][2]).toMatchObject({
		maxBytes: replay.researchJsonReplayLimits.maxExtractionBytes,
	});
	expect(result.report.textLines).toEqual(discover.mock.results[0].value);
	expect(extract).not.toHaveBeenCalled();
	expect(result.report.extraction).toBeUndefined();
	expect(result.jsonl).not.toContain("Needle");
	released();
});

it.each([
	{ query: " Needle ", source: "Needle\n Needle \n needle ", line: 2 },
	{ query: ".*", source: "anything\n.*\n...", line: 2 },
	{ query: "[a-z]+", source: "abc\n[a-z]+", line: 2 },
	{ query: "  ", source: " \n  \n\tOutside", line: 2 },
	{ query: "😀".repeat(128), source: "😀".repeat(128), line: 1 },
])("preserves the literal query $query", async ({ query, source, line }) => {
	const input = await fixture(source);
	const result = run(input, { find: query });
	expect(result.report.selection).toEqual({
		method: "text-line-discovery",
		matches: 1,
	});
	expect(result.report.textLines?.entries).toEqual([{ line, column: 1 }]);
});

it.each([
	"text/plain",
	"TEXT/PLAIN; charset=UTF-8",
	"text/markdown",
	"text/csv",
	"application/json",
	"application/problem+json",
	"text/xml",
	"application/xml",
	"application/rss+xml",
	"application/atom+xml",
])(
	"reuses admitted %s as literal text without parsing or execution",
	async (mime) => {
		const selected =
			'<script>fetch("https://no-follow.invalid/")</script>,{"broken":<entry>&entity;';
		const source = `Owned prefix\n${selected}\nOutside suffix`;
		const input = await fixture(source, { mime });
		const released = observeOwnership();
		const found = run(input, { find: '<script>fetch("' });
		expect(found.report.textLines?.entries).toEqual([{ line: 2, column: 1 }]);
		const result = run(input, { lines: { start: 2, end: 2 } });
		const extracted = result.report.extraction;
		if (extracted?.format !== "json") throw new Error("Expected JSON lines");
		expect(literalText(extracted.content)).toBe(`${selected}\n`);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "text-lines", matches: 1 },
		});
		expect(result.jsonl).not.toContain("Outside suffix");
		released();
	},
);

it.each([
	{
		source: "skip\nCafé 😀\nlast",
		start: 2,
		end: 2,
		raw: "Café 😀\n",
		total: 3,
	},
	{
		source: "skip\rCafé 😀\rlast",
		start: 2,
		end: 2,
		raw: "Café 😀\r",
		total: 3,
	},
	{
		source: "skip\r\nCafé 😀\r\nlast",
		start: 2,
		end: 2,
		raw: "Café 😀\r\n",
		total: 3,
	},
	{
		source: "skip\r\none\rtwo\nlast",
		start: 2,
		end: 3,
		raw: "one\rtwo\n",
		total: 4,
	},
	{
		source: "skip\n😀e\u0301界\u2028\u2029",
		start: 2,
		end: 2,
		raw: "😀e\u0301界\u2028\u2029",
		total: 2,
	},
])("preserves line metadata and core formatting for $source", async (entry) => {
	const input = await fixture(entry.source);
	const released = observeOwnership();
	const extract = vi.spyOn(extraction, "extractDocument");
	for (const format of ["json", "markdown"] as const) {
		const result = run(
			input,
			{ lines: { start: entry.start, end: entry.end } },
			format,
		);
		expect(result.report.selection).toEqual({
			method: "text-lines",
			matches: entry.end - entry.start + 1,
		});
		expect(result.report.extraction?.textSelection).toEqual({
			method: "text-lines",
			start: entry.start,
			end: entry.end,
			totalLines: entry.total,
			sourceCodeUnits: entry.source.length,
			selectedCodeUnits: entry.raw.length,
		});
		const extracted = result.report.extraction;
		const normalized = entry.raw.replace(/\r\n?/g, "\n");
		if (extracted?.format === "json")
			expect(literalText(extracted.content)).toBe(normalized);
		else
			expect(extracted?.content).toBe(
				`\`\`\`\n${normalized.replace(/\n$/, "")}\n\`\`\`\n`,
			);
		expect(extracted).toEqual(extract.mock.results.at(-1)?.value);
		expect(result.report.textLines).toBeUndefined();
	}
	released();
});

it("returns zero discovery matches without extracting or promoting success", async () => {
	const input = await fixture();
	const released = observeOwnership();
	const extract = vi.spyOn(extraction, "extractDocument");
	const result = run(input, { find: privateMarker });
	expect(result.report).toMatchObject({
		outcome: "empty-extraction",
		contentSuccess: false,
		selection: { method: "text-line-discovery", matches: 0 },
		textLines: {
			entries: [],
			matchedLines: 0,
			totalLines: 3,
			truncated: false,
		},
	});
	expect(result.jsonl).not.toContain(privateMarker);
	expect(extract).not.toHaveBeenCalled();
	released();
});

it("counts returned discovery entries, not all matches, at the existing cap", async () => {
	const input = await fixture(`${"Owned\n".repeat(51)}Outside suffix`);
	const result = run(input, { find: "Owned" });
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
		selection: { method: "text-line-discovery", matches: 50 },
		textLines: { matchedLines: 51, totalLines: 52, truncated: true },
	});
	expect(result.report.textLines?.entries).toEqual(
		Array.from({ length: 50 }, (_, index) => ({ line: index + 1, column: 1 })),
	);
});

it("distinguishes a trailing empty line from an out-of-source range", async () => {
	const input = await fixture("Owned\r\n");
	const released = observeOwnership();
	const empty = run(input, { lines: { start: 2, end: 2 } });
	expect(empty.report).toMatchObject({
		outcome: "empty-extraction",
		contentSuccess: false,
		selection: { method: "text-lines", matches: 1 },
		extraction: { textSelection: { totalLines: 2, selectedCodeUnits: 0 } },
	});
	for (const lines of [
		{ start: 1, end: 3 },
		{ start: 2_000_001, end: 2_000_001 },
	])
		expect(() => run(input, { lines })).toThrowError(
			expect.objectContaining({ code: "not-found" }),
		);
	released();
});

it("rejects invalid queries, ranges and mixed modes before admission", async () => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	const load = vi.spyOn(loader, "loadResearchDocument");
	const invalid: unknown[] = [
		...["", "x".repeat(257), "😀".repeat(129), "a\nb", "a\rb", null, 1, {}].map(
			(find) => ({ find }),
		),
		...[
			null,
			"1:2",
			[],
			{},
			{ start: 1 },
			{ end: 1 },
			{ start: 0, end: 1 },
			{ start: 2, end: 1 },
			{ start: -1, end: 1 },
			{ start: 1.5, end: 2 },
			{ start: 1, end: 1.5 },
			{ start: "1", end: 2 },
			{ start: 1, end: "2" },
			{ start: Number.NaN, end: 2 },
			{ start: 1, end: Number.POSITIVE_INFINITY },
			{ start: 1, end: Number.MAX_SAFE_INTEGER + 1 },
			{ start: 1, end: 2_000_002 },
		].map((lines) => ({ lines })),
		{ find: "Owned", lines: { start: 1, end: 1 } },
		{ find: "Owned", lines: undefined },
		{ lines: { start: 1, end: 1 }, find: undefined },
	];
	for (const selection of textSelections) {
		for (const extra of [
			{ selector: "pre" },
			{ selector: undefined },
			{ section: "pre" },
			{ links: "Owned" },
			{ tableMetadata: true },
			{ tableMetadata: false },
			{ tableMetadata: undefined },
			{ tableRows: true },
			{ tableRows: false },
			{ tableRows: undefined },
			{ other: undefined },
			{ [Symbol("extra")]: undefined },
		])
			invalid.push({ ...selection, ...extra });
	}
	for (const selection of invalid)
		expect(() =>
			replay.extractResearchReplayJson(
				input.raw,
				input.trusted,
				selection as replay.ResearchJsonReplaySelection,
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(validate).not.toHaveBeenCalled();
	expect(load).not.toHaveBeenCalled();
});

it("rejects proxies, accessors and non-data ranges without invoking hooks", async () => {
	const input = await fixture();
	const hook = vi.fn(() => {
		throw new Error(privateMarker);
	});
	const proxy = new Proxy(
		{ start: 1, end: 1 },
		{
			get: hook,
			ownKeys: hook,
			getPrototypeOf: hook,
			getOwnPropertyDescriptor: hook,
		},
	);
	const revoked = Proxy.revocable({ start: 1, end: 1 }, {});
	revoked.revoke();
	const nested = [
		proxy,
		revoked.proxy,
		Object.create({ start: 1, end: 1 }),
		Object.assign([], { start: 1, end: 1 }),
		Object.defineProperty({ end: 1 }, "start", { get: hook }),
		Object.defineProperty({ start: 1 }, "end", { set: hook }),
		Object.defineProperty({ start: 1, end: 1 }, "extra", { get: hook }),
		{ start: 1, end: 1, [Symbol("extra")]: 1 },
		{ start: 1, end: 1, extra: undefined },
		{ start: { valueOf: hook }, end: 1 },
	];
	const invalid = [
		...nested.map((lines) => ({ lines })),
		new Proxy(
			{ find: "Owned" },
			{ get: hook, ownKeys: hook, getPrototypeOf: hook },
		),
		Object.defineProperty({}, "find", { get: hook }),
		Object.defineProperty({}, "lines", { get: hook }),
		Object.create({ find: "Owned" }),
	];
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	for (const selection of invalid)
		expect(() =>
			replay.extractResearchReplayJson(
				input.raw,
				input.trusted,
				selection as replay.ResearchJsonReplaySelection,
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(validate).not.toHaveBeenCalled();
	expect(hook).not.toHaveBeenCalled();
});

it("accepts null-prototype data records and snapshots nested primitive fields", async () => {
	const input = await fixture();
	const lines = Object.assign(Object.create(null), { start: 2, end: 2 });
	const selection = Object.assign(Object.create(null), { lines });
	const originalRaw = hash(input.raw);
	const validate = admission.validateResearchReplayAdmission;
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementationOnce(
		(...args) => {
			lines.start = 1;
			lines.end = 99;
			return validate(...args);
		},
	);
	const result = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		selection,
	);
	expect(result.report.extraction?.textSelection).toMatchObject({
		start: 2,
		end: 2,
	});
	expect(hash(input.raw)).toBe(originalRaw);
	const frozen = Object.freeze({ lines: Object.freeze({ start: 1, end: 1 }) });
	expect(run(input, frozen).report.selection.matches).toBe(1);
	const find = Object.assign(Object.create(null), { find: "Owned" });
	expect(run(input, find).report.selection.matches).toBe(2);
});

it("rejects Markdown discovery and bad formats before admission", async () => {
	const input = await fixture();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	for (const selection of textSelections) {
		for (const format of [
			"html",
			"JSON",
			"",
			null,
			{},
			...(Object.hasOwn(selection, "find") ? ["markdown"] : []),
		])
			expect(() =>
				replay.extractResearchReplayJson(
					input.raw,
					input.trusted,
					selection,
					undefined,
					format as replay.ResearchReplayFormat,
				),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	}
	expect(validate).not.toHaveBeenCalled();
});

it.each(["default", "long-v1"] as const)(
	"rejects %s HTML captures as literal text",
	async (profile) => {
		const input = await fixture("<h1>Owned</h1><pre>Owned</pre>", {
			mime: "text/html",
			profile,
		});
		const released = observeOwnership();
		const load = vi.spyOn(loader, "loadResearchDocument");
		for (const selection of textSelections)
			expect(() => run(input, selection)).toThrowError(
				expect.objectContaining({ code: "unsupported" }),
			);
		expect(load).not.toHaveBeenCalled();
		released(0);
	},
);

it("does not reinterpret a literal-text capture through HTML selectors", async () => {
	const input = await fixture();
	const released = observeOwnership();
	for (const selection of [
		{ selector: "pre" },
		{ section: "pre" },
		{ links: "Owned" },
	])
		expect(() => run(input, selection)).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
	released(0);
});

it.each([
	"text/html",
	"text/javascript",
	"application/xhtml+xml",
	"application/custom+xml",
	"text/x-markdown",
	"application/octet-stream",
	"text/*",
])("does not widen literal MIME admission to %s", async (mime) => {
	const input = revised(await fixture(), (report) => {
		if (!report.primaryResponse) throw new Error("Expected response");
		report.primaryResponse.headers = {
			...report.primaryResponse.headers,
			"content-type": [mime],
		};
	});
	for (const selection of textSelections)
		expect(() => run(input, selection)).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
});

it("preserves receipt, body and source identity pins for both text modes", async () => {
	const input = await fixture();
	const load = vi.spyOn(loader, "loadResearchDocument");
	const invalid = [
		{
			...input,
			trusted: { ...input.trusted, expectedReceiptSha256: "0".repeat(64) },
		},
		{
			...input,
			trusted: {
				...input.trusted,
				expectedBody: {
					bytes: input.body.byteLength + 1,
					sha256: hash(input.body),
				},
			},
		},
		{
			...input,
			trusted: {
				...input.trusted,
				expectedBody: { bytes: input.body.byteLength, sha256: "0".repeat(64) },
			},
		},
		revised(input, (report) => {
			if (!report.primaryResponse) throw new Error("Expected response");
			report.primaryResponse.bodySha256 = "0".repeat(64);
		}),
		revised(input, (report) => {
			report.finalUrl = "https://text-replay.fixture.invalid/changed";
		}),
	];
	for (const changed of invalid)
		for (const selection of textSelections)
			expect(() => run(changed, selection)).toThrowError(
				expect.objectContaining({ code: "invalid-input" }),
			);
	expect(load).not.toHaveBeenCalled();
});

it("refuses an actual unsuccessful HTTP capture with correct pins", async () => {
	const input = await fixture("Owned", {
		status: 404,
		outcome: "http-failure",
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const selection of textSelections)
		expect(() => run(input, selection)).toThrowError(
			expect.objectContaining({ code: "policy-denied" }),
		);
	expect(load).not.toHaveBeenCalled();
});

it("leaves incomplete and failed receipts evidence-only even with fresh pins", async () => {
	const original = await fixture();
	const inputs = [
		revised(original, (report) => {
			Reflect.deleteProperty(report, "bodyCapture");
		}),
		revised(original, (report) => {
			report.outcome = "failure";
			report.contentSuccess = false;
			report.failure = { category: "unsupported", stage: "extraction" };
		}),
		revised(original, (report) => {
			report.outcome = "semantic-barrier";
			report.contentSuccess = false;
			report.classification.barrier = "challenge";
		}),
		{
			...original,
			trusted: {
				expectedProfile: original.trusted.expectedProfile,
				expectedReceiptSha256: original.trusted.expectedReceiptSha256,
			},
		},
	];
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const input of inputs)
		for (const selection of textSelections)
			expect(() => run(input, selection)).toThrowError(
				expect.objectContaining({ code: "policy-denied" }),
			);
	expect(load).not.toHaveBeenCalled();
});

it("does not recover an actual text extraction output-limit capture", async () => {
	const input = await fixture(`Owned\n${"x".repeat(260_000)}`, {
		reader: true,
		outcome: "failure",
	});
	expect(input.report.failure).toMatchObject({
		category: "resource-limit",
		stage: "extraction",
		resourceLimit: { kind: "extraction.output", limit: 256_000 },
	});
	const load = vi.spyOn(loader, "loadResearchDocument");
	for (const selection of textSelections) {
		expect(() => run(input, selection)).toThrowError(
			expect.objectContaining({ code: "policy-denied" }),
		);
		expect(() =>
			replay.recoverResearchOutputLimitSection(
				input.raw,
				input.trusted,
				selection as unknown as replay.ResearchOutputLimitSectionSelection,
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	}
	expect(() =>
		replay.recoverResearchOutputLimitSection(input.raw, input.trusted, {
			section: "pre",
		}),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(load).not.toHaveBeenCalled();
});

it("enforces extraction caps while allowing small ranges of a large captured source", async () => {
	const input = await fixture(`Owned\n${"é".repeat(128_001)}`, {
		lines: { start: 1, end: 1 },
	});
	const released = observeOwnership();
	expect(
		run(input, { lines: { start: 1, end: 1 } }).report.selection.matches,
	).toBe(1);
	for (const format of ["json", "markdown"] as const)
		expect(() =>
			run(input, { lines: { start: 2, end: 2 } }, format),
		).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	released();
});

it.each(textSelections)(
	"enforces final JSONL caps and cleanup for %j",
	async (selection) => {
		const input = await fixture();
		const released = observeOwnership();
		if (Object.hasOwn(selection, "find")) {
			const discover = extraction.discoverDocumentTextLines;
			vi.spyOn(extraction, "discoverDocumentTextLines").mockImplementationOnce(
				(...args) => ({
					...discover(...args),
					document: "x".repeat(replay.researchJsonReplayLimits.maxOutputBytes),
				}),
			);
		} else {
			const extract = extraction.extractDocument;
			vi.spyOn(extraction, "extractDocument").mockImplementationOnce(
				(...args) => ({
					...extract(...args),
					document: "x".repeat(replay.researchJsonReplayLimits.maxOutputBytes),
				}),
			);
		}
		expect(() => run(input, selection)).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
		released();
	},
);

it.each(textSelections)(
	"reclassifies captured source before selecting %j",
	async (selection) => {
		const input = await fixture();
		const released = observeOwnership();
		const classify = challenges.classifyBrowserChallenge;
		const diagnostic = classify({
			status: 200,
			headers: { "content-type": ["text/html"] },
			url,
			title: "Just a moment...",
			text: "Checking your browser. Complete the CAPTCHA.",
		});
		expect(diagnostic).not.toBeNull();
		vi.spyOn(challenges, "classifyBrowserChallenge").mockReturnValueOnce(
			diagnostic,
		);
		const extract = vi.spyOn(extraction, "extractDocument");
		const discover = vi.spyOn(extraction, "discoverDocumentTextLines");
		const result = run(input, selection);
		expect(result.report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
		});
		expect(extract).not.toHaveBeenCalled();
		expect(discover).not.toHaveBeenCalled();
		expect(result.report.extraction).toBeUndefined();
		expect(result.report.textLines).toBeUndefined();
		released();
	},
);

it("checks abort before admission without exposing the supplied reason", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort(new Error(privateMarker));
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	for (const selection of textSelections)
		expect(() => run(input, selection, "json", controller.signal)).toThrowError(
			expect.objectContaining({
				code: "aborted",
				message: expect.not.stringContaining(privateMarker),
			}),
		);
	expect(validate).not.toHaveBeenCalled();
});

it.each(textSelections)(
	"checks abort after loading and releases %j",
	async (selection) => {
		const input = await fixture();
		const released = observeOwnership();
		const controller = new AbortController();
		const load = loader.loadResearchDocument;
		vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce(
			(...args) => {
				const tree = load(...args);
				controller.abort();
				return tree;
			},
		);
		expect(() => run(input, selection, "json", controller.signal)).toThrowError(
			expect.objectContaining({ code: "aborted" }),
		);
		released();
	},
);

it("checks deadlines after discovery before publishing the report", async () => {
	const input = await fixture();
	const released = observeOwnership();
	let now = 1000;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const discover = extraction.discoverDocumentTextLines;
	vi.spyOn(extraction, "discoverDocumentTextLines").mockImplementationOnce(
		(...args) => {
			const result = discover(...args);
			now += replay.researchJsonReplayLimits.timeoutMs + 1;
			return result;
		},
	);
	expect(() => run(input, { find: "Owned" })).toThrowError(
		expect.objectContaining({ code: "timeout" }),
	);
	released();
});

it("closes an initialized literal document when the loader throws", async () => {
	const input = await fixture();
	const released = observeOwnership();
	const load = loader.loadResearchDocument;
	vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce((...args) => {
		load(...args);
		throw new AgentBrowserError("unsupported", "Synthetic loader failure");
	});
	expect(() => run(input, { lines: { start: 1, end: 1 } })).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	released();
});

it("wipes the admitted body even when closing its tree throws", async () => {
	const input = await fixture();
	const close = DocumentTree.prototype.close;
	const released = observeOwnership();
	vi.mocked(DocumentTree.prototype.close).mockImplementationOnce(function (
		this: DocumentTree,
	) {
		close.call(this);
		throw new AgentBrowserError("closed", "Synthetic close failure");
	});
	expect(() => run(input, { find: "Owned" })).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
	released();
});
