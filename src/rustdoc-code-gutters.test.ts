import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import {
	type ExtractedNode,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

const url = "https://rustdoc.fixture.invalid/source.rs.html";
const trees: DocumentTree[] = [];
const formats = ["markdown", "json"] as const;
const limits = {
	maxNodes: 2048,
	maxDepth: 512,
	maxTextCodeUnits: 100_000,
	maxChanges: 2048,
};

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function native(source: string) {
	const tree = parseHtmlDocument(source, url, { limits });
	trees.push(tree);
	return tree;
}

function reader(source: string) {
	const body = new TextEncoder().encode(source);
	const tree = loadResearchDocument(
		{
			url,
			status: 200,
			headers: { "content-type": ["text/html; charset=utf-8"] },
			body,
			encodedBytes: body.byteLength,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "rustdoc-code-gutters",
			signal: new AbortController().signal,
			limits,
		},
	);
	trees.push(tree);
	return tree;
}

function element(tree: DocumentTree, selector: string) {
	const queries = new DocumentQueries(tree);
	try {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error(`Missing fixture element: ${selector}`);
		return id;
	} finally {
		queries.close();
	}
}

function anchor(id = "1") {
	return `<a id="${id}" href="#${id}" data-nosnippet>${id}</a>`;
}

function rust(source: string) {
	return `<pre class="source rust highlighted"><code>${source}</code></pre>`;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function structured(tree: DocumentTree, options: ExtractionOptions = {}) {
	const result = extractDocument(tree, { ...options, format: "json" });
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return result;
}

function text(node: ExtractedNode) {
	return flattened(node)
		.map((entry) => entry.text ?? "")
		.join("");
}

function gutters(result: unknown, count: number) {
	if (count === 0) expect(result).not.toHaveProperty("sourceCodeGutters");
	else
		expect(result).toHaveProperty("sourceCodeGutters", {
			kind: "rustdoc-line-number-anchors-v1",
			anchors: count,
		});
}

function retained(tree: DocumentTree, id = element(tree, "a")) {
	const result = structured(tree);
	expect(flattened(result.content).map((node) => node.ref)).toContain(
		tree.reference(id),
	);
	gutters(result, 0);
	const markdown = extractDocument(tree);
	gutters(markdown, 0);
	const queries = new DocumentQueries(tree);
	try {
		const pre = queries.querySelector("pre");
		if (pre !== null)
			expect(markdown.content).toBe(
				`\`\`\`\n${tree.textContent(pre)}\n\`\`\`\n`,
			);
	} finally {
		queries.close();
	}
}

it.each(["\n", "\r\n"])(
	"removes nested first and later line gutters with %j while preserving Rust source",
	(newline) => {
		const source = rust(
			`<span>${anchor()}<span>#![allow(dead_code)]${newline}</span></span>` +
				`<span><span>${anchor("2")}</span>\tlet value = 123_456;  ${newline}</span>` +
				`<span>${anchor("999999999")}let label = "雪🦀 \`\`\`";${newline}</span>`,
		);
		const expected =
			'#![allow(dead_code)]\n\tlet value = 123_456;  \nlet label = "雪🦀 ```";\n';
		for (const load of [native, reader]) {
			const tree = load(source);
			const markdown = extractDocument(tree);
			expect(markdown.content).toBe(`\`\`\`\`\n${expected}\`\`\`\`\n`);
			gutters(markdown, 3);
			const result = structured(tree);
			expect(text(result.content)).toBe(expected);
			gutters(result, 3);
			expect(
				flattened(result.content).filter((node) => node.type === "link"),
			).toEqual([]);
		}
	},
);

it("retains only empty data-nosnippet attributes on reader anchors", () => {
	const tree = reader(
		rust(
			`${anchor()}one\n<a id="2" href="#2" data-nosnippet="yes">2</a>two\n<a id="3" href="#3" data-nosnippet=" ">3</a>three\n<span id="other" data-nosnippet="">ordinary</span>`,
		),
	);
	expect(tree.get(element(tree, '[id="1"]')).attributes["data-nosnippet"]).toBe(
		"",
	);
	for (const selector of ['[id="2"]', '[id="3"]', "#other"])
		expect(tree.get(element(tree, selector)).attributes).not.toHaveProperty(
			"data-nosnippet",
		);
	const result = structured(tree);
	expect(text(result.content)).toBe("one\n2two\n3three\nordinary");
	gutters(result, 1);
});

it.each([
	["non-rust pre", `<pre class="rustdoc"><code>${anchor()}value</code></pre>`],
	[
		"case-sensitive rust token",
		`<pre class="Rust"><code>${anchor()}value</code></pre>`,
	],
	["missing code", `<pre class="rust">${anchor()}value</pre>`],
	["missing pre", `<code>${anchor()}value</code>`],
	["ordinary anchor", `<p>${anchor()}value</p>`],
	["absent marker", rust('<a id="1" href="#1">1</a>value')],
	["wrong marker", rust('<a id="1" href="#1" data-no-snippet>1</a>value')],
	[
		"nonempty marker",
		rust('<a id="1" href="#1" data-nosnippet="true">1</a>value'),
	],
	[
		"whitespace marker",
		rust('<a id="1" href="#1" data-nosnippet=" ">1</a>value'),
	],
	["zero", rust(`${anchor("0")}value`)],
	["leading zero", rust(`${anchor("01")}value`)],
	["ten digits", rust(`${anchor("1000000000")}value`)],
	["negative id", rust(`${anchor("-1")}value`)],
	["nondecimal id", rust(`${anchor("1e2")}value`)],
	["absent id", rust('<a href="#1" data-nosnippet>1</a>value')],
	["absent href", rust('<a id="1" data-nosnippet>1</a>value')],
	["mismatched href", rust('<a id="1" href="#2" data-nosnippet>1</a>value')],
	["mismatched text", rust('<a id="1" href="#1" data-nosnippet>2</a>value')],
	["padded text", rust('<a id="1" href="#1" data-nosnippet> 1 </a>value')],
	["no child", rust('<a id="1" href="#1" data-nosnippet></a>value')],
	[
		"non-text child",
		rust('<a id="1" href="#1" data-nosnippet><span>1</span></a>value'),
	],
	[
		"multiple children",
		rust('<a id="1" href="#1" data-nosnippet>1<span></span></a>value'),
	],
	[
		"external link",
		rust('<a id="1" href="https://other.invalid/#1" data-nosnippet>1</a>value'),
	],
	[
		"absolute same-document link",
		rust(`<a id="1" href="${url}#1" data-nosnippet>1</a>value`),
	],
	["mid-line", rust(`<span>let value = </span><span>${anchor()}23;</span>`)],
	["leading space", rust(` ${anchor()}value`)],
	["indent after LF", rust(`before\n\t${anchor()}value`)],
])("retains the %s negative control", (_label, source) => {
	retained(native(source));
});

it("requires exactly one text child even when adjacent text concatenates to the id", () => {
	const tree = native(rust(`${anchor("12")}value`));
	const id = element(tree, "a");
	tree.setTextContent(id, "1");
	tree.append(id, tree.createText("2"));
	expect(tree.get(id).children).toHaveLength(2);
	retained(tree, id);
});

it.each([svgNamespace, mathmlNamespace])(
	"retains lookalikes with foreign namespace %s at each required context element",
	(namespace) => {
		for (const foreignTag of ["pre", "code", "a"]) {
			const tree = native("<body></body>");
			let parent = element(tree, "body");
			let candidate = parent;
			for (const tag of ["pre", "code", "a"]) {
				const attributes: Record<string, string> =
					tag === "pre"
						? { class: "rust" }
						: tag === "a"
							? { id: "1", href: "#1", "data-nosnippet": "" }
							: {};
				const id = tree.createParserElement(
					tag,
					attributes,
					tag === foreignTag ? namespace : htmlNamespace,
				);
				tree.append(parent, id);
				parent = id;
				candidate = id;
			}
			tree.setTextContent(candidate, "1");
			retained(tree, candidate);
		}
	},
);

it("initializes line state for pre/code roots but retains an explicit anchor root", () => {
	const tree = native(
		`<p>Outside</p>${rust(`${anchor()}let value = 42;\n`)}${rust(`${anchor("2")}Other source`)}`,
	);
	for (const format of formats) gutters(extractDocument(tree, { format }), 2);
	for (const selector of ["pre", "code"]) {
		const root = tree.reference(element(tree, selector));
		for (const format of formats) {
			const result = extractDocument(tree, { root, format });
			gutters(result, 1);
			expect(result.scope).toBe(root);
			if (result.format === "json")
				expect(text(result.content)).toBe("let value = 42;\n");
			else {
				expect(result.content).toContain("let value = 42;");
				expect(result.content).not.toContain("1let");
				expect(result.content).not.toContain("Outside");
				expect(result.content).not.toContain("Other source");
			}
		}
	}
	const root = tree.reference(element(tree, "a"));
	for (const format of formats) {
		const result = extractDocument(tree, { root, format });
		gutters(result, 0);
		if (result.format === "json") {
			expect(result.content.ref).toBe(root);
			expect(text(result.content)).toBe("1");
		} else expect(result.content).toBe(`[1](<${url}#1>)\n`);
	}
});

it("retains candidates beyond the 128-node ancestor-context bound", () => {
	const tree = native(
		rust(`${"<span>".repeat(130)}${anchor()}value${"</span>".repeat(130)}`),
	);
	retained(tree);
});

it("tracks line state through many empty siblings within normal traversal limits", () => {
	const tree = native(
		rust(
			`<span>before\n</span>${"<span></span>".repeat(130)}${anchor("2")}after`,
		),
	);
	for (const format of formats) {
		const result = extractDocument(tree, { format });
		gutters(result, 1);
		if (result.format === "json")
			expect(text(result.content)).toBe("before\nafter");
		else expect(result.content).toBe("```\nbefore\nafter\n```\n");
	}
});

it("keeps DOM contents, revisions and every existing node reference unchanged", () => {
	const tree = native(rust(`${anchor()}let value = 42;\n${anchor("2")}雪`));
	const ids: number[] = [];
	const pending = [tree.root];
	while (pending.length) {
		const id = pending.pop();
		if (id === undefined) break;
		ids.push(id);
		pending.push(...tree.get(id).children);
	}
	const before = JSON.stringify(ids.map((id) => tree.get(id)));
	const references = ids.map((id) => tree.reference(id));
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	for (const format of formats) gutters(extractDocument(tree, { format }), 2);
	expect(JSON.stringify(ids.map((id) => tree.get(id)))).toBe(before);
	expect(references.map((ref) => tree.resolve(ref).id)).toEqual(ids);
	expect(tree.revision).toBe(revision);
	expect(tree.resourceUsage()).toEqual(usage);
	expect(tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
});

it("rechecks live marker, id, href, text, line position and code ancestry mutations", () => {
	const tree = native(rust(`<span id="prefix"></span>${anchor()}value`));
	const id = element(tree, "a");
	const pre = element(tree, "pre");
	const prefix = element(tree, "#prefix");
	const check = (count: number) => {
		for (const format of formats)
			gutters(extractDocument(tree, { format }), count);
	};
	check(1);
	tree.setAttribute(id, "data-nosnippet", "true");
	check(0);
	tree.setAttribute(id, "data-nosnippet", "");
	check(1);
	tree.setAttribute(id, "id", "2");
	check(0);
	tree.setAttribute(id, "href", "#2");
	check(0);
	tree.setTextContent(id, "2");
	check(1);
	tree.setTextContent(prefix, "inline ");
	check(0);
	tree.setTextContent(prefix, "line\n");
	check(1);
	tree.setTextContent(prefix, "line\r\n");
	check(1);
	tree.setTextContent(prefix, "line\r");
	check(0);
	tree.setTextContent(prefix, "line\n");
	check(1);
	tree.setAttribute(pre, "class", "not-rust");
	check(0);
	tree.setAttribute(pre, "class", "rust");
	check(1);
	tree.append(pre, id);
	check(0);
});

it.each(formats)(
	"charges omitted anchor/text nodes and exact UTF-8 output limits in %s",
	(format) => {
		const tree = native(rust(`${anchor()}let 雪 = 42;`));
		const root = tree.reference(element(tree, "pre"));
		const options = { root, format, maxNodes: 5, maxDepth: 3 };
		const result = extractDocument(tree, options);
		gutters(result, 1);
		for (const maxNodes of [2, 3, 4])
			expect(() => extractDocument(tree, { ...options, maxNodes })).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		expect(() => extractDocument(tree, { ...options, maxDepth: 2 })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
		expect(extractDocument(tree, { ...options, maxBytes: bytes })).toEqual(
			result,
		);
		expect(() =>
			extractDocument(tree, { ...options, maxBytes: bytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);
