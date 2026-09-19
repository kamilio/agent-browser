import { createHash } from "node:crypto";
import type { FetchCredentials } from "./cors.js";
import type { DocumentScriptAdmission } from "./document-script-csp.js";
import { AgentBrowserError } from "./errors.js";
import {
	type HtmlModuleRequest,
	type HtmlModuleSource,
	moduleInputData,
} from "./html-module.js";
import { parseNetworkUrl } from "./network.js";
import {
	type PageSourceModule,
	pageSourceModuleLimits,
} from "./page-source-modules.js";
import type { ScriptFetchPolicy, ScriptFetchResult } from "./script-fetch.js";
import {
	type IntegrityAlgorithm,
	type IntegrityMetadata,
	parseIntegrityMetadata,
} from "./subresource-integrity.js";

export interface PageNetworkModuleEntry extends PageSourceModule {
	readonly baseUrl?: string;
}

export interface PageNetworkModuleOptions {
	readonly documentUrl: string;
	readonly entries: readonly PageNetworkModuleEntry[];
	readonly fetchWithPolicy: (
		url: string,
		policy: ScriptFetchPolicy,
		signal: AbortSignal,
		admission?: DocumentScriptAdmission,
	) => Promise<Readonly<ScriptFetchResult>>;
	readonly credentials?: FetchCredentials;
	readonly htmlEntries?: boolean;
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
	return moduleInputData(record, key, optional);
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
	return new Promise((resolve, reject) => {
		const cancel = () => reject(aborted());
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
		checkSignal(signal);
		signal.addEventListener("abort", cancel, { once: true });
		if (signal.aborted) cancel();
	});
}

function inlineIdentity(value: string): boolean {
	const match = /^urn:agent-browser:html-module:([1-9][0-9]*)$/.exec(value);
	return match !== null && Number.isSafeInteger(Number(match[1]));
}

function integrityDenied(): AgentBrowserError {
	return new AgentBrowserError(
		"policy-denied",
		"Module integrity verification failed",
	);
}

function checkAdmission(
	admission: DocumentScriptAdmission | undefined,
	url?: string,
	redirectCount?: number,
): void {
	if (admission === undefined) return;
	const allows = data(admission, "allows");
	if (typeof allows !== "function") throw invalid();
	if (Reflect.apply(allows, admission, [url, redirectCount]) !== true)
		throw new AgentBrowserError(
			"policy-denied",
			"Module Content Security Policy denied",
		);
}

type IntegrityDigests = Readonly<Record<IntegrityAlgorithm, string>>;

function checkIntegrity(
	digests: IntegrityDigests | undefined,
	metadata: Readonly<IntegrityMetadata> | null,
): void {
	if (
		metadata &&
		(!digests || !metadata.values.includes(digests[metadata.algorithm]))
	)
		throw integrityDenied();
}

export class PageNetworkModuleRegistry {
	readonly #document: URL;
	readonly #entries = new Map<string, Readonly<PageSourceModule>>();
	readonly #entryBases = new Map<string, string>();
	readonly #fetch: PageNetworkModuleOptions["fetchWithPolicy"];
	readonly #policy: Readonly<ScriptFetchPolicy>;
	readonly #entryUnits: number;
	readonly #htmlEntries: boolean;

	constructor(options: PageNetworkModuleOptions) {
		const htmlEntries = data(options, "htmlEntries", true);
		if (htmlEntries !== undefined && typeof htmlEntries !== "boolean")
			throw invalid();
		this.#htmlEntries = htmlEntries === true;
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
			length < (this.#htmlEntries ? 0 : 1)
		)
			throw invalid();
		if (length > pageNetworkModuleLimits.sources) throw limited();
		let units = 0;
		for (let index = 0; index < length; index++) {
			const entry = data(entries, String(index));
			const identity = data(entry, "id");
			const id = moduleUrl(identity, this.#document).href;
			if (id !== identity || this.#entries.has(id)) throw invalid();
			const configuredBase = data(entry, "baseUrl", true);
			const base = configuredBase === undefined ? id : configuredBase;
			const baseUrl = moduleUrl(base, this.#document).href;
			if (baseUrl !== base) throw invalid();
			const source = text(
				data(entry, "source"),
				pageNetworkModuleLimits.sourceCodeUnits,
				true,
			);
			units += source.length;
			if (units > pageNetworkModuleLimits.totalSourceCodeUnits) throw limited();
			this.#entries.set(id, Object.freeze({ id, source }));
			this.#entryBases.set(id, baseUrl);
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
		const bases = new Map(this.#entryBases);
		const policies = new Map(
			Array.from(sources.keys(), (id) => [id, this.#policy] as const),
		);
		const digests = new Map<string, IntegrityDigests>();
		const admissions = new Map<string, DocumentScriptAdmission | undefined>();
		const paths = new Map<
			string,
			readonly { url: string; redirectCount: number }[]
		>();
		const requests = new Map<string, Promise<Readonly<PageSourceModule>>>();
		const waiters: { resolve(): void; reject(error: unknown): void }[] = [];
		const lifetime = new AbortController();
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
			if (closed) return;
			closed = true;
			signal.removeEventListener("abort", close);
			sources.clear();
			bases.clear();
			policies.clear();
			digests.clear();
			admissions.clear();
			paths.clear();
			requests.clear();
			for (const waiter of waiters.splice(0)) waiter.reject(aborted());
			lifetime.abort();
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
		const load = async (
			url: URL,
			policy: Readonly<ScriptFetchPolicy>,
			integrity: Readonly<IntegrityMetadata> | null,
			admission: DocumentScriptAdmission | undefined,
		): Promise<Readonly<PageSourceModule>> => {
			await acquire();
			try {
				live();
				checkAdmission(admission, url.href, 0);
				const fetchArguments: Parameters<
					PageNetworkModuleOptions["fetchWithPolicy"]
				> = [url.href, policy, lifetime.signal];
				if (admission !== undefined) fetchArguments[3] = admission;
				const operation = Reflect.apply(this.#fetch, undefined, fetchArguments);
				const result = await awaitResult(operation, lifetime.signal);
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
					!Array.isArray(response.redirects) ||
					response.redirects.length > 20
				)
					throw invalid();
				const path = [
					{ url: url.href, redirectCount: 0 },
					...response.redirects.map((redirect, redirectCount) => ({
						url: moduleUrl(redirect.url, this.#document).href,
						redirectCount,
					})),
					{ url: finalUrl.href, redirectCount: response.redirects.length },
				];
				for (const target of path)
					checkAdmission(admission, target.url, target.redirectCount);
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
				const id = url.href;
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
				const hashes = this.#htmlEntries
					? Object.freeze({
							sha256: createHash("sha256")
								.update(response.body)
								.digest("base64"),
							sha384: createHash("sha384")
								.update(response.body)
								.digest("base64"),
							sha512: createHash("sha512")
								.update(response.body)
								.digest("base64"),
						})
					: undefined;
				checkIntegrity(hashes, integrity);
				const value = Object.freeze({ id, source });
				units += source.length;
				sources.set(id, value);
				bases.set(id, finalUrl.href);
				policies.set(id, policy);
				admissions.set(id, admission);
				paths.set(id, path);
				if (hashes) digests.set(id, hashes);
				return value;
			} finally {
				release();
			}
		};
		const checkSourceAdmission = (
			id: string,
			admission: DocumentScriptAdmission | undefined,
		) => {
			if (inlineIdentity(id)) checkAdmission(admission);
			else {
				checkAdmission(admission, id, 0);
				for (const target of paths.get(id) ?? [])
					checkAdmission(admission, target.url, target.redirectCount);
			}
		};
		const request = (
			url: URL,
			policy: Readonly<ScriptFetchPolicy>,
			integrity: Readonly<IntegrityMetadata> | null = null,
			admission?: DocumentScriptAdmission,
		): Promise<Readonly<PageSourceModule>> => {
			checkSourceAdmission(url.href, admission);
			let operation = requests.get(url.href);
			if (!operation) {
				const known = sources.get(url.href);
				if (known) return Promise.resolve(known);
				if (
					requests.size >= pageNetworkModuleLimits.fetches ||
					sources.size + reservations >= pageNetworkModuleLimits.sources
				)
					throw limited();
				reservations++;
				operation = load(url, policy, integrity, admission).finally(() => {
					reservations--;
				});
				requests.set(url.href, operation);
				void operation.catch(() => undefined);
			}
			return operation.then((value) => {
				live();
				checkSourceAdmission(url.href, admission);
				return value;
			});
		};
		return Object.freeze({
			close,
			prepareHtmlModule: async (
				input: HtmlModuleRequest,
			): Promise<Readonly<HtmlModuleSource>> => {
				live();
				if (!this.#htmlEntries)
					throw new AgentBrowserError(
						"policy-denied",
						"HTML module entries are not enabled",
					);
				if (Array.isArray(input)) throw invalid();
				const caller = data(input, "signal");
				checkSignal(caller);
				const id = text(
					data(input, "id"),
					pageNetworkModuleLimits.identifierCodeUnits,
				);
				const sourceInput = data(input, "source", true);
				const source =
					sourceInput === undefined
						? undefined
						: text(sourceInput, maximum, true);
				const baseInput = data(input, "baseUrl");
				const base = moduleUrl(baseInput, this.#document).href;
				if (base !== baseInput) throw invalid();
				const credentials = data(input, "credentials");
				if (!["omit", "same-origin", "include"].includes(credentials as string))
					throw invalid();
				const policy: Readonly<ScriptFetchPolicy> = Object.freeze({
					mode: "cors",
					credentials: credentials as FetchCredentials,
				});
				const metadata = data(input, "integrity", true);
				const admission = data(input, "admission", true) as
					| DocumentScriptAdmission
					| undefined;
				const integrity = parseIntegrityMetadata(
					metadata === undefined ? "" : (metadata as string),
				);
				live();
				checkSignal(caller);
				if (resolutions++ >= pageNetworkModuleLimits.resolutions)
					throw limited();
				if (source !== undefined) {
					if (!inlineIdentity(id)) throw invalid();
					checkAdmission(admission);
					const known = sources.get(id);
					if (known) {
						if (
							known.source !== source ||
							bases.get(id) !== base ||
							policies.get(id)?.credentials !== credentials
						)
							throw invalid();
						return known;
					}
					if (
						sources.size + reservations >= pageNetworkModuleLimits.sources ||
						units + source.length > pageNetworkModuleLimits.totalSourceCodeUnits
					)
						throw limited();
					const value = Object.freeze({ id, source });
					units += source.length;
					sources.set(id, value);
					bases.set(id, base);
					policies.set(id, policy);
					admissions.set(id, admission);
					return value;
				}
				const url = moduleUrl(id, this.#document);
				if (url.href !== id) throw invalid();
				const operation = awaitResult(
					request(url, policy, integrity, admission),
					lifetime.signal,
				);
				const value = await awaitResult(operation, caller);
				live();
				checkSignal(caller);
				checkSourceAdmission(id, admission);
				checkIntegrity(digests.get(id), integrity);
				return value;
			},
			validateEntry: (source: string, filename: string | undefined): void => {
				live();
				const identity = text(
					filename,
					pageNetworkModuleLimits.identifierCodeUnits,
				);
				const id =
					this.#htmlEntries && inlineIdentity(identity)
						? identity
						: moduleUrl(identity, this.#document).href;
				if (
					id !== filename ||
					sources.get(id)?.source !== text(source, maximum, true)
				)
					throw invalid();
				checkSourceAdmission(id, admissions.get(id));
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
				const url = moduleUrl(requested, this.#document, bases.get(parent));
				const admission = admissions.get(parent);
				checkSourceAdmission(parent, admission);
				const operation = request(
					url,
					policies.get(parent) ?? this.#policy,
					null,
					admission,
				);
				const shared = awaitResult(operation, lifetime.signal);
				return contextSignal === undefined
					? shared
					: awaitResult(shared, contextSignal);
			},
		});
	}
}
