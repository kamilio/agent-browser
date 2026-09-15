import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import { AgentBrowserError } from "./errors.js";
import type { ExtractedNode } from "./extraction.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as readerLoader from "./research-loader.js";
import { BrowserSession } from "./session.js";

const url = "https://prefer-markdown.fixture.invalid/paper";
const otherUrl = "https://prefer-markdown.fixture.invalid/other";
const accept = "text/markdown, text/html;q=0.9";
const html = "<main><h1>Owned article</h1><p>Readable body</p></main>";
const enabled: ResearchExecutionOptions = {
	preferMarkdown: true,
	minRequestIntervalMs: 0,
};

interface NavigationOptions {
	reader?: boolean;
	selector?: string;
	captureBody?: boolean;
	lines?: { start: number; end: number };
	section?: string;
	headings?: boolean;
	find?: string;
	documentProfile?: "long-v1";
	execution?: ResearchExecutionOptions;
}

function response(
	source = html,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	};
}

function markdown(source: string): NetworkResponse {
	return response(source, {
		headers: { "content-type": ["text/markdown; charset=utf-8"] },
	});
}

function navigate(options: NavigationOptions = {}) {
	return researchNavigation(
		url,
		options.reader ?? true,
		undefined,
		options.selector,
		options.captureBody ?? false,
		options.lines,
		options.section,
		options.headings ?? false,
		options.find,
		options.documentProfile,
		options.execution ?? enabled,
	);
}

function headers(request: NetworkRequest) {
	return Object.fromEntries(
		Object.entries(request.headers ?? {}).map(([name, value]) => [
			name.toLowerCase(),
			value,
		]),
	);
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function jsonNodes(report: ResearchNavigationReport) {
	expect(report.extraction?.format).toBe("json");
	if (report.extraction?.format !== "json")
		throw new Error("Expected JSON extraction");
	return flattened(report.extraction.content);
}

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(readerLoader.loadResearchDocument).not.toHaveBeenCalled();
}

function expectSameExtraction(
	report: ResearchNavigationReport,
	baseline: ResearchNavigationReport,
) {
	expect(report.extraction?.document).toEqual(expect.any(String));
	expect(report.extraction?.document).not.toBe(baseline.extraction?.document);
	expect(report.extraction).toEqual({
		...baseline.extraction,
		document: report.navigation?.documentRef,
		scope: report.navigation?.documentRef,
	});
}

function expectRequests(count: number, preference = true) {
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	expect(request).toHaveBeenCalledTimes(count);
	for (const [input] of request.mock.calls) {
		const values = headers(input);
		expect(values["user-agent"]).toBe("AgentBrowser/0.1");
		expect(values).not.toHaveProperty("authorization");
		expect(values).not.toHaveProperty("proxy-authorization");
		expect(values).not.toHaveProperty("cookie");
		if (preference) {
			expect(values.accept).toBe(accept);
			expect(
				Object.keys(input.headers ?? {}).filter(
					(name) => name.toLowerCase() === "accept",
				),
			).toHaveLength(1);
		} else expect(values).not.toHaveProperty("accept");
		expect(input.method ?? "GET").toBe("GET");
		expect(input.body).toBeUndefined();
		expect(input.cookieContext).toEqual({
			credentials: "omit",
			siteUrl: null,
			topLevelNavigation: true,
		});
	}
	for (const transport of request.mock.contexts) {
		expect(transport).toBeInstanceOf(NodeNetworkTransport);
		if (transport instanceof NodeNetworkTransport)
			expect(transport.limits).toEqual(researchRunLimits.network);
	}
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(count);
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected synthetic request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(readerLoader, "loadResearchDocument");
});

afterEach(() => vi.restoreAllMocks());

it("preserves exact parser defaults without negotiation", () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	expect(parseResearchArguments(["--reader", url])).toEqual({
		reader: true,
		urls: [url],
	});
	expectNoSetup();
});

it.each([
	{ args: ["--reader", "--prefer-markdown", url], selection: {} },
	{ args: ["--prefer-markdown", url, "--reader"], selection: {} },
	{
		args: ["--reader", "--prefer-markdown", "--find", "a.*[b]", url],
		selection: { find: "a.*[b]" },
	},
	{
		args: ["--reader", "--prefer-markdown", "--lines", "2:3", url],
		selection: { lines: { start: 2, end: 3 } },
	},
])(
	"parses the opt-in flag and supported selection: $args",
	({ args, selection }) => {
		expect(parseResearchArguments(args)).toEqual({
			reader: true,
			preferMarkdown: true,
			urls: [url],
			...selection,
		});
		expectNoSetup();
	},
);

it.each(
	[
		["--prefer-markdown", url],
		["--reader", "--prefer-markdown"],
		["--reader", "--prefer-markdown", "--prefer-markdown", url],
		["--prefer-markdown", url, "--reader", "--prefer-markdown"],
		["--reader", "--prefer-markdown=true", url],
		["--reader", "--prefer-markdown=false", url],
		["--reader", "--prefer-markdown", "false", url],
		["--reader", "--prefer-markdown", "true", url],
		...[["--selector", "main"], ["--section", "h1"], ["--headings"]].flatMap(
			(conflict) => [
				["--reader", "--prefer-markdown", ...conflict, url],
				["--reader", ...conflict, url, "--prefer-markdown"],
			],
		),
		[
			"--reader",
			"--capture-body",
			"--headings",
			"--document-profile",
			"long-v1",
			"--prefer-markdown",
			url,
		],
	].map((args) => ({ args })),
)("rejects invalid, duplicate or conflicting flags: $args", ({ args }) => {
	expect(() => parseResearchArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expectNoSetup();
});

it.each([null, "true", "false", 0, 1, [], {}])(
	"rejects non-boolean API preference %j before setup",
	async (preferMarkdown) => {
		await expect(
			navigate({
				execution: { preferMarkdown } as unknown as ResearchExecutionOptions,
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
		expectNoSetup();
	},
);

it.each<NavigationOptions>([
	{ reader: false },
	{ selector: "main" },
	{ section: "h1" },
	{ headings: true },
	{ documentProfile: "long-v1", headings: true, captureBody: true },
])("rejects incompatible API options before setup: %j", async (options) => {
	await expect(navigate(options)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expectNoSetup();
});

it.each([false, true])(
	"keeps false and undefined equivalent to omitted preference (reader=%s)",
	async (reader) => {
		const request = vi.mocked(NodeNetworkTransport.prototype.request);
		request.mockImplementation(async () => response());
		const baseline = await navigate({ reader, execution: {} });
		for (const preferMarkdown of [false, undefined]) {
			const report = await navigate({ reader, execution: { preferMarkdown } });
			expect(report).not.toHaveProperty("representationPreference");
			expectSameExtraction(report, baseline);
			expect(report.reader).toEqual(baseline.reader);
			expect(report.classification).toEqual(baseline.classification);
			expect(report.outcome).toBe(baseline.outcome);
		}
		expect(baseline).not.toHaveProperty("representationPreference");
		for (const [input] of request.mock.calls)
			expect(headers(input)).toEqual(headers(request.mock.calls[0][0]));
		expectRequests(3, false);
	},
);

it("adds only Accept while preserving identity, loader bounds and HTML extraction", async () => {
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	request.mockImplementation(async () => response());
	const baseline = await navigate({ execution: {} });
	const report = await navigate();
	expect(headers(request.mock.calls[1][0])).toEqual({
		...headers(request.mock.calls[0][0]),
		accept,
	});
	expect(report).toMatchObject({
		representationPreference: "markdown",
		outcome: "extracted-unverified",
		contentSuccess: null,
		partial: true,
		primaryResponse: {
			headers: { "content-type": ["text/html; charset=utf-8"] },
		},
		metrics: { closed: true },
	});
	expectSameExtraction(report, baseline);
	expect(report.reader).toEqual(baseline.reader);
	expect(report.extraction?.content).toContain("Readable body");
	const calls = vi.mocked(readerLoader.loadResearchDocument).mock.calls;
	expect(calls).toHaveLength(2);
	expect(calls[1][1].limits).toEqual(calls[0][1].limits);
	expect(calls[1][1].limits).toMatchObject({
		maxNodes: 50_000,
		maxDepth: 128,
		maxTextCodeUnits: 2_000_000,
	});
	expect(request).toHaveBeenCalledTimes(2);
});

it("loads negotiated Markdown literally with inert markup and unchanged capture bytes", async () => {
	const source = [
		"# Literal heading &amp; 😀",
		"[link](https://prefer-markdown.fixture.invalid/no-follow)",
		'<script src="/never.js">throw new Error("NEVER_EXECUTE")</script>',
		'<link rel="stylesheet" href="/never.css"><img src="/never.png">',
		'<form action="/never-submit"><button onclick="fetch(\'/never\')">Send</button></form>',
		"| raw | table |",
	].join("\n");
	const input = markdown(source);
	const original = input.body.slice();
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await navigate({
		captureBody: true,
		execution: { ...enabled, format: "json" },
	});
	expect(report).toMatchObject({
		representationPreference: "markdown",
		outcome: "extracted-unverified",
		contentSuccess: null,
		reader: {
			scripting: false,
			styling: false,
			sourceCodeUnits: source.length,
		},
		primaryResponse: {
			decodedBytes: original.byteLength,
			bodySha256: createHash("sha256").update(original).digest("hex"),
			hashScope: "transport-decoded-body-before-loader",
		},
	});
	const nodes = jsonNodes(report);
	expect(
		nodes
			.filter((node) => node.type === "text")
			.map((node) => node.text)
			.join(""),
	).toBe(source);
	expect(nodes.filter((node) => node.type === "pre")).toHaveLength(1);
	for (const node of nodes)
		expect(["container", "pre", "text"]).toContain(node.type);
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(original);
	expect(input.body).toEqual(original);
	expectRequests(1);
});

it("finds literal Markdown source without interpreting patterns or following links", async () => {
	const source = "# 😀a.*[b]\r\n\r\n[a.*[b]](/never)\n";
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		markdown(source),
	);
	const report = await navigate({ find: "a.*[b]" });
	expect(report).toMatchObject({
		representationPreference: "markdown",
		outcome: "extracted-unverified",
		selection: { method: "text-line-discovery" },
		textLines: {
			entries: [
				{ line: 1, column: 5 },
				{ line: 3, column: 2 },
			],
			totalLines: 4,
			sourceCodeUnits: source.length,
		},
	});
	expect(report).not.toHaveProperty("extraction");
	expectRequests(1);
});

it("selects Markdown source lines without parsing embedded HTML", async () => {
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		markdown("Outside prefix\r\n# Literal &amp;\r\n<b>raw</b>\rOutside suffix"),
	);
	const report = await navigate({
		lines: { start: 2, end: 3 },
		execution: { ...enabled, format: "json" },
	});
	expect(report).toMatchObject({
		representationPreference: "markdown",
		outcome: "extracted-unverified",
		selection: { method: "text-lines", start: 2, end: 3 },
	});
	expect(
		jsonNodes(report)
			.filter((node) => node.type === "text")
			.map((node) => node.text)
			.join(""),
	).toBe("# Literal &amp;\n<b>raw</b>\n");
	expectRequests(1);
});

it.each([false, true])(
	"preserves the decoded source ceiling (enabled=%s)",
	async (preferMarkdown) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			markdown(
				"x".repeat(readerLoader.researchReaderLimits.maxTextCodeUnits + 1),
			),
		);
		const report = await navigate({ execution: { preferMarkdown } });
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: {
				category: "resource-limit",
				resourceLimit: {
					kind: "reader.decoded",
					limit: 1_000_000,
					observed: 1_000_001,
				},
			},
		});
		if (preferMarkdown)
			expect(report).toHaveProperty("representationPreference", "markdown");
		else expect(report).not.toHaveProperty("representationPreference");
		expectRequests(1, preferMarkdown);
	},
);

it.each([false, true])(
	"propagates opt-in headers and provenance across a batch (enabled=%s)",
	async (preferMarkdown) => {
		const request = vi.mocked(NodeNetworkTransport.prototype.request);
		request.mockResolvedValueOnce(markdown("# First source"));
		request.mockResolvedValueOnce(response(html, { url: otherUrl }));
		const reports: ResearchNavigationReport[] = [];
		for await (const report of researchBatch([
			"--reader",
			...(preferMarkdown ? ["--prefer-markdown"] : []),
			"--min-request-interval-ms",
			"0",
			url,
			otherUrl,
		]))
			reports.push(report);
		expect(reports).toHaveLength(2);
		for (const report of reports) {
			expect(report).toMatchObject({
				outcome: "extracted-unverified",
				contentSuccess: null,
			});
			if (preferMarkdown)
				expect(report).toHaveProperty("representationPreference", "markdown");
			else expect(report).not.toHaveProperty("representationPreference");
		}
		expect(request.mock.calls.map(([input]) => input.url)).toEqual([
			url,
			otherUrl,
		]);
		expectRequests(2, preferMarkdown);
	},
);

it.each([403, 404, 406, 500])(
	"reports HTTP %s without negotiation retry or fallback",
	async (status) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response(html, { status }),
		);
		const report = await navigate();
		expect(report).toMatchObject({
			representationPreference: "markdown",
			outcome: "http-failure",
			contentSuccess: false,
			primaryResponse: { status },
		});
		expectRequests(1);
	},
);

it("does not retry or fall back after a transport error", async () => {
	vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
		new AgentBrowserError("timeout", "Synthetic request timeout"),
	);
	const report = await navigate();
	expect(report).toMatchObject({
		representationPreference: "markdown",
		outcome: "failure",
		contentSuccess: false,
		failure: { category: "timeout" },
	});
	expectRequests(1);
});

it.each([
	{ name: "header challenge", status: 200, challenge: true, source: html },
	{ name: "challenge on 429", status: 429, challenge: true, source: html },
	{ name: "rate limit", status: 429, challenge: false, source: html },
	{
		name: "body challenge",
		status: 200,
		challenge: false,
		source: "<title>Just a moment...</title><main>Checking your browser</main>",
	},
])(
	"stops a batch after $name without retry or later URLs",
	async ({ status, challenge, source }) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response(source, {
				status,
				headers: {
					"content-type": ["text/html; charset=utf-8"],
					...(challenge ? { "cf-mitigated": ["challenge"] } : {}),
					...(status === 429 ? { "retry-after": ["120"] } : {}),
				},
			}),
		);
		const reports: ResearchNavigationReport[] = [];
		for await (const report of researchBatch([
			"--reader",
			"--prefer-markdown",
			"--min-request-interval-ms",
			"0",
			url,
			otherUrl,
		]))
			reports.push(report);
		expect(reports).toHaveLength(1);
		expect(reports[0]).toMatchObject({
			representationPreference: "markdown",
			outcome:
				status === 429 && !challenge ? "http-failure" : "semantic-barrier",
			contentSuccess: false,
			primaryResponse: { status },
		});
		if (status === 429)
			expect(reports[0].rateLimit).toMatchObject({
				status: 429,
				action: "stop-without-retry",
			});
		else expect(reports[0]).not.toHaveProperty("rateLimit");
		if (challenge || status !== 429)
			expect(reports[0].classification.barrier).toBe("challenge");
		expectRequests(1);
	},
);
