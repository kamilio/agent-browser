import { afterEach, expect, it } from "vitest";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import {
	type FlexReflowOptions,
	flexReflowLimits,
	reflowFlexItems,
	reflowFormattingFlexItems,
} from "./flex-reflow.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import type { TextLine } from "./text-layout.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(css = "", content = '<span id="item">aa bbbb cc</span>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}#container{display:flex;width:120px}#item{flex:1 1 auto;min-width:0}${css}</style><main id="container">${content}</main>`,
		"https://fixture.invalid/flex-reflow",
	);
	trees.push(tree);
	const query = new DocumentQueries(tree);
	const id = (selector = "#container") => {
		const result = query.querySelector(selector);
		if (result === null) throw new Error("Missing fixture element");
		return result;
	};
	const ref = (selector = "#container") => tree.reference(id(selector));
	const reflow = (
		width = 120,
		height: number | null = null,
		options?: FlexReflowOptions,
	) =>
		reflowFlexItems(
			tree,
			ref(),
			{ contentWidth: width, contentHeight: height },
			options,
		);
	return { tree, id, ref, reflow };
}
async function imageFixture(
	css = "",
	content = '<img id="item" src="/image.png">',
) {
	const result = fixture(css, content);
	const bytes = encodePng(createRaster(20, 10, [255, 0, 0, 255]));
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
function sourcePath(tree: DocumentTree, reference: string) {
	let node = tree.resolve(reference);
	const path: number[] = [];
	while (node.parent !== null) {
		const parent = tree.get(node.parent);
		path.unshift(parent.children.indexOf(node.id));
		node = parent;
	}
	return path.join("/");
}

function sourceLines(
	tree: DocumentTree,
	lines: readonly TextLine[] | undefined,
) {
	return lines?.map((line) => ({
		...line,
		...(line.sourceBreak
			? {
					sourceBreak: {
						...line.sourceBreak,
						sources: line.sourceBreak.sources.map((source) => ({
							...source,
							ref: sourcePath(tree, source.ref),
						})),
					},
				}
			: {}),
	}));
}

it.each([
	[120, 1, 10],
	[60, 1, 10],
	[42, 2, 20],
	[30, 3, 30],
	[24, 3, 30],
	[18, 3, 30],
	[0, 3, 30],
])("reflows real words at allocated width %s", (width, lines, height) => {
	const result = fixture().reflow(width);
	expect(result.items[0].box).toMatchObject({
		contentWidth: width,
		naturalContentHeight: height,
		contentHeight: height,
		borderY: 0,
		borderX: 0,
	});
	expect(result.layout.contexts[0].lines).toHaveLength(lines);
	expect(result.layout.text.horizontal.stage).toBe(
		"isolated-block-horizontal-reflow",
	);
	expect(result.layout.stage).toBe("isolated-block-layout");
});
it("uses allocated width rather than reapplying authored preferred/min/max sizing", () => {
	const result = fixture("#item{width:1000px;max-width:80px}").reflow(30);
	expect(result.main.items[0].baseSize).toBe(1000);
	expect(result.main.resolved.lines[0].items[0].contentSize).toBe(30);
	expect(result.items[0].box.contentWidth).toBe(30);
	expect(result.items[0].box.contentHeight).toBe(30);
});
it("preserves overflowing automatic minima when min-width is not explicitly zero", () => {
	const result = fixture("#item{min-width:auto}").reflow(10);
	expect(result.items[0].box.contentWidth).toBe(24);
	expect(result.layout.contexts[0].lines).toHaveLength(3);
});
it("keeps item-local origins separate from main placement and outer margins", () => {
	const result = fixture(
		"#item{padding:2px;border:1px solid red;margin:5px 11px 9px 7px}",
	).reflow(54);
	expect(result.items[0].box).toMatchObject({
		contentWidth: 30,
		borderBoxWidth: 36,
		borderBoxHeight: 36,
		borderX: 0,
		contentX: 3,
		borderY: 0,
		contentY: 3,
		marginLeft: 7,
		marginRight: 11,
		marginTop: 5,
		marginBottom: 9,
	});
	expect(result.items[0].outerCrossSize).toBe(50);
	expect(result.layout.contexts[0].glyphs[0]).toMatchObject({ x: 3, y: 4 });
	expect(result.layout.contexts[0].lines[0].baseline).toBe(11);
});
it("does not run normal-block overconstraint balancing on allocated root margins", () => {
	const result = fixture("#item{flex:0 0 24px;margin:0 3px 0 7px}").reflow(120);
	expect(result.items[0].box).toMatchObject({
		marginLeft: 7,
		marginRight: 3,
		borderX: 0,
		contentWidth: 24,
	});
});
it("keeps allocated auto margins without shifting the local reflow origin", () => {
	const result = fixture("#item{flex:0 0 24px;margin-left:auto}").reflow();
	expect(result.items[0].box).toMatchObject({
		marginLeft: 96,
		marginRight: 0,
		borderX: 0,
		contentX: 0,
	});
	expect(result.main.resolved.lines[0].items[0].mainOffset).toBe(96);
});
it("maps reverse-row allocated margins back to physical box sides", () => {
	const result = fixture(
		"#container{flex-direction:row-reverse}#item{margin-left:3px;margin-right:9px}",
	).reflow();
	expect(result.items[0].box).toMatchObject({
		marginLeft: 3,
		marginRight: 9,
		borderX: 0,
	});
});
it("resolves descendants against allocated content width, not the container width", () => {
	const { reflow, ref } = fixture(
		"#child{width:50%;margin:0 auto}",
		'<div id="item"><div id="child">aa bbbb</div></div>',
	);
	const result = reflow(30);
	const child = result.layout.boxes.find((box) => box.ref === ref("#child"));
	expect(child).toMatchObject({
		containingWidth: 30,
		contentWidth: 15,
		marginLeft: 7.5,
		borderX: 7.5,
		contentHeight: 20,
	});
	expect(result.items[0].box.contentHeight).toBe(20);
});
it("resolves root and descendant percentage padding against their own containing widths", () => {
	const { reflow, ref } = fixture(
		"#item{padding:10%}#child{padding:10%}",
		'<div id="item"><div id="child">aa</div></div>',
	);
	const result = reflow(100);
	expect(result.items[0].box).toMatchObject({
		paddingLeft: 10,
		paddingTop: 10,
		contentWidth: 80,
	});
	expect(
		result.layout.boxes.find((box) => box.ref === ref("#child")),
	).toMatchObject({
		paddingLeft: 8,
		paddingTop: 8,
		containingWidth: 80,
		contentWidth: 64,
	});
});
it("isolates root margin collapse while preserving descendant sibling collapsing", () => {
	const { reflow, ref } = fixture(
		"#item{margin:30px 0}#first{height:10px;margin-bottom:20px}#last{height:10px;margin-top:30px}",
		'<div id="item"><div id="first"></div><div id="last"></div></div>',
	);
	const result = reflow(60);
	expect(result.items[0].box).toMatchObject({
		contentHeight: 50,
		borderY: 0,
		marginCollapse: {
			withFirstChild: false,
			withLastChild: false,
			through: false,
		},
	});
	expect(
		result.layout.boxes.find((box) => box.ref === ref("#last"))?.borderY,
	).toBe(40);
	expect(result.items[0].outerCrossSize).toBe(110);
});
it("retains first/last child margins inside the flex item's independent context", () => {
	const result = fixture(
		"#child{height:5px;margin:10px 0 20px}",
		'<div id="item"><div id="child"></div></div>',
	).reflow();
	expect(result.items[0].box.contentHeight).toBe(35);
});
it.each([
	["height:50px", 50],
	["min-height:40px", 40],
	["max-height:15px", 15],
	["min-height:40px;max-height:15px", 40],
	["height:50%;min-height:0", 30],
])(
	"applies cross constraints without losing natural text height: %s",
	(css, height) => {
		const result = fixture(`#item{${css}}`).reflow(30);
		expect(result.items[0].box).toMatchObject({
			naturalContentHeight: 30,
			contentHeight: height,
		});
		expect(result.layout.contexts[0].lines).toHaveLength(3);
	},
);
it.each([
	["normal", 80],
	["stretch", 80],
	["flex-start", 30],
	["center", 30],
])(
	"uses definite single-line cross prerequisites for align-items:%s",
	(align, height) => {
		const result = fixture(`#container{align-items:${align}}`).reflow(30, 80);
		expect(result.items[0].box).toMatchObject({
			naturalContentHeight: 30,
			contentHeight: height,
		});
	},
);
it("subtracts cross margins and edges before definite stretch, and honors minimums", () => {
	const result = fixture(
		"#item{padding:2px;border:1px solid red;margin-top:7px;margin-bottom:9px;min-height:50px}",
	).reflow(36, 60);
	expect(result.items[0].box).toMatchObject({
		contentHeight: 50,
		borderBoxHeight: 56,
		naturalContentHeight: 30,
	});
	expect(result.items[0].outerCrossSize).toBe(72);
});
it("does not stretch an item with cross-axis auto margins", () => {
	const result = fixture("#item{margin-top:auto}").reflow(30, 80);
	expect(result.items[0].box.contentHeight).toBe(30);
});
it("propagates a definite stretched content height to percentage descendants", () => {
	const { reflow, ref } = fixture(
		"#child{height:50%}",
		'<div id="item"><div id="child"></div></div>',
	);
	const result = reflow(60, 80);
	expect(result.items[0].box).toMatchObject({
		contentHeight: 80,
		naturalContentHeight: 40,
	});
	expect(
		result.layout.boxes.find((box) => box.ref === ref("#child")),
	).toMatchObject({ containingHeight: 80, contentHeight: 40 });
});
it("never substitutes viewport height for an indefinite flex cross constraint", () => {
	const { tree, reflow, ref } = fixture(
		"#child{height:50%}",
		'<div id="item"><div id="child"></div></div>',
	);
	documentStyles(tree).setViewport(800, 700);
	const result = reflow(60);
	expect(result.items[0].box).toMatchObject({
		containingHeight: null,
		contentHeight: 0,
	});
	expect(
		result.layout.boxes.find((box) => box.ref === ref("#child")),
	).toMatchObject({ containingHeight: null, contentHeight: 0 });
});
it("retains definite zero cross height, including descendant percentage resolution", () => {
	const { reflow, ref } = fixture(
		"#child{height:50%}",
		'<div id="item"><div id="child">abc</div></div>',
	);
	const result = reflow(60, 0);
	expect(result.items[0].box.contentHeight).toBe(0);
	expect(
		result.layout.boxes.find((box) => box.ref === ref("#child")),
	).toMatchObject({
		containingHeight: 0,
		contentHeight: 0,
		naturalContentHeight: 10,
	});
});
it("reflows wrapped items independently rather than assigning the whole container cross size", () => {
	const result = fixture(
		"#container{flex-wrap:wrap}span{flex:0 0 24px}",
		"<span>aa bb</span><span>cc dd ee</span><span>ff</span>",
	).reflow(48, 100);
	expect(
		result.items.map((item) => [
			item.line,
			item.box.contentWidth,
			item.box.contentHeight,
			item.box.borderY,
		]),
	).toEqual([
		[0, 24, 20, 0],
		[0, 24, 30, 0],
		[1, 24, 10, 0],
	]);
});
it("keeps source order and reference identity separate from flex line order", () => {
	const { tree, ref, reflow } = fixture(
		"#item{order:2}#other{order:-1}",
		'<span id="item">aa</span><span id="other">bb</span>',
	);
	const revision = tree.revision;
	const result = reflow(48);
	expect(result.items.map((item) => item.ref)).toEqual([
		ref("#item"),
		ref("#other"),
	]);
	expect(result.main.resolved.lines[0].items.map((item) => item.index)).toEqual(
		[1, 0],
	);
	expect(
		result.items.every(
			(item) => item.box.borderY === 0 && item.box.borderX === 0,
		),
	).toBe(true);
	expect(tree.revision).toBe(revision);
});
it("produces actual text contexts for anonymous items without fabricating DOM refs", () => {
	const result = fixture("", "aa bbbb cc").reflow(30);
	expect(result.items[0].ref).toBeUndefined();
	expect(result.items[0].box.contentHeight).toBe(30);
	expect(result.layout.contexts[0].lines).toHaveLength(3);
	expect(
		result.layout.contexts[0].glyphs.map((glyph) => glyph.character).join(""),
	).toBe("aabbbbcc");
});
it.each(["normal", "nowrap", "pre", "pre-line"])(
	"uses the existing text/fragment pipeline for white-space:%s",
	(mode) => {
		const content = '<div id="item">a<span id="inner">bb cc</span> d\ne</div>';
		const css = `#item{white-space:${mode}}#inner{font-size:16px;padding:2px;border:1px solid red}`;
		const source = fixture(css, content);
		const flex = source.reflow(30);
		const normal = fixture(
			`${css}#container{display:block}#item{display:flow-root;width:30px}`,
			content,
		);
		const expected = layoutDocument(normal.tree).contexts.find(
			(context) => context.ref === normal.ref("#item"),
		);
		expect(sourceLines(source.tree, flex.layout.contexts[0].lines)).toEqual(
			sourceLines(normal.tree, expected?.lines),
		);
		expect(
			flex.layout.contexts[0].glyphs.map((glyph) => ({
				...glyph,
				ref: sourcePath(source.tree, glyph.ref),
			})),
		).toEqual(
			expected?.glyphs.map((glyph) => ({
				...glyph,
				ref: sourcePath(normal.tree, glyph.ref),
			})),
		);
		expect(
			flex.layout.contexts[0].fragments.map((fragment) => ({
				...fragment,
				ref: sourcePath(source.tree, fragment.ref),
			})),
		).toEqual(
			expected?.fragments.map((fragment) => ({
				...fragment,
				ref: sourcePath(normal.tree, fragment.ref),
			})),
		);
	},
);
it("uses native control reflow without scaling its contents as an image", () => {
	const result = fixture("", '<input id="item" value="abcdef">').reflow(30);
	expect(result.items[0].box.contentWidth).toBe(30);
	expect(result.items[0].box.contentHeight).toBeGreaterThan(0);
	expect(result.layout.text.horizontal.images[0].contentHeight).toBe(
		result.items[0].box.contentHeight,
	);
});
it.each([
	[20, 10],
	[80, 40],
	[0, 0],
])(
	"reflows decoded image cross size from allocated width %s",
	async (width, height) => {
		const { reflow, requests } = await imageFixture();
		const result = reflow(width);
		expect(result.items[0].box).toMatchObject({
			contentWidth: width,
			contentHeight: height,
		});
		expect(result.layout.text.horizontal.images[0]).toMatchObject({
			contentWidth: width,
			contentHeight: height,
		});
		expect(requests()).toBe(1);
	},
);
it("does not reapply image min/max main constraints or transfer cross clamps back to main size", async () => {
	const { reflow } = await imageFixture(
		"#item{width:200px;max-width:100px;max-height:15px}",
	);
	expect(reflow(80).items[0].box).toMatchObject({
		contentWidth: 80,
		contentHeight: 15,
	});
});
it("uses allocated main size and definite stretch cross size independently for images", async () => {
	const { reflow } = await imageFixture();
	expect(reflow(80, 30).items[0].box).toMatchObject({
		contentWidth: 80,
		contentHeight: 30,
	});
});
it("retains allocated image auto margins consistently across horizontal records", async () => {
	const { reflow } = await imageFixture(
		"#item{flex:0 0 20px;margin-left:auto}",
	);
	const result = reflow(80);
	expect(result.items[0].box).toMatchObject({ marginLeft: 60, marginRight: 0 });
	expect(result.layout.text.horizontal.images[0]).toMatchObject({
		marginLeft: 60,
		marginRight: 0,
	});
});
it("keeps border-box image cross height consistent between width and height phases", async () => {
	const { reflow } = await imageFixture(
		"#item{box-sizing:border-box;padding:2px;border:1px solid red}",
	);
	const result = reflow(86, 36);
	expect(result.items[0].box).toMatchObject({
		contentWidth: 80,
		contentHeight: 30,
		borderBoxWidth: 86,
		borderBoxHeight: 36,
	});
	expect(result.layout.text.horizontal.images[0]).toMatchObject({
		contentHeight: 30,
		borderBoxHeight: 36,
	});
});
it("reflows inline percentage images against actual allocated content width", async () => {
	const { reflow } = await imageFixture(
		"img{width:100%}",
		'<div id="item"><img src="/image.png"></div>',
	);
	const result = reflow(80);
	expect(result.layout.text.horizontal.images[0]).toMatchObject({
		contentWidth: 80,
		contentHeight: 40,
		containingWidth: 80,
	});
	expect(
		result.layout.contexts[0].fragments.some(
			(fragment) => fragment.width === 80 && fragment.height === 40,
		),
	).toBe(true);
});
it("reuses the same immutable formatting snapshot and emits frozen results", () => {
	const { tree, ref, reflow } = fixture();
	const formatting = buildFormattingTree(tree);
	const container = formatting.nodes.find((node) => node.ref === ref());
	const result = reflowFormattingFlexItems(
		formatting,
		container?.id as number,
		{ contentWidth: 30, contentHeight: null },
	);
	expect(result).toEqual(reflow(30));
	expect(result.layout.text.horizontal.formatting).toBe(formatting);
	expect(Object.isFrozen(result.items)).toBe(true);
	expect(Object.isFrozen(result.items[0].box)).toBe(true);
	expect(Object.isFrozen(result.layout.contexts[0].glyphs)).toBe(true);
});
it("reflects CSSOM, text, font and viewport revisions without mutating prior results", () => {
	const { tree, id, reflow } = fixture();
	const original = reflow(30);
	tree.setAttribute(id("#item"), "style", "font-size:16px");
	tree.setTextContent(id("#item"), "aa bb");
	documentStyles(tree).setViewport(600, 400);
	const changed = reflow(30);
	expect(original.items[0].box.contentHeight).toBe(30);
	expect(changed.items[0].box.contentHeight).toBe(40);
	expect(changed.revision).toBe(tree.revision);
});
it("keeps item reflow separate from page placement and the width-only guard", () => {
	const { tree, reflow, ref } = fixture("#container{margin-top:10px}");
	const local = reflow();
	expect(local.items[0].box.borderY).toBe(0);
	expect(
		layoutDocument(tree).boxes.find((box) => box.ref === ref("#item"))?.borderY,
	).toBe(10);
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBeGreaterThan(0);
	expect(() => resolveDocumentBlockWidths(tree)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
it("reflows a Grid item's native child boxes inside a Flex container", () => {
	const { reflow, ref } = fixture(
		"#item{display:grid;grid-template-columns:20px 30px;grid-template-rows:15px}",
		'<div id="item"><span id="left">A</span><span id="right">B</span></div>',
	);
	const result = reflow();
	expect(result.items[0].box).toMatchObject({
		contentWidth: 120,
		contentHeight: 15,
	});
	expect(
		result.layout.boxes.find((box) => box.ref === ref("#right")),
	).toMatchObject({ borderX: 20, borderBoxWidth: 30, borderBoxHeight: 15 });
});
it.each([
	"#container{flex-direction:column}",
	"#item{display:flex;flex-direction:column;flex-wrap:wrap;position:absolute}",
	"#item{display:table}",
])("does not hide unsupported item content: %s", (css) => {
	expect(() => fixture(css).reflow()).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
it("reflows a hidden-overflow item below its content-based automatic minimum", () => {
	const result = fixture("#item{overflow:hidden;min-width:auto}").reflow(18);
	expect(result.main.items[0]).toMatchObject({
		minContent: 24,
		minSize: 0,
		minimumSource: "scrollable",
	});
	expect(result.items[0].box).toMatchObject({
		contentWidth: 18,
		contentHeight: 30,
	});
	expect(result.layout.contexts[0].lines).toHaveLength(3);
});
it.each([
	null,
	{ maxWork: 0 },
	{ maxWork: flexReflowLimits.maxWork + 1 },
	{ extra: 1 },
	{ main: null },
	{ main: { maxWork: 0 } },
	{ text: null },
	{ text: { maxWork: 0 } },
	{ text: { formatting: {} } },
])("rejects invalid options before expensive phases %#", (options) => {
	expect(() =>
		fixture().reflow(30, null, options as FlexReflowOptions),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
});
it("enforces exact aggregate work and independently bounded reflow text", () => {
	const { reflow } = fixture();
	const result = reflow(30);
	expect(reflow(30, null, { maxWork: result.metrics.work }).metrics.work).toBe(
		result.metrics.work,
	);
	expect(() =>
		reflow(30, null, { maxWork: result.metrics.work - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	expect(() => reflow(30, null, { maxWork: 1 })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => reflow(30, null, { text: { maxTokens: 1 } })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => reflow(30, null, { text: { maxLines: 1 } })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});
it("handles empty flex containers without inventing boxes or contexts", () => {
	const result = fixture("", "  ").reflow();
	expect(result.items).toEqual([]);
	expect(result.layout.boxes).toEqual([]);
	expect(result.layout.contexts).toEqual([]);
});
