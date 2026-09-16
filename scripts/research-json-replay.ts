import { types } from "node:util";
import type { BrowserChallengeDiagnostic } from "../src/browser-challenges.js";
import { documentTitle } from "../src/document-title.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import type { ContentFocusPolicy } from "../src/extraction-content-focus.js";
import {
	type DocumentExtraction,
	type DocumentHeadingOutline,
	type DocumentLinkDiscovery,
	type DocumentTextLineDiscovery,
	discoverDocumentHeadings,
	discoverDocumentLinks,
	discoverDocumentTextLines,
	extractDocument,
} from "../src/extraction.js";
import { validateJsonSourcePointer } from "../src/json-source-selection.js";
import { type NetworkResponse, parseNetworkUrl } from "../src/network.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "../src/research-admission.js";
import { loadResearchDocument } from "../src/research-loader.js";
import {
	type ResearchMimeInterpretation,
	type ResearchReaderMimePolicy,
	researchMimePrefixLimits,
	validateResearchReaderMimePolicy,
} from "../src/research-mime-policy.js";
import {
	type ResearchReaderFallbackEncoding,
	type ResearchReaderRawPolicy,
	type ResearchReaderReport,
	type ResearchReaderVisibilityPolicy,
	researchReaderHiddenContentSemantics,
	researchReaderInfo,
	validateResearchReaderFallbackEncoding,
	validateResearchReaderRawPolicy,
	validateResearchReaderVisibilityPolicy,
} from "../src/research-reader-info.js";
import { DocumentQueries, validateSelectorSyntax } from "../src/selectors.js";
import type { DocumentLoaderContext } from "../src/session.js";
import {
	type ResearchBodyPin,
	type ResearchEmptyOutlineRecovery,
	type ResearchOutputLimitSectionRecovery,
	type ResearchReplayAdmission,
	type TrustedResearchReplayAdmission,
	validateResearchEmptyOutlineAdmission,
	validateResearchOutputLimitSectionAdmission,
	validateResearchReplayAdmission,
} from "./research-admission-evidence.js";
import {
	hasResearchExtractionContent,
	researchDocumentDiagnosticText,
	researchExtractionDiagnosticText,
	researchLinkDiagnosticText,
} from "./research-content.js";
import {
	classifyResearchVisibility,
	researchVisibilityEvidence,
} from "./research-visibility.js";

export const researchJsonReplayLimits = Object.freeze({
	maxSelectorCodeUnits: 4_096,
	maxExtractionBytes: 256_000,
	maxOutputBytes: 327_680,
	maxNodes: 50_000,
	maxDepth: 128,
	timeoutMs: 20_000,
});

export interface ResearchReplayLineRange {
	start: number;
	end: number;
}

type ResearchHtmlReplaySelection =
	| ((
			| {
					selector: string;
					section?: never;
					links?: never;
					contentFocus?: never;
			  }
			| {
					section: string;
					selector?: never;
					links?: never;
					contentFocus?: never;
			  }
			| {
					contentFocus: ContentFocusPolicy;
					selector?: never;
					section?: never;
					links?: never;
			  }
	  ) & {
			tableMetadata?: boolean;
			tableRows?: boolean;
			compactTables?: boolean;
			outputLimitPolicy?: "text-prefix-v1";
			readerMimePolicy?: ResearchReaderMimePolicy;
	  })
	| {
			links: string;
			contentFocus?: never;
			selector?: never;
			section?: never;
			tableMetadata?: never;
			tableRows?: never;
			compactTables?: never;
			outputLimitPolicy?: never;
			readerMimePolicy?: never;
	  };

export type ResearchJsonReplaySelection =
	| (ResearchHtmlReplaySelection & {
			lines?: never;
			find?: never;
			jsonPointer?: never;
	  })
	| ((
			| { lines: ResearchReplayLineRange; find?: never; jsonPointer?: never }
			| { find: string; lines?: never; jsonPointer?: never }
			| { jsonPointer: string; lines?: never; find?: never }
	  ) & {
			selector?: never;
			section?: never;
			links?: never;
			contentFocus?: never;
			tableMetadata?: never;
			tableRows?: never;
			compactTables?: never;
			outputLimitPolicy?: never;
			readerMimePolicy?: never;
	  });

export interface ResearchOutputLimitSectionSelection {
	section: string;
	tableMetadata?: boolean;
	tableRows?: boolean;
	compactTables?: boolean;
}

export interface ResearchOutputLimitSelectorSelection {
	selector: string;
	tableMetadata?: boolean;
	tableRows?: boolean;
	compactTables?: boolean;
}

export interface ResearchOutputLimitContentFocusSelection {
	contentFocus: ContentFocusPolicy;
	tableMetadata?: boolean;
	tableRows?: boolean;
	compactTables?: boolean;
}

export type ResearchEmptyOutlineSelectorSelection =
	ResearchOutputLimitSelectorSelection;

export type ResearchOutputLimitSelectorRecovery = Omit<
	ResearchOutputLimitSectionRecovery,
	"kind"
> & { readonly kind: "captured-output-limit-selector" };

export type ResearchOutputLimitContentFocusRecovery = Omit<
	ResearchOutputLimitSectionRecovery,
	"kind"
> & { readonly kind: "captured-output-limit-content-focus" };

export type ResearchOutputLimitOutlineRecovery = Omit<
	ResearchOutputLimitSectionRecovery,
	"kind"
> & { readonly kind: "captured-output-limit-outline" };

export type ResearchReplayFormat = "json" | "markdown";

type ReplayDocumentByFormat = {
	[Format in ResearchReplayFormat]: Extract<
		DocumentExtraction,
		{ format: Format }
	>;
};

export interface ResearchJsonReplayReport<
	Format extends ResearchReplayFormat = "json",
> {
	kind: "native-research-json-replay-v1";
	partial: true;
	contentSuccess: null | false;
	outcome: "extracted-unverified" | "empty-extraction" | "semantic-barrier";
	networkRequests: 0;
	source: {
		profile: ResearchDocumentProfileId;
		reportedFinalUrl: string;
		receiptSha256: string;
		body: ResearchBodyPin;
	};
	selection: {
		method:
			| "css-selector"
			| "content-focus"
			| "heading-section"
			| "link-url-search"
			| "heading-outline"
			| "json-pointer"
			| "text-lines"
			| "text-line-discovery";
		matches: number | null;
		pointer?: string;
		outputLimitPolicy?: "text-prefix-v1";
		readerMimePolicy?: ResearchReaderMimePolicy;
	};
	classification: {
		barrier: BrowserChallengeDiagnostic["kind"] | null;
		diagnostic: BrowserChallengeDiagnostic | null;
	};
	reader?: Readonly<ResearchReaderReport>;
	extraction?: ReplayDocumentByFormat[Format];
	links?: DocumentLinkDiscovery;
	headings?: DocumentHeadingOutline;
	textLines?: DocumentTextLineDiscovery;
	recovery?:
		| ResearchEmptyOutlineRecovery
		| ResearchOutputLimitSectionRecovery
		| ResearchOutputLimitSelectorRecovery
		| ResearchOutputLimitContentFocusRecovery
		| ResearchOutputLimitOutlineRecovery;
}

export interface ResearchJsonReplayExtraction<
	Format extends ResearchReplayFormat = "json",
> {
	report: ResearchJsonReplayReport<Format>;
	jsonl: string;
	outputBytes: number;
}

export interface ResearchOutputLimitSectionExtraction<
	Format extends ResearchReplayFormat = "json",
> extends ResearchJsonReplayExtraction<Format> {
	report: ResearchJsonReplayReport<Format> & {
		recovery: ResearchOutputLimitSectionRecovery;
	};
}

export interface ResearchOutputLimitOutlineExtraction
	extends ResearchJsonReplayExtraction {
	report: ResearchJsonReplayReport & {
		recovery: ResearchOutputLimitOutlineRecovery;
	};
}

export interface ResearchOutputLimitSelectorExtraction<
	Format extends ResearchReplayFormat = "json",
> extends ResearchJsonReplayExtraction<Format> {
	report: ResearchJsonReplayReport<Format> & {
		recovery: ResearchOutputLimitSelectorRecovery;
	};
}

export interface ResearchEmptyOutlineSelectorExtraction<
	Format extends ResearchReplayFormat = "json",
> extends ResearchJsonReplayExtraction<Format> {
	report: ResearchJsonReplayReport<Format> & {
		recovery: ResearchEmptyOutlineRecovery;
	};
}

export interface ResearchOutputLimitContentFocusExtraction<
	Format extends ResearchReplayFormat = "json",
> extends ResearchJsonReplayExtraction<Format> {
	report: ResearchJsonReplayReport<Format> & {
		recovery: ResearchOutputLimitContentFocusRecovery;
	};
}

function invalidSelection(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research replay selection",
	);
}

function lineRangeSnapshot(value: unknown): Readonly<ResearchReplayLineRange> {
	if (
		!value ||
		typeof value !== "object" ||
		types.isProxy(value) ||
		Array.isArray(value)
	)
		invalidSelection();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) invalidSelection();
	const keys = Reflect.ownKeys(value);
	if (
		keys.length !== 2 ||
		!keys.every((key) => key === "start" || key === "end")
	)
		invalidSelection();
	const startDescriptor = Object.getOwnPropertyDescriptor(value, "start");
	const endDescriptor = Object.getOwnPropertyDescriptor(value, "end");
	if (
		!startDescriptor ||
		!endDescriptor ||
		!Object.hasOwn(startDescriptor, "value") ||
		!Object.hasOwn(endDescriptor, "value")
	)
		invalidSelection();
	const start: unknown = startDescriptor.value;
	const end: unknown = endDescriptor.value;
	if (
		typeof start !== "number" ||
		typeof end !== "number" ||
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start < 1 ||
		end < start ||
		end > 2_000_001
	)
		invalidSelection();
	return Object.freeze({ start, end });
}

function selectionSnapshot(value: unknown) {
	if (
		!value ||
		typeof value !== "object" ||
		types.isProxy(value) ||
		Array.isArray(value)
	)
		invalidSelection();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) invalidSelection();
	const keys = Reflect.ownKeys(value);
	if (
		keys.length < 1 ||
		keys.length > 6 ||
		!keys.every(
			(key) =>
				typeof key === "string" &&
				[
					"selector",
					"section",
					"links",
					"lines",
					"find",
					"jsonPointer",
					"contentFocus",
					"tableMetadata",
					"tableRows",
					"compactTables",
					"outputLimitPolicy",
					"readerMimePolicy",
				].includes(key),
		)
	)
		invalidSelection();
	const fields: Record<string, unknown> = Object.create(null);
	for (const key of keys) {
		if (typeof key !== "string") invalidSelection();
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) invalidSelection();
		fields[key] = descriptor.value;
	}
	if (
		[
			"selector",
			"section",
			"links",
			"lines",
			"find",
			"jsonPointer",
			"contentFocus",
		].filter((key) => Object.hasOwn(fields, key)).length !== 1
	)
		invalidSelection();
	if (Object.hasOwn(fields, "jsonPointer")) {
		if (keys.length !== 1) invalidSelection();
		return {
			method: "json-pointer" as const,
			target: validateJsonSourcePointer(fields.jsonPointer),
			tableMetadata: false,
			tableRows: false,
			compactTables: false,
			outputLimitPolicy: undefined,
			readerMimePolicy: undefined,
		};
	}
	if (Object.hasOwn(fields, "lines")) {
		if (keys.length !== 1) invalidSelection();
		return {
			method: "text-lines" as const,
			target: "",
			lines: lineRangeSnapshot(fields.lines),
			tableMetadata: false,
			tableRows: false,
			compactTables: false,
			outputLimitPolicy: undefined,
			readerMimePolicy: undefined,
		};
	}
	if (Object.hasOwn(fields, "find")) {
		const query = fields.find;
		if (
			keys.length !== 1 ||
			typeof query !== "string" ||
			query.length < 1 ||
			query.length > 256 ||
			/[\r\n]/.test(query)
		)
			invalidSelection();
		return {
			method: "text-line-discovery" as const,
			target: query,
			tableMetadata: false,
			tableRows: false,
			compactTables: false,
			outputLimitPolicy: undefined,
			readerMimePolicy: undefined,
		};
	}
	const section = Object.hasOwn(fields, "section");
	const links = Object.hasOwn(fields, "links");
	const focus = Object.hasOwn(fields, "contentFocus");
	const target = focus
		? fields.contentFocus
		: links
			? fields.links
			: section
				? fields.section
				: fields.selector;
	if (
		typeof target !== "string" ||
		!target.length ||
		target.trim() !== target ||
		target.length > researchJsonReplayLimits.maxSelectorCodeUnits ||
		(fields.tableMetadata !== undefined &&
			typeof fields.tableMetadata !== "boolean") ||
		(fields.tableRows !== undefined && typeof fields.tableRows !== "boolean") ||
		(fields.compactTables !== undefined &&
			typeof fields.compactTables !== "boolean") ||
		(Object.hasOwn(fields, "outputLimitPolicy") &&
			fields.outputLimitPolicy !== "text-prefix-v1") ||
		(Object.hasOwn(fields, "readerMimePolicy") &&
			fields.readerMimePolicy !== "markdown-html-document-v1")
	)
		invalidSelection();
	if (focus) {
		if (
			target !== "main-content-v1" &&
			target !== "main-content-v2" &&
			target !== "main-content-v3"
		)
			invalidSelection();
	} else if (links) {
		if (
			target.length > 256 ||
			Array.from(target).some(
				(character) =>
					character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
			) ||
			Object.hasOwn(fields, "tableMetadata") ||
			Object.hasOwn(fields, "tableRows") ||
			Object.hasOwn(fields, "compactTables") ||
			Object.hasOwn(fields, "outputLimitPolicy") ||
			Object.hasOwn(fields, "readerMimePolicy")
		)
			invalidSelection();
	} else {
		try {
			validateSelectorSyntax(target, { pseudoElements: false });
		} catch {
			invalidSelection();
		}
	}
	return {
		method: focus
			? ("content-focus" as const)
			: links
				? ("link-url-search" as const)
				: section
					? ("heading-section" as const)
					: ("css-selector" as const),
		target,
		tableMetadata: fields.tableMetadata === true,
		tableRows: fields.tableRows === true,
		compactTables: fields.compactTables === true,
		outputLimitPolicy:
			fields.outputLimitPolicy === "text-prefix-v1"
				? ("text-prefix-v1" as const)
				: undefined,
		readerMimePolicy:
			fields.readerMimePolicy === "markdown-html-document-v1"
				? ("markdown-html-document-v1" as const)
				: undefined,
	};
}

function replayRawPolicy(
	metadata: Readonly<Record<string, unknown>>,
): ResearchReaderRawPolicy | undefined {
	const topDeclared = Object.hasOwn(metadata, "readerRawPolicy");
	const reader = metadata.reader;
	const readerRecord =
		reader !== null && typeof reader === "object" && !Array.isArray(reader)
			? (reader as Record<string, unknown>)
			: undefined;
	const readerDeclared =
		readerRecord !== undefined && Object.hasOwn(readerRecord, "rawTextPolicy");
	const invalid = (): never => {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research replay raw policy",
		);
	};
	if (topDeclared && Object.hasOwn(metadata, "reader") && !readerRecord)
		invalid();
	const declarations = [
		...(topDeclared ? [metadata.readerRawPolicy] : []),
		...(readerDeclared ? [readerRecord?.rawTextPolicy] : []),
	];
	let policy: ResearchReaderRawPolicy | undefined;
	for (const declaration of declarations) {
		const selected = validateResearchReaderRawPolicy(declaration);
		if (selected === undefined || (policy !== undefined && policy !== selected))
			invalid();
		policy = selected;
	}
	return policy;
}

function replayFallbackEncoding(
	metadata: Readonly<Record<string, unknown>>,
): ResearchReaderFallbackEncoding | undefined {
	const topDeclared = Object.hasOwn(metadata, "readerFallbackEncoding");
	const reader = metadata.reader;
	const readerRecord =
		reader !== null && typeof reader === "object" && !Array.isArray(reader)
			? (reader as Record<string, unknown>)
			: undefined;
	const readerDeclared =
		readerRecord !== undefined &&
		Object.hasOwn(readerRecord, "fallbackEncoding");
	if (!topDeclared && !readerDeclared) return undefined;
	const selected = validateResearchReaderFallbackEncoding(
		metadata.readerFallbackEncoding,
	);
	if (
		!topDeclared ||
		!readerDeclared ||
		selected === undefined ||
		readerRecord?.fallbackEncoding !== selected
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research replay fallback encoding",
		);
	return selected;
}

function replayVisibilityPolicy(
	metadata: Readonly<Record<string, unknown>>,
): ResearchReaderVisibilityPolicy | undefined {
	const topDeclared = Object.hasOwn(metadata, "readerVisibilityPolicy");
	const reader = metadata.reader;
	const readerRecord =
		reader !== null && typeof reader === "object" && !Array.isArray(reader)
			? (reader as Record<string, unknown>)
			: undefined;
	const readerDeclared =
		readerRecord !== undefined &&
		Object.hasOwn(readerRecord, "visibilityPolicy");
	const invalid = (): never => {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research replay visibility policy",
		);
	};
	if (topDeclared && Object.hasOwn(metadata, "reader") && !readerRecord)
		invalid();
	let policy: ResearchReaderVisibilityPolicy | undefined;
	for (const declaration of [
		...(topDeclared ? [metadata.readerVisibilityPolicy] : []),
		...(readerDeclared ? [readerRecord?.visibilityPolicy] : []),
	]) {
		const selected = validateResearchReaderVisibilityPolicy(declaration);
		if (selected === undefined || (policy !== undefined && policy !== selected))
			invalid();
		policy = selected;
	}
	if (
		(readerRecord?.hiddenContentSemantics === "source-attributes" ||
			readerRecord?.hiddenContentSemantics ===
				"source-attributes-and-inline-display") &&
		!policy
	)
		invalid();
	if (
		!policy &&
		readerRecord &&
		Object.hasOwn(readerRecord, "sourceHiddenSubtrees")
	)
		invalid();
	return policy;
}

function replayMimePolicy(metadata: Readonly<Record<string, unknown>>): {
	policy?: ResearchReaderMimePolicy;
	interpretation?: Readonly<ResearchMimeInterpretation>;
} {
	const invalid = (): never => {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research replay MIME policy evidence",
		);
	};
	const topDeclared = Object.hasOwn(metadata, "readerMimePolicy");
	const reader = metadata.reader;
	const readerRecord =
		reader !== null && typeof reader === "object" && !Array.isArray(reader)
			? (reader as Record<string, unknown>)
			: undefined;
	if (topDeclared && Object.hasOwn(metadata, "reader") && !readerRecord)
		invalid();
	const readerDeclared =
		readerRecord !== undefined && Object.hasOwn(readerRecord, "mimePolicy");
	const interpretationDeclared =
		readerRecord !== undefined &&
		Object.hasOwn(readerRecord, "mimeInterpretation");
	let policy: ResearchReaderMimePolicy | undefined;
	for (const declaration of [
		...(topDeclared ? [metadata.readerMimePolicy] : []),
		...(readerDeclared ? [readerRecord?.mimePolicy] : []),
	]) {
		const selected = validateResearchReaderMimePolicy(declaration);
		if (selected === undefined || (policy !== undefined && policy !== selected))
			invalid();
		policy = selected;
	}
	if (!interpretationDeclared) {
		if (readerDeclared) invalid();
		return { policy };
	}
	const interpretation = readerRecord?.mimeInterpretation;
	if (
		policy === undefined ||
		interpretation === null ||
		typeof interpretation !== "object" ||
		Array.isArray(interpretation)
	)
		return invalid();
	const fields = interpretation as Record<string, unknown>;
	if (
		Object.keys(fields).length !== 5 ||
		fields.policy !== policy ||
		fields.declaredMime !== "text/markdown" ||
		fields.effectiveMime !== "text/html" ||
		fields.basis !== "html5-doctype-root-prefix" ||
		typeof fields.prefixCodeUnits !== "number" ||
		!Number.isSafeInteger(fields.prefixCodeUnits) ||
		fields.prefixCodeUnits < 1 ||
		fields.prefixCodeUnits > researchMimePrefixLimits.maxCodeUnits
	)
		return invalid();
	return {
		policy,
		interpretation: {
			policy,
			declaredMime: "text/markdown",
			effectiveMime: "text/html",
			basis: "html5-doctype-root-prefix",
			prefixCodeUnits: fields.prefixCodeUnits,
		},
	};
}

function replayCheckpoint(signal?: AbortSignal) {
	const started = performance.now();
	return () => {
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Research JSON replay aborted");
		if (performance.now() - started >= researchJsonReplayLimits.timeoutMs)
			throw new AgentBrowserError("timeout", "Research JSON replay timed out");
	};
}

function validateReplayFormat(
	format: unknown,
	selected: ReturnType<typeof selectionSnapshot>,
): ResearchReplayFormat {
	if (
		(format !== "json" && format !== "markdown") ||
		(format === "markdown" &&
			(selected.method === "link-url-search" ||
				selected.method === "text-line-discovery" ||
				selected.tableMetadata)) ||
		((selected.tableRows ||
			selected.compactTables ||
			selected.outputLimitPolicy) &&
			format !== "markdown")
	)
		throw new AgentBrowserError("invalid-input", "Invalid replay format");
	return format;
}

export function extractResearchReplayJson<Format extends ResearchReplayFormat>(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchJsonReplaySelection,
	signal: AbortSignal | undefined,
	format: Format,
): ResearchJsonReplayExtraction<Format>;
export function extractResearchReplayJson(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchJsonReplaySelection,
	signal?: AbortSignal,
): ResearchJsonReplayExtraction;
export function extractResearchReplayJson(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchJsonReplaySelection,
	signal?: AbortSignal,
	format: ResearchReplayFormat = "json",
): ResearchJsonReplayExtraction<ResearchReplayFormat> {
	const checkpoint = replayCheckpoint(signal);
	checkpoint();
	const selected = selectionSnapshot(selection);
	const selectedFormat = validateReplayFormat(format, selected);
	checkpoint();
	const admission = validateResearchReplayAdmission(rawReceipt, trusted);
	if (admission.kind !== "validated-capture")
		throw new AgentBrowserError(
			"policy-denied",
			"Research replay requires a validated capture",
		);
	return extractValidatedReplayJson(
		admission,
		selected,
		checkpoint,
		signal,
		{},
		selectedFormat,
	);
}

export function recoverResearchOutputLimitSection<
	Format extends ResearchReplayFormat,
>(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitSectionSelection,
	signal: AbortSignal | undefined,
	format: Format,
): ResearchOutputLimitSectionExtraction<Format>;
export function recoverResearchOutputLimitSection(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitSectionSelection,
	signal?: AbortSignal,
): ResearchOutputLimitSectionExtraction;
export function recoverResearchOutputLimitSection(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitSectionSelection,
	signal?: AbortSignal,
	format: ResearchReplayFormat = "json",
): ResearchOutputLimitSectionExtraction<ResearchReplayFormat> {
	const checkpoint = replayCheckpoint(signal);
	checkpoint();
	const selected = selectionSnapshot(selection);
	if (
		selected.method !== "heading-section" ||
		selected.outputLimitPolicy !== undefined ||
		selected.readerMimePolicy !== undefined
	)
		invalidSelection();
	const selectedFormat = validateReplayFormat(format, selected);
	checkpoint();
	const admission = validateResearchOutputLimitSectionAdmission(
		rawReceipt,
		trusted,
	);
	return extractValidatedReplayJson(
		admission,
		selected,
		checkpoint,
		signal,
		{ recovery: admission.recovery },
		selectedFormat,
	);
}

export function recoverResearchOutputLimitSelector<
	Format extends ResearchReplayFormat,
>(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitSelectorSelection,
	signal: AbortSignal | undefined,
	format: Format,
): ResearchOutputLimitSelectorExtraction<Format>;
export function recoverResearchOutputLimitSelector(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitSelectorSelection,
	signal?: AbortSignal,
): ResearchOutputLimitSelectorExtraction;
export function recoverResearchOutputLimitSelector(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitSelectorSelection,
	signal?: AbortSignal,
	format: ResearchReplayFormat = "json",
): ResearchOutputLimitSelectorExtraction<ResearchReplayFormat> {
	const checkpoint = replayCheckpoint(signal);
	checkpoint();
	const selected = selectionSnapshot(selection);
	if (
		selected.method !== "css-selector" ||
		selected.outputLimitPolicy !== undefined ||
		selected.readerMimePolicy !== undefined
	)
		invalidSelection();
	const selectedFormat = validateReplayFormat(format, selected);
	checkpoint();
	const admission = validateResearchOutputLimitSectionAdmission(
		rawReceipt,
		trusted,
	);
	return extractValidatedReplayJson(
		admission,
		selected,
		checkpoint,
		signal,
		{
			recovery: {
				...admission.recovery,
				kind: "captured-output-limit-selector" as const,
			},
		},
		selectedFormat,
	);
}

export function recoverResearchOutputLimitContentFocus<
	Format extends ResearchReplayFormat,
>(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitContentFocusSelection,
	signal: AbortSignal | undefined,
	format: Format,
): ResearchOutputLimitContentFocusExtraction<Format>;
export function recoverResearchOutputLimitContentFocus(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitContentFocusSelection,
	signal?: AbortSignal,
): ResearchOutputLimitContentFocusExtraction;
export function recoverResearchOutputLimitContentFocus(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitContentFocusSelection,
	signal?: AbortSignal,
	format: ResearchReplayFormat = "json",
): ResearchOutputLimitContentFocusExtraction<ResearchReplayFormat> {
	const checkpoint = replayCheckpoint(signal);
	checkpoint();
	const selected = selectionSnapshot(selection);
	if (
		selected.method !== "content-focus" ||
		selected.outputLimitPolicy !== undefined ||
		selected.readerMimePolicy !== undefined
	)
		invalidSelection();
	const selectedFormat = validateReplayFormat(format, selected);
	checkpoint();
	const admission = validateResearchOutputLimitSectionAdmission(
		rawReceipt,
		trusted,
	);
	return extractValidatedReplayJson(
		admission,
		selected,
		checkpoint,
		signal,
		{
			recovery: {
				...admission.recovery,
				kind: "captured-output-limit-content-focus" as const,
			},
		},
		selectedFormat,
	);
}

export function recoverResearchEmptyOutlineSelector<
	Format extends ResearchReplayFormat,
>(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchEmptyOutlineSelectorSelection,
	signal: AbortSignal | undefined,
	format: Format,
): ResearchEmptyOutlineSelectorExtraction<Format>;
export function recoverResearchEmptyOutlineSelector(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchEmptyOutlineSelectorSelection,
	signal?: AbortSignal,
): ResearchEmptyOutlineSelectorExtraction;
export function recoverResearchEmptyOutlineSelector(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchEmptyOutlineSelectorSelection,
	signal?: AbortSignal,
	format: ResearchReplayFormat = "json",
): ResearchEmptyOutlineSelectorExtraction<ResearchReplayFormat> {
	const checkpoint = replayCheckpoint(signal);
	checkpoint();
	const selected = selectionSnapshot(selection);
	if (
		selected.method !== "css-selector" ||
		selected.outputLimitPolicy !== undefined ||
		selected.readerMimePolicy !== undefined
	)
		invalidSelection();
	const selectedFormat = validateReplayFormat(format, selected);
	checkpoint();
	const admission = validateResearchEmptyOutlineAdmission(rawReceipt, trusted);
	return extractValidatedReplayJson(
		admission,
		selected,
		checkpoint,
		signal,
		{ recovery: admission.recovery },
		selectedFormat,
		true,
	);
}

export function outlineResearchOutputLimitCapture(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	signal?: AbortSignal,
): ResearchOutputLimitOutlineExtraction {
	const checkpoint = replayCheckpoint(signal);
	checkpoint();
	const admission = validateResearchOutputLimitSectionAdmission(
		rawReceipt,
		trusted,
	);
	return extractValidatedReplayJson(
		admission,
		{ method: "heading-outline" },
		checkpoint,
		signal,
		{
			recovery: {
				...admission.recovery,
				kind: "captured-output-limit-outline" as const,
			},
		},
		"json",
	);
}

function extractValidatedReplayJson<
	Extra extends object,
	Format extends ResearchReplayFormat,
>(
	admission: Extract<ResearchReplayAdmission, { kind: "validated-capture" }>,
	selected:
		| ReturnType<typeof selectionSnapshot>
		| { method: "heading-outline" },
	checkpoint: () => void,
	signal: AbortSignal | undefined,
	extra: Extra,
	format: Format,
	requireEmptyOutline = false,
): ResearchJsonReplayExtraction<Format> & {
	report: ResearchJsonReplayReport<Format> & Extra;
} {
	let tree: DocumentTree | undefined;
	try {
		checkpoint();
		const rawPolicy = replayRawPolicy(admission.originalMetadata);
		const fallbackEncoding = replayFallbackEncoding(admission.originalMetadata);
		const visibilityPolicy = replayVisibilityPolicy(admission.originalMetadata);
		const { policy: capturedMimePolicy, interpretation: mimeInterpretation } =
			replayMimePolicy(admission.originalMetadata);
		const replayMimePolicyOverride =
			"readerMimePolicy" in selected ? selected.readerMimePolicy : undefined;
		if (
			replayMimePolicyOverride !== undefined &&
			capturedMimePolicy !== undefined
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Replay MIME selection requires an originally uninterpreted capture",
			);
		const mimePolicy = replayMimePolicyOverride ?? capturedMimePolicy;
		if (mimePolicy !== undefined && admission.selectedProfile !== "default")
			throw new AgentBrowserError(
				"invalid-input",
				"Research replay MIME policy requires the default profile",
			);
		const policyArguments: [
			ResearchReaderRawPolicy?,
			ResearchReaderVisibilityPolicy?,
			ResearchReaderMimePolicy?,
			ResearchReaderFallbackEncoding?,
		] =
			fallbackEncoding !== undefined
				? [rawPolicy, visibilityPolicy, mimePolicy, fallbackEncoding]
				: mimePolicy !== undefined
					? [rawPolicy, visibilityPolicy, mimePolicy]
					: visibilityPolicy !== undefined
						? [rawPolicy, visibilityPolicy]
						: rawPolicy === undefined
							? []
							: [rawPolicy];
		const primary = admission.originalMetadata.primaryResponse as {
			url: string;
			status: number;
			headers: NetworkResponse["headers"];
			encodedBytes: number;
			elapsedMs: number;
		};
		for (const values of Object.values(primary.headers)) {
			if (
				values.length === 0 ||
				values.some((value) => /[^\t\x20-\x7e\x80-\xff]/.test(value))
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid research replay headers",
				);
		}
		const contentTypes = primary.headers["content-type"];
		const mime =
			contentTypes?.length === 1
				? contentTypes[0].split(";", 1)[0].trim().toLowerCase()
				: undefined;
		const originalReader = admission.originalMetadata.reader as
			| Record<string, unknown>
			| undefined;
		if (replayMimePolicyOverride !== undefined && mime !== "text/markdown")
			throw new AgentBrowserError(
				"unsupported",
				"Replay MIME selection requires declared text/markdown",
			);
		if (mimeInterpretation !== undefined && mime !== "text/markdown")
			throw new AgentBrowserError(
				"invalid-input",
				"Research replay MIME interpretation contradicts captured headers",
			);
		const validateVisibilitySemantics = (html: boolean) => {
			if (
				visibilityPolicy !== undefined &&
				originalReader &&
				(originalReader.hiddenContentSemantics !==
					(html
						? researchReaderHiddenContentSemantics(visibilityPolicy)
						: false) ||
					!Number.isSafeInteger(originalReader.sourceHiddenSubtrees) ||
					(originalReader.sourceHiddenSubtrees as number) < 0 ||
					(!html && originalReader.sourceHiddenSubtrees !== 0))
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid research replay visibility semantics",
				);
		};
		const markdownHtmlCandidate =
			mimePolicy !== undefined && mime === "text/markdown";
		if (replayMimePolicyOverride !== undefined) {
			if (
				originalReader !== undefined &&
				originalReader?.hiddenContentSemantics !== false
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Replay MIME selection requires literal captured visibility semantics",
				);
			validateVisibilitySemantics(false);
		} else if (!markdownHtmlCandidate)
			validateVisibilitySemantics(mime === "text/html");
		const textSelection =
			selected.method === "json-pointer" ||
			selected.method === "text-lines" ||
			selected.method === "text-line-discovery";
		const markdownLinks =
			selected.method === "link-url-search" &&
			admission.selectedProfile === "default" &&
			mime === "text/markdown";
		if (
			textSelection
				? admission.selectedProfile !== "default" ||
					mime === undefined ||
					mime === "text/html"
				: mime !== "text/html" && !markdownLinks && !markdownHtmlCandidate
		)
			throw new AgentBrowserError(
				"unsupported",
				textSelection
					? "Text replay requires a default-profile literal text document"
					: "Research JSON replay requires text/html",
			);
		const reportedFinalUrl = parseNetworkUrl(primary.url).href;
		const profile = admission.selectedProfile;
		const response: NetworkResponse = {
			url: reportedFinalUrl,
			status: primary.status,
			headers: primary.headers,
			body: admission.body,
			encodedBytes: primary.encodedBytes,
			elapsedMs: primary.elapsedMs,
			redirects: [],
		};
		const context: DocumentLoaderContext = {
			tabId: "research-json-replay",
			signal: signal ?? new AbortController().signal,
			limits:
				profile === "long-v1"
					? researchLongDocumentAdmission.document
					: {
							maxNodes: 50_000,
							maxDepth: 128,
							maxTextCodeUnits: 2_000_000,
							maxChanges: 1_024,
						},
			initializeDocument: (document) => {
				tree = document;
			},
		};
		const mimeArguments: [
			ResearchReaderMimePolicy?,
			ResearchReaderFallbackEncoding?,
		] =
			fallbackEncoding !== undefined
				? [mimePolicy, fallbackEncoding]
				: mimePolicy === undefined
					? []
					: [mimePolicy];
		const visibilityEvidence =
			visibilityPolicy === undefined
				? undefined
				: researchVisibilityEvidence(
						response,
						context,
						profile,
						rawPolicy,
						{
							method:
								selected.method === "json-pointer" ||
								selected.method === "text-lines" ||
								selected.method === "text-line-discovery" ||
								selected.method === "content-focus"
									? "document"
									: selected.method,
							target:
								"target" in selected && selected.method !== "content-focus"
									? selected.target
									: undefined,
							format,
							tableMetadata:
								"tableMetadata" in selected
									? selected.tableMetadata
									: undefined,
							tableRows:
								"tableRows" in selected ? selected.tableRows : undefined,
							...("compactTables" in selected && selected.compactTables
								? { compactTables: true }
								: {}),
							limits: {
								maxBytes: researchJsonReplayLimits.maxExtractionBytes,
								maxNodes: researchJsonReplayLimits.maxNodes,
								maxDepth: researchJsonReplayLimits.maxDepth,
							},
						},
						...mimeArguments,
					);
		if (visibilityEvidence?.diagnostic)
			throw new AgentBrowserError(
				"policy-denied",
				"Unfiltered research source requires user handoff",
			);
		checkpoint();
		tree = loadResearchDocument(response, context, profile, ...policyArguments);
		checkpoint();
		const reader = researchReaderInfo(tree);
		if (
			(fallbackEncoding !== undefined &&
				(reader?.fallbackEncoding !== fallbackEncoding ||
					originalReader?.encoding !== reader?.encoding)) ||
			(replayMimePolicyOverride !== undefined &&
				originalReader !== undefined &&
				originalReader.encoding !== reader?.encoding)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Research replay encoding does not match captured evidence",
			);
		const actualInterpretation = reader?.mimeInterpretation;
		if (
			mimeInterpretation !== undefined &&
			(reader?.mimePolicy !== mimePolicy ||
				actualInterpretation === undefined ||
				Object.entries(mimeInterpretation).some(
					([key, value]) =>
						actualInterpretation[key as keyof ResearchMimeInterpretation] !==
						value,
				))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Research replay MIME interpretation does not match captured bytes",
			);
		const interpretedHtml =
			mimePolicy !== undefined &&
			reader?.mimePolicy === mimePolicy &&
			actualInterpretation?.policy === mimePolicy;
		if (
			(textSelection && interpretedHtml) ||
			(markdownHtmlCandidate &&
				!textSelection &&
				!markdownLinks &&
				!interpretedHtml)
		)
			throw new AgentBrowserError(
				"unsupported",
				textSelection
					? "Text replay requires a default-profile literal text document"
					: "Research JSON replay requires text/html",
			);
		if (markdownHtmlCandidate && replayMimePolicyOverride === undefined) {
			validateVisibilitySemantics(interpretedHtml);
			if (
				visibilityPolicy !== undefined &&
				originalReader &&
				(originalReader.hiddenContentSemantics !==
					reader?.hiddenContentSemantics ||
					originalReader.sourceHiddenSubtrees !== reader?.sourceHiddenSubtrees)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Research replay visibility evidence does not match captured bytes",
				);
		}
		const report: ResearchJsonReplayReport<Format> & Extra = {
			kind: "native-research-json-replay-v1",
			partial: true,
			contentSuccess: null,
			outcome: "extracted-unverified",
			networkRequests: 0,
			source: {
				profile,
				reportedFinalUrl,
				receiptSha256: admission.receiptSha256,
				body: admission.bodyIdentity,
			},
			selection: {
				method: selected.method,
				matches: null,
				...(selected.method === "json-pointer"
					? { pointer: selected.target }
					: {}),
				...("outputLimitPolicy" in selected && selected.outputLimitPolicy
					? { outputLimitPolicy: selected.outputLimitPolicy }
					: {}),
				...(replayMimePolicyOverride === undefined
					? {}
					: { readerMimePolicy: replayMimePolicyOverride }),
			},
			classification: { barrier: null, diagnostic: null },
			reader,
			...extra,
		};
		const title = documentTitle(tree);
		const classify = (text: string) => {
			const diagnostic = classifyResearchVisibility(
				{
					status: primary.status,
					headers: primary.headers,
					url: reportedFinalUrl,
					title,
					text,
				},
				visibilityEvidence?.title,
				reader?.mimeInterpretation,
			);
			report.classification = { barrier: diagnostic?.kind ?? null, diagnostic };
			if (diagnostic) {
				report.outcome = "semantic-barrier";
				report.contentSuccess = false;
			}
			return diagnostic;
		};
		const documentBarrier = classify(researchDocumentDiagnosticText(tree));
		if (!documentBarrier && requireEmptyOutline) {
			checkpoint();
			const outline = discoverDocumentHeadings(
				tree,
				researchLongDocumentAdmission.headings,
			);
			if (outline.entries.length !== 0 || outline.truncated)
				throw new AgentBrowserError(
					"policy-denied",
					"Research recovery requires an empty complete heading outline",
				);
			checkpoint();
		}
		if (!documentBarrier && selected.method === "heading-outline") {
			checkpoint();
			report.headings = discoverDocumentHeadings(tree, {
				maxBytes: researchJsonReplayLimits.maxExtractionBytes,
				maxNodes: researchJsonReplayLimits.maxNodes,
				maxDepth: researchJsonReplayLimits.maxDepth,
			});
			checkpoint();
			report.selection.matches = report.headings.entries.length;
			if (
				!classify(
					report.headings.entries.map((entry) => entry.title).join("\n"),
				) &&
				!report.headings.entries.length
			) {
				report.outcome = "empty-extraction";
				report.contentSuccess = false;
			}
		} else if (!documentBarrier && selected.method === "link-url-search") {
			checkpoint();
			report.links = discoverDocumentLinks(tree, selected.target, {
				maxBytes: researchJsonReplayLimits.maxExtractionBytes,
				maxNodes: researchJsonReplayLimits.maxNodes,
				maxDepth: researchJsonReplayLimits.maxDepth,
				checkpoint,
			});
			const entries = [
				...report.links.entries,
				...(report.links.sourceMarkdown?.entries ?? []),
			];
			report.selection.matches = entries.length;
			if (
				!classify(researchLinkDiagnosticText(report.links)) &&
				!entries.length
			) {
				report.outcome = "empty-extraction";
				report.contentSuccess = false;
			}
		} else if (!documentBarrier && selected.method === "text-line-discovery") {
			checkpoint();
			report.textLines = discoverDocumentTextLines(tree, selected.target, {
				maxBytes: researchJsonReplayLimits.maxExtractionBytes,
			});
			checkpoint();
			report.selection.matches = report.textLines.entries.length;
			if (!report.textLines.entries.length) {
				report.outcome = "empty-extraction";
				report.contentSuccess = false;
			}
		} else if (
			report.outcome !== "semantic-barrier" &&
			selected.method !== "link-url-search" &&
			selected.method !== "heading-outline" &&
			selected.method !== "text-line-discovery"
		) {
			checkpoint();
			let reference: string | undefined;
			if (
				selected.method !== "json-pointer" &&
				selected.method !== "text-lines" &&
				selected.method !== "content-focus"
			) {
				const queries = new DocumentQueries(tree);
				const matches = queries.querySelectorAll(selected.target);
				report.selection.matches = matches.length;
				if (matches.length !== 1)
					throw new AgentBrowserError(
						matches.length ? "invalid-input" : "not-found",
						"Research replay requires one selected element",
					);
				reference = tree.reference(matches[0]);
			}
			checkpoint();
			const extraction = extractDocument(tree, {
				format,
				tableMetadata: selected.tableMetadata,
				tableRows: selected.tableRows,
				...(selected.compactTables ? { compactTables: true } : {}),
				...(selected.outputLimitPolicy
					? { outputLimitPolicy: selected.outputLimitPolicy }
					: {}),
				...(selected.method === "json-pointer"
					? { jsonPointer: selected.target }
					: selected.method === "content-focus"
						? { contentFocus: selected.target as ContentFocusPolicy }
						: selected.method === "text-lines"
							? { lines: selected.lines }
							: selected.method === "heading-section"
								? { section: reference }
								: { root: reference }),
				maxBytes: researchJsonReplayLimits.maxExtractionBytes,
				maxNodes: researchJsonReplayLimits.maxNodes,
				maxDepth: researchJsonReplayLimits.maxDepth,
			});
			if (extraction.format !== format)
				throw new AgentBrowserError(
					"unsupported",
					"Research replay extraction format mismatch",
				);
			report.extraction = extraction as ReplayDocumentByFormat[Format];
			if (selected.method === "json-pointer") report.selection.matches = 1;
			if (selected.method === "text-lines")
				report.selection.matches =
					selected.lines.end - selected.lines.start + 1;
			checkpoint();
			if (
				!classify(researchExtractionDiagnosticText(extraction)) &&
				!hasResearchExtractionContent(extraction)
			) {
				report.outcome = "empty-extraction";
				report.contentSuccess = false;
			}
		}
		checkpoint();
		const jsonl = `${JSON.stringify(report)}\n`;
		const outputBytes = new TextEncoder().encode(jsonl).byteLength;
		if (outputBytes > researchJsonReplayLimits.maxOutputBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Research JSON replay output limit exceeded",
			);
		checkpoint();
		return { report, jsonl, outputBytes };
	} finally {
		try {
			tree?.close();
		} finally {
			admission.body.fill(0);
		}
	}
}
