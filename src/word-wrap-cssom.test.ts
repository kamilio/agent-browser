import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import { inlineProperties } from "./css-declarations.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { type InlineStyleLimits, InlineStyles } from "./inline-styles.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

interface Style {
	[index: number]: string | undefined;
	cssText: string;
	readonly length: number;
	wordWrap: string;
	"word-wrap": string;
	overflowWrap: string;
	"overflow-wrap": string;
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
		`<style>${css}</style><main id="outer"><div id="target">Text</div></main>`,
		"https://fixture.invalid/word-wrap",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = queries.querySelector("#target");
	if (id === null) throw new Error("Missing target");
	if (source) tree.setAttribute(id, "style", source);
	const dom = new ScriptDom(tree, factory);
	const element = dom.node(id) as { style: Style };
	const style = element.style;
	const computed = dom.getComputedStyle(element) as Style;
	return { tree, id, dom, element, style, computed };
}

function names(style: Style) {
	return Array.from({ length: style.length }, (_value, index) =>
		style.item(index),
	);
}

it.each(["word-wrap", "wordWrap"] as const)(
	"shares %s accessor state with the canonical property",
	(alias) => {
		const { style, computed, element } = fixture("overflow-wrap:normal");
		expect(style[alias]).toBe("normal");
		style[alias] = "anywhere";
		expect(element.style).toBe(style);
		expect(style.overflowWrap).toBe("anywhere");
		expect(style["overflow-wrap"]).toBe("anywhere");
		expect(computed[alias]).toBe("anywhere");
		style.overflowWrap = "break-word";
		expect(style[alias]).toBe("break-word");
		expect(computed[alias]).toBe("break-word");
		expect(style.cssText).toBe("overflow-wrap: break-word;");
		expect(names(style)).toEqual(["overflow-wrap"]);
		expect(style[0]).toBe("overflow-wrap");
		expect(style[1]).toBeUndefined();
	},
);

it("interleaves all four accessors without duplicate entries or no-op mutations", () => {
	const { tree, style } = fixture();
	style.wordWrap = "normal";
	style["overflow-wrap"] = "anywhere";
	style["word-wrap"] = "break-word";
	style.overflowWrap = "anywhere";
	expect(style.wordWrap).toBe("anywhere");
	expect(style.length).toBe(1);
	const revision = tree.revision;
	style.wordWrap = "anywhere";
	expect(tree.revision).toBe(revision);
});

it.each(["word-wrap", "WORD-WRAP", "overflow-wrap"])(
	"transfers %s method requests, priority and removal to one slot",
	(name) => {
		const { style, computed } = fixture();
		style.setProperty(name, "anywhere", "IMPORTANT");
		expect(style.getPropertyValue("word-wrap")).toBe("anywhere");
		expect(style.getPropertyValue("overflow-wrap")).toBe("anywhere");
		expect(style.getPropertyPriority("word-wrap")).toBe("important");
		expect(style.getPropertyPriority("overflow-wrap")).toBe("important");
		expect(computed.getPropertyValue(name)).toBe("anywhere");
		expect(computed.getPropertyPriority(name)).toBe("");
		expect(style.cssText).toBe("overflow-wrap: anywhere !important;");
		expect(style.removeProperty(name)).toBe("anywhere");
		expect(style.overflowWrap).toBe("");
		expect(style.wordWrap).toBe("");
		expect(style.length).toBe(0);
	},
);

it.each([
	["word-wrap:anywhere;overflow-wrap:break-word", "break-word", ""],
	["overflow-wrap:break-word;word-wrap:anywhere", "anywhere", ""],
	[
		"word-wrap:anywhere!important;overflow-wrap:break-word",
		"anywhere",
		"important",
	],
	[
		"overflow-wrap:break-word!important;word-wrap:anywhere",
		"break-word",
		"important",
	],
	[
		"overflow-wrap:break-word!important;word-wrap:anywhere!important",
		"anywhere",
		"important",
	],
])(
	"parses and serializes interleaved cssText canonically: %s",
	(source, value, priority) => {
		const { style, computed } = fixture();
		style.cssText = source;
		expect(style.wordWrap).toBe(value);
		expect(computed.wordWrap).toBe(value);
		expect(style.getPropertyPriority("word-wrap")).toBe(priority);
		expect(style.cssText).toBe(
			`overflow-wrap: ${value}${priority ? " !important" : ""};`,
		);
		expect(names(style)).toEqual(["overflow-wrap"]);
	},
);

it("replaces important canonical state through an alias accessor using ordinary setter semantics", () => {
	const { style, computed } = fixture("overflow-wrap:normal!important");
	style.wordWrap = "anywhere";
	expect(style.getPropertyPriority("overflow-wrap")).toBe("");
	expect(style.overflowWrap).toBe("anywhere");
	expect(computed.wordWrap).toBe("anywhere");
});

it("inherits stylesheet aliases and observes inline and external attribute mutations", () => {
	const { tree, id, style, computed } = fixture(
		"",
		"#outer{word-wrap:anywhere}",
	);
	expect(computed.wordWrap).toBe("anywhere");
	style.wordWrap = "break-word";
	expect(computed.overflowWrap).toBe("break-word");
	tree.setAttribute(id, "style", "word-wrap:normal!important");
	expect(style.overflowWrap).toBe("normal");
	expect(style.getPropertyPriority("word-wrap")).toBe("important");
	expect(computed.wordWrap).toBe("normal");
	style.removeProperty("word-wrap");
	expect(computed.wordWrap).toBe("anywhere");
});

it("keeps stylesheet importance authoritative over either inline spelling", () => {
	const { style, computed } = fixture(
		"",
		"#target{word-wrap:anywhere!important}",
	);
	style.wordWrap = "normal";
	expect(computed.wordWrap).toBe("anywhere");
	style.setProperty("word-wrap", "break-word", "important");
	expect(computed.overflowWrap).toBe("break-word");
});

it.each([
	["inherit", "anywhere"],
	["unset", "anywhere"],
	["revert", "anywhere"],
	["initial", "normal"],
])(
	"retains existing CSS-wide %s resolution through the alias",
	(value, expected) => {
		const { style, computed } = fixture("", "#outer{overflow-wrap:anywhere}");
		style.wordWrap = value;
		expect(style.overflowWrap).toBe(value);
		expect(computed.wordWrap).toBe(expected);
	},
);

it("retains variable source and live computed substitution in the canonical slot", () => {
	const { style, computed } = fixture("--mode:anywhere;word-wrap:var(--mode)");
	expect(style.wordWrap).toBe("var(--mode)");
	expect(style.overflowWrap).toBe("var(--mode)");
	expect(computed.wordWrap).toBe("anywhere");
	style.setProperty("--mode", "break-word");
	expect(computed.wordWrap).toBe("break-word");
	style.wordWrap = "var(--missing,normal)";
	expect(computed.wordWrap).toBe("normal");
	expect(names(style)).toEqual(["--mode", "overflow-wrap"]);
});

it("does not alias or case-fold custom names or fabricate camel-case method names", () => {
	const { style, computed } = fixture(
		"--word-wrap:anywhere;--Word-Wrap:break-word;overflow-wrap:normal",
	);
	style.wordWrap = "anywhere";
	expect(style.getPropertyValue("--word-wrap")).toBe("anywhere");
	expect(style.getPropertyValue("--Word-Wrap")).toBe("break-word");
	expect(computed.getPropertyValue("--word-wrap")).toBe("anywhere");
	expect(computed.getPropertyValue("--Word-Wrap")).toBe("break-word");
	for (const name of ["wordWrap", " word-wrap", "word-wrap ", "word-break"])
		expect(style.getPropertyValue(name)).toBe("");
	expect(computed.getPropertyValue("wordWrap")).toBe("");
	style.removeProperty("word-wrap");
	expect(names(style)).toEqual(["--word-wrap", "--Word-Wrap"]);
});

it("keeps canonical computed metadata and excludes the alias from enumeration", () => {
	const { computed } = fixture("overflow-wrap:anywhere");
	expect(computed.length).toBe(computedStyleProperties.length);
	expect(names(computed)).toEqual(computedStyleProperties);
	expect(
		Array.from({ length: computed.length }, (_value, index) => computed[index]),
	).toEqual(computedStyleProperties);
	expect(inlineProperties).not.toContain("word-wrap");
	expect(computedStyleProperties).not.toContain("word-wrap");
	expect(
		names(computed).filter((name) => name === "overflow-wrap"),
	).toHaveLength(1);
	expect(computed.wordWrap).toBe("anywhere");
	expect(computed["word-wrap"]).toBe("anywhere");
});

it("honors the exact native direct alias while preserving direct case/custom semantics", () => {
	const { tree, id } = fixture(
		"overflow-wrap:anywhere;--word-wrap:normal;--Word-Wrap:break-word",
	);
	expect(resolvedStyleValue(tree, id, "word-wrap")).toBe("anywhere");
	expect(resolvedStyleValue(tree, id, "overflow-wrap")).toBe("anywhere");
	expect(resolvedStyleValue(tree, id, "WORD-WRAP")).toBe("");
	expect(resolvedStyleValue(tree, id, "wordWrap")).toBe("");
	expect(resolvedStyleValue(tree, id, "--word-wrap")).toBe("normal");
	expect(resolvedStyleValue(tree, id, "--Word-Wrap")).toBe("break-word");
});

it.each(["wordWrap", "word-wrap"] as const)(
	"rejects computed %s accessor writes without changing inline source",
	(alias) => {
		const { style, computed } = fixture("overflow-wrap:anywhere");
		const source = style.cssText;
		expect(() => {
			computed[alias] = "normal";
		}).toThrow("read-only");
		expect(style.cssText).toBe(source);
		expect(computed[alias]).toBe("anywhere");
	},
);

it("rejects alias computed method writes with the existing readonly errors", () => {
	const { style, computed } = fixture("overflow-wrap:anywhere");
	expect(() => computed.setProperty("word-wrap", "normal")).toThrow(
		"read-only",
	);
	expect(() => computed.removeProperty("word-wrap")).toThrow("read-only");
	expect(style.overflowWrap).toBe("anywhere");
});

it("ignores invalid values/priorities and supports empty alias removal without a new slot", () => {
	const { tree, style } = fixture("overflow-wrap:anywhere!important");
	const revision = tree.revision;
	for (const value of [
		"break-all",
		"0",
		"1px",
		"normal!important",
		"anywhere normal",
	])
		style.wordWrap = value;
	style.setProperty("word-wrap", "normal", "invalid");
	expect(tree.revision).toBe(revision);
	expect(style.overflowWrap).toBe("anywhere");
	expect(style.getPropertyPriority("word-wrap")).toBe("important");
	style.setProperty("word-wrap", "", "invalid");
	expect(style.length).toBe(0);
	style.wordWrap = "normal";
	Reflect.set(style, "wordWrap", null);
	expect(style.length).toBe(0);
});

it("rejects accessor and method object coercion before calling user code", () => {
	const { style, computed } = fixture("overflow-wrap:anywhere");
	let calls = 0;
	const object = {
		toString() {
			calls++;
			return "normal";
		},
	};
	for (const operation of [
		() => Reflect.set(style, "wordWrap", object),
		() => Reflect.set(style, "word-wrap", Symbol("value")),
		() => style.setProperty("word-wrap", object),
		() => style.setProperty("word-wrap", "normal", object),
		() => style.getPropertyValue(object),
		() => computed.getPropertyValue(object),
	])
		expect(operation).toThrow("coercion");
	expect(calls).toBe(0);
	expect(style.overflowWrap).toBe("anywhere");
	expect(() => style.setProperty("word-wrap")).toThrow("argument");
	expect(() => computed.getPropertyValue()).toThrow("argument");
});

it("keeps inline alias access live while detached and computed alias reads empty", () => {
	const { tree, id, style, computed } = fixture("word-wrap:anywhere");
	const parent = tree.get(id).parent;
	if (parent === null) throw new Error("Missing parent");
	tree.remove(id);
	expect(style.wordWrap).toBe("anywhere");
	expect(computed.wordWrap).toBe("");
	expect(computed.getPropertyValue("word-wrap")).toBe("");
	expect(resolvedStyleValue(tree, id, "word-wrap")).toBe("");
	expect(computed.length).toBe(0);
	style.wordWrap = "break-word";
	tree.append(parent, id);
	expect(computed.wordWrap).toBe("break-word");
	expect(computed.length).toBe(computedStyleProperties.length);
});

it.each(["document", "dom"])(
	"revokes saved alias capabilities on %s close",
	(kind) => {
		const { tree, id, dom, style, computed } = fixture(
			"overflow-wrap:anywhere",
		);
		if (kind === "document") tree.close();
		else dom.close();
		for (const operation of [
			() => style.wordWrap,
			() => style["word-wrap"],
			() => Reflect.set(style, "wordWrap", "normal"),
			() => style.getPropertyValue("word-wrap"),
			() => style.removeProperty("word-wrap"),
			() => computed.wordWrap,
			() => computed["word-wrap"],
			() => computed.getPropertyValue("word-wrap"),
		])
			expect(operation).toThrow(/closed/i);
		if (kind === "document")
			expect(() => resolvedStyleValue(tree, id, "word-wrap")).toThrow(
				/closed/i,
			);
	},
);

it("keeps duplicate alias setters within one bounded declaration and object", () => {
	const { tree, id } = fixture();
	const owner = new InlineStyles(tree, factory, {
		maxObjects: 1,
		maxDeclarations: 1,
	});
	const style = owner.get(id) as Style;
	style.wordWrap = "anywhere";
	style.overflowWrap = "normal";
	style.setProperty("word-wrap", "break-word");
	expect(style.length).toBe(1);
	expect(style.wordWrap).toBe("break-word");
	expect(owner.get(id)).toBe(style);
	expect(owner.stats.objects).toBe(1);
	const revision = tree.revision;
	expect(() => style.setProperty("width", "1px")).toThrow("limit");
	expect(tree.revision).toBe(revision);
	expect(style.wordWrap).toBe("break-word");
});

it.each([
	{ maxCodeUnits: 28 },
	{ maxCachedCodeUnits: 28 },
] satisfies Partial<InlineStyleLimits>[])(
	"retains source/cache/revision when canonical serialization exceeds %j",
	(limits) => {
		const { tree, id } = fixture();
		const owner = new InlineStyles(tree, factory, limits);
		const style = owner.get(id) as Style;
		style.wordWrap = "normal";
		const before = {
			source: tree.get(id).attributes.style,
			revision: tree.revision,
			cache: owner.stats.cachedCodeUnits,
		};
		expect(() =>
			style.setProperty("word-wrap", "anywhere", "important"),
		).toThrow("limit");
		expect(tree.get(id).attributes.style).toBe(before.source);
		expect(tree.revision).toBe(before.revision);
		expect(owner.stats.cachedCodeUnits).toBe(before.cache);
		expect(style.overflowWrap).toBe("normal");
	},
);

it("preserves computed argument/object limits with alias accessors", () => {
	const { tree, id } = fixture("overflow-wrap:anywhere");
	const owner = new ComputedStyles(tree, factory, 1);
	const computed = owner.get(id) as Style;
	expect(computed.wordWrap).toBe("anywhere");
	expect(() => computed.getPropertyValue("word-wrap".repeat(129))).toThrow(
		"limit",
	);
	expect(() => owner.get(id)).toThrow("limit");
	expect(computed.wordWrap).toBe("anywhere");
	expect(owner.metrics().objects).toBe(1);
});
