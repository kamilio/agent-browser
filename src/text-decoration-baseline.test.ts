import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

function rendered(declaration: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}#target{font-size:16px;line-height:16px;width:24px;color:black;${declaration}}</style><div id="target">AA</div>`,
		"https://fixture.invalid/text-decoration",
	);
	const queries = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		const styles = documentStyles(tree);
		styles.setViewport(48, 32);
		const target = queries.querySelector("#target");
		if (target === null) throw new Error("Missing decoration fixture");
		const before = snapshotDocument(tree);
		const result = {
			rectangle: geometry.getBoundingClientRect(target),
			underlineHit: hits.elementFromPoint(1, 15) === target,
			pixels: Array.from(rasterizeDocument(tree).image.pixels),
		};
		expect(styles.metrics().issues).toEqual({});
		expect(snapshotDocument(tree)).toEqual(before);
		return result;
	} finally {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
}

it.each(["none", "underline red"])(
	"renders real native text-decoration:%s without changing geometry",
	(value) => {
		const expected = rendered("");
		expect(expected.rectangle).toMatchObject({
			x: 0,
			y: 0,
			width: 24,
			height: 16,
		});
		expect(expected.underlineHit).toBe(true);
		if (value !== "none")
			for (let column = 0; column < 24; column++)
				expected.pixels.splice((15 * 48 + column) * 4, 4, 255, 0, 0, 255);
		expect(rendered(`text-decoration:${value}`)).toEqual(expected);
	},
);
