import { afterEach, expect, it } from "vitest";
import { findClickPoint } from "./click-target.js";
import { type ClientRectangle, documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { documentElementScroll } from "./element-scroll.js";
import { runEventAction } from "./event-actions.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { rangeBoundingClientRect, rangeClientRects } from "./range-geometry.js";
import type { RasterImage } from "./raster.js";
import { documentScrollIntoView } from "./scroll-into-view.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const white = [255, 255, 255, 255];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(css = "", content = "ABCDE") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}#host{width:160px;height:120px;padding:20px}#outer{width:80px;height:50px;overflow:auto;background:blue}#inner{margin-left:30px;margin-top:20px;width:100px;height:80px;overflow:hidden;background:lime}#content{width:180px;height:140px;background:red}#tail{height:100px}${css}</style><main id="host"><div id="outer"><div id="inner"><div id="content" tabindex="0">${content}</div></div></div></main><div id="tail"></div>`,
		"https://fixture.invalid/overflow-edge",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 160);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const text = (selector = "#content") => {
		const found = tree
			.get(id(selector))
			.children.find((child) => tree.get(child).kind === "text");
		if (found === undefined) throw new Error(`Missing text in ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		text,
		range: domRangeOwner(tree).createRange(),
		geometry: documentGeometry(tree),
		scroll: documentElementScroll(tree),
		root: documentScroll(tree),
		hits: documentHitTesting(tree),
	};
}

function translated(
	rect: ClientRectangle,
	horizontal: number,
	vertical: number,
) {
	return {
		...rect,
		x: rect.x - horizontal,
		left: rect.left - horizontal,
		right: rect.right - horizontal,
		y: rect.y - vertical,
		top: rect.top - vertical,
		bottom: rect.bottom - vertical,
	};
}

function pixel(image: RasterImage, horizontal: number, vertical: number) {
	const offset = (vertical * image.width + horizontal) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function exposedEdge() {
	return fixture(
		"#outer{width:40px;height:30px}#inner{margin:0;width:40px;height:30px;overflow:visible}#content{margin-left:30px;width:80px;height:20px}",
		"",
	);
}

it("translates a partial text range through one scroll offset without clipping it", () => {
	const { id, text, range, geometry, scroll } = fixture();
	range.setStart(text(), 1);
	range.setEnd(text(), 4);
	const before = rangeClientRects(range);
	expect(before).toMatchObject([{ x: 56, y: 41, width: 18, height: 8 }]);
	expect(scroll.to(id("#inner"), 11, 13)).toBe(true);
	const after = rangeClientRects(range);
	expect(after).toEqual(before.map((rect) => translated(rect, 11, 13)));
	expect(after[0].left).toBeLessThan(
		geometry.getBoundingClientRect(id("#inner")).left,
	);
	expect(after[0].width).toBe(18);
	expect(before[0]).toMatchObject({ x: 56, y: 41 });
});

it("composes two element scroll offsets and root scrolling for range rectangles", () => {
	const { id, text, range, geometry, scroll, root } = fixture();
	range.selectNodeContents(text());
	const before = rangeClientRects(range);
	expect(before).toMatchObject([{ x: 50, y: 41, width: 30, height: 8 }]);
	expect(scroll.to(id("#inner"), 11, 13)).toBe(true);
	expect(scroll.to(id("#outer"), 7, 9)).toBe(true);
	expect(rangeClientRects(range)).toEqual(
		before.map((rect) => translated(rect, 18, 22)),
	);
	expect(rangeBoundingClientRect(range).top).toBeLessThan(
		geometry.getBoundingClientRect(id("#outer")).top,
	);
	expect(root.to(0, 5)).toBe(true);
	expect(rangeClientRects(range)).toEqual(
		before.map((rect) => translated(rect, 18, 27)),
	);
	expect(range.startOffset).toBe(0);
	expect(range.endOffset).toBe(5);
});

it.each([false, true])(
	"retains a zero-width caret after nested element scrolling: %s",
	(nested) => {
		const { id, text, range, scroll } = fixture();
		range.setStart(text(), 2);
		range.collapse(true);
		const before = rangeClientRects(range);
		expect(before).toMatchObject([{ x: 62, y: 41, width: 0, height: 8 }]);
		scroll.to(id("#inner"), 11, 13);
		if (nested) scroll.to(id("#outer"), 7, 9);
		expect(rangeClientRects(range)).toEqual(
			before.map((rect) =>
				translated(rect, nested ? 18 : 11, nested ? 22 : 13),
			),
		);
		expect(rangeBoundingClientRect(range)).toMatchObject({
			width: 0,
			height: 8,
		});
		expect(range.collapsed).toBe(true);
	},
);

it("keeps text following a hard br in the composed scroll coordinate frame", () => {
	const { id, text, range, scroll } = fixture(
		"",
		'<span id="first">AB</span><br><span id="second">CD</span>',
	);
	range.selectNodeContents(text("#second"));
	const before = rangeClientRects(range);
	expect(before).toMatchObject([{ x: 50, y: 51, width: 12, height: 8 }]);
	scroll.to(id("#inner"), 11, 13);
	scroll.to(id("#outer"), 7, 9);
	expect(rangeClientRects(range)).toEqual(
		before.map((rect) => translated(rect, 18, 22)),
	);
	range.collapse(true);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 32,
		y: 29,
		width: 0,
		height: 8,
	});
});

it("projects preserved segment-break rectangles and the caret after the break", () => {
	const { id, text, range, scroll } = fixture(
		"#content{white-space:pre-wrap}",
		"A\nB",
	);
	range.selectNodeContents(text());
	const before = rangeClientRects(range);
	expect(before).toMatchObject([
		{ x: 50, y: 41, width: 6, height: 8 },
		{ x: 50, y: 51, width: 6, height: 8 },
	]);
	scroll.to(id("#inner"), 11, 13);
	scroll.to(id("#outer"), 7, 9);
	expect(rangeClientRects(range)).toEqual(
		before.map((rect) => translated(rect, 18, 22)),
	);
	range.setStart(text(), 2);
	range.collapse(true);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 32,
		y: 29,
		width: 0,
		height: 8,
	});
});

it("retains every wrapped split-inline range fragment beyond the visible clip", () => {
	const { id, text, range, scroll } = fixture(
		"#content{width:18px}",
		'<span id="first">AB CD</span><span id="second"> EF</span>',
	);
	range.setStart(text("#first"), 1);
	range.setEnd(text("#second"), 3);
	const before = rangeClientRects(range);
	expect(before.length).toBeGreaterThanOrEqual(3);
	scroll.to(id("#inner"), 0, 30);
	scroll.to(id("#outer"), 7, 9);
	const after = rangeClientRects(range);
	expect(after).toEqual(before.map((rect) => translated(rect, 7, 39)));
	expect(after[0].top).toBeLessThan(20);
	expect(rangeBoundingClientRect(range).height).toBeGreaterThan(8);
});

it("clicks an exposed edge when the target center is clipped by its scrollport", async () => {
	const { tree, id, geometry, hits, scroll } = exposedEdge();
	const target = id("#content");
	const rectangle = geometry.getBoundingClientRect(target);
	expect(rectangle).toMatchObject({ x: 50, y: 20, width: 80, height: 20 });
	expect(
		hits.elementFromPoint(
			(rectangle.left + rectangle.right) / 2,
			(rectangle.top + rectangle.bottom) / 2,
		),
	).not.toBe(target);
	const result = findClickPoint(tree, target);
	expect(result.point).toBeDefined();
	if (!result.point)
		throw new Error(`Missing exposed point: ${result.blocked}`);
	expect(result.point.x).toBeGreaterThanOrEqual(50);
	expect(result.point.x).toBeLessThan(60);
	expect(hits.elementFromPoint(result.point.x, result.point.y)).toBe(target);
	const actions = documentInteractions(tree);
	let clicks = 0;
	actions.events.addEventListener(target, "click", () => clicks++);
	await actions.mouse.clickTargetAsync(tree.reference(target), result.point);
	expect(clicks).toBe(1);
	expect(scroll.get(id("#outer")).scrollLeft).toBe(0);
	expect(geometry.getBoundingClientRect(target)).toEqual(rectangle);
});

it("reveals an oversized clipped target and reselects a real exposed click point", async () => {
	const { tree, id, geometry, hits, scroll, root } = exposedEdge();
	const target = id("#content");
	const actions = documentInteractions(tree);
	const result = runEventAction(
		actions.events,
		documentScrollIntoView(tree).action(target, {
			block: "nearest",
			inline: "nearest",
			container: "nearest",
		}),
	);
	expect(result).toMatchObject({ hasBox: true, changed: true });
	expect(scroll.get(id("#outer")).scrollLeft).toBe(30);
	expect(root.get()).toEqual({ x: 0, y: 0 });
	expect(geometry.getBoundingClientRect(target)).toMatchObject({
		x: 20,
		width: 80,
	});
	const point = findClickPoint(tree, target).point;
	if (!point) throw new Error("Missing revealed edge point");
	expect(point.x).toBeGreaterThanOrEqual(20);
	expect(point.x).toBeLessThan(60);
	expect(hits.elementFromPoint(point.x, point.y)).toBe(target);
	let clicks = 0;
	actions.events.addEventListener(target, "click", () => clicks++);
	await actions.mouse.clickTargetAsync(tree.reference(target), point);
	expect(clicks).toBe(1);
});

it("programmatically scrolls hidden overflow without allowing direct user scrolling", () => {
	const { tree, id, scroll, geometry } = fixture();
	const inner = id("#inner");
	expect(scroll.allows(inner)).toEqual({ x: true, y: true });
	expect(scroll.allows(inner, true)).toEqual({ x: false, y: false });
	expect(scroll.userBy(inner, 20, 30)).toBe(false);
	expect(scroll.to(inner, 20, 30)).toBe(true);
	expect(scroll.get(inner)).toMatchObject({ scrollLeft: 20, scrollTop: 30 });
	expect(geometry.getBoundingClientRect(id("#content"))).toMatchObject({
		x: 30,
		y: 10,
		width: 180,
		height: 140,
	});
	const image = rasterizeDocument(tree).image;
	expect(pixel(image, 60, 50)).toEqual(red);
	expect(pixel(image, 105, 50)).toEqual(white);
});

it("scrolls a visibility-hidden port while retaining its visible descendant override", () => {
	const { tree, id, scroll, hits, geometry } = fixture(
		"#inner{overflow:auto;visibility:hidden}#content{visibility:visible}",
	);
	const inner = id("#inner");
	expect(scroll.allows(inner, true)).toEqual({ x: false, y: false });
	expect(scroll.userBy(inner, 20, 30)).toBe(false);
	expect(scroll.to(inner, 20, 30)).toBe(true);
	expect(geometry.getBoundingClientRect(id("#content"))).toMatchObject({
		x: 30,
		y: 10,
	});
	expect(hits.elementFromPoint(60, 50)).toBe(id("#content"));
	expect(hits.elementFromPoint(105, 50)).not.toBe(id("#content"));
	expect(pixel(rasterizeDocument(tree).image, 60, 50)).toEqual(red);
	expect(findClickPoint(tree, id("#content")).point).toBeDefined();
});

it("clears obsolete nested scroll offsets and clipping after overflow is removed", () => {
	const { tree, id, scroll, geometry } = fixture();
	const inner = id("#inner");
	const outer = id("#outer");
	scroll.to(inner, 20, 30);
	scroll.to(outer, 7, 9);
	const prepared = prepareDocumentRaster(tree);
	expect(pixel(rasterizeDocument(tree).image, 160, 80)).toEqual(white);
	tree.setAttribute(inner, "style", "overflow:visible");
	tree.setAttribute(outer, "style", "overflow:visible");
	expect(() => prepared.rasterize()).toThrow("stale");
	for (const target of [inner, outer]) {
		expect(scroll.get(target)).toMatchObject({ scrollLeft: 0, scrollTop: 0 });
		expect(scroll.bounds(target)).toEqual({ x: 0, y: 0 });
	}
	expect(geometry.getBoundingClientRect(id("#content"))).toMatchObject({
		x: 50,
		y: 40,
	});
	expect(pixel(rasterizeDocument(tree).image, 160, 80)).toEqual(red);
});

it("removes detached port paint and geometry and resumes explicit scrolling on reattachment", () => {
	const { tree, id, scroll, geometry } = fixture();
	const inner = id("#inner");
	const outer = id("#outer");
	const content = id("#content");
	scroll.to(inner, 20, 30);
	tree.remove(inner);
	expect(scroll.get(inner)).toEqual({
		scrollLeft: 0,
		scrollTop: 0,
		scrollWidth: 0,
		scrollHeight: 0,
	});
	expect(scroll.bounds(inner)).toEqual({ x: 0, y: 0 });
	expect(scroll.to(inner, 10, 15)).toBe(false);
	expect(geometry.getClientRects(inner)).toEqual([]);
	expect(geometry.getClientRects(content)).toEqual([]);
	expect(pixel(rasterizeDocument(tree).image, 60, 50)).toEqual(blue);
	tree.append(outer, inner);
	scroll.to(inner, 10, 15);
	expect(scroll.get(inner)).toMatchObject({ scrollLeft: 10, scrollTop: 15 });
	expect(geometry.getBoundingClientRect(content)).toMatchObject({
		x: 40,
		y: 25,
	});
	expect(pixel(rasterizeDocument(tree).image, 60, 50)).toEqual(red);
});

it("revokes nested scroll, range, geometry and paint handles on document closure", () => {
	const { tree, id, text, range, scroll, geometry } = fixture();
	const inner = id("#inner");
	const content = id("#content");
	range.selectNodeContents(text());
	scroll.to(inner, 20, 30);
	rangeClientRects(range);
	rasterizeDocument(tree);
	tree.close();
	for (const action of [
		() => scroll.get(inner),
		() => scroll.to(inner, 0, 0),
		() => rangeClientRects(range),
		() => geometry.getBoundingClientRect(content),
		() => rasterizeDocument(tree),
	])
		expect(action).toThrow(expect.objectContaining({ code: "closed" }));
});

it.each([
	["table", '<table id="special"><tr><td>text</td></tr></table>'],
	["control", '<input id="special" value="text">'],
	["replaced image", '<img id="special" width="20" height="20">'],
])("retains the explicit own overflow:clip guard for a %s", (_kind, markup) => {
	const { tree, id, geometry } = fixture("#special{overflow:clip}", markup);
	expect(
		buildFormattingTree(tree).issues["overflow-layout-not-supported"],
	).toBeGreaterThan(0);
	for (const action of [
		() => geometry.getBoundingClientRect(id("#special")),
		() => rasterizeDocument(tree),
	])
		expect(action).toThrow(expect.objectContaining({ code: "unsupported" }));
});
