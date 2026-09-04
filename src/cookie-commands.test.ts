import { afterEach, describe, expect, it, vi } from "vitest";
import { type Invocation, parseInvocation } from "./cli-parser.js";
import { executeCookieCommand } from "./cookie-commands.js";
import { CookieJar } from "./cookies.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";

const url = "https://example.com/account/page";
const now = Date.UTC(2026, 8, 4);
const jars: CookieJar[] = [];

afterEach(() => {
	for (const jar of jars.splice(0)) jar.close();
	vi.restoreAllMocks();
});

function fixture(limits: ConstructorParameters<typeof CookieJar>[0] = {}) {
	let clock = now;
	const jar = new CookieJar(limits, () => clock);
	jars.push(jar);
	return {
		jar,
		advance: (milliseconds: number) => {
			clock += milliseconds;
		},
		run: (argv: string[], activeUrl: string | null = url) =>
			executeCookieCommand(jar, parseInvocation(argv), activeUrl),
	};
}

it("lists detached identities in deterministic host/path/name order without changing header order", () => {
	const { jar, run } = fixture();
	run(["cookie-set", "session", "other", "--path=/"], "https://z.example/");
	run(["cookie-set", "session", "deep"]);
	run(["cookie-set", "z", "last", "--path=/"]);
	run(["cookie-set", "session", "root", "--path=/"]);
	run(["cookie-set", "a", "first", "--path=/"]);
	const before = jar.exportState();
	const result = run(["cookie-list"], null);
	expect(result).toEqual({
		cookies: [
			before.cookies[4],
			before.cookies[3],
			before.cookies[2],
			before.cookies[1],
			before.cookies[0],
		],
	});
	expect(run(["cookie-get", "session"], null)).toEqual({
		cookies: [before.cookies[3], before.cookies[1], before.cookies[0]],
	});
	expect(run(["cookie-list", "--domain=EXAMPLE.COM"], null)).toEqual({
		cookies: [
			before.cookies[4],
			before.cookies[3],
			before.cookies[2],
			before.cookies[1],
		],
	});
	expect(run(["cookie-list", "--domain=sub.example.com"])).toEqual({
		cookies: [],
	});
	expect(jar.exportState()).toEqual(before);
	expect(jar.cookieHeader(url, { siteUrl: url })).toBe(
		"session=deep; z=last; session=root; a=first",
	);
	if (!("cookies" in result)) throw new Error("Expected cookie output");
	expect(Object.isFrozen(result.cookies[0])).toBe(true);
	expect(Reflect.set(result.cookies[0], "value", "changed")).toBe(false);
	expect(Reflect.deleteProperty(result.cookies, "0")).toBe(true);
	expect(jar.exportState()).toEqual(before);
});

it("replaces only the exact host/name/path identity and preserves HttpOnly behavior", () => {
	const { jar, run } = fixture();
	run(["cookie-set", "session", "root", "--path=/", "--secure", "--httpOnly"]);
	run(["cookie-set", "session", "deep"]);
	run(["cookie-set", "session", "other", "--path=/"], "https://other.example/");
	expect(
		run([
			"cookie-set",
			"session",
			"updated",
			"--path=/",
			"--secure",
			"--httpOnly",
		]),
	).toEqual({ set: true, deleted: false });
	expect(jar.exportState().cookies).toHaveLength(3);
	expect(jar.cookieHeader(url, { siteUrl: url })).toBe(
		"session=deep; session=updated",
	);
	expect(jar.documentCookie(url, url)).toBe("session=deep");
	expect(jar.setDocumentCookie(url, "session=script; Path=/", url)).toEqual({
		accepted: false,
		reason: "http-only",
	});
	expect(
		jar.cookieHeader("http://example.com/account/page", {
			siteUrl: "http://example.com/",
		}),
	).toBe("session=deep");
	expect(
		jar.cookieHeader("https://example.com/accounting", { siteUrl: url }),
	).toBe("session=updated");
	expect(
		jar.cookieHeader("https://sub.example.com/account/page", { siteUrl: url }),
	).toBe("");
});

it("deletes every matching identity atomically and preserves survivors and their header order", () => {
	const { jar, run } = fixture();
	run([
		"cookie-set",
		"keep-z",
		"one",
		"--path=/",
		"--secure",
		"--httpOnly",
		"--sameSite=Strict",
	]);
	run(["cookie-set", "remove", "root", "--path=/"]);
	run(["cookie-set", "remove", "deep"]);
	run(["cookie-set", "remove", "other"], "https://other.example/");
	run([
		"cookie-set",
		"keep-a",
		"two",
		`--expires=${now / 1000 + 60}`,
		"--path=/",
	]);
	const survivors = jar
		.exportState()
		.cookies.filter((cookie) => cookie.name !== "remove");
	const replace = vi.spyOn(jar, "replaceState");
	expect(run(["cookie-delete", "remove"], null)).toEqual({ deleted: 3 });
	expect(replace).toHaveBeenCalledTimes(1);
	expect(jar.exportState().cookies).toEqual(survivors);
	expect(jar.cookieHeader(url, { siteUrl: url })).toBe(
		"keep-z=one; keep-a=two",
	);
	expect(run(["cookie-delete", "remove"], null)).toEqual({ deleted: 0 });
	expect(replace).toHaveBeenCalledTimes(1);
	expect(() => run(["cookie-get", "remove"])).toThrow("Cookie not found");
});

it("does not partially delete when the jar refuses replacement", () => {
	const { jar, run } = fixture();
	run(["cookie-set", "session", "root", "--path=/"]);
	run(["cookie-set", "session", "deep"]);
	const before = jar.exportState();
	vi.spyOn(jar, "replaceState").mockImplementation(() => {
		throw new AgentBrowserError("resource-limit", "Replacement refused");
	});
	expect(() => run(["cookie-delete", "session"])).toThrow(
		"Replacement refused",
	);
	expect(jar.exportState()).toEqual(before);
});

it("interprets expiry as whole Unix seconds, prunes naturally, and supports explicit session expiry", () => {
	const { jar, run, advance } = fixture();
	run(["cookie-set", "short", "value", `--expires=${now / 1000 + 2}`]);
	run(["cookie-set", "session", "value", "--expires=-1"]);
	expect(jar.exportState().cookies.map((cookie) => cookie.expires)).toEqual([
		now + 2000,
		null,
	]);
	advance(2000);
	expect(run(["cookie-list"])).toEqual({
		cookies: [jar.exportState().cookies[0]],
	});
	expect(() => run(["cookie-get", "short"])).toThrow("Cookie not found");
	expect(run(["cookie-set", "session", "expired", "--expires=0"])).toEqual({
		set: true,
		deleted: true,
	});
	expect(jar.cookieHeader(url, { siteUrl: url })).toBe("");
	expect(run(["cookie-delete", "short"])).toEqual({ deleted: 0 });
});

it("retains the jar's maximum lifetime and explicit security/prefix policies", () => {
	const { jar, run } = fixture();
	run([
		"cookie-set",
		"__Host-session",
		"value",
		"--secure",
		"--path=/",
		"--sameSite=None",
		"--expires=253402300799",
	]);
	expect(jar.exportState().cookies[0]).toMatchObject({
		secure: true,
		sameSite: "none",
		expires: now + 400 * 24 * 60 * 60 * 1000,
	});
	run([
		"cookie-set",
		"plain",
		'"quoted=value"',
		"--secure=false",
		"--httpOnly=false",
	]);
	run(["cookie-set", "empty", ""]);
	expect(jar.documentCookie(url, url)).toBe(
		'plain="quoted=value"; empty=; __Host-session=value',
	);
});

describe("invalid input and policy failures are value-free and leave live cookie state unchanged", () => {
	it.each([
		["cookie-set", "bad;name", "PRIVATE"],
		["cookie-set", "name", "PRIVATE; Secure"],
		["cookie-set", "name", " PRIVATE"],
		["cookie-set", "name", "PRIVATE\r\nInjected: yes"],
		["cookie-set", "name", "PRIVATE", "--path=/; HttpOnly"],
		["cookie-set", "name", "PRIVATE", "--path=relative"],
		["cookie-set", "name", "PRIVATE", "--path=/trimmed "],
		["cookie-set", "name", "PRIVATE", `--path=/${"x".repeat(1024)}`],
		["cookie-set", "name", "PRIVATE", "--sameSite=invalid"],
		["cookie-set", "name", "PRIVATE", "--sameSite=None"],
		["cookie-set", "__Host-name", "PRIVATE", "--secure"],
		["cookie-set", "__Secure-name", "PRIVATE"],
		["cookie-set", "name", "PRIVATE", "--domain=example.com"],
		["cookie-set", "name", "PRIVATE", "--domain=unrelated.example"],
		["cookie-set", "name", "PRIVATE", "--expires=-2"],
		["cookie-set", "name", "PRIVATE", "--expires=1.5"],
		["cookie-set", "name", "PRIVATE", "--expires=253402300800"],
		["cookie-list", "--domain=example.com:80"],
		["cookie-list", "--domain=example.com/path"],
		["cookie-list", "--domain=PRIVATE@example.com"],
	])("rejects %j", (...argv) => {
		const { jar, run } = fixture();
		run(["cookie-set", "name", "existing"]);
		const before = jar.exportState();
		let caught: unknown;
		try {
			run(argv);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(AgentBrowserError);
		expect(String(caught)).not.toContain("PRIVATE");
		expect(jar.exportState()).toEqual(before);
	});
});

it("rejects insecure creation, overwrite and expiry deletion of a secure cookie", () => {
	const { jar, run } = fixture();
	run(["cookie-set", "session", "protected", "--secure", "--path=/"]);
	const before = jar.exportState();
	for (const options of [["--secure"], [], ["--expires=0"]]) {
		expect(() =>
			run(
				["cookie-set", "session", "PRIVATE", "--path=/", ...options],
				"http://example.com/",
			),
		).toThrow("Cookie rejected: insecure");
		expect(jar.exportState()).toEqual(before);
	}
});

it("requires an HTTP(S) active URL only for set and rejects capacity without evicting", () => {
	const { jar, run } = fixture({ maxCookies: 1 });
	expect(run(["cookie-list"], null)).toEqual({ cookies: [] });
	for (const target of [
		null,
		"about:blank",
		"file:///PRIVATE",
		"https://PRIVATE@example.com/",
	]) {
		expect(() => run(["cookie-set", "name", "PRIVATE"], target)).toThrow(
			"Setting a cookie requires an active HTTP(S) page",
		);
	}
	run(["cookie-set", "name", "existing"]);
	const before = jar.exportState();
	expect(() => run(["cookie-set", "second", "PRIVATE"])).toThrow(
		"Cookie rejected: capacity",
	);
	expect(jar.exportState()).toEqual(before);
	expect(() => run(["cookie-set", "name", "x".repeat(4096)])).toThrow(
		"Cookie rejected: cookie-too-large",
	);
	expect(jar.exportState()).toEqual(before);
});

it("rejects malformed service-level invocations without relying on the CLI parser", () => {
	const { jar } = fixture();
	const base = parseInvocation(["cookie-set", "name", "PRIVATE"]);
	const invalidInvocations: Invocation[] = [
		{ ...base, command: "open" },
		{ ...base, arguments: ["name"] },
		{ ...base, arguments: ["name", 1 as unknown as string] },
		{ ...base, options: { secure: "true" } },
		{ ...base, options: { httpOnly: "false" } },
		{ ...base, options: { sameSite: true } },
		{ ...base, options: { expires: Number.NaN } },
		{ ...base, options: { expires: Number.POSITIVE_INFINITY } },
		{ ...base, options: { expires: "1893456000" } },
		{ ...base, options: { PRIVATE: true } },
	];
	for (const invocation of invalidInvocations) {
		expect(() => executeCookieCommand(jar, invocation, url)).toThrow(
			AgentBrowserError,
		);
		expect(jar.exportState().cookies).toEqual([]);
	}
});

it("keeps session jars isolated and honors closed ownership", () => {
	const first = fixture();
	const second = fixture();
	first.run(["cookie-set", "session", "first"]);
	second.run(["cookie-set", "session", "second"]);
	first.run(["cookie-delete", "session"]);
	expect(second.jar.documentCookie(url, url)).toBe("session=second");
	first.jar.close();
	for (const argv of [
		["cookie-list"],
		["cookie-get", "session"],
		["cookie-set", "session", "new"],
		["cookie-delete", "session"],
	])
		expect(() => first.run(argv)).toThrow("Cookie jar is closed");
});

interface WireHost {
	exchange(
		url: URL,
		address: string,
		method: string,
		headers: Record<string, string>,
		body: Buffer | undefined,
		redirect: string,
		signal: AbortSignal,
		maxResponseBytes: number,
		onHeaders?: (headers: NetworkResponse["headers"]) => void,
	): Promise<Omit<NetworkResponse, "url" | "redirects" | "elapsedMs">>;
}

it("changes real NodeNetworkTransport request headers with only resolver/exchange replaced by native fixtures", async () => {
	const { jar, run } = fixture();
	const transport = new NodeNetworkTransport({
		cookieJar: jar,
		resolver: async () => ["93.184.216.34"],
	});
	const headers: Record<string, string>[] = [];
	vi.spyOn(transport as unknown as WireHost, "exchange").mockImplementation(
		async (_url, _address, _method, requestHeaders) => {
			headers.push({ ...requestHeaders });
			return {
				status: 200,
				headers: {},
				body: new Uint8Array(),
				encodedBytes: 0,
			};
		},
	);
	const request = (target: string) =>
		transport.request({
			url: target,
			cookieContext: { siteUrl: target, credentials: "include" },
		});
	try {
		run([
			"cookie-set",
			"session",
			"root",
			"--path=/",
			"--secure",
			"--httpOnly",
		]);
		run(["cookie-set", "session", "deep"]);
		await request(url);
		expect(headers.at(-1)?.cookie).toBe("session=deep; session=root");
		expect(jar.documentCookie(url, url)).toBe("session=deep");
		await request("http://example.com/account/page");
		expect(headers.at(-1)?.cookie).toBe("session=deep");
		await request("https://example.com/accounting");
		expect(headers.at(-1)?.cookie).toBe("session=root");
		await request("https://sub.example.com/account/page");
		expect(headers.at(-1)?.cookie).toBeUndefined();
		await transport.request({
			url,
			cookieContext: { siteUrl: url, credentials: "omit" },
		});
		expect(headers.at(-1)?.cookie).toBeUndefined();
		await transport.request({ url });
		expect(headers.at(-1)?.cookie).toBeUndefined();
		run(["cookie-delete", "session"]);
		await request(url);
		expect(headers.at(-1)?.cookie).toBeUndefined();
	} finally {
		transport.close();
	}
});
