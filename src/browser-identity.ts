export const browserIdentityLimits = Object.freeze({
	languages: 10,
	userAgentCodeUnits: 2048,
	languageTagCodeUnits: 64,
	headerCount: 128,
	headerBytes: 16 * 1024,
});

export interface BrowserIdentityOptions {
	userAgent?: string;
	languages?: readonly string[];
}

export interface BrowserIdentity {
	readonly userAgent: string;
	readonly language: string;
	readonly languages: readonly string[];
	readonly acceptLanguage: string;
}

const identities = new WeakSet<object>();
const encoder = new TextEncoder();

function requireRecord(value: unknown): asserts value is object {
	if (
		value === null ||
		typeof value !== "object" ||
		(Object.getPrototypeOf(value) !== Object.prototype &&
			Object.getPrototypeOf(value) !== null)
	)
		throw new TypeError("Expected an own-data record");
}

function ownData(value: object, key: PropertyKey): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (!descriptor || !("value" in descriptor))
		throw new TypeError("Expected an own-data property");
	return descriptor.value;
}

function makeIdentity(
	languages: readonly string[],
	userAgent = "AgentBrowser/0.1",
): Readonly<BrowserIdentity> {
	const copied = Object.freeze([...languages]);
	const identity: Readonly<BrowserIdentity> = Object.freeze({
		userAgent,
		language: copied[0],
		languages: copied,
		acceptLanguage: copied
			.map((language, index) =>
				index === 0 ? language : `${language};q=0.${10 - index}`,
			)
			.join(", "),
	});
	identities.add(identity);
	return identity;
}

export const defaultBrowserIdentity = makeIdentity(["en-US"]);

export function createBrowserIdentity(
	options?: BrowserIdentityOptions,
): Readonly<BrowserIdentity> {
	if (options === undefined) return defaultBrowserIdentity;
	requireRecord(options);
	const optionKeys = Reflect.ownKeys(options);
	if (
		optionKeys.length > 2 ||
		optionKeys.some((key) => key !== "languages" && key !== "userAgent")
	)
		throw new TypeError("Only languages and userAgent may be configured");
	const configuredUserAgent = optionKeys.includes("userAgent")
		? ownData(options, "userAgent")
		: undefined;
	const userAgent = configuredUserAgent ?? defaultBrowserIdentity.userAgent;
	if (
		configuredUserAgent === null ||
		typeof userAgent !== "string" ||
		userAgent.length < 1 ||
		userAgent.length > browserIdentityLimits.userAgentCodeUnits ||
		!/^[\x20-\x7e]+$/.test(userAgent) ||
		userAgent.trim() !== userAgent
	)
		throw new TypeError("Invalid or oversized user agent");
	const input = optionKeys.includes("languages")
		? ownData(options, "languages")
		: undefined;
	if (input === undefined)
		return userAgent === defaultBrowserIdentity.userAgent
			? defaultBrowserIdentity
			: makeIdentity(defaultBrowserIdentity.languages, userAgent);
	if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype)
		throw new TypeError("Expected a language array");
	const length = ownData(input, "length");
	if (
		typeof length !== "number" ||
		!Number.isInteger(length) ||
		length < 1 ||
		length > browserIdentityLimits.languages
	)
		throw new TypeError("Language count is out of bounds");
	const keys = Reflect.ownKeys(input);
	if (keys.length !== length + 1)
		throw new TypeError(
			"Language array must be dense with no extra properties",
		);
	const copied: string[] = [];
	for (let index = 0; index < length; index++) {
		const language = ownData(input, String(index));
		if (
			typeof language !== "string" ||
			language.length < 1 ||
			language.length > browserIdentityLimits.languageTagCodeUnits ||
			!/^[A-Za-z0-9-]+$/.test(language)
		)
			throw new TypeError("Invalid or oversized language tag");
		copied.push(language);
	}
	const canonical = Intl.getCanonicalLocales(copied);
	if (
		canonical.length !== copied.length ||
		canonical.some(
			(language) =>
				language.length > browserIdentityLimits.languageTagCodeUnits,
		)
	)
		throw new TypeError("Duplicate or oversized canonical language tag");
	return makeIdentity(canonical, userAgent);
}

export function browserIdentityHeaders(
	identity: Readonly<BrowserIdentity>,
	headers?: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
	if (!identities.has(identity))
		throw new TypeError("Expected an identity created by this module");
	const result: Record<string, string> = Object.create(null);
	const names = new Set<string>();
	let bytes = 0;
	function append(name: string, value: unknown): void {
		if (
			!name.length ||
			typeof value !== "string" ||
			name.length + value.length + 4 > browserIdentityLimits.headerBytes ||
			/[\r\n\0]/.test(name) ||
			/[\r\n\0]/.test(value)
		)
			throw new TypeError("Invalid or oversized identity request header");
		const normalized = name.toLowerCase();
		if (names.has(normalized))
			throw new TypeError("Duplicate case-insensitive request header");
		bytes +=
			encoder.encode(name).byteLength + encoder.encode(value).byteLength + 4;
		if (
			names.size >= browserIdentityLimits.headerCount ||
			bytes > browserIdentityLimits.headerBytes
		)
			throw new TypeError("Identity request header limits exceeded");
		names.add(normalized);
		result[name] = value;
	}
	if (headers !== undefined) {
		requireRecord(headers);
		const keys = Reflect.ownKeys(headers);
		if (keys.length > browserIdentityLimits.headerCount)
			throw new TypeError("Too many identity request headers");
		for (const key of keys) {
			if (typeof key !== "string")
				throw new TypeError("Header names must be strings");
			append(key, ownData(headers, key));
		}
	}
	if (!names.has("user-agent")) append("User-Agent", identity.userAgent);
	if (!names.has("accept-language"))
		append("Accept-Language", identity.acceptLanguage);
	return Object.freeze(result);
}
