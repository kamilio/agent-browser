import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type ExtractionPageOptions,
	extractDocumentPage,
} from "./extraction-page.js";
import * as extraction from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const url = "https://extraction-page.fixture.invalid/article";
const encoder = new TextEncoder();

function fixture(source: string) {
	const tree = parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function references(tree: DocumentTree, selector: string) {
	const queries = new DocumentQueries(tree);
	try {
		return queries.querySelectorAll(selector).map((id) => tree.reference(id));
	} finally {
		queries.close();
	}
}

function cursor(tree: DocumentTree, selector: string, start: number) {
	return JSON.stringify([
		1,
		tree.reference(tree.root),
		tree.revision,
		selector,
		start,
	]);
}

function bytes(value: unknown) {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

it.each(["markdown", "json"] as const)(
	"reconstructs DOM-order %s extraction without gaps or duplicates",
	(format) => {
		const tree = fixture(
			'<p class="entry" id="third">First café 中文 😀</p><p class="entry" id="first">Second &amp; preserved</p><p class="entry" id="second">Third body</p><p class="entry">Fourth body</p><p class="entry">Fifth body</p>',
		);
		const selector = "#second, .entry, #third";
		const roots = references(tree, selector);
		const expected = roots.map((root) =>
			extraction.extractDocument(tree, { root, format }),
		);
		const entries: extraction.DocumentExtraction[] = [];
		let nextCursor: string | undefined;
		for (let start = 0; start < roots.length; start += 2) {
			const page = extractDocumentPage(tree, selector, {
				format,
				limit: 2,
				cursor: nextCursor,
			});
			expect(page).toMatchObject({
				method: "selector-extraction-page-v1",
				document: tree.reference(tree.root),
				revision: tree.revision,
				selector,
				start,
				totalMatches: roots.length,
				partial: true,
			});
			expect(page.entries).toEqual(expected.slice(start, start + 2));
			entries.push(...page.entries);
			const end = start + page.entries.length;
			expect(page.selectionExhausted).toBe(end === roots.length);
			expect(page.nextCursor).toBe(
				end === roots.length ? null : cursor(tree, selector, end),
			);
			nextCursor = page.nextCursor ?? undefined;
		}
		expect(entries).toEqual(expected);
		expect(new Set(entries.map((entry) => entry.scope)).size).toBe(
			roots.length,
		);
		expect(JSON.stringify(entries)).toContain("First café 中文 😀");
		expect(JSON.stringify(entries)).toContain(
			format === "markdown" ? "Second &amp; preserved" : "Second & preserved",
		);
	},
);

it("preserves whitespace and escaped Unicode text using existing extraction", () => {
	const source =
		'  café 中文 😀\n\tquotes " and slash \\ and controls \u0001\n';
	const tree = fixture(`<pre>${source}</pre>`);
	const page = extractDocumentPage(tree, "pre");
	expect(page.entries[0].content).toContain(source.replace("\u0001", "\\u{1}"));
	expect(page.entries[0]).toEqual(
		extraction.extractDocument(tree, { root: references(tree, "pre")[0] }),
	);
});

it("keeps nested matching scopes separate", () => {
	const tree = fixture(
		'<div class="entry">Outer <div class="entry">Inner</div></div>',
	);
	const roots = references(tree, ".entry");
	const first = extractDocumentPage(tree, ".entry", { limit: 1 });
	expect(first.entries[0].scope).toBe(roots[0]);
	expect(first.entries[0].content).toContain("Outer");
	expect(first.entries[0].content).toContain("Inner");
	const second = extractDocumentPage(tree, ".entry", {
		cursor: first.nextCursor ?? undefined,
	});
	expect(second.entries[0].scope).toBe(roots[1]);
	expect(second.entries[0].content).toBe("Inner\n");
	expect(second.selectionExhausted).toBe(true);
});

it("returns terminal empty selections including a cursor at the end", () => {
	const tree = fixture("<p>Body not selected</p>");
	expect(extractDocumentPage(tree, ".absent")).toMatchObject({
		start: 0,
		totalMatches: 0,
		entries: [],
		nextCursor: null,
		selectionExhausted: true,
		partial: true,
	});
	expect(
		extractDocumentPage(tree, ".absent", {
			cursor: cursor(tree, ".absent", 0),
		}).entries,
	).toEqual([]);
	expect(
		extractDocumentPage(tree, "p", { cursor: cursor(tree, "p", 1) }),
	).toMatchObject({
		start: 1,
		totalMatches: 1,
		entries: [],
		nextCursor: null,
		selectionExhausted: true,
	});
});

it("defaults to twenty items and accepts the one-hundred-item ceiling", () => {
	const tree = fixture("<p>Body</p>".repeat(101));
	expect(extractDocumentPage(tree, "p").entries).toHaveLength(20);
	const page = extractDocumentPage(tree, "p", { limit: 100 });
	expect(page.entries).toHaveLength(100);
	expect(page.nextCursor).toBe(cursor(tree, "p", 100));
});

it("enforces the default page byte ceiling independently of the item limit", () => {
	const tree = fixture(`<p>${"body ".repeat(1200)}</p>`.repeat(60));
	const page = extractDocumentPage(tree, "p", { limit: 100 });
	expect(page).toEqual(
		extractDocumentPage(tree, "p", { limit: 100, maxBytes: 256_000 }),
	);
	expect(bytes(page)).toBeLessThanOrEqual(256_000);
	expect(page.entries.length).toBeGreaterThan(0);
	expect(page.entries.length).toBeLessThan(60);
	expect(page.nextCursor).toBe(cursor(tree, "p", page.entries.length));
});

it("accepts inclusive minimum limits on an empty element", () => {
	const tree = fixture("<div></div>");
	const page = extractDocumentPage(tree, "div", {
		limit: 1,
		maxBytes: 1024,
		itemMaxBytes: 256,
		maxNodes: 1,
		maxDepth: 0,
	});
	expect(page.entries).toHaveLength(1);
	expect(page.selectionExhausted).toBe(true);
});

it("passes bounded per-item defaults and explicit limits with reference roots", () => {
	const tree = fixture("<p>Body</p>");
	const root = references(tree, "p")[0];
	const extract = vi.spyOn(extraction, "extractDocument");
	extractDocumentPage(tree, "p");
	expect(extract).toHaveBeenLastCalledWith(tree, {
		root,
		format: "markdown",
		maxBytes: 65_536,
		maxNodes: 10_000,
		maxDepth: 128,
		tableRows: undefined,
		compactTables: undefined,
	});
	extractDocumentPage(tree, "p", { maxBytes: 1024 });
	expect(extract).toHaveBeenLastCalledWith(
		tree,
		expect.objectContaining({ maxBytes: 1024 }),
	);
	extractDocumentPage(tree, "p", {
		maxBytes: 1_048_576,
		itemMaxBytes: 1_048_576,
		maxNodes: 50_000,
		maxDepth: 1024,
	});
	expect(extract).toHaveBeenLastCalledWith(
		tree,
		expect.objectContaining({
			maxBytes: 1_048_576,
			maxNodes: 50_000,
			maxDepth: 1024,
		}),
	);
});

it.each([
	["limit", 1, 100],
	["maxBytes", 1024, 1_048_576],
	["itemMaxBytes", 256, 256_000],
	["maxNodes", 1, 50_000],
	["maxDepth", 0, 1024],
] as const)(
	"validates strict %s bounds before querying",
	(name, minimum, maximum) => {
		const tree = fixture("<p>Body</p>");
		const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
		for (const value of [
			minimum - 1,
			maximum + 1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
			"1",
			true,
			null,
			[],
			{},
		]) {
			expect(() =>
				extractDocumentPage(tree, "p", {
					[name]: value,
				} as ExtractionPageOptions),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
		expect(query).not.toHaveBeenCalled();
	},
);

it("rejects an item budget larger than the page budget before querying", () => {
	const tree = fixture("<p>Body</p>");
	const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
	expect(() =>
		extractDocumentPage(tree, "p", { maxBytes: 1024, itemMaxBytes: 1025 }),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	expect(query).not.toHaveBeenCalled();
});

it.each(
	[undefined, null, 1, {}, [], "", " \t\n", "x".repeat(4097)].map(
		(selector) => ({ selector }),
	),
)("rejects invalid selectors before querying: $selector", ({ selector }) => {
	const tree = fixture("<p>Body</p>");
	const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
	expect(() => extractDocumentPage(tree, selector as string)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(query).not.toHaveBeenCalled();
});

it("accepts selectors at the UTF-16 length ceiling without rewriting them", () => {
	const tree = fixture("<p>Body</p>");
	const selector = `p${" ".repeat(4095)}`;
	const page = extractDocumentPage(tree, selector);
	expect(page.selector).toBe(selector);
	expect(page.entries).toHaveLength(1);
});

it.each([null, 1, "options", []].map((options) => ({ options })))(
	"rejects invalid option containers: $options",
	({ options }) => {
		const tree = fixture("<p>Body</p>");
		const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
		expect(() =>
			extractDocumentPage(tree, "p", options as ExtractionPageOptions),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(query).not.toHaveBeenCalled();
	},
);

it.each(["text", "", null, 1, false])(
	"rejects unsupported formats before querying: %j",
	(format) => {
		const tree = fixture("<p>Body</p>");
		const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
		expect(() =>
			extractDocumentPage(tree, "p", { format: format as "markdown" }),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
		expect(query).not.toHaveBeenCalled();
	},
);

it.each(["tableRows", "compactTables"] as const)(
	"validates %s before querying even for empty matches",
	(name) => {
		const tree = fixture("<p>Body</p>");
		const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
		for (const value of ["true", 1, null, [], {}]) {
			expect(() =>
				extractDocumentPage(tree, ".absent", {
					[name]: value,
				} as ExtractionPageOptions),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
		expect(() =>
			extractDocumentPage(tree, ".absent", { format: "json", [name]: true }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(query).not.toHaveBeenCalled();
	},
);

it.each([
	{ tableRows: true },
	{ compactTables: true },
	{ tableRows: true, compactTables: true },
	{ format: "json" as const, tableRows: false, compactTables: false },
])("preserves existing table options: %j", (options) => {
	const tree = fixture("<table><tr><td>First</td><td>Second</td></tr></table>");
	const root = references(tree, "table")[0];
	expect(extractDocumentPage(tree, "table", options).entries).toEqual([
		extraction.extractDocument(tree, { root, ...options }),
	]);
});

it("rejects malformed, noncanonical and wrong-selector cursors before querying", () => {
	const tree = fixture("<p>Body</p>");
	const valid = [1, tree.reference(tree.root), tree.revision, "p", 0];
	const malformed: unknown[] = [
		"",
		"not json",
		"x".repeat(32_769),
		null,
		1,
		[],
		{},
		"null",
		"{}",
		"[]",
		JSON.stringify(valid.slice(0, 4)),
		JSON.stringify([...valid, 0]),
		` ${JSON.stringify(valid)}`,
		JSON.stringify(valid).replace(",0]", ",-0]"),
		JSON.stringify(valid).replace(",0]", ",0.0]"),
		JSON.stringify(valid).replace('"p"', '"\\u0070"'),
	];
	for (const [index, values] of [
		[0, [0, 2, "1", null]],
		[1, [null, 1, "", "document", "e0", "e01", "e9007199254740992"]],
		[2, [-1, 0.5, "0", null, Number.MAX_SAFE_INTEGER + 1]],
		[3, [null, 1, "div", " p"]],
		[4, [-1, 0.5, "0", null, Number.MAX_SAFE_INTEGER + 1]],
	] as const) {
		for (const value of values) {
			const changed: unknown[] = [...valid];
			changed[index] = value;
			malformed.push(JSON.stringify(changed));
		}
	}
	const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
	for (const value of malformed) {
		expect(() =>
			extractDocumentPage(tree, "p", { cursor: value as string }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	}
	expect(query).not.toHaveBeenCalled();
});

it("binds cursors to the exact untrimmed selector and its match range", () => {
	const tree = fixture("<p>Body</p><p>Next</p>");
	const first = extractDocumentPage(tree, " p ", { limit: 1 });
	expect(first.nextCursor).toBe(cursor(tree, " p ", 1));
	expect(() =>
		extractDocumentPage(tree, "p", {
			cursor: first.nextCursor ?? undefined,
		}),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
	for (const start of [3, Number.MAX_SAFE_INTEGER]) {
		expect(() =>
			extractDocumentPage(tree, "p", { cursor: cursor(tree, "p", start) }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	}
});

it("rejects document and revision mismatches before querying", () => {
	const tree = fixture("<p>Body</p>");
	const other = fixture("<p>Body</p>");
	const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
	for (const value of [
		cursor(other, "p", 0),
		JSON.stringify([1, tree.reference(tree.root), tree.revision + 1, "p", 0]),
	]) {
		expect(() => extractDocumentPage(tree, "p", { cursor: value })).toThrow(
			expect.objectContaining({ code: "stale-reference" }),
		);
	}
	expect(query).not.toHaveBeenCalled();
});

it.each([
	"text",
	"attribute",
	"append",
	"remove",
	"focus",
	"pointer",
	"target",
])("invalidates continuation after a %s mutation", (mutation) => {
	const tree = fixture('<p tabindex="0">First</p><p>Second</p>');
	const root = tree.resolve(references(tree, "p")[0]).id;
	const first = extractDocumentPage(tree, "p", { limit: 1 });
	if (mutation === "text") tree.setTextContent(root, "Changed");
	if (mutation === "attribute") tree.setAttribute(root, "class", "changed");
	if (mutation === "append") tree.append(root, tree.createElement("span"));
	if (mutation === "remove") tree.remove(root);
	if (mutation === "focus") tree.setActiveElement(root);
	if (mutation === "pointer") tree.setPointerState(root, null);
	if (mutation === "target") tree.setTargetElement(root);
	expect(tree.revision).toBeGreaterThan(first.revision);
	expect(() =>
		extractDocumentPage(tree, "p", {
			cursor: first.nextCursor ?? undefined,
		}),
	).toThrow(expect.objectContaining({ code: "stale-reference" }));
});

it("rejects closed documents with and without a cursor", () => {
	const tree = fixture("<p>Body</p>");
	const value = cursor(tree, "p", 0);
	tree.close();
	for (const nextCursor of [undefined, value]) {
		expect(() =>
			extractDocumentPage(tree, "p", { cursor: nextCursor }),
		).toThrow(expect.objectContaining({ code: "closed" }));
	}
});

it.each(["markdown", "json"] as const)(
	"fits the exact entire UTF-8 %s page boundary",
	(format) => {
		const tree = fixture("<pre></pre>");
		const root = tree.resolve(references(tree, "pre")[0]).id;
		tree.setTextContent(
			root,
			'café 中文 😀 " \\ \u0001 \ud800 \udfff '.repeat(80),
		);
		const expected = extractDocumentPage(tree, "pre", { format });
		const maxBytes = bytes(expected);
		expect(maxBytes).toBeGreaterThan(1024);
		expect(maxBytes).toBeGreaterThan(JSON.stringify(expected).length);
		expect(extractDocumentPage(tree, "pre", { format, maxBytes })).toEqual(
			expected,
		);
		expect(() =>
			extractDocumentPage(tree, "pre", { format, maxBytes: maxBytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it.each(["markdown", "json"] as const)(
	"accounts for commas and cursor metadata while paging %s by bytes",
	(format) => {
		const tree = fixture(`<p>${"中文 😀 café ".repeat(60)}</p>`.repeat(12));
		const expected = extractDocumentPage(tree, "p", { format });
		const pair = extractDocumentPage(tree, "p", { format, limit: 2 });
		const maxBytes = bytes(pair);
		expect(extractDocumentPage(tree, "p", { format, maxBytes })).toEqual(pair);
		const smaller = extractDocumentPage(tree, "p", {
			format,
			maxBytes: maxBytes - 1,
		});
		expect(smaller.entries).toEqual(pair.entries.slice(0, 1));
		expect(smaller.nextCursor).toBe(cursor(tree, "p", 1));
		const entries: extraction.DocumentExtraction[] = [];
		let nextCursor: string | undefined;
		for (let attempt = 0; attempt < expected.entries.length; attempt++) {
			const page = extractDocumentPage(tree, "p", {
				format,
				maxBytes,
				cursor: nextCursor,
			});
			expect(bytes(page)).toBeLessThanOrEqual(maxBytes);
			expect(page.start).toBe(entries.length);
			expect(page.entries.length).toBeGreaterThan(0);
			entries.push(...page.entries);
			if (page.nextCursor === null) {
				expect(page.selectionExhausted).toBe(true);
				break;
			}
			nextCursor = page.nextCursor;
		}
		expect(entries).toEqual(expected.entries);
	},
);

it("budgets escaped selectors in empty envelopes at the exact boundary", () => {
	const tree = fixture("<p>Body</p>");
	const selector = `[data-name='${"😀".repeat(300)}']`;
	const expected = extractDocumentPage(tree, selector);
	const maxBytes = bytes(expected);
	expect(maxBytes).toBeGreaterThan(1024);
	expect(extractDocumentPage(tree, selector, { maxBytes })).toEqual(expected);
	expect(() =>
		extractDocumentPage(tree, selector, { maxBytes: maxBytes - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("rejects an oversized nonterminal envelope before extracting", () => {
	const tree = fixture('<p data-name="value">Body</p>');
	const selector = `p${" ".repeat(1500)}`;
	const extract = vi.spyOn(extraction, "extractDocument");
	expect(() => extractDocumentPage(tree, selector, { maxBytes: 1024 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(extract).not.toHaveBeenCalled();
});

it("never returns an empty nonterminal page when the first entry cannot fit", () => {
	const tree = fixture(`<p>${"first ".repeat(200)}</p><p>Second</p>`);
	const first = extractDocumentPage(tree, "p", { limit: 1 });
	const maxBytes = bytes(first) - 1;
	expect(bytes(first.entries[0])).toBeLessThan(maxBytes);
	expect(() => extractDocumentPage(tree, "p", { maxBytes })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([{ itemMaxBytes: 256 }, { maxNodes: 1 }, { maxDepth: 0 }])(
	"propagates individual extraction limits: %j",
	(options) => {
		const tree = fixture(`<div><p>${"Body ".repeat(100)}</p></div>`);
		const root = references(tree, "div")[0];
		let expected: unknown;
		try {
			extraction.extractDocument(tree, {
				root,
				...options,
				maxBytes: "itemMaxBytes" in options ? options.itemMaxBytes : undefined,
			});
		} catch (error) {
			expected = error;
		}
		expect(expected).toBeInstanceOf(AgentBrowserError);
		try {
			extractDocumentPage(tree, "div", options);
			throw new Error("Expected the extraction limit to propagate");
		} catch (error) {
			expect(error).toEqual(expected);
			expect(resourceLimitDiagnostic(error)).toEqual(
				resourceLimitDiagnostic(expected),
			);
		}
	},
);

it("propagates the exact error from a later entry without returning a partial page", () => {
	const tree = fixture("<p>First</p><p>Second</p><p>Third</p>");
	const original = extraction.extractDocument;
	const failure = new AgentBrowserError(
		"unsupported",
		"Synthetic extraction failure",
	);
	const extract = vi
		.spyOn(extraction, "extractDocument")
		.mockImplementationOnce(original)
		.mockImplementationOnce(() => {
			throw failure;
		});
	let caught: unknown;
	try {
		extractDocumentPage(tree, "p");
	} catch (error) {
		caught = error;
	}
	expect(caught).toBe(failure);
	expect(extract).toHaveBeenCalledTimes(2);
});

it("preserves document state and revision across repeated pages", () => {
	const tree = fixture('<p>First</p><p>Second</p><input value="untouched">');
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	const usage = tree.resourceUsage();
	const mutations = tree.mutationMetrics();
	for (let index = 0; index < 40; index++) {
		const first = extractDocumentPage(tree, "p", { limit: 1 });
		extractDocumentPage(tree, "p", { cursor: first.nextCursor ?? undefined });
	}
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree, tree.root)).toBe(source);
	expect(tree.resourceUsage()).toEqual(usage);
	expect(tree.mutationMetrics()).toEqual(mutations);
});

it.each([
	"success",
	"empty",
	"syntax",
	"range",
	"envelope",
	"entry",
	"extraction",
	"query",
])("closes its query on %s", (outcome) => {
	const tree = fixture(`<p>${"Body ".repeat(250)}</p>`);
	const close = vi.spyOn(DocumentQueries.prototype, "close");
	const options: ExtractionPageOptions = {};
	let selector = "p";
	if (outcome === "empty") selector = ".absent";
	if (outcome === "syntax") selector = "[";
	if (outcome === "range") options.cursor = cursor(tree, selector, 2);
	if (outcome === "envelope") {
		selector = `p${" ".repeat(1500)}`;
		options.maxBytes = 1024;
	}
	if (outcome === "entry") {
		const expected = extractDocumentPage(tree, selector);
		options.maxBytes = bytes(expected) - 1;
		close.mockClear();
	}
	if (outcome === "extraction") options.maxNodes = 1;
	if (outcome === "query") {
		vi.spyOn(DocumentQueries.prototype, "querySelectorAll").mockImplementation(
			() => {
				throw new AgentBrowserError("resource-limit", "Synthetic query limit");
			},
		);
	}
	if (outcome === "success" || outcome === "empty") {
		extractDocumentPage(tree, selector, options);
	} else {
		expect(() => extractDocumentPage(tree, selector, options)).toThrow(
			AgentBrowserError,
		);
	}
	expect(close).toHaveBeenCalled();
	for (const query of close.mock.contexts) {
		if (!(query instanceof DocumentQueries))
			throw new Error("Expected a document query receiver");
		expect(query.metrics()).toMatchObject({
			closed: true,
			indexedNodes: 0,
			cachedSelectors: 0,
		});
	}
});

it("retains bounded query defaults", () => {
	const tree = fixture("<p>Body</p>");
	const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
	extractDocumentPage(tree, "p");
	const receiver = query.mock.contexts[0];
	if (!(receiver instanceof DocumentQueries))
		throw new Error("Expected a document query receiver");
	expect(receiver.limits).toMatchObject({
		maxIndexedNodes: 50_000,
		maxWork: 5_000_000,
		maxResults: 10_000,
	});
});

it("serializes individual entries and empty envelopes rather than growing pages", () => {
	const tree = fixture("<p>Body</p>".repeat(8));
	const stringify = vi.spyOn(JSON, "stringify");
	const page = extractDocumentPage(tree, "p");
	const envelopes = stringify.mock.calls
		.map(([value]) => value)
		.filter((value) => value?.method === "selector-extraction-page-v1");
	expect(page.entries).toHaveLength(8);
	expect(envelopes).toHaveLength(9);
	expect(envelopes.slice(1).every((value) => value.entries.length === 0)).toBe(
		true,
	);
});
