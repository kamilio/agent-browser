import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
	type ResearchReplayAdmission,
	type TrustedResearchReplayAdmission,
	researchLongAdmissionProvenance,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import * as bodyCapture from "../scripts/research-body-capture.js";

const url = "https://research.example/synthetic";
const timestamp = "2026-09-06T00:00:00.000Z";
const source = new TextEncoder().encode(
	"<h1 id=synthetic>Synthetic heading</h1>",
);

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function fixture() {
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
			decodedBytes: source.byteLength,
			encodedBytes: source.byteLength,
			bodySha256: hash(source),
			hashScope: "transport-decoded-body-before-loader",
			redirects: 0,
			elapsedMs: 0,
		},
		bodyCapture: bodyCapture.captureResearchBody(source, "long-v1"),
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
			sourceCodeUnits: source.byteLength,
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
			encodedBytes: source.byteLength,
			decodedBytes: source.byteLength,
			active: 0,
			closed: true,
		},
		admission: researchLongAdmissionProvenance,
	};
}

function authority(raw: Uint8Array): TrustedResearchReplayAdmission {
	return {
		expectedProfile: "long-v1",
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: source.byteLength, sha256: hash(source) },
	};
}

function observeDecoder(capture: bodyCapture.ResearchBodyCapture) {
	const allocate = vi.spyOn(Buffer, "from");
	let decoded: Uint8Array | undefined;
	let error: unknown;
	let allocations: Buffer[] = [];
	try {
		decoded = bodyCapture.decodeResearchBodyCapture(capture);
	} catch (caught) {
		error = caught;
	} finally {
		allocations = allocate.mock.results.map((result) => result.value as Buffer);
		allocate.mockRestore();
	}
	return { decoded, error, allocations };
}

function observeAdmission(
	raw: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
) {
	const decode = vi.spyOn(bodyCapture, "decodeResearchBodyCapture");
	let result: ResearchReplayAdmission | undefined;
	let error: unknown;
	let decoded: Uint8Array | undefined;
	let calls = 0;
	try {
		result = validateResearchReplayAdmission(raw, trusted);
	} catch (caught) {
		error = caught;
	} finally {
		calls = decode.mock.calls.length;
		decoded = decode.mock.results[0]?.value as Uint8Array | undefined;
		decode.mockRestore();
	}
	return { result, error, decoded, calls };
}

it("clears the decoder temporary buffer while returning an independent unchanged copy", () => {
	const original = source.slice();
	const capture = bodyCapture.captureResearchBody(original);
	const before = structuredClone(capture);
	const { decoded, error, allocations } = observeDecoder(capture);
	expect(error).toBeUndefined();
	expect(allocations).toHaveLength(1);
	expect(allocations[0]).toEqual(Buffer.alloc(source.byteLength));
	expect(decoded).toEqual(source);
	expect(decoded?.buffer).not.toBe(allocations[0].buffer);
	expect(decoded?.buffer).not.toBe(original.buffer);
	allocations[0].fill(255);
	expect(decoded).toEqual(source);
	decoded?.fill(0);
	expect(original).toEqual(source);
	expect(capture).toEqual(before);
});

it.each(["digest", "noncanonical", "length"])(
	"clears the decoder temporary buffer on internal %s failure without changing caller input",
	(failure) => {
		const original = Uint8Array.of(65);
		const capture = bodyCapture.captureResearchBody(original);
		if (failure === "digest") capture.sha256 = "0".repeat(64);
		if (failure === "noncanonical") capture.data = "QR==";
		if (failure === "length") capture.decodedBytes = 2;
		const before = structuredClone(capture);
		const { decoded, error, allocations } = observeDecoder(capture);
		expect(decoded).toBeUndefined();
		expect(error).toMatchObject({
			code: "invalid-input",
			message: "Invalid research body capture",
		});
		expect(allocations).toHaveLength(1);
		expect(allocations[0]).toEqual(Buffer.alloc(1));
		expect(capture).toEqual(before);
		expect(original).toEqual(Uint8Array.of(65));
	},
);

it.each(["digest", "length"])(
	"clears decoded admission storage on external body-pin %s mismatch without changing caller data",
	(mismatch) => {
		const report = fixture();
		const changed =
			mismatch === "length" ? new Uint8Array([...source, 65]) : source.slice();
		if (mismatch === "digest") changed[0] = 65;
		report.bodyCapture = bodyCapture.captureResearchBody(changed, "long-v1");
		expect(
			bodyCapture.decodeResearchBodyCapture(report.bodyCapture, "long-v1"),
		).toEqual(changed);
		const raw = new TextEncoder().encode(`${JSON.stringify(report)}\n`);
		const trusted = authority(raw);
		const before = structuredClone({ report, raw, trusted, changed });
		const { result, error, decoded, calls } = observeAdmission(raw, trusted);
		expect(calls).toBe(1);
		expect(result).toBeUndefined();
		expect(error).toMatchObject({
			code: "invalid-input",
			message: "Invalid research evidence",
		});
		expect(decoded).toEqual(new Uint8Array(changed.byteLength));
		expect({ report, raw, trusted, changed }).toEqual(before);
	},
);

it("transfers successful admission storage unchanged and detached from caller data", () => {
	const report = fixture();
	const raw = new TextEncoder().encode(`${JSON.stringify(report)}\n`);
	const trusted = authority(raw);
	const before = structuredClone({ report, raw, trusted });
	const { result, error, decoded, calls } = observeAdmission(raw, trusted);
	expect(calls).toBe(1);
	expect(error).toBeUndefined();
	expect(result?.kind).toBe("validated-capture");
	if (result?.kind !== "validated-capture")
		throw new Error("Expected synthetic capture ownership transfer");
	expect(result.body).toBe(decoded);
	expect(result.body).toEqual(source);
	expect(result.body.buffer).not.toBe(raw.buffer);
	expect(result.bodyIdentity).toEqual(trusted.expectedBody);
	expect(Object.isFrozen(result)).toBe(true);
	result.body.fill(0);
	expect({ report, raw, trusted }).toEqual(before);
	expect(
		bodyCapture.decodeResearchBodyCapture(report.bodyCapture, "long-v1"),
	).toEqual(source);
});
