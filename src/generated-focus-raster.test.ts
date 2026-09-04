import { afterEach, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});
function fixture(attributes = "", css = "", extra = "") {
	vi.useFakeTimers();
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;background:white}details{width:120px;font-size:16px;line-height:16px;background:#eeeeee}#body{height:32px;background:blue}${css}</style><details id="host" ${attributes}><div id="body">Body</div></details>${extra}`,
		"https://fixture.invalid/generated-focus-raster",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const owner = new DocumentQueries(tree).querySelector("#host");
	if (owner === null) throw new Error("Missing host");
	const target = documentGeneratedControls(tree).detailsSummary(owner);
	if (!target) throw new Error("Missing header");
	const actions = documentInteractions(tree);
	const raster = () => rasterizeDocument(tree);
	return { tree, owner, target, actions, raster };
}
function pixel(
	image: Readonly<RasterImage>,
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it("paints a two-tone generated focus indicator without changing geometry or state", () => {
	const { tree, target, actions, raster } = fixture();
	const before = raster();
	const geometry = documentGeometry(tree).getGeneratedClientRects(target.ref);
	actions.focus.focus(target.ref);
	const revision = tree.revision;
	const focused = raster();
	expect(pixel(before.image, 119, 8)).toEqual([238, 238, 238, 255]);
	expect(pixel(focused.image, 119, 8)).toEqual([0, 0, 0, 255]);
	expect(pixel(focused.image, 118, 8)).toEqual([255, 255, 255, 255]);
	expect(documentGeometry(tree).getGeneratedClientRects(target.ref)).toEqual(
		geometry,
	);
	expect(tree.revision).toBe(revision);
	expect(focused.metrics.paintedGlyphs).toBe(before.metrics.paintedGlyphs);
	expect(focused.metrics.work).toBeGreaterThan(before.metrics.work);
	expect(
		snapshotDocument(tree).entries.find((entry) => entry.ref === target.ref)
			?.focused,
	).toBe(true);
});

it("removes the indicator on blur and distinguishes ordinary host focus", () => {
	const { tree, owner, target, actions, raster } = fixture('tabindex="0"');
	const baseline = raster().image.pixels;
	actions.focus.focus(target.ref);
	expect(raster().image.pixels).not.toEqual(baseline);
	actions.focus.focus(tree.reference(owner));
	expect(raster().image.pixels).toEqual(baseline);
	actions.focus.focus(target.ref);
	actions.focus.focus(null);
	expect(raster().image.pixels).toEqual(baseline);
});

it.each(["Tab", "pointer", "direct"])(
	"shows generated focus reached through %s",
	(method) => {
		const { target, actions, raster } = fixture();
		if (method === "Tab") actions.keyboard.press("Tab");
		else if (method === "direct") actions.click(target.ref);
		else {
			actions.mouse.move(4, 4);
			actions.mouse.down();
			actions.mouse.up();
		}
		expect(pixel(raster().image, 119, 8)).toEqual([0, 0, 0, 255]);
	},
);

it("keeps the indicator around the header rather than the open body", () => {
	const { target, actions, raster } = fixture("open");
	actions.focus.focus(target.ref);
	const image = raster().image;
	expect(pixel(image, 119, 8)).toEqual([0, 0, 0, 255]);
	expect(pixel(image, 119, 30)).toEqual([0, 0, 255, 255]);
});

it("lets a later covering stacking item obscure the focus indicator", () => {
	const { target, actions, raster } = fixture(
		"open",
		"#cover{position:relative;top:-48px;width:120px;height:16px;background:red}",
		'<div id="cover"></div>',
	);
	actions.focus.focus(target.ref);
	expect(pixel(raster().image, 119, 8)).toEqual([255, 0, 0, 255]);
});

it.each(["hidden", "inert", "summary", "detach"])(
	"does not retain generated focus decoration after %s invalidation",
	(change) => {
		const { tree, owner, target, actions, raster } = fixture();
		actions.focus.focus(target.ref);
		if (change === "summary") tree.append(owner, tree.createElement("summary"));
		else if (change === "detach") tree.remove(owner);
		else tree.setAttribute(owner, change, "");
		const changed = raster();
		actions.focus.focus(null);
		expect(raster().image.pixels).toEqual(changed.image.pixels);
	},
);

it("keeps prepared captures focus-revision safe", () => {
	const { tree, target, actions } = fixture();
	const prepared = prepareDocumentRaster(tree);
	actions.focus.focus(target.ref);
	expect(() => prepared.rasterize()).toThrow(/stale/);
	const focused = prepareDocumentRaster(tree);
	expect(pixel(focused.rasterize().image, 119, 8)).toEqual([0, 0, 0, 255]);
});

it("clips focus feedback to the requested crop and charges the shared raster budget", () => {
	const { tree, target, actions } = fixture();
	actions.focus.focus(target.ref);
	const options = { element: target.ref };
	const capture = rasterizeDocument(tree, options);
	expect(capture.image.width).toBe(120);
	expect(pixel(capture.image, 119, 8)).toEqual([0, 0, 0, 255]);
	expect(() =>
		rasterizeDocument(tree, { ...options, maxWork: capture.metrics.work - 1 }),
	).toThrow(/work limit/);
	expect(
		rasterizeDocument(tree, { ...options, maxWork: capture.metrics.work }).image
			.pixels,
	).toEqual(capture.image.pixels);
});
