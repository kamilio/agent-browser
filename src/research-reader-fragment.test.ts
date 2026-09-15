import { afterEach, describe, expect, it } from "vitest";
import { selectDocumentFragmentTarget } from "./document-url.js";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import {
	type ResearchReaderLimits,
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import type { ResearchReaderRawPolicy } from "./research-reader-info.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";

const baseUrl = "https://reader.invalid/fragment-fixture";
const profiles: {
	label: string;
	profile: ResearchDocumentProfileId;
	rawPolicy?: ResearchReaderRawPolicy;
}[] = [
	{ label: "normal", profile: "default" },
	{ label: "long", profile: "long-v1" },
	{
		label: "long with separate omitted raw",
		profile: "long-v1",
		rawPolicy: "separate-omitted-raw-v1",
	},
];
const documents: DocumentTree[] = [];
const queriesToClose: DocumentQueries[] = [];

function response(source: string): NetworkResponse {
	const body = new TextEncoder().encode(source);
	return {
		url: baseUrl,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		encodedBytes: body.byteLength,
		redirects: [],
		elapsedMs: 0,
	};
}

function context(): DocumentLoaderContext {
	return {
		tabId: "synthetic-reader-fragment",
		signal: new AbortController().signal,
		limits: { ...researchLongDocumentAdmission.document },
	};
}

function target(tree: DocumentTree, serializedFragment: string) {
	tree.setUrl(`${baseUrl}#${serializedFragment}`);
	tree.setTargetElement(selectDocumentFragmentTarget(tree));
	return tree.targetElement;
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected reader limit failure");
}

afterEach(() => {
	for (const queries of queriesToClose.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

describe.each(profiles)(
	"reader fragment attributes: $label",
	({ profile, rawPolicy }) => {
		function sanitize(
			source: string,
			limits: Partial<ResearchReaderLimits> = {},
		) {
			return sanitizeResearchHtml(
				source,
				limits,
				undefined,
				profile,
				rawPolicy,
			);
		}

		function reader(source: string) {
			const tree = loadResearchDocument(
				response(source),
				context(),
				profile,
				rawPolicy,
			);
			documents.push(tree);
			const queries = new DocumentQueries(tree);
			queriesToClose.push(queries);
			return { tree, queries };
		}

		it("retains IDs on emitted semantic elements and selects them through native :target", () => {
			const { tree, queries } = reader(
				'<main id="content"><h2 id="heading">Heading</h2><p id="paragraph">Text</p><a id="link" name="legacy" href="/next" title="Next">Link</a><img id="diagram" alt="Diagram"><table id="table"><tr id="row"><td id="cell">Cell</td></tr></table></main>',
			);
			for (const id of [
				"content",
				"heading",
				"paragraph",
				"link",
				"diagram",
				"table",
				"row",
				"cell",
			]) {
				const selected = target(tree, id);
				expect(selected).not.toBeNull();
				expect(queries.querySelector(`#${id}`)).toBe(selected);
				expect(queries.querySelector(":target")).toBe(selected);
				expect(tree.get(selected as number).attributes.id).toBe(id);
			}
			expect(target(tree, "legacy")).toBe(queries.querySelector("#link"));
			expect(
				tree.get(queries.querySelector("#link") as number).attributes,
			).toEqual({
				id: "link",
				name: "legacy",
				href: "/next",
				title: "Next",
			});
			expect(researchReaderInfo(tree)).toMatchObject({
				partial: true,
				scripting: false,
				styling: false,
				hiddenContentSemantics: false,
			});
		});

		it("escapes retained attribute values without injecting attributes or elements", () => {
			const source =
				'<a id="quote&quot; onclick=&quot;bad&amp;&lt;日😀+%23" name="legacy&amp;&quot;&lt;&gt;日😀">Retained</a>';
			const id = 'quote" onclick="bad&<日😀+%23';
			const name = 'legacy&"<>日😀';
			const sanitized = sanitize(source);
			expect(sanitized.html).toBe(source);
			expect(sanitized.report.outputCodeUnits).toBe(source.length);
			expect(sanitized.report.textCodeUnits).toBe("Retained".length);
			const { tree, queries } = reader(source);
			const anchor = queries.querySelector("a") as number;
			expect(tree.get(anchor).attributes).toEqual({ id, name });
			expect(queries.querySelectorAll("a")).toHaveLength(1);
			expect(queries.querySelector("[onclick]")).toBeNull();
			for (const fragment of [id, name]) {
				expect(target(tree, encodeURIComponent(fragment))).toBe(anchor);
				expect(queries.querySelector(":target")).toBe(anchor);
			}
		});

		it.each([
			['<p id="日😀">Unicode ID</p>', "%E6%97%A5%F0%9F%98%80", "Unicode ID"],
			[
				'<a name="日😀">Unicode name</a>',
				"%E6%97%A5%F0%9F%98%80",
				"Unicode name",
			],
			[
				'<p id="a b">Decoded earlier</p><p id="a%20b">Raw ID later</p>',
				"a%20b",
				"Raw ID later",
			],
			[
				'<p id="a b">Decoded earlier</p><a name="a%20b">Raw name later</a>',
				"a%20b",
				"Raw name later",
			],
			[
				'<a name="a b">Named earlier</a><p id="a b">Decoded ID later</p>',
				"a%20b",
				"Decoded ID later",
			],
			[
				'<p id="duplicate">First ID</p><p id="duplicate">Second ID</p>',
				"duplicate",
				"First ID",
			],
			[
				'<a name="duplicate">First name</a><a name="duplicate">Second name</a>',
				"duplicate",
				"First name",
			],
			[
				'<a name="duplicate">Name earlier</a><p id="duplicate">ID later</p>',
				"duplicate",
				"ID later",
			],
			['<p id="a b">Space</p><p id="a+b">Plus</p>', "a+b", "Plus"],
		])(
			"preserves native target precedence in %s",
			(source, fragment, expectedText) => {
				const { tree, queries } = reader(source);
				const selected = target(tree, fragment);
				expect(selected).not.toBeNull();
				expect(tree.textContent(selected as number)).toBe(expectedText);
				expect(queries.querySelectorAll(":target")).toEqual([selected]);
			},
		);

		it("retains names only on anchors while still dropping active and unrelated attributes", () => {
			const source =
				'<div id="block" name="not-anchor" class="hidden" style="display:none" onclick="bad()" data-extra="drop" hidden><span id="span" name="not-span" lang="en">Readable</span><a id="anchor" name="legacy" href="/next" title="Next" target="_blank" rel="opener" onmouseover="bad()">Link</a><img id="image" name="not-image" src="/image" alt="Alt"><ol id="list" name="not-list" start="3"><li>Item</li></ol></div>';
			const { tree, queries } = reader(source);
			const attributes = (selector: string) =>
				tree.get(queries.querySelector(selector) as number).attributes;
			expect(attributes("#block")).toEqual({ id: "block", class: "hidden" });
			expect(queries.querySelector(".hidden")).toBe(
				queries.querySelector("#block"),
			);
			expect(attributes("#span")).toEqual({ id: "span" });
			expect(attributes("#anchor")).toEqual({
				id: "anchor",
				name: "legacy",
				href: "/next",
				title: "Next",
			});
			expect(attributes("#image")).toEqual({ id: "image", alt: "Alt" });
			expect(attributes("#list")).toEqual({ id: "list", start: "3" });
			expect(queries.querySelectorAll("[name]")).toEqual([
				queries.querySelector("#anchor"),
			]);
			for (const fragment of [
				"not-anchor",
				"not-span",
				"not-image",
				"not-list",
			])
				expect(target(tree, fragment)).toBeNull();
			for (const attribute of [
				"style",
				"onclick",
				"onmouseover",
				"data-extra",
				"hidden",
				"lang",
				"src",
				"target",
				"rel",
			])
				expect(queries.querySelector(`[${attribute}]`)).toBeNull();
			expect(researchReaderInfo(tree)?.ignoredAttributes).toBeGreaterThan(10);
		});

		it.each([
			"form",
			"details",
			"summary",
			"dialog",
			"fieldset",
			"legend",
			"center",
			"search",
			"xmp",
		])("retains an ID on the inert replacement for %s", (tag) => {
			const replacement = tag === "xmp" ? "pre" : "div";
			const source = `<${tag} id="replacement" name="not-anchor" style="display:none">Retained</${tag}>`;
			expect(sanitize(source).html).toBe(
				`<${replacement} id="replacement">Retained</${replacement}>`,
			);
			const { tree, queries } = reader(source);
			const selected = target(tree, "replacement");
			expect(selected).toBe(queries.querySelector(replacement));
			expect(selected).not.toBeNull();
			expect(tree.get(selected as number).attributes).toEqual({
				id: "replacement",
			});
			expect(tree.textContent(selected as number)).toBe("Retained");
			expect(target(tree, "not-anchor")).toBeNull();
		});

		it.each([
			'<script id="gone">OMITTED_BODY</script>',
			'<style id="gone">OMITTED_BODY</style>',
			'<input id="gone" name="nested" value="OMITTED_BODY">',
			'<template id="gone"><p id="nested">OMITTED_BODY</p></template>',
			'<svg id="gone"><text id="nested">OMITTED_BODY</text></svg>',
			'<math id="gone"><mi id="nested">OMITTED_BODY</mi></math>',
			'<iframe id="gone"><p id="nested">OMITTED_BODY</p></iframe>',
			'<object id="gone"><p id="nested">OMITTED_BODY</p></object>',
			'<canvas id="gone"><p id="nested">OMITTED_BODY</p></canvas>',
			'<textarea id="gone">OMITTED_BODY</textarea>',
		])(
			"does not resurrect an omitted subtree merely because it has an ID: %s",
			(omitted) => {
				const kept = '<p id="kept">Retained</p>';
				const source = omitted + kept;
				expect(sanitize(source).html).toBe(kept);
				const { tree, queries } = reader(source);
				for (const fragment of ["gone", "nested"]) {
					expect(target(tree, fragment)).toBeNull();
					expect(queries.querySelector(":target")).toBeNull();
					expect(queries.querySelector(`#${fragment}`)).toBeNull();
				}
				expect(target(tree, "kept")).toBe(queries.querySelector("#kept"));
				expect(tree.textContent(tree.root)).toBe("Retained");
				expect(extractDocument(tree).content).not.toContain("OMITTED_BODY");
			},
		);

		it("does not transfer an unwrapped element's ID to its preserved child", () => {
			const source =
				'<widget id="unwrapped" name="not-anchor"><span id="child">Child</span></widget>';
			expect(sanitize(source).html).toBe(
				'<span id="unwrapped"></span><span id="child">Child</span>',
			);
			const { tree, queries } = reader(source);
			const point = queries.querySelector("#unwrapped") as number;
			const child = queries.querySelector("#child") as number;
			expect(target(tree, "unwrapped")).toBe(point);
			expect(tree.get(point).children).toEqual([]);
			expect(tree.get(point).parent).toBe(tree.get(child).parent);
			expect(point).not.toBe(child);
			expect(target(tree, "not-anchor")).toBeNull();
			expect(target(tree, "child")).toBe(queries.querySelector("#child"));
		});

		it("keeps full-document extraction the default after selecting a fragment", () => {
			const { tree, queries } = reader(
				'<p>Before section</p><section id="selected"><h2>Selected section</h2><p>Inside section</p></section><p>After section</p>',
			);
			const selected = target(tree, "selected") as number;
			expect(queries.querySelector(":target")).toBe(selected);
			const complete = extractDocument(tree);
			for (const text of ["Before section", "Inside section", "After section"])
				expect(complete.content).toContain(text);
			const scoped = extractDocument(tree, { root: tree.reference(selected) });
			expect(scoped.content).toContain("Inside section");
			expect(scoped.content).not.toContain("Before section");
			expect(scoped.content).not.toContain("After section");
			expect(complete.reader).toMatchObject({
				partial: true,
				hiddenContentSemantics: false,
			});
		});

		it("clears reader metadata on close without leaving a usable target reference", () => {
			const { tree, queries } = reader(
				'<a id="target" name="legacy">Target</a>',
			);
			const selected = target(tree, "legacy") as number;
			const reference = tree.reference(selected);
			expect(queries.querySelector(":target")).toBe(selected);
			expect(researchReaderInfo(tree)).toBeDefined();
			queries.close();
			tree.close();
			expect(researchReaderInfo(tree)).toBeUndefined();
			expect(tree.targetElement).toBeNull();
			expect(() => tree.resolve(reference)).toThrow("closed");
		});

		it.each([
			['id="&日😀"', 'id="&amp;日😀"'],
			['name="&名😀"', 'name="&amp;名😀"'],
			['id="&日😀" name="&名😀"', 'id="&amp;日😀" name="&amp;名😀"'],
		])(
			"charges escaped retained attribute output for %s",
			(attributes, escaped) => {
				const source = `<a ${attributes}>x</a>`;
				const expected = `<a ${escaped}>x</a>`;
				const bare = sanitize("<a>x</a>");
				const result = sanitize(source, {
					maxOutputCodeUnits: expected.length,
				});
				expect(result.html).toBe(expected);
				expect(result.report).toMatchObject({
					sourceCodeUnits: source.length,
					outputCodeUnits: expected.length,
					textCodeUnits: 1,
					tokens: 3,
					ignoredAttributes: 0,
				});
				expect(
					result.report.outputCodeUnits - bare.report.outputCodeUnits,
				).toBe(escaped.length + 1);
				expect(
					new TextEncoder().encode(result.html).byteLength,
				).toBeGreaterThan(result.report.outputCodeUnits);
				const error = failure(() =>
					sanitize(source, { maxOutputCodeUnits: expected.length - 1 }),
				);
				expect(error).toMatchObject({ code: "resource-limit" });
				expect(resourceLimitDiagnostic(error)).toEqual({
					kind: "reader.output",
					unit: "code-units",
					limit: expected.length - 1,
					observed: expected.length,
				});
			},
		);

		it("rejects retained attributes that overflow output before any body text", () => {
			const source = '<a id="&" name="&">x</a>';
			const opening = '<a id="&amp;" name="&amp;">';
			const error = failure(() =>
				sanitize(source, { maxOutputCodeUnits: opening.length - 1 }),
			);
			expect(resourceLimitDiagnostic(error)).toEqual({
				kind: "reader.output",
				unit: "code-units",
				limit: opening.length - 1,
				observed: opening.length,
			});
		});

		it("still bounds source, body text and tokens when ID and name attributes are retained", () => {
			const source = '<a id="retained-id" name="retained-name">a😀</a>';
			const result = sanitize(source, {
				maxSourceCodeUnits: source.length,
				maxTextCodeUnits: 3,
				maxTokens: 3,
			});
			expect(result.html).toBe(source);
			expect(result.report).toMatchObject({
				sourceCodeUnits: source.length,
				textCodeUnits: 3,
				tokens: 3,
			});
			const checks = [
				{
					limits: { maxSourceCodeUnits: source.length - 1 },
					kind: "reader.source",
					unit: "code-units",
					limit: source.length - 1,
					observed: source.length,
				},
				{
					limits: { maxTextCodeUnits: 2 },
					kind: "reader.text",
					unit: "code-units",
					limit: 2,
					observed: 3,
				},
				{
					limits: { maxTokens: 2 },
					kind: "reader.tokens",
					unit: "tokens",
					limit: 2,
					observed: 3,
				},
			];
			for (const { limits, ...diagnostic } of checks) {
				const error = failure(() => sanitize(source, limits));
				expect(error).toMatchObject({ code: "resource-limit" });
				expect(resourceLimitDiagnostic(error)).toEqual(diagnostic);
			}
		});

		it("keeps omitted raw accounting separate from retained ID and name output", () => {
			const retained = '<a id="target" name="legacy">x</a>';
			const source = `<script id="gone">abc</script>${retained}`;
			const result = sanitize(source);
			expect(result.html).toBe(retained);
			expect(result.report.outputCodeUnits).toBe(retained.length);
			expect(result.report.omittedSubtrees).toEqual({ script: 1 });
			if (rawPolicy) {
				expect(result.report.rawTextPolicy).toBe(rawPolicy);
				expect(result.report.textCodeUnits).toBe(1);
				expect(result.report.omittedRaw).toMatchObject({
					codeUnits: 3,
					elements: 1,
				});
			} else {
				expect(result.report).not.toHaveProperty("rawTextPolicy");
				expect(result.report).not.toHaveProperty("omittedRaw");
				expect(result.report.textCodeUnits).toBe(4);
			}
		});
	},
);
