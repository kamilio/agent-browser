import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchBatch,
	researchNavigation,
} from "../scripts/research-browser.js";
import { classifyBrowserChallenge } from "./browser-challenges.js";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as loader from "./research-loader.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession, type DocumentLoaderContext } from "./session.js";
import { textDocumentInfo } from "./text-document-info.js";

const url = "https://mime-workflow.fixture.invalid/article";
const policy = "markdown-html-document-v1";
const flags = ["--reader-mime-policy", policy];
const encoder = new TextEncoder();
const prefix = "<!doctype html><html><head>";
const source = [
	prefix,
	"<title>Fixture catalogue</title>",
	'<style>STYLE_SENTINEL{display:none}</style><script src="/never.js">SCRIPT_SENTINEL</script>' +
		'</head><body><main id="article"><h1 id="catalogue">Catalogue</h1>' +
		'<p>Visible café evidence.</p><h2 id="listings">Listings</h2>' +
		'<ul><li><a href="/first">First listing</a></li><li>Second listing</li></ul>' +
		'<p hidden>HIDDEN_SENTINEL</p><p aria-hidden="true">ARIA_SENTINEL</p>' +
		'<p style="display:none">INLINE_SENTINEL</p>' +
		'<form action="/never-submit"><input value="FORM_SECRET"><textarea>TEXTAREA_SECRET</textarea></form>' +
		'</main><h2 id="boundary">Boundary</h2><p>Outside selection</p></body></html>',
].join("");
const context: DocumentLoaderContext = {
	tabId: "mime-workflow-fixture",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
const trees: DocumentTree[] = [];
const enabled: ResearchExecutionOptions = {
	readerMimePolicy: policy,
	minRequestIntervalMs: 0,
};

interface NavigationOptions {
	reader?: boolean;
	selector?: string;
	section?: string;
	headings?: boolean;
	lines?: { start: number; end: number };
	find?: string;
	profile?: "default" | "long-v1";
	execution?: ResearchExecutionOptions;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected MIME fixture request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("MIME fixtures must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		try {
			for (const tree of trees.splice(0)) tree.close();
			for (const session of new Set(
				vi.mocked(BrowserSession.prototype.createTab).mock.contexts,
			))
				if (session instanceof BrowserSession) session.close();
			for (const transport of new Set(
				vi.mocked(NodeNetworkTransport.prototype.request).mock.contexts,
			))
				if (transport instanceof NodeNetworkTransport) transport.close();
		} finally {
			vi.restoreAllMocks();
			vi.unstubAllGlobals();
		}
	}
});

function response(
	text = source,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = encoder.encode(text);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/markdown; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	};
}

function load(
	input: NetworkResponse,
	mimePolicy: typeof policy | undefined = policy,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
	loaderContext = context,
) {
	const tree = loader.loadResearchDocument(
		input,
		loaderContext,
		"default",
		undefined,
		visibilityPolicy,
		mimePolicy,
	);
	trees.push(tree);
	return tree;
}

function navigate(options: NavigationOptions = {}) {
	return researchNavigation(
		url,
		options.reader ?? true,
		undefined,
		options.selector,
		true,
		options.lines,
		options.section,
		options.headings ?? false,
		options.find,
		options.profile,
		options.execution ?? enabled,
	);
}

function hash(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function normalizedExtraction(tree: DocumentTree) {
	const { document, scope, ...extraction } = extractDocument(tree);
	expect(document).toBe(tree.reference(tree.root));
	expect(scope).toBe(tree.reference(tree.root));
	return extraction;
}

async function fixture(input = response(), options: NavigationOptions = {}) {
	const originalBody = new Uint8Array(input.body);
	const originalHeaders = structuredClone(input.headers);
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await navigate(options);
	expect(
		NodeNetworkTransport.prototype.request,
	).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({
			url,
			cookieContext: expect.objectContaining({ credentials: "omit" }),
		}),
	);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
		if (!(tree instanceof DocumentTree)) throw new Error("Expected owned tree");
		expect(tree.mutationMetrics().closed).toBe(true);
		expect(loader.researchReaderInfo(tree)).toBeUndefined();
	}
	expect(new Uint8Array(input.body)).toEqual(originalBody);
	expect(input.headers).toEqual(originalHeaders);
	expect(report.primaryResponse).toMatchObject({
		status: input.status,
		headers: originalHeaders,
		decodedBytes: originalBody.byteLength,
		bodySha256: hash(originalBody),
		hashScope: "transport-decoded-body-before-loader",
	});
	expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(originalBody);
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	const restored = JSON.parse(
		new TextDecoder().decode(serialized.jsonl),
	) as ResearchNavigationReport;
	expect(restored.reader).toEqual(report.reader);
	expect(restored.readerMimePolicy).toBe(report.readerMimePolicy);
	expect(restored.bodyCapture).toEqual(report.bodyCapture);
	expect(restored.primaryResponse).toEqual(report.primaryResponse);
	expect(restored.classification).toEqual(report.classification);
	vi.clearAllMocks();
	return report;
}

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(DocumentTree.prototype.close).not.toHaveBeenCalled();
}

function caught(action: () => unknown): AgentBrowserError {
	try {
		action();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		if (error instanceof AgentBrowserError) return error;
	}
	throw new Error("Expected MIME workflow failure");
}

describe("explicit Markdown HTML interpretation", () => {
	it.each(["source-hidden-v1", "source-hidden-inline-v1"] as const)(
		"uses the inert sanitizer with %s without loading resources",
		(visibilityPolicy) => {
			const fetchResource = vi.fn();
			const startScripts = vi.fn();
			const input = response();
			const original = structuredClone(input);
			const tree = load(input, policy, visibilityPolicy, {
				...context,
				fetchStylesheet: fetchResource,
				fetchScript: fetchResource,
				fetchImage: fetchResource,
				scripts: {
					start: startScripts,
				} as unknown as DocumentLoaderContext["scripts"],
			});
			const queries = new DocumentQueries(tree);
			expect(queries.querySelectorAll("h1")).toHaveLength(1);
			expect(queries.querySelectorAll("li")).toHaveLength(2);
			expect(
				queries.querySelectorAll("script, style, form, input, textarea"),
			).toHaveLength(0);
			const extraction = extractDocument(tree);
			expect(extraction.content).toContain("# Catalogue");
			expect(extraction.content).toContain("First listing");
			expect(extraction.content).toContain(
				"https://mime-workflow.fixture.invalid/first",
			);
			for (const omitted of [
				"SCRIPT_SENTINEL",
				"STYLE_SENTINEL",
				"FORM_SECRET",
				"TEXTAREA_SECRET",
				"HIDDEN_SENTINEL",
				"ARIA_SENTINEL",
				"INLINE_SENTINEL",
			])
				expect(extraction.content).not.toContain(omitted);
			if (visibilityPolicy === "source-hidden-inline-v1")
				expect(tree.textContent(tree.root)).not.toContain("INLINE_SENTINEL");
			else expect(tree.textContent(tree.root)).toContain("INLINE_SENTINEL");
			expect(textDocumentInfo(tree)).toBeUndefined();
			const report = loader.researchReaderInfo(tree);
			expect(report).toMatchObject({
				mimePolicy: policy,
				mimeInterpretation: {
					policy,
					declaredMime: "text/markdown",
					effectiveMime: "text/html",
					basis: "html5-doctype-root-prefix",
					prefixCodeUnits: prefix.length,
				},
				visibilityPolicy,
				scripting: false,
				styling: false,
			});
			expect(Object.isFrozen(report)).toBe(true);
			expect(Object.isFrozen(report?.mimeInterpretation)).toBe(true);
			expect(input).toEqual(original);
			expect(fetchResource).not.toHaveBeenCalled();
			expect(startScripts).not.toHaveBeenCalled();
			expectNoSetup();
		},
	);

	it("keeps the ordinary browser and omitted-policy reader literal", async () => {
		const input = response();
		const native = await loadBrowserDocument(input, context);
		trees.push(native);
		const reader = loader.loadResearchDocument(input, context);
		trees.push(reader);
		for (const tree of [native, reader]) {
			expect(textDocumentInfo(tree)?.mime).toBe("text/markdown");
			expect(tree.textContent(tree.root)).toBe(source);
			expect(new DocumentQueries(tree).querySelectorAll("h1")).toHaveLength(0);
		}
		expect(loader.researchReaderInfo(native)).toBeUndefined();
		expect(loader.researchReaderInfo(reader)).not.toHaveProperty("mimePolicy");
		expect(loader.researchReaderInfo(reader)).not.toHaveProperty(
			"mimeInterpretation",
		);
	});

	it.each([
		{ name: "Markdown", text: "# Guide\n\nOrdinary **Markdown**." },
		{ name: "fenced example", text: `\`\`\`html\n${source}\n\`\`\`` },
		{ name: "indented example", text: `    ${source}` },
		{ name: "tab-indented example", text: `\t${source}` },
		{ name: "prose example", text: `Example document:\n${source}` },
		{ name: "frontmatter", text: `---\ntitle: Example\n---\n${source}` },
		{ name: "fragment", text: "<h1>Literal example</h1><p>Text</p>" },
		{
			name: "missing root",
			text: "<!doctype html><head><title>Example</title>",
		},
		{ name: "foreign root", text: "<!doctype html><svg><head></head></svg>" },
		{ name: "truncated prefix", text: "<!doctype html><html><head" },
		{
			name: "out-of-bound prefix",
			text: `<!doctype html>${" ".repeat(4096)}<html><head>`,
		},
	])("does not reinterpret $name", ({ text }) => {
		const input = response(text);
		const original = loader.loadResearchDocument(input, context);
		trees.push(original);
		const optedIn = load(input);
		expect(optedIn.textContent(optedIn.root)).toBe(text);
		expect(normalizedExtraction(optedIn)).toEqual(
			normalizedExtraction(original),
		);
		expect(loader.researchReaderInfo(optedIn)).toEqual(
			loader.researchReaderInfo(original),
		);
		expect(loader.researchReaderInfo(optedIn)).not.toHaveProperty("mimePolicy");
		expect(loader.researchReaderInfo(optedIn)).not.toHaveProperty(
			"mimeInterpretation",
		);
	});

	it.each(["text/plain", "application/json", "application/xml", "text/html"])(
		"does not change %s reports or content",
		(mime) => {
			const input = response(source, { headers: { "content-type": [mime] } });
			const original = loader.loadResearchDocument(input, context);
			trees.push(original);
			const optedIn = load(input);
			expect(normalizedExtraction(optedIn)).toEqual(
				normalizedExtraction(original),
			);
			expect(loader.researchReaderInfo(optedIn)).toEqual(
				loader.researchReaderInfo(original),
			);
			expect(loader.researchReaderInfo(optedIn)).not.toHaveProperty(
				"mimeInterpretation",
			);
		},
	);

	it.each([
		{},
		{ "content-type": [] },
		{ "content-type": ["text/markdown", "text/html"] },
		{ "content-type": ["text/markdown", "text/markdown"] },
		{ "content-type": ["text/markdown, text/html"] },
		{ "content-type": ["application/octet-stream"] },
		{ "content-type": ["application/javascript"] },
		{ "content-type": ["text/markdown; charset=unknown-fixture-encoding"] },
	])("does not repair unsupported headers %j", (headers) => {
		const input = response(source, {
			headers: headers as Readonly<Record<string, readonly string[]>>,
		});
		const original = caught(() => loader.loadResearchDocument(input, context));
		const optedIn = caught(() => load(input));
		expect(optedIn.code).toBe("unsupported");
		expect(optedIn.message).toBe(original.message);
		expectNoSetup();
	});

	it.each([
		{
			name: "declared-text cap",
			text: `${prefix}</head><body><script>${"x".repeat(1_000_000)}</script></body></html>`,
			maxTextCodeUnits: 2_000_000,
		},
		{
			name: "context decoded cap",
			text: source,
			maxTextCodeUnits: source.length - 1,
		},
		{ name: "encoded cap", text: source, maxTextCodeUnits: 8 },
	])(
		"preserves the original $name before sanitization",
		({ text, maxTextCodeUnits }) => {
			const input = response(text);
			const limited = {
				...context,
				limits: { ...context.limits, maxTextCodeUnits },
			};
			const original = caught(() =>
				loader.loadResearchDocument(input, limited),
			);
			const optedIn = caught(() => load(input, policy, undefined, limited));
			expect(optedIn.code).toBe("resource-limit");
			expect(resourceLimitDiagnostic(optedIn)).toEqual(
				resourceLimitDiagnostic(original),
			);
			expectNoSetup();
		},
	);
});

describe("MIME CLI and execution validation", () => {
	it.each(
		[
			[],
			["--document-profile", "default"],
			["--format", "markdown"],
			["--format", "json"],
			["--headings"],
			["--selector", "main"],
			["--section", "#listings"],
			["--prefer-markdown"],
			[
				"--reader-raw-policy",
				"separate-omitted-raw-v1",
				"--reader-visibility-policy",
				"source-hidden-inline-v1",
			],
			["--output-limit-policy", "text-prefix-v1"],
		].map((selection) => ({ selection })),
	)("accepts supported selection $selection", ({ selection }) => {
		expect(
			parseResearchArguments(["--reader", ...flags, ...selection, url]),
		).toMatchObject({
			reader: true,
			readerMimePolicy: policy,
			urls: [url],
		});
		expectNoSetup();
	});

	it.each(
		[
			[...flags, url],
			["--reader", "--reader-mime-policy"],
			["--reader", "--reader-mime-policy", "--headings", url],
			["--reader", "--reader-mime-policy", "unknown", url],
			["--reader", `--reader-mime-policy=${policy}`, url],
			["--reader", ...flags, ...flags, url],
			["--reader", ...flags, "--lines", "1:2", url],
			["--reader", ...flags, "--find", "Catalogue", url],
			[
				"--reader",
				...flags,
				"--document-profile",
				"long-v1",
				"--capture-body",
				"--headings",
				url,
			],
			["--reader", ...flags, "--prefer-markdown", "--selector", "main", url],
			[
				"--reader",
				...flags,
				"--prefer-markdown",
				"--section",
				"#listings",
				url,
			],
			["--reader", ...flags, "--prefer-markdown", "--headings", url],
			[
				"--reader",
				...flags,
				"--output-limit-policy",
				"text-prefix-v1",
				"--format",
				"json",
				url,
			],
		].map((args) => ({ args })),
	)("rejects invalid flags before setup: $args", ({ args }) => {
		expect(() => parseResearchArguments(args)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expectNoSetup();
	});

	it.each([null, false, 1, {}, [], "", "unknown"])(
		"rejects invalid API policy %j before setup",
		async (readerMimePolicy) => {
			await expect(
				navigate({
					execution: {
						readerMimePolicy,
					} as unknown as ResearchExecutionOptions,
				}),
			).rejects.toMatchObject({ code: "invalid-input" });
			expect(() =>
				load(response(), readerMimePolicy as typeof policy),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
			expectNoSetup();
		},
	);

	it.each<NavigationOptions>([
		{ reader: false },
		{ profile: "long-v1", headings: true },
		{ lines: { start: 1, end: 2 } },
		{ find: "Catalogue" },
		{ selector: "main", execution: { ...enabled, preferMarkdown: true } },
	])("rejects API conflicts before setup: %j", async (options) => {
		await expect(navigate(options)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expectNoSetup();
	});

	it("rejects direct long-profile interpretation before creating a tree", () => {
		expect(() =>
			loader.loadResearchDocument(
				response(),
				context,
				"long-v1",
				undefined,
				undefined,
				policy,
			),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expectNoSetup();
	});
});

describe("mocked MIME research workflow", () => {
	it.each(["markdown", "json"] as const)(
		"extracts real %s listings and preserves serialized source provenance",
		async (format) => {
			const report = await fixture(response(), {
				selector: "main",
				execution: {
					...enabled,
					format,
					readerVisibilityPolicy: "source-hidden-inline-v1",
				},
			});
			expect(report).toMatchObject({
				readerMimePolicy: policy,
				outcome: "extracted-unverified",
				contentSuccess: null,
				selection: { method: "css-selector", matches: 1 },
				reader: {
					mimePolicy: policy,
					mimeInterpretation: {
						declaredMime: "text/markdown",
						effectiveMime: "text/html",
					},
				},
				extraction: { format },
			});
			const content = JSON.stringify(report.extraction);
			expect(content).toContain("First listing");
			expect(content).toContain("Visible café evidence");
			for (const omitted of [
				"SCRIPT_SENTINEL",
				"STYLE_SENTINEL",
				"HIDDEN_SENTINEL",
				"INLINE_SENTINEL",
				"FORM_SECRET",
				"Outside selection",
			])
				expect(content).not.toContain(omitted);
		},
	);

	it("discovers real headings rather than literal Markdown lines", async () => {
		const report = await fixture(response(), { headings: true });
		expect(report.selection).toEqual({ method: "heading-outline" });
		expect(report.headings?.entries.map(({ title }) => title)).toEqual([
			"Catalogue",
			"Listings",
			"Boundary",
		]);
		expect(report.reader?.mimePolicy).toBe(policy);
		expect(report.extraction).toBeUndefined();
	});

	it("supports native heading sections after interpretation", async () => {
		const report = await fixture(response(), { section: "#listings" });
		expect(report.selection).toMatchObject({
			method: "heading-section",
			matches: 1,
		});
		expect(report.extraction?.content).toContain("First listing");
		expect(report.extraction?.content).not.toContain("Outside selection");
	});

	it.each([
		{
			name: "UTF-8",
			charset: "utf-8",
			body: encoder.encode(source),
			encoding: "utf-8",
		},
		{
			name: "Windows-1252",
			charset: "windows-1252",
			body: Buffer.from(source, "latin1"),
			encoding: "windows-1252",
		},
		{
			name: "UTF-8 BOM overrides declaration",
			charset: "windows-1252",
			body: encoder.encode(`\uFEFF${source}`),
			encoding: "utf-8",
		},
		{
			name: "UTF-16 BOM overrides declaration",
			charset: "utf-8",
			body: Buffer.from(`\uFEFF${source}`, "utf16le"),
			encoding: "utf-16le",
		},
		{
			name: "declared UTF-16 without BOM",
			charset: "utf-16le",
			body: Buffer.from(source, "utf16le"),
			encoding: "utf-16le",
		},
	])(
		"preserves $name decoding, original headers, bytes and hash",
		async ({ charset, body, encoding }) => {
			const report = await fixture(
				response(source, {
					headers: { "content-type": [`text/markdown; charset=${charset}`] },
					body,
					encodedBytes: body.byteLength,
				}),
			);
			expect(report.extraction?.content).toContain("Visible café evidence");
			expect(report.reader).toMatchObject({ encoding, mimePolicy: policy });
		},
	);

	it("does not use HTML meta charset to override declared Markdown decoding", async () => {
		const text = `${prefix}<meta charset=windows-1252></head><body><p>日本語 café</p></body></html>`;
		const report = await fixture(
			response(text, { headers: { "content-type": ["text/markdown"] } }),
		);
		expect(report.reader?.encoding).toBe("utf-8");
		expect(report.extraction?.content).toContain("日本語 café");
	});

	it.each([
		{ text: "# Literal Markdown\n\nA normal document.", mime: "text/markdown" },
		{ text: source, mime: "text/plain" },
		{ text: source, mime: "text/html" },
	])(
		"records the request without inventing interpretation for $mime",
		async ({ text, mime }) => {
			const report = await fixture(
				response(text, { headers: { "content-type": [mime] } }),
			);
			expect(report.readerMimePolicy).toBe(policy);
			expect(report.reader).not.toHaveProperty("mimePolicy");
			expect(report.reader).not.toHaveProperty("mimeInterpretation");
		},
	);

	it("preserves existing negotiation without adding a retry", async () => {
		const report = await fixture(response(), {
			execution: { ...enabled, preferMarkdown: true },
		});
		expect(report.representationPreference).toBe("markdown");
		expect(report.reader?.mimePolicy).toBe(policy);
	});

	it("threads the CLI policy through batch execution", async () => {
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			response(),
		);
		const reports: ResearchNavigationReport[] = [];
		for await (const report of researchBatch([
			"--reader",
			...flags,
			"--headings",
			"--min-request-interval-ms",
			"0",
			url,
		]))
			reports.push(report);
		expect(reports).toHaveLength(1);
		expect(reports[0].readerMimePolicy).toBe(policy);
		expect(reports[0].reader?.mimePolicy).toBe(policy);
		expect(reports[0].headings?.entries[0].title).toBe("Catalogue");
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
		expect(reports[0].metrics).toMatchObject({ active: 0, closed: true });
	});

	it.each(
		[
			{
				kind: "challenge",
				title: "Security check",
				text: "Verify you are human",
				status: 200,
			},
			{
				kind: "login",
				title: "Sign in",
				text: "Sign in to continue",
				status: 200,
			},
			{
				kind: "access-denied",
				title: "Blocked",
				text: "You've been blocked by network security",
				status: 403,
			},
		].flatMap((barrier) => [
			{
				...barrier,
				visibilityPolicy: "source-hidden-v1" as const,
				attribute: "hidden",
			},
			{
				...barrier,
				visibilityPolicy: "source-hidden-inline-v1" as const,
				attribute: 'style="display:none"',
			},
		]),
	)(
		"retains hidden $kind evidence with $visibilityPolicy in an interpreted unfiltered precheck",
		async ({ kind, title, text, status, visibilityPolicy, attribute }) => {
			const input = response(
				`${prefix}<title hidden>${title}</title></head><body><main><p ${attribute}>${text}</p><p>Visible ordinary answer</p></main></body></html>`,
				{ status },
			);
			const original = loader.loadResearchDocument;
			const calls: Parameters<typeof loader.loadResearchDocument>[] = [];
			vi.spyOn(loader, "loadResearchDocument").mockImplementation((...args) => {
				calls.push(args);
				return original(...args);
			});
			const report = await fixture(input, {
				execution: { ...enabled, readerVisibilityPolicy: visibilityPolicy },
			});
			expect(report.outcome).toBe("semantic-barrier");
			expect(report.classification.barrier).toBe(kind);
			expect(report.classification.diagnostic?.evidence).toContain(
				"reader-mime-interpretation",
			);
			expect(report.primaryResponse?.headers["content-type"]).toEqual([
				"text/markdown; charset=utf-8",
			]);
			expect(report.contentSuccess).toBe(false);
			expect(report.extraction).toBeUndefined();
			expect(report.reader).toBeUndefined();
			expect(
				calls.some((args) => args[4] === undefined && args[5] === policy),
			).toBe(true);
		},
	);

	it.each([
		{
			kind: "challenge",
			title: "Security check",
			text: "Verify you are human",
			status: 200,
		},
		{
			kind: "login",
			title: "Sign in",
			text: "Sign in to continue",
			status: 200,
		},
		{
			kind: "access-denied",
			title: "Blocked",
			text: "You've been blocked by network security",
			status: 403,
		},
	])(
		"preserves visible $kind classification without rewriting Markdown headers",
		async ({ kind, title, text, status }) => {
			const input = response(
				`${prefix}<title>${title}</title></head><body><p>${text}</p></body></html>`,
				{ status },
			);
			expect(classifyBrowserChallenge({ ...input, title, text })).toBeNull();
			const report = await fixture(input);
			expect(report).toMatchObject({
				outcome: "semantic-barrier",
				contentSuccess: false,
				readerMimePolicy: policy,
				classification: { barrier: kind },
			});
			expect(report.classification.diagnostic?.evidence).toContain(
				"reader-mime-interpretation",
			);
			expect(report.primaryResponse?.headers["content-type"]).toEqual([
				"text/markdown; charset=utf-8",
			]);
		},
	);

	it.each(["markdown", "json"] as const)(
		"preserves late challenge evidence in post-extraction %s classification",
		async (format) => {
			const input = response(
				`${prefix}<title>Security check</title></head><body><p>${"Ordinary filler. ".repeat(700)}</p><main id="challenge"><p>Verify you are human</p></main></body></html>`,
			);
			const report = await fixture(input, {
				selector: "#challenge",
				execution: { ...enabled, format },
			});
			expect(report).toMatchObject({
				outcome: "semantic-barrier",
				contentSuccess: false,
				selection: { method: "css-selector", matches: 1 },
				classification: { barrier: "challenge" },
				reader: { mimePolicy: policy },
			});
			expect(report.classification.diagnostic?.evidence).toContain(
				"reader-mime-interpretation",
			);
			expect(report.primaryResponse?.headers["content-type"]).toEqual([
				"text/markdown; charset=utf-8",
			]);
		},
	);

	it("does not add interpretation evidence to ordinary HTML challenge diagnostics", async () => {
		const report = await fixture(
			response(
				`${prefix}<title>Security check</title></head><body><p>Verify you are human</p></body></html>`,
				{ headers: { "content-type": ["text/html; charset=utf-8"] } },
			),
		);
		expect(report.outcome).toBe("semantic-barrier");
		expect(report.classification.barrier).toBe("challenge");
		expect(report.classification.diagnostic?.evidence).toContain(
			"html-challenge-markers",
		);
		expect(report.classification.diagnostic?.evidence).not.toContain(
			"reader-mime-interpretation",
		);
		expect(report.reader).not.toHaveProperty("mimeInterpretation");
	});

	it("does not silently classify literal Markdown examples as interpreted HTML", async () => {
		const report = await fixture(
			response(
				`${prefix}<title>Security check</title></head><body><p>Verify you are human</p></body></html>`,
			),
			{ execution: { minRequestIntervalMs: 0 } },
		);
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.classification.diagnostic).toBeNull();
		expect(report).not.toHaveProperty("readerMimePolicy");
		expect(report.reader).not.toHaveProperty("mimeInterpretation");
		expect(report.extraction?.content).toContain("<!doctype html>");
	});

	it.each([403, 429])(
		"does not turn HTTP %s into a successful interpretation",
		async (status) => {
			const report = await fixture(response(source, { status }), {
				execution: { ...enabled, outputLimitPolicy: "text-prefix-v1" },
			});
			expect(report.contentSuccess).toBe(false);
			expect(report.outcome).not.toBe("extracted-unverified");
			if (status === 429)
				expect(report.rateLimit).toMatchObject({
					status: 429,
					action: "stop-without-retry",
				});
		},
	);

	it("keeps MIME interpretation independent from explicit output-prefix recovery", async () => {
		const text = `${prefix}</head><body><h1>Large catalogue</h1><p>${"Visible listing evidence. ".repeat(13_000)}</p></body></html>`;
		const strict = await fixture(response(text));
		expect(strict).toMatchObject({
			outcome: "failure",
			failure: {
				category: "resource-limit",
				resourceLimit: { kind: "extraction.output" },
			},
		});
		expect(strict).not.toHaveProperty("outputLimitPolicy");
		const recovered = await fixture(response(text), {
			execution: { ...enabled, outputLimitPolicy: "text-prefix-v1" },
		});
		expect(recovered).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			readerMimePolicy: policy,
			outputLimitPolicy: "text-prefix-v1",
			reader: { mimePolicy: policy },
			extraction: { contentFallback: { truncated: true } },
		});
		expect(recovered.extraction?.content).toContain("Large catalogue");
		expect(recovered.extraction?.content).not.toContain("<!doctype html>");
		const literal = await fixture(response(text), {
			execution: {
				minRequestIntervalMs: 0,
				outputLimitPolicy: "text-prefix-v1",
			},
		});
		expect(literal).not.toHaveProperty("readerMimePolicy");
		expect(literal.reader).not.toHaveProperty("mimeInterpretation");
		expect(literal.extraction?.content).toContain("<!doctype html>");
		expect(literal.extraction?.contentFallback?.truncated).toBe(true);
	});
});
