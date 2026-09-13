import { afterEach, expect, it, vi } from "vitest";
import { cssMathLimits } from "./css-math.js";
import { cssSupportsDeclaration } from "./css-parser.js";
import {
	computeTextStyle,
	initialTextStyle,
	parseTextValue,
} from "./css-text.js";
import type { DocumentTree } from "./document.js";
import * as fontMetrics from "./font-metrics.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutValueLimits } from "./layout-values.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import {
	computeTextIndent,
	parseTextIndent,
	resolveTextIndent,
} from "./text-indent.js";

const viewport = { width: 800, height: 600 };
const documents: DocumentTree[] = [];
const queriesToClose: DocumentQueries[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const queries of queriesToClose.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><main id="parent"><span id="target">Text</span></main>`,
		"https://fixture.invalid/ex-text",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queriesToClose.push(queries);
	const styles = documentStyles(tree);
	styles.setViewport(viewport.width, viewport.height);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		text: (selector = "#target") => styles.text(id(selector)),
	};
}

it("accepts scalar ex for font size, line height and text indentation", () => {
	for (const property of ["font-size", "line-height", "text-indent"] as const)
		for (const [value, expected] of [
			["1ex", "1ex"],
			["+.5ex", "0.5ex"],
			["1e-2ex", "0.01ex"],
			["-0ex", "0ex"],
		]) {
			expect(parseTextValue(property, value)).toBe(expected);
			expect(cssSupportsDeclaration(property, value)).toBe(true);
		}
	expect(parseTextIndent("EACH-LINE -1.5EX HANGING")).toBe(
		"-1.5ex hanging each-line",
	);
});

it("rejects malformed ex and negative font sizes or line heights", () => {
	for (const property of ["font-size", "line-height"] as const)
		for (const value of ["-1ex", "1rex", "1 ex", "ex", "1e999ex", "NaNex"])
			expect(parseTextValue(property, value)).toBeUndefined();
	for (const value of ["1rex", "1 ex", "ex", "1e999ex", "NaNex", "1ex extra"])
		expect(parseTextIndent(value)).toBeUndefined();
});

it("computes ex font-size math while keeping line-height math unsupported", () => {
	const xHeight = fontMetrics.nativeFontXHeight(
		16,
		Number(initialTextStyle["font-weight"]),
		initialTextStyle["font-family"],
	);
	for (const [value, expected] of [
		["calc(1ex + 2px)", xHeight + 2],
		["min(1ex, 2px)", Math.min(xHeight, 2)],
		["max(1ex, 2px)", Math.max(xHeight, 2)],
		["clamp(1px, 1ex, 20px)", Math.max(1, Math.min(xHeight, 20))],
	] as const) {
		expect(parseTextValue("font-size", value)).toBe(value);
		expect(cssSupportsDeclaration("font-size", value)).toBe(true);
		expect(
			computeTextStyle({ "font-size": value }, initialTextStyle, viewport, 16)[
				"font-size"
			],
		).toBe(`${expected}px`);
		expect(parseTextValue("line-height", value)).toBeUndefined();
		expect(cssSupportsDeclaration("line-height", value)).toBe(false);
		expect(
			computeTextStyle(
				{ "line-height": value },
				initialTextStyle,
				viewport,
				16,
			)["line-height"],
		).toBe(value);
	}
});

it("preserves fractional and zero native x-heights at text use sites", () => {
	for (const [size, xHeight] of [
		[0, 0],
		[1, 0.625],
		[12.5, 7.8125],
	]) {
		const parent = { ...initialTextStyle, "font-size": `${size}px` };
		const child = computeTextStyle(
			{ "font-size": "1ex", "line-height": "2ex", "text-indent": "-1ex" },
			parent,
			viewport,
			64,
		);
		expect(child["font-size"]).toBe(`${xHeight}px`);
		expect(child["line-height"]).toBe(`${xHeight * 1.25}px`);
		expect(child["text-indent"]).toBe(`${-xHeight * 0.625}px`);
	}
});

it("resolves ex font size against the parent rather than root or own size", () => {
	const { text } = fixture(
		"html{font-size:64px} #parent{font-size:20px} #target{font-size:2ex}",
	);
	expect(text()["font-size"]).toBe("25px");
	expect(text("#parent")["font-size"]).toBe("20px");
	expect(text("html")["font-size"]).toBe("64px");
});

it("uses initial metrics for root ex font size and own metrics for root text", () => {
	const { text } = fixture(
		"html{font-size:2ex;line-height:2ex;text-indent:1ex;font-weight:700}",
	);
	expect(text("html")).toMatchObject({
		"font-size": "20px",
		"line-height": "25px",
		"text-indent": "12.5px",
	});
	expect(text()["line-height"]).toBe("25px");
	expect(text()["text-indent"]).toBe("12.5px");
});

it("uses the initial font weight for root font-affecting ex", () => {
	const metric = vi.spyOn(fontMetrics, "nativeFontXHeight");
	const root = computeTextStyle(
		{ "font-size": "2ex", "font-weight": "900" },
		{ ...initialTextStyle, "font-size": "40px", "font-weight": "700" },
		viewport,
		16,
		false,
		true,
	);
	expect(root["font-size"]).toBe("20px");
	expect(metric).toHaveBeenCalledExactlyOnceWith(16, 400, '"agent mono"');
});

it("preserves root rem and relative-size keyword behavior beside ex", () => {
	const { text } = fixture(
		"html{font-size:2rem;line-height:2rem} #parent{font-size:larger} #target{font-size:smaller;text-indent:1ex}",
	);
	expect(text("html")["font-size"]).toBe("32px");
	expect(text("html")["line-height"]).toBe("64px");
	expect(text("#parent")["font-size"]).toBe("38.4px");
	expect(text()["font-size"]).toBe("32px");
	expect(text()["text-indent"]).toBe("20px");
	const rooted = fixture("html{font-size:2ex;line-height:2rem}").text;
	expect(rooted("html")["line-height"]).toBe("40px");
});

it("inherits computed ex font sizes without resolving them again", () => {
	const parent = computeTextStyle(
		{ "font-size": "2ex" },
		initialTextStyle,
		viewport,
		16,
	);
	for (const keyword of [undefined, "inherit", "unset", "revert"])
		expect(
			computeTextStyle({ "font-size": keyword }, parent, viewport, 64),
		).toBe(parent);
});

it("inherits computed ex line height and indentation at a different child size", () => {
	const parent = computeTextStyle(
		{ "font-size": "20px", "line-height": "2ex", "text-indent": "1ex" },
		initialTextStyle,
		viewport,
		16,
	);
	const metric = vi.spyOn(fontMetrics, "nativeFontXHeight");
	for (const keyword of [undefined, "inherit", "unset", "revert"]) {
		const child = computeTextStyle(
			{
				"font-size": "40px",
				"line-height": keyword,
				"text-indent": keyword,
			},
			parent,
			viewport,
			64,
		);
		expect(child["line-height"]).toBe("25px");
		expect(child["text-indent"]).toBe("12.5px");
	}
	expect(metric).not.toHaveBeenCalled();
});

it("distinguishes inherited unitless line height from computed ex length", () => {
	const { tree, id, text } = fixture(
		"#parent{font-size:20px;line-height:1.5} #target{font-size:40px}",
	);
	expect(text()["line-height"]).toBe("1.5");
	tree.setAttribute(id("#parent"), "style", "line-height:2ex");
	expect(text()["line-height"]).toBe("25px");
	tree.setAttribute(id(), "style", "line-height:2ex");
	expect(text()["line-height"]).toBe("50px");
});

it("passes parent versus own computed weights to the shared metric matcher", () => {
	const metric = vi.spyOn(fontMetrics, "nativeFontXHeight");
	const child = computeTextStyle(
		{
			"font-size": "2ex",
			"font-weight": "1000",
			"line-height": "2ex",
			"text-indent": "1ex",
		},
		{ ...initialTextStyle, "font-size": "20px", "font-weight": "501" },
		viewport,
		64,
	);
	expect(child).toMatchObject({
		"font-size": "25px",
		"line-height": "31.25px",
		"text-indent": "15.625px",
	});
	expect(metric.mock.calls).toEqual([
		[20, 501, '"agent mono"'],
		[25, 1000, '"agent mono"'],
		[25, 1000, '"agent mono"'],
	]);
});

it("does not request font metrics for text declarations without ex", () => {
	const metric = vi.spyOn(fontMetrics, "nativeFontXHeight");
	const text = computeTextStyle(
		{
			"font-size": "2em",
			"line-height": "1.5rem",
			"text-indent": "calc(1em + 2rem)",
		},
		initialTextStyle,
		viewport,
		16,
	);
	expect(text["text-indent"]).toBe("64px");
	expect(metric).not.toHaveBeenCalled();
});

it("uses only the supplied x-height for signed scalar indentation", () => {
	expect(computeTextIndent("2ex", 40, 64, viewport, 3.125)).toBe("6.25px");
	expect(
		computeTextIndent("-2ex hanging each-line", 40, 64, viewport, 3.125),
	).toBe("-6.25px hanging each-line");
	expect(computeTextIndent("100ex", 40, 64, viewport, 0)).toBe("0px");
	expect(computeTextIndent("-0ex", 40, 64, viewport, 3.125)).toBe("0px");
	expect(computeTextIndent("2em", 40, 64, viewport, 3.125)).toBe("80px");
	expect(computeTextIndent("2rem", 40, 64, viewport, 3.125)).toBe("128px");
});

it("resolves ex leaves in calc, min, max and clamp indentation", () => {
	for (const [value, expected] of [
		["calc(2ex + 1px)", "16.625px"],
		["calc(-2ex / 2)", "-7.8125px"],
		["min(2ex, 20px)", "15.625px"],
		["max(2ex, 20px)", "20px"],
		["clamp(1ex, 2ex, 3ex)", "15.625px"],
		["clamp(3ex, 2ex, 1ex)", "23.4375px"],
		["calc(1em + 1rem + 2ex)", "79.625px"],
	])
		expect(computeTextIndent(value, 24, 40, viewport, 7.8125)).toBe(expected);
	expect(computeTextIndent("calc(1ex + 2px)", 24, 40, viewport, 0)).toBe("2px");
});

it("retains percentages while inheriting already computed ex math leaves", () => {
	const { text } = fixture(
		"#parent{font-size:20px;text-indent:calc(2ex + 10%) hanging each-line} #target{font-size:40px}",
	);
	expect(text()["text-indent"]).toBe("calc(25px + 10%) hanging each-line");
	expect(resolveTextIndent(text()["text-indent"], 200)).toEqual({
		size: 45,
		hanging: true,
		eachLine: true,
	});
	for (const [value, expected] of [
		["min(2ex, 10%)", 20],
		["max(2ex, 10%)", 25],
		["clamp(1ex, 10%, 2ex)", 20],
	] as const) {
		const computed = computeTextIndent(value, 20, 64, viewport, 12.5);
		expect(computed).not.toContain("ex");
		expect(resolveTextIndent(computed, 200).size).toBe(expected);
	}
});

it("resolves inherited custom-property ex tokens in their text use-site context", () => {
	const { tree, id, text } = fixture(
		"#parent{font-size:20px;--size:2ex;--indent:calc(1ex + 10%);text-indent:var(--indent)} #target{font-size:var(--size);line-height:var(--size);text-indent:var(--indent)}",
	);
	expect(text("#parent")["text-indent"]).toBe("calc(12.5px + 10%)");
	expect(text()).toMatchObject({
		"font-size": "25px",
		"line-height": "31.25px",
		"text-indent": "calc(15.625px + 10%)",
	});
	tree.setAttribute(id(), "style", "text-indent:var(--missing, -1ex)");
	expect(text()["text-indent"]).toBe("-15.625px");
});

it("requires an explicit ex basis even for zero or cancelling math", () => {
	for (const value of [
		"1ex",
		"0ex",
		"calc(1ex - 1ex)",
		"min(0px, 1ex)",
		"max(0px, 1ex)",
		"clamp(0px, 1ex, 2px)",
		"calc(1ex + 10%)",
	])
		expect(() => computeTextIndent(value, 16, 16, viewport)).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
	expect(computeTextIndent("1em", 16, 16, viewport)).toBe("16px");
});

it("validates a supplied x-height even when indentation does not use ex", () => {
	for (const basis of [
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		null,
		"10",
	])
		for (const value of ["1ex", "0px", "calc(1px + 10%)"])
			expect(() =>
				computeTextIndent(value, 16, 16, viewport, basis as number),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		computeTextIndent(
			"1ex",
			16,
			16,
			viewport,
			layoutValueLimits.maxAbsoluteLength + 1,
		),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("bounds ex results without rounding away fractions or negative indentation", () => {
	const maximum = layoutValueLimits.maxAbsoluteLength;
	for (const sign of [1, -1]) {
		expect(computeTextIndent(`${sign}ex`, 16, 16, viewport, maximum)).toBe(
			`${sign * maximum}px`,
		);
		for (const value of [`${sign * 2}ex`, `calc(${sign}ex * 2)`])
			expect(() =>
				computeTextIndent(value, 16, 16, viewport, maximum),
			).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	}
	expect(() =>
		computeTextIndent("calc(1e308ex * 2)", 16, 16, viewport, 10),
	).toThrow("overflow");
	for (const property of ["font-size", "line-height"] as const)
		expect(() =>
			computeTextStyle(
				{ [property]: `${maximum}ex` },
				initialTextStyle,
				viewport,
				16,
			),
		).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("rejects malformed ex math, excess source and uncomputed resolver inputs", () => {
	for (const value of [
		"calc(1ex + 1)",
		"calc(1ex+2px)",
		"calc(1ex * 1ex)",
		"calc(1ex / 0)",
		"calc(1rex + 1px)",
		"clamp(1ex, 2ex)",
		`min(${Array(cssMathLimits.maxArguments + 1)
			.fill("1ex")
			.join(", ")})`,
		`calc(${" ".repeat(cssMathLimits.maxSourceCodeUnits)}1ex)`,
	])
		expect(parseTextIndent(value)).toBeUndefined();
	for (const value of ["1ex", "calc(1ex + 10%)"])
		expect(() => resolveTextIndent(value, 100)).toThrow();
	expect(() =>
		computeTextIndent(
			`calc(${" ".repeat(cssMathLimits.maxComputedCodeUnits + " hanging each-line".length)}1ex)`,
			16,
			16,
			viewport,
			10,
		),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("recomputes text metrics after parent and own font mutations", () => {
	const { tree, id, text } = fixture(
		"#parent{font-size:20px} #target{font-size:2ex;line-height:2ex;text-indent:1ex}",
	);
	expect(text()["font-size"]).toBe("25px");
	tree.setAttribute(id("#parent"), "style", "font-size:32px;font-weight:501");
	expect(text()).toMatchObject({
		"font-size": "40px",
		"font-weight": "501",
		"line-height": "50px",
		"text-indent": "25px",
	});
	tree.setAttribute(id(), "style", "font-size:12.5px;font-weight:1000");
	expect(text()).toMatchObject({
		"font-size": "12.5px",
		"font-weight": "1000",
		"line-height": "15.625px",
		"text-indent": "7.8125px",
	});
	tree.setAttribute(id(), "style", "font-size:0px");
	expect(text()["line-height"]).toBe("0px");
	expect(text()["text-indent"]).toBe("0px");
});

it("invalidates cached ex text when stylesheet metrics and variables change", () => {
	const { tree, id, text } = fixture(
		"#parent{font-size:20px;--indent:1ex} #target{text-indent:var(--indent);line-height:2ex}",
	);
	expect(text()["text-indent"]).toBe("12.5px");
	tree.setTextContent(
		id("style"),
		"#parent{font-size:32px;--indent:2ex} #target{text-indent:var(--indent);line-height:1ex}",
	);
	expect(text()["text-indent"]).toBe("40px");
	expect(text()["line-height"]).toBe("20px");
});
