import { afterEach, expect, it } from "vitest";
import { parseCssRules } from "./css-parser.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { PageBindings } from "./page-bindings.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

interface Css {
	supports(...args: unknown[]): boolean;
}
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function fixture(sheet = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}#target{display:block;width:20px;height:10px}${sheet}</style><div id=target>Text</div>`,
		"https://fixture.invalid/supports",
	);
	trees.push(tree);
	const bindings = new PageBindings(
		{ document: tree, interactions: documentInteractions(tree) },
		{
			createHostObject(definition) {
				const target = Object.create(null);
				for (const [name, descriptor] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(target, name, descriptor);
				for (const [name, value] of Object.entries(definition.methods ?? {}))
					Object.defineProperty(target, name, { value });
				return target;
			},
			retainGuestArguments: (operation) => operation,
			releaseGuestReference: () => {},
		},
		{
			isClosed: () => false,
			startCallback: () => {
				throw new Error("No callbacks expected");
			},
			fail: () => {
				throw new Error("No lifecycle failure expected");
			},
			onConsoleCall: () => {},
		},
	);
	const target = new DocumentQueries(tree).querySelector("#target");
	if (target === null) throw new Error("Missing target");
	documentStyles(tree).setViewport(200, 100);
	return { tree, target, bindings, css: bindings.globals.CSS as Css };
}

it.each([
	["display", "flex", true],
	["display", "inline flow-root", true],
	["display", "grid", false],
	["display", "table", false],
	["position", "relative", true],
	["position", "absolute", true],
	["position", "fixed", true],
	["position", "sticky", false],
	["float", "left", false],
	["clear", "both", false],
	["overflow", "visible", true],
	["overflow", "hidden", false],
	["opacity", "0.5", false],
	["width", "calc(2px + 3px)", true],
	["width", "invalid", false],
	["width", "1px; height:2px", false],
	["WIDTH", "12px", true],
	[" width", "12px", false],
	["width ", "12px", false],
	["w\\69 dth", "12px", false],
	["border", "2px solid red", true],
	["border", "2px dashed red", true],
	["background", "url(secret.png)", true],
	["background", "url(first.png),url(second.png)", false],
	["background-size", "contain", true],
	["background-attachment", "fixed", false],
	["font-family", "monospace", true],
	["font-family", "unknown-font", true],
	["--Theme", "", true],
	["--Theme", " arbitrary(foo) ", true],
	["--Theme", "unclosed(", false],
	["width", "var(--size)", true],
	["position", "var(--position)", true],
	["unknown-property", "var(--value)", false],
	["all", "initial", true],
])(
	"queries native declaration support for %s:%s",
	(property, value, expected) => {
		expect(fixture().css.supports(property, value)).toBe(expected);
	},
);

it.each([
	["(display:flex)", true],
	["display:flex", true],
	["(display:grid)", false],
	["not (display:grid)", true],
	["(display:flex) and (width:1px)", true],
	["(display:grid) or (width:1px)", true],
	["(display:flex) and (width:broken)", false],
	["((display:grid) or (display:flex)) and (width:2px)", true],
	["(display:flex) and (width:1px) or (height:2px)", false],
	["not (display:grid) and (width:1px)", false],
	["not not (display:grid)", false],
	["NOT (DISPLAY:GRID)", true],
	["n\\6ft (display:grid)", true],
	["(display:flex) a\\6e d (width:2px)", true],
	["(w\\69 dth:2px)", true],
	["/*before*/ (display:flex) /**/and/**/ (width:2px)", true],
	["future(foo)", false],
	["not future(foo)", true],
	["selector(.known)", true],
	["(unknown words)", false],
	["(--string:'a)b')", true],
	["(--string:') and (display:grid')", true],
	["(width:2px!important)", true],
	["(width:2px!invalid)", false],
	["(width:2px; height:1px)", false],
	["(width:2px) or", false],
	["(width:2px) or (", false],
	["(width:broken) and (", false],
	["(width:2px))", false],
	["(width:2px) trailing", false],
	["(width:2px)and (height:1px)", true],
	["(width:2px) and(height:1px)", false],
	["", false],
])("evaluates the support condition %s", (source, expected) => {
	expect(fixture().css.supports(source)).toBe(expected);
});

it("converts both overload arguments before support checks and revokes methods", () => {
	const { css, tree, bindings } = fixture();
	expect(css.supports("--number", 123, Symbol("unused"))).toBe(true);
	expect(css.supports(undefined)).toBe(false);
	expect(() => css.supports()).toThrow(TypeError);
	expect(() => css.supports("unknown", Symbol("value"))).toThrow(TypeError);
	expect(() => css.supports({ toString: () => "(width:1px)" })).toThrow(
		"conversion",
	);
	const support = css.supports;
	bindings.close();
	expect(() => support("(width:1px)")).toThrow("closed");
	expect(tree.get(tree.root)).toBeDefined();
});

it("shares conditional stylesheet decisions with page feature queries and geometry", () => {
	const { tree, css, target } = fixture(
		"@supports(display:grid){#target{width:99px}}@supports not (display:grid){#target{width:60px}}",
	);
	expect(css.supports("display", "grid")).toBe(false);
	expect(documentGeometry(tree).getBoundingClientRect(target).width).toBe(60);
	expect(documentStyles(tree).metrics().issues).not.toHaveProperty(
		"unimplemented-css-at-rule",
	);
});

it("preserves source order, importance and nested media/support conditions", () => {
	const { tree, target } = fixture(
		"@supports(width:1px){@media(min-width:150px){#target{width:70px!important}}}@supports(display:flex){#target{width:40px}}",
	);
	expect(documentGeometry(tree).getBoundingClientRect(target).width).toBe(70);
	documentStyles(tree).setViewport(100, 100);
	expect(documentGeometry(tree).getBoundingClientRect(target).width).toBe(40);
});

it("ignores inactive unsupported declarations without suppressing active diagnostics", () => {
	const { tree, target } = fixture(
		"@supports(display:grid){#target{filter:blur(1px)}}@supports(width:1px){#target{unknown-prop:abc;width:50px}}",
	);
	expect(documentStyles(tree).box(target).width).toBe("50px");
	expect(
		documentStyles(tree).metrics().issues["unimplemented-css-property"],
	).toBe(1);
});

it("keeps bare declarations valid only for the CSS.supports overload", () => {
	const { tree, css, target } = fixture(
		"@supports width:1px{#target{width:99px}}",
	);
	expect(css.supports("width:1px")).toBe(true);
	expect(documentStyles(tree).box(target).width).toBe("20px");
});

it("bounds condition length, nesting and work before boolean short-circuiting", () => {
	const { css, tree } = fixture();
	const revision = tree.revision;
	expect(() => css.supports("x".repeat(65_537))).toThrow("limit");
	expect(() =>
		css.supports(`${"(".repeat(33)}width:1px${")".repeat(33)}`),
	).toThrow("limit");
	expect(() =>
		css.supports(Array(1025).fill("(width:1px)").join(" or ")),
	).toThrow("limit");
	expect(css.supports("width", "1px")).toBe(true);
	expect(tree.revision).toBe(revision);
});

it("charges inactive stylesheet contents to existing declaration and nesting quotas", () => {
	const budget = {
		rules: 0,
		declarations: 0,
		maxRules: 10,
		maxDeclarations: 1,
	};
	expect(() =>
		parseCssRules(
			"@supports(display:grid){a{width:1px;height:2px}}",
			budget,
			() => {},
		),
	).toThrow("limit");
	const nested = `${"@supports(display:grid){".repeat(18)}a{width:1px}${"}".repeat(18)}`;
	expect(() =>
		parseCssRules(
			nested,
			{ rules: 0, declarations: 0, maxRules: 100, maxDeclarations: 100 },
			() => {},
		),
	).toThrow("nesting limit");
});

it.each([
	"@su\\70 ports(width:1px)",
	"@supports(--token:'/*')",
	"@supports(--token:'a) and (b')",
])("preserves token boundaries in the stylesheet prelude %s", (prelude) => {
	const { tree, target } = fixture(`${prelude}{#target{width:55px}}`);
	expect(documentStyles(tree).box(target).width).toBe("55px");
});

it("reparses conditional style changes without freezing previous decisions", () => {
	const { tree, target } = fixture();
	const sheet = new DocumentQueries(tree).querySelector("style");
	if (sheet === null) throw new Error("Missing sheet");
	tree.setTextContent(
		sheet,
		"#target{width:20px}@supports(width:1px){#target{width:60px}}",
	);
	expect(documentStyles(tree).box(target).width).toBe("60px");
	tree.setTextContent(
		sheet,
		"#target{width:20px}@supports(display:grid){#target{width:99px}}",
	);
	expect(documentStyles(tree).box(target).width).toBe("20px");
});
