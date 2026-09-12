import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it("paints and hit-tests a row carrying the captured Libpng green hint", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;font-size:10px;line-height:10px}table{width:100px;border-spacing:2px}tr{height:30px}</style><table><tbody><tr id="row" bgcolor="#007000"></tr></tbody></table>',
		"https://fixture.invalid/legacy-row-background",
	);
	const queries = new DocumentQueries(tree);
	try {
		documentStyles(tree).setViewport(160, 140);
		const row = queries.querySelector("#row");
		if (row === null) throw new Error("Missing background row");
		const revision = tree.revision;
		expect(documentGeometry(tree).getBoundingClientRect(row)).toMatchObject({
			x: 0,
			y: 2,
			width: 100,
			height: 30,
		});
		const image = rasterizeDocument(tree).image;
		const offset = (10 * image.width + 50) * 4;
		expect([...image.pixels.slice(offset, offset + 4)]).toEqual([
			0, 112, 0, 255,
		]);
		expect(documentHitTesting(tree).elementFromPoint(50, 10)).toBe(row);
		expect(tree.get(row).attributes.bgcolor).toBe("#007000");
		expect(tree.revision).toBe(revision);
	} finally {
		queries.close();
		tree.close();
	}
});

it.each(["separate", "collapse"])(
	"keeps CSS rowspan backgrounds above every row in %s tables",
	(collapse) => {
		const tree = parseHtmlDocument(
			`<!doctype html><style>html,body{margin:0;font-size:8px;line-height:8px}table{width:120px;border-spacing:3px;border-collapse:${collapse}}tr{height:18px}td{padding:0;vertical-align:top}#group{background:green}#first{background:yellow}#second{background:blue}#tall{background:red}</style><table><tbody id="group"><tr id="first"><td id="tall" rowspan="2"></td><td></td></tr><tr id="second"><td id="short"></td></tr></tbody></table>`,
			"https://fixture.invalid/css-rowspan-background",
		);
		const queries = new DocumentQueries(tree);
		try {
			documentStyles(tree).setViewport(160, 140);
			const tall = queries.querySelector("#tall");
			const short = queries.querySelector("#short");
			if (tall === null || short === null)
				throw new Error("Missing rowspan fixture cells");
			const tallRect = documentGeometry(tree).getBoundingClientRect(tall);
			const shortRect = documentGeometry(tree).getBoundingClientRect(short);
			const horizontal = Math.floor(tallRect.x + tallRect.width / 2);
			const vertical = Math.floor(shortRect.y + shortRect.height / 2);
			const image = rasterizeDocument(tree).image;
			const offset = (vertical * image.width + horizontal) * 4;
			expect([...image.pixels.slice(offset, offset + 4)]).toEqual([
				255, 0, 0, 255,
			]);
			expect(
				documentHitTesting(tree).elementFromPoint(horizontal, vertical),
			).toBe(tall);
		} finally {
			queries.close();
			tree.close();
		}
	},
);
