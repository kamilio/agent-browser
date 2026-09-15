import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";

const encoder = new TextEncoder();
const url = "https://table-rows-workflow.fixture.invalid/article";
const begin =
	"**Native table begin (selected structure only; associations unspecified)**";
const end = "**Native table end**";
const table =
	'<table><tr><td colspan="2">Feature</td><td rowspan="2">Support</td></tr><tr><th scope="row">Quantization</th><td>Available</td></tr></table>';
const source = `<aside>Outside prefix</aside><main><h2 id="wanted">Wanted</h2>${table}</main><h2>Next section</h2><p>Outside suffix</p>`;
const rows = [
	begin,
	"- Row 1",
	"  - Cell 1: Feature",
	"  - Cell 2: Support",
	"- Row 2",
	"  - Cell 1: Quantization",
	"  - Cell 2: Available",
	end,
	"",
].join("\n");
const recoverySource = `<h1 id="large">Large</h1><p>${"Background content. ".repeat(16_000)}</p>${source}`;
const trusted: admission.TrustedResearchReplayAdmission = {
	expectedProfile: "default",
	expectedReceiptSha256: "a".repeat(64),
	expectedBody: { bytes: 64, sha256: "b".repeat(64) },
};
const sectionExecutors: Array<
	(
		raw: Uint8Array,
		pins: admission.TrustedResearchReplayAdmission,
		selection: replay.ResearchOutputLimitSectionSelection,
		signal: AbortSignal | undefined,
		format: replay.ResearchReplayFormat,
	) => unknown
> = [
	replay.extractResearchReplayJson,
	replay.recoverResearchOutputLimitSection,
];

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Table row workflows must not fetch");
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

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function enqueue(html = source) {
	const body = encoder.encode(html);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	return body;
}

function consumedRequest() {
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	vi.mocked(NodeNetworkTransport.prototype.request).mockClear();
}

async function fixture(
	html = source,
	profile: ResearchDocumentProfileId = "default",
	recovery = false,
) {
	const body = enqueue(html);
	const report = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		!recovery,
		undefined,
		profile,
		{ minRequestIntervalMs: 0 },
	);
	consumedRequest();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(html));
	if (recovery) {
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: {
				category: "resource-limit",
				stage: "extraction",
				resourceLimit: {
					kind: "extraction.output",
					unit: "bytes",
					limit: 256_000,
				},
			},
		});
		expect(report.failure?.resourceLimit?.observed).toBeGreaterThan(256_000);
	} else expect(report.outcome).toBe("extracted-unverified");
	const serialized = admission.serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	return {
		report,
		raw,
		body,
		trusted: {
			expectedProfile: profile,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function markdown(
	input: Fixture,
	selection: replay.ResearchJsonReplaySelection,
	recovery = false,
) {
	const original = structuredClone(input);
	try {
		const result = recovery
			? replay.recoverResearchOutputLimitSection(
					input.raw,
					input.trusted,
					selection as replay.ResearchOutputLimitSectionSelection,
					undefined,
					"markdown",
				)
			: replay.extractResearchReplayJson(
					input.raw,
					input.trusted,
					selection,
					undefined,
					"markdown",
				);
		expectTypeOf(result.report.extraction?.content).toEqualTypeOf<
			string | undefined
		>();
		expect(result.report).toMatchObject({
			kind: "native-research-json-replay-v1",
			partial: true,
			networkRequests: 0,
			source: {
				profile: input.trusted.expectedProfile,
				reportedFinalUrl: input.report.finalUrl,
				receiptSha256: hash(input.raw),
				body: input.trusted.expectedBody,
			},
		});
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(327_680);
		for (const key of ["bodyCapture", "rawReceipt", "originalMetadata"])
			expect(result.jsonl).not.toContain(`"${key}"`);
		return result;
	} finally {
		expect(input).toEqual(original);
	}
}

function observeOwnership(recovery = false) {
	const bodies: Uint8Array[] = [];
	if (recovery) {
		const validate = admission.validateResearchOutputLimitSectionAdmission;
		vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		).mockImplementation((...args) => {
			const admitted = validate(...args);
			bodies.push(admitted.body);
			return admitted;
		});
	} else {
		const validate = admission.validateResearchReplayAdmission;
		vi.spyOn(admission, "validateResearchReplayAdmission").mockImplementation(
			(...args) => {
				const admitted = validate(...args);
				if (admitted.kind === "validated-capture") bodies.push(admitted.body);
				return admitted;
			},
		);
	}
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return () => {
		expect(bodies).toHaveLength(1);
		expect(bodies[0].byteLength).toBeGreaterThan(0);
		expect(bodies[0].every((value) => value === 0)).toBe(true);
		expect(close).toHaveBeenCalledOnce();
		const tree = close.mock.contexts[0];
		if (!(tree instanceof DocumentTree)) throw new Error("Expected owned tree");
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(loader.researchReaderInfo(tree)).toBeUndefined();
	};
}

it.each([false, true])(
	"propagates parsed live rows through batch extraction (reader=%s)",
	async (reader) => {
		const args = [
			...(reader ? ["--reader"] : []),
			"--selector",
			"main",
			"--table-rows",
			"--min-request-interval-ms",
			"0",
			url,
		];
		expect(parseResearchArguments(args)).toMatchObject({ tableRows: true });
		enqueue();
		const extract = vi.spyOn(extraction, "extractDocument");
		const reports = [];
		for await (const report of researchBatch(args)) reports.push(report);
		consumedRequest();
		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatchObject({
			outcome: "extracted-unverified",
			partial: true,
			contentSuccess: null,
			metrics: { active: 0, closed: true },
			extraction: {
				format: "markdown",
				tableRows: true,
				content: `## Wanted\n\n${rows}`,
			},
		});
		expect(extract).toHaveBeenCalledWith(
			expect.any(DocumentTree),
			expect.objectContaining({
				format: "markdown",
				tableRows: true,
				maxBytes: 256_000,
				maxNodes: 50_000,
				maxDepth: 128,
			}),
		);
	},
);

it.each(
	[
		...[null, "true", "false", 0, 1, {}, []].map((tableRows) => ({
			tableRows,
		})),
		{ tableRows: true, format: "json" },
		{ tableRows: true, format: "html" },
		{ tableRows: true, tableMetadata: true },
	].map((options) => ({ options })),
)("rejects live row options $options before transport", async ({ options }) => {
	await expect(
		researchNavigation(
			url,
			true,
			undefined,
			"main",
			false,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			options as ResearchExecutionOptions,
		),
	).rejects.toMatchObject({ code: "invalid-input" });
});

it("keeps live default Markdown and disabled rows unchanged", async () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	const contents = [];
	for (const tableRows of [undefined, false]) {
		enqueue();
		const report = await researchNavigation(
			url,
			true,
			undefined,
			"main",
			false,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			{ tableRows, minRequestIntervalMs: 0 },
		);
		consumedRequest();
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.extraction?.format).toBe("markdown");
		expect(report.extraction).not.toHaveProperty("tableRows");
		contents.push(report.extraction?.content);
	}
	expect(contents[0]).toBe(contents[1]);
	expect(contents[0]).not.toContain("- Row 1");
});

it.each(
	(["default", "long-v1"] as const).flatMap((profile) =>
		(["selector", "section"] as const).map((method) => ({ profile, method })),
	),
)(
	"replays $profile $method rows with intact receipts and caps",
	async ({ profile, method }) => {
		const input = await fixture(source, profile);
		const released = observeOwnership();
		const extract = vi.spyOn(extraction, "extractDocument");
		const selection =
			method === "selector"
				? { selector: "main", tableRows: true }
				: { section: "#wanted", tableRows: true };
		const result = markdown(input, selection);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: {
				method: method === "selector" ? "css-selector" : "heading-section",
				matches: 1,
			},
			extraction: {
				format: "markdown",
				tableRows: true,
				content: `## Wanted\n\n${rows}`,
			},
		});
		expect(result.report.selection).not.toHaveProperty(method);
		expect(result.jsonl).not.toContain("Outside");
		expect(extract).toHaveBeenCalledWith(
			expect.any(DocumentTree),
			expect.objectContaining({
				format: "markdown",
				tableRows: true,
				maxBytes: 256_000,
				maxNodes: 50_000,
				maxDepth: 128,
			}),
		);
		expect(replay.researchJsonReplayLimits).toEqual({
			maxSelectorCodeUnits: 4096,
			maxExtractionBytes: 256_000,
			maxOutputBytes: 327_680,
			maxNodes: 50_000,
			maxDepth: 128,
			timeoutMs: 20_000,
		});
		expect(researchRunLimits.extractionBytes).toBe(256_000);
		released();
	},
);

it.each([
	"<caption>Caption</caption><tr><td>Value</td></tr>",
	"<tr><td><pre>if ready:\n    run()</pre></td></tr>",
	"<tr><td><ul><li>Item</li></ul></td></tr>",
])("keeps complex replay tables on exact fallback: %s", async (contents) => {
	const input = await fixture(
		`<main><h2 id="wanted">Wanted</h2><table>${contents}</table></main>`,
	);
	const original = markdown(input, { selector: "main" });
	const result = markdown(input, { selector: "main", tableRows: true });
	expect(result.report.extraction?.tableRows).toBe(true);
	expect(result.report.extraction?.content).toBe(
		original.report.extraction?.content,
	);
	expect(result.report.extraction?.content).not.toContain("- Row 1");
});

it.each(["default", "long-v1"] as const)(
	"keeps %s replay JSON default and disabled Markdown rows unchanged",
	async (profile) => {
		const input = await fixture(source, profile);
		const original = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			{ selector: "main" },
		);
		const disabled = replay.extractResearchReplayJson(
			input.raw,
			input.trusted,
			{ selector: "main", tableRows: false },
		);
		expectTypeOf(original).toEqualTypeOf<replay.ResearchJsonReplayExtraction>();
		for (const result of [original, disabled]) {
			expect(result.report.extraction?.format).toBe("json");
			expect(typeof result.report.extraction?.content).toBe("object");
			expect(result.report.extraction).not.toHaveProperty("tableRows");
		}
		const normalize = (result: replay.ResearchJsonReplayExtraction) =>
			JSON.stringify(result.report, (key, value) =>
				["document", "scope", "ref"].includes(key) &&
				typeof value === "string" &&
				/^e\d+$/.test(value)
					? "<reference>"
					: value,
			);
		expect(normalize(disabled)).toBe(normalize(original));
		const ordinary = markdown(input, { selector: "main" });
		const noRows = markdown(input, { selector: "main", tableRows: false });
		expect(noRows.report.extraction?.content).toBe(
			ordinary.report.extraction?.content,
		);
		expect(noRows.report.extraction).not.toHaveProperty("tableRows");
	},
);

it("recovers bounded row Markdown without retrying or relabeling an output failure", async () => {
	const input = await fixture(recoverySource, "default", true);
	expect(() =>
		markdown(input, { section: "#wanted", tableRows: true }),
	).toThrow(expect.objectContaining({ code: "policy-denied" }));
	const released = observeOwnership(true);
	const result = markdown(input, { section: "#wanted", tableRows: true }, true);
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
		extraction: {
			format: "markdown",
			tableRows: true,
			content: `## Wanted\n\n${rows}`,
		},
		recovery: {
			kind: "captured-output-limit-section",
			originalOutcome: "failure",
			originalContentSuccess: false,
			originalFailure: input.report.failure,
			originalRequestRetried: false,
		},
	});
	expect(result.jsonl).not.toContain("Background content");
	expect(result.jsonl).not.toContain("Outside");
	released();
});

it.each([false, true])(
	"enforces row output caps and releases owned data (recovery=%s)",
	async (recovery) => {
		const input = await fixture(
			recovery
				? recoverySource
				: `<main><h2 id="large">Large</h2><table><tr><td>${"x".repeat(256_000)}</td></tr></table></main>`,
			"default",
			recovery,
		);
		const released = observeOwnership(recovery);
		expect(() =>
			markdown(input, { section: "#large", tableRows: true }, recovery),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		released();
	},
);

it.each(["receipt", "body-bytes", "body-sha256", "profile"] as const)(
	"rejects wrong %s admission for row replay before loading",
	async (pin) => {
		const input = await fixture();
		const invalid = structuredClone(input.trusted);
		if (pin === "receipt") invalid.expectedReceiptSha256 = "0".repeat(64);
		else if (pin === "body-bytes") invalid.expectedBody.bytes++;
		else if (pin === "body-sha256")
			invalid.expectedBody.sha256 = "0".repeat(64);
		else invalid.expectedProfile = "long-v1";
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() =>
			markdown(
				{ ...input, trusted: invalid },
				{ selector: "main", tableRows: true },
			),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(load).not.toHaveBeenCalled();
	},
);

it.each(
	[
		...[null, "true", "false", 0, 1, {}, []].map((tableRows) => ({
			section: "#wanted",
			tableRows,
		})),
		{ section: "#wanted", tableRows: true, unknown: true },
		{ section: "#wanted", tableRows: true, [Symbol("private")]: true },
		{ selector: "main", section: "#wanted", tableRows: true },
		{ links: "next", tableRows: true },
		{ links: "next", tableRows: false },
		{ headings: true, tableRows: true },
		{ section: "#wanted", tableRows: true, tableMetadata: true },
		Object.assign(Object.create({ inherited: true }), {
			section: "#wanted",
			tableRows: true,
		}),
	].map((selection) => ({ selection })),
)(
	"rejects unsafe row selection $selection before admission",
	({ selection }) => {
		const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
		const recover = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		const load = vi.spyOn(loader, "loadResearchDocument");
		for (const execute of sectionExecutors) {
			expect(() =>
				execute(
					new Uint8Array(),
					trusted,
					selection as replay.ResearchOutputLimitSectionSelection,
					undefined,
					"markdown",
				),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
		expect(admit).not.toHaveBeenCalled();
		expect(recover).not.toHaveBeenCalled();
		expect(load).not.toHaveBeenCalled();
	},
);

it.each(["getter", "proxy", "revoked-proxy"] as const)(
	"never invokes a row selection %s before rejection",
	(kind) => {
		const trap = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE_TRAP");
		});
		let selection: unknown = { section: "#wanted", tableRows: true };
		if (kind === "getter")
			Object.defineProperty(selection, "tableRows", { get: trap });
		else if (kind === "proxy")
			selection = new Proxy(selection as object, {
				get: trap,
				getPrototypeOf: trap,
				ownKeys: trap,
				getOwnPropertyDescriptor: trap,
			});
		else {
			const revoked = Proxy.revocable(selection as object, {});
			revoked.revoke();
			selection = revoked.proxy;
		}
		const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
		const recover = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		for (const execute of sectionExecutors) {
			expect(() =>
				execute(
					new Uint8Array(),
					trusted,
					selection as replay.ResearchOutputLimitSectionSelection,
					undefined,
					"markdown",
				),
			).toThrow(
				expect.objectContaining({
					code: "invalid-input",
					message: "Invalid research replay selection",
				}),
			);
		}
		expect(trap).not.toHaveBeenCalled();
		expect(admit).not.toHaveBeenCalled();
		expect(recover).not.toHaveBeenCalled();
	},
);

it.each([undefined, "json", "html", null] as const)(
	"rejects non-Markdown row format %s before admission",
	(format) => {
		const admit = vi.spyOn(admission, "validateResearchReplayAdmission");
		const recover = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		for (const execute of sectionExecutors) {
			expect(() =>
				execute(
					new Uint8Array(),
					trusted,
					{ section: "#wanted", tableRows: true },
					undefined,
					format as replay.ResearchReplayFormat,
				),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
		expect(admit).not.toHaveBeenCalled();
		expect(recover).not.toHaveBeenCalled();
	},
);

it("accepts own row selection data on a null prototype", async () => {
	const input = await fixture();
	const selection = Object.assign(Object.create(null), {
		section: "#wanted",
		tableRows: true,
	});
	expect(markdown(input, selection).report.extraction?.content).toBe(
		`## Wanted\n\n${rows}`,
	);
});
