import { AgentBrowserError } from "./errors.js";
import { type NetworkResponse, parseNetworkUrl } from "./network.js";
import { createScriptCspPolicy } from "./script-csp-policy.js";
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

export interface WorkerScriptSource {
	readonly url: string;
	readonly source: string;
	readonly stringCompilation: "allow" | "deny";
}
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
	// A network worker owns the final response policy. Unsupported directives fail
	// closed until the corresponding child capabilities have policy owners.
	const policy = createScriptCspPolicy(response.url, response.headers);
	if (policy.unsupported)
		throw new AgentBrowserError(
			"policy-denied",
			"Worker response CSP is not supported",
		);
	return Object.freeze({
		url: response.url,
		source: new TextDecoder().decode(response.body),
		stringCompilation: policy.stringCompilation,
	});
}
