import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

function rendered(family: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}#target{font-family:${family};font-size:16px;line-height:16px;width:40px;padding:1ex;background:red}</style><div id="target"><span id="mark">Ax</span></div>`,
		"https://fixture.invalid/font-family",
	);
	const queries = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		const styles = documentStyles(tree);
		styles.setViewport(96, 64);
		const target = queries.querySelector("#target");
		const mark = queries.querySelector("#mark");
		if (target === null || mark === null) throw new Error("Missing target");
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
		expect(styles.metrics().issues).toEqual({});
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

it.each(["Verdana, sans-serif", '"Unavailable", "Agent Mono", serif'])(
	"renders %s with the available native face and its ex metrics",
	(family) => {
		const reference = rendered('"agent mono"');
		expect(reference.target).toMatchObject({ width: 60, height: 36 });
		expect(reference.mark).toMatchObject({ x: 10, y: 10, width: 24 });
		expect(reference.paddingHit).toBe(true);
		expect(rendered(family)).toEqual(reference);
	},
);
