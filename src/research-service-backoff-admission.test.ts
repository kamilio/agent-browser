import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	researchLongAdmissionProvenance,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";

const profiles = ["default", "long-v1"] as const;
const url = "https://service-admission.fixture.invalid/article";
const timestamp = "2026-09-17T04:00:00.000Z";
const title = "Owned admission heading";
const source = new TextEncoder().encode(`<h1 id="owned">${title}</h1>`);
const serviceBackoff = {
	kind: "http-service-backoff",
	status: 503,
	url: "https://service-admission.fixture.invalid/style.css",
	receivedAt: timestamp,
	action: "stop-without-retry",
	retryAfter: {
		kind: "delay-seconds",
		delaySeconds: 120,
		retryAt: "2026-09-17T04:02:00.000Z",
	},
};
const stopFields = [
	{ name: "valid advice", value: serviceBackoff },
	{ name: "null", value: null },
	{ name: "false", value: false },
	{ name: "zero", value: 0 },
	{ name: "empty string", value: "" },
	{ name: "empty object", value: {} },
	{ name: "empty array", value: [] },
];

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

it.each(profiles)("admits and extracts a genuine %s control", (profile) => {
	const raw = serialize(fixture(profile));
	expectAdmitted(raw, profile);
	const result = extractResearchReplayJson(
		raw,
		authority(raw, profile),
		{ selector: "#owned" },
		undefined,
		"markdown",
	);
	expect(result.report).toMatchObject({
		outcome: "extracted-unverified",
		contentSuccess: null,
		selection: { method: "css-selector", matches: 1 },
		extraction: { format: "markdown" },
	});
	expect(result.report.extraction?.content).toContain(title);
});

it.each(
	profiles.flatMap((profile) =>
		stopFields.map((field) => ({ profile, ...field })),
	),
)(
	"refuses caller-pinned serviceBackoff metadata: $profile / $name",
	({ profile, value }) => {
		const report = fixture(profile);
		const original = serialize(report);
		report.serviceBackoff = value;
		const raw = serialize(report);
		const trusted = authority(raw, profile);
		expect(trusted.expectedReceiptSha256).not.toBe(hash(original));
		expect(trusted.expectedReceiptSha256).toBe(hash(raw));
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			primaryResponse: { status: 200 },
			classification: { barrier: null, diagnostic: null },
		});
		expect(Object.hasOwn(report, "failure")).toBe(false);
		const admitted = validateResearchReplayAdmission(raw, trusted);
		expect(admitted).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
			body: null,
			bodyIdentity: null,
			originalMetadata: { serviceBackoff: value },
			originalFieldPresence: { serviceBackoff: true },
		});
		expect(() =>
			extractResearchReplayJson(raw, trusted, { selector: "#owned" }),
		).toThrowError(
			expect.objectContaining({
				name: "AgentBrowserError",
				code: "policy-denied",
			}),
		);
	},
);

it.each(profiles)(
	"does not treat a JSON-omitted undefined field as a %s stop record",
	(profile) => {
		const report = fixture(profile);
		const original = serialize(report);
		report.serviceBackoff = undefined;
		expect(Object.hasOwn(report, "serviceBackoff")).toBe(true);
		const raw = serialize(report);
		expect(raw).toEqual(original);
		expect(
			Object.hasOwn(
				JSON.parse(new TextDecoder().decode(raw)),
				"serviceBackoff",
			),
		).toBe(false);
		expectAdmitted(raw, profile);
	},
);

it.each(profiles)(
	"still rejects a changed %s receipt with its old pin",
	(profile) => {
		const report = fixture(profile);
		const trusted = authority(serialize(report), profile);
		report.serviceBackoff = serviceBackoff;
		const raw = serialize(report);
		expect(() => validateResearchReplayAdmission(raw, trusted)).toThrowError(
			expect.objectContaining({
				name: "AgentBrowserError",
				code: "invalid-input",
			}),
		);
	},
);

it.each(
	profiles.flatMap((profile) =>
		[
			{
				name: "without advice",
				value: {
					kind: "http-rate-limit",
					status: 429,
					url,
					receivedAt: timestamp,
					action: "stop-without-retry",
				},
			},
			...stopFields.map((field) =>
				field.name === "valid advice"
					? {
							name: field.name,
							value: {
								...serviceBackoff,
								kind: "http-rate-limit",
								status: 429,
							},
						}
					: field,
			),
		].map((field) => ({ profile, ...field })),
	),
)(
	"refuses caller-pinned rateLimit metadata: $profile / $name",
	({ profile, value }) => {
		const report = fixture(profile);
		report.rateLimit = value;
		const raw = serialize(report);
		const trusted = authority(raw, profile);
		expect(validateResearchReplayAdmission(raw, trusted)).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
			body: null,
			bodyIdentity: null,
			originalMetadata: { rateLimit: value },
			originalFieldPresence: { rateLimit: true },
		});
		expect(() =>
			extractResearchReplayJson(raw, trusted, { selector: "#owned" }),
		).toThrowError(
			expect.objectContaining({
				name: "AgentBrowserError",
				code: "policy-denied",
			}),
		);
	},
);
