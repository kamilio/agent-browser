import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it("lays out and paints a loaded GIF inside the native center without suppressing source", async () => {
	const bytes = Uint8Array.from([
		71, 73, 70, 56, 55, 97, 2, 0, 1, 0, 128, 0, 0, 255, 0, 0, 0, 0, 255, 44, 0,
		0, 0, 0, 2, 0, 1, 0, 0, 2, 2, 68, 10, 0, 59,
	]);
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:20px}img{display:block}</style><main><center><img id="image" src="/logo.gif"><a id="link" href="/next">AA</a></center></main>',
		"https://fixture.invalid/gif-fallback",
	);
	const query = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	let requests = 0;
	const images = documentImages(tree, {
		fetch: async (url) => {
			requests++;
			return {
				url,
				status: 200,
				headers: { "content-type": ["image/gif"] },
				body: bytes,
				encodedBytes: bytes.length,
				redirects: [],
				elapsedMs: 0,
			};
		},
	});
	try {
		documentStyles(tree).setViewport(32, 32);
		await images.settle();
		const image = query.querySelector("#image");
		const link = query.querySelector("#link");
		if (image === null || link === null) throw new Error("Missing GIF fixture");
		const before = snapshotDocument(tree);
		expect(geometry.getBoundingClientRect(image)).toMatchObject({
			x: 9,
			y: 0,
			width: 2,
			height: 1,
		});
		expect(geometry.getBoundingClientRect(link)).toMatchObject({
			x: 4,
			y: 1,
			width: 12,
			height: 8,
		});
		expect([
			...rasterizeDocument(tree, {
				clip: { x: 9, y: 0, width: 2, height: 1 },
			}).image.pixels,
		]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
		expect(hits.elementFromPoint(5, 2)).toBe(link);
		expect(requests).toBe(1);
		expect(images.get(image)).toMatchObject({
			state: "complete",
			naturalWidth: 2,
			naturalHeight: 1,
			mediaType: "image/gif",
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
