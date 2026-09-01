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
import { AgentBrowserError } from "./errors.js";
import {
	type NetworkLimits,
	type NetworkMetrics,
	NetworkPolicy,
	type NetworkPolicyOptions,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkTransport,
	addressFamily,
	networkHostname,
} from "./network.js";

export type AddressResolver = (
	hostname: string,
	signal: AbortSignal,
) => Promise<readonly string[]>;

export interface NodeTransportOptions extends NetworkPolicyOptions {
	limits?: Partial<NetworkLimits>;
	resolver?: AddressResolver;
	certificateAuthorities?: readonly string[];
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
			throw new AgentBrowserError(
				"policy-denied",
				"Transport-controlled request header",
			);
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
	private readonly policy: NetworkPolicy;
	private readonly resolver: AddressResolver;
	private readonly certificateAuthorities?: string[];
	private readonly active = new Set<AbortController>();
	private closed = false;
	private counts = {
		requests: 0,
		redirects: 0,
		encodedBytes: 0,
		decodedBytes: 0,
	};

	constructor(options: NodeTransportOptions = {}) {
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
		this.policy = new NetworkPolicy(options);
		this.resolver = options.resolver ?? resolveAddresses;
	}

	metrics(): Readonly<NetworkMetrics> {
		return Object.freeze({
			...this.counts,
			active: this.active.size,
			closed: this.closed,
		});
	}

	close() {
		this.closed = true;
		for (const controller of this.active)
			controller.abort(new AgentBrowserError("closed", "Transport is closed"));
	}

	async request(input: NetworkRequest): Promise<NetworkResponse> {
		if (this.closed)
			throw new AgentBrowserError("closed", "Transport is closed");
		if (
			!input ||
			typeof input !== "object" ||
			(input.signal !== undefined && !(input.signal instanceof AbortSignal))
		)
			throw new AgentBrowserError("invalid-input", "Invalid network request");
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
			throw new AgentBrowserError(
				"policy-denied",
				"HTTP method is not allowed",
			);
		const redirect = input.redirect ?? "follow";
		if (!["follow", "manual", "error"].includes(redirect))
			throw new AgentBrowserError("invalid-input", "Invalid redirect mode");
		if (
			input.body !== undefined &&
			typeof input.body !== "string" &&
			!(input.body instanceof Uint8Array)
		)
			throw new AgentBrowserError("invalid-input", "Invalid request body");
		const bodyLength =
			typeof input.body === "string"
				? Buffer.byteLength(input.body)
				: (input.body?.byteLength ?? 0);
		if (bodyLength > this.limits.maxRequestBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Request body limit exceeded",
			);
		let body = input.body === undefined ? undefined : Buffer.from(input.body);
		if (body && ["GET", "HEAD"].includes(method))
			throw new AgentBrowserError(
				"invalid-input",
				"GET and HEAD cannot have a request body",
			);
		const headers = normalizeHeaders(input.headers, this.limits.maxHeaderBytes);
		if (typeof input.body === "string")
			headers["content-type"] ??= "text/plain;charset=UTF-8";
		if (this.active.size >= this.limits.maxConcurrent)
			throw new AgentBrowserError(
				"resource-limit",
				"Concurrent request limit exceeded",
			);
		const controller = new AbortController();
		const signal = controller.signal;
		const abort = () =>
			controller.abort(new AgentBrowserError("aborted", "Request aborted"));
		if (input.signal?.aborted) abort();
		else input.signal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(
			() =>
				controller.abort(
					new AgentBrowserError("timeout", "Network deadline exceeded"),
				),
			this.limits.timeoutMs,
		);
		const start = performance.now();
		const redirects: { url: string; status: number; location: string }[] = [];
		let encodedBytes = 0;
		this.active.add(controller);
		try {
			while (true) {
				if (signal.aborted) throw abortReason(signal);
				if (this.counts.requests >= this.limits.maxRequests)
					throw new AgentBrowserError(
						"resource-limit",
						"Session request limit exceeded",
					);
				this.counts.requests++;
				const hostname = networkHostname(url);
				const addresses = addressFamily(hostname)
					? [hostname]
					: await awaitWithSignal(this.resolver(hostname, signal), signal);
				this.policy.checkAddresses(url.href, addresses);
				if (signal.aborted) throw abortReason(signal);
				const response = await this.exchange(
					url,
					addresses[0],
					method,
					headers,
					body,
					redirect,
					signal,
				);
				encodedBytes += response.encodedBytes;
				const location = response.headers.location;
				if (!redirectStatuses.has(response.status) || redirect === "manual")
					return {
						...response,
						url: url.href,
						redirects,
						encodedBytes,
						elapsedMs: performance.now() - start,
					};
				if (redirect === "error")
					throw new AgentBrowserError(
						"policy-denied",
						"Redirects are not allowed",
					);
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
					throw new AgentBrowserError(
						"policy-denied",
						"HTTPS downgrade redirects are not allowed",
					);
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
				url = next;
			}
		} catch (error) {
			if (signal.aborted) throw abortReason(signal);
			if (error instanceof AgentBrowserError) throw error;
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
			input.signal?.removeEventListener("abort", abort);
			this.active.delete(controller);
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
	): Promise<Omit<NetworkResponse, "url" | "redirects" | "elapsedMs">> {
		return new Promise((resolve, reject) => {
			let incoming: IncomingMessage | undefined;
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
					void this.consume(
						response,
						response.headers["content-encoding"] ?? "identity",
						signal,
					).then(
						(result) =>
							succeed({ status, headers: responseHeaderValues, ...result }),
						fail,
					);
				},
			);
			request.on("error", (error) => {
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
	): Promise<{ body: Uint8Array; encodedBytes: number }> {
		const chunks: Buffer[] = [];
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
			if (this.counts[kind] > this.limits.maxTotalBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Session network byte limit exceeded",
				);
		};
		const encodedLimit = new Transform({
			transform: (chunk: Buffer, _encoding, callback) => {
				try {
					encodedBytes += chunk.byteLength;
					count("encodedBytes", chunk.byteLength);
					if (encodedBytes > this.limits.maxResponseBytes)
						throw new AgentBrowserError(
							"resource-limit",
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
					if (decodedBytes > this.limits.maxResponseBytes)
						throw new AgentBrowserError(
							"resource-limit",
							"Decoded response byte limit exceeded",
						);
					chunks.push(Buffer.from(chunk));
					callback();
				} catch (error) {
					callback(error as Error);
				}
			},
		});
		await pipeline([response, encodedLimit, ...decoders, output], { signal });
		return { body: Buffer.concat(chunks, decodedBytes), encodedBytes };
	}
}
