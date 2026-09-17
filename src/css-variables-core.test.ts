import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import {
	cssVariableLimits,
	customPropertyName,
	parseVariableValue,
	resolveCustomProperties,
	substituteVariables,
} from "./css-variables.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

interface Style {
	length: number;
	cssText: string;
	getPropertyValue(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
	item(index: number): string;
}
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		if (definition.indexed)
			Object.defineProperty(target, "length", {
				get: definition.indexed.length,
			});
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value });
		return target;
	},
};
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(css = "", content = '<div id="target">Text</div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}main{width:200px}${css}</style><main id="parent">${content}</main>`,
		"https://fixture.invalid/variables-core",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(300, 100);
	return {
		tree,
		id,
		styles,
		read: (name: string) => resolvedStyleValue(tree, id(), name),
		inline: () => new InlineStyles(tree, factory).get(id()) as Style,
		computed: () => new ComputedStyles(tree, factory).get(id()) as Style,
	};
}
function resolve(source: Record<string, string>) {
	return resolveCustomProperties(
		new Map(Object.entries(source)),
		new Map(),
		() => {},
	);
}

it.each([
	["--base", "red"],
	["--base", "inherit"],
	["--base", "unset"],
	["--base", "revert"],
	["--base", "revert-layer"],
	["--alias", "var(--base)"],
	["--invalid", "initial"],
	["--invalid", "var(--invalid)"],
	["--empty", ""],
] as const)(
	"shares unchanged inherited custom bindings for %s: %s",
	(name, value) => {
		const parent = new Map<string, string | null>([
			["--base", "red"],
			["--alias", "red"],
			["--invalid", null],
			["--empty", ""],
		]);
		let work = 0;
		const computed = resolveCustomProperties(
			new Map([[name, value]]),
			parent,
			(amount) => {
				work += amount;
			},
		);
		expect(computed).toBe(parent);
		expect(work).toBeGreaterThan(parent.size);
	},
);

it.each([
	["--base", "blue", "blue"],
	["--base", "RED", "RED"],
	["--base", "var(--base)", null],
	["--new", "initial", null],
	["--invalid", "", ""],
] as const)(
	"keeps distinct custom maps for changed or new %s: %s",
	(name, value, expected) => {
		const parent = new Map<string, string | null>([
			["--base", "red"],
			["--alias", "red"],
			["--invalid", null],
		]);
		const before = [...parent];
		const computed = resolveCustomProperties(
			new Map([[name, value]]),
			parent,
			() => {},
		);
		expect(computed).not.toBe(parent);
		expect(computed.has(name)).toBe(true);
		expect(computed.get(name)).toBe(expected);
		expect(computed.get("--alias")).toBe("red");
		expect([...parent]).toEqual(before);
	},
);

it("does not retain duplicate inherited theme maps across wildcard redeclarations", () => {
	const theme = Array.from(
		{ length: 100 },
		(_value, index) => `--v${index}:red`,
	).join(";");
	const { tree, id, read, styles } = fixture(
		`:root{${theme};--theme:red;--alias:var(--theme)}:root *{--theme:red;--alias:var(--theme)}#changed{--theme:blue}`,
		`<div id=target>Text</div>${"<span></span>".repeat(200)}<section id=changed><span id=reset></span></section>`,
	);
	expect(read("--theme")).toBe("red");
	expect(read("--alias")).toBe("red");
	expect(styles.custom(id("#changed"), "--theme")).toBe("blue");
	expect(styles.custom(id("#changed"), "--alias")).toBe("blue");
	expect(styles.custom(id("#reset"), "--theme")).toBe("red");
	expect(styles.customNames(id()).length).toBe(102);
	tree.setAttribute(id(), "style", "--theme:green");
	expect(read("--theme")).toBe("green");
	expect(read("--alias")).toBe("green");
	tree.removeAttribute(id(), "style");
	expect(read("--theme")).toBe("red");
});

it("bounds repeated unchanged variable resolution", () => {
	const payload = "token".repeat(500);
	const { tree, id } = fixture(
		`#parent{--theme:${payload};--alias:var(--theme)}#parent *{--alias:var(--theme)}`,
		`<div id=target></div>${"<span></span>".repeat(200)}`,
	);
	const limited = new DocumentStyles(tree, { maxWork: 150_000 });
	expect(limited.custom(id(), "--alias")).toBe(payload);
	expect(limited.metrics().work).toBeLessThan(150_000);
	limited.close();
});

it("keys unchanged declaration reuse by both parent values and winning declarations", () => {
	const { tree, id, styles } = fixture(
		"#parent{--theme:red;--alias:red}.same{--alias:var(--theme)}.different{--alias:blue}#blue{--theme:blue}",
		"<span id=target class=same></span><span id=different class=different></span><section id=blue><span id=inside class=same></span></section><span id=after class=same></span>",
	);
	expect(styles.custom(id(), "--alias")).toBe("red");
	expect(styles.custom(id("#different"), "--alias")).toBe("blue");
	expect(styles.custom(id("#inside"), "--alias")).toBe("blue");
	expect(styles.custom(id("#after"), "--alias")).toBe("red");
	tree.setAttribute(id("#parent"), "style", "--theme:green;--alias:green");
	expect(styles.custom(id(), "--alias")).toBe("green");
	expect(styles.custom(id("#inside"), "--alias")).toBe("blue");
	expect(styles.custom(id("#after"), "--alias")).toBe("green");
});

it.each([
	["var(--value)", { "--value": "red" }, "red"],
	["var(--missing, blue)", {}, "blue"],
	["var(--empty, blue)", { "--empty": "" }, ""],
	["var(--missing,)", {}, ""],
	["var(--missing, var(--other, green))", {}, "green"],
	["var(var(--name))", { "--name": "--value", "--value": "red" }, "red"],
	["var(--number)px", { "--number": "10" }, "10/**/px"],
	['"var(--missing)"', {}, '"var(--missing)"'],
	["var(--missing)", {}, null],
] as const)(
	"substitutes native components without token merging: %s",
	(source, input, expected) => {
		const parsed = parseVariableValue(source);
		expect(parsed).toBeDefined();
		if (!parsed) throw new Error("Invalid fixture value");
		const values = resolve(input);
		expect(
			substituteVariables(
				parsed,
				(name) => values.get(name) ?? null,
				() => {},
			),
		).toBe(expected);
	},
);

it.each([
	"#var(--self)",
	"@var(--self)",
	"#VAR(--self)",
	"@VAR(--self)",
	"#\\76 ar(--self)",
	"@v\\61r(--self)",
])(
	"preserves hash and at-keyword tokens without false cycles: %s",
	(source) => {
		const parsed = parseVariableValue(source);
		expect(parsed?.variables).toBe(false);
		const values = resolve({ "--self": source, "--alias": "var(--self)" });
		expect(values.get("--self")).toBe(source);
		expect(values.get("--alias")).toBe(source);
	},
);

it.each(["#var", "@var", "#url", "@url"])(
	"still substitutes real functions inside the block following %s",
	(prefix) => {
		const values = resolve({
			"--value": "20px",
			"--result": `${prefix}(var(--value))`,
		});
		expect(values.get("--result")).toBe(`${prefix}(20px)`);
	},
);

it.each(["#/**/", "# ", "@/**/", "@ "])(
	"keeps a separated delimiter distinct from a real var function: %s",
	(prefix) => {
		const values = resolve({
			"--value": "20px",
			"--result": `${prefix}var(--value)`,
		});
		expect(values.get("--result")).toBe(`${prefix}20px`);
	},
);

it.each(["#var", "@var"])(
	"does not select a fallback for a valid custom value beginning with %s",
	(prefix) => {
		const { tree, id, read } = fixture(
			`#parent{color:red}#target{display:block;--Shape:${prefix}(--Shape);width:var(--Shape,20px);height:20px;border:1px solid red;color:var(--Shape,blue);background:var(--Shape,blue)}`,
		);
		expect(read("--Shape")).toBe(`${prefix}(--Shape)`);
		expect(read("color")).toBe("rgb(255, 0, 0)");
		expect(documentStyles(tree).box(id()).width).toBe("auto");
		expect(read("width")).toBe("198px");
		expect(read("background-color")).toBe("rgba(0, 0, 0, 0)");
		expect(documentGeometry(tree).getBoundingClientRect(id()).width).toBe(200);
		const before = rasterizeDocument(tree).image.pixels.slice();
		const style = new InlineStyles(tree, factory).get(id()) as Style;
		style.setProperty("--Shape", "40px");
		expect(read("width")).toBe("40px");
		expect(documentGeometry(tree).getBoundingClientRect(id()).width).toBe(42);
		expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
		style.setProperty("--Shape", `${prefix}(--Shape)`);
		expect(read("width")).toBe("198px");
		expect(rasterizeDocument(tree).image.pixels).toEqual(before);
	},
);

it.each(["--Theme", "--theme", "--東京", "--\\54 heme"])(
	"supports case-sensitive and escaped custom name %s",
	(name) => {
		expect(customPropertyName(name)).toBeDefined();
		const { read } = fixture(`#target{${name}:blue;color:var(${name})}`);
		expect(read("color")).toBe("rgb(0, 0, 255)");
	},
);

it.each([
	[0, 1, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0],
])(
	"invalidates cyclic members independently of declaration order %s",
	(first, second, third) => {
		const entries = [
			["--consumer", "var(--first, blue)"],
			["--first", "var(--second, red)"],
			["--second", "var(--first, green)"],
		];
		const values = resolve(
			Object.fromEntries([first, second, third].map((index) => entries[index])),
		);
		expect(values.get("--first")).toBeNull();
		expect(values.get("--second")).toBeNull();
		expect(values.get("--consumer")).toBe("blue");
	},
);

it("does not evaluate an unused fallback cycle", () => {
	const values = resolve({
		"--base": "red",
		"--value": "var(--base, var(--value))",
	});
	expect(values.get("--value")).toBe("red");
});

it("visits later cyclic references after an invalid earlier component", () => {
	const values = resolve({
		"--first": "var(--missing) var(--second)",
		"--second": "var(--first, red)",
		"--consumer": "var(--second, blue)",
	});
	expect(values.get("--first")).toBeNull();
	expect(values.get("--second")).toBeNull();
	expect(values.get("--consumer")).toBe("blue");
});

it("preserves inherited computed aliases when a child overrides the source", () => {
	const { read } = fixture(
		"#parent{--base:red;--alias:var(--base)}#target{--base:blue;color:var(--alias)}",
	);
	expect(read("--alias")).toBe("red");
	expect(read("--base")).toBe("blue");
	expect(read("color")).toBe("rgb(255, 0, 0)");
});

it.each(["inherit", "unset", "revert", "revert-layer"])(
	"resolves an unregistered %s custom value against its parent",
	(keyword) => {
		const { read } = fixture(
			`#parent{--value:blue}#target{--value:${keyword};color:var(--value)}`,
		);
		expect(read("color")).toBe("rgb(0, 0, 255)");
	},
);

it("handles initial and valid empty custom values distinctly", () => {
	const { read } = fixture(
		"#target{--bad:initial;--empty:;color:var(--bad,red)}",
	);
	expect(read("--bad")).toBe("");
	expect(read("--empty")).toBe(" ");
	expect(read("color")).toBe("rgb(255, 0, 0)");
});

it("uses cascade winners and does not revive invalid computed declarations", () => {
	const { read, styles, id } = fixture(
		"#parent{color:green}#target{--bad:10px;color:red;color:var(--bad,blue);width:12px;width:var(--missing)}",
	);
	expect(read("color")).toBe("rgb(0, 128, 0)");
	expect(styles.box(id()).width).toBe("auto");
});

it("resolves pending shorthand components only after the longhand cascade", () => {
	const { read } = fixture(
		"#target{--space:2px 4px;margin:var(--space);margin-left:9px;padding-left:8px;padding:var(--missing)}",
	);
	expect(read("margin-top")).toBe("2px");
	expect(read("margin-right")).toBe("4px");
	expect(read("margin-left")).toBe("9px");
	expect(read("padding-left")).toBe("0px");
});

it("does not reset custom values through all", () => {
	const { read } = fixture(
		"#parent{--value:blue}#target{all:initial;color:var(--value)}",
	);
	expect(read("--value")).toBe("blue");
	expect(read("color")).toBe("rgb(0, 0, 255)");
});

it("applies specificity, importance and case-sensitive inline overrides", () => {
	const { read } = fixture(
		"main{--Theme:green}div{--Theme:red}#target{--Theme:blue!important;--theme:navy;color:var(--Theme)}",
		'<div id="target" style="--Theme:purple;--theme:teal">Text</div>',
	);
	expect(read("color")).toBe("rgb(0, 0, 255)");
	expect(read("--theme")).toBe("teal");
});

it("invalidates variable-sized geometry and software pixels", () => {
	const { tree, id, read } = fixture(
		"#parent{--size:20px;--color:red}#target{width:var(--size);height:20px;background:var(--color)}",
	);
	const before = rasterizeDocument(tree).image.pixels.slice();
	expect(read("width")).toBe("20px");
	tree.setAttribute(id("#parent"), "style", "--size:60px;--color:blue");
	expect(read("width")).toBe("60px");
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
});

it("recomputes variable scope on reparenting", () => {
	const { tree, id, read } = fixture(
		"#left{--theme:red}#right{--theme:blue}#target{color:var(--theme)}",
		'<div id="left"><span id="target">Text</span></div><div id="right"></div>',
	);
	expect(read("color")).toBe("rgb(255, 0, 0)");
	tree.append(id("#right"), id());
	expect(read("color")).toBe("rgb(0, 0, 255)");
});

it("recomputes media-dependent variable scopes", () => {
	const { styles, read } = fixture(
		":root{--theme:red}@media(min-width:200px){:root{--theme:blue}}#target{color:var(--theme)}",
	);
	expect(read("color")).toBe("rgb(0, 0, 255)");
	styles.setViewport(100, 100);
	expect(read("color")).toBe("rgb(255, 0, 0)");
});

it("invalidates variables from external sheets without fetching", () => {
	const { tree, id, styles, read } = fixture(
		"#target{color:var(--theme)}",
		'<link id="sheet" rel="stylesheet" href="/theme.css"><div id="target">Text</div>',
	);
	styles.setExternalSheet(
		id("#sheet"),
		"https://fixture.invalid/theme.css",
		":root{--theme:red}",
	);
	expect(read("color")).toBe("rgb(255, 0, 0)");
	styles.setExternalSheet(
		id("#sheet"),
		"https://fixture.invalid/theme.css",
		":root{--theme:blue}",
	);
	expect(read("color")).toBe("rgb(0, 0, 255)");
	tree.setAttribute(id("#sheet"), "disabled", "");
	expect(read("--theme")).toBe("");
});

it("connects custom tokens to the committed CSS math path", () => {
	const { read, inline } = fixture(
		"#parent{--gap:20px}#target{width:calc(100% - var(--gap))}",
	);
	expect(read("width")).toBe("180px");
	inline().setProperty("--gap", "50px");
	expect(read("width")).toBe("150px");
});

it("keeps variable CSSOM reads live while preserving shorthand source", () => {
	const { read, inline } = fixture(
		"",
		'<div id="target" style="--space:2px 4px;margin:var(--space)">Text</div>',
	);
	const style = inline();
	expect(style.getPropertyValue("margin")).toBe("var(--space)");
	style.setProperty("--space", "6px 8px");
	expect(read("margin-right")).toBe("8px");
	expect(style.getPropertyValue("margin")).toBe("var(--space)");
	expect(style.getPropertyValue("margin-top")).toBe("");
	style.setProperty("margin-left", "10px");
	expect(read("margin-left")).toBe("10px");
	expect(read("margin-top")).toBe("6px");
});

it("supports complete replacement and removal of pending shorthands", () => {
	const { read, inline } = fixture(
		"",
		'<div id="target" style="--space:2px;margin:var(--space)">Text</div>',
	);
	const style = inline();
	style.setProperty("margin", "4px");
	expect(read("margin-top")).toBe("4px");
	style.setProperty("margin", "var(--space)");
	expect(style.removeProperty("margin")).toBe("var(--space)");
	expect(read("margin-top")).toBe("0px");
});

it("removes a pending component while preserving the other native slots", () => {
	const { tree, id, inline } = fixture(
		"",
		'<div id="target" style="margin:var(--space)">Text</div>',
	);
	const style = inline();
	expect(style.removeProperty("margin-left")).toBe("");
	expect(style.length).toBe(3);
	expect(tree.getInlineDeclarations(id())).toHaveLength(3);
});

it("lowers one unresolved important component without changing its peers", () => {
	const { tree, id, inline } = fixture(
		"",
		'<div id="target" style="margin:var(--space)!important">Text</div>',
	);
	const style = inline();
	style.setProperty("margin-left", "3px");
	expect(style.getPropertyValue("margin-left")).toBe("3px");
	expect(tree.getInlineDeclarations(id())).toMatchObject([
		{ name: "margin-top", important: true },
		{ name: "margin-right", important: true },
		{ name: "margin-bottom", important: true },
		{ name: "margin-left", important: false },
	]);
});

it("keeps case-sensitive computed values and enumeration live and read-only", () => {
	const { tree, id, computed } = fixture(
		"#target{--Theme:red;--theme:blue;--empty:;--bad:initial}",
	);
	const style = computed();
	expect(style.getPropertyValue("--Theme")).toBe("red");
	expect(style.getPropertyValue("--theme")).toBe("blue");
	expect(style.getPropertyValue("--empty")).toBe(" ");
	expect(style.getPropertyValue("--bad")).toBe("");
	const names = Array.from({ length: style.length }, (_value, index) =>
		style.item(index),
	);
	expect(names.slice(computedStyleProperties.length)).toEqual([
		"--Theme",
		"--empty",
		"--theme",
	]);
	tree.setAttribute(id(), "style", "--Theme:green;--extra:purple");
	expect(style.getPropertyValue("--Theme")).toBe("green");
	expect(style.length).toBe(names.length + 1);
	expect(() => style.setProperty("--Theme", "blue")).toThrow();
	const target = id();
	const parent = tree.get(target).parent;
	if (parent === null) throw new Error("Missing fixture parent");
	tree.remove(target);
	expect(style.length).toBe(0);
	expect(style.getPropertyValue("--Theme")).toBe("");
	tree.append(parent, target);
	expect(style.getPropertyValue("--Theme")).toBe("green");
	tree.close();
	expect(() => style.getPropertyValue("--Theme")).toThrow();
});

it("bounds property count, value size, component nesting and expansion", () => {
	expect(() =>
		resolve(
			Object.fromEntries(
				Array.from(
					{ length: cssVariableLimits.maxProperties + 1 },
					(_value, index) => [`--v${index}`, "x"],
				),
			),
		),
	).toThrow("limit");
	expect(() =>
		parseVariableValue("x".repeat(cssVariableLimits.maxValueCodeUnits + 1)),
	).toThrow("limit");
	expect(() =>
		parseVariableValue(`${"f(".repeat(33)}x${")".repeat(33)}`),
	).toThrow("limit");
	expect(() =>
		resolve({ "--a": "x".repeat(40_000), "--b": "var(--a)var(--a)" }),
	).toThrow("limit");
});

it("charges resolution work and closes independent style owners", () => {
	const { tree, id } = fixture("#target{--a:red;--b:var(--a);color:var(--b)}");
	const limited = new DocumentStyles(tree, { maxWork: 1 });
	expect(() => limited.custom(id(), "--b")).toThrow("limit");
	limited.close();
	expect(() => limited.custom(id(), "--b")).toThrow("closed");
});

it("recovers from failed retained-binding rebuilds without exposing stale values", () => {
	const { tree, id, read } = fixture(
		"#target{--theme:red}",
		`<div id="target" class="scope" style="--unique:target">Text</div>${Array.from({ length: 35 }, (_value, index) => `<div class="scope" style="--unique:${index}"></div>`).join("")}`,
	);
	expect(read("--theme")).toBe("red");
	tree.setTextContent(
		id("style"),
		`.scope{${Array.from({ length: 511 }, (_value, index) => `--v${index}:red`).join(";")}}`,
	);
	expect(() => read("--theme")).toThrow("retention limit");
	expect(() => read("--theme")).toThrow("retention limit");
	tree.setTextContent(id("style"), "#target{--theme:blue}");
	expect(read("--theme")).toBe("blue");
});
