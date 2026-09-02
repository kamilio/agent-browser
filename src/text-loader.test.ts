import { expect, it } from "vitest";
import type { NetworkResponse } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import { snapshotDocument } from "./snapshot.js";
import { loadTextDocument } from "./text-loader.js";

function response(
	type = "text/plain",
	body = new TextEncoder().encode("<script>not executable</script>"),
): NetworkResponse {
	return {
		url: "https://example.com/text",
		headers: { "content-type": [type] },
		status: 200,
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 1,
	};
}

function context(maxTextCodeUnits = 2_000_000): DocumentLoaderContext {
	return {
		signal: new AbortController().signal,
		tabId: "tab-1",
		limits: {
			maxNodes: 50_000,
			maxTextCodeUnits,
			maxDepth: 256,
			maxChanges: 1024,
		},
	};
}

it.each([
	"text/plain",
	"TEXT/PLAIN; charset=UTF-8",
	"application/json",
	"application/problem+json",
])("loads %s as literal text, never executable markup", (type) => {
	const tree = loadTextDocument(response(type), context());
	try {
		const queries = new DocumentQueries(tree);
		expect(queries.querySelector("script")).toBeNull();
		const pre = queries.querySelector("pre");
		if (pre === null) throw new Error("Missing text document pre");
		expect(tree.textContent(pre)).toBe("<script>not executable</script>");
		expect(JSON.stringify(snapshotDocument(tree))).toContain("not executable");
	} finally {
		tree.close();
	}
});

it.each([
	"text/html",
	"application/xhtml+xml",
	"application/javascript",
	"text/css",
	"application/octet-stream",
	"image/svg+xml",
])("explicitly rejects unsupported MIME %s", (type) => {
	expect(() => loadTextDocument(response(type), context())).toThrow("not HTML");
});

it("rejects missing or ambiguous Content-Type rather than guessing HTML safe", () => {
	const input = response();
	input.headers = {};
	expect(() => loadTextDocument(input, context())).toThrow(
		"one explicit Content-Type",
	);
	input.headers = { "content-type": ["text/plain", "text/html"] };
	expect(() => loadTextDocument(input, context())).toThrow(
		"one explicit Content-Type",
	);
});

it("decodes supported charsets and honors the document budget including structural text", () => {
	const tree = loadTextDocument(
		response("text/plain; charset=windows-1252", new Uint8Array([128])),
		context(),
	);
	expect(tree.textContent(tree.root)).toBe("€");
	tree.close();
	const options = context(5);
	expect(() =>
		loadTextDocument(
			response("text/plain", new TextEncoder().encode("abc")),
			options,
		),
	).toThrow("limit");
});

it("rejects aborted loads and oversized encoded text before constructing a document", () => {
	const controller = new AbortController();
	controller.abort();
	expect(() =>
		loadTextDocument(response(), { ...context(), signal: controller.signal }),
	).toThrow("aborted");
	const options = context(1);
	expect(() => loadTextDocument(response(), options)).toThrow(
		"Encoded text document limit",
	);
});
