import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: {
	tree: ReturnType<typeof parseHtmlDocument>;
	queries: DocumentQueries;
}[] = [];

afterEach(() => {
	for (const { tree, queries } of documents.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(css: string, markup: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:80px;background:white}${css}</style><main id="main">${markup}</main>`,
		"https://fixture.invalid/float-applicability",
	);
	documentStyles(tree).setViewport(96, 40);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing float fixture ${selector}`);
		return found;
	};
	const value = {
		tree,
		queries,
		id,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
	documents.push(value);
	return value;
}

it.each(["flex", "grid"])(
	"keeps ignored %s-item floats in their actual item positions and hit regions",
	(display) => {
		const css = `main{display:${display};height:24px;column-gap:8px;align-items:start;${display === "grid" ? "grid-template-columns:16px 24px" : ""}}#first{width:16px;height:12px;background:red}#second{width:24px;height:8px;background:blue}`;
		const markup = '<div id="first"></div><div id="second"></div>';
		const actual = fixture(
			`${css}#first{float:left}#second{float:right}`,
			markup,
		);
		const control = fixture(css, markup);
		const before = snapshotDocument(actual.tree);
		expect(documentStyles(actual.tree).flow(actual.id("#first")).float).toBe(
			"left",
		);
		expect(documentStyles(actual.tree).flow(actual.id("#second")).float).toBe(
			"right",
		);
		const formatting = buildFormattingTree(actual.tree);
		expect(formatting.issues["float-layout-not-supported"]).toBeUndefined();
		expect(
			formatting.nodes.filter((node) => node.floatSide !== undefined),
		).toEqual([]);
		for (const selector of ["#main", "#first", "#second"])
			expect(actual.rect(selector)).toEqual(control.rect(selector));
		expect(actual.rect("#first")).toMatchObject({
			x: 0,
			y: 0,
			width: 16,
			height: 12,
		});
		expect(actual.rect("#second")).toMatchObject({
			x: 24,
			y: 0,
			width: 24,
			height: 8,
		});
		expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
			rasterizeDocument(control.tree).image.pixels,
		);
		const hits = documentHitTesting(actual.tree);
		expect(hits.elementFromPoint(8, 4)).toBe(actual.id("#first"));
		expect(hits.elementFromPoint(32, 4)).toBe(actual.id("#second"));
		expect(hits.elementFromPoint(20, 4)).toBe(actual.id("#main"));
		expect(snapshotDocument(actual.tree)).toEqual(before);
	},
);

it("does not give a boxless float diagnostic to its genuinely floating descendant", () => {
	const css =
		"#boxless{display:contents}#float{float:left;width:16px;height:12px;background:red}#after{height:8px;background:blue}#cleared{clear:both;height:4px;background:green}";
	const markup =
		'<div id="boxless"><div id="float"></div><div id="after"></div></div><div id="cleared"></div>';
	const actual = fixture(`${css}#boxless{float:right}`, markup);
	const control = fixture(css, markup);
	const before = snapshotDocument(actual.tree);
	expect(documentStyles(actual.tree).flow(actual.id("#boxless")).float).toBe(
		"right",
	);
	const formatting = buildFormattingTree(actual.tree);
	expect(formatting.issues["float-layout-not-supported"]).toBe(1);
	expect(
		formatting.nodes
			.filter((node) => node.floatSide !== undefined)
			.map((node) => node.ref),
	).toEqual([actual.tree.reference(actual.id("#float"))]);
	for (const selector of ["#main", "#float", "#after", "#cleared"])
		expect(actual.rect(selector)).toEqual(control.rect(selector));
	expect(actual.rect("#float")).toMatchObject({
		x: 0,
		y: 0,
		width: 16,
		height: 12,
	});
	expect(actual.rect("#cleared")).toMatchObject({
		x: 0,
		y: 12,
		width: 80,
		height: 4,
	});
	expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
		rasterizeDocument(control.tree).image.pixels,
	);
	expect(documentHitTesting(actual.tree).elementFromPoint(8, 4)).toBe(
		actual.id("#float"),
	);
	expect(snapshotDocument(actual.tree)).toEqual(before);
});
