import { expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { htmlParseInfo } from "./html-info.js";
import type { NetworkResponse } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import { documentStyles } from "./styles.js";

const context: DocumentLoaderContext = {
	tabId: "test",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
function response(text: string, type = "text/html"): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url: "https://example.com/",
		status: 200,
		headers: { "content-type": [type] },
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 0,
	};
}

it("loads explicit HTML through the parser while text and JSON remain literal", async () => {
	for (const type of [
		"text/html",
		"text/plain",
		"application/json",
		"application/problem+json",
	]) {
		const tree = await loadBrowserDocument(
			response("<p>Hello</p>", type),
			context,
		);
		expect(new DocumentQueries(tree).querySelector("p") !== null).toBe(
			type === "text/html",
		);
		expect(!!htmlParseInfo(tree)).toBe(type === "text/html");
		tree.close();
	}
});

it("does not retrieve missing or empty stylesheet hrefs", async () => {
	let requests = 0;
	const tree = await loadBrowserDocument(
		response(
			'<link rel=stylesheet><link rel=stylesheet href=" "><p>Content</p>',
		),
		{
			...context,
			fetchStylesheet: async () => {
				requests++;
				return response("p{display:none}", "text/css");
			},
		},
	);
	expect(requests).toBe(0);
	expect(documentStyles(tree).metrics().issues["stylesheet-missing-href"]).toBe(
		2,
	);
	tree.close();
});

it("discloses when a caller has not supplied a stylesheet transport", async () => {
	const tree = await loadBrowserDocument(
		response("<link rel=stylesheet href=/sheet.css><p>Content</p>"),
		context,
	);
	expect(
		documentStyles(tree).metrics().issues["stylesheet-fetch-unavailable"],
	).toBe(1);
	tree.close();
});

it.each([
	'<meta charset="utf-8">',
	'<meta content="text/html; charset=utf-8" http-equiv="Content-Type">',
	'<meta charset="utf-16">',
])("prescans supported HTML metadata encoding: %s", async (meta) => {
	const tree = await loadBrowserDocument(
		response(`${meta}<p>日本語 £</p>`),
		context,
	);
	expect(tree.textContent(tree.root)).toContain("日本語 £");
	expect(htmlParseInfo(tree)?.encoding).toBe("utf-8");
});

it("honors HTTP charset over meta, and BOM over HTTP", async () => {
	const header = response(
		"<meta charset=utf-8><p>£</p>",
		"text/html; charset=windows-1252",
	);
	const fromHeader = await loadBrowserDocument(header, context);
	expect(fromHeader.textContent(fromHeader.root)).toContain("Â£");
	expect(htmlParseInfo(fromHeader)?.encoding).toBe("windows-1252");
	header.body = new Uint8Array([0xef, 0xbb, 0xbf, ...header.body]);
	const fromBom = await loadBrowserDocument(header, context);
	expect(fromBom.textContent(fromBom.root)).toContain("£");
	expect(fromBom.textContent(fromBom.root)).not.toContain("Â");
	expect(htmlParseInfo(fromBom)?.encoding).toBe("utf-8");
});

it("uses windows-1252 fallback without treating commented metadata as a declaration", async () => {
	const input = response("<!--<meta charset=utf-8>--><p>");
	input.body = new Uint8Array([...input.body, 0x80]);
	const tree = await loadBrowserDocument(input, context);
	expect(htmlParseInfo(tree)?.encoding).toBe("windows-1252");
	expect(tree.textContent(tree.root)).toContain("€");
});

it("does not allow metadata beyond the prescan window to silently change decoding", async () => {
	const tree = await loadBrowserDocument(
		response(`${" ".repeat(1024)}<meta charset=utf-8><p>£</p>`),
		context,
	);
	expect(htmlParseInfo(tree)?.encoding).toBe("windows-1252");
});

it.each([
	"application/xhtml+xml",
	"image/svg+xml",
	"application/javascript",
	"application/octet-stream",
])("rejects executable/unsupported MIME %s", async (type) => {
	await expect(
		loadBrowserDocument(response("<p>x", type), context),
	).rejects.toThrow("supports plain text");
});

it("refuses missing MIME, oversized input and canceled loads", async () => {
	const missing = response("<p>x");
	missing.headers = {};
	await expect(loadBrowserDocument(missing, context)).rejects.toThrow(
		"explicit Content-Type",
	);
	await expect(
		loadBrowserDocument(response("x".repeat(20)), {
			...context,
			limits: { ...context.limits, maxTextCodeUnits: 1 },
		}),
	).rejects.toThrow("Encoded HTML");
	await expect(
		loadBrowserDocument(response("<p>x"), {
			...context,
			signal: AbortSignal.abort(),
		}),
	).rejects.toThrow("aborted");
});
