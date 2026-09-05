import { describe, expect, it } from "vitest";
import {
	type BrowserChallengeResponse,
	classifyBrowserChallenge,
} from "./browser-challenges.js";

const html = { "content-type": ["text/html; charset=utf-8"] };
const challenge = { "cf-mitigated": ["challenge"] };

function classify(response: unknown) {
	return classifyBrowserChallenge(response as BrowserChallengeResponse);
}

function possible(overrides: Partial<BrowserChallengeResponse> = {}) {
	return classifyBrowserChallenge({
		status: 200,
		headers: html,
		title: "Just a moment...",
		text: "Verifying you are human. Cloudflare.",
		...overrides,
	});
}

describe("authoritative response evidence", () => {
	it.each([200, 202, 403, 429, 503])(
		"recognizes the header at status %i",
		(status) => {
			expect(classify({ status, headers: challenge })).toEqual({
				kind: "challenge",
				provider: "cloudflare",
				confidence: "confirmed",
				evidence: ["cf-mitigated-challenge"],
				action: "stop-and-request-user-handoff",
			});
		},
	);
	it("accepts casing, OWS, identical duplicates and native null-prototype headers", () => {
		const headers = Object.assign(Object.create(null), {
			"CF-Mitigated": "\tchallenge ",
			"cf-mitigated": ["challenge", "challenge"],
		});
		expect(classify({ status: 200, headers })?.confidence).toBe("confirmed");
	});
	it.each([
		"",
		"managed",
		"Challenge",
		"challenge, challenge",
		"challenge-extra",
		"xchallenge",
	])("does not accept another or combined header value %j", (value) => {
		expect(
			classify({ status: 403, headers: { "cf-mitigated": value } }),
		).toBeNull();
	});
	it("does not cherry-pick conflicting duplicates", () => {
		for (const headers of [
			{ "cf-mitigated": ["challenge", "other"] },
			{ "CF-Mitigated": "challenge", "cf-mitigated": "other" },
		])
			expect(classify({ status: 200, headers })).toBeNull();
	});
	it("takes precedence over MIME and login text without reading text accessors", () => {
		let reads = 0;
		const response = {
			status: 200,
			headers: { ...challenge, "content-type": "application/json" },
			get title() {
				reads++;
				throw new Error("secret");
			},
			get text() {
				reads++;
				throw new Error("secret");
			},
		};
		expect(classify(response)?.confidence).toBe("confirmed");
		expect(reads).toBe(0);
	});
});

describe("conservative extracted HTML evidence", () => {
	it("reports Cloudflare text as possible, never confirmed", () => {
		expect(possible()).toMatchObject({
			kind: "challenge",
			provider: "cloudflare",
			confidence: "possible",
		});
	});
	it("distinguishes a generic challenge from Cloudflare", () => {
		expect(possible({ text: "Verify that you are human." })).toMatchObject({
			kind: "challenge",
			provider: "unspecified",
			confidence: "possible",
		});
	});
	it("recognizes synthetic DuckDuckGo challenge markers at HTTP 202", () => {
		expect(
			possible({
				status: 202,
				title: "DuckDuckGo",
				text: "Unfortunately, bots use DuckDuckGo too. Please complete the following challenge to confirm you are human.",
			})?.kind,
		).toBe("challenge");
	});
	it("keeps HTTP 200 login barriers separate from challenges", () => {
		expect(
			possible({
				title: "Sign in to Example",
				text: "Email address and password. Sign in to continue.",
			}),
		).toMatchObject({
			kind: "login",
			provider: "unspecified",
			confidence: "possible",
			evidence: ["html-login-markers"],
		});
	});
	it("keeps a Reddit-style network block separate from challenges", () => {
		expect(
			possible({
				status: 403,
				title: "Blocked",
				text: "You've been blocked by network security. Log in to your Reddit account.",
			}),
		).toMatchObject({
			kind: "access-denied",
			provider: "unspecified",
			confidence: "possible",
		});
	});
	it.each([200, 401, 403, 429, 500, 503])(
		"does not infer challenges from HTTP %i alone",
		(status) => {
			expect(
				classify({
					status,
					headers: { ...html, server: "cloudflare", "cf-ray": "123" },
					title: "Error",
					text: "Request failed",
				}),
			).toBeNull();
		},
	);
	it.each<BrowserChallengeResponse["headers"]>([
		{},
		{ "content-type": "text/plain" },
		{ "content-type": "application/json" },
		{ "content-type": ["text/html", "text/plain"] },
	])("requires unambiguous HTML for heuristics: %j", (headers) => {
		expect(possible({ headers })).toBeNull();
	});
	it.each([100, 204, 205, 301, 304])(
		"does not inspect non-document HTTP %i",
		(status) => {
			expect(possible({ status })).toBeNull();
		},
	);
	it("accepts case-insensitive HTML MIME with parameters", () => {
		expect(
			possible({ headers: { "Content-Type": "TEXT/HTML; charset=UTF-8" } })
				?.confidence,
		).toBe("possible");
	});
	it("does not interpret mentions or a single marker as an interstitial", () => {
		expect(
			possible({ title: "Cloudflare challenge documentation" }),
		).toBeNull();
		expect(possible({ text: "Welcome to our ordinary page." })).toBeNull();
		expect(
			possible({ title: "Welcome", text: "Sign in to continue. Password." }),
		).toBeNull();
		expect(
			possible({ title: "Sign in", text: "How to implement authentication." }),
		).toBeNull();
	});
	it("bounds text before scanning and never echoes secrets", () => {
		expect(
			possible({ text: `${" ".repeat(8192)}Verify you are human.` }),
		).toBeNull();
		expect(
			possible({ title: `${" ".repeat(256)}Just a moment...` }),
		).toBeNull();
		const result = possible({
			text: "Verifying you are human. Cloudflare. token=PRIVATE",
			headers: { ...html, "set-cookie": "session=PRIVATE" },
		});
		expect(JSON.stringify(result)).not.toContain("PRIVATE");
	});
});

describe("strict bounded untrusted inputs", () => {
	it.each([
		null,
		undefined,
		[],
		"response",
		4,
		{},
		{ status: "200", headers: challenge },
		{ status: Number.NaN, headers: challenge },
		{ status: 200.5, headers: challenge },
		{ status: 99, headers: challenge },
		{ status: 600, headers: challenge },
	])("rejects invalid summaries: %j", (response) => {
		expect(classify(response)).toBeNull();
	});
	it.each([
		null,
		[],
		new Map(),
		{ "bad name": "x" },
		{ "": "x" },
		{ "cf-mitigated": [] },
		{ "cf-mitigated": ["challenge", 1] },
		{ "cf-mitigated": "challenge\r\nx-secret: value" },
		{ "cf-mitigated": "challenge\0" },
		{ "cf-mitigated": new String("challenge") },
		{ [Symbol("header")]: "x" },
	])("rejects malformed headers: %j", (headers) => {
		expect(classify({ status: 200, headers })).toBeNull();
	});
	it("rejects excessive names, values, single values and total input", () => {
		for (const headers of [
			{ ...challenge, ["a".repeat(129)]: "x" },
			{
				...challenge,
				...Object.fromEntries(
					Array.from({ length: 128 }, (_, index) => [`x-${index}`, "x"]),
				),
			},
			{ ...challenge, extra: Array(17).fill("x") },
			{ ...challenge, extra: "x".repeat(4097) },
			{ ...challenge, extra: Array(4).fill("x".repeat(4096)) },
			{
				...challenge,
				...Object.fromEntries(
					Array.from({ length: 16 }, (_, index) => [
						`x-${index}`,
						Array(16).fill(""),
					]),
				),
			},
		])
			expect(classify({ status: 200, headers })).toBeNull();
	});
	it("validates unrelated headers rather than accepting an early challenge match", () => {
		for (const extra of [
			{ "bad name": "value" },
			{ extra: "value\r\ninjected: secret" },
			{ extra: "\u0100" },
			{ extra: "\u007f" },
			{ extra: new Array(1) },
			{ [Symbol("extra")]: "value" },
		])
			expect(
				classify({ status: 200, headers: { ...challenge, ...extra } }),
			).toBeNull();
	});
	it("accepts exact header count and value count limits", () => {
		expect(
			classify({
				status: 200,
				headers: {
					...challenge,
					...Object.fromEntries(
						Array.from({ length: 127 }, (_, index) => [`x-${index}`, "x"]),
					),
				},
			})?.confidence,
		).toBe("confirmed");
		expect(
			classify({
				status: 200,
				headers: {
					...challenge,
					...Object.fromEntries(
						Array.from({ length: 15 }, (_, index) => [
							`x-${index}`,
							Array(16).fill(""),
						]),
					),
					extra: Array(15).fill(""),
				},
			})?.confidence,
		).toBe("confirmed");
	});
	it("keeps exceptions and unknown status separate from challenge evidence", () => {
		expect(
			classify({
				error: {
					code: "unsupported",
					message: "HTML svg tree construction is not implemented",
				},
			}),
		).toBeNull();
	});
	it("never executes ordinary summary/header/array accessors or coercion", () => {
		let reads = 0;
		const getter = () => {
			reads++;
			throw new Error("PRIVATE");
		};
		const values = ["challenge"];
		Object.defineProperty(values, "0", { get: getter });
		for (const response of [
			Object.defineProperty({ headers: challenge }, "status", { get: getter }),
			Object.defineProperty({ status: 200 }, "headers", { get: getter }),
			{
				status: 200,
				headers: Object.defineProperty({}, "cf-mitigated", { get: getter }),
			},
			{ status: 200, headers: { "cf-mitigated": values } },
			{ status: 200, headers: { "cf-mitigated": { toString: getter } } },
		])
			expect(classify(response)).toBeNull();
		expect(
			classify(
				Object.defineProperty(
					{ status: 200, headers: html, text: "Verify you are human" },
					"title",
					{ get: getter },
				),
			),
		).toBeNull();
		expect(
			classify(
				Object.defineProperty(
					{ status: 200, headers: html, title: "Just a moment..." },
					"text",
					{ get: getter },
				),
			),
		).toBeNull();
		expect(reads).toBe(0);
	});
	it("ignores inherited evidence and catches throwing/revoked proxies", () => {
		expect(
			classify({ status: 200, headers: Object.create(challenge) }),
		).toBeNull();
		const revoked = Proxy.revocable({}, {});
		revoked.revoke();
		for (const headers of [
			revoked.proxy,
			new Proxy(
				{},
				{
					ownKeys() {
						throw new Error("PRIVATE");
					},
				},
			),
		])
			expect(classify({ status: 200, headers })).toBeNull();
	});
	it("does not mutate frozen input or retain caller-owned evidence", () => {
		const headers = Object.freeze({
			"cf-mitigated": Object.freeze(["challenge"]),
		});
		const response = Object.freeze({ status: 200, headers });
		expect(classify(response)).toEqual(classify(response));
		expect(classify(response)?.evidence).not.toBe(headers["cf-mitigated"]);
	});
});

describe("retry-after is advisory bounded numeric metadata only", () => {
	it.each(["0", "30", "86400", "\t42 "])("accepts %j", (value) => {
		expect(
			classify({ status: 429, headers: { ...challenge, "Retry-After": value } })
				?.retryAfterSeconds,
		).toBe(Number(value));
	});
	it.each([
		"86401",
		"999999999999999",
		"-1",
		"+1",
		"1.5",
		"1e3",
		"",
		"Sat, 05 Sep 2026 12:00:00 GMT",
		"30, 30",
	])("ignores %j without discarding the challenge", (value) => {
		const result = classify({
			status: 429,
			headers: { ...challenge, "retry-after": value },
		});
		expect(result?.confidence).toBe("confirmed");
		expect(result).not.toHaveProperty("retryAfterSeconds");
	});
	it("accepts identical duplicates but rejects ambiguity", () => {
		expect(
			classify({
				status: 429,
				headers: { ...challenge, "Retry-After": "30", "retry-after": ["30"] },
			})?.retryAfterSeconds,
		).toBe(30);
		expect(
			classify({
				status: 429,
				headers: { ...challenge, "retry-after": ["30", "31"] },
			}),
		).not.toHaveProperty("retryAfterSeconds");
	});
});
