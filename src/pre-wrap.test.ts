import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import {
	type TextContext,
	type TextLayoutOptions,
	layoutDocumentText,
} from "./text-layout.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content: string, width = 30, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>main{font-size:8px;white-space:pre-wrap;width:${width}px}${css}</style><main id="target">${content}</main>`,
		"https://fixture.invalid/pre-wrap",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(180, 200);
	const query = new DocumentQueries(tree);
	const id = query.querySelector("#target") as number;
	const ref = tree.reference(id);
	const layout = (options?: TextLayoutOptions) =>
		layoutDocumentText(tree, options);
	const context = () =>
		layout().contexts.find((entry) => entry.ref === ref) as TextContext;
	const measure = () =>
		measureIntrinsicWidths(tree).widths.find((entry) => entry.ref === ref);
	return { tree, id, ref, query, layout, context, measure };
}

function texts(context: TextContext) {
	return context.lines.map((line) =>
		context.glyphs
			.slice(line.glyphStart, line.glyphEnd)
			.map((glyph) => glyph.character)
			.join(""),
	);
}

it.each([
	["aa  bb", 24, ["aa  ", "bb"], [12, 12]],
	[" aa  bb\ncc ", 18, [" aa  ", "bb", "cc "], [18, 12, 18]],
	["   a", 12, ["   ", "a"], [0, 6]],
	["    ", 12, ["    "], [12]],
	["    \n", 12, ["    "], [12]],
	[" \n\n ", 12, [" ", "", " "], [6, 0, 6]],
	["a   b", 18, ["a   ", "b"], [6, 6]],
	["a   ", 18, ["a   "], [18]],
	["a   \nb", 18, ["a   ", "b"], [18, 6]],
	["aaaa ", 18, ["aaaa "], [24]],
	["a b ", 0, ["a ", "b "], [6, 6]],
	["", 30, [], []],
])(
	"preserves complete runs in %j at width %s",
	(content, width, expected, widths) => {
		const result = fixture(content, width).context();
		expect(texts(result)).toEqual(expected);
		expect(result.lines.map((line) => line.width)).toEqual(widths);
		expect(result.lines.map((line) => line.overflow)).toEqual(
			widths.map((used) => Math.max(0, used - width)),
		);
	},
);

it("distinguishes soft, forced and final lines without inventing a forced-break flag", () => {
	const result = fixture("a  b  \nc  ", 18).context();
	expect(texts(result)).toEqual(["a  ", "b  ", "c  "]);
	expect(result.lines.map((line) => [line.width, line.forcedBreak])).toEqual([
		[6, false],
		[18, true],
		[18, false],
	]);
});

it.each(["left", "start", "center", "right", "end"])(
	"aligns %s with unconditional versus partial conditional hanging",
	(alignment) => {
		const factor =
			alignment === "center"
				? 0.5
				: alignment === "right" || alignment === "end"
					? 1
					: 0;
		const soft = fixture(
			"a   b",
			18,
			`main{text-align:${alignment}}`,
		).context();
		expect(soft.glyphs[0].x).toBe(12 * factor);
		expect(soft.glyphs[3].x).toBe(18 + 12 * factor);
		expect(soft.lines[0]).toMatchObject({ width: 6, overflow: 0 });
		const final = fixture(
			"a   ",
			18,
			`main{text-align:${alignment}}`,
		).context();
		expect(final.glyphs[0].x).toBe(0);
		expect(final.lines[0]).toMatchObject({
			width: 18,
			overflow: 0,
			forcedBreak: false,
		});
		const fitting = fixture(
			" a ",
			30,
			`main{text-align:${alignment}}`,
		).context();
		expect(fitting.glyphs[0].x).toBe(12 * factor);
		const overflowing = fixture(
			"aaaa  ",
			18,
			`main{text-align:${alignment}}`,
		).context();
		expect(overflowing.glyphs[0].x).toBe(factor ? -6 * factor : 0);
		expect(overflowing.lines[0]).toMatchObject({ width: 24, overflow: 6 });
	},
);

it("keeps whitespace in its source inline boxes across opening and closing boundaries", () => {
	const { context, tree, query } = fixture(
		'<span id="first">a </span><span id="second"> \t </span>b',
		54,
	);
	const result = context();
	expect(texts(result)).toEqual(["a  \t ", "b"]);
	expect(result.glyphs.map((glyph) => [glyph.x, glyph.advance])).toEqual([
		[0, 6],
		[6, 6],
		[12, 6],
		[18, 30],
		[48, 6],
		[0, 6],
	]);
	expect(result.lines[0]).toMatchObject({ width: 6, overflow: 0 });
	for (const [selector, x, width] of [
		["#first", 0, 12],
		["#second", 12, 42],
	] as const) {
		const ref = tree.reference(query.querySelector(selector) as number);
		expect(
			result.fragments.find((fragment) => fragment.ref === ref),
		).toMatchObject({ x, width, line: 0 });
	}
	for (const glyph of result.glyphs)
		expect(
			tree
				.resolve(glyph.ref)
				.data.slice(glyph.offset, glyph.offset + glyph.codeUnits),
		).toBe(glyph.character);
});

it("does not split a whitespace run across adjacent text nodes or display-contents descendants", () => {
	const { tree, id, context } = fixture(
		'<span style="display:contents"> </span>',
		12,
	);
	tree.insert(id, tree.createText("a "), tree.get(id).children[0]);
	tree.append(id, tree.createText(" "));
	tree.append(id, tree.createText("b"));
	expect(texts(context())).toEqual(["a   ", "b"]);
});

it("keeps opening edges with the following word when there is no following whitespace", () => {
	const result = fixture(
		'a <span style="padding-left:5px">b</span>',
		12,
	).context();
	expect(texts(result)).toEqual(["a ", "b"]);
	expect(result.lines.map((line) => line.width)).toEqual([6, 11]);
	expect(result.glyphs.at(-1)?.x).toBe(5);
});

it.each(["padding-right:3px", "border-right:3px solid red"])(
	"prevents hanging across nonzero %s",
	(edge) => {
		const result = fixture(`<span style="${edge}">a  </span>b`, 18).context();
		expect(texts(result)).toEqual(["a  ", "b"]);
		expect(result.lines[0]).toMatchObject({ width: 21, overflow: 3 });
		expect(result.fragments[0].width).toBe(21);
		expect(
			fixture(`<span style="${edge}">a  </span>`, 18).measure(),
		).toMatchObject({ minContent: 21, maxContent: 21 });
	},
);

it("allows only the suffix after an intervening inline border to hang", () => {
	const result = fixture(
		'<span style="padding-right:3px">a </span>  b',
		18,
	).context();
	expect(texts(result)).toEqual(["a   ", "b"]);
	expect(result.lines[0]).toMatchObject({ width: 15, overflow: 0 });
	expect(result.glyphs.map((glyph) => glyph.x)).toEqual([0, 6, 15, 21, 0]);
});

it("advances tabs at their actual cursor before closing edges and recomputes after wrapping", () => {
	const result = fixture(
		'a <span style="padding-right:3px">b\t</span>c',
		60,
	).context();
	expect(texts(result)).toEqual(["a b\tc"]);
	expect(result.glyphs.map((glyph) => [glyph.x, glyph.advance])).toEqual([
		[0, 6],
		[6, 6],
		[12, 6],
		[18, 30],
		[51, 6],
	]);
	const wrapped = fixture(
		'aaaaaaa <span style="padding-right:3px">b\t</span>c',
		54,
	).context();
	expect(texts(wrapped)).toEqual(["aaaaaaa ", "b\t", "c"]);
	expect(wrapped.glyphs.find((glyph) => glyph.kind === "tab")).toMatchObject({
		x: 6,
		advance: 42,
	});
	expect(wrapped.lines.map((line) => line.width)).toEqual([42, 51, 6]);
});

it("uses the subsequent tab stop when the next is less than half a character away", () => {
	const result = fixture(
		'<span style="padding-left:46px">\tx</span>',
		120,
	).context();
	expect(result.glyphs[0]).toMatchObject({ x: 46, advance: 50 });
	expect(result.glyphs[1].x).toBe(96);
	const exact = fixture(
		'<span style="padding-left:45px">\tx</span>',
		120,
	).context();
	expect(exact.glyphs[0].advance).toBe(3);
});

it("normalizes dynamic CRLF, lone CR and form feed across inline nodes without changing source offsets", () => {
	const { tree, id, context } = fixture("<span></span><span></span>", 30);
	const [first, second] = tree.get(id).children;
	tree.append(first, tree.createText("a  \r"));
	tree.append(second, tree.createText("\nb\r\nc\rd\f \t🙂"));
	const result = context();
	expect(texts(result)).toEqual(["a  ", "b", "c", "d", " \t", "🙂"]);
	expect(result.lines.map((line) => line.forcedBreak)).toEqual([
		true,
		true,
		true,
		true,
		false,
		false,
	]);
	for (const glyph of result.glyphs)
		expect(
			tree
				.resolve(glyph.ref)
				.data.slice(glyph.offset, glyph.offset + glyph.codeUnits),
		).toBe(glyph.character);
	expect(result.glyphs.at(-1)).toMatchObject({ offset: 10, codeUnits: 2 });
});

it.each([
	["aa  bb", 12, 36],
	["aa\tbb\ncc", 12, 60],
	["aa  ", 12, 24],
	["aa  \n", 12, 24],
	["    ", 0, 24],
	[" \t ", 0, 54],
	["   aa", 12, 30],
	["<span>a </span><span>  b </span>", 6, 36],
])(
	"measures distinct min/max intrinsic widths for %j",
	(content, minContent, maxContent) => {
		expect(fixture(content, 1).measure()).toMatchObject({
			minContent,
			maxContent,
		});
	},
);

it.each(["inline-block", "inline-flex"])(
	"wraps around %s atomics without discarding neighboring spaces",
	(display) => {
		const { tree, ref } = fixture(
			`a  <span style="display:${display};width:12px;height:8px"></span>  b`,
			18,
		);
		const result = layoutDocument(tree).text.contexts.find(
			(entry) => entry.ref === ref,
		) as TextContext;
		expect(texts(result)).toEqual(["a  ", "  ", "b"]);
		expect(result.lines.map((line) => line.width)).toEqual([6, 12, 6]);
		expect(result.fragments.find((fragment) => fragment.atomic)).toMatchObject({
			x: 0,
			line: 1,
			width: 12,
		});
	},
);

it("wraps around replaced elements with their inherited whitespace mode", async () => {
	const { tree, context, measure } = fixture(
		'a  <img src="/native.png" width="12" height="8">  b',
		18,
	);
	const body = encodePng(createRaster(12, 8, [255, 0, 0, 255]));
	await documentImages(tree, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		}),
	}).settle();
	const result = context();
	expect(texts(result)).toEqual(["a  ", "  ", "b"]);
	expect(result.lines.map((line) => line.width)).toEqual([6, 12, 6]);
	expect(measure()).toMatchObject({ minContent: 12, maxContent: 48 });
});

it("respects nonbreaking spaces and local pre/nowrap overrides", () => {
	expect(texts(fixture("a&nbsp;b c", 12).context())).toEqual([
		"a\u00a0b ",
		"c",
	]);
	for (const mode of ["pre", "nowrap"]) {
		const result = fixture(
			`<span style="white-space:${mode}">a b</span> c`,
			12,
		).context();
		expect(texts(result)).toEqual(["a b ", "c"]);
		expect(result.lines[0]).toMatchObject({ width: 18, overflow: 6 });
	}
});

it("trims only boundary-collapsed spaces in mixed preserved and collapsed runs", () => {
	const trailing = fixture(
		'<span style="white-space:normal">a </span><span> </span>',
		30,
	).context();
	expect(texts(trailing)).toEqual(["a  "]);
	expect(trailing.lines[0].width).toBe(18);
	const leading = fixture(
		'<span style="white-space:normal"> </span> <span style="white-space:normal"> </span>b',
		30,
	).context();
	expect(texts(leading)).toEqual(["  b"]);
	expect(leading.lines[0].width).toBe(18);
	const final = fixture(
		'<span> </span><span style="white-space:normal"> </span>',
		30,
	).context();
	expect(texts(final)).toEqual([" "]);
	expect(final.lines[0].width).toBe(6);
});

it("keeps immutable glyphs and fragments across resize and source mutation", () => {
	const { tree, id, context } = fixture("<span>a  b </span>", 18);
	const before = context();
	expect(texts(before)).toEqual(["a  ", "b "]);
	for (const item of [
		before,
		before.lines,
		before.glyphs,
		before.fragments,
		...before.lines,
		...before.glyphs,
		...before.fragments,
	])
		expect(Object.isFrozen(item)).toBe(true);
	tree.setAttribute(id, "style", "width:60px");
	expect(texts(context())).toEqual(["a  b "]);
	tree.setTextContent(id, "changed");
	expect(texts(context())).toEqual(["changed"]);
	expect(texts(before)).toEqual(["a  ", "b "]);
	expect(before.fragments[0].width).toBe(18);
});

it("bounds every preserved token, line, fragment and unit of layout work", () => {
	expect(() => fixture(" ".repeat(100)).layout({ maxTokens: 50 })).toThrow(
		"token limit",
	);
	expect(() => fixture("a ".repeat(10), 6).layout({ maxLines: 3 })).toThrow(
		"line limit",
	);
	expect(() =>
		fixture("<span>a a a</span>", 6).layout({ maxFragments: 2 }),
	).toThrow("fragment limit");
	expect(() => fixture("\t".repeat(100)).layout({ maxWork: 50 })).toThrow(
		"work limit",
	);
	const shorter = fixture(" ".repeat(2000)).layout();
	const longer = fixture(" ".repeat(4000)).layout();
	expect(longer.metrics.tokens - shorter.metrics.tokens).toBe(2000);
	expect(longer.metrics.work).toBeLessThan(shorter.metrics.work * 2.1);
	expect(longer.metrics.glyphs).toBe(4000);
});

it("rasterizes literal editable fill with preserved newlines and actual soft wraps", () => {
	const { tree, id, ref } = fixture("<b>Old</b>", 48);
	tree.setAttribute(id, "contenteditable", "true");
	const value = "<b>x</b>  y\n  aa bb cc";
	documentInteractions(tree).fill(ref, value);
	expect(tree.textContent(id)).toBe(value);
	expect(tree.get(id).children.map((child) => tree.get(child).kind)).toEqual([
		"text",
	]);
	const result = rasterizeDocument(tree, { element: ref });
	const context = result.layout.text.contexts.find(
		(entry) => entry.ref === ref,
	) as TextContext;
	expect(texts(context)).toEqual(["<b>x</b>  ", "y", "  aa bb ", "cc"]);
	expect(context.lines.map((line) => line.forcedBreak)).toEqual([
		false,
		true,
		false,
		false,
	]);
	expect(result.clip).toEqual({ x: 0, y: 0, width: 48, height: 40 });
	expect(documentGeometry(tree).getBoundingClientRect(id)).toMatchObject(
		result.clip,
	);
	const reference = fixture(
		"&lt;b&gt;x&lt;/b&gt;  <br>y<br>  aa bb <br>cc",
		48,
		"main{white-space:pre}",
	);
	const expected = rasterizeDocument(reference.tree, {
		element: reference.ref,
	});
	expect(result.image.pixels).toEqual(expected.image.pixels);
	expect(result.image.pixels.some((value) => value === 0)).toBe(true);
});

it("matches an independent whitespace-run oracle across generated inline splits and widths", () => {
	for (let sample = 1; sample <= 100; sample++) {
		const width = (sample % 13) * 6;
		const source = Array.from(
			{ length: (sample % 7) + 1 },
			(_, index) =>
				`${"a".repeat((sample + index) % 5)}${[" ", "  ", "\t ", " \t", "\n", " \n "][(sample + index) % 6]}`,
		).join("");
		const expected: { text: string; width: number; forcedBreak: boolean }[] =
			[];
		const extent = (text: string, start = 0) => {
			let cursor = start;
			for (const character of text)
				cursor =
					character === "\t" ? (Math.floor(cursor / 48) + 1) * 48 : cursor + 6;
			return cursor;
		};
		const paragraphs = source.split("\n");
		for (const [index, paragraph] of paragraphs.entries()) {
			const forcedBreak = index < paragraphs.length - 1;
			let current = "";
			for (const group of paragraph.match(/[^ \t]+[ \t]*|^[ \t]+/g) ?? []) {
				const word = group.replace(/[ \t]+$/, "");
				if (current && extent(word, extent(current)) > width) {
					expected.push({
						text: current,
						width: extent(current.replace(/[ \t]+$/, "")),
						forcedBreak: false,
					});
					current = "";
				}
				current += group;
			}
			if (current || forcedBreak)
				expected.push({
					text: current,
					width: Math.max(
						extent(current.replace(/[ \t]+$/, "")),
						Math.min(width, extent(current)),
					),
					forcedBreak,
				});
		}
		const markup = Array.from(source, (character, index) =>
			index % 3 === 0 ? `<span>${character}</span>` : character,
		).join("");
		const result = fixture(markup, width).context();
		expect(texts(result)).toEqual(expected.map((line) => line.text));
		expect(
			result.lines.map(({ width, forcedBreak }) => ({ width, forcedBreak })),
		).toEqual(
			expected.map(({ width, forcedBreak }) => ({ width, forcedBreak })),
		);
		for (const line of result.lines) {
			let cursor = 0;
			for (const glyph of result.glyphs.slice(line.glyphStart, line.glyphEnd)) {
				expect(glyph.x).toBe(cursor);
				cursor = extent(glyph.character, cursor);
				expect(glyph.x + glyph.advance).toBe(cursor);
			}
		}
	}
});
