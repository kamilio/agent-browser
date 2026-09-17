import { afterEach, describe, expect, it, vi } from "vitest";
import { researchResponseChallengeStructure } from "../scripts/research-challenge-structure.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as parser from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import {
	type BrowserChallengeResponse,
	classifyBrowserChallenge,
} from "./browser-challenges.js";

const response: BrowserChallengeResponse = {
	status: 200,
	headers: { "content-type": ["text/html; charset=utf-8"] },
	structure: "behavioral-challenge-shell-v1",
};

afterEach(() => vi.restoreAllMocks());

describe("bounded structural challenge diagnostic", () => {
	it.each([200, 201, 202, 206, 400, 403, 429, 500, 503])(
		"reports a possible shell for admitted HTML status %i",
		(status) => {
			expect(classifyBrowserChallenge({ ...response, status })).toEqual({
				kind: "challenge",
				provider: "unspecified",
				confidence: "possible",
				evidence: ["html-behavioral-challenge-shell"],
				action: "stop-and-request-user-handoff",
			});
		},
	);
	it.each([
		0,
		99,
		100,
		199,
		204,
		205,
		300,
		301,
		302,
		307,
		399,
		600,
		Number.NaN,
	])("does not admit unsupported status %s", (status) => {
		expect(classifyBrowserChallenge({ ...response, status })).toBeNull();
	});
	it.each(["text/plain", "application/json", "text/markdown", "image/svg+xml"])(
		"does not reinterpret MIME %s",
		(mime) => {
			expect(
				classifyBrowserChallenge({
					...response,
					headers: { "content-type": [mime] },
				}),
			).toBeNull();
		},
	);
	it.each([
		undefined,
		null,
		false,
		true,
		"",
		"behavioral-challenge-shell",
		{},
		[],
	])("requires the exact structure discriminator %#", (structure) => {
		expect(
			classifyBrowserChallenge({
				...response,
				structure,
			} as BrowserChallengeResponse),
		).toBeNull();
	});
	it("does not invoke a structure accessor", () => {
		let calls = 0;
		const input = { ...response };
		Object.defineProperty(input, "structure", {
			get() {
				calls++;
				return response.structure;
			},
		});
		expect(classifyBrowserChallenge(input)).toBeNull();
		expect(calls).toBe(0);
	});
	it("retains confirmed header precedence", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				headers: { ...response.headers, "cf-mitigated": ["challenge"] },
			}),
		).toMatchObject({
			provider: "cloudflare",
			confidence: "confirmed",
			evidence: ["cf-mitigated-challenge"],
		});
	});
	it("retains bounded retry advice without exposing structure content", () => {
		expect(
			classifyBrowserChallenge({
				...response,
				headers: { ...response.headers, "retry-after": ["120"] },
			}),
		).toMatchObject({ retryAfterSeconds: 120 });
	});
});

describe("bounded pre-sanitization source inspection", () => {
	const html =
		'<!doctype html><html><head></head><body><div id="sec-if-cpt-container" role="main" style="display:none"><div class="behavioral-content"><div id="sec-bc-text-container"></div><div id="sec-bc-tile-parent"><div id="sec-bc-tile-container"></div></div><div class="behavioral-button"><div id="progress-button" role="button" disabled></div><div class="progress"></div></div></div></div></body></html>';
	function source(
		text = html,
		mime = "text/html; charset=utf-8",
	): NetworkResponse {
		return {
			url: "https://source-structure.fixture.invalid/",
			status: 200,
			headers: { "content-type": [mime] },
			body: new TextEncoder().encode(text),
			encodedBytes: 0,
			elapsedMs: 0,
			redirects: [],
		};
	}
	it("uses an owned inert tree and leaves response bytes intact", () => {
		const input = source();
		const copy = new Uint8Array(input.body);
		const close = vi.spyOn(DocumentTree.prototype, "close");
		expect(researchResponseChallengeStructure(input)).toBe(response.structure);
		expect(close).toHaveBeenCalledTimes(1);
		const closed = close.mock.contexts[0];
		if (!(closed instanceof DocumentTree))
			throw new Error("Missing owned tree");
		expect(closed.mutationMetrics().closed).toBe(true);
		expect(input.body).toEqual(copy);
	});
	it.each(["text/plain", "text/markdown", "application/json"])(
		"does not parse MIME %s",
		(mime) => {
			const parse = vi.spyOn(parser, "parseHtmlDocument");
			expect(
				researchResponseChallengeStructure(source(html, mime)),
			).toBeUndefined();
			expect(parse).not.toHaveBeenCalled();
		},
	);
	it("does not parse an oversized complete response", () => {
		const parse = vi.spyOn(parser, "parseHtmlDocument");
		expect(
			researchResponseChallengeStructure(source(html.padEnd(32769))),
		).toBeUndefined();
		expect(parse).not.toHaveBeenCalled();
	});
	it("does not parse a small ordinary response without the marker", () => {
		const parse = vi.spyOn(parser, "parseHtmlDocument");
		expect(
			researchResponseChallengeStructure(source("<p>Actual article</p>")),
		).toBeUndefined();
		expect(parse).not.toHaveBeenCalled();
	});
	it("does not treat a marker comment as a shell", () => {
		expect(
			researchResponseChallengeStructure(
				source("<!--sec-if-cpt-container--><p>Actual article</p>"),
			),
		).toBeUndefined();
	});
	it.each([
		'<script title="',
		"<script>unfinished",
		"<style>unfinished",
		"<!--unfinished",
		"<!unfinished",
		"<!DOCTYPE html",
		'<!DOCTYPE html PUBLIC "unfinished',
	])(
		"closes inconclusive incomplete source without changing bytes %#",
		(tail) => {
			const input = source(html.replace("</body></html>", tail));
			const copy = new Uint8Array(input.body);
			const close = vi.spyOn(DocumentTree.prototype, "close");
			expect(researchResponseChallengeStructure(input)).toBeUndefined();
			expect(input.body).toEqual(copy);
			expect(close).toHaveBeenCalledTimes(1);
			expect(
				close.mock.contexts.every(
					(tree) =>
						tree instanceof DocumentTree && tree.mutationMetrics().closed,
				),
			).toBe(true);
		},
	);
	it("closes a partially constructed over-budget tree", () => {
		const close = vi.spyOn(DocumentTree.prototype, "close");
		expect(
			researchResponseChallengeStructure(
				source(
					html.replace("</body>", `${"<span>x</span>".repeat(300)}</body>`),
				),
			),
		).toBeUndefined();
		expect(close).toHaveBeenCalled();
		expect(
			close.mock.contexts.every(
				(tree) => tree instanceof DocumentTree && tree.mutationMetrics().closed,
			),
		).toBe(true);
	});
	it.each(["aborted", "timeout", "closed"] as const)(
		"preserves cancellation category %s without decoding",
		(code) => {
			const controller = new AbortController();
			controller.abort(new AgentBrowserError(code, "SYNTHETIC_PRIVATE_REASON"));
			const parse = vi.spyOn(parser, "parseHtmlDocument");
			expect(() =>
				researchResponseChallengeStructure(source(), controller.signal),
			).toThrow(
				expect.objectContaining({
					code,
					message: "Challenge source check aborted",
				}),
			);
			expect(parse).not.toHaveBeenCalled();
		},
	);
});
