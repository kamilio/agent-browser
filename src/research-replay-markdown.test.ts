import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { ExtractedNode } from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";
import * as loader from "./research-loader.js";

const encoder = new TextEncoder();
const url = "https://markdown-replay.fixture.invalid/article";
const privateMarker = "SYNTHETIC_MARKDOWN_PRIVATE";
const profiles = ["default", "long-v1"] as const;
const modes = ["replay", "recovery"] as const;
type Mode = (typeof modes)[number];
const boundedSource =
	'<h1>Owned</h1><main><h2 id="wanted">Wanted</h2><p>Bounded evidence.</p></main><h2>Outside boundary</h2><p>Outside suffix.</p>';
const recoverySource = `<h1 id="large">Large</h1><p>${"Background content. ".repeat(16_000)}</p>${boundedSource}`;

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
			throw new Error("Markdown replay must not fetch");
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
	source = boundedSource,
	profile: ResearchDocumentProfileId = "default",
	options: { recovery?: boolean; reader?: boolean; contentType?: string } = {},
): Promise<Fixture> {
	const body = encoder.encode(source);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status: 200,
		headers: {
			"content-type": [options.contentType ?? "text/html; charset=utf-8"],
		},
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	});
	const report = await researchNavigation(
		url,
		options.reader ?? true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		!options.recovery && options.contentType === undefined,
		undefined,
		profile,
		{ minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(body).toEqual(encoder.encode(source));
	if (options.recovery) {
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
	vi.clearAllMocks();
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

function markdown(
	input: Fixture,
	selection: replay.ResearchJsonReplaySelection = { section: "#wanted" },
	mode: Mode = "replay",
) {
	const rawHash = hash(input.raw);
	const bodyHash = hash(input.body);
	const reportHash = hash(encoder.encode(JSON.stringify(input.report)));
	const trusted = structuredClone(input.trusted);
	try {
		const result =
			mode === "recovery"
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
		expect(result).not.toBeInstanceOf(Promise);
		expect(result.jsonl.endsWith("\n")).toBe(true);
		expect(result.jsonl.split("\n")).toHaveLength(2);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		expect(result.outputBytes).toBeLessThanOrEqual(327_680);
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
		for (const key of ["bodyCapture", "rawReceipt", "originalMetadata"])
			expect(result.jsonl).not.toContain(`"${key}"`);
		expect(result.report.selection).not.toHaveProperty("selector");
		expect(result.report.selection).not.toHaveProperty("section");
		return result;
	} finally {
		expect(hash(input.raw)).toBe(rawHash);
		expect(hash(input.body)).toBe(bodyHash);
		expect(hash(encoder.encode(JSON.stringify(input.report)))).toBe(reportHash);
		expect(input.trusted).toEqual(trusted);
	}
}

function observeOwnership(mode: Mode = "replay") {
	const bodies: Uint8Array[] = [];
	if (mode === "recovery") {
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
	return (closed = true) => {
		expect(bodies).toHaveLength(1);
		expect(bodies[0].byteLength).toBeGreaterThan(0);
		expect(bodies[0].every((value) => value === 0)).toBe(true);
		if (!closed) {
			expect(close).not.toHaveBeenCalled();
			return;
		}
		expect(close).toHaveBeenCalledOnce();
		const tree = close.mock.contexts[0];
		if (!(tree instanceof DocumentTree)) throw new Error("Expected owned tree");
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(loader.researchReaderInfo(tree)).toBeUndefined();
	};
}

it.each(profiles)(
	"renders escaped %s Markdown, code and native tables without executing controls",
	async (profile) => {
		const input = await fixture(
			`<h1>Owned</h1><aside>${privateMarker}</aside><main><h2>1. [Injected](javascript:bad) &lt;script&gt;</h2><p>Café 😀 <code>a\`b</code></p><pre><code>const value = \`one\`;\n\`\`\`\n  indented\n</code></pre><table><tr><th>Header</th></tr><tr><td>42 | [cell]</td></tr></table><script>fetch('/${privateMarker}')</script><form action="/${privateMarker}"><input value="${privateMarker}"><textarea>${privateMarker}</textarea></form><img src="/${privateMarker}" alt="A [diagram]"></main>`,
			profile,
		);
		const released = observeOwnership();
		const extract = vi.spyOn(extraction, "extractDocument");
		const result = markdown(input, { selector: "main" });
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "css-selector", matches: 1 },
			extraction: { format: "markdown", url, partial: true },
			reader: { scripting: false, styling: false, partial: true },
		});
		const content = result.report.extraction?.content;
		for (const text of [
			"## 1\\. \\[Injected\\]\\(javascript:bad\\) &lt;script&gt;",
			"Café 😀",
			"`` a`b ``",
			"````\nconst value = `one`;\n```\n  indented\n````",
			"**Native table begin (selected structure only; associations unspecified)**",
			"**Native cell begin (selected structure only)**",
			"42 \\| \\[cell\\]",
			"**Native table end**",
			"A \\[diagram\\]",
		])
			expect(content).toContain(text);
		expect(content).not.toContain("![");
		expect(result.jsonl).not.toContain(privateMarker);
		expect(extract).toHaveBeenCalledWith(
			expect.any(DocumentTree),
			expect.objectContaining({
				format: "markdown",
				maxBytes: 256_000,
				maxNodes: 50_000,
				maxDepth: 128,
			}),
		);
		released();
	},
);

it.each(profiles)(
	"scopes a unique %s Markdown heading section",
	async (profile) => {
		const input = await fixture(undefined, profile);
		const released = observeOwnership();
		const result = markdown(input);
		expect(result.report.selection).toEqual({
			method: "heading-section",
			matches: 1,
		});
		expect(result.report.extraction).toMatchObject({
			format: "markdown",
			content: "## Wanted\n\nBounded evidence\\.\n",
			sectionSelection: { method: "heading-section", level: 2 },
		});
		expect(result.jsonl).not.toContain("Outside");
		released();
	},
);

it("preserves default JSON types and explicit JSON content without format guessing", async () => {
	const input = await fixture();
	const selection = { selector: "main" };
	const implicit = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		selection,
		undefined,
	);
	const explicit = replay.extractResearchReplayJson(
		input.raw,
		input.trusted,
		selection,
		undefined,
		"json",
	);
	expectTypeOf(implicit).toEqualTypeOf<replay.ResearchJsonReplayExtraction>();
	expectTypeOf(implicit.report.extraction?.content).toEqualTypeOf<
		ExtractedNode | undefined
	>();
	const stableReport = (result: replay.ResearchJsonReplayExtraction) =>
		JSON.stringify(result.report, (key, value) =>
			["document", "scope", "ref"].includes(key) &&
			typeof value === "string" &&
			/^e\d+$/.test(value)
				? "<reference>"
				: value,
		);
	expect(stableReport(explicit)).toBe(stableReport(implicit));
	expect(explicit.report.extraction?.document).not.toBe(
		implicit.report.extraction?.document,
	);
	for (const result of [implicit, explicit]) {
		expect(result.outputBytes).toBe(Buffer.byteLength(result.jsonl));
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
	}
	expect(implicit.report.extraction?.format).toBe("json");
	expect(typeof implicit.report.extraction?.content).toBe("object");
});

it.each([
	{ selection: { selector: ".missing" }, code: "not-found" },
	{ selection: { selector: "h2" }, code: "invalid-input" },
	{ selection: { section: ".missing" }, code: "not-found" },
	{ selection: { section: "h2" }, code: "invalid-input" },
	{ selection: { section: "main" }, code: "unsupported" },
] as const)(
	"rejects Markdown selection $selection without fallback",
	async ({ selection, code }) => {
		const input = await fixture();
		const released = observeOwnership();
		expect(() => markdown(input, selection)).toThrow(
			expect.objectContaining({ code }),
		);
		released();
	},
);

it.each(modes)(
	"rejects unsupported %s formats and Markdown options before admission",
	async (mode) => {
		const input = await fixture();
		const validate = vi.spyOn(admission, "validateResearchReplayAdmission");
		const validateRecovery = vi.spyOn(
			admission,
			"validateResearchOutputLimitSectionAdmission",
		);
		const load = vi.spyOn(loader, "loadResearchDocument");
		for (const selection of [
			{ links: "article" },
			{ section: "#wanted", tableMetadata: true },
		])
			expect(() => markdown(input, selection, mode)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		for (const format of ["text", "Markdown", "", null, {}]) {
			expect(() =>
				mode === "replay"
					? replay.extractResearchReplayJson(
							input.raw,
							input.trusted,
							{ section: "#wanted" },
							undefined,
							format as "markdown",
						)
					: replay.recoverResearchOutputLimitSection(
							input.raw,
							input.trusted,
							{ section: "#wanted" },
							undefined,
							format as "markdown",
						),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
		expect(validate).not.toHaveBeenCalled();
		expect(validateRecovery).not.toHaveBeenCalled();
		expect(load).not.toHaveBeenCalled();
	},
);

it.each(["text/plain", "text/markdown"])(
	"does not expand replay MIME admission to %s",
	async (contentType) => {
		const input = await fixture("# Literal source", "default", { contentType });
		const released = observeOwnership();
		expect(() => markdown(input, { selector: "body" })).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		released(false);
	},
);

it.each(["receipt", "body-hash", "body-size", "capture"] as const)(
	"rejects corrupt Markdown %s evidence before loading",
	async (kind) => {
		let input = await fixture();
		if (kind === "capture") {
			input = revised(input, (report) => {
				if (!report.bodyCapture) throw new Error("Expected capture");
				report.bodyCapture.data = Buffer.from(input.body)
					.fill(120)
					.toString("base64");
			});
		} else if (kind === "receipt")
			input.trusted = {
				...input.trusted,
				expectedReceiptSha256: "0".repeat(64),
			};
		else
			input.trusted = {
				...input.trusted,
				expectedBody: {
					bytes: input.body.byteLength + (kind === "body-size" ? 1 : 0),
					sha256: kind === "body-hash" ? "0".repeat(64) : hash(input.body),
				},
			};
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() => markdown(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(load).not.toHaveBeenCalled();
	},
);

it.each(profiles)(
	"keeps the %s captured source byte ceiling",
	async (profile) => {
		const original = await fixture(undefined, profile);
		const limit = profile === "long-v1" ? 4_000_000 : 2_000_000;
		const body = encoder.encode(`<!--${"x".repeat(limit - 6)}-->`);
		expect(body.byteLength).toBe(limit + 1);
		const digest = hash(body);
		const input = revised(original, (report) => {
			if (!report.primaryResponse || !report.navigation?.response)
				throw new Error("Expected document response");
			report.bodyCapture = {
				encoding: "base64",
				decodedBytes: body.byteLength,
				sha256: digest,
				data: Buffer.from(body).toString("base64"),
			};
			report.primaryResponse.bodySha256 = digest;
			report.primaryResponse.decodedBytes = body.byteLength;
			report.navigation.response.bytes = body.byteLength;
		});
		input.trusted = {
			...input.trusted,
			expectedBody: { bytes: body.byteLength, sha256: digest },
		};
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() => markdown(input)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(load).not.toHaveBeenCalled();
	},
);

it("enforces the Markdown UTF-8 extraction byte ceiling and releases owners", async () => {
	const text = "界".repeat(90_000);
	expect(text.length).toBeLessThan(256_000);
	expect(encoder.encode(text).byteLength).toBeGreaterThan(256_000);
	const input = await fixture(`<h1>Owned</h1><main>${text}</main>`);
	const released = observeOwnership();
	expect(() => markdown(input, { selector: "main" })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	released();
});

it("independently enforces the final Markdown JSONL envelope ceiling", async () => {
	const input = await fixture();
	const released = observeOwnership();
	const extract = extraction.extractDocument;
	vi.spyOn(extraction, "extractDocument").mockImplementationOnce((...args) => {
		const result = extract(...args);
		if (result.format !== "markdown") throw new Error("Expected Markdown");
		return { ...result, content: "界".repeat(110_000) };
	});
	expect(() => markdown(input)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	released();
});

it("checks whole-document hidden challenges before resolving a missing Markdown target", async () => {
	const input = await fixture(
		"<title>Just a moment...</title><h1>Owned</h1><aside hidden>Checking your browser</aside><main>Selected</main>",
		"default",
		{ reader: false },
	);
	const released = observeOwnership();
	const extract = vi.spyOn(extraction, "extractDocument");
	const result = markdown(input, { selector: ".missing" });
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		selection: { matches: null },
		classification: { barrier: "challenge" },
	});
	expect(result.report.extraction).toBeUndefined();
	expect(extract).not.toHaveBeenCalled();
	released();
});

it("detects a selected Markdown challenge beyond the document diagnostic prefix", async () => {
	const input = await fixture(
		`<title>Just a moment...</title><h1>Owned</h1><aside>${"x".repeat(8192)}</aside><main><h2 id="wanted">Selected</h2><p>Checking your browser</p></main>`,
	);
	const released = observeOwnership();
	expect(markdown(input).report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		selection: { matches: 1 },
		classification: { barrier: "challenge" },
	});
	released();
});

it("recovers bounded Markdown without relabeling or retrying the original output failure", async () => {
	const input = await fixture(recoverySource, "default", { recovery: true });
	expect(() => markdown(input)).toThrow(
		expect.objectContaining({ code: "policy-denied" }),
	);
	const released = observeOwnership("recovery");
	const result = markdown(input, undefined, "recovery");
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
		extraction: {
			format: "markdown",
			content: "## Wanted\n\nBounded evidence\\.\n",
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
	expect(result.jsonl).not.toContain("Outside suffix");
	released();
});

it("retains default JSON recovery types", async () => {
	const input = await fixture(recoverySource, "default", { recovery: true });
	const result = replay.recoverResearchOutputLimitSection(
		input.raw,
		input.trusted,
		{ section: "#wanted" },
		undefined,
	);
	expectTypeOf(
		result,
	).toEqualTypeOf<replay.ResearchOutputLimitSectionExtraction>();
	expectTypeOf(result.report.extraction?.content).toEqualTypeOf<
		ExtractedNode | undefined
	>();
	expect(result.report.extraction?.format).toBe("json");
});

it.each(["failure-kind", "capture-hash", "challenge"] as const)(
	"keeps Markdown recovery admission closed for %s",
	async (kind) => {
		const original = await fixture(recoverySource, "default", {
			recovery: true,
		});
		const input = revised(original, (report) => {
			if (kind === "failure-kind") {
				if (!report.failure?.resourceLimit)
					throw new Error("Expected output failure");
				report.failure.resourceLimit = {
					...report.failure.resourceLimit,
					kind: "reader.tokens",
				};
			} else if (kind === "capture-hash") {
				if (!report.bodyCapture) throw new Error("Expected capture");
				report.bodyCapture.sha256 = "0".repeat(64);
			} else report.classification.barrier = "challenge";
		});
		const load = vi.spyOn(loader, "loadResearchDocument");
		expect(() => markdown(input, undefined, "recovery")).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(load).not.toHaveBeenCalled();
	},
);

it("rechecks recovery source challenges even when the receipt diagnostic is clear", async () => {
	const original = await fixture(recoverySource, "default", { recovery: true });
	const body = encoder.encode(
		`<title>Just a moment...</title><p>Checking your browser. Complete the CAPTCHA.</p>${recoverySource}`,
	);
	const capture = captureResearchBody(body);
	const input = revised(original, (report) => {
		if (!report.primaryResponse || !report.navigation?.response)
			throw new Error("Expected document response");
		report.bodyCapture = capture;
		report.primaryResponse.bodySha256 = capture.sha256;
		report.primaryResponse.decodedBytes = body.byteLength;
		report.navigation.response.bytes = body.byteLength;
	});
	input.trusted = {
		...input.trusted,
		expectedBody: { bytes: body.byteLength, sha256: capture.sha256 },
	};
	const released = observeOwnership("recovery");
	const result = markdown(input, undefined, "recovery");
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		classification: { barrier: "challenge" },
		recovery: { originalFailure: original.report.failure },
	});
	expect(result.report.extraction).toBeUndefined();
	released();
});

it("closes a Markdown recovery document when the selected section still exceeds output limits", async () => {
	const input = await fixture(recoverySource, "default", { recovery: true });
	const released = observeOwnership("recovery");
	expect(() => markdown(input, { section: "#large" }, "recovery")).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	released();
});
