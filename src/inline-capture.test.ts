import { afterEach, expect, it, vi } from "vitest";
import { LayoutGeometry, documentGeometry } from "./document-geometry.js";
import * as documentLayout from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
function fixture(content: string, mainStyle = "", targetStyle = "") {
	const tree = parseHtmlDocument(
		`<main style="font-size:8px;width:18px;${mainStyle}"><span id="target" style="${targetStyle}">${content}</span></main>`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(80, 80);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target");
	if (id === null) throw new Error("Missing target");
	const ref = tree.reference(id);
	return {
		tree,
		id,
		ref,
		capture: () => rasterizeDocument(tree, { element: ref }),
	};
}
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

function expectViewportCrop(
	tree: DocumentTree,
	result: ReturnType<typeof rasterizeDocument>,
) {
	const viewport = rasterizeDocument(tree);
	for (let row = 0; row < result.image.height; row++) {
		const start =
			((row + result.clip.y) * viewport.image.width + result.clip.x) * 4;
		expect(
			result.image.pixels.subarray(
				row * result.image.width * 4,
				(row + 1) * result.image.width * 4,
			),
		).toEqual(
			viewport.image.pixels.subarray(start, start + result.image.width * 4),
		);
	}
}

it("captures the union of wrapped inline boxes without changing viewport or wrapping", () => {
	const { tree, id, capture } = fixture(
		"ab cd",
		"background-color:navy",
		"color:white;background-color:blue",
	);
	const revision = tree.revision;
	const result = capture();
	expect(result.clip).toEqual({ x: 0, y: 1, width: 12, height: 18 });
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject(
		result.clip,
	);
	expect(result.layout.text.horizontal.formatting.viewport).toEqual({
		width: 80,
		height: 80,
	});
	expectViewportCrop(tree, result);
	expect([...result.image.pixels.subarray(8 * 12 * 4, 8 * 12 * 4 + 4)]).toEqual(
		[0, 0, 128, 255],
	);
	expect(tree.revision).toBe(revision);
});

it("rounds fractional inline font boxes and vertical padding outward", () => {
	const { tree, capture } = fixture(
		"ab",
		"width:40px;font-size:9px;padding:1.5px;margin:3.25px",
		"padding-top:0.75px;padding-bottom:1.25px;background-color:blue",
	);
	const result = capture();
	expect(result.clip).toEqual({ x: 4, y: 5, width: 15, height: 12 });
	expectViewportCrop(tree, result);
});

it("uses the target's own font box rather than expanding to overflowing descendant ink", () => {
	const { tree, capture } = fixture('a<span style="font-size:16px">b</span>');
	const result = capture();
	expect(result.clip).toEqual({ x: 0, y: 9, width: 18, height: 8 });
	expectViewportCrop(tree, result);
});

it.each([
	[100, 100],
	[-3, -4],
])(
	"captures document-space bounds outside the viewport at %s,%s",
	(left, top) => {
		const { tree, capture } = fixture(
			"A",
			`margin-left:${left}px;margin-top:${top}px`,
		);
		const result = capture();
		expect(result.clip).toEqual({ x: left, y: top + 1, width: 6, height: 8 });
		expect([...result.image.pixels.subarray(4, 8)]).toEqual([0, 0, 0, 255]);
		expect(documentStyles(tree).viewport).toEqual({ width: 80, height: 80 });
	},
);

it("captures the actual page crop including overlapping content outside the target", () => {
	const tree = parseHtmlDocument(
		'<main style="font-size:8px"><p><span id="target" style="color:red">A</span></p><p style="margin-top:-10px;color:blue">B</p></main>',
		"https://fixture.invalid/",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(80, 80);
	const id = new DocumentQueries(tree).querySelector("#target") as number;
	const result = rasterizeDocument(tree, { element: tree.reference(id) });
	expect(result.clip).toEqual({ x: 0, y: 1, width: 6, height: 8 });
	expectViewportCrop(tree, result);
	expect([...result.image.pixels.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
});

it("captures positive-area whitespace even when there is no glyph ink", () => {
	const { capture } = fixture(" ", "", "white-space:pre");
	const result = capture();
	expect(result.clip).toEqual({ x: 0, y: 1, width: 6, height: 8 });
	expect(result.image.pixels.every((value) => value === 255)).toBe(true);
});

it.each(["", "<br>"])("rejects zero-width inline bounds: %s", (content) => {
	expect(() => fixture(content).capture()).toThrow("no painted area");
});

it.each([
	"display:none",
	"display:contents",
	"visibility:hidden",
	"font-size:0",
])("rejects noncapturable inline geometry: %s", (style) => {
	expect(() => fixture("a", "", style).capture()).toThrow();
});

it("keeps unsupported split-inline ownership explicit", () => {
	expect(() => fixture("a<div>b</div>c").capture()).toThrow("block-in-inline");
});

it("rejects an excessive inline crop through the existing raster bounds", () => {
	expect(() => fixture("a ".repeat(1000), "width:6px").capture()).toThrow();
});

it("extracts capture geometry from its existing layout rather than laying out twice", () => {
	const { capture } = fixture("ab cd");
	const layout = vi.spyOn(documentLayout, "layoutDocument");
	capture();
	expect(layout).toHaveBeenCalledTimes(1);
});

it("shares immutable layout snapshot extraction with the document geometry cache", () => {
	const { tree, id, ref } = fixture("ab cd");
	const layout = documentLayout.layoutDocument(tree);
	const snapshot = new LayoutGeometry(layout);
	const rects = snapshot.getClientRects(ref);
	expect(rects).toEqual(documentGeometry(tree).getClientRects(id));
	expect(snapshot.getBoundingClientRect(ref)).toEqual(
		documentGeometry(tree).getBoundingClientRect(id),
	);
	tree.setTextContent(id, "a");
	expect(rects).toHaveLength(2);
	expect(documentGeometry(tree).getClientRects(id)).toHaveLength(1);
	expect(snapshot.getBoundingClientRect(ref).width).toBe(12);
});
