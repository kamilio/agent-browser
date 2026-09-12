import { AgentBrowserError } from "./errors.js";

const maxPolicyUnits = 32768;
const maxPolicies = 64;
const maxDirectives = 1024;
const maxSources = 4096;
const maxUrlUnits = 4096;
const maxMatchWork = 262144;
const asciiWhitespace = /[\t\n\f\r ]+/;
const asciiEdges = /^[\t\n\f\r ]+|[\t\n\f\r ]+$/g;
const hostExpression =
	/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?)(?::(\*|[0-9]+))?(\/.*)?$/i;
const absolutePath =
	/^\/(?:[a-z0-9._~!$&'()*+=:@%-][a-z0-9._~!$&'()*+=:@%/-]*)?$/i;

type Source =
	| { readonly kind: "wildcard" | "self" }
	| { readonly kind: "scheme"; readonly scheme: string }
	| {
			readonly kind: "host";
			readonly scheme: string | undefined;
			readonly host: string;
			readonly port: number | "*" | null;
			readonly path: readonly string[];
			readonly exact: boolean;
			readonly pathLength: number;
			readonly cost: number;
	  };

type Origin = {
	readonly serialized: string;
	readonly scheme: string;
	readonly host: string;
	readonly port: string;
};

function limit(message: string): never {
	throw new AgentBrowserError("resource-limit", message);
}

function parseUrl(value: string): URL {
	if (typeof value !== "string")
		throw new AgentBrowserError("invalid-input", "CSP URL must be a string");
	if (value.length > maxUrlUnits) limit("CSP URL exceeds the length limit");
	try {
		const parsed = new URL(value);
		if (parsed.href.length > maxUrlUnits)
			limit("Normalized CSP URL exceeds the length limit");
		return parsed;
	} catch (error) {
		if (error instanceof AgentBrowserError) throw error;
		throw new AgentBrowserError("invalid-input", "CSP URL must be absolute");
	}
}

function decodeSegment(segment: string): string {
	return segment.replace(/%([0-9a-f]{2})/gi, (_, digits: string) =>
		String.fromCharCode(Number.parseInt(digits, 16)),
	);
}

function compileSource(expression: string): Source | undefined {
	const folded = expression.toLowerCase();
	if (folded === "'self'") return Object.freeze({ kind: "self" });
	if (expression === "*") return Object.freeze({ kind: "wildcard" });
	if (/^[a-z][a-z0-9+.-]*:$/i.test(expression))
		return Object.freeze({ kind: "scheme", scheme: folded.slice(0, -1) });
	const parts = hostExpression.exec(expression);
	if (!parts) return undefined;
	const path = parts[4] ?? "";
	if (path && (!absolutePath.test(path) || /%(?![0-9a-f]{2})/i.test(path)))
		return undefined;
	const port =
		parts[3] === undefined ? null : parts[3] === "*" ? "*" : Number(parts[3]);
	const segments = path ? path.split("/") : [];
	const exact = !path.endsWith("/");
	const pathLength = segments.length;
	if (path && !exact) segments.pop();
	return Object.freeze({
		kind: "host",
		scheme: parts[1]?.toLowerCase(),
		host: parts[2].toLowerCase(),
		port,
		path: Object.freeze(segments.map(decodeSegment)),
		exact,
		pathLength,
		cost: expression.length,
	});
}

function schemeMatches(source: string, target: string): boolean {
	return (
		source === target ||
		(source === "http" && target === "https") ||
		(source === "ws" &&
			(target === "wss" || target === "http" || target === "https")) ||
		(source === "wss" && target === "https")
	);
}

export class ImageContentSecurityPolicy {
	readonly policyCount: number;
	readonly #origin: Origin | undefined;
	readonly #policies: readonly (readonly Source[])[];

	constructor(documentUrl: string, headerValues: readonly string[]) {
		const document = parseUrl(documentUrl);
		if (!Array.isArray(headerValues))
			throw new AgentBrowserError(
				"invalid-input",
				"CSP headers must be an array",
			);
		if (headerValues.length > maxPolicies) limit("Too many CSP headers");
		if (document.origin !== "null") {
			const origin = new URL(document.origin);
			this.#origin = Object.freeze({
				serialized: origin.origin,
				scheme: origin.protocol.slice(0, -1),
				host: origin.hostname,
				port: origin.port,
			});
		}
		let units = 0;
		let policyTokens = 0;
		let directives = 0;
		let sources = 0;
		let policyCount = 0;
		const policies: (readonly Source[])[] = [];
		for (const header of headerValues) {
			if (typeof header !== "string")
				throw new AgentBrowserError(
					"invalid-input",
					"CSP header must be a string",
				);
			units += header.length;
			if (units > maxPolicyUnits) limit("CSP headers exceed the length limit");
			for (const serialized of header.split(",")) {
				if (++policyTokens > maxPolicies) limit("Too many CSP policies");
				const names = new Set<string>();
				let images: readonly Source[] | undefined;
				let fallback: readonly Source[] | undefined;
				for (const token of serialized.split(";")) {
					if (++directives > maxDirectives) limit("Too many CSP directives");
					const directive = token.replace(asciiEdges, "");
					if (!directive) continue;
					const [rawName, ...values] = directive.split(asciiWhitespace);
					sources += values.length;
					if (sources > maxSources) limit("Too many CSP source expressions");
					if (/[^\x00-\x7f]/.test(directive)) continue;
					const name = rawName.toLowerCase();
					if (names.has(name)) continue;
					names.add(name);
					if (name !== "img-src" && name !== "default-src") continue;
					const compiled: Source[] = [];
					for (const value of values) {
						const source = compileSource(value);
						if (source) compiled.push(source);
					}
					if (name === "img-src") images = Object.freeze(compiled);
					else fallback = Object.freeze(compiled);
				}
				if (names.size) policyCount++;
				const effective = images ?? fallback;
				if (effective) policies.push(effective);
			}
		}
		this.policyCount = policyCount;
		this.#policies = Object.freeze(policies);
		Object.freeze(this);
	}

	allows(url: string, redirectCount = 0): boolean {
		if (!Number.isSafeInteger(redirectCount) || redirectCount < 0)
			throw new AgentBrowserError(
				"invalid-input",
				"CSP redirect count must be a nonnegative safe integer",
			);
		const target = parseUrl(url);
		const scheme = target.protocol.slice(0, -1);
		if (scheme !== "http" && scheme !== "https") return false;
		const origin = this.#origin;
		const domain =
			!target.hostname.startsWith("[") &&
			!/^\d+\.\d+\.\d+\.\d+$/.test(target.hostname);
		const port = target.port ? Number(target.port) : null;
		let segments: string[] | undefined;
		let work = target.href.length;
		return this.#policies.every((policy) =>
			policy.some((source) => {
				work +=
					source.kind === "host"
						? source.cost + target.hostname.length + target.pathname.length
						: target.hostname.length + 1;
				if (work > maxMatchWork) limit("CSP matching work limit exceeded");
				if (source.kind === "wildcard") return true;
				if (source.kind === "self")
					return (
						origin !== undefined &&
						(origin.serialized === target.origin ||
							(origin.host === target.hostname &&
								origin.port === target.port &&
								(scheme === "https" ||
									(origin.scheme === "http" && scheme === "http"))))
					);
				if (source.kind === "scheme")
					return schemeMatches(source.scheme, scheme);
				if (source.kind !== "host") return false;
				const sourceScheme = source.scheme ?? origin?.scheme;
				if (!sourceScheme || !schemeMatches(sourceScheme, scheme) || !domain)
					return false;
				if (
					source.host !== "*" &&
					(source.host.startsWith("*.")
						? !target.hostname.endsWith(source.host.slice(1))
						: source.host !== target.hostname)
				)
					return false;
				if (
					source.port !== "*" &&
					source.port !== port &&
					!(port === null && source.port === (scheme === "https" ? 443 : 80))
				)
					return false;
				if (redirectCount !== 0 || source.pathLength === 0) return true;
				segments ??= target.pathname.split("/").map(decodeSegment);
				if (
					source.pathLength > segments.length ||
					(source.exact && source.pathLength !== segments.length)
				)
					return false;
				const targetSegments = segments;
				return source.path.every(
					(segment, index) => segment === targetSegments[index],
				);
			}),
		);
	}
}
