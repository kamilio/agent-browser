import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import {
	type TextContext,
	type TextLayoutOptions,
	layoutDocumentText,
} from "./text-layout.js";

const documents: DocumentTree[] = [];
function fixture(content: string, css = "", width = 60) {
	const tree = parseHtmlDocument(
		`<style>main{width:${width}px}${css}</style><main id="target">${content}</main>`,
		"https://example.com/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target") as number;
	const ref = tree.reference(id);
	const layout = (options?: TextLayoutOptions) =>
		layoutDocumentText(tree, options);
	const context = () =>
		layout().contexts.find((entry) => entry.ref === ref) as TextContext;
	return { tree, id, ref, layout, context };
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function texts(context: TextContext) {
	return context.lines.map((line) =>
		context.glyphs
			.slice(line.glyphStart, line.glyphEnd)
			.map((glyph) => glyph.character)
			.join(""),
	);
}

it("derives horizontal positions and source-mapped lines from actual document widths", () => {
	const { context, tree } = fixture(
		"ab cd",
		"main{margin-left:10px;padding-left:5px}",
		36,
	);
	const result = context();
	expect(texts(result)).toEqual(["ab", "cd"]);
	expect(
		result.lines.map(({ width, height, top, baseline }) => ({
			width,
			height,
			top,
			baseline,
		})),
	).toEqual([
		{ width: 24, height: 20, top: 0, baseline: 16 },
		{ width: 24, height: 20, top: 20, baseline: 36 },
	]);
	expect(
		result.glyphs.map(({ x: positionX, y: positionY, offset }) => [
			positionX,
			positionY,
			offset,
		]),
	).toEqual([
		[15, 2, 0],
		[27, 2, 1],
		[15, 22, 3],
		[27, 22, 4],
	]);
	for (const glyph of result.glyphs)
		expect(
			tree
				.resolve(glyph.ref)
				.data.slice(glyph.offset, glyph.offset + glyph.codeUnits),
		).toBe(glyph.character);
	expect(result.textHeight).toBe(40);
	expect(
		Object.isFrozen(result) &&
			Object.isFrozen(result.glyphs) &&
			Object.isFrozen(result.lines[0]),
	).toBe(true);
});

it("collapses and trims whitespace across inline and text-node boundaries without splitting words", () => {
	const { context } = fixture(
		" \n <span>a</span><span>b \t </span><span> c</span>d \r\n ",
		"",
		36,
	);
	expect(texts(context())).toEqual(["ab", "cd"]);
	expect(texts(fixture("a<span>b</span>cdef", "", 24).context())).toEqual([
		"abcdef",
	]);
	expect(
		texts(fixture("a <span> </span> <span>b</span> c", "", 120).context()),
	).toEqual(["a b c"]);
});

it("includes empty inline struts on occupied lines without publishing phantom glyphs", () => {
	const result = fixture(
		'<span style="font-size:48px"></span>a',
		"",
		100,
	).context();
	expect(texts(result)).toEqual(["a"]);
	expect(result.lines[0]).toMatchObject({ height: 60, baseline: 48 });
	expect(result.glyphs).toHaveLength(1);
	expect(
		fixture('<span style="font-size:48px"></span>').context().lines,
	).toHaveLength(0);
	expect(
		texts(
			fixture('a <span style="font-size:48px"> </span> ', "", 100).context(),
		),
	).toEqual(["a"]);
});

it.each(["", " ", "\t\n ", "<span></span>"])(
	"does not invent a line for empty collapsed content %j",
	(content) => {
		expect(fixture(content).context().lines).toHaveLength(0);
	},
);

it.each([
	["a<br>b", ["a", "b"]],
	["a<br>", ["a"]],
	["<br><br>", ["", ""]],
	[" a <br> b ", ["a", "b"]],
])("handles hard breaks in %s", (content, expected) => {
	const { context } = fixture(content as string);
	expect(texts(context())).toEqual(expected);
	expect(context().lines[0].forcedBreak).toBe(true);
});

it.each([
	["normal", ["aa", "bb", "cc"]],
	["nowrap", ["aa bb cc"]],
	["pre", [" aa  bb", "cc "]],
	["pre-line", ["aa", "bb", "cc"]],
])("handles whitespace mode %s", (mode, expected) => {
	const { context } = fixture(" aa  bb\ncc ", `main{white-space:${mode}}`, 36);
	expect(texts(context())).toEqual(expected);
});

it("preserves pre tabs at eight-advance stops and keeps newline endings finite", () => {
	const result = fixture("a\tb\t\n\n", "main{white-space:pre}").context();
	expect(texts(result)).toEqual(["a\tb\t", ""]);
	expect(result.glyphs.map(({ advance }) => advance)).toEqual([12, 84, 12, 84]);
	expect(result.lines[0].width).toBe(192);
	expect(result.lines[0].overflow).toBe(132);
});

it("normalizes dynamic CRLF even when split across adjacent source nodes", () => {
	const { tree, id, context } = fixture(
		'<span id="first"></span><span id="second"></span>',
		"main{white-space:pre}",
	);
	const children = tree.get(id).children;
	tree.append(children[0], tree.createText("a\r"));
	tree.append(children[1], tree.createText("\nb\rc\fd"));
	expect(texts(context())).toEqual(["a", "b", "c", "d"]);
});

it("does not break or collapse nonbreaking spaces and reports unsupported glyphs", () => {
	const result = fixture("a&nbsp;b 🙂 中", "", 24).layout();
	const context = result.contexts.find(
		(entry) => entry.glyphs.length,
	) as TextContext;
	expect(texts(context)).toEqual(["a\u00a0b", "🙂", "中"]);
	expect(result.metrics.unsupportedGlyphs).toBe(2);
	expect(
		context.glyphs.find(({ character }) => character === "🙂"),
	).toMatchObject({ codeUnits: 2, supported: false, advance: 12 });
});

it.each([
	["left", 0],
	["start", 0],
	["center", 24],
	["right", 48],
	["end", 48],
])("aligns %s using measured advances", (alignment, expected) => {
	const result = fixture("a", `main{text-align:${alignment}}`).context();
	expect(result.glyphs[0].x).toBe(expected);
});

it("preserves signed alignment overflow and zero-width containing blocks", () => {
	const centered = fixture("abcd", "main{text-align:center}", 24).context();
	expect(centered.glyphs[0].x).toBe(-12);
	expect(centered.lines[0].overflow).toBe(24);
	expect(texts(fixture("a b", "", 0).context())).toEqual(["a", "b"]);
});

it("uses mixed font baselines, ancestor extents, block struts and unitless line height", () => {
	const result = fixture(
		'a<span style="font-size:32px;line-height:1"><span style="font-size:8px">b c</span></span>d',
		"main{line-height:1}",
		48,
	).context();
	expect(texts(result)).toEqual(["ab cd"]);
	expect(result.lines[0]).toMatchObject({ height: 32, baseline: 28 });
	expect(result.glyphs[0].y).toBe(14);
	expect(result.glyphs[1]).toMatchObject({ fontSize: 8, y: 21, advance: 6 });
	const larger = fixture(
		'a<span style="font-size:32px">b</span>',
		"main{line-height:2}",
		100,
	).context();
	expect(larger.lines[0].height).toBe(64);
});

it("retains zero and small line heights rather than clamping glyph ink", () => {
	const result = fixture(
		"a<br>b",
		"main{font-size:16px;line-height:0}",
	).context();
	expect(result.textHeight).toBe(0);
	expect(result.lines.map(({ height }) => height)).toEqual([0, 0]);
	expect(result.glyphs[0].y).toBe(-8);
	const zero = fixture("a b", "main{font-size:0}").context();
	expect(zero.lines[0]).toMatchObject({ width: 0, height: 0 });
});

it("retains hidden text geometry while visible descendants override it", () => {
	const result = fixture(
		'a<span style="visibility:visible">b</span>c',
		"main{visibility:hidden}",
	).context();
	expect(result.glyphs.map(({ visible }) => visible)).toEqual([
		false,
		true,
		false,
	]);
	expect(result.lines[0].width).toBe(36);
});

it("keeps anonymous/split-block text contexts distinct and reflows after mutation/resize", () => {
	const { tree, id, layout } = fixture(
		"<span>before<div>inside</div>after</span>",
		"main{width:100%}",
	);
	const before = layout();
	expect(
		before.contexts.filter(({ glyphs }) => glyphs.length).map(texts),
	).toEqual([["before"], ["inside"], ["after"]]);
	tree.setAttribute(id, "style", "font-size:24px");
	documentStyles(tree).setViewport(20, 30);
	expect(
		layout().contexts.find(({ glyphs }) => glyphs.length)?.glyphs[0].advance,
	).toBe(18);
	expect(
		before.contexts.find(({ glyphs }) => glyphs.length)?.glyphs[0].advance,
	).toBe(12);
	tree.close();
	expect(() => layout()).toThrow();
});

it.each([
	"main{filter:blur(1px)}",
	"main{white-space:pre-wrap}",
	"main{font-family:serif}",
	"span{border-left:1px solid red}",
])(
	"refuses unresolved styling instead of inventing line geometry for %s",
	(css) => {
		expect(() => fixture("<span>Text</span>", css).layout()).toThrow();
	},
);

it("enforces token, line, work, numeric and formatting limits", () => {
	const { layout } = fixture("a b c d", "", 12);
	expect(() => layout({ maxTokens: 2 })).toThrow("token limit");
	expect(() => layout({ maxLines: 2 })).toThrow("line limit");
	expect(() => layout({ maxWork: 2 })).toThrow("work limit");
	expect(() => layout({ formatting: { maxBoxes: 2 } })).toThrow("box limit");
	expect(() => layout({ maxTokens: 0 })).toThrow("Invalid text layout limit");
	expect(() => layout({ maxTokens: 250_001 })).toThrow(
		"Invalid text layout limit",
	);
	expect(() => layout({ unexpected: 1 } as TextLayoutOptions)).toThrow();
	expect(() => fixture("a", "main{font-size:513px}").layout()).toThrow(
		"font size limit",
	);
	expect(() =>
		fixture("a<br>b", "main{line-height:16777216px}").layout(),
	).toThrow("length limit");
});

it("matches a separate greedy word oracle across generated source splits and widths", () => {
	for (let sample = 1; sample <= 120; sample++) {
		const capacity = (sample % 13) + 1;
		const words = Array.from({ length: (sample % 9) + 1 }, (_, index) =>
			"abc".repeat(((sample + index) % 5) + 1),
		);
		const expected: string[] = [];
		for (const word of words) {
			const previous = expected.at(-1);
			if (
				previous !== undefined &&
				previous.length + 1 + word.length <= capacity
			)
				expected[expected.length - 1] += ` ${word}`;
			else expected.push(word);
		}
		const markup = words
			.map(
				(word) =>
					`<span>${word.slice(0, 1)}</span><span>${word.slice(1)}</span>`,
			)
			.join(" \n\t ");
		const result = fixture(
			markup,
			"main{font-size:8px}",
			capacity * 6,
		).context();
		expect(texts(result)).toEqual(expected);
		for (const line of result.lines) {
			const glyphs = result.glyphs.slice(line.glyphStart, line.glyphEnd);
			expect(line.width).toBe(glyphs.length * 6);
			expect(line.height).toBe(10);
			for (const glyph of glyphs)
				expect(Number.isFinite(glyph.x) && Number.isFinite(glyph.y)).toBe(true);
		}
	}
});
