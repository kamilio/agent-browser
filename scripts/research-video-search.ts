import type { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { AgentBrowserError, type ErrorCode } from "../src/errors.js";
import type { ResearchSourceVideos } from "../src/research-source-videos.js";
import { youtubeSearchRoute } from "../src/research-source-videos.js";
import {
	type ResearchNavigationReport,
	type ResearchOutcome,
	researchNavigation,
} from "./research-browser.js";
import {
	exitResearchCliFailure,
	writeResearchOutput,
} from "./research-stream-output.js";

export const researchVideoSearchLimits = Object.freeze({
	maxOutputBytes: 65_536,
	timeoutMs: 120_000,
});

const usage =
	"Usage: research-video-search --query TEXT\nOne anonymous native YouTube search GET; bounded public source records, not rendered videos, playback, transcripts or verified claims. No scripts, SDK, credentials, redirects, retries or continuation requests.\n";

function failure(code: ErrorCode): AgentBrowserError {
	return new AgentBrowserError(code, "Research video search failed");
}

function cancellation(signal: AbortSignal): AgentBrowserError {
	return failure(
		signal.reason instanceof AgentBrowserError &&
			["timeout", "closed"].includes(signal.reason.code)
			? signal.reason.code
			: "aborted",
	);
}

function queryArguments(query: string): { query: string; url: string } {
	if (typeof query !== "string" || query.length > 256)
		throw failure("invalid-input");
	const url = new URL("https://www.youtube.com/results");
	url.searchParams.set("search_query", query);
	if (youtubeSearchRoute(url.href)?.query !== query)
		throw failure("invalid-input");
	return { query, url: url.href };
}

export function parseResearchVideoSearchArguments(args: readonly string[]) {
	if (!Array.isArray(args) || args.length !== 2 || args[0] !== "--query")
		throw failure("invalid-input");
	return queryArguments(args[1]);
}

export interface ResearchVideoSearchReport {
	kind: "native-video-search-v1";
	query: string;
	url: string;
	partial: true;
	rendered: false;
	verified: false;
	outcome:
		| "source-results-unverified"
		| "empty-source"
		| "semantic-barrier"
		| "http-failure"
		| "failure";
	contentSuccess: null | false;
	nativeOutcome: ResearchOutcome;
	source: ResearchNavigationReport["primaryResponse"];
	classification: ResearchNavigationReport["classification"];
	sourceVideos?: ResearchSourceVideos;
	rateLimit?: ResearchNavigationReport["rateLimit"];
	serviceBackoff?: ResearchNavigationReport["serviceBackoff"];
	failure?: ResearchNavigationReport["failure"];
	metrics?: ResearchNavigationReport["metrics"];
}

export async function researchVideoSearch(
	query: string,
	signal?: AbortSignal,
): Promise<ResearchVideoSearchReport> {
	const args = queryArguments(query);
	if (signal?.aborted) throw failure("aborted");
	const report = await researchNavigation(
		args.url,
		true,
		signal,
		undefined,
		false,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		{
			redirectMode: "manual",
			format: "markdown",
			readerRawPolicy: "separate-omitted-raw-v1",
			readerVisibilityPolicy: "source-hidden-inline-v1",
			readerFallbackEncoding: "utf-8",
		},
	);
	if (signal?.aborted) throw cancellation(signal);
	const sourceVideos = report.extraction?.sourceVideos;
	const status = report.primaryResponse?.status;
	let outcome: ResearchVideoSearchReport["outcome"];
	if (report.classification.barrier !== null) outcome = "semantic-barrier";
	else if (status !== undefined && (status < 200 || status >= 300))
		outcome = "http-failure";
	else if (
		report.failure !== undefined ||
		!["extracted-unverified", "empty-extraction"].includes(report.outcome) ||
		status === undefined
	)
		outcome = "failure";
	else if (sourceVideos?.query === query && sourceVideos.entries.length > 0)
		outcome = "source-results-unverified";
	else outcome = "empty-source";
	return {
		kind: "native-video-search-v1",
		...args,
		partial: true,
		rendered: false,
		verified: false,
		outcome,
		contentSuccess: outcome === "source-results-unverified" ? null : false,
		nativeOutcome: report.outcome,
		source: report.primaryResponse,
		classification: report.classification,
		...(outcome === "source-results-unverified" ? { sourceVideos } : {}),
		...(report.rateLimit === undefined ? {} : { rateLimit: report.rateLimit }),
		...(report.serviceBackoff === undefined
			? {}
			: { serviceBackoff: report.serviceBackoff }),
		...(report.failure === undefined ? {} : { failure: report.failure }),
		...(report.metrics === undefined ? {} : { metrics: report.metrics }),
	};
}

export async function runResearchVideoSearchCli(
	args: readonly string[],
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	const options =
		Array.isArray(args) && args.length === 1 && args[0] === "--help"
			? undefined
			: parseResearchVideoSearchArguments(args);
	const controller = new AbortController();
	const started = performance.now();
	const abort = () => controller.abort(failure("aborted"));
	const timeout = () => controller.abort(failure("timeout"));
	const outputError = () => controller.abort(failure("closed"));
	const checkpoint = () => {
		if (performance.now() - started >= researchVideoSearchLimits.timeoutMs)
			timeout();
		if (controller.signal.aborted) throw cancellation(controller.signal);
	};
	const timer = setTimeout(timeout, researchVideoSearchLimits.timeoutMs);
	signal?.addEventListener("abort", abort, { once: true });
	output.on("error", outputError);
	output.on("close", outputError);
	output.on("finish", outputError);
	try {
		if (signal?.aborted) abort();
		checkpoint();
		if (output.destroyed || output.writableEnded || output.errored)
			throw failure("closed");
		const report = options
			? await researchVideoSearch(options.query, controller.signal)
			: undefined;
		checkpoint();
		const text = report ? `${JSON.stringify(report)}\n` : usage;
		if (Buffer.byteLength(text) > researchVideoSearchLimits.maxOutputBytes)
			throw failure("resource-limit");
		await writeResearchOutput(output, text, controller.signal, {
			closed: () => failure("closed"),
			aborted: cancellation,
		});
		checkpoint();
		return !report || report.outcome === "source-results-unverified" ? 0 : 1;
	} catch (error) {
		throw failure(error instanceof AgentBrowserError ? error.code : "closed");
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
		output.off("error", outputError);
		output.off("close", outputError);
		output.off("finish", outputError);
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	process.stdout.on("error", () => {
		process.exitCode = 1;
	});
	process.stderr.on("error", () => {
		process.exitCode = 1;
	});
	if (!(args.length === 1 && args[0] === "--help")) {
		try {
			parseResearchVideoSearchArguments(args);
		} catch {
			exitResearchCliFailure(64, usage);
			return;
		}
	}
	try {
		process.exitCode = await runResearchVideoSearchCli(args, process.stdout);
	} catch {
		exitResearchCliFailure(1, "Research video search or output failed.\n");
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	void main().catch(() => {
		exitResearchCliFailure(1, "Research video search or output failed.\n");
	});
