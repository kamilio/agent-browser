import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as admission from "../scripts/research-admission-evidence.js";
import {
	type TrustedResearchReplayAdmission,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	researchNavigation,
} from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import * as loader from "./research-loader.js";
import * as readerInfo from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const encoder = new TextEncoder();
const url = "https://raw-replay.fixture.invalid/document";
const policy = "separate-omitted-raw-v1";
const privateMarker = "SYNTHETIC_RAW_REPLAY_PRIVATE";
const script = `${privateMarker}${"x".repeat(2_100_001)}`;
const heading = '<h1 id="owned">Owned heading</h1>';
const main = "<main><p>Visible answer</p></main>";
const smallSource = `${heading}${main}`;
const largeSource = `${heading}<script>${script}</script>${main}`;

interface Fixture {
	report: ResearchNavigationReport;
	raw: Uint8Array;
	body: Uint8Array;
	trusted: TrustedResearchReplayAdmission;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Replay must not fetch");
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
	source = smallSource,
	profile: ResearchDocumentProfileId = "long-v1",
	rawPolicy?: readerInfo.ResearchReaderRawPolicy,
): Promise<Fixture> {
	const body = encoder.encode(source);
	const response: NetworkResponse = {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response,
	);
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
		profile,
		{ minRequestIntervalMs: 0, readerRawPolicy: rawPolicy },
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(hash(body)).toBe(hash(encoder.encode(source)));
	const serialized = serializeResearchReport(report, profile);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	const trusted: TrustedResearchReplayAdmission = {
		expectedProfile: profile,
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: body.byteLength, sha256: hash(body) },
	};
	vi.clearAllMocks();
	return { report, raw, body, trusted };
}

function revised(
	input: Fixture,
	mutate: (report: Record<string, unknown>) => void,
): Fixture {
	const report = structuredClone(input.report);
	mutate(report as unknown as Record<string, unknown>);
	const serialized = serializeResearchReport(
		report,
		input.trusted.expectedProfile,
	);
	expect(serialized.disposition).toBe("complete");
	const raw = serialized.jsonl;
	return {
		...input,
		report,
		raw,
		trusted: { ...input.trusted, expectedReceiptSha256: hash(raw) },
	};
}

function replay(input: Fixture) {
	const rawHash = hash(input.raw);
	const bodyHash = hash(input.body);
	const trusted = structuredClone(input.trusted);
	try {
		return extractResearchReplayJson(input.raw, input.trusted, {
			selector: "main",
		});
	} finally {
		expect(hash(input.raw)).toBe(rawHash);
		expect(hash(input.body)).toBe(bodyHash);
		expect(input.trusted).toEqual(trusted);
	}
}

function rejects(action: () => unknown, code: ErrorCode) {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected bounded replay rejection");
	expect(caught.code).toBe(code);
	expect(caught.message).not.toContain(privateMarker);
	return caught;
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
	const load = vi.spyOn(loader, "loadResearchDocument");
	const close = vi.spyOn(DocumentTree.prototype, "close");
	return {
		bodies,
		load,
		close,
		assert(closed: boolean) {
			expect(bodies).toHaveLength(1);
			expect(bodies[0].byteLength).toBeGreaterThan(0);
			expect(bodies[0].every((value) => value === 0)).toBe(true);
			if (closed) {
				expect(close).toHaveBeenCalledOnce();
				const tree = close.mock.contexts[0];
				if (!(tree instanceof DocumentTree))
					throw new Error("Expected owned replay document");
				expect(tree.mutationMetrics().closed).toBe(true);
				expect(readerInfo.researchReaderInfo(tree)).toBeUndefined();
			} else expect(close).not.toHaveBeenCalled();
		},
	};
}

it.each(["top", "reader", "both"] as const)(
	"replays an eligible >2MB long-v1 script using the pinned %s policy",
	async (location) => {
		const original = await fixture(largeSource, "long-v1", policy);
		const input = revised(original, (report) => {
			if (location === "reader")
				Reflect.deleteProperty(report, "readerRawPolicy");
			if (location === "top")
				Reflect.deleteProperty(report.reader as object, "rawTextPolicy");
		});
		const ownership = observeOwnership();
		const result = replay(input);
		expect(input.body.byteLength).toBeGreaterThan(2 * 1024 * 1024);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			networkRequests: 0,
			reader: {
				rawTextPolicy: policy,
				omittedRaw: { codeUnits: script.length, elements: 1 },
			},
		});
		expect(result.report.reader).toEqual(original.report.reader);
		expect(result.jsonl).toContain("Visible answer");
		expect(result.jsonl).not.toContain(privateMarker);
		expect(JSON.parse(result.jsonl)).toEqual(result.report);
		expect(result.outputBytes).toBe(encoder.encode(result.jsonl).byteLength);
		const omitted = result.report.reader?.omittedRaw;
		expect(omitted?.workUnits).toBeLessThanOrEqual(omitted?.maxWorkUnits ?? 0);
		expect(ownership.load).toHaveBeenCalledOnce();
		expect(ownership.load.mock.calls[0]).toHaveLength(4);
		expect(ownership.load.mock.calls[0][2]).toBe("long-v1");
		expect(ownership.load.mock.calls[0][3]).toBe(policy);
		ownership.assert(true);
	},
);

it("keeps the identical legacy large payload subject to the old reader text limit", async () => {
	const original = await fixture(largeSource, "long-v1", policy);
	const input = revised(original, (report) => {
		Reflect.deleteProperty(report, "readerRawPolicy");
		Reflect.deleteProperty(report.reader as object, "rawTextPolicy");
		Reflect.deleteProperty(report.reader as object, "omittedRaw");
	});
	const ownership = observeOwnership();
	const error = rejects(() => replay(input), "resource-limit");
	expect(resourceLimitDiagnostic(error)).toMatchObject({
		kind: "reader.text",
		unit: "code-units",
		limit: 2_000_000,
	});
	expect(ownership.load.mock.calls[0]).toHaveLength(3);
	ownership.assert(false);
});

it.each(["default", "long-v1"] as const)(
	"preserves the absent-policy %s loader invocation and report shape",
	async (profile) => {
		const input = await fixture(smallSource, profile);
		const ownership = observeOwnership();
		const result = replay(input);
		expect(ownership.load.mock.calls[0]).toHaveLength(3);
		expect(ownership.load.mock.calls[0][2]).toBe(profile);
		expect(result.report.reader).toEqual(input.report.reader);
		expect(result.report).not.toHaveProperty("readerRawPolicy");
		expect(result.report.reader).not.toHaveProperty("rawTextPolicy");
		expect(result.report.reader).not.toHaveProperty("omittedRaw");
		ownership.assert(true);
	},
);

it.each(["default", "long-v1"] as const)(
	"propagates top-only policy without a reader container in %s receipts",
	async (profile) => {
		const original = await fixture(smallSource, profile, policy);
		const input = revised(original, (report) => {
			Reflect.deleteProperty(report, "reader");
		});
		const ownership = observeOwnership();
		const result = replay(input);
		expect(result.report.reader).toEqual(original.report.reader);
		expect(result.report.reader?.rawTextPolicy).toBe(policy);
		expect(ownership.load.mock.calls[0]).toHaveLength(4);
		expect(ownership.load.mock.calls[0][2]).toBe(profile);
		expect(ownership.load.mock.calls[0][3]).toBe(policy);
		ownership.assert(true);
	},
);

it("ignores receipt counters, arbitrary limits and code as execution options", async () => {
	const original = await fixture(largeSource, "long-v1", policy);
	const input = revised(original, (report) => {
		report.limits = { maxTextCodeUnits: 1, maxSourceCodeUnits: 1 };
		report.code = privateMarker;
		report.reader = {
			rawTextPolicy: policy,
			textCodeUnits: 999_999_999,
			omittedRaw: { codeUnits: -1, maxWorkUnits: 1, maxWindowCodeUnits: 1 },
			limits: { maxTokens: 1 },
		};
	});
	const ownership = observeOwnership();
	const result = replay(input);
	expect(result.report.reader).toEqual(original.report.reader);
	expect(result.jsonl).not.toContain(privateMarker);
	expect(ownership.load.mock.calls[0]).toHaveLength(4);
	expect(ownership.load.mock.calls[0][1].limits).toEqual(
		researchLongDocumentAdmission.document,
	);
	expect(ownership.load.mock.calls[0][3]).toBe(policy);
	ownership.assert(true);
});

const invalidPolicies = [null, false, 1, "", privateMarker, [], { policy }];

it.each(
	["top", "reader"].flatMap((location) =>
		invalidPolicies.map((value) => ({ location, value })),
	),
)(
	"rejects malformed $location policy $value and wipes its owned body",
	async ({ location, value }) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			if (location === "top") report.readerRawPolicy = value;
			else report.reader = { rawTextPolicy: value };
		});
		const ownership = observeOwnership();
		rejects(() => replay(input), "invalid-input");
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(false);
	},
);

it.each(["top", "reader"])(
	"rejects disagreement with an unknown %s policy and wipes its owned body",
	async (location) => {
		const original = await fixture(smallSource, "long-v1", policy);
		const input = revised(original, (report) => {
			if (location === "top") report.readerRawPolicy = privateMarker;
			else report.reader = { rawTextPolicy: privateMarker };
		});
		const ownership = observeOwnership();
		rejects(() => replay(input), "invalid-input");
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(false);
	},
);

it.each([null, false, 1, "reader", []])(
	"rejects malformed reader container %s when top-level policy is declared",
	async (reader) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			report.readerRawPolicy = policy;
			report.reader = reader;
		});
		const ownership = observeOwnership();
		rejects(() => replay(input), "invalid-input");
		expect(ownership.load).not.toHaveBeenCalled();
		ownership.assert(false);
	},
);

it.each([undefined, null, false, "reader", []])(
	"preserves absent-policy replay with legacy reader metadata %s",
	async (reader) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			if (reader === undefined) Reflect.deleteProperty(report, "reader");
			else report.reader = reader;
		});
		const ownership = observeOwnership();
		expect(replay(input).report.reader).toEqual(original.report.reader);
		expect(ownership.load.mock.calls[0]).toHaveLength(3);
		ownership.assert(true);
	},
);

it.each(
	[
		"failed",
		"challenged",
		"missing-capture",
		"missing-pin",
		"incomplete",
	].flatMap((reason) =>
		[policy, privateMarker].map((declaration) => ({ reason, declaration })),
	),
)(
	"refuses $reason evidence before inspecting policy $declaration",
	async ({ reason, declaration }) => {
		const original = await fixture();
		const input = revised(original, (report) => {
			report.readerRawPolicy = declaration;
			if (reason === "failed") {
				report.outcome = "failure";
				report.contentSuccess = false;
				report.failure = { category: "unsupported", stage: "loader" };
			} else if (reason === "challenged") {
				report.outcome = "semantic-barrier";
				report.contentSuccess = false;
				report.classification = {
					classifier: "browser-challenges",
					barrier: "challenge",
					diagnostic: null,
				};
			} else if (reason === "missing-capture")
				Reflect.deleteProperty(report, "bodyCapture");
			else if (reason === "incomplete")
				(report.headings as Record<string, unknown>).truncated = true;
		});
		if (reason === "missing-pin")
			input.trusted = {
				expectedProfile: "long-v1",
				expectedReceiptSha256: hash(input.raw),
			};
		const ownership = observeOwnership();
		const validate = vi.spyOn(readerInfo, "validateResearchReaderRawPolicy");
		rejects(() => replay(input), "policy-denied");
		expect(validate).not.toHaveBeenCalled();
		expect(ownership.load).not.toHaveBeenCalled();
		expect(ownership.close).not.toHaveBeenCalled();
		expect(ownership.bodies).toHaveLength(0);
	},
);

it("does not use a policy added to caller bytes without a matching receipt pin", async () => {
	const original = await fixture();
	const input = revised(original, (report) => {
		report.readerRawPolicy = policy;
	});
	input.trusted = original.trusted;
	const ownership = observeOwnership();
	const validate = vi.spyOn(readerInfo, "validateResearchReaderRawPolicy");
	rejects(() => replay(input), "invalid-input");
	expect(validate).not.toHaveBeenCalled();
	expect(ownership.load).not.toHaveBeenCalled();
	expect(ownership.bodies).toHaveLength(0);
});
