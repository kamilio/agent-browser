import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import {
	flexLayoutLimits,
	layoutFlexContainer,
	layoutFormattingFlexContainer,
} from "./flex-layout.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { createRaster } from "./raster.js";
import { encodePng } from "./png.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	css = "",
	content = '<section id="inner" class="inner"><div id="first">aa bbbb</div><div id="second">cc</div></section><div id="peer">Z</div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{display:flex;width:120px;align-items:flex-start}.inner{display:flex;gap:4px}${css}</style><main id="outer">${content}</main>`,
		"https://fixture.invalid/flex-nested",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 120);
	const query = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = query.querySelector(selector);
		if (result === null) throw new Error(selector);
		return result;
	};
	const ref = (selector: string) => tree.reference(id(selector));
	const box = (selector: string, layout = layoutDocument(tree)) => {
		const result = layout.boxes.find((entry) => entry.ref === ref(selector));
		if (!result) throw new Error(`Missing box ${selector}`);
		return result;
	};
	const measure = (selector = "#inner") => {
		const result = measureIntrinsicWidths(tree).widths.find(
			(entry) => entry.ref === ref(selector),
		);
		if (!result) throw new Error(`Missing measurement ${selector}`);
		return result;
	};
	return { tree, id, ref, box, measure };
}

it.each([
	["", 40, 58],
	["#inner{flex-wrap:wrap}", 24, 58],
	["#inner{flex-wrap:wrap-reverse}", 24, 58],
	["#inner{flex-direction:row-reverse}", 40, 58],
	["#inner{column-gap:calc(10% + 3px)}", 39, 57],
	["#first{flex:0 0 10px;min-width:0}", 26, 26],
	["#first{flex:1 1 10px;min-width:0}", 40, 58],
	["#first{flex:1 0 50px;min-width:0}", 66, 66],
	["#first{flex:0 1 50px;min-width:0}", 40, 58],
	["#first{width:10px;flex:1 1 auto;min-width:0}", 40, 58],
	["#first{width:60px;flex:1}", 76, 76],
	["#first{min-width:50px}", 66, 66],
	["#first{max-width:20px}", 36, 36],
	["#first{width:60px;max-width:20px;min-width:50px}", 66, 66],
	["#first{margin-left:-3px;margin-right:auto}", 37, 55],
	[
		"#first{flex:0 0 0px;min-width:0;box-sizing:border-box;padding:2px;border:1px solid red}",
		22,
		22,
	],
	["#first{flex:0 0 min-content;min-width:0}", 40, 40],
	["#first{flex:0 0 max-content;min-width:0}", 58, 58],
	["#first{flex:0 0 50%;min-width:0}", 40, 58],
] as const)(
	"measures nested web-compatible intrinsic contributions: %s",
	(css, minimum, maximum) => {
		expect(fixture(css).measure()).toMatchObject({
			minContent: minimum,
			maxContent: maximum,
		});
	},
);

it("keeps container content widths separate from edges and authored contribution constraints", () => {
	const { measure } = fixture(
		"#inner{width:80px;padding:2px;border:1px solid red;margin:3px}",
	);
	expect(measure()).toMatchObject({
		minContent: 40,
		maxContent: 58,
		minContribution: 92,
		maxContribution: 92,
	});
});

it("measures flex through intervening normal blocks without substituting viewport widths", () => {
	const { tree, measure, box } = fixture(
		"#wrapper{padding:2px}",
		'<article id="wrapper"><section id="inner" class="inner"><div>aa bbbb</div><div>cc</div></section></article>',
	);
	expect(measure()).toMatchObject({ minContent: 40, maxContent: 58 });
	expect(measure("#wrapper")).toMatchObject({
		minContent: 40,
		maxContent: 58,
		minContribution: 44,
		maxContribution: 62,
	});
	expect(box("#wrapper").contentWidth).toBe(58);
	documentStyles(tree).setViewport(800, 600);
	expect(measure().maxContent).toBe(58);
});

it("positions nested containers, edges, item boxes, glyphs and outer siblings together", () => {
	const { tree, box, ref, id } = fixture(
		"main{padding:3px;border:1px solid red;margin:5px}#inner{padding:2px;border:1px solid blue}",
	);
	const layout = layoutDocument(tree);
	expect(box("#outer", layout)).toMatchObject({
		contentX: 9,
		contentY: 9,
		contentHeight: 16,
	});
	expect(box("#inner", layout)).toMatchObject({
		borderX: 9,
		borderY: 9,
		contentWidth: 58,
		contentHeight: 10,
	});
	expect(box("#first", layout)).toMatchObject({
		borderX: 12,
		borderY: 12,
		contentWidth: 42,
	});
	expect(box("#second", layout)).toMatchObject({
		borderX: 58,
		borderY: 12,
		contentWidth: 12,
	});
	expect(box("#peer", layout)).toMatchObject({ borderX: 73, borderY: 9 });
	expect(
		layout.contexts.find((context) => context.ref === ref("#second"))
			?.glyphs[0],
	).toMatchObject({ x: 58, y: 13 });
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#inner")),
	).toMatchObject({ x: 9, y: 9, width: 64, height: 16 });
	expect(new Set(layout.boxes.map((entry) => entry.id)).size).toBe(
		layout.boxes.length,
	);
});

it.each(["row", "row-reverse"])(
	"allocates nested %s widths before actually wrapping their text",
	(direction) => {
		const { tree, box } = fixture(
			`main{width:50px}#inner{flex:1;min-width:0;flex-direction:${direction}}#inner>div{flex:1;min-width:0}#peer{flex:0 0 10px}`,
		);
		const layout = layoutDocument(tree);
		expect(box("#inner", layout).contentWidth).toBe(40);
		expect(box("#first", layout)).toMatchObject({
			contentWidth: 18,
			contentHeight: 20,
			borderX: direction === "row" ? 0 : 22,
		});
		expect(box("#second", layout)).toMatchObject({
			contentWidth: 18,
			borderX: direction === "row" ? 22 : 0,
		});
		expect(box("#outer", layout).contentHeight).toBe(20);
	},
);

it.each(["height:60px", "min-height:60px", "height:100px;max-height:60px"])(
	"propagates outer stretch through two nested flex contexts for %s",
	(css) => {
		const { box } = fixture(
			`main{align-items:stretch;${css}}#inner{flex:1;padding:2px}#nested{display:flex;flex:1;padding:3px}#leaf{height:50%;width:10px}`,
			'<section id="inner" class="inner"><section id="nested"><div id="leaf"></div></section></section>',
		);
		expect(box("#inner")).toMatchObject({ contentHeight: 56, borderY: 0 });
		expect(box("#nested")).toMatchObject({ contentHeight: 50, borderY: 2 });
		expect(box("#leaf")).toMatchObject({ contentHeight: 25, borderY: 5 });
	},
);

it.each(["nowrap", "wrap", "wrap-reverse"])(
	"reflows a stretched nested %s container rather than scaling old boxes",
	(wrap) => {
		const { box } = fixture(
			`main{height:60px;align-items:stretch}#inner{width:30px;flex-wrap:${wrap};gap:4px}#inner>div{flex:0 0 20px;min-width:0}`,
			'<section id="inner" class="inner"><div id="first">A</div><div id="second">B</div></section>',
		);
		expect(box("#inner").contentHeight).toBe(60);
		expect(box("#first").contentHeight).toBe(wrap === "nowrap" ? 60 : 28);
		expect(box("#second").borderY).toBe(wrap === "wrap" ? 32 : 0);
	},
);

it("exports the visually first wrap-reverse line baseline using the pinned WPT structure", () => {
	const { tree, box, ref } = fixture(
		"main{align-items:baseline;height:150px;border:1px solid black}#inner{width:60px;flex-wrap:wrap-reverse;gap:0}#inner>div{width:60px;align-self:baseline}#first{order:1;font-size:10px}#second{order:2;font-size:30px}",
		'<section id="inner" class="inner"><div id="first">A</div><div id="second">B</div></section><div id="peer">Ref</div>',
	);
	const layout = layoutDocument(tree);
	const baseline = (selector: string) =>
		layout.contexts.find((context) => context.ref === ref(selector))?.lines[0]
			.baseline;
	expect(baseline("#peer")).toBe(baseline("#second"));
	expect(box("#second", layout).borderY).toBe(1);
	expect(box("#first", layout).borderY).toBe(38.5);
	expect(box("#inner", layout).flexBaselines?.first).toBe(30);
});

it.each([
	["baseline", "row", "first"],
	["baseline", "row-reverse", "second"],
	["last baseline", "row", "second"],
	["last baseline", "row-reverse", "first"],
] as const)(
	"exports %s from the selected physical %s item",
	(alignment, direction, selected) => {
		const { tree, ref } = fixture(
			`main{align-items:${alignment}}#inner{flex-direction:${direction};align-items:flex-start}#first{font-size:16px}#second{font-size:24px}`,
			'<section id="inner" class="inner"><div id="first">A</div><div id="second">B</div></section><div id="peer">C</div>',
		);
		const layout = layoutDocument(tree);
		const baseline = (selector: string) =>
			layout.contexts.find((context) => context.ref === ref(selector))?.lines[0]
				.baseline;
		expect(baseline("#peer")).toBe(baseline(`#${selected}`));
	},
);

it("prefers a shared baseline group over the first unaligned child", () => {
	const { tree, ref } = fixture(
		"main{align-items:baseline}#inner{align-items:flex-start}#first{font-size:24px}#second{align-self:baseline}",
	);
	const layout = layoutDocument(tree);
	const baseline = (selector: string) =>
		layout.contexts.find((context) => context.ref === ref(selector))?.lines[0]
			.baseline;
	expect(baseline("#peer")).toBe(baseline("#second"));
	expect(baseline("#peer")).not.toBe(baseline("#first"));
});

it("synthesizes an empty nested item's baseline without inventing text", () => {
	const { tree, box, ref } = fixture(
		"main{align-items:baseline}#inner{height:20px;width:30px}",
		'<section id="inner" class="inner"></section><div id="peer">Z</div>',
	);
	const layout = layoutDocument(tree);
	expect(box("#inner", layout).flexBaselines).toMatchObject({
		first: null,
		last: null,
		unsupported: false,
	});
	expect(
		layout.contexts.find((context) => context.ref === ref("#peer"))?.lines[0]
			.baseline,
	).toBe(20);
});

it("keeps nested paint scopes atomic and hit-testing in the same order", () => {
	const { tree, id } = fixture(
		"main{width:40px}main>section{flex:0 0 40px;min-width:0;margin-right:-40px;height:20px}#inner>div{width:20px}#first{background:red}#second{background:lime}#cover{display:flex;background:blue}",
		'<section id="inner" class="inner"><div id="first">A</div><div id="second">B</div></section><section id="cover"></section>',
	);
	const pixel = () => {
		const image = rasterizeDocument(tree).image;
		return [
			...image.pixels.slice(
				(2 * image.width + 1) * 4,
				(2 * image.width + 1) * 4 + 4,
			),
		];
	};
	expect(pixel()).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(tree).elementFromPoint(1, 2)).toBe(id("#cover"));
	tree.setAttribute(id("#inner"), "style", "order:2");
	expect(documentHitTesting(tree).elementFromPoint(1, 2)).toBe(id("#first"));
	expect(pixel()).not.toEqual([0, 0, 255, 255]);
});

it("invalidates nested measured inputs and parent flow after guest-equivalent text/style changes", () => {
	const { tree, id, box } = fixture(
		"main{width:50px}#inner{min-width:0;flex:1}#peer{width:10px}",
	);
	const original = layoutDocument(tree);
	tree.setTextContent(id("#first"), "a b c d e f");
	tree.setAttribute(id("#inner"), "style", "flex-wrap:wrap");
	const changed = layoutDocument(tree);
	expect(box("#inner", changed).contentHeight).toBeGreaterThan(
		box("#inner", original).contentHeight,
	);
	expect(changed.text.horizontal.formatting.revision).toBe(tree.revision);
	expect(Object.isFrozen(original.boxes)).toBe(true);
});

it("exposes nested overflow to the root scroll owner and client geometry", () => {
	const { tree, id } = fixture(
		"main{width:20px}#inner{flex:0 0 20px;min-width:0;flex-wrap:wrap}#inner>div{width:20px;height:20px}",
	);
	documentStyles(tree).setViewport(40, 20);
	expect(documentScroll(tree).bounds().y).toBe(24);
	documentScroll(tree).to(0, 24);
	expect(documentGeometry(tree).getBoundingClientRect(id("#second")).y).toBe(0);
	expect(documentHitTesting(tree).elementFromPoint(15, 15)).toBe(id("#second"));
});

it("hits flex containers in empty padding and gaps without promoting the target to an ancestor", () => {
	const { tree, id } = fixture(
		"main{padding:4px}#inner{padding:3px;gap:10px}#inner>div{width:20px}",
	);
	expect(documentHitTesting(tree).elementFromPoint(1, 1)).toBe(id("#outer"));
	expect(documentHitTesting(tree).elementFromPoint(5, 5)).toBe(id("#inner"));
	expect(documentHitTesting(tree).elementFromPoint(30, 10)).toBe(id("#inner"));
});

it("keeps recursive work deterministic and enforces exact aggregate limits", () => {
	const { tree } = fixture(
		"main{height:60px;align-items:stretch}#inner{flex:1}",
	);
	const result = layoutDocument(tree);
	expect(
		layoutDocument(tree, { maxWork: result.metrics.work }).metrics.work,
	).toBe(result.metrics.work);
	expect(() =>
		layoutDocument(tree, { maxWork: result.metrics.work - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("bounds recursive entry before stack growth and does not clamp invalid nesting", () => {
	const { tree, ref } = fixture();
	const formatting = buildFormattingTree(tree);
	const container = formatting.nodes.find((node) => node.ref === ref("#outer"));
	if (!container) throw new Error("Missing outer");
	for (const nesting of [-1, 0.5, flexLayoutLimits.maxNesting])
		expect(() =>
			layoutFormattingFlexContainer(
				formatting,
				container.id,
				{ contentWidth: 120, containingWidth: 120, containingHeight: null },
				{},
				{ nesting },
			),
		).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it.each([
	"",
	"img{height:100%}",
	"img{box-sizing:border-box;padding:2px;border:1px solid red}",
])(
	"includes definite nested image cross sizes in intrinsic and final allocation: %s",
	async (css) => {
		const { tree, box, measure } = fixture(
			`main{height:40px;align-items:stretch}#inner{gap:0}${css}`,
			'<section id="inner" class="inner"><img id="image" src="/image.png"></section>',
		);
		const bytes = encodePng(createRaster(20, 10, [0, 255, 0, 255]));
		let requests = 0;
		await documentImages(tree, {
			fetch: async (url) => {
				requests++;
				return {
					url,
					status: 200,
					headers: { "content-type": ["image/png"] },
					body: bytes,
					redirects: [],
					encodedBytes: bytes.length,
					elapsedMs: 0,
				};
			},
		}).settle();
		const expected = css.includes("border") ? 74 : 80;
		expect(measure().maxContent).toBe(expected);
		expect(box("#inner").contentWidth).toBe(expected);
		expect(box("#image").borderBoxWidth).toBe(expected);
		expect(box("#image").borderBoxHeight).toBe(40);
		expect(rasterizeDocument(tree).metrics.paintedImages).toBe(1);
		expect(requests).toBe(1);
	},
);

it.each(["#first{flex-grow:1e10}", "#first{flex-shrink:1e10}"])(
	"retains factor bounds in intrinsic-only entry points: %s",
	(css) => {
		expect(() => fixture(css).measure()).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("retains the per-container item bound before intrinsic-only measurement", () => {
	const { measure } = fixture(
		"",
		`<section id="inner" class="inner">${"<div>x</div>".repeat(4097)}</section>`,
	);
	expect(() => measure()).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("can lay out a real nested chain and shares text limits through recursive contexts", () => {
	const depth = 8;
	const { tree } = fixture(
		"main{height:40px;align-items:stretch}.inner{flex:1;min-width:0}",
		`${'<section class="inner">'.repeat(depth)}<div>a</div>${"</section>".repeat(depth)}`,
	);
	const result = layoutDocument(tree);
	expect(
		result.contexts.flatMap((context) =>
			context.glyphs.map((glyph) => glyph.character),
		),
	).toEqual(["a"]);
	expect(result.boxes.every((box) => box.borderY === 0)).toBe(true);
	expect(result.boxes.at(-1)?.contentHeight).toBe(40);
	expect(() =>
		layoutDocument(
			fixture(
				"",
				'<section class="inner"><div>a</div></section><section class="inner"><div>b</div></section>',
			).tree,
			{ text: { maxTokens: 1 } },
		),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it.each([
	"#inner{flex-direction:column;flex-wrap:wrap;position:absolute}",
	"#first{display:grid}",
	"#first{position:absolute}",
	"#first{writing-mode:vertical-rl}",
])("does not hide unsupported nested contexts: %s", (css) => {
	const { tree, ref } = fixture(css);
	expect(() => layoutDocument(tree)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() =>
		layoutFlexContainer(tree, ref("#outer"), {
			contentWidth: 120,
			containingWidth: 120,
			containingHeight: null,
		}),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
});
