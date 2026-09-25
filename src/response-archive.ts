import { normalizeCookieContext } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import {
	type NetworkRequest,
	type NetworkResponse,
	parseNetworkUrl,
} from "./network.js";

export const responseArchiveLimits = Object.freeze({
	maxEntries: 256,
	maxBodyBytes: 4 * 1024 * 1024,
	maxMetadataChars: 64 * 1024,
	maxTotalUnits: 16 * 1024 * 1024,
	maxSerializedChars: 36 * 1024 * 1024,
	maxStructuralTokens: 100_000,
});
export type ResponseArchiveLimits = {
	[Key in keyof typeof responseArchiveLimits]: number;
};

interface StoredRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | null;
	bodyKind: "none" | "text" | "bytes";
	redirect: "follow" | "manual" | "error";
	cookieContext: NetworkRequest["cookieContext"] | null;
}
interface StoredResponse {
	url: string;
	status: number;
	headers: Record<string, string[]>;
	body: string;
	redirects: { url: string; status: number; location: string }[];
	encodedBytes: number;
	elapsedMs: number;
	routeId: number | null;
}
interface Entry {
	request: StoredRequest;
	response: StoredResponse;
}

function invalid(): never {
	throw new AgentBrowserError("invalid-input", "Invalid response archive data");
}
function limited(): never {
	throw new AgentBrowserError(
		"resource-limit",
		"Response archive limit exceeded",
	);
}
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) invalid();
	for (const descriptor of Object.values(
		Object.getOwnPropertyDescriptors(value),
	))
		if (!Object.hasOwn(descriptor, "value")) invalid();
	if (Object.getOwnPropertySymbols(value).length) invalid();
	return value as Record<string, unknown>;
}
function shape(value: unknown, keys: string[]) {
	const record = object(value);
	const names = Object.keys(record);
	if (
		names.length !== keys.length ||
		names.some((name) => !keys.includes(name))
	)
		invalid();
	return record;
}
function finite(value: unknown, integer = false): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < 0 ||
		value > Number.MAX_SAFE_INTEGER ||
		(integer && !Number.isSafeInteger(value))
	)
		invalid();
	return value;
}
function text(value: unknown, limit: number): string {
	if (typeof value !== "string") invalid();
	if (value.length > limit) limited();
	return value;
}
function hex(bytes: Uint8Array): string {
	const chunks: string[] = [];
	for (let offset = 0; offset < bytes.length; offset += 4096) {
		let chunk = "";
		for (const byte of bytes.subarray(offset, offset + 4096))
			chunk += byte.toString(16).padStart(2, "0");
		chunks.push(chunk);
	}
	return chunks.join("");
}
function unhex(value: unknown, limit: number): Uint8Array {
	const encoded = text(value, limit * 2);
	if (encoded.length % 2 || /[^0-9a-f]/.test(encoded)) invalid();
	const bytes = new Uint8Array(encoded.length / 2);
	for (let index = 0; index < bytes.length; index++)
		bytes[index] = Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16);
	return bytes;
}

function structure(serialized: string, limit: number): number {
	let quoted = false;
	let escaped = false;
	let depth = 0;
	let tokens = 0;
	for (const character of serialized) {
		if (quoted) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') quoted = false;
			continue;
		}
		if (character === '"') quoted = true;
		else if ("{}[],:".includes(character)) {
			if (++tokens > limit) limited();
			if (character === "{" || character === "[") depth++;
			if (character === "}" || character === "]") depth--;
			if (depth > 8) limited();
			if (depth < 0) invalid();
		}
	}
	if (quoted || depth !== 0) invalid();
	return tokens;
}

export class ResponseArchive {
	readonly limits: Readonly<ResponseArchiveLimits>;
	#entries: Entry[] = [];
	#queues = new Map<string, { responses: StoredResponse[]; cursor: number }>();
	private units = 0;
	private structuralTokens = 9;
	private reads = 0;
	private closed = false;

	constructor(limits: Partial<ResponseArchiveLimits> = {}) {
		for (const [name, value] of Object.entries(object(limits))) {
			const maximum =
				responseArchiveLimits[name as keyof ResponseArchiveLimits];
			if (
				!maximum ||
				!Number.isSafeInteger(value) ||
				Number(value) < 1 ||
				Number(value) > maximum
			)
				invalid();
		}
		this.limits = Object.freeze({ ...responseArchiveLimits, ...limits });
	}

	private assertOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Response archive is closed");
	}

	private headers(value: unknown, multiple: false): Record<string, string>;
	private headers(value: unknown, multiple: true): Record<string, string[]>;
	private headers(value: unknown, multiple: boolean) {
		const input = object(value);
		const names = Object.keys(input);
		if (names.length > 256) limited();
		const normalized: Record<string, string | string[]> = Object.create(null);
		let units = 0;
		for (const original of names.sort()) {
			const name = text(original, 256).toLowerCase();
			if (
				!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) ||
				Object.hasOwn(normalized, name)
			)
				invalid();
			const values = multiple ? input[original] : [input[original]];
			if (!Array.isArray(values)) invalid();
			if (values.length > 256) limited();
			const copied: string[] = [];
			units += name.length;
			for (const value of values) {
				const header = text(value, this.limits.maxMetadataChars);
				if (/[\r\n\0]/.test(header)) invalid();
				units += header.length;
				if (units > this.limits.maxMetadataChars) limited();
				copied.push(header);
			}
			normalized[name] = multiple ? copied : copied[0];
		}
		return Object.fromEntries(
			Object.entries(normalized).sort(([left], [right]) =>
				left < right ? -1 : left > right ? 1 : 0,
			),
		);
	}

	private request(input: NetworkRequest): StoredRequest {
		object(input);
		if (input.signal !== undefined && !(input.signal instanceof AbortSignal))
			invalid();
		if (input.signal?.aborted)
			throw new AgentBrowserError(
				"aborted",
				"Response archive request aborted",
			);
		const method = text(input.method ?? "GET", 32).toUpperCase();
		if (!/^[A-Z]+$/.test(method)) invalid();
		const redirect = input.redirect ?? "follow";
		if (!["follow", "manual", "error"].includes(redirect)) invalid();
		let body: string | null = null;
		let bodyKind: StoredRequest["bodyKind"] = "none";
		if (input.body !== undefined) {
			let bytes: Uint8Array;
			if (typeof input.body === "string") {
				text(input.body, this.limits.maxBodyBytes);
				bytes = new TextEncoder().encode(input.body);
				bodyKind = "text";
			} else if (input.body instanceof Uint8Array) {
				bytes = input.body;
				bodyKind = "bytes";
			} else invalid();
			if (bytes.length > this.limits.maxBodyBytes) limited();
			if (["GET", "HEAD"].includes(method)) invalid();
			body = hex(bytes);
		}
		let cookieContext: StoredRequest["cookieContext"] = null;
		if (input.cookieContext !== undefined) {
			object(input.cookieContext);
			const { credentials } = input.cookieContext;
			if (!["omit", "include", "same-origin"].includes(credentials)) invalid();
			cookieContext = {
				...normalizeCookieContext(input.cookieContext),
				credentials,
			};
		}
		const request: StoredRequest = {
			url: parseNetworkUrl(input.url).href,
			method,
			headers: this.headers(input.headers ?? {}, false),
			body,
			bodyKind,
			redirect,
			cookieContext,
		};
		if (
			JSON.stringify({ ...request, body: null }).length >
			this.limits.maxMetadataChars
		)
			limited();
		return request;
	}

	private response(input: NetworkResponse): StoredResponse {
		object(input);
		if (!(input.body instanceof Uint8Array)) invalid();
		if (input.body.length > this.limits.maxBodyBytes) limited();
		const status = finite(input.status, true);
		if (status < 100 || status > 599) invalid();
		if (!Array.isArray(input.redirects)) invalid();
		if (input.redirects.length > 32) limited();
		const redirects = input.redirects.map((hop) => {
			shape(hop, ["url", "status", "location"]);
			if (![301, 302, 303, 307, 308].includes(hop.status)) invalid();
			return {
				url: parseNetworkUrl(hop.url).href,
				status: hop.status,
				location: text(hop.location, 16_384),
			};
		});
		const response: StoredResponse = {
			url: parseNetworkUrl(input.url).href,
			status,
			headers: this.headers(input.headers, true),
			body: "",
			redirects,
			encodedBytes: finite(input.encodedBytes, true),
			elapsedMs: finite(input.elapsedMs),
			routeId: input.routeId === undefined ? null : finite(input.routeId, true),
		};
		if (JSON.stringify(response).length > this.limits.maxMetadataChars)
			limited();
		response.body = hex(input.body);
		return response;
	}

	record(request: NetworkRequest, response: NetworkResponse): void {
		this.assertOpen();
		if (this.#entries.length >= this.limits.maxEntries) limited();
		const entry = {
			request: this.request(request),
			response: this.response(response),
		};
		const metadata = JSON.stringify({
			request: { ...entry.request, body: null },
			response: { ...entry.response, body: "" },
		});
		const units =
			(entry.request.body?.length ?? 0) / 2 +
			entry.response.body.length / 2 +
			metadata.length;
		if (this.units + units > this.limits.maxTotalUnits) limited();
		const tokens =
			structure(metadata, this.limits.maxStructuralTokens) +
			(this.#entries.length ? 1 : 0);
		if (this.structuralTokens + tokens > this.limits.maxStructuralTokens)
			limited();
		const key = JSON.stringify(entry.request);
		const queue = this.#queues.get(key) ?? { responses: [], cursor: 0 };
		queue.responses.push(entry.response);
		this.#queues.set(key, queue);
		this.#entries.push(entry);
		this.units += units;
		this.structuralTokens += tokens;
	}

	take(request: NetworkRequest): NetworkResponse {
		this.assertOpen();
		const queue = this.#queues.get(JSON.stringify(this.request(request)));
		if (!queue || queue.cursor === queue.responses.length)
			throw new AgentBrowserError(
				"not-found",
				"No remaining recorded response matches this request",
			);
		const stored = queue.responses[queue.cursor];
		const response: NetworkResponse = {
			url: stored.url,
			status: stored.status,
			headers: Object.fromEntries(
				Object.entries(stored.headers).map(([name, values]) => [
					name,
					[...values],
				]),
			),
			body: unhex(stored.body, this.limits.maxBodyBytes),
			redirects: stored.redirects.map((hop) => ({ ...hop })),
			encodedBytes: stored.encodedBytes,
			elapsedMs: stored.elapsedMs,
			...(stored.routeId === null ? {} : { routeId: stored.routeId }),
		};
		queue.cursor++;
		this.reads++;
		return response;
	}

	serialize(): string {
		this.assertOpen();
		const serialized = JSON.stringify({
			format: "agent-browser-responses",
			version: 1,
			entries: this.#entries,
		});
		if (serialized.length > this.limits.maxSerializedChars) limited();
		structure(serialized, this.limits.maxStructuralTokens);
		return serialized;
	}

	static parse(
		serialized: string,
		limits: Partial<ResponseArchiveLimits> = {},
	): ResponseArchive {
		const archive = new ResponseArchive(limits);
		text(serialized, archive.limits.maxSerializedChars);
		structure(serialized, archive.limits.maxStructuralTokens);
		let decoded: unknown;
		try {
			decoded = JSON.parse(serialized);
		} catch {
			invalid();
		}
		const root = shape(decoded, ["format", "version", "entries"]);
		if (
			root.format !== "agent-browser-responses" ||
			root.version !== 1 ||
			!Array.isArray(root.entries)
		)
			invalid();
		if (root.entries.length > archive.limits.maxEntries) limited();
		for (const value of root.entries) {
			const entry = shape(value, ["request", "response"]);
			const request = shape(entry.request, [
				"url",
				"method",
				"headers",
				"body",
				"bodyKind",
				"redirect",
				"cookieContext",
			]);
			const response = shape(entry.response, [
				"url",
				"status",
				"headers",
				"body",
				"redirects",
				"encodedBytes",
				"elapsedMs",
				"routeId",
			]);
			if (
				typeof request.bodyKind !== "string" ||
				!["none", "text", "bytes"].includes(request.bodyKind)
			)
				invalid();
			text(request.method, 32);
			text(request.redirect, 6);
			object(request.headers);
			if (request.bodyKind === "none" && request.body !== null) invalid();
			const bytes =
				request.bodyKind === "none"
					? undefined
					: unhex(request.body, archive.limits.maxBodyBytes);
			let body: string | Uint8Array | undefined = bytes;
			if (request.bodyKind === "text") {
				try {
					body = new TextDecoder("utf-8", {
						fatal: true,
						ignoreBOM: true,
					}).decode(bytes);
				} catch {
					invalid();
				}
			}
			if (request.cookieContext !== null)
				shape(request.cookieContext, [
					"siteUrl",
					"topLevelNavigation",
					"crossSiteRedirect",
					"method",
					"credentials",
				]);
			archive.record(
				{
					...request,
					body,
					cookieContext: request.cookieContext ?? undefined,
				} as NetworkRequest,
				{
					...response,
					body: unhex(response.body, archive.limits.maxBodyBytes),
					routeId: response.routeId === null ? undefined : response.routeId,
				} as NetworkResponse,
			);
		}
		return archive;
	}

	metrics() {
		return Object.freeze({
			entries: this.#entries.length,
			remaining: this.#entries.length - this.reads,
			reads: this.reads,
			retainedUnits: this.units,
			closed: this.closed,
		});
	}

	close(): void {
		this.#entries = [];
		this.#queues.clear();
		this.units = 0;
		this.structuralTokens = 9;
		this.reads = 0;
		this.closed = true;
	}
}
