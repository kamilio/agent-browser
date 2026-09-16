import { afterEach, describe, expect, it, vi } from "vitest";
import * as codeSourceContext from "./code-source-context.js";
import type { CodeSourceContexts } from "./code-source-context.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import type { DocumentTree } from "./document.js";
import {
	type DocumentExtraction,
	type ExtractedNode,
	type ExtractionOptions,
	discoverDocumentHeadings,
	discoverDocumentLinks,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument, researchReaderInfo } from "./research-loader.js";
import type { ResearchReaderVisibilityPolicy } from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

interface ReaderMode {
	name: string;
	native?: true;
	profile?: "long-v1";
	visibilityPolicy?: ResearchReaderVisibilityPolicy;
}

const readerModes: ReaderMode[] = [
	{ name: "native", native: true },
	{ name: "default raw attributes", visibilityPolicy: "source-hidden-v1" },
	{
		name: "long raw attributes",
		profile: "long-v1",
		visibilityPolicy: "source-hidden-v1",
	},
	{ name: "default raw inline", visibilityPolicy: "source-hidden-inline-v1" },
	{
		name: "long raw inline",
		profile: "long-v1",
		visibilityPolicy: "source-hidden-inline-v1",
	},
];
const formats = ["markdown", "json"] as const;
const url = "https://code-source.fixture.invalid/guide";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const limits = {
	maxNodes: 4096,
	maxDepth: 128,
	maxTextCodeUnits: 200_000,
	maxChanges: 1024,
};
const rust =
	'<pre class="playground"><code class="language-rust edition2024"><span class="boring"># hidden\n</span><strong>let</strong> value = <em>1</em>;\n</code></pre>';
const rustText = "# hidden\nlet value = 1;\n";

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function native(source: string) {
	const tree = parseHtmlDocument(source, url, { limits });
	trees.push(tree);
	return tree;
}

function load(source: string, mode: ReaderMode) {
	if (mode.native) return native(source);
	const body = encoder.encode(source);
	return loadResearchDocument(
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
			tabId: "synthetic-code-source-context",
			signal: new AbortController().signal,
			limits,
			initializeDocument: (tree) => trees.push(tree),
		},
		mode.profile,
		"separate-omitted-raw-v1",
		mode.visibilityPolicy,
	);
}

function element(tree: DocumentTree, selector: string) {
	const queries = new DocumentQueries(tree);
	try {
		const id = queries.querySelector(selector);
		if (id === null)
			throw new Error(`Missing code-source fixture: ${selector}`);
		return id;
	} finally {
		queries.close();
	}
}

function reference(tree: DocumentTree, selector: string) {
	return tree.reference(element(tree, selector));
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function structured(tree: DocumentTree, options: ExtractionOptions = {}) {
	const result = extractDocument(tree, { ...options, format: "json" });
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return result;
}

function markdown(tree: DocumentTree, options: ExtractionOptions = {}) {
	const result = extractDocument(tree, { ...options, format: "markdown" });
	if (result.format !== "markdown")
		throw new Error("Expected Markdown extraction");
	return result;
}

function required(result: DocumentExtraction): CodeSourceContexts {
	const value = result.sourceCodeContexts;
	expect(value).toBeDefined();
	if (!value) throw new Error("Missing code-source contexts");
	return value;
}

function withoutContexts(result: DocumentExtraction) {
	const { sourceCodeContexts: _sourceCodeContexts, ...copy } = result;
	return copy;
}

function baseline(tree: DocumentTree, options: ExtractionOptions = {}) {
	const collector = vi
		.spyOn(codeSourceContext, "collectCodeSourceContexts")
		.mockReturnValue(undefined);
	try {
		return extractDocument(tree, options);
	} finally {
		collector.mockRestore();
	}
}

function bytes(value: unknown) {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

function domSnapshot(tree: DocumentTree) {
	const nodes = [];
	const pending = [tree.root];
	while (pending.length) {
		const id = pending.pop();
		if (id === undefined) break;
		const node = tree.get(id);
		nodes.push(node);
		pending.push(...node.children);
	}
	return JSON.stringify({ revision: tree.revision, nodes });
}

function rustContexts(ref: string): CodeSourceContexts {
	return {
		kind: "native-code-source-context-v1",
		scope: "selected-extracted-pre-text",
		offsetUnit: "utf-16-code-unit",
		partial: true,
		rendered: false,
		verified: false,
		entries: [
			{
				ref,
				textCodeUnits: 24,
				attributes: [
					{ tag: "pre", class: "playground", start: 0, end: 24 },
					{
						tag: "code",
						class: "language-rust edition2024",
						start: 0,
						end: 24,
					},
				],
				ranges: [
					{ kind: "class", tag: "span", token: "boring", start: 0, end: 9 },
					{ kind: "emphasis", tag: "strong", start: 9, end: 12 },
					{ kind: "emphasis", tag: "em", start: 21, end: 22 },
				],
				truncated: false,
			},
		],
		truncated: false,
	};
}

describe.each(readerModes)("code-source integration: $name", (mode) => {
	it("adds exact qualifications without changing content, source or discoveries", () => {
		const tree = load(
			`<main><h1>Rust guide</h1><p><a href="/next">Next</a></p>${rust}</main>`,
			mode,
		);
		const before = domSnapshot(tree);
		const reader = JSON.stringify(researchReaderInfo(tree));
		const headings = discoverDocumentHeadings(tree);
		const links = discoverDocumentLinks(tree, "Next");
		const root = reference(tree, "pre");
		const result = structured(tree);
		const content = JSON.stringify(result.content);
		expect(required(result)).toEqual(rustContexts(root));
		expect(withoutContexts(result)).toEqual(baseline(tree, { format: "json" }));
		const rendered = markdown(tree);
		expect(rendered.sourceCodeContexts).toEqual(result.sourceCodeContexts);
		expect(withoutContexts(rendered)).toEqual(baseline(tree));
		expect(markdown(tree, { root }).content).toBe(
			`\`\`\`\n${rustText}\`\`\`\n`,
		);
		expect(rendered.content).not.toContain("```rust");
		for (const node of flattened(result.content)) {
			expect(node).not.toHaveProperty("sourceCodeContexts");
			expect(node).not.toHaveProperty("class");
		}
		expect(JSON.stringify(result.content)).toBe(content);
		expect(domSnapshot(tree)).toBe(before);
		expect(JSON.stringify(researchReaderInfo(tree))).toBe(reader);
		expect(discoverDocumentHeadings(tree)).toEqual(headings);
		expect(discoverDocumentLinks(tree, "Next")).toEqual(links);
		expect(Object.isFrozen(result.sourceCodeContexts)).toBe(true);
		expect(Object.isFrozen(required(result).entries)).toBe(true);
	});

	it("limits contexts to selected pre roots and heading sections", () => {
		const tree = load(
			`<main><pre class="before">Before</pre><div><h2 id="start">Start</h2>${rust}</div><h2 id="stop">Stop</h2><pre class="after">After</pre></main>`,
			mode,
		);
		const root = reference(tree, "pre.playground");
		for (const format of formats) {
			const selected = extractDocument(tree, { root, format });
			expect(required(selected)).toEqual(rustContexts(root));
			const section = reference(tree, "#start");
			const scoped = extractDocument(tree, { section, format });
			expect(required(scoped)).toEqual(rustContexts(root));
			expect(withoutContexts(scoped)).toEqual(
				baseline(tree, { section, format }),
			);
			const document = extractDocument(tree, { format });
			expect(required(document).entries.map((entry) => entry.ref)).toEqual([
				reference(tree, "pre.before"),
				root,
				reference(tree, "pre.after"),
			]);
			expect(
				extractDocument(tree, { root: reference(tree, "#start"), format }),
			).not.toHaveProperty("sourceCodeContexts");
		}
	});

	it("leaves plain pre text and qualified inline code unannotated", () => {
		const tree = load(
			'<main><pre><code>let plain = 1;</code></pre><p><code class="language-rust"><span class="boring">inline</span><strong>only</strong></code></p></main>',
			mode,
		);
		for (const format of formats) {
			const result = extractDocument(tree, { format });
			expect(result).not.toHaveProperty("sourceCodeContexts");
			expect(result).toEqual(baseline(tree, { format }));
			expect(
				extractDocument(tree, { root: reference(tree, "p code"), format }),
			).not.toHaveProperty("sourceCodeContexts");
		}
	});

	it("serializes full opaque classes without asserting runtime behavior", () => {
		const className =
			'language-rust edition2024 should_panic ignore does_not_compile noplayground 😀"<&\r';
		const tree = load(
			'<pre class="programlisting"><code class="language-rust edition2024 should_panic ignore does_not_compile noplayground 😀&quot;&lt;&amp;&#13;">value</code></pre>',
			mode,
		);
		const result = markdown(tree, { root: reference(tree, "pre") });
		const contexts = required(result);
		expect(contexts.entries[0].attributes).toEqual([
			{ tag: "pre", class: "programlisting", start: 0, end: 5 },
			{ tag: "code", class: className, start: 0, end: 5 },
		]);
		expect(JSON.parse(JSON.stringify(contexts))).toEqual(contexts);
		expect(result.content).toBe("```\nvalue\n```\n");
		expect(contexts).toMatchObject({
			partial: true,
			rendered: false,
			verified: false,
		});
		expect(Object.keys(contexts.entries[0])).toEqual([
			"ref",
			"textCodeUnits",
			"attributes",
			"ranges",
			"truncated",
		]);
	});

	it.each(formats)(
		"retains feed metadata through the %s early return",
		(format) => {
			const tree = load(
				`<!doctype html><html><head><title>Guide</title><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body><main>${rust}</main></body></html>`,
				mode,
			);
			const result = extractDocument(tree, { format });
			expect(result.sourceFeeds).toMatchObject({
				kind: "html-feed-links-v1",
				entries: [
					{
						type: "application/rss+xml",
						url: "https://code-source.fixture.invalid/feed.xml",
					},
				],
			});
			expect(required(result)).toEqual(rustContexts(reference(tree, "pre")));
			expect(withoutContexts(result)).toEqual(baseline(tree, { format }));
		},
	);

	it("does not annotate code omitted by a text-prefix fallback", () => {
		const tree = load(
			`<main><p>${"Readable prefix 😀. ".repeat(3000)}</p>${rust}</main>`,
			mode,
		);
		const options: ExtractionOptions = {
			maxBytes: 4096,
			outputLimitPolicy: "text-prefix-v1",
		};
		const result = markdown(tree, options);
		expect(result.contentFallback).toMatchObject({
			policy: "text-prefix-v1",
			representation: "indented-plain-text",
			truncated: true,
		});
		expect(result.content).not.toContain("let value");
		expect(result).not.toHaveProperty("sourceCodeContexts");
		expect(result).toEqual(baseline(tree, options));
		expect(bytes(result)).toBeLessThanOrEqual(4096);
	});
});

it.each(readerModes)("honors source visibility in $name", (mode) => {
	const tree = load(
		'<main><pre hidden class="hidden">Hidden</pre><pre inert class="inert">Inert</pre><pre aria-hidden="true" class="aria">Aria</pre><pre style="display:none" class="inline">Inline</pre><template><pre class="template">Template</pre></template><pre class="visible">Visible</pre></main>',
		mode,
	);
	const expectedClasses = mode.native
		? ["visible"]
		: mode.visibilityPolicy === "source-hidden-inline-v1"
			? ["inert", "visible"]
			: ["inert", "inline", "visible"];
	for (const format of formats) {
		const result = extractDocument(tree, { format });
		expect(
			required(result).entries.map((entry) => entry.attributes[0].class),
		).toEqual(expectedClasses);
	}
	if (mode.native) {
		for (const selector of [".hidden", ".inert", ".aria", ".inline"]) {
			const result = structured(tree, { root: reference(tree, selector) });
			expect(result).not.toHaveProperty("sourceCodeContexts");
		}
	}
});

it.each(["p", "h2", "code", "strong", "em"])(
	"does not discover pre contexts beneath the %s text sink",
	(tag) => {
		const tree = native(
			`<main><${tag} id="sink">Prefix</${tag}>${rust}</main>`,
		);
		const pre = element(tree, "pre");
		tree.append(element(tree, "#sink"), pre);
		const result = structured(tree);
		expect(flattened(result.content).some((node) => node.type === "pre")).toBe(
			true,
		);
		expect(result).not.toHaveProperty("sourceCodeContexts");
		expect(markdown(tree)).not.toHaveProperty("sourceCodeContexts");
		expect(required(structured(tree, { root: tree.reference(pre) }))).toEqual(
			rustContexts(tree.reference(pre)),
		);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"does not qualify foreign pre nodes in %s",
	(namespace) => {
		const tree = native("<main></main>");
		const pre = tree.createParserElement(
			"pre",
			{ class: "playground" },
			namespace,
		);
		tree.append(pre, tree.createText("Foreign source"));
		tree.append(element(tree, "main"), pre);
		for (const format of formats) {
			expect(extractDocument(tree, { format })).not.toHaveProperty(
				"sourceCodeContexts",
			);
			expect(
				extractDocument(tree, { format, root: tree.reference(pre) }),
			).not.toHaveProperty("sourceCodeContexts");
		}
	},
);

it("uses cleaned UTF16 offsets for astral text, controls and breaks", () => {
	const tree = native(
		'<pre class="programlisting"><code>😀<span class="boring">\u0001\r\n</span><strong>é</strong><br><em>\u202e</em></code></pre>',
	);
	const root = reference(tree, "pre");
	const result = markdown(tree, { root });
	const text = "😀\\u{1}\né\n\\u{202e}";
	expect(result.content).toBe(`\`\`\`\n${text}\n\`\`\`\n`);
	expect(required(result).entries).toEqual([
		{
			ref: root,
			textCodeUnits: 18,
			attributes: [{ tag: "pre", class: "programlisting", start: 0, end: 18 }],
			ranges: [
				{ kind: "class", tag: "span", token: "boring", start: 2, end: 8 },
				{ kind: "emphasis", tag: "strong", start: 8, end: 9 },
				{ kind: "emphasis", tag: "em", start: 10, end: 18 },
			],
			truncated: false,
		},
	]);
});

it("retains nested overlapping source ranges and PostgreSQL emphasis tags", () => {
	const tree = native(
		'<pre class="programlisting"><code><span class="boring"><strong>SE<b>LE</b>CT</strong> <i>x</i></span></code></pre>',
	);
	const result = markdown(tree, { root: reference(tree, "pre") });
	expect(result.content).toBe("```\nSELECT x\n```\n");
	expect(required(result).entries[0].ranges).toEqual([
		{ kind: "class", tag: "span", token: "boring", start: 0, end: 8 },
		{ kind: "emphasis", tag: "strong", start: 0, end: 6 },
		{ kind: "emphasis", tag: "b", start: 2, end: 4 },
		{ kind: "emphasis", tag: "i", start: 7, end: 8 },
	]);
});

it.each(formats)(
	"fits optional contexts at exact UTF8 %s boundaries",
	(format) => {
		const tree = native(
			`<main><p>${"Preserved content. ".repeat(12)}</p><pre class="é😀&quot;">first</pre><pre class="programlisting">second</pre></main>`,
		);
		const full = extractDocument(tree, { format });
		const contexts = required(full);
		const snapshot = JSON.stringify(full);
		const original = baseline(tree, { format });
		expect(withoutContexts(full)).toEqual(original);
		expect(bytes(full)).toBeGreaterThan(JSON.stringify(full).length);
		expect(extractDocument(tree, { format, maxBytes: bytes(full) })).toEqual(
			full,
		);
		const prefix = {
			...original,
			sourceCodeContexts: {
				...contexts,
				entries: contexts.entries.slice(0, 1),
				truncated: true,
			},
		};
		const empty = {
			...original,
			sourceCodeContexts: { ...contexts, entries: [], truncated: true },
		};
		expect(extractDocument(tree, { format, maxBytes: bytes(prefix) })).toEqual(
			prefix,
		);
		expect(extractDocument(tree, { format, maxBytes: bytes(empty) })).toEqual(
			empty,
		);
		for (const maxBytes of [
			bytes(original),
			bytes(empty) - 1,
			bytes(prefix) - 1,
			bytes(full) - 1,
		]) {
			const options: ExtractionOptions = {
				format,
				maxBytes,
				...(format === "markdown"
					? { outputLimitPolicy: "text-prefix-v1" as const }
					: {}),
			};
			const result = extractDocument(tree, options);
			expect(withoutContexts(result)).toEqual(baseline(tree, options));
			expect(result).not.toHaveProperty("contentFallback");
			expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
			if (result.sourceCodeContexts) {
				expect(result.sourceCodeContexts.truncated).toBe(true);
				expect(result.sourceCodeContexts.entries).toEqual(
					contexts.entries.slice(0, result.sourceCodeContexts.entries.length),
				);
			} else expect(maxBytes).toBeLessThan(bytes(empty));
		}
		expect(JSON.stringify(full)).toBe(snapshot);
	},
);

describe.each(
	readerModes.filter(
		(mode) => mode.visibilityPolicy === "source-hidden-inline-v1",
	),
)("optional metadata priority: $name", (mode) => {
	it.each(formats)(
		"preserves source access and feeds before fitting %s contexts",
		(format) => {
			const tree = load(
				`<html><head><script type="application/ld+json">{"@context":"https://schema.org","isAccessibleForFree":false}</script><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body><main><p>${"Preserved source content. ".repeat(20)}</p>${rust}</main></body></html>`,
				mode,
			);
			const full = extractDocument(tree, { format });
			expect(full.sourceAccess).toMatchObject({
				kind: "jsonld-free-access-declarations-v1",
				entries: [{ path: "$", value: false }],
			});
			expect(full.sourceFeeds?.entries).toHaveLength(1);
			expect(required(full).entries).toHaveLength(1);
			const original = baseline(tree, { format });
			for (const maxBytes of [
				bytes(original),
				bytes(original) + 1,
				bytes(full) - 1,
			]) {
				const options = { format, maxBytes };
				const result = extractDocument(tree, options);
				expect(withoutContexts(result)).toEqual(baseline(tree, options));
				expect(result.sourceAccess).toEqual(full.sourceAccess);
				expect(result.sourceFeeds).toEqual(full.sourceFeeds);
				expect(result).not.toHaveProperty("contentFallback");
				expect(bytes(result)).toBeLessThanOrEqual(maxBytes);
			}
		},
	);
});

it.each([{ maxNodes: 1 }, { maxDepth: 0 }])(
	"does not weaken existing extraction quota %j",
	(options) => {
		const tree = native(`<main>${rust}</main>`);
		const failure = (action: () => unknown) => {
			try {
				action();
			} catch (error) {
				expect(error).toMatchObject({ code: "resource-limit" });
				return {
					message: String(error),
					diagnostic: resourceLimitDiagnostic(error),
				};
			}
			throw new Error("Expected extraction resource limit");
		};
		expect(failure(() => extractDocument(tree, options))).toEqual(
			failure(() => baseline(tree, options)),
		);
	},
);

it("does not relabel reconstructed GitHub div blocks as original pre source", () => {
	const tree = native(
		'<main><div class="react-code-file-contents"><div class="react-line-numbers"><div class="react-line-number react-code-text">1</div></div><div class="react-code-lines"><div class="react-code-text react-code-line-contents"><div><div class="react-file-line" id="LC1"><span class="boring">let</span> value = 1;</div></div></div></div></div></main>',
	);
	const result = structured(tree);
	expect(result.sourceCodeBlocks).toMatchObject({
		kind: "github-ssr-lines-v1",
		blocks: 1,
		lines: 1,
	});
	expect(flattened(result.content).some((node) => node.type === "pre")).toBe(
		true,
	);
	expect(result).not.toHaveProperty("sourceCodeContexts");
	expect(markdown(tree)).not.toHaveProperty("sourceCodeContexts");
});
