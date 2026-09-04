import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { HtmlTables } from "./html-tables.js";
import type { HtmlParserNode } from "./html-formatting.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { htmlParseInfo } from "./html-info.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function parse(source: string, tagName = "body") {
	const parsed = parseHtmlFragment(source, "https://example.com/", { tagName });
	trees.push(parsed.tree);
	return { ...parsed, html: serializeHtml(parsed.tree, parsed.fragment) };
}

it("closes a column group before reprocessing incompatible markup", () => {
	expect(parse("<table><colgroup><col><p>x</p><tr><td>y").html).toBe(
		"<p>x</p><table><colgroup><col></colgroup><tbody><tr><td>y</td></tr></tbody></table>",
	);
});

it("closes an outer table before reprocessing a nested table start outside a cell", () => {
	expect(parse("<table><tr><td>one</td></tr><table><tr><td>two").html).toBe(
		"<table><tbody><tr><td>one</td></tr></tbody></table><table><tbody><tr><td>two</td></tr></tbody></table>",
	);
});

it("fosters ordinary inputs but keeps hidden inputs in table structure", () => {
	expect(parse("<table><input><input type=hidden><tr><td>x").html).toBe(
		'<input><table><input type="hidden"><tbody><tr><td>x</td></tr></tbody></table>',
	);
});

it.each([
	[
		"<table><td>a<td>b",
		"<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>",
	],
	[
		"<table><col><col><tr><td>x",
		"<table><colgroup><col><col></colgroup><tbody><tr><td>x</td></tr></tbody></table>",
	],
	[
		"<table><thead><tr><th>a<tbody><tr><td>b<tfoot><tr><td>c",
		"<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody><tfoot><tr><td>c</td></tr></tfoot></table>",
	],
	[
		"<table><caption><b>a<tr><td>b",
		"<table><caption><b>a</b></caption><tbody><tr><td>b</td></tr></tbody></table>",
	],
	[
		"<table><tr><td><b>a<tr><td>b",
		"<table><tbody><tr><td><b>a</b></td></tr><tr><td>b</td></tr></tbody></table>",
	],
	[
		"<table><tr><td>a</thead>b</td></tr></table>",
		"<table><tbody><tr><td>ab</td></tr></tbody></table>",
	],
	[
		"<table><tbody><tr><td>a</tfoot>b",
		"<table><tbody><tr><td>ab</td></tr></tbody></table>",
	],
	[
		"<table><tr><td>a</th>b",
		"<table><tbody><tr><td>ab</td></tr></tbody></table>",
	],
	[
		"<table><caption>a</td>b</caption></table>",
		"<table><caption>ab</caption></table>",
	],
	[
		"<table><colgroup><col></col><col></colgroup></table>",
		"<table><colgroup><col><col></colgroup></table>",
	],
] as const)("repairs table structure for %s", (source, expected) => {
	expect(parse(source).html).toBe(expected);
});

it("allows a genuinely nested table inside a cell", () => {
	expect(
		parse("<table><tr><td>outer<table><tr><td>inner</table>tail</table>").html,
	).toBe(
		"<table><tbody><tr><td>outer<table><tbody><tr><td>inner</td></tr></tbody></table>tail</td></tr></tbody></table>",
	);
});

it("does not close an inner table for a section end belonging to an outer table", () => {
	expect(
		parse(
			"<table><thead><tr><td><table></thead><tr><td>inner</table>outer</table>",
		).html,
	).toBe(
		"<table><thead><tr><td><table><tbody><tr><td>inner</td></tr></tbody></table>outer</td></tr></thead></table>",
	);
});

it("reprocesses a row after closing a select opened in table context", () => {
	expect(parse("<table><select><option>choice<tr><td>cell</table>").html).toBe(
		"<select><option>choice</option></select><table><tbody><tr><td>cell</td></tr></tbody></table>",
	);
});

it("closes a cell-local select and cell before starting another cell", () => {
	expect(parse("<table><tr><td><select><option>a<td>b</table>").html).toBe(
		"<table><tbody><tr><td><select><option>a</option></select></td><td>b</td></tr></tbody></table>",
	);
});

it("ignores an out-of-scope section end inside a table select", () => {
	expect(parse("<table><select><option>a</thead>b</select></table>").html).toBe(
		"<select><option>ab</option></select><table></table>",
	);
});

it("does not reset the main body stack for document closing tags inside a table", () => {
	expect(parse("<table></body></html><tr><td>cell</table>after").html).toBe(
		"<table><tbody><tr><td>cell</td></tr></tbody></table>after",
	);
});

it("keeps a table form out of the open-element stack", () => {
	expect(
		parse(
			"<table><form id=first><input type=hidden><form id=ignored><tr><td>x</table></form><form id=after>y</form>",
		).html,
	).toBe(
		'<table><form id="first"></form><input type="hidden"><tbody><tr><td>x</td></tr></tbody></table><form id="after">y</form>',
	);
});

it("ignores a table form when an outer form pointer already exists", () => {
	expect(
		parse("<form id=outer><table><form id=ignored><tr><td>x</table></form>")
			.html,
	).toBe(
		'<form id="outer"><table><tbody><tr><td>x</td></tr></tbody></table></form>',
	);
});

it("ignores table-mode forms inside templates without blocking body-mode forms", () => {
	expect(
		parse(
			"<template><table><form id=ignored><tr><td>x</table><form id=body>y</form></template>",
		).html,
	).toBe(
		'<template><table><tbody><tr><td>x</td></tr></tbody></table><form id="body">y</form></template>',
	);
});

it("distinguishes hidden input ASCII case without trimming invalid values", () => {
	expect(
		parse('<table><input type=HIDDEN><input type=" hidden "></table>').html,
	).toBe('<input type=" hidden "><table><input type="HIDDEN"></table>');
});

it.each([
	["table", "</table><tr><td>x", "<tbody><tr><td>x</td></tr></tbody>"],
	["tbody", "</tbody><tbody><tr><td>x", "<tr><td>x</td></tr>"],
	["tr", "</tr><tr><td>x", "<td>x</td>"],
	["td", "</td><td>x", "x"],
	["colgroup", "</colgroup><p>ignored</p>\t<col>", "\t<col>"],
] as const)(
	"cannot pop the virtual %s fragment context",
	(context, source, expected) => {
		expect(parse(source, context).html).toBe(expected);
	},
);

it("closes column groups for non-whitespace while preserving leading whitespace", () => {
	expect(parse("<table><colgroup> \tx y<tr><td>cell</table>").html).toBe(
		"x y<table><colgroup> \t</colgroup><tbody><tr><td>cell</td></tr></tbody></table>",
	);
});

it("retains whitespace-only table text but fosters an entire mixed batch", () => {
	expect(parse("<table> \t<tr><td>x</td></tr> y </table>").html).toBe(
		" y <table> \t<tbody><tr><td>x</td></tr></tbody></table>",
	);
});

it("flushes pending table text before comments and EOF", () => {
	expect(parse("<table> <!--boundary--> x").html).toBe(
		" x<table> <!--boundary--></table>",
	);
});

it("keeps templates in column groups and repairs their tables within inert owners", () => {
	expect(
		parse(
			"<table><colgroup><template><table><colgroup><col><p>x</p></table></template><col></table>",
		).html,
	).toBe(
		"<table><colgroup><template><p>x</p><table><colgroup><col></colgroup></table></template><col></colgroup></table>",
	);
});

it("recovers nested table starts inside a template without escaping its owner", () => {
	expect(
		parse("<template><table><tr><td>a</td></tr><table><tr><td>b</template>")
			.html,
	).toBe(
		"<template><table><tbody><tr><td>a</td></tr></tbody></table><table><tbody><tr><td>b</td></tr></tbody></table></template>",
	);
});

it("buffers mixed table text across parser-write boundaries before deciding its destination", async () => {
	const seen: number[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<script>write</script>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner, _id, context) {
				context.write("<table> ");
				const table = [...owner.walk()].find(
					({ node }) => node.tagName === "table",
				);
				if (!table) throw new Error("Missing table");
				seen.push(owner.get(table.node.id).children.length);
				context.write("word");
				seen.push(owner.get(table.node.id).children.length);
				context.write("</table>");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const body = [...tree.walk()].find(({ node }) => node.tagName === "body");
	if (!body) throw new Error("Missing body");
	expect(seen).toEqual([0, 0]);
	expect(serializeHtml(tree, body.node.id)).toBe(" word<table></table>");
});

it("inserts a whitespace-only batch in its table after multiple writes", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<script>write</script>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(_owner, _id, context) {
				context.write("<table> ");
				context.write("\t");
				context.write("</table>");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const table = [...tree.walk()].find(({ node }) => node.tagName === "table");
	if (!table) throw new Error("Missing table");
	expect(tree.get(table.node.id).children).toHaveLength(1);
	expect(tree.textContent(table.node.id)).toBe(" \t");
});

it("fosters through the preceding stack element when a live hook detaches a table", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<div><table><script>remove</script>visible</table></div>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner) {
				const table = [...owner.walk()].find(
					({ node }) => node.tagName === "table",
				);
				if (!table) throw new Error("Missing table");
				owner.remove(table.node.id);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const div = [...tree.walk()].find(({ node }) => node.tagName === "div");
	if (!div) throw new Error("Missing div");
	expect(serializeHtml(tree, div.node.id)).toBe("visible");
});

it.each(["style", "noframes"])(
	"returns from %s raw-text mode before processing template table content",
	(tag) => {
		expect(
			parse(`<template><${tag}>raw</${tag}>outside<tr><td>cell</template>`)
				.html,
		).toBe(
			`<template><${tag}>raw</${tag}>outside<tr><td>cell</td></tr></template>`,
		);
	},
);

function state(limits = { maxWork: 1000, maxText: 1000 }, stuck = false) {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	const root: HtmlParserNode = { tree, id: tree.root, tag: "body" };
	const table: HtmlParserNode = {
		tree,
		id: tree.createElement("table"),
		tag: "table",
	};
	tree.append(tree.root, table.id);
	const stack = [root, table];
	const emitted: { data: string; foster: boolean }[] = [];
	const options: ConstructorParameters<typeof HtmlTables>[0] = {
		stack: () => stack,
		template: () => undefined,
		push: (tag, attributes) => {
			if (stuck) return;
			const node = { tree, id: tree.createElement(tag, attributes), tag };
			tree.append(stack[stack.length - 1].id, node.id);
			stack.push(node);
		},
		insert() {},
		form() {},
		reset() {},
		issue() {},
		check() {},
		emit: (data, foster) => {
			emitted.push({ data, foster });
		},
		...limits,
	};
	return { tree, stack, emitted, options, tables: new HtmlTables(options) };
}

it("bounds pending table text before retaining an overflowing chunk", () => {
	const { tables, emitted } = state({ maxWork: 1000, maxText: 3 });
	tables.characters("ab");
	expect(() => tables.characters("cd")).toThrow("pending table text limit");
	tables.flush();
	expect(emitted).toEqual([{ data: "ab", foster: true }]);
});

it("resets pending character state after flushing", () => {
	const { tables, emitted } = state();
	tables.characters("x");
	tables.flush();
	tables.characters(" \t");
	tables.flush();
	tables.flush();
	expect(emitted).toEqual([
		{ data: "x", foster: true },
		{ data: " \t", foster: false },
	]);
});

it("bounds table-context scans even when a native caller mutates its options", () => {
	const { tables, options } = state({ maxWork: 2, maxText: 1000 });
	options.maxWork = 100000;
	tables.context();
	tables.context();
	expect(() => tables.context()).toThrow("table work limit");
});

it("bounds token reprocessing when an injected stack mutation makes no progress", () => {
	const { tables } = state({ maxWork: 10000, maxText: 1000 }, true);
	expect(() =>
		tables.tag({
			kind: "start",
			name: "tr",
			attributes: {},
			selfClosing: false,
		}),
	).toThrow("table token reprocessing limit");
});

it.each([
	{ maxWork: 0, maxText: 1 },
	{ maxWork: 1, maxText: Number.NaN },
	{ maxWork: Number.POSITIVE_INFINITY, maxText: 1 },
])("rejects invalid table limits: %j", (limits) => {
	expect(() => state(limits)).toThrow("Invalid HTML table work limits");
});

it("charges implicit table nodes to the existing native allocation budget", () => {
	let owner: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument("<table><td>x", "https://example.com/", {
			limits: { maxNodes: 8 },
			initializeDocument(tree) {
				owner = tree;
			},
		}),
	).toThrow("node limit");
	expect(() => owner?.get(owner.root)).toThrow("closed");
});

it("closes a candidate with pending table characters when a parser write is cancelled", async () => {
	const controller = new AbortController();
	let owner: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"<script>write</script>",
			"https://example.com/",
			{ signal: controller.signal },
			{
				start(tree) {
					owner = tree;
				},
				async script(tree, _id, context) {
					context.write("<table>pending");
					const table = [...tree.walk()].find(
						({ node }) => node.tagName === "table",
					);
					if (!table) throw new Error("Missing table");
					expect(tree.get(table.node.id).children).toEqual([]);
					controller.abort();
				},
				async finish() {},
			},
		),
	).rejects.toThrow("aborted");
	expect(() => owner?.get(owner.root)).toThrow("closed");
});

it("keeps table scripts and policy hooks inert in template contents", async () => {
	const scripts: string[] = [];
	const policies: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		'<template><table><script>inert</script><meta http-equiv="content-security-policy" content="inert"><tr><td>x</template><table><script>active</script><meta http-equiv="content-security-policy" content="active"></table>',
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner, id) {
				scripts.push(owner.textContent(id));
			},
			policy(owner, id) {
				policies.push(owner.get(id).attributes.content);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(scripts).toEqual(["active"]);
	expect(policies).toEqual(["active"]);
});

it("coalesces fostered text with an existing adjacent text node", () => {
	const result = parse("before<table>after</table>");
	expect(result.tree.get(result.fragment).children).toHaveLength(2);
	expect(result.html).toBe("beforeafter<table></table>");
});

it("does not reuse a foster-text reference moved by a live parser hook", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<div>before<table>first<script>move</script>second</table></div><aside></aside>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner) {
				const div = [...owner.walk()].find(
					({ node }) => node.tagName === "div",
				);
				if (!div) throw new Error("Missing div");
				const text = owner
					.get(div.node.id)
					.children.find((id) => owner.get(id).kind === "text");
				if (text === undefined) throw new Error("Missing text");
				const retained = owner.createElement("section");
				owner.append(retained, text);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const div = [...tree.walk()].find(({ node }) => node.tagName === "div");
	if (!div) throw new Error("Missing div");
	expect(serializeHtml(tree, div.node.id)).toBe(
		"second<table><script>move</script></table>",
	);
});

it("charges foster adjacency scans to the same table work budget", () => {
	const { tables } = state({ maxWork: 2, maxText: 100 });
	expect(() => tables.scan(3)).toThrow("table work limit");
});

it.each([-1, Number.NaN, 1.5])(
	"rejects invalid table scan work %s",
	(count) => {
		const { tables } = state();
		expect(() => tables.scan(count)).toThrow("Invalid HTML table scan work");
	},
);
