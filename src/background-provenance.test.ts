import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { loadStylesheetImports } from "./stylesheet-imports.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(html: string) {
	const tree = parseHtmlDocument(html, "https://page.example/docs/page");
	trees.push(tree);
	const styles = documentStyles(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const reference = queries.querySelector(selector);
		if (reference === null) throw new Error(`Missing fixture ${selector}`);
		return reference;
	};
	return { tree, styles, id };
}

it("resolves inline background URL case against the live document base", () => {
	const { tree, styles, id } = fixture(
		'<base href="/assets/"><div id="target" style="background-image:url(Icon.PNG)"></div>',
	);
	expect(styles.paint(id("#target")).background?.["background-image"]).toBe(
		'url("https://page.example/assets/Icon.PNG")',
	);
	tree.setAttribute(id("base"), "href", "/changed/");
	expect(styles.paint(id("#target")).background?.["background-image"]).toBe(
		'url("https://page.example/changed/Icon.PNG")',
	);
});

it("retains the external stylesheet base instead of the page base", () => {
	const { styles, id } = fixture(
		'<link rel="stylesheet" href="https://cdn.example/css/main.css"><div id="target"></div>',
	);
	styles.setExternalSheet(
		id("link"),
		"https://cdn.example/css/main.css",
		"div{background-image:url(../Icon.PNG)}",
	);
	expect(styles.paint(id("#target")).background?.["background-image"]).toBe(
		'url("https://cdn.example/Icon.PNG")',
	);
});

it("uses redirected imported sheet URLs and variable use-site provenance", async () => {
	const { styles, id } = fixture(
		'<link rel="stylesheet" href="https://cdn.example/main.css"><div id="target"></div><p id="other"></p>',
	);
	const source = await loadStylesheetImports(
		{
			url: "https://cdn.example/redirect/main.css",
			encoding: "utf-8",
			text: '@import "nested.css"; :root{--icon:url(Icon.PNG)} p{background-image:var(--icon)}',
		},
		{
			signal: new AbortController().signal,
			fetch: async () => ({
				url: "https://images.example/theme/nested.css",
				encoding: "utf-8",
				text: "div{background-image:var(--icon)}div::before{content:'';background-image:url(Pseudo.PNG)}",
			}),
		},
	);
	styles.setStylesheetSource(
		id("link"),
		"https://cdn.example/main.css",
		source.source,
	);
	expect(styles.paint(id("#target")).background?.["background-image"]).toBe(
		'url("https://images.example/theme/Icon.PNG")',
	);
	expect(styles.paint(id("#other")).background?.["background-image"]).toBe(
		'url("https://cdn.example/redirect/Icon.PNG")',
	);
	expect(
		styles.generatedContent(id("#target"), "before")?.paint.background?.[
			"background-image"
		],
	).toBe('url("https://images.example/theme/Pseudo.PNG")');
});

it("inherits resolved URLs rather than rebasing them at the child", () => {
	const { styles, id } = fixture(
		'<link rel="stylesheet" href="https://cdn.example/theme/main.css"><div id="parent"><p id="child" style="background-image:inherit"></p></div>',
	);
	styles.setExternalSheet(
		id("link"),
		"https://cdn.example/theme/main.css",
		"div{background-image:url(Icon.PNG)}",
	);
	expect(styles.paint(id("#child")).background?.["background-image"]).toBe(
		'url("https://cdn.example/theme/Icon.PNG")',
	);
});
