import { expect, it } from "vitest";
import {
	type CookieContext,
	CookieJar,
	cookiePathMatches,
	cookieSameSite,
} from "./cookies.js";

const url = "https://example.com/account/page";
const context = { siteUrl: url };

function fixture() {
	let now = Date.UTC(2026, 8, 1);
	const jar = new CookieJar({}, () => now);
	return {
		jar,
		advance: (milliseconds: number) => {
			now += milliseconds;
		},
	};
}

it("stores host-only cookies, shares ports but never sibling/subdomains or another jar", () => {
	const { jar } = fixture();
	expect(jar.setCookie(url, "session=fixture; Path=/", context).accepted).toBe(
		true,
	);
	expect(jar.cookieHeader("https://example.com:8443/", context)).toBe(
		"session=fixture",
	);
	expect(jar.cookieHeader("https://sub.example.com/", context)).toBe("");
	expect(jar.cookieHeader("https://example.com.evil.test/", context)).toBe("");
	expect(new CookieJar().cookieHeader(url, context)).toBe("");
});

it.each([
	["/", "/", true],
	["/account", "/account", true],
	["/account/page", "/account", true],
	["/accounts", "/account", false],
	["/account", "/account/", false],
	["/account/a", "/account/", true],
])("matches path %s against %s as %s", (path, cookiePath, matches) => {
	expect(cookiePathMatches(path, cookiePath)).toBe(matches);
});

it("uses default paths and sends deeper paths first while preserving creation order on replacement", () => {
	const { jar } = fixture();
	jar.setCookie(url, "a=root; Path=/", context);
	jar.setCookie(url, "b=second; Path=/", context);
	jar.setCookie(url, "a=deep", context);
	jar.setCookie(url, "a=replaced; Path=/", context);
	expect(jar.cookieHeader(url, context)).toBe("a=deep; a=replaced; b=second");
	expect(jar.cookieHeader("https://example.com/accounts", context)).toBe(
		"a=replaced; b=second",
	);
	jar.setCookie(url, "c=default; Path=relative", context);
	expect(jar.cookieHeader(url, context)).toBe(
		"a=deep; c=default; a=replaced; b=second",
	);
});

it("preserves quoted values and equals signs, and ignores unknown attributes", () => {
	const { jar } = fixture();
	expect(
		jar.setCookie(url, 'token="a=b"; Unknown=ignored', context).accepted,
	).toBe(true);
	expect(jar.cookieHeader(url, context)).toBe('token="a=b"');
	expect(jar.setCookie(url, "empty=", context).accepted).toBe(true);
	expect(jar.cookieHeader(url, context)).toContain("empty=");
});

it.each([
	"missing",
	"=unnamed",
	"bad name=x",
	"name=two words",
	"name=bad,value",
	"name=back\\slash",
	'name="',
	"name=x\r\ninjected=y",
	"name=雪",
	"name=one; Path=/\u001b",
])(
	"rejects malformed or deliberately unsupported cookie syntax %j",
	(header) => {
		const { jar } = fixture();
		expect(jar.setCookie(url, header, context)).toEqual({
			accepted: false,
			reason: "invalid-cookie",
		});
		expect(jar.metrics().cookies).toBe(0);
	},
);

it.each([
	"Domain=example.com",
	"Domain=.com",
	"Domain=",
	"Domain=sub.example.com",
	"Partitioned",
	"Partitioned=1",
])("explicitly rejects unsupported scope %s", (attribute) => {
	const { jar } = fixture();
	expect(jar.setCookie(url, `name=value; ${attribute}`, context)).toEqual({
		accepted: false,
		reason: attribute.startsWith("Domain")
			? "domain-unsupported"
			: "partitioned-unsupported",
	});
});

it("keeps Secure cookies off HTTP and rejects insecure cookie fixation/deletion at overlapping paths", () => {
	const { jar } = fixture();
	jar.setCookie(url, "token=secure; Secure; Path=/account", context);
	const insecure = "http://example.com/account/page";
	expect(jar.cookieHeader(insecure, { siteUrl: insecure })).toBe("");
	for (const header of [
		"token=bad; Path=/account",
		"token=bad; Path=/account/sub",
		"token=gone; Path=/account; Max-Age=0",
		"new=bad; Secure",
	])
		expect(
			jar.setCookie(insecure, header, { siteUrl: insecure }),
		).toMatchObject({ accepted: false, reason: "insecure" });
	expect(
		jar.setCookie(insecure, "token=root; Path=/", { siteUrl: insecure })
			.accepted,
	).toBe(true);
	expect(jar.cookieHeader(url, context)).toBe("token=secure; token=root");
});

it("hides HttpOnly from document access and prevents script overwrite or deletion", () => {
	const { jar } = fixture();
	jar.setCookie(url, "private=fixture; HttpOnly; Path=/", context);
	jar.setDocumentCookie(url, "visible=fixture; Path=/", url);
	expect(jar.documentCookie(url, url)).toBe("visible=fixture");
	expect(jar.cookieHeader(url, context)).toBe(
		"private=fixture; visible=fixture",
	);
	for (const value of [
		"private=bad; Path=/",
		"private=; Path=/; Max-Age=0",
		"other=bad; HttpOnly",
	])
		expect(jar.setDocumentCookie(url, value, url)).toEqual({
			accepted: false,
			reason: "http-only",
		});
	expect(jar.metrics().cookies).toBe(2);
});

it.each([
	["__Secure-a=value", false],
	["__secure-a=value; Secure", true],
	["__Host-a=value; Secure", false],
	["__Host-a=value; Secure; Path=/account", false],
	["__hOsT-a=value; Secure; Path=/", true],
	["__Host-a=value; Secure; Path=/; Path=/other", false],
])("enforces cookie prefix attributes for %s", (header, accepted) => {
	const { jar } = fixture();
	expect(jar.setCookie(url, header, context).accepted).toBe(accepted);
});

it("uses a deliberately conservative scheme-and-exact-host same-site boundary", () => {
	expect(cookieSameSite(url, "https://example.com:8443/elsewhere")).toBe(true);
	expect(cookieSameSite(url, "http://example.com/")).toBe(false);
	expect(cookieSameSite(url, "https://sub.example.com/")).toBe(false);
	expect(cookieSameSite(url, null)).toBe(false);
});

it.each([
	[{ siteUrl: url }, "strict=1; lax=1; default=1; none=1"],
	[{ siteUrl: "https://other.test/" }, "none=1"],
	[{ siteUrl: null, topLevelNavigation: true }, "lax=1; default=1; none=1"],
	[
		{
			siteUrl: "https://other.test/",
			topLevelNavigation: true,
			method: "POST",
		},
		"none=1",
	],
	[
		{
			siteUrl: "https://other.test/",
			topLevelNavigation: true,
			method: "HEAD",
		},
		"lax=1; default=1; none=1",
	],
	[
		{ siteUrl: url, topLevelNavigation: true, crossSiteRedirect: true },
		"lax=1; default=1; none=1",
	],
] as [CookieContext, string][])(
	"filters SameSite cookies for context %j",
	(requestContext, expected) => {
		const { jar } = fixture();
		jar.setCookie(url, "strict=1; SameSite=Strict", context);
		jar.setCookie(url, "lax=1; SameSite=Lax", context);
		jar.setCookie(url, "default=1", context);
		jar.setCookie(url, "none=1; SameSite=None; Secure", context);
		expect(jar.cookieHeader(url, requestContext)).toBe(expected);
	},
);

it("allows cross-site top-level response cookies but not embedded or script Lax/Strict writes", () => {
	const { jar } = fixture();
	const siteUrl = "https://other.test/";
	expect(jar.setCookie(url, "lax=1", { siteUrl })).toMatchObject({
		reason: "same-site",
	});
	expect(
		jar.setCookie(url, "strict=1; SameSite=Strict", {
			siteUrl,
			topLevelNavigation: true,
		}).accepted,
	).toBe(true);
	expect(jar.setDocumentCookie(url, "script=1", siteUrl)).toMatchObject({
		reason: "same-site",
	});
	expect(
		jar.setCookie(url, "none=1; SameSite=None", { siteUrl }),
	).toMatchObject({ reason: "insecure" });
	expect(
		jar.setCookie(url, "none=1; SameSite=None; Secure", { siteUrl }).accepted,
	).toBe(true);
	expect(jar.documentCookie(url, siteUrl)).toBe("none=1");
});

it("uses Max-Age ahead of Expires, supports deletion and prunes expired entries", () => {
	const { jar, advance } = fixture();
	jar.setCookie(
		url,
		"a=1; Max-Age=2; Expires=Wed, 01 Jan 2020 00:00:00 GMT",
		context,
	);
	advance(1999);
	expect(jar.cookieHeader(url, context)).toBe("a=1");
	advance(1);
	expect(jar.metrics().cookies).toBe(0);
	jar.setCookie(url, "a=2", context);
	expect(jar.setCookie(url, "a=gone; Max-Age=-1", context)).toEqual({
		accepted: true,
		deleted: true,
	});
	expect(jar.cookieHeader(url, context)).toBe("");
});

it.each([
	"Wed, 01 Jan 2020 00:00:00 GMT",
	"Wed, 01-Jan-20 00:00:00 GMT",
	"Wednesday Jan 01 00:00:00 2020",
	"Thu, 01 Jan 70 00:00:00 GMT",
])("parses legacy cookie dates %s without host Date.parse", (date) => {
	const { jar } = fixture();
	expect(jar.setCookie(url, `past=1; Expires=${date}`, context)).toEqual({
		accepted: true,
		deleted: true,
	});
});

it.each([
	"not a date",
	"Thu, 31 Feb 2020 00:00:00 GMT",
	"Wed, 01 Jan 2020 25:00:00 GMT",
	"Wed, 01 Jan 1500 00:00:00 GMT",
])("ignores invalid cookie date %s", (date) => {
	const { jar } = fixture();
	expect(
		jar.setCookie(url, `session=1; Expires=${date}`, context).accepted,
	).toBe(true);
	expect(jar.cookieHeader(url, context)).toBe("session=1");
});

it("uses the last valid expiry attribute and bounds all persistent lifetimes to 400 days", () => {
	const { jar, advance } = fixture();
	jar.setCookie(url, "short=1; Max-Age=10; Max-Age=invalid", context);
	jar.setCookie(
		url,
		"long=1; Max-Age=999999999999999999999999999999999999999",
		context,
	);
	jar.setCookie(url, "dated=1; Expires=Fri, 01 Jan 9999 00:00:00 GMT", context);
	advance(10000);
	expect(jar.cookieHeader(url, context)).toBe("long=1; dated=1");
	advance(400 * 24 * 60 * 60 * 1000 - 10000);
	expect(jar.metrics().cookies).toBe(0);
});

it("enforces per-host/global capacity without evicting existing session credentials", () => {
	const jar = new CookieJar({ maxCookies: 2, maxCookiesPerHost: 1 });
	jar.setCookie(url, "first=1", context);
	expect(jar.setCookie(url, "second=2", context)).toMatchObject({
		reason: "capacity",
	});
	jar.setCookie("https://other.test/", "other=1", {
		siteUrl: "https://other.test/",
	});
	expect(
		jar.setCookie("https://third.test/", "third=1", {
			siteUrl: "https://third.test/",
		}),
	).toMatchObject({ reason: "capacity" });
	expect(jar.setCookie(url, "first=replaced", context).accepted).toBe(true);
	expect(jar.cookieHeader(url, context)).toBe("first=replaced");
	jar.setCookie(url, "first=; Max-Age=0", context);
	expect(jar.setCookie(url, "new=1", context).accepted).toBe(true);
});

it("bounds individual cookie and outgoing header bytes without returning a partial header", () => {
	const jar = new CookieJar({ maxCookieBytes: 13, maxHeaderBytes: 5 });
	expect(jar.setCookie(url, "large=1234567", context).accepted).toBe(true);
	expect(jar.setCookie(url, "large=12345678", context)).toMatchObject({
		reason: "cookie-too-large",
	});
	expect(() => jar.cookieHeader(url, context)).toThrow("Cookie header limit");
	expect(jar.metrics().cookies).toBe(1);
});

it("clears/closes explicitly and exposes only bounded counts in metrics", () => {
	const { jar } = fixture();
	jar.setCookie(url, "private=sensitive-fixture", context);
	jar.setCookie(url, "private=ignored; Domain=example.com", context);
	expect(JSON.stringify(jar.metrics())).not.toMatch(
		/sensitive-fixture|example.com|private/,
	);
	expect(jar.metrics().rejections).toEqual({ "domain-unsupported": 1 });
	jar.clear();
	expect(jar.metrics().cookies).toBe(0);
	jar.close();
	jar.close();
	expect(jar.metrics().closed).toBe(true);
	expect(() => jar.cookieHeader(url, context)).toThrow("closed");
	expect(() => jar.setCookie(url, "a=1", context)).toThrow("closed");
	expect(() => jar.clear()).toThrow("closed");
});

it("validates contexts, limits, URLs and clock without leaking input values", () => {
	const { jar } = fixture();
	for (const invalid of [
		{},
		{ siteUrl: 42 },
		{ siteUrl: url, topLevelNavigation: "yes" },
		{ siteUrl: url, method: "GET\r\n" },
	])
		expect(() => jar.cookieHeader(url, invalid as CookieContext)).toThrow(
			"Invalid cookie context",
		);
	expect(() => jar.cookieHeader("file:///etc/passwd", context)).toThrow();
	expect(() => new CookieJar({ maxCookies: 0 })).toThrow(
		"Invalid cookie limit",
	);
	expect(() => new CookieJar({ maxCookies: 10001 })).toThrow("configuration");
	expect(() => new CookieJar({}, () => Number.NaN).metrics()).toThrow(
		"Invalid cookie clock",
	);
});
