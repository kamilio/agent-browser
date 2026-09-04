import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { HtmlScope } from "./html-scope.js";
import { htmlParseInfo } from "./html-info.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function parse(source: string, tagName = "body") {
	const parsed = parseHtmlFragment(source, "https://example.com/", { tagName });
	trees.push(parsed.tree);
	return serializeHtml(parsed.tree, parsed.fragment);
}

it.each([
	["</p>tail", "<p></p>tail"],
	[
		"<p>outer<button><div>inner",
		"<p>outer<button><div>inner</div></button></p>",
	],
	["<p>outer<object></p>inner", "<p>outer<object><p></p>inner</object></p>"],
	["<span><div>a</span>b", "<span><div>ab</div></span>"],
	["<div><object>a</div>b", "<div><object>ab</object></div>"],
	[
		"<ul><li>outer<ul></li><li>inner",
		"<ul><li>outer<ul><li>inner</li></ul></li></ul>",
	],
	[
		"<li>outer<section><li>inner",
		"<li>outer<section><li>inner</li></section></li>",
	],
	[
		"<dl><dt>outer<blockquote><dd>inner",
		"<dl><dt>outer<blockquote><dd>inner</dd></blockquote></dt></dl>",
	],
	["<h1>heading</h2>tail", "<h1>heading</h1>tail"],
	[
		"<button>outer<object><button>inner",
		"<button>outer<object><button>inner</button></object></button>",
	],
	["<form><p>text</form>tail", "<form><p>text</p></form>tail"],
	[
		"<ruby><rb>base<rt>annotation<rp>)",
		"<ruby><rb>base</rb><rt>annotation</rt><rp>)</rp></ruby>",
	],
])("recovers scoped body markup %s", (source, expected) => {
	expect(parse(source)).toBe(expected);
});

it.each([
	["<p>a<div>b</div>c", "<p>a</p><div>b</div>c"],
	["<li>a<div><p>b<li>c", "<li>a<div><p>b</p></div></li><li>c</li>"],
	["<dl><dt>a<dd>b<dt>c", "<dl><dt>a</dt><dd>b</dd><dt>c</dt></dl>"],
	["<h1>a<h2>b", "<h1>a</h1><h2>b</h2>"],
	["<h1>a<object></h2>b", "<h1>a<object>b</object></h1>"],
	["<button>a<p>b<button>c", "<button>a<p>b</p></button><button>c</button>"],
	["<span>a<em>b</span>c", "<span>a<em>b</em></span><em>c</em>"],
	["<object><b>a</object>b", "<object><b>a</b></object>b"],
	["<form><div>a</form>b", "<form><div>ab</div></form>"],
	[
		"<form><object></form><form>inner",
		"<form><object><form>inner</form></object></form>",
	],
	[
		"<ruby><rtc><rt>a<rt>b<rb>c",
		"<ruby><rtc><rt>a</rt><rt>b</rt></rtc><rb>c</rb></ruby>",
	],
	[
		"<ruby><object><rt>a<rt>b",
		"<ruby><object><rt>a<rt>b</rt></rt></object></ruby>",
	],
	["<ruby><b><rb>a<rt>b", "<ruby><b><rb>a</rb><rt>b</rt></b></ruby>"],
	["<p>a<summary>b", "<p>a</p><summary>b</summary>"],
	["<p>a<listing>\nb", "<p>a</p><listing>b</listing>"],
	["<p>a<xmp><b>raw</xmp>b", "<p>a</p><xmp><b>raw</xmp>b"],
	["<p>a<plaintext><b>raw", "<p>a</p><plaintext><b>raw</plaintext>"],
	[
		"<select><optgroup><option>a</select>b",
		"<select><optgroup><option>a</option></optgroup></select>b",
	],
	[
		"<p>outer<template><div></p>inner</template>tail",
		"<p>outer<template><div><p></p>inner</div></template>tail</p>",
	],
	[
		"<template><form><p>a</form>b</template>c",
		"<template><form><p>a</p></form>b</template>c",
	],
	[
		"<span><table><tr><td></span>a",
		"<span><table><tbody><tr><td>a</td></tr></tbody></table></span>",
	],
	[
		"<table><tr><td><p>a</p>b<td>c",
		"<table><tbody><tr><td><p>a</p>b</td><td>c</td></tr></tbody></table>",
	],
])("preserves body recovery integration %s", (source, expected) => {
	expect(parse(source)).toBe(expected);
});

it.each(["p", "li", "dd", "dt", "h1", "button", "object", "ruby"])(
	"does not pop the virtual %s fragment root",
	(tag) => {
		expect(parse(`</${tag}><span>tail`, tag)).toBe(
			`${tag === "p" ? "<p></p>" : ""}<span>tail</span>`,
		);
	},
);

function state(tags: string[], maxWork = 1000) {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	const stack = tags.map((tag) => ({ tree, tag, id: tree.createElement(tag) }));
	const options = {
		stack: () => stack,
		reset: vi.fn(),
		issue: vi.fn(),
		check: vi.fn(),
		maxWork,
	};
	return { stack, options, scope: new HtmlScope(options) };
}

it.each([
	"applet",
	"caption",
	"table",
	"td",
	"th",
	"marquee",
	"object",
	"select",
	"template",
])("stops normal scope at %s", (tag) => {
	const { scope } = state(["body", "p", tag, "span"]);
	expect(scope.find("p")).toBe(-1);
	expect(scope.find(tag)).toBe(2);
});

it("distinguishes normal, button and list-item scopes", () => {
	const { scope } = state(["body", "p", "li", "button", "ul", "span"]);
	expect(scope.find("p")).toBe(1);
	expect(scope.find("p", "button")).toBe(-1);
	expect(scope.find("li")).toBe(2);
	expect(scope.find("li", "list")).toBe(-1);
});

it("matches stack node identity rather than a same-id foreign owner", () => {
	const { scope, stack } = state(["body", "form"]);
	const foreign = new DocumentTree("https://other.example/");
	trees.push(foreign);
	expect(scope.find({ ...stack[1], tree: foreign })).toBe(-1);
	expect(scope.find(stack[1])).toBe(1);
});

it("generates only contiguous implied ends and retains an exception", () => {
	const { scope, stack } = state(["body", "div", "rtc", "rt", "p"]);
	scope.imply("rtc");
	expect(stack.map((node) => node.tag)).toEqual(["body", "div", "rtc"]);
	scope.imply();
	expect(stack.map((node) => node.tag)).toEqual(["body", "div"]);
});

it("does not mutate a stack for an unmatched ordinary end", () => {
	const { scope, stack } = state(["body", "span", "div", "p"]);
	expect(scope.ordinaryEnd("span")).toBe(false);
	expect(stack).toHaveLength(4);
});

it("shares the work budget across scope scans and implied ends", () => {
	const { scope } = state(["body", "div", "p"], 2);
	expect(scope.find("div")).toBe(1);
	expect(() => scope.imply()).toThrow("HTML scope work limit");
});

it.each(["list", "ordinary"])(
	"bounds repeated %s recovery scans",
	(operation) => {
		const { scope, stack } = state(["body", "span", "span", "span"], 2);
		expect(() =>
			operation === "list"
				? scope.startList("li")
				: scope.ordinaryEnd("missing"),
		).toThrow("HTML scope work limit");
		expect(stack).toHaveLength(4);
	},
);

it("snapshots the work budget and callback references", () => {
	const { scope, options } = state(["body", "div", "p"], 1);
	options.maxWork = 10000;
	options.check = vi.fn(() => {
		throw new Error("changed callback");
	});
	expect(() => scope.find("div")).toThrow("HTML scope work limit");
});

it("checks cancellation before inspecting stack entries", () => {
	const { scope, stack, options } = state(["body", "p"]);
	options.check.mockImplementation(() => {
		throw new Error("cancelled");
	});
	expect(() => scope.imply()).toThrow("cancelled");
	expect(stack).toHaveLength(2);
});

it.each([
	0,
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
])("rejects invalid scope budget %s", (maxWork) => {
	expect(() => state(["body"], maxWork)).toThrow(
		"Invalid HTML scope work limit",
	);
});

it("accounts for synthetic paragraphs and closes failed candidates", () => {
	let owner: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument("<body></p>", "https://example.com/", {
			limits: { maxNodes: 4 },
			initializeDocument(tree) {
				owner = tree;
			},
		}),
	).toThrow("node limit");
	expect(() => owner?.get(owner.root)).toThrow("closed");
});

it("keeps scope recovery across synchronous parser-write boundaries", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<div><script>write</script>tail</div>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(_owner, _id, context) {
				context.write("<h1>heading");
				context.write("</h2></p>");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const div = [...tree.walk()].find(({ node }) => node.tagName === "div");
	if (!div) throw new Error("Missing div");
	expect(serializeHtml(tree, div.node.id)).toBe(
		"<script>write</script><h1>heading</h1><p></p>tail",
	);
	expect(htmlParseInfo(tree)?.issues["misnested-body-end"]).toBe(1);
});

it("retains parser-stack scope when a native hook reparents its boundary", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<div><object><script>move</script></div>tail",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner) {
				const object = [...owner.walk()].find(
					({ node }) => node.tagName === "object",
				);
				const body = [...owner.walk()].find(
					({ node }) => node.tagName === "body",
				);
				if (!object || !body) throw new Error("Missing fixture nodes");
				owner.append(body.node.id, object.node.id);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const object = [...tree.walk()].find(({ node }) => node.tagName === "object");
	if (!object) throw new Error("Missing object");
	expect(serializeHtml(tree, object.node.id)).toBe("<script>move</script>tail");
});

it("closes main and template owners when scoped parser writes are cancelled", async () => {
	const controller = new AbortController();
	let owner: DocumentTree | undefined;
	let contents: DocumentTree | undefined;
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
					context.write("<template><div></p>");
					const template = [...tree.walk()].find(
						({ node }) => node.tagName === "template",
					);
					if (!template) throw new Error("Missing template");
					contents = tree.templateContent(template.node.id).tree;
					controller.abort();
				},
				async finish() {},
			},
		),
	).rejects.toThrow("aborted");
	expect(owner).toBeDefined();
	expect(contents).toBeDefined();
	expect(() => owner?.get(owner.root)).toThrow("closed");
	expect(() => contents?.get(contents.root)).toThrow("closed");
});
