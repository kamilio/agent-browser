import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import {
	DocumentElementScroll,
	documentElementScroll,
} from "./element-scroll.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const green = [0, 255, 0, 255];
const white = [255, 255, 255, 255];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	css = "",
	content = `<div id="port"><div id="child"></div></div>`,
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}body{display:flow-root;background:white}#port{width:80px;height:60px;overflow:hidden;background:lime}#child{width:160px;height:140px;background:red}${css}</style>${content}`,
		"https://fixture.invalid/overflow-layout",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(240, 180);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	const owner = documentElementScroll(tree);
	return {
		tree,
		id,
		geometry,
		owner,
		root: documentScroll(tree),
		hits: documentHitTesting(tree),
		rect: (selector = "#child") => geometry.getBoundingClientRect(id(selector)),
		read: (selector = "#port") => owner.get(id(selector)),
		move: (selector: string, left: number, top: number) => {
			owner.to(id(selector), left, top);
			expect(owner.get(id(selector))).toMatchObject({
				scrollLeft: left,
				scrollTop: top,
			});
		},
	};
}

function pixel(image: RasterImage, horizontal: number, vertical: number) {
	const offset = (vertical * image.width + horizontal) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it.each(["hidden", "auto", "scroll", "clip"])(
	"clips overflow:%s paint and hits at the padding edge without clipping CSSOM rectangles",
	(overflow) => {
		const { tree, id, geometry, hits, rect } = fixture(
			`#port{overflow:${overflow};margin:20px;padding:10px;border:4px solid blue}`,
		);
		expect(rect("#port")).toMatchObject({
			x: 20,
			y: 20,
			width: 108,
			height: 88,
		});
		expect(rect()).toMatchObject({
			x: 34,
			y: 34,
			width: 160,
			height: 140,
		});
		expect(geometry.getClientRects(id("#child"))).toMatchObject([
			{ x: 34, y: 34, width: 160, height: 140 },
		]);
		const image = rasterizeDocument(tree).image;
		for (const [horizontal, vertical] of [
			[40, 40],
			[120, 100],
		]) {
			expect(pixel(image, horizontal, vertical)).toEqual(red);
			expect(hits.elementFromPoint(horizontal, vertical)).toBe(id("#child"));
		}
		for (const [horizontal, vertical] of [
			[126, 40],
			[40, 106],
		]) {
			expect(pixel(image, horizontal, vertical)).toEqual(blue);
			expect(hits.elementFromPoint(horizontal, vertical)).toBe(id("#port"));
		}
		for (const [horizontal, vertical] of [
			[132, 40],
			[40, 112],
		]) {
			expect(pixel(image, horizontal, vertical)).toEqual(white);
			expect(hits.elementsFromPoint(horizontal, vertical)).not.toContain(
				id("#child"),
			);
		}
	},
);

it.each(["hidden", "auto", "scroll"])(
	"programmatically scrolls overflow:%s content while its border and background stay fixed",
	(overflow) => {
		const { tree, id, owner, root, hits, rect, read } = fixture(
			`#port{overflow:${overflow};margin:20px;padding:10px;border:4px solid blue}`,
		);
		const border = rect("#port");
		const dimensions = read();
		expect(pixel(rasterizeDocument(tree).image, 25, 40)).toEqual(green);
		expect(owner.to(id("#port"), 20, 30)).toBe(true);
		expect(read()).toMatchObject({ scrollLeft: 20, scrollTop: 30 });
		expect(rect()).toMatchObject({ x: 14, y: 4, width: 160, height: 140 });
		expect(rect("#port")).toEqual(border);
		expect(read()).toMatchObject({
			scrollWidth: dimensions.scrollWidth,
			scrollHeight: dimensions.scrollHeight,
		});
		const image = rasterizeDocument(tree).image;
		expect(pixel(image, 22, 40)).toEqual(blue);
		expect(pixel(image, 25, 40)).toEqual(red);
		expect(hits.elementFromPoint(25, 40)).toBe(id("#child"));
		expect(owner.by(id("#port"), 5, -10)).toBe(true);
		expect(read()).toMatchObject({ scrollLeft: 25, scrollTop: 20 });
		expect(rect()).toMatchObject({ x: 9, y: 14 });
		expect(owner.to(id("#port"), 25, 20)).toBe(false);
		expect(root.get()).toEqual({ x: 0, y: 0 });
	},
);

it("does not permit programmatic scrolling of clip-only overflow", () => {
	const { tree, id, owner, read, rect } = fixture("#port{overflow:clip}");
	expect(owner.bounds(id("#port"))).toEqual({ x: 0, y: 0 });
	expect(owner.to(id("#port"), 20, 30)).toBe(false);
	expect(owner.by(id("#port"), 10, 15)).toBe(false);
	expect(read()).toMatchObject({ scrollLeft: 0, scrollTop: 0 });
	expect(rect()).toMatchObject({ x: 0, y: 0, width: 160, height: 140 });
	const image = rasterizeDocument(tree).image;
	expect(pixel(image, 79, 20)).toEqual(red);
	expect(pixel(image, 85, 20)).toEqual(white);
});

it("retains visible descendant paint without making a visible-overflow box scrollable", () => {
	const { tree, id, owner, read, hits, rect } = fixture(
		"#port{overflow:visible}",
	);
	expect(read()).toEqual({
		scrollLeft: 0,
		scrollTop: 0,
		scrollWidth: 160,
		scrollHeight: 140,
	});
	expect(owner.bounds(id("#port"))).toEqual({ x: 0, y: 0 });
	expect(owner.to(id("#port"), 20, 30)).toBe(false);
	expect(rect()).toMatchObject({ x: 0, y: 0 });
	expect(pixel(rasterizeDocument(tree).image, 120, 100)).toEqual(red);
	expect(hits.elementFromPoint(120, 100)).toBe(id("#child"));
});

it.each(["auto", "scroll"])(
	"scrolls only the overflowing axis of overflow:%s",
	(overflow) => {
		const { id, owner, read, rect } = fixture(
			`#port{overflow:${overflow}}#child{width:40px}`,
		);
		expect(owner.bounds(id("#port"))).toEqual({ x: 0, y: 80 });
		expect(owner.to(id("#port"), 500, 30)).toBe(true);
		expect(read()).toMatchObject({ scrollLeft: 0, scrollTop: 30 });
		expect(rect()).toMatchObject({ x: 0, y: -30 });
		expect(owner.by(id("#port"), 30, 0)).toBe(false);
		expect(read()).toMatchObject({ scrollLeft: 0, scrollTop: 30 });
	},
);

it("clamps numeric requests to exact content bounds and reports boundary no-ops", () => {
	const { id, owner, read, rect } = fixture();
	expect(read()).toMatchObject({ scrollWidth: 160, scrollHeight: 140 });
	expect(owner.bounds(id("#port"))).toEqual({ x: 80, y: 80 });
	expect(owner.to(id("#port"), 500, 500)).toBe(true);
	expect(read()).toMatchObject({ scrollLeft: 80, scrollTop: 80 });
	expect(rect()).toMatchObject({ x: -80, y: -80 });
	expect(owner.by(id("#port"), 50, 50)).toBe(false);
	expect(owner.by(id("#port"), -200, -200)).toBe(true);
	expect(read()).toMatchObject({ scrollLeft: 0, scrollTop: 0 });
	expect(owner.to(id("#port"), -1, -2)).toBe(false);
});

it.each([
	["clip", "hidden", 0, 25, 0, 80],
	["hidden", "clip", 25, 0, 80, 0],
] as const)(
	"preserves the mixed %s/%s computation profile and its nonscrolling clip axis",
	(horizontal, vertical, left, top, maximumLeft, maximumTop) => {
		const { tree, id, owner, read, rect, hits } = fixture(
			`#port{overflow-x:${horizontal};overflow-y:${vertical}}`,
		);
		expect(documentStyles(tree).flow(id("#port"))).toMatchObject({
			"overflow-x": horizontal,
			"overflow-y": vertical,
		});
		expect(owner.bounds(id("#port"))).toEqual({
			x: maximumLeft,
			y: maximumTop,
		});
		expect(owner.to(id("#port"), 25, 25)).toBe(true);
		expect(read()).toMatchObject({ scrollLeft: left, scrollTop: top });
		expect(rect()).toMatchObject({
			x: left === 0 ? 0 : -left,
			y: top === 0 ? 0 : -top,
		});
		expect(pixel(rasterizeDocument(tree).image, 85, 20)).toEqual(white);
		expect(hits.elementsFromPoint(85, 20)).not.toContain(id("#child"));
	},
);

it.each([
	["visible", "hidden", "auto", "hidden"],
	["hidden", "visible", "hidden", "auto"],
] as const)(
	"computes visible beside a scrollable axis as auto for %s/%s",
	(horizontal, vertical, computedHorizontal, computedVertical) => {
		const { tree, id, owner, move, rect } = fixture(
			`#port{overflow-x:${horizontal};overflow-y:${vertical}}`,
		);
		expect(documentStyles(tree).flow(id("#port"))).toMatchObject({
			"overflow-x": computedHorizontal,
			"overflow-y": computedVertical,
		});
		expect(owner.bounds(id("#port"))).toEqual({ x: 80, y: 80 });
		move("#port", 20, 30);
		expect(rect()).toMatchObject({ x: -20, y: -30 });
	},
);

it("isolates element scroll positions between independent documents", () => {
	const first = fixture();
	const second = fixture();
	first.move("#port", 20, 30);
	expect(first.rect()).toMatchObject({ x: -20, y: -30 });
	expect(second.read()).toMatchObject({ scrollLeft: 0, scrollTop: 0 });
	expect(second.rect()).toMatchObject({ x: 0, y: 0 });
	second.move("#port", 5, 10);
	expect(first.read()).toMatchObject({ scrollLeft: 20, scrollTop: 30 });
	expect(second.rect()).toMatchObject({ x: -5, y: -10 });
});

it("recomputes dimensions and clamps retained positions after content mutation", () => {
	const { tree, id, owner, move, read, rect } = fixture();
	const border = rect("#port");
	move("#port", 80, 80);
	tree.setAttribute(id("#child"), "style", "width:100px;height:90px");
	expect(owner.bounds(id("#port"))).toEqual({ x: 20, y: 30 });
	expect(read()).toEqual({
		scrollLeft: 20,
		scrollTop: 30,
		scrollWidth: 100,
		scrollHeight: 90,
	});
	expect(rect()).toMatchObject({ x: -20, y: -30, width: 100, height: 90 });
	expect(rect("#port")).toEqual(border);
});

it("exposes zero detached metrics and resumes bounded scrolling after reattachment", () => {
	const { tree, id, owner, move, rect } = fixture();
	const port = id("#port");
	const body = id("body");
	move("#port", 20, 30);
	tree.remove(port);
	expect(owner.get(port)).toEqual({
		scrollLeft: 0,
		scrollTop: 0,
		scrollWidth: 0,
		scrollHeight: 0,
	});
	expect(owner.bounds(port)).toEqual({ x: 0, y: 0 });
	expect(owner.to(port, 10, 15)).toBe(false);
	tree.append(body, port);
	move("#port", 10, 15);
	expect(rect()).toMatchObject({ x: -10, y: -15 });
	expect(owner.bounds(port)).toEqual({ x: 80, y: 80 });
});

it("revokes retained scroll, geometry and hit owners when the document closes", () => {
	const { tree, id, owner, geometry, hits, move } = fixture();
	const port = id("#port");
	move("#port", 20, 30);
	tree.close();
	for (const action of [
		() => owner.get(port),
		() => owner.bounds(port),
		() => owner.to(port, 0, 0),
		() => owner.by(port, 1, 1),
		() => geometry.getBoundingClientRect(port),
		() => hits.elementFromPoint(5, 5),
		() => rasterizeDocument(tree),
	])
		expect(action).toThrow(expect.objectContaining({ code: "closed" }));
});

it.each(["hidden", "auto", "scroll", "clip"])(
	"does not propagate overflow:%s descendants into outer or root scroll extents",
	(overflow) => {
		const { read, root, rect } = fixture(
			`#outer{width:120px;height:100px}#port{overflow:${overflow}}#child{width:300px;height:250px}`,
			`<div id="outer"><div id="port"><div id="child"></div></div></div>`,
		);
		expect(read("#outer")).toMatchObject({
			scrollWidth: 120,
			scrollHeight: 100,
		});
		expect(root.bounds()).toEqual({ x: 0, y: 0 });
		expect(rect()).toMatchObject({ width: 300, height: 250 });
	},
);

it("propagates visible descendants into outer and root scroll extents", () => {
	const { read, root } = fixture(
		"#outer{width:120px;height:100px}#port{overflow:visible}#child{width:300px;height:250px}",
		`<div id="outer"><div id="port"><div id="child"></div></div></div>`,
	);
	expect(read("#outer")).toMatchObject({
		scrollWidth: 300,
		scrollHeight: 250,
	});
	expect(root.bounds()).toEqual({ x: 60, y: 70 });
});

it("composes independent nested scroll positions and intersects descendant clipping", () => {
	const { tree, id, owner, move, rect, hits } = fixture(
		"#port{width:100px;height:80px;overflow:auto}#lead{height:20px}#inner{width:60px;height:40px;overflow:hidden}#child{width:140px;height:120px}#tail{height:160px}",
		`<div id="port"><div id="lead"></div><div id="inner"><div id="child"></div></div><div id="tail"></div></div>`,
	);
	expect(owner.bounds(id("#inner"))).toEqual({ x: 80, y: 80 });
	expect(owner.bounds(id("#port"))).toEqual({ x: 0, y: 140 });
	move("#inner", 30, 40);
	move("#port", 0, 10);
	expect(rect("#inner")).toMatchObject({ x: 0, y: 10, width: 60, height: 40 });
	expect(rect()).toMatchObject({ x: -30, y: -30, width: 140, height: 120 });
	expect(hits.elementFromPoint(5, 15)).toBe(id("#child"));
	expect(hits.elementsFromPoint(70, 15)).not.toContain(id("#child"));
	expect(pixel(rasterizeDocument(tree).image, 5, 15)).toEqual(red);
	expect(owner.get(id("#inner"))).toMatchObject({
		scrollLeft: 30,
		scrollTop: 40,
	});
});

it("lets an absolute descendant escape an intermediate clip and scroll when its containing block is outside", () => {
	const { tree, id, move, rect, hits } = fixture(
		"#outer{position:relative;width:200px;height:160px}#fill{width:160px;height:140px}#child{position:absolute;left:100px;top:20px;width:20px;height:20px}",
		`<div id="outer"><div id="port"><div id="fill"></div><div id="child"></div></div></div>`,
	);
	expect(rect()).toMatchObject({ x: 100, y: 20, width: 20, height: 20 });
	move("#port", 20, 30);
	expect(rect()).toMatchObject({ x: 100, y: 20 });
	expect(hits.elementFromPoint(105, 25)).toBe(id("#child"));
	expect(pixel(rasterizeDocument(tree).image, 105, 25)).toEqual(red);
});

it("captures an absolute descendant in its positioned overflow containing block", () => {
	const { tree, id, move, rect, hits } = fixture(
		"#port{position:relative}#fill{width:160px;height:140px}#child{position:absolute;left:60px;top:20px;width:40px;height:20px}",
		`<div id="port"><div id="fill"></div><div id="child"></div></div>`,
	);
	expect(rect()).toMatchObject({ x: 60, y: 20, width: 40, height: 20 });
	expect(hits.elementFromPoint(70, 25)).toBe(id("#child"));
	expect(hits.elementsFromPoint(90, 25)).not.toContain(id("#child"));
	expect(pixel(rasterizeDocument(tree).image, 90, 25)).toEqual(white);
	move("#port", 20, 10);
	expect(rect()).toMatchObject({ x: 40, y: 10, width: 40, height: 20 });
	expect(hits.elementFromPoint(45, 15)).toBe(id("#child"));
	expect(pixel(rasterizeDocument(tree).image, 45, 15)).toEqual(red);
});

it("keeps a fixed descendant outside ancestor clipping and both element and root scrolling", () => {
	const { tree, id, root, move, rect, hits } = fixture(
		"#fill{width:160px;height:140px}#child{position:fixed;left:100px;top:20px;width:20px;height:20px}#tail{height:400px}",
		`<div id="port"><div id="fill"></div><div id="child"></div></div><div id="tail"></div>`,
	);
	move("#port", 20, 30);
	root.to(0, 40);
	expect(root.get()).toEqual({ x: 0, y: 40 });
	expect(rect()).toMatchObject({ x: 100, y: 20, width: 20, height: 20 });
	expect(hits.elementFromPoint(105, 25)).toBe(id("#child"));
	expect(pixel(rasterizeDocument(tree).image, 105, 25)).toEqual(red);
});

it("uses the nearest element scrollport for sticky insets during combined root scrolling", () => {
	const { tree, id, root, move, read, rect, hits, geometry } = fixture(
		"#before{height:40px}#port{overflow:auto}#lead{height:30px}#sticky{position:sticky;top:5px;width:30px;height:20px;background:red}#tail{height:150px}#after{height:400px}",
		`<div id="before"></div><div id="port"><div id="lead"></div><div id="sticky"></div><div id="tail"></div></div><div id="after"></div>`,
	);
	root.to(0, 20);
	expect(root.get()).toEqual({ x: 0, y: 20 });
	move("#port", 0, 40);
	expect(rect("#port").y).toBe(20);
	expect(rect("#sticky").y).toBe(25);
	expect(geometry.getDocumentRects(id("#sticky"))).toMatchObject([
		{ x: 0, y: 45, width: 30, height: 20 },
	]);
	root.to(0, 30);
	expect(root.get()).toEqual({ x: 0, y: 30 });
	expect(read()).toMatchObject({ scrollLeft: 0, scrollTop: 40 });
	expect(rect("#sticky").y).toBe(15);
	expect(hits.elementFromPoint(5, 20)).toBe(id("#sticky"));
	expect(pixel(rasterizeDocument(tree).image, 5, 20)).toEqual(red);
});

it("releases nested sticky content at the containing block end before clipping its remainder", () => {
	const { tree, id, move, rect, hits } = fixture(
		"#port{overflow:auto}#host{height:100px}#lead{height:30px}#sticky{position:sticky;top:5px;width:30px;height:20px;background:red}#tail{height:50px}#extra{height:160px}",
		`<div id="port"><div id="host"><div id="lead"></div><div id="sticky"></div><div id="tail"></div></div><div id="extra"></div></div>`,
	);
	move("#port", 0, 40);
	expect(rect("#sticky").y).toBe(5);
	move("#port", 0, 90);
	expect(rect("#sticky")).toMatchObject({ y: -10, height: 20 });
	expect(hits.elementFromPoint(5, 5)).toBe(id("#sticky"));
	expect(hits.elementsFromPoint(5, 15)).not.toContain(id("#sticky"));
	expect(pixel(rasterizeDocument(tree).image, 5, 5)).toEqual(red);
});

it("clips descendant paint and hit regions to rounded padding corners after scrolling", () => {
	const { tree, id, move, rect, hits } = fixture(
		"#port{border:4px solid blue;border-radius:20px}",
	);
	const border = rect("#port");
	for (const offset of [0, 10]) {
		move("#port", offset, offset);
		expect(rect("#port")).toEqual(border);
		const image = rasterizeDocument(tree).image;
		expect(pixel(image, 5, 5)).toEqual(white);
		expect(pixel(image, 1, 30)).toEqual(blue);
		expect(pixel(image, 40, 10)).toEqual(red);
		expect(hits.elementsFromPoint(5, 5)).not.toContain(id("#child"));
		expect(hits.elementFromPoint(40, 10)).toBe(id("#child"));
	}
});

it.each(["hidden", "auto", "scroll"])(
	"makes an ordinary overflow:%s block contain its floated content height",
	(overflow) => {
		const { tree, id, rect, hits } = fixture(
			`#port{height:auto;overflow:${overflow}}#float{float:left;width:20px;height:30px;background:red}#after{height:10px}`,
			`<div id="port"><div id="float"></div></div><div id="after"></div>`,
		);
		expect(rect("#port")).toMatchObject({ y: 0, height: 30 });
		expect(rect("#float")).toMatchObject({ y: 0, width: 20, height: 30 });
		expect(rect("#after").y).toBe(30);
		expect(hits.elementFromPoint(5, 5)).toBe(id("#float"));
		expect(pixel(rasterizeDocument(tree).image, 5, 5)).toEqual(red);
	},
);

it.each(["hidden", "auto", "scroll"])(
	"prevents child margin collapse in an ordinary overflow:%s block",
	(overflow) => {
		const { rect } = fixture(
			`#port{height:auto;overflow:${overflow}}#child{width:20px;height:10px;margin:20px 0 30px}#after{height:10px}`,
			`<div id="port"><div id="child"></div></div><div id="after"></div>`,
		);
		expect(rect("#port")).toMatchObject({ y: 0, height: 60 });
		expect(rect()).toMatchObject({ y: 20, height: 10 });
		expect(rect("#after").y).toBe(60);
	},
);

it("does not make clip alone contain floats or suppress ordinary child margin collapse", () => {
	const floats = fixture(
		"#port{height:auto;overflow:clip}#float{float:left;width:20px;height:30px}#after{height:10px}",
		`<div id="port"><div id="float"></div></div><div id="after"></div>`,
	);
	expect(floats.rect("#port").height).toBe(0);
	expect(floats.rect("#float").height).toBe(30);
	expect(floats.rect("#after").y).toBe(0);
	const margins = fixture(
		"#port{height:auto;overflow:clip}#child{width:20px;height:10px;margin:20px 0 30px}#after{height:10px}",
		`<div id="port"><div id="child"></div></div><div id="after"></div>`,
	);
	expect(margins.rect("#port")).toMatchObject({ y: 20, height: 10 });
	expect(margins.rect()).toMatchObject({ y: 20, height: 10 });
	expect(margins.rect("#after").y).toBe(60);
});

it("retains unsupported transform and multiline-sticky guards and bounded resource failures", () => {
	const transformed = fixture("#port{transform:translateX(1px)}");
	for (const action of [
		() => transformed.rect(),
		() => transformed.hits.elementFromPoint(5, 5),
		() => rasterizeDocument(transformed.tree),
	])
		expect(action).toThrow(expect.objectContaining({ code: "unsupported" }));
	const multiline = fixture(
		"#port{white-space:pre-wrap}#child{display:inline;width:auto;height:auto}",
		`<div id="port"><span id="child">A\n</span><span>B</span></div>`,
	);
	expect(
		multiline.geometry.getClientRects(multiline.id("#child")),
	).toHaveLength(2);
	multiline.tree.setAttribute(
		multiline.id("#child"),
		"style",
		"position:sticky;top:0",
	);
	for (const action of [
		() => multiline.rect(),
		() => multiline.hits.elementFromPoint(1, 1),
		() => rasterizeDocument(multiline.tree),
	])
		expect(action).toThrow("Multiline inline sticky positioning");
	const bounded = fixture();
	const scroll = new DocumentElementScroll(bounded.tree, { maxWork: 1 });
	const hits = new DocumentHitTesting(bounded.tree, { maxWork: 1 });
	try {
		for (const action of [
			() => scroll.get(bounded.id("#port")),
			() => hits.elementFromPoint(5, 5),
			() => rasterizeDocument(bounded.tree, { maxWork: 1 }),
		])
			expect(action).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		expect(hits.metrics().regions).toBe(0);
	} finally {
		scroll.close();
		hits.close();
	}
});
