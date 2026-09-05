import { afterEach, expect, it } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { prepareEditableCaret } from "./editable-caret.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(parts: readonly string[], anchor: number, focus = anchor) {
	const tree = parseHtmlDocument(
		'<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}#editor{width:120px;min-height:30px;white-space:pre-wrap;color:black;caret-color:red}</style><div id="editor" contenteditable></div>',
		"https://fixture.invalid/normalize-survivor-rendering",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 60);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const texts = parts.map((data) => {
		const text = tree.createText(data);
		tree.append(editor, text);
		return text;
	});
	const survivor = texts[parts.findIndex((part) => part.length > 0)];
	if (survivor === undefined) throw new Error("Missing nonempty survivor");
	documentInteractions(tree).focus.focus(tree.reference(editor));
	const owner = domRangeOwner(tree);
	if (anchor === focus) owner.selection.collapse(survivor, anchor);
	else owner.selection.setBaseAndExtent(survivor, anchor, survivor, focus);
	const range = owner.selection.getRangeAt(0);
	return { tree, editor, texts, survivor, owner, range };
}

type Fixture = ReturnType<typeof fixture>;

function selection(test: Fixture, anchor: number, focus = anchor) {
	expect(test.owner.selection.getRangeAt(0)).toBe(test.range);
	expect(test.owner.selection.anchorNode).toBe(test.survivor);
	expect(test.owner.selection.focusNode).toBe(test.survivor);
	expect(test.owner.selection.anchorOffset).toBe(anchor);
	expect(test.owner.selection.focusOffset).toBe(focus);
	expect(test.range.start).toEqual({
		node: test.survivor,
		offset: Math.min(anchor, focus),
	});
	expect(test.range.end).toEqual({
		node: test.survivor,
		offset: Math.max(anchor, focus),
	});
	expect(test.owner.selection.direction).toBe(
		anchor === focus ? "none" : anchor < focus ? "forward" : "backward",
	);
}

function presentation(
	test: Fixture,
	data: string,
	anchor: number,
	focus = anchor,
) {
	selection(test, anchor, focus);
	const expected = fixture([data], anchor, focus);
	expect(test.tree.get(test.survivor).data).toBe(data);
	expect(test.tree.get(test.editor).children).toEqual([test.survivor]);
	expect(test.range.toString()).toBe(expected.range.toString());
	expect(rangeClientRects(test.range)).toEqual(
		rangeClientRects(expected.range),
	);
	const fresh = rasterizeDocument(test.tree);
	const reference = rasterizeDocument(expected.tree);
	expect(fresh.image.pixels).toEqual(reference.image.pixels);
	expect(fresh.metrics).toMatchObject({
		paintedCarets: reference.metrics.paintedCarets,
		caretStatus: reference.metrics.caretStatus,
		paintedSelectionGlyphs: reference.metrics.paintedSelectionGlyphs,
		selectionPixels: reference.metrics.selectionPixels,
		selectionStatus: reference.metrics.selectionStatus,
	});
	expect(prepareDocumentRaster(test.tree).rasterize().image.pixels).toEqual(
		reference.image.pixels,
	);
	return fresh;
}

it.each([
	["interior caret", ["ABCDE", "FG"], 2, "ABCDEFG", 12, 1],
	["original end caret", ["ABCDE", "FG"], 5, "ABCDEFG", 30, 1],
	["multiple following nodes", ["ABCDE", "", "F", "G"], 4, "ABCDEFG", 24, 1],
	["leading empty nodes", ["", "", "ABCDE", "FG"], 4, "ABCDEFG", 24, 1],
	["only empty suffix", ["ABCDE", "", ""], 3, "ABCDE", 18, 1],
	["preserved line", ["AB\nCD", "EF"], 4, "AB\nCDEF", 6, 11],
] as const)(
	"preserves survivor %s through normalization with exact final caret pixels",
	(_name, parts, offset, finalData, horizontal, vertical) => {
		const test = fixture(parts, offset);
		const prepared = prepareDocumentRaster(test.tree);
		const revision = test.tree.revision;
		test.tree.normalize(test.editor);
		const after = presentation(test, finalData, offset);
		expect(test.tree.revision).toBeGreaterThan(revision);
		expect(() => prepared.rasterize()).toThrow(/stale/);
		expect(rangeClientRects(test.range)).toMatchObject([
			{ x: horizontal, y: vertical, width: 0, height: 8 },
		]);
		expect(
			prepareEditableCaret(test.tree, layoutDocument(test.tree)),
		).toMatchObject({
			status: "ready",
			anchor: { x: horizontal, y: vertical, height: 8 },
		});
		expect(after.metrics.paintedCarets).toBe(1);
		for (let row = vertical; row < vertical + 8; row++) {
			const pixel = (row * after.image.width + horizontal) * 4;
			expect(Array.from(after.image.pixels.slice(pixel, pixel + 4))).toEqual([
				255, 0, 0, 255,
			]);
		}
		for (const text of test.texts)
			if (text !== test.survivor) expect(test.tree.get(text).parent).toBeNull();
	},
);

it.each([
	["forward interior", 1, 4, "BCD", 18, 3],
	["backward interior", 4, 1, "BCD", 18, 3],
	["forward original end", 1, 5, "BCDE", 24, 4],
	["backward original end", 5, 1, "BCDE", 24, 4],
] as const)(
	"keeps %s highlight entirely in the original survivor without selecting appended text",
	(_name, anchor, focus, selectedText, width, glyphs) => {
		const test = fixture(["ABCDE", "FG"], anchor, focus);
		const prepared = prepareDocumentRaster(test.tree);
		test.tree.normalize(test.editor);
		const after = presentation(test, "ABCDEFG", anchor, focus);
		expect(test.range.toString()).toBe(selectedText);
		expect(rangeClientRects(test.range)).toMatchObject([
			{ x: 6, y: 1, width, height: 8 },
		]);
		expect(after.metrics).toMatchObject({
			paintedCarets: 0,
			paintedSelectionGlyphs: glyphs,
			selectionStatus: "painted",
			caretStatus: "noncollapsed",
		});
		expect(() => prepared.rasterize()).toThrow(/stale/);
	},
);

it.each([
	["interior caret", 2, 2],
	["end caret", 5, 5],
	["forward highlight", 1, 4],
	["backward highlight", 4, 1],
] as const)(
	"reuses unchanged singleton layout and CSS across repeated normalize for %s",
	(_name, anchor, focus) => {
		const test = fixture(["ABCDE"], anchor, focus);
		const styles = documentStyles(test.tree);
		const cachedStyle = styles.get(test.editor);
		const prepared = prepareDocumentRaster(test.tree);
		const before = prepared.rasterize();
		const revision = test.tree.revision;
		const builds = styles.metrics().cascadeBuilds;
		const records: string[] = [];
		test.tree.onMutation((record) => records.push(record.type));
		for (let iteration = 1; iteration <= 3; iteration++) {
			test.tree.normalize(test.editor);
			const after = presentation(test, "ABCDE", anchor, focus);
			expect(after.image.pixels).toEqual(before.image.pixels);
			expect(prepared.rasterize().image.pixels).toEqual(after.image.pixels);
			expect(test.tree.revision).toBe(revision);
			expect(styles.get(test.editor)).toBe(cachedStyle);
			expect(styles.metrics().cascadeBuilds).toBe(builds);
			expect(records).toEqual(Array(iteration).fill("characterData"));
		}
	},
);

it("reuses the merged layout on subsequent normalization without resetting survivor selection", () => {
	const test = fixture(["ABCDE", "FG"], 5, 1);
	test.tree.normalize(test.editor);
	presentation(test, "ABCDEFG", 5, 1);
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const revision = test.tree.revision;
	const styles = documentStyles(test.tree);
	const cachedStyle = styles.get(test.editor);
	const builds = styles.metrics().cascadeBuilds;
	test.tree.normalize(test.editor);
	const after = presentation(test, "ABCDEFG", 5, 1);
	expect(test.tree.revision).toBe(revision);
	expect(styles.get(test.editor)).toBe(cachedStyle);
	expect(styles.metrics().cascadeBuilds).toBe(builds);
	expect(after.image.pixels).toEqual(before.image.pixels);
	expect(prepared.rasterize().image.pixels).toEqual(after.image.pixels);
});

it("preserves the zero-offset survivor caret control when following text is merged", () => {
	const test = fixture(["ABCDE", "FG"], 0);
	test.tree.normalize(test.editor);
	const after = presentation(test, "ABCDEFG", 0);
	expect(after.metrics.paintedCarets).toBe(1);
	expect(rangeClientRects(test.range)).toMatchObject([
		{ x: 0, y: 1, width: 0, height: 8 },
	]);
});

it("normalizing a text receiver leaves its sibling layout and survivor range unchanged", () => {
	const test = fixture(["ABCDE", "FG"], 4);
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const rectangles = rangeClientRects(test.range);
	const revision = test.tree.revision;
	test.tree.normalize(test.survivor);
	selection(test, 4);
	expect(test.tree.get(test.editor).children).toEqual(test.texts);
	expect(test.tree.get(test.survivor).data).toBe("ABCDE");
	expect(test.tree.revision).toBe(revision);
	expect(rangeClientRects(test.range)).toEqual(rectangles);
	expect(rasterizeDocument(test.tree).image.pixels).toEqual(
		before.image.pixels,
	);
	expect(prepared.rasterize().image.pixels).toEqual(before.image.pixels);
});

it("revokes normalize, survivor geometry and prepared painting after closure", () => {
	const test = fixture(["ABCDE", "FG"], 4);
	test.tree.normalize(test.editor);
	const prepared = prepareDocumentRaster(test.tree);
	test.tree.close();
	expect(() => test.tree.normalize(test.editor)).toThrow(/closed/);
	expect(() => rangeClientRects(test.range)).toThrow(/closed/);
	expect(() => test.owner.selection.getRangeAt(0)).toThrow(/closed/);
	expect(() => prepared.rasterize()).toThrow(/closed/);
});
