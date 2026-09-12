import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it("keeps the blocked public badge source and lays out its standards-mode border-zero alternative without fetching", async () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}</style><a href="/next"><IMG WIDTH=80 HEIGHT=15 SRC="http://sflogo.sourceforge.net/sflogo.php?group_id=32355&amp;type=9" ALT="[primary site hosted by SourceForge]" BORDER=0 ></a>',
		"https://www.libpng.org/pub/png/",
	);
	const query = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	let requests = 0;
	const images = documentImages(tree, {
		fetch: async () => {
			requests++;
			throw new Error("Mixed-content badge must never be fetched");
		},
	});
	try {
		documentStyles(tree).setViewport(512, 64);
		await images.settle();
		const image = query.querySelector("img");
		const link = query.querySelector("a");
		if (image === null || link === null) throw new Error("Missing badge");
		const before = snapshotDocument(tree);
		const rectangle = geometry.getBoundingClientRect(link);
		expect(rectangle.width).toBeGreaterThan(0);
		expect(rectangle.height).toBe(8);
		expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBeGreaterThan(0);
		expect(hits.elementFromPoint(1, 2)).not.toBeNull();
		expect(requests).toBe(0);
		expect(images.get(image)).toMatchObject({
			state: "broken",
			error: "policy-denied",
			naturalWidth: 0,
			naturalHeight: 0,
		});
		expect(images.metrics()).toMatchObject({
			requests: 0,
			resources: 0,
			decodedBytes: 0,
		});
		expect(snapshotDocument(tree)).toEqual(before);
	} finally {
		query.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(images.metrics()).toMatchObject({ closed: true, decodedBytes: 0 });
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
});
