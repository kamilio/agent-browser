import { documentBaseUrl } from "./document-url.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";
import type { PageBindingContext } from "./page-bindings.js";
import type { PageFetch, PageFetchTextResponse } from "./page-fetch.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

interface RequestRecord {
	state: number;
	generation: number;
	sent: boolean;
	async: boolean;
	method: string;
	url: string;
	headers: Record<string, string>;
	body?: string;
	credentials: boolean;
	timeout: number;
	responseType: "" | "text";
	controller?: AbortController;
	response?: PageFetchTextResponse;
	failed: "error" | "abort" | "timeout";
}

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

export const pageXmlHttpRequestLimits = Object.freeze({
	maxObjects: 64,
	maxHeaders: 128,
	maxHeaderBytes: 16_384,
	maxUrlCodeUnits: 16_384,
	maxTimeoutMs: 5000,
});

export class PageXmlHttpRequests {
	readonly bootstrap: () => object;
	private readonly requests = new Map<object, RequestRecord>();
	private constructorReference: unknown;
	private bootstrapped = false;
	private published = false;
	private closed = false;
	private pending = 0;
	private cleanupFailures = 0;
	private readonly unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		private readonly context: PageBindingContext,
		private readonly network: PageFetch,
	) {
		if (typeof context.nestedOperation !== "function")
			throw new AgentBrowserError(
				"unsupported",
				"XHR requires await-result host operations",
			);
		const sendSync = (request: unknown) => {
			const record = this.resolve(request);
			if (record.async)
				throw new AgentBrowserError("invalid-input", "XHR is asynchronous");
			return this.send(record);
		};
		if (context.nestedOperation(sendSync) !== sendSync)
			throw new AgentBrowserError(
				"unsupported",
				"XHR registration must preserve identity",
			);
		const publish = context.retainGuestArguments((value: unknown) => {
			try {
				this.ensureOpen();
				if (!this.bootstrapped || this.published || !reference(value))
					throw new AgentBrowserError(
						"invalid-input",
						"Invalid XHR constructor publication",
					);
				this.constructorReference = value;
				this.published = true;
			} catch (error) {
				if (reference(value) && value !== this.constructorReference)
					this.release(value);
				throw error;
			}
		}, 0);
		this.bootstrap = () => {
			this.ensureOpen();
			if (this.bootstrapped)
				throw new AgentBrowserError(
					"invalid-input",
					"XHR bootstrap is available once",
				);
			this.bootstrapped = true;
			const port = context.createHostObject({
				methods: {
					publish,
					create: () => this.create(),
					sendSync,
					sendAsync: (request) => {
						const record = this.resolve(request);
						if (!record.async)
							throw new AgentBrowserError(
								"invalid-input",
								"XHR is synchronous",
							);
						return this.send(record);
					},
				},
			});
			this.ensureOpen();
			return port;
		};
		this.unregisterClose = tree.onClose(() => this.close());
	}

	get constructorValue() {
		this.ensureOpen();
		return this.constructorReference;
	}

	metrics() {
		return Object.freeze({
			closed: this.closed,
			objects: this.requests.size,
			pending: this.pending,
			cleanupFailures: this.cleanupFailures,
			partial: true,
			responseTypes: ["", "text"],
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		for (const record of this.requests.values()) this.reset(record);
		this.requests.clear();
		if (reference(this.constructorReference))
			this.release(this.constructorReference);
		this.constructorReference = undefined;
		this.unregisterClose?.();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "XHR owner is closed");
	}

	private release(value: unknown) {
		try {
			void Promise.resolve(this.context.releaseGuestReference(value)).catch(
				() => {
					this.cleanupFailures++;
				},
			);
		} catch {
			this.cleanupFailures++;
		}
	}

	private resolve(value: unknown) {
		this.ensureOpen();
		const record = reference(value)
			? this.requests.get(value as object)
			: undefined;
		if (!record)
			throw new AgentBrowserError("invalid-input", "Unknown XHR capability");
		return record;
	}

	private reset(record: RequestRecord) {
		const generation = ++record.generation;
		const controller = record.controller;
		const response = record.response;
		record.controller = undefined;
		record.response = undefined;
		record.body = undefined;
		record.headers = Object.create(null);
		record.sent = false;
		record.state = 0;
		response?.release();
		controller?.abort();
		return generation;
	}

	private create() {
		this.ensureOpen();
		if (!this.published)
			throw new AgentBrowserError(
				"invalid-input",
				"XHR constructor is not published",
			);
		if (this.requests.size >= pageXmlHttpRequestLimits.maxObjects)
			throw new AgentBrowserError(
				"resource-limit",
				"XHR object limit exceeded",
			);
		const record: RequestRecord = {
			state: 0,
			generation: 0,
			sent: false,
			async: true,
			method: "",
			url: "",
			headers: Object.create(null),
			credentials: false,
			timeout: 0,
			responseType: "",
			failed: "error",
		};
		const read = (operation: () => unknown) => () => {
			this.ensureOpen();
			return operation();
		};
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> = {
			readyState: { get: read(() => record.state) },
			generation: { get: read(() => record.generation) },
			async: { get: read(() => record.async) },
			failure: { get: read(() => record.failed) },
			status: {
				get: read(() =>
					record.state >= 2 ? (record.response?.status ?? 0) : 0,
				),
			},
			statusText: {
				get: read(() =>
					record.state >= 2 ? (record.response?.statusText ?? "") : "",
				),
			},
			responseURL: {
				get: read(() =>
					record.state >= 2 ? (record.response?.url ?? "") : "",
				),
			},
			responseText: {
				get: read(() =>
					record.state >= 3 ? (record.response?.text ?? "") : "",
				),
			},
			withCredentials: {
				get: read(() => record.credentials),
				set: (value) => {
					this.ensureOpen();
					if (record.state > 1 || record.sent || typeof value !== "boolean")
						throw new AgentBrowserError(
							"invalid-input",
							"Invalid XHR credentials state",
						);
					record.credentials = value;
				},
			},
			timeout: {
				get: read(() => record.timeout),
				set: (value) => {
					this.ensureOpen();
					if (
						typeof value !== "number" ||
						!Number.isSafeInteger(value) ||
						value < 0 ||
						value > pageXmlHttpRequestLimits.maxTimeoutMs ||
						!record.async ||
						record.sent
					)
						throw new AgentBrowserError(
							"unsupported",
							"Unsupported XHR timeout",
						);
					record.timeout = value;
				},
			},
			responseType: {
				get: read(() => record.responseType),
				set: (value) => {
					this.ensureOpen();
					if (
						(value !== "" && value !== "text") ||
						record.state >= 3 ||
						record.sent ||
						!record.async
					)
						throw new AgentBrowserError(
							"unsupported",
							"XHR supports asynchronous text response types",
						);
					record.responseType = value;
				},
			},
		};
		const capability = this.context.createHostObject({
			properties,
			methods: {
				open: (method, url, async) => this.open(record, method, url, async),
				setRequestHeader: (name, value) => this.setHeader(record, name, value),
				prepare: (body) => this.prepare(record, body),
				advance: (generation, state) => {
					this.ensureOpen();
					if (generation !== record.generation) return false;
					if (
						!record.response ||
						(state !== 3 && state !== 4) ||
						state !== record.state + 1
					)
						throw new AgentBrowserError(
							"invalid-input",
							"Invalid XHR response transition",
						);
					record.state = state;
					if (state === 4) record.sent = false;
					return true;
				},
				abort: () => {
					this.ensureOpen();
					const active = record.sent;
					const generation = this.reset(record);
					this.ensureOpen();
					if (record.generation !== generation) return false;
					record.failed = "abort";
					record.state = active ? 4 : 0;
					return active;
				},
				resetAbort: (generation) => {
					this.ensureOpen();
					if (record.generation === generation && !record.sent)
						record.state = 0;
				},
				getResponseHeader: (name) => {
					this.ensureOpen();
					const key = this.headerName(name);
					return record.state >= 2
						? (record.response?.headers[key] ?? null)
						: null;
				},
				getAllResponseHeaders: () => {
					this.ensureOpen();
					return record.state >= 2 && record.response
						? Object.entries(record.response.headers)
								.sort(([left], [right]) =>
									left < right ? -1 : left > right ? 1 : 0,
								)
								.map(([name, value]) => `${name}: ${value}\r\n`)
								.join("")
						: "";
				},
			},
		});
		this.ensureOpen();
		if (this.requests.size >= pageXmlHttpRequestLimits.maxObjects)
			throw new AgentBrowserError(
				"resource-limit",
				"XHR object limit exceeded",
			);
		if (
			!capability ||
			typeof capability !== "object" ||
			this.requests.has(capability)
		)
			throw new AgentBrowserError("unsupported", "Invalid XHR host capability");
		this.requests.set(capability, record);
		return capability;
	}

	private open(
		record: RequestRecord,
		method: unknown,
		input: unknown,
		async: unknown,
	) {
		this.ensureOpen();
		if (
			typeof method !== "string" ||
			method.length > 32 ||
			!token.test(method) ||
			["CONNECT", "TRACE", "TRACK"].includes(method.toUpperCase())
		)
			throw new AgentBrowserError("invalid-input", "Invalid XHR method");
		if (
			typeof input !== "string" ||
			input.length > pageXmlHttpRequestLimits.maxUrlCodeUnits ||
			/\p{Cc}/u.test(input) ||
			typeof async !== "boolean"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid XHR URL or async flag",
			);
		if (!async && (record.timeout !== 0 || record.responseType !== ""))
			throw new AgentBrowserError(
				"unsupported",
				"Synchronous XHR requires default timeout and response type",
			);
		const url = parseNetworkUrl(
			new URL(input, documentBaseUrl(this.tree)).href,
		);
		url.hash = "";
		const generation = this.reset(record);
		this.ensureOpen();
		if (record.generation !== generation) return;
		record.method = [
			"DELETE",
			"GET",
			"HEAD",
			"OPTIONS",
			"POST",
			"PUT",
		].includes(method.toUpperCase())
			? method.toUpperCase()
			: method;
		record.url = url.href;
		record.async = async;
		record.state = 1;
		record.failed = "error";
		return generation;
	}

	private headerName(value: unknown) {
		if (typeof value !== "string" || value.length > 256 || !token.test(value))
			throw new AgentBrowserError("invalid-input", "Invalid XHR header name");
		return value.toLowerCase();
	}

	private setHeader(record: RequestRecord, name: unknown, value: unknown) {
		this.ensureOpen();
		if (record.state !== 1 || record.sent)
			throw new AgentBrowserError(
				"invalid-input",
				"XHR headers require an opened request",
			);
		const key = this.headerName(name);
		if (typeof value !== "string" || /[^\t\x20-\x7e\x80-\xff]/.test(value))
			throw new AgentBrowserError("invalid-input", "Invalid XHR header value");
		if (
			forbiddenHeaders.has(key) ||
			key.startsWith("proxy-") ||
			key.startsWith("sec-")
		)
			return;
		const text = value.replace(/^[\t ]+|[\t ]+$/g, "");
		const merged = Object.hasOwn(record.headers, key)
			? `${record.headers[key]}, ${text}`
			: text;
		const entries = Object.entries(record.headers).filter(
			([name]) => name !== key,
		);
		if (
			entries.length >= pageXmlHttpRequestLimits.maxHeaders ||
			entries.reduce(
				(total, [name, value]) => total + name.length + value.length,
				key.length + merged.length,
			) > pageXmlHttpRequestLimits.maxHeaderBytes
		)
			throw new AgentBrowserError(
				"resource-limit",
				"XHR header limit exceeded",
			);
		record.headers[key] = merged;
	}

	private prepare(record: RequestRecord, body: unknown) {
		this.ensureOpen();
		if (record.state !== 1 || record.sent)
			throw new AgentBrowserError(
				"invalid-input",
				"XHR send requires an opened request",
			);
		if (body != null && typeof body !== "string")
			throw new AgentBrowserError(
				"unsupported",
				"XHR supports string request bodies",
			);
		const text =
			["GET", "HEAD"].includes(record.method) || body == null
				? undefined
				: (body as string);
		if (
			text !== undefined &&
			(text.length > this.network.limits.maxRequestBytes ||
				new TextEncoder().encode(text).byteLength >
					this.network.limits.maxRequestBytes)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"XHR request body limit exceeded",
			);
		record.body = text;
		record.sent = true;
		return record.generation;
	}

	private async send(record: RequestRecord) {
		this.ensureOpen();
		if (!record.sent || record.controller || record.state !== 1)
			throw new AgentBrowserError("invalid-input", "XHR send is not prepared");
		const generation = record.generation;
		const controller = new AbortController();
		record.controller = controller;
		const timeout = record.timeout
			? setTimeout(() => {
					if (this.closed || record.generation !== generation) return;
					record.failed = "timeout";
					controller.abort(new AgentBrowserError("timeout", "XHR timed out"));
				}, record.timeout)
			: undefined;
		this.pending++;
		try {
			const response = await this.network.requestText(
				record.url,
				{
					method: record.method,
					headers: record.headers,
					body: record.body,
					credentials: record.credentials ? "include" : "same-origin",
				},
				controller.signal,
			);
			if (
				this.closed ||
				record.generation !== generation ||
				controller.signal.aborted
			) {
				response.release();
				throw new AgentBrowserError("aborted", "XHR response is stale");
			}
			record.response = response;
			record.state = 2;
			return generation;
		} catch (error) {
			if (!this.closed && record.generation === generation) {
				record.state = 4;
				record.sent = false;
				if (error instanceof AgentBrowserError && error.code === "timeout")
					record.failed = "timeout";
			}
			throw error;
		} finally {
			if (timeout !== undefined) clearTimeout(timeout);
			this.pending--;
			if (record.generation === generation) record.body = undefined;
		}
	}
}

function reference(value: unknown): boolean {
	return (
		value !== null && (typeof value === "object" || typeof value === "function")
	);
}
