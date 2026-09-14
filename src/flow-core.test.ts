import { afterEach, expect, it } from "vitest";
import { ComputedStyles, resolvedStyleValue } from "./computed-styles.js";
import { cssFlowProperties, initialFlowStyle } from "./css-flow.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentElementScroll } from "./element-scroll.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
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
	cssFloat: string;
	cssText: string;
	position: string;
	overflow: string;
	overflowX: string;
	overflowY: string;
	length: number;
	setProperty(name: string, value: string, priority?: string): void;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	removeProperty(name: string): string;
}
function fixture(css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}#target{width:10px;height:10px;background:red}${css}</style><main id="parent"><div id="target"></div></main><section id="other"></section>`,
		"https://fixture.invalid/flow-core",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id();
	const styles = documentStyles(tree);
	styles.setViewport(100, 100);
	return {
		tree,
		id,
		styles,
		style: new InlineStyles(tree, factory).get(target) as Style,
		computed: new ComputedStyles(tree, factory).get(target) as Style,
		read: (name: string) => resolvedStyleValue(tree, target, name),
	};
}

it("renders explicit neutral flow declarations through the shared owners", () => {
	const { tree, styles, id, read } = fixture(
		"#target{position:static;float:none;clear:none;overflow:visible;z-index:auto}",
	);
	for (const name of cssFlowProperties)
		expect(read(name)).toBe(initialFlowStyle[name]);
	expect(styles.metrics().issues).toEqual({});
	expect(buildFormattingTree(tree).issues).toEqual({});
	expect(documentGeometry(tree).getBoundingClientRect(id())).toMatchObject({
		width: 10,
		height: 10,
	});
	expect(Array.from(rasterizeDocument(tree).image.pixels.slice(0, 4))).toEqual([
		255, 0, 0, 255,
	]);
});

const overflows = ["visible", "clip", "hidden", "scroll", "auto"];
it.each(
	overflows.flatMap((horizontal) =>
		overflows.map((vertical) => [horizontal, vertical]),
	),
)(
	"cascades and exposes the draft overflow pair %s/%s",
	(horizontal, vertical) => {
		const { computed, style } = fixture(
			`#target{overflow:${horizontal} ${vertical}}`,
		);
		const scrollable = ["hidden", "scroll", "auto"];
		const expectedX =
			horizontal === "visible" && scrollable.includes(vertical)
				? "auto"
				: horizontal;
		const expectedY =
			vertical === "visible" && scrollable.includes(horizontal)
				? "auto"
				: vertical;
		expect(computed.overflowX).toBe(expectedX);
		expect(computed.overflowY).toBe(expectedY);
		expect(computed.overflow).toBe(
			expectedX === expectedY ? expectedX : `${expectedX} ${expectedY}`,
		);
		style.overflow = "visible";
		expect(computed.overflow).toBe("visible");
	},
);

it("preserves all-auto sticky geometry and capture through CSSOM position reset", () => {
	const { tree, style, computed, id } = fixture();
	const geometry = documentGeometry(tree);
	const before = geometry.getBoundingClientRect(id());
	const following = geometry.getBoundingClientRect(id("#other"));
	const capture = rasterizeDocument(tree);
	style.setProperty("position", "sticky");
	expect(style.getPropertyValue("position")).toBe("sticky");
	expect(computed.getPropertyValue("position")).toBe("sticky");
	for (const inset of ["top", "right", "bottom", "left"])
		expect(resolvedStyleValue(tree, id(), inset)).toBe("auto");
	expect(buildFormattingTree(tree).issues).toEqual({});
	expect(geometry.getBoundingClientRect(id())).toEqual(before);
	expect(geometry.getBoundingClientRect(id("#other"))).toEqual(following);
	const sticky = rasterizeDocument(tree);
	expect(sticky.clip).toEqual(capture.clip);
	expect(sticky.image.pixels).toEqual(capture.image.pixels);
	style.setProperty("position", "static");
	expect(computed.getPropertyValue("position")).toBe("static");
	expect(geometry.getBoundingClientRect(id())).toEqual(before);
	expect(geometry.getBoundingClientRect(id("#other"))).toEqual(following);
	const reset = rasterizeDocument(tree);
	expect(reset.image.pixels).toEqual(capture.image.pixels);
	expect(reset.metrics.paintedBackgrounds).toBeGreaterThan(0);
});

it.each([["overflow", "hidden", "visible"]])(
	"invalidates clipping and capture without changing geometry when resetting %s",
	(name, value, neutral) => {
		const { tree, style, computed, id } = fixture();
		const child = tree.createElement("div", {
			style: "width:20px;height:20px;background:blue",
		});
		tree.append(id(), child);
		const geometry = documentGeometry(tree);
		const hits = documentHitTesting(tree);
		const before = geometry.getBoundingClientRect(id());
		const childBefore = geometry.getBoundingClientRect(child);
		const capture = rasterizeDocument(tree);
		expect(hits.elementFromPoint(15, 5)).toBe(child);
		style.setProperty(name, value);
		expect(computed.getPropertyValue(name)).toBe(value);
		expect(buildFormattingTree(tree).issues).toEqual({});
		expect(geometry.getBoundingClientRect(id())).toEqual(before);
		expect(geometry.getBoundingClientRect(child)).toEqual(childBefore);
		expect(hits.elementFromPoint(5, 5)).toBe(child);
		expect(hits.elementFromPoint(15, 5)).not.toBe(child);
		expect(rasterizeDocument(tree).image.pixels).not.toEqual(
			capture.image.pixels,
		);
		style.setProperty(name, neutral);
		expect(geometry.getBoundingClientRect(id())).toEqual(before);
		expect(hits.elementFromPoint(15, 5)).toBe(child);
		expect(rasterizeDocument(tree).image.pixels).toEqual(capture.image.pixels);
		expect(rasterizeDocument(tree).metrics.paintedBackgrounds).toBeGreaterThan(
			0,
		);
	},
);

it("updates coordinated float geometry and restores ordinary block flow", () => {
	const { tree, style, computed, id } = fixture();
	const geometry = documentGeometry(tree);
	const before = geometry.getBoundingClientRect(id());
	expect(geometry.getBoundingClientRect(id("#other")).y).toBe(10);
	style.cssFloat = "left";
	expect(computed.getPropertyValue("float")).toBe("left");
	expect(buildFormattingTree(tree).issues["float-layout-not-supported"]).toBe(
		1,
	);
	expect(geometry.getBoundingClientRect(id())).toEqual(before);
	expect(geometry.getBoundingClientRect(id("#parent")).height).toBe(0);
	expect(geometry.getBoundingClientRect(id("#other")).y).toBe(0);
	expect(rasterizeDocument(tree).metrics.paintedBackgrounds).toBeGreaterThan(0);
	style.cssFloat = "none";
	expect(geometry.getBoundingClientRect(id())).toEqual(before);
	expect(geometry.getBoundingClientRect(id("#other")).y).toBe(10);
});

it("preserves clear geometry and capture without an active float", () => {
	const { tree, style, computed, id } = fixture();
	const geometry = documentGeometry(tree);
	const before = geometry.getBoundingClientRect(id());
	style.setProperty("clear", "both");
	expect(style.getPropertyValue("clear")).toBe("both");
	expect(computed.getPropertyValue("clear")).toBe("both");
	expect(buildFormattingTree(tree).issues).toEqual({});
	expect(geometry.getBoundingClientRect(id())).toEqual(before);
	expect(rasterizeDocument(tree).metrics.paintedBackgrounds).toBeGreaterThan(0);
	style.setProperty("clear", "none");
	expect(geometry.getBoundingClientRect(id())).toEqual(before);
});

it("ignores overridden, unmatched and display-none unsupported flow", () => {
	const { tree, computed } = fixture(
		".missing{float:left}#other{display:none;overflow:hidden}#target{position:absolute;position:static;overflow:hidden;overflow:visible}",
	);
	expect(computed.position).toBe("static");
	expect(buildFormattingTree(tree).issues).toEqual({});
	expect(() => layoutDocument(tree)).not.toThrow();
});

it("keeps important scrollable axes until both cascade winners become visible", () => {
	const { tree, style, computed, id } = fixture(
		"#target{overflow:hidden!important}",
	);
	tree.append(
		id(),
		tree.createElement("div", { style: "width:20px;height:30px" }),
	);
	const scroll = documentElementScroll(tree);
	style.overflow = "visible";
	expect(computed.overflow).toBe("hidden");
	expect(scroll.bounds(id())).toEqual({ x: 10, y: 20 });
	style.setProperty("overflow-x", "visible", "important");
	expect(computed.overflow).toBe("auto hidden");
	expect(scroll.bounds(id())).toEqual({ x: 10, y: 20 });
	expect(scroll.to(id(), 5, 6)).toBe(true);
	expect(scroll.get(id())).toMatchObject({ scrollLeft: 5, scrollTop: 6 });
	style.setProperty("overflow-y", "visible", "important");
	expect(computed.overflow).toBe("visible");
	expect(scroll.bounds(id())).toEqual({ x: 0, y: 0 });
	expect(scroll.get(id())).toMatchObject({ scrollLeft: 0, scrollTop: 0 });
	expect(documentGeometry(tree).getBoundingClientRect(id())).toMatchObject({
		x: 0,
		y: 0,
		width: 10,
		height: 10,
	});
});

it.each(["initial", "unset", "revert", "inherit"])(
	"handles all:%s without implicit flow inheritance",
	(keyword) => {
		const { computed, style, tree, id } = fixture(
			"#parent{float:right;overflow:clip}#target{float:left;overflow:hidden}",
		);
		style.setProperty("all", keyword);
		expect(computed.cssFloat).toBe(keyword === "inherit" ? "right" : "none");
		expect(computed.overflow).toBe(keyword === "inherit" ? "clip" : "visible");
		tree.removeAttribute(id(), "style");
		style.cssText = "float:unset;overflow:unset";
		expect(computed.cssFloat).toBe("none");
	},
);

it("recomputes explicit inheritance after reparenting and parent mutation", () => {
	const { tree, style, computed, id } = fixture(
		"#parent{float:left;overflow:clip}#other{float:right;overflow:visible}",
	);
	style.cssText = "float:inherit;overflow:inherit";
	expect(computed.cssFloat).toBe("left");
	tree.append(id("#other"), id());
	expect(computed.cssFloat).toBe("right");
	expect(computed.overflow).toBe("visible");
	tree.setAttribute(id("#other"), "style", "float:none");
	expect(computed.cssFloat).toBe("none");
});

it("substitutes complete shorthand winners and invalidates missing winners", () => {
	const { style, computed, tree } = fixture(
		"#target{--spill:hidden clip;overflow:var(--spill)}",
	);
	expect(computed.overflow).toBe("hidden clip");
	style.setProperty("--spill", "visible");
	expect(computed.overflow).toBe("visible");
	style.cssText = "overflow:hidden;overflow:var(--absent)";
	expect(computed.overflow).toBe("visible");
	expect(() => layoutDocument(tree)).not.toThrow();
});

it("keeps unresolved shorthand edits atomic with complete removal", () => {
	const { style, computed } = fixture();
	style.setProperty("--spill", "clip");
	style.setProperty("overflow", "var(--spill)", "important");
	expect(style.overflow).toBe("var(--spill)");
	expect(style.getPropertyPriority("overflow")).toBe("important");
	expect(computed.overflow).toBe("clip");
	expect(style.removeProperty("overflow")).toBe("var(--spill)");
	expect(computed.overflow).toBe("visible");
});

it("preserves valid state after invalid shorthand mutation and serializes mixed priority honestly", () => {
	const { style, computed } = fixture();
	style.overflow = "overlay clip";
	expect(style.overflow).toBe("auto clip");
	const before = style.cssText;
	style.overflow = "inherit hidden";
	expect(style.cssText).toBe(before);
	style.setProperty("overflow-x", "hidden", "important");
	expect(style.overflow).toBe("");
	expect(computed.overflow).toBe("hidden clip");
});

it("exposes the cssFloat alias and rejects writes to saved computed objects", () => {
	const { style, computed } = fixture();
	style.cssFloat = "right";
	expect(style.getPropertyValue("float")).toBe("right");
	expect(computed.cssFloat).toBe("right");
	expect(() => {
		computed.cssFloat = "none";
	}).toThrow();
	expect(style.cssFloat).toBe("right");
});

it.each(["-9007199254740991", "9007199254740991", "+0002", "-0"])(
	"canonicalizes bounded z-index %s without stacking static boxes",
	(value) => {
		const { style, computed, tree } = fixture();
		style.setProperty("z-index", value);
		expect(computed.getPropertyValue("z-index")).toBe(String(Number(value)));
		style.setProperty("z-index", "9007199254740992");
		expect(computed.getPropertyValue("z-index")).toBe(String(Number(value)));
		expect(() => layoutDocument(tree)).not.toThrow();
	},
);

it("invalidates media winners without mutating saved computed objects", () => {
	const { styles, computed, tree, id } = fixture(
		"@media(min-width:150px){#target{overflow:hidden}}",
	);
	tree.append(
		id(),
		tree.createElement("div", { style: "width:20px;height:30px" }),
	);
	const scroll = documentElementScroll(tree);
	const before = documentGeometry(tree).getBoundingClientRect(id());
	expect(computed.overflow).toBe("visible");
	expect(scroll.bounds(id())).toEqual({ x: 0, y: 0 });
	styles.setViewport(200, 100);
	expect(computed.overflow).toBe("hidden");
	expect(scroll.bounds(id())).toEqual({ x: 10, y: 20 });
	expect(documentGeometry(tree).getBoundingClientRect(id())).toEqual(before);
	styles.setViewport(100, 100);
	expect(computed.overflow).toBe("visible");
	expect(scroll.bounds(id())).toEqual({ x: 0, y: 0 });
	expect(documentGeometry(tree).getBoundingClientRect(id())).toEqual(before);
});

it("empties detached computed declarations, restores them, and revokes them on close", () => {
	const { tree, id, style, computed } = fixture();
	style.overflow = "clip";
	const target = id();
	const parent = id("#parent");
	tree.remove(target);
	expect(computed.overflow).toBe("");
	expect(computed.cssFloat).toBe("");
	expect(computed.length).toBe(0);
	tree.append(parent, target);
	expect(computed.overflow).toBe("clip");
	tree.close();
	expect(() => computed.overflow).toThrow();
	expect(() => style.overflow).toThrow();
});

it("keeps cascade resource failure atomic and recovers after stylesheet repair", () => {
	const { tree, id } = fixture();
	const styles = new DocumentStyles(tree, { maxDeclarations: 8 });
	expect(styles.flow(id())).toBe(initialFlowStyle);
	tree.setAttribute(
		id(),
		"style",
		Array.from({ length: 9 }, () => "overflow:hidden").join(";"),
	);
	expect(() => styles.flow(id())).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	tree.setAttribute(id(), "style", "overflow:clip");
	expect(styles.flow(id())["overflow-x"]).toBe("clip");
	styles.close();
	expect(() => styles.flow(id())).toThrow();
});
