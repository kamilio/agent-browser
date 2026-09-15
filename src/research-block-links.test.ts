import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializeResearchReport } from "../scripts/research-admission-evidence.js";
import { researchNavigation } from "../scripts/research-browser.js";
import { extractResearchReplayJson } from "../scripts/research-json-replay.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	discoverDocumentHeadings,
	discoverDocumentLinks,
	extractDocument,
} from "./extraction.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

const url = "https://block-link.fixture.invalid/index";
const bodySource =
	'<main><a href="/story"><div><h2>Linked title</h2><p>Summary</p></div></a><p>Following text</p></main>';
const expected =
	"## [Linked title](<https://block-link.fixture.invalid/story>)\n\n[Summary](<https://block-link.fixture.invalid/story>)\n\nFollowing text\n";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
let expectedRequests = 0;

function response(source = bodySource) {
	const body = encoder.encode(source);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

beforeEach(() => {
	expectedRequests = 0;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new AgentBrowserError("policy-denied", "Unexpected fixture request"),
	);
	vi.spyOn(DocumentTree.prototype, "close");
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected fetch");
		}),
	);
});

afterEach(() => {
	try {
		for (const tree of trees.splice(0)) tree.close();
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(
			expectedRequests,
		);
		expect(fetch).not.toHaveBeenCalled();
		for (const tree of vi.mocked(DocumentTree.prototype.close).mock.contexts) {
			if (!(tree instanceof DocumentTree))
				throw new Error("Expected owned document");
			expect(tree.nodeCount).toBe(0);
		}
	} finally {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	}
});

it.each(["default", "long-v1"] as const)(
	"preserves reader structure and discovery under %s",
	(profile) => {
		for (const rawPolicy of [undefined, "separate-omitted-raw-v1"] as const) {
			const tree = loadResearchDocument(
				response(),
				{
					tabId: "fixture",
					signal: new AbortController().signal,
					limits: {
						maxNodes: 50000,
						maxDepth: 128,
						maxTextCodeUnits: 2000000,
						maxChanges: 1024,
					},
				},
				profile,
				rawPolicy,
			);
			trees.push(tree);
			const before = extractDocument(tree, { format: "json" });
			const headings = discoverDocumentHeadings(tree);
			const links = discoverDocumentLinks(tree, "story");
			const revision = tree.revision;
			expect(extractDocument(tree).content).toBe(expected);
			expect(extractDocument(tree, { format: "json" })).toEqual(before);
			expect(discoverDocumentHeadings(tree)).toEqual(headings);
			expect(discoverDocumentLinks(tree, "story")).toEqual(links);
			expect(headings.entries.map((entry) => entry.title)).toEqual([
				"Linked title",
			]);
			expect(links.entries).toHaveLength(1);
			expect(tree.revision).toBe(revision);
		}
	},
);

it.each([false, true])(
	"uses structured links through native research reader=%s",
	async (reader) => {
		const original = response();
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			original,
		);
		expectedRequests = 1;
		const report = await researchNavigation(
			url,
			reader,
			undefined,
			undefined,
			true,
			undefined,
			undefined,
			false,
			undefined,
			"default",
			{ format: "markdown", minRequestIntervalMs: 0 },
		);
		expect(report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			extraction: { format: "markdown", content: expected },
			metrics: { active: 0, closed: true },
		});
		expect(original.body).toEqual(encoder.encode(bodySource));
	},
);

it.each(["json", "markdown"] as const)(
	"replays the same captured source as %s without fetching",
	async (format) => {
		const original = response();
		vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce(
			original,
		);
		expectedRequests = 1;
		const report = await researchNavigation(
			url,
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
				format: "markdown",
				minRequestIntervalMs: 0,
				readerRawPolicy: "separate-omitted-raw-v1",
			},
		);
		const serialized = serializeResearchReport(report, "default");
		const receipt = serialized.jsonl.slice();
		const trusted = {
			expectedProfile: "default" as const,
			expectedReceiptSha256: hash(receipt),
			expectedBody: {
				bytes: original.body.byteLength,
				sha256: hash(original.body),
			},
		};
		const result = extractResearchReplayJson(
			receipt,
			trusted,
			{ selector: "main" },
			undefined,
			format,
		);
		expect(result.report).toMatchObject({
			outcome: "extracted-unverified",
			contentSuccess: null,
			networkRequests: 0,
		});
		if (result.report.extraction?.format === "markdown")
			expect(result.report.extraction.content).toBe(expected);
		else {
			expect(result.jsonl).toContain('"type":"heading"');
			expect(result.jsonl).toContain('"type":"link"');
		}
		expect(receipt).toEqual(serialized.jsonl);
		expect(original.body).toEqual(encoder.encode(bodySource));
	},
);

it("keeps heading section context from inventing an enclosing link target", () => {
	const tree = loadResearchDocument(response(), {
		tabId: "fixture",
		signal: new AbortController().signal,
		limits: {
			maxNodes: 50000,
			maxDepth: 128,
			maxTextCodeUnits: 2000000,
			maxChanges: 1024,
		},
	});
	trees.push(tree);
	const heading = new DocumentQueries(tree).querySelector("h2");
	if (heading === null) throw new Error("Expected heading");
	const result = extractDocument(tree, { section: tree.reference(heading) });
	expect(result.content).toContain("## Linked title");
	expect(result.content).not.toContain("/story");
});
