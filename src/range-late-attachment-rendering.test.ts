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

function page() {
	const tree = parseHtmlDocument(
		'<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}#editor{width:120px;min-height:30px;white-space:pre-wrap;color:black;caret-color:red}</style><div id="mount"></div>',
		"https://fixture.invalid/range-late-attachment-rendering",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 60);
	const mount = new DocumentQueries(tree).querySelector("#mount");
	if (mount === null) throw new Error("Missing mount");
	return { tree, mount };
}

function lateFixture(highlight: boolean, nested = false) {
	const { tree, mount } = page();
	const text = tree.createText("CDE");
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	range.setStart(text, highlight ? 0 : 1);
	range.setEnd(text, highlight ? 2 : 1);
	const editor = tree.createElement("div", {
		id: "editor",
		contenteditable: "",
	});
	const prefix = tree.createText("AB");
	const suffix = tree.createText("FG");
	tree.append(editor, prefix);
	let branch = text;
	if (nested) {
		const inner = tree.createElement("span");
		const outer = tree.createElement("span");
		tree.append(inner, text);
		tree.append(outer, inner);
		branch = outer;
	}
	tree.append(editor, branch);
	tree.append(editor, suffix);
	tree.append(mount, editor);
	documentInteractions(tree).focus.focus(tree.reference(editor));
	owner.selection.addRange(range);
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(range.start).toEqual({ node: text, offset: highlight ? 0 : 1 });
	expect(range.end).toEqual({ node: text, offset: highlight ? 2 : 1 });
	return { tree, mount, editor, prefix, suffix, text, branch, owner, range };
}

function finalFixture(parts: readonly string[], offset: number) {
	const { tree, mount } = page();
	const editor = tree.createElement("div", {
		id: "editor",
		contenteditable: "",
	});
	for (const data of parts) tree.append(editor, tree.createText(data));
	tree.append(mount, editor);
	documentInteractions(tree).focus.focus(tree.reference(editor));
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	range.setStart(editor, offset);
	range.setEnd(editor, offset);
	owner.selection.addRange(range);
	return { tree, editor, owner, range };
}

function finalPresentation(
	test: ReturnType<typeof lateFixture>,
	parts: readonly string[],
	offset: number,
	horizontal: number | null,
) {
	expect(test.range.start).toEqual({ node: test.editor, offset });
	expect(test.range.end).toEqual({ node: test.editor, offset });
	expect(test.owner.selection.rangeCount).toBe(1);
	expect(test.owner.selection.getRangeAt(0)).toBe(test.range);
	expect(test.owner.selection.anchorNode).toBe(test.editor);
	expect(test.owner.selection.focusNode).toBe(test.editor);
	expect(test.owner.selection.anchorOffset).toBe(offset);
	expect(test.owner.selection.focusOffset).toBe(offset);
	expect(test.tree.activeElement).toBe(test.editor);
	expect(
		test.tree.get(test.editor).children.map((node) => test.tree.get(node).data),
	).toEqual(parts);
	const expected = finalFixture(parts, offset);
	expect(rangeClientRects(test.range)).toEqual(
		rangeClientRects(expected.range),
	);
	expect(rangeClientRects(test.range)).toEqual([]);
	const caret = prepareEditableCaret(test.tree, layoutDocument(test.tree));
	if (horizontal === null) expect(caret.status).toBe("unsupported");
	else
		expect(caret).toMatchObject({
			status: "ready",
			anchor: { x: horizontal, y: 1, height: 8 },
		});
	const fresh = rasterizeDocument(test.tree);
	const reference = rasterizeDocument(expected.tree);
	expect(fresh.image.pixels).toEqual(reference.image.pixels);
	expect(fresh.metrics).toMatchObject({
		paintedCarets: horizontal === null ? 0 : 1,
		caretStatus: horizontal === null ? "unsupported" : "painted",
		paintedSelectionGlyphs: 0,
		selectionStatus: "collapsed",
	});
	expect(prepareDocumentRaster(test.tree).rasterize().image.pixels).toEqual(
		reference.image.pixels,
	);
	if (horizontal === null) return fresh;
	for (let row = 1; row < 9; row++) {
		const pixel = (row * fresh.image.width + horizontal) * 4;
		expect(Array.from(fresh.image.pixels.slice(pixel, pixel + 4))).toEqual([
			255, 0, 0, 255,
		]);
	}
	return fresh;
}

for (const highlight of [false, true]) {
	it.each([
		["text removal", false, ["AB", "FG"], 1, null],
		["end removal", false, ["AB"], 1, 12],
		["text replacement", false, ["AB", "HI", "FG"], 1, null],
		["children replacement", false, ["HI"], 0, 0],
		["sibling changes then removal", false, ["Q", "FG"], 1, null],
		["nested subtree removal", true, ["AB", "FG"], 1, null],
	] as const)(
		`${highlight ? "highlight" : "caret"} created detached survives late attachment and %s`,
		(operation, nested, parts, offset, horizontal) => {
			const test = lateFixture(highlight, nested);
			if (operation === "end removal") test.tree.remove(test.suffix);
			const prepared = prepareDocumentRaster(test.tree);
			const before = prepared.rasterize();
			expect(before.metrics).toMatchObject({
				paintedCarets: highlight ? 0 : 1,
				paintedSelectionGlyphs: highlight ? 2 : 0,
			});
			expect(rangeClientRects(test.range)).toMatchObject([
				{ x: highlight ? 12 : 18, y: 1, width: highlight ? 12 : 0, height: 8 },
			]);
			if (operation === "text replacement") {
				test.tree.replace(test.editor, test.tree.createText("HI"), test.text);
			} else if (operation === "children replacement") {
				test.tree.setTextContent(test.editor, "HI");
			} else if (operation === "sibling changes then removal") {
				test.tree.insert(test.editor, test.tree.createText("Q"), test.text);
				test.tree.remove(test.prefix);
				test.tree.remove(test.text);
			} else {
				test.tree.remove(test.branch);
			}
			const after = finalPresentation(test, parts, offset, horizontal);
			expect(after.image.pixels).not.toEqual(before.image.pixels);
			expect(test.tree.isConnected(test.text)).toBe(false);
			expect(() => prepared.rasterize()).toThrow(/stale/);
		},
	);

	it(`${highlight ? "highlight" : "caret"} late attachment also tracks removal without any prepaint geometry helper`, () => {
		const test = lateFixture(highlight);
		test.tree.remove(test.text);
		finalPresentation(test, ["AB", "FG"], 1, null);
	});
}

it("explicit endpoint revalidation is a baseline control, not a late-attachment regression", () => {
	const test = lateFixture(false);
	test.range.setStart(test.text, 1);
	test.tree.remove(test.text);
	finalPresentation(test, ["AB", "FG"], 1, null);
});

it("backward selection setup revalidates ancestry and remains an existing control", () => {
	const test = lateFixture(true);
	test.owner.selection.setBaseAndExtent(test.text, 2, test.text, 0);
	const current = { ...test, range: test.owner.selection.getRangeAt(0) };
	expect(current.owner.selection.direction).toBe("backward");
	expect(rasterizeDocument(current.tree).metrics.paintedSelectionGlyphs).toBe(
		2,
	);
	current.tree.remove(current.text);
	finalPresentation(current, ["AB", "FG"], 1, null);
});

it("closing a late-attached selected range revokes geometry and prepared painting", () => {
	const test = lateFixture(false, true);
	const prepared = prepareDocumentRaster(test.tree);
	test.tree.close();
	expect(() => rangeClientRects(test.range)).toThrow(/closed/);
	expect(() => test.owner.selection.getRangeAt(0)).toThrow(/closed/);
	expect(() => prepared.rasterize()).toThrow(/closed/);
	expect(() => test.tree.remove(test.branch)).toThrow(/closed/);
});
