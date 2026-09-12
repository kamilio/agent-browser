import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { documentMode } from "./document-mode.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it("reserves and paints the original quirks badge dimensions while keeping its mixed-content image blocked", async () => {
	const tree = parseHtmlDocument(
		'<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"\n  "http://www.w3.org/TR/REC-html40/loose.dtd"><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}</style><a href="/next"><IMG WIDTH=80 HEIGHT=15 SRC="http://sflogo.sourceforge.net/sflogo.php?group_id=32355&amp;type=9" ALT="[primary site hosted by SourceForge]" BORDER=0 ></a>',
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
		expect(documentMode(tree)).toBe("quirks");
		const before = snapshotDocument(tree);
		const rectangle = geometry.getBoundingClientRect(image);
		expect(rectangle).toMatchObject({ width: 80, height: 15 });
		const raster = rasterizeDocument(tree);
		expect(raster.metrics.paintedImages).toBe(1);
		expect(raster.image.pixels.some((value) => value === 0)).toBe(true);
		expect(hits.elementFromPoint(rectangle.x + 1, rectangle.y + 1)).toBe(image);
		expect(snapshotDocument(tree).entries).toEqual(before.entries);
		expect(
			documentInteractions(tree).click(tree.reference(image)).defaultAction,
		).toEqual({
			kind: "navigate",
			url: "https://www.libpng.org/next",
			target: "_self",
		});
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
		expect(tree.get(image).children).toEqual([]);
		expect(snapshotDocument(tree).entries).toEqual(
			before.entries.map((entry) =>
				entry.ref === tree.reference(link)
					? { ...entry, focused: true }
					: entry,
			),
		);
	} finally {
		query.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(images.metrics()).toMatchObject({ closed: true, decodedBytes: 0 });
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
});
