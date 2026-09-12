import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { svgNamespace } from "./dom-namespaces.js";
import { buildFormattingTree } from "./formatting-tree.js";
import {
	insertAdjacentHtml,
	setInnerHtml,
	setOuterHtml,
} from "./html-content.js";
import {
	htmlParseInfo,
	htmlScriptingEnabled,
	setHtmlParseInfo,
} from "./html-info.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { serializeHtml } from "./html-serialization.js";
import { documentStyles } from "./styles.js";
import { resolveBrowserTarget } from "./target-locator.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it.each([false, true])(
	"serializes fallback text with document scripting=%s",
	async (scripting) => {
		const { tree, id } = await fixture(scripting);
		const target = id("#target");
		tree.setTextContent(target, '<span>&"\u00a0</span>');
		expect(serializeHtml(tree, target)).toBe(
			scripting
				? '<span>&"\u00a0</span>'
				: '&lt;span&gt;&amp;"&nbsp;&lt;/span&gt;',
		);
		expect(serializeHtml(tree, target, { includeSelf: true })).toBe(
			`<noscript id="target">${serializeHtml(tree, target)}</noscript>`,
		);
	},
);

it.each([false, true])(
	"preserves explicit serializer scripting=%s overrides",
	async (scripting) => {
		const { tree, id } = await fixture(!scripting);
		const target = id("#target");
		tree.setTextContent(target, "<&>");
		expect(serializeHtml(tree, target, { scripting })).toBe(
			scripting ? "<&>" : "&lt;&amp;&gt;",
		);
		expect(htmlScriptingEnabled(tree)).toBe(!scripting);
	},
);

it("round-trips disabled fallback text without inventing markup", async () => {
	const { tree, queries, id } = await fixture(false);
	const target = id("#target");
	const text = '<span id="invented">&\u00a0</span>';
	tree.setTextContent(target, text);
	setInnerHtml(tree, target, serializeHtml(tree, target));
	expect(tree.textContent(target)).toBe(text);
	expect(queries.querySelector("#invented")).toBeNull();
	expect(
		tree.get(target).children.map((child) => tree.get(child).kind),
	).toEqual(["text"]);
});

it("uses the template content owner rather than its outer document for serialization", async () => {
	const { tree, id } = await fixture(
		true,
		'<template id="template"><noscript id="target"><&></noscript></template>',
	);
	const template = id("#template");
	const content = tree.templateContent(template);
	expect(htmlScriptingEnabled(tree)).toBe(true);
	expect(htmlScriptingEnabled(content.tree)).toBe(false);
	expect(serializeHtml(tree, template)).toBe(
		'<noscript id="target">&lt;&amp;&gt;</noscript>',
	);
	expect(serializeHtml(tree, template, { scripting: true })).toBe(
		'<noscript id="target"><&></noscript>',
	);
});

it.each([false, true])(
	"escapes foreign noscript text regardless of document scripting=%s",
	async (scripting) => {
		const { tree, id } = await fixture(
			scripting,
			'<svg><noscript id="target"></noscript></svg>',
		);
		const target = id("#target");
		tree.setTextContent(target, "<&>");
		expect(serializeHtml(tree, target)).toBe("&lt;&amp;&gt;");
	},
);

it.each([false, true])(
	"uses document scripting=%s for fallback text and label locators",
	async (scripting) => {
		const { tree, queries, id } = await fixture(
			scripting,
			'<noscript><a id="fallback" href="/next">Fallback</a><label for="field">Full name</label></noscript><input id="field">',
		);
		const text = () =>
			resolveBrowserTarget(
				tree,
				queries,
				"getByText('Fallback', {exact:true})",
			);
		const label = () =>
			resolveBrowserTarget(
				tree,
				queries,
				"getByLabel('Full name', {exact:true})",
			);
		if (scripting) {
			expect(text).toThrow("matched no");
			expect(label).toThrow("matched no");
		} else {
			expect(tree.resolve(text()).id).toBe(id("#fallback"));
			expect(tree.resolve(label()).id).toBe(id("#field"));
		}
	},
);

async function fixture(
	scripting: boolean,
	content = '<noscript id="target"><span id="fallback">Hidden</span></noscript><span id="after">Ready</span>',
	css = "",
) {
	const source = `<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}${css}</style><body>${content}`;
	const tree = scripting
		? await parseHtmlDocumentAsync(
				source,
				"https://fixture.invalid/noscript-scripting",
				{},
				{ start() {}, async script() {}, async finish() {} },
			)
		: parseHtmlDocument(source, "https://fixture.invalid/noscript-scripting");
	documents.push(tree);
	documentStyles(tree).setViewport(160, 64);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return { tree, queries, id, styles: documentStyles(tree) };
}

it.each([
	"display:block",
	"display:block!important",
	"display:contents!important",
	"display:inline!important",
	"display:inherit!important",
	"display:initial!important",
	"display:unset!important",
	"display:revert!important",
	"display:block!important;visibility:visible!important",
	"display:block!important;float:left;width:40px;height:40px",
])(
	"keeps enabled-scripting noscript hidden against author %s",
	async (declaration) => {
		const { tree, id, queries, styles } = await fixture(
			true,
			undefined,
			`noscript{${declaration}}`,
		);
		expect(htmlParseInfo(tree)?.scripting).toBe(true);
		expect(styles.get(id("#target"))).toMatchObject({
			display: "none",
			displayed: false,
		});
		expect(tree.textContent(id("#target"))).toBe(
			'<span id="fallback">Hidden</span>',
		);
		expect(queries.querySelector("#fallback")).toBeNull();
		expect(buildFormattingTree(tree).issues).not.toHaveProperty(
			"element-layout-not-supported",
		);
		expect(
			documentGeometry(tree).getBoundingClientRect(id("#target")),
		).toMatchObject({ width: 0, height: 0 });
		expect(
			documentGeometry(tree).getBoundingClientRect(id("#after")),
		).toMatchObject({ x: 0, y: 0, width: 30, height: 8 });
		expect(
			layoutDocument(tree)
				.contexts.flatMap((context) => context.glyphs)
				.map((glyph) => glyph.character)
				.join(""),
		).toBe("Ready");
	},
);

it("has the scripting flag during initialization and parser callbacks without publishing unfinished diagnostics", async () => {
	const observed: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		'<!doctype html><body><noscript id="target">Hidden</noscript><script>probe</script>',
		"https://fixture.invalid/noscript-checkpoints",
		{
			initializeDocument(owner) {
				expect(htmlScriptingEnabled(owner)).toBe(true);
				expect(htmlParseInfo(owner)).toBeUndefined();
				observed.push("initialize");
			},
		},
		{
			start(owner) {
				expect(htmlScriptingEnabled(owner)).toBe(true);
				expect(htmlParseInfo(owner)).toBeUndefined();
				observed.push("start");
			},
			async script(owner) {
				const target = new DocumentQueries(owner).querySelector("#target");
				if (target === null) throw new Error("Missing parsed noscript");
				expect(htmlParseInfo(owner)).toBeUndefined();
				expect(documentStyles(owner).get(target).display).toBe("none");
				observed.push("script");
			},
			async finish() {},
		},
	);
	documents.push(tree);
	expect(observed).toEqual(["initialize", "start", "script"]);
	expect(htmlParseInfo(tree)).toMatchObject({ scripting: true });
	expect(Object.isFrozen(htmlParseInfo(tree))).toBe(true);
});

it("does not publish parse information early for disabled scripting either", () => {
	let initialized = false;
	const tree = parseHtmlDocument(
		"<!doctype html><body><noscript>Fallback</noscript>",
		"https://fixture.invalid/noscript-initialize",
		{
			initializeDocument(owner) {
				initialized = true;
				expect(htmlScriptingEnabled(owner)).toBe(false);
				expect(htmlParseInfo(owner)).toBeUndefined();
			},
		},
	);
	documents.push(tree);
	expect(initialized).toBe(true);
	expect(htmlParseInfo(tree)?.scripting).toBe(false);
});

it("releases the early scripting state when a parser callback fails", async () => {
	let candidate: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"<body><script>fail</script>",
			"https://fixture.invalid/noscript-failure",
			{
				initializeDocument(owner) {
					candidate = owner;
				},
			},
			{
				start() {},
				async script() {
					throw new Error("Isolated callback failure");
				},
				async finish() {},
			},
		),
	).rejects.toThrow("Isolated callback failure");
	if (!candidate) throw new Error("Missing initialized candidate");
	expect(candidate.nodeCount).toBe(0);
	expect(htmlParseInfo(candidate)).toBeUndefined();
	expect(htmlScriptingEnabled(candidate)).toBe(false);
});

it("keeps scripting state per document and never hides a foreign-namespace namesake", async () => {
	const disabled = await fixture(false);
	const enabled = await fixture(
		true,
		'<svg><noscript id="foreign">Foreign</noscript></svg><noscript id="target">Hidden</noscript>',
	);
	expect(disabled.styles.get(disabled.id("#target")).display).toBe("inline");
	expect(enabled.styles.get(enabled.id("#target")).display).toBe("none");
	expect(enabled.tree.get(enabled.id("#foreign")).namespaceURI).toBe(
		svgNamespace,
	);
	expect(enabled.styles.get(enabled.id("#foreign")).display).toBe("inline");
	expect(
		Object.keys(buildFormattingTree(enabled.tree).issues).length,
	).toBeGreaterThan(0);
	enabled.tree.close();
	expect(htmlScriptingEnabled(enabled.tree)).toBe(false);
	expect(disabled.styles.get(disabled.id("#target")).display).toBe("inline");
});

it("keeps newly created noscript elements hidden after active-document mutations", async () => {
	const { tree, id, styles } = await fixture(true);
	const target = id("#target");
	const before = styles.get(target);
	tree.setAttribute(target, "style", "display:block!important");
	expect(styles.get(target).display).toBe("none");
	const added = tree.createElement("noscript", {
		style: "display:contents!important",
	});
	tree.append(added, tree.createText("Added"));
	tree.append(id("body"), added);
	expect(styles.get(added).display).toBe("none");
	expect(before.display).toBe("none");
	expect(
		layoutDocument(tree)
			.contexts.flatMap((context) => context.glyphs)
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("Ready");
});

it("invalidates existing styles if stored scripting metadata changes without reparsing DOM", async () => {
	const { tree, id, styles } = await fixture(
		false,
		'<noscript id="target"><span>Ready</span></noscript>',
	);
	const information = htmlParseInfo(tree);
	if (!information) throw new Error("Missing completed parse information");
	const original = styles.get(id("#target"));
	const text = tree.textContent(id("#target"));
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#target")).width,
	).toBe(30);
	setHtmlParseInfo(tree, { ...information, scripting: true });
	expect(styles.get(id("#target")).display).toBe("none");
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#target")).width,
	).toBe(0);
	expect(tree.textContent(id("#target"))).toBe(text);
	expect(original.display).toBe("inline");
	expect(information.scripting).toBe(false);
	setHtmlParseInfo(tree, information);
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#target")).width,
	).toBe(30);
});

it.each([false, true])(
	"uses explicit fragment scripting=%s without executing scripts",
	(scripting) => {
		const parsed = parseHtmlFragment(
			'<span id="inserted">New</span>',
			"https://fixture.invalid/noscript-fragment",
			{ tagName: "noscript", scripting },
		);
		documents.push(parsed.tree);
		expect(htmlScriptingEnabled(parsed.tree)).toBe(scripting);
		expect(htmlParseInfo(parsed.tree)?.scripting).toBe(scripting);
		const inserted = new DocumentQueries(parsed.tree).querySelector(
			"#inserted",
			parsed.fragment,
		);
		if (scripting) {
			expect(inserted).toBeNull();
			expect(parsed.tree.textContent(parsed.fragment)).toBe(
				'<span id="inserted">New</span>',
			);
		} else {
			expect(inserted).not.toBeNull();
			expect(parsed.tree.textContent(parsed.fragment)).toBe("New");
		}
	},
);

it.each([
	{ scripting: false, operation: "inner" },
	{ scripting: true, operation: "inner" },
	{ scripting: false, operation: "outer" },
	{ scripting: true, operation: "outer" },
	{ scripting: false, operation: "adjacent" },
	{ scripting: true, operation: "adjacent" },
])(
	"inherits owner scripting=$scripting for $operation HTML replacement",
	async ({ scripting, operation }) => {
		const { tree, id, queries, styles } = await fixture(
			scripting,
			'<div id="host"></div><noscript id="target">Old</noscript>',
		);
		const child = '<span id="inserted">New</span>';
		let target: number;
		if (operation === "inner") {
			target = id("#target");
			setInnerHtml(tree, target, child);
		} else {
			const markup = `<noscript id="created">${child}</noscript>`;
			if (operation === "outer") setOuterHtml(tree, id("#host"), markup);
			else insertAdjacentHtml(tree, id("#host"), "beforeend", markup);
			target = id("#created");
		}
		expect(htmlScriptingEnabled(tree)).toBe(scripting);
		expect(styles.get(target).display).toBe(scripting ? "none" : "inline");
		if (scripting) {
			expect(queries.querySelector("#inserted")).toBeNull();
			expect(tree.textContent(target)).toBe(child);
		} else {
			const inserted = id("#inserted");
			expect(tree.get(inserted).parent).toBe(target);
			expect(tree.textContent(target)).toBe("New");
			expect(documentGeometry(tree).getBoundingClientRect(inserted).width).toBe(
				18,
			);
		}
	},
);
