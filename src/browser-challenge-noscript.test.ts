import { describe, expect, it } from "vitest";
import {
	type BrowserChallengeResponse,
	classifyBrowserChallenge,
} from "./browser-challenges.js";

const html = { "content-type": ["text/html; charset=utf-8"] };
const title = "Just a moment...";
const phrase = "Enable JavaScript and cookies to continue";
const response = { status: 403, headers: html, title, text: phrase };
const expected = {
	kind: "challenge",
	provider: "unspecified",
	confidence: "possible",
	evidence: ["html-challenge-markers"],
	action: "stop-and-request-user-handoff",
};

describe("bounded noscript challenge diagnostics", () => {
	it.each([200, 403, 503])("recognizes the pair for HTTP %i", (status) => {
		expect(classifyBrowserChallenge({ ...response, status })).toEqual(expected);
	});
	it.each([
		"Just a moment",
		"Just a moment.",
		"Just a moment!",
		"Just a moment...",
		"Just a moment…",
		"Just a moment.!…",
	])("accepts only the supported title punctuation: %s", (title) => {
		expect(classifyBrowserChallenge({ ...response, title })).toEqual(expected);
	});
	it("normalizes case and whitespace in the title, body and HTML MIME", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				headers: { "Content-Type": " TEXT/HTML; charset=UTF-8 " },
				title: " \nJUST\tA   MOMENT… \r\n",
				text: "\nENABLE\tJAVASCRIPT  AND\r\nCOOKIES TO\tCONTINUE.\n",
			}),
		).toEqual(expected);
	});
	it.each([
		"",
		"Home",
		"JavaScript application",
		"Documentation",
		"Just a moment documentation",
		"Just a moment... | Example",
		"Just a moment... Cloudflare",
		"Not Just a moment...",
		"Just a momentary pause",
		"Just a moment?",
		"Just a moment ...",
		"Security check",
		"Client Challenge",
		"Attention required! | Cloudflare",
	])("rejects the noscript phrase without the exact title: %s", (title) => {
		expect(classifyBrowserChallenge({ ...response, title })).toBeNull();
	});
	it.each([
		"",
		"Enable JavaScript",
		"Enable cookies to continue",
		"Enable JavaScript and cookies",
		"JavaScript and cookies to continue",
		"Enable JavaScript or cookies to continue",
		"Enable JavaScript and cookies to continued",
		"Enable JavaScript and cookies to continue_now",
		"Reenable JavaScript and cookies to continue",
	])("requires the complete bounded phrase: %s", (text) => {
		expect(classifyBrowserChallenge({ ...response, text })).toBeNull();
	});
	it.each([
		{
			name: "a phrase at the exact body limit",
			text: `${" ".repeat(8192 - phrase.length)}${phrase}`,
			title,
			matches: true,
		},
		{
			name: "a phrase ending before punctuation outside the body limit",
			text: `${" ".repeat(8192 - phrase.length)}${phrase}.`,
			title,
			matches: true,
		},
		{
			name: "a word continuing outside the body limit",
			text: `${" ".repeat(8192 - phrase.length)}${phrase}d`,
			title,
			matches: false,
		},
		{
			name: "a phrase cut off by the body limit",
			text: `${" ".repeat(8193 - phrase.length)}${phrase}`,
			title,
			matches: false,
		},
		{
			name: "a phrase entirely beyond the body limit",
			text: `${" ".repeat(8192)}${phrase}`,
			title,
			matches: false,
		},
		{
			name: "an early phrase with an unrelated truncated trailing word",
			text: `${phrase}. ${"x".repeat(8192)}`,
			title,
			matches: true,
		},
		{
			name: "an untruncated title at the exact title limit",
			text: phrase,
			title: title.padEnd(256, " "),
			matches: true,
		},
		{
			name: "a title truncated only in trailing whitespace",
			text: phrase,
			title: title.padEnd(257, " "),
			matches: false,
		},
		{
			name: "a misleading title suffix beyond the title limit",
			text: phrase,
			title: `${title.padEnd(256, " ")}documentation`,
			matches: false,
		},
	])("preserves raw input bounds: $name", ({ text, title, matches }) => {
		expect(classifyBrowserChallenge({ ...response, text, title })).toEqual(
			matches ? expected : null,
		);
	});
	it.each([100, 199, 204, 205, 300, 302, 304, 399])(
		"ignores non-document HTTP %i despite the complete pair",
		(status) => {
			expect(classifyBrowserChallenge({ ...response, status })).toBeNull();
		},
	);
	it.each<BrowserChallengeResponse["headers"]>([
		{},
		{ "content-type": "text/plain" },
		{ "content-type": "application/json" },
		{ "content-type": "application/xhtml+xml" },
		{ "content-type": ["text/html", "text/plain"] },
		{ "content-type": "text/html, application/json" },
		{ "content-type": [] },
	])("requires unambiguous HTML headers: %j", (headers) => {
		expect(classifyBrowserChallenge({ ...response, headers })).toBeNull();
	});
	it.each([
		[`${phrase}. Cloudflare.`, "cloudflare"],
		[`Cloudflare: ${phrase}.`, "cloudflare"],
		[`${phrase}. CLOUDFLARE.`, "cloudflare"],
		[`${phrase}. Cloudflareish.`, "unspecified"],
		[`${phrase}. ${" ".repeat(8192)}Cloudflare`, "unspecified"],
		[
			`${phrase}. ${" ".repeat(8192 - phrase.length - 2 - "Cloudflare".length)}Cloudflareish`,
			"unspecified",
		],
	])("requires independent bounded provider evidence: %s", (text, provider) => {
		expect(classifyBrowserChallenge({ ...response, text })).toEqual({
			...expected,
			provider,
		});
	});
	it.each([200, 204, 302, 403])(
		"keeps confirmed header precedence without MIME for HTTP %i",
		(status) => {
			let reads = 0;
			const getter = () => {
				reads++;
				throw new Error("Unexpected text access");
			};
			const input = Object.defineProperties(
				{
					...response,
					status,
					headers: { "cf-mitigated": "challenge", "retry-after": "12" },
				},
				{ title: { get: getter }, text: { get: getter } },
			);
			expect(classifyBrowserChallenge(input)).toEqual({
				...expected,
				provider: "cloudflare",
				confidence: "confirmed",
				evidence: ["cf-mitigated-challenge"],
				retryAfterSeconds: 12,
			});
			expect(reads).toBe(0);
		},
	);
	it.each<[string | string[], number | undefined]>([
		["0", 0],
		[" 12 ", 12],
		["86400", 86400],
		[["12", "12"], 12],
		[["12", "13"], undefined],
		["86401", undefined],
		["-1", undefined],
		["Tue, 15 Sep 2026 12:00:00 GMT", undefined],
	])("preserves validated retry advice: %j", (retry, seconds) => {
		expect(
			classifyBrowserChallenge({
				...response,
				headers: { ...html, "retry-after": retry },
			}),
		).toEqual({
			...expected,
			...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
		});
	});
	it.each(["status", "headers", "title", "text"])(
		"does not execute the response %s getter",
		(property) => {
			let reads = 0;
			const input = Object.defineProperty({ ...response }, property, {
				get() {
					reads++;
					throw new Error("Unexpected response access");
				},
			});
			expect(classifyBrowserChallenge(input)).toBeNull();
			expect(reads).toBe(0);
		},
	);
	it.each(["header", "array entry"])(
		"does not execute a content-type %s getter",
		(location) => {
			let reads = 0;
			const getter = () => {
				reads++;
				throw new Error("Unexpected header access");
			};
			const headers =
				location === "header"
					? Object.defineProperty({}, "content-type", { get: getter })
					: {
							"content-type": Object.defineProperty(["text/html"], "0", {
								get: getter,
							}),
						};
			expect(classifyBrowserChallenge({ ...response, headers })).toBeNull();
			expect(reads).toBe(0);
		},
	);
	it.each(["title", "text"])("does not coerce non-string %s", (property) => {
		let reads = 0;
		const value = {
			toString() {
				reads++;
				throw new Error("Unexpected coercion");
			},
		};
		const input = Object.defineProperty({ ...response }, property, { value });
		expect(classifyBrowserChallenge(input)).toBeNull();
		expect(reads).toBe(0);
	});
	it.each<"title" | "text">(["title", "text"])(
		"does not accept inherited %s",
		(property) => {
			const input = { ...response };
			Reflect.deleteProperty(input, property);
			Object.setPrototypeOf(input, { [property]: response[property] });
			expect(classifyBrowserChallenge(input)).toBeNull();
		},
	);
});
