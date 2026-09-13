import { afterEach, expect, it } from "vitest";
import { selectDocumentFragmentTarget } from "./document-url.js";
import type { DocumentLimits, DocumentTree } from "./document.js";
import type { NetworkResponse } from "./network.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";
import { DocumentQueries } from "./selectors.js";

const baseUrl = "https://reader.invalid/passive-anchors";
const profiles = ["default", "long-v1"] as const;
const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of queryOwners.splice(0)) {
		queries.close();
		expect(queries.metrics()).toMatchObject({
			closed: true,
			indexedNodes: 0,
			cachedSelectors: 0,
		});
	}
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

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

function reader(
	source: string,
	profile: ResearchDocumentProfileId = "default",
	limits: Partial<DocumentLimits> = {},
) {
	const tree = loadResearchDocument(
		response(source),
		{
			tabId: "synthetic-reader-anchors",
			signal: new AbortController().signal,
			limits: { ...researchLongDocumentAdmission.document, ...limits },
			initializeDocument: (document) => {
				documents.push(document);
			},
		},
		profile,
	);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing reader node: ${selector}`);
		return found;
	};
	return { tree, queries, id };
}

function target(tree: DocumentTree, fragment: string) {
	tree.setUrl(`${baseUrl}#${fragment}`);
	tree.setTargetElement(selectDocumentFragmentTarget(tree));
	return tree.targetElement;
}

function failure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("Expected bounded reader failure");
}

it.each(profiles)(
	"retains passive CSSOM-style dfn targets and native fragment selection in %s",
	(profile) => {
		const source =
			'<p>The <dfn id="dom-element-getclientrects"><code>getClientRects()</code></dfn> method.</p><p>The <dfn id="dom-element-getboundingclientrect"><code>getBoundingClientRect()</code></dfn> method.</p>';
		const sanitized = sanitizeResearchHtml(source, {}, undefined, profile);
		expect(sanitized.html).toBe(source);
		expect(sanitized.report).toMatchObject({
			ignoredAttributes: 0,
			unwrappedElements: 0,
		});
		const { tree, queries, id } = reader(source, profile);
		expect(queries.querySelectorAll("dfn")).toHaveLength(2);
		for (const [fragment, label] of [
			["dom-element-getclientrects", "getClientRects()"],
			["dom-element-getboundingclientrect", "getBoundingClientRect()"],
		]) {
			const definition = id(`#${fragment}`);
			expect(tree.get(definition).tagName).toBe("dfn");
			expect(tree.textContent(definition)).toBe(label);
			expect(tree.get(id(`#${fragment} > code`)).parent).toBe(definition);
			expect(target(tree, fragment)).toBe(definition);
			expect(queries.querySelectorAll(":target")).toEqual([definition]);
		}
		expect(researchReaderInfo(tree)).toMatchObject({
			partial: true,
			styling: false,
			scripting: false,
		});
	},
);

it("retains nested dfn descendants without absorbing the following sibling", () => {
	const source =
		'<p id="context"><dfn id="outer">Outer <dfn id="inner"><code id="code">term</code></dfn> tail</dfn><span id="after">after</span></p>';
	expect(sanitizeResearchHtml(source).html).toBe(source);
	const { tree, id } = reader(source);
	expect(tree.textContent(id("#outer"))).toBe("Outer term tail");
	expect(tree.textContent(id("#inner"))).toBe("term");
	expect(tree.get(id("#inner")).parent).toBe(id("#outer"));
	expect(tree.get(id("#code")).parent).toBe(id("#inner"));
	expect(tree.get(id("#after")).parent).toBe(id("#context"));
});

it.each(["unknown", "x-widget", "label", "button"])(
	"emits an empty opening-position anchor for %s without retaining its semantics",
	(tag) => {
		const source = `<p id="host">before<${tag} id="point">middle<em id="child">inside</em></${tag}>after</p>`;
		const expected =
			'<p id="host">before<span id="point"></span>middle<em id="child">inside</em>after</p>';
		const sanitized = sanitizeResearchHtml(source);
		expect(sanitized.html).toBe(expected);
		expect(sanitized.report).toMatchObject({
			unwrappedElements: 1,
			ignoredAttributes: 0,
			outputCodeUnits: expected.length,
		});
		const { tree, queries, id } = reader(source);
		const point = id("#point");
		expect(tree.get(point)).toMatchObject({
			tagName: "span",
			attributes: { id: "point" },
			children: [],
			parent: id("#host"),
		});
		expect(tree.textContent(point)).toBe("");
		expect(tree.textContent(id("#host"))).toBe("beforemiddleinsideafter");
		expect(tree.get(id("#child")).parent).toBe(id("#host"));
		expect(queries.querySelector(tag)).toBeNull();
		expect(target(tree, "point")).toBe(point);
		expect(queries.querySelector(":target")).toBe(point);
	},
);

it("unwraps nested same-name elements without aliasing their end tags to spans", () => {
	const source =
		'<x-widget id="outer">O<x-widget id="inner">I</x-widget>T</x-widget><dfn id="after">A</dfn>';
	const expected =
		'<span id="outer"></span>O<span id="inner"></span>IT<dfn id="after">A</dfn>';
	const sanitized = sanitizeResearchHtml(source);
	expect(sanitized.html).toBe(expected);
	expect(sanitized.report).toMatchObject({
		unwrappedElements: 2,
		ignoredAttributes: 0,
	});
	const { tree, queries, id } = reader(source);
	expect(queries.querySelectorAll("[id]")).toEqual([
		id("#outer"),
		id("#inner"),
		id("#after"),
	]);
	expect(tree.get(id("#outer")).children).toEqual([]);
	expect(tree.get(id("#inner")).children).toEqual([]);
	expect(tree.textContent(id("body"))).toBe("OITA");
});

it("keeps retained span ancestry while unwrapping unknown elements with and without ids", () => {
	const source =
		'<span id="host">before<x-widget id="point"><span id="child">inside</span>after</x-widget><unknown>plain</unknown><span id="sibling">end</span></span>';
	expect(sanitizeResearchHtml(source).html).toBe(
		'<span id="host">before<span id="point"></span><span id="child">inside</span>afterplain<span id="sibling">end</span></span>',
	);
	const { tree, queries, id } = reader(source);
	for (const selector of ["#point", "#child", "#sibling"])
		expect(tree.get(id(selector)).parent).toBe(id("#host"));
	expect(queries.querySelectorAll("span")).toHaveLength(4);
	expect(tree.textContent(id("#host"))).toBe("beforeinsideafterplainend");
});

it("preserves duplicate-id document order, ID precedence and native target invalidation", () => {
	const { tree, queries, id } = reader(
		'<a name="duplicate">legacy</a><x-widget id="duplicate">first</x-widget><dfn id="duplicate">second</dfn><x-widget id="last">last</x-widget>',
	);
	const duplicates = queries.querySelectorAll('[id="duplicate"]');
	expect(duplicates).toHaveLength(2);
	expect(duplicates.map((node) => tree.get(node).tagName)).toEqual([
		"span",
		"dfn",
	]);
	expect(target(tree, "duplicate")).toBe(duplicates[0]);
	expect(queries.querySelectorAll("[id]")).toEqual([
		...duplicates,
		id("#last"),
	]);
	tree.remove(duplicates[0]);
	expect(target(tree, "duplicate")).toBe(duplicates[1]);
	expect(queries.querySelectorAll(":target")).toEqual([duplicates[1]]);
});

it.each(["dfn", "x-widget"])(
	"round-trips escaped %s ids without attribute injection and selects the decoded fragment",
	(tag) => {
		const source = `<${tag} id="quote&quot; onclick=&quot;bad&amp;&lt;日😀+%23">Term</${tag}>`;
		const identifier = 'quote" onclick="bad&<日😀+%23';
		const sanitized = sanitizeResearchHtml(source);
		const expected =
			tag === "dfn"
				? source
				: '<span id="quote&quot; onclick=&quot;bad&amp;&lt;日😀+%23"></span>Term';
		expect(sanitized.html).toBe(expected);
		expect(sanitized.report.ignoredAttributes).toBe(0);
		const { tree, queries, id } = reader(source);
		const anchor = id("[id]");
		expect(tree.get(anchor).attributes).toEqual({ id: identifier });
		expect(queries.querySelector("[onclick]")).toBeNull();
		expect(queries.querySelectorAll("[id]")).toHaveLength(1);
		expect(target(tree, encodeURIComponent(identifier))).toBe(anchor);
		expect(queries.querySelector(":target")).toBe(anchor);
	},
);

it("retains empty ids as attributes without inventing a target for the empty fragment", () => {
	const source = '<dfn id="">Term</dfn><x-widget id>Tail</x-widget>';
	expect(sanitizeResearchHtml(source).html).toBe(
		'<dfn id="">Term</dfn><span id=""></span>Tail',
	);
	const { tree, queries } = reader(source);
	const anchors = queries.querySelectorAll('[id=""]');
	expect(anchors).toHaveLength(2);
	expect(anchors.map((node) => tree.get(node).tagName)).toEqual([
		"dfn",
		"span",
	]);
	expect(target(tree, "")).toBeNull();
	expect(queries.querySelector(":target")).toBeNull();
});

it.each([
	["script", '<script id="omitted"><dfn id="inside">hidden</dfn></script>'],
	["style", '<style id="omitted"><dfn id="inside">hidden</dfn></style>'],
	["svg", '<svg id="omitted"><dfn id="inside">hidden</dfn></svg>'],
	["input", '<input id="omitted" name="inside" value="hidden">'],
	[
		"template",
		'<template id="omitted"><x-widget id="inside">hidden</x-widget></template>',
	],
	["iframe", '<iframe id="omitted"><dfn id="inside">hidden</dfn></iframe>'],
])("never emits point anchors from omitted %s content", (tag, omitted) => {
	const retained = '<dfn id="visible">Visible</dfn>';
	const source = omitted + retained;
	for (const profile of profiles) {
		const sanitized = sanitizeResearchHtml(
			source,
			{},
			undefined,
			profile,
			profile === "long-v1" ? "separate-omitted-raw-v1" : undefined,
		);
		expect(sanitized.html).toBe(retained);
		expect(sanitized.report.omittedSubtrees[tag]).toBe(1);
		const { tree, queries, id } = reader(source, profile);
		expect(queries.querySelectorAll("[id]")).toEqual([id("#visible")]);
		expect(target(tree, "omitted")).toBeNull();
		expect(target(tree, "inside")).toBeNull();
		expect(tree.textContent(id("body"))).toBe("Visible");
	}
});

it("retains only ids on definitions and unknown point anchors and accounts for dropped attributes", () => {
	for (const tag of ["dfn", "x-widget"]) {
		const source = `<${tag} id="point" name="legacy" href="/next" src="/image" style="color:red" onclick="bad()" title="title">Child</${tag}>`;
		const sanitized = sanitizeResearchHtml(source);
		expect(sanitized.report).toMatchObject({
			ignoredAttributes: 6,
			unwrappedElements: tag === "dfn" ? 0 : 1,
		});
		const { tree, queries, id } = reader(source);
		expect(tree.get(id("#point")).attributes).toEqual({ id: "point" });
		expect(target(tree, "legacy")).toBeNull();
		for (const attribute of [
			"name",
			"href",
			"src",
			"style",
			"onclick",
			"title",
		])
			expect(queries.querySelector(`[${attribute}]`)).toBeNull();
	}
});

it("leaves retained links and named anchors unchanged without substituting names for missing ids", () => {
	const source =
		'<a id="link" name="legacy" href="/next#point" title="Next">Link</a><a name="named">Named</a><dfn name="not-dfn">Term</dfn><x-widget name="not-widget">Tail</x-widget>';
	expect(sanitizeResearchHtml(source).html).toBe(
		'<a id="link" name="legacy" href="/next#point" title="Next">Link</a><a name="named">Named</a><dfn>Term</dfn>Tail',
	);
	const { tree, queries, id } = reader(source);
	expect(tree.get(id("#link")).attributes).toEqual({
		id: "link",
		name: "legacy",
		href: "/next#point",
		title: "Next",
	});
	expect(target(tree, "legacy")).toBe(id("#link"));
	expect(target(tree, "named")).toBe(id('[name="named"]'));
	expect(target(tree, "not-dfn")).toBeNull();
	expect(target(tree, "not-widget")).toBeNull();
	expect(queries.querySelectorAll("[id]")).toEqual([id("#link")]);
	expect(queries.querySelector("span")).toBeNull();
});

it("keeps point anchors and definitions inside paragraphs across implied paragraph ends", () => {
	const source =
		'<p id="first"><x-widget id="point">one</x-widget><dfn id="term">term</dfn><p id="second">two';
	const sanitized = sanitizeResearchHtml(source, { maxDepth: 2 });
	expect(sanitized.html).toBe(
		'<p id="first"><span id="point"></span>one<dfn id="term">term</dfn><p id="second">two',
	);
	const { tree, id } = reader(source);
	expect(tree.get(id("#point")).parent).toBe(id("#first"));
	expect(tree.get(id("#term")).parent).toBe(id("#first"));
	expect(tree.get(id("#second")).parent).toBe(id("body"));
	expect(tree.textContent(id("#first"))).toBe("oneterm");
	expect(tree.textContent(id("#second"))).toBe("two");
});

it("charges escaped point-anchor markup to the output budget and recovers at equality", () => {
	const source = '<x-widget id="a&b">x</x-widget>';
	const expected = '<span id="a&amp;b"></span>x';
	const error = failure(() =>
		sanitizeResearchHtml(source, { maxOutputCodeUnits: expected.length - 1 }),
	);
	expect(error).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(error)).toMatchObject({
		kind: "reader.output",
		unit: "code-units",
		limit: expected.length - 1,
	});
	const recovered = sanitizeResearchHtml(source, {
		maxOutputCodeUnits: expected.length,
	});
	expect(recovered.html).toBe(expected);
	expect(recovered.report).toMatchObject({
		outputCodeUnits: expected.length,
		textCodeUnits: 1,
		ignoredAttributes: 0,
	});
});

const budgetSource = '<x-widget id="point">a😀</x-widget>';

it.each([
	["maxSourceCodeUnits", "reader.source", budgetSource.length - 1],
	["maxTextCodeUnits", "reader.text", 2],
	["maxTokens", "reader.tokens", 2],
] as const)(
	"keeps %s authoritative while retaining point anchors",
	(limitName, kind, limit) => {
		const error = failure(() =>
			sanitizeResearchHtml(budgetSource, { [limitName]: limit }),
		);
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(resourceLimitDiagnostic(error)).toMatchObject({ kind, limit });
		const recovered = sanitizeResearchHtml(budgetSource, {
			maxSourceCodeUnits: budgetSource.length,
			maxTextCodeUnits: 3,
			maxTokens: 3,
		});
		expect(recovered.html).toBe('<span id="point"></span>a😀');
		expect(recovered.report).toMatchObject({
			sourceCodeUnits: budgetSource.length,
			textCodeUnits: 3,
			tokens: 3,
			unwrappedElements: 1,
		});
	},
);

it("counts unknown-element source depth even though emitted point anchors are empty", () => {
	const source =
		'<x-widget id="outer"><x-widget id="inner">x</x-widget></x-widget>';
	const error = failure(() => sanitizeResearchHtml(source, { maxDepth: 1 }));
	expect(error).toMatchObject({ code: "resource-limit" });
	expect(resourceLimitDiagnostic(error)).toMatchObject({
		kind: "reader.depth",
		limit: 1,
		observed: 2,
	});
	expect(sanitizeResearchHtml(source, { maxDepth: 2 }).html).toBe(
		'<span id="outer"></span><span id="inner"></span>x',
	);
});

it.each(profiles)(
	"charges synthetic anchors to the %s document-node cap, closes failure owners and recovers",
	(profile) => {
		const source = Array.from(
			{ length: 12 },
			(_value, index) => `<x-widget id="point-${index}"></x-widget>`,
		).join("");
		const before = documents.length;
		const error = failure(() => reader(source, profile, { maxNodes: 8 }));
		expect(error).toMatchObject({ code: "resource-limit" });
		expect(documents).toHaveLength(before + 1);
		const failedTree = documents[before];
		expect(failedTree.nodeCount).toBe(0);
		expect(() => failedTree.get(failedTree.root)).toThrow("closed");
		const recovered = reader(source, profile, { maxNodes: 64 });
		expect(recovered.queries.querySelectorAll("span[id]")).toHaveLength(12);
		expect(target(recovered.tree, "point-11")).toBe(recovered.id("#point-11"));
		expect(recovered.queries.querySelector(":target")).toBe(
			recovered.id("#point-11"),
		);
		recovered.queries.close();
		recovered.tree.close();
		expect(recovered.queries.metrics().closed).toBe(true);
		expect(recovered.tree.nodeCount).toBe(0);
	},
);
