import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exportBrowserState, replaceBrowserState } from "./browser-state.js";
import {
	type CookieContext,
	CookieJar,
	type CookieJarOptions,
	cookiePathMatches,
	cookieSameSite,
} from "./cookies.js";
import {
	type PinnedPublicSuffixSnapshot,
	createPinnedPublicSuffixSnapshot,
} from "./pinned-public-suffix.js";
import { StateTransfers, encodeStateChunk } from "./state-transfer.js";
import { BrowserStorage } from "./storage.js";

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

describe("pinned domain cookies", () => {
	let snapshot: PinnedPublicSuffixSnapshot;
	const jars: CookieJar[] = [];
	const parent = "https://example.com/";
	const child = "https://app.example.com/";
	const sibling = "https://media.example.com/";
	const now = Date.UTC(2026, 8, 18);
	beforeAll(async () => {
		snapshot = await createPinnedPublicSuffixSnapshot(
			readFileSync(
				new URL(
					"../vendor/public-suffix/public_suffix_list.dat",
					import.meta.url,
				),
			),
		);
	});
	afterEach(() => {
		for (const jar of jars.splice(0)) {
			jar.close();
			expect(jar.metrics()).toMatchObject({ closed: true, cookies: 0 });
		}
	});
	function configured(
		limits = {},
		options: CookieJarOptions = { publicSuffixSnapshot: snapshot },
	) {
		const jar = new CookieJar(limits, () => now, options);
		jars.push(jar);
		return jar;
	}

	it("admits canonical domain scope only with the branded pinned snapshot", () => {
		const jar = configured();
		expect(
			jar.setCookie(
				child,
				"shared=synthetic; Domain=.EXAMPLE.com; Path=/; Secure",
				{ siteUrl: child },
			).accepted,
		).toBe(true);
		for (const target of [parent, sibling, "https://deep.app.example.com/"])
			expect(jar.cookieHeader(target, { siteUrl: child })).toBe(
				"shared=synthetic",
			);
		for (const target of [
			"https://notexample.com/",
			"https://example.com.evil.test/",
			"http://app.example.com/",
		])
			expect(jar.cookieHeader(target, { siteUrl: target })).toBe("");
		expect(jar.exportState().cookies[0]).toMatchObject({
			host: "example.com",
			hostOnly: false,
		});
		const legacy = configured({}, {});
		expect(
			legacy.setCookie(child, "shared=synthetic; Domain=example.com", {
				siteUrl: child,
			}),
		).toMatchObject({ reason: "domain-unsupported" });
	});

	it.each([
		"",
		".",
		"..example.com",
		"example.com.",
		"example..com",
		"com",
		".com",
		"other.com",
		"ample.com",
		"child.app.example.com",
		"app.example.com.evil.test",
		"example.com:443",
		"user@example.com",
		"https://example.com",
		"example.com/",
		"ex ample.com",
		"example.com%00",
		"*.example.com",
		"-example.com",
		"example_.com",
		'"example.com"',
		"127.0.0.1",
		"0x7f000001",
		"[::1]",
	])("rejects malformed or out-of-scope Domain=%s", (domain) => {
		const jar = configured();
		expect(
			jar.setCookie(child, `bad=synthetic; Domain=${domain}`, {
				siteUrl: child,
			}).accepted,
		).toBe(false);
		expect(jar.metrics().cookies).toBe(0);
	});

	it.each([
		["https://127.0.0.1/", "127.0.0.1"],
		["https://[::1]/", "[::1]"],
		["https://foo.co.uk/", "co.uk"],
		["https://foo.github.io/", "github.io"],
		["https://foo.blogspot.com/", "blogspot.com"],
		["https://a.b.ck/", "b.ck"],
		["https://com/", "com"],
		["https://localhost/", "localhost"],
		["https://example.com./", "example.com"],
	])(
		"rejects IP, public/private suffix or rooted scope at %s",
		(target, domain) => {
			const jar = configured();
			expect(
				jar.setCookie(target, `bad=synthetic; Domain=${domain}`, {
					siteUrl: target,
				}).accepted,
			).toBe(false);
		},
	);

	it.each([
		["https://a.www.ck/", "www.ck"],
		["https://a.foo.github.io/", "foo.github.io"],
		["https://a.xn--bcher-kva.de/", "xn--bcher-kva.de"],
	])(
		"honors PSL exceptions, tenant boundaries and canonical IDNA at %s",
		(target, domain) => {
			const jar = configured();
			expect(
				jar.setCookie(target, `good=synthetic; Domain=${domain}`, {
					siteUrl: target,
				}).accepted,
			).toBe(true);
			expect(jar.cookieHeader(`https://${domain}/`, { siteUrl: target })).toBe(
				"good=synthetic",
			);
		},
	);

	it("fails closed on any invalid duplicate Domain rather than salvaging a later attribute", () => {
		const jar = configured();
		for (const attributes of [
			"Domain=com; Domain=example.com",
			"Domain=example.com; Domain=other.com",
			"Domain=; Domain=example.com",
		])
			expect(
				jar.setCookie(child, `bad=synthetic; ${attributes}`, { siteUrl: child })
					.accepted,
			).toBe(false);
		expect(
			jar.setCookie(
				child,
				"good=synthetic; Domain=EXAMPLE.com; Domain=.example.com",
				{ siteUrl: child },
			).accepted,
		).toBe(true);
	});

	it("snapshots descriptor-validated configuration without invoking getters", () => {
		const options: CookieJarOptions = { publicSuffixSnapshot: snapshot };
		const jar = configured({}, options);
		options.publicSuffixSnapshot = undefined;
		expect(
			jar.setCookie(child, "good=synthetic; Domain=example.com", {
				siteUrl: child,
			}).accepted,
		).toBe(true);
		const absent: CookieJarOptions = {};
		const legacy = configured({}, absent);
		absent.publicSuffixSnapshot = snapshot;
		expect(
			legacy.setCookie(child, "bad=synthetic; Domain=example.com", {
				siteUrl: child,
			}).accepted,
		).toBe(false);
		const getter = vi.fn(() => snapshot);
		for (const invalid of [
			null,
			[],
			Object.create({ publicSuffixSnapshot: snapshot }),
			{ extra: true },
			{ [Symbol()]: snapshot },
			{ publicSuffixSnapshot: { ...snapshot } },
			{ publicSuffixSnapshot: null },
			Object.defineProperty({}, "publicSuffixSnapshot", { get: getter }),
		])
			expect(() => configured({}, invalid as CookieJarOptions)).toThrow();
		expect(getter).not.toHaveBeenCalled();
		expect(() =>
			configured(
				{},
				Object.assign(Object.create(null), { publicSuffixSnapshot: snapshot }),
			),
		).not.toThrow();
	});

	it("extends schemeful same-site only with a branded snapshot and not across private tenants", () => {
		expect(cookieSameSite(child, sibling)).toBe(false);
		expect(cookieSameSite(child, sibling, snapshot)).toBe(true);
		for (const site of [
			"http://example.com/",
			"https://other.com/",
			"https://example.com.evil.test/",
		])
			expect(cookieSameSite(child, site, snapshot)).toBe(false);
		expect(
			cookieSameSite("https://a.github.io/", "https://b.github.io/", snapshot),
		).toBe(false);
		expect(
			cookieSameSite("https://127.0.0.1/", "https://127.0.0.2/", snapshot),
		).toBe(false);
		expect(() => cookieSameSite(child, sibling, { ...snapshot })).toThrow();
		const jar = configured();
		expect(
			jar.setCookie(
				child,
				"strict=synthetic; Domain=example.com; SameSite=Strict",
				{ siteUrl: sibling },
			).accepted,
		).toBe(true);
		expect(jar.cookieHeader(parent, { siteUrl: sibling })).toBe(
			"strict=synthetic",
		);
		expect(
			jar.cookieHeader(parent, {
				siteUrl: sibling,
				crossSiteRedirect: true,
				topLevelNavigation: true,
			}),
		).toBe("");
		expect(
			jar.setDocumentCookie(
				child,
				"script=synthetic; Domain=example.com",
				sibling,
			).accepted,
		).toBe(true);
		expect(
			jar.setCookie(
				child,
				"cross=synthetic; Domain=example.com; SameSite=Strict",
				{ siteUrl: "https://other.com/" },
			).accepted,
		).toBe(false);
	});

	it("keeps host-only and domain identities, deletion, ordering and capacity separate", () => {
		const jar = configured({ maxCookiesPerHost: 2 });
		jar.setCookie(parent, "same=host; Path=/", { siteUrl: parent });
		jar.setCookie(parent, "same=domain; Domain=example.com; Path=/", {
			siteUrl: parent,
		});
		expect(jar.cookieHeader(parent, { siteUrl: parent })).toBe(
			"same=host; same=domain",
		);
		expect(jar.cookieHeader(child, { siteUrl: child })).toBe("same=domain");
		expect(
			jar.setCookie(child, "extra=synthetic; Domain=example.com", {
				siteUrl: child,
			}),
		).toMatchObject({ reason: "capacity" });
		jar.setCookie(parent, "same=updated; Path=/", { siteUrl: parent });
		expect(jar.cookieHeader(parent, { siteUrl: parent })).toBe(
			"same=updated; same=domain",
		);
		jar.setCookie(parent, "same=gone; Max-Age=0; Path=/", { siteUrl: parent });
		expect(jar.cookieHeader(child, { siteUrl: child })).toBe("same=domain");
		jar.setCookie(child, "same=gone; Domain=example.com; Path=/; Max-Age=0", {
			siteUrl: child,
		});
		expect(jar.metrics().cookies).toBe(0);
	});

	it("preserves prefixes, HttpOnly, partition rejection and overlapping secure protection", () => {
		const jar = configured();
		for (const header of [
			"__Host-bad=synthetic; Secure; Path=/; Domain=app.example.com",
			"__Secure-bad=synthetic; Domain=example.com",
			"bad=synthetic; Domain=example.com; SameSite=None",
			"bad=synthetic; Domain=example.com; Partitioned",
		])
			expect(jar.setCookie(child, header, { siteUrl: child }).accepted).toBe(
				false,
			);
		jar.setCookie(
			parent,
			"protected=synthetic; Domain=example.com; Path=/; Secure; HttpOnly",
			{ siteUrl: parent },
		);
		expect(jar.documentCookie(child, child)).toBe("");
		expect(
			jar.setDocumentCookie(child, "protected=script; Path=/", child),
		).toMatchObject({ reason: "http-only" });
		for (const target of ["http://example.com/", "http://app.example.com/"])
			for (const scope of ["", "; Domain=example.com"])
				expect(
					jar.setCookie(target, `protected=overwrite; Path=/account${scope}`, {
						siteUrl: target,
					}),
				).toMatchObject({ reason: "insecure" });
		const reverse = configured();
		reverse.setCookie(child, "protected=host; Path=/; Secure", {
			siteUrl: child,
		});
		expect(
			reverse.setCookie(
				"http://example.com/",
				"protected=domain; Domain=example.com; Path=/",
				{ siteUrl: "http://example.com/" },
			),
		).toMatchObject({ reason: "insecure" });
	});

	it("round-trips an explicit domain marker without widening old host-only state", () => {
		const source = configured();
		source.setCookie(parent, "same=host; Path=/", { siteUrl: parent });
		source.setCookie(
			parent,
			"same=domain; Domain=example.com; Path=/; Secure; HttpOnly",
			{ siteUrl: parent },
		);
		const state = JSON.parse(JSON.stringify(source.exportState()));
		expect(Object.hasOwn(state.cookies[0], "hostOnly")).toBe(false);
		expect(state.cookies[1].hostOnly).toBe(false);
		const restored = configured();
		restored.replaceState(state);
		expect(restored.exportState()).toEqual(source.exportState());
		expect(restored.cookieHeader(child, { siteUrl: child })).toBe(
			"same=domain",
		);
		const legacy = configured({}, {});
		expect(() => legacy.replaceState(state)).toThrow();
		expect(legacy.metrics().cookies).toBe(0);
		legacy.replaceState({ schemaVersion: 1, cookies: [state.cookies[0]] });
		expect(legacy.cookieHeader(child, { siteUrl: child })).toBe("");
		restored.replaceState({ schemaVersion: 1, cookies: [state.cookies[0]] });
		expect(restored.cookieHeader(child, { siteUrl: child })).toBe("");
	});

	it("rejects invalid or unenforceable state scopes atomically and without accessor evaluation", () => {
		const jar = configured();
		jar.setCookie(parent, "retained=synthetic; Path=/", { siteUrl: parent });
		const before = jar.exportState();
		const row = { ...before.cookies[0], hostOnly: false };
		const getter = vi.fn(() => false);
		for (const changed of [
			{ ...row, hostOnly: true },
			{ ...row, hostOnly: undefined },
			{ ...row, hostOnly: "false" },
			{ ...row, host: "com" },
			{ ...row, host: "github.io" },
			{ ...row, host: "127.0.0.1" },
			{ ...row, host: ".example.com" },
			{ ...row, host: "example.com." },
			{ ...row, name: "__Host-bad", secure: true },
			Object.defineProperty({ ...row }, "hostOnly", { get: getter }),
		]) {
			expect(() =>
				jar.replaceState({ schemaVersion: 1, cookies: [changed] }),
			).toThrow();
			expect(jar.exportState()).toEqual(before);
		}
		expect(getter).not.toHaveBeenCalled();
		expect(() =>
			jar.replaceState({ schemaVersion: 1, cookies: [row, { ...row }] }),
		).toThrow();
	});

	it("retains path priority, header/global limits and domain expiry", () => {
		let clock = now;
		const jar = new CookieJar(
			{ maxCookies: 2, maxHeaderBytes: 64 },
			() => clock,
			{ publicSuffixSnapshot: snapshot },
		);
		jars.push(jar);
		jar.setCookie(parent, "same=root; Domain=example.com; Path=/; Max-Age=1", {
			siteUrl: parent,
		});
		jar.setCookie(child, "same=deep; Domain=example.com; Path=/account", {
			siteUrl: child,
		});
		expect(jar.cookieHeader(`${sibling}account/page`, { siteUrl: child })).toBe(
			"same=deep; same=root",
		);
		expect(jar.cookieHeader(`${sibling}accounts`, { siteUrl: child })).toBe(
			"same=root",
		);
		expect(
			jar.setCookie("https://other.com/", "extra=synthetic", {
				siteUrl: "https://other.com/",
			}),
		).toMatchObject({ reason: "capacity" });
		clock += 1000;
		expect(jar.cookieHeader(sibling, { siteUrl: sibling })).toBe("");
		expect(jar.metrics().cookies).toBe(1);
		const bounded = configured({ maxHeaderBytes: 3 });
		bounded.setCookie(child, "large=synthetic; Domain=example.com", {
			siteUrl: child,
		});
		expect(() => bounded.cookieHeader(parent, { siteUrl: parent })).toThrow(
			"Cookie header limit",
		);
		const restored = configured({ maxCookiesPerHost: 1 });
		const entry = jar.exportState().cookies[0];
		expect(() =>
			restored.replaceState({
				schemaVersion: 1,
				cookies: [entry, { ...entry, name: "other" }],
			}),
		).toThrow("per-host limit");
		expect(restored.metrics().cookies).toBe(0);
	});

	it("state consumers reject domain scope without policy and preserve it with policy", () => {
		const source = configured();
		source.setCookie(child, "shared=synthetic; Domain=example.com; Path=/", {
			siteUrl: child,
		});
		const storage = new BrowserStorage();
		const transfers = new StateTransfers();
		const owners = [
			{ cookies: configured({}, {}), storage },
			{ cookies: configured(), storage },
		];
		try {
			const state = { ...source.exportState(), origins: [] };
			const previous = exportBrowserState(owners[0]);
			expect(() => replaceBrowserState(owners[0], state)).toThrow();
			expect(exportBrowserState(owners[0])).toEqual(previous);
			const bytes = new TextEncoder().encode(JSON.stringify(state));
			for (const [index, owner] of owners.entries()) {
				const transfer = transfers.begin(owner, bytes.length);
				transfers.append(owner, transfer.id, 0, encodeStateChunk(bytes));
				if (index === 0)
					expect(() => transfers.commit(owner, transfer.id)).toThrow();
				else expect(transfers.commit(owner, transfer.id).loaded).toBe(true);
				expect(transfers.metrics()).toMatchObject({ transfers: 0, bytes: 0 });
			}
			expect(
				owners[0].cookies.cookieHeader(sibling, { siteUrl: sibling }),
			).toBe("");
			expect(
				owners[1].cookies.cookieHeader(sibling, { siteUrl: sibling }),
			).toBe("shared=synthetic");
		} finally {
			for (const owner of owners) transfers.clear(owner);
			storage.close();
		}
	});

	it("does not cross a nested private suffix through a registrable ancestor", () => {
		const jar = configured();
		const tenant = "https://bucket.s3.amazonaws.com/";
		const ancestor = "https://amazonaws.com/";
		expect(
			jar.setCookie(
				tenant,
				"upward=synthetic; Domain=amazonaws.com; Secure; SameSite=None",
				{ siteUrl: tenant },
			).accepted,
		).toBe(false);
		expect(
			jar.setCookie(
				ancestor,
				"downward=synthetic; Domain=amazonaws.com; Secure; SameSite=None",
				{ siteUrl: ancestor },
			).accepted,
		).toBe(true);
		expect(jar.cookieHeader(tenant, { siteUrl: tenant })).toBe("");
		expect(
			jar.cookieHeader("https://ordinary.amazonaws.com/", {
				siteUrl: ancestor,
			}),
		).toBe("downward=synthetic");
	});
});
