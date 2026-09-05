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

type Point = readonly [number, number];
type Part = string | Readonly<{ comment: string }>;
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(parts: readonly Part[], anchor: Point, focus = anchor) {
	const tree = parseHtmlDocument(
		'<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}#editor{width:120px;min-height:30px;white-space:pre-wrap;color:black;caret-color:red}</style><div id="editor" contenteditable></div>',
		"https://fixture.invalid/normalize-range-rendering",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 60);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const nodes = parts.map((part) => {
		const node =
			typeof part === "string"
				? tree.createText(part)
				: tree.createComment(part.comment);
		tree.append(editor, node);
		return node;
	});
	const point = ([index, offset]: Point) => ({
		node: index === -1 ? editor : nodes[index],
		offset,
	});
	documentInteractions(tree).focus.focus(tree.reference(editor));
	const owner = domRangeOwner(tree);
	const start = point(anchor);
	const end = point(focus);
	if (start.node === end.node && start.offset === end.offset)
		owner.selection.collapse(start.node, start.offset);
	else
		owner.selection.setBaseAndExtent(
			start.node,
			start.offset,
			end.node,
			end.offset,
		);
	return {
		tree,
		editor,
		nodes,
		point,
		owner,
		range: owner.selection.getRangeAt(0),
		direction: owner.selection.direction,
	};
}

type Fixture = ReturnType<typeof fixture>;

function selection(test: Fixture, anchor: Point, focus = anchor) {
	const start = test.point(anchor);
	const end = test.point(focus);
	expect(test.owner.selection.getRangeAt(0)).toBe(test.range);
	expect({
		node: test.owner.selection.anchorNode,
		offset: test.owner.selection.anchorOffset,
	}).toEqual(start);
	expect({
		node: test.owner.selection.focusNode,
		offset: test.owner.selection.focusOffset,
	}).toEqual(end);
	const backwards = test.owner.compare(start, end) > 0;
	expect(test.range.start).toEqual(backwards ? end : start);
	expect(test.range.end).toEqual(backwards ? start : end);
	expect(test.owner.selection.direction).toBe(test.direction);
}

function presentation(test: Fixture, reference: Fixture) {
	expect(test.range.toString()).toBe(reference.range.toString());
	expect(rangeClientRects(test.range)).toEqual(
		rangeClientRects(reference.range),
	);
	const fresh = rasterizeDocument(test.tree);
	const expected = rasterizeDocument(reference.tree);
	expect(fresh.image.pixels).toEqual(expected.image.pixels);
	expect(fresh.metrics).toMatchObject({
		paintedCarets: expected.metrics.paintedCarets,
		caretStatus: expected.metrics.caretStatus,
		paintedSelectionGlyphs: expected.metrics.paintedSelectionGlyphs,
		selectionPixels: expected.metrics.selectionPixels,
		selectionStatus: expected.metrics.selectionStatus,
	});
	expect(prepareDocumentRaster(test.tree).rasterize().image.pixels).toEqual(
		expected.image.pixels,
	);
	return fresh;
}

function caret(test: Fixture, horizontal: number, vertical = 1) {
	expect(rangeClientRects(test.range)).toMatchObject([
		{ x: horizontal, y: vertical, width: 0, height: 8 },
	]);
	expect(
		prepareEditableCaret(test.tree, layoutDocument(test.tree)),
	).toMatchObject({
		status: "ready",
		anchor: { x: horizontal, y: vertical, height: 8 },
	});
	const raster = rasterizeDocument(test.tree);
	expect(raster.metrics).toMatchObject({
		paintedCarets: 1,
		paintedSelectionGlyphs: 0,
		caretStatus: "painted",
	});
	for (let row = vertical; row < vertical + 8; row++) {
		const pixel = (row * raster.image.width + horizontal) * 4;
		expect(Array.from(raster.image.pixels.slice(pixel, pixel + 4))).toEqual([
			255, 0, 0, 255,
		]);
	}
}

it.each([
	["following interior", ["AB", "CDE"], [1, 2], 0, "ABCDE", 4, 24, 1],
	["following start", ["AB", "CDE"], [1, 0], 0, "ABCDE", 2, 12, 1],
	["following end", ["AB", "CDE"], [1, 3], 0, "ABCDE", 5, 30, 1],
	["later member", ["AB", "CD", "EF"], [2, 1], 0, "ABCDEF", 5, 30, 1],
	["empty member", ["AB", "", "CD"], [1, 0], 0, "ABCD", 2, 12, 1],
	["trailing empty", ["AB", "CD", ""], [2, 0], 0, "ABCD", 4, 24, 1],
	["after leading empty", ["", "AB", "CD"], [2, 1], 1, "ABCD", 3, 18, 1],
	["parent before following", ["AB", "CD"], [-1, 1], 0, "ABCD", 2, 12, 1],
	["parent before later", ["AB", "CD", "EF"], [-1, 2], 0, "ABCDEF", 4, 24, 1],
	["parent before empty", ["AB", "", "CD"], [-1, 1], 0, "ABCD", 2, 12, 1],
	["following preserved line", ["AB\n", "CD"], [1, 1], 0, "AB\nCD", 4, 6, 11],
] as const)(
	"transfers %s to the original survivor with exact text-caret pixels",
	(name, parts, initial, survivor, data, offset, horizontal, vertical) => {
		const test = fixture(parts, initial);
		const prepared = prepareDocumentRaster(test.tree);
		if (name.startsWith("parent before"))
			expect(prepared.rasterize().metrics.caretStatus).toBe("unsupported");
		test.tree.normalize(test.editor);
		selection(test, [survivor, offset]);
		expect(test.tree.get(test.editor).children).toEqual([test.nodes[survivor]]);
		expect(test.tree.get(test.nodes[survivor]).data).toBe(data);
		presentation(test, fixture([data], [0, offset]));
		caret(test, horizontal, vertical);
		expect(() => prepared.rasterize()).toThrow(/stale/);
		for (const node of test.nodes)
			if (node !== test.nodes[survivor])
				expect(test.tree.get(node).parent).toBeNull();
	},
);

it.each([
	["forward following", [1, 0], [1, 2], 2, 4, "CD", 12, 12, 2],
	["backward following", [1, 2], [1, 0], 4, 2, "CD", 12, 12, 2],
	["forward spanning", [0, 1], [2, 1], 1, 5, "BCDE", 6, 24, 4],
	["backward spanning", [2, 1], [0, 1], 5, 1, "BCDE", 6, 24, 4],
] as const)(
	"preserves %s selection text, direction and full highlight pixels",
	(
		_name,
		anchor,
		focus,
		finalAnchor,
		finalFocus,
		selected,
		horizontal,
		width,
		glyphs,
	) => {
		const test = fixture(["AB", "CD", "EF"], anchor, focus);
		const prepared = prepareDocumentRaster(test.tree);
		test.tree.normalize(test.editor);
		selection(test, [0, finalAnchor], [0, finalFocus]);
		expect(test.tree.get(test.editor).children).toEqual([test.nodes[0]]);
		expect(test.range.toString()).toBe(selected);
		expect(rangeClientRects(test.range)).toMatchObject([
			{ x: horizontal, y: 1, width, height: 8 },
		]);
		const after = presentation(
			test,
			fixture(["ABCDEF"], [0, finalAnchor], [0, finalFocus]),
		);
		expect(after.metrics).toMatchObject({
			paintedCarets: 0,
			paintedSelectionGlyphs: glyphs,
			selectionStatus: "painted",
		});
		expect(() => prepared.rasterize()).toThrow(/stale/);
	},
);

it.each(["forward", "backward"] as const)(
	"retains %s direction when parent/member boundary transfer collapses selection",
	(direction) => {
		const test = fixture(
			["AB", "CD"],
			direction === "forward" ? [-1, 1] : [1, 0],
			direction === "forward" ? [1, 0] : [-1, 1],
		);
		expect(test.range.collapsed).toBe(false);
		test.tree.normalize(test.editor);
		selection(test, [0, 2]);
		expect(test.range.collapsed).toBe(true);
		expect(test.owner.selection.direction).toBe(direction);
		presentation(test, fixture(["ABCD"], [0, 2]));
		caret(test, 12);
	},
);

it.each([false, true])(
	"keeps independent comment-separated run transfers precise with highlight=%s",
	(highlight) => {
		const test = fixture(
			["AB", "C", { comment: "barrier" }, "DE", "FG"],
			[4, highlight ? 0 : 1],
			[4, highlight ? 2 : 1],
		);
		const prepared = prepareDocumentRaster(test.tree);
		test.tree.normalize(test.editor);
		selection(test, [3, highlight ? 2 : 3], [3, highlight ? 4 : 3]);
		expect(test.tree.get(test.editor).children).toEqual([
			test.nodes[0],
			test.nodes[2],
			test.nodes[3],
		]);
		expect(test.tree.get(test.nodes[0]).data).toBe("ABC");
		expect(test.tree.get(test.nodes[3]).data).toBe("DEFG");
		const after = presentation(
			test,
			fixture(
				["ABC", { comment: "barrier" }, "DEFG"],
				[2, highlight ? 2 : 3],
				[2, highlight ? 4 : 3],
			),
		);
		if (highlight) expect(after.metrics.paintedSelectionGlyphs).toBe(2);
		else caret(test, 36);
		expect(() => prepared.rasterize()).toThrow(/stale/);
	},
);

it("reuses merged layout and CSS on no-op repeats without resetting a transferred backward selection", () => {
	const test = fixture(["AB", "CD", "EF"], [2, 1], [1, 1]);
	test.tree.normalize(test.editor);
	selection(test, [0, 5], [0, 3]);
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const revision = test.tree.revision;
	const styles = documentStyles(test.tree);
	const cached = styles.get(test.editor);
	const builds = styles.metrics().cascadeBuilds;
	for (let iteration = 0; iteration < 2; iteration++) {
		test.tree.normalize(test.editor);
		selection(test, [0, 5], [0, 3]);
		const after = presentation(test, fixture(["ABCDEF"], [0, 5], [0, 3]));
		expect(test.tree.revision).toBe(revision);
		expect(styles.get(test.editor)).toBe(cached);
		expect(styles.metrics().cascadeBuilds).toBe(builds);
		expect(after.image.pixels).toEqual(before.image.pixels);
		expect(prepared.rasterize().image.pixels).toEqual(after.image.pixels);
	}
});

it("keeps parent after the whole run parent-relative as an existing control", () => {
	const test = fixture(["AB", "CD", "EF"], [-1, 3]);
	test.tree.normalize(test.editor);
	selection(test, [-1, 1]);
	const after = presentation(test, fixture(["ABCDEF"], [-1, 1]));
	expect(rangeClientRects(test.range)).toEqual([]);
	expect(after.metrics.paintedCarets).toBe(1);
	expect(
		prepareEditableCaret(test.tree, layoutDocument(test.tree)),
	).toMatchObject({ status: "ready", anchor: { x: 36, y: 1, height: 8 } });
});

it("retains existing survivor endpoints as an append control", () => {
	const test = fixture(["AB", "CD"], [0, 2]);
	test.tree.normalize(test.editor);
	selection(test, [0, 2]);
	presentation(test, fixture(["ABCD"], [0, 2]));
	caret(test, 12);
});

it("revokes normalized selected-range geometry and prepared pixels on closure", () => {
	const test = fixture(["AB", "CD"], [1, 1]);
	test.tree.normalize(test.editor);
	const prepared = prepareDocumentRaster(test.tree);
	test.tree.close();
	expect(() => rangeClientRects(test.range)).toThrow(/closed/);
	expect(() => test.owner.selection.getRangeAt(0)).toThrow(/closed/);
	expect(() => prepared.rasterize()).toThrow(/closed/);
	expect(() => test.tree.normalize(test.editor)).toThrow(/closed/);
});
