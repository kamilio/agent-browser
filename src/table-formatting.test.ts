import { afterEach, expect, it } from "vitest";
import { initialBoxStyle } from "./css-box.js";
import type { DocumentTree } from "./document.js";
import {
	type FormattingNode,
	type FormattingTree,
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";

const documents: DocumentTree[] = [];

function fixture(markup: string) {
	const tree = parseHtmlDocument(markup, "https://example.com/");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error(`Missing fixture ${selector}`);
		return result;
	};
	const ref = (selector: string) => tree.reference(id(selector));
	return { tree, id, ref };
}

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function nodeFor(formatting: FormattingTree, ref: string) {
	const matches = formatting.nodes.filter((node) => node.ref === ref);
	expect(matches).toHaveLength(1);
	return matches[0];
}

function onlyChild(
	formatting: FormattingTree,
	parent: Readonly<FormattingNode>,
	display: string,
) {
	expect(parent.children).toHaveLength(1);
	const child = formatting.nodes[parent.children[0]];
	expect(child.display).toBe(display);
	expect(child.parent).toBe(parent.id);
	return child;
}

function textOrder(formatting: FormattingTree, root = formatting.root) {
	const result: string[] = [];
	const pending = [root];
	while (pending.length) {
		const id = pending.pop();
		if (id === undefined) break;
		const node = formatting.nodes[id];
		if (node.kind === "text") result.push(node.text ?? "");
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]);
	}
	return result.join("");
}

function verifyTree(formatting: FormattingTree) {
	const incoming = new Map<number, number>();
	const seen = new Set<number>();
	const pending = [formatting.root];
	while (pending.length) {
		const id = pending.pop();
		if (id === undefined) break;
		expect(seen.has(id)).toBe(false);
		seen.add(id);
		const node = formatting.nodes[id];
		expect(node.id).toBe(id);
		for (const child of node.children) {
			incoming.set(child, (incoming.get(child) ?? 0) + 1);
			expect(formatting.nodes[child].parent).toBe(id);
			if (node.kind === "inline" || node.contentMode === "inline")
				expect(formatting.nodes[child].level).toBe("inline");
			if (node.contentMode === "blocks" || node.contentMode === "table")
				expect(formatting.nodes[child].level).toBe("block");
			pending.push(child);
		}
	}
	expect(seen.size).toBe(formatting.nodes.length);
	for (const node of formatting.nodes) {
		expect(incoming.get(node.id) ?? 0).toBe(
			node.id === formatting.root ? 0 : 1,
		);
		expect(Object.isFrozen(node)).toBe(true);
		expect(Object.isFrozen(node.children)).toBe(true);
	}
	expect(formatting.nodes[formatting.root].parent).toBeNull();
}

it("preserves real table, caption, group, row and cell references beneath a caption wrapper", () => {
	const { tree, ref } = fixture(
		'<table id="table"><caption id="caption">Title</caption><thead id="head"><tr id="heading"><th id="header">Header</th></tr></thead><tbody id="body"><tr id="row"><td id="cell">Body</td></tr></tbody><tfoot id="foot"><tr id="last"><td id="footer">Footer</td></tr></tfoot></table>',
	);
	const before = snapshotDocument(tree);
	const result = buildFormattingTree(tree);
	const table = nodeFor(result, ref("#table"));
	expect(table).toMatchObject({
		kind: "deferred",
		level: "block",
		display: "table",
		contentMode: "table",
		independentContext: true,
		deferredReason: "display-layout-not-supported",
	});
	expect(table.children.map((id) => result.nodes[id].ref)).toEqual([
		ref("#head"),
		ref("#body"),
		ref("#foot"),
	]);
	const wrapper = result.nodes[table.tableWrapper!];
	expect(wrapper).toMatchObject({ tableGrid: table.id, contentMode: "blocks" });
	expect(wrapper.ref).toBeUndefined();
	expect(wrapper.children).toEqual([
		nodeFor(result, ref("#caption")).id,
		table.id,
	]);
	expect(table.tableCaptions).toEqual([nodeFor(result, ref("#caption")).id]);
	for (const [group, display, row, cell] of [
		["#head", "table-header-group", "#heading", "#header"],
		["#body", "table-row-group", "#row", "#cell"],
		["#foot", "table-footer-group", "#last", "#footer"],
	]) {
		const groupNode = nodeFor(result, ref(group));
		expect(groupNode).toMatchObject({ display, parent: table.id });
		const rowNode = onlyChild(result, groupNode, "table-row");
		expect(rowNode.ref).toBe(ref(row));
		const cellNode = onlyChild(result, rowNode, "table-cell");
		expect(cellNode).toMatchObject({
			ref: ref(cell),
			kind: "block",
			independentContext: true,
			contentMode: "inline",
			tableSpan: { columns: 1, rows: 1 },
		});
	}
	expect(nodeFor(result, ref("#caption"))).toMatchObject({
		display: "flow-root",
		parent: wrapper.id,
		independentContext: true,
		contentMode: "inline",
	});
	expect(textOrder(result)).toBe("TitleHeaderBodyFooter");
	expect(result.issues).toEqual({
		"display-layout-not-supported": 1,
	});
	expect(result.metrics.deferredSubtrees).toBe(1);
	expect(Object.isFrozen(table.table)).toBe(true);
	expect(snapshotDocument(tree)).toEqual(before);
	verifyTree(result);
});

it("retains the DOM reference of an HTML-parser-inserted tbody", () => {
	const { tree, ref } = fixture("<table><tr><td>Value</td></tr></table>");
	const result = buildFormattingTree(tree);
	const group = onlyChild(
		result,
		nodeFor(result, ref("table")),
		"table-row-group",
	);
	expect(group.ref).toBe(ref("tbody"));
	expect(onlyChild(result, group, "table-row").ref).toBe(ref("tr"));
	verifyTree(result);
});

it.each([
	{ display: "table-header-group", tag: "header" },
	{ display: "table-row-group", tag: "section" },
	{ display: "table-footer-group", tag: "footer" },
])(
	"uses CSS $display roles independently of HTML tag names",
	({ display, tag }) => {
		const { tree, ref } = fixture(
			`<main style="display:table"><${tag} id="group" style="display:${display}"><div id="row" style="display:table-row"><div id="cell" style="display:table-cell">Value</div></div></${tag}></main>`,
		);
		const result = buildFormattingTree(tree);
		const group = onlyChild(result, nodeFor(result, ref("main")), display);
		expect(group.ref).toBe(ref("#group"));
		const row = onlyChild(result, group, "table-row");
		expect(row.ref).toBe(ref("#row"));
		expect(onlyChild(result, row, "table-cell").ref).toBe(ref("#cell"));
		expect(result.issues).toEqual({ "display-layout-not-supported": 1 });
		verifyTree(result);
	},
);

it.each([
	{
		role: "cell",
		markup: '<div id="cell" style="display:table-cell">Value</div>',
		anonymous: ["table", "table-row-group", "table-row"],
	},
	{
		role: "row",
		markup:
			'<div id="row" style="display:table-row"><div id="cell" style="display:table-cell">Value</div></div>',
		anonymous: ["table", "table-row-group"],
	},
	{
		role: "group",
		markup:
			'<div id="group" style="display:table-row-group"><div id="row" style="display:table-row"><div id="cell" style="display:table-cell">Value</div></div></div>',
		anonymous: ["table"],
	},
])(
	"repairs an orphan CSS $role with only the missing anonymous ancestors",
	({ markup, anonymous }) => {
		const { tree, ref } = fixture(`<main>${markup}</main>`);
		const before = snapshotDocument(tree);
		const result = buildFormattingTree(tree);
		let parent = nodeFor(result, ref("main"));
		for (const display of [
			"table",
			"table-row-group",
			"table-row",
			"table-cell",
		]) {
			parent = onlyChild(result, parent, display);
			if (anonymous.includes(display)) {
				expect(parent.ref).toBeUndefined();
				expect(parent.box).toBe(initialBoxStyle);
			} else expect(parent.ref).toBeDefined();
		}
		expect(parent.ref).toBe(ref("#cell"));
		expect(parent.independentContext).toBe(true);
		expect(result.issues).toEqual({ "display-layout-not-supported": 1 });
		expect(snapshotDocument(tree)).toEqual(before);
		verifyTree(result);
	},
);

it("groups adjacent direct CSS cells into one anonymous row and row group", () => {
	const { tree, ref } = fixture(
		'<main style="display:table"><div id="first" style="display:table-cell">A</div><div id="second" style="display:table-cell">B</div></main>',
	);
	const result = buildFormattingTree(tree);
	const group = onlyChild(
		result,
		nodeFor(result, ref("main")),
		"table-row-group",
	);
	const row = onlyChild(result, group, "table-row");
	expect(group.ref).toBeUndefined();
	expect(row.ref).toBeUndefined();
	expect(row.children.map((id) => result.nodes[id].ref)).toEqual([
		ref("#first"),
		ref("#second"),
	]);
	verifyTree(result);
});

it("repairs a display:block HTML table around its real tbody without replacing references", () => {
	const { tree, ref } = fixture(
		'<table id="table" style="display:block;border-spacing:7px 9px"><tbody id="group"><tr><td>Value</td></tr></tbody></table>',
	);
	const before = snapshotDocument(tree);
	const result = buildFormattingTree(tree);
	const block = nodeFor(result, ref("#table"));
	expect(block).toMatchObject({
		kind: "block",
		display: "block",
		contentMode: "blocks",
	});
	const table = onlyChild(result, block, "table");
	expect(table).toMatchObject({
		kind: "deferred",
		contentMode: "table",
		independentContext: true,
		table: { "border-spacing": "7px 9px" },
	});
	expect(table.ref).toBeUndefined();
	expect(onlyChild(result, table, "table-row-group").ref).toBe(ref("#group"));
	expect(snapshotDocument(tree)).toEqual(before);
	verifyTree(result);
});

it("keeps cell content in independent normal flow and ignores cell margins", () => {
	const { tree, ref } = fixture(
		'<table><tr><td id="cell" style="margin:17px;padding:3px">Before<div id="block">Block</div>After</td></tr></table>',
	);
	const result = buildFormattingTree(tree);
	const cell = nodeFor(result, ref("#cell"));
	expect(cell).toMatchObject({
		independentContext: true,
		contentMode: "blocks",
		box: {
			"margin-top": "0px",
			"margin-right": "0px",
			"margin-bottom": "0px",
			"margin-left": "0px",
			"padding-top": "3px",
			"padding-right": "3px",
			"padding-bottom": "3px",
			"padding-left": "3px",
		},
	});
	expect(cell.children.map((id) => result.nodes[id].kind)).toEqual([
		"anonymous-block",
		"block",
		"anonymous-block",
	]);
	expect(result.nodes[cell.children[1]].ref).toBe(ref("#block"));
	expect(textOrder(result, cell.id)).toBe("BeforeBlockAfter");
	verifyTree(result);
});

it.each([
	{ label: "missing", attributes: "", columns: 1, rows: 1 },
	{
		label: "positive",
		attributes: 'colspan="3" rowspan="2"',
		columns: 3,
		rows: 2,
	},
	{
		label: "zero",
		attributes: 'colspan="0" rowspan="0"',
		columns: 1,
		rows: 0,
	},
	{
		label: "leading whitespace and plus",
		attributes: 'colspan=" \t+03" rowspan="\n+04"',
		columns: 3,
		rows: 4,
	},
	{
		label: "numeric prefixes",
		attributes: 'colspan="2junk" rowspan="3.5"',
		columns: 2,
		rows: 3,
	},
	{
		label: "upper bounds",
		attributes: 'colspan="1000" rowspan="65534"',
		columns: 1000,
		rows: 65534,
	},
	{
		label: "capped",
		attributes: 'colspan="1001" rowspan="65535"',
		columns: 1000,
		rows: 65534,
	},
	{
		label: "overflow",
		attributes: `colspan="${"9".repeat(400)}" rowspan="${"9".repeat(400)}"`,
		columns: 1000,
		rows: 65534,
	},
	{
		label: "negative",
		attributes: 'colspan="-2" rowspan="-3"',
		columns: 1,
		rows: 1,
	},
	{
		label: "malformed",
		attributes: 'colspan="nope" rowspan="+ 2"',
		columns: 1,
		rows: 1,
	},
	{
		label: "empty",
		attributes: 'colspan="" rowspan=" "',
		columns: 1,
		rows: 1,
	},
])(
	"parses $label HTML spans on both td and th",
	({ attributes, columns, rows }) => {
		const { tree, ref } = fixture(
			`<table><tr><th id="header" ${attributes}>Header</th><td id="cell" ${attributes}>Cell</td></tr></table>`,
		);
		const result = buildFormattingTree(tree);
		for (const selector of ["#header", "#cell"]) {
			const cell = nodeFor(result, ref(selector));
			expect(cell.tableSpan).toEqual({ columns, rows });
			expect(Object.isFrozen(cell.tableSpan)).toBe(true);
		}
		verifyTree(result);
	},
);

it("does not interpret HTML span attributes on arbitrary CSS cells", () => {
	const { tree, ref } = fixture(
		'<main><div id="cell" style="display:table-cell" colspan="3" rowspan="0">Value</div></main>',
	);
	const result = buildFormattingTree(tree);
	expect(nodeFor(result, ref("#cell")).tableSpan).toBeUndefined();
	verifyTree(result);
});

it("keeps nested tables inside their cell's normal flow", () => {
	const { tree, ref } = fixture(
		'<table id="outer"><tr><td id="cell">Before<table id="inner"><tr><td id="inner-cell">Inner</td></tr></table>After</td></tr></table>',
	);
	const result = buildFormattingTree(tree);
	const cell = nodeFor(result, ref("#cell"));
	const inner = nodeFor(result, ref("#inner"));
	expect(inner).toMatchObject({ parent: cell.id, contentMode: "table" });
	expect(cell.contentMode).toBe("blocks");
	expect(cell.children).toContain(inner.id);
	expect(
		result.nodes.filter((node) => node.contentMode === "table"),
	).toHaveLength(2);
	expect(textOrder(result, nodeFor(result, ref("#outer")).id)).toBe(
		"BeforeInnerAfter",
	);
	expect(textOrder(result, inner.id)).toBe("Inner");
	expect(result.issues).toEqual({ "display-layout-not-supported": 2 });
	verifyTree(result);
});

it("discards inter-role table whitespace without leaving detached formatting nodes", () => {
	const { tree, ref } = fixture(
		'<table id="table">\n<tbody>\n<tr>\n<td id="cell"> A <span>B</span> C </td>\n</tr>\n</tbody>\n</table>',
	);
	const result = buildFormattingTree(tree);
	const table = nodeFor(result, ref("#table"));
	const group = onlyChild(result, table, "table-row-group");
	const row = onlyChild(result, group, "table-row");
	expect(onlyChild(result, row, "table-cell").ref).toBe(ref("#cell"));
	expect(textOrder(result, table.id)).toBe(" A B C ");
	verifyTree(result);
});

it("keeps whitespace-separated orphan CSS cells in a single anonymous table row", () => {
	const { tree, ref } = fixture(
		'<main><div id="first" style="display:table-cell">A</div> \n\t <div id="second" style="display:table-cell">B</div></main>',
	);
	const result = buildFormattingTree(tree);
	const table = onlyChild(result, nodeFor(result, ref("main")), "table");
	const group = onlyChild(result, table, "table-row-group");
	const row = onlyChild(result, group, "table-row");
	expect(row.children.map((id) => result.nodes[id].ref)).toEqual([
		ref("#first"),
		ref("#second"),
	]);
	expect(textOrder(result, table.id)).toBe("AB");
	expect(result.metrics.deferredSubtrees).toBe(1);
	verifyTree(result);
});

it("repairs non-whitespace CSS table content with an anonymous normal-flow cell", () => {
	const { tree } = fixture(
		'<main style="display:table">Before<span>Inside</span>After</main>',
	);
	const result = buildFormattingTree(tree);
	const table = result.nodes.find((node) => node.contentMode === "table");
	expect(table).toBeDefined();
	if (!table) throw new Error("Missing table fixture");
	const group = onlyChild(result, table, "table-row-group");
	const row = onlyChild(result, group, "table-row");
	const cell = onlyChild(result, row, "table-cell");
	expect(cell).toMatchObject({
		independentContext: true,
		contentMode: "inline",
	});
	expect(cell.ref).toBeUndefined();
	expect(textOrder(result)).toBe("BeforeInsideAfter");
	verifyTree(result);
});

it("preserves the separator between ordinary inline spans in a generated table cell", () => {
	const { tree, id, ref } = fixture(
		'<main style="display:table"><span id="first">First</span> <span id="second">Second</span></main>',
	);
	const separatorRef = tree.reference(tree.get(id("main")).children[1]);
	const result = buildFormattingTree(tree);
	const group = onlyChild(
		result,
		nodeFor(result, ref("main")),
		"table-row-group",
	);
	const row = onlyChild(result, group, "table-row");
	const cell = onlyChild(result, row, "table-cell");
	expect(cell).toMatchObject({
		independentContext: true,
		contentMode: "inline",
	});
	expect(cell.ref).toBeUndefined();
	expect(cell.children.map((child) => result.nodes[child].ref)).toEqual([
		ref("#first"),
		separatorRef,
		ref("#second"),
	]);
	expect(nodeFor(result, separatorRef)).toMatchObject({
		kind: "text",
		text: " ",
		parent: cell.id,
	});
	expect(textOrder(result, cell.id)).toBe("First Second");
	expect(result.issues).toEqual({ "display-layout-not-supported": 1 });
	verifyTree(result);
});

it("retains table flex-item metadata and ordered child IDs after whitespace compaction", () => {
	const { tree, ref } = fixture(
		'<main style="display:flex"><div id="before">Before</div><table id="table" style="order:-1;flex-grow:2;flex-shrink:3;flex-basis:40px;align-self:flex-end">\n<tbody>\n<tr>\n<td>Cell</td>\n</tr>\n</tbody>\n</table><div id="after">After</div></main>',
	);
	const result = buildFormattingTree(tree);
	const main = nodeFor(result, ref("main"));
	const before = nodeFor(result, ref("#before"));
	const table = nodeFor(result, ref("#table"));
	const after = nodeFor(result, ref("#after"));
	expect(table).toMatchObject({
		kind: "deferred",
		display: "table",
		contentMode: "table",
		parent: main.id,
		flexItem: true,
		independentContext: true,
		flex: {
			order: "-1",
			"flex-grow": "2",
			"flex-shrink": "3",
			"flex-basis": "40px",
			"align-self": "flex-end",
		},
	});
	expect(main.children).toEqual([before.id, table.id, after.id]);
	expect(main.orderModifiedChildren).toEqual([table.id, before.id, after.id]);
	expect(Object.isFrozen(main.orderModifiedChildren)).toBe(true);
	expect(nodeFor(result, ref("td")).flexItem).not.toBe(true);
	expect(textOrder(result, table.id)).toBe("Cell");
	expect(result.metrics.boxes).toBe(result.nodes.length);
	expect(result.issues).toEqual({
		"display-layout-not-supported": 2,
		"table-item-layout-not-supported": 1,
	});
	verifyTree(result);
});

it("leaves ordinary block and inline decomposition unchanged", () => {
	const { tree, ref } = fixture(
		'<main>Before<span>Inline</span><div id="block">Block</div>After</main>',
	);
	const result = buildFormattingTree(tree);
	const main = nodeFor(result, ref("main"));
	expect(main.children.map((id) => result.nodes[id].kind)).toEqual([
		"anonymous-block",
		"block",
		"anonymous-block",
	]);
	expect(result.nodes[main.children[1]].ref).toBe(ref("#block"));
	expect(result.nodes.some((node) => node.display?.startsWith("table"))).toBe(
		false,
	);
	expect(textOrder(result)).toBe("BeforeInlineBlockAfter");
	expect(result.issues).toEqual({});
	verifyTree(result);
});

it("excludes hidden tables and their unsupported descendants", () => {
	const { tree } = fixture(
		'<main>Visible<table style="display:none;border-collapse:collapse;table-layout:fixed"><col><tr><td>Hidden</td></tr></table></main>',
	);
	const result = buildFormattingTree(tree);
	expect(textOrder(result)).toBe("Visible");
	expect(result.nodes.some((node) => node.contentMode === "table")).toBe(false);
	expect(result.issues).toEqual({});
	verifyTree(result);
});

it.each([
	{
		label: "collapsed empty-grid borders",
		markup: '<table style="border-collapse:collapse;border:2px solid"></table>',
		issue: "table-collapsed-borders-not-supported",
	},
	{
		label: "fixed layout",
		markup: '<table style="table-layout:fixed"><tr><td>Cell</td></tr></table>',
		issue: "table-fixed-layout-not-supported",
	},
	{
		label: "column",
		markup:
			'<main style="display:table"><div style="display:table-column"></div></main>',
		issue: "table-column-layout-not-supported",
	},
	{
		label: "column group",
		markup: "<table><colgroup><col></colgroup><tr><td>Cell</td></tr></table>",
		issue: "table-column-layout-not-supported",
	},
	{
		label: "hidden empty cells",
		markup: '<table><tr><td style="empty-cells:hide"></td></tr></table>',
		issue: "table-empty-cell-paint-not-supported",
	},
	{
		label: "positioned table",
		markup: '<table style="position:relative"><tr><td>Cell</td></tr></table>',
		issue: "table-position-layout-not-supported",
	},
	{
		label: "inline table",
		markup: '<main><span style="display:inline-table">Cell</span></main>',
		issue: "display-layout-not-supported",
	},
])("keeps an explicit unsupported guard for $label", ({ markup, issue }) => {
	const { tree } = fixture(markup);
	const result = buildFormattingTree(tree);
	expect(result.issues[issue]).toBeGreaterThan(0);
	expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
});

it.each(["top", "bottom", "middle"])(
	"does not confuse parsed vertical-align with supported non-atomic %s alignment",
	(alignment) => {
		const { tree } = fixture(
			`<main><span style="display:inline;vertical-align:${alignment}">Value</span></main>`,
		);
		const result = buildFormattingTree(tree);
		expect(result.issues["inline-vertical-align-not-supported"]).toBe(1);
		expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
	},
);
