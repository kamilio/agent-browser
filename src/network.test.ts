import { expect, it } from "vitest";
import {
	NetworkPolicy,
	addressFamily,
	decodeResponseText,
	isPublicAddress,
	parseNetworkUrl,
} from "./network.js";

it.each([
	"0.0.0.0",
	"0.255.255.255",
	"10.0.0.1",
	"100.64.0.0",
	"100.127.255.255",
	"127.0.0.1",
	"127.255.255.255",
	"169.254.169.254",
	"172.16.0.0",
	"172.31.255.255",
	"192.0.0.9",
	"192.0.2.1",
	"192.88.99.1",
	"192.168.1.1",
	"198.18.0.0",
	"198.19.255.255",
	"198.51.100.1",
	"203.0.113.1",
	"224.0.0.1",
	"255.255.255.255",
	"::",
	"::1",
	"::ffff:127.0.0.1",
	"::ffff:8.8.8.8",
	"64:ff9b::7f00:1",
	"100::1",
	"2001::1",
	"2001:1ff:ffff::1",
	"2001:db8::1",
	"2002:7f00:1::1",
	"3fff::1",
	"3fff:fff:ffff::1",
	"5f00::1",
	"fc00::1",
	"fd00::1",
	"fe80::1",
	"ff02::1",
	"example.com",
	"127.1",
	"0177.0.0.1",
	"1.2.3.256",
	"fe80::1%eth0",
	"bad::address",
])(
	"denies reserved, translated, private and nonliteral address %s",
	(address) => {
		expect(isPublicAddress(address)).toBe(false);
	},
);

it.each([
	"1.1.1.1",
	"8.8.8.8",
	"100.63.255.255",
	"100.128.0.0",
	"172.15.255.255",
	"172.32.0.0",
	"198.17.255.255",
	"198.20.0.0",
	"223.255.255.255",
	"2001:200::1",
	"2001:4860:4860::8888",
	"2606:4700:4700::1111",
	"3ffe::1",
	"3fff:1000::1",
])("allows ordinary global unicast address %s", (address) => {
	expect(isPublicAddress(address)).toBe(true);
});

it.each([
	"http://127.1",
	"http://2130706433",
	"http://0x7f000001",
	"http://0177.0.0.1",
	"http://[::ffff:127.0.0.1]",
	"http://[::1]",
	"http://localhost.",
	"http://service.local",
	"http://a.localhost",
	"http://service.internal",
	"http://169.254.169.254/latest/meta-data",
])("normalizes URL syntax before rejecting private target %s", (url) => {
	expect(() => new NetworkPolicy().checkUrl(url)).toThrow();
});

it("validates every address and keeps private opt-ins exact-origin and independent of allowlists", () => {
	const policy = new NetworkPolicy();
	expect(() =>
		policy.checkAddresses("https://example.com", ["8.8.8.8", "127.0.0.1"]),
	).toThrow("DNS returned");
	expect(() => policy.checkAddresses("https://example.com", [])).toThrow(
		"DNS address",
	);
	expect(() =>
		policy.checkAddresses("https://example.com", Array(65).fill("8.8.8.8")),
	).toThrow("DNS address");
	const local = new NetworkPolicy({
		allowPrivateOrigins: ["http://localhost:9000"],
	});
	expect(() =>
		local.checkAddresses("http://localhost:9000/path", ["127.0.0.1"]),
	).not.toThrow();
	expect(() => local.checkUrl("http://localhost:9001")).toThrow();
	expect(() => local.checkUrl("https://localhost:9000")).toThrow();
	const allowlist = new NetworkPolicy({ allowedOrigins: ["http://127.0.0.1"] });
	expect(() => allowlist.checkUrl("http://127.0.0.1")).toThrow("Private");
	expect(() => allowlist.checkUrl("https://example.com")).toThrow("origin");
	expect(() =>
		new NetworkPolicy({ allowedOrigins: [] }).checkUrl("https://example.com"),
	).toThrow("origin");
});

it("rejects dangerous schemes, URL credentials and malformed policy without echoing secrets", () => {
	for (const value of [
		"file:///etc/passwd",
		"data:text/plain,test",
		"javascript:alert(1)",
		"ftp://example.com",
	])
		expect(() => parseNetworkUrl(value)).toThrow("Only HTTP");
	expect(() => parseNetworkUrl("https://user:SECRET@example.com")).toThrow(
		"Credentials in URLs",
	);
	expect(() => parseNetworkUrl("https://exam\nple.com")).toThrow(
		"Invalid network URL",
	);
	expect(() =>
		parseNetworkUrl(`https://example.com/${"a".repeat(16_384)}`),
	).toThrow();
	expect(
		() => new NetworkPolicy({ allowedOrigins: ["https://example.com/path"] }),
	).toThrow("origins, not paths");
	expect(addressFamily("2001:4860::1")).toBe(6);
	expect(addressFamily("8.8.8.8")).toBe(4);
	expect(addressFamily("hello")).toBe(0);
});

it("decodes declared HTTP character sets and gives Unicode BOMs precedence", () => {
	expect(
		decodeResponseText({
			headers: { "content-type": ['text/plain; charset="windows-1252"'] },
			body: new Uint8Array([0x80]),
		}),
	).toEqual({ text: "€", encoding: "windows-1252" });
	expect(
		decodeResponseText({
			headers: { "content-type": ["text/html; charset=windows-1252"] },
			body: new Uint8Array([0xff, 0xfe, 0x6f, 0, 0x6b, 0]),
		}),
	).toEqual({ text: "ok", encoding: "utf-16le" });
	expect(
		decodeResponseText({
			headers: {},
			body: new TextEncoder().encode("日本語"),
		}).text,
	).toBe("日本語");
	expect(() =>
		decodeResponseText({
			headers: { "content-type": ["text/plain; charset=unknown-encoding"] },
			body: new Uint8Array(),
		}),
	).toThrow("Unsupported response text encoding");
});

it.each([0, 21, 22, 25, 53, 443 + 22, 6000, 6667, 10080])(
	"rejects Fetch-blocked port %i even on an opted-in origin",
	(port) => {
		const origin = `http://127.0.0.1:${port}`;
		expect(() =>
			new NetworkPolicy({ allowPrivateOrigins: [origin] }).checkUrl(origin),
		).toThrow("port is not allowed");
	},
);
