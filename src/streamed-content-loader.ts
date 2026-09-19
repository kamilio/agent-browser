import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { type NetworkResponse, decodeResponseText } from "./network.js";
import {
	type ReactStreamingReport,
	reconstructReactStreams,
} from "./react-streaming.js";
import type { DocumentLoaderContext } from "./session.js";

export const streamedContentLimits = Object.freeze({
	navigationTimeoutMs: 30_000,
	network: Object.freeze({
		timeoutMs: 20_000,
		maxResponseBytes: 16_000_000,
		maxTotalBytes: 32_000_000,
		maxRequests: 12,
		maxRedirects: 5,
		maxConcurrent: 1,
	}),
	document: Object.freeze({
		maxTextCodeUnits: 16_000_000,
		maxNodes: 50_000,
		maxDepth: 128,
	}),
});

export async function loadStreamedContentDocument(
	response: NetworkResponse,
	context: DocumentLoaderContext,
	onProjection?: (report: Readonly<ReactStreamingReport>) => void,
) {
	if (context.signal.aborted)
		throw new AgentBrowserError("aborted", "Streamed content loading aborted");
	const types = response.headers["content-type"];
	if (
		types?.length !== 1 ||
		types[0].split(";", 1)[0].trim().toLowerCase() !== "text/html"
	)
		throw new AgentBrowserError(
			"unsupported",
			"Streamed content requires explicit HTML",
		);
	if (response.body.byteLength > streamedContentLimits.network.maxResponseBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Streamed content response limit exceeded",
		);
	const tree = parseHtmlDocument(
		decodeResponseText(response, "utf-8").text,
		response.url,
		{
			limits: {
				...context.limits,
				maxTextCodeUnits: Math.min(
					context.limits.maxTextCodeUnits,
					streamedContentLimits.document.maxTextCodeUnits,
				),
				maxNodes: Math.min(
					context.limits.maxNodes,
					streamedContentLimits.document.maxNodes,
				),
				maxDepth: Math.min(
					context.limits.maxDepth,
					streamedContentLimits.document.maxDepth,
				),
			},
			signal: context.signal,
		},
	);
	try {
		if (response.status === 200) {
			const projection = await reconstructReactStreams(tree, context.signal);
			onProjection?.(projection);
		}
		if (context.signal.aborted)
			throw new AgentBrowserError(
				"aborted",
				"Streamed content loading aborted",
			);
		context.initializeDocument?.(tree, "inert-reader");
		if (context.signal.aborted)
			throw new AgentBrowserError(
				"aborted",
				"Streamed content loading aborted",
			);
		return tree;
	} catch (error) {
		try {
			tree.close();
		} catch {}
		throw error;
	}
}
