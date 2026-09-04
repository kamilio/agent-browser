import { afterEach, expect, it } from "vitest";
import { ComputedStyles } from "./computed-styles.js";
import {
	cssFlexProperties,
	initialFlexStyle,
	parseFlexValue,
} from "./css-flex.js";
import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { resolveFlexLines } from "./flex-line.js";
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
	cssText: string;
	flex: string;
	flexFlow: string;
	gap: string;
	alignSelf: string;
	length: number;
	setProperty(name: string, value: string, priority?: string): void;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	removeProperty(name: string): string;
}
function fixture(css = "", content = '<div id="target"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:20px}#parent{font-size:10px}#target{font-size:12px}${css}</style><main id="parent">${content}</main><section id="other"></section>`,
		"https://fixture.invalid/flex-core",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(200, 100);
	return {
		tree,
		id,
		styles,
		style: new InlineStyles(tree, factory).get(id()) as Style,
		computed: new ComputedStyles(tree, factory).get(id()) as Style,
		flex: () => styles.flex(id()),
	};
}

it.each(["safe normal", "unsafe normal"])(
	"accepts draft align-self %s in the grammar",
	(value) => {
		expect(parseFlexValue("align-self", value)).toBe(value);
		expect(parseFlexValue("align-self", "normal")).toBe("normal");
	},
);
it.each(["safe normal", "unsafe normal"])(
	"lets authored draft %s replace an earlier winner",
	(value) => {
		const { flex, computed } = fixture(
			`#target{align-self:center;align-self:${value}}`,
		);
		expect(flex()["align-self"]).toBe(value);
		expect(computed.alignSelf).toBe(value);
	},
);
it.each(["safe normal", "unsafe normal"])(
	"accepts draft %s through CSSOM mutation",
	(value) => {
		const { style, computed } = fixture();
		style.alignSelf = "center";
		const before = style.cssText;
		style.alignSelf = value;
		expect(style.cssText).not.toBe(before);
		expect(computed.alignSelf).toBe(value);
	},
);
it.each(["safe normal", "unsafe normal"])(
	"retains substituted draft %s as the computed winner",
	(value) => {
		const { computed } = fixture(
			`#target{--alignment:${value};align-self:center;align-self:var(--alignment)}`,
		);
		expect(computed.alignSelf).toBe(value);
	},
);

it.each(["safe stretch", "unsafe stretch"])(
	"rejects invalid overflow-alignment %s",
	(value) => {
		expect(parseFlexValue("align-self", value)).toBeUndefined();
		const { style, computed } = fixture();
		style.alignSelf = "center";
		const before = style.cssText;
		style.alignSelf = value;
		expect(style.cssText).toBe(before);
		expect(computed.alignSelf).toBe("center");
	},
);

it.each(["safe center", "unsafe flex-end", "self-start", "normal"])(
	"retains valid alignment %s through native owners",
	(value) => {
		const { computed, style } = fixture(`#target{align-self:${value}}`);
		expect(computed.alignSelf).toBe(value);
		style.alignSelf = value;
		expect(style.alignSelf).toBe(value);
	},
);

it("exposes all twelve flex longhands without requiring a flex container", () => {
	const { computed, tree, styles } = fixture();
	for (const property of cssFlexProperties)
		expect(computed.getPropertyValue(property)).toBe(
			initialFlexStyle[property],
		);
	expect(styles.metrics().issues).toEqual({});
	expect(() => layoutDocument(tree)).not.toThrow();
});

it.each([
	["none", "0 0 auto"],
	["auto", "1 1 auto"],
	["2", "2 1 0%"],
	["3 4 10px", "3 4 10px"],
	["0 0", "0 0 0%"],
])("expands and serializes flex:%s", (value, expected) => {
	const { style, computed } = fixture();
	style.flex = value;
	expect(style.flex).toBe(expected);
	expect(computed.flex).toBe(expected);
});

it("expands gap and flex-flow with shared importance and partial replacement", () => {
	const { style, computed } = fixture();
	style.setProperty("flex-flow", "wrap column-reverse", "important");
	expect(style.flexFlow).toBe("column-reverse wrap");
	expect(style.getPropertyPriority("flex-flow")).toBe("important");
	style.setProperty("flex-direction", "row");
	expect(style.flexFlow).toBe("");
	style.gap = "1em 2rem";
	expect(computed.gap).toBe("12px 40px");
	expect(style.removeProperty("flex-flow")).toBe("");
	expect(computed.flexFlow).toBe("row nowrap");
});

it("uses substituted basis and gaps with live font and viewport bases", () => {
	const { style, computed, styles } = fixture(
		"#target{--basis:calc(2em + 1rem + 10vw);flex:2 1 var(--basis);gap:calc(1em + 5%) 2rem}",
	);
	expect(computed.getPropertyValue("flex-basis")).toBe("64px");
	expect(computed.getPropertyValue("row-gap")).toBe("calc(12px + 5%)");
	style.setProperty("font-size", "15px");
	styles.setViewport(300, 100);
	expect(computed.getPropertyValue("flex-basis")).toBe("80px");
	expect(computed.getPropertyValue("row-gap")).toBe("calc(15px + 5%)");
});

it.each(["initial", "unset", "revert", "inherit"])(
	"applies all:%s to flex winners without implicit inheritance",
	(value) => {
		const { style, computed } = fixture(
			"#parent{flex:5 6 7px;gap:8px}#target{flex:1 2 3px;gap:4px}",
		);
		style.setProperty("all", value);
		expect(computed.flex).toBe(value === "inherit" ? "5 6 7px" : "0 1 auto");
		expect(computed.gap).toBe(value === "inherit" ? "8px" : "normal");
	},
);

it("recomputes inherited flex values across reparenting and retains previous records", () => {
	const { tree, id, style, flex } = fixture(
		"#parent{flex:1 2 3px}#other{flex:4 5 6px}",
	);
	style.flex = "inherit";
	const before = flex();
	expect(before["flex-grow"]).toBe("1");
	tree.append(id("#other"), id());
	expect(flex()["flex-grow"]).toBe("4");
	expect(before["flex-grow"]).toBe("1");
	expect(Object.isFrozen(before)).toBe(true);
});

it("blockifies flex children through display:contents but not nested ordinary boxes", () => {
	const { tree, id, styles } = fixture(
		"#parent{display:flex}#contents{display:contents}",
		'<div id="contents"><span id="target"><i id="inner"></i></span></div>',
	);
	expect(styles.get(id()).display).toBe("block");
	expect(styles.get(id("#contents")).display).toBe("contents");
	expect(styles.get(id("#inner")).display).toBe("inline");
	tree.setAttribute(id("#parent"), "style", "display:block");
	expect(styles.get(id()).display).toBe("inline");
});

it("preserves unresolved shorthand replacement and complete removal", () => {
	const { style, computed } = fixture();
	style.setProperty("--flex", "2 3 10px");
	style.setProperty("flex", "var(--flex)", "important");
	expect(computed.flex).toBe("2 3 10px");
	expect(style.flex).toBe("var(--flex)");
	expect(style.removeProperty("flex")).toBe("var(--flex)");
	expect(computed.flex).toBe("0 1 auto");
	style.cssText = "flex:5;flex:var(--missing)";
	expect(computed.flex).toBe("0 1 auto");
});

it("converts computed style inputs into constrained measured main-axis sizes", () => {
	const { flex, computed } = fixture(
		"#target{flex:2 1 20px;column-gap:10px;justify-content:space-between}",
	);
	const values = flex();
	const result = resolveFlexLines(
		[
			{
				baseSize: Number.parseFloat(values["flex-basis"]),
				minSize: 0,
				maxSize: 30,
				grow: Number(values["flex-grow"]),
			},
			{ baseSize: 20, minSize: 0, grow: 1 },
		],
		100,
		{
			gap: Number.parseFloat(computed.getPropertyValue("column-gap")),
			justify: "space-between",
		},
	);
	expect(result.lines[0].items.map((item) => item.contentSize)).toEqual([
		30, 60,
	]);
	expect(result.lines[0].items.map((item) => item.mainOffset)).toEqual([0, 40]);
	expect(result.lines[0].remainingFreeSpace).toBe(0);
});

it("updates media winners and denies mutation of computed declarations", () => {
	const { computed, styles } = fixture(
		"@media(min-width:250px){#target{flex-grow:4}}",
	);
	expect(computed.getPropertyValue("flex-grow")).toBe("0");
	styles.setViewport(300, 100);
	expect(computed.getPropertyValue("flex-grow")).toBe("4");
	expect(() => {
		computed.flex = "2";
	}).toThrow();
});

it("empties detached declarations and revokes saved owners on close", () => {
	const { tree, id, style, computed } = fixture();
	style.flex = "2";
	const target = id();
	const parent = id("#parent");
	tree.remove(target);
	expect(computed.flex).toBe("");
	expect(computed.length).toBe(0);
	tree.append(parent, target);
	expect(computed.flex).toBe("2 1 0%");
	tree.close();
	expect(() => computed.flex).toThrow();
	expect(() => style.flex).toThrow();
});

it("recovers after a failed bounded flex declaration rebuild", () => {
	const { tree, id } = fixture();
	const styles = new DocumentStyles(tree, { maxDeclarations: 8 });
	expect(styles.flex(id())).toBe(initialFlexStyle);
	tree.setAttribute(
		id(),
		"style",
		Array.from({ length: 9 }, () => "flex:2").join(";"),
	);
	expect(() => styles.flex(id())).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	tree.setAttribute(id(), "style", "flex:4");
	expect(styles.flex(id())["flex-grow"]).toBe("4");
	styles.close();
	expect(() => styles.flex(id())).toThrow();
});
