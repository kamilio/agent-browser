import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	type HeadingDiscoveryOptions,
	discoverDocumentHeadings,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const url = "https://example.com/headings";

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function document(source?: string) {
	const tree =
		source === undefined
			? new DocumentTree(url)
			: parseHtmlDocument(source, url);
	trees.push(tree);
	return tree;
}

function append(
	tree: DocumentTree,
	parent: number,
	tagName: string,
	text?: string,
	attributes: Record<string, string> = {},
) {
	const id = tree.createElement(tagName, attributes);
	tree.append(parent, id);
	if (text !== undefined) tree.setTextContent(id, text);
	return id;
}

it("returns bounded discovery metadata without pretending it is full extraction", () => {
	const tree = document();
	expect(discoverDocumentHeadings(tree)).toEqual({
		method: "heading-outline",
		document: tree.reference(tree.root),
		revision: tree.revision,
		partial: true,
		entries: [],
		scannedNodes: 1,
		truncated: false,
	});
	expect(
		discoverDocumentHeadings(tree, { maxNodes: 1, maxDepth: 0 }).entries,
	).toEqual([]);
});

it("discovers headings and reuses their unique selectors for section extraction", () => {
	const tree = document(
		"<title>Page title</title><p>Before</p><h2>First <span>part</span></h2><p>Body</p><h3>Detail</h3><h2>Next</h2>",
	);
	const outline = discoverDocumentHeadings(tree);
	expect(outline.entries.map((entry) => [entry.level, entry.title])).toEqual([
		[2, "First part"],
		[3, "Detail"],
		[2, "Next"],
	]);
	const queries = new DocumentQueries(tree);
	try {
		for (const entry of outline.entries) {
			if (entry.selector === null) throw new Error("Expected native selector");
			const matches = queries.querySelectorAll(entry.selector);
			expect(matches).toEqual([tree.resolve(entry.ref).id]);
			expect(
				extractDocument(tree, { section: tree.reference(matches[0]) })
					.sectionSelection?.heading,
			).toBe(entry.ref);
		}
	} finally {
		queries.close();
	}
	expect(outline).not.toHaveProperty("content");
	expect(outline.entries.every((entry) => !entry.titleTruncated)).toBe(true);
});

it("anchors selectors uniquely across repeated native root and descendant headings", () => {
	const tree = document();
	append(tree, tree.root, "h2", "Root heading");
	const wrapper = append(tree, tree.root, "div");
	append(tree, wrapper, "h2", "Nested heading");
	const queries = new DocumentQueries(tree);
	try {
		const entries = discoverDocumentHeadings(tree).entries;
		expect(entries).toHaveLength(2);
		for (const entry of entries) {
			if (entry.selector === null) throw new Error("Expected native selector");
			expect(queries.querySelectorAll(entry.selector)).toEqual([
				tree.resolve(entry.ref).id,
			]);
		}
	} finally {
		queries.close();
	}
});

it.each<Record<string, string>>([
	{ hidden: "" },
	{ inert: "" },
	{ "aria-hidden": "TRUE" },
	{ style: "display:none" },
])("shares extraction subtree admission for %j", (attributes) => {
	const tree = document();
	const excluded = append(tree, tree.root, "div", undefined, attributes);
	append(tree, excluded, "h2", "Private", { style: "visibility:visible" });
	append(tree, tree.root, "h2", "Public");
	expect(
		discoverDocumentHeadings(tree).entries.map((entry) => entry.title),
	).toEqual(["Public"]);
	expect(extractDocument(tree).content).not.toContain("Private");
});

it("admits restored visible descendants without including hidden heading text", () => {
	const tree = document();
	const hidden = append(tree, tree.root, "h2", "Invisible", {
		style: "visibility:hidden",
	});
	const restored = append(tree, hidden, "h3", "Restored", {
		style: "visibility:visible",
	});
	expect(
		discoverDocumentHeadings(tree).entries.map((entry) => [
			entry.ref,
			entry.title,
		]),
	).toEqual([[tree.reference(restored), "Restored"]]);
});

it.each(["img", "br", "hr"])(
	"shares %s leaf traversal and restored-container behavior",
	(tagName) => {
		const tree = document();
		const visibleLeaf = append(tree, tree.root, tagName);
		append(tree, visibleLeaf, "h2", "Excluded");
		const invisibleLeaf = append(tree, tree.root, tagName, undefined, {
			style: "visibility:hidden",
		});
		append(tree, invisibleLeaf, "h2", "Restored", {
			style: "visibility:visible",
		});
		expect(
			discoverDocumentHeadings(tree).entries.map((entry) => entry.title),
		).toEqual(["Restored"]);
	},
);

it("does not use ARIA roles, attributes, form values or image alternatives as heading text", () => {
	const tree = document();
	append(tree, tree.root, "div", "Role heading", {
		role: "heading",
		"aria-level": "1",
	});
	const heading = append(tree, tree.root, "h2", "Visible", {
		title: "Private title",
		"aria-label": "Private label",
	});
	append(tree, heading, "input", undefined, {
		value: "Private value",
		type: "password",
	});
	append(tree, heading, "textarea", "Private textarea");
	append(tree, heading, "img", undefined, { alt: "Private alternative" });
	const outline = discoverDocumentHeadings(tree);
	expect(outline.entries).toHaveLength(1);
	expect(outline.entries[0].title).toBe("Visible");
	expect(JSON.stringify(outline)).not.toContain("Private");
});

it("sanitizes terminal controls and collapses whitespace after bounded source-title collection", () => {
	const tree = document();
	append(tree, tree.root, "h2", "\t A\r\nB\x1b\u202e C  ");
	const entry = discoverDocumentHeadings(tree).entries[0];
	expect(entry.title).toBe("A B\\u{1b}\\u{202e} C");
	expect(entry.title).not.toMatch(/[\p{Cc}\p{Cf}]/u);
	expect(entry.titleTruncated).toBe(false);
});

it("marks a raw title prefix even when cleanup makes the displayed title shorter", () => {
	const tree = document();
	append(tree, tree.root, "h2", "\n\tAlpha Beta");
	expect(
		discoverDocumentHeadings(tree, { maxTitleCodeUnits: 4 }).entries[0],
	).toMatchObject({ title: "Al", titleTruncated: true });
});

it("keeps the exact serialized UTF-8 output bound including metadata and escaping", () => {
	const tree = document();
	append(tree, tree.root, "h2", "界\x1b".repeat(120));
	const outline = discoverDocumentHeadings(tree);
	const bytes = new TextEncoder().encode(JSON.stringify(outline)).byteLength;
	expect(bytes).toBeGreaterThan(256);
	expect(discoverDocumentHeadings(tree, { maxBytes: bytes })).toEqual(outline);
	expect(() =>
		discoverDocumentHeadings(tree, { maxBytes: bytes - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("discovers a small outline without copying an oversized nonheading body", () => {
	const tree = document();
	append(tree, tree.root, "h2", "Start");
	append(tree, tree.root, "p", "Body".repeat(90_000));
	expect(() => extractDocument(tree)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const outline = discoverDocumentHeadings(tree, { maxNodes: 5, maxDepth: 2 });
	expect(outline.entries.map((entry) => entry.title)).toEqual(["Start"]);
	expect(outline.scannedNodes).toBe(5);
	expect(outline.truncated).toBe(false);
	expect(JSON.stringify(outline)).not.toContain("Body");
});

it("distinguishes entry truncation from node/depth failure", () => {
	const tree = document();
	append(tree, tree.root, "h2", "First");
	append(tree, tree.root, "h2", "Second");
	const outline = discoverDocumentHeadings(tree, { maxEntries: 1 });
	expect(outline.entries.map((entry) => entry.title)).toEqual(["First"]);
	expect(outline.truncated).toBe(true);
	for (const options of [{ maxNodes: 1 }, { maxDepth: 0 }])
		expect(() => discoverDocumentHeadings(tree, options)).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
});

it("reports unavailable selectors explicitly rather than guessing or dropping headings", () => {
	const tree = document();
	const unsafe = append(tree, tree.root, "custom:container");
	append(tree, unsafe, "h2", "Unsafe ancestor");
	append(tree, tree.root, "h2", "Long selector");
	const outline = discoverDocumentHeadings(tree);
	expect(outline.entries[0]).toMatchObject({
		title: "Unsafe ancestor",
		selector: null,
		selectorUnavailable: "unsupported-ancestor",
	});
	expect(
		discoverDocumentHeadings(tree, { maxSelectorCodeUnits: 1 }).entries[1],
	).toMatchObject({
		title: "Long selector",
		selector: null,
		selectorUnavailable: "selector-limit",
	});
});

const limitCases = [
	["maxBytes", 256, 1_048_576],
	["maxNodes", 1, 50_000],
	["maxDepth", 0, 1024],
	["maxEntries", 1, 256],
	["maxTitleCodeUnits", 1, 1024],
	["maxSelectorCodeUnits", 1, 4096],
] as const;

it.each(
	limitCases.flatMap(([name, minimum, maximum]) =>
		[minimum - 1, maximum + 1, Number.NaN, Number.POSITIVE_INFINITY, 1.5].map(
			(value) => ({ name, value }),
		),
	),
)("rejects invalid $name=$value", ({ name, value }) => {
	const tree = document();
	expect(() => discoverDocumentHeadings(tree, { [name]: value })).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("does not coerce hostile numeric limit values", () => {
	const tree = document();
	let hooks = 0;
	const hostile = {
		valueOf() {
			hooks++;
			throw new Error("Private coercion");
		},
	};
	for (const [name] of limitCases)
		expect(() =>
			discoverDocumentHeadings(tree, {
				[name]: hostile,
			} as HeadingDiscoveryOptions),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(hooks).toBe(0);
});

it("leaves nodes, serialization, revision and change history unchanged", () => {
	const tree = document("<h1>Title</h1><div><h2>Section</h2><p>Body</p></div>");
	const source = serializeHtml(tree, tree.root);
	const revision = tree.revision;
	const changes = tree.changesSince(0);
	const first = discoverDocumentHeadings(tree);
	expect(discoverDocumentHeadings(tree)).toEqual(first);
	expect(tree.revision).toBe(revision);
	expect(tree.changesSince(0)).toEqual(changes);
	expect(serializeHtml(tree, tree.root)).toBe(source);
});

it("rejects a closed document", () => {
	const tree = document();
	tree.close();
	expect(() => discoverDocumentHeadings(tree)).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
});
