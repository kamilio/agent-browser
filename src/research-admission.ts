import { AgentBrowserError } from "./errors.js";

export type ResearchDocumentProfileId = "default" | "long-v1";

export function validateResearchDocumentProfile(
	value: unknown = "default",
): ResearchDocumentProfileId {
	if (value !== "default" && value !== "long-v1")
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research document profile",
		);
	return value;
}

export const researchLongDocumentAdmission = Object.freeze({
	profile: "long-v1" as const,
	maxUrls: 1,
	maxCaptureBytes: 4_000_000,
	deadlineMs: 120_000,
	navigationTimeoutMs: 20_000,
	network: Object.freeze({
		timeoutMs: 15_000,
		maxResponseBytes: 4_000_000,
		maxRequestBytes: 1,
		maxHeaderBytes: 16_384,
		maxRedirects: 5,
		maxConcurrent: 1,
		maxRequests: 12,
		maxTotalBytes: 8_000_000,
	}),
	reader: Object.freeze({
		maxSourceCodeUnits: 4_000_000,
		maxTextCodeUnits: 2_000_000,
		maxOutputCodeUnits: 4_000_000,
		maxTokens: 200_000,
		maxDepth: 128,
	}),
	document: Object.freeze({
		maxNodes: 50_000,
		maxDepth: 128,
		maxTextCodeUnits: 4_000_000,
		maxChanges: 1024,
	}),
	derived: Object.freeze({
		maxEncodedReaderBytes: 16_000_003,
		maxParserInputWorkCodeUnits: 32_000_000,
		maxParserTokens: 400_000,
	}),
	headings: Object.freeze({
		maxBytes: 256_000,
		maxNodes: 50_000,
		maxDepth: 128,
		maxEntries: 256,
		maxTitleCodeUnits: 256,
		maxSelectorCodeUnits: 4096,
	}),
	evidence: Object.freeze({
		maxReceiptBytes: 6_000_000,
		maxMetadataBytes: 65_536,
	}),
});
