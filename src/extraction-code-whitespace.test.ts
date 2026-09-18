import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument } from "./research-loader.js";

const trees: DocumentTree[] = [];
const url = "https://code-whitespace.fixture.invalid/article";
const cases = [
	{ name: "tab", source: " \t ", expected: "`  \t  `\n" },
	{ name: "nonbreaking space", source: " \u00a0 ", expected: "`  \u00a0  `\n" },
	{ name: "em space", source: " \u2003 ", expected: "`  \u2003  `\n" },
	{
		name: "narrow nonbreaking space",
		source: " \u202f ",
		expected: "`  \u202f  `\n",
	},
	{ name: "ideographic space", source: " \u3000 ", expected: "`  \u3000  `\n" },
	{
		name: "several edge spaces",
		source: "   \t   ",
		expected: "`    \t    `\n",
	},
	{
		name: "mixed whitespace",
		source: " \t\u00a0\u2003 ",
		expected: "`  \t\u00a0\u2003  `\n",
	},
	{ name: "single ASCII space", source: " ", expected: "` `\n" },
	{ name: "only ASCII spaces", source: "   ", expected: "`   `\n" },
	{ name: "ordinary text", source: " text ", expected: "`  text  `\n" },
	{ name: "backticks", source: " `text` ", expected: "``  `text`  ``\n" },
	{ name: "line endings", source: "\n\t\n", expected: "`  \t  `\n" },
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function codeSpanText(markdown: string): string {
	const match = /^(`+)([\s\S]*?)\1\n$/.exec(markdown);
	if (!match) throw new Error("Expected one complete code span");
	const text = match[2].replace(/\r\n?|\n/g, " ");
	return text.startsWith(" ") && text.endsWith(" ") && !/^ *$/.test(text)
		? text.slice(1, -1)
		: text;
}

it.each(cases)(
	"preserves inline code containing $name",
	({ source, expected }) => {
		const tree = parseHtmlDocument(`<p><code>${source}</code></p>`, url);
		trees.push(tree);
		const result = extractDocument(tree);
		expect(result.content).toBe(expected);
		if (typeof result.content !== "string")
			throw new Error("Expected Markdown");
		expect(codeSpanText(result.content)).toBe(source.replace(/\n/g, " "));
	},
);

it.each(cases)(
	"retains $name through the research reader",
	async ({ source, expected }) => {
		const body = new TextEncoder().encode(`<p><code>${source}</code></p>`);
		const tree = await loadResearchDocument(
			{
				url,
				status: 200,
				headers: { "content-type": ["text/html; charset=utf-8"] },
				body,
				encodedBytes: body.length,
				redirects: [],
				elapsedMs: 0,
			},
			{
				tabId: "code-whitespace",
				signal: new AbortController().signal,
				limits: {
					maxNodes: 100,
					maxDepth: 16,
					maxTextCodeUnits: 1000,
					maxChanges: 100,
				},
			},
		);
		trees.push(tree);
		const result = extractDocument(tree);
		expect(result.content).toBe(expected);
		if (typeof result.content !== "string")
			throw new Error("Expected Markdown");
		expect(codeSpanText(result.content)).toBe(source.replace(/\n/g, " "));
	},
);
