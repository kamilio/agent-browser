import { afterEach, describe, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { rangeBoundingClientRect, rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";
import type { TextContext } from "./text-layout.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(content: string, css = "", language?: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><html${language === undefined ? "" : ` lang="${language}"`}><style>*{margin:0;padding:0;border:0}html,body{font-size:8px;line-height:8px;color:black;background:white}#main{width:96px;text-transform:uppercase}${css}</style><main id="main">${content}</main></html>`,
		"https://fixture.invalid/text-transform-layout",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(160, 128);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing casing fixture ${selector}`);
		return found;
	};
	const context = (selector = "#main") => {
		const found = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing casing context ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		context,
		text: (selector = "#main") => tree.get(id(selector)).children[0],
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
		intrinsic: (selector = "#main") =>
			measureIntrinsicWidths(tree).widths.find(
				(entry) => entry.ref === tree.reference(id(selector)),
			),
	};
}

function characters(context: TextContext) {
	return context.glyphs.map((glyph) => glyph.character).join("");
}

function lines(context: TextContext) {
	return context.lines.map((line) =>
		context.glyphs
			.slice(line.glyphStart, line.glyphEnd)
			.map((glyph) => glyph.character)
			.join(""),
	);
}

function sources(tree: DocumentTree, context: TextContext) {
	return context.glyphs.map((glyph) =>
		tree
			.resolve(glyph.ref)
			.data.slice(glyph.offset, glyph.offset + glyph.codeUnits),
	);
}

describe("native casing inheritance and invalidation", () => {
	it("inherits through contents while none and lowercase reset descendant casing", () => {
		const page = fixture(
			'<span id="upper">a\u00df</span><span style="display:contents"><b id="contents">cd</b></span><span style="text-transform:none"><b id="none">e\u00df</b></span><span style="text-transform:lowercase"><b id="lower">FG</b></span>',
		);
		const before = snapshotDocument(page.tree);
		expect(characters(page.context())).toBe("ASSCDe\u00dffg");
		expect(page.rect("#upper")).toMatchObject({ x: 0, width: 18, height: 8 });
		expect(page.rect("#contents")).toMatchObject({ x: 18, width: 12 });
		expect(page.rect("#none")).toMatchObject({ x: 30, width: 12 });
		expect(page.rect("#lower")).toMatchObject({ x: 42, width: 12 });
		expect(sources(page.tree, page.context())).toEqual(
			Array.from("a\u00df\u00dfcde\u00dfFG"),
		);
		expect(snapshotDocument(page.tree)).toEqual(before);
	});

	it("refreshes geometry, ranges, paint and hit targets after inherited transform mutations", () => {
		const page = fixture(
			'<span id="word">a\u00dfb</span>',
			"#main{text-transform:none}",
		);
		const text = page.text("#word");
		const reference = page.tree.reference(text);
		const range = domRangeOwner(page.tree).createRange();
		range.setStart(text, 1);
		range.setEnd(text, 2);
		const geometry = documentGeometry(page.tree);
		const hits = documentHitTesting(page.tree);
		let revision = page.tree.revision;
		for (const state of [
			{ mode: "uppercase", expected: "ASSB", width: 24, rangeWidth: 12 },
			{ mode: "lowercase", expected: "a\u00dfb", width: 18, rangeWidth: 6 },
			{ mode: "capitalize", expected: "A\u00dfb", width: 18, rangeWidth: 6 },
			{ mode: "none", expected: "a\u00dfb", width: 18, rangeWidth: 6 },
		]) {
			page.tree.setAttribute(
				page.id("#main"),
				"style",
				`text-transform:${state.mode}`,
			);
			expect(page.tree.revision).toBeGreaterThan(revision);
			revision = page.tree.revision;
			const control = fixture(
				`<span id="word">${state.expected}</span>`,
				"#main{text-transform:none}",
			);
			expect(characters(page.context())).toBe(state.expected);
			expect(geometry.getBoundingClientRect(page.id("#word"))).toMatchObject({
				x: 0,
				y: 0,
				width: state.width,
				height: 8,
			});
			expect(rangeBoundingClientRect(range)).toMatchObject({
				x: 6,
				y: 0,
				width: state.rangeWidth,
				height: 8,
			});
			expect(hits.elementFromPoint(state.width - 1, 1)).toBe(page.id("#word"));
			expect(hits.elementFromPoint(state.width + 1, 1)).not.toBe(
				page.id("#word"),
			);
			expect(rasterizeDocument(page.tree).image.pixels).toEqual(
				rasterizeDocument(control.tree).image.pixels,
			);
			expect(page.tree.reference(text)).toBe(reference);
			expect(page.tree.get(text).data).toBe("a\u00dfb");
			expect(range.toString()).toBe("\u00df");
			expect(page.tree.revision).toBe(revision);
		}
	});

	it("replans source mutation without replacing the text node or old layout glyphs", () => {
		const page = fixture('<span id="word">a\u00df</span>');
		const text = page.text("#word");
		const before = page.context();
		const reference = page.tree.reference(text);
		expect(characters(before)).toBe("ASS");
		page.tree.setData(text, "\ufb03z");
		const after = page.context();
		expect(characters(after)).toBe("FFIZ");
		expect(
			after.glyphs.map((glyph) => [glyph.ref, glyph.offset, glyph.codeUnits]),
		).toEqual([
			[reference, 0, 1],
			[reference, 0, 1],
			[reference, 0, 1],
			[reference, 1, 1],
		]);
		expect(page.rect("#word")).toMatchObject({ width: 24 });
		expect(characters(before)).toBe("ASS");
		expect(page.tree.get(text).data).toBe("\ufb03z");
	});
});

describe("native casing formatting boundaries", () => {
	it.each(["inline", "contents"])(
		"continues words through display:%s and nested untransformed text",
		(display) => {
			const page = fixture(
				`<span id="first">foo</span><span style="display:${display}"><span id="last">bar</span></span> <span style="text-transform:none">b</span>az`,
				"#main{text-transform:capitalize}",
			);
			expect(characters(page.context())).toBe("Foobar baz");
			expect(page.rect("#last")).toMatchObject({ x: 18, width: 18, height: 8 });
			expect(page.tree.textContent(page.id("#main"))).toBe("foobar baz");
		},
	);

	it.each([
		"float:left",
		"float:right",
		"position:absolute;left:100px;top:16px",
		"position:fixed;left:100px;top:16px",
	])("excludes %s words from in-flow capitalize context", (position) => {
		const page = fixture(
			'<span>foo</span><span id="outside">qux</span><span id="tail">bar</span>',
			`#main{text-transform:capitalize}#outside{${position};width:18px;height:8px}`,
		);
		const before = snapshotDocument(page.tree);
		expect(characters(page.context())).toBe("Foobar");
		expect(characters(page.context("#outside"))).toBe("Qux");
		expect(page.context().lines.map((line) => line.width)).toEqual([36]);
		expect(page.rect("#tail")).toMatchObject({ width: 18, height: 8 });
		expect(page.tree.textContent(page.id("#main"))).toBe("fooquxbar");
		expect(snapshotDocument(page.tree)).toEqual(before);
	});

	it.each(["float:left", "position:absolute;left:100px;top:16px"])(
		"excludes %s letters when finding Greek final sigma",
		(position) => {
			const page = fixture(
				'\u039f\u03a3<span id="outside">\u0391</span>',
				`#main{text-transform:lowercase}#outside{${position};width:6px;height:8px}`,
			);
			expect(characters(page.context())).toBe("\u03bf\u03c2");
			expect(characters(page.context("#outside"))).toBe("\u03b1");
			expect(sources(page.tree, page.context())).toEqual(["\u039f", "\u03a3"]);
		},
	);

	it("starts independent capitalize contexts for an inline-block and following word", () => {
		const page = fixture(
			'foo<span id="atom">bar</span><span id="tail">baz</span>',
			"#main{text-transform:capitalize}#atom{display:inline-block}",
		);
		expect(characters(page.context())).toBe("FooBaz");
		expect(characters(page.context("#atom"))).toBe("Bar");
		expect(page.rect("#atom")).toMatchObject({
			x: 18,
			y: 0,
			width: 18,
			height: 8,
		});
		expect(page.rect("#tail")).toMatchObject({
			x: 36,
			y: 0,
			width: 18,
			height: 8,
		});
		expect(page.tree.textContent(page.id("#main"))).toBe("foobarbaz");
	});

	it("isolates final sigma from a following atomic in-flow context", () => {
		const page = fixture(
			'\u039f\u03a3<span id="atom">\u0391</span>',
			"#main{text-transform:lowercase}#atom{display:inline-block}",
		);
		expect(characters(page.context())).toBe("\u03bf\u03c2");
		expect(characters(page.context("#atom"))).toBe("\u03b1");
		expect(page.rect("#atom")).toMatchObject({ x: 12, width: 6 });
	});

	it("starts new words after explicit line breaks but not soft wrapping", () => {
		const page = fixture(
			"foobar<br>baz",
			"#main{text-transform:capitalize;width:18px;overflow-wrap:anywhere}",
		);
		expect(lines(page.context())).toEqual(["Foo", "bar", "Baz"]);
		expect(page.context().lines.map((line) => line.top)).toEqual([0, 8, 16]);
	});
});

describe("native content-language casing", () => {
	it.each([
		["tr", "uppercase", "i\u0131", "\u0130I"],
		["az-Latn", "uppercase", "i\u0131", "\u0130I"],
		["TR-latn-TR", "lowercase", "I\u0130", "\u0131i"],
		["az", "lowercase", "I\u0130", "\u0131i"],
		["tr", "capitalize", "istanbul izmir", "\u0130stanbul \u0130zmir"],
		["lt", "lowercase", "I\u0301", "i\u0307\u0301"],
		["lt-LT", "lowercase", "J\u0323\u0301", "j\u0307\u0323\u0301"],
		["lt", "uppercase", "i\u0307", "I"],
	])(
		"inherits actual %s metadata for %s of %s",
		(language, transform, source, expected) => {
			const page = fixture(
				`<span style="display:contents"><span id="word">${source}</span></span>`,
				`#main{text-transform:${transform}}`,
				language,
			);
			const before = snapshotDocument(page.tree);
			expect(characters(page.context())).toBe(expected);
			expect(
				page
					.context()
					.glyphs.reduce((width, glyph) => width + glyph.advance, 0),
			).toBe(Array.from(expected).length * 6);
			expect(page.tree.get(page.text("#word")).data).toBe(source);
			expect(snapshotDocument(page.tree)).toEqual(before);
		},
	);

	it.each(["", "not_a_tag", " tr", "tr-", "unknown"])(
		"resets inherited Turkish with explicit lang=%j",
		(language) => {
			const page = fixture(
				`<span id="inherited">i</span><span lang="${language}" style="display:contents"><span id="reset">i</span></span>`,
				"",
				"tr",
			);
			expect(characters(page.context())).toBe("\u0130I");
			expect(page.rect("#reset")).toMatchObject({ x: 6, width: 6 });
			expect(sources(page.tree, page.context())).toEqual(["i", "i"]);
		},
	);

	it("invalidates inherited language after attribute changes, resets and removal", () => {
		const page = fixture(
			'<span id="word">iI</span>',
			"#main{text-transform:lowercase}",
			"tr",
		);
		const text = page.text("#word");
		expect(characters(page.context())).toBe("i\u0131");
		for (const [language, expected] of [
			["en", "ii"],
			["az", "i\u0131"],
			["", "ii"],
			["not_a_tag", "ii"],
		]) {
			page.tree.setAttribute(page.id("#main"), "lang", language);
			expect(characters(page.context())).toBe(expected);
			expect(page.text("#word")).toBe(text);
		}
		page.tree.removeAttribute(page.id("#main"), "lang");
		expect(characters(page.context())).toBe("i\u0131");
		expect(page.tree.get(text).data).toBe("iI");
	});

	it.each([
		["tr", "lowercase", "I", "i"],
		["az", "lowercase", "I", "i"],
		["lt", "uppercase", "i", "I"],
		["lt", "capitalize", "i", "I"],
	])(
		"retains deleted-dot layout and the combining-source range guard for %s/%s",
		(language, transform, source, expected) => {
			const page = fixture(
				`<span id="base">${source}</span><span style="display:contents"><span id="dot">\u0307</span></span>`,
				`#main{text-transform:${transform}}`,
				language,
			);
			const context = page.context();
			expect(characters(context)).toBe(expected);
			expect(
				context.glyphs.map((glyph) => [
					glyph.character,
					glyph.offset,
					glyph.codeUnits,
					glyph.x,
					glyph.advance,
				]),
			).toEqual([
				[expected, 0, 1, 0, 6],
				["", 0, 1, 6, 0],
			]);
			expect(sources(page.tree, context)).toEqual([source, "\u0307"]);
			expect(context.glyphs[1].ref).toBe(
				page.tree.reference(page.text("#dot")),
			);
			const range = domRangeOwner(page.tree).createRange();
			range.setStart(page.text("#dot"), 0);
			range.setEnd(page.text("#dot"), 1);
			expect(range.toString()).toBe("\u0307");
			expect(page.rect("#dot")).toMatchObject({
				x: 6,
				y: 0,
				width: 0,
				height: 8,
			});
			expect(() => rangeClientRects(range)).toThrow(
				expect.objectContaining({
					code: "unsupported",
					message: "Range geometry for bidi or shaped text is unsupported",
				}),
			);
			expect(page.tree.textContent(page.id("#main"))).toBe(`${source}\u0307`);
		},
	);

	it("inserts a Lithuanian dot using above-accent context in the next inline", () => {
		const page = fixture(
			'<span id="base">I</span><span id="accent">\u0301</span>',
			"#main{text-transform:lowercase}",
			"lt",
		);
		const context = page.context();
		expect(characters(context)).toBe("i\u0307\u0301");
		expect(
			context.glyphs.map((glyph) => [glyph.ref, glyph.offset, glyph.advance]),
		).toEqual([
			[page.tree.reference(page.text("#base")), 0, 6],
			[page.tree.reference(page.text("#base")), 0, 6],
			[page.tree.reference(page.text("#accent")), 0, 6],
		]);
		expect(context.glyphs.map((glyph) => glyph.supported)).toEqual([
			true,
			false,
			false,
		]);
		expect(sources(page.tree, context)).toEqual(["I", "I", "\u0301"]);
	});

	it.each([
		["tr", "lowercase", "I", "\u0323", "i\u0323", [6, 6, 0]],
		["tr", "lowercase", "I", "\u0301", "\u0131\u0301\u0307", [6, 6, 6]],
		["lt", "uppercase", "i", "\u0301", "I\u0301\u0307", [6, 6, 6]],
	] as const)(
		"honors combining-class barriers across %s/%s inline nodes with %s%s",
		(language, mode, base, accent, expected, advances) => {
			const page = fixture(
				`<span>${base}</span><span>${accent}</span><span>\u0307</span>`,
				`#main{text-transform:${mode}}`,
				language,
			);
			const context = page.context();
			expect(characters(context)).toBe(expected);
			expect(context.glyphs.map((glyph) => glyph.advance)).toEqual(advances);
			expect(sources(page.tree, context)).toEqual([base, accent, "\u0307"]);
		},
	);

	it("does not apply a Turkish deletion to an explicitly unknown-language dot", () => {
		const page = fixture(
			'<span>I</span><span lang="">\u0307</span>',
			"#main{text-transform:lowercase}",
			"tr",
		);
		const context = page.context();
		expect(characters(context)).toBe("i\u0307");
		expect(context.glyphs.map((glyph) => glyph.advance)).toEqual([6, 6]);
		expect(sources(page.tree, context)).toEqual(["I", "\u0307"]);
	});
});

describe("native transformed intrinsic widths and emergency wrapping", () => {
	it.each([
		["normal", 24],
		["anywhere", 12],
		["break-word", 24],
	] as const)(
		"measures expansion-aware %s intrinsic widths",
		(policy, minimum) => {
			const page = fixture("a\u00dfb cd", `#main{overflow-wrap:${policy}}`);
			expect(page.intrinsic()).toMatchObject({
				minContent: minimum,
				maxContent: 42,
			});
			expect(characters(page.context())).toBe("ASSB CD");
			expect(page.context().lines[0].width).toBe(42);
		},
	);

	it("shrink-wraps an independent inline-block using transformed advances", () => {
		const page = fixture(
			'a<span id="atom">\ufb03b</span>c',
			"#atom{display:inline-block}",
		);
		expect(page.intrinsic("#atom")).toMatchObject({
			minContent: 24,
			maxContent: 24,
		});
		expect(page.rect("#atom")).toMatchObject({
			x: 6,
			y: 0,
			width: 24,
			height: 8,
		});
		expect(characters(page.context("#atom"))).toBe("FFIB");
		expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([0, 30]);
	});

	it.each(["anywhere", "break-word"])(
		"never splits one source expansion under %s",
		(policy) => {
			for (const [width, expected] of [
				[6, ["A", "SS", "B"]],
				[12, ["A", "SS", "B"]],
				[18, ["ASS", "B"]],
				[24, ["ASSB"]],
			] as const) {
				const page = fixture(
					"a\u00dfb",
					`#main{width:${width}px;overflow-wrap:${policy}}`,
				);
				const context = page.context();
				expect(lines(context), `${policy}/${width}`).toEqual(expected);
				expect(context.glyphs.map((glyph) => glyph.offset)).toEqual([
					0, 1, 1, 2,
				]);
				expect(context.glyphs[1].line).toBe(context.glyphs[2].line);
				expect(context.glyphs[2].x - context.glyphs[1].x).toBe(6);
				expect(context.lines.map((line) => line.width)).toEqual(
					expected.map((line) => line.length * 6),
				);
			}
		},
	);

	it.each([
		["\u00df\u00df", ["SS", "SS"], [0, 0, 1, 1]],
		["\ufb03x", ["FFI", "X"], [0, 0, 0, 1]],
	] as const)(
		"allows oversized indivisible source groups in %s",
		(source, expected, offsets) => {
			const page = fixture(source, "#main{width:6px;overflow-wrap:anywhere}");
			const context = page.context();
			expect(lines(context)).toEqual(expected);
			expect(context.glyphs.map((glyph) => glyph.offset)).toEqual(offsets);
			expect(context.lines.map((line) => line.overflow)).toEqual(
				expected.map((line) => line.length * 6 - 6),
			);
		},
	);

	it("keeps lowercase dotted-I expansion on one emergency line without claiming shaping", () => {
		const page = fixture(
			"\u0130x",
			"#main{text-transform:lowercase;width:6px;overflow-wrap:anywhere}",
		);
		const context = page.context();
		expect(lines(context)).toEqual(["i\u0307", "x"]);
		expect(
			context.glyphs.map((glyph) => [
				glyph.offset,
				glyph.line,
				glyph.supported,
			]),
		).toEqual([
			[0, 0, true],
			[0, 0, false],
			[1, 1, true],
		]);
		expect(context.lines.map((line) => line.width)).toEqual([12, 6]);
		expect(page.intrinsic()).toMatchObject({ minContent: 12, maxContent: 18 });
	});

	it("wraps before an expanded word and keeps range geometry source-indexed", () => {
		const page = fixture("aa \u00dfb", "#main{width:30px}");
		const context = page.context();
		expect(lines(context)).toEqual(["AA", "SSB"]);
		expect(context.glyphs.map((glyph) => glyph.offset)).toEqual([
			0, 1, 3, 3, 4,
		]);
		const range = domRangeOwner(page.tree).createRange();
		range.setStart(page.text(), 3);
		range.setEnd(page.text(), 4);
		expect(rangeClientRects(range)).toMatchObject([
			{ x: 0, y: 8, width: 12, height: 8 },
		]);
		expect(range.toString()).toBe("\u00df");
	});

	it("retains source ownership and expansion rectangles across inline emergency breaks", () => {
		const page = fixture(
			'<span>a</span><span id="expansion">\u00df</span><span>b</span>',
			"#main{width:12px;overflow-wrap:anywhere}",
		);
		const context = page.context();
		expect(lines(context)).toEqual(["A", "SS", "B"]);
		expect(context.glyphs.map((glyph) => glyph.offset)).toEqual([0, 0, 0, 0]);
		expect(new Set(context.glyphs.map((glyph) => glyph.ref)).size).toBe(3);
		expect(page.rect("#expansion")).toMatchObject({
			x: 0,
			y: 8,
			width: 12,
			height: 8,
		});
		const range = domRangeOwner(page.tree).createRange();
		range.setStart(page.text("#expansion"), 0);
		range.setEnd(page.text("#expansion"), 1);
		expect(rangeClientRects(range)).toMatchObject([
			{ x: 0, y: 8, width: 12, height: 8 },
		]);
		expect(documentHitTesting(page.tree).elementFromPoint(9, 9)).toBe(
			page.id("#expansion"),
		);
		expect(range.toString()).toBe("\u00df");
	});

	it("preserves UTF-16 source intervals beside an astral casing mapping", () => {
		const page = fixture("\u{10428}\u00df");
		const context = page.context();
		expect(characters(context)).toBe("\u{10400}SS");
		expect(
			context.glyphs.map((glyph) => [
				glyph.offset,
				glyph.codeUnits,
				glyph.supported,
			]),
		).toEqual([
			[0, 2, false],
			[2, 1, true],
			[2, 1, true],
		]);
		expect(sources(page.tree, context)).toEqual([
			"\u{10428}",
			"\u00df",
			"\u00df",
		]);
		expect(context.lines[0].width).toBe(18);
	});
});

describe("native casing with indentation, alignment and whitespace", () => {
	it.each([
		["left", 6],
		["center", 18],
		["right", 30],
	] as const)(
		"aligns %s after expansion and first-line indentation",
		(alignment, first) => {
			const css = `#main{width:48px;text-indent:6px;text-align:${alignment}}`;
			const page = fixture('<span id="word">a\u00df</span>', css);
			const control = fixture(
				'<span id="word">ASS</span>',
				`${css}#main{text-transform:none}`,
			);
			expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([
				first,
				first + 6,
				first + 12,
			]);
			expect(page.rect("#word")).toMatchObject({
				x: first,
				y: 0,
				width: 18,
				height: 8,
			});
			expect(rasterizeDocument(page.tree).image.pixels).toEqual(
				rasterizeDocument(control.tree).image.pixels,
			);
		},
	);

	it("applies indentation once while emergency wrapping indivisible expansions", () => {
		const page = fixture(
			"\u00dfa\u00df",
			"#main{width:18px;text-indent:6px;overflow-wrap:anywhere}",
		);
		const context = page.context();
		expect(lines(context)).toEqual(["SS", "ASS"]);
		expect(context.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
			[6, 0],
			[12, 0],
			[0, 8],
			[6, 8],
			[12, 8],
		]);
		expect(context.glyphs.map((glyph) => glyph.offset)).toEqual([
			0, 0, 1, 2, 2,
		]);
	});

	it.each(["pre", "pre-wrap"])(
		"positions preserved %s tabs using expanded advances",
		(mode) => {
			const page = fixture("\u00df\tb", `#main{white-space:${mode}}`);
			const context = page.context();
			expect(characters(context)).toBe("SS\tB");
			expect(
				context.glyphs.map((glyph) => [glyph.offset, glyph.x, glyph.advance]),
			).toEqual([
				[0, 0, 6],
				[0, 6, 6],
				[1, 12, 36],
				[2, 48, 6],
			]);
			expect(context.lines[0].width).toBe(54);
			expect(sources(page.tree, context)).toEqual([
				"\u00df",
				"\u00df",
				"\t",
				"b",
			]);
		},
	);

	it("resolves preserved tab stops after expansion and indentation", () => {
		const page = fixture("\u00df\tb", "#main{white-space:pre;text-indent:6px}");
		const context = page.context();
		expect(characters(context)).toBe("SS\tB");
		expect(context.glyphs.map((glyph) => [glyph.x, glyph.advance])).toEqual([
			[6, 6],
			[12, 6],
			[18, 30],
			[48, 6],
		]);
		expect(sources(page.tree, context)).toEqual([
			"\u00df",
			"\u00df",
			"\t",
			"b",
		]);
	});

	it("retains transformed fixed indentation in intrinsic measurements", () => {
		const page = fixture("a\u00dfb cd", "#main{text-indent:6px}");
		expect(page.intrinsic()).toMatchObject({ minContent: 30, maxContent: 48 });
		expect(characters(page.context())).toBe("ASSB CD");
		expect(page.context().glyphs[0].x).toBe(6);
	});

	it("preserves hanging pre-wrap spaces after an indivisible expansion", () => {
		const page = fixture(
			"\u00df  b",
			"#main{width:12px;white-space:pre-wrap;overflow-wrap:anywhere}",
		);
		const context = page.context();
		expect(lines(context)).toEqual(["SS  ", "B"]);
		expect(context.glyphs.map((glyph) => glyph.offset)).toEqual([
			0, 0, 1, 2, 3,
		]);
		expect(context.glyphs.map((glyph) => glyph.x)).toEqual([0, 6, 12, 18, 0]);
	});

	it.each([
		["normal", ["SS A", "B"]],
		["nowrap", ["SS A B"]],
		["pre", [" SS  A", "B "]],
		["pre-line", ["SS A", "B"]],
	] as const)(
		"composes %s whitespace processing with casing and source identity",
		(mode, expected) => {
			const page = fixture(
				" \u00df  a\nb ",
				`#main{width:24px;white-space:${mode}}`,
			);
			const before = snapshotDocument(page.tree);
			expect(lines(page.context())).toEqual(expected);
			expect(page.tree.get(page.text()).data).toBe(" \u00df  a\nb ");
			expect(snapshotDocument(page.tree)).toEqual(before);
		},
	);

	it.each(["nowrap", "pre"])(
		"does not emergency-wrap transformed text in %s",
		(mode) => {
			const page = fixture(
				"a\u00dfb",
				`#main{width:6px;white-space:${mode};overflow-wrap:anywhere}`,
			);
			expect(lines(page.context())).toEqual(["ASSB"]);
			expect(page.context().lines[0]).toMatchObject({
				width: 24,
				overflow: 18,
			});
		},
	);
});
