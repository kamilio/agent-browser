import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import {
	buildFormattingTree,
	resolveFormattingPageWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	display: string;
	cssFloat: string;
	position: string;
	setProperty(name: string, value: string, priority?: string): void;
	getPropertyPriority(name: string): string;
	removeProperty(name: string): string;
}

const documents: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(object, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css = "", inline = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">${css}</style><main id="parent"><span id="target"><span id="child">Float</span></span></main>`,
		"https://fixture.invalid/float-display",
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
	const display = (selector = "#target") =>
		resolvedStyleValue(tree, id(selector), "display");
	return { tree, styles, target, id, style, display };
}

const adjustedDisplays = [
	["inline", "block"],
	["inline-block", "block"],
	["inline-table", "table"],
	["table-row-group", "block"],
	["table-column", "block"],
	["table-column-group", "block"],
	["table-header-group", "block"],
	["table-footer-group", "block"],
	["table-row", "block"],
	["table-cell", "block"],
	["table-caption", "block"],
] as const;

it.each(
	adjustedDisplays.flatMap(([specified, computed]) =>
		["left", "right"].map((float) => [specified, computed, float]),
	),
)(
	"computes captured display:%s as %s for float:%s",
	(specified, computed, float) => {
		const inline = `display:${specified};float:${float}`;
		const { tree, styles, target, style, display } = fixture("", inline);
		expect(display()).toBe(computed);
		expect(styles.get(target).display).toBe(computed);
		expect(styles.flow(target).float).toBe(float);
		expect(style.display).toBe(specified);
		expect(style.cssFloat).toBe(float);
		expect(tree.get(target).attributes.style).toBe(inline);
		expect(styles.metrics().issues).toEqual({});
	},
);

it.each(["block", "table", "list-item"])(
	"preserves captured unchanged floating display:%s",
	(specified) => {
		const { display, styles, target } = fixture(
			"",
			`display:${specified};float:left`,
		);
		expect(display()).toBe(specified);
		expect(styles.flow(target).float).toBe("left");
	},
);

it.each([
	"flow-root",
	"flex",
	"inline-flex",
	"grid",
	"inline-grid",
	"block flow",
	"inline flow",
	"block flow-root",
	"inline flow-root",
	"block flex",
	"inline flex",
	"block grid",
	"inline grid",
	"block table",
	"inline table",
])(
	"does not infer a new modern float display mapping for %s from CSS2.2",
	(specified) => {
		const { display, styles, target } = fixture(
			"",
			`display:${specified};float:left`,
		);
		expect(display()).toBe(specified);
		expect(styles.flow(target).float).toBe("left");
	},
);

it.each(["", "float:none", "float:initial", "float:unset", "float:revert"])(
	"does not blockify an ordinary inline box with %j",
	(inline) => {
		const { display, styles, target } = fixture(
			"#parent{float:left}",
			`display:inline;${inline}`,
		);
		expect(display()).toBe("inline");
		expect(styles.flow(target).float).toBe("none");
	},
);

it.each(["initial", "unset", "revert"])(
	"resolves display:%s before applying the float table",
	(keyword) => {
		const { display, style } = fixture("", `display:${keyword};float:left`);
		expect(style.display).toBe(keyword);
		expect(display()).toBe("block");
	},
);

it.each([
	["inline", "block"],
	["inline-table", "table"],
] as const)(
	"inherits the computed floating display of %s rather than its specified value",
	(specified, computed) => {
		const { tree, styles, id, style, display } = fixture(
			"#child{display:inherit}",
			`display:${specified};float:left`,
		);
		expect(style.display).toBe(specified);
		expect(display()).toBe(computed);
		expect(display("#child")).toBe(computed);
		expect(styles.flow(id("#child")).float).toBe("none");
		tree.setAttribute(id("#child"), "style", "float:inherit");
		expect(styles.flow(id("#child")).float).toBe("left");
		expect(display("#child")).toBe(computed);
		style.cssFloat = "none";
		expect(display()).toBe(specified);
		expect(display("#child")).toBe(specified);
	},
);

it("resolves inherited display before blockifying a floating child", () => {
	const { style, display } = fixture(
		"#parent{display:inline-table}",
		"display:inherit;float:right",
	);
	expect(style.display).toBe("inherit");
	expect(display("#parent")).toBe("inline-table");
	expect(display()).toBe("table");
});

it("applies cascade priorities before mapping and preserves specified priorities", () => {
	const { tree, id, style, display } = fixture(
		"#target{display:inline-table!important;float:left}",
		"display:inline;float:none!important",
	);
	expect(display()).toBe("inline-table");
	style.setProperty("float", "right", "important");
	expect(display()).toBe("table");
	expect(style.display).toBe("inline");
	expect(style.getPropertyPriority("float")).toBe("important");
	style.setProperty("display", "inline-block", "important");
	expect(display()).toBe("block");
	expect(style.display).toBe("inline-block");
	expect(style.getPropertyPriority("display")).toBe("important");
	expect(style.removeProperty("display")).toBe("inline-block");
	expect(display()).toBe("table");
	tree.setTextContent(
		id("#sheet"),
		"#target{display:inline!important;float:none!important}",
	);
	expect(display()).toBe("block");
	style.removeProperty("float");
	expect(display()).toBe("inline");
});

it("invalidates computed display through CSSOM, selector and stylesheet mutations", () => {
	const { tree, styles, target, id, style, display } = fixture(
		".floated{float:left}#target{display:inline}",
	);
	const before = styles.get(target);
	expect(display()).toBe("inline");
	tree.setAttribute(target, "class", "floated");
	expect(display()).toBe("block");
	expect(styles.get(target)).not.toBe(before);
	expect(before.display).toBe("inline");
	expect(Object.isFrozen(before)).toBe(true);
	style.display = "inline-table";
	expect(display()).toBe("table");
	style.cssFloat = "none";
	expect(display()).toBe("inline-table");
	expect(style.removeProperty("float")).toBe("none");
	expect(display()).toBe("table");
	expect(style.removeProperty("display")).toBe("inline-table");
	expect(display()).toBe("block");
	tree.setTextContent(id("#sheet"), "#target{display:inline;float:none}");
	expect(display()).toBe("inline");
});

it.each(["absolute", "fixed"] as const)(
	"preserves positioned float:none precedence through %s transitions",
	(position) => {
		const { styles, target, style, display } = fixture(
			"",
			`display:inline;float:left;position:${position}`,
		);
		expect(display()).toBe("block");
		expect(styles.flow(target).float).toBe("none");
		expect(styles.get(target).unpositionedDisplay).toBe("inline");
		expect(style.cssFloat).toBe("left");
		style.position = "static";
		expect(display()).toBe("block");
		expect(styles.flow(target).float).toBe("left");
		style.cssFloat = "none";
		expect(display()).toBe("inline");
		style.position = position;
		expect(display()).toBe("block");
		expect(styles.flow(target).float).toBe("none");
	},
);

it.each(["none", "contents"] as const)(
	"keeps display:%s boxless with the existing native computed-float profile",
	(specified) => {
		const { styles, target, style, display } = fixture(
			"",
			`display:${specified};float:left;position:absolute`,
		);
		expect(display()).toBe(specified);
		expect(styles.flow(target).float).toBe("left");
		style.display = "inline";
		expect(display()).toBe("block");
		expect(styles.flow(target).float).toBe("none");
		style.position = "relative";
		expect(display()).toBe("block");
		expect(styles.flow(target).float).toBe("left");
		style.display = specified;
		expect(display()).toBe(specified);
		expect(styles.flow(target).float).toBe("left");
	},
);

it.each(["flex", "grid"] as const)(
	"does not introduce computed float suppression for existing %s items",
	(container) => {
		const { tree, styles, target, display } = fixture(
			`#parent{display:${container}}`,
			"display:inline;float:left",
		);
		expect(display()).toBe("block");
		expect(styles.flow(target).float).toBe("left");
		expect(buildFormattingTree(tree).issues["float-layout-not-supported"]).toBe(
			1,
		);
	},
);

it("retains the raw width guard while coordinating floated page geometry", () => {
	const { tree, target, display } = fixture(
		"#target{font-size:8px;line-height:8px}",
		"display:inline;float:left",
	);
	expect(display()).toBe("block");
	const formatting = buildFormattingTree(tree);
	expect(formatting.issues["float-layout-not-supported"]).toBe(1);
	expect(() => resolveFormattingPageWidths(formatting)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(
		layoutDocument(tree).boxes.find(
			(box) => box.ref === tree.reference(target),
		),
	).toMatchObject({ contentWidth: 30, contentHeight: 8 });
});

it("keeps floating inline-table as table and preserves negative table layout guards", () => {
	const { tree, style, display } = fixture(
		"",
		"display:inline-table;float:left",
	);
	expect(display()).toBe("table");
	expect(style.display).toBe("inline-table");
	expect(buildFormattingTree(tree).issues).toMatchObject({
		"float-layout-not-supported": 1,
		"display-layout-not-supported": 1,
	});
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("retains invalid CSS diagnostics instead of accepting an unknown table display", () => {
	const { tree, styles, display } = fixture(
		"#target{display:table-unknown;float:left}",
	);
	expect(display()).toBe("block");
	expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(1);
	expect(
		buildFormattingTree(tree).issues["css:unimplemented-or-invalid-css-value"],
	).toBe(1);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});
