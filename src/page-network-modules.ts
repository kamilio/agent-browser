import type { FetchCredentials } from "./cors.js";
import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";
import {
	type PageSourceModule,
	pageSourceModuleLimits,
} from "./page-source-modules.js";
import type { ScriptFetchPolicy, ScriptFetchResult } from "./script-fetch.js";

export interface PageNetworkModuleOptions {
	readonly documentUrl: string;
	readonly entries: readonly PageSourceModule[];
	readonly fetchWithPolicy: (
		url: string,
		policy: ScriptFetchPolicy,
		signal: AbortSignal,
	) => Promise<Readonly<ScriptFetchResult>>;
	readonly credentials?: FetchCredentials;
}

export const pageNetworkModuleLimits = Object.freeze({
	...pageSourceModuleLimits,
	fetches: 128,
	activeFetches: 4,
	responseBytes: 1_048_576,
});

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
const signalAborted = Object.getOwnPropertyDescriptor(
	AbortSignal.prototype,
	"aborted",
)?.get;

function invalid(): AgentBrowserError {
	return new AgentBrowserError("invalid-input", "Invalid network module input");
}

function limited(): AgentBrowserError {
	return new AgentBrowserError(
		"resource-limit",
		"Network module limit exceeded",
	);
}

function aborted(): AgentBrowserError {
	return new AgentBrowserError("aborted", "Network module operation aborted");
}

function data(record: unknown, key: string, optional = false): unknown {
	if (!record || typeof record !== "object") throw invalid();
	const descriptor = Object.getOwnPropertyDescriptor(record, key);
	if (!descriptor && optional) return undefined;
	if (!descriptor || !("value" in descriptor)) throw invalid();
	return descriptor.value;
}

function text(value: unknown, maximum: number, empty = false): string {
	if (typeof value !== "string" || (!empty && value.length === 0))
		throw invalid();
	if (value.length > maximum) throw limited();
	return value;
}

function checkSignal(value: unknown): asserts value is AbortSignal {
	let canceled: boolean;
	try {
		if (!signalAborted) throw invalid();
		canceled = signalAborted.call(value);
	} catch {
		throw invalid();
	}
	if (canceled) throw aborted();
}

function moduleUrl(input: unknown, document: URL, base?: string): URL {
	const value = text(input, pageNetworkModuleLimits.identifierCodeUnits);
	if (/[\\\p{Cc}]/u.test(value)) throw invalid();
	let resolved: URL;
	try {
		resolved = new URL(value, base);
	} catch {
		throw invalid();
	}
	const url = parseNetworkUrl(resolved.href);
	if (document.protocol === "https:" && url.protocol !== "https:")
		throw new AgentBrowserError("policy-denied", "Mixed-content module denied");
	if (url.href.length > pageNetworkModuleLimits.identifierCodeUnits)
		throw limited();
	return url;
}

function awaitResult<Value>(
	operation: Promise<Value>,
	signal: AbortSignal,
): Promise<Value> {
	checkSignal(signal);
	return new Promise((resolve, reject) => {
		const cancel = () => reject(aborted());
		signal.addEventListener("abort", cancel, { once: true });
		operation.then(
			(value) => {
				signal.removeEventListener("abort", cancel);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", cancel);
				reject(error);
			},
		);
		if (signal.aborted) cancel();
	});
}

export class PageNetworkModuleRegistry {
	readonly #document: URL;
	readonly #entries = new Map<string, Readonly<PageSourceModule>>();
	readonly #fetch: PageNetworkModuleOptions["fetchWithPolicy"];
	readonly #policy: Readonly<ScriptFetchPolicy>;
	readonly #entryUnits: number;

	constructor(options: PageNetworkModuleOptions) {
		this.#document = parseNetworkUrl(
			text(
				data(options, "documentUrl"),
				pageNetworkModuleLimits.identifierCodeUnits,
			),
		);
		const fetch = data(options, "fetchWithPolicy");
		if (typeof fetch !== "function") throw invalid();
		this.#fetch = fetch as PageNetworkModuleOptions["fetchWithPolicy"];
		const configuredCredentials = data(options, "credentials", true);
		const credentials =
			configuredCredentials === undefined
				? "same-origin"
				: configuredCredentials;
		if (!["omit", "same-origin", "include"].includes(credentials as string))
			throw invalid();
		this.#policy = Object.freeze({
			mode: "cors",
			credentials: credentials as FetchCredentials,
		});
		const entries = data(options, "entries");
		if (!Array.isArray(entries)) throw invalid();
		const length = data(entries, "length");
		if (
			typeof length !== "number" ||
			!Number.isSafeInteger(length) ||
			length < 1
		)
			throw invalid();
		if (length > pageNetworkModuleLimits.sources) throw limited();
		let units = 0;
		for (let index = 0; index < length; index++) {
			const entry = data(entries, String(index));
			const identity = data(entry, "id");
			const id = moduleUrl(identity, this.#document).href;
			if (id !== identity || this.#entries.has(id)) throw invalid();
			const source = text(
				data(entry, "source"),
				pageNetworkModuleLimits.sourceCodeUnits,
				true,
			);
			units += source.length;
			if (units > pageNetworkModuleLimits.totalSourceCodeUnits) throw limited();
			this.#entries.set(id, Object.freeze({ id, source }));
		}
		this.#entryUnits = units;
	}

	createScope(signal: AbortSignal, maxSourceCodeUnits: number) {
		checkSignal(signal);
		if (!Number.isSafeInteger(maxSourceCodeUnits) || maxSourceCodeUnits < 1)
			throw invalid();
		const maximum = Math.min(
			maxSourceCodeUnits,
			pageNetworkModuleLimits.sourceCodeUnits,
		);
		for (const entry of this.#entries.values())
			if (entry.source.length > maximum) throw limited();
		const sources = new Map(this.#entries);
		const requests = new Map<string, Promise<Readonly<PageSourceModule>>>();
		const waiters: { resolve(): void; reject(error: unknown): void }[] = [];
		let closed = false;
		let active = 0;
		let reservations = 0;
		let resolutions = 0;
		let units = this.#entryUnits;
		const live = () => {
			if (closed) throw aborted();
			checkSignal(signal);
		};
		const close = () => {
			closed = true;
			sources.clear();
			requests.clear();
			for (const waiter of waiters.splice(0)) waiter.reject(aborted());
		};
		signal.addEventListener("abort", close, { once: true });
		const acquire = async () => {
			live();
			if (active < pageNetworkModuleLimits.activeFetches) {
				active++;
				return;
			}
			await new Promise<void>((resolve, reject) =>
				waiters.push({ resolve, reject }),
			);
		};
		const release = () => {
			active--;
			const next = waiters.shift();
			if (next) {
				active++;
				next.resolve();
			}
		};
		const load = async (url: URL): Promise<Readonly<PageSourceModule>> => {
			await acquire();
			try {
				live();
				const result = await Reflect.apply(this.#fetch, undefined, [
					url.href,
					this.#policy,
					signal,
				]);
				live();
				if (!result || !["basic", "cors"].includes(result.type))
					throw new AgentBrowserError(
						"policy-denied",
						"Module response is not CORS eligible",
					);
				const response = result.response;
				const finalUrl = moduleUrl(response.url, this.#document);
				if (finalUrl.href !== response.url) throw invalid();
				if (
					result.type === "basic" &&
					(url.origin !== this.#document.origin ||
						finalUrl.origin !== this.#document.origin)
				)
					throw new AgentBrowserError(
						"policy-denied",
						"Cross-origin module requires CORS",
					);
				if (
					!Number.isInteger(response.status) ||
					response.status < 200 ||
					response.status >= 300
				)
					throw new AgentBrowserError(
						"network-error",
						"Module response failed",
					);
				const typeFields = Object.entries(response.headers).filter(
					([name]) => name.toLowerCase() === "content-type",
				);
				if (typeFields.some(([, values]) => !Array.isArray(values)))
					throw new AgentBrowserError(
						"unsupported",
						"Module response MIME is not JavaScript",
					);
				const types = typeFields.flatMap(([, values]) => values);
				if (
					!Array.isArray(types) ||
					types.length !== 1 ||
					typeof types[0] !== "string" ||
					!javascriptTypes.has(types[0].split(";", 1)[0].trim().toLowerCase())
				)
					throw new AgentBrowserError(
						"unsupported",
						"Module response MIME is not JavaScript",
					);
				if (!(response.body instanceof Uint8Array)) throw invalid();
				if (response.body.byteLength > pageNetworkModuleLimits.responseBytes)
					throw limited();
				const source = new TextDecoder("utf-8").decode(response.body);
				if (source.length > maximum) throw limited();
				finalUrl.hash = url.hash;
				const id = moduleUrl(finalUrl.href, this.#document).href;
				const prior = sources.get(id);
				if (prior) {
					if (prior.source !== source) throw invalid();
					return prior;
				}
				if (
					sources.size >= pageNetworkModuleLimits.sources ||
					units + source.length > pageNetworkModuleLimits.totalSourceCodeUnits
				)
					throw limited();
				const value = Object.freeze({ id, source });
				units += source.length;
				sources.set(id, value);
				return value;
			} finally {
				release();
			}
		};
		return Object.freeze({
			validateEntry: (source: string, filename: string | undefined): void => {
				live();
				const id = moduleUrl(filename, this.#document).href;
				if (
					id !== filename ||
					sources.get(id)?.source !== text(source, maximum, true)
				)
					throw invalid();
			},
			resolve: async (
				specifier: string,
				referrer: string,
				context: { signal?: AbortSignal },
			): Promise<Readonly<PageSourceModule> | undefined> => {
				live();
				const contextSignal = data(context, "signal", true);
				if (contextSignal !== undefined) checkSignal(contextSignal);
				if (resolutions++ >= pageNetworkModuleLimits.resolutions)
					throw limited();
				const requested = text(
					specifier,
					pageNetworkModuleLimits.identifierCodeUnits,
				);
				const parent = text(
					referrer,
					pageNetworkModuleLimits.identifierCodeUnits,
				);
				if (!sources.has(parent)) return undefined;
				if (!/^(?:\.{0,2}\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(requested))
					return undefined;
				const url = moduleUrl(requested, this.#document, parent);
				let operation = requests.get(url.href);
				if (!operation) {
					const known = sources.get(url.href);
					if (known) return known;
					if (
						requests.size >= pageNetworkModuleLimits.fetches ||
						sources.size + reservations >= pageNetworkModuleLimits.sources
					)
						throw limited();
					reservations++;
					operation = load(url).finally(() => {
						reservations--;
					});
					requests.set(url.href, operation);
					void operation.catch(() => undefined);
				}
				const shared = awaitResult(operation, signal);
				return contextSignal === undefined
					? shared
					: awaitResult(shared, contextSignal);
			},
		});
	}
}
