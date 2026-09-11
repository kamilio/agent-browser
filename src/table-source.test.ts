import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	type ExtractedNode,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	loadResearchDocument,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

const url = "https://table-source.invalid/synthetic";
const trees: DocumentTree[] = [];
const tags = [
	{ tagName: "table", allowed: ["id"] },
	{ tagName: "caption", allowed: ["id"] },
	{ tagName: "thead", allowed: ["id"] },
	{ tagName: "tbody", allowed: ["id"] },
	{ tagName: "tfoot", allowed: ["id"] },
	{ tagName: "tr", allowed: ["id"] },
	{ tagName: "col", allowed: ["id", "span"] },
	{ tagName: "colgroup", allowed: ["id", "span"] },
	{ tagName: "td", allowed: ["id", "headers", "colspan", "rowspan"] },
	{
		tagName: "th",
		allowed: ["id", "headers", "colspan", "rowspan", "scope", "abbr"],
	},
];
const routes = ["native", "reader"] as const;
type Route = (typeof routes)[number];
const candidateAttributes: Record<string, string> = {
	id: "source-id",
	span: " +02 ",
	headers: "missing duplicate duplicate",
	colspan: "not-a-number",
	rowspan: "-3",
	scope: " ROWGROUP ",
	abbr: "short label",
	onclick: "event-marker",
	style: "color: red",
	href: "/discarded-link",
	src: "/discarded-image",
	class: "discarded-class",
	title: "discarded-title",
	"data-source": "discarded-data",
};

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function document() {
	const tree = new DocumentTree(url);
	trees.push(tree);
	return tree;
}

function load(source: string, route: Route, maxTextCodeUnits = 100_000) {
	const body = new TextEncoder().encode(source);
	const tree =
		route === "native"
			? parseHtmlDocument(source, url)
			: loadResearchDocument(
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
						tabId: "synthetic-table-source",
						signal: new AbortController().signal,
						limits: {
							maxNodes: 1024,
							maxDepth: 64,
							maxTextCodeUnits,
							maxChanges: 1024,
						},
					},
				);
	trees.push(tree);
	return tree;
}

function append(
	tree: DocumentTree,
	parent: number,
	tagName: string,
	attributes: Record<string, string> = {},
	text?: string,
) {
	const id = tree.createElement(tagName, attributes);
	tree.append(parent, id);
	if (text !== undefined) tree.setTextContent(id, text);
	return id;
}

function element(tree: DocumentTree, selector: string) {
	const id = new DocumentQueries(tree).querySelector(selector);
	if (id === null) throw new Error(`Missing fixture element: ${selector}`);
	return id;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function structured(tree: DocumentTree, options: ExtractionOptions = {}) {
	const result = extractDocument(tree, {
		...options,
		format: "json",
		tableMetadata: true,
	});
	if (result.format !== "json") throw new Error("Expected JSON extraction");
	return result;
}

function record(root: ExtractedNode, tree: DocumentTree, id: number) {
	const node = flattened(root).find(
		(entry) => entry.ref === tree.reference(id),
	);
	if (!node) throw new Error(`Missing extracted fixture node: ${id}`);
	return node;
}

function sourceMetadata(tagName: string, attributes: Record<string, string>) {
	return { kind: "native-table-source-v1", tag: tagName, attributes };
}

function fixture(tagName: string, attributes: string) {
	const target = `<${tagName}${attributes ? ` ${attributes}` : ""}>`;
	if (tagName === "table") return `${target}</table>`;
	if (tagName === "col") return `<table><colgroup>${target}</colgroup></table>`;
	if (tagName === "td" || tagName === "th")
		return `<table><tbody><tr>${target}Cell</${tagName}></tr></tbody></table>`;
	if (tagName === "tr")
		return `<table><tbody>${target}<td>Cell</td></tr></tbody></table>`;
	if (["thead", "tbody", "tfoot"].includes(tagName))
		return `<table>${target}<tr><td>Cell</td></tr></${tagName}></table>`;
	return `<table>${target}</${tagName}></table>`;
}

it.each(tags.flatMap((entry) => routes.map((route) => ({ ...entry, route }))))(
	"retains only the exact $tagName allowlist through $route",
	({ tagName, allowed, route }) => {
		const attributes = Object.entries(candidateAttributes)
			.map(([name, value]) => `${name}="${value}"`)
			.join(" ");
		const source = fixture(tagName, attributes);
		const expected = Object.fromEntries(
			allowed.map((name) => [name, candidateAttributes[name]]),
		);
		const tree = load(source, route);
		const id = element(tree, tagName);
		expect(record(structured(tree).content, tree, id).tableSource).toEqual(
			sourceMetadata(tagName, expected),
		);
		if (route === "reader") {
			expect(tree.get(id).attributes).toEqual(expected);
			const sanitized = sanitizeResearchHtml(source);
			const sanitizedTree = load(sanitized.html, "native");
			expect(
				sanitizedTree.get(element(sanitizedTree, tagName)).attributes,
			).toEqual(expected);
			expect(sanitized.report.ignoredAttributes).toBe(
				Object.keys(candidateAttributes).length - allowed.length,
			);
		}
	},
);

it.each(tags)(
	"identifies attribute-free $tagName without inferred fields",
	({ tagName }) => {
		const tree = document();
		const id = append(tree, tree.root, tagName);
		expect(record(structured(tree).content, tree, id).tableSource).toEqual(
			sourceMetadata(tagName, {}),
		);
	},
);

it.each(routes)(
	"preserves decoded, empty and unusual strings through %s",
	(route) => {
		const tree = load(
			'<table id=""><colgroup span="000"><col span="-2"></colgroup><tbody><tr><th id="a&amp;b&quot;&lt;&gt;😀" headers=" missing&#9;duplicate duplicate " colspan="0" rowspan="+0002" scope=" RoW " abbr="">Header</th><td headers="" colspan="NaN" rowspan="1.5">Data</td></tr></tbody></table>',
			route,
		);
		const result = structured(tree);
		for (const [selector, attributes] of [
			["table", { id: "" }],
			["colgroup", { span: "000" }],
			["col", { span: "-2" }],
			[
				"th",
				{
					id: 'a&b"<>😀',
					headers: " missing\tduplicate duplicate ",
					colspan: "0",
					rowspan: "+0002",
					scope: " RoW ",
					abbr: "",
				},
			],
			["td", { headers: "", colspan: "NaN", rowspan: "1.5" }],
		] as const) {
			expect(
				record(result.content, tree, element(tree, selector)).tableSource,
			).toEqual(sourceMetadata(selector, attributes));
		}
		expect(
			flattened(result.content).filter((node) => node.type === "cell"),
		).toHaveLength(2);
	},
);

it("keeps default JSON and verbose Markdown unchanged, including explicit false", () => {
	const tree = document();
	const table = append(tree, tree.root, "table", { id: "source" });
	const row = append(tree, table, "tr");
	const cell = append(tree, row, "th", { scope: "col" }, "Header");
	const text = tree.get(cell).children[0];
	const baseline = extractDocument(tree, { format: "json" });
	expect(baseline.content).toEqual({
		ref: tree.reference(tree.root),
		type: "container",
		children: [
			{
				ref: tree.reference(table),
				type: "table",
				children: [
					{
						ref: tree.reference(row),
						type: "row",
						children: [
							{
								ref: tree.reference(cell),
								type: "cell",
								children: [
									{ ref: tree.reference(text), type: "text", text: "Header" },
								],
							},
						],
					},
				],
			},
		],
	});
	expect(
		extractDocument(tree, { format: "json", tableMetadata: false }),
	).toEqual(baseline);
	const markdown = extractDocument(tree);
	expect(markdown.content).toBe(
		`${[
			"**Native table begin (selected structure only; associations unspecified)**",
			"**Native row begin (selected structure only)**",
			"**Native cell begin (selected structure only)**",
			"Header",
			"**Native cell end**",
			"**Native row end**",
			"**Native table end**",
		].join("\n\n")}\n`,
	);
	expect(extractDocument(tree, { tableMetadata: false })).toEqual(markdown);
	expect(
		extractDocument(tree, { format: "markdown", tableMetadata: false }),
	).toEqual(markdown);
	const optedIn = structured(tree);
	expect(record(optedIn.content, tree, text)).not.toHaveProperty("tableSource");
	expect(
		JSON.stringify(optedIn, (key, value) =>
			key === "tableSource" ? undefined : value,
		),
	).toBe(JSON.stringify(baseline));
});

it.each([undefined, "markdown"] as const)(
	"rejects metadata with Markdown format %s",
	(format) => {
		expect(() =>
			extractDocument(document(), { format, tableMetadata: true }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each(
	[null, 0, 1, "true", [], {}].flatMap((tableMetadata) =>
		(["json", "markdown"] as const).map((format) => ({
			format,
			tableMetadata,
		})),
	),
)(
	"rejects nonboolean metadata $tableMetadata with $format",
	({ format, tableMetadata }) => {
		expect(() =>
			extractDocument(document(), {
				format,
				tableMetadata,
			} as unknown as ExtractionOptions),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);

it.each(
	tags.flatMap(({ tagName, allowed }) =>
		allowed.map((attribute) => ({ tagName, attribute })),
	),
)(
	"accepts 4096 UTF-16 units and rejects 4097 for $tagName.$attribute",
	({ tagName, attribute }) => {
		const tree = document();
		const value = "😀".repeat(2048);
		const id = append(tree, tree.root, tagName, { [attribute]: value });
		expect(record(structured(tree).content, tree, id).tableSource).toEqual(
			sourceMetadata(tagName, { [attribute]: value }),
		);
		tree.setAttribute(id, attribute, `${value}x`);
		expect(() => structured(tree)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(() => extractDocument(tree, { format: "json" })).not.toThrow();
		expect(() => extractDocument(tree, { tableMetadata: false })).not.toThrow();
	},
);

it("retains oversized reader attributes but rejects opt-in extraction without truncation", () => {
	const value = "x".repeat(4097);
	const tree = load(fixture("th", `abbr="${value}"`), "reader");
	expect(tree.get(element(tree, "th")).attributes.abbr).toBe(value);
	expect(() => structured(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => extractDocument(tree, { format: "json" })).not.toThrow();
});

it("does not apply the table attribute bound to denied combinations or non-table nodes", () => {
	const tree = document();
	const value = "x".repeat(4097);
	const table = append(tree, tree.root, "table", {
		scope: value,
		"data-source": value,
	});
	const paragraph = append(
		tree,
		tree.root,
		"p",
		{ id: value, headers: value },
		"Public",
	);
	const result = structured(tree);
	expect(record(result.content, tree, table).tableSource).toEqual(
		sourceMetadata("table", {}),
	);
	expect(record(result.content, tree, paragraph)).not.toHaveProperty(
		"tableSource",
	);
});

it("charges metadata against the exact serialized UTF-8 output quota", () => {
	const tree = document();
	append(tree, tree.root, "table", { id: "😀".repeat(200) });
	const baseline = extractDocument(tree, { format: "json" });
	const expected = structured(tree);
	const bytes = new TextEncoder().encode(JSON.stringify(expected)).byteLength;
	const baselineBytes = new TextEncoder().encode(
		JSON.stringify(baseline),
	).byteLength;
	expect(bytes).toBeGreaterThan(baselineBytes);
	expect(structured(tree, { maxBytes: bytes })).toEqual(expected);
	expect(() => structured(tree, { maxBytes: bytes - 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(
		extractDocument(tree, {
			format: "json",
			maxBytes: Math.max(256, baselineBytes),
		}),
	).toEqual(baseline);
});

it.each([{ maxNodes: 2 }, { maxDepth: 1 }])(
	"keeps extraction structure bounds %o",
	(options) => {
		const tree = document();
		const table = append(tree, tree.root, "table", { id: "bounded" });
		append(tree, table, "tr", { id: "row" });
		expect(() => structured(tree, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it.each([
	{
		option: "maxSourceCodeUnits",
		source: '<table id="x"></table>',
		boundary: 22,
	},
	{
		option: "maxOutputCodeUnits",
		source: '<table id="&"></table>',
		boundary: 26,
	},
	{ option: "maxTokens", source: '<table id="x"></table>', boundary: 2 },
	{
		option: "maxDepth",
		source: '<table id="x"><tbody id="y"></tbody></table>',
		boundary: 2,
	},
	{
		option: "maxTextCodeUnits",
		source: '<table><caption id="x">😀</caption></table>',
		boundary: 2,
	},
])(
	"keeps reader $option bounds while retaining attributes",
	({ option, source, boundary }) => {
		expect(() =>
			sanitizeResearchHtml(source, { [option]: boundary }),
		).not.toThrow();
		expect(() =>
			sanitizeResearchHtml(source, { [option]: boundary - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("charges escaped retained attributes to the loader's reader output quota", () => {
	const source = `<table id="${"&".repeat(20)}"></table>`;
	const expected = `<table id="${"&amp;".repeat(20)}"></table>`;
	expect(sanitizeResearchHtml(source).html).toBe(expected);
	expect(sanitizeResearchHtml(source).report.outputCodeUnits).toBe(
		expected.length,
	);
	expect(() => load(source, "reader", expected.length - 1)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const tree = load(source, "reader", expected.length);
	expect(
		record(structured(tree).content, tree, element(tree, "table")).tableSource,
	).toEqual(sourceMetadata("table", { id: "&".repeat(20) }));
});

it.each([
	{ hidden: "" },
	{ inert: "" },
	{ "aria-hidden": "true" },
	{ style: "display:none" },
] as Record<string, string>[])(
	"omits excluded table subtrees with %o before attribute admission",
	(attributes) => {
		const tree = document();
		const table = append(tree, tree.root, "table", {
			...attributes,
			id: "x".repeat(4097),
		});
		const row = append(tree, table, "tr");
		const cell = append(
			tree,
			row,
			"td",
			{ headers: "hidden-header" },
			"Hidden text",
		);
		const result = structured(tree);
		for (const id of [table, row, cell]) {
			expect(
				flattened(result.content).some(
					(node) => node.ref === tree.reference(id),
				),
			).toBe(false);
		}
		expect(JSON.stringify(result)).not.toContain("hidden-header");
		expect(
			flattened(structured(tree, { root: tree.reference(cell) }).content).every(
				(node) => !Object.hasOwn(node, "tableSource"),
			),
		).toBe(true);
	},
);

it("omits invisible ancestor metadata while retaining visibly overridden descendants", () => {
	const tree = document();
	const table = append(tree, tree.root, "table", {
		style: "visibility:hidden",
		id: "x".repeat(4097),
	});
	const row = append(tree, table, "tr", { id: "hidden-row" });
	const cell = append(
		tree,
		row,
		"td",
		{ style: "visibility:visible", headers: "visible-header" },
		"Visible",
	);
	const result = structured(tree);
	for (const id of [table, row])
		expect(record(result.content, tree, id)).not.toHaveProperty("tableSource");
	expect(record(result.content, tree, cell).tableSource).toEqual(
		sourceMetadata("td", { headers: "visible-header" }),
	);
});

it("omits context-only ancestor metadata and out-of-section tables", () => {
	const tree = document();
	const table = append(tree, tree.root, "table", { id: "x".repeat(4097) });
	const section = append(tree, table, "tbody", { id: "context-section" });
	const row = append(tree, section, "tr", { id: "context-row" });
	const cell = append(tree, row, "td", { id: "context-cell" });
	append(tree, cell, "p", {}, "Excluded prefix");
	const heading = append(tree, cell, "h2", {}, "Start");
	const selected = append(
		tree,
		row,
		"th",
		{ scope: "row", id: "selected" },
		"Selected",
	);
	const laterRow = append(tree, section, "tr", { id: "selected-row" });
	append(tree, laterRow, "td", { headers: "selected" }, "Later");
	append(tree, tree.root, "h2", {}, "Stop");
	const excluded = append(tree, tree.root, "table", { id: "x".repeat(4097) });
	const result = structured(tree, { section: tree.reference(heading) });
	for (const id of [tree.root, table, section, row, cell]) {
		const node = record(result.content, tree, id);
		expect(node.type).toBe("container");
		expect(node).not.toHaveProperty("tableSource");
	}
	expect(record(result.content, tree, selected).tableSource).toEqual(
		sourceMetadata("th", { id: "selected", scope: "row" }),
	);
	expect(record(result.content, tree, laterRow).tableSource).toEqual(
		sourceMetadata("tr", { id: "selected-row" }),
	);
	expect(
		flattened(result.content).some(
			(node) => node.ref === tree.reference(excluded),
		),
	).toBe(false);
	expect(JSON.stringify(result)).not.toContain("Excluded prefix");
});

it.each(routes)(
	"keeps nested table metadata local without resolving header IDs through %s",
	(route) => {
		const tree = load(
			'<table id="outer"><thead id="head"><tr><th id="shared" scope="col">Outer header</th></tr></thead><tbody id="body"><tr><td headers="shared missing" colspan="2">Outer<table id="inner"><tbody><tr><th id="shared" scope="row">Inner header</th><td headers="shared" rowspan="0">Inner</td></tr></tbody></table></td></tr></tbody><tfoot id="foot"><tr><td>End</td></tr></tfoot></table>',
			route,
		);
		const result = structured(tree);
		const nodes = flattened(result.content);
		expect(nodes.filter((node) => node.type === "table")).toHaveLength(2);
		for (const tagName of ["thead", "tbody", "tfoot"]) {
			for (const id of new DocumentQueries(tree).querySelectorAll(tagName)) {
				expect(record(result.content, tree, id).tableSource).toEqual(
					sourceMetadata(tagName, { ...tree.get(id).attributes }),
				);
			}
		}
		const outerCell = record(
			result.content,
			tree,
			element(tree, "td[headers='shared missing']"),
		);
		const inner = record(result.content, tree, element(tree, "#inner"));
		expect(flattened(outerCell)).toContain(inner);
		expect(outerCell.tableSource).toEqual(
			sourceMetadata("td", { headers: "shared missing", colspan: "2" }),
		);
		expect(inner.tableSource).toEqual(sourceMetadata("table", { id: "inner" }));
		const scoped = structured(tree, {
			root: tree.reference(element(tree, "#inner")),
		});
		expect(
			flattened(scoped.content).filter((node) => node.type === "table"),
		).toHaveLength(1);
		expect(JSON.stringify(scoped.content)).not.toContain('"outer"');
		expect(nodes.filter((node) => node.type === "cell")).toHaveLength(5);
	},
);

it("owns metadata snapshots independently of later DOM mutations and extractions", () => {
	const tree = document();
	const cell = append(tree, tree.root, "th", {
		id: "before",
		headers: "old",
		scope: "col",
	});
	const first = record(structured(tree).content, tree, cell).tableSource;
	const second = record(structured(tree).content, tree, cell).tableSource;
	expect(first).toEqual(
		sourceMetadata("th", { id: "before", headers: "old", scope: "col" }),
	);
	expect(second).toEqual(first);
	expect(second).not.toBe(first);
	expect(second?.attributes).not.toBe(first?.attributes);
	tree.setAttribute(cell, "id", "after");
	tree.removeAttribute(cell, "headers");
	tree.setAttribute(cell, "scope", "invalid");
	expect(first).toEqual(
		sourceMetadata("th", { id: "before", headers: "old", scope: "col" }),
	);
	expect(record(structured(tree).content, tree, cell).tableSource).toEqual(
		sourceMetadata("th", { id: "after", scope: "invalid" }),
	);
	tree.remove(cell);
	expect(second).toEqual(first);
});

it("does not extend reader attribute retention to non-table elements or executable subtrees", () => {
	const source =
		'<div id="discarded" headers="discarded" span="2" scope="row" abbr="discarded" data-source="discarded" onclick="discarded" style="color:red"><p colspan="2" rowspan="3">Public</p><a href="/next" title="Next">Link</a><img alt="Alternative" src="/discarded"><ol start="2"><li>Item</li></ol></div><script>omitted-script</script><style>omitted-css</style><template><table id="omitted-table"></table></template>';
	const sanitized = sanitizeResearchHtml(source);
	for (const marker of [
		"discarded",
		"omitted-script",
		"omitted-css",
		"omitted-table",
	])
		expect(sanitized.html).not.toContain(marker);
	const tree = load(source, "reader");
	for (const selector of ["div", "p"])
		expect(tree.get(element(tree, selector)).attributes).toEqual({});
	expect(tree.get(element(tree, "a")).attributes).toEqual({
		href: "/next",
		title: "Next",
	});
	expect(tree.get(element(tree, "img")).attributes).toEqual({
		alt: "Alternative",
	});
	expect(tree.get(element(tree, "ol")).attributes).toEqual({ start: "2" });
	for (const node of flattened(structured(tree).content))
		expect(node).not.toHaveProperty("tableSource");
});
