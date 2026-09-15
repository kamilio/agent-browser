import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";

const trees: DocumentTree[] = [];
const url = "https://byte-accounting.fixture.invalid/article";
const encoder = new TextEncoder();

function fixture(text: string) {
	const tree = parseHtmlDocument(
		`<title>Byte accounting</title><nav>Menu</nav><main><h1>Article</h1><p>${text}</p></main>`,
		url,
	);
	trees.push(tree);
	return tree;
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

it.each(["markdown", "json"] as const)(
	"does not allocate UTF-8 arrays for ordinary %s byte accounting",
	(format) => {
		const tree = fixture("ASCII café 中文 😀 ".repeat(40));
		const options = { format, contentFocus: "main-content-v1" as const };
		const expected = extractDocument(tree, options);
		const revision = tree.revision;
		const usage = tree.resourceUsage();
		const encode = vi.spyOn(TextEncoder.prototype, "encode");
		expect(extractDocument(tree, options)).toEqual(expected);
		expect(encode).not.toHaveBeenCalled();
		expect(tree.revision).toBe(revision);
		expect(tree.resourceUsage()).toEqual(usage);
	},
);

it.each([
	"Plain ASCII",
	"café déjà vu",
	"中文 日本語 한국어",
	"😀 🧪 🚀",
	"\ud800 lone high \udfff lone low",
	'quotes " and slash \\ and controls \u0001 \u202e',
])("preserves exact serialized limits for %j", (text) => {
	const tree = fixture(text.repeat(40));
	for (const format of ["markdown", "json"] as const) {
		const expected = extractDocument(tree, { format });
		const bytes = encoder.encode(JSON.stringify(expected)).byteLength;
		expect(bytes).toBeGreaterThan(256);
		expect(extractDocument(tree, { format, maxBytes: bytes })).toEqual(
			expected,
		);
		expect(() =>
			extractDocument(tree, { format, maxBytes: bytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
});

it.each([false, true])(
	"retains exact Unicode table output limits with row lists %s",
	(tableRows) => {
		const tree = parseHtmlDocument(
			'<table><tr><th>名称</th><td>café 😀</td><td><a href="/more?a=1&amp;b=2">Details</a></td></tr></table>',
			url,
		);
		trees.push(tree);
		const expected = extractDocument(tree, { tableRows });
		const bytes = encoder.encode(JSON.stringify(expected)).byteLength;
		expect(extractDocument(tree, { tableRows, maxBytes: bytes })).toEqual(
			expected,
		);
		expect(() =>
			extractDocument(tree, { tableRows, maxBytes: bytes - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("keeps explicit prefix fallback inside the serialized byte cap", () => {
	const tree = fixture("Read 中文 😀 café. ".repeat(2000));
	const options = {
		maxBytes: 2048,
		outputLimitPolicy: "text-prefix-v1" as const,
	};
	const output = extractDocument(tree, options);
	expect(output).toHaveProperty("contentFallback");
	expect(encoder.encode(JSON.stringify(output)).byteLength).toBeLessThanOrEqual(
		options.maxBytes,
	);
	expect(() => extractDocument(tree, { maxBytes: options.maxBytes })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("retains structure limits even when byte accounting allocates no arrays", () => {
	const tree = fixture("Body".repeat(100));
	for (const limits of [{ maxNodes: 1 }, { maxDepth: 0 }])
		expect(() => extractDocument(tree, limits)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});
