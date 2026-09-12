import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it("lays out valid rules while retaining the discarded zlib stylesheet tail", () => {
	const stylesheet =
		"\n  P { margin-bottom: 0em }\t<!-- http://www.w3.org/TR/REC-CSS2/box.html -->\n";
	const tree = parseHtmlDocument(
		`<!doctype html><style id="captured">${stylesheet}</style><style>html,body{margin:0}p{margin-top:0;height:20px;background:red}</style><p id="first"></p><p id="second"></p>`,
		"https://fixture.invalid/css-rule-recovery",
	);
	try {
		const queries = new DocumentQueries(tree);
		const captured = queries.querySelector("#captured");
		const first = queries.querySelector("#first");
		const second = queries.querySelector("#second");
		if (captured === null || first === null || second === null)
			throw new Error("Missing stylesheet recovery fixture node");
		expect(tree.textContent(captured)).toBe(stylesheet);
		expect(documentGeometry(tree).getBoundingClientRect(first)).toMatchObject({
			x: 0,
			y: 0,
			height: 20,
		});
		expect(documentGeometry(tree).getBoundingClientRect(second).y).toBe(20);
		expect(documentHitTesting(tree).elementFromPoint(2, 2)).toBe(first);
		const raster = rasterizeDocument(tree, {
			clip: { x: 0, y: 0, width: 4, height: 4 },
		});
		expect([...raster.image.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
		expect(
			documentStyles(tree).metrics().issues["discarded-incomplete-css-rule"],
		).toBe(1);
		expect(
			buildFormattingTree(tree).issues["css:discarded-incomplete-css-rule"],
		).toBe(1);
		expect(tree.textContent(captured)).toBe(stylesheet);
	} finally {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});
