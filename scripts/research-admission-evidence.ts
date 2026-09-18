import { createHash } from "node:crypto";
import { isDeepStrictEqual, types } from "node:util";
import { AgentBrowserError } from "../src/errors.js";
import type { DocumentExtraction } from "../src/extraction.js";
import { isNetworkPolicyReason } from "../src/network-policy-diagnostic.js";
import type {
	ResearchDocumentStrategy,
	ResearchDocumentStrategyInfo,
} from "../src/research-fallback-loader.js";
import {
	type ResourceLimitDiagnostic,
	type ResourceLimitKind,
	resourceLimitDiagnostic,
	resourceLimitError,
} from "../src/resource-limit.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
	validateResearchDocumentProfile,
} from "../src/research-admission.js";
import {
	captureResearchResponseHeaders,
	researchResponseHeaderNames,
	researchResponseHeaderNamesV1,
} from "../src/research-response-headers.js";
import {
	sourceLinkLabelLimits,
	validateSourceLinkLabelPolicy,
} from "../src/source-link-labels.js";
import { validateSourceHeadingPolicy } from "../src/source-headings.js";
import {
	decodeResearchBodyCapture,
	researchBodyCaptureLimit,
} from "./research-body-capture.js";
import { hasResearchExtractionContent } from "./research-content.js";
import { validateResearchRedirectHandoff } from "./research-redirect.js";
import type {
	ResearchNavigationReport,
	ResearchOutcome,
} from "./research-browser.js";

export const researchEvidenceCodecLimits = Object.freeze({
	maxDepth: 32,
	maxProperties: 16_384,
});

export interface ResearchAdmissionProvenance {
	readonly schemaVersion: 1;
	readonly selection: "explicit-host";
	readonly profile: "long-v1";
	readonly effective: typeof researchLongDocumentAdmission;
	readonly codec: typeof researchEvidenceCodecLimits;
}

export const researchLongAdmissionProvenance: ResearchAdmissionProvenance =
	Object.freeze({
		schemaVersion: 1,
		selection: "explicit-host",
		profile: "long-v1",
		effective: researchLongDocumentAdmission,
		codec: researchEvidenceCodecLimits,
	});

export type ResearchExitReport = Readonly<
	Pick<ResearchNavigationReport, "outcome">
>;

export interface ResearchPriorOutcome {
	readonly outcome: ResearchOutcome;
	readonly partial: true;
	readonly contentSuccess: null | false;
	readonly failurePresent: boolean;
	readonly failureRetention: "absent" | "retained" | "omitted-over-bound";
	readonly failure?: Readonly<NonNullable<ResearchNavigationReport["failure"]>>;
}

export interface ResearchOutputLimitReport extends ResearchNavigationReport {
	readonly admission: ResearchAdmissionProvenance;
	readonly outcome: "failure";
	readonly contentSuccess: false;
	readonly failure: {
		readonly category: "resource-limit";
		readonly stage: "evidence-output";
	};
	readonly outputLimit: {
		readonly cause: "metadata-bytes" | "receipt-bytes";
		readonly limitBytes: number;
		readonly observedBytes: number;
		readonly observation: "complete" | "lower-bound";
		readonly prior: ResearchPriorOutcome;
		readonly omittedPayloads: readonly ("bodyCapture" | "headings")[];
		readonly metadataRetention: "bounded-projection";
	};
}

export interface ResearchJsonlEmission {
	readonly disposition: "complete" | "output-limit";
	readonly record: Readonly<
		ResearchNavigationReport | ResearchOutputLimitReport
	>;
	readonly jsonl: Uint8Array;
	readonly receiptBytes: number;
	readonly metadataBytes: number | null;
	readonly exitReport: ResearchExitReport;
}

export interface ResearchBodyPin {
	readonly bytes: number;
	readonly sha256: string;
}

export interface TrustedResearchReplayAdmission {
	readonly expectedProfile: ResearchDocumentProfileId;
	readonly expectedReceiptSha256: string;
	readonly expectedBody?: ResearchBodyPin;
	readonly expectedDocumentStrategy?: ResearchDocumentStrategy;
}

export interface ResearchReplayMetadata {
	readonly receiptBytes: number;
	readonly receiptSha256: string;
	readonly selectedProfile: ResearchDocumentProfileId;
	readonly originalMetadata: Readonly<Record<string, unknown>>;
	readonly originalFieldPresence: Readonly<Record<string, boolean>>;
	readonly documentStrategy?: Readonly<ResearchDocumentStrategyInfo>;
}

export type ResearchReplayAdmission = ResearchReplayMetadata &
	(
		| {
				readonly kind: "validated-capture";
				readonly body: Uint8Array;
				readonly bodyIdentity: ResearchBodyPin;
		  }
		| {
				readonly kind: "evidence-only";
				readonly body: null;
				readonly bodyIdentity: null;
				readonly reason:
					| "native-failure"
					| "payload-omitted"
					| "missing-capture"
					| "body-pin-missing"
					| "discovery-incomplete"
					| "unclassified-legacy-metadata";
		  }
	);

export interface ResearchOutputLimitSectionRecovery {
	readonly kind: "captured-output-limit-section";
	readonly originalOutcome: "failure";
	readonly originalContentSuccess: false;
	readonly originalFailure: {
		readonly category: "resource-limit";
		readonly stage: "extraction";
		readonly resourceLimit: {
			readonly kind: "extraction.output";
			readonly unit: "bytes";
			readonly limit: number;
			readonly observed: number;
		};
	};
	readonly originalRequestRetried: false;
}

export type ResearchOutputLimitSectionAdmission = Extract<
	ResearchReplayAdmission,
	{ kind: "validated-capture" }
> & { readonly recovery: ResearchOutputLimitSectionRecovery };

export interface ResearchLoaderLimitRecovery {
	readonly kind: "captured-loader-limit";
	readonly originalOutcome: "failure";
	readonly originalContentSuccess: false;
	readonly originalFailure: {
		readonly category: "resource-limit";
		readonly stage: "loader";
		readonly resourceLimit?: Readonly<ResourceLimitDiagnostic>;
	};
	readonly originalRequestRetried: false;
}

export type ResearchLoaderLimitAdmission = Extract<
	ResearchReplayAdmission,
	{ kind: "validated-capture" }
> & { readonly recovery: ResearchLoaderLimitRecovery };

export interface ResearchEmptyOutlineRecovery {
	readonly kind: "captured-empty-outline-selector";
	readonly originalOutcome: "empty-extraction";
	readonly originalContentSuccess: false;
	readonly originalRequestRetried: false;
	readonly originalDiscovery: {
		readonly method: "heading-outline";
		readonly entries: 0;
		readonly truncated: false;
		readonly scannedNodes: number;
	};
}

export type ResearchEmptyOutlineAdmission = Extract<
	ResearchReplayAdmission,
	{ kind: "validated-capture" }
> & { readonly recovery: ResearchEmptyOutlineRecovery };

type DataRecord = Record<string, unknown>;
type ByteObservation = { bytes: number; complete: boolean };
type EvidenceReason = Extract<
	ResearchReplayAdmission,
	{ kind: "evidence-only" }
>["reason"];

const { maxReceiptBytes, maxMetadataBytes } =
	researchLongDocumentAdmission.evidence;
const outcomes: readonly unknown[] = [
	"extracted-unverified",
	"semantic-barrier",
	"http-failure",
	"empty-extraction",
	"failure",
];
const barriers: readonly unknown[] = [
	null,
	"challenge",
	"login",
	"access-denied",
];
const payloadFields = [
	["bodyCapture", "data"],
	["headings", "entries"],
	["extraction", "content"],
	["textLines", "entries"],
] as const;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteLength",
)?.get;
const byteOffsetGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteOffset",
)?.get;
const bufferGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"buffer",
)?.get;

function invalidEvidence(): never {
	throw new AgentBrowserError("invalid-input", "Invalid research evidence");
}

function evidenceLimit(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"Research evidence codec limit exceeded",
	);
}

function isRecord(value: unknown): value is DataRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): DataRecord {
	if (!isRecord(value)) invalidEvidence();
	return value;
}

function snapshot(
	value: unknown,
	limits: Readonly<{
		maxDepth: number;
		maxProperties: number;
	}> = researchEvidenceCodecLimits,
): unknown {
	let properties = 0;
	const ancestors = new Set<object>();
	const pending: {
		source: object;
		copied: DataRecord | unknown[];
		keys: string[];
		next: number;
		depth: number;
	}[] = [];
	function copy(current: unknown, depth: number): unknown {
		if (depth > limits.maxDepth) evidenceLimit();
		if (
			current === null ||
			current === undefined ||
			typeof current === "string" ||
			typeof current === "boolean"
		)
			return current;
		if (typeof current === "number") {
			if (!Number.isFinite(current)) invalidEvidence();
			return current;
		}
		if (typeof current !== "object" || types.isProxy(current))
			invalidEvidence();
		const array = Array.isArray(current);
		const prototype = Object.getPrototypeOf(current);
		if (
			array
				? prototype !== Array.prototype
				: prototype !== Object.prototype && prototype !== null
		)
			invalidEvidence();
		if (ancestors.has(current)) invalidEvidence();
		const length = array
			? (Object.getOwnPropertyDescriptor(current, "length")?.value as number)
			: 0;
		if (length > limits.maxProperties - properties) evidenceLimit();
		const keys = Reflect.ownKeys(current);
		properties += array ? length : keys.length;
		if (properties > limits.maxProperties) evidenceLimit();
		const fields: string[] = [];
		for (const key of keys) {
			if (typeof key !== "string" || key === "toJSON") invalidEvidence();
			if (array && key === "length") continue;
			if (
				array &&
				(key.length > 10 ||
					!/^(0|[1-9][0-9]*)$/.test(key) ||
					Number(key) >= length)
			)
				invalidEvidence();
			fields.push(key);
		}
		const copied: DataRecord | unknown[] = array
			? new Array(length).fill(null)
			: Object.create(null);
		ancestors.add(current);
		pending.push({ source: current, copied, keys: fields, next: 0, depth });
		return copied;
	}
	const result = copy(value, 0);
	while (pending.length !== 0) {
		const frame = pending[pending.length - 1];
		if (frame.next === frame.keys.length) {
			ancestors.delete(frame.source);
			pending.pop();
			continue;
		}
		const key = frame.keys[frame.next++];
		const descriptor = Object.getOwnPropertyDescriptor(frame.source, key);
		if (
			!descriptor ||
			!Object.hasOwn(descriptor, "value") ||
			!descriptor.enumerable
		)
			invalidEvidence();
		Object.defineProperty(frame.copied, key, {
			value: copy(descriptor.value, frame.depth + 1),
			enumerable: true,
			writable: true,
			configurable: true,
		});
	}
	return result;
}

function finishSnapshot(value: unknown): void {
	if (value === null || typeof value !== "object") return;
	for (const key of Object.keys(value)) {
		const fields = value as DataRecord;
		if (fields[key] === undefined) {
			if (Array.isArray(value)) fields[key] = null;
			else delete fields[key];
		} else finishSnapshot(fields[key]);
	}
	Object.freeze(value);
}

function sameCanonical(value: unknown, canonical: unknown): boolean {
	if (value === canonical) return true;
	if (!isRecord(value) || !isRecord(canonical)) return false;
	const keys = Object.keys(canonical);
	return (
		Object.keys(value).length === keys.length &&
		keys.every(
			(key) =>
				Object.hasOwn(value, key) && sameCanonical(value[key], canonical[key]),
		)
	);
}

function measure(
	value: unknown,
	limit: number,
	newline = true,
): ByteObservation {
	let bytes = newline ? 1 : 0;
	function quoted(text: string): boolean {
		bytes += 2;
		if (text.length > limit - bytes) {
			bytes += text.length;
			return false;
		}
		for (let index = 0; index < text.length; index++) {
			const unit = text.charCodeAt(index);
			if (
				unit === 34 ||
				unit === 92 ||
				unit === 8 ||
				unit === 9 ||
				unit === 10 ||
				unit === 12 ||
				unit === 13
			)
				bytes += 2;
			else if (unit < 32) bytes += 6;
			else if (unit < 128) bytes++;
			else if (unit < 2048) bytes += 2;
			else if (unit >= 0xd800 && unit <= 0xdbff) {
				const next = text.charCodeAt(index + 1);
				if (next >= 0xdc00 && next <= 0xdfff) {
					bytes += 4;
					index++;
				} else bytes += 6;
			} else if (unit >= 0xdc00 && unit <= 0xdfff) bytes += 6;
			else bytes += 3;
			if (bytes > limit) return false;
		}
		return bytes <= limit;
	}
	function visit(current: unknown): boolean {
		if (typeof current === "string") return quoted(current);
		if (current === null || current === undefined) bytes += 4;
		else if (typeof current === "boolean") bytes += current ? 4 : 5;
		else if (typeof current === "number")
			bytes += JSON.stringify(current).length;
		else {
			const array = Array.isArray(current);
			const fields = current as DataRecord;
			const keys = Object.keys(fields).filter(
				(key) => array || fields[key] !== undefined,
			);
			bytes += 2;
			if (bytes > limit) return false;
			for (let index = 0; index < keys.length; index++) {
				if (index !== 0) bytes++;
				const key = keys[index];
				if (!array) {
					if (!quoted(key)) return false;
					bytes++;
				}
				if (!visit(fields[key])) return false;
			}
		}
		return bytes <= limit;
	}
	const complete = visit(value);
	return { bytes, complete };
}

function metadataProjection(report: DataRecord): DataRecord {
	const projected: DataRecord = { ...report };
	for (const [field, payload] of payloadFields) {
		const value = report[field];
		if (!isRecord(value)) continue;
		const metadata = { ...value };
		delete metadata[payload];
		projected[field] = metadata;
	}
	return projected;
}

function boundedString(
	value: unknown,
	maxLength: number,
	empty = false,
): value is string {
	return (
		typeof value === "string" &&
		value.length <= maxLength &&
		(empty || value.length > 0)
	);
}

function nonnegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function integer(value: unknown): value is number {
	return nonnegative(value) && Number.isSafeInteger(value);
}

function digest(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function timestamp(value: unknown): boolean {
	return boundedString(value, 64) && Number.isFinite(Date.parse(value));
}

function fragmentIdentity(value: unknown): DataRecord | null {
	if (value === null) return null;
	const identity = record(value);
	if (
		Object.keys(identity).length !== 3 ||
		!integer(identity.codeUnits) ||
		identity.codeUnits > 16384 ||
		!digest(identity.sha256) ||
		identity.digestEncoding !== "utf8-serialized-fragment"
	)
		invalidEvidence();
	return identity;
}

function fragmentProjection(value: unknown): DataRecord {
	const fragment = record(value);
	if (
		Object.keys(fragment).some(
			(key) =>
				![
					"schemaVersion",
					"requested",
					"effective",
					"resolution",
					"target",
					"semantics",
				].includes(key),
		) ||
		fragment.schemaVersion !== 1 ||
		fragment.semantics !== "native-dom-target-no-scroll-or-script" ||
		![
			"pending",
			"absent",
			"element",
			"unmatched",
			"document-top",
			"unsupported-directive",
		].includes(fragment.resolution as string)
	)
		invalidEvidence();
	const requested = fragmentIdentity(fragment.requested);
	const effective = Object.hasOwn(fragment, "effective")
		? fragmentIdentity(fragment.effective)
		: undefined;
	if (requested === null && (effective === null || effective === undefined))
		invalidEvidence();
	if (fragment.resolution !== "pending" && effective === undefined)
		invalidEvidence();
	if (fragment.resolution === "absent" && effective !== null) invalidEvidence();
	if (
		!["pending", "absent"].includes(fragment.resolution as string) &&
		!effective
	)
		invalidEvidence();
	if (
		["element", "unmatched", "unsupported-directive"].includes(
			fragment.resolution as string,
		) &&
		effective?.codeUnits === 0
	)
		invalidEvidence();
	if (fragment.resolution === "element") {
		if (
			!boundedString(fragment.target, 64) ||
			!/^e[1-9][0-9]*$/.test(fragment.target as string)
		)
			invalidEvidence();
	} else if (Object.hasOwn(fragment, "target")) invalidEvidence();
	return fragment;
}

function reportUrl(value: unknown): boolean {
	if (!boundedString(value, 4096)) return false;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function validateIdentity(report: DataRecord): void {
	if (Object.hasOwn(report, "fragment")) fragmentProjection(report.fragment);
	if (
		!reportUrl(report.requestedUrl) ||
		!(report.finalUrl === null || reportUrl(report.finalUrl)) ||
		!timestamp(report.startedAt) ||
		!timestamp(report.finishedAt) ||
		!nonnegative(report.elapsedMs) ||
		(report.profile !== "native" &&
			report.profile !== "native-semantic-reader-v1")
	)
		invalidEvidence();
}

function primaryProjection(value: unknown): DataRecord | null {
	if (value === null) return null;
	const primary = record(value);
	if (
		!reportUrl(primary.url) ||
		!integer(primary.status) ||
		primary.status < 100 ||
		primary.status > 599 ||
		!timestamp(primary.receivedAt) ||
		!integer(primary.decodedBytes) ||
		!integer(primary.encodedBytes) ||
		!digest(primary.bodySha256) ||
		primary.hashScope !== "transport-decoded-body-before-loader" ||
		!integer(primary.redirects) ||
		!nonnegative(primary.elapsedMs)
	)
		invalidEvidence();
	const headers = record(primary.headers);
	let headerCapture: DataRecord | undefined;
	if (Object.hasOwn(primary, "headerCapture")) {
		headerCapture = record(primary.headerCapture);
		if (
			Object.keys(headerCapture).length !== 3 ||
			(headerCapture.kind !== "selected-response-headers-v1" &&
				headerCapture.kind !== "selected-response-headers-v2") ||
			headerCapture.partial !== true ||
			!Array.isArray(headerCapture.omitted)
		)
			invalidEvidence();
		const captured = captureResearchResponseHeaders(
			headers as Readonly<Record<string, readonly string[]>>,
			headerCapture.kind,
		);
		if (
			captured.headerCapture.omitted.length !== 0 ||
			Object.keys(headers).length !== Object.keys(captured.headers).length
		)
			invalidEvidence();
		const selectedNames =
			headerCapture.kind === "selected-response-headers-v1"
				? researchResponseHeaderNamesV1
				: researchResponseHeaderNames;
		let previous = -1;
		for (const name of headerCapture.omitted) {
			const index = selectedNames.findIndex((selected) => selected === name);
			if (index <= previous || Object.hasOwn(headers, name)) invalidEvidence();
			previous = index;
		}
	} else {
		for (const [name, values] of Object.entries(headers)) {
			if (
				!["content-type", "content-length", "content-encoding"].includes(
					name,
				) ||
				!Array.isArray(values) ||
				values.length > 2 ||
				!values.every((value) => boundedString(value, 160, true))
			)
				invalidEvidence();
		}
	}
	return {
		url: primary.url,
		status: primary.status,
		receivedAt: primary.receivedAt,
		headers,
		...(headerCapture === undefined ? {} : { headerCapture }),
		decodedBytes: primary.decodedBytes,
		encodedBytes: primary.encodedBytes,
		bodySha256: primary.bodySha256,
		hashScope: primary.hashScope,
		redirects: primary.redirects,
		elapsedMs: primary.elapsedMs,
	};
}

function validateExplicitHeaderCapture(primary: unknown): void {
	if (isRecord(primary) && Object.hasOwn(primary, "headerCapture"))
		primaryProjection(primary);
}

function validateLong(report: DataRecord): void {
	if (
		!sameCanonical(report.admission, researchLongAdmissionProvenance) ||
		Object.hasOwn(report, "extraction") ||
		Object.hasOwn(report, "textLines")
	)
		invalidEvidence();
	validateIdentity(report);
	if (
		report.profile !== "native-semantic-reader-v1" ||
		report.partial !== true ||
		(report.contentSuccess !== null && report.contentSuccess !== false) ||
		!outcomes.includes(report.outcome)
	)
		invalidEvidence();
	const classification = record(report.classification);
	if (
		classification.classifier !== "browser-challenges" ||
		!barriers.includes(classification.barrier) ||
		!(classification.diagnostic === null || isRecord(classification.diagnostic))
	)
		invalidEvidence();
	primaryProjection(report.primaryResponse);
	if (
		report.selection !== undefined &&
		record(report.selection).method !== "heading-outline"
	)
		invalidEvidence();
	if (report.failure !== undefined) {
		const failure = record(report.failure);
		if (
			typeof failure.category !== "string" ||
			typeof failure.stage !== "string"
		)
			invalidEvidence();
	}
}

function validateRedirectEvidence(report: DataRecord): void {
	if (Object.hasOwn(report, "redirectMode") && report.redirectMode !== "manual")
		invalidEvidence();
	if (Object.hasOwn(report, "redirect")) {
		if (report.redirectMode !== "manual") invalidEvidence();
		const primary = record(report.primaryResponse);
		if (typeof primary.url !== "string" || typeof primary.status !== "number")
			invalidEvidence();
		validateResearchRedirectHandoff(
			report.redirect,
			primary.url,
			primary.status,
		);
	}
}

function validatePolicyFragments(report: DataRecord): void {
	validateRedirectEvidence(report);
	validateSourceLinkLabelEvidence(report);
	validateSourceHeadingEvidence(report);
	const prior =
		isRecord(report.outputLimit) && isRecord(report.outputLimit.prior)
			? report.outputLimit.prior
			: undefined;
	for (const failure of [report.failure, prior?.failure]) {
		if (!isRecord(failure) || !Object.hasOwn(failure, "networkPolicy"))
			continue;
		const diagnostic = record(failure.networkPolicy);
		if (
			failure.category !== "policy-denied" ||
			typeof failure.stage !== "string" ||
			Object.hasOwn(failure, "resourceLimit") ||
			Object.keys(diagnostic).length !== 2 ||
			!Object.hasOwn(diagnostic, "kind") ||
			!Object.hasOwn(diagnostic, "reason") ||
			diagnostic.kind !== "network-policy-v1" ||
			!isNetworkPolicyReason(diagnostic.reason)
		)
			invalidEvidence();
	}
}

function validSourceHeading(value: unknown, level: unknown): boolean {
	return (
		isRecord(value) &&
		value.policy === "source-aria-heading-v1" &&
		value.level === level &&
		integer(value.level) &&
		(value.level as number) >= 1 &&
		(value.level as number) <= 2_147_483_647 &&
		(value.levelBasis === "aria-level" ||
			(value.levelBasis === "missing-level-default" && value.level === 2)) &&
		value.rendered === false &&
		value.verified === false
	);
}

function validateSourceHeadingEvidence(report: DataRecord): void {
	const declared = Object.hasOwn(report, "sourceHeadingPolicy");
	const outputs = [report.reader, report.extraction, report.headings];
	if (!declared) {
		if (
			outputs.some(
				(value) =>
					isRecord(value) && Object.hasOwn(value, "sourceHeadingPolicy"),
			)
		)
			invalidEvidence();
		return;
	}
	const policy = validateSourceHeadingPolicy(report.sourceHeadingPolicy);
	if (
		policy === undefined ||
		report.profile !== "native-semantic-reader-v1" ||
		Object.hasOwn(report, "textLines") ||
		outputs.some(
			(value) =>
				value !== undefined &&
				(!isRecord(value) || value.sourceHeadingPolicy !== policy),
		) ||
		(isRecord(report.extraction) &&
			(Object.hasOwn(report.extraction, "textSelection") ||
				Object.hasOwn(report.extraction, "jsonSelection")))
	)
		invalidEvidence();
}

function validateSourceLinkLabelEvidence(report: DataRecord): void {
	const extraction = isRecord(report.extraction)
		? report.extraction
		: undefined;
	const declared = Object.hasOwn(report, "sourceLinkLabelPolicy");
	if (!declared) {
		if (extraction && Object.hasOwn(extraction, "sourceLinkLabels"))
			invalidEvidence();
		return;
	}
	const policy = validateSourceLinkLabelPolicy(report.sourceLinkLabelPolicy);
	if (
		policy === undefined ||
		report.profile !== "native-semantic-reader-v1" ||
		Object.hasOwn(report, "admission") ||
		Object.hasOwn(report, "outputLimitPolicy") ||
		Object.hasOwn(report, "headings") ||
		Object.hasOwn(report, "textLines") ||
		(Object.hasOwn(report, "extraction") && extraction === undefined) ||
		(report.outcome === "extracted-unverified" && extraction === undefined) ||
		(report.selection !== undefined &&
			(!isRecord(report.selection) ||
				!["css-selector", "heading-section"].includes(
					report.selection.method as string,
				))) ||
		(extraction !== undefined &&
			(extraction.format !== "markdown" ||
				Object.hasOwn(extraction, "contentFallback") ||
				Object.hasOwn(extraction, "textSelection") ||
				Object.hasOwn(extraction, "jsonSelection") ||
				!isRecord(extraction.sourceLinkLabels)))
	)
		invalidEvidence();
	if (extraction) {
		const labels = record(extraction.sourceLinkLabels);
		if (
			labels.policy !== policy ||
			labels.attribute !== "aria-label" ||
			labels.rendered !== false ||
			labels.verified !== false ||
			!integer(labels.links) ||
			(labels.links as number) > sourceLinkLabelLimits.maxLinks ||
			!integer(labels.truncatedLabels) ||
			!integer(labels.omittedCandidates) ||
			(labels.truncatedLabels as number) > (labels.links as number)
		)
			invalidEvidence();
	}
	const primary = report.primaryResponse;
	if (primary !== null && primary !== undefined) {
		const headers = record(record(primary).headers);
		const types = headers["content-type"];
		const mime =
			Array.isArray(types) && types.length === 1 && typeof types[0] === "string"
				? types[0].split(";", 1)[0].trim().toLowerCase()
				: undefined;
		const reader = isRecord(report.reader) ? report.reader : undefined;
		const interpretation = reader?.mimeInterpretation;
		if (
			mime !== "text/html" &&
			!(
				mime === "text/markdown" &&
				report.readerMimePolicy === "markdown-html-document-v1" &&
				reader?.mimePolicy === report.readerMimePolicy &&
				isRecord(interpretation) &&
				interpretation.policy === report.readerMimePolicy &&
				interpretation.declaredMime === "text/markdown" &&
				interpretation.effectiveMime === "text/html"
			)
		)
			invalidEvidence();
	}
}

function validatePayloadShape(report: DataRecord): void {
	if (report.bodyCapture !== undefined) {
		const capture = record(report.bodyCapture);
		if (
			capture.encoding !== "base64" ||
			!integer(capture.decodedBytes) ||
			!digest(capture.sha256) ||
			typeof capture.data !== "string"
		)
			invalidEvidence();
	}
	if (report.headings !== undefined) {
		const outline = record(report.headings);
		if (
			outline.method !== "heading-outline" ||
			outline.partial !== true ||
			!boundedString(outline.document, 4096) ||
			!integer(outline.revision) ||
			!Array.isArray(outline.entries) ||
			!integer(outline.scannedNodes) ||
			typeof outline.truncated !== "boolean"
		)
			invalidEvidence();
		for (const value of outline.entries) {
			const entry = record(value);
			if (
				typeof entry.ref !== "string" ||
				!integer(entry.level) ||
				entry.level < 1 ||
				(entry.level > 6 &&
					!(
						report.sourceHeadingPolicy === "source-aria-heading-v1" &&
						validSourceHeading(entry.sourceHeading, entry.level)
					)) ||
				(Object.hasOwn(entry, "sourceHeading") &&
					!(
						report.sourceHeadingPolicy === "source-aria-heading-v1" &&
						validSourceHeading(entry.sourceHeading, entry.level)
					)) ||
				typeof entry.title !== "string" ||
				typeof entry.titleTruncated !== "boolean" ||
				!(entry.selector === null || typeof entry.selector === "string")
			)
				invalidEvidence();
		}
	}
}

function priorOutcome(report: DataRecord): ResearchPriorOutcome {
	const prior: ResearchPriorOutcome = {
		outcome: report.outcome as ResearchOutcome,
		partial: true,
		contentSuccess: report.contentSuccess as null | false,
		failurePresent: Object.hasOwn(report, "failure"),
		failureRetention: Object.hasOwn(report, "failure")
			? "omitted-over-bound"
			: "absent",
	};
	if (!isRecord(report.failure)) return prior;
	const failure = report.failure;
	if (
		!boundedString(failure.category, 128, true) ||
		!boundedString(failure.stage, 128, true)
	)
		return prior;
	const retained: DataRecord = {
		category: failure.category,
		stage: failure.stage,
	};
	if (failure.resourceLimit !== undefined) {
		if (!isRecord(failure.resourceLimit)) return prior;
		const diagnostic = failure.resourceLimit;
		if (
			!boundedString(diagnostic.kind, 128) ||
			!boundedString(diagnostic.unit, 128) ||
			!integer(diagnostic.limit) ||
			!integer(diagnostic.observed)
		)
			return prior;
		retained.resourceLimit = {
			kind: diagnostic.kind,
			unit: diagnostic.unit,
			limit: diagnostic.limit,
			observed: diagnostic.observed,
		};
	}
	if (Object.hasOwn(failure, "networkPolicy")) {
		const diagnostic = record(failure.networkPolicy);
		retained.networkPolicy = {
			kind: diagnostic.kind,
			reason: diagnostic.reason,
		};
	}
	if (!measure(retained, 1024, false).complete) return prior;
	return {
		...prior,
		failureRetention: "retained",
		failure: retained as unknown as ResearchPriorOutcome["failure"],
	};
}

function outputFallback(
	report: DataRecord,
	cause: ResearchOutputLimitReport["outputLimit"]["cause"],
	observation: ByteObservation,
): DataRecord {
	return {
		requestedUrl: report.requestedUrl,
		finalUrl: report.finalUrl,
		...(Object.hasOwn(report, "fragment")
			? { fragment: fragmentProjection(report.fragment) }
			: {}),
		startedAt: report.startedAt,
		finishedAt: report.finishedAt,
		elapsedMs: report.elapsedMs,
		profile: report.profile,
		partial: true,
		contentSuccess: false,
		classification: {
			classifier: "browser-challenges",
			barrier: record(report.classification).barrier,
			diagnostic: null,
		},
		primaryResponse: primaryProjection(report.primaryResponse),
		...(report.selection === undefined
			? {}
			: { selection: { method: "heading-outline" } }),
		admission: researchLongAdmissionProvenance,
		outcome: "failure",
		failure: { category: "resource-limit", stage: "evidence-output" },
		outputLimit: {
			cause,
			limitBytes:
				cause === "metadata-bytes" ? maxMetadataBytes : maxReceiptBytes,
			observedBytes: observation.bytes,
			observation: observation.complete ? "complete" : "lower-bound",
			prior: priorOutcome(report),
			omittedPayloads: ["bodyCapture", "headings"].filter(
				(field) => Object.hasOwn(report, field) && report[field] !== undefined,
			),
			metadataRetention: "bounded-projection",
		},
	};
}

export function serializeResearchReport(
	report: ResearchNavigationReport,
	selectedProfile?: ResearchDocumentProfileId,
): ResearchJsonlEmission {
	const profile = validateResearchDocumentProfile(selectedProfile);
	if (profile === "default") {
		if (types.isProxy(report) || !isRecord(report)) invalidEvidence();
		if (Object.hasOwn(report, "admission")) invalidEvidence();
		const primaryDescriptor = Object.getOwnPropertyDescriptor(
			report,
			"primaryResponse",
		);
		if (primaryDescriptor && !Object.hasOwn(primaryDescriptor, "value"))
			invalidEvidence();
		const primary = primaryDescriptor?.value;
		if (types.isProxy(primary)) invalidEvidence();
		let serialized: ResearchNavigationReport = report;
		if (
			(isRecord(primary) && Object.hasOwn(primary, "headerCapture")) ||
			Object.hasOwn(report, "redirectMode") ||
			Object.hasOwn(report, "redirect")
		) {
			const detached = record(
				snapshot(report, {
					maxDepth: Number.POSITIVE_INFINITY,
					maxProperties: Number.POSITIVE_INFINITY,
				}),
			);
			validateExplicitHeaderCapture(detached.primaryResponse);
			validateRedirectEvidence(detached);
			serialized = detached as unknown as ResearchNavigationReport;
		}
		if (Object.hasOwn(serialized, "fragment"))
			fragmentProjection(
				snapshot(
					Object.getOwnPropertyDescriptor(serialized, "fragment")?.value,
				),
			);
		if (serialized !== report) finishSnapshot(serialized);
		const jsonl = new TextEncoder().encode(`${JSON.stringify(serialized)}\n`);
		return {
			disposition: "complete",
			record: serialized,
			jsonl,
			receiptBytes: jsonl.byteLength,
			metadataBytes: null,
			exitReport: Object.freeze({ outcome: serialized.outcome }),
		};
	}
	let detached = record(snapshot(report));
	validateLong(detached);
	validatePayloadShape(detached);
	validatePolicyFragments(detached);
	let metadata = measure(metadataProjection(detached), maxMetadataBytes);
	let receipt = metadata.complete
		? measure(detached, maxReceiptBytes)
		: metadata;
	let disposition: ResearchJsonlEmission["disposition"] = "complete";
	if (!metadata.complete || !receipt.complete) {
		detached = outputFallback(
			detached,
			metadata.complete ? "receipt-bytes" : "metadata-bytes",
			metadata.complete ? receipt : metadata,
		);
		metadata = measure(metadataProjection(detached), maxMetadataBytes);
		receipt = measure(detached, maxReceiptBytes);
		if (!metadata.complete || !receipt.complete) evidenceLimit();
		disposition = "output-limit";
	}
	finishSnapshot(detached);
	const jsonl = new TextEncoder().encode(`${JSON.stringify(detached)}\n`);
	if (jsonl.byteLength !== receipt.bytes) invalidEvidence();
	return {
		disposition,
		record: detached as unknown as
			| ResearchNavigationReport
			| ResearchOutputLimitReport,
		jsonl,
		receiptBytes: jsonl.byteLength,
		metadataBytes: metadata.bytes,
		exitReport: Object.freeze({ outcome: detached.outcome as ResearchOutcome }),
	};
}

function receiptSnapshot(rawReceipt: Uint8Array): Uint8Array {
	if (types.isProxy(rawReceipt) || !types.isUint8Array(rawReceipt))
		invalidEvidence();
	const length = byteLengthGetter?.call(rawReceipt) as number;
	if (length > maxReceiptBytes) evidenceLimit();
	try {
		const backing = bufferGetter?.call(rawReceipt) as ArrayBuffer;
		if (!types.isArrayBuffer(backing)) invalidEvidence();
		const offset = byteOffsetGetter?.call(rawReceipt) as number;
		return new Uint8Array(new Uint8Array(backing, offset, length));
	} catch {
		invalidEvidence();
	}
}

function trustedAdmission(
	value: TrustedResearchReplayAdmission,
): TrustedResearchReplayAdmission {
	const trusted = record(snapshot(value));
	if (
		!Object.hasOwn(trusted, "expectedProfile") ||
		(trusted.expectedProfile !== "default" &&
			trusted.expectedProfile !== "long-v1") ||
		!Object.hasOwn(trusted, "expectedReceiptSha256") ||
		!digest(trusted.expectedReceiptSha256) ||
		Object.keys(trusted).some(
			(key) =>
				![
					"expectedProfile",
					"expectedReceiptSha256",
					"expectedBody",
					"expectedDocumentStrategy",
				].includes(key),
		)
	)
		invalidEvidence();
	if (
		Object.hasOwn(trusted, "expectedDocumentStrategy") &&
		(trusted.expectedDocumentStrategy !== "native-reader-fallback-v1" ||
			trusted.expectedProfile !== "default")
	)
		invalidEvidence();
	if (Object.hasOwn(trusted, "expectedBody")) {
		const pin = record(trusted.expectedBody);
		const cap =
			trusted.expectedProfile === "long-v1"
				? researchLongDocumentAdmission.maxCaptureBytes
				: researchBodyCaptureLimit;
		if (
			Object.keys(pin).length !== 2 ||
			!integer(pin.bytes) ||
			pin.bytes > cap ||
			!digest(pin.sha256)
		)
			invalidEvidence();
	}
	return trusted as unknown as TrustedResearchReplayAdmission;
}

function fieldPresence(report: DataRecord): Readonly<Record<string, boolean>> {
	const presence: Record<string, boolean> = Object.create(null);
	const fields = new Set([
		...Object.keys(report),
		"admission",
		"requestedUrl",
		"finalUrl",
		"startedAt",
		"finishedAt",
		"elapsedMs",
		"profile",
		"partial",
		"contentSuccess",
		"outcome",
		"failure",
		"classification",
		"primaryResponse",
		"selection",
		"navigation",
		"bodyCapture",
		"headings",
		"extraction",
		"textLines",
		"reader",
		"metrics",
		"outputLimit",
	]);
	for (const field of fields) presence[field] = Object.hasOwn(report, field);
	for (const [field, payload] of payloadFields) {
		const value = report[field];
		presence[`${field}.${payload}`] =
			isRecord(value) && Object.hasOwn(value, payload);
	}
	return Object.freeze(presence);
}

function outlineReady(report: DataRecord, allowEmpty = false): boolean {
	if (report.headings === undefined || report.headings === null) return false;
	const outline = record(report.headings);
	if (outline.truncated === true) return false;
	if (!Array.isArray(outline.entries)) invalidEvidence();
	if (outline.entries.length === 0 && !allowEmpty) return false;
	const limits = researchLongDocumentAdmission.headings;
	if (
		outline.method !== "heading-outline" ||
		outline.partial !== true ||
		outline.truncated !== false ||
		!boundedString(outline.document, 4096) ||
		!integer(outline.revision) ||
		!integer(outline.scannedNodes) ||
		outline.scannedNodes > limits.maxNodes ||
		outline.entries.length > limits.maxEntries ||
		!measure(outline, limits.maxBytes, false).complete
	)
		invalidEvidence();
	for (const value of outline.entries) {
		const entry = record(value);
		if (
			!boundedString(entry.ref, 4096) ||
			!integer(entry.level) ||
			entry.level < 1 ||
			(entry.level > 6 &&
				!(
					report.sourceHeadingPolicy === "source-aria-heading-v1" &&
					validSourceHeading(entry.sourceHeading, entry.level)
				)) ||
			!boundedString(entry.title, limits.maxTitleCodeUnits, true) ||
			typeof entry.titleTruncated !== "boolean" ||
			!(
				boundedString(entry.selector, limits.maxSelectorCodeUnits) ||
				(entry.selector === null &&
					["unsupported-ancestor", "selector-limit"].includes(
						entry.selectorUnavailable as string,
					))
			)
		)
			invalidEvidence();
	}
	return true;
}

function strategyProjection(
	value: unknown,
): Readonly<ResearchDocumentStrategyInfo> {
	const strategy = record(value);
	if (
		strategy.policy !== "native-reader-fallback-v1" ||
		(strategy.mode !== "native" && strategy.mode !== "reader") ||
		Object.keys(strategy).length !== (strategy.mode === "native" ? 2 : 3) ||
		(strategy.mode === "native" && Object.hasOwn(strategy, "nativeFailure"))
	)
		invalidEvidence();
	if (strategy.mode === "reader") {
		const failure = record(strategy.nativeFailure);
		if (
			(failure.category !== "unsupported" &&
				failure.category !== "resource-limit") ||
			failure.stage !== "loader" ||
			Object.keys(failure).some(
				(key) => !["category", "stage", "resourceLimit"].includes(key),
			)
		)
			invalidEvidence();
		if (Object.hasOwn(failure, "resourceLimit")) {
			const diagnostic = record(failure.resourceLimit);
			if (
				failure.category !== "resource-limit" ||
				Object.keys(diagnostic).length !== 4 ||
				!integer(diagnostic.limit) ||
				!integer(diagnostic.observed) ||
				diagnostic.observed <= diagnostic.limit ||
				typeof diagnostic.kind !== "string"
			)
				invalidEvidence();
			const expected = resourceLimitDiagnostic(
				resourceLimitError(
					diagnostic.kind as ResourceLimitKind,
					diagnostic.limit,
					diagnostic.observed,
					"Strategy replay resource diagnostic",
				),
			);
			if (!expected || !sameCanonical(diagnostic, expected)) invalidEvidence();
		}
	}
	return strategy as unknown as Readonly<ResearchDocumentStrategyInfo>;
}

function validateStrategyExtractionContent(extraction: DataRecord): void {
	if (!Object.hasOwn(extraction, "content")) invalidEvidence();
	if (extraction.format === "markdown") {
		if (typeof extraction.content !== "string") invalidEvidence();
	} else {
		const pending = [record(extraction.content)];
		const types = new Set([
			"container",
			"inline",
			"text",
			"paragraph",
			"heading",
			"list",
			"list-item",
			"blockquote",
			"pre",
			"code",
			"strong",
			"emphasis",
			"link",
			"image",
			"break",
			"separator",
			"table",
			"row",
			"cell",
		]);
		while (pending.length) {
			const node = pending.pop() as DataRecord;
			if (
				!boundedString(node.ref, 4096) ||
				typeof node.type !== "string" ||
				!types.has(node.type) ||
				(Object.hasOwn(node, "text") && typeof node.text !== "string")
			)
				invalidEvidence();
			for (const field of ["tableSource", "ariaTableSource", "imageSource"])
				if (Object.hasOwn(node, field)) record(node[field]);
			if (Object.hasOwn(node, "dateTimeSource")) {
				const dateTime = record(node.dateTimeSource);
				if (typeof dateTime.value !== "string") invalidEvidence();
			}
			if (Object.hasOwn(node, "children")) {
				if (!Array.isArray(node.children)) invalidEvidence();
				for (const child of node.children) pending.push(record(child));
			}
		}
	}
	if (Object.hasOwn(extraction, "sourceChartTables")) {
		const charts = record(extraction.sourceChartTables);
		if (!Array.isArray(charts.tables)) invalidEvidence();
		for (const value of charts.tables) {
			const table = record(value);
			if (!Array.isArray(table.rows)) invalidEvidence();
			for (const row of table.rows) {
				if (!Array.isArray(row)) invalidEvidence();
				for (const value of row) {
					const cell = record(value);
					if (typeof cell.kind !== "string") invalidEvidence();
				}
			}
		}
	}
	if (
		!hasResearchExtractionContent(extraction as unknown as DocumentExtraction)
	)
		invalidEvidence();
}

function validateSuccessfulStrategyCapture(
	report: DataRecord,
	strategy: Readonly<ResearchDocumentStrategyInfo>,
): void {
	const primary = primaryProjection(report.primaryResponse);
	const extraction = record(report.extraction);
	const metrics = record(report.metrics);
	const classification = record(report.classification);
	const contentTypes = primary && record(primary.headers)["content-type"];
	if (
		!primary ||
		!Array.isArray(contentTypes) ||
		contentTypes.length !== 1 ||
		typeof contentTypes[0] !== "string" ||
		contentTypes[0].split(";", 1)[0].trim().toLowerCase() !== "text/html" ||
		extraction.partial !== true ||
		(extraction.format !== "json" && extraction.format !== "markdown") ||
		metrics.closed !== true ||
		metrics.active !== 0 ||
		classification.classifier !== "browser-challenges" ||
		!Object.hasOwn(classification, "diagnostic") ||
		classification.diagnostic !== null ||
		[
			"selection",
			"headings",
			"textLines",
			"contentFocus",
			"outputLimitPolicy",
			"readerMimePolicy",
			"sourceLinkLabelPolicy",
			"sourceHeadingPolicy",
		].some((field) => Object.hasOwn(report, field))
	)
		invalidEvidence();
	validateStrategyExtractionContent(extraction);
	if (strategy.mode === "native") {
		if (
			report.profile !== "native" ||
			Object.hasOwn(extraction, "reader") ||
			[
				"reader",
				"readerRawPolicy",
				"readerVisibilityPolicy",
				"readerFallbackEncoding",
			].some((field) => Object.hasOwn(report, field))
		)
			invalidEvidence();
		return;
	}
	const reader = record(report.reader);
	if (
		primary.status !== 200 ||
		report.profile !== "native-semantic-reader-v1" ||
		report.readerRawPolicy !== "separate-omitted-raw-v1" ||
		report.readerVisibilityPolicy !== "source-hidden-inline-v1" ||
		report.readerFallbackEncoding !== "utf-8" ||
		reader.profile !== "native-semantic-reader-v1" ||
		reader.partial !== true ||
		reader.scripting !== false ||
		reader.styling !== false ||
		reader.rawTextPolicy !== report.readerRawPolicy ||
		reader.visibilityPolicy !== report.readerVisibilityPolicy ||
		reader.fallbackEncoding !== report.readerFallbackEncoding ||
		reader.hiddenContentSemantics !== "source-attributes-and-inline-display" ||
		!integer(reader.sourceHiddenSubtrees) ||
		!boundedString(reader.encoding, 128) ||
		Object.hasOwn(reader, "mimePolicy") ||
		Object.hasOwn(reader, "mimeInterpretation") ||
		Object.hasOwn(reader, "sourceHeadingPolicy") ||
		!isDeepStrictEqual(extraction.reader, reader)
	)
		invalidEvidence();
}

function replayEvidence(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	defaultOnly = false,
	allowDocumentStrategy = false,
) {
	const raw = receiptSnapshot(rawReceipt);
	const authority = trustedAdmission(trusted);
	if (defaultOnly && authority.expectedProfile !== "default")
		throw new AgentBrowserError(
			"unsupported",
			"Output-limit section recovery requires the default profile",
		);
	const receiptSha256 = createHash("sha256").update(raw).digest("hex");
	if (receiptSha256 !== authority.expectedReceiptSha256) invalidEvidence();
	let text: string;
	let parsed: unknown;
	try {
		text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			raw,
		);
		parsed = JSON.parse(text);
	} catch {
		invalidEvidence();
	}
	const report = record(snapshot(parsed));
	let documentStrategy: Readonly<ResearchDocumentStrategyInfo> | undefined;
	if (Object.hasOwn(report, "documentStrategy")) {
		if (
			!allowDocumentStrategy ||
			authority.expectedDocumentStrategy === undefined
		)
			throw new AgentBrowserError(
				"unsupported",
				"Strategy replay requires explicit ordinary strategy admission",
			);
		documentStrategy = strategyProjection(report.documentStrategy);
	} else if (authority.expectedDocumentStrategy !== undefined)
		invalidEvidence();
	const selectedProfile = authority.expectedProfile;
	if (selectedProfile === "long-v1") {
		validateLong(report);
		if (`${JSON.stringify(report)}\n` !== text) invalidEvidence();
	} else if (Object.hasOwn(report, "admission")) invalidEvidence();
	validatePolicyFragments(report);
	validateExplicitHeaderCapture(report.primaryResponse);
	if (Object.hasOwn(report, "fragment")) fragmentProjection(report.fragment);
	const originalMetadata = metadataProjection(report);
	const originalFieldPresence = fieldPresence(report);
	if (
		!measure({ originalMetadata, originalFieldPresence }, maxMetadataBytes)
			.complete
	)
		evidenceLimit();
	finishSnapshot(originalMetadata);
	const metadata: ResearchReplayMetadata = {
		receiptBytes: raw.byteLength,
		receiptSha256,
		selectedProfile,
		originalMetadata,
		originalFieldPresence,
		...(documentStrategy === undefined ? {} : { documentStrategy }),
	};
	return { report, authority, metadata };
}

export function validateResearchReplayAdmission(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
): ResearchReplayAdmission {
	const { report, authority, metadata } = replayEvidence(
		rawReceipt,
		trusted,
		false,
		true,
	);
	const selectedProfile = metadata.selectedProfile;
	function evidenceOnly(reason: EvidenceReason): ResearchReplayAdmission {
		return Object.freeze({
			...metadata,
			kind: "evidence-only",
			body: null,
			bodyIdentity: null,
			reason,
		});
	}
	if (Object.hasOwn(report, "outputLimit"))
		return evidenceOnly("payload-omitted");
	if (
		!Object.hasOwn(report, "outcome") ||
		!Object.hasOwn(report, "partial") ||
		!Object.hasOwn(report, "contentSuccess") ||
		!outcomes.includes(report.outcome) ||
		report.partial !== true ||
		(report.contentSuccess !== null && report.contentSuccess !== false) ||
		!isRecord(report.classification) ||
		!Object.hasOwn(report.classification, "barrier")
	)
		return evidenceOnly("unclassified-legacy-metadata");
	if (
		report.outcome !== "extracted-unverified" ||
		report.contentSuccess === false ||
		Object.hasOwn(report, "failure") ||
		Object.hasOwn(report, "rateLimit") ||
		Object.hasOwn(report, "serviceBackoff") ||
		report.classification.barrier !== null
	)
		return evidenceOnly("native-failure");
	if (report.bodyCapture === undefined || report.bodyCapture === null)
		return evidenceOnly("missing-capture");
	if (authority.expectedBody === undefined)
		return evidenceOnly("body-pin-missing");
	if (selectedProfile === "long-v1") {
		if (
			!isRecord(report.selection) ||
			report.selection.method !== "heading-outline" ||
			!isRecord(report.metrics) ||
			report.metrics.closed !== true ||
			report.metrics.active !== 0 ||
			!outlineReady(report)
		)
			return evidenceOnly("discovery-incomplete");
	}
	if (metadata.documentStrategy !== undefined)
		validateSuccessfulStrategyCapture(report, metadata.documentStrategy);
	return validatedCapture(report, authority, metadata);
}

export function validateResearchOutputLimitSectionAdmission(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
): ResearchOutputLimitSectionAdmission {
	const { report, authority, metadata } = replayEvidence(
		rawReceipt,
		trusted,
		true,
	);
	const classification = record(report.classification);
	const failure = record(report.failure);
	const diagnostic = record(failure.resourceLimit);
	const reader = record(report.reader);
	const navigation = record(report.navigation);
	const response = record(navigation.response);
	const metrics = record(report.metrics);
	const primary = primaryProjection(report.primaryResponse);
	if (
		report.outcome !== "failure" ||
		report.partial !== true ||
		report.contentSuccess !== false ||
		report.profile !== "native-semantic-reader-v1" ||
		Object.hasOwn(report, "rateLimit") ||
		Object.hasOwn(report, "serviceBackoff") ||
		Object.hasOwn(report, "outputLimit") ||
		classification.classifier !== "browser-challenges" ||
		classification.barrier !== null ||
		classification.diagnostic !== null ||
		Object.keys(failure).length !== 3 ||
		failure.category !== "resource-limit" ||
		failure.stage !== "extraction" ||
		Object.keys(diagnostic).length !== 4 ||
		diagnostic.kind !== "extraction.output" ||
		diagnostic.unit !== "bytes" ||
		!integer(diagnostic.limit) ||
		diagnostic.limit <= 0 ||
		!integer(diagnostic.observed) ||
		diagnostic.observed <= diagnostic.limit ||
		reader.profile !== "native-semantic-reader-v1" ||
		reader.partial !== true ||
		reader.scripting !== false ||
		reader.styling !== false ||
		(reader.hiddenContentSemantics !== false &&
			!(
				(reader.hiddenContentSemantics === "source-attributes" &&
					(reader.visibilityPolicy ?? report.readerVisibilityPolicy) ===
						"source-hidden-v1") ||
				(reader.hiddenContentSemantics ===
					"source-attributes-and-inline-display" &&
					(reader.visibilityPolicy ?? report.readerVisibilityPolicy) ===
						"source-hidden-inline-v1")
			)) ||
		navigation.kind !== "document" ||
		!boundedString(navigation.tabId, 4096) ||
		!boundedString(navigation.documentRef, 4096) ||
		Object.hasOwn(navigation, "scripts") ||
		navigation.url !== report.finalUrl ||
		response.url !== report.finalUrl ||
		metrics.active !== 0 ||
		metrics.closed !== true ||
		primary === null ||
		response.status !== primary.status ||
		response.bytes !== primary.decodedBytes ||
		response.redirects !== primary.redirects ||
		authority.expectedBody === undefined
	)
		invalidEvidence();
	const contentType = record(primary.headers)["content-type"];
	if (
		!Array.isArray(contentType) ||
		contentType.length !== 1 ||
		typeof contentType[0] !== "string" ||
		contentType[0].split(";", 1)[0].trim().toLowerCase() !== "text/html"
	)
		invalidEvidence();
	const recovery: ResearchOutputLimitSectionRecovery = Object.freeze({
		kind: "captured-output-limit-section",
		originalOutcome: "failure",
		originalContentSuccess: false,
		originalFailure:
			failure as unknown as ResearchOutputLimitSectionRecovery["originalFailure"],
		originalRequestRetried: false,
	});
	return Object.freeze({
		...validatedCapture(report, authority, metadata),
		recovery,
	});
}

export function validateResearchLoaderLimitAdmission(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
): ResearchLoaderLimitAdmission {
	const { report, authority, metadata } = replayEvidence(rawReceipt, trusted);
	const classification = record(report.classification);
	const failure = record(report.failure);
	const metrics = record(report.metrics);
	const primary = primaryProjection(report.primaryResponse);
	if (
		metadata.selectedProfile !== "default" ||
		report.outcome !== "failure" ||
		report.partial !== true ||
		report.contentSuccess !== false ||
		report.profile !== "native-semantic-reader-v1" ||
		[
			"rateLimit",
			"serviceBackoff",
			"outputLimit",
			"navigation",
			"reader",
			"extraction",
			"headings",
			"textLines",
			"links",
		].some((field) => Object.hasOwn(report, field)) ||
		classification.classifier !== "browser-challenges" ||
		classification.barrier !== null ||
		classification.diagnostic !== null ||
		failure.category !== "resource-limit" ||
		failure.stage !== "loader" ||
		Object.keys(failure).some(
			(key) => !["category", "stage", "resourceLimit"].includes(key),
		) ||
		metrics.active !== 0 ||
		metrics.closed !== true ||
		primary === null ||
		authority.expectedBody === undefined
	)
		invalidEvidence();
	if (Object.hasOwn(failure, "resourceLimit")) {
		const diagnostic = record(failure.resourceLimit);
		if (
			Object.keys(diagnostic).length !== 4 ||
			!integer(diagnostic.limit) ||
			!integer(diagnostic.observed) ||
			typeof diagnostic.kind !== "string"
		)
			invalidEvidence();
		const expected = resourceLimitDiagnostic(
			resourceLimitError(
				diagnostic.kind as ResourceLimitKind,
				diagnostic.limit,
				diagnostic.observed,
				"Loader recovery resource diagnostic",
			),
		);
		if (!expected || !sameCanonical(diagnostic, expected)) invalidEvidence();
	}
	if (Object.hasOwn(report, "selection")) {
		const selection = record(report.selection);
		const fields = Object.keys(selection).length;
		if (
			!(
				((selection.method === "css-selector" ||
					selection.method === "heading-section") &&
					selection.matches === null &&
					fields === 2) ||
				((selection.method === "heading-outline" ||
					selection.method === "text-line-discovery") &&
					fields === 1) ||
				(selection.method === "text-lines" &&
					integer(selection.start) &&
					selection.start >= 1 &&
					integer(selection.end) &&
					selection.end >= selection.start &&
					fields === 3) ||
				(selection.method === "json-pointer" &&
					boundedString(selection.pointer, 4096, true) &&
					fields === 2)
			)
		)
			invalidEvidence();
	}
	const contentType = record(primary.headers)["content-type"];
	if (
		!Array.isArray(contentType) ||
		contentType.length !== 1 ||
		typeof contentType[0] !== "string" ||
		contentType[0].split(";", 1)[0].trim().toLowerCase() !== "text/html"
	)
		invalidEvidence();
	const recovery: ResearchLoaderLimitRecovery = Object.freeze({
		kind: "captured-loader-limit",
		originalOutcome: "failure",
		originalContentSuccess: false,
		originalFailure:
			failure as unknown as ResearchLoaderLimitRecovery["originalFailure"],
		originalRequestRetried: false,
	});
	return Object.freeze({
		...validatedCapture(report, authority, metadata),
		recovery,
	});
}

export function validateResearchEmptyOutlineAdmission(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
): ResearchEmptyOutlineAdmission {
	const { report, authority, metadata } = replayEvidence(rawReceipt, trusted);
	const classification = record(report.classification);
	const reader = record(report.reader);
	const navigation = record(report.navigation);
	const response = record(navigation.response);
	const metrics = record(report.metrics);
	const selection = record(report.selection);
	const outline = record(report.headings);
	const primary = primaryProjection(report.primaryResponse);
	if (
		metadata.selectedProfile !== "long-v1" ||
		report.outcome !== "empty-extraction" ||
		report.partial !== true ||
		report.contentSuccess !== false ||
		report.profile !== "native-semantic-reader-v1" ||
		Object.hasOwn(report, "failure") ||
		Object.hasOwn(report, "rateLimit") ||
		Object.hasOwn(report, "serviceBackoff") ||
		Object.hasOwn(report, "outputLimit") ||
		classification.classifier !== "browser-challenges" ||
		classification.barrier !== null ||
		classification.diagnostic !== null ||
		selection.method !== "heading-outline" ||
		Object.keys(selection).length !== 1 ||
		!outlineReady(report, true) ||
		!Array.isArray(outline.entries) ||
		outline.entries.length !== 0 ||
		outline.scannedNodes === 0 ||
		outline.document !== navigation.documentRef ||
		reader.profile !== "native-semantic-reader-v1" ||
		reader.partial !== true ||
		reader.scripting !== false ||
		reader.styling !== false ||
		(reader.hiddenContentSemantics !== false &&
			!(
				(reader.hiddenContentSemantics === "source-attributes" &&
					(reader.visibilityPolicy ?? report.readerVisibilityPolicy) ===
						"source-hidden-v1") ||
				(reader.hiddenContentSemantics ===
					"source-attributes-and-inline-display" &&
					(reader.visibilityPolicy ?? report.readerVisibilityPolicy) ===
						"source-hidden-inline-v1")
			)) ||
		navigation.kind !== "document" ||
		!boundedString(navigation.tabId, 4096) ||
		!boundedString(navigation.documentRef, 4096) ||
		Object.hasOwn(navigation, "scripts") ||
		navigation.url !== report.finalUrl ||
		response.url !== report.finalUrl ||
		metrics.active !== 0 ||
		metrics.closed !== true ||
		primary === null ||
		response.status !== primary.status ||
		response.bytes !== primary.decodedBytes ||
		response.redirects !== primary.redirects ||
		authority.expectedBody === undefined
	)
		invalidEvidence();
	const recovery: ResearchEmptyOutlineRecovery = Object.freeze({
		kind: "captured-empty-outline-selector",
		originalOutcome: "empty-extraction",
		originalContentSuccess: false,
		originalRequestRetried: false,
		originalDiscovery: Object.freeze({
			method: "heading-outline",
			entries: 0,
			truncated: false,
			scannedNodes: outline.scannedNodes as number,
		}),
	});
	return Object.freeze({
		...validatedCapture(report, authority, metadata),
		recovery,
	});
}

function validatedCapture(
	report: DataRecord,
	authority: TrustedResearchReplayAdmission,
	metadata: ResearchReplayMetadata,
): Extract<ResearchReplayAdmission, { kind: "validated-capture" }> {
	const selectedProfile = metadata.selectedProfile;
	validateIdentity(report);
	const primary = primaryProjection(report.primaryResponse);
	const pin = authority.expectedBody;
	if (
		pin === undefined ||
		primary === null ||
		report.finalUrl !== primary.url ||
		primary.decodedBytes !== pin.bytes ||
		primary.bodySha256 !== pin.sha256 ||
		(primary.status as number) < 200 ||
		(primary.status as number) >= 300
	)
		invalidEvidence();
	if (selectedProfile === "long-v1") {
		const contentType = record(primary.headers)["content-type"];
		if (
			!Array.isArray(contentType) ||
			contentType.length !== 1 ||
			typeof contentType[0] !== "string" ||
			contentType[0].split(";", 1)[0].trim().toLowerCase() !== "text/html"
		)
			invalidEvidence();
	}
	const body = decodeResearchBodyCapture(report.bodyCapture, selectedProfile);
	try {
		if (
			body.byteLength !== pin.bytes ||
			createHash("sha256").update(body).digest("hex") !== pin.sha256
		)
			invalidEvidence();
		return Object.freeze({
			...metadata,
			kind: "validated-capture",
			body,
			bodyIdentity: Object.freeze({ bytes: pin.bytes, sha256: pin.sha256 }),
		});
	} catch (error) {
		body.fill(0);
		throw error;
	}
}
