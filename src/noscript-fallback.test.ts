import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it("lays out and owns disabled-scripting noscript fallback instead of deferring it", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}</style><body><noscript><span id="fallback">Ready</span></noscript>',
		"https://fixture.invalid/noscript-fallback",
	);
	try {
		documentStyles(tree).setViewport(96, 32);
		expect(htmlParseInfo(tree)?.scripting).toBe(false);
		const fallback = new DocumentQueries(tree).querySelector("#fallback");
		if (fallback === null) throw new Error("Missing parsed fallback");
		expect(tree.get(tree.get(fallback).parent ?? -1).tagName).toBe("noscript");
		expect(
			documentGeometry(tree).getBoundingClientRect(fallback),
		).toMatchObject({
			x: 0,
			y: 0,
			width: 30,
			height: 8,
		});
		expect(
			layoutDocument(tree)
				.contexts.flatMap((context) => context.glyphs)
				.map((glyph) => glyph.character)
				.join(""),
		).toBe("Ready");
		expect(documentHitTesting(tree).elementFromPoint(1, 1)).toBe(fallback);
		expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(5);
	} finally {
		tree.close();
	}
});
