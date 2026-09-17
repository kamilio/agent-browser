import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	type TrustedResearchReplayAdmission,
	researchLongAdmissionProvenance,
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import type { ResearchNavigationReport } from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import { captureResearchResponseHeaders } from "./research-response-headers.js";

type Fixture = Record<string, unknown>;
type CaptureVersion =
	| "selected-response-headers-v1"
	| "selected-response-headers-v2";

const profiles = ["default", "long-v1"] as const;
const versions = [
	"selected-response-headers-v1",
	"selected-response-headers-v2",
] as const;
const originalNames = [
	"content-type",
	"content-length",
	"content-encoding",
	"cf-mitigated",
	"retry-after",
] as const;
const cspNames = [
	"content-security-policy",
	"content-security-policy-report-only",
] as const;
const selectedNames = [...originalNames, ...cspNames];
const url = "https://research.example/synthetic-csp-admission";
const timestamp = "2026-09-17T00:00:00.000Z";
const source = new TextEncoder().encode(
	"<h1 id=synthetic>Synthetic heading</h1>",
);
const policies = [
	" default-src 'self';\tscript-src 'nonce-synthetic' https://scripts.example; ",
	`script-src 'sha256-synthetic' ${"https://scripts.example ".repeat(12)}; report-uri /csp`,
	"default-src 'none'; img-src data: https:; report-to synthetic",
];
const { maxMetadataBytes, maxReceiptBytes } =
	researchLongDocumentAdmission.evidence;

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function object(value: unknown): Fixture {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("Expected synthetic CSP evidence record");
	return value as Fixture;
}

function marker(
	kind: CaptureVersion = "selected-response-headers-v2",
	omitted: readonly string[] = [],
): Fixture {
	return { kind, partial: true, omitted };
}

function fixture(profile: ResearchDocumentProfileId): Fixture {
	return {
		requestedUrl: url,
		finalUrl: url,
		startedAt: timestamp,
		finishedAt: timestamp,
		elapsedMs: 0,
		profile: "native-semantic-reader-v1",
		partial: true,
		contentSuccess: null,
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
			headerCapture: marker(),
			decodedBytes: source.byteLength,
			encodedBytes: source.byteLength,
			bodySha256: hash(source),
			hashScope: "transport-decoded-body-before-loader",
			redirects: 0,
			elapsedMs: 0,
		},
		bodyCapture: captureResearchBody(source, profile),
		selection: { method: "heading-outline" },
		outcome: "extracted-unverified",
		headings: {
			method: "heading-outline",
			document: "e1",
			revision: 0,
			partial: true,
			entries: [
				{
					ref: "e1:n3",
					level: 1,
					title: "Synthetic heading",
					titleTruncated: false,
					selector: "#synthetic",
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

function serialize(report: Fixture, profile?: ResearchDocumentProfileId) {
	return serializeResearchReport(
		report as unknown as ResearchNavigationReport,
		profile,
	);
}

function jsonl(report: unknown): Uint8Array {
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

function replay(report: Fixture, profile: ResearchDocumentProfileId) {
	const raw = jsonl(report);
	return validateResearchReplayAdmission(raw, authority(raw, profile));
}

function rejects(
	action: () => unknown,
	code: "invalid-input" | "resource-limit" = "invalid-input",
): void {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected synthetic CSP evidence rejection");
	expect(caught.code).toBe(code);
	expect(caught.message).toBe(
		code === "invalid-input"
			? "Invalid research evidence"
			: "Research evidence codec limit exceeded",
	);
	expect(Object.hasOwn(caught, "cause")).toBe(false);
}

function rejectSchema(change: (primary: Fixture) => void): void {
	for (const profile of profiles) {
		const report = fixture(profile);
		change(object(report.primaryResponse));
		rejects(() => serialize(report, profile));
		if (profile === "default") rejects(() => serialize(report));
		rejects(() => replay(report, profile));
	}
}

function retained(report: Fixture, profile: ResearchDocumentProfileId): void {
	const before = structuredClone(report);
	const emission = serialize(report, profile);
	expect(emission.disposition).toBe("complete");
	expect(emission.jsonl).toEqual(jsonl(before));
	expect(emission.receiptBytes).toBe(emission.jsonl.byteLength);
	expect(emission.record.primaryResponse).toEqual(before.primaryResponse);
	if (profile === "default") {
		expect(emission.metadataBytes).toBeNull();
		expect(serialize(report).jsonl).toEqual(emission.jsonl);
	} else {
		const metadata = structuredClone(before);
		Reflect.deleteProperty(object(metadata.bodyCapture), "data");
		Reflect.deleteProperty(object(metadata.headings), "entries");
		expect(emission.metadataBytes).toBe(jsonl(metadata).byteLength);
	}
	const result = validateResearchReplayAdmission(
		emission.jsonl,
		authority(emission.jsonl, profile),
	);
	try {
		expect(result.kind).toBe("validated-capture");
		expect(result.body).toEqual(source);
		expect(result.originalMetadata.primaryResponse).toEqual(
			before.primaryResponse,
		);
		expect(Object.isFrozen(result.originalMetadata.primaryResponse)).toBe(true);
		expect(result.originalMetadata).not.toHaveProperty("bodyCapture.data");
		expect(result.originalFieldPresence["bodyCapture.data"]).toBe(true);
		expect(report).toEqual(before);
	} finally {
		result.body?.fill(0);
	}
}

describe.each(profiles)("CSP receipt compatibility under %s", (profile) => {
	it("preserves actual enforced and report-only policies without normalization", () => {
		const report = fixture(profile);
		const primary = object(report.primaryResponse);
		Object.assign(
			primary,
			captureResearchResponseHeaders({
				"content-type": ["text/html; charset=utf-8"],
				"content-security-policy": [...policies, policies[0]],
				"content-security-policy-report-only": [
					"script-src 'none'; report-uri /report-only",
					...policies,
				],
			}),
		);
		expect(primary.headerCapture).toEqual(marker());
		expect(object(primary.headers)[cspNames[0]]).toEqual([
			...policies,
			policies[0],
		]);
		expect(object(primary.headers)[cspNames[1]]).toEqual([
			"script-src 'none'; report-uri /report-only",
			...policies,
		]);
		retained(report, profile);
	});

	it.each(cspNames)("keeps %s separate from the other policy field", (name) => {
		const report = fixture(profile);
		object(object(report.primaryResponse).headers)[name] = policies;
		retained(report, profile);
		expect(object(report.primaryResponse).headers).not.toHaveProperty(
			cspNames.find((other) => other !== name) as string,
		);
	});

	it.each(cspNames)(
		"accepts the whole-field 16384-unit boundary for %s",
		(name) => {
			for (const count of [1, 2, 16]) {
				const report = fixture(profile);
				object(object(report.primaryResponse).headers)[name] = Array.from(
					{ length: count },
					() => "é".repeat(16_384 / count),
				);
				retained(report, profile);
			}
		},
	);

	it("preserves empty, whitespace and Latin-1 policy strings", () => {
		const report = fixture(profile);
		for (const name of cspNames)
			object(object(report.primaryResponse).headers)[name] = [
				"",
				"\t ",
				" ~\u0080\u0085\u009f\u00ff",
			];
		retained(report, profile);
	});

	it("distinguishes historical unknown, current absent and explicitly omitted CSP", () => {
		for (const capture of [
			marker("selected-response-headers-v1"),
			marker(),
			marker("selected-response-headers-v2", [cspNames[0]]),
			marker("selected-response-headers-v2", cspNames),
		]) {
			const report = fixture(profile);
			object(report.primaryResponse).headerCapture = capture;
			retained(report, profile);
			for (const name of cspNames)
				expect(object(report.primaryResponse).headers).not.toHaveProperty(name);
		}
	});

	it.each(versions)(
		"retains historical bounds and omission order for %s",
		(version) => {
			const report = fixture(profile);
			const primary = object(report.primaryResponse);
			primary.headerCapture = marker(version, [
				"content-length",
				"cf-mitigated",
			]);
			object(primary.headers)["retry-after"] = Array.from({ length: 16 }, () =>
				"é".repeat(160),
			);
			retained(report, profile);
			primary.headers = {};
			primary.headerCapture = marker(
				version,
				version === versions[0] ? originalNames : selectedNames,
			);
			const emission = serialize(report, profile);
			const result = validateResearchReplayAdmission(emission.jsonl, {
				expectedProfile: profile,
				expectedReceiptSha256: hash(emission.jsonl),
			});
			expect(result).toMatchObject({
				kind: "evidence-only",
				reason: "body-pin-missing",
			});
			expect(result.originalMetadata.primaryResponse).toEqual(primary);
		},
	);

	it("does not upgrade unmarked legacy evidence", () => {
		const report = fixture(profile);
		const primary = object(report.primaryResponse);
		Reflect.deleteProperty(primary, "headerCapture");
		object(primary.headers)["content-encoding"] = ["\0\r\n", "😀".repeat(80)];
		retained(report, profile);
		expect(
			serialize(report, profile).record.primaryResponse,
		).not.toHaveProperty("headerCapture");
	});
});

describe.each(cspNames)("CSP field %s", (name) => {
	it.each([
		["null", null],
		["scalar", "default-src 'self'"],
		["empty array", []],
		["17 values", Array.from({ length: 17 }, () => "default-src 'self'")],
		["16385 units", ["x".repeat(16_385)]],
		["cumulative overflow", ["x".repeat(8192), "y".repeat(8193)]],
		["non-string entry", ["default-src 'self'", 1]],
		["control character", ["default-src 'self'", "before\r\nafter"]],
		["DEL", ["before\u007fafter"]],
		["non-Latin-1", ["before\u0100after"]],
		["surrogate", ["before\ud800after"]],
	])(
		"omits captured %s wholly but rejects it in retained evidence",
		(_, values) => {
			rejectSchema((primary) => {
				object(primary.headers)[name] = values;
			});
			for (const profile of profiles) {
				const report = fixture(profile);
				const captured = captureResearchResponseHeaders({
					"content-type": ["text/html; charset=utf-8"],
					[name]: values,
				} as Readonly<Record<string, readonly string[]>>);
				expect(captured.headers).not.toHaveProperty(name);
				expect(captured.headerCapture).toEqual(
					marker("selected-response-headers-v2", [name]),
				);
				Object.assign(object(report.primaryResponse), captured);
				retained(report, profile);
			}
		},
	);

	it.each(["retained", "omitted"])(
		"rejects a v1 downgrade with %s CSP",
		(form) => {
			rejectSchema((primary) => {
				primary.headerCapture = marker(
					"selected-response-headers-v1",
					form === "omitted" ? [name] : [],
				);
				if (form === "retained")
					object(primary.headers)[name] = ["default-src 'self'"];
			});
		},
	);

	it("rejects retained/omitted conflicts", () => {
		rejectSchema((primary) => {
			primary.headerCapture = marker("selected-response-headers-v2", [name]);
			object(primary.headers)[name] = policies;
		});
	});
});

it.each([
	["null", null],
	["array", []],
	["missing kind", { partial: true, omitted: [] }],
	["unknown version", { ...marker(), kind: "selected-response-headers-v3" }],
	["missing partial", { kind: versions[1], omitted: [] }],
	["false partial", { ...marker(), partial: false }],
	["missing omitted", { kind: versions[1], partial: true }],
	["null omitted", { ...marker(), omitted: null }],
	["extra key", { ...marker(), complete: true }],
])("rejects a %s v2 marker", (_, capture) => {
	rejectSchema((primary) => {
		primary.headerCapture = capture;
	});
});

it.each([
	["unknown", ["set-cookie"]],
	["mixed case", ["Content-Security-Policy"]],
	["non-string", [null]],
	["duplicate", [cspNames[0], cspNames[0]]],
	["reversed CSP", [cspNames[1], cspNames[0]]],
	["reversed versions", [cspNames[0], "retry-after"]],
])("rejects %s v2 omissions", (_, omitted) => {
	rejectSchema((primary) => {
		primary.headerCapture = { ...marker(), omitted };
	});
});

it.each([
	"set-cookie",
	"authorization",
	"x-synthetic",
	"Content-Security-Policy",
])("rejects unselected v2 header %s", (name) => {
	rejectSchema((primary) => {
		object(primary.headers)[name] = ["synthetic"];
	});
});

it.each(originalNames)(
	"does not extend original limits for %s in v2",
	(name) => {
		for (const values of [["x".repeat(161)], new Array(17).fill("x")])
			rejectSchema((primary) => {
				object(primary.headers)[name] = values;
			});
	},
);

it.each(profiles)(
	"rejects own-undefined v2 evidence before %s JSON omission",
	(profile) => {
		for (const field of ["kind", "partial", "omitted", "extra"]) {
			const report = fixture(profile);
			object(object(report.primaryResponse).headerCapture)[field] = undefined;
			rejects(() => serialize(report, profile));
			if (profile === "default") rejects(() => serialize(report));
		}
		for (const name of cspNames) {
			const report = fixture(profile);
			object(object(report.primaryResponse).headers)[name] = undefined;
			rejects(() => serialize(report, profile));
			if (profile === "default") rejects(() => serialize(report));
		}
	},
);

it.each(profiles)(
	"does not admit CSP by removing the marker under %s",
	(profile) => {
		for (const name of cspNames) {
			const report = fixture(profile);
			const primary = object(report.primaryResponse);
			Reflect.deleteProperty(primary, "headerCapture");
			object(primary.headers)[name] = ["default-src 'self'"];
			rejects(() => replay(report, profile));
			if (profile === "long-v1") rejects(() => serialize(report, profile));
			else {
				expect(serialize(report, profile).jsonl).toEqual(jsonl(report));
				expect(serialize(report).jsonl).toEqual(jsonl(report));
			}
		}
	},
);

it.each(profiles)(
	"checks v2 markers before %s evidence-only admission",
	(profile) => {
		for (const evidenceCase of ["barrier", "missing-capture", "missing-pin"]) {
			const report = fixture(profile);
			if (evidenceCase === "barrier") {
				report.outcome = "semantic-barrier";
				object(report.classification).barrier = "challenge";
			} else if (evidenceCase === "missing-capture")
				Reflect.deleteProperty(report, "bodyCapture");
			object(report.primaryResponse).headerCapture = {
				...marker(),
				kind: "selected-response-headers-v3",
			};
			const raw = jsonl(report);
			rejects(() =>
				validateResearchReplayAdmission(raw, {
					expectedProfile: profile,
					expectedReceiptSha256: hash(raw),
					...(evidenceCase === "missing-pin"
						? {}
						: { expectedBody: authority(raw, profile).expectedBody }),
				}),
			);
		}
	},
);

it.each(["metadata-bytes", "receipt-bytes"] as const)(
	"preserves CSP in bounded long %s output failures",
	(cause) => {
		const report = fixture("long-v1");
		const primary = object(report.primaryResponse);
		for (const name of cspNames) object(primary.headers)[name] = policies;
		if (cause === "metadata-bytes")
			report.syntheticPadding = "x".repeat(maxMetadataBytes + 1);
		else object(report.bodyCapture).data = "A".repeat(maxReceiptBytes + 1);
		const before = structuredClone(report);
		const emission = serialize(report, "long-v1");
		expect(emission.disposition).toBe("output-limit");
		expect(emission.record).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			primaryResponse: primary,
			failure: { category: "resource-limit", stage: "evidence-output" },
			outputLimit: {
				cause,
				metadataRetention: "bounded-projection",
				omittedPayloads: ["bodyCapture", "headings"],
			},
		});
		expect(emission.record).not.toHaveProperty("bodyCapture");
		expect(emission.record).not.toHaveProperty("headings");
		expect(emission.receiptBytes).toBeLessThanOrEqual(maxReceiptBytes);
		expect(emission.metadataBytes).toBeLessThanOrEqual(maxMetadataBytes);
		const result = validateResearchReplayAdmission(
			emission.jsonl,
			authority(emission.jsonl, "long-v1"),
		);
		expect(result).toMatchObject({
			kind: "evidence-only",
			reason: "payload-omitted",
			body: null,
		});
		expect(result.originalMetadata.primaryResponse).toEqual(primary);
		expect(report).toEqual(before);
	},
);

it.each(profiles)(
	"keeps %s replay metadata and receipt budgets authoritative",
	(profile) => {
		for (const cause of ["metadata-bytes", "receipt-bytes"]) {
			const report = fixture(profile);
			for (const name of cspNames)
				object(object(report.primaryResponse).headers)[name] = policies;
			if (cause === "metadata-bytes")
				report.syntheticPadding = "x".repeat(maxMetadataBytes + 1);
			else object(report.bodyCapture).data = "A".repeat(maxReceiptBytes + 1);
			rejects(() => replay(report, profile), "resource-limit");
			if (profile === "default") {
				const emission = serialize(report, profile);
				expect(emission.disposition).toBe("complete");
				expect(emission.jsonl).toEqual(jsonl(report));
				expect(emission.metadataBytes).toBeNull();
			}
		}
	},
);

it.each(profiles)(
	"does not clip individually valid CSP to fit %s metadata",
	(profile) => {
		const report = fixture(profile);
		for (const name of cspNames)
			object(object(report.primaryResponse).headers)[name] = [
				"é".repeat(16_384),
			];
		const before = structuredClone(report);
		expect(maxMetadataBytes).toBe(65_536);
		rejects(() => replay(report, profile), "resource-limit");
		if (profile === "long-v1")
			rejects(() => serialize(report, profile), "resource-limit");
		else expect(serialize(report, profile).jsonl).toEqual(jsonl(report));
		expect(report).toEqual(before);
	},
);
