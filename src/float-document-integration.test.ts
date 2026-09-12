import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it("baseline: native float wraps text without advancing normal block flow", () => {
	const tree = parseHtmlDocument(
		"<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:24px}#float{float:left;width:8px;height:16px;background:red}#after{width:8px;height:8px}</style><main id=main><span id=float></span>AA BB CC</main><div id=after></div>",
		"https://fixture.invalid/float-document",
	);
	try {
		documentStyles(tree).setViewport(64, 64);
		const queries = new DocumentQueries(tree);
		const float = queries.querySelector("#float");
		const main = queries.querySelector("#main");
		const after = queries.querySelector("#after");
		if (float === null || main === null || after === null)
			throw new Error("Missing native float fixture");
		const geometry = documentGeometry(tree);
		expect(geometry.getBoundingClientRect(float)).toMatchObject({
			x: 0,
			y: 0,
			width: 8,
			height: 16,
		});
		expect(geometry.getBoundingClientRect(main)).toMatchObject({
			width: 24,
			height: 24,
		});
		expect(geometry.getBoundingClientRect(after).y).toBe(24);
		const context = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(main),
		);
		expect(context?.lines.map((line) => line.top)).toEqual([0, 8, 16]);
		expect(
			context?.glyphs
				.filter((glyph) => glyph.character !== " ")
				.map((glyph) => glyph.x),
		).toEqual([8, 14, 8, 14, 0, 6]);
		expect(documentHitTesting(tree).elementFromPoint(2, 2)).toBe(float);
		const image = rasterizeDocument(tree).image;
		expect([...image.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
	} finally {
		tree.close();
	}
});
