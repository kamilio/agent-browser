import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	parseInlineDeclarations,
	propertyValue,
	propertyPriority,
} from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument, prepareDocumentRaster } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(css = "", content = '<div id="target" tabindex="0"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}#target{margin:20px;width:20px;height:20px}${css}</style>${content}`,
		"https://fixture.invalid/outline",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(100, 100);
	const read = (name: string) => resolvedStyleValue(tree, id(), name);
	const outline = () =>
		Reflect.apply(Reflect.get(styles, "outline"), styles, [id()]) as Readonly<
			Record<string, string>
		>;
	return {
		tree,
		id,
		styles,
		read,
		outline,
		raster: () => rasterizeDocument(tree),
		rect: () => documentGeometry(tree).getBoundingClientRect(id()),
	};
}
function pixel(image: RasterImage, column: number, row: number) {
	return Array.from(
		image.pixels.slice(
			(row * image.width + column) * 4,
			(row * image.width + column) * 4 + 4,
		),
	);
}
function declarations(source: string) {
	return parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 100 },
		() => {},
	);
}

it.each([
	"2px solid red",
	"red solid 2px",
	"solid red 2px",
	"red 2px solid",
	"2px red solid",
	"solid 2px red",
])("expands outline shorthand %s without resetting its offset", (value) => {
	const entries = declarations(`outline-offset:4px;outline:${value}!important`);
	expect(entries).toEqual([
		{ property: "outline-offset", value: "4px", important: false },
		{ property: "outline-width", value: "2px", important: true },
		{ property: "outline-style", value: "solid", important: true },
		{ property: "outline-color", value: "red", important: true },
	]);
});

it.each(["none", "solid", "auto", "dashed", "dotted", "double"])(
	"computes and advertises supported outline style %s",
	(style) => {
		const { read, styles } = fixture(`#target{outline:3px ${style} red}`);
		expect(read("outline-style")).toBe(style);
		expect(read("outline-width")).toBe(style === "none" ? "0px" : "3px");
		expect(styles.metrics()).toMatchObject({
			outlineProperties: [
				"outline-width",
				"outline-style",
				"outline-color",
				"outline-offset",
			],
		});
	},
);

it.each([
	"hidden",
	"groove",
	"ridge",
	"inset",
	"outset",
	"solid dashed",
	"-2px solid",
	"10% solid",
	"inherit solid",
	"red blue solid",
])("rejects unsupported/invalid outline shorthand %s atomically", (value) => {
	const entries = declarations(`outline:2px solid red;outline:${value}`);
	expect(entries).toHaveLength(3);
	expect(entries[1].value).toBe("solid");
});

it("serializes inline shorthand and priority without including outline-offset", () => {
	const entries = parseInlineDeclarations(
		"outline: red solid 2px !important;outline-offset:4px",
		10,
	);
	expect(propertyValue(entries, "outline")).toBe("2px solid red");
	expect(propertyPriority(entries, "outline")).toBe("important");
	expect(propertyValue(entries, "outline-offset")).toBe("4px");
});

it("retains pending shorthand substitutions and rejects mixed priorities", () => {
	expect(
		propertyValue(
			parseInlineDeclarations("outline:var(--ring)", 10),
			"outline",
		),
	).toBe("var(--ring)");
	expect(
		propertyValue(
			parseInlineDeclarations(
				"outline:2px solid red;outline-color:blue!important",
				10,
			),
			"outline",
		),
	).toBe("");
});

it.each(["initial", "unset", "revert"])(
	"resets non-inherited outline properties with %s",
	(value) => {
		const { read } = fixture(
			`body{outline:5px solid blue}#target{color:red;outline:${value}}`,
		);
		expect(read("outline")).toBe("0px none rgb(255, 0, 0)");
	},
);

it("inherits computed lengths and color only when explicitly requested", () => {
	const { read } = fixture(
		"body{outline:4px solid currentcolor;outline-offset:-3px;color:blue}#target{outline:inherit;outline-offset:inherit;color:red}",
	);
	expect(read("outline")).toBe("4px solid rgb(0, 0, 255)");
	expect(read("outline-offset")).toBe("-3px");
});

it("preserves default non-inheritance while resolving currentcolor locally", () => {
	const { read } = fixture(
		"body{outline:8px solid blue;outline-offset:10px}#target{color:red;outline-style:solid}",
	);
	expect(read("outline")).toBe("3px solid rgb(255, 0, 0)");
	expect(read("outline-offset")).toBe("0px");
});

it("resolves font, viewport, absolute and calc outline lengths", () => {
	const { read } = fixture(
		"html{font-size:10px}#target{font-size:20px;outline:calc(.1em + .1rem) solid;outline-offset:calc(1vw - 2px)}",
	);
	expect(read("outline-width")).toBe("3px");
	expect(read("outline-offset")).toBe("-1px");
});

it("uses variables and supported @supports declarations without treating invalid values as valid", () => {
	const { read } = fixture(
		"#target{--ring:4px solid blue;outline:var(--ring)}@supports(outline:2px solid red){#target{outline-offset:3px}}@supports(outline:2px hidden){#target{outline-offset:99px}}",
	);
	expect(read("outline")).toBe("4px solid rgb(0, 0, 255)");
	expect(read("outline-offset")).toBe("3px");
});

it("all resets outline properties and invalid variables do not revive earlier declarations", () => {
	const { read } = fixture(
		"#target{outline:5px solid blue;outline-offset:8px;all:initial;outline:var(--missing)}",
	);
	expect(read("outline")).toBe("0px none rgb(0, 0, 0)");
	expect(read("outline-offset")).toBe("0px");
});

it("caches immutable style records and invalidates on attribute changes", () => {
	const { tree, id, outline } = fixture("#target{outline:2px solid red}");
	const before = outline();
	expect(Object.isFrozen(before)).toBe(true);
	expect(outline()).toBe(before);
	tree.setAttribute(id(), "style", "outline:4px solid blue");
	expect(outline()["outline-color"]).toBe("rgb(0, 0, 255)");
	expect(before["outline-color"]).toBe("rgb(255, 0, 0)");
});

it("paints outside the border without changing boxes, hits or DOM state", () => {
	const { tree, id, raster, rect } = fixture("#target{outline:2px solid red}");
	const revision = tree.revision;
	const bounds = rect();
	const result = raster();
	expect(pixel(result.image, 18, 18)).toEqual([255, 0, 0, 255]);
	expect(pixel(result.image, 20, 20)).toEqual([255, 255, 255, 255]);
	expect(result.metrics).toMatchObject({ outlinePixels: 176 });
	expect(rect()).toEqual(bounds);
	expect(documentHitTesting(tree).elementFromPoint(18, 18)).not.toBe(id());
	expect(tree.revision).toBe(revision);
});

it.each([2, -2, -100])(
	"paints outline offset %s with independent minimum dimensions",
	(offset) => {
		const { raster } = fixture(
			`#target{outline:2px solid red;outline-offset:${offset}px}`,
		);
		const result = raster();
		const coordinate = offset === 2 ? 16 : offset === -2 ? 20 : 28;
		expect(pixel(result.image, coordinate, coordinate)).toEqual([
			255, 0, 0, 255,
		]);
		if (offset === -100)
			expect(Reflect.get(result.metrics, "outlinePixels")).toBe(16);
	},
);

it("blends translucent outline corners once", () => {
	const { raster } = fixture("#target{outline:2px solid rgba(255,0,0,.5)}");
	const image = raster().image;
	expect(pixel(image, 18, 18)).toEqual([255, 127, 127, 255]);
	expect(pixel(image, 22, 18)).toEqual([255, 127, 127, 255]);
});

it.each(["none", "0 solid red", "3px solid transparent"])(
	"does not paint invisible outline %s",
	(value) => {
		const { raster, read } = fixture(`#target{outline:${value}}`);
		expect(read("outline-style")).not.toBe("");
		expect(Reflect.get(raster().metrics, "outlinePixels")).toBe(0);
	},
);

it.each(["dashed", "dotted", "double"])(
	"paints distinct bounded %s patterns rather than substituting a solid ring",
	(style) => {
		const solid = fixture("#target{outline:6px solid red}").raster();
		const patterned = fixture(`#target{outline:6px ${style} red}`).raster();
		const painted = Reflect.get(patterned.metrics, "outlinePixels");
		expect(painted).toBeGreaterThan(0);
		expect(painted).toBeLessThan(Reflect.get(solid.metrics, "outlinePixels"));
		expect(patterned.image.pixels).not.toEqual(solid.image.pixels);
	},
);

it("renders auto feedback at native thickness regardless of specified width", () => {
	const { read, raster } = fixture("#target{outline:99px auto}");
	expect(read("outline-color")).toBe("auto");
	expect(read("outline-width")).toBe("99px");
	expect(pixel(raster().image, 18, 18)).toEqual([0, 90, 200, 255]);
	expect(pixel(raster().image, 17, 17)).toEqual([255, 255, 255, 255]);
});

it("updates authored focus feedback without changing geometry", () => {
	const { tree, id, raster, rect, read } = fixture(
		"#target:focus{outline:3px solid blue;outline-offset:2px}",
	);
	const before = raster();
	const bounds = rect();
	documentInteractions(tree).focus.focus(tree.reference(id()));
	expect(read("outline-style")).toBe("solid");
	expect(raster().image.pixels).not.toEqual(before.image.pixels);
	expect(rect()).toEqual(bounds);
	tree.setActiveElement(null);
	expect(raster().image.pixels).toEqual(before.image.pixels);
});

it.each(["visibility:hidden", "display:none", "display:contents"])(
	"does not paint a boxless or invisible target with %s",
	(css) => {
		const { read, raster } = fixture(`#target{outline:2px solid red;${css}}`);
		expect(read("outline-style")).toBe("solid");
		expect(Reflect.get(raster().metrics, "outlinePixels")).toBe(0);
	},
);

it("paints each wrapped inline fragment as a closed shape", () => {
	const { raster, read } = fixture(
		"#target{margin:20px;width:30px}span{outline:1px solid red}",
		'<div id="target"><span>one two three</span></div>',
	);
	expect(read("outline-style")).toBe("none");
	expect(Reflect.get(raster().metrics, "outlinePixels")).toBeGreaterThan(0);
});

it("paints native replaced controls and keeps element crops at the border box", () => {
	const { tree, id, raster, read } = fixture(
		"#target{outline:2px solid red}",
		'<input id="target" type="button" value="Go">',
	);
	expect(read("outline-style")).toBe("solid");
	expect(Reflect.get(raster().metrics, "outlinePixels")).toBeGreaterThan(0);
	const crop = rasterizeDocument(tree, { element: tree.reference(id()) });
	expect(Reflect.get(crop.metrics, "outlinePixels")).toBe(0);
});

it("clips outlines to explicit capture bounds and enforces the raster work budget", () => {
	const { tree, read } = fixture("#target{outline:8px solid red}");
	expect(read("outline-style")).toBe("solid");
	const cropped = rasterizeDocument(tree, {
		clip: { x: 12, y: 12, width: 4, height: 4 },
	});
	expect(Reflect.get(cropped.metrics, "outlinePixels")).toBe(16);
	expect(() => rasterizeDocument(tree, { maxWork: 1 })).toThrow(/work limit/);
});

it("respects later positive stacking content covering the outline", () => {
	const { raster, read } = fixture(
		"#target{outline:2px solid red}#cover{position:relative;z-index:2;top:-42px;left:18px;width:24px;height:24px;background:blue}",
		'<div id="target"></div><div id="cover"></div>',
	);
	expect(read("outline-style")).toBe("solid");
	expect(pixel(raster().image, 18, 18)).toEqual([0, 0, 255, 255]);
});

it("invalidates prepared captures on outline changes and releases styles on close", () => {
	const { tree, id, styles, outline } = fixture(
		"#target{outline:2px solid red}",
	);
	outline();
	const prepared = prepareDocumentRaster(tree);
	tree.setAttribute(id(), "style", "outline:3px solid blue");
	expect(() => prepared.rasterize()).toThrow(/stale/);
	styles.close();
	expect(outline).toThrow(/closed/);
});

it.each(["auto solid 2px", "solid 2px auto", "2px auto solid"])(
	"resolves ambiguous auto color in %s",
	(value) => {
		const { read } = fixture(`#target{color:red;outline:${value}}`);
		expect(read("outline")).toBe("2px solid rgb(255, 0, 0)");
	},
);

it.each(["auto", "2px auto auto"])(
	"resolves auto style and color in %s",
	(value) => {
		const { read } = fixture(`#target{outline:${value}}`);
		expect(read("outline-style")).toBe("auto");
		expect(read("outline-color")).toBe("auto");
	},
);

it.each(["auto", "2%", "calc(1px + 2%)"])(
	"rejects invalid outline offsets %s without replacing a valid offset",
	(value) => {
		const { read } = fixture(
			`#target{outline-offset:4px;outline-offset:${value}}`,
		);
		expect(read("outline-offset")).toBe("4px");
	},
);
