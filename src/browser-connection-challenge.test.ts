import { describe, expect, it } from "vitest";
import {
	type BrowserChallengeDiagnostic,
	type BrowserChallengeResponse,
	classifyBrowserChallenge,
} from "./browser-challenges.js";

const titleLimit = 256;
const textLimit = 8192;
const title = "Verifying your connection";
const marker = "Please wait while we verify your browser";
const response: BrowserChallengeResponse = {
	status: 200,
	headers: { "content-type": ["text/html; charset=utf-8"] },
	title,
	text: `${marker}...`,
};
const expected: BrowserChallengeDiagnostic = {
	kind: "challenge",
	provider: "unspecified",
	confidence: "possible",
	evidence: ["html-challenge-markers"],
	action: "stop-and-request-user-handoff",
};
const confirmed: BrowserChallengeDiagnostic = {
	...expected,
	provider: "cloudflare",
	confidence: "confirmed",
	evidence: ["cf-mitigated-challenge"],
};

function classify(input: unknown) {
	return classifyBrowserChallenge(input as BrowserChallengeResponse);
}

function atCutoff(text: string, suffix = "", leading = ""): string {
	return (
		leading +
		" ".repeat(textLimit - leading.length - text.length) +
		text +
		suffix
	);
}

describe("bounded connection-verification challenge diagnostics", () => {
	it.each([
		"Verifying connection",
		"Verifying connection.",
		"Verifying connection!",
		"Verifying connection...",
		"Verifying connection…",
		title,
		`${title}.`,
		`${title}!`,
		`${title}...`,
		`${title}…`,
	])("recognizes the exact title %j with paired text", (title) => {
		expect(classifyBrowserChallenge({ ...response, title })).toEqual(expected);
	});

	it.each([200, 201, 202, 206, 299, 400, 401, 403, 429, 500, 503, 599])(
		"recognizes paired HTML markers at HTTP %i",
		(status) => {
			expect(classifyBrowserChallenge({ ...response, status })).toEqual(
				expected,
			);
		},
	);

	it("normalizes title, text and MIME case and whitespace", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				headers: { "Content-Type": "\tTEXT/HTML ; charset=UTF-8 " },
				title: " \nVERIFYING\tyour  CONNECTION…\r\n",
				text: "PLEASE\twait\nwhile WE  verify\r\nyour BROWSER!",
			}),
		).toEqual(expected);
	});

	it.each(["Just a moment...", "Security check", "Robot check"])(
		"pairs the new text marker with existing title %j",
		(title) => {
			expect(classifyBrowserChallenge({ ...response, title })).toEqual(
				expected,
			);
		},
	);

	it.each([
		"Verify you are human.",
		"Checking your browser before continuing.",
		"Confirm you are a human.",
		"Please confirm you are not a robot.",
	])("pairs the connection title with existing marker %j", (text) => {
		expect(classifyBrowserChallenge({ ...response, text })).toEqual(expected);
	});

	it.each([
		"",
		"Connection verification documentation",
		"About verifying your connection",
		"Verifying your connection documentation",
		"Verifying your connections",
		"Verifying connectionless requests",
		"Verifying my connection",
		"Verify your connection",
		"Verifying your connection?",
		"Verifying your connection:",
		"Verifying your connection - Cloudflare",
	])("does not promote ordinary or near-miss title %j", (title) => {
		expect(classifyBrowserChallenge({ ...response, title })).toBeNull();
	});

	it.each([
		"",
		"An article about connection verification.",
		"Verifying your connection",
		"Cloudflare",
		"Please wait while we verify your connection.",
		"Please wait while we verify the browser.",
		"Please wait while we verify your browsers.",
		"Please wait while we verify your browserware.",
		"Please wait while we verify your browser_guide.",
		"Please wait while we verify your browser2.",
		"xPlease wait while we verify your browser.",
		"_Please wait while we verify your browser.",
		"Please wait while we verify your web browser.",
		"Enable JavaScript and cookies to continue.",
	])("requires a complete bounded text marker, not %j", (text) => {
		expect(classifyBrowserChallenge({ ...response, text })).toBeNull();
	});

	it("keeps an ordinary article containing both quoted markers readable", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				title: "Troubleshooting connection verification",
				text: `The page says '${title}' and '${marker}'. This article explains the messages.`,
			}),
		).toBeNull();
	});
});

describe("connection-verification title and text budgets", () => {
	it.each(["Verifying connection", title, `${title}…`])(
		"accepts an exact 256-unit title %j but rejects truncated titles",
		(title) => {
			for (const boundedTitle of [
				title.padStart(titleLimit, " "),
				title.padEnd(titleLimit, " "),
			]) {
				expect(
					classifyBrowserChallenge({ ...response, title: boundedTitle }),
				).toEqual(expected);
			}
			for (const boundedTitle of [
				title.padEnd(titleLimit + 1, " "),
				`${title.padEnd(titleLimit, " ")} documentation`,
				`${" ".repeat(titleLimit)}${title}`,
				title.padStart(titleLimit + 1, " "),
			]) {
				expect(
					classifyBrowserChallenge({ ...response, title: boundedTitle }),
				).toBeNull();
			}
		},
	);

	it.each(["", ". More text.", "!", " ", "\t", "\n"])(
		"accepts a complete 8192-unit marker with boundary suffix %j",
		(suffix) => {
			expect(
				classifyBrowserChallenge({
					...response,
					text: atCutoff(marker, suffix),
				}),
			).toEqual(expected);
		},
	);

	it.each(["s", "WARE", "1", "_", "\u212a", "\u0130"])(
		"rejects a word continuation %j beyond the text budget",
		(suffix) => {
			expect(
				classifyBrowserChallenge({
					...response,
					text: atCutoff(marker, suffix),
				}),
			).toBeNull();
		},
	);

	it("does not complete a cut word using lookahead or scan beyond the budget", () => {
		for (const text of [
			atCutoff(marker.slice(0, -1), marker.slice(-1)),
			` ${atCutoff(marker)}`,
			`${" ".repeat(textLimit)}${marker}`,
		]) {
			expect(classifyBrowserChallenge({ ...response, text })).toBeNull();
		}
	});

	it.each([" ", "\t", "\n", "\u00a0"])(
		"retains whitespace %j before word-like lookahead",
		(separator) => {
			expect(
				classifyBrowserChallenge({
					...response,
					text: atCutoff(`${marker}${separator}`, "browserware"),
				}),
			).toEqual(expected);
		},
	);

	it("retains an earlier complete marker when the final word is cut", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				text: atCutoff(marker, "ware", `${marker}. `),
			}),
		).toEqual(expected);
	});
});

describe("connection-verification response and provider evidence", () => {
	it.each([100, 199, 204, 205, 300, 301, 302, 304, 399])(
		"does not infer a document challenge at HTTP %i",
		(status) => {
			expect(classifyBrowserChallenge({ ...response, status })).toBeNull();
		},
	);

	it.each([
		undefined,
		null,
		"200",
		99,
		600,
		200.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("rejects invalid status %j even with authoritative headers", (status) => {
		for (const headers of [
			response.headers,
			{ ...response.headers, "cf-mitigated": "challenge" },
		]) {
			expect(classify({ ...response, status, headers })).toBeNull();
		}
	});

	it.each<BrowserChallengeResponse["headers"]>([
		{},
		{ "content-type": "" },
		{ "content-type": "text/plain" },
		{ "content-type": "application/json" },
		{ "content-type": "application/xhtml+xml" },
		{ "content-type": "text/htmlish" },
		{ "content-type": "text/html, text/plain" },
		{ "content-type": ["text/html", "application/json"] },
		{ "Content-Type": "text/html", "content-type": "text/plain" },
	])("requires unambiguous HTML MIME: %j", (headers) => {
		expect(classifyBrowserChallenge({ ...response, headers })).toBeNull();
	});

	it.each([
		null,
		[],
		{ "content-type": [] },
		{ "content-type": ["text/html", 42] },
		{ "content-type": "text/html", "bad name": "value" },
		{ "content-type": "text/html", "x-invalid": "line\nbreak" },
		{ "content-type": "text/html", "x-invalid": "x".repeat(4097) },
	])("rejects malformed headers without cherry-picking HTML: %j", (headers) => {
		expect(classify({ ...response, headers })).toBeNull();
	});

	it("accepts identical duplicate HTML MIME values on null-prototype headers", () => {
		const headers = Object.assign(Object.create(null), {
			"Content-Type": "text/html",
			"content-type": ["text/html", "text/html"],
		});
		expect(classifyBrowserChallenge({ ...response, headers })).toEqual(
			expected,
		);
	});

	it("does not infer a provider from the destination or infrastructure headers", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				url: "https://cloudflare.fixture.invalid/connection-check",
				headers: { ...response.headers, server: "cloudflare", "cf-ray": "123" },
			}),
		).toEqual(expected);
	});

	it("preserves existing bounded Cloudflare HTML evidence", () => {
		for (const input of [
			{ ...response, title: "Attention required! | Cloudflare" },
			{ ...response, text: `${marker}. Cloudflare.` },
			{ ...response, text: atCutoff("Cloudflare", "!", `${marker}. `) },
		]) {
			expect(classifyBrowserChallenge(input)).toEqual({
				...expected,
				provider: "cloudflare",
			});
		}
		for (const text of [
			atCutoff("Cloudflare", "d", `${marker}. `),
			`${`${marker}. `.padEnd(textLimit, " ")}Cloudflare`,
		]) {
			expect(classifyBrowserChallenge({ ...response, text })).toEqual(expected);
		}
	});

	it.each([100, 200, 204, 205, 302, 304, 403, 503])(
		"preserves authoritative header precedence at valid HTTP %i",
		(status) => {
			expect(
				classifyBrowserChallenge({
					...response,
					status,
					headers: {
						"content-type": "application/json",
						"CF-Mitigated": "\tchallenge ",
						"cf-mitigated": ["challenge", "challenge"],
						"retry-after": "17",
					},
				}),
			).toEqual({ ...confirmed, retryAfterSeconds: 17 });
		},
	);

	it.each(["Challenge", "challenge-extra", "challenge, challenge", "managed"])(
		"does not upgrade HTML evidence for non-authoritative header %j",
		(value) => {
			expect(
				classifyBrowserChallenge({
					...response,
					headers: { ...response.headers, "cf-mitigated": value },
				}),
			).toEqual(expected);
		},
	);

	it("does not cherry-pick conflicting or malformed authoritative headers", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				headers: {
					...response.headers,
					"cf-mitigated": ["challenge", "other"],
				},
			}),
		).toEqual(expected);
		expect(
			classifyBrowserChallenge({
				...response,
				headers: {
					...response.headers,
					"cf-mitigated": "challenge",
					"x-invalid": "line\nbreak",
				},
			}),
		).toBeNull();
	});

	it("includes only valid advisory retry-after metadata", () => {
		for (const value of ["0", "17", "86400"]) {
			expect(
				classifyBrowserChallenge({
					...response,
					headers: { ...response.headers, "retry-after": value },
				}),
			).toEqual({ ...expected, retryAfterSeconds: Number(value) });
		}
		for (const value of ["-1", "86401", "1.5", ["17", "18"]]) {
			expect(
				classifyBrowserChallenge({
					...response,
					headers: { ...response.headers, "retry-after": value },
				}),
			).toEqual(expected);
		}
	});
});

describe("connection-verification input and output isolation", () => {
	it.each(["title", "text"])(
		"does not invoke an accessor or coerce a non-string %s",
		(field) => {
			let reads = 0;
			const read = () => {
				reads++;
				throw new Error("must not read untrusted content");
			};
			const input = Object.defineProperty({ ...response }, field, {
				get: read,
			});
			expect(classify(input)).toBeNull();
			expect(classify({ ...response, [field]: { toString: read } })).toBeNull();
			expect(
				classify(
					Object.defineProperty(
						{ ...response, headers: { "cf-mitigated": "challenge" } },
						field,
						{ get: read },
					),
				),
			).toEqual(confirmed);
			expect(reads).toBe(0);
		},
	);

	it("ignores inherited response evidence", () => {
		expect(classify(Object.create(response))).toBeNull();
	});

	it("does not mutate frozen inputs or share diagnostic output", () => {
		const input = Object.freeze({
			...response,
			url: "https://fixture.invalid/check?token=PRIVATE",
			text: `${marker}. token=PRIVATE`,
			headers: Object.freeze({
				"content-type": Object.freeze(["text/html; charset=utf-8"]),
				"set-cookie": Object.freeze(["session=PRIVATE"]),
			}),
		});
		const original = structuredClone(input);
		const first = classifyBrowserChallenge(input);
		expect(first).toEqual(expected);
		if (!first) throw new Error("expected a connection challenge diagnostic");
		Object.freeze(first.evidence);
		Object.freeze(first);
		const second = classifyBrowserChallenge(input);
		expect(second).toEqual(expected);
		expect(second).not.toBe(first);
		expect(second?.evidence).not.toBe(first.evidence);
		expect(first.evidence).not.toBe(input.headers["content-type"]);
		expect(input).toEqual(original);
		expect(JSON.stringify(first)).not.toContain("PRIVATE");
	});

	it("does not retain mutable caller-owned headers", () => {
		const contentTypes = ["text/html"];
		const headers = { "content-type": contentTypes, "retry-after": "17" };
		const result = classifyBrowserChallenge({ ...response, headers });
		contentTypes[0] = "text/plain";
		headers["retry-after"] = "18";
		expect(result).toEqual({ ...expected, retryAfterSeconds: 17 });
		expect(classifyBrowserChallenge({ ...response, headers })).toBeNull();
	});
});
