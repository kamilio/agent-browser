import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { htmlParseInfo } from "./html-info.js";
import { HtmlScope } from "./html-scope.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function parse(source: string, doctype = "<!doctype html>") {
	const tree = parseHtmlDocument(doctype + source, "https://example.com/");
	trees.push(tree);
	const body = [...tree.walk()].find(({ node }) => node.tagName === "body");
	if (!body) throw new Error("Missing body");
	return { tree, body: body.node.id, html: serializeHtml(tree, body.node.id) };
}

it.each([
	["<div>a</body>b", "<div>ab</div>"],
	["<div>a</html>b", "<div>ab</div>"],
	["<object>a</body>b", "<object>ab</object>"],
	["<object>a</html>b", "<object>ab</object>"],
	["<div>a</body><span>b", "<div>a<span>b</span></div>"],
	["<div>a</body><body id=again>b", "<div>ab</div>"],
	["<div>a</html><body id=again>b", "<div>ab</div>"],
])("retains the open body stack for %s", (source, expected) => {
	expect(parse(source).html).toBe(expected);
});

it.each([
	["</body> \n<!--after-body-->", "html"],
	["</body></html><!--after-html-->", "document"],
	["</html> \n<!--after-html-->", "document"],
])("places a trailing comment for %s", (source, parent) => {
	const { tree } = parse(source);
	const comment = [...tree.walk()].find(({ node }) => node.kind === "comment");
	if (!comment || comment.node.parent === null)
		throw new Error("Missing comment");
	const actual = tree.get(comment.node.parent);
	expect(actual.kind === "element" ? actual.tagName : actual.kind).toBe(parent);
});

it("retains a paragraph around a table in quirks mode", () => {
	expect(parse("<p>one<table><tr><td>two</table>tail", "").html).toBe(
		"<p>one<table><tbody><tr><td>two</td></tr></tbody></table>tail</p>",
	);
});

it.each(["</body>", "</html>", "</body></html>"])(
	"keeps adjacent body text coalesced across external comments after %s",
	(ending) => {
		const { tree, body } = parse(`a${ending} <!--outside--> b`);
		expect(tree.get(body).children).toHaveLength(1);
		expect(tree.textContent(body)).toBe("a  b");
	},
);

it.each([
	["<div>a</body> \n<!--outside-->b", "<div>a \nb</div>"],
	["<div>a</html> \n<!--outside-->b", "<div>a \nb</div>"],
	["<div><b>a</body>b</b>c", "<div><b>ab</b>c</div>"],
	["<div>a</body></div>b", "<div>a</div>b"],
	["<div>a</body></html><span>b", "<div>a<span>b</span></div>"],
	["<div>a</body></head>b", "<div>ab</div>"],
	["<object>a</body><!--inside-->b", "<object>a<!--inside-->b</object>"],
	["<marquee>a</html>b", "<marquee>ab</marquee>"],
	["<applet>a</body>b", "<applet>ab</applet>"],
	["<select><option>a</body>b", "<select><option>ab</option></select>"],
	[
		"<table><tr><td>a</body>b",
		"<table><tbody><tr><td>ab</td></tr></tbody></table>",
	],
	[
		"<body><template><p>a</body>b</html>c</template>d",
		"<template><p>abc</p></template>d",
	],
	["</body>tail", "tail"],
	["<head><title>title</title></html>tail", "tail"],
])("recovers document-ending integration %s", (source, expected) => {
	expect(parse(source).html).toBe(expected);
});

it.each([
	["</body><!--first--></html><!--second-->", ["html", "document"]],
	["</html><!--first--></body><!--second-->", ["document", "html"]],
	[
		"</body>\n<html lang=en><!--first--></html>\t<html dir=rtl><!--second-->",
		["html", "document"],
	],
	["</html>tail<!--inside-->", ["body"]],
])("tracks trailing comment destinations for %s", (source, parents) => {
	const { tree } = parse(source);
	const comments = [...tree.walk()].filter(
		({ node }) => node.kind === "comment",
	);
	expect(
		comments
			.map(({ node }) => {
				if (node.parent === null) throw new Error("Missing parent");
				const parent = tree.get(node.parent);
				return parent.kind === "element" ? parent.tagName : parent.kind;
			})
			.sort(),
	).toEqual([...parents].sort());
});

it("merges repeated scaffold attributes without replacing open ancestors", () => {
	const { tree, body, html } = parse(
		"<html lang=en><body id=original><div>a</body><html lang=bad dir=rtl><body id=bad class=added>b",
	);
	expect(html).toBe("<div>ab</div>");
	expect(tree.get(body).attributes).toEqual({ id: "original", class: "added" });
	const root = [...tree.walk()].find(({ node }) => node.tagName === "html");
	expect(root?.node.attributes).toEqual({ lang: "en", dir: "rtl" });
});

it.each([
	"<!doctype html>",
	'<!doctype html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">',
])("closes a paragraph before a table outside quirks mode: %s", (doctype) => {
	expect(parse("<p>one<table><tr><td>two</table>tail", doctype).html).toBe(
		"<p>one</p><table><tbody><tr><td>two</td></tr></tbody></table>tail",
	);
});

it.each(["body", "div", "p", "html"])(
	"does not end a %s fragment's document",
	(tagName) => {
		const result = parseHtmlFragment(
			"<div>a</body></html> <!--here-->b",
			"https://example.com/",
			{ tagName },
		);
		trees.push(result.tree);
		const inner = "<div>a <!--here-->b</div>";
		expect(serializeHtml(result.tree, result.fragment)).toBe(
			tagName === "html"
				? `<head></head><body>${inner.replace("<!--here-->", "")}</body><!--here-->`
				: inner,
		);
	},
);

function state(tags: string[], maxWork = 100) {
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
	"object",
	"applet",
	"marquee",
	"table",
	"td",
	"th",
	"caption",
	"select",
	"template",
])("rejects a body end across %s without popping the stack", (tag) => {
	const { scope, stack, options } = state(["body", tag, "span"]);
	expect(scope.canEndBody()).toBe(false);
	expect(stack).toHaveLength(3);
	expect(options.reset).not.toHaveBeenCalled();
});

it("allows the scaffold body root without making ordinary root closure legal", () => {
	const { scope, stack } = state(["body", "p"]);
	expect(scope.canEndBody()).toBe(true);
	expect(scope.find("body")).toBe(-1);
	expect(scope.close(0)).toBe(false);
	expect(stack).toHaveLength(2);
});

it("reports unclosed ordinary elements but not optional paragraph ends", () => {
	const ordinary = state(["body", "div", "p"]);
	expect(ordinary.scope.canEndBody()).toBe(true);
	expect(ordinary.options.issue).toHaveBeenCalledWith(
		"unclosed-elements-at-body-end",
	);
	const optional = state(["body", "p"]);
	expect(optional.scope.canEndBody()).toBe(true);
	expect(optional.options.issue).not.toHaveBeenCalled();
});

it("charges document-end scans to the shared scope budget", () => {
	const { scope } = state(["body", "p"], 2);
	expect(scope.find("p")).toBe(1);
	expect(() => scope.canEndBody()).toThrow("HTML scope work limit");
});

it("checks cancellation before inspecting the scaffold root", () => {
	const { scope, options } = state(["body"]);
	options.check.mockImplementation(() => {
		throw new Error("cancelled");
	});
	expect(() => scope.canEndBody()).toThrow("cancelled");
});

it("keeps script hooks and writes at the retained open insertion point", async () => {
	const events: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<div>a</body><script>write</script>b",
		"https://example.com/",
		{},
		{
			start() {
				events.push("start");
			},
			async script(owner, id, context) {
				const parent = owner.get(id).parent;
				if (parent === null) throw new Error("Missing script parent");
				events.push(owner.get(parent).tagName);
				context.write("<span>written</span>");
			},
			async finish() {},
			async parsed() {
				events.push("parsed");
			},
		},
	);
	trees.push(tree);
	const div = [...tree.walk()].find(({ node }) => node.tagName === "div");
	if (!div) throw new Error("Missing div");
	expect(serializeHtml(tree, div.node.id)).toBe(
		"a<script>write</script><span>written</span>b",
	);
	expect(events).toEqual(["start", "div", "parsed"]);
	expect(htmlParseInfo(tree)?.issues["content-after-body"]).toBe(1);
});

it("retains closing modes and comment destinations across separate writes", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<script>write</script>tail",
		"https://example.com/",
		{},
		{
			start() {},
			async script(_owner, _id, context) {
				context.write("<div>a</body>");
				context.write(" <!--outer--></html>");
				context.write("<!--document--><span>b</span>");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const div = [...tree.walk()].find(({ node }) => node.tagName === "div");
	if (!div) throw new Error("Missing div");
	expect(serializeHtml(tree, div.node.id)).toBe("a <span>b</span>tail");
	const comments = [...tree.walk()].filter(
		({ node }) => node.kind === "comment",
	);
	expect(
		comments.map(({ node }) => {
			if (node.parent === null) throw new Error("Missing comment parent");
			const parent = tree.get(node.parent);
			return [
				node.data,
				parent.kind === "element" ? parent.tagName : parent.kind,
			];
		}),
	).toEqual([
		["outer", "html"],
		["document", "document"],
	]);
});

it("does not replace a retained insertion point detached by a native hook", async () => {
	let detached: number | undefined;
	const tree = await parseHtmlDocumentAsync(
		"<div><script>detach</script></body><body class=again>tail",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner, id) {
				const parent = owner.get(id).parent;
				if (parent === null) throw new Error("Missing parent");
				detached = parent;
				owner.remove(parent);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	if (detached === undefined)
		throw new Error("Missing detached insertion point");
	expect(serializeHtml(tree, detached)).toBe("<script>detach</script>tail");
	const body = [...tree.walk()].find(({ node }) => node.tagName === "body");
	expect(body?.node.children).toEqual([]);
	expect(body?.node.attributes.class).toBe("again");
});

it("still observes cancellation after a write closes the document", async () => {
	const controller = new AbortController();
	let candidate: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"<script>write</script>",
			"https://example.com/",
			{ signal: controller.signal },
			{
				start(tree) {
					candidate = tree;
				},
				async script(_owner, _id, context) {
					context.write("</html><!--document-->");
					controller.abort();
				},
				async finish() {},
			},
		),
	).rejects.toThrow("aborted");
	expect(candidate).toBeDefined();
	expect(() => candidate?.get(candidate.root)).toThrow("closed");
});

it("charges trailing comments to native node limits and closes a failed candidate", () => {
	let candidate: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument(
			"<!doctype html></html><!--one--><!--two-->",
			"https://example.com/",
			{
				limits: { maxNodes: 6 },
				initializeDocument(tree) {
					candidate = tree;
				},
			},
		),
	).toThrow("node limit");
	expect(() => candidate?.get(candidate.root)).toThrow("closed");
});

it("reports a rejected scoped close without entering an after-body mode", () => {
	const { tree, html } = parse("<object>a</body><!--inside-->b");
	expect(html).toBe("<object>a<!--inside-->b</object>");
	expect(htmlParseInfo(tree)?.issues["body-not-in-scope"]).toBe(1);
	expect(htmlParseInfo(tree)?.issues["content-after-body"]).toBeUndefined();
});

it.each([
	["move", "b"],
	["element", "a<br>b"],
	["text", "anativeb"],
])(
	"uses actual body text adjacency after an external-comment hook: %s",
	(action, expected) => {
		let changed = false;
		let moved: number | undefined;
		const tree = parseHtmlDocument(
			"<!doctype html>a</body><!--outside-->b",
			"https://example.com/",
			{
				initializeDocument(owner) {
					owner.onMutation((record) => {
						if (
							changed ||
							!record.addedNodes.some((id) => owner.get(id).kind === "comment")
						)
							return;
						changed = true;
						const body = [...owner.walk()].find(
							({ node }) => node.tagName === "body",
						);
						if (!body) throw new Error("Missing body");
						if (action === "move") {
							moved = body.node.children[0];
							owner.append(owner.createElement("div"), moved);
						} else
							owner.append(
								body.node.id,
								action === "element"
									? owner.createElement("br")
									: owner.createText("native"),
							);
					});
				},
			},
		);
		trees.push(tree);
		const body = [...tree.walk()].find(({ node }) => node.tagName === "body");
		if (!body) throw new Error("Missing body");
		expect(changed).toBe(true);
		expect(serializeHtml(tree, body.node.id)).toBe(expected);
		if (moved !== undefined) expect(tree.get(moved).data).toBe("a");
		if (action === "text")
			expect(tree.get(body.node.children[1]).data).toBe("nativeb");
		expect(tree.mutationMetrics().collectorFailures).toBe(0);
	},
);
