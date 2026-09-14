import { afterEach, expect, it } from "vitest";
import {
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import {
	inlineProperties,
	parseInlineDeclarations,
} from "./css-declarations.js";
import {
	computePaintStyle,
	cssPaintProperties,
	initialPaintStyle,
	isCssPaintProperty,
	parsePaintValue,
} from "./css-paint.js";
import {
	cssSupportsCondition,
	cssSupportsDeclaration,
	parseCssDeclarations,
} from "./css-parser.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	cssText: string;
	opacity: string;
	readonly length: number;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
	item(index: number): string;
}

const trees: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value });
		if (definition.indexed)
			Object.defineProperty(target, "length", {
				get: definition.indexed.length,
			});
		return target;
	},
};

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(source = "", css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">${css}</style><main id="parent"><div id="target"><span id="child">Text</span></div></main>`,
		"https://fixture.invalid/opacity-style",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	if (source) tree.setAttribute(target, "style", source);
	const dom = new ScriptDom(tree, factory);
	const element = dom.node(target) as { style: Style };
	return {
		tree,
		id,
		target,
		styles: documentStyles(tree),
		style: element.style,
		computed: dom.getComputedStyle(element) as Style,
	};
}

function declarations(source: string) {
	return parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
		() => {},
	);
}

it.each([
	["0", "0", 0],
	["1", "1", 1],
	[".5", "0.5", 0.5],
	["+.25", "0.25", 0.25],
	["000.5000", "0.5", 0.5],
	["-0", "0", 0],
	["-0.5", "-0.5", 0],
	["2", "2", 1],
	["1.0001", "1.0001", 1],
	["5e-1", "0.5", 0.5],
	["+5E-1", "0.5", 0.5],
	["1e+2", "100", 1],
	["1e308", "1e+308", 1],
	["-1e308", "-1e+308", 0],
	["1e-9999", "0", 0],
	["5e-324", "5e-324", 5e-324],
	["0%", "0%", 0],
	["100%", "100%", 1],
	["50%", "50%", 0.5],
	["+.5%", "0.5%", 0.005],
	["0025.00%", "25%", 0.25],
	["-0%", "0%", 0],
	["-20%", "-20%", 0],
	["125%", "125%", 1],
	["5E+1%", "50%", 0.5],
	["1e308%", "1e+308%", 1],
	["\t\n\f\r +.50% \t", "0.5%", 0.005],
] as const)(
	"normalizes %s and computes bounded numeric opacity",
	(value, normalized, amount) => {
		expect(parsePaintValue(value, "opacity")).toBe(normalized);
		expect(declarations(`opacity:${value}`)).toEqual([
			{ property: "opacity", value: normalized, important: false },
		]);
		expect(parseInlineDeclarations(`opacity:${value}`, 10)).toEqual([
			{ name: "opacity", value: normalized, important: false },
		]);
		expect(cssSupportsDeclaration("opacity", value)).toBe(true);
		expect(cssSupportsCondition(`(opacity: ${value})`)).toBe(true);
		const { tree, target, styles, style, computed } = fixture(
			`opacity:${value}`,
		);
		expect(style.opacity).toBe(normalized);
		expect(computed.opacity).toBe(String(amount));
		expect(resolvedStyleValue(tree, target, "opacity")).toBe(String(amount));
		const paint = styles.paint(target);
		expect(paint.opacity ?? 1).toBe(amount);
		expect(Object.hasOwn(paint, "opacity")).toBe(amount !== 1);
		expect(Object.isFrozen(paint)).toBe(true);
	},
);

it.each([
	"",
	" ",
	"NaN",
	"nan%",
	"Infinity",
	"+Infinity",
	"-Infinity",
	"Infinity%",
	"1e309",
	"-1e309",
	"1e309%",
	"-1e309%",
	"0x10",
	"0b1",
	"0o1",
	"1_0",
	".",
	"+",
	"--1",
	"1.",
	"1.%",
	"1.e2",
	"1e",
	"1e+",
	"1e 2",
	"50 %",
	"50%%",
	"1px",
	"1deg",
	"1/2",
	"0.2 0.3",
	"0.2,0.3",
	"auto",
	"none",
	"transparent",
	"revert-layer",
	"calc(1 / 2)",
	"min(.2, .5)",
	"max(.2, .5)",
	"clamp(0, .5, 1)",
	"env(opacity)",
] as const)("rejects unsupported or nonfinite opacity %j", (value) => {
	expect(parsePaintValue(value, "opacity")).toBeUndefined();
	expect(declarations(`opacity:${value}`)).toEqual([]);
	expect(parseInlineDeclarations(`opacity:${value}`, 10)).toEqual([]);
	expect(cssSupportsDeclaration("opacity", value)).toBe(false);
	expect(computePaintStyle({ opacity: value }, initialPaintStyle)).toBe(
		initialPaintStyle,
	);
});

it.each(["\u00a00.5", "0.5\u00a0"])(
	"rejects non-CSS whitespace in the paint grammar %j",
	(value) => {
		expect(parsePaintValue(value, "opacity")).toBeUndefined();
		expect(declarations(`opacity:${value}`)).toEqual([]);
		expect(cssSupportsDeclaration("opacity", value)).toBe(false);
	},
);

it("registers opacity in generic inline, supports and computed property lists", () => {
	expect(isCssPaintProperty("opacity")).toBe(true);
	for (const properties of [
		cssPaintProperties,
		inlineProperties,
		computedStyleProperties,
	])
		expect(
			properties.filter((property) => property === "opacity"),
		).toHaveLength(1);
	const { tree, target, style, computed } = fixture();
	expect(style.opacity).toBe("");
	expect(computed.opacity).toBe("1");
	expect(computed.getPropertyValue("OPACITY")).toBe("1");
	expect(resolvedStyleValue(tree, target, "opacity")).toBe("1");
	expect(
		Array.from({ length: computed.length }, (_value, index) =>
			computed.item(index),
		),
	).toContain("opacity");
	expect(documentGeometry(tree).metrics().builds).toBe(0);
});

it("preserves default objects and distinguishes zero from omitted opacity", () => {
	expect(initialPaintStyle).toEqual({
		color: [0, 0, 0, 255],
		"background-color": [0, 0, 0, 0],
	});
	expect(computePaintStyle({}, initialPaintStyle)).toBe(initialPaintStyle);
	expect(computePaintStyle({ opacity: "1" }, initialPaintStyle)).toBe(
		initialPaintStyle,
	);
	const zero = computePaintStyle({ opacity: "0" }, initialPaintStyle);
	expect(zero).toEqual({ ...initialPaintStyle, opacity: 0 });
	expect(computePaintStyle({ opacity: "inherit" }, zero)).toBe(zero);
	expect(computePaintStyle({}, zero)).toEqual(initialPaintStyle);
	expect(computePaintStyle({}, zero)).not.toBe(zero);
});

it.each(["initial", "unset", "revert", "inherit"] as const)(
	"normalizes and computes CSS-wide %s without implicit inheritance",
	(keyword) => {
		const value = `\t${keyword.toUpperCase()} `;
		expect(parsePaintValue(value, "opacity")).toBe(keyword);
		expect(cssSupportsDeclaration("opacity", value)).toBe(true);
		const { tree, id, target, styles, style, computed } = fixture(
			`opacity:${value}`,
			"#parent{opacity:25%}",
		);
		expect(style.opacity).toBe(keyword);
		expect(computed.opacity).toBe(keyword === "inherit" ? "0.25" : "1");
		expect(styles.paint(target).opacity).toBe(
			keyword === "inherit" ? 0.25 : undefined,
		);
		expect(styles.paint(id("#child")).opacity).toBeUndefined();
		tree.setAttribute(id("#parent"), "style", "opacity:0");
		expect(computed.opacity).toBe(keyword === "inherit" ? "0" : "1");
		expect(computePaintStyle({ opacity: keyword }, initialPaintStyle)).toBe(
			initialPaintStyle,
		);
	},
);

it("does not inherit or multiply group opacity into child computed values", () => {
	const { tree, id, target, styles, computed } = fixture(
		"",
		"#parent{opacity:.2}#child{opacity:.5}",
	);
	expect(styles.paint(id("#parent")).opacity).toBe(0.2);
	expect(styles.paint(target).opacity).toBeUndefined();
	expect(computed.opacity).toBe("1");
	expect(styles.paint(id("#child")).opacity).toBe(0.5);
	tree.setAttribute(target, "style", "opacity:inherit");
	expect(computed.opacity).toBe("0.2");
	expect(styles.paint(id("#child")).opacity).toBe(0.5);
	tree.setAttribute(target, "style", "opacity:0");
	expect(computed.opacity).toBe("0");
	expect(styles.paint(id("#child")).opacity).toBe(0.5);
});

it("uses initial opacity for explicit root inheritance", () => {
	const { tree, id, styles } = fixture("", "html{opacity:inherit}");
	expect(styles.paint(id("html")).opacity).toBeUndefined();
	expect(resolvedStyleValue(tree, id("html"), "opacity")).toBe("1");
});

it.each(["initial", "unset", "revert", "inherit"] as const)(
	"includes opacity in the generic all:%s expansion",
	(keyword) => {
		const { target, styles, computed } = fixture(
			"",
			`#parent{opacity:.25}#target{opacity:.5;all:${keyword}}`,
		);
		expect(computed.opacity).toBe(keyword === "inherit" ? "0.25" : "1");
		expect(styles.paint(target).opacity).toBe(
			keyword === "inherit" ? 0.25 : undefined,
		);
	},
);

it.each([
	["#target{opacity:.2}#target{opacity:.4}", "", "0.4"],
	["#target{opacity:.2}div{opacity:.4}", "", "0.2"],
	["#target{opacity:.2}div{opacity:.4!important}", "", "0.4"],
	["#target{opacity:.2!important}div{opacity:.4!important}", "", "0.2"],
	["#target{opacity:.2!important}#target{opacity:.4!important}", "", "0.4"],
	["#target{opacity:.2!important}", "opacity:.4", "0.2"],
	["#target{opacity:.2!important}", "opacity:.4!important", "0.4"],
	["#target{opacity:.2}", "opacity:.4", "0.4"],
	["", "opacity:.2!important;opacity:.4", "0.2"],
	["", "opacity:.2;opacity:.4!important", "0.4"],
	["#target{opacity:.2;opacity:1e309!important}", "", "0.2"],
	["", "opacity:.2;opacity:calc(1 / 2)!important", "0.2"],
] as const)("cascades %s with inline %s", (css, source, expected) => {
	const { target, styles, computed } = fixture(source, css);
	expect(computed.opacity).toBe(expected);
	expect(styles.paint(target).opacity).toBe(Number(expected));
});

it("updates live inline and computed CSSOM after setters, removal and attributes", () => {
	const { tree, target, styles, style, computed } = fixture(
		"",
		"#target{opacity:.3}",
	);
	expect(computed.opacity).toBe("0.3");
	style.opacity = "+025.00%";
	expect(style.opacity).toBe("25%");
	expect(computed.opacity).toBe("0.25");
	style.setProperty("opacity", "200%", "important");
	expect(style.getPropertyValue("opacity")).toBe("200%");
	expect(style.getPropertyPriority("opacity")).toBe("important");
	expect(computed.opacity).toBe("1");
	expect(styles.paint(target).opacity).toBeUndefined();
	style.opacity = "NaN";
	expect(style.opacity).toBe("200%");
	expect(style.getPropertyPriority("opacity")).toBe("important");
	style.setProperty("opacity", "1e309");
	expect(style.opacity).toBe("200%");
	expect(style.removeProperty("opacity")).toBe("200%");
	expect(computed.opacity).toBe("0.3");
	style.cssText = "opacity:0!important;color:red";
	expect(computed.opacity).toBe("0");
	expect(styles.paint(target).opacity).toBe(0);
	tree.setAttribute(target, "style", "opacity:50%");
	expect(style.opacity).toBe("50%");
	expect(computed.opacity).toBe("0.5");
	style.opacity = "";
	expect(style.opacity).toBe("");
	expect(computed.opacity).toBe("0.3");
});

it("recomputes inherited opacity through stylesheet replacement", () => {
	const { tree, id, styles, computed } = fixture(
		"opacity:inherit",
		"#parent{opacity:.4}#child{opacity:inherit}",
	);
	expect(computed.opacity).toBe("0.4");
	expect(styles.paint(id("#child")).opacity).toBe(0.4);
	tree.setTextContent(
		id("#sheet"),
		"#parent{opacity:200%}#child{opacity:inherit}",
	);
	expect(computed.opacity).toBe("1");
	expect(styles.paint(id("#child")).opacity).toBeUndefined();
});

it.each(["before", "after"] as const)(
	"computes independent generated ::%s opacity and invalidates inherited values",
	(pseudo) => {
		const { tree, id, target, styles } = fixture(
			"opacity:.4!important",
			`#target::${pseudo}{content:"generated"}`,
		);
		const generated = () => {
			const result = styles.generatedContent(target, pseudo);
			if (!result) throw new Error(`Missing ::${pseudo}`);
			return result.paint;
		};
		expect(generated().opacity).toBeUndefined();
		for (const [value, expected] of [
			["25%", 0.25],
			["0", 0],
			["150%", undefined],
			["initial", undefined],
			["unset", undefined],
			["revert", undefined],
			["inherit", 0.4],
		] as const) {
			tree.setTextContent(
				id("#sheet"),
				`#target::${pseudo}{content:"generated";opacity:${value}}`,
			);
			expect(generated().opacity).toBe(expected);
			expect(Object.isFrozen(generated())).toBe(true);
			expect(styles.paint(target).opacity).toBe(0.4);
		}
		tree.setAttribute(target, "style", "opacity:0");
		expect(generated().opacity).toBe(0);
		tree.setTextContent(
			id("#sheet"),
			`#target::${pseudo}{content:"generated";opacity:.2!important}#target::${pseudo}{opacity:.8}`,
		);
		expect(generated().opacity).toBe(0.2);
		expect(styles.paint(target).opacity).toBe(0);
	},
);

it.each(["0", ".5", "1"] as const)(
	"keeps unrelated paint and SVG alpha unchanged with group opacity %s",
	(opacity) => {
		const specified = {
			color: "rgba(20, 40, 60, 0.5)",
			"background-color": "rgba(60, 40, 20, 0.25)",
			"caret-color": "currentcolor",
			"accent-color": "red",
			"border-top-color": "blue",
			fill: "red",
			stroke: "blue",
			"fill-opacity": "25%",
			"stroke-opacity": "50%",
			"stop-opacity": "75%",
			"stop-color": "green",
		};
		const baseline = computePaintStyle(specified, initialPaintStyle);
		const paint = computePaintStyle(
			{ ...specified, opacity },
			initialPaintStyle,
		);
		expect(paint).toEqual({
			...baseline,
			...(opacity === "1" ? {} : { opacity: Number(opacity) }),
		});
		expect(paint["fill-opacity"]).toBe(0.25);
		expect(paint["stroke-opacity"]).toBe(0.5);
		expect(paint["stop-opacity"]).toBe(0.75);
		const inherited = computePaintStyle({}, paint);
		expect(inherited.opacity).toBeUndefined();
		expect(inherited["fill-opacity"]).toBe(0.25);
		expect(inherited["stroke-opacity"]).toBe(0.5);
		expect(inherited["stop-opacity"]).toBeUndefined();
	},
);

it("retains the existing distinct SVG opacity grammars and CSSOM defaults", () => {
	expect(parsePaintValue("1.", "stop-opacity")).toBe("1");
	expect(parsePaintValue("1.", "fill-opacity")).toBe("1");
	expect(parsePaintValue("1.", "stroke-opacity")).toBeUndefined();
	const { tree, target } = fixture("opacity:0");
	for (const property of ["stop-opacity", "fill-opacity", "stroke-opacity"])
		expect(resolvedStyleValue(tree, target, property)).toBe("1");
});
