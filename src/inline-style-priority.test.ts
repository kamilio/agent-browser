import { afterEach, expect, it } from "vitest";
import nativeCases from "../reports/cssom-native-cases-2026-09-02.json" with {
	type: "json",
};
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
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string | null, priority?: string): void;
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
		return target;
	},
};
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(source: string) {
	const tree = parseHtmlDocument(
		"<!doctype html><style>html,body{margin:0;padding:0}#target{display:block;width:120px;height:20px}</style><div id=target>Text</div>",
		"https://fixture.invalid/style-priority",
	);
	trees.push(tree);
	const id = new DocumentQueries(tree).querySelector("#target");
	if (id === null) throw new Error("Missing fixture element");
	tree.setAttribute(id, "style", source);
	documentStyles(tree).setViewport(300, 100);
	const owner = new InlineStyles(tree, factory);
	return { tree, id, owner, style: owner.get(id) as Style };
}

it.each([
	["margin", "margin-left"],
	["padding", "padding-top"],
	["border", "border-right-color"],
	["border-width", "border-bottom-width"],
	["border-style", "border-top-style"],
	["border-color", "border-left-color"],
	["border-top", "border-top-width"],
	["background", "background-color"],
	["overflow", "overflow-x"],
	["flex", "flex-grow"],
	["flex-flow", "flex-direction"],
	["gap", "row-gap"],
])(
	"reads priority independently of pending %s value serialization",
	(name, component) => {
		const { style } = fixture(`${name}:var(--value)!important`);
		expect(style.getPropertyValue(name)).toBe("var(--value)");
		expect(style.getPropertyPriority(name)).toBe("important");
		expect(style.getPropertyValue(component)).toBe("");
		expect(style.getPropertyPriority(component)).toBe("important");
		expect(style.getPropertyPriority(component.toUpperCase())).toBe(
			"important",
		);
	},
);

it.each([
	["border", "border:1px solid red!important;border-left-width:2px!important"],
	["margin", "margin:initial!important;margin-left:2px!important"],
])(
	"reports uniformly important %s even when its values cannot form a shorthand",
	(name, source) => {
		const { style } = fixture(source);
		expect(style.getPropertyValue(name)).toBe("");
		expect(style.getPropertyPriority(name)).toBe("important");
	},
);

it("uses the winning component priorities across overlapping pending declarations", () => {
	const { style } = fixture(
		"margin:var(--space)!important;margin-left:9px;border:var(--edge);border-width:var(--width)!important",
	);
	expect(style.getPropertyPriority("margin-left")).toBe("important");
	expect(style.getPropertyPriority("margin")).toBe("important");
	expect(style.getPropertyPriority("border-left-width")).toBe("important");
	expect(style.getPropertyPriority("border-width")).toBe("important");
	expect(style.getPropertyPriority("border-left-color")).toBe("");
	expect(style.getPropertyPriority("border")).toBe("");
	style.cssText = "margin:1px!important;margin-left:2px";
	expect(style.getPropertyPriority("margin-left")).toBe("important");
	style.setProperty("margin-left", "2px");
	expect(style.getPropertyPriority("margin-left")).toBe("");
	expect(style.getPropertyPriority("margin")).toBe("");
});

it("distinguishes absent, incomplete, empty and case-sensitive declarations", () => {
	const { style } = fixture(
		"--empty:!important;--Theme:blue!important;--theme:red;margin-left:2px!important",
	);
	expect(style.getPropertyPriority("--empty")).toBe("important");
	expect(style.getPropertyPriority("--Theme")).toBe("important");
	expect(style.getPropertyPriority("--theme")).toBe("");
	expect(style.getPropertyPriority("--missing")).toBe("");
	expect(style.getPropertyPriority("margin")).toBe("");
	expect(style.getPropertyPriority("not-a-property")).toBe("");
	style.cssText = "all:initial!important";
	expect(style.getPropertyPriority("all")).toBe("important");
});

it.each([
	["width", ""],
	["width", null],
	["margin", ""],
	["margin", null],
	["--theme", ""],
	["--theme", null],
] as const)(
	"removes %s with an empty value %s before rejecting an invalid priority",
	(name, value) => {
		const { tree, id, style } = fixture("");
		for (const priority of [
			"urgent",
			"!important",
			" important",
			"important ",
		]) {
			style.cssText =
				"width:40px!important;margin:var(--space)!important;--theme:blue!important;height:20px";
			const revision = tree.revision;
			style.setProperty(name, value, priority);
			expect(tree.revision).toBeGreaterThan(revision);
			expect(style.getPropertyValue(name)).toBe("");
			expect(style.getPropertyPriority(name)).toBe("");
			expect(style.getPropertyValue("height")).toBe("20px");
			if (name === "width")
				expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(
					120,
				);
			if (name === "margin")
				expect(style.getPropertyPriority("margin-left")).toBe("");
		}
	},
);

it("preserves invalid nonempty priority writes and whitespace custom values", () => {
	const { tree, style } = fixture("width:40px!important;--theme:blue");
	const before = style.cssText;
	const revision = tree.revision;
	style.setProperty("width", "60px", "urgent");
	style.setProperty("--theme", " ", "urgent");
	expect(style.cssText).toBe(before);
	expect(tree.revision).toBe(revision);
	style.setProperty("--theme", " ", "important");
	expect(style.getPropertyPriority("--theme")).toBe("important");
	expect(style.getPropertyValue("--theme")).toBe(" ");
});

it("invalidates shared geometry and pixels when an empty-value write removes width", () => {
	const { tree, id, style } = fixture("width:40px!important;background:blue");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(40);
	const before = rasterizeDocument(tree).image.pixels.slice();
	style.setProperty("width", "", "urgent");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(120);
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
	expect(style.getPropertyValue("background-color")).toBe("blue");
});

it("records the specification-based departure from historical invalid-priority removal", () => {
	const reference = nativeCases.find(
		(value) => value.id === "remove-invalid-priority",
	);
	expect(reference).toMatchObject({
		input: "display: block;",
		set: ["display", "", "invalid"],
		cssText: "display: block;",
		attribute: "display: block;",
	});
	const { tree, id, style } = fixture("display: block;");
	style.setProperty("display", "", "invalid");
	expect(style.cssText).toBe("");
	expect(tree.get(id).attributes.style).toBe("");
	expect(style.getPropertyValue("display")).toBe("");
});

it("refreshes priorities after attribute replacement and revokes reads on close", () => {
	const { tree, id, style } = fixture("padding:var(--space)!important");
	expect(style.getPropertyPriority("padding-left")).toBe("important");
	tree.setAttribute(id, "style", "padding:var(--space)");
	expect(style.getPropertyPriority("padding-left")).toBe("");
	tree.close();
	expect(() => style.getPropertyPriority("padding-left")).toThrow("closed");
});
