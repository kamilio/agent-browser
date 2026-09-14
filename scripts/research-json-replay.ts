import { types } from "node:util";
import {
	type BrowserChallengeDiagnostic,
	classifyBrowserChallenge,
} from "../src/browser-challenges.js";
import { documentTitle } from "../src/document-title.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import {
	type DocumentExtraction,
	type DocumentHeadingOutline,
	type DocumentLinkDiscovery,
	discoverDocumentHeadings,
	discoverDocumentLinks,
	extractDocument,
} from "../src/extraction.js";
import { type NetworkResponse, parseNetworkUrl } from "../src/network.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "../src/research-admission.js";
import { loadResearchDocument } from "../src/research-loader.js";
import {
	type ResearchReaderRawPolicy,
	type ResearchReaderReport,
	researchReaderInfo,
	validateResearchReaderRawPolicy,
} from "../src/research-reader-info.js";
import { DocumentQueries, validateSelectorSyntax } from "../src/selectors.js";
import {
	type ResearchBodyPin,
	type ResearchOutputLimitSectionRecovery,
	type ResearchReplayAdmission,
	type TrustedResearchReplayAdmission,
	validateResearchOutputLimitSectionAdmission,
	validateResearchReplayAdmission,
} from "./research-admission-evidence.js";
import {
	hasResearchExtractionContent,
	researchDocumentDiagnosticText,
	researchExtractionDiagnosticText,
} from "./research-content.js";

export const researchJsonReplayLimits = Object.freeze({
	maxSelectorCodeUnits: 4_096,
	maxExtractionBytes: 256_000,
	maxOutputBytes: 327_680,
	maxNodes: 50_000,
	maxDepth: 128,
	timeoutMs: 20_000,
});

export type ResearchJsonReplaySelection =
	| ((
			| { selector: string; section?: never; links?: never }
			| { section: string; selector?: never; links?: never }
	  ) & { tableMetadata?: boolean })
	| { links: string; selector?: never; section?: never; tableMetadata?: never };

export interface ResearchOutputLimitSectionSelection {
	section: string;
	tableMetadata?: boolean;
}

export type ResearchOutputLimitOutlineRecovery = Omit<
	ResearchOutputLimitSectionRecovery,
	"kind"
> & { readonly kind: "captured-output-limit-outline" };

export interface ResearchJsonReplayReport {
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
			| "heading-section"
			| "link-url-search"
			| "heading-outline";
		matches: number | null;
	};
	classification: {
		barrier: BrowserChallengeDiagnostic["kind"] | null;
		diagnostic: BrowserChallengeDiagnostic | null;
	};
	reader?: Readonly<ResearchReaderReport>;
	extraction?: Extract<DocumentExtraction, { format: "json" }>;
	links?: DocumentLinkDiscovery;
	headings?: DocumentHeadingOutline;
	recovery?:
		| ResearchOutputLimitSectionRecovery
		| ResearchOutputLimitOutlineRecovery;
}

export interface ResearchJsonReplayExtraction {
	report: ResearchJsonReplayReport;
	jsonl: string;
	outputBytes: number;
}

export interface ResearchOutputLimitSectionExtraction
	extends ResearchJsonReplayExtraction {
	report: ResearchJsonReplayReport & {
		recovery: ResearchOutputLimitSectionRecovery;
	};
}

export interface ResearchOutputLimitOutlineExtraction
	extends ResearchJsonReplayExtraction {
	report: ResearchJsonReplayReport & {
		recovery: ResearchOutputLimitOutlineRecovery;
	};
}

function invalidSelection(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research replay selection",
	);
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
		keys.length > 2 ||
		!keys.every(
			(key) =>
				typeof key === "string" &&
				["selector", "section", "links", "tableMetadata"].includes(key),
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
		["selector", "section", "links"].filter((key) => Object.hasOwn(fields, key))
			.length !== 1
	)
		invalidSelection();
	const section = Object.hasOwn(fields, "section");
	const links = Object.hasOwn(fields, "links");
	const target = links
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
			typeof fields.tableMetadata !== "boolean")
	)
		invalidSelection();
	if (links) {
		if (
			target.length > 256 ||
			Array.from(target).some(
				(character) =>
					character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
			) ||
			Object.hasOwn(fields, "tableMetadata")
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
		method: links
			? ("link-url-search" as const)
			: section
				? ("heading-section" as const)
				: ("css-selector" as const),
		target,
		tableMetadata: fields.tableMetadata === true,
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

function replayCheckpoint(signal?: AbortSignal) {
	const started = performance.now();
	return () => {
		if (signal?.aborted)
			throw new AgentBrowserError("aborted", "Research JSON replay aborted");
		if (performance.now() - started >= researchJsonReplayLimits.timeoutMs)
			throw new AgentBrowserError("timeout", "Research JSON replay timed out");
	};
}

export function extractResearchReplayJson(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchJsonReplaySelection,
	signal?: AbortSignal,
): ResearchJsonReplayExtraction {
	const checkpoint = replayCheckpoint(signal);
	checkpoint();
	const selected = selectionSnapshot(selection);
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
	);
}

export function recoverResearchOutputLimitSection(
	rawReceipt: Uint8Array,
	trusted: TrustedResearchReplayAdmission,
	selection: ResearchOutputLimitSectionSelection,
	signal?: AbortSignal,
): ResearchOutputLimitSectionExtraction {
	const checkpoint = replayCheckpoint(signal);
	checkpoint();
	const selected = selectionSnapshot(selection);
	if (selected.method !== "heading-section") invalidSelection();
	checkpoint();
	const admission = validateResearchOutputLimitSectionAdmission(
		rawReceipt,
		trusted,
	);
	return extractValidatedReplayJson(admission, selected, checkpoint, signal, {
		recovery: admission.recovery,
	});
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
	);
}

function extractValidatedReplayJson<Extra extends object>(
	admission: Extract<ResearchReplayAdmission, { kind: "validated-capture" }>,
	selected:
		| ReturnType<typeof selectionSnapshot>
		| { method: "heading-outline" },
	checkpoint: () => void,
	signal: AbortSignal | undefined,
	extra: Extra,
): ResearchJsonReplayExtraction & { report: ResearchJsonReplayReport & Extra } {
	let tree: DocumentTree | undefined;
	try {
		checkpoint();
		const rawPolicy = replayRawPolicy(admission.originalMetadata);
		const policyArguments: [] | [ResearchReaderRawPolicy] =
			rawPolicy === undefined ? [] : [rawPolicy];
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
		if (
			contentTypes?.length !== 1 ||
			contentTypes[0].split(";", 1)[0].trim().toLowerCase() !== "text/html"
		)
			throw new AgentBrowserError(
				"unsupported",
				"Research JSON replay requires text/html",
			);
		const reportedFinalUrl = parseNetworkUrl(primary.url).href;
		const profile = admission.selectedProfile;
		tree = loadResearchDocument(
			{
				url: reportedFinalUrl,
				status: primary.status,
				headers: primary.headers,
				body: admission.body,
				encodedBytes: primary.encodedBytes,
				elapsedMs: primary.elapsedMs,
				redirects: [],
			},
			{
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
			},
			profile,
			...policyArguments,
		);
		checkpoint();
		const report: ResearchJsonReplayReport & Extra = {
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
			selection: { method: selected.method, matches: null },
			classification: { barrier: null, diagnostic: null },
			reader: researchReaderInfo(tree),
			...extra,
		};
		const title = documentTitle(tree);
		const classify = (text: string) => {
			const diagnostic = classifyBrowserChallenge({
				status: primary.status,
				headers: primary.headers,
				url: reportedFinalUrl,
				title,
				text,
			});
			report.classification = { barrier: diagnostic?.kind ?? null, diagnostic };
			if (diagnostic) {
				report.outcome = "semantic-barrier";
				report.contentSuccess = false;
			}
			return diagnostic;
		};
		const documentBarrier = classify(researchDocumentDiagnosticText(tree));
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
			report.selection.matches = report.links.entries.length;
			if (
				!classify(
					report.links.entries.map((entry) => entry.label).join("\n"),
				) &&
				!report.links.entries.length
			) {
				report.outcome = "empty-extraction";
				report.contentSuccess = false;
			}
		} else if (
			report.outcome !== "semantic-barrier" &&
			selected.method !== "link-url-search" &&
			selected.method !== "heading-outline"
		) {
			checkpoint();
			const queries = new DocumentQueries(tree);
			const matches = queries.querySelectorAll(selected.target);
			report.selection.matches = matches.length;
			if (matches.length !== 1)
				throw new AgentBrowserError(
					matches.length ? "invalid-input" : "not-found",
					"Research replay requires one selected element",
				);
			checkpoint();
			const reference = tree.reference(matches[0]);
			const extraction = extractDocument(tree, {
				format: "json",
				tableMetadata: selected.tableMetadata,
				...(selected.method === "heading-section"
					? { section: reference }
					: { root: reference }),
				maxBytes: researchJsonReplayLimits.maxExtractionBytes,
				maxNodes: researchJsonReplayLimits.maxNodes,
				maxDepth: researchJsonReplayLimits.maxDepth,
			});
			if (extraction.format !== "json")
				throw new AgentBrowserError(
					"unsupported",
					"Research replay requires JSON extraction",
				);
			report.extraction = extraction;
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
