import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	serializeResearchReport,
	validateResearchReplayAdmission,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchExecutionOptions,
	researchNavigation,
} from "../scripts/research-browser.js";
import { researchJsonContent } from "../scripts/research-json-content.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import * as structures from "./browser-challenge-structure.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";

const url = "https://behavioral-challenge.fixture.invalid/";
const encoder = new TextEncoder();
const shell =
	'<div id="sec-if-cpt-container" role="main" style="display: none"><div class="behavioral-content"><div id="sec-bc-text-container"></div><div id="sec-bc-tile-parent"><div id="sec-bc-tile-container"></div></div><div class="sec-bc-button-parent"><div class="behavioral-button progress-btn-disabled"><div class="btn" id="progress-button" role="button" tabindex="0" disabled></div><div class="progress"></div></div></div></div></div>';
const source = `<!doctype html><html><head><title></title></head><body><script>void 0</script>${shell}<script id="data" type="application/json">{"public":"not accessible page content"}</script></body></html>`;

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("No alternate browser");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
		expect(fetch).not.toHaveBeenCalled();
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts)
			if (tree instanceof DocumentTree)
				expect(tree.mutationMetrics().closed).toBe(true);
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function arrange(
	html = source,
	status = 200,
	mime = "text/html; charset=utf-8",
) {
	const body = encoder.encode(html);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status,
		headers: { "content-type": [mime] },
		body,
		encodedBytes: body.length,
		redirects: [],
		elapsedMs: 0,
	});
	return body;
}

const variants = [false, true].flatMap((reader) =>
	[200, 403, 503].flatMap((status) =>
		(["markdown", "json"] as const).map((format) => ({
			reader,
			status,
			format,
		})),
	),
);

it.each(variants)(
	"hands off the empty structural shell: reader=$reader status=$status format=$format",
	async ({ reader, status, format }) => {
		const body = arrange(source, status);
		const result = await researchNavigation(
			url,
			reader,
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			{ format },
		);
		expect(result).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: {
				barrier: "challenge",
				diagnostic: {
					provider: "unspecified",
					confidence: "possible",
					evidence: ["html-behavioral-challenge-shell"],
					action: "stop-and-request-user-handoff",
				},
			},
			metrics: { active: 0, closed: true },
		});
		expect(result.extraction).toBeUndefined();
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(1);
		expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(1);
		const emission = serializeResearchReport(result, "default");
		expect(
			validateResearchReplayAdmission(emission.jsonl, {
				expectedProfile: "default",
				expectedReceiptSha256: createHash("sha256")
					.update(emission.jsonl)
					.digest("hex"),
				expectedBody: {
					bytes: body.length,
					sha256: createHash("sha256").update(body).digest("hex"),
				},
			}),
		).toMatchObject({
			kind: "evidence-only",
			reason: "native-failure",
			body: null,
		});
	},
);

it.each<ResearchExecutionOptions>([
	{ readerVisibilityPolicy: "source-hidden-v1" },
	{ readerVisibilityPolicy: "source-hidden-inline-v1" },
	{
		readerVisibilityPolicy: "source-hidden-inline-v1",
		contentFocus: "main-content-v3",
	},
	{
		readerVisibilityPolicy: "source-hidden-inline-v1",
		readerRawPolicy: "separate-omitted-raw-v1",
	},
])("does not let reader filtering hide the shell %#", async (options) => {
	arrange();
	const result = await researchNavigation(
		url,
		true,
		undefined,
		options.contentFocus ? undefined : "body",
		true,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		options,
	);
	expect(result.outcome).toBe("semantic-barrier");
	expect(result.extraction).toBeUndefined();
	expect(result.metrics).toMatchObject({ active: 0, closed: true });
});

it("does not recover JSON through the structural challenge", async () => {
	arrange();
	const result = await researchJsonContent([
		"--script-id",
		"data",
		"--json-pointer",
		"/public",
		url,
	]);
	expect(result.outcome).toBe("failure");
	expect(result.capture.outcome).toBe("semantic-barrier");
	expect(result.extraction).toBeUndefined();
});

it("preserves rate-limit handling before structural inspection", async () => {
	arrange(source, 429);
	const structure = vi.spyOn(structures, "browserChallengeStructure");
	const result = await researchNavigation(url, true);
	expect(result.outcome).toBe("http-failure");
	expect(result.rateLimit?.action).toBe("stop-without-retry");
	expect(structure).not.toHaveBeenCalled();
});

it.each([false, true])(
	"does not hand off solely from an incomplete shell: reader=%s",
	async (reader) => {
		arrange(source.replace("</body></html>", '<script title="'));
		const result = await researchNavigation(url, reader);
		expect(result.outcome).not.toBe("semantic-barrier");
		expect(result.classification.diagnostic?.evidence ?? []).not.toContain(
			"html-behavioral-challenge-shell",
		);
	},
);

it.each([false, true])(
	"retains substantive sibling content: reader=%s",
	async (reader) => {
		arrange(
			source.replace(
				"</body>",
				"<main><h1>Catalog</h1><p>Actual product descriptions remain accessible.</p></main></body>",
			),
		);
		const result = await researchNavigation(url, reader);
		expect(result.outcome).toBe("extracted-unverified");
		expect(result.classification.barrier).toBeNull();
		expect(result.extraction?.content).toContain("Actual product descriptions");
	},
);

it("rechecks structure when replaying a synthetic pre-detector capture", async () => {
	const previous = vi
		.spyOn(structures, "browserChallengeStructure")
		.mockReturnValue(undefined);
	const html = source.replace(
		'<div class="behavioral-content">',
		'<div class="behavioral-content"><p>Challenge pending</p>',
	);
	const body = arrange(html);
	const captured = await researchNavigation(
		url,
		true,
		undefined,
		undefined,
		true,
	);
	previous.mockRestore();
	expect(captured.outcome).toBe("extracted-unverified");
	const emission = serializeResearchReport(captured, "default");
	const raw = new Uint8Array(emission.jsonl);
	const result = extractResearchReplayJson(
		emission.jsonl,
		{
			expectedProfile: "default",
			expectedReceiptSha256: createHash("sha256")
				.update(emission.jsonl)
				.digest("hex"),
			expectedBody: {
				bytes: body.length,
				sha256: createHash("sha256").update(body).digest("hex"),
			},
		},
		{ selector: "body" },
	);
	expect(result.report.outcome).toBe("semantic-barrier");
	expect(result.report.classification.diagnostic?.evidence).toEqual([
		"html-behavioral-challenge-shell",
	]);
	expect(result.report.networkRequests).toBe(0);
	expect(emission.jsonl).toEqual(raw);
});
