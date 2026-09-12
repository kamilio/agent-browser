import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it("lays out a legacy center as a block with centered text and fixed-width child blocks", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:80px}#fixed{width:20px;height:8px;background:red}</style><main><center id="center">AA<div id="fixed">BB</div>CC</center></main>',
		"https://fixture.invalid/center-element",
	);
	const query = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		documentStyles(tree).setViewport(96, 48);
		const id = (selector: string) => {
			const found = query.querySelector(selector);
			if (found === null) throw new Error(`Missing ${selector}`);
			return found;
		};
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const layout = layoutDocument(tree);
		expect(geometry.getBoundingClientRect(id("#center"))).toMatchObject({
			x: 0,
			y: 0,
			width: 80,
			height: 24,
		});
		expect(geometry.getBoundingClientRect(id("#fixed"))).toMatchObject({
			x: 30,
			y: 8,
			width: 20,
			height: 8,
		});
		const glyphs = layout.contexts
			.flatMap((context) => context.glyphs)
			.sort((first, second) => first.y - second.y || first.x - second.x);
		expect(glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y])).toEqual([
			["A", 34, 0],
			["A", 40, 0],
			["B", 34, 8],
			["B", 40, 8],
			["C", 34, 16],
			["C", 40, 16],
		]);
		expect(hits.elementFromPoint(31, 9)).toBe(id("#fixed"));
		expect([
			...rasterizeDocument(tree, {
				clip: { x: 31, y: 9, width: 1, height: 1 },
			}).image.pixels,
		]).toEqual([255, 0, 0, 255]);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	} finally {
		query.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(query.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
});
