import { afterEach, expect, it } from "vitest";
import { controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { runEventAction } from "./event-actions.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import { documentScrollIntoView } from "./scroll-into-view.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	markup = '<main id="main"><div id="top"></div><div id="middle"></div><div id="bottom"></div></main>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style id="sheet">html,body{margin:0;padding:0}main{width:240px;height:320px;font-size:10px;color:purple}#top,#middle{height:80px}#bottom{height:160px}#top{background:red}#middle{background:blue}#bottom{background:green}${css}</style>${markup}`,
		"https://fixture.invalid/scroll-extent-cache",
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

type Fixture = ReturnType<typeof fixture>;

function cssCache(test: Fixture, target = test.main) {
	return [
		test.styles.get(target),
		test.styles.text(target),
		test.styles.box(target),
		test.styles.paint(target),
	];
}

function snapshot(test: Fixture, target = test.main) {
	const bounds = test.scroll.bounds();
	const css = cssCache(test, target);
	return {
		bounds,
		css,
		metrics: test.scroll.metrics(),
		cascades: test.styles.metrics().cascadeBuilds,
		target,
	};
}

function reused(test: Fixture, before: ReturnType<typeof snapshot>) {
	expect(test.scroll.bounds()).toBe(before.bounds);
	expect(test.scroll.metrics()).toMatchObject({
		builds: before.metrics.builds,
		work: before.metrics.work,
		revision: test.tree.revision,
	});
	for (const [index, style] of cssCache(test, before.target).entries())
		expect(style).toBe(before.css[index]);
	expect(test.styles.metrics().cascadeBuilds).toBe(before.cascades);
}

function pixel(
	image: { width: number; pixels: Uint8Array },
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("samples unchanged extent identity and scans across four moves without reattributing the existing CSS optimization", () => {
	const test = fixture('<main id="main"></main>');
	const before = snapshot(test);
	expect(before.metrics.builds).toBe(1);
	expect(before.cascades).toBe(1);
	const samples = [];
	for (const vertical of [10, 20, 30, 0]) {
		test.scroll.to(0, vertical);
		const bounds = test.scroll.bounds();
		samples.push({
			position: test.scroll.get(),
			bounds,
			identity: bounds === before.bounds,
			extentBuilds: test.scroll.metrics().builds,
			cascadeBuilds: test.styles.metrics().cascadeBuilds,
		});
	}
	expect(samples).toEqual(
		[10, 20, 30, 0].map((vertical) => ({
			position: { x: 0, y: vertical },
			bounds: { x: 120, y: 240 },
			identity: true,
			extentBuilds: 1,
			cascadeBuilds: 1,
		})),
	);
	reused(test, before);
});

it("reuses bounds through fractional both-axis to/by while geometry, hits and prepared pixels stay current", () => {
	const test = fixture();
	const middle = test.id("#middle");
	const saved = test.geometry.getClientRects(middle);
	const documentRect = test.geometry.getDocumentRects(middle)[0];
	const before = snapshot(test);
	for (const [horizontal, vertical, target, color] of [
		[0.5, 10.25, "#top", [255, 0, 0, 255]],
		[20.5, 80.25, "#middle", [0, 0, 255, 255]],
		[30.75, 160.5, "#bottom", [0, 128, 0, 255]],
		[2.25, 2.5, "#top", [255, 0, 0, 255]],
	] as const) {
		const prepared = prepareDocumentRaster(test.tree);
		const prior = prepared.rasterize();
		const builds = test.geometry.metrics().builds;
		const position = test.scroll.get();
		expect(test.scroll.by(horizontal - position.x, vertical - position.y)).toBe(
			true,
		);
		expect(test.scroll.get()).toEqual({ x: horizontal, y: vertical });
		expect(test.geometry.getBoundingClientRect(middle)).toMatchObject({
			x: 0 - horizontal,
			y: 80 - vertical,
		});
		expect(test.geometry.getDocumentRects(middle)[0]).toEqual(documentRect);
		expect(test.geometry.metrics().builds).toBeGreaterThan(builds);
		expect(test.geometry.metrics().revision).toBe(test.tree.revision);
		expect(test.hits.elementFromPoint(5, 5)).toBe(test.id(target));
		expect(() => prepared.rasterize()).toThrow("stale");
		const current = rasterizeDocument(test.tree);
		expect(current.clip).toEqual({
			x: horizontal,
			y: vertical,
			width: 120,
			height: 80,
		});
		expect(pixel(current.image, 5, 5)).toEqual(color);
		if (vertical > 80)
			expect(current.image.pixels).not.toEqual(prior.image.pixels);
		reused(test, before);
	}
	expect(saved[0]).toMatchObject({ x: 0, y: 80 });
	test.scroll.to(1_000_000, 1_000_000);
	expect(test.scroll.get()).toEqual(before.bounds);
	expect(test.scroll.by(1, 1)).toBe(false);
	test.scroll.to(-1, -1);
	expect(test.scroll.get()).toEqual({ x: 0, y: 0 });
	reused(test, before);
});

it("keeps fixed, absolute and normal consumer geometry and pixels fresh without recomputing extents", () => {
	const test = fixture(
		'<main id="main"><div id="top"></div><div id="middle"></div><div id="fixed"></div><div id="absolute"></div></main>',
		"main{position:relative}#fixed{position:fixed;left:10px;top:5px;width:15px;height:15px;background:red}#absolute{position:absolute;left:100px;top:100px;width:20px;height:20px;background:blue}",
	);
	const fixed = test.id("#fixed");
	const absolute = test.id("#absolute");
	const fixedRect = test.geometry.getBoundingClientRect(fixed);
	const absoluteDocument = test.geometry.getDocumentRects(absolute)[0];
	const before = snapshot(test);
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
	expect(test.geometry.getDocumentRects(absolute)[0]).toEqual(absoluteDocument);
	expect(test.geometry.getBoundingClientRect(test.id("#middle"))).toMatchObject(
		{ x: -50, y: 10 },
	);
	expect(test.hits.elementFromPoint(12, 7)).toBe(fixed);
	expect(test.hits.elementFromPoint(55, 35)).toBe(absolute);
	const image = rasterizeDocument(test.tree).image;
	expect(pixel(image, 12, 7)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 55, 35)).toEqual([0, 0, 255, 255]);
	reused(test, before);
});

it("reuses extents during actual wheel delivery after stable-target pointer setup", () => {
	const test = fixture('<main id="main"></main>');
	test.actions.mouse.move(5, 5);
	const before = snapshot(test);
	const positions: unknown[] = [];
	test.actions.events.addEventListener(test.tree.root, "scroll", () =>
		positions.push(test.scroll.get()),
	);
	test.actions.mouse.wheel(12.5, 25.25);
	test.actions.mouse.wheel(-5.5, -10.25);
	expect(positions).toEqual([
		{ x: 12.5, y: 25.25 },
		{ x: 7, y: 15 },
	]);
	expect(test.geometry.getBoundingClientRect(test.main)).toMatchObject({
		x: -7,
		y: -15,
	});
	expect(test.hits.elementFromPoint(5, 5)).toBe(test.main);
	reused(test, before);
});

it("separates reusable wheel scroll from the subsequent real hover change and its extent scan", () => {
	const test = fixture(undefined, "#middle:hover{color:green}");
	test.actions.mouse.move(5, 5);
	const before = snapshot(test);
	let during: ReturnType<typeof snapshot> | undefined;
	test.actions.events.addEventListener(test.tree.root, "scroll", () => {
		during = snapshot(test);
	});
	test.actions.mouse.wheel(0, 80);
	expect(during?.bounds).toBe(before.bounds);
	expect(during?.metrics.builds).toBe(before.metrics.builds);
	expect(during?.cascades).toBe(before.cascades);
	expect(test.hits.elementFromPoint(5, 5)).toBe(test.id("#middle"));
	expect(test.styles.paint(test.id("#middle")).color).toEqual([0, 128, 0, 255]);
	expect(test.scroll.bounds()).toEqual(before.bounds);
	expect(test.scroll.bounds()).not.toBe(before.bounds);
	expect(test.scroll.metrics().builds).toBe(before.metrics.builds + 1);
	expect(test.styles.metrics().cascadeBuilds).toBe(before.cascades + 1);
});

it("reuses extents for actual root keyboard line/page/home/end movement after setup", () => {
	const test = fixture('<main id="main"></main>');
	test.actions.keyboard.press("Home");
	const before = snapshot(test);
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
		reused(test, before);
	}
	expect(test.actions.focus.active()).toBeNull();
});

it("retains extents while native scroll-into-view changes both axes, target hits and pixels", () => {
	const test = fixture(
		'<main id="main"><div id="spacer"></div><div id="target"></div></main>',
		"main{width:400px;height:500px}#spacer{height:160px}#target{margin-left:150px;width:20px;height:20px;background:red}",
	);
	const target = test.id("#target");
	const before = snapshot(test);
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
	expect(pixel(rasterizeDocument(test.tree).image, 5, 5)).toEqual([
		255, 0, 0, 255,
	]);
	reused(test, before);
});

it.each(["input", "textarea"])(
	"reuses extents through focused %s caret/selection and root clipping without stale values or pixels",
	(kind) => {
		const value = kind === "input" ? "ABCDEFGHIJKLM" : "one\ntwo\nthree";
		const fieldMarkup =
			kind === "input"
				? '<input id="field" size="8">'
				: '<textarea id="field" cols="8" rows="2"></textarea>';
		const test = fixture(
			`<main id="main"><div id="spacer"></div>${fieldMarkup}</main>`,
			"main{background:green}#spacer{height:120px}#field{width:96px;height:32px;font-size:8px;color:red}",
		);
		const field = test.id("#field");
		test.actions.fill(test.tree.reference(field), value);
		test.scroll.to(0, 100);
		const end = rasterizeDocument(test.tree);
		const box = test.geometry.getBoundingClientRect(field);
		const before = snapshot(test, field);
		const geometryBuilds = test.geometry.metrics().builds;
		test.actions.keyboard.press("Control+A");
		test.actions.keyboard.press("ArrowLeft");
		const start = rasterizeDocument(test.tree);
		expect(start.image.pixels).not.toEqual(end.image.pixels);
		expect(test.geometry.getBoundingClientRect(field)).toEqual(box);
		expect(test.geometry.metrics().builds).toBeGreaterThan(geometryBuilds);
		expect(readNativeControlSelection(test.tree, field)).toMatchObject({
			anchor: 0,
			focus: 0,
			valueLength: value.length,
		});
		expect(controlValue(test.tree, field)).toBe(value);
		expect(test.scroll.get()).toEqual({ x: 0, y: 100 });
		reused(test, before);
		test.actions.keyboard.collapseEnd(field);
		expect(rasterizeDocument(test.tree).image.pixels).toEqual(end.image.pixels);
		reused(test, before);
		test.actions.keyboard.press("Control+A");
		const selected = rasterizeDocument(test.tree);
		expect(selected.image.pixels).not.toEqual(end.image.pixels);
		expect(readNativeControlSelection(test.tree, field)).toMatchObject({
			anchor: 0,
			focus: value.length,
		});
		reused(test, before);
		test.actions.keyboard.press("ArrowLeft");
		test.scroll.to(10, 125);
		const clipped = rasterizeDocument(test.tree);
		const clippedBox = test.geometry.getBoundingClientRect(field);
		expect(clippedBox).toMatchObject({ x: -10, y: -5 });
		expect(test.hits.elementFromPoint(5, 10)).toBe(field);
		expect(pixel(clipped.image, 100, 10)).toEqual([0, 128, 0, 255]);
		expect(pixel(clipped.image, 5, 60)).toEqual([0, 128, 0, 255]);
		let ink = 0;
		for (let vertical = 0; vertical < clipped.image.height; vertical++)
			for (let horizontal = 0; horizontal < clipped.image.width; horizontal++)
				if (
					pixel(clipped.image, horizontal, vertical).join(",") === "255,0,0,255"
				) {
					ink++;
					expect(horizontal).toBeLessThan(clippedBox.x + clippedBox.width);
					expect(vertical).toBeLessThan(clippedBox.y + clippedBox.height);
				}
		expect(ink).toBeGreaterThan(0);
		expect(controlValue(test.tree, field)).toBe(value);
		reused(test, before);
	},
);

it.each(["input", "textarea"])(
	"rescans extents for a real %s value edit even when CSS stays reusable",
	(kind) => {
		const markup =
			kind === "input"
				? '<input id="field">'
				: '<textarea id="field"></textarea>';
		const test = fixture(
			`<main id="main">${markup}</main>`,
			"#field{width:96px;height:32px;font-size:8px;color:red}",
		);
		const field = test.id("#field");
		test.actions.fill(test.tree.reference(field), "AB");
		const image = rasterizeDocument(test.tree).image;
		const before = snapshot(test, field);
		test.actions.keyboard.type("C");
		expect(controlValue(test.tree, field)).toBe("ABC");
		expect(readNativeControlSelection(test.tree, field)).toMatchObject({
			anchor: 3,
			focus: 3,
			valueLength: 3,
		});
		expect(test.scroll.bounds()).toEqual(before.bounds);
		expect(test.scroll.bounds()).not.toBe(before.bounds);
		expect(rasterizeDocument(test.tree).image.pixels).not.toEqual(image.pixels);
		expect(test.scroll.metrics().builds).toBe(before.metrics.builds + 1);
		for (const [index, style] of cssCache(test, field).entries())
			expect(style).toBe(before.css[index]);
		expect(test.styles.metrics().cascadeBuilds).toBe(before.cascades);
		const edited = snapshot(test, field);
		test.actions.keyboard.press("ArrowLeft");
		rasterizeDocument(test.tree);
		reused(test, edited);
	},
);

it("refreshes extents and CSS for real focus transfer before reusing subsequent caret-only changes", () => {
	const test = fixture(
		'<main id="main"><input id="first" value="AB"><input id="second" value="CD"></main>',
		"input{width:80px;font-size:8px;color:red}input:focus{color:blue}",
	);
	const first = test.id("#first");
	const second = test.id("#second");
	test.actions.focus.focus(test.tree.reference(first));
	test.actions.keyboard.collapseEnd(first);
	const before = snapshot(test);
	test.actions.focus.focus(test.tree.reference(second));
	test.actions.keyboard.collapseEnd(second);
	expect(test.actions.focus.active()).toBe(second);
	expect(test.styles.paint(first).color).toEqual([255, 0, 0, 255]);
	expect(test.styles.paint(second).color).toEqual([0, 0, 255, 255]);
	expect(test.scroll.bounds()).not.toBe(before.bounds);
	expect(test.scroll.metrics().builds).toBe(before.metrics.builds + 1);
	expect(test.styles.metrics().cascadeBuilds).toBeGreaterThan(before.cascades);
	const focused = snapshot(test, second);
	test.actions.keyboard.press("ArrowLeft");
	expect(readNativeControlSelection(test.tree, second)).toMatchObject({
		focus: 1,
	});
	rasterizeDocument(test.tree);
	reused(test, focused);
});

it.each(["inline", "stylesheet", "external", "viewport-media"])(
	"updates real %s dimensions, clamp, geometry and pixels with one necessary scan",
	(source) => {
		const test = fixture(
			'<link id="external" rel="stylesheet" href="/scroll.css"><main id="main"></main>',
			"main{background:red}@media(min-width:160px){#main{width:180px;height:90px;background:blue}}",
		);
		test.styles.setExternalSheet(
			test.id("#external"),
			"https://fixture.invalid/scroll.css",
			"",
		);
		test.scroll.to(120, 240);
		const before = snapshot(test);
		const prepared = prepareDocumentRaster(test.tree);
		expect(pixel(prepared.rasterize().image, 5, 5)).toEqual([255, 0, 0, 255]);
		if (source === "inline")
			test.tree.setAttribute(
				test.main,
				"style",
				"width:140px;height:100px;background:blue",
			);
		else if (source === "stylesheet") {
			const text = test.tree.get(test.id("#sheet")).children[0];
			test.tree.setData(
				text,
				`${test.tree.get(text).data}#main{width:140px;height:100px;background:blue}`,
			);
		} else if (source === "external")
			test.styles.setExternalSheet(
				test.id("#external"),
				"https://fixture.invalid/scroll.css",
				"#main{width:140px;height:100px;background:blue}",
			);
		else test.styles.setViewport(200, 100);
		const maximum =
			source === "viewport-media" ? { x: 0, y: 0 } : { x: 20, y: 20 };
		const refreshed = test.scroll.bounds();
		expect(refreshed).toEqual(maximum);
		expect(refreshed).not.toBe(before.bounds);
		expect(test.scroll.metrics().builds).toBe(before.metrics.builds + 1);
		expect(test.scroll.get()).toEqual(maximum);
		expect(test.geometry.getBoundingClientRect(test.main)).toMatchObject({
			x: 0 - maximum.x,
			y: 0 - maximum.y,
			width: source === "viewport-media" ? 180 : 140,
			height: source === "viewport-media" ? 90 : 100,
		});
		expect(test.hits.elementFromPoint(5, 5)).toBe(test.main);
		expect(() => prepared.rasterize()).toThrow("stale");
		expect(pixel(rasterizeDocument(test.tree).image, 5, 5)).toEqual([
			0, 0, 255, 255,
		]);
		expect(test.scroll.bounds()).toBe(refreshed);
		expect(test.scroll.metrics().builds).toBe(before.metrics.builds + 1);
		expect(test.scroll.metrics().revision).toBe(test.tree.revision);
		expect(test.styles.get(test.main)).not.toBe(before.css[0]);
		expect(test.styles.metrics().cascadeBuilds).toBe(before.cascades + 1);
		expect(before.bounds).toEqual({ x: 120, y: 240 });
	},
);
