import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { decodeResearchBodyCapture } from "../scripts/research-body-capture.js";
import {
	type ResearchExecutionOptions,
	type ResearchNavigationReport,
	parseResearchArguments,
	researchNavigation,
} from "../scripts/research-browser.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type DocumentExtraction,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { loadTextDocument } from "./text-loader.js";

const url = "https://extraction-prefix.fixture.invalid/article";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const prefixOptions = { outputLimitPolicy: "text-prefix-v1" } as const;
const executionOptions: ResearchExecutionOptions = {
	...prefixOptions,
	minRequestIntervalMs: 0,
};
const largeText = "Readable evidence remains in document order. ".repeat(6500);

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected prefix fixture request"),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "createTab");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Prefix extraction must not fetch");
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

function html(source: string): DocumentTree {
	const tree = parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function document(): DocumentTree {
	const tree = new DocumentTree(url);
	trees.push(tree);
	return tree;
}

function append(
	tree: DocumentTree,
	parent: number,
	tag: string,
	text?: string,
): number {
	const node = tree.createElement(tag);
	tree.append(parent, node);
	if (text !== undefined) tree.setTextContent(node, text);
	return node;
}

function reference(tree: DocumentTree, selector: string): string {
	const node = new DocumentQueries(tree).querySelector(selector);
	if (node === null) throw new Error("Missing prefix fixture selection");
	return tree.reference(node);
}

function response(
	source: string,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = encoder.encode(source);
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

function textDocument(source: string): DocumentTree {
	const tree = loadTextDocument(
		response(source, { headers: { "content-type": ["text/markdown"] } }),
		{
			tabId: "prefix-fixture",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 100,
				maxDepth: 16,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
		},
	);
	trees.push(tree);
	return tree;
}

function failure(action: () => unknown): AgentBrowserError {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected prefix fixture failure");
	return caught;
}

function bounded(result: DocumentExtraction | undefined, maxBytes: number) {
	expect(result?.format).toBe("markdown");
	if (!result || result.format !== "markdown")
		throw new Error("Expected bounded Markdown extraction");
	const fallback = result.contentFallback;
	expect(fallback).toBeDefined();
	if (!fallback) throw new Error("Expected explicit prefix metadata");
	expect(encoder.encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(
		maxBytes,
	);
	expect(fallback).toMatchObject({
		policy: "text-prefix-v1",
		representation: "indented-plain-text",
		trigger: { kind: "extraction.output", unit: "bytes", limit: maxBytes },
	});
	expect(fallback.trigger.observed).toBeGreaterThan(maxBytes);
	expect(fallback.retainedCodeUnits).toBeGreaterThan(0);
	expect(fallback.retainedCodeUnits).toBeLessThanOrEqual(
		fallback.sourceCodeUnits,
	);
	expect(fallback.truncated).toBe(
		fallback.retainedCodeUnits < fallback.sourceCodeUnits,
	);
	expect(Object.isFrozen(fallback)).toBe(true);
	expect(Object.isFrozen(fallback.trigger)).toBe(true);
	expect(result.content.trim()).not.toBe("");
	expect(result.content.endsWith("\n")).toBe(true);
	for (const line of result.content.slice(0, -1).split("\n"))
		expect(line.startsWith("    ")).toBe(true);
	expect(new TextDecoder().decode(encoder.encode(result.content))).toBe(
		result.content,
	);
	return result;
}

function expectNoSetup() {
	expect(BrowserSession.prototype.createTab).not.toHaveBeenCalled();
	expect(BrowserSession.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
}

interface NavigationOptions {
	reader?: boolean;
	selector?: string;
	lines?: { start: number; end: number };
	section?: string;
	headings?: boolean;
	find?: string;
	captureBody?: boolean;
	execution?: ResearchExecutionOptions;
	response?: Partial<NetworkResponse>;
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
		undefined,
		options.execution ?? executionOptions,
	);
}

async function fixture(source: string, options: NavigationOptions = {}) {
	const input = response(source, options.response);
	const originalBody = input.body.slice();
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
		input,
	);
	const report = await navigate(options);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith(
		expect.objectContaining({
			url,
			cookieContext: expect.objectContaining({ credentials: "omit" }),
		}),
	);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledOnce();
	expect(BrowserSession.prototype.close).toHaveBeenCalledOnce();
	expect(report.metrics).toMatchObject({ active: 0, closed: true });
	expect(report.partial).toBe(true);
	expect(input.body).toEqual(originalBody);
	return report;
}

it.each(["markdown", "json"] as const)(
	"keeps default core %s extraction strict",
	(format) => {
		const tree = html(`<p>${largeText}</p>`);
		const error = failure(() => extractDocument(tree, { format }));
		expect(error.code).toBe("resource-limit");
		expect(resourceLimitDiagnostic(error)).toMatchObject({
			kind: "extraction.output",
			unit: "bytes",
			limit: 262_144,
		});
		expectNoSetup();
	},
);

it("preserves small results byte-for-byte, including the exact strict byte cap", () => {
	const tree = html(
		`<title>Small 雪</title><h1>Heading</h1><p>${"Readable text. ".repeat(8)}</p>`,
	);
	const strict = extractDocument(tree);
	const maxBytes = encoder.encode(JSON.stringify(strict)).byteLength;
	for (const options of [prefixOptions, { ...prefixOptions, maxBytes }]) {
		const result = extractDocument(tree, options);
		expect(JSON.stringify(result)).toBe(JSON.stringify(strict));
		expect(result).not.toHaveProperty("contentFallback");
	}
	expectNoSetup();
});

it("recovers serialized output overflow while charging Unicode metadata and its diagnostic", () => {
	const title = 'Metadata 雪😀 "quoted" '.repeat(12);
	const source = "Readable ".repeat(90);
	const tree = html(`<title>${title}</title><p>${source}</p>`);
	const strict = extractDocument(tree);
	const maxBytes = 1024;
	expect(encoder.encode(String(strict.content)).byteLength).toBeLessThan(
		maxBytes,
	);
	const error = failure(() => extractDocument(tree, { maxBytes }));
	const diagnostic = resourceLimitDiagnostic(error);
	expect(diagnostic?.observed).toBe(
		encoder.encode(JSON.stringify(strict)).byteLength,
	);
	const result = bounded(
		extractDocument(tree, { ...prefixOptions, maxBytes }),
		maxBytes,
	);
	expect(result.content).toContain("Readable");
	expect(result.title).toBe(strict.title);
	expect(result.document).toBe(strict.document);
	expect(result.scope).toBe(strict.scope);
	expect(result.revision).toBe(strict.revision);
	expect(result.contentFallback?.trigger).toEqual(diagnostic);
	expect(result.contentFallback?.truncated).toBe(true);
	expect(extractDocument(tree)).toEqual(strict);
	expectNoSetup();
});

it("can retain the complete plain text when only Markdown formatting overflows", () => {
	const tree = html(
		`<p>Read <a href="/${"destination".repeat(200)}">the evidence</a>.</p>`,
	);
	const maxBytes = 1024;
	const strict = failure(() => extractDocument(tree, { maxBytes }));
	const result = bounded(
		extractDocument(tree, { ...prefixOptions, maxBytes }),
		maxBytes,
	);
	const projection = "Read the evidence.";
	expect(result.content).toBe(`    ${projection}\n`);
	expect(result.contentFallback).toMatchObject({
		sourceCodeUnits: projection.length,
		retainedCodeUnits: projection.length,
		truncated: false,
		trigger: resourceLimitDiagnostic(strict),
	});
	expect(result.content).not.toContain("destination");
});

it.each([1024, 1025, 1026, 1027])(
	"keeps a Unicode single-line prefix well formed at a %s-byte cap",
	(maxBytes) => {
		const source = '雪😀🧪 "quoted" \\ '.repeat(400);
		const tree = document();
		append(tree, tree.root, "p", source);
		const result = bounded(
			extractDocument(tree, { ...prefixOptions, maxBytes }),
			maxBytes,
		);
		expect(result.content).toContain('雪😀🧪 "quoted" \\');
		expect(result.content).not.toContain("\ufffd");
		expect(source.startsWith(result.content.slice(4, -1))).toBe(true);
		expect(result.contentFallback?.truncated).toBe(true);
	},
);

it.each(["root", "section"] as const)(
	"applies %s selection before recovering an oversized selected body",
	(selection) => {
		const source = "Selected evidence. ".repeat(700);
		const tree = html(
			`<aside>${"OUTSIDE_BEFORE ".repeat(1000)}</aside><section id="scope"><h2 id="start">Wanted</h2><p>${source}</p></section><h2>Boundary</h2><p>${"OUTSIDE_AFTER ".repeat(1000)}</p>`,
		);
		const options = {
			[selection]: reference(tree, selection === "root" ? "#scope" : "#start"),
			maxBytes: 1200,
		};
		const strict = failure(() => extractDocument(tree, options));
		const result = bounded(
			extractDocument(tree, { ...options, ...prefixOptions }),
			options.maxBytes,
		);
		expect(result.content).toContain("Wanted");
		expect(result.content).toContain("Selected evidence");
		for (const omitted of ["OUTSIDE_BEFORE", "OUTSIDE_AFTER", "Boundary"])
			expect(result.content).not.toContain(omitted);
		expect(result.contentFallback?.sourceCodeUnits).toBeLessThan(
			source.length + 64,
		);
		expect(result.contentFallback?.trigger).toEqual(
			resourceLimitDiagnostic(strict),
		);
		if (selection === "root") expect(result.scope).toBe(options.root);
		else expect(result.sectionSelection).toBeDefined();
	},
);

it("applies text-line selection before recovery and leaves bounded selections unchanged", () => {
	const selected = "Selected line evidence. ".repeat(600);
	const tree = textDocument(`OUTSIDE_BEFORE\n${selected}\nOUTSIDE_AFTER`);
	const options = { lines: { start: 2, end: 2 }, maxBytes: 1200 };
	const result = bounded(
		extractDocument(tree, { ...options, ...prefixOptions }),
		options.maxBytes,
	);
	expect(result.textSelection).toMatchObject({
		method: "text-lines",
		start: 2,
		end: 2,
		totalLines: 3,
		selectedCodeUnits: selected.length + 1,
	});
	expect(result.content).toContain("Selected line evidence");
	expect(result.content).not.toContain("OUTSIDE_");
	expect(result.contentFallback?.sourceCodeUnits).toBeLessThan(
		selected.length + 16,
	);
	const small = { lines: { start: 3, end: 3 }, maxBytes: 1200 };
	expect(extractDocument(tree, { ...small, ...prefixOptions })).toEqual(
		extractDocument(tree, small),
	);
});

it("omits hidden, executable and form content before constructing the prefix", () => {
	const tree = html(
		`<style>.gone { display: none }</style><script>PRIVATE_SCRIPT</script><template>PRIVATE_TEMPLATE</template><p hidden>PRIVATE_HIDDEN</p><p class="gone">PRIVATE_CSS</p><p aria-hidden="true">PRIVATE_ARIA</p><input value="PRIVATE_INPUT"><textarea>PRIVATE_TEXTAREA</textarea><select><option>PRIVATE_OPTION</option></select><p>Public <strong>inline</strong> evidence ${"continues ".repeat(600)}</p>`,
	);
	const result = bounded(
		extractDocument(tree, { ...prefixOptions, maxBytes: 1024 }),
		1024,
	);
	expect(result.content).toContain("Public inline evidence");
	expect(result.content).not.toContain("PRIVATE_");
	expect(result.content).not.toContain("display: none");
	const hidden = extractDocument(tree, {
		...prefixOptions,
		root: reference(tree, "[hidden]"),
		maxBytes: 1024,
	});
	expect(hidden.content).toBe("");
	expect(hidden).not.toHaveProperty("contentFallback");
});

it.each([{ maxNodes: 4 }, { maxDepth: 3 }])(
	"still admits the complete selected tree before recovery with limits %j",
	(limits) => {
		const tree = document();
		append(tree, tree.root, "p", "Early readable text. ".repeat(200));
		let parent = tree.root;
		for (let depth = 0; depth < 8; depth++)
			parent = append(tree, parent, "div");
		const options = { ...limits, maxBytes: 1024 };
		const strict = failure(() => extractDocument(tree, options));
		const requested = failure(() =>
			extractDocument(tree, { ...options, ...prefixOptions }),
		);
		expect(requested).toMatchObject({
			code: "resource-limit",
			message: "Extraction structure limit exceeded",
		});
		expect(requested.message).toBe(strict.message);
		expect(resourceLimitDiagnostic(requested)).toBeUndefined();
	},
);

it("does not recover intermediate-tree overflow", () => {
	const tree = document();
	append(tree, tree.root, "p", "雪".repeat(1_400_000));
	const error = failure(() =>
		extractDocument(tree, { ...prefixOptions, maxBytes: 1024 }),
	);
	expect(error).toMatchObject({
		code: "resource-limit",
		message: "Extraction intermediate limit exceeded",
	});
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
});

it("does not recover metadata overflow or a cap without room for a meaningful prefix", () => {
	const metadataTree = html(
		`<title>${"Metadata ".repeat(200)}</title><p>Readable</p>`,
	);
	const metadataError = failure(() =>
		extractDocument(metadataTree, { ...prefixOptions, maxBytes: 1024 }),
	);
	expect(metadataError).toMatchObject({
		code: "resource-limit",
		message: "Extraction metadata limit exceeded",
	});
	expect(resourceLimitDiagnostic(metadataError)).toBeUndefined();
	const tree = document();
	append(tree, tree.root, "p", "Readable ".repeat(100));
	const strict = failure(() => extractDocument(tree, { maxBytes: 256 }));
	const requested = failure(() =>
		extractDocument(tree, { ...prefixOptions, maxBytes: 256 }),
	);
	expect(requested.message).toBe(strict.message);
	expect(resourceLimitDiagnostic(strict)?.kind).toBe("extraction.output");
	expect(resourceLimitDiagnostic(requested)).toEqual(
		resourceLimitDiagnostic(strict),
	);
});

it("does not turn unsupported table structure into a plain-text result", () => {
	const tree = document();
	append(tree, tree.root, "p", "Readable first. ".repeat(100));
	const paragraph = append(tree, tree.root, "p");
	append(tree, paragraph, "td", "Unsupported descendant");
	const error = failure(() =>
		extractDocument(tree, { ...prefixOptions, maxBytes: 1024 }),
	);
	expect(error).toMatchObject({
		code: "unsupported",
		message: "Unsupported table extraction structure",
	});
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
});

it.each(["strict", "text-prefix-v2", "", null, true, 1])(
	"rejects invalid core output policy %j",
	(outputLimitPolicy) => {
		const tree = html("<p>Small</p>");
		expect(() =>
			extractDocument(tree, {
				outputLimitPolicy,
			} as unknown as ExtractionOptions),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		expectNoSetup();
	},
);

it("rejects an explicit prefix policy for JSON even when the result would fit", () => {
	const tree = html("<p>Small</p>");
	expect(() =>
		extractDocument(tree, { ...prefixOptions, format: "json" }),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(extractDocument(tree, { format: "json" })).not.toHaveProperty(
		"contentFallback",
	);
	expectNoSetup();
});

it("parses explicit reader Markdown recovery without changing default argument shapes", () => {
	expect(parseResearchArguments([url])).toEqual({ reader: false, urls: [url] });
	expect(parseResearchArguments(["--reader", url])).toEqual({
		reader: true,
		urls: [url],
	});
	for (const flags of [[], ["--format", "markdown"]])
		expect(
			parseResearchArguments([
				"--reader",
				"--output-limit-policy",
				"text-prefix-v1",
				...flags,
				url,
			]),
		).toEqual({
			reader: true,
			urls: [url],
			...prefixOptions,
			...(flags.length ? { format: "markdown" } : {}),
		});
	expectNoSetup();
});

it.each([
	["--output-limit-policy", "text-prefix-v1"],
	["--reader", "--output-limit-policy"],
	["--reader", "--output-limit-policy", "--capture-body"],
	["--reader", "--output-limit-policy", "unknown"],
	["--reader", "--output-limit-policy", ""],
	["--reader", "--output-limit-policy=text-prefix-v1"],
	[
		"--reader",
		"--output-limit-policy",
		"text-prefix-v1",
		"--output-limit-policy",
		"text-prefix-v1",
	],
	["--reader", "--output-limit-policy", "text-prefix-v1", "--format", "json"],
	["--reader", "--format", "json", "--output-limit-policy", "text-prefix-v1"],
	["--reader", "--output-limit-policy", "text-prefix-v1", "--headings"],
	["--reader", "--output-limit-policy", "text-prefix-v1", "--find", "Readable"],
])("rejects invalid prefix CLI flags %j before setup", (...flags) => {
	expect(() => parseResearchArguments([url, ...flags])).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expectNoSetup();
});

it.each([
	{ reader: false },
	{ headings: true },
	{ find: "Readable" },
	{ execution: { ...executionOptions, format: "json" } },
	{ execution: { ...executionOptions, outputLimitPolicy: "unknown" } },
	{ execution: { ...executionOptions, outputLimitPolicy: null } },
])(
	"rejects invalid research execution combinations %j before setup",
	async (options) => {
		await expect(navigate(options as NavigationOptions)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expectNoSetup();
	},
);

it.each(["text/html", "text/markdown"])(
	"keeps default mocked research strict for oversized %s bodies",
	async (mime) => {
		const source = mime === "text/html" ? `<p>${largeText}</p>` : largeText;
		const report = await fixture(source, {
			execution: { minRequestIntervalMs: 0 },
			response: { headers: { "content-type": [mime] } },
		});
		expect(report).toMatchObject({
			outcome: "failure",
			contentSuccess: false,
			failure: {
				category: "resource-limit",
				stage: "extraction",
				resourceLimit: {
					kind: "extraction.output",
					unit: "bytes",
					limit: 256_000,
				},
			},
		});
		expect(report.failure?.resourceLimit?.observed).toBeGreaterThan(256_000);
		expect(report.extraction).toBeUndefined();
		expect(report).not.toHaveProperty("outputLimitPolicy");
	},
);

it.each(["text/html", "text/markdown"])(
	"recovers a large single-line %s body once and preserves capture and serialized prefix metadata",
	async (mime) => {
		const source = mime === "text/html" ? `<p>${largeText}</p>` : largeText;
		const report = await fixture(source, {
			captureBody: true,
			response: { headers: { "content-type": [mime] } },
		});
		expect(report).toMatchObject({
			...prefixOptions,
			outcome: "extracted-unverified",
			contentSuccess: null,
			classification: { barrier: null, diagnostic: null },
		});
		expect(report.failure).toBeUndefined();
		const extraction = bounded(report.extraction, 256_000);
		expect(extraction.content).toContain(
			"Readable evidence remains in document order",
		);
		expect(extraction.contentFallback?.truncated).toBe(true);
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(
			encoder.encode(source),
		);
		const emission = serializeResearchReport(report, "default");
		expect(emission.disposition).toBe("complete");
		const restored = JSON.parse(
			new TextDecoder().decode(emission.jsonl),
		) as ResearchNavigationReport;
		expect(restored.outputLimitPolicy).toBe("text-prefix-v1");
		expect(restored.extraction).toEqual(report.extraction);
		expect(restored.bodyCapture).toEqual(report.bodyCapture);
	},
);

it.each([{ selector: "#wanted" }, { section: "#wanted" }])(
	"keeps a small research selection unchanged despite an oversized surrounding body: %j",
	async (selection) => {
		const report = await fixture(
			`<p>${largeText}</p><h2 id="wanted">Wanted</h2><h2>Boundary</h2><p>Outside selection</p>`,
			selection,
		);
		expect(report).toMatchObject({
			...prefixOptions,
			outcome: "extracted-unverified",
			contentSuccess: null,
		});
		expect(report.failure).toBeUndefined();
		expect(report.extraction?.content).toBe("## Wanted\n");
		expect(report.extraction).not.toHaveProperty("contentFallback");
	},
);

it.each(["text/html", "text/markdown"])(
	"keeps the final redacted %s extraction within its byte cap",
	async (mime) => {
		const source = mime === "text/html" ? `<p>${largeText}</p>` : largeText;
		const report = await fixture(source, {
			captureBody: true,
			response: {
				url: `${url}?x`,
				headers: { "content-type": [mime] },
			},
		});
		expect(report.outcome).toBe("extracted-unverified");
		expect(report.extraction?.url).toBe(`${url}?redacted`);
		expect(report.extraction?.contentFallback?.truncated).toBe(true);
		expect(report.extraction?.contentFallback?.trigger.limit).toBe(255_993);
		expect(
			encoder.encode(JSON.stringify(report.extraction)).byteLength,
		).toBeLessThanOrEqual(256_000);
		expect(decodeResearchBodyCapture(report.bodyCapture)).toEqual(
			encoder.encode(source),
		);
		const emission = serializeResearchReport(report, "default");
		expect(emission.disposition).toBe("complete");
		const restored = JSON.parse(
			new TextDecoder().decode(emission.jsonl),
		) as ResearchNavigationReport;
		expect(restored.extraction).toEqual(report.extraction);
		expect(
			encoder.encode(JSON.stringify(restored.extraction)).byteLength,
		).toBeLessThanOrEqual(256_000);
	},
);

it.each([
	{ name: "HTTP 403", status: 403, prefix: "<title>Ordinary refusal</title>" },
	{
		name: "HTTP 429",
		status: 429,
		prefix: "<title>Ordinary retry notice</title>",
	},
	{
		name: "challenge",
		status: 200,
		prefix:
			"<title>Just a moment...</title><noscript>Enable JavaScript and cookies to continue</noscript>",
	},
])(
	"does not promote $name to success when recovery is requested",
	async ({ status, prefix, name }) => {
		const report = await fixture(`${prefix}<p>${largeText}</p>`, {
			response: { status },
		});
		expect(report.outputLimitPolicy).toBe("text-prefix-v1");
		expect(report.primaryResponse?.status).toBe(status);
		expect(report.contentSuccess).toBe(false);
		expect(report.outcome).not.toBe("extracted-unverified");
		if (name === "challenge") {
			expect(report.outcome).toBe("semantic-barrier");
			expect(report.classification.barrier).not.toBeNull();
		}
		if (status === 429) {
			expect(report.extraction).toBeUndefined();
			expect(report.rateLimit).toMatchObject({
				status: 429,
				action: "stop-without-retry",
			});
		}
	},
);

it("keeps loader depth failure ahead of prefix extraction", async () => {
	const report = await fixture("<div>".repeat(129));
	expect(report).toMatchObject({
		...prefixOptions,
		outcome: "failure",
		contentSuccess: false,
		failure: {
			category: "resource-limit",
			stage: "loader",
			resourceLimit: {
				kind: "reader.depth",
				unit: "levels",
				limit: 128,
				observed: 129,
			},
		},
	});
	expect(report.extraction).toBeUndefined();
});
