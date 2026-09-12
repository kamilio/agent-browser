import { afterEach, expect, it } from "vitest";
import { bitmapGlyph } from "./bitmap-font.js";
import type { DocumentTree } from "./document.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { collectFlexBaselines } from "./flex-placement.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:96px}#atom{display:inline-block;width:36px}#float{float:left;width:12px;height:40px}${css}</style><main id="main"><span id="atom">${content}</span><span id="neighbor">y</span></main>`,
		"https://fixture.invalid/float-atomic-baselines",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(96, 96);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	const layout = layoutDocument(tree);
	const box = (selector: string) => {
		const found = layout.boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing box ${selector}`);
		return found;
	};
	const context = (selector: string) => {
		const found = layout.contexts.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing text context ${selector}`);
		return found;
	};
	const baselines = collectFlexBaselines(
		layout,
		layout.text.horizontal.formatting,
		() => {},
	);
	const baseline = (selector: string) => {
		const owner = box(selector);
		const found = baselines.get(owner.id);
		if (!found) throw new Error(`Missing baseline ${selector}`);
		return {
			first: found.first === null ? null : found.first - owner.borderY,
			last: found.last === null ? null : found.last - owner.borderY,
			unsupported: found.unsupported,
		};
	};
	const neighbor = context("#main").glyphs.find(
		(glyph) => glyph.character === "y",
	);
	if (!neighbor) throw new Error("Missing neighboring glyph");
	return { tree, id, layout, box, context, baseline, neighbor };
}

it.each(["left", "right"])(
	"uses the bottom edge instead of a %s float's text baseline",
	(side) => {
		const { box, context, baseline, neighbor } = fixture(
			'<span id="float">x</span>',
			`#float{float:${side}}`,
		);
		expect(baseline("#atom")).toEqual({
			first: null,
			last: null,
			unsupported: false,
		});
		expect(baseline("#float")).toMatchObject({ first: 7, last: 7 });
		expect(context("#atom").lines).toHaveLength(0);
		expect(box("#atom").borderBoxHeight).toBe(40);
		expect(box("#float")).toMatchObject({
			borderX: side === "left" ? 0 : 24,
			borderY: 0,
			borderBoxWidth: 12,
			borderBoxHeight: 40,
		});
		expect(neighbor.y).toBe(33);
	},
);

it("does not borrow the last baseline of a floated block's text descendants", () => {
	const { box, baseline, neighbor } = fixture(
		'<span id="float"><div id="descendant">x<br>z</div></span>',
	);
	expect(baseline("#descendant")).toMatchObject({ first: 7, last: 15 });
	expect(baseline("#float")).toMatchObject({ first: 7, last: 15 });
	expect(baseline("#atom")).toMatchObject({ first: null, last: null });
	expect(box("#descendant").borderBoxHeight).toBe(16);
	expect(box("#atom").borderBoxHeight).toBe(40);
	expect(neighbor.y).toBe(33);
});

it.each(["before", "after"])(
	"keeps the in-flow text baseline when text is %s the float",
	(order) => {
		const floating = '<span id="float">x</span>';
		const { box, context, baseline, neighbor } = fixture(
			order === "before" ? `a${floating}` : `${floating}a`,
		);
		expect(context("#atom").lines).toHaveLength(1);
		expect(context("#atom").glyphs.map((glyph) => glyph.character)).toEqual([
			"a",
		]);
		expect(baseline("#atom")).toMatchObject({ first: 7, last: 7 });
		expect(box("#atom").borderBoxHeight).toBe(40);
		expect(box("#float").borderBoxHeight).toBe(40);
		expect(neighbor.y).toBe(0);
	},
);

it.each(["before", "after"])(
	"keeps an in-flow block child's baseline %s a float anchor",
	(order) => {
		const floating = '<span id="float">x</span>';
		const flowing = '<div id="flow">a</div>';
		const { box, context, baseline, neighbor } = fixture(
			order === "before" ? flowing + floating : floating + flowing,
		);
		expect(baseline("#flow")).toMatchObject({ first: 7, last: 7 });
		expect(baseline("#atom")).toMatchObject({ first: 7, last: 7 });
		expect(box("#atom").borderBoxHeight).toBe(order === "before" ? 48 : 40);
		expect(box("#float").borderBoxHeight).toBe(40);
		if (order === "after") {
			expect(context("#flow").glyphs[0].x).toBe(12);
			expect(box("#flow").borderY).toBe(box("#float").borderY);
		}
		expect(neighbor.y).toBe(0);
	},
);

it("contains nested floats without propagating either float's baseline", () => {
	const { box, baseline, neighbor } = fixture(
		'<span id="float"><span id="nested">x</span></span>',
		"#float{width:24px;height:auto}#nested{float:right;width:12px;height:40px}",
	);
	expect(baseline("#nested")).toMatchObject({ first: 7, last: 7 });
	expect(baseline("#float")).toMatchObject({ first: null, last: null });
	expect(baseline("#atom")).toMatchObject({ first: null, last: null });
	for (const selector of ["#atom", "#float", "#nested"])
		expect(box(selector).borderBoxHeight).toBe(40);
	expect(box("#nested").borderX).toBe(12);
	expect(neighbor.y).toBe(33);
});

it("includes the inline-block bottom margin in a float-only fallback baseline", () => {
	const { box, context, baseline, neighbor } = fixture(
		'<span id="float">x</span>',
		"#atom{margin-bottom:6px}",
	);
	expect(baseline("#atom")).toMatchObject({ first: null, last: null });
	expect(box("#atom")).toMatchObject({
		borderY: 0,
		borderBoxHeight: 40,
		marginBottom: 6,
	});
	expect(context("#main").lines[0].baseline).toBe(46);
	expect(neighbor.y).toBe(39);
});

it("keeps corrected baseline geometry consistent with native raster and hit testing", () => {
	const { tree, id, layout, box, neighbor } = fixture(
		'<span id="float">x</span>',
		"#atom{width:24px;background:blue}#float{background:red}#neighbor{background:lime}",
	);
	expect(neighbor).toMatchObject({ x: 24, y: 33 });
	for (const selector of ["#atom", "#float"])
		expect(
			layout.boxes.filter((entry) => entry.id === box(selector).id),
		).toHaveLength(1);
	const raster = rasterizeDocument(tree);
	const pixel = (horizontal: number, vertical: number) => {
		const offset = (vertical * raster.image.width + horizontal) * 4;
		return [...raster.image.pixels.slice(offset, offset + 4)];
	};
	const hits = documentHitTesting(tree);
	expect(raster.metrics.paintedGlyphs).toBe(2);
	expect(pixel(1, 20)).toEqual([255, 0, 0, 255]);
	expect(hits.elementFromPoint(1, 20)).toBe(id("#float"));
	expect(pixel(18, 20)).toEqual([0, 0, 255, 255]);
	expect(hits.elementFromPoint(18, 20)).toBe(id("#atom"));
	expect(pixel(29, 34)).toEqual([0, 255, 0, 255]);
	expect(hits.elementFromPoint(29, 34)).toBe(id("#neighbor"));
	expect(pixel(29, 1)).toEqual([255, 255, 255, 255]);
	expect(hits.elementFromPoint(29, 1)).not.toBe(id("#neighbor"));
	for (const [row, bits] of bitmapGlyph("y").rows.entries())
		for (let column = 0; column < 5; column++)
			expect(pixel(24 + column, 33 + row)).toEqual(
				bits & (16 >> column) ? [0, 0, 0, 255] : [0, 255, 0, 255],
			);
});

it("preserves first and last in-flow block baselines without floats", () => {
	const { box, baseline, neighbor } = fixture(
		'<div id="first">a</div><div id="last">b</div>',
	);
	expect(baseline("#first")).toMatchObject({ first: 7, last: 7 });
	expect(baseline("#last")).toMatchObject({ first: 7, last: 7 });
	expect(baseline("#atom")).toMatchObject({ first: 7, last: 15 });
	expect(box("#atom").borderBoxHeight).toBe(16);
	expect(neighbor.y).toBe(8);
});

it("preserves an in-flow atomic child's last baseline without floats", () => {
	const { box, baseline, neighbor } = fixture(
		'<span id="inner">a<br>b</span>',
		"#inner{display:inline-block;width:12px}",
	);
	expect(baseline("#inner")).toMatchObject({ first: 7, last: 15 });
	expect(baseline("#atom")).toMatchObject({ first: 15, last: 15 });
	expect(box("#atom").borderBoxHeight).toBe(16);
	expect(box("#inner").borderBoxHeight).toBe(16);
	expect(neighbor.y).toBe(8);
});
