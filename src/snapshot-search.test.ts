import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { findInDocument, renderSnapshotSearch } from "./snapshot-search.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(
	source = '<main><h1>Shop</h1><button>Add to cart</button><button>Sign up</button><p>Price $12.34</p><input type="password" value="secret-password"><button hidden>Hidden cart</button></main>',
) {
	const tree = parseHtmlDocument(source, "https://example.com/");
	documents.push(tree);
	return tree;
}
it("finds live snapshot nodes with stable refs, ancestor paths and bounded context", () => {
	const tree = fixture();
	const result = findInDocument(tree, "Add to cart");
	expect(result.matched).toBe(1);
	expect(result.truncated).toBe(false);
	expect(tree.resolve(result.matches[0].ref).tagName).toBe("button");
	expect(result.matches[0].path.length).toBeGreaterThan(0);
	expect(result.matches[0].context.length).toBeLessThanOrEqual(7);
	expect(renderSnapshotSearch(result)).toContain("Add to cart");
});
it("supports common regex searches with flags and price repetition", () => {
	const tree = fixture();
	expect(findInDocument(tree, "/sign (in|up)/i", { regex: true }).matched).toBe(
		1,
	);
	expect(
		findInDocument(tree, "\\$[0-9]+\\.[0-9]{2}", { regex: true }).matched,
	).toBe(1);
	expect(findInDocument(tree, "SIGN UP").matched).toBe(0);
});
it("searches rendered roles and states without exposing protected or hidden content", () => {
	const tree = fixture();
	expect(findInDocument(tree, "button").matched).toBe(2);
	expect(findInDocument(tree, "secret-password").matched).toBe(0);
	expect(findInDocument(tree, "Hidden cart").matched).toBe(0);
});
it("reads mutations without changing document revision", () => {
	const tree = fixture();
	const first = findInDocument(tree, "Add to cart");
	tree.setTextContent(tree.resolve(first.matches[0].ref).id, "Purchased");
	const revision = tree.revision;
	expect(findInDocument(tree, "Add to cart").matched).toBe(0);
	expect(findInDocument(tree, "Purchased").matches[0].ref).toBe(
		first.matches[0].ref,
	);
	expect(tree.revision).toBe(revision);
});
it("limits returned matches while preserving the full scanned match count", () => {
	const tree = fixture(
		"<main><button>same</button><button>same</button><button>same</button></main>",
	);
	const result = findInDocument(tree, "same", { maxResults: 1, context: 0 });
	expect(result.matched).toBe(3);
	expect(result.matches).toHaveLength(1);
	expect(result.resultsTruncated).toBe(true);
	expect(result.matches[0].context).toHaveLength(1);
});
it("enforces the serialized UTF-8 output budget with honest truncation", () => {
	const tree = fixture(
		`<main>${Array.from({ length: 30 }, () => `<button>${"雪".repeat(50)}</button>`).join("")}</main>`,
	);
	const result = findInDocument(tree, "雪", { maxBytes: 1024, context: 0 });
	expect(
		new TextEncoder().encode(JSON.stringify(result)).byteLength,
	).toBeLessThanOrEqual(1024);
	expect(result.matched).toBe(30);
	expect(result.truncated).toBe(true);
	expect(result.matches.length).toBeGreaterThan(0);
});
it("discloses source snapshot truncation even when no matching node was found", () => {
	const result = findInDocument(
		fixture(`<p>${"a".repeat(5000)}tail</p>`),
		"tail",
	);
	expect(result.snapshotTruncated).toBe(true);
	expect(result.truncated).toBe(true);
	expect(result.matched).toBe(0);
});
it("rejects invalid query/options and unsupported regex instead of executing host regex", () => {
	const tree = fixture();
	expect(() => findInDocument(tree, "")).toThrow(/Invalid/);
	expect(() => findInDocument(tree, "x", { maxResults: 0 })).toThrow(/Invalid/);
	expect(() => findInDocument(tree, "x", { context: 11 })).toThrow(/Invalid/);
	expect(() => findInDocument(tree, "(x)\\1", { regex: true })).toThrow(
		/not implemented/,
	);
});
