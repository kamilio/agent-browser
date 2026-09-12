import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it("coordinates a native inline-block beside a floated sibling", () => {
	const tree = parseHtmlDocument(
		"<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:16px;background:blue}#atomic{display:inline-block;width:12px;height:8px;background:red}</style><main><span id=float></span><span id=atomic></span></main>",
		"https://fixture.invalid/float-atomic",
	);
	try {
		documentStyles(tree).setViewport(64, 48);
		const query = new DocumentQueries(tree);
		const atomic = query.querySelector("#atomic");
		const floated = query.querySelector("#float");
		if (atomic === null || floated === null)
			throw new Error("Missing float/atomic fixture nodes");
		const geometry = documentGeometry(tree);
		expect(geometry.getBoundingClientRect(floated)).toMatchObject({
			x: 0,
			y: 0,
			width: 8,
			height: 16,
		});
		const rect = geometry.getBoundingClientRect(atomic);
		expect(rect.x).toBe(8);
		expect(rect.width).toBe(12);
		expect(rect.height).toBe(8);
		expect(documentHitTesting(tree).elementFromPoint(10, rect.y + 2)).toBe(
			atomic,
		);
		const image = rasterizeDocument(tree, {
			clip: { x: 10, y: rect.y + 2, width: 1, height: 1 },
		}).image;
		expect([...image.pixels]).toEqual([255, 0, 0, 255]);
		query.close();
	} finally {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});
