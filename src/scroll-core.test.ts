import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import {
	documentScroll,
	documentScrollPosition,
	viewportScrollLimits,
} from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import {
	DocumentElementOffsets,
	documentElementOffsets,
} from "./element-offsets.js";
import { documentElementSizes } from "./element-sizes.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(
	css = "",
	content = '<main><div id="first"></div><div id="target"></div><div id="last"></div></main>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}main{width:160px}main>div{height:60px}#first{background:red}#target{background:blue}#last{background:green}${css}</style>${content}`,
		"https://fixture.invalid/scroll-core",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 80);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error(`Missing ${selector}`);
		return result;
	};
	return {
		tree,
		id,
		geometry: documentGeometry(tree),
		scroll: documentScroll(tree),
		offsets: documentElementOffsets(tree),
	};
}
function pixel(image: RasterImage, column: number, row: number) {
	const start = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(start, start + 4));
}

it("keeps fractional viewport coordinates separate from immutable document boxes", () => {
	const { tree, id, geometry, scroll, offsets } = fixture();
	const target = id("#target");
	const saved = geometry.getClientRects(target);
	const before = offsets.get(target);
	const sizes = documentElementSizes(tree).get(target);
	expect(scroll.bounds()).toEqual({ x: 60, y: 100 });
	expect(scroll.to(12.5, 59.75)).toBe(true);
	expect(geometry.getClientRects(target)[0]).toMatchObject({
		x: -12.5,
		y: 0.25,
		width: 160,
		height: 60,
	});
	expect(geometry.getBoundingClientRect(target)).toEqual(
		geometry.getClientRects(target)[0],
	);
	expect(geometry.getDocumentRects(target)[0]).toMatchObject({ x: 0, y: 60 });
	expect(saved[0]).toMatchObject({ x: 0, y: 60 });
	expect(offsets.get(target)).toEqual(before);
	expect(documentElementSizes(tree).get(target)).toEqual(sizes);
	expect(Object.isFrozen(saved)).toBe(true);
});

it.each(["row", "row-reverse", "column", "column-reverse"])(
	"scrolls shared %s flex geometry without reapplying item placement",
	(direction) => {
		const { id, geometry, scroll, offsets } = fixture(
			`main{display:flex;flex-direction:${direction};width:160px;height:180px;gap:10px}main>div{flex:none;width:60px;height:60px}`,
		);
		const target = id("#target");
		const before = geometry.getBoundingClientRect(target);
		const offset = offsets.get(target);
		scroll.to(20, 40);
		expect(geometry.getBoundingClientRect(target)).toMatchObject({
			x: before.x - 20,
			y: before.y - 40,
			width: 60,
			height: 60,
		});
		expect(geometry.getDocumentRects(target)[0]).toEqual(before);
		expect(offsets.get(target)).toEqual(offset);
	},
);

it("measures relative offsets from the positioned parent's padding edge after scrolling", () => {
	const { id, geometry, scroll, offsets } = fixture(
		"main{position:relative;left:9px;top:13px;border:3px solid;padding:7px}#target{position:relative;left:5px;top:6px}",
	);
	scroll.to(20, 40);
	expect(offsets.get(id("#target"))).toEqual({
		offsetParent: id("main"),
		offsetLeft: 12,
		offsetTop: 73,
	});
	expect(geometry.getBoundingClientRect(id("#target"))).toMatchObject({
		x: 4,
		y: 49,
	});
});

it.each(["inline-block", "inline-flex"])(
	"retains first-box offsets for scrolled %s",
	(display) => {
		const { id, geometry, scroll, offsets } = fixture(
			`#target{display:${display};width:30px;height:20px}`,
			'<main><div id="first"></div><span id="target">A</span><div id="last"></div></main>',
		);
		const target = id("#target");
		const saved = geometry.getDocumentRects(target)[0];
		scroll.to(10, 25);
		expect(geometry.getClientRects(target)).toHaveLength(1);
		expect(geometry.getClientRects(target)[0]).toMatchObject({
			x: saved.x - 10,
			y: saved.y - 25,
		});
		expect(offsets.get(target)).toEqual({
			offsetParent: id("body"),
			offsetLeft: Math.round(saved.x),
			offsetTop: Math.round(saved.y),
		});
	},
);

it("paints the scrolled viewport but preserves explicit document clips and element crops", () => {
	const { tree, id, scroll } = fixture();
	scroll.to(20, 60);
	const viewport = rasterizeDocument(tree);
	expect(viewport.clip).toEqual({ x: 20, y: 60, width: 100, height: 80 });
	expect(pixel(viewport.image, 5, 5)).toEqual([0, 0, 255, 255]);
	const explicit = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 10, height: 10 },
	});
	expect(pixel(explicit.image, 5, 5)).toEqual([255, 0, 0, 255]);
	const element = rasterizeDocument(tree, {
		element: tree.reference(id("#target")),
	});
	expect(element.clip).toEqual({ x: 0, y: 60, width: 160, height: 60 });
	expect(pixel(element.image, 5, 5)).toEqual([0, 0, 255, 255]);
});

it("rejects a prepared capture after movement and prepares at the current origin", () => {
	const { tree, scroll } = fixture();
	const prepared = prepareDocumentRaster(tree);
	scroll.to(0, 60);
	expect(() => prepared.rasterize()).toThrow(/stale/);
	const current = prepareDocumentRaster(tree);
	expect(current.rasterize().clip.y).toBe(60);
	expect(scroll.to(0, 60)).toBe(false);
	expect(current.rasterize().clip.y).toBe(60);
});

it("clamps a stale scroll origin before rebuilding capture after document shrink", () => {
	const { tree, id, scroll, geometry } = fixture();
	scroll.to(60, 100);
	tree.setAttribute(id("main"), "style", "width:80px");
	tree.setAttribute(id("#last"), "style", "display:none");
	const prepared = prepareDocumentRaster(tree);
	expect(prepared.rasterize().clip).toEqual({
		x: 0,
		y: 40,
		width: 100,
		height: 80,
	});
	expect(scroll.get()).toEqual({ x: 0, y: 40 });
	expect(geometry.getBoundingClientRect(id("#target"))).toMatchObject({
		x: 0,
		y: 20,
		width: 80,
	});
});

it("reclamps scroll after viewport growth without changing document offsets", () => {
	const { tree, id, scroll, offsets, geometry } = fixture();
	scroll.to(60, 100);
	documentStyles(tree).setViewport(200, 200);
	expect(geometry.getBoundingClientRect(id("#target"))).toMatchObject({
		x: 0,
		y: 60,
	});
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
	expect(offsets.get(id("#target")).offsetTop).toBe(60);
});

it.each(["display:none", "display:contents"])(
	"does not translate a boxless element's zero bounds: %s",
	(style) => {
		const { tree, id, geometry, scroll, offsets } = fixture();
		scroll.to(20, 60);
		tree.setAttribute(id("#target"), "style", style);
		expect(geometry.getClientRects(id("#target"))).toEqual([]);
		expect(geometry.getBoundingClientRect(id("#target"))).toMatchObject({
			x: 0,
			y: 0,
			width: 0,
			height: 0,
		});
		expect(offsets.get(id("#target"))).toEqual({
			offsetParent: null,
			offsetTop: 0,
			offsetLeft: 0,
		});
	},
);

it("translates an empty inline box but not a disconnected element", () => {
	const { tree, id, geometry, scroll } = fixture(
		"",
		'<main><div id="first"></div><span id="target"></span><div id="last"></div></main>',
	);
	const before = geometry.getClientRects(id("#target"))[0];
	scroll.to(10, 20);
	expect(geometry.getBoundingClientRect(id("#target"))).toMatchObject({
		x: before.x - 10,
		y: before.y - 20,
		width: 0,
	});
	const target = id("#target");
	tree.remove(target);
	expect(geometry.getBoundingClientRect(target)).toMatchObject({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});
});

it.each([
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	"1",
	null,
])(
	"rejects invalid native scroll coordinates without mutation: %s",
	(value) => {
		const { tree, scroll } = fixture();
		scroll.to(10, 20);
		const revision = tree.revision;
		expect(() => scroll.to(value as number, 0)).toThrow();
		expect(() => scroll.by(0, value as number)).toThrow();
		expect(scroll.get()).toEqual({ x: 10, y: 20 });
		expect(tree.revision).toBe(revision);
	},
);

it("caches offset reads per revision and releases records on document closure", () => {
	const { tree, id, offsets, scroll, geometry } = fixture();
	const target = id("#target");
	const value = offsets.get(target);
	const measurements = offsets.metrics().measurements;
	for (let index = 0; index < 100; index++)
		expect(offsets.get(target)).toBe(value);
	expect(offsets.metrics().measurements).toBe(measurements);
	tree.close();
	expect(offsets.metrics().retained).toBe(0);
	expect(() => offsets.get(target)).toThrow(/closed/);
	expect(() => scroll.get()).toThrow(/closed/);
	expect(() => geometry.getDocumentRects(target)).toThrow(/closed/);
	expect(() => documentScrollPosition(tree)).toThrow(/closed/);
});

it("bounds offset traversal and scroll update admission", () => {
	const { tree, id, scroll } = fixture();
	const bounded = new DocumentElementOffsets(tree, { maxWork: 1 });
	expect(() => bounded.get(id("#target"))).toThrow(/work limit/);
	for (let index = 0; index < viewportScrollLimits.maxUpdates; index++)
		scroll.to(0, 0);
	expect(() => scroll.to(1, 1)).toThrow(/update limit/);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it.each(["position:absolute", "display:grid", "overflow:hidden"])(
	"rejects unsupported layout and recovers after reset: %s",
	(style) => {
		const { tree, id, offsets, scroll } = fixture();
		tree.setAttribute(id("main"), "style", style);
		expect(() => offsets.get(id("#target"))).toThrow();
		expect(() => scroll.get()).toThrow();
		tree.setAttribute(id("main"), "style", "");
		expect(offsets.get(id("#target")).offsetTop).toBe(60);
		expect(scroll.bounds()).toEqual({ x: 60, y: 100 });
	},
);

it.each(["table", "td", "th"])(
	"skips a static %s ancestor for a relatively positioned target",
	(tag) => {
		const content =
			tag === "table"
				? '<table id="parent"><caption><div id="target"></div></caption></table>'
				: `<table><tr><${tag} id="parent"><div id="target"></div></${tag}></tr></table>`;
		const { tree, id, offsets } = fixture(
			"table,tbody,tr,td,th,caption{display:block}#target{width:20px;height:20px}",
			content,
		);
		expect(offsets.get(id("#target")).offsetParent).toBe(id("#parent"));
		tree.setAttribute(
			id("#target"),
			"style",
			"position:relative;left:4px;top:5px",
		);
		expect(offsets.get(id("#target"))).toEqual({
			offsetParent: id("body"),
			offsetLeft: 4,
			offsetTop: 5,
		});
		tree.setAttribute(
			id("#parent"),
			"style",
			"position:relative;padding:3px;border:2px solid",
		);
		expect(offsets.get(id("#target"))).toEqual({
			offsetParent: id("#parent"),
			offsetLeft: 7,
			offsetTop: 8,
		});
	},
);
