import { afterEach, expect, it } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { rangeBoundingClientRect, rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	content: string,
	css = "",
	html = '<main id="target">X</main>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}body{font-size:8px;line-height:10px}#target{white-space:pre-wrap}${css}</style>${html}`,
		"https://fixture.invalid/range-break-mapping",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 100);
	const target = new DocumentQueries(tree).querySelector("#target");
	if (target === null) throw Error("Missing target");
	const text = tree.get(target).children[0];
	tree.setTextContent(text, content);
	const range = domRangeOwner(tree).createRange();
	range.selectNodeContents(text);
	return { tree, target, text, range };
}

it.each(["\n", "\r", "\r\n", "\f"])(
	"retains the exact UTF-16 source span for %j",
	(separator) => {
		const { tree, text, range } = fixture(`A${separator}B`);
		const context = layoutDocument(tree).contexts.find((context) =>
			context.glyphs.some((glyph) => glyph.ref === tree.reference(text)),
		);
		const boundary = context?.lines[0].sourceBreak;
		expect(boundary?.sources).toMatchObject([
			{ ref: tree.reference(text), offset: 1, codeUnits: separator.length },
		]);
		expect(boundary).toMatchObject({
			inlineOffset: 6,
			fontSize: 8,
			ascent: 7,
			followingLine: { inlineOffset: 0, baselineOffset: 10 },
		});
		expect(context?.glyphs.map((glyph) => glyph.offset)).toEqual([
			0,
			separator.length + 1,
		]);
		range.setStart(text, 1);
		range.setEnd(text, separator.length + 1);
		expect(rangeClientRects(range)).toMatchObject([
			{ x: 6, y: 1, width: 0, height: 8 },
		]);
		range.collapse(false);
		expect(rangeBoundingClientRect(range)).toMatchObject({
			x: 0,
			y: 11,
			width: 0,
			height: 8,
		});
	},
);

it.each(["pre", "pre-wrap", "pre-line"])(
	"maps consecutive and terminal breaks for %s without adding lines",
	(mode) => {
		const { tree, text, range } = fixture(
			"A\n\nB\n",
			`#target{white-space:${mode}}`,
		);
		const lines = layoutDocument(tree).contexts.flatMap(
			(context) => context.lines,
		);
		expect(lines).toHaveLength(3);
		expect(rangeClientRects(range)).toMatchObject([
			{ x: 0, y: 1, width: 6, height: 8 },
			{ x: 0, y: 11, width: 0, height: 8 },
			{ x: 0, y: 21, width: 6, height: 8 },
		]);
		range.collapse(false);
		expect(rangeBoundingClientRect(range)).toMatchObject({
			x: 0,
			y: 31,
			width: 0,
			height: 8,
		});
		range.setStart(text, 2);
		range.collapse(true);
		expect(rangeBoundingClientRect(range)).toMatchObject({
			x: 0,
			y: 11,
			width: 0,
			height: 8,
		});
	},
);

it("keeps a CRLF interior boundary on the combined break unit", () => {
	const { text, range } = fixture("A\r\nB");
	range.setStart(text, 2);
	range.collapse(true);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 6,
		y: 1,
		width: 0,
		height: 8,
	});
});

it("retains exact source offsets after astral characters and break pairs", () => {
	const { tree, text, range } = fixture("😀\r\nB");
	const glyphs = layoutDocument(tree).contexts.flatMap(
		(context) => context.glyphs,
	);
	expect(glyphs.map((glyph) => [glyph.offset, glyph.codeUnits])).toEqual([
		[0, 2],
		[4, 1],
	]);
	range.setStart(text, 4);
	range.setEnd(text, 5);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 0,
		y: 11,
		width: 6,
		height: 8,
	});
});

it("maps partial ranges through different line widths and alignment", () => {
	const { text, range } = fixture(
		"ABC\nD\nEF",
		"#target{width:100px;text-align:center}",
	);
	range.setStart(text, 1);
	range.setEnd(text, 7);
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 47, y: 1, width: 12, height: 8 },
		{ x: 47, y: 11, width: 6, height: 8 },
		{ x: 44, y: 21, width: 6, height: 8 },
	]);
	range.setStart(text, 4);
	range.collapse(true);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 47,
		y: 11,
		width: 0,
		height: 8,
	});
});

it("uses final empty-line strut alignment for a terminal caret", () => {
	const { tree, range } = fixture(
		"AB\n",
		"#target{width:100px;text-align:right}",
	);
	expect(
		layoutDocument(tree).contexts.flatMap((context) => context.lines),
	).toHaveLength(1);
	range.collapse(false);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 100,
		y: 11,
		width: 0,
		height: 8,
	});
});

it("maps a break-only text node and multiple blank lines", () => {
	const { tree, text, range } = fixture("\n\n");
	expect(layoutDocument(tree).metrics.glyphs).toBe(0);
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 0, y: 1, width: 0, height: 8 },
		{ x: 0, y: 11, width: 0, height: 8 },
	]);
	for (const [offset, top] of [
		[0, 1],
		[1, 11],
		[2, 21],
	]) {
		range.setStart(text, offset);
		range.collapse(true);
		expect(rangeBoundingClientRect(range)).toMatchObject({
			x: 0,
			y: top,
			width: 0,
			height: 8,
		});
	}
});

it("retains CRLF ownership when splitText separates the two code units", () => {
	const { tree, text, range } = fixture("A\r\nB");
	const owner = domRangeOwner(tree);
	const suffix = owner.splitText(text, 2);
	const source = layoutDocument(tree)
		.contexts.flatMap((context) => context.lines)
		.find((line) => line.sourceBreak)?.sourceBreak;
	expect(source?.sources).toMatchObject([
		{ ref: tree.reference(text), offset: 1, codeUnits: 1 },
		{ ref: tree.reference(suffix), offset: 0, codeUnits: 1 },
	]);
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 0, y: 1, width: 6, height: 8 },
		{ x: 6, y: 1, width: 0, height: 8 },
		{ x: 0, y: 11, width: 6, height: 8 },
	]);
	range.setStart(suffix, 1);
	range.collapse(true);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 0,
		y: 11,
		width: 0,
		height: 8,
	});
	range.setStart(text, 2);
	range.collapse(true);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 6,
		y: 1,
		width: 0,
		height: 8,
	});
});

it("reindexes live boundaries after break insertion, replacement and removal", () => {
	const { tree, text, range } = fixture("AB");
	range.setStart(text, 1);
	range.setEnd(text, 2);
	const owner = domRangeOwner(tree);
	owner.replaceText(text, 1, 0, "\n");
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 6, y: 1, width: 0, height: 8 },
		{ x: 0, y: 11, width: 6, height: 8 },
	]);
	owner.replaceText(text, 1, 1, "\r\n");
	expect(range.endOffset).toBe(4);
	expect(rangeClientRects(range)).toHaveLength(2);
	owner.replaceText(text, 1, 2, "");
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 6, y: 1, width: 6, height: 8 },
	]);
});

it.each(["relative", "absolute", "fixed"])(
	"projects break metadata under %s positioning and root scrolling",
	(position) => {
		const { tree, text, range } = fixture(
			"A\nB",
			`#target{position:${position};left:20px;top:30px}`,
			'<main style="height:400px;width:400px"><span id="target">X</span></main>',
		);
		range.setStart(text, 1);
		range.setEnd(text, 2);
		const before = rangeBoundingClientRect(range);
		expect(before).toMatchObject({ x: 26, y: 31, width: 0, height: 8 });
		documentScroll(tree).to(10, 40);
		const after = rangeBoundingClientRect(range);
		expect(after).toMatchObject({
			x: before.x - (position === "fixed" ? 0 : 10),
			y: before.y - (position === "fixed" ? 0 : 40),
		});
		range.collapse(false);
		expect(rangeBoundingClientRect(range)).toMatchObject({
			x: 20 - (position === "fixed" ? 0 : 10),
			y: 41 - (position === "fixed" ? 0 : 40),
			width: 0,
			height: 8,
		});
	},
);

it("carries inline relative offsets without changing positioning helpers", () => {
	const { range } = fixture(
		"\n",
		"#target{position:relative;left:9px;top:7px}",
		'<main><span id="target">X</span></main>',
	);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 9,
		y: 8,
		width: 0,
		height: 8,
	});
	range.collapse(false);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 9,
		y: 18,
		width: 0,
		height: 8,
	});
});

it("maps breaks inside an independently laid out flex item", () => {
	const { tree, text, range } = fixture(
		"A\nB",
		"main{display:flex;width:100px;justify-content:center}#target{width:20px}",
		'<main><div id="target">X</div></main>',
	);
	const glyph = layoutDocument(tree)
		.contexts.flatMap((context) => context.glyphs)
		.find((glyph) => glyph.ref === tree.reference(text) && glyph.offset === 2);
	range.setStart(text, 2);
	range.collapse(true);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: glyph?.x,
		y: glyph?.y,
		width: 0,
		height: 8,
	});
});

it("rejects differently shifted CRLF owners only when that mapping is selected", () => {
	const { tree, target, text, range } = fixture(
		"A\r",
		"",
		'<main><span id="target">X</span></main><div id="other">OK</div>',
	);
	const next = tree.createElement("span", {
		style: "position:relative;left:3px",
	});
	const suffix = tree.createText("\nB");
	tree.append(next, suffix);
	tree.append(tree.get(target).parent as number, next);
	expect(() => rangeClientRects(range)).toThrow(
		"differently positioned inline owners",
	);
	const other = new DocumentQueries(tree).querySelector("#other") as number;
	const otherText = tree.get(other).children[0];
	range.setStart(otherText, 0);
	range.setEnd(otherText, 2);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		width: 12,
		height: 8,
	});
	range.setStart(text, 0);
	range.setEnd(text, 1);
	expect(() => rangeClientRects(range)).toThrow(
		"differently positioned inline owners",
	);
});

it("preserves pixel identity, glyph advances and widths for all normalized break sequences", () => {
	const baseline = fixture("A\n\nB\n");
	const pixels = rasterizeDocument(baseline.tree).image;
	const summary = (tree: DocumentTree) =>
		layoutDocument(tree).contexts.map((context) => ({
			height: context.textHeight,
			lines: context.lines.map((line) => ({
				top: line.top,
				height: line.height,
				baseline: line.baseline,
				width: line.width,
				forced: line.forcedBreak,
			})),
			glyphs: context.glyphs.map((glyph) => ({
				character: glyph.character,
				x: glyph.x,
				y: glyph.y,
				advance: glyph.advance,
			})),
		}));
	for (const separator of ["\r", "\r\n", "\f"]) {
		const variant = fixture(`A${separator}${separator}B${separator}`);
		expect(rasterizeDocument(variant.tree).image).toEqual(pixels);
		expect(summary(variant.tree)).toEqual(summary(baseline.tree));
	}
});

it("does not produce source-break records for ordinary collapsed whitespace or br elements", () => {
	for (const css of [
		"#target{white-space:normal}",
		"#target{white-space:nowrap}",
	]) {
		const { tree } = fixture("A\r\nB", css);
		expect(
			layoutDocument(tree)
				.contexts.flatMap((context) => context.lines)
				.every((line) => !line.sourceBreak),
		).toBe(true);
	}
	const { tree } = fixture(
		"A",
		"",
		'<main><span id="target">X</span><br>B</main>',
	);
	expect(
		layoutDocument(tree)
			.contexts.flatMap((context) => context.lines)
			.every((line) => !line.sourceBreak),
	).toBe(true);
});

it("retains ambiguous soft-wrap, bidi and unmapped collapsed-space rejection", () => {
	const wrapped = fixture("AB CD", "#target{width:18px}");
	wrapped.range.setStart(wrapped.text, 3);
	wrapped.range.collapse(true);
	expect(() => rangeClientRects(wrapped.range)).toThrow("unambiguous");
	const bidi = fixture("א\nB");
	expect(() => rangeClientRects(bidi.range)).toThrow("bidi or shaped");
	const spaces = fixture("A   B", "#target{white-space:normal}");
	spaces.range.setStart(spaces.text, 3);
	spaces.range.collapse(true);
	expect(() => rangeClientRects(spaces.range)).toThrow("unambiguous");
});

it("charges and bounds retained break metadata and range results", () => {
	const { tree, range } = fixture("\n".repeat(100));
	expect(rangeClientRects(range)).toHaveLength(100);
	expect(() => rangeClientRects(range, { maxRectangles: 99 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => rangeClientRects(range, { maxWork: 100 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => layoutDocument(tree, { text: { maxLines: 99 } })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => layoutDocument(tree, { text: { maxTokens: 99 } })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});
