import { expect, it } from "vitest";
import {
	CookieJar,
	cookieStateLimits,
	type CookieStateEntry,
} from "./cookies.js";

const url = "https://example.com/account/page";
const context = { siteUrl: url };
const now = Date.UTC(2026, 8, 3);

function row(overrides: Partial<CookieStateEntry> = {}): CookieStateEntry {
	return {
		name: "session",
		value: "synthetic",
		host: "example.com",
		path: "/",
		secure: true,
		httpOnly: true,
		sameSite: "lax",
		expires: null,
		...overrides,
	};
}

function state(cookies: unknown[] = [row()]) {
	return { schemaVersion: 1, cookies };
}

it("round-trips host-only cookie values, security, paths, expiry and creation order through JSON", () => {
	const source = new CookieJar({}, () => now);
	source.setCookie(url, "first=root; Path=/; Secure; HttpOnly", context);
	source.setCookie(url, "second=next; Path=/; SameSite=Strict", context);
	source.setCookie(
		url,
		'first="deep=value"; Max-Age=60; Secure; SameSite=None',
		context,
	);
	source.setCookie(url, "first=updated; Path=/; Secure; HttpOnly", context);
	const saved = source.exportState();
	expect(saved.cookies.map((cookie) => cookie.name)).toEqual([
		"first",
		"second",
		"first",
	]);
	expect(Object.isFrozen(saved)).toBe(true);
	expect(Object.isFrozen(saved.cookies)).toBe(true);
	expect(saved.cookies.every(Object.isFrozen)).toBe(true);
	expect(saved.cookies.some((cookie) => Object.hasOwn(cookie, "created"))).toBe(
		false,
	);
	const restored = new CookieJar({}, () => now);
	restored.replaceState(JSON.parse(JSON.stringify(saved)));
	expect(restored.exportState()).toEqual(saved);
	for (const target of [
		url,
		"https://example.com:8443/",
		"http://example.com/",
		"https://sub.example.com/",
	])
		expect(restored.cookieHeader(target, context)).toBe(
			source.cookieHeader(target, context),
		);
	expect(restored.documentCookie(url, url)).toBe(
		'first="deep=value"; second=next',
	);
	restored.setCookie(url, "last=value; Path=/", context);
	expect(restored.cookieHeader(url, context)).toBe(
		'first="deep=value"; first=updated; second=next; last=value',
	);
	expect(source.exportState()).toEqual(saved);
});

it("retains same-site request filtering without turning restore into a site response", () => {
	const jar = new CookieJar({}, () => now);
	jar.replaceState(
		state([
			row({ name: "strict", sameSite: "strict" }),
			row({ name: "lax" }),
			row({ name: "none", sameSite: "none" }),
		]),
	);
	const crossSite = { siteUrl: "https://other.example/" };
	expect(jar.cookieHeader(url, crossSite)).toBe("none=synthetic");
	expect(
		jar.cookieHeader(url, { ...crossSite, topLevelNavigation: true }),
	).toBe("lax=synthetic; none=synthetic");
	expect(jar.documentCookie(url, url)).toBe("");
	expect(jar.metrics()).toMatchObject({ cookies: 3, accepted: 0, rejected: 0 });
});

it("preserves absolute expiration instead of restarting max-age on reload", () => {
	let clock = now;
	const source = new CookieJar({}, () => clock);
	source.setCookie(url, "short=value; Max-Age=1", context);
	source.setCookie(url, "session=value", context);
	const saved = source.exportState();
	clock += 500;
	const restored = new CookieJar({}, () => clock);
	restored.replaceState(saved);
	expect(restored.exportState()).toEqual(saved);
	clock += 500;
	expect(restored.cookieHeader(url, context)).toBe("session=value");
	const expired = new CookieJar({}, () => clock);
	expired.replaceState(saved);
	expect(expired.exportState().cookies.map((cookie) => cookie.name)).toEqual([
		"session",
	]);
	expect(source.exportState().cookies.map((cookie) => cookie.name)).toEqual([
		"session",
	]);
});

it("caps imported future lifetimes at the jar's existing maximum lifetime", () => {
	const jar = new CookieJar({}, () => now);
	jar.replaceState(state([row({ expires: Number.MAX_SAFE_INTEGER })]));
	expect(jar.exportState().cookies[0].expires).toBe(
		now + 400 * 24 * 60 * 60 * 1000,
	);
});

it("replaces rather than merges state and keeps the imported data detached", () => {
	const jar = new CookieJar({}, () => now);
	jar.setCookie(url, "old=retained-until-replacement", context);
	const input = state([row()]);
	jar.replaceState(input);
	(input.cookies[0] as { value: string }).value = "changed-after-import";
	expect(jar.cookieHeader(url, context)).toBe("session=synthetic");
	jar.replaceState(state([]));
	expect(jar.cookieHeader(url, context)).toBe("");
});

it.each([
	["schema", { schemaVersion: 2, cookies: [] }],
	["root array", []],
	["missing fields", { cookies: [] }],
	["extra root fields", { ...state(), origins: [] }],
	["non-array cookies", { schemaVersion: 1, cookies: {} }],
	["sparse array", state(new Array(1))],
	["missing cookie field", state([{}])],
	["domain cookie", state([{ ...row(), domain: ".example.com" }])],
	["partitioned cookie", state([{ ...row(), partitionKey: "example.com" }])],
	["duplicate identity", state([row(), row({ value: "other" })])],
	["invalid name", state([row({ name: "bad name" })])],
	["invalid value", state([row({ value: "bad;value" })])],
	["unbalanced quotes", state([row({ value: '"bad' })])],
	["host with port", state([row({ host: "example.com:443" })])],
	["noncanonical host", state([row({ host: "EXAMPLE.COM" })])],
	["host with path", state([row({ host: "example.com/account" })])],
	["empty host", state([row({ host: "" })])],
	["relative path", state([row({ path: "account" })])],
	["path control", state([row({ path: "/bad\npath" })])],
	["wrong flag type", state([{ ...row(), secure: "true" }])],
	["unknown sameSite", state([{ ...row(), sameSite: "None" }])],
	["insecure SameSite None", state([row({ sameSite: "none", secure: false })])],
	["insecure prefix", state([row({ name: "__Secure-value", secure: false })])],
	[
		"host prefix path",
		state([row({ name: "__Host-value", path: "/account" })]),
	],
	["negative expiration", state([row({ expires: -1 })])],
	["fractional expiration", state([row({ expires: now + 0.5 })])],
	["infinite expiration", state([row({ expires: Number.POSITIVE_INFINITY })])],
])(
	"rejects %s without partially replacing the existing jar",
	(_name, input) => {
		const jar = new CookieJar({}, () => now);
		jar.setCookie(url, "original=synthetic; Secure; HttpOnly", context);
		const before = jar.exportState();
		const metrics = jar.metrics();
		expect(() => jar.replaceState(input)).toThrow();
		expect(jar.exportState()).toEqual(before);
		expect(jar.metrics()).toEqual(metrics);
	},
);

it("rejects late invalid data before any valid prefix becomes observable", () => {
	const jar = new CookieJar({}, () => now);
	jar.setCookie(url, "original=value", context);
	const before = jar.exportState();
	expect(() =>
		jar.replaceState(
			state([row({ name: "valid" }), row({ name: "invalid name" })]),
		),
	).toThrow();
	expect(jar.exportState()).toEqual(before);
});

it("does not execute accessors or coercion methods in supplied state", () => {
	const jar = new CookieJar({}, () => now);
	let calls = 0;
	const entry = {
		...row(),
		get value() {
			calls++;
			return "unexpected";
		},
	};
	const array: unknown[] = [row()];
	Object.defineProperty(array, "0", {
		get() {
			calls++;
			return row();
		},
	});
	const sameSite = {
		toString() {
			calls++;
			return "lax";
		},
	};
	for (const input of [
		state([entry]),
		state(array),
		state([{ ...row(), sameSite }]),
		{
			schemaVersion: 1,
			get cookies() {
				calls++;
				return [];
			},
		},
	])
		expect(() => jar.replaceState(input)).toThrow();
	expect(calls).toBe(0);
});

it("enforces per-cookie, per-host and total cookie limits atomically", () => {
	for (const [limits, input] of [
		[{ maxCookieBytes: 4 }, state([row()])],
		[{ maxCookies: 1 }, state([row(), row({ name: "second" })])],
		[{ maxCookiesPerHost: 1 }, state([row(), row({ name: "second" })])],
	] as const) {
		const jar = new CookieJar(limits, () => now);
		jar.setCookie(url, "a=b", context);
		const before = jar.exportState();
		expect(() => jar.replaceState(input)).toThrow();
		expect(jar.exportState()).toEqual(before);
	}
});

it("bounds serialized state on export and import even with enlarged cookie limits", () => {
	const large = "x".repeat(1_000_000);
	const jar = new CookieJar({ maxCookieBytes: 1_048_576 }, () => now);
	const cookies = Array.from({ length: 18 }, (_, index) =>
		row({ name: `large${index}`, value: large }),
	);
	expect(cookieStateLimits.maxBytes).toBe(16_777_216);
	expect(() => jar.replaceState(state(cookies))).toThrow("byte limit");
	expect(jar.metrics().cookies).toBe(0);
	for (const cookie of cookies)
		expect(
			jar.setCookie(url, `${cookie.name}=${cookie.value}`, context).accepted,
		).toBe(true);
	expect(() => jar.exportState()).toThrow("byte limit");
});

it("round-trips canonical IPv6 hosts and default paths longer than Path attributes", () => {
	const target = `https://[::1]:8443/${"a".repeat(1100)}/page`;
	const source = new CookieJar({}, () => now);
	source.setCookie(target, "fixture=value", { siteUrl: target });
	const restored = new CookieJar({}, () => now);
	restored.replaceState(source.exportState());
	expect(restored.cookieHeader(target, { siteUrl: target })).toBe(
		"fixture=value",
	);
	expect(restored.cookieHeader("https://[::2]/", { siteUrl: target })).toBe("");
});

it("rejects state operations after closure or with an invalid clock", () => {
	const closed = new CookieJar();
	closed.close();
	expect(() => closed.exportState()).toThrow("closed");
	expect(() => closed.replaceState(state())).toThrow("closed");
	const invalid = new CookieJar({}, () => Number.NaN);
	expect(() => invalid.exportState()).toThrow("clock");
	expect(() => invalid.replaceState(state())).toThrow("clock");
});

it("does not reject an existing host at the network URL length boundary during restore", () => {
	const target = `http://${"a".repeat(16_371)}.test`;
	const source = new CookieJar({}, () => now);
	expect(
		source.setCookie(target, "fixture=value", { siteUrl: target }).accepted,
	).toBe(true);
	const restored = new CookieJar({}, () => now);
	restored.replaceState(source.exportState());
	expect(restored.cookieHeader(target, { siteUrl: target })).toBe(
		"fixture=value",
	);
});
