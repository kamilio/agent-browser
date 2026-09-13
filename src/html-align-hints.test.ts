import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

function inlineAlignment(tagName: string, attributes: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body,#target{margin:0;padding:0;font-size:8px;font-weight:400;line-height:8px;background:white}main{width:80px}#mark{background:red}</style><main><${tagName} id="target" ${attributes}><span id="mark">AA</span></${tagName}></main>`,
		"https://fixture.invalid/html-align-hints",
	);
	const queries = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		documentStyles(tree).setViewport(96, 32);
		const target = queries.querySelector("#target");
		const mark = queries.querySelector("#mark");
		if (target === null || mark === null)
			throw new Error("Missing HTML alignment fixture");
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const layout = layoutDocument(tree);
		const glyphs = layout.contexts
			.flatMap((context) => context.glyphs)
			.sort((first, second) => first.y - second.y || first.x - second.x)
			.map((glyph) => [glyph.character, glyph.x, glyph.y]);
		const result = {
			glyphs,
			target: geometry.getBoundingClientRect(target),
			mark: geometry.getBoundingClientRect(mark),
			markHit: hits.elementFromPoint(35, 1) === mark,
			pixels: Array.from(rasterizeDocument(tree).image.pixels),
		};
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
		return result;
	} finally {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(queries.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
}

it.each(["p", "h3"])(
	"lays out an actual %s align=center hint with matching inline pixels and hits",
	(tagName) => {
		const explicit = inlineAlignment(tagName, 'style="text-align:center"');
		expect(explicit.glyphs).toEqual([
			["A", 34, 0],
			["A", 40, 0],
		]);
		expect(explicit.target).toMatchObject({ x: 0, y: 0, width: 80, height: 8 });
		expect(explicit.mark).toMatchObject({ x: 34, y: 0, width: 12, height: 8 });
		expect(explicit.markHit).toBe(true);
		expect(inlineAlignment(tagName, 'align="center"')).toEqual(explicit);
	},
);
