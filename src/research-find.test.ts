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
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import * as extraction from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as readerLoader from "./research-loader.js";
import { resourceLimitError } from "./resource-limit.js";
import { BrowserSession } from "./session.js";

const url = "https://research.example/paper";
const otherUrl = "https://research.example/other";
const privateQuery = "FIND_PRIVATE_QUERY";
const privateSource = "FIND_PRIVATE_SOURCE";
const privateException = "FIND_PRIVATE_EXCEPTION";
type Report = Awaited<ReturnType<typeof researchNavigation>>;

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
	vi.spyOn(extraction, "extractDocument");
	vi.spyOn(extraction, "discoverDocumentHeadings");
	vi.spyOn(extraction, "discoverDocumentTextLines");
});

afterEach(() => vi.restoreAllMocks());

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
	expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
}

function expectCleanup(report: Report, count = 1) {
	expect(BrowserSession.prototype.createTab).toHaveBeenCalledTimes(count);
	expect(BrowserSession.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(count);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(count);
	expect(report.metrics?.closed).toBe(true);
	expect(report.partial).toBe(true);
}

function expectRedacted(report: Report) {
	const fields = JSON.stringify({
		selection: report.selection,
		textLines: report.textLines,
		failure: report.failure,
	});
	for (const secret of [privateQuery, privateSource, privateException])
		expect(fields).not.toContain(secret);
}

async function navigate(
	input: NetworkResponse,
	reader = false,
	captureBody = false,
	query = privateQuery,
) {
	const originalBody = input.body.slice();
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await researchNavigation(
		url,
		reader,
		undefined,
		undefined,
		captureBody,
		undefined,
		undefined,
		false,
		query,
	);
	expectCleanup(report);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
		expect.objectContaining({
			url,
			cookieContext: {
				credentials: "omit",
				siteUrl: null,
				topLevelNavigation: true,
			},
		}),
	);
	expect(report.selection).toEqual({ method: "text-line-discovery" });
	expect(report).not.toHaveProperty("extraction");
	expect(report).not.toHaveProperty("headings");
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
	expect([null, false]).toContain(report.contentSuccess);
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
	expectRedacted(report);
	return report;
}

function discovery(report: Report) {
	expect(report.textLines).toBeDefined();
	if (!report.textLines) throw new Error("Expected text-line discovery");
	expect(report.textLines).toMatchObject({
		method: "text-line-discovery",
		document: expect.stringMatching(/^e[1-9][0-9]*$/),
		revision: expect.any(Number),
		partial: true,
	});
	expect(Number.isSafeInteger(report.textLines.revision)).toBe(true);
	expect(report.textLines.revision).toBeGreaterThanOrEqual(0);
	expect(Object.keys(report.textLines).sort()).toEqual([
		"document",
		"entries",
		"matchedLines",
		"method",
		"partial",
		"revision",
		"sourceCodeUnits",
		"totalLines",
		"truncated",
	]);
	expect(extraction.discoverDocumentTextLines).toHaveBeenCalledOnce();
	expect(
		new TextEncoder().encode(JSON.stringify(report.textLines)).byteLength,
	).toBeLessThanOrEqual(researchRunLimits.extractionBytes);
	return report.textLines;
}

it.each([
	{ args: ["--find", privateQuery, url], reader: false, captureBody: false },
	{ args: [url, "--find", privateQuery], reader: false, captureBody: false },
	{
		args: [url, "--find", privateQuery, otherUrl],
		reader: false,
		captureBody: false,
	},
	{
		args: ["--reader", "--find", privateQuery, url, otherUrl],
		reader: true,
		captureBody: false,
	},
	{
		args: [url, "--capture-body", "--find", privateQuery, "--reader"],
		reader: true,
		captureBody: true,
	},
	{
		args: ["--find", privateQuery, url, "--capture-body"],
		reader: false,
		captureBody: true,
	},
])(
	"parses find placement and compatible flags: $args",
	({ args, reader, captureBody }) => {
		expect(parseResearchArguments(args)).toEqual({
			reader,
			urls: args.filter((argument) => argument.startsWith("https:")),
			find: privateQuery,
			...(captureBody ? { captureBody: true } : {}),
		});
		expectNoSetup();
	},
);

it.each([
	"x",
	"x".repeat(256),
	"😀".repeat(128),
	" ",
	"a.*[b]",
	"--parallel",
	"--reader",
	"--capture-body",
	"--headings",
	"--selector",
	"--lines",
	"--section",
	"--find",
])(
	"consumes the literal query value without treating it as an option: %s",
	(query) => {
		expect(parseResearchArguments(["--find", query, url])).toEqual({
			reader: false,
			urls: [url],
			find: query,
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
	{ args: [url, "--headings"], expected: { headings: true } },
])("preserves the parser shape without find: $args", ({ args, expected }) => {
	expect(parseResearchArguments(args)).toEqual({
		reader: false,
		urls: [url],
		...expected,
	});
	expect(parseResearchArguments(args)).not.toHaveProperty("find");
	expectNoSetup();
});

it.each(
	[
		[url, "--find"],
		["--find"],
		["--find", privateQuery],
		[url, "--find", privateQuery, "--find", "other"],
		["--find", privateQuery, url, "--find", privateQuery, otherUrl],
		[url, `--find=${privateQuery}`],
		...[
			"",
			"x".repeat(257),
			"😀".repeat(129),
			`${privateQuery}\n`,
			`${privateQuery}\r`,
		].map((query) => [url, "--find", query]),
	].map((args) => ({ args })),
)(
	"rejects missing, duplicate and invalid queries before setup: $args",
	({ args }) => {
		expect(() => parseResearchArguments(args)).toThrowError(
			expect.objectContaining({
				code: "invalid-input",
				message: expect.not.stringContaining(privateQuery),
			}),
		);
		expectNoSetup();
	},
);

it.each(
	[
		["--selector", "main"],
		["--lines", "1:2"],
		["--section", "h2"],
		["--headings"],
	].flatMap((selection) => [
		{ args: [url, "--find", privateQuery, ...selection] },
		{ args: [url, ...selection, "--find", privateQuery] },
	]),
)(
	"rejects every selection conflict in either argument order: $args",
	({ args }) => {
		expect(() => parseResearchArguments(args)).toThrowError(
			expect.objectContaining({
				code: "invalid-input",
				message: expect.not.stringContaining(privateQuery),
			}),
		);
		expectNoSetup();
	},
);

it.each(
	[
		null,
		false,
		1,
		[],
		{},
		new String(privateQuery),
		"",
		"x".repeat(257),
		`${privateQuery}\r\n`,
		{
			toString: () => {
				throw new Error(privateException);
			},
		},
	].map((query) => ({ query })),
)(
	"rejects invalid runtime find values before I/O: $query",
	async ({ query }) => {
		await expect(
			researchNavigation(
				url,
				false,
				undefined,
				undefined,
				false,
				undefined,
				undefined,
				false,
				query as string,
			),
		).rejects.toMatchObject({
			code: "invalid-input",
			message: expect.not.stringMatching(/FIND_PRIVATE_/),
		});
		expectNoSetup();
	},
);

it.each([
	{ selector: "main", lines: undefined, section: undefined, headings: false },
	{
		selector: undefined,
		lines: { start: 1, end: 2 },
		section: undefined,
		headings: false,
	},
	{ selector: undefined, lines: undefined, section: "h2", headings: false },
	{ selector: undefined, lines: undefined, section: undefined, headings: true },
])(
	"rejects runtime selection conflicts before setup: %j",
	async (selection) => {
		await expect(
			researchNavigation(
				url,
				false,
				undefined,
				selection.selector,
				true,
				selection.lines,
				selection.section,
				selection.headings,
				privateQuery,
			),
		).rejects.toMatchObject({
			code: "invalid-input",
			message: expect.not.stringContaining(privateQuery),
		});
		expectNoSetup();
	},
);

it.each([
	"http://127.0.0.1/paper",
	"http://localhost/paper",
	"http://10.0.0.1/paper",
	"file:///paper",
	"https://user:password@research.example/paper",
	`${url}#line`,
])("does not widen public URL policy for %s", async (target) => {
	expect(() =>
		parseResearchArguments(["--find", privateQuery, target]),
	).toThrow();
	await expect(
		researchNavigation(
			target,
			false,
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			false,
			privateQuery,
		),
	).rejects.toBeInstanceOf(AgentBrowserError);
	expectNoSetup();
});

it("retains the explicit URL count bound", () => {
	expect(() =>
		parseResearchArguments([
			"--find",
			privateQuery,
			...Array.from({ length: researchRunLimits.maxUrls + 1 }, () => url),
		]),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expectNoSetup();
});

it.each(
	["text/plain", "application/json", "application/problem+json"].flatMap(
		(mime) =>
			[200, 201].flatMap((status) =>
				[false, true].map((reader) => ({ mime, status, reader })),
			),
	),
)(
	"returns partial native coordinates for $mime HTTP $status (reader=$reader)",
	async ({ mime, status, reader }) => {
		const source = `[\r\n  "${privateQuery} ${privateQuery}",\r  "😀${privateQuery}",\n  "${privateSource}"\n]\n`;
		const report = await navigate(
			response(source, {
				status,
				headers: { "content-type": [`${mime}; charset=utf-8`] },
			}),
			reader,
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			profile: reader ? readerLoader.researchReaderProfile : "native",
			classification: { barrier: null },
		});
		expect(report.failure).toBeUndefined();
		expect(discovery(report)).toMatchObject({
			entries: [
				{ line: 2, column: 4 },
				{ line: 3, column: 6 },
			],
			totalLines: 6,
			matchedLines: 2,
			sourceCodeUnits: source.length,
			truncated: false,
		});
		expect(extraction.discoverDocumentTextLines).toHaveBeenCalledWith(
			expect.anything(),
			privateQuery,
			{ maxBytes: researchRunLimits.extractionBytes },
		);
		expect(researchExitCode([report])).toBe(0);
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

it.each([false, true])(
	"discovers Markdown source served as text/plain without parsing it (reader=%s)",
	async (reader) => {
		const source = `# ${privateQuery}\r\n\r\n- ${privateSource}\n- See ${privateQuery}\r`;
		const report = await navigate(response(source), reader);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
		});
		expect(discovery(report)).toMatchObject({
			entries: [
				{ line: 1, column: 3 },
				{ line: 4, column: 7 },
			],
			totalLines: 5,
			matchedLines: 2,
			sourceCodeUnits: source.length,
			truncated: false,
		});
	},
);

it.each([false, true])(
	"retains text/markdown refusal before discovery (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(`# ${privateQuery}\n${privateSource}`, {
				headers: { "content-type": ["text/markdown; charset=utf-8"] },
			}),
			reader,
			true,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "unsupported", stage: "loader" },
		});
		expect(report.textLines).toBeUndefined();
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
	},
);

it.each(
	["", "No match\r\n"].flatMap((source) =>
		[false, true].map((reader) => ({ source, reader })),
	),
)(
	"reports empty discovery for $source (reader=$reader)",
	async ({ source, reader }) => {
		const report = await navigate(response(source), reader);
		expect(report).toMatchObject({
			outcome: "empty-extraction",
			contentSuccess: false,
		});
		expect(discovery(report)).toMatchObject({
			entries: [],
			totalLines: source ? 2 : 1,
			matchedLines: 0,
			sourceCodeUnits: source.length,
			truncated: false,
		});
		expect(researchExitCode([report])).toBe(1);
	},
);

it.each([50, 51])(
	"retains bounded totals without auto-selecting at %s matches",
	async (count) => {
		const source = `${`${privateQuery} https://research.example/follow\n`.repeat(count)}${privateSource}\n`;
		const report = await navigate(response(source));
		expect(discovery(report)).toMatchObject({
			entries: Array.from({ length: 50 }, (_, index) => ({
				line: index + 1,
				column: 1,
			})),
			totalLines: count + 2,
			matchedLines: count,
			truncated: count > 50,
		});
		expect(report.contentSuccess).toBeNull();
	},
);

it.each(
	[300, 301, 302, 303, 307, 308, 399, 400, 403, 404, 429, 500, 503].flatMap(
		(status) =>
			[false, true].flatMap((reader) =>
				[false, true].map((matches) => ({ status, reader, matches })),
			),
	),
)(
	"preserves HTTP $status (reader=$reader, matches=$matches)",
	async ({ status, reader, matches }) => {
		const report = await navigate(
			response(matches ? privateQuery : privateSource, { status }),
			reader,
		);
		expect(report).toMatchObject({
			outcome: "http-failure",
			contentSuccess: false,
			classification: { barrier: null },
		});
		expect(discovery(report).entries).toEqual(
			matches ? [{ line: 1, column: 1 }] : [],
		);
		expect(researchExitCode([report])).toBe(1);
	},
);

it.each([false, true])(
	"stops Cloudflare header barriers before loading or searching (reader=%s)",
	async (reader) => {
		const nativeLoad = vi.spyOn(documentLoader, "loadBrowserDocument");
		const readerLoad = vi.spyOn(readerLoader, "loadResearchDocument");
		const report = await navigate(
			response(`${privateSource}\n${privateQuery}`, {
				status: 403,
				headers: {
					"content-type": ["text/plain"],
					"cf-mitigated": ["challenge"],
				},
			}),
			reader,
			true,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: {
				barrier: "challenge",
				diagnostic: { provider: "cloudflare" },
			},
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(report.textLines).toBeUndefined();
		expect(nativeLoad).not.toHaveBeenCalled();
		expect(readerLoad).not.toHaveBeenCalled();
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
	},
);

it.each(
	[
		{
			barrier: "challenge",
			status: 200,
			html: "<title>Just a moment...</title><p>Checking your browser with Cloudflare</p>",
		},
		{
			barrier: "login",
			status: 200,
			html: "<title>Sign in</title><p>Password required; sign in to continue</p>",
		},
		{
			barrier: "access-denied",
			status: 403,
			html: "<p>You've been blocked by network security</p>",
		},
	].flatMap((fixture) =>
		[false, true].map((reader) => ({ ...fixture, reader })),
	),
)(
	"classifies $barrier before HTML admission/search (reader=$reader)",
	async ({ barrier, status, html, reader }) => {
		const report = await navigate(
			response(`${html}<pre>${privateQuery} ${privateSource}</pre>`, {
				status,
				headers: { "content-type": ["text/html; charset=utf-8"] },
			}),
			reader,
			true,
		);
		expect(report).toMatchObject({
			outcome: "semantic-barrier",
			contentSuccess: false,
			classification: { barrier },
			failure: { category: "policy-denied", stage: "semantic-barrier" },
		});
		expect(report.textLines).toBeUndefined();
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
	},
);

it.each([false, true])(
	"refuses HTML pre lookalikes without falling back to extraction (reader=%s)",
	async (reader) => {
		const report = await navigate(
			response(`<pre>${privateQuery} ${privateSource}</pre>`, {
				headers: { "content-type": ["text/html; charset=utf-8"] },
			}),
			reader,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category: "unsupported", stage: "extraction" },
		});
		expect(report.textLines).toBeUndefined();
		expect(extraction.discoverDocumentTextLines).toHaveBeenCalledOnce();
	},
);

it.each([false, true])(
	"rejects changed loader wrappers and closes their trees (reader=%s)",
	async (reader) => {
		let loadedTree: DocumentTree | undefined;
		const mutate = (tree: DocumentTree) => {
			loadedTree = tree;
			tree.setAttribute(
				tree.get(tree.root).children[0],
				"title",
				privateSource,
			);
			return tree;
		};
		if (reader) {
			const original = readerLoader.loadResearchDocument;
			vi.spyOn(readerLoader, "loadResearchDocument").mockImplementationOnce(
				(input, context) => mutate(original(input, context)),
			);
		} else {
			const original = documentLoader.loadBrowserDocument;
			vi.spyOn(documentLoader, "loadBrowserDocument").mockImplementationOnce(
				async (input, context) => mutate(await original(input, context)),
			);
		}
		const report = await navigate(response(privateQuery), reader);
		expect(report.failure).toEqual({
			category: "unsupported",
			stage: "extraction",
		});
		expect(report.textLines).toBeUndefined();
		expect(extraction.discoverDocumentTextLines).toHaveBeenCalledOnce();
		if (!loadedTree) throw new Error("Expected loaded tree");
		const closedTree = loadedTree;
		expect(() => closedTree.get(closedTree.root)).toThrowError(
			expect.objectContaining({ code: "closed" }),
		);
	},
);

it.each([false, true])(
	"keeps real loader source limits before discovery (reader=%s)",
	async (reader) => {
		const report = await navigate(response("x".repeat(2_000_001)), reader);
		expect(report.failure).toMatchObject({
			category: "resource-limit",
			stage: "loader",
		});
		expect(report.textLines).toBeUndefined();
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
	},
);

it.each(
	(
		["unsupported", "aborted", "resource-limit", "internal-error"] as const
	).flatMap((category) =>
		[false, true].map((reader) => ({ category, reader })),
	),
)(
	"redacts injected $category loader failures (reader=$reader)",
	async ({ category, reader }) => {
		const failure =
			category === "internal-error"
				? new Error(`${privateException} ${privateQuery} ${privateSource}`)
				: category === "resource-limit"
					? resourceLimitError("text.decoded", 8, 9, privateException)
					: new AgentBrowserError(category, privateException);
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
			response(`${privateQuery}\n${privateSource}`),
			reader,
			true,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: {
				category: category === "internal-error" ? "unsupported" : category,
				stage: "loader",
			},
		});
		if (category === "resource-limit")
			expect(report.failure?.resourceLimit).toEqual({
				kind: "text.decoded",
				unit: "code-units",
				limit: 8,
				observed: 9,
			});
		expect(report.textLines).toBeUndefined();
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
	},
);

it.each(
	(
		[
			"invalid-input",
			"unsupported",
			"resource-limit",
			"aborted",
			"internal-error",
		] as const
	).flatMap((category) =>
		[false, true].map((reader) => ({ category, reader })),
	),
)(
	"redacts $category discovery failures and preserves cleanup (reader=$reader)",
	async ({ category, reader }) => {
		vi.mocked(extraction.discoverDocumentTextLines).mockImplementationOnce(
			() => {
				const message = `${privateException} ${privateQuery} ${privateSource}`;
				throw category === "internal-error"
					? new Error(message)
					: new AgentBrowserError(category, message);
			},
		);
		const report = await navigate(
			response(`${privateQuery}\n${privateSource}`),
			reader,
			true,
		);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: { category, stage: "extraction" },
		});
		expect(report.textLines).toBeUndefined();
		expect(extraction.discoverDocumentTextLines).toHaveBeenCalledOnce();
	},
);

it.each(
	(
		["policy-denied", "resource-limit", "aborted", "network-error"] as const
	).flatMap((category) =>
		[false, true].map((reader) => ({ category, reader })),
	),
)(
	"retains $category network failure without retry (reader=$reader)",
	async ({ category, reader }) => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
			new AgentBrowserError(
				category,
				`${privateException} ${privateQuery} ${privateSource}`,
			),
		);
		const report = await researchNavigation(
			url,
			reader,
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			false,
			privateQuery,
		);
		expectCleanup(report);
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			primaryResponse: null,
			selection: { method: "text-line-discovery" },
			failure: { category, stage: "network" },
		});
		for (const field of ["textLines", "headings", "extraction", "bodyCapture"])
			expect(report).not.toHaveProperty(field);
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
		expect(extraction.extractDocument).not.toHaveBeenCalled();
		expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
		expectRedacted(report);
	},
);

it.each([false, true])(
	"preserves opt-in captured bytes, including the literal query (reader=%s)",
	async (reader) => {
		const source = `${privateSource} 😀\r\n${privateQuery}\rhttps://research.example/no-follow\n`;
		const input = response(source);
		const report = await navigate(input, reader, true);
		expect(discovery(report).entries).toEqual([{ line: 2, column: 1 }]);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.bodyCapture).toMatchObject({
			encoding: "base64",
			decodedBytes: input.body.byteLength,
			sha256: createHash("sha256").update(input.body).digest("hex"),
		});
		const captured = new TextDecoder().decode(
			decodeResearchBodyCapture(report.bodyCapture),
		);
		expect(captured).toBe(source);
		expect(captured).toContain(privateQuery);
		expect(captured).toContain(privateSource);
	},
);

it.each(["--parallel", "a.*[b]", " "])(
	"navigates using the literal option-like query %s",
	async (query) => {
		const report = await navigate(
			response(`prefix${query}\n${query}`),
			false,
			false,
			query,
		);
		expect(discovery(report).entries).toEqual([
			{ line: 1, column: 7 },
			{ line: 2, column: 1 },
		]);
		expect(report.outcome).toBe("extracted-unverified");
	},
);

it.each([
	{
		selector: "main",
		lines: undefined,
		section: undefined,
		headings: false,
		method: "css-selector",
	},
	{
		selector: undefined,
		lines: { start: 1, end: 1 },
		section: undefined,
		headings: false,
		method: "text-lines",
	},
	{
		selector: undefined,
		lines: undefined,
		section: "h2",
		headings: false,
		method: "heading-section",
	},
	{
		selector: undefined,
		lines: undefined,
		section: undefined,
		headings: true,
		method: "heading-outline",
	},
])(
	"preserves the existing eight positional arguments for $method",
	async (selection) => {
		const input = selection.lines
			? response("Selected\nBody")
			: response("<main><h2>Selected</h2><p>Body</p></main>", {
					headers: { "content-type": ["text/html; charset=utf-8"] },
				});
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			input,
		);
		const controller = new AbortController();
		const report = await researchNavigation(
			url,
			true,
			controller.signal,
			selection.selector,
			true,
			selection.lines,
			selection.section,
			selection.headings,
		);
		expectCleanup(report);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			selection: { method: selection.method },
		});
		expect(report).not.toHaveProperty("textLines");
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(input.body);
		expect(extraction.discoverDocumentTextLines).not.toHaveBeenCalled();
		if (selection.headings) {
			expect(report.headings?.entries).toHaveLength(1);
			expect(extraction.discoverDocumentHeadings).toHaveBeenCalledOnce();
			expect(extraction.extractDocument).not.toHaveBeenCalled();
		} else {
			expect(report.extraction?.content).toContain("Selected");
			expect(extraction.extractDocument).toHaveBeenCalledOnce();
			expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
		}
	},
);

it("retains existing exit codes for successful, empty and mixed discoveries", async () => {
	const request = vi.mocked(NodeNetworkTransport.prototype.request);
	request.mockResolvedValueOnce(response(privateQuery));
	request.mockResolvedValueOnce(response(privateSource));
	const success = await researchNavigation(
		url,
		false,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		false,
		privateQuery,
	);
	const empty = await researchNavigation(
		url,
		false,
		undefined,
		undefined,
		false,
		undefined,
		undefined,
		false,
		privateQuery,
	);
	expectCleanup(success, 2);
	expectCleanup(empty, 2);
	expect(success.outcome).toBe("extracted-unverified");
	expect(success.contentSuccess).toBeNull();
	expect(empty.outcome).toBe("empty-extraction");
	expect(empty.contentSuccess).toBe(false);
	expect(researchExitCode([success])).toBe(0);
	expect(researchExitCode([empty])).toBe(1);
	expect(researchExitCode([success, empty])).toBe(2);
	expect(researchExitCode([])).toBe(1);
	expect(extraction.discoverDocumentTextLines).toHaveBeenCalledTimes(2);
	expect(extraction.extractDocument).not.toHaveBeenCalled();
	expect(extraction.discoverDocumentHeadings).not.toHaveBeenCalled();
	for (const report of [success, empty]) {
		expect(report.selection).toEqual({ method: "text-line-discovery" });
		expect(report.textLines?.partial).toBe(true);
		expect(report).not.toHaveProperty("extraction");
		expect(report).not.toHaveProperty("headings");
		expect(report).not.toHaveProperty("bodyCapture");
		expectRedacted(report);
	}
});
