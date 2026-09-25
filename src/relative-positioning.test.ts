import { afterEach, expect, it } from "vitest";
import {
	initialBoxStyle,
	computeBoxStyle,
	parseBoxDeclarations,
} from "./css-box.js";
import { resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { renderDocumentPdf } from "./document-pdf.js";
import { documentScroll } from "./document-scroll.js";
import { documentElementOffsets } from "./element-offsets.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutContentItems } from "./layout-paint-order.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import {
	applyRelativePositioning,
	resolveRelativeInsets,
} from "./relative-positioning.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture(
	css = "",
	content = '<div id="target">ab</div><div id="after">cd</div>',
) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}main{width:100px}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/relative-positioning",
	);
	documents.push(document);
	documentStyles(document).setViewport(160, 160);
	const query = new DocumentQueries(document);
	const id = (selector: string) => {
		const value = query.querySelector(selector);
		if (value === null) throw Error(selector);
		return value;
	};
	const rect = (selector = "#target") =>
		documentGeometry(document).getBoundingClientRect(id(selector));
	return { document, id, rect };
}

it.each([
	["auto", "auto", 0],
	["5px", "auto", 5],
	["auto", "5px", -5],
	["-7px", "auto", -7],
	["auto", "-7px", 7],
	["10%", "2px", 20],
	["3px", "90px", 3],
	["calc(10% - 30px)", "auto", -10],
] as const)("resolves LTR horizontal insets %s / %s", (left, right, result) => {
	expect(
		resolveRelativeInsets({ ...initialBoxStyle, left, right }, 200, null),
	).toEqual({ left: result, top: 0 });
});

it.each([
	["auto", "auto", null, 0],
	["5px", "auto", null, 5],
	["auto", "7px", null, -7],
	["10%", "3px", null, -3],
	["10%", "3px", 200, 20],
	["calc(10% + 2px)", "3px", null, -3],
	["4px", "9px", 100, 4],
	["auto", "-20%", 100, 20],
] as const)(
	"resolves CSS2 vertical insets %s / %s against %s",
	(top, bottom, height, result) => {
		expect(
			resolveRelativeInsets({ ...initialBoxStyle, top, bottom }, 100, height),
		).toEqual({ left: 0, top: result });
	},
);

it.each(["top", "right", "bottom", "left"] as const)(
	"parses and computes signed %s lengths without inheriting",
	(name) => {
		expect(parseBoxDeclarations(name, "-2em")).toEqual([
			{ property: name, value: "-2em" },
		]);
		const parent = computeBoxStyle(
			{ [name]: "calc(1em - 20px)" },
			initialBoxStyle,
			{ width: 100, height: 100 },
			{ fontSize: 8, rootFontSize: 8 },
		);
		expect(parent[name]).toBe("-12px");
		expect(computeBoxStyle({}, parent, { width: 100, height: 100 })[name]).toBe(
			"auto",
		);
		expect(
			computeBoxStyle({ [name]: "inherit" }, parent, {
				width: 100,
				height: 100,
			})[name],
		).toBe("-12px");
	},
);

it("moves a block and descendants without moving following flow or changing height", () => {
	const { document, id, rect } = fixture(
		"#target{height:20px}main{padding:3px}",
	);
	const before = rect();
	const after = rect("#after");
	const layout = layoutDocument(document);
	document.setAttribute(
		id("#target"),
		"style",
		"position:relative;left:12px;top:9px",
	);
	expect(rect()).toMatchObject({
		x: before.x + 12,
		y: before.y + 9,
		width: before.width,
		height: before.height,
	});
	expect(rect("#after")).toEqual(after);
	const moved = layoutDocument(document);
	expect(moved.flowHeight).toBe(layout.flowHeight);
	expect(moved.contexts[0].glyphs[0].x).toBe(
		layout.contexts[0].glyphs[0].x + 12,
	);
	expect(moved.contexts[0].glyphs[0].y).toBe(
		layout.contexts[0].glyphs[0].y + 9,
	);
});

it("ignores valid insets on static boxes", () => {
	const { document, id, rect } = fixture();
	const before = rect();
	document.setAttribute(id("#target"), "style", "left:23px;top:-40px");
	expect(rect()).toEqual(before);
	expect(resolvedStyleValue(document, id("#target"), "left")).toBe("23px");
});

it("accumulates nested shifts once and uses the unshifted containing block size", () => {
	const { rect } = fixture(
		"main{position:relative;left:10px;top:6px;height:80px}#target{position:relative;left:20%;top:25%;width:20px;height:10px}",
	);
	expect(rect()).toMatchObject({ x: 30, y: 26, width: 20, height: 10 });
});

it("uses auto for vertical percentages in an indefinite-height containing block", () => {
	const { rect } = fixture(
		"#target{position:relative;top:50%;bottom:3px;height:20px}",
	);
	expect(rect().y).toBe(-3);
});

it("resolves root relative percentages against the initial containing block", () => {
	const { rect } = fixture("html{position:relative;left:10%;top:10%}");
	expect(rect("#host")).toMatchObject({ x: 16, y: 16 });
});

it("moves multiline inline fragments and glyphs without changing line breaks", () => {
	const { document, id } = fixture(
		"main{width:22px}",
		'A<span id="target">ab cd ef</span>Z',
	);
	const before = layoutDocument(document);
	const fragments = documentGeometry(document).getClientRects(id("#target"));
	expect(fragments.length).toBeGreaterThan(1);
	document.setAttribute(
		id("#target"),
		"style",
		"position:relative;left:3px;top:4px",
	);
	const moved = layoutDocument(document);
	expect(moved.contexts[0].lines).toEqual(before.contexts[0].lines);
	expect(moved.flowHeight).toBe(before.flowHeight);
	for (const [index, fragment] of documentGeometry(document)
		.getClientRects(id("#target"))
		.entries())
		expect(fragment).toMatchObject({
			x: fragments[index].x + 3,
			y: fragments[index].y + 4,
			width: fragments[index].width,
			height: fragments[index].height,
		});
	expect(moved.contexts[0].glyphs[0]).toEqual(before.contexts[0].glyphs[0]);
	expect(moved.contexts[0].glyphs.at(-1)).toEqual(
		before.contexts[0].glyphs.at(-1),
	);
	expect(moved.contexts[0].glyphs[1].x).toBe(
		before.contexts[0].glyphs[1].x + 3,
	);
});

it.each(["inline-block", "inline-flex", "flex", "block"])(
	"moves %s subtrees without changing intrinsic sizes or sibling flow",
	(display) => {
		const { document, id, rect } = fixture(
			`#target{display:${display};width:30px}#child{display:inline-block}`,
			'<span id="target"><span id="child">ab</span></span><span id="after">cd</span>',
		);
		const before = rect();
		const child = rect("#child");
		const after = rect("#after");
		const intrinsic = measureIntrinsicWidths(document).widths;
		document.setAttribute(
			id("#target"),
			"style",
			"position:relative;left:-5px;top:7px",
		);
		expect(rect()).toMatchObject({
			x: before.x - 5,
			y: before.y + 7,
			width: before.width,
			height: before.height,
		});
		expect(rect("#child")).toMatchObject({ x: child.x - 5, y: child.y + 7 });
		expect(rect("#after")).toEqual(after);
		expect(measureIntrinsicWidths(document).widths).toEqual(intrinsic);
		const layout = layoutDocument(document);
		for (const [index, context] of layout.contexts.entries())
			for (const [glyphIndex, glyph] of context.glyphs.entries())
				expect(glyph.y).toBe(
					layout.text.contexts[index].glyphs[glyphIndex].y + context.contentY,
				);
		expect(renderDocumentPdf(document).metrics.glyphs).toBe(4);
	},
);

it.each(["row", "column"])(
	"moves relative flex items after %s layout",
	(direction) => {
		const { document, id, rect } = fixture(
			`main{display:flex;flex-direction:${direction};width:100px;height:80px}#target,#after{width:20px;height:10px}`,
		);
		const before = rect();
		const after = rect("#after");
		document.setAttribute(
			id("#target"),
			"style",
			"position:relative;left:10%;top:25%",
		);
		expect(rect()).toMatchObject({ x: before.x + 10, y: before.y + 20 });
		expect(rect("#after")).toEqual(after);
	},
);

it("moves replaced controls and uses their new hit area", () => {
	const { document, id, rect } = fixture(
		"#target{position:relative;left:25px;top:10px;width:20px;height:10px}",
		'<input id="target" value="a">',
	);
	expect(rect()).toMatchObject({ x: 25, y: 10, width: 20, height: 10 });
	expect(documentHitTesting(document).elementFromPoint(30, 15)).toBe(
		id("#target"),
	);
});

it("paints positioned content above later ordinary boxes and shares the hit order", () => {
	const { document, id } = fixture(
		"#target{position:relative;top:20px;background:red}#after{background:blue}#target,#after{height:20px;width:20px}",
		'<div id="target"></div><div id="after"></div>',
	);
	const image = rasterizeDocument(document).image;
	const start = (25 * image.width + 5) * 4;
	expect([...image.pixels.slice(start, start + 4)]).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(document).elementFromPoint(5, 25)).toBe(
		id("#target"),
	);
	expect(documentHitTesting(document).elementFromPoint(5, 5)).not.toBe(
		id("#target"),
	);
});

it("does not trap nested positioned descendants inside an atomic paint scope", () => {
	const { document, id } = fixture(
		"#target{display:inline-block;width:20px;height:20px}#child{position:relative;background:red;width:20px;height:20px}#after{display:inline-block;margin-left:-20px;width:20px;height:20px;background:blue}",
		'<span id="target"><div id="child"></div></span><span id="after"></span>',
	);
	const child = documentGeometry(document).getBoundingClientRect(id("#child"));
	expect(
		documentHitTesting(document).elementFromPoint(child.x + 5, child.y + 5),
	).toBe(id("#child"));
});

it("paints auto-level nested relatives in tree order without duplicate content", () => {
	const { document, id } = fixture(
		"#target,#child,#after{position:relative;width:20px;height:20px}#target{background:blue}#child{background:red}#after{top:-20px;background:green}",
		'<div id="target"><div id="child">a</div></div><div id="after">b</div>',
	);
	expect(documentHitTesting(document).elementFromPoint(15, 5)).toBe(
		id("#after"),
	);
	const items = [...layoutContentItems(layoutDocument(document), () => {})];
	expect(items.filter((item) => item.kind === "glyph")).toHaveLength(2);
	expect(renderDocumentPdf(document).metrics.glyphs).toBe(2);
});

it("exposes used opposite insets and the nearest relative offset parent", () => {
	const { document, id } = fixture(
		"main{position:relative;left:10px;top:5px;padding:3px;border:2px solid black}#target{position:relative;left:7px;right:30px;bottom:4px}",
	);
	expect(documentElementOffsets(document).get(id("#target"))).toEqual({
		offsetParent: id("#host"),
		offsetLeft: 10,
		offsetTop: -1,
	});
	expect(
		["left", "right", "top", "bottom"].map((name) =>
			resolvedStyleValue(document, id("#target"), name),
		),
	).toEqual(["7px", "-7px", "-4px", "4px"]);
});

it("rebuilds from revisions, custom properties and all resets", () => {
	const { document, id, rect } = fixture(
		"#target{position:relative;left:var(--shift, 4px)}",
	);
	expect(rect().x).toBe(4);
	document.setAttribute(id("#target"), "style", "--shift:12px");
	expect(rect().x).toBe(12);
	document.setAttribute(id("#target"), "style", "all:initial");
	expect(resolvedStyleValue(document, id("#target"), "left")).toBe("auto");
	expect(documentStyles(document).flow(id("#target")).position).toBe("static");
});

it("includes moved overflow in root scrolling and client coordinates", () => {
	const { document, id } = fixture(
		"#target{display:inline-block;position:relative;left:200px;top:200px;width:20px;height:20px}",
		'<div id="target"></div>',
	);
	expect(documentScroll(document).bounds()).toEqual({ x: 60, y: 60 });
	documentScroll(document).to(40, 40);
	expect(
		documentGeometry(document).getBoundingClientRect(id("#target")),
	).toMatchObject({ x: 160, y: 160 });
});

it("does not generate relative boxes for display contents or hidden subtrees", () => {
	const { rect } = fixture(
		"#target{display:contents;position:relative;left:99px}#hidden{display:none;position:absolute}",
		'<div id="target"><div id="child">a</div></div><div id="hidden">b</div>',
	);
	expect(rect("#child").x).toBe(0);
});

it.each([
	"position:absolute",
	"position:fixed",
	"position:sticky",
	"position:relative;opacity:0.5",
	"position:relative;direction:rtl",
])("keeps unimplemented positioning prerequisites explicit: %s", (css) => {
	const { document } = fixture(`#target{${css}}`);
	expect(() => layoutDocument(document)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("rejects relative block-in-inline splits rather than losing ancestor offsets", () => {
	const { document } = fixture(
		"#target{position:relative;left:10px}",
		'<span id="target">a<div>b</div>c</span>',
	);
	expect(() => layoutDocument(document)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("keeps frozen coordinates and charges the shared document work budget", () => {
	const { document } = fixture("#target{position:relative;left:2px}");
	const layout = layoutDocument(document);
	expect(Object.isFrozen(layout.relativePositions)).toBe(true);
	expect(Object.isFrozen(layout.contexts[0].glyphs[0])).toBe(true);
	expect(() => applyRelativePositioning(layout, layout.metrics.work)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() =>
		resolveRelativeInsets(
			{ ...initialBoxStyle, left: "20000000px" },
			100,
			null,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each([
	[
		"1 fixed",
		'<div id="container" style="height:200px"><div id="target"></div></div>',
		100,
	],
	["2 auto", '<div id="container"><div id="target"></div></div>', 0],
	[
		"3 percentage",
		'<div style="height:200px"><div id="container" style="height:50%"><div id="target"></div></div></div>',
		50,
	],
	[
		"10 auto body",
		'<div id="container" style="height:100%"><div id="target"></div></div>',
		0,
	],
	[
		"11 min-height",
		'<div><div id="container" style="height:50%;min-height:200px"><div id="target"></div></div></div>',
		0,
	],
	[
		"15 nested indefinite",
		'<div><div style="height:50%"><div id="container" style="height:50%;min-height:200px"><div id="target"></div></div></div></div>',
		0,
	],
	[
		"16 fixed calc",
		'<div id="container" style="height:calc(100px + 100px)"><div id="target"></div></div>',
		100,
	],
	[
		"17 resolvable calc",
		'<div style="height:200px"><div id="container" style="height:calc(50% + 0px)"><div id="target"></div></div></div>',
		50,
	],
	[
		"18 indefinite calc",
		'<div><div id="container" style="height:calc(50% + 0px);min-height:200px"><div id="target"></div></div></div>',
		0,
	],
	[
		"20 nested definite",
		'<div style="height:200px"><div style="height:50%"><div id="container" style="height:50%"><div id="target"></div></div></div></div>',
		25,
	],
] as const)(
	"matches source-derived WPT position-relative-015 case %s",
	(_name, content, expected) => {
		const { rect } = fixture(
			"#target{width:20px;height:20px;background:green;position:relative;top:50%}",
			content,
		);
		expect(rect().top - rect("#container").top).toBe(expected);
	},
);

it.each(["block", "inline"])(
	"moves decoded %s image pixels and bounds together",
	async (display) => {
		const { document, id, rect } = fixture(
			`img{display:${display};position:relative;left:12px;top:15px}`,
			'<img id="target" src="/image.png">',
		);
		const body = encodePng(createRaster(4, 4, [0, 255, 0, 255]));
		await documentImages(document, {
			fetch: async (url) => ({
				url,
				status: 200,
				headers: { "content-type": ["image/png"] },
				body,
				encodedBytes: body.length,
				redirects: [],
				elapsedMs: 0,
			}),
		}).settle();
		const bounds = rect();
		expect(bounds.x).toBe(12);
		const image = rasterizeDocument(document).image;
		const pixel = (Math.ceil(bounds.y + 1) * image.width + 13) * 4;
		expect([...image.pixels.slice(pixel, pixel + 4)]).toEqual([0, 255, 0, 255]);
		expect(
			documentHitTesting(document).elementFromPoint(13, bounds.y + 1),
		).toBe(id("#target"));
	},
);

it("rejects translated rectangle edges outside the coordinate budget", () => {
	const { document } = fixture(
		"#target{position:relative;left:16777210px;width:20px}",
		'<div id="target"></div>',
	);
	expect(() => layoutDocument(document)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("checks paint work even when relative descendants are deferred to the last phase", () => {
	const { document } = fixture("#target{position:relative}");
	let work = 0;
	expect(() => [
		...layoutContentItems(layoutDocument(document), () => {
			if (++work > 5) throw Error("paint budget");
		}),
	]).toThrow("paint budget");
});
