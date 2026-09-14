import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { parseInlineDeclarations } from "./css-declarations.js";
import { parseTextValue } from "./css-text.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText, type TextContext } from "./text-layout.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content = "a b c d", css = "", width = 40) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}main{font-size:8px;line-height:12px;width:${width}px;text-align:justify}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/text-justify",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#host") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const context = () => {
		const found = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id()),
		);
		if (!found) throw new Error("Missing justified text context");
		return found;
	};
	return { tree, id, context };
}

function lineGlyphs(context: TextContext, index: number) {
	const line = context.lines[index];
	return context.glyphs.slice(line.glyphStart, line.glyphEnd);
}

function lineTexts(context: TextContext) {
	return context.lines.map((line) =>
		lineGlyphs(context, line.index)
			.map((glyph) => glyph.character)
			.join(""),
	);
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

it("parses justify and resolves inherited variables into actual native layout", () => {
	expect(parseTextValue("text-align", "justify")).toBe("justify");
	expect(
		parseInlineDeclarations("text-align:right;text-align:justify", 10).map(
			({ name, value }) => [name, value],
		),
	).toEqual([["text-align", "justify"]]);
	const { tree, id, context } = fixture(
		'<span id="target">a b c d</span>',
		"body{--alignment:justify;text-align:var(--alignment)}main{text-align:inherit}#target{text-align:unset}",
	);
	const styles = documentStyles(tree);
	for (const selector of ["body", "#host", "#target"]) {
		expect(styles.text(id(selector))["text-align"]).toBe("justify");
		expect(resolvedStyleValue(tree, id(selector), "text-align")).toBe(
			"justify",
		);
	}
	expect(styles.text(tree.get(id("#target")).children[0])["text-align"]).toBe(
		"justify",
	);
	expect(context().lines.map((line) => line.width)).toEqual([40, 6]);
	expect(styles.metrics().issues).toEqual({});
});

it("honors important cascade priority and inline justify overrides", () => {
	const { tree, id, context } = fixture(
		"a b c d",
		"main{text-align:left}#host.chosen{text-align:justify!important}",
	);
	tree.setAttribute(id(), "class", "chosen");
	tree.setAttribute(id(), "style", "text-align:right");
	expect(resolvedStyleValue(tree, id(), "text-align")).toBe("justify");
	expect(lineGlyphs(context(), 0).map((glyph) => glyph.x)).toEqual([
		0, 6, 17, 23, 34,
	]);
	tree.setAttribute(id(), "class", "");
	expect(context().glyphs[0].x).toBe(10);
	tree.setAttribute(id(), "style", "text-align:justify");
	expect(context().lines[0].width).toBe(40);
});

it("distributes positive free space equally and leaves the final line unchanged", () => {
	const { tree, context } = fixture();
	const result = context();
	expect(lineTexts(result)).toEqual(["a b c", "d"]);
	expect(result.lines.map((line) => [line.width, line.overflow])).toEqual([
		[40, 0],
		[6, 0],
	]);
	expect(
		result.glyphs.map((glyph) => [glyph.x, glyph.y, glyph.advance]),
	).toEqual([
		[0, 2, 6],
		[6, 2, 11],
		[17, 2, 6],
		[23, 2, 11],
		[34, 2, 6],
		[0, 14, 6],
	]);
	for (const glyph of result.glyphs)
		expect(
			tree
				.resolve(glyph.ref)
				.data.slice(glyph.offset, glyph.offset + glyph.codeUnits),
		).toBe(glyph.character);
	expect(Object.isFrozen(result.lines[0])).toBe(true);
	expect(Object.isFrozen(result.glyphs[1])).toBe(true);
});

it("retains fractional spacing without rounding the line endpoint", () => {
	const result = fixture("a b c d", "", 41).context();
	expect(lineGlyphs(result, 0).map((glyph) => glyph.x)).toEqual([
		0, 6, 17.5, 23.5, 35,
	]);
	expect(lineGlyphs(result, 0).map((glyph) => glyph.advance)).toEqual([
		6, 11.5, 6, 11.5, 6,
	]);
	expect(result.lines[0].width).toBe(41);
});

it.each([
	["a b<br>c d e f", "normal"],
	["a b\nc d e f", "pre-line"],
])("keeps the forced line start-aligned in %j", (content, mode) => {
	const result = fixture(content, `main{white-space:${mode}}`).context();
	expect(lineTexts(result)).toEqual(["a b", "c d e", "f"]);
	expect(result.lines.map((line) => [line.width, line.forcedBreak])).toEqual([
		[18, true],
		[40, false],
		[6, false],
	]);
	expect(lineGlyphs(result, 0).map((glyph) => glyph.x)).toEqual([0, 6, 12]);
	expect(lineGlyphs(result, 1).map((glyph) => glyph.x)).toEqual([
		0, 6, 17, 23, 34,
	]);
});

it("collapses boundary whitespace without stretching leading or trailing spaces", () => {
	const result = fixture(
		" \n <span>a</span>\t<span> b </span> <span>c</span>\r\n d \t ",
	).context();
	expect(lineTexts(result)).toEqual(["a b c", "d"]);
	expect(lineGlyphs(result, 0).map((glyph) => glyph.x)).toEqual([
		0, 6, 17, 23, 34,
	]);
	expect(result.glyphs.filter((glyph) => glyph.character === " ")).toHaveLength(
		2,
	);
});

it.each([
	["aaaa b", 20, ["aaaa", "b"], [24, 6], [4, 0]],
	["aa bb cc", 30, ["aa bb", "cc"], [30, 12], [0, 0]],
	["a b", 0, ["a", "b"], [6, 6], [6, 6]],
])(
	"does not stretch unavailable opportunities in %j at width %s",
	(content, width, texts, widths, overflow) => {
		const result = fixture(content, "", width).context();
		expect(lineTexts(result)).toEqual(texts);
		expect(result.lines.map((line) => line.width)).toEqual(widths);
		expect(result.lines.map((line) => line.overflow)).toEqual(overflow);
		expect(result.glyphs.every((glyph) => glyph.advance === 6)).toBe(true);
		for (const line of result.lines)
			expect(lineGlyphs(result, line.index)[0].x).toBe(0);
	},
);

it.each([
	" ",
	"\u00a0",
	"\u1361",
	"\u{10100}",
	"\u{10101}",
	"\u{1039f}",
	"\u{1091f}",
])(
	"expands source-listed word separator %j without changing source boundaries",
	(separator) => {
		const result = fixture(`a${separator}b c`, "", 20).context();
		expect(lineTexts(result)).toEqual([`a${separator}b`, "c"]);
		expect(result.lines.map((line) => line.width)).toEqual([20, 6]);
		const glyphs = lineGlyphs(result, 0);
		expect(glyphs.map((glyph) => [glyph.x, glyph.advance])).toEqual([
			[0, 6],
			[6, 8],
			[14, 6],
		]);
		expect(glyphs[1]).toMatchObject({ offset: 1, codeUnits: separator.length });
		expect(glyphs[2].offset).toBe(1 + separator.length);
	},
);

it("charges the expansion work and retains the text-layout work limit", () => {
	const { tree, id } = fixture("a b c d", "main{text-align:left}");
	const plain = layoutDocumentText(tree);
	tree.setAttribute(id(), "style", "text-align:justify");
	const justified = layoutDocumentText(tree);
	expect(justified.metrics.work).toBeGreaterThan(plain.metrics.work);
	expect(() =>
		layoutDocumentText(tree, { maxWork: plain.metrics.work }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each(["a b c d", "a b\tc d", "a\u00a0b c d"])(
	"does not expand preserved whitespace in %j",
	(content) => {
		const { tree, id, context } = fixture(
			content,
			"main{white-space:pre-wrap}",
		);
		const justified = context();
		tree.setAttribute(id(), "style", "text-align:left");
		const plain = context();
		expect(justified.lines).toEqual(plain.lines);
		expect(justified.glyphs).toEqual(plain.glyphs);
	},
);

it("retains a preserved tab stop while expanding the collapsible suffix", () => {
	const content = '<span style="white-space:pre">a b\t</span>c d e f';
	const { tree, id, context } = fixture(content, "", 88);
	const result = context();
	tree.setAttribute(id(), "style", "text-align:left");
	const plain = context();
	const glyphs = lineGlyphs(result, 0);
	expect(glyphs.slice(0, 4)).toEqual(lineGlyphs(plain, 0).slice(0, 4));
	expect(glyphs.find((glyph) => glyph.kind === "tab")).toMatchObject({
		x: 18,
		advance: 30,
	});
	expect(
		glyphs.slice(4).map((glyph) => [glyph.character, glyph.x, glyph.advance]),
	).toEqual([
		["c", 48, 6],
		[" ", 54, 11],
		["d", 65, 6],
		[" ", 71, 11],
		["e", 82, 6],
	]);
	expect(result.lines[0].width).toBe(88);
});

it.each(["nowrap", "pre", "pre-wrap"])(
	"leaves unwrapped final text start-aligned with white-space:%s",
	(mode) => {
		const result = fixture("a b", `main{white-space:${mode}}`).context();
		expect(lineTexts(result)).toEqual(["a b"]);
		expect(result.lines[0].width).toBe(18);
		expect(result.glyphs.map((glyph) => [glyph.x, glyph.advance])).toEqual([
			[0, 6],
			[6, 6],
			[12, 6],
		]);
	},
);

it.each([
	["left", 0, 0],
	["start", 0, 0],
	["center", 5, 17],
	["right", 10, 34],
	["end", 10, 34],
])(
	"preserves %s alignment on wrapped and final lines",
	(alignment, first, last) => {
		const result = fixture(
			"a b c d",
			`main{text-align:${alignment}}`,
		).context();
		expect(result.lines.map((line) => line.width)).toEqual([30, 6]);
		expect(lineGlyphs(result, 0).map((glyph) => glyph.x)).toEqual([
			first,
			first + 6,
			first + 12,
			first + 18,
			first + 24,
		]);
		expect(lineGlyphs(result, 1)[0].x).toBe(last);
		expect(result.glyphs.every((glyph) => glyph.advance === 6)).toBe(true);
	},
);

it("expands nested inline boxes, sliced borders, background paint and hit regions", () => {
	const { tree, id, context } = fixture(
		'<span id="outer">a <span id="inner">b</span> c d</span>',
		"main{color:transparent}#outer{border:1px solid red;background:yellow}#inner{border:1px solid blue;background:cyan}",
		41,
	);
	const result = context();
	expect(lineTexts(result)).toEqual(["a b c", "d"]);
	expect(result.lines.map((line) => line.width)).toEqual([41, 7]);
	expect(lineGlyphs(result, 0).map((glyph) => glyph.x)).toEqual([
		1, 7, 18, 25, 35,
	]);
	expect(
		result.fragments
			.filter((fragment) => fragment.ref === tree.reference(id("#outer")))
			.map((fragment) => [fragment.x, fragment.width]),
	).toEqual([
		[0, 41],
		[0, 7],
	]);
	const geometry = documentGeometry(tree);
	expect(
		geometry.getClientRects(id("#outer")).map((rect) => rect.width),
	).toEqual([41, 7]);
	expect(geometry.getClientRects(id("#inner"))[0]).toMatchObject({
		x: 17,
		width: 8,
	});
	const { image } = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 45, height: 26 },
	});
	expect(pixel(image, 0, 5)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 14, 5)).toEqual([255, 255, 0, 255]);
	expect(pixel(image, 17, 5)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 19, 5)).toEqual([0, 255, 255, 255]);
	expect(pixel(image, 39, 5)).toEqual([255, 255, 0, 255]);
	const hit = documentHitTesting(tree);
	expect(hit.elementFromPoint(14, 5)).toBe(id("#outer"));
	expect(hit.elementFromPoint(19, 5)).toBe(id("#inner"));
	expect(hit.elementFromPoint(39, 5)).toBe(id("#outer"));
	expect(hit.elementFromPoint(20, 17)).not.toBe(id("#outer"));
});

it("paints glyph ink at the expanded rather than natural word position", () => {
	const justified = fixture();
	const left = fixture("a b c d", "main{text-align:left}");
	const clip = { x: 0, y: 0, width: 40, height: 24 };
	const actual = rasterizeDocument(justified.tree, { clip }).image;
	const reference = rasterizeDocument(left.tree, { clip }).image;
	let ink = 0;
	for (let row = 2; row < 10; row++) {
		for (let column = 0; column < 5; column++) {
			const expected = pixel(reference, 12 + column, row);
			expect(pixel(actual, 17 + column, row)).toEqual(expected);
			expect(pixel(actual, 12 + column, row)).toEqual([255, 255, 255, 255]);
			if (expected[0] === 0 && expected[3] === 255) ink++;
		}
	}
	expect(ink).toBeGreaterThan(0);
});

it("moves an atomic inline without inventing a gap at its adjacent letter", () => {
	const { tree, id, context } = fixture(
		'a <span id="atom"></span>b c',
		"#atom{display:inline-block;width:6px;height:8px;background:red}",
		30,
	);
	const result = context();
	expect(lineTexts(result)).toEqual(["a b", "c"]);
	expect(result.lines.map((line) => line.width)).toEqual([30, 6]);
	expect(
		lineGlyphs(result, 0).map((glyph) => [glyph.x, glyph.advance]),
	).toEqual([
		[0, 6],
		[6, 12],
		[24, 6],
	]);
	expect(documentGeometry(tree).getClientRects(id("#atom"))[0]).toMatchObject({
		x: 18,
		width: 6,
	});
});

it("invalidates cached geometry after style, text and viewport changes and closes safely", () => {
	const { tree, id, context } = fixture(
		'<span id="target">a b c d</span>',
		"main{width:100%}",
	);
	const styles = documentStyles(tree);
	styles.setViewport(40, 80);
	const geometry = documentGeometry(tree);
	const target = id("#target");
	const before = geometry.getClientRects(target);
	expect(before.map((rect) => rect.width)).toEqual([40, 6]);
	expect(geometry.getClientRects(target)).toBe(before);
	const builds = geometry.metrics().builds;
	tree.setAttribute(id(), "style", "text-align:left");
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		30, 6,
	]);
	expect(geometry.metrics().builds).toBe(builds + 1);
	tree.setAttribute(id(), "style", "text-align:justify");
	tree.setTextContent(target, "a b");
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		18,
	]);
	tree.setTextContent(target, "a b c d");
	styles.setViewport(30, 80);
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		30, 6,
	]);
	styles.setViewport(54, 80);
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		42,
	]);
	expect(context().glyphs.every((glyph) => glyph.advance === 6)).toBe(true);
	expect(before.map((rect) => rect.width)).toEqual([40, 6]);
	tree.close();
	expect(() => context()).toThrow();
	expect(() => geometry.getClientRects(target)).toThrow();
});
