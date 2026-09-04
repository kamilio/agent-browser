import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentElementOffsets } from "./element-offsets.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(html: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}body{font-size:8px;line-height:10px}${css}</style>${html}`,
		"https://fixture.invalid/static-position",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 100);
	const query = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

it.each(["absolute", "fixed"])(
	"lays out a bare %s block at its source-order static position",
	(position) => {
		const { tree, rect } = fixture(
			'<main><div id="before"></div><div id="target">ABC</div><div id="after"></div></main>',
			`main{padding:5px}#before{height:20px}#after{height:10px}#target{position:${position};background:red}`,
		);
		expect(rect("#target")).toMatchObject({
			x: 5,
			y: 25,
			width: 18,
			height: 10,
		});
		expect(rect("#after")).toMatchObject({ x: 5, y: 25, height: 10 });
		expect(rect("main").height).toBe(40);
		expect(layoutDocument(tree).flowHeight).toBe(40);
	},
);

it("anchors multiple excluded siblings at the same source-order position", () => {
	const { rect } = fixture(
		'<div id="before"></div><div id="first">ABC</div><div id="second">DEF</div><div id="after"></div>',
		"#before{height:20px}#first,#second{position:absolute}#after{height:10px}",
	);
	expect(rect("#first")).toEqual(rect("#second"));
	expect(rect("#first").y).toBe(20);
	expect(rect("#after").y).toBe(20);
});

it("preserves inline static insertion and actual normal text exclusion", () => {
	const { tree, rect } = fixture(
		'<main>A<span id="target">XX</span>B</main>',
		"#target{position:absolute}",
	);
	expect(rect("#target")).toMatchObject({ x: 6, y: 0, width: 12, height: 10 });
	expect(rect("main").height).toBe(10);
	const layout = layoutDocument(tree);
	expect(
		layout.contexts
			.flatMap((context) => context.glyphs)
			.filter((glyph) => glyph.x === 6),
	).toHaveLength(2);
});

it("restores specified block display for static positions in mixed inline content", () => {
	const { rect } = fixture(
		'<main>A<div id="target">X</div>B</main>',
		"#target{position:absolute}",
	);
	expect(rect("#target")).toMatchObject({ x: 0, y: 10, width: 6, height: 10 });
	expect(rect("main").height).toBe(10);
});

it("uses actual wrapping and forced line breaks in hypothetical inline layout", () => {
	const { rect } = fixture(
		'<main>AB<br>C <span id="target">XY</span></main>',
		"main{width:18px}#target{position:absolute}",
	);
	expect(rect("#target")).toMatchObject({ x: 0, y: 20, width: 12, height: 10 });
	expect(rect("main").height).toBe(20);
});

it("resolves only the auto axis and exposes its used inset", () => {
	const { tree, id, rect } = fixture(
		'<main><div style="height:20px"></div><div id="target">X</div></main>',
		"main{position:relative;padding:5px}#target{position:absolute;left:30px}",
	);
	expect(rect("#target")).toMatchObject({ x: 30, y: 25 });
	expect(resolvedStyleValue(tree, id("#target"), "top")).toBe("25px");
	tree.setAttribute(id("#target"), "style", "left:auto;top:-10px");
	expect(rect("#target")).toMatchObject({ x: 5, y: -10 });
});

it("resolves nested bare ancestors against their actual layout roots", () => {
	const { rect } = fixture(
		'<main><div style="height:15px"></div><div id="outer"><div style="height:10px"></div><div id="inner">X</div></div></main>',
		"main{padding:5px}#outer{position:absolute;width:80px;padding:3px}#inner{position:absolute}",
	);
	expect(rect("#outer")).toMatchObject({ x: 5, y: 20, width: 86, height: 16 });
	expect(rect("#inner")).toMatchObject({ x: 8, y: 33, width: 6, height: 10 });
});

it("uses hypothetical flow margins without moving actual siblings", () => {
	const html =
		'<main><div id="before"></div><div id="target">X</div><div id="after"></div></main>';
	const css =
		"main{display:flow-root;padding:5px}#before{height:10px;margin-bottom:8px}#target{width:20px;margin:3px 0 4px 7px}#after{height:10px;margin-top:12px}";
	const positioned = fixture(html, `${css}#target{position:absolute}`);
	const hypothetical = fixture(html, css);
	expect(positioned.rect("#target").x).toBe(hypothetical.rect("#target").x);
	expect(positioned.rect("#target").y).toBe(hypothetical.rect("#target").y);
	expect(positioned.rect("#after").y).toBe(27);
});

it.each([
	["row", "flex-start", "flex-start", 0, 0],
	["row", "center", "center", 40, 25],
	["row", "flex-end", "flex-end", 80, 50],
	["row-reverse", "flex-start", "flex-start", 80, 0],
	["column", "center", "center", 40, 25],
	["column-reverse", "flex-start", "flex-start", 0, 50],
])(
	"uses the sole-item static position for flex %s %s %s",
	(direction, justify, align, expectedX, expectedY) => {
		const { rect } = fixture(
			'<main><div id="before"></div><div id="target"></div><div id="after"></div></main>',
			`main{display:flex;position:relative;width:100px;height:60px;flex-direction:${direction};justify-content:${justify};align-items:${align}}#target{position:absolute;width:20px;height:10px}#before,#after{width:10px;height:10px;flex:none}`,
		);
		expect(rect("#target")).toMatchObject({
			x: expectedX,
			y: expectedY,
			width: 20,
			height: 10,
		});
	},
);

it("uses flex alignment even when the containing block is not the flex parent", () => {
	const { rect } = fixture(
		'<main><section><div id="target">X</div></section></main>',
		"main{padding:10px}section{display:flex;width:100px;height:60px;justify-content:center;align-items:center}#target{position:absolute;width:20px;height:10px}",
	);
	expect(rect("#target")).toMatchObject({
		x: 50,
		y: 35,
		width: 20,
		height: 10,
	});
});

it("applies align-self and explicit insets independently in flex static positioning", () => {
	const { rect } = fixture(
		'<main><div id="target"></div></main>',
		"main{display:flex;position:relative;width:100px;height:60px;justify-content:center;align-items:center;padding:5px}#target{position:absolute;left:3px;align-self:flex-end;width:20px;height:10px;margin:auto}",
	);
	expect(rect("#target")).toMatchObject({ x: 3, y: 55, width: 20, height: 10 });
});

it("keeps bare fixed geometry, hit testing and offsets anchored after scrolling", () => {
	const { tree, id, rect } = fixture(
		'<main><div style="height:20px"></div><div id="target">ABC</div></main>',
		"main{height:300px;padding:5px}#target{position:fixed;background:red}",
	);
	const before = rect("#target");
	const offsets = documentElementOffsets(tree);
	expect(offsets.get(id("#target"))).toEqual({
		offsetParent: null,
		offsetLeft: 5,
		offsetTop: 25,
	});
	documentScroll(tree).to(0, 60);
	expect(rect("#target")).toEqual(before);
	expect(offsets.get(id("#target"))).toEqual({
		offsetParent: null,
		offsetLeft: 5,
		offsetTop: 25,
	});
	expect(documentHitTesting(tree).elementFromPoint(6, 26)).toBe(id("#target"));
	expect(
		rasterizeDocument(tree).image.pixels.slice(
			(34 * 200 + 22) * 4,
			(34 * 200 + 22) * 4 + 4,
		),
	).toEqual(new Uint8Array([255, 0, 0, 255]));
});

it("rejects block-in-inline hypothetical splits without inventing an anchor", () => {
	const { tree } = fixture(
		'<span>A<div style="position:fixed">X</div>B</span>',
	);
	expect(() => layoutDocument(tree)).toThrow("block-in-inline");
});

it("charges hypothetical work against the document budget", () => {
	const { tree } = fixture(
		'<main>A<span style="position:absolute">X</span></main>',
	);
	expect(() => layoutDocument(tree, { maxWork: 100 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => layoutDocument(tree)).not.toThrow();
});

it("anchors an empty inline-origin positioned box without requiring a text line", () => {
	const { rect } = fixture(
		'<main><span id="target"></span></main>',
		"main{padding:5px}#target{position:absolute;width:20px;height:10px}",
	);
	expect(rect("#target")).toMatchObject({ x: 5, y: 5, width: 20, height: 10 });
	expect(rect("main").height).toBe(10);
});

it("treats auto margins as zero in non-flex static positioning", () => {
	const { rect } = fixture(
		'<main><div id="target">X</div></main>',
		"main{padding:5px}#target{position:absolute;width:20px;height:10px;margin:auto}",
	);
	expect(rect("#target")).toMatchObject({ x: 5, y: 5, width: 20, height: 10 });
});

it("keeps unrelated anonymous flex text and order during hypothetical reflow", () => {
	const { rect } = fixture(
		'<section>AB<div style="order:-1">CD</div></section><main><div id="target">X</div></main>',
		"section{display:flex;width:30px}#target{position:absolute}",
	);
	expect(rect("#target")).toMatchObject({ x: 0, y: 10, width: 6, height: 10 });
});

it("uses positioned roots for inline-block content rather than reflowing its flex ancestor", () => {
	const { rect } = fixture(
		'<main><section><div style="height:8px"></div><span id="target">X</span></section></main>',
		"main{display:flex;justify-content:center;width:100px;height:50px;align-items:center}section{display:inline-block;width:30px;height:20px;padding:2px}#target{position:absolute}",
	);
	expect(rect("#target")).toMatchObject({ x: 35, y: 23, width: 6, height: 10 });
});

it("positions bare native controls and loaded replaced boxes from their hypothetical line", async () => {
	const { tree, rect } = fixture(
		'<main>A<img id="photo" src="/image.png"><input id="control" value="X"></main>',
		"#photo,#control{position:absolute}#control{width:20px;height:10px}",
	);
	const body = encodePng(createRaster(4, 2, [0, 0, 255, 255]));
	await documentImages(tree, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		}),
	}).settle();
	expect(rect("#photo")).toMatchObject({ x: 6, y: 0, width: 4, height: 2 });
	expect(rect("#control").x).toBe(6);
	expect(rect("#control").y).toBe(0);
	expect(rect("main").height).toBe(10);
});

it.each([
	["center", -10],
	["safe center", 0],
	["space-around", 0],
	["space-between", 0],
])(
	"applies flex overflow alignment %s without moving its normal-flow siblings",
	(justify, expectedX) => {
		const { rect } = fixture(
			'<main><div id="target"></div><div id="normal"></div></main>',
			`main{display:flex;position:relative;width:20px;height:20px;flex-direction:row-reverse;justify-content:${justify}}#target{position:absolute;width:40px;height:10px}#normal{width:5px;height:5px}`,
		);
		expect(rect("#target").x).toBe(expectedX);
		expect(rect("#normal").width).toBe(5);
	},
);

it("uses cross-axis wrap reversal and ignores auto margins during flex static alignment", () => {
	const { rect } = fixture(
		'<main><div id="target"></div></main>',
		"main{display:flex;position:relative;flex-wrap:wrap-reverse;width:100px;height:60px;justify-content:space-around}#target{position:absolute;width:20px;height:10px;margin:auto}",
	);
	expect(rect("#target")).toMatchObject({
		x: 40,
		y: 50,
		width: 20,
		height: 10,
	});
});

it("recomputes static anchors after content insertion and viewport-dependent wrapping", () => {
	const { tree, id, rect } = fixture(
		'<main><div id="before">AB CD</div><div id="target">X</div></main>',
		"main{width:100%}#target{position:absolute}",
	);
	expect(rect("#target").y).toBe(10);
	documentStyles(tree).setViewport(18, 100);
	expect(rect("#target").y).toBe(20);
	tree.setAttribute(id("#before"), "style", "height:40px");
	expect(rect("#target").y).toBe(40);
});

it("does not require unsupported baseline alignment on an explicitly positioned axis", () => {
	const { rect } = fixture(
		'<main><div id="target">X</div></main>',
		"main{display:flex;width:100px;height:40px;justify-content:center;align-items:baseline}#target{position:absolute;top:3px;width:20px;height:10px}",
	);
	expect(rect("#target")).toMatchObject({ x: 40, y: 3, width: 20, height: 10 });
});

it("rejects an auto cross-axis baseline alignment that has not been implemented", () => {
	const { tree } = fixture(
		'<main><div style="position:absolute">X</div></main>',
		"main{display:flex;width:100px;height:40px;align-items:baseline}",
	);
	expect(() => layoutDocument(tree)).toThrow("static flex alignment");
});
