import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as evidence from "../scripts/research-admission-evidence.js";
import * as captures from "../scripts/research-body-capture.js";
import * as browser from "../scripts/research-browser.js";
import {
	parseResearchJsonContentArguments,
	researchJsonContent,
} from "../scripts/research-json-content.js";
import * as sourceInput from "../scripts/research-source-input.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as sourceJson from "./html-source-json.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { researchReaderInfo } from "./research-reader-info.js";
import { BrowserSession } from "./session.js";

const url = "https://json-content.fixture.invalid/";
const encoder = new TextEncoder();
const privateMarker = "SYNTHETIC_UNSELECTED_CONFIGURATION";
const source = `<html><head><title>Catalog</title><script id="data" type="application/json">{"value":{"title":"Useful source","number":9007199254740993},"configuration":"${privateMarker}"}</script></head><body></body></html>`;
const argumentsFor = (pointer = "/value") => [
	"--script-id",
	"data",
	"--json-pointer",
	pointer,
	url,
];
let expectedRequests = 0;

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("No alternate client");
		}),
	);
});

afterEach(() => {
	try {
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		expect(fetch).not.toHaveBeenCalled();
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
			if (tree instanceof DocumentTree) {
				expect(tree.mutationMetrics().closed).toBe(true);
				expect(researchReaderInfo(tree)).toBeUndefined();
			}
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

function arrange(
	html = source,
	status = 200,
	headers: Record<string, string[]> = {},
) {
	const body = encoder.encode(html);
	expectedRequests++;
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url,
		status,
		headers: { "content-type": ["text/html; charset=utf-8"], ...headers },
		body,
		encodedBytes: body.byteLength,
		elapsedMs: 0,
		redirects: [],
	});
	return body;
}

it("parses an explicit source selection and normalizes only the navigation URL", () => {
	expect(parseResearchJsonContentArguments(argumentsFor())).toEqual({
		url,
		selection: { scriptId: "data", pointer: "/value" },
	});
	expect(
		parseResearchJsonContentArguments([
			url,
			"--json-pointer",
			"",
			"--script-id",
			"data",
		]).selection.pointer,
	).toBe("");
	expect(
		parseResearchJsonContentArguments([
			"--script-id",
			"data",
			"https://example.com",
			"--json-pointer",
			"/value",
		]).url,
	).toBe("https://example.com/");
	expect(
		Object.isFrozen(
			parseResearchJsonContentArguments(argumentsFor()).selection,
		),
	).toBe(true);
});

it.each(
	[
		[],
		["--help"],
		[url],
		["--script-id", "data", "--script-id", "again", url],
		["--script-id", "data", "--json-pointer", "bad", url],
		["--script-id", "data", "--json-pointer", "/bad~2", url],
		["--script-id", "", "--json-pointer", "", url],
		["--script-id", "two names", "--json-pointer", "", url],
		["--script-id", "data", "--json-pointer", "", "http://example.com/"],
		[
			"--script-id",
			"data",
			"--json-pointer",
			"",
			"https://name:password@example.com/",
		],
		["--script-id", "data", "--json-pointer", "", `${url}#fragment`],
		["--unknown", "data", "--json-pointer", "", url],
		[...argumentsFor(), "--reader"],
	].map((args) => ({ args })),
)("rejects invalid workflow input before browsing %#", async ({ args }) => {
	await expect(researchJsonContent(args)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
});

it.each([false, true])(
	"uses one native navigation and keeps its actual outcome (visible=%s)",
	async (visible) => {
		const body = arrange(
			visible ? source.replace("<body>", "<body><h1>Article</h1>") : source,
		);
		const selected = vi.spyOn(sourceJson, "selectHtmlJsonSource");
		const result = await researchJsonContent(argumentsFor());
		expect(result).toMatchObject({
			kind: "native-research-json-content-v1",
			outcome: "source-extracted-unverified",
			contentSuccess: null,
			partial: true,
			rendered: false,
			verified: false,
			capture: {
				outcome: visible ? "extracted-unverified" : "empty-extraction",
				receiptDisposition: "complete",
				metrics: { closed: true, active: 0 },
			},
			extraction: {
				format: "json-source",
				content: '{"title":"Useful source","number":9007199254740993}',
				networkRequests: 0,
				source: {
					bytes: {
						length: body.byteLength,
						sha256: createHash("sha256").update(body).digest("hex"),
					},
				},
			},
		});
		expect(result.capture.contentSuccess).toBe(visible ? null : false);
		expect(JSON.stringify(result)).not.toContain(privateMarker);
		expect(result).not.toHaveProperty("capture.bodyCapture");
		expect(result).not.toHaveProperty("capture.extraction");
		expect(result).not.toHaveProperty("failure");
		expect(selected).toHaveBeenCalledTimes(1);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
			expect.objectContaining({
				url,
				cookieContext: expect.objectContaining({ credentials: "omit" }),
			}),
		);
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
		expect(BrowserSession.prototype.close).toHaveBeenCalled();
	},
);

it.each<{ status: number; headers: Record<string, string[]> }>([
	{ status: 403, headers: {} },
	{ status: 404, headers: {} },
	{ status: 206, headers: {} },
	{ status: 429, headers: { "retry-after": ["60"] } },
	{ status: 200, headers: { "cf-mitigated": ["challenge"] } },
])(
	"does not use source JSON to bypass HTTP/access restrictions %#",
	async ({ status, headers }) => {
		arrange(source, status, headers);
		const decode = vi.spyOn(captures, "decodeResearchBodyCapture");
		const select = vi.spyOn(sourceJson, "selectHtmlJsonSource");
		const result = await researchJsonContent(argumentsFor());
		expect(result.outcome).toBe("failure");
		expect(result.contentSuccess).toBe(false);
		expect(result.failure?.stage).toBe("capture");
		expect(result.extraction).toBeUndefined();
		expect(decode).not.toHaveBeenCalled();
		expect(select).not.toHaveBeenCalled();
	},
);

it.each([
	{
		error: new AgentBrowserError("network-error", privateMarker),
		category: "network-error",
		nativeCategory: "network-error",
	},
	{
		error: new AgentBrowserError("timeout", privateMarker),
		category: "timeout",
		nativeCategory: "timeout",
	},
	{
		error: new Error(privateMarker),
		category: "invalid-input",
		nativeCategory: "internal-error",
	},
])(
	"preserves native capture failures without relabeling access policy: $nativeCategory",
	async ({ error, category, nativeCategory }) => {
		expectedRequests++;
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			error,
		);
		const decode = vi.spyOn(captures, "decodeResearchBodyCapture");
		const select = vi.spyOn(sourceJson, "selectHtmlJsonSource");
		const result = await researchJsonContent(argumentsFor());
		expect(result).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { stage: "capture", category },
			capture: {
				failure: { category: nativeCategory },
				metrics: { active: 0, closed: true },
			},
		});
		expect(result.extraction).toBeUndefined();
		expect(decode).not.toHaveBeenCalled();
		expect(select).not.toHaveBeenCalled();
		expect(JSON.stringify(result)).not.toContain(privateMarker);
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
		expect(BrowserSession.prototype.close).toHaveBeenCalled();
	},
);

it.each([
	{ source: '{"value":1}', mime: "application/json" },
	{ source: "Plain source", mime: "text/plain" },
])(
	"rejects non-HTML sources without fallback %#",
	async ({ source: text, mime }) => {
		arrange(text, 200, { "content-type": [mime] });
		const result = await researchJsonContent(argumentsFor());
		expect(result).toMatchObject({
			outcome: "failure",
			failure: { stage: "capture", category: "unsupported" },
		});
		expect(result.extraction).toBeUndefined();
	},
);

it.each([
	{ html: source, pointer: "/missing", category: "not-found" },
	{
		html: source.replace('id="data"', 'id="other"'),
		pointer: "/value",
		category: "not-found",
	},
	{
		html: source.replace('"value":{', '"value":null,"value":{'),
		pointer: "/value",
		category: "invalid-input",
	},
	{
		html: source.replace('type="application/json"', 'type="text/javascript"'),
		pointer: "/value",
		category: "invalid-input",
	},
])(
	"preserves capture and identifies source-stage failures %#",
	async ({ html, pointer, category }) => {
		arrange(html);
		const result = await researchJsonContent(argumentsFor(pointer));
		expect(result).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			capture: { outcome: "empty-extraction" },
			failure: { category, stage: "source" },
		});
		expect(result.extraction).toBeUndefined();
	},
);

it("clears owned decoded bytes and serialized receipts without clearing caller source", async () => {
	const sourceBytes = arrange();
	const original = new Uint8Array(sourceBytes);
	const decode = vi.spyOn(captures, "decodeResearchBodyCapture");
	const serialize = vi.spyOn(evidence, "serializeResearchReport");
	await researchJsonContent(argumentsFor());
	expect(decode).toHaveBeenCalledTimes(1);
	expect(decode.mock.results[0].value.every((byte: number) => byte === 0)).toBe(
		true,
	);
	expect(
		serialize.mock.results[0].value.jsonl.every((byte: number) => byte === 0),
	).toBe(true);
	expect(sourceBytes).toEqual(original);
});

it("pre-abort never creates a native request", async () => {
	const controller = new AbortController();
	controller.abort(new Error(privateMarker));
	await expect(
		researchJsonContent(argumentsFor(), controller.signal),
	).rejects.toMatchObject({
		code: "aborted",
		message: "JSON content operation stopped",
	});
});

it("aborting during source selection clears owned buffers and does not retry", async () => {
	arrange();
	const controller = new AbortController();
	const decode = vi.spyOn(captures, "decodeResearchBodyCapture");
	vi.spyOn(sourceJson, "selectHtmlJsonSource").mockImplementation(() => {
		controller.abort(new Error(privateMarker));
		throw new Error(privateMarker);
	});
	await expect(
		researchJsonContent(argumentsFor(), controller.signal),
	).rejects.toMatchObject({
		code: "aborted",
		message: "JSON content operation stopped",
	});
	expect(decode.mock.results[0].value.every((byte: number) => byte === 0)).toBe(
		true,
	);
});

it.each(["hash", "length", "active", "unclosed", "missing-body"])(
	"rejects inconsistent internal capture evidence: %s",
	async (variant) => {
		arrange();
		const captured = await browser.researchNavigation(
			url,
			true,
			undefined,
			undefined,
			true,
		);
		if (!captured.primaryResponse || !captured.metrics)
			throw new Error("Synthetic capture missing");
		if (variant === "hash")
			captured.primaryResponse.bodySha256 = "a".repeat(64);
		if (variant === "length") captured.primaryResponse.decodedBytes++;
		if (variant === "active")
			captured.metrics = { ...captured.metrics, active: 1 };
		if (variant === "unclosed")
			captured.metrics = { ...captured.metrics, closed: false };
		if (variant === "missing-body") captured.bodyCapture = undefined;
		vi.spyOn(browser, "researchNavigation").mockResolvedValueOnce(captured);
		const select = vi.spyOn(sourceJson, "selectHtmlJsonSource");
		const result = await researchJsonContent(argumentsFor());
		expect(result.outcome).toBe("failure");
		expect(result.failure?.stage).toBe("capture");
		expect(select).not.toHaveBeenCalled();
	},
);

it("sanitizes source-admission failures instead of reporting body details", async () => {
	arrange();
	vi.spyOn(sourceInput, "admitResearchHtmlSource").mockImplementation(() => {
		throw new Error(privateMarker);
	});
	const result = await researchJsonContent(argumentsFor());
	expect(result.failure).toEqual({
		stage: "source",
		category: "invalid-input",
	});
	expect(JSON.stringify(result)).not.toContain(privateMarker);
});
