import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	parseResearchArguments,
	researchExitCode,
	researchNavigation,
	researchRunLimits,
} from "../scripts/research-browser.js";
import * as documentLoader from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as readerLoader from "./research-loader.js";
import { resourceLimitError } from "./resource-limit.js";
import { BrowserSession } from "./session.js";

const url = "https://research.example/paper";
const otherUrl = "https://research.example/other";
const privateSentinel = "HEADINGS_PRIVATE_SENTINEL";
const originalSessionClose = BrowserSession.prototype.close;

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
	vi.spyOn(extraction, "extractDocument");
});

afterEach(() => vi.restoreAllMocks());

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(extraction.extractDocument).not.toHaveBeenCalled();
}

function expectCleanup() {
	expect(BrowserSession.prototype.createTab).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
}

async function navigate(
	input: NetworkResponse,
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
		undefined,
		true,
	);
	expect(request).toHaveBeenCalledOnce();
	expect(request.mock.calls[0][0]).toMatchObject({
		url,
		cookieContext: { credentials: "omit" },
	});
	expect(report.selection).toEqual({ method: "heading-outline" });
	expect(report).not.toHaveProperty("extraction");
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expect(report.partial).toBe(true);
	expect([null, false]).toContain(report.contentSuccess);
	expect(report.metrics?.closed).toBe(true);
	expectCleanup();
	expect(input.body).toEqual(originalBody);
	expect(report.primaryResponse).toMatchObject({
		status: input.status,
		decodedBytes: originalBody.byteLength,
		bodySha256: createHash("sha256").update(originalBody).digest("hex"),
		hashScope: "transport-decoded-body-before-loader",
	});
	if (captureBody)
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(originalBody);
	else expect(report).not.toHaveProperty("bodyCapture");
	return report;
}

function outline(report: Awaited<ReturnType<typeof researchNavigation>>) {
	expect(report.headings).toBeDefined();
	if (!report.headings) throw new Error("Expected completed heading outline");
	expect(report.headings).toMatchObject({
		method: "heading-outline",
		document: expect.any(String),
		revision: expect.any(Number),
		partial: true,
		scannedNodes: expect.any(Number),
		truncated: expect.any(Boolean),
	});
	expect(report.headings.document).toMatch(/^e[1-9][0-9]*$/);
	expect(Number.isSafeInteger(report.headings.revision)).toBe(true);
	expect(report.headings.revision).toBeGreaterThanOrEqual(0);
	expect(Number.isSafeInteger(report.headings.scannedNodes)).toBe(true);
	expect(report.headings.scannedNodes).toBeGreaterThan(0);
	expect(report.headings.scannedNodes).toBeLessThanOrEqual(50_000);
	expect(report.headings.entries.length).toBeLessThanOrEqual(256);
	expect(
		new TextEncoder().encode(JSON.stringify(report.headings)).byteLength,
	).toBeLessThanOrEqual(256_000);
	return report.headings;
}

it.each(
	[
		["--headings", url],
		[url, "--headings"],
		["--headings", url, otherUrl],
		[url, "--headings", otherUrl],
		["--reader", "--headings", url, otherUrl],
		[url, "--headings", "--reader", otherUrl],
		["--capture-body", "--headings", url],
		[url, otherUrl, "--reader", "--capture-body", "--headings"],
	].map((args) => ({ args })),
)(
	"accepts boolean discovery flag placement $args without setup",
	({ args }) => {
		expect(parseResearchArguments(args)).toEqual({
			reader: args.includes("--reader"),
			urls: args.filter((argument) => argument.startsWith("https:")),
			headings: true,
			...(args.includes("--capture-body") ? { captureBody: true } : {}),
		});
		expectNoSetup();
	},
);

it.each([
	{ args: [url], expected: {} },
	{ args: [url, "--capture-body"], expected: { captureBody: true } },
	{ args: [url, "--selector", "main"], expected: { selector: "main" } },
	{ args: [url, "--lines", "1:2"], expected: { lines: { start: 1, end: 2 } } },
	{ args: [url, "--section", "h2"], expected: { section: "h2" } },
])("preserves the absent-flag parser shape for $args", ({ args, expected }) => {
	expect(parseResearchArguments(args)).toEqual({
		reader: false,
		urls: [url],
		...expected,
	});
	expect(parseResearchArguments(args)).not.toHaveProperty("headings");
	expectNoSetup();
});

it.each(
	[
		["--headings"],
		["--reader", "--capture-body", "--headings"],
		[url, "--headings", "--headings"],
		["--headings", url, "--headings", otherUrl],
		[url, "--headings=true"],
		[url, "--headings=false"],
		[url, "--headings", "true"],
		[url, "--headings", "false"],
		...["--selector", "--lines", "--section"].flatMap((flag) => {
			const value = flag === "--lines" ? "1:2" : "h2";
			return [
				[url, "--headings", flag, value],
				[url, flag, value, "--headings"],
			];
		}),
	].map((args) => ({ args })),
)(
	"rejects missing URLs, values, duplicates and conflicts $args",
	({ args }) => {
		expect(() => parseResearchArguments(args)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expectNoSetup();
	},
);

it.each([
	"http://127.0.0.1/paper",
	"http://localhost/paper",
	"http://10.0.0.1/paper",
	"file:///paper",
	"https://user:password@research.example/paper",
	`${url}#${"é".repeat(800)}`,
])("does not widen network admission for %s", async (target) => {
	expect(() => parseResearchArguments(["--headings", target])).toThrow();
	await expect(
		researchNavigation(
			target,
			false,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			true,
		),
	).rejects.toBeInstanceOf(AgentBrowserError);
	expectNoSetup();
});

it("retains the explicit URL count bound", () => {
	expect(() =>
		parseResearchArguments([
			"--headings",
			...Array.from({ length: researchRunLimits.maxUrls + 1 }, () => url),
		]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expectNoSetup();
});

it.each(
	[null, 0, 1, "", "true", "false", {}, []].map((headings) => ({ headings })),
)(
	"rejects nonboolean runtime headings $headings before setup",
	async ({ headings }) => {
		await expect(
			researchNavigation(
				url,
				false,
				undefined,
				undefined,
				false,
				undefined,
				undefined,
				headings as boolean,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expectNoSetup();
	},
);

it.each([
	{ selector: "main", lines: undefined, section: undefined },
	{ selector: undefined, lines: { start: 1, end: 2 }, section: undefined },
	{ selector: undefined, lines: undefined, section: "h2" },
	{ selector: "main", lines: { start: 1, end: 2 }, section: "h2" },
	{
		selector: `[data-private="${privateSentinel}"]`,
		lines: undefined,
		section: undefined,
	},
])("rejects runtime selection conflicts %j before setup", async (fixture) => {
	await expect(
		researchNavigation(
			url,
			false,
			undefined,
			fixture.selector,
			true,
			fixture.lines,
			fixture.section,
			true,
		),
	).rejects.toMatchObject({
		code: "invalid-input",
		message: expect.not.stringContaining(privateSentinel),
	});
	expectNoSetup();
});

it.each([false, true])(
	"reports native heading levels in document order (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				'<!doctype html><html><head><title>Paper</title></head><body><h1>Overview</h1><main><h3>Details <em>and evidence</em></h3><h2>Methods</h2><h4>Fourth</h4><h5>Fifth</h5><h6>Sixth</h6><div role="heading" aria-level="2">Not native</div><h7>Not a heading</h7></main></body></html>',
			),
			reader,
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			profile: reader ? readerLoader.researchReaderProfile : "native",
		});
		expect(report.failure).toBeUndefined();
		const headings = outline(report);
		expect(headings.truncated).toBe(false);
		expect(
			headings.entries.map(({ level, title }) => ({ level, title })),
		).toEqual([
			{ level: 1, title: "Overview" },
			{ level: 3, title: "Details and evidence" },
			{ level: 2, title: "Methods" },
			{ level: 4, title: "Fourth" },
			{ level: 5, title: "Fifth" },
			{ level: 6, title: "Sixth" },
		]);
		expect(new Set(headings.entries.map(({ ref }) => ref)).size).toBe(6);
		for (const entry of headings.entries) {
			expect(entry.ref).toMatch(/^e[1-9][0-9]*$/);
			expect(entry.titleTruncated).toBe(false);
			expect(entry.selector).toMatch(/h[1-6]:nth-child\([1-9][0-9]*\)$/);
			expect(entry).not.toHaveProperty("selectorUnavailable");
		}
		if (reader)
			expect(report.reader).toMatchObject({
				profile: readerLoader.researchReaderProfile,
				partial: true,
				scripting: false,
				styling: false,
				hiddenContentSemantics: false,
			});
	},
);

it("returns full selectors independently queryable before the native session closes", async () => {
	const prefix =
		"html:root:nth-child(1) > body:nth-child(2) > main:nth-child(1)";
	const selectors = [
		`${prefix} > h1:nth-child(2)`,
		`${prefix} > h6:nth-child(4)`,
	];
	let expectedDocument: string | undefined;
	let expectedRevision: number | undefined;
	const expectedRefs: string[] = [];
	vi.mocked(BrowserSession.prototype.close).mockImplementation(function (
		this: BrowserSession,
	) {
		try {
			const tab = vi.mocked(BrowserSession.prototype.createTab).mock.results[0]
				?.value;
			expect(tab).toBeDefined();
			const page = this.page(tab.id);
			expectedDocument = page.document.reference(page.document.root);
			expectedRevision = page.document.revision;
			for (const selector of selectors) {
				const matches = page.queries.querySelectorAll(selector);
				expect(matches).toHaveLength(1);
				expectedRefs.push(page.document.reference(matches[0]));
			}
		} finally {
			originalSessionClose.call(this);
		}
	});
	const report = await navigate(
		response(
			"<!doctype html><html><head><title>Paper</title></head><body><main>Before<!--comment--><aside>Outside</aside><h1>First</h1><div hidden>Skipped sibling</div>Between<h6>Last</h6></main></body></html>",
		),
	);
	expect(expectedRefs).toHaveLength(2);
	expect(outline(report)).toMatchObject({
		document: expectedDocument,
		revision: expectedRevision,
		entries: [
			{ ref: expectedRefs[0], selector: selectors[0], title: "First" },
			{ ref: expectedRefs[1], selector: selectors[1], title: "Last" },
		],
	});
});

it("omits native hidden and inadmissible content without leaking attributes or values", async () => {
	const report = await navigate(
		response(
			`<aside>${privateSentinel}</aside><h1 title="${privateSentinel}" data-private="${privateSentinel}">Visible <span hidden>${privateSentinel}</span><span inert>${privateSentinel}</span><span aria-hidden="true">${privateSentinel}</span><span style="display:none">${privateSentinel}</span><span style="visibility:hidden">${privateSentinel}</span><input value="${privateSentinel}"><textarea>${privateSentinel}</textarea><select><option>${privateSentinel}</option></select><script>${privateSentinel}</script><style>${privateSentinel}</style><template>${privateSentinel}</template><img alt="${privateSentinel}">title</h1><h2 hidden>${privateSentinel}</h2><div inert><h3>${privateSentinel}</h3></div><h4 aria-hidden="true">${privateSentinel}</h4><h5 style="display:none">${privateSentinel}</h5><h6 style="visibility:hidden">${privateSentinel}</h6>`,
		),
	);
	expect(outline(report).entries).toEqual([
		expect.objectContaining({
			level: 1,
			title: "Visible title",
			titleTruncated: false,
		}),
	]);
	expect(JSON.stringify(report)).not.toContain(privateSentinel);
});

it("keeps reader omissions and its declared hidden-content limitation explicit", async () => {
	const report = await navigate(
		response(
			`<h1 title="${privateSentinel}">Visible<input value="${privateSentinel}"><textarea>${privateSentinel}</textarea><script>${privateSentinel}</script><img alt="${privateSentinel}"></h1><h2 hidden>Reader-admitted heading</h2>`,
		),
		true,
	);
	expect(outline(report).entries.map(({ title }) => title)).toEqual([
		"Visible",
		"Reader-admitted heading",
	]);
	expect(report.reader).toMatchObject({
		partial: true,
		hiddenContentSemantics: false,
	});
	expect(JSON.stringify(report)).not.toContain(privateSentinel);
});

it.each(
	[
		{ source: "x".repeat(255), title: "x".repeat(255), truncated: false },
		{ source: "x".repeat(256), title: "x".repeat(256), truncated: false },
		{
			source: `\t${"x".repeat(254)}\tTAIL`,
			title: "x".repeat(254),
			truncated: true,
		},
		{
			source: `${"x".repeat(256)}TAIL`,
			title: "x".repeat(256),
			truncated: true,
		},
		{
			source: `${"😀".repeat(128)}TAIL`,
			title: "😀".repeat(128),
			truncated: true,
		},
		{
			source: `${"\u001b".repeat(256)}TAIL`,
			title: "\\u{1b}".repeat(256),
			truncated: true,
		},
	].flatMap((fixture) =>
		[false, true].map((reader) => ({ ...fixture, reader })),
	),
)(
	"bounds raw title units before escaping and trimming (reader=$reader, truncated=$truncated)",
	async ({ source, title, truncated, reader }) => {
		const report = await navigate(response(`<h2>${source}</h2>`), reader);
		expect(outline(report).entries).toEqual([
			expect.objectContaining({ title, titleTruncated: truncated }),
		]);
		expect(report.outcome).toBe("extracted-unverified");
	},
);

it.each([false, true])(
	"collapses title whitespace and escapes terminal controls (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response("<h2> \tAlpha\n <em>beta</em>\r\n\u001b[31m\u202e End </h2>"),
			reader,
		);
		expect(outline(report).entries[0]).toMatchObject({
			title: "Alpha beta \\u{1b}[31m\\u{202e} End",
			titleTruncated: false,
		});
	},
);

it.each(
	[0, 1, 255, 256, 257].flatMap((count) =>
		[false, true].map((reader) => ({ count, reader })),
	),
)(
	"caps $count heading entries only on another admitted heading (reader=$reader)",
	async ({ count, reader }) => {
		const source = Array.from(
			{ length: count },
			(_, index) => `<h2>Heading ${index}</h2>`,
		).join("");
		const report = await navigate(
			response(`${source}<p>Trailing body text</p>`),
			reader,
		);
		const headings = outline(report);
		expect(headings.entries.map(({ title }) => title)).toEqual(
			Array.from(
				{ length: Math.min(count, 256) },
				(_, index) => `Heading ${index}`,
			),
		);
		expect(headings.truncated).toBe(count > 256);
		expect(report.outcome).toBe(
			count ? "extracted-unverified" : "empty-extraction",
		);
		expect(report.contentSuccess).toBe(count ? null : false);
	},
);

it("does not mark an exact entry cap truncated for only hidden later headings", async () => {
	const source = "<h2>Visible</h2>".repeat(256);
	const report = await navigate(
		response(
			`${source}<h2 hidden>Hidden</h2><div inert><h3>Inert</h3></div><p>Tail</p>`,
		),
	);
	expect(outline(report).entries).toHaveLength(256);
	expect(outline(report).truncated).toBe(false);
});

it.each([false, true])(
	"discovers after a large body prefix without full extraction (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				`<p>${privateSentinel}${"x".repeat(300_000)}</p><h2>Late heading</h2><p>Outside suffix</p>`,
			),
			reader,
		);
		expect(report.outcome).toBe("extracted-unverified");
		expect(outline(report).entries).toEqual([
			expect.objectContaining({ title: "Late heading", titleTruncated: false }),
		]);
		expect(JSON.stringify(report)).not.toContain(privateSentinel);
		expect(JSON.stringify(report)).not.toContain("Outside suffix");
	},
);

it.each([false, true])(
	"does not interpret plaintext as HTML or Markdown headings (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response("# Markdown heading\n<h2>Literal tag</h2>\nBody", {
				headers: { "content-type": ["text/plain; charset=utf-8"] },
			}),
			reader,
		);
		expect(outline(report).entries).toEqual([]);
		expect(outline(report).truncated).toBe(false);
		expect(report).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
		});
	},
);

it.each([false, true])(
	"counts an admitted empty heading as an entry (reader=%s)",
	async (reader) => {
		const report = await navigate(response("<h2> \t\n </h2>"), reader);
		expect(outline(report).entries).toEqual([
			expect.objectContaining({ level: 2, title: "", titleTruncated: false }),
		]);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
		});
	},
);

it.each(["custom:box", "a".repeat(65)])(
	"reports an unavailable selector for unsafe ancestor %s",
	async (tag) => {
		const report = await navigate(
			response(`<${tag}><h2>Discoverable</h2></${tag}>`),
		);
		expect(outline(report).entries).toEqual([
			expect.objectContaining({
				title: "Discoverable",
				selector: null,
				selectorUnavailable: "unsupported-ancestor",
			}),
		]);
		expect(report.outcome).toBe("extracted-unverified");
	},
);

it("keeps the title when a complete selector exceeds 4096 units", async () => {
	const tag = "a".repeat(64);
	const source = `${`<${tag}>`.repeat(60)}<h2>Discoverable</h2>${`</${tag}>`.repeat(60)}`;
	const report = await navigate(response(source));
	expect(outline(report).entries).toEqual([
		expect.objectContaining({
			title: "Discoverable",
			selector: null,
			selectorUnavailable: "selector-limit",
		}),
	]);
	expect(report.outcome).toBe("extracted-unverified");
});

it.each(
	[
		{
			name: "source",
			source: `<h2>Small heading</h2><p>${"x".repeat(2_000_000)}</p>`,
		},
		{
			name: "nodes",
			source: `${"<i></i>".repeat(50_001)}<h2>Late heading</h2>`,
		},
		{
			name: "depth",
			source: `${"<div>".repeat(129)}<h2>Deep heading</h2>${"</div>".repeat(129)}`,
		},
	].flatMap((fixture) =>
		[false, true].map((reader) => ({ ...fixture, reader })),
	),
)(
	"does not bypass the full-source $name limit (reader=$reader)",
	async ({ source, reader }) => {
		const report = await navigate(response(source), reader);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "loader" },
		});
		expect(report.headings).toBeUndefined();
	},
);

it.each([false, true])(
	"fails rather than silently truncating an oversized serialized outline (reader=%s)",
	async (reader) => {
		const source =
			"<div>".repeat(75) +
			"<h2>Bounded title</h2>".repeat(256) +
			"</div>".repeat(75);
		const report = await navigate(response(source), reader);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "resource-limit", stage: "extraction" },
		});
		expect(report.headings).toBeUndefined();
	},
);

it.each([false, true])(
	"stops a header barrier before either loader and preserves capture (reader=%s)",
	async (reader) => {
		const nativeLoad = vi.spyOn(documentLoader, "loadBrowserDocument");
		const readerLoad = vi.spyOn(readerLoader, "loadResearchDocument");
		const report = await navigate(
			response("<h2>Benign title</h2>", {
				status: 403,
				headers: {
					"content-type": ["text/html"],
					"cf-mitigated": ["challenge"],
				},
			}),
			reader,
			true,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(nativeLoad).not.toHaveBeenCalled();
		expect(readerLoad).not.toHaveBeenCalled();
		expect(report.headings).toBeUndefined();
	},
);

it.each([false, true])(
	"classifies the full-document prefix before heading discovery (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				"<title>Just a moment...</title><aside>Checking your browser</aside><h2>Benign title</h2>",
			),
			reader,
			true,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(report.headings).toBeUndefined();
	},
);

it.each([false, true])(
	"classifies joined discovered titles after an inconclusive prefix (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(
				`<title>Just a moment...</title><p>${"x".repeat(8192)}</p><h2>Checking your</h2><h3>browser</h3>`,
			),
			reader,
		);
		expect(outline(report).entries.map(({ title }) => title)).toEqual([
			"Checking your",
			"browser",
		]);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier: "challenge" },
		});
		expect(researchExitCode([report])).toBe(1);
	},
);

it.each(
	[400, 403, 404, 429, 500].flatMap((status) =>
		[false, true].map((reader) => ({ status, reader })),
	),
)(
	"preserves HTTP $status instead of claiming content success (reader=$reader)",
	async ({ status, reader }) => {
		const report = await navigate(
			response("<h2>Unavailable</h2>", { status }),
			reader,
		);
		if (status === 429) {
			expect(report.headings).toBeUndefined();
			expect(report.failure).toEqual({
				category: "policy-denied",
				stage: "rate-limit",
			});
			expect(report.rateLimit).toMatchObject({
				status: 429,
				action: "stop-without-retry",
			});
		} else expect(outline(report).entries).toHaveLength(1);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			classification: { barrier: null },
		});
		expect(researchExitCode([report])).toBe(1);
	},
);

it.each(
	[false, true].flatMap((reader) =>
		[false, true].flatMap((captureBody) =>
			[false, true].map((challenge) => ({ reader, captureBody, challenge })),
		),
	),
)(
	"stops rate-limited outlines before loading assets or discovery (reader=$reader, capture=$captureBody, challenge=$challenge)",
	async ({ reader, captureBody, challenge }) => {
		const nativeLoad = vi.spyOn(documentLoader, "loadBrowserDocument");
		const readerLoad = vi.spyOn(readerLoader, "loadResearchDocument");
		const discover = vi.spyOn(extraction, "discoverDocumentHeadings");
		const input = response(
			'<link rel="stylesheet" href="/style.css"><script src="/script.js"></script><h2>Unavailable</h2><img src="/image.png">',
			{
				status: 429,
				headers: {
					"content-type": ["text/html"],
					"retry-after": ["120"],
					...(challenge ? { "cf-mitigated": ["challenge"] } : {}),
				},
			},
		);
		const report = await navigate(input, reader, captureBody);
		expect(report).toMatchObject({
			outcome: challenge ? "semantic-barrier" : "http-failure",
			contentSuccess: false,
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
		expect(report.headings).toBeUndefined();
		expect(nativeLoad).not.toHaveBeenCalled();
		expect(readerLoad).not.toHaveBeenCalled();
		expect(discover).not.toHaveBeenCalled();
		expect(researchExitCode([report])).toBe(1);
	},
);

it.each(
	[300, 301, 302, 303, 307, 308, 399].flatMap((status) =>
		[false, true].flatMap((reader) =>
			[false, true].map((hasHeading) => ({ status, reader, hasHeading })),
		),
	),
)(
	"rejects final HTTP $status without a redirect location (reader=$reader, heading=$hasHeading)",
	async ({ status, reader, hasHeading }) => {
		const report = await navigate(
			response(hasHeading ? "<h2>Choices</h2>" : "<p>Choices</p>", {
				status,
			}),
			reader,
		);
		expect(outline(report).entries).toHaveLength(hasHeading ? 1 : 0);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			classification: { barrier: null },
		});
		expect(researchExitCode([report])).toBe(1);
	},
);

it.each([false, true])(
	"prioritizes HTTP failure over an empty outline (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response("<p>Unavailable</p>", { status: 404 }),
			reader,
		);
		expect(outline(report).entries).toEqual([]);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
		});
	},
);

it.each(
	["unsupported", "aborted", "resource-limit"].flatMap((category) =>
		[false, true].map((reader) => ({ category, reader })),
	),
)(
	"retains safe $category loader failures and opt-in capture (reader=$reader)",
	async ({ category, reader }) => {
		const failure =
			category === "resource-limit"
				? resourceLimitError(
						"html.tokens",
						8,
						9,
						`[data-private="${privateSentinel}"]`,
					)
				: new AgentBrowserError(
						category as "unsupported" | "aborted",
						`[data-private="${privateSentinel}"]`,
					);
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
			response("<h2>Public title</h2>"),
			reader,
			true,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category, stage: "loader" },
		});
		if (category === "resource-limit")
			expect(report.failure?.resourceLimit).toEqual({
				kind: "html.tokens",
				unit: "tokens",
				limit: 8,
				observed: 9,
			});
		expect(report.headings).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain(privateSentinel);
		expect(JSON.stringify(report)).not.toContain("data-private");
	},
);

it.each([false, true])(
	"does not expose an unexpected loader exception (reader=%s)",
	async (reader) => {
		const failure = new Error(privateSentinel);
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
		const report = await navigate(response("<h2>Public title</h2>"), reader);
		expect(report.failure).toEqual({
			category: "unsupported",
			stage: "loader",
		});
		expect(report.outcome).toBe("failure");
		expect(report.contentSuccess).toBe(false);
		expect(report.headings).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain(privateSentinel);
	},
);

it.each(
	(["policy-denied", "resource-limit", "aborted"] as const).flatMap(
		(category) => [false, true].map((reader) => ({ category, reader })),
	),
)(
	"retains $category transport failures without retries or fake captures (reader=$reader)",
	async ({ category, reader }) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			new AgentBrowserError(category, privateSentinel),
		);
		const report = await researchNavigation(
			url,
			reader,
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			true,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			partial: true,
			contentSuccess: false,
			primaryResponse: null,
			selection: { method: "heading-outline" },
			failure: { category, stage: "network" },
		});
		expect(report.headings).toBeUndefined();
		expect(report.extraction).toBeUndefined();
		expect(report.bodyCapture).toBeUndefined();
		expect(extraction.extractDocument).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(report.metrics?.closed).toBe(true);
		expectCleanup();
		expect(JSON.stringify(report)).not.toContain(privateSentinel);
	},
);

it.each([false, true])(
	"captures unchanged bytes without following links or discovered selectors (reader=%s)",
	async (reader) => {
		const input = response(
			`<aside>Outside prefix 😀</aside>\r\n<h2 id="private-id" data-private="${privateSentinel}"><a href="https://research.example/follow?private=value">Public title</a></h2><p>Outside suffix</p>`,
		);
		const report = await navigate(input, reader, true);
		expect(outline(report).entries).toEqual([
			expect.objectContaining({
				title: "Public title",
				selector: expect.stringContaining("h2:nth-child("),
			}),
		]);
		expect(report.bodyCapture).toMatchObject({
			encoding: "base64",
			decodedBytes: input.body.byteLength,
			sha256: createHash("sha256").update(input.body).digest("hex"),
		});
		expect(JSON.stringify(report.headings)).not.toContain("private-id");
		expect(JSON.stringify(report.headings)).not.toContain(privateSentinel);
		expect(JSON.stringify(report.headings)).not.toContain("https://");
		expect(report.outcome).toBe("extracted-unverified");
	},
);

it("reuses researchExitCode for successful, empty and mixed discovery reports", async () => {
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	request.mockResolvedValueOnce(response("<h2>Public heading</h2>"));
	request.mockResolvedValueOnce(response("<p>No headings</p>"));
	const success = await researchNavigation(
		url,
		false,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		true,
	);
	const empty = await researchNavigation(
		url,
		false,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		true,
	);
	expect(success.outcome).toBe("extracted-unverified");
	expect(empty.outcome).toBe("empty-extraction");
	expect(researchExitCode([success])).toBe(0);
	expect(researchExitCode([empty])).toBe(1);
	expect(researchExitCode([success, empty])).toBe(2);
	expect(researchExitCode([])).toBe(1);
	expect(request).toHaveBeenCalledTimes(2);
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(2);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(2);
	expect(success.metrics?.closed).toBe(true);
	expect(empty.metrics?.closed).toBe(true);
});

it.each([undefined, false])(
	"preserves seven positional arguments with headings=%s",
	async (headings) => {
		const input = response("<h2>Selected</h2><p>Body</p><h1>Boundary</h1>");
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			input,
		);
		const controller = new AbortController();
		const report =
			headings === undefined
				? await researchNavigation(
						url,
						true,
						controller.signal,
						undefined,
						true,
						undefined,
						"h2",
					)
				: await researchNavigation(
						url,
						true,
						controller.signal,
						undefined,
						true,
						undefined,
						"h2",
						headings,
					);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			partial: true,
			contentSuccess: null,
			selection: { method: "heading-section", matches: 1 },
			extraction: { content: "## Selected\n\nBody\n" },
		});
		expect(report).not.toHaveProperty("headings");
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
		expect(extraction.extractDocument).toHaveBeenCalledOnce();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(report.metrics?.closed).toBe(true);
		expectCleanup();
	},
);
