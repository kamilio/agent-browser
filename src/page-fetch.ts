import { cookieSameSite } from "./cookies.js";
import { CorsPreflightCache } from "./cors-preflight-cache.js";
import {
	type FetchCredentials,
	checkCors,
	checkPreflight,
	corsResponseHeaders,
	needsPreflight,
	unsafeCorsHeaders,
} from "./cors.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	NetworkCorsResult,
	ObserveCorsResult,
} from "./network-journal.js";
import {
	type NetworkRequest,
	type NetworkResponse,
	parseNetworkUrl,
} from "./network.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

export interface PageFetchRequestContext {
	cors?: boolean;
	preflight?: boolean;
	observeCorsResult?: ObserveCorsResult;
}
export type PageFetchTransport = (
	input: NetworkRequest,
	context?: PageFetchRequestContext,
) => Promise<NetworkResponse>;

export interface PageFetchLimits {
	maxRequests: number;
	maxPending: number;
	maxRequestBytes: number;
	maxResponseBytes: number;
	maxRetainedBytes: number;
	maxTotalBytes: number;
	maxResponses: number;
	maxRedirects: number;
	timeoutMs: number;
}

const defaults: Readonly<PageFetchLimits> = {
	maxRequests: 64,
	maxPending: 8,
	maxRequestBytes: 65_536,
	maxResponseBytes: 262_144,
	maxRetainedBytes: 1_048_576,
	maxTotalBytes: 4_194_304,
	maxResponses: 64,
	maxRedirects: 20,
	timeoutMs: 5000,
};
const encoder = new TextEncoder();
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const forbiddenHeaders = new Set([
	"accept-charset",
	"accept-encoding",
	"access-control-request-headers",
	"access-control-request-method",
	"connection",
	"content-length",
	"cookie",
	"cookie2",
	"date",
	"dnt",
	"expect",
	"host",
	"keep-alive",
	"origin",
	"referer",
	"set-cookie",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"via",
]);
const bodyHeaders = [
	"content-encoding",
	"content-language",
	"content-location",
	"content-type",
];

function headerName(value: unknown): string {
	if (typeof value !== "string" || value.length > 256 || !token.test(value))
		throw new TypeError("Invalid fetch header name");
	return value.toLowerCase();
}

function headersFrom(input: unknown): Record<string, string> {
	const result: Record<string, string> = Object.create(null);
	if (input === undefined) return result;
	if (!input || typeof input !== "object")
		throw new TypeError("Invalid fetch headers");
	const entries = Array.isArray(input) ? input : Object.entries(input);
	if (entries.length > 128)
		throw new AgentBrowserError(
			"resource-limit",
			"Fetch header limit exceeded",
		);
	let bytes = 0;
	for (const pair of entries) {
		if (!Array.isArray(pair) || pair.length !== 2)
			throw new TypeError("Invalid fetch header pair");
		const name = headerName(pair[0]);
		if (typeof pair[1] !== "string" || /[^\t\x20-\x7e\x80-\xff]/.test(pair[1]))
			throw new TypeError("Invalid fetch header value");
		const value = pair[1].replace(/^[\t ]+|[\t ]+$/g, "");
		bytes += name.length + value.length;
		if (bytes > 16_384)
			throw new AgentBrowserError(
				"resource-limit",
				"Fetch header limit exceeded",
			);
		if (
			forbiddenHeaders.has(name) ||
			name.startsWith("proxy-") ||
			name.startsWith("sec-") ||
			([
				"x-http-method",
				"x-http-method-override",
				"x-method-override",
			].includes(name) &&
				value
					.split(",")
					.some((method) =>
						["CONNECT", "TRACE", "TRACK"].includes(method.trim().toUpperCase()),
					))
		)
			continue;
		result[name] = Object.hasOwn(result, name)
			? `${result[name]}, ${value}`
			: value;
	}
	return result;
}

interface ResponseMetadata {
	url: string;
	status: number;
	type: "basic" | "cors" | "opaqueredirect";
	redirected: boolean;
	headers: Readonly<Record<string, string>>;
}
interface BodyRecord {
	bytes: Uint8Array | null;
	used: boolean;
	ready: boolean;
	revoked: boolean;
}

export class PageFetch {
	readonly limits: Readonly<PageFetchLimits>;
	readonly fetch = async (input: unknown, init?: unknown): Promise<object> =>
		this.perform(input, init);
	private readonly active = new Set<AbortController>();
	private readonly bodies = new Set<BodyRecord>();
	private capabilities = new WeakSet<object>();
	private readonly origin: string;
	private requests = 0;
	private responses = 0;
	private redirects = 0;
	private preflights = 0;
	private readonly preflightCache: CorsPreflightCache;
	private retainedBytes = 0;
	private totalBytes = 0;
	private closed = false;
	private unregisterClose: () => unknown = () => {};

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly request: PageFetchTransport,
		private readonly options: {
			limits?: Partial<PageFetchLimits>;
			csp?: boolean;
			preflightClock?: () => number;
		} = {},
	) {
		if (
			typeof factory?.createHostObject !== "function" ||
			typeof request !== "function"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid page fetch provider",
			);
		const limits = { ...defaults, ...options.limits };
		for (const [name, maximum] of Object.entries(defaults)) {
			const value = limits[name as keyof PageFetchLimits];
			if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid page fetch limits",
				);
		}
		this.limits = Object.freeze(limits);
		this.origin = new URL(tree.url).origin;
		this.preflightCache = new CorsPreflightCache(options.preflightClock);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	metrics() {
		return {
			requests: this.requests,
			responses: this.responses,
			redirects: this.redirects,
			preflights: this.preflights,
			preflightCache: this.preflightCache.metrics(),
			active: this.active.size,
			retainedBytes: this.retainedBytes,
			totalBytes: this.totalBytes,
			closed: this.closed,
			partial: true as const,
		};
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.preflightCache.close();
		for (const controller of this.active)
			controller.abort(new AgentBrowserError("closed", "Page fetch is closed"));
		this.active.clear();
		for (const body of this.bodies) this.revokeResponse(body);
		this.capabilities = new WeakSet();
		this.unregisterClose();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Page fetch is closed");
	}

	private target(input: string, base: string) {
		if (input.length > 16_384 || /\p{Cc}/u.test(input))
			throw new TypeError("Invalid fetch URL");
		const url = parseNetworkUrl(new URL(input, base).href);
		if (new URL(this.origin).protocol === "https:" && url.protocol !== "https:")
			throw new AgentBrowserError(
				"policy-denied",
				"Mixed-content fetch is not allowed",
			);
		url.hash = "";
		return url;
	}

	private checkPolicy() {
		this.ensureOpen();
		let blocked = this.options.csp === true;
		for (const { node } of this.tree.walk()) {
			if (
				node.tagName === "meta" &&
				node.attributes["http-equiv"]?.toLowerCase() ===
					"content-security-policy"
			) {
				blocked = true;
				break;
			}
		}
		if (blocked)
			throw new AgentBrowserError(
				"policy-denied",
				"Fetch is blocked because CSP enforcement is not implemented",
			);
	}

	private async perform(input: unknown, init?: unknown): Promise<object> {
		this.checkPolicy();
		if (typeof input !== "string")
			throw new TypeError("Fetch currently requires a URL string");
		if (init !== undefined && (typeof init !== "object" || Array.isArray(init)))
			throw new TypeError("Invalid fetch options");
		const values = (init ?? {}) as Record<string, unknown>;
		const allowed = new Set([
			"method",
			"headers",
			"body",
			"credentials",
			"mode",
			"redirect",
			"cache",
			"keepalive",
			"signal",
		]);
		for (const name of Object.keys(values))
			if (values[name] !== undefined && !allowed.has(name))
				throw new AgentBrowserError(
					"unsupported",
					`Fetch option ${name.slice(0, 64)} is not implemented`,
				);
		if (values.signal != null)
			throw new AgentBrowserError(
				"unsupported",
				"Guest fetch AbortSignal is not implemented",
			);
		if (
			(values.mode !== undefined &&
				!["same-origin", "cors"].includes(values.mode as string)) ||
			(values.cache !== undefined &&
				!["default", "no-store"].includes(values.cache as string)) ||
			(values.keepalive !== undefined && values.keepalive !== false)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Fetch mode, cache or keepalive is not implemented",
			);
		const credentials =
			values.credentials === undefined ? "same-origin" : values.credentials;
		const redirect = values.redirect === undefined ? "follow" : values.redirect;
		if (
			!["omit", "same-origin", "include"].includes(credentials as string) ||
			!["follow", "manual", "error"].includes(redirect as string)
		)
			throw new TypeError("Invalid fetch credentials or redirect mode");
		if (values.method !== undefined && typeof values.method !== "string")
			throw new TypeError("Invalid fetch method");
		let method = (values.method as string | undefined) ?? "GET";
		if (
			method.length > 32 ||
			!token.test(method) ||
			["CONNECT", "TRACE", "TRACK"].includes(method.toUpperCase())
		)
			throw new TypeError("Invalid fetch method");
		if (
			["DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT"].includes(
				method.toUpperCase(),
			)
		)
			method = method.toUpperCase();
		let body = values.body === null ? undefined : values.body;
		if (body !== undefined && typeof body !== "string")
			throw new AgentBrowserError(
				"unsupported",
				"Fetch currently supports string request bodies only",
			);
		if (body !== undefined && ["GET", "HEAD"].includes(method))
			throw new TypeError("GET and HEAD cannot have fetch bodies");
		if (
			typeof body === "string" &&
			(body.length > this.limits.maxRequestBytes ||
				encoder.encode(body).byteLength > this.limits.maxRequestBytes)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Fetch request body limit exceeded",
			);
		const headers = headersFrom(values.headers);
		if (typeof body === "string" && !Object.hasOwn(headers, "content-type"))
			headers["content-type"] = "text/plain;charset=UTF-8";
		let url = this.target(input, documentBaseUrl(this.tree));
		const credentialMode = credentials as FetchCredentials;
		const mode = values.mode ?? "cors";
		let corsTainted = false;
		let originTainted = false;
		let crossSiteRedirect = false;
		if (
			this.requests >= this.limits.maxRequests ||
			this.active.size >= this.limits.maxPending
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Page fetch request limit exceeded",
			);
		this.requests++;
		const controller = new AbortController();
		this.active.add(controller);
		const timeout = setTimeout(
			() =>
				controller.abort(
					new AgentBrowserError("timeout", "Page fetch deadline exceeded"),
				),
			this.limits.timeoutMs,
		);
		try {
			for (let hops = 0; ; hops++) {
				this.checkPolicy();
				if (mode === "same-origin" && url.origin !== this.origin)
					throw new AgentBrowserError(
						"policy-denied",
						"Fetch same-origin mode forbids this URL",
					);
				corsTainted ||= url.origin !== this.origin;
				const requestOrigin = originTainted ? "null" : this.origin;
				const unsafeNames = unsafeCorsHeaders(headers);
				if (
					corsTainted &&
					needsPreflight(method, unsafeNames) &&
					!this.preflightCache.matches(
						requestOrigin,
						url.href,
						credentialMode,
						method,
						unsafeNames,
					)
				) {
					this.preflights++;
					let grants: ReturnType<typeof checkPreflight> | undefined;
					const preflight = await this.send(
						{
							url: url.href,
							method: "OPTIONS",
							redirect: "manual",
							signal: controller.signal,
							headers: {
								origin: requestOrigin,
								"access-control-request-method": method,
								...(unsafeNames.length
									? { "access-control-request-headers": unsafeNames.join(",") }
									: {}),
							},
							cookieContext: {
								siteUrl: this.tree.url,
								topLevelNavigation: false,
								credentials: "omit",
								crossSiteRedirect,
							},
						},
						controller.signal,
						{ cors: true, preflight: true },
						(response, headers) => {
							grants = checkPreflight(
								response.status,
								headers,
								requestOrigin,
								credentialMode,
								method,
								unsafeNames,
							);
						},
					);
					this.checkPolicy();
					if (grants)
						this.preflightCache.store(
							requestOrigin,
							url.href,
							credentialMode,
							grants,
							preflight.headers["access-control-max-age"],
						);
				}
				const wireHeaders = { ...headers };
				if (corsTainted || !["GET", "HEAD"].includes(method))
					wireHeaders.origin = requestOrigin;
				const { response, headers: responseHeaders } = await this.send(
					{
						url: url.href,
						method,
						headers: wireHeaders,
						...(typeof body === "string" ? { body } : {}),
						redirect: "manual",
						signal: controller.signal,
						cookieContext: {
							siteUrl: this.tree.url,
							topLevelNavigation: false,
							credentials:
								corsTainted && credentialMode === "same-origin"
									? "omit"
									: credentialMode,
							crossSiteRedirect,
						},
					},
					controller.signal,
					{ cors: corsTainted },
					corsTainted
						? (_response, headers) =>
								checkCors(headers, requestOrigin, credentialMode)
						: undefined,
				);
				if ([301, 302, 303, 307, 308].includes(response.status)) {
					if (redirect === "error")
						throw new TypeError("Fetch redirect is not allowed");
					if (redirect === "manual")
						return this.response(
							{
								url: "",
								status: 0,
								type: "opaqueredirect",
								redirected: false,
								headers: {},
							},
							null,
						);
					const location = responseHeaders.location;
					if (location !== undefined) {
						if (hops >= this.limits.maxRedirects)
							throw new AgentBrowserError(
								"resource-limit",
								"Fetch redirect limit exceeded",
							);
						const next = this.target(location, url.href);
						if (url.origin !== next.origin) {
							Reflect.deleteProperty(headers, "authorization");
							originTainted ||= url.origin !== this.origin;
						}
						crossSiteRedirect ||= !cookieSameSite(next.href, url.href);
						url = next;
						this.redirects++;
						if (
							([301, 302].includes(response.status) && method === "POST") ||
							(response.status === 303 && !["GET", "HEAD"].includes(method))
						) {
							method = "GET";
							body = undefined;
							for (const name of bodyHeaders) delete headers[name];
						}
						continue;
					}
				}
				return this.response(
					{
						url: url.href,
						status: response.status,
						type: corsTainted ? "cors" : "basic",
						redirected: hops > 0,
						headers: corsTainted
							? corsResponseHeaders(responseHeaders, credentialMode)
							: responseHeaders,
					},
					method === "HEAD" || [204, 205, 304].includes(response.status)
						? null
						: response.body,
				);
			}
		} catch (error) {
			this.preflightCache.clear(originTainted ? "null" : this.origin, url.href);
			throw error;
		} finally {
			clearTimeout(timeout);
			this.active.delete(controller);
		}
	}

	private inspectResponse(response: NetworkResponse, url: string) {
		this.ensureOpen();
		if (
			response.redirects.length ||
			this.target(response.url, url).href !== url
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Fetch adapter must not follow redirects",
			);
		this.totalBytes += response.body.byteLength;
		if (
			response.body.byteLength > this.limits.maxResponseBytes ||
			this.totalBytes > this.limits.maxTotalBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Fetch response body limit exceeded",
			);
		return this.responseHeaders(response.headers);
	}

	private async send(
		input: NetworkRequest,
		signal: AbortSignal,
		context?: PageFetchRequestContext,
		validateCors?: (
			response: NetworkResponse,
			headers: Readonly<Record<string, string>>,
		) => void,
	) {
		let report: ((result: NetworkCorsResult) => void) | undefined;
		let outcome: NetworkCorsResult = "not-checked";
		let observing = true;
		const observeCorsResult: ObserveCorsResult = (callback) => {
			if (observing && typeof callback === "function") report ??= callback;
		};
		let abort = () => {};
		const stopped = new Promise<never>((_resolve, reject) => {
			abort = () => reject(signal.reason);
			if (signal.aborted) abort();
			else signal.addEventListener("abort", abort, { once: true });
		});
		const work = Promise.resolve().then(() => {
			if (signal.aborted) throw signal.reason;
			return this.request(input, {
				...context,
				...(context?.cors ? { observeCorsResult } : {}),
			});
		});
		try {
			const response = await Promise.race([work, stopped]);
			const headers = this.inspectResponse(response, input.url);
			if (validateCors) {
				try {
					validateCors(response, headers);
					outcome = "allowed";
				} catch (error) {
					outcome = "blocked";
					throw error;
				}
			}
			return { response, headers };
		} finally {
			signal.removeEventListener("abort", abort);
			observing = false;
			try {
				report?.(outcome);
			} catch {}
			report = undefined;
		}
	}

	private responseHeaders(
		input: NetworkResponse["headers"],
	): Readonly<Record<string, string>> {
		const result: Record<string, string> = Object.create(null);
		let bytes = 0;
		for (const [key, values] of Object.entries(input)) {
			const name = headerName(key);
			if (["set-cookie", "set-cookie2"].includes(name)) continue;
			for (const value of values) {
				if (typeof value !== "string" || /[^\t\x20-\x7e\x80-\xff]/.test(value))
					throw new TypeError("Invalid fetch response header");
				bytes += name.length + value.length;
				if (bytes > 16_384)
					throw new AgentBrowserError(
						"resource-limit",
						"Fetch response header limit exceeded",
					);
				result[name] = Object.hasOwn(result, name)
					? `${result[name]}, ${value}`
					: value;
			}
		}
		return Object.freeze(result);
	}

	private response(
		metadata: ResponseMetadata,
		input: Uint8Array | null,
	): object {
		this.ensureOpen();
		if (
			this.responses >= this.limits.maxResponses ||
			this.retainedBytes + (input?.byteLength ?? 0) >
				this.limits.maxRetainedBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Fetch response retention limit exceeded",
			);
		const body: BodyRecord = {
			bytes: input === null ? null : new Uint8Array(input),
			used: false,
			ready: false,
			revoked: false,
		};
		this.responses++;
		this.bodies.add(body);
		this.retainedBytes += body.bytes?.byteLength ?? 0;
		const read = () => {
			this.ensureOpen();
			if (body.revoked)
				throw new AgentBrowserError("closed", "Fetch response is revoked");
			if (!body.ready)
				throw new AgentBrowserError(
					"invalid-input",
					"Fetch response is not yet published",
				);
		};
		const consume = () => {
			read();
			if (body.used) throw new TypeError("Fetch body is already consumed");
			if (body.bytes === null) return "";
			const bytes = body.bytes;
			body.used = true;
			body.bytes = null;
			this.retainedBytes -= bytes.byteLength;
			return new TextDecoder().decode(bytes);
		};
		try {
			const headers = this.capability({
				methods: {
					get: (name) => {
						read();
						const key = headerName(name);
						return Object.hasOwn(metadata.headers, key)
							? metadata.headers[key]
							: null;
					},
					has: (name) => {
						read();
						return Object.hasOwn(metadata.headers, headerName(name));
					},
				},
			});
			const property = (get: () => unknown) => ({
				get: () => {
					read();
					return get();
				},
			});
			const response = this.capability({
				properties: {
					url: property(() => metadata.url),
					status: property(() => metadata.status),
					statusText: property(() => ""),
					ok: property(() => metadata.status >= 200 && metadata.status < 300),
					type: property(() => metadata.type),
					redirected: property(() => metadata.redirected),
					headers: property(() => headers),
					bodyUsed: property(() => body.used),
				},
				methods: {
					text: async () => consume(),
					json: async () => JSON.parse(consume()),
					clone: () => {
						read();
						if (body.used)
							throw new TypeError("Fetch body is already consumed");
						return this.response(metadata, body.bytes);
					},
				},
			});
			body.ready = true;
			return response;
		} catch (error) {
			this.revokeResponse(body);
			throw error;
		}
	}

	private capability(definition: ScriptHostObjectDefinition) {
		this.ensureOpen();
		const capability = this.factory.createHostObject(definition);
		this.ensureOpen();
		if (
			!capability ||
			typeof capability !== "object" ||
			this.capabilities.has(capability)
		)
			throw new AgentBrowserError(
				"unsupported",
				"Invalid fetch response capability",
			);
		this.capabilities.add(capability);
		return capability;
	}

	private revokeResponse(body: BodyRecord) {
		if (body.revoked) return;
		body.revoked = true;
		body.ready = false;
		this.retainedBytes -= body.bytes?.byteLength ?? 0;
		body.bytes = null;
		this.bodies.delete(body);
	}
}
