import { expect, it } from "vitest";
import { parseHtmlFragment } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

function fragment(source: string, tagName = "div", hasFormAncestor = false) {
	const result = parseHtmlFragment(source, "https://example.com/", {
		tagName,
		hasFormAncestor,
	});
	return { ...result, queries: new DocumentQueries(result.tree) };
}

it("parses ordinary fragment nodes without document wrappers", () => {
	const {
		tree,
		fragment: root,
		queries,
	} = fragment(" leading <b id=bold>one &amp; two</b><!--note--><br>tail");
	expect(tree.get(root).kind).toBe("fragment");
	expect(tree.get(root).children.map((id) => tree.get(id).kind)).toEqual([
		"text",
		"element",
		"comment",
		"element",
		"text",
	]);
	expect(tree.textContent(root)).toBe(" leading one & twotail");
	expect(queries.querySelector("html, head, body", root)).toBeNull();
	expect(queries.querySelector("#bold", root)).not.toBeNull();
	tree.close();
});

it("preserves fragment BOM and leading pre/textarea context newlines", () => {
	for (const tagName of ["div", "pre", "textarea", "html"]) {
		const { tree, fragment: root } = fragment("\ufeff\nvalue", tagName);
		expect(tree.textContent(root)).toBe("\ufeff\nvalue");
		tree.close();
	}
});

it.each(["textarea", "title"])(
	"uses RCDATA for %s contexts without treating a closing context tag as markup",
	(tagName) => {
		const source = `\n&lt;b&gt;&amp;</${tagName}><em>literal</em>`;
		const { tree, fragment: root } = fragment(source, tagName);
		expect(tree.textContent(root)).toBe(`\n<b>&</${tagName}><em>literal</em>`);
		expect(tree.get(root).children).toHaveLength(1);
		tree.close();
	},
);

it.each([
	"style",
	"script",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
	"plaintext",
	"noscript",
])("uses literal text for the scripting-enabled %s context", (tagName) => {
	const source = `&amp;</${tagName}><b>literal</b>`;
	const { tree, fragment: root } = fragment(source, tagName);
	expect(tree.textContent(root)).toBe(source);
	expect(tree.get(root).children).toHaveLength(1);
	tree.close();
});

it.each([
	["table", "<tr><td>one<td>two", "tbody > tr > td", 2],
	["tbody", "<tr><td>one<td>two", "tr > td", 2],
	["thead", "<tr><th>one", "tr > th", 1],
	["tr", "<td>one<th>two", "td, th", 2],
	["colgroup", "<col><col>", "col", 2],
] as const)(
	"uses the %s table fragment context",
	(tagName, source, selector, count) => {
		const { tree, fragment: root, queries } = fragment(source, tagName);
		expect(queries.querySelectorAll(selector, root)).toHaveLength(count);
		expect(queries.querySelector("table", root)).toBeNull();
		tree.close();
	},
);

it("retains text fostered from a table fragment without changing a real parent", () => {
	const {
		tree,
		fragment: root,
		queries,
	} = fragment("before<tr><td>cell</td></tr>after", "table");
	expect(tree.textContent(root)).toBe("beforecellafter");
	expect(queries.querySelectorAll("tbody > tr > td", root)).toHaveLength(1);
	tree.close();
});

it("retains colgroup whitespace even after ignored non-whitespace characters", () => {
	const { tree, fragment: root } = fragment(
		" \nignored\t<col>ignored ",
		"colgroup",
	);
	expect(tree.textContent(root)).toBe(" \n\t ");
	tree.close();
});

it("does not pop the virtual context for repeated options or headings", () => {
	for (const [tagName, source] of [
		["option", "<option>one<option>two"],
		["h1", "<h2>one<h3>two"],
	]) {
		const { tree, fragment: root } = fragment(source, tagName);
		expect(tree.get(root).children).toHaveLength(2);
		tree.close();
	}
});

it("keeps select-context options and ignores disallowed controls", () => {
	const {
		tree,
		fragment: root,
		queries,
	} = fragment("<option>one<option>two<input><option>three", "select");
	expect(queries.querySelectorAll("option", root)).toHaveLength(3);
	expect(queries.querySelector("input", root)).toBeNull();
	tree.close();
});

it("uses the form ancestor pointer without mutating an existing form", () => {
	const {
		tree,
		fragment: root,
		queries,
	} = fragment(
		"<form id=ignored><input></form><form id=allowed>new</form>",
		"div",
		true,
	);
	expect(queries.querySelector("#ignored", root)).toBeNull();
	expect(queries.querySelector("#allowed", root)).not.toBeNull();
	expect(queries.querySelector("input", root)).not.toBeNull();
	tree.close();
});

it("ignores document wrapper tokens outside an html context", () => {
	const {
		tree,
		fragment: root,
		queries,
	} = fragment(
		"<!doctype html><html><head><title>title</title></head><body><p>body</p></body></html>",
	);
	expect(queries.querySelector("html, head, body", root)).toBeNull();
	expect(tree.textContent(root)).toBe("titlebody");
	tree.close();
});

it("creates head and body children for an html-element context", () => {
	const {
		tree,
		fragment: root,
		queries,
	} = fragment("<title>title</title><p>body", "html");
	expect(tree.get(root).children.map((id) => tree.get(id).tagName)).toEqual([
		"head",
		"body",
	]);
	expect(queries.querySelector("head > title", root)).not.toBeNull();
	expect(queries.querySelector("body > p", root)).not.toBeNull();
	tree.close();
});

it("retains leading comments in an html-element fragment", () => {
	const { tree, fragment: root } = fragment(
		"<!--leading--><title>title</title>",
		"html",
	);
	expect(tree.get(root).children.map((id) => tree.get(id).kind)).toEqual([
		"comment",
		"element",
		"element",
	]);
	expect(tree.get(tree.get(root).children[0]).data).toBe("leading");
	tree.close();
});

it("keeps inserted script source inert and rejects unsupported contexts", () => {
	const {
		tree,
		fragment: root,
		queries,
	} = fragment("<script>throw new Error('inert')</script><b>after</b>");
	expect(queries.querySelector("script", root)).not.toBeNull();
	expect(tree.textContent(root)).toContain("after");
	tree.close();
	for (const tagName of ["svg", "math", "frameset"]) {
		expect(() => fragment("<b>no</b>", tagName)).toThrow("not implemented");
	}
});

it("checks source, depth, node and cancellation limits", () => {
	expect(() =>
		parseHtmlFragment(
			"toolong",
			"https://example.com",
			{ tagName: "div" },
			{ limits: { maxTextCodeUnits: 3 } },
		),
	).toThrow("limit");
	expect(() =>
		parseHtmlFragment(
			"<b><i>deep",
			"https://example.com",
			{ tagName: "div" },
			{ limits: { maxDepth: 1 } },
		),
	).toThrow("depth limit");
	expect(() =>
		parseHtmlFragment(
			"<b><i>",
			"https://example.com",
			{ tagName: "div" },
			{ limits: { maxNodes: 3 } },
		),
	).toThrow("node limit");
	expect(() =>
		parseHtmlFragment(
			"text",
			"https://example.com",
			{ tagName: "div" },
			{ signal: AbortSignal.abort() },
		),
	).toThrow("aborted");
});
