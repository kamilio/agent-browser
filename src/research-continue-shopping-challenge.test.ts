import { afterEach, expect, it, vi } from "vitest";
import { researchNavigation } from "../scripts/research-browser.js";
import { researchResponseChallengeStructure } from "../scripts/research-challenge-structure.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";

const url = "https://www.amazon.com/";
const source = `<!doctype html><html><head><title>Amazon.com</title></head><body>
<h4>Click the button below to continue shopping</h4>
<form method="get" action="/errors_page/validateCaptcha">
<input type="hidden" name="amzn" value="SYNTHETIC_ONLY_A">
<input type="hidden" name="amzn-r" value="SYNTHETIC_ONLY_B">
<input type="hidden" name="field-keywords" value="SYNTHETIC_ONLY_C">
<div><span><button type="submit">Continue shopping</button></span></div></form>
<div><a href="/terms">Conditions of Use</a> <a href="/privacy">Privacy Policy</a></div>
<div>© 1996-2025, Amazon.com, Inc. or its affiliates</div></body></html>`;

function response(html = source): NetworkResponse {
	const body = new TextEncoder().encode(html);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

afterEach(() => vi.restoreAllMocks());

it("recognizes the raw response and closes its inert document", () => {
	const close = vi.spyOn(DocumentTree.prototype, "close");
	const input = response();
	const before = input.body.slice();
	expect(researchResponseChallengeStructure(input)).toBe(
		"continue-shopping-challenge-v1",
	);
	expect(close).toHaveBeenCalledOnce();
	expect(input.body).toEqual(before);
});

it.each(["application/json", "text/plain", "application/xhtml+xml"])(
	"does not reinterpret %s source",
	(contentType) => {
		const close = vi.spyOn(DocumentTree.prototype, "close");
		const input = response();
		input.headers = { "content-type": [contentType] };
		expect(researchResponseChallengeStructure(input)).toBeUndefined();
		expect(close).not.toHaveBeenCalled();
	},
);

it("retains the raw structural byte bound", () => {
	const input = response(`${source}${" ".repeat(32_768)}`);
	const close = vi.spyOn(DocumentTree.prototype, "close");
	expect(researchResponseChallengeStructure(input)).toBeUndefined();
	expect(close).not.toHaveBeenCalled();
});

it.each(["aborted", "timeout", "closed"] as const)(
	"retains %s cancellation before parsing",
	(code) => {
		const controller = new AbortController();
		controller.abort(new AgentBrowserError(code, "Synthetic cancellation"));
		const close = vi.spyOn(DocumentTree.prototype, "close");
		expect(() =>
			researchResponseChallengeStructure(response(), controller.signal),
		).toThrow(expect.objectContaining({ code }));
		expect(close).not.toHaveBeenCalled();
	},
);

it.each([undefined, "source-hidden-v1", "source-hidden-inline-v1"] as const)(
	"stops before ordinary extraction with visibility policy %s",
	async (readerVisibilityPolicy) => {
		const request = vi
			.spyOn(NodeNetworkTransport.prototype, "request")
			.mockResolvedValueOnce(response());
		const report = await researchNavigation(
			url,
			true,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			false,
			undefined,
			"default",
			{ readerVisibilityPolicy, minRequestIntervalMs: 0 },
		);
		expect(request).toHaveBeenCalledOnce();
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.classification).toMatchObject({
			barrier: "challenge",
			diagnostic: {
				provider: "unspecified",
				confidence: "possible",
				evidence: ["html-continue-shopping-challenge"],
				action: "stop-and-request-user-handoff",
			},
		});
		expect(report.metrics).toMatchObject({ active: 0, closed: true });
		expect(report.extraction).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain("SYNTHETIC_ONLY");
	},
);

it("keeps substantive shopping content retrievable", async () => {
	const request = vi
		.spyOn(NodeNetworkTransport.prototype, "request")
		.mockResolvedValueOnce(
			response(
				'<title>Amazon.com</title><main><h1>Product details</h1><p>A useful product description.</p><a href="/">Continue shopping</a></main>',
			),
		);
	const report = await researchNavigation(url, true);
	expect(request).toHaveBeenCalledOnce();
	expect(report.classification.barrier).toBeNull();
	expect(report.outcome).toBe("extracted-unverified");
	expect(report.extraction?.content).toContain(
		"A useful product description\\.",
	);
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
});
