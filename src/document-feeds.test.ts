import { afterEach, describe, expect, it } from "vitest";
import {
	documentAlternates,
	sourceAlternateLink,
} from "./document-alternates.js";
import { documentHead } from "./document-elements.js";
import {
	type DocumentFeeds,
	documentFeeds,
	fitDocumentFeeds,
	sourceFeedLink,
} from "./document-feeds.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";

const documents: DocumentTree[] = [];
const url = "https://feeds.fixture.invalid/docs/index.html";
const prefix = "https://feeds.fixture.invalid/docs/";
const rssType = "application/rss+xml";
const atomType = "application/atom+xml";
const attributes = { rel: "alternate", type: rssType, href: "feed.xml" };

afterEach(() => {
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function document(source: string) {
	const tree = parseHtmlDocument(source, url);
	documents.push(tree);
	return tree;
}

function required<Value>(value: Value | undefined): Value {
	if (value === undefined) throw new Error("Missing expected value");
	return value;
}

function link(href = "feed.xml", type = rssType) {
	return `<link rel="alternate" type="${type}" href="${href}">`;
}

function metadata(
	entries: DocumentFeeds["entries"],
	truncated = false,
): DocumentFeeds {
	return {
		kind: "html-feed-links-v1",
		scope: "document-head",
		partial: true,
		verified: false,
		truncated,
		entries,
	};
}

function bytes(value: unknown) {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

describe("source feed link validation", () => {
	it.each([rssType, atomType])("normalizes the exact MIME type %s", (type) => {
		const source = {
			rel: "NEXT\tALTERNATE\nprev",
			type: `\t${type.toUpperCase()}\r\n`,
			href: " /feed.xml ",
		};
		expect(sourceFeedLink(source)).toEqual({ type, href: source.href });
		expect(sourceAlternateLink(source)).toBeUndefined();
	});

	it("requires complete alternate attributes and rejects any http-equiv", () => {
		const sources: Record<string, string>[] = [
			{},
			{ type: rssType, href: "feed.xml" },
			{ rel: "alternate", href: "feed.xml" },
			{ rel: "alternate", type: rssType },
			{ ...attributes, rel: "not-alternate" },
			{ ...attributes, rel: "alternate,next" },
			{ ...attributes, rel: "alternate\u00a0next" },
			{ ...attributes, "http-equiv": "" },
			{ ...attributes, "http-equiv": "Content-Type" },
		];
		for (const source of sources)
			expect(sourceFeedLink(source)).toBeUndefined();
	});

	it("rejects Markdown, JSON Feed, generic XML and MIME parameters", () => {
		for (const type of [
			"text/markdown",
			"application/feed+json",
			"application/json",
			"application/xml",
			"text/xml",
			"text/rss+xml",
			"",
			`${rssType}; charset=utf-8`,
			`${atomType}; charset=utf-8`,
		])
			expect(sourceFeedLink({ ...attributes, type })).toBeUndefined();
		expect(
			sourceAlternateLink({ ...attributes, type: "text/markdown" }),
		).toEqual({ type: "text/markdown", href: "feed.xml" });
	});

	it("rejects unsafe, malformed, empty, control and format-character URLs", () => {
		for (const href of [
			"",
			"   ",
			"https://user:secret@example.invalid/feed.xml",
			"javascript:alert(1)",
			"data:application/rss+xml,feed",
			"file:///feed.xml",
			"ftp://example.invalid/feed.xml",
			"http://[",
			"feed\n.xml",
			"feed\u200b.xml",
		])
			expect(sourceFeedLink({ ...attributes, href })).toBeUndefined();
	});

	it("enforces raw rel, type and href caps before normalization", () => {
		for (const length of [256, 257]) {
			for (const name of ["rel", "type"] as const) {
				const source = {
					...attributes,
					[name]: attributes[name].padEnd(length),
				};
				expect(sourceFeedLink(source) !== undefined).toBe(length === 256);
			}
		}
		for (const length of [4096, 4097]) {
			const href = `https://example.invalid/${"./".repeat(2100)}`.slice(
				0,
				length,
			);
			expect(sourceFeedLink({ ...attributes, href }) !== undefined).toBe(
				length === 4096,
			);
		}
	});

	it("rejects absolute URLs whose percent-encoded serialization is too long", () => {
		const href = `https://example.invalid/${"é".repeat(1000)}`;
		expect(href.length).toBeLessThan(4096);
		expect(sourceFeedLink({ ...attributes, href })).toBeUndefined();
	});
});

describe("native document feed discovery", () => {
	it("keeps both MIME types and duplicates in order, separate from Markdown", () => {
		const tree = document(
			`<head>${link()}${link("guide.md", "text/markdown")}${link("atom.xml", atomType)}${link()}</head>`,
		);
		expect(documentFeeds(tree)).toEqual(
			metadata([
				{ type: rssType, url: `${prefix}feed.xml` },
				{ type: atomType, url: `${prefix}atom.xml` },
				{ type: rssType, url: `${prefix}feed.xml` },
			]),
		);
		expect(documentAlternates(tree)).toEqual({
			kind: "html-alternate-representations-v1",
			partial: true,
			truncated: false,
			entries: [{ type: "text/markdown", url: `${prefix}guide.md` }],
		});
	});

	it("resolves decoded links against the first base even after the link", () => {
		const tree = document(
			`<head>${link("../feed.xml?one=1&amp;two=2#latest")}<base href="https://base.fixture.invalid/first/docs/"><base href="https://ignored.fixture.invalid/"></head>`,
		);
		expect(documentFeeds(tree)?.entries).toEqual([
			{
				type: rssType,
				url: "https://base.fixture.invalid/first/feed.xml?one=1&two=2#latest",
			},
		]);
	});

	it("rejects relative feeds resolved through credentialed or non-network bases", () => {
		for (const base of [
			"https://user:secret@example.invalid/",
			"ftp://example.invalid/",
		]) {
			const tree = document(`<head><base href="${base}">${link()}</head>`);
			expect(documentFeeds(tree)).toBeUndefined();
		}
	});

	it.each([4095, 4096, 4097])(
		"bounds serialized resolved URLs at %s",
		(length) => {
			const href = "x".repeat(length - prefix.length);
			const result = documentFeeds(document(link(href)));
			if (length > 4096) expect(result).toBeUndefined();
			else
				expect(result?.entries).toEqual([
					{ type: rssType, url: prefix + href },
				]);
		},
	);

	it("counts percent-encoding expansion in resolved relative URL limits", () => {
		const href = "é".repeat(1000);
		expect(sourceFeedLink({ ...attributes, href })).toBeDefined();
		expect(documentFeeds(document(link(href)))).toBeUndefined();
	});

	it("omits metadata for empty or missing heads and Markdown-only documents", () => {
		for (const source of ["<head></head>", link("guide.md", "text/markdown")])
			expect(documentFeeds(document(source))).toBeUndefined();
		const tree = document(link());
		tree.remove(required(documentHead(tree)));
		expect(documentFeeds(tree)).toBeUndefined();
	});

	it("excludes body links, nested links, raw text and non-link elements", () => {
		for (const source of [
			`<body>${link()}</body>`,
			`<head><template>${link()}</template></head>`,
			`<head><noscript>${link()}</noscript></head>`,
			`<head><script>${link()}</script><style>${link()}</style></head>`,
		])
			expect(documentFeeds(document(source))).toBeUndefined();
		const tree = document("<head></head>");
		const head = required(documentHead(tree));
		const wrapper = tree.createElement("div");
		tree.append(head, wrapper);
		tree.append(wrapper, tree.createElement("link", attributes));
		tree.append(head, tree.createElement("meta", attributes));
		expect(documentFeeds(tree)).toBeUndefined();
	});

	it.each([svgNamespace, mathmlNamespace])(
		"requires HTML links and heads: %s",
		(namespace) => {
			const tree = document("<head></head>");
			const head = required(documentHead(tree));
			tree.append(
				head,
				tree.createParserElement("link", attributes, namespace),
			);
			expect(documentFeeds(tree)).toBeUndefined();
			const parent = tree.get(head).parent;
			if (parent === null) throw new Error("Missing head parent");
			tree.remove(head);
			const foreignHead = tree.createParserElement("head", {}, namespace);
			tree.append(parent, foreignHead);
			tree.append(foreignHead, tree.createElement("link", attributes));
			expect(documentFeeds(tree)).toBeUndefined();
		},
	);

	it.each([7, 8, 9])("retains at most eight of %s eligible links", (count) => {
		const tree = document(
			Array.from({ length: count }, (value, index) =>
				link(`${index}.xml`),
			).join(""),
		);
		expect(documentFeeds(tree)).toEqual(
			metadata(
				Array.from({ length: Math.min(count, 8) }, (value, index) => ({
					type: rssType,
					url: `${prefix}${index}.xml`,
				})),
				count > 8,
			),
		);
	});

	it("does not mark eight entries truncated just for later invalid links", () => {
		const tree = document(
			`${link().repeat(8)}${link("bad.xml", "application/xml")}${link("javascript:alert(1)")}`,
		);
		expect(documentFeeds(tree)?.entries).toHaveLength(8);
		expect(documentFeeds(tree)?.truncated).toBe(false);
	});

	it.each([256, 257])(
		"only scans a feed at direct child %s within the cap",
		(position) => {
			const tree = document("<head></head>");
			const head = required(documentHead(tree));
			for (let index = 1; index < position; index++)
				tree.append(head, tree.createText(" "));
			tree.append(head, tree.createElement("link", attributes));
			expect(documentFeeds(tree)).toEqual(
				position === 256
					? metadata([{ type: rssType, url: `${prefix}feed.xml` }])
					: undefined,
			);
		},
	);

	it("reports scan truncation only beyond 256 children when feeds survive", () => {
		const tree = document(link());
		const head = required(documentHead(tree));
		for (let index = 1; index < 256; index++)
			tree.append(head, tree.createComment("Ignored"));
		const entries: DocumentFeeds["entries"] = [
			{ type: rssType, url: `${prefix}feed.xml` },
		];
		expect(documentFeeds(tree)).toEqual(metadata(entries));
		tree.append(head, tree.createComment("Beyond cap"));
		expect(documentFeeds(tree)).toEqual(metadata(entries, true));
	});

	it("returns undefined rather than empty metadata after a truncated scan", () => {
		const tree = document("<head></head>");
		const head = required(documentHead(tree));
		for (let index = 0; index < 257; index++)
			tree.append(head, tree.createComment("Ignored"));
		expect(documentFeeds(tree)).toBeUndefined();
	});

	it("freezes snapshots and recomputes after attribute changes and removal", () => {
		const tree = document(link());
		const snapshot = required(documentFeeds(tree));
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.entries)).toBe(true);
		expect(Object.isFrozen(snapshot.entries[0])).toBe(true);
		const child = tree.get(required(documentHead(tree))).children[0];
		tree.setAttribute(child, "href", "changed.xml");
		tree.setAttribute(child, "type", atomType);
		expect(documentFeeds(tree)?.entries).toEqual([
			{ type: atomType, url: `${prefix}changed.xml` },
		]);
		tree.setAttribute(child, "http-equiv", "");
		expect(documentFeeds(tree)).toBeUndefined();
		tree.removeAttribute(child, "http-equiv");
		expect(documentFeeds(tree)?.entries).toHaveLength(1);
		tree.remove(child);
		expect(documentFeeds(tree)).toBeUndefined();
		tree.close();
		expect(snapshot).toEqual(
			metadata([{ type: rssType, url: `${prefix}feed.xml` }]),
		);
	});

	it("recomputes base resolution after base insertion, changes and removal", () => {
		const tree = document(link());
		const initial = documentFeeds(tree);
		const base = tree.createElement("base", { href: "../first/" });
		tree.append(required(documentHead(tree)), base);
		expect(documentFeeds(tree)?.entries[0].url).toBe(
			"https://feeds.fixture.invalid/first/feed.xml",
		);
		tree.setAttribute(base, "href", "../second/");
		expect(documentFeeds(tree)?.entries[0].url).toBe(
			"https://feeds.fixture.invalid/second/feed.xml",
		);
		tree.remove(base);
		expect(documentFeeds(tree)).toEqual(initial);
	});
});

describe("feed metadata byte fitting", () => {
	const data = metadata([
		{ type: rssType, url: `${prefix}feed.xml` },
		{ type: atomType, url: `${prefix}atom.xml` },
		{ type: rssType, url: `${prefix}third.xml` },
	]);

	it("requires a safe nonnegative integer budget", () => {
		for (const budget of [
			-1,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
		])
			expect(() => fitDocumentFeeds(data, budget)).toThrow();
		expect(fitDocumentFeeds(data, 0)).toBeUndefined();
		expect(fitDocumentFeeds(data, Number.MAX_SAFE_INTEGER)).toEqual(data);
	});

	it("fits the complete envelope exactly and truncates one byte below", () => {
		expect(fitDocumentFeeds(data, bytes(data))).toEqual(data);
		expect(fitDocumentFeeds(data, bytes(data) + 1)).toEqual(data);
		expect(fitDocumentFeeds(data, bytes(data) - 1)).toEqual(
			metadata(data.entries.slice(0, 2), true),
		);
		expect(data.truncated).toBe(false);
		expect(data.entries).toHaveLength(3);
	});

	it("fits whole-entry prefixes at each exact truncated-envelope boundary", () => {
		for (const count of [1, 2]) {
			const expected = metadata(data.entries.slice(0, count), true);
			expect(fitDocumentFeeds(data, bytes(expected))).toEqual(expected);
			expect(fitDocumentFeeds(data, bytes(expected) - 1)).toEqual(
				count === 1
					? undefined
					: metadata(data.entries.slice(0, count - 1), true),
			);
		}
		const single = metadata(data.entries.slice(0, 1));
		expect(fitDocumentFeeds(single, bytes(single) - 1)).toBeUndefined();
	});

	it("never skips an oversized first entry to retain a later smaller entry", () => {
		const oversized = metadata([
			{ type: rssType, url: `${prefix}${"x".repeat(3000)}` },
			data.entries[1],
		]);
		const laterOnly = metadata(oversized.entries.slice(1), true);
		expect(fitDocumentFeeds(oversized, bytes(laterOnly))).toBeUndefined();
	});

	it("uses UTF-8 bytes rather than UTF-16 length when fitting a prefix", () => {
		const unicode = metadata([
			{ type: rssType, url: `${prefix}é/📰.xml` },
			{ type: atomType, url: `${prefix}${"x".repeat(100)}.xml` },
		]);
		const expected = metadata(unicode.entries.slice(0, 1), true);
		expect(bytes(expected)).toBeGreaterThan(JSON.stringify(expected).length);
		expect(fitDocumentFeeds(unicode, bytes(expected))).toEqual(expected);
		expect(fitDocumentFeeds(unicode, bytes(expected) - 1)).toBeUndefined();
		expect(
			fitDocumentFeeds(unicode, JSON.stringify(expected).length),
		).toBeUndefined();
	});

	it("preserves prior scan truncation through full and shortened fits", () => {
		const tree = document(link().repeat(9));
		const snapshot = required(documentFeeds(tree));
		expect(snapshot.truncated).toBe(true);
		expect(fitDocumentFeeds(snapshot, bytes(snapshot))).toEqual(snapshot);
		const expected = metadata(snapshot.entries.slice(0, 1), true);
		const fitted = required(fitDocumentFeeds(snapshot, bytes(expected)));
		expect(fitted).toEqual(expected);
		expect(fitDocumentFeeds(fitted, bytes(fitted))).toEqual(expected);
		expect(snapshot.entries).toHaveLength(8);
	});
});
