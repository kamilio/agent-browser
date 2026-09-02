import { AgentBrowserError } from "./errors.js";
import { parseNetworkUrl } from "./network.js";

export interface CookieLimits {
	maxCookies: number;
	maxCookiesPerHost: number;
	maxCookieBytes: number;
	maxHeaderBytes: number;
}

export interface CookieContext {
	siteUrl: string | null;
	topLevelNavigation?: boolean;
	method?: string;
	crossSiteRedirect?: boolean;
}

export interface CookieRequestContext extends CookieContext {
	credentials: "omit" | "same-origin" | "include";
}

export type CookieRejection =
	| "invalid-cookie"
	| "cookie-too-large"
	| "domain-unsupported"
	| "partitioned-unsupported"
	| "insecure"
	| "http-only"
	| "prefix"
	| "same-site"
	| "capacity";

export type CookieSetResult =
	| { accepted: true; deleted: boolean }
	| { accepted: false; reason: CookieRejection };

interface StoredCookie {
	name: string;
	value: string;
	host: string;
	path: string;
	secure: boolean;
	httpOnly: boolean;
	sameSite: "strict" | "lax" | "none";
	expires: number | null;
	created: number;
}

const encoder = new TextEncoder();
const safeMethods = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
const maximumLifetime = 400 * 24 * 60 * 60 * 1000;

export function cookiePathMatches(path: string, cookiePath: string) {
	return (
		path === cookiePath ||
		(path.startsWith(cookiePath) &&
			(cookiePath.endsWith("/") || path[cookiePath.length] === "/"))
	);
}

export function cookieSameSite(url: string, siteUrl: string | null) {
	const target = parseNetworkUrl(url);
	if (siteUrl === null) return false;
	const site = parseNetworkUrl(siteUrl);
	return target.protocol === site.protocol && target.hostname === site.hostname;
}

export function normalizeCookieContext(context: CookieContext): CookieContext {
	if (
		!context ||
		typeof context !== "object" ||
		(context.siteUrl !== null && typeof context.siteUrl !== "string") ||
		(context.topLevelNavigation !== undefined &&
			typeof context.topLevelNavigation !== "boolean") ||
		(context.crossSiteRedirect !== undefined &&
			typeof context.crossSiteRedirect !== "boolean") ||
		(context.method !== undefined &&
			(typeof context.method !== "string" ||
				!/^[a-z]{1,32}$/i.test(context.method)))
	)
		throw new AgentBrowserError("invalid-input", "Invalid cookie context");
	return {
		siteUrl:
			context.siteUrl === null ? null : parseNetworkUrl(context.siteUrl).href,
		topLevelNavigation: context.topLevelNavigation ?? false,
		crossSiteRedirect: context.crossSiteRedirect ?? false,
		method: context.method?.toUpperCase() ?? "GET",
	};
}

function parseCookieDate(value: string): number | undefined {
	let time: number[] | undefined;
	let day: number | undefined;
	let month: number | undefined;
	let year: number | undefined;
	const months = [
		"jan",
		"feb",
		"mar",
		"apr",
		"may",
		"jun",
		"jul",
		"aug",
		"sep",
		"oct",
		"nov",
		"dec",
	];
	for (const token of value.split(
		/[\t\x20-\x2f\x3b-\x40\x5b-\x60\x7b-\x7e]+/,
	)) {
		const clock = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\D.*)?$/.exec(token);
		if (!time && clock) {
			time = clock.slice(1).map(Number);
			continue;
		}
		const date = /^(\d{1,2})(?:\D.*)?$/.exec(token);
		if (day === undefined && date) {
			day = Number(date[1]);
			continue;
		}
		const monthIndex = months.indexOf(token.slice(0, 3).toLowerCase());
		if (month === undefined && monthIndex !== -1) {
			month = monthIndex;
			continue;
		}
		const fullYear = /^(\d{2,4})(?:\D.*)?$/.exec(token);
		if (year === undefined && fullYear) year = Number(fullYear[1]);
	}
	if (!time || day === undefined || month === undefined || year === undefined)
		return undefined;
	if (year >= 70 && year <= 99) year += 1900;
	else if (year <= 69) year += 2000;
	if (
		year < 1601 ||
		day < 1 ||
		day > 31 ||
		time[0] > 23 ||
		time[1] > 59 ||
		time[2] > 59
	)
		return undefined;
	const timestamp = Date.UTC(
		year,
		month,
		day,
		...(time as [number, number, number]),
	);
	const date = new Date(timestamp);
	return date.getUTCDate() === day && date.getUTCMonth() === month
		? timestamp
		: undefined;
}

export class CookieJar {
	readonly limits: Readonly<CookieLimits>;
	private cookies = new Map<string, StoredCookie>();
	private closed = false;
	private sequence = 0;
	private accepted = 0;
	private rejected = 0;
	private rejections: Partial<Record<CookieRejection, number>> = {};

	constructor(
		limits: Partial<CookieLimits> = {},
		private readonly clock: () => number = Date.now,
	) {
		this.limits = Object.freeze({
			maxCookies: 3000,
			maxCookiesPerHost: 180,
			maxCookieBytes: 4096,
			maxHeaderBytes: 32768,
			...limits,
		});
		for (const [name, value] of Object.entries(this.limits))
			if (!Number.isSafeInteger(value) || value < 1 || value > 1_048_576)
				throw new AgentBrowserError(
					"invalid-input",
					`Invalid cookie limit: ${name}`,
				);
		if (
			this.limits.maxCookies > 10_000 ||
			this.limits.maxCookiesPerHost > 10_000 ||
			typeof clock !== "function"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid cookie jar configuration",
			);
	}

	setCookie(
		url: string,
		header: string,
		context: CookieContext,
	): CookieSetResult {
		return this.store(url, header, context, false);
	}

	setDocumentCookie(
		url: string,
		value: string,
		siteUrl: string | null,
	): CookieSetResult {
		return this.store(url, value, { siteUrl }, true);
	}

	cookieHeader(url: string, context: CookieContext): string {
		return this.retrieve(url, context, false);
	}

	documentCookie(url: string, siteUrl: string | null): string {
		return this.retrieve(url, { siteUrl }, true);
	}

	metrics() {
		if (!this.closed) this.prune(this.now());
		return Object.freeze({
			cookies: this.cookies.size,
			accepted: this.accepted,
			rejected: this.rejected,
			rejections: Object.freeze({ ...this.rejections }),
			closed: this.closed,
		});
	}

	clear() {
		this.assertOpen();
		this.cookies.clear();
	}

	close() {
		this.cookies.clear();
		this.closed = true;
	}

	private assertOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Cookie jar is closed");
	}

	private now() {
		const now = this.clock();
		if (!Number.isSafeInteger(now) || now < 0 || now > 8_000_000_000_000_000)
			throw new AgentBrowserError("invalid-input", "Invalid cookie clock");
		return now;
	}

	private prune(now: number) {
		for (const [key, cookie] of this.cookies)
			if (cookie.expires !== null && cookie.expires <= now)
				this.cookies.delete(key);
	}

	private store(
		url: string,
		header: string,
		input: CookieContext,
		script: boolean,
	): CookieSetResult {
		this.assertOpen();
		const target = parseNetworkUrl(url);
		const context = normalizeCookieContext(input);
		const now = this.now();
		this.prune(now);
		const reject = (reason: CookieRejection): CookieSetResult => {
			this.rejected++;
			this.rejections[reason] = (this.rejections[reason] ?? 0) + 1;
			return { accepted: false, reason };
		};
		if (typeof header !== "string") return reject("invalid-cookie");
		if (
			header.length > this.limits.maxCookieBytes ||
			encoder.encode(header).byteLength > this.limits.maxCookieBytes
		)
			return reject("cookie-too-large");
		if (/[^\t\x20-\x7e]/.test(header)) return reject("invalid-cookie");
		const [pair, ...attributes] = header.split(";");
		const equals = pair.indexOf("=");
		if (equals < 1) return reject("invalid-cookie");
		const name = pair.slice(0, equals).trim();
		const value = pair.slice(equals + 1).trim();
		const unquoted =
			value.length >= 2 && value.startsWith('"') && value.endsWith('"')
				? value.slice(1, -1)
				: value;
		if (
			!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) ||
			!/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(unquoted)
		)
			return reject("invalid-cookie");
		let path =
			target.pathname.slice(0, target.pathname.lastIndexOf("/")) || "/";
		let explicitRoot = false;
		let secure = false;
		let httpOnly = false;
		let sameSite: StoredCookie["sameSite"] = "lax";
		let expires: number | null = null;
		let maxAge: number | undefined;
		for (const attribute of attributes) {
			const separator = attribute.indexOf("=");
			const key = (separator < 0 ? attribute : attribute.slice(0, separator))
				.trim()
				.toLowerCase();
			const content =
				separator < 0 ? "" : attribute.slice(separator + 1).trim();
			if (key === "domain") return reject("domain-unsupported");
			if (key === "partitioned") return reject("partitioned-unsupported");
			if (key === "secure") secure = true;
			if (key === "httponly") httpOnly = true;
			if (key === "path" && content.length <= 1024) {
				path = content.startsWith("/")
					? content
					: target.pathname.slice(0, target.pathname.lastIndexOf("/")) || "/";
				explicitRoot = content === "/";
			}
			if (key === "samesite")
				sameSite =
					content.toLowerCase() === "none"
						? "none"
						: content.toLowerCase() === "strict"
							? "strict"
							: "lax";
			if (key === "max-age" && /^-?\d+$/.test(content))
				maxAge = Number(content);
			if (key === "expires") expires = parseCookieDate(content) ?? expires;
		}
		if (secure && target.protocol !== "https:") return reject("insecure");
		if (script && httpOnly) return reject("http-only");
		if (sameSite === "none" && !secure) return reject("insecure");
		const lowerName = name.toLowerCase();
		if (
			(lowerName.startsWith("__secure-") && !secure) ||
			(lowerName.startsWith("__host-") && (!secure || !explicitRoot))
		)
			return reject("prefix");
		if (
			sameSite !== "none" &&
			(context.crossSiteRedirect || !cookieSameSite(url, context.siteUrl)) &&
			(script || !context.topLevelNavigation)
		)
			return reject("same-site");
		const key = JSON.stringify([target.hostname, name, path]);
		const old = this.cookies.get(key);
		if (script && old?.httpOnly) return reject("http-only");
		if (target.protocol !== "https:")
			for (const cookie of this.cookies.values())
				if (
					cookie.secure &&
					cookie.host === target.hostname &&
					cookie.name === name &&
					cookiePathMatches(path, cookie.path)
				)
					return reject("insecure");
		if (maxAge !== undefined)
			expires =
				maxAge <= 0 ? 0 : now + Math.min(maxAge * 1000, maximumLifetime);
		if (expires !== null) expires = Math.min(expires, now + maximumLifetime);
		if (expires !== null && expires <= now) {
			this.cookies.delete(key);
			this.accepted++;
			return { accepted: true, deleted: true };
		}
		if (
			!old &&
			(this.cookies.size >= this.limits.maxCookies ||
				Array.from(this.cookies.values()).filter(
					(cookie) => cookie.host === target.hostname,
				).length >= this.limits.maxCookiesPerHost)
		)
			return reject("capacity");
		this.cookies.set(key, {
			name,
			value,
			host: target.hostname,
			path,
			secure,
			httpOnly,
			sameSite,
			expires,
			created: old?.created ?? this.sequence++,
		});
		this.accepted++;
		return { accepted: true, deleted: false };
	}

	private retrieve(url: string, input: CookieContext, script: boolean) {
		this.assertOpen();
		const target = parseNetworkUrl(url);
		const context = normalizeCookieContext(input);
		this.prune(this.now());
		const sameSite =
			!context.crossSiteRedirect && cookieSameSite(url, context.siteUrl);
		const matches = Array.from(this.cookies.values()).filter((cookie) => {
			if (
				cookie.host !== target.hostname ||
				!cookiePathMatches(target.pathname, cookie.path) ||
				(cookie.secure && target.protocol !== "https:") ||
				(script && cookie.httpOnly)
			)
				return false;
			if (cookie.sameSite === "none" || sameSite) return true;
			return (
				!script &&
				cookie.sameSite === "lax" &&
				context.topLevelNavigation &&
				safeMethods.has(context.method ?? "GET")
			);
		});
		matches.sort(
			(left, right) =>
				right.path.length - left.path.length || left.created - right.created,
		);
		let bytes = 0;
		const pairs = matches.map((cookie) => {
			const pair = `${cookie.name}=${cookie.value}`;
			bytes += pair.length + (bytes ? 2 : 0);
			if (bytes > this.limits.maxHeaderBytes)
				throw new AgentBrowserError(
					"resource-limit",
					"Cookie header limit exceeded",
				);
			return pair;
		});
		return pairs.join("; ");
	}
}
