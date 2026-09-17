import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { runResearchReplayCli } from "../scripts/research-replay-cli.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { DocumentExtraction } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { researchReaderInfo } from "./research-reader-info.js";

const url = "https://source-headings.fixture.invalid/article";
const policy = "source-aria-heading-v1";
const flags = ["--source-heading-policy", policy];
const source =
	'<!doctype html><html><head><title>Source headings article</title></head><body><main id="main"><span id="wanted" role="heading" aria-level="2">Top quality. Better prices.</span><span>Inspect every returned item.</span><div role="heading" aria-level="3">Details</div><p>Useful source evidence.</p><p role="heading">Next section</p><p>Outside suffix.</p><a href="/article" role="heading" aria-level="1">Linked article</a></main></body></html>';
const encoder = new TextEncoder();
const streams: Array<Readable | Writable> = [];
let requests = 0;

beforeEach(() => {
	requests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected test request"),
	);
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("No fetch permitted");
		}),
	);
});

afterEach(() => {
	try {
		for (const stream of streams.splice(0)) stream.destroy();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			requests,
		);
		expect(fetch).not.toHaveBeenCalled();
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected native tree");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(tree)).toBeUndefined();
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(value: Uint8Array) {
	return createHash("sha256").update(value).digest("hex");
}

function arrange(html = source, mime = "text/html", status = 200) {
	const body = encoder.encode(html);
	requests++;
	vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
		function (this: NodeNetworkTransport, input) {
			return this.requestWithRoutes(input, () => ({
				url,
				status,
				headers: { "content-type": [`${mime}; charset=utf-8`] },
				body,
				encodedBytes: 0,
				redirects: [],
				elapsedMs: 0,
			}));
		},
	);
	return body;
}

async function fixture(
	options: {
		source?: string;
		mime?: string;
		status?: number;
		headings?: boolean;
		section?: string;
		selector?: string;
		execution?: ResearchExecutionOptions;
	} = {},
) {
	const body = arrange(options.source, options.mime, options.status);
	const report = await researchNavigation(
		url,
		true,
		undefined,
		options.selector,
		true,
		undefined,
		options.section,
		options.headings ?? false,
		undefined,
		undefined,
		{ minRequestIntervalMs: 0, ...options.execution },
	);
	expect(report.metrics).toMatchObject({
		active: 0,
		closed: true,
		requests: 1,
	});
	const raw = serializeResearchReport(report).jsonl;
	return {
		report,
		body,
		raw,
		trusted: {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

function markdown(report: { extraction?: DocumentExtraction }) {
	if (report.extraction?.format !== "markdown")
		throw new Error("Expected Markdown");
	return report.extraction.content;
}

it("preserves default source output and native-only heading discovery", async () => {
	const baseline = await fixture();
	expect(markdown(baseline.report)).toContain("Better prices\\.Inspect");
	expect(baseline.report).not.toHaveProperty("sourceHeadingPolicy");
	expect(baseline.report.reader).not.toHaveProperty("sourceHeadingPolicy");
	expect(baseline.report.extraction).not.toHaveProperty("sourceHeadingPolicy");
	const outline = await fixture({ headings: true });
	expect(outline.report.headings?.entries).toEqual([]);
});

it.each([undefined, "source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"separates heading and body text under visibility policy %s",
	async (readerVisibilityPolicy) => {
		const input = await fixture({
			execution: { sourceHeadingPolicy: policy, readerVisibilityPolicy },
		});
		expect(markdown(input.report)).toContain(
			"## Top quality\\. Better prices\\.\n\nInspect",
		);
		expect(markdown(input.report)).toContain("### Details");
		expect(markdown(input.report)).toContain("## Next section");
		expect(markdown(input.report)).toContain(
			"[Linked article](<https://source-headings.fixture.invalid/article>)",
		);
		expect(input.report).toMatchObject({
			sourceHeadingPolicy: policy,
			outcome: "extracted-unverified",
			reader: { sourceHeadingPolicy: policy },
			extraction: { sourceHeadingPolicy: policy },
		});
		expect(input.body).toEqual(encoder.encode(source));
	},
);

it("discovers mixed source headings and selects source sections", async () => {
	const outline = await fixture({
		headings: true,
		execution: { sourceHeadingPolicy: policy },
	});
	expect(
		outline.report.headings?.entries.map((entry) => [entry.title, entry.level]),
	).toEqual([
		["Top quality. Better prices.", 2],
		["Details", 3],
		["Next section", 2],
	]);
	expect(outline.report.headings?.sourceHeadingPolicy).toBe(policy);
	const section = await fixture({
		section: "#wanted",
		execution: { sourceHeadingPolicy: policy },
	});
	expect(markdown(section.report)).toContain("Useful source evidence");
	expect(markdown(section.report)).not.toContain("Next section");
});

it("serializes high source levels without unbounded Markdown markers", async () => {
	const html = source.replace('aria-level="2"', 'aria-level="2147483647"');
	const outline = await fixture({
		source: html,
		headings: true,
		execution: { sourceHeadingPolicy: policy },
	});
	expect(outline.report.headings?.entries[0]).toMatchObject({
		level: 2147483647,
		sourceHeading: {
			policy,
			level: 2147483647,
			rendered: false,
			verified: false,
		},
	});
	const input = await fixture({
		source: html,
		execution: { sourceHeadingPolicy: policy },
	});
	expect(markdown(input.report)).toContain("###### Top quality");
	expect(markdown(input.report)).not.toContain("#######");
});

it("forwards source heading flags through researchBatch", async () => {
	expect(
		parseResearchArguments(["--reader", ...flags, "--headings", url]),
	).toMatchObject({ sourceHeadingPolicy: policy, headings: true });
	arrange();
	const reports: ResearchNavigationReport[] = [];
	for await (const report of researchBatch([
		"--reader",
		...flags,
		"--min-request-interval-ms",
		"0",
		url,
	]))
		reports.push(report);
	expect(reports).toHaveLength(1);
	expect(markdown(reports[0])).toContain("## Top quality");
});

it("admits long-profile source outlines with original levels above six", async () => {
	const body = arrange(source.replace('aria-level="2"', 'aria-level="7"'));
	const report = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		true,
		undefined,
		"long-v1",
		{ sourceHeadingPolicy: policy },
	);
	expect(report.headings?.entries[0].level).toBe(7);
	const raw = serializeResearchReport(report, "long-v1").jsonl;
	const admitted = validateResearchReplayAdmission(raw, {
		expectedProfile: "long-v1",
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	});
	expect(admitted.kind).toBe("validated-capture");
	admitted.body?.fill(0);
});

it.each([
	["--find", "text"],
	["--lines", "1:2"],
	["--json-pointer", ""],
	flags,
])("rejects incompatible or duplicate flags %j", (...extra) => {
	expect(() =>
		parseResearchArguments(["--reader", ...flags, ...extra, url]),
	).toThrow();
});

it.each(["", "other", " source-aria-heading-v1", "source-aria-heading-v1 "])(
	"rejects invalid policy %j before native transport",
	async (invalid) => {
		expect(() =>
			parseResearchArguments([
				"--reader",
				"--source-heading-policy",
				invalid,
				url,
			]),
		).toThrow();
		await expect(
			researchNavigation(
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
				{ sourceHeadingPolicy: invalid } as ResearchExecutionOptions,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
	},
);

it("rejects missing policy and non-reader use", () => {
	expect(() =>
		parseResearchArguments([url, "--reader", "--source-heading-policy"]),
	).toThrow();
	expect(() => parseResearchArguments([...flags, url])).toThrow();
});

it.each(["text/plain", "text/markdown", "application/json"])(
	"refuses source headings on literal %s",
	async (mime) => {
		const input = await fixture({
			mime,
			source: "Literal document",
			execution: { sourceHeadingPolicy: policy },
		});
		expect(input.report).toMatchObject({
			outcome: "failure",
			failure: { category: "unsupported" },
		});
		expect(input.report.extraction).toBeUndefined();
	},
);

it("retains HTTP failure instead of upgrading heading-rich error content", async () => {
	const input = await fixture({
		status: 403,
		execution: { sourceHeadingPolicy: policy },
	});
	expect(input.report.outcome).toBe("http-failure");
	expect(input.report.contentSuccess).toBe(false);
});

it.each(["source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"does not reveal hidden headings with %s",
	async (readerVisibilityPolicy) => {
		const input = await fixture({
			source: source.replace('<span id="wanted"', '<span hidden id="wanted"'),
			headings: true,
			execution: { sourceHeadingPolicy: policy, readerVisibilityPolicy },
		});
		expect(
			input.report.headings?.entries.map((entry) => entry.title),
		).not.toContain("Top quality. Better prices.");
	},
);

it.each([
	{ selector: "#main" },
	{ section: "#wanted" },
	{ contentFocus: "main-content-v3" as const },
])("replays captured heading policy with selection %j", async (selection) => {
	const input = await fixture({
		execution: {
			sourceHeadingPolicy: policy,
			readerVisibilityPolicy: "source-hidden-inline-v1",
		},
	});
	const result = extractResearchReplayJson(
		input.raw,
		input.trusted,
		selection,
		undefined,
		"markdown",
	);
	expect(markdown(result.report)).toContain("## Top quality");
	expect(result.report).toMatchObject({
		networkRequests: 0,
		source: {
			sourceHeadingPolicy: policy,
			capturedOutcome: input.report.outcome,
		},
		selection: { sourceHeadingPolicy: policy },
		reader: { sourceHeadingPolicy: policy },
		extraction: { sourceHeadingPolicy: policy },
	});
});

it("retains captured policy in JSON replay without inventing a default for old captures", async () => {
	const current = await fixture({
		execution: { sourceHeadingPolicy: policy, format: "json" },
	});
	const result = extractResearchReplayJson(current.raw, current.trusted, {
		section: "#wanted",
	});
	expect(result.report.extraction?.format).toBe("json");
	expect(result.report.extraction?.sourceHeadingPolicy).toBe(policy);
	const old = await fixture();
	const replay = extractResearchReplayJson(
		old.raw,
		old.trusted,
		{ selector: "#main" },
		undefined,
		"markdown",
	);
	expect(markdown(replay.report)).toContain("Better prices\\.Inspect");
	expect(replay.report.source).not.toHaveProperty("sourceHeadingPolicy");
});

it.each(["sourceHeadingPolicy", "reader", "extraction"])(
	"rejects missing captured policy declaration at %s",
	async (location) => {
		const input = await fixture({ execution: { sourceHeadingPolicy: policy } });
		const report = JSON.parse(new TextDecoder().decode(input.raw));
		if (location === "sourceHeadingPolicy")
			Reflect.deleteProperty(report, "sourceHeadingPolicy");
		else Reflect.deleteProperty(report[location], "sourceHeadingPolicy");
		const raw = encoder.encode(`${JSON.stringify(report)}\n`);
		expect(() =>
			extractResearchReplayJson(
				raw,
				{ ...input.trusted, expectedReceiptSha256: hash(raw) },
				{ selector: "#main" },
			),
		).toThrow();
	},
);

it("runs the replay CLI on captured policy without extra flags or requests", async () => {
	const input = await fixture({ execution: { sourceHeadingPolicy: policy } });
	const stream = Readable.from([input.raw]);
	let text = "";
	const output = new Writable({
		write(chunk, _encoding, callback) {
			text += String(chunk);
			callback();
		},
	});
	streams.push(stream, output);
	const code = await runResearchReplayCli(
		[
			"--expected-profile",
			"default",
			"--receipt-sha256",
			input.trusted.expectedReceiptSha256,
			"--body-sha256",
			input.trusted.expectedBody.sha256,
			"--body-bytes",
			String(input.trusted.expectedBody.bytes),
			"--section",
			"#wanted",
			"--format",
			"markdown",
		],
		stream,
		output,
	);
	expect(code).toBe(0);
	expect(markdown(JSON.parse(text))).toContain("## Top quality");
	expect(output.listenerCount("error")).toBe(0);
	expect(output.listenerCount("close")).toBe(0);
});
