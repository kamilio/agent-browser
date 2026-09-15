import { X509Certificate } from "node:crypto";
import { Resolver } from "node:dns/promises";
import {
	type IncomingMessage,
	request as httpRequest,
	validateHeaderName,
	validateHeaderValue,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { type Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { checkServerIdentity } from "node:tls";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import {
	CookieJar,
	type CookieRequestContext,
	cookieSameSite,
	normalizeCookieContext,
} from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import { networkPolicyError } from "./network-policy-diagnostic.js";
import {
	type NetworkLimits,
	type NetworkMetrics,
	NetworkPolicy,
	type NetworkPolicyOptions,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRouteResolver,
	type NetworkTransport,
	addressFamily,
	networkHostname,
} from "./network.js";
import { OriginRequestPacer } from "./origin-request-pacer.js";
import { resourceLimitError } from "./resource-limit.js";
import { parseRetryAfter } from "./retry-after.js";
import {
	ResourceReuseCache,
	type ResourceReuseCacheOptions,
	type ResourceReuseRequest,
} from "./resource-reuse-cache.js";
import {
	type ResponseAccountingWriter,
	claimResponseAccounting,
	validateResponseAccountingLease,
} from "./response-byte-accounting.js";

export type AddressResolver = (
	hostname: string,
	signal: AbortSignal,
) => Promise<readonly string[]>;

export interface NodeTransportOptions extends NetworkPolicyOptions {
	captureDecodedPrefixBytes?: number;
	resourceCache?: Partial<ResourceReuseCacheOptions>;
	limits?: Partial<NetworkLimits>;
	minRequestIntervalMs?: number;
	resolver?: AddressResolver;
	certificateAuthorities?: readonly string[];
	cookieJar?: CookieJar;
}

export interface DecodedResponsePrefix {
	readonly kind: "decoded-response-prefix-v1";
	readonly complete: false;
	readonly url: string;
	readonly status: number;
	readonly headers: NetworkResponse["headers"];
	readonly body: Uint8Array;
	readonly encodedBytes: number;
	readonly decodedBytes: number;
	readonly limit: number;
}

type ResponsePrefixBody = Pick<
	DecodedResponsePrefix,
	"body" | "encodedBytes" | "decodedBytes" | "limit"
>;

interface ResponseAccountingOperation {
	readonly writer: ResponseAccountingWriter;
	track(task: Promise<unknown>): void;
	finish(): void;
}

function responseAccountingOperation(
	writer: ResponseAccountingWriter,
): ResponseAccountingOperation {
	let pending = 0;
	let finished = false;
	const release = () => {
		if (finished && pending === 0) writer.finish();
	};
	return {
		writer,
		track(task) {
			if (finished)
				throw new AgentBrowserError(
					"closed",
					"Response accounting is finished",
				);
			pending++;
			const drained = () => {
				pending--;
				release();
			};
			void task.then(drained, drained);
		},
		finish() {
			finished = true;
			release();
		},
	};
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const forbiddenHeaders = new Set([
	"host",
	"connection",
	"proxy-authorization",
	"proxy-connection",
	"transfer-encoding",
	"content-length",
	"upgrade",
	"te",
	"trailer",
	"expect",
]);
const bodyHeaders = [
	"content-encoding",
	"content-language",
	"content-location",
	"content-type",
];

function abortReason(signal: AbortSignal): AgentBrowserError {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Request aborted");
}

async function resolveAddresses(
	hostname: string,
	signal: AbortSignal,
): Promise<readonly string[]> {
	if (signal.aborted) throw abortReason(signal);
	const resolver = new Resolver({ timeout: 2000, tries: 2 });
	const cancel = () => resolver.cancel();
	signal.addEventListener("abort", cancel, { once: true });
	try {
		const results = await Promise.allSettled([
			resolver.resolve4(hostname),
			resolver.resolve6(hostname),
		]);
		if (signal.aborted) throw abortReason(signal);
		const addresses: string[] = [];
		for (const result of results) {
			if (result.status === "fulfilled") addresses.push(...result.value);
			else if (!["ENODATA", "ENOTFOUND"].includes(result.reason?.code))
				throw new AgentBrowserError("network-error", "DNS resolution failed");
		}
		if (!addresses.length)
			throw new AgentBrowserError("network-error", "DNS returned no addresses");
		return addresses;
	} finally {
		signal.removeEventListener("abort", cancel);
	}
}

function awaitWithSignal<T>(
	promise: Promise<T>,
	signal: AbortSignal,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(abortReason(signal));
		if (signal.aborted) {
			void promise.catch(() => {});
			abort();
			return;
		}
		signal.addEventListener("abort", abort, { once: true });
		promise
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}

function normalizeHeaders(input: NetworkRequest["headers"], maxBytes: number) {
	const headers: Record<string, string> = Object.create(null);
	if (
		input !== undefined &&
		(!input || typeof input !== "object" || Array.isArray(input))
	)
		throw new AgentBrowserError("invalid-input", "Invalid request headers");
	let bytes = 0;
	for (const [name, value] of Object.entries(input ?? {})) {
		const key = name.toLowerCase();
		if (typeof value !== "string" || Object.hasOwn(headers, key))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid or duplicate request header",
			);
		try {
			validateHeaderName(name);
			validateHeaderValue(name, value);
		} catch {
			throw new AgentBrowserError("invalid-input", "Invalid request header");
		}
		if (forbiddenHeaders.has(key) || key.startsWith("proxy-"))
			throw networkPolicyError("transport-controlled-header");
		bytes += Buffer.byteLength(key) + Buffer.byteLength(value) + 4;
		if (bytes > maxBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Request header limit exceeded",
			);
		headers[key] = value;
	}
	headers.accept ??= "*/*";
	headers["accept-encoding"] ??= "gzip, deflate, br";
	headers["user-agent"] ??= "AgentBrowser/0.1";
	return headers;
}

function responseHeaders(
	response: IncomingMessage,
): Readonly<Record<string, readonly string[]>> {
	const headers: Record<string, string[]> = Object.create(null);
	for (let index = 0; index < response.rawHeaders.length; index += 2) {
		const key = response.rawHeaders[index].toLowerCase();
		headers[key] ??= [];
		headers[key].push(response.rawHeaders[index + 1]);
	}
	for (const values of Object.values(headers)) Object.freeze(values);
	return Object.freeze(headers);
}

function routedResponse(
	input: NetworkResponse,
	url: URL,
	method: string,
	maxHeaderBytes: number,
): Omit<NetworkResponse, "url" | "redirects" | "elapsedMs"> {
	const invalid = () =>
		new AgentBrowserError("invalid-input", "Invalid routed response");
	if (
		!input ||
		typeof input !== "object" ||
		!Number.isInteger(input.status) ||
		input.status < 200 ||
		input.status > 599 ||
		!(input.body instanceof Uint8Array) ||
		input.encodedBytes !== 0 ||
		!Array.isArray(input.redirects) ||
		input.redirects.length ||
		!input.headers ||
		typeof input.headers !== "object" ||
		Array.isArray(input.headers)
	)
		throw invalid();
	if (
		(method === "HEAD" || [204, 205, 304].includes(input.status)) &&
		input.body.length
	)
		throw invalid();
	let responseUrl: URL;
	try {
		responseUrl = new URL(input.url);
	} catch {
		throw invalid();
	}
	responseUrl.hash = "";
	const expectedUrl = new URL(url);
	expectedUrl.hash = "";
	if (responseUrl.href !== expectedUrl.href) throw invalid();
	if (
		input.routeId !== undefined &&
		(!Number.isSafeInteger(input.routeId) || input.routeId < 1)
	)
		throw invalid();
	const headers: Record<string, readonly string[]> = Object.create(null);
	const entries = Object.entries(input.headers);
	if (entries.length > 128)
		throw new AgentBrowserError(
			"resource-limit",
			"Routed header limit exceeded",
		);
	let bytes = 0;
	for (const [name, values] of entries) {
		if (!Array.isArray(values) || values.length > 128) throw invalid();
		const key = name.toLowerCase();
		try {
			validateHeaderName(name);
		} catch {
			throw invalid();
		}
		for (const value of values) {
			if (typeof value !== "string") throw invalid();
			try {
				validateHeaderValue(name, value);
			} catch {
				throw invalid();
			}
			bytes += Buffer.byteLength(key) + Buffer.byteLength(value) + 4;
			if (bytes > maxHeaderBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Routed header limit exceeded",
				);
		}
		headers[key] = Object.freeze([...(headers[key] ?? []), ...values]);
	}
	return {
		status: input.status,
		headers: Object.freeze(headers),
		body: input.body,
		encodedBytes: 0,
		...(input.routeId === undefined ? {} : { routeId: input.routeId }),
	};
}

function wireHeaders(
	url: URL,
	headers: Record<string, string>,
	body: Buffer<ArrayBuffer> | undefined,
	maxBytes: number,
) {
	const result = {
		...headers,
		host: url.host,
		...(body ? { "content-length": String(body.byteLength) } : {}),
	};
	const bytes = Object.entries(result).reduce(
		(size, [name, value]) =>
			size + Buffer.byteLength(name) + Buffer.byteLength(value) + 4,
		2,
	);
	if (bytes > maxBytes)
		throw new AgentBrowserError(
			"resource-limit",
			"Request header limit exceeded",
		);
	return result;
}

export class NodeNetworkTransport implements NetworkTransport {
	readonly limits: Readonly<NetworkLimits>;
	readonly resourceReuse: boolean;
	private readonly resourceCache?: ResourceReuseCache;
	private readonly policy: NetworkPolicy;
	private readonly resolver: AddressResolver;
	private readonly certificateAuthorities?: string[];
	private readonly cookieJar?: CookieJar;
	private readonly requestPacer?: OriginRequestPacer;
	private readonly captureDecodedPrefixBytes?: number;
	private pendingResponsePrefixes = new WeakMap<
		object,
		DecodedResponsePrefix
	>();
	private responsePrefixes = new WeakMap<object, DecodedResponsePrefix>();
	private readonly active = new Set<AbortController>();
	private closed = false;
	private counts = {
		mockedRequests: 0,
		mockedDecodedBytes: 0,
		requests: 0,
		redirects: 0,
		encodedBytes: 0,
		decodedBytes: 0,
	};

	constructor(options: NodeTransportOptions = {}) {
		if (options.captureDecodedPrefixBytes !== undefined) {
			if (
				!Number.isSafeInteger(options.captureDecodedPrefixBytes) ||
				options.captureDecodedPrefixBytes < 1 ||
				options.captureDecodedPrefixBytes > 65_536
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid decoded response prefix byte limit",
				);
			this.captureDecodedPrefixBytes = options.captureDecodedPrefixBytes;
		}
		if (typeof Bun !== "undefined")
			throw new AgentBrowserError(
				"unsupported",
				"Networking requires Node.js; Bun's TLS verification ordering is not supported",
			);
		if (options.certificateAuthorities !== undefined) {
			const certificates = options.certificateAuthorities;
			if (
				!Array.isArray(certificates) ||
				!certificates.length ||
				certificates.length > 32
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid certificate authorities",
				);
			for (const certificate of certificates) {
				if (typeof certificate !== "string" || certificate.length > 65_536)
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid certificate authority",
					);
				try {
					new X509Certificate(certificate);
				} catch {
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid certificate authority",
					);
				}
			}
			this.certificateAuthorities = [...certificates];
		}
		this.limits = Object.freeze({
			timeoutMs: 15_000,
			maxResponseBytes: 2_097_152,
			maxRequestBytes: 1_048_576,
			maxHeaderBytes: 32_768,
			maxRedirects: 10,
			maxConcurrent: 8,
			maxRequests: 500,
			maxTotalBytes: 67_108_864,
			...options.limits,
		});
		for (const [name, value] of Object.entries(this.limits)) {
			const maximum =
				name === "timeoutMs"
					? 300_000
					: name === "maxRedirects"
						? 20
						: name === "maxConcurrent"
							? 128
							: 1_073_741_824;
			if (
				!Number.isSafeInteger(value) ||
				value < (name === "maxRedirects" ? 0 : 1) ||
				value > maximum
			)
				throw new AgentBrowserError(
					"invalid-input",
					`Invalid network limit: ${name}`,
				);
		}
		const interval =
			options.minRequestIntervalMs === undefined
				? 0
				: options.minRequestIntervalMs;
		if (!Number.isSafeInteger(interval) || interval < 0 || interval > 60_000)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid request pacing interval",
			);
		if (interval > 0) this.requestPacer = new OriginRequestPacer(interval);
		this.policy = new NetworkPolicy(options);
		this.resolver = options.resolver ?? resolveAddresses;
		if (
			options.cookieJar !== undefined &&
			!(options.cookieJar instanceof CookieJar)
		)
			throw new AgentBrowserError("invalid-input", "Invalid cookie jar");
		this.cookieJar = options.cookieJar;
		this.resourceReuse = options.resourceCache !== undefined;
		if (this.resourceReuse)
			this.resourceCache = new ResourceReuseCache(options.resourceCache);
	}

	metrics(): Readonly<NetworkMetrics> {
		return Object.freeze({
			...this.counts,
			...this.resourceCache?.metrics(),
			active: this.active.size,
			closed: this.closed,
		});
	}

	close() {
		this.closed = true;
		this.pendingResponsePrefixes = new WeakMap();
		this.responsePrefixes = new WeakMap();
		for (const controller of this.active)
			controller.abort(new AgentBrowserError("closed", "Transport is closed"));
		this.requestPacer?.close();
		this.resourceCache?.close();
	}

	responsePrefix(error: unknown): DecodedResponsePrefix | undefined {
		if (!error || typeof error !== "object") return undefined;
		const captured = this.responsePrefixes.get(error);
		return captured
			? Object.freeze({ ...captured, body: new Uint8Array(captured.body) })
			: undefined;
	}

	request(input: NetworkRequest): Promise<NetworkResponse> {
		return this.perform(input);
	}

	async requestWithRoutes(
		input: NetworkRequest,
		resolveRoute: NetworkRouteResolver,
	): Promise<NetworkResponse> {
		if (typeof resolveRoute !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"A route resolver is required",
			);
		return this.perform(input, resolveRoute);
	}

	private async perform(
		input: NetworkRequest,
		resolveRoute?: NetworkRouteResolver,
	): Promise<NetworkResponse> {
		if (this.closed)
			throw new AgentBrowserError("closed", "Transport is closed");
		if (!input || typeof input !== "object")
			throw new AgentBrowserError("invalid-input", "Invalid network request");
		const inputSignal = input.signal;
		const resourceReuse = input.resourceReuse;
		if (
			resourceReuse !== undefined &&
			resourceReuse !== "stylesheet" &&
			resourceReuse !== "image"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid resource reuse kind",
			);
		if (inputSignal !== undefined && !(inputSignal instanceof AbortSignal))
			throw new AgentBrowserError("invalid-input", "Invalid network request");
		const requestedAccounting = input.responseAccounting;
		if (requestedAccounting !== undefined)
			validateResponseAccountingLease(requestedAccounting);
		const requestedMaxResponseBytes = input.maxResponseBytes;
		if (
			requestedMaxResponseBytes !== undefined &&
			(!Number.isSafeInteger(requestedMaxResponseBytes) ||
				requestedMaxResponseBytes < 0)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid request response byte limit",
			);
		const maxResponseBytes = Math.min(
			requestedMaxResponseBytes ?? this.limits.maxResponseBytes,
			this.limits.maxResponseBytes,
		);
		let url = this.policy.checkUrl(input.url);
		let method = input.method ?? "GET";
		if (typeof method !== "string" || !/^[A-Z]+$/i.test(method))
			throw new AgentBrowserError("invalid-input", "Invalid HTTP method");
		method = method.toUpperCase();
		if (
			!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(
				method,
			)
		)
			throw networkPolicyError("method-not-allowed");
		const redirect = input.redirect ?? "follow";
		if (!["follow", "manual", "error"].includes(redirect))
			throw new AgentBrowserError("invalid-input", "Invalid redirect mode");
		const requestedBody = input.body;
		if (
			requestedBody !== undefined &&
			typeof requestedBody !== "string" &&
			!(requestedBody instanceof Uint8Array)
		)
			throw new AgentBrowserError("invalid-input", "Invalid request body");
		const bodyLength =
			typeof requestedBody === "string"
				? Buffer.byteLength(requestedBody)
				: (requestedBody?.byteLength ?? 0);
		if (bodyLength > this.limits.maxRequestBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Request body limit exceeded",
			);
		let body =
			requestedBody === undefined ? undefined : Buffer.from(requestedBody);
		if (body && ["GET", "HEAD"].includes(method))
			throw new AgentBrowserError(
				"invalid-input",
				"GET and HEAD cannot have a request body",
			);
		const headers = normalizeHeaders(input.headers, this.limits.maxHeaderBytes);
		let cookieContext: CookieRequestContext | undefined;
		if (this.cookieJar && Object.hasOwn(headers, "cookie"))
			throw networkPolicyError("cookie-header-controlled");
		if (input.cookieContext !== undefined) {
			const context = normalizeCookieContext(input.cookieContext);
			if (
				!this.cookieJar ||
				!["omit", "same-origin", "include"].includes(
					input.cookieContext.credentials,
				)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Cookie context requires a jar and valid credentials mode",
				);
			cookieContext = {
				...context,
				credentials: input.cookieContext.credentials,
			};
		}
		const cookieOrigin = cookieContext?.siteUrl
			? new URL(cookieContext.siteUrl).origin
			: null;
		let originTainted = cookieOrigin !== url.origin;
		let siteTainted = cookieContext?.crossSiteRedirect ?? false;
		const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(method);
		if (unsafeMethod) this.resourceCache?.clear();
		const cacheRequest: ResourceReuseRequest | undefined =
			this.resourceCache &&
			resourceReuse !== undefined &&
			method === "GET" &&
			requestedBody === undefined &&
			requestedAccounting === undefined &&
			redirect === "manual" &&
			cookieContext?.credentials === "omit" &&
			cookieContext.topLevelNavigation === false &&
			!siteTainted &&
			cookieOrigin === url.origin &&
			url.protocol === "https:"
				? {
						url: url.href,
						resource: resourceReuse,
						origin: url.origin,
						headers,
					}
				: undefined;
		const cacheStamp = cacheRequest ? this.resourceCache?.start() : undefined;
		if (typeof requestedBody === "string")
			headers["content-type"] ??= "text/plain;charset=UTF-8";
		if (this.closed)
			throw new AgentBrowserError("closed", "Transport is closed");
		if (this.active.size >= this.limits.maxConcurrent)
			throw new AgentBrowserError(
				"resource-limit",
				"Concurrent request limit exceeded",
			);
		const controller = new AbortController();
		const signal = controller.signal;
		const abort = () =>
			controller.abort(new AgentBrowserError("aborted", "Request aborted"));
		if (inputSignal?.aborted) abort();
		else inputSignal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(
			() =>
				controller.abort(
					new AgentBrowserError("timeout", "Network deadline exceeded"),
				),
			this.limits.timeoutMs,
		);
		const start = performance.now();
		const ensureActive = () => {
			if (signal.aborted) throw abortReason(signal);
			if (this.closed)
				throw new AgentBrowserError("closed", "Transport is closed");
			if (performance.now() - start >= this.limits.timeoutMs)
				throw new AgentBrowserError("timeout", "Network deadline exceeded");
		};
		const redirects: { url: string; status: number; location: string }[] = [];
		let encodedBytes = 0;
		let accounting: ResponseAccountingOperation | undefined;
		this.active.add(controller);
		try {
			if (requestedAccounting !== undefined) {
				ensureActive();
				accounting = responseAccountingOperation(
					claimResponseAccounting(requestedAccounting),
				);
			}
			while (true) {
				ensureActive();
				if (accounting && accounting.writer.remainingBytes() <= 0)
					throw new AgentBrowserError(
						"resource-limit",
						"Fetch response body limit exceeded",
					);
				const useCookies =
					this.cookieJar &&
					cookieContext &&
					cookieContext.credentials !== "omit" &&
					(cookieContext.credentials === "include" ||
						(!originTainted && cookieOrigin === url.origin));
				const hopContext = cookieContext && {
					...cookieContext,
					method,
					crossSiteRedirect: siteTainted,
				};
				if (this.cookieJar) Reflect.deleteProperty(headers, "cookie");
				if (useCookies && hopContext) {
					const value = this.cookieJar?.cookieHeader(url.href, hopContext);
					if (value) headers.cookie = value;
				}
				if (!cacheRequest && this.counts.requests >= this.limits.maxRequests)
					throw new AgentBrowserError(
						"resource-limit",
						"Session request limit exceeded",
					);
				if (!cacheRequest) this.counts.requests++;
				const storeCookies =
					useCookies && hopContext
						? (values: NetworkResponse["headers"]) => {
								for (const value of values["set-cookie"] ?? [])
									this.cookieJar?.setCookie(url.href, value, hopContext);
							}
						: undefined;
				const resolved = resolveRoute?.({ url: url.href, method, signal });
				ensureActive();
				if (resolved !== undefined) this.resourceCache?.clear();
				if (cacheRequest) {
					if (resolved === undefined) {
						const cached = this.resourceCache?.get(
							cacheRequest,
							maxResponseBytes,
						);
						if (cached) {
							ensureActive();
							return { ...cached, elapsedMs: performance.now() - start };
						}
					}
					if (this.counts.requests >= this.limits.maxRequests)
						throw new AgentBrowserError(
							"resource-limit",
							"Session request limit exceeded",
						);
					this.counts.requests++;
				}
				let response: Omit<NetworkResponse, "url" | "redirects" | "elapsedMs">;
				if (resolved !== undefined) {
					response = routedResponse(
						resolved,
						url,
						method,
						this.limits.maxHeaderBytes,
					);
					ensureActive();
					this.counts.mockedRequests++;
					this.counts.mockedDecodedBytes += response.body.length;
					this.counts.decodedBytes += response.body.length;
					const accounted = accounting?.writer.debit(
						"decodedBytes",
						response.body.length,
					);
					if (
						response.body.length > maxResponseBytes ||
						this.counts.decodedBytes > this.limits.maxTotalBytes
					)
						throw new AgentBrowserError(
							"resource-limit",
							"Routed response byte limit exceeded",
						);
					if (accounted === false)
						throw new AgentBrowserError(
							"resource-limit",
							"Fetch response body limit exceeded",
						);
					response = { ...response, body: new Uint8Array(response.body) };
					storeCookies?.(response.headers);
				} else {
					const hostname = networkHostname(url);
					const addresses = addressFamily(hostname)
						? [hostname]
						: await awaitWithSignal(this.resolver(hostname, signal), signal);
					this.policy.checkAddresses(url.href, addresses);
					ensureActive();
					const exchange = () => {
						ensureActive();
						if (this.requestPacer) {
							if (this.cookieJar) Reflect.deleteProperty(headers, "cookie");
							if (useCookies && hopContext) {
								const value = this.cookieJar?.cookieHeader(
									url.href,
									hopContext,
								);
								if (value) headers.cookie = value;
							}
							ensureActive();
						}
						return this.exchange(
							url,
							addresses[0],
							method,
							headers,
							body,
							redirect,
							signal,
							maxResponseBytes,
							storeCookies,
							accounting,
						);
					};
					response = this.requestPacer
						? await this.requestPacer.dispatch(url.origin, signal, exchange)
						: await exchange();
				}
				ensureActive();
				encodedBytes += response.encodedBytes;
				const location = response.headers.location;
				if (!redirectStatuses.has(response.status) || redirect === "manual") {
					const result: NetworkResponse = {
						...response,
						url: url.href,
						redirects,
						encodedBytes,
						elapsedMs: performance.now() - start,
					};
					if (cacheRequest && cacheStamp && resolved === undefined)
						this.resourceCache?.put(cacheRequest, result, cacheStamp);
					ensureActive();
					return result;
				}
				if (redirect === "error")
					throw networkPolicyError("redirect-mode-error");
				if (!location)
					return {
						...response,
						url: url.href,
						redirects,
						encodedBytes,
						elapsedMs: performance.now() - start,
					};
				if (location.length !== 1)
					throw new AgentBrowserError(
						"network-error",
						"Ambiguous redirect location",
					);
				if (redirects.length >= this.limits.maxRedirects)
					throw new AgentBrowserError(
						"resource-limit",
						"Redirect limit exceeded",
					);
				let next: URL;
				try {
					next = new URL(location[0], url);
				} catch {
					throw new AgentBrowserError("network-error", "Invalid redirect URL");
				}
				if (!location[0].includes("#")) next.hash = url.hash;
				next = this.policy.checkUrl(next.href);
				if (url.protocol === "https:" && next.protocol !== "https:")
					throw networkPolicyError("https-downgrade");
				redirects.push({
					url: url.href,
					status: response.status,
					location: next.href,
				});
				this.counts.redirects++;
				if (
					([301, 302].includes(response.status) && method === "POST") ||
					(response.status === 303 && !["GET", "HEAD"].includes(method))
				) {
					method = "GET";
					body = undefined;
					for (const name of bodyHeaders) delete headers[name];
				}
				if (url.origin !== next.origin) {
					for (const name of ["authorization", "cookie", "referer"])
						delete headers[name];
				}
				originTainted ||= next.origin !== cookieOrigin;
				if (cookieContext)
					siteTainted ||=
						!cookieSameSite(url.href, cookieContext.siteUrl) ||
						!cookieSameSite(next.href, cookieContext.siteUrl);
				url = next;
			}
		} catch (error) {
			const prefix =
				error && typeof error === "object"
					? this.pendingResponsePrefixes.get(error)
					: undefined;
			if (error && typeof error === "object")
				this.pendingResponsePrefixes.delete(error);
			if (signal.aborted) throw abortReason(signal);
			if (error instanceof AgentBrowserError) {
				if (prefix && !this.closed) this.responsePrefixes.set(error, prefix);
				throw error;
			}
			const code =
				error &&
				typeof error === "object" &&
				"code" in error &&
				typeof error.code === "string" &&
				/^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)
					? error.code
					: undefined;
			throw new AgentBrowserError(
				"network-error",
				code ? `Network request failed (${code})` : "Network request failed",
			);
		} finally {
			clearTimeout(timer);
			if (unsafeMethod) this.resourceCache?.clear();
			try {
				inputSignal?.removeEventListener("abort", abort);
			} finally {
				this.active.delete(controller);
				accounting?.finish();
			}
		}
	}

	private exchange(
		url: URL,
		address: string,
		method: string,
		headers: Record<string, string>,
		body: Buffer<ArrayBuffer> | undefined,
		redirect: string,
		signal: AbortSignal,
		maxResponseBytes: number,
		onHeaders?: (headers: NetworkResponse["headers"]) => void,
		accounting?: ResponseAccountingOperation,
	): Promise<Omit<NetworkResponse, "url" | "redirects" | "elapsedMs">> {
		return new Promise((resolve, reject) => {
			let incoming: IncomingMessage | undefined;
			let pendingPrefixError: AgentBrowserError | undefined;
			let finished = false;
			const abort = () => fail(abortReason(signal));
			const succeed = (
				result: Omit<NetworkResponse, "url" | "redirects" | "elapsedMs">,
			) => {
				if (finished) return;
				finished = true;
				signal.removeEventListener("abort", abort);
				resolve(result);
			};
			const fail = (error: unknown) => {
				if (finished) return;
				finished = true;
				signal.removeEventListener("abort", abort);
				incoming?.destroy();
				request.destroy();
				reject(error);
			};
			const hostname = networkHostname(url);
			const secure = url.protocol === "https:";
			const outgoingHeaders = wireHeaders(
				url,
				headers,
				body,
				this.limits.maxHeaderBytes,
			);
			const request = (secure ? httpsRequest : httpRequest)(
				{
					hostname: address,
					port: url.port || (secure ? 443 : 80),
					path: `${url.pathname}${url.search}`,
					method,
					agent: false,
					headers: outgoingHeaders,
					maxHeaderSize: this.limits.maxHeaderBytes,
					signal,
					...(secure
						? {
								servername: addressFamily(hostname) ? "" : hostname,
								ca: this.certificateAuthorities,
								rejectUnauthorized: true,
								checkServerIdentity: (
									_name: string,
									certificate: Parameters<typeof checkServerIdentity>[1],
								) => checkServerIdentity(hostname, certificate),
							}
						: {}),
				},
				(response) => {
					incoming = response;
					if (finished) {
						response.destroy();
						return;
					}
					const receivedHeaderBytes = response.rawHeaders.reduce(
						(size, value) => size + Buffer.byteLength(value) + 2,
						2,
					);
					if (receivedHeaderBytes > this.limits.maxHeaderBytes) {
						fail(
							new AgentBrowserError(
								"resource-limit",
								"Response header limit exceeded",
							),
						);
						return;
					}
					const status = response.statusCode ?? 0;
					const responseHeaderValues = responseHeaders(response);
					try {
						if (this.requestPacer && (status === 429 || status === 503)) {
							const advice = parseRetryAfter(responseHeaderValues, Date.now());
							if (advice)
								this.requestPacer.defer(url.origin, advice.delaySeconds * 1000);
						}
						onHeaders?.(responseHeaderValues);
					} catch (error) {
						fail(error);
						return;
					}
					if (
						method === "HEAD" ||
						[204, 205, 304].includes(status) ||
						(redirect !== "manual" &&
							redirectStatuses.has(status) &&
							(responseHeaderValues.location || redirect === "error"))
					) {
						succeed({
							status,
							headers: responseHeaderValues,
							body: new Uint8Array(),
							encodedBytes: 0,
						});
						response.destroy();
						return;
					}
					const consumption = this.consume(
						response,
						response.headers["content-encoding"] ?? "identity",
						signal,
						maxResponseBytes,
						accounting?.writer,
						this.captureDecodedPrefixBytes === undefined
							? undefined
							: (error, prefix) => {
									if (finished || signal.aborted || this.closed) return;
									const capturedHeaders = Object.freeze(
										Object.fromEntries(
											Object.entries(responseHeaderValues).map(
												([name, values]) => [name, Object.freeze([...values])],
											),
										),
									);
									this.pendingResponsePrefixes.set(
										error,
										Object.freeze({
											kind: "decoded-response-prefix-v1",
											complete: false,
											url: url.href,
											status,
											headers: capturedHeaders,
											...prefix,
										}),
									);
								},
						this.captureDecodedPrefixBytes === undefined
							? undefined
							: (error) => {
									pendingPrefixError = error;
								},
					);
					accounting?.track(consumption);
					void consumption.then(
						(result) =>
							succeed({ status, headers: responseHeaderValues, ...result }),
						fail,
					);
				},
			);
			request.on("error", (error) => {
				if (pendingPrefixError && error === pendingPrefixError) return;
				fail(
					"code" in error && error.code === "HPE_HEADER_OVERFLOW"
						? new AgentBrowserError(
								"resource-limit",
								"Response header limit exceeded",
							)
						: error,
				);
			});
			request.on("upgrade", (_response, socket) => {
				socket.destroy();
				fail(
					new AgentBrowserError(
						"network-error",
						"HTTP upgrades require a dedicated transport",
					),
				);
			});
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) {
				abort();
				return;
			}
			request.end(body);
		});
	}

	private async consume(
		response: Readable,
		contentEncoding: string,
		signal: AbortSignal,
		maxResponseBytes: number,
		accounting?: ResponseAccountingWriter,
		onPrefix?: (error: AgentBrowserError, prefix: ResponsePrefixBody) => void,
		onPrefixError?: (error: AgentBrowserError) => void,
	): Promise<{ body: Uint8Array; encodedBytes: number }> {
		const chunks: Buffer[] = [];
		let prefix: Buffer | undefined;
		let prefixError: AgentBrowserError | undefined;
		let encodedBytes = 0;
		let decodedBytes = 0;
		const encodings = contentEncoding
			.split(",")
			.map((value) => value.trim().toLowerCase())
			.reverse();
		if (
			encodings.length > 3 ||
			encodings.some(
				(encoding) => !["identity", "gzip", "deflate", "br"].includes(encoding),
			)
		) {
			response.destroy();
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported response content encoding",
			);
		}
		const decoders = encodings
			.filter((encoding) => encoding !== "identity")
			.map((encoding) =>
				encoding === "gzip"
					? createGunzip()
					: encoding === "br"
						? createBrotliDecompress()
						: createInflate(),
			);
		const count = (kind: "encodedBytes" | "decodedBytes", length: number) => {
			this.counts[kind] += length;
			const accounted = accounting?.debit(kind, length);
			if (this.counts[kind] > this.limits.maxTotalBytes)
				throw resourceLimitError(
					kind === "encodedBytes"
						? "network.session-encoded"
						: "network.session-decoded",
					this.limits.maxTotalBytes,
					this.counts[kind],
					"Session network byte limit exceeded",
				);
			if (accounted === false)
				throw new AgentBrowserError(
					"resource-limit",
					"Fetch response body limit exceeded",
				);
		};
		const encodedLimit = new Transform({
			transform: (chunk: Buffer, _encoding, callback) => {
				try {
					encodedBytes += chunk.byteLength;
					count("encodedBytes", chunk.byteLength);
					if (encodedBytes > maxResponseBytes)
						throw resourceLimitError(
							"network.response-encoded",
							maxResponseBytes,
							encodedBytes,
							"Encoded response byte limit exceeded",
						);
					callback(null, chunk);
				} catch (error) {
					callback(error as Error);
				}
			},
		});
		const output = new Writable({
			write: (chunk: Buffer, _encoding, callback) => {
				try {
					decodedBytes += chunk.byteLength;
					count("decodedBytes", chunk.byteLength);
					if (decodedBytes > maxResponseBytes) {
						const error = resourceLimitError(
							"network.response-decoded",
							maxResponseBytes,
							decodedBytes,
							"Decoded response byte limit exceeded",
						);
						if (onPrefix && this.captureDecodedPrefixBytes !== undefined) {
							const retained = Math.min(
								this.captureDecodedPrefixBytes,
								maxResponseBytes,
							);
							prefix = Buffer.alloc(retained);
							let offset = 0;
							for (const prior of chunks) {
								offset += prior.copy(prefix, offset, 0, retained - offset);
								if (offset === retained) break;
							}
							if (offset < retained)
								chunk.copy(prefix, offset, 0, retained - offset);
							prefixError = error;
							onPrefixError?.(error);
						}
						throw error;
					}
					chunks.push(Buffer.from(chunk));
					callback();
				} catch (error) {
					callback(error as Error);
				}
			},
		});
		try {
			await pipeline([response, encodedLimit, ...decoders, output], { signal });
		} catch (error) {
			if (prefixError && error === prefixError && prefix && !signal.aborted)
				onPrefix?.(prefixError, {
					body: prefix,
					encodedBytes,
					decodedBytes,
					limit: maxResponseBytes,
				});
			throw error;
		}
		return { body: Buffer.concat(chunks, decodedBytes), encodedBytes };
	}
}
