export const publicSuffixLimits = Object.freeze({
	maxSourceCodeUnits: 2_097_152,
	maxRules: 100_000,
	maxRuleCodeUnits: 1024,
	maxDomainCodeUnits: 1024,
	maxLabelCodeUnits: 256,
	maxLabels: 127,
	maxAsciiLabelBytes: 63,
	maxAsciiDomainBytes: 253,
});

export type PublicSuffixRuleType =
	| "exact"
	| "wildcard"
	| "exception"
	| "default";

export interface PublicSuffixResult {
	readonly domain: string;
	readonly publicSuffix: string;
	readonly registrableDomain: string | null;
	readonly rule: string;
	readonly ruleType: PublicSuffixRuleType;
}

export interface PublicSuffixMatcher {
	readonly ruleCount: number;
	readonly match: (domain: string) => PublicSuffixResult;
}

function canonicalDomain(input: string) {
	if (typeof input !== "string" || !input.length)
		throw new TypeError("Expected a nonempty domain string");
	if (input.length > publicSuffixLimits.maxDomainCodeUnits)
		throw new RangeError("Domain source limit exceeded");
	if (/[\s%:/\\?#@\[\]*!]/u.test(input))
		throw new TypeError("Invalid domain syntax");
	for (let index = 0; index < input.length; index++) {
		const code = input.charCodeAt(index);
		if (code < 32 || (code >= 127 && code <= 159))
			throw new TypeError("Invalid domain control character");
	}
	const mapped = input.replace(/[\u3002\uff0e\uff61]/gu, ".");
	const rooted = mapped.endsWith(".");
	const unrooted = rooted ? mapped.slice(0, -1) : mapped;
	const rawLabels = unrooted.split(".");
	if (rawLabels.length > publicSuffixLimits.maxLabels)
		throw new RangeError("Domain label count limit exceeded");
	for (const label of rawLabels) {
		if (!label.length) throw new TypeError("Empty domain label");
		if (label.length > publicSuffixLimits.maxLabelCodeUnits)
			throw new RangeError("Domain label source limit exceeded");
	}
	let host: string;
	try {
		host = new URL(`https://${mapped}/`).hostname;
	} catch {
		throw new TypeError("Invalid domain or IDNA encoding");
	}
	if (/^[0-9]+(?:\.[0-9]+){3}\.?$/.test(host))
		throw new TypeError("IP addresses are not domains");
	const name = rooted ? host.slice(0, -1) : host;
	if (name.length > publicSuffixLimits.maxAsciiDomainBytes)
		throw new RangeError("Canonical domain length limit exceeded");
	const labels = name.split(".");
	if (labels.length !== rawLabels.length)
		throw new TypeError("IDNA changed domain label structure");
	for (const label of labels) {
		if (label.length > publicSuffixLimits.maxAsciiLabelBytes)
			throw new RangeError("Canonical domain label limit exceeded");
		if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
			throw new TypeError("Invalid canonical domain label");
	}
	return { name, labels, rooted };
}

export function createPublicSuffixMatcher(
	trustedSource: string,
): PublicSuffixMatcher {
	if (typeof trustedSource !== "string")
		throw new TypeError("Expected trusted PSL text");
	if (trustedSource.length > publicSuffixLimits.maxSourceCodeUnits)
		throw new RangeError("PSL source limit exceeded");
	const exact = new Set<string>();
	const wildcard = new Set<string>();
	const exceptions = new Set<string>();
	let ruleCount = 0;
	let offset = trustedSource.startsWith("\ufeff") ? 1 : 0;
	while (offset < trustedSource.length) {
		const newline = trustedSource.indexOf("\n", offset);
		const end = newline < 0 ? trustedSource.length : newline;
		const line = trustedSource.slice(offset, end);
		offset = end + 1;
		if (/^\s*$/.test(line) || line.startsWith("//")) continue;
		const whitespace = line.search(/\s/u);
		const token = whitespace < 0 ? line : line.slice(0, whitespace);
		if (!token) throw new TypeError("Indented PSL rule or comment");
		if (token.length > publicSuffixLimits.maxRuleCodeUnits)
			throw new RangeError("PSL rule source limit exceeded");
		if (ruleCount >= publicSuffixLimits.maxRules)
			throw new RangeError("PSL rule count limit exceeded");
		let rules = exact;
		let name: string;
		if (token === "*") {
			rules = wildcard;
			name = "";
		} else {
			const isWildcard = token.startsWith("*.");
			const isException = token.startsWith("!");
			const body = token.slice(isWildcard ? 2 : isException ? 1 : 0);
			if (body.endsWith(".") || /[\u3002\uff0e\uff61]/u.test(body))
				throw new TypeError("PSL rules require unrooted ASCII dot syntax");
			const canonical = canonicalDomain(body);
			name = canonical.name;
			if (isWildcard) {
				if (
					canonical.labels.length + 1 > publicSuffixLimits.maxLabels ||
					name.length + 2 > publicSuffixLimits.maxAsciiDomainBytes
				)
					throw new RangeError("Wildcard rule domain limit exceeded");
				rules = wildcard;
			} else if (isException) {
				if (canonical.labels.length < 2)
					throw new TypeError("Exception requires a parent suffix");
				rules = exceptions;
			}
		}
		if (rules.has(name)) throw new TypeError("Duplicate canonical PSL rule");
		rules.add(name);
		ruleCount++;
	}
	if (!ruleCount) throw new TypeError("PSL text contains no rules");
	for (const exception of exceptions) {
		let suffix = exception.slice(exception.indexOf(".") + 1);
		if (!wildcard.has(suffix))
			throw new TypeError("Exception requires its corresponding wildcard");
		while (suffix) {
			if (exceptions.has(suffix))
				throw new TypeError("Overlapping PSL exceptions are ambiguous");
			const separator = suffix.indexOf(".");
			suffix = separator < 0 ? "" : suffix.slice(separator + 1);
		}
	}
	const match = Object.freeze((domain: string): PublicSuffixResult => {
		const { name, labels, rooted } = canonicalDomain(domain);
		let suffixLabels = 1;
		let rule = "*";
		let ruleType: PublicSuffixRuleType = wildcard.has("")
			? "wildcard"
			: "default";
		let suffix = "";
		for (let index = labels.length - 1; index >= 0; index--) {
			const candidate = suffix ? `${labels[index]}.${suffix}` : labels[index];
			const count = labels.length - index;
			if (exceptions.has(candidate)) {
				suffixLabels = count - 1;
				rule = `!${candidate}`;
				ruleType = "exception";
				break;
			}
			if (exact.has(candidate)) {
				suffixLabels = count;
				rule = candidate;
				ruleType = "exact";
			} else if (wildcard.has(suffix)) {
				suffixLabels = count;
				rule = suffix ? `*.${suffix}` : "*";
				ruleType = "wildcard";
			}
			suffix = candidate;
		}
		const root = rooted ? "." : "";
		return Object.freeze({
			domain: name + root,
			publicSuffix: labels.slice(-suffixLabels).join(".") + root,
			registrableDomain:
				labels.length > suffixLabels
					? labels.slice(-suffixLabels - 1).join(".") + root
					: null,
			rule,
			ruleType,
		});
	});
	return Object.freeze({ ruleCount, match });
}
