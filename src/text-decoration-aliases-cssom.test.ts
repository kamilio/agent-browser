import { afterEach, expect, it } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import { inlineProperties } from "./css-declarations.js";
import { canonicalCssProperty } from "./css-property-aliases.js";
import { cssTextDecorationProperties } from "./css-text-decoration.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { type InlineStyleLimits, InlineStyles } from "./inline-styles.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const decorations = [
	{
		canonical: "text-decoration",
		camel: "textDecoration",
		alias: "-webkit-text-decoration",
		upper: "WebkitTextDecoration",
		lower: "webkitTextDecoration",
		value: "underline solid red",
		replacement: "overline solid blue",
		invalid: "underline wavy red",
	},
	{
		canonical: "text-decoration-line",
		camel: "textDecorationLine",
		alias: "-webkit-text-decoration-line",
		upper: "WebkitTextDecorationLine",
		lower: "webkitTextDecorationLine",
		value: "underline",
		replacement: "overline line-through",
		invalid: "underline underline",
	},
	{
		canonical: "text-decoration-style",
		camel: "textDecorationStyle",
		alias: "-webkit-text-decoration-style",
		upper: "WebkitTextDecorationStyle",
		lower: "webkitTextDecorationStyle",
		value: "solid",
		replacement: "solid",
		invalid: "wavy",
	},
	{
		canonical: "text-decoration-color",
		camel: "textDecorationColor",
		alias: "-webkit-text-decoration-color",
		upper: "WebkitTextDecorationColor",
		lower: "webkitTextDecorationColor",
		value: "red",
		replacement: "blue",
		invalid: "not-a-color",
	},
] as const;

type Decoration = (typeof decorations)[number];
type Accessor = Decoration["canonical" | "camel" | "alias" | "upper" | "lower"];
type Style = Record<Accessor, string> & {
	[index: number]: string | undefined;
	cssText: string;
	readonly length: number;
	getPropertyValue(...args: unknown[]): string;
	getPropertyPriority(...args: unknown[]): string;
	setProperty(...args: unknown[]): void;
	removeProperty(...args: unknown[]): string;
	item(index: unknown): string;
};

function accessors(decoration: Decoration): Accessor[] {
	return [
		decoration.canonical,
		decoration.camel,
		decoration.alias,
		decoration.upper,
		decoration.lower,
	];
}

const accessorCases = decorations.flatMap((decoration) =>
	accessors(decoration).map((accessor) => ({ decoration, accessor })),
);
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
		"https://fixture.invalid/text-decoration-aliases",
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

function expectAliases(style: Style, decoration: Decoration, value: string) {
	for (const accessor of accessors(decoration))
		expect(style[accessor]).toBe(value);
	for (const name of [decoration.alias, decoration.canonical])
		expect(style.getPropertyValue(name)).toBe(value);
}

function expectParity(actual: Style, canonical: Style) {
	expect(actual.cssText).toBe(canonical.cssText);
	expect(names(actual)).toEqual(names(canonical));
	for (const decoration of decorations) {
		expectAliases(
			actual,
			decoration,
			canonical.getPropertyValue(decoration.canonical),
		);
		expect(actual.getPropertyPriority(decoration.alias)).toBe(
			canonical.getPropertyPriority(decoration.canonical),
		);
	}
	for (const name of ["text-decoration-thickness", "text-underline-offset"])
		expect(actual.getPropertyValue(name)).toBe(
			canonical.getPropertyValue(name),
		);
}

it.each(accessorCases)(
	"shares $accessor writes, priority replacement and no-op revisions",
	({ decoration, accessor }) => {
		const { tree, element, style, computed } = fixture(
			`${decoration.canonical}:${decoration.value}!important`,
		);
		const canonical = fixture();
		canonical.style.setProperty(decoration.canonical, decoration.replacement);
		style[accessor] = decoration.replacement;
		expect(element.style).toBe(style);
		expect(style.getPropertyPriority(decoration.alias)).toBe("");
		expectParity(style, canonical.style);
		expectParity(computed, canonical.computed);
		const revision = tree.revision;
		style[accessor] = decoration.replacement;
		expect(tree.revision).toBe(revision);
		style[decoration.camel] = decoration.value;
		expectAliases(style, decoration, decoration.value);
	},
);

it.each(decorations)(
	"normalizes $alias method names, priority and removal",
	(decoration) => {
		for (const name of [
			decoration.alias,
			decoration.canonical,
			decoration.alias.toUpperCase(),
			decoration.canonical.toUpperCase(),
		]) {
			const { style, computed } = fixture();
			const canonical = fixture();
			style.setProperty(name, decoration.value, "IMPORTANT");
			canonical.style.setProperty(
				decoration.canonical,
				decoration.value,
				"important",
			);
			expectParity(style, canonical.style);
			expectParity(computed, canonical.computed);
			expect(style.getPropertyValue(name)).toBe(decoration.value);
			expect(style.getPropertyPriority(name)).toBe("important");
			expect(computed.getPropertyValue(name)).toBe(
				canonical.computed.getPropertyValue(decoration.canonical),
			);
			expect(computed.getPropertyPriority(name)).toBe("");
			expect(style.removeProperty(name)).toBe(decoration.value);
			canonical.style.removeProperty(decoration.canonical);
			expectAliases(style, decoration, "");
			expectParity(style, canonical.style);
			expectParity(computed, canonical.computed);
			expect(style.removeProperty(name)).toBe("");
		}
	},
);

it("enumerates and serializes canonical names without alias slots", () => {
	const { style, computed } = fixture();
	style.webkitTextDecoration = "underline solid red";
	style.WebkitTextDecorationColor = "blue";
	style.webkitTextDecorationLine = "overline";
	style.WebkitTextDecorationStyle = "solid";
	expect(names(style)).toEqual([...cssTextDecorationProperties]);
	expect(style.cssText).toBe("text-decoration: overline solid blue;");
	for (const [index, name] of names(style).entries())
		expect(style[index]).toBe(name);
	expect(style[style.length]).toBeUndefined();
	expect(style.item(style.length)).toBe("");
	expect(names(computed)).toEqual([...computedStyleProperties]);
	expect(computed.cssText).toBe("");
	for (const decoration of decorations) {
		expect(inlineProperties).toContain(decoration.canonical);
		expect(inlineProperties).not.toContain(decoration.alias);
		expect(names(computed)).not.toContain(decoration.alias);
		for (const accessor of accessors(decoration)) {
			expect(Object.hasOwn(style, accessor)).toBe(true);
			expect(Object.hasOwn(computed, accessor)).toBe(true);
		}
	}
});

it("expands and resets the shorthand including canonical thickness only", () => {
	const { style } = fixture(
		"text-decoration:overline 3px solid blue;text-underline-offset:2px",
	);
	style.WebkitTextDecoration = "underline red";
	expect(style.textDecorationLine).toBe("underline");
	expect(style.textDecorationStyle).toBe("solid");
	expect(style.textDecorationColor).toBe("red");
	expect(style.getPropertyValue("text-decoration-thickness")).toBe("auto");
	expect(style.getPropertyValue("text-underline-offset")).toBe("2px");
	style.webkitTextDecoration = "none";
	expect(style.textDecoration).toBe("none solid currentcolor");
	expect(style.getPropertyValue("text-decoration-thickness")).toBe("auto");
	expect(style.getPropertyValue("text-underline-offset")).toBe("2px");
});

it("removes all shorthand components through either spelling", () => {
	for (const name of ["-webkit-text-decoration", "text-decoration"]) {
		const { style } = fixture("text-underline-offset:2px");
		style.setProperty("-webkit-text-decoration", "underline 3px solid red");
		expect(style.removeProperty(name)).toBe("underline 3px solid red");
		for (const component of cssTextDecorationProperties)
			expect(style.getPropertyValue(component)).toBe("");
		expect(names(style)).toEqual(["text-underline-offset"]);
		expect(style.getPropertyValue("text-underline-offset")).toBe("2px");
	}
});

it("removes one aliased longhand without removing its siblings", () => {
	const { style, computed } = fixture("-webkit-text-decoration:underline red");
	const canonical = fixture("text-decoration:underline red");
	expect(style.removeProperty("-webkit-text-decoration-color")).toBe("red");
	canonical.style.removeProperty("text-decoration-color");
	expect(style.textDecoration).toBe("");
	expect(style.textDecorationLine).toBe("underline");
	expect(style.textDecorationStyle).toBe("solid");
	expectParity(style, canonical.style);
	expectParity(computed, canonical.computed);
});

it.each([
	"-webkit-text-decoration:underline red;text-decoration:overline blue",
	"text-decoration:overline blue;-webkit-text-decoration:underline red",
	"-webkit-text-decoration:underline red!important;text-decoration:overline blue",
	"text-decoration:overline blue!important;-webkit-text-decoration:underline red!important",
	"-webkit-text-decoration:underline red;text-decoration-color:blue!important;-webkit-text-decoration-line:overline",
	"text-decoration-line:overline!important;-webkit-text-decoration:underline red;-webkit-text-decoration-color:blue!important",
])(
	"preserves mixed shorthand/longhand priority and source order: %s",
	(source) => {
		const { style, computed } = fixture();
		const canonical = fixture();
		style.cssText = source;
		canonical.style.cssText = source.replaceAll("-webkit-", "");
		expectParity(style, canonical.style);
		expectParity(computed, canonical.computed);
		expect(style.cssText).not.toContain("-webkit-");
	},
);

it("keeps stylesheet importance authoritative over ordinary inline aliases", () => {
	const { style, computed } = fixture(
		"",
		"#target{text-decoration:underline red!important}",
	);
	style.webkitTextDecoration = "overline blue";
	expect(computed.textDecorationLine).toBe("underline");
	expect(computed.webkitTextDecorationColor).toBe("rgb(255, 0, 0)");
	style.setProperty("-webkit-text-decoration", "overline blue", "important");
	expect(computed.WebkitTextDecorationLine).toBe("overline");
	expect(computed.textDecorationColor).toBe("rgb(0, 0, 255)");
	style.removeProperty("text-decoration");
	expect(computed.webkitTextDecorationLine).toBe("underline");
});

it.each(["inherit", "initial", "unset", "revert"])(
	"matches canonical CSS-wide %s on shorthand and longhands",
	(value) => {
		for (const decoration of decorations) {
			const css = "#outer{text-decoration:overline 3px solid blue;color:red}";
			const actual = fixture("", css);
			const canonical = fixture("", css);
			actual.style.setProperty(decoration.alias, value);
			canonical.style.setProperty(decoration.canonical, value);
			expectAliases(actual.style, decoration, value);
			expectParity(actual.style, canonical.style);
			expectParity(actual.computed, canonical.computed);
		}
	},
);

it("does not turn decoration aliases into inherited properties", () => {
	const actual = fixture("", "#outer{-webkit-text-decoration:overline blue}");
	const canonical = fixture("", "#outer{text-decoration:overline blue}");
	expectParity(actual.computed, canonical.computed);
	expect(actual.computed.webkitTextDecorationLine).toBe("none");
	expect(actual.computed.webkitTextDecorationColor).toBe("rgb(0, 0, 0)");
});

it.each(decorations)(
	"matches canonical variable source, substitution and invalidation for $alias",
	(decoration) => {
		const css = `#outer{--decoration:${decoration.value}}`;
		const actual = fixture(`${decoration.alias}:var(--decoration)`, css);
		const canonical = fixture(`${decoration.canonical}:var(--decoration)`, css);
		expectAliases(actual.style, decoration, "var(--decoration)");
		expectParity(actual.style, canonical.style);
		expectParity(actual.computed, canonical.computed);
		for (const value of [decoration.replacement, decoration.invalid]) {
			for (const context of [actual, canonical])
				context.tree.setAttribute(
					context.outer,
					"style",
					`--decoration:${value}`,
				);
			expectParity(actual.computed, canonical.computed);
		}
		actual.style[decoration.lower] = `var(--missing,${decoration.value})`;
		canonical.style[decoration.camel] = `var(--missing,${decoration.value})`;
		expectParity(actual.style, canonical.style);
		expectParity(actual.computed, canonical.computed);
		actual.style[decoration.upper] = "var(--missing)";
		canonical.style[decoration.camel] = "var(--missing)";
		expectParity(actual.style, canonical.style);
		expectParity(actual.computed, canonical.computed);
	},
);

it("preserves canonical pending shorthand behavior after a longhand override", () => {
	const actual = fixture(
		"--decoration:underline red;-webkit-text-decoration:var(--decoration)",
	);
	const canonical = fixture(
		"--decoration:underline red;text-decoration:var(--decoration)",
	);
	expect(actual.style.webkitTextDecoration).toBe("var(--decoration)");
	expect(actual.style.webkitTextDecorationColor).toBe("");
	actual.style.WebkitTextDecorationColor = "blue";
	canonical.style.textDecorationColor = "blue";
	expect(actual.style.webkitTextDecoration).toBe("");
	expectParity(actual.style, canonical.style);
	expectParity(actual.computed, canonical.computed);
	expect(actual.style.removeProperty("-webkit-text-decoration")).toBe(
		canonical.style.removeProperty("text-decoration"),
	);
	expectParity(actual.style, canonical.style);
	expectParity(actual.computed, canonical.computed);
});

it("keeps saved CSSOM reads live across class and external style mutations", () => {
	const { tree, id, dom, element, style, computed } = fixture(
		"",
		"#target{text-decoration:underline red}#target.active{-webkit-text-decoration:overline blue}",
	);
	const another = dom.getComputedStyle(element) as Style;
	expect(another).not.toBe(computed);
	expect(computed.webkitTextDecorationLine).toBe("underline");
	tree.setAttribute(id, "class", "active");
	expect(computed.WebkitTextDecorationLine).toBe("overline");
	expect(another.webkitTextDecorationColor).toBe("rgb(0, 0, 255)");
	tree.setAttribute(
		id,
		"style",
		"-webkit-text-decoration:line-through red!important",
	);
	expect(element.style).toBe(style);
	expect(style.textDecorationLine).toBe("line-through");
	expect(style.getPropertyPriority("-webkit-text-decoration")).toBe(
		"important",
	);
	expect(computed.webkitTextDecorationLine).toBe("line-through");
	style.removeProperty("text-decoration");
	expect(another.WebkitTextDecorationLine).toBe("overline");
});

it("resolves exact CSS aliases without accepting camel names as CSS properties", () => {
	const { tree, id, computed } = fixture("text-decoration:underline red");
	for (const decoration of decorations) {
		expect(canonicalCssProperty(decoration.alias)).toBe(decoration.canonical);
		expect(resolvedStyleValue(tree, id, decoration.alias)).toBe(
			resolvedStyleValue(tree, id, decoration.canonical),
		);
		expect(computed.getPropertyValue(decoration.alias.toUpperCase())).toBe(
			computed.getPropertyValue(decoration.canonical),
		);
		for (const name of [
			decoration.camel,
			decoration.upper,
			decoration.lower,
			decoration.alias.toUpperCase(),
		]) {
			expect(canonicalCssProperty(name)).toBe(name);
			expect(resolvedStyleValue(tree, id, name)).toBe("");
		}
	}
});

it("rejects computed alias accessors, methods and cssText mutations", () => {
	const { tree, style, computed } = fixture("text-decoration:underline red");
	const source = style.cssText;
	const revision = tree.revision;
	for (const decoration of decorations) {
		for (const accessor of accessors(decoration))
			expect(() => {
				computed[accessor] = decoration.replacement;
			}).toThrow("read-only");
		for (const name of [decoration.alias, decoration.canonical]) {
			expect(() => computed.setProperty(name, decoration.replacement)).toThrow(
				"read-only",
			);
			expect(() => computed.removeProperty(name)).toThrow("read-only");
		}
	}
	expect(() => {
		computed.cssText = "-webkit-text-decoration:none";
	}).toThrow("read-only");
	expect(tree.revision).toBe(revision);
	expect(style.cssText).toBe(source);
	expect(computed.cssText).toBe("");
	expect(computed.webkitTextDecorationLine).toBe("underline");
});

it.each(decorations)(
	"rejects invalid $alias writes atomically",
	(decoration) => {
		const actual = fixture("text-decoration:underline 3px solid red!important");
		const canonical = fixture(
			"text-decoration:underline 3px solid red!important",
		);
		const source = actual.style.cssText;
		const revision = actual.tree.revision;
		for (const value of [
			decoration.invalid,
			`${decoration.value}!important`,
			"inherit underline",
			"var(",
			"none".repeat(1025),
		]) {
			for (const accessor of accessors(decoration))
				actual.style[accessor] = value;
			actual.style.setProperty(decoration.alias, value);
			canonical.style.setProperty(decoration.canonical, value);
		}
		actual.style.setProperty(
			decoration.alias,
			decoration.replacement,
			"invalid",
		);
		expect(actual.tree.revision).toBe(revision);
		expect(actual.style.cssText).toBe(source);
		expectParity(actual.style, canonical.style);
		expectParity(actual.computed, canonical.computed);
	},
);

it("rejects unsupported prefix, thickness, skip and method camel spellings", () => {
	const { tree, id, style, computed } = fixture(
		"text-decoration:underline red",
	);
	const revision = tree.revision;
	for (const name of [
		"-webkit-text-decoration-thickness",
		"-webkit-text-decoration-skip",
		"-webkit-text-decoration-skip-ink",
		"-webkit-text-underline-offset",
		"-moz-text-decoration",
		"-ms-text-decoration",
		" -webkit-text-decoration",
		"-webkit-text-decoration ",
		"__proto__",
		"constructor",
		...decorations.flatMap(({ camel, upper, lower }) => [camel, upper, lower]),
	]) {
		expect(canonicalCssProperty(name)).toBe(name);
		style.setProperty(name, "none");
		expect(style.getPropertyValue(name)).toBe("");
		expect(style.getPropertyPriority(name)).toBe("");
		expect(style.removeProperty(name)).toBe("");
		expect(computed.getPropertyValue(name)).toBe("");
		expect(resolvedStyleValue(tree, id, name)).toBe("");
	}
	expect(tree.revision).toBe(revision);
	expect(style.textDecoration).toBe("underline solid red");
});

it.each(["", null])("removes alias state for the scalar value %j", (value) => {
	for (const decoration of decorations) {
		const { style } = fixture();
		for (const accessor of accessors(decoration)) {
			style.setProperty(decoration.canonical, decoration.value);
			Reflect.set(style, accessor, value);
			expectAliases(style, decoration, "");
			expect(names(style)).toEqual([]);
		}
		style.setProperty(decoration.alias, decoration.value);
		style.setProperty(decoration.alias, value);
		expect(names(style)).toEqual([]);
	}
});

it("rejects coercion and missing arguments before invoking user code", () => {
	const { style, computed } = fixture("text-decoration:underline red");
	let calls = 0;
	const object = {
		toString() {
			calls++;
			return "none";
		},
	};
	for (const decoration of decorations) {
		for (const accessor of accessors(decoration))
			expect(() => Reflect.set(style, accessor, object)).toThrow("coercion");
		for (const operation of [
			() => Reflect.set(style, decoration.alias, Symbol("value")),
			() => style.setProperty(decoration.alias, object),
			() => style.setProperty(decoration.alias, decoration.value, object),
			() => style.getPropertyValue(object),
			() => computed.getPropertyValue(object),
		])
			expect(operation).toThrow("coercion");
		expect(() => style.setProperty(decoration.alias)).toThrow("argument");
	}
	expect(() => computed.getPropertyValue()).toThrow("argument");
	expect(calls).toBe(0);
	expect(style.textDecoration).toBe("underline solid red");
});

it("keeps detached inline aliases live and restores computed reads on attachment", () => {
	const { tree, id, outer, style, computed } = fixture(
		"-webkit-text-decoration:underline red",
	);
	tree.remove(id);
	expect(style.webkitTextDecoration).toBe("underline solid red");
	for (const decoration of decorations) {
		expectAliases(computed, decoration, "");
		expect(resolvedStyleValue(tree, id, decoration.alias)).toBe("");
	}
	expect(computed.length).toBe(0);
	style.WebkitTextDecoration = "overline blue";
	tree.append(outer, id);
	expect(computed.webkitTextDecorationLine).toBe("overline");
	expect(computed.webkitTextDecorationColor).toBe("rgb(0, 0, 255)");
	expect(computed.length).toBe(computedStyleProperties.length);
});

it.each(["document", "dom"])("revokes saved aliases on %s close", (kind) => {
	const { tree, id, dom, style, computed } = fixture(
		"text-decoration:underline red",
	);
	const readInline = style.getPropertyValue;
	const readComputed = computed.getPropertyValue;
	if (kind === "document") tree.close();
	else dom.close();
	for (const decoration of decorations) {
		for (const accessor of accessors(decoration)) {
			expect(() => style[accessor]).toThrow(/closed/i);
			expect(() => Reflect.set(style, accessor, decoration.value)).toThrow(
				/closed/i,
			);
			expect(() => computed[accessor]).toThrow(/closed/i);
		}
		for (const operation of [
			() => readInline(decoration.alias),
			() => readComputed(decoration.alias),
			() => style.removeProperty(decoration.alias),
			() => style.setProperty(decoration.alias, decoration.value),
		])
			expect(operation).toThrow(/closed/i);
		if (kind === "document")
			expect(() => resolvedStyleValue(tree, id, decoration.alias)).toThrow(
				/closed/i,
			);
	}
});

it("bounds alias updates by canonical declaration and object counts", () => {
	const { tree, id, outer } = fixture();
	const owner = new InlineStyles(tree, factory, {
		maxObjects: 1,
		maxDeclarations: cssTextDecorationProperties.length,
	});
	const style = owner.get(id) as Style;
	style.webkitTextDecoration = "underline red";
	for (const decoration of decorations)
		for (const accessor of accessors(decoration))
			style[accessor] = decoration.value;
	expect(names(style)).toEqual([...cssTextDecorationProperties]);
	expect(owner.get(id)).toBe(style);
	expect(owner.stats.objects).toBe(1);
	const source = style.cssText;
	const revision = tree.revision;
	expect(() => style.setProperty("width", "1px")).toThrow("limit");
	expect(() => owner.get(outer)).toThrow("limit");
	expect(style.cssText).toBe(source);
	expect(tree.revision).toBe(revision);
});

it("rejects shorthand expansion beyond the declaration limit atomically", () => {
	const { tree, id } = fixture();
	const owner = new InlineStyles(tree, factory, {
		maxDeclarations: cssTextDecorationProperties.length - 1,
	});
	const style = owner.get(id) as Style;
	style.webkitTextDecorationLine = "overline";
	const source = tree.get(id).attributes.style;
	const revision = tree.revision;
	const cache = owner.stats.cachedCodeUnits;
	expect(() => {
		style.WebkitTextDecoration = "underline red";
	}).toThrow("limit");
	expect(tree.get(id).attributes.style).toBe(source);
	expect(tree.revision).toBe(revision);
	expect(owner.stats.cachedCodeUnits).toBe(cache);
	expect(names(style)).toEqual(["text-decoration-line"]);
	expect(style.webkitTextDecorationLine).toBe("overline");
});

it.each([
	{ maxCodeUnits: 40 },
	{ maxCachedCodeUnits: 40 },
] satisfies Partial<InlineStyleLimits>[])(
	"retains source, cache and revision when alias serialization exceeds %j",
	(limits) => {
		const { tree, id } = fixture();
		const owner = new InlineStyles(tree, factory, limits);
		const style = owner.get(id) as Style;
		style.webkitTextDecorationLine = "none";
		const source = tree.get(id).attributes.style;
		const revision = tree.revision;
		const cache = owner.stats.cachedCodeUnits;
		expect(() =>
			style.setProperty(
				"-webkit-text-decoration-line",
				"underline",
				"important",
			),
		).toThrow("limit");
		expect(tree.get(id).attributes.style).toBe(source);
		expect(tree.revision).toBe(revision);
		expect(owner.stats.cachedCodeUnits).toBe(cache);
		expect(style.textDecorationLine).toBe("none");
	},
);

it("preserves computed argument and object limits with alias reads", () => {
	const { tree, id } = fixture("text-decoration:underline red");
	const owner = new ComputedStyles(tree, factory, 1);
	const computed = owner.get(id) as Style;
	expect(computed.webkitTextDecorationLine).toBe("underline");
	expect(() =>
		computed.getPropertyValue("-webkit-text-decoration".repeat(1025)),
	).toThrow("limit");
	expect(() => owner.get(id)).toThrow("limit");
	expect(computed.WebkitTextDecorationColor).toBe("rgb(255, 0, 0)");
	expect(owner.metrics().objects).toBe(1);
});
