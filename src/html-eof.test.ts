import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import { htmlParseInfo } from "./html-info.js";
import {
	parseHtmlDocument,
	parseHtmlDocumentAsync,
	parseHtmlFragment,
} from "./html-parser.js";
import { HtmlScope } from "./html-scope.js";
import { serializeHtml } from "./html-serialization.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import { snapshotDocument } from "./snapshot.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function parse(source: string) {
	const tree = parseHtmlDocument(
		`<!doctype html>${source}`,
		"https://example.test/",
	);
	trees.push(tree);
	return { tree, issues: htmlParseInfo(tree)?.issues ?? {} };
}

it("reports unclosed non-optional elements at body EOF", () => {
	expect(parse("<div><span>text").issues["unclosed-elements-at-eof"]).toBe(1);
});

it("reports text-mode EOF when an incomplete end tag is discarded", () => {
	expect(parse("<textarea>value</textarea data=").issues["eof-in-text"]).toBe(
		1,
	);
});

it("reports EOF before a tag name while retaining the literal opener", () => {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer("</", (code) => issues.push(code));
	expect(tokenizer.next()).toEqual({ kind: "text", data: "</" });
	expect(tokenizer.next()).toBeUndefined();
	expect(issues).toEqual(["eof-before-tag-name"]);
});

it.each([
	"div",
	"span",
	"a",
	"b",
	"form",
	"button",
	"ul",
	"table",
	"select",
	"plaintext",
	"ruby",
	"h1",
	"object",
])("reports an unclosed %s without changing its document tree", (tag) => {
	const { tree, issues } = parse(`<${tag}>value`);
	expect(issues["unclosed-elements-at-eof"]).toBe(1);
	expect(serializeHtml(tree, tree.root)).toContain(
		tag === "table" ? "value<table></table>" : `<${tag}>value</${tag}>`,
	);
});

it.each(["p", "li", "dd", "dt", "option", "optgroup", "rb", "rp", "rt", "rtc"])(
	"does not diagnose the EOF-permitted %s element",
	(tag) => {
		expect(
			parse(`<${tag}>value`).issues["unclosed-elements-at-eof"],
		).toBeUndefined();
	},
);

it.each([
	"",
	"<div></div>",
	"<head><title>T</title></head>",
	"<p>value",
	"<input>",
	"<div",
])("does not invent unclosed-element errors for %s", (source) => {
	expect(parse(source).issues["unclosed-elements-at-eof"]).toBeUndefined();
});

it.each(["<div></body>", "<div></html>", "<div></body> \n<!--after-->"])(
	"does not repeat the body-end error at EOF for %s",
	(source) => {
		const { issues } = parse(source);
		expect(issues["unclosed-elements-at-body-end"]).toBe(1);
		expect(issues["unclosed-elements-at-eof"]).toBeUndefined();
	},
);

it("checks the retained stack when late content reenters the body", () => {
	const { issues } = parse("<div></body>late");
	expect(issues["unclosed-elements-at-body-end"]).toBe(1);
	expect(issues["unclosed-elements-at-eof"]).toBe(1);
});

it("flushes pending table text before checking the open table at EOF", () => {
	const { tree, issues } = parse("<table>fostered");
	expect(serializeHtml(tree, tree.root)).toContain(
		"<body>fostered<table></table></body>",
	);
	expect(issues["unclosed-elements-at-eof"]).toBe(1);
});

it("unwinds actual template frames before checking the outer body stack", () => {
	const { tree, issues } = parse(
		"<body><div><template><section><template><span>inert",
	);
	expect(issues["unclosed-template"]).toBe(2);
	expect(issues["unclosed-elements-at-eof"]).toBe(1);
	expect(serializeHtml(tree, tree.root)).toContain(
		"<div><template><section><template><span>inert</span></template></section></template></div>",
	);
});

it("does not apply the body EOF list to discarded template content frames", () => {
	const { issues } = parse("<template><div><b>inert");
	expect(issues["unclosed-template"]).toBe(1);
	expect(issues["unclosed-elements-at-eof"]).toBeUndefined();
});

it.each(["div", "table", "colgroup", "textarea", "style"])(
	"excludes the virtual %s fragment root from the EOF check",
	(tagName) => {
		const { tree } = parseHtmlFragment("", "https://example.test/", {
			tagName,
		});
		trees.push(tree);
		expect(
			htmlParseInfo(tree)?.issues["unclosed-elements-at-eof"],
		).toBeUndefined();
	},
);

it("checks actual fragment nodes but stops at a virtual template EOF", () => {
	for (const tagName of ["div", "template"]) {
		const { tree } = parseHtmlFragment(
			"<section>value",
			"https://example.test/",
			{ tagName },
		);
		trees.push(tree);
		expect(htmlParseInfo(tree)?.issues["unclosed-elements-at-eof"]).toBe(
			tagName === "div" ? 1 : undefined,
		);
	}
});

it("allows omitted row and cell ends without mistaking a table context for an open table", () => {
	const { tree } = parseHtmlFragment("<tr><td>value", "https://example.test/", {
		tagName: "table",
	});
	trees.push(tree);
	expect(
		htmlParseInfo(tree)?.issues["unclosed-elements-at-eof"],
	).toBeUndefined();
});

it.each([
	"title",
	"textarea",
	"style",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
	"script",
])("distinguishes %s text-mode EOF from an ordinary body EOF", (tag) => {
	const { issues } = parse(`<${tag}>value`);
	expect(issues["eof-in-text"]).toBe(1);
	expect(issues["unterminated-raw-element"]).toBe(1);
	expect(issues["unclosed-elements-at-eof"]).toBeUndefined();
});

it.each(["<", "</"])(
	"emits literal %s and one EOF-before-name diagnostic",
	(source) => {
		const issues: string[] = [];
		const tokenizer = new HtmlTokenizer(source, (code) => issues.push(code));
		expect(tokenizer.next()).toEqual({ kind: "text", data: source });
		expect(tokenizer.next()).toBeUndefined();
		expect(tokenizer.next()).toBeUndefined();
		expect(issues).toEqual(["eof-before-tag-name"]);
	},
);

it.each(["<", "</"])(
	"keeps bounded %s pending instead of diagnosing EOF",
	(source) => {
		const issues: string[] = [];
		const tokenizer = new HtmlTokenizer(source, (code) => issues.push(code));
		tokenizer.setBoundary(source.length);
		expect(tokenizer.next()).toBeUndefined();
		expect(tokenizer.paused).toBe(true);
		expect(tokenizer.position).toBe(0);
		expect(issues).toEqual([]);
		tokenizer.insert("p>", source.length);
		tokenizer.setBoundary(undefined);
		expect(tokenizer.next()).toMatchObject({
			kind: source === "<" ? "start" : "end",
			name: "p",
		});
		expect(issues).toEqual([]);
	},
);

it("diagnoses a pending opener once when its input boundary becomes true EOF", () => {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer("</", (code) => issues.push(code));
	tokenizer.setBoundary(2);
	expect(tokenizer.next()).toBeUndefined();
	tokenizer.setBoundary(undefined);
	expect(tokenizer.next()).toEqual({ kind: "text", data: "</" });
	expect(issues).toEqual(["eof-before-tag-name"]);
});

it("does not finalize open elements or raw text at a document-write boundary", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<!doctype html><script>write</script>",
		"https://example.test/",
		{},
		{
			start() {},
			async script(_owner, _id, context) {
				context.write("<div><textarea>value</textarea");
				context.write("></div>");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(htmlParseInfo(tree)?.issues["eof-in-text"]).toBeUndefined();
	expect(
		htmlParseInfo(tree)?.issues["unclosed-elements-at-eof"],
	).toBeUndefined();
	expect(serializeHtml(tree, tree.root)).toContain(
		"<div><textarea>value</textarea></div>",
	);
});

it("diagnoses an incomplete written raw end tag only after parsing resumes to EOF", async () => {
	const tree = await parseHtmlDocumentAsync(
		"<!doctype html><script>write</script>",
		"https://example.test/",
		{},
		{
			start() {},
			async script(_owner, _id, context) {
				context.write("<textarea>value</textarea data=");
			},
			async finish() {},
		},
	);
	trees.push(tree);
	expect(htmlParseInfo(tree)?.issues["eof-in-text"]).toBe(1);
	expect(htmlParseInfo(tree)?.issues["unterminated-tag"]).toBe(1);
});

it("never executes a script whose closing tag was discarded at EOF", async () => {
	const script = vi.fn(async () => {});
	const tree = await parseHtmlDocumentAsync(
		"<!doctype html><script>unfinished</script data=",
		"https://example.test/",
		{},
		{
			start() {},
			script,
			async finish() {},
		},
	);
	trees.push(tree);
	expect(script).not.toHaveBeenCalled();
	expect(htmlParseInfo(tree)?.issues["unterminated-script-not-executed"]).toBe(
		1,
	);
	expect(htmlParseInfo(tree)?.issues["eof-in-text"]).toBe(1);
});

function state(tags: string[], maxWork = 100) {
	const tree = new DocumentTree("https://example.test/");
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

it("checks the entire EOF-permitted list without changing the stack", () => {
	const { scope, stack, options } = state([
		"html",
		"body",
		"dd",
		"dt",
		"li",
		"optgroup",
		"option",
		"p",
		"rb",
		"rp",
		"rt",
		"rtc",
		"tbody",
		"td",
		"tfoot",
		"th",
		"thead",
		"tr",
	]);
	const before = [...stack];
	scope.endOfFile();
	expect(stack).toEqual(before);
	expect(options.issue).not.toHaveBeenCalled();
	expect(options.check).toHaveBeenCalledTimes(stack.length - 1);
});

it("charges the EOF scan against the shared scope work budget", () => {
	const { scope } = state(["html", "body", "p"], 1);
	expect(() => scope.endOfFile()).toThrow("HTML scope work limit");
});

it("checks cancellation while inspecting the EOF stack", () => {
	const { scope, options } = state(["html", "body", "div"]);
	options.check.mockImplementation(() => {
		throw new Error("cancelled");
	});
	expect(() => scope.endOfFile()).toThrow("cancelled");
	expect(options.issue).not.toHaveBeenCalled();
});

it("retains immutable EOF diagnostics in native snapshots and clears them on close", () => {
	const { tree, issues } = parse("<div>");
	expect(Object.isFrozen(issues)).toBe(true);
	expect(snapshotDocument(tree).html?.issues).toBe(1);
	tree.close();
	expect(htmlParseInfo(tree)).toBeUndefined();
});
