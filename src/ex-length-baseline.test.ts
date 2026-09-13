import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

function padded(value: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:16px;line-height:16px}#target{width:40px;padding:${value};background:red}</style><div id="target"><span id="mark">AA</span></div>`,
		"https://fixture.invalid/ex-padding",
	);
	const queries = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		documentStyles(tree).setViewport(96, 80);
		const target = queries.querySelector("#target");
		const mark = queries.querySelector("#mark");
		if (target === null || mark === null) throw new Error("Missing ex fixture");
		const before = snapshotDocument(tree);
		const layout = layoutDocument(tree);
		const result = {
			target: geometry.getBoundingClientRect(target),
			mark: geometry.getBoundingClientRect(mark),
			glyphs: layout.contexts.flatMap((context) =>
				context.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
			),
			paddingHit: hits.elementFromPoint(1, 1) === target,
			pixels: Array.from(rasterizeDocument(tree).image.pixels),
		};
		expect(snapshotDocument(tree)).toEqual(before);
		return result;
	} finally {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
}

it.each([
	["1ex", 10],
	["calc(2ex + 1px)", 21],
] as const)("uses actual x-height for native padding:%s", (value, pixels) => {
	const reference = padded(`${pixels}px`);
	expect(reference.target).toMatchObject({
		x: 0,
		y: 0,
		width: 40 + pixels * 2,
		height: 16 + pixels * 2,
	});
	expect(reference.mark).toMatchObject({ x: pixels, y: pixels, width: 24 });
	expect(reference.paddingHit).toBe(true);
	expect(padded(value)).toEqual(reference);
});
