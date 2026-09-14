import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(
	css = "",
	content = '<main id="target"><div id="child"></div></main>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{position:relative;width:20px;height:20px;background:red}#child{position:absolute;left:10px;top:0;width:20px;height:20px;background:blue}${css}</style>${content}`,
		"https://fixture.invalid/opacity-document",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(40, 40);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const raster = () => rasterizeDocument(tree);
	const pixel = (column: number, row = 5) => {
		const image = raster().image;
		const offset = (row * image.width + column) * 4;
		return [...image.pixels.slice(offset, offset + 4)];
	};
	return { tree, id, raster, pixel };
}

it.each([
	["0", [255, 255, 255, 255]],
	[".5", [128, 128, 255, 255]],
	["1", [0, 0, 255, 255]],
	["50%", [128, 128, 255, 255]],
	["-4", [255, 255, 255, 255]],
	["4", [0, 0, 255, 255]],
] as const)(
	"composites overlapping descendants once at opacity %s",
	(opacity, expected) => {
		const page = fixture(`main{opacity:${opacity}}`);
		expect(page.pixel(15)).toEqual(expected);
		expect(page.pixel(25)).toEqual(expected);
		expect(page.pixel(35)).toEqual([255, 255, 255, 255]);
	},
);

it("isolates overlapping parent background and child paint", () => {
	const page = fixture("main{opacity:.5}");
	expect(page.pixel(5)).toEqual([255, 128, 128, 255]);
	expect(page.pixel(15)).toEqual([128, 128, 255, 255]);
	expect(page.raster().metrics).toMatchObject({
		opacityGroups: 1,
		opacityPixels: 1600,
		opacityPeakPixels: 1600,
	});
});

it("composites nested groups rather than multiplying each descendant paint", () => {
	const page = fixture("main{opacity:.5}#child{opacity:.5}");
	expect(page.pixel(15)).toEqual([192, 128, 192, 255]);
	expect(page.pixel(25)).toEqual([191, 191, 255, 255]);
	expect(page.raster().metrics).toMatchObject({
		opacityGroups: 2,
		opacityPeakPixels: 3200,
	});
});

it("does not repeat a parent's opacity on descendant text nodes", () => {
	const page = fixture(
		"main{opacity:.5;color:black;background:white}",
		'<main id="target">A<span>B</span></main>',
	);
	const image = page.raster().image;
	const colors = new Set(
		Array.from({ length: 40 * 40 }, (_, index) => image.pixels[index * 4]),
	);
	expect(colors.has(128)).toBe(true);
	expect(colors.has(192)).toBe(false);
});

it("keeps unit opacity byte-identical and avoids temporary layers", () => {
	const baseline = fixture();
	const unit = fixture("main{opacity:1}#child{opacity:100%}");
	expect(unit.raster().image.pixels).toEqual(baseline.raster().image.pixels);
	expect(unit.raster().metrics.opacityGroups).toBeUndefined();
});

it("retains geometry and pointer eligibility at zero opacity", () => {
	const page = fixture("main{opacity:0}");
	const reference = page.id();
	const before = documentGeometry(page.tree).getBoundingClientRect(page.id());
	expect(documentHitTesting(page.tree).elementFromPoint(5, 5)).toBe(reference);
	page.tree.setAttribute(page.id(), "style", "opacity:1");
	expect(documentGeometry(page.tree).getBoundingClientRect(page.id())).toEqual(
		before,
	);
	expect(documentHitTesting(page.tree).elementFromPoint(5, 5)).toBe(reference);
});

it("still honors pointer-events none on an invisible element", () => {
	const page = fixture("main{opacity:0;pointer-events:none}");
	expect(documentHitTesting(page.tree).elementFromPoint(5, 5)).not.toBe(
		page.id(),
	);
});

it("invalidates prepared rasters after opacity mutation", () => {
	const page = fixture();
	const prepared = prepareDocumentRaster(page.tree);
	page.tree.setAttribute(page.id(), "style", "opacity:.5");
	expect(() => prepared.rasterize()).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(page.pixel(15)).toEqual([128, 128, 255, 255]);
});

it("includes the propagated canvas background in root opacity", () => {
	const page = fixture(
		"html{opacity:.5;background:red}main{background:transparent}#child{display:none}",
	);
	expect(page.pixel(35, 35)).toEqual([255, 128, 128, 255]);
	expect(page.raster().metrics.opacityGroups).toBe(1);
});

it("does not apply body opacity to its background propagated to the canvas", () => {
	const page = fixture("body{opacity:.5;background:blue}#child{display:none}");
	expect(page.pixel(35, 35)).toEqual([0, 0, 255, 255]);
	expect(page.pixel(5)).toEqual([128, 0, 128, 255]);
});

it("preserves overflow clipping when destinations change between groups", () => {
	const page = fixture("main{opacity:.5;overflow:hidden}#child{opacity:.5}");
	expect(page.pixel(15)).toEqual([192, 128, 192, 255]);
	expect(page.pixel(25)).toEqual([255, 255, 255, 255]);
});

it("preserves rounded overflow clipping inside an opacity group", () => {
	const page = fixture(
		"main{opacity:.5;overflow:hidden;border-radius:10px}#child{left:0}",
	);
	expect(page.pixel(0, 0)).toEqual([255, 255, 255, 255]);
	expect(page.pixel(10, 10)).toEqual([128, 128, 255, 255]);
});

it("composites a fragmented inline once across lines", () => {
	const page = fixture(
		"main{width:12px;height:auto;background:white}span{opacity:.5;background:red}",
		'<main id="target"><span>A B C</span></main>',
	);
	expect(page.raster().metrics.opacityGroups).toBe(1);
	expect(page.pixel(5, 0)).toEqual([255, 128, 128, 255]);
});

it("isolates generated-content opacity without repeating it on its text", () => {
	const page = fixture(
		'main{background:white}main::before{content:"A";display:block;width:12px;height:12px;background:red;opacity:.5}',
		'<main id="target"></main>',
	);
	expect(page.raster().metrics.opacityGroups).toBe(1);
	expect(page.pixel(10, 10)).toEqual([255, 128, 128, 255]);
});

it("moves table opacity to the caption wrapper exactly once", () => {
	const page = fixture(
		"table{opacity:.5;border-spacing:0}caption{background:red}td{background:blue}",
		'<table id="target"><caption>Cap</caption><tr><td>A</td></tr></table>',
	);
	const formatting = buildFormattingTree(page.tree);
	const owners = formatting.nodes.filter((node) => node.opacity !== undefined);
	expect(owners).toHaveLength(1);
	expect(owners[0].tableGrid).toBeDefined();
	expect(page.raster().metrics.opacityGroups).toBe(1);
});

it("includes propagated background opacity for a captioned document-root table", () => {
	const tree = new DocumentTree("https://fixture.invalid/root-table-opacity");
	const table = tree.createElement("table");
	tree.setAttribute(
		table,
		"style",
		"opacity:.5;background:red;width:20px;border-spacing:0;font-size:8px",
	);
	tree.append(tree.root, table);
	const caption = tree.createElement("caption");
	tree.append(table, caption);
	tree.append(caption, tree.createText("A"));
	const row = tree.createElement("tr");
	tree.append(table, row);
	const cell = tree.createElement("td");
	tree.append(row, cell);
	tree.append(cell, tree.createText("B"));
	fixtures.push({ tree, queries: new DocumentQueries(tree) });
	documentStyles(tree).setViewport(40, 40);
	const result = rasterizeDocument(tree);
	const offset = (35 * 40 + 35) * 4;
	expect([...result.image.pixels.slice(offset, offset + 4)]).toEqual([
		255, 128, 128, 255,
	]);
	expect(result.metrics.opacityGroups).toBe(1);
});

it("keeps split block-in-inline opacity explicitly unsupported", () => {
	const page = fixture(
		"span{opacity:.5}",
		'<main id="target"><span>A<div>B</div>C</span></main>',
	);
	expect(
		buildFormattingTree(page.tree).issues[
			"opacity-block-in-inline-not-supported"
		],
	).toBeGreaterThan(0);
	expect(() => page.raster()).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("keeps individual collapsed-border owner opacity explicit", () => {
	const page = fixture(
		"table{border-collapse:collapse}td{opacity:.5;border:1px solid red}",
		'<table id="target"><tr><td>A</td></tr></table>',
	);
	expect(
		buildFormattingTree(page.tree).issues[
			"opacity-collapsed-border-owner-not-supported"
		],
	).toBeGreaterThan(0);
	expect(() => page.raster()).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([
	"transform:translateX(1px)",
	"mix-blend-mode:multiply",
	"isolation:isolate",
])("retains independent effect guard %s", (effect) => {
	expect(() => fixture(`main{opacity:.5;${effect}}`).raster()).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("keeps unsupported content guarded even when its group is transparent", () => {
	expect(() =>
		fixture(
			"main{opacity:0}",
			'<main id="target"><div style="transform:rotate(3deg)">A</div></main>',
		).raster(),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
});

it("charges temporary allocation and compositing to the document work budget", () => {
	const baseline = fixture();
	const budget = baseline.raster().metrics.work;
	const page = fixture("main{opacity:.5}");
	expect(() => rasterizeDocument(page.tree, { maxWork: budget })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("keeps cropped captures in the same document opacity group", () => {
	const page = fixture("main{opacity:.5}");
	const cropped = rasterizeDocument(page.tree, {
		clip: { x: 12, y: 2, width: 4, height: 4 },
	});
	expect([...cropped.image.pixels.slice(0, 4)]).toEqual([128, 128, 255, 255]);
	expect(cropped.metrics.opacityPixels).toBe(16);
});

it("keeps PDF output on the same opacity-aware raster path", () => {
	const page = fixture("main{opacity:.5}");
	expect(renderDocumentPdf(page.tree).bytes.length).toBeGreaterThan(0);
	expect(layoutDocument(page.tree).partial).toBe(true);
});

it.each([
	'<input id="field" value="A B" size="2">',
	'<button id="field">A B</button>',
	'<textarea id="field" cols="2" rows="1">A B</textarea>',
	'<select id="field"><option>A B</option></select>',
])("composites native control ink and decoration together: %s", (control) => {
	const page = fixture(
		"main{background:white}input,button,textarea,select{font-size:8px}",
		`<main id="target">${control}</main>`,
	);
	const baseline = page.raster();
	expect(baseline.metrics.paintedControls).toBe(1);
	page.tree.setAttribute(page.id(), "style", "opacity:.5");
	const faded = page.raster();
	expect(faded.metrics.paintedControls).toBe(1);
	expect(faded.metrics.opacityGroups).toBe(1);
	for (let offset = 0; offset < baseline.image.pixels.length; offset++)
		expect(faded.image.pixels[offset]).toBe(
			offset % 4 === 3
				? 255
				: Math.round((baseline.image.pixels[offset] + 255) / 2),
		);
});

it("composites outer SVG opacity only once through the HTML group", () => {
	const page = fixture(
		"svg{opacity:.5}",
		'<svg id="target" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
	);
	expect(page.pixel(5)).toEqual([255, 128, 128, 255]);
	expect(page.raster().metrics.opacityGroups).toBe(1);
});
