import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import { recoverResearchOutputLimitContentFocus } from "../scripts/research-json-replay.js";
import { researchLinkContent } from "../scripts/research-link-content.js";
import { BrowserCommandHost } from "./command-host.js";
import { DocumentTree } from "./document.js";
import * as focus from "./extraction-content-focus.js";
import type { DocumentExtraction } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import * as loader from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const sourceUrl = "https://nested-focus.fixture.invalid/index";
const targetUrl = "https://nested-focus.fixture.invalid/article";
const navigation = `<nav><p>${"Repeated navigation entry. ".repeat(13_000)}</p></nav>`;
const article =
	"<article><h1>Owned article</h1><p>Literal evidence: café &amp; tea.</p><pre>const answer = 42;</pre></article>";
const targetHtml = `<main>${navigation}${article}</main>`;
const hiddenHtml = `<main>${navigation}${article}<button hidden>Back to top</button></main>`;
const refined = {
	policy: "main-content-v3",
	selected: "article",
	reason: "unique-article-in-main",
	mainCandidates: 1,
	articleCandidates: 1,
	outsideArticleContent: false,
	mainArticleCandidates: 1,
	outsideMainArticleContent: false,
};

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function serve(url: string, html: string) {
	const body = new TextEncoder().encode(html);
	const response: NetworkResponse = {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
	vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
		async (request) => {
			expect(request.url).toBe(url);
			expect(request.method ?? "GET").toBe("GET");
			expect(request.body).toBeUndefined();
			return response;
		},
	);
	return response;
}

beforeEach(() => {
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error("Unexpected synthetic request"),
	);
	vi.spyOn(
		NodeNetworkTransport.prototype,
		"requestWithRoutes",
	).mockImplementation(function (this: NodeNetworkTransport, request) {
		return this.request(request);
	});
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(BrowserSession.prototype, "close");
	vi.spyOn(DocumentTree.prototype, "close");
	vi.spyOn(loader, "loadResearchDocument");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Native integration tests must not fetch");
		}),
	);
});

afterEach(() => {
	try {
		expect(fetch).not.toHaveBeenCalled();
		expect(NodeNetworkTransport.prototype.close).toHaveBeenCalled();
		expect(BrowserSession.prototype.close).toHaveBeenCalled();
		for (const session of vi.mocked(BrowserSession.prototype.close).mock
			.contexts as BrowserSession[])
			expect(session.metrics()).toMatchObject({
				closed: true,
				tabs: 0,
				pendingLoads: 0,
				cleanupErrors: 0,
				network: { active: 0, closed: true },
			});
		for (const result of vi.mocked(loader.loadResearchDocument).mock.results)
			if (result.type === "return")
				expect(result.value.mutationMetrics().closed).toBe(true);
		expect(DocumentTree.prototype.close).toHaveBeenCalled();
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock
			.contexts as DocumentTree[]) {
			expect(tree.nodeCount).toBe(0);
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(loader.researchReaderInfo(tree)).toBeUndefined();
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

async function capture(readerVisibilityPolicy?: "source-hidden-v1") {
	const response = serve(targetUrl, hiddenHtml);
	const report = await researchNavigation(
		targetUrl,
		true,
		undefined,
		undefined,
		true,
		undefined,
		undefined,
		false,
		undefined,
		"default",
		{
			minRequestIntervalMs: 0,
			...(readerVisibilityPolicy === undefined
				? {}
				: { readerVisibilityPolicy }),
		},
	);
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
		metrics: { active: 0, closed: true },
	});
	expect(report.failure?.resourceLimit?.observed).toBeGreaterThan(256_000);
	const serialized = serializeResearchReport(report, "default");
	expect(serialized.disposition).toBe("complete");
	return {
		report,
		raw: serialized.jsonl,
		trusted: {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(serialized.jsonl),
			expectedBody: {
				bytes: response.body.byteLength,
				sha256: hash(response.body),
			},
		},
	};
}

it("preserves the authored hidden button by default and recovers only the separately captured hidden-policy article", async () => {
	const original = await capture();
	const hidden = await capture("source-hidden-v1");
	const captures = structuredClone([original, hidden]);
	expect(original.report.reader).toMatchObject({
		hiddenContentSemantics: false,
	});
	expect(original.report.reader).not.toHaveProperty("visibilityPolicy");
	expect(hidden.report.reader).toMatchObject({
		visibilityPolicy: "source-hidden-v1",
		hiddenContentSemantics: "source-attributes",
		sourceHiddenSubtrees: 1,
	});
	expect(original.trusted.expectedBody).toEqual(hidden.trusted.expectedBody);
	expect(original.trusted.expectedReceiptSha256).not.toBe(
		hidden.trusted.expectedReceiptSha256,
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
	const selections: Array<{
		metadata: Readonly<focus.ContentFocusMetadata>;
		retainedControlText: boolean;
	}> = [];
	const select = focus.selectContentFocus;
	vi.spyOn(focus, "selectContentFocus").mockImplementation((tree, options) => {
		const selected = select(tree, options);
		selections.push({
			metadata: selected.metadata,
			retainedControlText: tree.textContent(tree.root).includes("Back to top"),
		});
		return selected;
	});
	expect(() =>
		recoverResearchOutputLimitContentFocus(original.raw, original.trusted, {
			contentFocus: "main-content-v3",
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(selections).toHaveLength(1);
	expect(selections[0]).toMatchObject({
		retainedControlText: true,
		metadata: {
			...refined,
			selected: "main",
			reason: "unique-main",
			outsideArticleContent: true,
			outsideMainArticleContent: true,
		},
	});
	const recovered = recoverResearchOutputLimitContentFocus(
		hidden.raw,
		hidden.trusted,
		{ contentFocus: "main-content-v3" },
		undefined,
		"markdown",
	);
	expect(selections).toHaveLength(2);
	expect(selections[1]).toMatchObject({
		retainedControlText: false,
		metadata: refined,
	});
	expect(recovered.report).toMatchObject({
		partial: true,
		outcome: "extracted-unverified",
		contentSuccess: null,
		networkRequests: 0,
		source: {
			profile: "default",
			reportedFinalUrl: targetUrl,
			receiptSha256: hidden.trusted.expectedReceiptSha256,
			body: hidden.trusted.expectedBody,
		},
		reader: hidden.report.reader,
		selection: { method: "content-focus", matches: null },
		extraction: { contentSelection: refined },
		recovery: {
			kind: "captured-output-limit-content-focus",
			originalOutcome: "failure",
			originalContentSuccess: false,
			originalFailure: hidden.report.failure,
			originalRequestRetried: false,
		},
	});
	expect(recovered.report.extraction?.content).toContain(
		"Literal evidence: café &amp; tea\\.",
	);
	expect(recovered.report.extraction?.content).toContain("const answer = 42;");
	expect(recovered.jsonl).not.toContain("Repeated navigation entry");
	expect(recovered.jsonl).not.toContain("Back to top");
	expect(Object.isFrozen(recovered.report.extraction?.contentSelection)).toBe(
		true,
	);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(2);
	expect([original, hidden]).toEqual(captures);
});

it("executes native command-host v3 extraction with article scope and closes its resources", async () => {
	const tree = parseHtmlDocument(targetHtml, targetUrl);
	const articleNode = new DocumentQueries(tree).querySelector("article");
	if (articleNode === null) throw new Error("Missing fixture article");
	const scope = tree.reference(articleNode);
	serve(targetUrl, targetHtml);
	const session = new BrowserSession({
		createTransport: () => new NodeNetworkTransport(),
		loadDocument: () => tree,
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	try {
		await host.execute(["open", targetUrl]);
		await expect(
			host.execute(["extract", "--max-bytes=256000"]),
		).rejects.toMatchObject({
			code: "resource-limit",
		});
		const result = await host.execute([
			"extract",
			"--content-focus=main-content-v3",
			"--format=markdown",
			"--max-bytes=256000",
		]);
		const extracted = result.data as DocumentExtraction;
		expect(extracted).toMatchObject({
			format: "markdown",
			scope,
			contentSelection: refined,
		});
		expect(extracted.content).toContain("Literal evidence: café &amp; tea\\.");
		expect(extracted.content).toContain("const answer = 42;");
		expect(extracted.content).not.toContain("Repeated navigation entry");
		expect(Object.isFrozen(extracted.contentSelection)).toBe(true);
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledOnce();
	} finally {
		host.close();
	}
	expect(tree.mutationMetrics().closed).toBe(true);
});

it("follows one exact native link with explicit v3 and releases both mocked responses' documents", async () => {
	const responses = [
		serve(
			sourceUrl,
			'<main><a id="chosen" href="/article">Read owned article</a></main>',
		),
		serve(targetUrl, targetHtml),
	];
	const click = vi.spyOn(BrowserSession.prototype, "click");
	const report = await researchLinkContent([
		"--target",
		targetUrl,
		"--selector",
		"#chosen",
		"--content-focus",
		"main-content-v3",
		sourceUrl,
	]);
	expect(report).toMatchObject({
		kind: "native-research-link-content-v1",
		partial: true,
		outcome: "extracted-unverified",
		contentSuccess: null,
		stage: "complete",
		sourceUrl,
		targetUrl,
		selector: "#chosen",
		selection: {
			reference: expect.any(String),
			label: "Read owned article",
			url: targetUrl,
			candidates: 1,
		},
		events: ["mousedown", "mouseup", "click"],
		extraction: { contentSelection: refined },
		documentClosedStates: [true, true],
		metrics: {
			closed: true,
			tabs: 0,
			pendingLoads: 0,
			cleanupErrors: 0,
			network: { active: 0, closed: true },
		},
	});
	expect(click).toHaveBeenCalledOnce();
	expect((await click.mock.results[0].value).navigation).toMatchObject({
		kind: "document",
		url: targetUrl,
	});
	expect(report.extraction?.content).toContain(
		"Literal evidence: café &amp; tea\\.",
	);
	expect(report.extraction?.content).toContain("const answer = 42;");
	expect(report.extraction?.content).not.toContain("Repeated navigation entry");
	expect(report.extraction?.content).not.toContain("Read owned article");
	expect(Object.isFrozen(report.extraction?.contentSelection)).toBe(true);
	expect(report.responses).toEqual(
		responses.map((response) => ({
			url: response.url,
			status: 200,
			decodedBytes: response.body.byteLength,
			bodySha256: hash(response.body),
		})),
	);
	expect(
		vi
			.mocked(NodeNetworkTransport.prototype.request)
			.mock.calls.map(([request]) => request.url),
	).toEqual([sourceUrl, targetUrl]);
});
