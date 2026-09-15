import { afterEach, describe, expect, it } from "vitest";
import { documentAlternates } from "./document-alternates.js";
import { documentHead } from "./document-elements.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument } from "./research-loader.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";

const documents: DocumentTree[] = [];
const url = "https://alternates.fixture.invalid/docs/index.html";
const alternate = '<link rel="alternate" type="text/markdown" href="guide.md">';

it.each([
	"javascript:void(0)",
	"https://user:password@example.invalid/",
	`https://example.invalid/${"é".repeat(1000)}`,
	`https:\\\\example.invalid\\${"é".repeat(1000)}`,
])(
	"omits unsafe reader hints before they can exhaust head scanning: %s",
	(href) => {
		const invalid = `<link rel="alternate" type="text/markdown" href="${href}">`;
		const tree = document(
			`<head>${invalid.repeat(256)}${alternate}</head><body><p>Body</p></body>`,
			true,
		);
		expect(documentAlternates(tree)).toEqual({
			kind: "html-alternate-representations-v1",
			partial: true,
			truncated: false,
			entries: [
				{
					type: "text/markdown",
					url: "https://alternates.fixture.invalid/docs/guide.md",
				},
			],
		});
		expect(extractDocument(tree).reader?.omittedSubtrees.link).toBe(256);
	},
);

afterEach(() => {
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function document(
	source: string,
	reader = false,
	visibilityPolicy?: ResearchReaderVisibilityPolicy,
) {
	const body = new TextEncoder().encode(source);
	const tree = reader
		? loadResearchDocument(
				{
					url,
					status: 200,
					headers: { "content-type": ["text/html; charset=utf-8"] },
					body,
					encodedBytes: body.length,
					redirects: [],
					elapsedMs: 0,
				},
				{
					tabId: "alternates",
					signal: new AbortController().signal,
					limits: {
						maxNodes: 50000,
						maxDepth: 128,
						maxTextCodeUnits: 2000000,
						maxChanges: 1024,
					},
				},
				undefined,
				undefined,
				visibilityPolicy,
			)
		: parseHtmlDocument(source, url);
	documents.push(tree);
	return tree;
}

function headOf(tree: DocumentTree) {
	const head = documentHead(tree);
	if (head === undefined) throw new Error("Missing head");
	return head;
}

describe.each([false, true])("document alternates, reader=%s", (reader) => {
	it("retains decoded head hints with explicit source-only provenance", () => {
		const tree = document(
			'<head><link rel="alternate" type="text/markdown" href="guide.md?one=1&amp;two=2"></head><body><p>Body</p></body>',
			reader,
		);
		const expected = {
			kind: "html-alternate-representations-v1",
			partial: true,
			truncated: false,
			entries: [
				{
					type: "text/markdown",
					url: "https://alternates.fixture.invalid/docs/guide.md?one=1&two=2",
				},
			],
		};
		expect(documentAlternates(tree)).toEqual(expected);
		expect(extractDocument(tree).sourceAlternates).toEqual(expected);
	});

	it.each([
		["ALTERNATE", "TEXT/MARKDOWN"],
		[" alternate ", " text/markdown "],
		["next\talternate\nprev", "\tText/Markdown\r\n"],
		["next\falternate\rprev", "text/markdown"],
	])("normalizes rel %j and MIME %j", (rel, type) => {
		const tree = document(
			`<link rel="${rel}" type="${type}" href="guide.md">`,
			reader,
		);
		expect(documentAlternates(tree)?.entries).toEqual([
			{
				type: "text/markdown",
				url: "https://alternates.fixture.invalid/docs/guide.md",
			},
		]);
	});

	it.each([
		["guide.md", "https://alternates.fixture.invalid/docs/guide.md"],
		["../guide.md", "https://alternates.fixture.invalid/guide.md"],
		["/guide.md", "https://alternates.fixture.invalid/guide.md"],
		[
			"//other.fixture.invalid/guide.md",
			"https://other.fixture.invalid/guide.md",
		],
		[
			"http://other.fixture.invalid/guide.md",
			"http://other.fixture.invalid/guide.md",
		],
		[
			"?format=md#part",
			"https://alternates.fixture.invalid/docs/index.html?format=md#part",
		],
	])("resolves source URL %s", (href, resolved) => {
		const tree = document(
			`<link rel="alternate" type="text/markdown" href="${href}">`,
			reader,
		);
		expect(documentAlternates(tree)?.entries).toEqual([
			{ type: "text/markdown", url: resolved },
		]);
	});

	it.each([
		[
			'<base href="https://base.fixture.invalid/first/"><base href="https://base.fixture.invalid/second/">',
			"https://base.fixture.invalid/first/guide.md",
		],
		[
			'<base target="_blank"><base href="../first/">',
			"https://alternates.fixture.invalid/first/guide.md",
		],
	])(
		"uses the first document base even after the link: %s",
		(base, resolved) => {
			const tree = document(`<head>${alternate}${base}</head>`, reader);
			expect(documentAlternates(tree)?.entries[0].url).toBe(resolved);
		},
	);

	it("requires an explicit href attribute", () => {
		const tree = document(
			'<link rel="alternate" type="text/markdown">',
			reader,
		);
		expect(documentAlternates(tree)).toBeUndefined();
	});

	it.each([
		'rel="stylesheet" type="text/markdown"',
		'rel="alternate-more" type="text/markdown"',
		'rel="next&#160;alternate" type="text/markdown"',
		'rel="alternate" type="text/plain"',
		'rel="alternate" type="application/markdown"',
		'rel="alternate" type="text/markdown; charset=utf-8"',
		'rel="alternate" type="text/markdown other"',
		'rel="alternate"',
		'type="text/markdown"',
		'rel="alternate" type="text/markdown" http-equiv="refresh"',
		'rel="alternate" type="text/markdown" http-equiv="Content-Type"',
		'rel="alternate" type="text/markdown" http-equiv=""',
	])("rejects unsupported or incomplete attributes: %s", (attributes) => {
		const tree = document(`<link ${attributes} href="guide.md">`, reader);
		expect(documentAlternates(tree)).toBeUndefined();
		expect(extractDocument(tree).sourceAlternates).toBeUndefined();
	});

	it.each([
		"",
		"   ",
		"https://user:secret@other.fixture.invalid/guide.md",
		"https://user@other.fixture.invalid/guide.md",
		"javascript:alert(1)",
		"data:text/markdown,Body",
		"file:///guide.md",
		"ftp://other.fixture.invalid/guide.md",
		"http://[",
		"guide&#1;.md",
		"guide&#9;.md",
		"guide&#10;.md",
		"guide&#127;.md",
	])("rejects unsafe, empty or malformed href %j", (href) => {
		const tree = document(
			`<link rel="alternate" type="text/markdown" href="${href}">`,
			reader,
		);
		expect(documentAlternates(tree)).toBeUndefined();
	});

	it.each([255, 256, 257])("bounds rel and type at %s code units", (length) => {
		for (const attribute of ["rel", "type"] as const) {
			const rel = "alternate".padEnd(attribute === "rel" ? length : 9, " ");
			const type = "text/markdown".padEnd(
				attribute === "type" ? length : 13,
				" ",
			);
			const tree = document(
				`<link rel="${rel}" type="${type}" href="guide.md">`,
				reader,
			);
			if (length > 256) expect(documentAlternates(tree)).toBeUndefined();
			else expect(documentAlternates(tree)?.entries).toHaveLength(1);
		}
	});

	it.each([4095, 4096, 4097])(
		"bounds raw href at %s code units before URL normalization",
		(length) => {
			const href = `https://other.fixture.invalid/${"./".repeat(2100)}`.slice(
				0,
				length,
			);
			const tree = document(
				`<link rel="alternate" type="text/markdown" href="${href}">`,
				reader,
			);
			if (length > 4096) expect(documentAlternates(tree)).toBeUndefined();
			else expect(documentAlternates(tree)?.entries).toHaveLength(1);
		},
	);

	it.each([4095, 4096, 4097])(
		"bounds resolved URLs at %s code units",
		(length) => {
			const prefix = "https://alternates.fixture.invalid/docs/";
			const href = "x".repeat(length - prefix.length);
			const tree = document(
				`<link rel="alternate" type="text/markdown" href="${href}">`,
				reader,
			);
			if (length > 4096) expect(documentAlternates(tree)).toBeUndefined();
			else expect(documentAlternates(tree)?.entries[0].url).toBe(prefix + href);
		},
	);

	it("preserves duplicates and differing hints in source order", () => {
		const tree = document(
			`${alternate}<link rel="alternate" type="text/markdown" href="other.md">${alternate}`,
			reader,
		);
		expect(documentAlternates(tree)?.entries.map((entry) => entry.url)).toEqual(
			[
				"https://alternates.fixture.invalid/docs/guide.md",
				"https://alternates.fixture.invalid/docs/other.md",
				"https://alternates.fixture.invalid/docs/guide.md",
			],
		);
	});

	it.each([7, 8, 9])("bounds entries with %s eligible links", (count) => {
		const tree = document(
			Array.from(
				{ length: count },
				(_, index) =>
					`<link rel="alternate" type="text/markdown" href="${index}.md">`,
			).join(""),
			reader,
		);
		const result = documentAlternates(tree);
		expect(result?.truncated).toBe(count > 8);
		expect(result?.entries).toEqual(
			Array.from({ length: Math.min(count, 8) }, (_, index) => ({
				type: "text/markdown",
				url: `https://alternates.fixture.invalid/docs/${index}.md`,
			})),
		);
	});

	it.each([
		`<body>${alternate}</body>`,
		`<head><template>${alternate}</template></head>`,
		`<head><noscript>${alternate}</noscript></head>`,
		`<head><script>${alternate}</script></head>`,
		`<head><style>${alternate}</style></head>`,
		`<body><svg>${alternate}</svg></body>`,
	])("excludes body, foreign, nested and raw sources: %s", (source) => {
		expect(documentAlternates(document(source, reader))).toBeUndefined();
	});

	it("returns deeply frozen snapshots independent of mutation and closure", () => {
		const tree = document(alternate, reader);
		const result = documentAlternates(tree);
		expect(result).toBeDefined();
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result?.entries)).toBe(true);
		expect(Object.isFrozen(result?.entries[0])).toBe(true);
		const link = tree.get(headOf(tree)).children[0];
		tree.setAttribute(link, "href", "changed.md");
		expect(documentAlternates(tree)?.entries[0].url).toBe(
			"https://alternates.fixture.invalid/docs/changed.md",
		);
		tree.remove(link);
		expect(documentAlternates(tree)).toBeUndefined();
		tree.close();
		expect(result?.entries[0].url).toBe(
			"https://alternates.fixture.invalid/docs/guide.md",
		);
		expect(() => documentAlternates(tree)).toThrow();
	});

	it("charges alternate metadata to the extraction byte quota", () => {
		const baseline = document("<p>Body</p>", reader);
		const tree = document(
			`<link rel="alternate" type="text/markdown" href="${"x".repeat(3000)}"><p>Body</p>`,
			reader,
		);
		expect(extractDocument(baseline, { maxBytes: 2048 }).content).toBe(
			"Body\n",
		);
		expect(() => extractDocument(tree, { maxBytes: 2048 })).toThrow(
			"Extraction metadata limit exceeded",
		);
		expect(extractDocument(tree).sourceAlternates?.entries).toHaveLength(1);
	});

	it("keeps visible Markdown unchanged and hints out of body content", () => {
		const body =
			'<body><h1>Guide</h1><p>Read <strong>carefully</strong>.</p><a href="/view.md">View Markdown</a></body>';
		const baseline = extractDocument(document(`<head></head>${body}`, reader));
		const extracted = extractDocument(
			document(`<head>${alternate}</head>${body}`, reader),
		);
		expect(extracted.content).toBe(baseline.content);
		expect(extracted.content).toContain("View Markdown");
		expect(extracted.content).not.toContain("guide.md");
		expect(extracted.content).not.toContain(
			"html-alternate-representations-v1",
		);
		expect(extracted.sourceAlternates).toEqual({
			kind: "html-alternate-representations-v1",
			partial: true,
			truncated: false,
			entries: [
				{
					type: "text/markdown",
					url: "https://alternates.fixture.invalid/docs/guide.md",
				},
			],
		});
	});

	it("omits metadata when no alternate is advertised", () => {
		const tree = document("<head></head><body><p>Body</p></body>", reader);
		expect(documentAlternates(tree)).toBeUndefined();
		expect(extractDocument(tree)).not.toHaveProperty("sourceAlternates");
	});
});

it("retains only eligible head link attributes in the reader", () => {
	const tree = document(
		'<head><link id="private" class="private" rel="alternate" type="text/markdown" href="guide.md" onload="OMITTED" data-token="OMITTED"><link rel="stylesheet" href="style.css"><link rel="alternate" type="text/plain" href="other.txt"></head><body><link rel="alternate" type="text/markdown" href="body.md"><p>Body</p></body>',
		true,
	);
	const links = [...tree.walk()].filter(
		({ node }) => node.kind === "element" && node.tagName === "link",
	);
	expect(links).toHaveLength(1);
	expect(links[0].node.attributes).toEqual({
		rel: "alternate",
		type: "text/markdown",
		href: "guide.md",
	});
	expect(tree.get(headOf(tree)).children).toContain(links[0].node.id);
});

it.each(["http://[", "javascript:void(0)"])(
	"uses document URL fallback for the first unusable native base %s",
	(base) => {
		const tree = document(
			`<head>${alternate}<base href="${base}"><base href="https://base.fixture.invalid/second/"></head>`,
		);
		expect(documentAlternates(tree)?.entries[0].url).toBe(
			"https://alternates.fixture.invalid/docs/guide.md",
		);
	},
);

it.each([
	"https://user:secret@base.fixture.invalid/",
	"file:///docs/",
	"ftp://base.fixture.invalid/docs/",
])(
	"rejects credentials and non-HTTP schemes inherited from native base %s",
	(base) => {
		const tree = document(`<head><base href="${base}">${alternate}</head>`);
		expect(documentAlternates(tree)).toBeUndefined();
	},
);

it.each(["hidden", 'aria-hidden="true"', 'style="display:none"'])(
	"applies explicit reader visibility policy to links and ancestors: %s",
	(attributes) => {
		for (const source of [
			`<head><link ${attributes} rel="alternate" type="text/markdown" href="guide.md"></head>`,
			`<head ${attributes}>${alternate}</head>`,
		]) {
			expect(documentAlternates(document(source, true))?.entries).toHaveLength(
				1,
			);
			const tree = document(source, true, "source-hidden-inline-v1");
			expect(documentAlternates(tree)).toBeUndefined();
			expect(extractDocument(tree).sourceAlternates).toBeUndefined();
		}
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"ignores foreign head links in namespace %s",
	(namespace) => {
		const tree = document("<head></head>");
		const link = tree.createParserElement(
			"link",
			{ rel: "alternate", type: "text/markdown", href: "guide.md" },
			namespace,
		);
		tree.append(headOf(tree), link);
		expect(documentAlternates(tree)).toBeUndefined();
	},
);

it.each([255, 256, 257])(
	"bounds direct head children at %s even without entries",
	(count) => {
		const tree = document("<head></head>");
		const head = headOf(tree);
		for (let index = 0; index < count; index++)
			tree.append(head, tree.createComment("Ignored"));
		if (count <= 256) expect(documentAlternates(tree)).toBeUndefined();
		else {
			const expected = {
				kind: "html-alternate-representations-v1",
				partial: true,
				truncated: true,
				entries: [],
			};
			expect(documentAlternates(tree)).toEqual(expected);
			expect(extractDocument(tree).sourceAlternates).toEqual(expected);
		}
	},
);

it.each([256, 257])(
	"only reaches an eligible link at direct head child %s within the scan cap",
	(position) => {
		const tree = document("<head></head>");
		const head = headOf(tree);
		for (let index = 1; index < position; index++)
			tree.append(head, tree.createText(" "));
		tree.append(
			head,
			tree.createElement("link", {
				rel: "alternate",
				type: "text/markdown",
				href: "guide.md",
			}),
		);
		expect(documentAlternates(tree)).toEqual({
			kind: "html-alternate-representations-v1",
			partial: true,
			truncated: position > 256,
			entries:
				position > 256
					? []
					: [
							{
								type: "text/markdown",
								url: "https://alternates.fixture.invalid/docs/guide.md",
							},
						],
		});
	},
);

it("reports head scan truncation while retaining earlier eligible entries", () => {
	const tree = document(alternate);
	const head = headOf(tree);
	for (let index = 0; index < 256; index++)
		tree.append(head, tree.createComment("Ignored"));
	expect(documentAlternates(tree)).toEqual({
		kind: "html-alternate-representations-v1",
		partial: true,
		truncated: true,
		entries: [
			{
				type: "text/markdown",
				url: "https://alternates.fixture.invalid/docs/guide.md",
			},
		],
	});
});
