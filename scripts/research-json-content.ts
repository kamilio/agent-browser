import { createHash } from "node:crypto";
import { AgentBrowserError } from "../src/errors.js";
import {
	type HtmlJsonSourceMetadata,
	type HtmlJsonSourceSelection,
	htmlSourceJsonLimits,
	selectHtmlJsonSource,
	validateHtmlJsonSourceSelection,
} from "../src/html-source-json.js";
import { parseNetworkUrl } from "../src/network.js";
import { serializeResearchReport } from "./research-admission-evidence.js";
import { decodeResearchBodyCapture } from "./research-body-capture.js";
import {
	type ResearchNavigationReport,
	parseResearchArguments,
	researchNavigation,
} from "./research-browser.js";
import {
	type ResearchHtmlSourceIdentity,
	admitResearchHtmlSource,
} from "./research-source-input.js";

export const researchJsonContentLimits = Object.freeze({
	maxOutputBytes: 256_000,
	timeoutMs: 30_000,
});

export interface ResearchJsonContentArguments {
	readonly url: string;
	readonly selection: Readonly<HtmlJsonSourceSelection>;
}

type CaptureMetadata = Pick<
	ResearchNavigationReport,
	| "requestedUrl"
	| "finalUrl"
	| "outcome"
	| "contentSuccess"
	| "classification"
	| "primaryResponse"
	| "failure"
	| "rateLimit"
	| "metrics"
> & {
	receiptSha256: string;
	receiptBytes: number;
	receiptDisposition: "complete" | "output-limit";
};

export interface ResearchJsonContentReport {
	kind: "native-research-json-content-v1";
	partial: true;
	rendered: false;
	verified: false;
	outcome: "source-extracted-unverified" | "failure";
	contentSuccess: null | false;
	selection: Readonly<HtmlJsonSourceSelection>;
	capture: CaptureMetadata;
	extraction?: Readonly<{
		source: ResearchHtmlSourceIdentity;
		selection: HtmlJsonSourceMetadata;
		format: "json-source";
		content: string;
		rendered: false;
		verified: false;
		networkRequests: 0;
	}>;
	failure?: {
		category: AgentBrowserError["code"];
		stage: "capture" | "source";
	};
}

function invalidArguments(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid JSON content arguments",
	);
}

export function parseResearchJsonContentArguments(
	args: readonly string[],
): ResearchJsonContentArguments {
	if (
		!Array.isArray(args) ||
		args.length !== 5 ||
		args.some((value) => typeof value !== "string" || value.length > 8192)
	)
		invalidArguments();
	let url: string | undefined;
	let scriptId: string | undefined;
	let pointer: string | undefined;
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === "--script-id" && scriptId === undefined)
			scriptId = args[++index];
		else if (argument === "--json-pointer" && pointer === undefined)
			pointer = args[++index];
		else if (!argument.startsWith("-") && url === undefined) url = argument;
		else invalidArguments();
	}
	try {
		if (url === undefined || url.includes("#")) invalidArguments();
		const parsed = parseNetworkUrl(url);
		if (parsed.protocol !== "https:") invalidArguments();
		const selected = validateHtmlJsonSourceSelection({ scriptId, pointer });
		const validated = parseResearchArguments([
			"--reader",
			"--capture-body",
			parsed.href,
		]);
		return Object.freeze({ url: validated.urls[0], selection: selected });
	} catch {
		invalidArguments();
	}
}

function category(error: unknown): AgentBrowserError["code"] {
	return error instanceof AgentBrowserError ? error.code : "invalid-input";
}

function captureFailureCategory(value: string): AgentBrowserError["code"] {
	switch (value) {
		case "invalid-input":
		case "stale-reference":
		case "not-found":
		case "not-actionable":
		case "policy-denied":
		case "resource-limit":
		case "unsupported":
		case "network-error":
		case "timeout":
		case "aborted":
		case "closed":
			return value;
		default:
			return "invalid-input";
	}
}

function stopped(signal: AbortSignal): AgentBrowserError {
	const code =
		signal.reason instanceof AgentBrowserError &&
		(signal.reason.code === "timeout" || signal.reason.code === "closed")
			? signal.reason.code
			: "aborted";
	return new AgentBrowserError(code, "JSON content operation stopped");
}

export async function researchJsonContent(
	args: readonly string[],
	signal?: AbortSignal,
): Promise<ResearchJsonContentReport> {
	const options = parseResearchJsonContentArguments(args);
	const started = performance.now();
	const checkpoint = () => {
		if (signal?.aborted) throw stopped(signal);
		if (performance.now() - started >= researchJsonContentLimits.timeoutMs)
			throw new AgentBrowserError("timeout", "JSON content deadline exceeded");
	};
	checkpoint();
	let captured: ResearchNavigationReport;
	try {
		captured = await researchNavigation(
			options.url,
			true,
			signal,
			undefined,
			true,
			undefined,
			undefined,
			false,
			undefined,
			"default",
			{
				readerRawPolicy: "separate-omitted-raw-v1",
				readerVisibilityPolicy: "source-hidden-inline-v1",
				minRequestIntervalMs: 2000,
			},
		);
	} catch (error) {
		checkpoint();
		throw new AgentBrowserError(
			category(error),
			"Native JSON content capture failed",
		);
	}
	checkpoint();
	const emission = serializeResearchReport(captured, "default");
	const receipt = emission.jsonl;
	let body: Uint8Array | undefined;
	const result: ResearchJsonContentReport = {
		kind: "native-research-json-content-v1",
		partial: true,
		rendered: false,
		verified: false,
		outcome: "failure",
		contentSuccess: false,
		selection: options.selection,
		capture: {
			requestedUrl: captured.requestedUrl,
			finalUrl: captured.finalUrl,
			outcome: captured.outcome,
			contentSuccess: captured.contentSuccess,
			classification: captured.classification,
			primaryResponse: captured.primaryResponse,
			...(captured.failure ? { failure: captured.failure } : {}),
			...(captured.rateLimit ? { rateLimit: captured.rateLimit } : {}),
			...(captured.metrics ? { metrics: captured.metrics } : {}),
			receiptSha256: createHash("sha256").update(receipt).digest("hex"),
			receiptBytes: receipt.byteLength,
			receiptDisposition: emission.disposition,
		},
	};
	let stage: "capture" | "source" = "capture";
	try {
		const primary = captured.primaryResponse;
		if (
			emission.disposition !== "complete" ||
			primary?.status !== 200 ||
			captured.bodyCapture === undefined ||
			captured.classification.barrier !== null ||
			captured.rateLimit !== undefined ||
			captured.failure !== undefined ||
			!captured.metrics?.closed ||
			captured.metrics.active !== 0 ||
			!["extracted-unverified", "empty-extraction"].includes(captured.outcome)
		) {
			result.failure = {
				category:
					emission.disposition !== "complete"
						? "resource-limit"
						: captured.failure
							? captureFailureCategory(captured.failure.category)
							: "policy-denied",
				stage,
			};
			return result;
		}
		const contentTypes = primary.headers["content-type"];
		if (
			contentTypes?.length !== 1 ||
			contentTypes[0].split(";", 1)[0].trim().toLowerCase() !== "text/html"
		)
			throw new AgentBrowserError(
				"unsupported",
				"JSON content requires HTML source",
			);
		checkpoint();
		body = decodeResearchBodyCapture(captured.bodyCapture, "default");
		if (
			body.byteLength !== primary.decodedBytes ||
			captured.bodyCapture.sha256 !== primary.bodySha256
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Capture body identity differs",
			);
		checkpoint();
		stage = "source";
		const admitted = admitResearchHtmlSource(
			{ finalUrl: primary.url, contentType: contentTypes[0], body },
			2_000_000,
			htmlSourceJsonLimits.maxSourceCodeUnits,
			checkpoint,
		);
		body.fill(0);
		const selected = selectHtmlJsonSource(
			admitted.text,
			options.selection,
			checkpoint,
		);
		checkpoint();
		result.extraction = Object.freeze({
			source: admitted.identity,
			selection: selected.metadata,
			format: "json-source",
			content: selected.text,
			rendered: false,
			verified: false,
			networkRequests: 0,
		});
		result.outcome = "source-extracted-unverified";
		result.contentSuccess = null;
		return result;
	} catch (error) {
		checkpoint();
		result.failure = { category: category(error), stage };
		return result;
	} finally {
		body?.fill(0);
		receipt.fill(0);
	}
}
