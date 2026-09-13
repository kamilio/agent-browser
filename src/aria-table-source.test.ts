import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	type ExtractedNode,
	type ExtractionOptions,
	extractDocument,
} from "./extraction.js";
import { DocumentQueries } from "./selectors.js";

interface AriaSource {
	kind: "native-aria-table-source-v1";
	tag: string;
	role: "table" | "rowgroup" | "row" | "cell" | "columnheader" | "rowheader";
	attributes: Record<string, string>;
}

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
const spans = ["aria-rowspan", "aria-colspan"];
const roles: { role: AriaSource["role"]; allowed: string[] }[] = [
	{ role: "table", allowed: [...common, "aria-colcount", "aria-rowcount"] },
	{ role: "rowgroup", allowed: common },
	{ role: "row", allowed: [...common, ...indices] },
	{ role: "cell", allowed: [...common, ...indices, ...spans] },
	{ role: "columnheader", allowed: [...common, ...indices, ...spans] },
	{ role: "rowheader", allowed: [...common, ...indices, ...spans] },
];
const candidates: Record<string, string> = {
	id: " duplicate ",
	"aria-label": "  Raw label  ",
	"aria-labelledby": "missing duplicate duplicate",
	"aria-describedby": " absent\tdescription ",
	"aria-owns": "outside missing outside",
	"aria-colcount": "-1",
	"aria-rowcount": "not-a-count",
	"aria-rowindex": "0",
	"aria-colindex": "+0002",
	"aria-colspan": "NaN",
	"aria-rowspan": "-3.5",
	"aria-sort": "ascending",
	"aria-level": "2",
	"aria-selected": "true",
	"aria-hidden": "false",
	"data-source": "discarded",
	class: "discarded",
	style: "color:red",
	onclick: "discarded",
	colspan: "9",
	headers: "native-only",
};

afterEach(() => {
	for (const query of queries.splice(0)) query.close();
	for (const tree of trees.splice(0)) tree.close();
});

function document() {
	const tree = new DocumentTree("https://aria-source.invalid/synthetic");
	trees.push(tree);
	return tree;
}

function append(
	tree: DocumentTree,
	parent: number,
	tag: string,
	attributes: Record<string, string> = {},
	text?: string,
) {
	const id = tree.createElement(tag, attributes);
	tree.append(parent, id);
	if (text !== undefined) tree.setTextContent(id, text);
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
	"preserves the exact native $role allowlist",
	({ role, allowed }) => {
		const tree = document();
		const attributes: Record<string, string> = { ...candidates, role };
		const id = append(tree, tree.root, "div", attributes);
		const revision = tree.revision;
		expect(metadata(record(structured(tree).content, tree, id))).toEqual(
			expected(
				"div",
				role,
				Object.fromEntries(allowed.map((name) => [name, attributes[name]])),
			),
		);
		expect(tree.get(id).attributes).toEqual(attributes);
		expect(tree.revision).toBe(revision);
	},
);

it.each([
	"table",
	" table",
	"table ",
	"\ttable\t",
	"\ntable\n",
	"\rtable\r",
	"\ftable\f",
	" \t\n\r\ftable\f\r\n\t ",
])("classifies ASCII edge whitespace without rewriting %j", (role) => {
	const tree = document();
	const id = append(tree, tree.root, "section", { role });
	expect(metadata(record(structured(tree).content, tree, id))).toEqual(
		expected("section", "table", { role }),
	);
});

it.each([
	undefined,
	"",
	" \t\n\r\f ",
	"Table",
	"TABLE",
	"grid",
	"treegrid",
	"heading",
	"presentation",
	"table row",
	"table table",
	"unknown table",
	"table\tcell",
	"\u00a0table\u00a0",
	"\vtable\v",
	"table\u200b",
])("excludes absent, invalid and fallback roles %j", (role) => {
	const tree = document();
	const attributes: Record<string, string> = { "aria-label": "x".repeat(4097) };
	if (role !== undefined) attributes.role = role;
	const id = append(tree, tree.root, "div", attributes, "Public");
	expect(record(structured(tree).content, tree, id)).not.toHaveProperty(
		"ariaTableSource",
	);
});

it.each([
	{ role: "table", attribute: "id" },
	{ role: "table", attribute: "aria-label" },
	{ role: "rowgroup", attribute: "aria-labelledby" },
	{ role: "row", attribute: "aria-describedby" },
	{ role: "cell", attribute: "aria-owns" },
	{ role: "table", attribute: "aria-colcount" },
	{ role: "table", attribute: "aria-rowcount" },
	{ role: "row", attribute: "aria-rowindex" },
	{ role: "row", attribute: "aria-colindex" },
	{ role: "columnheader", attribute: "aria-colspan" },
	{ role: "rowheader", attribute: "aria-rowspan" },
] as const)(
	"bounds raw $role $attribute at 4096 UTF-16 units",
	({ role, attribute }) => {
		const tree = document();
		const value = "😀".repeat(2048);
		const id = append(tree, tree.root, "div", { role, [attribute]: value });
		expect(metadata(record(structured(tree).content, tree, id))).toEqual(
			expected("div", role, { role, [attribute]: value }),
		);
		tree.setAttribute(id, attribute, `${value}x`);
		const revision = tree.revision;
		expect(() => structured(tree)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(() => extractDocument(tree, { format: "json" })).not.toThrow();
		expect(() => extractDocument(tree, { tableMetadata: false })).not.toThrow();
		expect(tree.get(id).attributes[attribute]).toBe(`${value}x`);
		expect(tree.revision).toBe(revision);
	},
);

it("bounds the original whitespace-bearing role rather than its classified token", () => {
	const tree = document();
	const role = `${" ".repeat(4092)}cell`;
	const id = append(tree, tree.root, "span", { role });
	expect(metadata(record(structured(tree).content, tree, id))).toEqual(
		expected("span", "cell", { role }),
	);
	tree.setAttribute(id, "role", `${role} `);
	expect(() => structured(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("does not bound denied attributes or synthesize missing indices and spans", () => {
	const tree = document();
	const id = append(tree, tree.root, "div", {
		role: "rowgroup",
		"aria-colspan": "x".repeat(4097),
		"aria-rowcount": "x".repeat(4097),
		"data-source": "x".repeat(4097),
	});
	expect(metadata(record(structured(tree).content, tree, id))).toEqual(
		expected("div", "rowgroup", { role: "rowgroup" }),
	);
});

it.each([
	{ hidden: "" },
	{ inert: "" },
	{ "aria-hidden": "true" },
	{ style: "display:none" },
] as Record<string, string>[])(
	"skips hidden subtrees before oversized metadata %o",
	(attributes) => {
		const tree = document();
		const table = append(tree, tree.root, "div", {
			...attributes,
			role: "table",
			"aria-label": "x".repeat(4097),
		});
		const cell = append(tree, table, "div", { role: "cell" }, "Hidden");
		const result = structured(tree);
		for (const id of [table, cell])
			expect(
				flattened(result.content).some(
					(node) => node.ref === tree.reference(id),
				),
			).toBe(false);
		const scoped = structured(tree, { root: tree.reference(cell) });
		expect(
			flattened(scoped.content).every((node) => metadata(node) === undefined),
		).toBe(true);
		expect(JSON.stringify(scoped)).not.toContain("Hidden");
	},
);

it.each(["script", "template", "select"])(
	"skips omitted %s before metadata admission",
	(tag) => {
		const tree = document();
		const id = append(tree, tree.root, tag, {
			role: "table",
			"aria-label": "x".repeat(4097),
		});
		expect(
			flattened(structured(tree).content).some(
				(node) => node.ref === tree.reference(id),
			),
		).toBe(false);
	},
);

it("omits invisible metadata but admits explicitly visible descendants", () => {
	const tree = document();
	const table = append(tree, tree.root, "div", {
		role: "table",
		style: "visibility:hidden",
		"aria-label": "x".repeat(4097),
	});
	const cell = append(
		tree,
		table,
		"span",
		{
			role: "cell",
			style: "visibility:visible",
			"aria-colspan": "0",
		},
		"Visible",
	);
	const result = structured(tree);
	expect(record(result.content, tree, table)).not.toHaveProperty(
		"ariaTableSource",
	);
	expect(metadata(record(result.content, tree, cell))).toEqual(
		expected("span", "cell", { role: "cell", "aria-colspan": "0" }),
	);
});

it("does not leak context-only or out-of-section metadata", () => {
	const tree = document();
	const table = append(tree, tree.root, "div", {
		role: "table",
		"aria-label": "x".repeat(4097),
	});
	const group = append(tree, table, "div", {
		role: "rowgroup",
		id: "context-group",
	});
	const row = append(tree, group, "div", { role: "row", id: "context-row" });
	const cell = append(tree, row, "div", { role: "cell", id: "context-cell" });
	append(tree, cell, "p", {}, "Excluded prefix");
	const heading = append(tree, cell, "h2", {}, "Start");
	const selected = append(
		tree,
		row,
		"div",
		{ role: "rowheader", id: "selected" },
		"Selected",
	);
	append(tree, tree.root, "h2", {}, "Stop");
	const excluded = append(tree, tree.root, "div", {
		role: "table",
		"aria-label": "x".repeat(4097),
	});
	const result = structured(tree, { section: tree.reference(heading) });
	for (const id of [tree.root, table, group, row, cell]) {
		const node = record(result.content, tree, id);
		expect(node.type).toBe("container");
		expect(node).not.toHaveProperty("ariaTableSource");
	}
	expect(metadata(record(result.content, tree, selected))).toEqual(
		expected("div", "rowheader", { role: "rowheader", id: "selected" }),
	);
	expect(
		flattened(result.content).some(
			(node) => node.ref === tree.reference(excluded),
		),
	).toBe(false);
	expect(JSON.stringify(result)).not.toContain("Excluded prefix");
});

it("owns independent metadata snapshots across DOM and result mutations", () => {
	const tree = document();
	const id = append(tree, tree.root, "div", {
		role: "cell",
		id: "before",
		"aria-owns": "missing missing",
	});
	const first = metadata(record(structured(tree).content, tree, id));
	const second = metadata(record(structured(tree).content, tree, id));
	if (!first || !second) throw new Error("Expected ARIA source snapshots");
	expect(second).toEqual(first);
	expect(second).not.toBe(first);
	expect(second.attributes).not.toBe(first.attributes);
	first.attributes.id = "result-only";
	expect(second.attributes.id).toBe("before");
	expect(tree.get(id).attributes.id).toBe("before");
	tree.setAttribute(id, "id", "after");
	tree.removeAttribute(id, "aria-owns");
	tree.setAttribute(id, "role", "rowheader");
	expect(metadata(record(structured(tree).content, tree, id))).toEqual(
		expected("div", "rowheader", { role: "rowheader", id: "after" }),
	);
	tree.setAttribute(id, "role", "grid");
	expect(record(structured(tree).content, tree, id)).not.toHaveProperty(
		"ariaTableSource",
	);
	tree.remove(id);
	expect(second).toEqual(
		expected("div", "cell", {
			role: "cell",
			id: "before",
			"aria-owns": "missing missing",
		}),
	);
});

it("keeps source IDs local without resolving owns or duplicate label references", () => {
	const tree = document();
	const outer = append(tree, tree.root, "div", { role: "table", id: "outer" });
	append(tree, outer, "div", { role: "rowheader", id: "duplicate" }, "Outer");
	const inner = append(tree, outer, "div", {
		role: "table",
		id: "inner",
		"aria-owns": "outside missing outside",
	});
	const cell = append(
		tree,
		inner,
		"span",
		{ role: "cell", "aria-labelledby": "duplicate missing duplicate" },
		"Inner",
	);
	append(tree, tree.root, "div", { role: "cell", id: "outside" }, "Outside");
	append(
		tree,
		tree.root,
		"div",
		{ role: "rowheader", id: "duplicate" },
		"Duplicate",
	);
	const query = new DocumentQueries(tree);
	queries.push(query);
	expect(query.querySelectorAll("#duplicate")).toHaveLength(2);
	expect(query.querySelector("#inner [role=cell]")).toBe(cell);
	const result = structured(tree, { root: tree.reference(inner) });
	expect(flattened(result.content).map((node) => node.ref)).toEqual([
		tree.reference(inner),
		tree.reference(cell),
		tree.reference(tree.get(cell).children[0]),
	]);
	expect(metadata(result.content)).toEqual(
		expected("div", "table", {
			role: "table",
			id: "inner",
			"aria-owns": "outside missing outside",
		}),
	);
	expect(metadata(record(result.content, tree, cell))).toEqual(
		expected("span", "cell", {
			role: "cell",
			"aria-labelledby": "duplicate missing duplicate",
		}),
	);
});

it("charges metadata to the exact serialized UTF-8 maxBytes budget", () => {
	const tree = document();
	append(tree, tree.root, "div", {
		role: "table",
		"aria-label": "😀".repeat(200),
	});
	const baseline = extractDocument(tree, { format: "json" });
	const result = structured(tree);
	const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
	const baselineBytes = new TextEncoder().encode(
		JSON.stringify(baseline),
	).byteLength;
	expect(bytes).toBeGreaterThan(baselineBytes);
	expect(structured(tree, { maxBytes: bytes })).toEqual(result);
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
	"retains extraction structure limits %o",
	(options) => {
		const tree = document();
		const table = append(tree, tree.root, "div", { role: "table" });
		append(tree, table, "div", { role: "row" });
		expect(() => structured(tree, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("adds only opt-in metadata without changing default JSON or Markdown", () => {
	const tree = document();
	const table = append(tree, tree.root, "div", { role: "table" });
	append(
		tree,
		table,
		"div",
		{ role: "cell", "aria-colspan": "2" },
		"Shared power",
	);
	const baseline = extractDocument(tree, { format: "json" });
	expect(
		extractDocument(tree, { format: "json", tableMetadata: false }),
	).toEqual(baseline);
	expect(JSON.stringify(baseline)).not.toContain("ariaTableSource");
	expect(
		JSON.stringify(structured(tree), (key, value) =>
			key === "ariaTableSource" ? undefined : value,
		),
	).toBe(JSON.stringify(baseline));
	const markdown = extractDocument(tree);
	expect(markdown.content).toBe("Shared power\n");
	expect(
		extractDocument(tree, { format: "markdown", tableMetadata: false }),
	).toEqual(markdown);
});

it.each([undefined, "markdown"] as const)(
	"rejects ARIA metadata for Markdown format %s",
	(format) => {
		const tree = document();
		append(tree, tree.root, "div", { role: "table" });
		expect(() =>
			extractDocument(tree, { format, tableMetadata: true }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	},
);
