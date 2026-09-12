import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";

it("lays out and hits percentage-width cells with resolved collapsed borders", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0}table{width:200px;border-collapse:collapse}td{padding:0;width:50%;height:20px}</style><table><tr><td id="first">A</td><td id="second">B</td></tr></table>',
		"https://fixture.invalid/percentage-table",
	);
	try {
		const queries = new DocumentQueries(tree);
		const first = queries.querySelector("#first");
		const second = queries.querySelector("#second");
		if (first === null || second === null) throw new Error("Missing cell");
		const geometry = documentGeometry(tree);
		expect(geometry.getBoundingClientRect(first)).toMatchObject({
			x: 0,
			y: 0,
			width: 100,
		});
		expect(geometry.getBoundingClientRect(second)).toMatchObject({
			x: 100,
			y: 0,
			width: 100,
		});
		expect(documentHitTesting(tree).elementFromPoint(2, 2)).toBe(first);
		expect(documentHitTesting(tree).elementFromPoint(102, 2)).toBe(second);
		expect(
			buildFormattingTree(tree).issues[
				"table-collapsed-borders-not-supported"
			] ?? 0,
		).toBe(0);
	} finally {
		tree.close();
	}
});
