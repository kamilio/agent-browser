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

function fixture(value = "ABCDE", anchor = 4, focus = anchor) {
	const tree = parseHtmlDocument(
		'<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}#editor{width:120px;min-height:30px;white-space:pre-wrap;color:black;caret-color:red}</style><div id="editor" contenteditable></div>',
		"https://fixture.invalid/character-data-range-rendering",
		{ limits: { maxTextCodeUnits: 2048 } },
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 60);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const text = tree.createText(value);
	tree.append(editor, text);
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(editor));
	const owner = domRangeOwner(tree);
	if (anchor === focus) owner.selection.collapse(text, anchor);
	else owner.selection.setBaseAndExtent(text, anchor, text, focus);
	const range = owner.selection.getRangeAt(0);
	const state = () => ({
		start: range.start.offset,
		end: range.end.offset,
		anchor: owner.selection.anchorOffset,
		focus: owner.selection.focusOffset,
		direction: owner.selection.direction,
	});
	return { tree, editor, text, actions, owner, range, state };
}

function caret(
	test: ReturnType<typeof fixture>,
	offset: number,
	horizontal: number,
	vertical = 1,
) {
	expect(test.owner.selection.getRangeAt(0)).toBe(test.range);
	expect(test.state()).toMatchObject({
		start: offset,
		end: offset,
		anchor: offset,
		focus: offset,
	});
	expect(rangeClientRects(test.range)).toHaveLength(1);
	expect(rangeClientRects(test.range)[0]).toMatchObject({
		x: horizontal,
		y: vertical,
		width: 0,
		height: 8,
	});
	expect(
		prepareEditableCaret(test.tree, layoutDocument(test.tree)),
	).toMatchObject({
		status: "ready",
		anchor: { x: horizontal, y: vertical, height: 8 },
	});
	const raster = rasterizeDocument(test.tree);
	expect(raster.metrics).toMatchObject({
		paintedCarets: 1,
		caretStatus: "painted",
		paintedSelectionGlyphs: 0,
	});
	for (let row = vertical; row < vertical + 8; row++) {
		const position = (row * raster.image.width + horizontal) * 4;
		expect(
			Array.from(raster.image.pixels.slice(position, position + 4)),
		).toEqual([255, 0, 0, 255]);
	}
	return raster;
}

it("reuses prepared layout while painting the current canonical equal-data caret", () => {
	const test = fixture();
	const styles = documentStyles(test.tree);
	const style = styles.get(test.editor);
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const revision = test.tree.revision;
	const builds = styles.metrics().cascadeBuilds;
	test.owner.replaceText(test.text, 2, 2, "CD");
	expect(test.tree.get(test.text).data).toBe("ABCDE");
	expect(test.range.start.offset).toBe(2);
	expect(rangeClientRects(test.range)[0]).toMatchObject({
		x: 12,
		y: 1,
		width: 0,
		height: 8,
	});
	expect(
		prepareEditableCaret(test.tree, layoutDocument(test.tree)),
	).toMatchObject({ status: "ready", anchor: { x: 12, y: 1, height: 8 } });
	const fresh = caret(test, 2, 12);
	const expected = rasterizeDocument(fixture("ABCDE", 2).tree);
	expect(fresh.image.pixels).not.toEqual(before.image.pixels);
	expect(fresh.image.pixels).toEqual(expected.image.pixels);
	expect(styles.get(test.editor)).toBe(style);
	expect(styles.metrics().cascadeBuilds).toBe(builds);
	expect(test.tree.revision).toBe(revision);
	expect(prepared.rasterize().image.pixels).toEqual(expected.image.pixels);
});

it("keeps a prepared capture valid for a canonical empty insertion", () => {
	const test = fixture();
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const revision = test.tree.revision;
	const state = test.state();
	test.owner.replaceText(test.text, 2, 0, "");
	expect(test.state()).toEqual(state);
	expect(test.tree.revision).toBe(revision);
	expect(prepared.rasterize().image.pixels).toEqual(before.image.pixels);
});

it("does not invalidate presentation for canonical unselected range-only movement", () => {
	const test = fixture("ABCDE", 1);
	const other = test.owner.createRange();
	other.setStart(test.text, 4);
	other.setEnd(test.text, 5);
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const revision = test.tree.revision;
	test.owner.replaceText(test.text, 2, 2, "CD");
	expect([other.start.offset, other.end.offset]).toEqual([2, 5]);
	expect(test.range.start.offset).toBe(1);
	expect(test.tree.revision).toBe(revision);
	expect(prepared.rasterize().image.pixels).toEqual(before.image.pixels);
});

it.each([
	["insert before", "ABCDE", 4, 1, 0, "XY", "AXYBCDE", 6, 36, 1],
	["insert at caret", "ABCDE", 4, 4, 0, "XY", "ABCDXYE", 4, 24, 1],
	["delete before", "ABCDE", 4, 1, 2, "", "ADE", 2, 12, 1],
	["replace containing caret", "ABCDE", 3, 2, 2, "Z", "ABZE", 2, 12, 1],
	["clamp suffix count", "ABCDE", 5, 3, 99, "Q", "ABCQ", 3, 18, 1],
	["append after caret", "ABCDE", 4, 5, 0, "Z", "ABCDEZ", 4, 24, 1],
	["equal replacement", "ABCDE", 4, 2, 2, "CD", "ABCDE", 2, 12, 1],
	["preserved next line", "AB\nCD", 5, 0, 1, "", "B\nCD", 4, 12, 11],
] as const)(
	"places exact source geometry and pixels after direct %s",
	(
		_name,
		initial,
		start,
		offset,
		count,
		inserted,
		expected,
		finalOffset,
		horizontal,
		vertical,
	) => {
		const test = fixture(initial, start);
		const prepared = prepareDocumentRaster(test.tree);
		test.tree.replaceData(test.text, offset, count, inserted);
		expect(test.tree.get(test.text).data).toBe(expected);
		const after = caret(test, finalOffset, horizontal, vertical);
		const reference = fixture(expected, finalOffset);
		expect(after.image.pixels).toEqual(
			rasterizeDocument(reference.tree).image.pixels,
		);
		if (expected === initial)
			expect(prepared.rasterize().image.pixels).toEqual(after.image.pixels);
		else expect(() => prepared.rasterize()).toThrow(/stale/);
	},
);

it.each(["forward", "backward"] as const)(
	"keeps direct edits precise for a %s highlighted range",
	(direction) => {
		const test = fixture(
			"ABCDE",
			direction === "forward" ? 1 : 4,
			direction === "forward" ? 4 : 1,
		);
		const prepared = prepareDocumentRaster(test.tree);
		test.tree.replaceData(test.text, 2, 1, "XY");
		expect(test.tree.get(test.text).data).toBe("ABXYDE");
		expect(test.owner.selection.getRangeAt(0)).toBe(test.range);
		expect(test.state()).toEqual({
			start: 1,
			end: 5,
			anchor: direction === "forward" ? 1 : 5,
			focus: direction === "forward" ? 5 : 1,
			direction,
		});
		expect(test.range.toString()).toBe("BXYD");
		expect(rangeClientRects(test.range)).toHaveLength(1);
		expect(rangeClientRects(test.range)[0]).toMatchObject({
			x: 6,
			y: 1,
			width: 24,
			height: 8,
		});
		const after = rasterizeDocument(test.tree);
		expect(after.metrics).toMatchObject({
			paintedCarets: 0,
			caretStatus: "noncollapsed",
			paintedSelectionGlyphs: 4,
			selectionStatus: "painted",
		});
		const reference = fixture(
			"ABXYDE",
			direction === "forward" ? 1 : 5,
			direction === "forward" ? 5 : 1,
		);
		expect(after.image.pixels).toEqual(
			rasterizeDocument(reference.tree).image.pixels,
		);
		expect(() => prepared.rasterize()).toThrow(/stale/);
	},
);

it.each(["forward", "backward"] as const)(
	"reuses prepared layout for equal-data %s selection changes without rebuilding CSS",
	(direction) => {
		const test = fixture(
			"ABCDE",
			direction === "forward" ? 1 : 4,
			direction === "forward" ? 4 : 1,
		);
		const styles = documentStyles(test.tree);
		const style = styles.get(test.editor);
		const prepared = prepareDocumentRaster(test.tree);
		const before = prepared.rasterize();
		const revision = test.tree.revision;
		const builds = styles.metrics().cascadeBuilds;
		const notifications: string[] = [];
		test.tree.onMutation((record) => notifications.push(record.type));
		test.tree.replaceData(test.text, 2, 2, "CD");
		expect(test.tree.get(test.text).data).toBe("ABCDE");
		expect(test.state()).toEqual({
			start: 1,
			end: 2,
			anchor: direction === "forward" ? 1 : 2,
			focus: direction === "forward" ? 2 : 1,
			direction,
		});
		expect(test.range.toString()).toBe("B");
		expect(rangeClientRects(test.range)[0]).toMatchObject({
			x: 6,
			y: 1,
			width: 6,
			height: 8,
		});
		const fresh = rasterizeDocument(test.tree);
		expect(fresh.metrics.paintedSelectionGlyphs).toBe(1);
		expect(fresh.image.pixels).not.toEqual(before.image.pixels);
		expect(notifications).toEqual(["characterData"]);
		expect(styles.get(test.editor)).toBe(style);
		expect(styles.metrics().cascadeBuilds).toBe(builds);
		expect(test.tree.revision).toBe(revision);
		expect(test.tree.changesSince(revision)).toMatchObject({
			reset: false,
			changes: [],
		});
		const expected = rasterizeDocument(
			fixture(
				"ABCDE",
				direction === "forward" ? 1 : 2,
				direction === "forward" ? 2 : 1,
			).tree,
		);
		expect(fresh.image.pixels).toEqual(expected.image.pixels);
		expect(prepared.rasterize().image.pixels).toEqual(expected.image.pixels);
	},
);

it.each([
	[2, 0, ""],
	[5, 99, ""],
] as const)(
	"keeps direct empty edit at %i a selection/presentation no-op",
	(offset, count, inserted) => {
		const test = fixture();
		const styles = documentStyles(test.tree);
		const style = styles.get(test.editor);
		const prepared = prepareDocumentRaster(test.tree);
		const before = prepared.rasterize();
		const state = test.state();
		const revision = test.tree.revision;
		const builds = styles.metrics().cascadeBuilds;
		const notifications: string[] = [];
		test.tree.onMutation((record) => notifications.push(record.type));
		test.tree.replaceData(test.text, offset, count, inserted);
		expect(notifications).toEqual(["characterData"]);
		expect(test.state()).toEqual(state);
		expect(test.tree.get(test.text).data).toBe("ABCDE");
		expect(test.tree.revision).toBe(revision);
		expect(styles.get(test.editor)).toBe(style);
		expect(styles.metrics().cascadeBuilds).toBe(builds);
		expect(prepared.rasterize().image.pixels).toEqual(before.image.pixels);
	},
);

it("does not invalidate direct equal edits that only move an unselected range", () => {
	const test = fixture("ABCDE", 1);
	const other = test.owner.createRange();
	other.setStart(test.text, 4);
	other.setEnd(test.text, 5);
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const revision = test.tree.revision;
	const builds = documentStyles(test.tree).metrics().cascadeBuilds;
	test.tree.replaceData(test.text, 2, 2, "CD");
	expect([other.start.offset, other.end.offset]).toEqual([2, 5]);
	expect(test.range.start.offset).toBe(1);
	expect(test.tree.revision).toBe(revision);
	expect(prepared.rasterize().image.pixels).toEqual(before.image.pixels);
	expect(documentStyles(test.tree).metrics().cascadeBuilds).toBe(builds);
});

it("keeps detached range movement out of the active editor presentation", () => {
	const test = fixture();
	const detached = test.tree.createText("ABCDE");
	const other = test.owner.createRange();
	other.setStart(detached, 4);
	other.setEnd(detached, 5);
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const revision = test.tree.revision;
	const usage = test.tree.resourceUsage();
	test.tree.replaceData(detached, 2, 2, "CD");
	expect([other.start.offset, other.end.offset]).toEqual([2, 5]);
	expect(test.state()).toMatchObject({ start: 4, end: 4 });
	expect(test.tree.get(detached).parent).toBeNull();
	expect(rangeClientRects(other)).toEqual([]);
	expect(test.tree.resourceUsage()).toEqual(usage);
	expect(test.tree.revision).toBe(revision);
	expect(prepared.rasterize().image.pixels).toEqual(before.image.pixels);
});

it("retains whole-assignment semantics rather than guessing a prefix edit", () => {
	const test = fixture();
	test.tree.setData(test.text, "ABXDE");
	expect(test.tree.get(test.text).data).toBe("ABXDE");
	const after = caret(test, 0, 0);
	expect(after.image.pixels).toEqual(
		rasterizeDocument(fixture("ABXDE", 0).tree).image.pixels,
	);
});

it("uses immutable per-record edits through a reentrant native mutation listener", () => {
	const test = fixture();
	let nested = false;
	const offsets: number[] = [];
	test.tree.onMutation((record) => {
		if (record.type !== "characterData" || record.target !== test.text) return;
		offsets.push(test.range.start.offset);
		if (nested) return;
		nested = true;
		test.tree.replaceData(test.text, 0, 0, "Q");
	});
	test.tree.replaceData(test.text, 1, 1, "X");
	expect(offsets).toEqual([4, 5]);
	expect(test.tree.get(test.text).data).toBe("QAXCDE");
	const after = caret(test, 5, 30);
	expect(after.image.pixels).toEqual(
		rasterizeDocument(fixture("QAXCDE", 5).tree).image.pixels,
	);
});

it.each([
	[6, 0],
	[1, -1],
	[Number.NaN, 1],
] as const)(
	"keeps range, CSS and prepared pixels atomic for invalid edit %s/%s",
	(offset, count) => {
		const test = fixture();
		const prepared = prepareDocumentRaster(test.tree);
		const before = prepared.rasterize();
		const state = test.state();
		const revision = test.tree.revision;
		const notifications: string[] = [];
		test.tree.onMutation((record) => notifications.push(record.type));
		expect(() =>
			test.tree.replaceData(test.text, offset, count, "Z"),
		).toThrow();
		expect(test.state()).toEqual(state);
		expect(test.tree.revision).toBe(revision);
		expect(test.tree.get(test.text).data).toBe("ABCDE");
		expect(notifications).toEqual([]);
		expect(prepared.rasterize().image.pixels).toEqual(before.image.pixels);
	},
);

it("fails text growth atomically without changing active range or prepared raster", () => {
	const test = fixture();
	test.tree.createText(
		"X".repeat(
			test.tree.limits.maxTextCodeUnits -
				test.tree.resourceUsage().textCodeUnits,
		),
	);
	const prepared = prepareDocumentRaster(test.tree);
	const before = prepared.rasterize();
	const state = test.state();
	const revision = test.tree.revision;
	const usage = test.tree.resourceUsage();
	const notifications: string[] = [];
	test.tree.onMutation((record) => notifications.push(record.type));
	expect(() => test.tree.replaceData(test.text, 1, 0, "Z")).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(test.state()).toEqual(state);
	expect(test.tree.revision).toBe(revision);
	expect(test.tree.resourceUsage()).toEqual(usage);
	expect(test.tree.get(test.text).data).toBe("ABCDE");
	expect(notifications).toEqual([]);
	expect(prepared.rasterize().image.pixels).toEqual(before.image.pixels);
});

it("revokes direct edits, ranges and prepared captures after document closure", () => {
	const test = fixture();
	const prepared = prepareDocumentRaster(test.tree);
	test.tree.close();
	expect(() => test.tree.replaceData(test.text, 1, 1, "Z")).toThrow(/closed/);
	expect(() => rangeClientRects(test.range)).toThrow(/closed/);
	expect(() => test.owner.selection.getRangeAt(0)).toThrow(/closed/);
	expect(() => prepared.rasterize()).toThrow(/closed/);
});
