import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { ComputedStyles, computedStyleProperties } from "./computed-styles.js";
import {
	cssFlowProperties,
	computeFlowStyle,
	initialFlowStyle,
	parseFlowDeclarations,
	type CssFlowProperty,
} from "./css-flow.js";
import {
	directDeclaration,
	parseInlineDeclarations,
	propertyValue,
	serializeDeclarations,
} from "./css-declarations.js";
import type { DocumentTree } from "./document.js";
import { layoutDocument } from "./document-layout.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import { DocumentQueries } from "./selectors.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition) {
		const target = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(target, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		if (definition.indexed)
			Object.defineProperty(target, "length", {
				get: definition.indexed.length,
			});
		return target;
	},
};
interface Style {
	position: string;
	float: string;
	cssFloat: string;
	clear: string;
	overflow: string;
	overflowX: string;
	overflowY: string;
	cssText: string;
	length: number;
	setProperty(name: string, value: string, priority?: string): void;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	removeProperty(name: string): string;
}
function fixture(css = "", inline = "") {
	const document = parseHtmlDocument(
		`<style>html{font-size:8px}#target{display:inline-block;width:20px}${css}</style><main id="parent"><span id="target" style="${inline}">ab</span></main>`,
		"https://fixture.invalid/css-flow",
	);
	documents.push(document);
	const query = new DocumentQueries(document);
	const id = (selector: string) => {
		const value = query.querySelector(selector);
		if (value === null) throw Error(selector);
		return value;
	};
	const target = id("#target");
	const declarations = new InlineStyles(document, factory);
	const style = declarations.get(target) as Style;
	const computed = new ComputedStyles(document, factory).get(target) as Style;
	const flow = () => documentStyles(document).flow(target);
	const layout = () => layoutDocument(document);
	return { document, target, id, style, computed, flow, layout };
}

it.each([
	...["static", "relative", "absolute", "fixed", "sticky"].map((value) => [
		"position",
		value,
	]),
	...["none", "left", "right", "inline-start", "inline-end"].map((value) => [
		"float",
		value,
	]),
	...["none", "left", "right", "both", "inline-start", "inline-end"].map(
		(value) => ["clear", value],
	),
	...["visible", "hidden", "clip", "scroll", "auto"].flatMap((value) => [
		["overflow-x", value],
		["overflow-y", value],
	]),
])("parses known flow keywords: %s:%s", (property, value) => {
	expect(parseFlowDeclarations(property, value)).toEqual([{ property, value }]);
	expect(directDeclaration(property, value, false)).toEqual([
		{ name: property, value, important: false },
	]);
});

it.each(["initial", "inherit", "unset", "revert"])(
	"expands the %s overflow shorthand to both axes",
	(value) => {
		expect(parseFlowDeclarations("overflow", value)).toEqual([
			{ property: "overflow-x", value },
			{ property: "overflow-y", value },
		]);
	},
);

const overflows = ["visible", "hidden", "clip", "scroll", "auto"];
it.each(
	overflows.flatMap((horizontal) =>
		overflows.map((vertical) => [horizontal, vertical]),
	),
)("computes the 2026 draft axis interaction: %s/%s", (horizontal, vertical) => {
	const flow = computeFlowStyle(
		{ "overflow-x": horizontal, "overflow-y": vertical },
		initialFlowStyle,
	);
	const scrollable = ["hidden", "scroll", "auto"];
	expect(flow["overflow-x"]).toBe(
		horizontal === "visible" && scrollable.includes(vertical)
			? "auto"
			: horizontal,
	);
	expect(flow["overflow-y"]).toBe(
		vertical === "visible" && scrollable.includes(horizontal)
			? "auto"
			: vertical,
	);
	expect(Object.isFrozen(flow)).toBe(true);
});

it.each(["overflow", "overflow-x", "overflow-y"])(
	"canonicalizes the overlay alias for %s",
	(name) => {
		expect(
			parseFlowDeclarations(name, "overlay")?.every(
				(entry) => entry.value === "auto",
			),
		).toBe(true);
	},
);

it.each([
	"",
	"hidden visible clip",
	"inherit hidden",
	"hidden initial",
	"none",
	"10px",
	"hidden, auto",
])("rejects invalid overflow syntax: %s", (value) => {
	expect(parseFlowDeclarations("overflow", value)).toBeUndefined();
});

it("accepts explicit neutral defaults without disabling unsupported layout checks", () => {
	const { flow, layout, document } = fixture(
		"#target{position:static;float:none;clear:none;overflow:visible}",
	);
	expect(flow()).toEqual(initialFlowStyle);
	expect(buildFormattingTree(document).issues).toEqual({});
	expect(layout().metrics.boxes).toBe(4);
});

it.each([
	["position", "absolute", "static", "position-layout-not-supported"],
	["float", "left", "none", "float-layout-not-supported"],
	["clear", "both", "none", "clear-layout-not-supported"],
	["overflow", "hidden", "visible", "overflow-layout-not-supported"],
] as const)(
	"recovers after resetting unsupported %s through CSSOM",
	(name, unsupported, neutral, issue) => {
		const { style, computed, layout, document } = fixture();
		style.setProperty(name, unsupported);
		expect(style.getPropertyValue(name)).toBe(unsupported);
		expect(computed.getPropertyValue(name)).toBe(unsupported);
		expect(buildFormattingTree(document).issues[issue]).toBe(1);
		expect(layout).toThrow(expect.objectContaining({ code: "unsupported" }));
		style.setProperty(name, neutral);
		expect(computed.getPropertyValue(name)).toBe(neutral);
		expect(layout().metrics.boxes).toBe(4);
	},
);

it("only rejects winning unsupported values, not overridden declarations or unmatched rules", () => {
	const { flow, layout } = fixture(
		"#target{position:absolute;overflow:hidden}.missing{float:left}#target{position:static;overflow:visible}",
	);
	expect(flow()).toEqual(initialFlowStyle);
	expect(layout().metrics.boxes).toBe(4);
});

it("retains important priority and recovers only after replacing the winner", () => {
	const { style, flow, layout } = fixture(
		"#target{position:absolute!important}",
	);
	style.position = "static";
	expect(flow().position).toBe("absolute");
	expect(layout).toThrow(expect.objectContaining({ code: "unsupported" }));
	style.setProperty("position", "static", "important");
	expect(flow().position).toBe("static");
	expect(layout().metrics.boxes).toBe(4);
});

it.each(["initial", "unset", "revert"])(
	"all:%s resets flow properties along with other longhands",
	(value) => {
		const { flow, layout } = fixture(
			`#target{position:absolute;float:left;clear:both;overflow:hidden;all:${value};display:inline-block;width:20px}`,
		);
		expect(flow()).toEqual(initialFlowStyle);
		expect(layout().metrics.boxes).toBe(4);
	},
);

it("keeps flow properties non-inherited unless inheritance is explicitly requested", () => {
	const { document, target, flow, style } = fixture(
		"#parent{position:relative;float:left;clear:both;overflow:hidden}",
	);
	expect(flow()).toEqual(initialFlowStyle);
	style.cssText =
		"position:inherit;float:inherit;clear:inherit;overflow:inherit";
	expect(documentStyles(document).flow(target)).toMatchObject({
		position: "relative",
		float: "left",
		clear: "both",
		"overflow-x": "hidden",
		"overflow-y": "hidden",
	});
});

it("does not render unsupported policy inside display-none subtrees", () => {
	const { layout } = fixture(
		"#parent{display:none}#target{position:absolute;float:left;clear:both;overflow:hidden}",
	);
	expect(layout().metrics.boxes).toBe(2);
});

it("keeps overflow shorthand expansion, serialization, priority and removal coherent", () => {
	const { style } = fixture();
	style.overflow = "hidden visible";
	expect(style.overflowX).toBe("hidden");
	expect(style.overflowY).toBe("visible");
	expect(style.overflow).toBe("hidden visible");
	expect(style.length).toBe(2);
	expect(style.cssText).toBe("overflow: hidden visible;");
	style.setProperty("overflow-y", "auto", "important");
	expect(style.overflow).toBe("");
	expect(style.getPropertyPriority("overflow")).toBe("");
	style.setProperty("overflow", "clip", "important");
	expect(style.getPropertyPriority("overflow")).toBe("important");
	expect(style.removeProperty("overflow")).toBe("clip");
	expect(style.length).toBe(0);
});

it("preserves pending overflow variables and recomputes both axes after mutation", () => {
	const { style, flow, layout } = fixture();
	style.setProperty("--spill", "hidden visible");
	style.overflow = "var(--spill)";
	expect(style.overflow).toBe("var(--spill)");
	expect(flow()).toMatchObject({
		"overflow-x": "hidden",
		"overflow-y": "auto",
	});
	style.setProperty("--spill", "visible");
	expect(flow()).toEqual(initialFlowStyle);
	expect(layout().metrics.boxes).toBe(4);
});

it("invalid-at-computed-value flow declarations use unset rather than an older winner", () => {
	const { flow, layout } = fixture(
		"#target{position:absolute;position:var(--missing);overflow:hidden;overflow:var(--missing)}",
	);
	expect(flow()).toEqual(initialFlowStyle);
	expect(layout().metrics.boxes).toBe(4);
});

it("exposes live read-only computed aliases without requiring unsupported geometry", () => {
	const { style, computed, layout } = fixture();
	style.overflow = "visible hidden";
	style.cssFloat = "left";
	expect(computed.overflowX).toBe("auto");
	expect(computed.overflowY).toBe("hidden");
	expect(computed.overflow).toBe("auto hidden");
	expect(computed.cssFloat).toBe("left");
	expect(layout).toThrow(expect.objectContaining({ code: "unsupported" }));
	expect(() => {
		computed.overflow = "visible";
	}).toThrow();
	expect(() => {
		computed.cssFloat = "none";
	}).toThrow();
	style.cssText = "overflow:visible;float:none";
	expect(computed.overflow).toBe("visible");
	expect(computed.cssFloat).toBe("none");
	expect(computedStyleProperties).toEqual(
		expect.arrayContaining([...cssFlowProperties]),
	);
});

it("reuses immutable defaults and invalidates non-default computed values on revision", () => {
	const { style, flow } = fixture();
	expect(flow()).toBe(initialFlowStyle);
	style.position = "relative";
	const before = flow();
	style.position = "static";
	expect(flow().position).toBe("static");
	expect(before.position).toBe("relative");
	expect(Object.isFrozen(before)).toBe(true);
});

it("serializes longhands with different global keywords without inventing a shorthand", () => {
	const entries = parseInlineDeclarations(
		"overflow-x:initial;overflow-y:inherit",
		10,
	);
	expect(propertyValue(entries, "overflow")).toBe("");
	expect(serializeDeclarations(entries)).toBe(
		"overflow-x: initial; overflow-y: inherit;",
	);
});

it.each(cssFlowProperties)(
	"retains bounds and rejects invalid values for %s",
	(name: CssFlowProperty) => {
		expect(parseFlowDeclarations(name, "not-a-value")).toBeUndefined();
		expect(() =>
			parseInlineDeclarations(`${name}:initial;${name}:inherit`, 1),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	},
);

it("reports cascade support separately from implemented layout effects", async () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw Error("No session expected");
		},
	});
	try {
		expect((await host.execute(["capabilities"])).data).toMatchObject({
			flowStyles: {
				partial: true,
				positionedLayout: false,
				floats: false,
				clearance: false,
				overflowClipping: false,
			},
		});
	} finally {
		host.close();
	}
});
