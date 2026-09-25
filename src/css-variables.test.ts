import { expect, it } from "vitest";
import {
	cssVariableLimits,
	customPropertyName,
	parseVariableValue,
	resolveCustomProperties,
	splitCssValue,
	substituteVariables,
} from "./css-variables.js";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

function resolve(
	input: Record<string, string>,
	parent = new Map<string, string | null>(),
) {
	return resolveCustomProperties(
		new Map(Object.entries(input)),
		parent,
		() => {},
	);
}
function substitute(source: string, input: Record<string, string> = {}) {
	const parsed = parseVariableValue(source);
	if (!parsed) throw new Error("Invalid fixture");
	const values = resolve(input);
	return substituteVariables(
		parsed,
		(name) => values.get(name) ?? null,
		() => {},
	);
}
function fixture(
	css: string,
	html = '<main id="parent"><div id="target">Text</div></main>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}${css}</style><body>${html}`,
		"https://fixture.invalid/variables",
	);
	const styles = documentStyles(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing fixture node");
		return found;
	};
	return {
		tree,
		styles,
		id,
		read: (name: string) => resolvedStyleValue(tree, id("#target"), name),
	};
}

it.each([
	["var(--color)", { "--color": "red" }, "red"],
	["var(--missing, blue)", {}, "blue"],
	["var(--missing, var(--other, green))", {}, "green"],
	["var(--missing,)", {}, ""],
	["var(--empty, blue)", { "--empty": "" }, ""],
	["var(--missing)", {}, null],
	["rgb(var(--red),0,0)", { "--red": "128" }, "rgb(128,0,0)"],
	["var(--missing, red, blue)", {}, "red, blue"],
	["var(--size)px", { "--size": "10" }, "10/**/px"],
	[
		"var(--first)var(--second)",
		{ "--first": "red", "--second": "blue" },
		"red/**/blue",
	],
	["10var(--empty)px", { "--empty": "" }, "10var(--empty)px"],
	['"var(--color)"', { "--color": "red" }, '"var(--color)"'],
	["/* var(--color) */ blue", { "--color": "red" }, "/* var(--color) */ blue"],
	["VAR(--Color)", { "--Color": "red", "--color": "blue" }, "red"],
	["v\\61r(--Color)", { "--Color": "red" }, "red"],
	["var(--\\43 olor)", { "--Color": "red" }, "red"],
	["var(var(--name))", { "--name": "--Color", "--Color": "red" }, "red"],
])(
	"substitutes component values without merging tokens: %s",
	(source, values, expected) => {
		expect(substitute(source as string, values as Record<string, string>)).toBe(
			expected,
		);
	},
);

it.each([
	"var(--x",
	"var(,red)",
	"var(--x;red)",
	"var(--x, red!important)",
	"var(--x)]",
	'"unterminated',
	"url(a b)",
	"url(var(--x))",
	"red;blue",
	"red!important",
])("rejects malformed variable components: %s", (source) => {
	expect(parseVariableValue(source)).toBeUndefined();
});

it("preserves quoted delimiters, comments and complex non-var components", () => {
	const value =
		'foo({text: "a;b"}) /* retained */ url("https://fixture.invalid/a;b")';
	expect(substitute(value)).toBe(value);
	expect(splitCssValue(`${value} !/**/ImPoRtAnT`)).toEqual({
		value,
		important: true,
	});
});

it("matches custom property names case-sensitively including Unicode and escapes", () => {
	expect(customPropertyName("--Theme")).toBe("--Theme");
	expect(customPropertyName("--色")).toBe("--色");
	expect(customPropertyName("--\\54 heme")).toBe("--Theme");
	expect(customPropertyName("--")).toBeUndefined();
	expect(customPropertyName("--two names")).toBeUndefined();
});

it("invalidates cyclic members without poisoning consumers that have fallbacks", () => {
	const values = resolve({
		"--consumer": "var(--first, blue)",
		"--first": "var(--second, red)",
		"--second": "var(--first, green)",
		"--independent": "black",
	});
	expect(values.get("--first")).toBeNull();
	expect(values.get("--second")).toBeNull();
	expect(values.get("--consumer")).toBe("blue");
	expect(values.get("--independent")).toBe("black");
});

it("does not evaluate cycles in unused fallbacks", () => {
	const values = resolve({
		"--safe": "blue",
		"--first": "var(--safe, var(--second))",
		"--second": "var(--safe, var(--third))",
		"--third": "var(--safe, var(--first))",
	});
	for (const value of values.values()) expect(value).toBe("blue");
});

it("discovers overlapping and later cyclic branches even when an earlier component is invalid", () => {
	const values = resolve({
		"--consumer": "var(--first, blue)",
		"--first": "var(--second) var(--third)",
		"--second": "var(--first)",
		"--third": "var(--fourth)",
		"--fourth": "var(--first)",
	});
	for (const name of ["--first", "--second", "--third", "--fourth"])
		expect(values.get(name)).toBeNull();
	expect(values.get("--consumer")).toBe("blue");
});

it("resolves inherited values on the parent before applying child overrides", () => {
	const parent = resolve({ "--width": "20px", "--alias": "var(--width)" });
	const child = resolveCustomProperties(
		new Map([["--width", "40px"]]),
		parent,
		() => {},
	);
	expect(child.get("--alias")).toBe("20px");
	expect(child.get("--width")).toBe("40px");
	expect(parent.get("--width")).toBe("20px");
});

it("supports unregistered initial/inherit/unset/revert and valid empty values", () => {
	const parent = new Map([["--value", "red"]]);
	for (const keyword of [
		"inherit",
		"unset",
		"revert",
		"revert-layer",
		"\\69nherit",
	])
		expect(resolve({ "--value": keyword }, parent).get("--value")).toBe("red");
	expect(resolve({ "--value": "initial" }, parent).get("--value")).toBeNull();
	expect(
		resolve({ "--value": "\\69nitial" }, parent).get("--value"),
	).toBeNull();
	expect(resolve({ "--value": "" }, parent).get("--value")).toBe("");
});

it("bounds output expansion and dependency depth without evaluating guest code", () => {
	const bomb: Record<string, string> = { "--part0": "abcdefgh" };
	for (let index = 1; index < 20; index++)
		bomb[`--part${index}`] = `var(--part${index - 1}) var(--part${index - 1})`;
	expect(() => resolve(bomb)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const deep: Record<string, string> = {};
	for (let index = 0; index < 130; index++)
		deep[`--part${index}`] = `var(--part${index + 1})`;
	expect(() => resolve(deep)).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() =>
		parseVariableValue(" ".repeat(cssVariableLimits.maxValueCodeUnits + 1)),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("bounds property count and component nesting", () => {
	expect(() =>
		resolve(
			Object.fromEntries(
				Array.from({ length: 513 }, (_value, index) => [
					`--name${index}`,
					"red",
				]),
			),
		),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	expect(() =>
		parseVariableValue(`${"(".repeat(33)}x${")".repeat(33)}`),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("uses custom properties in native geometry, paint, text and visibility", () => {
	const { tree, read } = fixture(
		":root{--Width:90px;--Height:30px;--Color:blue;--Font:8px;--Display:block}#target{width:var(--Width);height:var(--Height);background:var(--Color);font-size:var(--Font);display:var(--Display)}",
	);
	expect(read("width")).toBe("90px");
	expect(read("height")).toBe("30px");
	expect(read("background-color")).toBe("rgb(0, 0, 255)");
	expect(read("font-size")).toBe("8px");
	expect(read("display")).toBe("block");
	tree.close();
});

it("applies invalid-at-computed-value rules rather than reviving a lower declaration", () => {
	const { tree, read } = fixture(
		"#parent{color:red}#target{color:blue;color:var(--missing);width:20px;width:var(--bad,red);display:none;display:var(--missing)}",
	);
	expect(read("color")).toBe("rgb(255, 0, 0)");
	expect(read("display")).toBe("inline");
	expect(read("width")).toBe("auto");
	tree.close();
});

it("resolves shorthand tokens only after substitution and preserves longhand cascade precedence", () => {
	const { tree, styles, id, read } = fixture(
		":root{--space:2px 4px;--edge:3px solid red}#target{margin:var(--space);margin-left:9px;border:var(--edge);border-top-width:5px;width:50px;height:20px}",
	);
	expect(styles.box(id("#target"))["margin-right"]).toBe("4px");
	expect(styles.box(id("#target"))["margin-left"]).toBe("9px");
	expect(read("border-right-width")).toBe("3px");
	expect(read("border-top-width")).toBe("5px");
	tree.close();
});

it("uses fallback only for invalid/missing variables, not invalid target-property values", () => {
	const { tree, read } = fixture(
		":root{--color:20px}#parent{color:red}#target{color:var(--color,blue);background-color:var(--missing,blue)}",
	);
	expect(read("color")).toBe("rgb(255, 0, 0)");
	expect(read("background-color")).toBe("rgb(0, 0, 255)");
	tree.close();
});

it("cascades custom names by specificity, importance, source order and inline style", () => {
	const { tree, read } = fixture(
		"#target{--Color:red!important}.item{--Color:green}#target{color:var(--Color)}",
		'<div id="target" class="item" style="--Color:blue">Text</div>',
	);
	expect(read("--Color")).toBe("red");
	expect(read("--color")).toBe("");
	expect(read("color")).toBe("rgb(255, 0, 0)");
	tree.close();
});

it("does not reset inherited custom properties through all", () => {
	const { tree, read } = fixture(
		":root{--Theme:blue}#target{all:initial;color:var(--Theme)}",
	);
	expect(read("--Theme")).toBe("blue");
	expect(read("color")).toBe("rgb(0, 0, 255)");
	tree.close();
});

it("invalidates shared geometry and raster after a custom-property mutation", () => {
	const { tree, styles, id, read } = fixture(
		":root{--size:20px;--color:red}#target{width:var(--size);height:20px;background:var(--color)}",
	);
	styles.setViewport(100, 50);
	const before = rasterizeDocument(tree).image.pixels.slice();
	expect(read("width")).toBe("20px");
	tree.setAttribute(id("html"), "style", "--size:60px;--color:blue");
	expect(read("width")).toBe("60px");
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
	expect(documentGeometry(tree).getUsedStyle(id("#target"))?.width).toBe(60);
	tree.close();
});

it("rebuilds inherited variable scopes after reparenting", () => {
	const { tree, id, read } = fixture(
		"#left{--theme:red}#right{--theme:blue}#target{color:var(--theme)}",
		'<div id="left"><span id="target">Text</span></div><div id="right"></div>',
	);
	expect(read("color")).toBe("rgb(255, 0, 0)");
	tree.append(id("#right"), id("#target"));
	expect(read("color")).toBe("rgb(0, 0, 255)");
	tree.close();
});

it("changes variable declarations with viewport media conditions", () => {
	const { tree, styles, read } = fixture(
		":root{--theme:red}@media(min-width:200px){:root{--theme:blue}}#target{color:var(--theme)}",
	);
	styles.setViewport(100, 100);
	expect(read("color")).toBe("rgb(255, 0, 0)");
	styles.setViewport(300, 100);
	expect(read("color")).toBe("rgb(0, 0, 255)");
	tree.close();
});

it("charges resolution work and revokes custom reads on close", () => {
	const { tree, id } = fixture(
		":root{--first:blue;--second:var(--first)}#target{color:var(--second)}",
	);
	const limited = new DocumentStyles(tree, { maxWork: 1 });
	expect(() => limited.custom(id("#target"), "--second")).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	limited.close();
	expect(() => limited.custom(id("#target"), "--second")).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
	tree.close();
});

it("bounds retained scoped bindings and recovers from a failed rebuild without stale values", () => {
	const { tree, id, read } = fixture(
		"#target{--theme:blue;color:var(--theme)}",
		`<div id="target" class="scope">Text</div>${'<div class="scope"></div>'.repeat(35)}`,
	);
	expect(read("--theme")).toBe("blue");
	const source = `.scope{${Array.from({ length: 512 }, (_value, index) => `--value${index}:red`).join(";")}}`;
	tree.setTextContent(id("style"), source);
	expect(() => read("--theme")).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => read("--theme")).toThrow(
		"CSS variable retention limit exceeded",
	);
	tree.setTextContent(id("style"), "#target{--theme:green;color:var(--theme)}");
	expect(read("--theme")).toBe("green");
	expect(read("color")).toBe("rgb(0, 128, 0)");
	tree.close();
});

it("bounds retained computed text even with few variable names", () => {
	const { tree, read } = fixture(
		`.scope{--payload:${"x".repeat(60_000)}}`,
		`<div id="target" class="scope">Text</div>${'<div class="scope"></div>'.repeat(35)}`,
	);
	expect(() => read("--payload")).toThrow(
		"CSS variable retention limit exceeded",
	);
	tree.close();
});

it("preserves cycle outcomes across independent declaration orders", () => {
	const definitions: [string, string][] = [
		["--consumer", "var(--first, blue)"],
		["--first", "var(--second, red)"],
		["--second", "var(--first, green)"],
	];
	for (const order of [
		[0, 1, 2],
		[0, 2, 1],
		[1, 0, 2],
		[1, 2, 0],
		[2, 0, 1],
		[2, 1, 0],
	]) {
		const values = resolveCustomProperties(
			new Map(order.map((index) => definitions[index])),
			new Map(),
			() => {},
		);
		expect(values.get("--first")).toBeNull();
		expect(values.get("--second")).toBeNull();
		expect(values.get("--consumer")).toBe("blue");
	}
});

it("normalizes priority comments without treating quoted punctuation as a priority", () => {
	expect(splitCssValue('"!important"')).toEqual({
		value: '"!important"',
		important: false,
	});
	expect(splitCssValue("blue !/* priority */IMPORTANT")).toEqual({
		value: "blue",
		important: true,
	});
	expect(splitCssValue("blue!important!important")).toBeUndefined();
	expect(splitCssValue("blue;display:none")).toBeUndefined();
});

it("uses and invalidates variables from an external sheet through the existing style owner", () => {
	const { tree, styles, id, read } = fixture(
		"#target{color:var(--theme,red)}",
		'<link id="sheet" rel="stylesheet" href="/theme.css"><div id="target">Text</div>',
	);
	styles.setExternalSheet(
		id("#sheet"),
		"https://fixture.invalid/theme.css",
		":root{--theme:blue}",
	);
	expect(read("color")).toBe("rgb(0, 0, 255)");
	tree.setAttribute(id("#sheet"), "disabled", "");
	expect(read("color")).toBe("rgb(255, 0, 0)");
	tree.close();
});

it("bounds combined component and dependency recursion rather than multiplying independent depths", () => {
	const values = new Map<string, string>();
	for (let index = 0; index < 60; index++)
		values.set(
			`--value${index}`,
			`${"function(".repeat(20)}var(--value${index + 1})${")".repeat(20)}`,
		);
	values.set("--value60", "red");
	expect(() =>
		resolveCustomProperties(values, new Map(), () => {}),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
	const oversizedParent = new Map(
		Array.from({ length: 513 }, (_value, index) => [`--value${index}`, "red"]),
	);
	expect(() =>
		resolveCustomProperties(new Map(), oversizedParent, () => {}),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});
