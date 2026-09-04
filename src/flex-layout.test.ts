import { afterEach, expect, it } from "vitest";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import {
	flexLayoutLimits,
	layoutFlexContainer,
	layoutFormattingFlexContainer,
	type FlexContainerConstraints,
	type FlexContainerLayoutOptions,
} from "./flex-layout.js";
import { resolveFlexLines } from "./flex-line.js";
import { reflowAllocatedFlexItems, reflowFlexItems } from "./flex-reflow.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	css = "",
	content = '<div id="first">aa</div><div id="second">bb</div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}#container{display:flex}#container>div{flex:0 0 24px;min-width:0}${css}</style><main id="container">${content}</main>`,
		"https://fixture.invalid/flex-layout",
	);
	trees.push(tree);
	const query = new DocumentQueries(tree);
	const id = (selector = "#container") => {
		const result = query.querySelector(selector);
		if (result === null) throw new Error("Missing fixture target");
		return result;
	};
	const ref = (selector = "#container") => tree.reference(id(selector));
	const layout = (
		width = 120,
		options?: FlexContainerLayoutOptions,
		containingWidth = width,
		containingHeight: number | null = null,
	) =>
		layoutFlexContainer(
			tree,
			ref(),
			{ contentWidth: width, containingWidth, containingHeight },
			options,
		);
	return { tree, id, ref, layout };
}
async function image(css = "") {
	const result = fixture(
		css,
		'<img id="first" src="/image.png"><div id="second">bb</div>',
	);
	const bytes = encodePng(createRaster(20, 10, [0, 255, 0, 255]));
	let requests = 0;
	const images = documentImages(result.tree, {
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
	});
	await images.settle();
	return { ...result, requests: () => requests };
}

it("places real item boxes and source-linked text in container content coordinates", () => {
	const { layout, ref } = fixture("#container{gap:6px}");
	const result = layout();
	expect(result.contentHeight).toBe(10);
	expect(
		result.items.map((item) => [
			item.x,
			item.y,
			item.box.contentWidth,
			item.box.contentHeight,
		]),
	).toEqual([
		[0, 0, 24, 10],
		[30, 0, 24, 10],
	]);
	expect(
		result.contexts.find((context) => context.ref === ref("#second"))
			?.glyphs[0],
	).toMatchObject({ x: 30, y: 1 });
	expect(
		result.contexts.find((context) => context.ref === ref("#second"))?.lines[0]
			.baseline,
	).toBe(8);
	expect(result.lines).toEqual([{ index: 0, crossSize: 10, crossOffset: 0 }]);
});
it("stretches auto-height text items using a second pass without changing main allocations", () => {
	const result = fixture(
		"#container>div{flex-basis:12px}",
		"<div>a</div><div>a b</div><div>a b c</div>",
	).layout();
	expect(result.contentHeight).toBe(30);
	expect(result.items.map((item) => item.box.contentHeight)).toEqual([
		30, 30, 30,
	]);
	expect(result.items.map((item) => item.box.naturalContentHeight)).toEqual([
		10, 20, 30,
	]);
	expect(result.main.items.map((item) => item.baseSize)).toEqual([12, 12, 12]);
	expect(result.metrics.reflowPasses).toBe(2);
});
it.each([
	["flex-start", 0],
	["flex-end", 30],
	["center", 15],
	["start", 0],
	["end", 30],
	["self-start", 0],
	["self-end", 30],
	["safe center", 15],
	["unsafe center", 15],
])("aligns fixed-height items with %s", (align, expected) => {
	const result = fixture(
		`#container{height:50px;align-items:${align}}#first{height:20px}`,
	).layout();
	expect(result.items[0].y).toBe(expected);
	expect(result.items[0].box.contentHeight).toBe(20);
});
it.each([
	["safe center", 0],
	["safe flex-end", 0],
	["unsafe center", -5],
	["flex-end", -10],
])("handles overflowing cross alignment %s", (align, expected) => {
	expect(
		fixture(
			`#container{height:10px;align-items:${align}}#first{height:20px}`,
		).layout().items[0].y,
	).toBe(expected);
});
it("preserves negative cross margins instead of clamping item placement to the line", () => {
	const result = fixture(
		"#container{align-items:flex-start}#first{height:10px;margin-top:-5px;margin-bottom:-3px}",
		'<div id="first"></div>',
	).layout();
	expect(result.contentHeight).toBe(2);
	expect(result.items[0]).toMatchObject({
		y: -5,
		marginTop: -5,
		marginBottom: -3,
	});
});
it.each([
	["margin-top:auto;margin-bottom:10px", 70, 10],
	["margin-top:10px;margin-bottom:auto", 10, 70],
	["margin-top:auto;margin-bottom:auto", 40, 40],
])("allocates positive cross auto-margin space for %s", (css, top, bottom) => {
	const result = fixture(
		`#container{height:100px;align-items:center}#first{height:20px;${css}}`,
	).layout();
	expect(result.items[0]).toMatchObject({
		y: top,
		marginTop: top,
		marginBottom: bottom,
	});
	expect(result.items[0].box).toMatchObject({
		marginTop: top,
		marginBottom: bottom,
	});
});
it.each(["wrap", "wrap-reverse"])(
	"uses block-start overflow rules for cross auto margins with %s",
	(wrap) => {
		const result = fixture(
			`#container{height:100px;flex-wrap:${wrap}}#first{height:200px;margin-top:auto;margin-bottom:10px}`,
			'<div id="first"></div>',
		).layout();
		expect(result.items[0]).toMatchObject({ marginTop: 0 });
		if (wrap === "wrap") expect(result.items[0].y).toBe(0);
	},
);
it("resolves overflowing auto margins against a definite single line rather than item height", () => {
	const result = fixture(
		"#container{height:100px}#first{height:200px;margin-top:auto;margin-bottom:10px}",
	).layout();
	expect(result.items[0]).toMatchObject({
		y: 0,
		marginTop: 0,
		marginBottom: -100,
	});
});
it.each([
	["flex-start", [0, 20]],
	["flex-end", [60, 80]],
	["center", [30, 50]],
	["space-between", [0, 80]],
	["space-around", [15, 65]],
	["space-evenly", [20, 60]],
	["stretch", [0, 50]],
	["normal", [0, 50]],
])("distributes wrapped lines with align-content:%s", (align, expected) => {
	const result = fixture(
		`#container{height:100px;flex-wrap:wrap;row-gap:10px;align-content:${align};align-items:flex-start}#container>div{flex-basis:70px}#second{height:20px}`,
	).layout();
	expect(result.lines.map((line) => line.crossOffset)).toEqual(expected);
	if (align === "stretch" || align === "normal")
		expect(result.lines.map((line) => line.crossSize)).toEqual([40, 50]);
});
it.each([
	["flex-start", [90, 60]],
	["flex-end", [30, 0]],
	["start", [30, 0]],
	["end", [90, 60]],
	["center", [60, 30]],
	["space-between", [90, 0]],
	["space-around", [75, 15]],
	["space-evenly", [70, 20]],
	["stretch", [60, 0]],
])(
	"maps wrap-reverse line distribution %s to physical coordinates",
	(align, expected) => {
		const result = fixture(
			`#container{height:100px;flex-wrap:wrap-reverse;row-gap:10px;align-content:${align};align-items:flex-start}#container>div{flex-basis:70px}#second{height:20px}`,
		).layout();
		expect(result.lines.map((line) => line.crossOffset)).toEqual(expected);
	},
);
it.each([
	["wrap", "safe center", [0, 20]],
	["wrap", "unsafe center", [-15, 5]],
	["wrap-reverse", "safe center", [20, 0]],
	["wrap-reverse", "unsafe center", [5, -15]],
	["wrap-reverse", "space-evenly", [20, 0]],
])("handles overflowing %s lines with %s", (wrap, align, expected) => {
	const result = fixture(
		`#container{height:10px;flex-wrap:${wrap};align-content:${align}}#container>div{height:20px;flex-basis:70px}`,
	).layout();
	expect(result.lines.map((line) => line.crossOffset)).toEqual(expected);
});
it("ignores align-content on nowrap containers", () => {
	const result = fixture(
		"#container{height:80px;align-content:space-evenly;align-items:flex-start}",
	).layout();
	expect(result.lines).toEqual([{ index: 0, crossSize: 80, crossOffset: 0 }]);
	expect(result.items[0].y).toBe(0);
});
it("resolves percentage row gaps only against definite content cross sizes", () => {
	const css =
		"#container{flex-wrap:wrap;row-gap:calc(10% + 5px);align-content:flex-start}#container>div{flex-basis:70px}";
	const indefinite = fixture(css).layout();
	expect(indefinite.rowGap).toBe(5);
	expect(indefinite.contentHeight).toBe(25);
	const definite = fixture(`${css}#container{height:100px}`).layout();
	expect(definite.rowGap).toBe(15);
	expect(definite.lines[1].crossOffset).toBe(25);
});
it("keeps cyclic percentage gaps zero even when a minimum increases auto height", () => {
	const result = fixture(
		"#container{flex-wrap:wrap;row-gap:10%;min-height:100px}#container>div{flex-basis:70px}",
	).layout();
	expect(result.rowGap).toBe(0);
	expect(result.contentHeight).toBe(100);
	expect(result.lines.map((line) => line.crossSize)).toEqual([50, 50]);
});
it.each([
	["min-height:40px", 40, 40],
	["max-height:5px", 5, 5],
	["min-height:40px;max-height:5px", 40, 40],
])(
	"clamps single-line auto container cross size for %s",
	(css, height, lineSize) => {
		const result = fixture(`#container{${css}}`).layout();
		expect(result.contentHeight).toBe(height);
		expect(result.lines[0].crossSize).toBe(lineSize);
	},
);
it("resolves container border-box cross bounds with the actual containing width", () => {
	const result = fixture(
		"#container{box-sizing:border-box;height:100px;padding:10%}",
	).layout(120, undefined, 200);
	expect(result.contentHeight).toBe(60);
	expect(result.lines[0].crossSize).toBe(60);
});
it("resolves percentage container heights against the supplied containing height", () => {
	const result = fixture("#container{height:50%}").layout(
		120,
		undefined,
		200,
		100,
	);
	expect(result.contentHeight).toBe(50);
});
it("matches the inspected WPT multiline stretch dimensions with native text", () => {
	const result = fixture(
		"#container{height:6em;flex-wrap:wrap;align-content:stretch}#container>div{flex:none;width:8em;margin:0 1em}",
		"<div>one</div><div>two</div><div>three</div>",
	).layout(160);
	expect(result.lines.map((line) => line.crossSize)).toEqual([24, 24]);
	expect(
		result.items.map((item) => [
			item.x,
			item.y,
			item.box.contentWidth,
			item.box.contentHeight,
		]),
	).toEqual([
		[8, 0, 64, 24],
		[88, 0, 64, 24],
		[8, 24, 64, 24],
	]);
});
it("stretches each line's items after line distribution and reflows percentage descendants", () => {
	const { layout, ref } = fixture(
		"#container{height:100px;flex-wrap:wrap}#container>div{flex-basis:70px}#child{height:50%}",
		'<div id="first"><div id="child"></div></div><div id="second">bb</div>',
	);
	const result = layout();
	expect(result.lines.map((line) => line.crossSize)).toEqual([45, 55]);
	expect(result.boxes.find((box) => box.ref === ref("#child"))).toMatchObject({
		contentHeight: 22.5,
		containingHeight: 45,
	});
	expect(result.items[1]).toMatchObject({ y: 45 });
	expect(result.metrics.reflowPasses).toBe(2);
});
it("reflows equal numeric stretch heights when definiteness changes", () => {
	const { layout, ref } = fixture(
		"#child{height:50%}",
		'<div id="first"><div id="child">aa</div></div><div id="second">bb</div>',
	);
	const result = layout();
	expect(result.contentHeight).toBe(10);
	expect(result.boxes.find((box) => box.ref === ref("#child"))).toMatchObject({
		contentHeight: 5,
		naturalContentHeight: 10,
		containingHeight: 10,
	});
	expect(result.metrics.reflowPasses).toBe(2);
});
it("honors item cross minimums without feeding stretched sizes back into flex allocation", () => {
	const result = fixture(
		"#container{height:20px}#first{min-height:40px}",
	).layout();
	expect(result.contentHeight).toBe(20);
	expect(result.items[0].box.contentHeight).toBe(40);
	expect(result.items[0].box.contentWidth).toBe(24);
});
it.each([
	["baseline", 50, [8, 0], 16],
	["last baseline", 50, [38, 30], 46],
])(
	"aligns %s groups using actual font baselines",
	(align, height, offsets, baseline) => {
		const result = fixture(
			`#container{height:${height}px;align-items:${align}}#second{font-size:16px}`,
		).layout();
		expect(result.items.map((item) => item.y)).toEqual(offsets);
		expect(
			result.items.map((item) =>
				align === "baseline" ? item.firstBaseline : item.lastBaseline,
			),
		).toEqual([baseline, baseline]);
	},
);
it.each([
	["baseline", 28, [8, 0]],
	["last baseline", 22, [0, 2]],
])(
	"sizes multiline %s groups from opposite-edge distances",
	(align, height, offsets) => {
		const result = fixture(
			`#container{align-items:${align}}#container>#first{flex-basis:12px}#second{font-size:16px}`,
			'<div id="first">a b</div><div id="second">c</div>',
		).layout();
		expect(result.contentHeight).toBe(height);
		expect(result.items.map((item) => item.y)).toEqual(offsets);
	},
);
it.each([
	["baseline", [38, 30], 46],
	["last baseline", [8, 0], 16],
])("maps %s groups through wrap-reverse", (align, offsets, baseline) => {
	const result = fixture(
		`#container{height:50px;flex-wrap:wrap-reverse;align-content:stretch;align-items:${align}}#second{font-size:16px}`,
	).layout();
	expect(result.items.map((item) => item.y)).toEqual(offsets);
	expect(
		result.items.map((item) =>
			align === "baseline" ? item.firstBaseline : item.lastBaseline,
		),
	).toEqual([baseline, baseline]);
});
it("synthesizes a missing flex baseline from the border box, not a fabricated text line", () => {
	const result = fixture(
		"#container{align-items:baseline}#first{height:30px}",
		'<div id="first"></div><div id="second">bb</div>',
	).layout();
	expect(result.contentHeight).toBe(32);
	expect(result.items.map((item) => item.y)).toEqual([0, 22]);
	expect(result.items.map((item) => item.firstBaseline)).toEqual([30, 30]);
	expect(
		result.contexts.filter((context) => context.lines.length),
	).toHaveLength(1);
	expect(result.contexts[0].glyphs).toHaveLength(0);
});
it("inherits a block child's actual baseline including margin placement", () => {
	const result = fixture(
		"#container{align-items:baseline}#child{margin-top:10px}#second{font-size:16px}",
		'<div id="first"><div id="child">aa</div></div><div id="second">b</div>',
	).layout();
	expect(result.contentHeight).toBe(22);
	expect(result.items.map((item) => item.y)).toEqual([0, 2]);
	expect(result.items.map((item) => item.firstBaseline)).toEqual([18, 18]);
});
it("excludes cross auto-margin items from baseline sharing", () => {
	const result = fixture(
		"#container{height:50px;align-items:baseline}#first{margin-top:auto}#second{font-size:16px}",
	).layout();
	expect(result.items[0].y).toBe(40);
	expect(result.items[1].y).toBe(0);
});
it("rejects unsupported software-control block baselines instead of guessing them", () => {
	expect(() =>
		fixture(
			"#container{align-items:baseline}",
			'<input id="first"><div id="second">bb</div>',
		).layout(),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
});
it("places controls when no unsupported baseline is requested", () => {
	const result = fixture(
		"#container{height:60px;align-items:center}",
		'<input id="first"><div id="second">bb</div>',
	).layout(240);
	expect(result.items[0].firstBaseline).toBeNull();
	expect(result.items[0].y).toBe(
		(60 - result.items[0].box.borderBoxHeight) / 2,
	);
});
it("translates nested boxes, fragments and glyphs together without changing source identity", () => {
	const { layout, ref } = fixture(
		"#container{height:60px;align-items:center;column-gap:10px}#first{height:20px}#second{padding:2px;border:1px solid red}#inner{padding:1px;border:1px solid blue}",
		'<div id="first"></div><div id="second"><span id="inner">bb</span></div>',
	);
	const result = layout();
	const item = result.items[1];
	const context = result.contexts.find((entry) => entry.ref === ref("#second"));
	expect(item.x).toBe(34);
	expect(context?.contentX).toBe(37);
	expect(context?.glyphs[0].x).toBe(39);
	expect(
		context?.fragments.some(
			(fragment) => fragment.ref === ref("#inner") && fragment.x === 37,
		),
	).toBe(true);
	expect(context?.glyphs[0].y).toBeGreaterThan(item.y);
});
it("keeps visual reverse placement separate from order-modified paint and DOM order", () => {
	const { tree, id, layout, ref } = fixture(
		"#container{flex-direction:row-reverse}#first{order:2}#second{order:-1}",
	);
	const children = [...tree.get(id()).children];
	const result = layout();
	expect(result.items.map((item) => item.x)).toEqual([72, 96]);
	expect(result.paintOrder).toEqual([result.items[1].id, result.items[0].id]);
	expect(result.items.map((item) => item.box.ref)).toEqual([
		ref("#first"),
		ref("#second"),
	]);
	expect(tree.get(id()).children).toEqual(children);
});
it.each([
	["space-evenly", "row", [24, 72]],
	["space-evenly", "row-reverse", [72, 24]],
	["safe center", "row", [36, 60]],
])("supports %s main distribution in %s", (align, direction, expected) => {
	expect(
		fixture(`#container{justify-content:${align};flex-direction:${direction}}`)
			.layout()
			.items.map((item) => item.x),
	).toEqual(expected);
});
it.each([
	"safe center",
	"safe flex-end",
	"space-around",
	"space-evenly",
	"space-between",
])(
	"anchors overflowing reversed %s main placement to physical start",
	(align) => {
		expect(
			fixture(`#container{justify-content:${align};flex-direction:row-reverse}`)
				.layout(20)
				.items.map((item) => item.x),
		).toEqual([24, 0]);
	},
);
it("keeps the numeric line kernel's default logical overflow convention explicit", () => {
	const inputs = [
		{ baseSize: 30, minSize: 30 },
		{ baseSize: 30, minSize: 30 },
	];
	expect(
		resolveFlexLines(inputs, 20, { justify: "safe center" }).lines[0].items.map(
			(item) => item.mainOffset,
		),
	).toEqual([0, 30]);
	expect(
		resolveFlexLines(inputs, 20, {
			justify: "safe center",
			overflowStart: "flex-end",
		}).lines[0].items.map((item) => item.mainOffset),
	).toEqual([-40, -10]);
	expect(() =>
		resolveFlexLines(inputs, 20, { overflowStart: "bad" as "flex-end" }),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it("keeps image main sizes fixed during line stretch and translates their actual boxes", async () => {
	const { layout, requests } = await image(
		"#container{height:100px;flex-wrap:wrap}#first{flex:0 0 70px;min-width:0}#container>#second{flex-basis:70px}",
	);
	const result = layout();
	expect(
		result.main.resolved.lines.map((line) => line.items[0].contentSize),
	).toEqual([70, 70]);
	expect(result.items[0].box.contentHeight).toBe(62.5);
	expect(result.items[1].box.contentHeight).toBe(37.5);
	expect(result.items[1].y).toBe(62.5);
	expect(requests()).toBe(1);
});
it("uses safe normal stretch prerequisites for decoded image bases", async () => {
	const { layout } = await image(
		"#container{height:30px}#first{align-self:safe normal}",
	);
	expect(layout().main.items[0].baseSize).toBe(60);
});
it("keeps allocated image cross margins consistent with final box records", async () => {
	const { layout } = await image(
		"#container{height:80px}#first{align-self:flex-start;margin-top:auto;margin-bottom:5px}",
	);
	const result = layout();
	expect(result.images[0].marginTop).toBe(65);
	expect(result.items[0].box.marginTop).toBe(65);
});
it("does not add unused trailing gaps to the coordinate bound", () => {
	expect(
		fixture("#container{row-gap:16777216px}", "<div>aa</div>").layout()
			.contentHeight,
	).toBe(10);
});
it("handles empty containers with min-height and no fake lines", () => {
	const result = fixture("#container{min-height:30px}", " ").layout();
	expect(result.contentHeight).toBe(30);
	expect(result.lines).toEqual([]);
	expect(result.items).toEqual([]);
});
it("reuses one formatting snapshot and returns immutable positioned records", () => {
	const { tree, ref, layout } = fixture();
	const formatting = buildFormattingTree(tree);
	const container = formatting.nodes.find((node) => node.ref === ref());
	const result = layoutFormattingFlexContainer(
		formatting,
		container?.id as number,
		{ contentWidth: 120, containingWidth: 120, containingHeight: null },
	);
	expect(result).toEqual(layout());
	expect(result.formatting).toBe(formatting);
	expect(Object.isFrozen(result.items[0].box)).toBe(true);
	expect(Object.isFrozen(result.contexts[0].glyphs)).toBe(true);
});
it("rejects an allocation from another document rather than reusing foreign references", () => {
	const first = fixture();
	const allocated = reflowFlexItems(first.tree, first.ref(), {
		contentWidth: 120,
		contentHeight: null,
	});
	const second = fixture();
	expect(() =>
		reflowAllocatedFlexItems(buildFormattingTree(second.tree), allocated.main),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it("tracks CSSOM-equivalent mutations without rewriting prior geometry", () => {
	const { tree, id, layout } = fixture("#container{height:60px}");
	const first = layout();
	tree.setAttribute(id(), "style", "height:100px;align-items:flex-end");
	tree.setTextContent(id("#second"), "longerword");
	const changed = layout();
	expect(first.items[0].box.contentHeight).toBe(60);
	expect(changed.items[0].y).toBe(90);
	expect(changed.items[1].box.contentWidth).toBe(24);
	expect(changed.revision).toBe(tree.revision);
});
it("keeps local geometry independent from the integrated page containing block", () => {
	const { tree, layout, ref } = fixture("#container{margin:5px;padding:3px}");
	const local = layout();
	expect(local.items[0].box.borderX).toBe(0);
	expect(local.items[0].box.borderY).toBe(0);
	expect(
		layoutDocument(tree).boxes.find((box) => box.ref === ref("#first")),
	).toMatchObject({ borderX: 8, borderY: 8 });
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBe(4);
	expect(local.items[0].box.borderY).toBe(0);
});
it.each([
	"#container{flex-direction:column;flex-wrap:wrap;position:absolute}",
	"#first{display:flex;flex-direction:column;flex-wrap:wrap;position:absolute}",
	"#first{writing-mode:vertical-rl}",
	"#container{flex-wrap:wrap;align-content:baseline}",
])("rejects unsupported container prerequisites: %s", (css) => {
	expect(() => fixture(css).layout()).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
it.each([
	null,
	{},
	{ contentWidth: 120, containingWidth: 120 },
	{ contentWidth: -1, containingWidth: 120, containingHeight: null },
	{
		contentWidth: 120,
		containingWidth: 120,
		containingHeight: null,
		guess: true,
	},
])(
	"rejects missing or invalid containing-block constraints %#",
	(constraints) => {
		const { tree, ref } = fixture();
		expect(() =>
			layoutFlexContainer(tree, ref(), constraints as FlexContainerConstraints),
		).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	},
);
it.each([
	null,
	{ maxWork: 0 },
	{ maxWork: flexLayoutLimits.maxWork + 1 },
	{ other: 0 },
	{ reflow: null },
	{ reflow: { maxWork: 0 } },
	{ reflow: { text: { maxLines: 0 } } },
])("validates work options before clamping phase budgets %#", (options) => {
	expect(() =>
		fixture().layout(120, options as FlexContainerLayoutOptions),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it("enforces exact aggregate work across allocation, both reflows and final positioning", () => {
	const { layout } = fixture();
	const result = layout();
	expect(layout(120, { maxWork: result.metrics.work }).metrics.work).toBe(
		result.metrics.work,
	);
	expect(() => layout(120, { maxWork: result.metrics.work - 1 })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => layout(120, { maxWork: 1 })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});
