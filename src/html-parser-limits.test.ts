import { expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument, parseHtmlDocumentAsync } from "./html-parser.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import {
	type ResourceLimitDiagnostic,
	resourceLimitDiagnostic,
} from "./resource-limit.js";

const url = "https://example.com/";

function captureError(operation: () => unknown): unknown {
	try {
		operation();
	} catch (error) {
		return error;
	}
	throw new Error("Expected operation to fail");
}

function expectLimit(
	error: unknown,
	message: string,
	diagnostic: ResourceLimitDiagnostic,
) {
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect(error).toMatchObject({
		name: "AgentBrowserError",
		code: "resource-limit",
		message,
	});
	expect(resourceLimitDiagnostic(error)).toEqual(diagnostic);
	expect(error).not.toHaveProperty("kind");
	expect(error).not.toHaveProperty("unit");
	expect(error).not.toHaveProperty("limit");
	expect(error).not.toHaveProperty("observed");
}

it("measures original source code units before normalization and initialization", () => {
	const source = `${"\r\n".repeat(8)}😀`;
	let initialized = false;
	const error = captureError(() =>
		parseHtmlDocument(source, url, {
			limits: { maxTextCodeUnits: 17 },
			initializeDocument() {
				initialized = true;
			},
		}),
	);
	expectLimit(error, "HTML source text limit exceeded", {
		kind: "html.source",
		unit: "code-units",
		limit: 17,
		observed: 18,
	});
	expect(initialized).toBe(false);
	const tree = parseHtmlDocument(source, url, {
		limits: { maxTextCodeUnits: 18 },
	});
	expect(tree.textContent(tree.root)).toBe("😀");
	tree.close();
});

it("counts duplicate attributes as attempts without changing the accepted boundary", () => {
	const accepted = new HtmlTokenizer(`<p${" title=x".repeat(1024)}>`, () => {});
	expect(accepted.next()).toMatchObject({
		kind: "start",
		name: "p",
		attributes: { title: "x" },
	});
	const rejected = new HtmlTokenizer(`<p${" title=x".repeat(1025)}>`, () => {});
	expectLimit(
		captureError(() => rejected.next()),
		"HTML attributes per token limit exceeded",
		{
			kind: "html.attributes",
			unit: "attributes",
			limit: 1024,
			observed: 1025,
		},
	);
});

it("counts ignored tokens and closes the tree after token overflow", () => {
	const source = `<body>${"</missing>".repeat(31)}`;
	const tree = parseHtmlDocument(source, url, { limits: { maxNodes: 4 } });
	tree.close();
	let failedTree: DocumentTree | undefined;
	const error = captureError(() =>
		parseHtmlDocument(`${source}</missing>`, url, {
			limits: { maxNodes: 4 },
			initializeDocument(document) {
				failedTree = document;
			},
		}),
	);
	expectLimit(error, "HTML token limit exceeded", {
		kind: "html.tokens",
		unit: "tokens",
		limit: 32,
		observed: 33,
	});
	expect(failedTree).toBeDefined();
	const closedTree = failedTree;
	if (!closedTree) throw new Error("Expected initialized tree");
	expect(captureError(() => closedTree.get(closedTree.root))).toMatchObject({
		code: "closed",
	});
});

it("preserves write-count priority, sticky error identity and cleanup", async () => {
	const source = "<script></script>";
	let failedTree: DocumentTree | undefined;
	let caught: unknown;
	let accepted = 0;
	const error = await parseHtmlDocumentAsync(
		source,
		url,
		{ limits: { maxTextCodeUnits: source.length } },
		{
			start(document) {
				failedTree = document;
			},
			async finish() {},
			async script(_document, _id, context) {
				for (let index = 0; index < 256; index++) {
					context.write("");
					accepted++;
				}
				caught = captureError(() => context.write("x"));
				expect(captureError(() => context.write(""))).toBe(caught);
			},
		},
	).catch((failure: unknown) => failure);
	expect(accepted).toBe(256);
	expect(error).toBe(caught);
	expectLimit(error, "Document write input limit exceeded", {
		kind: "html.writes",
		unit: "writes",
		limit: 256,
		observed: 257,
	});
	expect(failedTree).toBeDefined();
	const closedTree = failedTree;
	if (!closedTree) throw new Error("Expected initialized tree");
	expect(captureError(() => closedTree.get(closedTree.root))).toMatchObject({
		code: "closed",
	});
});

it("measures cumulative unnormalized written source before insertion", async () => {
	const source = "<script></script>";
	let accepted = false;
	const error = await parseHtmlDocumentAsync(
		source,
		url,
		{ limits: { maxTextCodeUnits: source.length + 4 } },
		{
			start() {},
			async finish() {},
			async script(_document, _id, context) {
				context.write("\r\n😀");
				accepted = true;
				context.write("x");
			},
		},
	).catch((failure: unknown) => failure);
	expect(accepted).toBe(true);
	expectLimit(error, "Document write input limit exceeded", {
		kind: "html.write-source",
		unit: "code-units",
		limit: source.length + 4,
		observed: source.length + 5,
	});
});

it("measures repeated bounded tokenization work without exceeding source or write limits", async () => {
	const source = "<script></script>";
	const partial = `<!--${"x".repeat(100)}`;
	let accepted = 0;
	const error = await parseHtmlDocumentAsync(
		source,
		url,
		{ limits: { maxTextCodeUnits: 256 } },
		{
			start() {},
			async finish() {},
			async script(_document, _id, context) {
				context.write(partial);
				accepted++;
				for (let index = 0; index < 20; index++) {
					context.write("");
					accepted++;
				}
			},
		},
	).catch((failure: unknown) => failure);
	expect(accepted).toBe(19);
	expectLimit(error, "HTML input work limit exceeded", {
		kind: "html.work",
		unit: "code-units",
		limit: 2048,
		observed: source.length + partial.length * 20,
	});
});

it("keeps abort precedence and non-resource failures unannotated", () => {
	const controller = new AbortController();
	controller.abort();
	const error = captureError(() =>
		parseHtmlDocument("too long", url, {
			limits: { maxTextCodeUnits: 1 },
			signal: controller.signal,
		}),
	);
	expect(error).toMatchObject({
		code: "aborted",
		message: "HTML parsing aborted",
	});
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
	const tokenizer = new HtmlTokenizer('<p "bad>', () => {});
	const malformed = captureError(() => tokenizer.next());
	expect(malformed).toMatchObject({
		code: "unsupported",
		message: "Malformed HTML attribute name is not implemented",
	});
	expect(resourceLimitDiagnostic(malformed)).toBeUndefined();
});
