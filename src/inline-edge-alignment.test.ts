import { afterEach, expect, it } from "vitest";
import { findClickPoint } from "./click-target.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

type EdgeAlignment = "top" | "bottom";
type AlignmentMetadata = {
	inlineVerticalAlign?: "middle" | EdgeAlignment;
};
const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];
const simpleBoxes = [
	{ name: "image", markup: '<img id="target">' },
	{
		name: "inline-block",
		markup: '<span id="target" style="display:inline-block"></span>',
	},
] as const;

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(
	alignment: EdgeAlignment,
	markup = 'A<img id="target">Z',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-family:"Agent Mono";font-size:8px;line-height:8px}main{width:120px}#target{width:12px;height:20px;margin:0;padding:0;border:none;vertical-align:${alignment}}${css}</style><main id="host">${markup}</main><footer id="after"></footer>`,
		"https://fixture.invalid/inline-edge-alignment",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const styles = documentStyles(tree);
	styles.setViewport(160, 160);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const reference = (selector = "#target") => tree.reference(id(selector));
	const rect = (selector = "#target") =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const context = (selector = "#host", layout = layoutDocument(tree)) => {
		const found = layout.contexts.find(
			(entry) => entry.ref === reference(selector),
		);
		if (!found) throw new Error(`Missing context ${selector}`);
		return found;
	};
	return { tree, queries, styles, id, reference, rect, context };
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

for (const alignment of ["top", "bottom"] as const) {
	const baseline = alignment === "top" ? 7 : 19;

	it.each([
		{ ...simpleBoxes[0], kind: "replaced" },
		{ ...simpleBoxes[1], kind: "block" },
		{
			name: "inline flow-root",
			markup: '<span id="target" style="display:inline flow-root"></span>',
			kind: "block",
		},
		{
			name: "inline-flex",
			markup: '<span id="target" style="display:inline-flex"></span>',
			kind: "deferred",
		},
		{
			name: "embedded SVG",
			markup:
				'<svg id="target" width="12" height="20"><rect width="12" height="20" fill="blue"/></svg>',
			kind: "replaced",
		},
		{
			name: "native input",
			markup: '<input id="target" value="">',
			kind: "replaced",
		},
		{
			name: "rich button",
			markup:
				'<button id="target" style="display:inline-block"><span>X</span></button>',
			kind: "block",
		},
	])(
		`aligns the retained $name margin box to ${alignment}`,
		({ markup, kind }) => {
			const page = fixture(alignment, `A${markup}Z`);
			const layout = layoutDocument(page.tree);
			const host = page.context("#host", layout);
			expect(host.lines).toHaveLength(1);
			expect(host.lines[0]).toMatchObject({
				top: 0,
				baseline,
				height: 20,
				width: 24,
			});
			expect(page.rect()).toMatchObject({ x: 6, y: 0, width: 12, height: 20 });
			expect(
				host.fragments.filter((fragment) => fragment.ref === page.reference()),
			).toEqual([
				expect.objectContaining({ x: 6, y: 0, width: 12, height: 20, line: 0 }),
			]);
			expect(
				host.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
			).toEqual([
				["A", 0, baseline - 7],
				["Z", 18, baseline - 7],
			]);
			expect(page.rect("#after").y).toBe(20);
			expect(page.styles.table(page.id())["vertical-align"]).toBe(alignment);
			expect(
				layout.text.horizontal.formatting.nodes.find(
					(node) => node.ref === page.reference(),
				),
			).toMatchObject({
				kind,
				level: "inline",
				inlineVerticalAlign: alignment,
			});
			expect(layout.text.horizontal.formatting.issues).toEqual(
				kind === "deferred" ? { "display-layout-not-supported": 1 } : {},
			);
			expect(
				documentGeometry(page.tree).getClientRects(page.id()),
			).toHaveLength(1);
		},
	);

	it.each([
		[4, 2, 26],
		[2, 4, 26],
		[-4, 2, 18],
		[4, -2, 22],
		[-2, -2, 16],
	])(
		`includes signed margins %s/%s in the ${alignment} line extent`,
		(marginTop, marginBottom, height) => {
			const page = fixture(
				alignment,
				undefined,
				`#target{margin-top:${marginTop}px;margin-bottom:${marginBottom}px}`,
			);
			const lineBaseline = alignment === "top" ? 7 : height - 1;
			expect(page.context().lines[0]).toMatchObject({
				height,
				baseline: lineBaseline,
			});
			expect(page.rect()).toMatchObject({ y: marginTop, height: 20 });
			expect(page.context().glyphs[0].y).toBe(lineBaseline - 7);
			expect(page.rect("#after").y).toBe(height);
		},
	);

	it.each(simpleBoxes)(
		`includes percentage padding and borders in a ${alignment} $name`,
		({ markup }) => {
			const page = fixture(
				alignment,
				`A${markup}Z`,
				"main{width:100px}#target{height:10px;padding:5% 2%;border:1px solid red;margin:4px 0 2px}",
			);
			expect(page.rect()).toMatchObject({ x: 6, y: 4, width: 18, height: 22 });
			expect(page.context().lines[0]).toMatchObject({
				height: 28,
				baseline: alignment === "top" ? 7 : 27,
				width: 30,
			});
			expect(page.rect("#after").y).toBe(28);
		},
	);

	it(`does not shrink the parent strut for a small ${alignment} box`, () => {
		const page = fixture(alignment, undefined, "#target{height:2px}");
		expect(page.context().lines[0]).toMatchObject({ height: 8, baseline: 7 });
		expect(page.rect()).toMatchObject({
			y: alignment === "top" ? 0 : 6,
			height: 2,
		});
		expect(page.rect("#after").y).toBe(8);
	});

	it(`excludes a ${alignment} image's own line-height from break opportunities`, () => {
		const page = fixture(
			alignment,
			undefined,
			"main{line-height:20px}#target{height:10px;line-height:100px}",
		);
		const host = page.context();
		expect(host.lines).toHaveLength(1);
		expect(host.lines[0]).toMatchObject({
			top: 0,
			baseline: 13,
			height: 20,
			width: 24,
		});
		expect(page.rect()).toMatchObject({
			x: 6,
			y: alignment === "top" ? 0 : 10,
			width: 12,
			height: 10,
		});
		expect(
			host.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
		).toEqual([
			["A", 0, 6],
			["Z", 18, 6],
		]);
		expect(page.rect("#after").y).toBe(20);
	});

	it(`preserves signed strut extents for ${alignment} in a zero-line-height parent`, () => {
		const page = fixture(alignment, undefined, "main{line-height:0}");
		const lineBaseline = alignment === "top" ? 3 : 23;
		const host = page.context();
		expect(host.lines).toHaveLength(1);
		expect(host.lines[0]).toMatchObject({
			top: 0,
			baseline: lineBaseline,
			height: 20,
			width: 24,
		});
		expect(page.rect()).toMatchObject({ x: 6, y: 0, width: 12, height: 20 });
		expect(
			host.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
		).toEqual([
			["A", 0, lineBaseline - 7],
			["Z", 18, lineBaseline - 7],
		]);
		expect(page.rect("#after").y).toBe(20);
	});

	it.each(["inline-block", "inline-flex"])(
		`ignores the internal child baseline of a ${alignment} %s`,
		(display) => {
			const page = fixture(
				alignment,
				'A<span id="target"><span id="child">a<br>b</span></span>Z',
				`#target{display:${display};line-height:10px}#child{display:block}`,
			);
			expect(page.context().lines[0]).toMatchObject({ baseline, height: 20 });
			expect(page.context("#child").lines.map((line) => line.baseline)).toEqual(
				[8, 18],
			);
			expect(page.rect()).toMatchObject({ y: 0, height: 20 });
			expect(page.context().glyphs.map((glyph) => glyph.y)).toEqual([
				baseline - 7,
				baseline - 7,
			]);
		},
	);

	it(`exports the wrapper baseline around a ${alignment} inline-flex control`, () => {
		const page = fixture(
			alignment,
			'A<span id="outer">x<span id="target"><button>Go</button></span>y</span>Z',
			"main{width:200px;white-space:nowrap}#outer{display:inline-block;width:100px}#target{display:inline-flex;width:60px;height:auto}",
		);
		const layout = layoutDocument(page.tree);
		const outerLine = page.context("#outer", layout).lines[0];
		const target = page.rect();
		expect(alignment === "top" ? target.y : target.bottom).toBe(
			alignment === "top" ? outerLine.top : outerLine.top + outerLine.height,
		);
		expect(page.context("#host", layout).lines[0].baseline).toBe(
			outerLine.baseline,
		);
		expect(page.rect("#after").y).toBeGreaterThanOrEqual(target.bottom);
	});

	it(`retains the independent rich flex-item guard beside ${alignment} alignment`, () => {
		const page = fixture(
			alignment,
			'A<span id="outer">x<span id="target"><button><span>Go</span></button></span>y</span>Z',
			"main{width:200px;white-space:nowrap}#outer{display:inline-block;width:100px}#target{display:inline-flex;width:60px;height:auto}",
		);
		expect(
			buildFormattingTree(page.tree).issues["element-layout-not-supported"],
		).toBe(1);
		expect(() => layoutDocument(page.tree)).toThrow(
			"element-layout-not-supported",
		);
	});

	it.each(simpleBoxes)(
		`allocates separate line extents when a ${alignment} $name wraps`,
		({ markup }) => {
			const page = fixture(alignment, `A${markup}B`, "main{width:12px}");
			expect(
				page
					.context()
					.lines.map((line) => [line.top, line.height, line.baseline]),
			).toEqual([
				[0, 8, 7],
				[8, 20, 8 + baseline],
				[28, 8, 35],
			]);
			expect(page.rect()).toMatchObject({ x: 0, y: 8, width: 12, height: 20 });
			expect(page.rect("#after").y).toBe(36);
		},
	);

	it(`restores the float interval after a tall ${alignment} line`, () => {
		const page = fixture(
			alignment,
			'<span id="float"></span><span id="target" style="display:inline-block"></span><br>Z',
			"main{width:24px}#float{float:left;width:12px;height:16px}",
		);
		expect(page.rect()).toMatchObject({ x: 12, y: 0, width: 12, height: 20 });
		expect(
			page
				.context()
				.lines.map((line) => [line.top, line.height, line.baseline]),
		).toEqual([
			[0, 20, baseline],
			[20, 8, 27],
		]);
		expect(page.context().glyphs[0]).toMatchObject({
			character: "Z",
			x: 0,
			y: 20,
		});
		expect(page.rect("#after").y).toBe(28);
	});

	it(`retains generated ${alignment} atomics without DOM nodes`, () => {
		const page = fixture(
			alignment,
			"Z",
			`#host::before{content:"";display:inline-block;vertical-align:${alignment};width:12px;height:20px;background:blue}`,
		);
		const revision = page.tree.revision;
		const nodeCount = page.tree.nodeCount;
		const rendered = rasterizeDocument(page.tree);
		const formatting = rendered.layout.text.horizontal.formatting;
		const generated = formatting.nodes.find(
			(node) =>
				node.generatedContent?.owner === page.id("#host") &&
				node.generatedContent.name === "before" &&
				node.kind !== "text",
		);
		expect(generated).toMatchObject({
			kind: "block",
			level: "inline",
			inlineVerticalAlign: alignment,
		});
		expect(generated?.ref).toBeUndefined();
		expect(
			rendered.layout.boxes.find((box) => box.id === generated?.id),
		).toMatchObject({
			borderX: 0,
			borderY: 0,
			borderBoxWidth: 12,
			borderBoxHeight: 20,
		});
		expect(page.context("#host", rendered.layout).lines[0]).toMatchObject({
			baseline,
			height: 20,
		});
		expect(page.context("#host", rendered.layout).glyphs[0]).toMatchObject({
			character: "Z",
			x: 12,
			y: baseline - 7,
		});
		expect(pixel(rendered.image, 3, 3)).toEqual([0, 0, 255, 255]);
		expect(formatting.issues).toEqual({});
		expect(page.queries.querySelectorAll("#host::before")).toEqual([]);
		expect(page.tree.revision).toBe(revision);
		expect(page.tree.nodeCount).toBe(nodeCount);
	});

	it.each([
		["block", "#target{display:block}"],
		["float", "#target{float:left}"],
		["flex item", "main{display:flex;align-items:flex-start}"],
	])(`does not apply inline ${alignment} placement to a %s`, (_name, css) => {
		const edge = fixture(alignment, '<img id="target">', css);
		const ordinary = fixture(
			alignment,
			'<img id="target">',
			`${css}#target{vertical-align:baseline}`,
		);
		expect(edge.rect()).toEqual(ordinary.rect());
		expect(edge.rect()).toMatchObject({ y: 0, width: 12, height: 20 });
		const formatting = buildFormattingTree(edge.tree);
		const target = formatting.nodes.find(
			(node) => node.ref === edge.reference(),
		);
		expect(
			(target as AlignmentMetadata | undefined)?.inlineVerticalAlign,
		).toBeUndefined();
		expect(formatting.issues).toEqual(
			buildFormattingTree(ordinary.tree).issues,
		);
	});

	it(`does not suppress generated non-atomic ${alignment} guards`, () => {
		const page = fixture(
			alignment,
			"Z",
			`#host::before{content:"X";vertical-align:${alignment}}`,
		);
		const formatting = buildFormattingTree(page.tree);
		expect(
			formatting.issues["inline-vertical-align-not-supported"],
		).toBeGreaterThan(0);
		expect(
			formatting.issues[
				"generated-content-vertical-align-layout-not-supported"
			],
		).toBeGreaterThan(0);
		expect(() => layoutDocument(page.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	});

	it.each(simpleBoxes)(
		`paints, hit-tests and targets the ${alignment} $name border box`,
		({ markup }) => {
			const page = fixture(
				alignment,
				`A${markup}Z`,
				"main{line-height:40px}#target{background:blue;margin:4px 0 2px}",
			);
			const borderY = alignment === "top" ? 4 : 18;
			expect(page.context().lines[0]).toMatchObject({
				height: 40,
				baseline: 23,
			});
			expect(page.rect()).toMatchObject({
				x: 6,
				y: borderY,
				width: 12,
				height: 20,
			});
			const { image } = rasterizeDocument(page.tree);
			expect(pixel(image, 10, borderY + 1)).toEqual([0, 0, 255, 255]);
			expect(pixel(image, 10, borderY + 18)).toEqual([0, 0, 255, 255]);
			expect(pixel(image, 10, borderY - 1)).toEqual([255, 255, 255, 255]);
			expect(pixel(image, 10, borderY + 20)).toEqual([255, 255, 255, 255]);
			const hits = documentHitTesting(page.tree);
			expect(hits.elementFromPoint(10, borderY + 1)).toBe(page.id());
			expect(hits.elementFromPoint(10, borderY + 18)).toBe(page.id());
			expect(hits.elementFromPoint(10, borderY - 1)).not.toBe(page.id());
			expect(hits.elementFromPoint(10, borderY + 20)).not.toBe(page.id());
			expect(findClickPoint(page.tree, page.id()).point).toEqual({
				x: 12,
				y: borderY + 10,
			});
		},
	);

	it(`fails closed at the existing ${alignment} layout work budget`, () => {
		const page = fixture(
			alignment,
			'A<span id="target" style="display:inline-block">a<br>b</span>Z',
		);
		const layout = layoutDocument(page.tree);
		expect(page.context("#host", layout).lines[0]).toMatchObject({
			baseline,
			height: 20,
		});
		expect(
			layoutDocument(page.tree, { maxWork: layout.metrics.work }).metrics.work,
		).toBe(layout.metrics.work);
		expect(() =>
			layoutDocument(page.tree, { maxWork: layout.metrics.work - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	});
}

it.each([false, true])(
	"selects a minimum-height baseline independently of edge box order: %s",
	(reverse) => {
		const top = '<img id="target">';
		const bottom = '<span id="bottom"></span>';
		const page = fixture(
			"top",
			`A${reverse ? bottom + top : top + bottom}Z`,
			"#target{height:30px}#bottom{display:inline-block;vertical-align:bottom;width:8px;height:20px}",
		);
		expect(page.context().lines[0]).toMatchObject({ baseline: 19, height: 30 });
		expect(page.rect()).toMatchObject({ y: 0, height: 30 });
		expect(page.rect("#bottom")).toMatchObject({ y: 10, height: 20 });
		expect(page.context().glyphs.map((glyph) => glyph.y)).toEqual([12, 12]);
		expect(page.rect("#after").y).toBe(30);
	},
);

it("unions top and bottom extents with middle and baseline siblings", () => {
	const page = fixture(
		"top",
		'A<img id="target"><img id="bottom"><img id="middle"><img id="baseline">Z',
		"#target{height:30px}#bottom{vertical-align:bottom;width:8px;height:20px}#middle{vertical-align:middle;width:8px;height:10px}#baseline{vertical-align:baseline;width:4px;height:16px}",
	);
	expect(page.context().lines[0]).toMatchObject({ baseline: 17.5, height: 30 });
	expect(page.rect()).toMatchObject({ y: 0, height: 30 });
	expect(page.rect("#bottom")).toMatchObject({ y: 10, height: 20 });
	expect(page.rect("#middle")).toMatchObject({ y: 10, height: 10 });
	expect(page.rect("#baseline")).toMatchObject({ y: 1.5, height: 16 });
	expect(page.context().glyphs.map((glyph) => glyph.y)).toEqual([10.5, 10.5]);
	expect(page.rect("#after").y).toBe(30);
});

it("reflows edge alignment mutations without changing an earlier layout", () => {
	const page = fixture("top");
	const original = layoutDocument(page.tree);
	page.tree.setAttribute(
		page.id(),
		"style",
		"vertical-align:bottom;height:30px",
	);
	const changed = layoutDocument(page.tree);
	expect(page.context("#host", original).lines[0]).toMatchObject({
		baseline: 7,
		height: 20,
	});
	expect(page.context("#host", changed).lines[0]).toMatchObject({
		baseline: 29,
		height: 30,
	});
	expect(page.rect()).toMatchObject({ x: 6, y: 0, width: 12, height: 30 });
	expect(page.rect("#after").y).toBe(30);
	expect(Object.isFrozen(page.context("#host", original).fragments)).toBe(true);
	page.tree.setAttribute(page.id(), "style", "vertical-align:middle");
	expect(page.context().lines[0]).toMatchObject({ baseline: 12.5, height: 20 });
	expect(page.rect("#after").y).toBe(20);
});
