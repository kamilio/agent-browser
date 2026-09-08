import { describe, expect, it } from "vitest";
import {
	type BrowserChallengeDiagnostic,
	type BrowserChallengeResponse,
	classifyBrowserChallenge,
} from "./browser-challenges.js";

const titleLimit = 256;
const textLimit = 8192;
const html = { "content-type": "text/html" };
const page: BrowserChallengeResponse = {
	status: 200,
	headers: html,
	title: "Robot check",
};
const challenge: BrowserChallengeDiagnostic = {
	kind: "challenge",
	provider: "unspecified",
	confidence: "possible",
	evidence: ["html-challenge-markers"],
	action: "stop-and-request-user-handoff",
};
const cloudflare: BrowserChallengeDiagnostic = {
	...challenge,
	provider: "cloudflare",
};
const login: BrowserChallengeDiagnostic = {
	...challenge,
	kind: "login",
	evidence: ["html-login-markers"],
};
const socialLogin: BrowserChallengeDiagnostic = {
	...login,
	evidence: ["login-url-and-html-markers"],
};
const denied: BrowserChallengeDiagnostic = {
	...challenge,
	kind: "access-denied",
	evidence: ["html-network-security-block"],
};
const confirmed: BrowserChallengeDiagnostic = {
	...cloudflare,
	confidence: "confirmed",
	evidence: ["cf-mitigated-challenge"],
};

function atCutoff(marker: string, suffix = "", leading = ""): string {
	return (
		leading +
		" ".repeat(textLimit - leading.length - marker.length) +
		marker +
		suffix
	);
}

interface MarkerFixture {
	readonly label: string;
	readonly marker: string;
	readonly suffix: string;
	readonly leading?: string;
	readonly response: BrowserChallengeResponse;
	readonly expected: BrowserChallengeDiagnostic;
	readonly withoutMarker: BrowserChallengeDiagnostic | null;
}

const bodyFixtures: readonly MarkerFixture[] = [
	{
		label: "human challenge",
		marker: "Verify you are human",
		suffix: "ity",
		response: page,
		expected: challenge,
		withoutMarker: null,
	},
	{
		label: "robot challenge",
		marker: "not a robot",
		suffix: "ic assistant.",
		response: page,
		expected: challenge,
		withoutMarker: null,
	},
	{
		label: "Cloudflare provider label",
		marker: "Cloudflare",
		suffix: "d",
		leading: "Verify you are human. ",
		response: page,
		expected: cloudflare,
		withoutMarker: challenge,
	},
	{
		label: "network-security block",
		marker: "You've been blocked by network security",
		suffix: "guard",
		response: { ...page, status: 403, title: "Blocked" },
		expected: denied,
		withoutMarker: null,
	},
	{
		label: "title-based login",
		marker: "Password",
		suffix: "less",
		response: { ...page, title: "Sign in" },
		expected: login,
		withoutMarker: null,
	},
	{
		label: "Google then Apple login",
		marker: "Continue with GoogleContinue with Apple",
		suffix: "ts",
		response: {
			...page,
			title: "Welcome",
			url: "https://fixture.invalid/login",
		},
		expected: socialLogin,
		withoutMarker: null,
	},
	{
		label: "Apple then Google login",
		marker: "Continue with AppleContinue with Google",
		suffix: "bot",
		response: {
			...page,
			title: "Welcome",
			url: "https://fixture.invalid/login/",
		},
		expected: socialLogin,
		withoutMarker: null,
	},
];

const reportedNegatives = [
	{
		label: "ordinary article title with widget text",
		response: {
			...page,
			title: `${"Just a moment...".padEnd(titleLimit, " ")}ordinary article`,
			text: "Our form includes a verify you are human widget.",
		},
	},
	{
		label: "ordinary robotic-assistant article",
		response: {
			...page,
			text: atCutoff("not a robot", "ic assistant."),
		},
	},
];

describe("synthetic bounded challenge-marker cutoffs", () => {
	it.each(reportedNegatives)(
		"does not manufacture $label evidence",
		({ response }) => {
			expect(classifyBrowserChallenge(response)).toBeNull();
		},
	);

	it("does not treat an over-budget login title as a complete title", () => {
		expect(
			classifyBrowserChallenge({
				...page,
				title: `${"Sign in".padEnd(titleLimit, " ")}accessibility guide`,
				text: "Password input accessibility.",
			}),
		).toBeNull();
	});

	it.each([
		{
			title: "Just a moment...",
			text: "Verify you are human.",
			expected: challenge,
		},
		{ title: "Sign in", text: "Password", expected: login },
	])(
		"accepts a complete exact-limit $title title",
		({ title, text, expected }) => {
			expect(
				classifyBrowserChallenge({
					...page,
					title: title.padEnd(titleLimit, " "),
					text,
				}),
			).toEqual(expected);
		},
	);

	it.each(bodyFixtures)(
		"rejects a word continuing beyond $label",
		(fixture) => {
			expect(
				classifyBrowserChallenge({
					...fixture.response,
					text: atCutoff(fixture.marker, fixture.suffix, fixture.leading),
				}),
			).toEqual(fixture.withoutMarker);
		},
	);

	it.each(bodyFixtures)(
		"retains complete exact-limit $label evidence",
		(fixture) => {
			expect(
				classifyBrowserChallenge({
					...fixture.response,
					text: atCutoff(fixture.marker, "", fixture.leading),
				}),
			).toEqual(fixture.expected);
		},
	);

	it.each(bodyFixtures)(
		"does not complete $label using lookahead",
		(fixture) => {
			expect(
				classifyBrowserChallenge({
					...fixture.response,
					text: atCutoff(
						fixture.marker.slice(0, -1),
						fixture.marker.slice(-1),
						fixture.leading,
					),
				}),
			).toEqual(fixture.withoutMarker);
		},
	);

	it.each([
		{ label: "punctuation", suffix: "!" },
		{ label: "space", suffix: " " },
		{ label: "tab", suffix: "\t" },
		{ label: "non-ASCII nonword letter", suffix: "é" },
		{ label: "combining mark", suffix: "\u0301" },
		{ label: "astral nonword character", suffix: "😀" },
	])("retains a real $label boundary just beyond the cutoff", ({ suffix }) => {
		expect(
			classifyBrowserChallenge({
				...page,
				text: atCutoff("Verify you are human", suffix),
			}),
		).toEqual(challenge);
	});

	it.each([
		{ label: "uppercase ASCII", suffix: "A" },
		{ label: "digit", suffix: "1" },
		{ label: "underscore", suffix: "_" },
		{ label: "Kelvin sign lowercasing to ASCII", suffix: "\u212a" },
		{
			label: "dotted I lowercasing to ASCII plus a combining mark",
			suffix: "\u0130",
		},
	])("rejects a normalized $label word continuation", ({ suffix }) => {
		expect(
			classifyBrowserChallenge({
				...page,
				title: "ROBOT CHECK",
				text: atCutoff("VERIFY YOU ARE HUMAN", suffix),
			}),
		).toBeNull();
	});

	it.each([" ", "\t", "\n", "\u00a0"])(
		"preserves admitted whitespace %j before a word-like lookahead",
		(separator) => {
			expect(
				classifyBrowserChallenge({
					...page,
					text: atCutoff(`VERIFY YOU ARE HUMAN${separator}`, "\u0130"),
				}),
			).toEqual(challenge);
		},
	);

	it.each([
		{
			label: "challenge",
			leading: "Verify you are human. ",
			marker: "not a robot",
			suffix: "ic",
			expected: challenge,
		},
		{
			label: "provider",
			leading: "Verify you are human. Cloudflare. ",
			marker: "Cloudflare",
			suffix: "d",
			expected: cloudflare,
		},
	])("retains earlier genuine $label evidence before a cut word", (fixture) => {
		expect(
			classifyBrowserChallenge({
				...page,
				text: atCutoff(fixture.marker, fixture.suffix, fixture.leading),
			}),
		).toEqual(fixture.expected);
	});

	it.each([
		{
			label: "network-security block",
			response: {
				...page,
				status: 403,
				text: "You've been blocked by network security.",
			},
			expected: denied,
		},
		{
			label: "URL-based login",
			response: {
				...page,
				url: "https://fixture.invalid/login",
				text: "Continue with GoogleContinue with Apple",
			},
			expected: socialLogin,
		},
	])(
		"retains independent $label evidence with an over-budget title",
		({ response, expected }) => {
			expect(
				classifyBrowserChallenge({
					...response,
					title: "Just a moment...".padEnd(titleLimit + 1, " "),
				}),
			).toEqual(expected);
		},
	);

	it.each(reportedNegatives)(
		"preserves confirmed headers over $label",
		({ response }) => {
			expect(
				classifyBrowserChallenge({
					...response,
					headers: { ...html, "cf-mitigated": "challenge" },
				}),
			).toEqual(confirmed);
		},
	);

	it("does not read title, text or URL accessors before confirmed header evidence", () => {
		let reads = 0;
		const response = { ...page, headers: { "cf-mitigated": "challenge" } };
		for (const name of ["title", "text", "url"]) {
			Object.defineProperty(response, name, {
				get() {
					reads++;
					throw new Error("synthetic-private-accessor");
				},
			});
		}
		expect(classifyBrowserChallenge(response)).toEqual(confirmed);
		expect(reads).toBe(0);
	});
});
