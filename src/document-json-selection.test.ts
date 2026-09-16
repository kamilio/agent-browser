import { afterEach, describe, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	type DocumentExtraction,
	type ExtractedNode,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { loadTextDocument } from "./text-loader.js";

const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const url = "https://json-source.fixture.invalid/metadata";

function load(source: string, mime = "application/json") {
	const body = encoder.encode(source);
	const tree = loadTextDocument(
		{
			url,
			status: 200,
			headers: { "content-type": [mime] },
			body,
			encodedBytes: body.byteLength,
			redirects: [],
			elapsedMs: 0,
		},
		{
			tabId: "json-selection",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 1024,
				maxDepth: 256,
				maxTextCodeUnits: 2_000_001,
				maxChanges: 1024,
			},
		},
	);
	trees.push(tree);
	return tree;
}

function literal(result: DocumentExtraction): string {
	if (result.format === "markdown") {
		const fence = result.content.slice(0, result.content.indexOf("\n"));
		expect(fence).toMatch(/^`{3,}$/);
		expect(result.content.endsWith(`\n${fence}\n`)).toBe(true);
		return result.content.slice(fence.length + 1, -(fence.length + 2));
	}
	const pending: ExtractedNode[] = [result.content];
	const pieces: string[] = [];
	while (pending.length) {
		const node = pending.pop();
		if (!node) throw new Error("Missing extraction node");
		if (node.type === "text") pieces.push(node.text ?? "");
		else pending.push(...[...(node.children ?? [])].reverse());
	}
	return pieces.join("");
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

describe.each(["markdown", "json"] as const)(
	"JSON source selection in %s",
	(format) => {
		it("extracts the exact metadata object and retains original source references", () => {
			const chosen =
				'{"name":"fixture","version":"1.2.3","size":9007199254740993123456789}';
			const source = ` { "info" : ${chosen}, "releases":{"older":[]} } `;
			const tree = load(source);
			const revision = tree.revision;
			const html = serializeHtml(tree);
			const result = extractDocument(tree, { format, jsonPointer: "/info" });
			expect(literal(result)).toBe(chosen);
			expect(result.jsonSelection).toEqual({
				kind: "json-source-selection-v1",
				method: "json-pointer",
				pointer: "/info",
				start: source.indexOf(chosen),
				end: source.indexOf(chosen) + chosen.length,
				sourceCodeUnits: source.length,
				selectedCodeUnits: chosen.length,
				offsetBasis: "document-text-utf16",
				valueKind: "object",
				duplicateMembers: "rejected",
			});
			expect(Object.isFrozen(result.jsonSelection)).toBe(true);
			expect(result.textSelection).toBeUndefined();
			expect(result.scope).toBe(result.document);
			expect(result.url).toBe(url);
			expect(result.revision).toBe(revision);
			expect(tree.revision).toBe(revision);
			expect(serializeHtml(tree)).toBe(html);
		});

		it.each([
			['"literal\\n\\u0061"', "string"],
			["9007199254740993123456789", "number"],
			["1.2300e+400", "number"],
			["-0", "number"],
			["true", "boolean"],
			["false", "boolean"],
			["null", "null"],
			['[1, {"nested":2}]', "array"],
			['""', "string"],
		])(
			"preserves %s without parsing and reserializing its value",
			(chosen, kind) => {
				const source = `{"value":${chosen}}`;
				const result = extractDocument(load(source), {
					format,
					jsonPointer: "/value",
				});
				expect(literal(result)).toBe(chosen);
				expect(result.jsonSelection?.valueKind).toBe(kind);
			},
		);

		it("preserves CRLF whitespace, literal Unicode formatting characters and escape spellings", () => {
			const chosen = '{\r\n\t"text":"café 😀 \u202e", "escaped":"\\u202e"\r\n}';
			const source = `{"value":${chosen}}`;
			const result = extractDocument(load(source), {
				format,
				jsonPointer: "/value",
			});
			expect(literal(result)).toBe(chosen);
			expect(result.jsonSelection?.selectedCodeUnits).toBe(chosen.length);
		});

		it("supports escaped object keys, array traversal and empty-root selection", () => {
			const source = '{"a/b":{"~key":[{"":"chosen"}]},"01":"object-key"}';
			expect(
				literal(
					extractDocument(load(source), {
						format,
						jsonPointer: "/a~1b/~0key/0/",
					}),
				),
			).toBe('"chosen"');
			expect(
				literal(extractDocument(load(source), { format, jsonPointer: "/01" })),
			).toBe('"object-key"');
			expect(
				literal(extractDocument(load(source), { format, jsonPointer: "" })),
			).toBe(source);
		});

		it.each(["text/plain", "application/json", "application/problem+json"])(
			"selects explicitly from an unchanged %s text document",
			(mime) => {
				expect(
					literal(
						extractDocument(load('{"info":{"ready":true}}', mime), {
							format,
							jsonPointer: "/info/ready",
						}),
					),
				).toBe("true");
			},
		);

		it.each([
			'{"value":1,"other":}',
			'{"value":1} trailing',
			'{"value":1,"duplicate":0,"duplicate":2}',
			'{"value":1,"other":{"key":0,"\\u006bey":2}}',
		])(
			"does not return a matching prefix from malformed or ambiguous JSON: %s",
			(source) => {
				expect(() =>
					extractDocument(load(source), { format, jsonPointer: "/value" }),
				).toThrow();
			},
		);

		it.each([
			"/missing",
			"/values/-",
			"/values/01",
			"/values/8",
			"/value/child",
		])("does not invent a missing target: %s", (jsonPointer) => {
			expect(() =>
				extractDocument(load('{"values":[1],"value":2}'), {
					format,
					jsonPointer,
				}),
			).toThrow();
		});

		it("honors the complete extraction budget and never substitutes a truncated JSON prefix", () => {
			const chosen = JSON.stringify({ info: "é".repeat(512) });
			const tree = load(`{"value":${chosen},"other":"not selected"}`);
			const result = extractDocument(tree, { format, jsonPointer: "/value" });
			const bytes = encoder.encode(JSON.stringify(result)).byteLength;
			expect(
				extractDocument(tree, {
					format,
					jsonPointer: "/value",
					maxBytes: bytes,
				}),
			).toEqual(result);
			expect(() =>
				extractDocument(tree, {
					format,
					jsonPointer: "/value",
					maxBytes: bytes - 1,
				}),
			).toThrow();
		});
	},
);

it.each([
	{ lines: { start: 1, end: 1 } },
	{ section: "#info" },
	{ root: "unused-reference" },
	{ contentFocus: "main-content-v2" },
	{ outputLimitPolicy: "text-prefix-v1" },
] as const)(
	"rejects mixed selection or fallback before interpreting source: %j",
	(extra) => {
		const tree = load("not JSON");
		expect(() => extractDocument(tree, { jsonPointer: "", ...extra })).toThrow(
			/cannot be combined/,
		);
	},
);

it.each([null, 1, {}, [], "missing-slash", "/bad~escape"])(
	"rejects invalid pointer %j",
	(jsonPointer) => {
		expect(() =>
			extractDocument(load('{"key":1}'), { jsonPointer } as ExtractionOptions),
		).toThrow();
	},
);

it("does not reinterpret an ordinary HTML pre or manually constructed document as JSON source", () => {
	const html = parseHtmlDocument('<pre>{"key":1}</pre>', url);
	const manual = new DocumentTree(url);
	trees.push(html, manual);
	const pre = manual.createElement("pre");
	manual.append(manual.root, pre);
	manual.append(pre, manual.createText('{"key":1}'));
	for (const tree of [html, manual])
		expect(() => extractDocument(tree, { jsonPointer: "/key" })).toThrow(
			/unchanged native text-loader/,
		);
});

it.each(["changed", "restored", "extra"])(
	"rejects source document mutation: %s",
	(change) => {
		const tree = load('{"key":1}');
		const pre = tree.get(tree.root).children[0];
		const text = tree.get(pre).children[0];
		if (change === "extra") tree.append(pre, tree.createText(" "));
		else {
			tree.setData(text, '{"key":2}');
			if (change === "restored") tree.setData(text, '{"key":1}');
		}
		expect(() => extractDocument(tree, { jsonPointer: "/key" })).toThrow(
			/unchanged native text-loader/,
		);
	},
);

it("keeps ordinary extraction unchanged when JSON selection is absent", () => {
	const tree = load('{"key":1,"nested":{"data":2}}');
	const before = extractDocument(tree, { format: "json" });
	extractDocument(tree, { jsonPointer: "/key" });
	expect(extractDocument(tree, { format: "json" })).toEqual(before);
	expect(before.jsonSelection).toBeUndefined();
});
