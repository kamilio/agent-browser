import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
	captureResearchBody,
	decodeResearchBodyCapture,
} from "../scripts/research-body-capture.js";
import { researchRunLimits } from "../scripts/research-browser.js";
import type { DocumentTree } from "./document.js";
import { discoverDocumentHeadings, extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { researchLongDocumentAdmission } from "./research-admission.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	researchReaderLimits,
	researchReaderProfile,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";

const profile = researchLongDocumentAdmission;
const trees: DocumentTree[] = [];

function input(size: number): NetworkResponse {
	const prefix = "<!doctype html><!--";
	const suffix =
		'--><h1>Long document</h1><p>Readable synthetic content.</p><script>PRIVATE_SCRIPT_SENTINEL()</script><h2>Second section</h2><form><input value="PRIVATE_FIELD_SENTINEL"></form>';
	const source =
		prefix + "x".repeat(size - prefix.length - suffix.length) + suffix;
	const body = new TextEncoder().encode(source);
	expect(body.byteLength).toBe(size);
	return {
		url: "https://admission.fixture.invalid/long",
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function context(
	maxTextCodeUnits: number = profile.document.maxTextCodeUnits,
): DocumentLoaderContext {
	return {
		tabId: "synthetic-long-admission",
		signal: new AbortController().signal,
		limits: { ...profile.document, maxTextCodeUnits },
	};
}

function retain(tree: DocumentTree) {
	trees.push(tree);
	return tree;
}

afterEach(() => {
	try {
		for (const tree of trees) {
			tree.close();
			expect(tree.mutationMetrics().closed).toBe(true);
			expect(researchReaderInfo(tree)).toBeUndefined();
		}
	} finally {
		trees.length = 0;
		vi.unstubAllGlobals();
	}
});

it.each([2_000_001, 4_000_000])(
	"captures and loads %s synthetic HTML bytes through actual bounded native headings",
	(size) => {
		const fetch = vi.fn(() => {
			throw new Error("Network must remain unused");
		});
		vi.stubGlobal("fetch", fetch);
		const response = input(size);
		const originalHash = createHash("sha256")
			.update(response.body)
			.digest("hex");
		const capture = captureResearchBody(response.body, "long-v1");
		expect(capture.decodedBytes).toBe(size);
		expect(capture.sha256).toBe(originalHash);
		expect(Object.keys(capture).sort()).toEqual([
			"data",
			"decodedBytes",
			"encoding",
			"sha256",
		]);
		const decoded = decodeResearchBodyCapture(capture, "long-v1");
		const tree = retain(
			loadResearchDocument(
				{ ...response, body: decoded },
				context(),
				"long-v1",
			),
		);
		const revision = tree.revision;
		const outline = discoverDocumentHeadings(tree, profile.headings);
		expect(outline.entries.map((entry) => entry.title)).toEqual([
			"Long document",
			"Second section",
		]);
		expect(outline).toMatchObject({
			method: "heading-outline",
			partial: true,
			truncated: false,
			revision,
		});
		expect(Buffer.byteLength(JSON.stringify(outline))).toBeLessThanOrEqual(
			profile.headings.maxBytes,
		);
		const extracted = extractDocument(tree, {
			maxBytes: profile.headings.maxBytes,
		}).content;
		expect(tree.textContent(tree.root)).toContain(
			"Readable synthetic content.",
		);
		expect(extracted).toContain("Readable synthetic content\\.");
		expect(extracted).not.toContain("PRIVATE_SCRIPT_SENTINEL");
		expect(extracted).not.toContain("PRIVATE_FIELD_SENTINEL");
		expect(researchReaderInfo(tree)).toMatchObject({
			profile: researchReaderProfile,
			partial: true,
			scripting: false,
			styling: false,
			sourceCodeUnits: size,
			omittedSubtrees: { script: 1, input: 1 },
		});
		expect(tree.revision).toBe(revision);
		expect(createHash("sha256").update(response.body).digest("hex")).toBe(
			originalHash,
		);
		expect(fetch).not.toHaveBeenCalled();
	},
);

it("keeps defaults bounded despite prior long admission and response profile hints", () => {
	const response = input(2_000_001);
	response.url += "?document-profile=long-v1";
	response.headers = { ...response.headers, "x-document-profile": ["long-v1"] };
	const tree = retain(loadResearchDocument(response, context(), "long-v1"));
	expect(discoverDocumentHeadings(tree).entries).toHaveLength(2);
	for (const selected of [undefined, "default"] as const) {
		expect(() => captureResearchBody(response.body, selected)).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
		let failure: unknown;
		try {
			retain(loadResearchDocument(response, context(), selected));
		} catch (error) {
			failure = error;
		}
		expect(resourceLimitDiagnostic(failure)).toEqual({
			kind: "reader.decoded",
			unit: "code-units",
			limit: 2_000_000,
			observed: 2_000_001,
		});
	}
	expect(researchRunLimits.network.maxResponseBytes).toBe(2_000_000);
	expect(researchReaderLimits.maxSourceCodeUnits).toBe(2_000_000);
});

it("preserves default exact-boundary heading behavior", () => {
	const response = input(2_000_000);
	const capture = captureResearchBody(response.body);
	const tree = retain(
		loadResearchDocument(
			{ ...response, body: decodeResearchBodyCapture(capture) },
			context(2_000_000),
		),
	);
	expect(
		discoverDocumentHeadings(tree).entries.map((entry) => entry.title),
	).toEqual(["Long document", "Second section"]);
	expect(researchReaderInfo(tree)?.sourceCodeUnits).toBe(2_000_000);
});

it("does not widen caller tree limits or independent heading output limits", () => {
	const response = input(2_000_001);
	const caller = context(2_000_000);
	const before = JSON.stringify(caller.limits);
	expect(() => loadResearchDocument(response, caller, "long-v1")).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(JSON.stringify(caller.limits)).toBe(before);
	const tree = retain(loadResearchDocument(response, context(), "long-v1"));
	const outline = discoverDocumentHeadings(tree, {
		...profile.headings,
		maxEntries: 1,
	});
	expect(outline.entries).toHaveLength(1);
	expect(outline.truncated).toBe(true);
	expect(() =>
		discoverDocumentHeadings(tree, { ...profile.headings, maxNodes: 50_001 }),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
