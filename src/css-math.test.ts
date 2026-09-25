import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	computeBoxStyle,
	initialBoxStyle,
	parseBoxDeclarations,
} from "./css-box.js";
import { normalizeBorderWidth, parseBorderShorthand } from "./css-border.js";
import {
	cssMathLimits,
	computeLengthMath,
	lengthUsesFont,
	normalizeLengthMath,
	resolveLengthMath,
} from "./css-math.js";
import { parseInlineDeclarations } from "./css-declarations.js";
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
		`<!doctype html><style>html{font-size:20px}html,body{margin:0;padding:0}main{width:200px;font-size:10px}#target{font-size:12px}${css}</style><main id="outer">${content}</main>`,
		"https://fixture.invalid/css-math",
	);
	trees.push(tree);
	const styles = documentStyles(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing fixture node");
		return found;
	};
	return {
		tree,
		styles,
		id,
		box: () => styles.box(id()),
		read: (name: string) => resolvedStyleValue(tree, id(), name),
	};
}
const computed = (value: string, signed = false) =>
	computeLengthMath(
		value,
		(unit) =>
			({
				px: 1,
				em: 12,
				rem: 20,
				vw: 4,
				vh: 3,
				vmin: 3,
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

it.each([
	["calc(2px + 3px * 4)", "14px"],
	["calc((2px + 3px) * 4)", "20px"],
	["calc(30px / (2 * 3))", "5px"],
	["calc(2 * (3px + 4px))", "14px"],
	["calc(2em + 1rem)", "44px"],
	["calc(2vw + 1vh + 1vmin + 1vmax)", "18px"],
	["calc(1in + 1pc + 3pt)", "116px"],
	["calc(1e2px + .5px)", "100.5px"],
	["calc(10px - 3px - 2px)", "5px"],
	["calc(10px - (3px - 2px))", "9px"],
	["calc(24px / 2 / 3)", "4px"],
	["calc(24px / (2 / 3))", "36px"],
	["calc(1px + -2px)", "0px"],
	["calc(-1 * calc(-2px))", "2px"],
	["min(3em, 2rem, 30px)", "30px"],
	["max(3em, 2rem, 30px)", "40px"],
	["clamp(40px, 10px, 20px)", "40px"],
	["clamp(10px, 100px, 20px)", "20px"],
	["calc(min(-5px, -10px) * -1)", "10px"],
	["calc(max(2, 3) * 4px)", "12px"],
	["CALC(2PX + 3PX)", "5px"],
])("computes finite typed math %s", (value, expected) => {
	expect(normalizeLengthMath(value)).toBeDefined();
	expect(computed(value)).toBe(expected);
});

it.each([
	"calc(0)",
	"calc(0 + 2px)",
	"calc(2px + 3)",
	"calc(2px * 3px)",
	"calc(2px / 1px)",
	"calc(1px / 0)",
	"calc(1px / (2 - 2))",
	"calc(1px * 1e999)",
	"calc(1px * (1e200 * 1e200))",
	"calc(1px+ 2px)",
	"calc(1px +2px)",
	"calc(1px-2px)",
	"calc(1px + - 2px)",
	"calc()",
	"calc(1px, 2px)",
	"min()",
	"min(1px,)",
	"clamp(1px, 2px)",
	"clamp(none, 2px, 3px)",
	"calc(1ch + 2px)",
	"calc(pi * 2px)",
	"calc(infinity * 1px)",
	"round(1px, 2px)",
	"calc(1px) garbage",
	"calc(1px);height:2px",
	"calc(1px + var(--x))",
	"min(1px, 2)",
])("rejects invalid or outside-profile math %s", (value) => {
	expect(normalizeLengthMath(value)).toBeUndefined();
	expect(parseBoxDeclarations("width", value)).toBeUndefined();
});

it("preserves mixed percentages and resolves against each actual containing block", () => {
	const value = computed("calc(100% - 2rem)");
	expect(value).toBe("calc(100% - 40px)");
	expect(resolveLayoutLength(value, 200)).toBe(160);
	expect(resolveLayoutLength(value, 100)).toBe(60);
	expect(resolveLayoutLength(value, 20)).toBe(0);
	expect(resolveLayoutLength(value, 20, true)).toBe(-20);
});

it("preserves comparison branches until the percentage basis is known", () => {
	const value = computed("clamp(1rem, min(80%, 300px), max(50%, 2rem))");
	expect(resolveLayoutLength(value, 200)).toBe(100);
	expect(resolveLayoutLength(value, 40)).toBe(32);
	expect(resolveLayoutLength(value, 10)).toBe(20);
});

it("does not clamp nested negatives before finishing the top-level expression", () => {
	expect(
		resolveLayoutLength(computed("calc(min(-100%, -10px) * -1)"), 20),
	).toBe(20);
	expect(computed("calc(2px - 5px)", true)).toBe("-3px");
	expect(() => resolveLayoutLength("-3px", 100)).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("retains percentage dependence even when terms cancel or multiply by zero", () => {
	for (const value of [
		"calc(0% + 20px)",
		"calc((100% - 100%) + 20px)",
		"calc(0 * 100% + 20px)",
	]) {
		const style = { ...initialBoxStyle, height: computed(value) };
		expect(resolveHeightConstraints(style, 200, null).preferred).toBeNull();
		expect(resolveHeightConstraints(style, 200, 100).preferred).toBe(20);
	}
});

it("preserves operator precedence through computed serialization", () => {
	for (const [source, expected] of [
		["calc(100% - (20px - 10px))", 90],
		["calc((100% - 10px) / 3)", 30],
		["calc(10px / (2 / 3) + 50%)", 65],
		["calc(2 * (50% + 3px))", 106],
	] as const)
		expect(resolveLayoutLength(computed(source), 100)).toBe(expected);
});

it("only asks for the font bases actually used within an expression", () => {
	expect(lengthUsesFont("calc(10% - 2rem)", "em")).toBe(false);
	expect(lengthUsesFont("calc(10% - 2rem)", "rem")).toBe(true);
	expect(lengthUsesFont("max(2em, 10%)", "em")).toBe(true);
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
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
});

it("bounds syntax depth, node count, source length and comparison arity", () => {
	const nested = (depth: number) =>
		`${"calc(".repeat(depth)}1px${")".repeat(depth)}`;
	expect(normalizeLengthMath(nested(32))).toBeDefined();
	expect(normalizeLengthMath(nested(33))).toBeUndefined();
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

it("preserves a long left-associative computation without adding excessive depth", () => {
	const value = `calc(100%${" - 1px".repeat(100)})`;
	expect(resolveLayoutLength(computed(value), 200)).toBe(100);
});

it("throws explicit limits for finite-input overflow and used layout magnitude", () => {
	expect(() => computed("calc(1e308px * 10)")).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => resolveLayoutLength("calc(1e20px + 1%)", 100)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => resolveLengthMath("calc(1em + 10%)", 100)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("accepts grouped math shorthands and rejects percentage borders", () => {
	expect(
		parseBoxDeclarations("padding", "calc(1em + 2px) min(10%, 20px)"),
	).toEqual([
		{ property: "padding-top", value: "calc(1em + 2px)" },
		{ property: "padding-right", value: "min(10%, 20px)" },
		{ property: "padding-bottom", value: "calc(1em + 2px)" },
		{ property: "padding-left", value: "min(10%, 20px)" },
	]);
	expect(
		parseBorderShorthand("border", "calc(1px + max(1px, 2px)) solid red"),
	).toHaveLength(12);
	expect(normalizeBorderWidth("calc(0% + 1px)")).toBeUndefined();
	expect(
		parseBoxDeclarations("padding", "calc(1px + 2px) auto"),
	).toBeUndefined();
});

it("uses the same grammar in authored inline declarations", () => {
	const declarations = parseInlineDeclarations(
		"width:calc(100% - 2rem);padding:calc(1px + 2px) max(1px, 2px);border:calc(1px + 2px) solid red",
		100,
	);
	expect(declarations.find((entry) => entry.name === "width")?.value).toBe(
		"calc(100% - 2rem)",
	);
	expect(
		declarations.find((entry) => entry.name === "padding-left")?.value,
	).toBe("max(1px, 2px)");
	expect(
		declarations.find((entry) => entry.name === "border-top-width")?.value,
	).toBe("calc(1px + 2px)");
});

it("flows stylesheet math through computed styles, box sizing and native geometry", () => {
	const { tree, id, box, read } = fixture(
		"#target{box-sizing:border-box;width:calc(100% - 2rem);height:calc(2em + 1rem);padding:calc(.5em + 2px) min(10%, 30px);border:calc(.1em + 1px) solid red}",
	);
	expect(box().width).toBe("calc(100% - 40px)");
	expect(read("width")).toBe("160px");
	expect(read("height")).toBe("44px");
	expect(read("padding-top")).toBe("8px");
	expect(read("padding-left")).toBe("20px");
	expect(read("border-top-width")).toBe("2px");
	expect(documentGeometry(tree).getBoundingClientRect(id())).toMatchObject({
		width: 160,
		height: 44,
	});
});

it("applies min/max widths and auto margins after evaluating percentages", () => {
	const { read } = fixture(
		"#target{width:calc(100% - 10px);max-width:min(70%, 160px);min-width:max(20px, 10%);margin:auto}",
	);
	expect(read("width")).toBe("140px");
	expect(read("margin-left")).toBe("30px");
	expect(read("margin-right")).toBe("30px");
});

it("resolves vertical padding and margin percentages against containing width", () => {
	const { read } = fixture(
		"#target{padding-top:calc(10% + 2px);margin-top:calc(5% - 15px)}",
	);
	expect(read("padding-top")).toBe("22px");
	expect(read("margin-top")).toBe("-5px");
});

it("keeps indefinite percentage heights auto but resolves them in a definite parent", () => {
	const indefinite = fixture(
		"#target{height:calc(50% + 10px);min-height:calc(10% + 1px);max-height:calc(20% + 1px)}",
	);
	expect(indefinite.read("height")).toBe("15px");
	const definite = fixture(
		"#outer{height:200px}#target{height:calc(50% + 10px)}",
	);
	expect(definite.read("height")).toBe("110px");
});

it("resolves replaced dimensions without substituting zero for indefinite heights", () => {
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

it("inherits computed font terms but resolves percentages in the child's containing block", () => {
	const { styles, box, read } = fixture(
		"#outer{width:calc(50% + 1em)}#target{font-size:30px;width:inherit}",
	);
	styles.setViewport(800, 400);
	expect(box().width).toBe("calc(50% + 10px)");
	const parentWidth = 800 / 2 + 10;
	expect(Number.parseFloat(read("width"))).toBeCloseTo(
		parentWidth / 2 + 10,
		10,
	);
});

it("substitutes custom tokens before parsing and invalidates after mutations", () => {
	const { tree, id, read } = fixture(
		"#outer{--gap:2rem}#target{width:calc(100% - var(--gap));padding:var(--pad, calc(1px + 2px))}",
	);
	expect(read("width")).toBe("160px");
	expect(read("padding-top")).toBe("3px");
	tree.setAttribute(id("#outer"), "style", "--gap:3rem;width:300px");
	expect(read("width")).toBe("240px");
	tree.setAttribute(id("html"), "style", "font-size:30px");
	expect(read("width")).toBe("210px");
});

it("does not revive lower declarations when substituted math is invalid at computed time", () => {
	const { box } = fixture(
		"#target{width:12px;--bad:1; width:calc(var(--bad) + 2px)}",
	);
	expect(box().width).toBe("auto");
	expect(fixture("#target{width:12px;width:calc(1 + 2px)}").box().width).toBe(
		"12px",
	);
});

it("invalidates viewport terms while keeping containing-block percentages independent", () => {
	const { styles, read } = fixture(
		"#target{width:calc(50% + 10vw);height:max(10px, 10vh)}",
	);
	styles.setViewport(400, 300);
	expect(read("width")).toBe("140px");
	expect(read("height")).toBe("30px");
	styles.setViewport(200, 100);
	expect(read("width")).toBe("120px");
	expect(read("height")).toBe("10px");
});

it("rasterizes math-sized blocks identically to their explicit used lengths", () => {
	const math = fixture(
		"#target{width:calc(100% - 2rem);height:calc(20px + 1em);padding:calc(2px + 1px);border:calc(1px + 1px) solid red;background:blue}",
	);
	const pixels = fixture(
		"#target{width:160px;height:32px;padding:3px;border:2px solid red;background:blue}",
	);
	for (const entry of [math, pixels]) entry.styles.setViewport(240, 100);
	expect(rasterizeDocument(math.tree).image.pixels).toEqual(
		rasterizeDocument(pixels.tree).image.pixels,
	);
});

it.each(["span", "button"])(
	"shares math edges with native %s geometry and rasterization",
	(tag) => {
		const content = `<${tag} id="target">ab</${tag}>`;
		const math = fixture(
			"#target{padding:calc(1em - 2px);border:calc(1px + 1px) solid red;background:blue}",
			content,
		);
		const pixels = fixture(
			"#target{padding:10px;border:2px solid red;background:blue}",
			content,
		);
		for (const entry of [math, pixels]) entry.styles.setViewport(240, 100);
		expect(
			documentGeometry(math.tree).getBoundingClientRect(math.id()),
		).toEqual(documentGeometry(pixels.tree).getBoundingClientRect(pixels.id()));
		expect(rasterizeDocument(math.tree).image.pixels).toEqual(
			rasterizeDocument(pixels.tree).image.pixels,
		);
	},
);

it("preserves zero font metrics and physical units inside calculations", () => {
	expect(
		computeBoxStyle(
			{ width: "calc(2em + 1rem)" },
			initialBoxStyle,
			{ width: 200, height: 100 },
			{ fontSize: 0, rootFontSize: 0 },
		).width,
	).toBe("0px");
	expect(
		Number.parseFloat(computed("calc(2.54cm + 25.4mm + 101.6q)")),
	).toBeCloseTo(288, 10);
});

it("preserves maximum supported nested comparison depth through computation", () => {
	const source = `${"min(".repeat(32)}100%${")".repeat(32)}`;
	expect(normalizeLengthMath(source)).toBeDefined();
	expect(resolveLayoutLength(computed(source), 75)).toBe(75);
});

it("reports the finite box-math profile rather than full CSS math conformance", async () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("Capabilities must not create a session");
		},
	});
	try {
		const result = await host.execute(["capabilities"]);
		expect(result.data).toMatchObject({
			cssBox: {
				math: {
					status: "partial",
					functions: ["calc", "min", "max", "clamp"],
					dimensionalProducts: false,
					nonFiniteValues: false,
					standardSerialization: false,
				},
				mathLimits: cssMathLimits,
			},
		});
	} finally {
		host.close();
	}
});
