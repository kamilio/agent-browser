import { browserChallengeStructure } from "../src/browser-challenge-structure.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import type { NetworkResponse } from "../src/network.js";
import { admitResearchHtmlSource } from "./research-source-input.js";

export function researchResponseChallengeStructure(
	response: NetworkResponse,
	signal?: AbortSignal,
): ReturnType<typeof browserChallengeStructure> {
	const checkpoint = () => {
		if (signal?.aborted)
			throw new AgentBrowserError(
				signal.reason instanceof AgentBrowserError &&
					(signal.reason.code === "timeout" || signal.reason.code === "closed")
					? signal.reason.code
					: "aborted",
				"Challenge source check aborted",
			);
	};
	checkpoint();
	const contentTypes = response.headers["content-type"];
	if (
		response.body.byteLength > 32_768 ||
		contentTypes?.length !== 1 ||
		contentTypes[0].split(";", 1)[0].trim().toLowerCase() !== "text/html"
	)
		return undefined;
	let tree: DocumentTree | undefined;
	try {
		const source = admitResearchHtmlSource(
			{
				finalUrl: response.url,
				contentType: contentTypes[0],
				body: response.body,
			},
			32_768,
			32_768,
			checkpoint,
		);
		if (
			!source.text.includes("sec-if-cpt-container") &&
			!source.text.includes("validateCaptcha")
		)
			return undefined;
		tree = parseHtmlDocument(source.text, response.url, {
			signal,
			limits: {
				maxNodes: 512,
				maxDepth: 32,
				maxTextCodeUnits: 32_768,
				maxChanges: 1024,
			},
			initializeDocument: (document) => {
				tree = document;
			},
		});
		checkpoint();
		return browserChallengeStructure(tree);
	} catch {
		checkpoint();
		return undefined;
	} finally {
		tree?.close();
	}
}
