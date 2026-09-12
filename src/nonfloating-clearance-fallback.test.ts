import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it("clears a normal block below a float margin box without moving earlier lines or duplicating owners", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:24px;margin-bottom:4px;background:blue}#cleared{clear:both;background:red}#after{background:green}</style><main id="main"><div id="before"><span id="float"></span>AA</div><div id="cleared">BB</div><div id="after">CC</div></main>',
		"https://fixture.invalid/nonfloating-clearance",
	);
	const query = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	try {
		documentStyles(tree).setViewport(64, 64);
		const id = (selector: string) => {
			const found = query.querySelector(selector);
			if (found === null) throw new Error(`Missing ${selector}`);
			return found;
		};
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const layout = layoutDocument(tree);
		for (const [selector, expected] of [
			["#main", { x: 0, y: 0, width: 32, height: 44 }],
			["#before", { x: 0, y: 0, width: 32, height: 8 }],
			["#float", { x: 0, y: 0, width: 8, height: 24 }],
			["#cleared", { x: 0, y: 28, width: 32, height: 8 }],
			["#after", { x: 0, y: 36, width: 32, height: 8 }],
		] as const) {
			const node = id(selector);
			expect(geometry.getBoundingClientRect(node)).toMatchObject(expected);
			expect(
				layout.boxes.filter((box) => box.ref === tree.reference(node)),
			).toHaveLength(1);
		}
		for (const [selector, character, left, top] of [
			["#before", "A", 8, 0],
			["#cleared", "B", 0, 28],
			["#after", "C", 0, 36],
		] as const) {
			const contexts = layout.contexts.filter(
				(context) => context.ref === tree.reference(id(selector)),
			);
			expect(contexts).toHaveLength(1);
			expect(contexts[0].lines.map((line) => [line.top, line.height])).toEqual([
				[top, 8],
			]);
			expect(
				contexts[0].glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
			).toEqual([
				[character, left, top],
				[character, left + 6, top],
			]);
		}
		expect(hits.elementFromPoint(1, 1)).toBe(id("#float"));
		expect(hits.elementFromPoint(30, 1)).toBe(id("#before"));
		expect(hits.elementFromPoint(30, 29)).toBe(id("#cleared"));
		expect(hits.elementFromPoint(30, 37)).toBe(id("#after"));
		expect([
			...rasterizeDocument(tree, {
				clip: { x: 30, y: 29, width: 1, height: 1 },
			}).image.pixels,
		]).toEqual([255, 0, 0, 255]);
		expect(Object.isFrozen(layout.boxes)).toBe(true);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	} finally {
		query.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(query.metrics()).toMatchObject({
			closed: true,
			cachedSelectors: 0,
			indexedNodes: 0,
		});
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
});
