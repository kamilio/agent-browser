import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import type { TrustedResearchReplayAdmission } from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import {
	type ResearchJsonReplaySelection,
	extractResearchReplayJson,
	extractResearchStrategyReplayJson,
} from "../scripts/research-json-replay.js";
import * as visibility from "../scripts/research-visibility.js";
import * as nativeLoader from "./document-loader.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as fallbackLoader from "./research-fallback-loader.js";
import * as readerLoader from "./research-loader.js";
import { researchReaderInfo } from "./research-reader-info.js";
import {
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";

const policy = "native-reader-fallback-v1";
const url = "https://strategy-replay.fixture.invalid/article";
const modes = ["native", "reader"] as const;
const encoder = new TextEncoder();
const content =
	'<main id="article"><h1 id="heading">Owned article</h1><p>Visible café evidence. This article describes a synthetic research fixture with enough useful text to select its main content.</p><p class="css-hidden">CSS_HIDDEN_SENTINEL</p><p hidden>HIDDEN_SENTINEL</p><p style="display:none">INLINE_SENTINEL</p><a href="/guide">Guide</a><table><tr><th>Name</th><th>Value</th></tr><tr><td>Owned</td><td>42</td></tr></table></main>';
const source = (mode: (typeof modes)[number]) =>
	`<!doctype html><html><head><meta charset="utf-8"><title>Owned article</title><style>.css-hidden{display:none}</style></head><body>${mode === "reader" ? "<frame>" : ""}${content}<script src="/never.js"></script><link rel="stylesheet" href="/never.css"><img src="/never.png"></body></html>`;

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: TrustedResearchReplayAdmission;
}

const receipts: Array<{ raw: Uint8Array; copy: Uint8Array }> = [];
const realVisibility = visibility.researchVisibilityEvidence;
const realFallback = fallbackLoader.loadNativeReaderFallbackDocument;
const realExtract = extraction.extractDocument;

beforeEach(() => {
	receipts.length = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.spyOn(admission, "validateResearchReplayAdmission");
	vi.spyOn(nativeLoader, "loadBrowserDocument");
	vi.spyOn(readerLoader, "loadResearchDocument");
	vi.spyOn(fallbackLoader, "loadNativeReaderFallbackDocument");
	vi.spyOn(visibility, "researchVisibilityEvidence");
	vi.spyOn(extraction, "extractDocument");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Strategy replay must not fetch");
		}),
	);
});

afterEach(async () => {
	try {
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
		for (const receipt of receipts) expect(receipt.raw).toEqual(receipt.copy);
		for (const result of vi.mocked(admission.validateResearchReplayAdmission)
			.mock.results) {
			if (result.type === "return" && result.value.kind === "validated-capture")
				expect(result.value.body.every((byte: number) => byte === 0)).toBe(
					true,
				);
		}
		for (const result of vi.mocked(readerLoader.loadResearchDocument).mock
			.results) {
			if (result.type !== "return") continue;
			expect(result.value.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(result.value)).toBeUndefined();
		}
		for (const result of vi.mocked(
			fallbackLoader.loadNativeReaderFallbackDocument,
		).mock.results) {
			if (result.type !== "return") continue;
			const tree = await result.value.catch(() => undefined);
			if (tree) expect(tree.mutationMetrics().closed).toBe(true);
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function pinned(report: ResearchNavigationReport, body: Uint8Array): Fixture {
	const serialized = admission.serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	receipts.push({ raw, copy: raw.slice() });
	return {
		report,
		raw,
		body,
		trusted: {
			expectedProfile: "default",
			expectedDocumentStrategy: policy,
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

async function fixture(
	mode: (typeof modes)[number] | "untagged" = "native",
	status = 200,
	html = source(mode === "reader" ? "reader" : "native"),
) {
	const body = encoder.encode(html);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		elapsedMs: 0,
		redirects: [],
	});
	const report = await researchNavigation(
		url,
		mode === "untagged",
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{
			...(mode === "untagged" ? {} : { documentStrategy: policy }),
			format: "json",
			minRequestIntervalMs: 0,
		},
	);
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(body).toEqual(encoder.encode(html));
	if (mode !== "untagged") expect(report.documentStrategy?.mode).toBe(mode);
	vi.clearAllMocks();
	return pinned(report, body);
}

function revised(
	input: Fixture,
	mutate: (report: ResearchNavigationReport) => void,
) {
	const report = structuredClone(input.report);
	mutate(report);
	return pinned(report, input.body);
}

function replacedBody(input: Fixture, html: string) {
	const report = structuredClone(input.report);
	const body = encoder.encode(html);
	if (!report.primaryResponse)
		throw new Error("Missing primary fixture response");
	report.bodyCapture = captureResearchBody(body);
	report.primaryResponse = {
		...report.primaryResponse,
		decodedBytes: body.byteLength,
		encodedBytes: body.byteLength,
		bodySha256: hash(body),
	};
	return pinned(report, body);
}

it.each(modes)(
	"replays the real %s mode with frozen capture provenance and no network",
	async (mode) => {
		const input = await fixture(mode);
		const result = await extractResearchStrategyReplayJson(
			input.raw,
			input.trusted,
			{ selector: "#article" },
		);
		expect(result.report.outcome).toBe("extracted-unverified");
		expect(result.report.networkRequests).toBe(0);
		expect(result.report.source.profile).toBe("default");
		expect(result.report.source.capturedOutcome).toBe(input.report.outcome);
		expect(result.report.source.documentStrategy).toEqual(
			input.report.documentStrategy,
		);
		expect(Object.isFrozen(result.report.source.documentStrategy)).toBe(true);
		expect(result.report.documentStrategy).toEqual(
			input.report.documentStrategy,
		);
		expect(Object.isFrozen(result.report.documentStrategy)).toBe(true);
		expect(result.report.reader?.profile).toBe(
			mode === "reader" ? "native-semantic-reader-v1" : undefined,
		);
		expect(result.jsonl).toContain("Visible café evidence");
		expect(result.jsonl).not.toContain("INLINE_SENTINEL");
		expect(result.jsonl.includes("CSS_HIDDEN_SENTINEL")).toBe(
			mode === "reader",
		);
		expect(result.outputBytes).toBe(Buffer.byteLength(result.jsonl));
		expect(JSON.parse(result.jsonl)).toEqual(
			JSON.parse(JSON.stringify(result.report)),
		);
		expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledOnce();
		expect(readerLoader.loadResearchDocument).toHaveBeenCalledTimes(
			mode === "reader" ? 2 : 0,
		);
		const [response, context] = vi.mocked(
			fallbackLoader.loadNativeReaderFallbackDocument,
		).mock.calls[0];
		expect(response.body).not.toBe(input.body);
		expect(response.body).not.toBe(input.raw);
		expect(response.body.every((byte) => byte === 0)).toBe(true);
		expect(input.body).toEqual(encoder.encode(source(mode)));
		expect(context.limits).toEqual({
			maxNodes: 50_000,
			maxDepth: 128,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1_024,
		});
		expect(Object.keys(context).sort()).toEqual(["limits", "signal", "tabId"]);
		for (const [readerResponse] of vi.mocked(readerLoader.loadResearchDocument)
			.mock.calls)
			expect(readerResponse.body).toBe(response.body);
	},
);

it.each(modes)(
	"keeps %s section and Markdown table options in the shared extractor",
	async (mode) => {
		const input = await fixture(mode);
		const result = await extractResearchStrategyReplayJson(
			input.raw,
			input.trusted,
			{ section: "#heading", tableRows: true, compactTables: true },
			undefined,
			"markdown",
		);
		expect(result.report.selection.method).toBe("heading-section");
		expect(result.report.extraction?.format).toBe("markdown");
		expect(result.report.extraction?.content).toContain(
			"Visible café evidence",
		);
		expect(result.report.extraction?.content).toContain("42");
	},
);

it.each(modes)("supports %s JSON table metadata", async (mode) => {
	const input = await fixture(mode);
	const result = await extractResearchStrategyReplayJson(
		input.raw,
		input.trusted,
		{ selector: "table", tableMetadata: true },
	);
	expect(result.report.extraction?.format).toBe("json");
	expect(result.jsonl).toContain("native-table-source-v1");
});

it.each(modes)(
	"supports %s content focus without rewriting captured intent",
	async (mode) => {
		const input = await fixture(mode);
		const result = await extractResearchStrategyReplayJson(
			input.raw,
			input.trusted,
			{ contentFocus: "main-content-v1" },
		);
		expect(result.report.selection.method).toBe("content-focus");
		expect(result.report.source.capturedOutcome).toBe("extracted-unverified");
		expect(result.jsonl).toContain("Visible café evidence");
		expect(input.report.selection).toBeUndefined();
	},
);

it.each(modes)("supports %s link discovery", async (mode) => {
	const input = await fixture(mode);
	const result = await extractResearchStrategyReplayJson(
		input.raw,
		input.trusted,
		{ links: "guide" },
	);
	expect(result.report.selection).toMatchObject({
		method: "link-url-search",
		matches: 1,
	});
	expect(result.report.links?.entries).toHaveLength(1);
	expect(result.report.outcome).toBe("extracted-unverified");
});

it.each(modes)(
	"refuses real %s strategy captures without explicit trust",
	async (mode) => {
		const input = await fixture(mode);
		const { expectedDocumentStrategy: _strategy, ...trusted } = input.trusted;
		await expect(
			extractResearchStrategyReplayJson(input.raw, trusted, {
				selector: "main",
			}),
		).rejects.toMatchObject({ code: "unsupported" });
		expect(() =>
			extractResearchReplayJson(input.raw, trusted, { selector: "main" }),
		).toThrowError(expect.objectContaining({ code: "unsupported" }));
		expect(
			fallbackLoader.loadNativeReaderFallbackDocument,
		).not.toHaveBeenCalled();
	},
);

it.each(modes)(
	"refuses synchronous %s strategy reinterpretation and erases admitted bytes",
	async (mode) => {
		const input = await fixture(mode);
		expect(() =>
			extractResearchReplayJson(input.raw, input.trusted, { selector: "main" }),
		).toThrowError(expect.objectContaining({ code: "unsupported" }));
		expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
		expect(
			fallbackLoader.loadNativeReaderFallbackDocument,
		).not.toHaveBeenCalled();
	},
);

it("preserves untagged synchronous output and denies async reinterpretation", async () => {
	const input = await fixture("untagged");
	const { expectedDocumentStrategy: _strategy, ...trusted } = input.trusted;
	const result = extractResearchReplayJson(input.raw, trusted, {
		selector: "main",
	});
	expect(result.report.outcome).toBe("extracted-unverified");
	expect(result.report).not.toHaveProperty("documentStrategy");
	expect(result.report.source).not.toHaveProperty("documentStrategy");
	expect(result.report.source).not.toHaveProperty("capturedOutcome");
	await expect(
		extractResearchStrategyReplayJson(input.raw, input.trusted, {
			selector: "main",
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	await expect(
		extractResearchStrategyReplayJson(input.raw, trusted, { selector: "main" }),
	).rejects.toMatchObject({ code: "invalid-input" });
});

it.each(modes)(
	"rejects a real mode mismatch against a captured %s strategy",
	async (mode) => {
		const input = replacedBody(
			await fixture(mode),
			source(mode === "native" ? "reader" : "native"),
		);
		await expect(
			extractResearchStrategyReplayJson(input.raw, input.trusted, {
				selector: "main",
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledOnce();
		expect(readerLoader.loadResearchDocument).toHaveBeenCalledTimes(
			mode === "native" ? 1 : 0,
		);
		expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
	},
);

it.each([false, true])(
	"rejects actual native failure mismatch with resource diagnostic=%s",
	async (diagnostic) => {
		const input = revised(await fixture("reader"), (report) => {
			report.documentStrategy = {
				policy,
				mode: "reader",
				nativeFailure: {
					category: "resource-limit",
					stage: "loader",
					...(diagnostic
						? {
								resourceLimit: resourceLimitDiagnostic(
									resourceLimitError(
										"document.nodes",
										50_000,
										50_001,
										"Synthetic receipt",
									),
								),
							}
						: {}),
				},
			};
		});
		await expect(
			extractResearchStrategyReplayJson(input.raw, input.trusted, {
				selector: "main",
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledOnce();
		expect(readerLoader.loadResearchDocument).toHaveBeenCalledOnce();
		expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
	},
);

it.each(["matching", "removed", "changed"] as const)(
	"deeply compares a real native resource diagnostic: %s",
	async (variant) => {
		const html = source("native").replace(
			"<body>",
			`<body><svg>${"<g>".repeat(127)}${"</g>".repeat(127)}</svg>`,
		);
		const captured = await fixture("reader", 200, html);
		expect(captured.report.documentStrategy?.nativeFailure).toMatchObject({
			category: "resource-limit",
			stage: "loader",
			resourceLimit: { kind: "document.depth" },
		});
		const input = revised(captured, (report) => {
			const failure = report.documentStrategy?.nativeFailure;
			if (!failure?.resourceLimit)
				throw new Error("Missing real native resource diagnostic");
			report.documentStrategy = {
				policy,
				mode: "reader",
				nativeFailure: {
					category: failure.category,
					stage: failure.stage,
					...(variant === "removed"
						? {}
						: {
								resourceLimit: {
									...failure.resourceLimit,
									observed:
										failure.resourceLimit.observed +
										Number(variant === "changed"),
								},
							}),
				},
			};
		});
		const result = extractResearchStrategyReplayJson(input.raw, input.trusted, {
			selector: "main",
		});
		if (variant === "matching") {
			expect((await result).report.documentStrategy).toEqual(
				captured.report.documentStrategy,
			);
		} else {
			await expect(result).rejects.toMatchObject({ code: "invalid-input" });
		}
		expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledOnce();
	},
);

it("rejects actual reader encoding that contradicts the captured encoding", async () => {
	const input = revised(await fixture("reader"), (report) => {
		if (!report.reader || !report.extraction?.reader)
			throw new Error("Missing fixture reader");
		report.reader = { ...report.reader, encoding: "windows-1252" };
		report.extraction = { ...report.extraction, reader: report.reader };
	});
	await expect(
		extractResearchStrategyReplayJson(input.raw, input.trusted, {
			selector: "main",
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(visibility.researchVisibilityEvidence).toHaveBeenCalledOnce();
});

it("rechecks hidden source barriers independently of the selected reader tree", async () => {
	const input = replacedBody(
		await fixture("reader"),
		source("reader")
			.replace(
				"<title>Owned article</title>",
				"<title>Just a moment...</title>",
			)
			.replace(
				"<p hidden>HIDDEN_SENTINEL</p>",
				"<p hidden>Checking your browser</p>",
			),
	);
	await expect(
		extractResearchStrategyReplayJson(input.raw, input.trusted, {
			selector: "main",
		}),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(readerLoader.loadResearchDocument).toHaveBeenCalledTimes(2);
	expect(visibility.researchVisibilityEvidence).toHaveBeenCalledOnce();
});

it("keeps real diagnostic initialization separate from the selected reader tree", async () => {
	const input = await fixture("reader");
	vi.mocked(visibility.researchVisibilityEvidence).mockImplementationOnce(
		(response, context, ...rest) => {
			expect(context.initializeDocument).toBeUndefined();
			return realVisibility(response, context, ...rest);
		},
	);
	const result = await extractResearchStrategyReplayJson(
		input.raw,
		input.trusted,
		{ selector: "main" },
	);
	expect(result.report.outcome).toBe("extracted-unverified");
	const selected = await vi.mocked(
		fallbackLoader.loadNativeReaderFallbackDocument,
	).mock.results[0].value;
	expect(vi.mocked(extraction.extractDocument).mock.calls.at(-1)?.[0]).toBe(
		selected,
	);
	expect(
		vi.mocked(readerLoader.loadResearchDocument).mock.results[1].value,
	).not.toBe(selected);
});

it.each(modes)(
	"preserves typed %s cancellation after loading and closes the owned tree",
	async (mode) => {
		const input = await fixture(mode);
		const controller = new AbortController();
		const failure = new AgentBrowserError("timeout", "Synthetic deadline");
		vi.mocked(
			fallbackLoader.loadNativeReaderFallbackDocument,
		).mockImplementationOnce(async (...args) => {
			const tree = await realFallback(...args);
			tree.onClose(() => {
				throw new Error("Secondary cancellation cleanup failure");
			});
			controller.abort(failure);
			return tree;
		});
		await expect(
			extractResearchStrategyReplayJson(
				input.raw,
				input.trusted,
				{ selector: "main" },
				controller.signal,
			),
		).rejects.toBe(failure);
		expect(visibility.researchVisibilityEvidence).not.toHaveBeenCalled();
	},
);

it("preserves a pre-aborted typed reason without admitting or loading", async () => {
	const input = await fixture();
	const controller = new AbortController();
	const failure = new AgentBrowserError("closed", "Synthetic output close");
	controller.abort(failure);
	await expect(
		extractResearchStrategyReplayJson(
			input.raw,
			input.trusted,
			{ selector: "main" },
			controller.signal,
		),
	).rejects.toBe(failure);
	expect(admission.validateResearchReplayAdmission).not.toHaveBeenCalled();
	expect(nativeLoader.loadBrowserDocument).not.toHaveBeenCalled();
});

it("closes both real trees when diagnostics throw and retains the primary error", async () => {
	const input = await fixture("reader");
	const failure = resourceLimitError(
		"reader.output",
		1,
		2,
		"Synthetic evidence failure",
	);
	vi.mocked(
		fallbackLoader.loadNativeReaderFallbackDocument,
	).mockImplementationOnce(async (...args) => {
		const tree = await realFallback(...args);
		tree.onClose(() => {
			throw new Error("Secondary cleanup failure");
		});
		return tree;
	});
	vi.mocked(visibility.researchVisibilityEvidence).mockImplementationOnce(
		(...args) => {
			realVisibility(...args);
			throw failure;
		},
	);
	await expect(
		extractResearchStrategyReplayJson(input.raw, input.trusted, {
			selector: "main",
		}),
	).rejects.toBe(failure);
	expect(readerLoader.loadResearchDocument).toHaveBeenCalledTimes(2);
});

it.each(modes)(
	"closes %s trees on extraction failure without retrying",
	async (mode) => {
		const input = await fixture(mode);
		const failure = new AgentBrowserError(
			"not-found",
			"Synthetic selection failure",
		);
		vi.mocked(extraction.extractDocument).mockImplementation(
			(tree, options) => {
				if (options?.contentFocus !== undefined) throw failure;
				return realExtract(tree, options);
			},
		);
		await expect(
			extractResearchStrategyReplayJson(input.raw, input.trusted, {
				contentFocus: "main-content-v1",
			}),
		).rejects.toBe(failure);
		expect(nativeLoader.loadBrowserDocument).toHaveBeenCalledOnce();
	},
);

it("permits a complete native 201 HTML capture", async () => {
	const input = await fixture("native", 201);
	const result = await extractResearchStrategyReplayJson(
		input.raw,
		input.trusted,
		{ selector: "main" },
	);
	expect(result.report.documentStrategy?.mode).toBe("native");
});

it.each([
	{ headings: true },
	{ lines: { start: 1, end: 2 } },
	{ find: "Owned" },
	{ jsonPointer: "/article" },
	{ selector: "main", recoverOutputLimit: true },
	{ selector: "main", recoverEmptyOutline: true },
	{ selector: "main", readerMimePolicy: "markdown-html-document-v1" },
	{ selector: "main", outputLimitPolicy: "text-prefix-v1" },
	{ selector: "main", sourceLinkLabelPolicy: "source-aria-label-v1" },
	{ selector: "main", sourceHeadingPolicy: "source-aria-heading-v1" },
])(
	"explicitly refuses unsupported strategy selection %j",
	async (selection) => {
		const input = await fixture();
		await expect(
			extractResearchStrategyReplayJson(
				input.raw,
				input.trusted,
				selection as ResearchJsonReplaySelection,
			),
		).rejects.toMatchObject({ code: "unsupported" });
		expect(admission.validateResearchReplayAdmission).not.toHaveBeenCalled();
		expect(nativeLoader.loadBrowserDocument).not.toHaveBeenCalled();
	},
);
