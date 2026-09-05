import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
	type BrowserChallengeDiagnostic,
	classifyBrowserChallenge,
} from "../src/browser-challenges.js";
import { documentBody } from "../src/document-elements.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import { documentTitle } from "../src/document-title.js";
import { AgentBrowserError } from "../src/errors.js";
import { type DocumentExtraction, extractDocument } from "../src/extraction.js";
import { htmlParseInfo } from "../src/html-info.js";
import {
	type NetworkMetrics,
	NetworkPolicy,
	type NetworkResponse,
} from "../src/network.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import {
	type ResearchReaderReport,
	loadResearchDocument,
	researchReaderInfo,
	researchReaderProfile,
} from "../src/research-loader.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
} from "../src/resource-limit.js";
import { validateSelectorSyntax } from "../src/selectors.js";
import {
	BrowserSession,
	type NavigationResult,
	type SessionPage,
} from "../src/session.js";
import {
	type ResearchBodyCapture,
	captureResearchBody,
} from "./research-body-capture.js";

export const researchRunLimits = Object.freeze({
	maxUrls: 8,
	maxUrlCodeUnits: 4096,
	selectorCodeUnits: 4096,
	diagnosticTextCodeUnits: 8192,
	deadlineMs: 120_000,
	navigationTimeoutMs: 20_000,
	extractionBytes: 256_000,
	network: Object.freeze({
		timeoutMs: 15_000,
		maxResponseBytes: 2_000_000,
		maxRequestBytes: 1,
		maxHeaderBytes: 16_384,
		maxRedirects: 5,
		maxConcurrent: 1,
		maxRequests: 12,
		maxTotalBytes: 8_000_000,
	}),
});

export interface PrimaryResponseSummary {
	url: string;
	status: number;
	receivedAt: string;
	headers: Readonly<Record<string, readonly string[]>>;
	decodedBytes: number;
	encodedBytes: number;
	bodySha256: string;
	hashScope: "transport-decoded-body-before-loader";
	redirects: number;
	elapsedMs: number;
}

function reportUrl(value: string) {
	const url = new URL(value);
	url.username = "";
	url.password = "";
	if (url.search) url.search = "?redacted";
	url.hash = "";
	return url.href.slice(0, researchRunLimits.maxUrlCodeUnits);
}

export function summarizePrimaryResponse(
	response: NetworkResponse,
): PrimaryResponseSummary {
	const headers: Record<string, readonly string[]> = Object.create(null);
	for (const name of ["content-type", "content-length", "content-encoding"]) {
		const values = response.headers[name];
		if (values)
			headers[name] = values.slice(0, 2).map((value) => value.slice(0, 160));
	}
	return {
		url: reportUrl(response.url),
		status: response.status,
		receivedAt: new Date().toISOString(),
		headers,
		decodedBytes: response.body.byteLength,
		encodedBytes: response.encodedBytes,
		bodySha256: createHash("sha256").update(response.body).digest("hex"),
		hashScope: "transport-decoded-body-before-loader",
		redirects: response.redirects.length,
		elapsedMs: response.elapsedMs,
	};
}

function researchSelector(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length > researchRunLimits.selectorCodeUnits ||
		!value.trim() ||
		value.startsWith("--")
	)
		throw new AgentBrowserError("invalid-input", "Invalid research selector");
	try {
		validateSelectorSyntax(value);
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid research selector");
	}
	return value;
}

export interface ResearchLineRange {
	start: number;
	end: number;
}

function validateResearchLines(value: ResearchLineRange): ResearchLineRange {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		!Number.isSafeInteger(value.start) ||
		!Number.isSafeInteger(value.end) ||
		value.start < 1 ||
		value.end < value.start ||
		value.end > 2_000_001
	)
		throw new AgentBrowserError("invalid-input", "Invalid research lines");
	return { start: value.start, end: value.end };
}

function researchLines(value: unknown): ResearchLineRange {
	if (
		typeof value !== "string" ||
		value.length > 15 ||
		value.trim() !== value ||
		!/^[1-9][0-9]{0,6}:[1-9][0-9]{0,6}$/.test(value)
	)
		throw new AgentBrowserError("invalid-input", "Invalid research lines");
	const [start, end] = value.split(":").map(Number);
	return validateResearchLines({ start, end });
}

export function parseResearchArguments(args: readonly string[]) {
	let reader = false;
	let captureBody = false;
	let selector: string | undefined;
	let lines: ResearchLineRange | undefined;
	const urls: string[] = [];
	const policy = new NetworkPolicy();
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === "--lines" && lines === undefined) {
			lines = researchLines(args[++index]);
			continue;
		}
		if (argument === "--capture-body" && !captureBody) {
			captureBody = true;
			continue;
		}
		if (argument === "--selector" && selector === undefined) {
			selector = researchSelector(args[++index]);
			continue;
		}
		if (argument === "--reader" && !reader) {
			reader = true;
			continue;
		}
		if (
			argument.startsWith("-") ||
			argument.length > researchRunLimits.maxUrlCodeUnits ||
			urls.length >= researchRunLimits.maxUrls
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid research arguments",
			);
		const url = policy.checkUrl(argument);
		if (url.hash)
			throw new AgentBrowserError(
				"invalid-input",
				"Research URLs cannot contain fragments",
			);
		urls.push(url.href);
	}
	if (selector !== undefined && lines !== undefined)
		throw new AgentBrowserError(
			"invalid-input",
			"Research lines and selector are mutually exclusive",
		);
	if (!urls.length)
		throw new AgentBrowserError(
			"invalid-input",
			"Explicit public URLs required",
		);
	return {
		reader,
		urls,
		...(selector === undefined ? {} : { selector }),
		...(lines === undefined ? {} : { lines }),
		...(captureBody ? { captureBody: true as const } : {}),
	};
}

const diagnosticOmissions = new Set(
	"head script style template iframe noembed noframes object embed canvas input textarea select datalist".split(
		" ",
	),
);

function diagnosticText(page: SessionPage): string {
	const tree = page.document;
	const pending: (number | null)[] = [documentBody(tree) ?? tree.root];
	const scripting = htmlParseInfo(tree)?.scripting ?? false;
	let text = "";
	while (
		pending.length &&
		text.length < researchRunLimits.diagnosticTextCodeUnits
	) {
		const id = pending.pop();
		if (id === null) {
			text += " ";
			continue;
		}
		if (id === undefined) break;
		const node = tree.get(id);
		if (
			node.kind === "comment" ||
			node.kind === "doctype" ||
			diagnosticOmissions.has(node.tagName) ||
			Object.hasOwn(node.attributes, "hidden") ||
			Object.hasOwn(node.attributes, "inert") ||
			node.attributes["aria-hidden"]?.toLowerCase() === "true" ||
			(node.tagName === "noscript" && scripting)
		)
			continue;
		const style = page.styles.get(id);
		if (!style.displayed) continue;
		if (node.tagName === "br") {
			if (style.visible) text += " ";
			continue;
		}
		const content =
			node.kind === "text"
				? node.data
				: node.tagName === "img"
					? ` ${node.attributes.alt ?? ""} `
					: undefined;
		if (content !== undefined) {
			if (style.visible)
				text += content.slice(
					0,
					researchRunLimits.diagnosticTextCodeUnits - text.length,
				);
			continue;
		}
		if (!style.display.startsWith("inline")) {
			text += " ";
			pending.push(null);
		}
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]);
	}
	return text;
}

export type ResearchOutcome =
	| "extracted-unverified"
	| "semantic-barrier"
	| "http-failure"
	| "empty-extraction"
	| "failure";

export interface ResearchNavigationReport {
	requestedUrl: string;
	finalUrl: string | null;
	startedAt: string;
	finishedAt: string;
	elapsedMs: number;
	profile: "native" | typeof researchReaderProfile;
	partial: true;
	contentSuccess: null | false;
	classification: {
		classifier: "browser-challenges";
		barrier: BrowserChallengeDiagnostic["kind"] | null;
		diagnostic: BrowserChallengeDiagnostic | null;
	};
	primaryResponse: PrimaryResponseSummary | null;
	bodyCapture?: ResearchBodyCapture;
	selection?:
		| { method: "css-selector"; matches: number | null }
		| { method: "text-lines"; start: number; end: number };
	outcome: ResearchOutcome;
	failure?: {
		category: string;
		stage: string;
		resourceLimit?: Readonly<ResourceLimitDiagnostic>;
	};
	navigation?: NavigationResult;
	extraction?: DocumentExtraction;
	reader?: Readonly<ResearchReaderReport>;
	metrics?: Readonly<NetworkMetrics>;
}

export async function researchNavigation(
	url: string,
	reader = false,
	signal?: AbortSignal,
	selector?: string,
	captureBody = false,
	lines?: ResearchLineRange,
): Promise<ResearchNavigationReport> {
	if (typeof captureBody !== "boolean")
		throw new AgentBrowserError("invalid-input", "Invalid research arguments");
	const lineRange =
		lines === undefined ? undefined : validateResearchLines(lines);
	const validated = parseResearchArguments([
		...(reader ? ["--reader"] : []),
		...(captureBody ? ["--capture-body"] : []),
		...(selector === undefined ? [] : ["--selector", selector]),
		...(lineRange === undefined
			? []
			: ["--lines", `${lineRange.start}:${lineRange.end}`]),
		url,
	]);
	const started = Date.now();
	const report: ResearchNavigationReport = {
		requestedUrl: reportUrl(validated.urls[0]),
		finalUrl: null,
		startedAt: new Date(started).toISOString(),
		finishedAt: "",
		elapsedMs: 0,
		profile: reader ? researchReaderProfile : "native",
		partial: true,
		contentSuccess: null,
		classification: {
			classifier: "browser-challenges",
			barrier: null,
			diagnostic: null,
		},
		primaryResponse: null,
		...(validated.selector === undefined
			? {}
			: { selection: { method: "css-selector" as const, matches: null } }),
		...(validated.lines === undefined
			? {}
			: { selection: { method: "text-lines" as const, ...validated.lines } }),
		outcome: "failure",
	};
	let stage = "setup";
	let session: BrowserSession | undefined;
	let transport: NodeNetworkTransport | undefined;
	let primaryStarted = false;
	let primaryHeaders: NetworkResponse["headers"] = {};
	let primaryUrl: string | undefined;
	try {
		session = new BrowserSession({
			createTransport: (cookieJar) => {
				const native = new NodeNetworkTransport({
					cookieJar,
					limits: researchRunLimits.network,
				});
				transport = native;
				return {
					async request(request) {
						const primary = !primaryStarted;
						primaryStarted = true;
						if (primary) stage = "network";
						if (
							(request.method ?? "GET") !== "GET" ||
							request.body !== undefined
						)
							throw new AgentBrowserError(
								"policy-denied",
								"Research is read only",
							);
						for (const name of Object.keys(request.headers ?? {})) {
							if (
								["authorization", "proxy-authorization", "cookie"].includes(
									name.toLowerCase(),
								)
							)
								throw new AgentBrowserError(
									"policy-denied",
									"Research credentials are disabled",
								);
						}
						const response = await native.request({
							...request,
							cookieContext: {
								siteUrl: null,
								...request.cookieContext,
								credentials: "omit",
							},
						});
						if (primary) {
							report.primaryResponse = summarizePrimaryResponse(response);
							report.finalUrl = report.primaryResponse.url;
							if (captureBody) {
								stage = "body-capture";
								report.bodyCapture = captureResearchBody(response.body);
							}
							primaryHeaders = response.headers;
							primaryUrl = response.url;
							const diagnostic = classifyBrowserChallenge({
								status: response.status,
								headers: primaryHeaders,
							});
							if (diagnostic) {
								report.classification.diagnostic = diagnostic;
								report.classification.barrier = diagnostic.kind;
								report.outcome = "semantic-barrier";
								stage = "semantic-barrier";
								throw new AgentBrowserError(
									"policy-denied",
									"Research barrier requires user handoff",
								);
							}
							stage = "navigation";
						}
						return response;
					},
					metrics: () => native.metrics(),
					close: () => native.close(),
				};
			},
			loadDocument: (response, context) => {
				stage = "loader";
				return reader
					? loadResearchDocument(response, context)
					: loadBrowserDocument(response, context);
			},
			limits: {
				maxTabs: 1,
				maxNavigations: 1,
				navigationTimeoutMs: researchRunLimits.navigationTimeoutMs,
			},
			documentLimits: {
				maxNodes: 50_000,
				maxDepth: 128,
				maxTextCodeUnits: 2_000_000,
			},
		});
		const tab = session.createTab();
		const navigation = await session.navigate(tab.id, validated.urls[0], {
			signal,
		});
		report.navigation = {
			...navigation,
			url: navigation.url ? reportUrl(navigation.url) : null,
			...(navigation.response
				? {
						response: {
							...navigation.response,
							url: reportUrl(navigation.response.url),
						},
					}
				: {}),
		};
		stage = "extraction";
		if (navigation.kind !== "document")
			throw new AgentBrowserError(
				"unsupported",
				"Research requires a document",
			);
		const page = session.page(tab.id);
		const tree = page.document;
		report.reader = researchReaderInfo(tree);
		const status = report.primaryResponse?.status ?? 0;
		let root: string | undefined;
		if (validated.selector !== undefined || validated.lines !== undefined) {
			stage = "document-classification";
			const diagnostic = classifyBrowserChallenge({
				status,
				headers: primaryHeaders,
				url: primaryUrl,
				title: documentTitle(tree),
				text: diagnosticText(page),
			});
			if (diagnostic) {
				report.classification.diagnostic = diagnostic;
				report.classification.barrier = diagnostic.kind;
				report.outcome = "semantic-barrier";
				stage = "semantic-barrier";
				throw new AgentBrowserError(
					"policy-denied",
					"Research barrier requires user handoff",
				);
			}
		}
		if (validated.selector !== undefined) {
			stage = "selection";
			const matches = page.queries.querySelectorAll(validated.selector);
			report.selection = { method: "css-selector", matches: matches.length };
			if (matches.length !== 1)
				throw new AgentBrowserError(
					matches.length ? "invalid-input" : "not-found",
					"Research selector requires one element",
				);
			root = tree.reference(matches[0]);
		}
		stage = "extraction";
		const extraction = extractDocument(tree, {
			format: "markdown",
			...(root === undefined ? {} : { root }),
			...(validated.lines === undefined ? {} : { lines: validated.lines }),
			maxBytes: researchRunLimits.extractionBytes,
			maxNodes: 50_000,
			maxDepth: 128,
		});
		report.classification.diagnostic = classifyBrowserChallenge({
			status,
			headers: primaryHeaders,
			url: primaryUrl,
			title: extraction.title,
			text: typeof extraction.content === "string" ? extraction.content : "",
		});
		report.classification.barrier =
			report.classification.diagnostic?.kind ?? null;
		if (report.classification.barrier) report.outcome = "semantic-barrier";
		else if (status < 200 || status >= 300) report.outcome = "http-failure";
		else if (
			typeof extraction.content !== "string" ||
			!extraction.content.trim()
		)
			report.outcome = "empty-extraction";
		else report.outcome = "extracted-unverified";
		if (report.outcome !== "extracted-unverified")
			report.contentSuccess = false;
		report.extraction = { ...extraction, url: reportUrl(extraction.url) };
	} catch (error) {
		const resourceLimit =
			error instanceof AgentBrowserError && error.code === "resource-limit"
				? resourceLimitDiagnostic(error)
				: undefined;
		report.failure = {
			category:
				error instanceof AgentBrowserError ? error.code : "internal-error",
			stage,
			...(resourceLimit ? { resourceLimit } : {}),
		};
		report.contentSuccess = false;
	} finally {
		session?.close();
		report.metrics = transport?.metrics();
		report.finishedAt = new Date().toISOString();
		report.elapsedMs = Date.now() - started;
	}
	return report;
}

export function researchExitCode(reports: readonly ResearchNavigationReport[]) {
	const successes = reports.filter(
		(report) => report.outcome === "extracted-unverified",
	).length;
	return successes === reports.length && successes > 0
		? 0
		: successes > 0
			? 2
			: 1;
}

async function main() {
	const { urls, reader, selector, captureBody, lines } = parseResearchArguments(
		process.argv.slice(2),
	);
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(),
		researchRunLimits.deadlineMs,
	);
	const reports: ResearchNavigationReport[] = [];
	try {
		for (const url of urls) {
			const report = await researchNavigation(
				url,
				reader,
				controller.signal,
				selector,
				captureBody,
				lines,
			);
			reports.push(report);
			process.stdout.write(`${JSON.stringify(report)}\n`);
		}
		process.exitCode = researchExitCode(reports);
	} finally {
		clearTimeout(timer);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void main().catch(() => {
		process.stderr.write(
			"Usage: research-browser [--reader] [--capture-body] [--selector CSS | --lines START:END] PUBLIC_HTTP_URL... (1–8 URLs)\n",
		);
		process.exitCode = 64;
	});
}
