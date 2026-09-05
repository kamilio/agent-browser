import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	parseResearchArguments,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import * as documentLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as readerLoader from "./research-loader.js";
import { BrowserSession } from "./session.js";

const url = "https://research.example/paper";
const otherUrl = "https://research.example/other";
type Lines = { start: number; end: number };

function response(
	source: string,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/plain; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 1,
		...overrides,
	};
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
});

afterEach(() => vi.restoreAllMocks());

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
}

async function navigate(
	input: NetworkResponse,
	lines: Lines,
	reader = false,
	captureBody = false,
) {
	const originalBody = input.body.slice();
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	request.mockResolvedValueOnce(input);
	const report = await researchNavigation(
		url,
		reader,
		undefined,
		undefined,
		captureBody,
		lines,
	);
	expect(request).toHaveBeenCalledOnce();
	expect(request.mock.calls[0][0]).toMatchObject({
		cookieContext: { credentials: "omit" },
	});
	expect(report.metrics?.closed).toBe(true);
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(report.partial).toBe(true);
	expect([null, false]).toContain(report.contentSuccess);
	expect(report.selection).toEqual({ method: "text-lines", ...lines });
	expect(input.body).toEqual(originalBody);
	expect(report.primaryResponse).toMatchObject({
		status: input.status,
		decodedBytes: originalBody.byteLength,
		bodySha256: createHash("sha256").update(originalBody).digest("hex"),
		hashScope: "transport-decoded-body-before-loader",
	});
	return report;
}

it.each(
	[
		["--lines", "2:3", url],
		[url, "--lines", "2:3"],
		["--reader", "--lines", "2:3", url, otherUrl],
		[url, "--lines", "2:3", "--reader", otherUrl],
		[url, otherUrl, "--capture-body", "--lines", "2:3", "--reader"],
		["--capture-body", "--lines", "2:3", url],
	].map((args) => ({ args })),
)("accepts line flag placement $args without setup", ({ args }) => {
	expect(parseResearchArguments(args)).toEqual({
		reader: args.includes("--reader"),
		urls: args.filter((argument) => argument.startsWith("https:")),
		lines: { start: 2, end: 3 },
		...(args.includes("--capture-body") ? { captureBody: true } : {}),
	});
	expectNoSetup();
});

it.each([
	{ value: "1:1", start: 1, end: 1 },
	{ value: "1:2000001", start: 1, end: 2_000_001 },
	{ value: "2000001:2000001", start: 2_000_001, end: 2_000_001 },
])("accepts canonical inclusive bounds $value", ({ value, start, end }) => {
	expect(parseResearchArguments([url, "--lines", value])).toEqual({
		reader: false,
		urls: [url],
		lines: { start, end },
	});
	expectNoSetup();
});

it("omits lines from existing unscoped and selector parser results", () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	expect(parseResearchArguments([url, "--selector", "main"])).toEqual({
		reader: false,
		urls: [url],
		selector: "main",
	});
	expectNoSetup();
});

it.each(
	[
		"",
		"1",
		"1:",
		":2",
		"1:2:3",
		"0:1",
		"1:0",
		"3:2",
		"01:2",
		"1:02",
		"+1:2",
		"1:+2",
		"-1:2",
		"1:-2",
		"1.0:2",
		"1:2.0",
		"1e0:2",
		"1:2e0",
		"0x1:2",
		"1:0x2",
		" 1:2",
		"1:2 ",
		"1 :2",
		"1:\t2",
		"1:2\n",
		"1:2\r",
		"1:2\r\n",
		"１:２",
		"NaN:2",
		"1:Infinity",
		"2000002:2000002",
		"1:2000002",
		"9007199254740992:9007199254740992",
		"1:9007199254740992",
		null,
		42,
		{},
	].map((value) => ({ value })),
)("rejects malformed line value $value before setup", ({ value }) => {
	expect(() =>
		parseResearchArguments([url, "--lines", value] as unknown as string[]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expectNoSetup();
});

it.each(
	[
		[url, "--lines"],
		[url, "--lines", "--reader"],
		[url, "--lines", "--capture-body"],
		[url, "--lines", "1:2", "--lines", "1:2"],
		[url, "--lines", "1:2", "--lines", "2:3"],
		[url, "--lines", "1:2", "--selector", "main"],
		[url, "--selector", "main", "--lines", "1:2"],
		[url, "--lines=1:2"],
		["--lines", "1:2"],
	].map((args) => ({ args })),
)("rejects missing, duplicate, or conflicting flags $args", ({ args }) => {
	expect(() => parseResearchArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expectNoSetup();
});

it.each(
	[
		null,
		"1:2",
		Object.assign([], { start: 1, end: 2 }),
		{},
		{ start: 1 },
		{ end: 2 },
		{ start: 0, end: 1 },
		{ start: 2, end: 1 },
		{ start: -1, end: 2 },
		{ start: 1, end: 0 },
		{ start: 1.5, end: 2 },
		{ start: 1, end: 2.5 },
		{ start: "1", end: 2 },
		{ start: 1, end: "2" },
		{ start: Number.NaN, end: 2 },
		{ start: 1, end: Number.NaN },
		{ start: Number.POSITIVE_INFINITY, end: Number.POSITIVE_INFINITY },
		{ start: 1, end: Number.MAX_SAFE_INTEGER + 1 },
		{ start: 1, end: 2_000_002 },
	].map((lines) => ({ lines })),
)("rejects invalid runtime range $lines before setup", async ({ lines }) => {
	await expect(
		researchNavigation(url, false, undefined, undefined, false, lines as Lines),
	).rejects.toMatchObject({ code: "invalid-input" });
	expectNoSetup();
});

it("rejects runtime selector and line conflicts before setup", async () => {
	await expect(
		researchNavigation(url, false, undefined, "pre", true, {
			start: 1,
			end: 1,
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expectNoSetup();
});

const selections = [
	{
		mime: "text/plain",
		source:
			"Outside prefix\r\n<main>literal & 😀</main>\r\nkept\rOutside suffix",
		selected: "<main>literal & 😀</main>\r\nkept\r",
		markdown: "```\n<main>literal & 😀</main>\nkept\n```\n",
		end: 3,
		totalLines: 4,
	},
	...["application/json", "application/problem+json"].map((mime) => ({
		mime,
		source: '{\n  "literal": "<main>&😀</main>",\n  "other": true\n}',
		selected: '  "literal": "<main>&😀</main>",\n',
		markdown: '```\n  "literal": "<main>&😀</main>",\n```\n',
		end: 2,
		totalLines: 4,
	})),
];

it.each(
	selections.flatMap((fixture) =>
		[false, true].map((reader) => ({ ...fixture, reader })),
	),
)("selects literal $mime lines (reader=$reader)", async (fixture) => {
	const extract = vi.spyOn(extraction, "extractDocument");
	const lines = { start: 2, end: fixture.end };
	const report = await navigate(
		response(fixture.source, {
			headers: { "content-type": [`${fixture.mime}; charset=utf-8`] },
		}),
		lines,
		fixture.reader,
	);
	expect(report).toMatchObject({
		profile: fixture.reader ? readerLoader.researchReaderProfile : "native",
		outcome: "extracted-unverified",
		contentSuccess: null,
		classification: { barrier: null, diagnostic: null },
		extraction: {
			partial: true,
			content: fixture.markdown,
			textSelection: {
				method: "text-lines",
				...lines,
				totalLines: fixture.totalLines,
				sourceCodeUnits: fixture.source.length,
				selectedCodeUnits: fixture.selected.length,
			},
		},
	});
	expect(report.failure).toBeUndefined();
	expect(report.bodyCapture).toBeUndefined();
	expect(extract).toHaveBeenCalledOnce();
	expect(extract.mock.calls[0][1]).toMatchObject({
		lines,
		maxBytes: researchRunLimits.extractionBytes,
	});
	expect(extract.mock.calls[0][1]?.root).toBeUndefined();
});

it.each([false, true])(
	"extracts a small section of a large loaded source (reader=%s)",
	async (reader) => {
		const source = `${"x".repeat(300_000)}\nSmall selected section\nOutside suffix`;
		const report = await navigate(
			response(source),
			{ start: 2, end: 2 },
			reader,
		);
		expect(report.primaryResponse?.decodedBytes).toBeGreaterThan(
			researchRunLimits.extractionBytes,
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			extraction: {
				content: "```\nSmall selected section\n```\n",
				textSelection: {
					totalLines: 3,
					sourceCodeUnits: source.length,
					selectedCodeUnits: "Small selected section\n".length,
				},
			},
		});
	},
);

it.each(
	[
		{ name: "wide range", source: "é\n".repeat(90_000), end: 90_000 },
		{ name: "long single line", source: "é".repeat(128_001), end: 1 },
	].flatMap((fixture) =>
		[false, true].map((reader) => ({ ...fixture, reader })),
	),
)("retains output limits for $name (reader=$reader)", async (fixture) => {
	const report = await navigate(
		response(fixture.source),
		{ start: 1, end: fixture.end },
		fixture.reader,
	);
	expect(report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		failure: { category: "resource-limit", stage: "extraction" },
	});
	expect(report.extraction).toBeUndefined();
});

it.each([false, true])(
	"retains the original full response capture (reader=%s)",
	async (reader) => {
		const input = response(
			"Unselected prefix\r\nSelected 😀\r\nUnselected suffix",
		);
		const report = await navigate(input, { start: 2, end: 2 }, reader, true);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.extraction?.content).toBe("```\nSelected 😀\n```\n");
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
		expect(report.bodyCapture).toMatchObject({
			encoding: "base64",
			decodedBytes: input.body.byteLength,
			sha256: createHash("sha256").update(input.body).digest("hex"),
		});
	},
);

it.each(
	["<pre>First\nSecond</pre>", "<main>First\nSecond</main>"].flatMap((source) =>
		[false, true].map((reader) => ({ source, reader })),
	),
)(
	"rejects HTML even when pre-only: $source (reader=$reader)",
	async (fixture) => {
		const report = await navigate(
			response(fixture.source, { headers: { "content-type": ["text/html"] } }),
			{ start: 1, end: 1 },
			fixture.reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "unsupported" },
		});
		expect(report.extraction).toBeUndefined();
	},
);

it.each([false, true])(
	"does not clamp a range past the loaded source (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response("First\nSecond"),
			{ start: 2, end: 3 },
			reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "not-found", stage: "extraction" },
		});
		expect(report.extraction).toBeUndefined();
	},
);

it.each([false, true])(
	"does not bypass the loaded-source limit for a small range (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const source = `Selected\n${"x".repeat(2_000_000)}`;
		const report = await navigate(
			response(source),
			{ start: 1, end: 1 },
			reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "loader" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
	},
);

it.each([false, true])(
	"retains loader failures without attempting extraction (reader=%s)",
	async (reader) => {
		const failure = new AgentBrowserError("unsupported", "LINES_PRIVATE_ERROR");
		const extract = vi.spyOn(extraction, "extractDocument");
		if (reader)
			vi.spyOn(readerLoader, "loadResearchDocument").mockImplementationOnce(
				() => {
					throw failure;
				},
			);
		else
			vi.spyOn(documentLoader, "loadBrowserDocument").mockRejectedValueOnce(
				failure,
			);
		const report = await navigate(
			response("Selected"),
			{ start: 1, end: 1 },
			reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "unsupported", stage: "loader" },
		});
		expect(extract).not.toHaveBeenCalled();
		expect(report.extraction).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain("LINES_PRIVATE_ERROR");
	},
);

it.each([false, true])(
	"classifies an unselected HTML challenge prefix before selection (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			response(
				"<title>Just a moment...</title><aside>Checking your browser</aside>\n<pre>Benign selected text</pre>",
				{ headers: { "content-type": ["text/html"] } },
			),
			{ start: 2, end: 2 },
			reader,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
			failure: { stage: "semantic-barrier" },
		});
		expect(extract).not.toHaveBeenCalled();
		expect(report.extraction).toBeUndefined();
	},
);

it.each(
	[403, 404, 429].flatMap((status) =>
		[false, true].map((reader) => ({ status, reader })),
	),
)(
	"retains HTTP $status without followups (reader=$reader)",
	async ({ status, reader }) => {
		const report = await navigate(
			response("Unavailable\nBenign selected text", { status }),
			{ start: 2, end: 2 },
			reader,
		);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			classification: { barrier: null },
		});
	},
);

it.each([false, true])(
	"retains a mocked transport resource failure without retrying (reader=%s)",
	async (reader) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			new AgentBrowserError("resource-limit", "Synthetic response limit"),
		);
		const report = await researchNavigation(
			url,
			reader,
			undefined,
			undefined,
			false,
			{ start: 1, end: 1 },
		);
		expect(report).toMatchObject({
			outcome: "failure",
			partial: true,
			contentSuccess: false,
			primaryResponse: null,
			selection: { method: "text-lines", start: 1, end: 1 },
			failure: { category: "resource-limit", stage: "network" },
		});
		expect(report.extraction).toBeUndefined();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(report.metrics?.closed).toBe(true);
		expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	},
);

it("preserves the existing five navigation arguments", async () => {
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		response("<main>Selected</main>", {
			headers: { "content-type": ["text/html"] },
		}),
	);
	const controller = new AbortController();
	const report = await researchNavigation(
		url,
		true,
		controller.signal,
		"main",
		true,
	);
	expect(report).toMatchObject({
		outcome: "extracted-unverified",
		partial: true,
		contentSuccess: null,
		selection: { method: "css-selector", matches: 1 },
		extraction: { content: "Selected\n" },
	});
	expect(report.bodyCapture).toBeDefined();
	expect(report.extraction).not.toHaveProperty("textSelection");
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics?.closed).toBe(true);
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
});
