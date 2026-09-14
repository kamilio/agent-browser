import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { rangeClientRects } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText, type TextContext } from "./text-layout.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	const failures: unknown[] = [];
	for (const tree of documents.splice(0)) {
		try {
			tree.close();
			expect(tree.nodeCount).toBe(0);
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length)
		throw new AggregateError(
			failures,
			"Hyphen boundary fixture cleanup failed",
		);
});

function fixture(content: string, css: string, width: number) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-family:'Agent Mono';font-size:8px;line-height:10px}main{width:${width}px;hyphens:manual;${css}}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/hyphen-emergency-boundaries",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	documentStyles(tree).setViewport(120, 160);
	const id = (selector = "#host") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	const context = () => {
		const found = layoutDocumentText(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id()),
		);
		if (!found) throw new Error("Missing hyphen boundary text context");
		return found;
	};
	const intrinsic = () => {
		const found = measureIntrinsicWidths(tree).widths.find(
			(entry) => entry.ref === tree.reference(id()),
		);
		if (!found) throw new Error("Missing hyphen boundary intrinsic widths");
		return found;
	};
	return { tree, id, context, intrinsic };
}

function paintedGlyphs(context: TextContext) {
	return context.glyphs.filter((glyph) => glyph.visible && glyph.advance > 0);
}

function expectLines(
	context: TextContext,
	expected: readonly (readonly [string, number, number])[],
) {
	expect(
		context.lines.map((line) => [
			context.glyphs
				.slice(line.glyphStart, line.glyphEnd)
				.filter((glyph) => glyph.visible && glyph.advance > 0)
				.map((glyph) => glyph.character)
				.join(""),
			line.width,
			line.overflow,
		]),
	).toEqual(expected);
}

it.each([
	["anywhere", 18],
	["break-word", 24],
] as const)(
	"retains manual hyphenation inside an overflow-wrap reset inherited from %s",
	(policy, minimum) => {
		const page = fixture(
			'<span id="inherited">A\u00adB<span id="reset" style="overflow-wrap:normal">cd\u00adef</span>G</span>',
			`overflow-wrap:${policy};word-break:normal`,
			24,
		);
		expect(documentStyles(page.tree).text(page.id("#inherited"))).toMatchObject(
			{
				"overflow-wrap": policy,
				"word-break": "normal",
				hyphens: "manual",
			},
		);
		expect(documentStyles(page.tree).text(page.id("#reset"))).toMatchObject({
			"overflow-wrap": "normal",
			"word-break": "normal",
			hyphens: "manual",
		});
		expect(page.intrinsic()).toMatchObject({
			minContent: minimum,
			maxContent: 42,
		});
		expectLines(page.context(), [
			["A-", 12, 0],
			["Bcd-", 24, 0],
			["efG", 18, 0],
		]);
		expect(page.tree.textContent(page.id())).toBe("A\u00adBcd\u00adefG");
	},
);

it("retains manual hyphenation inside a word-break reset without enabling overflow-wrap", () => {
	const page = fixture(
		'<span id="inherited">A\u00adB<span id="reset" style="word-break:normal">cd\u00adef</span>G</span>',
		"word-break:break-word;overflow-wrap:normal",
		24,
	);
	expect(documentStyles(page.tree).text(page.id("#inherited"))).toMatchObject({
		"word-break": "break-word",
		"overflow-wrap": "normal",
	});
	expect(documentStyles(page.tree).text(page.id("#reset"))).toMatchObject({
		"word-break": "normal",
		"overflow-wrap": "normal",
		hyphens: "manual",
	});
	expect(page.intrinsic()).toMatchObject({ minContent: 18, maxContent: 42 });
	expectLines(page.context(), [
		["A-", 12, 0],
		["Bcd-", 24, 0],
		["efG", 18, 0],
	]);
	expect(page.tree.textContent(page.id())).toBe("A\u00adBcd\u00adefG");
});

it("keeps both manual-only pieces around an emergency-enabled inline", () => {
	const page = fixture(
		'ab\u00adcd<span style="overflow-wrap:anywhere">EF</span>gh\u00adij',
		"overflow-wrap:normal;word-break:normal",
		42,
	);
	expect(page.intrinsic()).toMatchObject({ minContent: 18, maxContent: 60 });
	expectLines(page.context(), [
		["ab-", 18, 0],
		["cdEFgh-", 42, 0],
		["ij", 12, 0],
	]);
	expect(page.tree.textContent(page.id())).toBe("ab\u00adcdEFgh\u00adij");
});

it("preserves a cross-inline combining cluster and the separate discretionary marker source", () => {
	const content =
		'<span id="base">A</span><span id="accent">\u0301</span><span id="hint">\u00ad</span><span id="tail">BCD</span>';
	const page = fixture(content, "overflow-wrap:anywhere", 18);
	const context = page.context();
	expect(page.intrinsic()).toMatchObject({ minContent: 12, maxContent: 30 });
	expectLines(context, [
		["A\u0301-", 18, 0],
		["BCD", 18, 0],
	]);
	const base = page.tree.get(page.id("#base")).children[0];
	const accent = page.tree.get(page.id("#accent")).children[0];
	const hint = page.tree.get(page.id("#hint")).children[0];
	const tail = page.tree.get(page.id("#tail")).children[0];
	expect(
		paintedGlyphs(context).map((glyph) => [
			glyph.character,
			glyph.ref,
			glyph.offset,
			glyph.codeUnits,
		]),
	).toEqual([
		["A", page.tree.reference(base), 0, 1],
		["\u0301", page.tree.reference(accent), 0, 1],
		["-", page.tree.reference(hint), 0, 1],
		["B", page.tree.reference(tail), 0, 1],
		["C", page.tree.reference(tail), 1, 1],
		["D", page.tree.reference(tail), 2, 1],
	]);
	const range = domRangeOwner(page.tree).createRange();
	range.setStart(hint, 0);
	range.setEnd(hint, 1);
	expect(range.toString()).toBe("\u00ad");
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 12, y: 1, width: 6, height: 8 },
	]);
	const narrow = fixture(content, "overflow-wrap:anywhere", 6);
	expect(narrow.intrinsic()).toMatchObject({ minContent: 12, maxContent: 30 });
	expectLines(narrow.context(), [
		["A\u0301", 12, 6],
		["B", 6, 0],
		["C", 6, 0],
		["D", 6, 0],
	]);
	for (const current of [page, narrow])
		expect(current.tree.textContent(current.id())).toBe("A\u0301\u00adBCD");
});

it("keeps a cross-inline ZWJ sequence intact beside a soft hyphen at native fallback widths", () => {
	const page = fixture(
		'<span id="woman">\u{1f469}</span><span id="joiner">\u200d</span><span id="laptop">\u{1f4bb}</span><span id="tail">\u00adAB</span>',
		"word-break:break-word;overflow-wrap:normal",
		12,
	);
	const context = page.context();
	expect(page.intrinsic()).toMatchObject({ minContent: 18, maxContent: 30 });
	expectLines(context, [
		["\u{1f469}\u200d\u{1f4bb}", 18, 6],
		["AB", 12, 0],
	]);
	const woman = page.tree.get(page.id("#woman")).children[0];
	const joiner = page.tree.get(page.id("#joiner")).children[0];
	const laptop = page.tree.get(page.id("#laptop")).children[0];
	const tail = page.tree.get(page.id("#tail")).children[0];
	expect(
		paintedGlyphs(context).map((glyph) => [
			glyph.character,
			glyph.ref,
			glyph.offset,
			glyph.codeUnits,
		]),
	).toEqual([
		["\u{1f469}", page.tree.reference(woman), 0, 2],
		["\u200d", page.tree.reference(joiner), 0, 1],
		["\u{1f4bb}", page.tree.reference(laptop), 0, 2],
		["A", page.tree.reference(tail), 1, 1],
		["B", page.tree.reference(tail), 2, 1],
	]);
	expect(page.tree.textContent(page.id())).toBe(
		"\u{1f469}\u200d\u{1f4bb}\u00adAB",
	);
});

it("does not split uppercase expansion from one source unit beside a discretionary marker", () => {
	const page = fixture(
		"aß\u00adbc",
		"word-break:break-word;overflow-wrap:normal;text-transform:uppercase",
		6,
	);
	const context = page.context();
	expect(page.intrinsic()).toMatchObject({ minContent: 12, maxContent: 30 });
	expectLines(context, [
		["A", 6, 0],
		["SS", 12, 6],
		["B", 6, 0],
		["C", 6, 0],
	]);
	const text = page.tree.get(page.id()).children[0];
	expect(
		paintedGlyphs(context).map((glyph) => [
			glyph.character,
			glyph.offset,
			glyph.codeUnits,
		]),
	).toEqual([
		["A", 0, 1],
		["S", 1, 1],
		["S", 1, 1],
		["B", 3, 1],
		["C", 4, 1],
	]);
	expect(
		paintedGlyphs(context).every(
			(glyph) => glyph.ref === page.tree.reference(text),
		),
	).toBe(true);
	const range = domRangeOwner(page.tree).createRange();
	range.setStart(text, 1);
	range.setEnd(text, 2);
	expect(range.toString()).toBe("ß");
	expect(rangeClientRects(range)).toMatchObject([
		{ x: 0, y: 11, width: 12, height: 8 },
	]);
	expect(page.tree.textContent(page.id())).toBe("aß\u00adbc");
});

it.each(["pre-line", "pre-wrap"])(
	"honors a real %s newline and a nowrap island containing a soft hyphen",
	(mode) => {
		const page = fixture(
			'ab\u00adcd\nE<span style="white-space:nowrap">fg\u00adhi</span>J',
			`overflow-wrap:anywhere;white-space:${mode}`,
			18,
		);
		const context = page.context();
		expect(page.intrinsic()).toMatchObject({ minContent: 24, maxContent: 36 });
		expectLines(context, [
			["ab-", 18, 0],
			["cd", 12, 0],
			["E", 6, 0],
			["fghi", 24, 6],
			["J", 6, 0],
		]);
		expect(context.lines.map((line) => line.forcedBreak)).toEqual([
			false,
			true,
			false,
			false,
			false,
		]);
		const text = page.tree.get(page.id()).children[0];
		expect(context.lines[1].sourceBreak?.sources).toMatchObject([
			{ ref: page.tree.reference(text), offset: 5, codeUnits: 1 },
		]);
		expect(page.tree.textContent(page.id())).toBe("ab\u00adcd\nEfg\u00adhiJ");
	},
);
