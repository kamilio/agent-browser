import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import * as documentLayout from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { prepareEditableCaret } from "./editable-caret.js";
import {
	paintEditableSelection,
	prepareEditableSelection,
} from "./editable-selection.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { rangeClientRects } from "./range-geometry.js";
import { createRaster, paintRasterRect } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import type { TextGlyph } from "./text-layout.js";
import { consolidateSourceGlyphs } from "./text-source-glyphs.js";

type SourceGlyph = Readonly<TextGlyph> & { readonly transformed?: true };
const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function glyph(overrides: Partial<SourceGlyph> = {}): SourceGlyph {
	return Object.freeze({
		formattingId: 1,
		ref: "text:1",
		offset: 0,
		codeUnits: 1,
		character: "S",
		kind: "glyph",
		supported: true,
		visible: true,
		fontSize: 8,
		line: 0,
		x: 0,
		y: 1,
		advance: 6,
		transformed: true,
		...overrides,
	});
}

function consolidate(glyphs: readonly SourceGlyph[], maxWork = 1_000) {
	let work = 0;
	return [
		...consolidateSourceGlyphs(glyphs, (amount = 1) => {
			work += amount;
			if (work > maxWork)
				throw new AgentBrowserError("resource-limit", "Test work limit");
		}),
	];
}

function fixture(source = "ab", transform = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:120px;min-height:16px;white-space:pre-wrap;${transform ? `text-transform:${transform}` : ""}}</style><div id="editor" contenteditable>${source}</div>`,
		"https://fixture.invalid/text-transform-ranges",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 100);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const text = tree.get(editor).children[0];
	const owner = domRangeOwner(tree);
	const range = owner.createRange();
	const select = (start: number, end = start) => {
		documentInteractions(tree).focus.focusElement(editor, {
			preventScroll: true,
		});
		owner.selection.setBaseAndExtent(text, start, text, end);
	};
	return { tree, editor, text, range, owner, select };
}

function syntheticExpansion(
	mutate: (glyphs: readonly SourceGlyph[]) => readonly SourceGlyph[] = (
		glyphs,
	) => glyphs,
) {
	const state = fixture();
	const original = layoutDocument(state.tree);
	const layout = {
		...original,
		contexts: original.contexts.map((context) => ({
			...context,
			glyphs: mutate(
				context.glyphs.flatMap((source) =>
					source.offset === 0
						? [
								glyph({ ...source, character: "S" }),
								glyph({
									...source,
									character: "S",
									x: source.x + source.advance,
								}),
							]
						: [{ ...source, x: source.x + 6 }],
				),
			),
		})),
	};
	vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
	return { ...state, layout };
}

describe("bounded source glyph consolidation", () => {
	it("accepts zero-font zero-advance source expansions", () => {
		const first = glyph({ fontSize: 0, advance: 0 });
		expect(consolidate([first, first, first])).toEqual([first]);
	});

	it.each([-1, 1])("accepts bounded roundoff in direction %i", (direction) => {
		const first = glyph({ x: 12.249999999999998, advance: 6.074999999999999 });
		const second = glyph({
			x: first.x + first.advance + direction * Number.EPSILON * 16,
			advance: first.advance,
		});
		expect(consolidate([first, second])).toEqual([
			{ ...first, advance: second.x + second.advance - first.x },
		]);
	});

	it.each([-0.000001, 0.000001])(
		"still rejects a real subpixel gap or overlap of %s",
		(difference) => {
			expect(() =>
				consolidate([glyph(), glyph({ x: 6 + difference })]),
			).toThrow(expect.objectContaining({ code: "unsupported" }));
		},
	);

	it("keeps unmarked objects unchanged, including old overlap guards", () => {
		const first = glyph({ transformed: undefined });
		const second = glyph({ transformed: undefined, x: 6 });
		const result = consolidate([first, second]);
		expect(result).toHaveLength(2);
		expect(result[0]).toBe(first);
		expect(result[1]).toBe(second);
	});

	it.each([2, 3, 8])(
		"merges %i adjacent visual glyphs without mutation",
		(count) => {
			const input = Array.from({ length: count }, (_, index) =>
				glyph({ x: index * 6 }),
			);
			const result = consolidate(input);
			expect(result).toEqual([{ ...input[0], advance: count * 6 }]);
			expect(Object.isFrozen(result[0])).toBe(true);
			expect(input.every((entry) => entry.advance === 6)).toBe(true);
		},
	);

	it("keeps neighboring source spans separate", () => {
		expect(
			consolidate([
				glyph(),
				glyph({ x: 6 }),
				glyph({ offset: 1, x: 12 }),
				glyph({ offset: 1, x: 18 }),
			]),
		).toMatchObject([
			{ offset: 0, x: 0, advance: 12 },
			{ offset: 1, x: 12, advance: 12 },
		]);
	});

	it("consolidates mixed bitmap support for the U+0130 lowercase expansion", () => {
		const first = glyph({ character: "i" });
		const second = glyph({ character: "\u0307", supported: false, x: 6 });
		expect(consolidate([first, second])).toEqual([
			{ ...first, advance: 12, supported: false },
		]);
		expect(first.supported).toBe(true);
		expect(second.supported).toBe(false);
	});

	it.each([
		{ support: [true, false] },
		{ support: [false, true] },
		{ support: [true, false, true] },
		{ support: [false, false] },
		{ support: [true, true, true] },
	])("combines bitmap support conservatively for %j", ({ support }) => {
		const input = support.map((supported, index) =>
			glyph({ supported, x: index * 6 }),
		);
		expect(consolidate(input)).toEqual([
			{
				...input[0],
				advance: support.length * 6,
				supported: support.every(Boolean),
			},
		]);
	});

	it("preserves deletion source spans and zero-width geometry", () => {
		const deleted = glyph({ character: "", advance: 0 });
		expect(consolidate([deleted])[0]).toBe(deleted);
		expect(consolidate([deleted, glyph()])).toEqual([
			{ ...deleted, advance: 6 },
		]);
		expect(
			consolidate([glyph(), glyph({ character: "", x: 6, advance: 0 })]),
		).toEqual([glyph()]);
	});

	it.each([
		{ x: 7 },
		{ x: 5 },
		{ x: -6 },
		{ y: 2 },
		{ formattingId: 2 },
		{ line: 1 },
		{ fontSize: 9 },
		{ visible: false },
	])("rejects inconsistent adjacent geometry %j", (overrides) => {
		expect(() =>
			consolidate([glyph(), glyph({ x: 6, supported: false, ...overrides })]),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
	});

	it.each([
		{ advance: -1 },
		{ advance: Number.NaN },
		{ advance: Number.POSITIVE_INFINITY },
		{ x: Number.NaN },
		{ y: Number.NEGATIVE_INFINITY },
		{ fontSize: 0 },
		{ fontSize: -1 },
		{ fontSize: Number.NaN },
		{ offset: -1 },
		{ offset: 0.5 },
		{ codeUnits: 0 },
		{ codeUnits: 0.5 },
		{ codeUnits: Number.MAX_SAFE_INTEGER, offset: 1 },
		{ formattingId: -1 },
		{ line: -1 },
		{ kind: "tab" as const },
	])("rejects malformed marked metrics %j", (overrides) => {
		expect(() => consolidate([glyph(overrides)])).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	});

	it("rejects a source expansion interrupted by another source", () => {
		expect(() =>
			consolidate([glyph(), glyph({ offset: 1, x: 6 }), glyph({ x: 12 })]),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
	});

	it("charges input traversal and source-key allocation", () => {
		expect(() => consolidate([glyph()], 1)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(() =>
			consolidate(
				Array.from({ length: 50 }, (_, index) => glyph({ x: index * 6 })),
				20,
			),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	});
});

describe("synthetic expansion geometry and retained guards", () => {
	it("preserves a deleted source interval as zero-width range geometry", () => {
		const { range, text, select, tree, layout } = syntheticExpansion(
			(entries) =>
				entries
					.filter((_, index) => index !== 1)
					.map((entry) =>
						entry.offset === 0
							? { ...entry, character: "", advance: 0 }
							: { ...entry, x: 0 },
					),
		);
		for (const [start, end] of [
			[0, 0],
			[0, 1],
			[1, 1],
		]) {
			range.setStart(text, start);
			range.setEnd(text, end);
			expect(rangeClientRects(range)).toMatchObject([{ x: 0, width: 0 }]);
		}
		select(0, 1);
		expect(prepareEditableSelection(tree, layout).status).toBe("zero-advance");
		select(0);
		expect(prepareEditableCaret(tree, layout)).toMatchObject({
			status: "ready",
			anchor: { x: 0 },
		});
	});

	it.each([
		[0, 0, 0, 0],
		[0, 1, 0, 12],
		[1, 1, 12, 0],
		[1, 2, 12, 6],
	])(
		"maps source interval %i..%i to outer geometry",
		(start, end, x, width) => {
			const { range, text } = syntheticExpansion();
			range.setStart(text, start);
			range.setEnd(text, end);
			expect(rangeClientRects(range)).toMatchObject([
				{ x, y: 1, width, height: 8 },
			]);
		},
	);

	it.each([true, false])(
		"paints the background once with second bitmap support %s",
		(supported) => {
			const { tree, layout, select } = syntheticExpansion((entries) =>
				entries.map((entry, index) =>
					index === 1 ? { ...entry, supported } : entry,
				),
			);
			select(0, 1);
			const selection = prepareEditableSelection(tree, layout);
			expect(selection.status).toBe("ready");
			expect([...selection.glyphs.values()]).toMatchObject([
				{ x: 0, y: 1, width: 12, height: 8 },
			]);
			const expanded = layout.contexts
				.flatMap((context) => context.glyphs)
				.filter((entry) => entry.offset === 0);
			const image = createRaster(30, 20);
			const charge = vi.fn();
			paintEditableSelection(
				selection,
				expanded[0],
				image,
				{ x: 0, y: 0 },
				charge,
			);
			paintRasterRect(image, 1, 2, 1, 1, [255, 0, 0, 255]);
			paintEditableSelection(
				selection,
				expanded[1],
				image,
				{ x: 0, y: 0 },
				charge,
			);
			expect(selection).toMatchObject({
				status: "painted",
				paintedGlyphs: 1,
				pixels: 96,
			});
			expect(charge).toHaveBeenCalledTimes(1);
			const pixel = (2 * image.width + 1) * 4;
			expect([...image.pixels.slice(pixel, pixel + 4)]).toEqual([
				255, 0, 0, 255,
			]);
		},
	);

	it.each([
		[0, 0],
		[1, 12],
	])("anchors collapsed source %i at x=%i", (offset, x) => {
		const { tree, layout, select } = syntheticExpansion();
		select(offset);
		expect(prepareEditableCaret(tree, layout)).toMatchObject({
			status: "ready",
			anchor: { x, y: 1, height: 8 },
		});
	});

	it.each(["unmarked", "mixed", "partial", "outside", "disjoint"])(
		"retains malformed %s source overlap rejection",
		(kind) => {
			const { range, text } = syntheticExpansion((entries) =>
				entries.map((entry, index) => {
					if (index > 1) return entry;
					if (kind === "unmarked" || (kind === "mixed" && index === 1))
						return { ...entry, transformed: undefined };
					if (kind === "partial" && index === 0)
						return { ...entry, codeUnits: 2 };
					if (kind === "outside") return { ...entry, codeUnits: 3 };
					if (kind === "disjoint" && index === 1)
						return { ...entry, x: entry.x + 1 };
					return entry;
				}),
			);
			range.setStart(text, 0);
			range.setEnd(text, 1);
			expect(() => rangeClientRects(range)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
		},
	);

	it("retains bounded selection and caret cleanup", () => {
		const { tree, layout, select } = syntheticExpansion();
		select(0, 1);
		const selection = prepareEditableSelection(tree, layout, 1);
		expect(selection.status).toBe("limited");
		expect(selection.glyphs.size).toBe(0);
		select(0);
		expect(prepareEditableCaret(tree, layout, 1).status).toBe("limited");
	});
});

describe("actual native uppercase expansion", () => {
	it.each(["a", "\u00df", "\ufb03"])(
		"preserves visible selection beside zero-font transformed %s",
		(source) => {
			const { tree, editor, owner, range } = fixture(
				`<span style="font-size:0;text-transform:uppercase">${source}</span><span>ok</span>`,
			);
			const spans = tree.get(editor).children;
			const hiddenText = tree.get(spans[0]).children[0];
			const visibleText = tree.get(spans[1]).children[0];
			range.setStart(hiddenText, 0);
			range.setEnd(hiddenText, source.length);
			expect(rangeClientRects(range)).toMatchObject([{ width: 0, height: 0 }]);
			range.setStart(visibleText, 0);
			range.setEnd(visibleText, 2);
			expect(rangeClientRects(range)).toMatchObject([
				{ x: 0, width: 12, height: 8 },
			]);
			documentInteractions(tree).focus.focusElement(editor, {
				preventScroll: true,
			});
			owner.selection.setBaseAndExtent(visibleText, 0, visibleText, 2);
			expect(prepareEditableSelection(tree, layoutDocument(tree)).status).toBe(
				"ready",
			);
			expect(rasterizeDocument(tree).metrics.selectionStatus).toBe("painted");
			owner.selection.setBaseAndExtent(visibleText, 2, visibleText, 2);
			expect(prepareEditableCaret(tree, layoutDocument(tree))).toMatchObject({
				status: "ready",
				anchor: { x: 12 },
			});
			expect(rasterizeDocument(tree).metrics.caretStatus).toBe("painted");
		},
	);

	it.each([8.1, 0.1, 12.7])(
		"preserves source geometry and overlays at fractional %spx",
		(fontSize) => {
			const source = "aa\u00df";
			const state = fixture(source, "uppercase");
			const control = fixture("AASS");
			for (const page of [state, control]) {
				page.tree.setAttribute(
					page.editor,
					"style",
					`font-size:${fontSize}px;margin-left:0.1px`,
				);
				page.range.setStart(page.text, 0);
				page.range.setEnd(page.text, page.tree.textContent(page.editor).length);
			}
			expect(rangeClientRects(state.range)).toEqual(
				rangeClientRects(control.range),
			);
			expect(state.range.toString()).toBe(source);
			state.select(0, source.length);
			control.select(0, 4);
			expect(
				prepareEditableSelection(state.tree, layoutDocument(state.tree)).status,
			).toBe("ready");
			expect(rasterizeDocument(state.tree).metrics.selectionStatus).toBe(
				fontSize < 1 ? "clipped" : "painted",
			);
			expect(rasterizeDocument(control.tree).metrics.selectionStatus).toBe(
				fontSize < 1 ? "unsupported" : "painted",
			);
			state.select(source.length);
			control.select(4);
			const caret = prepareEditableCaret(
				state.tree,
				layoutDocument(state.tree),
			);
			const controlCaret = prepareEditableCaret(
				control.tree,
				layoutDocument(control.tree),
			);
			expect(caret.status).toBe("ready");
			expect(caret.anchor?.x).toBe(controlCaret.anchor?.x);
			expect(rasterizeDocument(state.tree).metrics.caretStatus).toBe(
				rasterizeDocument(control.tree).metrics.caretStatus,
			);
		},
	);

	it.each([
		["ß", "SS"],
		["ﬃ", "FFI"],
	])("maps %s to %s without changing source text", (source, visual) => {
		const { tree, editor, text, range } = fixture(`a${source}b`, "uppercase");
		const glyphs = layoutDocument(tree).contexts.flatMap(
			(context) => context.glyphs,
		);
		expect(glyphs.map((entry) => entry.character).join("")).toBe(`A${visual}B`);
		expect(glyphs.filter((entry) => entry.offset === 1)).toHaveLength(
			visual.length,
		);
		expect(
			glyphs
				.filter((entry) => entry.offset === 1)
				.every(
					(entry) =>
						(entry as SourceGlyph).transformed === true &&
						entry.codeUnits === 1,
				),
		).toBe(true);
		range.setStart(text, 1);
		range.setEnd(text, 2);
		expect(rangeClientRects(range)).toMatchObject([
			{ x: 6, width: visual.length * 6 },
		]);
		expect(range.toString()).toBe(source);
		expect(tree.textContent(editor)).toBe(`a${source}b`);
	});

	it.each([
		["ß", 12],
		["ﬃ", 18],
	])("uses outer start/end collapsed edges for %s", (source, width) => {
		const { text, range } = fixture(source, "uppercase");
		for (const [offset, x] of [
			[0, 0],
			[1, width],
		]) {
			range.setStart(text, offset);
			range.setEnd(text, offset);
			expect(rangeClientRects(range)).toMatchObject([{ x, width: 0 }]);
		}
	});

	it.each([
		["ß", 12],
		["ﬃ", 18],
	])(
		"paints source-indexed selection and caret overlays for %s",
		(source, width) => {
			const { tree, select } = fixture(source, "uppercase");
			select(0, 1);
			const selection = prepareEditableSelection(tree, layoutDocument(tree));
			expect(selection.status).toBe("ready");
			expect([...selection.glyphs.values()]).toMatchObject([{ x: 0, width }]);
			expect(rasterizeDocument(tree).metrics).toMatchObject({
				selectionStatus: "painted",
				paintedSelectionGlyphs: 1,
				selectionPixels: width * 8,
			});
			select(1);
			expect(prepareEditableCaret(tree, layoutDocument(tree))).toMatchObject({
				status: "ready",
				anchor: { x: width },
			});
			expect(rasterizeDocument(tree).metrics).toMatchObject({
				caretStatus: "painted",
				paintedCarets: 1,
			});
		},
	);
});

it("maps native lowercase U+0130 with mixed bitmap support and source overlays", () => {
	const { tree, editor, text, range, select } = fixture("\u0130", "lowercase");
	const layout = layoutDocument(tree);
	const glyphs = layout.contexts.flatMap((context) => context.glyphs);
	expect(glyphs.map((entry) => entry.character)).toEqual(["i", "\u0307"]);
	expect(glyphs.map((entry) => entry.supported)).toEqual([true, false]);
	expect(
		glyphs.every(
			(entry) =>
				(entry as SourceGlyph).transformed === true &&
				entry.offset === 0 &&
				entry.codeUnits === 1,
		),
	).toBe(true);
	range.setStart(text, 0);
	range.setEnd(text, 1);
	expect(rangeClientRects(range)).toMatchObject([{ x: 0, width: 12 }]);
	expect(range.toString()).toBe("\u0130");
	expect(tree.textContent(editor)).toBe("\u0130");
	select(0, 1);
	const selection = prepareEditableSelection(tree, layoutDocument(tree));
	expect(selection.status).toBe("ready");
	expect([...selection.glyphs.values()]).toMatchObject([{ x: 0, width: 12 }]);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		selectionStatus: "painted",
		paintedSelectionGlyphs: 1,
		selectionPixels: 96,
	});
	select(1);
	expect(prepareEditableCaret(tree, layoutDocument(tree))).toMatchObject({
		status: "ready",
		anchor: { x: 12 },
	});
});
