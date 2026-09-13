import { afterEach, expect, it } from "vitest";
import { bitmapFont, bitmapGlyph } from "./bitmap-font.js";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	computeBoxStyle,
	fontRelativeBoxUnits,
	initialBoxStyle,
	parseBoxDeclarations,
} from "./css-box.js";
import { gridValueUsesFont } from "./css-grid.js";
import { lengthUsesFont } from "./css-math.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { nativeFontXHeight } from "./font-metrics.js";
import { matchFontWeight } from "./font-weight.js";
import { parseHtmlDocument } from "./html-parser.js";
import { resolveLayoutLength } from "./layout-values.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const owners: { tree: DocumentTree; queries: DocumentQueries }[] = [];
afterEach(() => {
	for (const { tree, queries } of owners.splice(0)) {
		try {
			queries.close();
		} finally {
			tree.close();
		}
	}
});

function expectedXHeight(fontSize: number, fontWeight = 400) {
	return (
		(fontSize * bitmapGlyph("x", matchFontWeight(fontWeight)).ink.height) /
		bitmapFont.unitsPerEm
	);
}

function fixture(css: string, content = '<div id="target"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:32px}html,body{margin:0;padding:0}main{width:200px;font-size:8px}#target{font-size:16px}${css}</style><main id="outer">${content}</main>`,
		"https://fixture.invalid/ex-length",
	);
	const queries = new DocumentQueries(tree);
	owners.push({ tree, queries });
	const styles = documentStyles(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture node: ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		box: () => styles.box(id()),
		read: (property: string) => resolvedStyleValue(tree, id(), property),
	};
}

const viewport = { width: 200, height: 100 };

it("advertises ex and detects actual length leaves without confusing em/rem", () => {
	expect(fontRelativeBoxUnits).toEqual(["em", "rem", "ex"]);
	expect(lengthUsesFont("2EX", "ex")).toBe(true);
	expect(lengthUsesFont("clamp(1px, calc(2ex + 1rem), 4em)", "ex")).toBe(true);
	expect(lengthUsesFont("calc(2em + 1rem)", "ex")).toBe(false);
	expect(lengthUsesFont("2ex", "em")).toBe(false);
	expect(lengthUsesFont("2ex", "rem")).toBe(false);
	expect(lengthUsesFont("2example", "ex")).toBe(false);
});

it("detects grid dimensions but not line names, area strings or placement names", () => {
	expect(gridValueUsesFont("[ex next] minmax(2ex, 1fr)", "ex")).toBe(true);
	expect(gridValueUsesFont("repeat(2, [ex] 1EX)", "ex")).toBe(true);
	expect(gridValueUsesFont("[ex next] 1fr [rem] 20px", "ex")).toBe(false);
	expect(gridValueUsesFont('"1ex ex"', "ex")).toBe(false);
	expect(gridValueUsesFont("ex", "ex")).toBe(false);
});

it.each([
	[0, 400],
	[12.5, 400],
	[16, 700],
	[24, 600],
])(
	"derives x-height from the selected bitmap glyph at %spx/%s",
	(size, weight) => {
		expect(nativeFontXHeight(size, weight)).toBe(expectedXHeight(size, weight));
	},
);

it("uses the regular glyph when native x-height weight is omitted", () => {
	expect(nativeFontXHeight(16)).toBe(expectedXHeight(16));
});

it.each([
	["2ex", "15px"],
	["calc(2ex + 1em + 1rem)", "59px"],
	["min(4ex, 2em)", "24px"],
	["max(1ex, .5rem)", "16px"],
	["clamp(1ex, calc(1em + .5ex), 3ex)", "15.75px"],
	["clamp(4ex, 1ex, 2ex)", "30px"],
	["calc(min(-2ex, -1px) * -1)", "15px"],
])("computes scalar and nested ex lengths: %s", (width, expected) => {
	expect(
		computeBoxStyle({ width }, initialBoxStyle, viewport, {
			fontSize: 12,
			rootFontSize: 32,
			xHeight: 7.5,
		}).width,
	).toBe(expected);
});

it("retains percentage context alongside independent em, rem and ex metrics", () => {
	const computed = computeBoxStyle(
		{ width: "calc(50% + 1em + 1rem - 2ex)" },
		initialBoxStyle,
		viewport,
		{ fontSize: 12, rootFontSize: 32, xHeight: 7.5 },
	).width;
	expect(resolveLayoutLength(computed, 200)).toBe(129);
	expect(resolveLayoutLength(computed, 80)).toBe(69);
	const comparison = computeBoxStyle(
		{ width: "clamp(1ex, min(80%, 4ex), max(50%, 2ex))" },
		initialBoxStyle,
		viewport,
		{ xHeight: 10 },
	).width;
	expect(resolveLayoutLength(comparison, 100)).toBe(40);
	expect(resolveLayoutLength(comparison, 20)).toBe(16);
});

it.each(["0ex", "2ex", "calc(1ex + 1px)", "min(1px, 2ex)"])(
	"requires x-height even when font size exists for %s",
	(width) => {
		for (const fonts of [undefined, { fontSize: 16, rootFontSize: 32 }]) {
			expect(() =>
				computeBoxStyle({ width }, initialBoxStyle, viewport, fonts),
			).toThrowError(expect.objectContaining({ code: "unsupported" }));
		}
	},
);

it("accepts independent fractional and zero x-height without fallback metrics", () => {
	expect(
		computeBoxStyle({ width: "2ex" }, initialBoxStyle, viewport, {
			xHeight: 0.125,
		}).width,
	).toBe("0.25px");
	expect(
		computeBoxStyle(
			{ width: "2ex", height: "calc(1ex + 3px)" },
			initialBoxStyle,
			viewport,
			{ fontSize: 16, xHeight: 0 },
		),
	).toMatchObject({ width: "0px", height: "3px" });
});

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
	"rejects invalid supplied x-height %s even for absolute lengths",
	(xHeight) => {
		for (const width of ["1ex", "1px"]) {
			expect(() =>
				computeBoxStyle({ width }, initialBoxStyle, viewport, { xHeight }),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		}
	},
);

it("reports ex multiplication overflow rather than clamping metrics", () => {
	expect(() =>
		computeBoxStyle({ width: "1e308ex" }, initialBoxStyle, viewport, {
			xHeight: 10,
		}),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("validates negative ex literals by property and clamps only final math ranges", () => {
	for (const property of ["width", "padding-left", "border-top-width"])
		expect(parseBoxDeclarations(property, "-1ex")).toBeUndefined();
	expect(parseBoxDeclarations("margin-left", "-.25ex")).toEqual([
		{ property: "margin-left", value: "-0.25ex" },
	]);
	expect(
		computeBoxStyle(
			{
				width: "calc(1ex - 2ex)",
				"padding-left": "calc(1ex - 2ex)",
				"margin-left": "-.25ex",
				top: "calc(1ex - 2ex)",
			},
			initialBoxStyle,
			viewport,
			{ xHeight: 10 },
		),
	).toMatchObject({
		width: "0px",
		"padding-left": "0px",
		"margin-left": "-2.5px",
		top: "-10px",
	});
});

it("uses own x-height for box, inset and border dimensions rather than root size", () => {
	const { box } = fixture(
		"#target{width:2ex;height:3ex;min-width:1ex;max-width:5ex;min-height:.5ex;max-height:6ex;margin:.25ex;padding:.5ex;border:.2ex solid red;position:relative;left:-.5ex}",
	);
	const metric = expectedXHeight(16);
	expect(box()).toMatchObject({
		width: `${2 * metric}px`,
		height: `${3 * metric}px`,
		"min-width": `${metric}px`,
		"max-width": `${5 * metric}px`,
		"min-height": `${0.5 * metric}px`,
		"max-height": `${6 * metric}px`,
		"margin-top": `${0.25 * metric}px`,
		"padding-right": `${0.5 * metric}px`,
		"border-bottom-width": `${Math.max(1, Math.floor(0.2 * metric))}px`,
		left: `${-0.5 * metric}px`,
	});
});

it("preserves native border snapping and hidden-side resolved width", () => {
	const { box, read } = fixture(
		"#target{border:.15ex solid blue;border-right-width:.01ex;border-bottom-width:0ex;border-left-style:none}",
	);
	expect(box()).toMatchObject({
		"border-top-width": "1px",
		"border-right-width": "1px",
		"border-bottom-width": "0px",
		"border-left-width": "1px",
	});
	expect(read("border-left-width")).toBe("0px");
});

it("inherits computed ex box and table values without applying the child's metric", () => {
	const { box, styles, id } = fixture(
		"#outer{width:2ex;margin-left:1ex;border-spacing:1ex 2ex}#target{font-size:24px;width:inherit;margin-left:inherit}",
	);
	const metric = expectedXHeight(8);
	expect(box()).toMatchObject({
		width: `${2 * metric}px`,
		"margin-left": `${metric}px`,
	});
	expect(styles.table(id())["border-spacing"]).toBe(
		`${metric}px ${2 * metric}px`,
	);
});

it("computes outline, flex, grid and table leaves through DocumentStyles", () => {
	const { styles, id } = fixture(
		"#target{outline:calc(.1ex + 1px) solid red;outline-offset:-.25ex;flex-basis:calc(50% - 2ex);gap:1ex 1rem;grid-template-columns:[ex] minmax(2ex, 1fr) fit-content(1rem) repeat(2, [next] .5ex);grid-auto-rows:1ex 1em;border-spacing:calc(.25ex + .25ex) 1rem}",
	);
	const metric = expectedXHeight(16);
	expect(styles.outline(id())).toMatchObject({
		"outline-width": `${Math.max(1, Math.floor(0.1 * metric + 1))}px`,
		"outline-offset": `${-0.25 * metric}px`,
	});
	expect(styles.flex(id())).toMatchObject({
		"flex-basis": `calc(50% - ${2 * metric}px)`,
		"row-gap": `${metric}px`,
		"column-gap": "32px",
	});
	expect(styles.grid(id())).toMatchObject({
		"grid-template-columns": `[ex] minmax(${2 * metric}px, 1fr) fit-content(32px) repeat(2, [next] ${0.5 * metric}px)`,
		"grid-auto-rows": `${metric}px 16px`,
	});
	expect(styles.table(id())["border-spacing"]).toBe(`${0.5 * metric}px 32px`);
});

it("does not request own metrics for absolute consumers or grid names containing ex", () => {
	const { styles, id, box } = fixture(
		'#target{font-size:1e20px;width:22px;outline:1px solid red;outline-offset:2px;flex-basis:12px;gap:2px;grid-template-columns:[ex next] 1fr 20px;grid-template-areas:"ex";grid-row-start:ex;border-spacing:3px}',
	);
	expect(box().width).toBe("22px");
	expect(styles.outline(id())["outline-offset"]).toBe("2px");
	expect(styles.flex(id())["flex-basis"]).toBe("12px");
	expect(styles.grid(id())["grid-template-columns"]).toBe("[ex next] 1fr 20px");
	expect(styles.table(id())["border-spacing"]).toBe("3px 3px");
	expect(() => styles.text(id())).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("does not introduce own x-height dependencies for rem-only consumers", () => {
	const { styles, id, box } = fixture(
		"#target{font-size:1e20px;width:1rem;outline:1rem solid red;flex-basis:1rem;grid-auto-rows:1rem;border-spacing:1rem}",
	);
	expect(box().width).toBe("32px");
	expect(styles.outline(id())["outline-width"]).toBe("32px");
	expect(styles.flex(id())["flex-basis"]).toBe("32px");
	expect(styles.grid(id())["grid-auto-rows"]).toBe("32px");
	expect(styles.table(id())["border-spacing"]).toBe("32px 32px");
	expect(() => styles.text(id())).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each([
	["box", "width:1ex"],
	["outline", "outline:1ex solid red"],
	["flex", "flex-basis:1ex"],
	["grid", "grid-template-columns:1ex"],
	["table", "border-spacing:1ex"],
] as const)(
	"requests own metrics when the %s consumer actually uses ex",
	(kind, css) => {
		const { styles, id } = fixture(`#target{font-size:1e20px;${css}}`);
		expect(() => styles[kind](id())).toThrowError(
			expect.objectContaining({ code: "resource-limit" }),
		);
	},
);

it("retains zero and fractional computed own x-heights in document boxes", () => {
	const zero = fixture("#target{font-size:0;width:2ex;height:1rem}");
	expect(zero.box()).toMatchObject({ width: "0px", height: "32px" });
	const fractional = fixture("#target{font-size:12.5px;width:.5ex}");
	expect(fractional.box().width).toBe(`${0.5 * expectedXHeight(12.5)}px`);
});

it("resolves inherited custom-property ex tokens at each use site and invalidates consumers", () => {
	const { tree, styles, id, box } = fixture(
		"#outer{--size:2ex;width:var(--size)}#target{width:var(--size);outline:var(--size) solid red;flex-basis:var(--size);grid-auto-rows:var(--size);border-spacing:var(--size)}",
	);
	const check = (factor: number) => {
		const value = `${factor * expectedXHeight(16)}px`;
		expect(box().width).toBe(value);
		expect(styles.outline(id())["outline-width"]).toBe(value);
		expect(styles.flex(id())["flex-basis"]).toBe(value);
		expect(styles.grid(id())["grid-auto-rows"]).toBe(value);
		expect(styles.table(id())["border-spacing"]).toBe(`${value} ${value}`);
	};
	expect(styles.box(id("#outer")).width).toBe(`${2 * expectedXHeight(8)}px`);
	check(2);
	tree.setAttribute(id("#outer"), "style", "--size:3ex");
	check(3);
	tree.setAttribute(id("#outer"), "style", "--size:1ex");
	check(1);
});

it("invalidates all ex consumers after typography and stylesheet changes", () => {
	const declarations =
		"width:2ex;height:1rem;outline:1ex solid red;flex-basis:1ex;grid-auto-rows:1ex;border-spacing:1ex";
	const { tree, styles, id, box } = fixture(`#target{${declarations}}`);
	const check = (fontSize: number, weight = 400, rootSize = 32) => {
		const metric = expectedXHeight(fontSize, weight);
		expect(box()).toMatchObject({
			width: `${2 * metric}px`,
			height: `${rootSize}px`,
		});
		expect(styles.outline(id())["outline-width"]).toBe(
			`${Math.floor(metric)}px`,
		);
		expect(styles.flex(id())["flex-basis"]).toBe(`${metric}px`);
		expect(styles.grid(id())["grid-auto-rows"]).toBe(`${metric}px`);
		expect(styles.table(id())["border-spacing"]).toBe(
			`${metric}px ${metric}px`,
		);
	};
	check(16);
	tree.setAttribute(id("html"), "style", "font-size:48px");
	check(16, 400, 48);
	tree.setAttribute(id(), "style", "font-size:24px;font-weight:700");
	check(24, 700, 48);
	tree.setAttribute(id(), "style", "");
	tree.setTextContent(
		id("style"),
		`html,body{margin:0;padding:0}main{width:200px;font-size:8px}#target{font-size:8px;${declarations}}`,
	);
	check(8, 400, 48);
});

it("recomputes inherited own metrics after reparenting while retaining the root basis", () => {
	const { tree, styles, id, box } = fixture(
		"#left{font-size:8px}#right{font-size:24px}#target{font-size:inherit;width:2ex;height:1rem;outline:1ex solid red;flex-basis:1ex;grid-auto-rows:1ex;border-spacing:1ex}",
		'<section id="left"><div id="target"></div></section><section id="right"></section>',
	);
	const check = (fontSize: number) => {
		const metric = expectedXHeight(fontSize);
		expect(box()).toMatchObject({ width: `${2 * metric}px`, height: "32px" });
		expect(styles.outline(id())["outline-width"]).toBe(`${metric}px`);
		expect(styles.flex(id())["flex-basis"]).toBe(`${metric}px`);
		expect(styles.grid(id())["grid-auto-rows"]).toBe(`${metric}px`);
		expect(styles.table(id())["border-spacing"]).toBe(
			`${metric}px ${metric}px`,
		);
	};
	check(8);
	tree.append(id("#right"), id());
	check(24);
});

it("applies box sizing and min/max constraints after resolving ex math", () => {
	const { box, read } = fixture(
		"#target{box-sizing:border-box;width:calc(20ex + 1rem);min-width:4ex;max-width:8ex;padding:.5ex;border:.2ex solid red}",
	);
	expect(box().width).toBe(`${20 * expectedXHeight(16) + 32}px`);
	expect(read("width")).toBe(`${8 * expectedXHeight(16)}px`);
});

it.each(["block", "inline", "control"])(
	"matches pixel geometry and raster output for an ex %s box",
	(kind) => {
		const content =
			kind === "inline"
				? '<span id="target">ab</span>'
				: kind === "control"
					? '<input id="target" value="ab">'
					: '<div id="target">ab</div>';
		const metric = expectedXHeight(16);
		const dimensions = kind === "inline" ? "" : "width:4ex;height:2ex;";
		const pixels =
			kind === "inline" ? "" : `width:${4 * metric}px;height:${2 * metric}px;`;
		const relative = fixture(
			`#target{${dimensions}padding:.5ex;border:.2ex solid red;outline:.1ex solid green;outline-offset:.2ex;background:blue}`,
			content,
		);
		const absolute = fixture(
			`#target{${pixels}padding:${0.5 * metric}px;border:${0.2 * metric}px solid red;outline:${0.1 * metric}px solid green;outline-offset:${0.2 * metric}px;background:blue}`,
			content,
		);
		relative.styles.setViewport(240, 120);
		absolute.styles.setViewport(240, 120);
		expect(
			documentGeometry(relative.tree).getBoundingClientRect(relative.id()),
		).toEqual(
			documentGeometry(absolute.tree).getBoundingClientRect(absolute.id()),
		);
		expect(rasterizeDocument(relative.tree).image.pixels).toEqual(
			rasterizeDocument(absolute.tree).image.pixels,
		);
	},
);
