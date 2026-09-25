import { afterEach, expect, it } from "vitest";
import { borderSides, parseBorderShorthand } from "./css-border.js";
import { initialBoxStyle } from "./css-box.js";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { documentElementSizes } from "./element-sizes.js";
import { documentElementOffsets } from "./element-offsets.js";
import { rasterizeDocument } from "./document-raster.js";
import { layoutDocument } from "./document-layout.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { resolveReplacedSize } from "./replaced-box.js";
import type { DocumentTree } from "./document.js";
import { paintSolidBorders } from "./border-raster.js";
import { createRaster } from "./raster.js";
import { initialPaintStyle } from "./css-paint.js";

const documents: DocumentTree[] = [];

it("inherits currentcolor as a keyword that resolves against the child's own color", () => {
	const { tree, id } = fixture(
		"#outer{color:red}#box{width:10px;height:10px;border:2px solid;color:blue;border-color:inherit}",
		'<div id="outer"><div id="box"></div></div>',
	);
	expect(resolvedStyleValue(tree, id(), "border-left-color")).toBe(
		"rgb(0, 0, 255)",
	);
	tree.setAttribute(id(), "style", "color:green");
	expect(resolvedStyleValue(tree, id(), "border-left-color")).toBe(
		"rgb(0, 128, 0)",
	);
});

it("does not charge border-free layout boxes for their unrelated numeric fields", () => {
	const box = {
		borderTop: 0,
		borderRight: 0,
		borderBottom: 0,
		borderLeft: 0,
		contentWidth: 100,
		contentHeight: 100,
	};
	const work: number[] = [];
	expect(
		paintSolidBorders(
			createRaster(10, 10),
			0,
			0,
			100,
			100,
			box,
			initialPaintStyle,
			(amount) => work.push(amount),
		),
	).toBe(0);
	expect(work).toEqual([]);
});
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(css = "", markup = '<div id="box"></div>') {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0}${css}</style>${markup}`,
		"https://fixture.invalid/",
	);
	documents.push(tree);
	const query = new DocumentQueries(tree);
	const id = (selector = "#box") => query.querySelector(selector) as number;
	return {
		tree,
		id,
		styles: documentStyles(tree),
		rect: (selector = "#box") =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}
function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	return Array.from(
		image.pixels.slice(
			(row * image.width + column) * 4,
			(row * image.width + column) * 4 + 4,
		),
	);
}

it.each(["2px solid red", "red solid 2px", "solid red 2px"])(
	"expands border shorthand %s into all twelve physical components",
	(value) => {
		const result = parseBorderShorthand("border", value);
		expect(result).toHaveLength(12);
		for (const side of borderSides) {
			expect(result).toContainEqual({
				property: `border-${side}-width`,
				value: "2px",
			});
			expect(result).toContainEqual({
				property: `border-${side}-style`,
				value: "solid",
			});
			expect(result).toContainEqual({
				property: `border-${side}-color`,
				value: "red",
			});
		}
	},
);

it("expands four-value shorthands and functions without splitting color arguments", () => {
	expect(
		parseBorderShorthand("border-width", "thin medium thick 4px")?.map(
			(value) => value.value,
		),
	).toEqual(["1px", "3px", "5px", "4px"]);
	expect(
		parseBorderShorthand("border-color", "rgb(1, 2, 3) red")?.map(
			(value) => value.value,
		),
	).toEqual(["rgb(1, 2, 3)", "red", "rgb(1, 2, 3)", "red"]);
	expect(parseBorderShorthand("border-left", "none")).toHaveLength(3);
	expect(
		parseBorderShorthand("border", "inherit")?.every(
			(value) => value.value === "inherit",
		),
	).toBe(true);
});

it.each(["em", "rem"])(
	"retains %s border widths for font-aware computation",
	(unit) => {
		const result = parseBorderShorthand("border", `1${unit} solid`);
		expect(result).toHaveLength(12);
		for (const side of borderSides) {
			expect(result).toContainEqual({
				property: `border-${side}-width`,
				value: `1${unit}`,
			});
			expect(result).toContainEqual({
				property: `border-${side}-style`,
				value: "solid",
			});
		}
	},
);

it.each([
	"1px 2px solid red",
	"solid dashed",
	"2% solid",
	"-1px solid",
	"initial red",
	"1ch solid",
	"solid rgb(1, 2, 3) trailing",
])("rejects unsupported or invalid border %s atomically", (value) => {
	expect(parseBorderShorthand("border", value)).toBeUndefined();
});

it("cascades side overrides and resolves currentcolor without inheriting a parent's border", () => {
	const { tree, id, styles } = fixture(
		"#outer{border:4px solid red;color:blue}#box{border:2px solid;border-left-color:inherit;border-right-width:5px!important}",
		'<div id="outer"><div id="box" style="border-right-width:1px"></div></div>',
	);
	expect(styles.box(id())["border-right-width"]).toBe("5px");
	expect(resolvedStyleValue(tree, id(), "border-left-color")).toBe(
		"rgb(255, 0, 0)",
	);
	expect(resolvedStyleValue(tree, id(), "border-top-color")).toBe(
		"rgb(0, 0, 255)",
	);
	const child = tree.createElement("div");
	tree.append(id(), child);
	expect(styles.box(child)["border-left-style"]).toBe("none");
});

it("computes length units and hides none/hidden borders without losing specified width", () => {
	const { tree, id, styles, rect } = fixture(
		"#box{width:10px;height:10px;border-width:1in;border-style:none}",
	);
	expect(styles.box(id())["border-left-width"]).toBe("96px");
	expect(rect().width).toBe(10);
	expect(resolvedStyleValue(tree, id(), "border-left-width")).toBe("0px");
	tree.setAttribute(id(), "style", "border-style:hidden");
	expect(rect().width).toBe(10);
});

it.each([
	["0px", 0],
	["-0px", 0],
	["0.2px", 1],
	["1.9px", 1],
	["2.9px", 2],
])("snaps %s border widths to scale-one device pixels", (value, width) => {
	const { tree, id, rect } = fixture(
		`#box{width:10px;height:10px;border:${value} solid}`,
	);
	expect(rect().width).toBe(10 + Number(width) * 2);
	expect(resolvedStyleValue(tree, id(), "border-left-width")).toBe(
		`${width}px`,
	);
});

it("resolves none border width to zero even on inline and boxless elements", () => {
	const { tree, id } = fixture(
		"span{border-width:7px}",
		'<span id="box">x</span>',
	);
	expect(resolvedStyleValue(tree, id(), "border-left-width")).toBe("0px");
	tree.setAttribute(id(), "style", "display:contents");
	expect(resolvedStyleValue(tree, id(), "border-left-width")).toBe("0px");
});

it("bounds shorthand source and rejects unbalanced functions and invalid color nesting", () => {
	for (const value of [
		"a".repeat(4097),
		"rgb(1, 2, 3",
		"rgb((1),2,3)",
		") solid",
	])
		expect(parseBorderShorthand("border", value)).toBeUndefined();
	expect(parseBorderShorthand("border", "solid  red")).toHaveLength(12);
});

it("solid block borders contribute to layout, hit testing and client versus offset sizes", () => {
	const { tree, id, rect } = fixture(
		"#box{width:20px;height:10px;padding:3px;border:2px solid red}",
	);
	expect(rect()).toMatchObject({ x: 0, y: 0, width: 30, height: 20 });
	expect(documentElementSizes(tree).get(id())).toEqual({
		clientWidth: 26,
		clientHeight: 16,
		clientLeft: 2,
		clientTop: 2,
		offsetWidth: 30,
		offsetHeight: 20,
	});
	expect(documentHitTesting(tree).elementFromPoint(1, 1)).toBe(id());
	const image = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 32, height: 22 },
	}).image;
	expect(pixel(image, 0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 2, 2)).toEqual([255, 255, 255, 255]);
});

it("border-box dimensions subtract border and padding before sizing content", () => {
	const { tree, id, rect } = fixture(
		"#box{box-sizing:border-box;width:30px;height:20px;padding:3px;border:2px solid}",
	);
	expect(rect()).toMatchObject({ width: 30, height: 20 });
	expect(documentElementSizes(tree).get(id())).toMatchObject({
		clientWidth: 26,
		clientHeight: 16,
		clientLeft: 2,
		clientTop: 2,
	});
	const box = layoutDocument(tree).boxes.find(
		(box) => box.ref === tree.reference(id()),
	);
	expect(box).toMatchObject({
		contentWidth: 20,
		contentHeight: 10,
		contentX: 5,
		contentY: 5,
	});
});

it("top and bottom borders prevent parent-child margin collapse", () => {
	const { tree, id, rect } = fixture(
		"#box{border:2px solid}#child{height:10px;margin:7px 0 9px}",
		'<div id="box"><div id="child"></div></div>',
	);
	expect(rect("#child").y).toBe(9);
	expect(rect().height).toBe(30);
	expect(
		layoutDocument(tree).boxes.find((box) => box.ref === tree.reference(id()))
			?.marginCollapse,
	).toMatchObject({
		withFirstChild: false,
		withLastChild: false,
		through: false,
	});
});

it("offset positions are relative to the offset parent's padding edge", () => {
	const { tree, id, rect } = fixture(
		"body{border:5px solid;padding:3px}#box{width:10px;height:10px;margin:2px}",
	);
	expect(rect()).toMatchObject({ x: 10, y: 10 });
	expect(documentElementOffsets(tree).get(id())).toMatchObject({
		offsetTop: 5,
		offsetLeft: 5,
	});
});

it("paints root and propagated-body borders without duplicating canvas background", () => {
	const { tree } = fixture(
		"body{border:2px solid red;background:blue;width:20px;height:10px}",
	);
	const raster = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 30, height: 20 },
	});
	expect(pixel(raster.image, 0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(raster.image, 25, 15)).toEqual([0, 0, 255, 255]);
});

it("joins unequal colored corners once and composites translucent borders once", () => {
	const { tree } = fixture(
		"#box{width:8px;height:8px;border-width:2px 4px;border-style:solid;border-color:rgba(255,0,0,0.5) blue;background:white}",
	);
	const raster = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 16, height: 12 },
	});
	expect(pixel(raster.image, 7, 0)).toEqual([255, 127, 127, 255]);
	expect(pixel(raster.image, 0, 6)).toEqual([0, 0, 255, 255]);
	expect(pixel(raster.image, 7, 6)).toEqual([255, 255, 255, 255]);
	expect(raster.metrics.borderPixels).toBe(128);
});

it("transparent borders still occupy geometry and stop margin collapse", () => {
	const { tree, rect } = fixture(
		"#box{width:8px;height:8px;border:2px solid transparent}",
	);
	expect(rect()).toMatchObject({ width: 12, height: 12 });
	expect(rasterizeDocument(tree).metrics.borderPixels).toBe(0);
});

it("software controls share border geometry, independent sizing and painted content origin", () => {
	const { tree, id, rect } = fixture(
		"button{font-size:8px;border:2px solid red;padding:3px}",
		'<button id="box">OK</button>',
	);
	expect(rect()).toMatchObject({ width: 34, height: 26 });
	expect(documentElementSizes(tree).get(id())).toMatchObject({
		clientWidth: 30,
		clientHeight: 22,
		clientLeft: 2,
		clientTop: 2,
	});
	const raster = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 40, height: 30 },
	});
	expect(raster.metrics.paintedControls).toBe(1);
	expect(pixel(raster.image, 0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(raster.image, 5, 5)).toEqual([96, 96, 96, 255]);
});

it("replaced image ratio excludes borders and padding", () => {
	const result = resolveReplacedSize(
		100,
		50,
		{
			...initialBoxStyle,
			width: "120px",
			"box-sizing": "border-box",
			"padding-left": "5px",
			"padding-right": "5px",
			"border-left-style": "solid",
			"border-right-style": "solid",
			"border-left-width": "5px",
			"border-right-width": "5px",
		},
		200,
		null,
	);
	expect(result).toMatchObject({
		contentWidth: 100,
		contentHeight: 50,
		borderBoxWidth: 120,
		borderLeft: 5,
		borderRight: 5,
	});
});

it.each([
	"span{border:1px solid;box-decoration-break:clone}",
	"span{border:2px solid;border-radius:2px}",
])("rejects unsupported inline decoration profiles", (css) => {
	const { tree } = fixture(css, '<span id="box">text</span>');
	expect(() => rasterizeDocument(tree)).toThrow();
});

it("allows zero-width and display-contents inline borders without inventing boxes", () => {
	const { tree } = fixture(
		"span{border:0 solid}",
		'<span id="box">text</span>',
	);
	expect(rasterizeDocument(tree).metrics.borderPixels).toBe(0);
	const boxless = fixture(
		"span{display:contents;border:5px solid}",
		"<span>text</span>",
	);
	expect(rasterizeDocument(boxless.tree).metrics.borderPixels).toBe(0);
});

it("charges clipped border work to the existing raster budget before pixel loops", () => {
	const { tree } = fixture("#box{width:100px;height:100px;border:5px solid}");
	expect(() =>
		rasterizeDocument(tree, {
			clip: { x: 0, y: 0, width: 100, height: 100 },
			maxWork: 10001,
		}),
	).toThrow("work limit");
});
