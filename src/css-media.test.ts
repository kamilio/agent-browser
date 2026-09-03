import { afterEach, expect, it } from "vitest";
import { compileCssMedia, cssMediaLimits } from "./css-media.js";
import { cssMediaMatches } from "./css-parser.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentStyles } from "./styles.js";

const viewport = { width: 800, height: 600 };
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it.each([
	["(width > 799px)", true],
	["(width > 800px)", false],
	["(width >= 800px)", true],
	["(800px = width)", true],
	["(800px < width)", false],
	["(800px >= width)", true],
	["(799px < width <= 800px)", true],
	["(800px >= width > 799px)", true],
	["(800px < width < 900px)", false],
	["(801px <= width <= 900px)", false],
	["(height = 600px)", true],
	["(width > -1px)", true],
	["(width: -1px)", false],
	["not (width: -1px)", true],
	["(min-width: -1px)", true],
	["(max-height: -1px)", false],
	["(width)", true],
	["(height)", true],
	["(orientation)", true],
	["(aspect-ratio)", true],
	["(aspect-ratio: 4/3)", true],
	["(aspect-ratio = 4 / 3)", true],
	["(min-aspect-ratio: 4/3)", true],
	["(max-aspect-ratio: 1)", false],
	["(1 < aspect-ratio < 2)", true],
	["(aspect-ratio: 0)", false],
	["(resolution)", true],
	["(resolution: 1dppx)", true],
	["(resolution = 1x)", true],
	["(resolution: 96dpi)", true],
	["(resolution > 2dppx)", false],
	["(resolution < infinite)", true],
	["(resolution: infinite)", false],
	["(min-resolution: 0dpi)", true],
	["(resolution > -1dpi)", true],
	["(resolution < 40dpcm)", true],
])("evaluates numeric and Boolean feature %s", (query, expected) => {
	const compiled = compileCssMedia(query as string);
	expect(compiled.unsupported).toBe(false);
	expect(compiled.matches(viewport)).toBe(expected);
	const issues: string[] = [];
	expect(
		cssMediaMatches(query as string, viewport, (issue) => issues.push(issue)),
	).toBe(expected);
	expect(issues).toEqual([]);
});

it.each([
	"96px",
	"1in",
	"2.54cm",
	"25.4mm",
	"101.6q",
	"72pt",
	"6pc",
	"6em",
	"6rem",
	"9.6e1px",
	"+96px",
])("uses consistent CSS dimensions for %s", (value) => {
	const compiled = compileCssMedia(`(width: ${value})`);
	expect(compiled.unsupported).toBe(false);
	expect(compiled.matches({ width: 96, height: 40 })).toBe(true);
});

it.each([
	["(width > 900px) or (height = 600px)", true],
	["((width > 900px) or (height = 600px)) and (orientation: landscape)", true],
	["not ((width < 900px) and (height = 600px))", false],
	["not ((width > 900px) and (height = 600px))", true],
	["screen and ((width < 900px) or (height > 1000px))", true],
	["not screen and ((width < 900px) or (height > 1000px))", false],
	["print and (width > 0px), (width = 800px)", true],
	["only screen and (not (orientation: portrait))", true],
	["((width))", true],
	["(width > 900px) or (height > 900px)", false],
])("handles grouped media conditions %s", (query, expected) => {
	const compiled = compileCssMedia(query as string);
	expect(compiled.unsupported).toBe(false);
	expect(compiled.matches(viewport)).toBe(expected);
});

it.each([
	"(1px < width > 2px)",
	"(1px = width = 2px)",
	"(width == 800px)",
	"(width != 800px)",
	"(width <= = 800px)",
	"(width: 1e999px)",
	"(aspect-ratio: 1/0)",
	"(aspect-ratio: -1/2)",
	"(aspect-ratio: 0/0)",
	"(orientation > portrait)",
	"(orientation: upside-down)",
	"(min-width > 20px)",
	"(width > height)",
	"(width: 800)",
	"(width > 1vw)",
	"(resolution: 1px)",
	"(width) or (height) and (orientation)",
	"not (width) and (height)",
	"screen and (width) or (height)",
	"only (width)",
	"(width) and",
	"(width) and(height)",
	"(width: calc(10px + 20px))",
	"not (unknown: value)",
	"((width > 10px)",
])("rejects unsupported/malformed syntax conservatively: %s", (query) => {
	const compiled = compileCssMedia(query);
	expect(compiled.unsupported).toBe(true);
	expect(compiled.matches(viewport)).toBe(false);
	expect(compiled.media).toBe("not all");
});

it("shares one compiled predicate across viewport changes without reparsing or mutating its public record", () => {
	const compiled = compileCssMedia(
		"(0px < width <= 48px) and ((orientation: portrait) or (height = 1px))",
	);
	expect(Object.isFrozen(compiled)).toBe(true);
	const conditions = compiled.conditions;
	let matched = 0;
	for (let index = 0; index < 10000; index++) {
		if (compiled.matches({ width: index % 2 === 0 ? 40 : 80, height: 80 }))
			matched++;
	}
	expect(matched).toBe(5000);
	expect(compiled.conditions).toBe(conditions);
	expect(compiled.media).toContain("0px < width <= 48px");
});

it("preserves list alternatives while explicitly retaining unsupported branches", () => {
	const compiled = compileCssMedia(
		" print, (unknown: yes), screen and (width >= 800px) ",
	);
	expect(compiled.media).toBe("print, not all, screen and (width >= 800px)");
	expect(compiled.unsupported).toBe(true);
	expect(compiled.matches(viewport)).toBe(true);
	expect(compileCssMedia(",").matches(viewport)).toBe(false);
	expect(compileCssMedia("/* comment */").matches(viewport)).toBe(true);
	expect(
		compileCssMedia("SCREEN and ( WIDTH >= 8e2PX ) /* tail").matches(viewport),
	).toBe(true);
});

it("rejects oversized, excessively nested and oversized condition graphs before unbounded work", () => {
	expect(() =>
		compileCssMedia("x".repeat(cssMediaLimits.maxCodeUnits + 1)),
	).toThrow("source limit");
	const nested = `${"(".repeat(cssMediaLimits.maxDepth + 1)}width${")".repeat(cssMediaLimits.maxDepth + 1)}`;
	expect(() => compileCssMedia(nested)).toThrow("nesting limit");
	expect(() =>
		compileCssMedia(
			Array.from(
				{ length: cssMediaLimits.maxConditions + 1 },
				() => "(width)",
			).join(" or "),
		),
	).toThrow("condition limit");
	expect(() =>
		compileCssMedia(
			Array.from(
				{ length: cssMediaLimits.maxConditions + 1 },
				() => "screen",
			).join(","),
		),
	).toThrow("condition limit");
	expect(
		compileCssMedia(
			`${"(".repeat(cssMediaLimits.maxDepth)}width${")".repeat(cssMediaLimits.maxDepth)}`,
		).matches(viewport),
	).toBe(true);
});

it("keeps commas inside unsupported quoted, escaped and bracketed tokens out of the outer list", () => {
	for (const source of [
		'"foo, screen, bar"',
		"[bad, screen, bad]",
		"foo\\, screen",
		'"/*, screen, */"',
		"(unknown: [a, screen, b])",
	])
		expect(compileCssMedia(source).matches(viewport)).toBe(false);
	const retained = compileCssMedia('"/*", screen');
	expect(retained.media).toBe("not all, screen");
	expect(retained.unsupported).toBe(true);
	expect(retained.matches(viewport)).toBe(true);
	expect(compileCssMedia("(width > 1px), [screen]").matches(viewport)).toBe(
		true,
	);
	expect(compileCssMedia('screen, "unterminated').matches(viewport)).toBe(
		false,
	);
});

it("selects actual native CSS paint with chained comparisons, nested alternatives and ratios", () => {
	const tree = parseHtmlDocument(
		"<style>main{font-size:8px;height:8px;background:red}@media (0px < width <= 48px) and ((aspect-ratio < 1) or (resolution > 2dppx)){main{background:blue}}</style><main>A</main>",
		"https://fixture.invalid/media-ranges",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(80, 40);
	expect(Array.from(rasterizeDocument(tree).image.pixels.slice(0, 4))).toEqual([
		255, 0, 0, 255,
	]);
	styles.setViewport(40, 80);
	expect(Array.from(rasterizeDocument(tree).image.pixels.slice(0, 4))).toEqual([
		0, 0, 255, 255,
	]);
	expect(styles.metrics().issues).toEqual({});
});
