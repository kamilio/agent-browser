import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import * as documentLayout from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll, documentScrollPosition } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { prepareEditableCaret } from "./editable-caret.js";
import { prepareEditableSelection } from "./editable-selection.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { projectFixedLayout } from "./out-of-flow-positioning.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import type { TextGlyph } from "./text-layout.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	source = "AASS",
	fontSize = 8.1,
	transform = "none",
	css = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:120px;min-height:16px;white-space:pre-wrap;font-size:${fontSize}px;margin-left:0.1px;text-transform:${transform};${css}}</style><div id="editor" contenteditable>${source}</div><div style="width:500px;height:500px"></div>`,
		"https://fixture.invalid/plain-fractional-editable",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 100);
	const editor = new DocumentQueries(tree).querySelector("#editor");
	if (editor === null) throw new Error("Missing editor");
	const text = tree.get(editor).children[0] ?? editor;
	const owner = domRangeOwner(tree);
	const select = (start: number, end = start) => {
		documentInteractions(tree).focus.focusElement(editor, {
			preventScroll: true,
		});
		owner.selection.setBaseAndExtent(text, start, text, end);
		return owner.selection.getRangeAt(0);
	};
	return { tree, editor, text, owner, select };
}

const sources = [
	{ source: "AASS", transform: "none", boundaries: [0, 1, 2, 3, 4] },
	{ source: "aa\u00df", transform: "uppercase", boundaries: [0, 1, 2, 4] },
];

describe.each([0.1, 8, 8.1, 12.7])(
	"fractional editable font %spx",
	(fontSize) => {
		for (const { source, transform, boundaries } of sources) {
			it.each(boundaries.map((visual, offset) => ({ visual, offset })))(
				`${transform} source caret $offset maps to visual $visual`,
				({ offset, visual }) => {
					const { tree, owner, select } = fixture(source, fontSize, transform);
					const range = select(offset);
					const layout = layoutDocument(tree);
					const glyphs = layout.contexts.flatMap((context) => context.glyphs);
					const expectedX =
						glyphs[visual]?.x ?? glyphs.at(-1)!.x + glyphs.at(-1)!.advance;
					const rects = rangeClientRects(range);
					expect(rects).toHaveLength(1);
					expect(rects[0]).toMatchObject({ width: 0, height: fontSize });
					expect(rects[0].x).toBeCloseTo(expectedX, 12);
					const caret = prepareEditableCaret(tree, layout);
					expect(caret.status).toBe("ready");
					expect(caret.anchor?.x).toBeCloseTo(expectedX, 12);
					expect(caret.anchor?.height).toBe(fontSize);
					expect(caret.anchor?.x).toBe(rects[0].x);
					expect(caret.anchor?.y).toBe(rects[0].y);
					expect(owner.selection.getRangeAt(0)).toBe(range);
					expect(range.start.offset).toBe(offset);
					expect(range.end.offset).toBe(offset);
					expect(rasterizeDocument(tree).metrics.caretStatus).toBe("painted");
				},
			);
			const intervals = boundaries.flatMap((_, start) =>
				boundaries
					.slice(start + 1)
					.map((_, index) => ({ start, end: start + index + 1 })),
			);
			it.each(intervals)(
				`${transform} source selection $start to $end`,
				({ start, end }) => {
					const { tree, select } = fixture(source, fontSize, transform);
					const range = select(start, end);
					expect(range.toString()).toBe(source.slice(start, end));
					expect(rangeClientRects(range)).toHaveLength(1);
					const selection = prepareEditableSelection(
						tree,
						layoutDocument(tree),
					);
					expect(selection.status).toBe("ready");
					expect(selection.glyphs.size).toBe(end - start);
					expect(rasterizeDocument(tree).metrics.selectionStatus).toBe(
						fontSize < 1 ? "clipped" : "painted",
					);
				},
			);
		}
	},
);

it.each(["relative", "absolute", "fixed"])(
	"preserves %s fractional offsets and root scroll",
	(position) => {
		for (const { source, transform } of sources) {
			const { tree, select } = fixture(
				source,
				8.1,
				transform,
				`position:${position};left:20.1px;top:50.2px`,
			);
			for (const scroll of [false, true]) {
				if (scroll) documentScroll(tree).to(10.1, 30.2);
				for (let offset = 0; offset <= source.length; offset++) {
					const range = select(offset);
					const scrollPosition = documentScrollPosition(tree);
					const layout = projectFixedLayout(
						layoutDocument(tree),
						scrollPosition,
						250_000,
					);
					const caret = prepareEditableCaret(tree, layout);
					expect(
						caret.status,
						`${position} ${transform} scroll=${scroll} offset=${offset}`,
					).toBe("ready");
					const rects = rangeClientRects(range);
					expect(rects).toHaveLength(1);
					expect(rects[0].width).toBe(0);
					expect(caret.anchor?.x).toBeCloseTo(
						rects[0].x + scrollPosition.x,
						12,
					);
					expect(caret.anchor?.y).toBeCloseTo(
						rects[0].y + scrollPosition.y,
						12,
					);
					expect(rasterizeDocument(tree).metrics.caretStatus).toBe("painted");
				}
				select(0, source.length);
				expect(
					prepareEditableSelection(
						tree,
						projectFixedLayout(
							layoutDocument(tree),
							documentScrollPosition(tree),
							250_000,
						),
					).status,
				).toBe("ready");
			}
		}
	},
);

function changedLayout(
	mutate: (glyph: Readonly<TextGlyph>) => Readonly<TextGlyph>,
) {
	const state = fixture();
	const original = layoutDocument(state.tree);
	const layout = {
		...original,
		contexts: original.contexts.map((context) => ({
			...context,
			glyphs: context.glyphs.map(mutate),
		})),
	};
	return { ...state, layout };
}

it.each([-1, 0, 1])(
	"accepts only roundoff at a shared boundary in direction %s",
	(direction) => {
		const state = fixture();
		const original = layoutDocument(state.tree);
		const layout = {
			...original,
			contexts: original.contexts.map((context) => {
				const previous = context.glyphs.find((glyph) => glyph.offset === 2);
				return {
					...context,
					glyphs: context.glyphs.map((glyph) =>
						glyph.offset === 3 && previous
							? {
									...glyph,
									x:
										previous.x +
										previous.advance +
										direction * Number.EPSILON * 16,
								}
							: glyph,
					),
				};
			}),
		};
		vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
		const range = state.select(3);
		const rects = rangeClientRects(range);
		expect(rects).toHaveLength(1);
		expect(rects[0].width).toBe(0);
		expect(prepareEditableCaret(state.tree, layout).status).toBe("ready");
		expect(prepareEditableCaret(state.tree, layout).anchor?.x).toBe(rects[0].x);
	},
);

it("rejects duplicate source contexts instead of choosing an arbitrary boundary", () => {
	const { tree, select } = fixture();
	const original = layoutDocument(tree);
	const layout = {
		...original,
		contexts: [...original.contexts, ...original.contexts],
	};
	vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
	const range = select(3);
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(prepareEditableCaret(tree, layout).status).toBe("unsupported");
});

it("retains source copying and boundaries for combining lowercase expansion", () => {
	const source = "A\u0130";
	const { tree, select } = fixture(source, 8.1, "lowercase");
	const layout = layoutDocument(tree);
	expect(
		layout.contexts
			.flatMap((context) => context.glyphs)
			.map((glyph) => glyph.character)
			.join(""),
	).toBe("ai\u0307");
	const range = select(0, source.length);
	expect(range.toString()).toBe(source);
	expect(prepareEditableSelection(tree, layout).status).toBe("ready");
	for (let offset = 0; offset <= source.length; offset++) {
		const collapsed = select(offset);
		expect(rangeClientRects(collapsed)).toMatchObject([{ width: 0 }]);
		expect(prepareEditableCaret(tree, layout).status).toBe("ready");
	}
});

it.each([-0.000001, 0.000001])(
	"rejects real boundary displacement %s",
	(difference) => {
		const { tree, layout, select } = changedLayout((glyph) =>
			glyph.offset === 3 ? { ...glyph, x: glyph.x + difference } : glyph,
		);
		vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
		const range = select(3);
		expect(() => rangeClientRects(range)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(prepareEditableCaret(tree, layout).status).toBe("unsupported");
	},
);

it.each([
	{ line: 1 },
	{ formattingId: 0 },
	{ fontSize: 8.2 },
	{ y: 1.000001 },
	{ codeUnits: 2 },
	{ offset: 2 },
])("rejects ambiguous or mismatched boundary metadata %j", (changes) => {
	const { tree, layout, select } = changedLayout((glyph) =>
		glyph.offset === 3 ? { ...glyph, ...changes } : glyph,
	);
	vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
	const range = select(3);
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(prepareEditableCaret(tree, layout).status).toBe("unsupported");
});

it.each([
	{ x: Number.NaN },
	{ x: Number.POSITIVE_INFINITY },
	{ x: Number.NEGATIVE_INFINITY },
	{ y: Number.NaN },
	{ y: Number.POSITIVE_INFINITY },
	{ advance: Number.NaN },
	{ advance: Number.POSITIVE_INFINITY },
	{ advance: -1 },
	{ fontSize: Number.NaN },
	{ fontSize: Number.POSITIVE_INFINITY },
	{ fontSize: -1 },
	{ fontSize: 0, advance: 1 },
	{ x: Number.MAX_VALUE, advance: Number.MAX_VALUE },
	{ y: Number.MAX_VALUE, fontSize: Number.MAX_VALUE },
	{ y: Number.MAX_VALUE, fontSize: Number.MAX_VALUE, advance: 0 },
])("rejects invalid selected glyph metrics %j", (changes) => {
	const { tree, layout, select } = changedLayout((glyph) => ({
		...glyph,
		...changes,
	}));
	select(0, 4);
	expect(prepareEditableSelection(tree, layout).status).toBe("unsupported");
	vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
	const range = select(3);
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	const fullRange = select(0, 4);
	expect(() => rangeClientRects(fullRange)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	select(3);
	expect(prepareEditableCaret(tree, layout).status).toBe("unsupported");
});

it.each([-0.000001, 0.000001])(
	"rejects real selection containment excess %s",
	(difference) => {
		const { tree, layout, select } = changedLayout((glyph) => ({
			...glyph,
			x: glyph.x + difference,
		}));
		select(0, 4);
		expect(prepareEditableSelection(tree, layout).status).toBe("unsupported");
	},
);

it.each(sources)(
	"retains zero-font and empty limits for $transform",
	({ source, transform }) => {
		const { tree, select } = fixture(source, 0, transform);
		select(0, source.length);
		expect(prepareEditableSelection(tree, layoutDocument(tree)).status).toBe(
			"zero-advance",
		);
		for (let offset = 0; offset <= source.length; offset++) {
			const range = select(offset);
			expect(rangeClientRects(range)).toMatchObject([{ width: 0, height: 0 }]);
			expect(prepareEditableCaret(tree, layoutDocument(tree)).status).toBe(
				"unsupported",
			);
		}
		const empty = fixture("", 0, transform);
		empty.select(0);
		expect(
			prepareEditableCaret(empty.tree, layoutDocument(empty.tree)).status,
		).toBe("unsupported");
		const visible = fixture("", 8.1, transform);
		visible.select(0);
		expect(
			prepareEditableCaret(visible.tree, layoutDocument(visible.tree)).status,
		).toBe("ready");
	},
);

it("does not widen ambiguous soft-wrap or interior UTF-16 boundaries", () => {
	const wrapped = fixture("AB CD", 8, "none", "width:18px");
	wrapped.select(3);
	expect(
		prepareEditableCaret(wrapped.tree, layoutDocument(wrapped.tree)).status,
	).toBe("unsupported");
	const supplementary = fixture("\u{10428}", 8.1, "uppercase");
	supplementary.select(1);
	expect(
		prepareEditableCaret(supplementary.tree, layoutDocument(supplementary.tree))
			.status,
	).toBe("unsupported");
});

it("keeps bounded-work limits explicit", () => {
	const { tree, select } = fixture();
	const range = select(3);
	expect(() => rangeClientRects(range, { maxWork: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(prepareEditableCaret(tree, layoutDocument(tree), 1).status).toBe(
		"limited",
	);
	select(0, 4);
	expect(prepareEditableSelection(tree, layoutDocument(tree), 1).status).toBe(
		"limited",
	);
});

it("rejects a near-roundoff boundary across different text contexts", () => {
	const { tree, select } = fixture();
	const original = layoutDocument(tree);
	const layout = {
		...original,
		contexts: original.contexts.flatMap((context) => [
			{
				...context,
				glyphs: context.glyphs.filter((glyph) => glyph.offset !== 3),
			},
			{
				...context,
				id: context.id + 1000,
				glyphs: context.glyphs.filter((glyph) => glyph.offset === 3),
			},
		]),
	};
	vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
	const range = select(3);
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(prepareEditableCaret(tree, layout).status).toBe("unsupported");
});

it("does not treat a vertical discrepancy as horizontal roundoff", () => {
	const { tree, layout, select } = changedLayout((glyph) =>
		glyph.offset === 3 ? { ...glyph, y: glyph.y + Number.EPSILON } : glyph,
	);
	vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
	const range = select(3);
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(prepareEditableCaret(tree, layout).status).toBe("unsupported");
});

it("rejects an overflowing union of individually finite glyph edges", () => {
	const { tree, layout, select } = changedLayout((glyph) => ({
		...glyph,
		x: glyph.offset < 2 ? -Number.MAX_VALUE : Number.MAX_VALUE,
	}));
	vi.spyOn(documentLayout, "layoutDocument").mockReturnValue(layout);
	const range = select(0, 4);
	expect(() => rangeClientRects(range)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(prepareEditableSelection(tree, layout).status).toBe("unsupported");
});

it.each(["a\u0301", "\u05d0", "a\u200fb"])(
	"retains unsupported source shaping for %s",
	(source) => {
		const { tree, select } = fixture(source);
		for (let offset = 0; offset <= source.length; offset++) {
			const range = select(offset);
			expect(() => rangeClientRects(range)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
			expect(prepareEditableCaret(tree, layoutDocument(tree)).status).toBe(
				"unsupported",
			);
		}
	},
);
