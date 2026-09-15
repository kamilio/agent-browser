export interface BrowserChallengeResponse {
	readonly status: number;
	readonly headers: Readonly<Record<string, string | readonly string[]>>;
	readonly url?: string;
	readonly title?: string;
	readonly text?: string;
}

export interface BrowserChallengeDiagnostic {
	readonly kind: "challenge" | "login" | "access-denied";
	readonly provider: "cloudflare" | "unspecified";
	readonly confidence: "confirmed" | "possible";
	readonly evidence: readonly (
		| "cf-mitigated-challenge"
		| "html-challenge-markers"
		| "html-login-markers"
		| "login-url-and-html-markers"
		| "html-network-security-block"
	)[];
	readonly action: "stop-and-request-user-handoff";
	readonly retryAfterSeconds?: number;
}

const maxHeaderNames = 128;
const maxHeaderValues = 256;
const maxHeaderUnits = 16_384;

function ownValue(object: object, name: string): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(object, name);
	return descriptor && Object.hasOwn(descriptor, "value")
		? descriptor.value
		: undefined;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function validHeaderValue(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 4096) return false;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if ((code < 32 && code !== 9) || code === 127 || code > 255) return false;
	}
	return true;
}

function readHeaders(value: unknown): Map<string, string[]> | null {
	if (!plainRecord(value)) return null;
	const names = Reflect.ownKeys(value);
	if (names.length > maxHeaderNames) return null;
	const headers = new Map<string, string[]>();
	let units = 0;
	let count = 0;
	for (const name of names) {
		if (
			typeof name !== "string" ||
			name.length > 128 ||
			!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
		)
			return null;
		const entry = ownValue(value, name);
		const values: unknown[] = [];
		if (typeof entry === "string") values.push(entry);
		else if (Array.isArray(entry)) {
			const length = ownValue(entry, "length");
			if (typeof length !== "number" || length < 1 || length > 16) return null;
			for (let index = 0; index < length; index++)
				values.push(ownValue(entry, String(index)));
		} else return null;
		const key = name.toLowerCase();
		for (const item of values) {
			if (!validHeaderValue(item)) return null;
			units += name.length + item.length + 4;
			if (units > maxHeaderUnits || ++count > maxHeaderValues) return null;
			if (
				key === "cf-mitigated" ||
				key === "content-type" ||
				key === "retry-after"
			) {
				const collected = headers.get(key) ?? [];
				collected.push(item.replace(/^[ \t]+|[ \t]+$/g, ""));
				headers.set(key, collected);
			}
		}
	}
	return headers;
}

interface BoundedText {
	readonly value: string;
	readonly truncated: boolean;
	readonly wordContinues: boolean;
}

function boundedText(
	response: object,
	name: string,
	limit: number,
): BoundedText {
	const value = ownValue(response, name);
	if (typeof value !== "string")
		return { value: "", truncated: false, wordContinues: false };
	const prefix = value.slice(0, limit).toLowerCase().replace(/\s+/g, " ");
	const truncated = value.length > limit;
	return {
		value: prefix.trim(),
		truncated,
		wordContinues:
			truncated &&
			/\w$/.test(prefix) &&
			/^\w/.test(value.charAt(limit).toLowerCase()),
	};
}

function hasTextMarker(text: BoundedText, pattern: RegExp): boolean {
	const match = pattern.exec(text.value);
	return (
		match !== null &&
		(!text.wordContinues || match.index + match[0].length < text.value.length)
	);
}

function loginDestination(response: object): boolean {
	const value = ownValue(response, "url");
	if (
		typeof value !== "string" ||
		value.length > 4096 ||
		!/^https?:\/\/[^/?#]/i.test(value) ||
		/[\s\\]/.test(value)
	)
		return false;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code < 32 || code === 127) return false;
	}
	try {
		const url = new URL(value);
		return !url.username && !url.password && /^\/login\/?$/.test(url.pathname);
	} catch {
		return false;
	}
}

function retryAfter(headers: Map<string, string[]>): number | undefined {
	const values = headers.get("retry-after");
	if (!values?.length || !values.every((value) => value === values[0]))
		return undefined;
	const value = values[0];
	if (!/^[0-9]{1,5}$/.test(value)) return undefined;
	const seconds = Number(value);
	return seconds <= 86_400 ? seconds : undefined;
}

function diagnostic(
	headers: Map<string, string[]>,
	kind: BrowserChallengeDiagnostic["kind"],
	provider: BrowserChallengeDiagnostic["provider"],
	confidence: BrowserChallengeDiagnostic["confidence"],
	evidence: BrowserChallengeDiagnostic["evidence"][number],
): BrowserChallengeDiagnostic {
	const seconds = retryAfter(headers);
	return {
		kind,
		provider,
		confidence,
		evidence: [evidence],
		action: "stop-and-request-user-handoff",
		...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
	};
}

export function classifyBrowserChallenge(
	response: BrowserChallengeResponse,
): BrowserChallengeDiagnostic | null {
	try {
		if (!plainRecord(response)) return null;
		const status = ownValue(response, "status");
		if (
			typeof status !== "number" ||
			!Number.isInteger(status) ||
			status < 100 ||
			status > 599
		)
			return null;
		const headers = readHeaders(ownValue(response, "headers"));
		if (!headers) return null;
		const mitigated = headers.get("cf-mitigated");
		if (mitigated?.length && mitigated.every((value) => value === "challenge"))
			return diagnostic(
				headers,
				"challenge",
				"cloudflare",
				"confirmed",
				"cf-mitigated-challenge",
			);
		const contentTypes = headers.get("content-type");
		if (
			status < 200 ||
			status === 204 ||
			status === 205 ||
			(status >= 300 && status < 400) ||
			!contentTypes?.length ||
			!contentTypes.every(
				(value) => value.split(";", 1)[0].trim().toLowerCase() === "text/html",
			)
		)
			return null;
		const title = boundedText(response, "title", 256);
		const text = boundedText(response, "text", 8192);
		if (
			!title.truncated &&
			title.value === "client challenge" &&
			hasTextMarker(text, /\bjavascript is disabled in your browser\b/) &&
			hasTextMarker(text, /\bplease enable javascript to proceed\b/)
		)
			return diagnostic(
				headers,
				"challenge",
				"unspecified",
				"possible",
				"html-challenge-markers",
			);
		const challengeTitle =
			!title.truncated &&
			/^(?:just a moment[.!…]*|attention required!?\s*\|\s*cloudflare|security check|verify (?:that )?you are human|are you (?:a )?human\??|captcha|robot check|duckduckgo|checking your browser - recaptcha)$/.test(
				title.value,
			);
		const challengeText =
			hasTextMarker(
				text,
				/\b(?:verify (?:that )?you are (?:a )?human|verifying you are human|checking your browser|complete the following challenge|confirm you are (?:a )?human|prove you are (?:a )?human|not a robot)\b/,
			) ||
			(/^just a moment[.!…]*$/.test(title.value) &&
				hasTextMarker(text, /\benable javascript and cookies to continue\b/));
		if (challengeTitle && challengeText)
			return diagnostic(
				headers,
				"challenge",
				hasTextMarker(title, /\bcloudflare\b/) ||
					hasTextMarker(text, /\bcloudflare\b/)
					? "cloudflare"
					: "unspecified",
				"possible",
				"html-challenge-markers",
			);
		if (
			status === 403 &&
			hasTextMarker(
				text,
				/^(?:you've|you have) been blocked by network security\b/,
			)
		)
			return diagnostic(
				headers,
				"access-denied",
				"unspecified",
				"possible",
				"html-network-security-block",
			);
		if (
			!title.truncated &&
			/^(?:log in|login|sign in)(?: to [a-z0-9 ._-]{1,80})?$/.test(
				title.value,
			) &&
			hasTextMarker(
				text,
				/\b(?:password|email address|sign in to continue|log in to continue|continue with (?:google|apple))\b/,
			)
		)
			return diagnostic(
				headers,
				"login",
				"unspecified",
				"possible",
				"html-login-markers",
			);
		if (
			loginDestination(response) &&
			hasTextMarker(
				text,
				/\bcontinue with (?:google\s*continue with apple|apple\s*continue with google)\b/,
			)
		)
			return diagnostic(
				headers,
				"login",
				"unspecified",
				"possible",
				"login-url-and-html-markers",
			);
		return null;
	} catch {
		return null;
	}
}
