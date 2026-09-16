import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { type ExtractionOptions, extractDocument } from "./extraction.js";
import { htmlParseInfo, setHtmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotElementRole } from "./snapshot.js";

const trees: DocumentTree[] = [];
const url = "https://example.com/content-focus";
const focus = { contentFocus: "main-content-v1" } as const;
const formats = ["markdown", "json"] as const;
const encoder = new TextEncoder();

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function document() {
	const tree = new DocumentTree(url);
	trees.push(tree);
	return tree;
}

function html(source: string) {
	const tree = parseHtmlDocument(source, url);
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

function element(tree: DocumentTree, selector: string) {
	const id = new DocumentQueries(tree).querySelector(selector);
	if (id === null) throw new Error(`Missing fixture element: ${selector}`);
	return id;
}

interface Selection {
	selected: "main" | "article" | "document";
	reason:
		| "unique-main"
		| "unique-article"
		| "ambiguous-main"
		| "ambiguous-article"
		| "article-with-outside-content"
		| "no-nonempty-landmark";
	mainCandidates: number;
	articleCandidates: number;
}

function assertFocused(
	tree: DocumentTree,
	expected: Selection,
	target = tree.root,
) {
	let scannedNodes: number | undefined;
	for (const format of formats) {
		const result = extractDocument(tree, { ...focus, format });
		const { contentSelection, ...ordinary } = result;
		expect(contentSelection).toEqual({
			policy: "main-content-v1",
			...expected,
			scannedNodes: expect.any(Number),
		});
		expect(Object.isFrozen(contentSelection)).toBe(true);
		expect(contentSelection?.scannedNodes).toBeGreaterThan(0);
		if (scannedNodes !== undefined)
			expect(contentSelection?.scannedNodes).toBe(scannedNodes);
		scannedNodes = contentSelection?.scannedNodes;
		expect(result.scope).toBe(tree.reference(target));
		expect(ordinary).toEqual(
			extractDocument(tree, { format, root: tree.reference(target) }),
		);
		const baseline = extractDocument(tree, { format });
		expect(baseline).not.toHaveProperty("contentSelection");
		if (target === tree.root) expect(ordinary).toEqual(baseline);
	}
}

function assertConservative(
	tree: DocumentTree,
	expected: Selection & { outsideArticleContent: boolean },
	target = tree.root,
) {
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	for (const format of formats) {
		const result = extractDocument(tree, {
			contentFocus: "main-content-v2",
			format,
		});
		const { contentSelection, ...ordinary } = result;
		expect(contentSelection).toEqual({
			policy: "main-content-v2",
			...expected,
			scannedNodes: expect.any(Number),
		});
		expect(Object.isFrozen(contentSelection)).toBe(true);
		expect(result.scope).toBe(tree.reference(target));
		expect(ordinary).toEqual(
			extractDocument(tree, { format, root: tree.reference(target) }),
		);
		const legacy = extractDocument(tree, { ...focus, format });
		expect(contentSelection?.scannedNodes).toBe(
			legacy.contentSelection?.scannedNodes,
		);
		expect(legacy.contentSelection).not.toHaveProperty("outsideArticleContent");
	}
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree, tree.root)).toBe(source);
}

it.each([
	"<p>Other substantive text</p>",
	"<section><h2>Product Alpha</h2><p>Weatherproof light</p></section>",
	'<a href="/product">Product details</a>',
	'<img alt="Product diagram">',
	"<table><tr><td>Product measurement</td></tr></table>",
	"<div><section><div>Nested content</div></section></div>",
	"Loose sibling text",
	'<div style="visibility:hidden"><p style="visibility:visible">Visible child</p></div>',
])("v2 retains admitted outside article content: %s", (outside) => {
	for (const source of [
		`${outside}<article>Daily promotion</article>`,
		`<article>Daily promotion</article>${outside}`,
	]) {
		const tree = html(source);
		assertConservative(tree, {
			selected: "document",
			reason: "article-with-outside-content",
			mainCandidates: 0,
			articleCandidates: 1,
			outsideArticleContent: true,
		});
		expect(extractDocument(tree, focus).contentSelection?.selected).toBe(
			"article",
		);
	}
});

it.each([
	"<nav><div>Navigation</div></nav>",
	"<aside><p>Related story</p></aside>",
	"<header><h1>Site title</h1></header>",
	"<footer><p>Footer qualification</p></footer>",
	'<div role="navigation"><p>Navigation</p></div>',
	'<div role="banner"><p>Banner</p></div>',
	'<div role="contentinfo"><p>Footer</p></div>',
	'<div role="complementary"><img alt="Sidebar diagram"></div>',
	'<div role="unknown navigation"><p>Fallback role</p></div>',
	'<nav role="none"><p>Presentational nav tag</p></nav>',
	'<div role="navigation" style="visibility:hidden"><p style="visibility:visible">Visible navigation child</p></div>',
])(
	"v2 keeps a lone article when surrounded by ancillary context: %s",
	(outside) => {
		const tree = html(`${outside}<article id="chosen">Owned article</article>`);
		assertConservative(
			tree,
			{
				selected: "article",
				reason: "unique-article",
				mainCandidates: 0,
				articleCandidates: 1,
				outsideArticleContent: false,
			},
			element(tree, "#chosen"),
		);
	},
);

it.each([
	" \n\t&nbsp; ",
	"<!-- Outside comment -->",
	"<title>Document title</title>",
	"<script>Outside script</script>",
	"<style>.outside { display: block }</style>",
	"<template>Template content</template>",
	"<p hidden>Hidden outside text</p>",
	"<p inert>Inert outside text</p>",
	'<p aria-hidden="true">ARIA hidden outside text</p>',
	'<p style="display:none">Display hidden outside text</p>',
	'<p style="visibility:hidden">Invisible outside text</p>',
	'<img alt=" \t ">',
	'<input value="Input value">',
	'<div title="Attribute-only content"></div>',
	"<article> </article>",
])("v2 does not widen for omitted or empty outside content: %s", (outside) => {
	const tree = html(`${outside}<article id="chosen">Owned article</article>`);
	assertConservative(
		tree,
		{
			selected: "article",
			reason: "unique-article",
			mainCandidates: 0,
			articleCandidates: 1,
			outsideArticleContent: false,
		},
		element(tree, "#chosen"),
	);
});

it("v2 keeps article descendants inside their owning article context", () => {
	const tree = html(
		'<article id="chosen"><h1>Owned title</h1><article><p>Nested article</p><img alt="Owned diagram"></article><p>Closing paragraph</p></article>',
	);
	assertConservative(
		tree,
		{
			selected: "article",
			reason: "unique-article",
			mainCandidates: 0,
			articleCandidates: 1,
			outsideArticleContent: false,
		},
		element(tree, "#chosen"),
	);
});

it("v2 preserves explicit main priority despite outside content", () => {
	const tree = html(
		'<p>Outside evidence</p><main id="chosen"><article>Owned article</article><p>Main context</p></main>',
	);
	assertConservative(
		tree,
		{
			selected: "main",
			reason: "unique-main",
			mainCandidates: 1,
			articleCandidates: 1,
			outsideArticleContent: true,
		},
		element(tree, "#chosen"),
	);
});

it.each([
	{
		source:
			"<main>First main</main><main>Second main</main><article>Article</article>",
		reason: "ambiguous-main" as const,
		mainCandidates: 2,
		articleCandidates: 1,
		outsideArticleContent: true,
	},
	{
		source: "<article>First article</article><article>Second article</article>",
		reason: "ambiguous-article" as const,
		mainCandidates: 0,
		articleCandidates: 2,
		outsideArticleContent: false,
	},
	{
		source: "<p>No landmark</p>",
		reason: "no-nonempty-landmark" as const,
		mainCandidates: 0,
		articleCandidates: 0,
		outsideArticleContent: true,
	},
])("v2 preserves $reason document fallback", ({ source, ...expected }) => {
	assertConservative(html(source), { selected: "document", ...expected });
});

it("v2 does not treat foreign namespace ancillary names as HTML contexts", () => {
	const tree = document();
	append(tree, tree.root, "article", "Owned article");
	const foreign = tree.createParserElement(
		"aside",
		{ role: "complementary" },
		svgNamespace,
	);
	tree.append(tree.root, foreign);
	const text = tree.createText("Foreign outside content");
	tree.append(foreign, text);
	assertConservative(tree, {
		selected: "document",
		reason: "article-with-outside-content",
		mainCandidates: 0,
		articleCandidates: 1,
		outsideArticleContent: true,
	});
});

it("v2 re-evaluates outside content after mutation without caching a scope", () => {
	const tree = html(
		'<article id="chosen">Owned article</article><div id="extra"></div>',
	);
	const extra = element(tree, "#extra");
	expect(
		extractDocument(tree, { contentFocus: "main-content-v2" }).contentSelection,
	).toMatchObject({ selected: "article", outsideArticleContent: false });
	tree.setTextContent(extra, "New outside evidence");
	assertConservative(tree, {
		selected: "document",
		reason: "article-with-outside-content",
		mainCandidates: 0,
		articleCandidates: 1,
		outsideArticleContent: true,
	});
});

it("v2 uses the same bounded scan without a second traversal allowance", () => {
	const tree = html(
		"<article>Daily promotion</article><section>Other evidence</section>",
	);
	const nodes = extractDocument(tree, focus).contentSelection?.scannedNodes;
	if (nodes === undefined) throw new Error("Expected bounded scan metadata");
	expect(
		extractDocument(tree, { contentFocus: "main-content-v2", maxNodes: nodes })
			.contentSelection?.scannedNodes,
	).toBe(nodes);
	expect(() =>
		extractDocument(tree, {
			contentFocus: "main-content-v2",
			maxNodes: nodes - 1,
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		extractDocument(tree, { contentFocus: "main-content-v2", maxDepth: 0 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("selects the full main subtree without changing the default or the tree", () => {
	const tree = html(
		'<title>Focus fixture</title><nav>Navigation</nav><main id="chosen"><h1>Heading</h1><p>Read <a href="/next">next</a> and <strong>more</strong>.</p><ul><li>First</li><li>Second</li></ul><blockquote>Quote</blockquote><pre>code\nline</pre><img alt="Diagram" src="/diagram.png"><table><tr><th>Name</th></tr><tr><td>Value</td></tr></table></main><footer>Footer</footer>',
	);
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	const changes = tree.changesSince(0);
	const baseline = formats.map((format) => extractDocument(tree, { format }));
	const target = element(tree, "#chosen");
	assertFocused(
		tree,
		{
			selected: "main",
			reason: "unique-main",
			mainCandidates: 1,
			articleCandidates: 0,
		},
		target,
	);
	for (const format of formats) {
		const result = extractDocument(tree, { ...focus, format });
		expect(extractDocument(tree, { ...focus, format })).toEqual(result);
		expect(JSON.stringify(result.content)).not.toContain("Navigation");
		expect(JSON.stringify(result.content)).not.toContain("Footer");
	}
	expect(formats.map((format) => extractDocument(tree, { format }))).toEqual(
		baseline,
	);
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree, tree.root)).toBe(source);
	expect(tree.changesSince(0)).toEqual(changes);
});

it.each<{
	tag: string;
	attributes: Record<string, string>;
	role: string | undefined;
}>([
	{ tag: "main", attributes: {}, role: "main" },
	{ tag: "article", attributes: {}, role: "article" },
	{ tag: "div", attributes: { role: "unknown main article" }, role: "main" },
	{ tag: "div", attributes: { role: "unknown article main" }, role: "article" },
	{ tag: "div", attributes: { role: " \tmain\narticle " }, role: "main" },
	{ tag: "main", attributes: { role: "article" }, role: "article" },
	{ tag: "article", attributes: { role: "main" }, role: "main" },
	{ tag: "main", attributes: { role: "unknown" }, role: "main" },
	{ tag: "main", attributes: { role: "presentation" }, role: undefined },
	{ tag: "article", attributes: { role: "none" }, role: undefined },
	{ tag: "main", attributes: { role: "button main" }, role: "button" },
	{ tag: "article", attributes: { role: "generic article" }, role: "generic" },
	{ tag: "div", attributes: { role: "MAIN" }, role: undefined },
	{ tag: "div", attributes: { role: "presentation main" }, role: "main" },
	{ tag: "button", attributes: { role: "main" }, role: "main" },
])(
	"uses native role semantics for $tag with $attributes",
	({ tag, attributes, role }) => {
		const tree = document();
		append(tree, tree.root, "p", "Outside");
		const candidate = append(tree, tree.root, tag, "Candidate", attributes);
		expect(snapshotElementRole(tree, candidate)).toBe(role);
		const selected = role === "main" || role === "article" ? role : "document";
		assertFocused(
			tree,
			{
				selected,
				reason:
					selected === "main"
						? "unique-main"
						: selected === "article"
							? "unique-article"
							: "no-nonempty-landmark",
				mainCandidates: role === "main" ? 1 : 0,
				articleCandidates: role === "article" ? 1 : 0,
			},
			selected === "document" ? tree.root : candidate,
		);
	},
);

it.each<Selection & { name: string; source: string }>([
	{
		name: "outermost nested mains",
		source: '<main id="chosen"><main>Nested</main></main>',
		selected: "main",
		reason: "unique-main",
		mainCandidates: 1,
		articleCandidates: 0,
	},
	{
		name: "outermost nested articles",
		source: '<article id="chosen"><div role="article">Nested</div></article>',
		selected: "article",
		reason: "unique-article",
		mainCandidates: 0,
		articleCandidates: 1,
	},
	{
		name: "empty mains do not mask an article",
		source:
			'<main> \n\t<img alt=" "><br><hr></main><article id="chosen">Article</article>',
		selected: "article",
		reason: "unique-article",
		mainCandidates: 0,
		articleCandidates: 1,
	},
	{
		name: "empty siblings are not ambiguity",
		source: '<main> </main><main id="chosen">Main</main><article> </article>',
		selected: "main",
		reason: "unique-main",
		mainCandidates: 1,
		articleCandidates: 0,
	},
	{
		name: "main takes precedence over an earlier article",
		source: '<article>Article</article><main id="chosen">Main</main>',
		selected: "main",
		reason: "unique-main",
		mainCandidates: 1,
		articleCandidates: 1,
	},
	{
		name: "main takes precedence over ambiguous articles",
		source:
			'<main id="chosen">Main</main><article>First</article><article>Second</article>',
		selected: "main",
		reason: "unique-main",
		mainCandidates: 1,
		articleCandidates: 2,
	},
	{
		name: "main inside an article",
		source: '<article>Lead<main id="chosen">Main</main></article>',
		selected: "main",
		reason: "unique-main",
		mainCandidates: 1,
		articleCandidates: 1,
	},
	{
		name: "ambiguous mains never fall through to a unique article",
		source: "<main>First</main><article>Article</article><main>Second</main>",
		selected: "document",
		reason: "ambiguous-main",
		mainCandidates: 2,
		articleCandidates: 1,
	},
	{
		name: "ambiguous articles preserve the document",
		source: "<article>First</article><article>Second</article>",
		selected: "document",
		reason: "ambiguous-article",
		mainCandidates: 0,
		articleCandidates: 2,
	},
	{
		name: "no landmarks preserve ordinary content",
		source: "<nav>Navigation</nav><p>Ordinary</p><footer>Footer</footer>",
		selected: "document",
		reason: "no-nonempty-landmark",
		mainCandidates: 0,
		articleCandidates: 0,
	},
	{
		name: "image alt alone makes a main nonempty",
		source: '<main id="chosen"><img alt="Diagram" src="/diagram.png"></main>',
		selected: "main",
		reason: "unique-main",
		mainCandidates: 1,
		articleCandidates: 0,
	},
	{
		name: "accessible labels and image URLs alone are not content",
		source:
			'<main aria-label="Label"><img src="/diagram.png" title="Title"></main>',
		selected: "document",
		reason: "no-nonempty-landmark",
		mainCandidates: 0,
		articleCandidates: 0,
	},
])("handles $name", ({ source, name: _name, ...expected }) => {
	const tree = html(source);
	assertFocused(
		tree,
		expected,
		expected.selected === "document" ? tree.root : element(tree, "#chosen"),
	);
});

it.each(["hidden", "inert", 'aria-hidden="TrUe"', 'style="display:none"'])(
	"excludes %s subtrees, including visibility-restored descendants",
	(attribute) => {
		const tree = html(
			`<main ${attribute}>Secret<span style="visibility:visible">Still secret</span><article>Hidden article</article></main><div ${attribute}><main>Hidden main</main></div><article id="chosen">Public</article>`,
		);
		assertFocused(
			tree,
			{
				selected: "article",
				reason: "unique-article",
				mainCandidates: 0,
				articleCandidates: 1,
			},
			element(tree, "#chosen"),
		);
	},
);

it.each([
	"head",
	"script",
	"style",
	"template",
	"iframe",
	"noembed",
	"noframes",
	"object",
	"embed",
	"canvas",
	"input",
	"textarea",
	"select",
	"datalist",
])("excludes %s roles, text, values and descendants", (tag) => {
	const tree = document();
	const omitted = append(tree, tree.root, tag, "Secret", {
		role: "main",
		value: "Private",
	});
	append(tree, omitted, "main", "Hidden main");
	const empty = append(tree, tree.root, "main");
	append(tree, empty, tag, "Hidden text", { value: "Private" });
	const article = append(tree, tree.root, "article", "Public");
	assertFocused(
		tree,
		{
			selected: "article",
			reason: "unique-article",
			mainCandidates: 0,
			articleCandidates: 1,
		},
		article,
	);
});

it.each([false, true])(
	"respects noscript admission with scripting=%s",
	(scripting) => {
		const tree = html(
			'<body><noscript id="candidate" role="main">Fallback</noscript><article id="chosen">Article</article></body>',
		);
		const info = htmlParseInfo(tree);
		if (!info) throw new Error("Missing parsed fixture metadata");
		setHtmlParseInfo(tree, { ...info, scripting });
		assertFocused(
			tree,
			{
				selected: scripting ? "article" : "main",
				reason: scripting ? "unique-article" : "unique-main",
				mainCandidates: scripting ? 0 : 1,
				articleCandidates: 1,
			},
			element(tree, scripting ? "#chosen" : "#candidate"),
		);
	},
);

it("emits restored text at document fallback without admitting an invisible main", () => {
	const tree = html(
		'<main style="visibility:hidden">Invisible<span style="visibility:visible">Restored</span></main><p>Outside</p>',
	);
	assertFocused(tree, {
		selected: "document",
		reason: "no-nonempty-landmark",
		mainCandidates: 0,
		articleCandidates: 0,
	});
	expect(extractDocument(tree, focus).content).toContain("Restored");
	expect(extractDocument(tree, focus).content).not.toContain("Invisible");
});

it("admits a visible main restored within an invisible main", () => {
	const tree = html(
		'<main style="visibility:hidden">Invisible<main id="chosen" style="visibility:visible">Restored</main></main>',
	);
	assertFocused(
		tree,
		{
			selected: "main",
			reason: "unique-main",
			mainCandidates: 1,
			articleCandidates: 0,
		},
		element(tree, "#chosen"),
	);
});

it("uses restored text but not hidden text or alt to establish nonemptiness", () => {
	const tree = html(
		'<main><span style="visibility:hidden">Hidden</span><img style="visibility:hidden" alt="Hidden alt"></main><main id="chosen"><span style="visibility:hidden">Hidden<span style="visibility:visible">Restored</span></span></main>',
	);
	assertFocused(
		tree,
		{
			selected: "main",
			reason: "unique-main",
			mainCandidates: 1,
			articleCandidates: 0,
		},
		element(tree, "#chosen"),
	);
});

it.each(["img", "br", "hr"])(
	"matches extraction leaf descent for %s",
	(tag) => {
		const tree = document();
		const leaf = append(tree, tree.root, tag);
		append(tree, leaf, "main", "Unreachable");
		const article = append(tree, tree.root, "article", "Article");
		assertFocused(
			tree,
			{
				selected: "article",
				reason: "unique-article",
				mainCandidates: 0,
				articleCandidates: 1,
			},
			article,
		);
		const hiddenLeaf = append(tree, tree.root, tag, undefined, {
			style: "visibility:hidden",
		});
		const main = append(tree, hiddenLeaf, "main", "Restored", {
			style: "visibility:visible",
		});
		assertFocused(
			tree,
			{
				selected: "main",
				reason: "unique-main",
				mainCandidates: 1,
				articleCandidates: 1,
			},
			main,
		);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"never selects foreign namespace landmarks in %s",
	(namespace) => {
		const tree = document();
		for (const tag of ["main", "article", "g"]) {
			const foreign = tree.createParserElement(tag, {}, namespace);
			tree.append(tree.root, foreign);
			tree.setTextContent(foreign, "Foreign content");
			const explicit = tree.createParserElement(
				"g",
				{ role: tag === "article" ? "article" : "main" },
				namespace,
			);
			tree.append(tree.root, explicit);
			tree.setTextContent(explicit, "Foreign explicit role");
		}
		assertFocused(tree, {
			selected: "document",
			reason: "no-nonempty-landmark",
			mainCandidates: 0,
			articleCandidates: 0,
		});
		const article = append(tree, tree.root, "article", "HTML article");
		assertFocused(
			tree,
			{
				selected: "article",
				reason: "unique-article",
				mainCandidates: 0,
				articleCandidates: 1,
			},
			article,
		);
	},
);

it.each(["root", "section", "lines"] as const)(
	"rejects focus combined with %s",
	(option) => {
		const tree = html('<main><h1 id="heading">Heading</h1><p>Text</p></main>');
		const value =
			option === "lines"
				? { start: 1, end: 1 }
				: tree.reference(
						option === "section" ? element(tree, "#heading") : tree.root,
					);
		for (const format of formats)
			expect(() =>
				extractDocument(tree, { ...focus, format, [option]: value }),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each(["", "main-content-v4", "main", null, false, 1, {}])(
	"rejects unsupported focus policy %j",
	(contentFocus) => {
		const tree = html("<main>Content</main>");
		for (const format of formats)
			expect(() =>
				extractDocument(tree, {
					format,
					contentFocus,
				} as unknown as ExtractionOptions),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each([
	{ maxNodes: 0 },
	{ maxNodes: Number.NaN },
	{ maxNodes: 50_001 },
	{ maxDepth: -1 },
	{ maxDepth: 1025 },
	{ maxBytes: 255 },
])("retains invalid limit validation for %j", (limits) => {
	const tree = html("<main>Content</main>");
	expect(() => extractDocument(tree, { ...focus, ...limits })).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("counts the complete scan, including content after the selected main", () => {
	const tree = document();
	const main = append(tree, tree.root, "main");
	append(tree, main, "p", "Selected");
	append(tree, tree.root, "footer", "After");
	append(tree, tree.root, "article", "Later article");
	for (const format of formats) {
		const result = extractDocument(tree, {
			...focus,
			format,
			maxNodes: 8,
			maxDepth: 3,
		});
		expect(result.contentSelection).toEqual({
			policy: "main-content-v1",
			selected: "main",
			reason: "unique-main",
			mainCandidates: 1,
			articleCandidates: 1,
			scannedNodes: 8,
		});
		expect(result.scope).toBe(tree.reference(main));
		expect(() =>
			extractDocument(tree, { ...focus, format, maxNodes: 7 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
	expect(() =>
		extractDocument(tree, {
			...focus,
			maxNodes: 7,
			outputLimitPolicy: "text-prefix-v1",
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("preserves an empty document with the smallest structural bounds", () => {
	const tree = document();
	assertFocused(tree, {
		selected: "document",
		reason: "no-nonempty-landmark",
		mainCandidates: 0,
		articleCandidates: 0,
	});
	for (const format of formats) {
		const result = extractDocument(tree, {
			...focus,
			format,
			maxNodes: 1,
			maxDepth: 0,
		});
		expect(result.contentSelection?.scannedNodes).toBe(1);
	}
});

it("checks depth outside the selected main before producing output", () => {
	const tree = document();
	append(tree, tree.root, "main", "Selected");
	let parent = tree.root;
	for (let depth = 0; depth < 3; depth++) parent = append(tree, parent, "div");
	append(tree, parent, "span", "Deep");
	for (const format of formats) {
		expect(
			extractDocument(tree, { ...focus, format, maxDepth: 5 }).contentSelection
				?.selected,
		).toBe("main");
		expect(() =>
			extractDocument(tree, { ...focus, format, maxDepth: 4 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
	expect(() =>
		extractDocument(tree, {
			...focus,
			maxDepth: 4,
			outputLimitPolicy: "text-prefix-v1",
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("does not descend into excluded subtrees during a bounded scan", () => {
	const tree = document();
	const hidden = append(tree, tree.root, "div", undefined, { hidden: "" });
	let parent = hidden;
	for (let depth = 0; depth < 6; depth++)
		parent = append(tree, parent, "main", "Hidden");
	append(tree, tree.root, "main", "Selected");
	const result = extractDocument(tree, { ...focus, maxNodes: 4, maxDepth: 2 });
	expect(result.contentSelection).toMatchObject({
		selected: "main",
		mainCandidates: 1,
	});
	expect(result.content).toBe("Selected\n");
});

it.each(formats)(
	"enforces exact serialized output bytes with focus in %s",
	(format) => {
		const tree = html(
			"<main><p>Selected content with 雪 and quotes.</p></main><footer>Outside</footer>",
		);
		const result = extractDocument(tree, { ...focus, format });
		const maxBytes = encoder.encode(JSON.stringify(result)).byteLength;
		expect(maxBytes).toBeGreaterThan(256);
		expect(extractDocument(tree, { ...focus, format, maxBytes })).toEqual(
			result,
		);
		expect(() =>
			extractDocument(tree, { ...focus, format, maxBytes: maxBytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("coexists with text-prefix output while retaining selection metadata", () => {
	const tree = html(
		`<nav>Outside navigation</nav><main>${"Selected evidence 雪. ".repeat(300)}</main><footer>Outside footer</footer>`,
	);
	const full = extractDocument(tree, focus);
	expect(
		extractDocument(tree, { ...focus, outputLimitPolicy: "text-prefix-v1" }),
	).toEqual(full);
	const maxBytes = 1024;
	expect(() => extractDocument(tree, { ...focus, maxBytes })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const result = extractDocument(tree, {
		...focus,
		maxBytes,
		outputLimitPolicy: "text-prefix-v1",
	});
	expect(result.scope).toBe(full.scope);
	expect(result.contentSelection).toEqual(full.contentSelection);
	expect(Object.isFrozen(result.contentSelection)).toBe(true);
	expect(result.contentFallback).toMatchObject({
		policy: "text-prefix-v1",
		representation: "indented-plain-text",
		truncated: true,
		trigger: { kind: "extraction.output", unit: "bytes", limit: maxBytes },
	});
	expect(result.contentFallback?.retainedCodeUnits).toBeGreaterThan(0);
	expect(encoder.encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(
		maxBytes,
	);
	expect(result.content).toContain("Selected evidence");
	expect(result.content).not.toContain("Outside");
	expect(() =>
		extractDocument(tree, {
			...focus,
			format: "json",
			outputLimitPolicy: "text-prefix-v1",
		}),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it("retains the default node cap rather than scanning with a larger implicit cap", () => {
	const tree = document();
	const main = append(tree, tree.root, "main");
	for (let index = 0; index < 5000; index++) append(tree, main, "p", "Text");
	expect(() => extractDocument(tree, focus)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(
		extractDocument(tree, { ...focus, maxNodes: 10_002 }).contentSelection
			?.scannedNodes,
	).toBe(10_002);
});

it("retains the default depth cap", () => {
	const tree = new DocumentTree(url, { maxDepth: 257 });
	trees.push(tree);
	append(tree, tree.root, "main", "Selected");
	let parent = tree.root;
	for (let depth = 0; depth < 256; depth++)
		parent = append(tree, parent, "div");
	tree.append(parent, tree.createText("Deep"));
	expect(() => extractDocument(tree, focus)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(
		extractDocument(tree, { ...focus, maxDepth: 257 }).contentSelection
			?.selected,
	).toBe("main");
});

it("retains the default output cap", () => {
	const tree = document();
	append(tree, tree.root, "main", "x".repeat(262_144));
	expect(() => extractDocument(tree, focus)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(
		extractDocument(tree, { ...focus, maxBytes: 1_048_576 }).contentSelection
			?.selected,
	).toBe("main");
});
