import { expect, it, vi } from "vitest";
import { controlValue, selectedOptions } from "./controls.js";
import { DocumentTree } from "./document.js";
import { decodeHtmlEntities } from "./html-entities.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { type HtmlToken, HtmlTokenizer } from "./html-tokenizer.js";
import { DocumentQueries } from "./selectors.js";
import { renderSnapshot, snapshotDocument } from "./snapshot.js";

function fixture(source: string) {
	const tree = parseHtmlDocument(
		`<!doctype html>${source}`,
		"https://example.com/page",
	);
	const queries = new DocumentQueries(tree);
	const node = (selector: string) => {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error(`Missing ${selector}`);
		return tree.get(id);
	};
	return { tree, queries, node };
}

it("constructs html/head/body, merges attributes and places title metadata in head", () => {
	const { tree, queries, node } = fixture(
		"<html lang=en><title>Title &amp; More</title><body id=main><h1>Heading</h1><p>Text",
	);
	expect(queries.querySelectorAll("html > head > title")).toHaveLength(1);
	expect(tree.textContent(node("title").id)).toBe("Title & More");
	expect(node("html").attributes.lang).toBe("en");
	expect(node("body").attributes.id).toBe("main");
	expect(queries.querySelectorAll("body > h1, body > p")).toHaveLength(2);
	expect(htmlParseInfo(tree)).toMatchObject({
		partial: true,
		scripting: false,
		issues: {},
	});
	const snapshot = snapshotDocument(tree);
	expect(snapshot.html).toEqual({ partial: true, scripting: false, issues: 0 });
	expect(renderSnapshot(snapshot)).toContain("# HTML partial; JS off");
	expect(renderSnapshot(snapshot)).not.toContain("Title & More");
});

it("handles quoted/unquoted attributes, duplicates, booleans, entities and prototype names", () => {
	const { node } = fixture(
		'<INPUT ID=first id=second VALUE="&quot;x&#x26;y&quot;" required __proto__=safe constructor=also data-url=https://example.com/>',
	);
	expect(node("input").attributes).toMatchObject({
		id: "first",
		value: '"x&y"',
		required: "",
		constructor: "also",
		"data-url": "https://example.com/",
	});
	expect(node("input").attributes.__proto__).toBe("safe");
	expect(Object.getPrototypeOf(node("input").attributes)).toBe(
		Object.prototype,
	);
});

it("honors raw text boundaries and treats script/style/event attributes as inert data", () => {
	const { tree, queries, node } = fixture(
		'<script src="/never.js">globalThis.stolen=1; const x="<input id=bad>";</SCRIPT ><style>p{content:"<button>"}</style><p onclick="globalThis.stolen=2">Visible</p>',
	);
	expect(queries.querySelector("#bad")).toBeNull();
	expect(queries.querySelector("button")).toBeNull();
	expect(tree.textContent(node("script").id)).toContain("globalThis.stolen");
	expect(htmlParseInfo(tree)?.issues["script-not-executed"]).toBe(1);
	const output = renderSnapshot(snapshotDocument(tree));
	expect(output).toContain("Visible");
	expect(output).not.toContain("stolen");
	expect(output).not.toContain("content:");
});

it("parses textarea/title RCDATA and strips only the initial textarea/pre newline", () => {
	const { tree, queries, node } = fixture(
		"<title>A <b> &amp; B</title><textarea name=q>\r\n&lt;x&gt;\rnext</textarea><pre>\n\npre</pre>",
	);
	expect(tree.textContent(node("title").id)).toBe("A <b> & B");
	expect(queries.querySelector("title b")).toBeNull();
	expect(controlValue(tree, node("textarea").id)).toBe("<x>\nnext");
	expect(tree.textContent(node("pre").id)).toBe("\npre");
});

it("closes paragraphs and list items implicitly without flattening nested lists", () => {
	const { queries, node, tree } = fixture(
		"<p>one<div>two</div><p>three<ul><li>outer<ul><li>inner</ul><li>next</ul>",
	);
	expect(queries.querySelectorAll("body > p")).toHaveLength(2);
	expect(queries.querySelectorAll("body > ul > li")).toHaveLength(2);
	expect(queries.querySelectorAll("li > ul > li")).toHaveLength(1);
	expect(tree.textContent(node("body > ul > li:last-child").id)).toBe("next");
});

it("inserts table sections/rows and handles omitted cell closures", () => {
	const { queries, node, tree } = fixture(
		"<table><tr><td>one<td>two<tr><th>three</table><p>end",
	);
	expect(queries.querySelectorAll("table > tbody > tr")).toHaveLength(2);
	expect(queries.querySelectorAll("tr:first-child > td")).toHaveLength(2);
	expect(tree.textContent(node("th").id)).toBe("three");
	expect(queries.querySelectorAll("body > p")).toHaveLength(1);
});

it("foster-parents text outside table structure without losing the table", () => {
	const { tree, node } = fixture(
		"<table>before<tr><td>cell</td></tr>after</table>",
	);
	const body = node("body");
	expect(body.children.map((id) => tree.get(id).kind)).toEqual(
		["text", "table"].map((kind) => (kind === "table" ? "element" : kind)),
	);
	expect(tree.textContent(body.children[0])).toBe("beforeafter");
	expect(tree.textContent(node("table").id)).toBe("cell");
});

it("parses option/optgroup state and initial textarea values for native forms", () => {
	const { tree, node, queries } = fixture(
		"<form><select name=choice><option value=a>A<option value=b selected>B<optgroup label=More><option>C</select><textarea name=note>hello</textarea><button>Send</button></form>",
	);
	expect(queries.querySelectorAll("option")).toHaveLength(3);
	expect(
		selectedOptions(tree, node("select").id).map(
			(entry) => entry.attributes.value,
		),
	).toEqual(["b"]);
	expect(controlValue(tree, node("textarea").id)).toBe("hello");
	expect(queries.querySelectorAll("form > button")).toHaveLength(1);
});

it("ignores nested form starts while preserving real control identity", () => {
	const { queries, tree } = fixture(
		"<form id=outer><input name=a><form id=inner><input name=b></form><input name=c>",
	);
	expect(queries.querySelectorAll("form")).toHaveLength(1);
	expect(queries.querySelectorAll("form input")).toHaveLength(2);
	expect(queries.querySelectorAll("body > input")).toHaveLength(1);
	expect(htmlParseInfo(tree)?.issues["nested-form-ignored"]).toBe(1);
});

it("does not treat a nonvoid self-close as an XML close", () => {
	const { node, tree } = fixture("<div/><span>inside</span></div>");
	expect(node("div > span").tagName).toBe("span");
	expect(htmlParseInfo(tree)?.issues["nonvoid-self-close-ignored"]).toBe(1);
});

it("keeps comments out of visible text and decodes escaped markup as text", () => {
	const { queries, tree } = fixture(
		"<!-- <input> --><p>&lt;script&gt;safe&lt;/script&gt; < 3</p>",
	);
	expect(queries.querySelector("input")).toBeNull();
	expect(queries.querySelector("script")).toBeNull();
	expect(renderSnapshot(snapshotDocument(tree))).toContain(
		"<script>safe</script> < 3",
	);
});

it("uses scripting-disabled noscript content and does not expose iframe fallback text", () => {
	const { tree, queries } = fixture(
		"<body><noscript><p>No JS available</p></noscript><iframe src=/never><input id=not-real></iframe>",
	);
	expect(queries.querySelector("noscript p")).not.toBeNull();
	expect(queries.querySelector("#not-real")).toBeNull();
	expect(renderSnapshot(snapshotDocument(tree))).toContain("No JS available");
	expect(renderSnapshot(snapshotDocument(tree))).not.toContain("not-real");
});

it.each(["svg", "math", "frameset", "frame"])(
	"fails explicitly for unsupported %s construction and cleans the candidate",
	(tag) => {
		const closed = vi.spyOn(DocumentTree.prototype, "close");
		try {
			expect(() => fixture(`<${tag}>content</${tag}>`)).toThrow(
				"not implemented",
			);
			expect(closed).toHaveBeenCalledTimes(1);
		} finally {
			closed.mockRestore();
		}
	},
);

it.each([
	"<!--<script></script>-->",
	'const value="<script>";',
	'<!-->const value="<script>";',
	"<!-- <ScRiPt >nested</sCrIpT > -->",
])("keeps script escaped/double-escaped content inert: %s", (data) => {
	const { tree, node, queries } = fixture(`<script>${data}</script><p>after`);
	expect(tree.textContent(node("script").id)).toBe(data);
	expect(queries.querySelectorAll("script")).toHaveLength(1);
	expect(tree.textContent(node("p").id)).toBe("after");
});

it("decodes standard names while recording unknown names and parser limitations honestly", () => {
	const tree = parseHtmlDocument(
		"<b><i>text</b>&CounterClockwiseContourIntegral;&BrowserUnknownEntity;</i>",
		"https://example.com",
	);
	expect(htmlParseInfo(tree)?.issues).toMatchObject({
		"unresolved-named-reference": 1,
		"missing-doctype": 1,
		"quirks-layout-not-implemented": 1,
		"formatting-reconstruction-not-implemented": 1,
	});
	expect(renderSnapshot(snapshotDocument(tree))).toContain(
		"∳&BrowserUnknownEntity;",
	);
});

it("keeps parse metadata immutable and removes it on close", () => {
	const { tree } = fixture("<p>text");
	expect(Object.isFrozen(htmlParseInfo(tree))).toBe(true);
	expect(Object.isFrozen(htmlParseInfo(tree)?.issues)).toBe(true);
	tree.close();
	expect(htmlParseInfo(tree)).toBeUndefined();
});

it.each([{ maxNodes: 4 }, { maxDepth: 2 }, { maxTextCodeUnits: 10 }])(
	"enforces document/parser budgets %j",
	(limits) => {
		expect(() =>
			parseHtmlDocument("<div><p>content</p></div>", "https://example.com", {
				limits,
			}),
		).toThrow("limit");
	},
);

it("bounds ignored tokens, attributes and preaborted parsing", () => {
	expect(() =>
		parseHtmlDocument("</nothing>".repeat(100), "https://example.com", {
			limits: { maxNodes: 5 },
		}),
	).toThrow("token limit");
	expect(() =>
		fixture(
			`<p ${Array.from({ length: 1025 }, (_, index) => `a${index}=x`).join(" ")}>`,
		),
	).toThrow("attributes per token limit");
	expect(() =>
		parseHtmlDocument("<p>x", "https://example.com", {
			signal: AbortSignal.abort(),
		}),
	).toThrow("aborted");
});

it("keeps minimum-size semantic snapshots within their byte budget", () => {
	const { tree } = fixture("<p>hello</p>".repeat(100));
	const snapshot = snapshotDocument(tree, { maxBytes: 256 });
	expect(
		new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
	).toBeLessThanOrEqual(256);
	expect(snapshot.truncated).toBe(true);
	expect(
		new TextEncoder().encode(renderSnapshot(snapshot, 64)).byteLength,
	).toBeLessThanOrEqual(64);
});

it.each([
	["&#0;&#xD800;&#1114112;", "���"],
	["&#x80;&#x9a;&#x9b;&#x1F642;", "€š›🙂"],
	["&amp;&lt;&gt;&quot;&apos;&nbsp;", "&<>\"'\u00a0"],
	["&#65 &#x41", "A A"],
])("decodes bounded numeric/common named references: %s", (input, expected) => {
	expect(decodeHtmlEntities(input, false, () => {})).toBe(expected);
});

it("does not consume an ambiguous semicolonless entity in an attribute", () => {
	expect(decodeHtmlEntities("&amp=next", true, () => {})).toBe("&amp=next");
	expect(decodeHtmlEntities("&amp=next", false, () => {})).toBe("&=next");
});

it("tokenizes greater-than characters in quoted attributes and drops incomplete tags", () => {
	const issues: string[] = [];
	const tokenizer = new HtmlTokenizer(
		'<a title="a > b" href=/x>text</a><input value="unfinished',
		(code) => issues.push(code),
	);
	const tokens: HtmlToken[] = [];
	for (let token = tokenizer.next(); token; token = tokenizer.next())
		tokens.push(token);
	expect(tokens).toMatchObject([
		{ kind: "start", name: "a", attributes: { title: "a > b", href: "/x" } },
		{ kind: "text", data: "text" },
		{ kind: "end", name: "a" },
	]);
	expect(issues).toContain("unterminated-tag");
});
