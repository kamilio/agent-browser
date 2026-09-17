import { AgentBrowserError } from "./errors.js";
import { imageMediaTypes } from "./image-decoder.js";
import type { NetworkResponse } from "./network.js";

export interface ResourceReuseCacheOptions {
	maxEntries: number;
	maxBytes: number;
	maxEntryBytes: number;
	maxAgeMs: number;
}

export interface ResourceReuseRequest {
	url: string;
	resource: "stylesheet" | "image";
	origin: string;
	headers: Readonly<Record<string, string>>;
}

export interface ResourceReuseStamp {
	readonly wallMs: number;
	readonly monotonicMs: number;
	readonly generation: number;
}

type Clock = Pick<ResourceReuseStamp, "wallMs" | "monotonicMs">;
type Headers = Record<string, string[]>;
interface Entry {
	url: string;
	headers: Headers;
	body: Uint8Array;
	bytes: number;
	initialAgeMs: number;
	storedMs: number;
	lifetimeMs: number;
}

const defaults: Readonly<ResourceReuseCacheOptions> = Object.freeze({
	maxEntries: 64,
	maxBytes: 2_097_152,
	maxEntryBytes: 262_144,
	maxAgeMs: 60_000,
});
const caps: Readonly<ResourceReuseCacheOptions> = Object.freeze({
	maxEntries: 1024,
	maxBytes: 16_777_216,
	maxEntryBytes: 16_777_216,
	maxAgeMs: 300_000,
});
const maxMetadataBytes = 32_768;
const maxHeaders = 64;
const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const sensitiveHeader =
	/auth|cookie|token|secret|password|credential|api[-_]?key|session|csrf|xsrf/i;
const mimeParameter =
	/^;[\t ]*([!#$%&'*+.^_`|~0-9A-Za-z-]+)[\t ]*=[\t ]*(?:[!#$%&'*+.^_`|~0-9A-Za-z-]+|"(?:[\t \x21\x23-\x5b\x5d-\xff]|\\[\t \x20-\xff])*")[\t ]*/;

function invalid(): never {
	throw new AgentBrowserError("invalid-input", "Invalid resource reuse limits");
}

function record(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return (
		(prototype === Object.prototype || prototype === null) &&
		Reflect.ownKeys(value).every((key) => {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			return (
				typeof key === "string" &&
				descriptor?.enumerable &&
				"value" in descriptor
			);
		})
	);
}

function finite(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= Number.MAX_SAFE_INTEGER
	);
}

function positiveInteger(value: unknown): value is number {
	return finite(value) && Number.isSafeInteger(value) && value > 0;
}

function headerValue(value: unknown): string | undefined {
	if (
		typeof value !== "string" ||
		value.length > 8192 ||
		/[^\t\x20-\x7e\x80-\xff]/.test(value)
	)
		return undefined;
	return value.replace(/^[\t ]+|[\t ]+$/g, "");
}

function requestKey(request: ResourceReuseRequest): string | undefined {
	if (
		!record(request) ||
		typeof request.url !== "string" ||
		request.url.length > 4096 ||
		typeof request.origin !== "string" ||
		request.origin.length > 4096 ||
		(request.resource !== "stylesheet" && request.resource !== "image") ||
		!record(request.headers)
	)
		return undefined;
	try {
		const url = new URL(request.url);
		if (
			url.protocol !== "https:" ||
			url.href !== request.url ||
			url.origin !== request.origin ||
			url.username ||
			url.password ||
			request.url.includes("#")
		)
			return undefined;
	} catch {
		return undefined;
	}
	const names = Object.keys(request.headers);
	if (names.length > maxHeaders) return undefined;
	const seen = new Set<string>();
	const headers: [string, string][] = [];
	let bytes = (request.url.length + request.origin.length) * 2;
	for (const name of names) {
		const normalized = name.toLowerCase();
		if (
			name.length > 256 ||
			!token.test(name) ||
			seen.has(normalized) ||
			sensitiveHeader.test(normalized) ||
			normalized.startsWith("if-") ||
			["range", "cache-control", "pragma"].includes(normalized)
		)
			return undefined;
		const value = headerValue(request.headers[name]);
		if (value === undefined) return undefined;
		bytes += 64 + (normalized.length + value.length) * 2;
		if (bytes > maxMetadataBytes) return undefined;
		seen.add(normalized);
		headers.push([normalized, value]);
	}
	headers.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
	const key = JSON.stringify([
		request.origin,
		request.resource,
		request.url,
		headers,
	]);
	return key.length * 2 <= maxMetadataBytes ? key : undefined;
}

function responseHeaders(input: unknown): Headers | undefined {
	if (!record(input)) return undefined;
	const names = Object.keys(input);
	if (names.length > maxHeaders) return undefined;
	const headers: Headers = Object.create(null);
	let bytes = 0;
	for (const name of names) {
		const normalized = name.toLowerCase();
		const values = input[name];
		if (
			name.length > 256 ||
			!token.test(name) ||
			Object.hasOwn(headers, normalized) ||
			!Array.isArray(values) ||
			!values.length ||
			values.length > 16
		)
			return undefined;
		bytes += 64 + normalized.length * 2;
		const copied: string[] = [];
		for (const value of values) {
			const normalizedValue = headerValue(value);
			if (normalizedValue === undefined) return undefined;
			bytes += 16 + normalizedValue.length * 2;
			if (bytes > maxMetadataBytes) return undefined;
			copied.push(normalizedValue);
		}
		headers[normalized] = copied;
	}
	return headers;
}

function single(headers: Headers, name: string): string | undefined {
	const values = headers[name];
	return values?.length === 1 ? values[0] : undefined;
}

function validMime(value: string | undefined, resource: string): boolean {
	if (!value) return false;
	const match = /^([^;\t ]+)[\t ]*/.exec(value);
	if (!match) return false;
	const mediaType = match[1].toLowerCase();
	if (
		resource === "stylesheet"
			? mediaType !== "text/css"
			: !imageMediaTypes.some((supported) => supported === mediaType)
	)
		return false;
	let remaining = value.slice(match[0].length);
	const parameters = new Set<string>();
	while (remaining) {
		const parameter = mimeParameter.exec(remaining);
		if (!parameter || parameters.has(parameter[1].toLowerCase())) return false;
		parameters.add(parameter[1].toLowerCase());
		remaining = remaining.slice(parameter[0].length);
	}
	return true;
}

function seconds(value: string | undefined): number | undefined {
	if (value === undefined || !/^[0-9]+$/.test(value)) return undefined;
	const parsed = Number(value);
	const milliseconds = parsed * 1000;
	return Number.isSafeInteger(parsed) && Number.isSafeInteger(milliseconds)
		? milliseconds
		: undefined;
}

function freshness(headers: Headers): number | undefined {
	const value = single(headers, "cache-control");
	if (!value) return undefined;
	const seen = new Set<string>();
	let maxAge: number | undefined;
	for (const part of value.split(",")) {
		const directive = part.trim().toLowerCase();
		if (directive.startsWith("max-age=")) {
			if (seen.has("max-age")) return undefined;
			const argument = directive.slice(8);
			maxAge = seconds(
				/^"(?:\\?[0-9])+"$/.test(argument)
					? argument.slice(1, -1).replace(/\\([0-9])/g, "$1")
					: argument,
			);
			if (!maxAge) return undefined;
			seen.add("max-age");
		} else {
			if (
				!["public", "must-revalidate", "immutable"].includes(directive) ||
				seen.has(directive)
			)
				return undefined;
			seen.add(directive);
		}
	}
	return seen.has("public") ? maxAge : undefined;
}

function dateMs(value: string | undefined): number | undefined {
	if (
		!value ||
		!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(
			value,
		)
	)
		return undefined;
	const parsed = Date.parse(value);
	return Number.isSafeInteger(parsed) &&
		new Date(parsed).toUTCString() === value
		? parsed
		: undefined;
}

export class ResourceReuseCache {
	private readonly validatedLimits: Readonly<ResourceReuseCacheOptions>;
	private readonly now: () => Clock;
	private readonly entries = new Map<string, Entry>();
	private stamps = new WeakSet<ResourceReuseStamp>();
	private previous: Clock | undefined;
	private generation = 0;
	private closed = false;
	private cacheHits = 0;
	private cachedDecodedBytes = 0;
	private cacheBytes = 0;

	constructor(
		options: Partial<ResourceReuseCacheOptions> = {},
		now: () => Clock = () => ({
			wallMs: Date.now(),
			monotonicMs: performance.now(),
		}),
	) {
		if (!record(options) || typeof now !== "function") invalid();
		if (Reflect.ownKeys(options).some((name) => !Object.hasOwn(defaults, name)))
			invalid();
		const limits = { ...defaults, ...options };
		for (const name of Object.keys(
			defaults,
		) as (keyof ResourceReuseCacheOptions)[])
			if (!positiveInteger(limits[name]) || limits[name] > caps[name])
				invalid();
		if (limits.maxEntryBytes > limits.maxBytes) invalid();
		this.validatedLimits = Object.freeze(limits);
		this.now = now;
	}

	get limits(): Readonly<ResourceReuseCacheOptions> {
		return this.validatedLimits;
	}

	start(): ResourceReuseStamp {
		const current = this.sample();
		const stamp = Object.freeze({
			wallMs: current?.wallMs ?? 0,
			monotonicMs: current?.monotonicMs ?? 0,
			generation: this.generation,
		});
		if (current) this.stamps.add(stamp);
		return stamp;
	}

	get(
		request: ResourceReuseRequest,
		maxResponseBytes: number,
	): NetworkResponse | undefined {
		if (!finite(maxResponseBytes) || !Number.isSafeInteger(maxResponseBytes))
			invalid();
		const current = this.sample();
		if (!current) return undefined;
		const key = requestKey(request);
		const entry = key === undefined ? undefined : this.entries.get(key);
		if (!entry || entry.body.byteLength > maxResponseBytes) return undefined;
		const headers = Object.fromEntries(
			Object.entries(entry.headers).map(([name, values]) => [
				name,
				[...values],
			]),
		);
		headers.age = [
			String(
				Math.floor(
					(entry.initialAgeMs + (current.monotonicMs - entry.storedMs)) / 1000,
				),
			),
		];
		const response = {
			url: entry.url,
			status: 200,
			headers,
			body: new Uint8Array(entry.body),
			redirects: [],
			encodedBytes: 0,
			elapsedMs: 0,
			delivery: "memory-cache" as const,
		};
		this.cacheHits = Math.min(Number.MAX_SAFE_INTEGER, this.cacheHits + 1);
		this.cachedDecodedBytes = Math.min(
			Number.MAX_SAFE_INTEGER,
			this.cachedDecodedBytes + entry.body.byteLength,
		);
		return response;
	}

	put(
		request: ResourceReuseRequest,
		response: NetworkResponse,
		stamp: ResourceReuseStamp,
	): void {
		const current = this.sample();
		if (!current) return;
		if (
			!record(stamp) ||
			!this.stamps.delete(stamp) ||
			stamp.generation !== this.generation ||
			!finite(stamp.wallMs) ||
			!finite(stamp.monotonicMs) ||
			stamp.wallMs > current.wallMs ||
			stamp.monotonicMs > current.monotonicMs
		)
			return;
		const key = requestKey(request);
		if (key === undefined) return;
		this.remove(key);
		if (
			!record(response) ||
			response.status !== 200 ||
			response.url !== request.url ||
			"routeId" in response ||
			"delivery" in response ||
			!Array.isArray(response.redirects) ||
			response.redirects.length !== 0 ||
			!(response.body instanceof Uint8Array) ||
			response.body.byteLength > this.limits.maxEntryBytes ||
			!finite(response.encodedBytes) ||
			!Number.isSafeInteger(response.encodedBytes) ||
			!finite(response.elapsedMs)
		)
			return;
		const headers = responseHeaders(response.headers);
		if (
			!headers ||
			["set-cookie", "content-range", "www-authenticate", "retry-after"].some(
				(name) => Object.hasOwn(headers, name),
			) ||
			!validMime(single(headers, "content-type"), request.resource) ||
			(Object.hasOwn(headers, "vary") &&
				single(headers, "vary")?.toLowerCase() !== "accept-encoding")
		)
			return;
		const freshnessMs = freshness(headers);
		const date = dateMs(single(headers, "date"));
		const ageMs = Object.hasOwn(headers, "age")
			? seconds(single(headers, "age"))
			: 0;
		if (freshnessMs === undefined || date === undefined || ageMs === undefined)
			return;
		const delay = Math.max(
			current.wallMs - stamp.wallMs,
			current.monotonicMs - stamp.monotonicMs,
		);
		const initialAgeMs = Math.max(0, current.wallMs - date, ageMs + delay);
		if (!finite(initialAgeMs) || initialAgeMs >= freshnessMs) return;
		let metadataBytes = 256 + (key.length + response.url.length) * 2;
		for (const [name, values] of Object.entries(headers)) {
			metadataBytes += 64 + name.length * 2;
			for (const value of values) metadataBytes += 16 + value.length * 2;
		}
		const bytes = response.body.byteLength + metadataBytes;
		if (metadataBytes > maxMetadataBytes || bytes > this.limits.maxBytes)
			return;
		while (
			this.entries.size >= this.limits.maxEntries ||
			this.cacheBytes + bytes > this.limits.maxBytes
		) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) return;
			this.remove(oldest);
		}
		this.entries.set(key, {
			url: response.url,
			headers,
			body: new Uint8Array(response.body),
			bytes,
			initialAgeMs,
			storedMs: current.monotonicMs,
			lifetimeMs: Math.min(freshnessMs - initialAgeMs, this.limits.maxAgeMs),
		});
		this.cacheBytes += bytes;
	}

	clear(): void {
		this.entries.clear();
		this.cacheBytes = 0;
		this.stamps = new WeakSet();
		if (this.generation === Number.MAX_SAFE_INTEGER) this.closed = true;
		else this.generation++;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.clear();
	}

	metrics(): {
		cacheHits: number;
		cachedDecodedBytes: number;
		cacheEntries: number;
		cacheBytes: number;
	} {
		this.sample();
		return {
			cacheHits: this.cacheHits,
			cachedDecodedBytes: this.cachedDecodedBytes,
			cacheEntries: this.entries.size,
			cacheBytes: this.cacheBytes,
		};
	}

	private sample(): Clock | undefined {
		if (this.closed) return undefined;
		let current: Clock;
		try {
			const value = this.now();
			if (
				!record(value) ||
				!finite(value.wallMs) ||
				!finite(value.monotonicMs)
			) {
				this.close();
				return undefined;
			}
			current = { wallMs: value.wallMs, monotonicMs: value.monotonicMs };
		} catch {
			this.close();
			return undefined;
		}
		if (
			this.previous &&
			(current.wallMs < this.previous.wallMs ||
				current.monotonicMs < this.previous.monotonicMs)
		) {
			this.close();
			return undefined;
		}
		this.previous = current;
		for (const [key, entry] of this.entries) {
			const residence = current.monotonicMs - entry.storedMs;
			if (
				residence >= entry.lifetimeMs ||
				!finite(entry.initialAgeMs + residence)
			)
				this.remove(key);
		}
		return current;
	}

	private remove(key: string): void {
		const entry = this.entries.get(key);
		if (!entry) return;
		this.entries.delete(key);
		this.cacheBytes -= entry.bytes;
	}
}
