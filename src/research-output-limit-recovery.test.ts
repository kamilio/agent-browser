import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import * as replay from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as loader from "./research-loader.js";

const encoder = new TextEncoder();
const url = "https://recovery.fixture.invalid/article";
const oversized = `<h1 id="large">Large</h1><p>${"Background content. ".repeat(16_000)}</p>`;
const section =
	'<h2 id="wanted">Wanted</h2><p>Bounded section evidence.</p><table id="data"><tr><td>42</td></tr></table>';
const source = `${oversized}${section}<h2 id="next">Next</h2><p>Outside selected section.</p>`;

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
			throw new Error("Recovery must not fetch");
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

async function fixture(html = source): Promise<Fixture> {
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
	const close = vi.spyOn(DocumentTree.prototype, "close");
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
		{ minRequestIntervalMs: 0 },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
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
		navigation: { kind: "document", url },
		metrics: { active: 0, closed: true },
	});
	expect(report.failure?.resourceLimit?.observed).toBeGreaterThan(256_000);
	expect(close).toHaveBeenCalled();
	for (const tree of close.mock.contexts) {
		if (!(tree instanceof DocumentTree))
			throw new Error("Expected owned document");
		expect(tree.mutationMetrics().closed).toBe(true);
	}
	expect(body).toEqual(encoder.encode(html));
	const serialized = admission.serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	vi.clearAllMocks();
	return {
		report,
		raw,
		body,
		trusted: {
			expectedProfile: "default",
			expectedReceiptSha256: hash(raw),
			expectedBody: { bytes: body.byteLength, sha256: hash(body) },
		},
	};
}

function revised(input: Fixture, path: string, value: unknown): Fixture {
	const report = structuredClone(input.report);
	const keys = path.split(".");
	const last = keys.pop();
	if (!last) throw new Error("Expected mutation path");
	let parent = report as unknown as Record<string, unknown>;
	for (const key of keys) parent = parent[key] as Record<string, unknown>;
	if (value === undefined) delete parent[last];
	else parent[last] = value;
	const raw = encoder.encode(`${JSON.stringify(report)}\n`);
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function recover(
	input: Fixture,
	selection: unknown = { section: "#wanted" },
	signal?: AbortSignal,
) {
	return replay.recoverResearchOutputLimitSection(
		input.raw,
		input.trusted,
		selection as replay.ResearchOutputLimitSectionSelection,
		signal,
	);
}

function rejects(action: () => unknown, code: ErrorCode = "invalid-input") {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ code });
}

function observeOwnership() {
	const validate = admission.validateResearchOutputLimitSectionAdmission;
	const bodies: Uint8Array[] = [];
	vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	).mockImplementation((...args) => {
		const result = validate(...args);
		bodies.push(result.body);
		return result;
	});
	const close = vi.mocked(DocumentTree.prototype.close);
	return () => {
		expect(bodies).toHaveLength(1);
		expect(bodies[0].byteLength).toBeGreaterThan(0);
		expect(bodies[0].every((value) => value === 0)).toBe(true);
		expect(close).toHaveBeenCalledOnce();
		const tree = close.mock.contexts[0];
		if (!(tree instanceof DocumentTree))
			throw new Error("Expected owned document");
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(loader.researchReaderInfo(tree)).toBeUndefined();
	};
}

it("retains a real typed output failure and keeps ordinary replay closed", async () => {
	const input = await fixture();
	expect(
		admission.validateResearchReplayAdmission(input.raw, input.trusted),
	).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
	});
	rejects(
		() =>
			replay.extractResearchReplayJson(input.raw, input.trusted, {
				section: "#wanted",
			}),
		"policy-denied",
	);
});

it("explicitly recovers one bounded heading section without retrying or changing identities", async () => {
	const input = await fixture();
	const original = structuredClone(input);
	const released = observeOwnership();
	const result = recover(input, { section: "#wanted", tableMetadata: true });
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		partial: true,
		contentSuccess: null,
		networkRequests: 0,
		source: {
			receiptSha256: hash(input.raw),
			body: input.trusted.expectedBody,
		},
		selection: { method: "heading-section", matches: 1 },
		recovery: {
			kind: "captured-output-limit-section",
			originalOutcome: "failure",
			originalContentSuccess: false,
			originalFailure: input.report.failure,
			originalRequestRetried: false,
		},
	});
	expect(result.jsonl).toContain("Bounded section evidence.");
	expect(result.jsonl).toContain("native-table-source-v1");
	expect(result.jsonl).not.toContain("Background content.");
	expect(result.jsonl).not.toContain("Outside selected section.");
	expect(JSON.parse(result.jsonl)).toEqual(result.report);
	expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
	expect(result.outputBytes).toBeLessThanOrEqual(
		replay.researchJsonReplayLimits.maxOutputBytes,
	);
	expect(input).toEqual(original);
	released();
});

it("separately admits failure capture without manufacturing successful metadata", async () => {
	const input = await fixture();
	const result = admission.validateResearchOutputLimitSectionAdmission(
		input.raw,
		input.trusted,
	);
	try {
		expect(result.originalMetadata).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: input.report.failure,
		});
		expect(result.originalFieldPresence["bodyCapture.data"]).toBe(true);
		expect(result.receiptSha256).toBe(hash(input.raw));
		expect(result.bodyIdentity).toEqual(input.trusted.expectedBody);
		expect(result.body).toEqual(input.body);
		expect(Object.isFrozen(result.recovery.originalFailure)).toBe(true);
	} finally {
		result.body.fill(0);
	}
});

it.each([
	["bodyCapture", undefined],
	["bodyCapture.data", undefined],
	["bodyCapture.data", ""],
	["bodyCapture.sha256", "0".repeat(64)],
	["primaryResponse.bodySha256", "0".repeat(64)],
	["primaryResponse.decodedBytes", 1],
	["outcome", "extracted-unverified"],
	["contentSuccess", null],
	["failure.resourceLimit", undefined],
	["failure", undefined],
	["failure.resourceLimit.kind", "reader.tokens"],
	["failure.resourceLimit.kind", "document.nodes"],
	["failure.resourceLimit.kind", "network.response-decoded"],
	["failure.stage", "loader"],
	["failure.category", "aborted"],
	["failure.category", "timeout"],
	["failure.resourceLimit.unit", "code-units"],
	["failure.resourceLimit.limit", 0],
	["failure.resourceLimit.limit", 0.5],
	["failure.resourceLimit.limit", Number.MAX_SAFE_INTEGER + 1],
	["failure.resourceLimit.observed", 256_000],
	["failure.resourceLimit.observed", Number.MAX_SAFE_INTEGER + 1],
	["failure.networkPolicy", {}],
	["primaryResponse.status", 403],
	["classification.barrier", "challenge"],
	["classification.diagnostic", {}],
	["classification.diagnostic", undefined],
	["classification.barrier", undefined],
	["classification.classifier", undefined],
	["partial", undefined],
	["rateLimit", null],
	["outputLimit", null],
	["profile", "native"],
	["reader", undefined],
	["reader.scripting", true],
	["reader.styling", true],
	["reader.scripting", undefined],
	["reader.profile", "native"],
	["primaryResponse.headers.content-type", ["text/plain"]],
	["primaryResponse.headers.content-type", undefined],
	["primaryResponse.headers.content-type", ["text/html", "text/plain"]],
	["primaryResponse.headers.content-type", ["text/html;\nunsafe"]],
	["metrics.active", 1],
	["metrics.closed", false],
	["metrics", undefined],
	["navigation", undefined],
	["navigation.documentRef", null],
	["navigation.kind", "same-document"],
	["navigation.url", `${url}/other`],
	["navigation.response.status", 429],
	["navigation.response", undefined],
	["navigation.scripts", {}],
	["admission", {}],
] as const)("rejects pinned evidence with %s = %j", async (path, value) => {
	const input = revised(await fixture(), path, value);
	const load = vi.spyOn(loader, "loadResearchDocument");
	rejects(() => recover(input));
	expect(load).not.toHaveBeenCalled();
});

it.each(["receipt", "body", "size", "missing body"])(
	"requires an independent %s pin",
	async (kind) => {
		const input = await fixture();
		input.trusted = {
			...input.trusted,
			...(kind === "receipt" ? { expectedReceiptSha256: "0".repeat(64) } : {}),
			...(kind === "body"
				? {
						expectedBody: {
							bytes: input.body.byteLength,
							sha256: "0".repeat(64),
						},
					}
				: {}),
			...(kind === "size"
				? {
						expectedBody: {
							bytes: input.body.byteLength - 1,
							sha256: hash(input.body),
						},
					}
				: {}),
		};
		if (kind === "missing body")
			input.trusted = {
				expectedProfile: "default",
				expectedReceiptSha256: hash(input.raw),
			};
		rejects(() => recover(input));
	},
);

it("rejects long-profile recovery before decoding", async () => {
	const input = await fixture();
	input.trusted = { ...input.trusted, expectedProfile: "long-v1" };
	rejects(() => recover(input), "unsupported");
});

it.each([
	{ selector: "body" },
	{ links: "article" },
	{ section: "#wanted", selector: "body" },
	{ section: "#wanted", extra: true },
	{ section: "" },
	{ section: " #wanted" },
	{ section: "#wanted", tableMetadata: "yes" },
	{ section: "[" },
	{ section: "x".repeat(4_097) },
])("rejects selector misuse %j", async (selection) => {
	const input = await fixture();
	rejects(() => recover(input, selection));
});

it.each([
	["body", "unsupported"],
	["#data", "unsupported"],
	["h2", "invalid-input"],
	["#absent", "not-found"],
	["#large", "resource-limit"],
] as const)(
	"rejects section %s without full-body fallback",
	async (target, code) => {
		const input = await fixture();
		const released = observeOwnership();
		rejects(() => recover(input, { section: target }), code);
		released();
	},
);

it("rechecks the actual selected section for challenges", async () => {
	const input = await fixture(
		`<title>Just a moment...</title>${oversized}<h2 id="wanted">Verify you are human</h2><p>Checking your browser. Complete the CAPTCHA.</p>`,
	);
	const released = observeOwnership();
	const result = recover(input);
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		classification: { barrier: "challenge" },
	});
	expect(result.report.recovery.originalOutcome).toBe("failure");
	released();
});

it("rechecks the decoded document despite null receipt diagnostics", async () => {
	const original = await fixture();
	const body = encoder.encode(
		`<title>Just a moment...</title><p>Verify you are human. Checking your browser. Complete the CAPTCHA.</p>${source}`,
	);
	const capture = captureResearchBody(body);
	let input = revised(original, "bodyCapture", capture);
	input = revised(input, "primaryResponse.bodySha256", capture.sha256);
	input = revised(input, "primaryResponse.decodedBytes", body.byteLength);
	input = revised(input, "navigation.response.bytes", body.byteLength);
	input.trusted = {
		...input.trusted,
		expectedBody: { bytes: body.byteLength, sha256: capture.sha256 },
	};
	const released = observeOwnership();
	const result = recover(input);
	expect(result.report).toMatchObject({
		outcome: "semantic-barrier",
		contentSuccess: false,
		classification: { barrier: "challenge" },
	});
	expect(result.report.extraction).toBeUndefined();
	expect(result.report.recovery.originalFailure).toEqual(
		original.report.failure,
	);
	released();
});

it("closes an initialized document even when loading fails before return", async () => {
	const input = await fixture();
	const load = loader.loadResearchDocument;
	const released = observeOwnership();
	vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce((...args) => {
		load(...args);
		throw new AgentBrowserError("resource-limit", "Synthetic loader failure");
	});
	rejects(() => recover(input), "resource-limit");
	released();
});

it("rejects pre-cancellation without admitting or loading", async () => {
	const input = await fixture();
	const controller = new AbortController();
	controller.abort();
	const validate = vi.spyOn(
		admission,
		"validateResearchOutputLimitSectionAdmission",
	);
	rejects(() => recover(input, undefined, controller.signal), "aborted");
	expect(validate).not.toHaveBeenCalled();
});

it.each(["aborted", "timeout"] as const)(
	"checks %s after loading and closes owners",
	async (code) => {
		const input = await fixture();
		const controller = new AbortController();
		let now = 1000;
		vi.spyOn(performance, "now").mockImplementation(() => now);
		const load = loader.loadResearchDocument;
		const released = observeOwnership();
		vi.spyOn(loader, "loadResearchDocument").mockImplementationOnce(
			(...args) => {
				const tree = load(...args);
				if (code === "aborted") controller.abort();
				else now += replay.researchJsonReplayLimits.timeoutMs;
				return tree;
			},
		);
		rejects(() => recover(input, undefined, controller.signal), code);
		released();
	},
);
