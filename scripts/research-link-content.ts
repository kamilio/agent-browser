import { createHash } from "node:crypto";
import type { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import type { BrowserChallengeDiagnostic } from "../src/browser-challenges.js";
import { documentBaseTarget, documentBaseUrl } from "../src/document-url.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError, type ErrorCode } from "../src/errors.js";
import { type DocumentExtraction, extractDocument } from "../src/extraction.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { researchLongDocumentAdmission } from "../src/research-admission.js";
import { loadResearchDocument } from "../src/research-loader.js";
import { validateSelectorSyntax } from "../src/selectors.js";
import { BrowserSession } from "../src/session.js";
import { hasResearchExtractionContent } from "./research-content.js";
import {
	classifyResearchVisibility,
	researchVisibilityEvidence,
} from "./research-visibility.js";

export const researchLinkContentLimits = Object.freeze({
	maxOutputBytes: 512_000,
	maxCandidates: 64,
	timeoutMs: 60_000,
});

const usage =
	"Usage: research-link-content --target HTTPS_URL --selector CSS SOURCE_HTTPS_URL\nExplicit native reader on both pages; exact same-origin link, real click, no scripts, credentials, redirects or retries.\n";
const forbiddenSegments = new Set(
	"account accounts action cart checkout delete edit login logout purchase register signin signout signup submit subscribe unsubscribe wp-admin wp-login.php".split(
		" ",
	),
);

function invalidArguments(): never {
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid link content arguments",
	);
}

function invalidUrlSpelling(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (
			code <= 32 ||
			(code >= 127 && code <= 159) ||
			"\\?#%".includes(value[index])
		)
			return true;
	}
	return false;
}

function publicUrl(value: string): URL {
	if (!value || invalidUrlSpelling(value)) invalidArguments();
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname
			.split("/")
			.some((segment) => forbiddenSegments.has(segment.toLowerCase()))
	)
		invalidArguments();
	return url;
}

export function parseResearchLinkContentArguments(args: readonly string[]): {
	url: string;
	targetUrl: string;
	selector: string;
} {
	if (!Array.isArray(args) || args.length !== 5) invalidArguments();
	for (const value of args)
		if (typeof value !== "string" || value.length > 4096) invalidArguments();
	let url: string | undefined;
	let targetUrl: string | undefined;
	let selector: string | undefined;
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === "--target" && targetUrl === undefined)
			targetUrl = args[++index];
		else if (argument === "--selector" && selector === undefined)
			selector = args[++index];
		else if (!argument.startsWith("--") && url === undefined) url = argument;
		else invalidArguments();
	}
	if (
		url === undefined ||
		targetUrl === undefined ||
		!selector ||
		selector.trim() !== selector ||
		selector.startsWith("--")
	)
		invalidArguments();
	try {
		validateSelectorSyntax(selector, { pseudoElements: false });
		const source = publicUrl(url);
		const target = publicUrl(targetUrl);
		if (source.origin !== target.origin || source.href === target.href)
			invalidArguments();
		return { url: source.href, targetUrl: target.href, selector };
	} catch {
		invalidArguments();
	}
}

type WorkflowStage =
	| "initialize"
	| "source-navigation"
	| "link-selection"
	| "native-click"
	| "extraction"
	| "cleanup"
	| "complete";

export interface ResearchLinkContentReport {
	kind: "native-research-link-content-v1";
	partial: true;
	contentSuccess: null | false;
	outcome:
		| "extracted-unverified"
		| "empty-extraction"
		| "failure"
		| "semantic-barrier"
		| "http-failure";
	sourceUrl: string;
	targetUrl: string;
	selector: string;
	stage: WorkflowStage;
	responses: {
		url: string;
		status: number;
		decodedBytes: number;
		bodySha256: string;
	}[];
	events: string[];
	selection?: {
		reference: string;
		label: string;
		url: string;
		candidates: number;
	};
	extraction?: DocumentExtraction;
	barrier?: BrowserChallengeDiagnostic;
	failure?: { category: ErrorCode; stage: WorkflowStage };
	cleanupFailed?: true;
	metrics?: ReturnType<BrowserSession["metrics"]>;
	documentClosedStates: boolean[];
}

function checkpoint(signal?: AbortSignal): void {
	if (signal?.aborted) throw cancellation(signal);
}

function cancellation(signal: AbortSignal): AgentBrowserError {
	const reason = signal.reason;
	return new AgentBrowserError(
		reason instanceof AgentBrowserError &&
			(reason.code === "timeout" || reason.code === "closed")
			? reason.code
			: "aborted",
		"Link content operation stopped",
	);
}

function refused(message: string): never {
	throw new AgentBrowserError("policy-denied", message);
}

export async function researchLinkContent(
	args: readonly string[],
	signal?: AbortSignal,
): Promise<ResearchLinkContentReport> {
	const options = parseResearchLinkContentArguments(args);
	checkpoint(signal);
	const result: ResearchLinkContentReport = {
		kind: "native-research-link-content-v1",
		partial: true,
		contentSuccess: false,
		outcome: "failure",
		sourceUrl: options.url,
		targetUrl: options.targetUrl,
		selector: options.selector,
		stage: "initialize",
		responses: [],
		events: [],
		documentClosedStates: [],
	};
	const documents: DocumentTree[] = [];
	let session: BrowserSession | undefined;
	let native: NodeNetworkTransport | undefined;
	let requests = 0;
	let selectedUrl: string | undefined;
	try {
		session = new BrowserSession({
			resourceCredentials: "omit",
			createTransport: (cookieJar) => {
				const transport = new NodeNetworkTransport({
					cookieJar,
					allowedOrigins: [new URL(options.url).origin],
					minRequestIntervalMs: 2000,
					limits: {
						timeoutMs: 15_000,
						maxResponseBytes: 4_000_000,
						maxRequestBytes: 1,
						maxHeaderBytes: 16_384,
						maxRedirects: 0,
						maxConcurrent: 1,
						maxRequests: 2,
						maxTotalBytes: 8_000_000,
					},
				});
				native = transport;
				return {
					async request(input) {
						checkpoint(signal);
						if (
							requests >= 2 ||
							input.url !== (requests === 0 ? options.url : selectedUrl) ||
							(input.method ?? "GET") !== "GET" ||
							input.body !== undefined ||
							Object.keys(input.headers ?? {})
								.sort()
								.join(",") !== "Accept-Language,User-Agent" ||
							input.headers?.["User-Agent"] !== "AgentBrowser/0.1" ||
							input.headers?.["Accept-Language"] !== "en-US"
						)
							refused("Unexpected link content request");
						requests++;
						const response = await transport.request({
							...input,
							redirect: "error",
							cookieContext: {
								siteUrl: null,
								...input.cookieContext,
								credentials: "omit",
							},
						});
						checkpoint(signal);
						if (response.url !== input.url || response.redirects.length)
							refused("Unexpected link content response");
						result.responses.push({
							url: response.url,
							status: response.status,
							decodedBytes: response.body.byteLength,
							bodySha256: createHash("sha256")
								.update(response.body)
								.digest("hex"),
						});
						const barrier = classifyResearchVisibility({
							status: response.status,
							headers: response.headers,
							url: response.url,
						});
						if (barrier) {
							result.barrier = barrier;
							result.outcome = "semantic-barrier";
							refused("Response requires user handoff");
						}
						if (response.status < 200 || response.status >= 300) {
							result.outcome = "http-failure";
							refused("Non-success response stops link content");
						}
						return response;
					},
					metrics: () => transport.metrics(),
					close: () => transport.close(),
				};
			},
			loadDocument(response, context) {
				const evidence = researchVisibilityEvidence(
					response,
					context,
					"long-v1",
					"separate-omitted-raw-v1",
					{
						method: "document",
						format: "markdown",
						limits: { maxBytes: 256_000, maxNodes: 50_000, maxDepth: 128 },
					},
					undefined,
					"utf-8",
				);
				if (evidence?.diagnostic) {
					result.barrier = evidence.diagnostic;
					result.outcome = "semantic-barrier";
					refused("Source requires user handoff");
				}
				const tree = loadResearchDocument(
					response,
					context,
					"long-v1",
					"separate-omitted-raw-v1",
					"source-hidden-inline-v1",
					undefined,
					"utf-8",
				);
				documents.push(tree);
				return tree;
			},
			limits: {
				maxTabs: 1,
				maxNavigations: 2,
				maxPendingNavigations: 1,
				navigationTimeoutMs: 20_000,
			},
			documentLimits: researchLongDocumentAdmission.document,
		});
		const tab = session.createTab();
		result.stage = "source-navigation";
		const initial = await session.navigate(tab.id, options.url, { signal });
		checkpoint(signal);
		if (initial.kind !== "document" || initial.url !== options.url)
			refused("Expected source document");
		result.stage = "link-selection";
		const page = session.page(tab.id);
		const tree = page.document;
		if (
			documentBaseUrl(tree) !== options.url ||
			documentBaseTarget(tree) !== "_self"
		)
			refused("Unexpected reader document base");
		const candidates = page.queries.querySelectorAll(options.selector);
		if (candidates.length > researchLinkContentLimits.maxCandidates)
			throw new AgentBrowserError(
				"resource-limit",
				"Link candidate limit exceeded",
			);
		const eligible: { id: number; label: string }[] = [];
		for (const id of candidates) {
			const node = tree.get(id);
			const attributes = node.attributes;
			if (
				node.kind !== "element" ||
				node.tagName !== "a" ||
				!attributes.href ||
				invalidUrlSpelling(attributes.href) ||
				Object.keys(attributes).some((name) => name.startsWith("on")) ||
				["download", "ping", "hidden", "inert", "disabled"].some((name) =>
					Object.hasOwn(attributes, name),
				) ||
				attributes["aria-hidden"]?.toLowerCase() === "true" ||
				attributes["aria-disabled"]?.toLowerCase() === "true" ||
				attributes.role === "button" ||
				(attributes.rel ?? "")
					.split(/\s+/)
					.some((value) =>
						["external", "sponsored"].includes(value.toLowerCase()),
					) ||
				!["", "_self"].includes((attributes.target ?? "").toLowerCase())
			)
				continue;
			let url: URL;
			try {
				url = new URL(attributes.href, options.url);
			} catch {
				continue;
			}
			if (url.href !== options.targetUrl) continue;
			const label = tree.textContent(id).replace(/\s+/g, " ").trim();
			if (label && label.length <= 1000) eligible.push({ id, label });
		}
		if (eligible.length !== 1)
			throw new AgentBrowserError(
				"not-found",
				"Expected one eligible reader link",
			);
		const selected = eligible[0];
		selectedUrl = options.targetUrl;
		const reference = tree.reference(selected.id);
		result.selection = {
			reference,
			label: selected.label,
			url: selectedUrl,
			candidates: candidates.length,
		};
		for (const type of ["mousedown", "mouseup", "click"])
			page.interactions.events.addEventListener(selected.id, type, (event) =>
				result.events.push(event.type),
			);
		result.stage = "native-click";
		const clicked = await session.click(tab.id, reference, { signal });
		checkpoint(signal);
		if (
			clicked.navigation?.kind !== "document" ||
			clicked.navigation.url !== selectedUrl ||
			requests !== 2 ||
			session.page(tab.id) === page ||
			result.events.join(",") !== "mousedown,mouseup,click"
		)
			refused("Native link navigation did not complete");
		result.stage = "extraction";
		result.extraction = extractDocument(session.page(tab.id).document, {
			format: "markdown",
			contentFocus: "main-content-v2",
			outputLimitPolicy: "text-prefix-v1",
			tableRows: true,
			maxBytes: 256_000,
			maxNodes: 50_000,
			maxDepth: 128,
		});
		checkpoint(signal);
		if (hasResearchExtractionContent(result.extraction)) {
			result.outcome = "extracted-unverified";
			result.contentSuccess = null;
			result.stage = "complete";
		} else {
			result.outcome = "empty-extraction";
			result.failure = { category: "not-found", stage: result.stage };
		}
	} catch (error) {
		checkpoint(signal);
		result.failure = {
			category:
				error instanceof AgentBrowserError ? error.code : "network-error",
			stage: result.stage,
		};
	} finally {
		let cleanupFailed = false;
		try {
			session?.close();
		} catch {
			cleanupFailed = true;
		}
		try {
			native?.close();
		} catch {
			cleanupFailed = true;
		}
		for (const tree of documents) {
			try {
				tree.close();
			} catch {
				cleanupFailed = true;
			}
		}
		try {
			result.metrics = session?.metrics();
			result.documentClosedStates = documents.map(
				(tree) => tree.mutationMetrics().closed,
			);
			if (
				result.metrics &&
				(!result.metrics.closed ||
					!result.metrics.network.closed ||
					result.metrics.network.active !== 0 ||
					result.metrics.pendingLoads !== 0 ||
					result.metrics.tabs !== 0 ||
					result.metrics.cleanupErrors !== 0 ||
					result.documentClosedStates.some((closed) => !closed))
			)
				cleanupFailed = true;
		} catch {
			cleanupFailed = true;
		}
		if (cleanupFailed) {
			result.outcome = "failure";
			result.contentSuccess = false;
			result.cleanupFailed = true;
			if (!result.failure) {
				result.failure = { category: "closed", stage: "cleanup" };
				result.stage = "cleanup";
			}
		}
	}
	checkpoint(signal);
	return result;
}

function outputFailure(): AgentBrowserError {
	return new AgentBrowserError("closed", "Link content output failed");
}

export async function runResearchLinkContentCli(
	args: readonly string[],
	output: Writable,
	signal?: AbortSignal,
): Promise<number> {
	parseResearchLinkContentArguments(args);
	checkpoint(signal);
	if (output.destroyed || output.writableEnded || output.errored)
		throw outputFailure();
	const controller = new AbortController();
	const abort = () => controller.abort();
	const outputError = () => controller.abort(outputFailure());
	const timer = setTimeout(
		() =>
			controller.abort(
				new AgentBrowserError("timeout", "Link content deadline exceeded"),
			),
		researchLinkContentLimits.timeoutMs,
	);
	signal?.addEventListener("abort", abort, { once: true });
	output.on("error", outputError);
	output.on("close", outputError);
	try {
		const result = await researchLinkContent(args, controller.signal);
		checkpoint(controller.signal);
		const jsonl = `${JSON.stringify(result)}\n`;
		if (Buffer.byteLength(jsonl) > researchLinkContentLimits.maxOutputBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Link content output limit exceeded",
			);
		await new Promise<void>((resolve, reject) => {
			let writeAcknowledged = false;
			let writeErrorObserved = false;
			const releaseWriteGuards = () => {
				output.off("error", writeError);
				output.off("close", releaseWriteGuards);
			};
			const writeError = () => {
				writeErrorObserved = true;
				if (writeAcknowledged) releaseWriteGuards();
			};
			const aborted = () => {
				controller.signal.removeEventListener("abort", aborted);
				reject(cancellation(controller.signal));
			};
			controller.signal.addEventListener("abort", aborted, { once: true });
			output.on("error", writeError);
			output.on("close", releaseWriteGuards);
			try {
				output.write(jsonl, (error) => {
					writeAcknowledged = true;
					controller.signal.removeEventListener("abort", aborted);
					if (!error || writeErrorObserved) releaseWriteGuards();
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
		parseResearchLinkContentArguments(args);
	} catch {
		process.stderr.write(usage);
		process.exitCode = 64;
		return;
	}
	try {
		process.exitCode = await runResearchLinkContentCli(args, process.stdout);
	} catch {
		process.stderr.write("Link content execution or output failed.\n");
		process.exitCode = 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	void main().catch(() => {
		process.exitCode = 1;
	});
