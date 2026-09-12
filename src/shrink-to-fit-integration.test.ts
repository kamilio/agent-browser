import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("baseline: inline block shrink-to-fit preserves native layout", () => {
	const tree = parseHtmlDocument(
		"<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:30px}#target{display:inline-block;padding:2px;border:1px solid red;background:blue;margin:0 auto}#after{width:8px;height:8px}</style><main><span id=target>AAAA BB</span></main><div id=after></div>",
		"https://fixture.invalid/shrink-to-fit",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(96, 64);
	const queries = new DocumentQueries(tree);
	const target = queries.querySelector("#target");
	const after = queries.querySelector("#after");
	if (target === null || after === null) throw new Error("Missing native box");
	const geometry = documentGeometry(tree);
	expect(geometry.getBoundingClientRect(target)).toMatchObject({
		x: 0,
		y: 0,
		width: 30,
		height: 22,
	});
	expect(geometry.getBoundingClientRect(after).y).toBe(22);
	const box = layoutDocument(tree).boxes.find(
		(entry) => entry.ref === tree.reference(target),
	);
	expect(box).toMatchObject({
		contentWidth: 24,
		marginLeft: 0,
		marginRight: 0,
	});
	expect(documentHitTesting(tree).elementFromPoint(2, 2)).toBe(target);
	const image = rasterizeDocument(tree).image;
	expect([...image.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
	const inside = (image.width + 1) * 4;
	expect([...image.pixels.slice(inside, inside + 4)]).toEqual([0, 0, 255, 255]);
});
