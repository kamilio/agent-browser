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
	allowsScript(request: ScriptCspRequest): boolean;
	allowsBase(absoluteUrl: string): boolean;
}

interface ScriptSources {
	readonly nonces: readonly string[];
	readonly unsafeInline: boolean;
	readonly strictDynamic: boolean;
}

interface Policy {
	readonly script?: ScriptSources;
	readonly base?: "none" | "self";
}

const enforcedHeader = "content-security-policy";
const nonceValue = /^[a-zA-Z0-9+/_-]+={0,2}$/;
const sourceDirectives = ["script-src-elem", "script-src", "default-src"];
const requestKeys = ["kind", "nonce", "parserInserted", "nonceable"];

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
): ScriptCspRequest | undefined {
	try {
		if (
			!plainRecord(value) ||
			Object.getOwnPropertySymbols(value).length ||
			Object.getOwnPropertyNames(value).length !== requestKeys.length
		)
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
		return { kind, nonce, parserInserted, nonceable };
	} catch {
		return undefined;
	}
}

export function createScriptCspPolicy(
	documentUrl: string,
	headers: unknown,
	limitOverrides: Partial<ScriptCspPolicyLimits> = {},
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
						issue("unsupported-directive", name);
						continue;
					}
					const nonces: string[] = [];
					let unsafeInline = false;
					let strictDynamic = false;
					for (const expression of expressions) {
						const folded = expression.toLowerCase();
						if (folded === "'none'") continue;
						if (folded === "'unsafe-inline'") unsafeInline = true;
						else if (folded === "'strict-dynamic'") strictDynamic = true;
						else if (
							folded.startsWith("'nonce-") &&
							expression.endsWith("'") &&
							nonceValue.test(expression.slice(7, -1))
						) {
							const nonce = expression.slice(7, -1);
							if (nonce.length > limits.maxNonceCodeUnits)
								throw new PolicyInputError("resource-limit");
							nonces.push(nonce);
						} else issue("unsupported-script-source", name);
					}
					scripts.set(
						name,
						Object.freeze({
							nonces: Object.freeze(nonces),
							unsafeInline: unsafeInline && !nonces.length && !strictDynamic,
							strictDynamic,
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
		allowsScript: Object.freeze((input: ScriptCspRequest): boolean => {
			if (unsupported) return false;
			const request = requestData(input, limits);
			if (!request) return false;
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
				if (
					!matchedNonce &&
					!(
						request.kind === "external" &&
						sources.strictDynamic &&
						!request.parserInserted
					) &&
					!(request.kind === "inline" && sources.unsafeInline)
				)
					return false;
			}
			return true;
		}),
		allowsBase: Object.freeze((absoluteUrl: string): boolean => {
			if (unsupported) return false;
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
