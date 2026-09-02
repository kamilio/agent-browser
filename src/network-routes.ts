import { AgentBrowserError } from "./errors.js";
import {
	type NetworkRequest,
	type NetworkResponse,
	parseNetworkUrl,
} from "./network.js";
import { RoutePattern } from "./route-pattern.js";

export interface RouteFulfillment {
	status?: number;
	body?: string;
	contentType?: string;
	headers?: Readonly<Record<string, string>>;
}
export interface NetworkRoute {
	readonly id: number;
	readonly pattern: string;
	readonly status: number;
	readonly contentType: string;
	readonly bodyBytes: number;
}
const maxima = {
	maxRoutes: 32,
	maxBodyBytes: 262_144,
	maxRetainedBytes: 1_048_576,
	maxFulfilled: 512,
	maxServedBytes: 8_388_608,
	maxMatchSteps: 2_000_000,
};
const encoder = new TextEncoder();
const forbiddenHeaders = new Set([
	"set-cookie",
	"set-cookie2",
	"content-encoding",
	"transfer-encoding",
	"content-length",
	"connection",
	"trailer",
]);

export class NetworkRoutes {
	private readonly limits: Readonly<typeof maxima>;
	private readonly rules: {
		info: NetworkRoute;
		pattern: RoutePattern;
		body: Uint8Array;
		headers: Record<string, readonly string[]>;
		bytes: number;
	}[] = [];
	private nextId = 1;
	private retainedBytes = 0;
	private fulfilled = 0;
	private servedBytes = 0;
	private closed = false;

	constructor(limits: Partial<typeof maxima> = {}) {
		this.limits = Object.freeze({ ...maxima, ...limits });
		for (const [key, value] of Object.entries(this.limits))
			if (
				!Object.hasOwn(maxima, key) ||
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > maxima[key as keyof typeof maxima]
			)
				throw new AgentBrowserError("invalid-input", "Invalid route limit");
	}

	add(pattern: string, options: RouteFulfillment): NetworkRoute {
		this.ensureOpen();
		if (
			!options ||
			typeof options !== "object" ||
			Array.isArray(options) ||
			Object.keys(options).some(
				(key) => !["status", "body", "contentType", "headers"].includes(key),
			)
		)
			throw new AgentBrowserError("invalid-input", "Invalid route fulfillment");
		if (options.status === undefined && options.body === undefined)
			throw new AgentBrowserError(
				"unsupported",
				"Route fulfillment requires a body or status; request rewriting is not implemented",
			);
		const status = options.status ?? 200;
		if (
			!Number.isInteger(status) ||
			status < 200 ||
			status > 599 ||
			(options.body !== undefined && typeof options.body !== "string")
		)
			throw new AgentBrowserError("invalid-input", "Invalid route response");
		const text = options.body ?? "";
		if (text.length > this.limits.maxBodyBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Route body limit exceeded",
			);
		const body = encoder.encode(text);
		if (body.length > this.limits.maxBodyBytes)
			throw new AgentBrowserError(
				"resource-limit",
				"Route body limit exceeded",
			);
		if ([204, 205, 304].includes(status) && body.length)
			throw new AgentBrowserError(
				"invalid-input",
				"This route status cannot have a body",
			);
		const compiled = new RoutePattern(pattern);
		const headers: Record<string, readonly string[]> = Object.create(null);
		if (
			options.headers !== undefined &&
			(!options.headers ||
				typeof options.headers !== "object" ||
				Array.isArray(options.headers))
		)
			throw new AgentBrowserError("invalid-input", "Invalid route headers");
		let headerBytes = 0;
		const entries = Object.entries(options.headers ?? {});
		if (options.contentType !== undefined)
			entries.push(["content-type", options.contentType]);
		if (entries.length > 128)
			throw new AgentBrowserError(
				"resource-limit",
				"Route header limit exceeded",
			);
		for (const [name, value] of entries) {
			if (
				name.length > 256 ||
				!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
				typeof value !== "string" ||
				/[^\t\x20-\x7e\x80-\xff]/.test(value)
			)
				throw new AgentBrowserError("invalid-input", "Invalid route header");
			const lower = name.toLowerCase();
			if (lower === "location" && Object.hasOwn(headers, lower))
				throw new AgentBrowserError(
					"invalid-input",
					"Duplicate route Location header",
				);
			if (forbiddenHeaders.has(lower))
				throw new AgentBrowserError(
					"unsupported",
					"This route response header is not supported",
				);
			headerBytes += name.length + value.length;
			if (headerBytes > 16_384)
				throw new AgentBrowserError(
					"resource-limit",
					"Route header limit exceeded",
				);
			headers[lower] = [
				...(lower === "content-type" && options.contentType !== undefined
					? []
					: (headers[lower] ?? [])),
				value.replace(/^[\t ]+|[\t ]+$/g, ""),
			];
		}
		if (!headers["content-type"])
			headers["content-type"] = ["text/plain;charset=utf-8"];
		const info: NetworkRoute = {
			id: this.nextId,
			pattern,
			status,
			contentType: headers["content-type"].join(", "),
			bodyBytes: body.length,
		};
		const bytes =
			body.length + encoder.encode(JSON.stringify({ info, headers })).length;
		if (
			this.rules.length >= this.limits.maxRoutes ||
			this.retainedBytes + bytes > this.limits.maxRetainedBytes ||
			!Number.isSafeInteger(this.nextId + 1)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Route retention limit exceeded",
			);
		this.rules.push({ info, pattern: compiled, body, headers, bytes });
		this.nextId++;
		this.retainedBytes += bytes;
		return { ...info };
	}

	list(): readonly NetworkRoute[] {
		this.ensureOpen();
		return this.rules.map(({ info }) => ({ ...info }));
	}
	remove(pattern?: string): number {
		this.ensureOpen();
		if (pattern !== undefined && typeof pattern !== "string")
			throw new AgentBrowserError("invalid-input", "Invalid route pattern");
		let removed = 0;
		for (let index = this.rules.length - 1; index >= 0; index--)
			if (pattern === undefined || this.rules[index].info.pattern === pattern) {
				this.retainedBytes -= this.rules[index].bytes;
				this.rules.splice(index, 1);
				removed++;
			}
		return removed;
	}

	fulfill(input: NetworkRequest): NetworkResponse | undefined {
		this.ensureOpen();
		if (input.signal?.aborted)
			throw input.signal.reason instanceof AgentBrowserError
				? input.signal.reason
				: new AgentBrowserError("aborted", "Routed request was aborted");
		if (!this.rules.length) return undefined;
		const url = parseNetworkUrl(input.url);
		url.hash = "";
		let work = 0;
		const charge = (steps: number) => {
			work += steps;
			if (work > this.limits.maxMatchSteps)
				throw new AgentBrowserError(
					"resource-limit",
					"Route matching work limit exceeded",
				);
		};
		for (let index = this.rules.length - 1; index >= 0; index--) {
			const rule = this.rules[index];
			if (!rule.pattern.matches(url.href, charge)) continue;
			const body =
				input.method?.toUpperCase() === "HEAD" ? new Uint8Array() : rule.body;
			if (
				this.fulfilled >= this.limits.maxFulfilled ||
				this.servedBytes + body.length > this.limits.maxServedBytes
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Mock response delivery limit exceeded",
				);
			this.fulfilled++;
			this.servedBytes += body.length;
			return {
				url: url.href,
				status: rule.info.status,
				headers: Object.fromEntries(
					Object.entries(rule.headers).map(([name, values]) => [
						name,
						[...values],
					]),
				),
				body: body.slice(),
				redirects: [],
				elapsedMs: 0,
				encodedBytes: 0,
				routeId: rule.info.id,
			};
		}
		return undefined;
	}

	metrics() {
		return {
			routes: this.rules.length,
			retainedBytes: this.retainedBytes,
			fulfilled: this.fulfilled,
			servedBytes: this.servedBytes,
			closed: this.closed,
			limits: { ...this.limits },
			partial: true as const,
		};
	}
	close() {
		if (this.closed) return;
		this.rules.length = 0;
		this.retainedBytes = 0;
		this.closed = true;
	}
	private ensureOpen() {
		if (this.closed) throw new AgentBrowserError("closed", "Routes are closed");
	}
}
