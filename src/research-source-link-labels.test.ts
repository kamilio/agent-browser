import { createHash } from "node:crypto";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import {
	parseResearchReplayArguments,
	runResearchReplayCli,
} from "../scripts/research-replay-cli.js";
import * as visibility from "../scripts/research-visibility.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { researchReaderInfo } from "./research-reader-info.js";
import { BrowserSession } from "./session.js";

const encoder = new TextEncoder();
const url = "https://source-link-labels.fixture.invalid/article";
const policy = "source-aria-label-v1";
const flags = ["--source-link-label-policy", policy];
const source =
	'<!doctype html><html><head><title>Source link article</title></head><body><aside>Outside prefix</aside><main id="main"><h2 id="wanted">Wanted section</h2><p>Useful article evidence.</p><a href="/download" aria-label="Download source"><svg><title>Not an inferred name</title></svg></a><a href="/visible" aria-label="Ignored replacement">Visible link</a><a href="/title-only" title="Not a source label"></a><a href="javascript:alert(1)" aria-label="Unsafe destination"></a></main><h2>Next section</h2><p>Outside suffix</p></body></html>';
const streams: Array<Readable | Writable> = [];
let expectedRequests = 0;

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Source link-label tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		for (const stream of streams.splice(0)) stream.destroy();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		expect(fetch).not.toHaveBeenCalled();
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected owned tree");
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(tree)).toBeUndefined();
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function arrangeResponse(html = source, mime = "text/html") {
	const body = encoder.encode(html);
	expectedRequests++;
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": [`${mime}; charset=utf-8`] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	return body;
}

function receipt(report: ResearchNavigationReport, body: Uint8Array) {
	const raw = admission.serializeResearchReport(report).jsonl;
	return {
		report,
		raw,
		body,
		trusted: {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

async function fixture(
	options: {
		source?: string;
		mime?: string;
		selector?: string;
		section?: string;
		execution?: ResearchExecutionOptions;
	} = {},
) {
	const body = arrangeResponse(options.source, options.mime);
	const report = await researchNavigation(
		url,
		true,
		undefined,
		options.selector,
		true,
		undefined,
		options.section,
		false,
		undefined,
		undefined,
		{ minRequestIntervalMs: 0, ...options.execution },
	);
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
	expect(BrowserSession.prototype.close).toHaveBeenCalled();
	return receipt(report, body);
}

function markdown(report: { extraction?: extraction.DocumentExtraction }) {
	if (report.extraction?.format !== "markdown")
		throw new Error("Expected Markdown extraction");
	return report.extraction.content;
}

function expectLabel(report: { extraction?: extraction.DocumentExtraction }) {
	const text = markdown(report);
	expect(text).toContain("[Source aria\\-label: Download source]");
	expect(text).toContain("https://source-link-labels.fixture.invalid/download");
	expect(text).toContain("[Visible link]");
	expect(text).not.toMatch(
		/Ignored replacement|Not an inferred name|title-only|Unsafe destination/,
	);
	expect(report.extraction?.sourceLinkLabels).toMatchObject({
		policy,
		attribute: "aria-label",
		rendered: false,
		verified: false,
		links: 1,
		truncatedLabels: 0,
	});
	expect(Object.isFrozen(report.extraction?.sourceLinkLabels)).toBe(true);
}

function argv(input: ReturnType<typeof receipt>) {
	return [
		"--expected-profile",
		"default",
		"--receipt-sha256",
		input.trusted.expectedReceiptSha256,
		"--body-sha256",
		input.trusted.expectedBody.sha256,
		"--body-bytes",
		String(input.trusted.expectedBody.bytes),
	];
}

function outputStream() {
	let text = "";
	const output = new Writable({
		write(chunk, _encoding, callback) {
			text += String(chunk);
			callback();
		},
	});
	streams.push(output);
	return { output, text: () => text };
}

const browserModes: Array<{
	name: string;
	args: string[];
	options: {
		selector?: string;
		section?: string;
		execution?: ResearchExecutionOptions;
	};
}> = [
	{ name: "document", args: [], options: {} },
	{
		name: "selector",
		args: ["--selector", "#main"],
		options: { selector: "#main" },
	},
	{
		name: "section",
		args: ["--section", "#wanted"],
		options: { section: "#wanted" },
	},
	...(["main-content-v1", "main-content-v2", "main-content-v3"] as const).map(
		(contentFocus) => ({
			name: contentFocus,
			args: ["--content-focus", contentFocus],
			options: { execution: { contentFocus } },
		}),
	),
];

it.each(browserModes)(
	"carries the explicit policy through browser $name",
	async (mode) => {
		expect(
			parseResearchArguments(["--reader", ...flags, ...mode.args, url]),
		).toMatchObject({ sourceLinkLabelPolicy: policy });
		const input = await fixture({
			...mode.options,
			execution: { ...mode.options.execution, sourceLinkLabelPolicy: policy },
		});
		expect(input.report).toMatchObject({
			outcome: "extracted-unverified",
			sourceLinkLabelPolicy: policy,
		});
		expectLabel(input.report);
		expect(input.body).toEqual(encoder.encode(source));
		expect(JSON.parse(new TextDecoder().decode(input.raw))).toMatchObject({
			sourceLinkLabelPolicy: policy,
		});
	},
);

it("leaves default Markdown and JSON unchanged and forwards batch argv", async () => {
	const baseline = await fixture();
	expect(markdown(baseline.report)).not.toContain("/download");
	expect(baseline.report).not.toHaveProperty("sourceLinkLabelPolicy");
	expect(baseline.report.extraction).not.toHaveProperty("sourceLinkLabels");
	const json = await fixture({ execution: { format: "json" } });
	expect(json.report.extraction?.format).toBe("json");
	expect(json.report.extraction).not.toHaveProperty("sourceLinkLabels");
	arrangeResponse();
	const reports = [];
	for await (const report of researchBatch([
		"--reader",
		"--min-request-interval-ms",
		"0",
		...flags,
		url,
	]))
		reports.push(report);
	expect(reports).toHaveLength(1);
	expectLabel(reports[0]);
});

it("carries policy through unfiltered visibility evidence without admitting hidden links", async () => {
	const evidence = vi.spyOn(visibility, "researchVisibilityEvidence");
	const extract = vi.spyOn(extraction, "extractDocument");
	const input = await fixture({
		source: source.replace(
			"</main>",
			'<a hidden href="/hidden" aria-label="Hidden label"></a></main>',
		),
		execution: {
			sourceLinkLabelPolicy: policy,
			readerVisibilityPolicy: "source-hidden-inline-v1",
		},
	});
	expectLabel(input.report);
	expect(markdown(input.report)).not.toContain("Hidden label");
	expect(evidence).toHaveBeenCalledOnce();
	expect(evidence.mock.calls[0][4]).toMatchObject({
		sourceLinkLabelPolicy: policy,
	});
	expect(
		extract.mock.calls.filter(
			([, options]) => options?.sourceLinkLabelPolicy === policy,
		),
	).toHaveLength(2);
	expect(DocumentTree.prototype.close).toHaveBeenCalledTimes(2);
});

it("reports bounded label truncation without changing the URL", async () => {
	const input = await fixture({
		source: source.replace("Download source", "Long source label ".repeat(100)),
		execution: { sourceLinkLabelPolicy: policy },
	});
	expect(markdown(input.report)).toContain("\\(truncated\\)");
	expect(markdown(input.report)).toContain(
		"https://source-link-labels.fixture.invalid/download",
	);
	expect(input.report.extraction?.sourceLinkLabels?.truncatedLabels).toBe(1);
});

it.each([
	["--format", "json"],
	["--headings"],
	["--find", "Wanted"],
	["--lines", "1:2"],
	["--json-pointer", ""],
	["--output-limit-policy", "text-prefix-v1"],
	[...flags],
	["--unknown-policy", policy],
])("rejects incompatible or duplicate browser flags %j", (...extra) => {
	expect(() =>
		parseResearchArguments(["--reader", ...flags, ...extra, url]),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	"",
	"source-aria-label-v2",
	" source-aria-label-v1",
	"source-aria-label-v1 ",
])("rejects invalid policy %j in both CLI parsers", (invalid) => {
	expect(() =>
		parseResearchArguments([
			"--reader",
			"--source-link-label-policy",
			invalid,
			url,
		]),
	).toThrow();
	expect(() =>
		parseResearchReplayArguments(["--source-link-label-policy", invalid]),
	).toThrow();
});

it("rejects missing policy values and browser use without the reader", () => {
	expect(() =>
		parseResearchArguments(["--reader", url, "--source-link-label-policy"]),
	).toThrow();
	expect(() => parseResearchArguments([...flags, url])).toThrow();
	expect(() =>
		parseResearchReplayArguments(["--source-link-label-policy"]),
	).toThrow();
});

it.each([
	{ sourceLinkLabelPolicy: null },
	{ sourceLinkLabelPolicy: false },
	{ sourceLinkLabelPolicy: "invalid" },
	{ sourceLinkLabelPolicy: policy, format: "json" },
	{ sourceLinkLabelPolicy: policy, jsonPointer: "" },
	{ sourceLinkLabelPolicy: policy, outputLimitPolicy: "text-prefix-v1" },
])(
	"revalidates programmatic execution before transport %j",
	async (options) => {
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
				options as ResearchExecutionOptions,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	},
);

it.each(["text/plain", "text/markdown", "application/json"])(
	"rejects actual %s sources rather than silently dropping the policy",
	async (mime) => {
		const input = await fixture({
			source:
				mime === "application/json" ? '{"value":"Literal"}' : "Literal text",
			mime,
			execution: { sourceLinkLabelPolicy: policy },
		});
		expect(input.report.outcome).toBe("failure");
		expect(input.report.extraction).toBeUndefined();
	},
);

const replayModes = [
	{ selector: "#main" },
	{ section: "#wanted" },
	{ contentFocus: "main-content-v1" as const },
	{ contentFocus: "main-content-v2" as const },
	{ contentFocus: "main-content-v3" as const },
];

it.each(replayModes)(
	"replays explicit selection %j without rewriting captured provenance",
	async (selection) => {
		const input = await fixture();
		const original = structuredClone(input);
		const baseline = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			selection,
			undefined,
			"markdown",
		);
		expect(markdown(baseline.report)).not.toContain("/download");
		expect(baseline.report.source).not.toHaveProperty("capturedOutcome");
		const result = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			{ ...selection, sourceLinkLabelPolicy: policy },
			undefined,
			"markdown",
		);
		expectLabel(result.report);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			networkRequests: 0,
			selection: { sourceLinkLabelPolicy: policy },
			source: {
				capturedOutcome: "extracted-unverified",
				receiptSha256: input.trusted.expectedReceiptSha256,
				body: input.trusted.expectedBody,
			},
		});
		expect(result.report.source).not.toHaveProperty("sourceLinkLabelPolicy");
		expect(input).toEqual(original);
	},
);

it("keeps newly captured policy distinct from ordinary replay policy, including JSON", async () => {
	const input = await fixture({ execution: { sourceLinkLabelPolicy: policy } });
	const admitted = admission.validateResearchReplayAdmission(
		input.raw,
		input.trusted,
	);
	expect(admitted.kind).toBe("validated-capture");
	expect(admitted.originalMetadata.sourceLinkLabelPolicy).toBe(policy);
	admitted.body?.fill(0);
	const baseline = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		{ selector: "#main" },
		undefined,
		"markdown",
	);
	expect(markdown(baseline.report)).not.toContain("/download");
	expect(baseline.report.selection).not.toHaveProperty("sourceLinkLabelPolicy");
	expect(baseline.report.source).toMatchObject({
		sourceLinkLabelPolicy: policy,
		capturedOutcome: input.report.outcome,
	});
	const json = replay.extractResearchReplayJson(input.raw, input.trusted, {
		selector: "#main",
	});
	expect(json.report.extraction?.format).toBe("json");
	expect(json.report.extraction).not.toHaveProperty("sourceLinkLabels");
});

it("runs replay CLI selector, section and focus on the same receipt", async () => {
	const input = await fixture({
		execution: { readerVisibilityPolicy: "source-hidden-v1" },
	});
	const evidence = vi.spyOn(visibility, "researchVisibilityEvidence");
	for (const selection of [
		["--selector", "#main"],
		["--section", "#wanted"],
		["--content-focus", "main-content-v3"],
	]) {
		const args = [
			...argv(input),
			...selection,
			"--format",
			"markdown",
			...flags,
		];
		expect(parseResearchReplayArguments(args).selection).toMatchObject({
			sourceLinkLabelPolicy: policy,
		});
		const stream = Readable.from([input.raw]);
		streams.push(stream);
		const output = outputStream();
		expect(await runResearchReplayCli(args, stream, output.output)).toBe(0);
		const report = JSON.parse(output.text());
		expect(markdown(report)).toContain(
			"[Source aria\\-label: Download source]",
		);
		expect(report.selection.sourceLinkLabelPolicy).toBe(policy);
		expect(report.source.capturedOutcome).toBe(input.report.outcome);
		expect(output.output.listenerCount("error")).toBe(0);
		expect(output.output.listenerCount("close")).toBe(0);
	}
	expect(evidence).toHaveBeenCalledTimes(3);
	for (const call of evidence.mock.calls)
		expect(call[4]).toMatchObject({ sourceLinkLabelPolicy: policy });
});

it.each([
	["--selector", "#main"],
	["--selector", "#main", "--format", "json"],
	["--links", "download", "--format", "markdown"],
	["--find", "Wanted"],
	["--lines", "1:2", "--format", "markdown"],
	["--headings", "--recover-output-limit"],
	["--selector", "#main", "--format", "markdown", "--recover-output-limit"],
	["--selector", "#main", "--format", "markdown", "--recover-empty-outline"],
	[
		"--selector",
		"#main",
		"--format",
		"markdown",
		"--output-limit-policy",
		"text-prefix-v1",
	],
	["--selector", "#main", "--format", "markdown", ...flags],
	["--selector", "#main", "--format", "markdown", "--unknown-policy", policy],
])("rejects replay CLI modes before reading stdin %j", async (...selection) => {
	const read = vi.fn();
	const input = new Readable({ read });
	streams.push(input);
	const output = outputStream();
	await expect(
		runResearchReplayCli(
			[
				"--expected-profile",
				"default",
				"--receipt-sha256",
				"a".repeat(64),
				"--body-sha256",
				"b".repeat(64),
				"--body-bytes",
				"1",
				...selection,
				...flags,
			],
			input,
			output.output,
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(read).not.toHaveBeenCalled();
	expect(output.text()).toBe("");
});

it("rejects long-profile policy replay before stdin admission", () => {
	expect(() =>
		parseResearchReplayArguments([
			"--expected-profile",
			"long-v1",
			"--receipt-sha256",
			"a".repeat(64),
			"--body-sha256",
			"b".repeat(64),
			"--body-bytes",
			"1",
			"--selector",
			"#main",
			"--format",
			"markdown",
			...flags,
		]),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	{ selector: "#main", sourceLinkLabelPolicy: "invalid" },
	{ selector: "#main", sourceLinkLabelPolicy: undefined },
	{
		selector: "#main",
		sourceLinkLabelPolicy: policy,
		outputLimitPolicy: "text-prefix-v1",
	},
	{ lines: { start: 1, end: 2 }, sourceLinkLabelPolicy: policy },
	{ find: "Wanted", sourceLinkLabelPolicy: policy },
	{ jsonPointer: "", sourceLinkLabelPolicy: policy },
	{ links: "download", sourceLinkLabelPolicy: policy },
])(
	"rejects programmatic selection smuggling before receipt validation %j",
	(selection) => {
		const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
		expect(() =>
			replay.extractResearchReplayJson(
				new Uint8Array(),
				{
					expectedProfile: "default",
					expectedReceiptSha256: "a".repeat(64),
				},
				selection as replay.ResearchJsonReplaySelection,
				undefined,
				"markdown",
			),
		).toThrow();
		expect(validate).not.toHaveBeenCalled();
	},
);

it("rejects programmatic JSON and recovery policies before admission", () => {
	const trusted = {
		expectedProfile: "default" as const,
		expectedReceiptSha256: "a".repeat(64),
	};
	const raw = new Uint8Array();
	const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
	expect(() =>
		replay.extractResearchReplayJson(raw, trusted, {
			selector: "#main",
			sourceLinkLabelPolicy: policy,
		}),
	).toThrow();
	expect(validate).not.toHaveBeenCalled();
	const recovery = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	const empty = vi.spyOn(admission, "validateResearchEmptyOutlineAdmission");
	const selector = { selector: "#main", sourceLinkLabelPolicy: policy };
	expect(() =>
		replay.recoverResearchOutputLimitSelector(
			raw,
			trusted,
			selector,
			undefined,
			"markdown",
		),
	).toThrow();
	expect(() =>
		replay.recoverResearchOutputLimitSection(
			raw,
			trusted,
			{ section: "#wanted", ...{ sourceLinkLabelPolicy: policy } },
			undefined,
			"markdown",
		),
	).toThrow();
	expect(() =>
		replay.recoverResearchOutputLimitContentFocus(
			raw,
			trusted,
			{ contentFocus: "main-content-v1", ...{ sourceLinkLabelPolicy: policy } },
			undefined,
			"markdown",
		),
	).toThrow();
	expect(() =>
		replay.recoverResearchEmptyOutlineSelector(
			raw,
			trusted,
			selector,
			undefined,
			"markdown",
		),
	).toThrow();
	expect(recovery).not.toHaveBeenCalled();
	expect(empty).not.toHaveBeenCalled();
});

it("rejects receipt policy mismatches and incompatible source-field smuggling", async () => {
	const input = await fixture({ execution: { sourceLinkLabelPolicy: policy } });
	const original = JSON.parse(new TextDecoder().decode(input.raw));
	const mutations = [
		(report: typeof original) => {
			report.sourceLinkLabelPolicy = "invalid";
		},
		(report: typeof original) => {
			Reflect.deleteProperty(report, "sourceLinkLabelPolicy");
		},
		(report: typeof original) => {
			report.extraction.sourceLinkLabels.policy = "invalid";
		},
		(report: typeof original) => {
			report.extraction.sourceLinkLabels.links = -1;
		},
		(report: typeof original) => {
			report.extraction.sourceLinkLabels.links = 129;
		},
		(report: typeof original) => {
			report.extraction.format = "json";
		},
		(report: typeof original) => {
			report.selection = { method: "text-lines", start: 1, end: 2 };
		},
		(report: typeof original) => {
			report.selection = { method: "json-pointer", pointer: "" };
		},
		(report: typeof original) => {
			report.outputLimitPolicy = "text-prefix-v1";
		},
		(report: typeof original) => {
			report.profile = "native";
		},
	];
	for (const mutate of mutations) {
		const modified = structuredClone(original);
		mutate(modified);
		const raw = encoder.encode(`${JSON.stringify(modified)}\n`);
		expect(() =>
			admission.validateResearchReplayAdmission(raw, {
				...input.trusted,
				expectedReceiptSha256: hash(raw),
			}),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	}
	for (const mime of ["text/plain", "application/json", "text/markdown"]) {
		const literal = await fixture({
			mime,
			source:
				mime === "application/json" ? '{"value":"literal"}' : "Literal text",
		});
		const report: ResearchNavigationReport = {
			...literal.report,
			sourceLinkLabelPolicy: policy,
		};
		const forged = receipt(report, literal.body);
		expect(() =>
			admission.validateResearchReplayAdmission(forged.raw, forged.trusted),
		).toThrow();
	}
	expect(input.raw).toEqual(encoder.encode(`${JSON.stringify(original)}\n`));
});

it("admits the actual maximum emitted source-label count", async () => {
	const input = await fixture({
		source: `<main>${Array.from(
			{ length: 128 },
			(_, index) =>
				`<a href="/label-${index}" aria-label="Label ${index}"></a>`,
		).join("")}</main>`,
		execution: { sourceLinkLabelPolicy: policy },
	});
	expect(input.report.extraction?.sourceLinkLabels?.links).toBe(128);
	const admitted = admission.validateResearchReplayAdmission(
		input.raw,
		input.trusted,
	);
	try {
		expect(admitted.body).toEqual(input.body);
	} finally {
		admitted.body?.fill(0);
	}
});

it("clears admitted bodies and closes trees on replay success and selection failure", async () => {
	const input = await fixture();
	const original = new Uint8Array(input.raw);
	const bodies: Uint8Array[] = [];
	const validate = admission.validateResearchReplayAdmission;
	vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
		(...args) => {
			const result = validate(...args);
			if (result.body) bodies.push(result.body);
			return result;
		},
	);
	vi.mocked(DocumentTree.prototype.close).mockClear();
	const result = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		{ selector: "#main", sourceLinkLabelPolicy: policy },
		undefined,
		"markdown",
	);
	expectLabel(result.report);
	expect(() =>
		replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			{ selector: "#missing", sourceLinkLabelPolicy: policy },
			undefined,
			"markdown",
		),
	).toThrow(expect.objectContaining({ code: "not-found" }));
	expect(bodies).toHaveLength(2);
	for (const body of bodies)
		expect(body.every((value) => value === 0)).toBe(true);
	expect(DocumentTree.prototype.close).toHaveBeenCalledTimes(2);
	expect(input.raw).toEqual(original);
	expect(input.body).toEqual(encoder.encode(source));
});

it.each(["text/plain", "text/markdown", "application/json"])(
	"rejects explicit policy replay of a literal %s capture and clears its admitted body",
	async (mime) => {
		const input = await fixture({
			mime,
			source:
				mime === "application/json" ? '{"value":"literal"}' : "Literal text",
		});
		expect(input.report.outcome).toBe("extracted-unverified");
		const bodies: Uint8Array[] = [];
		const validate = admission.validateResearchReplayAdmission;
		vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
			(...args) => {
				const result = validate(...args);
				if (result.body) bodies.push(result.body);
				return result;
			},
		);
		expect(() =>
			replay.extractResearchReplayJson(
				input.raw,
				input.trusted,
				{ selector: "#main", sourceLinkLabelPolicy: policy },
				undefined,
				"markdown",
			),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
		expect(bodies).toHaveLength(1);
		expect(bodies[0].every((value) => value === 0)).toBe(true);
	},
);

it("does not turn captured failure into a successful source-label reinterpretation", async () => {
	const input = await fixture();
	const failed = receipt(
		{
			...input.report,
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "extraction" },
		},
		input.body,
	);
	const original = new Uint8Array(failed.raw);
	expect(() =>
		replay.extractResearchReplayJson(
			failed.raw,
			failed.trusted,
			{ selector: "#main", sourceLinkLabelPolicy: policy },
			undefined,
			"markdown",
		),
	).toThrow(expect.objectContaining({ code: "policy-denied" }));
	expect(failed.raw).toEqual(original);
	expect(failed.report.outcome).toBe("failure");
});
