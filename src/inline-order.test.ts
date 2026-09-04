import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { inlineDeclarationComponents } from "./css-declarations.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
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
function fixture(source: string) {
	const tree = parseHtmlDocument(
		"<!doctype html><style>html,body{margin:0;padding:0}main{width:120px;color:red}#target{display:block;width:40px;height:20px;background:blue}</style><main><div id=target></div></main>",
		"https://fixture.invalid/inline-order",
	);
	trees.push(tree);
	const id = new DocumentQueries(tree).querySelector("#target");
	if (id === null) throw new Error("Missing fixture element");
	tree.setAttribute(id, "style", source);
	documentStyles(tree).setViewport(200, 100);
	const owner = new InlineStyles(tree, factory);
	const style = owner.get(id) as Style;
	return { tree, id, owner, style };
}
function names(style: Style) {
	return Array.from({ length: style.length }, (_, index) => style.item(index));
}
const unorderedMargin =
	"margin-left:4px;display:block;margin-top:1px;margin-right:2px;margin-bottom:3px";

it("preserves ordinary declaration order when a later write compacts a shorthand", () => {
	const { style } = fixture(unorderedMargin);
	const before = names(style);
	expect(style.cssText).toBe("margin: 1px 2px 3px 4px; display: block;");
	expect(names(style)).toEqual(before);
	style.setProperty("width", "60px");
	expect(names(style)).toEqual([...before, "width"]);
	style.setProperty("margin-left", "8px");
	expect(names(style)).toEqual([...before, "width"]);
	expect(style.getPropertyValue("margin")).toBe("1px 2px 3px 8px");
});

it("shares non-pending ordered state across owners and releases it on close", () => {
	const { tree, id, owner, style } = fixture(unorderedMargin);
	const before = names(style);
	style.setProperty("width", "60px");
	expect(tree.inlineDeclarationMetrics().elements).toBe(1);
	const other = new InlineStyles(tree, factory).get(id) as Style;
	owner.close();
	expect(names(other)).toEqual([...before, "width"]);
	other.removeProperty("width");
	expect(names(other)).toEqual(before);
	tree.close();
	expect(tree.inlineDeclarationMetrics().elements).toBe(0);
});

it.each(["attribute", "cssText"])(
	"uses serialized order only after explicit %s replacement",
	(mode) => {
		const { tree, id, style } = fixture(unorderedMargin);
		style.setProperty("width", "60px");
		expect(names(style)[0]).toBe("margin-left");
		const serialized = style.cssText;
		if (mode === "attribute") tree.setAttribute(id, "style", serialized);
		else style.cssText = serialized;
		expect(names(style)).toEqual([
			"margin-top",
			"margin-right",
			"margin-bottom",
			"margin-left",
			"display",
			"width",
		]);
		expect(tree.inlineDeclarationMetrics().elements).toBe(0);
	},
);

it("does not retain ordinary blocks whose serialization already preserves order", () => {
	const { tree, style } = fixture("width:40px;color:red");
	style.setProperty("height", "20px");
	expect(names(style)).toEqual(["width", "color", "height"]);
	expect(tree.inlineDeclarationMetrics().elements).toBe(0);
});

it("drops no unrelated declaration when reconstructing a non-pending shorthand", () => {
	const { style } = fixture(unorderedMargin);
	style.setProperty("width", "60px");
	expect(style.removeProperty("margin")).toBe("1px 2px 3px 4px");
	expect(names(style)).toEqual(["display", "width"]);
	expect(style.cssText).toBe("display: block; width: 60px;");
});

it.each(["initial", "inherit", "unset", "revert"])(
	"expands supported all:%s resets without including custom properties",
	(keyword) => {
		const { style } = fixture(
			`--theme:blue!important;all:${keyword}!important`,
		);
		const components = inlineDeclarationComponents("all");
		expect(components.length).toBeGreaterThan(20);
		expect(names(style)).toEqual(["--theme", ...components]);
		expect(style.length).toBe(components.length + 1);
		expect(style.getPropertyValue("width")).toBe(keyword);
		expect(style.getPropertyPriority("width")).toBe("important");
		expect(style.getPropertyValue("all")).toBe(keyword);
		expect(style.getPropertyPriority("all")).toBe("important");
		expect(style.getPropertyValue("--theme")).toBe("blue");
		expect(style.getPropertyPriority("--theme")).toBe("important");
		expect(components).not.toContain("direction");
		expect(components).not.toContain("unicode-bidi");
	},
);

it("overrides one all-reset component in place rather than restoring the later all declaration", () => {
	const { tree, id, style } = fixture(
		"width:10px;all:initial!important;--theme:blue",
	);
	const before = names(style);
	style.setProperty("width", "60px");
	style.setProperty("display", "block");
	expect(style.getPropertyValue("width")).toBe("60px");
	expect(style.getPropertyPriority("width")).toBe("");
	expect(style.getPropertyPriority("height")).toBe("important");
	expect(style.getPropertyValue("all")).toBe("");
	expect(style.getPropertyPriority("all")).toBe("");
	expect(names(style)).toEqual(before);
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(60);
});

it("removes one reset component and lets the stylesheet supply its native value", () => {
	const { tree, id, style } = fixture("all:initial");
	expect(style.removeProperty("width")).toBe("initial");
	style.setProperty("display", "block");
	expect(style.getPropertyValue("width")).toBe("");
	expect(style.getPropertyValue("all")).toBe("");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(40);
});

it("removes all reset slots without deleting custom declarations", () => {
	const { style } = fixture("all:inherit!important;--theme:red;--size:12px");
	expect(style.removeProperty("all")).toBe("inherit");
	expect(names(style)).toEqual(["--theme", "--size"]);
	expect(style.cssText).toBe("--theme: red; --size: 12px;");
});

it("serializes all only when every supported component has the same CSS-wide value and priority", () => {
	const { style } = fixture("--theme:red;all:INITIAL!important");
	expect(style.cssText).toBe("--theme: red; all: initial !important;");
	style.setProperty("width", "inherit", "important");
	expect(style.getPropertyValue("all")).toBe("");
	expect(style.cssText).not.toContain("all:");
	style.setProperty("all", "unset");
	expect(style.getPropertyValue("all")).toBe("unset");
	expect(style.cssText).toContain("all: unset;");
});

it("preserves the custom-property scope while all resets native layout and paint", () => {
	const { tree, id, style } = fixture(
		"--size:60px;width:var(--size);background:red",
	);
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(60);
	const before = rasterizeDocument(tree).image.pixels.slice();
	style.setProperty("all", "initial");
	expect(style.getPropertyValue("--size")).toBe("60px");
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
	style.setProperty("display", "block");
	style.setProperty("width", "var(--size)");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(60);
});

it("keeps pending all origins distinct from plain reset slots", () => {
	const { tree, id, style } = fixture("all:var(--reset,initial)!important");
	expect(style.getPropertyValue("all")).toBe("var(--reset,initial)");
	expect(style.getPropertyValue("width")).toBe("");
	style.removeProperty("width");
	style.setProperty("display", "block");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(40);
	style.setProperty("all", "initial");
	expect(style.getPropertyValue("width")).toBe("initial");
	expect(style.getPropertyPriority("width")).toBe("");
});

it("checks expanded all slot counts before changing CSSOM or native state", () => {
	const { tree, id } = fixture("width:40px");
	const style = new InlineStyles(tree, factory, { maxDeclarations: 8 }).get(
		id,
	) as Style;
	const before = tree.get(id).attributes.style;
	expect(() => style.setProperty("all", "initial")).toThrow("limit");
	expect(tree.get(id).attributes.style).toBe(before);
	expect(tree.inlineDeclarationMetrics().elements).toBe(0);
});

it("advertises ordered inline state and the bounded native all-reset profile", async () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("No session is needed");
		},
	});
	try {
		expect((await host.execute(["capabilities"])).data).toMatchObject({
			inlineDeclarations: {
				profile: "document-owned-inline-declarations",
				preservesDeclarationOrder: true,
				allReset: "supported-native-longhands",
			},
		});
	} finally {
		await host.close();
	}
});

it.each(["red", "initial extra", "initial!important"])(
	"ignores invalid all writes without replacing existing slots: %s",
	(value) => {
		const { tree, id, style } = fixture("width:40px;--theme:blue");
		const before = tree.get(id).attributes.style;
		const revision = tree.revision;
		style.setProperty("all", value);
		expect(tree.get(id).attributes.style).toBe(before);
		expect(tree.revision).toBe(revision);
		expect(names(style)).toEqual(["width", "--theme"]);
	},
);

it("preserves ordered entries and the attribute when a larger write is rejected", () => {
	const { tree, id } = fixture(unorderedMargin);
	const style = new InlineStyles(tree, factory, { maxCodeUnits: 150 }).get(
		id,
	) as Style;
	style.setProperty("width", "60px");
	const before = tree.get(id).attributes.style;
	const order = names(style);
	const stored = tree.getInlineDeclarations(id);
	expect(stored).toBeDefined();
	expect(() => style.setProperty("--large", "x".repeat(150))).toThrow("limit");
	expect(tree.get(id).attributes.style).toBe(before);
	expect(names(style)).toEqual(order);
	expect(tree.getInlineDeclarations(id)).toBe(stored);
});
