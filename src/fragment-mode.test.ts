import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import {
	documentMode,
	setDocumentMode,
	type DocumentMode,
} from "./document-mode.js";
import {
	insertAdjacentHtml,
	setInnerHtml,
	setOuterHtml,
} from "./html-content.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument, parseHtmlFragment } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const documents: DocumentTree[] = [];
const source = "<p>before<table><tr><td>cell</td></tr></table>after";
const nested =
	"<p>before<table><tbody><tr><td>cell</td></tr></tbody></table>after</p>";
const siblings =
	"<p>before</p><table><tbody><tr><td>cell</td></tr></tbody></table>after";

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function element(tree: DocumentTree, selector: string) {
	const id = new DocumentQueries(tree).querySelector(selector);
	if (id === null) throw new Error(`Missing ${selector}`);
	return id;
}

it("inherits quirks mode while parsing a standalone fragment", () => {
	const result = parseHtmlFragment(source, "https://example.test/", {
		tagName: "div",
		documentMode: "quirks",
	});
	documents.push(result.tree);
	expect(documentMode(result.tree)).toBe("quirks");
	expect(serializeHtml(result.tree, result.fragment)).toBe(nested);
});

it("inherits quirks mode through native innerHTML", () => {
	const tree = parseHtmlDocument("<main>old</main>", "https://example.test/");
	documents.push(tree);
	const target = element(tree, "main");
	setInnerHtml(tree, target, source);
	expect(serializeHtml(tree, target, { includeSelf: false })).toBe(nested);
});

const modes: DocumentMode[] = ["quirks", "limited-quirks", "no-quirks"];

for (const mode of modes) {
	it.each(["div", "body", "html", "template"])(
		`uses ${mode} in a %s fragment without letting a doctype override it`,
		(tagName) => {
			const { tree, fragment } = parseHtmlFragment(
				`<!doctype html>${source}`,
				"https://example.test/",
				{ tagName, documentMode: mode },
			);
			documents.push(tree);
			expect(documentMode(tree)).toBe(mode);
			expect(htmlParseInfo(tree)?.mode).toBe(mode);
			expect(htmlParseInfo(tree)?.issues["missing-doctype"]).toBeUndefined();
			const expected = mode === "quirks" ? nested : siblings;
			expect(serializeHtml(tree, fragment)).toBe(
				tagName === "html" ? `<head></head><body>${expected}</body>` : expected,
			);
		},
	);

	it.each([
		"inner",
		"outer",
		"beforebegin",
		"afterbegin",
		"beforeend",
		"afterend",
	])(`uses the ${mode} owner for %s insertion`, (operation) => {
		const tree = parseHtmlDocument(
			"<main><div></div></main>",
			"https://example.test/",
		);
		documents.push(tree);
		setDocumentMode(tree, mode);
		const target = element(tree, "div");
		if (operation === "inner") setInnerHtml(tree, target, source);
		else if (operation === "outer") setOuterHtml(tree, target, source);
		else insertAdjacentHtml(tree, target, operation, source);
		const table = element(tree, "table");
		expect(tree.get(tree.get(table).parent ?? -1).tagName).toBe(
			mode === "quirks"
				? "p"
				: ["outer", "beforebegin", "afterend"].includes(operation)
					? "main"
					: "div",
		);
		expect(documentMode(tree)).toBe(mode);
	});
}

it.each(["div", "html"])(
	"defaults %s fragments to no-quirks without a mode",
	(tagName) => {
		const { tree, fragment } = parseHtmlFragment(
			source,
			"https://example.test/",
			{ tagName },
		);
		documents.push(tree);
		expect(documentMode(tree)).toBe("no-quirks");
		expect(serializeHtml(tree, fragment)).toContain(siblings);
	},
);

it("rejects invalid compatibility modes without invoking the document initializer", () => {
	let initialized = false;
	expect(() =>
		parseHtmlFragment(
			source,
			"https://example.test/",
			{
				tagName: "div",
				documentMode: "invalid" as DocumentMode,
			},
			{
				initializeDocument: () => {
					initialized = true;
				},
			},
		),
	).toThrow("compatibility mode");
	expect(initialized).toBe(false);
});

it("uses the context owner, not the template destination owner", () => {
	const tree = parseHtmlDocument(
		"<template></template>",
		"https://example.test/",
	);
	documents.push(tree);
	const host = element(tree, "template");
	const content = tree.templateContent(host);
	expect(documentMode(tree)).toBe("quirks");
	expect(documentMode(content.tree)).toBe("no-quirks");
	setInnerHtml(tree, host, source);
	expect(serializeHtml(content.tree, content.id)).toBe(nested);
	expect(documentMode(content.tree)).toBe("no-quirks");
	const child = content.tree.createElement("div");
	content.tree.append(content.id, child);
	setInnerHtml(content.tree, child, source);
	expect(serializeHtml(content.tree, child, { includeSelf: false })).toBe(
		siblings,
	);
});

it("inherits the owner mode for a detached fragment parent", () => {
	const tree = parseHtmlDocument("", "https://example.test/");
	documents.push(tree);
	const parent = tree.createFragment();
	const target = tree.createElement("div");
	tree.append(parent, target);
	setOuterHtml(tree, target, source);
	expect(serializeHtml(tree, parent)).toBe(nested);
});

it("uses the owner mode when adjacent insertion substitutes a body for html", () => {
	const tree = parseHtmlDocument("", "https://example.test/");
	documents.push(tree);
	insertAdjacentHtml(tree, element(tree, "html"), "beforeend", source);
	expect(tree.get(tree.get(element(tree, "table")).parent ?? -1).tagName).toBe(
		"p",
	);
});

it("samples changed owner mode on each insertion without changing existing nodes", () => {
	const tree = parseHtmlDocument("<main></main>", "https://example.test/");
	documents.push(tree);
	const target = element(tree, "main");
	setInnerHtml(tree, target, source);
	const original = tree.get(target).children[0];
	setDocumentMode(tree, "no-quirks");
	insertAdjacentHtml(tree, target, "beforeend", source);
	expect(tree.get(target).children[0]).toBe(original);
	expect(serializeHtml(tree, target, { includeSelf: false })).toBe(
		nested + siblings,
	);
});

it("clears inherited mode and parse metadata when the temporary owner closes", () => {
	const { tree } = parseHtmlFragment(source, "https://example.test/", {
		tagName: "html",
		documentMode: "limited-quirks",
	});
	expect(htmlParseInfo(tree)?.mode).toBe("limited-quirks");
	tree.close();
	expect(htmlParseInfo(tree)).toBeUndefined();
	expect(() => documentMode(tree)).toThrow("closed");
});

it("keeps failed fragment replacement atomic in a quirks document", () => {
	const tree = parseHtmlDocument("<main>old</main>", "https://example.test/");
	documents.push(tree);
	const target = element(tree, "main");
	const before = { revision: tree.revision, count: tree.nodeCount };
	expect(() =>
		setInnerHtml(tree, target, source, { signal: AbortSignal.abort() }),
	).toThrow("aborted");
	expect(tree.textContent(target)).toBe("old");
	expect({ revision: tree.revision, count: tree.nodeCount }).toEqual(before);
	expect(documentMode(tree)).toBe("quirks");
});

it.each(["inner", "outer", "adjacent"])(
	"shares inherited mode through the %s host binding",
	(operation) => {
		const tree = parseHtmlDocument(
			"<main><div></div></main>",
			"https://example.test/",
		);
		documents.push(tree);
		const createHostObject = (definition: ScriptHostObjectDefinition) => {
			const host = Object.create(null);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(host, name, descriptor);
			Object.assign(host, definition.methods);
			return host;
		};
		const dom = new ScriptDom(tree, { createHostObject });
		const host = dom.node(element(tree, "div")) as {
			innerHTML: string;
			outerHTML: string;
			insertAdjacentHTML(position: string, value: string): void;
		};
		if (operation === "inner") host.innerHTML = source;
		else if (operation === "outer") host.outerHTML = source;
		else host.insertAdjacentHTML("beforeend", source);
		expect(
			tree.get(tree.get(element(tree, "table")).parent ?? -1).tagName,
		).toBe("p");
	},
);
