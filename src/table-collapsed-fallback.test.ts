import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it("lays out and paints one shared collapsed border without double alpha", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;background:white;font-size:8px;line-height:8px}table{border-collapse:collapse;border-spacing:20px;width:40px}td{padding:0;border:2px solid rgba(255,0,0,0.5);height:8px}</style><body><table><tr><td id="first">A</td><td id="second">B</td></tr></table>',
		"https://fixture.invalid/collapsed-border",
	);
	try {
		documentStyles(tree).setViewport(64, 32);
		const queries = new DocumentQueries(tree);
		const first = queries.querySelector("#first");
		const second = queries.querySelector("#second");
		if (first === null || second === null) throw new Error("Missing cells");
		expect(layoutDocument(tree).boxes.length).toBeGreaterThan(4);
		const geometry = documentGeometry(tree);
		const left = geometry.getBoundingClientRect(first);
		const right = geometry.getBoundingClientRect(second);
		expect(left.right).toBe(right.left);
		expect(left.width).toBeGreaterThan(2);
		expect(right.width).toBeGreaterThan(2);
		const raster = rasterizeDocument(tree);
		const column = Math.floor(left.right);
		const row = Math.floor(left.top + left.height / 2);
		const offset = (row * raster.image.width + column) * 4;
		expect([...raster.image.pixels.slice(offset, offset + 4)]).toEqual([
			255, 127, 127, 255,
		]);
		expect(
			documentHitTesting(tree).elementFromPoint(
				right.left + right.width / 2,
				right.top + right.height / 2,
			),
		).toBe(second);
	} finally {
		tree.close();
	}
	expect(tree.nodeCount).toBe(0);
});
