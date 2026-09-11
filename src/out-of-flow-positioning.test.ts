import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutPositionedDocument } from "./out-of-flow-positioning.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(html: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}body{font-size:8px;line-height:10px}${css}</style>${html}`,
		"https://fixture.invalid/positioning",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const box = (selector: string) => {
		const found = layoutDocument(tree).boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing box ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		box,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

function pixel(tree: DocumentTree, x: number, y: number) {
	const image = rasterizeDocument(tree).image;
	return [
		...image.pixels.slice(
			(y * image.width + x) * 4,
			(y * image.width + x) * 4 + 4,
		),
	];
}

it("excludes positioned boxes from flow and auto parent height", () => {
	const { tree, box } = fixture(
		'<main><div id="before"></div><div id="absolute"></div><div id="after"></div></main>',
		"#before,#after{height:10px}#absolute{position:absolute;left:30px;top:20px;width:40px;height:150px;background:red}",
	);
	expect(box("#after").borderY).toBe(10);
	expect(box("main").contentHeight).toBe(20);
	expect(layoutDocument(tree).flowHeight).toBe(20);
	expect(box("#absolute")).toMatchObject({
		borderX: 30,
		borderY: 20,
		contentWidth: 40,
		contentHeight: 150,
	});
	expect(documentScroll(tree).bounds().y).toBe(70);
});

it("uses the nearest positioned padding box across a static ancestor", () => {
	const { box, rect } = fixture(
		'<main><section><div id="absolute"></div></section></main>',
		"main{position:relative;left:7px;top:9px;width:100px;height:50px;padding:10px;border:2px solid black;margin:3px}section{padding:13px}#absolute{position:absolute;left:10%;top:20%;width:50%;height:50%;background:red}",
	);
	const parent = box("main");
	expect(rect("#absolute")).toMatchObject({
		x: parent.borderX + 2 + 12,
		y: parent.borderY + 2 + 14,
		width: 60,
		height: 35,
	});
	expect(box("#absolute").containingBlock).toBe(parent.id);
});

it("positions an offscreen menu outside a static Grid body's tracks", () => {
	const { tree, box, rect } = fixture(
		'<ul id="menu"><li>Skip</li></ul><main>Content</main>',
		"body{display:grid;grid-template-columns:200px;grid-template-rows:20px}#menu{position:absolute;top:-320px;left:2px;right:2px;width:calc(100% - 2px * 2);margin:0;padding:0;list-style-type:none}main{height:10px}",
	);
	expect(rect("#menu")).toMatchObject({
		x: 2,
		y: -320,
		width: 196,
		height: 10,
	});
	expect(box("main")).toMatchObject({ borderX: 0, borderY: 0 });
	expect(box("body").contentHeight).toBe(20);
	expect(layoutDocument(tree).flowHeight).toBe(20);
	const formatting = buildFormattingTree(tree);
	const menu = formatting.nodes.find((node) => node.ref === box("#menu").ref);
	expect(menu?.gridItem).not.toBe(true);
	expect(box("#menu").containingBlock).toBe(formatting.root);
});

it.each([
	["absolute", "left:10%;top:20%", 20, 20],
	["absolute", "right:10%;bottom:20%", 160, 70],
	["fixed", "left:10%;top:20%", 20, 20],
	["fixed", "right:10%;bottom:20%", 160, 70],
])(
	"uses viewport anchors for a %s child of a static Grid: %s",
	(position, insets, x, y) => {
		const { box, rect } = fixture(
			'<main><div id="target"></div><div id="flow"></div></main>',
			`main{display:grid;grid-template-columns:80px;grid-template-rows:30px;width:80px;margin:7px}#flow{height:15px}#target{position:${position};${insets};width:20px;height:10px}`,
		);
		expect(rect("#target")).toMatchObject({ x, y, width: 20, height: 10 });
		expect(box("#flow")).toMatchObject({ borderX: 7, borderY: 7 });
		expect(box("main").contentHeight).toBe(30);
	},
);

it("finds a positioned non-Grid ancestor across a static Grid parent", () => {
	const { box, rect } = fixture(
		'<main><section><div id="target"></div><div id="flow"></div></section></main>',
		"main{position:relative;left:7px;top:9px;width:100px;height:50px;padding:10px;border:2px solid black;margin:3px}section{display:grid;grid-template-columns:60px;grid-template-rows:20px;width:60px}#target{position:absolute;left:10%;top:20%;width:50%;height:50%}",
	);
	const parent = box("main");
	expect(rect("#target")).toMatchObject({
		x: parent.borderX + 2 + 12,
		y: parent.borderY + 2 + 14,
		width: 60,
		height: 35,
	});
	expect(box("#target").containingBlock).toBe(parent.id);
});

it("does not use a positioned Grid ancestor as a fixed containing block", () => {
	const { rect } = fixture(
		'<main><div id="target"></div></main>',
		"main{position:relative;left:30px;top:20px;display:grid;grid-template-columns:80px;width:80px;height:40px}#target{position:fixed;left:10px;top:15px;width:20px;height:10px}",
	);
	expect(rect("#target")).toMatchObject({
		x: 10,
		y: 15,
		width: 20,
		height: 10,
	});
});

it.each(["left:10px", "top:10px", "left:auto;right:auto;top:auto;bottom:auto"])(
	"retains the Grid static-position boundary for %s",
	(insets) => {
		const { tree } = fixture(
			'<main><div id="target"></div></main>',
			`main{display:grid;grid-template-columns:100px}#target{position:absolute;width:20px;height:10px;${insets}}`,
		);
		expect(() => layoutDocument(tree)).toThrow("Grid-area coordination");
		expect(() =>
			layoutPositionedDocument(buildFormattingTree(tree), 2_000_000, {}),
		).toThrow("Grid-area coordination");
	},
);

it.each([false, true])(
	"rejects Grid containing-block coordination through a static wrapper: %s",
	(wrapped) => {
		const target = '<div id="target"></div>';
		const { tree } = fixture(
			`<main>${wrapped ? `<section>${target}</section>` : target}</main>`,
			"main{position:relative;display:grid;grid-template-columns:100px;width:100px;height:40px}#target{position:absolute;left:10px;top:10px;width:20px;height:10px}",
		);
		expect(() => layoutDocument(tree)).toThrow("Grid-area coordination");
		expect(() =>
			layoutPositionedDocument(buildFormattingTree(tree), 2_000_000, {}),
		).toThrow("Grid-area coordination");
	},
);

it.each(["absolute", "fixed"])(
	"retains the out-of-flow Grid container boundary for %s",
	(position) => {
		const { tree } = fixture(
			"<main><div>Content</div></main>",
			`main{position:${position};display:grid;left:0;top:0;width:100px;grid-template-columns:100px}`,
		);
		expect(() => layoutDocument(tree)).toThrow("Grid-area coordination");
		expect(() =>
			layoutPositionedDocument(buildFormattingTree(tree), 2_000_000, {}),
		).toThrow("Grid-area coordination");
	},
);

it("positions nested absolute ancestors in ancestor order", () => {
	const { rect } = fixture(
		'<div id="outer"><div id="inner"><div id="child"></div></div></div>',
		"#outer{position:absolute;left:20px;top:10px;width:100px;height:60px;padding:5px}#inner{position:absolute;right:-10px;bottom:5px;width:40px;height:20px;padding:2px}#child{position:absolute;left:50%;top:-3px;width:5px;height:6px}",
	);
	expect(rect("#outer")).toMatchObject({
		x: 20,
		y: 10,
		width: 110,
		height: 70,
	});
	expect(rect("#inner")).toMatchObject({ x: 96, y: 51, width: 44, height: 24 });
	expect(rect("#child")).toMatchObject({ x: 118, y: 48, width: 5, height: 6 });
});

it.each([
	["left:-5px;top:-7px", -5, -7],
	["right:-5px;bottom:-7px", 185, 97],
	["left:10px;right:90px;top:20px;bottom:60px", 10, 20],
])(
	"resolves signed and overconstrained physical insets: %s",
	(insets, x, y) => {
		const { rect } = fixture(
			'<div id="target"></div>',
			`#target{position:absolute;width:20px;height:10px;${insets}}`,
		);
		expect(rect("#target")).toMatchObject({ x, y, width: 20, height: 10 });
	},
);

it("stretches auto dimensions then reflows children using definite height", () => {
	const { box, rect } = fixture(
		'<div id="target"><div id="child"></div></div>',
		"#target{position:absolute;left:10px;right:20px;top:5px;bottom:15px;padding:5px;border:2px solid red}#child{height:50%;width:50%}",
	);
	expect(rect("#target")).toMatchObject({
		x: 10,
		y: 5,
		width: 170,
		height: 80,
	});
	expect(box("#target")).toMatchObject({
		contentWidth: 156,
		contentHeight: 66,
	});
	expect(rect("#child")).toMatchObject({ x: 17, y: 12, width: 78, height: 33 });
});

it("clamps stretched dimensions and resolves auto margins", () => {
	const { rect, tree, id } = fixture(
		'<div id="target"></div>',
		"#target{position:absolute;left:10px;right:10px;top:10px;bottom:10px;max-width:100px;max-height:40px;margin:auto}",
	);
	expect(rect("#target")).toMatchObject({
		x: 50,
		y: 30,
		width: 100,
		height: 40,
	});
	expect(resolvedStyleValue(tree, id("#target"), "margin-left")).toBe("40px");
	expect(resolvedStyleValue(tree, id("#target"), "margin-top")).toBe("20px");
});

it("uses zero start and negative end margin for horizontal auto-margin overflow", () => {
	const { box, rect } = fixture(
		'<div id="target"></div>',
		"#target{position:absolute;left:0;right:0;top:0;bottom:0;width:220px;height:120px;margin:auto}",
	);
	expect(rect("#target")).toMatchObject({
		x: 0,
		y: -10,
		width: 220,
		height: 120,
	});
	expect(box("#target")).toMatchObject({
		marginLeft: 0,
		marginRight: -20,
		marginTop: -10,
		marginBottom: -10,
	});
});

it("uses shrink-to-fit text width without admitting positioned descendants", () => {
	const { box, rect } = fixture(
		'<div id="target">AB<div id="child"></div></div>',
		"#target{position:absolute;right:10px;top:5px;padding:2px}#child{position:absolute;left:0;top:0;width:150px;height:90px}",
	);
	expect(box("#target").contentWidth).toBe(12);
	expect(rect("#target")).toMatchObject({
		x: 174,
		y: 5,
		width: 16,
		height: 14,
	});
});

it("keeps inline text contiguous around an out-of-flow inline element", () => {
	const { tree, box, id } = fixture(
		'<main>A<span id="target">X</span>B</main>',
		"#target{position:absolute;left:50px;top:20px;width:15px;height:10px}",
	);
	expect(resolvedStyleValue(tree, id("#target"), "display")).toBe("block");
	const layout = layoutDocument(tree);
	const main = layout.contexts.find((context) => context.id === box("main").id);
	expect(main?.glyphs.map((glyph) => glyph.x)).toEqual([0, 6]);
	expect(box("main").contentHeight).toBe(10);
});

it("does not collapse positioned root margins with children", () => {
	const { rect, box } = fixture(
		'<div id="target"><div id="child"></div></div>',
		"#target{position:absolute;left:0;top:0;width:50px;margin-top:7px}#child{height:10px;margin-top:20px;margin-bottom:15px}",
	);
	expect(rect("#target")).toMatchObject({ y: 7, height: 45 });
	expect(box("#child").borderY).toBe(27);
});

it("reuses flex and inline-block layout while excluding positioned flex children", () => {
	const { box } = fixture(
		'<main><div id="flow"></div><div id="target"><div id="one"></div><div id="two"></div></div><div id="last"></div></main>',
		"main{display:flex;width:200px;position:relative;height:50px}#flow,#last{width:20px;height:10px}#target{display:flex;position:absolute;right:0;top:0;width:100px;height:20px}#one,#two{flex:1}",
	);
	expect(box("#last").borderX).toBe(20);
	expect(box("#target")).toMatchObject({ borderX: 100, borderY: 0 });
	expect(box("#one")).toMatchObject({ borderX: 100, contentWidth: 50 });
	expect(box("#two")).toMatchObject({ borderX: 150, contentWidth: 50 });
});

it("preserves atomic inline layout and relative offsets inside positioned content", () => {
	const { rect } = fixture(
		'<div id="target"><span id="atom"><span id="relative">A</span></span></div>',
		"#target{position:absolute;left:30px;top:20px;width:100px}#atom{display:inline-block;width:25px;height:20px}#relative{position:relative;left:3px;top:4px}",
	);
	expect(rect("#atom")).toMatchObject({ x: 30, y: 20, width: 25, height: 20 });
	expect(rect("#relative").x).toBe(33);
});

it("resolves descendant relative percentage insets against the positioned content box", () => {
	const { rect } = fixture(
		'<div id="target"><div id="relative"></div></div>',
		"#target{position:absolute;left:10px;top:5px;width:80px;height:40px;padding:5px}#relative{position:relative;left:25%;top:50%;width:10px;height:10px}",
	);
	expect(rect("#relative")).toMatchObject({
		x: 35,
		y: 30,
		width: 10,
		height: 10,
	});
});

it("blockifies and positions loaded images without stretching their intrinsic ratio", async () => {
	const { tree, id, rect } = fixture(
		'<img id="photo" src="/image.png"><div id="next"></div>',
		"#photo{position:absolute;left:10px;right:10px;top:10px;bottom:10px;width:40px;margin:auto;padding:2px;border:1px solid black}#next{height:10px}",
	);
	const body = encodePng(createRaster(4, 2, [0, 0, 255, 255]));
	const images = documentImages(tree, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body,
			encodedBytes: body.length,
			redirects: [],
			elapsedMs: 0,
		}),
	});
	await images.settle();
	expect(rect("#photo")).toMatchObject({ x: 77, y: 37, width: 46, height: 26 });
	expect(rect("#next").y).toBe(0);
	expect(pixel(tree, 90, 45)).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(tree).elementFromPoint(90, 45)).toBe(id("#photo"));
});

it("positions native controls and preserves their hit and raster geometry", () => {
	const { tree, id, rect } = fixture(
		'<input id="control" value="ABC">',
		"#control{position:fixed;left:10px;top:20px;width:80px;height:20px;background:red}",
	);
	expect(rect("#control")).toMatchObject({ x: 10, y: 20 });
	expect(documentHitTesting(tree).elementFromPoint(15, 25)).toBe(
		id("#control"),
	);
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});

it("excludes absolute siblings without changing normal margin collapse", () => {
	const css =
		"main{display:flow-root}#first{height:10px;margin-bottom:20px}#last{height:10px;margin-top:30px}#target{position:absolute;top:0;left:0;width:10px;height:300px}";
	const positioned = fixture(
		'<main><div id="first"></div><div id="target"></div><div id="last"></div></main>',
		css,
	);
	const normal = fixture(
		'<main><div id="first"></div><div id="last"></div></main>',
		css,
	);
	expect(positioned.rect("#last")).toEqual(normal.rect("#last"));
	expect(positioned.rect("main")).toEqual(normal.rect("main"));
});

it("does not position a display-contents element or establish its containing block", () => {
	const { rect, tree, id } = fixture(
		'<main><div id="boxless"><div id="target"></div></div></main>',
		"main{position:relative;width:100px;height:50px;padding:10px}#boxless{display:contents;position:absolute}#target{position:absolute;right:0;bottom:0;width:20px;height:10px}",
	);
	expect(documentGeometry(tree).getClientRects(id("#boxless"))).toEqual([]);
	expect(rect("#target")).toMatchObject({
		x: 100,
		y: 60,
		width: 20,
		height: 10,
	});
});

it("uses automatic ancestor height and box-sizing for trailing positioning", () => {
	const { rect } = fixture(
		'<main><div id="flow"></div><div id="target"></div></main>',
		"main{position:relative;padding:10px;width:100px}#flow{height:30px}#target{position:absolute;right:5px;bottom:10%;width:30%;height:50%;padding:2px;border:1px solid red;box-sizing:border-box}",
	);
	expect(rect("#target")).toMatchObject({
		x: 79,
		y: 20,
		width: 36,
		height: 25,
	});
});

it("handles a fixed descendant of an offscreen positioned ancestor independently", () => {
	const { rect } = fixture(
		'<div id="outer"><div id="fixed"></div></div>',
		"#outer{position:absolute;left:500px;top:400px;width:50px;height:50px}#fixed{position:fixed;left:5px;top:7px;width:10px;height:10px}",
	);
	expect(rect("#fixed")).toMatchObject({ x: 5, y: 7, width: 10, height: 10 });
});

it("shares positioned paint, glyph, fragment, client and hit geometry", () => {
	const { tree, id, rect } = fixture(
		'<div id="target"><span>A</span></div>',
		"#target{position:absolute;left:30px;top:20px;width:40px;height:20px;background:red;color:blue}",
	);
	expect(rect("#target")).toMatchObject({
		x: 30,
		y: 20,
		width: 40,
		height: 20,
	});
	expect(documentHitTesting(tree).elementFromPoint(65, 35)).toBe(id("#target"));
	expect(pixel(tree, 65, 35)).toEqual([255, 0, 0, 255]);
	const glyph = layoutDocument(tree).contexts.flatMap(
		(context) => context.glyphs,
	)[0];
	expect(glyph.x).toBe(30);
	expect(glyph.y).toBeGreaterThanOrEqual(20);
	const crop = rasterizeDocument(tree, {
		element: tree.reference(id("#target")),
	});
	expect(crop.image).toMatchObject({ width: 40, height: 20 });
});

it("keeps fixed descendants viewport anchored across both scroll axes and prepared captures", () => {
	const { tree, id, rect } = fixture(
		'<main><div id="fixed"><div id="absolute"></div></div><div id="normal"></div></main>',
		"main{position:relative;left:30px;top:20px;width:400px;height:300px}#fixed{position:fixed;right:10px;bottom:10px;width:50px;height:30px;background:red}#absolute{position:absolute;left:5px;top:5px;width:10px;height:10px;background:blue}#normal{position:absolute;left:100px;top:100px;width:10px;height:10px;background:green}",
	);
	const prepared = prepareDocumentRaster(tree);
	const before = rect("#fixed");
	expect(before).toMatchObject({ x: 140, y: 60, width: 50, height: 30 });
	expect(documentHitTesting(tree).elementFromPoint(146, 66)).toBe(
		id("#absolute"),
	);
	documentScroll(tree).to(50, 80);
	expect(rect("#fixed")).toEqual(before);
	expect(rect("#absolute")).toMatchObject({ x: 145, y: 65 });
	expect(rect("#normal")).toMatchObject({ x: 80, y: 40 });
	expect(documentHitTesting(tree).elementFromPoint(146, 66)).toBe(
		id("#absolute"),
	);
	expect(pixel(tree, 146, 66)).toEqual([0, 0, 255, 255]);
	expect(() => prepared.rasterize()).toThrow("stale");
	expect(prepareDocumentRaster(tree).rasterize().image.pixels).toEqual(
		rasterizeDocument(tree).image.pixels,
	);
	expect(
		rasterizeDocument(tree, { element: tree.reference(id("#fixed")) }).image,
	).toMatchObject({ width: 50, height: 30 });
	expect(
		documentGeometry(tree).getDocumentRects(id("#fixed"))[0],
	).toMatchObject({ x: 190, y: 140 });
});

it("does not let oversized fixed boxes or their content grow root scroll bounds", () => {
	const { tree } = fixture(
		'<div id="fixed"><div></div>ABC</div>',
		"#fixed{position:fixed;left:300px;top:200px;width:500px;height:400px}#fixed div{width:800px;height:700px}",
	);
	expect(documentScroll(tree).bounds()).toEqual({ x: 0, y: 0 });
});

it("isolates fixed stacking contexts and respects positioned z-index", () => {
	const { tree, id } = fixture(
		'<div id="fixed"><div id="inner"></div></div><div id="front"></div>',
		"#fixed,#inner,#front{left:0;top:0;width:30px;height:30px}#fixed{position:fixed}#inner{position:absolute;z-index:100;background:red}#front{position:absolute;z-index:1;background:blue}",
	);
	expect(pixel(tree, 5, 5)).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(tree).elementFromPoint(5, 5)).toBe(id("#front"));
});

it("updates positioned used insets and dimensions after mutation and viewport resize", () => {
	const { tree, id, rect } = fixture(
		'<div id="target"></div>',
		"#target{position:fixed;right:10%;bottom:10%;width:20px;height:10px}",
	);
	expect(resolvedStyleValue(tree, id("#target"), "left")).toBe("160px");
	expect(resolvedStyleValue(tree, id("#target"), "right")).toBe("20px");
	documentStyles(tree).setViewport(300, 200);
	expect(rect("#target")).toMatchObject({ x: 250, y: 170 });
	tree.setAttribute(
		id("#target"),
		"style",
		"position:static;width:40px;height:20px",
	);
	expect(rect("#target")).toMatchObject({ x: 0, y: 0, width: 40, height: 20 });
});

it.each([
	"position:absolute;inset:0;width:20px;height:10px",
	"position:fixed;transform:translateX(1px);width:20px;height:10px",
	"position:sticky;top:0",
	"position:absolute;left:0;top:0;overflow:hidden",
])("fails explicitly for unsupported layout: %s", (style) => {
	const { tree } = fixture(`<div style="${style}">A</div>`);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("rejects positioned inline containing blocks rather than using the viewport", () => {
	const { tree } = fixture(
		'<span style="position:relative">A<span style="position:absolute;left:0;top:0;width:10px;height:10px">B</span></span>',
	);
	expect(() => layoutDocument(tree)).toThrow("inline containing blocks");
});

it("bounds aggregate positioning and text work", () => {
	const { tree } = fixture(
		Array.from(
			{ length: 8 },
			(_, index) =>
				`<div style="position:absolute;left:${index}px;top:0;width:10px">ABC</div>`,
		).join(""),
	);
	expect(() => layoutDocument(tree, { maxWork: 10 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => layoutDocument(tree, { text: { maxLines: 3 } })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("keeps a many-sibling positioned page within bounded linear work", () => {
	const measure = (count: number) => {
		const { tree } = fixture(
			Array.from(
				{ length: count },
				(_, index) =>
					`<div style="position:absolute;left:${index % 100}px;top:${index % 50}px;width:10px;height:10px">A</div>`,
			).join(""),
		);
		return layoutDocument(tree);
	};
	const small = measure(100);
	const large = measure(1000);
	expect(large.positionedInsets).toHaveLength(1000);
	expect(large.metrics.work).toBeLessThan(small.metrics.work * 11);
	expect(large.metrics.work).toBeLessThan(2_000_000);
});

it("activates an explicit positioned rule through native supports queries", () => {
	const { tree, rect } = fixture(
		'<div id="target"></div>',
		"@supports (position:fixed){#target{position:fixed;left:10px;top:20px;width:30px;height:10px;background:red}}",
	);
	expect(rect("#target")).toMatchObject({
		x: 10,
		y: 20,
		width: 30,
		height: 10,
	});
	expect(pixel(tree, 15, 25)).toEqual([255, 0, 0, 255]);
});
