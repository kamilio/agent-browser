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
type Route = "canonical" | "native";
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(parts: readonly string[], anchor: Point, focus = anchor) {
	const tree = parseHtmlDocument(
		'<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}#editor{width:120px;min-height:30px;white-space:pre-wrap;color:black;caret-color:red}</style><div id="editor" contenteditable></div>',
		"https://fixture.invalid/split-text-range-rendering",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 60);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const texts = parts.map((part) => {
		const text = tree.createText(part);
		tree.append(editor, text);
		return text;
	});
	const point = ([index, offset]: Point) => ({
		node: index === -1 ? editor : texts[index],
		offset,
	});
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
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
	const range = owner.selection.getRangeAt(0);
	return { tree, editor, texts, point, owner, range };
}

type Fixture = ReturnType<typeof fixture>;

function split(test: Fixture, route: Route, offset: number) {
	const tail =
		route === "native"
			? test.tree.splitText(test.texts[0], offset)
			: test.owner.splitText(test.texts[0], offset);
	test.texts.push(tail);
	return tail;
}

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
	const backward = test.owner.compare(start, end) > 0;
	expect(test.range.start).toEqual(backward ? end : start);
	expect(test.range.end).toEqual(backward ? start : end);
	if (test.range.collapsed) expect(test.owner.selection.direction).toBe("none");
	else
		expect(test.owner.selection.direction).toBe(
			backward ? "backward" : "forward",
		);
}

function samePresentation(actual: Fixture, expected: Fixture) {
	expect(rangeClientRects(actual.range)).toEqual(
		rangeClientRects(expected.range),
	);
	expect(actual.range.toString()).toBe(expected.range.toString());
	const fresh = rasterizeDocument(actual.tree);
	const reference = rasterizeDocument(expected.tree);
	expect(fresh.image.pixels).toEqual(reference.image.pixels);
	expect(fresh.metrics).toMatchObject({
		paintedCarets: reference.metrics.paintedCarets,
		caretStatus: reference.metrics.caretStatus,
		paintedSelectionGlyphs: reference.metrics.paintedSelectionGlyphs,
		selectionPixels: reference.metrics.selectionPixels,
		selectionStatus: reference.metrics.selectionStatus,
	});
	expect(prepareDocumentRaster(actual.tree).rasterize().image.pixels).toEqual(
		reference.image.pixels,
	);
	return fresh;
}

for (const route of ["canonical", "native"] as const) {
	it.each([
		["before caret", "ABCDE", 1, 2, ["AB", "CDE"], [0, 1]],
		["at caret", "ABCDE", 2, 2, ["AB", "CDE"], [0, 2]],
		["after caret", "ABCDE", 4, 2, ["AB", "CDE"], [1, 2]],
		["zero", "ABCDE", 4, 0, ["", "ABCDE"], [1, 4]],
		["end", "ABCDE", 5, 5, ["ABCDE", ""], [0, 5]],
		["empty", "", 0, 0, ["", ""], [0, 0]],
		["preserved line", "AB\nCD", 5, 3, ["AB\n", "CD"], [1, 2]],
	] as const)(
		`${route} split %s keeps live caret identity and static split-fixture pixels`,
		(_name, data, initialOffset, offset, parts, finalPoint) => {
			const test = fixture([data], [0, initialOffset]);
			const prepared = prepareDocumentRaster(test.tree);
			const before = prepared.rasterize();
			const units = test.tree.resourceUsage().textCodeUnits;
			const original = test.texts[0];
			const tail = split(test, route, offset);
			expect(test.texts[0]).toBe(original);
			expect(tail).not.toBe(original);
			expect(test.tree.get(test.editor).children).toEqual([original, tail]);
			expect(test.texts.map((node) => test.tree.get(node).data)).toEqual(parts);
			expect(test.tree.wholeText(original)).toBe(data);
			expect(test.tree.resourceUsage().textCodeUnits).toBe(units);
			selection(test, finalPoint);
			const after = samePresentation(test, fixture(parts, finalPoint));
			expect(() => prepared.rasterize()).toThrow(/stale/);
			if (_name === "after caret") {
				expect(after.image.pixels).toEqual(before.image.pixels);
				expect(rangeClientRects(test.range)).toMatchObject([
					{ x: 24, y: 1, width: 0, height: 8 },
				]);
				expect(
					prepareEditableCaret(test.tree, layoutDocument(test.tree)),
				).toMatchObject({
					status: "ready",
					anchor: { x: 24, y: 1, height: 8 },
				});
				for (let row = 1; row < 9; row++) {
					const pixel = (row * after.image.width + 24) * 4;
					expect(
						Array.from(after.image.pixels.slice(pixel, pixel + 4)),
					).toEqual([255, 0, 0, 255]);
				}
			}
		},
	);

	it.each(["forward", "backward"] as const)(
		`${route} split inside a %s highlight preserves selected text and direction`,
		(direction) => {
			const backward = direction === "backward";
			const test = fixture(
				["ABCDE"],
				[0, backward ? 4 : 1],
				[0, backward ? 1 : 4],
			);
			const before = rasterizeDocument(test.tree);
			split(test, route, 2);
			const anchor: Point = backward ? [1, 2] : [0, 1];
			const focus: Point = backward ? [0, 1] : [1, 2];
			selection(test, anchor, focus);
			expect(test.range.toString()).toBe("BCD");
			const after = samePresentation(
				test,
				fixture(["AB", "CDE"], anchor, focus),
			);
			expect(after.metrics).toMatchObject({
				paintedSelectionGlyphs: 3,
				paintedCarets: 0,
				selectionStatus: "painted",
			});
			expect(after.image.pixels).toEqual(before.image.pixels);
		},
	);

	it(`${route} split moves the parent boundary immediately after the original once`, () => {
		const test = fixture(["ABCDE"], [-1, 0], [-1, 1]);
		split(test, route, 2);
		selection(test, [-1, 0], [-1, 2]);
		expect(test.range.toString()).toBe("ABCDE");
		const after = samePresentation(
			test,
			fixture(["AB", "CDE"], [-1, 0], [-1, 2]),
		);
		expect(after.metrics.paintedSelectionGlyphs).toBe(5);
	});

	it.each([
		["insert", 1, 0, "X", "CXDE", 3],
		["delete", 0, 1, "", "DE", 1],
	] as const)(
		`${route} transferred tail caret follows later direct %s`,
		(_name, offset, count, inserted, data, finalOffset) => {
			const test = fixture(["ABCDE"], [0, 4]);
			const tail = split(test, route, 2);
			selection(test, [1, 2]);
			const prepared = prepareDocumentRaster(test.tree);
			test.tree.replaceData(tail, offset, count, inserted);
			selection(test, [1, finalOffset]);
			expect(test.tree.get(tail).data).toBe(data);
			samePresentation(test, fixture(["AB", data], [1, finalOffset]));
			expect(() => prepared.rasterize()).toThrow(/stale/);
		},
	);

	it(`${route} transferred tail remains tracked when later removed`, () => {
		const test = fixture(["ABCDE"], [0, 4]);
		const tail = split(test, route, 2);
		selection(test, [1, 2]);
		const prepared = prepareDocumentRaster(test.tree);
		test.tree.remove(tail);
		selection(test, [-1, 1]);
		expect(test.tree.get(tail).parent).toBeNull();
		expect(test.tree.textContent(test.editor)).toBe("AB");
		samePresentation(test, fixture(["AB"], [-1, 1]));
		expect(() => prepared.rasterize()).toThrow(/stale/);
	});

	it(`${route} split prepared layout paints later selection changes without stale pixels`, () => {
		const test = fixture(["ABCDE"], [0, 4]);
		const tail = split(test, route, 2);
		selection(test, [1, 2]);
		const prepared = prepareDocumentRaster(test.tree);
		const before = prepared.rasterize();
		const revision = test.tree.revision;
		const styles = documentStyles(test.tree);
		const cachedStyle = styles.get(test.editor);
		const builds = styles.metrics().cascadeBuilds;
		test.owner.selection.collapse(tail, 1);
		const current = { ...test, range: test.owner.selection.getRangeAt(0) };
		expect(current.range).not.toBe(test.range);
		selection(current, [1, 1]);
		const expected = fixture(["AB", "CDE"], [1, 1]);
		const after = samePresentation(current, expected);
		expect(test.tree.revision).toBe(revision);
		expect(styles.get(test.editor)).toBe(cachedStyle);
		expect(styles.metrics().cascadeBuilds).toBe(builds);
		expect(after.image.pixels).not.toEqual(before.image.pixels);
		expect(prepared.rasterize().image.pixels).toEqual(after.image.pixels);
	});

	it(`${route} split geometry and prepared captures are revoked on closure`, () => {
		const test = fixture(["ABCDE"], [0, 4]);
		const tail = split(test, route, 2);
		const prepared = prepareDocumentRaster(test.tree);
		test.tree.close();
		expect(() => rangeClientRects(test.range)).toThrow(/closed/);
		expect(() => test.owner.selection.getRangeAt(0)).toThrow(/closed/);
		expect(() => prepared.rasterize()).toThrow(/closed/);
		expect(() => test.tree.replaceData(tail, 0, 1, "Z")).toThrow(/closed/);
	});
}
