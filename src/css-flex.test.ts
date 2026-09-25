import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	cssFlexProperties,
	initialFlexStyle,
	parseFlexDeclarations,
	parseFlexValue,
	type CssFlexProperty,
} from "./css-flex.js";
import { parseInlineDeclarations, propertyValue } from "./css-declarations.js";
import type { DocumentTree } from "./document.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(css = "", content = '<span id="target">ab</span>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html{font-size:20px}#outer{font-size:10px}#target{font-size:12px}${css}</style><main id="outer">${content}</main>`,
		"https://fixture.invalid/flex-styles",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing fixture node");
		return found;
	};
	const styles = documentStyles(tree);
	const ref = (selector = "#target") => tree.reference(id(selector));
	const flex = () => styles.flex(id());
	const read = (property: string) => resolvedStyleValue(tree, id(), property);
	return { tree, id, ref, styles, flex, read };
}
function shorthand(name: string, source: string) {
	return Object.fromEntries(
		(parseFlexDeclarations(name, source) ?? []).map((entry) => [
			entry.property,
			entry.value,
		]),
	);
}

it.each([
	["none", "0", "0", "auto"],
	["auto", "1", "1", "auto"],
	["1", "1", "1", "0%"],
	["666", "666", "1", "0%"],
	["0", "0", "1", "0%"],
	["2 3", "2", "3", "0%"],
	["0 0 0", "0", "0", "0px"],
	["0px", "1", "1", "0px"],
	["10px", "1", "1", "10px"],
	["2 10px", "2", "1", "10px"],
	["10px 2", "2", "1", "10px"],
	["10px 2 3", "2", "3", "10px"],
	["2 3 10px", "2", "3", "10px"],
	["content", "1", "1", "content"],
	["min-content", "1", "1", "min-content"],
	[".5 2 calc(100% - 1em)", "0.5", "2", "calc(100% - 1em)"],
])(
	"expands flex:%s with explicit omitted-basis semantics",
	(source, grow, shrink, basis) => {
		expect(shorthand("flex", source)).toEqual({
			"flex-grow": grow,
			"flex-shrink": shrink,
			"flex-basis": basis,
		});
	},
);
it.each([
	"",
	"-1",
	"1 -1",
	"1 auto 2",
	"1 2 3",
	"1 2 3 4",
	"none 1",
	"auto auto",
	"2 initial",
	"calc(2)",
	"1e999",
	"2 -3px",
	"1 2 min(1px, 0)",
])("rejects invalid or outside-profile flex shorthand %s", (value) => {
	expect(parseFlexDeclarations("flex", value)).toBeUndefined();
});
it.each([
	["row", "row", "nowrap"],
	["wrap", "row", "wrap"],
	["wrap column", "column", "wrap"],
	["column-reverse wrap-reverse", "column-reverse", "wrap-reverse"],
])(
	"expands flex-flow:%s independently of keyword order",
	(value, direction, wrap) => {
		expect(shorthand("flex-flow", value)).toEqual({
			"flex-direction": direction,
			"flex-wrap": wrap,
		});
	},
);
it.each([
	"row column",
	"wrap wrap",
	"wrap reverse",
	"row wrap wrap",
	"row inherit",
])("rejects invalid flex-flow:%s", (value) => {
	expect(parseFlexDeclarations("flex-flow", value)).toBeUndefined();
});
it("expands gap with grouped math and rejects negative literal lengths", () => {
	expect(shorthand("gap", "calc(1em + 2px) min(10%, 2rem)")).toEqual({
		"row-gap": "calc(1em + 2px)",
		"column-gap": "min(10%, 2rem)",
	});
	expect(shorthand("gap", "normal")).toEqual({
		"row-gap": "normal",
		"column-gap": "normal",
	});
	expect(parseFlexDeclarations("gap", "-1px")).toBeUndefined();
	expect(parseFlexDeclarations("gap", "auto")).toBeUndefined();
	expect(parseFlexDeclarations("gap", "1px 2px 3px")).toBeUndefined();
});
it.each(cssFlexProperties)(
	"recognizes CSS-wide %s without making it inherited by default",
	(property) => {
		for (const keyword of ["initial", "inherit", "unset", "revert"])
			expect(parseFlexValue(property, keyword)).toBe(keyword);
		expect(fixture().flex()[property]).toBe(initialFlexStyle[property]);
	},
);
it.each([
	["order", "-2", "-2"],
	["order", "+2", "2"],
	["flex-grow", "1e2", "100"],
	["flex-shrink", "-0", "0"],
	["justify-content", "safe center", "safe center"],
	["justify-content", "space-evenly", "space-evenly"],
	["align-items", "first baseline", "baseline"],
	["align-self", "last baseline", "last baseline"],
	["align-self", "safe normal", "safe normal"],
	["align-content", "stretch", "stretch"],
])("parses %s:%s", (property, value, expected) => {
	expect(parseFlexValue(property as CssFlexProperty, value)).toBe(expected);
});
it.each([
	["order", "1.5"],
	["order", "9007199254740993"],
	["flex-grow", "-1"],
	["flex-shrink", "calc(2)"],
	["align-content", "auto"],
	["align-items", "space-between"],
	["align-items", "safe normal"],
	["justify-content", "baseline"],
	["align-self", "safe stretch"],
	["flex-basis", "none"],
	["row-gap", "2ch"],
])("rejects invalid or outside-profile %s:%s", (property, value) => {
	expect(parseFlexValue(property as CssFlexProperty, value)).toBeUndefined();
});
it("uses modern normal/auto computed alignment defaults", () => {
	const { read } = fixture();
	expect(read("justify-content")).toBe("normal");
	expect(read("align-items")).toBe("normal");
	expect(read("align-content")).toBe("normal");
	expect(read("align-self")).toBe("auto");
	expect(read("gap")).toBe("normal");
	expect(read("flex")).toBe("0 1 auto");
});
it("computes relative basis and gap leaves while preserving percentages", () => {
	const { flex } = fixture("#target{flex-basis:calc(50% - 1em);gap:1em 2rem}");
	expect(flex()).toMatchObject({
		"flex-basis": "calc(50% - 12px)",
		"row-gap": "12px",
		"column-gap": "40px",
	});
});
it("clamps a negative computed gap but retains normal as a computed keyword", () => {
	expect(fixture("#target{gap:calc(1px - 2px) normal}").flex()).toMatchObject({
		"row-gap": "0px",
		"column-gap": "normal",
	});
});
it("only computes font metrics actually required by relative flex values", () => {
	expect(
		fixture("#target{font-size:1e20px;flex-basis:2rem}").flex()["flex-basis"],
	).toBe("40px");
	expect(
		fixture("#target{font-size:1e20px;flex-basis:2px}").flex()["flex-basis"],
	).toBe("2px");
	expect(() =>
		fixture("#target{font-size:1e20px;flex-basis:2em}").flex(),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});
it("inherits computed values without re-resolving the parent's em units", () => {
	const { flex } = fixture(
		"#outer{flex:2 3 2em;gap:1em}#target{flex:inherit;gap:inherit}",
	);
	expect(flex()).toMatchObject({
		"flex-grow": "2",
		"flex-shrink": "3",
		"flex-basis": "20px",
		"row-gap": "10px",
		"column-gap": "10px",
	});
	expect(fixture("#outer{flex:2;gap:10px}").flex()).toEqual(initialFlexStyle);
});
it("substitutes variable shorthands before parsing and uses unset on invalid-at-computed-value", () => {
	const valid = fixture(
		"#outer{--flex:2 3 1em;--gap:calc(1px + 2px)}#target{flex:var(--flex);gap:var(--gap)}",
	);
	expect(valid.flex()).toMatchObject({
		"flex-grow": "2",
		"flex-shrink": "3",
		"flex-basis": "12px",
		"row-gap": "3px",
	});
	const invalid = fixture(
		"#target{flex:2 3 4px;--bad:1 auto 2;flex:var(--bad)}",
	);
	expect(invalid.flex()).toEqual(initialFlexStyle);
});
it("honors importance, source order and all resets for flex longhands", () => {
	expect(
		fixture(
			"#target{flex:2 3 4px!important;flex-grow:9;gap:8px;all:initial;flex-shrink:7!important}",
		).flex(),
	).toMatchObject({
		"flex-grow": "2",
		"flex-shrink": "7",
		"flex-basis": "4px",
		"row-gap": "normal",
	});
});
it("invalidates flex style caches after inline, ancestor-font and viewport changes", () => {
	const { tree, id, styles, flex } = fixture("#target{flex:1 1 2rem;gap:1vw}");
	styles.setViewport(200, 100);
	expect(flex()).toMatchObject({ "flex-basis": "40px", "row-gap": "2px" });
	tree.setAttribute(id("html"), "style", "font-size:30px");
	styles.setViewport(400, 100);
	expect(flex()).toMatchObject({ "flex-basis": "60px", "row-gap": "4px" });
	tree.setAttribute(id(), "style", "flex:0 0 10px");
	expect(flex()["flex-basis"]).toBe("10px");
});
it("serializes authored flex declarations and preserves pending variable shorthands", () => {
	const entries = parseInlineDeclarations(
		"flex:2 3 4px;gap:10px;flex-flow:wrap column",
		100,
	);
	expect(propertyValue(entries, "flex")).toBe("2 3 4px");
	expect(propertyValue(entries, "gap")).toBe("10px");
	expect(propertyValue(entries, "flex-flow")).toBe("column wrap");
	const pending = parseInlineDeclarations("flex:var(--flex)", 100);
	expect(propertyValue(pending, "flex")).toBe("var(--flex)");
	expect(propertyValue(pending, "flex-basis")).toBe("");
	expect(
		propertyValue(
			parseInlineDeclarations("flex:1;flex-grow:2!important", 100),
			"flex",
		),
	).toBe("");
});
it.each([
	["inline", "block"],
	["inline-block", "block"],
	["inline flow-root", "block"],
	["inline-table", "table"],
	["inline-flex", "flex"],
	["inline-grid", "grid"],
	["table-cell", "block"],
	["flow-root", "flow-root"],
	["none", "none"],
	["contents", "contents"],
])("computes flex-item blockification %s -> %s", (display, expected) => {
	expect(
		fixture(`#outer{display:flex}#target{display:${display}}`).read("display"),
	).toBe(expected);
});
it("blockifies children through display:contents but not through a real intervening box", () => {
	const { styles, id } = fixture(
		"#outer{display:flex}#flat{display:contents}",
		'<section id="flat"><span id="target">a</span></section><section id="box"><span id="inner">b</span></section>',
	);
	expect(styles.get(id()).display).toBe("block");
	expect(styles.get(id("#inner")).display).toBe("inline");
});
it("updates blockification after parent display changes or reparenting", () => {
	const { tree, id, read } = fixture("#outer{display:flex}");
	expect(read("display")).toBe("block");
	tree.setAttribute(id("#outer"), "style", "display:block");
	expect(read("display")).toBe("inline");
	tree.setAttribute(id("#outer"), "style", "display:flex");
	tree.append(id("body"), id());
	expect(read("display")).toBe("inline");
});
it("forms independent element items and anonymous text items while retaining the render guard", () => {
	const { tree, ref } = fixture(
		"#outer{display:flex}",
		'first<!-- ignored --> text<span id="target">inner<div>block</div>tail</span>last',
	);
	const formatting = buildFormattingTree(tree);
	const outer = formatting.nodes.find((node) => node.ref === ref("#outer"));
	expect(outer).toMatchObject({
		kind: "deferred",
		contentMode: "flex",
		independentContext: true,
		flex: initialFlexStyle,
	});
	const items = outer?.children.map((id) => formatting.nodes[id]);
	expect(items).toHaveLength(3);
	expect(items?.map((node) => node.kind)).toEqual([
		"anonymous-block",
		"block",
		"anonymous-block",
	]);
	for (const node of items ?? [])
		expect(node).toMatchObject({
			parent: outer?.id,
			flexItem: true,
			independentContext: true,
		});
	expect(items?.[1].children.length).toBeGreaterThan(1);
	expect(() => resolveDocumentBlockWidths(tree)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	const measured = measureIntrinsicWidths(tree);
	for (const item of items ?? [])
		expect(measured.widths.some((width) => width.id === item.id)).toBe(true);
});
it("suppresses whitespace-only anonymous items, including preformatted whitespace, but not NBSP", () => {
	const { tree, ref } = fixture(
		"#outer{display:flex;white-space:pre}",
		' \t\n <span id="target">a</span> \n <span style="display:none">gone</span> &nbsp;',
	);
	const formatting = buildFormattingTree(tree);
	const outer = formatting.nodes.find((node) => node.ref === ref("#outer"));
	expect(outer?.children).toHaveLength(2);
	expect(formatting.nodes[outer?.children[1] as number].kind).toBe(
		"anonymous-block",
	);
});
it("preserves source order separately from stable order-modified item order", () => {
	const { tree, ref } = fixture(
		"#outer{display:flex}#target{order:2}#second{order:-1}#third{order:-1}",
		'<span id="target">a</span><span id="second">b</span><span id="third">c</span>text',
	);
	const formatting = buildFormattingTree(tree);
	const outer = formatting.nodes.find((node) => node.ref === ref("#outer"));
	expect(outer?.children.map((id) => formatting.nodes[id].ref)).toEqual([
		ref(),
		ref("#second"),
		ref("#third"),
		undefined,
	]);
	expect(
		outer?.orderModifiedChildren?.map((id) => formatting.nodes[id].ref),
	).toEqual([ref("#second"), ref("#third"), undefined, ref()]);
	expect(Object.isFrozen(outer?.orderModifiedChildren)).toBe(true);
});
it("retains nested flex containers and controls as real item records, not synthetic DOM nodes", () => {
	const { tree, ref } = fixture(
		"#outer{display:flex}#nested{display:inline-flex}",
		'<section id="nested"><button id="target">a</button></section>',
	);
	const nodeCount = tree.nodeCount;
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.find((node) => node.ref === ref("#nested")),
	).toMatchObject({
		kind: "deferred",
		display: "flex",
		flexItem: true,
		contentMode: "flex",
	});
	expect(formatting.nodes.find((node) => node.ref === ref())).toMatchObject({
		kind: "replaced",
		flexItem: true,
		level: "block",
		control: { kind: "button" },
	});
	expect(tree.nodeCount).toBe(nodeCount);
});
it("bounds retained item formation using the existing formatting work and box limits", () => {
	const { tree } = fixture(
		"#outer{display:flex}",
		Array.from({ length: 20 }, () => "text<span>a</span>").join(""),
	);
	expect(() => buildFormattingTree(tree, { maxBoxes: 10 })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => buildFormattingTree(tree, { maxWork: 10 })).toThrowError(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(buildFormattingTree(tree).metrics.deferredSubtrees).toBe(1);
});
it("does not accidentally enable unsupported content alignment on ordinary blocks", () => {
	const { tree } = fixture("#outer{align-content:center}");
	expect(
		buildFormattingTree(tree).issues["block-content-alignment-not-supported"],
	).toBe(1);
	expect(() => resolveDocumentBlockWidths(tree)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
});
it("exposes computed property support separately from rendering capability", async () => {
	const host = new BrowserCommandHost({
		createSession: () => {
			throw new Error("No session expected");
		},
	});
	try {
		expect((await host.execute(["capabilities"])).data).toMatchObject({
			flexStyles: {
				partial: true,
				properties: cssFlexProperties,
				omittedShorthandBasis: "0%",
				layout: true,
				layoutProfile: "block-and-inline-flex-containers",
				nestedFlex: true,
				column: true,
				columnWrap: true,
				inlineFlex: true,
			},
		});
	} finally {
		host.close();
	}
});
