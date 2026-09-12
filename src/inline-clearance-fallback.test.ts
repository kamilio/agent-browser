import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it("retains an inline link's computed clear without scheduling it as a block clearance owner", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:24px;background:blue}a{clear:left;background:red}#cleared{clear:both}#after{background:green}</style><main><span id="float"></span><a id="link" href="/next">AA</a><div id="cleared">BB</div><div id="after">CC</div></main>',
		"https://fixture.invalid/inline-clearance",
	);
	const query = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		const styles = documentStyles(tree);
		styles.setViewport(64, 64);
		const id = (selector: string) => {
			const found = query.querySelector(selector);
			if (found === null) throw new Error(`Missing ${selector}`);
			return found;
		};
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const layout = layoutDocument(tree);
		expect(styles.flow(id("#link")).clear).toBe("left");
		expect(styles.metrics().issues).toEqual({});
		const formatting = buildFormattingTree(tree);
		expect(
			formatting.nodes.find((node) => node.ref === tree.reference(id("#link")))
				?.clear,
		).toBeUndefined();
		expect(formatting.issues).toEqual({
			"float-layout-not-supported": 1,
			"clear-layout-not-supported": 1,
		});
		expect(geometry.getBoundingClientRect(id("#link"))).toMatchObject({
			x: 8,
			y: 0,
			width: 12,
			height: 8,
		});
		expect(geometry.getBoundingClientRect(id("#cleared"))).toMatchObject({
			x: 0,
			y: 24,
			width: 32,
			height: 8,
		});
		expect(geometry.getBoundingClientRect(id("#after"))).toMatchObject({
			x: 0,
			y: 32,
			width: 32,
			height: 8,
		});
		expect(hits.elementFromPoint(9, 1)).toBe(id("#link"));
		expect([
			...rasterizeDocument(tree, { clip: { x: 19, y: 7, width: 1, height: 1 } })
				.image.pixels,
		]).toEqual([255, 0, 0, 255]);
		expect(
			layout.contexts
				.flatMap((context) => context.glyphs)
				.some(
					(glyph) => glyph.character === "A" && glyph.x === 8 && glyph.y === 0,
				),
		).toBe(true);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	} finally {
		query.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(query.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
});
