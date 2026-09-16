import { afterEach, describe, expect, it, vi } from "vitest";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { loadResearchDocument } from "./research-loader.js";
import { researchSourcePlaygrounds } from "./research-source-playgrounds.js";

const encoder = new TextEncoder();
const trees: ReturnType<typeof loadResearchDocument>[] = [];
const targetUrl = "https://react.dev/learn";
const css =
	".avatar {\n  border-radius: 50%;\n}\n.large { border: 4px solid gold; }\n";
const javascript = "export default function App() { return <h1>Hello</h1>; }\n";
const article =
	"<main id='article'><h1>Visible guide</h1><p>Readable source introduction.</p></main>";

function element(
	tag: string,
	children: unknown,
	props: Record<string, unknown> = {},
) {
	return ["$r", tag, null, { ...props, children }];
}

function payload() {
	return {
		page: "/[[...markdownPath]]",
		query: { markdownPath: ["learn"] },
		props: {
			pageProps: {
				content: JSON.stringify([
					element("Sandpack", [
						element(
							"pre",
							element("code", javascript, { className: "language-js" }),
						),
						element(
							"pre",
							element("code", css, {
								className: "language-css",
								meta: "file=/src/styles.css",
							}),
						),
					]),
				]),
			},
		},
	};
}

function script(attributes = 'id="__NEXT_DATA__" type="application/json"') {
	return `<script ${attributes}>${JSON.stringify(payload())}</script>`;
}

function load(
	source: string,
	url = targetUrl,
	mime = "text/html; charset=utf-8",
	policy?: "source-hidden-inline-v1",
	signal = new AbortController().signal,
) {
	const body = encoder.encode(source);
	const tree = loadResearchDocument(
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
			tabId: "source-playgrounds",
			signal,
			limits: {
				maxNodes: 4096,
				maxDepth: 128,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 256,
			},
		},
		undefined,
		undefined,
		policy,
	);
	trees.push(tree);
	return tree;
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

describe.each(["markdown", "json"] as const)(
	"playground source metadata in %s",
	(format) => {
		it("recovers supporting source and association without inserting code into the document", () => {
			const tree = load(`<!doctype html>${article}${script()}`);
			const result = extractDocument(tree, { format });
			expect(result.sourcePlaygrounds).toMatchObject({
				kind: "react-sandpack-source-code-v1",
				scope: "document-source",
				partial: true,
				rendered: false,
				verified: false,
				textFormat: "code-source",
				routePathname: "/learn",
				truncated: false,
				entries: [
					{ code: javascript, className: "language-js" },
					{
						code: css,
						className: "language-css",
						meta: "file=/src/styles.css",
					},
				],
			});
			const entries = result.sourcePlaygrounds?.entries ?? [];
			expect(entries).toHaveLength(2);
			expect(entries[0].source.playgroundPath).toBe(
				entries[1].source.playgroundPath,
			);
			expect(entries[0].source.path).not.toBe(entries[1].source.path);
			expect(entries[0].source.offsetBasis).toBe("lf-normalized-utf16");
			if (result.format === "markdown") {
				expect(result.content).toContain("Visible guide");
				expect(result.content).not.toContain(".large");
				expect(result.content).not.toContain("export default");
			}
			expect(
				[...tree.walk()].some(
					({ node }) => node.kind === "element" && node.tagName === "script",
				),
			).toBe(false);
		});

		it("keeps document-source metadata when extracting only a selected article", () => {
			const tree = load(`${article}${script()}`);
			const selected = [...tree.walk()].find(
				({ node }) =>
					node.kind === "element" && node.attributes.id === "article",
			);
			expect(selected).toBeDefined();
			if (!selected) throw new Error("Missing selected article");
			const result = extractDocument(tree, {
				format,
				root: tree.reference(selected.node.id),
			});
			expect(result.sourcePlaygrounds?.scope).toBe("document-source");
			expect(
				result.sourcePlaygrounds?.entries.map((entry) => entry.code),
			).toEqual([javascript, css]);
		});

		it("omits optional metadata instead of exceeding the extraction byte budget", () => {
			const tree = load(`${article}${script()}`);
			const full = extractDocument(tree, { format });
			const { sourcePlaygrounds, ...baseline } = full;
			expect(sourcePlaygrounds).toBeDefined();
			const maxBytes = encoder.encode(JSON.stringify(baseline)).byteLength;
			const limited = extractDocument(tree, { format, maxBytes });
			expect(limited).toEqual(baseline);
			expect(
				encoder.encode(JSON.stringify(limited)).byteLength,
			).toBeLessThanOrEqual(maxBytes);
		});

		it.each([
			'id="__NEXT_DATA__" type="text/javascript"',
			'id="__NEXT_DATA__"',
			'type="application/json"',
			'id="other" type="application/json"',
			'id="__NEXT_DATA__" type="application/ld+json"',
			'id="__NEXT_DATA__" type="application/json" src="/payload.json"',
		])("does not read ineligible scripts: %s", (attributes) => {
			expect(
				extractDocument(load(`${article}${script(attributes)}`), { format })
					.sourcePlaygrounds,
			).toBeUndefined();
		});

		it.each([
			"https://example.com/learn",
			"http://react.dev/learn",
			"https://react.dev/blog",
			"https://react.dev/learn/installation",
		])("requires document and payload route binding: %s", (url) => {
			expect(
				extractDocument(load(`${article}${script()}`, url), { format })
					.sourcePlaygrounds,
			).toBeUndefined();
		});

		it.each(["text/plain", "text/markdown", "application/json"])(
			"does not reinterpret a %s response as source HTML",
			(mime) => {
				expect(
					extractDocument(load(`${article}${script()}`, targetUrl, mime), {
						format,
					}).sourcePlaygrounds,
				).toBeUndefined();
			},
		);

		it.each(["template", "noscript", "svg"])(
			"does not promote a payload inside %s",
			(tag) => {
				expect(
					extractDocument(load(`${article}<${tag}>${script()}</${tag}>`), {
						format,
					}).sourcePlaygrounds,
				).toBeUndefined();
			},
		);

		it.each(["hidden", 'aria-hidden="true"', 'style="display:none"'])(
			"respects source-hidden omission for %s",
			(attribute) => {
				const tree = load(
					`${article}<div ${attribute}>${script()}</div>`,
					targetUrl,
					"text/html",
					"source-hidden-inline-v1",
				);
				expect(
					extractDocument(tree, { format }).sourcePlaygrounds,
				).toBeUndefined();
			},
		);

		it("preserves normalized original source offsets through removed content", () => {
			const prefix = `\uFEFF<!doctype html>\r\n<style>.ignored{}</style>\r\n${article}`;
			const tree = load(prefix + script());
			const result = extractDocument(tree, { format });
			expect(result.sourcePlaygrounds?.entries[0].source.offset).toBe(
				prefix.slice(1).replace(/\r\n/g, "\n").length,
			);
		});
	},
);

it("leaves normal HTML parsing and source-free reader output unchanged", () => {
	const parsed = parseHtmlDocument(`${article}${script()}`, targetUrl);
	trees.push(parsed);
	expect(researchSourcePlaygrounds(parsed)).toBeUndefined();
	const baseline = extractDocument(load(article), { format: "markdown" });
	const recovered = extractDocument(load(`${article}${script()}`), {
		format: "markdown",
	});
	expect(recovered.content).toBe(baseline.content);
});

it("clears associated payload metadata when the document closes", () => {
	const tree = load(`${article}${script()}`);
	expect(researchSourcePlaygrounds(tree)?.entries).toHaveLength(2);
	tree.close();
	expect(researchSourcePlaygrounds(tree)).toBeUndefined();
});

it("propagates abort observed during nested JSON decoding", () => {
	const controller = new AbortController();
	const original = JSON.parse;
	vi.spyOn(JSON, "parse").mockImplementation((text, reviver) => {
		const value = original(text, reviver);
		controller.abort();
		return value;
	});
	expect(() =>
		load(
			`${article}${script()}`,
			targetUrl,
			"text/html",
			undefined,
			controller.signal,
		),
	).toThrow(/aborted/i);
});
