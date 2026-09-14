import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { documentElementScroll } from "./element-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { runEventAction } from "./event-actions.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { rangeBoundingClientRect, rangeClientRects } from "./range-geometry.js";
import { documentScrollIntoView } from "./scroll-into-view.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	css = "",
	content = '<div id="before"></div><div id="target"></div><div id="after"></div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}body{width:360px}#host{width:360px;height:240px}#before{height:40px}#target{position:sticky;top:10px;width:40px;height:20px;background:red}#after{height:20px}#tail{height:400px}${css}</style><main id="host">${content}</main><div id="tail"></div>`,
		"https://fixture.invalid/sticky-positioning",
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
	const scroll = documentScroll(tree);
	const hits = documentHitTesting(tree);
	return {
		tree,
		id,
		geometry,
		scroll,
		hits,
		rect: (selector = "#target") =>
			geometry.getBoundingClientRect(id(selector)),
		documentRects: (selector = "#target") =>
			geometry.getDocumentRects(id(selector)),
		move: (horizontal: number, vertical: number) => {
			scroll.to(horizontal, vertical);
			expect(scroll.get()).toEqual({ x: horizontal, y: vertical });
		},
	};
}

function pixel(
	image: { width: number; pixels: Uint8Array },
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("crosses the top threshold and releases at the containing block end without moving sibling flow", () => {
	const { id, geometry, scroll, rect, documentRects, move } = fixture();
	expect(scroll.bounds()).toEqual({ x: 240, y: 540 });
	const saved = geometry.getClientRects(id("#target"));
	for (const [vertical, expectedTop] of [
		[0, 40],
		[25, 15],
		[30, 10],
		[80, 10],
		[210, 10],
		[220, 0],
		[240, -20],
		[80, 10],
		[0, 40],
	]) {
		move(0, vertical);
		expect(rect()).toMatchObject({
			x: 0,
			y: expectedTop,
			width: 40,
			height: 20,
		});
		expect(documentRects()).toMatchObject([
			{ x: 0, y: vertical + expectedTop, width: 40, height: 20 },
		]);
		expect(rect("#after").y).toBe(60 - vertical);
		expect(documentRects("#after")[0].y).toBe(60);
		expect(documentRects("#tail")[0].y).toBe(240);
		expect(scroll.bounds()).toEqual({ x: 240, y: 540 });
	}
	expect(saved).toMatchObject([{ x: 0, y: 40, width: 40, height: 20 }]);
});

it("keeps all-auto sticky boxes in normal flow on both scroll axes", () => {
	const { rect, documentRects, move } = fixture("#target{top:auto}");
	move(50, 80);
	expect(rect()).toMatchObject({ x: -50, y: -40, width: 40, height: 20 });
	expect(documentRects()).toMatchObject([{ x: 0, y: 40 }]);
	expect(documentRects("#after")[0].y).toBe(60);
});

it("does not make an unconstrained horizontal axis sticky", () => {
	const { rect, documentRects, move } = fixture();
	move(50, 80);
	expect(rect()).toMatchObject({ x: -50, y: 10 });
	expect(documentRects()).toMatchObject([{ x: 0, y: 90 }]);
});

it("pins a physical left inset and releases at the horizontal containing block end", () => {
	const { rect, documentRects, scroll, move } = fixture(
		"body{width:600px}#host{width:320px;padding-left:40px}#target{top:auto;left:10px}",
	);
	expect(scroll.bounds()).toEqual({ x: 480, y: 540 });
	for (const [horizontal, expectedLeft] of [
		[0, 40],
		[20, 20],
		[30, 10],
		[150, 10],
		[320, 0],
		[350, -30],
		[0, 40],
	]) {
		move(horizontal, 0);
		expect(rect()).toMatchObject({ x: expectedLeft, y: 40 });
		expect(documentRects()[0].x).toBe(horizontal + expectedLeft);
	}
});

it("uses a physical right inset without pulling a normally visible box rightwards", () => {
	const { rect, documentRects, move } = fixture(
		"#host{display:flex;align-items:flex-start}#before{width:240px;height:20px;flex:none}#target{top:auto;right:10px;flex:none}#after{width:20px;flex:none}",
	);
	for (const [horizontal, expectedLeft] of [
		[0, 70],
		[80, 70],
		[180, 60],
		[240, 0],
		[0, 70],
	]) {
		move(horizontal, 0);
		expect(rect()).toMatchObject({ x: expectedLeft, y: 0 });
		expect(documentRects("#after")[0].x).toBe(280);
	}
});

it("uses a physical bottom inset without pulling a normally visible box downwards", () => {
	const { rect, documentRects, move } = fixture(
		"#before{height:160px}#host{height:300px}#target{top:auto;bottom:10px}",
	);
	for (const [vertical, expectedTop] of [
		[0, 70],
		[50, 70],
		[100, 60],
		[160, 0],
		[0, 70],
	]) {
		move(0, vertical);
		expect(rect()).toMatchObject({ x: 0, y: expectedTop });
		expect(documentRects("#after")[0].y).toBe(180);
	}
});

it.each([
	["-5px", 80, -5],
	["2.5px", 42.25, 2.5],
] as const)(
	"preserves the signed or fractional top inset %s",
	(inset, vertical, top) => {
		const { rect, documentRects, move } = fixture(`#target{top:${inset}}`);
		move(0, vertical);
		expect(rect().y).toBe(top);
		expect(documentRects()[0].y).toBe(vertical + top);
	},
);

it("resolves percentage insets against the root viewport and refreshes after resizing", () => {
	const { tree, rect, documentRects, move } = fixture(
		"#host{width:320px;padding-left:40px}#target{top:10%;left:10%}",
	);
	move(80, 80);
	expect(rect()).toMatchObject({ x: 12, y: 10 });
	expect(documentRects()).toMatchObject([{ x: 92, y: 90 }]);
	documentStyles(tree).setViewport(200, 160);
	move(80, 80);
	expect(rect()).toMatchObject({ x: 20, y: 16 });
	expect(documentRects()).toMatchObject([{ x: 100, y: 96 }]);
	documentStyles(tree).setViewport(120, 100);
	expect(rect()).toMatchObject({ x: 12, y: 10 });
});

it("reprojects sticky geometry after viewport growth clamps both root scroll axes", () => {
	const { tree, scroll, rect, documentRects, move } = fixture();
	move(200, 500);
	expect(rect()).toMatchObject({ x: -200, y: -280 });
	documentStyles(tree).setViewport(400, 500);
	expect(rect()).toMatchObject({ x: 0, y: 10 });
	expect(scroll.get()).toEqual({ x: 0, y: 140 });
	expect(documentRects()).toMatchObject([{ x: 0, y: 150 }]);
});

it("keeps viewport pixels, hit regions and element captures on the projected sticky border box", () => {
	const { tree, id, hits, rect, move } = fixture();
	move(0, 80);
	expect(rect()).toMatchObject({ x: 0, y: 10, width: 40, height: 20 });
	const capture = rasterizeDocument(tree);
	expect(capture.clip).toEqual({ x: 0, y: 80, width: 120, height: 100 });
	expect(pixel(capture.image, 5, 15)).toEqual([255, 0, 0, 255]);
	expect(pixel(capture.image, 5, 45)).not.toEqual([255, 0, 0, 255]);
	expect(hits.elementFromPoint(5, 15)).toBe(id("#target"));
	expect(hits.elementsFromPoint(5, 15)[0]).toBe(id("#target"));
	expect(hits.elementFromPoint(5, 45)).not.toBe(id("#target"));
	const element = rasterizeDocument(tree, {
		element: tree.reference(id("#target")),
	});
	expect(element.clip).toEqual({ x: 0, y: 90, width: 40, height: 20 });
	expect(pixel(element.image, 5, 5)).toEqual([255, 0, 0, 255]);
	move(0, 225);
	expect(rect().y).toBe(-5);
	expect(pixel(rasterizeDocument(tree).image, 5, 5)).toEqual([255, 0, 0, 255]);
	expect(hits.elementFromPoint(5, 5)).toBe(id("#target"));
	expect(hits.elementFromPoint(5, 16)).not.toBe(id("#target"));
});

it("projects text Range and selection geometry without changing source text or boundaries", () => {
	const { tree, id, move } = fixture(
		"",
		'<div id="before"></div><div id="target">ABCDE</div><div id="after"></div>',
	);
	const text = tree.get(id("#target")).children[0];
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	range.setStart(text, 1);
	range.setEnd(text, 4);
	owner.selection.addRange(range);
	const saved = rangeClientRects(range);
	expect(saved).toMatchObject([{ x: 6, y: 41, width: 18, height: 8 }]);
	for (const [vertical, expectedTop] of [
		[80, 11],
		[220, 1],
		[0, 41],
	]) {
		move(0, vertical);
		expect(rangeClientRects(range)).toMatchObject([
			{ x: 6, y: expectedTop, width: 18, height: 8 },
		]);
		expect(rangeBoundingClientRect(range)).toMatchObject({
			x: 6,
			y: expectedTop,
			width: 18,
			height: 8,
		});
		expect(range.toString()).toBe("BCD");
		expect(tree.get(text).data).toBe("ABCDE");
		expect(owner.selection.getRangeAt(0)).toBe(range);
		expect(owner.selection.anchorOffset).toBe(1);
		expect(owner.selection.focusOffset).toBe(4);
	}
	expect(saved).toMatchObject([{ x: 6, y: 41, width: 18, height: 8 }]);
});

it("paints the editable caret at the sticky Range edge after root scrolling", () => {
	const { tree, id, move } = fixture(
		"#target{color:red;background:white;outline:none}",
		'<div id="before"></div><div id="target" contenteditable>ABCDE</div><div id="after"></div>',
	);
	const text = tree.get(id("#target")).children[0];
	documentInteractions(tree).focus.focusElement(id("#target"), {
		preventScroll: true,
	});
	const selection = domRangeOwner(tree).selection;
	selection.collapse(text, 2);
	const range = selection.getRangeAt(0);
	for (const vertical of [80, 120]) {
		move(0, vertical);
		expect(rangeClientRects(range)).toMatchObject([
			{ x: 12, y: 11, width: 0, height: 8 },
		]);
		const capture = rasterizeDocument(tree);
		expect(capture.metrics).toMatchObject({
			paintedCarets: 1,
			caretStatus: "painted",
		});
		for (let row = 11; row < 19; row++)
			expect(pixel(capture.image, 12, row)).toEqual([255, 0, 0, 255]);
		expect(selection.getRangeAt(0)).toBe(range);
		expect(tree.get(text).data).toBe("ABCDE");
	}
});

it("uses current sticky geometry for native nearest scrollIntoView", () => {
	const { tree, id, rect, move } = fixture();
	const interactions = documentInteractions(tree);
	const owner = documentScrollIntoView(tree);
	move(0, 120);
	expect(rect().y).toBe(10);
	expect(
		runEventAction(
			interactions.events,
			owner.action(id("#target"), { block: "nearest", inline: "nearest" }),
		),
	).toMatchObject({ hasBox: true, changed: false, scroll: { x: 0, y: 120 } });
	expect(rect().y).toBe(10);
});

it("independently constrains nested sticky boxes without accumulating ancestor translation", () => {
	const { tree, id, hits, rect, documentRects, move } = fixture(
		"#target{width:80px;height:80px}#inner-before{height:20px}#inner{position:sticky;top:45px;width:40px;height:20px;background:lime}",
		'<div id="before"></div><div id="target"><div id="inner-before"></div><div id="inner"></div></div><div id="after"></div>',
	);
	for (const [vertical, outerTop, innerTop] of [
		[0, 40, 60],
		[20, 20, 45],
		[80, 10, 45],
		[180, -20, 40],
		[210, -50, 10],
		[80, 10, 45],
		[0, 40, 60],
	]) {
		move(0, vertical);
		expect(rect().y).toBe(outerTop);
		expect(rect("#inner").y).toBe(innerTop);
		expect(documentRects("#inner")[0].y).toBe(vertical + innerTop);
		expect(documentRects("#after")[0].y).toBe(120);
	}
	move(0, 80);
	expect(pixel(rasterizeDocument(tree).image, 5, 50)).toEqual([0, 255, 0, 255]);
	expect(hits.elementFromPoint(5, 50)).toBe(id("#inner"));
});

it.each([
	["auto", "auto", "#after", [0, 0, 255, 255]],
	["2", "1", "#target", [255, 0, 0, 255]],
] as const)(
	"allows independently sticky siblings to overlap at levels %s and %s",
	(first, second, winner, color) => {
		const { tree, id, hits, rect, documentRects, move } = fixture(
			`#target{z-index:${first}}#after{position:sticky;top:10px;width:40px;background:blue;z-index:${second}}`,
		);
		move(0, 80);
		expect(rect().y).toBe(10);
		expect(rect("#after").y).toBe(10);
		expect(documentRects()[0].y).toBe(90);
		expect(documentRects("#after")[0].y).toBe(90);
		expect(pixel(rasterizeDocument(tree).image, 5, 15)).toEqual(color);
		expect(hits.elementFromPoint(5, 15)).toBe(id(winner));
		move(0, 0);
		expect(rect().y).toBe(40);
		expect(rect("#after").y).toBe(60);
	},
);

it("contains a high-z descendant in an auto-z sticky stacking context", () => {
	const { tree, id, hits, move } = fixture(
		"#target{z-index:auto}#child{position:relative;z-index:999;width:40px;height:20px;background:lime}#after{position:sticky;top:10px;width:40px;background:blue;z-index:1}",
		'<div id="before"></div><div id="target"><div id="child"></div></div><div id="after"></div>',
	);
	move(0, 80);
	expect(pixel(rasterizeDocument(tree).image, 5, 15)).toEqual([0, 0, 255, 255]);
	expect(hits.elementFromPoint(5, 15)).toBe(id("#after"));
	tree.setAttribute(id("#target"), "style", "z-index:2");
	expect(pixel(rasterizeDocument(tree).image, 5, 15)).toEqual([0, 255, 0, 255]);
	expect(hits.elementFromPoint(5, 15)).toBe(id("#child"));
});

it("anchors absolute descendants to sticky boxes while fixed descendants remain viewport-relative", () => {
	const { tree, id, hits, rect, documentRects, move } = fixture(
		"#absolute{position:absolute;left:5px;top:3px;width:10px;height:10px;background:lime}#fixed{position:fixed;left:70px;top:25px;width:10px;height:10px;background:blue}",
		'<div id="before"></div><div id="target"><div id="absolute"></div><div id="fixed"></div></div><div id="after"></div>',
	);
	for (const [vertical, expectedTop] of [
		[0, 43],
		[80, 13],
		[220, 3],
	]) {
		move(0, vertical);
		expect(rect("#absolute")).toMatchObject({ x: 5, y: expectedTop });
		expect(rect("#fixed")).toMatchObject({ x: 70, y: 25 });
		expect(documentRects("#absolute")[0].y).toBe(vertical + expectedTop);
		expect(documentRects("#fixed")[0].y).toBe(vertical + 25);
		expect(hits.elementFromPoint(6, expectedTop + 1)).toBe(id("#absolute"));
		expect(hits.elementFromPoint(71, 26)).toBe(id("#fixed"));
		const capture = rasterizeDocument(tree);
		expect(pixel(capture.image, 6, expectedTop + 1)).toEqual([0, 255, 0, 255]);
		expect(pixel(capture.image, 71, 26)).toEqual([0, 0, 255, 255]);
	}
});

it("does not apply root scroll twice to sticky descendants of a fixed ancestor", () => {
	const { rect, documentRects, move } = fixture(
		"#fixed-host{position:fixed;left:30px;top:20px;width:60px;height:60px}#before{height:20px}",
		'<div id="fixed-host"><div id="before"></div><div id="target"></div></div>',
	);
	for (const [horizontal, vertical] of [
		[0, 0],
		[50, 80],
		[100, 220],
		[0, 0],
	]) {
		move(horizontal, vertical);
		expect(rect()).toMatchObject({ x: 30, y: 40, width: 40, height: 20 });
		expect(documentRects()).toMatchObject([
			{ x: horizontal + 30, y: vertical + 40 },
		]);
	}
});

it.each(["block", "flex"])(
	"preserves the normal allocation of a sticky item in %s layout",
	(display) => {
		const { rect, documentRects, move } = fixture(
			`#host{display:${display};flex-direction:column;align-items:flex-start}#before,#target,#after{flex:none}`,
		);
		expect(rect()).toMatchObject({ y: 40, width: 40, height: 20 });
		move(0, 80);
		expect(rect()).toMatchObject({ y: 10, width: 40, height: 20 });
		expect(documentRects("#after")[0].y).toBe(60);
		move(0, 220);
		expect(rect().y).toBe(0);
	},
);

it.each([
	["inline-block", '<span id="target"></span>'],
	["replaced", '<img id="target" width="40" height="20">'],
] as const)(
	"projects a sticky %s box without moving its inline sibling",
	(_kind, target) => {
		const { tree, id, hits, rect, documentRects, move } = fixture(
			"#target,#after{display:inline-block;vertical-align:top}#after{width:20px}",
			`<div id="before"></div>${target}<span id="after"></span>`,
		);
		expect(rect()).toMatchObject({ x: 0, y: 40, width: 40, height: 20 });
		const sibling = documentRects("#after");
		move(0, 80);
		expect(rect()).toMatchObject({ x: 0, y: 10, width: 40, height: 20 });
		expect(documentRects("#after")).toEqual(sibling);
		expect(hits.elementFromPoint(5, 15)).toBe(id("#target"));
		expect(pixel(rasterizeDocument(tree).image, 5, 15)).toEqual([
			255, 0, 0, 255,
		]);
	},
);

it("invalidates prepared captures and refreshes warmed geometry and hits after scrolling and mutation", () => {
	const { tree, id, hits, rect, move } = fixture();
	expect(rect().y).toBe(40);
	expect(hits.elementFromPoint(5, 45)).toBe(id("#target"));
	const initial = prepareDocumentRaster(tree);
	move(0, 80);
	expect(() => initial.rasterize()).toThrow("stale");
	expect(rect().y).toBe(10);
	expect(hits.elementFromPoint(5, 15)).toBe(id("#target"));
	const stuck = prepareDocumentRaster(tree);
	tree.setAttribute(id("#target"), "style", "top:25px;background:blue");
	expect(() => stuck.rasterize()).toThrow("stale");
	expect(rect().y).toBe(25);
	expect(hits.elementFromPoint(5, 15)).not.toBe(id("#target"));
	expect(hits.elementFromPoint(5, 30)).toBe(id("#target"));
	expect(pixel(rasterizeDocument(tree).image, 5, 30)).toEqual([0, 0, 255, 255]);
	tree.setAttribute(id("#host"), "style", "height:100px");
	expect(rect().y).toBe(0);
	tree.setAttribute(id("#target"), "style", "position:static");
	expect(rect().y).toBe(-40);
	expect(hits.elementFromPoint(5, 5)).not.toBe(id("#target"));
});

it("forgets a removed sticky box and rebuilds its containing block after reattachment", () => {
	const { tree, id, geometry, hits, move } = fixture();
	const target = id("#target");
	move(0, 80);
	expect(hits.elementFromPoint(5, 15)).toBe(target);
	tree.remove(target);
	expect(geometry.getClientRects(target)).toEqual([]);
	expect(hits.elementFromPoint(5, 15)).not.toBe(target);
	tree.append(id("#host"), target);
	expect(geometry.getBoundingClientRect(target)).toMatchObject({
		x: 0,
		y: 10,
		width: 40,
		height: 20,
	});
	expect(hits.elementFromPoint(5, 15)).toBe(target);
	move(0, 0);
	expect(geometry.getBoundingClientRect(target).y).toBe(60);
});

it("isolates sticky presentation by document and revokes public owners on close", () => {
	const first = fixture();
	const second = fixture();
	first.move(0, 80);
	expect(first.rect().y).toBe(10);
	expect(second.rect().y).toBe(40);
	const target = first.id("#target");
	const range = domRangeOwner(first.tree).createRange();
	range.selectNode(target);
	first.tree.close();
	expect(() => first.geometry.getClientRects(target)).toThrow("closed");
	expect(() => first.hits.elementFromPoint(5, 15)).toThrow("closed");
	expect(() => first.scroll.get()).toThrow("closed");
	expect(() => rasterizeDocument(first.tree)).toThrow(/closed/);
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	second.move(0, 80);
	expect(second.rect().y).toBe(10);
});

it.each(["auto", "scroll", "hidden"])(
	"anchors sticky descendants to the nearest overflow:%s port rather than the viewport",
	(overflow) => {
		const { tree, id, hits, scroll, move, rect } = fixture(
			"#host{height:160px}#after{height:200px}",
		);
		const elements = documentElementScroll(tree);
		const interactions = documentInteractions(tree);
		const owner = documentScrollIntoView(tree);
		const run = () =>
			runEventAction(
				interactions.events,
				owner.action(id("#target"), { block: "nearest" }),
			);
		move(0, 80);
		expect(hits.elementFromPoint(5, 15)).toBe(id("#target"));
		expect(run()).toMatchObject({ changed: false });
		tree.setAttribute(id("#host"), "style", `overflow:${overflow}`);
		expect(scroll.get()).toEqual({ x: 0, y: 80 });
		expect(elements.bounds(id("#host"))).toEqual({ x: 0, y: 100 });
		expect(rect().y).toBe(-40);
		expect(hits.elementFromPoint(5, 15)).not.toBe(id("#target"));
		move(0, 5);
		expect(rect().y).toBe(35);
		expect(elements.to(id("#host"), 0, 50)).toBe(true);
		expect(rect().y).toBe(5);
		expect(hits.elementFromPoint(5, 10)).toBe(id("#target"));
		expect(run()).toMatchObject({ changed: false });
		expect(elements.get(id("#host")).scrollTop).toBe(50);
		expect(scroll.get()).toEqual({ x: 0, y: 5 });
		move(0, 15);
		expect(rect().y).toBe(-5);
		tree.setAttribute(id("#host"), "style", "overflow:visible");
		expect(elements.get(id("#host")).scrollTop).toBe(0);
		expect(scroll.get()).toEqual({ x: 0, y: 15 });
		expect(rect().y).toBe(25);
		move(0, 80);
		expect(scroll.get()).toEqual({ x: 0, y: 80 });
		expect(hits.elementFromPoint(5, 15)).toBe(id("#target"));
	},
);

it("rejects bounded hit-test work without returning partially prepared sticky regions", () => {
	const { tree, move } = fixture();
	move(0, 80);
	const hits = new DocumentHitTesting(tree, { maxWork: 1 });
	try {
		expect(() => hits.elementFromPoint(5, 15)).toThrow("work limit");
		expect(hits.metrics().regions).toBe(0);
	} finally {
		hits.close();
	}
});

it.each([
	["auto", 40],
	["0px", 20],
] as const)(
	"fits a horizontal-writing 200px sticky border box by reducing effective bottom to -120px with bottom:%s",
	(bottom, initialTop) => {
		const { rect, documentRects, scroll, move } = fixture(
			`#host{height:500px}#target{top:20px;bottom:${bottom};width:36px;height:196px;border:2px solid blue}`,
		);
		expect(scroll.bounds()).toEqual({ x: 240, y: 800 });
		for (const [vertical, expectedTop] of [
			[0, initialTop],
			[60, 20],
			[280, 20],
			[300, 0],
			[340, -40],
			[0, initialTop],
		]) {
			move(0, vertical);
			expect(rect()).toMatchObject({
				x: 0,
				y: expectedTop,
				width: 40,
				height: 200,
			});
			expect(documentRects()[0].y).toBe(vertical + expectedTop);
			expect(documentRects("#after")[0].y).toBe(240);
			expect(documentRects("#tail")[0].y).toBe(500);
		}
	},
);

it("does not pull a top-only sticky box up from below the viewport", () => {
	const { rect, documentRects, move } = fixture(
		"#host{height:300px}#before{height:160px}",
	);
	for (const [vertical, expectedTop] of [
		[0, 160],
		[50, 110],
		[100, 60],
		[180, 10],
	]) {
		move(0, vertical);
		expect(rect().y).toBe(expectedTop);
		expect(documentRects("#after")[0].y).toBe(180);
	}
});

it("does not pull a bottom-only sticky box down after it passes above the viewport", () => {
	const { rect, documentRects, move } = fixture(
		"#target{top:auto;bottom:10px}",
	);
	for (const [vertical, expectedTop] of [
		[0, 40],
		[30, 10],
		[80, -40],
	]) {
		move(0, vertical);
		expect(rect().y).toBe(expectedTop);
		expect(documentRects()[0].y).toBe(40);
	}
});

it.each([
	[0, 0],
	[8, 8],
	[40, 20],
] as const)(
	"limits a 20px start margin using its nonnegative margin-edge gap of %spx",
	(gap, effectiveMargin) => {
		const { tree, id, rect, documentRects, move } = fixture(
			`#host{display:flex;flex-direction:column;align-items:flex-start}#before,#target,#after{flex:none}#before{height:${gap}px}#target{position:static;top:auto;bottom:80px;margin-top:20px}`,
		);
		expect(rect().y).toBe(gap + 20);
		const following = documentRects("#after");
		tree.setAttribute(id("#target"), "style", "position:sticky");
		expect(rect().y).toBe(effectiveMargin);
		expect(documentRects("#after")).toEqual(following);
		move(0, 10);
		expect(rect().y).toBe(Math.max(10, effectiveMargin) - 10);
		expect(documentRects("#after")).toEqual(following);
	},
);

it.each([
	[0, 80, 100],
	[8, 72, 92],
	[40, 40, 80],
] as const)(
	"limits a 20px end margin using its nonnegative margin-edge gap of %spx",
	(_gap, beforeHeight, finalDocumentTop) => {
		const { rect, documentRects, move } = fixture(
			`#host{display:flex;flex-direction:column;align-items:flex-start;height:120px}#before,#target{flex:none}#before{height:${beforeHeight}px}#target{margin-bottom:20px}`,
			'<div id="before"></div><div id="target"></div>',
		);
		expect(rect().y).toBe(beforeHeight);
		move(0, 110);
		expect(rect().y).toBe(finalDocumentTop - 110);
		expect(documentRects()[0].y).toBe(finalDocumentTop);
		expect(documentRects("#tail")[0].y).toBe(120);
	},
);

it("releases a sticky grid item at its assigned row and column area, not the whole grid", () => {
	const { tree, id, hits, rect, documentRects, move } = fixture(
		"#host{display:grid;grid-template-columns:100px 100px 100px;grid-template-rows:60px 80px 60px;gap:10px;align-content:start;justify-content:start}#before{grid-row:1;grid-column:1}#target{grid-row:2;grid-column:2;left:10px}#after{grid-row:3;grid-column:3}",
	);
	const following = documentRects("#after");
	expect(following[0]).toMatchObject({ x: 220, y: 160 });
	for (const [horizontal, vertical, expectedLeft, expectedTop] of [
		[0, 0, 110, 70],
		[100, 80, 10, 10],
		[140, 120, 10, 10],
		[180, 140, -10, -10],
	]) {
		move(horizontal, vertical);
		expect(rect()).toMatchObject({
			x: expectedLeft,
			y: expectedTop,
			width: 40,
			height: 20,
		});
		expect(documentRects()[0]).toMatchObject({
			x: horizontal + expectedLeft,
			y: vertical + expectedTop,
		});
		expect(documentRects("#after")).toEqual(following);
	}
	move(140, 120);
	expect(hits.elementFromPoint(15, 15)).toBe(id("#target"));
	expect(pixel(rasterizeDocument(tree).image, 15, 15)).toEqual([
		255, 0, 0, 255,
	]);
});

it("includes intervening track gaps in a sticky grid item's spanned containing area", () => {
	const { rect, documentRects, move } = fixture(
		"body{width:600px}#host{display:grid;grid-template-columns:100px 100px 100px;grid-template-rows:60px 80px 60px;gap:10px;align-content:start;justify-content:start}#before{grid-row:1;grid-column:1}#target{grid-row:1 / span 2;grid-column:2 / span 2;left:10px}#after{grid-row:3;grid-column:1}",
	);
	expect(rect()).toMatchObject({ x: 110, y: 10 });
	move(200, 80);
	expect(rect()).toMatchObject({ x: 10, y: 10 });
	move(280, 140);
	expect(rect()).toMatchObject({ x: 0, y: -10, width: 40, height: 20 });
	expect(documentRects()[0]).toMatchObject({ x: 280, y: 130 });
	expect(documentRects("#after")[0]).toMatchObject({ x: 0, y: 160 });
});

it.each([
	["relative", "position:relative;left:20px;top:15px", 100, 55, 10, -45],
	[
		"flex",
		"display:flex;align-items:center;justify-content:flex-end",
		120,
		60,
		10,
		-40,
	],
	["sticky", "position:sticky;top:15px", 80, 40, 15, 0],
] as const)(
	"moves a nested grid's sticky containing area with its shifted %s ancestor",
	(_kind, ancestorStyle, targetLeft, initialTop, stuckTop, releasedTop) => {
		const { rect, documentRects, move } = fixture(
			`#wrapper{width:240px;height:140px;${ancestorStyle}}#grid{display:grid;flex:none;width:200px;height:100px;grid-template-columns:80px 120px;grid-template-rows:60px 40px}#target{grid-column:2;grid-row:1}`,
			'<div id="before"></div><div id="wrapper"><div id="grid"><div id="target"></div></div></div><div id="after"></div>',
		);
		expect(rect()).toMatchObject({ x: targetLeft, y: initialTop });
		move(0, 80);
		expect(rect()).toMatchObject({ x: targetLeft, y: stuckTop });
		expect(documentRects()[0].y).toBe(80 + stuckTop);
		move(0, 140);
		expect(rect()).toMatchObject({ x: targetLeft, y: releasedTop });
		expect(documentRects()[0].y).toBe(140 + releasedTop);
		expect(documentRects("#after")[0].y).toBe(180);
		move(0, 0);
		expect(rect()).toMatchObject({ x: targetLeft, y: initialTop });
	},
);

it.each(["block", "inline-block"])(
	"paints generated sticky %s borders and glyphs at the equivalent element geometry without moving flow",
	(display) => {
		const shared = "#origin{width:360px;height:180px}#inside{color:blue}";
		const sticky = `position:sticky;top:10px;display:${display};width:40px;height:20px;background:red;color:lime;vertical-align:top`;
		const generated = fixture(
			`${shared}#origin::before{content:"AB";${sticky}}`,
			'<div id="before"></div><div id="origin"><span id="inside">CD</span></div><div id="after"></div>',
		);
		const regular = fixture(
			`${shared}#equivalent{${sticky}}`,
			'<div id="before"></div><div id="origin"><span id="equivalent">AB</span><span id="inside">CD</span></div><div id="after"></div>',
		);
		const inside = generated.documentRects("#inside");
		const sourceText = generated.tree.get(generated.id("#inside")).children[0];
		const range = domRangeOwner(regular.tree).createRange();
		range.selectNodeContents(
			regular.tree.get(regular.id("#equivalent")).children[0],
		);
		for (const [vertical, expectedTop] of [
			[0, 40],
			[80, 10],
			[200, 0],
		]) {
			generated.move(0, vertical);
			regular.move(0, vertical);
			expect(regular.rect("#equivalent")).toMatchObject({
				x: 0,
				y: expectedTop,
				width: 40,
				height: 20,
			});
			expect(rangeClientRects(range)).toMatchObject([
				{ x: 0, y: expectedTop + 1, width: 12, height: 8 },
			]);
			const capture = rasterizeDocument(generated.tree);
			expect(capture.image.pixels).toEqual(
				rasterizeDocument(regular.tree).image.pixels,
			);
			expect(pixel(capture.image, 30, expectedTop + 10)).toEqual([
				255, 0, 0, 255,
			]);
			let glyphPixels = 0;
			for (let row = expectedTop + 1; row < expectedTop + 9; row++)
				for (let column = 0; column < 12; column++) {
					const [red, green, blue, alpha] = pixel(capture.image, column, row);
					if (red === 0 && green === 255 && blue === 0 && alpha === 255)
						glyphPixels++;
				}
			expect(glyphPixels).toBeGreaterThan(0);
			expect(generated.hits.elementFromPoint(30, expectedTop + 10)).toBe(
				generated.id("#origin"),
			);
			expect(generated.documentRects("#inside")).toEqual(inside);
			expect(generated.documentRects("#after")[0].y).toBe(220);
			expect(generated.tree.get(sourceText).data).toBe("CD");
			expect(generated.tree.get(generated.id("#origin")).children).toHaveLength(
				1,
			);
		}
	},
);

it.each([
	[
		"atomic inline",
		"display:inline-block;vertical-align:top",
		'<span id="prefix"></span>',
		20,
		0,
	],
	["float", "float:right", "", 160, 200],
] as const)(
	"retains a sticky grid item's area after %s subtree relocation",
	(_kind, wrapperStyle, prefix, wrapperLeft, horizontal) => {
		const { tree, id, hits, rect, documentRects, move } = fixture(
			`#prefix{display:inline-block;vertical-align:top;width:20px;height:110px}#wrapper{width:200px;height:110px;${wrapperStyle}}#grid{display:grid;width:200px;height:100px;grid-template-columns:80px 120px;grid-template-rows:60px 40px}#target{grid-column:2;grid-row:1}#baseline{height:10px}#after{clear:both}`,
			`<div id="before"></div>${prefix}<div id="wrapper"><div id="grid"><div id="target"></div></div><div id="baseline">Z</div></div><div id="after"></div>`,
		);
		expect(rect("#wrapper")).toMatchObject({
			x: wrapperLeft,
			y: 40,
			width: 200,
			height: 110,
		});
		expect(rect()).toMatchObject({ x: wrapperLeft + 80, y: 40 });
		const following = documentRects("#after");
		const clientLeft = wrapperLeft + 80 - horizontal;
		for (const [vertical, expectedTop] of [
			[0, 40],
			[60, 10],
			[90, -10],
			[0, 40],
		]) {
			move(horizontal, vertical);
			expect(rect()).toMatchObject({
				x: clientLeft,
				y: expectedTop,
				width: 40,
				height: 20,
			});
			expect(documentRects()[0]).toMatchObject({
				x: wrapperLeft + 80,
				y: vertical + expectedTop,
			});
			expect(documentRects("#grid")[0]).toMatchObject({
				x: wrapperLeft,
				y: 40,
				width: 200,
				height: 100,
			});
			expect(documentRects("#after")).toEqual(following);
			const sampleTop = Math.max(0, expectedTop) + 5;
			expect(hits.elementFromPoint(clientLeft + 5, sampleTop)).toBe(
				id("#target"),
			);
			expect(
				pixel(rasterizeDocument(tree).image, clientLeft + 5, sampleTop),
			).toEqual([255, 0, 0, 255]);
		}
	},
);

it.each([
	["block", "\n", 11, 21],
	["block", "\r\n", 11, 21],
] as const)(
	"projects a sticky %s terminal %j break and its caret exactly once without shifting sibling glyphs",
	(display, separator, stuckGlyphTop, stuckCaretTop) => {
		const { tree, id, geometry, move } = fixture(
			`#text-host{width:200px;height:160px;white-space:pre-wrap}#target{display:${display};height:10px}`,
			'<div id="before"></div><div id="text-host"><span id="target">A</span><span id="next">B</span></div><div id="after"></div>',
		);
		const text = tree.get(id("#target")).children[0];
		const siblingText = tree.get(id("#next")).children[0];
		tree.setTextContent(text, `A${separator}`);
		const owner = domRangeOwner(tree);
		const glyph = owner.createRange();
		glyph.setStart(text, 0);
		glyph.setEnd(text, 1);
		const lineBreak = owner.createRange();
		lineBreak.setStart(text, 1);
		lineBreak.setEnd(text, 1 + separator.length);
		const sibling = owner.createRange();
		sibling.selectNodeContents(siblingText);
		owner.selection.collapse(text, 1);
		const caret = owner.selection.getRangeAt(0);
		for (const [vertical, expectedGlyphTop, expectedCaretTop] of [
			[0, 41, 51],
			[80, stuckGlyphTop, stuckCaretTop],
			[0, 41, 51],
		]) {
			move(0, vertical);
			expect(geometry.getClientRects(id("#target"))).toHaveLength(1);
			expect(rangeClientRects(glyph)).toMatchObject([
				{ x: 0, y: expectedGlyphTop, width: 6, height: 8 },
			]);
			expect(rangeClientRects(lineBreak)).toMatchObject([
				{ x: 6, y: expectedGlyphTop, width: 0, height: 8 },
			]);
			caret.setStart(text, 1);
			caret.collapse(true);
			expect(rangeBoundingClientRect(caret)).toMatchObject({
				x: 6,
				y: expectedGlyphTop,
				width: 0,
				height: 8,
			});
			if (separator === "\r\n") {
				caret.setStart(text, 2);
				caret.collapse(true);
				expect(rangeBoundingClientRect(caret)).toMatchObject({
					x: 6,
					y: expectedGlyphTop,
					width: 0,
					height: 8,
				});
			}
			caret.setStart(text, 1 + separator.length);
			caret.collapse(true);
			expect(rangeBoundingClientRect(caret)).toMatchObject({
				x: 0,
				y: expectedCaretTop,
				width: 0,
				height: 8,
			});
			expect(rangeClientRects(sibling)).toMatchObject([
				{ x: 0, y: 51 - vertical, width: 6, height: 8 },
			]);
			expect(owner.selection.getRangeAt(0)).toBe(caret);
			expect(lineBreak.toString()).toBe(separator);
			expect(tree.get(text).data).toBe(`A${separator}`);
			expect(tree.get(siblingText).data).toBe("B");
		}
	},
);

it.each(["\n", "\r\n"])(
	"rejects a sticky inline terminal %j break that creates multiple fragments",
	(separator) => {
		const { tree, id, geometry, hits } = fixture(
			"#text-host{width:200px;height:160px;white-space:pre-wrap}#target{position:static;display:inline}",
			'<div id="before"></div><div id="text-host"><span id="target">A</span><span>B</span></div>',
		);
		const text = tree.get(id("#target")).children[0];
		tree.setTextContent(text, `A${separator}`);
		expect(geometry.getClientRects(id("#target"))).toHaveLength(2);
		const range = domRangeOwner(tree).createRange();
		range.selectNodeContents(text);
		tree.setAttribute(id("#target"), "style", "position:sticky");
		for (const action of [
			() => geometry.getClientRects(id("#target")),
			() => rangeClientRects(range),
			() => hits.elementFromPoint(1, 41),
			() => rasterizeDocument(tree),
		])
			expect(action).toThrow("Multiline inline sticky positioning");
		expect(range.toString()).toBe(`A${separator}`);
	},
);

it.each(["\n", "\r\n"])(
	"moves single-line sticky inline glyphs without moving a following owner's %j break",
	(separator) => {
		const { tree, id, geometry, move } = fixture(
			"#text-host{width:200px;height:160px;white-space:pre-wrap}#target{display:inline}",
			'<div id="before"></div><div id="text-host"><span id="target">A</span><span id="next">B</span></div>',
		);
		const text = tree.get(id("#target")).children[0];
		const siblingText = tree.get(id("#next")).children[0];
		tree.setTextContent(siblingText, `${separator}B`);
		const owner = domRangeOwner(tree);
		const glyph = owner.createRange();
		glyph.selectNodeContents(text);
		const lineBreak = owner.createRange();
		lineBreak.setStart(siblingText, 0);
		lineBreak.setEnd(siblingText, separator.length);
		for (const [vertical, glyphTop] of [
			[0, 41],
			[80, 10],
			[0, 41],
		]) {
			move(0, vertical);
			expect(geometry.getClientRects(id("#target"))).toHaveLength(1);
			expect(rangeClientRects(glyph)).toMatchObject([
				{ x: 0, y: glyphTop, width: 6, height: 8 },
			]);
			expect(rangeClientRects(lineBreak)).toMatchObject([
				{ x: 6, y: 41 - vertical, width: 0, height: 8 },
			]);
			expect(lineBreak.toString()).toBe(separator);
		}
	},
);
