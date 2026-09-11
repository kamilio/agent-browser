import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type LinkDiscoveryOptions,
	discoverDocumentLinks,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";

const trees: DocumentTree[] = [];
const url = "https://links.fixture.invalid/catalog/index.html";

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

it("returns stable native references and resolved URL matches without mutation", () => {
	const tree = document(
		'<base href="https://cdn.fixture.invalid/products/"><a href="DGX-one">First <b>system</b></a><a href="/dgx-two#details">Second</a><a href="other">DGX label only</a><a>DGX without href</a>',
	);
	const before = serializeHtml(tree);
	const revision = tree.revision;
	const result = discoverDocumentLinks(tree, "dGx");
	expect(result).toMatchObject({
		method: "link-discovery",
		document: tree.reference(tree.root),
		revision,
		partial: true,
		query: "dGx",
		truncated: false,
	});
	expect(
		result.entries.map(({ url, label, labelTruncated }) => ({
			url,
			label,
			labelTruncated,
		})),
	).toEqual([
		{
			url: "https://cdn.fixture.invalid/products/DGX-one",
			label: "First system",
			labelTruncated: false,
		},
		{
			url: "https://cdn.fixture.invalid/dgx-two#details",
			label: "Second",
			labelTruncated: false,
		},
	]);
	for (const entry of result.entries)
		expect(tree.resolve(entry.ref).tagName).toBe("a");
	expect(result.scannedNodes).toBeGreaterThan(result.entries.length);
	expect(discoverDocumentLinks(tree, "dGx")).toEqual(result);
	expect(serializeHtml(tree)).toBe(before);
	expect(tree.revision).toBe(revision);
});

it("resolves fragments against the live document base and searches literally", () => {
	const tree = document();
	const base = append(tree, tree.root, "base", undefined, {
		href: "https://cdn.fixture.invalid/dgx/guide",
	});
	append(tree, tree.root, "a", "Fragment", { href: "#details" });
	append(tree, tree.root, "a", "Literal", { href: "/dgx[1]" });
	expect(discoverDocumentLinks(tree, "dgx").entries[0].url).toBe(
		"https://cdn.fixture.invalid/dgx/guide#details",
	);
	expect(
		discoverDocumentLinks(tree, "dgx[1]").entries.map((entry) => entry.label),
	).toEqual(["Literal"]);
	expect(discoverDocumentLinks(tree, "dgx.*").entries).toEqual([]);
	tree.setAttribute(base, "href", "https://other.fixture.invalid/manual/");
	expect(discoverDocumentLinks(tree, "#details").entries[0].url).toBe(
		"https://other.fixture.invalid/manual/#details",
	);
});

it.each<Record<string, string>>([
	{ hidden: "" },
	{ inert: "" },
	{ "aria-hidden": "TRUE" },
	{ style: "display:none" },
])(
	"omits anchor subtrees admitted as hidden by extraction: %j",
	(attributes) => {
		const tree = document();
		const hidden = append(tree, tree.root, "div", undefined, attributes);
		append(tree, hidden, "a", "Private", {
			href: "/dgx-private",
			style: "visibility:visible",
		});
		append(tree, tree.root, "a", "Public", { href: "/dgx-public" });
		expect(
			discoverDocumentLinks(tree, "dgx").entries.map((entry) => entry.label),
		).toEqual(["Public"]);
		expect(extractDocument(tree).content).not.toContain("Private");
	},
);

it("omits script and template anchors, non-anchor roles and private label sources", () => {
	const tree = document();
	for (const tagName of ["script", "style", "template", "textarea"])
		append(tree, append(tree, tree.root, tagName), "a", "Private", {
			href: "/dgx-private",
		});
	append(tree, tree.root, "div", "Private role", {
		role: "link",
		href: "/dgx-role",
	});
	const anchor = append(tree, tree.root, "a", "Public", {
		href: "/dgx-public",
		title: "Private title",
		"aria-label": "Private label",
	});
	append(tree, anchor, "span", "Private hidden", { hidden: "" });
	append(tree, anchor, "span", "Private invisible", {
		style: "visibility:hidden",
	});
	append(tree, anchor, "input", undefined, { value: "Private value" });
	append(tree, anchor, "img", undefined, { alt: "Private alternative" });
	const result = discoverDocumentLinks(tree, "dgx");
	expect(result.entries).toHaveLength(1);
	expect(result.entries[0].label).toBe("Public");
	expect(JSON.stringify(result)).not.toContain("Private");
});

it("admits restored visible anchors but not visibility-hidden anchors", () => {
	const tree = document();
	const hidden = append(tree, tree.root, "div", undefined, {
		style: "visibility:hidden",
	});
	append(tree, hidden, "a", "Invisible", { href: "/dgx-invisible" });
	append(tree, hidden, "a", "Restored", {
		href: "/dgx-restored",
		style: "visibility:visible",
	});
	expect(
		discoverDocumentLinks(tree, "dgx").entries.map((entry) => entry.label),
	).toEqual(["Restored"]);
});

it("never returns unsafe schemes or credential-bearing destinations", () => {
	const tree = document();
	for (const href of [
		"javascript:dgx()",
		"data:text/plain,dgx",
		"file:///dgx",
		"mailto:dgx@example.com",
		"https://user:secret@links.fixture.invalid/dgx",
		"https://user@links.fixture.invalid/dgx",
		"https://[dgx",
	])
		append(tree, tree.root, "a", "Unsafe", { href });
	for (const href of ["http://links.fixture.invalid/dgx", "/dgx"])
		append(tree, tree.root, "a", "Safe", { href });
	expect(
		discoverDocumentLinks(tree, "dgx").entries.map((entry) => entry.url),
	).toEqual([
		"http://links.fixture.invalid/dgx",
		"https://links.fixture.invalid/dgx",
	]);
});

it("bounds link output when whole-document JSON exceeds its existing cap", () => {
	const tree = document();
	append(tree, tree.root, "p", "Body".repeat(90_000));
	append(tree, tree.root, "a", "System", { href: "/dgx" });
	expect(() => extractDocument(tree, { format: "json" })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const result = discoverDocumentLinks(tree, "dgx", {
		maxNodes: 5,
		maxDepth: 2,
	});
	expect(result.entries.map((entry) => entry.label)).toEqual(["System"]);
	expect(result.scannedNodes).toBe(5);
	expect(result.truncated).toBe(false);
	expect(JSON.stringify(result)).not.toContain("Body");
});

it("defaults to 32 entries and 256-unit labels with explicit overflow", () => {
	const tree = document();
	for (let index = 0; index < 32; index++)
		append(tree, tree.root, "a", "L".repeat(257), { href: `/dgx-${index}` });
	const exact = discoverDocumentLinks(tree, "dgx");
	expect(exact.entries).toHaveLength(32);
	expect(exact.truncated).toBe(false);
	expect(exact.entries[0]).toMatchObject({
		label: "L".repeat(256),
		labelTruncated: true,
	});
	append(tree, tree.root, "a", "Overflow", { href: "/dgx-overflow" });
	const overflow = discoverDocumentLinks(tree, "dgx");
	expect(overflow.entries).toEqual(exact.entries);
	expect(overflow.truncated).toBe(true);
	expect(
		discoverDocumentLinks(tree, "dgx", { maxEntries: 256 }).entries,
	).toHaveLength(33);
});

it("bounds visible label prefixes independently from entry truncation", () => {
	const tree = document(
		'<a href="/dgx">Alpha<span hidden>Private</span><b>Beta</b></a>',
	);
	expect(
		discoverDocumentLinks(tree, "dgx", { maxLabelCodeUnits: 5 }),
	).toMatchObject({
		truncated: false,
		entries: [{ label: "Alpha", labelTruncated: true }],
	});
	expect(
		discoverDocumentLinks(tree, "dgx", { maxLabelCodeUnits: 9 }).entries[0],
	).toMatchObject({ label: "AlphaBeta", labelTruncated: false });
});

it("accepts exact URL bounds and omits rather than truncates overlong URLs", () => {
	const tree = document();
	const prefix = "https://links.fixture.invalid/dgx/";
	const exact = prefix + "x".repeat(4096 - prefix.length);
	append(tree, tree.root, "a", "Exact", { href: exact });
	append(tree, tree.root, "a", "Too long", { href: `${exact}x` });
	append(tree, tree.root, "a", "Short", { href: prefix });
	expect(
		discoverDocumentLinks(tree, "dgx").entries.map((entry) => entry.url),
	).toEqual([exact, prefix]);
	expect(
		discoverDocumentLinks(tree, "dgx", {
			maxUrlCodeUnits: prefix.length,
		}).entries.map((entry) => entry.url),
	).toEqual([prefix]);
});

it("enforces exact UTF-8 byte limits rather than silently reducing entries", () => {
	const tree = document();
	append(tree, tree.root, "a", "界".repeat(200), { href: "/dgx" });
	const result = discoverDocumentLinks(tree, "dgx");
	const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
	expect(bytes).toBeGreaterThan(256);
	expect(discoverDocumentLinks(tree, "dgx", { maxBytes: bytes })).toEqual(
		result,
	);
	expect(() =>
		discoverDocumentLinks(tree, "dgx", { maxBytes: bytes - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("throws on node and depth exhaustion independently of entry overflow", () => {
	const tree = document();
	append(tree, tree.root, "a", "First", { href: "/dgx-first" });
	append(tree, tree.root, "a", "Second", { href: "/dgx-second" });
	expect(discoverDocumentLinks(tree, "dgx", { maxEntries: 1 }).truncated).toBe(
		true,
	);
	for (const options of [{ maxNodes: 1 }, { maxDepth: 0 }])
		expect(() => discoverDocumentLinks(tree, "dgx", options)).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	expect(
		discoverDocumentLinks(document(), "dgx", { maxDepth: 0 }).entries,
	).toEqual([]);
});

it.each([
	"",
	"x".repeat(257),
	"dgx one",
	"dgx\t",
	"\ndgx",
	"dgx\0",
	"dgx\x1f",
	"dgx\x7f",
	null,
	42,
])("rejects invalid URL queries: %j", (query) => {
	expect(() => discoverDocumentLinks(document(), query as string)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("accepts the exact 256-code-unit query limit", () => {
	const query = "x".repeat(256);
	const tree = document();
	append(tree, tree.root, "a", "Exact", { href: `/${query}` });
	expect(discoverDocumentLinks(tree, query).entries).toHaveLength(1);
});

it.each([
	["maxBytes", 256, 1_048_576],
	["maxNodes", 1, 50_000],
	["maxDepth", 0, 1024],
	["maxEntries", 1, 256],
	["maxLabelCodeUnits", 1, 1024],
	["maxUrlCodeUnits", 1, 4096],
] as const)(
	"validates %s bounds without relaxing them",
	(name, minimum, maximum) => {
		const tree = document();
		for (const value of [
			minimum - 1,
			maximum + 1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"2",
		])
			expect(() =>
				discoverDocumentLinks(tree, "dgx", { [name]: value }),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		for (const value of [minimum, maximum])
			expect(
				discoverDocumentLinks(tree, "dgx", { [name]: value }).entries,
			).toEqual([]);
	},
);

it.each([null, [], 1, { checkpoint: true }])(
	"rejects malformed options: %j",
	(options) => {
		expect(() =>
			discoverDocumentLinks(document(), "dgx", options as LinkDiscoveryOptions),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);

it("runs checkpoints and propagates cancellation without mutating the tree", () => {
	const tree = document('<a href="/dgx">System</a>');
	const checkpoint = vi.fn();
	const before = serializeHtml(tree);
	discoverDocumentLinks(tree, "dgx", { checkpoint });
	expect(checkpoint).toHaveBeenCalled();
	const error = new AgentBrowserError("aborted", "Synthetic cancellation");
	expect(() =>
		discoverDocumentLinks(tree, "dgx", {
			checkpoint: () => {
				throw error;
			},
		}),
	).toThrow(error);
	expect(serializeHtml(tree)).toBe(before);
});
