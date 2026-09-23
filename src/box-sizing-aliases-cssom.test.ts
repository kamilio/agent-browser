import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import { inlineProperties } from "./css-declarations.js";
import { canonicalCssProperty } from "./css-property-aliases.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { type InlineStyleLimits, InlineStyles } from "./inline-styles.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface Style {
	[index: number]: string | undefined;
	cssText: string;
	readonly length: number;
	boxSizing: string;
	"box-sizing": string;
	MozBoxSizing: string;
	"-moz-box-sizing": string;
	WebkitBoxSizing: string;
	webkitBoxSizing: string;
	"-webkit-box-sizing": string;
	wordWrap: string;
	overflowWrap: string;
	getPropertyValue(...args: unknown[]): string;
	getPropertyPriority(...args: unknown[]): string;
	setProperty(...args: unknown[]): void;
	removeProperty(...args: unknown[]): string;
	item(index: unknown): string;
}

const aliases = ["-moz-box-sizing", "-webkit-box-sizing"] as const;
const aliasAccessors = [
	...aliases,
	"MozBoxSizing",
	"WebkitBoxSizing",
	"webkitBoxSizing",
] as const;
const accessors = ["box-sizing", "boxSizing", ...aliasAccessors] as const;
const cssNames = ["box-sizing", ...aliases] as const;
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
		`<style>${css}</style><main id="outer"><div id="target">Text</div></main>`,
		"https://fixture.invalid/box-sizing-aliases",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target");
	const outer = queries.querySelector("#outer");
	if (id === null || outer === null) throw new Error("Missing fixture element");
	if (source) tree.setAttribute(id, "style", source);
	const dom = new ScriptDom(tree, factory);
	const element = dom.node(id) as { style: Style };
	const style = element.style;
	const computed = dom.getComputedStyle(element) as Style;
	return { tree, id, outer, dom, element, style, computed };
}

function names(style: Style) {
	return Array.from({ length: style.length }, (_value, index) =>
		style.item(index),
	);
}

function expectSizing(style: Style, value: string) {
	for (const accessor of accessors) expect(style[accessor]).toBe(value);
	for (const name of cssNames) expect(style.getPropertyValue(name)).toBe(value);
}

it.each(accessors)(
	"shares %s accessor reads and writes with every box-sizing spelling",
	(accessor) => {
		const { element, style, computed } = fixture("box-sizing:content-box");
		expectSizing(style, "content-box");
		style[accessor] = "border-box";
		expect(element.style).toBe(style);
		expectSizing(style, "border-box");
		expectSizing(computed, "border-box");
		style.boxSizing = "content-box";
		expectSizing(style, "content-box");
		expectSizing(computed, "content-box");
		expect(style.cssText).toBe("box-sizing: content-box;");
		expect(names(style)).toEqual(["box-sizing"]);
		expect(style[0]).toBe("box-sizing");
		expect(style[1]).toBeUndefined();
	},
);

it("interleaves accessors without extra slots or no-op revisions", () => {
	const { tree, style } = fixture();
	for (const accessor of accessors) {
		style[accessor] = "border-box";
		const revision = tree.revision;
		style[accessor] = "border-box";
		expect(tree.revision).toBe(revision);
		expectSizing(style, "border-box");
		style.boxSizing = "content-box";
	}
	expect(names(style)).toEqual(["box-sizing"]);
});

it.each([...cssNames, "BOX-SIZING", "-MOZ-BOX-SIZING", "-WEBKIT-BOX-SIZING"])(
	"normalizes %s method reads, writes, priority and removal",
	(name) => {
		const { style, computed } = fixture();
		style.setProperty(name, "border-box", "IMPORTANT");
		expectSizing(style, "border-box");
		expectSizing(computed, "border-box");
		for (const spelling of cssNames)
			expect(style.getPropertyPriority(spelling)).toBe("important");
		expect(style.getPropertyValue(name)).toBe("border-box");
		expect(style.getPropertyPriority(name)).toBe("important");
		expect(computed.getPropertyValue(name)).toBe("border-box");
		expect(computed.getPropertyPriority(name)).toBe("");
		expect(style.cssText).toBe("box-sizing: border-box !important;");
		expect(style.removeProperty(name)).toBe("border-box");
		expectSizing(style, "");
		expectSizing(computed, "content-box");
		expect(style.length).toBe(0);
		expect(style.removeProperty(name)).toBe("");
	},
);

it.each([
	["-moz-box-sizing:border-box;box-sizing:content-box", "content-box", ""],
	["box-sizing:content-box;-moz-box-sizing:border-box", "border-box", ""],
	["-webkit-box-sizing:border-box;box-sizing:content-box", "content-box", ""],
	["box-sizing:content-box;-webkit-box-sizing:border-box", "border-box", ""],
	[
		"-moz-box-sizing:border-box!important;-webkit-box-sizing:content-box",
		"border-box",
		"important",
	],
	[
		"-webkit-box-sizing:content-box!important;-moz-box-sizing:border-box!important",
		"border-box",
		"important",
	],
	[
		"box-sizing:content-box!important;-moz-box-sizing:border-box;-webkit-box-sizing:border-box",
		"content-box",
		"important",
	],
	[
		"-MOZ-BOX-SIZING:content-box;-WEBKIT-BOX-SIZING:border-box;box-sizing:padding-box",
		"border-box",
		"",
	],
])(
	"canonicalizes cssText source order and importance: %s",
	(source, value, priority) => {
		const { style, computed } = fixture();
		style.cssText = source;
		expectSizing(style, value);
		expectSizing(computed, value);
		for (const name of cssNames)
			expect(style.getPropertyPriority(name)).toBe(priority);
		expect(style.cssText).toBe(
			`box-sizing: ${value}${priority ? " !important" : ""};`,
		);
		expect(names(style)).toEqual(["box-sizing"]);
	},
);

it("replaces important canonical state through both vendor accessors", () => {
	const { style, computed } = fixture();
	for (const alias of aliasAccessors) {
		style.cssText = "box-sizing:content-box!important";
		style[alias] = "border-box";
		for (const name of cssNames)
			expect(style.getPropertyPriority(name)).toBe("");
		expectSizing(computed, "border-box");
	}
});

it("keeps stylesheet importance authoritative over ordinary inline aliases", () => {
	const { style, computed } = fixture(
		"",
		"#target{-moz-box-sizing:content-box!important;-webkit-box-sizing:border-box!important}",
	);
	for (const alias of aliases) {
		style.setProperty(alias, "content-box");
		expectSizing(computed, "border-box");
		style.setProperty(alias, "content-box", "important");
		expectSizing(computed, "content-box");
		style.removeProperty(alias);
	}
});

it("does not inherit parent vendor declarations by default", () => {
	for (const alias of aliases) {
		const { tree, outer, computed } = fixture(
			"",
			`#outer{${alias}:border-box}`,
		);
		expect(resolvedStyleValue(tree, outer, alias)).toBe("border-box");
		expectSizing(computed, "content-box");
	}
});

it.each([
	["inherit", "border-box"],
	["initial", "content-box"],
	["unset", "content-box"],
	["revert", "content-box"],
])("resolves CSS-wide %s through either vendor alias", (value, expected) => {
	for (const alias of aliases) {
		const { style, computed } = fixture("", "#outer{box-sizing:border-box}");
		style.setProperty(alias, value);
		expectSizing(style, value);
		expectSizing(computed, expected);
	}
});

it("retains variable source and invalidates computed substitution across aliases", () => {
	const { tree, outer, style, computed } = fixture(
		"-moz-box-sizing:var(--mode)",
		"#outer{--mode:border-box}",
	);
	expectSizing(style, "var(--mode)");
	expectSizing(computed, "border-box");
	tree.setAttribute(outer, "style", "--mode:content-box");
	expectSizing(computed, "content-box");
	style.setProperty("--mode", "border-box");
	expectSizing(computed, "border-box");
	style.webkitBoxSizing = "var(--missing,content-box)";
	expectSizing(style, "var(--missing,content-box)");
	expectSizing(computed, "content-box");
	expect(names(style)).toEqual(["box-sizing", "--mode"]);
	style.WebkitBoxSizing = "var(--mode)";
	style.setProperty("--mode", "padding-box");
	expectSizing(computed, "content-box");
});

it("keeps saved capabilities live across class and external style mutations", () => {
	const { tree, id, dom, element, style, computed } = fixture(
		"",
		"#target{-moz-box-sizing:content-box}#target.active{-webkit-box-sizing:border-box}",
	);
	const another = dom.getComputedStyle(element) as Style;
	expect(another).not.toBe(computed);
	expectSizing(computed, "content-box");
	tree.setAttribute(id, "class", "active");
	expectSizing(computed, "border-box");
	expectSizing(another, "border-box");
	tree.setAttribute(id, "style", "-webkit-box-sizing:content-box!important");
	expect(element.style).toBe(style);
	expectSizing(style, "content-box");
	expect(style.getPropertyPriority("-moz-box-sizing")).toBe("important");
	expectSizing(computed, "content-box");
	tree.removeAttribute(id, "style");
	expectSizing(style, "");
	expectSizing(computed, "border-box");
	tree.removeAttribute(id, "class");
	expectSizing(another, "content-box");
});

it("resets shared state through cssText and empty or null alias setters", () => {
	const { style, computed } = fixture();
	for (const alias of aliasAccessors) {
		style[alias] = "border-box";
		style.cssText = "width:12px";
		expectSizing(style, "");
		expectSizing(computed, "content-box");
		expect(names(style)).toEqual(["width"]);
		style[alias] = "border-box";
		style[alias] = "";
		expectSizing(style, "");
		style[alias] = "border-box";
		Reflect.set(style, alias, null);
		expectSizing(style, "");
		style.cssText = "";
		expect(style.length).toBe(0);
	}
	for (const alias of aliases) {
		style.setProperty(alias, "border-box", "important");
		style.setProperty(alias, "", "invalid");
		expectSizing(style, "");
		expect(style.cssText).toBe("");
	}
});

it("preserves custom-property case and the existing word-wrap alias", () => {
	const { style, computed } = fixture(
		"---moz-box-sizing:content-box;---Moz-box-sizing:border-box;word-wrap:anywhere;-webkit-box-sizing:border-box",
	);
	style.MozBoxSizing = "content-box";
	expect(style.getPropertyValue("---moz-box-sizing")).toBe("content-box");
	expect(style.getPropertyValue("---Moz-box-sizing")).toBe("border-box");
	expect(computed.getPropertyValue("---moz-box-sizing")).toBe("content-box");
	expect(computed.getPropertyValue("---Moz-box-sizing")).toBe("border-box");
	expect(style.wordWrap).toBe("anywhere");
	expect(computed.overflowWrap).toBe("anywhere");
	style.wordWrap = "break-word";
	expect(computed.wordWrap).toBe("break-word");
	expectSizing(computed, "content-box");
	style.removeProperty("-webkit-box-sizing");
	expect(names(style)).toEqual([
		"---moz-box-sizing",
		"---Moz-box-sizing",
		"overflow-wrap",
	]);
});

it("enumerates only canonical computed names and canonical numeric indexes", () => {
	const { computed } = fixture("-moz-box-sizing:border-box");
	expect(computed.length).toBe(computedStyleProperties.length);
	expect(names(computed)).toEqual(computedStyleProperties);
	expect(
		Array.from({ length: computed.length }, (_value, index) => computed[index]),
	).toEqual(computedStyleProperties);
	for (const alias of aliases) {
		expect(inlineProperties).not.toContain(alias);
		expect(computedStyleProperties).not.toContain(alias);
	}
	expect(names(computed).filter((name) => name === "box-sizing")).toHaveLength(
		1,
	);
	expect(computed[computed.length]).toBeUndefined();
	expect(computed.item(computed.length)).toBe("");
	expectSizing(computed, "border-box");
});

it("keeps direct canonicalization exact-case without changing custom names", () => {
	const { tree, id } = fixture(
		"box-sizing:border-box;---moz-box-sizing:custom",
	);
	for (const name of cssNames) {
		expect(canonicalCssProperty(name)).toBe("box-sizing");
		expect(resolvedStyleValue(tree, id, name)).toBe("border-box");
	}
	for (const name of [
		"-MOZ-BOX-SIZING",
		"-WEBKIT-BOX-SIZING",
		"MozBoxSizing",
		"WebkitBoxSizing",
		"webkitBoxSizing",
		"boxSizing",
	]) {
		expect(canonicalCssProperty(name)).toBe(name);
		expect(resolvedStyleValue(tree, id, name)).toBe("");
	}
	expect(canonicalCssProperty("---moz-box-sizing")).toBe("---moz-box-sizing");
	expect(resolvedStyleValue(tree, id, "---moz-box-sizing")).toBe("custom");
});

it.each(accessors)("rejects computed %s accessor writes", (accessor) => {
	const { tree, style, computed } = fixture("-moz-box-sizing:border-box");
	const source = style.cssText;
	const revision = tree.revision;
	expect(() => {
		computed[accessor] = "content-box";
	}).toThrow("read-only");
	expect(style.cssText).toBe(source);
	expect(tree.revision).toBe(revision);
	expectSizing(computed, "border-box");
});

it.each(cssNames)(
	"rejects computed %s method writes and cssText replacement",
	(name) => {
		const { style, computed } = fixture("box-sizing:border-box");
		expect(() => computed.setProperty(name, "content-box")).toThrow(
			"read-only",
		);
		expect(() => computed.removeProperty(name)).toThrow("read-only");
		expect(() => {
			computed.cssText = `${name}:content-box`;
		}).toThrow("read-only");
		expect(computed.cssText).toBe("");
		expectSizing(style, "border-box");
	},
);

it.each(aliasAccessors)(
	"ignores invalid %s values without changing state",
	(alias) => {
		const { tree, style, computed } = fixture(
			"box-sizing:border-box!important",
		);
		const revision = tree.revision;
		for (const value of [
			"padding-box",
			"fill",
			"auto",
			"0",
			"1px",
			"border-box content-box",
			"content-box!important",
		]) {
			style[alias] = value;
			for (const name of aliases) style.setProperty(name, value);
		}
		for (const name of aliases)
			style.setProperty(name, "content-box", "invalid");
		expect(tree.revision).toBe(revision);
		expectSizing(style, "border-box");
		expectSizing(computed, "border-box");
		expect(style.cssText).toBe("box-sizing: border-box !important;");
	},
);

it("rejects non-CSS spellings, unsupported prefixes and prototype-like keys", () => {
	const { tree, style, computed } = fixture("box-sizing:border-box");
	const revision = tree.revision;
	for (const name of [
		"boxSizing",
		"MozBoxSizing",
		"WebkitBoxSizing",
		"webkitBoxSizing",
		"mozBoxSizing",
		" -moz-box-sizing",
		"-webkit-box-sizing ",
		"-ms-box-sizing",
		"-o-box-sizing",
		"-moz-width",
		"__proto__",
		"constructor",
		"prototype",
		"toString",
		"hasOwnProperty",
	]) {
		expect(canonicalCssProperty(name)).toBe(name);
		style.setProperty(name, "content-box");
		expect(style.getPropertyValue(name)).toBe("");
		expect(style.getPropertyPriority(name)).toBe("");
		expect(style.removeProperty(name)).toBe("");
		expect(computed.getPropertyValue(name)).toBe("");
	}
	expect(tree.revision).toBe(revision);
	expect(names(style)).toEqual(["box-sizing"]);
	expectSizing(style, "border-box");
	expectSizing(computed, "border-box");
});

it("rejects object coercion and missing arguments before invoking user code", () => {
	const { style, computed } = fixture("box-sizing:border-box");
	let calls = 0;
	const object = {
		toString() {
			calls++;
			return "content-box";
		},
	};
	for (const alias of aliasAccessors)
		expect(() => Reflect.set(style, alias, object)).toThrow("coercion");
	for (const name of aliases) {
		for (const operation of [
			() => Reflect.set(style, name, Symbol("value")),
			() => style.setProperty(name, object),
			() => style.setProperty(name, "content-box", object),
			() => style.getPropertyValue(object),
			() => computed.getPropertyValue(object),
		])
			expect(operation).toThrow("coercion");
		expect(() => style.setProperty(name)).toThrow("argument");
	}
	expect(() => computed.getPropertyValue()).toThrow("argument");
	expect(calls).toBe(0);
	expectSizing(style, "border-box");
});

it("keeps detached inline aliases live and restores computed reads on reattachment", () => {
	const { tree, id, outer, style, computed } = fixture(
		"-moz-box-sizing:border-box",
	);
	tree.remove(id);
	expectSizing(style, "border-box");
	expectSizing(computed, "");
	for (const name of cssNames)
		expect(resolvedStyleValue(tree, id, name)).toBe("");
	expect(computed.length).toBe(0);
	style.webkitBoxSizing = "content-box";
	tree.append(outer, id);
	expectSizing(computed, "content-box");
	style.MozBoxSizing = "border-box";
	expectSizing(computed, "border-box");
	expect(computed.length).toBe(computedStyleProperties.length);
});

it.each(["document", "dom"])("revokes saved aliases on %s close", (kind) => {
	const { tree, id, dom, style, computed } = fixture("box-sizing:border-box");
	const readInline = style.getPropertyValue;
	const readComputed = computed.getPropertyValue;
	if (kind === "document") tree.close();
	else dom.close();
	for (const accessor of accessors) {
		expect(() => style[accessor]).toThrow(/closed/i);
		expect(() => Reflect.set(style, accessor, "content-box")).toThrow(
			/closed/i,
		);
		expect(() => computed[accessor]).toThrow(/closed/i);
		expect(() => Reflect.set(computed, accessor, "content-box")).toThrow(
			/closed/i,
		);
	}
	for (const name of cssNames) {
		for (const operation of [
			() => readInline(name),
			() => readComputed(name),
			() => style.getPropertyPriority(name),
			() => style.setProperty(name, "content-box"),
			() => style.removeProperty(name),
			() => computed.setProperty(name, "content-box"),
			() => computed.removeProperty(name),
		])
			expect(operation).toThrow(/closed/i);
		if (kind === "document")
			expect(() => resolvedStyleValue(tree, id, name)).toThrow(/closed/i);
	}
	for (const operation of [
		() => style[0],
		() => computed[0],
		() => style.cssText,
		() => computed.length,
	])
		expect(operation).toThrow(/closed/i);
});

it("keeps all setters within one bounded canonical declaration and object", () => {
	const { tree, id, outer } = fixture();
	const owner = new InlineStyles(tree, factory, {
		maxObjects: 1,
		maxDeclarations: 1,
	});
	const style = owner.get(id) as Style;
	for (const accessor of accessors) {
		style[accessor] = "border-box";
		style.boxSizing = "content-box";
	}
	for (const name of aliases) style.setProperty(name, "border-box");
	expect(names(style)).toEqual(["box-sizing"]);
	expect(owner.get(id)).toBe(style);
	expect(owner.stats.objects).toBe(1);
	const revision = tree.revision;
	expect(() => style.setProperty("width", "1px")).toThrow("limit");
	expect(() => owner.get(outer)).toThrow("limit");
	expect(tree.revision).toBe(revision);
	expectSizing(style, "border-box");
});

it.each([
	{ maxCodeUnits: 28 },
	{ maxCachedCodeUnits: 28 },
] satisfies Partial<InlineStyleLimits>[])(
	"retains source, cache and revision when alias serialization exceeds %j",
	(limits) => {
		const { tree, id } = fixture();
		const owner = new InlineStyles(tree, factory, limits);
		const style = owner.get(id) as Style;
		style.MozBoxSizing = "content-box";
		const before = {
			source: tree.get(id).attributes.style,
			revision: tree.revision,
			cache: owner.stats.cachedCodeUnits,
		};
		for (const name of aliases) {
			expect(() => style.setProperty(name, "border-box", "important")).toThrow(
				"limit",
			);
			expect(tree.get(id).attributes.style).toBe(before.source);
			expect(tree.revision).toBe(before.revision);
			expect(owner.stats.cachedCodeUnits).toBe(before.cache);
			expectSizing(style, "content-box");
		}
	},
);

it("preserves computed argument and object bounds with vendor accessors", () => {
	const { tree, id } = fixture("-webkit-box-sizing:border-box");
	const owner = new ComputedStyles(tree, factory, 1);
	const computed = owner.get(id) as Style;
	expectSizing(computed, "border-box");
	for (const name of aliases)
		expect(() => computed.getPropertyValue(name.repeat(129))).toThrow("limit");
	expect(() => owner.get(id)).toThrow("limit");
	expectSizing(computed, "border-box");
	expect(owner.metrics().objects).toBe(1);
});

it("rejects oversized alias cssText without changing cached canonical state", () => {
	const { tree, id } = fixture();
	const owner = new InlineStyles(tree, factory, { maxCodeUnits: 64 });
	const style = owner.get(id) as Style;
	style.MozBoxSizing = "border-box";
	const revision = tree.revision;
	const cached = owner.stats.cachedCodeUnits;
	expect(() => {
		style.cssText = "-webkit-box-sizing:content-box;".repeat(4);
	}).toThrow("limit");
	expect(tree.revision).toBe(revision);
	expect(owner.stats.cachedCodeUnits).toBe(cached);
	expect(style.cssText).toBe("box-sizing: border-box;");
	expectSizing(style, "border-box");
});

it("shares alias operations within an element while keeping element state separate", () => {
	const tree = parseHtmlDocument("<main></main>", "https://example.com/");
	const definitions: ScriptHostObjectDefinition[] = [];
	const styles = new InlineStyles(tree, {
		createHostObject(definition) {
			definitions.push(definition);
			return factory.createHostObject(definition);
		},
	});
	const first = tree.createElement("div");
	const second = tree.createElement("div");
	tree.append(tree.root, first);
	tree.append(tree.root, second);
	const one = styles.get(first);
	const two = styles.get(second);
	const properties = definitions[0].properties ?? {};
	for (const names of [
		["background-color", "backgroundColor"],
		[
			"box-sizing",
			"boxSizing",
			"-webkit-box-sizing",
			"WebkitBoxSizing",
			"webkitBoxSizing",
		],
		["overflow-wrap", "overflowWrap", "word-wrap", "wordWrap"],
		["float", "cssFloat"],
	]) {
		const canonical = properties[names[0]];
		expect(canonical.get).toBeTypeOf("function");
		expect(canonical.set).toBeTypeOf("function");
		for (const name of names) {
			expect(properties[name].get).toBe(canonical.get);
			expect(properties[name].set).toBe(canonical.set);
		}
		expect(definitions[1].properties?.[names[0]].get).not.toBe(canonical.get);
	}
	Reflect.set(one, "wordWrap", "break-word");
	expect(Reflect.get(one, "overflowWrap")).toBe("break-word");
	expect(Reflect.get(two, "overflowWrap")).toBe("");
	tree.setAttribute(first, "style", "overflow-wrap:anywhere");
	expect(Reflect.get(one, "wordWrap")).toBe("anywhere");
	tree.close();
	expect(() => Reflect.get(one, "wordWrap")).toThrow();
});
