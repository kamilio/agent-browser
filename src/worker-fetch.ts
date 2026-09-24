import { ContentSecurityPolicy } from "./content-security-policy.js";
import { AgentBrowserError } from "./errors.js";
import { type NetworkResponse, parseNetworkUrl } from "./network.js";
import { createWorkerScriptCspPolicy } from "./script-csp-policy.js";
import {
	type ScriptFetchContext,
	fetchScriptResource,
} from "./script-fetch.js";

const javascriptTypes = new Set([
	"application/ecmascript",
	"application/javascript",
	"application/x-ecmascript",
	"application/x-javascript",
	"text/ecmascript",
	"text/javascript",
	"text/javascript1.0",
	"text/javascript1.1",
	"text/javascript1.2",
	"text/javascript1.3",
	"text/javascript1.4",
	"text/javascript1.5",
	"text/jscript",
	"text/livescript",
	"text/x-ecmascript",
	"text/x-javascript",
]);

export function isWorkerJavaScriptMimeType(type: string): boolean {
	return javascriptTypes.has(type.split(";", 1)[0].trim().toLowerCase());
}

export interface WorkerScriptSource {
	readonly url: string;
	readonly source: string;
	readonly stringCompilation: "allow" | "deny";
	readonly wasmCompilation?: "allow" | "deny";
	readonly checkImport?: WorkerImportPolicy;
	readonly checkConnect?: (url: string) => void;
	readonly redirectCount?: number;
}
export type WorkerImportPolicy = (url: string, redirects: number) => void;
export interface WorkerImportedSource {
	readonly url: string;
	readonly source: string;
	readonly redirectCount?: number;
}
export type WorkerImportFetch = (
	url: string,
	signal: AbortSignal,
	policy: WorkerImportPolicy,
) => Promise<Readonly<WorkerImportedSource>>;
export type WorkerScriptFetch = (
	url: string,
	signal: AbortSignal,
) => Promise<Readonly<WorkerScriptSource>>;

export async function fetchWorkerScript(
	url: string,
	context: ScriptFetchContext,
	maxBytes = 1_048_576,
): Promise<Readonly<WorkerScriptSource>> {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16_777_216)
		throw new TypeError("Invalid Worker source byte limit");
	const document = parseNetworkUrl(context.documentUrl);
	const check = (target: string, redirects: number) => {
		if (parseNetworkUrl(target).origin !== document.origin)
			throw new AgentBrowserError(
				"policy-denied",
				"Classic Worker source must be same-origin",
			);
		context.checkContentSecurityPolicy?.(target, redirects);
	};
	const { response } = await fetchScriptResource(
		url,
		{ mode: "no-cors", credentials: "same-origin" },
		{
			...context,
			checkContentSecurityPolicy: check,
			request: (input) =>
				context.request({ ...input, maxResponseBytes: maxBytes }),
		},
	);
	context.signal.throwIfAborted();
	return decodeWorkerScript(response, maxBytes);
}

export function decodeWorkerScript(
	response: NetworkResponse,
	maxBytes = 1_048_576,
): Readonly<WorkerScriptSource> {
	const decoded = decodeWorkerImportedScript(response, maxBytes);
	const policy = createWorkerScriptCspPolicy(response.url, response.headers);
	if (policy.unsupported)
		throw new AgentBrowserError(
			"policy-denied",
			"Worker response CSP is not supported",
		);
	return Object.freeze({
		...decoded,
		stringCompilation: policy.stringCompilation,
		wasmCompilation: policy.wasmCompilation,
		checkImport: workerImportPolicy(response.url, response.headers),
		checkConnect: workerConnectPolicy(response.url, response.headers),
	});
}

export function workerConnectPolicy(
	documentUrl: string,
	headers: NetworkResponse["headers"],
): (url: string) => void {
	const values = Object.entries(headers)
		.filter(([name]) => name.toLowerCase() === "content-security-policy")
		.flatMap(([, values]) => [...values]);
	const matcher = new ContentSecurityPolicy(documentUrl, values, "connect");
	return (url) => {
		if (!matcher.allows(url))
			throw new AgentBrowserError(
				"policy-denied",
				"Worker connection blocked by Content Security Policy",
			);
	};
}

export function workerImportPolicy(
	documentUrl: string,
	headers: NetworkResponse["headers"],
): WorkerImportPolicy {
	const values = Object.entries(headers)
		.filter(([name]) => name.toLowerCase() === "content-security-policy")
		.flatMap(([, values]) => [...values]);
	// Worker imports use script-src/default-src, without script-src-elem, worker-src
	// or child-src. The existing Worker matcher also handles Blob origin matching.
	const filtered = values.map((value) =>
		value
			.split(",")
			.map((policy) =>
				policy
					.split(";")
					.filter((directive) =>
						/^[\t ]*(?:script-src|default-src)(?:[\t ]|$)/i.test(directive),
					)
					.join(";"),
			)
			.join(","),
	);
	const matcher = new ContentSecurityPolicy(documentUrl, filtered, "worker");
	return (url, redirects) => {
		if (!matcher.allows(url, redirects))
			throw new AgentBrowserError(
				"policy-denied",
				"Worker import blocked by Content Security Policy",
			);
	};
}

export async function fetchWorkerImportedScript(
	url: string,
	context: ScriptFetchContext,
	maxBytes = 1_048_576,
): Promise<Readonly<WorkerImportedSource>> {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16_777_216)
		throw new TypeError("Invalid Worker source byte limit");
	const { response } = await fetchScriptResource(
		url,
		{ mode: "no-cors", credentials: "same-origin" },
		{
			...context,
			request: (input) =>
				context.request({ ...input, maxResponseBytes: maxBytes }),
		},
	);
	context.signal.throwIfAborted();
	return decodeWorkerImportedScript(response, maxBytes);
}

export function decodeWorkerImportedScript(
	response: NetworkResponse,
	maxBytes = 1_048_576,
): Readonly<WorkerImportedSource> {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16_777_216)
		throw new TypeError("Invalid Worker source byte limit");
	parseNetworkUrl(response.url);
	if (response.status < 200 || response.status > 299)
		throw new AgentBrowserError(
			"network-error",
			"Worker script request failed",
		);
	if (response.body.byteLength > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Worker source byte limit exceeded",
		);
	const contentTypes = Object.entries(response.headers)
		.filter(([name]) => name.toLowerCase() === "content-type")
		.flatMap(([, values]) => [...values]);
	const mime =
		contentTypes.length === 1
			? contentTypes[0].split(";", 1)[0].trim().toLowerCase()
			: "";
	if (!javascriptTypes.has(mime))
		throw new AgentBrowserError(
			"policy-denied",
			"Worker requires a JavaScript MIME type",
		);
	return Object.freeze({
		url: response.url,
		source: new TextDecoder().decode(response.body),
		redirectCount: response.redirects.length,
	});
}
