import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it("lays out and activates the hit region of markerless navigation without removing list-style source", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}ul{list-style:none;margin:0;padding:0}</style><ul><li><a id="link" href="/next">AA</a></li></ul>',
		"https://fixture.invalid/list-style",
	);
	const query = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		documentStyles(tree).setViewport(32, 24);
		const link = query.querySelector("#link");
		if (link === null) throw new Error("Missing markerless navigation link");
		const before = snapshotDocument(tree);
		expect(geometry.getBoundingClientRect(link)).toMatchObject({
			x: 0,
			y: 0,
			width: 12,
			height: 8,
		});
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
		expect(hits.elementFromPoint(1, 2)).toBe(link);
		expect(snapshotDocument(tree)).toEqual(before);
	} finally {
		query.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
});
