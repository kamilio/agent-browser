import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { htmlParseInfo } from "./html-info.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import {
	insertAdjacentHtml,
	setInnerHtml,
	setOuterHtml,
} from "./html-content.js";
import { documentImages } from "./document-images.js";
import { documentBaseUrl } from "./document-url.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function parse(source: string) {
	const tree = parseHtmlDocument(
		`<!doctype html>${source}`,
		"https://example.com/",
	);
	trees.push(tree);
	return tree;
}
function find(tree: DocumentTree, selector: string, root = tree.root) {
	const queries = new DocumentQueries(tree);
	try {
		const id = queries.querySelector(selector, root);
		if (id === null) throw new Error(`Missing ${selector}`);
		return id;
	} finally {
		queries.close();
	}
}

it("parses template descendants into their actual inert owner", () => {
	const tree = parse("<template><p>inert</p></template><p>visible</p>");
	const template = find(tree, "head > template");
	const content = tree.templateContent(template);
	expect(tree.get(template).children).toEqual([]);
	expect(serializeHtml(content.tree, content.id)).toBe("<p>inert</p>");
	expect(tree.textContent(tree.root)).toBe("visible");
	expect(content.tree.isTemplateContentsDocument).toBe(true);
});

it("uses template fragment modes rather than an ordinary body context", () => {
	const parsed = parseHtmlFragment(
		"<tr><td>one<td>two",
		"https://example.com/",
		{ tagName: "template" },
	);
	trees.push(parsed.tree);
	expect(serializeHtml(parsed.tree, parsed.fragment)).toBe(
		"<tr><td>one</td><td>two</td></tr>",
	);
});

it("replaces template contents while leaving ordinary template children alone", () => {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	const template = tree.createElement("template");
	tree.append(template, tree.createText("ordinary"));
	setInnerHtml(tree, template, "<td>cell</td>");
	expect(tree.textContent(template)).toBe("ordinary");
	const content = tree.templateContent(template);
	expect(serializeHtml(content.tree, content.id)).toBe("<td>cell</td>");
});

it.each([
	["<caption>cap</caption>", "<caption>cap</caption>"],
	["<colgroup><col></colgroup>", "<colgroup><col></colgroup>"],
	["<col><col>", "<col><col>"],
	[
		"<thead><tr><th>a</th></tr></thead><tbody><tr><td>b",
		"<thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody>",
	],
	["<tr><td>a</td></tr><tr><td>b", "<tr><td>a</td></tr><tr><td>b</td></tr>"],
	["<td>a<td>b<th>c", "<td>a</td><td>b</td><th>c</th>"],
	["<div>body</div><tr><td>ignored", "<div>body</div>ignored"],
	["<col>ignored<p>also ignored</p>\t<col>", "<col> \t<col>"],
	[
		"text<!--comment--><tr><td>cell",
		"text<!--comment--><tr><td>cell</td></tr>",
	],
] as const)(
	"selects and retains the correct template mode for %s",
	(source, expected) => {
		const result = parseHtmlFragment(source, "https://example.com/", {
			tagName: "template",
		});
		trees.push(result.tree);
		expect(serializeHtml(result.tree, result.fragment)).toBe(expected);
	},
);

it("restores outer template modes after nested template closure", () => {
	const tree = parse(
		"<template><template><td>inner</template><tr><td>outer</template>",
	);
	const content = tree.templateContent(find(tree, "template"));
	expect(serializeHtml(content.tree, content.id)).toBe(
		"<template><td>inner</td></template><tr><td>outer</td></tr>",
	);
});

it("keeps templates in table and select contexts instead of fostering or ignoring them", () => {
	const tree = parse(
		"<body><table><template><tr><td>row</template><tr><td>live</table><select><template><p>inside</template><option>choice</select>",
	);
	const tableTemplate = find(tree, "table > template");
	const tableContent = tree.templateContent(tableTemplate);
	expect(serializeHtml(tableContent.tree, tableContent.id)).toBe(
		"<tr><td>row</td></tr>",
	);
	expect(tree.textContent(find(tree, "table"))).toBe("live");
	const selectContent = tree.templateContent(find(tree, "select > template"));
	expect(serializeHtml(selectContent.tree, selectContent.id)).toBe(
		"<p>inside</p>",
	);
	expect(tree.textContent(find(tree, "select"))).toBe("choice");
});

it("fosters text inside a contents table without escaping to the live document", () => {
	const tree = parse(
		"<body><table><template><table>before<tr><td>cell</td></tr>after</table></template></table>",
	);
	const content = tree.templateContent(find(tree, "template"));
	expect(serializeHtml(content.tree, content.id)).toBe(
		"beforeafter<table><tbody><tr><td>cell</td></tr></tbody></table>",
	);
	expect(tree.textContent(tree.root)).toBe("");
});

it("fosters virtual table-mode content into the associated fragment", () => {
	const tree = parse("<template><tr>before<td>cell</td>after</tr></template>");
	const content = tree.templateContent(find(tree, "template"));
	expect(serializeHtml(content.tree, content.id)).toBe(
		"<tr><td>cell</td></tr>beforeafter",
	);
});

it("does not pop outer paragraphs, list items or formatting across a template boundary", () => {
	const tree = parse(
		"<body><p><b>before<template></b></p><li>inside<li>next</template>after</b></p>",
	);
	expect(serializeHtml(tree, find(tree, "body"))).toBe(
		"<p><b>before<template><li>inside</li><li>next</li></template>after</b></p>",
	);
});

it("does not merge document attributes or close the real head/body from contents", () => {
	const tree = parse(
		"<html lang=en><head><template><html lang=bad><head><body id=bad><p>inside</body></html></template><title>real</title></head><body><p>outside",
	);
	expect(tree.get(find(tree, "html")).attributes.lang).toBe("en");
	expect(tree.get(find(tree, "body")).attributes.id).toBeUndefined();
	expect(tree.textContent(find(tree, "head > title"))).toBe("real");
	expect(tree.textContent(find(tree, "body"))).toBe("outside");
});

it("keeps a live form pointer separate from forms in templates", () => {
	const tree = parse(
		"<body><form id=outer><template><form id=inner><input></form><form id=second><input></form></template><input id=live></form>",
	);
	const content = tree.templateContent(find(tree, "template"));
	expect(find(content.tree, "#inner", content.id)).toBeTruthy();
	expect(find(content.tree, "#second", content.id)).toBeTruthy();
	expect(tree.get(find(tree, "#live")).parent).toBe(find(tree, "#outer"));
	expect(htmlParseInfo(tree)?.issues["nested-form-ignored"]).toBeUndefined();
});

it("ignores a supplied form ancestor for a template fragment context", () => {
	const result = parseHtmlFragment(
		"<form><input></form>",
		"https://example.com/",
		{ tagName: "template", hasFormAncestor: true },
	);
	trees.push(result.tree);
	expect(serializeHtml(result.tree, result.fragment)).toBe(
		"<form><input></form>",
	);
});

it("recovers unclosed nested templates at EOF without moving their nodes", () => {
	const tree = parse("<template><template><p>nested");
	const content = tree.templateContent(find(tree, "template"));
	expect(serializeHtml(content.tree, content.id)).toBe(
		"<template><p>nested</p></template>",
	);
	expect(htmlParseInfo(tree)?.issues["unclosed-template"]).toBe(2);
});

it("ignores stray closing templates and cannot pop a fragment's virtual context", () => {
	const result = parseHtmlFragment(
		"</template><td>one</td></template><td>two",
		"https://example.com/",
		{ tagName: "template" },
	);
	trees.push(result.tree);
	expect(serializeHtml(result.tree, result.fragment)).toBe(
		"<td>one</td><td>two</td>",
	);
	expect(htmlParseInfo(result.tree)?.issues["unmatched-template-end"]).toBe(2);
});

it("keeps raw text and RCDATA boundaries inside templates", () => {
	const tree = parse(
		"<template><script>const text = '</template>';</script><textarea>\n&lt;/template&gt;</textarea><style>x{content:'</template>'}</style></template><p>after",
	);
	const content = tree.templateContent(find(tree, "template"));
	expect(
		content.tree.textContent(find(content.tree, "textarea", content.id)),
	).toBe("</template>");
	expect(tree.textContent(tree.root)).toBe("after");
});

it("does not change document mode or doctype when contents contain a declaration", () => {
	const tree = parse("<template><!doctype bad><p>inside</template>");
	expect(htmlParseInfo(tree)?.mode).toBe("no-quirks");
	expect(tree.get(tree.get(tree.root).children[0]).doctype?.name).toBe("html");
	expect(htmlParseInfo(tree)?.issues["misplaced-doctype"]).toBe(1);
});

it("records unsupported template extensions rather than activating them", () => {
	const tree = parse(
		'<template shadowrootmode="open" for="target"><p>inert</template>',
	);
	expect(
		htmlParseInfo(tree)?.issues["template-extensions-not-implemented"],
	).toBe(1);
	expect(
		tree.templateContent(find(tree, "template")).tree
			.isTemplateContentsDocument,
	).toBe(true);
});

it("skips script and policy hooks inside template owners", async () => {
	const scripts: string[] = [];
	const policies: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		'<!doctype html><template><script src="/never.js">inert</script><meta http-equiv="content-security-policy" content="blocked"><template><script>nested</script></template></template><script>active</script><meta http-equiv="content-security-policy" content="live">',
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
	expect(policies).toEqual(["live"]);
	expect(htmlParseInfo(tree)?.issues["script-not-executed"]).toBe(2);
});

it("parses document.write templates without preparing or executing their scripts", async () => {
	const scripts: string[] = [];
	const prepared: number[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<script>writer</script><p>after",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner, id, context) {
				const source = owner.textContent(id);
				scripts.push(source);
				if (source === "writer")
					context.write(
						'<template><script src="/inert.js">inside</script><tr><td>cell</template>',
					);
			},
			prepareWrittenScript(_owner, id) {
				prepared.push(id);
				return "blocking";
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(scripts).toEqual(["writer"]);
	expect(prepared).toEqual([]);
	const content = tree.templateContent(find(tree, "template"));
	expect(serializeHtml(content.tree, content.id)).toBe(
		'<script src="/inert.js">inside</script><tr><td>cell</td></tr>',
	);
});

it.each([
	["<title>title</title><tr><td>plain", "<title>title</title>plain"],
	[
		"<noframes>raw</noframes><tr><td>cell",
		"<noframes>raw</noframes><tr><td>cell</td></tr>",
	],
	[
		"<style>style</style><tr><td>cell",
		"<style>style</style><tr><td>cell</td></tr>",
	],
] as const)(
	"distinguishes in-template metadata handling for %s",
	(source, expected) => {
		const parsed = parseHtmlFragment(source, "https://example.com/", {
			tagName: "template",
		});
		trees.push(parsed.tree);
		expect(serializeHtml(parsed.tree, parsed.fragment)).toBe(expected);
	},
);

it("preserves template state across multiple parser-write boundaries", async () => {
	const scripts: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<script>writer</script><script>after</script>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner, id, context) {
				const source = owner.textContent(id);
				scripts.push(source);
				if (source === "writer") {
					context.write("<template><script>iner");
					context.write("t</script><tr><td>cell</template>");
				}
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(scripts).toEqual(["writer", "after"]);
	const content = tree.templateContent(find(tree, "template"));
	expect(serializeHtml(content.tree, content.id)).toBe(
		"<script>inert</script><tr><td>cell</td></tr>",
	);
});

it("does not send template image or base elements to the main resource owner", async () => {
	const requests: string[] = [];
	let images: ReturnType<typeof documentImages> | undefined;
	let initialized = 0;
	const tree = await parseHtmlDocumentAsync(
		'<!doctype html><template><base href="https://blocked.example/"><img src="/never.png"><link rel="stylesheet" href="/never.css"></template><p>visible</p>',
		"https://example.com/",
		{
			initializeDocument(owner) {
				initialized++;
				images = documentImages(owner, {
					fetch: async (url) => {
						requests.push(url);
						throw new Error("Unexpected fake image request");
					},
				});
			},
		},
		{
			start() {},
			async script() {
				throw new Error("Unexpected script");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	await images?.settle();
	expect(initialized).toBe(1);
	expect(requests).toEqual([]);
	expect(documentBaseUrl(tree)).toBe("https://example.com/");
	const content = tree.templateContent(find(tree, "template"));
	expect(find(content.tree, "img", content.id)).toBeTruthy();
	expect(find(content.tree, "link", content.id)).toBeTruthy();
});

it("keeps contents mutations off the main document's mutation stream", () => {
	const inserted: string[] = [];
	const tree = parseHtmlDocument(
		"<!doctype html><template><p><img src=/never.png></p></template>",
		"https://example.com/",
		{
			initializeDocument(owner) {
				owner.onMutation((record) => {
					for (const id of record.addedNodes ?? [])
						inserted.push(owner.get(id).tagName);
				});
			},
		},
	);
	trees.push(tree);
	expect(inserted).toContain("template");
	expect(inserted).not.toContain("p");
	expect(inserted).not.toContain("img");
});

it("keeps old contents, identities and quotas unchanged on nested parse failure", () => {
	const tree = parse("<template>old</template>");
	const template = find(tree, "template");
	const content = tree.templateContent(template);
	const children = content.tree.get(content.id).children;
	const primaryUsage = tree.resourceUsage();
	const contentUsage = content.tree.resourceUsage();
	const revision = content.tree.revision;
	expect(() =>
		setInnerHtml(tree, template, "<template>staged</template><svg>unsupported"),
	).toThrow("not implemented");
	expect(content.tree.get(content.id).children).toEqual(children);
	expect(content.tree.textContent(content.id)).toBe("old");
	expect(tree.resourceUsage()).toEqual(primaryUsage);
	expect(content.tree.resourceUsage()).toEqual(contentUsage);
	expect(content.tree.revision).toBe(revision);
});

it("preflights shared node capacity before replacing existing contents", () => {
	const tree = new DocumentTree("https://example.com/", { maxNodes: 7 });
	trees.push(tree);
	const template = tree.createElement("template");
	const content = tree.templateContent(template);
	content.tree.append(content.id, content.tree.createText("old"));
	const before = content.tree.resourceUsage();
	expect(() => setInnerHtml(tree, template, "<b>new</b>")).toThrow(
		"node limit",
	);
	expect(content.tree.textContent(content.id)).toBe("old");
	expect(content.tree.resourceUsage()).toEqual(before);
});

it("preflights host-inclusive depth before replacing existing contents", () => {
	const tree = new DocumentTree("https://example.com/", { maxDepth: 3 });
	trees.push(tree);
	const template = tree.createElement("template");
	tree.append(tree.root, template);
	const content = tree.templateContent(template);
	content.tree.append(content.id, content.tree.createText("old"));
	const before = content.tree.resourceUsage();
	expect(() => setInnerHtml(tree, template, "<b><i>deep</i></b>")).toThrow(
		"depth limit",
	);
	expect(content.tree.textContent(content.id)).toBe("old");
	expect(content.tree.resourceUsage()).toEqual(before);
});

it("closes both candidate owners after a parse error inside a template", () => {
	let primary: DocumentTree | undefined;
	let contents: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument("<template><p>staged</p><svg>", "https://example.com/", {
			initializeDocument(owner) {
				primary = owner;
				owner.onMutation((record) => {
					for (const id of record.addedNodes ?? [])
						if (owner.get(id).tagName === "template")
							contents = owner.templateContent(id).tree;
				});
			},
		}),
	).toThrow("not implemented");
	expect(() => primary?.get(primary.root)).toThrow("closed");
	expect(() => contents?.get(contents.root)).toThrow("closed");
});

it("closes template owners after cancellation from a later live parser hook", async () => {
	const controller = new AbortController();
	let owner: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"<template><p>inert</template><script>cancel</script>",
			"https://example.com/",
			{ signal: controller.signal },
			{
				start() {},
				async script(tree) {
					owner = tree.templateContent(find(tree, "template")).tree;
					controller.abort();
				},
				async finish() {},
			},
		),
	).rejects.toThrow("aborted");
	expect(() => owner?.get(owner.root)).toThrow("closed");
});

it("retains detached old content identities across successful replacement and clearing", () => {
	const tree = parse("<template>old</template>");
	const template = find(tree, "template");
	const content = tree.templateContent(template);
	const old = content.tree.get(content.id).children[0];
	setInnerHtml(tree, template, "<template><td>nested</template>");
	expect(content.tree.get(old).parent).toBeNull();
	expect(content.tree.get(old).data).toBe("old");
	expect(serializeHtml(content.tree, content.id)).toBe(
		"<template><td>nested</td></template>",
	);
	setInnerHtml(tree, template, "");
	expect(content.tree.get(content.id).children).toEqual([]);
	expect(content.tree.get(old).data).toBe("old");
});

it("keeps insertAdjacentHTML on a template's ordinary children rather than its contents", () => {
	const tree = parse("<template>content</template>");
	const template = find(tree, "template");
	insertAdjacentHtml(tree, template, "beforeend", "<tr><td>ordinary</td></tr>");
	expect(tree.textContent(template)).toBe("ordinary");
	const content = tree.templateContent(template);
	expect(content.tree.textContent(content.id)).toBe("content");
	expect(tree.get(tree.get(template).children[0]).tagName).toBe("tr");
});

it("uses template contexts for outerHTML replacement of ordinary template children", () => {
	const tree = new DocumentTree("https://example.com/");
	trees.push(tree);
	const template = tree.createElement("template");
	const ordinary = tree.createElement("div");
	tree.append(template, ordinary);
	setOuterHtml(tree, ordinary, "<td>replacement</td>");
	expect(tree.get(tree.get(template).children[0]).tagName).toBe("td");
	expect(tree.get(ordinary).parent).toBeNull();
	expect(
		tree.templateContent(template).tree.get(tree.templateContent(template).id)
			.children,
	).toEqual([]);
});

it("records inherited malformed-formatting limitations inside a template", () => {
	const tree = parse("<template><b><i>text</b>tail</i></template>");
	expect(
		htmlParseInfo(tree)?.issues["formatting-reconstruction-not-implemented"],
	).toBe(1);
});

it.each([
	[
		"<tr><td>a</td></tr><tbody><tr><td>b",
		"<tr><td>a</td></tr><tr><td>b</td></tr>",
	],
	["<td>a<tr><td>b", "<td>a</td><td>b</td>"],
] as const)(
	"does not invent a missing template table container for %s",
	(source, expected) => {
		const parsed = parseHtmlFragment(source, "https://example.com/", {
			tagName: "template",
		});
		trees.push(parsed.tree);
		expect(serializeHtml(parsed.tree, parsed.fragment)).toBe(expected);
		expect(
			htmlParseInfo(parsed.tree)?.issues["ignored-template-table-container"],
		).toBe(1);
	},
);

it.each([{ maxNodes: 11 }, { maxDepth: 4 }])(
	"bounds complete parsed template graphs: %j",
	(limits) => {
		let owner: DocumentTree | undefined;
		expect(() =>
			parseHtmlDocument(
				"<template><template><p><b>deep</b></p></template></template>",
				"https://example.com/",
				{
					limits,
					initializeDocument(tree) {
						owner = tree;
					},
				},
			),
		).toThrow("limit");
		expect(() => owner?.get(owner.root)).toThrow("closed");
	},
);
