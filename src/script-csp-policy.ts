import { ContentSecurityPolicy } from "./content-security-policy.js";
import {
	type DocumentResourceCsp,
	documentResourceCsp,
} from "./document-resource-csp.js";
import type { DocumentTree } from "./document.js";

export interface ScriptCspPolicyLimits {
	readonly maxHeaderFields: number;
	readonly maxHeaderValues: number;
	readonly maxPolicyCodeUnits: number;
	readonly maxPolicies: number;
	readonly maxDirectives: number;
	readonly maxSources: number;
	readonly maxNonceCodeUnits: number;
	readonly maxUrlCodeUnits: number;
	readonly maxMatchWork: number;
}

export const scriptCspPolicyLimits: ScriptCspPolicyLimits = Object.freeze({
	maxHeaderFields: 64,
	maxHeaderValues: 64,
	maxPolicyCodeUnits: 32768,
	maxPolicies: 64,
	maxDirectives: 1024,
	maxSources: 4096,
	maxNonceCodeUnits: 1024,
	maxUrlCodeUnits: 4096,
	maxMatchWork: 262144,
});

export interface ScriptCspRequest {
	readonly kind: "inline" | "external";
	readonly nonce: string;
	readonly parserInserted: boolean;
	readonly nonceable: boolean;
	readonly url?: string;
	readonly redirectCount?: number;
}

export interface ScriptCspIssue {
	readonly code:
		| "invalid-headers"
		| "invalid-limits"
		| "invalid-document-url"
		| "invalid-policy"
		| "resource-limit"
		| "unsupported-directive"
		| "unsupported-script-source"
		| "unsupported-base-source";
	readonly directive?: string;
}

export interface ScriptCspPolicy {
	readonly scope: "script-elements-and-base";
	readonly unsupported: boolean;
	readonly issues: readonly ScriptCspIssue[];
	readonly policyCount: number;
	readonly stringCompilation: "allow" | "deny";
	allowsScript(request: ScriptCspRequest): boolean;
	allowsBase(absoluteUrl: string): boolean;
}

interface ScriptSources {
	readonly nonces: readonly string[];
	readonly unsafeInline: boolean;
	readonly strictDynamic: boolean;
	readonly unsafeEval: boolean;
	readonly urls?: ContentSecurityPolicy;
	readonly urlCount: number;
	readonly urlCost: number;
}

interface Policy {
	readonly script?: ScriptSources;
	readonly base?: "none" | "self";
	readonly stringCompilation: "allow" | "deny";
}

interface ScriptRequestData extends ScriptCspRequest {
	readonly target?: URL;
	readonly redirectCount: number;
}

const enforcedHeader = "content-security-policy";
const nonceValue = /^[a-zA-Z0-9+/_-]+={0,2}$/;
const sourceDirectives = ["script-src-elem", "script-src", "default-src"];
const requestKeys = ["kind", "nonce", "parserInserted", "nonceable"];
const hostSource =
	/^(?:(https?):\/\/)?(\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?)(?::(\*|[0-9]+))?(\/[a-z0-9._~!$&'()*+=:@%/-]*)?$/i;

function validUrlSource(expression: string): boolean {
	if (expression.toLowerCase() === "'self'" || expression === "*") return true;
	if (/^(?:https?|blob):$/i.test(expression)) return true;
	const parts = hostSource.exec(expression);
	if (!parts || /^(?:[0-9]+\.){3}[0-9]+\.?$/.test(parts[2])) return false;
	if (parts[4] && /%(?![0-9a-f]{2})/i.test(parts[4])) return false;
	return (
		parts[3] === undefined || parts[3] === "*" || Number(parts[3]) <= 65535
	);
}

class PolicyInputError extends Error {
	constructor(readonly code: ScriptCspIssue["code"]) {
		super(code);
	}
}

function plainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.prototype;
}

function dataValue(object: object, name: string): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(object, name);
	if (!descriptor || !Object.hasOwn(descriptor, "value"))
		throw new PolicyInputError("invalid-headers");
	return descriptor.value;
}

function limitsFrom(value: unknown): ScriptCspPolicyLimits {
	try {
		if (!plainRecord(value) || Object.getOwnPropertySymbols(value).length)
			throw new Error();
		const names = Object.getOwnPropertyNames(value);
		if (names.length > Object.keys(scriptCspPolicyLimits).length)
			throw new Error();
		const limits = { ...scriptCspPolicyLimits };
		for (const name of names) {
			if (!Object.hasOwn(limits, name)) throw new Error();
			const bound = name as keyof ScriptCspPolicyLimits;
			const limit = dataValue(value, name);
			if (
				typeof limit !== "number" ||
				!Number.isSafeInteger(limit) ||
				limit < 1 ||
				limit > scriptCspPolicyLimits[bound]
			)
				throw new Error();
			limits[bound] = limit;
		}
		return Object.freeze(limits);
	} catch {
		throw new PolicyInputError("invalid-limits");
	}
}

function networkUrl(value: unknown, maxCodeUnits: number): URL | undefined {
	if (typeof value !== "string" || value.length > maxCodeUnits)
		return undefined;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code <= 32 || code === 127) return undefined;
	}
	try {
		const url = new URL(value);
		if (
			(url.protocol !== "http:" && url.protocol !== "https:") ||
			url.username ||
			url.password ||
			url.href.length > maxCodeUnits
		)
			return undefined;
		return url;
	} catch {
		return undefined;
	}
}

function headerValues(
	headers: unknown,
	limits: ScriptCspPolicyLimits,
): string[] {
	if (!plainRecord(headers)) throw new PolicyInputError("invalid-headers");
	if (enforcedHeader in headers && !Object.hasOwn(headers, enforcedHeader))
		throw new PolicyInputError("invalid-headers");
	const names = Object.getOwnPropertyNames(headers);
	if (names.length > limits.maxHeaderFields)
		throw new PolicyInputError("resource-limit");
	const values: string[] = [];
	let units = 0;
	for (const name of names) {
		if (
			name.length !== enforcedHeader.length ||
			name.toLowerCase() !== enforcedHeader
		)
			continue;
		const entries = dataValue(headers, name);
		if (!Array.isArray(entries)) throw new PolicyInputError("invalid-headers");
		const length = dataValue(entries, "length");
		if (
			typeof length !== "number" ||
			!Number.isSafeInteger(length) ||
			length < 1
		)
			throw new PolicyInputError("invalid-headers");
		if (length > limits.maxHeaderValues - values.length)
			throw new PolicyInputError("resource-limit");
		for (let index = 0; index < length; index++) {
			const value = dataValue(entries, String(index));
			if (typeof value !== "string")
				throw new PolicyInputError("invalid-headers");
			units += value.length;
			if (units > limits.maxPolicyCodeUnits)
				throw new PolicyInputError("resource-limit");
			values.push(value);
		}
	}
	return values;
}

function requestData(
	value: unknown,
	limits: ScriptCspPolicyLimits,
): ScriptRequestData | undefined {
	try {
		if (!plainRecord(value) || Object.getOwnPropertySymbols(value).length)
			return undefined;
		const count = Object.getOwnPropertyNames(value).length;
		if (count !== requestKeys.length && count !== requestKeys.length + 2)
			return undefined;
		const kind = dataValue(value, "kind");
		const nonce = dataValue(value, "nonce");
		const parserInserted = dataValue(value, "parserInserted");
		const nonceable = dataValue(value, "nonceable");
		if (
			(kind !== "inline" && kind !== "external") ||
			typeof nonce !== "string" ||
			nonce.length > limits.maxNonceCodeUnits ||
			(nonce !== "" && !nonceValue.test(nonce)) ||
			typeof parserInserted !== "boolean" ||
			typeof nonceable !== "boolean"
		)
			return undefined;
		let target: URL | undefined;
		let redirectCount = 0;
		if (count !== requestKeys.length) {
			if (kind !== "external") return undefined;
			target = networkUrl(dataValue(value, "url"), limits.maxUrlCodeUnits);
			const redirects = dataValue(value, "redirectCount");
			if (
				!target ||
				typeof redirects !== "number" ||
				!Number.isSafeInteger(redirects) ||
				redirects < 0
			)
				return undefined;
			redirectCount = redirects;
		}
		return { kind, nonce, parserInserted, nonceable, target, redirectCount };
	} catch {
		return undefined;
	}
}

export function createScriptCspPolicy(
	documentUrl: string,
	headers: unknown,
	limitOverrides: Partial<ScriptCspPolicyLimits> = {},
): ScriptCspPolicy {
	return compileScriptCspPolicy(documentUrl, headers, limitOverrides);
}

export function createNativeDocumentScriptCspPolicy(
	tree: DocumentTree,
	headers: unknown,
	topLevelDocument = false,
): ScriptCspPolicy {
	const resource = documentResourceCsp(tree);
	return compileScriptCspPolicy(
		tree.url,
		headers,
		{},
		resource?.matches(headers) ? resource : undefined,
		topLevelDocument === true,
	);
}

function compileScriptCspPolicy(
	documentUrl: string,
	headers: unknown,
	limitOverrides: Partial<ScriptCspPolicyLimits>,
	resource?: DocumentResourceCsp,
	topLevelDocument = false,
): ScriptCspPolicy {
	const issues: ScriptCspIssue[] = [];
	const policies: Policy[] = [];
	let limits = scriptCspPolicyLimits;
	let origin = "";
	const issue = (code: ScriptCspIssue["code"], directive?: string) => {
		if (
			!issues.some(
				(entry) => entry.code === code && entry.directive === directive,
			)
		)
			issues.push(Object.freeze({ code, ...(directive ? { directive } : {}) }));
	};
	try {
		limits = limitsFrom(limitOverrides);
		const document = networkUrl(documentUrl, limits.maxUrlCodeUnits);
		if (!document) throw new PolicyInputError("invalid-document-url");
		origin = document.origin;
		const values = headerValues(headers, limits);
		let directives = 0;
		let sources = 0;
		for (const value of values) {
			for (let index = 0; index < value.length; index++) {
				const code = value.charCodeAt(index);
				if ((code < 32 && code !== 9) || code === 127 || code > 255)
					throw new PolicyInputError("invalid-policy");
			}
			for (const serialized of value.split(",")) {
				if (policies.length >= limits.maxPolicies)
					throw new PolicyInputError("resource-limit");
				const names = new Set<string>();
				const scripts = new Map<string, ScriptSources>();
				let base: Policy["base"];
				for (const token of serialized.split(";")) {
					if (++directives > limits.maxDirectives)
						throw new PolicyInputError("resource-limit");
					const directive = token.replace(/^[\t ]+|[\t ]+$/g, "");
					if (!directive) continue;
					const [rawName, ...expressions] = directive.split(/[\t ]+/);
					sources += expressions.length;
					if (sources > limits.maxSources)
						throw new PolicyInputError("resource-limit");
					if (!/^[a-zA-Z0-9-]+$/.test(rawName))
						throw new PolicyInputError("invalid-policy");
					const name = rawName.toLowerCase();
					if (names.has(name)) continue;
					names.add(name);
					if (name === "report-uri" || name === "report-to") continue;
					if (name === "frame-ancestors" && topLevelDocument === true) continue;
					if (name === "base-uri") {
						base = "none";
						for (const expression of expressions) {
							const folded = expression.toLowerCase();
							if (folded === "'self'") base = "self";
							else if (folded !== "'none'")
								issue("unsupported-base-source", name);
						}
						continue;
					}
					if (!sourceDirectives.includes(name)) {
						if (resource?.supportsDirective(name)) continue;
						issue("unsupported-directive", name);
						continue;
					}
					const nonces: string[] = [];
					const urls: string[] = [];
					let urlCost = 0;
					let unsafeInline = false;
					let strictDynamic = false;
					let unsafeEval = false;
					for (const expression of expressions) {
						const folded = expression.toLowerCase();
						if (folded === "'none'" || folded === "'wasm-unsafe-eval'")
							continue;
						if (folded === "'unsafe-inline'") unsafeInline = true;
						else if (folded === "'strict-dynamic'") strictDynamic = true;
						else if (folded === "'unsafe-eval'") unsafeEval = true;
						else if (
							folded.startsWith("'nonce-") &&
							expression.endsWith("'") &&
							nonceValue.test(expression.slice(7, -1))
						) {
							const nonce = expression.slice(7, -1);
							if (nonce.length > limits.maxNonceCodeUnits)
								throw new PolicyInputError("resource-limit");
							nonces.push(nonce);
						} else if (validUrlSource(expression)) {
							if (expression.length > limits.maxUrlCodeUnits)
								throw new PolicyInputError("resource-limit");
							urls.push(expression);
							urlCost += expression.length;
						} else issue("unsupported-script-source", name);
					}
					scripts.set(
						name,
						Object.freeze({
							nonces: Object.freeze(nonces),
							unsafeInline: unsafeInline && !nonces.length && !strictDynamic,
							strictDynamic,
							unsafeEval,
							urls: urls.length
								? new ContentSecurityPolicy(
										document.href,
										[`img-src ${urls.join(" ")}`],
										"image",
									)
								: undefined,
							urlCount: urls.length,
							urlCost,
						}),
					);
				}
				policies.push(
					Object.freeze({
						script:
							scripts.get("script-src-elem") ??
							scripts.get("script-src") ??
							scripts.get("default-src"),
						base,
						stringCompilation:
							(scripts.get("script-src") ?? scripts.get("default-src"))
								?.unsafeEval === false
								? "deny"
								: "allow",
					}),
				);
			}
		}
	} catch (error) {
		issue(error instanceof PolicyInputError ? error.code : "invalid-headers");
	}
	const unsupported = issues.length !== 0;
	Object.freeze(policies);
	return Object.freeze({
		scope: "script-elements-and-base" as const,
		unsupported,
		issues: Object.freeze(issues),
		policyCount: policies.length,
		stringCompilation:
			!unsupported &&
			policies.every((policy) => policy.stringCompilation === "allow")
				? ("allow" as const)
				: ("deny" as const),
		allowsScript: Object.freeze((input: ScriptCspRequest): boolean => {
			if (unsupported || (resource && !resource.active)) return false;
			const request = requestData(input, limits);
			if (!request) return false;
			if (resource && request.target) {
				try {
					resource.check("script", request.target.href, request.redirectCount);
				} catch {
					return false;
				}
			}
			let work = 0;
			for (const policy of policies) {
				if (++work > limits.maxMatchWork) return false;
				const sources = policy.script;
				if (!sources) continue;
				let matchedNonce = false;
				if (request.nonceable && request.nonce !== "")
					for (const nonce of sources.nonces) {
						work += nonce.length + request.nonce.length;
						if (work > limits.maxMatchWork) return false;
						if (nonce === request.nonce) {
							matchedNonce = true;
							break;
						}
					}
				if (matchedNonce) continue;
				if (request.kind === "inline") {
					if (!sources.unsafeInline) return false;
					continue;
				}
				if (sources.strictDynamic) {
					if (request.parserInserted) return false;
					continue;
				}
				const target = request.target;
				if (!target || !sources.urls) return false;
				work +=
					target.href.length +
					sources.urlCost +
					sources.urlCount *
						(target.hostname.length + target.pathname.length + 1);
				if (work > limits.maxMatchWork) return false;
				try {
					if (!sources.urls.allows(target.href, request.redirectCount))
						return false;
				} catch {
					return false;
				}
			}
			return true;
		}),
		allowsBase: Object.freeze((absoluteUrl: string): boolean => {
			if (unsupported || (resource && !resource.active)) return false;
			const base = networkUrl(absoluteUrl, limits.maxUrlCodeUnits);
			if (!base) return false;
			let work = 0;
			for (const policy of policies) {
				if (++work > limits.maxMatchWork) return false;
				if (policy.base === undefined) continue;
				work += origin.length + base.origin.length;
				if (
					work > limits.maxMatchWork ||
					policy.base === "none" ||
					base.origin !== origin
				)
					return false;
			}
			return true;
		}),
	});
}
