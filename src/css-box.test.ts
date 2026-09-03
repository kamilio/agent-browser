import { afterEach, expect, it } from "vitest";
import { cssBoxProperties, initialBoxStyle } from "./css-box.js";
import { parseCssDeclarations } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
function fixture(
	css = "",
	markup = '<div id="outer"><div id="target"></div></div>',
) {
	const tree = parseHtmlDocument(
		`<style>${css}</style>${markup}`,
		"https://example.com/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const styles = documentStyles(tree);
	const id = (selector = "#target") => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error("Missing fixture element");
		return result;
	};
	return {
		tree,
		styles,
		id,
		box: (selector = "#target") => styles.box(id(selector)),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("keeps initial box values immutable, shared and separate from visibility/geometry", () => {
	const { box, styles, id } = fixture();
	expect(box()).toBe(initialBoxStyle);
	expect(box("#outer")).toBe(box());
	expect(Object.isFrozen(box())).toBe(true);
	expect(box()).toMatchObject({
		width: "auto",
		height: "auto",
		"min-width": "auto",
		"max-height": "none",
		"padding-left": "0px",
		"box-sizing": "content-box",
	});
	expect(styles.get(id())).toEqual({
		display: "block",
		visibility: "visible",
		displayed: true,
		visible: true,
	});
	expect(styles.metrics()).toMatchObject({
		layout: false,
		boxProperties: cssBoxProperties,
		boxValues: "computed-subset-not-used-geometry",
	});
});

it("cascades box properties by specificity, source order, inline priority and importance", () => {
	const { tree, id, box } = fixture(
		"div {width: 1px} #target {width: 2px; padding: 3px!important} div {width: 4px!important; padding-left: 20px}",
	);
	tree.setAttribute(id(), "style", "width:5px; padding-left:6px!important");
	expect(box()).toMatchObject({
		width: "4px",
		"padding-left": "6px",
		"padding-right": "3px",
	});
	tree.setAttribute(id(), "style", "width:7px!important");
	expect(box().width).toBe("7px");
});

it.each([
	["1px", ["1px", "1px", "1px", "1px"]],
	["1px 2%", ["1px", "2%", "1px", "2%"]],
	["1px 2px 3px", ["1px", "2px", "3px", "2px"]],
	["1px 2px 3px 4px", ["1px", "2px", "3px", "4px"]],
])(
	"expands margin/padding shorthand %s in physical side order",
	(value, expected) => {
		const { box } = fixture(`#target { margin:${value}; padding:${value} }`);
		for (const property of ["margin", "padding"])
			expect(
				["top", "right", "bottom", "left"].map(
					(side) =>
						box()[`${property}-${side}` as keyof typeof initialBoxStyle],
				),
			).toEqual(expected);
	},
);

it("rejects an entire invalid shorthand rather than changing valid individual sides", () => {
	const { box } = fixture(
		"#target {padding: 3px; padding: 1px -2px; margin: 4px; margin: inherit 2px; padding: auto; margin: 1px 2px 3px 4px 5px}",
	);
	expect(box()).toMatchObject({
		"padding-top": "3px",
		"padding-left": "3px",
		"margin-left": "4px",
	});
});

it("preserves longhand/shorthand source order and important overrides", () => {
	const { box } = fixture(
		"#target {margin-left: 1px; margin: 2px 3px; margin-top: 4px!important; margin:5px; padding:1px!important; padding-left:2px}",
	);
	expect(box()).toMatchObject({
		"margin-top": "4px",
		"margin-left": "5px",
		"padding-left": "1px",
	});
});

it("inherits computed lengths and preserves unresolved percentages", () => {
	const { box } = fixture(
		"#outer {width:2in; height:30%; padding:2pt; margin:10%} #target {width:inherit; height:inherit; padding:inherit; margin:inherit}",
	);
	expect(box()).toMatchObject({
		width: "192px",
		height: "30%",
		"padding-left": `${(2 * 96) / 72}px`,
		"margin-left": "10%",
	});
});

it.each(["initial", "unset", "revert"])(
	"resets non-inherited box properties with %s",
	(keyword) => {
		const { box } = fixture(
			`#outer {width:60px; padding:50px} #target {width:20px; padding:10px; all:${keyword}}`,
		);
		expect(box()).toEqual(initialBoxStyle);
	},
);

it("expands all with priority and leaves later longhands in control", () => {
	const { box } = fixture(
		"#target {width:42px!important; all:initial!important; height:15px; width:21px!important}",
	);
	expect(box()).toMatchObject({ width: "21px", height: "auto" });
});

it("all:inherit uses the parent's computed box values without making ordinary defaults inherited", () => {
	const { tree, id, box } = fixture(
		"#outer {width:120px; padding:10px; box-sizing:border-box}",
	);
	expect(box()).toEqual(initialBoxStyle);
	tree.setAttribute(id(), "style", "all:inherit");
	expect(box()).toEqual(box("#outer"));
});

it.each([
	["1in", 96],
	["2.54cm", 96],
	["25.4mm", 96],
	["101.6q", 96],
	["72pt", 96],
	["6pc", 96],
	["1e2px", 100],
	["-.5px", -0.5],
	["-0", 0],
])("computes absolute margin length %s in CSS pixels", (value, expected) => {
	const { box } = fixture(`#target {margin-left:${value}}`);
	expect(Number.parseFloat(box()["margin-left"])).toBeCloseTo(
		Number(expected),
		10,
	);
	expect(box()["margin-left"].endsWith("px")).toBe(true);
});

it("recomputes viewport units and media rules on logical viewport changes", () => {
	const { styles, box } = fixture(
		"#target {width:50vw; height:25vh; margin:1vmin 1vmax} @media(max-width:400px) {#target {padding:2px}}",
	);
	expect(box()).toMatchObject({
		width: "640px",
		height: "180px",
		"margin-top": "7.2px",
		"margin-left": "12.8px",
		"padding-top": "0px",
	});
	styles.setViewport(320, 600);
	expect(box()).toMatchObject({
		width: "160px",
		height: "150px",
		"margin-top": "3.2px",
		"margin-left": "6px",
		"padding-top": "2px",
	});
});

it("keeps percentages and auto/none unresolved instead of inventing used geometry", () => {
	const { box } = fixture(
		"#outer {width:200px} #target {width:50%; height:auto; min-width:auto; max-width:none; margin:auto; padding:10%}",
	);
	expect(box()).toMatchObject({
		width: "50%",
		height: "auto",
		"min-width": "auto",
		"max-width": "none",
		"margin-left": "auto",
		"padding-top": "10%",
	});
});

it("ignores unsupported font-relative/function values and invalid numeric syntax with diagnostics", () => {
	const { styles, box } = fixture(
		"#target {width:12px; width:1em; width:calc(100% - 1px); width:1.px; width:NaNpx; width:1e999px; width:2; width:-1px; padding:-2%; min-width:none; max-width:auto}",
	);
	expect(box().width).toBe("12px");
	expect(box()["padding-top"]).toBe("0px");
	expect(styles.metrics().issues["unimplemented-or-invalid-css-value"]).toBe(
		10,
	);
});

it("applies linked stylesheet declarations through the existing sheet owner without fetching", () => {
	const { styles, id, box } = fixture(
		"",
		'<link id="sheet" rel="stylesheet" href="/size.css"><div id="target"></div>',
	);
	styles.setExternalSheet(
		id("#sheet"),
		"https://example.com/size.css",
		"#target {width:250px; padding:4px}",
	);
	expect(box()).toMatchObject({ width: "250px", "padding-left": "4px" });
});

it("invalidates inherited cached values for parent mutation and element moves", () => {
	const { tree, id, box } = fixture(
		"#outer {width:10px} aside {width:20px} #target {width:inherit}",
		'<div id="outer"><div id="target"></div></div><aside></aside>',
	);
	const saved = box();
	tree.setAttribute(id("#outer"), "style", "width:30px");
	expect(box().width).toBe("30px");
	expect(saved.width).toBe("10px");
	tree.append(id("aside"), id());
	expect(box().width).toBe("20px");
});

it("allocates box results lazily and retains them across unrelated control values", () => {
	const { tree, styles, id, box } = fixture(
		"#target {width:10px}",
		'<input id="target">',
	);
	styles.metrics();
	expect(
		(Reflect.get(styles, "boxComputed") as Map<number, unknown>).size,
	).toBe(0);
	const saved = box();
	tree.setControl(id(), { value: "changed" });
	expect(box()).toBe(saved);
});

it("rejects detached/closed reads and clears both specified and computed caches on close", () => {
	const { tree, styles, id, box } = fixture("#target {width:20px}");
	const target = id();
	const saved = box();
	tree.remove(target);
	expect(() => styles.box(target)).toThrow("not connected");
	tree.close();
	expect(() => styles.box(target)).toThrow("closed");
	expect(saved.width).toBe("20px");
	expect(
		(Reflect.get(styles, "boxSpecified") as Map<number, unknown>).size,
	).toBe(0);
	expect(
		(Reflect.get(styles, "boxComputed") as Map<number, unknown>).size,
	).toBe(0);
});

it("does not expose infinite computed lengths and can recover after the source is repaired", () => {
	const { tree, id, box } = fixture("#target {width:1e308in}");
	expect(() => box()).toThrow("length overflow");
	tree.setAttribute(id(), "style", "width:10px");
	expect(box().width).toBe("10px");
});

it("charges expanded box declarations to cascade work and keeps statement quotas", () => {
	const { tree, id } = fixture("#target {all:initial}");
	const styles = new DocumentStyles(tree, { maxWork: 5 });
	expect(() => styles.box(id())).toThrow("work limit");
	const budget = { rules: 0, declarations: 0, maxRules: 2, maxDeclarations: 1 };
	expect(parseCssDeclarations("padding:1px", budget, () => {})).toHaveLength(4);
	expect(() => parseCssDeclarations("margin:2px", budget, () => {})).toThrow(
		"declaration limit",
	);
});
