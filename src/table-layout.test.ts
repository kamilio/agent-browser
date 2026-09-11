import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentBox, DocumentLayout } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { layoutFormattingPageDocument } from "./flex-document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import {
	layoutFormattingTableContainer,
	tableLayoutLimits,
} from "./table-layout.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	content = '<tbody id="body"><tr id="row"><td id="first">A</td><td id="second">B</td></tr></tbody>',
	css = "",
	after = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;font-size:10px;line-height:10px}table{width:120px;border-collapse:separate;border-spacing:0}td,th{padding:0;vertical-align:top}${css}</style><table id="table">${content}</table>${after}`,
		"https://fixture.invalid/table-layout",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(320, 240);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing table fixture ${selector}`);
		return found;
	};
	const formatting = buildFormattingTree(tree);
	const node = (selector: string) => {
		const ref = tree.reference(id(selector));
		const found = formatting.nodes.find((entry) => entry.ref === ref);
		if (!found) throw new Error(`Missing table formatting node ${selector}`);
		return found;
	};
	const page = () => layoutFormattingPageDocument(formatting, 2_000_000);
	const box = (selector: string, layout: Pick<DocumentLayout, "boxes">) => {
		const found = layout.boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing table box ${selector}`);
		return found;
	};
	const container = (contentWidth = 120, maxWork?: number) =>
		layoutFormattingTableContainer(
			formatting,
			node("#table").id,
			{ contentWidth, containingWidth: 320, containingHeight: 240 },
			maxWork === undefined ? {} : { maxWork },
		);
	return { tree, id, node, formatting, page, box, container };
}

function expectError(run: () => unknown, code: string) {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe(code);
		return;
	}
	throw new Error(`Expected ${code}`);
}

function expectContentAccounting(box: Readonly<DocumentBox>) {
	expect(box.contentY).toBeCloseTo(
		box.borderY + box.borderTop + box.paddingTop,
		8,
	);
	expect(
		box.contentY + box.contentHeight + box.paddingBottom + box.borderBottom,
	).toBeCloseTo(box.borderY + box.borderBoxHeight, 8);
}

it("lays out measured cells, actual row/group refs and the following block", () => {
	const current = fixture(
		undefined,
		"#first{height:20px}",
		'<footer id="after" style="height:7px"></footer>',
	);
	const layout = current.page();
	const table = current.box("#table", layout);
	const group = current.box("#body", layout);
	const row = current.box("#row", layout);
	const first = current.box("#first", layout);
	const second = current.box("#second", layout);
	expect(table.contentWidth).toBe(120);
	expect(table.contentHeight).toBe(20);
	expect(first.borderY).toBe(table.contentY);
	expect(second.borderY).toBe(first.borderY);
	expect(first.borderBoxHeight).toBe(20);
	expect(second.borderBoxHeight).toBe(20);
	expect(first.borderBoxWidth + second.borderBoxWidth).toBeCloseTo(120, 8);
	expect(second.borderX).toBeCloseTo(first.borderX + first.borderBoxWidth, 8);
	expect(first.containingBlock).toBe(row.id);
	expect(second.containingBlock).toBe(row.id);
	expect(row.containingBlock).toBe(group.id);
	expect(group.containingBlock).toBe(table.id);
	expect(current.box("#after", layout).borderY).toBe(
		table.borderY + table.borderBoxHeight,
	);
	const indexes = new Map(
		layout.boxes.map((entry, index) => [entry.id, index]),
	);
	for (const entry of [group, row, first, second])
		expect(indexes.get(entry.containingBlock)!).toBeLessThan(
			indexes.get(entry.id)!,
		);
	expectContentAccounting(first);
	expectContentAccounting(second);
});

it("accounts for outer borders, padding and independent horizontal/vertical spacing", () => {
	const current = fixture(
		'<tbody id="body"><tr id="row"><td id="first"></td><td id="second"></td></tr><tr id="row2"><td id="third"></td><td></td></tr></tbody>',
		"table{box-sizing:content-box;width:120px;border:2px solid black;padding:3px;border-spacing:4px 6px}td{height:10px}",
	);
	const layout = current.page();
	const table = current.box("#table", layout);
	const first = current.box("#first", layout);
	const second = current.box("#second", layout);
	const third = current.box("#third", layout);
	expect(table.borderBoxWidth).toBe(130);
	expect(first.borderX).toBe(table.contentX + 4);
	expect(first.borderY).toBe(table.contentY + 6);
	expect(second.borderX - first.borderX - first.borderBoxWidth).toBeCloseTo(
		4,
		8,
	);
	expect(third.borderY - first.borderY - first.borderBoxHeight).toBe(6);
	expect(table.contentHeight).toBe(38);
	expect(table.borderBoxHeight).toBe(48);
	expect(current.box("#row", layout).borderBoxWidth).toBe(112);
	expect(current.box("#body", layout).borderBoxHeight).toBe(26);
});

it("honors colspan and rowspan geometry without treating cells as Grid items", () => {
	const current = fixture(
		'<tbody><tr id="row"><td id="span" rowspan="2">A</td><td id="first">B</td></tr><tr id="row2"><td id="second">C</td></tr><tr><td id="wide" colspan="2">D</td></tr></tbody>',
		"table{border-spacing:2px 3px}td{height:10px}",
	);
	const layout = current.page();
	const spanning = current.box("#span", layout);
	const first = current.box("#first", layout);
	const second = current.box("#second", layout);
	const wide = current.box("#wide", layout);
	expect(spanning.borderBoxHeight).toBe(23);
	expect(second.borderY).toBe(first.borderY + 13);
	expect(second.borderX).toBe(first.borderX);
	expect(wide.borderBoxWidth).toBe(116);
	expect(wide.borderX).toBe(spanning.borderX);
	expect(spanning.containingBlock).toBe(current.box("#row", layout).id);
	expect(current.node("#span").gridItem).not.toBe(true);
	expectContentAccounting(spanning);
});

it("reflows text to full allocated colspan width and preserves intrinsic minima", () => {
	const current = fixture(
		'<tbody><tr><td id="first">unbreakableword</td><td id="second">B</td></tr><tr><td id="wide" colspan="2">one two three four five six seven eight nine ten</td></tr></tbody>',
		"table{width:30px}#first{width:1px}",
	);
	const layout = current.page();
	const table = current.box("#table", layout);
	const first = current.box("#first", layout);
	const wide = current.box("#wide", layout);
	expect(table.contentWidth).toBeGreaterThan(30);
	expect(first.contentWidth).toBeGreaterThan(1);
	expect(wide.borderBoxWidth).toBeCloseTo(table.contentWidth, 8);
	const text = layout.contexts.find((entry) => entry.id === wide.id)!;
	expect(text.lines.length).toBeGreaterThan(1);
	for (const glyph of text.glyphs) {
		expect(glyph.x).toBeGreaterThanOrEqual(wide.contentX);
		expect(glyph.x + glyph.advance).toBeLessThanOrEqual(
			wide.contentX + wide.contentWidth + 1e-8,
		);
	}
});

it("ignores cell margins and treats explicit cell widths as minima", () => {
	const current = fixture(
		undefined,
		"#first{width:80px;margin:30px}#second{width:10px}",
	);
	const layout = current.page();
	const first = current.box("#first", layout);
	const second = current.box("#second", layout);
	expect(first.borderBoxWidth).toBeGreaterThanOrEqual(80);
	expect(first.marginTop).toBe(0);
	expect(first.marginRight).toBe(0);
	expect(first.marginBottom).toBe(0);
	expect(first.marginLeft).toBe(0);
	expect(first.borderX).toBe(current.box("#table", layout).contentX);
	expect(second.borderX).toBe(first.borderX + first.borderBoxWidth);
});

it.each(["top", "middle", "bottom"] as const)(
	"moves %s cell content but keeps its stretched outer border anchored",
	(verticalAlign) => {
		const current = fixture(
			'<tbody><tr><td id="tall"></td><td id="aligned"><div id="inside">A</div></td></tr></tbody>',
			`#tall{height:50px}#aligned{vertical-align:${verticalAlign};padding:2px;border:1px solid blue}`,
		);
		const layout = current.page();
		const tall = current.box("#tall", layout);
		const aligned = current.box("#aligned", layout);
		const inside = current.box("#inside", layout);
		const offset =
			verticalAlign === "top" ? 0 : verticalAlign === "middle" ? 17 : 34;
		expect(aligned.borderY).toBe(tall.borderY);
		expect(aligned.borderBoxHeight).toBe(50);
		expect(aligned.paddingTop).toBe(2 + offset);
		expect(inside.borderY).toBe(aligned.borderY + 3 + offset);
		expectContentAccounting(aligned);
		const text = layout.contexts.find((entry) => entry.id === inside.id)!;
		expect(text.lines[0].top).toBe(inside.contentY);
	},
);

it("aligns actual text baselines from cells with unequal fonts and borders", () => {
	const current = fixture(
		undefined,
		"td{vertical-align:baseline}#first{font-size:20px;line-height:24px;padding-top:3px;border-top:2px solid red}#second{font-size:10px;line-height:12px}",
	);
	const layout = current.page();
	const first = current.box("#first", layout);
	const second = current.box("#second", layout);
	const firstText = layout.contexts.find((entry) => entry.id === first.id)!;
	const secondText = layout.contexts.find((entry) => entry.id === second.id)!;
	expect(firstText.lines[0].baseline).toBeCloseTo(
		secondText.lines[0].baseline,
		8,
	);
	expect(first.borderY).toBe(second.borderY);
	expect(second.paddingTop).toBeGreaterThan(0);
	expect(first.borderBoxHeight).toBe(second.borderBoxHeight);
	expectContentAccounting(first);
	expectContentAccounting(second);
});

it("keeps measured content taller than an explicit cell height", () => {
	const current = fixture(
		'<tbody><tr><td id="first"><div style="height:40px">A</div></td></tr></tbody>',
		"#first{height:1px;padding:2px;border:1px solid black}",
	);
	const layout = current.page();
	expect(current.box("#first", layout).borderBoxHeight).toBe(46);
	expect(current.box("#table", layout).contentHeight).toBe(46);
});

it("treats a table height smaller than its measured rows as a minimum", () => {
	const current = fixture(undefined, "table{height:5px}#first{height:40px}");
	const local = current.container();
	expect(local.naturalContentHeight).toBe(40);
	expect(local.contentHeight).toBe(40);
	expect(current.box("#table", current.page()).contentHeight).toBe(40);
});

it("uses row height hints and spreads explicit table-height expansion", () => {
	const current = fixture(
		'<tbody><tr id="row"><td id="first">A</td></tr><tr id="row2"><td id="second">B</td></tr></tbody>',
		"table{height:80px}#row{height:30px}",
	);
	const local = current.container();
	expect(local.naturalContentHeight).toBe(40);
	expect(local.contentHeight).toBe(80);
	const layout = current.page();
	expect(current.box("#row", layout).borderBoxHeight).toBe(50);
	expect(current.box("#row2", layout).borderBoxHeight).toBe(30);
	expect(current.box("#first", layout).borderBoxHeight).toBe(50);
	expect(current.box("#second", layout).borderBoxHeight).toBe(30);
});

it("keeps an empty explicit table extent without manufacturing rows or cells", () => {
	const current = fixture("", "table{height:25px;border-spacing:9px}");
	const local = current.container();
	expect(local.boxes).toEqual([]);
	expect(local.items).toEqual([]);
	expect(local.rows.sizes).toEqual([]);
	expect(local.naturalContentHeight).toBe(0);
	expect(local.contentHeight).toBe(25);
	expect(current.box("#table", current.page()).contentHeight).toBe(25);
});

it("reorders the first header and footer groups without losing actual refs", () => {
	const current = fixture(
		'<tfoot id="foot"><tr><td id="last">F</td></tr></tfoot><tbody id="body"><tr><td id="middle">B</td></tr></tbody><thead id="head"><tr><td id="first">H</td></tr></thead>',
	);
	const layout = current.page();
	expect(current.box("#first", layout).borderY).toBe(0);
	expect(current.box("#middle", layout).borderY).toBe(10);
	expect(current.box("#last", layout).borderY).toBe(20);
	expect(current.box("#head", layout).borderY).toBe(0);
	expect(current.box("#foot", layout).borderY).toBe(20);
});

it("retains nested tables, inline atomics and control descendants with top alignment", () => {
	const current = fixture(
		'<tbody><tr><td id="first"><table id="nested"><tbody><tr><td id="inner">N</td></tr></tbody></table></td><td id="second"><span id="atomic" style="display:inline-block;width:12px;height:14px">A</span><input id="control" value="B"></td></tr></tbody>',
		"#nested{width:30px}input{width:20px;height:12px}",
	);
	const layout = current.page();
	expect(current.box("#nested", layout).borderBoxWidth).toBe(30);
	expect(current.box("#inner", layout).borderBoxHeight).toBeGreaterThan(0);
	expect(current.box("#atomic", layout).borderBoxWidth).toBe(12);
	expect(
		layout.text.horizontal.atomics?.some(
			(entry) => entry.id === current.node("#atomic").id,
		),
	).toBe(true);
	expect(
		layout.text.horizontal.images.some(
			(entry) => entry.id === current.node("#control").id,
		),
	).toBe(true);
	expect(current.container().baselines.unsupported).toBe(true);
});

it("rejects baseline alignment rather than inventing control or atomic baselines", () => {
	const current = fixture(
		'<tbody><tr><td id="first"><input value="A"></td></tr></tbody>',
		"td{vertical-align:baseline}",
	);
	expectError(() => current.container(), "unsupported");
});

it("keeps rowspanned cell backgrounds above later row backgrounds", () => {
	const current = fixture(
		'<tbody><tr><td id="span" rowspan="2"></td><td></td></tr><tr id="row2"><td></td></tr></tbody>',
		"td{height:20px}#span{background:red;border:2px solid black}#row2{background:blue}",
	);
	const layout = current.page();
	const spanning = current.box("#span", layout);
	const secondRow = current.box("#row2", layout);
	const raster = rasterizeDocument(current.tree);
	const pixel = (horizontal: number, vertical: number) => {
		const offset =
			(Math.floor(vertical) * raster.image.width + Math.floor(horizontal)) * 4;
		return Array.from(raster.image.pixels.slice(offset, offset + 4));
	};
	expect(pixel(spanning.borderX + 3, secondRow.borderY + 3)).toEqual([
		255, 0, 0, 255,
	]);
	expect(pixel(spanning.borderX, secondRow.borderY + 3)).toEqual([
		0, 0, 0, 255,
	]);
});

it("exposes stretched cell, row and group refs to document geometry and hit testing", () => {
	const current = fixture(undefined, "td{height:30px}");
	const layout = current.page();
	const first = current.box("#first", layout);
	const row = current.box("#row", layout);
	expect(
		documentGeometry(current.tree).getBoundingClientRect(current.id("#first")),
	).toMatchObject({
		x: first.borderX,
		y: first.borderY,
		width: first.borderBoxWidth,
		height: 30,
	});
	expect(
		documentGeometry(current.tree).getBoundingClientRect(current.id("#row")),
	).toMatchObject({
		x: row.borderX,
		y: row.borderY,
		width: row.borderBoxWidth,
		height: 30,
	});
	expect(
		documentHitTesting(current.tree).elementFromPoint(
			first.borderX + 2,
			first.borderY + 25,
		),
	).toBe(current.id("#first"));
});

it.each([
	"table{border-collapse:collapse}",
	"table{table-layout:fixed}",
	"td{height:50%}",
	"tr{height:50%}",
	"tbody{height:30px}",
	"td{max-height:5px}",
	"table{max-height:5px}",
	"td{position:relative}",
	"tr{position:relative}",
	"table{empty-cells:hide}",
])("rejects unsupported table profile %s", (css) => {
	const current = fixture(undefined, css);
	expectError(() => current.container(), "unsupported");
});

it("rejects descendant percentage heights and caption wrapper semantics", () => {
	const percentage = fixture(
		'<tbody><tr><td><div style="height:50%">A</div></td></tr></tbody>',
	);
	expectError(() => percentage.container(), "unsupported");
	const caption = fixture(
		"<caption>Caption</caption><tbody><tr><td>A</td></tr></tbody>",
	);
	expectError(() => caption.container(), "unsupported");
});

it("enforces work and nesting limits with detached frozen output", () => {
	const current = fixture();
	const result = current.container();
	expect(current.container(120, result.metrics.work)).toEqual(result);
	expectError(
		() => current.container(120, result.metrics.work - 1),
		"resource-limit",
	);
	expectError(() => current.container(120, 1), "resource-limit");
	for (const maxWork of [0, -1, NaN, Infinity, tableLayoutLimits.maxWork + 1])
		expectError(() => current.container(120, maxWork), "invalid-input");
	expectError(
		() =>
			layoutFormattingTableContainer(
				current.formatting,
				current.node("#table").id,
				{ contentWidth: 120, containingWidth: 320, containingHeight: 240 },
				{},
				{ nesting: tableLayoutLimits.maxNesting },
			),
		"resource-limit",
	);
	for (const value of [
		result,
		result.boxes,
		result.boxes[0],
		result.contexts,
		result.items,
		result.metrics,
		result.rows,
	])
		expect(Object.isFrozen(value)).toBe(true);
	expect(current.node("#first").box?.["margin-top"]).toBe("0px");
});

it("rejects malformed constraints and non-table roots", () => {
	const current = fixture();
	for (const constraints of [
		null,
		{},
		{ contentWidth: -1, containingWidth: 120, containingHeight: null },
	])
		expectError(
			() =>
				layoutFormattingTableContainer(
					current.formatting,
					current.node("#table").id,
					constraints as never,
				),
			"invalid-input",
		);
	expectError(
		() =>
			layoutFormattingTableContainer(
				current.formatting,
				current.node("#first").id,
				{ contentWidth: 120, containingWidth: 320, containingHeight: 240 },
			),
		"unsupported",
	);
	expectError(() => current.container(1), "unsupported");
});
