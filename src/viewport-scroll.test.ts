import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import {
	documentScroll,
	documentScrollPosition,
	viewportScrollLimits,
} from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { documentElementOffsets } from "./element-offsets.js";
import { documentElementSizes } from "./element-sizes.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { BrowserMouseEvent, BrowserWheelEvent } from "./mouse.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
function fixture(
	content = '<main><div id="a"></div><div id="b"></div><div id="c"></div></main>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}main{width:160px}#a,#b,#c{height:60px}#a{background:red}#b{background:blue}#c{background:green}${css}</style>${content}`,
		"https://fixture.invalid/scroll",
	);
	trees.push(tree);
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
		scroll: documentScroll(tree),
		actions: documentInteractions(tree),
		geometry: documentGeometry(tree),
		hits: documentHitTesting(tree),
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("derives both scroll axes from native normal-flow extents", () => {
	const { scroll } = fixture();
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
	expect(scroll.bounds()).toEqual({ x: 60, y: 100 });
	expect(scroll.to(20, 60)).toBe(true);
	expect(scroll.get()).toEqual({ x: 20, y: 60 });
});

it("clamps positive and negative movement and retains fractional CSS pixels", () => {
	const { scroll } = fixture();
	scroll.to(0.5, 10.25);
	expect(scroll.get()).toEqual({ x: 0.5, y: 10.25 });
	scroll.by(1_000_000, 1_000_000);
	expect(scroll.get()).toEqual({ x: 60, y: 100 });
	scroll.by(-1_000_000, -1_000_000);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it.each([
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	"2",
	null,
])("rejects invalid native coordinate %s before movement", (value) => {
	const { scroll } = fixture();
	expect(() => scroll.to(value as number, 10)).toThrow();
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("translates client rectangles without moving document rectangles or saved snapshots", () => {
	const { tree, scroll, geometry, id } = fixture();
	const saved = geometry.getClientRects(id("#b"));
	scroll.to(20, 60);
	expect(geometry.getBoundingClientRect(id("#b"))).toMatchObject({
		x: -20,
		y: 0,
		width: 160,
		height: 60,
	});
	expect(geometry.getDocumentRects(id("#b"))[0]).toMatchObject({ x: 0, y: 60 });
	expect(saved[0]).toMatchObject({ x: 0, y: 60 });
	const hidden = tree.createElement("div", { style: "display:none" });
	tree.append(id("main"), hidden);
	expect(geometry.getBoundingClientRect(hidden)).toMatchObject({
		x: 0,
		y: 0,
		width: 0,
		height: 0,
	});
});

it("keeps offset parent coordinates and box sizes independent of viewport scroll", () => {
	const { tree, scroll, id } = fixture();
	const offsets = documentElementOffsets(tree);
	const sizes = documentElementSizes(tree);
	const before = offsets.get(id("#b"));
	const size = sizes.get(id("#b"));
	scroll.to(20, 60);
	expect(offsets.get(id("#b"))).toEqual(before);
	expect(sizes.get(id("#b"))).toEqual(size);
});

it("keeps rootless offset coordinates in document space", () => {
	const { tree, scroll, id } = fixture(
		'<main><div id="a"></div><div id="b"></div><div id="c"></div></main>',
	);
	const body = id("body");
	const main = id("main");
	tree.append(id("html"), main);
	tree.remove(body);
	const offsets = documentElementOffsets(tree);
	const before = offsets.get(id("#b"));
	expect(before.offsetParent).toBeNull();
	scroll.to(0, 60);
	expect(offsets.get(id("#b"))).toEqual(before);
});

it("uses viewport coordinates for hit testing and changes the actual target", () => {
	const { scroll, hits, id } = fixture();
	expect(hits.elementFromPoint(5, 5)).toBe(id("#a"));
	scroll.to(0, 60);
	expect(hits.elementFromPoint(5, 5)).toBe(id("#b"));
	expect(hits.elementsFromPoint(5, 5)[0]).toBe(id("#b"));
	expect(hits.elementFromPoint(-1, 5)).toBeNull();
	expect(hits.elementFromPoint(101, 5)).toBeNull();
});

it("captures the scrolled viewport but keeps explicit clips and element captures in document coordinates", () => {
	const { tree, scroll, id } = fixture();
	const red = rasterizeDocument(tree);
	scroll.to(0, 60);
	const blue = rasterizeDocument(tree);
	expect(blue.clip).toEqual({ x: 0, y: 60, width: 100, height: 80 });
	expect([...blue.image.pixels.slice(0, 4)]).toEqual([0, 0, 255, 255]);
	expect([...red.image.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
	expect(rasterizeDocument(tree, { clip: red.clip }).image.pixels).toEqual(
		red.image.pixels,
	);
	expect(
		rasterizeDocument(tree, { element: tree.reference(id("#c")) }).clip,
	).toEqual({ x: 0, y: 120, width: 160, height: 60 });
});

it("invalidates prepared captures when scrolling changes presentation", () => {
	const { tree, scroll } = fixture();
	const prepared = prepareDocumentRaster(tree);
	scroll.to(0, 60);
	expect(() => prepared.rasterize()).toThrow("stale");
	expect(prepareDocumentRaster(tree).rasterize().clip.y).toBe(60);
});

it("preserves revision and cached bounds on no-op movement", () => {
	const { tree, scroll } = fixture();
	scroll.to(0, 0);
	const revision = tree.revision;
	const builds = scroll.metrics().builds;
	expect(scroll.to(-1, -1)).toBe(false);
	expect(tree.revision).toBe(revision);
	expect(scroll.metrics().builds).toBe(builds);
});

it("clamps after viewport growth before exposing client geometry", () => {
	const { tree, scroll, geometry, id } = fixture();
	scroll.to(60, 100);
	documentStyles(tree).setViewport(200, 200);
	expect(geometry.getBoundingClientRect(id("#b")).y).toBe(60);
	expect(scroll.get()).toEqual({ x: 0, y: 0 });
});

it("clamps after content removal and uses new extents after insertion", () => {
	const { tree, scroll, id } = fixture();
	scroll.to(0, 100);
	tree.remove(id("#c"));
	expect(scroll.get().y).toBe(40);
	tree.setAttribute(id("#b"), "style", "height:200px");
	expect(scroll.bounds().y).toBe(180);
	scroll.to(0, 100);
	expect(scroll.get().y).toBe(100);
});

it("counts unbreakable text overflow rather than only block widths", () => {
	const { scroll } = fixture(
		`<main>${"X".repeat(40)}</main>`,
		"main{width:100px;font-size:8px;line-height:12px}",
	);
	expect(scroll.bounds().x).toBe(140);
});

it("includes overflow below a fixed-height block", () => {
	const { scroll } = fixture(undefined, "main{height:20px}");
	expect(scroll.bounds().y).toBe(100);
});

it("includes the last inline fragment's trailing margin", () => {
	const { scroll } = fixture(
		"<main><span>xx</span></main>",
		"main{width:100px;font-size:8px;line-height:12px}span{margin-right:120px}",
	);
	expect(scroll.bounds().x).toBe(32);
});

it("retains border overflow with negative trailing margins", () => {
	const { scroll } = fixture(
		"<main></main>",
		"main{width:160px;height:180px;margin-right:-40px;margin-bottom:-40px}",
	);
	expect(scroll.bounds()).toEqual({ x: 60, y: 100 });
});

it("does not retain scroll state across documents or closure", () => {
	const first = fixture();
	const second = fixture();
	first.scroll.to(20, 60);
	expect(documentScrollPosition(second.tree)).toEqual({ x: 0, y: 0 });
	first.tree.close();
	expect(first.scroll.metrics()).toMatchObject({ x: 0, y: 0, closed: true });
	expect(() => first.scroll.get()).toThrow("closed");
});

it("bounds updates even when every request is a no-op", () => {
	const { scroll } = fixture();
	for (let index = 0; index < viewportScrollLimits.maxUpdates; index++)
		scroll.to(0, 0);
	expect(() => scroll.to(0, 0)).toThrow("update limit");
});

it("wheel dispatch precedes root scrolling and emits a bubbling noncancelable scroll event", () => {
	const { tree, actions, scroll, id } = fixture();
	actions.mouse.move(5, 5);
	const trace: unknown[] = [];
	actions.events.addEventListener(id("#a"), "wheel", (event) => {
		expect(event).toBeInstanceOf(BrowserWheelEvent);
		trace.push([
			event.type,
			scroll.get().y,
			event.bubbles,
			event.cancelable,
			event.composed,
		]);
	});
	actions.events.addEventListener(tree.root, "scroll", (event) =>
		trace.push([
			event.type,
			scroll.get().y,
			event.bubbles,
			event.cancelable,
			event.composed,
		]),
	);
	expect(actions.mouse.wheel(0, 60)).toMatchObject({
		canceled: false,
		scroll: { x: 0, y: 60 },
		buttons: 0,
	});
	expect(trace).toEqual([
		["wheel", 0, true, true, true],
		["scroll", 60, true, false, false],
	]);
	expect(actions.focus.active()).toBeNull();
});

it("canceled wheel does not scroll or send scroll notifications", () => {
	const { tree, actions, scroll, id } = fixture();
	actions.mouse.move(5, 5);
	let notifications = 0;
	actions.events.addEventListener(id("#a"), "wheel", (event) =>
		event.preventDefault(),
	);
	actions.events.addEventListener(tree.root, "scroll", () => notifications++);
	expect(actions.mouse.wheel(0, 60).canceled).toBe(true);
	expect(scroll.get().y).toBe(0);
	expect(notifications).toBe(0);
});

it("wheel fields and saved mouse page coordinates use dispatch-time scroll offsets", () => {
	const { tree, actions, scroll, id } = fixture();
	scroll.to(20, 60);
	actions.mouse.move(5, 5);
	const events: BrowserMouseEvent[] = [];
	actions.events.addEventListener(id("#b"), "wheel", (event) => {
		if (event instanceof BrowserMouseEvent) events.push(event);
	});
	actions.mouse.wheel(1.5, 2.25);
	expect(events[0]).toMatchObject({
		deltaX: 1.5,
		deltaY: 2.25,
		deltaZ: 0,
		deltaMode: 0,
		clientX: 5,
		clientY: 5,
		pageX: 25,
		pageY: 65,
	});
	scroll.to(0, 0);
	expect(events[0].pageY).toBe(65);
	expect(tree.revision).toBeGreaterThan(0);
});

it("refreshes hover after scrolling beneath a stationary pointer", () => {
	const { tree, actions, id } = fixture();
	actions.mouse.move(5, 5);
	const trace: string[] = [];
	for (const type of ["mouseout", "mouseover"])
		actions.events.addEventListener(tree.root, type, (event) =>
			trace.push(`${event.type}:${event.target}`),
		);
	actions.mouse.wheel(0, 60);
	expect(trace).toEqual([`mouseout:${id("#a")}`, `mouseover:${id("#b")}`]);
});

it("zero and endpoint wheel movements emit no scroll event", () => {
	const { tree, actions, scroll } = fixture();
	let count = 0;
	actions.events.addEventListener(tree.root, "scroll", () => count++);
	actions.mouse.wheel(0, 0);
	actions.mouse.wheel(0, 1000);
	expect(scroll.get().y).toBe(100);
	actions.mouse.wheel(0, 1);
	expect(count).toBe(1);
});

it.each(["Control", "Meta", "Alt", "Shift"])(
	"%s wheel is not silently treated as plain scrolling",
	(key) => {
		const { actions, scroll, id } = fixture();
		actions.mouse.move(5, 5);
		actions.keyboard.down(key);
		expect(() => actions.mouse.wheel(0, 60)).toThrow("Modified wheel");
		expect(scroll.get().y).toBe(0);
		actions.events.addEventListener(id("#a"), "wheel", (event) =>
			event.preventDefault(),
		);
		expect(actions.mouse.wheel(0, 60).canceled).toBe(true);
	},
);

it.each([Number.NaN, Number.POSITIVE_INFINITY, 1_000_001, "2"])(
	"rejects invalid wheel delta %s without events",
	(delta) => {
		const { tree, actions, scroll } = fixture();
		let count = 0;
		actions.events.addEventListener(tree.root, "wheel", () => count++);
		expect(() => actions.mouse.wheel(0, delta as number)).toThrow("deltas");
		expect(scroll.get().y).toBe(0);
		expect(count).toBe(0);
	},
);

it("does not scroll when the pointer is outside the viewport", () => {
	const { actions, scroll } = fixture();
	actions.mouse.move(-1, 5);
	expect(actions.mouse.wheel(0, 60).reference).toBeNull();
	expect(scroll.get().y).toBe(0);
});

it("uses post-wheel-listener content extents for clamping", () => {
	const { tree, actions, scroll, id } = fixture();
	actions.events.addEventListener(id("#a"), "wheel", () =>
		tree.remove(id("#c")),
	);
	actions.mouse.wheel(0, 1000);
	expect(scroll.get().y).toBe(40);
});

it("awaits asynchronous wheel cancellation through controlled native dispatch", async () => {
	const { actions, scroll, id } = fixture();
	actions.events.addEventListener(id("#a"), "wheel", (event) =>
		event.preventDefault(),
	);
	expect((await actions.mouse.wheelAsync(0, 60)).canceled).toBe(true);
	expect(scroll.get().y).toBe(0);
});

it("closure during wheel dispatch prevents its default", () => {
	const { tree, actions, id } = fixture();
	actions.events.addEventListener(id("#a"), "wheel", () => tree.close());
	expect(() => actions.mouse.wheel(0, 60)).toThrow("closed");
});

it("rejects position reads after closing a never-scrolled document", () => {
	const tree = parseHtmlDocument(
		"<p>Unscrolled</p>",
		"https://fixture.invalid/",
	);
	trees.push(tree);
	expect(documentScrollPosition(tree)).toEqual({ x: 0, y: 0 });
	tree.close();
	expect(() => documentScrollPosition(tree)).toThrow("closed");
});
