import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import {
	layoutFlexContainer,
	type FlexContainerLayoutOptions,
} from "./flex-layout.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(
	css = "",
	content = '<div id="first">A</div><div id="second">B</div>',
	after = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{display:flex;flex-direction:column;width:60px}main>div{flex:1}${css}</style><main id="container">${content}</main>${after}`,
		"https://fixture.invalid/flex-column",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(120, 120);
	const query = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(selector);
		return found;
	};
	const ref = (selector: string) => tree.reference(id(selector));
	const box = (selector: string, result = layoutDocument(tree)) => {
		const found = result.boxes.find((entry) => entry.ref === ref(selector));
		if (!found) throw new Error(selector);
		return found;
	};
	const local = (options?: FlexContainerLayoutOptions) =>
		layoutFlexContainer(
			tree,
			ref("#container"),
			{ contentWidth: 60, containingWidth: 120, containingHeight: null },
			options,
		);
	return { tree, id, ref, box, local };
}

it("allocates real vertical sizes and positions page boxes and glyphs", () => {
	const { tree, box, ref } = fixture(
		"main{height:100px;padding:3px;gap:4px;margin:5px;border:1px solid red}footer{height:7px}",
		undefined,
		'<footer id="after"></footer>',
	);
	const result = layoutDocument(tree);
	expect(box("#container", result)).toMatchObject({
		borderX: 5,
		borderY: 5,
		contentHeight: 100,
		contentY: 9,
	});
	expect(box("#first", result)).toMatchObject({
		borderX: 9,
		borderY: 9,
		contentWidth: 60,
		contentHeight: 48,
	});
	expect(box("#second", result)).toMatchObject({
		borderX: 9,
		borderY: 61,
		contentWidth: 60,
		contentHeight: 48,
	});
	expect(box("#after", result).borderY).toBe(118);
	expect(
		result.contexts.find((context) => context.ref === ref("#second"))
			?.glyphs[0],
	).toMatchObject({ x: 9, y: 62 });
});

it.each([
	["", 20, 10, 10],
	["main{min-height:100px}", 100, 50, 50],
	["main{height:100px}", 100, 50, 50],
	["main{height:100px;max-height:60px}", 60, 30, 30],
	["main{height:20px;min-height:60px}", 60, 30, 30],
	["main{height:100px}#first{flex:1}#second{flex:3}", 100, 25, 75],
	["main{height:30px}main>div{flex:0 1 30px;min-height:0}", 30, 15, 15],
	[
		"main{height:30px}main>div{flex:0 1 30px}#first{min-height:25px}#second{min-height:0}",
		30,
		25,
		5,
	],
	["main{height:100px}#first{max-height:20px}", 100, 20, 80],
] as const)(
	"solves main sizes without rotating horizontal text for %s",
	(css, height, first, second) => {
		const { box } = fixture(css);
		expect(box("#container").contentHeight).toBe(height);
		expect(box("#first").contentHeight).toBe(first);
		expect(box("#second").contentHeight).toBe(second);
	},
);

it.each([
	["height:80px;flex:0 0 content", 10, 10],
	["min-height:50px;flex:0 0 content", 10, 50],
	["max-height:5px;flex:0 0 content", 10, 5],
	["height:40px;flex:0 0 auto", 40, 40],
	["height:40px;flex:0 0 min-content", 10, 10],
	["height:40px;flex:0 0 max-content", 10, 10],
	["flex:0 0 50%", 10, 10],
	[
		"flex:0 0 0px;min-height:0;box-sizing:border-box;padding:2px;border:1px solid red",
		-6,
		0,
	],
] as const)(
	"measures content before applying main constraints: %s",
	(css, base, height) => {
		const { box, local } = fixture(`#first{${css}}`, '<div id="first">A</div>');
		expect(local().main.items[0].baseSize).toBe(base);
		expect(box("#first").contentHeight).toBe(height);
	},
);

it.each([
	["height:100px;row-gap:10%", 100, 45, 55],
	["row-gap:10%", 20, 10, 10],
	["min-height:100px;row-gap:10%", 100, 50, 50],
	["row-gap:calc(10% + 4px)", 24, 10, 14],
] as const)(
	"uses the correct percentage gap basis for %s",
	(css, height, itemHeight, secondTop) => {
		const { box } = fixture(`main{${css}}`);
		expect(box("#container").contentHeight).toBe(height);
		expect(box("#first").contentHeight).toBe(itemHeight);
		expect(box("#second").borderY).toBe(secondTop);
	},
);

it.each([
	["main{height:100px}#first{flex:0 0 20%}", 20, true, 10],
	["#first{flex:0 0 20px}", 20, true, 10],
	["#first{flex:1}", 10, false, 0],
] as const)(
	"preserves post-flex definiteness for descendants: %s",
	(css, height, definite, childHeight) => {
		const { box } = fixture(
			`${css}#child{height:50%}`,
			'<div id="first">A<div id="child"></div></div>',
		);
		expect(box("#first").contentHeight).toBe(height);
		expect(box("#first").definiteHeight !== null).toBe(definite);
		expect(box("#child").contentHeight).toBe(childHeight);
	},
);

it("does not use an ignored authored height as the content-basis descendant percentage basis", () => {
	const { box, local } = fixture(
		"#first{height:80px;flex:0 0 content}#child{height:50%}",
		'<div id="first"><div id="child"></div></div>',
	);
	expect(local().main.items[0].baseSize).toBe(0);
	expect(box("#first")).toMatchObject({
		contentHeight: 0,
		definiteHeight: null,
	});
	expect(box("#child").contentHeight).toBe(0);
});

it.each(["column", "column-reverse"])(
	"maps %s placement independently of source order and text direction",
	(direction) => {
		const { tree, box, id } = fixture(
			`main{height:100px;flex-direction:${direction};gap:4px}#first{order:2}#second{order:0}`,
		);
		expect(box("#first").borderY).toBe(direction === "column" ? 52 : 0);
		expect(box("#second").borderY).toBe(direction === "column" ? 0 : 52);
		expect(tree.get(id("#container")).children[0]).toBe(id("#first"));
	},
);

it.each([
	["flex-start", 0, 10],
	["flex-end", 80, 90],
	["center", 40, 50],
	["space-between", 0, 90],
	["space-around", 20, 70],
	["space-evenly", 80 / 3, 10 + 160 / 3],
] as const)(
	"applies main alignment %s to vertical item boxes",
	(justify, first, second) => {
		const { box } = fixture(
			`main{height:100px;justify-content:${justify}}main>div{flex:none}`,
		);
		expect(box("#first").borderY).toBeCloseTo(first, 10);
		expect(box("#second").borderY).toBeCloseTo(second, 10);
	},
);

it("distributes main auto margins before alignment", () => {
	const { box } = fixture(
		"main{height:100px;justify-content:center}main>div{flex:none}#first{margin-top:auto}#second{margin-bottom:auto}",
	);
	expect(box("#first")).toMatchObject({ borderY: 40, marginTop: 40 });
	expect(box("#second")).toMatchObject({ borderY: 50, marginBottom: 40 });
});

it.each([
	["stretch", 0, 60],
	["flex-start", 0, 12],
	["flex-end", 48, 12],
	["center", 24, 12],
	["baseline", 0, 12],
	["last baseline", 48, 12],
] as const)(
	"lays out the actual horizontal cross size for %s",
	(alignment, x, width) => {
		const { box } = fixture(
			`main{align-items:${alignment}}`,
			'<div id="first">AB</div>',
		);
		expect(box("#first")).toMatchObject({ borderX: x, contentWidth: width });
	},
);

it("resolves cross auto margins and padding percentages from container width", () => {
	const { box } = fixture(
		"main{width:100px;height:100px}#first{width:20px;flex:none;margin:10% auto;padding:5%}",
		'<div id="first">A</div>',
	);
	expect(box("#first")).toMatchObject({
		borderX: 35,
		borderY: 10,
		contentWidth: 20,
		paddingTop: 5,
		paddingLeft: 5,
		marginLeft: 35,
		marginRight: 35,
		contentHeight: 10,
	});
});

it("keeps automatic main minimums from shrinking real wrapped content", () => {
	const { box } = fixture(
		"main{width:18px;height:10px}",
		'<div id="first">aa bbbb</div>',
	);
	expect(box("#first")).toMatchObject({ contentWidth: 18, contentHeight: 20 });
});

it("uses fit-content width for a non-stretched item instead of filling the container", () => {
	const { box } = fixture(
		"main{width:100px;align-items:flex-start}",
		'<div id="first">aa bbbb</div>',
	);
	expect(box("#first")).toMatchObject({ contentWidth: 42, contentHeight: 10 });
});

it("integrates mixed row/column nesting with allocated widths, heights and baselines", () => {
	const { tree, box, ref } = fixture(
		"main{height:100px;gap:4px}#first{display:flex;flex-direction:row;gap:2px}#first>div{flex:1}#inner{display:flex;flex-direction:column}#leaf{height:50%}",
		'<div id="first"><div>A</div><div id="inner"><div id="leaf">B</div></div></div><div id="second">C</div>',
	);
	const result = layoutDocument(tree);
	expect(box("#first", result)).toMatchObject({
		contentHeight: 48,
		contentWidth: 60,
	});
	expect(box("#inner", result)).toMatchObject({
		contentWidth: 29,
		contentHeight: 48,
	});
	expect(box("#leaf", result)).toMatchObject({
		contentHeight: 24,
		borderX: 31,
		borderY: 0,
	});
	expect(
		result.contexts.find((context) => context.ref === ref("#leaf"))?.glyphs[0],
	).toMatchObject({ x: 31, y: 1 });
});

it("measures a single column's intrinsic cross width as a maximum rather than a sum", () => {
	const { tree, ref } = fixture(
		"main{width:auto}",
		"<div>aa bbbb</div><div>cc</div>",
	);
	expect(
		measureIntrinsicWidths(tree).widths.find(
			(record) => record.ref === ref("#container"),
		),
	).toMatchObject({ minContent: 24, maxContent: 42 });
});

it.each([
	["top", 0],
	["bottom", 20],
] as const)(
	"paints and hits overlapping reversed column items with negative %s margins",
	(side, origin) => {
		const { tree, id } = fixture(
			`main{height:20px;flex-direction:column-reverse}main>div{flex:0 0 20px;min-height:0;margin-${side}:-20px}#first{background:red}#second{background:blue}`,
		);
		const image = rasterizeDocument(tree).image;
		expect([
			...image.pixels.slice(
				((origin + 5) * image.width + 30) * 4,
				((origin + 5) * image.width + 30) * 4 + 4,
			),
		]).toEqual([0, 0, 255, 255]);
		expect(documentHitTesting(tree).elementFromPoint(30, origin + 5)).toBe(
			id("#second"),
		);
	},
);

it.each(["column", "column-reverse"])(
	"exports the actual %s first baseline into an outer row",
	(direction) => {
		const { tree, ref } = fixture(
			`main{flex-direction:row;align-items:baseline}#first{display:flex;flex-direction:${direction}}#large{font-size:16px}`,
			'<div id="first"><div id="large">A</div><div id="small">B</div></div><div id="second">C</div>',
		);
		const result = layoutDocument(tree);
		const baseline = (selector: string) =>
			result.contexts.find((context) => context.ref === ref(selector))?.lines[0]
				.baseline;
		expect(baseline("#second")).toBe(
			baseline(direction === "column" ? "#large" : "#small"),
		);
	},
);

it("retains the WPT min-height stretch definiteness case across the shared reflow changes", () => {
	const { tree, box } = fixture(
		"main{flex-direction:row;width:100px;min-height:100px}#first{display:flex;width:100px;background:red;align-items:center}#leaf{min-height:100%;width:100%;background:green}",
		'<div id="first"><span id="leaf"></span></div>',
	);
	expect(box("#first")).toMatchObject({
		contentWidth: 100,
		contentHeight: 100,
	});
	expect(box("#leaf")).toMatchObject({ contentWidth: 100, contentHeight: 100 });
	const image = rasterizeDocument(tree).image;
	expect([
		...image.pixels.slice(
			(50 * image.width + 50) * 4,
			(50 * image.width + 50) * 4 + 4,
		),
	]).toEqual([0, 128, 0, 255]);
});

it("scrolls overflowing column content and invalidates client geometry on mutation", () => {
	const { tree, id } = fixture("main>div{flex:0 0 30px}");
	documentStyles(tree).setViewport(80, 20);
	expect(documentScroll(tree).bounds().y).toBe(40);
	documentScroll(tree).to(0, 30);
	expect(documentGeometry(tree).getBoundingClientRect(id("#second")).y).toBe(0);
	tree.setAttribute(id("#container"), "style", "flex-direction:row");
	expect(documentScroll(tree).get().y).toBe(0);
});

it.each([
	["", 60, 30],
	["main{align-items:flex-start}img{flex:0 0 20px}", 40, 20],
	["img{flex:0 0 5px;min-height:0}", 60, 5],
	["img{flex:0 0 5px}", 60, 10],
] as const)(
	"uses image ratios and automatic minimums on the correct axes: %s",
	async (css, width, height) => {
		const { tree, box } = fixture(css, '<img id="first" src="/image.png">');
		const bytes = encodePng(createRaster(20, 10, [0, 255, 0, 255]));
		await documentImages(tree, {
			fetch: async (url) => ({
				url,
				status: 200,
				headers: { "content-type": ["image/png"] },
				body: bytes,
				redirects: [],
				encodedBytes: bytes.length,
				elapsedMs: 0,
			}),
		}).settle();
		expect(box("#first")).toMatchObject({
			contentWidth: width,
			contentHeight: height,
		});
		expect(rasterizeDocument(tree).metrics.paintedImages).toBe(1);
	},
);

it("enforces exact page and phase work budgets without silent increases", () => {
	const { tree, local } = fixture("main{height:100px}");
	const result = layoutDocument(tree);
	expect(
		layoutDocument(tree, { maxWork: result.metrics.work }).metrics.work,
	).toBe(result.metrics.work);
	expect(() =>
		layoutDocument(tree, { maxWork: result.metrics.work - 1 }),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	expect(() => local({ reflow: { maxWork: 1 } })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	"main{display:inline-grid}",
	"main{flex-wrap:wrap;align-content:baseline}",
	"#first{display:grid}",
	"#first{writing-mode:vertical-rl}",
])("rejects unimplemented prerequisites instead of guessing: %s", (css) => {
	expect(() => layoutDocument(fixture(css).tree)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
