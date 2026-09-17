import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	researchLongAdmissionProvenance,
	validateResearchReplayAdmission,
	validateResearchOutputLimitSectionAdmission,
	validateResearchEmptyOutlineAdmission,
} from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";

const profiles = ["default", "long-v1"] as const;
const url = "https://strategy-admission.fixture.invalid/article";
const timestamp = "2026-09-17T07:00:00.000Z";
const title = "Owned admission heading";
const source = new TextEncoder().encode(`<h1 id="owned">${title}</h1>`);
beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected admission request"),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Admission fixtures must not fetch");
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

function fixture(profile: ResearchDocumentProfileId): Record<string, unknown> {
	return {
		requestedUrl: url,
		finalUrl: url,
		startedAt: timestamp,
		finishedAt: timestamp,
		elapsedMs: 0,
		profile: "native-semantic-reader-v1",
		partial: true,
		contentSuccess: null,
		outcome: "extracted-unverified",
		classification: {
			classifier: "browser-challenges",
			barrier: null,
			diagnostic: null,
		},
		primaryResponse: {
			url,
			status: 200,
			receivedAt: timestamp,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			decodedBytes: source.byteLength,
			encodedBytes: source.byteLength,
			bodySha256: hash(source),
			hashScope: "transport-decoded-body-before-loader",
			redirects: 0,
			elapsedMs: 0,
		},
		bodyCapture: captureResearchBody(source, profile),
		selection: { method: "heading-outline" },
		headings: {
			method: "heading-outline",
			document: "e1",
			revision: 0,
			partial: true,
			entries: [
				{
					ref: "e1:n3",
					level: 1,
					title,
					titleTruncated: false,
					selector: "#owned",
				},
			],
			scannedNodes: 5,
			truncated: false,
		},
		metrics: {
			requests: 1,
			redirects: 0,
			encodedBytes: source.byteLength,
			decodedBytes: source.byteLength,
			active: 0,
			closed: true,
		},
		...(profile === "long-v1"
			? { admission: researchLongAdmissionProvenance }
			: {}),
	};
}

function serialize(report: Record<string, unknown>): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(report)}\n`);
}

function authority(
	raw: Uint8Array,
	profile: ResearchDocumentProfileId,
): TrustedResearchReplayAdmission {
	return {
		expectedProfile: profile,
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: source.byteLength, sha256: hash(source) },
	};
}

function expectAdmitted(raw: Uint8Array, profile: ResearchDocumentProfileId) {
	const admitted = validateResearchReplayAdmission(
		raw,
		authority(raw, profile),
	);
	expect(admitted.kind).toBe("validated-capture");
	if (admitted.kind !== "validated-capture")
		throw new Error("Expected valid control capture");
	try {
		expect(admitted.body).toEqual(source);
		expect(admitted.bodyIdentity).toEqual({
			bytes: source.byteLength,
			sha256: hash(source),
		});
	} finally {
		admitted.body.fill(0);
	}
}

const strategies = [
	{
		name: "native",
		value: { policy: "native-reader-fallback-v1", mode: "native" },
	},
	{
		name: "reader",
		value: {
			policy: "native-reader-fallback-v1",
			mode: "reader",
			nativeFailure: { category: "unsupported", stage: "loader" },
		},
	},
	{ name: "unknown policy", value: { policy: "future", mode: "native" } },
	{ name: "null", value: null },
	{ name: "false", value: false },
	{ name: "zero", value: 0 },
	{ name: "empty string", value: "" },
	{ name: "empty object", value: {} },
	{ name: "empty array", value: [] },
];

it.each(profiles)(
	"retains ordinary %s replay when no strategy is declared",
	(profile) => {
		const raw = serialize(fixture(profile));
		expectAdmitted(raw, profile);
		const result = extractResearchReplayJson(
			raw,
			authority(raw, profile),
			{ selector: "#owned" },
			undefined,
			"markdown",
		);
		expect(result.report.extraction?.content).toContain(title);
	},
);

it.each(
	profiles.flatMap((profile) =>
		strategies.map((strategy) => ({ profile, ...strategy })),
	),
)(
	"rejects caller-pinned strategy metadata: $profile / $name",
	({ profile, value }) => {
		const report = fixture(profile);
		report.documentStrategy = value;
		const raw = serialize(report);
		const trusted = authority(raw, profile);
		const error = expect.objectContaining({
			name: "AgentBrowserError",
			code: "unsupported",
		});
		expect(() => validateResearchReplayAdmission(raw, trusted)).toThrowError(
			error,
		);
		expect(() =>
			validateResearchOutputLimitSectionAdmission(raw, trusted),
		).toThrowError(error);
		expect(() =>
			validateResearchEmptyOutlineAdmission(raw, trusted),
		).toThrowError(error);
		expect(() =>
			extractResearchReplayJson(raw, trusted, { selector: "#owned" }),
		).toThrowError(error);
		expect(raw).toEqual(serialize(report));
	},
);

it.each(profiles)(
	"still checks the %s receipt hash before strategy rejection",
	(profile) => {
		const report = fixture(profile);
		const trusted = authority(serialize(report), profile);
		report.documentStrategy = strategies[0].value;
		expect(() =>
			validateResearchReplayAdmission(serialize(report), trusted),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each(profiles)(
	"does not reject a JSON-omitted undefined strategy on %s",
	(profile) => {
		const report = fixture(profile);
		const original = serialize(report);
		report.documentStrategy = undefined;
		const raw = serialize(report);
		expect(raw).toEqual(original);
		expectAdmitted(raw, profile);
	},
);
