import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { setInnerHtml } from "./html-content.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

it("extracts live headings, paragraphs, links and stable structured references", () => {
	const tree = parseHtmlDocument(
		'<title>Example title</title><main><h1>Hello &amp; world</h1><p>Read <a href="/next">the next page</a>.</p></main>',
		"https://example.com/start",
	);
	try {
		const markdown = extractDocument(tree);
		expect(markdown).toMatchObject({
			format: "markdown",
			title: "Example title",
			url: "https://example.com/start",
			partial: true,
		});
		expect(markdown.content).toBe(
			"# Hello &amp; world\n\nRead [the next page](<https://example.com/next>)\\.\n",
		);
		const structured = extractDocument(tree, { format: "json" });
		expect(structured.format).toBe("json");
		expect(JSON.stringify(structured)).toContain('"type":"heading"');
		const reference = tree.reference(
			new DocumentQueries(tree).querySelector("a") as number,
		);
		expect(JSON.stringify(structured)).toContain(reference);
		expect(tree.resolve(reference).tagName).toBe("a");
	} finally {
		tree.close();
	}
});

it("scopes extraction to an attached reference and reflects post-load DOM mutations", () => {
	const tree = parseHtmlDocument(
		"<aside>Outside</aside><main><p>Before</p></main>",
		"https://example.com/",
	);
	try {
		const root = new DocumentQueries(tree).querySelector("main") as number;
		const ref = tree.reference(root);
		expect(extractDocument(tree, { root: ref }).content).toBe("Before\n");
		setInnerHtml(tree, root, "<h2>After</h2><p>New content</p>");
		const after = extractDocument(tree, { root: ref });
		expect(after.content).toBe("## After\n\nNew content\n");
		expect(after.revision).toBe(tree.revision);
		expect(after.content).not.toContain("Outside");
		tree.remove(root);
		expect(() => extractDocument(tree, { root: ref })).toThrow();
	} finally {
		tree.close();
	}
});

it("omits hidden content, executable source and form values while respecting visibility overrides", () => {
	const tree = parseHtmlDocument(
		'<style>.gone{display:none}.invisible{visibility:hidden}.visible{visibility:visible}</style><script>secret script</script><div hidden>Hidden</div><div class=gone>Gone</div><div aria-hidden=true>Aria hidden</div><div class=invisible>Invisible<span class=visible>Visible child</span></div><label>Name<input value="private input"></label><textarea>private textarea</textarea><select><option>private option</option></select><p>Public</p>',
		"https://example.com/",
	);
	try {
		for (const format of ["markdown", "json"] as const) {
			const result = JSON.stringify(extractDocument(tree, { format }));
			for (const value of [
				"secret script",
				"Hidden",
				"Gone",
				"Aria hidden",
				"Invisible",
				"private input",
				"private textarea",
				"private option",
			])
				expect(result).not.toContain(value);
			expect(result).toContain("Visible child");
			expect(result).toContain("Public");
		}
		const hidden = new DocumentQueries(tree).querySelector(
			"[hidden]",
		) as number;
		expect(
			extractDocument(tree, { root: tree.reference(hidden) }).content,
		).toBe("");
	} finally {
		tree.close();
	}
});

it("uses the live base URL and does not emit unsafe or credential-bearing link destinations", () => {
	const tree = parseHtmlDocument(
		'<base href="https://cdn.example.com/docs/"><p><a href="next?q=(test)">Safe</a> <a href="javascript:alert(1)">Script</a> <a href="data:text/html,secret">Data</a> <a href="https://user:secret@example.com/">Credential</a> <a href="file:///etc/passwd">File</a></p>',
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree);
		expect(result.content).toContain(
			"[Safe](<https://cdn.example.com/docs/next?q=(test)>)",
		);
		expect(result.content).toContain("Script Data Credential File");
		const json = JSON.stringify(extractDocument(tree, { format: "json" }));
		expect(json).toContain('"blocked":true');
		for (const value of ["javascript:", "data:text", "user:secret", "file:///"])
			expect(json).not.toContain(value);
	} finally {
		tree.close();
	}
});

it("escapes destination ampersands without changing the structured URL", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const anchor = tree.createElement("a", {
			href: "/next?name=&copy;&other=1",
		});
		tree.append(tree.root, anchor);
		tree.setTextContent(anchor, "Next");
		expect(extractDocument(tree).content).toBe(
			"[Next](<https://example.com/next?name=&amp;copy;&amp;other=1>)\n",
		);
		expect(JSON.stringify(extractDocument(tree, { format: "json" }))).toContain(
			"https://example.com/next?name=&copy;&other=1",
		);
	} finally {
		tree.close();
	}
});

it("renders lists, nested quotes, line breaks and code without accepting source Markdown syntax", () => {
	const tree = parseHtmlDocument(
		"<h2>1. [Injected](javascript:bad) &lt;script&gt;</h2><ol start=3><li>First</li><li>Second<ul><li>Nested</li></ul></li></ol><blockquote><p>Quoted<br>line</p></blockquote><pre><code>const value = `one`;\n```\n  indented\n</code></pre><p>Use <code>a`b</code>.</p>",
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree);
		expect(result.content).toContain(
			"## 1\\. \\[Injected\\]\\(javascript:bad\\) &lt;script&gt;",
		);
		expect(result.content).toContain("3. First");
		expect(result.content).toContain("4. Second");
		expect(result.content).toContain("   - Nested");
		expect(result.content).toContain("> Quoted  \n> line");
		expect(result.content).toContain(
			"````\nconst value = `one`;\n```\n  indented\n````",
		);
		expect(result.content).toContain("`` a`b ``");
	} finally {
		tree.close();
	}
});

it("uses image alternatives without creating auto-loaded Markdown images", () => {
	const tree = parseHtmlDocument(
		'<p>Image <img src="https://tracker.example/pixel" alt="A [diagram]"></p>',
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree);
		expect(result.content).toContain("A \\[diagram\\]");
		expect(result.content).not.toContain("![");
		expect(
			JSON.stringify(extractDocument(tree, { format: "json" })),
		).not.toContain("tracker.example");
	} finally {
		tree.close();
	}
});

it("enforces exact serialized UTF-8 output bounds and structural limits without partial results", () => {
	const tree = parseHtmlDocument(
		`<p>${"界".repeat(100)}</p>`,
		"https://example.com/",
	);
	try {
		for (const format of ["markdown", "json"] as const) {
			const result = extractDocument(tree, { format });
			const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
			expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(
				result,
			);
			expect(() =>
				extractDocument(tree, { format, maxBytes: bytes - 1 }),
			).toThrow("limit");
		}
		expect(() => extractDocument(tree, { maxNodes: 1 })).toThrow("limit");
		expect(() => extractDocument(tree, { maxDepth: 0 })).toThrow("limit");
		for (const options of [
			{ maxBytes: -1 },
			{ maxNodes: 0 },
			{ maxDepth: 1025 },
			{ format: "pdf" as "json" },
		])
			expect(() => extractDocument(tree, options)).toThrow();
	} finally {
		tree.close();
	}
});

it("does not consume document changes and escapes terminal controls in metadata and text", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		const paragraph = tree.createElement("p");
		tree.append(tree.root, paragraph);
		tree.setTextContent(paragraph, "Hello\x1b[2J\u202e world");
		const revision = tree.revision;
		const result = extractDocument(tree);
		expect(result.content).not.toContain("\x1b");
		expect(result.content).not.toContain("\u202e");
		expect(tree.revision).toBe(revision);
		expect(extractDocument(tree)).toEqual(result);
	} finally {
		tree.close();
	}
});

it("keeps inline containers in the same paragraph and emits no text for empty code", () => {
	const tree = parseHtmlDocument(
		"<div>Hello <span>world</span>!<code></code> <strong>Bold</strong></div>",
		"https://example.com/",
	);
	try {
		expect(extractDocument(tree).content).toBe("Hello world\\! Bold\n");
	} finally {
		tree.close();
	}
});

it("does not inherit element mappings from Object.prototype", () => {
	const tree = parseHtmlDocument(
		"<constructor>One</constructor><toString>Two</toString><__proto__>Three</__proto__>",
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree, { format: "json" });
		if (result.format !== "json") throw new Error("Unexpected format");
		const pending = [result.content];
		while (pending.length) {
			const node = pending.pop();
			if (!node) break;
			expect(typeof node.type).toBe("string");
			pending.push(...(node.children ?? []));
		}
	} finally {
		tree.close();
	}
});

it("retains empty list items and negative ordered labels without fabricating a new start", () => {
	const tree = parseHtmlDocument(
		"<ul><li></li><li> </li></ul><ol start=-3><li>Minus three</li><li>Minus two</li></ol>",
		"https://example.com/",
	);
	try {
		const result = extractDocument(tree);
		expect(String(result.content).match(/^- +$/gm)).toHaveLength(2);
		expect(result.content).toContain("- -3. Minus three");
		expect(result.content).toContain("- -2. Minus two");
		expect(JSON.stringify(extractDocument(tree, { format: "json" }))).toContain(
			'"start":-3',
		);
	} finally {
		tree.close();
	}
});

it("recomputes visibility after live style changes and excludes scoped hidden descendants", () => {
	const tree = parseHtmlDocument(
		"<div id=parent><p id=child>Visible</p></div>",
		"https://example.com/",
	);
	try {
		const queries = new DocumentQueries(tree);
		const parent = queries.querySelector("#parent") as number;
		const child = queries.querySelector("#child") as number;
		const root = tree.reference(child);
		expect(extractDocument(tree, { root }).content).toBe("Visible\n");
		tree.setAttribute(parent, "hidden", "");
		expect(extractDocument(tree, { root }).content).toBe("");
		tree.removeAttribute(parent, "hidden");
		tree.setAttribute(child, "style", "display:none");
		expect(extractDocument(tree, { root }).content).toBe("");
		tree.setAttribute(child, "style", "display:block");
		expect(extractDocument(tree, { root }).content).toBe("Visible\n");
		queries.close();
	} finally {
		tree.close();
	}
});

it("handles deep documents iteratively and returns detached structured data", () => {
	const tree = new DocumentTree("https://example.com/");
	try {
		let parent = tree.root;
		for (let depth = 0; depth < 200; depth++) {
			const child = tree.createElement("span");
			tree.append(parent, child);
			parent = child;
		}
		tree.setTextContent(parent, "Deep content");
		expect(extractDocument(tree).content).toBe("Deep content\n");
		expect(() => extractDocument(tree, { maxDepth: 50 })).toThrow("limit");
		const result = extractDocument(tree, { format: "json" });
		if (result.format !== "json") throw new Error("Unexpected format");
		result.content.children = [];
		expect(extractDocument(tree).content).toBe("Deep content\n");
	} finally {
		tree.close();
	}
});
