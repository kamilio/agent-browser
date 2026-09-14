import { afterEach, expect, it } from "vitest";
import { ComputedStyles, resolvedStyleValue } from "./computed-styles.js";
import {
	expandDeclaration,
	inlineDeclarationComponents,
	inlineProperties,
	parseInlineDeclarations,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import { cssFontProperties, parseFontWideDeclarations } from "./css-font.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles, type InlineStyleLimits } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	font: string;
	fontFamily: string;
	fontSize: string;
	fontStyle: string;
	fontWeight: string;
	lineHeight: string;
	cssText: string;
	readonly length: number;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: unknown, priority?: unknown): void;
	removeProperty(name: string): string;
	item(index: number): string;
}

const documents: DocumentTree[] = [];
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
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(source = "", limits: Partial<InlineStyleLimits> = {}) {
	const tree = parseHtmlDocument(
		'<main id="parent" style="font-size:24px;font-style:italic;font-weight:700;line-height:2"><span id="target">Text</span></main>',
		"https://fixture.invalid/font-wide-cssom",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const target = queries.querySelector("#target");
	queries.close();
	if (target === null) throw new Error("Missing target");
	if (source) tree.setAttribute(target, "style", source);
	const owner = new InlineStyles(tree, factory, limits);
	const style = owner.get(target) as Style;
	const computed = new ComputedStyles(tree, factory).get(target) as Style;
	return { tree, target, owner, style, computed, styles: documentStyles(tree) };
}

function names(style: Style) {
	return Array.from({ length: style.length }, (_value, index) =>
		style.item(index),
	);
}

it("defines exactly the existing five font components without changing all", () => {
	expect(Object.isFrozen(cssFontProperties)).toBe(true);
	expect(
		inlineProperties.filter((property) => property === "font"),
	).toHaveLength(1);
	expect(inlineDeclarationComponents("font")).toBe(cssFontProperties);
	const all = inlineDeclarationComponents("all");
	expect(all).not.toContain("font");
	for (const property of cssFontProperties)
		expect(all.filter((component) => component === property)).toHaveLength(1);
	for (const property of [
		"white-space",
		"text-align",
		"hyphens",
		"text-transform",
		"font-variant",
		"font-stretch",
	])
		expect(cssFontProperties as readonly string[]).not.toContain(property);
});

it.each(["initial", "inherit", "unset", "revert"])(
	"expands and serializes the native font keyword %s",
	(value) => {
		const { style } = fixture();
		style.font = value.toUpperCase();
		expect(style.font).toBe(value);
		expect(style.getPropertyValue("FONT")).toBe(value);
		expect(names(style)).toEqual([...cssFontProperties]);
		expect(style.cssText).toBe(`font: ${value};`);
		expect(parseFontWideDeclarations(`\t${value.toUpperCase()}\n`)).toEqual(
			cssFontProperties.map((property) => ({ property, value })),
		);
		for (const property of cssFontProperties)
			expect(style.getPropertyValue(property)).toBe(value);
		style.setProperty("FONT", value, "IMPORTANT");
		expect(style.getPropertyPriority("font")).toBe("important");
		expect(style.cssText).toBe(`font: ${value} !important;`);
		expect(style.removeProperty("font")).toBe(value);
		expect(style.length).toBe(0);
		expect(style.font).toBe("");
	},
);

it.each(["", null])("removes all font components with scalar %j", (value) => {
	const { style } = fixture("font:inherit;color:red");
	style.setProperty("font", value);
	expect(style.font).toBe("");
	expect(names(style)).toEqual(["color"]);
});

it("resets exactly the font components while retaining other text values", () => {
	const { style } = fixture(
		"font-size:10px;font-family:serif;font-style:italic;font-weight:700;line-height:3;white-space:pre;text-align:right;text-transform:uppercase;text-indent:2px;hyphens:none",
	);
	style.font = "initial";
	for (const property of cssFontProperties)
		expect(style.getPropertyValue(property)).toBe("initial");
	expect(style.getPropertyValue("white-space")).toBe("pre");
	expect(style.getPropertyValue("text-align")).toBe("right");
	expect(style.getPropertyValue("text-transform")).toBe("uppercase");
	expect(style.getPropertyValue("text-indent")).toBe("2px");
	expect(style.getPropertyValue("hyphens")).toBe("none");
});

it.each(cssFontProperties)(
	"requires complete uniform values for %s",
	(property) => {
		const { style } = fixture("font:inherit");
		style.setProperty(property, "initial");
		expect(style.font).toBe("");
		expect(style.cssText).not.toContain("font:");
		style.setProperty(property, "inherit", "important");
		expect(style.font).toBe("");
		expect(style.getPropertyPriority("font")).toBe("");
		style.setProperty(property, "inherit");
		expect(style.font).toBe("inherit");
		style.removeProperty(property);
		expect(style.font).toBe("");
		expect(style.length).toBe(4);
	},
);

it("does not manufacture a shorthand from ordinary computed font components", () => {
	const { tree, target, style, computed } = fixture(
		"font-size:16px;font-family:monospace;font-style:normal;font-weight:400;line-height:normal",
	);
	expect(style.font).toBe("");
	expect(style.cssText).not.toContain("font:");
	expect(computed.getPropertyValue("font")).toBe("");
	expect(resolvedStyleValue(tree, target, "font")).toBe("");
	expect(computed.fontSize).toBe("16px");
});

it("uses actual winning values when serializing a direct declaration list", () => {
	const entries = expandDeclaration("font", "inherit", false);
	expect(
		propertyValue(
			[{ name: "font-size", value: "initial", important: false }, ...entries],
			"font",
		),
	).toBe("inherit");
	expect(
		propertyValue(
			[...entries, { name: "font-size", value: "initial", important: true }],
			"font",
		),
	).toBe("");
});

it.each([
	["font-size:10px!important;font:inherit", "10px", ""],
	["font:inherit!important;font-size:10px", "24px", "inherit"],
	["font:initial;font:inherit", "24px", "inherit"],
	["font:inherit;font:initial", "16px", "initial"],
])(
	"preserves declaration-list priority and order in %s",
	(source, size, shorthand) => {
		const { style, computed } = fixture(source);
		expect(style.font).toBe(shorthand);
		expect(computed.fontSize).toBe(size);
		const reparsed = fixture(style.cssText);
		expect(reparsed.computed.fontSize).toBe(size);
		expect(reparsed.style.font).toBe(shorthand);
	},
);

it("treats a direct shorthand setter as replacement, not stylesheet priority", () => {
	const { style, computed } = fixture("font-size:10px!important");
	style.font = "inherit";
	expect(style.getPropertyPriority("font-size")).toBe("");
	expect(computed.fontSize).toBe("24px");
});

it.each([
	"italic 16px monospace",
	"caption",
	"menu",
	"normal",
	"revert-layer",
	"inherit italic",
	"initial inherit",
	"inherit!important",
	"var(",
	"inherit; color:red",
])("rejects unsupported or invalid font write %s atomically", (value) => {
	const { tree, style } = fixture("font:inherit!important;color:blue");
	const before = style.cssText;
	const revision = tree.revision;
	style.font = value;
	style.setProperty("font", value);
	expect(style.cssText).toBe(before);
	expect(tree.revision).toBe(revision);
});

it("keeps invalid priority and object coercion atomic", () => {
	const { tree, style } = fixture("font:inherit");
	const revision = tree.revision;
	style.setProperty("font", "initial", "invalid");
	expect(() =>
		style.setProperty("font", {
			toString() {
				throw new Error("must not run");
			},
		}),
	).toThrow("coercion");
	expect(style.font).toBe("inherit");
	expect(tree.revision).toBe(revision);
});

it("preserves variable spelling and pending components with a keyword fallback", () => {
	const { style, computed } = fixture();
	style.font = "var(--Font, inherit)";
	expect(style.font).toBe("var(--Font, inherit)");
	expect(style.cssText).toBe("font: var(--Font, inherit);");
	expect(computed.fontSize).toBe("24px");
	for (const entry of parseInlineDeclarations(style.cssText, 5))
		expect(entry).toMatchObject({
			pending: "font",
			value: "var(--Font, inherit)",
		});
	for (const property of cssFontProperties)
		expect(style.getPropertyValue(property)).toBe("");
	expect(style.removeProperty("font")).toBe("var(--Font, inherit)");
	expect(style.length).toBe(0);
});

it.each([false, true])(
	"round-trips pending font with an important=%s override",
	(important) => {
		const { style, computed } = fixture("font:var(--Font,inherit)");
		style.setProperty("font-size", "12px", important ? "important" : "");
		expect(style.font).toBe("");
		expect(computed.fontSize).toBe("12px");
		expect(style.cssText).toContain("font: var(--Font,inherit);");
		const reparsed = fixture(style.cssText);
		for (const property of cssFontProperties)
			expect(reparsed.computed.getPropertyValue(property)).toBe(
				computed.getPropertyValue(property),
			);
		expect(reparsed.style.getPropertyPriority("font-size")).toBe(
			important ? "important" : "",
		);
	},
);

it("retains in-memory pending components after a partial removal", () => {
	const { tree, target, style, computed } = fixture(
		"font:var(--Missing,initial)",
	);
	style.removeProperty("font-size");
	expect(style.font).toBe("");
	expect(style.length).toBe(4);
	expect(computed.fontSize).toBe("24px");
	expect(computed.fontStyle).toBe("normal");
	expect(
		tree
			.getInlineDeclarations(target)
			?.filter((entry) => entry.pending === "font"),
	).toHaveLength(4);
});

it.each([
	"all:var(--All,initial);font:var(--Font,inherit)",
	"all:var(--All,initial);font:var(--Font,inherit)!important",
	"all:var(--All,initial)!important;font:var(--Font,inherit)!important",
	"all:var(--All,initial)!important;font:var(--Font,inherit)",
	"font-size:10px;all:var(--All,initial);font:var(--Font,inherit)",
	"all:var(--All,initial);font:var(--Font,inherit);font-size:12px",
	"font-size:12px!important;all:var(--All,initial);font:var(--Font,inherit)!important;font-size:20px!important",
	"font:var(--Font,inherit)!important;all:var(--All,initial)",
	"all:var(--All,initial);font:var(--Font,inherit);margin:var(--Space,2px)",
	"all:var(--All,initial);border:var(--Border,1px solid red);border-color:var(--Ink,blue);font:var(--Font,inherit)",
	"border-left-color:red!important;all:var(--All,initial);border:var(--Border,1px solid red)!important;border-color:var(--Ink,blue)!important;font:var(--Font,inherit);border-left-color:green!important",
])(
	"preserves deferred all and font winners through round-trip: %s",
	(source) => {
		const entries = parseInlineDeclarations(source, 1024);
		const serialized = serializeDeclarations(entries);
		const reparsed = parseInlineDeclarations(serialized, 1024);
		expect(reparsed).toHaveLength(entries.length);
		for (const entry of entries)
			expect(
				reparsed.find((candidate) => candidate.name === entry.name),
			).toEqual(entry);
		const original = fixture(source);
		const restored = fixture(serialized);
		for (const property of [
			...cssFontProperties,
			"color",
			"text-align",
			"white-space",
		])
			expect(restored.computed.getPropertyValue(property)).toBe(
				original.computed.getPropertyValue(property),
			);
		original.style.cssText = original.style.cssText;
		for (const property of [
			...cssFontProperties,
			"color",
			"text-align",
			"white-space",
		])
			expect(original.computed.getPropertyValue(property)).toBe(
				restored.computed.getPropertyValue(property),
			);
	},
);

it("keeps cached computed longhands live across shorthand changes", () => {
	const { tree, target, style, computed, styles } = fixture("font-size:10px");
	const before = styles.text(target);
	style.font = "inherit";
	expect(styles.text(target)).not.toBe(before);
	expect(computed.fontSize).toBe("24px");
	expect(computed.lineHeight).toBe("48px");
	tree.setAttribute(target, "style", "font:initial");
	expect(style.font).toBe("initial");
	expect(computed.fontSize).toBe("16px");
	expect(computed.fontWeight).toBe("400");
});

it.each(["", "important"])(
	"round-trips direct pending setters with early scalar slot and priority %s",
	(priority) => {
		const { tree, target, style, computed } = fixture("font-size:10px");
		style.setProperty("all", "var(--All,initial)", priority);
		style.setProperty("font", "var(--Font,inherit)", priority);
		style.setProperty("font-size", "12px", priority);
		const entries = tree.getInlineDeclarations(target);
		expect(entries).toBeDefined();
		if (!entries) throw new Error("Missing inline declaration state");
		const reparsed = parseInlineDeclarations(style.cssText, 1024);
		expect(reparsed).toHaveLength(entries.length);
		for (const entry of entries)
			expect(
				reparsed.find((candidate) => candidate.name === entry.name),
			).toEqual(entry);
		style.cssText = style.cssText;
		expect(computed.fontSize).toBe("12px");
		expect(style.getPropertyPriority("font-size")).toBe(priority);
		expect(
			tree
				.getInlineDeclarations(target)
				?.find((entry) => entry.name === "color"),
		).toMatchObject({ pending: "all" });
	},
);

it("rejects an overflowing five-component expansion without changing state", () => {
	const { tree, target, owner, style } = fixture("font-size:10px", {
		maxDeclarations: 4,
	});
	const revision = tree.revision;
	const source = tree.get(target).attributes.style;
	expect(style.fontSize).toBe("10px");
	const cached = owner.stats.cachedCodeUnits;
	expect(() => {
		style.font = "inherit";
	}).toThrow("limit");
	expect(tree.revision).toBe(revision);
	expect(tree.get(target).attributes.style).toBe(source);
	expect(owner.stats.cachedCodeUnits).toBe(cached);
	expect(names(style)).toEqual(["font-size"]);
});

it("allows exactly five font declarations without an extra shorthand slot", () => {
	const { style } = fixture("", { maxDeclarations: 5 });
	style.font = "inherit";
	expect(style.length).toBe(5);
	style.fontSize = "12px";
	expect(style.length).toBe(5);
	expect(() => style.setProperty("color", "red")).toThrow("limit");
});

it("revokes shorthand reads and writes after document close", () => {
	const { tree, style } = fixture("font:inherit");
	tree.close();
	expect(() => style.font).toThrow("closed");
	expect(() => {
		style.font = "initial";
	}).toThrow("closed");
});
