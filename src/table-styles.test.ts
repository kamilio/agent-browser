import { afterEach, expect, it, vi } from "vitest";
import {
	ComputedStyles,
	computedStyleProperties,
	resolvedStyleValue,
} from "./computed-styles.js";
import {
	inlineProperties,
	parseInlineDeclarations,
} from "./css-declarations.js";
import { parseCssDeclarations } from "./css-parser.js";
import {
	cssTableProperties,
	initialTableStyle,
	type TableStyle,
} from "./css-table.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";
import { InlineStyles } from "./inline-styles.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Style {
	[index: number]: string | undefined;
	length: number;
	tableLayout: string;
	borderCollapse: string;
	borderSpacing: string;
	captionSide: string;
	emptyCells: string;
	verticalAlign: string;
	cssText: string;
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

const documents: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		if (definition.indexed)
			Object.defineProperty(object, "length", {
				get: definition.indexed.length,
			});
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value });
		return new Proxy(object, {
			get(target, key) {
				if (
					typeof key === "string" &&
					/^(0|[1-9]\d*)$/.test(key) &&
					definition.indexed
				)
					return Number(key) < definition.indexed.length()
						? definition.indexed.get(Number(key))
						: undefined;
				return Reflect.get(target, key);
			},
		});
	},
};

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	css = "",
	markup = '<table id="target"><caption id="caption">Caption</caption><colgroup id="columns"><col id="column"></colgroup><thead id="head"><tr id="header-row"><th id="header">Heading</th></tr></thead><tbody id="group"><tr id="row"><td id="cell"><span id="inline">Cell</span></td></tr></tbody><tfoot id="foot"><tr><td>Footer</td></tr></tfoot></table>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head><style id="sheet">html{font-size:20px}main{font-size:10px}${css}</style></head><body><main id="parent">${markup}</main></body></html>`,
		"https://fixture.invalid/table-styles",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing table fixture ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	const inline = new InlineStyles(tree, factory).get(id()) as Style;
	const computed = new ComputedStyles(tree, factory).get(id()) as Style;
	return {
		tree,
		id,
		styles,
		inline,
		computed,
		table: (selector = "#target") => styles.table(id(selector)),
	};
}

it("exposes all table properties through stylesheet, inline and computed APIs", () => {
	const values: TableStyle = {
		"table-layout": "fixed",
		"border-collapse": "collapse",
		"border-spacing": "3px 4px",
		"caption-side": "bottom",
		"empty-cells": "hide",
		"vertical-align": "top",
	};
	const source = Object.entries(values)
		.map(([name, value]) => `${name}:${value}`)
		.join(";");
	const issues: string[] = [];
	const declarations = parseCssDeclarations(
		source,
		{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 20 },
		(issue) => issues.push(issue),
	);
	expect(issues).toEqual([]);
	expect(declarations).toHaveLength(cssTableProperties.length);
	expect(parseInlineDeclarations(source, 20)).toHaveLength(
		cssTableProperties.length,
	);
	const { tree, id, styles, inline, computed, table } = fixture(
		`#target{${source}}`,
	);
	expect(table()).toEqual(values);
	expect(styles.metrics().tableProperties).toBe(cssTableProperties);
	for (const name of cssTableProperties) {
		expect(inlineProperties).toContain(name);
		expect(computedStyleProperties).toContain(name);
		expect(resolvedStyleValue(tree, id(), name)).toBe(values[name]);
		expect(computed.getPropertyValue(name.toUpperCase())).toBe(values[name]);
		const camel = name.replace(/-([a-z])/g, (_match, letter: string) =>
			letter.toUpperCase(),
		);
		Reflect.set(inline, camel, values[name]);
		expect(inline.getPropertyValue(name)).toBe(values[name]);
		expect(Reflect.get(computed, camel)).toBe(values[name]);
	}
	expect(
		Array.from({ length: computed.length }, (_value, index) => computed[index]),
	).toEqual(computedStyleProperties);
	expect(() => {
		computed.borderSpacing = "9px";
	}).toThrow();
	expect(() => computed.setProperty("vertical-align", "bottom")).toThrow();
});

it("cascades specificity, source order and importance without accepting invalid replacements", () => {
	const { inline, computed, table } = fixture(
		"table{border-spacing:1px;table-layout:auto}#target{border-spacing:2px}table{border-spacing:3px!important}#target{border-spacing:8%;table-layout:fixed;table-layout:unknown}",
	);
	expect(table()["border-spacing"]).toBe("3px 3px");
	expect(table()["table-layout"]).toBe("fixed");
	inline.borderSpacing = "4px";
	expect(computed.borderSpacing).toBe("3px 3px");
	inline.setProperty("border-spacing", "5px 6px", "important");
	expect(computed.borderSpacing).toBe("5px 6px");
	expect(inline.getPropertyPriority("border-spacing")).toBe("important");
	inline.setProperty("border-spacing", "calc(1px + 0%)", "important");
	expect(inline.borderSpacing).toBe("5px 6px");
	expect(computed.borderSpacing).toBe("5px 6px");
	expect(inline.removeProperty("border-spacing")).toBe("5px 6px");
	expect(computed.borderSpacing).toBe("3px 3px");
});

it("assigns HTML table-part displays and UA values without changing CSS initial values", () => {
	const { styles, id, table } = fixture();
	const displays = {
		"#target": "table",
		"#caption": "table-caption",
		"#columns": "table-column-group",
		"#column": "table-column",
		"#head": "table-header-group",
		"#group": "table-row-group",
		"#foot": "table-footer-group",
		"#row": "table-row",
		"#cell": "table-cell",
	};
	for (const [selector, display] of Object.entries(displays))
		expect(styles.get(id(selector)).display).toBe(display);
	expect(table()).toEqual({
		...initialTableStyle,
		"border-spacing": "2px 2px",
	});
	expect(initialTableStyle["border-spacing"]).toBe("0px 0px");
	for (const selector of [
		"#head",
		"#group",
		"#foot",
		"#row",
		"#cell",
		"#header",
	])
		expect(table(selector)).toMatchObject({
			"border-spacing": "2px 2px",
			"vertical-align": "middle",
		});
	expect(table("#inline")["vertical-align"]).toBe("baseline");
	expect(Object.isFrozen(table())).toBe(true);
	expect(table()).toBe(table());
});

it.each(["initial", "unset", "inherit", "revert"])(
	"expands all:%s with inheritance and HTML defaults in both cascade paths",
	(value) => {
		const parent: TableStyle = {
			"table-layout": "fixed",
			"border-collapse": "collapse",
			"border-spacing": "7px 9px",
			"caption-side": "bottom",
			"empty-cells": "hide",
			"vertical-align": "bottom",
		};
		const source = Object.entries(parent)
			.map(([name, entry]) => `${name}:${entry}`)
			.join(";");
		const inherited = {
			...parent,
			"table-layout": "auto",
			"vertical-align": "baseline",
		};
		const expected =
			value === "initial"
				? initialTableStyle
				: value === "inherit"
					? parent
					: value === "unset"
						? inherited
						: { ...inherited, "border-spacing": "2px 2px" };
		const stylesheet = fixture(`main{${source}}#target{all:${value}}`);
		expect(stylesheet.table()).toEqual(expected);
		const inline = fixture(`main{${source}}`);
		inline.inline.setProperty("all", value);
		expect(inline.table()).toEqual(expected);
		for (const property of cssTableProperties)
			expect(inline.inline.getPropertyValue(property)).toBe(value);
		inline.inline.borderSpacing = "11px";
		expect(inline.table()["border-spacing"]).toBe("11px 11px");
	},
);

it.each([
	["", "middle"],
	["initial", "baseline"],
	["unset", "baseline"],
	["inherit", "bottom"],
	["revert", "middle"],
])(
	"applies row-group alignment %s before row/cell UA inheritance",
	(value, expected) => {
		const { table, tree, id } = fixture("#target{vertical-align:bottom}");
		if (value)
			tree.setAttribute(id("#group"), "style", `vertical-align:${value}`);
		for (const selector of ["#group", "#row", "#cell"])
			expect(table(selector)["vertical-align"]).toBe(expected);
		tree.setAttribute(id("#row"), "style", "vertical-align:top");
		expect(table("#cell")["vertical-align"]).toBe("top");
		tree.setAttribute(id("#cell"), "style", "vertical-align:unset");
		expect(table("#cell")["vertical-align"]).toBe("baseline");
		tree.setAttribute(id("#cell"), "style", "vertical-align:revert");
		expect(table("#cell")["vertical-align"]).toBe("top");
	},
);

it("inherits computed em/rem spacing and invalidates it when either font basis changes", () => {
	const { tree, id, table, computed } = fixture(
		"#target{border-spacing:calc(2em + 1rem) 3rem}#cell{font-size:99px}",
	);
	const original = table();
	expect(original["border-spacing"]).toBe("40px 60px");
	expect(table("#cell")["border-spacing"]).toBe("40px 60px");
	tree.setAttribute(id("#parent"), "style", "font-size:15px");
	expect(computed.borderSpacing).toBe("50px 60px");
	expect(table()).not.toBe(original);
	expect(table("#cell")["border-spacing"]).toBe("50px 60px");
	tree.setAttribute(id("html"), "style", "font-size:30px");
	expect(computed.borderSpacing).toBe("60px 90px");
	expect(table("#cell")["border-spacing"]).toBe("60px 90px");
});

it("invalidates viewport, media, inline and stylesheet dependent table caches", () => {
	const { tree, id, styles, table, inline, computed } = fixture(
		"#target{border-spacing:1vw 2vh}@media(max-width:500px){#target{caption-side:bottom}}",
	);
	styles.setViewport(400, 200);
	expect(computed.borderSpacing).toBe("4px 4px");
	expect(computed.captionSide).toBe("bottom");
	const small = table();
	styles.setViewport(800, 600);
	expect(computed.borderSpacing).toBe("8px 12px");
	expect(computed.captionSide).toBe("top");
	expect(table()).not.toBe(small);
	inline.borderSpacing = "9px";
	expect(table("#cell")["border-spacing"]).toBe("9px 9px");
	inline.removeProperty("border-spacing");
	tree.setTextContent(
		id("#sheet"),
		"#target{border-spacing:13px;empty-cells:hide}",
	);
	expect(computed.borderSpacing).toBe("13px 13px");
	expect(table("#cell")["empty-cells"]).toBe("hide");
});

it("resolves case-sensitive variables, math and invalid-at-computed-value fallback", () => {
	const { tree, id, inline, table } = fixture(
		"main{--Space:2em;--space:1px;border-spacing:7px}#target{border-spacing:3px;border-spacing:var(--Space) calc(1rem + 1px);caption-side:var(--side,bottom)}",
	);
	expect(table()["border-spacing"]).toBe("20px 21px");
	expect(table()["caption-side"]).toBe("bottom");
	tree.setAttribute(id("#parent"), "style", "--Space:10%");
	expect(table()["border-spacing"]).toBe("7px 7px");
	inline.setProperty("--Inline", "4px");
	inline.borderSpacing = "var(--Inline)";
	expect(inline.borderSpacing).toBe("var(--Inline)");
	expect(table()["border-spacing"]).toBe("4px 4px");
	inline.setProperty("--Inline", "calc(1px + 0%)");
	expect(table()["border-spacing"]).toBe("7px 7px");
	inline.setProperty("--reset", "initial");
	inline.setProperty("all", "var(--reset)");
	expect(table()).toEqual({
		...initialTableStyle,
		"border-spacing": "7px 7px",
	});
	inline.setProperty("all", "var(--reset, initial)");
	expect(table()).toEqual(initialTableStyle);
});

it.each(["initial", "unset", "inherit", "revert"])(
	"expands all with a variable fallback of %s in stylesheet and inline styles",
	(value) => {
		const source =
			"main{table-layout:fixed;border-collapse:collapse;border-spacing:7px 9px;caption-side:bottom;empty-cells:hide;vertical-align:bottom}";
		const fallback = `var(--reset, ${value})`;
		const direct = fixture(`${source}#target{all:${value}}`);
		const stylesheet = fixture(
			`${source}#target{--reset:initial;all:${fallback}}`,
		);
		expect(stylesheet.table()).toEqual(direct.table());
		const inline = fixture(source);
		inline.inline.setProperty("--reset", "initial");
		inline.inline.setProperty("all", fallback);
		expect(inline.inline.getPropertyValue("all")).toBe(fallback);
		expect(inline.table()).toEqual(direct.table());
	},
);

it("computes table values lazily and never requests unused font metrics", () => {
	const { styles, id, table, inline } = fixture("#target{font-size:1e20px}");
	const text = vi.spyOn(styles, "text");
	styles.get(id());
	styles.metrics();
	expect(text).not.toHaveBeenCalled();
	expect(table()["border-spacing"]).toBe("2px 2px");
	expect(text).not.toHaveBeenCalled();
	inline.borderSpacing = "1em";
	styles.get(id());
	expect(text).not.toHaveBeenCalled();
	expect(() => table()).toThrow();
	expect(text).toHaveBeenCalled();
});

it("resolves rem without requesting an unrelated invalid element font basis", () => {
	const { table } = fixture("#target{font-size:1e20px;border-spacing:2rem}");
	expect(table()["border-spacing"]).toBe("40px 40px");
});

it.each([svgNamespace, mathmlNamespace])(
	"does not apply HTML display, spacing or alignment hints in namespace %s",
	(namespace) => {
		const { tree, id, styles } = fixture(
			"main{border-spacing:7px;vertical-align:bottom}",
		);
		for (const tag of [
			"table",
			"thead",
			"tbody",
			"tfoot",
			"tr",
			"td",
			"th",
			"caption",
			"col",
			"colgroup",
		]) {
			const node = tree.createParserElement(tag, {}, namespace);
			tree.append(id("#parent"), node);
			expect(styles.get(node).display).toBe("inline");
			expect(styles.table(node)).toEqual({
				...initialTableStyle,
				"border-spacing": "7px 7px",
			});
			tree.setAttribute(node, "style", "display:table-row");
			expect(styles.get(node).display).toBe("table-row");
			expect(styles.table(node)["vertical-align"]).toBe("baseline");
		}
	},
);

it("keeps HTML defaults separate from author-created CSS table displays", () => {
	const { table, styles, id } = fixture(
		"main{border-spacing:7px}#target{display:table}#group{display:table-row-group}#cell{display:table-cell}",
		'<div id="target"><div id="group"><div id="cell">Cell</div></div></div>',
	);
	expect(styles.get(id()).display).toBe("table");
	for (const selector of ["#target", "#group", "#cell"])
		expect(table(selector)).toEqual({
			...initialTableStyle,
			"border-spacing": "7px 7px",
		});
});

it("rejects disconnected and closed style targets even after table values were cached", () => {
	const { tree, id, styles, table } = fixture();
	const target = id();
	table();
	tree.remove(target);
	expect(() => styles.table(target)).toThrow("not connected");
	tree.append(id("#parent"), target);
	expect(styles.table(target)["border-spacing"]).toBe("2px 2px");
	tree.close();
	expect(() => styles.table(target)).toThrow("closed");
});

it("applies HTML cell padding and header centering without touching data-cell alignment", () => {
	const { styles, id } = fixture("#target{text-align:right}");
	for (const selector of ["#header", "#cell"])
		expect(styles.box(id(selector))).toMatchObject({
			"padding-top": "1px",
			"padding-right": "1px",
			"padding-bottom": "1px",
			"padding-left": "1px",
		});
	expect(styles.text(id("#header"))["text-align"]).toBe("center");
	expect(styles.text(id("#cell"))["text-align"]).toBe("right");
});

it.each([
	["initial", "0px", "start"],
	["unset", "0px", "right"],
	["inherit", "6px", "right"],
	["revert", "1px", "center"],
])(
	"respects explicit cell padding and header alignment %s over UA defaults",
	(value, padding, alignment) => {
		const { tree, styles, id } = fixture(
			`tr{padding:6px;text-align:right}th,td{padding:${value};text-align:${value}}`,
		);
		for (const selector of ["#header", "#cell"])
			expect(styles.box(id(selector))).toMatchObject({
				"padding-top": padding,
				"padding-right": padding,
				"padding-bottom": padding,
				"padding-left": padding,
			});
		expect(styles.text(id("#header"))["text-align"]).toBe(alignment);
		tree.setAttribute(
			id("#header"),
			"style",
			"padding:3px 4px;text-align:left",
		);
		expect(styles.box(id("#header"))).toMatchObject({
			"padding-top": "3px",
			"padding-left": "4px",
		});
		expect(styles.text(id("#header"))["text-align"]).toBe("left");
	},
);

it("preserves author cell longhands, all resets and computed value fallback", () => {
	const { tree, id, styles } = fixture(
		"tr{text-align:right}th{padding:4px!important;padding-left:5px!important;text-align:left!important}td{padding-left:0}",
	);
	const header = id("#header");
	const cell = id("#cell");
	tree.setAttribute(header, "style", "padding:8px;text-align:right");
	expect(styles.box(header)).toMatchObject({
		"padding-top": "4px",
		"padding-left": "5px",
	});
	expect(styles.text(header)["text-align"]).toBe("left");
	expect(styles.box(cell)).toMatchObject({
		"padding-top": "1px",
		"padding-left": "0px",
	});
	tree.setAttribute(header, "style", "all:initial!important");
	expect(styles.box(header)["padding-left"]).toBe("0px");
	expect(styles.text(header)["text-align"]).toBe("start");
	tree.setAttribute(header, "style", "all:revert!important");
	expect(styles.box(header)["padding-left"]).toBe("1px");
	expect(styles.text(header)["text-align"]).toBe("center");
	tree.setAttribute(
		header,
		"style",
		"padding:var(--missing)!important;text-align:var(--missing)!important",
	);
	expect(styles.box(header)["padding-left"]).toBe("0px");
	expect(styles.text(header)["text-align"]).toBe("right");
});

it.each([svgNamespace, mathmlNamespace])(
	"does not seed HTML cell padding or header alignment into namespace %s",
	(namespace) => {
		const { tree, styles, id } = fixture("main{text-align:right}");
		for (const tag of ["td", "th"]) {
			const node = tree.createParserElement(tag, {}, namespace);
			tree.append(id("#parent"), node);
			expect(styles.box(node)["padding-left"]).toBe("0px");
			expect(styles.text(node)["text-align"]).toBe("right");
		}
	},
);

it("retains inherited table styles when an HTML table uses block display", () => {
	const { tree, styles, id, table } = fixture(
		"#target{display:block;border-spacing:5px;border-collapse:collapse;caption-side:bottom;empty-cells:hide}",
	);
	const block = tree.createElement("div");
	tree.append(id("#cell"), block);
	expect(styles.get(id()).display).toBe("block");
	expect(table()).toMatchObject({
		"border-spacing": "5px 5px",
		"border-collapse": "collapse",
		"caption-side": "bottom",
		"empty-cells": "hide",
	});
	expect(styles.table(block)).toMatchObject({
		"border-spacing": "5px 5px",
		"border-collapse": "collapse",
		"caption-side": "bottom",
		"empty-cells": "hide",
	});
});
