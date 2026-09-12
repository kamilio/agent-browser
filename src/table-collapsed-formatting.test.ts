import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureFormattingIntrinsicWidths } from "./intrinsic-widths.js";
import { layoutFormattingTableContainer } from "./table-layout.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it.each(["intrinsic", "layout"])(
	"requires resolved conflicts for direct %s consumers",
	(consumer) => {
		const test = fixture();
		const source = test.formatting();
		const table = test.node("#table", source);
		const formatting = {
			...source,
			nodes: source.nodes.map((node) =>
				node.id === table.id ? { ...node, collapsedTable: undefined } : node,
			),
		};
		expect(() =>
			consumer === "intrinsic"
				? measureFormattingIntrinsicWidths(formatting)
				: layoutFormattingTableContainer(formatting, table.id, {
						contentWidth: 40,
						containingWidth: 100,
						containingHeight: 80,
					}),
		).toThrow("requires resolved border conflicts");
	},
);

function fixture(
	css = "",
	markup = '<table id="table"><tbody id="group"><tr id="row"><td id="first">A</td><td id="second">B</td></tr></tbody></table>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;font-size:8px;line-height:8px}table{border-collapse:collapse;width:40px}td{padding:0;border:2px solid red}${css}</style><body>${markup}`,
		"https://fixture.invalid/collapsed-formatting",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const formatting = () => buildFormattingTree(tree);
	const node = (selector: string, current = formatting()) => {
		const ref = tree.reference(id(selector));
		const found = current.nodes.find((entry) => entry.ref === ref);
		if (!found) throw new Error(`Missing formatting ${selector}`);
		return found;
	};
	return { tree, id, formatting, node };
}

it("resolves shared half borders while retaining the table layout shell", () => {
	const test = fixture("#second{border-left:6px solid blue}");
	const formatting = test.formatting();
	const table = test.node("#table", formatting);
	expect(formatting.issues).toEqual({ "display-layout-not-supported": 1 });
	expect(table.kind).toBe("deferred");
	expect(table.collapsedTable?.placement.columnCount).toBe(2);
	expect(test.node("#first", formatting).box?.["border-right-width"]).toBe(
		"3px",
	);
	expect(test.node("#second", formatting).box?.["border-left-width"]).toBe(
		"3px",
	);
	for (const selector of ["#table", "#group", "#row", "#first", "#second"])
		expect(test.node(selector, formatting).collapsedBorderOwner).toBe(table.id);
	expect(
		table.collapsedTable?.segments.find(
			(segment) => segment.orientation === "vertical" && segment.column === 1,
		),
	).toMatchObject({
		width: 6,
		ownerId: test.node("#second", formatting).id,
		ownerKind: "cell",
		color: [0, 0, 255, 255],
	});
});

it("lets hidden suppress wider shared borders without reserving space", () => {
	const test = fixture(
		"#first{border-right:12px solid red}#second{border-left:1px hidden}",
	);
	const formatting = test.formatting();
	expect(test.node("#first", formatting).box?.["border-right-width"]).toBe(
		"0px",
	);
	expect(test.node("#second", formatting).box?.["border-left-width"]).toBe(
		"0px",
	);
	expect(
		test
			.node("#table", formatting)
			.collapsedTable?.segments.some(
				(segment) => segment.orientation === "vertical" && segment.column === 1,
			),
	).toBe(false);
	expect(() => layoutDocument(test.tree)).not.toThrow();
});

it.each([
	{ css: "table{border:8px solid green}", kind: "table", width: 8 },
	{ css: "tbody{border:6px solid green}", kind: "row-group", width: 6 },
	{ css: "tr{border:4px solid green}", kind: "row", width: 4 },
])("includes $kind borders in outer geometry", ({ css, kind, width }) => {
	const test = fixture(css);
	const formatting = test.formatting();
	const table = test.node("#table", formatting);
	expect(table.box?.["border-left-width"]).toBe(`${width / 2}px`);
	expect(
		table.collapsedTable?.segments.every(
			(segment) =>
				(segment.column === 1 && segment.orientation === "vertical") ||
				segment.ownerKind === kind,
		),
	).toBe(true);
	expect(() => layoutDocument(test.tree)).not.toThrow();
});

it("uses cell color before equal row, group and table participants", () => {
	const test = fixture("table,tbody,tr{border:2px solid green}");
	const table = test.node("#table");
	expect(
		table.collapsedTable?.segments.every(
			(segment) =>
				segment.ownerKind === "cell" &&
				segment.color[0] === 255 &&
				segment.color[1] === 0,
		),
	).toBe(true);
});

it("ignores table padding, spacing and empty-cells in the collapsed model", () => {
	const baseline = fixture();
	const changed = fixture(
		"table{padding:12px;border-spacing:20px;empty-cells:hide}",
	);
	for (const selector of ["#table", "#first", "#second"])
		expect(
			documentGeometry(changed.tree).getBoundingClientRect(
				changed.id(selector),
			),
		).toEqual(
			documentGeometry(baseline.tree).getBoundingClientRect(
				baseline.id(selector),
			),
		);
	expect(changed.formatting().issues).toEqual({
		"display-layout-not-supported": 1,
	});
});

it("suppresses internal colspan edges but keeps the next row's shared edge", () => {
	const test = fixture(
		"",
		'<table id="table"><tr><td colspan="2" id="wide">A</td></tr><tr><td>B</td><td>C</td></tr></table>',
	);
	const table = test.node("#table");
	expect(
		table.collapsedTable?.segments.some(
			(segment) =>
				segment.orientation === "vertical" &&
				segment.row === 0 &&
				segment.column === 1,
		),
	).toBe(false);
	expect(
		table.collapsedTable?.segments.some(
			(segment) =>
				segment.orientation === "vertical" &&
				segment.row === 1 &&
				segment.column === 1,
		),
	).toBe(true);
	expect(() => layoutDocument(test.tree)).not.toThrow();
});

it("suppresses an internal rowspan edge without dropping neighboring borders", () => {
	const test = fixture(
		"tr{border:4px solid green}",
		'<table id="table"><tr><td rowspan="2" id="tall">A</td><td>B</td></tr><tr><td>C</td></tr></table>',
	);
	const table = test.node("#table");
	expect(
		table.collapsedTable?.segments.some(
			(segment) =>
				segment.orientation === "horizontal" &&
				segment.row === 1 &&
				segment.column === 0,
		),
	).toBe(false);
	expect(
		table.collapsedTable?.segments.some(
			(segment) =>
				segment.orientation === "horizontal" &&
				segment.row === 1 &&
				segment.column === 1,
		),
	).toBe(true);
	expect(() => layoutDocument(test.tree)).not.toThrow();
});

it("keeps source refs while reordering header and footer border participants", () => {
	const test = fixture(
		"",
		'<table id="table"><tfoot id="footer"><tr><td>F</td></tr></tfoot><tbody id="body"><tr><td>B</td></tr></tbody><thead id="header"><tr><td>H</td></tr></thead></table>',
	);
	const formatting = test.formatting();
	const placement = test.node("#table", formatting).collapsedTable?.placement;
	expect(placement?.groups.map((group) => group.id)).toEqual([
		test.node("#header", formatting).id,
		test.node("#body", formatting).id,
		test.node("#footer", formatting).id,
	]);
	const geometry = documentGeometry(test.tree);
	expect(geometry.getBoundingClientRect(test.id("#header")).top).toBeLessThan(
		geometry.getBoundingClientRect(test.id("#body")).top,
	);
	expect(geometry.getBoundingClientRect(test.id("#body")).top).toBeLessThan(
		geometry.getBoundingClientRect(test.id("#footer")).top,
	);
});

it("keeps immutable snapshots through border mutation and collapse-mode changes", () => {
	const test = fixture();
	const original = test.formatting();
	const originalTable = test.node("#table", original);
	const originalSegments = originalTable.collapsedTable?.segments;
	expect(Object.isFrozen(originalSegments)).toBe(true);
	expect(
		originalSegments?.every(
			(segment) => Object.isFrozen(segment) && Object.isFrozen(segment.color),
		),
	).toBe(true);
	test.tree.setAttribute(
		test.id("#second"),
		"style",
		"border-left:8px solid blue",
	);
	expect(test.node("#first").box?.["border-right-width"]).toBe("4px");
	expect(test.node("#first", original).box?.["border-right-width"]).toBe("1px");
	test.tree.setAttribute(
		test.id("#table"),
		"style",
		"border-collapse:separate;border-spacing:5px",
	);
	expect(test.node("#table").collapsedTable).toBeUndefined();
	expect(originalTable.collapsedTable?.segments).toBe(originalSegments);
	const geometry = documentGeometry(test.tree);
	expect(
		geometry.getBoundingClientRect(test.id("#second")).left -
			geometry.getBoundingClientRect(test.id("#first")).right,
	).toBe(5);
});

it.each([
	{ css: "td{position:relative}", markup: undefined },
	{ css: "table{table-layout:fixed}", markup: undefined },
	{ css: "td{width:50%}", markup: undefined },
	{ css: "", markup: '<table id="table"><col><tr><td>A</td></tr></table>' },
	{
		css: "",
		markup: '<table id="table"><caption>C</caption><tr><td>A</td></tr></table>',
	},
	{ css: "table{border:2px solid red}", markup: '<table id="table"></table>' },
])(
	"retains unsupported structural and positioned profiles: %j",
	({ css, markup }) => {
		const test = fixture(css, markup);
		expect(() => layoutDocument(test.tree)).toThrow();
	},
);

it("supports a zero-border empty grid without inventing cells", () => {
	const test = fixture("", '<table id="table"></table>');
	expect(test.node("#table").collapsedTable?.segments).toEqual([]);
	expect(
		layoutDocument(test.tree).boxes.some(
			(box) => box.ref === test.tree.reference(test.id("#table")),
		),
	).toBe(true);
});
