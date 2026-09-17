import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	type ResearchReplayAdmission,
	type TrustedResearchReplayAdmission,
	researchLongAdmissionProvenance,
	validateResearchEmptyOutlineAdmission,
	validateResearchOutputLimitSectionAdmission,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import { captureResearchBody } from "../scripts/research-body-capture.js";
import * as documentLoader from "./document-loader.js";
import * as nodeSafeJs from "./node-safejs.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as fallbackLoader from "./research-fallback-loader.js";
import * as researchLoader from "./research-loader.js";
import type { ResearchReaderReport } from "./research-reader-info.js";
import { SafeJsRuntime } from "./safejs.js";

type DataRecord = Record<string, unknown>;
type Mode = "native" | "reader";
type Admission = typeof validateResearchReplayAdmission;
type Mutation = { name: string; path: string; value?: unknown; remove?: true };

const policy = "native-reader-fallback-v1";
const modes = ["native", "reader"] as const;
const url = "https://strategy-replay-admission.fixture.invalid/article";
const timestamp = "2026-09-17T09:00:00.000Z";
const title = "Synthetic admission heading";
const html = `<h1 id="owned">${title}</h1>`;
const source = new TextEncoder().encode(html);
const ownedBodies = new Set<Uint8Array>();
const resourceDiagnostic = {
	kind: "document.depth",
	unit: "levels",
	limit: 128,
	observed: 129,
};

function unexpectedExecution(): never {
	throw new Error(
		"Admission must not load documents, execute scripts, or fetch",
	);
}

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn(unexpectedExecution));
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockImplementation(
		unexpectedExecution,
	);
	vi.spyOn(documentLoader, "loadBrowserDocument").mockImplementation(
		unexpectedExecution,
	);
	vi.spyOn(
		fallbackLoader,
		"loadNativeReaderFallbackDocument",
	).mockImplementation(unexpectedExecution);
	vi.spyOn(nodeSafeJs, "loadSafeJsSdk").mockImplementation(unexpectedExecution);
	vi.spyOn(researchLoader, "loadResearchDocument").mockImplementation(
		unexpectedExecution,
	);
	vi.spyOn(nodeSafeJs, "createSafeJsRuntime").mockImplementation(
		unexpectedExecution,
	);
	vi.spyOn(SafeJsRuntime.prototype, "evaluate").mockImplementation(
		unexpectedExecution,
	);
});

afterEach(() => {
	for (const body of ownedBodies) body.fill(0);
	ownedBodies.clear();
	try {
		expect(fetch).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
		expect(documentLoader.loadBrowserDocument).not.toHaveBeenCalled();
		expect(
			fallbackLoader.loadNativeReaderFallbackDocument,
		).not.toHaveBeenCalled();
		expect(nodeSafeJs.loadSafeJsSdk).not.toHaveBeenCalled();
		expect(researchLoader.loadResearchDocument).not.toHaveBeenCalled();
		expect(nodeSafeJs.createSafeJsRuntime).not.toHaveBeenCalled();
		expect(SafeJsRuntime.prototype.evaluate).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function serialize(report: DataRecord): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(report)}\n`);
}

function child(report: DataRecord, name: string): DataRecord {
	return report[name] as DataRecord;
}

function mutate(report: DataRecord, mutation: Mutation): void {
	const fields = mutation.path.split(".");
	const name = fields.pop() as string;
	let target = report;
	for (const field of fields) target = child(target, field);
	if (mutation.remove) Reflect.deleteProperty(target, name);
	else target[name] = mutation.value;
}

function fixture(
	mode: Mode,
	format: "markdown" | "json" = "markdown",
): DataRecord {
	const reader = {
		profile: "native-semantic-reader-v1",
		partial: true,
		scripting: false,
		styling: false,
		rawTextPolicy: "separate-omitted-raw-v1",
		visibilityPolicy: "source-hidden-inline-v1",
		fallbackEncoding: "utf-8",
		encoding: "utf-8",
		hiddenContentSemantics: "source-attributes-and-inline-display",
		sourceHiddenSubtrees: 0,
		sourceCodeUnits: html.length,
		textCodeUnits: title.length,
		outputCodeUnits: html.length,
		tokens: 3,
		omittedTokens: 0,
		omittedSubtrees: {},
		ignoredAttributes: 0,
		unwrappedElements: 0,
		tokenizerIssues: 0,
		omittedRaw: {
			codeUnits: 0,
			workUnits: 0,
			steps: 0,
			elements: 0,
			maxWorkUnits: 32_000_000,
			maxWindowCodeUnits: 65_536,
		},
	} satisfies ResearchReaderReport;
	return {
		requestedUrl: url,
		finalUrl: url,
		startedAt: timestamp,
		finishedAt: timestamp,
		elapsedMs: 0,
		profile: mode === "native" ? "native" : "native-semantic-reader-v1",
		partial: true,
		contentSuccess: null,
		outcome: "extracted-unverified",
		classification: {
			classifier: "browser-challenges",
			barrier: null,
			diagnostic: null,
		},
		documentStrategy: {
			policy,
			mode,
			...(mode === "reader"
				? { nativeFailure: { category: "unsupported", stage: "loader" } }
				: {}),
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
		bodyCapture: captureResearchBody(source, "default"),
		extraction: {
			document: "e1",
			scope: "e1:n0",
			url,
			title: "",
			revision: 0,
			partial: true,
			format,
			content:
				format === "markdown"
					? `# ${title}\n`
					: {
							ref: "e1:n0",
							type: "container",
							children: [
								{
									ref: "e1:n3",
									type: "heading",
									level: 1,
									children: [{ ref: "e1:n4", type: "text", text: title }],
								},
							],
						},
			...(mode === "reader" ? { reader: { ...reader } } : {}),
		},
		metrics: {
			requests: 1,
			redirects: 0,
			encodedBytes: source.byteLength,
			decodedBytes: source.byteLength,
			active: 0,
			closed: true,
		},
		...(mode === "reader"
			? {
					reader,
					readerRawPolicy: reader.rawTextPolicy,
					readerVisibilityPolicy: reader.visibilityPolicy,
					readerFallbackEncoding: reader.fallbackEncoding,
				}
			: {}),
	};
}

function authority(raw: Uint8Array): TrustedResearchReplayAdmission {
	return {
		expectedProfile: "default",
		expectedReceiptSha256: hash(raw),
		expectedBody: { bytes: source.byteLength, sha256: hash(source) },
		expectedDocumentStrategy: policy,
	};
}

function admit(
	raw: Uint8Array,
	trusted: TrustedResearchReplayAdmission = authority(raw),
	validate: Admission = validateResearchReplayAdmission,
): ResearchReplayAdmission {
	const result = validate(raw, trusted);
	if (result.kind === "validated-capture") ownedBodies.add(result.body);
	return result;
}

function expectCapture(raw: Uint8Array, trusted = authority(raw)) {
	const result = admit(raw, trusted);
	expect(result.kind).toBe("validated-capture");
	if (result.kind !== "validated-capture")
		throw new Error("Expected synthetic capture admission");
	expect(result.body).toEqual(source);
	expect(result.bodyIdentity).toEqual({
		bytes: source.byteLength,
		sha256: hash(source),
	});
	return result;
}

function expectRejected(
	raw: Uint8Array,
	trusted = authority(raw),
	code: "invalid-input" | "unsupported" = "invalid-input",
	validate: Admission = validateResearchReplayAdmission,
): void {
	const original = raw.slice();
	expect(() => admit(raw, trusted, validate)).toThrowError(
		expect.objectContaining({ name: "AgentBrowserError", code }),
	);
	expect(raw).toEqual(original);
}

it.each(
	modes.flatMap((mode) =>
		["markdown", "json"].map((format) => ({
			mode,
			format: format as "markdown" | "json",
		})),
	),
)(
	"admits explicitly trusted synthetic $mode / $format receipts without execution",
	({ mode, format }) => {
		const report = fixture(mode, format);
		const raw = serialize(report);
		const result = expectCapture(raw);
		expect(result.selectedProfile).toBe("default");
		expect(result.receiptBytes).toBe(raw.byteLength);
		expect(result.receiptSha256).toBe(hash(raw));
		expect(result.documentStrategy).toEqual(report.documentStrategy);
		expect(result.originalMetadata.documentStrategy).toEqual(
			report.documentStrategy,
		);
		expect(result.originalMetadata.profile).toBe(report.profile);
		expect(result.originalMetadata.outcome).toBe("extracted-unverified");
		expect(result.originalMetadata.contentSuccess).toBeNull();
		expect(result.originalFieldPresence.documentStrategy).toBe(true);
		expect(result.originalFieldPresence["bodyCapture.data"]).toBe(true);
		expect(result.originalFieldPresence["extraction.content"]).toBe(true);
		expect(child(result.originalMetadata, "bodyCapture")).not.toHaveProperty(
			"data",
		);
		expect(child(result.originalMetadata, "extraction")).not.toHaveProperty(
			"content",
		);
		expect(raw).toEqual(serialize(report));
	},
);

it.each(modes)(
	"freezes original %s metadata and owns independent decoded bodies",
	(mode) => {
		const report = fixture(mode);
		if (mode === "reader") {
			child(report, "documentStrategy").nativeFailure = {
				category: "resource-limit",
				stage: "loader",
				resourceLimit: { ...resourceDiagnostic },
			};
		}
		const raw = serialize(report);
		const original = raw.slice();
		const trusted = authority(raw);
		const first = expectCapture(raw, trusted);
		const second = expectCapture(raw, trusted);
		for (const value of [
			first,
			first.bodyIdentity,
			first.originalMetadata,
			first.originalFieldPresence,
			first.documentStrategy,
			first.originalMetadata.documentStrategy,
		]) {
			expect(Object.isFrozen(value)).toBe(true);
		}
		if (mode === "reader") {
			expect(Object.isFrozen(first.documentStrategy?.nativeFailure)).toBe(true);
			expect(
				Object.isFrozen(first.documentStrategy?.nativeFailure?.resourceLimit),
			).toBe(true);
		}
		expect(first.body.buffer).not.toBe(raw.buffer);
		expect(first.body.buffer).not.toBe(source.buffer);
		expect(first.body.buffer).not.toBe(second.body.buffer);
		expect(
			Reflect.set(first.documentStrategy as object, "mode", "changed"),
		).toBe(false);
		child(report, "documentStrategy").mode = "changed";
		(trusted.expectedBody as { bytes: number }).bytes = 0;
		expect(first.documentStrategy?.mode).toBe(mode);
		expect(first.bodyIdentity.bytes).toBe(source.byteLength);
		first.body.fill(0);
		expect(second.body).toEqual(source);
		expect(raw).toEqual(original);
		expect(source).toEqual(new TextEncoder().encode(html));
		raw.fill(0);
		expect(second.body).toEqual(source);
		expect(first.originalMetadata.documentStrategy).toEqual(
			second.documentStrategy,
		);
	},
);

it.each([
	{ name: "unknown", value: "future" },
	{ name: "wrong case", value: "NATIVE-READER-FALLBACK-V1" },
	{ name: "padded", value: ` ${policy}` },
	{ name: "empty", value: "" },
	{ name: "null", value: null },
	{ name: "false", value: false },
	{ name: "number", value: 1 },
	{ name: "undefined own property", value: undefined },
	{ name: "array", value: [policy] },
	{ name: "object", value: { policy } },
])("rejects strict host strategy value: $name", ({ value }) => {
	const raw = serialize(fixture("native"));
	expectRejected(raw, {
		...authority(raw),
		expectedDocumentStrategy: value,
	} as TrustedResearchReplayAdmission);
});

it("does not coerce a host strategy object or invoke its accessor", () => {
	const trap = vi.fn(unexpectedExecution);
	const raw = serialize(fixture("native"));
	const trusted = {
		...authority(raw),
		expectedDocumentStrategy: { toString: trap },
	};
	expectRejected(raw, trusted as unknown as TrustedResearchReplayAdmission);
	Object.defineProperty(trusted, "expectedDocumentStrategy", { get: trap });
	expectRejected(raw, trusted as unknown as TrustedResearchReplayAdmission);
	expect(trap).not.toHaveBeenCalled();
});

it.each(modes)("requires a strategy tag with explicit trust on %s", (mode) => {
	const report = fixture(mode);
	Reflect.deleteProperty(report, "documentStrategy");
	expectRejected(serialize(report));
});

it.each(modes)(
	"rejects explicit strategy trust with long-v1 for %s",
	(mode) => {
		const raw = serialize(fixture(mode));
		expectRejected(raw, { ...authority(raw), expectedProfile: "long-v1" });
	},
);

it.each([
	{ name: "null", value: null },
	{ name: "boolean", value: false },
	{ name: "number", value: 0 },
	{ name: "string", value: policy },
	{ name: "array", value: [] },
	{ name: "empty record", value: {} },
	{ name: "missing policy", value: { mode: "native" } },
	{ name: "missing mode", value: { policy } },
	{ name: "unknown policy", value: { policy: "future", mode: "native" } },
	{ name: "unknown mode", value: { policy, mode: "auto" } },
	{ name: "extra field", value: { policy, mode: "native", extra: true } },
	{
		name: "native with failure",
		value: { policy, mode: "native", nativeFailure: null },
	},
	{ name: "reader without failure", value: { policy, mode: "reader" } },
])("rejects malformed captured strategy: $name", ({ value }) => {
	const report = fixture("native");
	report.documentStrategy = value;
	expectRejected(serialize(report));
});

it.each([
	{ name: "null", value: null },
	{ name: "array", value: [] },
	{ name: "empty", value: {} },
	{ name: "missing category", value: { stage: "loader" } },
	{ name: "missing stage", value: { category: "unsupported" } },
	{ name: "network category", value: { category: "network", stage: "loader" } },
	{ name: "aborted category", value: { category: "aborted", stage: "loader" } },
	{
		name: "wrong stage",
		value: { category: "unsupported", stage: "extraction" },
	},
	{
		name: "extra field",
		value: { category: "unsupported", stage: "loader", extra: true },
	},
	{
		name: "unsupported with diagnostic",
		value: {
			category: "unsupported",
			stage: "loader",
			resourceLimit: resourceDiagnostic,
		},
	},
])("rejects malformed nativeFailure: $name", ({ value }) => {
	const report = fixture("reader");
	child(report, "documentStrategy").nativeFailure = value;
	expectRejected(serialize(report));
});

it.each([false, true])(
	"admits resource-limit fallback with optional diagnostic present=%s",
	(withDiagnostic) => {
		const report = fixture("reader");
		const failure = {
			category: "resource-limit",
			stage: "loader",
			...(withDiagnostic ? { resourceLimit: { ...resourceDiagnostic } } : {}),
		};
		child(report, "documentStrategy").nativeFailure = failure;
		const result = expectCapture(serialize(report));
		expect(result.documentStrategy?.nativeFailure).toEqual(failure);
	},
);

it.each([
	{ name: "null", value: null },
	{ name: "array", value: [] },
	{
		name: "missing unit",
		value: { kind: "document.depth", limit: 128, observed: 129 },
	},
	{ name: "extra field", value: { ...resourceDiagnostic, extra: true } },
	{ name: "unknown kind", value: { ...resourceDiagnostic, kind: "future" } },
	{ name: "wrong unit", value: { ...resourceDiagnostic, unit: "bytes" } },
	{ name: "negative limit", value: { ...resourceDiagnostic, limit: -1 } },
	{ name: "fractional limit", value: { ...resourceDiagnostic, limit: 1.5 } },
	{
		name: "equal observation",
		value: { ...resourceDiagnostic, observed: 128 },
	},
	{
		name: "lower observation",
		value: { ...resourceDiagnostic, observed: 127 },
	},
	{
		name: "fractional observation",
		value: { ...resourceDiagnostic, observed: 129.5 },
	},
	{
		name: "unsafe observation",
		value: { ...resourceDiagnostic, observed: Number.MAX_SAFE_INTEGER + 1 },
	},
])("validates the resource diagnostic: $name", ({ value }) => {
	const report = fixture("reader");
	child(report, "documentStrategy").nativeFailure = {
		category: "resource-limit",
		stage: "loader",
		resourceLimit: value,
	};
	expectRejected(serialize(report));
});

const commonMutations: Mutation[] = [
	{ name: "open transport", path: "metrics.closed", value: false },
	{ name: "active request", path: "metrics.active", value: 1 },
	{ name: "missing metrics", path: "metrics", remove: true },
	{ name: "missing extraction", path: "extraction", remove: true },
	{
		name: "complete extraction flag",
		path: "extraction.partial",
		value: false,
	},
	{
		name: "unknown extraction format",
		path: "extraction.format",
		value: "text",
	},
	{
		name: "selection override",
		path: "selection",
		value: { method: "css-selector", matches: 1 },
	},
	{ name: "heading discovery", path: "headings", value: {} },
	{ name: "literal text discovery", path: "textLines", value: {} },
	{ name: "content focus", path: "contentFocus", value: "main-content-v1" },
	{ name: "output prefix", path: "outputLimitPolicy", value: "text-prefix-v1" },
	{
		name: "MIME override",
		path: "readerMimePolicy",
		value: "markdown-html-document-v1",
	},
	{
		name: "source link labels",
		path: "sourceLinkLabelPolicy",
		value: "source-aria-label-v1",
	},
	{
		name: "source heading labels",
		path: "sourceHeadingPolicy",
		value: "source-aria-heading-v1",
	},
];

it.each(
	modes.flatMap((mode) =>
		commonMutations.map((mutation) => ({ mode, ...mutation })),
	),
)("rejects inconsistent $mode capture: $name", ({ mode, ...mutation }) => {
	const report = fixture(mode);
	mutate(report, mutation);
	expectRejected(serialize(report));
});

it.each([
	{
		name: "reader profile",
		path: "profile",
		value: "native-semantic-reader-v1",
	},
	{ name: "reader report", path: "reader", value: {} },
	{ name: "reader extraction", path: "extraction.reader", value: {} },
	{
		name: "raw policy",
		path: "readerRawPolicy",
		value: "separate-omitted-raw-v1",
	},
	{
		name: "visibility policy",
		path: "readerVisibilityPolicy",
		value: "source-hidden-inline-v1",
	},
	{ name: "fallback encoding", path: "readerFallbackEncoding", value: "utf-8" },
])("rejects native capture with $name", (mutation) => {
	const report = fixture("native");
	mutate(report, mutation);
	expectRejected(serialize(report));
});

const readerMutations: Mutation[] = [
	{ name: "native profile", path: "profile", value: "native" },
	{ name: "missing reader", path: "reader", remove: true },
	{ name: "missing raw policy", path: "readerRawPolicy", remove: true },
	{ name: "wrong raw policy", path: "readerRawPolicy", value: "future" },
	{
		name: "wrong visibility policy",
		path: "readerVisibilityPolicy",
		value: "source-hidden-v1",
	},
	{
		name: "wrong fallback encoding",
		path: "readerFallbackEncoding",
		value: "windows-1252",
	},
	{ name: "reader profile", path: "reader.profile", value: "native" },
	{ name: "reader partial flag", path: "reader.partial", value: false },
	{ name: "scripting enabled", path: "reader.scripting", value: true },
	{ name: "styling enabled", path: "reader.styling", value: true },
	{ name: "reader raw policy", path: "reader.rawTextPolicy", value: "future" },
	{
		name: "reader visibility policy",
		path: "reader.visibilityPolicy",
		value: "source-hidden-v1",
	},
	{
		name: "reader fallback encoding",
		path: "reader.fallbackEncoding",
		value: "windows-1252",
	},
	{
		name: "hidden semantics",
		path: "reader.hiddenContentSemantics",
		value: false,
	},
	{
		name: "negative hidden count",
		path: "reader.sourceHiddenSubtrees",
		value: -1,
	},
	{
		name: "fractional hidden count",
		path: "reader.sourceHiddenSubtrees",
		value: 0.5,
	},
	{ name: "missing actual encoding", path: "reader.encoding", remove: true },
	{ name: "empty actual encoding", path: "reader.encoding", value: "" },
	{
		name: "overlong actual encoding",
		path: "reader.encoding",
		value: "x".repeat(129),
	},
	{
		name: "reader MIME policy",
		path: "reader.mimePolicy",
		value: "markdown-html-document-v1",
	},
	{
		name: "reader MIME interpretation",
		path: "reader.mimeInterpretation",
		value: {},
	},
	{
		name: "reader source headings",
		path: "reader.sourceHeadingPolicy",
		value: "source-aria-heading-v1",
	},
];

it.each(readerMutations)(
	"enforces fixed reader metadata even when extraction agrees: $name",
	(mutation) => {
		const report = fixture("reader");
		mutate(report, mutation);
		child(report, "extraction").reader = report.reader;
		expectRejected(serialize(report));
	},
);

it.each([
	{ name: "missing", value: undefined },
	{ name: "null", value: null },
	{ name: "different actual encoding", value: { encoding: "windows-1252" } },
	{ name: "different counter", value: { sourceHiddenSubtrees: 1 } },
	{ name: "extra field", value: { extra: true } },
])("requires matching extraction.reader: $name", ({ value }) => {
	const report = fixture("reader");
	const extraction = child(report, "extraction");
	if (value === undefined) Reflect.deleteProperty(extraction, "reader");
	else
		extraction.reader =
			value === null ? null : { ...child(report, "reader"), ...value };
	expectRejected(serialize(report));
});

it("preserves declared actual reader encoding separately from UTF-8 fallback", () => {
	const report = fixture("reader");
	child(child(report, "primaryResponse"), "headers")["content-type"] = [
		"text/html; charset=windows-1252",
	];
	child(report, "reader").encoding = "windows-1252";
	child(child(report, "extraction"), "reader").encoding = "windows-1252";
	const result = expectCapture(serialize(report));
	expect(child(result.originalMetadata, "reader")).toMatchObject({
		encoding: "windows-1252",
		fallbackEncoding: "utf-8",
	});
});

it.each(modes)("accepts normalized HTML MIME on %s", (mode) => {
	const report = fixture(mode);
	child(child(report, "primaryResponse"), "headers")["content-type"] = [
		" Text/HTML ; charset=utf-8",
	];
	expectCapture(serialize(report));
});

const invalidMimes = [
	{ name: "missing", value: undefined },
	{ name: "empty list", value: [] },
	{ name: "multiple", value: ["text/html", "text/html"] },
	{ name: "plain text", value: ["text/plain"] },
	{ name: "Markdown", value: ["text/markdown"] },
	{ name: "XHTML", value: ["application/xhtml+xml"] },
	{ name: "string instead of list", value: "text/html" },
];

it.each(
	modes.flatMap((mode) => invalidMimes.map((mime) => ({ mode, ...mime }))),
)("rejects $mode MIME: $name", ({ mode, value }) => {
	const report = fixture(mode);
	const headers = child(child(report, "primaryResponse"), "headers");
	if (value === undefined) Reflect.deleteProperty(headers, "content-type");
	else headers["content-type"] = value;
	expectRejected(serialize(report));
});

it.each([200, 201, 206, 299])(
	"retains native complete 2xx status %s",
	(status) => {
		const report = fixture("native");
		child(report, "primaryResponse").status = status;
		expectCapture(serialize(report));
	},
);

it.each(
	modes.flatMap((mode) =>
		[199, 300, 403, 429, 503].map((status) => ({ mode, status })),
	),
)(
	"rejects $mode status $status despite success metadata",
	({ mode, status }) => {
		const report = fixture(mode);
		child(report, "primaryResponse").status = status;
		expectRejected(serialize(report));
	},
);

it.each([201, 206, 299])(
	"reader fallback excludes non-200 2xx status %s",
	(status) => {
		const report = fixture("reader");
		child(report, "primaryResponse").status = status;
		expectRejected(serialize(report));
	},
);

const evidenceOnlyMutations: (Mutation & { reason: string })[] = [
	{
		name: "failed outcome",
		path: "outcome",
		value: "failure",
		reason: "native-failure",
	},
	{
		name: "empty outcome",
		path: "outcome",
		value: "empty-extraction",
		reason: "native-failure",
	},
	{
		name: "barrier outcome",
		path: "outcome",
		value: "semantic-barrier",
		reason: "native-failure",
	},
	{
		name: "HTTP failure outcome",
		path: "outcome",
		value: "http-failure",
		reason: "native-failure",
	},
	{
		name: "explicit failure",
		path: "failure",
		value: { category: "unsupported", stage: "loader" },
		reason: "native-failure",
	},
	{
		name: "false success",
		path: "contentSuccess",
		value: false,
		reason: "native-failure",
	},
	{
		name: "challenge",
		path: "classification.barrier",
		value: "challenge",
		reason: "native-failure",
	},
	{
		name: "login",
		path: "classification.barrier",
		value: "login",
		reason: "native-failure",
	},
	{
		name: "access denied",
		path: "classification.barrier",
		value: "access-denied",
		reason: "native-failure",
	},
	{
		name: "rate limit",
		path: "rateLimit",
		value: {
			kind: "http-rate-limit",
			status: 429,
			url,
			receivedAt: timestamp,
			action: "stop-without-retry",
		},
		reason: "native-failure",
	},
	{
		name: "service backoff",
		path: "serviceBackoff",
		value: {
			kind: "http-service-backoff",
			status: 503,
			url,
			receivedAt: timestamp,
			action: "stop-without-retry",
			retryAfter: {
				kind: "delay-seconds",
				delaySeconds: 60,
				retryAt: "2026-09-17T09:01:00.000Z",
			},
		},
		reason: "native-failure",
	},
	{
		name: "null backoff presence",
		path: "serviceBackoff",
		value: null,
		reason: "native-failure",
	},
	{
		name: "missing outcome",
		path: "outcome",
		remove: true,
		reason: "unclassified-legacy-metadata",
	},
	{
		name: "unknown outcome",
		path: "outcome",
		value: "success",
		reason: "unclassified-legacy-metadata",
	},
	{
		name: "missing partial",
		path: "partial",
		remove: true,
		reason: "unclassified-legacy-metadata",
	},
	{
		name: "false partial",
		path: "partial",
		value: false,
		reason: "unclassified-legacy-metadata",
	},
	{
		name: "missing content success",
		path: "contentSuccess",
		remove: true,
		reason: "unclassified-legacy-metadata",
	},
	{
		name: "true content success",
		path: "contentSuccess",
		value: true,
		reason: "unclassified-legacy-metadata",
	},
	{
		name: "missing classification",
		path: "classification",
		remove: true,
		reason: "unclassified-legacy-metadata",
	},
	{
		name: "missing barrier",
		path: "classification.barrier",
		remove: true,
		reason: "unclassified-legacy-metadata",
	},
	{
		name: "missing capture",
		path: "bodyCapture",
		remove: true,
		reason: "missing-capture",
	},
	{
		name: "null capture",
		path: "bodyCapture",
		value: null,
		reason: "missing-capture",
	},
	{
		name: "output-limit evidence",
		path: "outputLimit",
		value: { cause: "receipt-bytes", omittedPayloads: ["bodyCapture"] },
		reason: "payload-omitted",
	},
];

it.each(
	modes.flatMap((mode) =>
		evidenceOnlyMutations.map((mutation) => ({ mode, ...mutation })),
	),
)(
	"never admits decoded $mode content for $name",
	({ mode, reason, ...mutation }) => {
		const report = fixture(mode);
		mutate(report, mutation);
		const raw = serialize(report);
		const result = admit(raw);
		expect(result).toMatchObject({
			kind: "evidence-only",
			reason,
			body: null,
			bodyIdentity: null,
		});
		expect(result.documentStrategy).toEqual(report.documentStrategy);
		expect(result.originalMetadata.outcome).toBe(report.outcome);
		expect(raw).toEqual(serialize(report));
	},
);

it.each(modes)("keeps unpinned %s captures evidence-only", (mode) => {
	const raw = serialize(fixture(mode));
	const { expectedBody: _expectedBody, ...trusted } = authority(raw);
	expect(admit(raw, trusted)).toMatchObject({
		kind: "evidence-only",
		reason: "body-pin-missing",
		body: null,
		bodyIdentity: null,
	});
});

it.each(modes)("still refuses unopted %s strategy receipts", (mode) => {
	const raw = serialize(fixture(mode));
	const { expectedDocumentStrategy: _expectedDocumentStrategy, ...trusted } =
		authority(raw);
	expectRejected(raw, trusted, "unsupported");
});

const recoveries = [
	{
		name: "output-limit section",
		validate: validateResearchOutputLimitSectionAdmission,
	},
	{ name: "empty outline", validate: validateResearchEmptyOutlineAdmission },
];

it.each(
	modes.flatMap((mode) =>
		recoveries.map((recovery) => ({ mode, ...recovery })),
	),
)(
	"keeps $mode / $name recovery unsupported even with explicit trust",
	({ mode, validate }) => {
		const raw = serialize(fixture(mode));
		expectRejected(raw, authority(raw), "unsupported", validate);
	},
);

it.each(modes)(
	"checks %s receipt hash before strategy refusal and parsing",
	(mode) => {
		const report = fixture(mode);
		const raw = serialize(report);
		const trusted = {
			...authority(raw),
			expectedReceiptSha256: "0".repeat(64),
		};
		const { expectedDocumentStrategy: _expectedDocumentStrategy, ...unopted } =
			trusted;
		expectRejected(raw, unopted);
		for (const { validate } of recoveries)
			expectRejected(raw, trusted, "invalid-input", validate);
		report.documentStrategy = null;
		expect(() => admit(serialize(report), trusted)).toThrowError(
			"Invalid research evidence",
		);
		const malformedJson = new TextEncoder().encode("{not-json");
		expectRejected(malformedJson, trusted);
	},
);

it.each(modes)(
	"checks %s body pin and receipt changes independently",
	(mode) => {
		const report = fixture(mode);
		const raw = serialize(report);
		const trusted = authority(raw);
		expectRejected(raw, {
			...trusted,
			expectedBody: { bytes: source.byteLength + 1, sha256: hash(source) },
		});
		expectRejected(raw, {
			...trusted,
			expectedBody: { bytes: source.byteLength, sha256: "0".repeat(64) },
		});
		child(report, "primaryResponse").bodySha256 = "0".repeat(64);
		expectRejected(serialize(report), trusted);
		expectRejected(serialize(report));
	},
);

it.each([
	{ name: "missing data", path: "bodyCapture.data", remove: true as const },
	{ name: "invalid base64", path: "bodyCapture.data", value: "not base64!" },
	{
		name: "capture length",
		path: "bodyCapture.decodedBytes",
		value: source.byteLength + 1,
	},
	{ name: "capture digest", path: "bodyCapture.sha256", value: "0".repeat(64) },
	{ name: "capture encoding", path: "bodyCapture.encoding", value: "utf8" },
	{ name: "capture extra field", path: "bodyCapture.extra", value: true },
	{
		name: "primary length",
		path: "primaryResponse.decodedBytes",
		value: source.byteLength + 1,
	},
	{
		name: "primary hash scope",
		path: "primaryResponse.hashScope",
		value: "after-loader",
	},
	{ name: "primary URL", path: "primaryResponse.url", value: `${url}/other` },
])("rejects incomplete or mismatched captured body: $name", (mutation) => {
	const report = fixture("reader");
	mutate(report, mutation);
	expectRejected(serialize(report));
});

it.each(modes)(
	"rejects a self-consistent replacement %s capture against the original body pin",
	(mode) => {
		const report = fixture(mode);
		const replacement = source.slice();
		try {
			replacement[replacement.length - 2] = "2".charCodeAt(0);
			report.bodyCapture = captureResearchBody(replacement);
			expectRejected(serialize(report));
		} finally {
			replacement.fill(0);
		}
	},
);

it.each(["default", "long-v1"] as const)(
	"preserves untagged legacy %s admission and metadata shape",
	(profile) => {
		const report = fixture("reader");
		Reflect.deleteProperty(report, "documentStrategy");
		Reflect.deleteProperty(report, "extraction");
		report.selection = { method: "heading-outline" };
		report.headings = {
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
		};
		if (profile === "long-v1")
			report.admission = researchLongAdmissionProvenance;
		const raw = serialize(report);
		const { expectedDocumentStrategy: _expectedDocumentStrategy, ...trusted } =
			authority(raw);
		const result = expectCapture(raw, { ...trusted, expectedProfile: profile });
		expect(result.selectedProfile).toBe(profile);
		expect(result).not.toHaveProperty("documentStrategy");
		expect(result.originalMetadata).not.toHaveProperty("documentStrategy");
		expect(result.originalFieldPresence).not.toHaveProperty("documentStrategy");
		expect(raw).toEqual(serialize(report));
	},
);

it.each(
	modes.flatMap((mode) =>
		["missing", "empty"].map((content) => ({ mode, content })),
	),
)(
	"rejects $mode success metadata with $content extraction content",
	({ mode, content }) => {
		const report = fixture(mode);
		const extraction = child(report, "extraction");
		if (content === "missing") Reflect.deleteProperty(extraction, "content");
		else extraction.content = "";
		expectRejected(serialize(report));
	},
);

const reviewClassificationMutations: Mutation[] = [
	{
		name: "omitted classifier",
		path: "classification.classifier",
		remove: true,
	},
	{
		name: "wrong classifier",
		path: "classification.classifier",
		value: "other-classifier",
	},
	{
		name: "omitted diagnostic",
		path: "classification.diagnostic",
		remove: true,
	},
	{
		name: "non-null diagnostic with null barrier",
		path: "classification.diagnostic",
		value: { kind: "challenge" },
	},
];

it.each(
	modes.flatMap((mode) =>
		reviewClassificationMutations.map((mutation) => ({ mode, ...mutation })),
	),
)("rejects reviewed $mode classification: $name", ({ mode, ...mutation }) => {
	const report = fixture(mode);
	mutate(report, mutation);
	expectRejected(serialize(report));
});

const reviewPayloads: {
	name: string;
	format: "markdown" | "json";
	value?: unknown;
	omit?: true;
}[] = [
	{ name: "blank Markdown", format: "markdown", value: " \t\r\n " },
	{ name: "null Markdown", format: "markdown", value: null },
	{
		name: "object instead of Markdown",
		format: "markdown",
		value: { text: title },
	},
	{ name: "missing JSON", format: "json", omit: true },
	{
		name: "empty JSON container",
		format: "json",
		value: { ref: "e1:n0", type: "container", children: [] },
	},
	{
		name: "blank JSON text",
		format: "json",
		value: { ref: "e1:n4", type: "text", text: " \t\n " },
	},
	{ name: "null JSON", format: "json", value: null },
	{ name: "array instead of JSON node", format: "json", value: [] },
	{ name: "string instead of JSON node", format: "json", value: title },
	{
		name: "missing JSON node reference",
		format: "json",
		value: { type: "text", text: title },
	},
	{
		name: "unknown JSON node type",
		format: "json",
		value: { ref: "e1:n4", type: "future", text: title },
	},
	{
		name: "non-string JSON text",
		format: "json",
		value: { ref: "e1:n4", type: "text", text: 42 },
	},
	{
		name: "non-array JSON children",
		format: "json",
		value: { ref: "e1:n0", type: "container", children: {} },
	},
	{
		name: "malformed child despite nonempty sibling",
		format: "json",
		value: {
			ref: "e1:n0",
			type: "container",
			children: [null, { ref: "e1:n4", type: "text", text: title }],
		},
	},
];

it.each(
	modes.flatMap((mode) =>
		reviewPayloads.map((payload) => ({ mode, ...payload })),
	),
)("rejects reviewed $mode payload: $name", ({ mode, format, value, omit }) => {
	const report = fixture(mode, format);
	const extraction = child(report, "extraction");
	if (omit) Reflect.deleteProperty(extraction, "content");
	else extraction.content = value;
	expectRejected(serialize(report));
});

const reviewStructuredContent = [
	{
		name: "text node",
		value: { ref: "e1:n4", type: "text", text: title },
	},
	{
		name: "nested image without text",
		value: {
			ref: "e1:n0",
			type: "container",
			children: [{ ref: "e1:n3", type: "image", url: `${url}/image.png` }],
		},
	},
	{
		name: "image without text",
		value: { ref: "e1:n3", type: "image", url: `${url}/image.png` },
	},
	{
		name: "separator without text",
		value: { ref: "e1:n3", type: "separator" },
	},
	{
		name: "table without text",
		value: { ref: "e1:n3", type: "table", children: [] },
	},
	{
		name: "datetime source without text",
		value: {
			ref: "e1:n3",
			type: "inline",
			dateTimeSource: {
				kind: "native-date-time-source-v1",
				tag: "time",
				value: "2026-09-17",
			},
		},
	},
];

it.each(
	modes.flatMap((mode) =>
		reviewStructuredContent.map((content) => ({ mode, ...content })),
	),
)("admits reviewed $mode structured JSON: $name", ({ mode, value }) => {
	const report = fixture(mode, "json");
	child(report, "extraction").content = value;
	const raw = serialize(report);
	const result = expectCapture(raw);
	expect(result.originalMetadata.outcome).toBe("extracted-unverified");
	expect(result.originalMetadata.documentStrategy).toEqual(
		report.documentStrategy,
	);
	expect(result.originalFieldPresence["extraction.content"]).toBe(true);
	expect(child(result.originalMetadata, "extraction")).not.toHaveProperty(
		"content",
	);
	expect(raw).toEqual(serialize(report));
});

function reviewChartTables(
	value: string | number | boolean | null,
): DataRecord {
	return {
		kind: "infogram-chart-tables-v1",
		scope: "document-source",
		partial: true,
		rendered: false,
		verified: false,
		textFormat: "plain-text",
		embedId: "00000000-0000-4000-8000-000000000001",
		truncated: false,
		tables: [
			{
				source: {
					offset: 0,
					offsetBasis: "lf-normalized-utf16",
					path: "elements.synthetic-chart",
					sheetIndex: 0,
				},
				sheetName: "Synthetic chart",
				rows: [
					[
						{ kind: "value-cell", value: "Label" },
						{ kind: "value-cell", value: "Measure" },
					],
					[
						{ kind: "value-cell", value: "Synthetic row" },
						{ kind: "value-cell", value },
					],
				],
			},
		],
	};
}

const reviewChartValues = [
	{ name: "nonblank string", value: "Synthetic value" },
	{ name: "numeric zero", value: 0 },
	{ name: "boolean false", value: false },
];

it.each(
	modes.flatMap((mode) =>
		(["markdown", "json"] as const).flatMap((format) =>
			reviewChartValues.map((cell) => ({ mode, format, ...cell })),
		),
	),
)(
	"admits reviewed $mode / $format chart content with $name",
	({ mode, format, value }) => {
		const report = fixture(mode, format);
		const extraction = child(report, "extraction");
		extraction.content =
			format === "markdown"
				? " \t\n "
				: { ref: "e1:n0", type: "container", children: [] };
		extraction.sourceChartTables = reviewChartTables(value);
		const raw = serialize(report);
		const result = expectCapture(raw);
		expect(
			child(result.originalMetadata, "extraction").sourceChartTables,
		).toEqual(extraction.sourceChartTables);
		expect(result.originalMetadata.outcome).toBe("extracted-unverified");
		expect(raw).toEqual(serialize(report));
	},
);

it.each(
	modes.flatMap((mode) =>
		[
			{ name: "null value with nonempty headers and row label", value: null },
			{
				name: "blank value with nonempty headers and row label",
				value: " \t\n ",
			},
		].map((cell) => ({ mode, ...cell })),
	),
)("rejects reviewed $mode chart with $name", ({ mode, value }) => {
	const report = fixture(mode, "json");
	const extraction = child(report, "extraction");
	extraction.content = { ref: "e1:n0", type: "container", children: [] };
	extraction.sourceChartTables = reviewChartTables(value);
	expectRejected(serialize(report));
});
