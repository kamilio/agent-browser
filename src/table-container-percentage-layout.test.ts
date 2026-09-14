import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { type DocumentRaster, rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentHitTesting } from "./hit-testing.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutFormattingTableContainer } from "./table-layout.js";

const trees: DocumentTree[] = [];
const owners: DocumentQueries[] = [];

afterEach(() => {
	for (const owner of owners.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	css = "",
	content = '<td id="first"></td><td id="second"></td>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;font-size:10px;line-height:10px}#host{width:320px}table{width:50%;border-spacing:0;border-collapse:separate}td{padding:0;height:12px;vertical-align:top}#after{height:7px}${css}</style><div id="host"><table id="table"><tbody id="group"><tr id="row">${content}</tr></tbody></table><div id="after"></div></div>`,
		"https://fixture.invalid/table-container-percentage",
	);
	trees.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(640, 240);
	const queries = new DocumentQueries(tree);
	owners.push(queries);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing percentage target ${selector}`);
		return found;
	};
	const box = (selector: string) => {
		const reference = tree.reference(id(selector));
		const found = layoutDocument(tree).boxes.find(
			(entry) => entry.ref === reference,
		);
		if (!found) throw new Error(`Missing percentage box ${selector}`);
		return found;
	};
	const rectangle = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	return { tree, styles, id, box, rectangle };
}

function fails(run: () => unknown, code: string) {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		expect((error as AgentBrowserError).code).toBe(code);
		return;
	}
	throw new Error(`Expected ${code}`);
}

function pixel(raster: DocumentRaster, horizontal: number, vertical: number) {
	const column = Math.floor(horizontal - raster.clip.x);
	const row = Math.floor(vertical - raster.clip.y);
	if (
		column < 0 ||
		row < 0 ||
		column >= raster.image.width ||
		row >= raster.image.height
	)
		throw new Error("Sample outside percentage table raster");
	const offset = (row * raster.image.width + column) * 4;
	return [...raster.image.pixels.slice(offset, offset + 4)];
}

it.each([0, 12.5, 25, 50, 75, 100, 150, 200])(
	"resolves an uncaptioned table width of %s percent against its containing block",
	(percentage) => {
		const test = fixture(`#table{width:${percentage}%}`);
		expect(test.box("#host").contentWidth).toBe(320);
		expect(test.box("#table").contentWidth).toBeCloseTo(
			(320 * percentage) / 100,
			8,
		);
		expect(test.rectangle("#table").width).toBeCloseTo(
			(320 * percentage) / 100,
			8,
		);
		expect(test.rectangle("#row").width).toBeCloseTo(
			(320 * percentage) / 100,
			8,
		);
		expect(
			test.rectangle("#first").width + test.rectangle("#second").width,
		).toBeCloseTo((320 * percentage) / 100, 8);
		expect(test.rectangle("#after").top).toBe(12);
	},
);

it.each([
	["calc(50% + 20px)", 180],
	["calc(50% - 20px)", 140],
	["min(50%, 120px)", 120],
	["max(25%, 120px)", 120],
	["clamp(80px, 50%, 200px)", 160],
] as const)(
	"resolves table width math %s without treating the root as a cyclic cell",
	(width, expected) => {
		const test = fixture(`#table{width:${width}}`);
		expect(test.box("#table").contentWidth).toBe(expected);
		expect(test.box("#row").borderBoxWidth).toBe(expected);
	},
);

it.each(["separate", "collapse"])(
	"keeps intrinsic cell minima above a small %s percentage request",
	(model) => {
		const test = fixture(
			`#host{width:120px}#table{width:25%;border-collapse:${model}}#first-content{width:40px}#second-content{width:60px}`,
			'<td id="first"><div id="first-content"></div></td><td id="second"><div id="second-content"></div></td>',
		);
		expect(test.box("#host").contentWidth).toBe(120);
		expect(test.box("#table").contentWidth).toBe(100);
		expect(test.rectangle("#first").width).toBe(40);
		expect(test.rectangle("#second").width).toBe(60);
	},
);

it.each([
	["min-width:200px", 200],
	["max-width:120px", 120],
] as const)(
	"retains fixed-length constraints alongside percentage width: %s",
	(constraint, expected) => {
		const test = fixture(`#table{${constraint}}`);
		expect(test.rectangle("#table").width).toBe(expected);
	},
);

it("uses the parent content box rather than viewport, margin or padding box", () => {
	const test = fixture(
		"#host{width:400px;box-sizing:border-box;padding:20px;border:10px solid black;margin-left:15px}",
	);
	expect(test.box("#host").contentWidth).toBe(340);
	expect(test.rectangle("#table")).toMatchObject({
		left: 45,
		top: 30,
		width: 170,
	});
	expect(test.box("#table").containingWidth).toBe(340);
});

it("resolves nested percentage tables against the assigned outer cell width", () => {
	const test = fixture(
		"#table{width:75%}#first{width:50%}#inner-table{width:50%}",
		'<td id="first"><table id="inner-table"><tr><td id="inner-cell"></td></tr></table></td><td id="second"></td>',
	);
	expect(test.rectangle("#table").width).toBe(240);
	expect(test.rectangle("#first").width).toBe(120);
	expect(test.box("#inner-table").containingWidth).toBe(120);
	expect(test.rectangle("#inner-table").width).toBe(60);
	expect(test.rectangle("#inner-cell").width).toBe(60);
});

it("keeps intrinsic content in an auto table containing a percentage table", () => {
	const test = fixture(
		"#table{width:auto}#inner-table{width:50%}#rigid{width:60px}",
		'<td id="first"><table id="inner-table"><tr><td><div id="rigid"></div></td></tr></table></td>',
	);
	expect(test.rectangle("#table").width).toBe(60);
	expect(test.rectangle("#inner-table").width).toBe(60);
	expect(test.rectangle("#rigid").width).toBe(60);
});

it("recomputes containing percentages after viewport and parent mutations", () => {
	const test = fixture("#host{width:80%}");
	expect(test.rectangle("#table").width).toBe(256);
	test.styles.setViewport(400, 240);
	expect(test.rectangle("#table").width).toBe(160);
	test.tree.setAttribute(test.id("#host"), "style", "width:200px");
	expect(test.rectangle("#table").width).toBe(100);
	test.tree.setAttribute(test.id("#table"), "style", "width:75%");
	expect(test.rectangle("#table").width).toBe(150);
});

it.each(["separate", "collapse"])(
	"reflows natural %s row height, text, paint and hits when percentage width wraps content",
	(model) => {
		const test = fixture(
			`html,body{font-size:8px;line-height:8px}#host{width:120px}#table{border-collapse:${model}}td{height:auto;background:red}#after{background:lime}`,
			'<td id="first">AA BB CC</td>',
		);
		const hits = documentHitTesting(test.tree);
		const inspect = (width: number, height: number, tops: number[]) => {
			const layout = layoutDocument(test.tree);
			const cell = test.box("#first");
			const text = layout.contexts.find((entry) => entry.id === cell.id);
			if (!text) throw new Error("Missing percentage cell text context");
			expect(test.rectangle("#table")).toMatchObject({ width, height });
			expect(test.rectangle("#first")).toMatchObject({ width, height });
			expect(test.rectangle("#row").height).toBe(height);
			expect(test.rectangle("#after").top).toBe(height);
			expect(text.lines.map((line) => line.top)).toEqual(tops);
			for (const glyph of text.glyphs) {
				expect(glyph.x).toBeGreaterThanOrEqual(0);
				expect(glyph.x + glyph.advance).toBeLessThanOrEqual(width);
			}
		};
		inspect(60, 8, [0]);
		const firstRaster = rasterizeDocument(test.tree);
		expect(pixel(firstRaster, 22, 12)).toEqual([0, 255, 0, 255]);
		expect(hits.elementFromPoint(22, 12)).toBe(test.id("#after"));
		test.tree.setAttribute(test.id("#host"), "style", "width:48px");
		inspect(24, 24, [0, 8, 16]);
		expect(pixel(rasterizeDocument(test.tree), 22, 12)).toEqual([
			255, 0, 0, 255,
		]);
		expect(hits.elementFromPoint(22, 12)).toBe(test.id("#first"));
		expect(pixel(firstRaster, 22, 12)).toEqual([0, 255, 0, 255]);
		test.tree.setAttribute(test.id("#host"), "style", "width:120px");
		inspect(60, 8, [0]);
		expect(pixel(rasterizeDocument(test.tree), 22, 12)).toEqual([
			0, 255, 0, 255,
		]);
		expect(hits.elementFromPoint(22, 12)).toBe(test.id("#after"));
	},
);

it.each(["float", "flex", "grid"])(
	"resolves percentages inside a %s-allocated block instead of the ancestor viewport",
	(mode) => {
		const css =
			mode === "float"
				? "#host{display:flow-root}#allocation{float:left;width:200px}"
				: mode === "flex"
					? "#host{display:flex}#allocation{flex:0 0 200px;min-width:0}"
					: "#host{display:grid;grid-template-columns:200px}#allocation{min-width:0}";
		const test = fixture(css);
		const allocation = test.tree.createElement("div", { id: "allocation" });
		test.tree.insert(test.id("#host"), allocation, test.id("#table"));
		test.tree.append(allocation, test.id("#table"));
		expect(test.box("#host").contentWidth).toBe(320);
		expect(test.box("#allocation").contentWidth).toBe(200);
		expect(test.box("#table").containingWidth).toBe(200);
		expect(test.rectangle("#table").width).toBe(100);
		if (mode === "grid")
			test.tree.setAttribute(
				test.id("#host"),
				"style",
				"grid-template-columns:160px",
			);
		else
			test.tree.setAttribute(
				allocation,
				"style",
				mode === "flex" ? "flex:0 0 160px" : "width:160px",
			);
		expect(test.box("#allocation").contentWidth).toBe(160);
		expect(test.box("#table").containingWidth).toBe(160);
		expect(test.rectangle("#table").width).toBe(80);
	},
);

it.each(["float", "flex", "grid"])(
	"retains the unsupported direct percentage table %s boundary",
	(mode) => {
		const test = fixture(
			mode === "float" ? "#table{float:left}" : `#host{display:${mode}}`,
		);
		const formatting = buildFormattingTree(test.tree);
		expect(
			formatting.issues[
				mode === "float"
					? "float-layout-not-supported"
					: "table-item-layout-not-supported"
			],
		).toBe(1);
		fails(() => layoutDocument(test.tree), "unsupported");
	},
);

it.each([
	"#row{width:50%}",
	"#group{width:50%}",
	"#table{min-width:20%}",
	"#table{max-width:90%}",
	"#table{height:50%}",
	"#row{height:50%}",
	"#first{min-width:20%}",
	"#first{height:50%}",
	"#first{width:calc(50% + 10px)}",
	"#table{table-layout:fixed}",
	"#first{position:relative}",
])(
	"does not use the resolved container width to admit unrelated table profile %s",
	(css) => {
		const test = fixture(css);
		fails(() => layoutDocument(test.tree), "unsupported");
	},
);

it.each([NaN, Infinity, -1])(
	"rejects an invalid definite containing width %s before table layout",
	(containingWidth) => {
		const test = fixture();
		const formatting = buildFormattingTree(test.tree);
		const target = formatting.nodes.find(
			(node) => node.ref === test.tree.reference(test.id("#table")),
		);
		if (!target) throw new Error("Missing table formatting node");
		fails(
			() =>
				layoutFormattingTableContainer(formatting, target.id, {
					contentWidth: 160,
					containingWidth,
					containingHeight: null,
				}),
			"invalid-input",
		);
	},
);

it("retains table work accounting for a resolved percentage root", () => {
	const test = fixture();
	const formatting = buildFormattingTree(test.tree);
	const target = formatting.nodes.find(
		(node) => node.ref === test.tree.reference(test.id("#table")),
	);
	if (!target) throw new Error("Missing table formatting node");
	fails(
		() =>
			layoutFormattingTableContainer(
				formatting,
				target.id,
				{ contentWidth: 160, containingWidth: 320, containingHeight: null },
				{ maxWork: 1 },
			),
		"resource-limit",
	);
});
