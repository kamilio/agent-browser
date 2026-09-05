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
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	[index: number]: string | undefined;
	cssText: string;
	readonly length: number;
	caretColor: string;
	"caret-color": string;
	color: string;
	getPropertyValue(...args: unknown[]): string;
	getPropertyPriority(...args: unknown[]): string;
	setProperty(...args: unknown[]): void;
	removeProperty(...args: unknown[]): string;
	item(index: unknown): string;
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

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(source = "", css = "") {
	const tree = parseHtmlDocument(
		`<style id="sheet">#outer{color:red}#target{color:blue}${css}</style><main id="outer"><div id="target">Text</div></main>`,
		"https://fixture.invalid/css-caret-color",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id();
	if (source) tree.setAttribute(target, "style", source);
	const dom = new ScriptDom(tree, factory);
	const element = dom.node(target) as { style: Style };
	const styles = documentStyles(tree);
	return {
		tree,
		id,
		target,
		dom,
		element,
		styles,
		style: element.style,
		computed: dom.getComputedStyle(element) as Style,
		paint: (selector = "#target") => styles.paint(id(selector)),
	};
}

function names(style: Style) {
	return Array.from({ length: style.length }, (_value, index) =>
		style.item(index),
	);
}

it.each([
	["AUTO", "auto", "rgb(0, 0, 255)"],
	["CurrentColor", "currentcolor", "rgb(0, 0, 255)"],
	["ReD", "red", "rgb(255, 0, 0)"],
	["rebeccapurple", "rebeccapurple", "rgb(102, 51, 153)"],
	["transparent", "transparent", "rgba(0, 0, 0, 0)"],
	["#0f0", "rgb(0, 255, 0)", "rgb(0, 255, 0)"],
	["#123456", "rgb(18, 52, 86)", "rgb(18, 52, 86)"],
	["#1238", "rgba(17, 34, 51, 0.533)", "rgba(17, 34, 51, 0.533)"],
	["#ff000080", "rgba(255, 0, 0, 0.502)", "rgba(255, 0, 0, 0.502)"],
	["rgb(10 20 30 / 50%)", "rgba(10, 20, 30, 0.502)", "rgba(10, 20, 30, 0.502)"],
	["rgba(255,0,0,0.25)", "rgba(255, 0, 0, 0.251)", "rgba(255, 0, 0, 0.251)"],
	["hsl(120 100% 50%)", "rgb(0, 255, 0)", "rgb(0, 255, 0)"],
	[
		"hsla(240,100%,50%,0.5)",
		"rgba(0, 0, 255, 0.502)",
		"rgba(0, 0, 255, 0.502)",
	],
])(
	"accepts bounded %s grammar through both parsers, supports and computed used color",
	(input, literal, resolved) => {
		const source = `CaReT-CoLoR: /* value */ ${input} !IMPORTANT`;
		const issues: string[] = [];
		const parsed = parseCssDeclarations(
			source,
			{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
			(issue) => issues.push(issue),
		);
		expect(issues).toEqual([]);
		expect(parsed).toEqual([
			{ property: "caret-color", value: literal, important: true },
		]);
		expect(parseInlineDeclarations(source, 10)).toEqual([
			{ name: "caret-color", value: literal, important: true },
		]);
		expect(cssSupportsDeclaration("caret-color", input)).toBe(true);
		expect(cssSupportsCondition(`(caret-color: ${input})`)).toBe(true);
		const test = fixture(source);
		expect(test.style.caretColor).toBe(literal);
		expect(test.computed.caretColor).toBe(resolved);
		expect(test.computed["caret-color"]).toBe(resolved);
		expect(resolvedStyleValue(test.tree, test.target, "caret-color")).toBe(
			resolved,
		);
	},
);

it("rejects unsupported forms without admitting caret shorthand, shape or animation", () => {
	for (const value of [
		"",
		"none",
		"normal",
		"0",
		"1px",
		"red blue",
		"auto red",
		'"red"',
		"#12",
		"rgb(1,2)",
		"hsl(0 0 0)",
		"color(display-p3 1 0 0)",
		"lab(50% 0 0)",
		"color-mix(in srgb,red,blue)",
		"var()",
		"revert-layer",
	]) {
		expect(parseInlineDeclarations(`caret-color:${value}`, 10)).toEqual([]);
		expect(cssSupportsDeclaration("caret-color", value)).toBe(false);
	}
	for (const [property, value] of [
		["caret", "red"],
		["caret-shape", "bar"],
		["caret-animation", "manual"],
		["caret-blink", "none"],
	]) {
		expect(inlineProperties).not.toContain(property);
		expect(computedStyleProperties).not.toContain(property);
		expect(cssSupportsDeclaration(property, value)).toBe(false);
	}
});

it("admits auto only in the caret paint grammar without changing other color grammar", () => {
	expect(isCssPaintProperty("caret-color")).toBe(true);
	expect(
		cssPaintProperties.filter((name) => name === "caret-color"),
	).toHaveLength(1);
	expect(
		parsePaintValue(
			"auto",
			"caret-color" as Parameters<typeof parsePaintValue>[1],
		),
	).toBe("auto");
	for (const property of [
		"color",
		"background-color",
		"border-left-color",
	] as const) {
		expect(parsePaintValue("auto", property)).toBeUndefined();
		expect(cssSupportsDeclaration(property, "auto")).toBe(false);
	}
});

it.each([undefined, "auto", "initial"])(
	"keeps the optional native default shape for %s",
	(value) => {
		const specified = {
			color: "blue",
			...(value === undefined ? {} : { "caret-color": value }),
		};
		const paint = computePaintStyle(specified, initialPaintStyle);
		expect(paint).toEqual({
			color: [0, 0, 255, 255],
			"background-color": [0, 0, 0, 0],
		});
		expect(paint).not.toHaveProperty("caret-color");
		expect(initialPaintStyle).not.toHaveProperty("caret-color");
		expect(Object.isFrozen(paint)).toBe(true);
	},
);

it("retains explicit native RGBA inheritance and keyword currentcolor instead of the parent's resolved foreground", () => {
	const explicit = computePaintStyle(
		{ color: "red", "caret-color": "#00800080" },
		initialPaintStyle,
	);
	expect(explicit).toHaveProperty("caret-color", [0, 128, 0, 128]);
	expect(computePaintStyle({ color: "blue" }, explicit)).toHaveProperty(
		"caret-color",
		[0, 128, 0, 128],
	);
	const keyword = computePaintStyle(
		{ color: "red", "caret-color": "currentcolor" },
		initialPaintStyle,
	);
	expect(keyword).toHaveProperty("caret-color", "currentcolor");
	expect(computePaintStyle({ color: "blue" }, keyword)).toHaveProperty(
		"caret-color",
		"currentcolor",
	);
});

it("falls back to inherited caret paint for invalid raw compute input but rejects invalid declarations", () => {
	const parent = computePaintStyle(
		{ color: "red", "caret-color": "lime" },
		initialPaintStyle,
	);
	const child = computePaintStyle(
		{ color: "blue", "caret-color": "not-a-color" },
		parent,
	);
	expect(child).toHaveProperty("caret-color", [0, 255, 0, 255]);
	expect(child.color).toEqual([0, 0, 255, 255]);
	expect(parseInlineDeclarations("caret-color:not-a-color", 10)).toEqual([]);
	expect(parent).toHaveProperty("caret-color", [0, 255, 0, 255]);
});

it.each([
	["lime", "rgb(0, 255, 0)"],
	["currentcolor", "rgb(0, 0, 255)"],
	["auto", "rgb(0, 0, 255)"],
	["transparent", "rgba(0, 0, 0, 0)"],
])(
	"inherits %s while resolving against the receiving element",
	(value, resolved) => {
		const test = fixture("", `#outer{caret-color:${value}}`);
		expect(test.style.caretColor).toBe("");
		expect(test.computed.caretColor).toBe(resolved);
		expect(test.paint().color).toEqual([0, 0, 255, 255]);
		if (value === "auto")
			expect(test.paint()).not.toHaveProperty("caret-color");
		if (value === "currentcolor") {
			expect(test.paint()).toHaveProperty("caret-color", "currentcolor");
			expect(
				resolvedStyleValue(test.tree, test.id("#outer"), "caret-color"),
			).toBe("rgb(255, 0, 0)");
			test.style.color = "purple";
			expect(test.computed.caretColor).toBe("rgb(128, 0, 128)");
		}
	},
);

it.each([
	["inherit", "rgb(0, 255, 0)"],
	["unset", "rgb(0, 255, 0)"],
	["revert", "rgb(0, 255, 0)"],
	["initial", "rgb(0, 0, 255)"],
	["auto", "rgb(0, 0, 255)"],
])("applies %s over inherited explicit caret color", (keyword, resolved) => {
	const test = fixture(`caret-color:${keyword}`, "#outer{caret-color:lime}");
	expect(test.style.caretColor).toBe(keyword);
	expect(test.computed.caretColor).toBe(resolved);
	if (keyword === "initial" || keyword === "auto")
		expect(test.paint()).not.toHaveProperty("caret-color");
});

it.each(["inherit", "unset", "revert"])(
	"retains inherited currentcolor through %s rather than freezing parent red",
	(keyword) => {
		const test = fixture(
			`caret-color:${keyword}`,
			"#outer{caret-color:currentcolor}",
		);
		expect(test.paint()).toHaveProperty("caret-color", "currentcolor");
		expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
	},
);

it("resolves absent, auto and currentcolor to the same current used color", () => {
	const test = fixture();
	for (const value of ["", "auto", "currentcolor"]) {
		test.style.setProperty("caret-color", value);
		expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
		test.style.color = "rgba(20,40,60,0.5)";
		expect(test.computed.caretColor).toBe("rgba(20, 40, 60, 0.502)");
		test.style.removeProperty("color");
	}
});

it("shares literal, camel and method CSSOM state with one indexed declaration", () => {
	const test = fixture("caret-color:red");
	expect(test.style.caretColor).toBe("red");
	test.style["caret-color"] = "lime";
	expect(test.style.caretColor).toBe("lime");
	test.style.caretColor = "currentcolor";
	expect(test.style.getPropertyValue("CARET-COLOR")).toBe("currentcolor");
	test.style.setProperty("CaReT-CoLoR", "auto", "IMPORTANT");
	expect(test.style["caret-color"]).toBe("auto");
	expect(test.style.cssText).toBe("caret-color: auto !important;");
	expect(test.style.getPropertyPriority("caret-color")).toBe("important");
	expect(test.computed.getPropertyPriority("caret-color")).toBe("");
	expect(test.element.style).toBe(test.style);
	expect(names(test.style)).toEqual(["caret-color"]);
	expect(test.style[0]).toBe("caret-color");
	expect(test.style[1]).toBeUndefined();
	expect(test.computed.getPropertyValue("CARET-COLOR")).toBe("rgb(0, 0, 255)");
	const revision = test.tree.revision;
	test.style.setProperty("caret-color", "auto", "important");
	expect(test.tree.revision).toBe(revision);
});

it("enumerates exactly 75 unique computed longhands including caret-color once", () => {
	const test = fixture();
	expect(test.computed.length).toBe(75);
	expect(computedStyleProperties).toHaveLength(75);
	expect(new Set(names(test.computed)).size).toBe(75);
	expect(names(test.computed)).toEqual(computedStyleProperties);
	expect(
		Array.from(
			{ length: test.computed.length },
			(_value, index) => test.computed[index],
		),
	).toEqual(computedStyleProperties);
	expect(
		names(test.computed).filter((name) => name === "caret-color"),
	).toHaveLength(1);
	expect(
		inlineProperties.filter((name) => name === "caret-color"),
	).toHaveLength(1);
	expect(test.computed.item(75)).toBe("");
	expect(test.computed[75]).toBeUndefined();
});

it("keeps method names distinct from camel accessors and custom-property case", () => {
	const test = fixture("caret-color:red;--caret-color:lime;--Caret-Color:blue");
	expect(test.style.getPropertyValue("caretColor")).toBe("");
	expect(test.computed.getPropertyValue("caretColor")).toBe("");
	expect(resolvedStyleValue(test.tree, test.target, "CARET-COLOR")).toBe("");
	expect(test.style.getPropertyValue("--caret-color")).toBe("lime");
	expect(test.style.getPropertyValue("--Caret-Color")).toBe("blue");
	test.style.caretColor = "auto";
	expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
	expect(names(test.style)).toEqual([
		"caret-color",
		"--caret-color",
		"--Caret-Color",
	]);
});

it("honors source order, stylesheet importance and inline priority replacement", () => {
	const test = fixture(
		"caret-color:lime",
		"#target{caret-color:red!important}#target{caret-color:purple}",
	);
	expect(test.computed.caretColor).toBe("rgb(255, 0, 0)");
	test.style.setProperty("caret-color", "blue", "important");
	expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
	test.style.caretColor = "lime";
	expect(test.style.getPropertyPriority("caret-color")).toBe("");
	expect(test.computed.caretColor).toBe("rgb(255, 0, 0)");
	test.style.cssText =
		"caret-color:red!important;caret-color:blue;caret-color:lime!important;caret-color:nope";
	expect(test.style.cssText).toBe("caret-color: lime !important;");
	expect(test.computed.caretColor).toBe("rgb(0, 255, 0)");
});

it("removes or empties the longhand and reveals inherited currentcolor again", () => {
	const test = fixture(
		"caret-color:red!important",
		"#outer{caret-color:currentcolor}",
	);
	expect(test.style.removeProperty("CARET-COLOR")).toBe("red");
	expect(test.style.caretColor).toBe("");
	expect(test.style.getPropertyPriority("caret-color")).toBe("");
	expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
	test.style.caretColor = "red";
	test.style.setProperty("caret-color", "", "invalid");
	expect(test.style.length).toBe(0);
	test.style.caretColor = "lime";
	Reflect.set(test.style, "caretColor", null);
	expect(test.style.length).toBe(0);
	expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
});

it("preserves valid declaration, priority, source, caches and revision after bad setter input", () => {
	const test = fixture("caret-color:lime!important");
	const source = test.tree.get(test.target).attributes.style;
	const paint = test.paint();
	const revision = test.tree.revision;
	for (const value of [
		"none",
		"1px",
		"red blue",
		"red!important",
		"red;color:blue",
		"color(display-p3 1 0 0)",
	])
		test.style.caretColor = value;
	test.style.setProperty("caret-color", "red", "invalid");
	expect(test.tree.revision).toBe(revision);
	expect(test.tree.get(test.target).attributes.style).toBe(source);
	expect(test.paint()).toBe(paint);
	expect(test.style.caretColor).toBe("lime");
	expect(test.style.getPropertyPriority("caret-color")).toBe("important");
	expect(test.computed.caretColor).toBe("rgb(0, 255, 0)");
});

it("rejects coercion and readonly computed writes without evaluating user conversions", () => {
	const test = fixture("caret-color:red");
	let calls = 0;
	const value = {
		toString() {
			calls++;
			return "lime";
		},
	};
	for (const operation of [
		() => Reflect.set(test.style, "caretColor", value),
		() => test.style.setProperty("caret-color", value),
		() => test.style.getPropertyValue(value),
		() => test.computed.getPropertyValue(value),
	])
		expect(operation).toThrow("coercion");
	expect(calls).toBe(0);
	for (const operation of [
		() => Reflect.set(test.computed, "caretColor", "lime"),
		() => Reflect.set(test.computed, "caret-color", "lime"),
		() => test.computed.setProperty("caret-color", "lime"),
		() => test.computed.removeProperty("caret-color"),
	])
		expect(operation).toThrow("read-only");
	expect(test.style.caretColor).toBe("red");
	expect(test.computed.caretColor).toBe("rgb(255, 0, 0)");
});

it("retains variable source while substituting inherited tokens, fallbacks and live custom values", () => {
	const test = fixture(
		"caret-color:var(--caret)",
		"#outer{--caret:currentcolor;caret-color:lime}",
	);
	expect(test.style.caretColor).toBe("var(--caret)");
	expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
	test.style.setProperty("--caret", "#ff000080");
	expect(test.computed.caretColor).toBe("rgba(255, 0, 0, 0.502)");
	test.style.caretColor = "var(--missing,transparent)";
	expect(test.computed.caretColor).toBe("rgba(0, 0, 0, 0)");
	test.style.caretColor = "var(--absent)";
	expect(test.computed.caretColor).toBe("rgb(0, 255, 0)");
	test.style.setProperty("--bad", "not-a-color");
	test.style.caretColor = "var(--bad)";
	expect(test.computed.caretColor).toBe("rgb(0, 255, 0)");
});

it.each([
	["initial", "rgb(0, 0, 255)"],
	["inherit", "rgb(0, 255, 0)"],
	["unset", "rgb(0, 255, 0)"],
])(
	"includes caret-color in all:%s without resetting custom declarations",
	(keyword, resolved) => {
		const test = fixture(
			`--saved:purple;caret-color:red;all:${keyword};color:blue`,
			"#outer{caret-color:lime}",
		);
		expect(test.style.caretColor).toBe(keyword);
		expect(test.style.getPropertyValue("--saved")).toBe("purple");
		expect(test.computed.caretColor).toBe(resolved);
		test.style.setProperty("caret-color", "purple", "important");
		test.style.setProperty("all", "initial");
		expect(test.computed.caretColor).toBe("rgb(0, 0, 0)");
		const entries = parseInlineDeclarations(
			"caret-color:purple!important;all:initial",
			256,
		);
		expect(entries.find((entry) => entry.name === "caret-color")).toEqual({
			name: "caret-color",
			value: "purple",
			important: true,
		});
	},
);

it("activates native @supports caret-color rules without claiming unsupported caret properties", () => {
	const test = fixture(
		"",
		"#target{caret-color:red}@supports(caret-color:auto){#target{caret-color:lime}}@supports(caret-shape:block){#target{caret-color:purple}}",
	);
	expect(
		cssSupportsCondition("(caret-color:auto) and (caret-color:currentcolor)"),
	).toBe(true);
	expect(
		cssSupportsCondition("(caret-color:red) and (caret-shape:block)"),
	).toBe(false);
	expect(test.computed.caretColor).toBe("rgb(0, 255, 0)");
});

it("keeps saved CSSOM capabilities live across stylesheet, attribute and ancestor mutations", () => {
	const test = fixture("", "#outer{caret-color:lime}");
	expect(test.computed.caretColor).toBe("rgb(0, 255, 0)");
	test.tree.setAttribute(
		test.id("#outer"),
		"style",
		"caret-color:currentcolor;color:red",
	);
	expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
	test.tree.setAttribute(
		test.target,
		"style",
		"caret-color:transparent!important",
	);
	expect(test.style.caretColor).toBe("transparent");
	expect(test.computed.caretColor).toBe("rgba(0, 0, 0, 0)");
	test.style.removeProperty("caret-color");
	const text = test.tree.get(test.id("#sheet")).children[0];
	test.tree.setData(text, "#target{color:purple;caret-color:currentcolor}");
	expect(test.computed.caretColor).toBe("rgb(128, 0, 128)");
	expect(test.element.style).toBe(test.style);
});

it("keeps detached inline style live but returns empty computed values until reattachment", () => {
	const test = fixture("caret-color:red");
	const parent = test.tree.get(test.target).parent;
	if (parent === null) throw new Error("Missing parent");
	test.tree.remove(test.target);
	expect(test.style.caretColor).toBe("red");
	expect(test.computed.caretColor).toBe("");
	expect(test.computed.length).toBe(0);
	test.style.caretColor = "currentcolor";
	test.tree.append(parent, test.target);
	expect(test.computed.caretColor).toBe("rgb(0, 0, 255)");
	expect(test.computed.length).toBe(75);
});

it.each(["document", "dom"])(
	"revokes saved caret-color accessors and methods on %s close",
	(kind) => {
		const test = fixture("caret-color:red");
		if (kind === "document") test.tree.close();
		else test.dom.close();
		for (const operation of [
			() => test.style.caretColor,
			() => test.style["caret-color"],
			() => Reflect.set(test.style, "caretColor", "lime"),
			() => test.style.getPropertyValue("caret-color"),
			() => test.style.removeProperty("caret-color"),
			() => test.computed.caretColor,
			() => test.computed["caret-color"],
			() => test.computed.getPropertyValue("caret-color"),
		])
			expect(operation).toThrow(/closed/i);
		if (kind === "document")
			expect(() =>
				resolvedStyleValue(test.tree, test.target, "caret-color"),
			).toThrow(/closed/i);
	},
);
