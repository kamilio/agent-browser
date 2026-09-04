import { afterEach, expect, it } from "vitest";
import { resolveBlockWidth } from "./block-width.js";
import type { DocumentTree } from "./document.js";
import { layoutDocument } from "./document-layout.js";
import {
	buildFormattingTree,
	type DocumentBlockWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { AtomicInlineMetrics } from "./inline-atomic.js";
import { DocumentQueries } from "./selectors.js";
import {
	layoutFormattingText,
	measureFormattingText,
	type TextLayoutOptions,
} from "./text-layout.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture(
	content = 'a<span id="atom"><div>internal text</div></span>b',
	css = "",
	width = 60,
) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{width:${width}px}#atom{display:inline-flex}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/inline-atomic",
	);
	documents.push(document);
	const queries = new DocumentQueries(document);
	const formatting = buildFormattingTree(document);
	const node = (selector: string) => {
		const id = queries.querySelector(selector);
		if (id === null) throw Error(selector);
		const value = formatting.nodes.find(
			(entry) => entry.ref === document.reference(id),
		);
		if (!value) throw Error(selector);
		return value;
	};
	const host = node("#host");
	const hostStyle = host.box;
	if (!hostStyle) throw new Error("Missing host box style");
	const atom = node("#atom");
	const metrics = (
		extra: Partial<AtomicInlineMetrics> = {},
	): AtomicInlineMetrics => ({
		id: atom.id,
		borderBoxWidth: 20,
		marginLeft: 0,
		marginRight: 0,
		block: { borderBoxHeight: 20, marginTop: 0, marginBottom: 0, baseline: 12 },
		...extra,
	});
	const input = (atomics = [metrics()]): DocumentBlockWidths => ({
		stage: "isolated-block-horizontal-reflow",
		partial: true,
		formatting,
		widths: [
			{
				...resolveBlockWidth(hostStyle, 120),
				id: host.id,
				ref: host.ref,
				containingBlock: formatting.root,
				containingHeight: null,
				borderX: 0,
				contentX: 0,
			},
		],
		images: [],
		atomics,
		metrics: { work: 0 },
	});
	const layout = (
		atomics?: AtomicInlineMetrics[],
		options?: TextLayoutOptions,
	) => layoutFormattingText(input(atomics), options);
	const context = (atomics?: AtomicInlineMetrics[]) =>
		layout(atomics).contexts[0];
	return {
		document,
		formatting,
		host,
		atom,
		node,
		metrics,
		input,
		layout,
		context,
	};
}

it("places an atomic flex box on the shared text baseline without traversing its children", () => {
	const { context, atom } = fixture();
	const result = context();
	expect(result.glyphs.map((glyph) => glyph.character).join("")).toBe("ab");
	expect(result.lines[0]).toMatchObject({
		width: 32,
		height: 20,
		baseline: 12,
	});
	expect(result.glyphs.map((glyph) => glyph.x)).toEqual([0, 26]);
	expect(
		result.fragments.find((fragment) => fragment.formattingId === atom.id),
	).toMatchObject({ atomic: true, x: 6, y: 0, width: 20, height: 20 });
});

it("includes physical margins in line extents without including them in the border fragment", () => {
	const { context, metrics, atom } = fixture();
	const result = context([
		metrics({
			marginLeft: 3,
			marginRight: 4,
			block: {
				borderBoxHeight: 20,
				marginTop: 5,
				marginBottom: 6,
				baseline: 12,
			},
		}),
	]);
	expect(result.lines[0]).toMatchObject({
		width: 39,
		height: 31,
		baseline: 17,
	});
	expect(
		result.fragments.find((fragment) => fragment.formattingId === atom.id),
	).toMatchObject({
		x: 9,
		y: 5,
		width: 20,
		height: 20,
		marginRight: 4,
		marginBottom: 6,
	});
	expect(result.glyphs[1].x).toBe(33);
});

it.each([
	[null, 22, 20, 0],
	[-5, 33, 8, 13],
	[30, 32, 30, 0],
])(
	"uses an explicit baseline or margin-box synthesis: %s",
	(baseline, height, expectedBaseline, expectedY) => {
		const { context, metrics, atom } = fixture();
		const result = context([
			metrics({
				block: { borderBoxHeight: 20, marginTop: 0, marginBottom: 0, baseline },
			}),
		]);
		expect(result.lines[0]).toMatchObject({
			height,
			baseline: expectedBaseline,
		});
		expect(
			result.fragments.find((fragment) => fragment.formattingId === atom.id)?.y,
		).toBe(expectedY);
	},
);

it("synthesizes a missing baseline at the under margin edge, not the border edge", () => {
	const { context, metrics, atom } = fixture();
	const result = context([
		metrics({
			block: {
				borderBoxHeight: 20,
				marginTop: 5,
				marginBottom: 6,
				baseline: null,
			},
		}),
	]);
	expect(result.lines[0]).toMatchObject({ height: 33, baseline: 31 });
	expect(
		result.fragments.find((fragment) => fragment.formattingId === atom.id),
	).toMatchObject({ y: 5, height: 20 });
});

it("does not let the atomic box's internal font inflate its parent line", () => {
	const { context } = fixture(undefined, "#atom{font-size:64px}");
	expect(context().lines[0]).toMatchObject({ height: 20, baseline: 12 });
});

it("wraps around but never through an atomic box", () => {
	const { context } = fixture(undefined, "", 30);
	const result = context();
	expect(result.lines.map((line) => line.width)).toEqual([26, 6]);
	expect(result.glyphs.map((glyph) => [glyph.character, glyph.line])).toEqual([
		["a", 0],
		["b", 1],
	]);
	expect(result.fragments[0].line).toBe(0);
});

it("keeps a too-wide atomic box indivisible and reports overflow", () => {
	const { context } = fixture('<span id="atom"></span>', "", 10);
	expect(context().lines[0]).toMatchObject({ width: 20, overflow: 10 });
});

it.each(["nowrap", "pre"])(
	"uses parent %s rather than the atomic box's own wrapping mode",
	(whiteSpace) => {
		const { context } = fixture(
			undefined,
			`main{white-space:${whiteSpace}}#atom{white-space:normal}`,
			30,
		);
		expect(context().lines).toHaveLength(1);
		expect(context().lines[0]).toMatchObject({ width: 32, overflow: 2 });
	},
);

it.each(["normal", "pre-line"])(
	"preserves parent %s break opportunities despite internal nowrap",
	(whiteSpace) => {
		const { context } = fixture(
			undefined,
			`main{white-space:${whiteSpace}}#atom{white-space:nowrap}`,
			30,
		);
		expect(context().lines.map((line) => line.width)).toEqual([26, 6]);
	},
);

it("inherits wrapping from intervening inline wrappers", () => {
	const { context } = fixture(
		'<i>a<span id="atom"></span>b</i>',
		"i{white-space:nowrap}",
		30,
	);
	expect(context().lines).toHaveLength(1);
});

it("collapses and trims spaces around atomic boundaries normally", () => {
	const { context } = fixture(' a  <span id="atom"></span>  b ', "", 30);
	expect(context().lines.map((line) => line.width)).toEqual([6, 20, 6]);
});

it("includes the atomic width in inline ancestor fragments but not their font height", () => {
	const { context, node, atom } = fixture(
		'<span id="wrapper">a<span id="atom"></span>b</span>',
	);
	const result = context();
	expect(
		result.fragments.find(
			(fragment) => fragment.formattingId === node("#wrapper").id,
		),
	).toMatchObject({ width: 32, height: 8 });
	expect(
		result.fragments.find((fragment) => fragment.formattingId === atom.id)
			?.height,
	).toBe(20);
});

it("retains zero-width atomic content as a real line participant", () => {
	const { context, metrics } = fixture('<span id="atom"></span>');
	const result = context([
		metrics({
			borderBoxWidth: 0,
			block: {
				borderBoxHeight: 0,
				marginTop: 0,
				marginBottom: 0,
				baseline: null,
			},
		}),
	]);
	expect(result.lines).toHaveLength(1);
	expect(result.lines[0]).toMatchObject({ width: 0, height: 10 });
	expect(result.fragments[0]).toMatchObject({ width: 0, height: 0, line: 0 });
});

it("preserves negative horizontal margins and overlapping geometry", () => {
	const { context, metrics } = fixture();
	const result = context([metrics({ marginLeft: -10 })]);
	expect(result.lines[0].width).toBe(22);
	expect(result.fragments[0]).toMatchObject({ x: -4, width: 20 });
});

it("measures intrinsic atomic advances without fabricating used block metrics", () => {
	const { input, metrics } = fixture();
	const horizontal = input([metrics({ block: undefined })]);
	expect(measureFormattingText(horizontal, "min-content").widths[0].width).toBe(
		20,
	);
	expect(measureFormattingText(horizontal, "max-content").widths[0].width).toBe(
		32,
	);
	expect(() => layoutFormattingText(horizontal)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("allows intrinsic measurement with an unknown baseline but rejects used layout", () => {
	const { input, metrics } = fixture();
	const horizontal = input([
		metrics({
			block: {
				borderBoxHeight: 20,
				marginTop: 0,
				marginBottom: 0,
				baseline: null,
				unsupportedBaseline: true,
			},
		}),
	]);
	expect(measureFormattingText(horizontal, "max-content").widths[0].width).toBe(
		32,
	);
	expect(() => layoutFormattingText(horizontal)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 16_777_217])(
	"rejects invalid atomic widths %s",
	(borderBoxWidth) => {
		const { layout, metrics } = fixture();
		expect(() => layout([metrics({ borderBoxWidth })])).toThrow();
	},
);

it("rejects duplicate, foreign and unrelated metrics instead of hiding unsupported content", () => {
	const { layout, metrics, host } = fixture();
	expect(() => layout([metrics(), metrics()])).toThrow(/duplicate/);
	expect(() => layout([metrics({ id: 999999 })])).toThrow(
		/retained atomic container/,
	);
	expect(() => layout([metrics({ id: host.id })])).toThrow(
		/retained atomic container/,
	);
});

it("requires a metric for every atomic box", () => {
	const { layout } = fixture();
	expect(() => layout([])).toThrow(/Missing used atomic/);
});

it("bounds work and tokens and returns immutable positions", () => {
	const { layout, metrics } = fixture();
	const value = metrics();
	const result = layout([value]);
	expect(layout([value], { maxWork: result.metrics.work }).metrics.work).toBe(
		result.metrics.work,
	);
	expect(() => layout([value], { maxWork: result.metrics.work - 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() =>
		layout([value], { maxTokens: result.metrics.tokens - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	value.borderBoxWidth = 40;
	expect(result.contexts[0].fragments[0].width).toBe(20);
	expect(Object.isFrozen(result.contexts[0].fragments[0])).toBe(true);
});

it("lets the page owner supply real atomic metrics", () => {
	const { document, atom } = fixture();
	const result = layoutDocument(document);
	expect(
		result.boxes.find((box) => box.id === atom.id)?.borderBoxHeight,
	).toBeGreaterThan(0);
	expect(result.text.horizontal.atomics?.map((value) => value.id)).toContain(
		atom.id,
	);
});
