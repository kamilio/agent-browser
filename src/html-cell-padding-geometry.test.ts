import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it.each([
	{ label: "CSS control", attribute: undefined, css: "5px", padding: 5 },
	{ label: "HTML hint", attribute: "5", css: undefined, padding: 5 },
	{ label: "integer prefix", attribute: "+005px", css: undefined, padding: 5 },
	{ label: "negative zero", attribute: "-000", css: undefined, padding: 0 },
])(
	"resolves and paints cell padding for $label",
	({ attribute, css, padding }) => {
		const hint = attribute === undefined ? "" : ` cellpadding="${attribute}"`;
		const declaration = css === undefined ? "" : `padding:${css};`;
		const tree = parseHtmlDocument(
			`<!doctype html><style>html,body{margin:0;font-size:10px;line-height:10px}table{width:100px;border-spacing:0}td{${declaration}vertical-align:top;background:green}#content{width:10px;height:8px;background:red}</style><table${hint}><tr><td id="cell"><div id="content"></div></td></tr></table>`,
			"https://fixture.invalid/cell-padding",
		);
		const queries = new DocumentQueries(tree);
		try {
			const styles = documentStyles(tree);
			styles.setViewport(160, 100);
			const cell = queries.querySelector("#cell");
			const content = queries.querySelector("#content");
			const table = queries.querySelector("table");
			if (cell === null || content === null || table === null)
				throw new Error("Missing cell-padding fixture element");
			const revision = tree.revision;
			const geometry = documentGeometry(tree);
			expect(geometry.getBoundingClientRect(cell)).toMatchObject({
				x: 0,
				y: 0,
				width: 100,
				height: 8 + padding * 2,
			});
			expect(geometry.getBoundingClientRect(content)).toMatchObject({
				x: padding,
				y: padding,
				width: 10,
				height: 8,
			});
			for (const side of ["top", "right", "bottom", "left"] as const)
				expect(styles.box(cell)[`padding-${side}`]).toBe(`${padding}px`);
			const image = rasterizeDocument(tree).image;
			const backgroundOffset = (4 * image.width + 80) * 4;
			const contentOffset = ((padding + 1) * image.width + padding + 1) * 4;
			expect([
				...image.pixels.slice(backgroundOffset, backgroundOffset + 4),
			]).toEqual([0, 128, 0, 255]);
			expect([...image.pixels.slice(contentOffset, contentOffset + 4)]).toEqual(
				[255, 0, 0, 255],
			);
			expect(documentHitTesting(tree).elementFromPoint(80, 4)).toBe(cell);
			expect(
				documentHitTesting(tree).elementFromPoint(padding + 1, padding + 1),
			).toBe(content);
			expect(tree.get(table).attributes.cellpadding).toBe(attribute);
			expect(tree.revision).toBe(revision);
		} finally {
			queries.close();
			tree.close();
		}
	},
);
