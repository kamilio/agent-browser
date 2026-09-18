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
import { loadResearchDocument } from "./research-loader.js";
import * as readerInformation from "./research-reader-info.js";
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

function readerFixture(source: string) {
	const body = encoder.encode(source);
	const tree = loadResearchDocument(
		{
			url,
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.byteLength,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "synthetic-shared-reader-pages",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50_000,
				maxDepth: 256,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
		},
	);
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

it.each([
	{ format: "markdown", reader: false },
	{ format: "markdown", reader: true },
	{ format: "json", reader: false },
	{ format: "json", reader: true },
] as const)("retains byte-identical entry mode: %j", ({ format, reader }) => {
	const tree = (reader ? readerFixture : fixture)(
		"<p>First café 中文 😀</p><p>Second</p><p>Third</p>",
	);
	for (const start of [0, 1, 3]) {
		const options = { format, limit: 1, cursor: cursor(tree, "p", start) };
		const original = extractDocumentPage(tree, "p", options);
		const explicit = extractDocumentPage(tree, "p", {
			...options,
			readerMetadata: "entry",
		});
		expect(JSON.stringify(explicit)).toBe(JSON.stringify(original));
		expect(explicit).not.toHaveProperty("readerMetadata");
		expect(explicit).not.toHaveProperty("reader");
		for (const entry of explicit.entries) {
			expect(entry.reader).toBe(readerInformation.researchReaderInfo(tree));
		}
	}
});

it.each(["markdown", "json"] as const)(
	"roundtrips shared-reader %s pages to ordinary extraction without losing metadata",
	(format) => {
		const tree = readerFixture(
			'<html><head><title>Reader café 中文 😀</title><meta name="description" content="Kept description"><link rel="alternate" type="text/markdown" href="/article.md"></head><body>' +
				'<article><h2>First</h2><p>café 中文 😀</p><table><tr><td>Cell</td><td>Value</td></tr></table></article><article><p>Second <a href="/next">Next</a></p></article><article><p>Third</p></article><script>omitted()</script></body></html>',
		);
		const options = {
			format,
			...(format === "markdown"
				? { tableRows: true, compactTables: true }
				: {}),
		};
		const expected = references(tree, "article").map((root) =>
			extraction.extractDocument(tree, { root, ...options }),
		);
		expect(expected[0]).toHaveProperty("sourceDescriptions");
		expect(expected[0]).toHaveProperty("sourceAlternates");
		const restored: extraction.DocumentExtraction[] = [];
		let nextCursor: string | undefined;
		for (let start = 0; start < expected.length; start++) {
			const page = extractDocumentPage(tree, "article", {
				...options,
				readerMetadata: "page",
				limit: 1,
				cursor: nextCursor,
			});
			expect(page).toMatchObject({
				method: "selector-extraction-page-v1",
				readerMetadata: "page",
				start,
				partial: true,
			});
			expect(page.reader).toBe(readerInformation.researchReaderInfo(tree));
			expect(page.entries[0]).not.toHaveProperty("reader");
			restored.push({ ...page.entries[0], reader: page.reader });
			nextCursor = page.nextCursor ?? undefined;
			expect(page.nextCursor).toBe(
				start + 1 === expected.length
					? null
					: cursor(tree, "article", start + 1),
			);
		}
		expect(restored).toEqual(expected);
		expect(JSON.parse(JSON.stringify(restored))).toEqual(
			JSON.parse(JSON.stringify(expected)),
		);
	},
);

it.each([false, true])(
	"keeps reader=%s empty trees, missing matches and terminal cursors meaningful",
	(reader) => {
		for (const source of ["", "<p>Body</p>"]) {
			const tree = (reader ? readerFixture : fixture)(source);
			for (const selector of [".absent", "p"]) {
				const totalMatches = references(tree, selector).length;
				const page = extractDocumentPage(tree, selector, {
					readerMetadata: "page",
					cursor: cursor(tree, selector, totalMatches),
				});
				expect(page).toMatchObject({
					readerMetadata: "page",
					start: totalMatches,
					totalMatches,
					entries: [],
					nextCursor: null,
					selectionExhausted: true,
					partial: true,
				});
				if (reader) {
					expect(page.reader).toBe(readerInformation.researchReaderInfo(tree));
					expect(page.reader).toBeDefined();
				} else {
					expect(page).not.toHaveProperty("reader");
				}
			}
		}
	},
);

it.each(["markdown", "json"] as const)(
	"adds only the page marker on ordinary no-reader %s trees",
	(format) => {
		const tree = fixture("<p>First</p><p>Second</p>");
		const original = extractDocumentPage(tree, "p", { format, limit: 1 });
		const shared = extractDocumentPage(tree, "p", {
			format,
			limit: 1,
			readerMetadata: "page",
		});
		expect(shared).toEqual({ ...original, readerMetadata: "page" });
		expect(shared).not.toHaveProperty("reader");
	},
);

it("reads the shared report once without mutating frozen ordinary entries or document state", () => {
	const tree = readerFixture("<p>First</p><p>Second</p>");
	const expected = references(tree, "p").map((root) =>
		Object.freeze(extraction.extractDocument(tree, { root })),
	);
	const reader = readerInformation.researchReaderInfo(tree);
	const report = JSON.stringify(reader);
	const source = serializeHtml(tree, tree.root);
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	const mutations = tree.mutationMetrics();
	const read = vi.spyOn(readerInformation, "researchReaderInfo");
	vi.spyOn(extraction, "extractDocument")
		.mockReturnValueOnce(expected[0])
		.mockReturnValueOnce(expected[1]);
	const page = extractDocumentPage(tree, "p", { readerMetadata: "page" });
	expect(read).toHaveBeenCalledTimes(1);
	expect(read).toHaveBeenCalledWith(tree);
	expect(page.reader).toBe(reader);
	expect(Object.isFrozen(page.reader)).toBe(true);
	for (const [index, entry] of page.entries.entries()) {
		expect(entry).not.toBe(expected[index]);
		expect(entry).not.toHaveProperty("reader");
		expect({ ...entry, reader: page.reader }).toEqual(expected[index]);
		expect(expected[index].reader).toBe(reader);
	}
	expect(JSON.stringify(reader)).toBe(report);
	expect(serializeHtml(tree, tree.root)).toBe(source);
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(usage);
	expect(tree.mutationMetrics()).toEqual(mutations);
});

it.each([
	{ readerMetadata: "" },
	{ readerMetadata: "PAGE" },
	{ readerMetadata: "document" },
	{ readerMetadata: null },
	{ readerMetadata: false },
	{ readerMetadata: 1 },
	{ readerMetadata: [] },
	{ readerMetadata: {} },
])(
	"rejects invalid reader metadata %j before querying",
	({ readerMetadata }) => {
		const tree = fixture("<p>Body</p>");
		const query = vi.spyOn(DocumentQueries.prototype, "querySelectorAll");
		const read = vi.spyOn(readerInformation, "researchReaderInfo");
		expect(() =>
			extractDocumentPage(tree, ".absent", {
				readerMetadata,
			} as ExtractionPageOptions),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(query).not.toHaveBeenCalled();
		expect(read).not.toHaveBeenCalled();
	},
);

it.each(["markdown", "json"] as const)(
	"counts shared metadata and escaped Unicode nonterminal cursors at exact %s byte caps",
	(format) => {
		const tree = readerFixture(
			`<p class="café 中文 😀">${'café 中文 😀 " \\ '.repeat(100)}</p>`.repeat(
				5,
			),
		);
		const selector = '[class="café 中文 😀"]';
		const options = { format, readerMetadata: "page", limit: 2 } as const;
		const expected = extractDocumentPage(tree, selector, options);
		const maxBytes = bytes(expected);
		expect(maxBytes).toBeGreaterThan(1024);
		expect(maxBytes).toBeGreaterThan(JSON.stringify(expected).length);
		expect(expected.nextCursor).toBe(cursor(tree, selector, 2));
		const exact = extractDocumentPage(tree, selector, { ...options, maxBytes });
		expect(exact).toEqual(expected);
		expect(bytes(exact)).toBe(maxBytes);
		const shorter = extractDocumentPage(tree, selector, {
			...options,
			maxBytes: maxBytes - 1,
		});
		expect(shorter.entries).toEqual(expected.entries.slice(0, 1));
		expect(shorter.nextCursor).toBe(cursor(tree, selector, 1));
		expect(bytes(shorter)).toBeLessThanOrEqual(maxBytes - 1);
		const resumed = extractDocumentPage(tree, selector, {
			...options,
			cursor: shorter.nextCursor ?? undefined,
			maxBytes,
		});
		expect(resumed.start).toBe(1);
		expect(resumed.entries[0]).toEqual(expected.entries[1]);
	},
);

it.each([false, true])(
	"counts the shared marker and reader=%s in exact empty envelope caps",
	(reader) => {
		const tree = (reader ? readerFixture : fixture)("<p>Body</p>");
		const selector = `.absent${" ".repeat(1200)}`;
		const options = { readerMetadata: "page" } as const;
		const expected = extractDocumentPage(tree, selector, options);
		const maxBytes = bytes(expected);
		expect(
			extractDocumentPage(tree, selector, { ...options, maxBytes }),
		).toEqual(expected);
		try {
			extractDocumentPage(tree, selector, {
				...options,
				maxBytes: maxBytes - 1,
			});
			throw new Error("Expected shared envelope rejection");
		} catch (error) {
			expect(error).toMatchObject({
				code: "resource-limit",
				message: "Extraction page envelope exceeds byte limit",
			});
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "extraction.output",
				unit: "bytes",
				limit: maxBytes - 1,
				observed: maxBytes,
			});
		}
	},
);

it.each([false, true])(
	"rejects the first shared entry at one byte below its reader=%s envelope",
	(reader) => {
		const tree = (reader ? readerFixture : fixture)(
			`<p>${"café 中文 😀 ".repeat(100)}</p>`.repeat(3),
		);
		const options = { readerMetadata: "page", limit: 1 } as const;
		const expected = extractDocumentPage(tree, "p", options);
		const maxBytes = bytes(expected);
		expect(expected.nextCursor).toBe(cursor(tree, "p", 1));
		expect(extractDocumentPage(tree, "p", { ...options, maxBytes })).toEqual(
			expected,
		);
		try {
			extractDocumentPage(tree, "p", { ...options, maxBytes: maxBytes - 1 });
			throw new Error("Expected first shared entry rejection");
		} catch (error) {
			expect(error).toMatchObject({
				code: "resource-limit",
				message: "First extraction page entry exceeds byte limit",
			});
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "extraction.output",
				unit: "bytes",
				limit: maxBytes - 1,
				observed: maxBytes,
			});
		}
	},
);

it("packs more entries without changing per-item output or skipping continuations", () => {
	const tree = readerFixture("<p>Small café 中文 😀</p>".repeat(12));
	const options = { readerMetadata: "page", limit: 4 } as const;
	const maxBytes = bytes(extractDocumentPage(tree, "p", options));
	const ordinary = extractDocumentPage(tree, "p", { limit: 4, maxBytes });
	expect(ordinary.entries.length).toBeLessThan(4);
	const restored: extraction.DocumentExtraction[] = [];
	let nextCursor: string | undefined;
	for (let pageIndex = 0; pageIndex < 12; pageIndex++) {
		const page = extractDocumentPage(tree, "p", {
			...options,
			maxBytes,
			cursor: nextCursor,
		});
		expect(page.entries.length).toBeGreaterThan(0);
		expect(bytes(page)).toBeLessThanOrEqual(maxBytes);
		expect(page.start).toBe(restored.length);
		restored.push(
			...page.entries.map((entry) => ({ ...entry, reader: page.reader })),
		);
		if (page.selectionExhausted) break;
		nextCursor = page.nextCursor ?? undefined;
		expect(nextCursor).toBe(cursor(tree, "p", restored.length));
	}
	expect(restored).toEqual(
		references(tree, "p").map((root) =>
			extraction.extractDocument(tree, { root }),
		),
	);
});

it.each(["missing", "different", "unexpected"] as const)(
	"rejects %s entry reader metadata rather than silently losing provenance",
	(outcome) => {
		const tree = readerFixture("<p>Body</p>");
		const root = references(tree, "p")[0];
		const entry = extraction.extractDocument(tree, { root });
		if (!entry.reader) throw new Error("Expected reader fixture metadata");
		const changed = {
			...entry,
			reader:
				outcome === "missing" ? undefined : { ...entry.reader, tokens: -1 },
		};
		if (outcome === "unexpected") {
			vi.spyOn(readerInformation, "researchReaderInfo").mockReturnValue(
				undefined,
			);
		}
		vi.spyOn(extraction, "extractDocument").mockReturnValue(changed);
		const close = vi.spyOn(DocumentQueries.prototype, "close");
		expect(() =>
			extractDocumentPage(tree, "p", { readerMetadata: "page" }),
		).toThrow("Extraction page reader metadata mismatch");
		expect(close).toHaveBeenCalledOnce();
	},
);

it("counts a Unicode reader report even when the page has no entries", () => {
	const tree = readerFixture("");
	const reader = readerInformation.researchReaderInfo(tree);
	if (!reader) throw new Error("Expected reader fixture metadata");
	readerInformation.setResearchReaderInfo(tree, {
		...reader,
		omittedSubtrees: { ['café 中文 😀 " \\ '.repeat(100)]: 1 },
	});
	const options = { readerMetadata: "page" } as const;
	const expected = extractDocumentPage(tree, "p", options);
	const maxBytes = bytes(expected);
	expect(maxBytes).toBeGreaterThan(1024);
	expect(maxBytes).toBeGreaterThan(JSON.stringify(expected).length);
	expect(expected.entries).toEqual([]);
	const extract = vi.spyOn(extraction, "extractDocument");
	const read = vi.spyOn(readerInformation, "researchReaderInfo");
	const close = vi.spyOn(DocumentQueries.prototype, "close");
	expect(extractDocumentPage(tree, "p", { ...options, maxBytes })).toEqual(
		expected,
	);
	expect(read).toHaveBeenCalledTimes(1);
	expect(read).toHaveBeenCalledWith(tree);
	try {
		extractDocumentPage(tree, "p", { ...options, maxBytes: maxBytes - 1 });
		throw new Error("Expected reader-only envelope rejection");
	} catch (error) {
		expect(error).toMatchObject({
			code: "resource-limit",
			message: "Extraction page envelope exceeds byte limit",
		});
		expect(resourceLimitDiagnostic(error)).toEqual({
			kind: "extraction.output",
			unit: "bytes",
			limit: maxBytes - 1,
			observed: maxBytes,
		});
	}
	expect(read).toHaveBeenCalledTimes(2);
	expect(extract).not.toHaveBeenCalled();
	expect(close).toHaveBeenCalledTimes(2);
});

it.each(["markdown", "json"] as const)(
	"retains ordinary per-item %s output caps before sharing reader metadata",
	(format) => {
		const tree = readerFixture(`<p>${"café 中文 😀 ".repeat(100)}</p>`);
		const root = references(tree, "p")[0];
		const ordinary = extraction.extractDocument(tree, { root, format });
		const itemMaxBytes = bytes(ordinary);
		const options = { format, readerMetadata: "page", itemMaxBytes } as const;
		const page = extractDocumentPage(tree, "p", options);
		expect({ ...page.entries[0], reader: page.reader }).toEqual(ordinary);
		const close = vi.spyOn(DocumentQueries.prototype, "close");
		try {
			extractDocumentPage(tree, "p", {
				...options,
				itemMaxBytes: itemMaxBytes - 1,
			});
			throw new Error("Expected ordinary item output rejection");
		} catch (error) {
			expect(error).toMatchObject({
				code: "resource-limit",
				message: "Extraction output limit exceeded",
			});
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "extraction.output",
				unit: "bytes",
				limit: itemMaxBytes - 1,
				observed: itemMaxBytes,
			});
		}
		expect(close).toHaveBeenCalled();
	},
);

it.each([
	"success",
	"empty",
	"syntax",
	"range",
	"envelope",
	"entry",
	"extraction",
	"query",
	"item-metadata",
	"later-extraction",
])("closes shared-page queries on %s without swallowing errors", (outcome) => {
	const tree = readerFixture(`<p>${"Body ".repeat(250)}</p><p>Second</p>`);
	const options: ExtractionPageOptions = { readerMetadata: "page" };
	let selector = "p";
	const failure = new AgentBrowserError("resource-limit", "Synthetic failure");
	if (outcome === "empty") selector = ".absent";
	if (outcome === "syntax") selector = "[";
	if (outcome === "range") options.cursor = cursor(tree, selector, 3);
	if (outcome === "envelope") {
		selector = `p${" ".repeat(1500)}`;
		options.maxBytes = 1024;
	}
	if (outcome === "entry") {
		options.limit = 1;
		options.maxBytes = bytes(extractDocumentPage(tree, selector, options)) - 1;
	}
	if (outcome === "extraction") options.maxNodes = 1;
	if (outcome === "item-metadata") options.itemMaxBytes = 256;
	if (outcome === "query") {
		vi.spyOn(DocumentQueries.prototype, "querySelectorAll").mockImplementation(
			() => {
				throw failure;
			},
		);
	}
	if (outcome === "later-extraction") {
		const original = extraction.extractDocument;
		vi.spyOn(extraction, "extractDocument")
			.mockImplementationOnce(original)
			.mockImplementationOnce(() => {
				throw failure;
			});
	}
	const close = vi.spyOn(DocumentQueries.prototype, "close");
	if (outcome === "success" || outcome === "empty") {
		extractDocumentPage(tree, selector, options);
	} else {
		expect(() => extractDocumentPage(tree, selector, options)).toThrow(
			outcome === "query" || outcome === "later-extraction"
				? failure
				: AgentBrowserError,
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
