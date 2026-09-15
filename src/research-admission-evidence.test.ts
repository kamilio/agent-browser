import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
	type ResearchJsonlEmission,
	type TrustedResearchReplayAdmission,
	researchEvidenceCodecLimits,
	researchLongAdmissionProvenance,
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import {
	captureResearchBody,
	decodeResearchBodyCapture,
} from "../scripts/research-body-capture.js";
import type { ResearchNavigationReport } from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import {
	type NetworkPolicyReason,
	networkPolicyDiagnostic,
	networkPolicyError,
} from "./network-policy-diagnostic.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

type Fixture = Record<string, unknown>;

const url = "https://research.example/synthetic";
const timestamp = "2026-09-06T00:00:00.000Z";
const privateSentinel = "SYNTHETIC_EVIDENCE_PRIVATE";
const source = new TextEncoder().encode(
	"<h1 id=synthetic>Synthetic heading</h1>",
);
const { maxReceiptBytes, maxMetadataBytes } =
	researchLongDocumentAdmission.evidence;

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function object(value: unknown): Fixture {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error("Expected synthetic record");
	return value as Fixture;
}

function fixture(body = source): Fixture {
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
			decodedBytes: body.byteLength,
			encodedBytes: body.byteLength,
			bodySha256: hash(body),
			hashScope: "transport-decoded-body-before-loader",
			redirects: 0,
			elapsedMs: 0,
		},
		bodyCapture: captureResearchBody(body, "long-v1"),
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
		reader: {
			profile: "native-semantic-reader-v1",
			partial: true,
			scripting: false,
			styling: false,
			hiddenContentSemantics: false,
			encoding: "utf-8",
			sourceCodeUnits: body.byteLength,
			textCodeUnits: 17,
			outputCodeUnits: 100,
			tokens: 3,
			omittedTokens: 0,
			omittedSubtrees: {},
			ignoredAttributes: 0,
			unwrappedElements: 0,
			tokenizerIssues: 0,
		},
		metrics: {
			requests: 1,
			redirects: 0,
			encodedBytes: body.byteLength,
			decodedBytes: body.byteLength,
			active: 0,
			closed: true,
		},
		admission: researchLongAdmissionProvenance,
	};
}

function legacy(body = source): Fixture {
	const report = fixture(body);
	Reflect.deleteProperty(report, "admission");
	return report;
}

function serialize(
	report: unknown,
	profile: ResearchDocumentProfileId | undefined = "long-v1",
): ResearchJsonlEmission {
	return serializeResearchReport(report as ResearchNavigationReport, profile);
}

function jsonl(value: unknown): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function metadata(record: unknown): Fixture {
	const projected = structuredClone(object(record));
	for (const [name, payload] of [
		["bodyCapture", "data"],
		["headings", "entries"],
		["extraction", "content"],
		["textLines", "entries"],
	]) {
		const field = projected[name];
		if (field !== undefined && field !== null) delete object(field)[payload];
	}
	return projected;
}

function authority(
	raw: Uint8Array,
	body: Uint8Array | undefined = source,
	profile: ResearchDocumentProfileId = "long-v1",
): TrustedResearchReplayAdmission {
	return {
		expectedProfile: profile,
		expectedReceiptSha256: hash(raw),
		...(body === undefined
			? {}
			: {
					expectedBody: { bytes: body.byteLength, sha256: hash(body) },
				}),
	};
}

function replay(
	report: Fixture,
	body = source,
	profile: ResearchDocumentProfileId = "long-v1",
) {
	const raw = jsonl(report);
	return validateResearchReplayAdmission(raw, authority(raw, body, profile));
}

function rejects(
	action: () => unknown,
	code = "invalid-input",
): AgentBrowserError {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected synthetic evidence rejection");
	expect(caught.code).toBe(code);
	expect(caught.message.length).toBeGreaterThan(0);
	expect(caught.message.length).toBeLessThan(200);
	expect(caught.message).not.toContain(privateSentinel);
	expect(Object.hasOwn(caught, "cause")).toBe(false);
	return caught;
}

function expectEqualBytes(actual: Uint8Array, expected: Uint8Array): void {
	expect(actual.byteLength).toBe(expected.byteLength);
	expect(
		Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength).equals(
			Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
		),
	).toBe(true);
}

function measured(emission: ResearchJsonlEmission): void {
	expect(emission.receiptBytes).toBe(emission.jsonl.byteLength);
	expectEqualBytes(emission.jsonl, jsonl(emission.record));
	expect(emission.exitReport.outcome).toBe(emission.record.outcome);
	if (emission.metadataBytes !== null)
		expect(emission.metadataBytes).toBe(
			jsonl(metadata(emission.record)).byteLength,
		);
}

function atMetadataBytes(target: number): Fixture {
	const report = fixture();
	object(report.reader).syntheticPadding = "";
	const remaining = target - jsonl(metadata(report)).byteLength;
	if (remaining < 0) throw new Error("Synthetic metadata target too small");
	object(report.reader).syntheticPadding = "x".repeat(remaining);
	expect(jsonl(metadata(report)).byteLength).toBe(target);
	return report;
}

function atReceiptBytes(target: number): Fixture {
	const report = fixture();
	object(report.bodyCapture).data = "";
	const remaining = target - jsonl(report).byteLength;
	if (remaining < 0) throw new Error("Synthetic receipt target too small");
	object(report.bodyCapture).data = "A".repeat(remaining);
	expect(jsonl(report).byteLength).toBe(target);
	return report;
}

function outputLimit(emission: ResearchJsonlEmission): Fixture {
	expect(emission.disposition).toBe("output-limit");
	expect(emission.record.outcome).toBe("failure");
	expect(emission.record.contentSuccess).toBe(false);
	expect(emission.record.failure).toEqual({
		category: "resource-limit",
		stage: "evidence-output",
	});
	expect(emission.exitReport).toEqual({ outcome: "failure" });
	expect(emission.record).not.toHaveProperty("bodyCapture");
	expect(emission.record).not.toHaveProperty("headings");
	expect(emission.receiptBytes).toBeLessThanOrEqual(maxReceiptBytes);
	expect(emission.metadataBytes).toBeLessThanOrEqual(maxMetadataBytes);
	expect(emission.metadataBytes).toBe(emission.receiptBytes);
	measured(emission);
	return object(object(emission.record).outputLimit);
}

function countProperties(value: unknown): number {
	if (value === null || typeof value !== "object") return 0;
	const values = Object.values(value);
	return (
		values.length +
		values.reduce<number>((count, item) => count + countProperties(item), 0)
	);
}

function nestedObjects(depth: number): Fixture {
	let nested: Fixture = {};
	for (let level = 1; level < depth; level++) nested = { child: nested };
	return nested;
}

it("compares exact byte contents including empty spans", () => {
	expectEqualBytes(new Uint8Array(), new Uint8Array());
	expectEqualBytes(Uint8Array.of(0, 128, 255), Uint8Array.of(0, 128, 255));
});

it("rejects equal-length bytes that differ at any position", () => {
	const expected = Uint8Array.of(0, 128, 255);
	for (const index of [0, 1, 2]) {
		const actual = expected.slice();
		actual[index] ^= 1;
		expect(() => expectEqualBytes(actual, expected)).toThrow();
	}
});

it("rejects different byte lengths even with equal prefixes", () => {
	const longer = Uint8Array.of(1, 2, 3);
	const shorter = longer.subarray(0, 2);
	expect(() => expectEqualBytes(longer, shorter)).toThrow();
	expect(() => expectEqualBytes(shorter, longer)).toThrow();
});

it("compares only requested Uint8Array subarray spans", () => {
	const actual = Uint8Array.of(8, 0, 128, 255, 9).subarray(1, 4);
	const expected = Uint8Array.of(7, 6, 0, 128, 255, 5).subarray(2, 5);
	expectEqualBytes(actual, expected);
	expectEqualBytes(actual.subarray(1, 1), expected.subarray(2, 2));
	const shifted = Uint8Array.of(8, 0, 128, 255, 9).subarray(0, 3);
	expect(() => expectEqualBytes(actual, shifted)).toThrow();
});

it("exports canonical deeply frozen provenance with explicit local codec guards", () => {
	expect(researchEvidenceCodecLimits).toEqual({
		maxDepth: 32,
		maxProperties: 16384,
	});
	expect(researchLongAdmissionProvenance).toEqual({
		schemaVersion: 1,
		selection: "explicit-host",
		profile: "long-v1",
		effective: researchLongDocumentAdmission,
		codec: researchEvidenceCodecLimits,
	});
	const pending: object[] = [researchLongAdmissionProvenance];
	while (pending.length !== 0) {
		const value = pending.pop();
		if (value === undefined) throw new Error("Expected provenance node");
		expect(Object.isFrozen(value)).toBe(true);
		for (const field of Object.values(value))
			if (field !== null && typeof field === "object") pending.push(field);
	}
});

it("preserves omitted and explicit default JSON.stringify plus LF without projection", () => {
	const report = legacy();
	report.optional = undefined;
	report.extraction = { content: "x".repeat(maxMetadataBytes + 1) };
	const expected = jsonl(report);
	for (const emission of [
		serializeResearchReport(report as unknown as ResearchNavigationReport),
		serialize(report, "default"),
	]) {
		expect(emission.disposition).toBe("complete");
		expect(emission.jsonl).toEqual(expected);
		expect(emission.metadataBytes).toBeNull();
		expect(emission.exitReport.outcome).toBe(report.outcome);
		expect(emission.record).not.toHaveProperty("admission");
	}
});

it("rejects any own admission field when selection is omitted or default", () => {
	for (const admission of [undefined, null, researchLongAdmissionProvenance]) {
		const report = { ...legacy(), admission };
		rejects(() =>
			serializeResearchReport(report as unknown as ResearchNavigationReport),
		);
		rejects(() => serialize(report, "default"));
	}
});

it("does not apply the new receipt cap to trusted default serialization", () => {
	const report = legacy();
	report.extraction = { content: "x".repeat(maxReceiptBytes) };
	const emission = serialize(report, "default");
	expect(emission.disposition).toBe("complete");
	expect(emission.receiptBytes).toBeGreaterThan(maxReceiptBytes);
	expect(emission.metadataBytes).toBeNull();
	expectEqualBytes(emission.jsonl, jsonl(report));
});

it("measures escaped UTF8 and LF while retaining all non-payload metadata", () => {
	const report = fixture();
	object(report.reader).syntheticPadding = 'é😀\u0000\n"\\\ud800';
	const emission = serialize(report);
	expect(emission.disposition).toBe("complete");
	measured(emission);
	expect(emission.receiptBytes).toBe(
		Buffer.byteLength(JSON.stringify(report), "utf8") + 1,
	);
	expect(emission.metadataBytes).toBe(jsonl(metadata(report)).byteLength);
	expect(emission.jsonl[emission.jsonl.length - 1]).toBe(10);
	expect([...emission.jsonl].filter((byte) => byte === 10)).toHaveLength(1);
});

it.each([
	"failure",
	"http-failure",
	"semantic-barrier",
	"empty-extraction",
] as const)(
	"complete serialization preserves the non-success outcome %s",
	(outcome) => {
		const report = fixture();
		report.outcome = outcome;
		report.contentSuccess = false;
		report.failure = { category: "policy-denied", stage: "synthetic" };
		const emission = serialize(report);
		expect(emission.disposition).toBe("complete");
		expect(emission.exitReport.outcome).toBe(outcome);
		measured(emission);
	},
);

it("owns detached long records, exit snapshots and emitted bytes without input mutation", () => {
	const report = fixture();
	report.optional = undefined;
	const before = structuredClone(report);
	const first = serialize(report);
	const second = serialize(report);
	expect(report).toEqual(before);
	expect(first.jsonl.buffer).not.toBe(second.jsonl.buffer);
	expect(first.record).not.toBe(report);
	expect(first.record.bodyCapture).not.toBe(report.bodyCapture);
	expect(first.record.headings).not.toBe(report.headings);
	expect(first.record).not.toHaveProperty("optional");
	report.outcome = "failure";
	object(report.bodyCapture).data = privateSentinel;
	object(report.headings).entries = [];
	expect(first.record.outcome).toBe("extracted-unverified");
	expect(first.exitReport.outcome).toBe("extracted-unverified");
	expect(first.jsonl).toEqual(second.jsonl);
	first.jsonl.fill(0);
	expect(second.jsonl).toEqual(jsonl(second.record));
});

it.each([maxMetadataBytes, maxMetadataBytes + 1])(
	"measures the defensive synthetic metadata boundary at %s including LF",
	(target) => {
		const report = atMetadataBytes(target);
		const before = structuredClone(report);
		const emission = serialize(report);
		if (target === maxMetadataBytes) {
			expect(emission.disposition).toBe("complete");
			expect(emission.metadataBytes).toBe(target);
			measured(emission);
		} else {
			const limit = outputLimit(emission);
			expect(limit.cause).toBe("metadata-bytes");
			expect(limit.limitBytes).toBe(maxMetadataBytes);
			expect(limit.observedBytes).toBeGreaterThan(maxMetadataBytes);
			expect(limit.observedBytes).toBeLessThanOrEqual(target);
			if (limit.observation === "complete")
				expect(limit.observedBytes).toBe(target);
		}
		expect(report).toEqual(before);
	},
);

it.each([maxReceiptBytes, maxReceiptBytes + 1])(
	"measures defensive synthetic non-native payload bytes at %s including LF",
	(target) => {
		const report = atReceiptBytes(target);
		const emission = serialize(report);
		if (target === maxReceiptBytes) {
			expect(emission.disposition).toBe("complete");
			expect(emission.receiptBytes).toBe(target);
			measured(emission);
		} else {
			const limit = outputLimit(emission);
			expect(limit.cause).toBe("receipt-bytes");
			expect(limit.limitBytes).toBe(maxReceiptBytes);
			expect(limit.observedBytes).toBeGreaterThan(maxReceiptBytes);
			expect(limit.observedBytes).toBeLessThanOrEqual(target);
			if (limit.observation === "complete")
				expect(limit.observedBytes).toBe(target);
		}
	},
);

it("counts multibyte and escaped metadata bytes at the actual guard, not code units", () => {
	for (const replacement of ["é", "😀", '"', "\0"]) {
		const report = atMetadataBytes(maxMetadataBytes);
		const reader = object(report.reader);
		const padding = reader.syntheticPadding;
		if (typeof padding !== "string")
			throw new Error("Expected synthetic padding");
		reader.syntheticPadding = padding.slice(0, -1) + replacement;
		const originalBytes = jsonl(metadata(report)).byteLength;
		expect(originalBytes).toBeGreaterThan(maxMetadataBytes);
		const emission = serialize(report);
		const limit = outputLimit(emission);
		expect(limit.cause).toBe("metadata-bytes");
		expect(limit.observedBytes).toBeGreaterThan(maxMetadataBytes);
		expect(limit.observedBytes).toBeLessThanOrEqual(originalBytes);
		expect(emission.metadataBytes).toBeLessThan(originalBytes);
		if (limit.observation === "complete")
			expect(limit.observedBytes).toBe(originalBytes);
	}
});

it("counts unknown plain-data extensions as metadata without granting payload or profile authority", () => {
	const report = fixture();
	report.syntheticExtension = {
		profile: "default",
		payload: "bounded",
		flag: false,
	};
	const emission = serialize(report);
	expect(emission.disposition).toBe("complete");
	expect(object(emission.record).syntheticExtension).toEqual(
		report.syntheticExtension,
	);
	measured(emission);
	expect(replay(report).selectedProfile).toBe("long-v1");
	object(report.syntheticExtension).payload = "x".repeat(maxMetadataBytes + 1);
	const limit = outputLimit(serialize(report));
	expect(limit.cause).toBe("metadata-bytes");
});

it("serializes a maximum 4m capture and 256000-byte native-shaped outline with headroom", () => {
	const body = new Uint8Array(4_000_000).fill(97);
	const report = fixture(body);
	const entries = Array.from({ length: 256 }, (_value, index) => ({
		ref: `e1:n${index + 3}`,
		level: 1,
		title: "T".repeat(256),
		titleTruncated: false,
		selector: `#synthetic${index}`,
	}));
	const outline = object(report.headings);
	outline.entries = entries;
	outline.scannedNodes = 1024;
	let remaining = 256_000 - Buffer.byteLength(JSON.stringify(outline));
	for (const entry of entries) {
		const added = Math.min(remaining, 4096 - entry.selector.length);
		entry.selector += "s".repeat(added);
		remaining -= added;
	}
	expect(remaining).toBe(0);
	const markup = entries
		.map((entry) => `<h1 id="${entry.selector.slice(1)}">${entry.title}</h1>`)
		.join("");
	const prefix = new TextEncoder().encode(`<!doctype html>${markup}<!--`);
	body.fill(120);
	body.set(prefix);
	body.set(new TextEncoder().encode("-->"), body.length - 3);
	report.bodyCapture = captureResearchBody(body, "long-v1");
	object(report.primaryResponse).bodySha256 = hash(body);
	object(report.reader).textCodeUnits = 256 * 256;
	object(report.reader).outputCodeUnits = markup.length;
	expect(Buffer.byteLength(JSON.stringify(outline))).toBe(256_000);
	expect(object(report.bodyCapture).data).toHaveLength(5_333_336);
	const emission = serialize(report);
	expect(emission.disposition).toBe("complete");
	expect(emission.receiptBytes).toBeLessThan(maxReceiptBytes);
	measured(emission);
	const result = validateResearchReplayAdmission(
		emission.jsonl,
		authority(emission.jsonl, body),
	);
	expect(result.kind).toBe("validated-capture");
	if (result.kind !== "validated-capture")
		throw new Error("Expected maximum synthetic capture");
	expect(result.body.byteLength).toBe(4_000_000);
	expect(hash(result.body)).toBe(hash(body));
});

it("projects overflow once with exact prior state, identity and classification barrier", () => {
	const report = atMetadataBytes(maxMetadataBytes + 1);
	report.outcome = "semantic-barrier";
	report.contentSuccess = false;
	report.failure = { category: "policy-denied", stage: "semantic-barrier" };
	object(report.classification).barrier = "login";
	const emission = serialize(report);
	const limit = outputLimit(emission);
	expect(limit.prior).toEqual({
		outcome: "semantic-barrier",
		partial: true,
		contentSuccess: false,
		failurePresent: true,
		failureRetention: "retained",
		failure: report.failure,
	});
	expect(limit.omittedPayloads).toEqual(["bodyCapture", "headings"]);
	expect(limit.metadataRetention).toBe("bounded-projection");
	for (const field of [
		"requestedUrl",
		"finalUrl",
		"startedAt",
		"finishedAt",
		"elapsedMs",
		"primaryResponse",
		"selection",
	])
		expect(object(emission.record)[field]).toEqual(report[field]);
	expect(emission.record.classification.barrier).toBe("login");
	expect(emission.record).not.toHaveProperty("reader");
	expect(emission.record).not.toHaveProperty("metrics");
	expect(emission.record.failure).not.toHaveProperty("resourceLimit");
	const raw = emission.jsonl;
	const result = validateResearchReplayAdmission(raw, authority(raw));
	expect(result).toMatchObject({
		kind: "evidence-only",
		reason: "payload-omitted",
		body: null,
		bodyIdentity: null,
	});
});

it("keeps prior null success distinct from the emitted nonzero failure state", () => {
	const report = atMetadataBytes(maxMetadataBytes + 1);
	const emission = serialize(report);
	const limit = outputLimit(emission);
	expect(limit.prior).toEqual({
		outcome: "extracted-unverified",
		partial: true,
		contentSuccess: null,
		failurePresent: false,
		failureRetention: "absent",
	});
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.contentSuccess).toBeNull();
	expect(emission.exitReport.outcome).toBe("failure");
});

it.each([128, 129])(
	"retains prior failure strings exactly through %s code units",
	(length) => {
		for (const field of ["category", "stage"]) {
			const report = atMetadataBytes(maxMetadataBytes + 1);
			report.failure = {
				category: "synthetic",
				stage: "capture",
				[field]: "x".repeat(length),
			};
			const prior = object(outputLimit(serialize(report)).prior);
			expect(prior.failurePresent).toBe(true);
			expect(prior.failureRetention).toBe(
				length === 128 ? "retained" : "omitted-over-bound",
			);
			if (length === 128) expect(prior.failure).toEqual(report.failure);
			else expect(prior).not.toHaveProperty("failure");
		}
	},
);

it.each([1024, 1025])(
	"bounds prior failure by actual escaped JSON bytes at %s",
	(target) => {
		const report = atMetadataBytes(maxMetadataBytes + 1);
		const failure = { category: "\0".repeat(128), stage: "" };
		const remaining = target - Buffer.byteLength(JSON.stringify(failure));
		failure.stage =
			"\0".repeat(Math.floor(remaining / 6)) + "x".repeat(remaining % 6);
		expect(failure.stage.length).toBeLessThanOrEqual(128);
		expect(Buffer.byteLength(JSON.stringify(failure))).toBe(target);
		report.failure = failure;
		const prior = object(outputLimit(serialize(report)).prior);
		expect(prior.failureRetention).toBe(
			target === 1024 ? "retained" : "omitted-over-bound",
		);
		if (target === 1024) expect(prior.failure).toEqual(failure);
		else expect(prior).not.toHaveProperty("failure");
	},
);

it("retains genuine bounded diagnostic fields without fabricating output resource provenance", () => {
	const report = atMetadataBytes(maxMetadataBytes + 1);
	report.failure = {
		category: "resource-limit",
		stage: "reader",
		resourceLimit: {
			kind: "reader.source",
			unit: "code-units",
			limit: 2_000_000,
			observed: 2_000_001,
		},
	};
	const emission = serialize(report);
	expect(object(outputLimit(emission).prior).failure).toEqual(report.failure);
	expect(emission.record.failure).not.toHaveProperty("resourceLimit");
	expect(resourceLimitDiagnostic(emission.record.failure)).toBeUndefined();
});

it("labels early oversized-string observations as lower bounds", () => {
	const report = fixture();
	object(report.reader).syntheticPadding = "\0".repeat(maxMetadataBytes + 1);
	const complete = jsonl(metadata(report)).byteLength;
	const limit = outputLimit(serialize(report));
	expect(limit.observation).toBe("lower-bound");
	expect(limit.observedBytes).toBeGreaterThan(maxMetadataBytes);
	expect(limit.observedBytes).toBeLessThanOrEqual(complete);
});

it("rejects missing, changed, extra or profile-mismatched canonical admission", () => {
	for (const admission of [
		undefined,
		null,
		{},
		{ ...researchLongAdmissionProvenance, schemaVersion: 2 },
		{ ...researchLongAdmissionProvenance, selection: "receipt" },
		{ ...researchLongAdmissionProvenance, profile: "default" },
		{ ...researchLongAdmissionProvenance, extra: true },
		{
			...researchLongAdmissionProvenance,
			codec: { maxDepth: 33, maxProperties: 16384 },
		},
		{
			...researchLongAdmissionProvenance,
			effective: {
				...researchLongDocumentAdmission,
				maxCaptureBytes: 4_000_001,
			},
		},
	]) {
		const report = { ...fixture(), admission };
		rejects(() => serialize(report));
		rejects(() => replay(report));
	}
	rejects(() => serialize(legacy()));
	rejects(() => replay(legacy()));
	rejects(() => replay(fixture(), source, "default"));
});

it.each(["extraction", "textLines"])(
	"rejects the forbidden long payload family %s",
	(field) => {
		const report = fixture();
		report[field] = {};
		rejects(() => serialize(report));
		rejects(() => replay(report));
	},
);

it("rejects invalid required identities instead of manufacturing overflow fallback identities", () => {
	for (const [field, value] of [
		["requestedUrl", "x".repeat(4097)],
		["requestedUrl", null],
		["finalUrl", 1],
		["startedAt", null],
		["finishedAt", {}],
		["elapsedMs", Number.NaN],
		["elapsedMs", Number.POSITIVE_INFINITY],
	]) {
		const report = atMetadataBytes(maxMetadataBytes + 1);
		report[String(field)] = value;
		rejects(() => serialize(report));
	}
});

it("rejects unsafe long graphs without invoking getters, proxies or toJSON", () => {
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	for (const value of [
		new Date(0),
		new Map(),
		new Set(),
		new Uint8Array(1),
		() => undefined,
		Symbol(privateSentinel),
		1n,
		Object.create({ inherited: true }),
		{ toJSON: hook },
		{ toJSON: undefined },
		Object.defineProperty({}, "secret", { get: hook, enumerable: true }),
		new Proxy(
			{},
			{
				get: hook,
				ownKeys: hook,
				getPrototypeOf: hook,
				getOwnPropertyDescriptor: hook,
			},
		),
		revoked.proxy,
	]) {
		const report = fixture();
		report.syntheticUnsafe = value;
		rejects(() => serialize(report));
	}
	const accessor = Object.defineProperty(fixture(), "outcome", { get: hook });
	rejects(() => serialize(accessor));
	rejects(() =>
		serialize(
			new Proxy(fixture(), { get: hook, ownKeys: hook, getPrototypeOf: hook }),
		),
	);
	const symbol = fixture();
	Object.defineProperty(symbol, Symbol(privateSentinel), { value: 1 });
	rejects(() => serialize(symbol));
	expect(hook).not.toHaveBeenCalled();
});

it("rejects object and array cycles as invalid input rather than fabricated byte overflow", () => {
	const record = fixture();
	record.self = record;
	rejects(() => serialize(record));
	const array: unknown[] = [];
	array.push(array);
	const second = fixture();
	second.syntheticCycle = array;
	rejects(() => serialize(second));
});

it("enforces root-depth-zero 32/33 graph limits in real serialization and replay", () => {
	const accepted = fixture();
	accepted.syntheticGraph = nestedObjects(32);
	expect(serialize(accepted).disposition).toBe("complete");
	expect(replay(accepted).kind).toBe("validated-capture");
	const rejected = fixture();
	rejected.syntheticGraph = nestedObjects(33);
	const error = rejects(() => serialize(rejected), "resource-limit");
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	rejects(() => replay(rejected), "resource-limit");
});

it("counts actual object fields and array indices at 16384/16385 without a byte fallback", () => {
	const report = fixture();
	report.syntheticGraph = [];
	const entries = new Array(
		researchEvidenceCodecLimits.maxProperties - countProperties(report),
	).fill(0);
	report.syntheticGraph = entries;
	expect(countProperties(report)).toBe(16384);
	expect(serialize(report).disposition).toBe("complete");
	expect(replay(report).kind).toBe("validated-capture");
	entries.push(0);
	expect(countProperties(report)).toBe(16385);
	rejects(() => serialize(report), "resource-limit");
	rejects(() => replay(report), "resource-limit");
});

it("bounds a defensive sparse array without attempting to materialize its declared length", () => {
	const report = fixture();
	report.syntheticGraph = new Array(1_000_000);
	rejects(() => serialize(report), "resource-limit");
});

it("replays actual codec bytes and real captured bytes using independently computed pins", () => {
	const body = Uint8Array.of(255, 192, 175, 237, 160, 128);
	const report = fixture(body);
	const emission = serialize(report);
	const trusted = authority(emission.jsonl, body);
	const before = emission.jsonl.slice();
	const result = validateResearchReplayAdmission(emission.jsonl, trusted);
	expect(result.kind).toBe("validated-capture");
	if (result.kind !== "validated-capture")
		throw new Error("Expected independently pinned capture");
	expect(result.body).toEqual(body);
	expect(result.bodyIdentity).toEqual({
		bytes: body.length,
		sha256: hash(body),
	});
	expect(result.selectedProfile).toBe("long-v1");
	expect(result.receiptBytes).toBe(before.length);
	expect(result.receiptSha256).toBe(hash(before));
	expect(result.originalMetadata).toEqual(metadata(report));
	expect(result.originalFieldPresence.bodyCapture).toBe(true);
	expect(result.originalFieldPresence["bodyCapture.data"]).toBe(true);
	expect(result.originalFieldPresence["headings.entries"]).toBe(true);
	expect(result.originalMetadata).not.toHaveProperty("bodyCapture.data");
	expect(result.originalMetadata).not.toHaveProperty("headings.entries");
	expect(emission.jsonl).toEqual(before);
	expect(result).not.toHaveProperty("runtimeVerified");
	expect(result).not.toHaveProperty("networkAuthenticated");
});

it("keeps independent replay results and original receipt/capture bytes detached", () => {
	const report = fixture();
	const raw = jsonl(report);
	const trusted = authority(raw);
	const first = validateResearchReplayAdmission(raw, trusted);
	const second = validateResearchReplayAdmission(raw, trusted);
	if (first.kind !== "validated-capture" || second.kind !== "validated-capture")
		throw new Error("Expected synthetic replay bodies");
	expect(first.body.buffer).not.toBe(second.body.buffer);
	expect(first.body.buffer).not.toBe(raw.buffer);
	raw.fill(0);
	first.body.fill(0);
	expect(second.body).toEqual(source);
	expect(decodeResearchBodyCapture(report.bodyCapture, "long-v1")).toEqual(
		source,
	);
	expect(first.originalMetadata).not.toBe(second.originalMetadata);
	expect(first.originalMetadata.primaryResponse).not.toBe(
		second.originalMetadata.primaryResponse,
	);
});

it("requires independent receipt authority and rejects missing or malformed own-data pins", () => {
	const raw = jsonl(fixture());
	const expected = authority(raw);
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const missingProfile = { expectedReceiptSha256: hash(raw) };
	const missingHash = { expectedProfile: "long-v1" };
	for (const trusted of [
		undefined,
		null,
		{},
		missingProfile,
		missingHash,
		{ ...expected, expectedProfile: undefined },
		{ ...expected, expectedProfile: null },
		{ ...expected, expectedProfile: "long" },
		{ ...expected, expectedReceiptSha256: undefined },
		{ ...expected, expectedReceiptSha256: "0".repeat(64) },
		{ ...expected, expectedReceiptSha256: hash(raw).toUpperCase() },
		{ ...expected, expectedReceiptSha256: { toString: hook } },
		Object.create(expected),
		new Proxy(expected, { get: hook, ownKeys: hook, getPrototypeOf: hook }),
		Object.defineProperty({ ...expected }, "expectedProfile", { get: hook }),
		Object.defineProperty({ ...expected }, "expectedReceiptSha256", {
			get: hook,
		}),
	])
		rejects(() =>
			validateResearchReplayAdmission(
				raw,
				trusted as TrustedResearchReplayAdmission,
			),
		);
	expect(hook).not.toHaveBeenCalled();
});

it("binds the receipt hash to exact bytes rather than a reparsed or rewritten record", () => {
	const raw = jsonl(fixture());
	const trusted = authority(raw);
	const changed = raw.slice();
	changed[changed.indexOf(83)] = 84;
	rejects(() => validateResearchReplayAdmission(changed, trusted));
	const legacyRaw = jsonl(legacy());
	const spaced = new Uint8Array([...legacyRaw, 32]);
	rejects(() =>
		validateResearchReplayAdmission(
			spaced,
			authority(legacyRaw, source, "default"),
		),
	);
	expect(
		validateResearchReplayAdmission(
			spaced,
			authority(spaced, source, "default"),
		).kind,
	).toBe("validated-capture");
});

it("accepts canonical provenance keys in different property order without increasing budgets", () => {
	const report = fixture();
	const admission = researchLongAdmissionProvenance;
	report.admission = {
		codec: { maxProperties: 16384, maxDepth: 32 },
		effective: Object.fromEntries(
			Object.entries(admission.effective).reverse(),
		),
		profile: admission.profile,
		selection: admission.selection,
		schemaVersion: admission.schemaVersion,
	};
	expect(replay(report).kind).toBe("validated-capture");
	expect(serialize(report).disposition).toBe("complete");
	const raw = new TextEncoder().encode(
		new TextDecoder()
			.decode(jsonl(report))
			.replace(
				'"maxCaptureBytes":4000000',
				'"maxCaptureBytes":4000000,"maxCaptureBytes":4000001',
			),
	);
	rejects(() => validateResearchReplayAdmission(raw, authority(raw)));
});

it("accepts legacy object whitespace but requires compact single-line LF for long records", () => {
	const long = fixture();
	const compact = JSON.stringify(long);
	for (const text of [
		compact,
		`${compact}\r\n`,
		` ${compact}\n`,
		`${JSON.stringify(long, null, 2)}\n`,
		`\ufeff${compact}\n`,
		`${compact}\n${compact}\n`,
	]) {
		const raw = new TextEncoder().encode(text);
		rejects(() => validateResearchReplayAdmission(raw, authority(raw)));
	}
	const raw = new TextEncoder().encode(
		` \n${JSON.stringify(legacy(), null, 2)}\t\n`,
	);
	expect(
		validateResearchReplayAdmission(raw, authority(raw, source, "default"))
			.kind,
	).toBe("validated-capture");
});

it("rejects invalid UTF8, nonobject JSON, trailing junk and batches with independently matching hashes", () => {
	for (const raw of [
		new Uint8Array(),
		Uint8Array.of(255),
		Uint8Array.of(0xc0, 0xaf),
		...["null", "[]", '"text"', "1", "{}{}", "{}\n{}\n", "{", "{}x"].map(
			(text) => new TextEncoder().encode(text),
		),
	])
		rejects(() =>
			validateResearchReplayAdmission(raw, authority(raw, source, "default")),
		);
});

it("bounds actual raw replay input at 6000000/6000001 bytes even for legacy evidence", () => {
	const raw = new Uint8Array(maxReceiptBytes + 1).fill(32);
	raw[0] = 123;
	raw[1] = 125;
	const exact = raw.subarray(0, maxReceiptBytes);
	const result = validateResearchReplayAdmission(
		exact,
		authority(exact, source, "default"),
	);
	expect(result).toMatchObject({
		kind: "evidence-only",
		reason: "unclassified-legacy-metadata",
	});
	expect(result.receiptBytes).toBe(maxReceiptBytes);
	rejects(
		() =>
			validateResearchReplayAdmission(raw, authority(raw, source, "default")),
		"resource-limit",
	);
});

it("requires intrinsic ordinary-buffer raw bytes and ignores own typed-array shadows", () => {
	const raw = jsonl(fixture());
	const expected = authority(raw);
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const backing = new Uint8Array(raw.length + 4).fill(0xee);
	backing.set(raw, 2);
	const view = backing.subarray(2, raw.length + 2);
	for (const property of [
		"buffer",
		"byteOffset",
		"byteLength",
		"length",
		"slice",
		"subarray",
		"constructor",
		Symbol.iterator,
		Symbol.toStringTag,
	])
		Object.defineProperty(view, property, { get: hook });
	expect(validateResearchReplayAdmission(view, expected).kind).toBe(
		"validated-capture",
	);
	expect(validateResearchReplayAdmission(Buffer.from(raw), expected).kind).toBe(
		"validated-capture",
	);
	const detached = raw.slice();
	structuredClone(detached.buffer, { transfer: [detached.buffer] });
	const shared = new Uint8Array(new SharedArrayBuffer(raw.length));
	shared.set(raw);
	const revoked = Proxy.revocable(raw, {});
	revoked.revoke();
	for (const input of [
		null,
		{},
		raw.buffer,
		new DataView(raw.buffer),
		new Uint8ClampedArray(raw),
		detached,
		shared,
		Object.create(Uint8Array.prototype),
		new Proxy(raw, { get: hook }),
		revoked.proxy,
	])
		rejects(() =>
			validateResearchReplayAdmission(input as Uint8Array, expected),
		);
	expect(hook).not.toHaveBeenCalled();
	expect(backing.subarray(2, raw.length + 2)).toEqual(raw);
});

it.each(["default", "long-v1"] as const)(
	"enforces real capture equality and plus-one replay boundaries under %s",
	(profile) => {
		const cap = profile === "default" ? 2_000_000 : 4_000_000;
		const body = new Uint8Array(cap + 1).fill(97);
		const exact = body.subarray(0, cap);
		const report = profile === "default" ? legacy(exact) : fixture(exact);
		const accepted = replay(report, exact, profile);
		expect(accepted.kind).toBe("validated-capture");
		if (accepted.kind !== "validated-capture")
			throw new Error("Expected exact capture cap");
		expect(accepted.body.byteLength).toBe(cap);
		expect(hash(accepted.body)).toBe(hash(exact));
		report.bodyCapture = {
			encoding: "base64",
			decodedBytes: body.length,
			sha256: hash(body),
			data: Buffer.from(body).toString("base64"),
		};
		object(report.primaryResponse).decodedBytes = body.length;
		object(report.primaryResponse).bodySha256 = hash(body);
		rejects(() => replay(report, body, profile));
	},
);

it("never upgrades the default decoder for a 2m+1 capture based on receipt content", () => {
	const body = new Uint8Array(2_000_001).fill(97);
	const long = fixture(body);
	expect(replay(long, body).kind).toBe("validated-capture");
	Reflect.deleteProperty(long, "admission");
	rejects(() => replay(long, body, "default"));
	rejects(() => replay(long, body, "long-v1"));
});

it("checks independent body pins and primary-response identity rather than trusting receipt hashes", () => {
	const report = fixture();
	const raw = jsonl(report);
	const trusted = authority(raw);
	for (const expectedBody of [
		{ bytes: source.length + 1, sha256: hash(source) },
		{ bytes: source.length, sha256: "0".repeat(64) },
		{ bytes: -1, sha256: hash(source) },
		{ bytes: 1.5, sha256: hash(source) },
		{ bytes: "1", sha256: hash(source) },
		{ bytes: source.length, sha256: hash(source).toUpperCase() },
	])
		rejects(() =>
			validateResearchReplayAdmission(raw, {
				...trusted,
				expectedBody,
			} as TrustedResearchReplayAdmission),
		);
	for (const [field, value] of [
		["decodedBytes", source.length + 1],
		["bodySha256", "0".repeat(64)],
		["url", `${url}/different`],
		["hashScope", "raw-wire"],
	]) {
		const changed = fixture();
		object(changed.primaryResponse)[String(field)] = value;
		rejects(() => replay(changed));
	}
	const changed = fixture();
	changed.finalUrl = `${url}/different`;
	rejects(() => replay(changed));
});

it("uses actual canonical capture decoding for malformed candidate data and schema", () => {
	for (const change of [
		{ data: "!" },
		{ encoding: "BASE64" },
		{ decodedBytes: source.length + 1 },
		{ sha256: "0".repeat(64) },
		{ profile: "long-v1" },
	]) {
		const report = fixture();
		report.bodyCapture = { ...object(report.bodyCapture), ...change };
		rejects(() => replay(report));
	}
	const body = Uint8Array.of(0);
	const report = fixture(body);
	object(report.bodyCapture).data = "AB==";
	rejects(() => replay(report, body));
});

it.each(["failure", "http-failure", "semantic-barrier", "empty-extraction"])(
	"returns evidence-only for %s without certifying deliberately malformed capture bytes",
	(outcome) => {
		const report = fixture();
		report.outcome = outcome;
		report.contentSuccess = false;
		object(report.bodyCapture).data = privateSentinel;
		const result = replay(report);
		expect(result).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
			body: null,
			bodyIdentity: null,
		});
		expect(result.originalMetadata).not.toHaveProperty("bodyCapture.data");
	},
);

it("requires a body pin and distinguishes missing capture without decoding invalid bytes", () => {
	const report = fixture();
	object(report.bodyCapture).data = privateSentinel;
	const raw = jsonl(report);
	const result = validateResearchReplayAdmission(raw, {
		expectedProfile: "long-v1",
		expectedReceiptSha256: hash(raw),
	});
	expect(result).toMatchObject({
		kind: "evidence-only",
		reason: "body-pin-missing",
		body: null,
	});
	Reflect.deleteProperty(report, "bodyCapture");
	expect(replay(report)).toMatchObject({
		kind: "evidence-only",
		reason: "missing-capture",
		body: null,
	});
});

it("does not classify incomplete long heading discovery as a replay-ready capture", () => {
	for (const change of [{ truncated: true }, { entries: [] }]) {
		const report = fixture();
		Object.assign(object(report.headings), change);
		object(report.bodyCapture).data = privateSentinel;
		expect(replay(report)).toMatchObject({
			kind: "evidence-only",
			reason: "discovery-incomplete",
			body: null,
		});
	}
	const absent = fixture();
	Reflect.deleteProperty(absent, "headings");
	expect(replay(absent)).toMatchObject({
		kind: "evidence-only",
		reason: "discovery-incomplete",
	});
});

it("does not certify capture bytes when a nominal-success report retains a failure or barrier", () => {
	for (const field of ["failure", "barrier"]) {
		const report = fixture();
		if (field === "failure")
			report.failure = { category: "policy-denied", stage: "synthetic" };
		else object(report.classification).barrier = "login";
		object(report.bodyCapture).data = privateSentinel;
		const result = replay(report);
		expect(result.kind).toBe("evidence-only");
		expect(result.body).toBeNull();
		expect(result.bodyIdentity).toBeNull();
	}
});

it("rejects getter-backed or non-plain independent body pins without invoking hooks", () => {
	const raw = jsonl(fixture());
	const trusted = authority(raw);
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const pin = { bytes: source.length, sha256: hash(source) };
	for (const expectedBody of [
		null,
		{},
		Object.create(pin),
		Object.defineProperty({ ...pin }, "bytes", { get: hook }),
		Object.defineProperty({ ...pin }, "sha256", { get: hook }),
		new Proxy(pin, { get: hook, getPrototypeOf: hook, ownKeys: hook }),
	])
		rejects(() =>
			validateResearchReplayAdmission(raw, {
				...trusted,
				expectedBody,
			} as TrustedResearchReplayAdmission),
		);
	const accessor = Object.defineProperty({ ...trusted }, "expectedBody", {
		get: hook,
	});
	rejects(() => validateResearchReplayAdmission(raw, accessor));
	expect(hook).not.toHaveBeenCalled();
});

it("requires recorded inactive closed transport and HTML for long replay readiness", () => {
	for (const [field, value] of [
		["closed", false],
		["active", 1],
	] as const) {
		const report = fixture();
		object(report.metrics)[field] = value;
		expect(replay(report)).toMatchObject({
			kind: "evidence-only",
			reason: "discovery-incomplete",
		});
	}
	const report = fixture();
	object(report.primaryResponse).headers = { "content-type": ["text/plain"] };
	rejects(() => replay(report));
});

it.each([["application/xhtml+xml"], ["text/html", "text/html"]])(
	"rejects long replay Content-Type values outside actual reader admission: %j",
	(...contentTypes) => {
		const report = fixture();
		object(report.primaryResponse).headers = { "content-type": contentTypes };
		rejects(() => replay(report));
	},
);

it("accepts long replay HTML casing and parameters using the actual reader MIME rule", () => {
	const report = fixture();
	object(report.primaryResponse).headers = {
		"content-type": ["  TeXt/HtMl ; charset=UTF-8"],
	};
	expect(replay(report).kind).toBe("validated-capture");
});

it("preserves legacy absent/null/false presence and strips all legacy payload families", () => {
	const report = legacy();
	Reflect.deleteProperty(report, "outcome");
	Reflect.deleteProperty(report, "partial");
	Reflect.deleteProperty(report, "contentSuccess");
	Reflect.deleteProperty(report, "reader");
	report.failure = null;
	report.extraction = {
		format: "markdown",
		content: privateSentinel,
		partial: true,
	};
	report.textLines = {
		method: "text-line-discovery",
		entries: [privateSentinel],
		truncated: false,
	};
	const result = replay(report, source, "default");
	expect(result).toMatchObject({
		kind: "evidence-only",
		reason: "unclassified-legacy-metadata",
	});
	expect(result.originalMetadata).toEqual(metadata(report));
	for (const field of ["outcome", "partial", "contentSuccess", "reader"])
		expect(result.originalFieldPresence[field]).toBe(false);
	expect(result.originalFieldPresence.failure).toBe(true);
	expect(result.originalMetadata.failure).toBeNull();
	expect(result.originalFieldPresence["extraction.content"]).toBe(true);
	expect(result.originalFieldPresence["textLines.entries"]).toBe(true);
	expect(result.originalMetadata).not.toHaveProperty("extraction.content");
	expect(result.originalMetadata).not.toHaveProperty("textLines.entries");
	expect(object(result.originalMetadata.textLines).truncated).toBe(false);
});

it.each(["outcome", "partial", "contentSuccess"])(
	"does not repair a legacy receipt missing readiness field %s",
	(field) => {
		const report = legacy();
		delete report[field];
		object(report.bodyCapture).data = privateSentinel;
		expect(replay(report, source, "default")).toMatchObject({
			kind: "evidence-only",
			reason: "unclassified-legacy-metadata",
			body: null,
		});
	},
);

it("does not retrofit legacy capture readiness into heading-only selection", () => {
	const report = legacy();
	Reflect.deleteProperty(report, "headings");
	report.selection = { method: "css-selector", matches: 1 };
	report.extraction = {
		format: "markdown",
		content: "Synthetic",
		partial: true,
	};
	expect(replay(report, source, "default").kind).toBe("validated-capture");
});

it("bounds returned original metadata without silently discarding oversized fields", () => {
	const report = atMetadataBytes(maxMetadataBytes + 1);
	rejects(() => replay(report), "resource-limit");
	Reflect.deleteProperty(report, "admission");
	object(report.reader).syntheticPadding = "x".repeat(maxMetadataBytes + 1);
	rejects(() => replay(report, source, "default"), "resource-limit");
});

it("preserves own metadata names without prototype pollution", () => {
	const report = legacy();
	Reflect.deleteProperty(report, "outcome");
	Object.defineProperty(report, "__proto__", {
		value: { syntheticPollution: true },
		enumerable: true,
	});
	const result = replay(report, source, "default");
	expect(Object.hasOwn(result.originalMetadata, "__proto__")).toBe(true);
	expect(result.originalMetadata.__proto__).toEqual({
		syntheticPollution: true,
	});
	expect({}).not.toHaveProperty("syntheticPollution");
});

const policyReasons = [
	"url-scheme",
	"url-credentials",
	"blocked-port",
	"origin-not-allowed",
	"local-name",
	"literal-address-policy",
	"resolved-address-policy",
	"transport-controlled-header",
	"method-not-allowed",
	"cookie-header-controlled",
	"redirect-mode-error",
	"https-downgrade",
] as const satisfies readonly NetworkPolicyReason[];
const policyPaths = ["failure", "prior"] as const;
type PolicyPath = (typeof policyPaths)[number];
const policyProfiles = ["long-v1", "default"] as const;

function policyFailure(
	reason: NetworkPolicyReason = "resolved-address-policy",
): Fixture {
	return {
		category: "policy-denied",
		stage: "network",
		networkPolicy: { kind: "network-policy-v1", reason },
	};
}

function policyReport(
	failure = policyFailure(),
	path: PolicyPath = "failure",
	profile: ResearchDocumentProfileId = "long-v1",
): Fixture {
	const report = profile === "long-v1" ? fixture() : legacy();
	report.outcome = "failure";
	report.contentSuccess = false;
	report.primaryResponse = null;
	report.finalUrl = null;
	for (const field of ["bodyCapture", "headings", "reader"])
		Reflect.deleteProperty(report, field);
	report.metrics = {
		requests: 1,
		redirects: 0,
		encodedBytes: 0,
		decodedBytes: 0,
		active: 0,
		closed: true,
	};
	report.failure =
		path === "failure"
			? failure
			: { category: "resource-limit", stage: "evidence-output" };
	if (path === "prior") {
		report.outputLimit = {
			cause: "metadata-bytes",
			limitBytes: maxMetadataBytes,
			observedBytes: maxMetadataBytes + 1,
			observation: "complete",
			prior: {
				outcome: "failure",
				partial: true,
				contentSuccess: false,
				failurePresent: true,
				failureRetention: "retained",
				failure,
			},
			omittedPayloads: [],
			metadataRetention: "bounded-projection",
		};
	}
	return report;
}

function policyFailureAt(report: unknown, path: PolicyPath): Fixture {
	const record = object(report);
	return path === "failure"
		? object(record.failure)
		: object(object(object(record.outputLimit).prior).failure);
}

function rejectPolicyEvidence(action: () => unknown) {
	const error = rejects(action);
	expect(error.message).toBe("Invalid research evidence");
	expect(networkPolicyDiagnostic(error)).toBeUndefined();
	return error;
}

function replayPolicyJson(report: Fixture, profile: ResearchDocumentProfileId) {
	const raw = jsonl(report);
	return validateResearchReplayAdmission(raw, {
		expectedProfile: profile,
		expectedReceiptSha256: hash(raw),
	});
}

it.each(policyReasons)(
	"round-trips %s as long failure metadata, not native identity",
	(reason) => {
		const genuine = networkPolicyError(reason);
		const diagnostic = networkPolicyDiagnostic(genuine);
		const failure: Fixture = {
			...policyFailure(reason),
			networkPolicy: diagnostic,
		};
		const report = policyReport(failure);
		const emission = serialize(report);
		expect(emission.disposition).toBe("complete");
		measured(emission);
		expect(emission.metadataBytes).toBe(emission.receiptBytes);
		const result = validateResearchReplayAdmission(emission.jsonl, {
			expectedProfile: "long-v1",
			expectedReceiptSha256: hash(emission.jsonl),
		});
		expect(result).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
			body: null,
			bodyIdentity: null,
		});
		expect(result.originalMetadata.failure).toEqual(failure);
		const parsed = JSON.parse(
			new TextDecoder().decode(emission.jsonl),
		) as Fixture;
		for (const value of [
			object(parsed.failure),
			object(parsed.failure).networkPolicy,
			result.originalMetadata.failure,
			{ cause: genuine },
		])
			expect(networkPolicyDiagnostic(value)).toBeUndefined();
		expect(networkPolicyDiagnostic(genuine)).toBe(diagnostic);
		const originalBytes = emission.jsonl.slice();
		failure.stage = "changed-after-emission";
		expect(emission.record.failure?.stage).toBe("network");
		expect(emission.jsonl).toEqual(originalBytes);
	},
);

it("round-trips a valid default policy fragment without retroactive identity", () => {
	const report = policyReport(policyFailure(), "failure", "default");
	const emission = serialize(report, "default");
	expect(emission.record).toBe(report);
	expect(emission.jsonl).toEqual(jsonl(report));
	expect(emission.metadataBytes).toBeNull();
	const result = validateResearchReplayAdmission(emission.jsonl, {
		expectedProfile: "default",
		expectedReceiptSha256: hash(emission.jsonl),
	});
	expect(result).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		body: null,
		bodyIdentity: null,
	});
	expect(result.originalMetadata.failure).toEqual(report.failure);
	expect(
		networkPolicyDiagnostic(
			object(result.originalMetadata.failure).networkPolicy,
		),
	).toBeUndefined();
});

const malformedPolicyFailures: readonly {
	label: string;
	make: () => Fixture;
}[] = [
	{
		label: "null fragment",
		make: () => ({ ...policyFailure(), networkPolicy: null }),
	},
	{
		label: "string fragment",
		make: () => ({ ...policyFailure(), networkPolicy: "reason" }),
	},
	{
		label: "number fragment",
		make: () => ({ ...policyFailure(), networkPolicy: 1 }),
	},
	{
		label: "boolean fragment",
		make: () => ({ ...policyFailure(), networkPolicy: true }),
	},
	{
		label: "array fragment",
		make: () => ({ ...policyFailure(), networkPolicy: [] }),
	},
	{
		label: "empty fragment",
		make: () => ({ ...policyFailure(), networkPolicy: {} }),
	},
	{
		label: "missing kind",
		make: () => ({
			...policyFailure(),
			networkPolicy: { reason: "local-name" },
		}),
	},
	{
		label: "missing reason",
		make: () => ({
			...policyFailure(),
			networkPolicy: { kind: "network-policy-v1" },
		}),
	},
	{
		label: "wrong kind",
		make: () => ({
			...policyFailure(),
			networkPolicy: { kind: "network-policy-v2", reason: "local-name" },
		}),
	},
	{
		label: "unknown reason",
		make: () => ({
			...policyFailure(),
			networkPolicy: { kind: "network-policy-v1", reason: "unknown" },
		}),
	},
	{
		label: "prototype-name reason",
		make: () => ({
			...policyFailure(),
			networkPolicy: { kind: "network-policy-v1", reason: "__proto__" },
		}),
	},
	{
		label: "numeric reason",
		make: () => ({
			...policyFailure(),
			networkPolicy: { kind: "network-policy-v1", reason: 1 },
		}),
	},
	{
		label: "extra address",
		make: () => ({
			...policyFailure(),
			networkPolicy: {
				kind: "network-policy-v1",
				reason: "local-name",
				address: privateSentinel,
			},
		}),
	},
	{
		label: "extra cause",
		make: () => ({
			...policyFailure(),
			networkPolicy: {
				kind: "network-policy-v1",
				reason: "local-name",
				cause: privateSentinel,
			},
		}),
	},
	{
		label: "wrong category",
		make: () => ({ ...policyFailure(), category: "network-error" }),
	},
	{
		label: "missing category",
		make: () => {
			const failure = policyFailure();
			return {
				stage: failure.stage,
				networkPolicy: failure.networkPolicy,
			};
		},
	},
	{
		label: "missing stage",
		make: () => {
			const failure = policyFailure();
			return {
				category: failure.category,
				networkPolicy: failure.networkPolicy,
			};
		},
	},
	{ label: "numeric stage", make: () => ({ ...policyFailure(), stage: 1 }) },
	{
		label: "null resource co-presence",
		make: () => ({ ...policyFailure(), resourceLimit: null }),
	},
	{
		label: "record resource co-presence",
		make: () => ({
			...policyFailure(),
			resourceLimit: {
				kind: "reader.depth",
				unit: "levels",
				limit: 1,
				observed: 2,
			},
		}),
	},
	{
		label: "numeric kind",
		make: () => ({
			...policyFailure(),
			networkPolicy: { kind: 1, reason: "local-name" },
		}),
	},
	{
		label: "object reason",
		make: () => ({
			...policyFailure(),
			networkPolicy: {
				kind: "network-policy-v1",
				reason: { value: "local-name" },
			},
		}),
	},
];

it.each(malformedPolicyFailures)(
	"rejects reserved $label at both paths and every strict boundary",
	({ make }) => {
		for (const path of policyPaths) {
			const report = policyReport(make(), path);
			rejectPolicyEvidence(() => serialize(report));
			for (const profile of policyProfiles) {
				const received = policyReport(make(), path, profile);
				rejectPolicyEvidence(() => replayPolicyJson(received, profile));
			}
			report.syntheticPadding = "x".repeat(maxMetadataBytes + 1);
			rejectPolicyEvidence(() => serialize(report));
		}
	},
);

it("rejects malformed reserved policy metadata before either replay profile's metadata cap", () => {
	for (const profile of policyProfiles) {
		for (const path of policyPaths) {
			const failure = {
				...policyFailure(),
				networkPolicy: {
					kind: "network-policy-v1",
					reason: "local-name",
					address: privateSentinel,
				},
			};
			const report = policyReport(failure, path, profile);
			report.syntheticPadding = "x".repeat(maxMetadataBytes + 1);
			rejectPolicyEvidence(() => replayPolicyJson(report, profile));
		}
	}
});

const undefinedPolicyFailures = [
	{
		label: "fragment",
		make: () => ({ ...policyFailure(), networkPolicy: undefined }),
		retained: false,
	},
	{
		label: "resource co-presence",
		make: () => ({ ...policyFailure(), resourceLimit: undefined }),
		retained: true,
	},
	{
		label: "extra fragment key",
		make: () => ({
			...policyFailure(),
			networkPolicy: {
				kind: "network-policy-v1",
				reason: "local-name",
				extra: undefined,
			},
		}),
		retained: true,
	},
];

it.each(undefinedPolicyFailures)(
	"checks live undefined $label before long pruning, not after default erasure",
	({ make, retained }) => {
		for (const path of policyPaths) {
			rejectPolicyEvidence(() => serialize(policyReport(make(), path)));
			const report = policyReport(make(), path, "default");
			const emission = serialize(report, "default");
			expect(emission.jsonl).toEqual(jsonl(report));
			const result = validateResearchReplayAdmission(emission.jsonl, {
				expectedProfile: "default",
				expectedReceiptSha256: hash(emission.jsonl),
			});
			expect(result).toMatchObject({
				kind: "evidence-only",
				reason: path === "prior" ? "payload-omitted" : "native-failure",
				body: null,
				bodyIdentity: null,
			});
			expect(
				Object.hasOwn(
					policyFailureAt(result.originalMetadata, path),
					"networkPolicy",
				),
			).toBe(retained);
		}
	},
);

it.each(["getter", "proxy", "nonplain", "symbol", "cycle", "toJSON"])(
	"retains safe long snapshot rejection for a reserved %s fragment without hooks",
	(kind) => {
		let reads = 0;
		const inspect = () => {
			reads++;
			throw new Error(privateSentinel);
		};
		const fragment = { kind: "network-policy-v1", reason: "local-name" };
		let value: unknown = fragment;
		if (kind === "getter")
			Object.defineProperty(fragment, "reason", { get: inspect });
		else if (kind === "proxy")
			value = new Proxy(fragment, {
				get: inspect,
				getPrototypeOf: inspect,
				ownKeys: inspect,
			});
		else if (kind === "nonplain")
			value = Object.assign(Object.create({ inherited: true }), fragment);
		else if (kind === "symbol")
			Object.defineProperty(fragment, Symbol("extra"), {
				value: privateSentinel,
			});
		else if (kind === "cycle") Object.assign(fragment, { self: fragment });
		else Object.assign(fragment, { toJSON: inspect });
		for (const path of policyPaths) {
			const failure = { ...policyFailure(), networkPolicy: value };
			rejectPolicyEvidence(() => serialize(policyReport(failure, path)));
		}
		expect(reads).toBe(0);
	},
);

it.each([maxMetadataBytes, maxMetadataBytes + 1])(
	"counts the policy fragment and escaped UTF8/LF at metadata boundary %s",
	(target) => {
		const report = policyReport({
			...policyFailure(),
			stage: 'network-é\n\0"',
		});
		report.syntheticPadding = "";
		report.syntheticPadding = "x".repeat(
			target - jsonl(metadata(report)).byteLength,
		);
		expect(jsonl(metadata(report)).byteLength).toBe(target);
		const emission = serialize(report);
		measured(emission);
		if (target === maxMetadataBytes) {
			expect(emission.disposition).toBe("complete");
			expect(emission.metadataBytes).toBe(target);
		} else {
			const limit = outputLimit(emission);
			expect(limit.cause).toBe("metadata-bytes");
			expect(limit.observedBytes).toBeGreaterThan(maxMetadataBytes);
			expect(limit.observedBytes).toBeLessThanOrEqual(target);
			if (limit.observation === "complete")
				expect(limit.observedBytes).toBe(target);
			expect(object(limit.prior).failure).toEqual(report.failure);
		}
		expect(emission.jsonl[emission.jsonl.length - 1]).toBe(10);
	},
);

it("projects a valid policy failure only into bounded prior metadata on overflow", () => {
	const failure: Fixture = {
		...policyFailure("https-downgrade"),
		stage: 'network-é\n\0"',
		extra: "ordinary enclosing metadata",
	};
	const report = policyReport(failure);
	report.syntheticPadding = "x".repeat(maxMetadataBytes);
	const before = structuredClone(report);
	const originalBytes = jsonl(metadata(report)).byteLength;
	const emission = serialize(report);
	const limit = outputLimit(emission);
	const retained = object(object(limit.prior).failure);
	expect(limit.cause).toBe("metadata-bytes");
	expect(limit.observedBytes).toBeGreaterThan(maxMetadataBytes);
	expect(limit.observedBytes).toBeLessThanOrEqual(originalBytes);
	expect(retained).toEqual({
		category: failure.category,
		stage: failure.stage,
		networkPolicy: failure.networkPolicy,
	});
	expect(Buffer.byteLength(JSON.stringify(retained))).toBeLessThanOrEqual(1024);
	expect(object(limit.prior).failureRetention).toBe("retained");
	expect(emission.record.failure).not.toHaveProperty("networkPolicy");
	expect(emission.record.failure).not.toHaveProperty("resourceLimit");
	for (const value of [
		emission.record.failure,
		retained,
		retained.networkPolicy,
	]) {
		expect(networkPolicyDiagnostic(value)).toBeUndefined();
		expect(resourceLimitDiagnostic(value)).toBeUndefined();
	}
	const result = validateResearchReplayAdmission(emission.jsonl, {
		expectedProfile: "long-v1",
		expectedReceiptSha256: hash(emission.jsonl),
	});
	expect(result).toMatchObject({
		kind: "evidence-only",
		reason: "payload-omitted",
		body: null,
		bodyIdentity: null,
	});
	expect(policyFailureAt(result.originalMetadata, "prior")).toEqual(retained);
	expect(result.originalMetadata).toEqual(metadata(emission.record));
	expect(report).toEqual(before);
	const bytes = emission.jsonl.slice();
	failure.stage = "mutated after emission";
	expect(emission.jsonl).toEqual(bytes);
	expect(retained.stage).toBe(object(before.failure).stage);
});

it.each([128, 129])(
	"retains the entire policy prior only through stage length %s",
	(length) => {
		const report = policyReport({
			...policyFailure(),
			stage: "é".repeat(length),
		});
		report.syntheticPadding = "x".repeat(maxMetadataBytes);
		const prior = object(outputLimit(serialize(report)).prior);
		expect(prior.failurePresent).toBe(true);
		expect(prior.failureRetention).toBe(
			length === 128 ? "retained" : "omitted-over-bound",
		);
		if (length === 128) expect(prior.failure).toEqual(report.failure);
		else expect(prior).not.toHaveProperty("failure");
		expect(prior).not.toHaveProperty("networkPolicy");
	},
);

it.each(policyProfiles)(
	"admits valid nested policy metadata under %s without reprojecting received outputLimit",
	(profile) => {
		const report = policyReport(policyFailure(), "prior", profile);
		const emission = serialize(report, profile);
		expect(emission.disposition).toBe("complete");
		const result = replayPolicyJson(report, profile);
		expect(result).toMatchObject({
			kind: "evidence-only",
			reason: "payload-omitted",
			body: null,
			bodyIdentity: null,
		});
		expect(result.originalMetadata.outputLimit).toEqual(report.outputLimit);
		expect(policyFailureAt(result.originalMetadata, "prior")).toEqual(
			policyFailure(),
		);
		expect(
			networkPolicyDiagnostic(
				policyFailureAt(result.originalMetadata, "prior").networkPolicy,
			),
		).toBeUndefined();
	},
);

it.each([
	{
		label: "known",
		diagnostic: {
			kind: "reader.source",
			unit: "code-units",
			limit: 8,
			observed: 9,
		},
		retained: true,
	},
	{
		label: "unknown kind and unit with observed below limit",
		diagnostic: {
			kind: "legacy-kind",
			unit: "legacy-unit",
			limit: 9,
			observed: 0,
		},
		retained: true,
	},
	{
		label: "malformed resource-only",
		diagnostic: {
			kind: "legacy-kind",
			unit: "",
			limit: "invalid",
			observed: 0,
		},
		retained: false,
	},
])(
	"preserves legacy $label resource-only behavior without a policy fragment",
	({ diagnostic, retained }) => {
		const failure = {
			category: "resource-limit",
			stage: "loader",
			resourceLimit: diagnostic,
		};
		const report = policyReport(failure);
		expect(serialize(report).disposition).toBe("complete");
		for (const profile of policyProfiles) {
			const result = replayPolicyJson(
				policyReport(failure, "failure", profile),
				profile,
			);
			expect(result).toMatchObject({
				kind: "evidence-only",
				reason: "native-failure",
				body: null,
			});
			expect(result.originalMetadata.failure).toEqual(failure);
		}
		report.syntheticPadding = "x".repeat(maxMetadataBytes);
		const prior = object(outputLimit(serialize(report)).prior);
		expect(prior.failureRetention).toBe(
			retained ? "retained" : "omitted-over-bound",
		);
		if (retained) expect(prior.failure).toEqual(failure);
		else expect(prior).not.toHaveProperty("failure");
	},
);

it("does not traverse ordinary extensions or tighten enclosing failures without the reserved fragment", () => {
	const failure = {
		category: "legacy-category",
		stage: "network",
		extra: "ordinary",
	};
	for (const profile of policyProfiles) {
		const report = policyReport(failure, "failure", profile);
		report.extension = { networkPolicy: { address: privateSentinel } };
		const emission = serialize(report, profile);
		measured(emission);
		expect(emission.disposition).toBe("complete");
		const result = replayPolicyJson(report, profile);
		expect(result).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
			body: null,
		});
		expect(result.originalMetadata.failure).toEqual(failure);
		expect(result.originalMetadata.extension).toEqual(report.extension);
	}
});

it("keeps trusted default stringify permissive while replay rejects the new reserved malformed extension", () => {
	const failure = {
		...policyFailure(),
		networkPolicy: {
			kind: "network-policy-v1",
			reason: "local-name",
			address: privateSentinel,
		},
	};
	const report = policyReport(failure, "failure", "default");
	const emission = serialize(report, "default");
	expect(emission.record).toBe(report);
	expect(emission.jsonl).toEqual(jsonl(report));
	expect(emission.metadataBytes).toBeNull();
	expect(emission.disposition).toBe("complete");
	rejectPolicyEvidence(() =>
		validateResearchReplayAdmission(emission.jsonl, {
			expectedProfile: "default",
			expectedReceiptSha256: hash(emission.jsonl),
		}),
	);
});
