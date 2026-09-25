import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it.each([
	{ name: "center defaults", style: "", left: 6, top: 4 },
	{
		name: "author start alignment",
		style: "button{text-align:left;align-content:start}",
		left: 0,
		top: 0,
	},
])("lays out a real HTML button child with $name", ({ style, left, top }) => {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body,button{margin:0;padding:0;font-size:8px;line-height:8px}button{display:inline-block;width:24px;height:16px;border:0;background:white;font-size:0;line-height:0}#content{display:inline-block;width:12px;height:8px;background:red}${style}</style><button id="button" type="button"><span id="content"></span></button>`,
		"https://fixture.invalid/rich-button-geometry",
	);
	const queries = new DocumentQueries(tree);
	try {
		documentStyles(tree).setViewport(64, 64);
		const button = queries.querySelector("#button");
		const content = queries.querySelector("#content");
		if (button === null || content === null)
			throw new Error("Missing native rich-button fixture");
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const geometry = documentGeometry(tree);
		expect(geometry.getBoundingClientRect(button)).toMatchObject({
			x: 0,
			y: 0,
			width: 24,
			height: 16,
		});
		expect(geometry.getBoundingClientRect(content)).toMatchObject({
			x: left,
			y: top,
			width: 12,
			height: 8,
		});
		const formatting = buildFormattingTree(tree);
		expect(
			formatting.nodes.find((node) => node.ref === tree.reference(button)),
		).toMatchObject({ kind: "block", independentContext: true });
		expect(
			formatting.nodes.some((node) => node.ref === tree.reference(content)),
		).toBe(true);
		const hits = documentHitTesting(tree);
		expect(hits.elementFromPoint(left + 1, top + 1)).toBe(content);
		expect(hits.elementFromPoint(22, 14)).toBe(button);
		const image = rasterizeDocument(tree).image;
		const offset = ((top + 1) * image.width + left + 1) * 4;
		expect([...image.pixels.slice(offset, offset + 4)]).toEqual([
			255, 0, 0, 255,
		]);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	} finally {
		queries.close();
		tree.close();
	}
});

it.each([
	{ fontSize: 8, lineHeight: 8, height: 9 },
	{ fontSize: 0, lineHeight: 0, height: 8 },
])(
	"measures the inline strut beside an empty atomic child at font size $fontSize",
	({ fontSize, lineHeight, height }) => {
		const tree = parseHtmlDocument(
			`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}#box{display:inline-block;width:24px;font-size:${fontSize}px;line-height:${lineHeight}px}#content{display:inline-block;width:12px;height:8px}</style><div id="box"><span id="content"></span></div>`,
			"https://fixture.invalid/button-strut-comparator",
		);
		const queries = new DocumentQueries(tree);
		try {
			documentStyles(tree).setViewport(64, 64);
			const box = queries.querySelector("#box");
			const content = queries.querySelector("#content");
			if (box === null || content === null)
				throw new Error("Missing native strut comparator");
			const geometry = documentGeometry(tree);
			expect(geometry.getBoundingClientRect(box)).toMatchObject({
				width: 24,
				height,
			});
			expect(geometry.getBoundingClientRect(content)).toMatchObject({
				width: 12,
				height: 8,
			});
		} finally {
			queries.close();
			tree.close();
		}
	},
);
