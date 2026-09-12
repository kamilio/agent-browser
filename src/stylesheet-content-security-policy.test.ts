import { expect, it } from "vitest";
import { ContentSecurityPolicy } from "./content-security-policy.js";

const documentUrl = "https://example.com/document";
const stylesheetUrl = "https://example.com/styles/main.css";

it.each([
	["style-src-elem 'none'; style-src 'self'; default-src *", false],
	["style-src-elem; style-src 'self'", false],
	["style-src-elem 'self'; style-src 'none'", true],
	["style-src 'self'; style-src-elem 'none'", false],
	["style-src-elem 'none'; style-src-elem 'self'", false],
	["style-src-elem 'self'; style-src-elem 'none'", true],
	["style-src 'none'; default-src 'self'", false],
	["default-src 'none'; style-src 'self'", true],
	["style-src; default-src 'self'", false],
	["default-src 'self'", true],
	["default-src 'none'", false],
	["style-src-attr 'none'", true],
	["img-src 'none'; script-src 'none'", true],
	["STYLE-SRC-ELEM 'self'; style-src 'none'", true],
	["style-src-elem 'nonsense'; style-src 'self'", false],
	["style-src 'nonce-YWJjZA=='", false],
	["style-src 'sha256-YWJjZA=='", false],
	["style-src 'unsafe-inline'", false],
	["style-src 'nonce-YWJjZA==' 'self'", true],
	["style-src 'unsafe-inline' 'self'", true],
	["style-src-elem https://other.example; style-src 'self'", false],
	["style-src https://example.com/styles/", true],
	["style-src https://example.com/styles/main.css", true],
	["style-src https://example.com/styles/else.css", false],
	["style-src-elem 'self', default-src 'none'", false],
	["style-src-elem 'self', style-src 'self'", true],
] as const)("matches external style URL policy %s", (header, expected) => {
	const policy = new ContentSecurityPolicy(documentUrl, [header], "style");
	expect(policy.allows(stylesheetUrl)).toBe(expected);
});

it("intersects immutable independently enforced stylesheet headers", () => {
	const headers = ["style-src *", "style-src-elem 'self'"];
	const policy = new ContentSecurityPolicy(documentUrl, headers, "style");
	headers[1] = "style-src-elem *";
	headers.pop();
	expect(policy.policyCount).toBe(2);
	expect(Object.isFrozen(policy)).toBe(true);
	expect(policy.allows(stylesheetUrl)).toBe(true);
	expect(policy.allows("https://other.example/styles.css")).toBe(false);
});

it.each(["style-src-elem", "style-src", "default-src"])(
	"skips only %s source paths on redirected stylesheet checks",
	(directive) => {
		const policy = new ContentSecurityPolicy(
			documentUrl,
			[`${directive} https://example.com/styles/main.css`],
			"style",
		);
		expect(policy.allows("https://example.com/other.css")).toBe(false);
		expect(policy.allows("https://example.com/other.css", 1)).toBe(true);
		expect(policy.allows("https://other.example/other.css", 1)).toBe(false);
		expect(policy.allows("http://example.com/other.css", 1)).toBe(false);
	},
);

it("keeps image and style directive selection independent", () => {
	const headers = ["img-src 'none'; style-src-elem 'self'; default-src 'none'"];
	expect(
		new ContentSecurityPolicy(documentUrl, headers, "image").allows(
			stylesheetUrl,
		),
	).toBe(false);
	expect(
		new ContentSecurityPolicy(documentUrl, headers, "style").allows(
			stylesheetUrl,
		),
	).toBe(true);
});

it("rejects unsupported destinations rather than weakening fallback", () => {
	expect(
		() => new ContentSecurityPolicy(documentUrl, [], "script" as "style"),
	).toThrow("Invalid CSP destination");
});
