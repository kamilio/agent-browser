import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
const url = "https://example.com/content-context";
const formats = ["markdown", "json"] as const;
const article = '<article id="article"><h1>Owned finding</h1></article>';
const contexts = [
	{ name: "header", tag: "header", attributes: "" },
	{ name: "footer", tag: "footer", attributes: "" },
	{ name: "aside", tag: "aside", attributes: "" },
	{ name: "banner", tag: "div", attributes: 'role="banner"' },
	{ name: "contentinfo", tag: "div", attributes: 'role="contentinfo"' },
	{ name: "complementary", tag: "div", attributes: 'role="complementary"' },
];
const navigation = [
	{ name: "nav", tag: "nav", attributes: "" },
	{ name: "navigation role", tag: "div", attributes: 'role="navigation"' },
];

afterEach(() => {
	for (const tree of trees.splice(0)) {
		tree.close();
		expect(tree.resourceUsage()).toEqual({ nodes: 0, textCodeUnits: 0 });
		expect(tree.inlineDeclarationMetrics().closed).toBe(true);
	}
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

function wrap(
	context: (typeof contexts)[number],
	content: string,
	attributes = "",
) {
	return `<${context.tag} ${context.attributes} ${attributes}>${content}</${context.tag}>`;
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

interface ExpectedFocus {
	selected: "main" | "article";
	outsideMainArticleContent: boolean;
	articleCandidates?: number;
	mainArticleCandidates?: number;
	outsideArticleContent?: boolean;
	includes?: string[];
	excludes?: string[];
}

function assertFocus(tree: DocumentTree, expected: ExpectedFocus) {
	const main = element(tree, "#main");
	const target =
		expected.selected === "main" ? main : element(tree, "#article");
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	const resources = tree.resourceUsage();
	let scannedNodes: number | undefined;
	for (const format of formats) {
		const baseline = extractDocument(tree, { format });
		expect(baseline).not.toHaveProperty("contentSelection");
		const result = extractDocument(tree, {
			format,
			contentFocus: "main-content-v3",
		});
		const { contentSelection, ...ordinary } = result;
		expect(contentSelection).toEqual({
			policy: "main-content-v3",
			selected: expected.selected,
			reason:
				expected.selected === "main" ? "unique-main" : "unique-article-in-main",
			mainCandidates: 1,
			articleCandidates: expected.articleCandidates ?? 1,
			scannedNodes: expect.any(Number),
			outsideArticleContent: expected.outsideArticleContent ?? false,
			mainArticleCandidates: expected.mainArticleCandidates ?? 1,
			outsideMainArticleContent: expected.outsideMainArticleContent,
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
		const content =
			result.format === "markdown"
				? result.content
				: JSON.stringify(result.content);
		for (const text of expected.includes ?? []) expect(content).toContain(text);
		for (const text of expected.excludes ?? [])
			expect(content).not.toContain(text);
		for (const policy of ["main-content-v1", "main-content-v2"] as const) {
			const legacy = extractDocument(tree, { format, contentFocus: policy });
			const { contentSelection: legacySelection, ...legacyOrdinary } = legacy;
			expect(legacySelection).toEqual({
				policy,
				selected: "main",
				reason: "unique-main",
				mainCandidates: 1,
				articleCandidates: expected.articleCandidates ?? 1,
				scannedNodes,
				...(policy === "main-content-v2"
					? { outsideArticleContent: expected.outsideArticleContent ?? false }
					: {}),
			});
			expect(legacy.scope).toBe(tree.reference(main));
			expect(legacyOrdinary).toEqual(
				extractDocument(tree, { format, root: tree.reference(main) }),
			);
		}
		expect(extractDocument(tree, { format })).toEqual(baseline);
	}
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(resources);
	expect(serializeHtml(tree, tree.root)).toBe(source);
}

it("preserves the funding disclosure beside retained editorial independence claims", () => {
	const tree = document(
		'<main id="main"><header><nav><a href="/reviews">Reviews</a></nav><div>GearLab reviews are <i>ad-free</i> and entirely reader-supported.<br>When you purchase through links on our site, we may earn an affiliate commission, which helps support our testing. <a href="/about">Learn more</a>.</div></header><article id="article"><h1>Independent reviews</h1><p>No sponsored content. No ads.</p></article></main>',
	);
	assertFocus(tree, {
		selected: "main",
		outsideMainArticleContent: true,
		includes: [
			"affiliate commission",
			"which helps support our testing",
			"Learn more",
			"Independent reviews",
			"No sponsored content",
		],
	});
});

it.each(
	contexts.flatMap((context) =>
		[
			"Purchases support our testing through an affiliate commission",
			"Note 雪",
			"Copyright © Local authors",
			"Caution consult the original source",
		].map((text) => ({ ...context, text })),
	),
)("retains $name context without a keyword rule: $text", (context) => {
	for (const before of [true, false]) {
		const outside = wrap(context, `<p>${context.text}</p>`);
		const tree = document(
			`<main id="main">${before ? outside + article : article + outside}</main>`,
		);
		assertFocus(tree, {
			selected: "main",
			outsideMainArticleContent: true,
			includes: [context.text, "Owned finding"],
		});
	}
});

it.each(contexts)(
	"retains $name image alternatives outside the article",
	(context) => {
		const tree = document(
			`<main id="main">${wrap(context, '<img src="/context.png" alt="Source context diagram">')}${article}</main>`,
		);
		assertFocus(tree, {
			selected: "main",
			outsideMainArticleContent: true,
			includes: ["Source context diagram", "Owned finding"],
		});
	},
);

it.each(contexts)(
	"ignores whitespace and noncontent labels in $name",
	(context) => {
		const tree = document(
			`<main id="main">${wrap(context, ' \n\t&nbsp;\u2003<span title="Title only" aria-label="Label only"></span><img alt=" \t "><!-- Comment only -->')}${article}</main>`,
		);
		assertFocus(tree, {
			selected: "article",
			outsideMainArticleContent: false,
			includes: ["Owned finding"],
			excludes: ["Title only", "Label only", "Comment only"],
		});
	},
);

it.each(
	contexts.flatMap((context) =>
		navigation.map((nav) => ({ ...context, navigation: nav })),
	),
)("refines $name containing only $navigation.name", (context) => {
	for (const content of [
		"",
		'<a href="/next">Next section</a>',
		'Navigation text<img alt="Navigation diagram"><a href="/next">Next section</a>',
	]) {
		const tree = document(
			`<main id="main">${wrap(context, wrap(context.navigation, content))}${article}</main>`,
		);
		assertFocus(tree, {
			selected: "article",
			outsideMainArticleContent: false,
			includes: ["Owned finding"],
			excludes: ["Next section", "Navigation text", "Navigation diagram"],
		});
	}
});

it.each(contexts)(
	"retains prose siblings of nested navigation in $name",
	(context) => {
		for (const nav of navigation) {
			for (const before of [true, false]) {
				const links = wrap(nav, '<a href="/next">Next section</a>');
				const prose = "<p>Supplemental source context</p>";
				const tree = document(
					`<main id="main">${wrap(context, before ? prose + links : links + prose)}${article}</main>`,
				);
				assertFocus(tree, {
					selected: "main",
					outsideMainArticleContent: true,
					includes: ["Supplemental source context", "Owned finding"],
				});
			}
		}
	},
);

it.each(contexts)(
	"keeps ineligible article cards in $name as outside context",
	(context) => {
		for (const realArticle of ["", article]) {
			const tree = document(
				`<main id="main">${wrap(context, '<article><article><p>Related source finding</p><img alt="Related figure"></article></article>')}${realArticle}</main>`,
			);
			assertFocus(tree, {
				selected: "main",
				articleCandidates: realArticle ? 2 : 1,
				mainArticleCandidates: realArticle ? 1 : 0,
				outsideMainArticleContent: true,
				includes: ["Related source finding", "Related figure"],
			});
		}
	},
);

it.each(contexts)(
	"retains an ineligible img role article alternative in $name",
	(context) => {
		const tree = document(
			`<main id="main">${wrap(context, '<img role="article" alt="Source credit diagram">')}${article}</main>`,
		);
		assertFocus(tree, {
			selected: "main",
			articleCandidates: 2,
			outsideMainArticleContent: true,
			includes: ["Source credit diagram", "Owned finding"],
		});
	},
);

it.each(navigation)(
	"excludes article cards and role article alt in $name",
	(nav) => {
		const tree = document(
			`<main id="main"><header>${wrap(nav, '<article>Navigation card</article><img role="article" alt="Navigation credit">')}</header>${article}</main>`,
		);
		assertFocus(tree, {
			selected: "article",
			articleCandidates: 3,
			outsideMainArticleContent: false,
			includes: ["Owned finding"],
			excludes: ["Navigation card", "Navigation credit"],
		});
	},
);

it.each([
	...contexts,
	...navigation,
	{ name: "article", tag: "article", attributes: "" },
])("resets external $name ancestry at the nested outer main", (ancestor) => {
	for (const outside of ["", "<header><p>Local source context</p></header>"]) {
		const tree = document(
			wrap(
				ancestor,
				`External context<main id="main">${outside}${article}</main>`,
			),
		);
		assertFocus(tree, {
			selected: outside ? "main" : "article",
			outsideMainArticleContent: Boolean(outside),
			includes: outside
				? ["Local source context", "Owned finding"]
				: ["Owned finding"],
			excludes: ["External context"],
		});
	}
});

it.each(["header", "nav", "aside", "article"])(
	"resets ancestry on a %s node whose native role is main",
	(tag) => {
		const tree = document(
			`<article><header><nav><${tag} role="main" id="main"><p>Local boundary context</p>${article}</${tag}></nav></header></article>`,
		);
		assertFocus(tree, {
			selected: "main",
			outsideMainArticleContent: true,
			includes: ["Local boundary context", "Owned finding"],
		});
	},
);

it.each(contexts)(
	"preserves visibility restored outside context in $name",
	(context) => {
		for (const restored of [
			{ source: "", outside: false },
			{
				source: '<span style="visibility:visible">Restored context</span>',
				outside: true,
			},
			{
				source: '<img style="visibility:visible" alt="Restored context">',
				outside: true,
			},
			{
				source:
					'<article style="visibility:visible">Restored context</article>',
				outside: true,
				articleCandidates: 2,
			},
			{
				source:
					'<img role="article" style="visibility:visible" alt="Restored context">',
				outside: true,
				articleCandidates: 2,
			},
			{
				source:
					'<nav><span style="visibility:visible">Restored navigation</span></nav>',
				outside: false,
			},
		]) {
			const tree = document(
				`<main id="main">${wrap(context, `Invisible context<img alt="Invisible diagram">${restored.source}`, 'style="visibility:hidden"')}${article}</main>`,
			);
			assertFocus(tree, {
				selected: restored.outside ? "main" : "article",
				articleCandidates: restored.articleCandidates,
				outsideMainArticleContent: restored.outside,
				includes: restored.outside
					? ["Restored context", "Owned finding"]
					: ["Owned finding"],
				excludes: [
					"Invisible context",
					"Invisible diagram",
					"Restored navigation",
				],
			});
		}
	},
);

it.each(["hidden", "inert", 'aria-hidden="TrUe"', 'style="display:none"'])(
	"does not admit restored descendants beneath excluded %s contexts",
	(attribute) => {
		for (const context of contexts) {
			const tree = document(
				`<main id="main">${wrap(context, '<article style="visibility:visible">Excluded card</article><img style="visibility:visible" role="article" alt="Excluded diagram">', attribute)}${article}</main>`,
			);
			assertFocus(tree, {
				selected: "article",
				outsideMainArticleContent: false,
				excludes: ["Excluded card", "Excluded diagram"],
			});
		}
	},
);

it.each(["script", "style", "template", "input"])(
	"does not count skipped %s content inside ancillary wrappers",
	(tag) => {
		for (const context of contexts) {
			const tree = document();
			const main = append(tree, tree.root, "main", undefined, { id: "main" });
			const wrapper = append(tree, main, context.tag, undefined, {
				...(context.tag === "div" ? { role: context.name } : {}),
			});
			append(tree, wrapper, tag, "Excluded source context", {
				role: "article",
				value: "Excluded value",
			});
			append(tree, main, "article", "Owned finding", { id: "article" });
			assertFocus(tree, {
				selected: "article",
				outsideMainArticleContent: false,
				includes: ["Owned finding"],
				excludes: ["Excluded source context", "Excluded value"],
			});
		}
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"does not grant navigation exclusion to foreign %s elements",
	(namespace) => {
		for (const tag of ["nav", "div"]) {
			const tree = document();
			const main = append(tree, tree.root, "main", undefined, { id: "main" });
			const header = append(tree, main, "header");
			const foreign = tree.createParserElement(
				tag,
				{ role: "navigation" },
				namespace,
			);
			tree.append(header, foreign);
			tree.setTextContent(foreign, "Foreign source context");
			append(tree, main, "article", "Owned finding", { id: "article" });
			assertFocus(tree, {
				selected: "main",
				outsideMainArticleContent: true,
				includes: ["Foreign source context", "Owned finding"],
			});
		}
	},
);

it.each([
	{
		source: '<div role="unknown navigation">Navigation context</div>',
		outside: false,
	},
	{ source: '<nav role="none">Navigation context</nav>', outside: false },
	{
		source: '<div role="generic navigation">Ordinary context</div>',
		outside: true,
	},
])("uses native role admission for $source", ({ source, outside }) => {
	const tree = document(
		`<main id="main"><header>${source}</header>${article}</main>`,
	);
	assertFocus(tree, {
		selected: outside ? "main" : "article",
		outsideMainArticleContent: outside,
		includes: outside
			? ["Ordinary context", "Owned finding"]
			: ["Owned finding"],
		excludes: ["Navigation context"],
	});
});

it.each(contexts)(
	"keeps global no-main v1 and v2 behavior for $name",
	(context) => {
		const tree = document(
			`${wrap(context, "Global source context")}${article}`,
		);
		const revision = tree.revision;
		const source = serializeHtml(tree, tree.root);
		for (const format of formats) {
			const baseline = extractDocument(tree, { format });
			expect(JSON.stringify(baseline.content)).toContain(
				"Global source context",
			);
			let scannedNodes: number | undefined;
			for (const policy of [
				"main-content-v1",
				"main-content-v2",
				"main-content-v3",
			] as const) {
				const result = extractDocument(tree, { format, contentFocus: policy });
				const { contentSelection, ...ordinary } = result;
				expect(contentSelection).toEqual({
					policy,
					selected: "article",
					reason: "unique-article",
					mainCandidates: 0,
					articleCandidates: 1,
					scannedNodes: expect.any(Number),
					...(policy === "main-content-v1"
						? {}
						: { outsideArticleContent: false }),
				});
				if (scannedNodes !== undefined)
					expect(contentSelection?.scannedNodes).toBe(scannedNodes);
				scannedNodes = contentSelection?.scannedNodes;
				expect(ordinary).toEqual(
					extractDocument(tree, {
						format,
						root: tree.reference(element(tree, "#article")),
					}),
				);
				expect(JSON.stringify(result.content)).not.toContain(
					"Global source context",
				);
			}
			expect(extractDocument(tree, { format })).toEqual(baseline);
		}
		expect(tree.revision).toBe(revision);
		expect(serializeHtml(tree, tree.root)).toBe(source);
	},
);

it("recomputes context after role visibility text alt and ancestry mutations", () => {
	const tree = document(
		`<main id="main"><div role="complementary" id="context"><img id="credit" role="article" alt="Mutable credit"></div>${article}</main>`,
	);
	const context = element(tree, "#context");
	const credit = element(tree, "#credit");
	const owned = element(tree, "#article");
	const main = element(tree, "#main");
	const retained: ExpectedFocus = {
		selected: "main",
		articleCandidates: 2,
		outsideMainArticleContent: true,
		includes: ["Mutable credit", "Owned finding"],
	};
	const refined: ExpectedFocus = {
		selected: "article",
		articleCandidates: 2,
		outsideMainArticleContent: false,
		excludes: ["Mutable credit"],
	};
	assertFocus(tree, retained);
	tree.setAttribute(context, "role", "navigation");
	assertFocus(tree, refined);
	tree.setAttribute(context, "role", "complementary");
	assertFocus(tree, retained);
	tree.setAttribute(context, "hidden", "");
	assertFocus(tree, { ...refined, articleCandidates: 1 });
	tree.removeAttribute(context, "hidden");
	assertFocus(tree, retained);
	tree.setAttribute(credit, "alt", " \t ");
	assertFocus(tree, { ...refined, articleCandidates: 1 });
	tree.setAttribute(credit, "alt", "Mutable credit");
	assertFocus(tree, retained);
	tree.append(owned, context);
	assertFocus(tree, {
		...refined,
		articleCandidates: 1,
		includes: ["Mutable credit", "Owned finding"],
		excludes: [],
	});
	tree.append(main, context);
	assertFocus(tree, retained);
	tree.remove(credit);
	assertFocus(tree, { ...refined, articleCandidates: 1 });
	tree.setTextContent(context, "New source context");
	assertFocus(tree, {
		...retained,
		articleCandidates: 1,
		includes: ["New source context", "Owned finding"],
	});
	tree.setTextContent(context, "");
	assertFocus(tree, { ...refined, articleCandidates: 1 });
});

it("keeps exact scan limits while retaining context from a later ancillary branch", () => {
	const tree = document();
	const main = append(tree, tree.root, "main", undefined, { id: "main" });
	append(tree, main, "article", "Owned finding", { id: "article" });
	const footer = append(tree, main, "footer");
	append(tree, footer, "img", undefined, {
		role: "article",
		alt: "Source credit",
	});
	assertFocus(tree, {
		selected: "main",
		articleCandidates: 2,
		outsideMainArticleContent: true,
		includes: ["Owned finding", "Source credit"],
	});
	const revision = tree.revision;
	const source = serializeHtml(tree, tree.root);
	for (const format of formats) {
		const result = extractDocument(tree, {
			format,
			contentFocus: "main-content-v3",
			maxNodes: 6,
			maxDepth: 3,
		});
		expect(result.scope).toBe(tree.reference(main));
		expect(result.contentSelection?.scannedNodes).toBe(6);
		for (const limits of [
			{ maxNodes: 5, maxDepth: 3 },
			{ maxNodes: 6, maxDepth: 2 },
		]) {
			expect(() =>
				extractDocument(tree, {
					format,
					contentFocus: "main-content-v3",
					...limits,
				}),
			).toThrow(
				expect.objectContaining({
					code: "resource-limit",
					message: "Content focus scan limit exceeded",
				}),
			);
		}
	}
	expect(tree.revision).toBe(revision);
	expect(serializeHtml(tree, tree.root)).toBe(source);
});
