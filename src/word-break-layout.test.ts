import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(
	content = "ABCDEFGHI",
	css = "word-break:break-word",
	width = 30,
	extra = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-family:'Agent Mono';font-size:8px;line-height:10px}main{width:${width}px;${css}}${extra}</style><main id="target">${content}</main>`,
		"https://fixture.invalid/word-break",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(120, 160);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing word-break fixture ${selector}`);
		return found;
	};
	const context = () => {
		const found = layoutDocumentText(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id()),
		);
		if (!found) throw new Error("Missing word-break context");
		return found;
	};
	const lines = () => {
		const result = context();
		return result.lines.map((line) =>
			result.glyphs
				.slice(line.glyphStart, line.glyphEnd)
				.map((glyph) => glyph.character)
				.join(""),
		);
	};
	const intrinsic = (selector = "#target") => {
		const found = measureIntrinsicWidths(tree).widths.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error("Missing intrinsic width");
		return found;
	};
	return { tree, id, context, lines, intrinsic };
}

it.each([
	"word-break:break-word;overflow-wrap:normal",
	"overflow-wrap:normal;word-break:break-word",
	"word-break:break-word;overflow-wrap:break-word",
	"overflow-wrap:break-word;word-break:break-word",
	"word-break:break-word;overflow-wrap:anywhere",
	"overflow-wrap:anywhere;word-break:break-word",
	"overflow-wrap:normal!important;word-break:break-word",
	"word-break:break-word;overflow-wrap:break-word!important",
])("uses independent emergency wrapping and min-content for %s", (css) => {
	const page = fixture(undefined, css);
	expect(page.lines()).toEqual(["ABCDE", "FGHI"]);
	expect(page.context().lines.map((line) => line.overflow)).toEqual([0, 0]);
	expect(page.intrinsic()).toMatchObject({ minContent: 6, maxContent: 54 });
	expect(page.tree.textContent(page.id())).toBe("ABCDEFGHI");
});

it.each([
	["normal", 54, ["ABCDEFGHI"]],
	["break-word", 54, ["ABCDE", "FGHI"]],
	["anywhere", 6, ["ABCDE", "FGHI"]],
] as const)(
	"word-break normal preserves overflow-wrap %s behavior",
	(wrapping, minimum, lines) => {
		const page = fixture(
			undefined,
			`word-break:normal;overflow-wrap:${wrapping}`,
		);
		expect(page.lines()).toEqual(lines);
		expect(page.intrinsic()).toMatchObject({
			minContent: minimum,
			maxContent: 54,
		});
	},
);

it.each(["nowrap", "pre"])("does not override white-space %s", (mode) => {
	const page = fixture(undefined, `word-break:break-word;white-space:${mode}`);
	expect(page.lines()).toEqual(["ABCDEFGHI"]);
	expect(page.intrinsic()).toMatchObject({ minContent: 54, maxContent: 54 });
});

it.each(["normal", "pre-line", "pre-wrap"])(
	"wraps under white-space %s without changing intrinsic maximum",
	(mode) => {
		const page = fixture(
			undefined,
			`word-break:break-word;white-space:${mode}`,
		);
		expect(page.lines()).toEqual(["ABCDE", "FGHI"]);
		expect(page.intrinsic()).toMatchObject({ minContent: 6, maxContent: 54 });
	},
);

it("prefers ordinary word boundaries before emergency splits", () => {
	expect(fixture("ab cdefghij").lines()).toEqual(["ab", "cdefg", "hij"]);
	expect(fixture("ab cde").lines()).toEqual(["ab", "cde"]);
});

it("inherits breaking without rewriting overflow-wrap and honors an inline reset", () => {
	const inherited = fixture(
		'<span id="child">ABCDEFGHI</span>',
		"word-break:break-word;overflow-wrap:normal",
	);
	expect(inherited.lines()).toEqual(["ABCDE", "FGHI"]);
	expect(
		documentStyles(inherited.tree).text(inherited.id("#child"))[
			"overflow-wrap"
		],
	).toBe("normal");
	const reset = fixture(
		'<span style="word-break:normal">ABCDEFGHI</span>',
		"word-break:break-word;overflow-wrap:normal",
	);
	expect(reset.lines()).toEqual(["ABCDEFGHI"]);
	expect(reset.intrinsic()).toMatchObject({ minContent: 54, maxContent: 54 });
});

it("preserves nested nowrap runs under inherited breaking", () => {
	const page = fixture('A<span style="white-space:nowrap">BCDEFG</span>HI');
	expect(page.lines().some((line) => line.includes("BCDEFG"))).toBe(true);
	expect(page.lines().join("")).toBe("ABCDEFGHI");
});

it("keeps original source references and offsets across inline boundaries", () => {
	const page = fixture("AB<span>CD</span>EFG");
	expect(page.lines()).toEqual(["ABCDE", "FG"]);
	expect(page.context().glyphs.map((glyph) => glyph.offset)).toEqual([
		0, 1, 0, 1, 0, 1, 2,
	]);
	expect(new Set(page.context().glyphs.map((glyph) => glyph.ref)).size).toBe(3);
});

it("keeps combining graphemes together across inline nodes", () => {
	expect(fixture("A<span>\u0301</span>BC", undefined, 12).lines()).toEqual([
		"A\u0301",
		"BC",
	]);
});

it("does not split an over-wide joined emoji or create empty lines", () => {
	const cluster = "\u{1f469}\u200d\u{1f4bb}";
	expect(fixture(`A${cluster}BC`, undefined, 12).lines()).toEqual([
		"A",
		cluster,
		"BC",
	]);
	expect(fixture("ABC", undefined, 2).lines()).toEqual(["A", "B", "C"]);
});

it("does not split glyph expansion from a transformed source unit", () => {
	const page = fixture(
		"straße",
		"word-break:break-word;text-transform:uppercase",
		6,
	);
	expect(page.lines()).toEqual(["S", "T", "R", "A", "SS", "E"]);
	expect(page.intrinsic()).toMatchObject({ minContent: 12, maxContent: 42 });
	expect(page.context().glyphs.map((glyph) => glyph.offset)).toEqual([
		0, 1, 2, 3, 4, 4, 5,
	]);
	expect(page.tree.textContent(page.id())).toBe("straße");
});

it("preserves discretionary hyphen priority and hyphens none", () => {
	expect(fixture("ab\u00adcdefgh").lines()).toEqual(["ab-", "cdefg", "h"]);
	const page = fixture("ab\u00adcd", "word-break:break-word;hyphens:none", 18);
	expect(page.lines()).toEqual(["abc", "d"]);
	expect(
		page
			.context()
			.glyphs.filter((glyph) => glyph.character)
			.map((glyph) => glyph.offset),
	).toEqual([0, 1, 3, 4]);
});

it("reflows lines, intrinsic widths, rectangles and hits after independent reset", () => {
	const page = fixture('<a id="link" href="/next">ABCDEFGHI</a>');
	const geometry = documentGeometry(page.tree);
	const before = geometry.getClientRects(page.id("#link"));
	expect(before).toHaveLength(2);
	expect(page.intrinsic().minContent).toBe(6);
	for (const rectangle of before)
		expect(
			documentHitTesting(page.tree).elementFromPoint(
				rectangle.x + 3,
				rectangle.y + rectangle.height / 2,
			),
		).toBe(page.id("#link"));
	page.tree.setAttribute(page.id(), "style", "word-break:normal");
	expect(page.lines()).toEqual(["ABCDEFGHI"]);
	expect(page.intrinsic().minContent).toBe(54);
	expect(geometry.getClientRects(page.id("#link"))).toHaveLength(1);
	page.tree.setAttribute(page.id(), "style", "word-break:break-word");
	expect(geometry.getClientRects(page.id("#link"))).toEqual(before);
	expect(before).toHaveLength(2);
});

it("maps Range UTF-16 offsets onto emergency line rectangles", () => {
	const page = fixture();
	const text = page.tree.get(page.id()).children[0];
	const range = domRangeOwner(page.tree).createRange();
	range.setStart(text, 3);
	range.setEnd(text, 7);
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 18, y: 1, width: 12, height: 8 },
		{ x: 0, y: 11, width: 12, height: 8 },
	]);
});

it("propagates the reduced minimum into real inline-block shrink-to-fit", () => {
	const page = fixture(
		'<span id="atom">ABCDEFGHI</span>',
		"",
		30,
		"#atom{display:inline-block;word-break:break-word;overflow-wrap:normal}",
	);
	const geometry = documentGeometry(page.tree);
	expect(page.intrinsic("#atom")).toMatchObject({
		minContent: 6,
		maxContent: 54,
	});
	expect(geometry.getBoundingClientRect(page.id("#atom")).width).toBe(30);
	page.tree.setAttribute(
		page.id("#atom"),
		"style",
		"word-break:normal;overflow-wrap:break-word",
	);
	expect(page.intrinsic("#atom")).toMatchObject({
		minContent: 54,
		maxContent: 54,
	});
	expect(geometry.getBoundingClientRect(page.id("#atom")).width).toBe(54);
});

it("retains token, line and work caps", () => {
	const page = fixture(undefined, undefined, 6);
	for (const limits of [{ maxTokens: 3 }, { maxLines: 3 }, { maxWork: 40 }])
		expect(() => layoutDocumentText(page.tree, limits)).toThrow(
			/limit exceeded/,
		);
	expect(page.lines()).toEqual(Array.from("ABCDEFGHI"));
});

it.each([0, 1, 6, 12, 18, 30])(
	"matches an independent word-priority oracle at width %s",
	(width) => {
		const capacity = Math.max(1, Math.floor(width / 6));
		for (const source of [
			"",
			"A",
			"ABCDE",
			"AB CDEFG HI",
			"A  BC   DEFGHIJ",
			" ABC ",
		]) {
			const expected: string[] = [];
			let line = "";
			for (const word of source.trim().split(/\s+/).filter(Boolean)) {
				if (line && line.length + 1 + word.length <= capacity) {
					line += ` ${word}`;
					continue;
				}
				if (line) expected.push(line);
				line = word;
				while (line.length > capacity) {
					expected.push(line.slice(0, capacity));
					line = line.slice(capacity);
				}
			}
			if (line) expected.push(line);
			expect(fixture(source, undefined, width).lines()).toEqual(expected);
		}
	},
);
