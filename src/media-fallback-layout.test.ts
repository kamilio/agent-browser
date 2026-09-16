import { afterEach, expect, it, vi } from "vitest";
import { compileCssMedia } from "./css-media.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import {
	type FormattingTree,
	buildFormattingTree,
	resolveDocumentBlockWidths,
	resolveFormattingPageWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	measureFormattingIntrinsicWidths,
	measureIntrinsicWidths,
} from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const advisory = "css:unimplemented-or-invalid-media-query";
const unknown = "(custom-feature: yes)";
const override = "main{width:12px;background:blue}";
const documents: DocumentTree[] = [];
const queries: DocumentQueries[] = [];

afterEach(() => {
	for (const query of queries.splice(0)) query.close();
	for (const tree of documents.splice(0)) tree.close();
	vi.restoreAllMocks();
});

function fixture(css = "", markup = '<main id="target">ab cd</main>') {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px}main{width:24px;height:16px;background:red}${css}</style>${markup}`,
		"https://fixture.invalid/media-fallback",
	);
	documents.push(tree);
	const query = new DocumentQueries(tree);
	queries.push(query);
	const target = query.querySelector("#target");
	if (target === null) throw new Error("Missing target fixture");
	const styles = documentStyles(tree);
	styles.setViewport(32, 24);
	return { tree, styles, target };
}

function geometry(layout: DocumentLayout) {
	return {
		flowHeight: layout.flowHeight,
		boxes: layout.boxes.map((box) => ({
			borderX: box.borderX,
			borderY: box.borderY,
			contentX: box.contentX,
			contentY: box.contentY,
			contentWidth: box.contentWidth,
			contentHeight: box.contentHeight,
			borderBoxWidth: box.borderBoxWidth,
			borderBoxHeight: box.borderBoxHeight,
		})),
		glyphs: layout.contexts.map((context) =>
			context.glyphs.map((glyph) => [glyph.x, glyph.y]),
		),
	};
}

function intrinsic(tree: DocumentTree) {
	return measureIntrinsicWidths(tree).widths.map((width) => ({
		minContent: width.minContent,
		maxContent: width.maxContent,
		minContribution: width.minContribution,
		maxContribution: width.maxContribution,
	}));
}

function expectEquivalent(candidate: DocumentTree, clean: DocumentTree) {
	expect(geometry(layoutDocument(candidate))).toEqual(
		geometry(layoutDocument(clean)),
	);
	const options = { clip: { x: 0, y: 0, width: 32, height: 24 } };
	const actual = rasterizeDocument(candidate, options);
	const expected = rasterizeDocument(clean, options);
	expect(actual.image.width).toBe(32);
	expect(actual.image.height).toBe(24);
	expect(actual.image.pixels).toEqual(expected.image.pixels);
}

function expectAdvisory(test: ReturnType<typeof fixture>) {
	expect(
		test.styles.metrics().issues["unimplemented-or-invalid-media-query"],
	).toBeGreaterThan(0);
	expect(buildFormattingTree(test.tree).issues[advisory]).toBeGreaterThan(0);
}

it.each([
	{ query: "(color-gamut: srgb)", matches: false },
	{ query: "(device-width: 32px)", matches: false },
	{ query: unknown, matches: false },
	{ query: "(width == 32px)", matches: false },
	{ query: `not ${unknown}`, matches: false },
	{ query: `${unknown}, (min-width: 1px)`, matches: true },
	{ query: `${unknown}, (min-width: 64px)`, matches: false },
	{ query: `(${unknown} or (width: 32px))`, matches: true },
	{
		query: "(color-gamut: srgb), ((width >= 32px) and (height: 24px))",
		matches: true,
	},
])(
	"uses equivalent clean fallback geometry, raster and intrinsic widths for $query",
	({ query, matches }) => {
		const candidate = fixture(`@media ${query}{${override}}`);
		const clean = fixture(matches ? override : "");
		const compiled = compileCssMedia(query);
		expect(compiled.unsupported).toBe(true);
		expect(compiled.matches(candidate.styles.viewport)).toBe(matches);
		expectEquivalent(candidate.tree, clean.tree);
		expect(intrinsic(candidate.tree)).toEqual(intrinsic(clean.tree));
		expect(candidate.styles.box(candidate.target).width).toBe(
			matches ? "12px" : "24px",
		);
		expectAdvisory(candidate);
		expect(clean.styles.metrics().issues).toEqual({});
		const widths = resolveDocumentBlockWidths(candidate.tree);
		expect(widths.formatting.issues[advisory]).toBeGreaterThan(0);
		expect(Object.isFrozen(widths.formatting.issues)).toBe(true);
	},
);

it("retains nested at-rule diagnostics without applying unsupported child rules", () => {
	const candidate = fixture(
		`@media (min-width: 1px){@media ${unknown}{${override}}}`,
	);
	const clean = fixture();
	expectEquivalent(candidate.tree, clean.tree);
	expect(intrinsic(candidate.tree)).toEqual(intrinsic(clean.tree));
	expectAdvisory(candidate);
});

it.each([
	{ path: "block", css: "", positioned: false },
	{
		path: "inline-block",
		css: "main{display:inline-block}",
		positioned: false,
	},
	{ path: "flex", css: "main{display:flex}span{width:6px}", positioned: false },
	{
		path: "absolute",
		css: "main{position:absolute;left:2px;top:3px}",
		positioned: true,
	},
	{
		path: "fixed",
		css: "main{position:fixed;left:2px;top:3px}",
		positioned: true,
	},
])(
	"preserves existing $path coordination with an advisory media issue",
	({ css, positioned }) => {
		const markup = '<main id="target"><span>ab</span><span>cd</span></main>';
		const candidate = fixture(`${css}@media ${unknown}{${override}}`, markup);
		const clean = fixture(css, markup);
		expectEquivalent(candidate.tree, clean.tree);
		expectAdvisory(candidate);
		if (positioned) {
			for (const tree of [candidate.tree, clean.tree]) {
				expect(() => measureIntrinsicWidths(tree)).toThrow(
					expect.objectContaining({ code: "unsupported" }),
				);
				expect(() => resolveDocumentBlockWidths(tree)).toThrow(
					expect.objectContaining({ code: "unsupported" }),
				);
				expect(
					buildFormattingTree(tree).issues[
						"positioned-layout-requires-coordination"
					],
				).toBe(1);
			}
		} else expect(intrinsic(candidate.tree)).toEqual(intrinsic(clean.tree));
	},
);

it("updates valid width alternatives on resize while retaining advisory evidence", () => {
	const candidate = fixture(
		`@media ${unknown}, (min-width: 40px){${override}}`,
	);
	const clean = fixture(`@media (min-width: 40px){${override}}`);
	for (const width of [32, 48, 24]) {
		candidate.styles.setViewport(width, 24);
		clean.styles.setViewport(width, 24);
		expectEquivalent(candidate.tree, clean.tree);
		expect(intrinsic(candidate.tree)).toEqual(intrinsic(clean.tree));
		expect(candidate.styles.box(candidate.target).width).toBe(
			width >= 40 ? "12px" : "24px",
		);
		expectAdvisory(candidate);
		expect(clean.styles.metrics().issues).toEqual({});
	}
});

it.each([
	{
		name: "unrelated CSS property",
		css: "main{transform:rotate(1deg)}",
		markup: '<main id="target">ab</main>',
		issue: "css:unimplemented-css-property",
	},
	{
		name: "invalid CSS value",
		css: "main{width:not-a-length}",
		markup: '<main id="target">ab</main>',
		issue: "css:unimplemented-or-invalid-css-value",
	},
	{
		name: "unsupported table-cell alignment",
		css: "main{display:table-cell;align-content:center}",
		markup: '<main id="target">ab</main>',
		issue: "block-content-alignment-not-supported",
	},
	{
		name: "unsupported relative legend",
		css: "",
		markup:
			'<fieldset id="target"><legend style="position:relative;top:2px">Label</legend>ab</fieldset>',
		issue: "fieldset-legend-layout-not-supported",
	},
	{
		name: "malformed stylesheet",
		css: "main{background:blue",
		markup: '<main id="target">ab</main>',
		issue: "css:unterminated-css-rule",
	},
])(
	"does not admit a real $name alongside advisory media",
	({ css, markup, issue }) => {
		const candidate = fixture(`@media ${unknown}{${override}}${css}`, markup);
		const formatting = buildFormattingTree(candidate.tree);
		expect(formatting.issues[advisory]).toBeGreaterThan(0);
		expect(formatting.issues[issue]).toBeGreaterThan(0);
		for (const operation of [
			() => resolveDocumentBlockWidths(candidate.tree),
			() => measureIntrinsicWidths(candidate.tree),
			() => layoutDocument(candidate.tree),
			() =>
				rasterizeDocument(candidate.tree, {
					clip: { x: 0, y: 0, width: 8, height: 8 },
				}),
		])
			expect(operation).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
	},
);

function withIssues(
	formatting: FormattingTree,
	issues: Record<string, number>,
): FormattingTree {
	return Object.freeze({ ...formatting, issues: Object.freeze(issues) });
}

it("admits only the exact advisory diagnostic through existing page and intrinsic entrypoints", () => {
	const clean = buildFormattingTree(fixture().tree);
	const advisoryOnly = withIssues(clean, { [advisory]: 1 });
	expect(resolveFormattingPageWidths(advisoryOnly).widths).toEqual(
		resolveFormattingPageWidths(clean).widths,
	);
	expect(measureFormattingIntrinsicWidths(advisoryOnly).widths).toEqual(
		measureFormattingIntrinsicWidths(clean).widths,
	);
	for (const code of [
		"unimplemented-or-invalid-media-query",
		` ${advisory}`,
		`${advisory} `,
		`${advisory}:extra`,
		`other:${advisory}`,
		advisory.toUpperCase(),
		"css:unimplemented-css-property",
		"css:unimplemented-or-invalid-css-rule",
		"display-layout-not-supported",
		"positioned-layout-requires-coordination",
		"",
	]) {
		const formatting = withIssues(clean, { [code]: 1 });
		expect(() => resolveFormattingPageWidths(formatting)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => measureFormattingIntrinsicWidths(formatting)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	}
});

it("admits direct formatting snapshots with only advisory issues without removing them", () => {
	const clean = buildFormattingTree(fixture().tree);
	const formatting = withIssues(clean, { [advisory]: 3 });
	const savedIssues = formatting.issues;
	const actual = resolveFormattingPageWidths(formatting);
	expect(actual.widths).toEqual(resolveFormattingPageWidths(clean).widths);
	expect(measureFormattingIntrinsicWidths(formatting).widths).toEqual(
		measureFormattingIntrinsicWidths(clean).widths,
	);
	expect(actual.formatting).toBe(formatting);
	expect(actual.formatting.issues).toBe(savedIssues);
	expect(savedIssues).toEqual({ [advisory]: 3 });
});

it.each([
	"css:unimplemented-css-property",
	"css:unterminated-css-rule",
	"positioned-layout-requires-coordination",
	`${advisory}:extra`,
])("keeps direct mixed formatting issue %s blocking", (issue) => {
	const formatting = withIssues(buildFormattingTree(fixture().tree), {
		[advisory]: 1,
		[issue]: 1,
	});
	const coordinate = vi.fn();
	expect(() => resolveFormattingPageWidths(formatting)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() =>
		resolveFormattingPageWidths(formatting, undefined, coordinate),
	).toThrow(expect.objectContaining({ code: "unsupported" }));
	expect(() => measureFormattingIntrinsicWidths(formatting)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(coordinate).not.toHaveBeenCalled();
	expect(formatting.issues).toEqual({ [advisory]: 1, [issue]: 1 });
});

it.each([1, 2])(
	"requires exact coordination for %s deferred flex containers alongside advisory media",
	(count) => {
		const markup = `<main id="target">${'<section style="display:flex"><span>ab</span></section>'.repeat(count)}</main>`;
		const clean = buildFormattingTree(fixture("", markup).tree);
		expect(clean.issues).toEqual({ "display-layout-not-supported": count });
		const formatting = withIssues(clean, { ...clean.issues, [advisory]: 1 });
		expect(() => resolveFormattingPageWidths(formatting)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		const coordinate = vi.fn();
		const result = resolveFormattingPageWidths(
			formatting,
			undefined,
			coordinate,
		);
		expect(coordinate).toHaveBeenCalledTimes(count);
		expect(result.formatting.issues).toEqual({
			"display-layout-not-supported": count,
			[advisory]: 1,
		});
		expect(measureFormattingIntrinsicWidths(formatting).widths).toEqual(
			measureFormattingIntrinsicWidths(clean).widths,
		);
		for (const invalidCount of [count - 1, count + 1]) {
			const invalid = withIssues(formatting, {
				[advisory]: 1,
				"display-layout-not-supported": invalidCount,
			});
			coordinate.mockClear();
			expect(() =>
				resolveFormattingPageWidths(invalid, undefined, coordinate),
			).toThrow(expect.objectContaining({ code: "unsupported" }));
			expect(() => measureFormattingIntrinsicWidths(invalid)).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
			expect(coordinate).not.toHaveBeenCalled();
		}
	},
);

it("retains width and intrinsic resource guards after advisory admission", () => {
	const test = fixture(`@media ${unknown}{${override}}`);
	const formatting = buildFormattingTree(test.tree);
	expect(() => resolveFormattingPageWidths(formatting, 1)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() =>
		measureFormattingIntrinsicWidths(formatting, { maxWork: 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expectAdvisory(test);
});
