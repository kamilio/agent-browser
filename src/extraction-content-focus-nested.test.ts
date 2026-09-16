import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { selectContentFocus } from "./extraction-content-focus.js";
import { extractDocument } from "./extraction.js";
import { htmlParseInfo, setHtmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const url = "https://example.com/nested-content-focus";
const focus = { contentFocus: "main-content-v3" } as const;
const formats = ["markdown", "json"] as const;

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

function element(tree: DocumentTree, selector: string) {
	const id = new DocumentQueries(tree).querySelector(selector);
	if (id === null) throw new Error(`Missing fixture element: ${selector}`);
	return id;
}

function append(
	tree: DocumentTree,
	parent: number,
	tag: string,
	text?: string,
	attributes: Record<string, string> = {},
) {
	const id = tree.createElement(tag, attributes);
	tree.append(parent, id);
	if (text !== undefined) tree.setTextContent(id, text);
	return id;
}

interface Selection {
	selected: "main" | "article" | "document";
	reason:
		| "unique-article-in-main"
		| "unique-main"
		| "unique-article"
		| "ambiguous-main"
		| "ambiguous-article"
		| "article-with-outside-content"
		| "no-nonempty-landmark";
	mainCandidates: number;
	articleCandidates: number;
	outsideArticleContent: boolean;
	mainArticleCandidates?: number;
	outsideMainArticleContent?: boolean;
}

const refined: Selection = {
	selected: "article",
	reason: "unique-article-in-main",
	mainCandidates: 1,
	articleCandidates: 1,
	outsideArticleContent: false,
	mainArticleCandidates: 1,
	outsideMainArticleContent: false,
};

function assertSelection(
	tree: DocumentTree,
	expected: Selection,
	target = tree.root,
	main = target,
) {
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	let scannedNodes: number | undefined;
	for (const format of formats) {
		const baseline = extractDocument(tree, { format });
		expect(baseline).not.toHaveProperty("contentSelection");
		const result = extractDocument(tree, { ...focus, format });
		const { contentSelection, ...ordinary } = result;
		expect(contentSelection).toEqual({
			policy: "main-content-v3",
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
		const {
			mainArticleCandidates: _localCandidates,
			outsideMainArticleContent: _localOutside,
			outsideArticleContent,
			...legacy
		} = expected;
		if (expected.mainCandidates === 1) {
			legacy.selected = "main";
			legacy.reason = "unique-main";
		}
		for (const policy of ["main-content-v1", "main-content-v2"] as const) {
			const outsideFallback =
				policy === "main-content-v1" &&
				expected.reason === "article-with-outside-content";
			const legacyTarget =
				expected.mainCandidates === 1
					? main
					: outsideFallback
						? element(tree, "#article")
						: target;
			const previous = extractDocument(tree, { format, contentFocus: policy });
			const { contentSelection: previousSelection, ...previousOrdinary } =
				previous;
			expect(previousSelection).toEqual({
				policy,
				...legacy,
				...(outsideFallback
					? { selected: "article", reason: "unique-article" }
					: {}),
				scannedNodes,
				...(policy === "main-content-v2" ? { outsideArticleContent } : {}),
			});
			expect(Object.isFrozen(previousSelection)).toBe(true);
			expect(previous.scope).toBe(tree.reference(legacyTarget));
			expect(previousOrdinary).toEqual(
				extractDocument(tree, { format, root: tree.reference(legacyTarget) }),
			);
		}
		expect(extractDocument(tree, { format })).toEqual(baseline);
	}
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree, tree.root)).toBe(source);
}

function assertRefined(tree: DocumentTree, overrides: Partial<Selection> = {}) {
	assertSelection(
		tree,
		{ ...refined, ...overrides },
		element(tree, "#article"),
		element(tree, "#main"),
	);
}

it("refines a navigation-heavy main without changing source or document metadata", () => {
	const navigation = Array.from(
		{ length: 30 },
		(_, index) => `<a href="/nav-${index}">Navigation ${index}</a>`,
	).join("");
	const tree = document(
		`<title>Original document title</title><main id="main"><nav>${navigation}</nav><div><article id="article"><h1>Research evidence</h1><p>Owned finding 雪.</p><a href="/evidence">Evidence link</a></article></div><footer>Local footer</footer></main>`,
	);
	assertRefined(tree);
	for (const format of formats) {
		const result = extractDocument(tree, { ...focus, format });
		expect(result.title).toBe("Original document title");
		expect(result.url).toBe(url);
		expect(result.document).toBe(tree.reference(tree.root));
		const content =
			result.format === "markdown"
				? result.content
				: JSON.stringify(result.content);
		expect(content).toContain("Research evidence");
		expect(content).toContain(
			result.format === "markdown"
				? "Owned finding 雪\\."
				: "Owned finding 雪.",
		);
		expect(content).toContain("Evidence link");
		expect(content).not.toContain("Navigation");
		expect(content).not.toContain("Local footer");
		expect(JSON.stringify(extractDocument(tree, { format }).content)).toContain(
			"Navigation 29",
		);
	}
});

it.each([
	'<main id="main"><div><section><article id="article">Owned finding</article></section></div></main>',
	'<main id="main"><article id="article"><div><article>Nested finding</article></div><p>Owned ending</p></article></main>',
	'<main id="main"><article id="article"><main>Nested main finding</main></article></main>',
	'<main id="main"><main><div><article id="article">Nested main finding</article></div></main></main>',
	'<div id="main" role="unknown main"><section role="unknown article" id="article">Role finding</section></div>',
	'<article role="main" id="main"><main role="article" id="article">Overridden role finding</main></article>',
])("uses local outer semantic landmarks through wrappers: %s", (source) => {
	assertRefined(document(source));
});

it.each([
	{
		name: "multiple nonempty articles",
		body: "<article>First finding</article><article>Second finding</article>",
		articleCandidates: 2,
		mainArticleCandidates: 2,
	},
	{
		name: "no nonempty article in an ancillary-only main",
		body: "<nav>Navigation only</nav><article> \t&nbsp; </article>",
		articleCandidates: 0,
		mainArticleCandidates: 0,
	},
	{
		name: "only ancillary article cards",
		body: "<aside><article>Related finding</article></aside>",
		articleCandidates: 1,
		mainArticleCandidates: 0,
	},
	{
		name: "substantive main text without an article",
		body: "<h1>Main heading</h1><p>Main finding</p>",
		articleCandidates: 0,
		mainArticleCandidates: 0,
		outsideArticleContent: true,
		outsideMainArticleContent: true,
	},
])("preserves main with $name", ({ body, name: _name, ...counts }) => {
	const tree = document(`<main id="main">${body}</main>`);
	assertSelection(
		tree,
		{
			...refined,
			...counts,
			selected: "main",
			reason: "unique-main",
		},
		element(tree, "#main"),
	);
});

it("ignores empty main and article siblings, including blank image alternatives", () => {
	const tree = document(
		'<main> \n<img alt=" "></main><main id="main"><article> \t<img alt=" "></article><article id="article">Owned finding</article><article><span></span></article></main>',
	);
	assertRefined(tree);
});

it("admits an article made nonempty only by HTML image alt", () => {
	const tree = document(
		'<main id="main"><nav>Navigation</nav><article id="article"><img src="/figure.png" alt="Measured diagram"></article></main>',
	);
	assertRefined(tree);
	for (const format of formats)
		expect(
			JSON.stringify(extractDocument(tree, { ...focus, format }).content),
		).toContain("Measured diagram");
});

it.each([
	"Loose substantive text",
	"<h2>Important heading</h2>",
	'<div role="alert">Important warning</div>',
	'<img src="/warning.png" alt="Important diagram">',
	"<div><section><p>Ordinary surrounding finding</p></section></div>",
	'<div class="nav sidebar footer">Class-name impostor</div>',
	'<div id="article-impostor" class="article main-content">Unowned finding</div>',
	"<main><p>Nested main context</p></main>",
])(
	"retains substantive content outside local article ancestry: %s",
	(outside) => {
		for (const body of [
			`${outside}<article id="article">Owned finding</article>`,
			`<article id="article">Owned finding</article>${outside}`,
		]) {
			const tree = document(`<main id="main">${body}</main>`);
			assertSelection(
				tree,
				{
					...refined,
					selected: "main",
					reason: "unique-main",
					outsideArticleContent: true,
					outsideMainArticleContent: true,
				},
				element(tree, "#main"),
			);
		}
	},
);

it.each([
	["header", ""],
	["footer", ""],
	["nav", ""],
	["aside", ""],
	["div", 'role="banner"'],
	["div", 'role="contentinfo"'],
	["div", 'role="navigation"'],
	["div", 'role="complementary"'],
	["div", 'role="unknown navigation"'],
	["nav", 'role="none"'],
	["div", 'role="navigation" style="visibility:hidden"'],
])(
	"excludes ancillary %s %s text and article cards locally",
	(tag, attributes) => {
		const ancillary = `<${tag} ${attributes}><section style="visibility:visible"><h2>Ancillary heading</h2><img alt="Ancillary diagram"><article>Ancillary card</article></section></${tag}>`;
		for (const body of [
			`${ancillary}<article id="article">Owned finding</article>`,
			`<article id="article">Owned finding</article>${ancillary}`,
		])
			assertRefined(document(`<main id="main">${body}</main>`), {
				articleCandidates: 2,
			});
	},
);

it("ignores outside-main text and articles only for the local refinement decision", () => {
	const tree = document(
		'<p>Before main evidence</p><article>External article</article><main id="main"><article id="article">Owned finding</article></main><h2>After main evidence</h2>',
	);
	assertRefined(tree, {
		articleCandidates: 2,
		outsideArticleContent: true,
	});
});

it.each(["aside", "article"])(
	"resets outer %s ancestry at the selected main boundary",
	(ancestor) => {
		for (const outside of ["", "<p>Main warning</p>"]) {
			const tree = document(
				`<${ancestor}>Outer context<main id="main">${outside}<article id="article">Owned finding</article></main></${ancestor}>`,
			);
			if (!outside) assertRefined(tree);
			else
				assertSelection(
					tree,
					{
						...refined,
						selected: "main",
						reason: "unique-main",
						outsideMainArticleContent: true,
					},
					element(tree, "#main"),
				);
		}
	},
);

it.each<Selection & { name: string; source: string }>([
	{
		name: "lone article without a main",
		source:
			'<nav>Navigation</nav><article id="article">Owned finding</article>',
		selected: "article",
		reason: "unique-article",
		mainCandidates: 0,
		articleCandidates: 1,
		outsideArticleContent: false,
	},
	{
		name: "outside evidence without a main",
		source:
			'<p>Other evidence</p><article id="article">Owned finding</article>',
		selected: "document",
		reason: "article-with-outside-content",
		mainCandidates: 0,
		articleCandidates: 1,
		outsideArticleContent: true,
	},
	{
		name: "ambiguous articles without a main",
		source: "<article>First finding</article><article>Second finding</article>",
		selected: "document",
		reason: "ambiguous-article",
		mainCandidates: 0,
		articleCandidates: 2,
		outsideArticleContent: false,
	},
	{
		name: "ambiguous mains despite one refinable main",
		source:
			"<main><article>Owned finding</article></main><main>Other main</main>",
		selected: "document",
		reason: "ambiguous-main",
		mainCandidates: 2,
		articleCandidates: 1,
		outsideArticleContent: true,
	},
	{
		name: "empty main does not replace the article fallback",
		source:
			'<main> \t<img alt=" "></main><article id="article">Finding</article>',
		selected: "article",
		reason: "unique-article",
		mainCandidates: 0,
		articleCandidates: 1,
		outsideArticleContent: false,
	},
	{
		name: "no semantic landmarks",
		source: '<div id="main" class="article">Ordinary finding</div>',
		selected: "document",
		reason: "no-nonempty-landmark",
		mainCandidates: 0,
		articleCandidates: 0,
		outsideArticleContent: true,
	},
])(
	"preserves v2 fallback for $name",
	({ source, name: _name, ...expected }) => {
		const tree = document(source);
		assertSelection(
			tree,
			expected,
			expected.selected === "article" ? element(tree, "#article") : tree.root,
		);
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"does not mistake %s lookalikes for HTML articles, ancillary roles or image alt",
	(namespace) => {
		for (const tag of ["main", "article", "aside", "img"]) {
			const tree = document();
			const main = append(tree, tree.root, "main");
			const article = append(tree, main, "article", "Owned finding");
			const foreign = tree.createParserElement(
				tag,
				{ role: tag === "aside" ? "complementary" : tag, alt: "Foreign alt" },
				namespace,
			);
			tree.append(main, foreign);
			assertSelection(tree, refined, article, main);
			if (tag === "img") continue;
			tree.setTextContent(foreign, "Foreign outside finding");
			assertSelection(
				tree,
				{
					...refined,
					selected: "main",
					reason: "unique-main",
					outsideArticleContent: true,
					outsideMainArticleContent: true,
				},
				main,
			);
		}
	},
);

it("excludes omitted subtrees, labels, values, comments and blank text locally", () => {
	for (const omitted of [
		" \n\t&nbsp; <!-- Unowned comment -->",
		'<img alt=" \t "><div title="Attribute finding" aria-label="Label"></div>',
		...["hidden", "inert", 'aria-hidden="TrUe"', 'style="display:none"'].map(
			(attribute) =>
				`<div ${attribute}>Omitted<article style="visibility:visible">Still omitted</article></div>`,
		),
	]) {
		const tree = document(
			`<main id="main">${omitted}<article id="article">Owned finding</article></main>`,
		);
		assertRefined(tree);
	}
	for (const tag of [
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
	]) {
		const tree = document();
		const main = append(tree, tree.root, "main");
		const omitted = append(tree, main, tag, "Omitted finding", {
			role: "article",
			value: "Private",
		});
		append(tree, omitted, "article", "Omitted nested finding");
		const article = append(tree, main, "article", "Owned finding");
		assertSelection(tree, refined, article, main);
	}
});

it("ignores invisible text and alt but retains visibility-restored outside evidence", () => {
	for (const restored of [
		"",
		'<span style="visibility:visible">Restored</span>',
	]) {
		const tree = document(
			`<main id="main"><div style="visibility:hidden">Invisible${restored}<img alt="Invisible alt"></div><article id="article">Owned finding</article></main>`,
		);
		if (!restored) assertRefined(tree);
		else
			assertSelection(
				tree,
				{
					...refined,
					selected: "main",
					reason: "unique-main",
					outsideArticleContent: true,
					outsideMainArticleContent: true,
				},
				element(tree, "#main"),
			);
		for (const format of formats) {
			const content = JSON.stringify(
				extractDocument(tree, { ...focus, format }).content,
			);
			expect(content).not.toContain("Invisible");
			if (restored) expect(content).toContain("Restored");
		}
	}
});

it("does not admit an invisible article containing restored outside text", () => {
	const tree = document(
		'<main id="main"><article style="visibility:hidden"><span style="visibility:visible">Restored outside finding</span></article><article id="article">Owned finding</article></main>',
	);
	assertSelection(
		tree,
		{
			...refined,
			selected: "main",
			reason: "unique-main",
			outsideArticleContent: true,
			outsideMainArticleContent: true,
		},
		element(tree, "#main"),
	);
});

it("admits restored main and article landmarks without invisible outer candidates", () => {
	const tree = document(
		'<main style="visibility:hidden">Invisible outer main<main id="main" style="visibility:visible"><article style="visibility:hidden">Invisible outer article<article id="article" style="visibility:visible">Restored finding</article></article></main></main>',
	);
	assertRefined(tree);
});

it.each([false, true])(
	"obeys noscript admission with scripting=%s",
	(scripting) => {
		const tree = document(
			'<body><main id="main"><noscript>Fallback warning</noscript><article id="article">Owned finding</article></main></body>',
		);
		const info = htmlParseInfo(tree);
		if (!info) throw new Error("Missing parsed fixture metadata");
		setHtmlParseInfo(tree, { ...info, scripting });
		if (scripting) assertRefined(tree);
		else
			assertSelection(
				tree,
				{
					...refined,
					selected: "main",
					reason: "unique-main",
					outsideArticleContent: true,
					outsideMainArticleContent: true,
				},
				element(tree, "#main"),
			);
	},
);

it.each([
	'<div role="ARTICLE">Outside role impostor</div>',
	'<article role="none">Presentational outside finding</article>',
	'<div role="generic navigation">Ordinary role finding</div>',
])("does not invent semantic roles for local content: %s", (outside) => {
	const tree = document(
		`<main id="main">${outside}<article id="article">Owned finding</article></main>`,
	);
	assertSelection(
		tree,
		{
			...refined,
			selected: "main",
			reason: "unique-main",
			outsideArticleContent: true,
			outsideMainArticleContent: true,
		},
		element(tree, "#main"),
	);
});

it("uses one admission traversal for global and local focus decisions", () => {
	const tree = document();
	const main = append(tree, tree.root, "main");
	append(tree, main, "nav", "Navigation");
	const article = append(tree, main, "article", "Owned finding");
	append(tree, tree.root, "footer", "Later footer");
	const skipped: number[] = [];
	const visible: number[] = [];
	const descended: number[] = [];
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	const result = selectContentFocus(tree, {
		policy: "main-content-v3",
		maxNodes: 8,
		maxDepth: 3,
		skip: (node) => {
			skipped.push(node.id);
			return false;
		},
		visible: (id) => {
			visible.push(id);
			return true;
		},
		descend: (node) => {
			descended.push(node.id);
			return true;
		},
	});
	expect(result.root).toBe(article);
	expect(result.metadata).toEqual({
		policy: "main-content-v3",
		...refined,
		scannedNodes: 8,
	});
	expect(Object.isFrozen(result.metadata)).toBe(true);
	expect(skipped).toHaveLength(8);
	expect(new Set(skipped).size).toBe(8);
	expect(visible).toEqual(skipped);
	expect(descended).toEqual(skipped);
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree, tree.root)).toBe(source);
});

it("enforces the exact complete-scan node bound after finding the local article", () => {
	const tree = document();
	const main = append(tree, tree.root, "main");
	append(tree, main, "nav", "Navigation");
	const article = append(tree, main, "article");
	append(tree, article, "p", "Owned finding");
	append(tree, tree.root, "footer", "Later footer");
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	assertSelection(tree, refined, article, main);
	for (const format of formats) {
		const result = extractDocument(tree, {
			...focus,
			format,
			maxNodes: 9,
			maxDepth: 4,
		});
		expect(result.scope).toBe(tree.reference(article));
		expect(result.contentSelection?.scannedNodes).toBe(9);
		expect(() =>
			extractDocument(tree, { ...focus, format, maxNodes: 8, maxDepth: 4 }),
		).toThrow(
			expect.objectContaining({
				code: "resource-limit",
				message: "Content focus scan limit exceeded",
			}),
		);
	}
	expect(() =>
		extractDocument(tree, {
			...focus,
			maxNodes: 8,
			outputLimitPolicy: "text-prefix-v1",
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree, tree.root)).toBe(source);
});

it("enforces exact depth in a later branch outside the selected main", () => {
	const tree = document();
	const main = append(tree, tree.root, "main");
	const article = append(tree, main, "article", "Owned finding");
	let parent = append(tree, tree.root, "footer");
	for (let depth = 0; depth < 3; depth++) parent = append(tree, parent, "div");
	append(tree, parent, "span", "Deep footer");
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	assertSelection(tree, refined, article, main);
	for (const format of formats) {
		const result = extractDocument(tree, {
			...focus,
			format,
			maxNodes: 10,
			maxDepth: 6,
		});
		expect(result.scope).toBe(tree.reference(article));
		expect(result.contentSelection?.scannedNodes).toBe(10);
		expect(() =>
			extractDocument(tree, { ...focus, format, maxNodes: 10, maxDepth: 5 }),
		).toThrow(
			expect.objectContaining({
				code: "resource-limit",
				message: "Content focus scan limit exceeded",
			}),
		);
	}
	expect(() =>
		extractDocument(tree, {
			...focus,
			maxDepth: 5,
			outputLimitPolicy: "text-prefix-v1",
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree, tree.root)).toBe(source);
});

it("counts skipped roots but does not scan their excluded descendants", () => {
	const tree = document();
	const main = append(tree, tree.root, "main");
	const hidden = append(tree, main, "div", undefined, { hidden: "" });
	let parent = hidden;
	for (let depth = 0; depth < 8; depth++)
		parent = append(tree, parent, "article", "Unadmitted finding");
	const article = append(tree, main, "article", "Owned finding");
	assertSelection(tree, refined, article, main);
	for (const format of formats) {
		const result = extractDocument(tree, {
			...focus,
			format,
			maxNodes: 5,
			maxDepth: 3,
		});
		expect(result.scope).toBe(tree.reference(article));
		expect(result.contentSelection?.scannedNodes).toBe(5);
		expect(() =>
			extractDocument(tree, { ...focus, format, maxNodes: 4 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
});

it("retains an empty document at the minimum exact structural bounds", () => {
	const tree = document();
	assertSelection(tree, {
		selected: "document",
		reason: "no-nonempty-landmark",
		mainCandidates: 0,
		articleCandidates: 0,
		outsideArticleContent: false,
	});
	for (const format of formats) {
		const result = extractDocument(tree, {
			...focus,
			format,
			maxNodes: 1,
			maxDepth: 0,
		});
		expect(result.scope).toBe(tree.reference(tree.root));
		expect(result.contentSelection?.scannedNodes).toBe(1);
	}
});

it("re-evaluates local outside evidence after caller mutation without mutating the tree", () => {
	const tree = document(
		'<main id="main"><div id="extra"></div><article id="article">Owned finding</article></main>',
	);
	assertRefined(tree);
	const extra = element(tree, "#extra");
	tree.setTextContent(extra, "New main warning");
	assertSelection(
		tree,
		{
			...refined,
			selected: "main",
			reason: "unique-main",
			outsideArticleContent: true,
			outsideMainArticleContent: true,
		},
		element(tree, "#main"),
	);
	tree.setTextContent(extra, "");
	assertRefined(tree);
});
