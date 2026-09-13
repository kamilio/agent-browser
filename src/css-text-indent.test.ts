import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import {
	inlineProperties,
	parseInlineDeclarations,
} from "./css-declarations.js";
import { cssMathLimits } from "./css-math.js";
import {
	cssSupportsCondition,
	cssSupportsDeclaration,
	parseCssDeclarations,
} from "./css-parser.js";
import {
	computeTextStyle,
	cssTextProperties,
	initialTextStyle,
	parseTextValue,
} from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import { layoutValueLimits } from "./layout-values.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import {
	computeTextIndent,
	parseTextIndent,
	resolveTextIndent,
} from "./text-indent.js";

interface Style {
	[index: number]: string | undefined;
	readonly length: number;
	cssText: string;
	textIndent: string;
	"text-indent": string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
	item(index: number): string;
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value });
		const indexed = definition.indexed;
		if (!indexed) return target;
		Object.defineProperty(target, "length", { get: indexed.length });
		return new Proxy(target, {
			get(object, key) {
				if (typeof key === "string" && /^(0|[1-9]\d*)$/.test(key))
					return Number(key) < indexed.length()
						? indexed.get(Number(key))
						: undefined;
				return Reflect.get(object, key);
			},
		});
	},
};
const documents: DocumentTree[] = [];
const queriesToClose: DocumentQueries[] = [];
const viewport = { width: 800, height: 600 };

afterEach(() => {
	for (const queries of queriesToClose.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><main id="parent"><span id="target">Text</span></main>`,
		"https://fixture.invalid/text-indent-css",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queriesToClose.push(queries);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(viewport.width, viewport.height);
	const inlineStyles = new InlineStyles(tree, factory);
	const computedStyles = new ComputedStyles(tree, factory);
	return {
		tree,
		id,
		styles,
		inlineStyles,
		computedStyles,
		inline: inlineStyles.get(id()) as Style,
		computed: computedStyles.get(id()) as Style,
		text: (selector = "#target") => styles.text(id(selector)),
	};
}

function declarations(source: string) {
	const issues: string[] = [];
	const parsed = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 32, maxDeclarations: 256 },
		(issue) => issues.push(issue),
	);
	return { parsed, issues };
}

it.each([
	["0", "0px"],
	["-0", "0px"],
	["+0.0", "0px"],
	["-12px", "-12px"],
	["+.5em", "0.5em"],
	["-1e2%", "-100%"],
	["each-line 2px hanging", "2px hanging each-line"],
	["hanging each-line 2px", "2px hanging each-line"],
	["hanging 2px each-line", "2px hanging each-line"],
	["each-line hanging 2px", "2px hanging each-line"],
	["2px each-line hanging", "2px hanging each-line"],
	["2px hanging each-line", "2px hanging each-line"],
	["hanging -2rem", "-2rem hanging"],
	["each-line 20%", "20% each-line"],
	["\tHANGING\n2PX\fEACH-LINE\r", "2px hanging each-line"],
	["hanging calc(1em - 20%)", "calc(1em - 20%) hanging"],
	["min(-1px, 20%) each-line", "min(-1px, 20%) each-line"],
	["CLAMP(-2PX, 10%, 3EM)", "clamp(-2px, 10%, 3em)"],
])(
	"normalizes text-indent %s through declarations and supports",
	(value, expected) => {
		expect(parseTextIndent(value)).toBe(expected);
		expect(parseTextValue("text-indent", value)).toBe(expected);
		expect(declarations(`text-indent:${value}`)).toEqual({
			parsed: [{ property: "text-indent", value: expected, important: false }],
			issues: [],
		});
		expect(
			parseInlineDeclarations(`text-indent:${value}`, 10).map(
				({ name, value: specified }) => [name, specified],
			),
		).toEqual([["text-indent", expected]]);
		expect(cssSupportsDeclaration("text-indent", value)).toBe(true);
		expect(cssSupportsCondition(`(text-indent:${value})`)).toBe(true);
	},
);

it.each([
	"",
	" ",
	"1",
	"-1",
	"auto",
	"normal",
	"hanging",
	"each-line",
	"hanging each-line",
	"1px 2px",
	"1px hanging hanging",
	"each-line 1px each-line",
	"1px hanging each-line extra",
	"1px initial",
	"inherit hanging",
	"1px, hanging",
	"1pxhanging",
	"1px;",
	"1ch",
	"1rex",
	"1dvw",
	"1e999px",
	"-1e999%",
	"NaNpx",
	"calc(0)",
	"calc(1px + 1)",
	"calc(1px+2px)",
	"calc(1px * 2px)",
	"calc(1px / 1px)",
	"calc(1px / 0)",
	"calc(1px / (2 - 2))",
	"calc(infinity * 1px)",
	"min(1px, 2)",
	"clamp(1px, 2px)",
	"calc(1px",
	"calc(1px))",
	"var(--indent)",
])("rejects invalid non-wide helper input %s", (value) => {
	expect(parseTextIndent(value)).toBeUndefined();
	expect(() => computeTextIndent(value, 20, 32, viewport)).toThrow();
});

it.each([
	["px", 1],
	["em", 20],
	["rem", 32],
	["cm", 96 / 2.54],
	["mm", 96 / 25.4],
	["q", 96 / 101.6],
	["in", 96],
	["pt", 96 / 72],
	["pc", 16],
	["vw", 8],
	["vh", 6],
	["vmin", 6],
	["vmax", 8],
	["%", 2],
] as const)(
	"computes signed %s values with existing unit factors",
	(unit, expected) => {
		for (const sign of [1, -1]) {
			const computed = computeTextIndent(
				`${sign}${unit} hanging each-line`,
				20,
				32,
				viewport,
			);
			expect(computed).toBe(
				`${sign * (unit === "%" ? 1 : expected)}${unit === "%" ? "%" : "px"} hanging each-line`,
			);
			const resolved = resolveTextIndent(computed, 200);
			expect(resolved).toEqual({
				size: sign * expected,
				hanging: true,
				eachLine: true,
			});
			expect(Object.isFrozen(resolved)).toBe(true);
		}
	},
);

it.each([
	["calc(1em - 2rem)", "-44px", -44],
	["calc(2px - 5px)", "-3px", -3],
	["calc(-2 * 3px)", "-6px", -6],
	["calc(24px / (2 * 3))", "4px", 4],
	["calc(1em - 20%)", "calc(20px - 20%)", -20],
	["calc(2 * (10% - 3px))", "calc(2 * (10% - 3px))", 34],
	["min(1em, 20%)", "min(20px, 20%)", 20],
	["max(-1em, -20%)", "max(-20px, -20%)", -20],
	["clamp(-1em, -20%, 1rem)", "clamp(-20px, -20%, 32px)", -20],
	["calc(min(-5px, -10px) * 2)", "-20px", -20],
	["clamp(40px, 10px, 20px)", "40px", 40],
] as const)(
	"computes and resolves finite signed math %s",
	(value, expected, size) => {
		const computed = computeTextIndent(`${value} each-line`, 20, 32, viewport);
		expect(computed).toBe(`${expected} each-line`);
		expect(resolveTextIndent(computed, 200)).toEqual({
			size,
			hanging: false,
			eachLine: true,
		});
	},
);

it("shares inherited immutable zero defaults with text nodes", () => {
	const { tree, id, styles, text, computed } = fixture();
	expect(initialTextStyle["text-indent"]).toBe("0px");
	expect(text()).toBe(initialTextStyle);
	expect(styles.text(tree.get(id()).children[0])).toBe(text());
	expect(computed.textIndent).toBe("0px");
	expect(resolveTextIndent("0px", 0)).toEqual({
		size: 0,
		hanging: false,
		eachLine: false,
	});
	expect(styles.metrics().issues).toEqual({});
});

it.each(["initial", "inherit", "unset", "revert"])(
	"keeps %s handling in the inherited CSS text cascade",
	(keyword) => {
		expect(parseTextIndent(keyword)).toBeUndefined();
		expect(parseTextValue("text-indent", keyword)).toBe(keyword);
		expect(cssSupportsDeclaration("text-indent", keyword)).toBe(true);
		const { text } = fixture(
			`#parent{font-size:20px;text-indent:2em hanging each-line}#target{font-size:10px;text-indent:${keyword}}`,
		);
		expect(text()["text-indent"]).toBe(
			keyword === "initial" ? "0px" : "40px hanging each-line",
		);
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"expands all:%s through dynamic text-property metadata",
	(keyword) => {
		const { inline, computed } = fixture("#parent{text-indent:-25% hanging}");
		inline.setProperty("all", keyword);
		expect(computed.textIndent).toBe(
			keyword === "initial" ? "0px" : "-25% hanging",
		);
		const expanded = declarations(`all:${keyword}`);
		expect(expanded.parsed).toContainEqual({
			property: "text-indent",
			value: keyword,
			important: false,
		});
		expect(
			expanded.parsed.filter(({ property }) =>
				(cssTextProperties as readonly string[]).includes(property),
			),
		).toHaveLength(cssTextProperties.length);
	},
);

it("inherits computed math across descendant font changes", () => {
	const { tree, id, text, styles } = fixture(
		"html{font-size:32px}#parent{font-size:20px;text-indent:calc(2em + 1rem - 10%) hanging each-line}#target{font-size:10px}",
	);
	expect(text()["text-indent"]).toBe(
		"calc(40px + 32px - 10%) hanging each-line",
	);
	expect(text()["text-indent"]).toBe(text("#parent")["text-indent"]);
	expect(styles.text(tree.get(id()).children[0])["text-indent"]).toBe(
		text()["text-indent"],
	);
	tree.setAttribute(id(), "style", "font-size:50px");
	expect(text()["text-indent"]).toBe(
		"calc(40px + 32px - 10%) hanging each-line",
	);
	expect(resolveTextIndent(text()["text-indent"], 200).size).toBe(52);
	expect(resolveTextIndent(text()["text-indent"], 400).size).toBe(32);
	tree.setAttribute(id("#parent"), "style", "font-size:30px");
	expect(text()["text-indent"]).toBe(
		"calc(60px + 32px - 10%) hanging each-line",
	);
});

it("computes root rem indentation and refreshes descendants", () => {
	const { tree, id, text } = fixture(
		"html{font-size:2rem;text-indent:2rem}#target{font-size:10px;text-indent:calc(1rem + 1em)}",
	);
	expect(text("html")["font-size"]).toBe("32px");
	expect(text("html")["text-indent"]).toBe("64px");
	expect(text("#parent")["text-indent"]).toBe("64px");
	expect(text()["text-indent"]).toBe("42px");
	tree.setAttribute(id("html"), "style", "font-size:40px");
	expect(text("html")["text-indent"]).toBe("80px");
	expect(text("#parent")["text-indent"]).toBe("80px");
	expect(text()["text-indent"]).toBe("50px");
});

it("refreshes viewport math and preserves inherited percentages", () => {
	const { styles, text } = fixture(
		"#parent{text-indent:calc(1vw + 1vh + 1vmin + 1vmax + 10%) hanging}#target{font-size:40px}",
	);
	const before = text();
	expect(before["text-indent"]).toBe(
		"calc(8px + 6px + 6px + 8px + 10%) hanging",
	);
	styles.setViewport(400, 1000);
	expect(text()).not.toBe(before);
	expect(text()["text-indent"]).toBe(
		"calc(4px + 10px + 4px + 10px + 10%) hanging",
	);
	expect(text()["text-indent"]).toBe(text("#parent")["text-indent"]);
	expect(resolveTextIndent(text()["text-indent"], 200).size).toBe(48);
});

it("exposes live CSSOM aliases, priority and read-only computed values", () => {
	const { inline, computed, tree, id, styles } = fixture(
		"span{text-indent:1px}#target{text-indent:2px!important}",
	);
	inline.textIndent = "hanging 3em";
	expect(inline["text-indent"]).toBe("3em hanging");
	expect(inline.getPropertyValue("text-indent")).toBe("3em hanging");
	expect(computed.textIndent).toBe("2px");
	inline.setProperty("text-indent", "each-line -2em hanging", "important");
	expect(inline.textIndent).toBe("-2em hanging each-line");
	expect(inline.getPropertyPriority("text-indent")).toBe("important");
	expect(computed.textIndent).toBe("-32px hanging each-line");
	expect(computed["text-indent"]).toBe(computed.textIndent);
	expect(computed.getPropertyValue("TEXT-INDENT")).toBe(computed.textIndent);
	expect(computed.getPropertyPriority("text-indent")).toBe("");
	expect(resolvedStyleValue(tree, id(), "text-indent")).toBe(
		computed.textIndent,
	);
	const revision = tree.revision;
	inline.textIndent = "1px hanging hanging";
	expect(tree.revision).toBe(revision);
	expect(inline.textIndent).toBe("-2em hanging each-line");
	expect(() => {
		computed.textIndent = "9px";
	}).toThrow();
	expect(inline.removeProperty("text-indent")).toBe("-2em hanging each-line");
	expect(computed.textIndent).toBe("2px");
	expect(styles.metrics().issues).toEqual({});
});

it("lists text-indent once in sorted computed and inline metadata", () => {
	const { computed, inline } = fixture();
	expect(
		cssTextProperties.filter((name) => name === "text-indent"),
	).toHaveLength(1);
	expect(
		inlineProperties.filter((name) => name === "text-indent"),
	).toHaveLength(1);
	const names = Array.from({ length: computed.length }, (_value, index) => {
		expect(computed[index]).toBe(computed.item(index));
		return computed.item(index);
	});
	expect(names).toEqual(computedStyleProperties);
	expect(names).toEqual([...names].sort());
	expect(names.filter((name) => name === "text-indent")).toHaveLength(1);
	expect(computed.cssText).toBe("");
	inline.textIndent = "10%";
	expect(inline.item(0)).toBe("text-indent");
	expect(inline.length).toBe(1);
	expect(computed.textIndent).toBe("10%");
});

it("handles variables, fallbacks and invalid-at-computed values", () => {
	const { inline, computed, tree, id } = fixture(
		"#parent{--indent:2em hanging;text-indent:7px}#target{font-size:10px;text-indent:var(--indent)}",
	);
	expect(computed.textIndent).toBe("20px hanging");
	inline.setProperty("--indent", "each-line calc(1em - 10%)");
	expect(computed.textIndent).toBe("calc(10px - 10%) each-line");
	inline.textIndent = "var(--missing, -25% hanging)";
	expect(inline.textIndent).toBe("var(--missing, -25% hanging)");
	expect(computed.textIndent).toBe("-25% hanging");
	inline.textIndent = "var(--missing)";
	expect(computed.textIndent).toBe("7px");
	inline.textIndent = "var(--indent)";
	inline.setProperty("--indent", "2");
	expect(computed.textIndent).toBe("7px");
	inline.setProperty("--indent", "initial");
	expect(computed.textIndent).toBe("7px");
	tree.setAttribute(id("#parent"), "style", "text-indent:-4px each-line");
	expect(computed.textIndent).toBe("-4px each-line");
});

it("evaluates @supports without accepting invalid declarations", () => {
	const { computed, styles } = fixture(
		"#target{text-indent:3px;text-indent:1;text-indent:1px hanging hanging}" +
			"@supports(text-indent:each-line calc(1em - 10%) hanging){#target{text-indent:5% hanging}}" +
			"@supports(text-indent:hanging){#target{text-indent:99px}}" +
			"@supports not (text-indent:1){#target{text-indent:-2px each-line}}",
	);
	expect(computed.textIndent).toBe("-2px each-line");
	expect(styles.metrics().issues["unimplemented-css-property"]).toBeUndefined();
	expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(2);
	expect(cssSupportsDeclaration("text-indent", "1")).toBe(false);
	expect(cssSupportsDeclaration("text-indent", "1px hanging hanging")).toBe(
		false,
	);
});

it("bounds specified source, nesting, nodes and function arguments", () => {
	const overlong = `${" ".repeat(cssMathLimits.maxSourceCodeUnits)}1px`;
	const deep = `${"calc(".repeat(cssMathLimits.maxDepth + 1)}1px${")".repeat(cssMathLimits.maxDepth + 1)}`;
	const manyNodes = `calc(${Array(cssMathLimits.maxNodes).fill("1px").join(" + ")})`;
	const manyArguments = `min(${Array(cssMathLimits.maxArguments + 1)
		.fill("1px")
		.join(", ")})`;
	for (const value of [overlong, deep, manyNodes, manyArguments]) {
		expect(parseTextIndent(value)).toBeUndefined();
		expect(() => computeTextIndent(value, 16, 16, viewport)).toThrow();
	}
	expect(
		parseTextIndent(`${" ".repeat(cssMathLimits.maxSourceCodeUnits - 3)}1px`),
	).toBe("1px");
});

it("inherits and resolves math beyond the specified source bound", () => {
	const inner = `min(${Array(28).fill("1q").join(", ")})`;
	const source = `min(1%, ${Array(8).fill(inner).join(", ")}) hanging each-line`;
	const computed = computeTextIndent(source, 16, 16, viewport);
	expect(computed.length).toBeGreaterThan(cssMathLimits.maxSourceCodeUnits);
	expect(computed.length).toBeLessThan(cssMathLimits.maxComputedCodeUnits);
	expect(parseTextIndent(computed)).toBeUndefined();
	expect(
		computeTextIndent(computed, 40, 64, { width: 400, height: 1000 }),
	).toBe(computed);
	expect(() =>
		computeTextIndent(computed.replace("px", "em"), 16, 16, viewport),
	).toThrow("Computed text indentation");
	expect(() =>
		computeTextIndent(
			computed.replace("min(1%,", "min( 1%,"),
			16,
			16,
			viewport,
		),
	).toThrow("Canonical");
	const parent = computeTextStyle(
		{ "text-indent": source },
		initialTextStyle,
		viewport,
		16,
	);
	for (const specified of [
		{},
		{ "text-indent": "inherit", "font-size": "32px" },
	]) {
		const child = computeTextStyle(specified, parent, viewport, 16);
		expect(child["text-indent"]).toBe(computed);
		expect(resolveTextIndent(child["text-indent"], 1000)).toEqual({
			size: 96 / 101.6,
			hanging: true,
			eachLine: true,
		});
	}
});

it("bounds signed lengths and defers percentages until resolution", () => {
	const maximum = layoutValueLimits.maxAbsoluteLength;
	for (const sign of [1, -1]) {
		expect(computeTextIndent(`${sign * maximum}px`, 16, 16, viewport)).toBe(
			`${sign * maximum}px`,
		);
		expect(resolveTextIndent(`${sign * maximum}px hanging`, 0).size).toBe(
			sign * maximum,
		);
		expect(() =>
			computeTextIndent(`${sign * (maximum + 1)}px`, 16, 16, viewport),
		).toThrow("limit");
		expect(() =>
			computeTextIndent(`calc(${sign * maximum}px * 2)`, 16, 16, viewport),
		).toThrow("limit");
		expect(() => resolveTextIndent(`${sign * (maximum + 1)}px`, 0)).toThrow(
			"limit",
		);
		expect(() => resolveTextIndent(`${sign * 200}%`, maximum)).toThrow("limit");
		expect(computeTextIndent(`${sign * 200}%`, 16, 16, viewport)).toBe(
			`${sign * 200}%`,
		);
		expect(resolveTextIndent(`${sign * 200}%`, 0).size).toBe(0);
	}
	expect(() => resolveTextIndent("calc(100% + 1px)", maximum)).toThrow("limit");
	expect(() =>
		computeTextIndent("calc(1e308px * 2)", 16, 16, viewport),
	).toThrow("overflow");
	expect(() => resolveTextIndent("calc(1e308px * 2)", 0)).toThrow("overflow");
});

it.each([
	"1em",
	"0",
	"1px hanging hanging",
	"1px each-line hanging",
	"initial",
	"1px extra",
])("rejects noncanonical or uncomputed resolver input %s", (value) => {
	expect(() => resolveTextIndent(value, 100)).toThrow();
});

it("rejects invalid numeric context and overlong computed inputs", () => {
	for (const basis of [
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		layoutValueLimits.maxAbsoluteLength + 1,
	])
		expect(() => resolveTextIndent("1px", basis)).toThrow();
	for (const font of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
		expect(() => computeTextIndent("1em", font, 16, viewport)).toThrow();
		expect(() => computeTextIndent("1rem", 16, font, viewport)).toThrow();
	}
	expect(() =>
		computeTextIndent("1vw", 16, 16, { width: -1, height: 600 }),
	).toThrow();
	expect(() =>
		resolveTextIndent(
			`${"1".repeat(layoutValueLimits.maxLengthCodeUnits)}px`,
			100,
		),
	).toThrow("limit");
	expect(() =>
		resolveTextIndent(
			`calc(${" ".repeat(cssMathLimits.maxComputedCodeUnits)}1px) hanging each-line`,
			100,
		),
	).toThrow("limit");
	expect(() =>
		computeTextIndent(
			`calc(${" ".repeat(cssMathLimits.maxComputedCodeUnits)}1px) hanging each-line`,
			16,
			16,
			viewport,
		),
	).toThrow("limit");
});

it("reuses frozen zero indentation without bypassing numeric bounds", () => {
	const zero = resolveTextIndent("0px", 0);
	expect(resolveTextIndent("0px", 240)).toBe(zero);
	expect(zero).toEqual({ size: 0, hanging: false, eachLine: false });
	expect(Object.isFrozen(zero)).toBe(true);
	for (const basis of [-1, Number.NaN, Number.POSITIVE_INFINITY])
		expect(() => resolveTextIndent("0px", basis)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	expect(() => resolveTextIndent("0px", 16_777_217)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("keeps failures atomic and releases style capabilities on close", () => {
	const { inline, computed, inlineStyles, computedStyles, tree, id, styles } =
		fixture();
	inline.textIndent = "8px";
	const target = id();
	const revision = tree.revision;
	inline.textIndent = "calc(1px / 0)";
	expect(tree.revision).toBe(revision);
	expect(computed.textIndent).toBe("8px");
	tree.remove(target);
	expect(computed.textIndent).toBe("");
	expect(computed.length).toBe(0);
	expect(() => styles.text(target)).toThrow();
	tree.close();
	expect(inlineStyles.stats).toEqual({ objects: 0, cachedCodeUnits: 0 });
	expect(() => inline.textIndent).toThrow();
	expect(() => computed.textIndent).toThrow();
	expect(() => inlineStyles.get(target)).toThrow();
	expect(() => computedStyles.get(target)).toThrow();
});
