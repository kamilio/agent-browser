import { cookieSameSite } from "./cookies.js";
import { type FetchCredentials, checkCors } from "./cors.js";
import { AgentBrowserError } from "./errors.js";
import {
	type NetworkRequest,
	type NetworkResponse,
	parseNetworkUrl,
} from "./network.js";

export interface ScriptFetchPolicy {
	readonly mode: "cors" | "no-cors";
	readonly credentials: FetchCredentials;
}

export interface ScriptFetchContext {
	readonly documentUrl: string;
	readonly signal: AbortSignal;
	readonly maxRedirects: number;
	readonly request: (input: NetworkRequest) => Promise<NetworkResponse>;
	readonly checkContentSecurityPolicy?: (
		url: string,
		redirectCount: number,
	) => void;
}

export interface ScriptFetchResult {
	readonly response: NetworkResponse;
	readonly type: "basic" | "cors" | "opaque";
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const headerToken = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function target(input: string, base: string, document: URL): URL {
	if (
		typeof input !== "string" ||
		input.length > 16_384 ||
		/\p{Cc}/u.test(input)
	)
		throw new AgentBrowserError("invalid-input", "Invalid script URL");
	let resolved: URL;
	try {
		resolved = new URL(input, base);
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid script URL");
	}
	const url = parseNetworkUrl(resolved.href);
	if (document.protocol === "https:" && url.protocol !== "https:")
		throw new AgentBrowserError(
			"policy-denied",
			"Mixed-content script fetch is not allowed",
		);
	url.hash = "";
	return url;
}

function responseHeaders(input: NetworkResponse["headers"]) {
	const headers: Record<string, string> = Object.create(null);
	let locations: string[] | undefined;
	let bytes = 0;
	for (const [key, values] of Object.entries(input)) {
		if (key.length > 256 || !headerToken.test(key) || !Array.isArray(values))
			throw new TypeError("Invalid script response header");
		const name = key.toLowerCase();
		if (["set-cookie", "set-cookie2"].includes(name)) continue;
		if (name === "location") locations ??= [];
		for (const value of values) {
			if (typeof value !== "string" || /[^\t\x20-\x7e\x80-\xff]/.test(value))
				throw new TypeError("Invalid script response header");
			bytes += name.length + value.length;
			if (bytes > 16_384)
				throw new AgentBrowserError(
					"resource-limit",
					"Script response header limit exceeded",
				);
			headers[name] = Object.hasOwn(headers, name)
				? `${headers[name]}, ${value}`
				: value;
			if (name === "location") locations?.push(value);
		}
	}
	return { headers, locations };
}

export async function fetchScriptResource(
	input: string,
	policy: ScriptFetchPolicy,
	context: ScriptFetchContext,
): Promise<Readonly<ScriptFetchResult>> {
	if (
		!policy ||
		!["cors", "no-cors"].includes(policy.mode) ||
		!["omit", "same-origin", "include"].includes(policy.credentials) ||
		!context ||
		!(context.signal instanceof AbortSignal) ||
		typeof context.request !== "function" ||
		(context.checkContentSecurityPolicy !== undefined &&
			typeof context.checkContentSecurityPolicy !== "function") ||
		!Number.isInteger(context.maxRedirects) ||
		context.maxRedirects < 0 ||
		context.maxRedirects > 20
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid script fetch policy or context",
		);
	const { mode, credentials } = policy;
	const {
		documentUrl,
		signal,
		maxRedirects,
		request,
		checkContentSecurityPolicy,
	} = context;
	const document = parseNetworkUrl(documentUrl);
	let url = target(input, document.href, document);
	let crossOriginTainted = false;
	let originTainted = false;
	let crossSiteRedirect = false;
	let encodedBytes = 0;
	let elapsedMs = 0;
	const redirects: NetworkResponse["redirects"][number][] = [];
	for (;;) {
		signal.throwIfAborted();
		checkContentSecurityPolicy?.(url.href, redirects.length);
		signal.throwIfAborted();
		crossOriginTainted ||= url.origin !== document.origin;
		const cors = mode === "cors" && crossOriginTainted;
		const origin = originTainted ? "null" : document.origin;
		const response = await request({
			url: url.href,
			method: "GET",
			headers: { accept: "*/*", ...(cors ? { origin } : {}) },
			redirect: "manual",
			signal,
			cookieContext: {
				siteUrl: documentUrl,
				topLevelNavigation: false,
				credentials:
					crossOriginTainted && credentials === "same-origin"
						? "omit"
						: credentials,
				crossSiteRedirect,
			},
		});
		signal.throwIfAborted();
		if (
			response.redirects.length ||
			target(response.url, url.href, document).href !== url.href
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Script fetch adapter must not follow redirects",
			);
		checkContentSecurityPolicy?.(response.url, redirects.length);
		signal.throwIfAborted();
		const { headers, locations } = responseHeaders(response.headers);
		if (cors) checkCors(headers, origin, credentials);
		encodedBytes += response.encodedBytes;
		elapsedMs += response.elapsedMs;
		if (redirectStatuses.has(response.status) && locations !== undefined) {
			if (locations.length !== 1)
				throw new AgentBrowserError(
					"network-error",
					"Ambiguous script redirect location",
				);
			if (redirects.length >= maxRedirects)
				throw new AgentBrowserError(
					"resource-limit",
					"Script redirect limit exceeded",
				);
			const next = target(locations[0], url.href, document);
			if (url.origin !== next.origin)
				originTainted ||= url.origin !== document.origin;
			crossSiteRedirect ||= !cookieSameSite(next.href, url.href);
			redirects.push(
				Object.freeze({
					url: url.href,
					status: response.status,
					location: next.href,
				}),
			);
			url = next;
			continue;
		}
		return Object.freeze({
			response: {
				...response,
				redirects: Object.freeze(redirects),
				encodedBytes,
				elapsedMs,
			},
			type: crossOriginTainted ? (cors ? "cors" : "opaque") : "basic",
		});
	}
}
