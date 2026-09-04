import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { layoutDocumentText } from "./text-layout.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content: string, css = "overflow-wrap:anywhere", width = 30) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}main{width:${width}px;${css}}</style><main id="target">${content}</main>`,
		"https://fixture.invalid/overflow-wrap",
	);
	trees.push(tree);
	const id = new DocumentQueries(tree).querySelector("#target");
	if (id === null) throw Error("Missing text container");
	const reference = tree.reference(id);
	const context = () => {
		const result = layoutDocumentText(tree).contexts.find(
			(entry) => entry.ref === reference,
		);
		if (!result) throw Error("Missing text context");
		return result;
	};
	return {
		tree,
		id,
		context,
		lines: () => {
			const result = context();
			return result.lines.map((line) =>
				result.glyphs
					.slice(line.glyphStart, line.glyphEnd)
					.map((glyph) => glyph.character)
					.join(""),
			);
		},
		intrinsic: () =>
			measureIntrinsicWidths(tree).widths.find(
				(entry) => entry.ref === reference,
			),
	};
}

it.each(["anywhere", "break-word"])(
	"wraps an oversized word with %s",
	(value) => {
		const test = fixture("ABCDEFGHI", `overflow-wrap:${value}`);
		expect(test.lines()).toEqual(["ABCDE", "FGHI"]);
		expect(test.context().lines.map((line) => line.overflow)).toEqual([0, 0]);
	},
);

it("keeps normal overflow unchanged", () => {
	const test = fixture("ABCDEFGHI", "overflow-wrap:normal");
	expect(test.lines()).toEqual(["ABCDEFGHI"]);
	expect(test.context().lines[0].overflow).toBe(24);
});

it("prefers an existing word boundary before emergency splitting", () => {
	expect(fixture("ab cdefghij").lines()).toEqual(["ab", "cdefg", "hij"]);
	expect(fixture("ab cde").lines()).toEqual(["ab", "cde"]);
});

it.each(["nowrap", "pre"])("does not emergency wrap white-space:%s", (mode) => {
	expect(
		fixture("ABCDEFGHI", `overflow-wrap:anywhere;white-space:${mode}`).lines(),
	).toEqual(["ABCDEFGHI"]);
});

it("distinguishes anywhere from break-word intrinsic minimums", () => {
	expect(fixture("ABCDEFGHI").intrinsic()).toMatchObject({
		minContent: 6,
		maxContent: 54,
	});
	expect(
		fixture("ABCDEFGHI", "overflow-wrap:break-word").intrinsic(),
	).toMatchObject({ minContent: 54, maxContent: 54 });
});

it("retains source refs and UTF-16 offsets across inline boundaries", () => {
	const test = fixture("AB<span>CD</span>EFG");
	expect(test.lines()).toEqual(["ABCDE", "FG"]);
	const glyphs = test.context().glyphs;
	expect(glyphs.map((glyph) => glyph.offset)).toEqual([0, 1, 0, 1, 0, 1, 2]);
	expect(new Set(glyphs.map((glyph) => glyph.ref)).size).toBe(3);
});

it("keeps combining grapheme clusters together across text nodes", () => {
	expect(
		fixture("A<span>\u0301</span>BC", "overflow-wrap:anywhere", 12).lines(),
	).toEqual(["A\u0301", "BC"]);
});

it("keeps joined emoji together even when its native fallback width overflows", () => {
	const cluster = "\u{1f469}\u200d\u{1f4bb}";
	expect(
		fixture(`A${cluster}BC`, "overflow-wrap:anywhere", 12).lines(),
	).toEqual(["A", cluster, "BC"]);
});

it("does not create empty lines when one character exceeds the available width", () => {
	expect(fixture("ABC", "overflow-wrap:anywhere", 2).lines()).toEqual([
		"A",
		"B",
		"C",
	]);
});

it("reflows after overflow-wrap mutation without changing source text", () => {
	const test = fixture("ABCDEFGHI", "overflow-wrap:normal");
	expect(test.lines()).toEqual(["ABCDEFGHI"]);
	test.tree.setAttribute(test.id, "style", "overflow-wrap:anywhere");
	expect(test.lines()).toEqual(["ABCDE", "FGHI"]);
	expect(test.tree.textContent(test.id)).toBe("ABCDEFGHI");
});

it("retains an explicitly nowrap inline as an unbreakable sequence", () => {
	expect(
		fixture(
			'A<span style="white-space:nowrap">BCD</span>E',
			"overflow-wrap:anywhere",
			12,
		).lines(),
	).toEqual(["A", "BCD", "E"]);
});

it("uses common-ancestor white-space at inline boundaries", () => {
	expect(
		fixture(
			'A<span style="white-space:normal">BCDEF</span>G',
			"overflow-wrap:anywhere;white-space:nowrap",
			12,
		).lines(),
	).toEqual(["AB", "CD", "E", "FG"]);
});

it.each(["pre-wrap", "pre-line"])(
	"composes emergency wrapping with preserved %s breaks",
	(mode) => {
		expect(
			fixture(
				"ABCDEFG\nHI",
				`overflow-wrap:anywhere;white-space:${mode}`,
			).lines(),
		).toEqual(["ABCDE", "FG", "HI"]);
	},
);

it("preserves hanging pre-wrap spaces after a split word", () => {
	expect(
		fixture(
			"ABCDEFG  HI",
			"overflow-wrap:anywhere;white-space:pre-wrap",
		).lines(),
	).toEqual(["ABCDE", "FG  ", "HI"]);
});

it("moves inline opening edges with their following text when splitting", () => {
	const test = fixture('AB<span style="padding-left:6px">CD</span>EF');
	expect(test.lines()).toEqual(["ABCD", "EF"]);
	expect(test.context().lines.map((line) => line.width)).toEqual([30, 12]);
});

it("accounts for the final inline closing edge when packing the last group", () => {
	const test = fixture('<span style="padding-right:6px">ABCDEF</span>');
	expect(test.lines()).toEqual(["ABCDE", "F"]);
	expect(test.context().lines.map((line) => line.width)).toEqual([30, 12]);
});

it("exposes wrapped native link rectangles and corresponding point targets", () => {
	const test = fixture('<a id="link" href="/next">ABCDEFGHI</a>');
	const link = new DocumentQueries(test.tree).querySelector("#link");
	if (link === null) throw Error("Missing link");
	const rectangles = documentGeometry(test.tree).getClientRects(link);
	expect(rectangles.map((rectangle) => rectangle.width)).toEqual([30, 24]);
	for (const rectangle of rectangles)
		expect(
			documentHitTesting(test.tree).elementFromPoint(
				rectangle.x + 3,
				rectangle.y + rectangle.height / 2,
			),
		).toBe(link);
});

it("uses original text offsets for Range rectangles across emergency lines", () => {
	const test = fixture("ABCDEFGHI");
	const text = test.tree.get(test.id).children[0];
	const range = domRangeOwner(test.tree).createRange();
	range.setStart(text, 3);
	range.setEnd(text, 7);
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 18, y: 1, width: 12, height: 8 },
		{ x: 0, y: 11, width: 12, height: 8 },
	]);
});

it("retains bounded token, line and work rejection under emergency wrapping", () => {
	const test = fixture("ABCDEFGHI", "overflow-wrap:anywhere", 6);
	for (const options of [{ maxTokens: 3 }, { maxLines: 3 }, { maxWork: 40 }])
		expect(() => layoutDocumentText(test.tree, options)).toThrow(
			/limit exceeded/,
		);
	expect(test.lines()).toEqual(Array.from("ABCDEFGHI"));
});

it("matches an independent ASCII word-priority oracle across narrow widths", () => {
	for (const width of [0, 1, 6, 7, 12, 15, 18, 30]) {
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
			for (const policy of ["anywhere", "break-word"])
				expect(
					fixture(source, `overflow-wrap:${policy}`, width).lines(),
					`${policy}/${width}/${source}`,
				).toEqual(expected);
		}
	}
});
