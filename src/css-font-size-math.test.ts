import { afterEach, expect, it } from "vitest";
import { cssMathLimits } from "./css-math.js";
import {
	type TextStyle,
	computeTextStyle,
	initialTextStyle,
	parseTextValue,
} from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { nativeFontXHeight } from "./font-metrics.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutValueLimits } from "./layout-values.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const querySets: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of querySets.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	css = "",
	markup = '<main id="parent"><span id="target">Text</span></main>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style>${markup}`,
		"https://fixture.invalid/font-size-math",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	querySets.push(queries);
	const styles = documentStyles(tree);
	styles.setViewport(400, 200);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		text: (selector = "#target") => styles.text(id(selector)),
	};
}

function parentStyle(size: number): TextStyle {
	return Object.freeze({ ...initialTextStyle, "font-size": `${size}px` });
}

function compute(
	value: string,
	parent: TextStyle = parentStyle(20),
	rootFontSize: number = 24,
) {
	const parsed = parseTextValue("font-size", value);
	expect(parsed).toBeDefined();
	if (parsed === undefined) throw new Error(`Unsupported font size ${value}`);
	return computeTextStyle(
		{ "font-size": parsed },
		parent,
		{ width: 400, height: 200 },
		rootFontSize,
	);
}

it.each([
	["calc(2px + 3px * 4)", 14],
	["calc((2px + 3px) * 4)", 20],
	["calc(24px / (2 / 3))", 36],
	["calc(2 * (1em + 5px) / 5)", 10],
	["calc(max(2, 3) * 4px)", 12],
	["calc(1e2px + .5px)", 100.5],
	["calc(150%)", 30],
	["calc(1.5em + 25%)", 35],
	["calc(2rem + 1em)", 68],
	["calc(2vw + 1vh + 1vmin + 1vmax)", 16],
	["calc(1in + 1pc + 3pt)", 116],
	["calc(2.54cm + 25.4mm + 101.6q)", 288],
	["min(150%, 2em, 35px)", 30],
	["max(150%, 2em, 35px)", 40],
	["clamp(10px, calc(50% + 1em), 40px)", 30],
	["clamp(40px, 10px, 20px)", 40],
	["calc(min(-5px, -10px) * -1)", 10],
	["calc(10px - 30px)", 0],
	["min(-1em, -10px)", 0],
	["max(-1em, -10px)", 0],
	["clamp(-30px, -20px, -10px)", 0],
	["calc(0px * 2)", 0],
])("computes bounded font-size math %s to %s pixels", (value, expected) => {
	expect(parseTextValue("font-size", value)).toBe(value);
	const result = compute(value);
	expect(result["font-size"]).toMatch(/^\d+(?:\.\d+)?px$/);
	expect(Number.parseFloat(result["font-size"])).toBeCloseTo(expected, 10);
	expect(Object.isFrozen(result)).toBe(true);
});

it("normalizes font-size math whitespace and case", () => {
	expect(parseTextValue("font-size", "  CALC(1EM + 2PX)  ")).toBe(
		"calc(1em + 2px)",
	);
	expect(compute("  CALC(1EM + 2PX)  ")["font-size"]).toBe("22px");
});

it.each([
	"calc(2)",
	"calc(0)",
	"min(1, 2)",
	"calc(0 + 2px)",
	"calc(2px * 3px)",
	"calc(2px / 1px)",
	"calc(1px / 0)",
	"calc(1px / (2 - 2))",
	"calc(1px * 1e999)",
	"calc(1ch + 2px)",
	"calc(sin(1) * 2px)",
	"calc(1px+ 2px)",
	"calc(1px +2px)",
	"calc(1px-2px)",
	"calc()",
	"calc(1px, 2px)",
	"min(1px,)",
	"clamp(1px, 2px)",
	"calc(1px + 2px",
	"calc(1px) trailing",
])(
	"rejects invalid font-size math without replacing a valid declaration: %s",
	(value) => {
		expect(parseTextValue("font-size", value)).toBeUndefined();
		const { text } = fixture(
			`#parent{font-size:20px}#target{font-size:18px;font-size:${value}}`,
		);
		expect(text()["font-size"]).toBe("18px");
	},
);

it.each([
	"calc(1em + 2px)",
	"min(1em, 20px)",
	"max(1em, 20px)",
	"clamp(10px, 1em, 20px)",
])("does not expand line-height math support for %s", (value) => {
	expect(parseTextValue("line-height", value)).toBeUndefined();
	const { text } = fixture(
		`#target{font-size:calc(1em + 4px);line-height:1.5;line-height:${value}}`,
	);
	expect(text()).toMatchObject({ "font-size": "20px", "line-height": "1.5" });
});

it.each([
	[320, "26.8px"],
	[800, "34px"],
	[1200, "40px"],
	[1600, "46px"],
])(
	"resolves Bootstrap responsive font size at viewport width %s",
	(width, expected) => {
		const { styles, text } = fixture(
			"#target{font-size:calc(1.375rem + 1.5vw)}",
		);
		styles.setViewport(width, 600);
		expect(text()["font-size"]).toBe(expected);
	},
);

it.each([
	[200, "24px"],
	[800, "32px"],
	[1600, "40px"],
])(
	"applies responsive clamp bounds at viewport width %s",
	(width, expected) => {
		const { styles, text } = fixture(
			"#target{font-size:clamp(1.5rem, 4vw, 2.5rem)}",
		);
		styles.setViewport(width, 600);
		expect(text()["font-size"]).toBe(expected);
	},
);

it("bounds source code units before normalization", () => {
	const prefix = "calc(";
	const suffix = "1px)";
	const padding = " ".repeat(
		cssMathLimits.maxSourceCodeUnits - prefix.length - suffix.length,
	);
	const value = `${prefix}${padding}${suffix}`;
	expect(compute(value)["font-size"]).toBe("1px");
	expect(parseTextValue("font-size", ` ${value}`)).toBeUndefined();
});

it("bounds math nesting depth", () => {
	const nested = (depth: number) =>
		`${"calc(".repeat(depth)}1px${")".repeat(depth)}`;
	expect(compute(nested(cssMathLimits.maxDepth))["font-size"]).toBe("1px");
	expect(
		parseTextValue("font-size", nested(cssMathLimits.maxDepth + 1)),
	).toBeUndefined();
});

it("bounds math nodes independently of source length and depth", () => {
	const sum = (count: number) =>
		`calc(${Array(count).fill("1px").join(" + ")})`;
	const count = Math.floor(cssMathLimits.maxNodes / 2);
	expect(compute(sum(count))["font-size"]).toBe(`${count}px`);
	expect(parseTextValue("font-size", sum(count + 1))).toBeUndefined();
});

it("bounds comparison-function arguments", () => {
	const minimum = (count: number) =>
		`min(${Array(count).fill("1px").join(", ")})`;
	expect(compute(minimum(cssMathLimits.maxArguments))["font-size"]).toBe("1px");
	expect(
		parseTextValue("font-size", minimum(cssMathLimits.maxArguments + 1)),
	).toBeUndefined();
});

it.each([
	"calc(1e308px * 10)",
	`calc(${layoutValueLimits.maxAbsoluteLength}px + 1px)`,
	`calc(${layoutValueLimits.maxAbsoluteLength}px + 100%)`,
])("rejects computed overflow or excessive font size: %s", (value) => {
	expect(parseTextValue("font-size", value)).toBe(value);
	expect(() => compute(value)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("accepts the exact maximum layout font size", () => {
	expect(
		compute(`calc(${layoutValueLimits.maxAbsoluteLength}px)`)["font-size"],
	).toBe(`${layoutValueLimits.maxAbsoluteLength}px`);
});

it("resolves ex math using inherited native font metrics, not child metrics", () => {
	const { text } = fixture(
		'#parent{font-size:20px;font-family:monospace;font-weight:700}#target{font-family:"agent mono";font-weight:100;font-size:calc(2ex + 25%)}',
	);
	const parent = text("#parent");
	const expected =
		2 *
			nativeFontXHeight(
				20,
				Number(parent["font-weight"]),
				parent["font-family"],
			) +
		5;
	expect(text()["font-size"]).toBe(`${expected}px`);
});

it("uses the initial native font metrics for root ex math", () => {
	const { text } = fixture(
		"html{font-family:monospace;font-weight:900;font-size:calc(2ex + 1px)}",
	);
	const expected =
		2 *
			nativeFontXHeight(
				16,
				Number(initialTextStyle["font-weight"]),
				initialTextStyle["font-family"],
			) +
		1;
	expect(text("html")["font-size"]).toBe(`${expected}px`);
	expect(text()["font-size"]).toBe(`${expected}px`);
});

it("keeps zero inherited and root font bases, including native ex metrics", () => {
	const expected = nativeFontXHeight(0) + 3;
	expect(
		compute("calc(1em + 1rem + 1ex + 100% + 3px)", parentStyle(0), 0)[
			"font-size"
		],
	).toBe(`${expected}px`);
});

it("uses initial root-relative bases and the computed root for descendants", () => {
	const { text } = fixture(
		"html{font-size:calc(1rem + 50% + .5em)}#parent{font-size:calc(150% + 1px)}#target{font-size:calc(1rem + 1em)}",
	);
	expect(text("html")["font-size"]).toBe("32px");
	expect(text("#parent")["font-size"]).toBe("49px");
	expect(text()["font-size"]).toBe("81px");
});

it("inherits computed pixels through descendants and text nodes", () => {
	const { tree, styles, id, text } = fixture(
		"#parent{font-size:calc(150% + 1em)}",
		'<main id="parent"><span id="target"><b id="child">Text</b></span></main>',
	);
	expect(text("#parent")["font-size"]).toBe("40px");
	for (const selector of ["#target", "#child"])
		expect(text(selector)["font-size"]).toBe("40px");
	expect(styles.text(tree.get(id("#child")).children[0])["font-size"]).toBe(
		"40px",
	);
	const inherited = text();
	for (const keyword of ["inherit", "unset", "revert"])
		expect(compute(keyword, inherited)["font-size"]).toBe("40px");
	expect(compute("initial", inherited)["font-size"]).toBe("16px");
	expect(computeTextStyle({}, inherited, { width: 800, height: 600 }, 24)).toBe(
		inherited,
	);
});

it("uses completed font math for em boxes and ordinary line heights", () => {
	const { styles, id, text } = fixture(
		"#parent{font-size:20px}#target{font-size:calc(125% + 5px);width:2em;line-height:1.5em}",
	);
	expect(text()).toMatchObject({ "font-size": "30px", "line-height": "45px" });
	expect(styles.box(id()).width).toBe("60px");
});

it("preserves stylesheet specificity and important inline font math", () => {
	const { tree, id, text } = fixture(
		"span{font-size:calc(1em + 1px)}#target{font-size:calc(1em + 2px)!important}",
	);
	tree.setAttribute(id(), "style", "font-size:calc(1em + 3px)");
	expect(text()["font-size"]).toBe("18px");
	tree.setAttribute(id(), "style", "font-size:calc(1em + 4px)!important");
	expect(text()["font-size"]).toBe("20px");
});

it("substitutes inherited variables and fallback math before font computation", () => {
	const { tree, id, text } = fixture(
		"#parent{font-size:20px;--scale:1.5;--extra:2px}#target{font-size:calc(var(--scale) * 1em + var(--extra))}",
	);
	expect(text()["font-size"]).toBe("32px");
	tree.setAttribute(id("#parent"), "style", "--scale:2;--extra:4px");
	expect(text()["font-size"]).toBe("44px");
	tree.setAttribute(
		id(),
		"style",
		"font-size:var(--missing, clamp(10px, 150%, 50px))",
	);
	expect(text()["font-size"]).toBe("30px");
	tree.setAttribute(id(), "style", "--bad:2; font-size:calc(var(--bad))");
	expect(text()["font-size"]).toBe("20px");
});

it("invalidates font and em box caches after parent, root and inline mutations", () => {
	const { tree, styles, id, text } = fixture(
		"html{font-size:24px}#parent{font-size:20px}#target{font-size:calc(1rem + 50%);width:2em}",
	);
	const check = (expected: number) => {
		expect(text()["font-size"]).toBe(`${expected}px`);
		expect(styles.box(id()).width).toBe(`${expected * 2}px`);
	};
	check(34);
	tree.setAttribute(id("#parent"), "style", "font-size:40px");
	check(44);
	tree.setAttribute(id("html"), "style", "font-size:30px");
	check(50);
	tree.setAttribute(id(), "style", "font-size:calc(1em + 1px)");
	check(41);
});

it("recomputes inherited percentage and em bases after reparenting", () => {
	const { tree, styles, id, text } = fixture(
		"html{font-size:24px}#left{font-size:10px}#right{font-size:30px}#target{font-size:calc(50% + 1em + 1rem);width:2em}",
		'<main id="left"><span id="target">Text</span></main><main id="right"></main>',
	);
	expect(text()["font-size"]).toBe("39px");
	expect(styles.box(id()).width).toBe("78px");
	tree.append(id("#right"), id());
	expect(text()["font-size"]).toBe("69px");
	expect(styles.box(id()).width).toBe("138px");
});

it("invalidates all viewport unit bases and dependent em widths", () => {
	const { styles, id, text } = fixture(
		"#target{font-size:calc(1vw + 2vh + 3vmin + 4vmax);width:2em}",
	);
	expect(text()["font-size"]).toBe("30px");
	expect(styles.box(id()).width).toBe("60px");
	styles.setViewport(200, 600);
	expect(text()["font-size"]).toBe("44px");
	expect(styles.box(id()).width).toBe("88px");
});

it("invalidates math after stylesheet edits and media-selected root changes", () => {
	const { tree, styles, id, text } = fixture(
		"html{font-size:20px}@media(min-width:500px){html{font-size:30px}}#target{font-size:calc(1rem + 1vw)}",
	);
	expect(text()["font-size"]).toBe("24px");
	styles.setViewport(800, 200);
	expect(text()["font-size"]).toBe("38px");
	tree.setTextContent(
		id("style"),
		"html{font-size:24px}#target{font-size:calc(1rem + 2vw)}",
	);
	expect(text()["font-size"]).toBe("40px");
});
