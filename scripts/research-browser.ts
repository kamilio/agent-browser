import { createHash } from "node:crypto";
import type { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import {
	type BrowserChallengeDiagnostic,
	classifyBrowserChallenge,
} from "../src/browser-challenges.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import { documentTitle } from "../src/document-title.js";
import { AgentBrowserError } from "../src/errors.js";
import type { ContentFocusPolicy } from "../src/extraction-content-focus.js";
import {
	type HttpsRedirectPolicy,
	validateHttpsRedirectPolicy,
} from "../src/https-redirect-policy.js";
import {
	type DocumentExtraction,
	type DocumentHeadingOutline,
	type DocumentTextLineDiscovery,
	discoverDocumentHeadings,
	discoverDocumentTextLines,
	extractDocument,
} from "../src/extraction.js";
import { validateJsonSourcePointer } from "../src/json-source-selection.js";
import {
	type NetworkPolicyDiagnostic,
	networkPolicyDiagnostic,
} from "../src/network-policy-diagnostic.js";
import {
	type NetworkMetrics,
	NetworkPolicy,
	type NetworkResponse,
} from "../src/network.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { OriginRequestPacer } from "../src/origin-request-pacer.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
	validateResearchDocumentProfile,
} from "../src/research-admission.js";
import {
	type ResearchReaderReport,
	loadResearchDocument,
	researchReaderInfo,
	researchReaderProfile,
} from "../src/research-loader.js";
import {
	type ResearchReaderFallbackEncoding,
	type ResearchReaderRawPolicy,
	type ResearchReaderVisibilityPolicy,
	validateResearchReaderFallbackEncoding,
	validateResearchReaderRawPolicy,
	validateResearchReaderVisibilityPolicy,
} from "../src/research-reader-info.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
} from "../src/resource-limit.js";
import {
	type ResearchResponseHeaderCapture,
	captureResearchResponseHeaders,
} from "../src/research-response-headers.js";
import { type RetryAfterAdvice, parseRetryAfter } from "../src/retry-after.js";
import { validateSelectorSyntax } from "../src/selectors.js";
import { BrowserSession, type NavigationResult } from "../src/session.js";
import {
	type ResearchAdmissionProvenance,
	type ResearchExitReport,
	researchLongAdmissionProvenance,
	serializeResearchReport,
} from "./research-admission-evidence.js";
import {
	type ResearchBodyCapture,
	captureResearchBody,
} from "./research-body-capture.js";
import {
	hasResearchExtractionContent,
	researchDiagnosticTextLimit,
	researchDocumentDiagnosticText,
	researchExtractionDiagnosticText,
} from "./research-content.js";
import {
	type ResearchFragmentReport,
	researchFragmentReport,
} from "./research-fragment.js";
import {
	type ResearchReaderMimePolicy,
	validateResearchReaderMimePolicy,
} from "../src/research-mime-policy.js";
import {
	classifyResearchVisibility,
	researchVisibilityEvidence,
} from "./research-visibility.js";

export const researchRunLimits = Object.freeze({
	maxUrls: 8,
	maxUrlCodeUnits: 4096,
	selectorCodeUnits: 4096,
	diagnosticTextCodeUnits: researchDiagnosticTextLimit,
	deadlineMs: 120_000,
	navigationTimeoutMs: 20_000,
	extractionBytes: 256_000,
	network: Object.freeze({
		timeoutMs: 15_000,
		maxResponseBytes: 2_000_000,
		maxRequestBytes: 1,
		maxHeaderBytes: 16_384,
		maxRedirects: 5,
		maxConcurrent: 1,
		maxRequests: 12,
		maxTotalBytes: 8_000_000,
	}),
});

export interface PrimaryResponseSummary {
	url: string;
	status: number;
	receivedAt: string;
	headers: Readonly<Record<string, readonly string[]>>;
	headerCapture?: ResearchResponseHeaderCapture;
	decodedBytes: number;
	encodedBytes: number;
	bodySha256: string;
	hashScope: "transport-decoded-body-before-loader";
	redirects: number;
	httpsRedirectUpgrades?: {
		policy: HttpsRedirectPolicy;
		fromUrl: string;
		originalLocation: string;
		effectiveLocation: string;
	}[];
	elapsedMs: number;
}

function reportUrl(value: string) {
	const url = new URL(value);
	url.username = "";
	url.password = "";
	if (url.search) url.search = "?redacted";
	url.hash = "";
	return url.href.slice(0, researchRunLimits.maxUrlCodeUnits);
}

export function summarizePrimaryResponse(
	response: NetworkResponse,
): PrimaryResponseSummary {
	const captured = captureResearchResponseHeaders(response.headers);
	const httpsRedirectUpgrades = response.redirects.flatMap((redirect) =>
		redirect.httpsUpgrade === undefined
			? []
			: [
					{
						policy: redirect.httpsUpgrade.policy,
						fromUrl: reportUrl(redirect.url),
						originalLocation: reportUrl(redirect.httpsUpgrade.originalLocation),
						effectiveLocation: reportUrl(redirect.location),
					},
				],
	);
	return {
		url: reportUrl(response.url),
		status: response.status,
		receivedAt: new Date().toISOString(),
		...captured,
		decodedBytes: response.body.byteLength,
		encodedBytes: response.encodedBytes,
		bodySha256: createHash("sha256").update(response.body).digest("hex"),
		hashScope: "transport-decoded-body-before-loader",
		redirects: response.redirects.length,
		...(httpsRedirectUpgrades.length ? { httpsRedirectUpgrades } : {}),
		elapsedMs: response.elapsedMs,
	};
}

function researchSelector(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length > researchRunLimits.selectorCodeUnits ||
		!value.trim() ||
		value.startsWith("--")
	)
		throw new AgentBrowserError("invalid-input", "Invalid research selector");
	try {
		validateSelectorSyntax(value, { pseudoElements: false });
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid research selector");
	}
	return value;
}

export interface ResearchLineRange {
	start: number;
	end: number;
}

function validateResearchLines(value: ResearchLineRange): ResearchLineRange {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		!Number.isSafeInteger(value.start) ||
		!Number.isSafeInteger(value.end) ||
		value.start < 1 ||
		value.end < value.start ||
		value.end > 2_000_001
	)
		throw new AgentBrowserError("invalid-input", "Invalid research lines");
	return { start: value.start, end: value.end };
}

function researchLines(value: unknown): ResearchLineRange {
	if (
		typeof value !== "string" ||
		value.length > 15 ||
		value.trim() !== value ||
		!/^[1-9][0-9]{0,6}:[1-9][0-9]{0,6}$/.test(value)
	)
		throw new AgentBrowserError("invalid-input", "Invalid research lines");
	const [start, end] = value.split(":").map(Number);
	return validateResearchLines({ start, end });
}

export function parseResearchArguments(args: readonly string[]) {
	let reader = false;
	let httpsRedirectPolicy: HttpsRedirectPolicy | undefined;
	let preferMarkdown = false;
	let readerRawPolicy: ResearchReaderRawPolicy | undefined;
	let readerVisibilityPolicy: ResearchReaderVisibilityPolicy | undefined;
	let readerMimePolicy: ResearchReaderMimePolicy | undefined;
	let readerFallbackEncoding: ResearchReaderFallbackEncoding | undefined;
	let captureBody = false;
	let format: "markdown" | "json" | undefined;
	let outputLimitPolicy: "text-prefix-v1" | undefined;
	let contentFocus: ContentFocusPolicy | undefined;
	let tableMetadata = false;
	let compactTables = false;
	let tableRows = false;
	let minRequestIntervalMs: number | undefined;
	let documentProfile: ResearchDocumentProfileId | undefined;
	let selector: string | undefined;
	let lines: ResearchLineRange | undefined;
	let jsonPointer: string | undefined;
	let section: string | undefined;
	let headings = false;
	let find: string | undefined;
	const urls: string[] = [];
	const policy = new NetworkPolicy();
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (
			argument === "--https-redirect-policy" &&
			httpsRedirectPolicy === undefined
		) {
			const value = args[++index];
			if (value === undefined)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing research HTTPS redirect policy",
				);
			httpsRedirectPolicy = validateHttpsRedirectPolicy(value);
			continue;
		}
		if (
			argument === "--reader-fallback-encoding" &&
			readerFallbackEncoding === undefined
		) {
			const value = args[++index];
			if (value === undefined)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing research reader fallback encoding",
				);
			readerFallbackEncoding = validateResearchReaderFallbackEncoding(value);
			continue;
		}
		if (argument === "--content-focus" && contentFocus === undefined) {
			const value = args[++index];
			if (
				value !== "main-content-v1" &&
				value !== "main-content-v2" &&
				value !== "main-content-v3"
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid research content focus policy",
				);
			contentFocus = value;
			continue;
		}
		if (argument === "--reader-mime-policy" && readerMimePolicy === undefined) {
			const value = args[++index];
			if (value === undefined)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing research reader MIME policy",
				);
			readerMimePolicy = validateResearchReaderMimePolicy(value);
			continue;
		}
		if (
			argument === "--reader-visibility-policy" &&
			readerVisibilityPolicy === undefined
		) {
			const value = args[++index];
			if (value === undefined)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing research reader visibility policy",
				);
			readerVisibilityPolicy = validateResearchReaderVisibilityPolicy(value);
			continue;
		}
		if (argument === "--reader-raw-policy" && readerRawPolicy === undefined) {
			const value = args[++index];
			if (value === undefined)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing research reader raw policy",
				);
			readerRawPolicy = validateResearchReaderRawPolicy(value);
			continue;
		}
		if (argument === "--format" && format === undefined) {
			const value = args[++index];
			if (value !== "markdown" && value !== "json")
				throw new AgentBrowserError("invalid-input", "Invalid research format");
			format = value;
			continue;
		}
		if (
			argument === "--output-limit-policy" &&
			outputLimitPolicy === undefined
		) {
			const value = args[++index];
			if (value !== "text-prefix-v1")
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid research output limit policy",
				);
			outputLimitPolicy = value;
			continue;
		}
		if (argument === "--table-metadata" && !tableMetadata) {
			tableMetadata = true;
			continue;
		}
		if (argument === "--compact-tables" && !compactTables) {
			compactTables = true;
			continue;
		}
		if (argument === "--table-rows" && !tableRows) {
			tableRows = true;
			continue;
		}
		if (
			argument === "--min-request-interval-ms" &&
			minRequestIntervalMs === undefined
		) {
			const value = args[++index];
			if (
				typeof value !== "string" ||
				!/^(?:0|[1-9][0-9]{0,4})$/.test(value) ||
				Number(value) > 60_000
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid research request interval",
				);
			minRequestIntervalMs = Number(value);
			continue;
		}
		if (argument === "--document-profile" && documentProfile === undefined) {
			const profile = args[++index];
			if (profile === undefined)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing research document profile",
				);
			documentProfile = validateResearchDocumentProfile(profile);
			continue;
		}
		if (argument === "--find" && find === undefined) {
			const query = args[++index];
			if (
				typeof query !== "string" ||
				query.length < 1 ||
				query.length > 256 ||
				/[\r\n]/.test(query)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid research find query",
				);
			find = query;
			continue;
		}
		if (argument === "--headings" && !headings) {
			headings = true;
			continue;
		}
		if (argument === "--section" && section === undefined) {
			section = researchSelector(args[++index]);
			continue;
		}
		if (argument === "--lines" && lines === undefined) {
			lines = researchLines(args[++index]);
			continue;
		}
		if (argument === "--json-pointer" && jsonPointer === undefined) {
			jsonPointer = validateJsonSourcePointer(args[++index]);
			continue;
		}
		if (argument === "--capture-body" && !captureBody) {
			captureBody = true;
			continue;
		}
		if (argument === "--selector" && selector === undefined) {
			selector = researchSelector(args[++index]);
			continue;
		}
		if (argument === "--reader" && !reader) {
			reader = true;
			continue;
		}
		if (argument === "--prefer-markdown" && !preferMarkdown) {
			preferMarkdown = true;
			continue;
		}
		if (
			argument.startsWith("-") ||
			argument.length > researchRunLimits.maxUrlCodeUnits ||
			urls.length >= researchRunLimits.maxUrls
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid research arguments",
			);
		const url = policy.checkUrl(argument);
		if (url.href.length > researchRunLimits.maxUrlCodeUnits)
			throw new AgentBrowserError(
				"invalid-input",
				"Research URL length limit exceeded",
			);
		urls.push(url.href);
	}
	if (readerFallbackEncoding !== undefined && !reader)
		throw new AgentBrowserError(
			"invalid-input",
			"Research reader fallback encoding requires the reader",
		);
	if (readerRawPolicy !== undefined && !reader)
		throw new AgentBrowserError(
			"invalid-input",
			"Research reader raw policy requires the reader",
		);
	if (readerVisibilityPolicy !== undefined && !reader)
		throw new AgentBrowserError(
			"invalid-input",
			"Research reader visibility policy requires the reader",
		);
	if (
		preferMarkdown &&
		(!reader ||
			selector !== undefined ||
			section !== undefined ||
			headings ||
			documentProfile === "long-v1")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Markdown preference requires the default reader without DOM selection",
		);
	if (
		jsonPointer !== undefined &&
		(selector !== undefined ||
			section !== undefined ||
			lines !== undefined ||
			headings ||
			find !== undefined ||
			contentFocus !== undefined ||
			outputLimitPolicy !== undefined ||
			documentProfile === "long-v1")
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Research JSON pointer cannot be combined with other selection, discovery, content focus, text-prefix output or long research",
		);
	if (selector !== undefined && lines !== undefined)
		throw new AgentBrowserError(
			"invalid-input",
			"Research lines and selector are mutually exclusive",
		);
	if (section !== undefined && (selector !== undefined || lines !== undefined))
		throw new AgentBrowserError(
			"invalid-input",
			"Research section cannot be combined with lines or selector",
		);
	if (!urls.length)
		throw new AgentBrowserError(
			"invalid-input",
			"Explicit public URLs required",
		);
	if (
		headings &&
		(selector !== undefined || lines !== undefined || section !== undefined)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Research headings cannot be combined with selection",
		);
	if (
		find !== undefined &&
		(selector !== undefined ||
			lines !== undefined ||
			section !== undefined ||
			headings)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Research find cannot be combined with selection",
		);
	if (
		documentProfile === "long-v1" &&
		(urls.length !== researchLongDocumentAdmission.maxUrls ||
			!reader ||
			!captureBody ||
			!headings ||
			selector !== undefined ||
			lines !== undefined ||
			section !== undefined ||
			find !== undefined)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Long research requires one reader capture with headings",
		);
	if (
		contentFocus !== undefined &&
		(selector !== undefined ||
			section !== undefined ||
			lines !== undefined ||
			headings ||
			find !== undefined)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Research content focus cannot be combined with selection or discovery",
		);
	if (tableMetadata && format !== "json")
		throw new AgentBrowserError(
			"invalid-input",
			"Research table metadata requires JSON format",
		);
	if (
		readerMimePolicy !== undefined &&
		(!reader ||
			documentProfile === "long-v1" ||
			jsonPointer !== undefined ||
			lines !== undefined ||
			find !== undefined)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Reader MIME policy requires default reader DOM operations",
		);
	if (
		outputLimitPolicy !== undefined &&
		(!reader || format === "json" || headings || find !== undefined)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Research text-prefix output requires reader Markdown extraction",
		);
	if (compactTables && (format === "json" || headings || find !== undefined))
		throw new AgentBrowserError(
			"invalid-input",
			"Compact tables require Markdown extraction, not discovery",
		);
	if (tableRows && (format === "json" || headings || find !== undefined))
		throw new AgentBrowserError(
			"invalid-input",
			"Table rows require Markdown extraction, not discovery",
		);
	if (format !== undefined && (headings || find !== undefined))
		throw new AgentBrowserError(
			"invalid-input",
			"Research format cannot be combined with discovery",
		);
	return {
		reader,
		urls,
		...(httpsRedirectPolicy === undefined ? {} : { httpsRedirectPolicy }),
		...(preferMarkdown ? { preferMarkdown: true as const } : {}),
		...(readerRawPolicy === undefined ? {} : { readerRawPolicy }),
		...(readerVisibilityPolicy === undefined ? {} : { readerVisibilityPolicy }),
		...(readerMimePolicy === undefined ? {} : { readerMimePolicy }),
		...(readerFallbackEncoding === undefined ? {} : { readerFallbackEncoding }),
		...(format === undefined ? {} : { format }),
		...(outputLimitPolicy === undefined ? {} : { outputLimitPolicy }),
		...(contentFocus === undefined ? {} : { contentFocus }),
		...(tableMetadata ? { tableMetadata: true as const } : {}),
		...(compactTables ? { compactTables: true as const } : {}),
		...(tableRows ? { tableRows: true as const } : {}),
		...(minRequestIntervalMs === undefined ? {} : { minRequestIntervalMs }),
		...(documentProfile === undefined ? {} : { documentProfile }),
		...(selector === undefined ? {} : { selector }),
		...(lines === undefined ? {} : { lines }),
		...(jsonPointer === undefined ? {} : { jsonPointer }),
		...(section === undefined ? {} : { section }),
		...(headings ? { headings: true as const } : {}),
		...(find === undefined ? {} : { find }),
		...(captureBody ? { captureBody: true as const } : {}),
	};
}

export type ResearchOutcome =
	| "extracted-unverified"
	| "semantic-barrier"
	| "http-failure"
	| "empty-extraction"
	| "failure";

export interface ResearchNavigationReport {
	httpsRedirectPolicy?: HttpsRedirectPolicy;
	readerFallbackEncoding?: ResearchReaderFallbackEncoding;
	contentFocus?: ContentFocusPolicy;
	representationPreference?: "markdown";
	readerMimePolicy?: ResearchReaderMimePolicy;
	outputLimitPolicy?: "text-prefix-v1";
	fragment?: ResearchFragmentReport;
	admission?: ResearchAdmissionProvenance;
	readerRawPolicy?: ResearchReaderRawPolicy;
	readerVisibilityPolicy?: ResearchReaderVisibilityPolicy;
	rateLimit?: {
		kind: "http-rate-limit";
		status: 429;
		url: string;
		receivedAt: string;
		action: "stop-without-retry";
		retryAfter?: Readonly<RetryAfterAdvice>;
	};
	requestedUrl: string;
	finalUrl: string | null;
	startedAt: string;
	finishedAt: string;
	elapsedMs: number;
	profile: "native" | typeof researchReaderProfile;
	partial: true;
	contentSuccess: null | false;
	classification: {
		classifier: "browser-challenges";
		barrier: BrowserChallengeDiagnostic["kind"] | null;
		diagnostic: BrowserChallengeDiagnostic | null;
	};
	primaryResponse: PrimaryResponseSummary | null;
	bodyCapture?: ResearchBodyCapture;
	selection?:
		| { method: "css-selector"; matches: number | null }
		| { method: "heading-section"; matches: number | null }
		| { method: "heading-outline" }
		| { method: "text-line-discovery" }
		| { method: "json-pointer"; pointer: string }
		| { method: "text-lines"; start: number; end: number };
	outcome: ResearchOutcome;
	failure?: {
		category: string;
		stage: string;
		resourceLimit?: Readonly<ResourceLimitDiagnostic>;
		networkPolicy?: Readonly<NetworkPolicyDiagnostic>;
	};
	navigation?: NavigationResult;
	extraction?: DocumentExtraction;
	headings?: DocumentHeadingOutline;
	textLines?: DocumentTextLineDiscovery;
	reader?: Readonly<ResearchReaderReport>;
	metrics?: Readonly<NetworkMetrics>;
}

export interface ResearchExecutionOptions {
	jsonPointer?: string;
	httpsRedirectPolicy?: HttpsRedirectPolicy;
	readerFallbackEncoding?: ResearchReaderFallbackEncoding;
	contentFocus?: ContentFocusPolicy;
	preferMarkdown?: boolean;
	readerMimePolicy?: ResearchReaderMimePolicy;
	outputLimitPolicy?: "text-prefix-v1";
	readerRawPolicy?: ResearchReaderRawPolicy;
	readerVisibilityPolicy?: ResearchReaderVisibilityPolicy;
	format?: "markdown" | "json";
	tableMetadata?: boolean;
	compactTables?: boolean;
	tableRows?: boolean;
	minRequestIntervalMs?: number;
}

function validateExecutionOptions(options: ResearchExecutionOptions): void {
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		(options.preferMarkdown !== undefined &&
			typeof options.preferMarkdown !== "boolean") ||
		(options.outputLimitPolicy !== undefined &&
			options.outputLimitPolicy !== "text-prefix-v1") ||
		(options.contentFocus !== undefined &&
			options.contentFocus !== "main-content-v1" &&
			options.contentFocus !== "main-content-v2" &&
			options.contentFocus !== "main-content-v3") ||
		(options.format !== undefined &&
			options.format !== "markdown" &&
			options.format !== "json") ||
		(options.tableMetadata !== undefined &&
			typeof options.tableMetadata !== "boolean") ||
		(options.compactTables !== undefined &&
			typeof options.compactTables !== "boolean") ||
		(options.tableRows !== undefined &&
			typeof options.tableRows !== "boolean") ||
		(options.minRequestIntervalMs !== undefined &&
			(!Number.isSafeInteger(options.minRequestIntervalMs) ||
				options.minRequestIntervalMs < 0 ||
				options.minRequestIntervalMs > 60_000))
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research execution options",
		);
	validateHttpsRedirectPolicy(options.httpsRedirectPolicy);
	validateResearchReaderRawPolicy(options.readerRawPolicy);
	validateResearchReaderVisibilityPolicy(options.readerVisibilityPolicy);
	validateResearchReaderMimePolicy(options.readerMimePolicy);
	validateResearchReaderFallbackEncoding(options.readerFallbackEncoding);
	if (options.jsonPointer !== undefined)
		validateJsonSourcePointer(options.jsonPointer);
}

export async function researchNavigation(
	url: string,
	reader = false,
	signal?: AbortSignal,
	selector?: string,
	captureBody = false,
	lines?: ResearchLineRange,
	section?: string,
	headings = false,
	find?: string,
	documentProfile?: ResearchDocumentProfileId,
	executionOptions: ResearchExecutionOptions = {},
): Promise<ResearchNavigationReport> {
	validateExecutionOptions(executionOptions);
	if (executionOptions.readerFallbackEncoding !== undefined && reader !== true)
		throw new AgentBrowserError(
			"invalid-input",
			"Research reader fallback encoding requires the reader",
		);
	if (executionOptions.readerRawPolicy !== undefined && reader !== true)
		throw new AgentBrowserError(
			"invalid-input",
			"Research reader raw policy requires the reader",
		);
	if (executionOptions.readerVisibilityPolicy !== undefined && reader !== true)
		throw new AgentBrowserError(
			"invalid-input",
			"Research reader visibility policy requires the reader",
		);
	const selectedDocumentProfile =
		validateResearchDocumentProfile(documentProfile);
	if (selectedDocumentProfile === "long-v1" && reader !== true)
		throw new AgentBrowserError(
			"invalid-input",
			"Long research requires the reader",
		);
	if (typeof captureBody !== "boolean" || typeof headings !== "boolean")
		throw new AgentBrowserError("invalid-input", "Invalid research arguments");
	const lineRange =
		lines === undefined ? undefined : validateResearchLines(lines);
	const validated = parseResearchArguments([
		...(executionOptions.jsonPointer === undefined
			? []
			: ["--json-pointer", executionOptions.jsonPointer]),
		...(executionOptions.httpsRedirectPolicy === undefined
			? []
			: ["--https-redirect-policy", executionOptions.httpsRedirectPolicy]),
		...(executionOptions.readerFallbackEncoding === undefined
			? []
			: [
					"--reader-fallback-encoding",
					executionOptions.readerFallbackEncoding,
				]),
		...(executionOptions.preferMarkdown ? ["--prefer-markdown"] : []),
		...(executionOptions.readerRawPolicy === undefined
			? []
			: ["--reader-raw-policy", executionOptions.readerRawPolicy]),
		...(executionOptions.readerVisibilityPolicy === undefined
			? []
			: [
					"--reader-visibility-policy",
					executionOptions.readerVisibilityPolicy,
				]),
		...(executionOptions.format === undefined
			? []
			: ["--format", executionOptions.format]),
		...(executionOptions.readerMimePolicy === undefined
			? []
			: ["--reader-mime-policy", executionOptions.readerMimePolicy]),
		...(executionOptions.outputLimitPolicy === undefined
			? []
			: ["--output-limit-policy", executionOptions.outputLimitPolicy]),
		...(executionOptions.contentFocus === undefined
			? []
			: ["--content-focus", executionOptions.contentFocus]),
		...(executionOptions.tableMetadata ? ["--table-metadata"] : []),
		...(executionOptions.compactTables ? ["--compact-tables"] : []),
		...(executionOptions.tableRows ? ["--table-rows"] : []),
		...(executionOptions.minRequestIntervalMs === undefined
			? []
			: [
					"--min-request-interval-ms",
					String(executionOptions.minRequestIntervalMs),
				]),
		...(documentProfile === undefined
			? []
			: ["--document-profile", selectedDocumentProfile]),
		...(reader ? ["--reader"] : []),
		...(captureBody ? ["--capture-body"] : []),
		...(headings ? ["--headings"] : []),
		...(find === undefined ? [] : ["--find", find]),
		...(selector === undefined ? [] : ["--selector", selector]),
		...(section === undefined ? [] : ["--section", section]),
		...(lineRange === undefined
			? []
			: ["--lines", `${lineRange.start}:${lineRange.end}`]),
		url,
	]);
	const admissionLimits =
		validated.documentProfile === "long-v1"
			? researchLongDocumentAdmission
			: undefined;
	const started = Date.now();
	const fragment = researchFragmentReport(validated.urls[0]);
	const report: ResearchNavigationReport = {
		...(validated.httpsRedirectPolicy === undefined
			? {}
			: { httpsRedirectPolicy: validated.httpsRedirectPolicy }),
		...(validated.readerFallbackEncoding === undefined
			? {}
			: { readerFallbackEncoding: validated.readerFallbackEncoding }),
		...(validated.contentFocus === undefined
			? {}
			: { contentFocus: validated.contentFocus }),
		...(validated.readerMimePolicy === undefined
			? {}
			: { readerMimePolicy: validated.readerMimePolicy }),
		...(validated.outputLimitPolicy === undefined
			? {}
			: { outputLimitPolicy: validated.outputLimitPolicy }),
		...(validated.preferMarkdown
			? { representationPreference: "markdown" as const }
			: {}),
		...(fragment === undefined ? {} : { fragment }),
		...(admissionLimits ? { admission: researchLongAdmissionProvenance } : {}),
		...(validated.readerRawPolicy === undefined
			? {}
			: { readerRawPolicy: validated.readerRawPolicy }),
		...(validated.readerVisibilityPolicy === undefined
			? {}
			: { readerVisibilityPolicy: validated.readerVisibilityPolicy }),
		requestedUrl: reportUrl(validated.urls[0]),
		finalUrl: null,
		startedAt: new Date(started).toISOString(),
		finishedAt: "",
		elapsedMs: 0,
		profile: reader ? researchReaderProfile : "native",
		partial: true,
		contentSuccess: null,
		classification: {
			classifier: "browser-challenges",
			barrier: null,
			diagnostic: null,
		},
		primaryResponse: null,
		...(validated.selector === undefined
			? {}
			: { selection: { method: "css-selector" as const, matches: null } }),
		...(validated.lines === undefined
			? {}
			: { selection: { method: "text-lines" as const, ...validated.lines } }),
		...(validated.jsonPointer === undefined
			? {}
			: {
					selection: {
						method: "json-pointer" as const,
						pointer: validated.jsonPointer,
					},
				}),
		...(validated.section === undefined
			? {}
			: { selection: { method: "heading-section" as const, matches: null } }),
		...(validated.headings
			? { selection: { method: "heading-outline" as const } }
			: {}),
		...(validated.find === undefined
			? {}
			: { selection: { method: "text-line-discovery" as const } }),
		outcome: "failure",
	};
	let stage = "setup";
	let session: BrowserSession | undefined;
	let transport: NodeNetworkTransport | undefined;
	let primaryStarted = false;
	let primaryHeaders: NetworkResponse["headers"] = {};
	let primaryUrl: string | undefined;
	let rateLimited = false;
	const stopForRateLimit = (): never => {
		report.outcome = "http-failure";
		stage = "rate-limit";
		throw new AgentBrowserError("policy-denied", "Research rate limit reached");
	};
	let visibilityTitle: string | undefined;
	try {
		session = new BrowserSession({
			createTransport: (cookieJar) => {
				const native = new NodeNetworkTransport({
					cookieJar,
					limits: admissionLimits?.network ?? researchRunLimits.network,
					...(validated.httpsRedirectPolicy === undefined
						? {}
						: { httpsRedirectPolicy: validated.httpsRedirectPolicy }),
					...(validated.minRequestIntervalMs === undefined
						? {}
						: { minRequestIntervalMs: validated.minRequestIntervalMs }),
				});
				transport = native;
				return {
					async request(request) {
						if (rateLimited) stopForRateLimit();
						const primary = !primaryStarted;
						primaryStarted = true;
						if (primary) stage = "network";
						if (
							(request.method ?? "GET") !== "GET" ||
							request.body !== undefined
						)
							throw new AgentBrowserError(
								"policy-denied",
								"Research is read only",
							);
						for (const name of Object.keys(request.headers ?? {})) {
							if (
								["authorization", "proxy-authorization", "cookie"].includes(
									name.toLowerCase(),
								)
							)
								throw new AgentBrowserError(
									"policy-denied",
									"Research credentials are disabled",
								);
						}
						const response = await native.request({
							...request,
							...(validated.preferMarkdown
								? {
										headers: {
											...request.headers,
											accept: "text/markdown, text/html;q=0.9",
										},
									}
								: {}),
							cookieContext: {
								siteUrl: null,
								...request.cookieContext,
								credentials: "omit",
							},
						});
						if (response.status === 429) {
							rateLimited = true;
							const receivedAt = Date.now();
							const retryAfter = parseRetryAfter(response.headers, receivedAt);
							report.rateLimit = {
								kind: "http-rate-limit",
								status: 429,
								url: reportUrl(response.url),
								receivedAt: new Date(receivedAt).toISOString(),
								action: "stop-without-retry",
								...(retryAfter ? { retryAfter } : {}),
							};
						}
						if (primary) {
							const fragment = researchFragmentReport(
								validated.urls[0],
								response.url,
							);
							if (fragment !== undefined) report.fragment = fragment;
							report.primaryResponse = summarizePrimaryResponse(response);
							report.finalUrl = report.primaryResponse.url;
							if (response.status < 200 || response.status >= 300)
								report.outcome = "http-failure";
							if (captureBody) {
								stage = "body-capture";
								report.bodyCapture = admissionLimits
									? captureResearchBody(response.body, "long-v1")
									: captureResearchBody(response.body);
							}
							primaryHeaders = response.headers;
							primaryUrl = response.url;
							const diagnostic = classifyBrowserChallenge({
								status: response.status,
								headers: primaryHeaders,
							});
							if (diagnostic) {
								report.classification.diagnostic = diagnostic;
								report.classification.barrier = diagnostic.kind;
								report.outcome = "semantic-barrier";
								stage = "semantic-barrier";
								throw new AgentBrowserError(
									"policy-denied",
									"Research barrier requires user handoff",
								);
							}
							stage = "navigation";
						}
						if (rateLimited) stopForRateLimit();
						return response;
					},
					metrics: () => native.metrics(),
					close: () => native.close(),
				};
			},
			loadDocument: (response, context) => {
				stage = "loader";
				if (!reader) return loadBrowserDocument(response, context);
				const decodingArguments: [
					ResearchReaderMimePolicy?,
					ResearchReaderFallbackEncoding?,
				] =
					validated.readerFallbackEncoding !== undefined
						? [validated.readerMimePolicy, validated.readerFallbackEncoding]
						: validated.readerMimePolicy
							? [validated.readerMimePolicy]
							: [];
				if (validated.readerVisibilityPolicy !== undefined) {
					const evidence = researchVisibilityEvidence(
						response,
						context,
						validated.documentProfile,
						validated.readerRawPolicy,
						{
							method: validated.headings
								? "heading-outline"
								: validated.section !== undefined
									? "heading-section"
									: validated.selector !== undefined
										? "css-selector"
										: "document",
							target: validated.section ?? validated.selector,
							format: validated.format ?? "markdown",
							tableMetadata: validated.tableMetadata,
							tableRows: validated.tableRows,
							compactTables: validated.compactTables,
							limits: {
								maxBytes: researchRunLimits.extractionBytes,
								maxNodes: 50_000,
								maxDepth: 128,
							},
							headingLimits: admissionLimits?.headings,
						},
						...decodingArguments,
					);
					visibilityTitle = evidence?.title;
					const diagnostic = evidence?.diagnostic;
					if (diagnostic) {
						report.classification.diagnostic = diagnostic;
						report.classification.barrier = diagnostic.kind;
						report.outcome = "semantic-barrier";
						stage = "semantic-barrier";
						throw new AgentBrowserError(
							"policy-denied",
							"Research barrier requires user handoff",
						);
					}
					return loadResearchDocument(
						response,
						context,
						validated.documentProfile,
						validated.readerRawPolicy,
						validated.readerVisibilityPolicy,
						...decodingArguments,
					);
				}
				if (validated.readerFallbackEncoding !== undefined)
					return loadResearchDocument(
						response,
						context,
						validated.documentProfile,
						validated.readerRawPolicy,
						undefined,
						validated.readerMimePolicy,
						validated.readerFallbackEncoding,
					);
				if (validated.readerMimePolicy !== undefined)
					return loadResearchDocument(
						response,
						context,
						validated.documentProfile,
						validated.readerRawPolicy,
						undefined,
						validated.readerMimePolicy,
					);
				if (validated.readerRawPolicy !== undefined)
					return loadResearchDocument(
						response,
						context,
						validated.documentProfile,
						validated.readerRawPolicy,
					);
				return admissionLimits
					? loadResearchDocument(response, context, "long-v1")
					: loadResearchDocument(response, context);
			},
			limits: {
				maxTabs: 1,
				maxNavigations: 1,
				navigationTimeoutMs:
					admissionLimits?.navigationTimeoutMs ??
					researchRunLimits.navigationTimeoutMs,
			},
			documentLimits: admissionLimits?.document ?? {
				maxNodes: 50_000,
				maxDepth: 128,
				maxTextCodeUnits: 2_000_000,
			},
		});
		const tab = session.createTab();
		const navigation = await session.navigate(tab.id, validated.urls[0], {
			signal,
		});
		if (rateLimited) stopForRateLimit();
		report.navigation = {
			...navigation,
			url: navigation.url ? reportUrl(navigation.url) : null,
			...(navigation.response
				? {
						response: {
							...navigation.response,
							url: reportUrl(navigation.response.url),
						},
					}
				: {}),
		};
		stage = "extraction";
		if (navigation.kind !== "document")
			throw new AgentBrowserError(
				"unsupported",
				"Research requires a document",
			);
		const page = session.page(tab.id);
		const tree = page.document;
		report.reader = researchReaderInfo(tree);
		const status = report.primaryResponse?.status ?? 0;
		let root: string | undefined;
		let sectionRoot: string | undefined;
		stage = "document-classification";
		const documentDiagnostic = classifyResearchVisibility(
			{
				status,
				headers: primaryHeaders,
				url: primaryUrl,
				title: documentTitle(tree),
				text: researchDocumentDiagnosticText(tree),
			},
			visibilityTitle,
			report.reader?.mimeInterpretation,
		);
		if (documentDiagnostic) {
			report.classification.diagnostic = documentDiagnostic;
			report.classification.barrier = documentDiagnostic.kind;
			report.outcome = "semantic-barrier";
			stage = "semantic-barrier";
			throw new AgentBrowserError(
				"policy-denied",
				"Research barrier requires user handoff",
			);
		}
		const resolvedFragment = researchFragmentReport(
			validated.urls[0],
			tree.url,
			tree,
		);
		if (resolvedFragment !== undefined) report.fragment = resolvedFragment;
		if (validated.find !== undefined) {
			stage = "extraction";
			const found = discoverDocumentTextLines(tree, validated.find, {
				maxBytes: researchRunLimits.extractionBytes,
			});
			report.outcome =
				status < 200 || status >= 300
					? "http-failure"
					: found.entries.length
						? "extracted-unverified"
						: "empty-extraction";
			if (report.outcome !== "extracted-unverified")
				report.contentSuccess = false;
			report.textLines = found;
			return report;
		}
		if (validated.headings) {
			stage = "extraction";
			const outline = discoverDocumentHeadings(
				tree,
				admissionLimits?.headings ?? {
					maxBytes: researchRunLimits.extractionBytes,
					maxNodes: 50_000,
					maxDepth: 128,
				},
			);
			report.classification.diagnostic = classifyResearchVisibility(
				{
					status,
					headers: primaryHeaders,
					url: primaryUrl,
					title: documentTitle(tree),
					text: outline.entries
						.map((entry) => entry.title)
						.join("\n")
						.slice(0, researchRunLimits.diagnosticTextCodeUnits),
				},
				visibilityTitle,
				report.reader?.mimeInterpretation,
			);
			report.classification.barrier =
				report.classification.diagnostic?.kind ?? null;
			report.outcome = report.classification.barrier
				? "semantic-barrier"
				: status < 200 || status >= 300
					? "http-failure"
					: outline.entries.length
						? "extracted-unverified"
						: "empty-extraction";
			if (report.outcome !== "extracted-unverified")
				report.contentSuccess = false;
			report.headings = outline;
			return report;
		}
		const selectedSelector = validated.section ?? validated.selector;
		if (selectedSelector !== undefined) {
			stage = "selection";
			const matches = page.queries.querySelectorAll(selectedSelector);
			report.selection =
				validated.section === undefined
					? { method: "css-selector", matches: matches.length }
					: { method: "heading-section", matches: matches.length };
			if (matches.length !== 1)
				throw new AgentBrowserError(
					matches.length ? "invalid-input" : "not-found",
					"Research selector requires one element",
				);
			if (validated.section === undefined) root = tree.reference(matches[0]);
			else sectionRoot = tree.reference(matches[0]);
		}
		stage = "extraction";
		let extractionBudget = researchRunLimits.extractionBytes;
		if (validated.outputLimitPolicy !== undefined) {
			const sourceUrl = new URL(tree.url);
			sourceUrl.username = "";
			sourceUrl.password = "";
			const encoder = new TextEncoder();
			extractionBudget -= Math.max(
				0,
				encoder.encode(JSON.stringify(reportUrl(sourceUrl.href))).byteLength -
					encoder.encode(JSON.stringify(sourceUrl.href)).byteLength,
			);
		}
		const extraction = extractDocument(tree, {
			format: validated.format ?? "markdown",
			...(validated.contentFocus === undefined
				? {}
				: { contentFocus: validated.contentFocus }),
			...(validated.outputLimitPolicy === undefined
				? {}
				: { outputLimitPolicy: validated.outputLimitPolicy }),
			...(validated.tableMetadata ? { tableMetadata: true } : {}),
			...(validated.compactTables ? { compactTables: true } : {}),
			...(validated.tableRows ? { tableRows: true } : {}),
			...(root === undefined ? {} : { root }),
			...(validated.lines === undefined ? {} : { lines: validated.lines }),
			...(validated.jsonPointer === undefined
				? {}
				: { jsonPointer: validated.jsonPointer }),
			...(sectionRoot === undefined ? {} : { section: sectionRoot }),
			maxBytes: extractionBudget,
			maxNodes: 50_000,
			maxDepth: 128,
		});
		report.classification.diagnostic = classifyResearchVisibility(
			{
				status,
				headers: primaryHeaders,
				url: primaryUrl,
				title: extraction.title,
				text: researchExtractionDiagnosticText(extraction),
			},
			visibilityTitle,
			report.reader?.mimeInterpretation,
		);
		report.classification.barrier =
			report.classification.diagnostic?.kind ?? null;
		if (report.classification.barrier) report.outcome = "semantic-barrier";
		else if (status < 200 || status >= 300) report.outcome = "http-failure";
		else if (!hasResearchExtractionContent(extraction))
			report.outcome = "empty-extraction";
		else report.outcome = "extracted-unverified";
		if (report.outcome !== "extracted-unverified")
			report.contentSuccess = false;
		report.extraction = { ...extraction, url: reportUrl(extraction.url) };
	} catch (error) {
		const resourceLimit =
			error instanceof AgentBrowserError && error.code === "resource-limit"
				? resourceLimitDiagnostic(error)
				: undefined;
		const networkPolicy =
			error instanceof AgentBrowserError && error.code === "policy-denied"
				? networkPolicyDiagnostic(error)
				: undefined;
		report.failure = {
			category:
				error instanceof AgentBrowserError ? error.code : "internal-error",
			stage,
			...(resourceLimit ? { resourceLimit } : {}),
			...(networkPolicy ? { networkPolicy } : {}),
		};
		report.contentSuccess = false;
	} finally {
		session?.close();
		report.metrics = transport?.metrics();
		report.finishedAt = new Date().toISOString();
		report.elapsedMs = Date.now() - started;
	}
	return report;
}

export async function* researchBatch(
	args: readonly string[],
	signal?: AbortSignal,
): AsyncGenerator<ResearchNavigationReport> {
	const options = parseResearchArguments(args);
	const pacer = options.minRequestIntervalMs
		? new OriginRequestPacer(options.minRequestIntervalMs)
		: undefined;
	const batchSignal = signal ?? new AbortController().signal;
	try {
		for (const url of options.urls) {
			await pacer?.wait(new URL(url).origin, batchSignal);
			const report = await researchNavigation(
				url,
				options.reader,
				signal,
				options.selector,
				options.captureBody,
				options.lines,
				options.section,
				options.headings,
				options.find,
				options.documentProfile,
				{
					...(options.jsonPointer === undefined
						? {}
						: { jsonPointer: options.jsonPointer }),
					...(options.httpsRedirectPolicy === undefined
						? {}
						: { httpsRedirectPolicy: options.httpsRedirectPolicy }),
					preferMarkdown: options.preferMarkdown,
					readerMimePolicy: options.readerMimePolicy,
					...(options.readerFallbackEncoding === undefined
						? {}
						: { readerFallbackEncoding: options.readerFallbackEncoding }),
					outputLimitPolicy: options.outputLimitPolicy,
					contentFocus: options.contentFocus,
					...(options.readerRawPolicy === undefined
						? {}
						: { readerRawPolicy: options.readerRawPolicy }),
					...(options.readerVisibilityPolicy === undefined
						? {}
						: { readerVisibilityPolicy: options.readerVisibilityPolicy }),
					format: options.format,
					tableMetadata: options.tableMetadata,
					compactTables: options.compactTables,
					tableRows: options.tableRows,
					minRequestIntervalMs: options.minRequestIntervalMs,
				},
			);
			const stop =
				report.outcome === "semantic-barrier" ||
				report.classification.barrier !== null ||
				report.rateLimit !== undefined ||
				report.primaryResponse?.status === 429;
			yield report;
			if (stop) return;
		}
	} finally {
		pacer?.close();
	}
}

export function researchExitCode(reports: readonly ResearchExitReport[]) {
	const successes = reports.filter(
		(report) => report.outcome === "extracted-unverified",
	).length;
	return successes === reports.length && successes > 0
		? 0
		: successes > 0
			? 2
			: 1;
}

function outputFailure() {
	return new AgentBrowserError(
		"closed",
		"Research output could not be written",
	);
}

export async function emitResearchReport(
	output: Writable,
	report: ResearchNavigationReport,
	documentProfile?: ResearchDocumentProfileId,
): Promise<ResearchExitReport> {
	const emission = serializeResearchReport(report, documentProfile);
	if (output.destroyed || output.writableEnded || output.errored)
		throw outputFailure();
	await new Promise<void>((resolve, reject) => {
		let settled = false;
		const cleanup = () => {
			output.off("error", onError);
			output.off("close", onClose);
		};
		const fail = () => {
			if (settled) return;
			settled = true;
			reject(outputFailure());
		};
		const onError = () => {
			cleanup();
			fail();
		};
		const onClose = () => {
			cleanup();
			fail();
		};
		output.once("error", onError);
		output.once("close", onClose);
		try {
			output.write(emission.jsonl, (error) => {
				if (error) {
					fail();
					return;
				}
				cleanup();
				if (settled) return;
				settled = true;
				resolve();
			});
		} catch {
			cleanup();
			fail();
		}
	});
	return emission.exitReport;
}

async function main() {
	const args = process.argv.slice(2);
	const { documentProfile } = parseResearchArguments(args);
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(),
		documentProfile === "long-v1"
			? researchLongDocumentAdmission.deadlineMs
			: researchRunLimits.deadlineMs,
	);
	const reports: ResearchExitReport[] = [];
	let outputFailed = false;
	const onOutputError = () => {
		outputFailed = true;
		controller.abort();
	};
	process.stdout.on("error", onOutputError);
	try {
		for await (const report of researchBatch(args, controller.signal)) {
			if (outputFailed) throw outputFailure();
			reports.push(
				await emitResearchReport(process.stdout, report, documentProfile),
			);
		}
		process.exitCode = outputFailed ? 1 : researchExitCode(reports);
	} catch {
		outputFailed = true;
		controller.abort();
		process.stderr.write("Research execution or output failed.\n");
		process.exitCode = 1;
	} finally {
		clearTimeout(timer);
		if (!outputFailed) process.stdout.off("error", onOutputError);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void main().catch(() => {
		process.stderr.write(
			"Usage: research-browser [--document-profile default|long-v1] [--reader] [--https-redirect-policy same-origin-upgrade-v1] [--prefer-markdown] [--reader-fallback-encoding utf-8] [--reader-raw-policy separate-omitted-raw-v1] [--reader-visibility-policy source-hidden-v1|source-hidden-inline-v1] [--reader-mime-policy markdown-html-document-v1] [--capture-body] [--format markdown|json] [--output-limit-policy text-prefix-v1] [--content-focus main-content-v1|main-content-v2|main-content-v3] [--table-metadata] [--compact-tables] [--table-rows] [--min-request-interval-ms 0..60000] [--selector CSS | --lines START:END | --json-pointer POINTER | --section CSS | --headings | --find QUERY] PUBLIC_HTTP_URL... (1–8 URLs; empty JSON pointer selects root; JSON pointer excludes content-focus, text-prefix and long-v1; long-v1 requires one reader capture with headings; reader policies and fallback encoding require reader; UTF-8 fallback applies only to HTML without a stronger charset; MIME repair requires default reader DOM operations; text-prefix requires reader Markdown extraction; content-focus excludes manual selection/discovery; compact/row tables require Markdown; prefer-markdown requires default reader without DOM selection)\n",
		);
		process.exitCode = 64;
	});
}
