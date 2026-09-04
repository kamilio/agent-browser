import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { setInnerHtml } from "./html-content.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";

it("replaces children with parsed HTML while retaining detached old identities", () => {
	const tree = parseHtmlDocument(
		"<main id=mount><b id=old>old</b></main>",
		"https://example.com",
	);
	const queries = new DocumentQueries(tree);
	const mount = queries.querySelector("#mount");
	const old = queries.querySelector("#old");
	if (mount === null || old === null) throw new Error("Missing fixture");
	const reference = tree.reference(old);
	setInnerHtml(tree, mount, "<p id=new>one &amp; two</p>");
	expect(serializeHtml(tree, mount)).toBe('<p id="new">one &amp; two</p>');
	expect(tree.get(old).parent).toBeNull();
	expect(tree.textContent(old)).toBe("old");
	expect(() => tree.resolve(reference)).toThrow("no longer");
	expect(queries.querySelector("#new")).not.toBeNull();
	tree.close();
});

it("preserves the old document, node count and revision on parse failure", () => {
	const tree = new DocumentTree("https://example.com");
	const mount = tree.createElement("div");
	tree.append(tree.root, mount);
	tree.setTextContent(mount, "original");
	const count = tree.nodeCount;
	const revision = tree.revision;
	expect(() =>
		setInnerHtml(tree, mount, "<b>staged</b><svg>unsupported"),
	).toThrow("not implemented");
	expect(tree.textContent(mount)).toBe("original");
	expect(tree.nodeCount).toBe(count);
	expect(tree.revision).toBe(revision);
	tree.close();
});

it.each([{ maxNodes: 5 }, { maxTextCodeUnits: 12 }, { maxDepth: 2 }])(
	"preflights aggregate destination limits before importing or replacing: %j",
	(limits) => {
		const tree = new DocumentTree("https://example.com", limits);
		const mount = tree.createElement("div");
		tree.append(tree.root, mount);
		tree.setTextContent(mount, "older");
		const count = tree.nodeCount;
		const revision = tree.revision;
		expect(() => setInnerHtml(tree, mount, "<b>text</b>")).toThrow("limit");
		expect(tree.textContent(mount)).toBe("older");
		expect(tree.nodeCount).toBe(count);
		expect(tree.revision).toBe(revision);
		tree.close();
	},
);

it("clears a full document without allocating nodes and clears detached focus", () => {
	const tree = new DocumentTree("https://example.com", { maxNodes: 3 });
	const mount = tree.createElement("div");
	const child = tree.createElement("button");
	tree.append(tree.root, mount);
	tree.append(mount, child);
	tree.setActiveElement(child);
	setInnerHtml(tree, mount, "");
	expect(tree.get(mount).children).toEqual([]);
	expect(tree.nodeCount).toBe(3);
	expect(tree.activeElement).toBeNull();
	tree.close();
});

it("uses actual table and ancestor-form contexts", () => {
	const tree = parseHtmlDocument(
		"<form><div id=mount></div><table></table></form>",
		"https://example.com",
	);
	const queries = new DocumentQueries(tree);
	const mount = queries.querySelector("#mount");
	const table = queries.querySelector("table");
	if (mount === null || table === null) throw new Error("Missing fixture");
	setInnerHtml(tree, table, "<tr><td>cell</td></tr>");
	setInnerHtml(tree, mount, "<form id=nested><input name=value></form>");
	expect(queries.querySelector("table > tbody > tr > td")).not.toBeNull();
	expect(queries.querySelector("#nested")).toBeNull();
	expect(queries.querySelector("#mount > input")).not.toBeNull();
	tree.close();
});

it("rejects non-element and closed targets", () => {
	const tree = new DocumentTree("https://example.com");
	expect(() => setInnerHtml(tree, tree.root, "text")).toThrow("element");
	const mount = tree.createElement("div");
	tree.close();
	expect(() => setInnerHtml(tree, mount, "text")).toThrow("closed");
});

it("serializes escaped attributes, text, comments and void elements", () => {
	const tree = new DocumentTree("https://example.com");
	const mount = tree.createElement("DIV", { title: '"<&>\u00a0' });
	tree.append(mount, tree.createText('<&>\u00a0"'));
	tree.append(mount, tree.createComment("note"));
	const input = tree.createElement("input", { disabled: "" });
	tree.append(input, tree.createText("not serialized"));
	tree.append(mount, input);
	expect(serializeHtml(tree, mount, { includeSelf: true })).toBe(
		'<div title="&quot;&lt;&amp;&gt;&nbsp;">&lt;&amp;&gt;&nbsp;"<!--note--><input disabled=""></div>',
	);
	expect(serializeHtml(tree, input)).toBe("");
	tree.close();
});

it("serializes raw-text and RCDATA contexts differently", () => {
	const tree = new DocumentTree("https://example.com");
	for (const tagName of ["script", "style", "textarea", "title"]) {
		const parent = tree.createElement(tagName);
		tree.append(parent, tree.createText("<&>"));
		expect(serializeHtml(tree, parent)).toBe(
			["script", "style"].includes(tagName) ? "<&>" : "&lt;&amp;&gt;",
		);
	}
	tree.close();
});

it("checks escaped-output budgets and validates serialization options", () => {
	const tree = new DocumentTree("https://example.com");
	const mount = tree.createElement("p");
	tree.setTextContent(mount, "&&");
	expect(() => serializeHtml(tree, mount, { maxCodeUnits: 9 })).toThrow(
		"limit",
	);
	expect(serializeHtml(tree, mount, { maxCodeUnits: 10 })).toBe("&amp;&amp;");
	expect(() => serializeHtml(tree, mount, { maxCodeUnits: -1 })).toThrow(
		"Invalid",
	);
	tree.close();
	expect(() => serializeHtml(tree, mount)).toThrow("closed");
});
