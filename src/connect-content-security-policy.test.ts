import { expect, it } from "vitest";
import { ContentSecurityPolicy } from "./content-security-policy.js";

const documentUrl = "https://example.com/document";
const socketUrl = "wss://example.com/socket";

it.each([
	["", true],
	["connect-src *", true],
	["connect-src wss:", true],
	["connect-src ws:", true],
	["connect-src 'none'", false],
	["default-src 'none'", false],
	["default-src wss:", true],
	["default-src *; connect-src 'none'", false],
	["default-src 'none'; connect-src wss:", true],
	["connect-src; default-src *", false],
	["connect-src 'none'; connect-src *", false],
	["connect-src *; connect-src 'none'", true],
	["CONNECT-SRC wss:; connect-src 'none'", true],
	["default-src 'none'; default-src *", false],
	["connect-src wss:, default-src 'none'", false],
	["connect-src wss:, default-src *", true],
	["img-src 'none'; style-src 'none'; script-src 'none'", true],
	["style-src *; default-src 'none'", false],
	["connect-src 'nonce-YWJjZA=='", false],
	["connect-src 'unsafe-inline'", false],
	["connect-src 'none' wss:", true],
	["connect-src wss://example.com", true],
	["connect-src wss://other.example", false],
	["connect-src wss://example.com/socket", true],
	["connect-src wss://example.com/else", false],
	["connect-src wss://example.com/socket/", false],
] as const)("enforces WebSocket source selection for %s", (header, allowed) => {
	const policy = new ContentSecurityPolicy(documentUrl, [header], "connect");
	expect(policy.allows(socketUrl)).toBe(allowed);
});

it.each([
	["wss:", "ws://example.com/socket", false],
	["wss://example.com", "ws://example.com/socket", false],
	["ws:", "ws://example.com/socket", true],
	["ws:", "wss://example.com/socket", true],
	["ws://example.com", "wss://example.com/socket", true],
	["wss://example.com:443", socketUrl, true],
	["wss://example.com:80", socketUrl, false],
	["wss://example.com:8443", "wss://example.com:8443/socket", true],
	["wss://example.com", "wss://example.com:8443/socket", false],
	["wss://example.com:*", "wss://example.com:8443/socket", true],
	["ws://example.com:80", "ws://example.com/socket", true],
	["ws://example.com:443", "ws://example.com/socket", false],
	["wss://*.example.com", "wss://child.example.com/socket", true],
	["wss://*.example.com", socketUrl, false],
	["wss://*.example.com", "wss://notexample.com/socket", false],
	["wss://example.com/channels/", "wss://example.com/channels/one", true],
	["wss://example.com/channels/", "wss://example.com/channels", false],
	["wss://example.com/%73ocket", socketUrl, true],
] as const)(
	"matches explicit source %s against %s",
	(source, target, allowed) => {
		expect(
			new ContentSecurityPolicy(
				documentUrl,
				[`connect-src ${source}`],
				"connect",
			).allows(target),
		).toBe(allowed);
	},
);

it.each(["http://example.com/page", "https://example.com/page"])(
	"does not infer HTTP(S) self, scheme or schemeless WebSocket aliases for %s",
	(owner) => {
		for (const source of [
			"'self'",
			"http:",
			"https:",
			"example.com",
			"https://example.com",
		]) {
			const policy = new ContentSecurityPolicy(
				owner,
				[`connect-src ${source}`],
				"connect",
			);
			expect(policy.allows("ws://example.com/socket")).toBe(false);
			expect(policy.allows(socketUrl)).toBe(false);
		}
	},
);

it("intersects response headers and does not follow caller array mutation", () => {
	const headers = ["connect-src wss:", "default-src wss://example.com"];
	const policy = new ContentSecurityPolicy(documentUrl, headers, "connect");
	headers[1] = "default-src *";
	headers.pop();
	expect(policy.policyCount).toBe(2);
	expect(Object.isFrozen(policy)).toBe(true);
	expect(policy.allows(socketUrl)).toBe(true);
	expect(policy.allows("wss://other.example/socket")).toBe(false);
	expect(policy.allows("ws://example.com/socket")).toBe(false);
});

it.each(["image", "style"] as const)(
	"keeps %s HTTP-only matching and directive precedence unchanged",
	(destination) => {
		const headers = [
			"connect-src *; img-src 'self'; style-src-elem 'self'; default-src 'none'",
		];
		const policy = new ContentSecurityPolicy(documentUrl, headers, destination);
		expect(policy.allows("https://example.com/resource")).toBe(true);
		expect(policy.allows("https://other.example/resource")).toBe(false);
		expect(policy.allows(socketUrl)).toBe(false);
		expect(policy.allows("ws://example.com/socket")).toBe(false);
	},
);

it.each([
	"ftp://example.com/",
	"file:///socket",
	"data:text/plain,socket",
	"javascript:void(0)",
])("does not extend wildcard connect matching to %s", (target) => {
	expect(
		new ContentSecurityPolicy(documentUrl, ["connect-src *"], "connect").allows(
			target,
		),
	).toBe(false);
});

it.each([
	[
		"headers",
		Array.from({ length: 65 }, () => "connect-src *"),
		"Too many CSP headers",
	],
	[
		"units",
		["connect-src *".padEnd(32769, " ")],
		"CSP headers exceed the length limit",
	],
	[
		"policies",
		[Array.from({ length: 65 }, () => "connect-src *").join(",")],
		"Too many CSP policies",
	],
	["directives", [";".repeat(1024)], "Too many CSP directives"],
	[
		"sources",
		[`connect-src ${"wss: ".repeat(4097)}`],
		"Too many CSP source expressions",
	],
] as const)("bounds connect policy %s", (_name, headers, message) => {
	expect(
		() => new ContentSecurityPolicy(documentUrl, headers, "connect"),
	).toThrow(message);
});

it("bounds WebSocket CSP matching work", () => {
	const policy = new ContentSecurityPolicy(
		documentUrl,
		[`connect-src ${"wss://blocked.example ".repeat(1000)}`],
		"connect",
	);
	expect(() => policy.allows(`wss://example.com/${"x".repeat(1000)}`)).toThrow(
		"CSP matching work limit exceeded",
	);
});

it("rejects malformed runtime header input instead of installing an empty policy", () => {
	expect(
		() =>
			new ContentSecurityPolicy(
				documentUrl,
				null as unknown as string[],
				"connect",
			),
	).toThrow("CSP headers must be an array");
	expect(
		() =>
			new ContentSecurityPolicy(
				documentUrl,
				[42] as unknown as string[],
				"connect",
			),
	).toThrow("CSP header must be a string");
});
