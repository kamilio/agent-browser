import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	cssText: string;
	cssFloat: string;
	display: string;
	position: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(object, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		if (definition.indexed)
			Object.defineProperty(object, "length", {
				get: definition.indexed.length,
			});
		return object;
	},
};
const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "", inline = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">${css}</style><main id="parent"><span id="target"><span id="leaf">Text</span></span></main>`,
		"https://fixture.invalid/positioned-float-computation",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	if (inline) tree.setAttribute(target, "style", inline);
	const styles = documentStyles(tree);
	const declarations = new InlineStyles(tree, factory);
	const style = declarations.get(target) as Style;
	const flow = () => styles.flow(target);
	const resolved = (property: string) =>
		resolvedStyleValue(tree, target, property);
	return { tree, styles, declarations, style, target, id, flow, resolved };
}

it.each(
	["absolute", "fixed"].flatMap((position) =>
		["left", "right"].map((float) => [position, float]),
	),
)(
	"computes %s with specified float:%s to none without rewriting inline CSS",
	(position, float) => {
		const inline = `float:${float};position:${position}`;
		const { tree, styles, style, target, flow, resolved } = fixture("", inline);
		expect(flow()).toMatchObject({ position, float: "none" });
		expect(styles.get(target)).toMatchObject({
			display: "block",
			unpositionedDisplay: "inline",
		});
		expect(resolved("float")).toBe("none");
		expect(resolved("position")).toBe(position);
		expect(resolved("display")).toBe("block");
		expect(style.getPropertyValue("float")).toBe(float);
		expect(style.cssFloat).toBe(float);
		expect(style.getPropertyPriority("float")).toBe("");
		expect(tree.get(target).attributes.style).toBe(inline);
		expect(styles.metrics().issues).toEqual({});
	},
);

it.each(
	["static", "relative", "sticky"].flatMap((position) =>
		["left", "right"].map((float) => [position, float]),
	),
)(
	"preserves authored floats for position:%s with float:%s",
	(position, float) => {
		const { style, flow, resolved } = fixture(
			"",
			`position:${position};float:${float}`,
		);
		expect(flow()).toMatchObject({ position, float });
		expect(resolved("float")).toBe(float);
		expect(style.cssFloat).toBe(float);
	},
);

it.each(
	["absolute", "fixed"].flatMap((position) =>
		["inline-start", "inline-end"].map((float) => [position, float]),
	),
)("overrides already-parsed logical float under %s: %s", (position, float) => {
	const { style, flow, resolved } = fixture(
		"",
		`position:${position};float:${float}`,
	);
	expect(style.cssFloat).toBe(float);
	expect(flow().float).toBe("none");
	expect(resolved("float")).toBe("none");
});

it.each([
	["float:left;position:absolute", "absolute", "none"],
	["position:absolute;float:left", "absolute", "none"],
	["float:right;position:fixed", "fixed", "none"],
	["position:fixed;float:right", "fixed", "none"],
	["position:absolute;position:relative;float:left", "relative", "left"],
	["position:relative;position:fixed;float:right", "fixed", "none"],
])(
	"normalizes after resolving inline declaration order: %s",
	(inline, position, float) => {
		const { flow, resolved } = fixture("", inline);
		expect(flow()).toMatchObject({ position, float });
		expect(resolved("float")).toBe(float);
	},
);

it.each([
	[
		"#target{position:absolute;float:left}",
		"position:relative;float:right",
		"relative",
		"right",
	],
	[
		"#target{position:absolute!important;float:left}",
		"position:relative;float:right!important",
		"absolute",
		"none",
	],
	[
		"#target{position:relative!important;float:left!important}",
		"position:absolute;float:right",
		"relative",
		"left",
	],
])(
	"uses winning stylesheet and inline declarations before float normalization: %s",
	(css, inline, position, float) => {
		const { style, flow, resolved } = fixture(css, inline);
		expect(style.cssFloat).toBe("right");
		expect(flow()).toMatchObject({ position, float });
		expect(resolved("float")).toBe(float);
	},
);

it("preserves specified priorities through position and float CSSOM changes", () => {
	const { style, flow, resolved } = fixture(
		"#target{float:left!important;position:absolute}",
		"float:right;position:relative",
	);
	expect(flow()).toMatchObject({ position: "relative", float: "left" });
	style.setProperty("position", "fixed", "important");
	expect(flow()).toMatchObject({ position: "fixed", float: "none" });
	expect(style.getPropertyValue("float")).toBe("right");
	expect(style.getPropertyPriority("float")).toBe("");
	expect(style.getPropertyPriority("position")).toBe("important");
	style.setProperty("float", "right", "important");
	expect(resolved("float")).toBe("none");
	expect(style.getPropertyPriority("float")).toBe("important");
	style.setProperty("position", "relative");
	expect(resolved("float")).toBe("right");
	expect(style.removeProperty("position")).toBe("relative");
	expect(flow()).toMatchObject({ position: "absolute", float: "none" });
	expect(style.getPropertyPriority("float")).toBe("important");
});

it("invalidates cached computation without mutating old snapshots or specified values", () => {
	const { style, flow, resolved } = fixture("", "float:left;position:absolute");
	const before = flow();
	expect(before.float).toBe("none");
	expect(Object.isFrozen(before)).toBe(true);
	expect(flow()).toBe(before);
	style.cssFloat = "right";
	expect(style.cssFloat).toBe("right");
	expect(resolved("float")).toBe("none");
	style.position = "relative";
	expect(flow()).toMatchObject({ position: "relative", float: "right" });
	expect(flow()).not.toBe(before);
	style.position = "fixed";
	expect(resolved("float")).toBe("none");
	expect(style.removeProperty("position")).toBe("fixed");
	expect(flow()).toMatchObject({ position: "static", float: "right" });
	expect(style.removeProperty("float")).toBe("right");
	expect(style.cssFloat).toBe("");
	expect(flow()).toMatchObject({ position: "static", float: "none" });
	expect(before).toMatchObject({ position: "absolute", float: "none" });
});

it.each(["inherit", "initial", "unset", "revert"] as const)(
	"resolves float:%s using the parent's computed float only for inherit",
	(keyword) => {
		const { tree, styles, style, id, flow, resolved } = fixture(
			"#parent{position:absolute;float:right}",
			`float:${keyword}`,
		);
		expect(styles.flow(id("#parent"))).toMatchObject({
			position: "absolute",
			float: "none",
		});
		expect(flow()).toMatchObject({ position: "static", float: "none" });
		expect(style.getPropertyValue("float")).toBe(keyword);
		tree.setAttribute(id("#parent"), "style", "position:relative");
		expect(styles.flow(id("#parent")).float).toBe("right");
		expect(resolved("float")).toBe(keyword === "inherit" ? "right" : "none");
		tree.setAttribute(id("#parent"), "style", "position:fixed");
		expect(resolved("float")).toBe("none");
	},
);

it.each(["absolute", "fixed"] as const)(
	"normalizes float for explicitly inherited position:%s",
	(position) => {
		const { style, flow, resolved } = fixture(
			`#parent{position:${position};float:left}`,
			"position:inherit;float:right",
		);
		expect(style.position).toBe("inherit");
		expect(style.cssFloat).toBe("right");
		expect(flow()).toMatchObject({ position, float: "none" });
		style.position = "initial";
		expect(flow()).toMatchObject({ position: "static", float: "right" });
		style.position = "inherit";
		expect(resolved("float")).toBe("none");
	},
);

it("does not implicitly inherit position or float from a positioned or floating parent", () => {
	const { tree, styles, id, flow } = fixture(
		"#parent{position:absolute;float:left}",
	);
	expect(styles.flow(id("#parent"))).toMatchObject({
		position: "absolute",
		float: "none",
	});
	expect(flow()).toMatchObject({ position: "static", float: "none" });
	tree.setAttribute(id("#parent"), "style", "position:relative");
	expect(styles.flow(id("#parent")).float).toBe("left");
	expect(flow()).toMatchObject({ position: "static", float: "none" });
});

it.each(["", "float:none", "float:initial", "float:unset", "float:revert"])(
	"retains neutral float defaults for %j before and after a positioning change",
	(inline) => {
		const { style, flow, resolved } = fixture(
			"#parent{float:right}",
			`position:absolute;${inline}`,
		);
		expect(flow()).toMatchObject({ position: "absolute", float: "none" });
		style.position = "relative";
		expect(flow()).toMatchObject({ position: "relative", float: "none" });
		expect(resolved("float")).toBe("none");
	},
);

it.each(
	["none", "contents"].flatMap((display) =>
		["absolute", "fixed"].map((position) => [display, position]),
	),
)(
	"retains authored float for display:%s with position:%s until a box is generated",
	(display, position) => {
		const { styles, style, target, flow, resolved } = fixture(
			"",
			`display:${display};position:${position};float:left!important`,
		);
		expect(styles.get(target).display).toBe(display);
		expect(flow()).toMatchObject({ position, float: "left" });
		expect(resolved("float")).toBe("left");
		style.display = "inline";
		expect(styles.get(target).display).toBe("block");
		expect(resolved("float")).toBe("none");
		expect(style.cssFloat).toBe("left");
		expect(style.getPropertyPriority("float")).toBe("important");
		style.position = "relative";
		expect(resolved("float")).toBe("left");
		style.position = position;
		expect(resolved("float")).toBe("none");
		style.display = display;
		expect(resolved("float")).toBe("left");
	},
);

it.each(["none", "contents"] as const)(
	"inherits the retained computed float of a display:%s parent",
	(display) => {
		const { tree, styles, id, flow } = fixture(
			`#parent{display:${display};position:absolute;float:right}`,
			"float:inherit",
		);
		expect(styles.flow(id("#parent"))).toMatchObject({
			position: "absolute",
			float: "right",
		});
		expect(flow()).toMatchObject({ position: "static", float: "right" });
		tree.setAttribute(id("#parent"), "style", "display:block");
		expect(styles.flow(id("#parent")).float).toBe("none");
		expect(flow().float).toBe("none");
	},
);

it("invalidates normalization after stylesheet, selector and DOM style mutations", () => {
	const { tree, style, target, id, flow, resolved } = fixture(
		"#target{float:left}.positioned{position:absolute}",
	);
	expect(flow()).toMatchObject({ position: "static", float: "left" });
	tree.setAttribute(target, "class", "positioned");
	expect(resolved("float")).toBe("none");
	tree.setTextContent(
		id("#sheet"),
		"#target{float:right}.positioned{position:relative}",
	);
	expect(flow()).toMatchObject({ position: "relative", float: "right" });
	tree.setAttribute(target, "style", "position:fixed;float:left");
	expect(style.cssFloat).toBe("left");
	expect(resolved("float")).toBe("none");
	tree.removeAttribute(target, "style");
	expect(style.cssFloat).toBe("");
	expect(resolved("float")).toBe("right");
});

it("closes native inline ownership and revokes computed reads without altering saved snapshots", () => {
	const { tree, declarations, style, flow, resolved } = fixture(
		"",
		"position:absolute;float:left",
	);
	const before = flow();
	expect(before.float).toBe("none");
	expect(declarations.stats.objects).toBe(1);
	tree.close();
	expect(declarations.stats.objects).toBe(0);
	expect(() => style.getPropertyValue("float")).toThrow(/closed/i);
	expect(() => style.removeProperty("position")).toThrow(/closed/i);
	expect(() => flow()).toThrow(/closed/i);
	expect(() => resolved("float")).toThrow(/closed/i);
	expect(before).toMatchObject({ position: "absolute", float: "none" });
	expect(Object.isFrozen(before)).toBe(true);
});
