import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queries: DocumentQueries[] = [];

afterEach(() => {
	for (const query of queries.splice(0)) query.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content: string, css: string, width = 36) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:${width}px}.atom{display:inline-block}${css}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/float-atomic-document",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(96, 96);
	const query = new DocumentQueries(tree);
	queries.push(query);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const box = (selector: string, layout = layoutDocument(tree)) => {
		const found = layout.boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing box ${selector}`);
		return found;
	};
	const context = (
		selector = "#main",
		layout: DocumentLayout = layoutDocument(tree),
	) => {
		const found = layout.contexts.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing context ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		box,
		context,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

function pixel(tree: DocumentTree, horizontal: number, vertical: number) {
	const image = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 96, height: 96 },
	}).image;
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it.each(["left", "right"])(
	"places, paints and hits an inline-block beside a %s float",
	(side) => {
		const { tree, id, rect, context } = fixture(
			'<span id="float"></span><span id="atom" class="atom">AA</span>BB',
			`#float{float:${side};width:12px;height:16px;background:blue}#atom{width:12px;background:red}`,
		);
		const atomLeft = side === "left" ? 12 : 0;
		const floatLeft = side === "left" ? 0 : 24;
		expect(rect("#float")).toMatchObject({
			x: floatLeft,
			y: 0,
			width: 12,
			height: 16,
		});
		expect(rect("#atom")).toMatchObject({
			x: atomLeft,
			y: 0,
			width: 12,
			height: 8,
		});
		expect(context().lines[0]).toMatchObject({
			top: 0,
			baseline: 7,
			height: 8,
		});
		expect(
			context().glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
		).toEqual([
			["B", atomLeft + 12, 0],
			["B", atomLeft + 18, 0],
		]);
		expect(pixel(tree, atomLeft + 1, 7)).toEqual([255, 0, 0, 255]);
		expect(pixel(tree, floatLeft + 1, 1)).toEqual([0, 0, 255, 255]);
		expect(documentHitTesting(tree).elementFromPoint(atomLeft + 1, 7)).toBe(
			id("#atom"),
		);
		expect(documentHitTesting(tree).elementFromPoint(floatLeft + 1, 1)).toBe(
			id("#float"),
		);
	},
);

it.each(["left", "right"])(
	"wraps whole atomic siblings beside a %s float and restores full width",
	(side) => {
		const { tree, id, rect, context } = fixture(
			'<span id="float"></span><span id="first" class="atom">AA</span><span id="second" class="atom">BB</span><span id="third" class="atom">CC</span>',
			`#float{float:${side};width:12px;height:16px}.atom{width:12px}`,
			24,
		);
		const left = side === "left" ? 12 : 0;
		expect(rect("#first")).toMatchObject({
			x: left,
			y: 0,
			width: 12,
			height: 8,
		});
		expect(rect("#second")).toMatchObject({
			x: left,
			y: 8,
			width: 12,
			height: 8,
		});
		expect(rect("#third")).toMatchObject({ x: 0, y: 16, width: 12, height: 8 });
		expect(context().lines.map((line) => line.top)).toEqual([0, 8, 16]);
		expect(rect("#main").height).toBe(24);
		const layout = layoutDocument(tree);
		for (const selector of ["#first", "#second", "#third"])
			expect(
				layout.boxes.filter((box) => box.ref === tree.reference(id(selector))),
			).toHaveLength(1);
	},
);

it.each(["left", "right"])(
	"moves an indivisible atom below an obstructing %s float",
	(side) => {
		const { rect, context } = fixture(
			'<span id="float"></span><span id="atom" class="atom">AAA</span>',
			`#float{float:${side};width:12px;height:16px}#atom{width:18px}`,
			24,
		);
		expect(rect("#atom")).toMatchObject({ x: 0, y: 16, width: 18, height: 8 });
		expect(context().lines.map((line) => line.top)).toEqual([16]);
		expect(rect("#main").height).toBe(24);
	},
);

it("uses the interval between opposing floats for an atomic box", () => {
	const { rect } = fixture(
		'<span id="left"></span><span id="right"></span><span id="atom" class="atom">AA</span>',
		"#left{float:left;width:8px;height:16px}#right{float:right;width:8px;height:16px}#atom{width:12px}",
	);
	expect(rect("#left")).toMatchObject({ x: 0, y: 0, width: 8 });
	expect(rect("#right")).toMatchObject({ x: 28, y: 0, width: 8 });
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
});

it.each([
	{ floatWidth: 12, floatTop: 0, atomLeft: 12 },
	{ floatWidth: 30, floatTop: 8, atomLeft: 0 },
])(
	"accounts for atomic content before a source float of width $floatWidth",
	({ floatWidth, floatTop, atomLeft }) => {
		const { rect, context } = fixture(
			'<span id="atom" class="atom">AA</span><span id="float"></span>',
			`#atom{width:12px}#float{float:left;width:${floatWidth}px;height:16px}`,
		);
		expect(rect("#atom")).toMatchObject({
			x: atomLeft,
			y: 0,
			width: 12,
			height: 8,
		});
		expect(rect("#float")).toMatchObject({
			x: 0,
			y: floatTop,
			width: floatWidth,
			height: 16,
		});
		expect(context().lines.map((line) => line.top)).toEqual([0]);
		expect(rect("#main").height).toBe(8);
	},
);

it.each([
	{ width: 60, used: 30, height: 8 },
	{ width: 20, used: 20, height: 16 },
	{ width: 8, used: 12, height: 16 },
])(
	"shrink-to-fits an auto-width atom inside a $width px float",
	({ width, used, height }) => {
		const { rect, box } = fixture(
			'<div id="float"><span id="atom" class="atom">AA BB</span></div>',
			`#float{float:left;width:${width}px}#atom{margin:auto}`,
			80,
		);
		expect(rect("#float")).toMatchObject({ x: 0, y: 0, width, height });
		expect(rect("#atom")).toMatchObject({ x: 0, y: 0, width: used, height });
		expect(box("#atom")).toMatchObject({
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
		});
		expect(rect("#main").height).toBe(0);
	},
);

it("aligns surrounding text to the last atomic line beside a float", () => {
	const { rect, context } = fixture(
		'<span id="float"></span>A<span id="atom" class="atom">AA<br>BB</span>Z',
		"#float{float:left;width:8px;height:24px}#atom{width:12px}",
	);
	expect(rect("#atom")).toMatchObject({ x: 14, y: 0, width: 12, height: 16 });
	expect(context().lines[0]).toMatchObject({ baseline: 15, height: 16 });
	expect(
		context().glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
	).toEqual([
		["A", 8, 8],
		["Z", 26, 8],
	]);
	expect(context("#atom").lines.map((line) => line.baseline)).toEqual([7, 15]);
});

it("synthesizes the empty atomic baseline at its bottom margin edge", () => {
	const { rect, context } = fixture(
		'<span id="float"></span><span id="atom" class="atom"></span>A',
		"#float{float:left;width:8px;height:24px}#atom{width:12px;height:8px;margin-top:2px;margin-bottom:3px}",
	);
	expect(rect("#atom")).toMatchObject({ x: 8, y: 2, width: 12, height: 8 });
	expect(context().lines[0]).toMatchObject({ baseline: 13, height: 14 });
	expect(context().glyphs[0]).toMatchObject({ character: "A", x: 20, y: 6 });
});

it("keeps the last in-flow block baseline despite a trailing empty block", () => {
	const { rect, context } = fixture(
		'<span id="float"></span><span id="atom" class="atom"><div>AA</div><div id="empty"></div></span>Z',
		"#float{float:left;width:8px;height:40px}#atom{width:12px}#empty{height:16px}",
	);
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 12, height: 24 });
	expect(context().lines[0]).toMatchObject({ baseline: 7, height: 24 });
	expect(context().glyphs[0]).toMatchObject({ character: "Z", x: 20, y: 0 });
	expect(rect("#main").height).toBe(24);
});

it("places atomic margins, padding and border outside the content and paints their proper edges", () => {
	const { tree, id, rect, box } = fixture(
		'<span id="float"></span><span id="atom" class="atom">AA</span>',
		"#float{float:left;width:8px;height:24px}#atom{width:12px;padding:2px;border:1px solid blue;margin-left:3px;margin-right:4px;background:red}",
		40,
	);
	expect(rect("#atom")).toMatchObject({ x: 11, y: 0, width: 18, height: 14 });
	expect(box("#atom")).toMatchObject({
		contentX: 14,
		contentY: 3,
		contentWidth: 12,
		contentHeight: 8,
		marginLeft: 3,
		marginRight: 4,
	});
	expect(pixel(tree, 11, 2)).toEqual([0, 0, 255, 255]);
	expect(pixel(tree, 12, 2)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(tree).elementFromPoint(12, 2)).toBe(id("#atom"));
	expect(documentHitTesting(tree).elementFromPoint(9, 2)).not.toBe(id("#atom"));
});

it("resolves atomic percentage width against the containing block, not the float interval", () => {
	const { rect } = fixture(
		'<span id="float"></span><span id="atom" class="atom">AA</span>',
		"#float{float:left;width:8px;height:16px}#atom{width:50%}",
		40,
	);
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 20, height: 8 });
});

it("excludes a float's full margin, padding and border box from atomic placement", () => {
	const { rect } = fixture(
		'<span id="float"></span><span id="atom" class="atom">AA</span>',
		"#float{float:left;width:8px;height:8px;padding:1px;border:1px solid blue;margin:1px 3px 2px 2px}#atom{width:12px}",
	);
	expect(rect("#float")).toMatchObject({ x: 2, y: 1, width: 12, height: 12 });
	expect(rect("#atom")).toMatchObject({ x: 17, y: 0, width: 12, height: 8 });
});

it.each(["left", "right"])(
	"contains an internal %s float and wraps its own atomic text",
	(side) => {
		const { rect, context } = fixture(
			'<span id="outer"></span><span id="atom" class="atom"><span id="inner"></span>AA BB CC</span>',
			`#outer{float:left;width:8px;height:40px}#atom{width:24px}#inner{float:${side};width:8px;height:16px}`,
		);
		expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 24, height: 24 });
		expect(rect("#inner")).toMatchObject({
			x: side === "left" ? 8 : 24,
			y: 0,
			width: 8,
			height: 16,
		});
		expect(context("#atom").lines.map((line) => line.top)).toEqual([0, 8, 16]);
		expect(
			context("#atom")
				.glyphs.filter((glyph) => glyph.character !== " ")
				.map((glyph) => [glyph.x, glyph.y]),
		).toEqual(
			side === "left"
				? [
						[16, 0],
						[22, 0],
						[16, 8],
						[22, 8],
						[8, 16],
						[14, 16],
					]
				: [
						[8, 0],
						[14, 0],
						[8, 8],
						[14, 8],
						[8, 16],
						[14, 16],
					],
		);
		expect(context().lines[0]).toMatchObject({ baseline: 23, height: 24 });
	},
);

it("coordinates an inline-block containing a float and another atom inside a definite-width float", () => {
	const { tree, id, rect } = fixture(
		'<div id="outer"><span id="atom" class="atom"><span id="inner"></span><span id="nested" class="atom">AA</span></span></div>',
		"#outer{float:left;width:32px}#atom{width:24px}#inner{float:right;width:8px;height:16px;background:blue}#nested{width:12px;background:red}",
		48,
	);
	expect(rect("#outer")).toMatchObject({ x: 0, y: 0, width: 32, height: 16 });
	expect(rect("#atom")).toMatchObject({ x: 0, y: 0, width: 24, height: 16 });
	expect(rect("#inner")).toMatchObject({ x: 16, y: 0, width: 8, height: 16 });
	expect(rect("#nested")).toMatchObject({ x: 0, y: 0, width: 12, height: 8 });
	expect(pixel(tree, 17, 1)).toEqual([0, 0, 255, 255]);
	expect(pixel(tree, 1, 7)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(tree).elementFromPoint(17, 1)).toBe(id("#inner"));
	expect(documentHitTesting(tree).elementFromPoint(1, 7)).toBe(id("#nested"));
});

it("does not leak a fixed-height atom's overflowing float into ancestor autoheight", () => {
	const { tree, id, rect } = fixture(
		'<span id="outer"></span><span id="atom" class="atom"><span id="inner"></span></span><span id="sibling" class="atom">AA</span>',
		"#outer{float:left;width:8px;height:8px}#atom{width:24px;height:8px}#inner{float:left;width:8px;height:32px;background:blue}#sibling{width:12px}",
		48,
	);
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 24, height: 8 });
	expect(rect("#inner")).toMatchObject({ x: 8, y: 0, width: 8, height: 32 });
	expect(rect("#sibling")).toMatchObject({ x: 32, y: 1, width: 12, height: 8 });
	expect(rect("#main").height).toBe(9);
	expect(pixel(tree, 9, 20)).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(tree).elementFromPoint(9, 20)).toBe(id("#inner"));
});

it("keeps floats in sibling inline-blocks in separate independent scopes", () => {
	const { rect, context } = fixture(
		'<span id="first" class="atom"><span id="left"></span>AA<br>BB</span><span id="second" class="atom"><span id="right"></span>CC<br>DD</span>',
		".atom{width:24px}#left{float:left;width:8px;height:16px}#right{float:right;width:8px;height:8px}",
		48,
	);
	expect(rect("#first")).toMatchObject({ x: 0, y: 0, width: 24, height: 16 });
	expect(rect("#second")).toMatchObject({ x: 24, y: 0, width: 24, height: 16 });
	expect(rect("#left")).toMatchObject({ x: 0, y: 0, width: 8, height: 16 });
	expect(rect("#right")).toMatchObject({ x: 40, y: 0, width: 8, height: 8 });
	expect(context("#first").glyphs.map((glyph) => glyph.x)).toEqual([
		8, 14, 8, 14,
	]);
	expect(context("#second").glyphs.map((glyph) => glyph.x)).toEqual([
		24, 30, 24, 30,
	]);
});

it("clears an internal floating box without clearing an ancestor's float", () => {
	const { rect } = fixture(
		'<span id="outer"></span><span id="atom" class="atom"><span id="first"></span><span id="cleared"></span></span>',
		"#outer{float:left;width:8px;height:40px}#atom{width:24px}#first{float:left;width:8px;height:8px}#cleared{float:left;clear:both;width:8px;height:4px}",
	);
	expect(rect("#atom")).toMatchObject({ x: 8, y: 0, width: 24, height: 12 });
	expect(rect("#first")).toMatchObject({ x: 8, y: 0, width: 8, height: 8 });
	expect(rect("#cleared")).toMatchObject({ x: 8, y: 8, width: 8, height: 4 });
});
