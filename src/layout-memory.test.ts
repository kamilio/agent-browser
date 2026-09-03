import { afterEach, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
function fixture(
	content = '<p style="margin-top:5px">ab<br>cd</p><p style="margin-top:7px">ef</p>',
) {
	const tree = parseHtmlDocument(
		`<main style="display:flow-root;width:90px;font-size:8px">${content}</main>`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 100);
	return tree;
}
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

function glyphCounter() {
	const frozen = vi.spyOn(Object, "freeze");
	return () =>
		frozen.mock.calls.filter(
			([value]) =>
				typeof value === "object" &&
				value !== null &&
				Object.hasOwn(value, "character") &&
				Object.hasOwn(value, "formattingId") &&
				Object.hasOwn(value, "line"),
		).length;
}

it("does not allocate a second glyph vector during document layout", () => {
	const tree = fixture();
	const count = glyphCounter();
	const layout = layoutDocument(tree);
	expect(layout.contexts).toHaveLength(2);
	expect(count()).toBe(layout.metrics.glyphs);
	const first = layout.contexts[0];
	const descriptor = Object.getOwnPropertyDescriptor(first, "glyphs");
	expect(descriptor).toMatchObject({
		enumerable: true,
		configurable: false,
		set: undefined,
	});
	expect(typeof descriptor?.get).toBe("function");
	expect(Object.isFrozen(first)).toBe(true);
	expect(() => {
		(first as unknown as { glyphs: unknown[] }).glyphs = [];
	}).toThrow();
	expect(count()).toBe(layout.metrics.glyphs);
});

it("materializes only the requested context, then reuses its immutable absolute vector", () => {
	const tree = fixture();
	const count = glyphCounter();
	const layout = layoutDocument(tree);
	const first = layout.contexts[0].glyphs;
	expect(count()).toBe(layout.metrics.glyphs + first.length);
	expect(layout.contexts[0].glyphs).toBe(first);
	expect(count()).toBe(layout.metrics.glyphs + first.length);
	expect(first[0].y).toBe(6);
	expect(layout.text.contexts[0].glyphs[0].y).toBe(1);
	expect(Object.keys(first[0]).sort()).toEqual(
		Object.keys(layout.text.contexts[0].glyphs[0]).sort(),
	);
	expect(Object.isFrozen(first) && first.every(Object.isFrozen)).toBe(true);
	expect(() => {
		(first[0] as { y: number }).y = 10;
	}).toThrow();
	expect(() => {
		(first as unknown as unknown[]).push({});
	}).toThrow();
	const second = layout.contexts[1].glyphs;
	expect(count()).toBe(layout.metrics.glyphs * 2);
	expect(second[0].y).toBe(33);
});

it("preserves complete JSON and object-spread snapshots rather than omitting absolute glyphs", () => {
	const layout = layoutDocument(fixture());
	const decoded = JSON.parse(JSON.stringify(layout)) as DocumentLayout;
	expect(decoded.contexts[0].glyphs[0].y).toBe(6);
	expect(decoded.contexts[1].glyphs[0].y).toBe(33);
	expect(decoded.text.contexts[0].glyphs[0].y).toBe(1);
	expect(decoded.contexts.flatMap((context) => context.glyphs)).toEqual(
		layout.contexts.flatMap((context) => context.glyphs),
	);
	expect({ ...layout.contexts[0] }.glyphs).toBe(layout.contexts[0].glyphs);
});

it("preserves stable frozen empty vectors for glyph-free inline contexts", () => {
	const layout = layoutDocument(fixture("<span></span>"));
	expect(layout.contexts).toHaveLength(1);
	const glyphs = layout.contexts[0].glyphs;
	expect(glyphs).toEqual([]);
	expect(layout.contexts[0].glyphs).toBe(glyphs);
	expect(Object.isFrozen(glyphs)).toBe(true);
	expect(layout.metrics.glyphs).toBe(0);
	expect(
		Object.getOwnPropertyDescriptor(layout.contexts[0], "glyphs")?.value,
	).toBe(glyphs);
	expect(glyphs).not.toBe(layout.text.contexts[0].glyphs);
});

it("keeps counters and all source coordinates stable during explicit materialization", () => {
	const layout = layoutDocument(fixture());
	const source = JSON.stringify(layout.text);
	const metrics = layout.metrics;
	for (const context of layout.contexts)
		expect(context.glyphs.length).toBeGreaterThan(0);
	expect(layout.metrics).toBe(metrics);
	expect(JSON.stringify(layout.text)).toBe(source);
	expect(layout.contexts.map((context) => context.id)).toEqual(
		layout.text.contexts.map((context) => context.id),
	);
});

it("validates work and coordinate limits eagerly, before a glyph getter is used", () => {
	const tree = fixture();
	const work = layoutDocument(tree).metrics.work;
	expect(() => layoutDocument(tree, { maxWork: work - 1 })).toThrow(
		"work limit",
	);
	expect(() => layoutDocument(tree, { maxWork: work })).not.toThrow();
	expect(() =>
		layoutDocument(
			fixture(
				'<div style="height:16777216px"></div><div style="height:0;line-height:0">A</div>',
			),
		),
	).toThrow("length limit");
});

it("retains independent lazy snapshots after mutation and document close", () => {
	const tree = fixture();
	const layout = layoutDocument(tree);
	const paragraph = new DocumentQueries(tree).querySelector("p") as number;
	tree.setTextContent(paragraph, "changed");
	tree.close();
	expect(
		layout.contexts[0].glyphs.map((glyph) => glyph.character).join(""),
	).toBe("abcd");
	expect(layout.contexts[0].glyphs[0].y).toBe(6);
});

it("paints directly from relative source vectors without materializing absolute copies", () => {
	const tree = fixture();
	const count = glyphCounter();
	const rendered = rasterizeDocument(tree);
	expect(count()).toBe(rendered.layout.metrics.glyphs);
	expect(rendered.metrics.paintedGlyphs).toBe(6);
	const ink = (column: number, row: number) => [
		...rendered.image.pixels.subarray(
			(row * 100 + column) * 4,
			(row * 100 + column) * 4 + 4,
		),
	];
	expect(ink(1, 8)).toEqual([0, 0, 0, 255]);
	expect(ink(1, 35)).toEqual([0, 0, 0, 255]);
});

it("keeps inline capture and cached element geometry on the single-vector path", () => {
	const tree = fixture(
		'<p style="margin-top:5px"><span id="target">ab cd</span></p>',
	);
	const id = new DocumentQueries(tree).querySelector("#target") as number;
	const count = glyphCounter();
	const capture = rasterizeDocument(tree, { element: tree.reference(id) });
	expect(count()).toBe(capture.layout.metrics.glyphs);
	const before = count();
	const geometry = documentGeometry(tree);
	expect(geometry.getBoundingClientRect(id)).toMatchObject(capture.clip);
	expect(count() - before).toBe(capture.layout.metrics.glyphs);
	geometry.getClientRects(id);
	geometry.getBoundingClientRect(id);
	expect(count() - before).toBe(capture.layout.metrics.glyphs);
});
