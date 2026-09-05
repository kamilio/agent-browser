import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { type ExtractionOptions, extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkResponse } from "./network.js";
import { loadResearchDocument } from "./research-loader.js";
import type { DocumentLoaderContext } from "./session.js";
import { textDocumentInfo } from "./text-document-info.js";
import { loadTextDocument } from "./text-loader.js";

function response(source: string, mime = "text/plain"): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: "https://example.com/text",
		headers: { "content-type": [mime] },
		status: 200,
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 1,
	};
}

function context(maxTextCodeUnits = 2_000_000): DocumentLoaderContext {
	return {
		signal: new AbortController().signal,
		tabId: "tab-1",
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits,
			maxChanges: 1024,
		},
	};
}

function selected(tree: DocumentTree, start: number, end: number) {
	const result = extractDocument(tree, {
		format: "json",
		lines: { start, end },
	});
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	const text = result.content.children?.[0]?.children?.[0];
	expect(text?.type).toBe("text");
	return { result, text };
}

it.each([
	"text/plain",
	"TEXT/PLAIN; charset=UTF-8",
	"application/json",
	"application/problem+json",
])("selects literal lines from loader-created %s documents", (mime) => {
	const source = '<script>literal</script>\r\n{"value": 1}\nlast';
	const tree = loadTextDocument(response(source, mime), context());
	try {
		const { result, text } = selected(tree, 2, 2);
		expect(text?.text).toBe('{"value": 1}\n');
		expect(result.textSelection).toEqual({
			method: "text-lines",
			start: 2,
			end: 2,
			totalLines: 3,
			sourceCodeUnits: source.length,
			selectedCodeUnits: '{"value": 1}\n'.length,
		});
		expect(result.document).toBe(tree.reference(tree.root));
		expect(result.scope).toBe(result.document);
		expect(result.revision).toBe(tree.revision);
		expect(result.partial).toBe(true);
		expect(tree.resolve(text?.ref ?? "").data).toBe(source);
		expect(extractDocument(tree)).not.toHaveProperty("textSelection");
	} finally {
		tree.close();
	}
});

it.each([
	{ source: "", start: 1, end: 1, total: 1, raw: "" },
	{ source: "one", start: 1, end: 1, total: 1, raw: "one" },
	{ source: "one\n", start: 1, end: 1, total: 2, raw: "one\n" },
	{ source: "one\n", start: 2, end: 2, total: 2, raw: "" },
	{ source: "one\r", start: 2, end: 2, total: 2, raw: "" },
	{ source: "one\r\n", start: 1, end: 2, total: 2, raw: "one\r\n" },
	{ source: "one\r\n", start: 2, end: 2, total: 2, raw: "" },
	{ source: "\r\n", start: 1, end: 1, total: 2, raw: "\r\n" },
	{ source: "\r\r\n\n", start: 2, end: 3, total: 4, raw: "\r\n\n" },
	{ source: "a\r\nb\rc\nlast", start: 2, end: 3, total: 4, raw: "b\rc\n" },
	{ source: "a\r\nb\rc\nlast", start: 4, end: 4, total: 4, raw: "last" },
	{ source: "\n\r", start: 1, end: 3, total: 3, raw: "\n\r" },
])("counts delimiters and empty lines: $source [$start, $end]", (entry) => {
	const tree = loadTextDocument(response(entry.source), context());
	const expected = loadTextDocument(response(entry.raw), context());
	try {
		const { result, text } = selected(tree, entry.start, entry.end);
		expect(text?.text).toBe(entry.raw.replace(/\r\n?/g, "\n"));
		expect(result.textSelection).toEqual({
			method: "text-lines",
			start: entry.start,
			end: entry.end,
			totalLines: entry.total,
			sourceCodeUnits: entry.source.length,
			selectedCodeUnits: entry.raw.length,
		});
		expect(
			extractDocument(tree, {
				lines: { start: entry.start, end: entry.end },
			}).content,
		).toBe(extractDocument(expected).content);
	} finally {
		tree.close();
		expected.close();
	}
});

it("counts UTF-16 before cleaning controls and preserves existing Markdown fences", () => {
	const raw = "😀e\u0301界\u2028\u2029\x1b\u202e```\r\n";
	const source = `skip\r\n${raw}last`;
	const tree = loadTextDocument(response(source), context());
	const expected = loadTextDocument(response(raw), context());
	try {
		const { result, text } = selected(tree, 2, 2);
		expect(text?.text).toBe("😀e\u0301界\u2028\u2029\\u{1b}\\u{202e}```\n");
		expect(result.textSelection).toMatchObject({
			totalLines: 3,
			sourceCodeUnits: source.length,
			selectedCodeUnits: raw.length,
		});
		expect(extractDocument(tree, { lines: { start: 2, end: 2 } }).content).toBe(
			extractDocument(expected).content,
		);
	} finally {
		tree.close();
		expected.close();
	}
});

it.each(
	[
		null,
		[],
		Object.assign([], { start: 1, end: 1 }),
		{},
		"1:2",
		{ start: 1 },
		{ end: 1 },
		{ start: "1", end: 1 },
		{ start: 1, end: "1" },
		{ start: 0, end: 1 },
		{ start: -1, end: 1 },
		{ start: 2, end: 1 },
		{ start: 1.5, end: 2 },
		{ start: 1, end: 1.5 },
		{ start: Number.NaN, end: 1 },
		{ start: 1, end: Number.POSITIVE_INFINITY },
		{ start: 1, end: 2_000_002 },
		{ start: 1, end: Number.MAX_SAFE_INTEGER + 1 },
	].map((lines) => ({ lines })),
)("rejects invalid line options %j", ({ lines }) => {
	const tree = loadTextDocument(response("one\ntwo"), context());
	try {
		expect(() =>
			extractDocument(tree, { lines: lines as ExtractionOptions["lines"] }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	} finally {
		tree.close();
	}
});

it.each([
	{ start: 1, end: 3 },
	{ start: 3, end: 3 },
	{ start: 1, end: 2_000_001 },
	{ start: 2_000_001, end: 2_000_001 },
])("rejects missing lines without clamping: %j", (lines) => {
	const tree = loadTextDocument(response("one\n"), context());
	try {
		expect(() => extractDocument(tree, { lines })).toThrow(
			expect.objectContaining({ code: "not-found" }),
		);
	} finally {
		tree.close();
	}
});

it("rejects missing lines in empty sources and rejects root before resolving it", () => {
	const tree = loadTextDocument(response(""), context());
	try {
		expect(() => selected(tree, 2, 2)).toThrow(
			expect.objectContaining({ code: "not-found" }),
		);
		for (const root of [tree.reference(tree.root), "invalid-reference"])
			expect(() =>
				extractDocument(tree, { root, lines: { start: 1, end: 1 } }),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
	} finally {
		tree.close();
	}
});

it("does not infer text eligibility from HTML or a synthetic pre tree", () => {
	const html = parseHtmlDocument(
		'<pre>{"value": 1}\nplain text</pre>',
		"https://example.com/text",
	);
	const synthetic = new DocumentTree("https://example.com/text");
	try {
		const pre = synthetic.createElement("pre");
		synthetic.append(synthetic.root, pre);
		synthetic.append(pre, synthetic.createText("plain\ntext"));
		for (const tree of [html, synthetic]) {
			expect(textDocumentInfo(tree)).toBeUndefined();
			expect(() => selected(tree, 1, 1)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
		}
	} finally {
		html.close();
		synthetic.close();
	}
});

it.each([
	"text",
	"restored",
	"attribute",
	"restored attribute",
	"replacement",
	"restored structure",
])("rejects changed loader documents after %s mutations", (change) => {
	const tree = loadTextDocument(response("one\ntwo"), context());
	try {
		const pre = tree.get(tree.root).children[0];
		const text = tree.get(pre).children[0];
		if (change === "attribute" || change === "restored attribute") {
			tree.setAttribute(pre, "title", "changed");
			if (change === "restored attribute") tree.removeAttribute(pre, "title");
		} else if (change === "restored structure") {
			const extra = tree.createText("unrelated");
			tree.append(pre, extra);
			tree.remove(extra);
		} else if (change === "replacement") tree.setTextContent(pre, "one\ntwo");
		else {
			tree.setData(text, "changed");
			if (change === "restored") tree.setData(text, "one\ntwo");
		}
		expect(() => selected(tree, 1, 1)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	} finally {
		tree.close();
	}
});

it("removes registration on close and never falls back to captured source", () => {
	const tree = loadTextDocument(response("one\ntwo"), context());
	expect(textDocumentInfo(tree)).toBeDefined();
	tree.close();
	expect(textDocumentInfo(tree)).toBeUndefined();
	expect(() => selected(tree, 1, 1)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("does not register an incomplete loader tree or relax loader limits", () => {
	let initialized: DocumentTree | undefined;
	expect(() =>
		loadTextDocument(response("one\ntwo"), {
			...context(9),
			initializeDocument: (tree) => {
				initialized = tree;
			},
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	if (!initialized) throw new Error("Expected loader initialization");
	const failed = initialized;
	expect(textDocumentInfo(failed)).toBeUndefined();
	expect(() => failed.get(failed.root)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it.each(["text/plain", "application/json", "application/problem+json"])(
	"retains eligibility and reader metadata through the research loader for %s",
	(mime) => {
		const tree = loadResearchDocument(response("one\ntwo", mime), context());
		try {
			const { result, text } = selected(tree, 2, 2);
			expect(text?.text).toBe("two");
			expect(result.reader).toMatchObject({
				partial: true,
				sourceCodeUnits: 7,
				textCodeUnits: 7,
			});
			expect(textDocumentInfo(tree)?.revision).toBe(tree.revision);
		} finally {
			tree.close();
		}
	},
);

it("selects without mutating text, references, revision, or change notifications", () => {
	const tree = loadTextDocument(response("one\r\ntwo\rthree\n"), context());
	try {
		const info = textDocumentInfo(tree);
		if (!info) throw new Error("Missing text registration");
		const node = tree.get(info.textNode);
		const reference = tree.reference(node.id);
		const changes = tree.changesSince(0);
		let notifications = 0;
		tree.onChange(() => notifications++);
		tree.onMutation(() => notifications++);
		for (const format of ["json", "markdown"] as const)
			extractDocument(tree, { format, lines: { start: 2, end: 3 } });
		expect(selected(tree, 1, 1).text?.text).toBe("one\n");
		expect(tree.get(node.id)).toBe(node);
		expect(tree.reference(node.id)).toBe(reference);
		expect(tree.revision).toBe(info.revision);
		expect(tree.changesSince(0)).toEqual(changes);
		expect(textDocumentInfo(tree)).toBe(info);
		expect(notifications).toBe(0);
	} finally {
		tree.close();
	}
});

it("rejects unrelated initializer text rather than presenting it as a selected line", () => {
	const tree = loadTextDocument(response("one\ntwo"), {
		...context(),
		initializeDocument: (document) => {
			const paragraph = document.createElement("p");
			document.append(document.root, paragraph);
			document.append(paragraph, document.createText("keep this"));
		},
	});
	try {
		expect(textDocumentInfo(tree)?.revision).toBe(tree.revision);
		for (const format of ["markdown", "json"] as const)
			expect(() =>
				extractDocument(tree, { format, lines: { start: 2, end: 2 } }),
			).toThrow(expect.objectContaining({ code: "unsupported" }));
		expect(extractDocument(tree).content).toContain("keep this");
	} finally {
		tree.close();
	}
});

it.each(["pre sibling", "wrapper"])(
	"rejects a nonnative loader shape from initializer callbacks: %s",
	(shape) => {
		const tree = loadTextDocument(response("one\ntwo"), {
			...context(),
			initializeDocument: (document) => {
				document.onChange((change) => {
					if (change.kind !== "insert") return;
					const node = document.get(change.target);
					if (node.tagName !== "pre" || node.parent !== document.root) return;
					if (shape === "pre sibling")
						document.append(node.id, document.createText("unrelated"));
					else {
						const wrapper = document.createElement("div");
						document.append(document.root, wrapper);
						document.append(wrapper, node.id);
					}
				});
			},
		});
		try {
			expect(textDocumentInfo(tree)?.revision).toBe(tree.revision);
			expect(() => selected(tree, 2, 2)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
		} finally {
			tree.close();
		}
	},
);

it.each(["markdown", "json"] as const)(
	"counts selection metadata in exact serialized UTF-8 %s output budgets",
	(format) => {
		const tree = loadTextDocument(
			response(`skip\n${"😀界".repeat(30)}\r\n`),
			context(),
		);
		try {
			const options = { format, lines: { start: 2, end: 2 } };
			const result = extractDocument(tree, options);
			const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
			expect(extractDocument(tree, { ...options, maxBytes: bytes })).toEqual(
				result,
			);
			expect(() =>
				extractDocument(tree, { ...options, maxBytes: bytes - 1 }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
			const { textSelection, ...withoutSelection } = result;
			expect(textSelection).toBeDefined();
			const withoutBytes = new TextEncoder().encode(
				JSON.stringify(withoutSelection),
			).length;
			expect(() =>
				extractDocument(tree, { ...options, maxBytes: withoutBytes }),
			).toThrow(expect.objectContaining({ code: "resource-limit" }));
			for (const limits of [
				{ maxNodes: 2 },
				{ maxDepth: 1 },
				{ maxBytes: 256 },
			])
				expect(() => extractDocument(tree, { ...options, ...limits })).toThrow(
					expect.objectContaining({ code: "resource-limit" }),
				);
		} finally {
			tree.close();
		}
	},
);

it.each([
	{ source: `${"x".repeat(300_000)}\nsmall\n`, message: /output limit/i },
	{
		source: `${"\x1b".repeat(800_000)}\nsmall\n`,
		message: /intermediate limit/i,
	},
])(
	"fits a small range when full extraction exceeds $message",
	({ source, message }) => {
		const tree = loadTextDocument(response(source), context());
		try {
			for (const format of ["markdown", "json"] as const) {
				expect(() => extractDocument(tree, { format })).toThrow(message);
				const result = extractDocument(tree, {
					format,
					lines: { start: 2, end: 2 },
					maxBytes: 1024,
				});
				expect(result.textSelection).toMatchObject({
					totalLines: 3,
					sourceCodeUnits: source.length,
					selectedCodeUnits: 6,
				});
			}
			expect(selected(tree, 2, 2).text?.text).toBe("small\n");
		} finally {
			tree.close();
		}
	},
);

it("preserves the intermediate budget for selected text after control escaping", () => {
	const tree = loadTextDocument(response("\x1b".repeat(800_000)), context());
	try {
		expect(() => selected(tree, 1, 1)).toThrow(
			"Extraction intermediate limit exceeded",
		);
	} finally {
		tree.close();
	}
});

it("accepts the exact scan and line ceilings without allocating a line table", () => {
	const tree = loadTextDocument(
		response("\n".repeat(2_000_000)),
		context(2_000_100),
	);
	try {
		const { result, text } = selected(tree, 2_000_001, 2_000_001);
		expect(text?.text).toBe("");
		expect(result.textSelection).toEqual({
			method: "text-lines",
			start: 2_000_001,
			end: 2_000_001,
			totalLines: 2_000_001,
			sourceCodeUnits: 2_000_000,
			selectedCodeUnits: 0,
		});
	} finally {
		tree.close();
	}
});

it("rejects a source beyond the fixed scan budget even for a tiny first line", () => {
	const tree = loadTextDocument(
		response(`\n${"x".repeat(2_000_000)}`),
		context(2_000_100),
	);
	try {
		expect(() => selected(tree, 1, 1)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	} finally {
		tree.close();
	}
});
