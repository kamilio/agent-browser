import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import {
	type ExtractedNode,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

const url = "https://github.fixture.invalid/owner/repo/blob/main/source.py";
const trees: DocumentTree[] = [];
const formats = ["markdown", "json"] as const;
const limits = {
	maxNodes: 4096,
	maxDepth: 512,
	maxTextCodeUnits: 100_000,
	maxChanges: 4096,
};
const structuralSelectors = [
	".react-code-file-contents",
	".react-line-numbers",
	".react-line-number",
	".react-code-lines",
	".react-code-line-contents",
	".react-code-line-contents > div",
	".react-file-line",
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function native(source: string) {
	const tree = parseHtmlDocument(source, url, { limits });
	trees.push(tree);
	return tree;
}

function reader(source: string, visibilityPolicy?: "source-hidden-v1") {
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
			tabId: "github-source-lines",
			signal: new AbortController().signal,
			limits,
		},
		undefined,
		undefined,
		visibilityPolicy,
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

function gutter(labels: string[]) {
	return `<div class="react-line-numbers">${labels
		.map(
			(label) =>
				`<div class="react-line-number react-code-text">${label}</div>`,
		)
		.join("")}</div>`;
}

function rows(lines: string[]) {
	return `<div class="react-code-lines">${lines
		.map(
			(line, index) =>
				`<div class="react-code-text react-code-line-contents"><div><div class="react-file-line" id="LC${index + 1}">${line}</div></div></div>`,
		)
		.join("")}</div>`;
}

function github(
	lines: string[],
	labels = lines.map((_, index) => `${index + 1}`),
) {
	return `<div class="react-code-file-contents">${gutter(labels)}${rows(lines)}</div>`;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function text(node: ExtractedNode) {
	return flattened(node)
		.map((entry) => entry.text ?? "")
		.join("");
}

function structured(tree: DocumentTree, options: ExtractionOptions = {}) {
	const result = extractDocument(tree, { ...options, format: "json" });
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return result;
}

function sourceBlocks(
	result: unknown,
	lines: number,
	gutterLabels = lines,
	blocks = 1,
) {
	if (blocks === 0) expect(result).not.toHaveProperty("sourceCodeBlocks");
	else
		expect(result).toHaveProperty("sourceCodeBlocks", {
			kind: "github-ssr-lines-v1",
			blocks,
			lines,
			gutterLabels,
			lineEndings: "inferred-lf",
			terminalNewline: "unknown",
		});
}

function declined(tree: DocumentTree, retained = "sentinel") {
	for (const format of formats) {
		const result = extractDocument(tree, { format });
		sourceBlocks(result, 0, 0, 0);
		if (result.format === "json") {
			expect(text(result.content)).toContain(retained);
			expect(
				flattened(result.content).filter((node) => node.type === "pre"),
			).toEqual([]);
		} else {
			expect(result.content).toContain(retained);
			expect(result.content).not.toContain("```");
		}
	}
}

function sourceNodes(tree: DocumentTree, root: number) {
	const entries: { id: number; depth: number }[] = [];
	const pending = [{ id: root, depth: 0 }];
	while (pending.length) {
		const entry = pending.pop();
		if (!entry) break;
		entries.push(entry);
		for (const id of tree.get(entry.id).children)
			pending.push({ id, depth: entry.depth + 1 });
	}
	return entries;
}

it.each(["native", "reader"] as const)(
	"preserves exact source rows, entities, indentation and safe fences through %s",
	(mode) => {
		const tree = (mode === "native" ? native : reader)(
			github([
				"<span>def <span>example</span>():</span>",
				"\t<span>return</span> &quot;&lt;&amp;&gt; 雪🦀 e\u0301&quot;  ",
				"\n",
				"  ```backticks````",
				"123456",
			]),
		);
		const expected =
			'def example():\n\treturn "<&> 雪🦀 e\u0301"  \n\n  ```backticks````\n123456';
		const result = structured(tree);
		const blocks = flattened(result.content).filter(
			(node) => node.type === "pre",
		);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].ref).toBe(
			tree.reference(element(tree, ".react-code-file-contents")),
		);
		expect(text(result.content)).toBe(expected);
		expect(blocks[0].children?.map((node) => node.type)).toEqual(
			Array(5).fill("text"),
		);
		expect(blocks[0].children?.map((node) => node.ref)).toEqual(
			Array.from({ length: 5 }, (_, index) =>
				tree.reference(element(tree, `#LC${index + 1}`)),
			),
		);
		const omitted = sourceNodes(tree, element(tree, ".react-line-numbers")).map(
			({ id }) => tree.reference(id),
		);
		for (const ref of omitted)
			expect(flattened(result.content).map((node) => node.ref)).not.toContain(
				ref,
			);
		sourceBlocks(result, 5);
		const markdown = extractDocument(tree);
		expect(markdown.content).toBe(`\`\`\`\`\`\n${expected}\n\`\`\`\`\`\n`);
		sourceBlocks(markdown, 5);
	},
);

it.each([
	[["123"], "123"],
	[["\n"], ""],
	[["first", "\n"], "first\n"],
	[["\n", "\n", "last"], "\n\nlast"],
	[["  \t  "], "  \t  "],
] as const)(
	"joins rows %j without inventing a terminal newline",
	(lines, expected) => {
		for (const load of [native, reader]) {
			const tree = load(github([...lines]));
			const result = structured(tree);
			expect(text(result.content)).toBe(expected);
			sourceBlocks(result, lines.length);
		}
	},
);

it("retains existing reader id/class attributes without requiring new attributes", () => {
	const tree = reader(github(["sentinel"]));
	for (const selector of structuralSelectors) {
		const node = tree.get(element(tree, selector));
		for (const name of Object.keys(node.attributes))
			expect(["id", "class"]).toContain(name);
	}
	expect(tree.get(element(tree, "#LC1")).attributes).toMatchObject({
		id: "LC1",
		class: "react-file-line",
	});
	sourceBlocks(structured(tree), 1);
});

it("accepts class tokens with extra classes, reordered tokens and ASCII whitespace", () => {
	const source = github(["sentinel"])
		.replace(
			'class="react-code-file-contents"',
			'class="extra\treact-code-file-contents other"',
		)
		.replace(
			'class="react-line-number react-code-text"',
			'class="react-code-text\nextra react-line-number"',
		)
		.replace(
			'class="react-code-text react-code-line-contents"',
			'class="react-code-line-contents\freact-code-text"',
		);
	for (const load of [native, reader])
		sourceBlocks(structured(load(source)), 1);
});

it("aggregates multiple complete blocks without counting an ineligible sibling", () => {
	for (const load of [native, reader]) {
		const tree = load(
			`${github(["first", "\n"])}<p>between</p>${github(["second"])}${github(["ordinary"], ["9"])}`,
		);
		const result = structured(tree);
		expect(
			flattened(result.content)
				.filter((node) => node.type === "pre")
				.map(text),
		).toEqual(["first\n", "second"]);
		expect(text(result.content)).toContain("between");
		expect(text(result.content)).toContain("9ordinary");
		for (const format of formats)
			sourceBlocks(extractDocument(tree, { format }), 3, 3, 2);
	}
});

it("supports explicit file and code-lines roots but leaves line and gutter roots ordinary", () => {
	for (const load of [native, reader]) {
		const tree = load(`<p>outside</p>${github(["alpha", "beta"])}`);
		for (const selector of [".react-code-file-contents", ".react-code-lines"]) {
			const root = tree.reference(element(tree, selector));
			for (const format of formats) {
				const result = extractDocument(tree, { root, format });
				expect(result.scope).toBe(root);
				sourceBlocks(result, 2, selector === ".react-code-lines" ? 0 : 2);
				if (result.format === "json") {
					expect(result.content).toMatchObject({ type: "pre", ref: root });
					expect(text(result.content)).toBe("alpha\nbeta");
				} else expect(result.content).toBe("```\nalpha\nbeta\n```\n");
			}
		}
		for (const [selector, expected] of [
			["#LC1", "alpha"],
			[".react-code-line-contents", "alpha"],
			[".react-line-number", "1"],
			[".react-line-numbers", "12"],
		]) {
			const root = tree.reference(element(tree, selector));
			for (const format of formats) {
				const result = extractDocument(tree, { root, format });
				sourceBlocks(result, 0, 0, 0);
				if (result.format === "json") {
					expect(result.content.ref).toBe(root);
					expect(text(result.content)).toBe(expected);
					expect(
						flattened(result.content).some((node) => node.type === "pre"),
					).toBe(false);
				} else expect(result.content).not.toContain("```");
			}
		}
	}
});

const valid = github(["sentinel", "tail"]);

it.each([
	[
		"missing file class",
		valid.replace("react-code-file-contents", "ordinary-file"),
	],
	[
		"substring file class",
		valid.replace("react-code-file-contents", "not-react-code-file-contents"),
	],
	[
		"case-sensitive file class",
		valid.replace("react-code-file-contents", "React-code-file-contents"),
	],
	[
		"missing gutter class",
		valid.replace("react-line-numbers", "ordinary-gutter"),
	],
	[
		"missing number class",
		valid.replace("react-line-number react-code-text", "react-code-text"),
	],
	[
		"missing gutter text class",
		valid.replace("react-line-number react-code-text", "react-line-number"),
	],
	["missing lines class", valid.replace("react-code-lines", "ordinary-lines")],
	[
		"missing row class",
		valid.replace(
			"react-code-text react-code-line-contents",
			"react-code-text",
		),
	],
	[
		"missing row text class",
		valid.replace(
			"react-code-text react-code-line-contents",
			"react-code-line-contents",
		),
	],
	["missing cell class", valid.replace("react-file-line", "ordinary-cell")],
	["missing id", valid.replace(' id="LC1"', "")],
	["duplicate id", valid.replace('id="LC2"', 'id="LC1"')],
	[
		"misordered ids",
		valid
			.replace('id="LC1"', 'id="LC2"')
			.replace('id="LC2">tail', 'id="LC1">tail'),
	],
	["leading-zero id", valid.replace('id="LC1"', 'id="LC01"')],
	["wrong-case id", valid.replace('id="LC1"', 'id="lc1"')],
	["missing gutter row", github(["sentinel", "tail"], ["1"])],
	["extra gutter row", github(["sentinel"], ["1", "2"])],
	["wrong gutter label", github(["sentinel", "tail"], ["1", "3"])],
	["padded gutter label", github(["sentinel"], [" 1 "])],
	["nested gutter label", github(["sentinel"], ["<span>1</span>"])],
	["extra gutter text", github(["sentinel"], ["1<span>extra</span>"])],
	[
		"reordered branches",
		`<div class="react-code-file-contents">${rows(["sentinel"])}${gutter(["1"])}</div>`,
	],
	[
		"extra visible branch",
		valid.replace(gutter(["1", "2"]), `${gutter(["1", "2"])}<div>extra</div>`),
	],
	[
		"extra visible root text",
		valid.replace(gutter(["1", "2"]), `extra${gutter(["1", "2"])}`),
	],
	[
		"extra wrapper sibling",
		valid.replace(
			'<div><div class="react-file-line"',
			'<div>extra</div><div><div class="react-file-line"',
		),
	],
	[
		"extra cell sibling",
		valid.replace(
			'<div class="react-file-line"',
			'<div>extra</div><div class="react-file-line"',
		),
	],
	[
		"missing wrapper",
		github(["sentinel"])
			.replace(
				'<div><div class="react-file-line"',
				'<div class="react-file-line"',
			)
			.replace("</div></div></div></div></div>", "</div></div></div></div>"),
	],
	["non-span descendant", github(["sentinel<strong>tail</strong>"])],
	["link descendant", github(['sentinel<a href="/next">tail</a>'])],
	["break descendant", github(["sentinel<br>tail"])],
	["embedded LF", github(["sentinel\ntail"])],
	["double LF placeholder", github(["sentinel", "\n\n"])],
	["embedded encoded CR", github(["sentinel&#13;tail"])],
	["zero lines", `<p>sentinel</p>${github([])}`],
])("declines the complete block for %s", (_label, source) => {
	for (const load of [native, reader]) declined(load(source));
});

it.each(structuralSelectors)(
	"requires a div for structural element %s",
	(selector) => {
		const tree = native(github(["sentinel"]));
		const id = element(tree, selector);
		const node = tree.get(id);
		if (node.parent === null)
			throw new Error("Expected attached fixture element");
		const replacement = tree.createElement("span", { ...node.attributes });
		tree.insert(node.parent, replacement, id);
		for (const child of node.children) tree.append(replacement, child);
		tree.remove(id);
		declined(tree);
	},
);

it("rejects split gutter text nodes even when their combined text is correct", () => {
	const tree = native(github(["sentinel"]));
	const label = element(tree, ".react-line-number");
	tree.append(label, tree.createText(""));
	expect(tree.get(label).children).toHaveLength(2);
	declined(tree);
});

it.each(["native", "reader"] as const)(
	"accepts one empty trailing gutter decoration through %s",
	(mode) => {
		const source = github(["sentinel", "  123"]).replace(
			">1</div>",
			'>1<span class="code-alert"></span></div>',
		);
		const tree = (mode === "native" ? native : reader)(source);
		const result = structured(tree);
		sourceBlocks(result, 2);
		expect(text(result.content)).toBe("sentinel\n  123");
		expect(extractDocument(tree).content).toBe("```\nsentinel\n  123\n```\n");
	},
);

it.each([
	"<span>extra</span>",
	"<span><span></span></span>",
	"<span></span><span></span>",
	"<button></button>",
	"<svg></svg>",
])("retains gutters containing unsupported decoration %s", (decoration) => {
	const tree = native(
		github(["sentinel"]).replace(">1</div>", `>1${decoration}</div>`),
	);
	declined(tree);
});

it.each(structuralSelectors)(
	"declines an over-budget class value on %s",
	(selector) => {
		const tree = native(github(["sentinel"]));
		const id = element(tree, selector);
		const current = tree.get(id).attributes.class ?? "";
		tree.setAttribute(
			id,
			"class",
			`${current} ${"x".repeat(1024 - current.length)}`,
		);
		expect(tree.get(id).attributes.class).toHaveLength(1025);
		declined(tree);
	},
);

it.each(["http://www.w3.org/2000/svg", "http://www.w3.org/1998/Math/MathML"])(
	"declines foreign namespace %s on every required element and nested span",
	(namespace) => {
		for (const selector of [...structuralSelectors, "#LC1 span"]) {
			const tree = native(github(["<span>sentinel</span>"]));
			const id = element(tree, selector);
			const node = tree.get(id);
			if (node.parent === null)
				throw new Error("Expected attached fixture element");
			const replacement = tree.createParserElement(
				node.tagName,
				{ ...node.attributes },
				namespace,
			);
			tree.insert(node.parent, replacement, id);
			for (const child of node.children) tree.append(replacement, child);
			tree.remove(id);
			declined(tree);
		}
	},
);

it.each([
	"hidden",
	'aria-hidden="true"',
	'style="display:none"',
	'style="visibility:hidden"',
])(
	"does not bypass native %s on required elements or descendants",
	(attribute) => {
		for (const selector of [...structuralSelectors, "#LC1 span"]) {
			const tree = native(
				`<p>outside</p>${github(["<span>secret</span>", "public"])}`,
			);
			const id = element(tree, selector);
			const separator = attribute.indexOf("=");
			const name = separator === -1 ? attribute : attribute.slice(0, separator);
			const value = separator === -1 ? "" : attribute.slice(separator + 2, -1);
			tree.setAttribute(id, name, value);
			for (const format of formats) {
				const result = extractDocument(tree, { format });
				sourceBlocks(result, 0, 0, 0);
				const content =
					result.format === "json" ? text(result.content) : result.content;
				expect(content).toContain("outside");
				if (!selector.startsWith(".react-line-number"))
					expect(content).not.toContain("secret");
			}
		}
	},
);

it("keeps reader source completeness separate from explicit source visibility", () => {
	for (const target of [
		"react-code-file-contents",
		"react-code-lines",
		"react-file-line",
	]) {
		const source = `<p>outside</p>${github(["secret", "public"]).replace(`class="${target}"`, `class="${target}" aria-hidden="true"`)}`;
		for (const format of formats) {
			const complete = extractDocument(reader(source), { format });
			sourceBlocks(complete, 2);
			expect(
				complete.format === "json" ? text(complete.content) : complete.content,
			).toContain("secret");
			const visible = extractDocument(reader(source, "source-hidden-v1"), {
				format,
			});
			sourceBlocks(visible, 0, 0, 0);
			const content =
				visible.format === "json" ? text(visible.content) : visible.content;
			expect(content).not.toContain("secret");
			expect(content).toContain("outside");
		}
	}
});

it("declines excessive span depth without hiding ordinary content", () => {
	const tree = native(
		github([`${"<span>".repeat(130)}sentinel${"</span>".repeat(130)}`]),
	);
	declined(tree);
});

it.each(["native", "reader"] as const)(
	"excludes structural whitespace at every level through %s",
	(mode) => {
		const source = github(["alpha", "  beta", ""])
			.replaceAll("</div><div", "</div>\n  <div")
			.replaceAll("</div></div>", "</div>\n\t</div>");
		const tree = (mode === "native" ? native : reader)(source);
		for (const selector of [".react-code-file-contents", ".react-code-lines"]) {
			const root = tree.reference(element(tree, selector));
			const result = structured(tree, { root });
			sourceBlocks(result, 3, selector === ".react-code-lines" ? 0 : 3);
			expect(text(result.content)).toBe("alpha\n  beta\n");
			expect(extractDocument(tree, { root }).content).toBe(
				"```\nalpha\n  beta\n```\n",
			);
		}
	},
);

it("bounds inspected structural whitespace before classifying it", () => {
	const source = github(["sentinel"]).replace(
		'<div class="react-code-lines">',
		`<div class="react-code-lines">${" ".repeat(1_000_001)}`,
	);
	const tree = parseHtmlDocument(source, url, {
		limits: { ...limits, maxTextCodeUnits: 1_100_000 },
	});
	trees.push(tree);
	const result = extractDocument(tree);
	sourceBlocks(result, 0, 0, 0);
	expect(result.content).toContain("sentinel");
	expect(() => structured(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("leaves DOM snapshots, resources, revisions and every existing ref unchanged", () => {
	const tree = native(github(["<span>sentinel</span>", "\n", "123"]));
	const ids = sourceNodes(tree, tree.root).map(({ id }) => id);
	const before = JSON.stringify(ids.map((id) => tree.get(id)));
	const references = ids.map((id) => tree.reference(id));
	const revision = tree.revision;
	const usage = tree.resourceUsage();
	for (const format of formats)
		sourceBlocks(extractDocument(tree, { format }), 3);
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

it("rechecks live text, IDs, classes, visibility, gutter labels and row order", () => {
	const tree = native(github(["sentinel", "tail"]));
	const file = element(tree, ".react-code-file-contents");
	const lines = element(tree, ".react-code-lines");
	const cell = element(tree, "#LC1");
	const label = element(tree, ".react-line-number");
	const ref = tree.reference(cell);
	const check = (recognized: boolean) => {
		for (const format of formats) {
			const result = extractDocument(tree, { format });
			sourceBlocks(
				result,
				recognized ? 2 : 0,
				recognized ? 2 : 0,
				recognized ? 1 : 0,
			);
			expect(result.revision).toBe(tree.revision);
		}
		expect(tree.resolve(ref).id).toBe(cell);
		if (recognized)
			expect(
				flattened(structured(tree).content)
					.filter((node) => node.type === "text")
					.map((node) => node.ref),
			).toContain(ref);
	};
	check(true);
	tree.setTextContent(cell, "  updated\t雪");
	check(true);
	expect(text(structured(tree).content)).toBe("  updated\t雪\ntail");
	tree.setTextContent(cell, "embedded\nnewline");
	check(false);
	tree.setTextContent(cell, "sentinel");
	check(true);
	tree.setTextContent(cell, "embedded\rcarriage");
	check(false);
	tree.setTextContent(cell, "sentinel");
	check(true);
	tree.setAttribute(cell, "id", "LC2");
	check(false);
	tree.setAttribute(cell, "id", "LC1");
	check(true);
	tree.setAttribute(file, "class", "ordinary");
	check(false);
	tree.setAttribute(file, "class", "react-code-file-contents");
	check(true);
	tree.setAttribute(cell, "hidden", "");
	check(false);
	tree.removeAttribute(cell, "hidden");
	check(true);
	tree.setTextContent(label, "9");
	check(false);
	tree.setTextContent(label, "1");
	check(true);
	const firstRow = tree.get(lines).children[0];
	const secondRow = tree.get(lines).children[1];
	tree.append(lines, firstRow);
	check(false);
	tree.insert(lines, firstRow, secondRow);
	check(true);
});

it.each(formats)(
	"charges original source nodes, depth and UTF-8 output bytes in %s",
	(format) => {
		const tree = native(
			github(["<span><span>雪🦀</span></span>", "\n"]).replace(
				">1</div>",
				">1<span></span></div>",
			),
		);
		for (const selector of [".react-code-file-contents", ".react-code-lines"]) {
			const id = element(tree, selector);
			const entries = sourceNodes(tree, id);
			const maxNodes = entries.length;
			const maxDepth = Math.max(...entries.map((entry) => entry.depth));
			const options = { root: tree.reference(id), format, maxNodes, maxDepth };
			const result = extractDocument(tree, options);
			sourceBlocks(result, 2, selector === ".react-code-lines" ? 0 : 2);
			for (const tooFew of [maxNodes - 1, maxNodes - 5])
				expect(() =>
					extractDocument(tree, { ...options, maxNodes: tooFew }),
				).toThrow(expect.objectContaining({ code: "resource-limit" }));
			expect(() =>
				extractDocument(tree, { ...options, maxDepth: maxDepth - 1 }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
			const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
			expect(extractDocument(tree, { ...options, maxBytes: bytes })).toEqual(
				result,
			);
			expect(() =>
				extractDocument(tree, { ...options, maxBytes: bytes - 1 }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
		}
	},
);
