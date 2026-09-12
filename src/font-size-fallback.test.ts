import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it("lays out and paints the captured x-large keyword without dropping its declaration", () => {
	const stylesheet =
		"html,body{margin:0;padding:0;line-height:1}#target{display:inline-block;font-size:x-large;background:red}";
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">${stylesheet}</style><span id="target">AA</span>`,
		"https://fixture.invalid/font-size-keyword",
	);
	try {
		documentStyles(tree).setViewport(64, 64);
		const query = new DocumentQueries(tree);
		const target = query.querySelector("#target");
		const sheet = query.querySelector("#sheet");
		if (target === null || sheet === null)
			throw new Error("Missing font-size fixture node");
		expect(tree.textContent(sheet)).toBe(stylesheet);
		expect(documentGeometry(tree).getBoundingClientRect(target)).toMatchObject({
			x: 0,
			y: 0,
			width: 36,
			height: 24,
		});
		expect(documentStyles(tree).text(target)["font-size"]).toBe("24px");
		expect(documentHitTesting(tree).elementFromPoint(35, 23)).toBe(target);
		const image = rasterizeDocument(tree, {
			clip: { x: 35, y: 23, width: 1, height: 1 },
		}).image;
		expect([...image.pixels]).toEqual([255, 0, 0, 255]);
		expect(tree.textContent(sheet)).toBe(stylesheet);
		query.close();
	} finally {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});
