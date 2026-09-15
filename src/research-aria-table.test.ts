import { afterEach, expect, it } from "vitest";
import { hasResearchExtractionContent } from "../scripts/research-content.js";
import type { DocumentTree } from "./document.js";
import { type ExtractedNode, extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	loadResearchDocument,
	researchReaderInfo,
	sanitizeResearchHtml,
} from "./research-loader.js";
import { DocumentQueries } from "./selectors.js";

interface AriaSource {
	kind: "native-aria-table-source-v1";
	tag: string;
	role: "table" | "rowgroup" | "row" | "cell" | "columnheader" | "rowheader";
	attributes: Record<string, string>;
}

const url = "https://research-aria.invalid/synthetic";
const trees: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const common = [
	"id",
	"role",
	"aria-label",
	"aria-labelledby",
	"aria-describedby",
	"aria-owns",
];
const indices = ["aria-rowindex", "aria-colindex"];
const spans = ["aria-colspan", "aria-rowspan"];
const roles: { role: AriaSource["role"]; allowed: string[] }[] = [
	{ role: "table", allowed: [...common, "aria-colcount", "aria-rowcount"] },
	{ role: "rowgroup", allowed: common },
	{ role: "row", allowed: [...common, ...indices] },
	{ role: "cell", allowed: [...common, ...indices, ...spans] },
	{ role: "columnheader", allowed: [...common, ...indices, ...spans] },
	{ role: "rowheader", allowed: [...common, ...indices, ...spans] },
];

afterEach(() => {
	for (const query of queries.splice(0)) query.close();
	for (const tree of trees.splice(0)) tree.close();
});

function load(source: string, maxTextCodeUnits: number = 100_000) {
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
			tabId: "synthetic-aria-table",
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

function query(tree: DocumentTree) {
	const owner = new DocumentQueries(tree);
	queries.push(owner);
	return owner;
}

function element(owner: DocumentQueries, selector: string) {
	const id = owner.querySelector(selector);
	if (id === null) throw new Error(`Missing fixture element: ${selector}`);
	return id;
}

function flattened(node: ExtractedNode): ExtractedNode[] {
	return [node, ...(node.children ?? []).flatMap(flattened)];
}

function structured(tree: DocumentTree) {
	const result = extractDocument(tree, { format: "json", tableMetadata: true });
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

function metadata(node: ExtractedNode): AriaSource | undefined {
	return (node as ExtractedNode & { ariaTableSource?: AriaSource })
		.ariaTableSource;
}

function expected(
	tag: string,
	role: AriaSource["role"],
	attributes: Record<string, string>,
): AriaSource {
	return { kind: "native-aria-table-source-v1", tag, role, attributes };
}

it.each(roles)(
	"retains role-permitted metadata and inert selector attributes for $role",
	({ role, allowed }) => {
		const attributes: Record<string, string> = {
			id: "source",
			role,
			"aria-label": " Raw label ",
			"aria-labelledby": "missing duplicate duplicate",
			"aria-describedby": "absent",
			"aria-owns": "missing outside outside",
			"aria-colcount": "-1",
			"aria-rowcount": "unknown",
			"aria-rowindex": "0",
			"aria-colindex": "+0002",
			"aria-colspan": "NaN",
			"aria-rowspan": "-3.5",
			"aria-sort": "ascending",
			"aria-level": "2",
			"aria-selected": "true",
			"aria-hidden": "true",
			hidden: "",
			inert: "",
			style: "display:none",
			onclick: "discarded-event",
			"data-source": "discarded-data",
			class: "discarded-class",
			colspan: "9",
			headers: "native-only",
		};
		const source = `<div ${Object.entries(attributes)
			.map(([name, value]) => `${name}="${value}"`)
			.join(" ")}>Public</div>`;
		const retained = Object.fromEntries(
			allowed.map((name) => [name, attributes[name]]),
		);
		const sanitized = sanitizeResearchHtml(source);
		expect(sanitized.report.ignoredAttributes).toBe(
			Object.keys(attributes).length - allowed.length - 1,
		);
		const tree = load(source);
		const id = element(query(tree), `[role=${role}]`);
		expect(tree.get(id).attributes).toEqual({
			...retained,
			class: attributes.class,
		});
		expect(metadata(record(structured(tree).content, tree, id))).toEqual(
			expected("div", role, retained),
		);
		expect(researchReaderInfo(tree)?.hiddenContentSemantics).toBe(false);
		const reparsed = parseHtmlDocument(sanitized.html, url);
		trees.push(reparsed);
		expect(
			reparsed.get(element(query(reparsed), `[role=${role}]`)).attributes,
		).toEqual({ ...retained, class: attributes.class });
	},
);

it("retains a synthetic product comparison without combining independent rows", () => {
	const source = `<h2 id="comparison-label">Portable comparison</h2>
	<div role="table" aria-labelledby="comparison-label missing" aria-colcount="2" aria-rowcount="4" aria-owns="missing owned owned">
	<div role="rowgroup"><div role="row" aria-rowindex="1"><div role="columnheader" aria-colindex="1">Model Birch</div><div role="columnheader" aria-colindex="2">Model Cedar</div></div></div>
	<div role="rowgroup"><div role="row" aria-rowindex="2"><div role="rowheader" id="chip" aria-label="Chip">Chip</div><div role="cell" aria-labelledby="chip" aria-colindex="1">Chip B</div><div role="cell" aria-labelledby="chip" aria-colindex="2">Chip C</div></div>
	<div role="row" aria-rowindex="3"><div role="rowheader" id="memory">Memory</div><div role="cell" aria-labelledby="memory" aria-colindex="1">16 units</div><div role="cell" aria-labelledby="memory" aria-colindex="2">32 units</div></div>
	<div role="row" aria-rowindex="4"><div role="rowheader" id="power">Power</div><div role="cell" aria-labelledby="power" aria-colspan="2" aria-rowspan="1">Shared adapter</div></div></div></div>`;
	const tree = load(source);
	const owner = query(tree);
	const result = structured(tree);
	expect(owner.querySelectorAll("[role=table] > [role=rowgroup]")).toHaveLength(
		2,
	);
	expect(owner.querySelectorAll("[role=row]")).toHaveLength(4);
	expect(owner.querySelectorAll("[role=columnheader]")).toHaveLength(2);
	expect(owner.querySelectorAll("[role=rowheader]")).toHaveLength(3);
	for (const [rowIndex, label, values] of [
		["2", "Chip", ["Chip B", "Chip C"]],
		["3", "Memory", ["16 units", "32 units"]],
		["4", "Power", ["Shared adapter"]],
	] as const) {
		const row = element(owner, `[role=row][aria-rowindex="${rowIndex}"]`);
		const cells = owner.querySelectorAll("[role=cell]", row);
		expect(cells.map((id) => tree.textContent(id))).toEqual([...values]);
		const header = element(
			owner,
			`[role=row][aria-rowindex="${rowIndex}"] > [role=rowheader]`,
		);
		expect(tree.textContent(header)).toBe(label);
		expect(metadata(record(result.content, tree, row))).toEqual(
			expected("div", "row", { role: "row", "aria-rowindex": rowIndex }),
		);
	}
	const shared = element(owner, '[role=cell][aria-colspan="2"]');
	expect(metadata(record(result.content, tree, shared))).toEqual(
		expected("div", "cell", {
			role: "cell",
			"aria-labelledby": "power",
			"aria-colspan": "2",
			"aria-rowspan": "1",
		}),
	);
	const table = element(owner, "[role=table]");
	expect(metadata(record(result.content, tree, table))).toEqual(
		expected("div", "table", {
			role: "table",
			"aria-labelledby": "comparison-label missing",
			"aria-colcount": "2",
			"aria-rowcount": "4",
			"aria-owns": "missing owned owned",
		}),
	);
	expect(
		metadata(record(result.content, tree, element(owner, "#chip"))),
	).toEqual(
		expected("div", "rowheader", {
			role: "rowheader",
			id: "chip",
			"aria-label": "Chip",
		}),
	);
	for (const node of flattened(result.content))
		expect(node).not.toHaveProperty("tableSource");
});

it.each(["span", "section", "p"])(
	"preserves the original %s tag and decoded raw strings",
	(tag) => {
		const source = `<${tag} role="&#9;&#10;&#12;&#13; rowheader &#13;&#12;&#10;&#9;" id="a&amp;b&quot;&lt;&gt;😀" aria-label="" aria-labelledby=" missing&#9;duplicate duplicate " aria-rowindex="-01" aria-colspan="1.5">Header</${tag}>`;
		const tree = load(source);
		const id = element(query(tree), tag);
		expect(metadata(record(structured(tree).content, tree, id))).toEqual(
			expected(tag, "rowheader", {
				role: "\t\n\f\r rowheader \r\f\n\t",
				id: 'a&b"<>😀',
				"aria-label": "",
				"aria-labelledby": " missing\tduplicate duplicate ",
				"aria-rowindex": "-01",
				"aria-colspan": "1.5",
			}),
		);
	},
);

it.each([
	"Table",
	"grid",
	"treegrid",
	"heading",
	"table row",
	"unknown table",
	"table\tcell",
	"\u00a0table\u00a0",
	"\vtable\v",
])(
	"retains raw selector role %j without promoting ARIA table metadata",
	(role) => {
		const tree = load(
			`<div role="${role}" aria-label="discarded" aria-colcount="2">Public</div>`,
		);
		const id = element(query(tree), "div");
		expect(tree.get(id).attributes).toEqual({ role });
		expect(record(structured(tree).content, tree, id)).not.toHaveProperty(
			"ariaTableSource",
		);
	},
);

it.each([
	{ source: "\r", value: "\n" },
	{ source: "\r\n", value: "\n" },
	{ source: "\r\r\n", value: "\n\n" },
	{ source: "&#13;", value: "\r" },
	{ source: "&#xD;", value: "\r" },
	{ source: "&#13;\n", value: "\r\n" },
	{ source: "\r&#10;", value: "\n\n" },
])(
	"preserves native newline preprocessing and decoded references for $source",
	({ source: newline, value }) => {
		const source = `<div role="cell" id="a${newline}b" aria-label="a${newline}b">a${newline}b</div>`;
		const native = parseHtmlDocument(source, url);
		trees.push(native);
		const nativeId = element(query(native), "div");
		const tree = load(source);
		const id = element(query(tree), "div");
		expect(native.get(nativeId).attributes["aria-label"]).toBe(`a${value}b`);
		expect(tree.get(id).attributes).toEqual(native.get(nativeId).attributes);
		expect(tree.textContent(id)).toBe(`a${value}b`);
		expect(tree.textContent(id)).toBe(native.textContent(nativeId));
		expect(metadata(record(structured(tree).content, tree, id))).toEqual(
			expected("div", "cell", {
				role: "cell",
				id: `a${value}b`,
				"aria-label": `a${value}b`,
			}),
		);
		expect(researchReaderInfo(tree)?.sourceCodeUnits).toBe(source.length);
		expect(() =>
			sanitizeResearchHtml(source, { maxSourceCodeUnits: source.length - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("keeps empty processing-marker offsets correct after source newline preprocessing", () => {
	const source = '\r\n<?><div role="cell">Kept</div>';
	const result = sanitizeResearchHtml(source);
	expect(result.html).toBe('\n<div role="cell">Kept</div>');
	expect(result.report.tokenizerIssues).toBe(1);
	expect(result.report.sourceCodeUnits).toBe(source.length);
	expect(() => load(source)).not.toThrow();
});

it("charges re-escaped decoded carriage returns to reader output limits", () => {
	const source = '<div role="cell" aria-label="&#13;">&#13;</div>';
	const result = sanitizeResearchHtml(source);
	expect(result.html).toBe(source);
	expect(result.report.outputCodeUnits).toBe(source.length);
	expect(() =>
		sanitizeResearchHtml(source, { maxOutputCodeUnits: source.length - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each(["custom-box", "form", "xmp", "script", "svg"])(
	"never promotes role-bearing unwrapped, replaced or omitted %s",
	(tag) => {
		const source = `<${tag} role="table" aria-label="not-promoted" aria-colcount="2">Source text</${tag}><p>Public</p>`;
		const sanitized = sanitizeResearchHtml(source);
		expect(sanitized.html).not.toContain("role=");
		expect(sanitized.html).not.toContain("aria-label=");
		expect(sanitized.html).not.toContain("aria-colcount=");
		expect(sanitized.html).not.toContain("<span");
		const tree = load(source);
		expect(query(tree).querySelectorAll("[role]")).toHaveLength(0);
		for (const node of flattened(structured(tree).content))
			expect(node).not.toHaveProperty("ariaTableSource");
	},
);

it.each(roles)(
	"counts an empty opted-in $role as research content",
	({ role }) => {
		const tree = load(`<div role="${role}"></div>`);
		expect(
			hasResearchExtractionContent(extractDocument(tree, { format: "json" })),
		).toBe(false);
		expect(
			hasResearchExtractionContent(
				extractDocument(tree, { format: "json", tableMetadata: false }),
			),
		).toBe(false);
		expect(hasResearchExtractionContent(extractDocument(tree))).toBe(false);
		expect(hasResearchExtractionContent(structured(tree))).toBe(true);
	},
);

it("keeps native HTML tableSource alongside ARIA metadata without changing HTML defaults", () => {
	const tree = load(
		'<table id="native" role="table" aria-colcount="2"><tbody role="rowgroup"><tr role="row" aria-rowindex="0"><th id="heading" role="columnheader" scope="col" aria-colspan="malformed">Header</th><td headers="heading missing" colspan="2" role="cell" aria-colspan="-3">Value</td></tr></tbody></table>',
	);
	const owner = query(tree);
	const result = structured(tree);
	for (const [tag, role, htmlAttributes, ariaAttributes] of [
		[
			"table",
			"table",
			{ id: "native" },
			{ id: "native", role: "table", "aria-colcount": "2" },
		],
		["tbody", "rowgroup", {}, { role: "rowgroup" }],
		["tr", "row", {}, { role: "row", "aria-rowindex": "0" }],
		[
			"th",
			"columnheader",
			{ id: "heading", scope: "col" },
			{ id: "heading", role: "columnheader", "aria-colspan": "malformed" },
		],
		[
			"td",
			"cell",
			{ headers: "heading missing", colspan: "2" },
			{ role: "cell", "aria-colspan": "-3" },
		],
	] as const) {
		const node = record(result.content, tree, element(owner, tag));
		expect(node.tableSource).toEqual({
			kind: "native-table-source-v1",
			tag,
			attributes: htmlAttributes,
		});
		expect(metadata(node)).toEqual(expected(tag, role, ariaAttributes));
	}
	const baseline = extractDocument(tree, { format: "json" });
	expect(
		extractDocument(tree, { format: "json", tableMetadata: false }),
	).toEqual(baseline);
	expect(
		JSON.stringify(result, (key, value) =>
			key === "tableSource" || key === "ariaTableSource" ? undefined : value,
		),
	).toBe(JSON.stringify(baseline));
	const markdown = extractDocument(tree);
	expect(markdown.content).toContain("Native table begin");
	expect(extractDocument(tree, { tableMetadata: false })).toEqual(markdown);
	const plain = load('<table><tr><td colspan="2">Value</td></tr></table>');
	for (const node of flattened(structured(plain).content))
		expect(node).not.toHaveProperty("ariaTableSource");
});

it("retains oversized raw reader attributes until explicit metadata extraction", () => {
	const value = "😀".repeat(2048) + "x";
	const source = `<div role="cell" aria-label="${value}">Public</div>`;
	expect(sanitizeResearchHtml(source).html).toBe(source);
	const tree = load(source);
	const id = element(query(tree), "[role=cell]");
	expect(tree.get(id).attributes["aria-label"]).toBe(value);
	const revision = tree.revision;
	expect(() => extractDocument(tree, { format: "json" })).not.toThrow();
	expect(() => extractDocument(tree, { tableMetadata: false })).not.toThrow();
	expect(() => structured(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(tree.get(id).attributes["aria-label"]).toBe(value);
	expect(tree.revision).toBe(revision);
});

it.each([
	{
		option: "maxSourceCodeUnits",
		source: '<div role="table"></div>',
		boundary: '<div role="table"></div>'.length,
	},
	{
		option: "maxOutputCodeUnits",
		source: '<div role="cell" aria-label="&"></div>',
		boundary: '<div role="cell" aria-label="&amp;"></div>'.length,
	},
	{ option: "maxTokens", source: '<div role="table"></div>', boundary: 2 },
	{
		option: "maxDepth",
		source: '<div role="table"><div role="row"></div></div>',
		boundary: 2,
	},
	{
		option: "maxTextCodeUnits",
		source: '<div role="cell">😀</div>',
		boundary: 2,
	},
])(
	"retains reader $option boundaries with ARIA attributes",
	({ option, source, boundary }) => {
		expect(() =>
			sanitizeResearchHtml(source, { [option]: boundary }),
		).not.toThrow();
		expect(() =>
			sanitizeResearchHtml(source, { [option]: boundary - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("charges escaped ARIA strings to reader output and loader quotas", () => {
	const source = `<div role="cell" aria-label="${"&".repeat(20)}"></div>`;
	const escaped = `<div role="cell" aria-label="${"&amp;".repeat(20)}"></div>`;
	const sanitized = sanitizeResearchHtml(source);
	expect(sanitized.html).toBe(escaped);
	expect(sanitized.report.outputCodeUnits).toBe(escaped.length);
	expect(() => load(source, escaped.length - 1)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const tree = load(source, escaped.length);
	const id = element(query(tree), "[role=cell]");
	expect(metadata(record(structured(tree).content, tree, id))).toEqual(
		expected("div", "cell", { role: "cell", "aria-label": "&".repeat(20) }),
	);
});

it("keeps reader snapshots independent and releases query owners on document close", () => {
	const source =
		'<div role="cell" aria-label="Before" aria-colspan="2">Value</div>';
	const tree = load(source);
	const owner = query(tree);
	const id = element(owner, "[role=cell]");
	const revision = tree.revision;
	const first = metadata(record(structured(tree).content, tree, id));
	const second = metadata(record(structured(tree).content, tree, id));
	expect(tree.revision).toBe(revision);
	expect(first).toEqual(
		expected("div", "cell", {
			role: "cell",
			"aria-label": "Before",
			"aria-colspan": "2",
		}),
	);
	expect(second).toEqual(first);
	expect(second).not.toBe(first);
	expect(second?.attributes).not.toBe(first?.attributes);
	tree.setAttribute(id, "aria-label", "After");
	expect(owner.querySelector('[aria-label="After"]')).toBe(id);
	expect(first?.attributes["aria-label"]).toBe("Before");
	expect(
		metadata(record(structured(tree).content, tree, id))?.attributes[
			"aria-label"
		],
	).toBe("After");
	expect(sanitizeResearchHtml(source).html).toBe(source);
	tree.close();
	expect(researchReaderInfo(tree)).toBeUndefined();
	expect(() => owner.querySelector("[role=cell]")).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(second).toEqual(first);
});
