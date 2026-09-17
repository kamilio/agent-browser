import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { loadResearchDocument } from "./research-loader.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
} from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";

export type ResearchDocumentStrategy = "native-reader-fallback-v1";

export interface ResearchDocumentStrategyInfo {
	readonly policy: ResearchDocumentStrategy;
	readonly mode: "native" | "reader";
	readonly nativeFailure?: Readonly<{
		category: "unsupported" | "resource-limit";
		stage: "loader";
		resourceLimit?: Readonly<ResourceLimitDiagnostic>;
	}>;
}

export function validateResearchDocumentStrategy(
	value: unknown,
): ResearchDocumentStrategy | undefined {
	if (value === undefined || value === "native-reader-fallback-v1")
		return value;
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid research document strategy",
	);
}

export async function loadNativeReaderFallbackDocument(
	response: NetworkResponse,
	context: DocumentLoaderContext,
	onMode?: (information: Readonly<ResearchDocumentStrategyInfo>) => void,
): Promise<DocumentTree> {
	const checkpoint = () => {
		if (context.signal.aborted)
			throw context.signal.reason instanceof AgentBrowserError
				? context.signal.reason
				: new AgentBrowserError("aborted", "Document loading aborted");
	};
	const inertContext: DocumentLoaderContext = {
		limits: context.limits,
		signal: context.signal,
		tabId: context.tabId,
	};
	checkpoint();
	onMode?.(
		Object.freeze({ policy: "native-reader-fallback-v1", mode: "native" }),
	);
	checkpoint();
	let tree: DocumentTree;
	try {
		tree = await loadBrowserDocument(response, inertContext);
	} catch (error) {
		checkpoint();
		const types = response.headers["content-type"];
		if (
			response.status !== 200 ||
			types?.length !== 1 ||
			types[0].split(";", 1)[0].trim().toLowerCase() !== "text/html" ||
			!(error instanceof AgentBrowserError) ||
			(error.code !== "unsupported" && error.code !== "resource-limit")
		)
			throw error;
		const diagnostic = resourceLimitDiagnostic(error);
		onMode?.(
			Object.freeze({
				policy: "native-reader-fallback-v1",
				mode: "reader",
				nativeFailure: Object.freeze({
					category: error.code,
					stage: "loader",
					...(diagnostic === undefined ? {} : { resourceLimit: diagnostic }),
				}),
			}),
		);
		checkpoint();
		tree = loadResearchDocument(
			response,
			inertContext,
			undefined,
			"separate-omitted-raw-v1",
			"source-hidden-inline-v1",
			undefined,
			"utf-8",
		);
	}
	try {
		checkpoint();
		context.initializeDocument?.(tree);
		checkpoint();
		return tree;
	} catch (error) {
		try {
			tree.close();
		} catch {}
		throw error;
	}
}
