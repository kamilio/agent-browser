import type { Invocation } from "./cli-parser.js";
import type { CookieJar, CookieStateEntry } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";

export const cookieCommandOptions = Object.freeze({
	"cookie-list": ["domain"],
	"cookie-get": [],
	"cookie-set": ["domain", "path", "expires", "httpOnly", "secure", "sameSite"],
	"cookie-delete": [],
} as const);

export type CookieCommandResult =
	| { cookies: readonly CookieStateEntry[] }
	| { set: true; deleted: boolean }
	| { deleted: number };

function invalid(message: string): never {
	throw new AgentBrowserError("invalid-input", message);
}

function compareText(left: string, right: string) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function domainFilter(value: unknown): string {
	if (
		typeof value !== "string" ||
		!value.length ||
		value.length > 16_384 ||
		/[\s/@?#\\]/.test(value)
	)
		invalid("Invalid cookie domain filter");
	let target: URL;
	try {
		target = parseNetworkUrl(`http://${value}`);
	} catch {
		return invalid("Invalid cookie domain filter");
	}
	if (
		target.host !== target.hostname ||
		target.hostname !== value.toLowerCase()
	)
		invalid("Cookie domain filter must be an exact hostname");
	return target.hostname;
}

function setHeader(invocation: Invocation): string {
	const [name, value] = invocation.arguments;
	const options = invocation.options;
	const unquoted =
		value.startsWith('"') && value.endsWith('"') && value.length >= 2
			? value.slice(1, -1)
			: value;
	if (!/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(unquoted))
		invalid("Invalid cookie value");
	if (options.domain !== undefined)
		throw new AgentBrowserError(
			"unsupported",
			"Domain cookies are unsupported; omit --domain for a host-only cookie",
		);
	const parts = [`${name}=${value}`];
	if (options.path !== undefined) {
		const path = options.path;
		if (
			typeof path !== "string" ||
			!path.startsWith("/") ||
			path.length > 1024 ||
			path.trim() !== path ||
			/[^\x20-\x7e]|;/.test(path)
		)
			invalid("Invalid cookie path");
		parts.push(`Path=${path}`);
	}
	for (const [option, attribute] of [
		["httpOnly", "HttpOnly"],
		["secure", "Secure"],
	] as const) {
		if (options[option] !== undefined && typeof options[option] !== "boolean")
			invalid("Cookie security flags must be boolean");
		if (options[option]) parts.push(attribute);
	}
	if (options.sameSite !== undefined) {
		if (
			typeof options.sameSite !== "string" ||
			!/^(strict|lax|none)$/i.test(options.sameSite)
		)
			invalid("Invalid cookie SameSite policy");
		parts.push(`SameSite=${options.sameSite}`);
	}
	if (options.expires !== undefined) {
		const expires = options.expires;
		if (
			typeof expires !== "number" ||
			!Number.isSafeInteger(expires) ||
			expires < -1 ||
			expires > 253_402_300_799
		)
			invalid(
				"Cookie expiry must be whole Unix seconds or -1 for a session cookie",
			);
		if (expires !== -1)
			parts.push(`Expires=${new Date(expires * 1000).toUTCString()}`);
	}
	return parts.join("; ");
}

export function executeCookieCommand(
	jar: CookieJar,
	invocation: Invocation,
	activeUrl: string | null = null,
): CookieCommandResult {
	if (!Object.hasOwn(cookieCommandOptions, invocation.command))
		throw new AgentBrowserError("unsupported", "Not a cookie service command");
	const command = invocation.command as keyof typeof cookieCommandOptions;
	const allowed: readonly string[] = cookieCommandOptions[command];
	for (const key of Object.keys(invocation.options))
		if (!["json", "help", "version", "timeout", ...allowed].includes(key))
			invalid("Unsupported cookie command option");
	const argumentCount =
		command === "cookie-list" ? 0 : command === "cookie-set" ? 2 : 1;
	if (
		invocation.arguments.length !== argumentCount ||
		invocation.arguments.some((value) => typeof value !== "string")
	)
		invalid("Invalid cookie command arguments");
	const name = invocation.arguments[0];
	if (name !== undefined && !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name))
		invalid("Invalid cookie name");
	if (command === "cookie-set") {
		const header = setHeader(invocation);
		if (activeUrl === null)
			throw new AgentBrowserError(
				"not-found",
				"Setting a cookie requires an active HTTP(S) page",
			);
		let target: URL;
		try {
			target = parseNetworkUrl(activeUrl);
		} catch {
			return invalid("Setting a cookie requires an active HTTP(S) page");
		}
		const result = jar.setCookie(target.href, header, { siteUrl: target.href });
		if (!result.accepted)
			throw new AgentBrowserError(
				result.reason === "capacity" || result.reason === "cookie-too-large"
					? "resource-limit"
					: result.reason === "invalid-cookie"
						? "invalid-input"
						: "policy-denied",
				`Cookie rejected: ${result.reason}`,
			);
		return { set: true, deleted: result.deleted };
	}
	const host =
		invocation.options.domain === undefined
			? undefined
			: domainFilter(invocation.options.domain);
	const state = jar.exportState();
	if (command === "cookie-delete") {
		const cookies = state.cookies.filter((cookie) => cookie.name !== name);
		const deleted = state.cookies.length - cookies.length;
		if (deleted) jar.replaceState({ schemaVersion: 1, cookies });
		return { deleted };
	}
	const cookies = state.cookies
		.filter(
			(cookie) =>
				(host === undefined || cookie.host === host) &&
				(command === "cookie-list" || cookie.name === name),
		)
		.sort(
			(left, right) =>
				compareText(left.host, right.host) ||
				compareText(left.path, right.path) ||
				compareText(left.name, right.name),
		);
	if (command === "cookie-get" && !cookies.length)
		throw new AgentBrowserError("not-found", "Cookie not found");
	return { cookies };
}
