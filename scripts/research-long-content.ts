import { createHash } from "node:crypto";
import type { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { AgentBrowserError } from "../src/errors.js";
import { researchLongDocumentAdmission } from "../src/research-admission.js";
import { validateSelectorSyntax } from "../src/selectors.js";
import { serializeResearchReport } from "./research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	parseResearchArguments,
	researchNavigation,
} from "./research-browser.js";
import {
	type ResearchJsonReplayReport,
	extractResearchReplayJson,
	recoverResearchEmptyOutlineSelector,
	researchJsonReplayLimits,
} from "./research-json-replay.js";

export const researchLongContentLimits = Object.freeze({
	maxOutputBytes:
		researchJsonReplayLimits.maxOutputBytes +
		researchLongDocumentAdmission.evidence.maxMetadataBytes +
		4096,
	timeoutMs: researchLongDocumentAdmission.deadlineMs,
});

const usage =
	"Usage: research-long-content [--selector CSS] PUBLIC_HTTP_URL\nOne explicit long-v1 capture (4MB), then strict offline Markdown selection; default selector body. No automatic retry, scripts or credentials.\n";

function invalidArguments(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid long content arguments",
	);
}

export function parseResearchLongContentArguments(args: readonly string[]): {
	url: string;
	selector: string;
} {
	if (
		!Array.isArray(args) ||
		args.length > 3 ||
		args.some((value) => typeof value !== "string" || value.length > 4096)
	)
		invalidArguments();
	let url: string | undefined;
	let selector: string | undefined;
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === "--selector" && selector === undefined) {
			selector = args[++index];
			if (!selector?.trim() || selector.startsWith("--")) invalidArguments();
		} else if (!argument.startsWith("--") && url === undefined) {
			url = argument;
		} else invalidArguments();
	}
	if (url === undefined) invalidArguments();
	const selected = selector ?? "body";
	if (selected.trim() !== selected) invalidArguments();
	try {
		validateSelectorSyntax(selected, { pseudoElements: false });
		const validated = parseResearchArguments([
			"--reader",
			"--capture-body",
			"--headings",
			"--document-profile",
			"long-v1",
			url,
		]);
		return { url: validated.urls[0], selector: selected };
	} catch {
		invalidArguments();
	}
}

type CaptureMetadata = Pick<
	ResearchNavigationReport,
	| "requestedUrl"
	| "finalUrl"
	| "outcome"
	| "contentSuccess"
	| "classification"
	| "failure"
	| "rateLimit"
	| "serviceBackoff"
	| "metrics"
	| "primaryResponse"
> & {
	receiptSha256: string;
	receiptBytes: number;
	receiptDisposition: "complete" | "output-limit";
	body?: { bytes: number; sha256: string };
};

export interface ResearchLongContentReport {
	kind: "native-research-long-content-v1";
	partial: true;
	contentSuccess: null | false;
	outcome: ResearchNavigationReport["outcome"];
	selector: string;
	capture: CaptureMetadata;
	replay?: ResearchJsonReplayReport<"markdown">;
	failure?: { category: string; stage: "capture" | "replay" };
}

function checkpoint(signal?: AbortSignal) {
	if (signal?.aborted) throw cancellation(signal);
}

function cancellation(signal: AbortSignal) {
	const reason = signal.reason;
	const code =
		reason instanceof AgentBrowserError &&
		(reason.code === "timeout" || reason.code === "closed")
			? reason.code
			: "aborted";
	return new AgentBrowserError(code, "Long content operation stopped");
}

export async function researchLongContent(
	args: readonly string[],
	signal?: AbortSignal,
): Promise<ResearchLongContentReport> {
	const options = parseResearchLongContentArguments(args);
	checkpoint(signal);
	const captured = await researchNavigation(
		options.url,
		true,
		signal,
		undefined,
		true,
		undefined,
		undefined,
		true,
		undefined,
		"long-v1",
		{
			readerRawPolicy: "separate-omitted-raw-v1",
			readerVisibilityPolicy: "source-hidden-inline-v1",
			readerFallbackEncoding: "utf-8",
			minRequestIntervalMs: 2000,
		},
	);
	checkpoint(signal);
	const emission = serializeResearchReport(captured, "long-v1");
	const receipt = emission.jsonl;
	const body = captured.primaryResponse
		? {
				bytes: captured.primaryResponse.decodedBytes,
				sha256: captured.primaryResponse.bodySha256,
			}
		: undefined;
	const capture: CaptureMetadata = {
		requestedUrl: captured.requestedUrl,
		finalUrl: captured.finalUrl,
		outcome: captured.outcome,
		contentSuccess: captured.contentSuccess,
		classification: captured.classification,
		primaryResponse: captured.primaryResponse,
		...(captured.failure ? { failure: captured.failure } : {}),
		...(captured.rateLimit ? { rateLimit: captured.rateLimit } : {}),
		...(captured.serviceBackoff
			? { serviceBackoff: captured.serviceBackoff }
			: {}),
		...(captured.metrics ? { metrics: captured.metrics } : {}),
		receiptSha256: createHash("sha256").update(receipt).digest("hex"),
		receiptBytes: receipt.byteLength,
		receiptDisposition: emission.disposition,
		...(body ? { body } : {}),
	};
	const result: ResearchLongContentReport = {
		kind: "native-research-long-content-v1",
		partial: true,
		contentSuccess: false,
		outcome: captured.outcome,
		selector: options.selector,
		capture,
	};
	try {
		if (
			emission.disposition !== "complete" ||
			body === undefined ||
			captured.bodyCapture === undefined ||
			captured.classification.barrier !== null ||
			captured.rateLimit !== undefined ||
			captured.serviceBackoff !== undefined ||
			!["extracted-unverified", "empty-extraction"].includes(captured.outcome)
		) {
			result.failure = {
				category:
					emission.disposition !== "complete"
						? "resource-limit"
						: (captured.failure?.category ?? "policy-denied"),
				stage: "capture",
			};
			if (
				emission.disposition !== "complete" ||
				result.outcome === "extracted-unverified"
			)
				result.outcome = "failure";
			return result;
		}
		checkpoint(signal);
		const trusted = {
			expectedProfile: "long-v1" as const,
			expectedReceiptSha256: capture.receiptSha256,
			expectedBody: body,
		};
		const selection = { selector: options.selector, tableRows: true };
		const replay =
			captured.outcome === "empty-extraction"
				? recoverResearchEmptyOutlineSelector(
						receipt,
						trusted,
						selection,
						signal,
						"markdown",
					)
				: extractResearchReplayJson(
						receipt,
						trusted,
						selection,
						signal,
						"markdown",
					);
		checkpoint(signal);
		result.replay = replay.report;
		result.outcome = replay.report.outcome;
		result.contentSuccess = replay.report.contentSuccess;
		if (result.outcome !== "extracted-unverified")
			result.failure = {
				category:
					result.outcome === "empty-extraction" ? "not-found" : "policy-denied",
				stage: "replay",
			};
		return result;
	} catch (error) {
		checkpoint(signal);
		result.outcome = "failure";
		result.failure = {
			category:
				error instanceof AgentBrowserError ? error.code : "network-error",
			stage: "replay",
		};
		return result;
	} finally {
		receipt.fill(0);
	}
}

function outputFailure() {
	return new AgentBrowserError("closed", "Long content output failed");
}

export async function runResearchLongContentCli(
	args: readonly string[],
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	parseResearchLongContentArguments(args);
	checkpoint(signal);
	if (output.destroyed || output.writableEnded || output.errored)
		throw outputFailure();
	const controller = new AbortController();
	const abort = () => controller.abort();
	const timeout = () =>
		controller.abort(
			new AgentBrowserError("timeout", "Long content deadline exceeded"),
		);
	const outputError = () => controller.abort(outputFailure());
	const timer = setTimeout(timeout, researchLongContentLimits.timeoutMs);
	signal?.addEventListener("abort", abort, { once: true });
	output.on("error", outputError);
	output.on("close", outputError);
	try {
		const result = await researchLongContent(args, controller.signal);
		checkpoint(controller.signal);
		const jsonl = `${JSON.stringify(result)}\n`;
		if (Buffer.byteLength(jsonl) > researchLongContentLimits.maxOutputBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Long content output limit exceeded",
			);
		await new Promise<void>((resolve, reject) => {
			const aborted = () => {
				controller.signal.removeEventListener("abort", aborted);
				reject(cancellation(controller.signal));
			};
			controller.signal.addEventListener("abort", aborted, { once: true });
			try {
				output.write(jsonl, (error) => {
					controller.signal.removeEventListener("abort", aborted);
					if (error) reject(outputFailure());
					else resolve();
				});
			} catch {
				controller.signal.removeEventListener("abort", aborted);
				reject(outputFailure());
			}
		});
		checkpoint(controller.signal);
		return result.outcome === "extracted-unverified" ? 0 : 1;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
		output.off("error", outputError);
		output.off("close", outputError);
	}
}

async function main() {
	const args = process.argv.slice(2);
	process.stdout.on("error", () => {
		process.exitCode = 1;
	});
	process.stderr.on("error", () => {
		process.exitCode = 1;
	});
	if (args.length === 1 && args[0] === "--help") {
		process.stdout.write(usage);
		return;
	}
	try {
		parseResearchLongContentArguments(args);
	} catch {
		process.stderr.write(usage);
		process.exitCode = 64;
		return;
	}
	try {
		process.exitCode = await runResearchLongContentCli(args, process.stdout);
	} catch {
		process.stderr.write("Long content execution or output failed.\n");
		process.exitCode = 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void main().catch(() => {
		process.exitCode = 1;
	});
}
