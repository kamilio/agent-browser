import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { opacityLayoutLimits, prepareOpacityLayout } from "./opacity-layout.js";
import * as raster from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(depth = 1, siblings = false) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>div{opacity:.5}${siblings ? "span{opacity:.5}" : ""}</style>${"<div>".repeat(depth)}<span id="leaf">A</span>${siblings ? '<span id="peer">B</span>' : ""}${"</div>".repeat(depth)}`,
		"https://fixture.invalid/opacity-layers",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(32, 32);
	const queries = new DocumentQueries(tree);
	const leaf = queries.querySelector("#leaf");
	const peer = queries.querySelector("#peer");
	if (leaf === null) throw new Error("Missing leaf");
	const formatting = buildFormattingTree(tree);
	const node = formatting.nodes.find(
		(entry) => entry.ref === tree.reference(leaf),
	);
	if (!node) throw new Error("Missing formatting leaf");
	return {
		formatting,
		leaf: node.id,
		peer:
			peer === null
				? undefined
				: formatting.nodes.find((entry) => entry.ref === tree.reference(peer))
						?.id,
	};
}

it("does not create a manager when there are no opacity groups", () => {
	const { formatting } = fixture(0);
	expect(
		prepareOpacityLayout(formatting, raster.createRaster(2, 2), () => {}),
	).toBeUndefined();
});

it("retains nested surfaces only until their group closes", () => {
	const { formatting, leaf } = fixture(2);
	const canvas = raster.createRaster(2, 2, [255, 255, 255, 255]);
	const layers = prepareOpacityLayout(formatting, canvas, () => {});
	expect(layers).toBeDefined();
	raster.paintRasterRect(layers!.target(leaf), 0, 0, 2, 2, [255, 0, 0, 255]);
	expect(layers!.metrics).toEqual({ groups: 2, pixels: 8, peakPixels: 8 });
	expect(layers!.target(formatting.root)).toBe(canvas);
	expect([...canvas.pixels.slice(0, 4)]).toEqual([255, 191, 191, 255]);
	layers!.finish();
});

it("rejects reentering an already composited group instead of silently painting it twice", () => {
	const { formatting, leaf } = fixture();
	const layers = prepareOpacityLayout(
		formatting,
		raster.createRaster(2, 2),
		() => {},
	);
	layers!.target(leaf);
	layers!.target(formatting.root);
	expect(() => layers!.target(leaf)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("rejects a missing paint owner", () => {
	const { formatting } = fixture();
	const layers = prepareOpacityLayout(
		formatting,
		raster.createRaster(2, 2),
		() => {},
	);
	expect(() => layers!.target(-1)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("charges allocation before retaining the raster", () => {
	const { formatting, leaf } = fixture();
	let stop = false;
	const canvas = raster.createRaster(2, 2);
	const layers = prepareOpacityLayout(formatting, canvas, (work = 1) => {
		if (stop && work === 4) throw new Error("allocation budget");
	});
	const allocate = vi.spyOn(raster, "createRaster");
	stop = true;
	expect(() => layers!.target(leaf)).toThrow("allocation budget");
	expect(allocate).not.toHaveBeenCalled();
});

it("checks total retained pixels before allocating the next layer", () => {
	const { formatting, leaf } = fixture(17);
	const canvas = raster.createRaster(1024, 1024);
	const layers = prepareOpacityLayout(formatting, canvas, () => {});
	const allocate = vi.spyOn(raster, "createRaster");
	expect(() => layers!.target(leaf)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(allocate).toHaveBeenCalledTimes(16);
	expect(layers!.metrics.peakPixels).toBe(
		opacityLayoutLimits.maxRetainedPixels,
	);
});

it("releases caller destinations before allocating a sibling replacement layer", () => {
	const { formatting, leaf, peer } = fixture(3, true);
	const canvas = raster.createRaster(2, 2);
	const layers = prepareOpacityLayout(formatting, canvas, () => {});
	let destination = layers!.target(leaf);
	const allocate = raster.createRaster;
	const allocations = vi
		.spyOn(raster, "createRaster")
		.mockImplementation((...args) => {
			expect(destination).toBe(canvas);
			return allocate(...args);
		});
	const release = vi.fn(() => {
		destination = canvas;
	});
	destination = layers!.target(peer!, release);
	expect(release).toHaveBeenCalledTimes(1);
	expect(allocations).toHaveBeenCalledTimes(1);
	expect(layers!.metrics).toEqual({ groups: 5, pixels: 20, peakPixels: 16 });
	layers!.target(peer!, release);
	expect(release).toHaveBeenCalledTimes(1);
	layers!.finish();
});
