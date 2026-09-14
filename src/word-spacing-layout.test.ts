import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { rangeBoundingClientRect } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { wordSpacingAdvance } from "./word-spacing.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(
	spacing = "4px",
	content = "A B",
	css = "",
	doctype = "<!doctype html>",
) {
	const tree = parseHtmlDocument(
		`${doctype}<style>html,body{margin:0;padding:0;font-family:'Agent Mono';font-size:8px;line-height:8px;background:white;color:black}main{width:100px;word-spacing:${spacing}}a{color:black;text-decoration:none}${css}</style><main id="host"><a id="target" href="/next">${content}</a></main>`,
		"https://fixture.invalid/word-spacing",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(120, 64);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const context = () => {
		const found = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id("#host")),
		);
		if (!found) throw new Error("Missing word-spacing context");
		return found;
	};
	return { tree, id, context };
}

it.each([
	["normal", 0],
	["0", 0],
	["4px", 4],
	["-4px", -4],
	["-6px", -6],
	[".5em", 4],
	["-.5rem", -4],
] as const)("uses real separator advances for %s", (spacing, extra) => {
	const page = fixture(spacing);
	expect(page.context().lines.map((line) => line.width)).toEqual([18 + extra]);
	expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([
		0,
		6,
		12 + extra,
	]);
	expect(page.context().glyphs.map((glyph) => glyph.advance)).toEqual([
		6,
		6 + extra,
		6,
	]);
	expect(
		documentGeometry(page.tree).getBoundingClientRect(page.id()),
	).toMatchObject({
		x: 0,
		y: 0,
		width: 18 + extra,
		height: 8,
	});
});

it.each([" ", "\t", "\n", "\r\n", "\f", " \t\n  "])(
	"spaces one collapsed separator from %j",
	(separator) => {
		const page = fixture("-4px", `A${separator}B`);
		expect(page.context().glyphs.map((glyph) => glyph.character)).toEqual([
			"A",
			" ",
			"B",
		]);
		expect(page.context().lines[0].width).toBe(14);
	},
);

it.each([" ", "\u00a0"])(
	"spaces repeated preserved %j separators",
	(separator) => {
		const page = fixture(
			"-4px",
			`A${separator}${separator}B`,
			"main{white-space:pre}",
		);
		expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([
			0, 6, 8, 10,
		]);
		expect(page.context().lines[0].width).toBe(16);
	},
);

it("preserves tabs and hard breaks without word spacing", () => {
	const tabs = fixture("4px", "A\tB", "main{white-space:pre}");
	expect(tabs.context().glyphs.map((glyph) => glyph.x)).toEqual([0, 6, 48]);
	const lines = fixture("4px", "A\nB", "main{white-space:pre-line}");
	expect(lines.context().lines.map((line) => line.width)).toEqual([6, 6]);
});

it("retains word spacing on preserved trailing and nonbreaking spaces", () => {
	const preserved = fixture("4px", "A ", "main{white-space:pre}");
	expect(preserved.context().lines[0].width).toBe(16);
	const nonbreaking = fixture("4px", "A\u00a0");
	expect(nonbreaking.context().lines[0].width).toBe(16);
});

it("does not turn nonbreaking spaces into wrap opportunities", () => {
	const page = fixture("4px", "A\u00a0B", "main{width:18px}");
	expect(page.context().lines).toHaveLength(1);
	expect(page.context().lines[0].width).toBe(22);
});

it("trims collapsed line-edge whitespace without leaving spacing", () => {
	const page = fixture("4px", " \n A B \t");
	expect(page.context().lines[0].width).toBe(22);
	expect(page.context().glyphs.map((glyph) => glyph.character)).toEqual([
		"A",
		" ",
		"B",
	]);
});

it.each(["A<span> </span>B", 'B<span style="display:none"> </span> C'])(
	"keeps inherited spacing across native inline boundaries: %s",
	(content) => {
		const page = fixture("-4px", content);
		expect(page.context().lines[0].width).toBe(14);
	},
);

it("uses the retained collapsed separator's own computed spacing", () => {
	const zero = fixture("4px", 'A<span style="word-spacing:0"> </span>B');
	expect(zero.context().lines[0].width).toBe(18);
	const collapsed = fixture("4px", 'A <span style="word-spacing:0"> </span>B');
	expect(collapsed.context().lines[0].width).toBe(22);
});

it.each([
	["4px", 40],
	["-4px", 24],
] as const)(
	"uses %s spacing between actual atomic inline boxes",
	(spacing, width) => {
		const page = fixture(
			spacing,
			'A <i style="display:inline-block;width:8px;height:8px"></i> B',
		);
		expect(page.context().lines[0].width).toBe(width);
		expect(
			buildFormattingTree(page.tree).issues[
				"letter-spacing-atomic-boundary-not-supported"
			],
		).toBeUndefined();
	},
);

it("includes generated text in real separator measurement", () => {
	const page = fixture("-4px", "B", '#target::before{content:"A "}');
	expect(page.context().lines[0].width).toBe(14);
	expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([0, 6, 8]);
});

it("combines letter and word spacing without trimming word spacing", () => {
	const page = fixture("-4px", "A B", "main{letter-spacing:2px}");
	expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([0, 8, 12]);
	expect(page.context().lines[0].width).toBe(18);
	const trailing = fixture("4px", "A\u00a0", "main{letter-spacing:2px}");
	expect(trailing.context().lines[0].width).toBe(18);
});

it("wraps using changed separator advances rather than character count", () => {
	const expanded = fixture("4px", "A B", "main{width:18px}");
	expect(expanded.context().lines.map((line) => line.width)).toEqual([6, 6]);
	const contracted = fixture("-4px", "A B", "main{width:14px}");
	expect(contracted.context().lines.map((line) => line.width)).toEqual([14]);
});

it("shares word spacing with intrinsic min/max content widths", () => {
	const page = fixture("-4px", "AA BBB", "main{width:auto}");
	const host = measureIntrinsicWidths(page.tree).widths.find(
		(entry) => entry.ref === page.tree.reference(page.id("#host")),
	);
	expect(host).toMatchObject({ minContent: 18, maxContent: 32 });
});

it("keeps range, hit and inline geometry on the same contracted cells", () => {
	const page = fixture("-4px");
	const text = page.tree.get(page.id()).children[0];
	const range = domRangeOwner(page.tree).createRange();
	range.setStart(text, 1);
	range.setEnd(text, 2);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 6,
		width: 2,
		height: 8,
	});
	const hits = documentHitTesting(page.tree);
	expect(hits.elementFromPoint(13, 4)).toBe(page.id());
	expect(hits.elementFromPoint(15, 4)).toBe(page.id("#host"));
	page.tree.setAttribute(page.id("#host"), "style", "word-spacing:4px");
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 6,
		width: 10,
		height: 8,
	});
	expect(
		documentGeometry(page.tree).getBoundingClientRect(page.id()).width,
	).toBe(22);
	expect(hits.elementFromPoint(21, 4)).toBe(page.id());
});

it.each([
	["4px", 16],
	["-4px", 8],
] as const)(
	"moves painted glyphs with %s without stretching them",
	(spacing, start) => {
		const baseline = rasterizeDocument(fixture("0").tree).image;
		const changed = rasterizeDocument(fixture(spacing).tree).image;
		for (let row = 0; row < 8; row++) {
			for (let column = 0; column < 6; column++) {
				const before = (row * baseline.width + 12 + column) * 4;
				const after = (row * changed.width + start + column) * 4;
				expect([...changed.pixels.slice(after, after + 4)]).toEqual([
					...baseline.pixels.slice(before, before + 4),
				]);
			}
		}
	},
);

it.each(["-7px", "-100px"])(
	"rejects backwards %s separator cells explicitly",
	(spacing) => {
		expect(() => layoutDocument(fixture(spacing).tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(fixture(spacing, "AB").context().lines[0].width).toBe(12);
	},
);

it("keeps the independent numeric-marker profile explicit", () => {
	const marker = fixture(
		"-4px",
		'<ol><li style="display:list-item">A B</li></ol>',
	);
	expect(
		buildFormattingTree(marker.tree).issues[
			"word-spacing-marker-text-not-supported"
		],
	).toBeGreaterThan(0);
	expect(() => layoutDocument(marker.tree)).toThrow();
});

it("keeps the independent quirks image-alternative profile explicit", () => {
	const page = fixture("-4px", '<img alt="A B" width="40">', "", "");
	expect(
		buildFormattingTree(page.tree).issues[
			"word-spacing-image-alternative-not-supported"
		],
	).toBeGreaterThan(0);
	expect(() => layoutDocument(page.tree)).toThrow();
	page.tree.setAttribute(page.id("#host"), "style", "word-spacing:0");
	expect(
		buildFormattingTree(page.tree).issues[
			"word-spacing-image-alternative-not-supported"
		],
	).toBeUndefined();
});

it.each(["A", "\t", "\n", "\u2003", "\u200b", "\u3000"])(
	"does not apply separator spacing to %j",
	(character) => expect(wordSpacingAdvance(character, 6, -4)).toBe(6),
);

it("enforces numeric bounds without adding spacing to zero-advance separators", () => {
	expect(wordSpacingAdvance(" ", 6, -6)).toBe(0);
	expect(() => wordSpacingAdvance(" ", 6, -7)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(wordSpacingAdvance(" ", 0, 4)).toBe(0);
	expect(wordSpacingAdvance("\u00a0", 0, -4)).toBe(0);
	expect(() => wordSpacingAdvance(" ", 6, Number.POSITIVE_INFINITY)).toThrow();
	expect(() => wordSpacingAdvance(" ", 6, 16777216)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("does not create a gap from a zero-font separator", () => {
	const page = fixture("4px", 'A<span style="font-size:0"> </span>B');
	expect(page.context().lines[0].width).toBe(12);
	expect(page.context().glyphs.map((glyph) => glyph.advance)).toEqual([
		6, 0, 6,
	]);
});

it("justifies natural separators even when word spacing contracts them to zero", () => {
	const page = fixture(
		"-6px",
		"a b c d",
		"main{width:20px;text-align:justify}",
	);
	expect(page.context().lines.map((line) => line.width)).toEqual([20, 6]);
	expect(
		page
			.context()
			.glyphs.slice(0, 5)
			.map((glyph) => glyph.advance),
	).toEqual([6, 1, 6, 1, 6]);
});

it("does not justify intrinsically zero-advance separators", () => {
	const page = fixture(
		"4px",
		'a<span style="font-size:0"> </span>b<span style="font-size:0"> </span>c d',
		"main{width:20px;text-align:justify}",
	);
	expect(page.context().lines.map((line) => line.width)).toEqual([18, 6]);
	expect(
		page
			.context()
			.glyphs.slice(0, 5)
			.map((glyph) => glyph.advance),
	).toEqual([6, 0, 6, 0, 6]);
});

it("preserves justification of zero-font spaces carrying letter spacing", () => {
	const page = fixture(
		"normal",
		'a<span style="font-size:0"> </span>b<span style="font-size:0"> </span>c d',
		"main{width:30px;text-align:justify;letter-spacing:2px}",
	);
	expect(page.context().lines.map((line) => line.width)).toEqual([30, 6]);
});

it.each(["\u1361", "\u{10100}", "\u{10101}", "\u{1039f}", "\u{1091f}"])(
	"keeps non-native separator %j spacing explicitly unsupported",
	(character) => {
		expect(() => wordSpacingAdvance(character, 6, 4)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(wordSpacingAdvance(character, 6, 0)).toBe(6);
		expect(wordSpacingAdvance(character, 0, 4)).toBe(0);
	},
);
