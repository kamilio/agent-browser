import { afterEach, expect, it } from "vitest";
import { inlineDeclarationLimits } from "./document-inline-declarations.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { resolvedStyleValue } from "./computed-styles.js";
import { BrowserCommandHost } from "./command-host.js";

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
function fixture(source = "--space:2px 4px;margin:var(--space)!important") {
	const tree = parseHtmlDocument(
		"<!doctype html><style>html,body{margin:0;padding:0}#target{display:block;width:50px;height:20px;background:blue}</style><div id=target></div>",
		"https://fixture.invalid/pending-style",
	);
	trees.push(tree);
	const id = new DocumentQueries(tree).querySelector("#target");
	if (id === null) throw new Error("Missing fixture element");
	tree.setAttribute(id, "style", source);
	documentStyles(tree).setViewport(200, 100);
	const owner = new InlineStyles(tree, factory);
	const style = owner.get(id) as Style;
	return { tree, id, owner, style, box: () => documentStyles(tree).box(id) };
}

it("enumerates pending longhand slots while retaining the complete shorthand", () => {
	const { style } = fixture();
	expect(
		Array.from({ length: style.length }, (_, index) => style.item(index)),
	).toEqual([
		"--space",
		"margin-top",
		"margin-right",
		"margin-bottom",
		"margin-left",
	]);
	expect(style.getPropertyValue("margin")).toBe("var(--space)");
	expect(style.getPropertyValue("margin-left")).toBe("");
	expect(style.getPropertyPriority("margin-left")).toBe("important");
});

it.each([
	["margin", "margin-left", "margin-top", "2px", "7px", "2px", "7px"],
	["padding", "padding-left", "padding-right", "2px", "7px", "2px", "7px"],
	[
		"border",
		"border-left-width",
		"border-right-width",
		"2px solid red",
		"7px solid blue",
		"2px",
		"7px",
	],
	[
		"border-width",
		"border-left-width",
		"border-right-width",
		"2px",
		"7px",
		"2px",
		"7px",
	],
	[
		"border-color",
		"border-left-color",
		"border-right-color",
		"red",
		"blue",
		"rgb(255, 0, 0)",
		"rgb(0, 0, 255)",
	],
	["flex", "flex-grow", "flex-basis", "2 1 20px", "3 1 40px", "20px", "40px"],
	[
		"flex-flow",
		"flex-direction",
		"flex-wrap",
		"row wrap",
		"column nowrap",
		"wrap",
		"nowrap",
	],
	[
		"overflow",
		"overflow-x",
		"overflow-y",
		"hidden scroll",
		"visible hidden",
		"scroll",
		"hidden",
	],
	["gap", "column-gap", "row-gap", "2px 4px", "7px 9px", "2px", "7px"],
	[
		"background",
		"background-image",
		"background-color",
		"blue",
		"red",
		"rgb(0, 0, 255)",
		"rgb(255, 0, 0)",
	],
])(
	"keeps retained %s components connected to the native cascade",
	(name, removed, retained, first, second, before, after) => {
		const { tree, id, style } = fixture(
			`border-style:solid;--value:${first};${name}:var(--value)!important`,
		);
		style.removeProperty(removed);
		expect(style.getPropertyPriority(removed)).toBe("");
		expect(style.getPropertyPriority(retained)).toBe("important");
		expect(resolvedStyleValue(tree, id, retained)).toBe(before);
		style.setProperty("--value", second);
		expect(resolvedStyleValue(tree, id, retained)).toBe(after);
	},
);

it("does not reuse a CSSOM cache when hidden source changes behind identical text", () => {
	const { tree, id, style, box } = fixture(
		"--first:2px;--second:9px;margin:var(--first)",
	);
	style.removeProperty("margin-left");
	const other = new InlineStyles(tree, factory).get(id) as Style;
	const original = other.cssText;
	style.setProperty("margin", "var(--second)");
	style.removeProperty("margin-left");
	expect(style.cssText).toBe(original);
	other.setProperty("--first", "3px");
	expect(box()["margin-right"]).toBe("9px");
});

it("freezes retained projections and charges normalized declaration text", () => {
	const { tree, id, box } = fixture("");
	const entries = [
		{
			name: "margin-right",
			value: "var(--space,4px)",
			important: false,
			pending: "margin",
		},
		{ name: "width", value: "0", important: false },
	];
	const source = "margin-right: ; width: 0px;";
	tree.setInlineDeclarations(id, source, entries);
	const saved = tree.getInlineDeclarations(id);
	expect(Object.isFrozen(saved)).toBe(true);
	expect(saved?.every((entry) => Object.isFrozen(entry))).toBe(true);
	entries[0].value = "var(--space,99px)";
	expect(box()["margin-right"]).toBe("4px");
	expect(tree.inlineDeclarationMetrics().codeUnits).toBe(
		source.length +
			(saved ?? []).reduce(
				(total, entry) =>
					total +
					entry.name.length +
					entry.value.length +
					(entry.pending?.length ?? 0),
				0,
			),
	);
});

it.each(["mismatch", "duplicate", "wrong-origin", "invalid-value"])(
	"rejects malformed retained declarations atomically: %s",
	(kind) => {
		const { tree, id, style } = fixture();
		style.removeProperty("margin-left");
		const before = tree.get(id).attributes.style;
		const saved = tree.getInlineDeclarations(id);
		const metrics = tree.inlineDeclarationMetrics();
		const entry = {
			name: "margin-right",
			value: "var(--space)",
			important: false,
			pending: "margin",
		};
		if (kind === "wrong-origin") entry.pending = "padding";
		if (kind === "invalid-value") entry.value = "1px;height:999px";
		expect(() =>
			tree.setInlineDeclarations(
				id,
				kind === "mismatch" ? "margin-right: 4px;" : "margin-right: ;",
				kind === "duplicate" ? [entry, entry] : [entry],
			),
		).toThrow();
		expect(tree.get(id).attributes.style).toBe(before);
		expect(tree.getInlineDeclarations(id)).toBe(saved);
		expect(tree.inlineDeclarationMetrics()).toEqual(metrics);
	},
);

it("bounds retained element owners and releases admission on raw attribute removal", () => {
	const { tree, id } = fixture("");
	const parent = tree.get(id).parent;
	if (parent === null) throw new Error("Missing parent");
	const owner = new InlineStyles(tree, factory, { maxObjects: 1024 });
	let first = 0;
	for (let index = 0; index < inlineDeclarationLimits.maxElements; index++) {
		const node = tree.createElement("div");
		tree.append(parent, node);
		if (!index) first = node;
		(owner.get(node) as Style).setProperty("margin", "var(--space)");
	}
	const target = owner.get(id) as Style;
	expect(() => target.setProperty("margin", "var(--space)")).toThrow(
		"retention limit",
	);
	expect(tree.get(id).attributes.style).toBe("");
	tree.removeAttribute(first, "style");
	target.setProperty("margin", "var(--space)");
	expect(tree.inlineDeclarationMetrics().elements).toBe(
		inlineDeclarationLimits.maxElements,
	);
});

it("bounds retained declaration slots independently of the element quota", () => {
	const { tree, id } = fixture("");
	const parent = tree.get(id).parent;
	if (parent === null) throw new Error("Missing parent");
	const owner = new InlineStyles(tree, factory);
	const source = `margin:var(--space);${Array.from({ length: 1000 }, (_, index) => `--value${index}:x`).join(";")}`;
	for (let index = 0; index < 16; index++) {
		const node = tree.createElement("div");
		tree.append(parent, node);
		(owner.get(node) as Style).cssText = source;
	}
	const before = tree.inlineDeclarationMetrics();
	expect(before.declarations).toBe(16_064);
	expect(() => {
		(owner.get(id) as Style).cssText = source;
	}).toThrow("retention limit");
	expect(tree.inlineDeclarationMetrics()).toEqual(before);
	expect(tree.get(id).attributes.style).toBe("");
});

it("exports retention limits and advertises the implemented pending-slot profile", async () => {
	const api = await import("./index.js");
	expect(api.inlineDeclarationLimits).toBe(inlineDeclarationLimits);
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("Capability reads must not create a session");
		},
	});
	try {
		const result = await host.execute(["capabilities"]);
		expect(result.data).toMatchObject({
			cssVariables: {
				inlinePendingShorthands: "expanded-native-declaration-slots",
				partialPendingShorthandRemoval: true,
				lowerPriorityPendingComponentReplacement: true,
			},
			inlineDeclarations: { limits: inlineDeclarationLimits },
		});
	} finally {
		await host.close();
	}
});

it("removes one pending component and keeps the others live across custom edits", () => {
	const { tree, id, style, box } = fixture();
	expect(style.removeProperty("margin-left")).toBe("");
	expect(box()["margin-left"]).toBe("0px");
	expect(box()["margin-right"]).toBe("4px");
	expect(style.getPropertyValue("margin")).toBe("");
	expect(tree.get(id).attributes.style).toContain("margin-right:  !important;");
	style.setProperty("--space", "6px 8px");
	expect(box()["margin-top"]).toBe("6px");
	expect(box()["margin-right"]).toBe("8px");
	expect(box()["margin-left"]).toBe("0px");
});

it("lowers one component's priority without reviving an important shorthand", () => {
	const { style, box } = fixture();
	style.setProperty("margin-left", "9px");
	expect(style.getPropertyPriority("margin-left")).toBe("");
	expect(style.getPropertyPriority("margin-top")).toBe("important");
	expect(style.getPropertyPriority("margin")).toBe("");
	expect(box()["margin-left"]).toBe("9px");
	expect(box()["margin-right"]).toBe("4px");
	style.setProperty("--space", "7px");
	expect(box()["margin-right"]).toBe("7px");
	expect(box()["margin-left"]).toBe("9px");
});

it("updates geometry and pixels through the same partially edited declaration state", () => {
	const { tree, id, style } = fixture("--space:10px;padding:var(--space)");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(70);
	const before = rasterizeDocument(tree).image.pixels.slice();
	style.removeProperty("padding-left");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(60);
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
	style.setProperty("--space", "20px");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(70);
});

it("shares retained slots across CSSOM owners and survives one owner's close", () => {
	const { tree, id, owner, style, box } = fixture();
	const second = new InlineStyles(tree, factory);
	const other = second.get(id) as Style;
	expect(other.getPropertyValue("margin")).toBe("var(--space)");
	style.removeProperty("margin-left");
	expect(other.getPropertyPriority("margin-left")).toBe("");
	owner.close();
	other.setProperty("--space", "11px");
	expect(box()["margin-right"]).toBe("11px");
	expect(box()["margin-left"]).toBe("0px");
	second.close();
	expect(box()["margin-right"]).toBe("11px");
});

it.each(["setAttribute", "attributeValue", "attributeNode", "cssText"])(
	"resets retained pending state when the same serialized text is assigned via %s",
	(mode) => {
		const { tree, id, style, box } = fixture();
		style.removeProperty("margin-left");
		const source = tree.get(id).attributes.style;
		expect(box()["margin-right"]).toBe("4px");
		if (mode === "setAttribute") tree.setAttribute(id, "style", source);
		else if (mode === "attributeValue") {
			const attribute = tree.getAttributeNode(id, "style");
			if (attribute === null) throw new Error("Missing style attribute");
			tree.setAttributeValue(attribute, source);
		} else if (mode === "attributeNode") {
			tree.setAttributeNode(id, tree.createAttribute("style", source));
		} else style.cssText = source;
		expect(box()["margin-right"]).toBe("0px");
		expect(style.getPropertyPriority("margin-right")).toBe("");
		expect(tree.inlineDeclarationMetrics().elements).toBe(0);
	},
);

it("clears retained state on attribute removal and releases it on document close", () => {
	const { tree, id, style } = fixture();
	style.removeProperty("margin-left");
	expect(tree.inlineDeclarationMetrics().elements).toBe(1);
	tree.removeAttribute(id, "style");
	expect(tree.inlineDeclarationMetrics().elements).toBe(0);
	style.setProperty("margin", "var(--space)");
	style.removeProperty("margin-left");
	tree.close();
	expect(tree.inlineDeclarationMetrics()).toEqual({
		elements: 0,
		declarations: 0,
		codeUnits: 0,
		closed: true,
	});
	expect(() => style.getPropertyValue("margin-right")).toThrow("closed");
});

it("keeps detached owners live and does not leak their state into clones", () => {
	const { tree, id, style, box } = fixture();
	style.removeProperty("margin-left");
	const parent = tree.get(id).parent;
	if (parent === null) throw new Error("Missing parent");
	tree.remove(id);
	style.setProperty("--space", "12px");
	tree.append(parent, id);
	expect(box()["margin-right"]).toBe("12px");
	const clone = tree.clone(id, false);
	tree.append(parent, clone);
	expect(documentStyles(tree).box(clone)["margin-right"]).toBe("0px");
	expect(tree.getInlineDeclarations(clone)).toBeUndefined();
});

it("does not recache stale slots after a reentrant attribute observer changes them", () => {
	const { tree, id, style, box } = fixture();
	let entered = false;
	const unregister = tree.onMutation((record) => {
		if (record.target !== id || record.attributeName !== "style" || entered)
			return;
		entered = true;
		style.setProperty("--space", "13px");
	});
	style.removeProperty("margin-left");
	unregister();
	expect(entered).toBe(true);
	expect(style.getPropertyValue("--space")).toBe("13px");
	expect(box()["margin-right"]).toBe("13px");
	expect(box()["margin-left"]).toBe("0px");
});

it("publishes the declaration and layout state before native attribute notification", () => {
	const { tree, id, style } = fixture("--space:10px;padding:var(--space)");
	expect(documentGeometry(tree).getBoundingClientRect(id).width).toBe(70);
	const widths: number[] = [];
	const unregister = tree.onMutation((record) => {
		if (record.target === id && record.attributeName === "style")
			widths.push(documentGeometry(tree).getBoundingClientRect(id).width);
	});
	style.removeProperty("padding-left");
	unregister();
	expect(widths).toEqual([60]);
});

it("enforces the CSSOM declaration count after pending expansion without mutation", () => {
	const { tree, id } = fixture("width:3px");
	const owner = new InlineStyles(tree, factory, { maxDeclarations: 3 });
	const style = owner.get(id) as Style;
	const before = tree.get(id).attributes.style;
	expect(() => style.setProperty("margin", "var(--space)")).toThrow("limit");
	expect(tree.get(id).attributes.style).toBe(before);
	expect(tree.inlineDeclarationMetrics().elements).toBe(0);
});

it("fails document text admission before publishing a retained declaration", () => {
	const tree = new DocumentTree("https://fixture.invalid/", {
		maxTextCodeUnits: 28,
	});
	trees.push(tree);
	const id = tree.createElement("div");
	tree.append(tree.root, id);
	const style = new InlineStyles(tree, factory).get(id) as Style;
	expect(() => style.setProperty("border", "var(--long-border-name)")).toThrow(
		"limit",
	);
	expect(tree.get(id).attributes.style).toBeUndefined();
	expect(tree.inlineDeclarationMetrics().elements).toBe(0);
});

it("bounds aggregate retained sources and recovers after releasing pending owners", () => {
	const { tree, id, style } = fixture("width:3px");
	const long = `var(--missing,${" ".repeat(30_000)}1px)`;
	const owners: Style[] = [];
	for (let index = 0; index < 5; index++) {
		const node = tree.createElement("div");
		const parent = tree.get(id).parent;
		if (parent === null) throw new Error("Missing fixture parent");
		tree.append(parent, node);
		const owner = new InlineStyles(tree, factory).get(node) as Style;
		owner.setProperty("border", long);
		owners.push(owner);
	}
	const before = tree.get(id).attributes.style;
	const retained = tree.inlineDeclarationMetrics();
	expect(retained.codeUnits).toBeLessThanOrEqual(
		inlineDeclarationLimits.maxCodeUnits,
	);
	expect(() => style.setProperty("border", long)).toThrow("retention limit");
	expect(tree.get(id).attributes.style).toBe(before);
	expect(tree.inlineDeclarationMetrics()).toEqual(retained);
	owners[0].cssText = "";
	style.setProperty("border", long);
	expect(tree.inlineDeclarationMetrics().elements).toBe(5);
});
