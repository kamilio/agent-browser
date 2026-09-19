import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type ResearchLoaderLimitAdmission,
	type TrustedResearchReplayAdmission,
	researchLongAdmissionProvenance,
	validateResearchEmptyOutlineAdmission,
	validateResearchLoaderLimitAdmission,
	validateResearchOutputLimitSectionAdmission,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import { NodeNetworkTransport } from "./node-transport.js";
import {
	type ResourceLimitKind,
	resourceLimitDiagnostic,
	resourceLimitError,
} from "./resource-limit.js";

type DataRecord = Record<string, unknown>;
type Mutation = { name: string; path: string; value?: unknown; remove?: true };

const requestedUrl = "https://loader-admission.fixture.invalid/start?redacted";
const finalUrl = "https://loader-admission.fixture.invalid/thread?redacted";
const timestamp = "2026-09-18T09:00:00.000Z";
const html = `<!doctype html><html><body><main id="owned"><h1>Owned discussion</h1><p>Beginning of synthetic discussion.</p>${"<p>Owned comment: café, λ, and a complete source paragraph.</p>".repeat(2400)}<p>Final synthetic comment survives capture.</p></main></body></html>`;
const source = new TextEncoder().encode(html);
const ownedBodies = new Set<Uint8Array>();

function unexpectedRequest(): never {
	throw new Error("Admission fixtures must not request network resources");
}

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn(unexpectedRequest));
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockImplementation(
		unexpectedRequest,
	);
});

afterEach(() => {
	for (const body of ownedBodies) body.fill(0);
	ownedBodies.clear();
	try {
		expect(fetch).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function serialize(report: unknown): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(report)}\n`);
}

function child(report: DataRecord, field: string): DataRecord {
	return report[field] as DataRecord;
}

function mutate(report: DataRecord, mutation: Mutation): void {
	const fields = mutation.path.split(".");
	const name = fields.pop() as string;
	let target = report;
	for (const field of fields) target = child(target, field);
	if (mutation.remove) Reflect.deleteProperty(target, name);
	else target[name] = mutation.value;
}

function fixture(diagnostic = false): DataRecord {
	return {
		readerFallbackEncoding: "utf-8",
		readerRawPolicy: "separate-omitted-raw-v1",
		readerVisibilityPolicy: "source-hidden-inline-v1",
		requestedUrl,
		finalUrl,
		startedAt: timestamp,
		finishedAt: timestamp,
		elapsedMs: 0,
		profile: "native-semantic-reader-v1",
		partial: true,
		contentSuccess: false,
		outcome: "failure",
		classification: {
			classifier: "browser-challenges",
			barrier: null,
			diagnostic: null,
		},
		failure: {
			category: "resource-limit",
			stage: "loader",
			...(diagnostic
				? {
						resourceLimit: {
							...resourceLimitDiagnostic(
								resourceLimitError("reader.depth", 128, 129, "Synthetic limit"),
							),
						},
					}
				: {}),
		},
		primaryResponse: {
			url: finalUrl,
			status: 200,
			receivedAt: timestamp,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			decodedBytes: source.byteLength,
			encodedBytes: source.byteLength,
			bodySha256: hash(source),
			hashScope: "transport-decoded-body-before-loader",
			redirects: 1,
			elapsedMs: 0,
		},
		bodyCapture: captureResearchBody(source),
		metrics: {
			requests: 2,
			redirects: 1,
			encodedBytes: source.byteLength,
			decodedBytes: source.byteLength,
			active: 0,
			closed: true,
		},
	};
}

function authority(raw: Uint8Array): TrustedResearchReplayAdmission {
	return {
		expectedProfile: "default",
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: source.byteLength, sha256: hash(source) },
	};
}

function admit(
	raw: Uint8Array,
	trusted = authority(raw),
): ResearchLoaderLimitAdmission {
	const admitted = validateResearchLoaderLimitAdmission(raw, trusted);
	ownedBodies.add(admitted.body);
	return admitted;
}

it.each([false, true])(
	"explicitly admits an intact query-redacted loader receipt (diagnostic: %s)",
	(diagnostic) => {
		const report = fixture(diagnostic);
		const raw = serialize(report);
		const original = raw.slice();
		const admitted = admit(raw);
		expect(admitted).toMatchObject({
			kind: "validated-capture",
			selectedProfile: "default",
			receiptBytes: raw.byteLength,
			receiptSha256: hash(raw),
			bodyIdentity: { bytes: source.byteLength, sha256: hash(source) },
			recovery: {
				kind: "captured-loader-limit",
				originalOutcome: "failure",
				originalContentSuccess: false,
				originalFailure: report.failure,
				originalRequestRetried: false,
			},
			originalMetadata: {
				requestedUrl,
				finalUrl,
				outcome: "failure",
				contentSuccess: false,
				failure: report.failure,
				primaryResponse: report.primaryResponse,
				metrics: { active: 0, closed: true },
			},
			originalFieldPresence: {
				failure: true,
				navigation: false,
				reader: false,
				selection: false,
				headings: false,
				extraction: false,
				textLines: false,
				bodyCapture: true,
				"bodyCapture.data": true,
			},
		});
		expect(admitted.body).toEqual(source);
		expect(new TextDecoder().decode(admitted.body)).toBe(html);
		expect(Object.hasOwn(admitted.originalMetadata, "reader")).toBe(false);
		expect(Object.hasOwn(admitted.originalMetadata, "navigation")).toBe(false);
		expect(admitted.originalMetadata.bodyCapture).not.toHaveProperty("data");
		expect(
			Object.hasOwn(admitted.recovery.originalFailure, "resourceLimit"),
		).toBe(diagnostic);
		expect(Object.isFrozen(admitted)).toBe(true);
		expect(Object.isFrozen(admitted.recovery)).toBe(true);
		expect(Object.isFrozen(admitted.recovery.originalFailure)).toBe(true);
		expect(Object.isFrozen(admitted.originalMetadata)).toBe(true);
		expect(Object.isFrozen(admitted.originalFieldPresence)).toBe(true);
		if (diagnostic)
			expect(
				Object.isFrozen(admitted.recovery.originalFailure.resourceLimit),
			).toBe(true);
		admitted.body.fill(0);
		expect(admit(raw).body).toEqual(source);
		expect(raw).toEqual(original);
		expect(serialize(report)).toEqual(original);
	},
);

it.each([false, true])(
	"ordinary and established recovery admission do not recover loader failures (%s)",
	(diagnostic) => {
		const raw = serialize(fixture(diagnostic));
		const trusted = authority(raw);
		expect(validateResearchReplayAdmission(raw, trusted)).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
			body: null,
			bodyIdentity: null,
			originalMetadata: { outcome: "failure", contentSuccess: false },
		});
		expect(() =>
			validateResearchOutputLimitSectionAdmission(raw, trusted),
		).toThrow();
		expect(() => validateResearchEmptyOutlineAdmission(raw, trusted)).toThrow();
	},
);

it.each([
	{ method: "css-selector", matches: null },
	{ method: "heading-section", matches: null },
	{ method: "heading-outline" },
	{ method: "text-line-discovery" },
	{ method: "text-lines", start: 1, end: 5 },
	{ method: "json-pointer", pointer: "" },
])(
	"preserves pending selection without inventing its result: $method",
	(selection) => {
		const report = fixture();
		report.selection = selection;
		const admitted = admit(serialize(report));
		expect(admitted.originalMetadata.selection).toEqual(selection);
		expect(admitted.originalFieldPresence.selection).toBe(true);
		expect(admitted.originalFieldPresence.extraction).toBe(false);
	},
);

it.each(["selected-response-headers-v1", "selected-response-headers-v2"])(
	"accepts validated %s header evidence without changing it",
	(kind) => {
		const report = fixture();
		const primary = child(report, "primaryResponse");
		primary.headerCapture = {
			kind,
			partial: true,
			omitted: ["content-length"],
		};
		child(primary, "headers")["content-type"] = ["Text/HTML; charset=UTF-8"];
		primary.status = 201;
		expect(admit(serialize(report)).originalMetadata.primaryResponse).toEqual(
			primary,
		);
	},
);

it.each<ResourceLimitKind>([
	"reader.depth",
	"reader.source",
	"html.tokens",
	"document.nodes",
])("preserves canonical %s diagnostic units and zero limits", (kind) => {
	const report = fixture();
	const diagnostic = resourceLimitDiagnostic(
		resourceLimitError(kind, 0, 1, "Synthetic limit"),
	);
	child(report, "failure").resourceLimit = diagnostic;
	expect(
		admit(serialize(report)).recovery.originalFailure.resourceLimit,
	).toEqual(diagnostic);
});

const mutations: Mutation[] = [
	...[
		"requestedUrl",
		"finalUrl",
		"startedAt",
		"finishedAt",
		"elapsedMs",
		"profile",
		"partial",
		"outcome",
		"contentSuccess",
		"failure",
		"classification",
		"metrics",
		"primaryResponse",
		"bodyCapture",
	].map((path) => ({ name: `missing ${path}`, path, remove: true as const })),
	{ name: "native profile", path: "profile", value: "native" },
	{ name: "completed outcome", path: "outcome", value: "extracted-unverified" },
	{ name: "HTTP failure", path: "outcome", value: "http-failure" },
	{ name: "complete report", path: "partial", value: false },
	{ name: "unknown content success", path: "contentSuccess", value: null },
	{ name: "claimed content success", path: "contentSuccess", value: true },
	{ name: "different failure", path: "failure.category", value: "unsupported" },
	{
		name: "different failure stage",
		path: "failure.stage",
		value: "extraction",
	},
	{ name: "transport failure", path: "failure.stage", value: "navigation" },
	{ name: "missing failure stage", path: "failure.stage", remove: true },
	{
		name: "extra failure field",
		path: "failure.message",
		value: "Synthetic error",
	},
	{
		name: "contradictory network policy",
		path: "failure.networkPolicy",
		value: { kind: "network-policy-v1", reason: "private-address" },
	},
	{
		name: "wrong classifier",
		path: "classification.classifier",
		value: "unknown",
	},
	{ name: "missing barrier", path: "classification.barrier", remove: true },
	{
		name: "missing classifier diagnostic",
		path: "classification.diagnostic",
		remove: true,
	},
	{
		name: "classification diagnostic",
		path: "classification.diagnostic",
		value: {},
	},
	...["challenge", "login", "access-denied", "javascript-required"].map(
		(value) => ({
			name: `${value} barrier`,
			path: "classification.barrier",
			value,
		}),
	),
	{ name: "active transport", path: "metrics.active", value: 1 },
	{ name: "open transport", path: "metrics.closed", value: false },
	{ name: "missing active count", path: "metrics.active", remove: true },
	{ name: "missing closed state", path: "metrics.closed", remove: true },
	{ name: "missing capture data", path: "bodyCapture.data", remove: true },
	{ name: "missing capture", path: "bodyCapture", value: null },
	{
		name: "truncated capture data",
		path: "bodyCapture.data",
		value: Buffer.from(source.subarray(0, -1)).toString("base64"),
	},
	{
		name: "altered capture data",
		path: "bodyCapture.data",
		value: Buffer.from(new Uint8Array(source.length).fill(65)).toString(
			"base64",
		),
	},
	{
		name: "incorrect capture hash",
		path: "bodyCapture.sha256",
		value: "0".repeat(64),
	},
	{
		name: "incorrect capture size",
		path: "bodyCapture.decodedBytes",
		value: source.byteLength - 1,
	},
	{
		name: "noncanonical capture encoding",
		path: "bodyCapture.encoding",
		value: "utf-8",
	},
	{ name: "extra capture field", path: "bodyCapture.truncated", value: true },
	{ name: "missing primary response", path: "primaryResponse", value: null },
	{
		name: "incorrect primary hash",
		path: "primaryResponse.bodySha256",
		value: "0".repeat(64),
	},
	{
		name: "incorrect primary byte count",
		path: "primaryResponse.decodedBytes",
		value: source.byteLength - 1,
	},
	{
		name: "incorrect hash scope",
		path: "primaryResponse.hashScope",
		value: "loader-output",
	},
	{
		name: "primary URL mismatch",
		path: "primaryResponse.url",
		value: requestedUrl,
	},
	{
		name: "unredacted final URL mismatch",
		path: "finalUrl",
		value: "https://loader-admission.fixture.invalid/thread?id=synthetic",
	},
	{
		name: "non-HTTP URL",
		path: "requestedUrl",
		value: "file:///synthetic.html",
	},
	{ name: "invalid receipt timestamp", path: "startedAt", value: "yesterday" },
	{
		name: "missing MIME",
		path: "primaryResponse.headers.content-type",
		remove: true,
	},
	{
		name: "ambiguous MIME",
		path: "primaryResponse.headers.content-type",
		value: ["text/html", "text/plain"],
	},
	{
		name: "non-string MIME",
		path: "primaryResponse.headers.content-type",
		value: [200],
	},
	{
		name: "non-array MIME",
		path: "primaryResponse.headers.content-type",
		value: "text/html",
	},
	...[
		"text/plain",
		"text/markdown",
		"application/json",
		"application/xhtml+xml",
	].map((value) => ({
		name: `${value} response`,
		path: "primaryResponse.headers.content-type",
		value: [value],
	})),
	...[199, 300, 404, 429, 503].map((value) => ({
		name: `HTTP ${value}`,
		path: "primaryResponse.status",
		value,
	})),
	{
		name: "unselected legacy header",
		path: "primaryResponse.headers.retry-after",
		value: ["120"],
	},
	{
		name: "invalid header capture version",
		path: "primaryResponse.headerCapture",
		value: { kind: "unknown", partial: true, omitted: [] },
	},
	{
		name: "contradictory omitted MIME",
		path: "primaryResponse.headerCapture",
		value: {
			kind: "selected-response-headers-v2",
			partial: true,
			omitted: ["content-type"],
		},
	},
	{
		name: "invalid omitted header",
		path: "primaryResponse.headerCapture",
		value: {
			kind: "selected-response-headers-v2",
			partial: true,
			omitted: ["set-cookie"],
		},
	},
	{
		name: "incomplete header capture declaration",
		path: "primaryResponse.headerCapture",
		value: {
			kind: "selected-response-headers-v2",
			partial: false,
			omitted: [],
		},
	},
	{
		name: "strategy metadata",
		path: "documentStrategy",
		value: { policy: "native-reader-fallback-v1", mode: "native" },
	},
	{
		name: "long admission metadata",
		path: "admission",
		value: researchLongAdmissionProvenance,
	},
	...[
		"rateLimit",
		"serviceBackoff",
		"outputLimit",
		"navigation",
		"reader",
		"extraction",
		"headings",
		"textLines",
		"links",
	].flatMap((path) =>
		[null, {}].map((value) => ({
			name: `present ${path}: ${JSON.stringify(value)}`,
			path,
			value,
		})),
	),
	{
		name: "completed selector",
		path: "selection",
		value: { method: "css-selector", matches: 1 },
	},
	{
		name: "completed empty selector",
		path: "selection",
		value: { method: "css-selector", matches: 0 },
	},
	{
		name: "completed heading section",
		path: "selection",
		value: { method: "heading-section", matches: 1 },
	},
	{
		name: "missing pending selector state",
		path: "selection",
		value: { method: "css-selector" },
	},
	{ name: "null selection", path: "selection", value: null },
	{
		name: "completed discovery selection",
		path: "selection",
		value: { method: "heading-outline", entries: [] },
	},
	{
		name: "unknown selection",
		path: "selection",
		value: { method: "unknown" },
	},
];

it.each(mutations)("rejects a re-pinned receipt with $name", (mutation) => {
	const report = fixture();
	mutate(report, mutation);
	const raw = serialize(report);
	const original = raw.slice();
	expect(() => admit(raw)).toThrow();
	expect(raw).toEqual(original);
});

it.each<Mutation>([
	{ name: "null diagnostic", path: "resourceLimit", value: null },
	{ name: "unknown kind", path: "resourceLimit.kind", value: "reader.unknown" },
	{ name: "wrong unit", path: "resourceLimit.unit", value: "bytes" },
	{ name: "missing unit", path: "resourceLimit.unit", remove: true },
	{ name: "extra diagnostic field", path: "resourceLimit.extra", value: true },
	{ name: "negative limit", path: "resourceLimit.limit", value: -1 },
	{ name: "fractional limit", path: "resourceLimit.limit", value: 0.5 },
	{ name: "string limit", path: "resourceLimit.limit", value: "128" },
	{ name: "equal observation", path: "resourceLimit.observed", value: 128 },
	{
		name: "under-limit observation",
		path: "resourceLimit.observed",
		value: 127,
	},
	{
		name: "fractional observation",
		path: "resourceLimit.observed",
		value: 129.5,
	},
	{
		name: "unsafe observation",
		path: "resourceLimit.observed",
		value: Number.MAX_SAFE_INTEGER + 1,
	},
])("rejects noncanonical resource diagnostics: $name", (mutation) => {
	const report = fixture(true);
	mutate(child(report, "failure"), mutation);
	expect(() => admit(serialize(report))).toThrow();
});

it.each<Mutation>([
	{ name: "missing receipt pin", path: "expectedReceiptSha256", remove: true },
	{
		name: "incorrect receipt pin",
		path: "expectedReceiptSha256",
		value: "0".repeat(64),
	},
	{ name: "missing body pin", path: "expectedBody", remove: true },
	{ name: "missing body hash", path: "expectedBody.sha256", remove: true },
	{
		name: "incorrect body hash",
		path: "expectedBody.sha256",
		value: "0".repeat(64),
	},
	{
		name: "incorrect body size",
		path: "expectedBody.bytes",
		value: source.byteLength - 1,
	},
	{ name: "long profile", path: "expectedProfile", value: "long-v1" },
	{ name: "missing profile", path: "expectedProfile", remove: true },
	{
		name: "strategy authority",
		path: "expectedDocumentStrategy",
		value: "native-reader-fallback-v1",
	},
])("rejects invalid caller authority: $name", (mutation) => {
	const raw = serialize(fixture());
	const trusted = authority(raw);
	mutate(trusted as unknown as DataRecord, mutation);
	expect(() => admit(raw, trusted)).toThrow();
});

it("rejects a fully pinned shorter body substituted for the original response", () => {
	const report = fixture();
	const prefix = source.subarray(0, source.length - 32);
	report.bodyCapture = captureResearchBody(prefix);
	const raw = serialize(report);
	expect(() =>
		admit(raw, {
			...authority(raw),
			expectedBody: { bytes: prefix.byteLength, sha256: hash(prefix) },
		}),
	).toThrow();
});

it("rejects otherwise valid long-profile failure evidence", () => {
	const report = fixture();
	report.admission = researchLongAdmissionProvenance;
	report.selection = { method: "heading-outline" };
	const raw = serialize(report);
	const trusted: TrustedResearchReplayAdmission = {
		...authority(raw),
		expectedProfile: "long-v1",
	};
	expect(validateResearchReplayAdmission(raw, trusted)).toMatchObject({
		kind: "evidence-only",
		reason: "native-failure",
		selectedProfile: "long-v1",
	});
	expect(() => admit(raw, trusted)).toThrow();
});

it("rejects byte changes even when the parsed receipt is equivalent", () => {
	const raw = serialize(fixture());
	const altered = new Uint8Array(raw.length + 1);
	altered.set(raw);
	altered[raw.length] = 32;
	expect(() => admit(altered, authority(raw))).toThrow();
});

it.each([
	new Uint8Array([255]),
	new TextEncoder().encode("{}\n{}\n"),
	serialize(null),
	serialize([]),
])("rejects malformed or non-record receipt bytes: %j", (raw) => {
	expect(() => admit(raw)).toThrow();
});
