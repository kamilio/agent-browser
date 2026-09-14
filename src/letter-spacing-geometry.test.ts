import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { rangeBoundingClientRect } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(spacing = "4px", content = "ABC", css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-family:'Agent Mono';font-size:8px;line-height:8px;background:white;color:black}main{width:100px;letter-spacing:${spacing}}a{color:black;text-decoration:none}${css}</style><main id="host"><a id="target" href="/next">${content}</a></main>`,
		"https://fixture.invalid/letter-spacing",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(120, 40);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const context = () => {
		const found = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id("#host")),
		);
		if (!found) throw new Error("Missing letter-spacing text context");
		return found;
	};
	return {
		tree,
		id,
		context,
		rect: () => documentGeometry(tree).getBoundingClientRect(id()),
	};
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it.each([
	["normal", 18, [0, 6, 12]],
	["0", 18, [0, 6, 12]],
	["4px", 26, [0, 10, 20]],
	[".5em", 26, [0, 10, 20]],
	[".5rem", 26, [0, 10, 20]],
] as const)(
	"uses real glyph locations and link rectangles for %s",
	(spacing, width, positions) => {
		const page = fixture(spacing);
		expect(page.context().lines.map((line) => line.width)).toEqual([width]);
		expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual(positions);
		expect(page.rect()).toMatchObject({ x: 0, y: 0, width, height: 8 });
		expect(documentHitTesting(page.tree).elementFromPoint(width - 1, 4)).toBe(
			page.id(),
		);
		expect(documentHitTesting(page.tree).elementFromPoint(width + 1, 4)).toBe(
			page.id("#host"),
		);
	},
);

it("moves painted glyphs without stretching their bitmap cells", () => {
	const baseline = rasterizeDocument(fixture("0").tree).image;
	const spaced = rasterizeDocument(fixture().tree).image;
	for (const index of [0, 1, 2]) {
		for (let row = 0; row < 8; row++) {
			for (let column = 0; column < 6; column++) {
				expect(pixel(spaced, index * 10 + column, row)).toEqual(
					pixel(baseline, index * 6 + column, row),
				);
			}
		}
	}
	for (const column of [6, 7, 8, 9, 16, 17, 18, 19, 26])
		for (let row = 0; row < 8; row++)
			expect(pixel(spaced, column, row)).toEqual([255, 255, 255, 255]);
});

it("does not lose spacing at text-node or generated-content boundaries", () => {
	const joined = fixture();
	const split = fixture("4px", "A<span>B</span>C");
	const generated = fixture("4px", "BC", '#target::before{content:"A"}');
	for (const page of [split, generated]) {
		expect(page.context().lines.map((line) => line.width)).toEqual([26]);
		expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([0, 10, 20]);
		expect(page.rect()).toEqual(joined.rect());
		expect(rasterizeDocument(page.tree).image.pixels).toEqual(
			rasterizeDocument(joined.tree).image.pixels,
		);
	}
});

it("wraps using spaced advances and removes spacing at both line edges", () => {
	const baseline = fixture("0", "AA AA", "main{width:36px}");
	const spaced = fixture("4px", "AA AA", "main{width:36px}");
	const wrapped = spaced.context();
	expect(baseline.context().lines).toHaveLength(1);
	expect(wrapped.lines.map((line) => line.width)).toEqual([16, 16]);
	for (const line of wrapped.lines)
		expect(
			wrapped.glyphs
				.slice(line.glyphStart, line.glyphEnd)
				.filter((glyph) => glyph.visible)
				.map((glyph) => glyph.x),
		).toEqual([0, 10]);
	expect(spaced.rect()).toMatchObject({ width: 16, height: 16 });
});

it("invalidates inherited variable spacing, raster and hit ownership together", () => {
	const page = fixture("var(--tracking)", "ABC", "main{--tracking:0px}");
	const geometry = documentGeometry(page.tree);
	const hits = documentHitTesting(page.tree);
	expect(geometry.getBoundingClientRect(page.id()).width).toBe(18);
	expect(hits.elementFromPoint(24, 4)).toBe(page.id("#host"));
	const before = rasterizeDocument(page.tree).image;
	page.tree.setAttribute(page.id("#host"), "style", "--tracking:4px");
	expect(geometry.getBoundingClientRect(page.id()).width).toBe(26);
	expect(hits.elementFromPoint(24, 4)).toBe(page.id());
	expect(page.context().glyphs.map((glyph) => glyph.x)).toEqual([0, 10, 20]);
	expect(rasterizeDocument(page.tree).image.pixels).not.toEqual(before.pixels);
	page.tree.setAttribute(page.id("#host"), "style", "letter-spacing:normal");
	expect(geometry.getBoundingClientRect(page.id()).width).toBe(18);
	expect(hits.elementFromPoint(24, 4)).toBe(page.id("#host"));
	expect(rasterizeDocument(page.tree).image.pixels).toEqual(before.pixels);
});

it("keeps whole-text ranges and inline geometry on the same advances", () => {
	const page = fixture();
	const text = page.tree.get(page.id()).children[0];
	const range = domRangeOwner(page.tree).createRange();
	range.setStart(text, 0);
	range.setEnd(text, 3);
	expect(rangeBoundingClientRect(range)).toMatchObject({
		x: 0,
		y: 0,
		width: 26,
		height: 8,
	});
	page.tree.setAttribute(page.id("#host"), "style", "letter-spacing:8px");
	expect(rangeBoundingClientRect(range)).toMatchObject({ width: 34 });
	expect(page.rect().width).toBe(34);
});

it("shares line-edge spacing with min-content and max-content measurement", () => {
	const page = fixture("4px", "AA AAA", "main{width:auto}");
	const measurements = measureIntrinsicWidths(page.tree);
	const host = measurements.widths.find(
		(entry) => entry.ref === page.tree.reference(page.id("#host")),
	);
	expect(host).toMatchObject({ minContent: 26, maxContent: 56 });
});
