import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { htmlParseInfo } from "./html-info.js";
import { DocumentQueries } from "./selectors.js";
import { HtmlFormatting, type HtmlParserNode } from "./html-formatting.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function parse(source: string) {
	const parsed = parseHtmlFragment(source, "https://example.com/", {
		tagName: "body",
	});
	trees.push(parsed.tree);
	return { ...parsed, html: serializeHtml(parsed.tree, parsed.fragment) };
}

it("reconstructs formatting after a paragraph implicitly closes its element", () => {
	expect(parse("<p><b>one<p>two").html).toBe(
		"<p><b>one</b></p><p><b>two</b></p>",
	);
});

it("reconstructs an inner formatting element after a misnested outer close", () => {
	expect(parse("<b><i>one</b>two</i>").html).toBe(
		"<b><i>one</i></b><i>two</i>",
	);
});

it("repairs formatting that straddles a block using the adoption agency", () => {
	expect(parse("<b><p>one</b>two</p>").html).toBe(
		"<b></b><p><b>one</b>two</p>",
	);
});

it.each([
	"a",
	"b",
	"big",
	"code",
	"em",
	"font",
	"i",
	"nobr",
	"s",
	"small",
	"strike",
	"strong",
	"tt",
	"u",
])("reconstructs the %s formatting family", (tag) => {
	expect(parse(`<p><${tag} data-kind="value">one</p>two`).html).toBe(
		`<p><${tag} data-kind="value">one</${tag}></p><${tag} data-kind="value">two</${tag}>`,
	);
});

it("does not reconstruct formatting just to wrap a comment", () => {
	expect(parse("<p><b>one</p><!--comment-->two").html).toBe(
		"<p><b>one</b></p><!--comment--><b>two</b>",
	);
});

it("reconstructs for whitespace, caret text and a void element", () => {
	expect(parse("<p><b>one</p> ^<img>").html).toBe(
		"<p><b>one</b></p><b> ^<img></b>",
	);
	expect(parse("<p><b>one</p><br>two").html).toBe(
		"<p><b>one</b></p><b><br>two</b>",
	);
});

it("removes an ended formatting entry even when it is no longer open", () => {
	const result = parse("<p><b>one</p></b>two");
	expect(result.html).toBe("<p><b>one</b></p>two");
	expect(htmlParseInfo(result.tree)?.issues["detached-formatting-end"]).toBe(1);
});

it("does not let an unmatched formatting end jump over a special element", () => {
	expect(parse("<b><div></i>text</div></b>").html).toBe(
		"<b><div>text</div></b>",
	);
});

it("limits identical active formatting entries to three without deleting original nodes", () => {
	expect(parse("<p><b><b><b><b>one</p>two").html).toBe(
		"<p><b><b><b><b>one</b></b></b></b></p><b><b><b>two</b></b></b>",
	);
});

it("compares original attributes without regard to attribute ordering", () => {
	const source =
		"<p><b id=x class=y><b class=y id=x><b id=x class=y><b class=y id=x>one</p>two";
	const result = parse(source);
	const siblings = result.tree.get(result.fragment).children;
	let node = result.tree.get(siblings[1]);
	let depth = 0;
	while (node.kind === "element") {
		depth++;
		expect(node.attributes).toMatchObject({ id: "x", class: "y" });
		node = result.tree.get(node.children[0]);
	}
	expect(depth).toBe(3);
});

it("keeps different attribute values as separate formatting entries", () => {
	expect(parse("<p><b id=a><b id=b><b id=c><b id=d>one</p>two").html).toBe(
		'<p><b id="a"><b id="b"><b id="c"><b id="d">one</b></b></b></b></p><b id="a"><b id="b"><b id="c"><b id="d">two</b></b></b></b>',
	);
});

it("closes nested anchors without retaining the old active anchor", () => {
	expect(parse("<a href=one>one<a href=two>two</a>three").html).toBe(
		'<a href="one">one</a><a href="two">two</a>three',
	);
});

it("repairs nested nobr entries before reconstructing later content", () => {
	expect(parse("<nobr>one<nobr>two</nobr>three").html).toBe(
		"<nobr>one</nobr><nobr>two</nobr>three",
	);
});

it("handles a pruned formatting element still present on the open-element stack", () => {
	expect(parse("<b><b><b><b>x</b></b></b></b>y").html).toBe(
		"<b><b><b><b>x</b></b></b></b>y",
	);
});

it("clears formatting at table cell boundaries", () => {
	expect(parse("<table><tr><td><b>one<td>two</table>three").html).toBe(
		"<table><tbody><tr><td><b>one</b></td><td>two</td></tr></tbody></table>three",
	);
});

it("clears formatting at caption boundaries", () => {
	expect(
		parse("<table><caption><b>one</caption><tr><td>two</table>three").html,
	).toBe(
		"<table><caption><b>one</b></caption><tbody><tr><td>two</td></tr></tbody></table>three",
	);
});

it.each(["applet", "marquee", "object"])(
	"clears formatting at a closing %s marker",
	(tag) => {
		expect(parse(`<${tag}><b>one</${tag}>two`).html).toBe(
			`<${tag}><b>one</b></${tag}>two`,
		);
	},
);

it("does not reconstruct an outer formatter inside template contents", () => {
	expect(
		parse("<b>one<template>inside<i>inner</template>two</b>three").html,
	).toBe("<b>one<template>inside<i>inner</i></template>two</b>three");
});

it("repairs block-straddling formatting inside the inert template owner", () => {
	expect(parse("<template><b><p>one</b>two</p></template>").html).toBe(
		"<template><b></b><p><b>one</b>two</p></template>",
	);
});

it("keeps intermediate adoption clones in the actual template contents owner", () => {
	const result = parse("<template><b><i><p>one</b>two</p></template>");
	expect(result.html).toBe(
		"<template><b><i></i></b><i><p><b>one</b>two</p></i></template>",
	);
	const template = result.tree.get(result.fragment).children[0];
	const content = result.tree.templateContent(template);
	for (const entry of content.tree.walk(content.id))
		expect(entry.node.kind === "document").toBe(false);
});

it("uses the original start token rather than script-mutated attributes for reconstruction", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<p><b class=original>one<script>change</script></p>two",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner) {
				const bold = [...owner.walk()].find(({ node }) => node.tagName === "b");
				if (!bold) throw new Error("Missing bold");
				owner.setAttribute(bold.node.id, "class", "changed");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const bolds = [...tree.walk()].filter(({ node }) => node.tagName === "b");
	expect(bolds.map(({ node }) => node.attributes.class)).toEqual([
		"changed",
		"original",
	]);
});

it("keeps active formatting state through parser-write input boundaries", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<script>write</script>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(_owner, _id, context) {
				context.write("<p><b>one");
				context.write("</p>two");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const body = [...tree.walk()].find(({ node }) => node.tagName === "body");
	if (!body) throw new Error("Missing body");
	expect(serializeHtml(tree, body.node.id)).toBe("<p><b>one</b></p><b>two</b>");
});

it("checks cancellation while repairing rather than returning a partial live document", () => {
	const controller = new AbortController();
	let tree: DocumentTree | undefined;
	let insertions = 0;
	expect(() =>
		parseHtmlDocument("<b><p>one</b>two</p>", "https://example.com/", {
			signal: controller.signal,
			initializeDocument(owner) {
				tree = owner;
				owner.onChange((change) => {
					if (change.kind === "insert" && ++insertions === 7)
						controller.abort();
				});
			},
		}),
	).toThrow("aborted");
	expect(insertions).toBe(7);
	expect(() => tree?.get(tree.root)).toThrow("closed");
});

function state(limits = { maxWork: 10000, maxText: 10000 }) {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	const root: HtmlParserNode = { tree, id: tree.createFragment(), tag: "body" };
	const stack = [root];
	const options: ConstructorParameters<typeof HtmlFormatting>[0] = {
		stack: () => stack,
		insert: (tag, attributes) => {
			const id = tree.createElement(tag, attributes);
			tree.append(stack[stack.length - 1].id, id);
			return { tree, id, tag };
		},
		place: (node, parent) => tree.append(parent.id, node.id),
		issue() {},
		check() {},
		...limits,
	};
	const formatter = new HtmlFormatting(options);
	const add = (tag: string, attributes: Record<string, string> = {}) => {
		const node = { tree, id: tree.createElement(tag, attributes), tag };
		tree.append(stack[stack.length - 1].id, node.id);
		stack.push(node);
		formatter.add(node, attributes);
		return node;
	};
	return { tree, stack, formatter, add, options };
}

it("bounds formatting-list and stack-search work", () => {
	const { formatter, add } = state({ maxWork: 5, maxText: 1000 });
	add("b");
	expect(() => {
		for (let count = 0; count < 10; count++) formatter.find("i");
	}).toThrow("formatting work limit");
});

it("bounds repeated original-attribute comparisons", () => {
	const { add } = state({ maxWork: 1000, maxText: 5 });
	add("b", { title: "long" });
	expect(() => add("b", { title: "long" })).toThrow(
		"formatting text work limit",
	);
});

it("does not reconstruct across a still-open marker", () => {
	const { tree, stack, formatter, add } = state();
	add("b");
	const marker = { tree, id: tree.createElement("object"), tag: "object" };
	stack.push(marker);
	formatter.mark(marker);
	const before = tree.nodeCount;
	formatter.reconstruct(false);
	expect(tree.nodeCount).toBe(before);
});

it("keeps formatting out of scope across a table boundary", () => {
	const { tree, stack, formatter, add } = state();
	const bold = add("b");
	stack.push({ tree, id: tree.createElement("table"), tag: "table" });
	expect(formatter.inScope(bold)).toBe(false);
	formatter.end("b");
	expect(stack).toHaveLength(3);
});

it("removes non-formatting intermediate stack entries without deleting their DOM nodes", () => {
	expect(parse("<b><span><i><p>x</b>y").html).toBe(
		"<b><span><i></i></span></b><i><p><b>x</b>y</p></i>",
	);
});

it("limits intermediate adoption cloning to the final three active entries", () => {
	expect(parse("<b><i><u><em><strong><p>x</b>y").html).toBe(
		"<b><i><u><em><strong></strong></em></u></i></b><u><em><strong><p><b>x</b>y</p></strong></em></u>",
	);
});

it("repeats adoption repair across successive furthest blocks", () => {
	expect(parse("<b><div><p>x</b>y").html).toBe(
		"<b></b><div><b></b><p><b>x</b>y</p></div>",
	);
});

it("uses the standard eight-round cap for a single formatting end token", () => {
	const result = parse(`<b>${"<div>".repeat(9)}x</b>y`);
	const queries = new DocumentQueries(result.tree);
	expect(queries.querySelectorAll("b", result.fragment)).toHaveLength(9);
	expect(result.tree.textContent(result.fragment)).toBe("xy");
	queries.close();
});

it("does not reconstruct outer formatting inside a table cell but resumes it afterward", () => {
	expect(parse("<p><b>one</p><table><tr><td>cell</table>two").html).toBe(
		"<p><b>one</b></p><table><tbody><tr><td>cell</td></tr></tbody></table><b>two</b>",
	);
});

it("keeps raw textarea data outside reconstructed formatting", () => {
	expect(parse("<p><b>one</p><textarea>raw</textarea>two").html).toBe(
		"<p><b>one</b></p><textarea>raw</textarea><b>two</b>",
	);
});

it.each([
	{ maxWork: Number.NaN, maxText: 1 },
	{ maxWork: 0, maxText: 1 },
	{ maxWork: 1, maxText: Number.POSITIVE_INFINITY },
])("rejects invalid formatting budgets: %j", (limits) => {
	expect(() => state(limits)).toThrow("Invalid HTML formatting work limits");
});

it("charges reconstructed copies to the native node budget and closes a failed parse", () => {
	let tree: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument("<p><b>one</p>two", "https://example.com/", {
			limits: { maxNodes: 8 },
			initializeDocument(owner) {
				tree = owner;
			},
		}),
	).toThrow("node limit");
	expect(() => tree?.get(tree.root)).toThrow("closed");
});

it("charges reconstructed attribute payloads to the native retained-text budget", () => {
	let tree: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument(
			'<p><b title="12345678901234567890">x</p>y',
			"https://example.com/",
			{
				limits: { maxTextCodeUnits: 60 },
				initializeDocument(owner) {
					tree = owner;
				},
			},
		),
	).toThrow("text limit");
	expect(() => tree?.get(tree.root)).toThrow("closed");
});

it("uses foster placement for adoption with a table common ancestor", () => {
	expect(parse("<table><b><p>x</b>y</table>").html).toBe(
		"<b></b><p><b>x</b>y</p><table></table>",
	);
});

it("keeps fostered adoption inside a template's contents owner", () => {
	expect(parse("<template><table><b><p>x</b>y</table></template>").html).toBe(
		"<template><b></b><p><b>x</b>y</p><table></table></template>",
	);
});

it("does not append later text through a stale text-coalescing reference after repair", () => {
	expect(parse("<b><p>x</b>y</p>z").html).toBe("<b></b><p><b>x</b>y</p>z");
});

it("snapshots the work budget so later native option mutation cannot increase it", () => {
	const { formatter, add, options } = state({ maxWork: 5, maxText: 1000 });
	add("b");
	options.maxWork = 100000;
	expect(() => {
		for (let count = 0; count < 10; count++) formatter.find("i");
	}).toThrow("formatting work limit");
});
