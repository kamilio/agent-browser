import { AgentBrowserError } from "./errors.js";
import {
	type NetworkRequest,
	type NetworkResponse,
	parseNetworkUrl,
} from "./network.js";

interface SecureNavigationContext {
	readonly maxRedirects: number;
	readonly timeoutMs: number;
	checkCurrent(): void;
	sameSite(url: string, siteUrl: string | null): boolean;
	request(input: NetworkRequest): Promise<NetworkResponse>;
}

function secureUrl(value: string): URL {
	if (value.length > 4096 || /%(?![0-9a-f]{2})/i.test(value))
		throw new AgentBrowserError(
			"policy-denied",
			"Invalid secure navigation URL",
		);
	const url = parseNetworkUrl(value);
	if (url.protocol !== "https:" || url.href.length > 4096)
		throw new AgentBrowserError(
			"policy-denied",
			"Navigation requires a secure URL",
		);
	return url;
}

function resourceUrl(url: URL): string {
	const resource = new URL(url.href);
	resource.hash = "";
	return resource.href;
}

function redirectLocation(headers: NetworkResponse["headers"]): string {
	const fields = Object.entries(headers);
	if (fields.length > 128)
		throw new AgentBrowserError(
			"resource-limit",
			"Navigation header count exceeded",
		);
	const locations: string[] = [];
	for (const [name, values] of fields) {
		if (name.toLowerCase() !== "location") continue;
		if (!Array.isArray(values) || values.length !== 1 || locations.length)
			throw new AgentBrowserError(
				"network-error",
				"Ambiguous navigation redirect location",
			);
		locations.push(values[0]);
	}
	const location = locations[0];
	if (
		typeof location !== "string" ||
		!location ||
		location.length > 4096 ||
		/[\p{Cc}\s]/u.test(location) ||
		/%(?![0-9a-f]{2})/i.test(location)
	)
		throw new AgentBrowserError(
			"network-error",
			"Invalid navigation redirect location",
		);
	return location;
}

function abortReason(signal: AbortSignal): AgentBrowserError {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Secure navigation aborted");
}

function waitForResponse(
	work: Promise<NetworkResponse>,
	signal: AbortSignal,
): Promise<NetworkResponse> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(abortReason(signal));
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
		work.then(
			(response) => {
				signal.removeEventListener("abort", abort);
				resolve(response);
			},
			(error: unknown) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

export async function fetchSecureNavigation(
	input: NetworkRequest,
	context: SecureNavigationContext,
): Promise<NetworkResponse> {
	if (input.redirect !== undefined && input.redirect !== "follow")
		throw new AgentBrowserError(
			"invalid-input",
			"Secure navigation requires follow redirect intent",
		);
	if (
		!Number.isSafeInteger(context.maxRedirects) ||
		context.maxRedirects < 0 ||
		context.maxRedirects > 20 ||
		!Number.isSafeInteger(context.timeoutMs) ||
		context.timeoutMs < 1 ||
		context.timeoutMs > 300000
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid secure navigation limits",
		);
	let target = secureUrl(input.url);
	let method = (input.method ?? "GET").toUpperCase();
	let body =
		input.body instanceof Uint8Array ? new Uint8Array(input.body) : input.body;
	const headers = { ...input.headers };
	const cookieContext = input.cookieContext && { ...input.cookieContext };
	let crossSiteRedirect = cookieContext?.crossSiteRedirect ?? false;
	const redirects: NetworkResponse["redirects"][number][] = [];
	const visited = new Set<string>();
	let encodedBytes = 0;
	const controller = new AbortController();
	const signal = controller.signal;
	const abort = () => controller.abort(input.signal?.reason);
	if (input.signal?.aborted) abort();
	else input.signal?.addEventListener("abort", abort, { once: true });
	const started = performance.now();
	const timer = setTimeout(
		() =>
			controller.abort(
				new AgentBrowserError("timeout", "Secure navigation deadline exceeded"),
			),
		context.timeoutMs,
	);
	const check = () => {
		if (signal.aborted) throw abortReason(signal);
		context.checkCurrent();
		if (performance.now() - started >= context.timeoutMs)
			throw new AgentBrowserError(
				"timeout",
				"Secure navigation deadline exceeded",
			);
	};
	try {
		while (true) {
			check();
			target = secureUrl(target.href);
			const key = `${method} ${resourceUrl(target)}`;
			if (visited.has(key))
				throw new AgentBrowserError(
					"policy-denied",
					"Navigation redirect loop",
				);
			visited.add(key);
			const response = await waitForResponse(
				context.request({
					...input,
					url: target.href,
					method,
					headers: { ...headers },
					body: body instanceof Uint8Array ? new Uint8Array(body) : body,
					redirect: "manual",
					signal,
					...(cookieContext
						? { cookieContext: { ...cookieContext, method, crossSiteRedirect } }
						: {}),
				}),
				signal,
			);
			check();
			if (
				response.redirects.length ||
				resourceUrl(secureUrl(response.url)) !== resourceUrl(target)
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Navigation adapter must not follow redirects",
				);
			if (
				!Number.isSafeInteger(response.encodedBytes) ||
				response.encodedBytes < 0 ||
				!Number.isSafeInteger(encodedBytes + response.encodedBytes)
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Invalid navigation response byte accounting",
				);
			encodedBytes += response.encodedBytes;
			if (![301, 302, 303, 307, 308].includes(response.status))
				return {
					...response,
					url: target.href,
					redirects: Object.freeze(redirects),
					encodedBytes,
					elapsedMs: performance.now() - started,
				};
			const location = redirectLocation(response.headers);
			if (redirects.length >= context.maxRedirects)
				throw new AgentBrowserError(
					"resource-limit",
					"Navigation redirect limit exceeded",
				);
			let next: URL;
			try {
				next = new URL(location, target);
			} catch {
				throw new AgentBrowserError(
					"network-error",
					"Invalid navigation redirect URL",
				);
			}
			if (!location.includes("#")) next.hash = target.hash;
			next = secureUrl(next.href);
			if (
				([301, 302].includes(response.status) && method === "POST") ||
				(response.status === 303 && !["GET", "HEAD"].includes(method))
			) {
				method = "GET";
				body = undefined;
				for (const name of Object.keys(headers))
					if (
						[
							"content-encoding",
							"content-language",
							"content-location",
							"content-type",
							"content-length",
						].includes(name.toLowerCase())
					)
						delete headers[name];
			}
			if (target.origin !== next.origin)
				for (const name of Object.keys(headers))
					if (
						[
							"authorization",
							"proxy-authorization",
							"cookie",
							"cookie2",
							"referer",
						].includes(name.toLowerCase())
					)
						delete headers[name];
			if (cookieContext)
				crossSiteRedirect ||=
					!context.sameSite(target.href, cookieContext.siteUrl) ||
					!context.sameSite(next.href, cookieContext.siteUrl);
			redirects.push(
				Object.freeze({
					url: target.href,
					status: response.status,
					location: next.href,
				}),
			);
			target = next;
		}
	} finally {
		clearTimeout(timer);
		input.signal?.removeEventListener("abort", abort);
	}
}
