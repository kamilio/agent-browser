import { describe, expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { NetworkPolicy } from "./network.js";
import { blockedOriginsFromEnvironment } from "./node-network-policy-config.js";

const invalidMessage =
	"AGENT_BROWSER_BLOCKED_ORIGINS must be a JSON array of at most 128 HTTP(S) origins within 16384 code units";

function expectInvalid(setting: string | undefined) {
	expect(() => blockedOriginsFromEnvironment(setting)).toThrowError(
		expect.objectContaining({
			name: "AgentBrowserError",
			code: "invalid-input",
			message: invalidMessage,
		}),
	);
}

describe("pure blocked-origin configuration; no runtime or process probes", () => {
	it("leaves an unset setting absent and allows an explicitly empty list", () => {
		expect(blockedOriginsFromEnvironment(undefined)).toBeUndefined();
		const options = blockedOriginsFromEnvironment("[]");
		expect(options).toEqual({ blockedOrigins: [] });
		expect(Object.isFrozen(options)).toBe(true);
		expect(Object.isFrozen(options?.blockedOrigins)).toBe(true);
	});

	it("normalizes and deduplicates canonical origins in first-seen order", () => {
		expect(
			blockedOriginsFromEnvironment(
				JSON.stringify([
					"HTTPS://BLOCKED.FIXTURE.INVALID:443/",
					"https://blocked.fixture.invalid",
					"http://blocked.fixture.invalid:80/",
					"https://blocked.fixture.invalid:8443/",
					"https://b\u00fccher.invalid/",
					"https://xn--bcher-kva.invalid",
					"http://[0:0:0:0:0:0:0:1]:80/",
					"http://[::1]",
					"http://127.1/",
					"http://127.0.0.1",
				]),
			),
		).toEqual({
			blockedOrigins: [
				"https://blocked.fixture.invalid",
				"http://blocked.fixture.invalid",
				"https://blocked.fixture.invalid:8443",
				"https://xn--bcher-kva.invalid",
				"http://[::1]",
				"http://127.0.0.1",
			],
		});
	});

	it("accepts JSON whitespace and escaped origin characters", () => {
		expect(
			blockedOriginsFromEnvironment(
				' \n["https:\\/\\/blocked.fixture.invalid\\u002f"]\t',
			),
		).toEqual({ blockedOrigins: ["https://blocked.fixture.invalid"] });
	});

	it("returns a frozen object and detached frozen origins", () => {
		const origins = ["https://blocked.fixture.invalid"];
		const parse = vi.spyOn(JSON, "parse").mockReturnValueOnce(origins);
		let options: ReturnType<typeof blockedOriginsFromEnvironment>;
		try {
			options = blockedOriginsFromEnvironment(JSON.stringify(origins));
		} finally {
			parse.mockRestore();
		}
		expect(options).toEqual({ blockedOrigins: origins });
		expect(options?.blockedOrigins).not.toBe(origins);
		expect(Object.isFrozen(options)).toBe(true);
		expect(Object.isFrozen(options?.blockedOrigins)).toBe(true);
		origins[0] = "https://changed.fixture.invalid";
		expect(options?.blockedOrigins).toEqual([
			"https://blocked.fixture.invalid",
		]);
	});

	it("only blocks configured origins without granting private or allowlist access", () => {
		const options = blockedOriginsFromEnvironment(
			'["https://blocked.fixture.invalid", "http://localhost"]',
		);
		expect(Object.keys(options ?? {})).toEqual(["blockedOrigins"]);
		const policy = new NetworkPolicy(options);
		expect(() =>
			policy.checkUrl("https://blocked.fixture.invalid/resource"),
		).toThrowError(expect.objectContaining({ code: "policy-denied" }));
		expect(
			policy.checkUrl("https://unlisted.fixture.invalid/resource").origin,
		).toBe("https://unlisted.fixture.invalid");
		expect(policy.checkUrl("http://blocked.fixture.invalid").origin).toBe(
			"http://blocked.fixture.invalid",
		);
		for (const target of ["http://localhost", "http://127.0.0.1"]) {
			expect(() => policy.checkUrl(target)).toThrowError(
				expect.objectContaining({ code: "policy-denied" }),
			);
		}
		const emptyPolicy = new NetworkPolicy(blockedOriginsFromEnvironment("[]"));
		expect(emptyPolicy.checkUrl("https://blocked.fixture.invalid").origin).toBe(
			"https://blocked.fixture.invalid",
		);
	});

	it.each([
		"",
		" ",
		"null",
		"true",
		"1",
		'"https://blocked.fixture.invalid"',
		"{}",
		'{"blockedOrigins":[]}',
		"[null]",
		"[true]",
		"[1]",
		"[{}]",
		"[[]]",
		'["https://blocked.fixture.invalid", null]',
		'["https://blocked.fixture.invalid",]',
		"['https://blocked.fixture.invalid']",
		"[/*comment*/]",
		"[] trailing",
	])("rejects malformed JSON and wrong shapes: %s", (setting) => {
		expectInvalid(setting);
	});

	it.each([
		"",
		"blocked.fixture.invalid",
		"//blocked.fixture.invalid",
		"ftp://blocked.fixture.invalid",
		"ws://blocked.fixture.invalid",
		"file:///",
		"data:text/plain,private-marker",
		"https://",
		"https://blocked.fixture.invalid:65536",
		"https://[invalid]",
		"https://user:private-marker@blocked.fixture.invalid",
		"https://user@blocked.fixture.invalid",
		"https://:private-marker@blocked.fixture.invalid",
		"https://@blocked.fixture.invalid",
		"https://:@blocked.fixture.invalid",
		"https://blocked.fixture.invalid/private-marker",
		"https://blocked.fixture.invalid//",
		"https://blocked.fixture.invalid/./",
		"https://blocked.fixture.invalid/private-marker/..",
		"https://blocked.fixture.invalid/%2e/",
		"https://blocked.fixture.invalid?private-marker",
		"https://blocked.fixture.invalid/?",
		"https://blocked.fixture.invalid#private-marker",
		"https://blocked.fixture.invalid/#",
		"https:blocked.fixture.invalid",
		"https:/blocked.fixture.invalid",
		"https:///blocked.fixture.invalid",
		"https:\\blocked.fixture.invalid",
		"https://blocked.fixture.invalid\\",
		" https://blocked.fixture.invalid",
		"https://blocked.fixture.invalid ",
		"https://blocked.fixture.invalid\n",
		"https://blocked.\tfixture.invalid",
		"https://blocked.fixture.invalid\u0000",
	])("rejects non-origin URLs without echoing their contents: %s", (origin) => {
		expectInvalid(JSON.stringify([origin]));
	});

	it("rejects runtime non-string settings without coercion", () => {
		const stringify = vi.fn(() => "[]");
		for (const setting of [null, 1, true, [], {}, { toString: stringify }]) {
			expectInvalid(setting as unknown as string);
		}
		expect(stringify).not.toHaveBeenCalled();
	});

	it("accepts exactly 128 entries and bounds entries before deduplication", () => {
		const origins = Array.from(
			{ length: 128 },
			(_entry, index) => `https://blocked-${index}.fixture.invalid`,
		);
		expect(
			blockedOriginsFromEnvironment(JSON.stringify(origins))?.blockedOrigins,
		).toEqual(origins);
		expectInvalid(JSON.stringify([...origins, origins[0]]));
		expectInvalid(JSON.stringify(Array(129).fill(origins[0])));
	});

	it("accepts exactly 16384 code units and rejects excess before JSON parsing", () => {
		const boundary = "[]".padEnd(16_384);
		expect(blockedOriginsFromEnvironment(boundary)).toEqual({
			blockedOrigins: [],
		});
		const parse = vi.spyOn(JSON, "parse");
		try {
			expectInvalid(`${boundary} `);
			expect(parse).not.toHaveBeenCalled();
		} finally {
			parse.mockRestore();
		}
	});

	it("never exposes malformed JSON, URL contents, or nested error causes", () => {
		for (const setting of [
			"private-marker",
			'["https://private-marker@blocked.fixture.invalid"]',
			'["https://blocked.fixture.invalid/private-marker"]',
			'["ftp://private-marker.invalid"]',
			JSON.stringify({ "private-marker": [] }),
		]) {
			let failure: unknown;
			try {
				blockedOriginsFromEnvironment(setting);
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(AgentBrowserError);
			expect(String(failure)).not.toContain("private-marker");
			expect(JSON.stringify(failure)).not.toContain("private-marker");
			expect(failure).not.toHaveProperty("cause");
			expectInvalid(setting);
		}
	});
});
