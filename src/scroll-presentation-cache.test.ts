import { afterEach, expect, it } from "vitest";
import { controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentLimits, DocumentTree } from "./document.js";
import { runEventAction } from "./event-actions.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import { documentScrollIntoView } from "./scroll-into-view.js";
import { DocumentQueries } from "./selectors.js";
import { type DocumentStyles, documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const cacheNames = ["get", "text", "box", "paint"] as const;

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	markup = '<main id="main"><div id="top"></div><div id="middle"></div><div id="bottom"></div></main>',
	css = "",
	limits: Partial<DocumentLimits> = {},
) {
	const tree = parseHtmlDocument(
		`<style id="sheet">html,body{margin:0;padding:0}main{width:240px;height:320px;font-size:10px;color:purple}#top,#middle{height:80px}#bottom{height:160px}#top{background:red}#middle{background:blue}#bottom{background:green}${css}</style>${markup}`,
		"https://fixture.invalid/scroll-presentation",
		{ limits },
	);
	trees.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(120, 80);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#main") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		main: id(),
		scroll: documentScroll(tree),
		geometry: documentGeometry(tree),
		hits: documentHitTesting(tree),
		actions: documentInteractions(tree),
	};
}

function cache(styles: DocumentStyles, target: number) {
	return {
		get: styles.get(target),
		text: styles.text(target),
		box: styles.box(target),
		paint: styles.paint(target),
	};
}

function sameCache(
	styles: DocumentStyles,
	target: number,
	before: ReturnType<typeof cache>,
) {
	const after = cache(styles, target);
	for (const name of cacheNames) expect(after[name]).toBe(before[name]);
}

function pixel(
	image: { width: number; pixels: Uint8Array },
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("records four sampled root moves without the baseline four extra cascades or cache replacements", () => {
	const test = fixture('<main id="main"></main>');
	test.scroll.get();
	const before = cache(test.styles, test.main);
	const count = test.styles.metrics().cascadeBuilds;
	expect(count).toBe(1);
	const samples = [];
	for (const vertical of [10, 20, 30, 0]) {
		expect(test.scroll.to(0, vertical)).toBe(true);
		const current = cache(test.styles, test.main);
		samples.push({
			position: test.scroll.get(),
			cascadeBuilds: test.styles.metrics().cascadeBuilds,
			identities: cacheNames.map((name) => current[name] === before[name]),
		});
	}
	expect(samples).toEqual(
		[10, 20, 30, 0].map((vertical) => ({
			position: { x: 0, y: vertical },
			cascadeBuilds: count,
			identities: [true, true, true, true],
		})),
	);
	sameCache(test.styles, test.main, before);
});

it("preserves all CSS caches across fractional to/by, negative deltas, clamping and repeated no-ops", () => {
	const test = fixture();
	expect(test.scroll.bounds()).toEqual({ x: 120, y: 240 });
	const before = cache(test.styles, test.main);
	const count = test.styles.metrics().cascadeBuilds;
	for (let repeat = 0; repeat < 3; repeat++) {
		test.scroll.to(0.5, 10.25);
		expect(test.scroll.get()).toEqual({ x: 0.5, y: 10.25 });
		test.scroll.by(1.75, 20.5);
		expect(test.scroll.get()).toEqual({ x: 2.25, y: 30.75 });
		test.scroll.by(-1.25, -2.25);
		expect(test.scroll.get()).toEqual({ x: 1, y: 28.5 });
		test.scroll.by(1_000_000, 1_000_000);
		expect(test.scroll.get()).toEqual({ x: 120, y: 240 });
		expect(test.scroll.by(1, 1)).toBe(false);
		test.scroll.to(-20.25, -30.5);
		expect(test.scroll.get()).toEqual({ x: 0, y: 0 });
		expect(test.scroll.to(0, 0)).toBe(false);
		sameCache(test.styles, test.main, before);
		expect(test.styles.metrics().cascadeBuilds).toBe(count);
	}
});

it("refreshes client geometry, hit targets, prepared raster validity and pixels without rebuilding CSS", () => {
	const test = fixture();
	const middle = test.id("#middle");
	const saved = test.geometry.getClientRects(middle);
	const documentRect = test.geometry.getDocumentRects(middle)[0];
	const prepared = prepareDocumentRaster(test.tree);
	const red = prepared.rasterize();
	expect(pixel(red.image, 5, 5)).toEqual([255, 0, 0, 255]);
	expect(test.hits.elementFromPoint(5, 5)).toBe(test.id("#top"));
	const before = cache(test.styles, test.main);
	const count = test.styles.metrics().cascadeBuilds;
	const geometryBuilds = test.geometry.metrics().builds;
	test.scroll.to(20, 80);
	expect(test.geometry.getBoundingClientRect(middle)).toMatchObject({
		x: -20,
		y: 0,
		width: 240,
		height: 80,
	});
	expect(test.geometry.getDocumentRects(middle)[0]).toEqual(documentRect);
	expect(saved[0]).toMatchObject({ x: 0, y: 80 });
	expect(test.geometry.metrics().revision).toBe(test.tree.revision);
	expect(test.geometry.metrics().builds).toBeGreaterThan(geometryBuilds);
	expect(test.hits.elementFromPoint(5, 5)).toBe(middle);
	expect(() => prepared.rasterize()).toThrow("stale");
	const blue = prepareDocumentRaster(test.tree).rasterize();
	expect(blue.clip).toEqual({ x: 20, y: 80, width: 120, height: 80 });
	expect(pixel(blue.image, 5, 5)).toEqual([0, 0, 255, 255]);
	expect(blue.image.pixels).not.toEqual(red.image.pixels);
	expect(pixel(red.image, 5, 5)).toEqual([255, 0, 0, 255]);
	sameCache(test.styles, test.main, before);
	expect(test.styles.metrics().cascadeBuilds).toBe(count);
});

it("keeps fixed boxes viewport anchored and absolute/normal geometry fresh on both axes", () => {
	const test = fixture(
		'<main id="main"><div id="top"></div><div id="middle"></div><div id="fixed"></div><div id="absolute"></div></main>',
		"main{position:relative}#fixed{position:fixed;left:10px;top:5px;width:15px;height:15px;background:red}#absolute{position:absolute;left:100px;top:100px;width:20px;height:20px;background:blue}",
	);
	const fixed = test.id("#fixed");
	const absolute = test.id("#absolute");
	const middle = test.id("#middle");
	const fixedRect = test.geometry.getBoundingClientRect(fixed);
	expect(fixedRect).toMatchObject({ x: 10, y: 5 });
	const before = [test.main, fixed, absolute].map((target) => ({
		target,
		cache: cache(test.styles, target),
	}));
	const count = test.styles.metrics().cascadeBuilds;
	test.scroll.to(50, 70);
	expect(test.geometry.getBoundingClientRect(fixed)).toEqual(fixedRect);
	expect(test.geometry.getDocumentRects(fixed)[0]).toMatchObject({
		x: 60,
		y: 75,
	});
	expect(test.geometry.getBoundingClientRect(absolute)).toMatchObject({
		x: 50,
		y: 30,
	});
	expect(test.geometry.getDocumentRects(absolute)[0]).toMatchObject({
		x: 100,
		y: 100,
	});
	expect(test.geometry.getBoundingClientRect(middle)).toMatchObject({
		x: -50,
		y: 10,
	});
	expect(test.hits.elementFromPoint(12, 7)).toBe(fixed);
	expect(test.hits.elementFromPoint(55, 35)).toBe(absolute);
	const image = rasterizeDocument(test.tree).image;
	expect(pixel(image, 12, 7)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 55, 35)).toEqual([0, 0, 255, 255]);
	for (const entry of before) sameCache(test.styles, entry.target, entry.cache);
	expect(test.styles.metrics().cascadeBuilds).toBe(count);
});

it("keeps actual wheel scrolling CSS-stable when pointer hover stays on the same target", () => {
	const test = fixture('<main id="main"></main>');
	test.actions.mouse.move(5, 5);
	const before = cache(test.styles, test.main);
	const count = test.styles.metrics().cascadeBuilds;
	const observed: unknown[] = [];
	test.actions.events.addEventListener(test.tree.root, "scroll", () =>
		observed.push(test.scroll.get()),
	);
	test.actions.mouse.wheel(12.5, 25.25);
	expect(test.scroll.get()).toEqual({ x: 12.5, y: 25.25 });
	test.actions.mouse.wheel(-5.5, -10.25);
	expect(test.scroll.get()).toEqual({ x: 7, y: 15 });
	expect(observed).toEqual([
		{ x: 12.5, y: 25.25 },
		{ x: 7, y: 15 },
	]);
	expect(test.hits.elementFromPoint(5, 5)).toBe(test.main);
	sameCache(test.styles, test.main, before);
	expect(test.styles.metrics().cascadeBuilds).toBe(count);
});

it("separates wheel's pure scroll notification from its subsequent relevant hover transition", () => {
	const test = fixture(undefined, "#middle:hover{color:green}");
	test.actions.mouse.move(5, 5);
	const before = cache(test.styles, test.main);
	const count = test.styles.metrics().cascadeBuilds;
	let scrollCache: ReturnType<typeof cache> | undefined;
	let scrollCount = -1;
	test.actions.events.addEventListener(test.tree.root, "scroll", () => {
		scrollCache = cache(test.styles, test.main);
		scrollCount = test.styles.metrics().cascadeBuilds;
	});
	test.actions.mouse.wheel(0, 80);
	expect(scrollCache).toBeDefined();
	for (const name of cacheNames) expect(scrollCache?.[name]).toBe(before[name]);
	expect(scrollCount).toBe(count);
	expect(test.hits.elementFromPoint(5, 5)).toBe(test.id("#middle"));
	expect(test.styles.get(test.main)).not.toBe(before.get);
	expect(test.styles.paint(test.id("#middle")).color).toEqual([0, 128, 0, 255]);
	expect(test.styles.metrics().cascadeBuilds).toBe(count + 1);
});

it("keeps native keyboard page/line/home/end scrolling cache-stable after setup", () => {
	const test = fixture('<main id="main"></main>');
	test.actions.keyboard.press("Home");
	const before = cache(test.styles, test.main);
	const count = test.styles.metrics().cascadeBuilds;
	for (const [key, horizontal, vertical] of [
		["ArrowDown", 0, 40],
		["PageDown", 0, 110],
		["End", 0, 240],
		["Home", 0, 0],
		["ArrowRight", 40, 0],
		["ArrowLeft", 0, 0],
	] as const) {
		test.actions.keyboard.press(key);
		expect(test.scroll.get()).toEqual({ x: horizontal, y: vertical });
		expect(test.geometry.getBoundingClientRect(test.main)).toMatchObject({
			x: 0 - horizontal,
			y: 0 - vertical,
		});
		sameCache(test.styles, test.main, before);
		expect(test.styles.metrics().cascadeBuilds).toBe(count);
	}
	expect(test.actions.focus.active()).toBeNull();
});

it("retains CSS identity while native scroll-into-view changes both client axes and hit targets", () => {
	const test = fixture(
		'<main id="main"><div id="spacer"></div><div id="target"></div></main>',
		"main{width:400px;height:500px}#spacer{height:160px}#target{margin-left:150px;width:20px;height:20px;background:red}",
	);
	const target = test.id("#target");
	expect(test.geometry.getDocumentRects(target)[0]).toMatchObject({
		x: 150,
		y: 160,
	});
	const before = cache(test.styles, test.main);
	const count = test.styles.metrics().cascadeBuilds;
	const result = runEventAction(
		test.actions.events,
		documentScrollIntoView(test.tree).action(target, {
			block: "start",
			inline: "start",
		}),
	);
	expect(result).toMatchObject({ changed: true, scroll: { x: 150, y: 160 } });
	expect(test.geometry.getBoundingClientRect(target)).toMatchObject({
		x: 0,
		y: 0,
	});
	expect(test.hits.elementFromPoint(5, 5)).toBe(target);
	sameCache(test.styles, test.main, before);
	expect(test.styles.metrics().cascadeBuilds).toBe(count);
});

it.each(["inline", "stylesheet", "external", "viewport-media"])(
	"rebuilds for %s source changes but not again for their automatic clamp",
	(source) => {
		const test = fixture(
			'<link id="external" rel="stylesheet" href="/scroll.css"><main id="main"></main>',
			"@media(min-width:160px){#main{width:180px;height:90px;background:blue}}",
		);
		test.styles.setExternalSheet(
			test.id("#external"),
			"https://fixture.invalid/scroll.css",
			"",
		);
		test.scroll.to(120, 240);
		expect(test.scroll.get()).toEqual({ x: 120, y: 240 });
		const before = cache(test.styles, test.main);
		const count = test.styles.metrics().cascadeBuilds;
		if (source === "inline")
			test.tree.setAttribute(test.main, "style", "width:140px;height:100px");
		else if (source === "stylesheet") {
			const text = test.tree.get(test.id("#sheet")).children[0];
			test.tree.setData(
				text,
				`${test.tree.get(text).data}#main{width:140px;height:100px}`,
			);
		} else if (source === "external")
			test.styles.setExternalSheet(
				test.id("#external"),
				"https://fixture.invalid/scroll.css",
				"#main{width:140px;height:100px}",
			);
		else test.styles.setViewport(200, 100);
		const afterSource = cache(test.styles, test.main);
		expect(afterSource.get).not.toBe(before.get);
		expect(afterSource.box.width).toBe(
			source === "viewport-media" ? "180px" : "140px",
		);
		expect(test.styles.metrics().cascadeBuilds).toBe(count + 1);
		const maximum =
			source === "viewport-media" ? { x: 0, y: 0 } : { x: 20, y: 20 };
		expect(test.scroll.get()).toEqual(maximum);
		expect(test.scroll.bounds()).toEqual(maximum);
		expect(test.geometry.getBoundingClientRect(test.main)).toMatchObject({
			x: 0 - maximum.x,
			y: 0 - maximum.y,
		});
		sameCache(test.styles, test.main, afterSource);
		expect(test.styles.metrics().cascadeBuilds).toBe(count + 1);
	},
);

it.each(["scroll-first", "attribute-first"])(
	"preserves relevant mutation rebuilds and distinct cache identities in %s order",
	(order) => {
		const test = fixture();
		test.scroll.get();
		const before = cache(test.styles, test.main);
		const count = test.styles.metrics().cascadeBuilds;
		const scroll = () => test.scroll.to(10, 20);
		const attribute = () =>
			test.tree.setAttribute(test.main, "data-relevant", "yes");
		if (order === "scroll-first") {
			scroll();
			attribute();
		} else {
			attribute();
			scroll();
		}
		const rebuilt = cache(test.styles, test.main);
		for (const name of cacheNames) {
			expect(rebuilt[name]).toEqual(before[name]);
			if (name !== "text") expect(rebuilt[name]).not.toBe(before[name]);
		}
		expect(test.styles.metrics().cascadeBuilds).toBe(count + 1);
		test.scroll.by(1, 1);
		expect(test.scroll.get()).toEqual({ x: 11, y: 21 });
		sameCache(test.styles, test.main, rebuilt);
		expect(test.styles.metrics().cascadeBuilds).toBe(count + 1);
	},
);

it("does not mask a reentrant CSS source mutation inside scroll presentation notification", () => {
	const test = fixture('<main id="main"></main>');
	test.scroll.get();
	const before = cache(test.styles, test.main);
	const count = test.styles.metrics().cascadeBuilds;
	let observed: ReturnType<typeof cache> | undefined;
	const stop = test.tree.onChange((change) => {
		if (change.kind !== "style") return;
		stop();
		test.tree.setAttribute(
			test.main,
			"style",
			"width:220px;height:300px;color:blue",
		);
		observed = cache(test.styles, test.main);
	});
	test.scroll.to(30, 40);
	expect(test.scroll.get()).toEqual({ x: 30, y: 40 });
	expect(test.scroll.bounds()).toEqual({ x: 100, y: 220 });
	expect(observed?.get).not.toBe(before.get);
	expect(observed?.box.width).toBe("220px");
	expect(observed?.paint.color).toEqual([0, 0, 255, 255]);
	expect(test.styles.get(test.main)).toBe(observed?.get);
	expect(test.geometry.getBoundingClientRect(test.main)).toMatchObject({
		x: -30,
		y: -40,
		width: 220,
		height: 300,
	});
	expect(test.styles.metrics().cascadeBuilds).toBe(count + 1);
});

it.each([false, true])(
	"falls back after journal overflow before scrolling, with evicted relevant source=%s",
	(mutateStyle) => {
		const test = fixture(
			'<main id="main"><input id="field"></main>',
			"#main.changed{font-size:12px;color:blue}",
			{ maxChanges: 2 },
		);
		test.scroll.get();
		const before = cache(test.styles, test.main);
		const count = test.styles.metrics().cascadeBuilds;
		const revision = test.tree.revision;
		if (mutateStyle) test.tree.setAttribute(test.main, "class", "changed");
		for (let index = 0; index < 6; index++)
			test.tree.setControl(test.id("#field"), { value: String(index) });
		expect(test.tree.changesSince(revision).reset).toBe(true);
		test.scroll.to(20, 30);
		expect(test.styles.get(test.main)).not.toBe(before.get);
		expect(test.styles.text(test.main)["font-size"]).toBe(
			mutateStyle ? "12px" : "10px",
		);
		expect(test.styles.metrics().cascadeBuilds).toBe(count + 1);
		expect(test.scroll.get()).toEqual({ x: 20, y: 30 });
	},
);

it("keeps scrolled placeholder/caret CSS stable but still rebuilds on real control-value changes", () => {
	const test = fixture(
		'<main id="main"><div id="spacer"></div><input id="field" placeholder="hint" size="8"></main>',
		"#spacer{height:120px}#field{font-size:8px;width:96px;color:red}#field:placeholder-shown{color:blue}",
	);
	const field = test.id("#field");
	test.actions.focus.focus(test.tree.reference(field));
	test.actions.keyboard.collapseEnd(field);
	test.scroll.to(0, 100);
	expect(test.geometry.getBoundingClientRect(field).y).toBe(20);
	const empty = cache(test.styles, field);
	const count = test.styles.metrics().cascadeBuilds;
	expect(empty.paint.color).toEqual([0, 0, 255, 255]);
	for (const vertical of [110, 100]) {
		test.scroll.to(0, vertical);
		expect(test.geometry.getBoundingClientRect(field).y).toBe(120 - vertical);
		sameCache(test.styles, field, empty);
		expect(test.styles.metrics().cascadeBuilds).toBe(count);
	}
	test.actions.keyboard.type("X");
	expect(controlValue(test.tree, field)).toBe("X");
	expect(readNativeControlSelection(test.tree, field)).toMatchObject({
		anchor: 1,
		focus: 1,
		valueLength: 1,
	});
	expect(test.styles.paint(field).color).toEqual([255, 0, 0, 255]);
	expect(test.styles.metrics().cascadeBuilds).toBeGreaterThan(count);
	const filled = cache(test.styles, field);
	const filledCount = test.styles.metrics().cascadeBuilds;
	const beforeSelection = rasterizeDocument(test.tree).image.pixels;
	test.actions.keyboard.press("Shift+ArrowLeft");
	expect(readNativeControlSelection(test.tree, field)).toMatchObject({
		anchor: 1,
		focus: 0,
	});
	expect(rasterizeDocument(test.tree).image.pixels).not.toEqual(
		beforeSelection,
	);
	test.scroll.by(0, 10);
	expect(test.geometry.getBoundingClientRect(field).y).toBe(10);
	sameCache(test.styles, field, filled);
	expect(test.styles.metrics().cascadeBuilds).toBe(filledCount);
});
