import { afterEach, expect, it } from "vitest";
import {
	inlineDeclarationComponents,
	parseInlineDeclarations,
	serializeDeclarations,
} from "./css-declarations.js";
import { documentGeometry } from "./document-geometry.js";
import { DocumentTree } from "./document.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { documentStyles } from "./styles.js";

interface Style {
	cssText: string;
	length: number;
	item(index: number): string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
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
		if (definition.indexed)
			Object.defineProperty(target, "length", {
				get: definition.indexed.length,
			});
		return target;
	},
};
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(source = "") {
	const tree = new DocumentTree("https://fixture.invalid/inline-serialization");
	trees.push(tree);
	const id = tree.createElement("div", { style: source });
	tree.append(tree.root, id);
	const owner = new InlineStyles(tree, factory);
	const style = owner.get(id) as Style;
	return { tree, id, owner, style };
}
function names(style: Style) {
	return Array.from({ length: style.length }, (_, index) => style.item(index));
}
function normalized(source: string) {
	return parseInlineDeclarations(source, 256).sort((left, right) =>
		left.name.localeCompare(right.name),
	);
}

it.each([
	["border", "2px solid red"],
	["border-top", "2px solid red"],
	["border-right", "2px solid red"],
	["border-bottom", "2px solid red"],
	["border-left", "2px solid red"],
	["border-width", "1px 2px 3px 4px"],
	["border-style", "solid none hidden"],
	["border-color", "red blue green"],
	["flex", "2 3 10px"],
	["flex-flow", "column wrap"],
	["gap", "4px 8px"],
])("serializes the supported %s shorthand", (property, value) => {
	for (const priority of ["", " !important"]) {
		const source = `${property}:${value}${priority}`;
		const { style } = fixture(source);
		expect(style.cssText).toBe(`${property}: ${value}${priority};`);
		expect(serializeDeclarations(parseInlineDeclarations(source, 256))).toBe(
			style.cssText,
		);
		expect(normalized(style.cssText)).toEqual(normalized(source));
	}
});

it.each(["initial", "inherit", "unset", "revert"])(
	"compacts supported border and flex families with the uniform %s value",
	(value) => {
		const { style } = fixture(
			`border:${value};flex:${value};flex-flow:${value};gap:${value}`,
		);
		expect(style.cssText).toBe(
			`border: ${value}; flex: ${value}; flex-flow: ${value}; gap: ${value};`,
		);
	},
);

it("prefers the complete border over overlapping side and component shorthands", () => {
	const source =
		"border-top:2px solid red;border-right:2px solid red;border-bottom:2px solid red;border-left:2px solid red";
	const { style } = fixture(source);
	expect(style.cssText).toBe("border: 2px solid red;");
	expect(normalized(style.cssText)).toEqual(normalized(source));
});

it("emits each border component once when only smaller shorthands serialize", () => {
	const source =
		"border:2px solid red;border-left-width:4px;border-top-color:blue";
	const { style } = fixture(source);
	expect(style.cssText).toBe(
		"border-width: 2px 2px 2px 4px; border-style: solid; border-color: blue red red;",
	);
	expect(normalized(style.cssText)).toEqual(normalized(source));
});

it("does not reuse already emitted components in overlapping border shorthands", () => {
	const source =
		"border-top:1px solid red;border-right-width:2px;border-bottom-width:3px;border-left-width:4px";
	const { style } = fixture(source);
	expect(style.cssText).toBe(
		"border-width: 1px 2px 3px 4px; border-top-style: solid; border-top-color: red;",
	);
	expect(normalized(style.cssText)).toEqual(normalized(source));
});

it("keeps mixed priorities out of a shorthand while compacting independent groups", () => {
	const source =
		"border:2px solid red;border-left-width:4px!important;flex:2 3 10px;flex-grow:4!important;gap:4px 8px";
	const { style } = fixture(source);
	expect(style.cssText).not.toMatch(/(?:^| )border(?:-width)?:/);
	expect(style.cssText).toContain("gap: 4px 8px;");
	expect(style.cssText).not.toContain("flex:");
	expect(normalized(style.cssText)).toEqual(normalized(source));
});

it("does not compact incomplete or mixed CSS-wide groups", () => {
	const source =
		"border-top-width:1px;border-top-style:solid;flex-grow:initial;flex-shrink:2;flex-basis:10px;row-gap:3px";
	const { style } = fixture(source);
	expect(style.cssText).not.toMatch(/(?:^| )(?:border-top|flex|gap):/);
	expect(normalized(style.cssText)).toEqual(normalized(source));
});

it("compacts disjoint ordinary groups beside an incomplete pending shorthand", () => {
	const { style } = fixture(
		"margin:var(--space);padding:4px;border:2px solid red;flex:2 3 10px",
	);
	style.removeProperty("margin-left");
	expect(style.cssText).toBe(
		"margin-top: ; margin-right: ; margin-bottom: ; padding: 4px; border: 2px solid red; flex: 2 3 10px;",
	);
	expect(style.getPropertyValue("margin-top")).toBe("");
});

it("preserves pending origins rather than inventing a different border shorthand", () => {
	const { style } = fixture("border:var(--line);gap:var(--space)");
	style.removeProperty("border-left-width");
	expect(style.cssText).not.toMatch(
		/(?:^| )border(?:-top|-color|-style|-width)?:/,
	);
	expect(style.cssText).toContain("gap: var(--space);");
	expect(style.getPropertyValue("border-top")).toBe("");
});

const unorderedFlex = "flex-basis:10px;display:flex;flex-shrink:3;flex-grow:2";
it("retains enumeration and shared layout across flex shorthand compaction", () => {
	const { tree, id, owner, style } = fixture(unorderedFlex);
	const before = names(style);
	style.setProperty("width", "60px");
	style.setProperty("height", "20px");
	expect(style.cssText).toBe(
		"flex: 2 3 10px; display: flex; width: 60px; height: 20px;",
	);
	expect(names(style)).toEqual([...before, "width", "height"]);
	expect(tree.getInlineDeclarations(id)).toBeDefined();
	const other = new InlineStyles(tree, factory).get(id) as Style;
	owner.close();
	expect(names(other)).toEqual([...before, "width", "height"]);
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(60);
	other.setProperty("flex-grow", "4");
	expect(other.cssText).toContain("flex: 4 3 10px;");
	expect(names(other)).toEqual([...before, "width", "height"]);
});

it.each(["clone", "import"])(
	"%s copies serialized attributes without sharing retained declaration order",
	(mode) => {
		const { tree, id, style } = fixture(unorderedFlex);
		style.setProperty("width", "60px");
		const target = mode === "clone" ? tree : fixture().tree;
		const copied =
			mode === "clone" ? tree.clone(id) : target.copyFrom(tree, id);
		const copy = new InlineStyles(target, factory).get(copied) as Style;
		expect(target.get(copied).attributes.style).toBe(style.cssText);
		expect(target.getInlineDeclarations(copied)).toBeUndefined();
		expect(names(copy)).toEqual([
			"flex-grow",
			"flex-shrink",
			"flex-basis",
			"display",
			"width",
		]);
		expect(names(style)[0]).toBe("flex-basis");
		copy.setProperty("flex-grow", "9");
		expect(style.getPropertyValue("flex-grow")).toBe("2");
	},
);

it("retains component state after serializing and then partially editing border", () => {
	const { tree, id, style } = fixture(
		"display:block;width:40px;height:10px;border:2px solid red",
	);
	style.setProperty("height", "20px");
	expect(tree.get(id).attributes.style).toContain("border: 2px solid red;");
	style.removeProperty("border-left-width");
	style.setProperty("border-left-width", "8px");
	expect(documentStyles(tree).box(id)["border-left-width"]).toBe("8px");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(50);
	expect(normalized(style.cssText)).toEqual(
		normalized(tree.get(id).attributes.style),
	);
});

it.each(["border-width", "margin", "padding", "gap"])(
	"keeps %s longhands when the shorthand exceeds native parser admission",
	(property) => {
		const components = inlineDeclarationComponents(property);
		const source = components
			.map((name, index) => `${name}:calc(${index + 1}.${"0".repeat(2100)}1px)`)
			.join(";");
		const { tree, id, style } = fixture(source);
		expect(style.length).toBe(components.length);
		expect(style.cssText).not.toMatch(new RegExp(`(?:^|; )${property}:`));
		expect(normalized(style.cssText)).toEqual(normalized(source));
		style.setProperty("color", "red");
		const copied = tree.clone(id);
		const copy = new InlineStyles(tree, factory).get(copied) as Style;
		for (const name of components)
			expect(copy.getPropertyValue(name)).toBe(style.getPropertyValue(name));
	},
);
