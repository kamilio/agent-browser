import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(spacing: number, hint: boolean) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;font-size:8px;line-height:8px}table{width:100px;background:blue;border-collapse:separate;${hint ? "" : `border-spacing:${spacing}px`}}td{padding:0;vertical-align:top;background:red}div{width:10px;height:8px}</style><table id="table"${hint ? ` cellspacing="${spacing}"` : ""}><tr><td id="first"><div></div></td><td id="second"><div></div></td></tr></table>`,
		"https://fixture.invalid/cell-spacing",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(120, 40);
	const queries = new DocumentQueries(tree);
	const table = queries.querySelector("#table");
	const first = queries.querySelector("#first");
	const second = queries.querySelector("#second");
	queries.close();
	if (table === null || first === null || second === null)
		throw new Error("Missing cell spacing fixture");
	return { tree, table, first, second };
}

it.each([0, 5])(
	"uses cellspacing=%s for actual gaps, pixels and hit identity",
	(spacing) => {
		const actual = fixture(spacing, true);
		const control = fixture(spacing, false);
		const before = snapshotDocument(actual.tree);
		expect(
			documentStyles(actual.tree).table(actual.table)["border-spacing"],
		).toBe(`${spacing}px ${spacing}px`);
		const formatting = buildFormattingTree(actual.tree);
		expect(
			formatting.issues["html-table-presentation-hint-not-supported"],
		).toBeUndefined();
		const geometry = documentGeometry(actual.tree);
		for (const key of ["table", "first", "second"] as const)
			expect(geometry.getBoundingClientRect(actual[key])).toEqual(
				documentGeometry(control.tree).getBoundingClientRect(control[key]),
			);
		expect(geometry.getBoundingClientRect(actual.first)).toMatchObject({
			x: spacing,
			y: spacing,
			width: (100 - spacing * 3) / 2,
			height: 8,
		});
		expect(geometry.getBoundingClientRect(actual.second).x).toBe(
			(100 - spacing * 3) / 2 + spacing * 2,
		);
		expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
			rasterizeDocument(control.tree).image.pixels,
		);
		expect(
			documentHitTesting(actual.tree).elementFromPoint(
				spacing + 20,
				spacing + 4,
			),
		).toBe(actual.first);
		if (spacing > 0)
			expect(documentHitTesting(actual.tree).elementFromPoint(2, 2)).toBe(
				actual.table,
			);
		expect(snapshotDocument(actual.tree)).toEqual(before);
	},
);
