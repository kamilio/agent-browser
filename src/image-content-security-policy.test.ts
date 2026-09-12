import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { ImageContentSecurityPolicy } from "./image-content-security-policy.js";

const documentUrl = "https://example.com/document";
type Vector = readonly [
	name: string,
	headers: readonly string[],
	url: string,
	allowed: boolean,
	document?: string,
	redirectCount?: number,
];

const vectors: readonly Vector[] = [
	["no headers", [], "https://other.test/a", true],
	["empty headers", ["", " ; , ; "], "https://other.test/a", true],
	[
		"unrelated directives",
		["script-src 'none'; style-src 'none'; sandbox"],
		"https://other.test/a",
		true,
	],
	["default denial", ["default-src 'none'"], "https://example.com/a", false],
	["default fallback", ["default-src 'self'"], "https://example.com/a", true],
	[
		"default not unioned",
		["default-src *; img-src 'none'"],
		"https://example.com/a",
		false,
	],
	[
		"image overrides default",
		["img-src *; default-src 'none'"],
		"https://other.test/a",
		true,
	],
	[
		"empty image overrides default",
		["default-src *; img-src"],
		"https://example.com/a",
		false,
	],
	["empty default", ["default-src"], "https://example.com/a", false],
	[
		"empty image whitespace",
		["img-src \t\r\n\f"],
		"https://example.com/a",
		false,
	],
	["none", ["img-src 'none'"], "https://example.com/a", false],
	["none case", ["IMG-SRC 'NoNe'"], "https://example.com/a", false],
	["mixed none self", ["img-src 'none' 'self'"], "https://example.com/a", true],
	[
		"mixed none other",
		["img-src 'none' 'self'"],
		"https://other.test/a",
		false,
	],
	["mixed none wildcard", ["img-src 'none' *"], "https://other.test/a", true],
	[
		"duplicate first denial",
		["img-src 'none'; img-src *"],
		"https://example.com/a",
		false,
	],
	[
		"duplicate first allowance",
		["img-src *; IMG-SRC 'none'"],
		"https://other.test/a",
		true,
	],
	["duplicate empty", ["img-src; img-src *"], "https://example.com/a", false],
	[
		"duplicate default",
		["default-src 'none'; DEFAULT-SRC *"],
		"https://example.com/a",
		false,
	],
	[
		"intersect header denial",
		["img-src *", "img-src 'none'"],
		"https://example.com/a",
		false,
	],
	[
		"intersect header overlap",
		["img-src https:", "img-src 'self'"],
		"https://example.com/a",
		true,
	],
	[
		"intersect header no overlap",
		["img-src https://one.test", "img-src https://two.test"],
		"https://one.test/a",
		false,
	],
	[
		"comma denial",
		["img-src *, img-src 'none'"],
		"https://example.com/a",
		false,
	],
	[
		"comma overlap",
		["img-src https:, default-src 'self'"],
		"https://example.com/a",
		true,
	],
	[
		"comma empty tokens",
		[", img-src *, , script-src 'none',"],
		"https://other.test/a",
		true,
	],
	["semicolon empty tokens", [";; img-src * ;;"], "https://other.test/a", true],
	[
		"ASCII whitespace and case",
		[" \tImG-SrC\f'SeLf'\r\n"],
		"https://example.com/a",
		true,
	],
	[
		"vertical tab not whitespace",
		["img-src\v *; default-src 'none'"],
		"https://example.com/a",
		false,
	],
	[
		"NUL is invalid expression",
		["img-src https:\0"],
		"https://example.com/a",
		false,
	],
	[
		"nonASCII directive skipped",
		["default-src 'none'; img-src https://bücher.test"],
		"https://xn--bcher-kva.test/a",
		false,
	],
	[
		"nonASCII token does not establish duplicate",
		["img-src https://bücher.test; img-src *"],
		"https://other.test/a",
		true,
	],
	[
		"NBSP is not ASCII whitespace",
		["default-src 'none'; img-src\u00a0*"],
		"https://other.test/a",
		false,
	],
	["self", ["img-src 'self'"], "https://example.com/a?query#fragment", true],
	[
		"self excludes subdomain",
		["img-src 'self'"],
		"https://sub.example.com/a",
		false,
	],
	[
		"self excludes other port",
		["img-src 'self'"],
		"https://example.com:444/a",
		false,
	],
	["self no downgrade", ["img-src 'self'"], "http://example.com/a", false],
	[
		"self secure upgrade",
		["img-src 'self'"],
		"https://example.com/a",
		true,
		"http://example.com/doc",
	],
	[
		"self same nondefault port",
		["img-src 'self'"],
		"https://example.com:8080/a",
		true,
		"http://example.com:8080/doc",
	],
	[
		"self changed nondefault port",
		["img-src 'self'"],
		"https://example.com:8081/a",
		false,
		"http://example.com:8080/doc",
	],
	[
		"self normalized default upgrade",
		["img-src 'self'"],
		"https://example.com:443/a",
		true,
		"http://example.com:80/doc",
	],
	[
		"self explicit 80 target not default https",
		["img-src 'self'"],
		"https://example.com:80/a",
		false,
		"http://example.com:80/doc",
	],
	[
		"self opaque data",
		["img-src 'self'"],
		"https://example.com/a",
		false,
		"data:text/html,hello",
	],
	[
		"self opaque file",
		["img-src 'self'"],
		"https://example.com/a",
		false,
		"file:///example.com",
	],
	[
		"self opaque about",
		["img-src 'self'"],
		"https://example.com/a",
		false,
		"about:blank",
	],
	[
		"self blob tuple origin",
		["img-src 'self'"],
		"https://example.com/a",
		true,
		"blob:https://example.com/id",
	],
	[
		"self blob opaque",
		["img-src 'self'"],
		"https://example.com/a",
		false,
		"blob:null/id",
	],
	[
		"explicit source from opaque",
		["img-src https://example.com"],
		"https://example.com/a",
		true,
		"data:text/html,hello",
	],
	[
		"schemeless source from opaque",
		["img-src example.com"],
		"https://example.com/a",
		false,
		"data:text/html,hello",
	],
	[
		"schemeless blob tuple",
		["img-src example.com"],
		"https://example.com/a",
		true,
		"blob:https://example.com/id",
	],
	[
		"self default ftp to https captured branch",
		["img-src 'self'"],
		"https://example.com/a",
		true,
		"ftp://example.com/doc",
	],
	["wildcard HTTP", ["img-src *"], "http://other.test/a", true],
	[
		"wildcard opaque document",
		["img-src *"],
		"https://other.test/a",
		true,
		"about:blank",
	],
	["scheme https", ["img-src HTTPS:"], "https://other.test/a", true],
	["scheme insecure upgrade", ["img-src http:"], "https://other.test/a", true],
	["scheme no downgrade", ["img-src https:"], "http://other.test/a", false],
	["scheme ws to http", ["img-src ws:"], "http://other.test/a", true],
	["scheme ws to https", ["img-src ws:"], "https://other.test/a", true],
	["scheme wss to https", ["img-src wss:"], "https://other.test/a", true],
	["scheme wss not http", ["img-src wss:"], "http://other.test/a", false],
	["unrelated scheme", ["img-src ftp:"], "https://other.test/a", false],
	[
		"scheme port unrestricted",
		["img-src https:"],
		"https://other.test:8443/a",
		true,
	],
	["host case", ["img-src HTTPS://EXAMPLE.COM"], "https://EXAMPLE.com/a", true],
	[
		"host upgrade",
		["img-src http://example.com"],
		"https://example.com/a",
		true,
	],
	[
		"host no downgrade",
		["img-src https://example.com"],
		"http://example.com/a",
		false,
	],
	[
		"schemeless upgrade",
		["img-src example.com"],
		"https://example.com/a",
		true,
		"http://document.test/",
	],
	[
		"schemeless no downgrade",
		["img-src example.com"],
		"http://example.com/a",
		false,
	],
	[
		"schemeless ws origin",
		["img-src example.com"],
		"http://example.com/a",
		true,
		"ws://document.test/",
	],
	[
		"domain exact excludes subdomain",
		["img-src example.com"],
		"https://sub.example.com/a",
		false,
	],
	[
		"domain exact excludes suffix",
		["img-src example.com"],
		"https://badexample.com/a",
		false,
	],
	[
		"domain exact excludes trailing dot",
		["img-src example.com"],
		"https://example.com./a",
		false,
	],
	[
		"trailing dot source",
		["img-src example.com."],
		"https://example.com./a",
		true,
	],
	[
		"subdomain wildcard",
		["img-src *.example.com"],
		"https://sub.example.com/a",
		true,
	],
	[
		"nested subdomain wildcard",
		["img-src *.example.com"],
		"https://deep.sub.example.com/a",
		true,
	],
	[
		"wildcard excludes apex",
		["img-src *.example.com"],
		"https://example.com/a",
		false,
	],
	[
		"wildcard dotted boundary",
		["img-src *.example.com"],
		"https://badexample.com/a",
		false,
	],
	[
		"wildcard suffix boundary",
		["img-src *.example.com"],
		"https://example.com.evil.test/a",
		false,
	],
	[
		"wildcard case",
		["img-src *.EXAMPLE.COM"],
		"https://SUB.example.com/a",
		true,
	],
	[
		"schemed host wildcard",
		["img-src https://*"],
		"https://other.test/a",
		true,
	],
	[
		"host wildcard scheme retained",
		["img-src https://*"],
		"http://other.test/a",
		false,
	],
	[
		"wildcard port scheme inherited",
		["img-src *:*"],
		"http://other.test:8080/a",
		false,
	],
	[
		"punycode source unicode URL",
		["img-src xn--bcher-kva.test"],
		"https://bücher.test/a",
		true,
	],
	[
		"punycode source ASCII URL",
		["img-src xn--bcher-kva.test"],
		"https://xn--bcher-kva.test/a",
		true,
	],
	[
		"IDN wildcard",
		["img-src *.xn--bcher-kva.test"],
		"https://sub.bücher.test/a",
		true,
	],
	[
		"percent normalized target host",
		["img-src example.com"],
		"https://%65xample.com/a",
		true,
	],
	[
		"absent port default",
		["img-src example.com"],
		"https://example.com:443/a",
		true,
	],
	[
		"absent port nondefault",
		["img-src example.com"],
		"https://example.com:444/a",
		false,
	],
	[
		"explicit default port",
		["img-src example.com:443"],
		"https://example.com/a",
		true,
	],
	[
		"decimal leading zero port",
		["img-src example.com:00443"],
		"https://example.com/a",
		true,
	],
	[
		"explicit nondefault port",
		["img-src example.com:8443"],
		"https://example.com:8443/a",
		true,
	],
	[
		"explicit port mismatch",
		["img-src example.com:8443"],
		"https://example.com/a",
		false,
	],
	[
		"port wildcard",
		["img-src example.com:*"],
		"https://example.com:8443/a",
		true,
	],
	["zero port", ["img-src example.com:0"], "https://example.com:0/a", true],
	[
		"port upgrade not 80 to 443",
		["img-src http://example.com:80"],
		"https://example.com/a",
		false,
	],
	[
		"port upgrade same 80",
		["img-src http://example.com:80"],
		"https://example.com:80/a",
		true,
	],
	[
		"port 443 upgrades",
		["img-src http://example.com:443"],
		"https://example.com/a",
		true,
	],
	[
		"path exact",
		["img-src https://example.com/images/a.png"],
		"https://example.com/images/a.png",
		true,
	],
	[
		"path exact not prefix",
		["img-src https://example.com/images/a.png"],
		"https://example.com/images/a.png/child",
		false,
	],
	[
		"path exact not suffix",
		["img-src https://example.com/images/a.png"],
		"https://example.com/images/a.pngx",
		false,
	],
	[
		"path query fragment ignored",
		["img-src https://example.com/images/a.png"],
		"https://example.com/images/a.png?q=/else#different",
		true,
	],
	[
		"path case sensitive",
		["img-src https://example.com/Images/a.png"],
		"https://example.com/images/a.png",
		false,
	],
	[
		"path directory",
		["img-src https://example.com/images/"],
		"https://example.com/images/a/b.png",
		true,
	],
	[
		"path directory itself",
		["img-src https://example.com/images/"],
		"https://example.com/images/",
		true,
	],
	[
		"path directory needs slash",
		["img-src https://example.com/images/"],
		"https://example.com/images",
		false,
	],
	[
		"path directory boundary",
		["img-src https://example.com/images/"],
		"https://example.com/images-evil/a",
		false,
	],
	[
		"root directory",
		["img-src https://example.com/"],
		"https://example.com/a/b",
		true,
	],
	[
		"path percent ascii",
		["img-src https://example.com/%61.png"],
		"https://example.com/a.png",
		true,
	],
	[
		"path percent target",
		["img-src https://example.com/a.png"],
		"https://example.com/%61.png",
		true,
	],
	[
		"path percent UTF8",
		["img-src https://example.com/%C3%A9.png"],
		"https://example.com/é.png",
		true,
	],
	[
		"path percent invalid UTF8 byte equality",
		["img-src https://example.com/%FF"],
		"https://example.com/%ff",
		true,
	],
	[
		"path invalid UTF8 not replacement character",
		["img-src https://example.com/%FF"],
		"https://example.com/%EF%BF%BD",
		false,
	],
	[
		"encoded slash remains segment",
		["img-src https://example.com/a%2Fb"],
		"https://example.com/a/b",
		false,
	],
	[
		"encoded slash case",
		["img-src https://example.com/a%2Fb"],
		"https://example.com/a%2fb",
		true,
	],
	[
		"encoded slash not directory boundary",
		["img-src https://example.com/a/"],
		"https://example.com/a%2fb/c",
		false,
	],
	[
		"encoded directory slash boundary",
		["img-src https://example.com/a%2F/"],
		"https://example.com/a//b",
		false,
	],
	[
		"double encoding not recursively decoded",
		["img-src https://example.com/a%252Fb"],
		"https://example.com/a%2Fb",
		false,
	],
	[
		"encoded percent literal target",
		["img-src https://example.com/%25zz"],
		"https://example.com/%zz",
		true,
	],
	[
		"encoded question hash",
		["img-src https://example.com/a%3Fb%23c"],
		"https://example.com/a%3fb%23c",
		true,
	],
	[
		"target dot segments normalized",
		["img-src https://example.com/ok.png"],
		"https://example.com/dir/../ok.png",
		true,
	],
	[
		"target encoded dot normalized",
		["img-src https://example.com/ok.png"],
		"https://example.com/dir/%2e%2e/ok.png",
		true,
	],
	[
		"source dots not normalized",
		["img-src https://example.com/dir/../ok.png"],
		"https://example.com/ok.png",
		false,
	],
	[
		"source encoded dots not normalized",
		["img-src https://example.com/%2e/ok.png"],
		"https://example.com/ok.png",
		false,
	],
	[
		"interior empty path segments",
		["img-src https://example.com/a//b"],
		"https://example.com/a//b",
		true,
	],
	[
		"interior empty segment distinct",
		["img-src https://example.com/a//b"],
		"https://example.com/a/b",
		false,
	],
	[
		"target backslash normalized",
		["img-src https://example.com/a/b"],
		"https://example.com/a\\b",
		true,
	],
	[
		"target credentials do not change origin",
		["img-src 'self'"],
		"https://user:placeholder@example.com/a",
		true,
	],
	[
		"redirect skips path",
		["img-src https://example.com/allowed/"],
		"https://example.com/denied.png",
		true,
		documentUrl,
		1,
	],
	[
		"zero redirect checks path",
		["img-src https://example.com/allowed/"],
		"https://example.com/denied.png",
		false,
		documentUrl,
		0,
	],
	[
		"redirect retains host",
		["img-src https://example.com/allowed/"],
		"https://other.test/allowed/a",
		false,
		documentUrl,
		2,
	],
	[
		"redirect retains scheme",
		["img-src https://example.com/allowed/"],
		"http://example.com/allowed/a",
		false,
		documentUrl,
		2,
	],
	[
		"redirect retains port",
		["img-src https://example.com/allowed/"],
		"https://example.com:8443/allowed/a",
		false,
		documentUrl,
		2,
	],
	[
		"redirect retains intersections",
		["img-src https://example.com/allowed/, img-src 'none'"],
		"https://example.com/else",
		false,
		documentUrl,
		3,
	],
	[
		"redirect does not rescue invalid source path",
		["img-src https://example.com/a?query"],
		"https://example.com/else",
		false,
		documentUrl,
		1,
	],
	[
		"literal IPv4 loopback denied",
		["img-src http://127.0.0.1"],
		"http://127.0.0.1/a",
		false,
	],
	[
		"literal IPv4 public denied",
		["img-src https://192.0.2.1"],
		"https://192.0.2.1/a",
		false,
	],
	["literal IPv6 denied", ["img-src https://[::1]"], "https://[::1]/a", false],
	[
		"schemed wildcard IPv4 denied",
		["img-src http://*"],
		"http://127.0.0.1/a",
		false,
	],
	[
		"schemed wildcard IPv6 denied",
		["img-src https://*"],
		"https://[::1]/a",
		false,
	],
	[
		"numeric short URL host denied",
		["img-src http://*"],
		"http://127.1/a",
		false,
	],
	[
		"numeric hex URL host denied",
		["img-src http://*"],
		"http://0x7f000001/a",
		false,
	],
	[
		"numeric literal source denied",
		["img-src http://2130706433"],
		"http://127.0.0.1/a",
		false,
	],
	[
		"standalone wildcard allows HTTP IPv4",
		["img-src *"],
		"http://127.0.0.1/a",
		true,
	],
	["scheme allows HTTP IPv6", ["img-src https:"], "https://[::1]/a", true],
	[
		"self IPv4 separate",
		["img-src 'self'"],
		"http://127.0.0.1/a",
		true,
		"http://127.0.0.1/doc",
	],
	[
		"self IPv6 separate",
		["img-src 'self'"],
		"https://[::1]/a",
		true,
		"https://[::1]/doc",
	],
	[
		"self IPv4 secure upgrade",
		["img-src 'self'"],
		"https://127.0.0.1/a",
		true,
		"http://127.0.0.1/doc",
	],
];

it.each(
	vectors.map(
		([
			name,
			headers,
			url,
			expected,
			document = documentUrl,
			redirects = 0,
		]) => ({ name, headers, url, expected, document, redirects }),
	),
)(
	"literal URL oracle: $name",
	({ headers, url, expected, document, redirects }) => {
		const policy = new ImageContentSecurityPolicy(document, headers);
		expect(policy.allows(url, redirects)).toBe(expected);
		expect(policy.allows(url, redirects)).toBe(expected);
	},
);

const invalidExpressions = [
	"'unknown'",
	"'unsafe-inline'",
	"'unsafe-eval'",
	"'nonce-YWJj'",
	"'sha256-YWJj'",
	'"self"',
	"'https:'",
	"https",
	"https:/example.com",
	"//example.com",
	"https:///example.com",
	"https://user@example.com",
	"https://example.com?query",
	"https://example.com/#fragment",
	"https://example.com/a?query",
	"https://example.com/a#fragment",
	"https://example.com/a\\b",
	"https://example.com/%",
	"https://example.com/%GG",
	"https://example.com//a",
	"https://example.com/a[b]",
	"https://example.com:",
	"https://example.com:+443",
	"https://example.com:-1",
	"https://example.com:443.0",
	"https://example.com:65536",
	"https://example.com:9999999999999999999999999999999999999999",
	"https://*example.com",
	"https://example.*",
	"https://**.example.com",
	"https://.example.com",
	"https://example..com",
	"https://example_com",
	"https://%65xample.com",
	"https://example.com/|",
	"https://example.com/<",
];

it.each(invalidExpressions)(
	"invalid or nonmatching expression never grants: %s",
	(expression) => {
		const policy = new ImageContentSecurityPolicy(documentUrl, [
			`img-src ${expression}`,
		]);
		expect(policy.allows("https://example.com/a")).toBe(false);
		expect(policy.allows("https://example.com/a", 1)).toBe(false);
	},
);

it.each([
	"data:image/png,placeholder",
	"blob:https://example.com/id",
	"file:///image.png",
	"about:blank",
	"ftp://example.com/a",
	"ws://example.com/a",
	"wss://example.com/a",
	"custom:opaque",
])("native HTTP(S)-only even without restrictions: %s", (url) => {
	for (const headers of [
		[],
		["img-src * data: blob: file: about: ftp: ws: wss: custom:"],
	])
		expect(
			new ImageContentSecurityPolicy(documentUrl, headers).allows(url),
		).toBe(false);
});

it.each([
	[[], 0],
	[["", ", ; ,"], 0],
	[["img-src *"], 1],
	[["img-src *; img-src 'none'"], 1],
	[["img-src *, default-src 'self'", "script-src 'none'"], 3],
	[["unknown value"], 1],
	[["img-src https://bücher.test"], 0],
] as const)("counts only nonempty parsed policies: %j", (headers, expected) => {
	expect(new ImageContentSecurityPolicy(documentUrl, headers).policyCount).toBe(
		expected,
	);
});

function expectCode(
	operation: () => unknown,
	code: "invalid-input" | "resource-limit",
): void {
	expect(operation).toThrow(AgentBrowserError);
	expect(operation).toThrow(expect.objectContaining({ code }));
}

it.each([null, undefined, 12, {}, "img-src *", [null], [1], new Array(1)])(
	"rejects malformed header API input: %j",
	(headers) => {
		expectCode(
			() =>
				new ImageContentSecurityPolicy(
					documentUrl,
					headers as readonly string[],
				),
			"invalid-input",
		);
	},
);

it.each([
	null,
	undefined,
	12,
	{},
	"",
	"/relative",
	"not a URL",
	"https://[broken",
	"https://example.com:99999/",
])("rejects malformed URL API input: %j", (url) => {
	expectCode(
		() => new ImageContentSecurityPolicy(url as string, []),
		"invalid-input",
	);
	expectCode(
		() => new ImageContentSecurityPolicy(documentUrl, []).allows(url as string),
		"invalid-input",
	);
});

it.each([
	-1,
	0.1,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	"1",
	null,
])("rejects malformed redirect count: %j", (redirects) => {
	expectCode(
		() =>
			new ImageContentSecurityPolicy(documentUrl, []).allows(
				documentUrl,
				redirects as number,
			),
		"invalid-input",
	);
});

it("accepts the maximum safe redirect count without multiplying work", () => {
	expect(
		new ImageContentSecurityPolicy(documentUrl, [
			"img-src example.com/no",
		]).allows(documentUrl, Number.MAX_SAFE_INTEGER),
	).toBe(true);
});

it("copies inputs and freezes the public policy object", () => {
	const headers = ["img-src 'self'"];
	const policy = new ImageContentSecurityPolicy(documentUrl, headers);
	headers[0] = "img-src *";
	headers.push("img-src 'none'");
	expect(Object.isFrozen(policy)).toBe(true);
	expect(() => Object.assign(policy, { policyCount: 0 })).toThrow(TypeError);
	expect(() => Object.assign(policy, { allows: () => true })).toThrow(
		TypeError,
	);
	for (let iteration = 0; iteration < 20; iteration++) {
		expect(policy.policyCount).toBe(1);
		expect(policy.allows("https://example.com/a")).toBe(true);
		expect(policy.allows("https://other.test/a")).toBe(false);
	}
});

it("resets per-call path and work state", () => {
	const policy = new ImageContentSecurityPolicy(documentUrl, [
		"img-src example.com/yes",
	]);
	for (let iteration = 0; iteration < 20; iteration++) {
		expect(policy.allows("https://example.com/no", 1)).toBe(true);
		expect(policy.allows("https://example.com/no")).toBe(false);
		expect(policy.allows("https://example.com/yes")).toBe(true);
	}
});

it("bounds aggregate header units inclusively", () => {
	const exact = `unknown ${"x".repeat(32768 - 8)}`;
	expect(
		new ImageContentSecurityPolicy(documentUrl, [exact]).allows(documentUrl),
	).toBe(true);
	expectCode(
		() => new ImageContentSecurityPolicy(documentUrl, [`${exact}x`]),
		"resource-limit",
	);
	expectCode(
		() => new ImageContentSecurityPolicy(documentUrl, [exact, "x"]),
		"resource-limit",
	);
});

it("bounds headers and comma policies including empty slots", () => {
	expect(
		new ImageContentSecurityPolicy(documentUrl, Array(64).fill("img-src *"))
			.policyCount,
	).toBe(64);
	expectCode(
		() => new ImageContentSecurityPolicy(documentUrl, Array(65).fill("")),
		"resource-limit",
	);
	expect(
		new ImageContentSecurityPolicy(documentUrl, [
			Array(64).fill("img-src *").join(","),
		]).policyCount,
	).toBe(64);
	expectCode(
		() =>
			new ImageContentSecurityPolicy(documentUrl, [
				Array(65).fill("img-src *").join(","),
			]),
		"resource-limit",
	);
	expect(
		new ImageContentSecurityPolicy(documentUrl, [",".repeat(63)]).policyCount,
	).toBe(0);
	expectCode(
		() => new ImageContentSecurityPolicy(documentUrl, [",".repeat(64)]),
		"resource-limit",
	);
});

it("bounds all directive slots, including empty and duplicate ones", () => {
	expect(
		new ImageContentSecurityPolicy(documentUrl, [";".repeat(1023)]).policyCount,
	).toBe(0);
	expectCode(
		() => new ImageContentSecurityPolicy(documentUrl, [";".repeat(1024)]),
		"resource-limit",
	);
	expect(
		new ImageContentSecurityPolicy(documentUrl, [
			Array(1024).fill("img-src *").join(";"),
		]).allows(documentUrl),
	).toBe(true);
	expectCode(
		() =>
			new ImageContentSecurityPolicy(documentUrl, [
				Array(1025).fill("img-src *").join(";"),
			]),
		"resource-limit",
	);
});

it("bounds all source expressions, including ignored directives and duplicates", () => {
	const values = Array(4096).fill("*").join(" ");
	expect(
		new ImageContentSecurityPolicy(documentUrl, [`img-src ${values}`]).allows(
			documentUrl,
		),
	).toBe(true);
	for (const header of [
		`img-src ${values} *`,
		`unknown ${values} *`,
		`img-src *; img-src ${values}`,
		`img-src *; unknown é ${values}`,
	])
		expectCode(
			() => new ImageContentSecurityPolicy(documentUrl, [header]),
			"resource-limit",
		);
});

it("bounds raw and normalized URL length for documents and matches", () => {
	const exact = `https://example.com/${"a".repeat(4096 - 20)}`;
	expect(exact.length).toBe(4096);
	expect(new ImageContentSecurityPolicy(exact, []).allows(exact)).toBe(true);
	for (const url of [`${exact}a`, `https://example.com/${"é".repeat(1000)}`]) {
		expectCode(() => new ImageContentSecurityPolicy(url, []), "resource-limit");
		expectCode(
			() => new ImageContentSecurityPolicy(documentUrl, []).allows(url),
			"resource-limit",
		);
	}
});

it("throws on bounded matching exhaustion instead of reaching a late allowance", () => {
	const policy = new ImageContentSecurityPolicy(documentUrl, [
		`img-src ${Array(1000).fill("no.test").join(" ")} *`,
	]);
	const expensive = `https://example.com/${"a".repeat(3000)}`;
	expectCode(() => policy.allows(expensive), "resource-limit");
	expectCode(() => policy.allows(expensive, 1), "resource-limit");
	expect(policy.allows("https://example.com/a")).toBe(true);
});
