import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it.each([
	{
		kind: "flex",
		style: "#shell{display:flex}#content{width:32px}",
		markup: '<div id="shell"><div id="content"></div></div>',
	},
	{
		kind: "grid",
		style:
			"#shell{display:grid;grid-template-columns:32px;grid-template-rows:8px}",
		markup: '<div id="shell"><div id="content"></div></div>',
	},
	{
		kind: "table",
		style: "#shell{border-spacing:0}td{padding:0}",
		markup: '<table id="shell"><tr><td id="content"></td></tr></table>',
	},
])(
	"coordinates a full-width $kind shell after a float",
	({ style, markup }) => {
		const tree = parseHtmlDocument(
			`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:16px;background:blue}#shell{width:32px}#content{height:8px;background:red}#after{height:4px}${style}</style><main><div id="float"></div>${markup}<div id="after"></div></main>`,
			"https://fixture.invalid/float-shell",
		);
		try {
			documentStyles(tree).setViewport(64, 64);
			const queries = new DocumentQueries(tree);
			const float = queries.querySelector("#float");
			const shell = queries.querySelector("#shell");
			const content = queries.querySelector("#content");
			const after = queries.querySelector("#after");
			if (
				float === null ||
				shell === null ||
				content === null ||
				after === null
			)
				throw new Error("Missing native float-shell fixture");
			const geometry = documentGeometry(tree);
			expect(geometry.getBoundingClientRect(float)).toMatchObject({
				x: 0,
				y: 0,
				width: 8,
				height: 16,
			});
			expect(geometry.getBoundingClientRect(shell)).toMatchObject({
				x: 0,
				y: 16,
				width: 32,
				height: 8,
			});
			expect(geometry.getBoundingClientRect(after).y).toBe(24);
			const hits = documentHitTesting(tree);
			expect(hits.elementFromPoint(2, 2)).toBe(float);
			expect(hits.elementFromPoint(2, 18)).toBe(content);
			const image = rasterizeDocument(tree).image;
			const blue = (2 * image.width + 2) * 4;
			const red = (18 * image.width + 2) * 4;
			expect([...image.pixels.slice(blue, blue + 4)]).toEqual([0, 0, 255, 255]);
			expect([...image.pixels.slice(red, red + 4)]).toEqual([255, 0, 0, 255]);
		} finally {
			tree.close();
		}
	},
);
