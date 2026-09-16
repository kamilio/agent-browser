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
	type PaintStyle,
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
	accentColor: string;
	"accent-color": string;
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
		"https://fixture.invalid/css-accent-color",
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
	};
}

function names(style: Style) {
	return Array.from({ length: style.length }, (_value, index) =>
		style.item(index),
	);
}

function paint(
	specified: Record<string, string>,
	parent: PaintStyle = initialPaintStyle,
) {
	return computePaintStyle({ color: "inherit", ...specified }, parent);
}

it.each([
	["AUTO", "auto", "auto"],
	["CurrentColor", "currentcolor", "currentcolor"],
	["ReD", "red", "rgb(255, 0, 0)"],
	["rebeccapurple", "rebeccapurple", "rgb(102, 51, 153)"],
	["transparent", "transparent", "rgba(0, 0, 0, 0)"],
	["#0f0", "rgb(0, 255, 0)", "rgb(0, 255, 0)"],
	["#123456", "rgb(18, 52, 86)", "rgb(18, 52, 86)"],
	["#1238", "rgba(17, 34, 51, 0.533)", "rgba(17, 34, 51, 0.533)"],
	["#00ff0080", "rgba(0, 255, 0, 0.502)", "rgba(0, 255, 0, 0.502)"],
	["rgb(10 20 30 / 50%)", "rgba(10, 20, 30, 0.502)", "rgba(10, 20, 30, 0.502)"],
	["rgba(255,0,0,0.25)", "rgba(255, 0, 0, 0.251)", "rgba(255, 0, 0, 0.251)"],
	["hsl(120 100% 50%)", "rgb(0, 255, 0)", "rgb(0, 255, 0)"],
	[
		"hsla(240,100%,50%,0.5)",
		"rgba(0, 0, 255, 0.502)",
		"rgba(0, 0, 255, 0.502)",
	],
])(
	"shares bounded %s grammar and normalization across parsers, supports and CSSOM",
	(input, literal, computed) => {
		const source = `AcCeNt-CoLoR: /* value */ ${input} !IMPORTANT`;
		const issues: string[] = [];
		const parsed = parseCssDeclarations(
			source,
			{ rules: 0, declarations: 0, maxRules: 10, maxDeclarations: 10 },
			(issue) => issues.push(issue),
		);
		expect(issues).toEqual([]);
		expect(parsed).toEqual([
			{ property: "accent-color", value: literal, important: true },
		]);
		expect(parseInlineDeclarations(source, 10)).toEqual([
			{ name: "accent-color", value: literal, important: true },
		]);
		expect(cssSupportsDeclaration("accent-color", input)).toBe(true);
		expect(cssSupportsCondition(`(accent-color: ${input})`)).toBe(true);
		const test = fixture(source);
		expect(test.style.accentColor).toBe(literal);
		expect(test.style["accent-color"]).toBe(literal);
		expect(test.computed.accentColor).toBe(computed);
		expect(test.computed["accent-color"]).toBe(computed);
		expect(resolvedStyleValue(test.tree, test.target, "accent-color")).toBe(
			computed,
		);
	},
);

it("rejects unsupported values and does not expand the existing bounded color grammar", () => {
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
		expect(parseInlineDeclarations(`accent-color:${value}`, 10)).toEqual([]);
		expect(cssSupportsDeclaration("accent-color", value)).toBe(false);
	}
	expect(cssSupportsDeclaration("accent", "red")).toBe(false);
});

it("adds exactly one paint property and admits auto without relaxing other color declarations", () => {
	expect(isCssPaintProperty("accent-color")).toBe(true);
	expect(
		cssPaintProperties.filter((name: string) => name === "accent-color"),
	).toHaveLength(1);
	expect(
		parsePaintValue(
			" AUTO ",
			"accent-color" as Parameters<typeof parsePaintValue>[1],
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
	expect(parsePaintValue("auto", "caret-color")).toBe("auto");
});

it.each([undefined, "auto", "initial"])(
	"preserves default native paint shape for %s",
	(value) => {
		const result = paint({
			color: "blue",
			...(value === undefined ? {} : { "accent-color": value }),
		});
		expect(result).toEqual({
			color: [0, 0, 255, 255],
			"background-color": [0, 0, 0, 0],
		});
		expect(result).not.toHaveProperty("accent-color");
		expect(initialPaintStyle).not.toHaveProperty("accent-color");
		expect(Object.isFrozen(result)).toBe(true);
	},
);

it("includes accent state in parent-map sharing without losing unrelated paint values", () => {
	const plain = paint({
		color: "red",
		"caret-color": "purple",
		"border-left-color": "blue",
	});
	const accented = paint(
		{ "accent-color": "lime", "border-left-color": "inherit" },
		plain,
	);
	expect(accented).not.toBe(plain);
	expect(accented).toHaveProperty("accent-color", [0, 255, 0, 255]);
	expect(accented).toHaveProperty("caret-color", [128, 0, 128, 255]);
	expect(accented).toHaveProperty("border-left-color", [0, 0, 255, 255]);
	expect(accented.color).toBe(plain.color);
	expect(plain).not.toHaveProperty("accent-color");
	for (const keyword of [undefined, "inherit", "unset", "revert"]) {
		const inherited = paint(
			{
				"border-left-color": "inherit",
				...(keyword === undefined ? {} : { "accent-color": keyword }),
			},
			accented,
		);
		expect(inherited).toBe(accented);
	}
	for (const keyword of ["auto", "initial"]) {
		const cleared = paint(
			{ "accent-color": keyword, "border-left-color": "inherit" },
			accented,
		);
		expect(cleared).not.toBe(accented);
		expect(cleared).not.toHaveProperty("accent-color");
		expect(cleared).toHaveProperty("caret-color", [128, 0, 128, 255]);
		expect(accented).toHaveProperty("accent-color", [0, 255, 0, 255]);
	}
});

it("retains explicit RGBA and inherited currentcolor without precomposing or resolving the parent", () => {
	const explicit = paint({ color: "red", "accent-color": "#00ff0080" });
	expect(explicit).toHaveProperty("accent-color", [0, 255, 0, 128]);
	expect(paint({ color: "blue" }, explicit)).toHaveProperty(
		"accent-color",
		[0, 255, 0, 128],
	);
	const keyword = paint({ color: "red", "accent-color": "currentcolor" });
	expect(keyword).toHaveProperty("accent-color", "currentcolor");
	const child = paint({ color: "blue" }, keyword);
	expect(child).toHaveProperty("accent-color", "currentcolor");
	expect(child.color).toEqual([0, 0, 255, 255]);
	expect(keyword.color).toEqual([255, 0, 0, 255]);
});

it("uses inherited accent for invalid raw compute input while declaration validation still rejects it", () => {
	const parent = paint({ color: "red", "accent-color": "lime" });
	const child = paint(
		{ color: "blue", "accent-color": "invalid-color" },
		parent,
	);
	expect(child).toHaveProperty("accent-color", [0, 255, 0, 255]);
	expect(child.color).toEqual([0, 0, 255, 255]);
	expect(parseInlineDeclarations("accent-color:invalid-color", 10)).toEqual([]);
});

it.each([
	["lime", "rgb(0, 255, 0)"],
	["currentcolor", "currentcolor"],
	["auto", "auto"],
	["transparent", "rgba(0, 0, 0, 0)"],
])(
	"inherits %s without replacing computed CSSOM with widget paint",
	(value, expected) => {
		const test = fixture("", `#outer{accent-color:${value}}`);
		expect(test.style.accentColor).toBe("");
		expect(test.computed.accentColor).toBe(expected);
		expect(test.styles.paint(test.target).color).toEqual([0, 0, 255, 255]);
		if (value === "auto")
			expect(test.styles.paint(test.target)).not.toHaveProperty("accent-color");
		if (value === "currentcolor")
			expect(test.styles.paint(test.target)).toHaveProperty(
				"accent-color",
				"currentcolor",
			);
	},
);

it.each([
	["inherit", "rgb(0, 255, 0)"],
	["unset", "rgb(0, 255, 0)"],
	["revert", "rgb(0, 255, 0)"],
	["initial", "auto"],
	["auto", "auto"],
])("applies %s over an explicit inherited accent", (keyword, expected) => {
	const test = fixture(`accent-color:${keyword}`, "#outer{accent-color:lime}");
	expect(test.style.accentColor).toBe(keyword);
	expect(test.computed.accentColor).toBe(expected);
	if (expected === "auto")
		expect(test.styles.paint(test.target)).not.toHaveProperty("accent-color");
});

it("keeps accent currentcolor computed while caret-color resolves to used RGB on the receiving element", () => {
	const test = fixture(
		"caret-color:currentcolor",
		"#outer{accent-color:currentcolor;color:red}",
	);
	expect(test.computed.accentColor).toBe("currentcolor");
	expect(test.computed.getPropertyValue("caret-color")).toBe("rgb(0, 0, 255)");
	expect(resolvedStyleValue(test.tree, test.id("#outer"), "accent-color")).toBe(
		"currentcolor",
	);
	test.style.color = "purple";
	expect(test.computed.accentColor).toBe("currentcolor");
	expect(test.computed.getPropertyValue("caret-color")).toBe(
		"rgb(128, 0, 128)",
	);
	expect(test.styles.paint(test.target)).toMatchObject({
		color: [128, 0, 128, 255],
		"accent-color": "currentcolor",
	});
	test.style.accentColor = "auto";
	expect(test.computed.accentColor).toBe("auto");
	test.style.color = "red";
	expect(test.computed.accentColor).toBe("auto");
});

it("defaults computed accent to auto and serializes alpha without white precomposition or contrast adjustment", () => {
	const test = fixture();
	expect(test.computed.accentColor).toBe("auto");
	test.style.accentColor = "#00ff0080";
	expect(test.computed.accentColor).toBe("rgba(0, 255, 0, 0.502)");
	expect(test.styles.paint(test.target)).toHaveProperty(
		"accent-color",
		[0, 255, 0, 128],
	);
	test.style.accentColor = "transparent";
	expect(test.computed.accentColor).toBe("rgba(0, 0, 0, 0)");
});

it("shares literal, camel and method access with one canonical inline slot and normal priority", () => {
	const test = fixture("accent-color:red");
	test.style["accent-color"] = "lime";
	expect(test.style.accentColor).toBe("lime");
	test.style.accentColor = "currentcolor";
	expect(test.style.getPropertyValue("ACCENT-COLOR")).toBe("currentcolor");
	test.style.setProperty("AcCeNt-CoLoR", "auto", "IMPORTANT");
	expect(test.style.cssText).toBe("accent-color: auto !important;");
	expect(test.style.getPropertyPriority("accent-color")).toBe("important");
	expect(test.computed.getPropertyPriority("accent-color")).toBe("");
	expect(test.computed.getPropertyValue("ACCENT-COLOR")).toBe("auto");
	expect(names(test.style)).toEqual(["accent-color"]);
	expect(test.style[0]).toBe("accent-color");
	expect(test.style[1]).toBeUndefined();
	expect(test.element.style).toBe(test.style);
	const revision = test.tree.revision;
	test.style.setProperty("accent-color", "auto", "important");
	expect(test.tree.revision).toBe(revision);
});

it("enumerates exactly 132 unique computed properties with one accent-color entry", () => {
	const test = fixture();
	const expected = [
		"accent-color",
		"align-content",
		"align-items",
		"align-self",
		"background-attachment",
		"background-clip",
		"background-color",
		"background-image",
		"background-origin",
		"background-position",
		"background-repeat",
		"background-size",
		"border-bottom-color",
		"border-bottom-left-radius",
		"border-bottom-right-radius",
		"border-bottom-style",
		"border-bottom-width",
		"border-collapse",
		"border-left-color",
		"border-left-style",
		"border-left-width",
		"border-right-color",
		"border-right-style",
		"border-right-width",
		"border-spacing",
		"border-top-color",
		"border-top-left-radius",
		"border-top-right-radius",
		"border-top-style",
		"border-top-width",
		"bottom",
		"box-sizing",
		"caption-side",
		"caret-color",
		"clear",
		"clip-path",
		"clip-rule",
		"color",
		"column-gap",
		"cursor",
		"display",
		"empty-cells",
		"fill",
		"fill-opacity",
		"fill-rule",
		"flex-basis",
		"flex-direction",
		"flex-grow",
		"flex-shrink",
		"flex-wrap",
		"float",
		"font-family",
		"font-size",
		"font-style",
		"font-weight",
		"grid-auto-columns",
		"grid-auto-flow",
		"grid-auto-rows",
		"grid-column-end",
		"grid-column-start",
		"grid-row-end",
		"grid-row-start",
		"grid-template-areas",
		"grid-template-columns",
		"grid-template-rows",
		"height",
		"hyphens",
		"justify-content",
		"left",
		"letter-spacing",
		"line-height",
		"list-style-image",
		"list-style-position",
		"list-style-type",
		"margin-block-end",
		"margin-block-start",
		"margin-bottom",
		"margin-inline-end",
		"margin-inline-start",
		"margin-left",
		"margin-right",
		"margin-top",
		"max-height",
		"max-width",
		"min-height",
		"min-width",
		"opacity",
		"order",
		"outline-color",
		"outline-offset",
		"outline-style",
		"outline-width",
		"overflow-wrap",
		"overflow-x",
		"overflow-y",
		"padding-block-end",
		"padding-block-start",
		"padding-bottom",
		"padding-inline-end",
		"padding-inline-start",
		"padding-left",
		"padding-right",
		"padding-top",
		"pointer-events",
		"position",
		"right",
		"row-gap",
		"stop-color",
		"stop-opacity",
		"stroke",
		"stroke-linecap",
		"stroke-linejoin",
		"stroke-miterlimit",
		"stroke-opacity",
		"stroke-width",
		"table-layout",
		"text-align",
		"text-decoration-color",
		"text-decoration-line",
		"text-decoration-style",
		"text-decoration-thickness",
		"text-indent",
		"text-transform",
		"text-underline-offset",
		"top",
		"vertical-align",
		"visibility",
		"white-space",
		"width",
		"word-break",
		"word-spacing",
		"z-index",
	];
	expect(computedStyleProperties).toHaveLength(132);
	expect(computedStyleProperties).toEqual(expected);
	expect(test.computed.length).toBe(132);
	expect(names(test.computed)).toEqual(expected);
	expect(new Set(names(test.computed)).size).toBe(132);
	expect(
		names(test.computed).filter((name) => name === "accent-color"),
	).toHaveLength(1);
	expect(
		inlineProperties.filter((name) => name === "accent-color"),
	).toHaveLength(1);
	expect(
		Array.from(
			{ length: test.computed.length },
			(_value, index) => test.computed[index],
		),
	).toEqual(expected);
	expect(test.computed.item(131)).toBe("z-index");
	expect(test.computed[131]).toBe("z-index");
	expect(test.computed.item(-1)).toBe("");
	expect(test.computed.item(132)).toBe("");
	expect(test.computed[132]).toBeUndefined();
});

it("keeps custom-property case and method spelling separate from the camel accessor", () => {
	const test = fixture(
		"accent-color:red;--accent-color:lime;--Accent-Color:blue",
	);
	expect(test.style.getPropertyValue("accentColor")).toBe("");
	expect(test.computed.getPropertyValue("accentColor")).toBe("");
	expect(resolvedStyleValue(test.tree, test.target, "ACCENT-COLOR")).toBe("");
	expect(test.style.getPropertyValue("--accent-color")).toBe("lime");
	expect(test.style.getPropertyValue("--Accent-Color")).toBe("blue");
	test.style.accentColor = "auto";
	expect(names(test.style)).toEqual([
		"accent-color",
		"--accent-color",
		"--Accent-Color",
	]);
});

it("honors stylesheet importance, inline setters and declaration source order", () => {
	const test = fixture(
		"accent-color:lime",
		"#target{accent-color:red!important}#target{accent-color:purple}",
	);
	expect(test.computed.accentColor).toBe("rgb(255, 0, 0)");
	test.style.setProperty("accent-color", "blue", "important");
	expect(test.computed.accentColor).toBe("rgb(0, 0, 255)");
	test.style.accentColor = "lime";
	expect(test.style.getPropertyPriority("accent-color")).toBe("");
	expect(test.computed.accentColor).toBe("rgb(255, 0, 0)");
	test.style.cssText =
		"accent-color:red!important;accent-color:blue;accent-color:lime!important;accent-color:nope";
	expect(test.style.cssText).toBe("accent-color: lime !important;");
	expect(test.computed.accentColor).toBe("rgb(0, 255, 0)");
});

it("preserves source, priority, revision and paint identity after invalid setter input", () => {
	const test = fixture("accent-color:lime!important");
	const source = test.tree.get(test.target).attributes.style;
	const cached = test.styles.paint(test.target);
	const revision = test.tree.revision;
	for (const value of [
		"none",
		"1px",
		"red blue",
		"red!important",
		"red;color:blue",
		"color(display-p3 1 0 0)",
	])
		test.style.accentColor = value;
	test.style.setProperty("accent-color", "red", "invalid");
	expect(test.tree.revision).toBe(revision);
	expect(test.tree.get(test.target).attributes.style).toBe(source);
	expect(test.styles.paint(test.target)).toBe(cached);
	expect(test.style.accentColor).toBe("lime");
	expect(test.style.getPropertyPriority("accent-color")).toBe("important");
	expect(test.computed.accentColor).toBe("rgb(0, 255, 0)");
});

it("removes or empties accent and restores inherited keyword semantics", () => {
	const test = fixture(
		"accent-color:red!important",
		"#outer{accent-color:currentcolor}",
	);
	expect(test.style.removeProperty("ACCENT-COLOR")).toBe("red");
	expect(test.style.accentColor).toBe("");
	expect(test.style.getPropertyPriority("accent-color")).toBe("");
	expect(test.computed.accentColor).toBe("currentcolor");
	test.style.accentColor = "lime";
	test.style.setProperty("accent-color", "", "invalid");
	expect(test.style.length).toBe(0);
	test.style.accentColor = "red";
	Reflect.set(test.style, "accentColor", null);
	expect(test.style.length).toBe(0);
	expect(test.computed.accentColor).toBe("currentcolor");
});

it("retains variable source with inherited tokens, live substitution and invalid-computed fallback", () => {
	const test = fixture(
		"accent-color:var(--accent)",
		"#outer{--accent:currentcolor;accent-color:lime}",
	);
	expect(test.style.accentColor).toBe("var(--accent)");
	expect(test.computed.accentColor).toBe("currentcolor");
	test.style.setProperty("--accent", "#00ff0080");
	expect(test.computed.accentColor).toBe("rgba(0, 255, 0, 0.502)");
	test.style.accentColor = "var(--missing,auto)";
	expect(test.computed.accentColor).toBe("auto");
	test.style.accentColor = "var(--missing,transparent)";
	expect(test.computed.accentColor).toBe("rgba(0, 0, 0, 0)");
	test.style.accentColor = "var(--absent)";
	expect(test.computed.accentColor).toBe("rgb(0, 255, 0)");
	test.style.setProperty("--bad", "not-a-color");
	test.style.accentColor = "var(--bad)";
	expect(test.computed.accentColor).toBe("rgb(0, 255, 0)");
});

it.each([
	["initial", "auto"],
	["inherit", "rgb(0, 255, 0)"],
	["unset", "rgb(0, 255, 0)"],
	["revert", "rgb(0, 255, 0)"],
])(
	"includes accent-color in all:%s without resetting custom properties",
	(keyword, expected) => {
		const test = fixture(
			`--saved:purple;accent-color:red;all:${keyword};color:blue`,
			"#outer{accent-color:lime}",
		);
		expect(test.style.accentColor).toBe(keyword);
		expect(test.style.getPropertyValue("--saved")).toBe("purple");
		expect(test.computed.accentColor).toBe(expected);
		test.style.setProperty("accent-color", "purple", "important");
		test.style.setProperty("all", "initial");
		expect(test.computed.accentColor).toBe("auto");
		const entries = parseInlineDeclarations(
			"accent-color:purple!important;all:initial",
			256,
		);
		expect(entries.find((entry) => entry.name === "accent-color")).toEqual({
			name: "accent-color",
			value: "purple",
			important: true,
		});
	},
);

it("updates saved computed state after stylesheet, ancestor and target mutations", () => {
	const test = fixture("", "#outer{accent-color:lime}");
	expect(test.computed.accentColor).toBe("rgb(0, 255, 0)");
	test.tree.setAttribute(
		test.id("#outer"),
		"style",
		"accent-color:currentcolor;color:red",
	);
	expect(test.computed.accentColor).toBe("currentcolor");
	test.tree.setAttribute(
		test.target,
		"style",
		"accent-color:transparent!important",
	);
	expect(test.style.accentColor).toBe("transparent");
	expect(test.computed.accentColor).toBe("rgba(0, 0, 0, 0)");
	test.style.removeProperty("accent-color");
	const text = test.tree.get(test.id("#sheet")).children[0];
	test.tree.setData(text, "#target{color:purple;accent-color:auto}");
	expect(test.computed.accentColor).toBe("auto");
	expect(test.element.style).toBe(test.style);
});

it("uses native @supports to choose accepted accent declarations", () => {
	const test = fixture(
		"",
		"#target{accent-color:red}@supports(accent-color:auto){#target{accent-color:lime}}@supports(accent-color:color(display-p3 1 0 0)){#target{accent-color:purple}}",
	);
	expect(
		cssSupportsCondition("(accent-color:auto) and (accent-color:currentcolor)"),
	).toBe(true);
	expect(test.computed.accentColor).toBe("rgb(0, 255, 0)");
});

it("rejects coercion and readonly computed writes before changing native state", () => {
	const test = fixture("accent-color:red");
	let calls = 0;
	const value = {
		toString() {
			calls++;
			return "lime";
		},
	};
	for (const operation of [
		() => Reflect.set(test.style, "accentColor", value),
		() => test.style.setProperty("accent-color", value),
		() => test.style.getPropertyValue(value),
		() => test.computed.getPropertyValue(value),
	])
		expect(operation).toThrow("coercion");
	expect(calls).toBe(0);
	for (const operation of [
		() => Reflect.set(test.computed, "accentColor", "lime"),
		() => Reflect.set(test.computed, "accent-color", "lime"),
		() => test.computed.setProperty("accent-color", "lime"),
		() => test.computed.removeProperty("accent-color"),
	])
		expect(operation).toThrow("read-only");
	expect(test.style.accentColor).toBe("red");
	expect(test.computed.accentColor).toBe("rgb(255, 0, 0)");
});

it("keeps detached inline style live and restores computed values on reattachment", () => {
	const test = fixture("accent-color:red");
	const parent = test.tree.get(test.target).parent;
	if (parent === null) throw new Error("Missing parent");
	test.tree.remove(test.target);
	expect(test.style.accentColor).toBe("red");
	expect(test.computed.accentColor).toBe("");
	expect(test.computed.length).toBe(0);
	test.style.accentColor = "currentcolor";
	test.tree.append(parent, test.target);
	expect(test.computed.accentColor).toBe("currentcolor");
	expect(test.computed.length).toBe(132);
});

it.each(["document", "dom"])(
	"revokes saved accent accessors and methods on %s close",
	(kind) => {
		const test = fixture("accent-color:red");
		if (kind === "document") test.tree.close();
		else test.dom.close();
		for (const operation of [
			() => test.style.accentColor,
			() => test.style["accent-color"],
			() => Reflect.set(test.style, "accentColor", "lime"),
			() => test.style.getPropertyValue("accent-color"),
			() => test.style.removeProperty("accent-color"),
			() => test.computed.accentColor,
			() => test.computed["accent-color"],
			() => test.computed.getPropertyValue("accent-color"),
		])
			expect(operation).toThrow(/closed/i);
		if (kind === "document")
			expect(() =>
				resolvedStyleValue(test.tree, test.target, "accent-color"),
			).toThrow(/closed/i);
	},
);
