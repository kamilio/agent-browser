import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { layoutFormattingColumnContainer } from "./flex-column.js";
import { resolveFormattingFlexMainSizes } from "./flex-main.js";
import { flexIntrinsicContribution } from "./flex-intrinsic.js";
import {
	buildFormattingTree,
	type FormattingNode,
	type FormattingTree,
} from "./formatting-tree.js";
import {
	gridAutomaticMinimum,
	gridColumnContributions,
} from "./grid-intrinsic.js";
import { layoutFormattingGridContainer } from "./grid-layout.js";
import type { GridPlacement } from "./grid-types.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { IntrinsicWidth } from "./intrinsic-widths.js";
import type { OverflowStyle, OverflowValue } from "./overflow-policy.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	mode: "row" | "column" | "grid",
	css = "",
	content = '<div style="width:80px;height:80px"></div>',
) {
	const containerStyle =
		mode === "grid"
			? "display:grid;grid-template-columns:1fr;grid-template-rows:1fr"
			: `display:flex;flex-direction:${mode}`;
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;font-size:10px;line-height:10px}main{${containerStyle};width:40px;height:40px}#item{flex:0 1 auto}${css}</style><main id="container"><div id="item">${content}</div></main>`,
		"https://fixture.invalid/overflow-minimum",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const formatting = buildFormattingTree(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const domId = queries.querySelector(selector);
		if (domId === null) throw new Error(`Missing fixture ${selector}`);
		const ref = tree.reference(domId);
		const node = formatting.nodes.find((entry) => entry.ref === ref);
		if (!node) throw new Error(`Missing formatting node ${selector}`);
		return node.id;
	};
	const withComputedOverflow = (
		computed: Readonly<OverflowStyle>,
		used: Readonly<OverflowStyle> = computed,
		selector = "#item",
	): FormattingTree => {
		const target = id(selector);
		const scrollable = [computed.x, computed.y].some((value) =>
			["hidden", "auto", "scroll"].includes(value),
		);
		return {
			...formatting,
			nodes: formatting.nodes.map(
				(node): FormattingNode =>
					node.id === target
						? {
								...node,
								scrollableOverflow: scrollable ? true : undefined,
								overflow: used,
							}
						: node,
			),
		};
	};
	return { formatting, id, withComputedOverflow };
}

type Fixture = ReturnType<typeof fixture>;
const constraints = {
	contentWidth: 40,
	containingWidth: 160,
	containingHeight: 120,
};
const visible: Readonly<OverflowStyle> = { x: "visible", y: "visible" };
const hidden: Readonly<OverflowStyle> = { x: "hidden", y: "hidden" };

function row(sample: Fixture, formatting = sample.formatting) {
	return resolveFormattingFlexMainSizes(formatting, sample.id("#container"), {
		contentWidth: 40,
		contentHeight: 40,
	});
}

function column(sample: Fixture, formatting = sample.formatting) {
	return layoutFormattingColumnContainer(
		formatting,
		sample.id("#container"),
		constraints,
		{},
		{},
	);
}

function grid(sample: Fixture, formatting = sample.formatting) {
	return layoutFormattingGridContainer(
		formatting,
		sample.id("#container"),
		constraints,
	);
}

const overflowCases = (
	["visible", "clip", "hidden", "auto", "scroll"] as const
).flatMap((value: OverflowValue) =>
	(["x", "y"] as const).map((axis) => ({
		value,
		axis,
		computed: { ...visible, [axis]: value },
		minimum: value === "clip" || value === "visible" ? 80 : 0,
	})),
);

it.each(overflowCases)(
	"uses synthetic computed $value on $axis for row-flex auto minima",
	({ computed, minimum }) => {
		const sample = fixture("row");
		const result = row(sample, sample.withComputedOverflow(computed));
		expect(result.items[0]).toMatchObject({
			baseSize: 80,
			minSize: minimum,
			minimumSource: minimum === 0 ? "scrollable" : "content-based",
		});
		expect(result.resolved.lines[0].items[0].contentSize).toBe(
			minimum === 0 ? 40 : 80,
		);
	},
);

it.each(overflowCases)(
	"uses synthetic computed $value on $axis for column-flex auto minima",
	({ computed, minimum }) => {
		const sample = fixture("column");
		const result = column(sample, sample.withComputedOverflow(computed));
		expect(result.main.items[0]).toMatchObject({
			baseSize: 80,
			minSize: minimum,
			minimumSource: minimum === 0 ? "scrollable" : "content-based",
		});
		expect(result.main.resolved.lines[0].items[0].contentSize).toBe(
			minimum === 0 ? 40 : 80,
		);
	},
);

it.each(overflowCases)(
	"uses synthetic computed $value on $axis for both grid auto minima",
	({ computed, minimum }) => {
		const sample = fixture("grid");
		const result = grid(sample, sample.withComputedOverflow(computed));
		expect(result.columns.sizes).toEqual([minimum === 0 ? 40 : 80]);
		expect(result.rows.sizes).toEqual([minimum === 0 ? 40 : 80]);
	},
);

it.each(["row", "column", "grid"] as const)(
	"does not replace computed minima with donated used overflow in %s",
	(mode) => {
		const sample = fixture(mode);
		const donated = sample.withComputedOverflow(hidden, visible);
		const clippingOnly = sample.withComputedOverflow(
			{ x: "clip", y: "visible" },
			hidden,
		);
		if (mode === "grid") {
			expect(grid(sample, donated).columns.sizes).toEqual([40]);
			expect(grid(sample, donated).rows.sizes).toEqual([40]);
			expect(grid(sample, clippingOnly).columns.sizes).toEqual([80]);
			expect(grid(sample, clippingOnly).rows.sizes).toEqual([80]);
		} else {
			const measure = (formatting: FormattingTree) =>
				mode === "row"
					? row(sample, formatting)
					: column(sample, formatting).main;
			expect(measure(donated).items[0].minSize).toBe(0);
			expect(measure(clippingOnly).items[0].minSize).toBe(80);
		}
	},
);

it.each(["row", "column"] as const)(
	"zeros the computed auto minimum even when %s content fits",
	(mode) => {
		const sample = fixture(
			mode,
			"",
			'<div style="width:10px;height:10px"></div>',
		);
		const formatting = sample.withComputedOverflow({ x: "auto", y: "auto" });
		const result =
			mode === "row"
				? row(sample, formatting)
				: column(sample, formatting).main;
		expect(result.items[0]).toMatchObject({
			baseSize: 10,
			minSize: 0,
			minimumSource: "scrollable",
		});
		expect(result.resolved.lines[0].items[0].contentSize).toBe(10);
	},
);

it.each([
	["min-width:60px;max-width:25px", 60, 25, 60, "explicit"],
	["min-width:0", 0, null, 40, "explicit"],
	["width:30px;max-width:25px", 0, 25, 25, "scrollable"],
	[
		"box-sizing:border-box;min-width:60px;padding:2px;border:1px solid",
		54,
		null,
		54,
		"explicit",
	],
] as const)(
	"preserves row-flex constraints with computed scrolling: %s",
	(css, minimum, maximum, size, source) => {
		const sample = fixture("row", `#item{${css}}`);
		const result = row(sample, sample.withComputedOverflow(hidden));
		expect(result.items[0]).toMatchObject({
			minSize: minimum,
			maxSize: maximum,
			minimumSource: source,
		});
		expect(result.resolved.lines[0].items[0].contentSize).toBe(size);
	},
);

it.each([
	["min-height:60px;max-height:25px", 60, 25, 60, "explicit"],
	["min-height:0", 0, null, 40, "explicit"],
	["height:30px;max-height:25px", 0, 25, 25, "scrollable"],
	[
		"box-sizing:border-box;min-height:60px;padding:2px;border:1px solid",
		54,
		null,
		54,
		"explicit",
	],
] as const)(
	"preserves column-flex constraints with computed scrolling: %s",
	(css, minimum, maximum, size, source) => {
		const sample = fixture("column", `#item{${css}}`);
		const result = column(sample, sample.withComputedOverflow(hidden)).main;
		expect(result.items[0]).toMatchObject({
			minSize: minimum,
			maxSize: maximum,
			minimumSource: source,
		});
		expect(result.resolved.lines[0].items[0].contentSize).toBe(size);
	},
);

it("preserves explicit grid minima on both axes for scrollable items", () => {
	const sample = fixture("grid", "#item{min-width:60px;min-height:70px}");
	const result = grid(sample, sample.withComputedOverflow(hidden));
	expect(result.columns.sizes).toEqual([60]);
	expect(result.rows.sizes).toEqual([70]);
});

it("retains intrinsic track sizing rather than zeroing all grid contributions", () => {
	const sample = fixture(
		"grid",
		"main{grid-template-columns:min-content;grid-template-rows:min-content}",
	);
	const result = grid(sample, sample.withComputedOverflow(hidden));
	expect(result.columns.sizes).toEqual([80]);
	expect(result.rows.sizes).toEqual([80]);
});

it("does not inherit a nested row-flex child's scrollable minimum", () => {
	const sample = fixture(
		"row",
		"#item{display:flex}",
		'<div id="inner"><div style="width:80px;height:80px"></div></div>',
	);
	const formatting = sample.withComputedOverflow(hidden, visible, "#inner");
	const inner = resolveFormattingFlexMainSizes(formatting, sample.id("#item"), {
		contentWidth: 40,
		contentHeight: 40,
	});
	expect(inner.items[0].minSize).toBe(0);
	expect(inner.resolved.lines[0].items[0].contentSize).toBe(40);
	expect(row(sample, formatting).items[0].minSize).toBe(80);
});

it("uses a nested grid item's own computed overflow on both axes", () => {
	const sample = fixture(
		"grid",
		"#item{display:grid;grid-template-columns:1fr;grid-template-rows:1fr}",
		'<div id="inner"><div style="width:80px;height:80px"></div></div>',
	);
	const formatting = sample.withComputedOverflow(hidden, visible, "#inner");
	const result = layoutFormattingGridContainer(
		formatting,
		sample.id("#item"),
		constraints,
		{},
		{ contentHeight: 40, contentHeightDefinite: true },
	);
	expect(result.columns.sizes).toEqual([40]);
	expect(result.rows.sizes).toEqual([40]);
});

it.each(["row", "column"] as const)(
	"retains synthetic replaced %s intrinsic and transferred sizes",
	(mode) => {
		const sample = fixture(
			mode,
			mode === "row"
				? "#item{height:20px;align-self:flex-start}"
				: "#item{width:40px;align-self:flex-start}",
			"",
		);
		const replaced = (formatting: FormattingTree): FormattingTree => ({
			...formatting,
			nodes: formatting.nodes.map(
				(node): FormattingNode =>
					node.id === sample.id("#item")
						? {
								...node,
								kind: "replaced",
								contentMode: undefined,
								intrinsic: { width: 120, height: 60 },
							}
						: node,
			),
		});
		const measure = (formatting: FormattingTree) =>
			mode === "row"
				? row(sample, formatting)
				: column(sample, formatting).main;
		const baseline = measure(replaced(sample.formatting)).items[0];
		const scrollable = measure(replaced(sample.withComputedOverflow(hidden)))
			.items[0];
		expect(baseline.minSize).toBeGreaterThan(0);
		expect(scrollable).toMatchObject({
			minSize: 0,
			minimumSource: "scrollable",
			baseSize: baseline.baseSize,
			minContent: baseline.minContent,
			maxContent: baseline.maxContent,
			maxSize: baseline.maxSize,
		});
	},
);

it.each([
	["", 12],
	["min-width:20px", 32],
	["min-width:20px;box-sizing:border-box", 26],
] as const)(
	"keeps grid box edges and explicit minima separate from content minima: %s",
	(css, minimum) => {
		const sample = fixture(
			"grid",
			`#item{padding:2px;border:1px solid;margin:3px;${css}}`,
		);
		const itemId = sample.id("#item");
		const axis = {
			startLine: 1,
			explicitTracks: 1,
			tracks: [{ minimum: "auto", maximum: "1fr" }],
			lineNames: [[], []],
		};
		const placement: GridPlacement = {
			columns: axis,
			rows: axis,
			items: [
				{ id: itemId, rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 },
			],
			metrics: { work: 0 },
		};
		const widths = new Map<number, IntrinsicWidth>([
			[
				itemId,
				{
					id: itemId,
					minContent: 80,
					maxContent: 100,
					minContribution: 92,
					maxContribution: 112,
				},
			],
		]);
		const result = gridColumnContributions(
			sample.withComputedOverflow(hidden),
			placement,
			widths,
			0,
			40,
			() => {},
		);
		expect(result[0]).toMatchObject({
			minimum,
			minContent: 92,
			maxContent: 112,
		});
	},
);

it("retains non-scrollable spanning-track rules and charges the scrollable path", () => {
	let work = 0;
	const charge = () => {
		work++;
	};
	const tracks = [
		{ minimum: "auto", maximum: "1fr" },
		{ minimum: "auto", maximum: "1fr" },
	];
	expect(gridAutomaticMinimum(tracks, 0, 1, 80, 6, 0, 40, charge)).toBe(80);
	expect(gridAutomaticMinimum(tracks, 0, 2, 80, 6, 0, 40, charge)).toBe(6);
	const previous = work;
	expect(gridAutomaticMinimum(tracks, 0, 1, 80, 6, 0, 40, charge, true)).toBe(
		6,
	);
	expect(work).toBeGreaterThan(previous);
});

it("zeros computed scrollable grid minima before any actual overflow exists", () => {
	const tracks = [{ minimum: "auto", maximum: "1fr" }];
	expect(gridAutomaticMinimum(tracks, 0, 1, 10, 0, 0, 40, () => {})).toBe(10);
	expect(gridAutomaticMinimum(tracks, 0, 1, 10, 0, 0, 40, () => {}, true)).toBe(
		0,
	);
});

it.each([false, true])(
	"keeps intrinsic flex contribution caps with scrollable=%s",
	(scrollable) => {
		const sample = fixture("row", "#item{flex:0 1 10px}");
		const node = (
			scrollable ? sample.withComputedOverflow(hidden) : sample.formatting
		).nodes[sample.id("#item")];
		const measured = {
			id: node.id,
			minContent: 80,
			maxContent: 100,
			minContribution: 80,
			maxContribution: 100,
		};
		expect(flexIntrinsicContribution(node, measured, false)).toBe(
			scrollable ? 10 : 80,
		);
		expect(flexIntrinsicContribution(node, measured, true)).toBe(
			scrollable ? 10 : 80,
		);
	},
);

it.each(["hidden", "auto", "scroll"])(
	"derives scrollable automatic minima from actual overflow:%s CSS",
	(overflow) => {
		const rowSample = fixture("row", `#item{overflow:${overflow}}`);
		expect(row(rowSample).items[0]).toMatchObject({
			minSize: 0,
			minimumSource: "scrollable",
		});
		const columnSample = fixture("column", `#item{overflow:${overflow}}`);
		expect(column(columnSample).main.items[0]).toMatchObject({
			minSize: 0,
			minimumSource: "scrollable",
		});
		const gridSample = fixture("grid", `#item{overflow:${overflow}}`);
		expect(grid(gridSample).columns.sizes).toEqual([40]);
		expect(grid(gridSample).rows.sizes).toEqual([40]);
	},
);
