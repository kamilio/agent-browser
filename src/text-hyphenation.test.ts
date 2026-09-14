import { afterEach, expect, it } from "vitest";
import { ComputedStyles, resolvedStyleValue } from "./computed-styles.js";
import { parseInlineDeclarations } from "./css-declarations.js";
import { canonicalCssProperty } from "./css-property-aliases.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { rangeBoundingClientRect, rangeClientRects } from "./range-geometry.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText, type TextContext } from "./text-layout.js";

interface Style {
	hyphens: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value });
		return target;
	},
};
const documents: DocumentTree[] = [];
const querySets: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of querySets.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content = "ab\u00adcd", css = "", width = 18) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}main{font-size:8px;line-height:12px;color:black;width:${width}px}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/text-hyphenation",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	querySets.push(queries);
	const id = (selector = "#host") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const context = () => {
		const found = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id()),
		);
		if (!found) throw new Error("Missing hyphenation text context");
		return found;
	};
	return { tree, id, context };
}

function paintedGlyphs(context: TextContext) {
	return context.glyphs.filter((glyph) => glyph.visible && glyph.advance > 0);
}

function lineTexts(context: TextContext) {
	return context.lines.map((line) =>
		context.glyphs
			.slice(line.glyphStart, line.glyphEnd)
			.filter((glyph) => glyph.visible && glyph.advance > 0)
			.map((glyph) => glyph.character)
			.join(""),
	);
}

it("defaults to inherited manual hyphenation and performs a discretionary break", () => {
	const { tree, id, context } = fixture('<span id="target">ab\u00adcd</span>');
	for (const selector of ["html", "body", "#host", "#target"])
		expect(resolvedStyleValue(tree, id(selector), "hyphens")).toBe("manual");
	expect(lineTexts(context())).toEqual(["ab-", "cd"]);
	expect(tree.textContent(id())).toBe("ab\u00adcd");
});

it.each(["none", "manual", "auto"])(
	"resolves inherited hyphens:%s through variables and CSS-wide keywords",
	(value) => {
		const { tree, id } = fixture(
			'<span id="target">ab\u00adcd</span>',
			`body{--hyphenation:${value};hyphens:var(--hyphenation)}main{hyphens:inherit}#target{hyphens:unset}`,
		);
		for (const selector of ["body", "#host", "#target"])
			expect(resolvedStyleValue(tree, id(selector), "hyphens")).toBe(value);
		tree.setAttribute(id("#target"), "style", "hyphens:initial");
		expect(resolvedStyleValue(tree, id("#target"), "hyphens")).toBe("manual");
		expect(documentStyles(tree).metrics().issues).toEqual({});
	},
);

it.each(["hyphens", "-moz-hyphens", "-ms-hyphens", "-webkit-hyphens"])(
	"canonicalizes %s through declarations, live CSSOM and actual layout",
	(property) => {
		expect(canonicalCssProperty(property)).toBe("hyphens");
		expect(
			parseInlineDeclarations(`hyphens:none;${property}:manual`, 10).map(
				({ name, value }) => [name, value],
			),
		).toEqual([["hyphens", "manual"]]);
		const { tree, id, context } = fixture();
		const inline = new InlineStyles(tree, factory).get(id()) as Style;
		const computed = new ComputedStyles(tree, factory).get(id()) as Style;
		inline.setProperty(property, "none", "important");
		expect(inline.hyphens).toBe("none");
		expect(inline.getPropertyValue(property)).toBe("none");
		expect(inline.getPropertyPriority("hyphens")).toBe("important");
		expect(computed.getPropertyValue(property)).toBe("none");
		const accessors: Record<string, readonly string[]> = {
			hyphens: ["hyphens"],
			"-moz-hyphens": ["MozHyphens"],
			"-ms-hyphens": ["MsHyphens", "msHyphens"],
			"-webkit-hyphens": ["WebkitHyphens", "webkitHyphens"],
		};
		for (const accessor of accessors[property]) {
			expect((inline as unknown as Record<string, string>)[accessor]).toBe(
				"none",
			);
			expect((computed as unknown as Record<string, string>)[accessor]).toBe(
				"none",
			);
		}
		expect(lineTexts(context())).toEqual(["abcd"]);
		inline.hyphens = "manual";
		expect(computed.hyphens).toBe("manual");
		expect(lineTexts(context())).toEqual(["ab-", "cd"]);
		expect(inline.removeProperty(property)).toBe("manual");
		expect(inline.getPropertyValue("hyphens")).toBe("");
		expect(computed.hyphens).toBe("manual");
	},
);

it("rejects invalid declarations without replacing a valid hyphenation policy", () => {
	const { tree, id, context } = fixture();
	const inline = new InlineStyles(tree, factory).get(id()) as Style;
	inline.setProperty("hyphens", "none");
	for (const value of ["normal", "all", "manual auto", "1px"])
		inline.setProperty("hyphens", value);
	expect(inline.hyphens).toBe("none");
	expect(lineTexts(context())).toEqual(["abcd"]);
	expect(
		parseInlineDeclarations("hyphens:manual;hyphens:normal", 10).map(
			({ name, value }) => [name, value],
		),
	).toEqual([["hyphens", "manual"]]);
});

it("honors important hyphenation cascade priority until its selector stops matching", () => {
	const { tree, id, context } = fixture(
		"ab\u00adcd",
		"#host.chosen{hyphens:none!important}",
	);
	tree.setAttribute(id(), "class", "chosen");
	tree.setAttribute(id(), "style", "hyphens:manual");
	expect(lineTexts(context())).toEqual(["abcd"]);
	tree.setAttribute(id(), "class", "");
	expect(lineTexts(context())).toEqual(["ab-", "cd"]);
});

it("hides an unused soft hyphen at an exact fit while retaining UTF-16 source offsets", () => {
	const { tree, id, context } = fixture("ab\u00adcd", "", 24);
	const result = context();
	expect(lineTexts(result)).toEqual(["abcd"]);
	expect(result.lines.map((line) => [line.width, line.overflow])).toEqual([
		[24, 0],
	]);
	expect(
		paintedGlyphs(result).map((glyph) => [
			glyph.character,
			glyph.offset,
			glyph.codeUnits,
			glyph.x,
		]),
	).toEqual([
		["a", 0, 1, 0],
		["b", 1, 1, 6],
		["c", 3, 1, 12],
		["d", 4, 1, 18],
	]);
	const text = tree.get(id()).children[0];
	const range = domRangeOwner(tree).createRange();
	range.setStart(text, 2);
	range.setEnd(text, 3);
	expect(range.toString()).toBe("\u00ad");
	expect(rangeClientRects(range).every((rect) => rect.width === 0)).toBe(true);
	range.setEnd(text, 4);
	expect(range.toString()).toBe("\u00adc");
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 12,
		y: 2,
		width: 6,
		height: 8,
	});
	expect(tree.textContent(id())).toBe("ab\u00adcd");
});

it("maps an inserted hyphen to the discretionary source and range rather than adjacent letters", () => {
	const { tree, id, context } = fixture();
	const result = context();
	expect(lineTexts(result)).toEqual(["ab-", "cd"]);
	expect(result.lines.map((line) => [line.width, line.overflow])).toEqual([
		[18, 0],
		[12, 0],
	]);
	const text = tree.get(id()).children[0];
	expect(
		paintedGlyphs(result).find((glyph) => glyph.character === "-"),
	).toMatchObject({
		ref: tree.reference(text),
		offset: 2,
		codeUnits: 1,
		x: 12,
		y: 2,
		advance: 6,
	});
	const range = domRangeOwner(tree).createRange();
	range.setStart(text, 2);
	range.setEnd(text, 3);
	expect(range.toString()).toBe("\u00ad");
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 12, y: 2, width: 6, height: 8 },
	]);
	range.setEnd(text, 4);
	expect(range.toString()).toBe("\u00adc");
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 12, y: 2, width: 6, height: 8 },
		{ x: 0, y: 14, width: 6, height: 8 },
	]);
});

it.each([
	[23, ["a-", "bc-", "def"], [12, 18, 18]],
	[24, ["abc-", "def"], [24, 18]],
	[36, ["abcdef"], [36]],
])(
	"selects the longest discretionary break including hyphen width at %ipx",
	(width, texts, widths) => {
		const result = fixture("a\u00adbc\u00addef", "", width).context();
		expect(lineTexts(result)).toEqual(texts);
		expect(result.lines.map((line) => line.width)).toEqual(widths);
		expect(result.lines.every((line) => line.overflow === 0)).toBe(true);
	},
);

it("recomputes a live soft-hyphen source range after width and policy changes", () => {
	const { tree, id } = fixture();
	const text = tree.get(id()).children[0];
	const range = domRangeOwner(tree).createRange();
	range.setStart(text, 2);
	range.setEnd(text, 3);
	const before = rangeClientRects(range);
	expect(before).toMatchObject([{ x: 12, y: 2, width: 6, height: 8 }]);
	tree.setAttribute(id(), "style", "width:24px");
	expect(rangeClientRects(range).every((rect) => rect.width === 0)).toBe(true);
	expect(range.toString()).toBe("\u00ad");
	tree.setAttribute(id(), "style", "width:18px;hyphens:none");
	expect(rangeClientRects(range).every((rect) => rect.width === 0)).toBe(true);
	tree.setAttribute(id(), "style", "width:18px;hyphens:manual");
	expect(rangeClientRects(range)).toEqual(before);
	expect(range.toString()).toBe("\u00ad");
	expect(tree.get(text).data).toBe("ab\u00adcd");
	expect(before).toMatchObject([{ x: 12, y: 2, width: 6, height: 8 }]);
});

it.each(["nowrap", "pre"])(
	"suppresses discretionary soft wraps with white-space:%s without displaying U+00AD",
	(mode) => {
		const result = fixture("ab\u00adcd", `main{white-space:${mode}}`).context();
		expect(lineTexts(result)).toEqual(["abcd"]);
		expect(result.lines.map((line) => [line.width, line.overflow])).toEqual([
			[24, 6],
		]);
	},
);

it("keeps a terminal or forced-break-adjacent unused soft hyphen invisible", () => {
	const result = fixture("ab\u00ad<br>cd\u00ad").context();
	expect(lineTexts(result)).toEqual(["ab", "cd"]);
	expect(result.lines.map((line) => [line.width, line.forcedBreak])).toEqual([
		[12, true],
		[12, false],
	]);
});

it("disables discretionary breaks under none but retains ordinary word breaks", () => {
	const result = fixture("ab\u00adcd ef", "main{hyphens:none}").context();
	expect(lineTexts(result)).toEqual(["abcd", "ef"]);
	expect(result.lines.map((line) => [line.width, line.overflow])).toEqual([
		[24, 6],
		[12, 0],
	]);
});

it("preserves discretionary source ownership across inline boundaries", () => {
	const { tree, id, context } = fixture(
		'<span id="first">ab</span><span id="hint">\u00ad</span><span id="last">cd</span>',
	);
	const result = context();
	expect(lineTexts(result)).toEqual(["ab-", "cd"]);
	const hint = tree.get(id("#hint")).children[0];
	const last = tree.get(id("#last")).children[0];
	expect(
		paintedGlyphs(result).find((glyph) => glyph.character === "-"),
	).toMatchObject({
		ref: tree.reference(hint),
		offset: 0,
		codeUnits: 1,
	});
	expect(
		paintedGlyphs(result).find((glyph) => glyph.character === "c"),
	).toMatchObject({
		ref: tree.reference(last),
		offset: 0,
		line: 1,
	});
	expect(documentGeometry(tree).getClientRects(id("#hint"))).toMatchObject([
		{ x: 12, width: 6 },
	]);
	expect(documentHitTesting(tree).elementFromPoint(15, 5)).toBe(id("#hint"));
	expect(tree.textContent(id())).toBe("ab\u00adcd");
});

it("preserves supplementary UTF-16 boundaries beside a discretionary break", () => {
	const { tree, id, context } = fixture("\u{1f600}\u00adAB", "", 12);
	expect(lineTexts(context())).toEqual(["\u{1f600}-", "AB"]);
	expect(
		paintedGlyphs(context()).map((glyph) => [glyph.offset, glyph.codeUnits]),
	).toEqual([
		[0, 2],
		[2, 1],
		[3, 1],
		[4, 1],
	]);
	const range = domRangeOwner(tree).createRange();
	const text = tree.get(id()).children[0];
	range.setStart(text, 0);
	range.setEnd(text, 3);
	expect(range.toString()).toBe("\u{1f600}\u00ad");
	expect(rangeBoundingClientRect(range)).toMatchObject({
		width: 12,
		height: 8,
	});
});

it.each(["anywhere", "break-word"])(
	"prefers a discretionary boundary before %s emergency wrapping",
	(policy) => {
		const result = fixture(
			"ab\u00adcdefgh",
			`main{overflow-wrap:${policy}}`,
			30,
		).context();
		expect(lineTexts(result)).toEqual(["ab-", "cdefg", "h"]);
		expect(result.lines.map((line) => line.width)).toEqual([18, 30, 6]);
	},
);

it("allows emergency wrapping under none without resurrecting the soft hyphen", () => {
	const result = fixture(
		"ab\u00adcd",
		"main{hyphens:none;overflow-wrap:anywhere}",
	).context();
	expect(lineTexts(result)).toEqual(["abc", "d"]);
	expect(paintedGlyphs(result).map((glyph) => glyph.offset)).toEqual([
		0, 1, 3, 4,
	]);
});

it.each([
	["manual", 18],
	["none", 36],
])(
	"measures actual discretionary intrinsic widths under %s",
	(policy, minimum) => {
		const { tree, id } = fixture(
			"ab\u00adcd\u00adef",
			`main{hyphens:${policy}}`,
		);
		expect(
			measureIntrinsicWidths(tree).widths.find(
				(entry) => entry.ref === tree.reference(id()),
			),
		).toMatchObject({ minContent: minimum, maxContent: 36 });
	},
);

it.each([
	[12, 18, ["ab-", "cd-", "ef"]],
	[48, 36, ["abcdef"]],
])(
	"uses discretionary intrinsic measurements for a shrink-to-fit box within %ipx",
	(available, width, texts) => {
		const { tree, id } = fixture(
			'<span id="target">ab\u00adcd\u00adef</span>',
			"#target{display:inline-block}",
			available,
		);
		expect(
			documentGeometry(tree).getBoundingClientRect(id("#target")).width,
		).toBe(width);
		const context = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id("#target")),
		);
		if (!context) throw new Error("Missing shrink-to-fit text context");
		expect(lineTexts(context)).toEqual(texts);
	},
);

it.each(["", "en", "de", "nl"])(
	"keeps auto limited to explicit opportunities without a resource for %j",
	(language) => {
		const { tree, id, context } = fixture("ab\u00adcd", "main{hyphens:auto}");
		if (language) tree.setAttribute(id(), "lang", language);
		expect(lineTexts(context())).toEqual(["ab-", "cd"]);
		tree.setTextContent(id(), "abcdef");
		expect(lineTexts(context())).toEqual(["abcdef"]);
		expect(context().lines[0]).toMatchObject({ width: 36, overflow: 18 });
	},
);

it.each(["left", "right"])(
	"fits a discretionary prefix beside a %s float and moves below when necessary",
	(side) => {
		const { tree, id, context } = fixture(
			'<span id="float"></span>ab\u00adcd',
			`#float{float:${side};width:12px;height:24px}`,
			30,
		);
		expect(lineTexts(context())).toEqual(["ab-", "cd"]);
		expect(context().lines.map((line) => line.top)).toEqual([0, 12]);
		expect(paintedGlyphs(context())[0].x).toBe(side === "left" ? 12 : 0);
		tree.setAttribute(id("#float"), "style", "width:26px");
		expect(lineTexts(context())).toEqual(["abcd"]);
		expect(context().lines[0].top).toBe(24);
	},
);

it("keeps a closing inline edge with its discretionary prefix", () => {
	const { context } = fixture(
		'<span style="padding-right:6px">ab\u00ad</span>cd',
		"",
		24,
	);
	expect(lineTexts(context())).toEqual(["ab-", "cd"]);
	expect(context().lines.map((line) => line.width)).toEqual([24, 12]);
});

it("paints no unused hyphen and paints a taken break like an explicit visible hyphen", () => {
	const { tree, id } = fixture('<span id="target">ab\u00adcd</span>', "", 24);
	const target = id("#target");
	const clip = { x: 0, y: 0, width: 30, height: 24 };
	const wide = rasterizeDocument(tree, { clip }).image;
	tree.setTextContent(target, "abcd");
	expect(rasterizeDocument(tree, { clip }).image.pixels).toEqual(wide.pixels);
	tree.setTextContent(target, "ab\u00adcd");
	tree.setAttribute(id(), "style", "width:18px");
	const wrapped = rasterizeDocument(tree, { clip }).image;
	expect(wrapped.pixels).not.toEqual(wide.pixels);
	tree.setTextContent(target, "ab-\ncd");
	tree.setAttribute(id(), "style", "width:18px;white-space:pre");
	expect(rasterizeDocument(tree, { clip }).image.pixels).toEqual(
		wrapped.pixels,
	);
});

it("invalidates shared client rectangles and hit regions after policy, text and viewport mutations", () => {
	const { tree, id, context } = fixture(
		'<span id="target">ab\u00adcd</span>',
		"main{width:100%}",
	);
	const styles = documentStyles(tree);
	styles.setViewport(18, 60);
	const geometry = documentGeometry(tree);
	const hit = documentHitTesting(tree);
	const target = id("#target");
	const before = geometry.getClientRects(target);
	expect(before.map((rect) => rect.width)).toEqual([18, 12]);
	expect(geometry.getClientRects(target)).toBe(before);
	expect(hit.elementFromPoint(15, 5)).toBe(target);
	expect(hit.elementFromPoint(3, 17)).toBe(target);
	expect(hit.elementFromPoint(15, 17)).not.toBe(target);
	const builds = geometry.metrics().builds;
	tree.setAttribute(id(), "style", "hyphens:none");
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		24,
	]);
	expect(geometry.metrics().builds).toBe(builds + 1);
	expect(hit.elementFromPoint(3, 17)).not.toBe(target);
	tree.setAttribute(id(), "style", "hyphens:manual");
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		18, 12,
	]);
	tree.setTextContent(target, "abcd");
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		24,
	]);
	tree.setTextContent(target, "ab\u00adcd");
	styles.setViewport(24, 60);
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		24,
	]);
	expect(lineTexts(context())).toEqual(["abcd"]);
	styles.setViewport(18, 60);
	expect(geometry.getClientRects(target).map((rect) => rect.width)).toEqual([
		18, 12,
	]);
	expect(before.map((rect) => rect.width)).toEqual([18, 12]);
	expect(tree.textContent(target)).toBe("ab\u00adcd");
	tree.close();
	expect(() => context()).toThrow();
	expect(() => geometry.getClientRects(target)).toThrow();
	expect(() => hit.elementFromPoint(15, 5)).toThrow();
});

it("retains bounded token, line and work rejection with discretionary breaks", () => {
	const { tree, context } = fixture("a\u00adb\u00adc\u00add", "", 12);
	for (const options of [{ maxTokens: 2 }, { maxLines: 1 }, { maxWork: 1 }])
		expect(() => layoutDocumentText(tree, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	expect(lineTexts(context())).toEqual(["a-", "b-", "cd"]);
});
