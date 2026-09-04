import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
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
function parse(source: string) {
	const tree = parseHtmlDocument(
		`<!doctype html>${source}`,
		"https://example.com/",
	);
	trees.push(tree);
	const html = [...tree.walk()].find(({ node }) => node.tagName === "html");
	if (!html) throw new Error("Missing html");
	return { tree, html: serializeHtml(tree, html.node.id) };
}

it.each([
	[
		"<html><!--before-head--><head><title>T</title></head>",
		"<head><title>T</title></head><body></body>",
		"<!--before-head-->",
	],
	["<head> \ntext", "<head> \n</head><body>text</body>", ""],
	[
		"</head> \n<!--between--><meta name=x><body>b",
		'<head><meta name="x"></head> \n<!--between--><body>b</body>',
		"",
	],
	["</span><title>T</title>", "<head><title>T</title></head><body></body>", ""],
	[
		"<head></div><title>T</title>",
		"<head><title>T</title></head><body></body>",
		"",
	],
	[
		"<head><noscript><link><div>x",
		"<head><noscript><link></noscript></head><body><div>x</div></body>",
		"",
	],
	[
		"<head><noscript> \nx",
		"<head><noscript> \n</noscript></head><body>x</body>",
		"",
	],
	[
		"<head><noscript></head><meta name=x></noscript><title>T",
		'<head><noscript><meta name="x"></noscript><title>T</title></head><body></body>',
		"",
	],
	[
		"<head><noframes>raw</noframes><title>T",
		"<head><noframes>raw</noframes><title>T</title></head><body></body>",
		"",
	],
	["<head></head><title>T", "<head><title>T</title></head><body></body>", ""],
])("recovers head mode for %s", (source, expected, before) => {
	expect(parse(source).html).toBe(before + expected);
});

it("coalesces after-head whitespace around metadata inserted elsewhere", () => {
	const { tree } = parse(
		"<head></head> <meta name=x>\n<title>T</title> \t<body>b",
	);
	const html = [...tree.walk()].find(({ node }) => node.tagName === "html");
	if (!html) throw new Error("Missing html");
	const whitespace = html.node.children
		.map((id) => tree.get(id))
		.filter((node) => node.kind === "text");
	expect(whitespace.map((node) => node.data)).toEqual([" \n \t"]);
});

it.each([
	[" \n<html> \t<head>head", "<head></head><body>head</body>"],
	[
		"<head><title>T</title> \t<body>b",
		"<head><title>T</title> \t</head><body>b</body>",
	],
	["<head></head> \t<body>b", "<head></head> \t<body>b</body>"],
	[
		"<head></head><!--between--><body>b",
		"<head></head><!--between--><body>b</body>",
	],
	[
		"<head id=first><head id=bad><title>T",
		'<head id="first"><title>T</title></head><body></body>',
	],
	["</p><head id=ok></head>", '<head id="ok"></head><body></body>'],
	["<head></head></p><title>T", "<head><title>T</title></head><body></body>"],
	[
		"<head></head><head id=bad><meta name=x>",
		'<head><meta name="x"></head><body></body>',
	],
	[
		"<head><noscript><noscript><meta name=x></noscript><title>T",
		'<head><noscript><meta name="x"></noscript><title>T</title></head><body></body>',
	],
	[
		"<head><noscript></body><link></noscript><title>T",
		"<head><noscript><link></noscript><title>T</title></head><body></body>",
	],
	[
		"<head><noscript><style>raw</style><link></noscript><title>T",
		"<head><noscript><style>raw</style><link></noscript><title>T</title></head><body></body>",
	],
	[
		"<head><noscript></br>x",
		"<head><noscript></noscript></head><body><br>x</body>",
	],
	[
		"<head><noscript><base href=x><title>T",
		'<head><noscript></noscript><base href="x"><title>T</title></head><body></body>',
	],
	[
		"<head><noscript><script>raw</script><title>T",
		"<head><noscript></noscript><script>raw</script><title>T</title></head><body></body>",
	],
	[
		"<head><noscript>fallback</noscript><p>b",
		"<head><noscript></noscript></head><body>fallback<p>b</p></body>",
	],
	[
		"<head></head><template><p>inert</template><body>live",
		"<head><template><p>inert</p></template></head><body>live</body>",
	],
	[
		"<head><template><p>inert</template><title>T</title></head><body>live",
		"<head><template><p>inert</p></template><title>T</title></head><body>live</body>",
	],
	[
		"</head><style>raw</style><link><body>live",
		"<head><style>raw</style><link></head><body>live</body>",
	],
	[
		"<head></head><body><title>T</title>live",
		"<head></head><body><title>T</title>live</body>",
	],
])("preserves head-mode integration %s", (source, expected) => {
	expect(parse(source).html).toBe(expected);
});

it("keeps after-head scripts in the head without exposing the body prematurely", async () => {
	const parents: string[] = [];
	const bodies: boolean[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<head></head><script>late</script><body><script>body</script>",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner, id) {
				const parent = owner.get(id).parent;
				if (parent === null) throw new Error("Missing script parent");
				parents.push(owner.get(parent).tagName);
				bodies.push(
					[...owner.walk()].some(({ node }) => node.tagName === "body"),
				);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(parents).toEqual(["head", "body"]);
	expect(bodies).toEqual([false, true]);
});

it("reprocesses writes after a late head script without retaining a temporary head frame", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<head></head><script>write</script>tail",
		"https://example.com/",
		{},
		{
			start() {},
			async script(_owner, _id, context) {
				context.write("<meta name=written>");
				context.write("<p>body");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const html = [...tree.walk()].find(({ node }) => node.tagName === "html");
	if (!html) throw new Error("Missing html");
	expect(serializeHtml(tree, html.node.id)).toBe(
		'<head><script>write</script><meta name="written"></head><body><p>bodytail</p></body>',
	);
});

it.each([
	"base",
	"basefont",
	"bgsound",
	"link",
	"meta",
	"noframes",
	"script",
	"style",
	"template",
	"title",
])("routes a late %s to the saved head pointer", (tag) => {
	const { tree } = parse(`</head><${tag}></${tag}><body>b`);
	const head = [...tree.walk()].find(({ node }) => node.tagName === "head");
	if (!head) throw new Error("Missing head");
	expect(head.node.children.map((id) => tree.get(id).tagName)).toEqual([tag]);
	expect(htmlParseInfo(tree)?.issues["late-head-element"]).toBe(1);
});

it("treats an active head noscript as raw text rather than fallback markup", async () => {
	const policies: number[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<head><noscript><meta http-equiv=content-security-policy><p>fallback</noscript><title>T</title><body>b",
		"https://example.com/",
		{},
		{
			start() {},
			async script() {},
			policy(_owner, id) {
				policies.push(id);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	const noscript = [...tree.walk()].find(
		({ node }) => node.tagName === "noscript",
	);
	if (!noscript) throw new Error("Missing noscript");
	expect(tree.get(noscript.node.parent ?? -1).tagName).toBe("head");
	expect(noscript.node.children.map((id) => tree.get(id).kind)).toEqual([
		"text",
	]);
	expect(tree.textContent(noscript.node.id)).toBe(
		"<meta http-equiv=content-security-policy><p>fallback",
	);
	expect(policies).toEqual([]);
});

it("parses disabled body noscript contents without applying head fallback rules", () => {
	expect(parse("<body><noscript><p>fallback</p></noscript>b").html).toBe(
		"<head></head><body><noscript><p>fallback</p></noscript>b</body>",
	);
});

it("preserves document, before-head, head and after-head comment order", () => {
	const { tree } = parse(
		"<!--document--><html><!--before--><head><!--inside--></head><!--after--><body>b",
	);
	expect(serializeHtml(tree)).toBe(
		"<!DOCTYPE html><!--document--><html><!--before--><head><!--inside--></head><!--after--><body>b</body></html>",
	);
});

it.each(["body", "template"])(
	"does not redirect fragment metadata from a %s root into a scaffold",
	(tagName) => {
		const result = parseHtmlFragment(
			"<head><title>T</title></head><meta name=x><p>b",
			"https://example.com/",
			{ tagName },
		);
		trees.push(result.tree);
		expect(serializeHtml(result.tree, result.fragment)).toBe(
			'<title>T</title><meta name="x"><p>b</p>',
		);
	},
);

it("uses head modes for the html-context fragment without document-root comments", () => {
	const result = parseHtmlFragment(
		"<!--before--><head></head> <title>T</title><body>b",
		"https://example.com/",
		{ tagName: "html" },
	);
	trees.push(result.tree);
	expect(serializeHtml(result.tree, result.fragment)).toBe(
		"<!--before--><head><title>T</title></head> <body>b</body>",
	);
});

it("keeps the saved head pointer when a native script hook detaches that head", async () => {
	let detached: number | undefined;
	const tree = await parseHtmlDocumentAsync(
		"<head><script>detach</script></head><meta name=late><body>b",
		"https://example.com/",
		{},
		{
			start() {},
			async script(owner, id) {
				const parent = owner.get(id).parent;
				if (parent === null) throw new Error("Missing head");
				detached = parent;
				owner.remove(parent);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	if (detached === undefined) throw new Error("Missing detached head");
	expect(tree.get(detached).parent).toBeNull();
	expect(serializeHtml(tree, detached)).toBe(
		'<script>detach</script><meta name="late">',
	);
	expect([...tree.walk()].some(({ node }) => node.tagName === "head")).toBe(
		false,
	);
});

it("runs late-head policy hooks before the body and keeps template policies inert", async () => {
	const events: string[] = [];
	const tree = await parseHtmlDocumentAsync(
		"<head></head><template><meta http-equiv=content-security-policy></template><meta http-equiv=content-security-policy><body>b",
		"https://example.com/",
		{},
		{
			start() {},
			async script() {},
			policy(owner, id) {
				const parent = owner.get(id).parent;
				if (parent === null) throw new Error("Missing policy parent");
				events.push(owner.get(parent).tagName);
				expect(
					[...owner.walk()].some(({ node }) => node.tagName === "body"),
				).toBe(false);
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(events).toEqual(["head"]);
});

it("closes a candidate and template owner when a late-head policy hook fails", async () => {
	let candidate: DocumentTree | undefined;
	let contents: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"<head></head><template><p>inert</template><meta http-equiv=content-security-policy>",
			"https://example.com/",
			{},
			{
				start(tree) {
					candidate = tree;
				},
				async script() {},
				policy(owner) {
					const template = [...owner.walk()].find(
						({ node }) => node.tagName === "template",
					);
					if (!template) throw new Error("Missing template");
					contents = owner.templateContent(template.node.id).tree;
					throw new Error("policy failure");
				},
				async finish() {},
			},
		),
	).rejects.toThrow("policy failure");
	expect(contents).toBeDefined();
	expect(() => candidate?.get(candidate.root)).toThrow("closed");
	expect(() => contents?.get(contents.root)).toThrow("closed");
});

it("observes cancellation during a written late-head raw-text pause", async () => {
	const controller = new AbortController();
	let candidate: DocumentTree | undefined;
	await expect(
		parseHtmlDocumentAsync(
			"<head></head><script>write</script>",
			"https://example.com/",
			{ signal: controller.signal },
			{
				start(tree) {
					candidate = tree;
				},
				async script(_owner, _id, context) {
					context.write("<style>pending");
					controller.abort();
				},
				async finish() {},
			},
		),
	).rejects.toThrow("aborted");
	expect(() => candidate?.get(candidate.root)).toThrow("closed");
});

it("bounds ignored pre-head tokens even when they allocate no new elements", () => {
	let candidate: DocumentTree | undefined;
	expect(() =>
		parseHtmlDocument("</span>".repeat(33), "https://example.com/", {
			limits: { maxNodes: 4 },
			initializeDocument(tree) {
				candidate = tree;
			},
		}),
	).toThrow("token limit");
	expect(() => candidate?.get(candidate.root)).toThrow("closed");
});

it("reports ignored head tokens separately from fallback content and EOF", () => {
	const ignored = parse("</p><head><noscript><noscript></head>").tree;
	expect(htmlParseInfo(ignored)?.issues["ignored-head-tag"]).toBe(3);
	expect(htmlParseInfo(ignored)?.issues["unclosed-head-noscript"]).toBe(1);
	const fallback = parse("<head><noscript>content").tree;
	expect(htmlParseInfo(fallback)?.issues["content-in-head-noscript"]).toBe(1);
});
