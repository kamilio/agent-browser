import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import {
	discoverDocumentLinks,
	discoverDocumentTextLines,
	extractDocument,
} from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import { loadResearchDocument } from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import { textDocumentInfo } from "./text-document-info.js";
import { loadTextDocument } from "./text-loader.js";

const rss = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<?xml-stylesheet type="text/xsl" href="https://example.com/feed.xsl"?>',
	'<!DOCTYPE rss SYSTEM "https://example.com/feed.dtd" [<!ENTITY marker "expanded-marker"><!ENTITY external SYSTEM "https://example.com/entity">]>',
	'<rss version="2.0"><channel>',
	"<title>Native technology &amp; notes</title>",
	"<link>https://example.com/technology?first=1&amp;next=2</link>",
	"<item><title>Battery prototype</title><link>https://example.com/items/battery</link>",
	'<description><![CDATA[<script src="https://example.com/code.js">throw new Error("literal script")</script><style>@import "https://example.com/style.css";</style><img src="https://example.com/image.png"><a href="https://example.com/linked">Not a DOM link</a>',
	"```",
	"]]></description>&marker;&external;&#65;",
	"</item></channel></rss>",
].join("\n");
const atom = [
	'<?xml version="1.0"?>',
	'<feed xmlns="http://www.w3.org/2005/Atom">',
	"<title>Native science café</title>",
	'<link href="https://example.com/science"/>',
	'<entry><title>Sensor update</title><link href="https://example.com/items/sensor"/></entry>',
	"</feed>",
].join("\n");
const trees: DocumentTree[] = [];
const loaders = [
	{ name: "text", load: loadTextDocument },
	{ name: "native", load: loadBrowserDocument },
	{ name: "reader", load: loadResearchDocument },
];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function retain(tree: DocumentTree) {
	trees.push(tree);
	return tree;
}

function response(
	source: string | Uint8Array = rss,
	mime = "application/rss+xml",
): NetworkResponse {
	const body =
		typeof source === "string" ? new TextEncoder().encode(source) : source;
	return {
		url: "https://example.com/feed",
		status: 200,
		headers: { "content-type": [mime] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
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

function expectLiteral(tree: DocumentTree, source: string) {
	const queries = new DocumentQueries(tree);
	const pre = queries.querySelector("pre");
	if (pre === null) throw new Error("Missing literal text pre");
	expect(queries.querySelectorAll("*")).toEqual([pre]);
	expect(tree.get(tree.root).children).toEqual([pre]);
	expect(tree.textContent(pre)).toBe(source);
	const info = textDocumentInfo(tree);
	if (!info) throw new Error("Missing text document registration");
	expect(info.revision).toBe(tree.revision);
	expect(tree.get(pre).children).toEqual([info.textNode]);
	expect(tree.get(info.textNode)).toMatchObject({ kind: "text", data: source });
	expect(discoverDocumentLinks(tree, "example.com").entries).toEqual([]);
	return info;
}

it.each([
	"text/xml",
	"application/xml",
	"application/rss+xml",
	"application/atom+xml",
	' APPLICATION/RSS+XML ; CHARSET="UTF-8"',
	"Application/Atom+Xml; charset=utf-8",
])("admits exactly supported XML/feed MIME %s as literal text", (mime) => {
	const tree = retain(loadTextDocument(response(atom, mime), context()));
	expectLiteral(tree, atom);
});

it.each([
	"text/html",
	"application/xhtml+xml",
	"image/svg+xml",
	"application/custom+xml",
	"text/rss+xml",
	"application/rss+xml-extra",
	"application/xml-dtd",
	"application/javascript",
	"application/octet-stream",
	"",
	"application/rss+xml, text/html",
])("does not sniff XML source with unsupported MIME %s", (mime) => {
	expect(() =>
		retain(loadTextDocument(response(rss, mime), context())),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each([
	undefined,
	[],
	["application/rss+xml", "application/rss+xml"],
	["application/rss+xml", "text/html"],
])("rejects missing or ambiguous feed Content-Type %j", (types) => {
	const input = response();
	input.headers = types === undefined ? {} : { "content-type": types };
	expect(() => retain(loadTextDocument(input, context()))).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each(loaders)(
	"keeps XML, entities and resource references inert through the $name loader",
	async ({ load }) => {
		const forbidden = vi.fn(async () => {
			throw new Error(
				"Literal feeds must not request resources or run scripts",
			);
		});
		const options: DocumentLoaderContext = {
			...context(),
			fetch: forbidden,
			fetchStylesheet: forbidden,
			fetchStylesheetWithPolicy: forbidden,
			fetchScript: forbidden,
			fetchImage: forbidden,
			scripts: { start: forbidden, script: forbidden, finish: forbidden },
		};
		const input = response();
		const originalBody = input.body.slice();
		const tree = retain(await load(input, options));
		const info = expectLiteral(tree, rss);
		expect(input.body).toEqual(originalBody);
		expect(forbidden).not.toHaveBeenCalled();
		const structured = extractDocument(tree, { format: "json" });
		if (structured.format !== "json")
			throw new Error("Expected JSON extraction");
		expect(structured.content.children).toEqual([
			{
				ref: tree.reference(tree.get(tree.root).children[0]),
				type: "pre",
				children: [
					{ ref: tree.reference(info.textNode), type: "text", text: rss },
				],
			},
		]);
		expect(extractDocument(tree).content).toBe(`\`\`\`\`\n${rss}\n\`\`\`\`\n`);
		const selected = extractDocument(tree, {
			format: "json",
			lines: { start: 5, end: 6 },
		});
		if (selected.format !== "json") throw new Error("Expected JSON extraction");
		const selectedSource =
			"<title>Native technology &amp; notes</title>\n" +
			"<link>https://example.com/technology?first=1&amp;next=2</link>\n";
		expect(selected.content.children?.[0]?.children?.[0]?.text).toBe(
			selectedSource,
		);
		expect(selected.textSelection).toEqual({
			method: "text-lines",
			start: 5,
			end: 6,
			totalLines: 11,
			sourceCodeUnits: rss.length,
			selectedCodeUnits: selectedSource.length,
		});
		expect(discoverDocumentTextLines(tree, "Battery prototype")).toMatchObject({
			entries: [{ line: 7, column: 14 }],
			totalLines: 11,
			matchedLines: 1,
			sourceCodeUnits: rss.length,
			truncated: false,
		});
		expect(tree.get(info.textNode).data).toBe(rss);
		expect(forbidden).not.toHaveBeenCalled();
	},
);

it.each(loaders.slice(1))(
	"preserves Atom title and link attributes through the $name loader without callbacks",
	async ({ load }) => {
		const tree = retain(
			await load(response(atom, "application/atom+xml"), context()),
		);
		expectLiteral(tree, atom);
		const result = extractDocument(tree, { format: "json" });
		if (result.format !== "json") throw new Error("Expected JSON extraction");
		expect(result.content.children?.[0]?.children?.[0]?.text).toBe(atom);
	},
);

it("escapes scoped Markdown without changing structured XML source", () => {
	const source = "<title>A &amp; B</title>";
	const tree = retain(loadTextDocument(response(source), context()));
	const info = expectLiteral(tree, source);
	const root = tree.reference(info.textNode);
	expect(extractDocument(tree, { root }).content).toBe(
		"&lt;title&gt;A &amp;amp; B&lt;/title&gt;\n",
	);
	const result = extractDocument(tree, { root, format: "json" });
	expect(result.content).toEqual({ ref: root, type: "text", text: source });
	expect(tree.get(info.textNode).data).toBe(source);
});

it("uses HTTP charset decoding rather than the literal XML declaration", () => {
	const prefix = '<?xml version="1.0" encoding="UTF-16"?>\r\n<feed><title>';
	const suffix = "</title></feed>";
	const body = new Uint8Array([
		...new TextEncoder().encode(prefix),
		128,
		...new TextEncoder().encode(suffix),
	]);
	const tree = retain(
		loadTextDocument(
			response(body, "text/xml; charset=windows-1252"),
			context(),
		),
	);
	expectLiteral(tree, `${prefix}€${suffix}`);
	const source =
		'<?xml version="1.0" encoding="windows-1252"?><feed>café</feed>';
	expectLiteral(
		retain(loadTextDocument(response(source, "application/xml"), context())),
		source,
	);
});

it("retains BOM precedence and refuses unsupported HTTP charsets", () => {
	const body = new Uint8Array([
		239,
		187,
		191,
		...new TextEncoder().encode(atom),
	]);
	const tree = retain(
		loadTextDocument(
			response(body, "application/atom+xml; charset=windows-1252"),
			context(),
		),
	);
	expectLiteral(tree, atom);
	expect(() =>
		retain(
			loadTextDocument(
				response(atom, "application/atom+xml; charset=not-an-encoding"),
				context(),
			),
		),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it.each(["text/plain", "application/json", "application/problem+json"])(
	"leaves existing %s literal loading unchanged",
	(mime) => {
		const source =
			'{"title":"<script>literal</script>","link":"https://example.com/item"}';
		expectLiteral(
			retain(loadTextDocument(response(source, mime), context())),
			source,
		);
	},
);

it.each(loaders)(
	"rejects aborted feed loading through $name",
	async ({ load }) => {
		const controller = new AbortController();
		controller.abort();
		const initializeDocument = vi.fn();
		await expect(
			Promise.resolve().then(async () =>
				retain(
					await load(response(), {
						...context(),
						signal: controller.signal,
						initializeDocument,
					}),
				),
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(initializeDocument).not.toHaveBeenCalled();
	},
);

it.each([
	{ source: "x".repeat(84), message: "Encoded text document limit" },
	{ source: "x".repeat(21), message: "Decoded text document limit" },
])("retains $message before document initialization", ({ source, message }) => {
	const initializeDocument = vi.fn();
	expect(() =>
		retain(
			loadTextDocument(response(source), {
				...context(20),
				initializeDocument,
			}),
		),
	).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: expect.stringContaining(message),
		}),
	);
	expect(initializeDocument).not.toHaveBeenCalled();
});

it("counts structural text and closes an incomplete feed document on budget failure", () => {
	const source = "<rss/>";
	expectLiteral(
		retain(loadTextDocument(response(source), context(source.length + 3))),
		source,
	);
	let initialized: DocumentTree | undefined;
	expect(() =>
		retain(
			loadTextDocument(response(source), {
				...context(source.length + 2),
				initializeDocument: (tree) => {
					initialized = tree;
				},
			}),
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	if (!initialized) throw new Error("Expected loader initialization");
	const failed = initialized;
	expect(textDocumentInfo(failed)).toBeUndefined();
	expect(() => failed.get(failed.root)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});
