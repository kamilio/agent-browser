import { afterEach, expect, it } from "vitest";
import { resolveBlockWidth } from "./block-width.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { FloatLayoutContext } from "./float-layout.js";
import {
	buildFormattingTree,
	type DocumentBlockWidths,
	type FormattingImageSize,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { AtomicInlineMetrics } from "./inline-atomic.js";
import { DocumentQueries } from "./selectors.js";
import {
	layoutFormattingText,
	measureFormattingText,
	type TextContext,
	type TextFloatAnchor,
	type TextFloatInterval,
	type TextFloatLayout,
	type TextLayoutOptions,
} from "./text-layout.js";

const documents: DocumentTree[] = [];
const floats: FloatLayoutContext[] = [];

afterEach(() => {
	for (const context of floats.splice(0)) context.close();
	for (const document of documents.splice(0)) document.close();
});

function fixture(content: string, css = "", width = 60, contentX = 0) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px;line-height:10px}main{width:${width}px}.left{float:left}.right{float:right}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/float-text",
	);
	documents.push(document);
	const queries = new DocumentQueries(document);
	const formatting = buildFormattingTree(document);
	const node = (selector: string) => {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error(selector);
		const result = formatting.nodes.find(
			(entry) => entry.ref === document.reference(id),
		);
		if (!result) throw new Error(selector);
		return result;
	};
	const host = node("#host");
	if (!host.box) throw new Error("Missing host box");
	const input: DocumentBlockWidths = {
		stage: "isolated-block-horizontal-reflow",
		partial: true,
		formatting,
		widths: [
			{
				...resolveBlockWidth(host.box, 120),
				id: host.id,
				ref: host.ref,
				containingBlock: formatting.root,
				containingHeight: null,
				borderX: contentX,
				contentX,
			},
		],
		images: [],
		metrics: { work: 0 },
	};
	const layout = (floatLayout?: TextFloatLayout, options?: TextLayoutOptions) =>
		layoutFormattingText({ ...input, floatLayout }, options);
	const context = (floatLayout?: TextFloatLayout) =>
		layout(floatLayout).contexts[0];
	return { document, formatting, host, node, input, layout, context, width };
}

function coordinator(
	test: ReturnType<typeof fixture>,
	sizes: Record<string, { width: number; height: number; top?: number }>,
) {
	const context = new FloatLayoutContext();
	floats.push(context);
	const calls: {
		contextId: number;
		floatId: number;
		anchor: Readonly<TextFloatAnchor>;
	}[] = [];
	const intervals: {
		top: number;
		bottom: number;
		interval: Readonly<TextFloatInterval>;
	}[] = [];
	const dimensions = new Map(
		Object.entries(sizes).map(([selector, size]) => [
			test.node(selector).id,
			size,
		]),
	);
	const adapter: TextFloatLayout = {
		place(contextId, floatId, anchor) {
			calls.push({ contextId, floatId, anchor });
			const size = dimensions.get(floatId);
			if (!size) throw new Error(`Unexpected float ${floatId}`);
			const side = test.formatting.nodes[floatId].floatSide;
			if (side !== "left" && side !== "right")
				throw new AgentBrowserError("unsupported", "Unsupported float side");
			const interval = context.lineInterval({
				left: 0,
				right: test.width,
				top: anchor.top,
				bottom: anchor.top + anchor.height,
			});
			const fits =
				!anchor.hasContent ||
				size.width + anchor.occupiedWidth <= interval.width;
			context.place({
				id: floatId,
				side,
				containingBlock: { left: 0, right: test.width, top: 0 },
				minimumTop: Math.max(
					size.top ?? 0,
					anchor.top + (fits ? 0 : anchor.height),
				),
				width: size.width,
				height: size.height,
			});
		},
		interval(contextId, top, bottom) {
			expect(contextId).toBe(test.host.id);
			const interval = context.lineInterval({
				left: 0,
				right: test.width,
				top,
				bottom,
			});
			intervals.push({ top, bottom, interval });
			return interval;
		},
	};
	return { adapter, context, calls, intervals };
}

function texts(context: TextContext) {
	return context.lines.map((line) =>
		context.glyphs
			.slice(line.glyphStart, line.glyphEnd)
			.map((glyph) => glyph.character)
			.join(""),
	);
}

it("uses both float sides without narrowing the block or leaking float interiors", () => {
	const test = fixture(
		'<i id="left" class="left">hidden</i><i id="right" class="right">hidden</i><span id="text">ab cd ef gh</span>',
		"",
		60,
		11,
	);
	const floating = coordinator(test, {
		"#left": { width: 12, height: 20 },
		"#right": { width: 18, height: 10 },
	});
	const result = test.context(floating.adapter);
	expect(texts(result)).toEqual(["ab cd", "ef gh"]);
	expect(result.contentWidth).toBe(60);
	expect(result.contentX).toBe(11);
	expect(
		result.lines.map(({ top, width, height, overflow }) => ({
			top,
			width,
			height,
			overflow,
		})),
	).toEqual([
		{ top: 0, width: 30, height: 10, overflow: 0 },
		{ top: 10, width: 30, height: 10, overflow: 0 },
	]);
	expect(
		result.glyphs
			.filter((glyph) => glyph.offset === 0 || glyph.offset === 6)
			.map((glyph) => glyph.x),
	).toEqual([23, 23]);
	expect(
		result.fragments
			.filter((fragment) => fragment.formattingId === test.node("#text").id)
			.map(({ x, width }) => ({ x, width })),
	).toEqual([
		{ x: 23, width: 30 },
		{ x: 23, width: 30 },
	]);
	expect(floating.calls.map(({ floatId }) => floatId)).toEqual([
		test.node("#left").id,
		test.node("#right").id,
	]);
	expect(
		result.fragments.some(
			(fragment) => fragment.formattingId === test.node("#left").id,
		),
	).toBe(false);
	expect(
		Object.isFrozen(result) &&
			Object.isFrozen(result.lines) &&
			Object.isFrozen(result.glyphs[0]),
	).toBe(true);
});

it("places nested inline anchors once in source order without splitting the pending word", () => {
	const test = fixture(
		'a<span id="outer">b<i id="first" class="left">interior<i id="nested" class="left">nested</i></i>c<span>d<i id="second" class="right"></i>e</span></span>f',
		"",
		60,
	);
	const floating = coordinator(test, {
		"#first": { width: 6, height: 20 },
		"#second": { width: 6, height: 20 },
	});
	const result = test.context(floating.adapter);
	expect(texts(result)).toEqual(["abcdef"]);
	expect(result.glyphs.map((glyph) => glyph.x)).toEqual([
		6, 12, 18, 24, 30, 36,
	]);
	expect(
		floating.calls.map(({ floatId, anchor }) => [
			floatId,
			anchor.occupiedWidth,
			anchor.hasContent,
			anchor.top,
			anchor.height,
		]),
	).toEqual([
		[test.node("#first").id, 12, true, 0, 10],
		[test.node("#second").id, 24, true, 0, 10],
	]);
	expect(floating.calls.every(({ anchor }) => Object.isFrozen(anchor))).toBe(
		true,
	);
	expect(floating.context.placements()).toHaveLength(2);
});

it("retains a whole word across an anchor when a real earlier word boundary wraps", () => {
	const test = fixture('aa b<i id="float" class="left"></i>bbb', "", 30);
	const floating = coordinator(test, { "#float": { width: 6, height: 20 } });
	const result = test.context(floating.adapter);
	expect(texts(result)).toEqual(["aa", "bbbb"]);
	expect(result.lines.map((line) => line.top)).toEqual([0, 10]);
	expect(floating.calls).toHaveLength(1);
	expect(floating.calls[0].anchor.occupiedWidth).toBe(24);
});

it("reports occupied content so a nonfitting source float can be placed below it", () => {
	const test = fixture('abcd<i id="float" class="left"></i> efgh ij', "", 60);
	const floating = coordinator(test, { "#float": { width: 42, height: 20 } });
	const result = test.context(floating.adapter);
	expect(texts(result)).toEqual(["abcd efgh", "ij"]);
	expect(result.lines.map((line) => line.top)).toEqual([0, 10]);
	expect(result.glyphs.at(-2)?.x).toBe(42);
	expect(floating.context.placements()[0].top).toBe(10);
	expect(floating.calls[0].anchor).toEqual({
		top: 0,
		height: 10,
		occupiedWidth: 24,
		hasContent: true,
	});
});

it("moves an obstructed first word downward without creating empty lines or replaying anchors", () => {
	const test = fixture(
		'<i id="left" class="left"></i><i id="right" class="right"></i>abc',
		"",
		60,
	);
	const floating = coordinator(test, {
		"#left": { width: 30, height: 15 },
		"#right": { width: 30, height: 30 },
	});
	const result = test.context(floating.adapter);
	expect(texts(result)).toEqual(["abc"]);
	expect(result.lines[0]).toMatchObject({ index: 0, top: 15, height: 10 });
	expect(result.textHeight).toBe(25);
	expect(result.glyphs[0].x).toBe(0);
	expect(floating.calls).toHaveLength(2);
});

it("does not advance normal text height for a context containing only floats", () => {
	const test = fixture(
		'<i id="first" class="left"></i><i id="second" class="left"></i><span></span>',
	);
	const floating = coordinator(test, {
		"#first": { width: 60, height: 20 },
		"#second": { width: 60, height: 20 },
	});
	const result = test.context(floating.adapter);
	expect(result.lines).toEqual([]);
	expect(result.textHeight).toBe(0);
	expect(floating.calls.map(({ anchor }) => anchor.top)).toEqual([0, 0]);
	expect(floating.context.placements().map(({ top }) => top)).toEqual([0, 20]);
});

it("treats crossed exclusions at different heights as an empty interval", () => {
	const test = fixture(
		'<i id="left" class="left"></i><i id="right" class="right"></i><span>a</span>',
		"span{font-size:16px;line-height:20px}",
	);
	const floating = coordinator(test, {
		"#left": { width: 40, height: 10 },
		"#right": { width: 40, height: 10 },
	});
	const result = test.context(floating.adapter);
	expect(result.lines).toHaveLength(1);
	expect(result.lines[0]).toMatchObject({ top: 10, height: 20, width: 12 });
	expect(result.glyphs[0].x).toBe(0);
	expect(
		floating.intervals.some(({ interval }) => interval.left > interval.right),
	).toBe(true);
});

it("lets an oversized word overflow only after the obstruction ends", () => {
	const test = fixture('<i id="float" class="left"></i>abcdefghij', "", 24);
	const floating = coordinator(test, { "#float": { width: 12, height: 17 } });
	const result = test.context(floating.adapter);
	expect(texts(result)).toEqual(["abcdefghij"]);
	expect(result.lines[0]).toMatchObject({ top: 17, width: 60, overflow: 36 });
	expect(result.glyphs[0].x).toBe(0);
});

it("queries the actual tall candidate line and leaves the preceding short line in place", () => {
	const test = fixture(
		'<i id="float" class="left"></i>aa <span id="tall">bb</span>',
		"#tall{font-size:16px;line-height:20px}",
		48,
	);
	const floating = coordinator(test, {
		"#float": { width: 30, height: 20, top: 10 },
	});
	const result = test.context(floating.adapter);
	expect(texts(result)).toEqual(["aa", "bb"]);
	expect(
		result.lines.map(({ top, height, width }) => ({ top, height, width })),
	).toEqual([
		{ top: 0, height: 10, width: 12 },
		{ top: 30, height: 20, width: 24 },
	]);
	expect(
		floating.intervals.some(({ top, bottom }) => top === 0 && bottom === 20),
	).toBe(true);
	expect(
		result.fragments.find(
			(fragment) => fragment.formattingId === test.node("#tall").id,
		),
	).toMatchObject({ x: 0, y: 32, width: 24, height: 16 });
});

it.each(["left", "center", "right", "end"])(
	"aligns %s within the interval including fragment and source-break geometry",
	(alignment) => {
		const test = fixture(
			'<i id="float" class="left"></i><span id="text">a\nb</span>',
			`main{white-space:pre-wrap;text-align:${alignment}}`,
			60,
			7,
		);
		const floating = coordinator(test, { "#float": { width: 12, height: 10 } });
		const result = test.context(floating.adapter);
		const first = alignment === "center" ? 33 : alignment === "left" ? 12 : 54;
		const next = alignment === "center" ? 27 : alignment === "left" ? 0 : 54;
		expect(texts(result)).toEqual(["a", "b"]);
		expect(result.glyphs.map((glyph) => glyph.x)).toEqual([
			7 + first,
			7 + next,
		]);
		expect(result.fragments.map((fragment) => fragment.x)).toEqual([
			7 + first,
			7 + next,
		]);
		expect(result.lines[0].sourceBreak).toMatchObject({
			inlineOffset: first + 6,
			followingLine: { inlineOffset: next, baselineOffset: 10 },
		});
	},
);

it("uses the forced-break font extent before querying float adjacency", () => {
	const test = fixture(
		'<i id="float" class="left"></i>a<br id="break">b',
		"#break{font-size:16px;line-height:20px}",
		60,
	);
	const floating = coordinator(test, {
		"#float": { width: 12, height: 20, top: 10 },
	});
	const result = test.context(floating.adapter);
	expect(result.lines[0]).toMatchObject({
		top: 0,
		height: 20,
		forcedBreak: true,
	});
	expect(result.glyphs[0].x).toBe(12);
	expect(
		floating.intervals.some(({ top, bottom }) => top === 0 && bottom === 20),
	).toBe(true);
});

it("preserves tab stops, hanging whitespace and collapsed leading spaces beside floats", () => {
	const preserved = fixture(
		'<i id="float" class="left"></i>a\tb   ',
		"main{white-space:pre-wrap}",
		72,
	);
	const floating = coordinator(preserved, {
		"#float": { width: 12, height: 20 },
	});
	const result = preserved.context(floating.adapter);
	expect(
		result.glyphs.slice(0, 3).map(({ x, advance }) => ({ x, advance })),
	).toEqual([
		{ x: 12, advance: 6 },
		{ x: 18, advance: 30 },
		{ x: 48, advance: 6 },
	]);
	expect(result.lines[0]).toMatchObject({ width: 60, overflow: 0 });
	const collapsed = fixture('  <i id="float" class="left"></i>  a  ', "", 60);
	const collapseFloat = coordinator(collapsed, {
		"#float": { width: 12, height: 20 },
	});
	expect(texts(collapsed.context(collapseFloat.adapter))).toEqual(["a"]);
	expect(collapseFloat.calls[0].anchor).toMatchObject({
		occupiedWidth: 0,
		hasContent: false,
	});
});

it("applies grapheme-safe emergency breaks after exhausting float obstruction", () => {
	const test = fixture(
		'<i id="float" class="left"></i>a\u0301bcde',
		"main{overflow-wrap:anywhere}",
		24,
	);
	const floating = coordinator(test, { "#float": { width: 12, height: 10 } });
	const result = test.context(floating.adapter);
	expect(texts(result)).toEqual(["a\u0301bc", "de"]);
	expect(result.lines.map((line) => line.top)).toEqual([10, 20]);
	expect(floating.calls).toHaveLength(1);
});

it("fails explicitly instead of guessing placement inside an already emergency-wrapped pending word", () => {
	const test = fixture(
		'abcdef<i id="float" class="left"></i>',
		"main{overflow-wrap:anywhere}",
		24,
	);
	const floating = coordinator(test, { "#float": { width: 6, height: 10 } });
	expect(() => test.context(floating.adapter)).toThrow(
		/Float anchor inside an emergency-wrapped word/,
	);
	expect(floating.calls).toHaveLength(0);
});

it("uses atomic margin-box and baseline extents for candidate float intervals", () => {
	const test = fixture(
		'<i id="float" class="left"></i><span id="atomic">interior</span>x',
		"#atomic{display:inline-block}",
		60,
	);
	const atomic: AtomicInlineMetrics = {
		id: test.node("#atomic").id,
		borderBoxWidth: 18,
		marginLeft: 2,
		marginRight: 3,
		block: { borderBoxHeight: 24, marginTop: 2, marginBottom: 3, baseline: 18 },
	};
	test.input.atomics = [atomic];
	const floating = coordinator(test, {
		"#float": { width: 12, height: 30, top: 10 },
	});
	const result = test.context(floating.adapter);
	expect(result.lines[0]).toMatchObject({ top: 0, height: 29, width: 29 });
	expect(result.fragments.find((fragment) => fragment.atomic)).toMatchObject({
		x: 14,
		y: 2,
		width: 18,
		height: 24,
	});
	expect(result.glyphs.map((glyph) => glyph.x)).toEqual([35]);
	expect(
		floating.intervals.some(({ top, bottom }) => top === 0 && bottom === 29),
	).toBe(true);
});

it("uses replaced SVG extents without traversing the replaced subtree", () => {
	const test = fixture(
		'<i id="float" class="left"></i><svg id="image" width="18" height="24"></svg>x',
		"",
		60,
	);
	const image: FormattingImageSize = {
		id: test.node("#image").id,
		ref: test.node("#image").ref as string,
		containingHeight: null,
		containingWidth: 60,
		contentWidth: 18,
		contentHeight: 24,
		borderBoxWidth: 18,
		borderBoxHeight: 24,
		paddingLeft: 0,
		paddingRight: 0,
		paddingTop: 0,
		paddingBottom: 0,
		borderLeft: 0,
		borderRight: 0,
		borderTop: 0,
		borderBottom: 0,
		marginLeft: 2,
		marginRight: 3,
		marginTop: 2,
		marginBottom: 3,
	};
	test.input.images = [image];
	const floating = coordinator(test, {
		"#float": { width: 12, height: 30, top: 10 },
	});
	const result = test.context(floating.adapter);
	expect(result.lines[0]).toMatchObject({ top: 0, height: 31, width: 29 });
	expect(
		result.fragments.find((fragment) => fragment.formattingId === image.id),
	).toMatchObject({ x: 14, y: 2, width: 18, height: 24 });
	expect(
		floating.intervals.some(({ top, bottom }) => top === 0 && bottom === 31),
	).toBe(true);
});

it("rejects float anchors without a coordinator and refuses intrinsic omission even with one", () => {
	const test = fixture('<i id="float" class="left">unmeasured</i>a');
	expect(() => test.context()).toThrow(/require a float coordinator/);
	const floating = coordinator(test, { "#float": { width: 12, height: 20 } });
	for (const constraint of ["min-content", "max-content"] as const)
		expect(() =>
			measureFormattingText(
				{ ...test.input, floatLayout: floating.adapter },
				constraint,
			),
		).toThrow(/requires measured floating children/);
	expect(floating.calls).toHaveLength(0);
});

it("preserves explicit parent rejection of unsupported logical float placement", () => {
	const test = fixture('<i id="float" style="float:inline-start"></i>a');
	const floating = coordinator(test, { "#float": { width: 12, height: 20 } });
	expect(() => test.context(floating.adapter)).toThrow(
		/Unsupported float side/,
	);
	expect(floating.calls).toHaveLength(1);
});

it.each(
	[null, false, [], {}, { place() {} }, { interval() {} }].map((value) => [
		value,
	]),
)("rejects invalid coordinator %j", (floatLayout) => {
	const test = fixture("a");
	expect(() => test.context(floatLayout as unknown as TextFloatLayout)).toThrow(
		/Invalid text float coordinator/,
	);
});

it.each(
	[
		null,
		[],
		{ left: -1, right: 60, nextBottom: null },
		{ left: 0, right: 61, nextBottom: null },
		{ left: 61, right: 60, nextBottom: null },
		{ left: "0", right: 60, nextBottom: null },
		{ left: Number.NaN, right: 60, nextBottom: null },
		{ left: 0, right: Number.POSITIVE_INFINITY, nextBottom: null },
		{ left: 0, right: 60 },
		{ left: 0, right: 60, nextBottom: 0 },
		{ left: 0, right: 60, nextBottom: -1 },
		{ left: 0, right: 60, nextBottom: Number.NaN },
	].map((value) => [value]),
)("rejects invalid interval geometry %j without coercion", (interval) => {
	const test = fixture("a");
	expect(() =>
		test.context({
			place() {},
			interval: () => interval as unknown as TextFloatInterval,
		}),
	).toThrow(AgentBrowserError);
});

it("fails explicitly for obstruction without a usable advancing bottom", () => {
	const test = fixture("a");
	expect(() =>
		test.context({
			place() {},
			interval: () => ({ left: 60, right: 60, nextBottom: null }),
		}),
	).toThrow(/cannot advance/);
});

it("propagates callback errors without replay or fallback", () => {
	const test = fixture('<i class="left"></i>a');
	const failure = new AgentBrowserError(
		"resource-limit",
		"Coordinator budget exhausted",
	);
	let calls = 0;
	expect(() =>
		test.context({
			place() {
				calls++;
				throw failure;
			},
			interval: () => ({ left: 0, right: 60, nextBottom: null }),
		}),
	).toThrow(failure);
	expect(calls).toBe(1);
	expect(() =>
		fixture("a").context({
			place() {},
			interval() {
				throw failure;
			},
		}),
	).toThrow(failure);
});

it("charges every downward retry to the existing nonresetting work budget", () => {
	const test = fixture("a");
	let calls = 0;
	expect(() =>
		test.layout(
			{
				place() {},
				interval(_contextId, top) {
					calls++;
					return { left: 60, right: 0, nextBottom: top + 1 };
				},
			},
			{ maxWork: 100 },
		),
	).toThrow(/Text layout work limit/);
	expect(calls).toBeGreaterThan(1);
	expect(calls).toBeLessThanOrEqual(100);
});

it("preserves token, line and fragment caps while counting float anchors", () => {
	const anchors = fixture(
		'<i id="first" class="left"></i><i id="second" class="left"></i>a',
	);
	const floating = coordinator(anchors, {
		"#first": { width: 1, height: 10 },
		"#second": { width: 1, height: 10 },
	});
	expect(() => anchors.layout(floating.adapter, { maxTokens: 1 })).toThrow(
		/token limit/,
	);
	expect(floating.calls).toHaveLength(1);
	const lines = fixture('<i id="float" class="left"></i>a b c', "", 6);
	expect(() =>
		lines.layout(
			coordinator(lines, { "#float": { width: 6, height: 10 } }).adapter,
			{ maxLines: 1 },
		),
	).toThrow(/line limit/);
	const fragments = fixture(
		'<i id="float" class="left"></i><span>a<span>b</span></span>',
	);
	expect(() =>
		fragments.layout(
			coordinator(fragments, { "#float": { width: 6, height: 10 } }).adapter,
			{ maxFragments: 1 },
		),
	).toThrow(/fragment limit/);
});

it.each([
	["a b c d", ""],
	[" a <span> b </span> c ", ""],
	["a\tb  \nc", "main{white-space:pre-wrap}"],
	["a\r\nb\nc", "main{white-space:pre}"],
	["a<br><br>b", "main{text-align:right}"],
	["a<span style='font-size:16px'>b</span> c", "main{text-align:center}"],
	["abcdefghijk", "main{overflow-wrap:anywhere}"],
])(
	"keeps unobstructed native line geometry unchanged for %s",
	(content, css) => {
		const test = fixture(content, css, 30);
		const expected = test.context();
		const actual = test.context({
			place() {
				throw new Error("Unexpected float");
			},
			interval: () => ({ left: 0, right: 30, nextBottom: null }),
		});
		expect(actual).toEqual(expected);
	},
);
