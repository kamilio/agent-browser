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
import type { ResearchReaderRawPolicy } from "../src/research-reader-info.js";
import { resourceLimitDiagnostic } from "../src/resource-limit.js";
import { DocumentQueries } from "../src/selectors.js";
import type { DocumentLoaderContext } from "../src/session.js";
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
	limits: { maxBytes: number; maxNodes: number; maxDepth: number };
	headingLimits?: Parameters<typeof discoverDocumentHeadings>[1];
}

export function classifyResearchVisibility(
	response: BrowserChallengeResponse,
	sourceTitle?: string,
) {
	return (
		(sourceTitle === undefined
			? null
			: classifyBrowserChallenge({ ...response, title: sourceTitle })) ??
		classifyBrowserChallenge(response)
	);
}

export function researchVisibilityEvidence(
	response: NetworkResponse,
	context: DocumentLoaderContext,
	profile: ResearchDocumentProfileId | undefined,
	rawPolicy: ResearchReaderRawPolicy | undefined,
	operation: VisibilityOperation,
) {
	const types = response.headers["content-type"];
	if (
		types?.length !== 1 ||
		types[0].split(";", 1)[0].trim().toLowerCase() !== "text/html"
	)
		return;
	let tree: DocumentTree | undefined;
	try {
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
		);
		const title = documentTitle(tree).slice(0, 257);
		const classify = (text: string) =>
			classifyBrowserChallenge({
				status: response.status,
				headers: response.headers,
				url: response.url,
				title,
				text,
			});
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
