import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { findInDocument, renderSnapshotSearch } from "./snapshot-search.js";
import { renderSnapshotEntry, snapshotDocument } from "./snapshot.js";

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

it("searches beyond ten thousand semantic entries without retaining a giant snapshot", () => {
	const tree = fixture(
		`<main><ul>${Array.from(
			{ length: 5500 },
			(_, index) => `<li><a href="/${index}">Row ${index}</a></li>`,
		).join("")}</ul></main>`,
	);
	const result = findInDocument(tree, "Row 5499", { context: 2 });
	expect(result.scannedEntries).toBeGreaterThan(10_000);
	expect(result.matched).toBe(1);
	expect(result.truncated).toBe(false);
	expect(tree.textContent(tree.resolve(result.matches[0].ref).id)).toBe(
		"Row 5499",
	);
	expect(result.matches[0].context.at(-1)?.line).toBe(result.scannedEntries);
});

it("searches beyond one MiB of serialized entries while retaining bounded result context", () => {
	const tree = fixture(
		`<main>${Array.from(
			{ length: 1800 },
			(_, index) =>
				`<button>${"x".repeat(640)}${index === 1799 ? "FINAL_MARKER" : ""}</button>`,
		).join("")}</main>`,
	);
	const result = findInDocument(tree, "FINAL_MARKER", {
		context: 0,
		maxBytes: 2048,
	});
	expect(result.matched).toBe(1);
	expect(result.snapshotTruncated).toBe(false);
	expect(result.matches).toHaveLength(1);
	expect(result.matches[0].context).toHaveLength(1);
	expect(
		new TextEncoder().encode(JSON.stringify(result)).byteLength,
	).toBeLessThanOrEqual(2048);
});

it.each([0, 1, 3, 10])(
	"preserves paths, ordering and overlapping context with a streaming window of %i",
	(context) => {
		const tree = fixture(
			"<main><h1>Head</h1><section><button>same first</button><button>other</button><button>same next</button><article><button>same deep</button></article><button>same last</button></section></main>",
		);
		const snapshot = snapshotDocument(tree, {
			maxBytes: 1_048_576,
			maxEntries: 10_000,
			maxDepth: 256,
			maxStringLength: 4096,
		});
		const lines = snapshot.entries.map(renderSnapshotEntry);
		for (const query of ["same", "button", "Head", "missing"]) {
			const actual = findInDocument(tree, query, { context });
			const expected = snapshot.entries.flatMap((entry, index) => {
				if (!lines[index].includes(query)) return [];
				const path: string[] = [];
				let depth = entry.depth;
				for (let previous = index - 1; previous >= 0; previous--)
					if (snapshot.entries[previous].depth < depth) {
						path.unshift(snapshot.entries[previous].ref);
						depth = snapshot.entries[previous].depth;
					}
				return [
					{
						ref: entry.ref,
						line: index + 1,
						path,
						context: snapshot.entries
							.slice(Math.max(0, index - context), index + context + 1)
							.map((nearby, offset) => ({
								line: Math.max(0, index - context) + offset + 1,
								ref: nearby.ref,
								text: lines[Math.max(0, index - context) + offset],
							})),
					},
				];
			});
			expect(actual.matches).toEqual(expected);
			expect(actual.matched).toBe(expected.length);
			expect(actual.scannedEntries).toBe(snapshot.entries.length);
		}
	},
);

it("continues counting after match/output limits and finalizes tail context at end of input", () => {
	const tree = fixture(
		`<main>${Array.from(
			{ length: 40 },
			(_, index) => `<button>match ${index}</button>`,
		).join("")}</main>`,
	);
	const result = findInDocument(tree, "match", {
		maxResults: 2,
		context: 10,
		maxBytes: 4096,
	});
	expect(result.matched).toBe(40);
	expect(result.matches).toHaveLength(2);
	expect(result.resultsTruncated).toBe(true);
	expect(result.matches[0].context.length).toBeGreaterThan(10);
	const tail = findInDocument(tree, "match 39", { context: 10 });
	expect(tail.matches[0].context).toHaveLength(11);
	expect(tail.matches[0].context.at(-1)?.line).toBe(tail.scannedEntries);
});

it("does not skip an oversized earlier match to return a misleading later prefix", () => {
	const tree = fixture(
		`<main><button>same ${"雪".repeat(500)}</button><button>same small</button></main>`,
	);
	const result = findInDocument(tree, "same", { context: 0, maxBytes: 1024 });
	expect(result.matched).toBe(2);
	expect(result.matches).toEqual([]);
	expect(result.resultsTruncated).toBe(true);
	expect(result.snapshotTruncated).toBe(false);
});

it("fails work exhaustion after early results rather than returning a successful partial count", () => {
	const tree = new DocumentTree("https://example.com/", {
		maxTextCodeUnits: 8_000_000,
	});
	documents.push(tree);
	const main = tree.createElement("main");
	tree.append(tree.root, main);
	for (let index = 0; index < 1600; index++) {
		const button = tree.createElement("button");
		tree.setTextContent(button, `match${"x".repeat(2600)}`);
		tree.append(main, button);
	}
	expect(() =>
		findInDocument(tree, "match", { maxResults: 1, context: 0 }),
	).toThrow("work limit");
});

it("bounds scan ownership before constructing projection caches", () => {
	const tree = new DocumentTree("https://example.com/", { maxNodes: 50_001 });
	documents.push(tree);
	for (let index = 0; index < 50_000; index++) tree.createText("");
	expect(() => findInDocument(tree, "anything")).toThrow("document limit");
});
