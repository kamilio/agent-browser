import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { documentElementScroll } from "./element-scroll.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { paintRasterRect, type RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(css = "", content = '<div id="content"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}body{width:240px}#host{width:200px;height:200px;padding:20px}#scroller{width:40px;height:30px;overflow:hidden;background:blue}#content{width:80px;height:60px;background:red}#tail{height:400px}${css}</style><main id="host"><div id="scroller">${content}</div></main><div id="tail"></div>`,
		"https://fixture.invalid/overflow-paint",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(120, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	return {
		tree,
		id,
		geometry,
		hits: documentHitTesting(tree),
		scroll: documentElementScroll(tree),
		rect: (selector: string) => geometry.getBoundingClientRect(id(selector)),
	};
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

const red = [255, 0, 0, 255] as const;
const blue = [0, 0, 255, 255] as const;
const lime = [0, 255, 0, 255] as const;
const white = [255, 255, 255, 255] as const;

it.each(["hidden", "auto", "scroll", "clip"])(
	"clips overflowing pixels and hit regions for overflow:%s without shrinking geometry",
	(overflow) => {
		const { tree, id, hits, rect } = fixture(`#scroller{overflow:${overflow}}`);
		expect(rect("#scroller")).toMatchObject({
			x: 20,
			y: 20,
			width: 40,
			height: 30,
		});
		expect(rect("#content")).toMatchObject({
			x: 20,
			y: 20,
			width: 80,
			height: 60,
		});
		const capture = rasterizeDocument(tree);
		expect(pixel(capture.image, 30, 30)).toEqual(red);
		expect(pixel(capture.image, 70, 30)).toEqual(white);
		expect(pixel(capture.image, 30, 60)).toEqual(white);
		expect(hits.elementFromPoint(30, 30)).toBe(id("#content"));
		expect(hits.elementFromPoint(70, 30)).toBe(id("#host"));
		expect(hits.elementsFromPoint(30, 60)).not.toContain(id("#content"));
	},
);

it("keeps rounded borders painted and hittable while clipping content to the padding edge", () => {
	const { tree, id, hits, rect } = fixture(
		"#scroller{padding:4px;border:3px solid blue;border-radius:12px;background:yellow}#content{position:relative;left:-4px;top:-4px}",
	);
	expect(rect("#scroller")).toMatchObject({
		x: 20,
		y: 20,
		width: 54,
		height: 44,
	});
	const capture = rasterizeDocument(tree);
	for (const [column, row] of [
		[21, 40],
		[72, 40],
		[24, 24],
	]) {
		expect(pixel(capture.image, column, row)).toEqual(blue);
		expect(hits.elementFromPoint(column, row)).toBe(id("#scroller"));
	}
	expect(pixel(capture.image, 30, 30)).toEqual(red);
	expect(hits.elementFromPoint(30, 30)).toBe(id("#content"));
	expect(pixel(capture.image, 75, 40)).toEqual(white);
	expect(hits.elementFromPoint(75, 40)).toBe(id("#host"));
});

it("intersects nested overflow chains rather than using only the nearest clip", () => {
	const { tree, id, hits } = fixture(
		"#scroller{width:60px;height:50px}#inner{position:relative;left:20px;top:15px;width:50px;height:40px;overflow:hidden}",
		'<div id="inner"><div id="content"></div></div>',
	);
	const capture = rasterizeDocument(tree);
	expect(pixel(capture.image, 45, 40)).toEqual(red);
	expect(hits.elementFromPoint(45, 40)).toBe(id("#content"));
	expect(pixel(capture.image, 30, 40)).toEqual(blue);
	expect(hits.elementFromPoint(30, 40)).toBe(id("#scroller"));
	for (const [column, row] of [
		[85, 40],
		[45, 72],
	]) {
		expect(pixel(capture.image, column, row)).toEqual(white);
		expect(hits.elementFromPoint(column, row)).toBe(id("#host"));
	}
});

it.each([
	["clip", "visible", white, red],
	["visible", "clip", red, white],
] as const)(
	"honors independent overflow-x:%s and overflow-y:%s clipping",
	(horizontal, vertical, horizontalColor, verticalColor) => {
		const { tree, id, hits } = fixture(
			`#scroller{overflow-x:${horizontal};overflow-y:${vertical}}`,
		);
		const capture = rasterizeDocument(tree);
		expect(pixel(capture.image, 70, 30)).toEqual(horizontalColor);
		expect(pixel(capture.image, 30, 70)).toEqual(verticalColor);
		expect(hits.elementFromPoint(70, 30)).toBe(
			id(horizontal === "visible" ? "#content" : "#host"),
		);
		expect(hits.elementFromPoint(30, 70)).toBe(
			id(vertical === "visible" ? "#content" : "#host"),
		);
	},
);

it("moves scrolled content under a stationary clip and refreshes prepared raster and hit state", () => {
	const { tree, id, hits, scroll, rect } = fixture(
		"#scroller{overflow:auto}#content{height:90px;background:transparent}#first,#second,#third{height:30px}#first{background:red}#second{background:lime}#third{background:blue}",
		'<div id="content"><div id="first"></div><div id="second"></div><div id="third"></div></div>',
	);
	const scroller = id("#scroller");
	expect(scroll.get(scroller)).toMatchObject({
		scrollLeft: 0,
		scrollTop: 0,
		scrollWidth: 80,
		scrollHeight: 90,
	});
	expect(hits.elementFromPoint(25, 25)).toBe(id("#first"));
	const prepared = prepareDocumentRaster(tree);
	scroll.to(scroller, 0, 30);
	expect(scroll.get(scroller).scrollTop).toBe(30);
	expect(() => prepared.rasterize()).toThrow("stale");
	expect(rect("#scroller")).toMatchObject({ x: 20, y: 20 });
	expect(rect("#second")).toMatchObject({ x: 20, y: 20 });
	expect(pixel(rasterizeDocument(tree).image, 25, 25)).toEqual(lime);
	expect(hits.elementFromPoint(25, 25)).toBe(id("#second"));
	scroll.to(scroller, 40, 60);
	expect(scroll.get(scroller)).toMatchObject({ scrollLeft: 40, scrollTop: 60 });
	expect(rect("#third")).toMatchObject({ x: -20, y: 20 });
	expect(pixel(rasterizeDocument(tree).image, 25, 25)).toEqual(blue);
	expect(hits.elementFromPoint(25, 25)).toBe(id("#third"));
	scroll.by(scroller, -40, -30);
	expect(scroll.get(scroller)).toMatchObject({ scrollLeft: 0, scrollTop: 30 });
	documentScroll(tree).to(0, 10);
	expect(documentScroll(tree).get()).toEqual({ x: 0, y: 10 });
	expect(rect("#second")).toMatchObject({ x: 20, y: 10 });
	expect(pixel(rasterizeDocument(tree).image, 25, 15)).toEqual(lime);
	expect(hits.elementFromPoint(25, 15)).toBe(id("#second"));
	expect(hits.elementFromPoint(25, 45)).toBe(id("#host"));
});

it("clips absolute descendants whose containing block is the overflow owner", () => {
	const { tree, id, hits, rect } = fixture(
		"#scroller{position:relative}#content{position:absolute;left:30px;top:10px;width:30px;height:20px}",
	);
	expect(rect("#content")).toMatchObject({ x: 50, y: 30 });
	const capture = rasterizeDocument(tree);
	expect(pixel(capture.image, 55, 35)).toEqual(red);
	expect(hits.elementFromPoint(55, 35)).toBe(id("#content"));
	expect(pixel(capture.image, 65, 35)).toEqual(white);
	expect(hits.elementFromPoint(65, 35)).toBe(id("#host"));
});

it("does not clip an absolute descendant through an intervening non-containing overflow box", () => {
	const { tree, id, hits, rect } = fixture(
		"#host{position:relative}#content{position:absolute;left:70px;top:30px;width:30px;height:20px}",
	);
	expect(rect("#content")).toMatchObject({ x: 70, y: 30 });
	expect(pixel(rasterizeDocument(tree).image, 75, 35)).toEqual(red);
	expect(hits.elementFromPoint(75, 35)).toBe(id("#content"));
});

it("lets viewport-fixed descendants escape ordinary overflow ancestors across root scrolling", () => {
	const { tree, id, hits, rect } = fixture(
		"#content{position:fixed;left:80px;top:15px;width:20px;height:20px}",
	);
	for (const vertical of [0, 80]) {
		documentScroll(tree).to(0, vertical);
		expect(documentScroll(tree).get().y).toBe(vertical);
		expect(rect("#content")).toMatchObject({ x: 80, y: 15 });
		expect(pixel(rasterizeDocument(tree).image, 85, 20)).toEqual(red);
		expect(hits.elementFromPoint(85, 20)).toBe(id("#content"));
	}
});

it("tests a fixed overflow owner's descendants in the same viewport frame as their clip", () => {
	const { tree, id, hits, rect } = fixture(
		"#scroller{position:fixed;left:20px;top:20px}",
	);
	documentScroll(tree).to(0, 80);
	expect(documentScroll(tree).get().y).toBe(80);
	expect(rect("#scroller")).toMatchObject({ x: 20, y: 20 });
	const capture = rasterizeDocument(tree);
	expect(pixel(capture.image, 30, 30)).toEqual(red);
	expect(hits.elementFromPoint(30, 30)).toBe(id("#content"));
	expect(pixel(capture.image, 70, 30)).toEqual(white);
	expect(hits.elementsFromPoint(70, 30)).not.toContain(id("#content"));
});

it.each([
	[10, 10],
	[25, 25],
	[-10, -10],
])(
	"translates overflow chains to capture-local coordinates at %s,%s",
	(horizontal, vertical) => {
		const { tree } = fixture();
		const capture = rasterizeDocument(tree, {
			clip: { x: horizontal, y: vertical, width: 100, height: 80 },
		});
		expect(capture.clip).toEqual({
			x: horizontal,
			y: vertical,
			width: 100,
			height: 80,
		});
		expect(pixel(capture.image, 30 - horizontal, 30 - vertical)).toEqual(red);
		expect(pixel(capture.image, 70 - horizontal, 30 - vertical)).toEqual(white);
	},
);

it("clips an element-target capture without replacing its full geometry by the visible intersection", () => {
	const { tree, id } = fixture();
	const capture = rasterizeDocument(tree, {
		element: tree.reference(id("#content")),
	});
	expect(capture.clip).toEqual({ x: 20, y: 20, width: 80, height: 60 });
	expect(pixel(capture.image, 5, 5)).toEqual(red);
	expect(pixel(capture.image, 45, 5)).toEqual(white);
	expect(pixel(capture.image, 5, 35)).toEqual(white);
});

it("refreshes clipping after mutations and restores visible-overflow paint without stale views", () => {
	const { tree, id, hits } = fixture();
	const initial = rasterizeDocument(tree);
	expect(pixel(initial.image, 70, 30)).toEqual(white);
	expect(hits.elementFromPoint(70, 30)).toBe(id("#host"));
	tree.setAttribute(id("#scroller"), "style", "overflow:visible");
	const visible = rasterizeDocument(tree);
	expect(pixel(visible.image, 70, 30)).toEqual(red);
	expect(pixel(visible.image, 30, 70)).toEqual(red);
	expect(hits.elementFromPoint(70, 30)).toBe(id("#content"));
	tree.setAttribute(id("#scroller"), "style", "overflow:hidden");
	expect(rasterizeDocument(tree).image.pixels).toEqual(initial.image.pixels);
	expect(hits.elementFromPoint(70, 30)).toBe(id("#host"));
});

it("returns the original canvas rather than the last clipped destination view", () => {
	const { tree, id } = fixture();
	tree.setAttribute(id("#tail"), "style", "display:none");
	const capture = rasterizeDocument(tree);
	expect(pixel(capture.image, 0, 0)).toEqual(white);
	paintRasterRect(capture.image, 0, 0, 1, 1, lime);
	expect(pixel(capture.image, 0, 0)).toEqual(lime);
});

it("clips replaced-image background painting without allocating an image resource", () => {
	const { tree, id, hits } = fixture(
		"#content{display:block}",
		'<img id="content" width="80" height="60">',
	);
	const capture = rasterizeDocument(tree);
	expect(pixel(capture.image, 30, 30)).toEqual(red);
	expect(hits.elementFromPoint(30, 30)).toBe(id("#content"));
	expect(pixel(capture.image, 70, 30)).toEqual(white);
	expect(hits.elementFromPoint(70, 30)).toBe(id("#host"));
});

it("clips SVG shape pixels and shape hit regions through the same ancestor chain", () => {
	const { tree, id, hits } = fixture(
		"svg{display:block}",
		'<svg width="80" height="60"><rect id="shape" width="80" height="60" fill="red"/></svg>',
	);
	const capture = rasterizeDocument(tree);
	expect(pixel(capture.image, 30, 30)).toEqual(red);
	expect(hits.elementFromPoint(30, 30)).toBe(id("#shape"));
	expect(pixel(capture.image, 70, 30)).toEqual(white);
	expect(hits.elementFromPoint(70, 30)).toBe(id("#host"));
});

it("clips editable selection and caret pixels along with their glyphs without changing source selection", () => {
	const { tree, id } = fixture(
		"#scroller{width:12px;height:10px}#content{color:red;background:white;outline:none;white-space:pre}",
		'<div id="content" contenteditable>ABCDE</div>',
	);
	documentInteractions(tree).focus.focusElement(id("#content"), {
		preventScroll: true,
	});
	const text = tree.get(id("#content")).children[0];
	const before = rasterizeDocument(tree);
	const selection = domRangeOwner(tree).selection;
	selection.setBaseAndExtent(text, 0, text, 5);
	const selected = rasterizeDocument(tree);
	expect(selected.image.pixels).not.toEqual(before.image.pixels);
	expect(selection.toString()).toBe("ABCDE");
	for (const [column, row] of [
		[32, 22],
		[40, 22],
		[25, 31],
	])
		expect(pixel(selected.image, column, row)).toEqual(white);
	selection.collapse(text, 2);
	const caret = rasterizeDocument(tree);
	expect(caret.image.pixels).toEqual(before.image.pixels);
	expect(pixel(caret.image, 32, 22)).toEqual(white);
	expect(tree.get(text).data).toBe("ABCDE");
});
