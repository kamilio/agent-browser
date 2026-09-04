import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
} from "./css-box.js";
import { parseInlineDeclarations } from "./css-declarations.js";
import {
	computeLengthMath,
	cssMathLimits,
	normalizeLengthMath,
	resolveLengthMath,
	splitLengthComponents,
} from "./css-math.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { resolveLayoutLength } from "./layout-values.js";
import {
	resolveHeightConstraints,
	resolveReplacedSize,
} from "./replaced-box.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(css: string, content = '<div id="target">ab</div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:20px}html,body{margin:0;padding:0}main{width:200px;font-size:10px}#target{font-size:12px}${css}</style><main id="parent">${content}</main>`,
		"https://fixture.invalid/math-core",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(400, 200);
	return {
		tree,
		id,
		styles,
		box: () => styles.box(id()),
		read: (name: string) => resolvedStyleValue(tree, id(), name),
	};
}

function computed(value: string, signed = false) {
	return computeLengthMath(
		value,
		(unit) =>
			({
				px: 1,
				em: 12,
				rem: 20,
				vw: 4,
				vh: 2,
				vmin: 2,
				vmax: 4,
				in: 96,
				cm: 96 / 2.54,
				mm: 96 / 25.4,
				q: 96 / 101.6,
				pt: 96 / 72,
				pc: 16,
			})[unit] ?? Number.NaN,
		signed,
	);
}

it.each([
	["calc(2px + 3px * 4)", "14px"],
	["calc((2px + 3px) * 4)", "20px"],
	["calc(24px / 2 / 3)", "4px"],
	["calc(24px / (2 / 3))", "36px"],
	["calc(10px - (3px - 2px))", "9px"],
	["calc(2em + 1rem)", "44px"],
	["calc(2vw + 1vh + 1vmin + 1vmax)", "16px"],
	["calc(1in + 1pc + 3pt)", "116px"],
	["calc(1e2px + .5px)", "100.5px"],
	["min(3em, 2rem, 30px)", "30px"],
	["max(3em, 2rem, 30px)", "40px"],
	["clamp(40px, 10px, 20px)", "40px"],
	["clamp(10px, 100px, 20px)", "20px"],
	["calc(min(-5px, -10px) * -1)", "10px"],
	["calc(max(2, 3) * 4px)", "12px"],
	["CALC(2PX + 3PX)", "5px"],
])("computes the finite length profile: %s", (value, expected) => {
	expect(normalizeLengthMath(value)).toBeDefined();
	expect(computed(value)).toBe(expected);
});

it.each([
	"calc(0 + 2px)",
	"calc(2px * 3px)",
	"calc(2px / 1px)",
	"calc(1px / 0)",
	"calc(1px / (2 - 2))",
	"calc(1px * 1e999)",
	"calc(1px+ 2px)",
	"calc(1px +2px)",
	"calc(1px-2px)",
	"calc()",
	"calc(1px, 2px)",
	"min(1px,)",
	"clamp(1px, 2px)",
	"calc(1ch + 2px)",
	"calc(infinity * 1px)",
])("rejects invalid or outside-profile declarations: %s", (value) => {
	expect(normalizeLengthMath(value)).toBeUndefined();
	expect(parseBoxDeclarations("width", value)).toBeUndefined();
	expect(
		parseInlineDeclarations(`width:${value}`, 10).filter(
			(entry) => entry.name === "width",
		),
	).toEqual([]);
});

it("keeps expression validation separate from declaration statement splitting", () => {
	expect(normalizeLengthMath("calc(1px);height:2px")).toBeUndefined();
	expect(parseBoxDeclarations("width", "calc(1px);height:2px")).toBeUndefined();
	expect(parseInlineDeclarations("width:calc(1px);height:2px", 10)).toEqual([
		{ name: "width", value: "calc(1px)", important: false },
		{ name: "height", value: "2px", important: false },
	]);
});

it("expands math-containing shorthands through both declaration paths", () => {
	const source = "calc(1em + 2px) min(10%, 20px)";
	expect(splitLengthComponents(source)).toEqual([
		"calc(1em + 2px)",
		"min(10%, 20px)",
	]);
	const boxed = parseBoxDeclarations("padding", source);
	expect(boxed).toHaveLength(4);
	expect(parseInlineDeclarations(`padding:${source}!important`, 10)).toEqual(
		boxed?.map(({ property, value }) => ({
			name: property,
			value,
			important: true,
		})),
	);
});

it.each([
	"width",
	"height",
	"min-width",
	"min-height",
	"max-width",
	"max-height",
	"margin-top",
	"margin-left",
	"padding-top",
	"padding-left",
])(
	"integrates authored and inline %s calculations with computed box values",
	(property) => {
		const sheet = fixture(`#target{${property}:calc(2em + 1rem)}`);
		const inline = fixture(
			"",
			`<div id="target" style="${property}:calc(2em + 1rem)">ab</div>`,
		);
		expect(sheet.box()[property as keyof typeof initialBoxStyle]).toBe("44px");
		expect(inline.box()[property as keyof typeof initialBoxStyle]).toBe("44px");
	},
);

it("computes font units while leaving percentages for each used width", () => {
	const { box, read } = fixture("#target{width:calc(100% - 2rem)}");
	expect(box().width).toBe("calc(100% - 40px)");
	expect(read("width")).toBe("160px");
	expect(resolveLayoutLength(box().width, 100)).toBe(60);
	expect(resolveLayoutLength(box().width, 20)).toBe(0);
	expect(resolveLayoutLength(box().width, 20, true)).toBe(-20);
});

it.each([
	"calc(0% + 20px)",
	"calc((100% - 100%) + 20px)",
	"calc(0 * 100% + 20px)",
])("keeps indefinite-height dependence for %s", (value) => {
	const style = {
		...initialBoxStyle,
		height: computed(value),
		"min-height": computed(value),
		"max-height": computed(value),
	};
	expect(resolveHeightConstraints(style, 200, null)).toMatchObject({
		preferred: null,
		minimum: 0,
		maximum: null,
	});
	expect(resolveHeightConstraints(style, 200, 100)).toMatchObject({
		preferred: 20,
		minimum: 20,
		maximum: 20,
	});
});

it("uses the available height basis for replaced elements and preserves aspect ratio otherwise", () => {
	const style = {
		...initialBoxStyle,
		width: "calc(50% - 10px)",
		height: "calc(50% + 10px)",
	};
	expect(resolveReplacedSize(100, 50, style, 200, null)).toMatchObject({
		contentWidth: 90,
		contentHeight: 45,
	});
	expect(resolveReplacedSize(100, 50, style, 200, 100)).toMatchObject({
		contentWidth: 90,
		contentHeight: 60,
	});
});

it("uses containing width for vertical percentage padding", () => {
	const { read } = fixture(
		"#target{height:20px;padding-top:calc(10% + 2px);padding-bottom:calc(5% + 1px)}",
	);
	expect(read("padding-top")).toBe("22px");
	expect(read("padding-bottom")).toBe("11px");
});

it("preserves negative margins but clamps only completed nonnegative calculations", () => {
	const { box } = fixture(
		"#target{width:calc(2px - 5px);margin-left:calc(2px - 5px);padding-left:calc(min(-5px, -10px) * -1)}",
	);
	expect(box()).toMatchObject({
		width: "0px",
		"margin-left": "-3px",
		"padding-left": "10px",
	});
});

it("inherits computed font terms without freezing a percentage basis", () => {
	const { box, read } = fixture(
		"#parent{width:calc(50% + 1em)}#target{font-size:30px;width:inherit}",
	);
	expect(box().width).toBe("calc(50% + 10px)");
	expect(read("width")).toBe("115px");
});

it("invalidates live values after font, container and viewport changes", () => {
	const { tree, id, styles, read } = fixture(
		"#target{width:calc(50% + 1rem + 1em + 10vw)}",
	);
	expect(read("width")).toBe("172px");
	tree.setAttribute(id("html"), "style", "font-size:30px");
	expect(read("width")).toBe("182px");
	tree.setAttribute(id(), "style", "font-size:20px");
	expect(read("width")).toBe("190px");
	tree.setAttribute(id("#parent"), "style", "width:300px");
	expect(read("width")).toBe("240px");
	styles.setViewport(200, 100);
	expect(read("width")).toBe("220px");
});

it("does not request an unused invalid element font basis", () => {
	expect(
		fixture("#target{width:calc(1rem + 2px);font-size:1e20px}").box().width,
	).toBe("22px");
	expect(
		fixture("#target{width:calc(20px + 2px);font-size:1e20px}").box().width,
	).toBe("22px");
	expect(() =>
		computeBoxStyle({ width: "calc(2em + 1px)" }, initialBoxStyle, {
			width: 200,
			height: 100,
		}),
	).toThrow("font metrics");
});

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
	"validates explicit font basis %s",
	(fontSize) => {
		const invoke = () =>
			computeBoxStyle(
				{ width: "calc(2em + 1rem)" },
				initialBoxStyle,
				{ width: 200, height: 100 },
				{ fontSize, rootFontSize: 20 },
			);
		if (fontSize === 0) expect(invoke().width).toBe("20px");
		else expect(invoke).toThrow("font metrics");
	},
);

it.each(["div", "span"])(
	"shares geometry and software pixels with explicit lengths for %s",
	(tag) => {
		const content = `<${tag} id="target">ab</${tag}>`;
		const math = fixture(
			"#target{width:calc(100% - 2rem);height:calc(20px + 1em);padding:calc(2px + 1px);background:blue}",
			content,
		);
		const pixels = fixture(
			"#target{width:160px;height:32px;padding:3px;background:blue}",
			content,
		);
		expect(
			documentGeometry(math.tree).getBoundingClientRect(math.id()),
		).toEqual(documentGeometry(pixels.tree).getBoundingClientRect(pixels.id()));
		expect(rasterizeDocument(math.tree).image.pixels).toEqual(
			rasterizeDocument(pixels.tree).image.pixels,
		);
	},
);

it("bounds source size, nesting, argument count and parser work", () => {
	expect(
		normalizeLengthMath(`${"calc(".repeat(32)}1px${")".repeat(32)}`),
	).toBeDefined();
	expect(
		normalizeLengthMath(`${"calc(".repeat(33)}1px${")".repeat(33)}`),
	).toBeUndefined();
	expect(
		normalizeLengthMath(`min(${Array(32).fill("1px").join(",")})`),
	).toBeDefined();
	expect(
		normalizeLengthMath(`min(${Array(33).fill("1px").join(",")})`),
	).toBeUndefined();
	expect(
		normalizeLengthMath(`calc(${Array(200).fill("1px").join(" + ")})`),
	).toBeUndefined();
	expect(
		normalizeLengthMath(
			`calc(1px${" ".repeat(cssMathLimits.maxSourceCodeUnits)})`,
		),
	).toBeUndefined();
});

it("preserves long left-associative mixed calculations through serialization", () => {
	expect(
		resolveLayoutLength(computed(`calc(100%${" - 1px".repeat(100)})`), 200),
	).toBe(100);
});

it("rejects numerical overflow, excessive used lengths and unresolved layout units", () => {
	expect(() => computed("calc(1e308px * 10)")).toThrow("overflow");
	expect(() => resolveLayoutLength("calc(1e20px + 1%)", 100)).toThrow("limit");
	expect(() => resolveLengthMath("calc(1em + 10%)", 100)).toThrow("computed");
});

it("rejects queries through closed native style owners", () => {
	const { tree, box } = fixture("#target{width:calc(2em + 1px)}");
	expect(box().width).toBe("25px");
	tree.close();
	expect(box).toThrow();
});
