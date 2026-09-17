import { browserChallengeStructure } from "../src/browser-challenge-structure.js";
import { researchResponseChallengeStructure } from "./research-challenge-structure.js";
import {
	type BrowserChallengeDiagnostic,
	type BrowserChallengeResponse,
	classifyBrowserChallenge,
} from "../src/browser-challenges.js";
import { documentTitle } from "../src/document-title.js";
import type { DocumentTree } from "../src/document.js";
import {
	discoverDocumentHeadings,
	discoverDocumentLinks,
	extractDocument,
} from "../src/extraction.js";
import type { NetworkResponse } from "../src/network.js";
import type { ResearchDocumentProfileId } from "../src/research-admission.js";
import { loadResearchDocument } from "../src/research-loader.js";
import {
	type ResearchReaderMimePolicy,
	type ResearchMimeInterpretation,
	validateResearchReaderMimePolicy,
} from "../src/research-mime-policy.js";
import {
	type ResearchReaderFallbackEncoding,
	type ResearchReaderRawPolicy,
	researchReaderInfo,
	validateResearchReaderFallbackEncoding,
} from "../src/research-reader-info.js";
import { resourceLimitDiagnostic } from "../src/resource-limit.js";
import { DocumentQueries } from "../src/selectors.js";
import type { DocumentLoaderContext } from "../src/session.js";
import type { SourceLinkLabelPolicy } from "../src/source-link-labels.js";
import {
	researchDocumentDiagnosticText,
	researchExtractionDiagnosticText,
	researchLinkDiagnosticText,
} from "./research-content.js";

interface VisibilityOperation {
	method:
		| "document"
		| "css-selector"
		| "heading-section"
		| "heading-outline"
		| "link-url-search";
	target?: string;
	format: "json" | "markdown";
	tableMetadata?: boolean;
	tableRows?: boolean;
	compactTables?: boolean;
	sourceLinkLabelPolicy?: SourceLinkLabelPolicy;
	limits: { maxBytes: number; maxNodes: number; maxDepth: number };
	headingLimits?: Parameters<typeof discoverDocumentHeadings>[1];
}

export function classifyResearchVisibility(
	response: BrowserChallengeResponse,
	sourceTitle?: string,
	interpretation?: Readonly<ResearchMimeInterpretation>,
) {
	const interpreted =
		interpretation?.policy === "markdown-html-document-v1" &&
		interpretation.declaredMime === "text/markdown" &&
		interpretation.effectiveMime === "text/html";
	const classificationResponse = interpreted
		? {
				...response,
				headers: { ...response.headers, "content-type": ["text/html"] },
			}
		: response;
	const diagnostic =
		(sourceTitle === undefined
			? null
			: classifyBrowserChallenge({
					...classificationResponse,
					title: sourceTitle,
				})) ?? classifyBrowserChallenge(classificationResponse);
	return diagnostic && interpreted
		? Object.freeze({
				...diagnostic,
				evidence: Object.freeze([
					...diagnostic.evidence,
					"reader-mime-interpretation" as const,
				]),
			})
		: diagnostic;
}

export function researchVisibilityEvidence(
	response: NetworkResponse,
	context: DocumentLoaderContext,
	profile: ResearchDocumentProfileId | undefined,
	rawPolicy: ResearchReaderRawPolicy | undefined,
	operation: VisibilityOperation,
	mimePolicy?: ResearchReaderMimePolicy,
	fallbackEncoding?: ResearchReaderFallbackEncoding,
) {
	const selectedFallbackEncoding =
		validateResearchReaderFallbackEncoding(fallbackEncoding);
	const selectedMimePolicy = validateResearchReaderMimePolicy(mimePolicy);
	const types = response.headers["content-type"];
	const declaredMime = types?.[0]?.split(";", 1)[0].trim().toLowerCase();
	if (
		types?.length !== 1 ||
		(declaredMime !== "text/html" &&
			!(selectedMimePolicy && declaredMime === "text/markdown"))
	)
		return;
	let tree: DocumentTree | undefined;
	try {
		const mimeArguments: [
			undefined?,
			ResearchReaderMimePolicy?,
			ResearchReaderFallbackEncoding?,
		] =
			selectedFallbackEncoding !== undefined
				? [undefined, selectedMimePolicy, selectedFallbackEncoding]
				: selectedMimePolicy
					? [undefined, selectedMimePolicy]
					: [];
		tree = loadResearchDocument(
			response,
			{
				...context,
				initializeDocument: (document) => {
					tree = document;
				},
			},
			profile,
			rawPolicy,
			...mimeArguments,
		);
		if (
			declaredMime === "text/markdown" &&
			!researchReaderInfo(tree)?.mimeInterpretation
		)
			return;
		const interpretation = researchReaderInfo(tree)?.mimeInterpretation;
		const title = documentTitle(tree).slice(0, 257);
		const structure =
			browserChallengeStructure(tree) ??
			researchResponseChallengeStructure(response, context.signal);
		const classify = (text: string) =>
			classifyResearchVisibility(
				{
					status: response.status,
					headers: response.headers,
					url: response.url,
					title,
					text,
					structure,
				},
				undefined,
				interpretation,
			);
		let diagnostic: BrowserChallengeDiagnostic | null = classify(
			researchDocumentDiagnosticText(tree, { collapseWhitespace: true }),
		);
		if (!diagnostic) {
			try {
				if (operation.method === "heading-outline") {
					const outline = discoverDocumentHeadings(
						tree,
						operation.headingLimits ?? operation.limits,
					);
					diagnostic = classify(
						outline.entries.map((entry) => entry.title).join("\n"),
					);
				} else if (operation.method === "link-url-search") {
					const links = discoverDocumentLinks(
						tree,
						operation.target ?? "",
						operation.limits,
					);
					diagnostic = classify(researchLinkDiagnosticText(links));
				} else {
					let reference: string | undefined;
					if (operation.target !== undefined) {
						const matches = new DocumentQueries(tree).querySelectorAll(
							operation.target,
						);
						if (matches.length !== 1) return { title, diagnostic };
						reference = tree.reference(matches[0]);
					}
					const extraction = extractDocument(tree, {
						...operation.limits,
						format: operation.format,
						tableMetadata: operation.tableMetadata,
						tableRows: operation.tableRows,
						compactTables: operation.compactTables,
						...(operation.sourceLinkLabelPolicy === undefined
							? {}
							: { sourceLinkLabelPolicy: operation.sourceLinkLabelPolicy }),
						...(operation.method === "heading-section"
							? { section: reference }
							: { root: reference }),
					});
					diagnostic = classify(researchExtractionDiagnosticText(extraction));
				}
			} catch (error) {
				if (resourceLimitDiagnostic(error)?.kind !== "extraction.output")
					throw error;
			}
		}
		return { title, diagnostic };
	} finally {
		tree?.close();
	}
}
