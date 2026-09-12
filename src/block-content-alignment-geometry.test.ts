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
	{
		name: "centered block",
		alignment: "center",
		parent: "block",
		child: "display:block",
		top: 4,
	},
	{
		name: "end-aligned block",
		alignment: "end",
		parent: "block",
		child: "display:block",
		top: 8,
	},
	{
		name: "centered inline atom",
		alignment: "center",
		parent: "inline-block",
		child: "display:inline-block",
		top: 4,
	},
	{
		name: "centered physical float",
		alignment: "center",
		parent: "block",
		child: "display:block;float:left",
		top: 4,
	},
])(
	"coordinates a $name without moving its container",
	({ alignment, parent, child, top }) => {
		const tree = parseHtmlDocument(
			`<!doctype html><style>html,body,div{margin:0;padding:0;border:0;font-size:0;line-height:0}#parent{display:${parent};width:24px;height:16px;background:white;align-content:${alignment}}#child{${child};width:12px;height:8px;background:red}</style><div id="parent"><div id="child"></div></div>`,
			"https://fixture.invalid/block-content-alignment",
		);
		const queries = new DocumentQueries(tree);
		try {
			documentStyles(tree).setViewport(64, 64);
			const container = queries.querySelector("#parent");
			const content = queries.querySelector("#child");
			if (container === null || content === null)
				throw new Error("Missing block-alignment fixture");
			const before = snapshotDocument(tree);
			const revision = tree.revision;
			const geometry = documentGeometry(tree);
			expect(geometry.getBoundingClientRect(container)).toMatchObject({
				x: 0,
				y: 0,
				width: 24,
				height: 16,
			});
			expect(geometry.getBoundingClientRect(content)).toMatchObject({
				x: 0,
				y: top,
				width: 12,
				height: 8,
			});
			const formatting = buildFormattingTree(tree);
			expect(
				formatting.nodes.find((node) => node.ref === tree.reference(container)),
			).toMatchObject({ kind: "block", independentContext: true });
			const hits = documentHitTesting(tree);
			expect(hits.elementFromPoint(1, top + 1)).toBe(content);
			expect(hits.elementFromPoint(23, 14)).toBe(container);
			const image = rasterizeDocument(tree).image;
			const offset = ((top + 1) * image.width + 1) * 4;
			expect([...image.pixels.slice(offset, offset + 4)]).toEqual([
				255, 0, 0, 255,
			]);
			expect(tree.revision).toBe(revision);
			expect(snapshotDocument(tree)).toEqual(before);
		} finally {
			queries.close();
			tree.close();
		}
	},
);
