import { afterEach, expect, it } from "vitest";
import { documentHead } from "./document-elements.js";
import { documentDescriptions } from "./document-descriptions.js";
import type { DocumentTree } from "./document.js";
import { svgNamespace } from "./dom-namespaces.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const documents: DocumentTree[] = [];
const url = "https://descriptions.fixture.invalid/";

afterEach(() => {
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function document(source: string, reader = false) {
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
					tabId: "descriptions",
					signal: new AbortController().signal,
					limits: {
						maxNodes: 50000,
						maxDepth: 128,
						maxTextCodeUnits: 2000000,
						maxChanges: 1024,
					},
				},
			)
		: parseHtmlDocument(source, url);
	documents.push(tree);
	return tree;
}

function failure(action: () => unknown) {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected quota failure");
}

it.each([false, true])(
	"retains decoded head descriptions with source provenance, reader=%s",
	(reader) => {
		const tree = document(
			'<head><meta name=" DESCRIPTION " content="A &amp; B"><meta property="OG:DESCRIPTION" content="Other"><meta name="twitter:description" content="Social"></head><body><p>Body</p></body>',
			reader,
		);
		expect(documentDescriptions(tree)).toEqual({
			kind: "html-meta-descriptions-v1",
			partial: true,
			truncated: false,
			entries: [
				{
					attribute: "name",
					name: "description",
					text: "A & B",
					truncated: false,
				},
				{
					attribute: "property",
					name: "og:description",
					text: "Other",
					truncated: false,
				},
				{
					attribute: "name",
					name: "twitter:description",
					text: "Social",
					truncated: false,
				},
			],
		});
		expect(extractDocument(tree).content).toBe("Body\n");
	},
);

it.each([false, true])(
	"preserves duplicates and conflicting descriptions in source order, reader=%s",
	(reader) => {
		const tree = document(
			'<meta name="description" content="First"><meta name="description" content="Different"><meta name="description" content="First">',
			reader,
		);
		expect(
			documentDescriptions(tree)?.entries.map((entry) => entry.text),
		).toEqual(["First", "Different", "First"]);
	},
);

it.each([false, true])(
	"limits entries with explicit truncation, reader=%s",
	(reader) => {
		const tree = document(
			Array.from(
				{ length: 9 },
				(_, index) =>
					`<meta name="description" content="Description ${index}">`,
			).join(""),
			reader,
		);
		const result = documentDescriptions(tree);
		expect(result?.entries).toHaveLength(8);
		expect(result?.truncated).toBe(true);
		expect(result?.entries.at(-1)?.text).toBe("Description 7");
	},
);

it.each([2047, 2048, 2049])(
	"reports exact per-entry boundaries at %s",
	(length) => {
		const tree = document(
			`<meta name="description" content="${"x".repeat(length)}">`,
		);
		const entry = documentDescriptions(tree)?.entries[0];
		expect(entry?.text.length).toBe(Math.min(length, 2048));
		expect(entry?.truncated).toBe(length > 2048);
		expect(documentDescriptions(tree)?.truncated).toBe(false);
	},
);

it("does not split a surrogate pair at the description boundary", () => {
	const tree = document(
		`<meta name="description" content="${"x".repeat(2047)}😀tail">`,
	);
	expect(documentDescriptions(tree)?.entries[0]).toMatchObject({
		text: "x".repeat(2047),
		truncated: true,
	});
});

it.each([false, true])(
	"escapes terminal controls and keeps source text inert, reader=%s",
	(reader) => {
		const tree = document(
			'<meta name="description" content="&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#27;[31m &#x202e;">',
			reader,
		);
		const entry = documentDescriptions(tree)?.entries[0];
		expect(entry?.text).toBe(
			"<script>alert(1)</script> & \\u{1b}[31m \\u{202e}",
		);
		expect(extractDocument(tree).content).toBe("");
	},
);

it.each([
	'<meta name="description">',
	'<meta name="description" content=" \t ">',
	'<meta name="keywords" content="OMITTED">',
	'<meta name="description-more" content="OMITTED">',
	'<meta name="description" content="OMITTED" http-equiv="refresh">',
	'<meta name="description" content="OMITTED" http-equiv="Content-Security-Policy">',
	'<meta name="description" content="OMITTED" http-equiv="">',
	'<body><meta name="description" content="OMITTED"></body>',
	'<head><noscript><meta name="description" content="OMITTED"></noscript></head>',
	'<head><template><meta name="description" content="OMITTED"></template></head>',
	'<head><script>"<meta name=description content=OMITTED>"</script></head>',
	'<head><style>"<meta name=description content=OMITTED>"</style></head>',
])("does not surface omitted or non-head source %s", (source) => {
	for (const reader of [false, true])
		expect(documentDescriptions(document(source, reader))).toBeUndefined();
});

it("ignores foreign meta elements in the head", () => {
	const tree = document("<head></head>");
	const head = documentHead(tree);
	if (head === undefined) throw new Error("Missing head");
	const meta = tree.createParserElement(
		"meta",
		{ name: "description", content: "OMITTED" },
		svgNamespace,
	);
	tree.append(head, meta);
	expect(documentDescriptions(tree)).toBeUndefined();
});

it("returns immutable snapshots across mutation, removal and closure", () => {
	const tree = document('<meta name="description" content="Original">');
	const result = documentDescriptions(tree);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result?.entries)).toBe(true);
	expect(Object.isFrozen(result?.entries[0])).toBe(true);
	const head = documentHead(tree);
	if (head === undefined) throw new Error("Missing head");
	const meta = tree.get(head).children[0];
	tree.setAttribute(meta, "content", "Changed");
	expect(documentDescriptions(tree)?.entries[0].text).toBe("Changed");
	tree.remove(meta);
	expect(documentDescriptions(tree)).toBeUndefined();
	tree.close();
	expect(result?.entries[0].text).toBe("Original");
	expect(() => documentDescriptions(tree)).toThrow();
});

it("preserves only description marker and inert content in reader output", () => {
	const result = sanitizeResearchHtml(
		'<meta id="private" class="private" name="Description" content="A &amp; B" onload="OMITTED" data-token="OMITTED"><p>Body</p>',
	);
	expect(result.html).toBe(
		'<meta name="description" content="A &amp; B"><p>Body</p>',
	);
	expect(result.report.ignoredAttributes).toBe(4);
	expect(result.report.omittedSubtrees.meta).toBeUndefined();
	expect(result.report.textCodeUnits).toBe(9);
});

it("charges retained description text at exact reader text quota", () => {
	const source = '<meta name="description" content="abc">';
	expect(
		sanitizeResearchHtml(source, { maxTextCodeUnits: 3 }).report.textCodeUnits,
	).toBe(3);
	expect(
		resourceLimitDiagnostic(
			failure(() => sanitizeResearchHtml(source, { maxTextCodeUnits: 2 })),
		),
	).toMatchObject({ kind: "reader.text", limit: 2, observed: 3 });
});

it("charges serialized description output at exact reader output quota", () => {
	const source = '<meta name="description" content="a&amp;b">';
	const size = sanitizeResearchHtml(source).html.length;
	expect(
		sanitizeResearchHtml(source, { maxOutputCodeUnits: size }).report
			.outputCodeUnits,
	).toBe(size);
	expect(
		resourceLimitDiagnostic(
			failure(() =>
				sanitizeResearchHtml(source, { maxOutputCodeUnits: size - 1 }),
			),
		),
	).toMatchObject({ kind: "reader.output", limit: size - 1, observed: size });
});

it("charges description metadata to the extraction byte quota", () => {
	const tree = document(
		`<meta name="description" content="${"x".repeat(2048)}"><p>Body</p>`,
	);
	expect(() => extractDocument(tree, { maxBytes: 256 })).toThrow(
		"Extraction metadata limit exceeded",
	);
	expect(
		extractDocument(tree).sourceDescriptions?.entries[0].text,
	).toHaveLength(2048);
});
