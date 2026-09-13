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
const privateSelector = '[data-private="SECTION_PRIVATE_SENTINEL"]';

function response(
	source: string,
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
	section: string,
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
		undefined,
		section,
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
	expect(report.selection?.method).toBe("heading-section");
	if (report.selection?.method !== "heading-section")
		throw new Error("Expected heading-section selection");
	expect(report.selection).toEqual({
		method: "heading-section",
		matches: report.selection.matches,
	});
	expect(input.body).toEqual(originalBody);
	expect(report.primaryResponse).toMatchObject({
		status: input.status,
		decodedBytes: originalBody.byteLength,
		bodySha256: createHash("sha256").update(originalBody).digest("hex"),
		hashScope: "transport-decoded-body-before-loader",
	});
	expect(JSON.stringify(report)).not.toContain("SECTION_PRIVATE_SENTINEL");
	return report;
}

it.each(
	[
		["--section", "h2", url],
		[url, "--section", "h2"],
		["--reader", "--section", "h2", url, otherUrl],
		[url, "--section", "h2", "--reader", otherUrl],
		[url, otherUrl, "--reader", "--section", "h2"],
		["--capture-body", "--section", "h2", url],
		[url, "--section", "h2", "--capture-body", "--reader", otherUrl],
	].map((args) => ({ args })),
)("accepts section flag/URL placement $args without setup", ({ args }) => {
	expect(parseResearchArguments(args)).toEqual({
		reader: args.includes("--reader"),
		urls: args.filter((argument) => argument.startsWith("https:")),
		section: "h2",
		...(args.includes("--capture-body") ? { captureBody: true } : {}),
	});
	expectNoSetup();
});

it("omits the section property from existing parser forms", () => {
	for (const args of [
		[url],
		[url, "--selector", "main"],
		[url, "--lines", "1:2"],
	]) {
		expect(parseResearchArguments(args)).not.toHaveProperty("section");
	}
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	expectNoSetup();
});

it.each([
	"h1, h2",
	"h2:is(h1, h2):not(.excluded)",
	"h2:has(> span)",
	"main > h2:nth-child(2)",
	'h2[title^="Paper"]',
])("preflights supported section selector syntax %s", (section) => {
	expect(parseResearchArguments([url, "--section", section]).section).toBe(
		section,
	);
	expectNoSetup();
});

const malformedSections = [
	"",
	" \t\n",
	"h2[",
	"h2,",
	"h2::before",
	"h2:unsupported-private-pseudo",
	":is(h2, :unsupported-private-pseudo)",
	`${privateSelector}[`,
	"x".repeat(4097),
	null,
	42,
	false,
	{},
	["h2"],
].map((section) => ({ section }));

it.each(malformedSections)(
	"rejects malformed section argument $section before setup",
	({ section }) => {
		expect(() =>
			parseResearchArguments([
				url,
				"--section",
				section,
			] as unknown as string[]),
		).toThrowError(
			expect.objectContaining({
				code: "invalid-input",
				message: "Invalid research selector",
			}),
		);
		expectNoSetup();
	},
);

it.each(
	[
		[url, "--section"],
		[url, "--section", "--reader"],
		[url, "--section", "--capture-body"],
		[url, "--section", "--section", "h2"],
		[url, "--section", "h2", "--section", "h2"],
		[url, "--section", "h2", "--section", "h3"],
		[url, "--section", "h2", "--selector", "main"],
		[url, "--selector", "main", "--section", "h2"],
		[url, "--section", "h2", "--lines", "1:2"],
		[url, "--lines", "1:2", "--section", "h2"],
		[url, "--section=h2"],
		["--section", "h2"],
	].map((args) => ({ args })),
)("rejects missing, duplicate, or conflicting flags $args", ({ args }) => {
	expect(() => parseResearchArguments(args)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expectNoSetup();
});

it.each(["x", "😀"])(
	"bounds section selectors at 4096 UTF-16 units using %s",
	(character) => {
		const opening = '[title="';
		const ending = '"]';
		const available = 4096 - opening.length - ending.length;
		const section =
			opening +
			character.repeat(Math.floor(available / character.length)) +
			"x".repeat(available % character.length) +
			ending;
		expect(section.length).toBe(4096);
		expect(parseResearchArguments([url, "--section", section]).section).toBe(
			section,
		);
		expect(() =>
			parseResearchArguments([url, "--section", `${section} `]),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expectNoSetup();
	},
);

it.each(malformedSections)(
	"rejects malformed runtime section $section before setup",
	async ({ section }) => {
		await expect(
			researchNavigation(
				url,
				false,
				undefined,
				undefined,
				false,
				undefined,
				section as string,
			),
		).rejects.toMatchObject({
			code: "invalid-input",
			message: "Invalid research selector",
		});
		expectNoSetup();
	},
);

it.each([
	{ selector: "main", lines: undefined },
	{ selector: undefined, lines: { start: 1, end: 2 } },
	{ selector: "main", lines: { start: 1, end: 2 } },
])("rejects runtime section conflicts %j before setup", async (fixture) => {
	await expect(
		researchNavigation(
			url,
			false,
			undefined,
			fixture.selector,
			true,
			fixture.lines,
			"h2",
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expectNoSetup();
});

it.each(
	["h1", "h2"].flatMap((boundary) =>
		[false, true].map((reader) => ({ boundary, reader })),
	),
)(
	"includes lower headings and stops before $boundary (reader=$reader)",
	async ({ boundary, reader }) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			response(
				`<title>Public paper</title><aside>Outside prefix</aside><main><h2><span>Selected section</span></h2><p>Useful body.</p><h3>Lower heading</h3><p>Nested body.</p><h4>Deeper heading</h4><a href="/result">Result</a></main><section><${boundary}>Boundary sentinel</${boundary}><p>Outside suffix</p></section>`,
			),
			"h2:has(> span)",
			reader,
		);
		expect(report).toMatchObject({
			profile: reader ? readerLoader.researchReaderProfile : "native",
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: "heading-section", matches: 1 },
			classification: { barrier: null, diagnostic: null },
			extraction: {
				title: "Public paper",
				partial: true,
				sectionSelection: {
					method: "heading-section",
					heading: expect.any(String),
					level: 2,
					end: expect.any(String),
					scannedNodes: expect.any(Number),
					selectedNodes: expect.any(Number),
					contextNodes: expect.any(Number),
				},
			},
		});
		expect(report.failure).toBeUndefined();
		expect(report.bodyCapture).toBeUndefined();
		for (const text of [
			"## Selected section",
			"Useful body\\.",
			"### Lower heading",
			"Nested body\\.",
			"#### Deeper heading",
			"https://research.example/result",
		]) {
			expect(report.extraction?.content).toContain(text);
		}
		for (const text of [
			"Outside prefix",
			"Boundary sentinel",
			"Outside suffix",
		])
			expect(report.extraction?.content).not.toContain(text);
		const metadata = report.extraction?.sectionSelection;
		expect(metadata?.heading).not.toBe("h2:has(> span)");
		expect(metadata?.end).not.toBe(metadata?.heading);
		expect(metadata?.selectedNodes).toBeGreaterThan(0);
		expect(metadata?.contextNodes).toBeGreaterThan(0);
		expect(metadata?.scannedNodes).toBeGreaterThan(
			metadata?.selectedNodes ?? 0,
		);
		expect(extract).toHaveBeenCalledOnce();
		expect(extract.mock.calls[0][1]).toMatchObject({
			section: metadata?.heading,
			maxBytes: researchRunLimits.extractionBytes,
			maxNodes: 50_000,
			maxDepth: 128,
		});
		expect(extract.mock.calls[0][1]?.root).toBeUndefined();
		expect(extract.mock.calls[0][1]?.lines).toBeUndefined();
	},
);

it.each([false, true])(
	"continues to document end and deduplicates selector lists (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				"<aside>Outside prefix</aside><main><h2>Selected</h2><p>Body</p></main><footer>Final content</footer>",
			),
			"h2, main > h2",
			reader,
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { matches: 1 },
			extraction: { sectionSelection: { level: 2, end: null } },
		});
		expect(report.extraction?.content).toContain("## Selected");
		expect(report.extraction?.content).toContain("Final content");
		expect(report.extraction?.content).not.toContain("Outside prefix");
	},
);

it.each(
	[
		{ section: privateSelector, matches: 0, category: "not-found" },
		{ section: "h2", matches: 2, category: "invalid-input" },
		{ section: "h2, p", matches: 3, category: "invalid-input" },
	].flatMap((fixture) =>
		[false, true].map((reader) => ({ ...fixture, reader })),
	),
)(
	"rejects $matches section matches (reader=$reader, section=$section)",
	async (fixture) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			response("<h2>First</h2><p>Body</p><h2>Second</h2>"),
			fixture.section,
			fixture.reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			selection: { matches: fixture.matches },
			failure: { category: fixture.category, stage: "selection" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
	},
);

it.each([false, true])(
	"defers nonheading rejection to extraction (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			response("<main><p>Not a heading</p></main>"),
			"main",
			reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			selection: { matches: 1 },
			failure: { category: "unsupported", stage: "extraction" },
		});
		expect(extract).toHaveBeenCalledOnce();
		expect(extract.mock.calls[0][1]).toMatchObject({
			section: expect.any(String),
		});
		expect(extract.mock.calls[0][1]?.root).toBeUndefined();
		expect(report.extraction).toBeUndefined();
	},
);

it.each([false, true])(
	"extracts a small section from a large loaded body (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				`<aside>${"x".repeat(300_000)}</aside><h2>Selected</h2><p>Small body</p><h1>Outside suffix</h1>`,
			),
			"h2",
			reader,
		);
		expect(report.primaryResponse?.decodedBytes).toBeGreaterThan(
			researchRunLimits.extractionBytes,
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			extraction: { content: "## Selected\n\nSmall body\n" },
		});
	},
);

it.each(
	[
		{ name: "long paragraph", content: `<p>${"é".repeat(128_001)}</p>` },
		{
			name: "wide section",
			content: `<p>${"é".repeat(80)}</p>`.repeat(2000),
		},
	].flatMap((fixture) =>
		[false, true].map((reader) => ({ ...fixture, reader })),
	),
)("retains UTF-8 output limits for $name (reader=$reader)", async (fixture) => {
	const report = await navigate(
		response(`<h2>Selected</h2>${fixture.content}<h1>Boundary</h1>`),
		"h2",
		fixture.reader,
	);
	expect(report).toMatchObject({
		outcome: "failure",
		contentSuccess: false,
		selection: { matches: 1 },
		failure: { category: "resource-limit", stage: "extraction" },
	});
	expect(report.extraction).toBeUndefined();
});

it.each([false, true])(
	"retains full-document loader limits for a tiny section (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			response(
				`<h2>Selected</h2><p>Small body</p><h1>Boundary</h1><aside>${"x".repeat(2_000_000)}</aside>`,
			),
			"h2",
			reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			selection: { matches: null },
			failure: { category: "resource-limit", stage: "loader" },
		});
		expect(extract).not.toHaveBeenCalled();
		expect(report.extraction).toBeUndefined();
	},
);

it.each([false, true])(
	"retains loader failures without leaking selector or error text (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const failure = new AgentBrowserError("unsupported", privateSelector);
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
			response("<h2>Selected</h2><p>Body</p>"),
			privateSelector,
			reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			selection: { matches: null },
			failure: { category: "unsupported", stage: "loader" },
		});
		expect(extract).not.toHaveBeenCalled();
		expect(report.extraction).toBeUndefined();
	},
);

it.each(
	["h2", "h3", "main", privateSelector].flatMap((section) =>
		[false, true].map((reader) => ({ section, reader })),
	),
)(
	"classifies outside challenges before matching $section (reader=$reader)",
	async ({ section, reader }) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		const report = await navigate(
			response(
				"<title>Just a moment...</title><aside>Checking your browser</aside><main><h2>Selected</h2><p>Benign paper</p><h3>First</h3><h3>Second</h3></main>",
			),
			section,
			reader,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			selection: { matches: null },
			classification: { barrier: "challenge" },
			failure: { stage: "semantic-barrier" },
		});
		expect(extract).not.toHaveBeenCalled();
		expect(report.extraction).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain("Checking your browser");
	},
);

it.each([false, true])(
	"classifies selected text after an inconclusive bounded prefix (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				`<title>Just a moment...</title><aside>${"x".repeat(8192)}</aside><h2>Selected</h2><p>Checking your browser</p>`,
			),
			"h2",
			reader,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			selection: { matches: 1 },
			classification: { barrier: "challenge" },
		});
		expect(report.extraction?.content).toContain("Checking your browser");
	},
);

it.each(
	["hidden", "inert"].flatMap((attribute) =>
		[false, true].map((reader) => ({ attribute, reader })),
	),
)(
	"retains native $attribute semantics and reader limitations (reader=$reader)",
	async ({ attribute, reader }) => {
		const report = await navigate(
			response(`<h2 ${attribute}>Selected</h2><p>Body</p>`),
			"h2",
			reader,
		);
		expect(report.selection).toEqual({ method: "heading-section", matches: 1 });
		if (reader) {
			expect(report.outcome).toBe("extracted-unverified");
			expect(report.contentSuccess).toBeNull();
			expect(report.extraction?.content).toContain("## Selected");
			expect(report.reader).toMatchObject({
				profile: readerLoader.researchReaderProfile,
				partial: true,
				scripting: false,
				styling: false,
				hiddenContentSemantics: false,
			});
			expect(report.extraction?.reader).toEqual(report.reader);
		} else {
			expect(report).toMatchObject({
				outcome: "failure",
				contentSuccess: false,
				failure: { category: "not-actionable", stage: "extraction" },
			});
			expect(report.extraction).toBeUndefined();
		}
	},
);

it.each([false, true])(
	"preserves the full original response capture (reader=%s)",
	async (reader) => {
		const input = response(
			"<aside>Unselected prefix 😀</aside>\r\n<script>omitted()</script><h2>Selected</h2><p>Small body</p><h1>Boundary</h1><footer>Unselected suffix</footer>",
		);
		const report = await navigate(input, "h2", reader, true);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.extraction?.content).toBe("## Selected\n\nSmall body\n");
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
		expect(report.bodyCapture).toMatchObject({
			encoding: "base64",
			decodedBytes: input.body.byteLength,
			sha256: createHash("sha256").update(input.body).digest("hex"),
		});
		if (reader) expect(report.reader?.omittedSubtrees.script).toBe(1);
	},
);

it.each(
	[403, 404, 429, 500].flatMap((status) =>
		[false, true].map((reader) => ({ status, reader })),
	),
)(
	"retains HTTP $status without followups (reader=$reader)",
	async (fixture) => {
		const report = await navigate(
			response("<h2>Unavailable paper</h2><p>No article available.</p>", {
				status: fixture.status,
			}),
			"h2",
			fixture.reader,
		);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			selection: { matches: fixture.status === 429 ? null : 1 },
			classification: { barrier: null, diagnostic: null },
		});
		if (fixture.status === 429) {
			expect(report.extraction).toBeUndefined();
			expect(report.failure).toEqual({
				category: "policy-denied",
				stage: "rate-limit",
			});
			expect(report.rateLimit).toMatchObject({
				status: 429,
				action: "stop-without-retry",
			});
		}
	},
);

it.each(
	[false, true].flatMap((reader) =>
		[false, true].flatMap((captureBody) =>
			[false, true].map((challenge) => ({ reader, captureBody, challenge })),
		),
	),
)(
	"stops rate-limited sections before loading assets or selecting content (reader=$reader, capture=$captureBody, challenge=$challenge)",
	async ({ reader, captureBody, challenge }) => {
		const nativeLoad = vi.spyOn(documentLoader, "loadBrowserDocument");
		const readerLoad = vi.spyOn(readerLoader, "loadResearchDocument");
		const extract = vi.spyOn(extraction, "extractDocument");
		const input = response(
			'<link rel="stylesheet" href="/style.css"><script src="/script.js"></script><h2>Unavailable</h2><p>No article available.</p><img src="/image.png">',
			{
				status: 429,
				headers: {
					"content-type": ["text/html"],
					"retry-after": ["120"],
					...(challenge ? { "cf-mitigated": ["challenge"] } : {}),
				},
			},
		);
		const report = await navigate(input, "h2", reader, captureBody);
		expect(report).toMatchObject({
			outcome: challenge ? "semantic-barrier" : "http-failure",
			contentSuccess: false,
			selection: { method: "heading-section", matches: null },
			classification: { barrier: challenge ? "challenge" : null },
			failure: {
				category: "policy-denied",
				stage: challenge ? "semantic-barrier" : "rate-limit",
			},
			rateLimit: {
				kind: "http-rate-limit",
				status: 429,
				action: "stop-without-retry",
				retryAfter: { kind: "delay-seconds", delaySeconds: 120 },
			},
		});
		expect(report.rateLimit?.retryAfter?.retryAt).toBe(
			new Date(
				Date.parse(report.rateLimit?.receivedAt ?? "") + 120_000,
			).toISOString(),
		);
		expect(report.extraction).toBeUndefined();
		expect(nativeLoad).not.toHaveBeenCalled();
		expect(readerLoad).not.toHaveBeenCalled();
		expect(extract).not.toHaveBeenCalled();
		if (captureBody)
			expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
		else expect(report.bodyCapture).toBeUndefined();
	},
);

it.each([false, true])(
	"retains transport resource failures without retrying or selector echo (reader=%s)",
	async (reader) => {
		const extract = vi.spyOn(extraction, "extractDocument");
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			new AgentBrowserError("resource-limit", privateSelector),
		);
		const report = await researchNavigation(
			url,
			reader,
			undefined,
			undefined,
			false,
			undefined,
			privateSelector,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			partial: true,
			contentSuccess: false,
			primaryResponse: null,
			selection: { method: "heading-section", matches: null },
			failure: { category: "resource-limit", stage: "network" },
		});
		expect(report.extraction).toBeUndefined();
		expect(extract).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(report.metrics?.closed).toBe(true);
		expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
		expect(JSON.stringify(report)).not.toContain("SECTION_PRIVATE_SENTINEL");
	},
);

it("preserves all six existing positional navigation arguments", async () => {
	const input = response("Outside prefix\nSelected line\nOutside suffix", {
		headers: { "content-type": ["text/plain; charset=utf-8"] },
	});
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const controller = new AbortController();
	const report = await researchNavigation(
		url,
		true,
		controller.signal,
		undefined,
		true,
		{ start: 2, end: 2 },
	);
	expect(report).toMatchObject({
		outcome: "extracted-unverified",
		partial: true,
		contentSuccess: null,
		selection: { method: "text-lines", start: 2, end: 2 },
		extraction: { content: "```\nSelected line\n```\n" },
	});
	expect(report.extraction).not.toHaveProperty("sectionSelection");
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(report.metrics?.closed).toBe(true);
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
});
